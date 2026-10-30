import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  mpprService,
  DEFAULT_MPPR_RULE_SETS,
  CMS_ENDOSCOPY_FAMILIES
} from '../src/lib/mpprService.js';
import { rbacService, PERMISSIONS_CATALOG } from '../src/lib/rbacService.js';
import { calculateAuthoritativeAscRevenue } from '../src/utils/hospitalUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('Phase 64 — Multiple Procedure Payment Rules (MPPR) & Reductions Suite', async (t) => {

  await t.test('1. Migration 040 Forward & Down SQL Files Exist and are Substantive', () => {
    const forwardPath = path.join(rootDir, 'supabase', 'migrations', '040_multiple_procedure_payment_rules.sql');
    const downPath = path.join(rootDir, 'supabase', 'migrations', '040_multiple_procedure_payment_rules_down.sql');

    assert.ok(fs.existsSync(forwardPath), 'Migration 040 forward SQL exists');
    assert.ok(fs.existsSync(downPath), 'Migration 040 down SQL exists');

    const forwardSql = fs.readFileSync(forwardPath, 'utf8');
    const downSql = fs.readFileSync(downPath, 'utf8');

    assert.ok(forwardSql.length > 2500, 'Forward SQL is substantive (>2.5KB)');
    assert.ok(downSql.length > 300, 'Down SQL is substantive (>300B)');
  });

  await t.test('2. Migration 040 Creates Required Tables, Constraints & Invariants', () => {
    const forwardSql = fs.readFileSync(path.join(rootDir, 'supabase', 'migrations', '040_multiple_procedure_payment_rules.sql'), 'utf8');

    assert.ok(forwardSql.includes('public.multiple_procedure_rule_sets'), 'Creates multiple_procedure_rule_sets table');
    assert.ok(forwardSql.includes('public.multiple_procedure_rules'), 'Creates multiple_procedure_rules table');
    assert.ok(forwardSql.includes('public.cms_endoscopy_families'), 'Creates cms_endoscopy_families table');
    assert.ok(forwardSql.includes('public.mppr_calculation_snapshots'), 'Creates mppr_calculation_snapshots table');
    assert.ok(forwardSql.includes('public.mppr_calculation_lines'), 'Creates mppr_calculation_lines table');
    assert.ok(forwardSql.includes('surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id)'), 'surgery_id references surgeries(id) as BIGINT');

    // Immutability trigger checks
    assert.ok(forwardSql.includes('fn_block_mppr_snapshot_modification'), 'Deploys snapshot immutability trigger function');
    assert.ok(forwardSql.includes('trg_block_mppr_snapshot_modification'), 'Deploys snapshot immutability trigger');

    // Verify in-memory client seed constants exist and match schema
    assert.ok(Array.isArray(DEFAULT_MPPR_RULE_SETS) && DEFAULT_MPPR_RULE_SETS.length >= 3, 'Client default rule sets defined');
    assert.ok(Array.isArray(CMS_ENDOSCOPY_FAMILIES) && CMS_ENDOSCOPY_FAMILIES.length >= 10, 'Client endoscopy families defined');

    // Down migration checks
    const downSql = fs.readFileSync(path.join(rootDir, 'supabase', 'migrations', '040_multiple_procedure_payment_rules_down.sql'), 'utf8');
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.mppr_calculation_lines'), 'Down drops calculation lines table');
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.mppr_calculation_snapshots'), 'Down drops snapshots table');
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.cms_endoscopy_families'), 'Down drops endoscopy families table');
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.multiple_procedure_rules'), 'Down drops procedure rules table');
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.multiple_procedure_rule_sets'), 'Down drops rule sets table');
  });

  await t.test('3. Multi-Tenant RLS Policies Enforce Isolation and NEVER Query public.user_roles', () => {
    const forwardSql = fs.readFileSync(path.join(rootDir, 'supabase', 'migrations', '040_multiple_procedure_payment_rules.sql'), 'utf8');

    assert.ok(forwardSql.includes('ALTER TABLE public.mppr_calculation_snapshots ENABLE ROW LEVEL SECURITY'));
    assert.ok(forwardSql.includes('ALTER TABLE public.mppr_calculation_lines ENABLE ROW LEVEL SECURITY'));
    assert.ok(forwardSql.includes('public.is_facility_accessible'));
    assert.ok(forwardSql.includes('public.user_has_facility_role'));

    // Critical negative check - ensure no query directly to user_roles
    assert.strictEqual(
      /(FROM|JOIN)\s+(public\.)?user_roles\b/i.test(forwardSql),
      false,
      'Migration 040 RLS policies must NEVER query public.user_roles directly'
    );
  });

  await t.test('4. Standard Dual-Surgical 100%/50% Reduction (Knee Arthroscopy 29881 + 29877)', () => {
    // Knee Arthroscopy 29881 ($1,650) and 29877 ($1,420) with national wage index 1.0000
    const encounter = mpprService.calculateEncounterMppr({
      procedureLines: [
        { cpt_code: '29881', national_unadjusted_rate: 1650.00, units: 1, gross_charge: 5200 },
        { cpt_code: '29877', national_unadjusted_rate: 1420.00, units: 1, gross_charge: 4400 }
      ],
      wageIndex: 1.0000,
      ascqrCompliant: true,
      ruleSetCode: 'MEDICARE_ASC_416_172'
    });

    assert.strictEqual(encounter.lines.length, 2);
    
    // Line 1: Primary (29881) paid at 100%
    const primary = encounter.lines[0];
    assert.strictEqual(primary.cpt_code, '29881');
    assert.strictEqual(primary.rank_order, 1);
    assert.strictEqual(primary.multiplier_percentage, 1.0);
    assert.strictEqual(primary.final_line_allowable, 1650.00);

    // Line 2: Secondary (29877) paid at 50%
    const secondary = encounter.lines[1];
    assert.strictEqual(secondary.cpt_code, '29877');
    assert.strictEqual(secondary.rank_order, 2);
    assert.strictEqual(secondary.multiplier_percentage, 0.5);
    assert.strictEqual(secondary.final_line_allowable, 710.00);

    // Total final allowable = 1650 + 710 = 2360
    assert.strictEqual(encounter.totalUnreducedAllowable, 3070.00);
    assert.strictEqual(encounter.totalMpprSavings, 710.00);
    assert.strictEqual(encounter.totalFinalAllowable, 2360.00);
  });

  await t.test('5. Secondary Device-Intensive (J8): 100% Device Offset Protection (42 CFR § 416.172)', () => {
    // Primary: 22856 ($14,200 J8, offset 42.5%), Secondary: 27447 ($10,500 J8, offset 33.15%)
    // At national wage index 1.0000:
    // Secondary 27447 device offset = 10,500 * 0.3315 = $3,480.75 (100% protected)
    // Secondary 27447 service portion = 10,500 - 3,480.75 = $7,019.25
    // Secondary 27447 reduced service = 7,019.25 * 0.50 = $3,509.63
    // Secondary 27447 final allowable = 3,480.75 + 3,509.63 = $6,990.38
    const encounter = mpprService.calculateEncounterMppr({
      procedureLines: [
        { cpt_code: '22856', payment_indicator: 'J8', national_unadjusted_rate: 14200.00, device_offset_percentage: 0.4250, units: 1 },
        { cpt_code: '27447', payment_indicator: 'J8', national_unadjusted_rate: 10500.00, device_offset_percentage: 0.3315, units: 1 }
      ],
      wageIndex: 1.0000,
      ascqrCompliant: true,
      ruleSetCode: 'MEDICARE_ASC_416_172'
    });

    const secLine = encounter.lines.find(l => l.cpt_code === '27447');
    assert.ok(secLine, 'Secondary line 27447 found');
    assert.strictEqual(secLine.rank_order, 2);
    assert.strictEqual(secLine.protected_device_offset, 3480.75);
    assert.strictEqual(secLine.reduced_service_portion, 3509.63);
    assert.strictEqual(secLine.final_line_allowable, 6990.38);

    // Negative check: ensure the allowable is NOT simply 50% of 10500 ($5,250)
    assert.notStrictEqual(secLine.final_line_allowable, 5250.00);
    assert.ok(secLine.final_line_allowable > 5250.00, 'Protected device offset yields higher reimbursement than illegal flat 50% cut');
  });

  await t.test('6. Endoscopy Family Base-Code Deduction (42 CFR § 416.172(c))', () => {
    // Colonoscopy Family 15: Member 45381 ($950.00), Member 45380 ($820.00), Family Base 45378 ($540.00)
    // Primary: 45381 paid at full $950.00
    // Secondary: 45380 paid at $820.00 - $540.00 = $280.00
    const payment45380 = mpprService.calculateEndoscopyFamilyPayment({
      memberRate: 820.00,
      baseRate: 540.00
    });

    assert.strictEqual(payment45380.familyBaseRate, 540.00);
    assert.strictEqual(payment45380.deductionAmount, 540.00);
    assert.strictEqual(payment45380.finalPayment, 280.00);

    // Verify lookup of endoscopy base code
    const baseCode = mpprService.lookupEndoscopyBaseCode('45380');
    assert.strictEqual(baseCode, '45378');
  });

  await t.test('7. Bilateral Procedure (Modifier 50) Reimbursed at Single-Line 150%', () => {
    // Knee replacement (27447): Rate $10,500, billed with Modifier 50
    // Medicare ASC reimburses 1 line at 150% = $15,750.00
    const encounter = mpprService.calculateEncounterMppr({
      procedureLines: [
        { cpt_code: '27447', national_unadjusted_rate: 10500.00, units: 1, modifiers: ['50'] }
      ],
      wageIndex: 1.0000,
      ascqrCompliant: true,
      ruleSetCode: 'MEDICARE_ASC_416_172'
    });

    assert.strictEqual(encounter.lines.length, 1);
    const line = encounter.lines[0];
    assert.strictEqual(line.multiplier_percentage, 1.5);
    assert.strictEqual(line.final_line_allowable, 15750.00);
    assert.ok(line.calculation_rationale.includes('Bilateral procedure'));
  });

  await t.test('8. Add-on Code (+22845) 100% Exemption Across All Units', () => {
    // Spine surgery primary 22856 + Add-on code 22845
    const encounter = mpprService.calculateEncounterMppr({
      procedureLines: [
        { cpt_code: '22856', national_unadjusted_rate: 14200.00, units: 1 },
        { cpt_code: '22845', national_unadjusted_rate: 1850.00, units: 2, is_add_on: true }
      ],
      wageIndex: 1.0000,
      ruleSetCode: 'MEDICARE_ASC_416_172'
    });

    const addOnLine = encounter.lines.find(l => l.cpt_code === '22845');
    assert.ok(addOnLine, 'Add-on line present');
    assert.strictEqual(addOnLine.multiplier_percentage, 1.0);
    // 2 units paid in full: 1850 * 2 = 3700
    assert.strictEqual(addOnLine.final_line_allowable, 3700.00);
    assert.ok(addOnLine.calculation_rationale.includes('Add-on code exempt'));
  });

  await t.test('9. Packaged Items (N1 / C1776) Excluded from Ranking ($0.00 Allowable)', () => {
    const encounter = mpprService.calculateEncounterMppr({
      procedureLines: [
        { cpt_code: '27447', national_unadjusted_rate: 10500.00, units: 1, payment_indicator: 'J8' },
        { cpt_code: 'C1776', national_unadjusted_rate: 0.00, units: 1, payment_indicator: 'N1', gross_charge: 4500.00 }
      ],
      wageIndex: 1.0000,
      ruleSetCode: 'MEDICARE_ASC_416_172'
    });

    const packaged = encounter.lines.find(l => l.cpt_code === 'C1776');
    assert.ok(packaged, 'Packaged code present in claim output');
    assert.strictEqual(packaged.final_line_allowable, 0.00);
    assert.strictEqual(packaged.multiplier_percentage, 0.0);
    assert.ok(packaged.calculation_rationale.includes('Packaged'));
  });

  await t.test('10. Multiple Units of Primary Procedure (Unit 1 at 100%, Subsequent Units at 50%)', () => {
    // Same surgical procedure performed twice (units = 2)
    const encounter = mpprService.calculateEncounterMppr({
      procedureLines: [
        { cpt_code: '29881', national_unadjusted_rate: 1650.00, units: 2 }
      ],
      wageIndex: 1.0000,
      ruleSetCode: 'MEDICARE_ASC_416_172'
    });

    assert.strictEqual(encounter.lines.length, 1);
    const line = encounter.lines[0];
    // Unit 1: $1650 * 1.0 = $1650, Unit 2: $1650 * 0.50 = $825. Total = $2475
    assert.strictEqual(line.final_line_allowable, 2475.00);
  });

  await t.test('11. Commercial 4-Tier Cascade (100 / 50 / 25 / 0)', () => {
    const encounter = mpprService.calculateEncounterMppr({
      procedureLines: [
        { cpt_code: '29881', national_unadjusted_rate: 1650.00, units: 1 },
        { cpt_code: '29877', national_unadjusted_rate: 1420.00, units: 1 },
        { cpt_code: '29870', national_unadjusted_rate: 1100.00, units: 1 },
        { cpt_code: '29871', national_unadjusted_rate: 950.00, units: 1 }
      ],
      wageIndex: 1.0000,
      ruleSetCode: 'COM_STD_CASCADE',
      isCommercial: true
    });

    assert.strictEqual(encounter.lines.length, 4);
    assert.strictEqual(encounter.lines[0].multiplier_percentage, 1.00); // 1650
    assert.strictEqual(encounter.lines[1].multiplier_percentage, 0.50); // 710
    assert.strictEqual(encounter.lines[2].multiplier_percentage, 0.25); // 275
    assert.strictEqual(encounter.lines[3].multiplier_percentage, 0.00); // 0 (bundled)

    assert.strictEqual(encounter.lines[0].final_line_allowable, 1650.00);
    assert.strictEqual(encounter.lines[1].final_line_allowable, 710.00);
    assert.strictEqual(encounter.lines[2].final_line_allowable, 275.00);
    assert.strictEqual(encounter.lines[3].final_line_allowable, 0.00);
  });

  await t.test('12. Procedure Ranking is Strictly Based on Allowable Rate, NEVER Gross Charges', () => {
    // Line A has high gross charge ($20,000) but low allowable ($1,000)
    // Line B has low gross charge ($5,000) but high allowable ($3,000)
    const encounter = mpprService.calculateEncounterMppr({
      procedureLines: [
        { cpt_code: 'PROC_A', national_unadjusted_rate: 1000.00, gross_charge: 20000.00 },
        { cpt_code: 'PROC_B', national_unadjusted_rate: 3000.00, gross_charge: 5000.00 }
      ],
      wageIndex: 1.0000,
      ruleSetCode: 'MEDICARE_ASC_416_172'
    });

    // Rank 1 MUST be PROC_B because its allowable ($3,000) exceeds PROC_A ($1,000)
    assert.strictEqual(encounter.lines[0].cpt_code, 'PROC_B');
    assert.strictEqual(encounter.lines[0].rank_order, 1);
    assert.strictEqual(encounter.lines[0].multiplier_percentage, 1.0);

    // Rank 2 MUST be PROC_A despite having 4x higher gross charge
    assert.strictEqual(encounter.lines[1].cpt_code, 'PROC_A');
    assert.strictEqual(encounter.lines[1].rank_order, 2);
    assert.strictEqual(encounter.lines[1].multiplier_percentage, 0.5);
  });

  await t.test('13. Authoritative Revenue Function Protects Device Offset (calculateAuthoritativeAscRevenue)', () => {
    const lines = [
      { cpt_code: '22856', procedure_indicator: 'J8', unreduced_rate: 14200.00, device_offset_percentage: 0.4250, units: 1 },
      { cpt_code: '27447', procedure_indicator: 'J8', unreduced_rate: 10500.00, device_offset_percentage: 0.3315, units: 1 }
    ];

    const revenue = calculateAuthoritativeAscRevenue(lines, { wageIndex: 1.0000, hasAscqr: true });
    
    // Primary: 14200.00. Secondary: 3480.75 + (7019.25 * 0.5) = 6990.38
    // Total = 14200.00 + 6990.38 = 21190.38
    assert.strictEqual(revenue, 21190.38);
  });

  await t.test('14. RBAC Service Registers All 7 MPPR Permissions', () => {
    const requiredPermissions = [
      'mppr.view_rules',
      'mppr.view_calculations',
      'mppr.manage_payer_rules',
      'mppr.toggle_facility_setting',
      'mppr.override_discount',
      'mppr.approve_override',
      'mppr.audit_export'
    ];

    for (const code of requiredPermissions) {
      const found = PERMISSIONS_CATALOG.find(p => p.code === code);
      assert.ok(found, `Permission ${code} registered in PERMISSIONS_CATALOG`);
    }

    // Role checks
    assert.strictEqual(rbacService.hasPermission(['*'], 'mppr.view_rules'), true);
    assert.strictEqual(rbacService.hasPermission(['admin.*'], 'mppr.manage_payer_rules'), true);
    assert.strictEqual(rbacService.hasPermission(['mppr.view_rules', 'mppr.view_calculations'], 'mppr.view_rules'), true);
    assert.strictEqual(rbacService.hasPermission(['mppr.view_rules'], 'mppr.manage_payer_rules'), false);
  });

  await t.test('15. Maestro Purple Ban Audit Across All Phase 64 Files', () => {
    const filesToAudit = [
      path.join(rootDir, 'src', 'lib', 'mpprService.js'),
      path.join(rootDir, 'src', 'components', 'MedicareRateExplorer.jsx'),
      path.join(rootDir, 'supabase', 'migrations', '040_multiple_procedure_payment_rules.sql'),
      path.join(rootDir, 'supabase', 'migrations', '040_multiple_procedure_payment_rules_down.sql')
    ];

    // Check for prohibited color tokens in frontend code
    const prohibitedPatterns = [
      /#7c3aed/i,
      /#8b5cf6/i,
      /#6d28d9/i,
      /#5b21b6/i,
      /\btext-purple-/i,
      /\bbg-purple-/i,
      /\bborder-purple-/i,
      /\btext-violet-/i,
      /\bbg-violet-/i,
      /\btext-indigo-/i,
      /\bbg-indigo-/i
    ];

    for (const filePath of filesToAudit) {
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf8');
      for (const pattern of prohibitedPatterns) {
        assert.strictEqual(
          pattern.test(content),
          false,
          `File ${path.basename(filePath)} violates Maestro Purple Ban with pattern ${pattern}`
        );
      }
    }
  });

});
