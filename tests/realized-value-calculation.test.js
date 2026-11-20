/**
 * ==============================================================================
 * Phase D6 Test Suite: Realized Value Calculation & Multi-Pillar ROI Engine
 * Module 13: Decision Intelligence
 * Tests: 4-Pillar Economic Decomposition (Recovered Revenue, Direct Savings,
 *        Capacity Monetization, Cost Avoidance), Gross-to-Net calculation,
 *        ROI multipliers, line-item itemization, cryptographic provenance,
 *        Migration 113 SQL integrity, zero-purple compliance, and App.jsx wiring.
 * ==============================================================================
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  VALUE_PILLARS,
  BASELINE_CM_PER_OR_HOUR,
  BASELINE_HOURLY_LABOR_RATE,
  calculateCapacityValue,
  calculateGrossValue,
  calculateNetRealizedValue,
  calculateRoiMultiplier,
  computeCalculationProvenanceHash,
  matchesFacilityId,
  resetRealizedValueStore,
  getRealizedValueCalculations,
  getCalculationById,
  getCalculationByActionId,
  getCalculationLineItems,
  recordRealizedValueCalculation,
  getRealizedValueTelemetry,
  SEED_REALIZED_VALUE_CALCULATIONS,
  SEED_REALIZED_VALUE_LINE_ITEMS
} from '../src/services/realizedValueService.js';

import * as libRealizedValueService from '../src/lib/realizedValueService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase D6: Realized Value Calculation & Multi-Pillar ROI Engine', () => {

  beforeEach(() => {
    resetRealizedValueStore();
  });

  test('1. Realized Value Telemetry returns accurate facility totals and 4-pillar amounts', () => {
    const telemetry = getRealizedValueTelemetry('fac-naples-01');
    assert.strictEqual(telemetry.totalCalculationsCount, 7, 'Must aggregate 7 seed calculations');
    assert.strictEqual(telemetry.totalGrossValue, 40650.00, 'Gross realized value must equal $40,650.00');
    assert.strictEqual(telemetry.totalRecoveredRevenueAmount, 18710.00, 'Recovered revenue must equal $18,710.00');
    assert.strictEqual(telemetry.totalDirectSavingsAmount, 1250.00, 'Direct savings must equal $1,250.00');
    assert.strictEqual(telemetry.totalCapacityValueAmount, 15800.00, 'Capacity value must equal $15,800.00');
    assert.strictEqual(telemetry.totalAvoidedCostAmount, 4890.00, 'Avoided costs must equal $4,890.00');
    assert.strictEqual(telemetry.totalInterventionLaborCost, 877.50, 'Intervention labor must equal $877.50');
    assert.strictEqual(telemetry.totalNetValue, 39772.50, 'Net realized value must equal $39,772.50');
    assert.strictEqual(telemetry.totalCapacityHoursFreed, 8.0, 'Capacity hours freed must equal 8.0 hrs');
    assert.strictEqual(telemetry.cumulativeRoiMultiplier, 45.3, 'Cumulative ROI must equal 45.3x');
  });

  test('2. Facility UUID alias resolution matches Naples Surgery Center correctly', () => {
    const naplesUuid = '00000000-0000-0000-0000-000000000002';
    const naplesSlug = 'fac-naples-01';

    assert.ok(matchesFacilityId(naplesSlug, naplesUuid), 'Slug must match UUID alias');
    assert.ok(matchesFacilityId(naplesUuid, naplesSlug), 'UUID alias must match slug');
    assert.ok(matchesFacilityId(naplesSlug, 'ALL'), 'ALL must match any facility');

    const calcsFromUuid = getRealizedValueCalculations(naplesUuid);
    assert.strictEqual(calcsFromUuid.length, 7, 'Calculations must be retrievable via facility UUID alias');

    const telemetryFromUuid = getRealizedValueTelemetry(naplesUuid);
    assert.strictEqual(telemetryFromUuid.totalGrossValue, 40650.00, 'Telemetry from UUID must match slug');
  });

  test('3. Deterministic capacity monetization formula (Hours * Fill Rate * CM/Hour)', () => {
    // 8.0 hours @ 100% fill rate @ $1,975.00/hr = $15,800.00
    const val1 = calculateCapacityValue(8.0, 100.0, BASELINE_CM_PER_OR_HOUR);
    assert.strictEqual(val1, 15800.00, '8 hours @ $1,975/hr must equal $15,800.00');

    // 4.0 hours @ 75% fill rate @ $2,000.00/hr = 4 * 0.75 * 2000 = $6,000.00
    const val2 = calculateCapacityValue(4.0, 75.0, 2000.00);
    assert.strictEqual(val2, 6000.00, '4 hours @ 75% @ $2,000/hr must equal $6,000.00');

    // Zero hours or fill rate
    assert.strictEqual(calculateCapacityValue(0, 100.0), 0.00);
    assert.strictEqual(calculateCapacityValue(5, 0), 0.00);
  });

  test('4. Gross-to-Net math invariant (Gross = Rev + Sav + Cap + Avd; Net = Gross - Labor)', () => {
    const gross = calculateGrossValue(18710.00, 1250.00, 15800.00, 4890.00);
    assert.strictEqual(gross, 40650.00, 'Sum of 4 pillars must equal $40,650.00');

    const net = calculateNetRealizedValue(gross, 877.50);
    assert.strictEqual(net, 39772.50, 'Net value must equal Gross minus Labor ($39,772.50)');
  });

  test('5. ROI multiplier calculation and edge case handling', () => {
    // Normal case: $3,320.00 net / $130.00 labor = 25.538... -> 25.5x
    const roi1 = calculateRoiMultiplier(3320.00, 130.00);
    assert.strictEqual(roi1, 25.5, 'ROI must round to 1 decimal place (25.5x)');

    // High return case: $15,605.00 net / $195.00 labor = 80.025... -> 80.0x
    const roi2 = calculateRoiMultiplier(15605.00, 195.00);
    assert.strictEqual(roi2, 80.0, 'ROI must equal 80.0x');

    // Zero labor cost fallback
    const roiZeroLabor = calculateRoiMultiplier(5000.00, 0);
    assert.strictEqual(roiZeroLabor, 50.0, 'Zero labor should fall back to net / 100 benchmark');
  });

  test('6. Negative input floor prevents arithmetic underflow', () => {
    const gross = calculateGrossValue(-100, -50, -200, -30);
    assert.strictEqual(gross, 0.00, 'Gross value must floor negative amounts at 0');

    const capacity = calculateCapacityValue(-5, -50, -1000);
    assert.strictEqual(capacity, 0.00, 'Capacity value must floor negative inputs at 0');

    const net = calculateNetRealizedValue(1000, -500);
    assert.strictEqual(net, 1000.00, 'Negative labor cost must be floored to 0');
  });

  test('7. Line-item itemization retrieval and consistency', () => {
    const calc = getCalculationById('rvc-001');
    assert.ok(calc, 'Calculation rvc-001 must exist');
    assert.strictEqual(calc.calculationCode, 'RVC-2026-001');

    const lineItems = getCalculationLineItems('rvc-001');
    assert.strictEqual(lineItems.length, 2, 'rvc-001 must have 2 itemized line items');

    const lineSum = lineItems.reduce((sum, li) => sum + li.totalAmount, 0);
    assert.strictEqual(lineSum, calc.grossRealizedValue, 'Line items total must match gross realized value ($3,700.00)');
  });

  test('8. Recording a new realized value calculation and verifying provenance hash', () => {
    const newCalc = recordRealizedValueCalculation({
      facilityId: 'fac-naples-01',
      actionId: 'act-test-01',
      actionCode: 'ACT-TEST',
      category: 'UNDERPAYMENT_RECOVERY',
      title: 'Test Commercial Payor Recovery',
      valuePillar: VALUE_PILLARS.RECOVERED_REVENUE,
      recoveredRevenueAmount: 2500.00,
      laborHoursLogged: 2.0,
      hourlyLaborRate: 65.00,
      lineItems: [
        {
          lineNumber: 1,
          description: 'Line 1 Underpayment Principal',
          pillarType: VALUE_PILLARS.RECOVERED_REVENUE,
          quantityUnits: 1,
          unitRate: 2500.00,
          totalAmount: 2500.00,
          sourceTable: 'claims',
          sourceRecordId: 'CLM-TEST'
        }
      ]
    });

    assert.ok(newCalc.id, 'New calculation must receive a generated ID');
    assert.strictEqual(newCalc.grossRealizedValue, 2500.00);
    assert.strictEqual(newCalc.interventionLaborCost, 130.00);
    assert.strictEqual(newCalc.netRealizedValue, 2370.00);
    assert.strictEqual(newCalc.roiMultiplier, 18.2);
    assert.ok(newCalc.provenanceHash && newCalc.provenanceHash.length >= 32, 'Must have cryptographic provenance hash');

    // Telemetry reflects the new addition
    const telemetry = getRealizedValueTelemetry('fac-naples-01');
    assert.strictEqual(telemetry.totalCalculationsCount, 8, 'Count must now be 8');
    assert.strictEqual(telemetry.totalGrossValue, 43150.00, 'Gross value must include new calculation');
  });

  test('9. Migration 113 UP/DOWN SQL structural integrity', () => {
    const upMigrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '113_realized_value_calculation.sql');
    const downMigrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '113_realized_value_calculation_down.sql');

    assert.ok(fs.existsSync(upMigrationPath), 'Migration 113 UP must exist');
    assert.ok(fs.existsSync(downMigrationPath), 'Migration 113 DOWN must exist');

    const upSql = fs.readFileSync(upMigrationPath, 'utf8');
    const downSql = fs.readFileSync(downMigrationPath, 'utf8');

    // Check table creation
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.realized_value_calculations'), 'UP must create realized_value_calculations');
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.realized_value_line_items'), 'UP must create realized_value_line_items');
    assert.ok(upSql.includes('CREATE OR REPLACE VIEW public.vw_realized_value_telemetry'), 'UP must create telemetry view');

    // Check constraints and columns
    assert.ok(upSql.includes('value_pillar VARCHAR(32) NOT NULL CHECK'), 'UP must enforce pillar CHECK constraint');
    assert.ok(upSql.includes('gross_realized_value NUMERIC(12, 2)'), 'UP must have gross_realized_value');
    assert.ok(upSql.includes('net_realized_value NUMERIC(12, 2)'), 'UP must have net_realized_value');
    assert.ok(upSql.includes('roi_multiplier NUMERIC(6, 2)'), 'UP must have roi_multiplier');
    assert.ok(upSql.includes('DROP POLICY IF EXISTS'), 'UP must drop policies idempotently before creating');

    // Check rollback script
    assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_realized_value_telemetry'), 'DOWN must drop telemetry view');
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.realized_value_line_items'), 'DOWN must drop line items');
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.realized_value_calculations'), 'DOWN must drop calculations');
  });

  test('10. Strict Zero-Purple CSS Compliance in RealizedValueCalculationView', () => {
    const cssPath = path.join(__dirname, '..', 'src', 'components', 'RealizedValueCalculationView.css');
    const jsxPath = path.join(__dirname, '..', 'src', 'components', 'RealizedValueCalculationView.jsx');

    assert.ok(fs.existsSync(cssPath), 'CSS file must exist');
    assert.ok(fs.existsSync(jsxPath), 'JSX file must exist');

    const cssContent = fs.readFileSync(cssPath, 'utf8');
    const jsxContent = fs.readFileSync(jsxPath, 'utf8');

    const prohibitedTokens = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];

    for (const token of prohibitedTokens) {
      const cssRegex = new RegExp(`\\b${token}\\b`, 'i');
      const jsxRegex = new RegExp(`\\b${token}\\b`, 'i');

      assert.strictEqual(
        cssRegex.test(cssContent),
        false,
        `CSS must not contain prohibited token: "${token}"`
      );
      assert.strictEqual(
        jsxRegex.test(jsxContent),
        false,
        `JSX must not contain prohibited token: "${token}"`
      );
    }
  });

  test('11. Dual Re-Export Facade Parity (src/lib/realizedValueService.js)', () => {
    const essentialExports = [
      'matchesFacilityId',
      'computeCalculationProvenanceHash',
      'VALUE_PILLARS',
      'BASELINE_CM_PER_OR_HOUR',
      'BASELINE_HOURLY_LABOR_RATE',
      'calculateCapacityValue',
      'calculateGrossValue',
      'calculateNetRealizedValue',
      'calculateRoiMultiplier',
      'SEED_REALIZED_VALUE_CALCULATIONS',
      'SEED_REALIZED_VALUE_LINE_ITEMS',
      'resetRealizedValueStore',
      'getRealizedValueCalculations',
      'getCalculationById',
      'getCalculationByActionId',
      'getCalculationLineItems',
      'recordRealizedValueCalculation',
      'getRealizedValueTelemetry'
    ];

    for (const fnName of essentialExports) {
      assert.ok(
        libRealizedValueService[fnName] !== undefined,
        `Facade src/lib/realizedValueService.js must re-export: ${fnName}`
      );
    }
  });

  test('12. App Shell Integration (src/App.jsx)', () => {
    const appJsxPath = path.join(__dirname, '..', 'src', 'App.jsx');
    const appJsx = fs.readFileSync(appJsxPath, 'utf8');

    assert.ok(
      appJsx.includes("import RealizedValueCalculationView from './components/RealizedValueCalculationView'"),
      'App.jsx must import RealizedValueCalculationView'
    );
    assert.ok(
      appJsx.includes("activeTab === 'realized_value'"),
      'App.jsx must register realized_value active tab'
    );
    assert.ok(
      appJsx.includes('Realized Value & ROI'),
      'App.jsx must contain sidebar menu label "Realized Value & ROI"'
    );
    assert.ok(
      appJsx.includes('Realized Value & Multi-Pillar ROI Accounting'),
      'App.jsx must set header title for realized_value'
    );
    assert.ok(
      appJsx.includes('<RealizedValueCalculationView activeFacility={activeFacility} />'),
      'App.jsx must render RealizedValueCalculationView'
    );
  });

});
