/**
 * ==============================================================================
 * Test Suite: reporting-architecture.test.js
 * Module 17: Enterprise Reporting & Executive Packages (Phase H0)
 * Tests: Telemetry & Catalog Counts, Facility UUID Normalization,
 *        Config & Masked Secrets, Filter Date/Row Limit Validation,
 *        5-Field Cron Expression Validator, Deterministic RBAC Enforcement &
 *        ACCESS_DENIED Logging, Trust-Gate Watermarking & Critical Blocking,
 *        End-to-End Report Run + Sealed Artifact Creation, Cron Schedule Creation
 *        & Toggle, Dual Facade Parity, Migration 138 UP/DOWN SQL + RLS,
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
  computeRptProvenanceSeal,
  maskRptSecret,
  validateCronExpression,
  validateReportFilterPayload,
  authorizeReportAction,
  evaluateExportTrustGate,
  getRptConfig,
  updateRptConfig,
  getRptTelemetry,
  getRptDefinitions,
  getRptAccessAudit,
  generateReportRun,
  createReportSchedule,
  toggleReportSchedule
} from '../src/services/reportingArchitectureService.js';

import * as facade from '../src/lib/reportingArchitectureService.js';

describe('Phase H0: Reporting Architecture, Exports, Scheduling & RBAC', () => {

  test('1. Telemetry returns accurate catalog (H1-H9), schedule, and seal metrics for Naples Surgery Center', async () => {
    const telemetry = await getRptTelemetry(NAPLES_FACILITY_ID);
    assert.ok(telemetry);
    assert.equal(telemetry.facility_id, NAPLES_FACILITY_ID);
    assert.equal(telemetry.active_definitions_count, 9);
    assert.ok(telemetry.enabled_schedules_count >= 2);
    assert.ok(telemetry.completed_executions_count >= 1);
    assert.ok(telemetry.latest_sync_seal.startsWith('sha256_rpt_'));
    assert.equal(telemetry.latest_sync_seal.length, 64);
  });

  test('2. Facility UUID alias resolution matches Naples Surgery Center across strings and objects', () => {
    assert.equal(normalizeFacilityId('fac-naples-01'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId('naples-surgery-center'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ id: 'fac-naples-01' }), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ uuid: NAPLES_FACILITY_ID }), NAPLES_FACILITY_ID);
  });

  test('3. Config retrieval, masked secret check, and threshold/row-limit validation', async () => {
    const cfg = await getRptConfig('fac-naples-01');
    assert.ok(cfg.client_secret_encrypted.startsWith('rpt_sec_****_'));
    assert.equal(maskRptSecret('raw_rpt_secret_9012'), 'rpt_sec_****_9012');

    await assert.rejects(
      () => updateRptConfig(NAPLES_FACILITY_ID, { min_financial_trust_score: 20 }),
      /ERR_RPT_INVALID_THRESHOLD/
    );
  });

  test('4. validateReportFilterPayload enforces valid date order and max row limits', () => {
    const valid = validateReportFilterPayload({ date_from: '2026-11-01', date_to: '2026-11-27', row_limit: 500 }, 50000);
    assert.equal(valid.row_limit, 500);

    assert.throws(
      () => validateReportFilterPayload({ date_from: '2026-11-27', date_to: '2026-11-01', row_limit: 100 }, 50000),
      /ERR_RPT_INVALID_FILTERS/
    );
    assert.throws(
      () => validateReportFilterPayload({ date_from: '2026-11-01', date_to: '2026-11-27', row_limit: 75000 }, 50000),
      /ERR_RPT_INVALID_FILTERS/
    );
  });

  test('5. validateCronExpression enforces strict 5-field cron formatting', () => {
    assert.equal(validateCronExpression('0 6 * * 1-5').valid, true);
    assert.equal(validateCronExpression('30 8 1 * *').valid, true);
    assert.throws(() => validateCronExpression('0 6 * *'), /ERR_RPT_INVALID_CRON/);
    assert.throws(() => validateCronExpression('EVERY_MORNING 6 * * *'), /ERR_RPT_INVALID_CRON/);
  });

  test('6. Deterministic RBAC enforces role access and logs ACCESS_DENIED for unauthorized callers', async () => {
    const defs = await getRptDefinitions(NAPLES_FACILITY_ID);
    const boardDef = defs.find(d => d.report_code === 'RPT-H9-BOARD-PKG');
    assert.equal(authorizeReportAction('CFO / Finance Director', boardDef, 'GENERATE_RUN').authorized, true);
    assert.equal(authorizeReportAction('External Viewer', boardDef, 'GENERATE_RUN').authorized, false);

    await assert.rejects(
      () => generateReportRun(NAPLES_FACILITY_ID, {
        report_code: 'RPT-H9-BOARD-PKG',
        export_format: 'PDF',
        actor_email: 'viewer@external.com',
        actor_role: 'External Read-Only Viewer'
      }),
      /ERR_RPT_RBAC_DENIED/
    );

    const audit = await getRptAccessAudit(NAPLES_FACILITY_ID);
    assert.ok(audit.some(a => a.action_type === 'ACCESS_DENIED' && a.access_granted === false));
  });

  test('7. Data Quality Trust Gate classifies CERTIFIED, PROVISIONAL_WATERMARKED, and BLOCKED_TRUST_GATE', () => {
    const certified = evaluateExportTrustGate(92.5, 75.0, true);
    assert.equal(certified.trust_gate_status, 'CERTIFIED');
    assert.equal(certified.is_watermarked, false);
    assert.equal(certified.blocked, false);

    const provisional = evaluateExportTrustGate(64.0, 75.0, true);
    assert.equal(provisional.trust_gate_status, 'PROVISIONAL_WATERMARKED');
    assert.equal(provisional.is_watermarked, true);
    assert.ok(provisional.watermark_text.includes('PROVISIONAL'));

    const blocked = evaluateExportTrustGate(42.0, 75.0, true);
    assert.equal(blocked.trust_gate_status, 'BLOCKED_TRUST_GATE');
    assert.equal(blocked.blocked, true);
  });

  test('8. generateReportRun executes certified and provisional watermarked runs with 64-char seals', async () => {
    const certifiedRun = await generateReportRun(NAPLES_FACILITY_ID, {
      report_code: 'RPT-H3-MONTHLY-CFO',
      export_format: 'XLSX',
      actor_role: 'CFO / Finance Director',
      dq_trust_score: 96.2
    });
    assert.equal(certifiedRun.execution.trust_gate_status, 'CERTIFIED');
    assert.equal(certifiedRun.artifact.is_watermarked, false);
    assert.equal(certifiedRun.execution.sha256_report_seal.length, 64);

    const provisionalRun = await generateReportRun(NAPLES_FACILITY_ID, {
      report_code: 'RPT-H3-MONTHLY-CFO',
      export_format: 'PDF',
      actor_role: 'CFO / Finance Director',
      dq_trust_score: 68.5
    });
    assert.equal(provisionalRun.execution.trust_gate_status, 'PROVISIONAL_WATERMARKED');
    assert.equal(provisionalRun.artifact.is_watermarked, true);

    await assert.rejects(
      () => generateReportRun(NAPLES_FACILITY_ID, {
        report_code: 'RPT-H3-MONTHLY-CFO',
        export_format: 'PDF',
        actor_role: 'CFO / Finance Director',
        dq_trust_score: 41.0
      }),
      /ERR_RPT_TRUST_GATE_BLOCKED/
    );
  });

  test('9. createReportSchedule and toggleReportSchedule enforce cron and pause/resume cleanly', async () => {
    await assert.rejects(
      () => createReportSchedule(NAPLES_FACILITY_ID, {
        report_code: 'RPT-H2-LEAKAGE',
        cron_expression: '0 7 * * 1',
        recipient_emails: []
      }),
      /ERR_RPT_RECIPIENTS_REQUIRED/
    );

    const sched = await createReportSchedule(NAPLES_FACILITY_ID, {
      report_code: 'RPT-H2-LEAKAGE',
      cadence: 'WEEKLY',
      cron_expression: '15 7 * * 1',
      delivery_channel: 'EMAIL_DIGEST',
      export_format: 'XLSX',
      recipient_emails: ['cfo@naplessurgery.com']
    });
    assert.equal(sched.is_enabled, true);

    const paused = await toggleReportSchedule(NAPLES_FACILITY_ID, sched.id, { is_enabled: false });
    assert.equal(paused.is_enabled, false);
  });

  test('10. Dual facade re-export parity between src/services/ and src/lib/', () => {
    const seal = computeRptProvenanceSeal({ rpt: 'parity' });
    assert.equal(facade.computeRptProvenanceSeal({ rpt: 'parity' }), seal);
    assert.equal(facade.NAPLES_FACILITY_ID, service.NAPLES_FACILITY_ID);
    assert.equal(typeof facade.generateReportRun, 'function');
    assert.equal(typeof facade.createReportSchedule, 'function');
    assert.equal(typeof facade.evaluateExportTrustGate, 'function');
  });

  test('11. Migration 138 UP/DOWN SQL structural integrity and RLS policies', () => {
    const upPath = path.resolve('supabase/migrations/138_reporting_architecture.sql');
    const downPath = path.resolve('supabase/migrations/138_reporting_architecture_down.sql');
    assert.ok(fs.existsSync(upPath), 'Migration 138 UP file must exist');
    assert.ok(fs.existsSync(downPath), 'Migration 138 DOWN file must exist');

    const upSql = fs.readFileSync(upPath, 'utf8');
    const downSql = fs.readFileSync(downPath, 'utf8');

    const expectedTables = [
      'rpt_configs',
      'rpt_definitions',
      'rpt_saved_filters',
      'rpt_schedules',
      'rpt_executions',
      'rpt_export_artifacts',
      'rpt_access_audit'
    ];

    for (const tbl of expectedTables) {
      assert.ok(upSql.includes(`CREATE TABLE IF NOT EXISTS public.${tbl}`), `Missing UP table ${tbl}`);
      assert.ok(upSql.includes(`ALTER TABLE public.${tbl} ENABLE ROW LEVEL SECURITY`), `Missing RLS on ${tbl}`);
      assert.ok(downSql.includes(`DROP TABLE IF EXISTS public.${tbl} CASCADE`), `Missing DOWN drop for ${tbl}`);
    }
    assert.ok(upSql.includes('CREATE OR REPLACE VIEW public.vw_rpt_telemetry'));
    assert.ok(upSql.includes('app.current_facility_id'));
    assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_rpt_telemetry'));
  });

  test('12. Strict zero-prohibited token compliance and App.jsx shell integration', () => {
    const filesToCheck = [
      path.resolve('src/components/ReportingArchitectureView.jsx'),
      path.resolve('src/components/ReportingArchitectureView.css'),
      path.resolve('src/services/reportingArchitectureService.js'),
      path.resolve('src/lib/reportingArchitectureService.js')
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
    assert.ok(appSource.includes("import ReportingArchitectureView from './components/ReportingArchitectureView'"));
    assert.ok(appSource.includes("activeTab === 'reporting_architecture'"));
    assert.ok(appSource.includes('<ReportingArchitectureView activeFacility={activeFacility} />'));
  });
});
