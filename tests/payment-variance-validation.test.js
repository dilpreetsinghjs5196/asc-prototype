import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import paymentVarianceValidationService, {
  VALIDATION_STATUSES,
  CONFIDENCE_LEVELS,
  BASELINE_PAYMENT_VARIANCES,
  calculateVarianceAmount,
  calculateVariancePercentage,
  evaluateValidationOutcome,
  getValidationSummaryMetrics,
  getOutcomeDistribution
} from '../src/lib/paymentVarianceValidationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 93A — Payment Variance Validation Engine Test Suite', () => {

  describe('1. 12-State Validation Taxonomy & Confidence Levels', () => {
    test('should define all 12 deterministic validation outcome states', () => {
      const statuses = Object.keys(VALIDATION_STATUSES);
      assert.strictEqual(statuses.length, 12, 'Must define exactly 12 validation outcome states');

      assert.ok(statuses.includes('VALID_UNDERPAYMENT'));
      assert.ok(statuses.includes('VALID_CONTRACTUAL_ADJUSTMENT'));
      assert.ok(statuses.includes('PATIENT_RESPONSIBILITY'));
      assert.ok(statuses.includes('SECONDARY_PAYER_PENDING'));
      assert.ok(statuses.includes('CASE_RATE_OR_BUNDLED'));
      assert.ok(statuses.includes('MPPR_OR_MULTIPLE_PROCEDURE_REDUCTION'));
      assert.ok(statuses.includes('CODING_OR_MODIFIER_REVIEW'));
      assert.ok(statuses.includes('IMPLANT_CARVEOUT_REVIEW'));
      assert.ok(statuses.includes('COB_OR_OTHER_PAYER_REVIEW'));
      assert.ok(statuses.includes('PAYMENT_POSTING_OR_RECONCILIATION_ISSUE'));
      assert.ok(statuses.includes('INSUFFICIENT_DATA'));
      assert.ok(statuses.includes('NEEDS_MANUAL_REVIEW'));

      // Verify recovery eligibility flags
      assert.strictEqual(VALIDATION_STATUSES.VALID_UNDERPAYMENT.isRecoveryEligible, true);
      assert.strictEqual(VALIDATION_STATUSES.IMPLANT_CARVEOUT_REVIEW.isRecoveryEligible, true);
      assert.strictEqual(VALIDATION_STATUSES.VALID_CONTRACTUAL_ADJUSTMENT.isRecoveryEligible, false);
      assert.strictEqual(VALIDATION_STATUSES.PATIENT_RESPONSIBILITY.isRecoveryEligible, false);
      assert.strictEqual(VALIDATION_STATUSES.MPPR_OR_MULTIPLE_PROCEDURE_REDUCTION.isRecoveryEligible, false);
    });

    test('should define all 4 statutory confidence levels without arbitrary probabilities', () => {
      const levels = Object.keys(CONFIDENCE_LEVELS);
      assert.strictEqual(levels.length, 4, 'Must define exactly 4 confidence levels');
      assert.ok(levels.includes('HIGH'));
      assert.ok(levels.includes('MEDIUM'));
      assert.ok(levels.includes('LOW'));
      assert.ok(levels.includes('UNKNOWN'));
    });
  });

  describe('2. Deterministic Financial & Variance Formulae', () => {
    test('should calculate variance amount as expected_allowed - actual_allowed', () => {
      // 3850.00 - 2950.00 = 900.00
      assert.strictEqual(calculateVarianceAmount(3850.00, 2950.00), 900.00);

      // 6200.00 - 3800.00 = 2400.00
      assert.strictEqual(calculateVarianceAmount(6200.00, 3800.00), 2400.00);

      // Edge cases
      assert.strictEqual(calculateVarianceAmount(1500.00, 1500.00), 0.00);
      assert.strictEqual(calculateVarianceAmount(0, 100.00), -100.00);
      assert.strictEqual(calculateVarianceAmount(null, 0), 0.00);
    });

    test('should calculate variance percentage relative to expected allowable', () => {
      // (900 / 3850) * 100 = 23.38%
      assert.strictEqual(calculateVariancePercentage(3850.00, 2950.00), 23.38);

      // (2400 / 6200) * 100 = 38.71%
      assert.strictEqual(calculateVariancePercentage(6200.00, 3800.00), 38.71);

      // Zero denominator check
      assert.strictEqual(calculateVariancePercentage(0, 500.00), 0.00);
    });
  });

  describe('3. 10-Step Deterministic Validation Rule Engine', () => {
    test('should assign INSUFFICIENT_DATA and UNKNOWN confidence when contract or 835 is missing', () => {
      const result = evaluateValidationOutcome(2000.00, 1500.00, {
        contract_version_id: null,
        plan_id: 'pln-1',
        source_835_id: '835-1'
      });

      assert.strictEqual(result.status, 'INSUFFICIENT_DATA');
      assert.strictEqual(result.confidence, 'UNKNOWN');
      assert.strictEqual(result.isRecoveryEligible, false);
      assert.strictEqual(result.completenessScore, 40.00);
    });

    test('should classify SECONDARY_PAYER_PENDING when secondary crossover is confirmed', () => {
      const result = evaluateValidationOutcome(4400.00, 3520.00, {
        contract_version_id: 'cv-1',
        plan_id: 'pln-1',
        source_835_id: '835-1',
        has_secondary_payer: true,
        secondary_forwarded: true
      });

      assert.strictEqual(result.status, 'SECONDARY_PAYER_PENDING');
      assert.strictEqual(result.confidence, 'HIGH');
      assert.strictEqual(result.isRecoveryEligible, false);
    });

    test('should isolate PATIENT_RESPONSIBILITY when variance matches deductible/co-insurance', () => {
      const result = evaluateValidationOutcome(1120.00, 1120.00, {
        contract_version_id: 'cv-1',
        plan_id: 'pln-1',
        source_835_id: '835-1',
        patient_responsibility: 224.00 // Medicare Part B 20%
      });

      assert.strictEqual(result.status, 'VALID_CONTRACTUAL_ADJUSTMENT'); // variance is 0
      
      const resultWithPRVariance = evaluateValidationOutcome(1120.00, 896.00, {
        contract_version_id: 'cv-1',
        plan_id: 'pln-1',
        source_835_id: '835-1',
        patient_responsibility: 224.00
      });
      assert.strictEqual(resultWithPRVariance.status, 'PATIENT_RESPONSIBILITY');
      assert.strictEqual(resultWithPRVariance.confidence, 'HIGH');
      assert.strictEqual(resultWithPRVariance.isRecoveryEligible, false);
    });

    test('should recognize legitimate MPPR 50% statutory reduction on secondary procedure', () => {
      const result = evaluateValidationOutcome(2550.00, 1275.00, {
        contract_version_id: 'cv-1',
        plan_id: 'pln-1',
        source_835_id: '835-1',
        is_secondary_procedure: true,
        mppr_applied: true
      });

      assert.strictEqual(result.status, 'MPPR_OR_MULTIPLE_PROCEDURE_REDUCTION');
      assert.strictEqual(result.confidence, 'HIGH');
      assert.strictEqual(result.isRecoveryEligible, false);
    });

    test('should flag IMPLANT_CARVEOUT_REVIEW when manufacturer invoice is unattached', () => {
      const result = evaluateValidationOutcome(2400.00, 0.00, {
        contract_version_id: 'cv-1',
        plan_id: 'pln-1',
        source_835_id: '835-1',
        is_implant_carveout: true,
        implant_invoice_attached: false
      });

      assert.strictEqual(result.status, 'IMPLANT_CARVEOUT_REVIEW');
      assert.strictEqual(result.confidence, 'MEDIUM');
      assert.strictEqual(result.isRecoveryEligible, true);
    });

    test('should confirm VALID_UNDERPAYMENT when contract is violated without legitimate adjustment', () => {
      const result = evaluateValidationOutcome(3850.00, 2950.00, {
        contract_version_id: 'cv-1',
        plan_id: 'pln-1',
        source_835_id: '835-1',
        contract_rate_authoritative: true
      });

      assert.strictEqual(result.status, 'VALID_UNDERPAYMENT');
      assert.strictEqual(result.confidence, 'HIGH');
      assert.strictEqual(result.isRecoveryEligible, true);
      assert.strictEqual(result.completenessScore, 98.00);
    });
  });

  describe('4. Portfolio Metrics & Outcome Distribution', () => {
    test('should aggregate summary metrics separating valid underpayments from allowances', () => {
      const summary = getValidationSummaryMetrics(BASELINE_PAYMENT_VARIANCES);

      assert.strictEqual(summary.totalVariances, BASELINE_PAYMENT_VARIANCES.length);
      assert.ok(summary.totalVarianceAmount > 5000.00);
      assert.ok(summary.validUnderpaymentAmount > 0.00);
      assert.ok(summary.contractualAllowanceAmount > 0.00);
      assert.ok(summary.patientLiabilityAmount > 0.00);
      assert.ok(summary.pendingReviewAmount > 0.00);
    });

    test('should produce 12-state outcome distribution breakdown', () => {
      const distribution = getOutcomeDistribution(BASELINE_PAYMENT_VARIANCES);
      assert.strictEqual(distribution.length, 12, 'Must cover all 12 validation categories');

      const totalVariances = distribution.reduce((sum, d) => sum + d.count, 0);
      assert.strictEqual(totalVariances, BASELINE_PAYMENT_VARIANCES.length);
    });
  });

  describe('5. Lifecycle State Machine & Human Review Controls', () => {
    test('should re-evaluate and update payment variance record', () => {
      const variances = paymentVarianceValidationService.getVariances();
      const underpay = variances.find(pv => pv.validation_status === 'VALID_UNDERPAYMENT');
      assert.ok(underpay);

      const updated = paymentVarianceValidationService.validateVariance(underpay.id, {
        notes: 'Re-validated against 2026 contract fee amendment'
      });

      assert.strictEqual(updated.validation_status, 'VALID_UNDERPAYMENT');
      assert.ok(updated.validated_at !== null);
      assert.ok(updated.resolution_notes.includes('Re-validated'));
    });

    test('should advance recovery-eligible variance to recovery work queue', () => {
      const variances = paymentVarianceValidationService.getVariances();
      const eligible = variances.find(pv => pv.validation_status === 'VALID_UNDERPAYMENT');
      assert.ok(eligible);

      const advanced = paymentVarianceValidationService.advanceToRecovery(eligible.id, {
        notes: 'Transmitted to billing dispute specialist'
      });

      assert.ok(advanced.resolution_notes.includes('Advanced to Recovery Evidence Worklist'));
    });

    test('should forbid advancing non-recovery-eligible variance to recovery queue', () => {
      const variances = paymentVarianceValidationService.getVariances();
      const nonEligible = variances.find(pv => pv.validation_status === 'MPPR_OR_MULTIPLE_PROCEDURE_REDUCTION');
      assert.ok(nonEligible);

      assert.throws(() => {
        paymentVarianceValidationService.advanceToRecovery(nonEligible.id, { notes: 'Should fail' });
      }, /Cannot advance status/);
    });

    test('should flag variance for manual supervisor review with auditable reason', () => {
      const variances = paymentVarianceValidationService.getVariances();
      const first = variances[0];

      const flagged = paymentVarianceValidationService.flagManualReview(first.id, {
        reason: 'CODER_QUERY',
        notes: 'Discrepancy in operative note laterality vs claim modifier'
      });

      assert.strictEqual(flagged.validation_status, 'NEEDS_MANUAL_REVIEW');
      assert.ok(flagged.resolution_notes.includes('CODER_QUERY'));
    });

    test('should dismiss variance with mandatory justification notes', () => {
      const variances = paymentVarianceValidationService.getVariances();
      const second = variances[1];

      const dismissed = paymentVarianceValidationService.dismissVariance(second.id, {
        reason: 'CONTRACTUAL_ALLOWANCE',
        notes: 'Verified against signed contract exhibit schedule B'
      });

      assert.strictEqual(dismissed.validation_status, 'VALID_CONTRACTUAL_ADJUSTMENT');
      assert.ok(dismissed.resolution_notes.includes('CONTRACTUAL_ALLOWANCE'));
    });
  });

  describe('6. Database Migration Integrity (068_payment_variance_validation.sql)', () => {
    const upMigrationPath = path.join(rootDir, 'supabase', 'migrations', '068_payment_variance_validation.sql');
    const downMigrationPath = path.join(rootDir, 'supabase', 'migrations', '068_payment_variance_validation_down.sql');

    test('should verify 068_payment_variance_validation.sql exists and contains core tables and views', () => {
      assert.ok(fs.existsSync(upMigrationPath), '068_payment_variance_validation.sql must exist');
      const sql = fs.readFileSync(upMigrationPath, 'utf8');

      // Core Tables
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.payment_variances'));
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.payment_variance_lines'));
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.payment_variance_rule_evaluations'));

      // Foreign Key Data Types
      assert.ok(sql.includes('case_id BIGINT REFERENCES public.surgeries(id)'));
      assert.ok(sql.includes('claim_id UUID NOT NULL REFERENCES public.claims(id)'));
      assert.ok(sql.includes('facility_id UUID NOT NULL REFERENCES public.facilities(id)'));
      assert.ok(sql.includes('payment_variance_id UUID NOT NULL REFERENCES public.payment_variances(id)'));

      // Analytical Views
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_payment_variances_active'));
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_payment_variance_validation_summary'));

      // 1:1 RLS Policy Parity
      const dropCount = (sql.match(/DROP POLICY IF EXISTS/g) || []).length;
      const createCount = (sql.match(/CREATE POLICY/g) || []).length;
      assert.strictEqual(dropCount, 3, 'Must drop 3 policies');
      assert.strictEqual(createCount, 3, 'Must create 3 policies');
      assert.strictEqual(dropCount, createCount, 'DROP and CREATE policy counts must match 1:1');
    });

    test('should verify 068_payment_variance_validation_down.sql cleanly rolls back all schema objects', () => {
      assert.ok(fs.existsSync(downMigrationPath), '068_payment_variance_validation_down.sql must exist');
      const sql = fs.readFileSync(downMigrationPath, 'utf8');

      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_payment_variance_validation_summary CASCADE;'));
      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_payment_variances_active CASCADE;'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.payment_variance_rule_evaluations CASCADE;'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.payment_variance_lines CASCADE;'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.payment_variances CASCADE;'));
    });
  });

  describe('7. Maestro Clinical Design System Governance (Purple Ban)', () => {
    const cssPath = path.join(rootDir, 'src', 'components', 'PaymentVarianceValidationView.css');
    const jsxPath = path.join(rootDir, 'src', 'components', 'PaymentVarianceValidationView.jsx');

    test('should strictly forbid purple/violet/indigo/magenta/fuchsia tokens in PaymentVarianceValidationView.css', () => {
      assert.ok(fs.existsSync(cssPath), 'PaymentVarianceValidationView.css must exist');
      const rawCode = fs.readFileSync(cssPath, 'utf8');
      const code = rawCode.replace(/\/\*[\s\S]*?\*\//g, '');
      const forbiddenTokens = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];

      for (const token of forbiddenTokens) {
        const regex = new RegExp(`\\b${token}\\b`, 'i');
        assert.ok(!regex.test(code), `CSS must not contain forbidden token: ${token}`);
      }
    });

    test('should strictly forbid purple/violet/indigo/magenta/fuchsia tokens in PaymentVarianceValidationView.jsx', () => {
      assert.ok(fs.existsSync(jsxPath), 'PaymentVarianceValidationView.jsx must exist');
      const rawCode = fs.readFileSync(jsxPath, 'utf8');
      const code = rawCode.replace(/\/\*[\s\S]*?\*\//g, '');
      const forbiddenTokens = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];

      for (const token of forbiddenTokens) {
        const regex = new RegExp(`\\b${token}\\b`, 'i');
        assert.ok(!regex.test(code), `JSX must not contain forbidden token: ${token}`);
      }
    });
  });

  describe('8. Application Wiring & Master Documentation Completeness', () => {
    const appPath = path.join(rootDir, 'src', 'App.jsx');
    const specDocsPhasesPath = path.join(rootDir, 'docs', 'phases', '93A_PAYMENT_VARIANCE_VALIDATION.md');

    test('should verify PaymentVarianceValidationView is registered in App.jsx', () => {
      const appCode = fs.readFileSync(appPath, 'utf8');

      // Import
      assert.ok(appCode.includes("import PaymentVarianceValidationView from './components/PaymentVarianceValidationView';"));

      // Sidebar menu item
      assert.ok(appCode.includes("activeTab === 'variance_validation'"));
      assert.ok(appCode.includes("Variance Validation"));

      // Header title & subtitle
      assert.ok(appCode.includes("{activeTab === 'variance_validation' && 'Payment Variance Validation & Contract Lineage'}"));

      // Render block
      assert.ok(appCode.includes("<PaymentVarianceValidationView />"));
    });

    test('should verify Phase 93A master markdown specification exists and has required sections', () => {
      assert.ok(fs.existsSync(specDocsPhasesPath), 'Specification in docs/phases must exist');

      const specContent = fs.readFileSync(specDocsPhasesPath, 'utf8');
      assert.ok(specContent.includes('# 93A PAYMENT VARIANCE VALIDATION'));
      assert.ok(specContent.includes('## Purpose'));
      assert.ok(specContent.includes('## Scope'));
      assert.ok(specContent.includes('## Current State'));
      assert.ok(specContent.includes('## Target State'));
      assert.ok(specContent.includes('## Data Model / Schema'));
      assert.ok(specContent.includes('## Business Rules'));
      assert.ok(specContent.includes('## Permissions & RBAC') || specContent.includes('## Permissions / Security'));
      assert.ok(specContent.includes('## API & Service Requirements') || specContent.includes('## API / Service Requirements'));
      assert.ok(specContent.includes('## UI & Workflow Requirements') || specContent.includes('## UI / Workflow Requirements'));
      assert.ok(specContent.includes('## Audit & Provenance') || specContent.includes('## Audit / Provenance'));
      assert.ok(specContent.includes('## Acceptance Criteria'));
    });
  });
});
