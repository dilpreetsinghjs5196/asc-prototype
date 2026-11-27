/**
 * ==============================================================================
 * Test Suite: denial-ar-report.test.js
 * Module 17: Enterprise Reporting & Executive Packages (Phase H8)
 * Tests: Telemetry & AR Metrics, Facility Alias Normalization,
 *        Config Threshold Bounds Guard, Deterministic Denial Recovery & DSO Math,
 *        Urgency & Category Filters, Conserved GAAP 6-Bucket Edition Compilation,
 *        Appeal/Write-Off Note Guard & Seal, Aging Schedule & CARC Clusters,
 *        H0 Dispatch Logging, Dual Facade Parity, Migration 146 UP/DOWN SQL,
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
  computeDarProvenanceSeal,
  maskDarSecret,
  calculateDsoDays,
  evaluateDenialItem,
  verifyArBucketConservation,
  getDarConfig,
  updateDarConfig,
  getDarTelemetry,
  getDarAgingSnapshots,
  getDarDenialWorkqueue,
  getDarCarcRootCauses,
  compileDenialArEdition,
  recordAppealResolutionAction,
  dispatchDenialArDigest
} from '../src/services/denialArReportService.js';

import * as facade from '../src/lib/denialArReportService.js';

describe('Phase H8: Denials, Appeals & GAAP AR Aging Report', () => {

  test('1. Telemetry returns accurate Naples Gross AR, DSO, AR > 90%, Open Denials, and sha256_dar_ seal', async () => {
    const telemetry = await getDarTelemetry(NAPLES_FACILITY_ID);
    assert.ok(telemetry);
    assert.equal(telemetry.facility_id, NAPLES_FACILITY_ID);
    assert.equal(telemetry.latest_edition_code, 'DAR-2026-11-NAP');
    assert.equal(telemetry.total_gross_ar_usd, 640000.00);
    assert.equal(telemetry.ar_over_90_pct, 14.00);
    assert.equal(telemetry.calculated_dso_days, 32.0);
    assert.equal(telemetry.open_denied_exposure_usd, 94500.00);
    assert.equal(telemetry.critical_filing_threats, 1);
    assert.ok(telemetry.latest_sync_seal.startsWith('sha256_dar_'));
    assert.equal(telemetry.latest_sync_seal.length, 64);
  });

  test('2. Facility UUID alias resolution normalizes strings and objects cleanly', () => {
    assert.equal(normalizeFacilityId('fac-naples-01'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId('naples-surgery-center'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ id: 'fac-naples-01' }), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ uuid: NAPLES_FACILITY_ID }), NAPLES_FACILITY_ID);
  });

  test('3. Config retrieval, masked secret, and invalid DSO/filing bounds guard', async () => {
    const cfg = await getDarConfig('fac-naples-01');
    assert.ok(cfg.client_secret_encrypted.startsWith('dar_sec_****_'));
    assert.equal(maskDarSecret('raw_dar_secret_8412'), 'dar_sec_****_8412');

    await assert.rejects(
      () => updateDarConfig(NAPLES_FACILITY_ID, { dso_benchmark_days: 5 }),
      /ERR_DAR_INVALID_CONFIG/
    );
    await assert.rejects(
      () => updateDarConfig(NAPLES_FACILITY_ID, { timely_filing_warning_days: 1 }),
      /ERR_DAR_INVALID_CONFIG/
    );
  });

  test('4. evaluateDenialItem and calculateDsoDays compute expected recovery, urgency tiers, and 0-rev guard', () => {
    const critical = evaluateDenialItem(
      { denied_exposure_usd: 20000, recovery_probability_pct: 75, days_to_timely_filing: 7 },
      { timely_filing_warning_days: 14 }
    );
    assert.equal(critical.expected_recovery_usd, 15000.00);
    assert.equal(critical.urgency_tier, 'CRITICAL_FILING_THREAT');

    const writeoff = evaluateDenialItem({ denied_exposure_usd: 5000, recovery_probability_pct: 12, days_to_timely_filing: 5 });
    assert.equal(writeoff.urgency_tier, 'LOW_RECOVERY_WRITEOFF');

    assert.equal(calculateDsoDays(500000, 1500000), 30.0);
    assert.equal(calculateDsoDays(500000, 0), 0.0);
  });

  test('5. Workqueue filters cleanly by urgency_tier and denial_category', async () => {
    const threats = await getDarDenialWorkqueue(NAPLES_FACILITY_ID, { urgency_tier: 'CRITICAL_FILING_THREAT' });
    assert.equal(threats.length, 1);
    assert.equal(threats[0].denial_code, 'DEN-2611-01');

    const coding = await getDarDenialWorkqueue(NAPLES_FACILITY_ID, { denial_category: 'CODING_MODIFIER_UNBUNDLED' });
    assert.equal(coding.length, 2);
  });

  test('6. Compiling a new edition enforces GAAP 6-bucket AR conservation and computes DSO', async () => {
    const compiled = await compileDenialArEdition(NAPLES_FACILITY_ID, {
      period_code: '2026-12',
      trailing_90_revenue_usd: 1500000,
      aging_buckets: [
        { bucket_code: '0_30', ar_amount_usd: 300000 },
        { bucket_code: '31_60', ar_amount_usd: 100000 },
        { bucket_code: '61_90', ar_amount_usd: 50000 },
        { bucket_code: '91_120', ar_amount_usd: 30000 },
        { bucket_code: '121_180', ar_amount_usd: 15000 },
        { bucket_code: '181_PLUS', ar_amount_usd: 5000 }
      ]
    });
    assert.equal(compiled.edition.total_gross_ar_usd, 500000.00);
    assert.equal(compiled.edition.ar_over_90_usd, 50000.00);
    assert.equal(compiled.edition.ar_over_90_pct, 10.00);
    assert.equal(compiled.edition.calculated_dso_days, 30.0);
    const conserved = verifyArBucketConservation(compiled.aging_buckets, 500000.00, 50000.00);
    assert.equal(conserved.is_conserved, true);
    assert.ok(compiled.edition.sha256_report_seal.startsWith('sha256_dar_'));
  });

  test('7. recordAppealResolutionAction enforces >=5 char note guard and produces sealed entry', async () => {
    await assert.rejects(
      () => recordAppealResolutionAction(NAPLES_FACILITY_ID, 'den-1', { action_type: 'SUBMIT_LEVEL_1_APPEAL', notes: 'send' }),
      /ERR_DAR_NOTE_REQUIRED/
    );

    const res = await recordAppealResolutionAction(NAPLES_FACILITY_ID, 'den-1', {
      action_type: 'SUBMIT_LEVEL_1_APPEAL',
      claimed_recovery_usd: 24300,
      notes: 'Submitted signed operative report and retro-auth confirmation via UHC portal.'
    });
    assert.equal(res.action_type, 'SUBMIT_LEVEL_1_APPEAL');
    assert.equal(res.claimed_recovery_usd, 24300.00);
    assert.ok(res.sha256_seal.startsWith('sha256_dar_'));
  });

  test('8. GAAP 6-bucket snapshots and CARC clusters reconcile Naples figures cleanly', async () => {
    const buckets = await getDarAgingSnapshots(NAPLES_FACILITY_ID, 'dar-ed-202611');
    assert.equal(buckets.length, 6);
    assert.equal(buckets[0].bucket_code, '0_30');
    const bal = verifyArBucketConservation(buckets, 640000.00, 89600.00);
    assert.equal(bal.is_conserved, true);

    const carcs = await getDarCarcRootCauses(NAPLES_FACILITY_ID, 'dar-ed-202611');
    assert.equal(carcs.length, 5);
    assert.equal(carcs[0].carc_code, '197');
  });

  test('9. dispatchDenialArDigest logs sealed H0 execution receipt', async () => {
    const dsp = await dispatchDenialArDigest(NAPLES_FACILITY_ID, 'dar-ed-202611');
    assert.ok(dsp.rpt_execution_code.startsWith('RPT-H8-RUN-'));
    assert.equal(dsp.dispatch_status, 'DELIVERED');
    assert.ok(dsp.sha256_sync_seal.startsWith('sha256_dar_'));
  });

  test('10. Dual facade parity between src/services and src/lib', () => {
    assert.equal(facade.NAPLES_FACILITY_ID, service.NAPLES_FACILITY_ID);
    assert.equal(typeof facade.evaluateDenialItem, 'function');
    assert.equal(typeof facade.verifyArBucketConservation, 'function');
    assert.equal(typeof facade.compileDenialArEdition, 'function');
    assert.equal(computeDarProvenanceSeal({ a: 1 }), facade.computeDarProvenanceSeal({ a: 1 }));
  });

  test('11. Migration 146 UP/DOWN SQL files contain required 7 tables, view, RLS, and seeds', () => {
    const upSql = fs.readFileSync(path.resolve('supabase/migrations/146_denial_ar_report.sql'), 'utf8');
    const downSql = fs.readFileSync(path.resolve('supabase/migrations/146_denial_ar_report_down.sql'), 'utf8');

    [
      'dar_configs',
      'dar_report_editions',
      'dar_aging_snapshots',
      'dar_denial_workqueue',
      'dar_carc_root_causes',
      'dar_appeal_resolutions',
      'dar_dispatch_logs',
      'vw_dar_telemetry',
      'chk_dar_thresholds'
    ].forEach(token => {
      assert.ok(upSql.includes(token), `Missing ${token} in 146_denial_ar_report.sql`);
    });
    assert.ok(upSql.includes('ENABLE ROW LEVEL SECURITY'));
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.dar_configs CASCADE'));
  });

  test('12. Zero prohibited color tokens, dark dropdown + anti-clipping CSS, browser-safe crypto & App.jsx wiring', () => {
    const filesToInspect = [
      'src/services/denialArReportService.js',
      'src/components/DenialArReportView.jsx',
      'src/components/DenialArReportView.css'
    ];
    const forbidden = /\b(purple|violet|indigo|magenta|fuchsia)\b/i;

    filesToInspect.forEach(file => {
      const content = fs.readFileSync(path.resolve(file), 'utf8');
      assert.equal(forbidden.test(content), false, `Found forbidden color token in ${file}`);
      assert.equal(content.includes("from 'crypto'"), false, `Found unsafe Node crypto import in ${file}`);
    });

    const css = fs.readFileSync(path.resolve('src/components/DenialArReportView.css'), 'utf8');
    assert.ok(css.includes('[data-theme="dark"] .dar-select option'));
    assert.ok(css.includes('minmax(0, 1.45fr)'));

    const appJsx = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8');
    assert.ok(appJsx.includes('DenialArReportView'));
    assert.ok(appJsx.includes("activeTab === 'denial_ar_report'"));
  });
});
