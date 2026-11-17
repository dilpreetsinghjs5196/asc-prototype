import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CPT_SPECIALTIES,
  CPT_PERFORMANCE_TIERS,
  CPT_BENCHMARKS,
  calculateCptContributionMargin,
  calculateCptMarginPerOrHour,
  calculateCptMedicarePercent,
  calculateCptDurationVariance,
  calculateCptDenialRate,
  calculateCptFrictionIndex,
  classifyCptTier,
  calculateFacilityCptKpis,
  SEED_CPT_INTELLIGENCE
} from '../src/services/cptIntelligenceService.js';

import * as libWrapper from '../src/lib/cptIntelligenceService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

describe('Phase B5 — CPT Intelligence Test Suite', () => {
  describe('1. CPT Specialties & Performance Tiers', () => {
    it('should define canonical ambulatory surgical specialties', () => {
      const specialties = ['ORTHOPEDICS', 'OPHTHALMOLOGY', 'GASTROENTEROLOGY', 'ENT', 'GENERAL_SURGERY', 'PAIN_MANAGEMENT'];
      specialties.forEach(spKey => {
        assert.ok(CPT_SPECIALTIES[spKey], `Specialty ${spKey} must exist`);
        assert.equal(CPT_SPECIALTIES[spKey].key, spKey);
        assert.ok(CPT_SPECIALTIES[spKey].label);
      });
    });

    it('should define performance tiers with zero forbidden color tokens', () => {
      const tiers = [
        'TIER_1_ANCHOR_PROFIT',
        'TIER_2_EFFICIENT_VOLUME',
        'TIER_3_MARGIN_DILUTER',
        'TIER_4_HIGH_FRICTION'
      ];
      tiers.forEach(tierKey => {
        const item = CPT_PERFORMANCE_TIERS[tierKey];
        assert.ok(item, `Tier ${tierKey} must exist`);
        assert.equal(item.key, tierKey);
        const color = item.color.toLowerCase();
        assert.ok(!color.includes('purple') && !color.includes('violet'), `Color for ${tierKey} must be clean`);
      });
    });

    it('should define authoritative procedural benchmarks', () => {
      assert.equal(CPT_BENCHMARKS.TARGET_MARGIN_PER_OR_HOUR, 1800.0);
      assert.equal(CPT_BENCHMARKS.MIN_MEDICARE_PARITY_PCT, 175.0);
      assert.equal(CPT_BENCHMARKS.MAX_ACCEPTABLE_DENIAL_RATE_PCT, 8.0);
      assert.equal(CPT_BENCHMARKS.MAX_FRICTION_INDEX, 35.0);
    });
  });

  describe('2. Deterministic Mathematical Calculations', () => {
    it('should calculate procedural contribution margin correctly', () => {
      // TKA: $1,324,800 net collections - $680,800 direct variable cost = $644,000 margin
      assert.equal(calculateCptContributionMargin(1324800, 680800), 644000.0);
      // Colonoscopy: $399,000 - $171,000 = $228,000 margin
      assert.equal(calculateCptContributionMargin(399000, 171000), 228000.0);
      // Zero cost edge case
      assert.equal(calculateCptContributionMargin(10000, 0), 10000.0);
    });

    it('should calculate contribution margin per OR-hour', () => {
      // TKA: $3,500 margin per case / 84.5 min * 60 = $2,485.21 / hr
      assert.equal(calculateCptMarginPerOrHour(3500, 84.5), 2485.21);
      // Cataract: $790 margin per case / 18.5 min * 60 = $2,562.16 / hr
      assert.equal(calculateCptMarginPerOrHour(790, 18.5), 2562.16);
      // Zero minutes edge case
      assert.equal(calculateCptMarginPerOrHour(1500, 0), 0.0);
    });

    it('should calculate Medicare ASC base rate parity percentage', () => {
      // TKA: $7,200 commercial allowed on $3,550 Medicare base -> 202.82%
      assert.equal(calculateCptMedicarePercent(7200, 3550), 202.82);
      // THA: $7,800 commercial allowed on $3,680 Medicare base -> 211.96%
      assert.equal(calculateCptMedicarePercent(7800, 3680), 211.96);
      // Zero Medicare rate edge case
      assert.equal(calculateCptMedicarePercent(5000, 0), 0.0);
    });

    it('should calculate operative duration variance vs calibrated P80', () => {
      // Faster: 84.5 actual vs 90.0 P80 -> -5.5m variance
      assert.equal(calculateCptDurationVariance(84.5, 90.0), -5.5);
      // Overrun: 81.5 actual vs 70.0 P80 -> +11.5m variance
      assert.equal(calculateCptDurationVariance(81.5, 70.0), 11.5);
    });

    it('should calculate first-pass procedural denial rate', () => {
      // 9 denied cases out of 184 -> 4.89%
      assert.equal(calculateCptDenialRate(9, 184), 4.89);
      // 24 denied cases out of 165 -> 14.55%
      assert.equal(calculateCptDenialRate(24, 165), 14.55);
      // Zero total cases edge case
      assert.equal(calculateCptDenialRate(5, 0), 0.0);
    });

    it('should calculate procedural friction index within bounded 0-100 range', () => {
      // High friction: 14.55% denial, 36.8 days to pay, 2.8 doc lag days
      const highIndex = calculateCptFrictionIndex(14.55, 36.8, 2.8);
      assert.ok(highIndex >= 40.0 && highIndex <= 100.0, `High index ${highIndex} should be elevated`);

      // Low friction clean case: 3.1% denial, 18.4 days to pay, 0.8 doc lag days
      const lowIndex = calculateCptFrictionIndex(3.1, 18.4, 0.8);
      assert.ok(lowIndex < 25.0, `Low index ${lowIndex} should be low`);
    });

    it('should classify performance tiers deterministically', () => {
      assert.equal(classifyCptTier(2485.21, 21.5, 4.89), 'TIER_1_ANCHOR_PROFIT');
      assert.equal(classifyCptTier(1636.36, 16.8, 5.26), 'TIER_2_EFFICIENT_VOLUME');
      assert.equal(classifyCptTier(926.47, 41.5, 11.3), 'TIER_4_HIGH_FRICTION');
      assert.equal(classifyCptTier(1150.0, 20.0, 4.0), 'TIER_3_MARGIN_DILUTER');
    });
  });

  describe('3. Facility-Wide KPI Aggregations', () => {
    it('should aggregate facility procedural metrics across 10 seed CPT codes', () => {
      const kpis = calculateFacilityCptKpis(SEED_CPT_INTELLIGENCE);

      assert.equal(kpis.totalEvaluatedCpts, 10);
      assert.equal(kpis.totalAnnualVolume, 2279);
      assert.equal(kpis.totalNetCollections, 5428600);
      assert.equal(kpis.totalContributionMargin, 2750150);
      assert.equal(kpis.avgMarginPerOrHour, 1998.61);
      assert.equal(kpis.portfolioMedicareParityPct, 190.22);
      assert.equal(kpis.avgFirstPassDenialRatePct, 6.77);
      assert.equal(kpis.highFrictionCount, 2);
      assert.equal(kpis.anchorProfitCount, 5);
    });

    it('should return safe zero defaults for empty procedure arrays', () => {
      const emptyKpis = calculateFacilityCptKpis([]);
      assert.equal(emptyKpis.totalEvaluatedCpts, 0);
      assert.equal(emptyKpis.totalAnnualVolume, 0);
      assert.equal(emptyKpis.totalNetCollections, 0);
      assert.equal(emptyKpis.totalContributionMargin, 0);
      assert.equal(emptyKpis.avgMarginPerOrHour, 0.0);
    });
  });

  describe('4. Database Migration & Multi-Tenant RLS Security', () => {
    const upMigrationPath = path.join(ROOT_DIR, 'supabase', 'migrations', '094_cpt_intelligence.sql');
    const downMigrationPath = path.join(ROOT_DIR, 'supabase', 'migrations', '094_cpt_intelligence_down.sql');

    it('should have Migration 094 UP file with required schema elements', () => {
      assert.ok(fs.existsSync(upMigrationPath), '094 UP migration must exist');
      const sql = fs.readFileSync(upMigrationPath, 'utf8');

      // Tables
      assert.ok(sql.includes('cpt_intelligence_metrics'), 'Must create cpt_intelligence_metrics');
      assert.ok(sql.includes('cpt_surgeon_performance_breakdown'), 'Must create cpt_surgeon_performance_breakdown');
      assert.ok(sql.includes('cpt_payer_reimbursement_spread'), 'Must create cpt_payer_reimbursement_spread');

      // Analytical Views
      assert.ok(sql.includes('vw_cpt_intelligence_summary'), 'Must create vw_cpt_intelligence_summary');
      assert.ok(sql.includes('vw_cpt_margin_friction_radar'), 'Must create vw_cpt_margin_friction_radar');

      // Multi-tenancy RLS
      assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'), 'Must enable RLS');
      assert.ok(sql.includes('app.current_facility_id'), 'Must enforce facility isolation via app.current_facility_id');
    });

    it('should have Migration 094 DOWN file with clean rollback', () => {
      assert.ok(fs.existsSync(downMigrationPath), '094 DOWN migration must exist');
      const sql = fs.readFileSync(downMigrationPath, 'utf8');
      assert.ok(sql.includes('vw_cpt_margin_friction_radar'), 'Must drop radar view');
      assert.ok(sql.includes('vw_cpt_intelligence_summary'), 'Must drop summary view');
      assert.ok(sql.includes('cpt_payer_reimbursement_spread'), 'Must drop payer spread table');
      assert.ok(sql.includes('cpt_surgeon_performance_breakdown'), 'Must drop surgeon breakdown table');
      assert.ok(sql.includes('cpt_intelligence_metrics'), 'Must drop metrics table');
    });
  });

  describe('5. Clinical UI Design & Zero-Purple Compliance', () => {
    const jsxPath = path.join(ROOT_DIR, 'src', 'components', 'CptIntelligenceView.jsx');
    const cssPath = path.join(ROOT_DIR, 'src', 'components', 'CptIntelligenceView.css');
    const appPath = path.join(ROOT_DIR, 'src', 'App.jsx');

    it('should have CptIntelligenceView.jsx strictly free of purple tokens', () => {
      assert.ok(fs.existsSync(jsxPath), 'JSX file must exist');
      const jsx = fs.readFileSync(jsxPath, 'utf8');
      const forbiddenRegex = /purple|violet|fuchsia|magenta|indigo/i;
      assert.ok(!forbiddenRegex.test(jsx), 'Component JSX must NOT contain forbidden purple/violet color tokens');
    });

    it('should have CptIntelligenceView.css strictly free of purple tokens', () => {
      assert.ok(fs.existsSync(cssPath), 'CSS file must exist');
      const css = fs.readFileSync(cssPath, 'utf8');
      const forbiddenRegex = /purple|violet|fuchsia|magenta/i;
      assert.ok(!forbiddenRegex.test(css), 'Component CSS must NOT contain forbidden purple tokens');
    });

    it('should implement responsive ribbon grid and scoped cpti- styles', () => {
      const css = fs.readFileSync(cssPath, 'utf8');
      assert.ok(css.includes('.cpti-container'), 'Must have container class');
      assert.ok(css.includes('.cpti-ribbon'), 'Must have ribbon grid class');
      assert.ok(css.includes('repeat(5, minmax(0, 1fr))'), 'Must have 5-card responsive grid');
      assert.ok(css.includes('.cpti-modal-backdrop'), 'Must have modal backdrop');
      assert.ok(css.includes('.cpti-modal-container'), 'Must have modal container');
      assert.ok(css.includes('[data-theme="dark"]'), 'Must support dark mode');
    });

    it('should verify App.jsx has wired the component and tab', () => {
      const app = fs.readFileSync(appPath, 'utf8');
      assert.ok(app.includes("import CptIntelligenceView from './components/CptIntelligenceView';"), 'Must import view');
      assert.ok(app.includes("activeTab === 'cpt_intelligence'"), 'Must handle cpt_intelligence activeTab');
      assert.ok(app.includes('<CptIntelligenceView />'), 'Must render CptIntelligenceView');
    });
  });

  describe('6. Library Re-export Facade', () => {
    it('should re-export all essential functions and datasets from lib wrapper', () => {
      assert.ok(typeof libWrapper.calculateCptContributionMargin === 'function');
      assert.ok(typeof libWrapper.calculateCptMarginPerOrHour === 'function');
      assert.ok(typeof libWrapper.calculateCptMedicarePercent === 'function');
      assert.ok(typeof libWrapper.calculateCptDurationVariance === 'function');
      assert.ok(typeof libWrapper.calculateCptDenialRate === 'function');
      assert.ok(typeof libWrapper.calculateCptFrictionIndex === 'function');
      assert.ok(typeof libWrapper.classifyCptTier === 'function');
      assert.ok(typeof libWrapper.calculateFacilityCptKpis === 'function');
      assert.ok(Array.isArray(libWrapper.SEED_CPT_INTELLIGENCE));
      assert.equal(libWrapper.SEED_CPT_INTELLIGENCE.length, 10);
    });
  });
});
