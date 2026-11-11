import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SOURCE_MODULES,
  PRIORITY_ACTION_TIERS,
  DEFAULT_ROPS_WEIGHTS,
  DEFAULT_FACILITY_BENCHMARK,
  ITEM_STATUSES,
  calculateValueSubscore,
  calculateUrgencySubscore,
  calculateExpectedYield,
  calculateYieldPerHour,
  calculateRopsPriorityScore,
  classifyPriorityActionTier,
  scoreOpportunityRecord,
  OpportunityPriorityStore
} from '../src/lib/opportunityPriorityScoreService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

describe('Phase 98 — Revenue Opportunity Priority Score (ROPS) Test Suite', () => {

  // ============================================================================
  // 1. TAXONOMY & DEFINITIONS
  // ============================================================================
  describe('1. Taxonomy & Definitions', () => {
    test('should define all 7 cross-module source origins', () => {
      const sources = Object.keys(SOURCE_MODULES);
      assert.equal(sources.length, 7);
      assert.ok(SOURCE_MODULES.IMPLANT_CARVEOUT);
      assert.ok(SOURCE_MODULES.DENIAL_APPEAL);
      assert.ok(SOURCE_MODULES.SECONDARY_COB);
      assert.ok(SOURCE_MODULES.PAYER_UNDERPAYMENT);
      assert.ok(SOURCE_MODULES.RECURRING_PATTERN);
      assert.ok(SOURCE_MODULES.UNBILLED_CASE);
      assert.ok(SOURCE_MODULES.MISSING_CHARGE);
    });

    test('should define all 5 priority action tiers with strict ranks and minScores', () => {
      const tiers = Object.values(PRIORITY_ACTION_TIERS);
      assert.equal(tiers.length, 5);
      tiers.forEach(t => {
        assert.ok(t.code);
        assert.ok(t.label);
        assert.ok(typeof t.rank === 'number');
        assert.ok(typeof t.minScore === 'number');
        assert.ok(t.badgeColor);
      });
      assert.equal(PRIORITY_ACTION_TIERS.TIER_1_CRITICAL_DISPATCH.rank, 1);
      assert.equal(PRIORITY_ACTION_TIERS.TIER_5_EXPIRED_OR_SUPPRESSED.rank, 5);
    });

    test('should verify default ROPS weights sum to exactly 1.00 (100%)', () => {
      const sum = DEFAULT_ROPS_WEIGHTS.VALUE +
                  DEFAULT_ROPS_WEIGHTS.CONFIDENCE +
                  DEFAULT_ROPS_WEIGHTS.RECOVERABILITY +
                  DEFAULT_ROPS_WEIGHTS.URGENCY;
      assert.ok(Math.abs(sum - 1.00) < 0.0001, 'ROPS weights must sum to 1.00');
    });
  });

  // ============================================================================
  // 2. DETERMINISTIC FINANCIAL MATH & SUBSCORE ALGORITHMS
  // ============================================================================
  describe('2. Deterministic Financial Math & Subscore Algorithms', () => {
    test('calculateValueSubscore: normalizes against benchmark and caps at 100.00', () => {
      assert.equal(calculateValueSubscore(0, 5000), 0.00);
      assert.equal(calculateValueSubscore(2500, 5000), 50.00);
      assert.equal(calculateValueSubscore(5000, 5000), 100.00);
      assert.equal(calculateValueSubscore(12000, 5000), 100.00);
    });

    test('calculateUrgencySubscore: strictly adheres to timeline tiers and 0.00 for expired', () => {
      assert.equal(calculateUrgencySubscore(10), 100.00); // 1-15 days
      assert.equal(calculateUrgencySubscore(25), 85.00);  // 16-30 days
      assert.equal(calculateUrgencySubscore(45), 65.00);  // 31-60 days
      assert.equal(calculateUrgencySubscore(75), 40.00);  // 61-90 days
      assert.equal(calculateUrgencySubscore(120), 20.00); // > 90 days
      assert.equal(calculateUrgencySubscore(-10), 0.00);  // expired
    });

    test('calculateExpectedYield: computes probability-adjusted return', () => {
      // $10,000 with 90% confidence and 80% recoverability = $10,000 * 0.90 * 0.80 = $7,200.00
      const res = calculateExpectedYield(10000, 90, 80);
      assert.equal(res, 7200.00);

      // $5,000 with 100% confidence and 95% recoverability = $4,750.00
      assert.equal(calculateExpectedYield(5000, 100, 95), 4750.00);

      // Invariant: Yield can never exceed raw recoverable amount
      const highRes = calculateExpectedYield(5000, 100, 100);
      assert.equal(highRes, 5000.00);
    });

    test('calculateYieldPerHour: calculates recovery velocity with effort floor', () => {
      // $3,600 expected yield over 1.5 hours = $2,400.00/hr
      assert.equal(calculateYieldPerHour(3600, 1.5), 2400.00);

      // $500 expected yield over 0.1 hours (enforces 0.25h floor) = $500 / 0.25 = $2,000.00/hr
      assert.equal(calculateYieldPerHour(500, 0.1), 2000.00);
    });

    test('calculateRopsPriorityScore: computes weighted sum accurately', () => {
      // 100 on all 4 dimensions => 100.00
      assert.equal(calculateRopsPriorityScore(100, 100, 100, 100), 100.00);

      // (80 * 0.35) + (90 * 0.25) + (85 * 0.25) + (100 * 0.15)
      // = 28.0 + 22.5 + 21.25 + 15.0 = 86.75
      assert.equal(calculateRopsPriorityScore(80, 90, 85, 100), 86.75);
    });
  });

  // ============================================================================
  // 3. ACTION TIER CLASSIFICATION & INVARIANTS
  // ============================================================================
  describe('3. Action Tier Classification & Invariants', () => {
    test('classifyPriorityActionTier: maps scores to action tiers', () => {
      assert.equal(classifyPriorityActionTier(85.00, 20), 'TIER_1_CRITICAL_DISPATCH');
      assert.equal(classifyPriorityActionTier(72.00, 45), 'TIER_2_HIGH_YIELD_RECOVERY');
      assert.equal(classifyPriorityActionTier(55.00, 45), 'TIER_3_STANDARD_WORKBENCH');
      assert.equal(classifyPriorityActionTier(35.00, 60), 'TIER_4_LOW_YIELD_BATCH');
      assert.equal(classifyPriorityActionTier(15.00, 90), 'TIER_5_EXPIRED_OR_SUPPRESSED');
    });

    test('Rule 3 Invariant: Expired deadline (< 0 days) forces TIER_5 and EXPIRED_UNCOLLECTIBLE', () => {
      assert.equal(classifyPriorityActionTier(95.00, -5), 'TIER_5_EXPIRED_OR_SUPPRESSED');

      const record = {
        recoverable_amount: 5000,
        confidence_score: 95,
        recoverability_score: 90,
        days_until_deadline: -12,
        estimated_effort_hours: 1.0
      };
      const scored = scoreOpportunityRecord(record);
      assert.equal(scored.urgency_score, 0.00);
      assert.equal(scored.priority_action_tier, 'TIER_5_EXPIRED_OR_SUPPRESSED');
      assert.equal(scored.item_status, 'EXPIRED_UNCOLLECTIBLE');
    });
  });

  // ============================================================================
  // 4. STORE OPERATIONS & WORKBENCHES
  // ============================================================================
  describe('4. Store Operations & Workbenches', () => {
    let store;

    test('should initialize store with baseline cross-module records', () => {
      store = new OpportunityPriorityStore();
      const all = store.getAllOpportunities();
      assert.ok(all.length >= 8, 'Must load at least 8 cross-module opportunities');
    });

    test('Rule 4 Invariant: Queue sorts by Tier Rank ASC (Tier 1 first), ROPS DESC, Yield/hr DESC, Days Left ASC', () => {
      const queue = store.getAllOpportunities();
      const rankMap = {
        TIER_1_CRITICAL_DISPATCH: 1,
        TIER_2_HIGH_YIELD_RECOVERY: 2,
        TIER_3_STANDARD_WORKBENCH: 3,
        TIER_4_LOW_YIELD_BATCH: 4,
        TIER_5_EXPIRED_OR_SUPPRESSED: 5
      };

      for (let i = 0; i < queue.length - 1; i++) {
        const curr = queue[i];
        const next = queue[i + 1];
        const rankCurr = rankMap[curr.priority_action_tier] || 99;
        const rankNext = rankMap[next.priority_action_tier] || 99;

        if (rankCurr === rankNext) {
          if (curr.rops_priority_score === next.rops_priority_score) {
            if (curr.yield_per_hour === next.yield_per_hour) {
              assert.ok(curr.days_until_deadline <= next.days_until_deadline, 'Days until deadline must be ASC');
            } else {
              assert.ok(curr.yield_per_hour >= next.yield_per_hour, 'Yield per hour must be DESC');
            }
          } else {
            assert.ok(curr.rops_priority_score >= next.rops_priority_score, 'ROPS score must be DESC');
          }
        } else {
          assert.ok(rankCurr <= rankNext, 'Lower action tier rank (Tier 1 < Tier 2) must come first');
        }
      }
    });

    test('Rule 2 Invariant: Expected Realizable Yield never exceeds raw recoverable amount', () => {
      const all = store.getAllOpportunities();
      all.forEach(item => {
        assert.ok(item.expected_realizable_yield <= item.recoverable_amount,
          `Expected yield $${item.expected_realizable_yield} exceeds gross $${item.recoverable_amount}`);
      });
    });

    test('dispatchToQueue: assigns specialist and updates status to DISPATCHED_TO_QUEUE', () => {
      const updated = store.dispatchToQueue('rops-001', 'Dr. Senior Billing Specialist', 'Expedited review');
      assert.equal(updated.item_status, 'DISPATCHED_TO_QUEUE');
      assert.equal(updated.assigned_analyst_name, 'Dr. Senior Billing Specialist');
      assert.ok(updated.notes.includes('Expedited review'));
    });

    test('dispatchToQueue: rejects dispatch on expired opportunity', () => {
      assert.throws(() => {
        store.dispatchToQueue('rops-008', 'Staff Specialist');
      }, /Cannot dispatch an expired opportunity/);
    });

    test('recordRecovery: reconciles collected cash and sets status to RECOVERED', () => {
      const updated = store.recordRecovery('rops-003', 1420.00, 'Medigap check received');
      assert.equal(updated.item_status, 'RECOVERED');
      assert.equal(updated.recoverable_amount, 0.00);
      assert.equal(updated.priority_action_tier, 'TIER_5_EXPIRED_OR_SUPPRESSED');
    });

    test('dismissOpportunity: requires formal notes and sets status to DISMISSED_NOT_RECOVERABLE', () => {
      assert.throws(() => {
        store.dismissOpportunity('rops-005', 'short');
      }, /Mandatory formal dismissal notes required/);

      const updated = store.dismissOpportunity('rops-005', 'Verified plan exclusion per payer medical policy addendum.');
      assert.equal(updated.item_status, 'DISMISSED_NOT_RECOVERABLE');
    });

    test('updateConfig: updates benchmark and custom weights, re-scoring all opportunities', () => {
      const newWeights = { VALUE: 0.40, CONFIDENCE: 0.20, RECOVERABILITY: 0.20, URGENCY: 0.20 };
      const config = store.updateConfig(7500, newWeights);
      assert.equal(config.benchmark, 7500);
      assert.equal(config.weights.VALUE, 0.40);
    });

    test('getMetrics: calculates summary KPIs across all 7 source modules', () => {
      const metrics = store.getMetrics('fac-surgical-01');
      assert.ok(metrics.totalOpportunitiesCount > 0);
      assert.ok(metrics.totalPipelineAmount > 0);
      assert.ok(metrics.totalExpectedYield > 0);
      assert.ok(metrics.avgRopsScore > 0);
      assert.ok(typeof metrics.urgentDeadlinesCount === 'number');
      assert.ok(metrics.recoveredCashMtd >= 0);
      assert.ok(metrics.moduleDistribution.IMPLANT_CARVEOUT >= 0);
      assert.ok(metrics.moduleDistribution.DENIAL_APPEAL >= 0);
      assert.ok(metrics.moduleDistribution.SECONDARY_COB >= 0);
    });
  });

  // ============================================================================
  // 5. DATABASE MIGRATION SQL INTEGRITY (075)
  // ============================================================================
  describe('5. Database Migration SQL Integrity (075)', () => {
    const upMigrationPath = path.join(ROOT_DIR, 'supabase', 'migrations', '075_revenue_opportunity_priority_score.sql');
    const downMigrationPath = path.join(ROOT_DIR, 'supabase', 'migrations', '075_revenue_opportunity_priority_score_down.sql');

    test('up migration 075 exists and contains core tables, constraints, views, and 1:1 RLS policies', () => {
      assert.ok(fs.existsSync(upMigrationPath), '075 migration file must exist');
      const sql = fs.readFileSync(upMigrationPath, 'utf8');

      // Tables
      assert.ok(sql.includes('public.revenue_opportunity_score_rules'), 'Must create revenue_opportunity_score_rules');
      assert.ok(sql.includes('public.revenue_opportunity_priority_items'), 'Must create revenue_opportunity_priority_items');

      // Core Columns
      assert.ok(sql.includes('rops_priority_score'), 'Must have rops_priority_score');
      assert.ok(sql.includes('expected_realizable_yield'), 'Must have expected_realizable_yield');
      assert.ok(sql.includes('yield_per_hour'), 'Must have yield_per_hour');
      assert.ok(sql.includes('source_module'), 'Must have source_module');

      // Views
      assert.ok(sql.includes('vw_revenue_opportunities_active'), 'Must create active workbench view');
      assert.ok(sql.includes('vw_revenue_opportunities_summary'), 'Must create summary analytics view');

      // RLS 1:1 Policies
      assert.ok(sql.includes('DROP POLICY IF EXISTS rops_rules_isolation'), 'Must drop select policy if exists');
      assert.ok(sql.includes('CREATE POLICY rops_rules_isolation'), 'Must create rules policy');
      assert.ok(sql.includes('DROP POLICY IF EXISTS rops_items_isolation'), 'Must drop items policy if exists');
      assert.ok(sql.includes('CREATE POLICY rops_items_isolation'), 'Must create items policy');
      assert.ok(sql.includes("current_setting('app.current_facility_id', true)"), 'Must use current_setting for tenant isolation');
    });

    test('down migration 075 exists and cleanly rolls back schema objects with CASCADE', () => {
      assert.ok(fs.existsSync(downMigrationPath), '075 down migration file must exist');
      const sql = fs.readFileSync(downMigrationPath, 'utf8');
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.revenue_opportunity_priority_items CASCADE;'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.revenue_opportunity_score_rules CASCADE;'));
      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_revenue_opportunities_summary CASCADE;'));
      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_revenue_opportunities_active CASCADE;'));
    });
  });

  // ============================================================================
  // 6. MAESTRO DESIGN SYSTEM GOVERNANCE & APP WIRING
  // ============================================================================
  describe('6. Maestro Design System Governance & App Wiring', () => {
    test('strictly ZERO purple/violet/indigo/magenta tokens in JSX and CSS', () => {
      const jsxPath = path.join(ROOT_DIR, 'src', 'components', 'RevenueOpportunityPriorityView.jsx');
      const cssPath = path.join(ROOT_DIR, 'src', 'components', 'RevenueOpportunityPriorityView.css');

      const jsx = fs.readFileSync(jsxPath, 'utf8');
      const css = fs.readFileSync(cssPath, 'utf8');

      const forbiddenRegex = /purple|violet|indigo|magenta|fuchsia|#8b5cf6|#6366f1|#7c3aed|#a855f7|#d946ef/i;

      assert.ok(!forbiddenRegex.test(jsx), 'RevenueOpportunityPriorityView.jsx contains forbidden color tokens');
      assert.ok(!forbiddenRegex.test(css), 'RevenueOpportunityPriorityView.css contains forbidden color tokens');
    });

    test('App.jsx correctly imports and registers RevenueOpportunityPriorityView', () => {
      const appPath = path.join(ROOT_DIR, 'src', 'App.jsx');
      const appCode = fs.readFileSync(appPath, 'utf8');

      assert.ok(appCode.includes("import RevenueOpportunityPriorityView from './components/RevenueOpportunityPriorityView';"));
      assert.ok(appCode.includes("activeTab === 'opportunity_priority'"));
      assert.ok(appCode.includes("<RevenueOpportunityPriorityView />"));
      assert.ok(appCode.includes("Opportunity Priority (ROPS)"));
    });

    test('Phase 98 master specification document is authored and complete', () => {
      const specPath = path.join(ROOT_DIR, 'docs', 'phases', '98_REVENUE_OPPORTUNITY_PRIORITY_SCORE.md');
      assert.ok(fs.existsSync(specPath), 'Spec file must exist');

      const spec = fs.readFileSync(specPath, 'utf8');
      assert.ok(spec.includes('# 98 REVENUE OPPORTUNITY PRIORITY SCORE'));
      assert.ok(spec.includes('## Purpose'));
      assert.ok(spec.includes('## Scope'));
      assert.ok(spec.includes('## Target State'));
      assert.ok(spec.includes('## Business Rules & Invariants'));
      assert.ok(spec.includes('## Data Model / Schema'));
    });
  });
});

