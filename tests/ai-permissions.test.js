/**
 * ==============================================================================
 * Test Suite: Phase C2 — AI Permissions & Action Boundaries Tier
 * Module: Module 12: AI & Intelligence
 * Description: Exhaustive automated test suite verifying granular role privilege
 *              matrix, action risk tier boundaries, Human-in-the-Loop (HITL) dual-key
 *              approval workflow, separation of duties, multi-tenant isolation,
 *              cryptographic SHA-256 provenance signatures, migration integrity,
 *              zero-purple design compliance, and App.jsx registration.
 * ==============================================================================
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AI_PERMISSIONS,
  RISK_TIERS,
  PROPOSAL_STATUSES,
  ROLE_PERMISSION_MATRIX,
  ACTION_BOUNDARIES_REGISTRY,
  SEED_PROPOSED_ACTIONS,
  hasAiPermission,
  evaluateActionBoundary,
  createActionProposal,
  decideActionProposal,
  generateDecisionProvenanceHash,
  calculatePermissionsTelemetry
} from '../src/services/aiPermissionsService.js';

import * as libExport from '../src/lib/aiPermissionsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

describe('Phase C2 — AI Permissions & Action Boundaries Tier Suite', () => {

  // 1. Role-Permission Matrix Evaluation
  describe('1. Role-Permission Matrix & Privilege Evaluation', () => {
    test('facility_admin and super_admin should possess all AI privileges including ai:admin', () => {
      for (const perm of Object.values(AI_PERMISSIONS)) {
        assert.strictEqual(hasAiPermission('facility_admin', perm), true, `facility_admin should have ${perm}`);
        assert.strictEqual(hasAiPermission('super_admin', perm), true, `super_admin should have ${perm}`);
      }
    });

    test('clinical_director and billing_manager should have approve_action and view_phi, but not ai:admin', () => {
      assert.strictEqual(hasAiPermission('clinical_director', AI_PERMISSIONS.APPROVE_ACTION), true);
      assert.strictEqual(hasAiPermission('clinical_director', AI_PERMISSIONS.VIEW_PHI), true);
      assert.strictEqual(hasAiPermission('clinical_director', AI_PERMISSIONS.ADMIN), false);

      assert.strictEqual(hasAiPermission('billing_manager', AI_PERMISSIONS.APPROVE_ACTION), true);
      assert.strictEqual(hasAiPermission('billing_manager', AI_PERMISSIONS.VIEW_FINANCIAL), true);
      assert.strictEqual(hasAiPermission('billing_manager', AI_PERMISSIONS.ADMIN), false);
    });

    test('surgeon role should have view_clinical and tool_execute, but not view_financial or view_phi', () => {
      assert.strictEqual(hasAiPermission('surgeon', AI_PERMISSIONS.CHAT), true);
      assert.strictEqual(hasAiPermission('surgeon', AI_PERMISSIONS.VIEW_CLINICAL), true);
      assert.strictEqual(hasAiPermission('surgeon', AI_PERMISSIONS.TOOL_EXECUTE), true);
      assert.strictEqual(hasAiPermission('surgeon', AI_PERMISSIONS.VIEW_FINANCIAL), false);
      assert.strictEqual(hasAiPermission('surgeon', AI_PERMISSIONS.VIEW_PHI), false);
      assert.strictEqual(hasAiPermission('surgeon', AI_PERMISSIONS.APPROVE_ACTION), false);
    });

    test('viewer role should only have ai:chat; guest role should have zero permissions', () => {
      assert.strictEqual(hasAiPermission('viewer', AI_PERMISSIONS.CHAT), true);
      assert.strictEqual(hasAiPermission('viewer', AI_PERMISSIONS.TOOL_EXECUTE), false);
      assert.strictEqual(hasAiPermission('viewer', AI_PERMISSIONS.VIEW_CLINICAL), false);

      for (const perm of Object.values(AI_PERMISSIONS)) {
        assert.strictEqual(hasAiPermission('guest', perm), false, `guest must not have ${perm}`);
      }
    });
  });

  // 2. Action Risk Boundary Classification
  describe('2. Action Risk Boundary Classification Engine', () => {
    test('should classify mutation actions as PROPOSED_MUTATION requiring dual-key approval', () => {
      const boundary = ACTION_BOUNDARIES_REGISTRY['mutate_or_block_release'];
      assert.ok(boundary);
      assert.strictEqual(boundary.riskTier, RISK_TIERS.PROPOSED_MUTATION);
      assert.strictEqual(boundary.requiresApproval, true);
    });

    test('should classify board report generation as EXPORT_SYNTHESIS without blocking mutation approval', () => {
      const boundary = ACTION_BOUNDARIES_REGISTRY['export_executive_board_dossier'];
      assert.ok(boundary);
      assert.strictEqual(boundary.riskTier, RISK_TIERS.EXPORT_SYNTHESIS);
      assert.strictEqual(boundary.requiresApproval, false);
    });

    test('should strictly block Tier 4 RESTRICTED_SYSTEM_ACTION operations from AI execution', () => {
      const evalResult = evaluateActionBoundary('system_database_truncate_partition', {
        facilityId: '00000000-0000-0000-0000-000000000001',
        role: 'facility_admin'
      });
      assert.strictEqual(evalResult.isAllowed, false);
      assert.strictEqual(evalResult.riskTier, RISK_TIERS.RESTRICTED_SYSTEM_ACTION);
      assert.ok(evalResult.reason.includes('Security Policy Violation'));
    });

    test('should reject action requests without mandatory facility tenancy context', () => {
      const evalResult = evaluateActionBoundary('mutate_or_block_release', {
        facilityId: null,
        role: 'clinical_director'
      });
      assert.strictEqual(evalResult.isAllowed, false);
      assert.ok(evalResult.reason.includes('tenancy context missing'));
    });
  });

  // 3. Human-in-the-Loop (HITL) Proposal Lifecycle
  describe('3. Human-in-the-Loop (HITL) Proposal Lifecycle', () => {
    const testFacility = '00000000-0000-0000-0000-000000000001';

    test('should create valid proposal in PENDING_APPROVAL status with 24h expiration', () => {
      const proposal = createActionProposal(
        'mutate_or_block_release',
        'Release OR 1 Block on Tuesday',
        'Utilization is 15.0%',
        { room: 'OR 1', hours: 4 },
        { recoveredValue: 8000 },
        {
          facilityId: testFacility,
          userId: 'usr_analyst_01',
          role: 'analyst'
        }
      );

      assert.strictEqual(proposal.status, PROPOSAL_STATUSES.PENDING_APPROVAL);
      assert.strictEqual(proposal.requesterId, 'usr_analyst_01');
      assert.strictEqual(proposal.requesterRole, 'analyst');
      assert.strictEqual(proposal.executionHash.length, 64);
      assert.ok(new Date(proposal.expiresAt) > new Date());
    });

    test('should reject proposal creation if user lacks requester privileges for boundary', () => {
      assert.throws(() => {
        createActionProposal(
          'mutate_construct_substitution_policy',
          'Standardize knee constructs',
          'Cost savings',
          {},
          {},
          {
            facilityId: testFacility,
            userId: 'usr_viewer_09',
            role: 'viewer'
          }
        );
      }, /lacks privilege to initiate action/);
    });
  });

  // 4. Dual-Key Approval & Separation of Duties
  describe('4. Dual-Key Approval & Separation of Duties', () => {
    const testFacility = '00000000-0000-0000-0000-000000000001';

    test('authorized approver should approve proposal and stage execution', () => {
      const proposal = createActionProposal(
        'mutate_or_block_release',
        'Test Block Release',
        'Test rationale',
        {},
        {},
        {
          facilityId: testFacility,
          userId: 'usr_analyst_01',
          role: 'analyst'
        }
      );

      const decision = decideActionProposal(
        proposal,
        'APPROVE',
        {
          facilityId: testFacility,
          userId: 'usr_clinical_director',
          role: 'clinical_director'
        },
        'Clinically justified based on block vacancy.'
      );

      assert.strictEqual(decision.status, PROPOSAL_STATUSES.APPROVED);
      assert.strictEqual(decision.proposal.status, PROPOSAL_STATUSES.APPROVED);
      assert.strictEqual(decision.proposal.approverId, 'usr_clinical_director');
      assert.strictEqual(decision.decisionHash.length, 64);
      assert.strictEqual(decision.executedResult.success, true);
    });

    test('should enforce separation of duties: requester cannot approve own proposal', () => {
      const proposal = createActionProposal(
        'mutate_or_block_release',
        'Self approval test',
        'Self rationale',
        {},
        {},
        {
          facilityId: testFacility,
          userId: 'usr_facility_admin',
          role: 'facility_admin'
        }
      );

      assert.throws(() => {
        decideActionProposal(
          proposal,
          'APPROVE',
          {
            facilityId: testFacility,
            userId: 'usr_facility_admin', // Same as requester!
            role: 'facility_admin'
          }
        );
      }, /Separation of Duties Violation/);
    });

    test('should reject decision if approver lacks ai:approve_action permission', () => {
      const proposal = createActionProposal(
        'mutate_or_block_release',
        'Role check test',
        'Rationale',
        {},
        {},
        {
          facilityId: testFacility,
          userId: 'usr_analyst_01',
          role: 'analyst'
        }
      );

      assert.throws(() => {
        decideActionProposal(
          proposal,
          'APPROVE',
          {
            facilityId: testFacility,
            userId: 'usr_surgeon_05',
            role: 'surgeon' // surgeon lacks ai:approve_action
          }
        );
      }, /lacks required permission "ai:approve_action"/);
    });

    test('should enforce tenancy isolation: approver cannot act across facilities', () => {
      const proposal = createActionProposal(
        'mutate_or_block_release',
        'Tenancy test',
        'Rationale',
        {},
        {},
        {
          facilityId: testFacility,
          userId: 'usr_analyst_01',
          role: 'analyst'
        }
      );

      assert.throws(() => {
        decideActionProposal(
          proposal,
          'APPROVE',
          {
            facilityId: '11111111-1111-1111-1111-111111111111', // Foreign facility!
            userId: 'usr_admin_foreign',
            role: 'facility_admin'
          }
        );
      }, /Tenancy Isolation Violation/);
    });
  });

  // 5. Cryptographic Provenance Hash Integrity
  describe('5. Cryptographic Provenance Hash Integrity', () => {
    test('should generate deterministic 64-character SHA-256 signatures for decisions', () => {
      const hash1 = generateDecisionProvenanceHash('prop-101', 'usr-dir', 'APPROVED', '2026-11-18T10:00:00Z');
      const hash2 = generateDecisionProvenanceHash('prop-101', 'usr-dir', 'APPROVED', '2026-11-18T10:00:00Z');
      const hash3 = generateDecisionProvenanceHash('prop-101', 'usr-dir', 'REJECTED', '2026-11-18T10:00:00Z');

      assert.strictEqual(hash1.length, 64);
      assert.strictEqual(hash1, hash2);
      assert.notStrictEqual(hash1, hash3);
    });

    test('should compute telemetry reflecting active boundaries and 100% dual-key compliance', () => {
      const tele = calculatePermissionsTelemetry(SEED_PROPOSED_ACTIONS);
      assert.strictEqual(tele.totalPermissionsDefined, 8);
      assert.strictEqual(tele.dualKeyEnforcementRatePct, 100.0);
      assert.ok(tele.pendingHitlApprovalsCount >= 1);
    });
  });

  // 6. PostgreSQL Migration 100 Schema Integrity
  describe('6. PostgreSQL Migration 100 Schema Integrity', () => {
    const upMigrationPath = path.join(ROOT_DIR, 'supabase', 'migrations', '100_ai_permissions_and_action_boundaries.sql');
    const downMigrationPath = path.join(ROOT_DIR, 'supabase', 'migrations', '100_ai_permissions_and_action_boundaries_down.sql');

    test('UP migration 100 should establish action boundaries, HITL queue, and audit ledger with RLS', () => {
      assert.ok(fs.existsSync(upMigrationPath), '100_ai_permissions_and_action_boundaries.sql must exist');
      const content = fs.readFileSync(upMigrationPath, 'utf8');
      assert.ok(content.includes('CREATE TABLE IF NOT EXISTS public.ai_action_boundaries'));
      assert.ok(content.includes('CREATE TABLE IF NOT EXISTS public.ai_proposed_actions'));
      assert.ok(content.includes('CREATE TABLE IF NOT EXISTS public.ai_permission_audit_logs'));
      assert.ok(content.includes('CREATE OR REPLACE VIEW public.vw_ai_pending_action_queue'));
      assert.ok(content.includes('ENABLE ROW LEVEL SECURITY'));
    });

    test('DOWN migration 100 should cleanly drop all objects with CASCADE', () => {
      assert.ok(fs.existsSync(downMigrationPath), '100_ai_permissions_and_action_boundaries_down.sql must exist');
      const content = fs.readFileSync(downMigrationPath, 'utf8');
      assert.ok(content.includes('DROP TABLE IF EXISTS public.ai_permission_audit_logs CASCADE'));
      assert.ok(content.includes('DROP TABLE IF EXISTS public.ai_proposed_actions CASCADE'));
      assert.ok(content.includes('DROP TABLE IF EXISTS public.ai_action_boundaries CASCADE'));
      assert.ok(content.includes('DROP VIEW IF EXISTS public.vw_ai_pending_action_queue CASCADE'));
    });
  });

  // 7. Maestro Clinical Zero-Purple Design Compliance
  describe('7. Maestro Clinical Zero-Purple Design Compliance', () => {
    const jsxPath = path.join(ROOT_DIR, 'src', 'components', 'AIPermissionsView.jsx');
    const cssPath = path.join(ROOT_DIR, 'src', 'components', 'AIPermissionsView.css');

    test('AIPermissionsView.jsx must strictly avoid prohibited purple tokens', () => {
      const content = fs.readFileSync(jsxPath, 'utf8');
      const prohibited = /\b(purple|violet|indigo|magenta|fuchsia)\b/i;
      assert.strictEqual(prohibited.test(content), false, 'AIPermissionsView.jsx contains forbidden purple token');
    });

    test('AIPermissionsView.css must strictly avoid prohibited purple tokens', () => {
      const content = fs.readFileSync(cssPath, 'utf8');
      const prohibited = /\b(purple|violet|indigo|magenta|fuchsia)\b/i;
      assert.strictEqual(prohibited.test(content), false, 'AIPermissionsView.css contains forbidden purple token');
    });
  });

  // 8. App Wiring & Lib Facade
  describe('8. App Wiring & Lib Facade', () => {
    const appPath = path.join(ROOT_DIR, 'src', 'App.jsx');

    test('src/lib/aiPermissionsService.js re-exports all constants and functions', () => {
      assert.ok(typeof libExport.hasAiPermission === 'function');
      assert.ok(typeof libExport.evaluateActionBoundary === 'function');
      assert.ok(typeof libExport.createActionProposal === 'function');
      assert.ok(typeof libExport.decideActionProposal === 'function');
      assert.ok(Object.keys(libExport.AI_PERMISSIONS).length >= 8);
    });

    test('App.jsx registers AIPermissionsView with sidebar navigation and tab route', () => {
      const content = fs.readFileSync(appPath, 'utf8');
      assert.ok(content.includes('AIPermissionsView'));
      assert.ok(content.includes("activeTab === 'ai_permissions'"));
      assert.ok(content.includes('AI Permissions'));
    });
  });

});
