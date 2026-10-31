import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  payerContractService,
  DEFAULT_PAYER_CONTRACTS,
  DEFAULT_CONTRACT_VERSIONS,
  DEFAULT_CONTRACT_TERMS
} from '../src/lib/payerContractService.js';
import { rbacService, PERMISSIONS_CATALOG } from '../src/lib/rbacService.js';
import { calculateAuthoritativeAscRevenue } from '../src/utils/hospitalUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('Phase 66 — Payer Contract Model & Commercial Reimbursement Suite', async (t) => {

  await t.test('1. Migration 042 Forward & Down SQL Files Exist and are Substantive', () => {
    const forwardPath = path.join(rootDir, 'supabase', 'migrations', '042_payer_contract_model.sql');
    const downPath = path.join(rootDir, 'supabase', 'migrations', '042_payer_contract_model_down.sql');

    assert.ok(fs.existsSync(forwardPath), 'Migration 042 forward SQL exists');
    assert.ok(fs.existsSync(downPath), 'Migration 042 down SQL exists');

    const forwardSql = fs.readFileSync(forwardPath, 'utf8');
    const downSql = fs.readFileSync(downPath, 'utf8');

    assert.ok(forwardSql.length > 3500, 'Forward SQL is substantive (>3.5KB)');
    assert.ok(downSql.length > 500, 'Down SQL is substantive (>500B)');
  });

  await t.test('2. Migration 042 Defines Required Normalized Entities, Invariants & Triggers', () => {
    const forwardSql = fs.readFileSync(path.join(rootDir, 'supabase', 'migrations', '042_payer_contract_model.sql'), 'utf8');

    // Refactored tables
    assert.ok(forwardSql.includes('organization_id UUID'), 'Expands payer_contracts with organization_id');
    assert.ok(forwardSql.includes('scope_mode VARCHAR(30)'), 'Adds scope_mode to payer_contracts');
    assert.ok(forwardSql.includes('is_locked BOOLEAN'), 'Adds is_locked to payer_contract_versions');
    assert.ok(forwardSql.includes('version_hash VARCHAR(64)'), 'Adds version_hash to payer_contract_versions');

    // New tables
    assert.ok(forwardSql.includes('public.payer_contract_facility_scopes'), 'Creates payer_contract_facility_scopes');
    assert.ok(forwardSql.includes('public.payer_contract_plan_scopes'), 'Creates payer_contract_plan_scopes');
    assert.ok(forwardSql.includes('public.payer_contract_service_scopes'), 'Creates payer_contract_service_scopes');
    assert.ok(forwardSql.includes('public.payer_contract_terms'), 'Creates payer_contract_terms');
    assert.ok(forwardSql.includes('public.payer_contract_documents'), 'Creates payer_contract_documents');
    assert.ok(forwardSql.includes('public.payer_contract_amendments'), 'Creates payer_contract_amendments');
    assert.ok(forwardSql.includes('public.payer_contract_approvals'), 'Creates payer_contract_approvals');
    assert.ok(forwardSql.includes('public.payer_contract_audit_logs'), 'Creates payer_contract_audit_logs');

    // Triggers and Functions
    assert.ok(forwardSql.includes('fn_block_approved_contract_version_modification'), 'Deploys version immutability trigger function');
    assert.ok(forwardSql.includes('trg_block_approved_contract_version_modification'), 'Deploys version immutability trigger');
    assert.ok(forwardSql.includes('fn_resolve_payer_contract'), 'Deploys 7-step deterministic contract resolution procedure');

    // Down migration checks
    const downSql = fs.readFileSync(path.join(rootDir, 'supabase', 'migrations', '042_payer_contract_model_down.sql'), 'utf8');
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.payer_contract_audit_logs CASCADE'), 'Down drops audit logs');
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.payer_contract_approvals CASCADE'), 'Down drops approvals');
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.payer_contract_terms CASCADE'), 'Down drops terms');
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.payer_contract_facility_scopes CASCADE'), 'Down drops facility scopes');
  });

  await t.test('3. Multi-Tenant RLS Policies Enforce Isolation and NEVER Query public.user_roles', () => {
    const forwardSql = fs.readFileSync(path.join(rootDir, 'supabase', 'migrations', '042_payer_contract_model.sql'), 'utf8');

    assert.ok(forwardSql.includes('ALTER TABLE public.payer_contract_facility_scopes ENABLE ROW LEVEL SECURITY'));
    assert.ok(forwardSql.includes('ALTER TABLE public.payer_contract_plan_scopes ENABLE ROW LEVEL SECURITY'));
    assert.ok(forwardSql.includes('ALTER TABLE public.payer_contract_terms ENABLE ROW LEVEL SECURITY'));
    assert.ok(forwardSql.includes('ALTER TABLE public.payer_contract_documents ENABLE ROW LEVEL SECURITY'));
    assert.ok(forwardSql.includes('ALTER TABLE public.payer_contract_approvals ENABLE ROW LEVEL SECURITY'));

    // Critical negative check: zero direct queries to user_roles
    const lines = forwardSql.split('\n');
    const policyLines = lines.filter(l => l.toUpperCase().includes('POLICY') || l.toUpperCase().includes('USING') || l.toUpperCase().includes('WITH CHECK'));
    for (const pl of policyLines) {
      assert.ok(!pl.includes('public.user_roles'), `RLS policy must not query public.user_roles directly: ${pl}`);
      assert.ok(!pl.includes('FROM user_roles'), `RLS policy must not query user_roles: ${pl}`);
    }
  });

  await t.test('4. Payer Contract Service Retrieves Seeded Contracts and Details Accurately', async () => {
    const contracts = await payerContractService.getPayerContracts();
    assert.ok(Array.isArray(contracts) && contracts.length >= 5, 'Returns at least 5 seeded commercial contracts');

    const bcbs = contracts.find(c => c.contract_number === 'BCBS-ASC-FL-2026');
    assert.ok(bcbs, 'Returns Florida Blue contract');
    assert.strictEqual(bcbs.reimbursement_methodology, 'PERCENT_OF_MEDICARE');
    assert.strictEqual(bcbs.medicare_multiplier, 1.4500);

    const uhc = contracts.find(c => c.contract_number === 'UHC-SPECIALTY-2026');
    assert.ok(uhc, 'Returns UnitedHealthcare contract');
    assert.strictEqual(uhc.reimbursement_methodology, 'COMMERCIAL_FEE_SCHEDULE');

    const details = await payerContractService.getPayerContractById(bcbs.id);
    assert.ok(details, 'Retrieves contract details');
    assert.ok(Array.isArray(details.payer_contract_versions), 'Includes contract versions array');
  });

  await t.test('5. Two-Person CFO Approval Sign-off Locks Version Immutably', async () => {
    const approvalRes = await payerContractService.approveContractVersion({
      versionId: '51000000-0000-0000-0000-000000000001',
      approverId: 'cfo-user-001',
      approverRole: 'cfo',
      decision: 'APPROVED',
      notes: 'Executive CFO Sign-off on 145% Florida Blue ASC rate agreement'
    });

    assert.strictEqual(approvalRes.status, 'APPROVED');
    assert.strictEqual(approvalRes.is_locked, true);
    assert.strictEqual(approvalRes.approved_by, 'cfo-user-001');

    // Negative validation: missing approver
    await assert.rejects(
      async () => {
        await payerContractService.approveContractVersion({ versionId: null });
      },
      /Version ID and Approver ID are required/,
      'Rejects approval attempt without version and approver'
    );
  });

  await t.test('6. Authoritative Deterministic Contract Resolution Engine (7-Step Evaluation)', () => {
    // 1. Resolve Florida Blue BCBS (% of Medicare 145%)
    const bcbsRes = payerContractService.resolvePayerContract({
      payerId: '20000000-0000-0000-0000-000000000002',
      dateOfService: '2026-03-15'
    });
    assert.strictEqual(bcbsRes.resolutionStatus, 'RESOLVED');
    assert.strictEqual(bcbsRes.contract_number, 'BCBS-ASC-FL-2026');
    assert.strictEqual(bcbsRes.reimbursement_methodology, 'PERCENT_OF_MEDICARE');
    assert.strictEqual(bcbsRes.medicare_multiplier, 1.4500);
    assert.strictEqual(bcbsRes.device_carve_out_mode, 'PASS_THROUGH_INVOICE_PLUS_PERCENT');

    // 2. Resolve UHC with Procedural CPT Term Override (Tier 1)
    const uhcRes = payerContractService.resolvePayerContract({
      payerId: '20000000-0000-0000-0000-000000000004',
      cptCode: '29827',
      dateOfService: '2026-03-15'
    });
    assert.strictEqual(uhcRes.resolutionStatus, 'RESOLVED');
    assert.strictEqual(uhcRes.contract_number, 'UHC-SPECIALTY-2026');
    assert.strictEqual(uhcRes.specificity_tier, 'TIER_1_PROCEDURAL_TERM');
    assert.strictEqual(uhcRes.cpt_contracted_rate, 4250.00);

    // 3. Uncontracted Payer fails closed
    const uncontractedRes = payerContractService.resolvePayerContract({
      payerId: 'non-contracted-payer-id',
      dateOfService: '2026-03-15'
    });
    assert.strictEqual(uncontractedRes.resolutionStatus, 'UNCONTRACTED_COMMERCIAL_ENCOUNTER');
    assert.strictEqual(uncontractedRes.contract, null);
  });

  await t.test('7. Deterministic Commercial Adjudication with MPPR and Implant Carve-Outs', () => {
    const contractRes = {
      resolutionStatus: 'RESOLVED',
      contract_number: 'BCBS-ASC-FL-2026',
      version_number: 1,
      reimbursement_methodology: 'PERCENT_OF_MEDICARE',
      medicare_multiplier: 1.4500,
      mppr_rule_set_code: 'CMS_50_PERCENT',
      device_carve_out_mode: 'PASS_THROUGH_INVOICE_PLUS_PERCENT',
      device_invoice_markup_pct: 0.1000
    };

    // Encounter with 2 procedures (29827 and 29881) and 1 implant ($1,200 invoice)
    const encounterData = {
      procedureLines: [
        { cpt_code: '29827', medicare_rate: 1500.00 }, // 1500 * 1.45 = 2175.00 (Primary: 100%)
        { cpt_code: '29881', medicare_rate: 800.00 }   // 800 * 1.45 = 1160.00 (Secondary: 50% = 580.00)
      ],
      implants: [
        { invoice_cost: 1200.00 } // 1200 + 10% = 1320.00
      ],
      contractResolution: contractRes
    };

    const adjudication = payerContractService.calculateCommercialEncounterReimbursement(encounterData);

    assert.strictEqual(adjudication.isContracted, true);
    assert.strictEqual(adjudication.totalProcedureAllowed, 2755.00); // 2175 + 580
    assert.strictEqual(adjudication.totalImplantAllowed, 1320.00);   // 1200 + 120
    assert.strictEqual(adjudication.totalAllowed, 4075.00);          // 2755 + 1320
  });

  await t.test('8. Critical Blocker Remediation: Fail-Closed Commercial Checks in hospitalUtils', () => {
    const uncontractedEncounter = {
      id: 'enc-comm-999',
      cpt_code: '29827',
      payer_category: 'Commercial'
    };

    assert.throws(
      () => {
        calculateAuthoritativeAscRevenue(
          uncontractedEncounter,
          [{ code: '29827', reimbursement: 1500 }],
          { strictPayerCheck: true }
        );
      },
      /Commercial payer without contract cannot silently default to Medicare statutory rates/,
      'Blocks uncontracted commercial claims from receiving Medicare rates'
    );
  });

  await t.test('9. RBAC Catalog Registers All 16 Payer Contract Permissions & Role Mappings', () => {
    const requiredPermissions = [
      'payer.contract.view',
      'payer.contract.terms.view',
      'payer.contract.document.view',
      'payer.contract.history.view',
      'payer.contract.create',
      'payer.contract.edit',
      'payer.contract.scope.manage',
      'payer.contract.terms.manage',
      'payer.contract.document.upload',
      'payer.contract.submit',
      'payer.contract.approve',
      'payer.contract.reject',
      'payer.contract.activate',
      'payer.contract.suspend',
      'payer.contract.terminate',
      'payer.contract.export'
    ];

    for (const perm of requiredPermissions) {
      assert.ok(PERMISSIONS_CATALOG.find(p => p.code === perm), `PERMISSIONS_CATALOG contains ${perm}`);
    }

    const cfoPerms = rbacService.getPermissionsForUser({ roles: ['cfo'] });
    assert.ok(cfoPerms.includes('payer.contract.approve'), 'CFO has contract approval permission');
    assert.ok(cfoPerms.includes('payer.contract.activate'), 'CFO has contract activation permission');

    const billerPerms = rbacService.getPermissionsForUser({ roles: ['biller'] });
    assert.ok(billerPerms.includes('payer.contract.view'), 'Biller can view contracts');
    assert.ok(billerPerms.includes('payer.contract.submit'), 'Biller can submit versions');
    assert.strictEqual(billerPerms.includes('payer.contract.approve'), false, 'Biller cannot approve contract versions');

    const coderPerms = rbacService.getPermissionsForUser({ roles: ['coder'] });
    assert.ok(coderPerms.includes('payer.contract.view'), 'Coder can view contract metadata');
    assert.strictEqual(coderPerms.includes('payer.contract.terms.manage'), false, 'Coder cannot edit financial terms');
  });

  await t.test('10. UI Component & App Integration Verified', () => {
    const compPath = path.join(rootDir, 'src', 'components', 'PayerMasterDirectory.jsx');
    const cssPath = path.join(rootDir, 'src', 'components', 'PayerMasterDirectory.css');

    assert.ok(fs.existsSync(compPath), 'PayerMasterDirectory.jsx exists');
    assert.ok(fs.existsSync(cssPath), 'PayerMasterDirectory.css exists');

    const compCode = fs.readFileSync(compPath, 'utf8');
    assert.ok(compCode.includes('payerContractService'), 'Component imports payerContractService');
    assert.ok(compCode.includes('Pre-Bill Contract Resolution Sandbox'), 'Component includes contract sandbox');
    assert.ok(compCode.includes('Two-Person CFO Approval Sign-off'), 'Component includes CFO approval modal');
  });

  await t.test('11. Zero Maestro Purple Ban Static Compliance Check', () => {
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
      path.join(rootDir, 'src', 'lib', 'payerContractService.js')
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

