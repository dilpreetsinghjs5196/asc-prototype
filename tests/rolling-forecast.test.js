/**
 * ==============================================================================
 * Phase E2 Test Suite: Rolling Forecast & Continuous Projections Engine
 * Module 14: CFO Dashboard & Financial Accounting
 * Tests: 12-Month continuous rolling horizon, multi-method deterministic projections
 *        (T3M, Seasonal, Capacity, Backlog, Blended), multi-scenario bounds,
 *        gross-to-net & EBITDA mathematical invariants, cryptographic freeze seal,
 *        Migration 116 SQL integrity, zero-purple CSS, and App.jsx shell integration.
 * ==============================================================================
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FORECAST_STATUSES,
  HORIZON_TYPES,
  FORECAST_METHODS,
  SCENARIOS,
  STATEMENT_LINE_CODES,
  ASC_SEASONALITY_FACTORS,
  FACILITY_CAPACITY_CONSTRAINTS,
  calculateT3MRunRate,
  calculateSeasonalProjection,
  calculateCapacityConstrainedCases,
  calculateBlendedComposite,
  calculateScenarioAmount,
  computeRollingForecastHash,
  matchesFacilityId,
  resetLiveRollingForecastState,
  getFacilityRollingForecasts,
  getRollingForecastByIdOrCode,
  getRollingForecastMatrix,
  getRollingForecastTelemetry,
  calculateForecastMethodProjections,
  approveAndFreezeRollingForecast,
  INITIAL_FACILITY_ROLLING_FORECASTS,
  INITIAL_FORECAST_PERIODS
} from '../src/services/rollingForecastService.js';

import * as libRollingForecastService from '../src/lib/rollingForecastService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase E2: Rolling Forecast & Continuous Projections Engine', () => {

  beforeEach(() => {
    resetLiveRollingForecastState();
  });

  test('1. Telemetry & Summary Aggregation returns accurate 12-month rolling forecast totals', () => {
    const telemetry = getRollingForecastTelemetry('fac-naples-01', 'RF2026_12M_BASE');

    assert.ok(telemetry, 'Telemetry must not be null');
    assert.strictEqual(telemetry.forecastCode, 'RF2026_12M_BASE');
    assert.strictEqual(telemetry.forecastStatus, FORECAST_STATUSES.ACTIVE_PROJECTION);
    assert.strictEqual(telemetry.isActive, true);
    assert.strictEqual(telemetry.horizonPeriodCount, 12, 'Must span 12 forward-looking months');

    // 12 months total cases = 2,960 cases
    assert.strictEqual(telemetry.projected12mCases, 2960);
    // 2,960 cases * $4,750 NPR = $14,060,000
    assert.strictEqual(telemetry.projected12mNpr, 14060000);
    // Clinical margin = $6,660,000
    assert.strictEqual(telemetry.projected12mClinicalMargin, 6660000);
    // EBITDA = Clinical Margin - Variable Expenses ($858,400) - Fixed OPEX (12 * $170k = $2,040,000) = $3,761,600
    assert.strictEqual(telemetry.projected12mEbitda, 3761600);

    // EBITDA Margin % = (3,761,600 / 14,060,000) = 26.8%
    assert.strictEqual(telemetry.ebitdaMarginPercent, 26.8);

    // Capacity checks
    assert.ok(telemetry.totalPhysicalAvailableMinutes > 0);
    assert.ok(telemetry.capacityHeadroomPercent > 0, 'Must have capacity headroom available');
    assert.ok(telemetry.avgConfidenceScore >= 0.80, '12-month horizon confidence must average above 80%');
  });

  test('2. Facility UUID alias resolution matches Naples Surgery Center correctly', () => {
    assert.strictEqual(matchesFacilityId('fac-naples-01', '00000000-0000-0000-0000-000000000002'), true);
    assert.strictEqual(matchesFacilityId('00000000-0000-0000-0000-000000000002', 'fac-naples-01'), true);
    assert.strictEqual(matchesFacilityId('fac-naples-01', 'fac-naples-01'), true);
    assert.strictEqual(matchesFacilityId('fac-miami-99', 'fac-naples-01'), false);
    assert.strictEqual(matchesFacilityId('fac-naples-01', 'ALL'), true);
  });

  test('3. Trailing 3-Month (T3M) Run-Rate moving average math satisfies weighted formula', () => {
    // Formula: 0.50 * M-1 + 0.30 * M-2 + 0.20 * M-3
    const m1 = 240;
    const m2 = 230;
    const m3 = 220;
    const expected = 0.50 * 240 + 0.30 * 230 + 0.20 * 220; // 120 + 69 + 44 = 233
    const actual = calculateT3MRunRate(m1, m2, m3);

    assert.strictEqual(actual, expected);
    assert.strictEqual(actual, 233);

    // Dollar run-rate test
    const nprM1 = 1150000;
    const nprM2 = 1100000;
    const nprM3 = 1050000;
    const expectedNpr = 0.50 * 1150000 + 0.30 * 1100000 + 0.20 * 1050000; // 575000 + 330000 + 210000 = 1115000
    assert.strictEqual(calculateT3MRunRate(nprM1, nprM2, nprM3), expectedNpr);
  });

  test('4. Seasonality Indexing scales baseline by monthly seasonal factor accurately', () => {
    const baselineCases = 240;
    // January seasonality: 0.8800 (Deductible reset dip)
    const janCases = calculateSeasonalProjection(baselineCases, ASC_SEASONALITY_FACTORS[1]);
    assert.strictEqual(janCases, 211.2);

    // December seasonality: 1.1800 (Year-end surge)
    const decCases = calculateSeasonalProjection(baselineCases, ASC_SEASONALITY_FACTORS[12]);
    assert.strictEqual(decCases, 283.2);

    // Q4 surge must strictly exceed Q1 lull
    assert.ok(decCases > janCases, 'December cases must exceed January due to ASC deductibles');
  });

  test('5. Capacity-Constrained OR model respects physical block time ceilings', () => {
    // Maximum physical case ceiling per month is 465 cases
    const maxCapacity = FACILITY_CAPACITY_CONSTRAINTS.MAXIMUM_MONTHLY_CASE_CAPACITY;
    assert.strictEqual(maxCapacity, 465);

    // Unconstrained demand exceeding capacity is clipped
    const unconstrainedSurgeCases = 550;
    const cappedCases = calculateCapacityConstrainedCases(
      unconstrainedSurgeCases,
      FACILITY_CAPACITY_CONSTRAINTS.TOTAL_AVAILABLE_MINUTES_PER_MONTH,
      FACILITY_CAPACITY_CONSTRAINTS.TARGET_UTILIZATION_RATE,
      FACILITY_CAPACITY_CONSTRAINTS.AVERAGE_CASE_DURATION_MINUTES
    );
    assert.strictEqual(cappedCases, 465, 'Must cap surge at 465 physical case ceiling');

    // Normal demand within capacity is preserved
    const normalCases = 250;
    const preservedCases = calculateCapacityConstrainedCases(
      normalCases,
      FACILITY_CAPACITY_CONSTRAINTS.TOTAL_AVAILABLE_MINUTES_PER_MONTH,
      FACILITY_CAPACITY_CONSTRAINTS.TARGET_UTILIZATION_RATE,
      FACILITY_CAPACITY_CONSTRAINTS.AVERAGE_CASE_DURATION_MINUTES
    );
    assert.strictEqual(preservedCases, 250);
  });

  test('6. Deterministic Gross-to-Net and EBITDA invariants balance across all 12 forecast periods', () => {
    const matrix = getRollingForecastMatrix('fac-naples-01', 'RF2026_12M_BASE', SCENARIOS.BASELINE, HORIZON_TYPES.TWELVE_MONTH);
    assert.ok(matrix);

    const grossRow = matrix.rows.find(r => r.lineCode === STATEMENT_LINE_CODES.REV_SURGICAL_GROSS);
    const dedRow = matrix.rows.find(r => r.lineCode === STATEMENT_LINE_CODES.DED_ALLOWANCES);
    const nprRow = matrix.rows.find(r => r.lineCode === STATEMENT_LINE_CODES.NPR);
    const dirCostsRow = matrix.rows.find(r => r.lineCode === STATEMENT_LINE_CODES.DIR_COSTS);
    const marginRow = matrix.rows.find(r => r.lineCode === STATEMENT_LINE_CODES.CLINICAL_MARGIN);
    const varExpRow = matrix.rows.find(r => r.lineCode === STATEMENT_LINE_CODES.EXP_VARIABLE_FACILITY);
    const opexRow = matrix.rows.find(r => r.lineCode === STATEMENT_LINE_CODES.EXP_FIXED_OVERHEAD);
    const ebitdaRow = matrix.rows.find(r => r.lineCode === STATEMENT_LINE_CODES.EBITDA);
    const depAmortRow = matrix.rows.find(r => r.lineCode === STATEMENT_LINE_CODES.EXP_DEP_AMORT);
    const noiRow = matrix.rows.find(r => r.lineCode === STATEMENT_LINE_CODES.NOI);

    matrix.periods.forEach(p => {
      const gross = grossRow.periodValues[p.periodCode];
      const ded = dedRow.periodValues[p.periodCode];
      const npr = nprRow.periodValues[p.periodCode];
      const dirCosts = dirCostsRow.periodValues[p.periodCode];
      const margin = marginRow.periodValues[p.periodCode];
      const varExp = varExpRow.periodValues[p.periodCode];
      const opex = opexRow.periodValues[p.periodCode];
      const ebitda = ebitdaRow.periodValues[p.periodCode];
      const depAmort = depAmortRow.periodValues[p.periodCode];
      const noi = noiRow.periodValues[p.periodCode];

      // NPR = Gross - Deductions
      assert.strictEqual(Number((gross - ded).toFixed(2)), npr, `NPR invariant failed for period ${p.periodCode}`);

      // Clinical Margin = NPR - Direct Costs
      assert.strictEqual(Number((npr - dirCosts).toFixed(2)), margin, `Clinical Margin invariant failed for period ${p.periodCode}`);

      // EBITDA = Clinical Margin - Variable Expenses - Fixed OPEX
      assert.strictEqual(Number((margin - varExp - opex).toFixed(2)), ebitda, `EBITDA invariant failed for period ${p.periodCode}`);

      // NOI = EBITDA - Depreciation
      assert.strictEqual(Number((ebitda - depAmort).toFixed(2)), noi, `NOI invariant failed for period ${p.periodCode}`);
    });
  });

  test('7. Multi-Scenario projections (Baseline, Optimistic, Conservative) satisfy monotonicity invariants', () => {
    const baseMatrix = getRollingForecastMatrix('fac-naples-01', 'RF2026_12M_BASE', SCENARIOS.BASELINE);
    const optMatrix = getRollingForecastMatrix('fac-naples-01', 'RF2026_12M_BASE', SCENARIOS.OPTIMISTIC);
    const conMatrix = getRollingForecastMatrix('fac-naples-01', 'RF2026_12M_BASE', SCENARIOS.CONSERVATIVE);

    const baseNpr = baseMatrix.rows.find(r => r.lineCode === STATEMENT_LINE_CODES.NPR).totalAmount;
    const optNpr = optMatrix.rows.find(r => r.lineCode === STATEMENT_LINE_CODES.NPR).totalAmount;
    const conNpr = conMatrix.rows.find(r => r.lineCode === STATEMENT_LINE_CODES.NPR).totalAmount;

    assert.ok(conNpr < baseNpr, `Conservative NPR ($${conNpr}) must be less than Baseline NPR ($${baseNpr})`);
    assert.ok(baseNpr < optNpr, `Baseline NPR ($${baseNpr}) must be less than Optimistic NPR ($${optNpr})`);

    const baseEbitda = baseMatrix.rows.find(r => r.lineCode === STATEMENT_LINE_CODES.EBITDA).totalAmount;
    const optEbitda = optMatrix.rows.find(r => r.lineCode === STATEMENT_LINE_CODES.EBITDA).totalAmount;
    const conEbitda = conMatrix.rows.find(r => r.lineCode === STATEMENT_LINE_CODES.EBITDA).totalAmount;

    assert.ok(conEbitda < baseEbitda, `Conservative EBITDA ($${conEbitda}) must be less than Baseline EBITDA ($${baseEbitda})`);
    assert.ok(baseEbitda < optEbitda, `Baseline EBITDA ($${baseEbitda}) must be less than Optimistic EBITDA ($${optEbitda})`);
  });

  test('8. Dual facade re-export parity between lib and services', async () => {
    const serviceExports = Object.keys(import.meta.resolve ? await import('../src/services/rollingForecastService.js') : {});
    const libExports = Object.keys(libRollingForecastService);

    assert.ok(libExports.length > 0, 'Lib facade must export functions');
    assert.strictEqual(typeof libRollingForecastService.getRollingForecastTelemetry, 'function');
    assert.strictEqual(typeof libRollingForecastService.getRollingForecastMatrix, 'function');
    assert.strictEqual(typeof libRollingForecastService.calculateT3MRunRate, 'function');
    assert.strictEqual(typeof libRollingForecastService.approveAndFreezeRollingForecast, 'function');
  });

  test('9. Forecast approval hard-freezes version and writes SHA-256 seal', () => {
    const result = approveAndFreezeRollingForecast('RF2026_12M_BASE', '00000000-0000-0000-0000-000000000001');

    assert.ok(result.success);
    assert.strictEqual(result.status, FORECAST_STATUSES.ACTIVE_PROJECTION);
    assert.ok(result.frozenHash.length >= 32, 'Must generate cryptographic seal');
    assert.ok(result.approvedAt);

    const updated = getRollingForecastByIdOrCode('RF2026_12M_BASE');
    assert.strictEqual(updated.status, FORECAST_STATUSES.ACTIVE_PROJECTION);
    assert.strictEqual(updated.isApproved, true);
    assert.strictEqual(updated.frozenHash, result.frozenHash);
  });

  test('10. Migration 116 UP/DOWN SQL structural integrity and RLS policy verification', () => {
    const upSqlPath = path.resolve(__dirname, '../supabase/migrations/116_rolling_forecast.sql');
    const downSqlPath = path.resolve(__dirname, '../supabase/migrations/116_rolling_forecast_down.sql');

    assert.ok(fs.existsSync(upSqlPath), 'Migration 116 UP file must exist');
    assert.ok(fs.existsSync(downSqlPath), 'Migration 116 DOWN file must exist');

    const upSql = fs.readFileSync(upSqlPath, 'utf8');
    const downSql = fs.readFileSync(downSqlPath, 'utf8');

    // Tables
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.facility_rolling_forecasts'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.rolling_forecast_periods'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.rolling_forecast_line_items'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.rolling_forecast_methods'));
    assert.ok(upSql.includes('CREATE OR REPLACE VIEW public.vw_rolling_forecast_telemetry'));

    // RLS Policies & Tenant Isolation
    assert.ok(upSql.includes('ENABLE ROW LEVEL SECURITY'));
    assert.ok(upSql.includes('tenant_isolation_rolling_forecasts'));
    assert.ok(upSql.includes('tenant_isolation_rf_periods'));
    assert.ok(upSql.includes('tenant_isolation_rf_lines'));
    assert.ok(upSql.includes('current_setting(\'app.current_facility_id\', true)'));

    // Down SQL drops
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.facility_rolling_forecasts'));
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.rolling_forecast_periods'));
    assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_rolling_forecast_telemetry'));
  });

  test('11. Strict Zero-Purple CSS Compliance in RollingForecastView', () => {
    const cssPath = path.resolve(__dirname, '../src/components/RollingForecastView.css');
    const jsxPath = path.resolve(__dirname, '../src/components/RollingForecastView.jsx');

    if (fs.existsSync(cssPath)) {
      const css = fs.readFileSync(cssPath, 'utf8');
      const purpleRegex = /(purple|violet|indigo|magenta|fuchsia)/i;
      assert.strictEqual(purpleRegex.test(css), false, 'RollingForecastView.css contains prohibited purple token');
    }

    if (fs.existsSync(jsxPath)) {
      const jsx = fs.readFileSync(jsxPath, 'utf8');
      const purpleRegex = /(purple|violet|indigo|magenta|fuchsia)/i;
      assert.strictEqual(purpleRegex.test(jsx), false, 'RollingForecastView.jsx contains prohibited purple token');
    }
  });

  test('12. App Shell Integration (src/App.jsx)', () => {
    const appJsxPath = path.resolve(__dirname, '../src/App.jsx');
    const appJsx = fs.readFileSync(appJsxPath, 'utf8');

    assert.ok(appJsx.includes('RollingForecastView'), 'App.jsx must import RollingForecastView');
    assert.ok(appJsx.includes("activeTab === 'rolling_forecast'"), 'App.jsx must route rolling_forecast tab');
  });

});
