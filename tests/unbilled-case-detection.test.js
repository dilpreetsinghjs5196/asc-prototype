import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import unbilledCaseService, {
  HOLD_REASONS,
  UNBILLED_STATUSES,
  TIMELY_FILING_RISK_TIERS,
  AGING_BUCKETS,
  BASELINE_UNBILLED_CASES,
  calculateDaysUnbilled,
  calculateDaysRemaining,
  calculateTimelyFilingRiskTier,
  calculatePriorityScore,
  getUnbilledSummaryMetrics,
  getAgingBucketSummary,
  getHoldReasonBreakdown
} from '../src/lib/unbilledCaseService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 91 — Unbilled Case Detection Engine Test Suite', () => {

  describe('1. Hold Reasons, Lifecycle Statuses & Risk Tiers', () => {
    test('should define all 7 unbilled hold reasons with descriptions', () => {
      const reasons = Object.keys(HOLD_REASONS);
      assert.strictEqual(reasons.length, 7, 'Must define 7 hold reasons');
      assert.ok(reasons.includes('IMPLANT_INVOICE_LAG'));
      assert.ok(reasons.includes('PHYSICIAN_QUERY_PENDING'));
      assert.ok(reasons.includes('PATHOLOGY_PENDING'));
      assert.ok(reasons.includes('AUTH_RETRO_PENDING'));
      assert.ok(reasons.includes('COB_VALIDATION'));
      assert.ok(reasons.includes('BILLING_SCRUB_ERROR'));
      assert.ok(reasons.includes('READY_TO_RELEASE'));
    });

    test('should define all 5 unbilled case lifecycle statuses', () => {
      const statuses = Object.keys(UNBILLED_STATUSES);
      assert.strictEqual(statuses.length, 5, 'Must define 5 lifecycle statuses');
      assert.ok(statuses.includes('HELD'));
      assert.ok(statuses.includes('UNDER_INVESTIGATION'));
      assert.ok(statuses.includes('HOLD_RESOLVED'));
      assert.ok(statuses.includes('CLAIM_RELEASED'));
      assert.ok(statuses.includes('WRITTEN_OFF_TIMELY_FILING'));
    });

    test('should define all 4 statutory timely filing risk tiers', () => {
      const tiers = Object.keys(TIMELY_FILING_RISK_TIERS);
      assert.strictEqual(tiers.length, 4, 'Must define 4 risk tiers');
      assert.ok(tiers.includes('CRITICAL'));
      assert.ok(tiers.includes('URGENT'));
      assert.ok(tiers.includes('WARNING'));
      assert.ok(tiers.includes('NORMAL'));
    });

    test('should define all 4 standard unbilled aging buckets', () => {
      const buckets = Object.keys(AGING_BUCKETS);
      assert.strictEqual(buckets.length, 4, 'Must define 4 aging buckets');
      assert.ok(buckets.includes('0_15_DAYS'));
      assert.ok(buckets.includes('16_30_DAYS'));
      assert.ok(buckets.includes('31_60_DAYS'));
      assert.ok(buckets.includes('61_PLUS_DAYS'));
    });
  });

  describe('2. Deterministic Financial & Aging Calculations', () => {
    test('should calculate days unbilled accurately from DOS', () => {
      const ref = new Date('2026-11-10T12:00:00Z');
      const dos = '2026-10-31'; // 10 days ago
      const days = calculateDaysUnbilled(dos, ref);
      assert.strictEqual(days, 10);

      // Future/today edge cases
      assert.strictEqual(calculateDaysUnbilled('2026-11-10', ref), 0);
      assert.strictEqual(calculateDaysUnbilled(null, ref), 0);
    });

    test('should calculate days remaining to timely filing cutoff', () => {
      const ref = new Date('2026-11-10T12:00:00Z');
      const deadline = '2026-11-20'; // 10 days remaining
      const rem = calculateDaysRemaining(deadline, ref);
      assert.strictEqual(rem, 10);
    });

    test('should classify timely filing risk tiers deterministically', () => {
      assert.strictEqual(calculateTimelyFilingRiskTier(5), 'CRITICAL', '<=15 days must be CRITICAL');
      assert.strictEqual(calculateTimelyFilingRiskTier(15), 'CRITICAL', '15 days must be CRITICAL');
      assert.strictEqual(calculateTimelyFilingRiskTier(16), 'URGENT', '16 days must be URGENT');
      assert.strictEqual(calculateTimelyFilingRiskTier(30), 'URGENT', '30 days must be URGENT');
      assert.strictEqual(calculateTimelyFilingRiskTier(45), 'WARNING', '45 days must be WARNING');
      assert.strictEqual(calculateTimelyFilingRiskTier(75), 'NORMAL', '>60 days must be NORMAL');
    });

    test('should compute composite priority score accurately', () => {
      // High dollar ($8k), high lag (45d), critical deadline (10d)
      const scoreHigh = calculatePriorityScore(8000.00, 45, 10);
      assert.ok(scoreHigh >= 80.0, `Priority should be high, got ${scoreHigh}`);

      // Clamped to 100.0 max
      const scoreMax = calculatePriorityScore(50000.00, 120, 2);
      assert.strictEqual(scoreMax, 100.00, 'Score must be clamped at 100.00');

      // Low score
      const scoreLow = calculatePriorityScore(1000.00, 5, 85);
      assert.ok(scoreLow < 25.0, `Priority should be low, got ${scoreLow}`);
    });
  });

  describe('3. Summary Metrics & Diagnostic Aggregation', () => {
    test('should compute portfolio metrics across baseline unbilled cases', () => {
      const ref = new Date('2026-11-10T12:00:00Z');
      const summary = getUnbilledSummaryMetrics(BASELINE_UNBILLED_CASES, ref);

      assert.strictEqual(summary.totalCases, BASELINE_UNBILLED_CASES.length);
      assert.ok(summary.totalGrossCharges > 50000.00);
      assert.ok(summary.totalExpectedRevenue > 20000.00);
      assert.ok(summary.criticalExposureDollars > 0.00);
      assert.ok(summary.avgDaysUnbilled > 0);
    });

    test('should aggregate aging buckets across all 4 intervals', () => {
      const ref = new Date('2026-11-10T12:00:00Z');
      const buckets = getAgingBucketSummary(BASELINE_UNBILLED_CASES, ref);

      assert.strictEqual(buckets.length, 4);
      const totalCount = buckets.reduce((sum, b) => sum + b.count, 0);
      assert.strictEqual(totalCount, BASELINE_UNBILLED_CASES.length);
    });

    test('should produce root-cause hold reason diagnostic breakdown', () => {
      const breakdown = getHoldReasonBreakdown(BASELINE_UNBILLED_CASES);
      assert.ok(breakdown.length >= 7);

      const implantLag = breakdown.find(b => b.id === 'IMPLANT_INVOICE_LAG');
      assert.ok(implantLag);
      assert.ok(implantLag.count >= 2);
      assert.ok(implantLag.expectedRevenue > 10000.00);
    });
  });

  describe('4. Lifecycle State Machine Operations', () => {
    test('should resolve hold and transition case to HOLD_RESOLVED', () => {
      const cases = unbilledCaseService.getCases();
      const heldCase = cases.find(c => c.unbilled_status === 'HELD');
      assert.ok(heldCase, 'Must have at least one held case');

      const resolved = unbilledCaseService.resolveHold(heldCase.id, {
        resolutionReason: 'READY_TO_RELEASE',
        notes: 'Stryker invoice #9941 attached to electronic record'
      });

      assert.strictEqual(resolved.unbilled_status, 'HOLD_RESOLVED');
      assert.strictEqual(resolved.hold_reason, 'READY_TO_RELEASE');
      assert.ok(resolved.resolution_notes.includes('invoice #9941'));
    });

    test('should release claim and transition to CLAIM_RELEASED', () => {
      const cases = unbilledCaseService.getCases();
      const readyCase = cases.find(c => c.unbilled_status === 'HOLD_RESOLVED');
      assert.ok(readyCase, 'Must have at least one case ready for release');

      const released = unbilledCaseService.releaseClaim(readyCase.id, {
        claimControlNumber: 'CCN-837-55012',
        notes: 'Claim transmitted via clearinghouse 837 batch #842'
      });

      assert.strictEqual(released.unbilled_status, 'CLAIM_RELEASED');
      assert.ok(released.released_at !== null);
      assert.ok(released.resolution_notes.includes('CCN-837-55012'));
    });

    test('should write off expired claim with authorized justification', () => {
      const cases = unbilledCaseService.getCases();
      const heldCase = cases.find(c => c.unbilled_status === 'HELD');
      assert.ok(heldCase);

      const writtenOff = unbilledCaseService.writeOffExpired(heldCase.id, {
        justification: 'EXPIRED_TFL',
        notes: 'CFO authorized write-off due to missed 90-day filing cutoff'
      });

      assert.strictEqual(writtenOff.unbilled_status, 'WRITTEN_OFF_TIMELY_FILING');
      assert.ok(writtenOff.resolution_notes.includes('EXPIRED_TFL'));
    });
  });

  describe('5. Database Migration Integrity (065_unbilled_case_detection.sql)', () => {
    const upMigrationPath = path.join(rootDir, 'supabase', 'migrations', '065_unbilled_case_detection.sql');
    const downMigrationPath = path.join(rootDir, 'supabase', 'migrations', '065_unbilled_case_detection_down.sql');

    test('should verify 065_unbilled_case_detection.sql exists and contains core tables and views', () => {
      assert.ok(fs.existsSync(upMigrationPath), '065_unbilled_case_detection.sql must exist');
      const sql = fs.readFileSync(upMigrationPath, 'utf8');

      // Core Tables
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.rcm_unbilled_cases'));
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.rcm_unbilled_case_actions'));

      // Foreign Key Data Types
      assert.ok(sql.includes('surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id)'));
      assert.ok(sql.includes('patient_id BIGINT NOT NULL REFERENCES public.patients(id)'));
      assert.ok(sql.includes('facility_id UUID NOT NULL REFERENCES public.facilities(id)'));
      assert.ok(sql.includes('released_claim_id UUID REFERENCES public.claims(id)'));

      // Analytical Views
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_rcm_unbilled_cases_active'));
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_rcm_unbilled_aging_summary'));

      // 1:1 RLS Policy Parity
      const dropCount = (sql.match(/DROP POLICY IF EXISTS/g) || []).length;
      const createCount = (sql.match(/CREATE POLICY/g) || []).length;
      assert.strictEqual(dropCount, 2, 'Must drop 2 policies');
      assert.strictEqual(createCount, 2, 'Must create 2 policies');
      assert.strictEqual(dropCount, createCount, 'DROP and CREATE policy counts must match 1:1');
    });

    test('should verify 065_unbilled_case_detection_down.sql cleanly rolls back all schema objects', () => {
      assert.ok(fs.existsSync(downMigrationPath), '065_unbilled_case_detection_down.sql must exist');
      const sql = fs.readFileSync(downMigrationPath, 'utf8');

      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_rcm_unbilled_aging_summary CASCADE;'));
      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_rcm_unbilled_cases_active CASCADE;'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.rcm_unbilled_case_actions CASCADE;'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.rcm_unbilled_cases CASCADE;'));
    });
  });

  describe('6. Maestro Clinical Design System Governance (Purple Ban)', () => {
    const cssPath = path.join(rootDir, 'src', 'components', 'UnbilledCaseDetectionView.css');
    const jsxPath = path.join(rootDir, 'src', 'components', 'UnbilledCaseDetectionView.jsx');

    test('should strictly forbid purple/violet/indigo/magenta/fuchsia tokens in UnbilledCaseDetectionView.css', () => {
      assert.ok(fs.existsSync(cssPath), 'UnbilledCaseDetectionView.css must exist');
      const rawCode = fs.readFileSync(cssPath, 'utf8');
      const code = rawCode.replace(/\/\*[\s\S]*?\*\//g, '');
      const forbiddenTokens = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];

      for (const token of forbiddenTokens) {
        const regex = new RegExp(`\\b${token}\\b`, 'i');
        assert.ok(!regex.test(code), `CSS must not contain forbidden token: ${token}`);
      }
    });

    test('should strictly forbid purple/violet/indigo/magenta/fuchsia tokens in UnbilledCaseDetectionView.jsx', () => {
      assert.ok(fs.existsSync(jsxPath), 'UnbilledCaseDetectionView.jsx must exist');
      const rawCode = fs.readFileSync(jsxPath, 'utf8');
      const code = rawCode.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
      const forbiddenTokens = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];

      for (const token of forbiddenTokens) {
        const regex = new RegExp(`\\b${token}\\b`, 'i');
        assert.ok(!regex.test(code), `JSX must not contain forbidden token: ${token}`);
      }
    });
  });

  describe('7. Application Routing & Master Specification Completeness', () => {
    test('should verify UnbilledCaseDetectionView is wired into src/App.jsx', () => {
      const appJsxPath = path.join(rootDir, 'src', 'App.jsx');
      assert.ok(fs.existsSync(appJsxPath), 'App.jsx must exist');
      const appCode = fs.readFileSync(appJsxPath, 'utf8');

      assert.ok(appCode.includes("import UnbilledCaseDetectionView from './components/UnbilledCaseDetectionView'"));
      assert.ok(appCode.includes("activeTab === 'unbilled_cases'"));
      assert.ok(appCode.includes('<UnbilledCaseDetectionView />'));
    });

    test('should verify 91_UNBILLED_CASE_DETECTION.md specification exists and has all required sections', () => {
      const specPath = path.join(rootDir, '..', 'ASCANALYST_All_Modules', 'ASCANALYST_MD_SPECS', 'Phase_09_Revenue_Leakage', '91_UNBILLED_CASE_DETECTION.md');
      assert.ok(fs.existsSync(specPath), 'Specification file must exist');
      const specContent = fs.readFileSync(specPath, 'utf8');

      const requiredSections = [
        '# 91 UNBILLED CASE DETECTION',
        '## Purpose',
        '## Scope',
        '## Current State',
        '## Target State',
        '## Data Model / Schema',
        '## Business Rules',
        '## Permissions / Security',
        '## API / Service Requirements',
        '## UI / Workflow Requirements',
        '## Audit / Provenance',
        '## QA / Test Cases',
        '## Acceptance Criteria',
        '## Dependencies',
        '## Definition of Done',
        '## Implementation Notes'
      ];

      for (const sec of requiredSections) {
        assert.ok(specContent.includes(sec), `Specification must contain section: ${sec}`);
      }
    });
  });
});
