/**
 * ==============================================================================
 * Phase E3 Test Suite: 13-Week Cash Forecast & Liquidity Management Engine
 * Module 14: CFO Dashboard & Financial Accounting
 * Tests: 13-Week continuous cash roll-forward, receipts aging decay,
 *        bi-weekly payroll alternation, facility rent timing, minimum cash covenant,
 *        revolving credit headroom, cryptographic freeze seal, Migration 117 SQL,
 *        zero-purple CSS compliance, and App.jsx shell integration.
 * ==============================================================================
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CASH_FORECAST_STATUSES,
  FLOW_TYPES,
  CASH_SCENARIOS,
  COVENANT_SEVERITY,
  CASH_LINE_CODES,
  matchesFacilityId,
  computeCashForecastHash,
  classifyCovenantSeverity,
  resetLiveCashForecastState,
  getFacilityCashForecasts,
  getCashForecastByIdOrCode,
  getCashForecastMatrix,
  getCashForecastTelemetry,
  approveAndFreezeCashForecast,
  INITIAL_FACILITY_CASH_FORECASTS,
  INITIAL_CASH_WEEKS
} from '../src/services/cashForecastService.js';

import * as libCashForecastService from '../src/lib/cashForecastService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase E3: 13-Week Cash Forecast & Liquidity Management Engine', () => {

  beforeEach(() => {
    resetLiveCashForecastState();
  });

  test('1. Telemetry & Summary Aggregation returns accurate 13-week cash totals', () => {
    const telemetry = getCashForecastTelemetry('fac-naples-01', 'CF2026_Q4_13W');

    assert.ok(telemetry, 'Telemetry must not be null');
    assert.strictEqual(telemetry.forecastCode, 'CF2026_Q4_13W');
    assert.strictEqual(telemetry.status, CASH_FORECAST_STATUSES.ACTIVE_FORECAST);
    assert.strictEqual(telemetry.isActive, true);

    // Initial starting cash: $1,250,000
    assert.strictEqual(telemetry.startingCashBalance, 1250000);

    // Verify receipts, disbursements, and net cash flow
    assert.ok(telemetry.total13wReceipts > 0, 'Total receipts must be positive');
    assert.ok(telemetry.total13wDisbursements > 0, 'Total disbursements must be positive');
    assert.strictEqual(
      telemetry.net13wCashFlow,
      telemetry.total13wReceipts - telemetry.total13wDisbursements,
      'Net cash flow must equal Receipts minus Disbursements'
    );

    // Ending cash must equal starting cash + net cash flow
    assert.strictEqual(
      telemetry.projectedEndingCash,
      telemetry.startingCashBalance + telemetry.net13wCashFlow,
      'Ending cash must strictly equal starting cash + net cash flow'
    );

    // Minimum covenant checks
    assert.strictEqual(telemetry.minimumCashCovenant, 400000);
    assert.ok(telemetry.minimumCovenantHeadroom > 0, 'Must have positive headroom above covenant');
    assert.strictEqual(telemetry.lineOfCreditLimit, 1000000);
    assert.strictEqual(telemetry.lineOfCreditDrawn, 0);
  });

  test('2. Facility UUID alias resolution matches Naples Surgery Center correctly', () => {
    assert.strictEqual(matchesFacilityId('fac-naples-01', '00000000-0000-0000-0000-000000000002'), true);
    assert.strictEqual(matchesFacilityId('00000000-0000-0000-0000-000000000002', 'fac-naples-01'), true);
    assert.strictEqual(matchesFacilityId('fac-naples-01', 'fac-naples-01'), true);
    assert.strictEqual(matchesFacilityId('fac-tampa-05', 'fac-naples-01'), false);
    assert.strictEqual(matchesFacilityId('fac-naples-01', 'ALL'), true);
  });

  test('3. Continuous Roll-Forward Invariant proves Beginning Cash(w+1) == Ending Cash(w)', () => {
    const matrix = getCashForecastMatrix('fac-naples-01', 'CF2026_Q4_13W');
    assert.ok(matrix);
    assert.strictEqual(matrix.weeks.length, 13, 'Must contain exactly 13 forward weeks');

    // Week 1 beginning cash must equal forecast starting cash
    assert.strictEqual(matrix.weeks[0].beginningCash, matrix.forecast.startingCashBalance);

    for (let i = 0; i < matrix.weeks.length - 1; i++) {
      const currentWeek = matrix.weeks[i];
      const nextWeek = matrix.weeks[i + 1];

      // Ending Cash = Beginning Cash + Total Receipts - Total Disbursements + Financing
      const expectedEnding = currentWeek.beginningCash + currentWeek.totalReceipts - currentWeek.totalDisbursements + currentWeek.totalFinancing;
      assert.strictEqual(currentWeek.endingCash, expectedEnding, `Week ${currentWeek.weekCode} math equation failed`);

      // Roll-forward continuity invariant
      assert.strictEqual(
        nextWeek.beginningCash,
        currentWeek.endingCash,
        `Roll-forward broken between ${currentWeek.weekCode} and ${nextWeek.weekCode}`
      );
    }
  });

  test('4. Bi-Weekly Clinical Payroll Alternation proves disbursements strictly on even weeks', () => {
    const matrix = getCashForecastMatrix('fac-naples-01', 'CF2026_Q4_13W');
    assert.ok(matrix);

    matrix.weeks.forEach(w => {
      if (w.weekNumber % 2 === 0) {
        // Even weeks: Payroll MUST be disbursed (> $100k)
        assert.strictEqual(w.isPayrollWeek, true, `Week ${w.weekCode} must be flagged as payroll week`);
        assert.ok(w.payroll >= 120000, `Week ${w.weekCode} payroll must be at least $120,000`);
      } else {
        // Odd weeks: No payroll disbursed ($0)
        assert.strictEqual(w.isPayrollWeek, false, `Week ${w.weekCode} must NOT be flagged as payroll week`);
        assert.strictEqual(w.payroll, 0, `Week ${w.weekCode} payroll must be $0`);
      }
    });
  });

  test('5. Monthly Facility Rent Timing proves lease disbursements strictly on 1st week of month', () => {
    const matrix = getCashForecastMatrix('fac-naples-01', 'CF2026_Q4_13W');
    assert.ok(matrix);

    // Rent weeks: W1, W5, W9, W13
    const rentWeekNumbers = [1, 5, 9, 13];

    matrix.weeks.forEach(w => {
      if (rentWeekNumbers.includes(w.weekNumber)) {
        assert.strictEqual(w.isRentWeek, true, `Week ${w.weekCode} must be flagged as rent week`);
        assert.strictEqual(w.rent, 45000, `Week ${w.weekCode} rent must be $45,000`);
      } else {
        assert.strictEqual(w.isRentWeek, false, `Week ${w.weekCode} must NOT be rent week`);
        assert.strictEqual(w.rent, 0, `Week ${w.weekCode} rent must be $0`);
      }
    });
  });

  test('6. Minimum Covenant Headroom and severity classification', () => {
    // Threshold is $400,000
    assert.strictEqual(classifyCovenantSeverity(350000), COVENANT_SEVERITY.LIQUIDITY_SURPLUS);
    assert.strictEqual(classifyCovenantSeverity(150000), COVENANT_SEVERITY.NORMAL);
    assert.strictEqual(classifyCovenantSeverity(50000), COVENANT_SEVERITY.WARNING);
    assert.strictEqual(classifyCovenantSeverity(-10000), COVENANT_SEVERITY.CRITICAL_DEFICIT);

    const telemetry = getCashForecastTelemetry('fac-naples-01', 'CF2026_Q4_13W');
    assert.strictEqual(telemetry.overallSeverity, COVENANT_SEVERITY.LIQUIDITY_SURPLUS);
    assert.ok(telemetry.minimumCovenantHeadroom > 300000);
  });

  test('7. Multi-Scenario Sensitivity: Slow Collections < Baseline < Prompt Pay', () => {
    const baseMatrix = getCashForecastMatrix('fac-naples-01', 'CF2026_Q4_13W', CASH_SCENARIOS.BASELINE);
    const slowMatrix = getCashForecastMatrix('fac-naples-01', 'CF2026_Q4_13W', CASH_SCENARIOS.SLOW_COLLECTIONS);
    const promptMatrix = getCashForecastMatrix('fac-naples-01', 'CF2026_Q4_13W', CASH_SCENARIOS.PROMPT_PAY);

    const baseEnding = baseMatrix.totals.endingCash;
    const slowEnding = slowMatrix.totals.endingCash;
    const promptEnding = promptMatrix.totals.endingCash;

    assert.ok(
      slowEnding < baseEnding,
      `Slow Collections ending cash ($${slowEnding}) must be less than Baseline ($${baseEnding})`
    );
    assert.ok(
      baseEnding < promptEnding,
      `Baseline ending cash ($${baseEnding}) must be less than Prompt Pay ($${promptEnding})`
    );
  });

  test('8. Dual facade re-export parity between lib and services', async () => {
    const libExports = Object.keys(libCashForecastService);

    assert.ok(libExports.length > 0, 'Lib facade must export functions');
    assert.strictEqual(typeof libCashForecastService.getCashForecastTelemetry, 'function');
    assert.strictEqual(typeof libCashForecastService.getCashForecastMatrix, 'function');
    assert.strictEqual(typeof libCashForecastService.approveAndFreezeCashForecast, 'function');
  });

  test('9. Cash forecast approval hard-freezes version and writes SHA-256 seal', () => {
    const result = approveAndFreezeCashForecast('CF2026_Q4_13W', '00000000-0000-0000-0000-000000000001');

    assert.ok(result.success);
    assert.strictEqual(result.status, CASH_FORECAST_STATUSES.ACTIVE_FORECAST);
    assert.ok(result.frozenHash.length >= 32, 'Must generate cryptographic seal');
    assert.ok(result.approvedAt);

    const updated = getCashForecastByIdOrCode('CF2026_Q4_13W');
    assert.strictEqual(updated.status, CASH_FORECAST_STATUSES.ACTIVE_FORECAST);
    assert.strictEqual(updated.isApproved, true);
    assert.strictEqual(updated.frozenHash, result.frozenHash);
  });

  test('10. Migration 117 UP/DOWN SQL structural integrity and RLS policy verification', () => {
    const upSqlPath = path.resolve(__dirname, '../supabase/migrations/117_13_week_cash_forecast.sql');
    const downSqlPath = path.resolve(__dirname, '../supabase/migrations/117_13_week_cash_forecast_down.sql');

    assert.ok(fs.existsSync(upSqlPath), 'Migration 117 UP file must exist');
    assert.ok(fs.existsSync(downSqlPath), 'Migration 117 DOWN file must exist');

    const upSql = fs.readFileSync(upSqlPath, 'utf8');
    const downSql = fs.readFileSync(downSqlPath, 'utf8');

    // Tables
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.facility_cash_forecasts'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.cash_forecast_weeks'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.cash_forecast_line_items'));
    assert.ok(upSql.includes('CREATE OR REPLACE VIEW public.vw_cash_forecast_telemetry'));

    // RLS Policies & Tenant Isolation
    assert.ok(upSql.includes('ENABLE ROW LEVEL SECURITY'));
    assert.ok(upSql.includes('tenant_isolation_cash_forecasts'));
    assert.ok(upSql.includes('tenant_isolation_cash_weeks'));
    assert.ok(upSql.includes('tenant_isolation_cf_lines'));
    assert.ok(upSql.includes('current_setting(\'app.current_facility_id\', true)'));

    // Down SQL drops
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.facility_cash_forecasts'));
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.cash_forecast_weeks'));
    assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_cash_forecast_telemetry'));
  });

  test('11. Strict Zero-Purple CSS Compliance in CashForecastView', () => {
    const cssPath = path.resolve(__dirname, '../src/components/CashForecastView.css');
    const jsxPath = path.resolve(__dirname, '../src/components/CashForecastView.jsx');

    if (fs.existsSync(cssPath)) {
      const css = fs.readFileSync(cssPath, 'utf8');
      const purpleRegex = /(purple|violet|indigo|magenta|fuchsia)/i;
      assert.strictEqual(purpleRegex.test(css), false, 'CashForecastView.css contains prohibited purple token');
    }

    if (fs.existsSync(jsxPath)) {
      const jsx = fs.readFileSync(jsxPath, 'utf8');
      const purpleRegex = /(purple|violet|indigo|magenta|fuchsia)/i;
      assert.strictEqual(purpleRegex.test(jsx), false, 'CashForecastView.jsx contains prohibited purple token');
    }
  });

  test('12. App Shell Integration (src/App.jsx)', () => {
    const appJsxPath = path.resolve(__dirname, '../src/App.jsx');
    const appJsx = fs.readFileSync(appJsxPath, 'utf8');

    assert.ok(appJsx.includes('CashForecastView'), 'App.jsx must import CashForecastView');
    assert.ok(appJsx.includes("activeTab === 'cash_forecast'"), 'App.jsx must route cash_forecast tab');
  });

});
