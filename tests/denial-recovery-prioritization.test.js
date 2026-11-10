/**
 * DENIAL RECOVERY PRIORITIZATION AUTOMATED TEST SUITE
 * Phase 94 — Revenue Cycle Management
 * 
 * Comprehensive test coverage for multi-factor denial ranking by value,
 * overturn probability, deadline urgency, effort score, and effort-to-yield ratio.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  denialPrioritizationService,
  DenialPrioritizationStore,
  PRIORITY_TIERS,
  EFFORT_LEVELS,
  QUEUE_STATUSES,
  DENIAL_CATEGORIES,
  SCORING_WEIGHTS,
  calculateValueScore,
  calculateUrgencyScore,
  calculateEffortScore,
  calculateEffortHours,
  calculatePriorityScore,
  classifyPriorityTier,
  calculateYieldPerHour,
  scoreDenial
} from '../src/lib/denialPrioritizationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

describe('Phase 94 — Denial Recovery Prioritization Test Suite', () => {

  // ============================================================================
  // 1. TAXONOMY & ENUM DEFINITIONS
  // ============================================================================
  describe('1. Priority Tiers & Taxonomy Definitions', () => {
    test('should define all 5 core priority tiers with valid score thresholds', () => {
      const expectedTiers = [
        'CRITICAL_URGENT',
        'HIGH_PRIORITY',
        'MEDIUM_PRIORITY',
        'LOW_PRIORITY',
        'UNRECOVERABLE_HOLD'
      ];

      assert.equal(Object.keys(PRIORITY_TIERS).length, 5);
      expectedTiers.forEach(tier => {
        assert.ok(PRIORITY_TIERS[tier], `Priority tier ${tier} must exist`);
        assert.ok(typeof PRIORITY_TIERS[tier].minScore === 'number');
        assert.ok(typeof PRIORITY_TIERS[tier].rank === 'number');
      });

      assert.equal(PRIORITY_TIERS.CRITICAL_URGENT.minScore, 80.00);
      assert.equal(PRIORITY_TIERS.HIGH_PRIORITY.minScore, 65.00);
      assert.equal(PRIORITY_TIERS.MEDIUM_PRIORITY.minScore, 45.00);
      assert.equal(PRIORITY_TIERS.LOW_PRIORITY.minScore, 25.00);
      assert.equal(PRIORITY_TIERS.UNRECOVERABLE_HOLD.minScore, 0.00);
    });

    test('should define 4 administrative effort tiers with inverse friction scores', () => {
      assert.equal(Object.keys(EFFORT_LEVELS).length, 4);

      assert.equal(EFFORT_LEVELS.MINIMAL_EFFORT.score, 100.00);
      assert.equal(EFFORT_LEVELS.MINIMAL_EFFORT.hours, 0.25);

      assert.equal(EFFORT_LEVELS.MODERATE_EFFORT.score, 75.00);
      assert.equal(EFFORT_LEVELS.MODERATE_EFFORT.hours, 0.50);

      assert.equal(EFFORT_LEVELS.HIGH_EFFORT.score, 45.00);
      assert.equal(EFFORT_LEVELS.HIGH_EFFORT.hours, 1.00);

      assert.equal(EFFORT_LEVELS.EXTREME_EFFORT.score, 20.00);
      assert.equal(EFFORT_LEVELS.EXTREME_EFFORT.hours, 2.00);
    });

    test('should verify scoring weights sum to exactly 1.00 (100%)', () => {
      const totalWeight = SCORING_WEIGHTS.VALUE +
                          SCORING_WEIGHTS.PROBABILITY +
                          SCORING_WEIGHTS.URGENCY +
                          SCORING_WEIGHTS.EFFORT;

      assert.equal(Math.round(totalWeight * 100) / 100, 1.00);
      assert.equal(SCORING_WEIGHTS.VALUE, 0.35);
      assert.equal(SCORING_WEIGHTS.PROBABILITY, 0.30);
      assert.equal(SCORING_WEIGHTS.URGENCY, 0.20);
      assert.equal(SCORING_WEIGHTS.EFFORT, 0.15);
    });
  });

  // ============================================================================
  // 2. DETERMINISTIC SUBSCORE CALCULATIONS
  // ============================================================================
  describe('2. Authoritative Subscore Algorithms', () => {
    test('calculateValueScore: normalizes against benchmark and caps at 100.00', () => {
      assert.equal(calculateValueScore(0, 5000), 0.00);
      assert.equal(calculateValueScore(2500, 5000), 50.00);
      assert.equal(calculateValueScore(5000, 5000), 100.00);
      assert.equal(calculateValueScore(12000, 5000), 100.00); // capped
      assert.equal(calculateValueScore(1250, 5000), 25.00);
    });

    test('calculateUrgencyScore: adheres strictly to statutory timeline tiers', () => {
      assert.equal(calculateUrgencyScore(5), 100.00);  // <= 7 days (cliff)
      assert.equal(calculateUrgencyScore(7), 100.00);
      assert.equal(calculateUrgencyScore(10), 90.00);  // 8-14 days
      assert.equal(calculateUrgencyScore(14), 90.00);
      assert.equal(calculateUrgencyScore(20), 75.00);  // 15-30 days
      assert.equal(calculateUrgencyScore(30), 75.00);
      assert.equal(calculateUrgencyScore(45), 50.00);  // 31-60 days
      assert.equal(calculateUrgencyScore(60), 50.00);
      assert.equal(calculateUrgencyScore(90), 30.00);  // > 60 days
      assert.equal(calculateUrgencyScore(-5), 0.00);   // expired
    });

    test('calculateEffortScore: maps effort tiers to score values', () => {
      assert.equal(calculateEffortScore('MINIMAL_EFFORT'), 100.00);
      assert.equal(calculateEffortScore('MODERATE_EFFORT'), 75.00);
      assert.equal(calculateEffortScore('HIGH_EFFORT'), 45.00);
      assert.equal(calculateEffortScore('EXTREME_EFFORT'), 20.00);
      assert.equal(calculateEffortScore('UNKNOWN'), 50.00); // fallback
    });

    test('calculatePriorityScore: computes weighted sum accurately', () => {
      // 100 on all factors => 100.00
      assert.equal(calculatePriorityScore(100, 100, 100, 100), 100.00);

      // (50 * 0.35) + (80 * 0.30) + (100 * 0.20) + (75 * 0.15)
      // = 17.5 + 24.0 + 20.0 + 11.25 = 72.75
      const calculated = calculatePriorityScore(50, 80, 100, 75);
      assert.equal(calculated, 72.75);
    });

    test('calculateYieldPerHour: computes recovery velocity ($/hr)', () => {
      // $2,000 denied * 90% overturn / 0.5 hours = $1,800 / 0.5 = $3,600/hr
      assert.equal(calculateYieldPerHour(2000, 90, 0.5), 3600.00);

      // $5,000 denied * 50% overturn / 1.0 hour = $2,500 / 1.0 = $2,500/hr
      assert.equal(calculateYieldPerHour(5000, 50, 1.0), 2500.00);

      // $300 denied * 100% overturn / 0.25 hours = $300 / 0.25 = $1,200/hr
      assert.equal(calculateYieldPerHour(300, 100, 0.25), 1200.00);
    });
  });

  // ============================================================================
  // 3. PRIORITY TIER CLASSIFICATION & EXPIRED RULE INVARIANTS
  // ============================================================================
  describe('3. Priority Tier Classification & Business Invariants', () => {
    test('classifyPriorityTier: classifies tiers based on score boundaries', () => {
      assert.equal(classifyPriorityTier(85.00, 10), 'CRITICAL_URGENT');
      assert.equal(classifyPriorityTier(80.00, 10), 'CRITICAL_URGENT');
      assert.equal(classifyPriorityTier(79.90, 20), 'HIGH_PRIORITY');
      assert.equal(classifyPriorityTier(65.00, 20), 'HIGH_PRIORITY');
      assert.equal(classifyPriorityTier(64.50, 40), 'MEDIUM_PRIORITY');
      assert.equal(classifyPriorityTier(45.00, 40), 'MEDIUM_PRIORITY');
      assert.equal(classifyPriorityTier(44.00, 60), 'LOW_PRIORITY');
      assert.equal(classifyPriorityTier(25.00, 60), 'LOW_PRIORITY');
      assert.equal(classifyPriorityTier(24.50, 60), 'UNRECOVERABLE_HOLD');
    });

    test('Rule 2 Invariant: Expired filing deadline (< 0 days) forces UNRECOVERABLE_HOLD', () => {
      // Even with high score, negative days forces UNRECOVERABLE_HOLD
      assert.equal(classifyPriorityTier(95.00, -3), 'UNRECOVERABLE_HOLD');
      assert.equal(classifyPriorityTier(75.00, -14), 'UNRECOVERABLE_HOLD');
    });

    test('scoreDenial: expired denial sets urgency score 0.00, status EXPIRED, and tier UNRECOVERABLE_HOLD', () => {
      const expiredRecord = {
        denied_amount: 3000.00,
        overturn_probability_pct: 80.00,
        days_until_deadline: -10,
        effort_level: 'MODERATE_EFFORT',
        queue_status: 'QUEUED'
      };

      const scored = scoreDenial(expiredRecord, 5000);
      assert.equal(scored.urgency_score, 0.00);
      assert.equal(scored.priority_tier, 'UNRECOVERABLE_HOLD');
      assert.equal(scored.queue_status, 'EXPIRED');
    });
  });

  // ============================================================================
  // 4. QUEUE SORTING INVARIANT & WORKBENCH ACTIONS
  // ============================================================================
  describe('4. Store & Queue Sorting Operations', () => {
    let store;

    beforeEach(() => {
      store = new DenialPrioritizationStore();
      store.resetToDefaults();
    });

    test('Rule 3 Invariant: queue sorts by Priority Tier Rank DESC, Yield $/hr DESC, Days Left ASC', () => {
      const items = store.getAllPriorities();
      assert.ok(items.length >= 8);

      for (let i = 0; i < items.length - 1; i++) {
        const curr = items[i];
        const next = items[i + 1];
        const rankCurr = PRIORITY_TIERS[curr.priority_tier].rank;
        const rankNext = PRIORITY_TIERS[next.priority_tier].rank;

        if (rankCurr === rankNext) {
          if (curr.yield_per_hour === next.yield_per_hour) {
            assert.ok(curr.days_until_deadline <= next.days_until_deadline,
              'When rank and yield are equal, lower days_until_deadline must come first');
          } else {
            assert.ok(curr.yield_per_hour >= next.yield_per_hour,
              'Within the same tier rank, higher yield_per_hour must come first');
          }
        } else {
          assert.ok(rankCurr >= rankNext, 'Higher tier rank must precede lower tier rank');
        }
      }
    });

    test('assignDenialToSpecialist: transitions status to ASSIGNED and logs specialist info', () => {
      const updated = store.assignDenialToSpecialist('drp-001', 'usr-test-1', 'Alex Mercer, CPC');
      assert.equal(updated.queue_status, 'ASSIGNED');
      assert.equal(updated.assigned_user_name, 'Alex Mercer, CPC');
      assert.ok(updated.assigned_at);
    });

    test('dismissDenialAsWriteOff: sets status DISMISSED_WRITE_OFF and UNRECOVERABLE_HOLD with notes', () => {
      const reason = 'Timely filing limit permanently elapsed without contractual waiver.';
      const updated = store.dismissDenialAsWriteOff('drp-007', 'usr-sup-1', 'Dr. Medical Director', reason);
      assert.equal(updated.queue_status, 'DISMISSED_WRITE_OFF');
      assert.equal(updated.priority_tier, 'UNRECOVERABLE_HOLD');
      assert.equal(updated.write_off_notes, reason);
    });

    test('startAppeal: transitions status to IN_APPEAL but rejects expired claim', () => {
      const updated = store.startAppeal('drp-002', 'Modifiers verified');
      assert.equal(updated.queue_status, 'IN_APPEAL');

      // Attempting on expired claim must throw
      assert.throws(() => {
        store.startAppeal('drp-007', 'Should fail on expired');
      }, /expired/i);
    });

    test('getMetrics: calculates portfolio KPIs correctly', () => {
      const metrics = store.getMetrics('fac-surgical-01');
      assert.ok(metrics.totalActive > 0);
      assert.ok(metrics.totalDeniedAmount > 0);
      assert.ok(metrics.totalExpectedRecovery > 0);
      assert.ok(metrics.avgYieldPerHour > 0);
      assert.ok(metrics.tierDistribution.CRITICAL_URGENT >= 1);
    });

    test('generateAppealStrategySummary: produces complete AI dispute package with exhibits', () => {
      const summary = store.generateAppealStrategySummary('drp-001');
      assert.equal(summary.claimNumber, 'CLM-2026-08801');
      assert.ok(summary.requiredExhibits.length >= 3);
      assert.ok(summary.recommendedStrategy.length > 20);
      assert.ok(summary.urgencyAssessment.includes('CLIFF'));
    });
  });

  // ============================================================================
  // 5. DATABASE MIGRATION INTEGRITY (071)
  // ============================================================================
  describe('5. Database Migration SQL Integrity (071)', () => {
    const upMigrationPath = path.join(ROOT_DIR, 'supabase', 'migrations', '071_denial_recovery_prioritization.sql');
    const downMigrationPath = path.join(ROOT_DIR, 'supabase', 'migrations', '071_denial_recovery_prioritization_down.sql');

    test('up migration 071 exists and contains required tables, views and RLS policies', () => {
      assert.ok(fs.existsSync(upMigrationPath), '071 migration file must exist');
      const sql = fs.readFileSync(upMigrationPath, 'utf8');

      // Tables
      assert.ok(sql.includes('public.denial_recovery_priorities'), 'Must create denial_recovery_priorities');
      assert.ok(sql.includes('public.denial_prioritization_rules'), 'Must create denial_prioritization_rules');

      // Constraints & columns
      assert.ok(sql.includes('yield_per_hour'), 'Must include yield_per_hour column');
      assert.ok(sql.includes('priority_score'), 'Must include priority_score column');
      assert.ok(sql.includes('priority_tier'), 'Must include priority_tier column');
      assert.ok(sql.includes('queue_status'), 'Must include queue_status column');

      // Views
      assert.ok(sql.includes('vw_denial_recovery_priorities_active'), 'Must create active view');
      assert.ok(sql.includes('vw_denial_recovery_priorities_summary'), 'Must create summary view');

      // RLS Policies with 1:1 DROP POLICY IF EXISTS
      assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY;'), 'Must enable RLS');
      assert.ok(sql.includes('DROP POLICY IF EXISTS denial_recovery_priorities_isolation'), 'Must drop existing policy 1:1');
      assert.ok(sql.includes('CREATE POLICY denial_recovery_priorities_isolation'), 'Must create RLS policy');
    });

    test('down migration 071 exists and cleanly drops all objects with CASCADE', () => {
      assert.ok(fs.existsSync(downMigrationPath), '071 down migration file must exist');
      const sql = fs.readFileSync(downMigrationPath, 'utf8');

      assert.ok(sql.includes('DROP POLICY IF EXISTS'), 'Must drop RLS policies');
      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_denial_recovery_priorities_summary CASCADE;'), 'Must drop summary view');
      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_denial_recovery_priorities_active CASCADE;'), 'Must drop active view');
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.denial_prioritization_rules CASCADE;'), 'Must drop rules table');
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.denial_recovery_priorities CASCADE;'), 'Must drop priorities table');
    });
  });

  // ============================================================================
  // 6. CLINICAL DESIGN SYSTEM & APP WIRING
  // ============================================================================
  describe('6. Maestro Design System Governance & App Wiring', () => {
    test('strictly ZERO purple/violet/indigo/magenta tokens in JSX and CSS', () => {
      const jsxPath = path.join(ROOT_DIR, 'src', 'components', 'DenialRecoveryPrioritizationView.jsx');
      const cssPath = path.join(ROOT_DIR, 'src', 'components', 'DenialRecoveryPrioritizationView.css');

      assert.ok(fs.existsSync(jsxPath), 'JSX file must exist');
      assert.ok(fs.existsSync(cssPath), 'CSS file must exist');

      const prohibitedPattern = /purple|violet|indigo|magenta|fuchsia|#8b5cf6|#6366f1|#7c3aed|#a855f7|#d946ef/i;

      const jsxContent = fs.readFileSync(jsxPath, 'utf8');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      assert.ok(!prohibitedPattern.test(jsxContent), 'JSX must not contain any prohibited color tokens');
      assert.ok(!prohibitedPattern.test(cssContent), 'CSS must not contain any prohibited color tokens');
    });

    test('App.jsx correctly imports and registers DenialRecoveryPrioritizationView', () => {
      const appPath = path.join(ROOT_DIR, 'src', 'App.jsx');
      const appCode = fs.readFileSync(appPath, 'utf8');

      assert.ok(appCode.includes("import DenialRecoveryPrioritizationView from './components/DenialRecoveryPrioritizationView';"),
        'App.jsx must import DenialRecoveryPrioritizationView');
      assert.ok(appCode.includes("activeTab === 'denial_prioritization'"),
        'App.jsx must register denial_prioritization tab and menu');
      assert.ok(appCode.includes('<DenialRecoveryPrioritizationView />'),
        'App.jsx must render DenialRecoveryPrioritizationView component');
    });

    test('Phase 94 master specification document is authored and complete', () => {
      const specPath = path.join(ROOT_DIR, 'docs', 'phases', '94_DENIAL_RECOVERY_PRIORITIZATION.md');
      assert.ok(fs.existsSync(specPath), 'Phase 94 spec document must exist');
      const spec = fs.readFileSync(specPath, 'utf8');

      assert.ok(spec.includes('# 94 DENIAL RECOVERY PRIORITIZATION'), 'Must have title');
      assert.ok(spec.includes('PriorityScore'), 'Must detail priority score formula');
      assert.ok(spec.includes('YieldPerHour'), 'Must detail yield per hour formula');
      assert.ok(spec.includes('CRITICAL_URGENT'), 'Must define priority tiers');
    });
  });

});
