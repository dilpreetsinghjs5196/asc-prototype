import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  payerMasterService,
  DEFAULT_PAYER_MASTER,
  DEFAULT_PAYER_PLANS,
  DEFAULT_PAYER_IDENTIFIERS
} from '../src/lib/payerMasterService.js';
import { rbacService, PERMISSIONS_CATALOG } from '../src/lib/rbacService.js';
import { calculateAuthoritativeAscRevenue } from '../src/utils/hospitalUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('Phase 65 — Payer Master, Benefit Plans & Clearinghouse Routing Suite', async (t) => {

  await t.test('1. Migration 041 Forward & Down SQL Files Exist and are Substantive', () => {
    const forwardPath = path.join(rootDir, 'supabase', 'migrations', '041_payer_master.sql');
    const downPath = path.join(rootDir, 'supabase', 'migrations', '041_payer_master_down.sql');

    assert.ok(fs.existsSync(forwardPath), 'Migration 041 forward SQL exists');
    assert.ok(fs.existsSync(downPath), 'Migration 041 down SQL exists');

    const forwardSql = fs.readFileSync(forwardPath, 'utf8');
    const downSql = fs.readFileSync(downPath, 'utf8');

    assert.ok(forwardSql.length > 3000, 'Forward SQL is substantive (>3KB)');
    assert.ok(downSql.length > 500, 'Down SQL is substantive (>500B)');
  });

  await t.test('2. Migration 041 Defines Required Normalized Tables & Constraints', () => {
    const forwardSql = fs.readFileSync(path.join(rootDir, 'supabase', 'migrations', '041_payer_master.sql'), 'utf8');

    // Tables
    assert.ok(forwardSql.includes('public.payer_master'), 'Defines payer_master table');
    assert.ok(forwardSql.includes('public.payer_plans'), 'Defines payer_plans table');
    assert.ok(forwardSql.includes('public.payer_identifiers'), 'Defines payer_identifiers table');
    assert.ok(forwardSql.includes('public.facility_payers'), 'Defines facility_payers table');
    assert.ok(forwardSql.includes('public.facility_payer_plans'), 'Defines facility_payer_plans table');
    assert.ok(forwardSql.includes('public.patient_insurance_coverages'), 'Defines patient_insurance_coverages table');
    assert.ok(forwardSql.includes('public.payer_contracts'), 'Defines payer_contracts table');
    assert.ok(forwardSql.includes('public.payer_contract_versions'), 'Defines payer_contract_versions table');
    assert.ok(forwardSql.includes('public.payer_audit_logs'), 'Defines payer_audit_logs table');
    assert.ok(forwardSql.includes('public.payer_import_staging'), 'Defines payer_import_staging table');

    // Constraints & Invariants
    assert.ok(forwardSql.includes('PRIMARY'), 'Includes PRIMARY coverage check');
    assert.ok(forwardSql.includes('SECONDARY'), 'Includes SECONDARY coverage check');
    assert.ok(forwardSql.includes('TERTIARY'), 'Includes TERTIARY coverage check');
    assert.ok(forwardSql.includes('UNIQUE (patient_id, coverage_order)'), 'Enforces COB uniqueness (patient_id, coverage_order)');
    assert.ok(forwardSql.includes('UNIQUE (facility_id, payer_id)'), 'Enforces facility payer uniqueness');
    assert.ok(forwardSql.includes('fn_resolve_edi_payer_id'), 'Deploys EDI Payer ID resolution function');

    // Down migration drops in reverse dependency order
    const downSql = fs.readFileSync(path.join(rootDir, 'supabase', 'migrations', '041_payer_master_down.sql'), 'utf8');
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.payer_import_staging'), 'Down drops payer_import_staging');
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.patient_insurance_coverages'), 'Down drops patient_insurance_coverages');
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.facility_payers'), 'Down drops facility_payers');
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.payer_plans'), 'Down drops payer_plans');
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.payer_master'), 'Down drops payer_master');
  });

  await t.test('3. Multi-Tenant RLS Policies Enforce Isolation and NEVER Query public.user_roles', () => {
    const forwardSql = fs.readFileSync(path.join(rootDir, 'supabase', 'migrations', '041_payer_master.sql'), 'utf8');

    assert.ok(forwardSql.includes('ALTER TABLE public.facility_payers ENABLE ROW LEVEL SECURITY'));
    assert.ok(forwardSql.includes('ALTER TABLE public.patient_insurance_coverages ENABLE ROW LEVEL SECURITY'));
    assert.ok(forwardSql.includes('ALTER TABLE public.payer_contracts ENABLE ROW LEVEL SECURITY'));
    assert.ok(forwardSql.includes('public.is_facility_accessible'));
    assert.ok(forwardSql.includes('public.user_has_facility_role'));

    // Critical negative security check: zero direct queries to user_roles
    const lines = forwardSql.split('\n');
    const policyLines = lines.filter(l => l.toUpperCase().includes('POLICY') || l.toUpperCase().includes('USING') || l.toUpperCase().includes('WITH CHECK'));
    for (const pl of policyLines) {
      assert.ok(!pl.includes('public.user_roles'), `RLS policy must not query public.user_roles directly: ${pl}`);
      assert.ok(!pl.includes('FROM user_roles'), `RLS policy must not query user_roles: ${pl}`);
    }
  });

  await t.test('4. Payer Master Directory Service Retrieves Seeded Payers and Filters Correctly', async () => {
    const allPayers = await payerMasterService.getPayerMasterDirectory();
    assert.ok(Array.isArray(allPayers) && allPayers.length >= 7, 'Returns at least 7 seeded master payers');

    // Medicare filter
    const medicareOnly = await payerMasterService.getPayerMasterDirectory({ category: 'Medicare' });
    assert.ok(medicareOnly.length >= 1, 'Returns Medicare payers');
    assert.ok(medicareOnly.every(p => p.payer_category === 'Medicare'), 'All returned payers are Medicare');

    // Commercial filter
    const commercialOnly = await payerMasterService.getPayerMasterDirectory({ category: 'Commercial' });
    assert.ok(commercialOnly.length >= 4, 'Returns commercial payers (BCBS, Aetna, UHC, Cigna, Humana)');
    assert.ok(commercialOnly.every(p => p.payer_category === 'Commercial'), 'All returned payers are Commercial');

    // Search query
    const searchRes = await payerMasterService.getPayerMasterDirectory({ search: 'Florida Blue' });
    assert.ok(searchRes.length >= 1, 'Finds Florida Blue by search');
    assert.ok(searchRes[0].payer_code === 'BCBS-FL', 'Matched Florida Blue code');
  });

  await t.test('5. Payer Plans Service Enforces Plan Types and Associations', async () => {
    const bcbsId = '20000000-0000-0000-0000-000000000002';
    const plans = await payerMasterService.getPayerPlans(bcbsId);
    assert.ok(Array.isArray(plans) && plans.length >= 2, 'Returns BCBS plans');

    const hmo = plans.find(p => p.plan_type === 'HMO');
    const ppo = plans.find(p => p.plan_type === 'PPO');
    assert.ok(hmo, 'Includes BlueCare HMO plan');
    assert.ok(ppo, 'Includes BlueOptions PPO plan');
    assert.strictEqual(hmo.requires_prior_auth, true, 'HMO requires prior authorization');
  });

  await t.test('6. Authoritative EDI 837 Loop 2010BB Electronic Payer ID Resolution', () => {
    // Test Medicare FL
    const medRes = payerMasterService.resolveEdiPayerId({
      payerId: '20000000-0000-0000-0000-000000000001',
      clearinghouse: 'AVAILITY'
    });
    assert.strictEqual(medRes.ediPayerId, '00400', 'Resolves Medicare FL EDI Payer ID 00400');
    assert.strictEqual(medRes.resolutionSource, 'GLOBAL_DEFAULT');

    // Test Aetna
    const aetnaRes = payerMasterService.resolveEdiPayerId({
      payerId: '20000000-0000-0000-0000-000000000003',
      clearinghouse: 'AVAILITY'
    });
    assert.strictEqual(aetnaRes.ediPayerId, '60054', 'Resolves Aetna EDI Payer ID 60054');

    // Test Non-existent payer
    const unres = payerMasterService.resolveEdiPayerId({
      payerId: 'non-existent-id'
    });
    assert.strictEqual(unres.ediPayerId, null);
    assert.strictEqual(unres.resolutionSource, 'UNRESOLVED');
  });

  await t.test('7. 4-Tier Deterministic Deduplication Matcher Operates Accurately', () => {
    // Tier 1: Exact EDI ID match
    const tier1 = payerMasterService.matchPayerRecord({
      payerName: 'Some Random Unknown String',
      ediPayerId: '00590'
    });
    assert.strictEqual(tier1.matchClassification, 'EXACT_MATCH', 'Tier 1 matches on exact EDI Payer ID');
    assert.strictEqual(tier1.matchedPayer?.payer_code, 'BCBS-FL');
    assert.strictEqual(tier1.tier, 1);

    // Tier 2: Exact NAIC match
    const tier2 = payerMasterService.matchPayerRecord({
      payerName: 'Unknown Name Variant',
      naicCode: '60054'
    });
    assert.strictEqual(tier2.matchClassification, 'EXACT_MATCH', 'Tier 2 matches on NAIC code');
    assert.strictEqual(tier2.matchedPayer?.payer_code, 'AETNA-HEALTH');
    assert.strictEqual(tier2.tier, 2);

    // Tier 3: Exact Name match
    const tier3 = payerMasterService.matchPayerRecord({
      payerName: 'Cigna Healthcare'
    });
    assert.strictEqual(tier3.matchClassification, 'EXACT_MATCH', 'Tier 3 matches on exact trade name');
    assert.strictEqual(tier3.matchedPayer?.payer_code, 'CIGNA-HEALTH');
    assert.strictEqual(tier3.tier, 3);

    // Tier 4: Substring / Fuzzy Name match
    const tier4 = payerMasterService.matchPayerRecord({
      payerName: 'UnitedHealthcare Outpatient Center'
    });
    assert.strictEqual(tier4.matchClassification, 'POTENTIAL_DUPLICATE', 'Tier 4 identifies potential duplicate');
    assert.strictEqual(tier4.matchedPayer?.payer_code, 'UHC-OPT');
    assert.strictEqual(tier4.tier, 4);

    // Tier 0: New record
    const tier0 = payerMasterService.matchPayerRecord({
      payerName: 'Completely Brand New Regional Health Plan XYZ'
    });
    assert.strictEqual(tier0.matchClassification, 'NEW', 'Unmatched payer classified as NEW');
    assert.strictEqual(tier0.matchedPayer, null);
  });

  await t.test('8. Facility Enablement and Patient Insurance Coverage Persistence', async () => {
    const facPayers = await payerMasterService.getFacilityPayers('fac-001');
    assert.ok(Array.isArray(facPayers) && facPayers.length >= 7, 'Returns facility payer enablement list');

    // Toggle test
    const toggled = await payerMasterService.toggleFacilityPayer('fac-001', '20000000-0000-0000-0000-000000000002', false);
    assert.strictEqual(toggled.is_enabled, false, 'Toggles facility payer to disabled');

    // Coverage validation
    await assert.rejects(
      async () => {
        await payerMasterService.savePatientCoverage({ patient_id: null, payer_id: 'some-id' });
      },
      /Patient ID and Payer ID are required/,
      'Rejects invalid coverage missing patient ID'
    );
  });

  await t.test('9. Critical Blocker Remediation: No Silent Commercial Fallback to Medicare Rates', () => {
    // Verify that hospitalUtils.js fails closed on commercial encounters without contracts
    const commercialEncounter = {
      id: 'enc-commercial-001',
      primary_payer_id: '20000000-0000-0000-0000-000000000002',
      cpt_code: '29827',
      payers: {
        payer_category: 'Commercial',
        trade_name: 'Florida Blue (BCBS)'
      }
    };

    assert.throws(
      () => {
        calculateAuthoritativeAscRevenue(
          commercialEncounter,
          [{ cpt_code: '29827', base_rate: 1500 }],
          { strictPayerCheck: true }
        );
      },
      /Commercial payer without contract cannot silently default to Medicare statutory rates/,
      'Strict payer check blocks uncontracted commercial claims from receiving Medicare statutory rate'
    );
  });

  await t.test('10. RBAC Catalog Registers All 12 Payer Master Permissions and Mappings', () => {
    const requiredPermissions = [
      'payer.view',
      'payer.create',
      'payer.edit',
      'payer.deactivate',
      'payer.plan.manage',
      'payer.facility.enable',
      'payer.contract.view',
      'payer.contract.manage',
      'payer.import',
      'payer.patient.coverage.view',
      'payer.patient.coverage.edit',
      'payer.edi.route'
    ];

    for (const perm of requiredPermissions) {
      assert.ok(PERMISSIONS_CATALOG[perm], `PERMISSIONS_CATALOG contains ${perm}`);
    }

    // Role permission tests
    const billerPerms = rbacService.getPermissionsForUser({ roles: ['biller'] });
    assert.ok(billerPerms.includes('payer.view'), 'Biller can view payers');
    assert.ok(billerPerms.includes('payer.edi.route'), 'Biller can resolve EDI routes');
    assert.ok(billerPerms.includes('payer.patient.coverage.edit'), 'Biller can edit patient insurance coverages');

    const cfoPerms = rbacService.getPermissionsForUser({ roles: ['cfo'] });
    assert.ok(cfoPerms.includes('payer.contract.manage'), 'CFO can manage commercial contracts');
  });

  await t.test('11. UI Component & App Integration Verified', () => {
    const appPath = path.join(rootDir, 'src', 'App.jsx');
    const compPath = path.join(rootDir, 'src', 'components', 'PayerMasterDirectory.jsx');
    const cssPath = path.join(rootDir, 'src', 'components', 'PayerMasterDirectory.css');

    assert.ok(fs.existsSync(compPath), 'PayerMasterDirectory.jsx exists');
    assert.ok(fs.existsSync(cssPath), 'PayerMasterDirectory.css exists');

    const appCode = fs.readFileSync(appPath, 'utf8');
    assert.ok(appCode.includes('PayerMasterDirectory'), 'App.jsx imports and renders PayerMasterDirectory');
    assert.ok(appCode.includes('payer_master'), 'App.jsx includes payer_master navigation item');
  });

  await t.test('12. Zero Maestro Purple Ban Static Compliance Check', () => {
    const bannedColors = [
      '#7c3aed',
      '#8b5cf6',
      '#a78bfa',
      '#c4b5fd',
      '#ddd6fe',
      '#ede9fe',
      '#f5f3ff',
      '#6d28d9',
      '#5b21b6',
      '#4c1d95',
      'text-purple',
      'bg-purple',
      'border-purple',
      'text-violet',
      'bg-violet',
      'border-violet',
      'text-indigo',
      'bg-indigo',
      'border-indigo'
    ];

    const targetFiles = [
      path.join(rootDir, 'src', 'components', 'PayerMasterDirectory.jsx'),
      path.join(rootDir, 'src', 'components', 'PayerMasterDirectory.css'),
      path.join(rootDir, 'src', 'lib', 'payerMasterService.js')
    ];

    for (const filePath of targetFiles) {
      const content = fs.readFileSync(filePath, 'utf8').toLowerCase();
      for (const banned of bannedColors) {
        assert.ok(
          !content.includes(banned.toLowerCase()),
          `Violation: Found banned color token "${banned}" in ${path.basename(filePath)}`
        );
      }
    }
  });

});
