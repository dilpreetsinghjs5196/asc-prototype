import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PAYER_CATEGORIES,
  FINANCIAL_BENCHMARKS,
  calculateRealizationRate,
  calculateTotalDirectCost,
  calculateContributionMargin,
  calculateContributionMarginPct,
  calculateMarginPerOrHour,
  calculatePercentileRank,
  flagNegativeMarginCpts,
  calculateFacilityFinancialKpis,
  SEED_SURGEON_FINANCIAL_SCORECARDS
} from '../src/services/surgeonFinancialScorecardService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

describe('Phase B1 — Surgeon Financial Scorecard Test Suite', () => {
  describe('1. Payer Taxonomy & Financial Benchmarks', () => {
    it('should define all 5 authoritative payer categories', () => {
      const expected = ['COMMERCIAL', 'MEDICARE', 'MEDICAID', 'WORKERS_COMP', 'SELF_PAY'];
      expected.forEach(cat => {
        assert.ok(PAYER_CATEGORIES[cat], `Payer category ${cat} must exist`);
        assert.equal(PAYER_CATEGORIES[cat].key, cat);
      });
    });

    it('should define facility financial benchmarks', () => {
      assert.equal(FINANCIAL_BENCHMARKS.TARGET_COLLECTION_REALIZATION_PCT, 70.0);
      assert.equal(FINANCIAL_BENCHMARKS.TARGET_MARGIN_PER_OR_HOUR, 1800.0);
      assert.equal(FINANCIAL_BENCHMARKS.TARGET_CONTRIBUTION_MARGIN_PCT, 60.0);
      assert.equal(FINANCIAL_BENCHMARKS.MAX_DIRECT_COST_RATIO_PCT, 40.0);
    });
  });

  describe('2. Deterministic Revenue Cycle & Cost Calculations', () => {
    it('calculateRealizationRate: accurately calculates collection realization % and handles zero division', () => {
      const rate = calculateRealizationRate(199150, 284500);
      assert.equal(rate, 70.0);

      const zeroRate = calculateRealizationRate(5000, 0);
      assert.equal(zeroRate, 0.0);
    });

    it('calculateTotalDirectCost: sums labor, implant, supply, and sterile costs', () => {
      const direct = calculateTotalDirectCost({
        laborCost: 8800,
        implantCost: 12400,
        supplyCost: 3600,
        sterileCost: 1550
      });
      assert.equal(direct, 26350.0);
    });

    it('calculateContributionMargin: subtracts total direct costs from net collections', () => {
      const cm = calculateContributionMargin(199150, 26350);
      assert.equal(cm, 172800.0);
    });

    it('calculateContributionMarginPct: computes percentage of net collections', () => {
      const cmPct = calculateContributionMarginPct(172800, 199150);
      assert.equal(cmPct, 86.77);

      const zeroPct = calculateContributionMarginPct(500, 0);
      assert.equal(zeroPct, 0.0);
    });

    it('calculateMarginPerOrHour: computes yield per operative hour with zero-division safety', () => {
      // $172,800 CM across 4,620 OR minutes = 77 hours -> $172,800 / 77 = $2,244.16 / hr
      const yieldPerHour = calculateMarginPerOrHour(172800, 4620);
      assert.equal(yieldPerHour, 2244.16);

      const zeroYield = calculateMarginPerOrHour(172800, 0);
      assert.equal(zeroYield, 0.0);
    });

    it('calculatePercentileRank: computes peer percentile accurately', () => {
      const dataset = [900, 1300, 1472, 1714, 1817, 2018, 2100, 2183, 2244];
      const rankTop = calculatePercentileRank(2244, dataset);
      assert.ok(rankTop >= 85.0);

      const rankBottom = calculatePercentileRank(900, dataset);
      assert.equal(rankBottom, 0.0);
    });

    it('flagNegativeMarginCpts: filters procedures with negative margin', () => {
      const cpts = [
        { cptCode: '27447', avgContributionMargin: 4420 },
        { cptCode: '99999', avgContributionMargin: -350 },
        { cptCode: '29881', avgContributionMargin: 2630 }
      ];

      const negative = flagNegativeMarginCpts(cpts);
      assert.equal(negative.length, 1);
      assert.equal(negative[0].cptCode, '99999');
    });
  });

  describe('3. Facility Financial KPI Aggregations', () => {
    it('should aggregate facility financial totals from seed scorecards', () => {
      const kpis = calculateFacilityFinancialKpis(SEED_SURGEON_FINANCIAL_SCORECARDS);

      assert.equal(kpis.totalCases, 332);
      assert.ok(kpis.totalGrossBilled > 1400000);
      assert.ok(kpis.totalNetCollections > 900000);
      assert.ok(kpis.totalContributionMargin > 750000);
      assert.ok(kpis.avgMarginPerOrHour > 1700 && kpis.avgMarginPerOrHour < 2100);
      assert.ok(kpis.facilityRealizationPct >= 64.0 && kpis.facilityRealizationPct <= 72.0);
    });

    it('should return safe zero defaults for empty scorecards array', () => {
      const emptyKpis = calculateFacilityFinancialKpis([]);
      assert.equal(emptyKpis.totalCases, 0);
      assert.equal(emptyKpis.totalGrossBilled, 0);
      assert.equal(emptyKpis.totalNetCollections, 0);
      assert.equal(emptyKpis.totalContributionMargin, 0);
      assert.equal(emptyKpis.avgMarginPerOrHour, 0);
      assert.equal(emptyKpis.facilityRealizationPct, 0);
    });
  });

  describe('4. Database Migration 090 SQL Integrity', () => {
    it('UP migration 090 should contain required tables, columns, RLS, and BIGINT surgeon_id', () => {
      const sqlPath = path.join(ROOT_DIR, 'supabase', 'migrations', '090_surgeon_financial_scorecard.sql');
      assert.ok(fs.existsSync(sqlPath), 'Migration 090_surgeon_financial_scorecard.sql must exist');

      const sql = fs.readFileSync(sqlPath, 'utf8');
      assert.ok(sql.includes('public.surgeon_financial_scorecards'));
      assert.ok(sql.includes('public.surgeon_cpt_financial_performance'));
      assert.ok(sql.includes('surgeon_id BIGINT NOT NULL REFERENCES public.surgeons(id)'));
      assert.ok(sql.includes('gross_billed_charges'));
      assert.ok(sql.includes('net_collections'));
      assert.ok(sql.includes('margin_per_or_hour'));
      assert.ok(sql.includes('vw_surgeon_financial_scorecard_summary'));
      assert.ok(sql.includes('vw_surgeon_cpt_profitability_ranking'));
      assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'));
      assert.ok(sql.includes('app.current_facility_id'));
    });

    it('DOWN migration 090 should cleanly drop all views, policies, indexes, and tables with CASCADE', () => {
      const sqlDownPath = path.join(ROOT_DIR, 'supabase', 'migrations', '090_surgeon_financial_scorecard_down.sql');
      assert.ok(fs.existsSync(sqlDownPath), 'Migration 090_surgeon_financial_scorecard_down.sql must exist');

      const sql = fs.readFileSync(sqlDownPath, 'utf8');
      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_surgeon_cpt_profitability_ranking CASCADE;'));
      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_surgeon_financial_scorecard_summary CASCADE;'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.surgeon_cpt_financial_performance CASCADE;'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.surgeon_financial_scorecards CASCADE;'));
    });
  });

  describe('5. Maestro Clinical Design System Zero-Purple Compliance', () => {
    it('SurgeonFinancialScorecardView.jsx must contain zero prohibited purple/violet/indigo tokens', () => {
      const jsxPath = path.join(ROOT_DIR, 'src', 'components', 'SurgeonFinancialScorecardView.jsx');
      assert.ok(fs.existsSync(jsxPath));

      const jsx = fs.readFileSync(jsxPath, 'utf8');
      const purpleRegex = /\b(purple|violet|indigo|fuchsia|magenta)\b/i;
      assert.ok(!purpleRegex.test(jsx), 'SurgeonFinancialScorecardView.jsx contains prohibited purple/violet tokens');
    });

    it('SurgeonFinancialScorecardView.css must contain zero prohibited purple/violet/indigo tokens', () => {
      const cssPath = path.join(ROOT_DIR, 'src', 'components', 'SurgeonFinancialScorecardView.css');
      assert.ok(fs.existsSync(cssPath));

      const css = fs.readFileSync(cssPath, 'utf8');
      const purpleRegex = /\b(purple|violet|indigo|fuchsia|magenta|#8b5cf6|#a855f7|#6366f1|#7c3aed|#9333ea)\b/i;
      assert.ok(!purpleRegex.test(css), 'SurgeonFinancialScorecardView.css contains prohibited purple/violet tokens');
    });

    it('SurgeonFinancialScorecardView.css must enforce pinned modal layout', () => {
      const cssPath = path.join(ROOT_DIR, 'src', 'components', 'SurgeonFinancialScorecardView.css');
      const css = fs.readFileSync(cssPath, 'utf8');

      assert.ok(css.includes('.sfs-modal-card'));
      assert.ok(css.includes('max-height: 90vh'));
      assert.ok(css.includes('display: flex'));
      assert.ok(css.includes('flex-direction: column'));
      assert.ok(css.includes('overflow-y: auto'));
    });
  });

  describe('6. Application Wiring in App.jsx', () => {
    it('App.jsx should import and wire SurgeonFinancialScorecardView', () => {
      const appPath = path.join(ROOT_DIR, 'src', 'App.jsx');
      const app = fs.readFileSync(appPath, 'utf8');

      assert.ok(app.includes("import SurgeonFinancialScorecardView from './components/SurgeonFinancialScorecardView'"));
      assert.ok(app.includes("activeTab === 'surgeon_financial_scorecard'"));
      assert.ok(app.includes('<SurgeonFinancialScorecardView'));
    });
  });
});
