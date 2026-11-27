/**
 * ==============================================================================
 * Test Suite: weekly-revenue-leakage-report.test.js
 * Module 17: Enterprise Reporting & Executive Packages (Phase H2)
 * Tests: Telemetry & Exposure Metrics, Facility UUID Normalization,
 *        Config & Secret Masking, Expected Recovery & Urgency Priority Math,
 *        Compiling New Weekly Edition + Exact Category Sum Conservation,
 *        Mandatory Recovery Note & Ceiling Sanity Checks, Updating Opportunity
 *        to RECOVERED & Edition WoW Update, Category & Payer Concentration Views,
 *        H0 Digest Dispatch Logging, Dual Facade Parity, Migration 140 UP/DOWN SQL,
 *        Zero Prohibited Tokens & App.jsx Shell Wiring.
 * ==============================================================================
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import service, {
  NAPLES_FACILITY_ID,
  normalizeFacilityId,
  computeWlrProvenanceSeal,
  maskWlrSecret,
  computeExpectedNetRecovery,
  scoreAndRankRecoveryOpportunity,
  getWlrConfig,
  updateWlrConfig,
  getWlrTelemetry,
  getWlrCategoryBreakdown,
  getWlrPayerSummary,
  compileWeeklyLeakageReport,
  updateOpportunityRecoveryStatus,
  dispatchWeeklyLeakageDigest
} from '../src/services/weeklyLeakageReportService.js';

import * as facade from '../src/lib/weeklyLeakageReportService.js';

describe('Phase H2: Weekly Revenue Leakage & Prioritized Recovery Report', () => {

  test('1. Telemetry returns accurate weekly exposure, expected recovery, and sha256_wlr_ seal', async () => {
    const telemetry = await getWlrTelemetry(NAPLES_FACILITY_ID);
    assert.ok(telemetry);
    assert.equal(telemetry.facility_id, NAPLES_FACILITY_ID);
    assert.equal(telemetry.latest_week_code, 'WLR-2026-W48');
    assert.equal(telemetry.latest_gross_leakage_usd, 46820.00);
    assert.equal(telemetry.latest_expected_recovery_usd, 36914.50);
    assert.ok(telemetry.open_p0_count >= 4);
    assert.ok(telemetry.latest_sync_seal.startsWith('sha256_wlr_'));
    assert.equal(telemetry.latest_sync_seal.length, 64);
  });

  test('2. Facility UUID alias resolution matches Naples Surgery Center across strings and objects', () => {
    assert.equal(normalizeFacilityId('fac-naples-01'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId('naples-surgery-center'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ id: 'fac-naples-01' }), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ uuid: NAPLES_FACILITY_ID }), NAPLES_FACILITY_ID);
  });

  test('3. Config retrieval, masked secret check, and negative materiality bound rejection', async () => {
    const cfg = await getWlrConfig('fac-naples-01');
    assert.ok(cfg.client_secret_encrypted.startsWith('wlr_sec_****_'));
    assert.equal(maskWlrSecret('raw_wlr_secret_7710'), 'wlr_sec_****_7710');

    await assert.rejects(
      () => updateWlrConfig(NAPLES_FACILITY_ID, { materiality_threshold_usd: -50 }),
      /ERR_WLR_INVALID_CONFIG/
    );
  });

  test('4. Expected recovery and urgency multiplier deterministically classify P0/P1/P2 opportunities', () => {
    assert.equal(computeExpectedNetRecovery(10000, 80), 8000.00);

    const p0Urgent = scoreAndRankRecoveryOpportunity({
      gross_leakage_usd: 2000,
      recovery_probability_pct: 50,
      days_to_timely_filing_limit: 10
    });
    assert.equal(p0Urgent.expected_net_recovery_usd, 1000.00);
    assert.equal(p0Urgent.priority_score, 1500.00); // 1.5x urgency multiplier
    assert.equal(p0Urgent.priority_tier, 'P0_IMMEDIATE');

    const p1Standard = scoreAndRankRecoveryOpportunity({
      gross_leakage_usd: 1200,
      recovery_probability_pct: 75,
      days_to_timely_filing_limit: 40
    });
    assert.equal(p1Standard.expected_net_recovery_usd, 900.00);
    assert.equal(p1Standard.priority_tier, 'P1_THIS_WEEK');
  });

  test('5. compileWeeklyLeakageReport enforces date ordering and conserves category totals', async () => {
    await assert.rejects(
      () => compileWeeklyLeakageReport(NAPLES_FACILITY_ID, {
        week_start_date: '2026-12-07',
        week_end_date: '2026-11-30'
      }),
      /ERR_WLR_INVALID_WEEK/
    );

    const compiled = await compileWeeklyLeakageReport(NAPLES_FACILITY_ID, {
      week_code: 'WLR-2026-W49',
      week_start_date: '2026-11-30',
      week_end_date: '2026-12-06'
    });
    assert.equal(compiled.edition.week_code, 'WLR-2026-W49');
    assert.equal(compiled.edition.sha256_report_seal.length, 64);

    const catSum = Number((
      compiled.edition.unbilled_exposure_usd +
      compiled.edition.underpayment_exposure_usd +
      compiled.edition.implant_carveout_exposure_usd +
      compiled.edition.modifier_omission_exposure_usd +
      compiled.edition.timely_filing_risk_usd
    ).toFixed(2));
    assert.equal(catSum, compiled.edition.total_identified_leakage_usd);
  });

  test('6. updateOpportunityRecoveryStatus rejects missing notes and out-of-bounds recovery payouts', async () => {
    await assert.rejects(
      () => updateOpportunityRecoveryStatus(NAPLES_FACILITY_ID, 'wlr-opp-401', { status: 'RECOVERED', resolution_note: 'ok' }),
      /ERR_WLR_NOTE_REQUIRED/
    );
    await assert.rejects(
      () => updateOpportunityRecoveryStatus(NAPLES_FACILITY_ID, 'wlr-opp-401', {
        status: 'RECOVERED',
        recovered_usd: 999999,
        resolution_note: 'Attempted over-recovery ceiling breach'
      }),
      /ERR_WLR_INVALID_RECOVERY_AMOUNT/
    );
  });

  test('7. Marking opportunity RECOVERED increments edition realized WoW recovery and logs action seal', async () => {
    const res = await updateOpportunityRecoveryStatus(NAPLES_FACILITY_ID, 'wlr-opp-401', {
      status: 'RECOVERED',
      recovered_usd: 13064.00,
      resolution_note: '837P accepted and paid by UnitedHealthcare per fee schedule'
    });
    assert.equal(res.opportunity.status, 'RECOVERED');
    assert.equal(res.opportunity.recovered_usd, 13064.00);
    assert.equal(res.edition_realized_wow_usd, 25514.00); // 12450 + 13064
    assert.equal(res.action.sha256_seal.length, 64);
  });

  test('8. Category and payer summaries accurately summarize W48 concentration', async () => {
    const cats = await getWlrCategoryBreakdown(NAPLES_FACILITY_ID, 'wlr-ed-w48');
    const pays = await getWlrPayerSummary(NAPLES_FACILITY_ID, 'wlr-ed-w48');
    assert.equal(cats.length, 5);
    assert.equal(pays.length, 4);
  });

  test('9. dispatchWeeklyLeakageDigest creates sealed H0 dispatch receipt', async () => {
    const log = await dispatchWeeklyLeakageDigest(NAPLES_FACILITY_ID, 'wlr-ed-w48', {
      delivery_channel: 'EMAIL_DIGEST',
      export_format: 'XLSX',
      recipient_count: 4
    });
    assert.ok(log.rpt_execution_code.startsWith('RPT-H2-RUN-'));
    assert.equal(log.dispatch_status, 'DELIVERED');
    assert.equal(log.sha256_sync_seal.length, 64);
  });

  test('10. Dual facade re-export parity between src/services/ and src/lib/', () => {
    const seal = computeWlrProvenanceSeal({ wlr: 'parity' });
    assert.equal(facade.computeWlrProvenanceSeal({ wlr: 'parity' }), seal);
    assert.equal(facade.NAPLES_FACILITY_ID, service.NAPLES_FACILITY_ID);
    assert.equal(typeof facade.compileWeeklyLeakageReport, 'function');
    assert.equal(typeof facade.scoreAndRankRecoveryOpportunity, 'function');
  });

  test('11. Migration 140 UP/DOWN SQL structural integrity and RLS policies', () => {
    const upPath = path.resolve('supabase/migrations/140_weekly_revenue_leakage_report.sql');
    const downPath = path.resolve('supabase/migrations/140_weekly_revenue_leakage_report_down.sql');
    assert.ok(fs.existsSync(upPath), 'Migration 140 UP file must exist');
    assert.ok(fs.existsSync(downPath), 'Migration 140 DOWN file must exist');

    const upSql = fs.readFileSync(upPath, 'utf8');
    const downSql = fs.readFileSync(downPath, 'utf8');

    const expectedTables = [
      'wlr_configs',
      'wlr_weekly_editions',
      'wlr_priority_opportunities',
      'wlr_category_breakdown',
      'wlr_payer_leakage_summary',
      'wlr_weekly_actions',
      'wlr_dispatch_logs'
    ];

    for (const tbl of expectedTables) {
      assert.ok(upSql.includes(`CREATE TABLE IF NOT EXISTS public.${tbl}`), `Missing UP table ${tbl}`);
      assert.ok(upSql.includes(`ALTER TABLE public.${tbl} ENABLE ROW LEVEL SECURITY`), `Missing RLS on ${tbl}`);
      assert.ok(downSql.includes(`DROP TABLE IF EXISTS public.${tbl} CASCADE`), `Missing DOWN drop for ${tbl}`);
    }
    assert.ok(upSql.includes('CREATE OR REPLACE VIEW public.vw_wlr_telemetry'));
    assert.ok(upSql.includes('app.current_facility_id'));
    assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_wlr_telemetry'));
  });

  test('12. Strict zero-prohibited token compliance and App.jsx shell integration', () => {
    const filesToCheck = [
      path.resolve('src/components/WeeklyRevenueLeakageReportView.jsx'),
      path.resolve('src/components/WeeklyRevenueLeakageReportView.css'),
      path.resolve('src/services/weeklyLeakageReportService.js'),
      path.resolve('src/lib/weeklyLeakageReportService.js')
    ];

    const prohibited = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];
    for (const file of filesToCheck) {
      assert.ok(fs.existsSync(file), `File must exist: ${file}`);
      const content = fs.readFileSync(file, 'utf8').toLowerCase();
      for (const word of prohibited) {
        assert.equal(content.includes(word), false, `Prohibited color token "${word}" found in ${file}`);
      }
    }

    const appSource = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8');
    assert.ok(appSource.includes("import WeeklyRevenueLeakageReportView from './components/WeeklyRevenueLeakageReportView'"));
    assert.ok(appSource.includes("activeTab === 'weekly_revenue_leakage_report'"));
    assert.ok(appSource.includes('<WeeklyRevenueLeakageReportView activeFacility={activeFacility} />'));
  });
});
