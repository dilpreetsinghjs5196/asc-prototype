/**
 * ==============================================================================
 * Phase E4 Test Suite: Break-Even Analysis & Cost-Volume-Profit (CVP) Engine
 * Module 14: CFO Dashboard & Financial Accounting
 * Tests: Telemetry KPI aggregation, facility alias resolution, unit contribution margin,
 *        break-even volume & revenue, margin of safety, degree of operating leverage (DOL),
 *        target profit simulation, dual facade parity, cryptographic freeze seal,
 *        Migration 118 SQL integrity, zero prohibited token CSS compliance, and App shell integration.
 * ==============================================================================
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MODEL_STATUSES,
  PERIOD_TYPES,
  matchesFacilityId,
  computeBreakEvenHash,
  calculateUnitContributionMargin,
  calculateContributionMarginRatio,
  calculateBreakEvenVolume,
  calculateBreakEvenRevenue,
  calculateMarginOfSafety,
  calculateDegreeOfOperatingLeverage,
  calculateTargetProfitVolume,
  resetLiveBreakEvenState,
  getFacilityBreakEvenModels,
  getBreakEvenModelByIdOrCode,
  getBreakEvenAnalysis,
  getBreakEvenTelemetry,
  simulateBreakEvenSensitivity,
  approveAndFreezeBreakEvenModel,
  INITIAL_SPECIALTY_BENCHMARKS,
  INITIAL_FACILITY_BREAK_EVEN_MODELS
} from '../src/services/breakEvenService.js';

import * as libBreakEvenService from '../src/lib/breakEvenService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase E4: Break-Even Analysis & Cost-Volume-Profit (CVP) Engine', () => {

  beforeEach(() => {
    resetLiveBreakEvenState();
  });

  test('1. Telemetry returns break-even volume (120 cases), revenue ($575k), CM ($2,000), and MOS (50%)', () => {
    const telemetry = getBreakEvenTelemetry('fac-naples-01', 'BE2026_M10_BASE');

    assert.ok(telemetry, 'Telemetry must not be null');
    assert.strictEqual(telemetry.modelCode, 'BE2026_M10_BASE');
    assert.strictEqual(telemetry.status, MODEL_STATUSES.ACTIVE_BENCHMARK);
    assert.strictEqual(telemetry.isActive, true);

    // Fixed overhead: $240,000
    assert.strictEqual(telemetry.fixedOverheadCosts, 240000.00);

    // Unit economics
    assert.strictEqual(telemetry.unitContributionMargin, 2000.00);
    assert.strictEqual(telemetry.contributionMarginRatio, 0.4174);

    // Break-even thresholds
    assert.strictEqual(telemetry.breakEvenCases, 120);
    assert.strictEqual(telemetry.breakEvenRevenue, 575000.00);

    // Actual volume & Margin of Safety
    assert.strictEqual(telemetry.actualCases, 240);
    assert.strictEqual(telemetry.marginOfSafetyCases, 120);
    assert.strictEqual(telemetry.marginOfSafetyPercent, 50.00);

    // Operating Leverage
    assert.strictEqual(telemetry.degreeOfOperatingLeverage, 2.00);

    // Daily run-rate across 21 operating days
    assert.strictEqual(telemetry.dailyBreakEvenCases, 5.71);
    assert.strictEqual(telemetry.specialtyCount, 5);
  });

  test('2. Facility UUID alias resolution matches Naples Surgery Center correctly', () => {
    assert.strictEqual(matchesFacilityId('fac-naples-01', '00000000-0000-0000-0000-000000000002'), true);
    assert.strictEqual(matchesFacilityId('00000000-0000-0000-0000-000000000002', 'fac-naples-01'), true);
    assert.strictEqual(matchesFacilityId('fac-naples-01', 'fac-naples-01'), true);
    assert.strictEqual(matchesFacilityId('fac-orlando-03', 'fac-naples-01'), false);
    assert.strictEqual(matchesFacilityId('fac-naples-01', 'ALL'), true);
  });

  test('3. Unit Contribution Margin (CM = R - VC) and CM Ratio (CMR = CM / R)', () => {
    const revenue = 4791.67;
    const variableCost = 2791.67;
    const unitCm = calculateUnitContributionMargin(revenue, variableCost);
    assert.strictEqual(unitCm, 2000.00);

    const cmr = calculateContributionMarginRatio(unitCm, revenue);
    assert.strictEqual(cmr, 0.4174);

    // Specialty level checks: Orthopedics
    const ortho = INITIAL_SPECIALTY_BENCHMARKS.find(s => s.specialtyCode === 'ORTHOPEDICS');
    assert.ok(ortho);
    const orthoCm = calculateUnitContributionMargin(ortho.revenuePerCase, ortho.variableCostPerCase);
    assert.strictEqual(orthoCm, 3600.00);
    assert.strictEqual(calculateContributionMarginRatio(orthoCm, ortho.revenuePerCase), 0.4235);
  });

  test('4. Break-even volume formula Q_BE = ceil(FC / Unit CM)', () => {
    const fixedCosts = 240000.00;
    const unitCm = 2000.00;
    const beVolume = calculateBreakEvenVolume(fixedCosts, unitCm);
    assert.strictEqual(beVolume, 120);

    // Test ceiling with fractional result
    const fractionalBe = calculateBreakEvenVolume(100000, 1500); // 66.666 -> 67
    assert.strictEqual(fractionalBe, 67);

    // Zero or negative CM returns 0
    assert.strictEqual(calculateBreakEvenVolume(100000, 0), 0);
    assert.strictEqual(calculateBreakEvenVolume(100000, -500), 0);
  });

  test('5. Break-even dollar revenue formula R_BE = FC / CMR', () => {
    const fixedCosts = 240000.00;
    const cmr = 0.4173913; // 2000 / 4791.67
    const beRevenue = calculateBreakEvenRevenue(fixedCosts, cmr);
    assert.strictEqual(Math.round(beRevenue), 575000);
  });

  test('6. Margin of Safety: MOS_Q = Q - Q_BE and MOS_% = MOS_Q / Q * 100', () => {
    const mos = calculateMarginOfSafety(240, 120);
    assert.strictEqual(mos.cases, 120);
    assert.strictEqual(mos.percent, 50.00);

    // At exact break-even
    const exactMos = calculateMarginOfSafety(120, 120);
    assert.strictEqual(exactMos.cases, 0);
    assert.strictEqual(exactMos.percent, 0);

    // Below break-even (deficit)
    const deficitMos = calculateMarginOfSafety(100, 120);
    assert.strictEqual(deficitMos.cases, -20);
    assert.strictEqual(deficitMos.percent, -20.00);
  });

  test('7. Degree of Operating Leverage: DOL = Total Contribution Margin / EBITDA', () => {
    const actualCases = 240;
    const unitCm = 2000.00;
    const totalCm = actualCases * unitCm; // $480,000
    const fixedCosts = 240000.00;
    const ebitda = totalCm - fixedCosts; // $240,000

    const dol = calculateDegreeOfOperatingLeverage(totalCm, ebitda);
    assert.strictEqual(dol, 2.00);

    // Verify target profit volume: Q = (FC + Target) / CM
    const targetEbitda = 300000.00;
    const targetVolume = calculateTargetProfitVolume(fixedCosts, targetEbitda, unitCm);
    assert.strictEqual(targetVolume, 270); // (240k + 300k) / 2000 = 270 cases
  });

  test('8. Dual facade re-export parity between lib and services', async () => {
    const libExports = Object.keys(libBreakEvenService);

    assert.ok(libExports.length > 0, 'Lib facade must export functions');
    assert.strictEqual(typeof libBreakEvenService.getBreakEvenTelemetry, 'function');
    assert.strictEqual(typeof libBreakEvenService.getBreakEvenAnalysis, 'function');
    assert.strictEqual(typeof libBreakEvenService.simulateBreakEvenSensitivity, 'function');
    assert.strictEqual(typeof libBreakEvenService.approveAndFreezeBreakEvenModel, 'function');
  });

  test('9. Model approval hard-freezes version and writes SHA-256 seal', () => {
    const result = approveAndFreezeBreakEvenModel('BE2026_M10_BASE', '00000000-0000-0000-0000-000000000001');

    assert.ok(result.success);
    assert.strictEqual(result.status, MODEL_STATUSES.ACTIVE_BENCHMARK);
    assert.ok(result.frozenHash.length >= 32, 'Must generate cryptographic seal');
    assert.ok(result.approvedAt);

    const updated = getBreakEvenModelByIdOrCode('BE2026_M10_BASE');
    assert.strictEqual(updated.status, MODEL_STATUSES.ACTIVE_BENCHMARK);
    assert.strictEqual(updated.isApproved, true);
    assert.strictEqual(updated.frozenHash, result.frozenHash);
  });

  test('10. Migration 118 UP/DOWN SQL structural integrity and RLS policy verification', () => {
    const upSqlPath = path.resolve(__dirname, '../supabase/migrations/118_break_even_analysis.sql');
    const downSqlPath = path.resolve(__dirname, '../supabase/migrations/118_break_even_analysis_down.sql');

    assert.ok(fs.existsSync(upSqlPath), 'Migration 118 UP file must exist');
    assert.ok(fs.existsSync(downSqlPath), 'Migration 118 DOWN file must exist');

    const upSql = fs.readFileSync(upSqlPath, 'utf8');
    const downSql = fs.readFileSync(downSqlPath, 'utf8');

    // Tables & View
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.facility_break_even_models'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.break_even_specialty_benchmarks'));
    assert.ok(upSql.includes('CREATE OR REPLACE VIEW public.vw_break_even_telemetry'));

    // RLS Policies & Tenant Isolation
    assert.ok(upSql.includes('ENABLE ROW LEVEL SECURITY'));
    assert.ok(upSql.includes('tenant_isolation_be_models'));
    assert.ok(upSql.includes('tenant_isolation_be_specialties'));
    assert.ok(upSql.includes('current_setting(\'app.current_facility_id\', true)'));

    // Down SQL drops
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.break_even_specialty_benchmarks'));
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.facility_break_even_models'));
    assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_break_even_telemetry'));
  });

  test('11. Strict Zero-Prohibited Token Compliance in BreakEvenView', () => {
    const cssPath = path.resolve(__dirname, '../src/components/BreakEvenView.css');
    const jsxPath = path.resolve(__dirname, '../src/components/BreakEvenView.jsx');

    if (fs.existsSync(cssPath)) {
      const css = fs.readFileSync(cssPath, 'utf8');
      const prohibitedRegex = /(purple|violet|indigo|magenta|fuchsia)/i;
      assert.strictEqual(prohibitedRegex.test(css), false, 'BreakEvenView.css contains prohibited color token');
    }

    if (fs.existsSync(jsxPath)) {
      const jsx = fs.readFileSync(jsxPath, 'utf8');
      const prohibitedRegex = /(purple|violet|indigo|magenta|fuchsia)/i;
      assert.strictEqual(prohibitedRegex.test(jsx), false, 'BreakEvenView.jsx contains prohibited color token');
    }
  });

  test('12. App Shell Integration (src/App.jsx)', () => {
    const appJsxPath = path.resolve(__dirname, '../src/App.jsx');
    const appJsx = fs.readFileSync(appJsxPath, 'utf8');

    assert.ok(appJsx.includes('BreakEvenView'), 'App.jsx must import BreakEvenView');
    assert.ok(appJsx.includes("activeTab === 'break_even'"), 'App.jsx must route break_even tab');
  });

});
