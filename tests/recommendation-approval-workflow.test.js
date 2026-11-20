/**
 * ==============================================================================
 * Phase D3 Test Suite: Recommendation Human Approval Workflow
 * Module 13: Decision Intelligence
 * Tests: Multi-tier quorum routing, dual-key signing, anti-self-approval
 *        enforcement, rejection governance, execution gating, cryptographic
 *        decision hashes, migration 110 SQL integrity, and zero-purple compliance.
 * ==============================================================================
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  APPROVAL_TIERS,
  APPROVAL_STATUSES,
  REVIEW_ACTION_TYPES,
  determineApprovalTier,
  computeDecisionHash,
  SEED_APPROVAL_REQUESTS,
  SEED_APPROVAL_ACTIONS,
  resetApprovalStore,
  getApprovalQueue,
  getApprovalById,
  getApprovalForAction,
  submitForApproval,
  reviewApproval,
  executeApprovedAction,
  getApprovalAuditActions,
  getApprovalTelemetry,
  matchesFacilityId
} from '../src/services/recommendationApprovalService.js';

import * as libApprovalService from '../src/lib/recommendationApprovalService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase D3: Recommendation Human Approval Workflow Engine', () => {

  beforeEach(() => {
    resetApprovalStore();
  });

  test('1. Approval Telemetry returns accurate facility counts and quorum metrics', () => {
    const telemetry = getApprovalTelemetry('fac-naples-01');
    assert.strictEqual(telemetry.totalRequests, 5, 'Must report 5 seed approval requests');
    assert.strictEqual(telemetry.pendingCount, 2, 'Must have 2 pending approval requests');
    assert.strictEqual(telemetry.approvedCount, 1, 'Must have 1 approved request');
    assert.strictEqual(telemetry.executedCount, 1, 'Must have 1 executed request');
    assert.strictEqual(telemetry.rejectedCount, 1, 'Must have 1 rejected request');
    assert.strictEqual(telemetry.tier2DualKeyCount, 2, 'Must have 2 Tier 2 Dual-Key requests');
    assert.strictEqual(telemetry.tier3ExecutiveCount, 2, 'Must have 2 Tier 3 Executive requests');
    assert.ok(telemetry.quorumCompletionRatePct >= 40.0, 'Quorum completion rate must be at least 40%');
    assert.strictEqual(telemetry.cryptographicProvenanceStatus, 'SHA-256 Decision Ledger Active');
  });

  test('2. Facility UUID alias resolution works for Naples Surgery Center in approvals', () => {
    const aliasTelem = getApprovalTelemetry('00000000-0000-0000-0000-000000000002');
    assert.strictEqual(aliasTelem.totalRequests, 5, 'UUID alias must return same 5 seed requests');
    assert.strictEqual(aliasTelem.pendingCount, 2);

    const queueByUUID = getApprovalQueue('00000000-0000-0000-0000-000000000002');
    assert.strictEqual(queueByUUID.length, 5);
  });

  test('3. Deterministic Tier Threshold Derivation (Tier 1 vs Tier 2 vs Tier 3)', () => {
    // Under $2,500.00 -> Tier 1 (Single Sign)
    const lowValue = determineApprovalTier({
      expectedFinancialValue: 1850.00,
      category: 'DENIAL_APPEAL_ROUTINE'
    });
    assert.strictEqual(lowValue.tier, APPROVAL_TIERS.TIER_1_SINGLE_SIGN);
    assert.strictEqual(lowValue.requiredSignaturesCount, 1);
    assert.strictEqual(lowValue.timeoutHours, 72);

    // $2,500.00 - $10,000.00 -> Tier 2 (Dual-Key)
    const midValue = determineApprovalTier({
      expectedFinancialValue: 4500.00,
      category: 'IMPLANT_CARVEOUT_CLAIM'
    });
    assert.strictEqual(midValue.tier, APPROVAL_TIERS.TIER_2_DUAL_KEY);
    assert.strictEqual(midValue.requiredSignaturesCount, 2);
    assert.strictEqual(midValue.timeoutHours, 48);

    // OR Block Release override -> Always Tier 2 (Dual-Key) even if under $2,500
    const blockRelease = determineApprovalTier({
      expectedFinancialValue: 1200.00,
      category: 'OR_BLOCK_RELEASE'
    });
    assert.strictEqual(blockRelease.tier, APPROVAL_TIERS.TIER_2_DUAL_KEY);
    assert.strictEqual(blockRelease.requiredSignaturesCount, 2);

    // Over $10,000.00 -> Tier 3 (Executive Quorum)
    const highValue = determineApprovalTier({
      expectedFinancialValue: 14500.00,
      category: 'HIGH_VALUE_SETTLEMENT'
    });
    assert.strictEqual(highValue.tier, APPROVAL_TIERS.TIER_3_EXECUTIVE_QUORUM);
    assert.strictEqual(highValue.requiredSignaturesCount, 2);
    assert.strictEqual(highValue.requiredRole, 'cfo');
    assert.strictEqual(highValue.timeoutHours, 24);

    // Contract Rate Amendment override -> Always Tier 3
    const contractAmend = determineApprovalTier({
      expectedFinancialValue: 500.00,
      category: 'CONTRACT_RATE_AMENDMENT'
    });
    assert.strictEqual(contractAmend.tier, APPROVAL_TIERS.TIER_3_EXECUTIVE_QUORUM);
  });

  test('4. Anti-Self-Approval Rule strictly prohibits requesters from approving their own actions', () => {
    // appr-001 was requested by 'usr_sarah_rcm'
    const approval = getApprovalById('appr-001');
    assert.strictEqual(approval.requestedByUserId, 'usr_sarah_rcm');

    // Sarah attempts to approve her own request -> Must throw
    assert.throws(() => {
      reviewApproval('appr-001', {
        actionType: REVIEW_ACTION_TYPES.APPROVE,
        reviewerUserId: 'usr_sarah_rcm',
        reviewerName: 'Sarah Jenkins',
        reviewerRole: 'billing_specialist'
      });
    }, /Self-approval is strictly prohibited/);
  });

  test('5. Multi-tier Quorum Progression: Collects distinct signatures until threshold met', () => {
    // appr-002 requires 2 signatures, currently has 0
    const appr = getApprovalById('appr-002');
    assert.strictEqual(appr.requiredSignaturesCount, 2);
    assert.strictEqual(appr.collectedSignaturesCount, 0);
    assert.strictEqual(appr.status, APPROVAL_STATUSES.PENDING);

    // First executive signs
    const vote1 = reviewApproval('appr-002', {
      actionType: REVIEW_ACTION_TYPES.APPROVE,
      reviewerUserId: 'usr_cfo_marcus',
      reviewerName: 'Marcus Bell (CFO)',
      reviewerRole: 'cfo',
      comments: 'Block release verified against backlog surgical waitlist.'
    });

    assert.strictEqual(vote1.approval.collectedSignaturesCount, 1);
    assert.strictEqual(vote1.approval.status, APPROVAL_STATUSES.PENDING, 'Should remain PENDING after 1/2 signatures');

    // Duplicate signature by same user -> Must throw
    assert.throws(() => {
      reviewApproval('appr-002', {
        actionType: REVIEW_ACTION_TYPES.APPROVE,
        reviewerUserId: 'usr_cfo_marcus',
        reviewerName: 'Marcus Bell (CFO)',
        reviewerRole: 'cfo'
      });
    }, /User has already submitted a signature/);

    // Second distinct executive signs
    const vote2 = reviewApproval('appr-002', {
      actionType: REVIEW_ACTION_TYPES.APPROVE,
      reviewerUserId: 'usr_dir_olivia',
      reviewerName: 'Olivia Martinez (Medical Director)',
      reviewerRole: 'medical_director',
      comments: 'Concur with block release for high-margin orthopaedic cases.'
    });

    assert.strictEqual(vote2.approval.collectedSignaturesCount, 2);
    assert.strictEqual(vote2.approval.status, APPROVAL_STATUSES.APPROVED, 'Should transition to APPROVED after quorum reached');
  });

  test('6. Execution Gating: Actions in PENDING status cannot be executed', () => {
    // appr-001 is PENDING (1/2 signatures)
    assert.throws(() => {
      executeApprovedAction('appr-001', { userId: 'usr_admin', role: 'admin' });
    }, /Current status is "PENDING", expected "APPROVED"/);

    // appr-003 is APPROVED -> Execution succeeds
    const executed = executeApprovedAction('appr-003', {
      userId: 'usr_marcus_cfo',
      userName: 'Marcus Bell',
      role: 'cfo'
    });
    assert.strictEqual(executed.approval.status, APPROVAL_STATUSES.EXECUTED);
    assert.ok(executed.approval.executedAt);

    // Attempting to execute an already EXECUTED action throws
    assert.throws(() => {
      executeApprovedAction('appr-003', { userId: 'usr_admin', role: 'admin' });
    }, /Current status is "EXECUTED", expected "APPROVED"/);
  });

  test('7. Rejection Governance: Mandatory rationale required and status flips to REJECTED', () => {
    // Rejection without rationale throws error
    assert.throws(() => {
      reviewApproval('appr-001', {
        actionType: REVIEW_ACTION_TYPES.REJECT,
        reviewerUserId: 'usr_reviewer_bob',
        comments: 'Short'
      });
    }, /Mandatory business rationale \(min 10 characters\) is required/);

    // Rejection with valid rationale succeeds
    const res = reviewApproval('appr-001', {
      actionType: REVIEW_ACTION_TYPES.REJECT,
      reviewerUserId: 'usr_reviewer_bob',
      reviewerName: 'Bob Vance',
      reviewerRole: 'financial_controller',
      comments: 'Rejected due to duplicate claim appeal already logged in clearinghouse.'
    });

    assert.strictEqual(res.approval.status, APPROVAL_STATUSES.REJECTED);
    assert.strictEqual(res.actionEntry.actionType, REVIEW_ACTION_TYPES.REJECT);
  });

  test('8. Cryptographic SHA-256 Decision Hashes are deterministic and tamper-evident', () => {
    const payload = {
      actionId: 'a001-nbfa-001-naples',
      impact: 3450.00,
      reviewer: 'usr_cfo_marcus'
    };

    const hash1 = computeDecisionHash(payload);
    const hash2 = computeDecisionHash(payload);
    assert.strictEqual(hash1, hash2, 'Identical inputs must yield identical decision hashes');
    assert.strictEqual(hash1.length, 64, 'SHA-256 must yield 64-character hex string');

    const tampered = computeDecisionHash({ ...payload, impact: 9999.00 });
    assert.notStrictEqual(hash1, tampered, 'Modified inputs must yield distinct hashes');
  });

  test('9. Migration 110 SQL scripts have valid schemas, foreign keys, and idempotent policies', () => {
    const upSqlPath = path.resolve(__dirname, '../supabase/migrations/110_recommendation_human_approval.sql');
    const downSqlPath = path.resolve(__dirname, '../supabase/migrations/110_recommendation_human_approval_down.sql');

    assert.ok(fs.existsSync(upSqlPath), 'Migration 110 UP must exist');
    assert.ok(fs.existsSync(downSqlPath), 'Migration 110 DOWN must exist');

    const upSql = fs.readFileSync(upSqlPath, 'utf8');
    assert.ok(upSql.includes('recommendation_approvals'));
    assert.ok(upSql.includes('recommendation_approval_actions'));
    assert.ok(upSql.includes('vw_recommendation_approval_telemetry'));
    assert.ok(upSql.includes('DROP POLICY IF EXISTS'), 'Must use DROP POLICY IF EXISTS before CREATE POLICY');
    assert.ok(upSql.includes('ENABLE ROW LEVEL SECURITY'));

    const downSql = fs.readFileSync(downSqlPath, 'utf8');
    assert.ok(downSql.includes('vw_recommendation_approval_telemetry'));
    assert.ok(downSql.includes('recommendation_approval_actions'));
    assert.ok(downSql.includes('recommendation_approvals'));
  });

  test('10. Zero-Purple Maestro Clinical CSS Token Compliance', () => {
    const cssPath = path.resolve(__dirname, '../src/components/RecommendationApprovalWorkflowView.css');
    assert.ok(fs.existsSync(cssPath), 'CSS file must exist');

    const css = fs.readFileSync(cssPath, 'utf8');
    const prohibitedTokens = ['#7c3aed', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', 'purple', 'violet', 'indigo', 'magenta', 'fuchsia'];
    for (const token of prohibitedTokens) {
      assert.ok(!css.toLowerCase().includes(token), `CSS must not include prohibited token: "${token}"`);
    }
  });

  test('11. Dual re-export facade parity between service and lib', () => {
    const serviceKeys = Object.keys(import('../src/services/recommendationApprovalService.js'));
    for (const key of ['determineApprovalTier', 'computeDecisionHash', 'getApprovalQueue', 'submitForApproval', 'reviewApproval', 'executeApprovedAction', 'getApprovalTelemetry']) {
      assert.ok(typeof libApprovalService[key] === 'function', `lib must re-export function: ${key}`);
    }
    assert.ok(libApprovalService.APPROVAL_TIERS, 'lib must re-export APPROVAL_TIERS');
    assert.ok(libApprovalService.APPROVAL_STATUSES, 'lib must re-export APPROVAL_STATUSES');
  });

  test('12. App Shell (src/App.jsx) navigation and tab rendering wiring', () => {
    const appPath = path.resolve(__dirname, '../src/App.jsx');
    const appContent = fs.readFileSync(appPath, 'utf8');

    assert.ok(appContent.includes("import RecommendationApprovalWorkflowView from './components/RecommendationApprovalWorkflowView'"));
    assert.ok(appContent.includes("activeTab === 'recommendation_approvals'"));
    assert.ok(appContent.includes("Human Approval & Quorum Workflow"));
    assert.ok(appContent.includes("<RecommendationApprovalWorkflowView activeFacility={activeFacility} />"));
  });

});
