/**
 * ==============================================================================
 * Test Suite: cpt-economics-report.test.js
 * Module 17: Enterprise Reporting & Executive Packages (Phase H6)
 * Tests: Telemetry & Net Operating Income, Facility Alias Resolution,
 *        Config Overhead/Min-Case Bounds Guard, Deterministic Unit Economics Math,
 *        Specialty & Quadrant Filters, Conserved Edition Compilation & Min-Case Gate,
 *        Cost Optimization Review Validation Guard, Benchmarks & Payer Rate Matrix,
 *        H0 Dispatch Logging, Dual Facade Parity, Migration 144 UP/DOWN SQL,
 *        Zero Prohibited Color Tokens, Dark Dropdown + Anti-Clipping CSS & App.jsx.
 * ==============================================================================
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import service, {
  NAPLES_FACILITY_ID,
  normalizeFacilityId,
  computeCerProvenanceSeal,
  maskCerSecret,
  evaluateCptUnitEconomics,
  verifyEditionConservation,
  getCerConfig,
  updateCerConfig,
  getCerTelemetry,
  getCerSpecialtyBenchmarks,
  getCerCptScorecards,
  getCerPayerRateMatrix,
  compileCptEconomicsEdition,
  recordCostOptimizationReview,
  dispatchCptEconomicsDigest
} from '../src/services/cptEconomicsReportService.js';

import * as facade from '../src/lib/cptEconomicsReportService.js';

describe('Phase H6: CPT Reimbursement, Cost, Margin & OR Duration Report', () => {

  test('1. Telemetry returns accurate Naples CPT volume, weighted margin/hr, NOI, and sha256_cer_ seal', async () => {
    const telemetry = await getCerTelemetry(NAPLES_FACILITY_ID);
    assert.ok(telemetry);
    assert.equal(telemetry.facility_id, NAPLES_FACILITY_ID);
    assert.equal(telemetry.latest_edition_code, 'CER-2026-Q4-NAP');
    assert.equal(telemetry.cpts_evaluated, 6);
    assert.equal(telemetry.total_case_volume, 152);
    assert.equal(telemetry.anchor_cpt_count, 4);
    assert.ok(telemetry.total_net_operating_income_usd > 0);
    assert.ok(telemetry.latest_sync_seal.startsWith('sha256_cer_'));
    assert.equal(telemetry.latest_sync_seal.length, 64);
  });

  test('2. Facility UUID alias resolution normalizes strings and objects cleanly', () => {
    assert.equal(normalizeFacilityId('fac-naples-01'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId('naples-surgery-center'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ id: 'fac-naples-01' }), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ uuid: NAPLES_FACILITY_ID }), NAPLES_FACILITY_ID);
  });

  test('3. Config retrieval, masked secret, and negative overhead/min-case bounds check', async () => {
    const cfg = await getCerConfig('fac-naples-01');
    assert.ok(cfg.client_secret_encrypted.startsWith('cer_sec_****_'));
    assert.equal(maskCerSecret('raw_cer_secret_6214'), 'cer_sec_****_6214');

    await assert.rejects(
      () => updateCerConfig(NAPLES_FACILITY_ID, { facility_overhead_per_or_hour_usd: -10 }),
      /ERR_CER_INVALID_CONFIG/
    );
    await assert.rejects(
      () => updateCerConfig(NAPLES_FACILITY_ID, { min_cases_for_statistical_validity: 0 }),
      /ERR_CER_INVALID_CONFIG/
    );
  });

  test('4. evaluateCptUnitEconomics computes unit waterfall, quadrant classifications, and 0-min guard', () => {
    const anchor = evaluateCptUnitEconomics(
      {
        case_count: 10,
        avg_or_duration_minutes: 60,
        avg_net_reimbursement_usd: 5000,
        avg_implant_cost_usd: 1000,
        avg_supply_cost_usd: 400,
        avg_labor_cost_usd: 400
      },
      { facility_overhead_per_or_hour_usd: 450 }
    );
    assert.equal(anchor.avg_direct_cost_usd, 1800.00);
    assert.equal(anchor.contribution_margin_per_case_usd, 3200.00);
    assert.equal(anchor.allocated_overhead_per_case_usd, 450.00);
    assert.equal(anchor.net_operating_income_per_case_usd, 2750.00);
    assert.equal(anchor.margin_per_or_hour_usd, 3200.00);
    assert.equal(anchor.economic_quadrant, 'PRIME_YIELD_ANCHOR');

    const deficit = evaluateCptUnitEconomics(
      {
        case_count: 5,
        avg_or_duration_minutes: 90,
        avg_net_reimbursement_usd: 3000,
        avg_implant_cost_usd: 2200,
        avg_supply_cost_usd: 500,
        avg_labor_cost_usd: 400
      },
      { facility_overhead_per_or_hour_usd: 450 }
    );
    assert.equal(deficit.economic_quadrant, 'ECONOMIC_DEFICIT');

    const zeroMin = evaluateCptUnitEconomics({ case_count: 1, avg_or_duration_minutes: 0, avg_net_reimbursement_usd: 1000 });
    assert.equal(zeroMin.margin_per_or_hour_usd, 0.00);
  });

  test('5. Specialty and Economic Quadrant filters return cleanly ordered CPT cards', async () => {
    const orthoCards = await getCerCptScorecards(NAPLES_FACILITY_ID, { specialty: 'Orthopedic Surgery' });
    assert.equal(orthoCards.length, 3);
    assert.ok(orthoCards.every(c => c.specialty === 'Orthopedic Surgery'));

    const squeezeCards = await getCerCptScorecards(NAPLES_FACILITY_ID, { quadrant: 'MARGIN_SQUEEZE_AT_RISK' });
    assert.equal(squeezeCards.length, 1);
    assert.equal(squeezeCards[0].cpt_code, '27447');
  });

  test('6. Compiling a new edition filters below statistical validity gate and conserves Net Operating Income', async () => {
    const compiled = await compileCptEconomicsEdition(NAPLES_FACILITY_ID, {
      period_code: '2026-12',
      cpts: [
        {
          cpt_code: '99999',
          procedure_label: 'Rare Exploratory Proc',
          specialty: 'Pain / Spine',
          case_count: 2,
          avg_or_duration_minutes: 30,
          avg_net_reimbursement_usd: 2000,
          avg_implant_cost_usd: 200,
          avg_supply_cost_usd: 100,
          avg_labor_cost_usd: 150
        },
        {
          cpt_code: '29881',
          procedure_label: 'Knee Arthroscopy',
          specialty: 'Orthopedic Surgery',
          case_count: 20,
          avg_or_duration_minutes: 45,
          avg_net_reimbursement_usd: 6000,
          avg_implant_cost_usd: 600,
          avg_supply_cost_usd: 400,
          avg_labor_cost_usd: 350
        }
      ]
    });
    assert.equal(compiled.scorecards.length, 1);
    assert.equal(compiled.scorecards[0].cpt_code, '29881');
    const bal = verifyEditionConservation(compiled.edition);
    assert.equal(bal.is_balanced, true);
    assert.ok(compiled.edition.sha256_report_seal.startsWith('sha256_cer_'));
  });

  test('7. recordCostOptimizationReview enforces >=5 char note guard and produces sealed record', async () => {
    await assert.rejects(
      () => recordCostOptimizationReview(NAPLES_FACILITY_ID, 'cer-cpt-29827', { action_type: 'IMPLANT_NEGOTIATION', notes: 'no' }),
      /ERR_CER_NOTE_REQUIRED/
    );

    const rev = await recordCostOptimizationReview(NAPLES_FACILITY_ID, 'cer-cpt-29827', {
      action_type: 'PREF_CARD_STANDARDIZE',
      target_savings_per_case_usd: 310,
      notes: 'Remove duplicate single-use suture passer from shoulder arthroscopy pack.'
    });
    assert.equal(rev.action_type, 'PREF_CARD_STANDARDIZE');
    assert.equal(rev.target_savings_per_case_usd, 310.00);
    assert.ok(rev.sha256_seal.startsWith('sha256_cer_'));
  });

  test('8. Specialty benchmarks and payer rate parity matrix return reconciled Naples records', async () => {
    const benches = await getCerSpecialtyBenchmarks(NAPLES_FACILITY_ID);
    assert.equal(benches.length, 4);
    assert.ok(benches.some(b => b.specialty === 'Orthopedic Surgery' && b.target_margin_per_or_hour_usd === 3200));

    const rates = await getCerPayerRateMatrix(NAPLES_FACILITY_ID, { cpt_code: '29827' });
    assert.equal(rates.length, 3);
    assert.ok(rates.some(r => r.payer_code === 'PYR-BCBS' && r.medicare_parity_pct === 214));
  });

  test('9. dispatchCptEconomicsDigest logs sealed H0 execution receipt', async () => {
    const dsp = await dispatchCptEconomicsDigest(NAPLES_FACILITY_ID, 'cer-ed-2026q4');
    assert.ok(dsp.rpt_execution_code.startsWith('RPT-H6-RUN-'));
    assert.equal(dsp.dispatch_status, 'DELIVERED');
    assert.ok(dsp.sha256_sync_seal.startsWith('sha256_cer_'));
  });

  test('10. Dual facade parity between src/services and src/lib', () => {
    assert.equal(facade.NAPLES_FACILITY_ID, service.NAPLES_FACILITY_ID);
    assert.equal(typeof facade.evaluateCptUnitEconomics, 'function');
    assert.equal(typeof facade.verifyEditionConservation, 'function');
    assert.equal(typeof facade.compileCptEconomicsEdition, 'function');
    assert.equal(computeCerProvenanceSeal({ a: 1 }), facade.computeCerProvenanceSeal({ a: 1 }));
  });

  test('11. Migration 144 UP/DOWN SQL files contain required 7 tables, view, RLS, and seeds', () => {
    const upSql = fs.readFileSync(path.resolve('supabase/migrations/144_cpt_economics_report.sql'), 'utf8');
    const downSql = fs.readFileSync(path.resolve('supabase/migrations/144_cpt_economics_report_down.sql'), 'utf8');

    [
      'cer_configs',
      'cer_specialty_benchmarks',
      'cer_report_editions',
      'cer_cpt_scorecards',
      'cer_payer_rate_matrix',
      'cer_cost_optimization_reviews',
      'cer_dispatch_logs',
      'vw_cer_telemetry',
      'chk_cer_overhead_nonneg'
    ].forEach(token => {
      assert.ok(upSql.includes(token), `Missing ${token} in 144_cpt_economics_report.sql`);
    });
    assert.ok(upSql.includes('ENABLE ROW LEVEL SECURITY'));
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.cer_configs CASCADE'));
  });

  test('12. Zero prohibited color tokens, dark dropdown + anti-clipping CSS, browser-safe crypto & App.jsx wiring', () => {
    const filesToInspect = [
      'src/services/cptEconomicsReportService.js',
      'src/components/CptEconomicsReportView.jsx',
      'src/components/CptEconomicsReportView.css'
    ];
    const forbidden = /\b(purple|violet|indigo|magenta|fuchsia)\b/i;

    filesToInspect.forEach(file => {
      const content = fs.readFileSync(path.resolve(file), 'utf8');
      assert.equal(forbidden.test(content), false, `Found forbidden color token in ${file}`);
      assert.equal(content.includes("from 'crypto'"), false, `Found unsafe Node crypto import in ${file}`);
    });

    const css = fs.readFileSync(path.resolve('src/components/CptEconomicsReportView.css'), 'utf8');
    assert.ok(css.includes('[data-theme="dark"] .cer-select option'));
    assert.ok(css.includes('minmax(0, 1.45fr)'));

    const appJsx = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8');
    assert.ok(appJsx.includes('CptEconomicsReportView'));
    assert.ok(appJsx.includes("activeTab === 'cpt_economics_report'"));
  });
});
