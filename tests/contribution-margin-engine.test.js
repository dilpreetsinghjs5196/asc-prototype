/**
 * ==============================================================================
 * Phase 74: Contribution Margin Engine & Profitability Analytics Test Suite
 * ==============================================================================
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  contributionMarginEngineService,
  PROFITABILITY_TIERS,
  TIER_CONFIG,
  roundToTwo
} from '../src/lib/contributionMarginEngineService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 74 — Contribution Margin Engine Verification Suite', () => {

  describe('1. Profitability Tiers & Schema Configurations', () => {
    test('Exports all 4 canonical profitability tiers', () => {
      const expectedTiers = [
        'HIGH_MARGIN',
        'TARGET',
        'MARGINAL',
        'NEGATIVE_MARGIN'
      ];

      expectedTiers.forEach(tier => {
        assert.ok(PROFITABILITY_TIERS[tier], `Tier ${tier} must be exported`);
        assert.strictEqual(PROFITABILITY_TIERS[tier], tier);
      });
    });

    test('Every profitability tier has valid Maestro color tokens and configuration metadata', () => {
      const validColorTokens = ['emerald', 'sky', 'amber', 'rose'];

      Object.keys(PROFITABILITY_TIERS).forEach(tierKey => {
        const config = TIER_CONFIG[tierKey];
        assert.ok(config, `Config must exist for ${tierKey}`);
        assert.ok(config.label, `Label must exist for ${tierKey}`);
        assert.ok(config.shortLabel, `Short label must exist for ${tierKey}`);
        assert.ok(config.badgeClass, `Badge class must exist for ${tierKey}`);
        assert.ok(config.description, `Description must exist for ${tierKey}`);
        assert.ok(validColorTokens.includes(config.colorToken), `Color token ${config.colorToken} must be within Maestro palette`);
      });
    });
  });

  describe('2. Deterministic Profitability Tier Classification', () => {
    test('Classifies high margin when yield >= 45.0%', () => {
      const tier = contributionMarginEngineService.classifyProfitabilityTier(48.5, 2000);
      assert.strictEqual(tier, PROFITABILITY_TIERS.HIGH_MARGIN);
    });

    test('Classifies target margin when yield is between 25.0% and 44.9%', () => {
      const tier = contributionMarginEngineService.classifyProfitabilityTier(36.2, 1500);
      assert.strictEqual(tier, PROFITABILITY_TIERS.TARGET);
    });

    test('Classifies marginal margin when yield is between 0.0% and 24.9%', () => {
      const tier = contributionMarginEngineService.classifyProfitabilityTier(15.0, 400);
      assert.strictEqual(tier, PROFITABILITY_TIERS.MARGINAL);
    });

    test('Classifies negative margin when yield < 0.0% or margin amount is negative', () => {
      const tierNegPct = contributionMarginEngineService.classifyProfitabilityTier(-5.2, -250);
      assert.strictEqual(tierNegPct, PROFITABILITY_TIERS.NEGATIVE_MARGIN);

      const tierNegAmt = contributionMarginEngineService.classifyProfitabilityTier(10.0, -50);
      assert.strictEqual(tierNegAmt, PROFITABILITY_TIERS.NEGATIVE_MARGIN);
    });
  });

  describe('3. Procedural Contribution Margin Evaluation for Benchmark Cases', () => {
    test('Evaluates Case #101 accurately from source ledger and cost items', () => {
      const margin = contributionMarginEngineService.evaluateCaseContributionMargin(101);
      assert.ok(margin, 'Margin evaluation must exist');
      assert.strictEqual(margin.surgeryId, 101);

      // Expected Contract Allowable = $4,250.00
      assert.strictEqual(margin.expectedContractAllowable, 4250.00);

      // Total Direct Costs = $2,712.50
      assert.strictEqual(margin.totalDirectCosts, 2712.50);

      // Expected Contribution Margin = 4250.00 - 2712.50 = $1,537.50
      assert.strictEqual(margin.expectedContributionMargin, 1537.50);

      // Expected Margin Percentage = (1537.50 / 4250.00) * 100 = 36.18%
      assert.strictEqual(margin.expectedMarginPercentage, 36.18);

      // Profitability Tier must be TARGET
      assert.strictEqual(margin.profitabilityTier, PROFITABILITY_TIERS.TARGET);

      // Breakeven Revenue Threshold must equal Total Direct Costs
      assert.strictEqual(margin.breakevenRevenueThreshold, 2712.50);

      // Actual Net Collections = $4,250.00 -> Actual Margin = $1,537.50
      assert.strictEqual(margin.totalNetCollections, 4250.00);
      assert.strictEqual(margin.actualContributionMargin, 1537.50);

      // Margin Leakage = 0.00
      assert.strictEqual(margin.marginLeakageVariance, 0.00);
    });

    test('Calculates indirect cost overhead and fully loaded net margin', () => {
      const margin = contributionMarginEngineService.evaluateCaseContributionMargin(101);
      // Fixed $125.00 + (60/60 * $85.00) = $210.00 indirect
      assert.strictEqual(margin.totalIndirectCost, 210.00);
      // Fully loaded = $1,537.50 - $210.00 = $1,327.50
      assert.strictEqual(margin.fullyLoadedNetMargin, 1327.50);
    });
  });

  describe('4. Cross-Case Profitability Matrix Generation', () => {
    test('getProfitabilityMatrix returns benchmark encounters with surgeon and payer cross-tabulation', () => {
      const matrix = contributionMarginEngineService.getProfitabilityMatrix();
      assert.ok(Array.isArray(matrix) && matrix.length >= 3, 'Must return at least 3 benchmark cases');

      const case101 = matrix.find(m => m.surgeryId === 101);
      assert.ok(case101, 'Case 101 must exist in matrix');
      assert.strictEqual(case101.surgeon, 'Dr. Sarah Lin, MD');
      assert.strictEqual(case101.payer, 'Blue Cross PPO');
      assert.strictEqual(case101.specialty, 'Orthopedics');
      assert.ok(case101.expectedContributionMargin > 0);
      assert.ok(case101.tierConfig);
    });
  });

  describe('5. Migration 050 Schema DDL & Rollback Integrity', () => {
    test('Migration 050_contribution_margin_engine.sql defines snapshots table, view, and RLS', () => {
      const fwdPath = path.join(rootDir, 'supabase', 'migrations', '050_contribution_margin_engine.sql');
      assert.ok(fs.existsSync(fwdPath), 'Migration 050 file must exist');

      const content = fs.readFileSync(fwdPath, 'utf8');
      assert.ok(content.includes('CREATE TABLE IF NOT EXISTS public.case_contribution_margin_snapshots'), 'Must create snapshots table');
      assert.ok(content.includes('CREATE OR REPLACE VIEW public.vw_case_profitability_matrix'), 'Must create view');
      assert.ok(content.includes('ENABLE ROW LEVEL SECURITY'), 'Must enable RLS');
      assert.ok(content.includes('is_facility_accessible(facility_id)'), 'Must enforce facility multi-tenancy');
    });

    test('Rollback migration 050_contribution_margin_engine_down.sql drops view and table cleanly', () => {
      const downPath = path.join(rootDir, 'supabase', 'migrations', '050_contribution_margin_engine_down.sql');
      assert.ok(fs.existsSync(downPath), 'Down migration 050 file must exist');

      const content = fs.readFileSync(downPath, 'utf8');
      assert.ok(content.includes('DROP VIEW IF EXISTS public.vw_case_profitability_matrix'), 'Must drop view');
      assert.ok(content.includes('DROP TABLE IF EXISTS public.case_contribution_margin_snapshots'), 'Must drop table');
    });
  });

  describe('6. UI Components & Maestro Purple Ban Static Audit', () => {
    test('ContributionMarginEngineView and its CSS have zero banned purple/violet/indigo tokens', () => {
      const jsxPath = path.join(rootDir, 'src', 'components', 'ContributionMarginEngineView.jsx');
      const cssPath = path.join(rootDir, 'src', 'components', 'ContributionMarginEngineView.css');

      assert.ok(fs.existsSync(jsxPath), 'ContributionMarginEngineView.jsx must exist');
      assert.ok(fs.existsSync(cssPath), 'ContributionMarginEngineView.css must exist');

      const jsxContent = fs.readFileSync(jsxPath, 'utf8');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      // Strip comments
      const cleanCss = cssContent.replace(/\/\*[\s\S]*?\*\//g, '');

      const purpleRegex = /\b(purple|violet|indigo)\b/i;
      assert.strictEqual(purpleRegex.test(jsxContent), false, 'ContributionMarginEngineView.jsx must not contain purple tokens');
      assert.strictEqual(purpleRegex.test(cleanCss), false, 'ContributionMarginEngineView.css must not contain purple tokens');
    });

    test('ContributionMarginEngineView CSS defines table-responsive with overflow-x auto and custom scrollbars', () => {
      const cssPath = path.join(rootDir, 'src', 'components', 'ContributionMarginEngineView.css');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      assert.ok(cssContent.includes('.table-responsive'), 'Must define .table-responsive');
      assert.ok(cssContent.includes('overflow-x: auto'), 'Must set overflow-x: auto');
      assert.ok(cssContent.includes('.table-responsive::-webkit-scrollbar'), 'Must style scrollbars');
      assert.ok(cssContent.includes('min-width: 1100px'), 'Table must have minimum width to prevent field clipping');
    });
  });

  describe('7. Application Wiring & Router Integration', () => {
    test('App.jsx integrates ContributionMarginEngineView with sidebar item, headers, and active tab', () => {
      const appPath = path.join(rootDir, 'src', 'App.jsx');
      const content = fs.readFileSync(appPath, 'utf8');

      assert.ok(content.includes("import ContributionMarginEngineView from './components/ContributionMarginEngineView';"), 'Must import ContributionMarginEngineView');
      assert.ok(content.includes("activeTab === 'contribution_margin_engine'"), 'Must bind contribution_margin_engine tab');
      assert.ok(content.includes("<ContributionMarginEngineView />"), 'Must render ContributionMarginEngineView');
      assert.ok(content.includes("Contribution Margin Engine & Yield Analysis"), 'Must have proper header title');
    });
  });

  describe('8. Master Specifications Directory Integrity', () => {
    test('Master directory Phase_07_Financials contains strictly 8 files (70 through 77)', () => {
      const specsDir = 'E:\\medicalAI\\ASCANALYST_All_Modules\\ASCANALYST_MD_SPECS\\Phase_07_Financials';
      if (fs.existsSync(specsDir)) {
        const files = fs.readdirSync(specsDir).filter(f => f.endsWith('.md'));
        assert.strictEqual(files.length, 8, `Phase_07_Financials must contain strictly 8 files, found: ${files.join(', ')}`);
        assert.ok(files.includes('74_CONTRIBUTION_MARGIN_ENGINE.md'), 'Must contain 74_CONTRIBUTION_MARGIN_ENGINE.md');
      }
    });
  });

});

