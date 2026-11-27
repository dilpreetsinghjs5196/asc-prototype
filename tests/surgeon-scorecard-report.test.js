/**
 * ==============================================================================
 * Test Suite: surgeon-scorecard-report.test.js
 * Module 17: Enterprise Reporting & Executive Packages (Phase H4)
 * Tests: Facility Telemetry & Seal, Facility Alias Normalization,
 *        Config & 4-Pillar Weight Conservation Guard, Deterministic Scoring Math,
 *        Role-Aware Peer Anonymization, Compiling New Edition w/ Min Case Filter,
 *        Confidential Peer Review Note Guard & Seal, Benchmarks & CPT Mix,
 *        H0 Dispatch Logging, Dual Facade Parity, Migration 142 UP/DOWN SQL,
 *        Zero Prohibited Color Tokens & App.jsx Shell Wiring.
 * ==============================================================================
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import service, {
  NAPLES_FACILITY_ID,
  normalizeFacilityId,
  computeSsrProvenanceSeal,
  maskSsrSecret,
  validateScorecardWeights,
  evaluateSurgeonScorecard,
  getSsrConfig,
  updateSsrConfig,
  getSsrTelemetry,
  getSsrSpecialtyBenchmarks,
  getSsrSurgeonScorecards,
  getSsrCptMix,
  compileSurgeonScorecardEdition,
  recordSurgeonPeerReview,
  dispatchSurgeonScorecardDigest
} from '../src/services/surgeonScorecardReportService.js';

import * as facade from '../src/lib/surgeonScorecardReportService.js';

describe('Phase H4: Surgeon Scorecard & Specialty Peer Benchmarking', () => {

  test('1. Telemetry returns accurate Naples scorecard metrics and 64-char sha256_ssr_ seal', async () => {
    const telemetry = await getSsrTelemetry(NAPLES_FACILITY_ID);
    assert.ok(telemetry);
    assert.equal(telemetry.facility_id, NAPLES_FACILITY_ID);
    assert.equal(telemetry.latest_edition_code, 'SSR-2026-11-NAP');
    assert.equal(telemetry.surgeons_evaluated, 4);
    assert.equal(telemetry.avg_composite_score, 83.40);
    assert.equal(telemetry.total_surgeon_margin_usd, 706240.00);
    assert.equal(telemetry.top_quartile_count, 2);
    assert.ok(telemetry.latest_sync_seal.startsWith('sha256_ssr_'));
    assert.equal(telemetry.latest_sync_seal.length, 64);
  });

  test('2. Facility UUID alias resolution normalizes strings and objects cleanly', () => {
    assert.equal(normalizeFacilityId('fac-naples-01'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId('naples-surgery-center'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ id: 'fac-naples-01' }), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ uuid: NAPLES_FACILITY_ID }), NAPLES_FACILITY_ID);
  });

  test('3. Config retrieval, secret masking, and conserved 100.00% weight rejection guard', async () => {
    const cfg = await getSsrConfig('fac-naples-01');
    assert.ok(cfg.client_secret_encrypted.startsWith('ssr_sec_****_'));
    assert.equal(maskSsrSecret('raw_ssr_secret_4418'), 'ssr_sec_****_4418');

    const valid = validateScorecardWeights({
      weight_contribution_margin_pct: 40,
      weight_or_efficiency_pct: 20,
      weight_supply_discipline_pct: 25,
      weight_documentation_quality_pct: 15
    });
    assert.equal(valid.total_weight_pct, 100.00);

    await assert.rejects(
      () => updateSsrConfig(NAPLES_FACILITY_ID, { weight_contribution_margin_pct: 45 }),
      /ERR_SSR_INVALID_WEIGHT_SUM/
    );
  });

  test('4. evaluateSurgeonScorecard computes margin/OR hr, 4-pillar score, tier, and 0-hour safe guard', () => {
    const res = evaluateSurgeonScorecard(
      {
        net_revenue_usd: 250000,
        direct_cost_usd: 90000,
        total_or_hours: 40,
        avg_turnover_minutes: 15,
        preference_card_variance_pct: 1.5,
        doc_completeness_pct: 98
      },
      {
        median_margin_per_or_hour_usd: 2950,
        top_quartile_margin_per_or_hour_usd: 3850,
        benchmark_turnover_minutes: 18,
        benchmark_supply_variance_pct: 3.0
      }
    );
    assert.equal(res.contribution_margin_usd, 160000.00);
    assert.equal(res.margin_per_or_hour_usd, 4000.00);
    assert.ok(res.composite_score >= 85);
    assert.equal(res.performance_tier, 'TOP_QUARTILE_ELITE');

    const zeroHr = evaluateSurgeonScorecard({ net_revenue_usd: 10000, direct_cost_usd: 5000, total_or_hours: 0 });
    assert.equal(zeroHr.margin_per_or_hour_usd, 0.00);
  });

  test('5. Peer privacy control anonymizes peer surgeons under Surgeon Self-View while revealing own card', async () => {
    const selfCards = await getSsrSurgeonScorecards(NAPLES_FACILITY_ID, {
      actor_role: 'Surgeon Self-View',
      viewer_surgeon_code: 'SRG-MAL'
    });
    assert.equal(selfCards.length, 4);
    const self = selfCards.find(c => c.surgeon_code === 'SRG-MAL');
    const peer = selfCards.find(c => c.surgeon_code === 'SRG-GAR');
    assert.equal(self.surgeon_name, 'Dr. Malinoski Kelly');
    assert.equal(self.is_anonymized_peer, false);
    assert.equal(peer.surgeon_name, 'Peer Surgeon #2');
    assert.equal(peer.npi, '**********');
    assert.equal(peer.is_anonymized_peer, true);
  });

  test('6. Compiling a new edition filters below min_cases_for_benchmark and ranks descending', async () => {
    const compiled = await compileSurgeonScorecardEdition(NAPLES_FACILITY_ID, {
      period_code: '2026-12',
      surgeons: [
        {
          surgeon_code: 'SRG-LOW',
          surgeon_name: 'Dr. Low Volume',
          specialty: 'Ophthalmology',
          completed_cases: 4,
          total_or_hours: 5,
          net_revenue_usd: 20000,
          direct_cost_usd: 8000,
          avg_turnover_minutes: 15,
          preference_card_variance_pct: 2.0,
          doc_completeness_pct: 95
        },
        {
          surgeon_code: 'SRG-ALPHA',
          surgeon_name: 'Dr. Alpha',
          specialty: 'Orthopedic Surgery',
          completed_cases: 25,
          total_or_hours: 30,
          net_revenue_usd: 180000,
          direct_cost_usd: 60000,
          avg_turnover_minutes: 16,
          preference_card_variance_pct: 1.5,
          doc_completeness_pct: 98
        }
      ]
    });
    assert.equal(compiled.scorecards.length, 1);
    assert.equal(compiled.scorecards[0].surgeon_code, 'SRG-ALPHA');
    assert.equal(compiled.scorecards[0].rank_in_facility, 1);
    assert.ok(compiled.edition.sha256_report_seal.startsWith('sha256_ssr_'));
  });

  test('7. recordSurgeonPeerReview enforces >=5 char note guard and produces sealed review record', async () => {
    await assert.rejects(
      () => recordSurgeonPeerReview(NAPLES_FACILITY_ID, 'card-mal', { action_type: 'MEDICAL_DIR_REVIEW', notes: 'ok' }),
      /ERR_SSR_NOTE_REQUIRED/
    );

    const rev = await recordSurgeonPeerReview(NAPLES_FACILITY_ID, 'card-mal', {
      action_type: 'SUPPLY_COACHING',
      notes: 'Aligned implant vendor preference cards for arthroplasty.'
    });
    assert.equal(rev.action_type, 'SUPPLY_COACHING');
    assert.ok(rev.sha256_seal.startsWith('sha256_ssr_'));
  });

  test('8. Specialty benchmarks and CPT mix drill-down return reconciled Naples records', async () => {
    const benches = await getSsrSpecialtyBenchmarks(NAPLES_FACILITY_ID);
    assert.equal(benches.length, 4);
    assert.ok(benches.some(b => b.specialty === 'Orthopedic Surgery' && b.top_quartile_margin_per_or_hour_usd === 3850));

    const cptRows = await getSsrCptMix(NAPLES_FACILITY_ID, { surgeon_code: 'SRG-MAL' });
    assert.equal(cptRows.length, 3);
    assert.equal(cptRows[0].cpt_code, '29881');
  });

  test('9. dispatchSurgeonScorecardDigest creates sealed H0 execution log', async () => {
    const dsp = await dispatchSurgeonScorecardDigest(NAPLES_FACILITY_ID, 'ssr-ed-202611');
    assert.ok(dsp.rpt_execution_code.startsWith('RPT-H4-RUN-'));
    assert.equal(dsp.dispatch_status, 'DELIVERED');
    assert.ok(dsp.sha256_sync_seal.startsWith('sha256_ssr_'));
  });

  test('10. Dual facade parity between src/services and src/lib', () => {
    assert.equal(facade.NAPLES_FACILITY_ID, service.NAPLES_FACILITY_ID);
    assert.equal(typeof facade.evaluateSurgeonScorecard, 'function');
    assert.equal(typeof facade.validateScorecardWeights, 'function');
    assert.equal(typeof facade.compileSurgeonScorecardEdition, 'function');
    assert.equal(computeSsrProvenanceSeal({ a: 1 }), facade.computeSsrProvenanceSeal({ a: 1 }));
  });

  test('11. Migration 142 UP/DOWN SQL files contain required 7 tables, view, RLS, and seeds', () => {
    const upSql = fs.readFileSync(path.resolve('supabase/migrations/142_surgeon_scorecard_report.sql'), 'utf8');
    const downSql = fs.readFileSync(path.resolve('supabase/migrations/142_surgeon_scorecard_report_down.sql'), 'utf8');

    [
      'ssr_configs',
      'ssr_specialty_benchmarks',
      'ssr_report_editions',
      'ssr_surgeon_scorecards',
      'ssr_cpt_mix_details',
      'ssr_peer_reviews',
      'ssr_dispatch_logs',
      'vw_ssr_telemetry',
      'chk_ssr_weights_100'
    ].forEach(token => {
      assert.ok(upSql.includes(token), `Missing ${token} in 142_surgeon_scorecard_report.sql`);
    });
    assert.ok(upSql.includes('ENABLE ROW LEVEL SECURITY'));
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.ssr_configs CASCADE'));
  });

  test('12. Zero prohibited color tokens and clean App.jsx shell wiring + browser-safe crypto', () => {
    const filesToInspect = [
      'src/services/surgeonScorecardReportService.js',
      'src/components/SurgeonScorecardReportView.jsx',
      'src/components/SurgeonScorecardReportView.css'
    ];
    const forbidden = /\b(purple|violet|indigo|magenta|fuchsia)\b/i;

    filesToInspect.forEach(file => {
      const content = fs.readFileSync(path.resolve(file), 'utf8');
      assert.equal(forbidden.test(content), false, `Found forbidden color token in ${file}`);
      assert.equal(content.includes("from 'crypto'"), false, `Found unsafe Node crypto import in ${file}`);
    });

    const css = fs.readFileSync(path.resolve('src/components/SurgeonScorecardReportView.css'), 'utf8');
    assert.ok(css.includes('[data-theme="dark"] .ssr-select option'));

    const appJsx = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8');
    assert.ok(appJsx.includes('SurgeonScorecardReportView'));
    assert.ok(appJsx.includes("activeTab === 'surgeon_scorecard_report'"));
  });
});
