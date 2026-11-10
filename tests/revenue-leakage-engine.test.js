import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import revenueLeakageService, {
  LEAKAGE_CATEGORIES,
  OPPORTUNITY_STATUSES,
  BASELINE_LEAKAGE_RULES,
  BASELINE_OPPORTUNITIES,
  calculateExpectedRecovery,
  calculateRecoveryYield,
  calculateOpportunityPriority,
  getLeakageSummaryMetrics,
  getSurgeonScorecards
} from '../src/lib/revenueLeakageService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 90 — Revenue Leakage Engine Test Suite', () => {

  describe('1. Risk Categories, Opportunity Statuses & Master Rules', () => {
    test('should define all 6 surgical ASC revenue leakage risk categories', () => {
      const categories = Object.keys(LEAKAGE_CATEGORIES);
      assert.strictEqual(categories.length, 6, 'Must define 6 risk categories');
      assert.ok(categories.includes('UNBILLED_IMPLANT'));
      assert.ok(categories.includes('UNBILLED_PROCEDURE'));
      assert.ok(categories.includes('MODIFIER_OMISSION'));
      assert.ok(categories.includes('CONTRACT_UNDERPAYMENT'));
      assert.ok(categories.includes('TIMELY_FILING_RISK'));
      assert.ok(categories.includes('DOCUMENTATION_DEFICIENCY'));
    });

    test('should define all 7 opportunity lifecycle statuses with proper labels', () => {
      const statuses = Object.keys(OPPORTUNITY_STATUSES);
      assert.strictEqual(statuses.length, 7, 'Must define 7 lifecycle states');
      assert.ok(statuses.includes('DETECTED'));
      assert.ok(statuses.includes('UNDER_REVIEW'));
      assert.ok(statuses.includes('VALIDATED_OPPORTUNITY'));
      assert.ok(statuses.includes('REBILL_SUBMITTED'));
      assert.ok(statuses.includes('RECOVERED'));
      assert.ok(statuses.includes('DISMISSED_VALID_ADJ'));
      assert.ok(statuses.includes('EXPIRED_TIMELY_FILING'));
    });

    test('should supply valid baseline rules catalog with detection logic and thresholds', () => {
      assert.ok(BASELINE_LEAKAGE_RULES.length >= 6);
      BASELINE_LEAKAGE_RULES.forEach(rule => {
        assert.ok(rule.rule_code.startsWith('LEAK-'), `Rule code ${rule.rule_code} must start with LEAK-`);
        assert.ok(LEAKAGE_CATEGORIES[rule.category], `Rule category ${rule.category} must be registered`);
        assert.ok(rule.threshold_amount > 0, `Threshold must be positive`);
        assert.ok(rule.default_recovery_probability >= 0 && rule.default_recovery_probability <= 100);
        assert.ok(rule.detection_logic.length > 5, 'Detection logic must be specified');
      });
    });
  });

  describe('2. Deterministic Financial Invariant Calculations', () => {
    test('should calculate expected recovery: ROUND(potential * (prob / 100), 2)', () => {
      const expected1 = calculateExpectedRecovery(4850.00, 88.00);
      assert.strictEqual(expected1, 4268.00, '4850 * 0.88 = 4268.00');

      const expected2 = calculateExpectedRecovery(1950.00, 82.00);
      assert.strictEqual(expected2, 1599.00, '1950 * 0.82 = 1599.00');

      // Edge cases
      assert.strictEqual(calculateExpectedRecovery(0, 85), 0.00);
      assert.strictEqual(calculateExpectedRecovery(5000, 0), 0.00);
      assert.strictEqual(calculateExpectedRecovery(-100, 80), 0.00);
    });

    test('should calculate recovery yield percentage: ROUND((realized / potential) * 100, 2)', () => {
      const yield1 = calculateRecoveryYield(3200.00, 3200.00);
      assert.strictEqual(yield1, 100.00, 'Full recovery should yield 100%');

      const yield2 = calculateRecoveryYield(1500.00, 3000.00);
      assert.strictEqual(yield2, 50.00, 'Half recovery should yield 50%');

      // Zero-division safety
      assert.strictEqual(calculateRecoveryYield(0, 0), 0.00);
      assert.strictEqual(calculateRecoveryYield(500, 0), 0.00);
    });

    test('should compute multi-factor priority score with dollar, prob, and urgency weighting', () => {
      // High dollar, high probability, critical deadline (<15d)
      const scoreCritical = calculateOpportunityPriority(8000.00, 95.00, 10);
      assert.ok(scoreCritical >= 85.0, `Score should be critical, got ${scoreCritical}`);

      // Moderate dollar, 30-day deadline
      const scoreModerate = calculateOpportunityPriority(2500.00, 75.00, 28);
      assert.ok(scoreModerate >= 45.0 && scoreModerate < 80.0, `Score should be moderate, got ${scoreModerate}`);

      // Clamped to 100.0 max
      const scoreCapped = calculateOpportunityPriority(50000.00, 100.00, 5);
      assert.strictEqual(scoreCapped, 100.00, 'Score must be clamped at 100.00');
    });
  });

  describe('3. Executive Metrics Aggregation & Surgeon Scorecards', () => {
    test('should accurately aggregate portfolio metrics across baseline opportunities', () => {
      const summary = getLeakageSummaryMetrics(BASELINE_OPPORTUNITIES);
      assert.strictEqual(summary.totalCases, BASELINE_OPPORTUNITIES.length);
      assert.ok(summary.totalDetectedLeakage > 0, 'Total detected leakage must be positive');
      assert.ok(summary.validatedPipeline > 0, 'Validated pipeline must be positive');
      assert.ok(summary.realizedRecovered > 0, 'Realized cash must be positive');
      assert.ok(summary.recoveryYieldPct >= 0 && summary.recoveryYieldPct <= 100);

      // Verify category breakdown exists for all categories
      Object.keys(LEAKAGE_CATEGORIES).forEach(cat => {
        assert.ok(summary.categoryBreakdown[cat] !== undefined);
      });
    });

    test('should generate accurate surgeon scorecards categorized by specialty and leak type', () => {
      const scorecards = getSurgeonScorecards(BASELINE_OPPORTUNITIES);
      assert.ok(scorecards.length > 0, 'Must produce surgeon scorecards');

      const drGardner = scorecards.find(s => s.surgeon_name === 'Dr. Gardner Paul');
      assert.ok(drGardner, 'Dr. Gardner Paul must be present in scorecards');
      assert.strictEqual(drGardner.specialty, 'Orthopedics');
      assert.ok(drGardner.total_opportunities >= 2);
      assert.ok(drGardner.unbilled_implant_cases >= 1);
    });
  });

  describe('4. Lifecycle State Machine Operations', () => {
    test('should transition opportunity state upon validation, rebill, and settlement', () => {
      const opps = revenueLeakageService.getOpportunities();
      const detectedOpp = opps.find(o => o.status === 'DETECTED');
      assert.ok(detectedOpp, 'Must have at least one detected opportunity to test');

      // 1. Validate
      const validated = revenueLeakageService.validateOpportunity(detectedOpp.id, {
        adjustedPotential: 3500.00,
        probability: 70.00,
        notes: 'Clinical dictation confirmed'
      });
      assert.strictEqual(validated.status, 'VALIDATED_OPPORTUNITY');
      assert.strictEqual(validated.potential_recovery_amount, 3500.00);

      // 2. Submit Rebill
      const rebilled = revenueLeakageService.submitRebill(detectedOpp.id, {
        rebillType: '837I_FREQ_7',
        claimControlNumber: 'CCN-TEST-99',
        notes: 'Transmitted to clearinghouse'
      });
      assert.strictEqual(rebilled.status, 'REBILL_SUBMITTED');
      assert.ok(rebilled.action_notes.includes('CCN-TEST-99'));

      // 3. Mark Recovered
      const recovered = revenueLeakageService.markRecovered(detectedOpp.id, {
        realizedAmount: 3250.00,
        notes: 'Check deposited'
      });
      assert.strictEqual(recovered.status, 'RECOVERED');
      assert.strictEqual(recovered.realized_recovered_amount, 3250.00);
    });

    test('should support dismissing opportunity with justification notes', () => {
      const opps = revenueLeakageService.getOpportunities();
      const underReview = opps.find(o => o.status === 'UNDER_REVIEW');
      assert.ok(underReview, 'Must have at least one opportunity under review');

      const dismissed = revenueLeakageService.dismissOpportunity(underReview.id, {
        reason: 'NCCI_BUNDLED_EDIT',
        notes: 'Procedure bundled per NCCI column 1 edit'
      });
      assert.strictEqual(dismissed.status, 'DISMISSED_VALID_ADJ');
      assert.ok(dismissed.action_notes.includes('NCCI_BUNDLED_EDIT'));
    });
  });

  describe('5. Database Migration Integrity (064_revenue_leakage_engine.sql)', () => {
    const upMigrationPath = path.join(rootDir, 'supabase', 'migrations', '064_revenue_leakage_engine.sql');
    const downMigrationPath = path.join(rootDir, 'supabase', 'migrations', '064_revenue_leakage_engine_down.sql');

    test('should verify 064_revenue_leakage_engine.sql exists and contains core tables and views', () => {
      assert.ok(fs.existsSync(upMigrationPath), '064_revenue_leakage_engine.sql must exist');
      const sql = fs.readFileSync(upMigrationPath, 'utf8');

      // Core Tables
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.rcm_leakage_rules'));
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.rcm_leakage_opportunities'));
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.rcm_leakage_evidence'));

      // Foreign Key Data Types
      assert.ok(sql.includes('surgery_id BIGINT REFERENCES public.surgeries(id)'));
      assert.ok(sql.includes('patient_id BIGINT REFERENCES public.patients(id)'));
      assert.ok(sql.includes('claim_id UUID REFERENCES public.claims(id)'));
      assert.ok(sql.includes('facility_id UUID NOT NULL REFERENCES public.facilities(id)'));

      // Stored Generated Column
      assert.ok(sql.includes('expected_recovery_amount NUMERIC(14,2) GENERATED ALWAYS AS ('));
      assert.ok(sql.includes('STORED'));

      // Analytical Views
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_rcm_leakage_opportunities_summary'));
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_rcm_leakage_surgeon_scorecard'));

      // 1:1 RLS Policy Parity
      const dropCount = (sql.match(/DROP POLICY IF EXISTS/g) || []).length;
      const createCount = (sql.match(/CREATE POLICY/g) || []).length;
      assert.strictEqual(dropCount, 3, 'Must drop 3 policies');
      assert.strictEqual(createCount, 3, 'Must create 3 policies');
      assert.strictEqual(dropCount, createCount, 'DROP and CREATE policy counts must match 1:1');
    });

    test('should verify 064_revenue_leakage_engine_down.sql cleanly rolls back all schema objects', () => {
      assert.ok(fs.existsSync(downMigrationPath), '064_revenue_leakage_engine_down.sql must exist');
      const sql = fs.readFileSync(downMigrationPath, 'utf8');

      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_rcm_leakage_surgeon_scorecard CASCADE;'));
      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_rcm_leakage_opportunities_summary CASCADE;'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.rcm_leakage_evidence CASCADE;'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.rcm_leakage_opportunities CASCADE;'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.rcm_leakage_rules CASCADE;'));
    });
  });

  describe('6. Maestro Clinical Design System Governance (Purple Ban)', () => {
    const cssPath = path.join(rootDir, 'src', 'components', 'RevenueLeakageView.css');
    const jsxPath = path.join(rootDir, 'src', 'components', 'RevenueLeakageView.jsx');

    test('should strictly forbid purple/violet/indigo/magenta/fuchsia tokens in RevenueLeakageView.css', () => {
      assert.ok(fs.existsSync(cssPath), 'RevenueLeakageView.css must exist');
      const rawCode = fs.readFileSync(cssPath, 'utf8');
      // Strip comments before checking for forbidden tokens
      const code = rawCode.replace(/\/\*[\s\S]*?\*\//g, '');
      const forbiddenTokens = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];

      for (const token of forbiddenTokens) {
        const regex = new RegExp(`\\b${token}\\b`, 'i');
        assert.ok(!regex.test(code), `CSS must not contain forbidden token: ${token}`);
      }
    });

    test('should strictly forbid purple/violet/indigo/magenta/fuchsia tokens in RevenueLeakageView.jsx', () => {
      assert.ok(fs.existsSync(jsxPath), 'RevenueLeakageView.jsx must exist');
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
    test('should verify RevenueLeakageView is wired into src/App.jsx', () => {
      const appJsxPath = path.join(rootDir, 'src', 'App.jsx');
      assert.ok(fs.existsSync(appJsxPath), 'App.jsx must exist');
      const appCode = fs.readFileSync(appJsxPath, 'utf8');

      assert.ok(appCode.includes("import RevenueLeakageView from './components/RevenueLeakageView'"));
      assert.ok(appCode.includes("activeTab === 'revenue_leakage'"));
      assert.ok(appCode.includes('<RevenueLeakageView />'));
    });

    test('should verify 90_REVENUE_LEAKAGE_ENGINE.md specification exists and has all required sections', () => {
      const specPath = path.join(rootDir, '..', 'ASCANALYST_All_Modules', 'ASCANALYST_MD_SPECS', 'Phase_09_Revenue_Leakage', '90_REVENUE_LEAKAGE_ENGINE.md');
      assert.ok(fs.existsSync(specPath), 'Specification file must exist');
      const specContent = fs.readFileSync(specPath, 'utf8');

      const requiredSections = [
        '# 90 REVENUE LEAKAGE ENGINE',
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
