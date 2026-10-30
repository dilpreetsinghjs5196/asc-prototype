import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  medicareDeviceService,
  CMS_DEVICE_CATEGORIES,
  STATUTORY_DEVICE_INTENSIVE_PROCEDURES,
  DEFAULT_DEVICE_CROSSWALK
} from '../src/lib/medicareDeviceService.js';
import { rbacService, PERMISSIONS_CATALOG } from '../src/lib/rbacService.js';
import { calculateMedicareRevenue } from '../src/utils/hospitalUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('Phase 63 — Device-Intensive Payment Rules, Packaging Logic & C-Code Crosswalk Suite', async (t) => {

  await t.test('1. Migration 039 Forward & Down SQL Files Exist and are Substantive', () => {
    const forwardPath = path.join(rootDir, 'supabase', 'migrations', '039_device_intensive_payment_rules.sql');
    const downPath = path.join(rootDir, 'supabase', 'migrations', '039_device_intensive_payment_rules_down.sql');

    assert.ok(fs.existsSync(forwardPath), 'Migration 039 forward SQL exists');
    assert.ok(fs.existsSync(downPath), 'Migration 039 down SQL exists');

    const forwardSql = fs.readFileSync(forwardPath, 'utf8');
    const downSql = fs.readFileSync(downPath, 'utf8');

    assert.ok(forwardSql.length > 2000, 'Forward SQL is substantive');
    assert.ok(downSql.length > 300, 'Down SQL is substantive');
  });

  await t.test('2. Migration 039 Creates Required Tables, Constraints & Invariants', () => {
    const forwardSql = fs.readFileSync(path.join(rootDir, 'supabase', 'migrations', '039_device_intensive_payment_rules.sql'), 'utf8');

    assert.ok(forwardSql.includes('public.cms_device_categories'), 'Creates cms_device_categories table');
    assert.ok(forwardSql.includes('public.cms_device_intensive_procedures'), 'Creates cms_device_intensive_procedures table');
    assert.ok(forwardSql.includes('public.cpt_device_category_crosswalk'), 'Creates cpt_device_category_crosswalk table');
    assert.ok(forwardSql.includes('public.medicare_device_calculation_ledgers'), 'Creates medicare_device_calculation_ledgers table');
    assert.ok(forwardSql.includes('surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id)'), 'surgery_id references surgeries(id) as BIGINT');

    // Immutability trigger
    assert.ok(forwardSql.includes('fn_block_device_ledger_modification'), 'Deploys ledger immutability function');
    assert.ok(forwardSql.includes('trg_block_device_ledger_modification'), 'Deploys ledger immutability trigger');

    // Down migration checks
    const downSql = fs.readFileSync(path.join(rootDir, 'supabase', 'migrations', '039_device_intensive_payment_rules_down.sql'), 'utf8');
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.medicare_device_calculation_ledgers'), 'Down drops ledgers table');
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.cpt_device_category_crosswalk'), 'Down drops crosswalk table');
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.cms_device_intensive_procedures'), 'Down drops device procedures table');
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.cms_device_categories'), 'Down drops device categories table');
  });

  await t.test('3. Multi-Tenant RLS Policies Enforce Isolation and NEVER Query public.user_roles', () => {
    const forwardSql = fs.readFileSync(path.join(rootDir, 'supabase', 'migrations', '039_device_intensive_payment_rules.sql'), 'utf8');

    assert.ok(forwardSql.includes('ALTER TABLE public.medicare_device_calculation_ledgers ENABLE ROW LEVEL SECURITY'));
    assert.ok(forwardSql.includes('public.is_facility_accessible'));
    assert.ok(forwardSql.includes('public.user_has_facility_role'));

    // Critical negative check - ensure no SELECT/FROM/JOIN against user_roles
    assert.strictEqual(
      /(FROM|JOIN)\s+(public\.)?user_roles\b/i.test(forwardSql),
      false,
      'Migration 039 RLS policies must NEVER query public.user_roles directly'
    );
  });

  await t.test('4. 42 CFR § 416.171(b)(2) Device Offset is 100% Exempt from Wage Adjustment (Total Knee 27447)', () => {
    // Knee Arthroplasty (27447): National Rate $10,500.00, Offset 33.15%, Naples Wage Index 0.9412
    const result = medicareDeviceService.calculateStatutoryDeviceAdjustment({
      nationalRate: 10500.00,
      offsetPercentage: 0.3315,
      wageIndex: 0.9412,
      ascqrCompliant: true
    });

    // Device offset dollar amount = ROUND(10500 * 0.3315) = 3480.75
    assert.strictEqual(result.deviceOffsetAmount, 3480.75);

    // Unadjusted service share = 10500 - 3480.75 = 7019.25
    assert.strictEqual(result.servicePortionUnadjusted, 7019.25);

    // Adjusted service share = (7019.25 * 0.50 * 0.9412) + (7019.25 * 0.50) = 3303.26 + 3509.63 = 6812.88
    assert.strictEqual(result.servicePortionAdjusted, 6812.88);

    // Final total allowable = 3480.75 + 6812.88 = 10293.63
    assert.strictEqual(result.allowableRate, 10293.63);
  });

  await t.test('5. High Offset Procedure Exemption (Neurostimulator 63685 at 82.45%)', () => {
    // Neurostimulator (63685): Rate $28,000.00, Offset 82.45%, Miami Wage Index 1.0125
    const result = medicareDeviceService.calculateStatutoryDeviceAdjustment({
      nationalRate: 28000.00,
      offsetPercentage: 0.8245,
      wageIndex: 1.0125,
      ascqrCompliant: true
    });

    // Device offset amount = ROUND(28000 * 0.8245) = 23086.00
    assert.strictEqual(result.deviceOffsetAmount, 23086.00);

    // Service share unadjusted = 28000 - 23086 = 4914.00
    assert.strictEqual(result.servicePortionUnadjusted, 4914.00);

    // Adjusted service share = (4914 * 0.50 * 1.0125) + (4914 * 0.50) = 2487.71 + 2457.00 = 4944.71
    assert.strictEqual(result.servicePortionAdjusted, 4944.71);

    // Final rate = 23086.00 + 4944.71 = 28030.71
    assert.strictEqual(result.allowableRate, 28030.71);
  });

  await t.test('6. ASCQR 2.0% Penalty Carve-Out (42 CFR § 416.171(a)(2)): Applied Strictly to Service Share', () => {
    // Non-compliant Knee Arthroplasty (27447)
    const result = medicareDeviceService.calculateStatutoryDeviceAdjustment({
      nationalRate: 10500.00,
      offsetPercentage: 0.3315,
      wageIndex: 0.9412,
      ascqrCompliant: false, // 2% penalty
      ascqrReductionFactor: 0.9800
    });

    // Device offset remains 100% intact ($3480.75)
    assert.strictEqual(result.deviceOffsetAmount, 3480.75);

    // Service share is penalized: ROUND(6812.88 * 0.98) = 6676.62 or 6676.63
    assert.strictEqual(result.servicePortionAdjusted, 6676.63);

    // Total allowable = 3480.75 + 6676.63 = 10157.38
    assert.strictEqual(result.allowableRate, 10157.38);
  });

  await t.test('7. MPPR Secondary Procedure Carve-Out (42 CFR § 416.172): Device Offset Paid at 100%', () => {
    // Knee Arthroplasty (27447) as secondary procedure subject to MPPR
    const mppr = medicareDeviceService.calculateMpprSecondaryJ8Payment({
      nationalRate: 10500.00,
      offsetPercentage: 0.3315,
      wageIndex: 0.9412,
      ascqrCompliant: true
    });

    // Device offset amount remains 100% paid
    assert.strictEqual(mppr.deviceOffsetAmount, 3480.75);

    // Service share is halved: ROUND(6812.88 * 0.50) = 3406.44
    assert.strictEqual(mppr.secondaryServiceShare, 3406.44);

    // Total secondary payment = 3480.75 + 3406.44 = 6887.19
    assert.strictEqual(mppr.secondaryAllowableRate, 6887.19);
    assert.strictEqual(mppr.mpprSavings, 3406.44);
  });

  await t.test('8. C-Code Packaging Invariant: C-Codes Receive $0.00 Separate Allowable and Never Fallback to Gross Charges', () => {
    // Hospital revenue calculation with C-code line
    const cptList = [
      { code: '27447', wage_adjusted_rate: 10293.63, units: 1, payment_indicator: 'J8' },
      { code: 'C1776', gross_charge: 14500.00, units: 1, payment_indicator: 'N1' }, // Implant C-code with high gross charge
      { code: '11042', gross_charge: 850.00, units: 1, payment_indicator: 'N1' } // Packaged debridement
    ];

    const revenue = calculateMedicareRevenue(cptList, {}, true, { payerType: 'Medicare' });

    // The $14,500 gross charge for C1776 and $850 for 11042 must receive $0.00
    // Total Medicare revenue must equal primary allowable $10,293.63
    assert.strictEqual(revenue, 10293.63);
  });

  await t.test('9. Canonical CMS Device Categories Catalog Contains 11 Level II Codes', async () => {
    assert.ok(Array.isArray(CMS_DEVICE_CATEGORIES), 'Exported CMS_DEVICE_CATEGORIES is array');
    assert.strictEqual(CMS_DEVICE_CATEGORIES.length >= 11, true);

    const categories = await medicareDeviceService.getDeviceCategories();
    assert.ok(Array.isArray(categories));
    assert.strictEqual(categories.length >= 11, true);

    const c1776 = categories.find(c => c.category_code === 'C1776');
    assert.ok(c1776);
    assert.strictEqual(c1776.is_packaged, true);
    assert.strictEqual(c1776.clinical_construct, 'ARTHROPLASTY_JOINT');

    const c1767 = categories.find(c => c.category_code === 'C1767');
    assert.ok(c1767);
    assert.strictEqual(c1767.clinical_construct, 'NEUROSTIM_GENERATOR');
  });

  await t.test('10. Statutory Device-Intensive Procedures Catalog Covers J8 Procedures with Offsets > 30%', async () => {
    assert.ok(Array.isArray(STATUTORY_DEVICE_INTENSIVE_PROCEDURES), 'Exported STATUTORY_DEVICE_INTENSIVE_PROCEDURES is array');
    assert.strictEqual(STATUTORY_DEVICE_INTENSIVE_PROCEDURES.length >= 10, true);

    const res = await medicareDeviceService.getDeviceIntensiveProcedures({ page: 1, limit: 20 });
    assert.ok(res.items.length >= 10);
    assert.strictEqual(res.totalCount >= 10, true);

    for (const item of res.items) {
      assert.strictEqual(item.payment_indicator, 'J8');
      assert.strictEqual(item.device_offset_percentage >= 0.30, true);
      assert.ok(item.device_offset_amount > 0);
      assert.ok(item.service_portion_unadjusted > 0);
    }
  });

  await t.test('11. CPT-to-Device Category Crosswalk Maps Primary CPTs to Mandatory C-Codes', async () => {
    assert.ok(Array.isArray(DEFAULT_DEVICE_CROSSWALK), 'Exported DEFAULT_DEVICE_CROSSWALK is array');
    assert.strictEqual(DEFAULT_DEVICE_CROSSWALK.length >= 7, true);

    const crosswalk = await medicareDeviceService.getDeviceCrosswalk('27447');
    assert.ok(crosswalk.length > 0);
    assert.strictEqual(crosswalk[0].device_category_code, 'C1776');
    assert.strictEqual(crosswalk[0].is_mandatory, true);
  });

  await t.test('12. Case Device Offset Margin Reconciliation Calculates Surplus and Deficit Correctly', async () => {
    const margin = await medicareDeviceService.reconcileCaseDeviceMargin(1);
    assert.ok(margin);
    assert.strictEqual(margin.payment_indicator, 'J8');
    assert.strictEqual(margin.device_offset_allowance, 3480.75);
    assert.strictEqual(margin.actual_acquisition_cost, 2850.00);
    assert.strictEqual(margin.net_margin, 630.75);
    assert.strictEqual(margin.reconciliation_status, 'SURPLUS');
  });

  await t.test('13. Multi-Tenant RBAC Permissions Catalog Contains All 8 Device Permissions', () => {
    const requiredPermissions = [
      'device.view_offsets',
      'device.view_categories',
      'device.view_crosswalk',
      'device.edit_crosswalk',
      'device.view_margin_ledger',
      'device.override_offset',
      'device.audit_reconciliation',
      'device.export_data'
    ];

    for (const code of requiredPermissions) {
      const exists = PERMISSIONS_CATALOG.some(p => p.code === code);
      assert.strictEqual(exists, true, `Permission ${code} must exist in PERMISSIONS_CATALOG`);
    }

    // Role checks
    const billerPerms = rbacService.hasPermission(
      ['device.view_offsets', 'device.view_categories'],
      'device.view_offsets'
    );
    assert.strictEqual(billerPerms, true);

    const viewerPerms = rbacService.hasPermission(
      ['device.view_offsets'],
      'device.override_offset'
    );
    assert.strictEqual(viewerPerms, false);
  });

  await t.test('14. Maestro Purple Ban Static Audit Across All Phase 63 Files', () => {
    const filesToAudit = [
      path.join(rootDir, 'src', 'lib', 'medicareDeviceService.js'),
      path.join(rootDir, 'src', 'components', 'MedicareRateExplorer.jsx'),
      path.join(rootDir, 'supabase', 'migrations', '039_device_intensive_payment_rules.sql'),
      path.join(rootDir, 'supabase', 'migrations', '039_device_intensive_payment_rules_down.sql')
    ];

    const bannedPatterns = [
      /#7c3aed/i, /#8b5cf6/i, /#6366f1/i, /#a855f7/i, /#c084fc/i,
      /\bpurple\b/i, /\bviolet\b/i, /\bfuchsia\b/i, /\bindigo\b/i
    ];

    for (const filePath of filesToAudit) {
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf8');
      for (const pattern of bannedPatterns) {
        const match = content.match(pattern);
        assert.strictEqual(
          match === null,
          true,
          `File ${path.basename(filePath)} violates Purple Ban with token: ${match ? match[0] : ''}`
        );
      }
    }
  });

});
