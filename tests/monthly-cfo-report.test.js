/**
 * ==============================================================================
 * Test Suite: monthly-cfo-report.test.js
 * Module 17: Enterprise Reporting & Executive Packages (Phase H3)
 * Tests: Telemetry & EBITDA Metrics, Facility UUID Normalization,
 *        Config & Masked Secrets, Deterministic computeMonthlyCfoMetrics Math,
 *        GAAP P&L Waterfall Reconciliation Invariant, Compiling New Month Edition,
 *        Close Gate Guards (DQ Trust Score + Open Variance Blockers),
 *        Variance Verification + Dual-Key Controller/CFO Sign-Off + LOCKED Freeze,
 *        H0 Digest Dispatch Logging, Dual Facade Parity, Migration 141 UP/DOWN SQL,
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
  computeMcrProvenanceSeal,
  maskMcrSecret,
  computeMonthlyCfoMetrics,
  verifyPnlReconciliationInvariant,
  getMcrConfig,
  updateMcrConfig,
  getMcrTelemetry,
  getMcrCashBridge,
  compileMonthlyCfoReport,
  verifyVarianceCommentary,
  advanceCfoSignoff,
  dispatchMonthlyCfoDigest
} from '../src/services/monthlyCfoReportService.js';

import * as facade from '../src/lib/monthlyCfoReportService.js';

describe('Phase H3: Monthly CFO Financial & Operational Report', () => {

  test('1. Telemetry returns accurate Net Revenue, EBITDA margin, and sha256_mcr_ seal', async () => {
    const telemetry = await getMcrTelemetry(NAPLES_FACILITY_ID);
    assert.ok(telemetry);
    assert.equal(telemetry.facility_id, NAPLES_FACILITY_ID);
    assert.equal(telemetry.latest_report_code, 'MCR-2026-11-NAP');
    assert.equal(telemetry.latest_net_revenue_usd, 1860000.00);
    assert.equal(telemetry.latest_ebitda_usd, 432000.00);
    assert.equal(telemetry.latest_ebitda_margin_pct, 23.23);
    assert.ok(telemetry.latest_sync_seal.startsWith('sha256_mcr_'));
    assert.equal(telemetry.latest_sync_seal.length, 64);
  });

  test('2. Facility UUID alias resolution matches Naples Surgery Center across strings and objects', () => {
    assert.equal(normalizeFacilityId('fac-naples-01'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId('naples-surgery-center'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ id: 'fac-naples-01' }), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ uuid: NAPLES_FACILITY_ID }), NAPLES_FACILITY_ID);
  });

  test('3. Config retrieval, masked secret check, and trust-score threshold bounds', async () => {
    const cfg = await getMcrConfig('fac-naples-01');
    assert.ok(cfg.client_secret_encrypted.startsWith('mcr_sec_****_'));
    assert.equal(maskMcrSecret('raw_mcr_secret_1908'), 'mcr_sec_****_1908');

    await assert.rejects(
      () => updateMcrConfig(NAPLES_FACILITY_ID, { min_trust_score_for_signoff: 30 }),
      /ERR_MCR_INVALID_CONFIG/
    );
  });

  test('4. computeMonthlyCfoMetrics computes Net Rev, EBITDA, margin %, and cash roll-forward', () => {
    const m = computeMonthlyCfoMetrics({
      gross_charges_usd: 5000000,
      contractual_allowances_usd: 3000000,
      supplies_cost_usd: 600000,
      labor_cost_usd: 500000,
      overhead_opex_usd: 400000,
      opening_cash_usd: 2000000,
      operating_cash_inflows_usd: 1900000,
      payroll_ap_outflows_usd: 1450000,
      capex_debt_outflows_usd: 50000
    });
    assert.equal(m.net_patient_revenue_usd, 2000000.00);
    assert.equal(m.ebitda_usd, 500000.00);
    assert.equal(m.ebitda_margin_pct, 25.00);
    assert.equal(m.closing_cash_usd, 2400000.00);
    assert.equal(m.cash_to_ebitda_conversion_pct, 90.00);
  });

  test('5. verifyPnlReconciliationInvariant enforces Net Rev - Costs === EBITDA', () => {
    const ok = verifyPnlReconciliationInvariant([
      { section: 'REVENUE', actual_usd: 1000000 },
      { section: 'COGS_DIRECT', actual_usd: 500000 },
      { section: 'OPERATING_EXPENSE', actual_usd: 250000 },
      { section: 'EBITDA', actual_usd: 250000 }
    ]);
    assert.equal(ok.balanced, true);

    assert.throws(
      () => verifyPnlReconciliationInvariant([
        { section: 'REVENUE', actual_usd: 1000000 },
        { section: 'COGS_DIRECT', actual_usd: 500000 },
        { section: 'EBITDA', actual_usd: 999999 }
      ]),
      /ERR_MCR_PNL_IMBALANCE/
    );
  });

  test('6. compileMonthlyCfoReport builds reconciled new period and cash roll-forward', async () => {
    const compiled = await compileMonthlyCfoReport(NAPLES_FACILITY_ID, {
      fiscal_period: '2026-12'
    });
    assert.equal(compiled.edition.report_code, 'MCR-2026-12-NAP');
    assert.equal(compiled.pnl_lines_count, 5);
    assert.equal(compiled.edition.sha256_report_seal.length, 64);

    const cash = await getMcrCashBridge(NAPLES_FACILITY_ID, compiled.edition.id);
    assert.equal(cash.closing_cash_usd, compiled.edition.ending_cash_usd);
    assert.equal(cash.cash_variance_against_gl_usd, 0.00);
  });

  test('7. Dual-key close workflow blocks skipping stages and blocks unexplained variances before CFO sign-off', async () => {
    await assert.rejects(
      () => advanceCfoSignoff(NAPLES_FACILITY_ID, 'mcr-ed-202611', { target_status: 'CFO_SIGNED_OFF' }),
      /ERR_MCR_INVALID_TRANSITION/
    );

    const ctrlStep = await advanceCfoSignoff(NAPLES_FACILITY_ID, 'mcr-ed-202611', { target_status: 'CONTROLLER_VERIFIED' });
    assert.equal(ctrlStep.edition.signoff_status, 'CONTROLLER_VERIFIED');

    // Should fail because MCR-VAR-101 is still OPEN_EXPLANATION
    await assert.rejects(
      () => advanceCfoSignoff(NAPLES_FACILITY_ID, 'mcr-ed-202611', { target_status: 'CFO_SIGNED_OFF' }),
      /ERR_MCR_UNEXPLAINED_VARIANCE/
    );
  });

  test('8. Verifying variance commentary unblocks CFO_SIGNED_OFF -> LOCKED_CLOSED immutable freeze', async () => {
    await assert.rejects(
      () => verifyVarianceCommentary(NAPLES_FACILITY_ID, 'mcr-var-101', { driver_summary: 'ok' }),
      /ERR_MCR_COMMENTARY_REQUIRED/
    );

    const verified = await verifyVarianceCommentary(NAPLES_FACILITY_ID, 'mcr-var-101', {
      driver_summary: 'Verified +14 spine/arthroplasty case surge in Nov; Stryker carveout claims filed'
    });
    assert.equal(verified.status, 'VERIFIED');

    const cfoStep = await advanceCfoSignoff(NAPLES_FACILITY_ID, 'mcr-ed-202611', { target_status: 'CFO_SIGNED_OFF' });
    assert.equal(cfoStep.edition.signoff_status, 'CFO_SIGNED_OFF');

    const lockStep = await advanceCfoSignoff(NAPLES_FACILITY_ID, 'mcr-ed-202611', { target_status: 'LOCKED_CLOSED' });
    assert.equal(lockStep.edition.signoff_status, 'LOCKED_CLOSED');
    assert.equal(lockStep.signoff_entry.sha256_seal.length, 64);

    await assert.rejects(
      () => advanceCfoSignoff(NAPLES_FACILITY_ID, 'mcr-ed-202611', { target_status: 'CONTROLLER_VERIFIED' }),
      /ERR_MCR_PERIOD_LOCKED/
    );
  });

  test('9. dispatchMonthlyCfoDigest logs sealed H0 dispatch record', async () => {
    const log = await dispatchMonthlyCfoDigest(NAPLES_FACILITY_ID, 'mcr-ed-202611', {
      delivery_channel: 'EMAIL_DIGEST',
      export_format: 'PDF'
    });
    assert.ok(log.rpt_execution_code.startsWith('RPT-H3-RUN-'));
    assert.equal(log.dispatch_status, 'DELIVERED');
    assert.equal(log.sha256_sync_seal.length, 64);
  });

  test('10. Dual facade re-export parity between src/services/ and src/lib/', () => {
    const seal = computeMcrProvenanceSeal({ mcr: 'parity' });
    assert.equal(facade.computeMcrProvenanceSeal({ mcr: 'parity' }), seal);
    assert.equal(facade.NAPLES_FACILITY_ID, service.NAPLES_FACILITY_ID);
    assert.equal(typeof facade.compileMonthlyCfoReport, 'function');
    assert.equal(typeof facade.advanceCfoSignoff, 'function');
    assert.equal(typeof facade.verifyPnlReconciliationInvariant, 'function');
  });

  test('11. Migration 141 UP/DOWN SQL structural integrity and RLS policies', () => {
    const upPath = path.resolve('supabase/migrations/141_monthly_cfo_report.sql');
    const downPath = path.resolve('supabase/migrations/141_monthly_cfo_report_down.sql');
    assert.ok(fs.existsSync(upPath), 'Migration 141 UP file must exist');
    assert.ok(fs.existsSync(downPath), 'Migration 141 DOWN file must exist');

    const upSql = fs.readFileSync(upPath, 'utf8');
    const downSql = fs.readFileSync(downPath, 'utf8');

    const expectedTables = [
      'mcr_configs',
      'mcr_monthly_editions',
      'mcr_pnl_bridge',
      'mcr_cash_ar_bridges',
      'mcr_variance_commentary',
      'mcr_signoffs',
      'mcr_dispatch_logs'
    ];

    for (const tbl of expectedTables) {
      assert.ok(upSql.includes(`CREATE TABLE IF NOT EXISTS public.${tbl}`), `Missing UP table ${tbl}`);
      assert.ok(upSql.includes(`ALTER TABLE public.${tbl} ENABLE ROW LEVEL SECURITY`), `Missing RLS on ${tbl}`);
      assert.ok(downSql.includes(`DROP TABLE IF EXISTS public.${tbl} CASCADE`), `Missing DOWN drop for ${tbl}`);
    }
    assert.ok(upSql.includes('CREATE OR REPLACE VIEW public.vw_mcr_telemetry'));
    assert.ok(upSql.includes('app.current_facility_id'));
    assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_mcr_telemetry'));
  });

  test('12. Strict zero-prohibited token compliance and App.jsx shell integration', () => {
    const filesToCheck = [
      path.resolve('src/components/MonthlyCfoReportView.jsx'),
      path.resolve('src/components/MonthlyCfoReportView.css'),
      path.resolve('src/services/monthlyCfoReportService.js'),
      path.resolve('src/lib/monthlyCfoReportService.js')
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
    assert.ok(appSource.includes("import MonthlyCfoReportView from './components/MonthlyCfoReportView'"));
    assert.ok(appSource.includes("activeTab === 'monthly_cfo_report'"));
    assert.ok(appSource.includes('<MonthlyCfoReportView activeFacility={activeFacility} />'));
  });
});
