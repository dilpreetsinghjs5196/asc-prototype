import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ECONOMIC_QUADRANTS,
  ECONOMIC_BENCHMARKS,
  calculateGrossMargin,
  calculateDirectContributionMargin,
  calculateDirectContributionMarginPct,
  calculateFullyLoadedNetMargin,
  calculateMarginPerOrMinute,
  calculateMarginPerOrHour,
  calculateFullyLoadedMarginPerOrHour,
  calculateBreakevenCases,
  calculateBlockOpportunityCost,
  classifyEconomicQuadrant,
  calculateFacilityEconomicsKpis,
  SEED_CPT_ECONOMICS
} from '../src/services/cptEconomicsService.js';

import * as libWrapper from '../src/lib/cptEconomicsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

describe('Phase B6 — CPT Economics Test Suite', () => {
  describe('1. Economic Quadrants & Benchmark Standards', () => {
    it('should define canonical procedural economic quadrants', () => {
      const quadrants = [
        'PRIME_YIELD_ANCHOR',
        'VOLUME_PROFIT_BUILDER',
        'MARGIN_SQUEEZE_AT_RISK',
        'ECONOMIC_DEFICIT'
      ];
      quadrants.forEach(qKey => {
        const item = ECONOMIC_QUADRANTS[qKey];
        assert.ok(item, `Quadrant ${qKey} must exist`);
        assert.equal(item.key, qKey);
        assert.ok(item.label);
        const color = item.color.toLowerCase();
        assert.ok(!color.includes('purple') && !color.includes('violet'), `Color for ${qKey} must be clean`);
      });
    });

    it('should define authoritative facility economic benchmarks', () => {
      assert.equal(ECONOMIC_BENCHMARKS.TARGET_MARGIN_PER_OR_HOUR, 2000.0);
      assert.equal(ECONOMIC_BENCHMARKS.MIN_CONTRIBUTION_MARGIN_PCT, 45.0);
      assert.equal(ECONOMIC_BENCHMARKS.MIN_COLLECTION_REALIZATION_PCT, 60.0);
      assert.equal(ECONOMIC_BENCHMARKS.FACILITY_HOURLY_OVERHEAD_BENCHMARK, 450.0);
    });
  });

  describe('2. Deterministic Mathematical Calculations', () => {
    it('should calculate procedural gross margin correctly', () => {
      // TKA: $7,200 net collections - ($2,500 implant + $600 supplies) = $4,100 gross margin
      assert.equal(calculateGrossMargin(7200, 2500, 600), 4100.0);
      // Colonoscopy (no implants): $1,050 net - (0 + $250 supplies) = $800 gross margin
      assert.equal(calculateGrossMargin(1050, 0, 250), 800.0);
      // Zero collections edge case
      assert.equal(calculateGrossMargin(0, 100, 50), -150.0);
    });

    it('should calculate direct contribution margin and percentage', () => {
      // TKA: $7,200 net - $3,900 direct costs = $3,300 contribution margin
      assert.equal(calculateDirectContributionMargin(7200, 3900), 3300.0);
      assert.equal(calculateDirectContributionMarginPct(3300, 7200), 45.83);

      // Cataract: $1,450 net - $710 direct costs = $740 margin (51.03%)
      assert.equal(calculateDirectContributionMargin(1450, 710), 740.0);
      assert.equal(calculateDirectContributionMarginPct(740, 1450), 51.03);

      // Zero collections edge case
      assert.equal(calculateDirectContributionMarginPct(500, 0), 0.0);
    });

    it('should calculate fully loaded net operating margin', () => {
      // TKA: $7,200 net - $4,533.75 loaded cost = $2,666.25 net margin
      assert.equal(calculateFullyLoadedNetMargin(7200, 4533.75), 2666.25);
      // Sinus: $2,800 net - $2,410 loaded cost = $390 net margin
      assert.equal(calculateFullyLoadedNetMargin(2800, 2410), 390.0);
    });

    it('should calculate margin per OR-minute and OR-hour', () => {
      // TKA: $3,300 margin / 84.5 min = $39.05 / min -> $2,343.20 / hr
      assert.equal(calculateMarginPerOrMinute(3300, 84.5), 39.05);
      assert.equal(calculateMarginPerOrHour(3300, 84.5), 2343.2);

      // Cataract: $740 margin / 18.5 min = $40.00 / min -> $2,400.00 / hr
      assert.equal(calculateMarginPerOrMinute(740, 18.5), 40.0);
      assert.equal(calculateMarginPerOrHour(740, 18.5), 2400.0);

      // Zero minutes edge case
      assert.equal(calculateMarginPerOrMinute(1000, 0), 0.0);
      assert.equal(calculateMarginPerOrHour(1000, 0), 0.0);
    });

    it('should calculate fully loaded margin per OR-hour', () => {
      // TKA: $2,666.25 loaded net margin / 84.5 min * 60 = $1,893.20 / hr
      assert.equal(calculateFullyLoadedMarginPerOrHour(2666.25, 84.5), 1893.2);
    });

    it('should calculate breakeven annual case volume', () => {
      // $116,610 allocated overhead / $3,300 margin per case = 36 cases
      assert.equal(calculateBreakevenCases(116610, 3300), 36);
      // Zero margin per case edge case
      assert.equal(calculateBreakevenCases(50000, 0), 0);
    });

    it('should calculate suite block opportunity cost', () => {
      // Rotator cuff: $1,416.67 yield vs $2,000 benchmark for 72 minutes -> $700.00 deficit
      assert.equal(calculateBlockOpportunityCost(2000.0, 1416.67, 72.0), 700.0);
      // High-yielding case exceeding benchmark -> 0 opportunity cost
      assert.equal(calculateBlockOpportunityCost(2000.0, 2343.2, 84.5), 0.0);
    });

    it('should classify economic quadrants deterministically', () => {
      assert.equal(classifyEconomicQuadrant(2343.2, 45.83, 37.03), 'PRIME_YIELD_ANCHOR');
      assert.equal(classifyEconomicQuadrant(2052.63, 54.17, 42.29), 'VOLUME_PROFIT_BUILDER');
      assert.equal(classifyEconomicQuadrant(1416.67, 40.96, 27.95), 'VOLUME_PROFIT_BUILDER');
      assert.equal(classifyEconomicQuadrant(794.12, 32.14, 13.93), 'ECONOMIC_DEFICIT');
    });
  });

  describe('3. Facility-Wide KPI Aggregations', () => {
    it('should aggregate facility economic metrics across 10 seed procedures', () => {
      const kpis = calculateFacilityEconomicsKpis(SEED_CPT_ECONOMICS);

      assert.equal(kpis.totalEvaluatedProcedures, 10);
      assert.equal(kpis.totalAnnualVolume, 2279);
      assert.equal(kpis.totalNetCollections, 5428600);
      assert.equal(kpis.totalDirectCosts, 2892375);
      assert.equal(kpis.totalContributionMargin, 2536225);
      assert.equal(kpis.portfolioContributionMarginPct, 46.72);
      assert.equal(kpis.avgMarginPerOrHour, 1835.3);
      assert.equal(kpis.portfolioFullyLoadedMarginPct, 35.43);
      assert.equal(kpis.primeYieldAnchorCount, 4);
      assert.equal(kpis.economicDeficitCount, 1);
    });

    it('should return safe zero defaults for empty procedure arrays', () => {
      const emptyKpis = calculateFacilityEconomicsKpis([]);
      assert.equal(emptyKpis.totalEvaluatedProcedures, 0);
      assert.equal(emptyKpis.totalAnnualVolume, 0);
      assert.equal(emptyKpis.totalNetCollections, 0);
      assert.equal(emptyKpis.totalContributionMargin, 0);
      assert.equal(emptyKpis.avgMarginPerOrHour, 0.0);
    });
  });

  describe('4. Database Migration & Multi-Tenant RLS Security', () => {
    const upMigrationPath = path.join(ROOT_DIR, 'supabase', 'migrations', '095_cpt_economics.sql');
    const downMigrationPath = path.join(ROOT_DIR, 'supabase', 'migrations', '095_cpt_economics_down.sql');

    it('should have Migration 095 UP file with required schema elements', () => {
      assert.ok(fs.existsSync(upMigrationPath), '095 UP migration must exist');
      const sql = fs.readFileSync(upMigrationPath, 'utf8');

      // Tables
      assert.ok(sql.includes('cpt_economics_metrics'), 'Must create cpt_economics_metrics');
      assert.ok(sql.includes('cpt_cost_component_breakdown'), 'Must create cpt_cost_component_breakdown');
      assert.ok(sql.includes('cpt_economic_payer_yields'), 'Must create cpt_economic_payer_yields');

      // Analytical Views
      assert.ok(sql.includes('vw_cpt_economics_summary'), 'Must create vw_cpt_economics_summary');
      assert.ok(sql.includes('vw_cpt_breakeven_and_yield_matrix'), 'Must create vw_cpt_breakeven_and_yield_matrix');

      // Multi-tenancy RLS
      assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'), 'Must enable RLS');
      assert.ok(sql.includes('app.current_facility_id'), 'Must enforce facility isolation via app.current_facility_id');
    });

    it('should have Migration 095 DOWN file with clean rollback', () => {
      assert.ok(fs.existsSync(downMigrationPath), '095 DOWN migration must exist');
      const sql = fs.readFileSync(downMigrationPath, 'utf8');
      assert.ok(sql.includes('vw_cpt_breakeven_and_yield_matrix'), 'Must drop breakeven view');
      assert.ok(sql.includes('vw_cpt_economics_summary'), 'Must drop summary view');
      assert.ok(sql.includes('cpt_economic_payer_yields'), 'Must drop payer yields table');
      assert.ok(sql.includes('cpt_cost_component_breakdown'), 'Must drop cost breakdown table');
      assert.ok(sql.includes('cpt_economics_metrics'), 'Must drop metrics table');
    });
  });

  describe('5. Clinical UI Design & Zero-Purple Compliance', () => {
    const jsxPath = path.join(ROOT_DIR, 'src', 'components', 'CptEconomicsView.jsx');
    const cssPath = path.join(ROOT_DIR, 'src', 'components', 'CptEconomicsView.css');
    const appPath = path.join(ROOT_DIR, 'src', 'App.jsx');

    it('should have CptEconomicsView.jsx strictly free of purple tokens', () => {
      assert.ok(fs.existsSync(jsxPath), 'JSX file must exist');
      const jsx = fs.readFileSync(jsxPath, 'utf8');
      const forbiddenRegex = /purple|violet|fuchsia|magenta|indigo/i;
      assert.ok(!forbiddenRegex.test(jsx), 'Component JSX must NOT contain forbidden purple/violet color tokens');
    });

    it('should have CptEconomicsView.css strictly free of purple tokens', () => {
      assert.ok(fs.existsSync(cssPath), 'CSS file must exist');
      const css = fs.readFileSync(cssPath, 'utf8');
      const forbiddenRegex = /purple|violet|fuchsia|magenta/i;
      assert.ok(!forbiddenRegex.test(css), 'Component CSS must NOT contain forbidden purple tokens');
    });

    it('should implement responsive ribbon grid and scoped cpte- styles', () => {
      const css = fs.readFileSync(cssPath, 'utf8');
      assert.ok(css.includes('.cpte-container'), 'Must have container class');
      assert.ok(css.includes('.cpte-ribbon'), 'Must have ribbon grid class');
      assert.ok(css.includes('repeat(5, minmax(0, 1fr))'), 'Must have 5-card responsive grid');
      assert.ok(css.includes('.cpte-modal-backdrop'), 'Must have modal backdrop');
      assert.ok(css.includes('.cpte-modal-container'), 'Must have modal container');
      assert.ok(css.includes('[data-theme="dark"]'), 'Must support dark mode');
    });

    it('should verify App.jsx has wired the component and tab', () => {
      const app = fs.readFileSync(appPath, 'utf8');
      assert.ok(app.includes("import CptEconomicsView from './components/CptEconomicsView';"), 'Must import view');
      assert.ok(app.includes("activeTab === 'cpt_economics'"), 'Must handle cpt_economics activeTab');
      assert.ok(app.includes('<CptEconomicsView />'), 'Must render CptEconomicsView');
    });
  });

  describe('6. Library Re-export Facade', () => {
    it('should re-export all essential functions and datasets from lib wrapper', () => {
      assert.ok(typeof libWrapper.calculateGrossMargin === 'function');
      assert.ok(typeof libWrapper.calculateDirectContributionMargin === 'function');
      assert.ok(typeof libWrapper.calculateDirectContributionMarginPct === 'function');
      assert.ok(typeof libWrapper.calculateFullyLoadedNetMargin === 'function');
      assert.ok(typeof libWrapper.calculateMarginPerOrMinute === 'function');
      assert.ok(typeof libWrapper.calculateMarginPerOrHour === 'function');
      assert.ok(typeof libWrapper.calculateFullyLoadedMarginPerOrHour === 'function');
      assert.ok(typeof libWrapper.calculateBreakevenCases === 'function');
      assert.ok(typeof libWrapper.calculateBlockOpportunityCost === 'function');
      assert.ok(typeof libWrapper.classifyEconomicQuadrant === 'function');
      assert.ok(typeof libWrapper.calculateFacilityEconomicsKpis === 'function');
      assert.ok(Array.isArray(libWrapper.SEED_CPT_ECONOMICS));
      assert.equal(libWrapper.SEED_CPT_ECONOMICS.length, 10);
    });
  });
});
