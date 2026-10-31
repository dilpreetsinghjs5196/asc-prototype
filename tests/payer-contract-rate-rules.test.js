import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  payerRateService,
  REIMBURSEMENT_METHODOLOGIES,
  SCHEDULE_TYPES,
  CARVE_OUT_MODELS,
  EXCEPTION_TYPES,
  DEFAULT_RATE_SCHEDULES,
  DEFAULT_CPT_RATES,
  DEFAULT_CASE_RATES,
  DEFAULT_CARVE_OUTS,
  DEFAULT_RATE_EXCEPTIONS
} from '../src/lib/payerRateService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('Phase 67 — Commercial Rate Rules & Financial Adjudication Suite', async (t) => {

  await t.test('1. Migration 043 Forward & Down SQL Files Exist and are Substantive', () => {
    const forwardPath = path.join(rootDir, 'supabase', 'migrations', '043_payer_contract_rate_rules.sql');
    const downPath = path.join(rootDir, 'supabase', 'migrations', '043_payer_contract_rate_rules_down.sql');

    assert.ok(fs.existsSync(forwardPath), 'Migration 043 forward SQL exists');
    assert.ok(fs.existsSync(downPath), 'Migration 043 down SQL exists');

    const forwardSql = fs.readFileSync(forwardPath, 'utf8');
    const downSql = fs.readFileSync(downPath, 'utf8');

    assert.ok(forwardSql.length > 5000, 'Forward SQL is substantive (>5KB)');
    assert.ok(downSql.length > 500, 'Down SQL is substantive (>500B)');
  });

  await t.test('2. Migration 043 Defines Normalized Entities, Triggers & Stored Procedures', () => {
    const forwardSql = fs.readFileSync(path.join(rootDir, 'supabase', 'migrations', '043_payer_contract_rate_rules.sql'), 'utf8');

    // Tables
    assert.ok(forwardSql.includes('public.payer_contract_rate_schedules'), 'Creates payer_contract_rate_schedules');
    assert.ok(forwardSql.includes('public.payer_contract_cpt_rates'), 'Creates payer_contract_cpt_rates');
    assert.ok(forwardSql.includes('public.payer_contract_case_rates'), 'Creates payer_contract_case_rates');
    assert.ok(forwardSql.includes('public.payer_contract_case_rate_inclusions'), 'Creates payer_contract_case_rate_inclusions');
    assert.ok(forwardSql.includes('public.payer_contract_carve_outs'), 'Creates payer_contract_carve_outs');
    assert.ok(forwardSql.includes('public.payer_contract_rate_exceptions'), 'Creates payer_contract_rate_exceptions');
    assert.ok(forwardSql.includes('public.payer_contract_rate_calculations'), 'Creates payer_contract_rate_calculations');
    assert.ok(forwardSql.includes('public.payer_contract_rate_calculation_lines'), 'Creates payer_contract_rate_calculation_lines');
    assert.ok(forwardSql.includes('public.payer_contract_rate_import_batches'), 'Creates payer_contract_rate_import_batches');
    assert.ok(forwardSql.includes('public.payer_contract_rate_import_staging'), 'Creates payer_contract_rate_import_staging');

    // Immutability Triggers
    assert.ok(forwardSql.includes('trg_lock_contract_rates_on_approval'), 'Deploys rate locking trigger function');
    assert.ok(forwardSql.includes('trg_lock_cpt_rates'), 'Binds locking trigger to CPT rates');
    assert.ok(forwardSql.includes('trg_lock_case_rates'), 'Binds locking trigger to case rates');
    assert.ok(forwardSql.includes('trg_lock_carve_outs'), 'Binds locking trigger to carve-outs');

    // Stored Procedures
    assert.ok(forwardSql.includes('fn_resolve_contract_rate'), 'Deploys rate resolver stored procedure');
    assert.ok(forwardSql.includes('fn_calculate_commercial_reimbursement'), 'Deploys master commercial calculation procedure');
    assert.ok(forwardSql.includes('fn_stage_rate_schedule_import'), 'Deploys staging import procedure');
    assert.ok(forwardSql.includes('fn_commit_rate_schedule_version'), 'Deploys atomic commit procedure');

    // RLS Policies
    assert.ok(forwardSql.includes('rate_schedules_select_policy'), 'Deploys RLS policy for rate schedules');
    assert.ok(forwardSql.includes('cpt_rates_select_policy'), 'Deploys RLS policy for CPT rates');
    assert.ok(forwardSql.includes('calculations_select_policy'), 'Deploys RLS policy for calculations');
  });

  await t.test('3. Client Service Layer (payerRateService.js) Exports Enums, Defaults and Methods', () => {
    assert.ok(REIMBURSEMENT_METHODOLOGIES.COMMERCIAL_FEE_SCHEDULE, 'COMMERCIAL_FEE_SCHEDULE defined');
    assert.ok(REIMBURSEMENT_METHODOLOGIES.PERCENT_OF_MEDICARE, 'PERCENT_OF_MEDICARE defined');
    assert.ok(REIMBURSEMENT_METHODOLOGIES.CASE_RATE, 'CASE_RATE defined');
    assert.ok(SCHEDULE_TYPES.FEE_SCHEDULE, 'FEE_SCHEDULE defined');
    assert.ok(CARVE_OUT_MODELS.INVOICE_PLUS_PERCENT, 'INVOICE_PLUS_PERCENT defined');
    assert.ok(EXCEPTION_TYPES.STOP_LOSS, 'STOP_LOSS defined');

    assert.ok(Array.isArray(DEFAULT_RATE_SCHEDULES), 'DEFAULT_RATE_SCHEDULES is an array');
    assert.ok(Array.isArray(DEFAULT_CPT_RATES), 'DEFAULT_CPT_RATES is an array');
    assert.ok(Array.isArray(DEFAULT_CASE_RATES), 'DEFAULT_CASE_RATES is an array');
    assert.ok(Array.isArray(DEFAULT_CARVE_OUTS), 'DEFAULT_CARVE_OUTS is an array');
    assert.ok(Array.isArray(DEFAULT_RATE_EXCEPTIONS), 'DEFAULT_RATE_EXCEPTIONS is an array');

    assert.strictEqual(typeof payerRateService.getRateSchedules, 'function');
    assert.strictEqual(typeof payerRateService.getCptRates, 'function');
    assert.strictEqual(typeof payerRateService.getCaseRates, 'function');
    assert.strictEqual(typeof payerRateService.getCarveOuts, 'function');
    assert.strictEqual(typeof payerRateService.getRateExceptions, 'function');
    assert.strictEqual(typeof payerRateService.resolveContractRate, 'function');
    assert.strictEqual(typeof payerRateService.adjudicateEncounter, 'function');
  });

  await t.test('4. Case Study 1: Rotator Cuff + J8 Tenodesis + Implant Carve-Out ($13,536.04)', () => {
    const procs = [
      { cpt_code: '23430', description: 'Biceps tenodesis open', gross_charge: 18500.00, pi: 'J8', wage_index: 1.2841, medicare_multiplier: 1.80 },
      { cpt_code: '29827', description: 'Rotator cuff repair arthroscopic', gross_charge: 12400.00, pi: 'A2', wage_index: 1.2841, medicare_multiplier: 1.80 }
    ];
    const implants = [
      { code: 'C1713', description: 'Anchor Arthrex Corkscrew FT (Qty: 2)', invoice_cost: 1700.00, billed_charge: 3400.00 }
    ];

    const res = payerRateService.adjudicateEncounter({
      caseId: 'test-case-1',
      facilityId: '00000000-0000-0000-0000-000000000001',
      procedures: procs,
      implants: implants,
      stopLossThreshold: 75000.00,
      mpprRule: 'CMS_STANDARD_50'
    });

    assert.strictEqual(res.status, 'CALCULATED');
    assert.strictEqual(res.total_billed_charges, 34300.00);
    // Line 1 (23430 @ 100%): $8,428.33
    // Line 2 (29827 @ 50%): $3,237.71
    // Total Proc Allowed = $11,666.04
    assert.strictEqual(res.total_procedure_allowable, 11666.04);
    // Implant (Invoice $1700 * 1.10): $1,870.00
    assert.strictEqual(res.total_implant_allowable, 1870.00);
    // Total Contract Allowable = $11,666.04 + $1,870.00 = $13,536.04
    assert.strictEqual(res.total_contract_allowable, 13536.04);

    // Verify J8 device offset ($2,100) was deducted
    const tenodesisLine = res.line_items.find(l => l.cpt_code === '23430');
    assert.strictEqual(tenodesisLine.j8_device_offset_deducted, 2100.00);
    assert.strictEqual(tenodesisLine.final_line_allowable, 8428.33);

    // Verify MPPR ranking
    const cuffLine = res.line_items.find(l => l.cpt_code === '29827');
    assert.strictEqual(cuffLine.mppr_rank, 2);
    assert.strictEqual(cuffLine.mppr_discount_pct, 0.50);
    assert.strictEqual(cuffLine.final_line_allowable, 3237.71);
  });

  await t.test('5. Case Study 2: Knee Scope with 50% MPPR Cascade ($4,100.00)', () => {
    const procs = [
      { cpt_code: '29881', description: 'Knee scope medial meniscectomy', negotiated_rate: 3200.00, gross_charge: 9500.00 },
      { cpt_code: '29877', description: 'Knee scope chondroplasty', negotiated_rate: 1800.00, gross_charge: 5200.00 },
      { cpt_code: '29870', description: 'Diagnostic knee scope', negotiated_rate: 1200.00, gross_charge: 3800.00, is_packaged: true }
    ];

    const res = payerRateService.adjudicateEncounter({
      caseId: 'test-case-2',
      facilityId: '00000000-0000-0000-0000-000000000001',
      procedures: procs,
      implants: [],
      mpprRule: 'CMS_STANDARD_50'
    });

    assert.strictEqual(res.status, 'CALCULATED');
    // Line 1: $3,200 * 100% = $3,200.00
    // Line 2: $1,800 * 50% = $900.00
    // Line 3: Packaged = $0.00
    // Total = $4,100.00
    assert.strictEqual(res.total_contract_allowable, 4100.00);
    assert.strictEqual(res.total_procedure_allowable, 4100.00);

    const packagedLine = res.line_items.find(l => l.cpt_code === '29870');
    assert.strictEqual(packagedLine.is_packaged, true);
    assert.strictEqual(packagedLine.final_line_allowable, 0.00);
  });

  await t.test('6. Case Study 3: Cataract Bundled Case Rate with Standard IOL ($2,250.00)', () => {
    const procs = [
      { cpt_code: '66984', description: 'Cataract extraction with IOL', gross_charge: 5800.00 }
    ];
    const implants = [
      { code: 'V2632', description: 'Standard monofocal IOL', invoice_cost: 150.00, billed_charge: 800.00 }
    ];

    const res = payerRateService.adjudicateEncounter({
      caseId: 'test-case-3',
      facilityId: '00000000-0000-0000-0000-000000000001',
      procedures: procs,
      implants: implants
    });

    assert.strictEqual(res.status, 'CALCULATED');
    // Case rate $2,250 covers procedure + standard lens
    assert.strictEqual(res.total_procedure_allowable, 2250.00);
    assert.strictEqual(res.total_implant_allowable, 0.00); // Packaged in case rate
    assert.strictEqual(res.total_contract_allowable, 2250.00);
  });

  await t.test('7. Case Study 4: Lumbar Spine Fusion Catastrophic Stop-Loss ($60,320.00)', () => {
    const procs = [
      { cpt_code: '22612', description: 'Lumbar fusion posterior', gross_charge: 24500.00 },
      { cpt_code: '22614', description: 'Lumbar fusion additional level', gross_charge: 12800.00 },
      { cpt_code: '22842', description: 'Posterior instrumentation', gross_charge: 18500.00 },
      { cpt_code: '22853', description: 'Interbody cage insertion', gross_charge: 14600.00 }
    ];
    const implants = [
      { code: 'HARDWARE', description: 'PEEK cages & titanium screws', invoice_cost: 9800.00, billed_charge: 22400.00 }
    ];

    // Total gross = 24500 + 12800 + 18500 + 14600 + 22400 = $92,800.00
    // Threshold = $75,000 -> Triggered!
    // Settlement = $92,800 * 0.65 = $60,320.00
    const res = payerRateService.adjudicateEncounter({
      caseId: 'test-case-4',
      facilityId: '00000000-0000-0000-0000-000000000001',
      procedures: procs,
      implants: implants,
      stopLossThreshold: 75000.00,
      stopLossPct: 0.6500
    });

    assert.strictEqual(res.status, 'STOP_LOSS_APPLIED');
    assert.strictEqual(res.stop_loss_triggered, true);
    assert.strictEqual(res.total_billed_charges, 92800.00);
    assert.strictEqual(res.total_contract_allowable, 60320.00);
  });

  await t.test('8. Case Study 5: Bilateral Carpal Tunnel Release with 200% Exception ($3,200.00)', () => {
    const procs = [
      { cpt_code: '64721', description: 'Carpal tunnel neuroplasty open', negotiated_rate: 1600.00, modifier: '50', gross_charge: 5400.00 }
    ];

    const res = payerRateService.adjudicateEncounter({
      caseId: 'test-case-5',
      facilityId: '00000000-0000-0000-0000-000000000001',
      procedures: procs,
      implants: [],
      mpprRule: 'NO_MPPR'
    });

    assert.strictEqual(res.status, 'CALCULATED');
    // $1,600.00 * 200% = $3,200.00
    assert.strictEqual(res.total_contract_allowable, 3200.00);
  });

  await t.test('9. UI & CSS Strictly Obey Purple Ban (Zero Banned Tokens)', () => {
    const cssContent = fs.readFileSync(path.join(rootDir, 'src', 'components', 'PayerMasterDirectory.css'), 'utf8').toLowerCase();
    const jsxContent = fs.readFileSync(path.join(rootDir, 'src', 'components', 'PayerMasterDirectory.jsx'), 'utf8').toLowerCase();

    const bannedColors = [
      '#7c3aed',
      '#8b5cf6',
      '#a855f7',
      '#c084fc',
      '#6366f1',
      '#4f46e5',
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
    
    bannedColors.forEach(token => {
      assert.strictEqual(cssContent.includes(token), false, `PayerMasterDirectory.css must not contain banned token "${token}"`);
      assert.strictEqual(jsxContent.includes(token), false, `PayerMasterDirectory.jsx must not contain banned token "${token}"`);
    });

    assert.ok(jsxContent.includes('commercial rate rules & exhibits'), 'PayerMasterDirectory.jsx renders Rate Rules subtab');
    assert.ok(jsxContent.includes('production adjudication simulator & audit inspector'), 'PayerMasterDirectory.jsx renders Adjudication Simulator');
  });

});
