/**
 * ==============================================================================
 * Phase D0 Test Suite: Next Best Financial Action Engine
 * Module 13: Decision Intelligence
 * Tests: Telemetry KPIs, multi-parameter priority scoring, domain filters,
 *        assignment and state machine transitions, dismissal governance,
 *        migration 107 SQL integrity, and zero-purple Maestro compliance.
 * ==============================================================================
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACTION_CATEGORIES,
  PRIORITY_TIERS,
  ACTION_STATUSES,
  DISMISSAL_REASONS,
  calculatePriorityScore,
  computeActionHash,
  getNextBestFinancialActions,
  getActionById,
  assignAction,
  executeActionTransition,
  dismissAction,
  getActionAuditEvents,
  getNBFATelemetry,
  resetNBFABackendStore
} from '../src/services/nextBestActionService.js';

import * as libNextBestActionService from '../src/lib/nextBestActionService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase D0: Next Best Financial Action Engine', () => {

  beforeEach(() => {
    resetNBFABackendStore();
  });

  test('1. NBFA Telemetry returns accurate facility KPIs and pipeline value', () => {
    const telemetry = getNBFATelemetry('fac-naples-01');
    assert.strictEqual(telemetry.totalActionsCount, 7, 'Must report 7 seed actions');
    assert.strictEqual(telemetry.activeActionsCount, 7, 'All 7 should initially be active');
    assert.strictEqual(telemetry.urgentP0Count, 3, 'Must report 3 critical P0 actions');
    assert.ok(telemetry.totalPipelineRecoveryValue > 35000, 'Total pipeline recovery value must exceed $35,000');
    assert.ok(telemetry.avgRecoverabilityPct >= 80.0, 'Average recoverability must be >= 80%');
    assert.ok(telemetry.avgConfidencePct >= 90.0, 'Average confidence must be >= 90%');
    assert.strictEqual(telemetry.avgResolutionVelocityHours, 18.4);
  });

  test('2. Filter engine slices actions accurately by domain, priority, status, and search query', () => {
    // All
    const allActions = getNextBestFinancialActions('fac-naples-01');
    assert.strictEqual(allActions.length, 7);

    // By Category
    const denials = getNextBestFinancialActions('fac-naples-01', { category: ACTION_CATEGORIES.DENIAL_APPEAL_URGENT });
    assert.strictEqual(denials.length, 1);
    assert.strictEqual(denials[0].actionCode, 'NBFA-2026-0801');

    const orBlocks = getNextBestFinancialActions('fac-naples-01', { category: ACTION_CATEGORIES.OR_BLOCK_RELEASE });
    assert.strictEqual(orBlocks.length, 1);
    assert.strictEqual(orBlocks[0].actionCode, 'NBFA-2026-0802');

    // By Priority Tier
    const p0Actions = getNextBestFinancialActions('fac-naples-01', { priorityTier: PRIORITY_TIERS.P0_CRITICAL });
    assert.strictEqual(p0Actions.length, 3);

    const p1Actions = getNextBestFinancialActions('fac-naples-01', { priorityTier: PRIORITY_TIERS.P1_HIGH });
    assert.strictEqual(p1Actions.length, 3);

    const p2Actions = getNextBestFinancialActions('fac-naples-01', { priorityTier: PRIORITY_TIERS.P2_MEDIUM });
    assert.strictEqual(p2Actions.length, 1);

    // By Status
    const assignedActions = getNextBestFinancialActions('fac-naples-01', { status: ACTION_STATUSES.ASSIGNED });
    assert.strictEqual(assignedActions.length, 1);
    assert.strictEqual(assignedActions[0].actionCode, 'NBFA-2026-0803');

    // Search query
    const searchResult = getNextBestFinancialActions('fac-naples-01', { searchTerm: 'Stryker' });
    assert.strictEqual(searchResult.length, 1);
    assert.strictEqual(searchResult[0].actionCode, 'NBFA-2026-0805');
  });

  test('3. Deterministic priority scoring algorithm accurately computes multi-parameter score and tiers', () => {
    // Case A: High-value urgent action
    const scoreA = calculatePriorityScore({
      expectedFinancialValue: 25000,
      urgencyScore: 100,
      recoverabilityScore: 100,
      confidenceScore: 100,
      effortScore: 0
    });
    // Value: 35, Urg: 25, Rec: 20, Conf: 10, Eff: 10 -> Total 100.0
    assert.strictEqual(scoreA.compositeScore, 100.0);
    assert.strictEqual(scoreA.priorityTier, PRIORITY_TIERS.P0_CRITICAL);
    assert.strictEqual(scoreA.breakdown.valueComponent, 35.0);

    // Case B: Moderate value routine action
    const scoreB = calculatePriorityScore({
      expectedFinancialValue: 2500, // 2500/25000 * 35 = 3.5
      urgencyScore: 30, // 30 * 0.25 = 7.5
      recoverabilityScore: 60, // 60 * 0.2 = 12.0
      confidenceScore: 80, // 80 * 0.1 = 8.0
      effortScore: 70 // (100-70) * 0.1 = 3.0
    });
    // Total = 3.5 + 7.5 + 12.0 + 8.0 + 3.0 = 34.0
    assert.strictEqual(scoreB.compositeScore, 34.0);
    assert.strictEqual(scoreB.priorityTier, PRIORITY_TIERS.P3_ROUTINE);

    // Case C: Value capping at 25,000 reference ceiling
    const scoreC1 = calculatePriorityScore({ expectedFinancialValue: 25000 });
    const scoreC2 = calculatePriorityScore({ expectedFinancialValue: 50000 });
    assert.strictEqual(scoreC1.breakdown.valueComponent, scoreC2.breakdown.valueComponent, 'Value component must cap at 25,000 ceiling');
  });

  test('4. Action assignment transitions status and records immutable audit event', () => {
    const actionId = 'a001-nbfa-001-naples';
    const result = assignAction(actionId, 'usr_sarah_rcm', 'billing_specialist', {
      userId: 'usr_rcm_director'
    });

    assert.strictEqual(result.action.status, ACTION_STATUSES.ASSIGNED);
    assert.strictEqual(result.action.assignedTo, 'usr_sarah_rcm');
    assert.strictEqual(result.action.assignedRole, 'billing_specialist');

    assert.ok(result.event);
    assert.strictEqual(result.event.eventType, 'ASSIGNED');
    assert.strictEqual(result.event.newStatus, ACTION_STATUSES.ASSIGNED);
    assert.strictEqual(result.event.performedBy, 'usr_rcm_director');

    const events = getActionAuditEvents(actionId);
    assert.strictEqual(events.length, 1);
  });

  test('5. State machine transitions enforce status validity and execution tracking', () => {
    const actionId = 'a001-nbfa-001-naples';

    // Transition PENDING -> IN_PROGRESS
    const res1 = executeActionTransition(actionId, ACTION_STATUSES.IN_PROGRESS, {
      userId: 'usr_sarah_rcm',
      notes: 'Investigating missing operative report'
    });
    assert.strictEqual(res1.action.status, ACTION_STATUSES.IN_PROGRESS);

    // Transition IN_PROGRESS -> COMPLETED
    const res2 = executeActionTransition(actionId, ACTION_STATUSES.COMPLETED, {
      userId: 'usr_sarah_rcm',
      notes: 'Appeal submitted via Availity portal'
    });
    assert.strictEqual(res2.action.status, ACTION_STATUSES.COMPLETED);
    assert.strictEqual(res2.event.eventType, 'COMPLETED');

    // Invalid status rejection
    assert.throws(() => {
      executeActionTransition(actionId, 'INVALID_UNKNOWN_STATUS');
    }, /Invalid status/);
  });

  test('6. Dismissal governance enforces mandatory canonical reason code and notes', () => {
    const actionId = 'a004-nbfa-004-naples';

    // Valid dismissal
    const res = dismissAction(actionId, 'INELIGIBLE_PAYER_CLAUSE', 'Contract section 4.2 excludes secondary implants per carveout addendum', {
      userId: 'usr_financial_controller'
    });
    assert.strictEqual(res.action.status, ACTION_STATUSES.DISMISSED);
    assert.strictEqual(res.action.dismissalReason, 'INELIGIBLE_PAYER_CLAUSE');

    // Rejection on missing reason code
    assert.throws(() => {
      dismissAction(actionId, '', 'Valid notes here');
    }, /Mandatory dismissal reason code missing/);

    // Rejection on empty notes
    assert.throws(() => {
      dismissAction(actionId, 'TIMELY_FILING_EXPIRED', '');
    }, /Mandatory dismissal justification notes/);
  });

  test('7. Cryptographic SHA-256 hash produces reproducible 64-character hex digests', () => {
    const hash1 = computeActionHash({ code: 'NBFA-001', value: 3450.00 });
    const hash2 = computeActionHash({ code: 'NBFA-001', value: 3450.00 });
    const hash3 = computeActionHash({ code: 'NBFA-001', value: 3450.01 });

    assert.strictEqual(hash1, hash2, 'Identical inputs must produce identical digests');
    assert.notStrictEqual(hash1, hash3, 'Different inputs must produce different digests');
    assert.strictEqual(hash1.length, 64);
  });

  test('8. Database Migration 107 SQL UP and DOWN integrity', () => {
    const upSqlPath = path.resolve(__dirname, '../supabase/migrations/107_next_best_financial_action.sql');
    const downSqlPath = path.resolve(__dirname, '../supabase/migrations/107_next_best_financial_action_down.sql');

    assert.ok(fs.existsSync(upSqlPath), '107 UP migration file must exist');
    assert.ok(fs.existsSync(downSqlPath), '107 DOWN migration file must exist');

    const upSql = fs.readFileSync(upSqlPath, 'utf8');
    const downSql = fs.readFileSync(downSqlPath, 'utf8');

    // UP integrity
    assert.ok(upSql.includes('next_best_financial_actions'), 'UP migration must create next_best_financial_actions');
    assert.ok(upSql.includes('nbfa_action_events'), 'UP migration must create nbfa_action_events');
    assert.ok(upSql.includes('vw_nbfa_facility_telemetry'), 'UP migration must create telemetry view');
    assert.ok(upSql.includes('facility_id UUID NOT NULL REFERENCES public.facilities(id)'), 'Must enforce UUID facility_id FK');
    assert.ok(upSql.includes('ENABLE ROW LEVEL SECURITY'), 'UP migration must enable RLS');
    assert.ok(upSql.includes('DROP POLICY IF EXISTS'), 'UP migration must include idempotent DROP POLICY guards');
    assert.ok(upSql.includes('::uuid'), 'RLS policy must cast facility_id setting to ::uuid');

    // DOWN integrity
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.nbfa_action_events CASCADE'), 'DOWN migration must drop nbfa_action_events');
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.next_best_financial_actions CASCADE'), 'DOWN migration must drop next_best_financial_actions');
    assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_nbfa_facility_telemetry CASCADE'), 'DOWN migration must drop telemetry view');
  });

  test('9. Dual-export facade re-exports all service functions in lib facade', () => {
    assert.ok(typeof libNextBestActionService.getNextBestFinancialActions === 'function');
    assert.ok(typeof libNextBestActionService.getActionById === 'function');
    assert.ok(typeof libNextBestActionService.calculatePriorityScore === 'function');
    assert.ok(typeof libNextBestActionService.assignAction === 'function');
    assert.ok(typeof libNextBestActionService.executeActionTransition === 'function');
    assert.ok(typeof libNextBestActionService.dismissAction === 'function');
    assert.ok(typeof libNextBestActionService.getNBFATelemetry === 'function');
  });

  test('10. Zero-purple design system compliance in D0 components and styles', () => {
    const jsxPath = path.resolve(__dirname, '../src/components/NextBestFinancialActionView.jsx');
    const cssPath = path.resolve(__dirname, '../src/components/NextBestFinancialActionView.css');
    const srvPath = path.resolve(__dirname, '../src/services/nextBestActionService.js');

    const jsxContent = fs.readFileSync(jsxPath, 'utf8');
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    const srvContent = fs.readFileSync(srvPath, 'utf8');

    const prohibitedTokens = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];

    prohibitedTokens.forEach(token => {
      const regex = new RegExp(`\\b${token}\\b`, 'i');
      assert.strictEqual(regex.test(jsxContent), false, `NextBestFinancialActionView.jsx contains prohibited token "${token}"`);
      assert.strictEqual(regex.test(cssContent), false, `NextBestFinancialActionView.css contains prohibited token "${token}"`);
      assert.strictEqual(regex.test(srvContent), false, `nextBestActionService.js contains prohibited token "${token}"`);
    });
  });

  test('11. App Shell Navigation & Wiring verification for D0', () => {
    const appPath = path.resolve(__dirname, '../src/App.jsx');
    const appContent = fs.readFileSync(appPath, 'utf8');

    assert.ok(appContent.includes("import NextBestFinancialActionView from './components/NextBestFinancialActionView';"), 'App.jsx must import NextBestFinancialActionView');
    assert.ok(appContent.includes("activeTab === 'next_best_financial_action'"), 'App.jsx must handle next_best_financial_action activeTab');
    assert.ok(appContent.includes("<NextBestFinancialActionView activeFacility={activeFacility} />"), 'App.jsx must render NextBestFinancialActionView');
    assert.ok(appContent.includes("'next_best_financial_action'"), 'App.jsx must exclude next_best_financial_action from generic date filters');
  });

});
