/**
 * ==============================================================================
 * Test Suite: import-exception-queue.test.js
 * Module 16: Enterprise Data Quality Governance (Phase G3)
 * Tests: Telemetry & SLA Metrics, Facility UUID Normalization,
 *        Config & Masked Secrets, Deterministic Owner Routing & SLA Deadlines,
 *        Strict Queue State Machine, Assignment & Escalation Actions,
 *        Inline Repair + Replay Batch SHA-256 Sealing, Mandatory Dismissal
 *        Justification, Workloads & Routing Rules, Dual Facade Parity,
 *        Migration 135 UP/DOWN Integrity, Zero Prohibited Tokens, and App.jsx.
 * ==============================================================================
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import service, {
  NAPLES_FACILITY_ID,
  CANONICAL_QUEUE_STATUSES,
  SEVERITY_SLA_HOURS,
  normalizeFacilityId,
  computeIeqProvenanceSeal,
  maskIeqSecret,
  determineExceptionOwnerAndSla,
  validateQueueTransition,
  getIeqConfig,
  getIeqTelemetry,
  getIeqRoutingRules,
  getIeqExceptions,
  getIeqResolutionActions,
  getIeqOwnerWorkloads,
  getIeqReplayBatches,
  assignIeqException,
  escalateIeqException,
  resolveAndReplayIeqException,
  dismissIeqException
} from '../src/services/importExceptionQueueService.js';

import * as facade from '../src/lib/importExceptionQueueService.js';

describe('Phase G3: Import Exception Queue & Resolution', () => {

  // Test 1: Telemetry
  test('1. Telemetry returns accurate queue counts and financial exposure for Naples Surgery Center', async () => {
    const telemetry = await getIeqTelemetry(NAPLES_FACILITY_ID);
    assert.ok(telemetry, 'Telemetry should exist');
    assert.equal(telemetry.facility_id, NAPLES_FACILITY_ID);
    assert.equal(telemetry.critical_sla_hours, 4);
    assert.ok(telemetry.active_queue_count >= 4, `Expected >= 4 active tickets, got ${telemetry.active_queue_count}`);
    assert.ok(telemetry.financial_impact_at_risk_usd >= 900, 'Should track dollar exposure at risk');
    assert.ok(telemetry.latest_sync_seal.startsWith('sha256_ieq_'), 'Seal must use sha256_ieq_ prefix');
  });

  // Test 2: Facility Normalization
  test('2. Facility UUID alias resolution matches Naples Surgery Center across strings and objects', () => {
    assert.equal(normalizeFacilityId('fac-naples-01'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId('naples-surgery-center'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ id: 'fac-naples-01' }), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ facility_id: NAPLES_FACILITY_ID }), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId(null), NAPLES_FACILITY_ID);
  });

  // Test 3: Config & Masked Secrets
  test('3. Configuration retrieval and masked secret verification', async () => {
    const config = await getIeqConfig(NAPLES_FACILITY_ID);
    assert.equal(config.critical_sla_hours, 4);
    assert.equal(config.high_sla_hours, 12);
    assert.equal(config.auto_assign_by_domain, true);
    assert.equal(config.require_reason_for_dismissal, true);
    assert.ok(config.client_secret_masked.startsWith('ieq_sec_****_'), 'Secret must be masked');
    assert.ok(!config.client_secret_masked.includes('enc_v2'), 'Raw secret must not leak');
  });

  // Test 4: Deterministic SLA & Auto-Ownership Routing
  test('4. Deterministic owner routing and SLA calculation accurately route domain exceptions', async () => {
    const routes = await getIeqRoutingRules(NAPLES_FACILITY_ID);
    const baseTime = new Date('2026-02-24T10:00:00Z');

    const vinvRoute = determineExceptionOwnerAndSla(
      { sourceModule: 'VENDOR_INVOICE', exceptionCategory: 'PRICE_VARIANCE', severity: 'CRITICAL', createdAt: baseTime },
      routes
    );
    assert.equal(vinvRoute.assignedRole, 'Materials Manager');
    assert.equal(vinvRoute.assignedTo, 'materials_mgr@naplesasc.com');
    assert.equal(vinvRoute.slaHours, 4);
    assert.equal(vinvRoute.slaDueAt, '2026-02-24T14:00:00.000Z');
    assert.equal(vinvRoute.priorityScore, 100);

    const payrollRoute = determineExceptionOwnerAndSla(
      { sourceModule: 'PAYROLL_WFM', exceptionCategory: 'MISSED_PUNCH', severity: 'HIGH', createdAt: baseTime },
      routes
    );
    assert.equal(payrollRoute.assignedRole, 'HR & Payroll Coordinator');
    assert.equal(payrollRoute.slaHours, 12);
    assert.equal(payrollRoute.slaDueAt, '2026-02-24T22:00:00.000Z');
  });

  // Test 5: Strict State Machine Transitions
  test('5. validateQueueTransition enforces valid transitions and blocks terminal modifications', () => {
    assert.equal(CANONICAL_QUEUE_STATUSES.length, 6);
    assert.equal(validateQueueTransition('OPEN', 'ASSIGNED').isValid, true);
    assert.equal(validateQueueTransition('IN_REVIEW', 'RESOLVED_REPLAYED').isValid, true);
    assert.equal(validateQueueTransition('IN_REVIEW', 'DISMISSED_SUPPRESSED', 'Valid audit justification').isValid, true);

    // Block terminal state modification
    const terminalBlock = validateQueueTransition('RESOLVED_REPLAYED', 'OPEN');
    assert.equal(terminalBlock.isValid, false);
    assert.equal(terminalBlock.errorCode, 'ERR_IEQ_INVALID_TRANSITION');

    // Block missing dismissal reason
    const dismissBlock = validateQueueTransition('IN_REVIEW', 'DISMISSED_SUPPRESSED', '');
    assert.equal(dismissBlock.isValid, false);
    assert.equal(dismissBlock.errorCode, 'ERR_DISMISS_REASON_REQUIRED');
  });

  // Test 6: Assignment & Escalation Actions
  test('6. Ticket assignment and SLA escalation append immutable action timeline logs', async () => {
    const assignRes = await assignIeqException('ieq-exc-104', 'data_steward@naplesasc.com', 'Data Operations Steward');
    assert.equal(assignRes.success, true);
    assert.equal(assignRes.exception.queue_status, 'ASSIGNED');
    assert.equal(assignRes.exception.assigned_to, 'data_steward@naplesasc.com');

    const escRes = await escalateIeqException('ieq-exc-104', 'Imminent OR schedule impact');
    assert.equal(escRes.success, true);
    assert.equal(escRes.exception.queue_status, 'ESCALATED');

    const actions = await getIeqResolutionActions('ieq-exc-104');
    assert.ok(actions.length >= 2);
    assert.equal(actions[0].action_type, 'ESCALATE');
  });

  // Test 7: Inline Repair & Replay Generates 64-Char SHA-256 Batch Seal
  test('7. Inline payload fix and replay transitions ticket to RESOLVED_REPLAYED with 64-char SHA-256 seal', async () => {
    const res = await resolveAndReplayIeqException(
      'ieq-exc-101',
      { invoiced_price: 84.50, credit_memo: 'CM-9921' },
      'Applied Cardinal Health credit memo matching Vizient rate',
      'materials_mgr@naplesasc.com'
    );

    assert.equal(res.success, true);
    assert.equal(res.exception.queue_status, 'RESOLVED_REPLAYED');
    assert.equal(res.exception.corrected_payload_json.invoiced_price, 84.50);
    assert.equal(res.exception.sha256_sync_seal.length, 64);

    assert.ok(res.replayBatch.replay_code.startsWith('IEQ-RPL-'));
    assert.ok(res.replayBatch.sha256_sync_seal.startsWith('sha256_ieq_'));
    assert.equal(res.replayBatch.sha256_sync_seal.length, 64);
  });

  // Test 8: Dismissal Enforcement
  test('8. Dismissal rejects empty reasons and records documented suppression cleanly', async () => {
    await assert.rejects(
      () => dismissIeqException('ieq-exc-102', ''),
      /documented reason/i
    );

    const dismissRes = await dismissIeqException('ieq-exc-102', 'Duplicate punch confirmed by Nursing Supervisor');
    assert.equal(dismissRes.success, true);
    assert.equal(dismissRes.exception.queue_status, 'DISMISSED_SUPPRESSED');
  });

  // Test 9: Owner Workloads Aggregation
  test('9. Owner workloads accurately aggregate active backlog and resolved counts', async () => {
    const workloads = await getIeqOwnerWorkloads(NAPLES_FACILITY_ID);
    assert.ok(Array.isArray(workloads) && workloads.length >= 3);
    const mats = workloads.find(w => w.assignee_email === 'materials_mgr@naplesasc.com');
    assert.ok(mats, 'Materials Manager workload entry should exist');
    assert.ok(mats.resolved_mtd_count >= 1, 'Should reflect replayed Cardinal Health ticket');
  });

  // Test 10: Dual Facade Parity
  test('10. Dual facade re-export parity between src/services/ and src/lib/', () => {
    const expected = [
      'NAPLES_FACILITY_ID',
      'CANONICAL_QUEUE_STATUSES',
      'SEVERITY_SLA_HOURS',
      'VALID_STATE_TRANSITIONS',
      'normalizeFacilityId',
      'computeIeqProvenanceSeal',
      'maskIeqSecret',
      'determineExceptionOwnerAndSla',
      'validateQueueTransition',
      'getIeqConfig',
      'getIeqTelemetry',
      'getIeqRoutingRules',
      'getIeqExceptions',
      'getIeqResolutionActions',
      'getIeqOwnerWorkloads',
      'getIeqReplayBatches',
      'assignIeqException',
      'escalateIeqException',
      'resolveAndReplayIeqException',
      'dismissIeqException'
    ];

    for (const key of expected) {
      assert.ok(facade[key], `Facade must re-export ${key}`);
      assert.equal(typeof facade[key], typeof service[key], `Type parity for ${key}`);
    }
  });

  // Test 11: Migration 135 UP/DOWN SQL Integrity & RLS
  test('11. Migration 135 UP/DOWN SQL structural integrity and RLS policies', () => {
    const upPath = path.resolve('supabase/migrations/135_import_exception_queue.sql');
    const downPath = path.resolve('supabase/migrations/135_import_exception_queue_down.sql');

    assert.ok(fs.existsSync(upPath));
    assert.ok(fs.existsSync(downPath));

    const upSql = fs.readFileSync(upPath, 'utf8');
    const downSql = fs.readFileSync(downPath, 'utf8');

    const tables = [
      'ieq_queue_configs',
      'ieq_routing_rules',
      'ieq_exception_items',
      'ieq_resolution_actions',
      'ieq_owner_workloads',
      'ieq_replay_batches',
      'ieq_provenance_ledger'
    ];

    for (const tbl of tables) {
      assert.ok(upSql.includes(`CREATE TABLE IF NOT EXISTS public.${tbl}`), `Missing ${tbl}`);
      assert.ok(upSql.includes(`ALTER TABLE public.${tbl} ENABLE ROW LEVEL SECURITY`), `Missing RLS on ${tbl}`);
      assert.ok(downSql.includes(`DROP TABLE IF EXISTS public.${tbl}`), `Missing DROP ${tbl} in down`);
    }

    assert.ok(upSql.includes('CREATE OR REPLACE VIEW public.vw_import_exception_queue_telemetry'));
    assert.ok(upSql.includes('app.current_facility_id'));
    assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_import_exception_queue_telemetry'));
  });

  // Test 12: Zero Prohibited Tokens & App.jsx Integration
  test('12. Strict zero-prohibited token compliance and App.jsx shell integration', () => {
    const prohibitedTokens = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];
    const files = [
      path.resolve('src/components/ImportExceptionQueueView.jsx'),
      path.resolve('src/components/ImportExceptionQueueView.css'),
      path.resolve('src/services/importExceptionQueueService.js'),
      path.resolve('src/lib/importExceptionQueueService.js')
    ];

    for (const f of files) {
      assert.ok(fs.existsSync(f), `Missing file: ${f}`);
      const content = fs.readFileSync(f, 'utf8').toLowerCase();
      for (const token of prohibitedTokens) {
        assert.ok(!content.includes(token), `Prohibited token '${token}' found in ${path.basename(f)}`);
      }
    }

    const appContent = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8');
    assert.ok(appContent.includes("import ImportExceptionQueueView from './components/ImportExceptionQueueView'"));
    assert.ok(appContent.includes("activeTab === 'import_exception_queue'"));
    assert.ok(appContent.includes('<ImportExceptionQueueView activeFacility={activeFacility} />'));
    assert.ok(appContent.includes('Import Exception Queue & Resolution'));
  });

});
