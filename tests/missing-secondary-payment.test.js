/**
 * MISSING SECONDARY PAYMENT AUTOMATED TEST SUITE
 * Phase 95 — Revenue Cycle Management
 * 
 * Comprehensive test coverage for secondary-payer leakage detection,
 * Medigap & commercial COB calculations, 4-factor priority scoring,
 * patient statement hold guardian, and electronic secondary submissions.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  missingSecondaryService,
  MissingSecondaryStore,
  SECONDARY_COB_MODELS,
  LEAKAGE_ROOT_CAUSES,
  PRIORITY_TIERS,
  QUEUE_STATUSES,
  COVERAGE_CERTAINTY_TIERS,
  FILING_READINESS_TIERS,
  SCORING_WEIGHTS,
  calculateMedigapExpected,
  calculateStandardCobExpected,
  calculateNonDuplicationExpected,
  calculateExpectedSecondary,
  calculateBalanceScore,
  calculateFilingUrgencyScore,
  calculateCertaintyScore,
  calculateReadinessScore,
  calculateSecondaryPriorityScore,
  classifySecondaryPriorityTier,
  scoreSecondaryRecord
} from '../src/lib/missingSecondaryService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

describe('Phase 95 — Missing Secondary Payment & COB Leakage Test Suite', () => {

  // ============================================================================
  // 1. TAXONOMY & COB DEFINITIONS
  // ============================================================================
  describe('1. Taxonomy & COB Model Definitions', () => {
    test('should define all 3 core secondary COB models with valid descriptors', () => {
      const models = ['MEDIGAP_SUPPLEMENT', 'STANDARD_COB', 'NON_DUPLICATION_CARVEOUT'];
      assert.equal(Object.keys(SECONDARY_COB_MODELS).length, 3);
      models.forEach(m => {
        assert.ok(SECONDARY_COB_MODELS[m], `Model ${m} must exist`);
        assert.ok(SECONDARY_COB_MODELS[m].label);
        assert.ok(SECONDARY_COB_MODELS[m].description);
      });
    });

    test('should define all 7 leakage root causes', () => {
      const expectedCauses = [
        'UNFILED_SECONDARY_CLAIM',
        'FAILED_CROSSOVER',
        'PREMATURE_PATIENT_BILLING',
        'SECONDARY_TIMELY_FILING_RISK',
        'MISSING_PRIMARY_EOB',
        'SECONDARY_COB_DENIAL',
        'SECONDARY_UNDERPAYMENT'
      ];
      assert.equal(Object.keys(LEAKAGE_ROOT_CAUSES).length, 7);
      expectedCauses.forEach(c => {
        assert.ok(LEAKAGE_ROOT_CAUSES[c], `Root cause ${c} must exist`);
      });
    });

    test('should verify scoring weights sum to exactly 1.00 (100%)', () => {
      const total = SCORING_WEIGHTS.BALANCE +
                    SCORING_WEIGHTS.FILING_URGENCY +
                    SCORING_WEIGHTS.COVERAGE_CERTAINTY +
                    SCORING_WEIGHTS.FILING_READINESS;
      assert.equal(Math.round(total * 100) / 100, 1.00);
      assert.equal(SCORING_WEIGHTS.BALANCE, 0.35);
      assert.equal(SCORING_WEIGHTS.FILING_URGENCY, 0.30);
      assert.equal(SCORING_WEIGHTS.COVERAGE_CERTAINTY, 0.20);
      assert.equal(SCORING_WEIGHTS.FILING_READINESS, 0.15);
    });
  });

  // ============================================================================
  // 2. DETERMINISTIC COB FINANCIAL CALCULATIONS
  // ============================================================================
  describe('2. Deterministic COB Reimbursement Calculations', () => {
    test('calculateMedigapExpected: calculates exact 20% Medicare Part B coinsurance', () => {
      // $4,250 primary allowed * 20% = $850.00
      assert.equal(calculateMedigapExpected(4250, 0.20), 850.00);
      // $7,800 primary allowed * 20% = $1,560.00
      assert.equal(calculateMedigapExpected(7800, 0.20), 1560.00);
      // $1,400 primary allowed * 20% = $280.00
      assert.equal(calculateMedigapExpected(1400, 0.20), 280.00);
      assert.equal(calculateMedigapExpected(0), 0.00);
    });

    test('calculateStandardCobExpected: reimburses lesser of primary PR or (secondary allowed - primary paid)', () => {
      // Case A: Primary PR = $700, Secondary Allowed = $2,500, Primary Paid = $2,100
      // Secondary liability = $2,500 - $2,100 = $400. Expected = min($700, $400) = $400.00
      assert.equal(calculateStandardCobExpected(700, 2500, 2100), 400.00);

      // Case B: Primary PR = $300, Secondary Allowed = $2,800, Primary Paid = $2,000
      // Secondary liability = $800. Expected = min($300, $800) = $300.00
      assert.equal(calculateStandardCobExpected(300, 2800, 2000), 300.00);

      // Case C: Primary paid more than secondary allowed => $0.00
      assert.equal(calculateStandardCobExpected(500, 2000, 2400), 0.00);
    });

    test('calculateNonDuplicationExpected: pays positive difference only', () => {
      // Secondary allowed $1,600 - Primary paid $1,550 = $50.00
      assert.equal(calculateNonDuplicationExpected(1600, 1550), 50.00);

      // Secondary allowed $1,200 - Primary paid $1,500 = $0.00 (carve-out eliminates payment)
      assert.equal(calculateNonDuplicationExpected(1200, 1500), 0.00);
    });

    test('calculateExpectedSecondary: dynamically delegates to governing COB model', () => {
      assert.equal(calculateExpectedSecondary('MEDIGAP_SUPPLEMENT', 850, 4250, 3400, 0), 850.00);
      assert.equal(calculateExpectedSecondary('STANDARD_COB', 700, 2800, 2100, 2500), 400.00);
      assert.equal(calculateExpectedSecondary('NON_DUPLICATION_CARVEOUT', 400, 1950, 1550, 1600), 50.00);
    });
  });

  // ============================================================================
  // 3. PRIORITY SCORING & DEADLINE INVARIANTS
  // ============================================================================
  describe('3. 4-Factor Priority Scoring & Deadline Invariants', () => {
    test('calculateBalanceScore: scales against benchmark and caps at 100.00', () => {
      assert.equal(calculateBalanceScore(0, 1500), 0.00);
      assert.equal(calculateBalanceScore(750, 1500), 50.00);
      assert.equal(calculateBalanceScore(1500, 1500), 100.00);
      assert.equal(calculateBalanceScore(3000, 1500), 100.00); // capped
    });

    test('calculateFilingUrgencyScore: strictly adheres to timeline brackets', () => {
      assert.equal(calculateFilingUrgencyScore(10), 100.00); // <= 15 days (cliff)
      assert.equal(calculateFilingUrgencyScore(15), 100.00);
      assert.equal(calculateFilingUrgencyScore(22), 85.00);  // 16-30 days
      assert.equal(calculateFilingUrgencyScore(30), 85.00);
      assert.equal(calculateFilingUrgencyScore(45), 65.00);  // 31-60 days
      assert.equal(calculateFilingUrgencyScore(75), 40.00);  // 61-90 days
      assert.equal(calculateFilingUrgencyScore(120), 20.00); // > 90 days
      assert.equal(calculateFilingUrgencyScore(-10), 0.00);  // expired
    });

    test('calculateSecondaryPriorityScore: computes weighted sum accurately', () => {
      // 100 on all 4 dimensions => 100.00
      assert.equal(calculateSecondaryPriorityScore(100, 100, 100, 100), 100.00);

      // (50 * 0.35) + (85 * 0.30) + (100 * 0.20) + (70 * 0.15)
      // = 17.5 + 25.5 + 20.0 + 10.5 = 73.50
      assert.equal(calculateSecondaryPriorityScore(50, 85, 100, 70), 73.50);
    });

    test('Rule 2 Invariant: Expired secondary deadline (< 0 days) forces UNCOLLECTIBLE_HOLD', () => {
      assert.equal(classifySecondaryPriorityTier(92.00, -5), 'UNCOLLECTIBLE_HOLD');
      assert.equal(classifySecondaryPriorityTier(70.00, -20), 'UNCOLLECTIBLE_HOLD');
    });

    test('scoreSecondaryRecord: expired record sets urgency score 0.00 and tier UNCOLLECTIBLE_HOLD', () => {
      const expiredRecord = {
        secondary_expected_amount: 1200.00,
        days_until_filing_deadline: -14,
        coverage_certainty: 'VERIFIED_ACTIVE',
        filing_readiness: 'READY_CLEAN_EDI'
      };
      const scored = scoreSecondaryRecord(expiredRecord, 1500);
      assert.equal(scored.urgency_score, 0.00);
      assert.equal(scored.priority_tier, 'UNCOLLECTIBLE_HOLD');
    });
  });

  // ============================================================================
  // 4. WORKBENCH STATE MACHINE & PATIENT STATEMENT GUARDIAN
  // ============================================================================
  describe('4. Store Operations & Patient Statement Guardian', () => {
    let store;

    beforeEach(() => {
      store = new MissingSecondaryStore();
      store.resetToDefaults();
    });

    test('Rule 1 Invariant: Patient statements are held (suppressed) by default on active secondary cases', () => {
      const cases = store.getAllCases();
      const activeUnsubmitted = cases.filter(c => c.queue_status === 'READY_TO_FILE');
      assert.ok(activeUnsubmitted.length >= 2);
      activeUnsubmitted.forEach(c => {
        assert.equal(c.patient_statement_held, true, 'Patient statement must be held while secondary is unfiled');
      });
    });

    test('Rule 4 Invariant: Queue sorts by Tier Rank DESC, Expected Amount DESC, Days Left ASC', () => {
      const list = store.getAllCases();
      assert.ok(list.length >= 8);

      for (let i = 0; i < list.length - 1; i++) {
        const curr = list[i];
        const next = list[i + 1];
        const rankCurr = PRIORITY_TIERS[curr.priority_tier].rank;
        const rankNext = PRIORITY_TIERS[next.priority_tier].rank;

        if (rankCurr === rankNext) {
          if (curr.secondary_expected_amount === next.secondary_expected_amount) {
            assert.ok(curr.days_until_filing_deadline <= next.days_until_filing_deadline,
              'When rank and amount match, earlier filing deadline comes first');
          } else {
            assert.ok(curr.secondary_expected_amount >= next.secondary_expected_amount,
              'Within same tier, higher expected secondary recovery comes first');
          }
        } else {
          assert.ok(rankCurr >= rankNext, 'Higher tier rank must precede lower tier rank');
        }
      }
    });

    test('submitSecondaryClaim: transitions status to SUBMITTED and logs trace', () => {
      const updated = store.submitSecondaryClaim('msp-001', 'ELECTRONIC_EDI_837P', 'TRACE-10294');
      assert.equal(updated.queue_status, 'SUBMITTED');
      assert.equal(updated.clearinghouse_trace, 'TRACE-10294');
      assert.ok(updated.submitted_at);

      // Submitting on expired claim must throw
      assert.throws(() => {
        store.submitSecondaryClaim('msp-007', 'ELECTRONIC_EDI_837P');
      }, /expired/i);
    });

    test('markSecondaryRecovered: updates recovery amount and adjusts remaining patient balance', () => {
      // PR balance was $850, secondary recovered $850 => residual patient balance $0
      const updated = store.markSecondaryRecovered('msp-001', 850.00, 'CHK-99120');
      assert.equal(updated.queue_status, 'RECOVERED');
      assert.equal(updated.secondary_actual_paid_amount, 850.00);
      assert.equal(updated.remaining_patient_due, 0.00);
    });

    test('transferToPatient: requires documented justification and releases statement hold', () => {
      const updated = store.transferToPatient(
        'msp-003',
        'usr-sup-01',
        'Dr. Medical Director',
        'Secondary Commercial formal non-covered denial received and verified non-appealable.'
      );
      assert.equal(updated.queue_status, 'TRANSFERRED_TO_PATIENT');
      assert.equal(updated.patient_statement_held, false);
      assert.ok(updated.transferred_at);

      // Must throw if reason is too short
      assert.throws(() => {
        store.transferToPatient('msp-004', 'usr-sup-01', 'Sup', 'short');
      }, /justification/i);
    });

    test('generateCobClaimPacket: outputs complete 837P Loop 2320/2330 electronic payload', () => {
      const packet = store.generateCobClaimPacket('msp-001');
      assert.equal(packet.claimNumber, 'CLM-2026-09901');
      assert.equal(packet.ediFormat.loop2320_otherSubscriber.payerSequence, 'S');
      assert.equal(packet.ediFormat.loop2330_otherPayerAdjudication.paidAmount, 3400.00);
      assert.equal(packet.readyForTransmission, true);
    });

    test('getMetrics: calculates active inventory and held statement totals', () => {
      const metrics = store.getMetrics('fac-surgical-01');
      assert.ok(metrics.activeCasesCount > 0);
      assert.ok(metrics.totalExpectedRecovery > 0);
      assert.ok(metrics.statementsHeldCount > 0);
      assert.ok(metrics.heldAmount > 0);
      assert.ok(metrics.tierDistribution.CRITICAL_URGENT >= 1);
    });
  });

  // ============================================================================
  // 5. DATABASE MIGRATION SQL INTEGRITY (072)
  // ============================================================================
  describe('5. Database Migration SQL Integrity (072)', () => {
    const upMigrationPath = path.join(ROOT_DIR, 'supabase', 'migrations', '072_missing_secondary_payment.sql');
    const downMigrationPath = path.join(ROOT_DIR, 'supabase', 'migrations', '072_missing_secondary_payment_down.sql');

    test('up migration 072 exists and contains core tables, constraints, views, and 1:1 RLS policies', () => {
      assert.ok(fs.existsSync(upMigrationPath), '072 migration file must exist');
      const sql = fs.readFileSync(upMigrationPath, 'utf8');

      // Tables
      assert.ok(sql.includes('public.missing_secondary_payments'), 'Must create missing_secondary_payments table');
      assert.ok(sql.includes('public.secondary_cob_rules'), 'Must create secondary_cob_rules table');

      // Core Columns
      assert.ok(sql.includes('secondary_expected_amount'), 'Must include secondary_expected_amount column');
      assert.ok(sql.includes('secondary_cob_model'), 'Must include secondary_cob_model column');
      assert.ok(sql.includes('patient_statement_held'), 'Must include patient_statement_held column');
      assert.ok(sql.includes('days_until_filing_deadline'), 'Must include days_until_filing_deadline column');

      // Views
      assert.ok(sql.includes('vw_missing_secondary_active'), 'Must create active view');
      assert.ok(sql.includes('vw_missing_secondary_summary'), 'Must create summary view');

      // RLS Policies with 1:1 DROP POLICY IF EXISTS
      assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY;'), 'Must enable RLS');
      assert.ok(sql.includes('DROP POLICY IF EXISTS missing_secondary_payments_isolation'), 'Must drop existing policy 1:1');
      assert.ok(sql.includes('CREATE POLICY missing_secondary_payments_isolation'), 'Must create RLS policy');
    });

    test('down migration 072 exists and cleanly rolls back schema objects with CASCADE', () => {
      assert.ok(fs.existsSync(downMigrationPath), '072 down migration file must exist');
      const sql = fs.readFileSync(downMigrationPath, 'utf8');

      assert.ok(sql.includes('DROP POLICY IF EXISTS'), 'Must drop RLS policies');
      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_missing_secondary_summary CASCADE;'), 'Must drop summary view');
      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_missing_secondary_active CASCADE;'), 'Must drop active view');
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.secondary_cob_rules CASCADE;'), 'Must drop rules table');
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.missing_secondary_payments CASCADE;'), 'Must drop payments table');
    });
  });

  // ============================================================================
  // 6. CLINICAL DESIGN SYSTEM & APP WIRING
  // ============================================================================
  describe('6. Maestro Design System Governance & App Wiring', () => {
    test('strictly ZERO purple/violet/indigo/magenta tokens in JSX and CSS', () => {
      const jsxPath = path.join(ROOT_DIR, 'src', 'components', 'MissingSecondaryPaymentView.jsx');
      const cssPath = path.join(ROOT_DIR, 'src', 'components', 'MissingSecondaryPaymentView.css');

      assert.ok(fs.existsSync(jsxPath), 'JSX file must exist');
      assert.ok(fs.existsSync(cssPath), 'CSS file must exist');

      const prohibitedPattern = /purple|violet|indigo|magenta|fuchsia|#8b5cf6|#6366f1|#7c3aed|#a855f7|#d946ef/i;

      const jsxContent = fs.readFileSync(jsxPath, 'utf8');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      assert.ok(!prohibitedPattern.test(jsxContent), 'JSX must not contain any prohibited color tokens');
      assert.ok(!prohibitedPattern.test(cssContent), 'CSS must not contain any prohibited color tokens');
    });

    test('App.jsx correctly imports and registers MissingSecondaryPaymentView', () => {
      const appPath = path.join(ROOT_DIR, 'src', 'App.jsx');
      const appCode = fs.readFileSync(appPath, 'utf8');

      assert.ok(appCode.includes("import MissingSecondaryPaymentView from './components/MissingSecondaryPaymentView';"),
        'App.jsx must import MissingSecondaryPaymentView');
      assert.ok(appCode.includes("activeTab === 'missing_secondary'"),
        'App.jsx must register missing_secondary tab and menu');
      assert.ok(appCode.includes('<MissingSecondaryPaymentView />'),
        'App.jsx must render MissingSecondaryPaymentView component');
    });

    test('Phase 95 master specification document is authored and complete', () => {
      const specPath = path.join(ROOT_DIR, 'docs', 'phases', '95_MISSING_SECONDARY_PAYMENT.md');
      assert.ok(fs.existsSync(specPath), 'Phase 95 spec document must exist');
      const spec = fs.readFileSync(specPath, 'utf8');

      assert.ok(spec.includes('# 95 MISSING SECONDARY PAYMENT'), 'Must have title');
      assert.ok(spec.includes('MEDIGAP_SUPPLEMENT'), 'Must specify Medigap model');
      assert.ok(spec.includes('patient_statement_held'), 'Must specify statement suppression');
      assert.ok(spec.includes('CRITICAL_URGENT'), 'Must define priority tiers');
    });
  });

});
