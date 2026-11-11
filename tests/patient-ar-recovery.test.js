/**
 * PATIENT AR RECOVERY AUTOMATED TEST SUITE
 * Phase 96 — Revenue Cycle Management
 * 
 * Comprehensive test coverage for post-insurance patient AR prioritization,
 * Propensity-to-Pay segmentation, payment plan calculations, charity care compliance,
 * and database migration integrity.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  patientArRecoveryService,
  PatientArRecoveryStore,
  PROPENSITY_TIERS,
  ENGAGEMENT_TIERS,
  RECOVERY_ACTION_TIERS,
  CASE_STATUSES,
  SCORING_WEIGHTS,
  calculatePatientBalanceScore,
  calculateAgingUrgencyScore,
  calculatePropensityScore,
  calculateEngagementScore,
  calculatePatientPriorityScore,
  classifyRecoveryActionTier,
  calculatePaymentPlanTerms,
  scorePatientArRecord
} from '../src/lib/patientArRecoveryService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

describe('Phase 96 — Patient AR Recovery Test Suite', () => {

  // ============================================================================
  // 1. TAXONOMY & ENUM DEFINITIONS
  // ============================================================================
  describe('1. Taxonomy & Action Tier Definitions', () => {
    test('should define all 5 recovery action tiers with score thresholds and rank', () => {
      const expectedTiers = [
        'TIER_1_DIGITAL_NUDGE',
        'TIER_2_PAYMENT_PLAN_OFFER',
        'TIER_3_COUNSELOR_OUTREACH',
        'TIER_4_FINAL_NOTICE',
        'TIER_5_BAD_DEBT_OR_CHARITY'
      ];
      assert.equal(Object.keys(RECOVERY_ACTION_TIERS).length, 5);
      expectedTiers.forEach(t => {
        assert.ok(RECOVERY_ACTION_TIERS[t], `Tier ${t} must exist`);
        assert.ok(typeof RECOVERY_ACTION_TIERS[t].minScore === 'number');
        assert.ok(typeof RECOVERY_ACTION_TIERS[t].rank === 'number');
      });

      assert.equal(RECOVERY_ACTION_TIERS.TIER_1_DIGITAL_NUDGE.rank, 1);
      assert.equal(RECOVERY_ACTION_TIERS.TIER_5_BAD_DEBT_OR_CHARITY.rank, 5);
    });

    test('should define 5 Propensity-to-Pay (P2P) tiers', () => {
      assert.equal(Object.keys(PROPENSITY_TIERS).length, 5);
      assert.equal(PROPENSITY_TIERS.EXCELLENT_PROPENSITY.score, 100.00);
      assert.equal(PROPENSITY_TIERS.GOOD_PROPENSITY.score, 80.00);
      assert.equal(PROPENSITY_TIERS.MODERATE_PROPENSITY.score, 55.00);
      assert.equal(PROPENSITY_TIERS.LOW_PROPENSITY.score, 30.00);
      assert.equal(PROPENSITY_TIERS.CHARITY_CANDIDATE.score, 10.00);
    });

    test('should verify scoring weights sum to exactly 1.00 (100%)', () => {
      const total = SCORING_WEIGHTS.BALANCE +
                    SCORING_WEIGHTS.PROPENSITY +
                    SCORING_WEIGHTS.AGING_URGENCY +
                    SCORING_WEIGHTS.ENGAGEMENT;
      assert.equal(Math.round(total * 100) / 100, 1.00);
      assert.equal(SCORING_WEIGHTS.BALANCE, 0.35);
      assert.equal(SCORING_WEIGHTS.PROPENSITY, 0.30);
      assert.equal(SCORING_WEIGHTS.AGING_URGENCY, 0.20);
      assert.equal(SCORING_WEIGHTS.ENGAGEMENT, 0.15);
    });
  });

  // ============================================================================
  // 2. DETERMINISTIC FINANCIAL CALCULATIONS & INVARIANTS
  // ============================================================================
  describe('2. Deterministic Financial Math & Scoring Formulas', () => {
    test('calculatePatientBalanceScore: normalizes against benchmark and caps at 100.00', () => {
      assert.equal(calculatePatientBalanceScore(0, 1000), 0.00);
      assert.equal(calculatePatientBalanceScore(500, 1000), 50.00);
      assert.equal(calculatePatientBalanceScore(1000, 1000), 100.00);
      assert.equal(calculatePatientBalanceScore(2500, 1000), 100.00); // capped
    });

    test('calculateAgingUrgencyScore: adheres strictly to days in AR tiers', () => {
      assert.equal(calculateAgingUrgencyScore(10), 100.00); // 1-30 days
      assert.equal(calculateAgingUrgencyScore(30), 100.00);
      assert.equal(calculateAgingUrgencyScore(45), 85.00);  // 31-60 days
      assert.equal(calculateAgingUrgencyScore(60), 85.00);
      assert.equal(calculateAgingUrgencyScore(75), 60.00);  // 61-90 days
      assert.equal(calculateAgingUrgencyScore(90), 60.00);
      assert.equal(calculateAgingUrgencyScore(105), 35.00); // 91-120 days
      assert.equal(calculateAgingUrgencyScore(120), 35.00);
      assert.equal(calculateAgingUrgencyScore(150), 15.00); // > 120 days
    });

    test('calculatePatientPriorityScore: computes weighted sum accurately', () => {
      // 100 on all factors => 100.00
      assert.equal(calculatePatientPriorityScore(100, 100, 100, 100), 100.00);

      // (50 * 0.35) + (80 * 0.30) + (100 * 0.20) + (75 * 0.15)
      // = 17.5 + 24.0 + 20.0 + 11.25 = 72.75
      assert.equal(calculatePatientPriorityScore(50, 80, 100, 75), 72.75);
    });

    test('calculatePaymentPlanTerms: calculates exact monthly installment', () => {
      // $1,200 over 6 months = $200.00/mo
      const terms6 = calculatePaymentPlanTerms(1200, 6);
      assert.equal(terms6.totalAmount, 1200.00);
      assert.equal(terms6.installments, 6);
      assert.equal(terms6.monthlyPayment, 200.00);

      // $1,500 over 12 months = $125.00/mo
      const terms12 = calculatePaymentPlanTerms(1500, 12);
      assert.equal(terms12.monthlyPayment, 125.00);
    });

    test('Rule 2 Invariant: Balance due equals original PR minus patient paid', () => {
      const record = {
        original_patient_resp: 1560.00,
        patient_paid_amount: 300.00,
        days_in_patient_ar: 20
      };
      const scored = scorePatientArRecord(record, 1000);
      assert.equal(scored.patient_balance_due, 1260.00);
    });
  });

  // ============================================================================
  // 3. RECOVERY ACTION TIER CLASSIFICATION
  // ============================================================================
  describe('3. Action Tier Classification', () => {
    test('classifyRecoveryActionTier: maps scores to action tiers', () => {
      assert.equal(classifyRecoveryActionTier(85.00, 20), 'TIER_1_DIGITAL_NUDGE');
      assert.equal(classifyRecoveryActionTier(80.00, 20), 'TIER_1_DIGITAL_NUDGE');
      assert.equal(classifyRecoveryActionTier(75.00, 45), 'TIER_2_PAYMENT_PLAN_OFFER');
      assert.equal(classifyRecoveryActionTier(65.00, 45), 'TIER_2_PAYMENT_PLAN_OFFER');
      assert.equal(classifyRecoveryActionTier(50.00, 75), 'TIER_3_COUNSELOR_OUTREACH');
      assert.equal(classifyRecoveryActionTier(45.00, 75), 'TIER_3_COUNSELOR_OUTREACH');
      assert.equal(classifyRecoveryActionTier(35.00, 100), 'TIER_4_FINAL_NOTICE');
      assert.equal(classifyRecoveryActionTier(25.00, 100), 'TIER_4_FINAL_NOTICE');
      assert.equal(classifyRecoveryActionTier(20.00, 130), 'TIER_5_BAD_DEBT_OR_CHARITY');
    });

    test('Aged > 120 days with low score defaults to TIER_5_BAD_DEBT_OR_CHARITY', () => {
      assert.equal(classifyRecoveryActionTier(24.00, 135), 'TIER_5_BAD_DEBT_OR_CHARITY');
    });
  });

  // ============================================================================
  // 4. WORKBENCH STATE MACHINE & STORE OPERATIONS
  // ============================================================================
  describe('4. Store Operations & Workbenches', () => {
    let store;

    beforeEach(() => {
      store = new PatientArRecoveryStore();
      store.resetToDefaults();
    });

    test('Rule 4 Invariant: Queue sorts by Tier Rank ASC (Tier 1 first), Balance Due DESC, Days Left ASC', () => {
      const list = store.getAllCases();
      assert.ok(list.length >= 8);

      for (let i = 0; i < list.length - 1; i++) {
        const curr = list[i];
        const next = list[i + 1];
        const rankCurr = RECOVERY_ACTION_TIERS[curr.recovery_action_tier].rank;
        const rankNext = RECOVERY_ACTION_TIERS[next.recovery_action_tier].rank;

        if (rankCurr === rankNext) {
          if (curr.patient_balance_due === next.patient_balance_due) {
            assert.ok(curr.days_in_patient_ar <= next.days_in_patient_ar,
              'When rank and balance match, lower days in AR comes first');
          } else {
            assert.ok(curr.patient_balance_due >= next.patient_balance_due,
              'Within same tier, higher balance due comes first');
          }
        } else {
          assert.ok(rankCurr <= rankNext, 'Lower action tier rank (Tier 1 < Tier 2) must come first');
        }
      }
    });

    test('sendDigitalNudge: transitions status to ENGAGED and records channel', () => {
      const updated = store.sendDigitalNudge('par-001', 'SMS_AND_EMAIL');
      assert.equal(updated.case_status, 'ENGAGED');
      assert.equal(updated.nudge_channel, 'SMS_AND_EMAIL');
      assert.ok(updated.last_contact_date);
    });

    test('setupPaymentPlan: generates new active payment plan and links to case', () => {
      const res = store.setupPaymentPlan('par-002', 6, true);
      assert.equal(res.updatedCase.case_status, 'ON_PAYMENT_PLAN');
      assert.ok(res.updatedCase.payment_plan_id);
      assert.equal(res.newPlan.installment_count, 6);
      assert.equal(res.newPlan.autopay_enrolled, true);
      assert.equal(res.newPlan.plan_status, 'ACTIVE');
    });

    test('recordPatientPayment: updates balance and transitions to PAID_IN_FULL when balance reaches 0', () => {
      // Balance is $850
      const updated = store.recordPatientPayment('par-001', 850.00, 'CREDIT_CARD_ONLINE');
      assert.equal(updated.patient_balance_due, 0.00);
      assert.equal(updated.patient_paid_amount, 850.00);
      assert.equal(updated.case_status, 'PAID_IN_FULL');
    });

    test('approveCharityCare: writes off balance to $0 and flags is_charity_screened', () => {
      const reason = 'Verified household income 180% FPL; hardship approved per facility charity policy.';
      const updated = store.approveCharityCare('par-007', 'usr-sup-01', 'Dr. Medical Director', 180, reason);
      assert.equal(updated.case_status, 'CHARITY_APPROVED');
      assert.equal(updated.patient_balance_due, 0.00);
      assert.equal(updated.is_charity_screened, true);
      assert.equal(updated.charity_fpl_pct, 180);
    });

    test('getMetrics: calculates active inventory, total balance, and plans value', () => {
      const metrics = store.getMetrics('fac-surgical-01');
      assert.ok(metrics.activeAccountsCount > 0);
      assert.ok(metrics.totalBalanceDue > 0);
      assert.ok(metrics.activePlansValue >= 0);
      assert.ok(metrics.avgDaysInAr > 0);
    });
  });

  // ============================================================================
  // 5. DATABASE MIGRATION SQL INTEGRITY (073)
  // ============================================================================
  describe('5. Database Migration SQL Integrity (073)', () => {
    const upMigrationPath = path.join(ROOT_DIR, 'supabase', 'migrations', '073_patient_ar_recovery.sql');
    const downMigrationPath = path.join(ROOT_DIR, 'supabase', 'migrations', '073_patient_ar_recovery_down.sql');

    test('up migration 073 exists and contains core tables, constraints, views, and 1:1 RLS policies', () => {
      assert.ok(fs.existsSync(upMigrationPath), '073 migration file must exist');
      const sql = fs.readFileSync(upMigrationPath, 'utf8');

      // Tables
      assert.ok(sql.includes('public.patient_ar_recovery_cases'), 'Must create patient_ar_recovery_cases');
      assert.ok(sql.includes('public.patient_payment_plans'), 'Must create patient_payment_plans');

      // Core Columns
      assert.ok(sql.includes('patient_balance_due'), 'Must include patient_balance_due');
      assert.ok(sql.includes('propensity_to_pay_tier'), 'Must include propensity_to_pay_tier');
      assert.ok(sql.includes('recovery_action_tier'), 'Must include recovery_action_tier');
      assert.ok(sql.includes('days_in_patient_ar'), 'Must include days_in_patient_ar');

      // Views
      assert.ok(sql.includes('vw_patient_ar_active'), 'Must create active view');
      assert.ok(sql.includes('vw_patient_ar_summary'), 'Must create summary view');

      // RLS Policies with 1:1 DROP POLICY IF EXISTS
      assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY;'), 'Must enable RLS');
      assert.ok(sql.includes('DROP POLICY IF EXISTS patient_ar_recovery_cases_isolation'), 'Must drop existing policy 1:1');
      assert.ok(sql.includes('CREATE POLICY patient_ar_recovery_cases_isolation'), 'Must create RLS policy');
    });

    test('down migration 073 exists and cleanly rolls back schema objects with CASCADE', () => {
      assert.ok(fs.existsSync(downMigrationPath), '073 down migration file must exist');
      const sql = fs.readFileSync(downMigrationPath, 'utf8');

      assert.ok(sql.includes('DROP POLICY IF EXISTS'), 'Must drop RLS policies');
      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_patient_ar_summary CASCADE;'), 'Must drop summary view');
      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_patient_ar_active CASCADE;'), 'Must drop active view');
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.patient_payment_plans CASCADE;'), 'Must drop plans table');
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.patient_ar_recovery_cases CASCADE;'), 'Must drop cases table');
    });
  });

  // ============================================================================
  // 6. CLINICAL DESIGN SYSTEM & APP WIRING
  // ============================================================================
  describe('6. Maestro Design System Governance & App Wiring', () => {
    test('strictly ZERO purple/violet/indigo/magenta tokens in JSX and CSS', () => {
      const jsxPath = path.join(ROOT_DIR, 'src', 'components', 'PatientArRecoveryView.jsx');
      const cssPath = path.join(ROOT_DIR, 'src', 'components', 'PatientArRecoveryView.css');

      assert.ok(fs.existsSync(jsxPath), 'JSX file must exist');
      assert.ok(fs.existsSync(cssPath), 'CSS file must exist');

      const prohibitedPattern = /purple|violet|indigo|magenta|fuchsia|#8b5cf6|#6366f1|#7c3aed|#a855f7|#d946ef/i;

      const jsxContent = fs.readFileSync(jsxPath, 'utf8');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      assert.ok(!prohibitedPattern.test(jsxContent), 'JSX must not contain any prohibited color tokens');
      assert.ok(!prohibitedPattern.test(cssContent), 'CSS must not contain any prohibited color tokens');
    });

    test('App.jsx correctly imports and registers PatientArRecoveryView', () => {
      const appPath = path.join(ROOT_DIR, 'src', 'App.jsx');
      const appCode = fs.readFileSync(appPath, 'utf8');

      assert.ok(appCode.includes("import PatientArRecoveryView from './components/PatientArRecoveryView';"),
        'App.jsx must import PatientArRecoveryView');
      assert.ok(appCode.includes("activeTab === 'patient_ar_recovery'"),
        'App.jsx must register patient_ar_recovery tab and menu');
      assert.ok(appCode.includes('<PatientArRecoveryView />'),
        'App.jsx must render PatientArRecoveryView component');
    });

    test('Phase 96 master specification document is authored and complete', () => {
      const specPath = path.join(ROOT_DIR, 'docs', 'phases', '96_PATIENT_AR_RECOVERY.md');
      assert.ok(fs.existsSync(specPath), 'Phase 96 spec document must exist');
      const spec = fs.readFileSync(specPath, 'utf8');

      assert.ok(spec.includes('# 96 PATIENT AR RECOVERY'), 'Must have title');
      assert.ok(spec.includes('TIER_1_DIGITAL_NUDGE'), 'Must define action tiers');
      assert.ok(spec.includes('Propensity-to-Pay'), 'Must define P2P model');
      assert.ok(spec.includes('patient_payment_plans'), 'Must detail payment plans');
    });
  });

});
