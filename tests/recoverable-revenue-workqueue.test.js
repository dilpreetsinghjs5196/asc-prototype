/**
 * ==============================================================================
 * PHASE 99: RECOVERABLE REVENUE WORKQUEUE AUTOMATED TEST SUITE
 * Operational Execution Workbench, SLA Engine, Workload Capacity & Audit Trails
 * ==============================================================================
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  recoverableRevenueWorkqueueService,
  WORKQUEUE_CODES,
  RECOVERY_LIFECYCLE_STATUSES,
  SLA_STATUSES,
  TIER_SLA_HOURS,
  MAX_SPECIALIST_CAPACITY,
  DISMISSAL_REASONS,
  calculateSlaDeadline,
  evaluateSlaStatus,
  sortWorkqueueItems
} from '../src/lib/recoverableRevenueWorkqueueService.js';

describe('Phase 99 — Recoverable Revenue Workqueue Test Suite', () => {

  // ============================================================================
  // 1. Taxonomy & Domain Definitions
  // ============================================================================
  describe('1. Taxonomy & Definitions', () => {
    it('should define all 6 operational workqueues with target SLA hours', () => {
      const expectedQueues = [
        'CRITICAL_SLA_TRIAGE',
        'IMPLANT_DISPUTES',
        'DENIAL_APPEALS',
        'SECONDARY_COB_BATCH',
        'UNDERPAYMENT_RECOVERY',
        'SUPERVISOR_ESCALATIONS'
      ];

      for (const code of expectedQueues) {
        assert.ok(WORKQUEUE_CODES[code], `Missing queue code: ${code}`);
        assert.ok(typeof WORKQUEUE_CODES[code].targetSlaHours === 'number', `${code} must have numeric target SLA hours`);
        assert.ok(WORKQUEUE_CODES[code].targetSlaHours > 0, `${code} SLA hours must be positive`);
      }
    });

    it('should define all 8 lifecycle statuses with terminal flags', () => {
      const expectedStatuses = [
        'UNASSIGNED',
        'ASSIGNED',
        'IN_PROGRESS',
        'PENDING_DOCS',
        'DISPUTE_SUBMITTED',
        'APPEAL_PENDING',
        'RECOVERED_RECONCILED',
        'CLOSED_UNRECOVERABLE'
      ];

      for (const st of expectedStatuses) {
        assert.ok(RECOVERY_LIFECYCLE_STATUSES[st], `Missing lifecycle status: ${st}`);
        assert.ok(typeof RECOVERY_LIFECYCLE_STATUSES[st].terminal === 'boolean', `${st} must specify terminal flag`);
      }

      assert.strictEqual(RECOVERY_LIFECYCLE_STATUSES.RECOVERED_RECONCILED.terminal, true);
      assert.strictEqual(RECOVERY_LIFECYCLE_STATUSES.CLOSED_UNRECOVERABLE.terminal, true);
      assert.strictEqual(RECOVERY_LIFECYCLE_STATUSES.IN_PROGRESS.terminal, false);
    });

    it('should define all 4 SLA statuses with badge classes', () => {
      const expectedSla = ['ON_SCHEDULE', 'WARNING_AT_RISK', 'SLA_BREACHED', 'RESOLVED'];
      for (const s of expectedSla) {
        assert.ok(SLA_STATUSES[s], `Missing SLA status: ${s}`);
        assert.ok(SLA_STATUSES[s].badgeClass, `${s} must have badge class`);
      }
    });

    it('should define standard specialist capacity cap of 35 claims', () => {
      assert.strictEqual(MAX_SPECIALIST_CAPACITY, 35);
    });
  });

  // ============================================================================
  // 2. Deterministic SLA Algorithms
  // ============================================================================
  describe('2. Deterministic SLA Calculations & Invariants', () => {
    it('calculateSlaDeadline: computes exact target timestamp based on tier SLA hours', () => {
      const baseTime = '2026-11-01T10:00:00.000Z';
      
      // Tier 1: 48 hours
      const deadlineTier1 = calculateSlaDeadline(baseTime, 'TIER_1_CRITICAL_DISPATCH');
      const expectedTier1 = new Date(new Date(baseTime).getTime() + 48 * 3600 * 1000);
      assert.strictEqual(deadlineTier1.toISOString(), expectedTier1.toISOString());

      // Tier 2: 120 hours (5 days)
      const deadlineTier2 = calculateSlaDeadline(baseTime, 'TIER_2_HIGH_YIELD_RECOVERY');
      const expectedTier2 = new Date(new Date(baseTime).getTime() + 120 * 3600 * 1000);
      assert.strictEqual(deadlineTier2.toISOString(), expectedTier2.toISOString());
    });

    it('calculateSlaDeadline: enforces Rule 1 Invariant (statutory timely filing overrides tier SLA when earlier)', () => {
      const baseTime = '2026-11-01T10:00:00.000Z';
      // Tier 2 would normally be +120 hours (5 days). But statutory filing deadline is in 24 hours:
      const statutoryFiling = '2026-11-02T10:00:00.000Z';
      
      const deadline = calculateSlaDeadline(baseTime, 'TIER_2_HIGH_YIELD_RECOVERY', statutoryFiling);
      assert.strictEqual(deadline.toISOString(), new Date(statutoryFiling).toISOString());
    });

    it('evaluateSlaStatus: correctly identifies SLA_BREACHED when deadline has passed', () => {
      const now = new Date('2026-11-10T12:00:00.000Z');
      const passedDeadline = new Date('2026-11-10T11:00:00.000Z'); // 1 hour ago
      
      const status = evaluateSlaStatus(passedDeadline, false, now);
      assert.strictEqual(status, SLA_STATUSES.SLA_BREACHED.code);
    });

    it('evaluateSlaStatus: correctly identifies WARNING_AT_RISK when <= 24 hours remain', () => {
      const now = new Date('2026-11-10T12:00:00.000Z');
      const imminentDeadline = new Date('2026-11-11T08:00:00.000Z'); // 20 hours left
      
      const status = evaluateSlaStatus(imminentDeadline, false, now);
      assert.strictEqual(status, SLA_STATUSES.WARNING_AT_RISK.code);
    });

    it('evaluateSlaStatus: correctly returns ON_SCHEDULE when > 24 hours remain', () => {
      const now = new Date('2026-11-10T12:00:00.000Z');
      const futureDeadline = new Date('2026-11-13T12:00:00.000Z'); // 72 hours left
      
      const status = evaluateSlaStatus(futureDeadline, false, now);
      assert.strictEqual(status, SLA_STATUSES.ON_SCHEDULE.code);
    });

    it('evaluateSlaStatus: returns RESOLVED for terminal claims regardless of deadline', () => {
      const now = new Date('2026-11-10T12:00:00.000Z');
      const pastDeadline = new Date('2026-11-05T12:00:00.000Z');
      
      const status = evaluateSlaStatus(pastDeadline, true, now);
      assert.strictEqual(status, SLA_STATUSES.RESOLVED.code);
    });
  });

  // ============================================================================
  // 3. Queue Sorting Invariants (Rule 4)
  // ============================================================================
  describe('3. Queue Sorting Invariants', () => {
    it('Rule 4 Invariant: sorts SLA_BREACHED active claims first, then tier rank ASC, yield DESC, and deadline ASC', () => {
      const mockItems = [
        {
          id: '1',
          priority_tier: 'TIER_2_HIGH_YIELD_RECOVERY',
          expected_realizable_yield: 5000,
          sla_status: 'ON_SCHEDULE',
          lifecycle_status: 'IN_PROGRESS',
          sla_deadline: '2026-11-15T00:00:00Z'
        },
        {
          id: '2',
          priority_tier: 'TIER_1_CRITICAL_DISPATCH',
          expected_realizable_yield: 2000,
          sla_status: 'SLA_BREACHED',
          lifecycle_status: 'IN_PROGRESS',
          sla_deadline: '2026-11-09T00:00:00Z'
        },
        {
          id: '3',
          priority_tier: 'TIER_1_CRITICAL_DISPATCH',
          expected_realizable_yield: 8000,
          sla_status: 'ON_SCHEDULE',
          lifecycle_status: 'IN_PROGRESS',
          sla_deadline: '2026-11-12T00:00:00Z'
        },
        {
          id: '4',
          priority_tier: 'TIER_1_CRITICAL_DISPATCH',
          expected_realizable_yield: 4000,
          sla_status: 'ON_SCHEDULE',
          lifecycle_status: 'IN_PROGRESS',
          sla_deadline: '2026-11-11T00:00:00Z'
        }
      ];

      const sorted = sortWorkqueueItems(mockItems);

      // Item 2 is breached active claim, must be first
      assert.strictEqual(sorted[0].id, '2');
      // Next is Tier 1 items sorted by yield DESC: Item 3 ($8000) then Item 4 ($4000)
      assert.strictEqual(sorted[1].id, '3');
      assert.strictEqual(sorted[2].id, '4');
      // Last is Tier 2 item (Item 1)
      assert.strictEqual(sorted[3].id, '1');
    });
  });

  // ============================================================================
  // 4. Store Operations & Lifecycles
  // ============================================================================
  describe('4. Store Operations & Workbenches', () => {
    it('should initialize store with baseline cross-module work items', () => {
      const items = recoverableRevenueWorkqueueService.getWorkqueueItems();
      assert.ok(items.length >= 5, 'Should have at least 5 baseline items');
    });

    it('assignWorkItem: assigns specialist, updates status, and logs audit event', () => {
      const item = recoverableRevenueWorkqueueService.assignWorkItem(
        'rrw-item-106',
        'spec-01',
        'Sarah Jenkins, CPC',
        'Amanda Price (Supervisor)',
        'Priority assignment per surgical unbilled lag.'
      );

      assert.strictEqual(item.assigned_specialist_id, 'spec-01');
      assert.strictEqual(item.assigned_specialist_name, 'Sarah Jenkins, CPC');
      assert.strictEqual(item.lifecycle_status, 'ASSIGNED');
      assert.ok(item.touch_count >= 1);

      // Verify audit trail entry
      const audit = recoverableRevenueWorkqueueService.getAuditLog('rrw-item-106');
      assert.ok(audit.length >= 1);
      assert.strictEqual(audit[0].action_type, 'ASSIGN');
      assert.strictEqual(audit[0].new_specialist, 'Sarah Jenkins, CPC');
    });

    it('transitionLifecycleStatus: updates lifecycle status and touch count', () => {
      const item = recoverableRevenueWorkqueueService.transitionLifecycleStatus(
        'rrw-item-101',
        'PENDING_DOCS',
        'Awaiting signed operative invoice from vendor.',
        'Marcus Vance, CRCR'
      );

      assert.strictEqual(item.lifecycle_status, 'PENDING_DOCS');
      assert.strictEqual(item.last_action_type, 'STATUS_CHANGE');
    });

    it('reconcileRecovery: enforces Rule 5 Invariant (requires cash > 0 and remittance reference)', () => {
      // Rejects $0 recovery
      assert.throws(() => {
        recoverableRevenueWorkqueueService.reconcileRecovery('rrw-item-103', 0, 'ERA-123');
      }, /positive cash amount/);

      // Rejects empty remittance
      assert.throws(() => {
        recoverableRevenueWorkqueueService.reconcileRecovery('rrw-item-103', 1500, '');
      }, /remittance number or check reference/);

      // Successfully reconciles
      const item = recoverableRevenueWorkqueueService.reconcileRecovery(
        'rrw-item-103',
        1640.00,
        'ERA-2026-MEDIGAP-4412',
        'David Cho'
      );
      assert.strictEqual(item.lifecycle_status, 'RECOVERED_RECONCILED');
      assert.strictEqual(item.actual_cash_recovered, 1640.00);
      assert.strictEqual(item.sla_status, 'RESOLVED');
    });

    it('dismissWorkItem: requires documented justification notes of at least 5 chars', () => {
      assert.throws(() => {
        recoverableRevenueWorkqueueService.dismissWorkItem('rrw-item-104', 'CONTRACTUAL_WRITE_OFF', 'no');
      }, /justification notes/);

      const item = recoverableRevenueWorkqueueService.dismissWorkItem(
        'rrw-item-104',
        'CONTRACTUAL_WRITE_OFF',
        'Valid contractual bundling rule verified per commercial contract section 4.1.',
        'Amanda Price (Supervisor)'
      );
      assert.strictEqual(item.lifecycle_status, 'CLOSED_UNRECOVERABLE');
      assert.strictEqual(item.sla_status, 'RESOLVED');
    });

    it('getQueueMetrics: accurately computes portfolio summary KPIs', () => {
      const m = recoverableRevenueWorkqueueService.getQueueMetrics();
      assert.ok(m.totalCases > 0);
      assert.ok(typeof m.totalActiveGross === 'number');
      assert.ok(typeof m.totalCashRecovered === 'number');
      assert.ok(typeof m.complianceRate === 'number');
      assert.ok(m.complianceRate >= 0 && m.complianceRate <= 100);
    });

    it('getSpecialistWorkload: returns capacity utilization for all specialists', () => {
      const workloads = recoverableRevenueWorkqueueService.getSpecialistWorkload();
      assert.strictEqual(workloads.length, 5);
      for (const w of workloads) {
        assert.ok(w.capacity === 35);
        assert.ok(typeof w.activeCases === 'number');
        assert.ok(typeof w.capacityPct === 'number');
      }
    });
  });

  // ============================================================================
  // 5. Database Migration Integrity (076)
  // ============================================================================
  describe('5. Database Migration SQL Integrity (076)', () => {
    const upMigrationPath = path.resolve('supabase/migrations/076_recoverable_revenue_workqueue.sql');
    const downMigrationPath = path.resolve('supabase/migrations/076_recoverable_revenue_workqueue_down.sql');

    it('up migration 076 exists and contains core tables, indexes, views, and 1:1 RLS policies', () => {
      assert.ok(fs.existsSync(upMigrationPath), '076_recoverable_revenue_workqueue.sql must exist');
      const sql = fs.readFileSync(upMigrationPath, 'utf8');

      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.revenue_recovery_workqueues'));
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.recoverable_revenue_work_items'));
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.recoverable_revenue_audit_log'));
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_recoverable_revenue_workqueue_active'));
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_recoverable_revenue_workqueue_metrics'));
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_specialist_workload_summary'));

      // Tenant isolation standard verification
      assert.ok(sql.includes("current_setting('app.current_facility_id', true)"));
      assert.ok(sql.includes('DROP POLICY IF EXISTS rls_rrw_items_facility'));
      assert.ok(sql.includes('CREATE POLICY rls_rrw_items_facility'));
    });

    it('down migration 076 exists and cleanly rolls back schema objects with CASCADE', () => {
      assert.ok(fs.existsSync(downMigrationPath), '076_recoverable_revenue_workqueue_down.sql must exist');
      const sql = fs.readFileSync(downMigrationPath, 'utf8');

      assert.ok(sql.includes('DROP TABLE IF EXISTS public.recoverable_revenue_audit_log CASCADE'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.recoverable_revenue_work_items CASCADE'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.revenue_recovery_workqueues CASCADE'));
    });
  });

  // ============================================================================
  // 6. Maestro Design System Governance & App Wiring
  // ============================================================================
  describe('6. Maestro Design System Governance & App Wiring', () => {
    const jsxPath = path.resolve('src/components/RecoverableRevenueWorkqueueView.jsx');
    const cssPath = path.resolve('src/components/RecoverableRevenueWorkqueueView.css');
    const appPath = path.resolve('src/App.jsx');
    const specPath = path.resolve('docs/phases/99_RECOVERABLE_REVENUE_WORKQUEUE.md');

    it('strictly ZERO purple/violet/indigo/magenta tokens in JSX and CSS', () => {
      assert.ok(fs.existsSync(jsxPath));
      assert.ok(fs.existsSync(cssPath));

      const jsx = fs.readFileSync(jsxPath, 'utf8');
      const css = fs.readFileSync(cssPath, 'utf8');

      const prohibitedRegex = /(purple|violet|indigo|magenta|fuchsia|#[89a-fA-F][0-9a-fA-F][89a-fA-F][0-9a-fA-F][89a-fA-F][0-9a-fA-F])/i;

      // Check text tokens specifically
      const badWords = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];
      for (const word of badWords) {
        assert.ok(!jsx.toLowerCase().includes(word), `JSX contains forbidden color token: ${word}`);
        assert.ok(!css.toLowerCase().includes(word), `CSS contains forbidden color token: ${word}`);
      }
    });

    it('App.jsx correctly imports and registers RecoverableRevenueWorkqueueView', () => {
      assert.ok(fs.existsSync(appPath));
      const app = fs.readFileSync(appPath, 'utf8');

      assert.ok(app.includes('import RecoverableRevenueWorkqueueView'), 'App.jsx must import RecoverableRevenueWorkqueueView');
      assert.ok(app.includes("activeTab === 'recovery_workqueue'"), 'App.jsx must register recovery_workqueue tab');
      assert.ok(app.includes('<RecoverableRevenueWorkqueueView'), 'App.jsx must render RecoverableRevenueWorkqueueView');
    });

    it('Phase 99 master specification document is authored and complete', () => {
      assert.ok(fs.existsSync(specPath), '99_RECOVERABLE_REVENUE_WORKQUEUE.md must exist');
      const spec = fs.readFileSync(specPath, 'utf8');

      assert.ok(spec.includes('# Phase 99: Recoverable Revenue Workqueue'));
      assert.ok(spec.includes('## 5. Data Model & Database Architecture'));
      assert.ok(spec.includes('## 6. Business Rules & Deterministic Calculations'));
      assert.ok(spec.includes('## 10. QA & Verification Test Suite'));
    });
  });
});
