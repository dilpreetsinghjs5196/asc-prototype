/**
 * ==============================================================================
 * Test Suite: payer-scorecard-report.test.js
 * Module 17: Enterprise Reporting & Executive Packages (Phase H5)
 * Tests: Telemetry & Seal Verification, Facility Alias Resolution,
 *        Config & 4-Pillar Weight Conservation Guard, Deterministic Scoring Math,
 *        Category & Grade Filtering, Compiling New Edition, Negotiation Action
 *        Validation Guard & Seal, Benchmarks & Contract Shortfalls,
 *        H0 Dispatch Logging, Dual Facade Parity, Migration 143 UP/DOWN SQL,
 *        Zero Prohibited Color Tokens & Responsive CSS + App.jsx Shell Wiring.
 * ==============================================================================
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import service, {
  NAPLES_FACILITY_ID,
  normalizeFacilityId,
  computePsrProvenanceSeal,
  maskPsrSecret,
  validatePayerWeights,
  evaluatePayerScorecard,
  getPsrConfig,
  updatePsrConfig,
  getPsrTelemetry,
  getPsrCategoryBenchmarks,
  getPsrPayerScorecards,
  getPsrContractVariances,
  compilePayerScorecardEdition,
  recordPayerNegotiationAction,
  dispatchPayerScorecardDigest
} from '../src/services/payerScorecardReportService.js';

import * as facade from '../src/lib/payerScorecardReportService.js';

describe('Phase H5: Payer Reimbursement & Contract Scorecard', () => {

  test('1. Telemetry returns accurate Naples payer portfolio totals and 64-char sha256_psr_ seal', async () => {
    const telemetry = await getPsrTelemetry(NAPLES_FACILITY_ID);
    assert.ok(telemetry);
    assert.equal(telemetry.facility_id, NAPLES_FACILITY_ID);
    assert.equal(telemetry.latest_edition_code, 'PSR-2026-Q4-NAP');
    assert.equal(telemetry.payers_evaluated, 5);
    assert.equal(telemetry.avg_composite_score, 79.40);
    assert.equal(telemetry.total_net_collections_usd, 1796500.00);
    assert.equal(telemetry.total_underpayment_leakage_usd, 83500.00);
    assert.equal(telemetry.urgent_renewals_count, 2);
    assert.ok(telemetry.latest_sync_seal.startsWith('sha256_psr_'));
    assert.equal(telemetry.latest_sync_seal.length, 64);
  });

  test('2. Facility UUID alias resolution normalizes strings and objects cleanly', () => {
    assert.equal(normalizeFacilityId('fac-naples-01'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId('naples-surgery-center'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ id: 'fac-naples-01' }), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ uuid: NAPLES_FACILITY_ID }), NAPLES_FACILITY_ID);
  });

  test('3. Config retrieval, secret masking, and conserved 100.00% weight rejection guard', async () => {
    const cfg = await getPsrConfig('fac-naples-01');
    assert.ok(cfg.client_secret_encrypted.startsWith('psr_sec_****_'));
    assert.equal(maskPsrSecret('raw_psr_secret_5129'), 'psr_sec_****_5129');

    const valid = validatePayerWeights({
      weight_contract_yield_pct: 40,
      weight_payment_velocity_pct: 20,
      weight_clean_claim_rate_pct: 25,
      weight_carveout_recovery_pct: 15
    });
    assert.equal(valid.total_weight_pct, 100.00);

    await assert.rejects(
      () => updatePsrConfig(NAPLES_FACILITY_ID, { weight_contract_yield_pct: 50 }),
      /ERR_PSR_INVALID_WEIGHT_SUM/
    );
  });

  test('4. evaluatePayerScorecard computes contract yield, underpayment leakage, grade, renewal alert, and 0-denom guard', () => {
    const res = evaluatePayerScorecard(
      {
        expected_allowed_usd: 500000,
        actual_collected_usd: 490000,
        avg_days_to_pay: 22,
        first_pass_denial_pct: 3.5,
        carveout_recovery_pct: 94,
        days_to_renewal: 60
      },
      { target_yield_pct: 95.5, target_days_to_pay: 28 },
      { critical_renewal_window_days: 90 }
    );
    assert.equal(res.underpayment_leakage_usd, 10000.00);
    assert.equal(res.contract_yield_pct, 98.00);
    assert.ok(res.composite_score >= 88);
    assert.equal(res.performance_grade, 'A_PREFERRED');
    assert.equal(res.renewal_alert_status, 'RENEWAL_NOTICE_URGENT');

    const zeroDenom = evaluatePayerScorecard({ expected_allowed_usd: 0, actual_collected_usd: 0 });
    assert.equal(zeroDenom.contract_yield_pct, 0.00);
    assert.equal(zeroDenom.underpayment_leakage_usd, 0.00);
  });

  test('5. Category and grade filters return properly ordered payer scorecards', async () => {
    const commercialCards = await getPsrPayerScorecards(NAPLES_FACILITY_ID, { category: 'Commercial' });
    assert.equal(commercialCards.length, 4);
    assert.equal(commercialCards[0].payer_code, 'PYR-BCBS');

    const frictionalCards = await getPsrPayerScorecards(NAPLES_FACILITY_ID, { grade: 'C_FRICTIONAL' });
    assert.equal(frictionalCards.length, 2);
    assert.ok(frictionalCards.every(c => c.performance_grade === 'C_FRICTIONAL'));
  });

  test('6. Compiling a new edition ranks payers descending and conserves collections & leakage totals', async () => {
    const compiled = await compilePayerScorecardEdition(NAPLES_FACILITY_ID, {
      period_code: '2026-12',
      payers: [
        {
          payer_code: 'PYR-TEST-LOW',
          payer_name: 'Slow Payer',
          payer_category: 'Commercial',
          expected_allowed_usd: 100000,
          actual_collected_usd: 80000,
          avg_days_to_pay: 48,
          first_pass_denial_pct: 14,
          carveout_recovery_pct: 65,
          days_to_renewal: 45
        },
        {
          payer_code: 'PYR-TEST-HIGH',
          payer_name: 'Premier Payer',
          payer_category: 'Medicare',
          expected_allowed_usd: 200000,
          actual_collected_usd: 198000,
          avg_days_to_pay: 15,
          first_pass_denial_pct: 2,
          carveout_recovery_pct: 97,
          days_to_renewal: 240
        }
      ]
    });
    assert.equal(compiled.scorecards.length, 2);
    assert.equal(compiled.scorecards[0].payer_code, 'PYR-TEST-HIGH');
    assert.equal(compiled.scorecards[0].rank_in_facility, 1);
    assert.equal(compiled.edition.total_net_collections_usd, 278000.00);
    assert.equal(compiled.edition.total_underpayment_leakage_usd, 22000.00);
    assert.ok(compiled.edition.sha256_report_seal.startsWith('sha256_psr_'));
  });

  test('7. recordPayerNegotiationAction enforces >=5 char note and creates sealed audit entry', async () => {
    await assert.rejects(
      () => recordPayerNegotiationAction(NAPLES_FACILITY_ID, 'pcard-uhc', { action_type: 'CARVEOUT_AUDIT', notes: 'abc' }),
      /ERR_PSR_NOTE_REQUIRED/
    );

    const act = await recordPayerNegotiationAction(NAPLES_FACILITY_ID, 'pcard-uhc', {
      action_type: 'RENEGOTIATION_NOTICE',
      target_recovery_usd: 26200,
      notes: 'Sent 45-day contract termination/renegotiation notice to UHC.'
    });
    assert.equal(act.action_type, 'RENEGOTIATION_NOTICE');
    assert.equal(act.target_recovery_usd, 26200.00);
    assert.ok(act.sha256_seal.startsWith('sha256_psr_'));
  });

  test('8. Category benchmarks and CPT contract shortfall details return reconciled Naples data', async () => {
    const benches = await getPsrCategoryBenchmarks(NAPLES_FACILITY_ID);
    assert.equal(benches.length, 4);
    assert.ok(benches.some(b => b.payer_category === 'Commercial' && b.target_yield_pct === 95.5));

    const vars = await getPsrContractVariances(NAPLES_FACILITY_ID, { payer_code: 'PYR-UHC' });
    assert.equal(vars.length, 3);
    assert.equal(vars[0].cpt_code, '29827');
    assert.equal(vars[0].shortfall_usd, 14400.00);
  });

  test('9. dispatchPayerScorecardDigest logs sealed H0 execution record', async () => {
    const dsp = await dispatchPayerScorecardDigest(NAPLES_FACILITY_ID, 'psr-ed-2026q4');
    assert.ok(dsp.rpt_execution_code.startsWith('RPT-H5-RUN-'));
    assert.equal(dsp.dispatch_status, 'DELIVERED');
    assert.ok(dsp.sha256_sync_seal.startsWith('sha256_psr_'));
  });

  test('10. Dual facade parity between src/services and src/lib', () => {
    assert.equal(facade.NAPLES_FACILITY_ID, service.NAPLES_FACILITY_ID);
    assert.equal(typeof facade.evaluatePayerScorecard, 'function');
    assert.equal(typeof facade.validatePayerWeights, 'function');
    assert.equal(typeof facade.compilePayerScorecardEdition, 'function');
    assert.equal(computePsrProvenanceSeal({ a: 1 }), facade.computePsrProvenanceSeal({ a: 1 }));
  });

  test('11. Migration 143 UP/DOWN SQL files contain required 7 tables, view, RLS, and seeds', () => {
    const upSql = fs.readFileSync(path.resolve('supabase/migrations/143_payer_scorecard_report.sql'), 'utf8');
    const downSql = fs.readFileSync(path.resolve('supabase/migrations/143_payer_scorecard_report_down.sql'), 'utf8');

    [
      'psr_configs',
      'psr_category_benchmarks',
      'psr_report_editions',
      'psr_payer_scorecards',
      'psr_contract_variance_details',
      'psr_negotiation_actions',
      'psr_dispatch_logs',
      'vw_psr_telemetry',
      'chk_psr_weights_100'
    ].forEach(token => {
      assert.ok(upSql.includes(token), `Missing ${token} in 143_payer_scorecard_report.sql`);
    });
    assert.ok(upSql.includes('ENABLE ROW LEVEL SECURITY'));
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.psr_configs CASCADE'));
  });

  test('12. Zero prohibited color tokens, dark dropdown + anti-clipping CSS, browser-safe crypto & App.jsx wiring', () => {
    const filesToInspect = [
      'src/services/payerScorecardReportService.js',
      'src/components/PayerScorecardReportView.jsx',
      'src/components/PayerScorecardReportView.css'
    ];
    const forbidden = /\b(purple|violet|indigo|magenta|fuchsia)\b/i;

    filesToInspect.forEach(file => {
      const content = fs.readFileSync(path.resolve(file), 'utf8');
      assert.equal(forbidden.test(content), false, `Found forbidden color token in ${file}`);
      assert.equal(content.includes("from 'crypto'"), false, `Found unsafe Node crypto import in ${file}`);
    });

    const css = fs.readFileSync(path.resolve('src/components/PayerScorecardReportView.css'), 'utf8');
    assert.ok(css.includes('[data-theme="dark"] .psr-select option'));
    assert.ok(css.includes('minmax(0, 1.45fr)'));

    const appJsx = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8');
    assert.ok(appJsx.includes('PayerScorecardReportView'));
    assert.ok(appJsx.includes("activeTab === 'payer_scorecard_report'"));
  });
});
