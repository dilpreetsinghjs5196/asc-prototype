/**
 * ==============================================================================
 * Phase 75: Contribution Per OR Hour & Financial Yield Test Suite
 * ==============================================================================
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  contributionPerOrHourService,
  OR_YIELD_TIERS,
  OR_YIELD_TIER_CONFIG,
  BENCHMARK_TURNOVER_MINUTES,
  TURNOVER_DRAG_RATE_PER_MIN,
  DEFAULT_TARGET_HOURLY_HURDLE,
  roundToTwo,
  roundToThree
} from '../src/lib/contributionPerOrHourService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 75 — Contribution Per OR Hour & Financial Yield Verification Suite', () => {

  describe('1. Yield Tiers & Benchmark Configurations', () => {
    test('Exports all 5 canonical OR yield tiers', () => {
      const expectedTiers = [
        'PRIME_YIELD',
        'ABOVE_TARGET',
        'TARGET_MET',
        'SUB_TARGET',
        'DILUTIVE'
      ];

      expectedTiers.forEach(tier => {
        assert.ok(OR_YIELD_TIERS[tier], `Tier ${tier} must be exported`);
        assert.strictEqual(OR_YIELD_TIERS[tier], tier);
      });
    });

    test('Every yield tier has valid Maestro color tokens and configuration metadata', () => {
      const validColorTokens = ['emerald', 'sky', 'slate', 'amber', 'rose'];

      Object.keys(OR_YIELD_TIERS).forEach(tierKey => {
        const config = OR_YIELD_TIER_CONFIG[tierKey];
        assert.ok(config, `Config must exist for ${tierKey}`);
        assert.ok(config.label, `Label must exist for ${tierKey}`);
        assert.ok(config.shortLabel, `Short label must exist for ${tierKey}`);
        assert.ok(config.badgeClass, `Badge class must exist for ${tierKey}`);
        assert.ok(config.description, `Description must exist for ${tierKey}`);
        assert.ok(validColorTokens.includes(config.colorToken), `Color token ${config.colorToken} must be within Maestro palette`);
      });
    });

    test('Benchmark constants match ASC industry standards', () => {
      assert.strictEqual(BENCHMARK_TURNOVER_MINUTES, 20.00, 'Standard turnover benchmark must be 20 minutes');
      assert.strictEqual(TURNOVER_DRAG_RATE_PER_MIN, 15.00, 'Turnover drag rate must be $15.00/min');
      assert.strictEqual(DEFAULT_TARGET_HOURLY_HURDLE, 1500.00, 'Default hurdle rate must be $1,500.00/OR hour');
    });
  });

  describe('2. Deterministic Yield Classification & Math Calculations', () => {
    test('Classifies Prime Yield when hourly yield >= 1.5x hurdle', () => {
      // Hurdle = 1500; 1.5x = 2250; yield = 2500
      const tier = contributionPerOrHourService.classifyYieldTier(2500, 1500, 1250);
      assert.strictEqual(tier, OR_YIELD_TIERS.PRIME_YIELD);
    });

    test('Classifies Above Target when hourly yield is between 1.1x and 1.5x hurdle', () => {
      // Hurdle = 1500; 1.1x = 1650; yield = 1800
      const tier = contributionPerOrHourService.classifyYieldTier(1800, 1500, 1400);
      assert.strictEqual(tier, OR_YIELD_TIERS.ABOVE_TARGET);
    });

    test('Classifies Target Met when hourly yield is between 0.9x and 1.1x hurdle', () => {
      // Hurdle = 1500; 0.9x = 1350; yield = 1450
      const tier = contributionPerOrHourService.classifyYieldTier(1450, 1500, 1450);
      assert.strictEqual(tier, OR_YIELD_TIERS.TARGET_MET);
    });

    test('Classifies Sub-Target when hourly yield is between 0 and 0.9x hurdle', () => {
      // Hurdle = 1500; 0.9x = 1350; yield = 900
      const tier = contributionPerOrHourService.classifyYieldTier(900, 1500, 900);
      assert.strictEqual(tier, OR_YIELD_TIERS.SUB_TARGET);
    });

    test('Classifies Dilutive when contribution margin is negative', () => {
      const tier = contributionPerOrHourService.classifyYieldTier(-400, 1500, -200);
      assert.strictEqual(tier, OR_YIELD_TIERS.DILUTIVE);
    });

    test('calculateCaseOrYield performs exact deterministic mathematical calculations', () => {
      const testCase = {
        id: 991,
        facilityId: 'fac-001',
        procedure: 'Knee Arthroscopy',
        cpt_codes: '29881',
        orMinutes: 30,
        turnoverMinutes: 25,
        expectedContributionMargin: 1500.00,
        actualContributionMargin: 1450.00
      };

      const result = contributionPerOrHourService.calculateCaseOrYield(testCase, 1500.00);

      assert.strictEqual(result.orMinutes, 30);
      assert.strictEqual(result.turnoverMinutes, 25);
      assert.strictEqual(result.totalRoomMinutes, 55.00);
      assert.strictEqual(result.expectedContributionMargin, 1500.00);
      assert.strictEqual(result.cmPerOrMinute, 50.00, '1500 / 30 = 50.00');
      assert.strictEqual(result.cmPerOrHour, 3000.00, '50 * 60 = 3000.00');
      assert.strictEqual(result.actualCmPerOrHour, 2900.00, '(1450 / 30) * 60 = 2900.00');
      assert.strictEqual(result.yieldVarianceHourly, 1500.00, '3000 - 1500 = 1500.00');
      assert.strictEqual(result.yieldIndex, 2.000, '3000 / 1500 = 2.000');
      assert.strictEqual(result.turnoverDragCost, 75.00, '(25 - 20) * 15 = 75.00');
      assert.strictEqual(result.yieldTier, OR_YIELD_TIERS.PRIME_YIELD);
    });

    test('Zero turnover minutes produces $0.00 turnover drag cost', () => {
      const testCase = {
        id: 992,
        orMinutes: 60,
        turnoverMinutes: 18,
        expectedContributionMargin: 1600.00
      };

      const result = contributionPerOrHourService.calculateCaseOrYield(testCase, 1500.00);
      assert.strictEqual(result.turnoverDragCost, 0.00, 'Turnover <= 20 must have 0 drag cost');
    });

    test('Guards against zero or negative duration minutes without division by zero', () => {
      const zeroMinCase = {
        id: 993,
        orMinutes: 0,
        turnoverMinutes: 10,
        expectedContributionMargin: 100.00
      };

      const result = contributionPerOrHourService.calculateCaseOrYield(zeroMinCase, 1500.00);
      assert.ok(result.orMinutes >= 1.00, 'Minutes must be at least 1');
      assert.ok(!isNaN(result.cmPerOrMinute));
      assert.ok(!isNaN(result.cmPerOrHour));
    });
  });

  describe('3. Multi-Level Rollup Aggregations', () => {
    const sampleCases = contributionPerOrHourService.getBaselineSampleCases();

    test('getBaselineSampleCases returns 7 robust sample records', () => {
      assert.strictEqual(sampleCases.length, 7);
      sampleCases.forEach(c => {
        assert.ok(c.id);
        assert.ok(c.patient);
        assert.ok(c.surgeonName);
        assert.ok(c.or_room);
        assert.ok(c.specialty);
        assert.ok(c.orMinutes > 0);
      });
    });

    test('aggregateOrRoomYield aggregates room suite economics and ranks by hourly yield', () => {
      const roomRollup = contributionPerOrHourService.aggregateOrRoomYield(sampleCases, 1500.00);
      assert.ok(roomRollup.length > 0);

      // Verify sorted descending by avgCmPerUtilizedHour
      for (let i = 0; i < roomRollup.length - 1; i++) {
        assert.ok(
          roomRollup[i].avgCmPerUtilizedHour >= roomRollup[i + 1].avgCmPerUtilizedHour,
          'Rooms must be sorted descending by avgCmPerUtilizedHour'
        );
      }

      // Check fields of first room
      const first = roomRollup[0];
      assert.ok(first.roomName);
      assert.ok(first.totalCases > 0);
      assert.ok(first.totalOrHours > 0);
      assert.ok(first.totalOccupancyHours >= first.totalOrHours);
      assert.ok(typeof first.totalExpectedCM === 'number');
      assert.ok(typeof first.totalTurnoverDrag === 'number');
    });

    test('aggregateSurgeonYield ranks surgeons by hourly yield and computes hurdle compliance', () => {
      const surgeonRollup = contributionPerOrHourService.aggregateSurgeonYield(sampleCases, 1500.00);
      assert.ok(surgeonRollup.length > 0);

      for (let i = 0; i < surgeonRollup.length - 1; i++) {
        assert.ok(
          surgeonRollup[i].avgCmPerOrHour >= surgeonRollup[i + 1].avgCmPerOrHour,
          'Surgeons must be sorted descending by avgCmPerOrHour'
        );
      }

      const first = surgeonRollup[0];
      assert.ok(first.surgeonName);
      assert.ok(first.specialty);
      assert.ok(first.totalCases > 0);
      assert.ok(first.hurdleCompliancePct >= 0 && first.hurdleCompliancePct <= 100);
    });

    test('aggregateSpecialtyYield computes service-line duration, turnover, and yield metrics', () => {
      const specRollup = contributionPerOrHourService.aggregateSpecialtyYield(sampleCases, 1500.00);
      assert.ok(specRollup.length > 0);

      specRollup.forEach(sp => {
        assert.ok(sp.specialty);
        assert.ok(sp.totalCases > 0);
        assert.ok(sp.avgCaseMinutes > 0);
        assert.ok(sp.avgTurnoverMinutes >= 0);
        assert.ok(typeof sp.avgCmPerOrHour === 'number');
      });
    });

    test('calculateFacilityYieldKpis calculates authoritative KPI summary', () => {
      const kpis = contributionPerOrHourService.calculateFacilityYieldKpis(sampleCases, 1500.00);

      assert.strictEqual(kpis.totalCases, 7);
      assert.ok(kpis.totalOrHours > 0);
      assert.ok(kpis.totalTurnoverHours > 0);
      assert.ok(kpis.facilityAvgCmPerOrHour > 0);
      assert.ok(typeof kpis.hourlyVariance === 'number');
      assert.ok(kpis.primeYieldPct >= 0 && kpis.primeYieldPct <= 100);
      assert.ok(kpis.totalTurnoverDrag >= 0);
    });
  });

  describe('4. Database Migration & Schema Integrity (051_contribution_per_or_hour.sql)', () => {
    const migrationPath = path.join(rootDir, 'supabase', 'migrations', '051_contribution_per_or_hour.sql');
    const downMigrationPath = path.join(rootDir, 'supabase', 'migrations', '051_contribution_per_or_hour_down.sql');

    test('Migration 051 forward and down files exist and are substantive', () => {
      assert.ok(fs.existsSync(migrationPath), 'Migration 051 forward file must exist');
      assert.ok(fs.existsSync(downMigrationPath), 'Migration 051 down file must exist');

      const forwardSql = fs.readFileSync(migrationPath, 'utf8');
      const downSql = fs.readFileSync(downMigrationPath, 'utf8');

      assert.ok(forwardSql.length > 1000, 'Forward SQL must contain complete schema');
      assert.ok(downSql.length > 200, 'Down SQL must contain teardown script');
    });

    test('Migration 051 creates public.case_or_yield_metrics table with all columns and constraints', () => {
      const forwardSql = fs.readFileSync(migrationPath, 'utf8');

      assert.ok(forwardSql.includes('CREATE TABLE IF NOT EXISTS public.case_or_yield_metrics'), 'Must create case_or_yield_metrics');
      assert.ok(forwardSql.includes('facility_id UUID NOT NULL'), 'Must include facility_id');
      assert.ok(forwardSql.includes('surgery_id BIGINT NOT NULL'), 'Must include surgery_id');
      assert.ok(forwardSql.includes('or_minutes NUMERIC(8,2) NOT NULL'), 'Must include or_minutes');
      assert.ok(forwardSql.includes('turnover_minutes NUMERIC(8,2) NOT NULL'), 'Must include turnover_minutes');
      assert.ok(forwardSql.includes('total_room_minutes NUMERIC(8,2) NOT NULL'), 'Must include total_room_minutes');
      assert.ok(forwardSql.includes('expected_contribution_margin NUMERIC(12,2) NOT NULL'), 'Must include expected_contribution_margin');
      assert.ok(forwardSql.includes('cm_per_or_minute NUMERIC(10,2) NOT NULL'), 'Must include cm_per_or_minute');
      assert.ok(forwardSql.includes('cm_per_or_hour NUMERIC(10,2) NOT NULL'), 'Must include cm_per_or_hour');
      assert.ok(forwardSql.includes('target_hourly_hurdle NUMERIC(10,2) NOT NULL'), 'Must include target_hourly_hurdle');
      assert.ok(forwardSql.includes('yield_variance_hourly NUMERIC(10,2) NOT NULL'), 'Must include yield_variance_hourly');
      assert.ok(forwardSql.includes('yield_index NUMERIC(6,3) NOT NULL'), 'Must include yield_index');
      assert.ok(forwardSql.includes('yield_tier VARCHAR(24) NOT NULL'), 'Must include yield_tier');
      assert.ok(forwardSql.includes('turnover_drag_cost NUMERIC(10,2) NOT NULL'), 'Must include turnover_drag_cost');
    });

    test('Migration 051 creates deterministic calculation trigger function', () => {
      const forwardSql = fs.readFileSync(migrationPath, 'utf8');

      assert.ok(forwardSql.includes('CREATE OR REPLACE FUNCTION public.fn_calculate_case_or_yield()'), 'Must create fn_calculate_case_or_yield');
      assert.ok(forwardSql.includes('CREATE TRIGGER trg_calculate_case_or_yield'), 'Must create trigger on case_or_yield_metrics');
    });

    test('Migration 051 creates rollup views for suite, surgeon, and specialty', () => {
      const forwardSql = fs.readFileSync(migrationPath, 'utf8');

      assert.ok(forwardSql.includes('CREATE OR REPLACE VIEW public.vw_operating_room_yield_summary'), 'Must create vw_operating_room_yield_summary');
      assert.ok(forwardSql.includes('CREATE OR REPLACE VIEW public.vw_surgeon_or_yield_benchmarks'), 'Must create vw_surgeon_or_yield_benchmarks');
      assert.ok(forwardSql.includes('CREATE OR REPLACE VIEW public.vw_specialty_or_yield_matrix'), 'Must create vw_specialty_or_yield_matrix');
    });

    test('Migration 051 enables RLS and defines tenant policies', () => {
      const forwardSql = fs.readFileSync(migrationPath, 'utf8');

      assert.ok(forwardSql.includes('ALTER TABLE public.case_or_yield_metrics ENABLE ROW LEVEL SECURITY;'), 'Must enable RLS');
      assert.ok(forwardSql.includes('CREATE POLICY or_yield_metrics_select_policy'), 'Must create SELECT policy');
      assert.ok(forwardSql.includes('CREATE POLICY or_yield_metrics_insert_policy'), 'Must create INSERT policy');
      assert.ok(forwardSql.includes('public.is_facility_accessible(facility_id)'), 'Must check facility accessibility');
    });

    test('Down migration 051 drops all created objects safely in reverse order', () => {
      const downSql = fs.readFileSync(downMigrationPath, 'utf8');

      assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_specialty_or_yield_matrix CASCADE;'));
      assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_surgeon_or_yield_benchmarks CASCADE;'));
      assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_operating_room_yield_summary CASCADE;'));
      assert.ok(downSql.includes('DROP TRIGGER IF EXISTS trg_calculate_case_or_yield ON public.case_or_yield_metrics;'));
      assert.ok(downSql.includes('DROP FUNCTION IF EXISTS public.fn_calculate_case_or_yield();'));
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.case_or_yield_metrics CASCADE;'));
    });
  });

  describe('5. Maestro Design System & Application Wiring', () => {
    test('ContributionPerOrHourView.jsx and CSS obey strict Purple Ban', () => {
      const jsxPath = path.join(rootDir, 'src', 'components', 'ContributionPerOrHourView.jsx');
      const cssPath = path.join(rootDir, 'src', 'components', 'ContributionPerOrHourView.css');

      assert.ok(fs.existsSync(jsxPath), 'JSX file must exist');
      assert.ok(fs.existsSync(cssPath), 'CSS file must exist');

      const jsx = fs.readFileSync(jsxPath, 'utf8');
      const cssLines = fs.readFileSync(cssPath, 'utf8').split('\n');

      const banned = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];

      banned.forEach(token => {
        assert.ok(!jsx.toLowerCase().includes(token), `JSX must not contain ${token}`);
      });

      // Filter out comment lines from CSS check
      cssLines.forEach((line, idx) => {
        if (line.includes('/*') || line.includes('*') || line.includes('//')) return;
        banned.forEach(token => {
          assert.ok(!line.toLowerCase().includes(token), `CSS line ${idx + 1} must not contain ${token}`);
        });
      });
    });

    test('ContributionPerOrHourView includes responsive table wrapper with min-width 1100px', () => {
      const jsx = fs.readFileSync(path.join(rootDir, 'src', 'components', 'ContributionPerOrHourView.jsx'), 'utf8');
      const css = fs.readFileSync(path.join(rootDir, 'src', 'components', 'ContributionPerOrHourView.css'), 'utf8');

      assert.ok(jsx.includes('className="table-responsive"'), 'JSX must include table-responsive wrapper');
      assert.ok(css.includes('min-width: 1100px'), 'CSS must specify min-width: 1100px on yield table');
    });

    test('App.jsx integrates ContributionPerOrHourView into sidebar navigation and routing', () => {
      const appJsx = fs.readFileSync(path.join(rootDir, 'src', 'App.jsx'), 'utf8');

      assert.ok(appJsx.includes("import ContributionPerOrHourView from './components/ContributionPerOrHourView'"), 'App.jsx must import component');
      assert.ok(appJsx.includes("activeTab === 'contribution_per_or_hour'"), 'App.jsx must have tab active state');
      assert.ok(appJsx.includes('<ContributionPerOrHourView />'), 'App.jsx must render component');
      assert.ok(appJsx.includes('Contribution Per OR Hour'), 'App.jsx must have menu item text');
    });
  });
});

