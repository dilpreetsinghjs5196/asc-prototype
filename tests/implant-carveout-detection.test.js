import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  REIMBURSEMENT_MODELS,
  LEAKAGE_TYPES,
  RECOVERY_ACTION_TIERS,
  DOCUMENTATION_TIERS,
  OVERTURN_LIKELIHOOD_TIERS,
  SCORING_WEIGHTS,
  DEFAULT_IMPLANT_BENCHMARK,
  calculateExpectedCarveout,
  calculateCarveoutVariance,
  calculateVarianceScore,
  calculateDocumentationScore,
  calculateOverturnScore,
  calculateFilingUrgencyScore,
  calculateCarveoutPriorityScore,
  classifyRecoveryActionTier,
  scoreCarveoutDiscrepancy,
  ImplantCarveoutStore
} from '../src/lib/implantCarveoutService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

describe('Phase 97 — Implant Carveout Detection Test Suite', () => {

  // ============================================================================
  // 1. TAXONOMY & ENUMERATIONS
  // ============================================================================
  describe('1. Taxonomy & Model Definitions', () => {
    test('should define all 5 contractual reimbursement models', () => {
      const models = Object.keys(REIMBURSEMENT_MODELS);
      assert.equal(models.length, 5);
      assert.ok(REIMBURSEMENT_MODELS.INVOICE_COST_PLUS_PERCENT);
      assert.ok(REIMBURSEMENT_MODELS.PASS_THROUGH_AT_COST);
      assert.ok(REIMBURSEMENT_MODELS.INVOICE_PLUS_FIXED_FEE);
      assert.ok(REIMBURSEMENT_MODELS.THRESHOLD_OVERAGE_PLUS_MARKUP);
      assert.ok(REIMBURSEMENT_MODELS.FEE_SCHEDULE_FIXED);
    });

    test('should define all 5 carve-out leakage types', () => {
      const types = Object.keys(LEAKAGE_TYPES);
      assert.equal(types.length, 5);
      assert.ok(LEAKAGE_TYPES.UNBILLED_IMPLANT);
      assert.ok(LEAKAGE_TYPES.ZERO_PAID_BUNDLED);
      assert.ok(LEAKAGE_TYPES.MISSING_INVOICE_DENIAL);
      assert.ok(LEAKAGE_TYPES.MARKUP_UNDERPAID);
      assert.ok(LEAKAGE_TYPES.THRESHOLD_CALCULATION_ERROR);
    });

    test('should define 5 recovery action tiers with strict ranks and minScores', () => {
      const tiers = Object.values(RECOVERY_ACTION_TIERS);
      assert.equal(tiers.length, 5);
      tiers.forEach(t => {
        assert.ok(t.code);
        assert.ok(t.label);
        assert.ok(typeof t.rank === 'number');
        assert.ok(typeof t.minScore === 'number');
        assert.ok(t.badgeColor);
      });
      assert.equal(RECOVERY_ACTION_TIERS.TIER_1_CRITICAL_RECOVERY.rank, 1);
      assert.equal(RECOVERY_ACTION_TIERS.TIER_5_EXPIRED_OR_NON_CARVED.rank, 5);
    });

    test('should verify scoring weights sum to exactly 1.00 (100%)', () => {
      const sum = SCORING_WEIGHTS.VARIANCE +
                  SCORING_WEIGHTS.DOCUMENTATION +
                  SCORING_WEIGHTS.OVERTURN_LIKELIHOOD +
                  SCORING_WEIGHTS.FILING_URGENCY;
      assert.ok(Math.abs(sum - 1.00) < 0.0001, 'Weights must sum to 1.00');
    });
  });

  // ============================================================================
  // 2. DETERMINISTIC FINANCIAL MATH & ALLOWABLE CALCULATIONS
  // ============================================================================
  describe('2. Deterministic Financial Math & Allowable Calculations', () => {
    test('calculateExpectedCarveout: INVOICE_COST_PLUS_PERCENT', () => {
      // $4,000 invoice cost with 15% markup = $4,600.00
      const res = calculateExpectedCarveout('INVOICE_COST_PLUS_PERCENT', 4000, { markupPercentage: 0.15 });
      assert.equal(res, 4600.00);
    });

    test('calculateExpectedCarveout: PASS_THROUGH_AT_COST', () => {
      // $5,250 invoice cost pass-through = $5,250.00
      const res = calculateExpectedCarveout('PASS_THROUGH_AT_COST', 5250);
      assert.equal(res, 5250.00);
    });

    test('calculateExpectedCarveout: INVOICE_PLUS_FIXED_FEE', () => {
      // $3,000 invoice cost + $350 fixed fee = $3,350.00
      const res = calculateExpectedCarveout('INVOICE_PLUS_FIXED_FEE', 3000, { fixedFeeAmount: 350 });
      assert.equal(res, 3350.00);
    });

    test('calculateExpectedCarveout: THRESHOLD_OVERAGE_PLUS_MARKUP', () => {
      // $6,000 cost over $1,000 threshold with 10% markup = ($6,000 - $1,000) * 1.10 = $5,500.00
      const res = calculateExpectedCarveout('THRESHOLD_OVERAGE_PLUS_MARKUP', 6000, {
        minThreshold: 1000,
        markupPercentage: 0.10
      });
      assert.equal(res, 5500.00);
    });

    test('calculateExpectedCarveout: FEE_SCHEDULE_FIXED', () => {
      // $850.00 fixed device fee for 2 items = $1,700.00
      const res = calculateExpectedCarveout('FEE_SCHEDULE_FIXED', 0, {
        feeScheduleRate: 850,
        quantityImplanted: 2
      });
      assert.equal(res, 1700.00);
    });

    test('calculateExpectedCarveout: enforces maxReimbursementCap', () => {
      // Expected $6,000 but contract cap is $5,000
      const res = calculateExpectedCarveout('INVOICE_COST_PLUS_PERCENT', 5000, {
        markupPercentage: 0.20,
        maxReimbursementCap: 5000
      });
      assert.equal(res, 5000.00);
    });

    test('calculateCarveoutVariance: invariant max(0, expected - paid)', () => {
      assert.equal(calculateCarveoutVariance(5000, 0), 5000.00);
      assert.equal(calculateCarveoutVariance(5000, 4200), 800.00);
      assert.equal(calculateCarveoutVariance(5000, 5200), 0.00);
    });
  });

  // ============================================================================
  // 3. AUTHORITATIVE SUBSCORE & PRIORITY SCORING ALGORITHMS
  // ============================================================================
  describe('3. Subscores & Priority Scoring Algorithms', () => {
    test('calculateVarianceScore: caps at 100.00 based on benchmark', () => {
      assert.equal(calculateVarianceScore(0), 0.00);
      assert.equal(calculateVarianceScore(1250, 2500), 50.00);
      assert.equal(calculateVarianceScore(2500, 2500), 100.00);
      assert.equal(calculateVarianceScore(5000, 2500), 100.00);
    });

    test('calculateDocumentationScore: accurately maps documentation tiers', () => {
      assert.equal(calculateDocumentationScore('INVOICE_AND_LOG_VERIFIED'), 100.00);
      assert.equal(calculateDocumentationScore('INVOICE_ON_FILE_NO_UDI'), 80.00);
      assert.equal(calculateDocumentationScore('LOG_VERIFIED_INVOICE_PENDING'), 45.00);
      assert.equal(calculateDocumentationScore('DOCUMENTATION_MISSING'), 10.00);
    });

    test('calculateOverturnScore: accurately maps overturn likelihood tiers', () => {
      assert.equal(calculateOverturnScore('CONTRACT_CARVEOUT_VIOLATION'), 95.00);
      assert.equal(calculateOverturnScore('MISSING_INVOICE_CURE'), 90.00);
      assert.equal(calculateOverturnScore('MARKUP_RECONCILIATION'), 85.00);
      assert.equal(calculateOverturnScore('THRESHOLD_DISPUTE'), 60.00);
      assert.equal(calculateOverturnScore('UNLISTED_DEVICE_REVIEW'), 40.00);
    });

    test('calculateFilingUrgencyScore: strictly adheres to timeline tiers and 0.00 for expired', () => {
      assert.equal(calculateFilingUrgencyScore(10), 100.00); // <= 15 days
      assert.equal(calculateFilingUrgencyScore(25), 80.00);  // 16-30 days
      assert.equal(calculateFilingUrgencyScore(45), 60.00);  // 31-60 days
      assert.equal(calculateFilingUrgencyScore(75), 40.00);  // 61-90 days
      assert.equal(calculateFilingUrgencyScore(120), 20.00); // > 90 days
      assert.equal(calculateFilingUrgencyScore(-5), 0.00);   // expired
    });

    test('calculateCarveoutPriorityScore: computes weighted sum accurately', () => {
      // (100 * 0.40) + (100 * 0.25) + (100 * 0.20) + (100 * 0.15) = 100.00
      assert.equal(calculateCarveoutPriorityScore(100, 100, 100, 100), 100.00);

      // (50 * 0.40) + (80 * 0.25) + (90 * 0.20) + (60 * 0.15)
      // = 20.0 + 20.0 + 18.0 + 9.0 = 67.00
      assert.equal(calculateCarveoutPriorityScore(50, 80, 90, 60), 67.00);
    });
  });

  // ============================================================================
  // 4. ACTION TIER CLASSIFICATION & INVARIANTS
  // ============================================================================
  describe('4. Action Tier Classification & Invariants', () => {
    test('classifyRecoveryActionTier: maps scores to action tiers', () => {
      assert.equal(classifyRecoveryActionTier(85.00, 20), 'TIER_1_CRITICAL_RECOVERY');
      assert.equal(classifyRecoveryActionTier(70.00, 45), 'TIER_2_HIGH_YIELD_DISPUTE');
      assert.equal(classifyRecoveryActionTier(50.00, 45), 'TIER_3_DOCUMENTATION_CURE');
      assert.equal(classifyRecoveryActionTier(30.00, 60), 'TIER_4_LOW_VARIANCE_MONITOR');
      assert.equal(classifyRecoveryActionTier(15.00, 90), 'TIER_5_EXPIRED_OR_NON_CARVED');
    });

    test('Rule 4 Invariant: Expired deadline (< 0 days) forces TIER_5 and EXPIRED_UNRECOVERABLE', () => {
      assert.equal(classifyRecoveryActionTier(95.00, -10), 'TIER_5_EXPIRED_OR_NON_CARVED');

      const record = {
        invoice_cost: 4000,
        reimbursement_model: 'PASS_THROUGH_AT_COST',
        payer_paid_carveout: 0,
        days_until_deadline: -14,
        documentation_readiness_tier: 'INVOICE_AND_LOG_VERIFIED',
        overturn_tier: 'CONTRACT_CARVEOUT_VIOLATION'
      };
      const scored = scoreCarveoutDiscrepancy(record);
      assert.equal(scored.urgency_score, 0.00);
      assert.equal(scored.recovery_action_tier, 'TIER_5_EXPIRED_OR_NON_CARVED');
      assert.equal(scored.discrepancy_status, 'EXPIRED_UNRECOVERABLE');
    });
  });

  // ============================================================================
  // 5. STORE OPERATIONS & WORKBENCHES
  // ============================================================================
  describe('5. Store Operations & Workbenches', () => {
    let store;

    test('should initialize store with baseline carve-out records', () => {
      store = new ImplantCarveoutStore();
      const all = store.getAllDiscrepancies();
      assert.ok(all.length >= 7, 'Must load at least 7 baseline discrepancies');
    });

    test('Rule 5 Invariant: Queue sorts by Tier Rank ASC (Tier 1 first), Variance DESC, Days Left ASC', () => {
      const queue = store.getAllDiscrepancies();
      const rankMap = {
        TIER_1_CRITICAL_RECOVERY: 1,
        TIER_2_HIGH_YIELD_DISPUTE: 2,
        TIER_3_DOCUMENTATION_CURE: 3,
        TIER_4_LOW_VARIANCE_MONITOR: 4,
        TIER_5_EXPIRED_OR_NON_CARVED: 5
      };

      for (let i = 0; i < queue.length - 1; i++) {
        const curr = queue[i];
        const next = queue[i + 1];
        const rankCurr = rankMap[curr.recovery_action_tier] || 99;
        const rankNext = rankMap[next.recovery_action_tier] || 99;

        if (rankCurr === rankNext) {
          if (curr.carveout_variance === next.carveout_variance) {
            assert.ok(curr.days_until_deadline <= next.days_until_deadline, 'Days until deadline must be ASC');
          } else {
            assert.ok(curr.carveout_variance >= next.carveout_variance, 'Variance must be DESC');
          }
        } else {
          assert.ok(rankCurr <= rankNext, 'Lower action tier rank (Tier 1 < Tier 2) must come first');
        }
      }
    });

    test('Rule 3 Invariant: generateDisputePacket rejects submission if invoice is missing', () => {
      // cd-002 has invoice_attached = false
      assert.throws(() => {
        store.generateDisputePacket('cd-002', 'CORRECTED_CLAIM');
      }, /Cannot file carve-out dispute without verified vendor manufacturer invoice/);
    });

    test('attachInvoice: attaches invoice, updates documentation tier, and enables dispute', () => {
      const updated = store.attachInvoice('cd-002', 'INV-MDT-VERIFIED-99', '/invoices/INV-MDT.pdf', 7400.00);
      assert.equal(updated.invoice_attached, true);
      assert.equal(updated.invoice_number, 'INV-MDT-VERIFIED-99');
      assert.equal(updated.documentation_readiness_tier, 'INVOICE_AND_LOG_VERIFIED');
      assert.equal(updated.discrepancy_status, 'INVOICE_ATTACHED');

      // Now dispute generation succeeds
      const dispute = store.generateDisputePacket('cd-002', 'CORRECTED_CLAIM', 'Attached Medtronic invoice.');
      assert.equal(dispute.discrepancy.discrepancy_status, 'CORRECTED_CLAIM_QUEUED');
      assert.ok(dispute.packet);
      assert.equal(dispute.packet.invoiceNumber, 'INV-MDT-VERIFIED-99');
    });

    test('recordRecovery: reconciles paid cash and transitions to RECOVERED when variance reaches 0', () => {
      // cd-001 has variance $6,496.00
      const updated = store.recordRecovery('cd-001', 6496.00, 'ERA remittance paid in full');
      assert.equal(updated.carveout_variance, 0.00);
      assert.equal(updated.discrepancy_status, 'RECOVERED');
    });

    test('getMetrics: calculates active count, variances, and invoice deficits accurately', () => {
      const metrics = store.getMetrics('fac-surgical-01');
      assert.ok(metrics.totalActiveCount > 0);
      assert.ok(metrics.totalActiveVariance > 0);
      assert.ok(metrics.unbilledVarianceAtRisk >= 0);
      assert.ok(typeof metrics.invoiceDeficitsCount === 'number');
      assert.ok(metrics.recoveredCashMtd >= 0);
    });
  });

  // ============================================================================
  // 6. DATABASE MIGRATION SQL INTEGRITY (074)
  // ============================================================================
  describe('6. Database Migration SQL Integrity (074)', () => {
    const upMigrationPath = path.join(ROOT_DIR, 'supabase', 'migrations', '074_implant_carveout_detection.sql');
    const downMigrationPath = path.join(ROOT_DIR, 'supabase', 'migrations', '074_implant_carveout_detection_down.sql');

    test('up migration 074 exists and contains core tables, constraints, views, and 1:1 RLS policies', () => {
      assert.ok(fs.existsSync(upMigrationPath), '074 migration file must exist');
      const sql = fs.readFileSync(upMigrationPath, 'utf8');

      // Tables
      assert.ok(sql.includes('public.implant_carveout_rules'), 'Must create implant_carveout_rules');
      assert.ok(sql.includes('public.implant_carveout_discrepancies'), 'Must create implant_carveout_discrepancies');

      // Core Columns
      assert.ok(sql.includes('reimbursement_model'), 'Must have reimbursement_model');
      assert.ok(sql.includes('carveout_variance'), 'Must have carveout_variance');
      assert.ok(sql.includes('invoice_attached'), 'Must have invoice_attached');
      assert.ok(sql.includes('carveout_priority_score'), 'Must have carveout_priority_score');

      // Views
      assert.ok(sql.includes('vw_implant_carveout_active'), 'Must create active workbench view');
      assert.ok(sql.includes('vw_implant_carveout_summary'), 'Must create summary analytics view');

      // RLS 1:1 Policies
      assert.ok(sql.includes('DROP POLICY IF EXISTS implant_carveout_rules_isolation'), 'Must drop select policy if exists');
      assert.ok(sql.includes('CREATE POLICY implant_carveout_rules_isolation'), 'Must create select policy');
      assert.ok(sql.includes('DROP POLICY IF EXISTS implant_carveout_discrepancies_isolation'), 'Must drop select policy if exists');
      assert.ok(sql.includes('CREATE POLICY implant_carveout_discrepancies_isolation'), 'Must create select policy');
    });

    test('down migration 074 exists and cleanly rolls back schema objects with CASCADE', () => {
      assert.ok(fs.existsSync(downMigrationPath), '074 down migration file must exist');
      const sql = fs.readFileSync(downMigrationPath, 'utf8');
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.implant_carveout_discrepancies CASCADE;'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.implant_carveout_rules CASCADE;'));
      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_implant_carveout_summary CASCADE;'));
      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_implant_carveout_active CASCADE;'));
    });
  });

  // ============================================================================
  // 7. MAESTRO DESIGN SYSTEM GOVERNANCE & APP WIRING
  // ============================================================================
  describe('7. Maestro Design System Governance & App Wiring', () => {
    test('strictly ZERO purple/violet/indigo/magenta tokens in JSX and CSS', () => {
      const jsxPath = path.join(ROOT_DIR, 'src', 'components', 'ImplantCarveoutDetectionView.jsx');
      const cssPath = path.join(ROOT_DIR, 'src', 'components', 'ImplantCarveoutDetectionView.css');

      const jsx = fs.readFileSync(jsxPath, 'utf8');
      const css = fs.readFileSync(cssPath, 'utf8');

      const forbiddenRegex = /purple|violet|indigo|magenta|fuchsia|#8b5cf6|#6366f1|#7c3aed|#a855f7|#d946ef/i;

      assert.ok(!forbiddenRegex.test(jsx), 'ImplantCarveoutDetectionView.jsx contains forbidden color tokens');
      assert.ok(!forbiddenRegex.test(css), 'ImplantCarveoutDetectionView.css contains forbidden color tokens');
    });

    test('App.jsx correctly imports and registers ImplantCarveoutDetectionView', () => {
      const appPath = path.join(ROOT_DIR, 'src', 'App.jsx');
      const appCode = fs.readFileSync(appPath, 'utf8');

      assert.ok(appCode.includes("import ImplantCarveoutDetectionView from './components/ImplantCarveoutDetectionView';"));
      assert.ok(appCode.includes("activeTab === 'implant_carveout'"));
      assert.ok(appCode.includes("<ImplantCarveoutDetectionView />"));
      assert.ok(appCode.includes("Implant Carveouts"));
    });

    test('Phase 97 master specification document is authored and complete', () => {
      const specPath = path.join(ROOT_DIR, 'docs', 'phases', '97_IMPLANT_CARVEOUT_DETECTION.md');
      assert.ok(fs.existsSync(specPath), 'Spec file must exist');

      const spec = fs.readFileSync(specPath, 'utf8');
      assert.ok(spec.includes('# 97 IMPLANT CARVEOUT DETECTION'));
      assert.ok(spec.includes('## Purpose'));
      assert.ok(spec.includes('## Scope'));
      assert.ok(spec.includes('## Target State'));
      assert.ok(spec.includes('## Business Rules & Invariants'));
      assert.ok(spec.includes('## Data Model / Schema'));
    });
  });
});

