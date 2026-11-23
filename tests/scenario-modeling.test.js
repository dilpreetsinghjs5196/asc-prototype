/**
 * ==============================================================================
 * Phase E5 Test Suite: Scenario Modeling & What-If Stress Testing Engine
 * Module 14: CFO Dashboard & Financial Accounting
 * Tests: Telemetry KPI aggregation, facility alias resolution, multi-lever deterministic math,
 *        volume expansion, payer fee compression, supply chain inflation, multi-factor stress test,
 *        OR capacity constraint validation, dual facade parity, cryptographic freeze seal,
 *        Migration 119 SQL integrity, zero prohibited token CSS compliance, and App shell integration.
 * ==============================================================================
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SCENARIO_STATUSES,
  SCENARIO_TYPES,
  OR_CAPACITY_CONSTANTS,
  BASELINE_NAPLES_OPERATING_DATA,
  matchesFacilityId,
  computeScenarioHash,
  calculateScenarioProjections,
  resetLiveScenarioState,
  getFacilityScenarios,
  getScenarioByIdOrCode,
  getScenarioTelemetry,
  getScenarioComparativeMatrix,
  approveAndFreezeScenario,
  INITIAL_FACILITY_SCENARIOS
} from '../src/services/scenarioModelingService.js';

import * as libScenarioModelingService from '../src/lib/scenarioModelingService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase E5: Scenario Modeling & What-If Stress Testing Engine', () => {

  beforeEach(() => {
    resetLiveScenarioState();
  });

  test('1. Telemetry returns accurate projected cases, NPR, EBITDA, margin %, and OR minutes for baseline', () => {
    const telemetry = getScenarioTelemetry('fac-naples-01', 'SCEN_BASE_2026');

    assert.ok(telemetry, 'Telemetry must not be null');
    assert.strictEqual(telemetry.scenarioCode, 'SCEN_BASE_2026');
    assert.strictEqual(telemetry.status, SCENARIO_STATUSES.APPROVED_STRATEGY);
    assert.strictEqual(telemetry.isActive, true);

    // Baseline outputs: 240 cases, $1.15M NPR, $240k EBITDA
    assert.strictEqual(telemetry.projectedCases, 240);
    assert.strictEqual(telemetry.projectedNpr, 1150000.00);
    assert.strictEqual(telemetry.projectedDirectCosts, 670000.00);
    assert.strictEqual(telemetry.projectedContributionMargin, 480000.00);
    assert.strictEqual(telemetry.projectedFixedOverhead, 240000.00);
    assert.strictEqual(telemetry.projectedEbitda, 240000.00);
    assert.strictEqual(telemetry.projectedEbitdaMarginPercent, 20.87);

    // Break-even & MOS
    assert.strictEqual(telemetry.projectedBreakEvenCases, 120);
    assert.strictEqual(telemetry.projectedMarginOfSafetyCases, 120);

    // OR Minutes & Capacity
    assert.strictEqual(telemetry.orMinutesUtilized, 18240);
    assert.strictEqual(telemetry.orCapacityUtilizationPercent, 45.24);
    assert.strictEqual(telemetry.availableOrMinutes, 40320);

    // Baseline delta should be zero
    assert.strictEqual(telemetry.deltaCases, 0);
    assert.strictEqual(telemetry.deltaNpr, 0);
    assert.strictEqual(telemetry.deltaEbitda, 0);
  });

  test('2. Facility UUID alias resolution matches Naples Surgery Center correctly', () => {
    assert.strictEqual(matchesFacilityId('fac-naples-01', '00000000-0000-0000-0000-000000000002'), true);
    assert.strictEqual(matchesFacilityId('00000000-0000-0000-0000-000000000002', 'fac-naples-01'), true);
    assert.strictEqual(matchesFacilityId('fac-naples-01', 'fac-naples-01'), true);
    assert.strictEqual(matchesFacilityId('fac-miami-04', 'fac-naples-01'), false);
    assert.strictEqual(matchesFacilityId('fac-naples-01', 'ALL'), true);
  });

  test('3. Deterministic Lever Math: Volume expansion (+12.5%) correctly scales cases, revenue, and direct clinical costs', () => {
    const proj = calculateScenarioProjections(BASELINE_NAPLES_OPERATING_DATA, {
      caseVolumeDeltaPercent: 12.50
    });

    // 240 * 1.125 = 270 cases
    assert.strictEqual(proj.projectedCases, 270);
    assert.strictEqual(proj.deltaCases, 30);

    // Unit economics unchanged
    assert.strictEqual(proj.adjustedRevenuePerCase, 4791.67);
    assert.strictEqual(proj.adjustedVariableCostPerCase, 2791.67);
    assert.strictEqual(proj.adjustedUnitCm, 2000.00);

    // 270 * 4791.67 = 1,293,750.90
    assert.strictEqual(proj.projectedNpr, 1293750.90);
    assert.strictEqual(proj.projectedDirectCosts, 753750.90);
    assert.strictEqual(proj.projectedContributionMargin, 540000.00); // 270 * 2000

    // Fixed costs remain $240,000
    assert.strictEqual(proj.projectedFixedOverhead, 240000.00);
    assert.strictEqual(proj.projectedEbitda, 300000.00); // 540k - 240k
    assert.strictEqual(proj.deltaEbitda, 60000.00);      // 30 cases * $2,000 CM = +$60k EBITDA

    // OR minutes: 270 * 76 = 20,520
    assert.strictEqual(proj.orMinutesUtilized, 20520);
    assert.strictEqual(proj.orCapacityUtilizationPercent, 50.89);
  });

  test('4. Payer Rate Compression Lever (-4.0%) correctly reduces Net Patient Revenue and EBITDA without shifting case volume', () => {
    const proj = calculateScenarioProjections(BASELINE_NAPLES_OPERATING_DATA, {
      reimbursementRateDeltaPercent: -4.00
    });

    // Volume remains 240
    assert.strictEqual(proj.projectedCases, 240);
    assert.strictEqual(proj.deltaCases, 0);

    // Unit revenue: 4791.67 * 0.96 = 4600.00
    assert.strictEqual(proj.adjustedRevenuePerCase, 4600.00);
    assert.strictEqual(proj.adjustedVariableCostPerCase, 2791.67);
    assert.strictEqual(proj.adjustedUnitCm, 1808.33);

    // NPR: 240 * 4600 = $1,104,000
    assert.strictEqual(proj.projectedNpr, 1104000.00);
    assert.strictEqual(proj.deltaNpr, -46000.00);

    // Direct costs unchanged: $670,000.80
    assert.strictEqual(proj.projectedDirectCosts, 670000.80);

    // EBITDA reduced by approximately $46,000 delta (within $1 rounding)
    assert.ok(Math.abs(proj.deltaEbitda - (-46000.00)) <= 1.00);
  });

  test('5. Supply Chain & Implant Inflation Lever (+7% implants, +5% supplies) accurately increases Direct Clinical Costs', () => {
    const proj = calculateScenarioProjections(BASELINE_NAPLES_OPERATING_DATA, {
      implantCostInflationPercent: 7.00,
      supplyCostInflationPercent: 5.00
    });

    assert.strictEqual(proj.projectedCases, 240);
    // Baseline revenue unchanged
    assert.strictEqual(proj.adjustedRevenuePerCase, 4791.67);

    // Variable costs:
    // Implants: 1437.50 * 1.07 = 1538.13
    // Supplies: 645.83 * 1.05 = 678.12
    // Labor: 708.34 * 1.0 = 708.34
    // Total variable = 1538.13 + 678.12 + 708.34 = 2924.59
    assert.strictEqual(proj.adjustedVariableCostPerCase, 2924.59);
    assert.strictEqual(proj.adjustedUnitCm, 1867.08);

    // Direct clinical costs increase
    assert.ok(proj.projectedDirectCosts > 670000.00);
    assert.ok(proj.projectedEbitda < 240000.00);
  });

  test('6. Multi-Factor Stress Test (-10% volume, -2.5% rate, +6% supplies, +4% labor) compound calculation integrity', () => {
    const proj = calculateScenarioProjections(BASELINE_NAPLES_OPERATING_DATA, {
      caseVolumeDeltaPercent: -10.00,
      reimbursementRateDeltaPercent: -2.50,
      supplyCostInflationPercent: 6.00,
      laborWageInflationPercent: 4.00
    });

    // 240 * 0.9 = 216 cases
    assert.strictEqual(proj.projectedCases, 216);

    // Revenue per case compressed: 4791.67 * 0.975 = 4671.88
    assert.strictEqual(proj.adjustedRevenuePerCase, 4671.88);

    // EBITDA significantly compressed under compound stress
    assert.ok(proj.projectedEbitda < 170000.00, 'EBITDA under compound stress must be under $170k');
    assert.ok(proj.projectedMarginOfSafetyCases < 100, 'MOS should drop under stress');
  });

  test('7. Operating Room Capacity constraint formula and threshold validation', () => {
    assert.strictEqual(OR_CAPACITY_CONSTANTS.TOTAL_AVAILABLE_OR_MINUTES, 40320);

    // Baseline: 18,240 minutes -> 45.24%
    const baseProj = calculateScenarioProjections(BASELINE_NAPLES_OPERATING_DATA, {});
    assert.strictEqual(baseProj.orMinutesUtilized, 18240);
    assert.strictEqual(baseProj.orCapacityUtilizationPercent, 45.24);

    // Heavy expansion: +80% volume -> 432 cases -> 32,832 mins -> 81.43%
    const heavyExp = calculateScenarioProjections(BASELINE_NAPLES_OPERATING_DATA, {
      caseVolumeDeltaPercent: 80.00
    });
    assert.strictEqual(heavyExp.projectedCases, 432);
    assert.strictEqual(heavyExp.orMinutesUtilized, 32832);
    assert.strictEqual(heavyExp.orCapacityUtilizationPercent, 81.43);
  });

  test('8. Dual facade re-export parity between lib and services', async () => {
    const libExports = Object.keys(libScenarioModelingService);

    assert.ok(libExports.length > 0, 'Lib facade must export functions');
    assert.strictEqual(typeof libScenarioModelingService.getScenarioTelemetry, 'function');
    assert.strictEqual(typeof libScenarioModelingService.getScenarioComparativeMatrix, 'function');
    assert.strictEqual(typeof libScenarioModelingService.calculateScenarioProjections, 'function');
    assert.strictEqual(typeof libScenarioModelingService.approveAndFreezeScenario, 'function');
  });

  test('9. Scenario approval hard-freezes version and writes SHA-256 seal', () => {
    const result = approveAndFreezeScenario('SCEN_ORTHO_EXP', '00000000-0000-0000-0000-000000000001');

    assert.ok(result.success);
    assert.strictEqual(result.status, SCENARIO_STATUSES.APPROVED_STRATEGY);
    assert.ok(result.frozenHash.length >= 32, 'Must generate cryptographic seal');
    assert.ok(result.approvedAt);

    const updated = getScenarioByIdOrCode('SCEN_ORTHO_EXP');
    assert.strictEqual(updated.status, SCENARIO_STATUSES.APPROVED_STRATEGY);
    assert.strictEqual(updated.isApproved, true);
    assert.strictEqual(updated.frozenHash, result.frozenHash);
  });

  test('10. Migration 119 UP/DOWN SQL structural integrity and RLS policy verification', () => {
    const upSqlPath = path.resolve(__dirname, '../supabase/migrations/119_scenario_modeling.sql');
    const downSqlPath = path.resolve(__dirname, '../supabase/migrations/119_scenario_modeling_down.sql');

    assert.ok(fs.existsSync(upSqlPath), 'Migration 119 UP file must exist');
    assert.ok(fs.existsSync(downSqlPath), 'Migration 119 DOWN file must exist');

    const upSql = fs.readFileSync(upSqlPath, 'utf8');
    const downSql = fs.readFileSync(downSqlPath, 'utf8');

    // Tables & View
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.facility_scenarios'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.scenario_specialty_impacts'));
    assert.ok(upSql.includes('CREATE OR REPLACE VIEW public.vw_scenario_telemetry'));

    // RLS Policies & Tenant Isolation
    assert.ok(upSql.includes('ENABLE ROW LEVEL SECURITY'));
    assert.ok(upSql.includes('tenant_isolation_facility_scenarios'));
    assert.ok(upSql.includes('tenant_isolation_scenario_specialties'));
    assert.ok(upSql.includes('current_setting(\'app.current_facility_id\', true)'));

    // Down SQL drops
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.facility_scenarios'));
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.scenario_specialty_impacts'));
    assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_scenario_telemetry'));
  });

  test('11. Strict Zero-Prohibited Token Compliance in ScenarioModelingView', () => {
    const cssPath = path.resolve(__dirname, '../src/components/ScenarioModelingView.css');
    const jsxPath = path.resolve(__dirname, '../src/components/ScenarioModelingView.jsx');

    if (fs.existsSync(cssPath)) {
      const css = fs.readFileSync(cssPath, 'utf8');
      const prohibitedRegex = /(purple|violet|indigo|magenta|fuchsia)/i;
      assert.strictEqual(prohibitedRegex.test(css), false, 'ScenarioModelingView.css contains prohibited color token');
    }

    if (fs.existsSync(jsxPath)) {
      const jsx = fs.readFileSync(jsxPath, 'utf8');
      const prohibitedRegex = /(purple|violet|indigo|magenta|fuchsia)/i;
      assert.strictEqual(prohibitedRegex.test(jsx), false, 'ScenarioModelingView.jsx contains prohibited color token');
    }
  });

  test('12. App Shell Integration (src/App.jsx)', () => {
    const appJsxPath = path.resolve(__dirname, '../src/App.jsx');
    const appJsx = fs.readFileSync(appJsxPath, 'utf8');

    assert.ok(appJsx.includes('ScenarioModelingView'), 'App.jsx must import ScenarioModelingView');
    assert.ok(appJsx.includes("activeTab === 'scenario_modeling'"), 'App.jsx must route scenario_modeling tab');
  });

});
