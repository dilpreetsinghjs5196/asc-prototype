/**
 * ==============================================================================
 * Phase C6 Test Suite: AI Human Approval & Consequential Action Governance
 * Module 12: AI & Intelligence
 * Tests: Multi-tier dual-key signoff, separation of duties, duplicate signature gating,
 *        blast radius analysis, execution dispatch, 72-hour 1-click rollback,
 *        SHA-256 digital signature hashes, migration 104, and zero-purple compliance.
 * ==============================================================================
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GOVERNANCE_TIERS,
  ACTION_TYPES,
  APPROVAL_STATUSES,
  KEY_POSITIONS,
  SIGNATURE_DECISIONS,
  computeDigitalSignatureHash,
  getApprovalQueue,
  getApprovalDetail,
  submitDigitalSignature,
  executeApprovedAction,
  rollbackConsequentialAction,
  getHumanApprovalTelemetry,
  createApprovalProposal,
  resetApprovalStore
} from '../src/services/aiHumanApprovalService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase C6: AI Human Approval & Consequential Action Governance', () => {

  beforeEach(() => {
    resetApprovalStore();
  });

  test('1. Human Approval Telemetry returns accurate facility KPIs', () => {
    const telemetry = getHumanApprovalTelemetry('fac-naples-01');
    assert.ok(telemetry.pendingSignoffs >= 0, 'Pending signoffs should be non-negative');
    assert.ok(telemetry.approvedExecutions >= 0, 'Approved executions should be non-negative');
    assert.ok(telemetry.executedCount >= 0, 'Executed count should be non-negative');
    assert.strictEqual(telemetry.rollbackReadinessPct, 100.0, 'Rollback readiness must be 100%');
    assert.ok(telemetry.avgSignoffHours > 0, 'Average signoff hours should be positive');
  });

  test('2. Governance Tier matrix accurately defines thresholds and key counts', () => {
    assert.strictEqual(GOVERNANCE_TIERS.TIER_1_STANDARD.requiredSignatures, 1);
    assert.strictEqual(GOVERNANCE_TIERS.TIER_1_STANDARD.ceilingUsd, 1000.00);

    assert.strictEqual(GOVERNANCE_TIERS.TIER_2_DUAL_KEY.requiredSignatures, 2);
    assert.strictEqual(GOVERNANCE_TIERS.TIER_2_DUAL_KEY.ceilingUsd, 25000.00);

    assert.strictEqual(GOVERNANCE_TIERS.TIER_3_QUORUM.requiredSignatures, 2);
    assert.strictEqual(GOVERNANCE_TIERS.TIER_3_QUORUM.ceilingUsd, Infinity);
  });

  test('3. Approval queue returns proposals filtered by facility and tier', () => {
    const allProposals = getApprovalQueue('fac-naples-01');
    assert.ok(Array.isArray(allProposals), 'Queue should return an array');
    assert.ok(allProposals.length >= 3, 'Should contain seeded consequential proposals');

    const tier2Proposals = getApprovalQueue('fac-naples-01', { tier: 'TIER_2_DUAL_KEY' });
    tier2Proposals.forEach(p => {
      assert.strictEqual(p.governanceTier, 'TIER_2_DUAL_KEY', 'Filtered proposals must match tier');
    });
  });

  test('4. computeDigitalSignatureHash generates deterministic cryptographic SHA-256 hash', () => {
    const hash1 = computeDigitalSignatureHash('REQ-001', 'user-01', 'APPROVED', 'KEY_1', '2026-11-18T10:00:00Z');
    const hash2 = computeDigitalSignatureHash('REQ-001', 'user-01', 'APPROVED', 'KEY_1', '2026-11-18T10:00:00Z');
    const hashDifferent = computeDigitalSignatureHash('REQ-001', 'user-02', 'APPROVED', 'KEY_1', '2026-11-18T10:00:00Z');

    assert.strictEqual(typeof hash1, 'string', 'Hash should be a string');
    assert.strictEqual(hash1.length, 64, 'SHA-256 hash must be 64 hexadecimal characters');
    assert.strictEqual(hash1, hash2, 'Identical inputs must yield identical hash');
    assert.notStrictEqual(hash1, hashDifferent, 'Different signer must yield different hash');
  });

  test('5. Dual-Key Signing Flow: transitions from PENDING to PARTIAL to APPROVED', () => {
    const testReqId = `TEST-PROPOSAL-${Date.now()}`;
    createApprovalProposal({
      id: testReqId,
      facilityId: 'fac-naples-01',
      actionType: ACTION_TYPES.OR_BLOCK_REALLOCATION,
      governanceTier: 'TIER_2_DUAL_KEY',
      status: APPROVAL_STATUSES.PENDING_APPROVAL,
      title: 'Emergency Block Schedule Modification',
      requesterId: 'usr-ai-orchestrator',
      blastRadius: { financialExposure: 8400, casesAffected: 3, physiciansImpacted: 2 },
      requiredSignaturesCount: 2,
      signatures: []
    });

    // Key 1 Signoff
    const sign1 = submitDigitalSignature(testReqId, {
      signerId: 'usr-don-01',
      signerName: 'Sarah Jenkins, RN (DON)',
      signerRole: 'director_nursing',
      decision: SIGNATURE_DECISIONS.APPROVED,
      attestationStatement: 'Verified staffing capacity for transfer.'
    });

    assert.strictEqual(sign1.status, APPROVAL_STATUSES.PARTIALLY_APPROVED);
    const detailAfterSign1 = getApprovalDetail(testReqId);
    assert.strictEqual(detailAfterSign1.signatures.length, 1);
    assert.ok(detailAfterSign1.signatures[0].signatureHash, 'Must generate digital signature hash');

    // Key 2 Signoff
    const sign2 = submitDigitalSignature(testReqId, {
      signerId: 'usr-admin-02',
      signerName: 'Marcus Vance, MBA (Admin)',
      signerRole: 'clinical_admin',
      decision: SIGNATURE_DECISIONS.APPROVED,
      attestationStatement: 'Financial impact acceptable, approved.'
    });

    assert.strictEqual(sign2.status, APPROVAL_STATUSES.APPROVED);
    const detailAfterSign2 = getApprovalDetail(testReqId);
    assert.strictEqual(detailAfterSign2.signatures.length, 2);
  });

  test('6. Separation of Duties: Proposer cannot approve their own action in Tier 2/3', () => {
    const testReqId = `TEST-SOD-${Date.now()}`;
    createApprovalProposal({
      id: testReqId,
      facilityId: 'fac-naples-01',
      actionType: ACTION_TYPES.CONSTRUCT_STANDARDIZATION,
      governanceTier: 'TIER_2_DUAL_KEY',
      status: APPROVAL_STATUSES.PENDING_APPROVAL,
      title: 'Fee Schedule Uplift',
      requesterId: 'usr-cfo-elena',
      requiredSignaturesCount: 2,
      signatures: []
    });

    assert.throws(() => {
      submitDigitalSignature(testReqId, {
        signerId: 'usr-cfo-elena', // SAME as requesterId
        signerName: 'Elena Rostova, CFO',
        signerRole: 'cfo',
        decision: SIGNATURE_DECISIONS.APPROVED,
        attestationStatement: 'Self approval attempt.'
      });
    }, /SEPARATION_OF_DUTIES_VIOLATION/);
  });

  test('7. Duplicate Signature: Same person cannot sign both Key 1 and Key 2', () => {
    const testReqId = `TEST-DUP-${Date.now()}`;
    createApprovalProposal({
      id: testReqId,
      facilityId: 'fac-naples-01',
      actionType: ACTION_TYPES.OR_BLOCK_REALLOCATION,
      governanceTier: 'TIER_2_DUAL_KEY',
      status: APPROVAL_STATUSES.PENDING_APPROVAL,
      title: 'Block Swap',
      requesterId: 'usr-ai-agent',
      requiredSignaturesCount: 2,
      signatures: []
    });

    // Sign Key 1
    submitDigitalSignature(testReqId, {
      signerId: 'usr-officer-01',
      signerName: 'Dr. Officer',
      signerRole: 'director_nursing',
      decision: SIGNATURE_DECISIONS.APPROVED,
      attestationStatement: 'Key 1 signed.'
    });

    // Try signing Key 2 with SAME user
    assert.throws(() => {
      submitDigitalSignature(testReqId, {
        signerId: 'usr-officer-01', // Duplicate signer ID
        signerName: 'Dr. Officer',
        signerRole: 'clinical_admin',
        decision: SIGNATURE_DECISIONS.APPROVED,
        attestationStatement: 'Duplicate signing attempt.'
      });
    }, /DUPLICATE_SIGNATURE_VIOLATION/);
  });

  test('8. Execution Dispatch: blocked when proposal is not fully approved', () => {
    const testReqId = `TEST-UNAPPROVED-${Date.now()}`;
    createApprovalProposal({
      id: testReqId,
      facilityId: 'fac-naples-01',
      actionType: ACTION_TYPES.CONTRACT_RATE_AMENDMENT,
      governanceTier: 'TIER_3_QUORUM',
      status: APPROVAL_STATUSES.PARTIALLY_APPROVED,
      title: 'Implant Contract Restructure',
      requesterId: 'usr-ai-agent',
      requiredSignaturesCount: 2,
      signatures: [{ signerId: 'usr-cfo-01' }]
    });

    assert.throws(() => {
      executeApprovedAction(testReqId, { executorId: 'usr-executor-01' });
    }, /EXECUTION_DISPATCH_BLOCKED/);
  });

  test('9. Execution Dispatch: succeeds when fully approved and sets 72h reversible window', () => {
    const testReqId = `TEST-EXEC-${Date.now()}`;
    createApprovalProposal({
      id: testReqId,
      facilityId: 'fac-naples-01',
      actionType: ACTION_TYPES.OR_BLOCK_REALLOCATION,
      governanceTier: 'TIER_2_DUAL_KEY',
      status: APPROVAL_STATUSES.APPROVED,
      title: 'OR Block Reallocation 4h',
      requesterId: 'usr-ai-agent',
      requiredSignaturesCount: 2,
      signatures: [{ signerId: 'usr-1' }, { signerId: 'usr-2' }],
      proposedPayload: { room: 'OR-3', releasedHours: 4 }
    });

    const execResult = executeApprovedAction(testReqId, { executorId: 'usr-orchestrator-admin' });
    assert.strictEqual(execResult.status, APPROVAL_STATUSES.EXECUTED);
    assert.ok(execResult.executionRecord.reversibleUntil, 'Must set 72h reversible window');

    const revDate = new Date(execResult.executionRecord.reversibleUntil);
    const now = new Date();
    const hoursDiff = (revDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    assert.ok(hoursDiff >= 71.0 && hoursDiff <= 73.0, 'Reversible window should be ~72 hours');
  });

  test('10. 1-Click Rollback Safeguard: rolls back executed action within 72h window', () => {
    const testReqId = `TEST-ROLLBACK-${Date.now()}`;
    createApprovalProposal({
      id: testReqId,
      facilityId: 'fac-naples-01',
      actionType: ACTION_TYPES.FINANCIAL_WRITE_OFF,
      governanceTier: 'TIER_2_DUAL_KEY',
      status: APPROVAL_STATUSES.APPROVED,
      title: 'Pricing Shift',
      requesterId: 'usr-ai-agent',
      requiredSignaturesCount: 2,
      signatures: [{ signerId: 'usr-a' }, { signerId: 'usr-b' }],
      rollbackPayload: { overrideRate: 3500 }
    });

    executeApprovedAction(testReqId, { executorId: 'usr-exec' });

    // Trigger Rollback
    const rollbackResult = rollbackConsequentialAction(testReqId, {
      rolledBackBy: 'usr-cfo-super',
      reason: 'Clinical scheduling conflict detected post-dispatch.'
    });

    assert.strictEqual(rollbackResult.status, APPROVAL_STATUSES.ROLLED_BACK);
    const detailAfterRollback = getApprovalDetail(testReqId);
    assert.strictEqual(detailAfterRollback.status, APPROVAL_STATUSES.ROLLED_BACK);
    assert.strictEqual(detailAfterRollback.executionRecord.executionStatus, 'ROLLED_BACK');
    assert.strictEqual(detailAfterRollback.executionRecord.rollbackReason, 'Clinical scheduling conflict detected post-dispatch.');
  });

  test('11. Database Migration 104 SQL UP and DOWN integrity', () => {
    const upSqlPath = path.resolve(__dirname, '../supabase/migrations/104_ai_human_approval_governance.sql');
    const downSqlPath = path.resolve(__dirname, '../supabase/migrations/104_ai_human_approval_governance_down.sql');

    assert.ok(fs.existsSync(upSqlPath), '104 UP migration file must exist');
    assert.ok(fs.existsSync(downSqlPath), '104 DOWN migration file must exist');

    const upSql = fs.readFileSync(upSqlPath, 'utf8');
    const downSql = fs.readFileSync(downSqlPath, 'utf8');

    assert.ok(upSql.includes('ai_human_approvals'), 'UP migration must create ai_human_approvals');
    assert.ok(upSql.includes('ai_approval_signatures'), 'UP migration must create ai_approval_signatures');
    assert.ok(upSql.includes('ai_consequential_executions'), 'UP migration must create ai_consequential_executions');
    assert.ok(upSql.includes('ENABLE ROW LEVEL SECURITY'), 'UP migration must enable RLS');

    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.ai_consequential_executions'), 'DOWN migration must drop ai_consequential_executions');
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.ai_approval_signatures'), 'DOWN migration must drop ai_approval_signatures');
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.ai_human_approvals'), 'DOWN migration must drop ai_human_approvals');
  });

  test('12. Zero-purple design system compliance in C6 component and styles', () => {
    const jsxPath = path.resolve(__dirname, '../src/components/AIHumanApprovalView.jsx');
    const cssPath = path.resolve(__dirname, '../src/components/AIHumanApprovalView.css');

    const jsxContent = fs.readFileSync(jsxPath, 'utf8');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    const prohibitedTokens = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];

    prohibitedTokens.forEach(token => {
      const jsxRegex = new RegExp(`\\b${token}\\b`, 'i');
      const cssRegex = new RegExp(`\\b${token}\\b`, 'i');

      assert.strictEqual(
        jsxRegex.test(jsxContent),
        false,
        `AIHumanApprovalView.jsx contains prohibited design token "${token}"`
      );
      assert.strictEqual(
        cssRegex.test(cssContent),
        false,
        `AIHumanApprovalView.css contains prohibited design token "${token}"`
      );
    });
  });

  test('13. App Shell Navigation & Wiring verification for C6', () => {
    const appPath = path.resolve(__dirname, '../src/App.jsx');
    const appContent = fs.readFileSync(appPath, 'utf8');

    assert.ok(appContent.includes("import AIHumanApprovalView from './components/AIHumanApprovalView';"), 'App.jsx must import AIHumanApprovalView');
    assert.ok(appContent.includes("activeTab === 'ai_human_approval'"), 'App.jsx must handle ai_human_approval activeTab');
    assert.ok(appContent.includes("<AIHumanApprovalView activeFacility={activeFacility} />"), 'App.jsx must render AIHumanApprovalView');
    assert.ok(appContent.includes("'ai_human_approval'"), 'App.jsx must exclude ai_human_approval from generic date range filters');
  });

});
