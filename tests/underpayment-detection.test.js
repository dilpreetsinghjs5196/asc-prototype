import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import underpaymentService, {
  UNDERPAYMENT_CATEGORIES,
  UNDERPAYMENT_STATUSES,
  BASELINE_UNDERPAYMENTS,
  calculateUnderpaymentVariance,
  calculateUnderpaymentPercentage,
  calculateUnderpaymentPriorityScore,
  getUnderpaymentSummaryMetrics,
  getPayerUnderpaymentBreakdown,
  getCategoryUnderpaymentBreakdown
} from '../src/lib/underpaymentService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 93 — Underpayment Detection Engine Test Suite', () => {

  describe('1. Categories & Lifecycle Statuses Taxonomy', () => {
    test('should define all 6 underpayment categories with complete metadata', () => {
      const categories = Object.keys(UNDERPAYMENT_CATEGORIES);
      assert.strictEqual(categories.length, 6, 'Must define 6 underpayment categories');
      assert.ok(categories.includes('FEE_SCHEDULE_MISMATCH'));
      assert.ok(categories.includes('IMPLANT_CARVEOUT_UNPAID'));
      assert.ok(categories.includes('MPPR_OVER_DISCOUNT'));
      assert.ok(categories.includes('DEVICE_INTENSIVE_OFFSET_ERROR'));
      assert.ok(categories.includes('CONTRACT_RATE_EXPIRED'));
      assert.ok(categories.includes('BILATERAL_DISCOUNT_ERROR'));

      for (const cat of categories) {
        assert.ok(UNDERPAYMENT_CATEGORIES[cat].id, `Category ${cat} must have id`);
        assert.ok(UNDERPAYMENT_CATEGORIES[cat].label, `Category ${cat} must have label`);
        assert.ok(UNDERPAYMENT_CATEGORIES[cat].description, `Category ${cat} must have description`);
      }
    });

    test('should define all 5 underpayment lifecycle statuses', () => {
      const statuses = Object.keys(UNDERPAYMENT_STATUSES);
      assert.strictEqual(statuses.length, 5, 'Must define 5 lifecycle statuses');
      assert.ok(statuses.includes('DETECTED'));
      assert.ok(statuses.includes('AUDIT_CONFIRMED'));
      assert.ok(statuses.includes('DISPUTE_SUBMITTED'));
      assert.ok(statuses.includes('RECOVERED'));
      assert.ok(statuses.includes('DISMISSED_VALID_ADJUSTMENT'));
    });
  });

  describe('2. Deterministic Financial Calculations & Invariants', () => {
    test('should calculate underpayment variance accurately', () => {
      // 3850 - 2950 = 900.00
      assert.strictEqual(calculateUnderpaymentVariance(3850.00, 2950.00), 900.00);

      // 6200 - 3800 = 2400.00
      assert.strictEqual(calculateUnderpaymentVariance(6200.00, 3800.00), 2400.00);

      // Actual >= Expected should yield 0.00 (no underpayment)
      assert.strictEqual(calculateUnderpaymentVariance(2500.00, 2500.00), 0.00);
      assert.strictEqual(calculateUnderpaymentVariance(2500.00, 2600.00), 0.00);

      // Null / zero edge cases
      assert.strictEqual(calculateUnderpaymentVariance(0, 500.00), 0.00);
      assert.strictEqual(calculateUnderpaymentVariance(null, 500.00), 0.00);
    });

    test('should calculate percentage underpayment variance deterministically', () => {
      // (3850 - 2950) / 3850 = 900 / 3850 = 23.38%
      assert.strictEqual(calculateUnderpaymentPercentage(3850.00, 2950.00), 23.38);

      // (6200 - 3800) / 6200 = 2400 / 6200 = 38.71%
      assert.strictEqual(calculateUnderpaymentPercentage(6200.00, 3800.00), 38.71);

      // Edge cases
      assert.strictEqual(calculateUnderpaymentPercentage(0, 500.00), 0.00);
      assert.strictEqual(calculateUnderpaymentPercentage(2000.00, 2100.00), 0.00);
    });

    test('should compute composite underpayment priority score accurately', () => {
      // High variance ($2400), high confidence (98%), recent (10 days)
      const scoreHigh = calculateUnderpaymentPriorityScore(2400.00, 98.00, 10);
      // Dollar: (2400 / 3000) * 50 = 40.00
      // Conf: (98 / 100) * 30 = 29.40
      // Age: <= 30 days = 20.00
      // Total = 40.00 + 29.40 + 20.00 = 89.40
      assert.strictEqual(scoreHigh, 89.40);

      // Clamped to 100 max
      const scoreMax = calculateUnderpaymentPriorityScore(15000.00, 100.00, 5);
      assert.strictEqual(scoreMax, 100.00);

      // Older remittance (>60 days) gets lower age weight (4.00)
      const scoreOld = calculateUnderpaymentPriorityScore(600.00, 80.00, 75);
      // Dollar: (600 / 3000) * 50 = 10.00
      // Conf: (80 / 100) * 30 = 24.00
      // Age: > 60 days = 4.00
      // Total = 38.00
      assert.strictEqual(scoreOld, 38.00);
    });
  });

  describe('3. Summary Metrics & Payer Diagnostics', () => {
    test('should compute portfolio metrics across baseline underpayments', () => {
      const summary = getUnderpaymentSummaryMetrics(BASELINE_UNDERPAYMENTS);

      assert.strictEqual(summary.totalAlerts, BASELINE_UNDERPAYMENTS.length);
      assert.ok(summary.totalVarianceExposure > 5000.00, 'Total variance should exceed $5,000');
      assert.ok(summary.confirmedPipeline > 0.00, 'Confirmed pipeline should be > 0');
      assert.ok(summary.realizedDisputedCash > 0.00, 'Realized disputed cash should be > 0');
      assert.ok(summary.dismissedValidAdjustments > 0.00, 'Dismissed adjustments should be tracked');
    });

    test('should aggregate payer breakdown and sort descending by total variance', () => {
      const breakdown = getPayerUnderpaymentBreakdown(BASELINE_UNDERPAYMENTS);

      assert.ok(breakdown.length >= 4, 'Must aggregate across distinct payers');
      const totalAlerts = breakdown.reduce((sum, p) => sum + p.alert_count, 0);
      assert.strictEqual(totalAlerts, BASELINE_UNDERPAYMENTS.length);

      // Verify sorted descending
      for (let i = 0; i < breakdown.length - 1; i++) {
        assert.ok(breakdown[i].total_variance >= breakdown[i + 1].total_variance);
      }
    });

    test('should aggregate category breakdown for all 6 categories', () => {
      const breakdown = getCategoryUnderpaymentBreakdown(BASELINE_UNDERPAYMENTS);

      assert.strictEqual(breakdown.length, 6, 'Must produce breakdown for all 6 categories');
      const totalAlerts = breakdown.reduce((sum, b) => sum + b.count, 0);
      assert.strictEqual(totalAlerts, BASELINE_UNDERPAYMENTS.length);
    });
  });

  describe('4. Lifecycle State Machine Operations', () => {
    test('should confirm underpayment and transition to AUDIT_CONFIRMED', () => {
      const items = underpaymentService.getUnderpayments();
      const detected = items.find(u => u.status === 'DETECTED');
      assert.ok(detected, 'Must have at least one detected underpayment');

      const confirmed = underpaymentService.confirmUnderpayment(detected.id, {
        notes: 'Verified MAC device credit offset deduction is inaccurate'
      });

      assert.strictEqual(confirmed.status, 'AUDIT_CONFIRMED');
      assert.ok(confirmed.resolved_at !== null);
      assert.ok(confirmed.resolution_notes.includes('device credit'));
    });

    test('should submit dispute and transition to DISPUTE_SUBMITTED', () => {
      const items = underpaymentService.getUnderpayments();
      const confirmed = items.find(u => u.status === 'AUDIT_CONFIRMED');
      assert.ok(confirmed, 'Must have at least one confirmed underpayment');

      const disputed = underpaymentService.submitDispute(confirmed.id, {
        disputeReference: 'DSP-TEST-2026-999',
        notes: 'Transmitted contract amendment exhibit to payer appeals team'
      });

      assert.strictEqual(disputed.status, 'DISPUTE_SUBMITTED');
      assert.strictEqual(disputed.dispute_letter_reference, 'DSP-TEST-2026-999');
      assert.ok(disputed.disputed_at !== null);
    });

    test('should record recovery and transition to RECOVERED', () => {
      const items = underpaymentService.getUnderpayments();
      const disputed = items.find(u => u.status === 'DISPUTE_SUBMITTED');
      assert.ok(disputed, 'Must have at least one disputed underpayment');

      const recovered = underpaymentService.recordRecovery(disputed.id, {
        recoveredAmount: 2400.00,
        notes: 'Payer reprocessed claim and issued supplemental check'
      });

      assert.strictEqual(recovered.status, 'RECOVERED');
      assert.strictEqual(recovered.recovered_amount, 2400.00);
      assert.ok(recovered.resolution_notes.includes('$2400.00'));
    });

    test('should dismiss underpayment as valid adjustment and transition to DISMISSED_VALID_ADJUSTMENT', () => {
      const items = underpaymentService.getUnderpayments();
      const confirmed = items.find(u => u.status === 'AUDIT_CONFIRMED');
      assert.ok(confirmed, 'Must have at least one confirmed underpayment');

      const dismissed = underpaymentService.dismissUnderpayment(confirmed.id, {
        reason: 'CONTRACTUAL_AMENDMENT',
        notes: 'Verified contract amendment specifies lower fee floor'
      });

      assert.strictEqual(dismissed.status, 'DISMISSED_VALID_ADJUSTMENT');
      assert.ok(dismissed.resolution_notes.includes('CONTRACTUAL_AMENDMENT'));
    });

    test('should throw error when operating on non-existent underpayment ID', () => {
      assert.throws(() => {
        underpaymentService.confirmUnderpayment('non-existent-id-999');
      }, /not found/);
    });
  });

  describe('5. Database Migration Integrity (067_underpayment_detection.sql)', () => {
    const upMigrationPath = path.join(rootDir, 'supabase', 'migrations', '067_underpayment_detection.sql');
    const downMigrationPath = path.join(rootDir, 'supabase', 'migrations', '067_underpayment_detection_down.sql');

    test('should verify 067_underpayment_detection.sql exists and contains core tables, columns, and views', () => {
      assert.ok(fs.existsSync(upMigrationPath), '067_underpayment_detection.sql must exist');
      const sql = fs.readFileSync(upMigrationPath, 'utf8');

      // Core Tables
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.rcm_underpayment_rules'));
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.rcm_underpayments'));
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.rcm_underpayment_actions'));

      // Foreign Key Data Types
      assert.ok(sql.includes('surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id)'));
      assert.ok(sql.includes('patient_id BIGINT NOT NULL REFERENCES public.patients(id)'));
      assert.ok(sql.includes('facility_id UUID NOT NULL REFERENCES public.facilities(id)'));
      assert.ok(sql.includes('claim_id UUID NOT NULL REFERENCES public.claims(id)'));

      // Stored Generated Columns
      assert.ok(sql.includes('variance_amount NUMERIC(14,2) GENERATED ALWAYS AS'));
      assert.ok(sql.includes('variance_percentage NUMERIC(6,2) GENERATED ALWAYS AS'));
      assert.ok(sql.includes('STORED'));

      // Analytical Views
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_rcm_underpayments_active'));
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_rcm_underpayments_summary'));

      // 1:1 RLS Policy Parity
      const dropCount = (sql.match(/DROP POLICY IF EXISTS/g) || []).length;
      const createCount = (sql.match(/CREATE POLICY/g) || []).length;
      assert.strictEqual(dropCount, 3, 'Must drop 3 policies');
      assert.strictEqual(createCount, 3, 'Must create 3 policies');
      assert.strictEqual(dropCount, createCount, 'DROP and CREATE policy counts must match 1:1');
    });

    test('should verify 067_underpayment_detection_down.sql cleanly rolls back all schema objects', () => {
      assert.ok(fs.existsSync(downMigrationPath), '067_underpayment_detection_down.sql must exist');
      const sql = fs.readFileSync(downMigrationPath, 'utf8');

      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_rcm_underpayments_summary CASCADE;'));
      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_rcm_underpayments_active CASCADE;'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.rcm_underpayment_actions CASCADE;'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.rcm_underpayments CASCADE;'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.rcm_underpayment_rules CASCADE;'));
    });
  });

  describe('6. Maestro Clinical Design System Governance (Purple Ban)', () => {
    const cssPath = path.join(rootDir, 'src', 'components', 'UnderpaymentDetectionView.css');
    const jsxPath = path.join(rootDir, 'src', 'components', 'UnderpaymentDetectionView.jsx');

    test('should strictly forbid purple/violet/indigo/magenta/fuchsia tokens in UnderpaymentDetectionView.css', () => {
      assert.ok(fs.existsSync(cssPath), 'UnderpaymentDetectionView.css must exist');
      const rawCode = fs.readFileSync(cssPath, 'utf8');
      const code = rawCode.replace(/\/\*[\s\S]*?\*\//g, '');
      const forbiddenTokens = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];

      for (const token of forbiddenTokens) {
        const regex = new RegExp(`\\b${token}\\b`, 'i');
        assert.ok(!regex.test(code), `CSS must not contain forbidden token: ${token}`);
      }
    });

    test('should strictly forbid purple/violet/indigo/magenta/fuchsia tokens in UnderpaymentDetectionView.jsx', () => {
      assert.ok(fs.existsSync(jsxPath), 'UnderpaymentDetectionView.jsx must exist');
      const rawCode = fs.readFileSync(jsxPath, 'utf8');
      const code = rawCode.replace(/\/\*[\s\S]*?\*\//g, '');
      const forbiddenTokens = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];

      for (const token of forbiddenTokens) {
        const regex = new RegExp(`\\b${token}\\b`, 'i');
        assert.ok(!regex.test(code), `JSX must not contain forbidden token: ${token}`);
      }
    });
  });

  describe('7. Application Wiring & Master Documentation Completeness', () => {
    const appPath = path.join(rootDir, 'src', 'App.jsx');
    const specDocsPhasesPath = path.join(rootDir, 'docs', 'phases', '93_UNDERPAYMENT_DETECTION.md');

    test('should verify UnderpaymentDetectionView is registered in App.jsx', () => {
      const appCode = fs.readFileSync(appPath, 'utf8');

      // Import
      assert.ok(appCode.includes("import UnderpaymentDetectionView from './components/UnderpaymentDetectionView';"));

      // Sidebar menu item
      assert.ok(appCode.includes("activeTab === 'underpayments'"));
      assert.ok(appCode.includes("Underpayment Detection"));

      // Header title & subtitle
      assert.ok(appCode.includes("{activeTab === 'underpayments' && 'Contractual Underpayment Detection & Variance Recovery'}"));

      // Render block
      assert.ok(appCode.includes("<UnderpaymentDetectionView />"));
    });

    test('should verify Phase 93 master markdown specification exists and has required sections', () => {
      assert.ok(fs.existsSync(specDocsPhasesPath), 'Specification in docs/phases must exist');

      const specContent = fs.readFileSync(specDocsPhasesPath, 'utf8');
      assert.ok(specContent.includes('# 93 UNDERPAYMENT DETECTION'));
      assert.ok(specContent.includes('## Purpose'));
      assert.ok(specContent.includes('## Scope'));
      assert.ok(specContent.includes('## Current State'));
      assert.ok(specContent.includes('## Target State'));
      assert.ok(specContent.includes('## Data Model / Schema'));
      assert.ok(specContent.includes('## Business Rules'));
      assert.ok(specContent.includes('## Permissions / Security'));
      assert.ok(specContent.includes('## API / Service Requirements'));
      assert.ok(specContent.includes('## UI / Workflow Requirements'));
      assert.ok(specContent.includes('## Audit / Provenance'));
      assert.ok(specContent.includes('## QA / Test Cases'));
      assert.ok(specContent.includes('## Acceptance Criteria'));
    });
  });
});
