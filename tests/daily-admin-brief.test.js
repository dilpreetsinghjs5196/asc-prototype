/**
 * ==============================================================================
 * Test Suite: daily-admin-brief.test.js
 * Module 17: Enterprise Reporting & Executive Packages (Phase H1)
 * Tests: Telemetry & Latest Brief Metrics, Facility UUID Normalization,
 *        Config & Masked Secrets, Deterministic computeDailyBriefMetrics Math &
 *        Divide-by-Zero Safety, Readiness Classification (GREEN/AMBER/RED),
 *        Brief Compilation + PUBLISH_BRIEF Acknowledgment, Action Blocker Triage &
 *        Dynamic Readiness Recalculation, Admin Morning Sign-Off, H0 Digest
 *        Dispatch Logging, Dual Facade Parity, Migration 139 UP/DOWN SQL + RLS,
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
  computeDabProvenanceSeal,
  maskDabSecret,
  evaluateBriefReadinessStatus,
  computeDailyBriefMetrics,
  getDabConfig,
  updateDabConfig,
  getDabTelemetry,
  getDabOrSuitePulse,
  getDabSurgeonRoster,
  getDabAcknowledgments,
  compileDailyAdminBrief,
  updateDabActionStatus,
  signOffDailyBrief,
  dispatchDailyBriefDigest
} from '../src/services/dailyAdminBriefService.js';

import * as facade from '../src/lib/dailyAdminBriefService.js';

describe('Phase H1: Daily Administrator Brief Content & Metrics', () => {

  test('1. Telemetry returns accurate daily OR utilization, margin, and sha256_dab_ seal', async () => {
    const telemetry = await getDabTelemetry(NAPLES_FACILITY_ID);
    assert.ok(telemetry);
    assert.equal(telemetry.facility_id, NAPLES_FACILITY_ID);
    assert.equal(telemetry.latest_brief_code, 'DAB-20261127-NAP');
    assert.equal(telemetry.latest_or_util_pct, 84.50);
    assert.equal(telemetry.latest_projected_margin_usd, 52180.00);
    assert.equal(telemetry.latest_readiness_status, 'RED_ACTION_CRITICAL');
    assert.ok(telemetry.latest_sync_seal.startsWith('sha256_dab_'));
    assert.equal(telemetry.latest_sync_seal.length, 64);
  });

  test('2. Facility UUID alias resolution matches Naples Surgery Center across strings and objects', () => {
    assert.equal(normalizeFacilityId('fac-naples-01'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId('naples-surgery-center'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ id: 'fac-naples-01' }), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ uuid: NAPLES_FACILITY_ID }), NAPLES_FACILITY_ID);
  });

  test('3. Config retrieval, masked secret check, and cutoff/alert bounds validation', async () => {
    const cfg = await getDabConfig('fac-naples-01');
    assert.ok(cfg.client_secret_encrypted.startsWith('dab_sec_****_'));
    assert.equal(maskDabSecret('raw_dab_token_4419'), 'dab_sec_****_4419');

    await assert.rejects(
      () => updateDabConfig(NAPLES_FACILITY_ID, { brief_cutoff_hour: 27 }),
      /ERR_DAB_INVALID_CONFIG/
    );
  });

  test('4. computeDailyBriefMetrics calculates OR util, FCOTS, margin, and guards zero denominators', () => {
    const metrics = computeDailyBriefMetrics({
      actual_or_minutes: 1920,
      available_prime_minutes: 2400,
      on_time_first_cases: 4,
      total_first_cases: 5,
      projected_net_revenue_usd: 90000,
      direct_supplies_cost_usd: 25000,
      clinical_labor_cost_usd: 15000,
      p0_critical_count: 0,
      dq_trust_score: 95.0
    });
    assert.equal(metrics.or_prime_time_util_pct, 80.00);
    assert.equal(metrics.fcots_on_time_rate_pct, 80.00);
    assert.equal(metrics.projected_contribution_margin_usd, 50000.00);
    assert.equal(metrics.readiness_status, 'GREEN_ON_TRACK');

    const zeroGuard = computeDailyBriefMetrics({
      actual_or_minutes: 0,
      available_prime_minutes: 0,
      on_time_first_cases: 0,
      total_first_cases: 0
    });
    assert.equal(zeroGuard.or_prime_time_util_pct, 0.00);
    assert.equal(zeroGuard.fcots_on_time_rate_pct, 0.00);
  });

  test('5. evaluateBriefReadinessStatus classifies RED, AMBER, and GREEN thresholds accurately', () => {
    assert.equal(evaluateBriefReadinessStatus({ p0_critical_count: 1 }), 'RED_ACTION_CRITICAL');
    assert.equal(evaluateBriefReadinessStatus({ p0_critical_count: 0, dq_trust_score: 48.0 }), 'RED_ACTION_CRITICAL');
    assert.equal(evaluateBriefReadinessStatus({ p0_critical_count: 0, open_ieq_exceptions_count: 2 }), 'AMBER_ATTENTION_REQUIRED');
    assert.equal(evaluateBriefReadinessStatus({ p0_critical_count: 0, unbilled_hold_cases_count: 1, or_prime_time_util_pct: 84.0 }), 'GREEN_ON_TRACK');
  });

  test('6. compileDailyAdminBrief produces sealed snapshot + OR pulse & surgeon roster accessors work', async () => {
    const rooms = await getDabOrSuitePulse(NAPLES_FACILITY_ID, 'snap-20261127');
    assert.equal(rooms.length, 5);
    const docs = await getDabSurgeonRoster(NAPLES_FACILITY_ID, 'snap-20261127');
    assert.equal(docs.length, 4);

    const compiled = await compileDailyAdminBrief(NAPLES_FACILITY_ID, {
      brief_date: '2026-11-28',
      actor_email: 'admin@naplessurgery.com'
    });
    assert.equal(compiled.brief_code, 'DAB-20261128-NAP');
    assert.equal(compiled.readiness_status, 'GREEN_ON_TRACK');
    assert.equal(compiled.sha256_brief_seal.length, 64);
  });

  test('7. Resolving P0 blocker enforces >=5 char note and updates parent brief readiness dynamically', async () => {
    await assert.rejects(
      () => updateDabActionStatus(NAPLES_FACILITY_ID, 'dab-act-101', { status: 'RESOLVED', resolution_note: 'ok' }),
      /ERR_DAB_NOTE_REQUIRED/
    );

    const res = await updateDabActionStatus(NAPLES_FACILITY_ID, 'dab-act-101', {
      status: 'RESOLVED',
      resolution_note: 'Replaced quarantined implant lot LOT-1902 with verified sterile tray AR-9902'
    });
    assert.equal(res.action.status, 'RESOLVED');
    assert.equal(res.snapshot_readiness, 'GREEN_ON_TRACK');
  });

  test('8. signOffDailyBrief appends immutable ADMIN_SIGN_OFF with 64-char SHA-256 seal', async () => {
    const ack = await signOffDailyBrief(NAPLES_FACILITY_ID, 'snap-20261127', {
      actor_email: 'admin@naplessurgery.com',
      actor_role: 'Facility Administrator',
      notes: 'Cleared OR-2 implant lot before 08:30 start'
    });
    assert.equal(ack.action_type, 'ADMIN_SIGN_OFF');
    assert.equal(ack.sha256_seal.length, 64);

    const list = await getDabAcknowledgments(NAPLES_FACILITY_ID, 'snap-20261127');
    assert.ok(list.some(a => a.action_type === 'ADMIN_SIGN_OFF'));
  });

  test('9. dispatchDailyBriefDigest logs H0 report execution code and SHA-256 dispatch seal', async () => {
    const dlog = await dispatchDailyBriefDigest(NAPLES_FACILITY_ID, 'snap-20261127', {
      delivery_channel: 'EMAIL_DIGEST',
      export_format: 'PDF',
      recipient_count: 5
    });
    assert.ok(dlog.rpt_execution_code.startsWith('RPT-RUN-'));
    assert.equal(dlog.dispatch_status, 'DELIVERED');
    assert.equal(dlog.sha256_sync_seal.length, 64);
  });

  test('10. Dual facade re-export parity between src/services/ and src/lib/', () => {
    const seal = computeDabProvenanceSeal({ dab: 'parity' });
    assert.equal(facade.computeDabProvenanceSeal({ dab: 'parity' }), seal);
    assert.equal(facade.NAPLES_FACILITY_ID, service.NAPLES_FACILITY_ID);
    assert.equal(typeof facade.compileDailyAdminBrief, 'function');
    assert.equal(typeof facade.updateDabActionStatus, 'function');
    assert.equal(typeof facade.signOffDailyBrief, 'function');
  });

  test('11. Migration 139 UP/DOWN SQL structural integrity and RLS policies', () => {
    const upPath = path.resolve('supabase/migrations/139_daily_admin_brief.sql');
    const downPath = path.resolve('supabase/migrations/139_daily_admin_brief_down.sql');
    assert.ok(fs.existsSync(upPath), 'Migration 139 UP file must exist');
    assert.ok(fs.existsSync(downPath), 'Migration 139 DOWN file must exist');

    const upSql = fs.readFileSync(upPath, 'utf8');
    const downSql = fs.readFileSync(downPath, 'utf8');

    const expectedTables = [
      'dab_configs',
      'dab_daily_snapshots',
      'dab_action_items',
      'dab_or_suite_pulse',
      'dab_surgeon_day_roster',
      'dab_acknowledgments',
      'dab_dispatch_logs'
    ];

    for (const tbl of expectedTables) {
      assert.ok(upSql.includes(`CREATE TABLE IF NOT EXISTS public.${tbl}`), `Missing UP table ${tbl}`);
      assert.ok(upSql.includes(`ALTER TABLE public.${tbl} ENABLE ROW LEVEL SECURITY`), `Missing RLS on ${tbl}`);
      assert.ok(downSql.includes(`DROP TABLE IF EXISTS public.${tbl} CASCADE`), `Missing DOWN drop for ${tbl}`);
    }
    assert.ok(upSql.includes('CREATE OR REPLACE VIEW public.vw_dab_telemetry'));
    assert.ok(upSql.includes('app.current_facility_id'));
    assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_dab_telemetry'));
  });

  test('12. Strict zero-prohibited token compliance and App.jsx shell integration', () => {
    const filesToCheck = [
      path.resolve('src/components/DailyAdminBriefView.jsx'),
      path.resolve('src/components/DailyAdminBriefView.css'),
      path.resolve('src/services/dailyAdminBriefService.js'),
      path.resolve('src/lib/dailyAdminBriefService.js')
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
    assert.ok(appSource.includes("import DailyAdminBriefView from './components/DailyAdminBriefView'"));
    assert.ok(appSource.includes("activeTab === 'daily_admin_brief'"));
    assert.ok(appSource.includes('<DailyAdminBriefView activeFacility={activeFacility} />'));
  });
});
