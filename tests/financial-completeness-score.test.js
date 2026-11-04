/**
 * ==============================================================================
 * Phase 76: Financial Completeness Score & Trust Thresholds Test Suite
 * ==============================================================================
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  financialCompletenessService,
  COMPLETENESS_TRUST_TIERS,
  TRUST_TIER_CONFIG,
  SCORING_DIMENSIONS,
  roundToTwo
} from '../src/lib/financialCompletenessService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 76 — Financial Completeness Score & Trust Thresholds Verification Suite', () => {

  describe('1. Trust Tiers & Dimensional Schema Configurations', () => {
    test('Exports all 4 canonical trust tiers', () => {
      const expectedTiers = [
        'VERIFIED_AUDIT_READY',
        'SUBSTANTIAL_TRUST',
        'PROVISIONAL_ESTIMATED',
        'CRITICAL_INCOMPLETE'
      ];

      expectedTiers.forEach(tier => {
        assert.ok(COMPLETENESS_TRUST_TIERS[tier], `Tier ${tier} must be exported`);
        assert.strictEqual(COMPLETENESS_TRUST_TIERS[tier], tier);
      });
    });

    test('Every trust tier has valid Maestro color tokens and configuration metadata', () => {
      const validColorTokens = ['emerald', 'sky', 'amber', 'rose'];

      Object.keys(COMPLETENESS_TRUST_TIERS).forEach(tierKey => {
        const config = TRUST_TIER_CONFIG[tierKey];
        assert.ok(config, `Config must exist for ${tierKey}`);
        assert.ok(config.label, `Label must exist for ${tierKey}`);
        assert.ok(config.shortLabel, `Short label must exist for ${tierKey}`);
        assert.ok(config.badgeClass, `Badge class must exist for ${tierKey}`);
        assert.ok(config.description, `Description must exist for ${tierKey}`);
        assert.ok(validColorTokens.includes(config.colorToken), `Color token ${config.colorToken} must be within Maestro palette`);
      });
    });

    test('All 6 scoring dimensions are defined with max point totals summing to 100.00', () => {
      assert.strictEqual(SCORING_DIMENSIONS.length, 6, 'Must define exactly 6 scoring dimensions');

      const totalMaxPoints = SCORING_DIMENSIONS.reduce((acc, dim) => acc + dim.maxPoints, 0);
      assert.strictEqual(totalMaxPoints, 100.00, 'Sum of all dimensions must equal exactly 100.00 points');
    });
  });

  describe('2. Deterministic Additive Scoring & Trust Tier Classification', () => {
    test('Classifies Verified Audit-Ready when overall score >= 90.00', () => {
      const tier = financialCompletenessService.classifyTrustTier(94.5);
      assert.strictEqual(tier, COMPLETENESS_TRUST_TIERS.VERIFIED_AUDIT_READY);
    });

    test('Classifies Substantial Trust when overall score is between 75.00 and 89.99', () => {
      const tier = financialCompletenessService.classifyTrustTier(82.0);
      assert.strictEqual(tier, COMPLETENESS_TRUST_TIERS.SUBSTANTIAL_TRUST);
    });

    test('Classifies Provisional Estimated when overall score is between 50.00 and 74.99', () => {
      const tier = financialCompletenessService.classifyTrustTier(65.0);
      assert.strictEqual(tier, COMPLETENESS_TRUST_TIERS.PROVISIONAL_ESTIMATED);
    });

    test('Classifies Critical Incomplete when overall score < 50.00', () => {
      const tier = financialCompletenessService.classifyTrustTier(42.5);
      assert.strictEqual(tier, COMPLETENESS_TRUST_TIERS.CRITICAL_INCOMPLETE);
    });

    test('Fully documented case earns 100.00 score and isAuditReady = true', () => {
      const perfectCase = {
        id: 991,
        patient: 'Jane Doe',
        cpt_codes: '66984',
        surgeonName: 'Dr. Expert',
        payerName: 'Medicare',
        expectedContributionMargin: 1500.00,
        requiresImplants: true,
        hasVerifiedImplantInvoice: true,
        hasPrimaryPayerContract: true,
        hasSecondaryOrCopayVerified: true,
        hasReconciledSupplies: true,
        hasVerifiedRoomTimestamps: true,
        hasCompleteStaffRoster: true,
        hasSterilizerCycleId: true,
        hasVerifiedModifiers: true,
        hasPostedRemittance: true
      };

      const result = financialCompletenessService.evaluateCaseCompleteness(perfectCase);

      assert.strictEqual(result.overallScore, 100.00);
      assert.strictEqual(result.trustTier, COMPLETENESS_TRUST_TIERS.VERIFIED_AUDIT_READY);
      assert.strictEqual(result.isAuditReady, true);
      assert.strictEqual(result.missingCount, 0);
      assert.strictEqual(result.scores.reimbursement, 25.00);
      assert.strictEqual(result.scores.directCost, 25.00);
      assert.strictEqual(result.scores.timeStaffing, 20.00);
      assert.strictEqual(result.scores.pharmacySterile, 10.00);
      assert.strictEqual(result.scores.codingModifier, 10.00);
      assert.strictEqual(result.scores.ledgerVerification, 10.00);
    });

    test('Missing implant invoice on implant case deducts 15 points and flags MISSING_IMPLANT_INVOICE', () => {
      const implantCase = {
        id: 992,
        requiresImplants: true,
        hasVerifiedImplantInvoice: false, // -15 pts
        hasPrimaryPayerContract: true,
        hasSecondaryOrCopayVerified: true,
        hasReconciledSupplies: true,
        hasVerifiedRoomTimestamps: true,
        hasCompleteStaffRoster: true,
        hasSterilizerCycleId: true,
        hasVerifiedModifiers: true,
        hasPostedRemittance: true
      };

      const result = financialCompletenessService.evaluateCaseCompleteness(implantCase);

      assert.strictEqual(result.overallScore, 85.00);
      assert.strictEqual(result.scores.directCost, 10.00);
      assert.strictEqual(result.trustTier, COMPLETENESS_TRUST_TIERS.SUBSTANTIAL_TRUST);
      assert.strictEqual(result.isAuditReady, false);

      const hasImplantGap = result.missingElements.some(e => e.code === 'MISSING_IMPLANT_INVOICE');
      assert.ok(hasImplantGap, 'Missing elements must include MISSING_IMPLANT_INVOICE');
    });

    test('Case with multiple missing elements drops below 50 into CRITICAL_INCOMPLETE', () => {
      const badlyDocumentedCase = {
        id: 993,
        requiresImplants: false,
        hasPrimaryPayerContract: false, // -10 pts
        hasSecondaryOrCopayVerified: false, // -5 pts
        hasReconciledSupplies: false, // -5 pts
        hasVerifiedRoomTimestamps: false, // -10 pts
        hasCompleteStaffRoster: false, // -6 pts
        hasSterilizerCycleId: false, // -5 pts
        hasVerifiedModifiers: false, // -5 pts
        hasPostedRemittance: false // -5 pts
      };

      const result = financialCompletenessService.evaluateCaseCompleteness(badlyDocumentedCase);

      assert.ok(result.overallScore < 50.00, 'Score must be less than 50');
      assert.strictEqual(result.trustTier, COMPLETENESS_TRUST_TIERS.CRITICAL_INCOMPLETE);
      assert.strictEqual(result.isAuditReady, false);
      assert.ok(result.missingCount >= 5);
    });
  });

  describe('3. Multi-Level Rollup Aggregations', () => {
    const sampleCases = financialCompletenessService.getBaselineSampleCases();

    test('getBaselineSampleCases returns 7 robust sample records', () => {
      assert.strictEqual(sampleCases.length, 7);
      sampleCases.forEach(c => {
        assert.ok(c.id);
        assert.ok(c.patient);
        assert.ok(c.surgeonName);
        assert.ok(c.payerName);
        assert.ok(typeof c.hasPrimaryPayerContract === 'boolean');
      });
    });

    test('calculateFacilityCompletenessKpis computes authoritative facility audit summary', () => {
      const kpis = financialCompletenessService.calculateFacilityCompletenessKpis(sampleCases);

      assert.strictEqual(kpis.totalCases, 7);
      assert.ok(kpis.avgScore > 0 && kpis.avgScore <= 100);
      assert.ok(kpis.auditReadyCount > 0);
      assert.ok(kpis.auditReadyPct >= 0 && kpis.auditReadyPct <= 100);
      assert.ok(kpis.provisionalRiskExposure > 0);
      assert.ok(kpis.totalMissingGaps > 0);
    });

    test('aggregatePayerCompleteness groups by payer and calculates audit readiness %', () => {
      const payerRollup = financialCompletenessService.aggregatePayerCompleteness(sampleCases);
      assert.ok(payerRollup.length > 0);

      // Verify sorted descending by avgScore
      for (let i = 0; i < payerRollup.length - 1; i++) {
        assert.ok(
          payerRollup[i].avgScore >= payerRollup[i + 1].avgScore,
          'Payers must be sorted descending by avgScore'
        );
      }

      const first = payerRollup[0];
      assert.ok(first.payerName);
      assert.ok(first.totalCases > 0);
      assert.ok(typeof first.avgScore === 'number');
      assert.ok(typeof first.provisionalMargin === 'number');
    });

    test('aggregateSurgeonCompleteness groups by surgeon and evaluates compliance %', () => {
      const surgeonRollup = financialCompletenessService.aggregateSurgeonCompleteness(sampleCases);
      assert.ok(surgeonRollup.length > 0);

      for (let i = 0; i < surgeonRollup.length - 1; i++) {
        assert.ok(
          surgeonRollup[i].avgScore >= surgeonRollup[i + 1].avgScore,
          'Surgeons must be sorted descending by avgScore'
        );
      }

      const first = surgeonRollup[0];
      assert.ok(first.surgeonName);
      assert.ok(first.specialty);
      assert.ok(first.totalCases > 0);
      assert.ok(first.compliancePct >= 0 && first.compliancePct <= 100);
    });
  });

  describe('4. Database Migration & Schema Integrity (052_financial_completeness_score.sql)', () => {
    const migrationPath = path.join(rootDir, 'supabase', 'migrations', '052_financial_completeness_score.sql');
    const downMigrationPath = path.join(rootDir, 'supabase', 'migrations', '052_financial_completeness_score_down.sql');

    test('Migration 052 forward and down files exist and are substantive', () => {
      assert.ok(fs.existsSync(migrationPath), 'Migration 052 forward file must exist');
      assert.ok(fs.existsSync(downMigrationPath), 'Migration 052 down file must exist');

      const forwardSql = fs.readFileSync(migrationPath, 'utf8');
      const downSql = fs.readFileSync(downMigrationPath, 'utf8');

      assert.ok(forwardSql.length > 1000, 'Forward SQL must contain complete schema');
      assert.ok(downSql.length > 200, 'Down SQL must contain teardown script');
    });

    test('Migration 052 creates public.case_financial_completeness table with all columns and constraints', () => {
      const forwardSql = fs.readFileSync(migrationPath, 'utf8');

      assert.ok(forwardSql.includes('CREATE TABLE IF NOT EXISTS public.case_financial_completeness'), 'Must create case_financial_completeness');
      assert.ok(forwardSql.includes('facility_id UUID NOT NULL'), 'Must include facility_id');
      assert.ok(forwardSql.includes('surgery_id BIGINT NOT NULL'), 'Must include surgery_id');
      assert.ok(forwardSql.includes('overall_score NUMERIC(5,2) NOT NULL'), 'Must include overall_score');
      assert.ok(forwardSql.includes('trust_tier VARCHAR(32) NOT NULL'), 'Must include trust_tier');
      assert.ok(forwardSql.includes('reimbursement_score NUMERIC(5,2) NOT NULL'), 'Must include reimbursement_score');
      assert.ok(forwardSql.includes('direct_cost_score NUMERIC(5,2) NOT NULL'), 'Must include direct_cost_score');
      assert.ok(forwardSql.includes('time_staffing_score NUMERIC(5,2) NOT NULL'), 'Must include time_staffing_score');
      assert.ok(forwardSql.includes('pharmacy_sterile_score NUMERIC(5,2) NOT NULL'), 'Must include pharmacy_sterile_score');
      assert.ok(forwardSql.includes('coding_modifier_score NUMERIC(5,2) NOT NULL'), 'Must include coding_modifier_score');
      assert.ok(forwardSql.includes('ledger_verification_score NUMERIC(5,2) NOT NULL'), 'Must include ledger_verification_score');
      assert.ok(forwardSql.includes('is_audit_ready BOOLEAN NOT NULL'), 'Must include is_audit_ready');
      assert.ok(forwardSql.includes('missing_elements TEXT[] NOT NULL'), 'Must include missing_elements');
    });

    test('Migration 052 creates deterministic calculation trigger function', () => {
      const forwardSql = fs.readFileSync(migrationPath, 'utf8');

      assert.ok(forwardSql.includes('CREATE OR REPLACE FUNCTION public.fn_calculate_case_completeness()'), 'Must create fn_calculate_case_completeness');
      assert.ok(forwardSql.includes('CREATE TRIGGER trg_calculate_case_completeness'), 'Must create trigger');
    });

    test('Migration 052 creates rollup views for facility, payer, and surgeon', () => {
      const forwardSql = fs.readFileSync(migrationPath, 'utf8');

      assert.ok(forwardSql.includes('CREATE OR REPLACE VIEW public.vw_facility_completeness_scorecard'), 'Must create vw_facility_completeness_scorecard');
      assert.ok(forwardSql.includes('CREATE OR REPLACE VIEW public.vw_payer_completeness_summary'), 'Must create vw_payer_completeness_summary');
      assert.ok(forwardSql.includes('CREATE OR REPLACE VIEW public.vw_surgeon_documentation_completeness'), 'Must create vw_surgeon_documentation_completeness');
    });

    test('Migration 052 enables RLS and defines tenant policies', () => {
      const forwardSql = fs.readFileSync(migrationPath, 'utf8');

      assert.ok(forwardSql.includes('ALTER TABLE public.case_financial_completeness ENABLE ROW LEVEL SECURITY;'), 'Must enable RLS');
      assert.ok(forwardSql.includes('CREATE POLICY case_completeness_select_policy'), 'Must create SELECT policy');
      assert.ok(forwardSql.includes('CREATE POLICY case_completeness_insert_policy'), 'Must create INSERT policy');
      assert.ok(forwardSql.includes('public.is_facility_accessible(facility_id)'), 'Must check facility accessibility');
    });

    test('Down migration 052 drops all created objects safely in reverse order', () => {
      const downSql = fs.readFileSync(downMigrationPath, 'utf8');

      assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_surgeon_documentation_completeness CASCADE;'));
      assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_payer_completeness_summary CASCADE;'));
      assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_facility_completeness_scorecard CASCADE;'));
      assert.ok(downSql.includes('DROP TRIGGER IF EXISTS trg_calculate_case_completeness ON public.case_financial_completeness;'));
      assert.ok(downSql.includes('DROP FUNCTION IF EXISTS public.fn_calculate_case_completeness();'));
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.case_financial_completeness CASCADE;'));
    });
  });

  describe('5. Maestro Design System & Application Wiring', () => {
    test('FinancialCompletenessView.jsx and CSS obey strict Color Governance (Zero disallowed tokens)', () => {
      const jsxPath = path.join(rootDir, 'src', 'components', 'FinancialCompletenessView.jsx');
      const cssPath = path.join(rootDir, 'src', 'components', 'FinancialCompletenessView.css');

      assert.ok(fs.existsSync(jsxPath), 'JSX file must exist');
      assert.ok(fs.existsSync(cssPath), 'CSS file must exist');

      const jsx = fs.readFileSync(jsxPath, 'utf8');
      const cssLines = fs.readFileSync(cssPath, 'utf8').split('\n');

      const banned = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];

      banned.forEach(token => {
        assert.ok(!jsx.toLowerCase().includes(token), `JSX must not contain ${token}`);
      });

      cssLines.forEach((line, idx) => {
        if (line.includes('/*') || line.includes('*') || line.includes('//')) return;
        banned.forEach(token => {
          assert.ok(!line.toLowerCase().includes(token), `CSS line ${idx + 1} must not contain ${token}`);
        });
      });
    });

    test('FinancialCompletenessView includes responsive table wrapper with min-width 1100px', () => {
      const jsx = fs.readFileSync(path.join(rootDir, 'src', 'components', 'FinancialCompletenessView.jsx'), 'utf8');
      const css = fs.readFileSync(path.join(rootDir, 'src', 'components', 'FinancialCompletenessView.css'), 'utf8');

      assert.ok(jsx.includes('className="table-responsive"'), 'JSX must include table-responsive wrapper');
      assert.ok(css.includes('min-width: 1100px'), 'CSS must specify min-width: 1100px on table');
    });

    test('App.jsx integrates FinancialCompletenessView into sidebar navigation and routing', () => {
      const appJsx = fs.readFileSync(path.join(rootDir, 'src', 'App.jsx'), 'utf8');

      assert.ok(appJsx.includes("import FinancialCompletenessView from './components/FinancialCompletenessView'"), 'App.jsx must import component');
      assert.ok(appJsx.includes("activeTab === 'financial_completeness'"), 'App.jsx must have tab active state');
      assert.ok(appJsx.includes('<FinancialCompletenessView />'), 'App.jsx must render component');
      assert.ok(appJsx.includes('Financial Completeness Score'), 'App.jsx must have menu item text');
    });
  });
});

