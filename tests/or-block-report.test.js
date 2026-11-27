/**
 * ==============================================================================
 * Test Suite: or-block-report.test.js
 * Module 17: Enterprise Reporting & Executive Packages (Phase H7)
 * Tests: Telemetry & Adjusted Util %, Facility Alias Resolution,
 *        Config Target/Cutoff Bounds Guard, Deterministic evaluateOrBlockPerformance,
 *        Block Tier & Specialty Filters, Conserved Edition Time Reconciliation,
 *        MEC Governance Action Note Guard, Suite Benchmarks & Release Events,
 *        H0 Dispatch Logging, Dual Facade Parity, Migration 145 UP/DOWN SQL,
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
  computeObrProvenanceSeal,
  maskObrSecret,
  evaluateOrBlockPerformance,
  verifyBlockTimeConservation,
  getObrConfig,
  updateObrConfig,
  getObrTelemetry,
  getObrSuiteBenchmarks,
  getObrBlockScorecards,
  getObrReleaseEvents,
  compileOrBlockEdition,
  recordMecGovernanceAction,
  dispatchOrBlockDigest
} from '../src/services/orBlockReportService.js';

import * as facade from '../src/lib/orBlockReportService.js';

describe('Phase H7: OR Utilization, Block Releases & Financial Yield Report', () => {

  test('1. Telemetry returns accurate Naples OR utilization, idle capacity opportunity, and sha256_obr_ seal', async () => {
    const telemetry = await getObrTelemetry(NAPLES_FACILITY_ID);
    assert.ok(telemetry);
    assert.equal(telemetry.facility_id, NAPLES_FACILITY_ID);
    assert.equal(telemetry.latest_edition_code, 'OBR-2026-11-NAP');
    assert.equal(telemetry.blocks_evaluated, 4);
    assert.equal(telemetry.total_utilized_hours, 197.00);
    assert.equal(telemetry.total_abandoned_idle_hours, 27.00);
    assert.equal(telemetry.facility_adjusted_util_pct, 87.95);
    assert.ok(telemetry.latest_sync_seal.startsWith('sha256_obr_'));
    assert.equal(telemetry.latest_sync_seal.length, 64);
  });

  test('2. Facility UUID alias resolution normalizes strings and objects cleanly', () => {
    assert.equal(normalizeFacilityId('fac-naples-01'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId('naples-surgery-center'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ id: 'fac-naples-01' }), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ uuid: NAPLES_FACILITY_ID }), NAPLES_FACILITY_ID);
  });

  test('3. Config retrieval, masked secret, and invalid utilization target / cutoff bounds guard', async () => {
    const cfg = await getObrConfig('fac-naples-01');
    assert.ok(cfg.client_secret_encrypted.startsWith('obr_sec_****_'));
    assert.equal(maskObrSecret('raw_obr_secret_7301'), 'obr_sec_****_7301');

    await assert.rejects(
      () => updateObrConfig(NAPLES_FACILITY_ID, { target_block_utilization_pct: 12 }),
      /ERR_OBR_INVALID_CONFIG/
    );
    await assert.rejects(
      () => updateObrConfig(NAPLES_FACILITY_ID, { release_notice_cutoff_hours: 4 }),
      /ERR_OBR_INVALID_CONFIG/
    );
  });

  test('4. evaluateOrBlockPerformance computes raw/adjusted util, idle opportunity cost, rightsizing, and 0-min guard', () => {
    const elite = evaluateOrBlockPerformance(
      {
        allocated_minutes: 600,
        on_time_released_minutes: 60,
        utilized_in_block_minutes: 480,
        contribution_margin_usd: 24000
      },
      { hourly_margin_benchmark_usd: 1250 }
    );
    assert.equal(elite.raw_utilization_pct, 80.00);
    assert.equal(elite.adjusted_utilization_pct, 88.89);
    assert.equal(elite.abandoned_idle_minutes, 60);
    assert.equal(elite.opportunity_cost_usd, 1250.00);
    assert.equal(elite.margin_per_utilized_hour_usd, 3000.00);
    assert.equal(elite.block_tier, 'EXCEEDS_BENCHMARK');
    assert.equal(elite.rightsizing_action, 'EXPAND_ALLOCATION');

    const critical = evaluateOrBlockPerformance({
      allocated_minutes: 600,
      on_time_released_minutes: 0,
      utilized_in_block_minutes: 300,
      contribution_margin_usd: 9000
    });
    assert.equal(critical.block_tier, 'CRITICAL_UNDERUTILIZATION');
    assert.equal(critical.rightsizing_action, 'RIGHTSIZE_DOWNGRADE');

    const zero = evaluateOrBlockPerformance({ allocated_minutes: 0, utilized_in_block_minutes: 0 });
    assert.equal(zero.raw_utilization_pct, 0.00);
    assert.equal(zero.adjusted_utilization_pct, 0.00);
  });

  test('5. Block Tier and Specialty filters return cleanly ordered block scorecards', async () => {
    const exceeds = await getObrBlockScorecards(NAPLES_FACILITY_ID, { block_tier: 'EXCEEDS_BENCHMARK' });
    assert.equal(exceeds.length, 3);
    assert.ok(exceeds.every(b => b.block_tier === 'EXCEEDS_BENCHMARK'));

    const ophth = await getObrBlockScorecards(NAPLES_FACILITY_ID, { specialty: 'Ophthalmology' });
    assert.equal(ophth.length, 1);
    assert.equal(ophth[0].block_owner_code, 'BLK-WAL');
  });

  test('6. Compiling a new edition enforces block time conservation and ranks blocks descending', async () => {
    const compiled = await compileOrBlockEdition(NAPLES_FACILITY_ID, {
      period_code: '2026-12',
      blocks: [
        {
          block_owner_code: 'BLK-A',
          block_owner_name: 'Dr. A Block',
          specialty: 'Orthopedic Surgery',
          suite_name: 'OR Suite 1',
          allocated_minutes: 600,
          on_time_released_minutes: 60,
          utilized_in_block_minutes: 360,
          contribution_margin_usd: 18000
        },
        {
          block_owner_code: 'BLK-B',
          block_owner_name: 'Dr. B Block',
          specialty: 'Sports Medicine',
          suite_name: 'OR Suite 2',
          allocated_minutes: 600,
          on_time_released_minutes: 120,
          utilized_in_block_minutes: 450,
          contribution_margin_usd: 22500
        }
      ]
    });
    assert.equal(compiled.scorecards.length, 2);
    assert.equal(compiled.scorecards[0].block_owner_code, 'BLK-B');
    const conserved = verifyBlockTimeConservation(compiled.edition);
    assert.equal(conserved.is_conserved, true);
    assert.ok(compiled.edition.sha256_report_seal.startsWith('sha256_obr_'));
  });

  test('7. recordMecGovernanceAction enforces >=5 char note guard and produces sealed entry', async () => {
    await assert.rejects(
      () => recordMecGovernanceAction(NAPLES_FACILITY_ID, 'blk-wal', { action_type: 'ISSUE_60D_NOTICE', notes: 'cut' }),
      /ERR_OBR_NOTE_REQUIRED/
    );

    const act = await recordMecGovernanceAction(NAPLES_FACILITY_ID, 'blk-wal', {
      action_type: 'DOWNGRADE_FORFEIT',
      hours_delta: -6,
      notes: 'Convert Friday PM ophthalmology block to open add-on pool.'
    });
    assert.equal(act.action_type, 'DOWNGRADE_FORFEIT');
    assert.equal(act.hours_delta, -6.00);
    assert.ok(act.sha256_seal.startsWith('sha256_obr_'));
  });

  test('8. Suite benchmarks and block release events return reconciled Naples records', async () => {
    const suites = await getObrSuiteBenchmarks(NAPLES_FACILITY_ID);
    assert.equal(suites.length, 4);
    assert.ok(suites.some(s => s.suite_name === 'OR Suite 1 (Ortho)' && s.target_utilization_pct === 80));

    const rels = await getObrReleaseEvents(NAPLES_FACILITY_ID, { block_owner_code: 'BLK-WAL' });
    assert.equal(rels.length, 2);
    assert.equal(rels[1].release_classification, 'LATE_RELEASE');
  });

  test('9. dispatchOrBlockDigest creates sealed H0 execution receipt', async () => {
    const dsp = await dispatchOrBlockDigest(NAPLES_FACILITY_ID, 'obr-ed-202611');
    assert.ok(dsp.rpt_execution_code.startsWith('RPT-H7-RUN-'));
    assert.equal(dsp.dispatch_status, 'DELIVERED');
    assert.ok(dsp.sha256_sync_seal.startsWith('sha256_obr_'));
  });

  test('10. Dual facade parity between src/services and src/lib', () => {
    assert.equal(facade.NAPLES_FACILITY_ID, service.NAPLES_FACILITY_ID);
    assert.equal(typeof facade.evaluateOrBlockPerformance, 'function');
    assert.equal(typeof facade.verifyBlockTimeConservation, 'function');
    assert.equal(typeof facade.compileOrBlockEdition, 'function');
    assert.equal(computeObrProvenanceSeal({ a: 1 }), facade.computeObrProvenanceSeal({ a: 1 }));
  });

  test('11. Migration 145 UP/DOWN SQL files contain required 7 tables, view, RLS, and seeds', () => {
    const upSql = fs.readFileSync(path.resolve('supabase/migrations/145_or_block_report.sql'), 'utf8');
    const downSql = fs.readFileSync(path.resolve('supabase/migrations/145_or_block_report_down.sql'), 'utf8');

    [
      'obr_configs',
      'obr_suite_benchmarks',
      'obr_report_editions',
      'obr_block_scorecards',
      'obr_release_events',
      'obr_mec_governance_actions',
      'obr_dispatch_logs',
      'vw_obr_telemetry',
      'chk_obr_target_util'
    ].forEach(token => {
      assert.ok(upSql.includes(token), `Missing ${token} in 145_or_block_report.sql`);
    });
    assert.ok(upSql.includes('ENABLE ROW LEVEL SECURITY'));
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.obr_configs CASCADE'));
  });

  test('12. Zero prohibited color tokens, dark dropdown + anti-clipping CSS, browser-safe crypto & App.jsx wiring', () => {
    const filesToInspect = [
      'src/services/orBlockReportService.js',
      'src/components/OrBlockReportView.jsx',
      'src/components/OrBlockReportView.css'
    ];
    const forbidden = /\b(purple|violet|indigo|magenta|fuchsia)\b/i;

    filesToInspect.forEach(file => {
      const content = fs.readFileSync(path.resolve(file), 'utf8');
      assert.equal(forbidden.test(content), false, `Found forbidden color token in ${file}`);
      assert.equal(content.includes("from 'crypto'"), false, `Found unsafe Node crypto import in ${file}`);
    });

    const css = fs.readFileSync(path.resolve('src/components/OrBlockReportView.css'), 'utf8');
    assert.ok(css.includes('[data-theme="dark"] .obr-select option'));
    assert.ok(css.includes('minmax(0, 1.45fr)'));

    const appJsx = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8');
    assert.ok(appJsx.includes('OrBlockReportView'));
    assert.ok(appJsx.includes("activeTab === 'or_block_report'"));
  });
});
