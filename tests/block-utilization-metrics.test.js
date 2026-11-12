import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Import service layer under test
import {
  RIGHTSIZING_ACTIONS,
  DEFAULT_HOURLY_CONTRIBUTION_MARGIN,
  calculateAdjustedBlockUtilization,
  calculateRawBlockUtilization,
  calculateUnusedBlockMinutes,
  calculateOpportunityCost,
  calculateReleaseCompliance,
  calculateSbpiScore,
  determineRightsizingRecommendation,
  calculateFacilityBlockSummaryKpis,
  filterBlockLedgers,
  SEED_BLOCK_UTILIZATION_LEDGERS,
  SEED_BLOCK_GOVERNANCE_ACTIONS
} from '../src/services/blockUtilizationMetricsService.js';

describe('Phase A5 — Block Utilization Metrics & Rightsizing Engine Test Suite', () => {

  // 1. Taxonomy & Action Governance
  describe('1. Block Rightsizing Taxonomy & Action Governance', () => {
    test('should define all 4 authoritative rightsizing action types', () => {
      const keys = Object.keys(RIGHTSIZING_ACTIONS);
      assert.strictEqual(keys.length, 4);
      assert.ok(RIGHTSIZING_ACTIONS.EXPAND_ALLOCATION);
      assert.ok(RIGHTSIZING_ACTIONS.MAINTAIN);
      assert.ok(RIGHTSIZING_ACTIONS.PROBATIONARY_NOTICE);
      assert.ok(RIGHTSIZING_ACTIONS.RIGHTSIZE_DOWNGRADE);
    });

    test('should enforce default ASC contribution margin benchmark ($1,250.00/hr)', () => {
      assert.strictEqual(DEFAULT_HOURLY_CONTRIBUTION_MARGIN, 1250.00);
    });
  });

  // 2. Deterministic Block Math & SBPI Index
  describe('2. Deterministic Block Math & SBPI Index', () => {
    test('calculateAdjustedBlockUtilization: deducts on-time release and handles 100% surrender', () => {
      // 6240m allocated, 960m on-time released -> 5280m net denominator. 4620m utilized -> 87.50%
      const res = calculateAdjustedBlockUtilization(4620, 6240, 960);
      assert.strictEqual(res.netDenominatorMinutes, 5280);
      assert.strictEqual(res.utilizationPct, 87.50);
      assert.strictEqual(res.isFullyExcused, false);

      // Excused 100% release (net denominator = 0)
      const excused = calculateAdjustedBlockUtilization(0, 480, 480);
      assert.strictEqual(excused.netDenominatorMinutes, 0);
      assert.strictEqual(excused.utilizationPct, 100.00);
      assert.strictEqual(excused.isFullyExcused, true);
    });

    test('calculateRawBlockUtilization: computes raw ratio without release credit', () => {
      assert.strictEqual(calculateRawBlockUtilization(4620, 6240), 74.04);
      assert.strictEqual(calculateRawBlockUtilization(0, 6240), 0.00);
      assert.strictEqual(calculateRawBlockUtilization(100, 0), 0.00);
    });

    test('calculateUnusedBlockMinutes: identifies idle abandoned block time', () => {
      // 6240 allocated, 4620 utilized, 960 on-time released, 0 late released -> 660 unused
      assert.strictEqual(calculateUnusedBlockMinutes(6240, 4620, 960, 0), 660);
      // All used -> 0 unused
      assert.strictEqual(calculateUnusedBlockMinutes(480, 480, 0, 0), 0);
      // More used than allocated -> 0 unused
      assert.strictEqual(calculateUnusedBlockMinutes(480, 500, 0, 0), 0);
    });

    test('calculateOpportunityCost: accurately computes financial margin loss', () => {
      // 660 minutes (11 hrs) at $1,250/hr = $13,750.00
      assert.strictEqual(calculateOpportunityCost(660, 1250), 13750.00);
      // 0 minutes = $0.00
      assert.strictEqual(calculateOpportunityCost(0, 1250), 0.00);
    });

    test('calculateReleaseCompliance: calculates on-time surrender ratio', () => {
      // 960m on-time, 0m late = 100.00%
      assert.strictEqual(calculateReleaseCompliance(960, 0, 80), 100.00);
      // 480m on-time, 480m late = 50.00%
      assert.strictEqual(calculateReleaseCompliance(480, 480, 75), 50.00);
      // 0 releases, 80% util = 100.00% (compliant full utilization)
      assert.strictEqual(calculateReleaseCompliance(0, 0, 80), 100.00);
      // 0 releases, 50% util = 0.00% (hoarded block)
      assert.strictEqual(calculateReleaseCompliance(0, 0, 50), 0.00);
    });

    test('calculateSbpiScore: computes weighted 50/30/20 composite performance index', () => {
      // 87.5 util (50% = 43.75), 100 compliance (30% = 30.00), 720/6240 = 11.54% out of block (20% = 2.31)
      // Total = 43.75 + 30.00 + 2.31 = 76.06 -> clamped/rounded
      const score = calculateSbpiScore(87.5, 100, 720, 6240);
      assert.ok(score >= 70 && score <= 100);

      // Low score test
      const lowScore = calculateSbpiScore(52.56, 0, 0, 6240);
      assert.strictEqual(lowScore, 26.3); // 52.56 * 0.5 = 26.28 -> 26.3
    });

    test('determineRightsizingRecommendation: accurately maps to 4 committee actions', () => {
      assert.strictEqual(determineRightsizingRecommendation(88.0, 88.0), 'EXPAND_ALLOCATION');
      assert.strictEqual(determineRightsizingRecommendation(78.0, 78.0), 'MAINTAIN');
      assert.strictEqual(determineRightsizingRecommendation(65.0, 68.0), 'PROBATIONARY_NOTICE');
      assert.strictEqual(determineRightsizingRecommendation(50.0, 52.0), 'RIGHTSIZE_DOWNGRADE');
    });
  });

  // 3. Facility Summary KPIs & Filtering
  describe('3. Facility Summary KPIs & Filtering', () => {
    test('calculateFacilityBlockSummaryKpis: computes accurate aggregate metrics', () => {
      const kpis = calculateFacilityBlockSummaryKpis(SEED_BLOCK_UTILIZATION_LEDGERS);

      assert.ok(kpis.avgAdjustedUtilPct >= 65.0 && kpis.avgAdjustedUtilPct <= 85.0);
      assert.ok(kpis.avgReleaseCompliancePct >= 50.0);
      assert.ok(kpis.totalWastedHours > 0);
      assert.ok(kpis.totalOpportunityCost > 50000);
      assert.ok(kpis.probationaryCount >= 1);
      assert.ok(kpis.expandCandidateCount >= 1);
      assert.ok(kpis.totalAllocatedHours > 0);
      assert.ok(kpis.totalUtilizedHours > 0);
    });

    test('filterBlockLedgers: filters ledgers by specialty, action, and search query', () => {
      const all = filterBlockLedgers(SEED_BLOCK_UTILIZATION_LEDGERS);
      assert.strictEqual(all.length, SEED_BLOCK_UTILIZATION_LEDGERS.length);

      // Filter by specialty ORTHOPEDICS
      const ortho = filterBlockLedgers(SEED_BLOCK_UTILIZATION_LEDGERS, { specialtyCode: 'ORTHOPEDICS' });
      assert.strictEqual(ortho.length, 2);

      // Filter by action RIGHTSIZE_DOWNGRADE
      const downgrade = filterBlockLedgers(SEED_BLOCK_UTILIZATION_LEDGERS, { rightsizingAction: 'RIGHTSIZE_DOWNGRADE' });
      assert.strictEqual(downgrade.length, 1);
      assert.strictEqual(downgrade[0].surgeon_name, 'Dr. Sarah Jenkins, MD');

      // Filter by text search
      const vance = filterBlockLedgers(SEED_BLOCK_UTILIZATION_LEDGERS, { search: 'Marcus Vance' });
      assert.strictEqual(vance.length, 1);
      assert.strictEqual(vance[0].block_name, 'Monday Orthopedic Primary Block');
    });
  });

  // 4. Database Migration SQL Integrity (082)
  describe('4. Database Migration SQL Integrity (082)', () => {
    test('forward migration 082 exists with core tables, views, indexes, and RLS', () => {
      const upPath = path.join(ROOT_DIR, 'supabase', 'migrations', '082_block_utilization_metrics.sql');
      assert.ok(fs.existsSync(upPath), '082_block_utilization_metrics.sql must exist');

      const sql = fs.readFileSync(upPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.or_block_utilization_period_ledgers'));
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.or_block_governance_actions'));
      assert.ok(sql.includes('allocated_minutes INTEGER NOT NULL'));
      assert.ok(sql.includes('unused_abandoned_minutes INTEGER NOT NULL'));
      assert.ok(sql.includes('adjusted_utilization_pct NUMERIC(5, 2) NOT NULL'));
      assert.ok(sql.includes('sbpi_score NUMERIC(5, 2) NOT NULL'));
      assert.ok(sql.includes('wastage_opportunity_cost NUMERIC(10, 2) NOT NULL'));
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_or_block_utilization_summary'));
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_or_block_wastage_leaderboard'));
      assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'));
      assert.ok(sql.includes('rls_or_block_utilization_period_ledgers_facility'));
      assert.ok(sql.includes('rls_or_block_governance_actions_facility'));
    });

    test('down migration 082 cleanly drops all views, policies, indexes, and tables CASCADE', () => {
      const downPath = path.join(ROOT_DIR, 'supabase', 'migrations', '082_block_utilization_metrics_down.sql');
      assert.ok(fs.existsSync(downPath), '082_block_utilization_metrics_down.sql must exist');

      const sql = fs.readFileSync(downPath, 'utf8');
      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_or_block_wastage_leaderboard CASCADE'));
      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_or_block_utilization_summary CASCADE'));
      assert.ok(sql.includes('DROP POLICY IF EXISTS rls_or_block_governance_actions_facility ON public.or_block_governance_actions'));
      assert.ok(sql.includes('DROP POLICY IF EXISTS rls_or_block_utilization_period_ledgers_facility ON public.or_block_utilization_period_ledgers'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.or_block_governance_actions CASCADE'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.or_block_utilization_period_ledgers CASCADE'));
    });
  });

  // 5. Maestro Design System Governance & App Wiring
  describe('5. Maestro Design System Governance & App Wiring', () => {
    test('strictly ZERO prohibited tokens in JSX and CSS', () => {
      const jsxPath = path.join(ROOT_DIR, 'src', 'components', 'BlockUtilizationMetricsView.jsx');
      const cssPath = path.join(ROOT_DIR, 'src', 'components', 'BlockUtilizationMetricsView.css');

      assert.ok(fs.existsSync(jsxPath), 'BlockUtilizationMetricsView.jsx must exist');
      assert.ok(fs.existsSync(cssPath), 'BlockUtilizationMetricsView.css must exist');

      const jsx = fs.readFileSync(jsxPath, 'utf8');
      const css = fs.readFileSync(cssPath, 'utf8');

      // Prohibited tokens regex: purple, violet, indigo, magenta, fuchsia tokens
      const prohibitedRegex = /(purple|violet|indigo|magenta|fuchsia)/i;

      assert.ok(!prohibitedRegex.test(jsx), 'BlockUtilizationMetricsView.jsx contains prohibited design tokens');
      assert.ok(!prohibitedRegex.test(css), 'BlockUtilizationMetricsView.css contains prohibited design tokens');
    });

    test('App.jsx correctly imports and registers BlockUtilizationMetricsView', () => {
      const appPath = path.join(ROOT_DIR, 'src', 'App.jsx');
      const app = fs.readFileSync(appPath, 'utf8');

      assert.ok(app.includes("import BlockUtilizationMetricsView from './components/BlockUtilizationMetricsView'"));
      assert.ok(app.includes("activeTab === 'block_utilization'"));
      assert.ok(app.includes("<BlockUtilizationMetricsView />"));
      assert.ok(app.includes("Block Utilization & Rightsizing"));
      assert.ok(app.includes("Block Utilization Metrics, Wastage & Rightsizing"));
    });

    test('Phase A5 master specification documents exist and are complete', () => {
      const localSpecPath = path.join(ROOT_DIR, 'docs', 'phases', 'A5_BLOCK_UTILIZATION_METRICS.md');
      const externalSpecPath = 'e:\\medicalAI\\ASCANALYST_All_Modules\\ASCANALYST_MD_SPECS\\Phase_10_OR_Scheduling\\A5_BLOCK_UTILIZATION_METRICS.md';

      assert.ok(fs.existsSync(localSpecPath), 'docs/phases/A5_BLOCK_UTILIZATION_METRICS.md must exist');
      assert.ok(fs.existsSync(externalSpecPath), 'External spec must exist');

      const specContent = fs.readFileSync(localSpecPath, 'utf8');
      assert.ok(specContent.includes('# A5 BLOCK UTILIZATION METRICS'));
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
