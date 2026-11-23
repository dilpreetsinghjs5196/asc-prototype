/**
 * ==============================================================================
 * Phase E7 Test Suite: ASC Analyst ROI & Validated Value Reporting Engine
 * Module 14: CFO Dashboard & Financial Accounting
 * Tests: Scorecard telemetry, facility alias resolution, 4-pillar gross summation,
 *        staff intervention labor deduction, net ROI % math, ROI multiplier math,
 *        payback period velocity, line-item provenance attribution, dual facade parity,
 *        cryptographic SHA-256 seal, Migration 121 SQL integrity, zero prohibited
 *        token compliance, and App shell integration.
 * ==============================================================================
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ROI_REPORT_STATUSES,
  VALUE_PILLARS,
  DEFAULT_HOURLY_LABOR_RATE,
  INITIAL_FACILITY_ROI_REPORTS,
  INITIAL_ROI_LINE_ITEMS,
  matchesFacilityId,
  computeRoiReportHash,
  calculateRoiMetrics,
  resetLiveRoiReportState,
  getFacilityRoiReports,
  getRoiReportByIdOrCode,
  getRoiValueLineItems,
  getRoiReportTelemetry,
  publishAndFreezeRoiReport,
  generateRoiDossier
} from '../src/services/roiValueReportService.js';

import * as libRoiValueReportService from '../src/lib/roiValueReportService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase E7: ASC Analyst ROI & Validated Value Reporting Engine', () => {

  beforeEach(() => {
    resetLiveRoiReportState();
  });

  test('1. Telemetry returns accurate October 2026 / YTD scorecard metrics ($42k TCO, $422k gross, $404k net, 861.96% ROI, 9.62x)', () => {
    const telemetry = getRoiReportTelemetry('fac-naples-01', 'VAL_ROI_2026_YTD');

    assert.ok(telemetry, 'Telemetry must not be null');
    assert.strictEqual(telemetry.reportCode, 'VAL_ROI_2026_YTD');
    assert.strictEqual(telemetry.status, ROI_REPORT_STATUSES.PUBLISHED_AUDITED);
    assert.strictEqual(telemetry.isActive, true);
    assert.strictEqual(telemetry.isPublished, true);

    // Platform Investment (TCO)
    assert.strictEqual(telemetry.totalPlatformInvestment, 42000.00);
    assert.strictEqual(telemetry.annualSoftwareFee, 36000.00);
    assert.strictEqual(telemetry.implementationFee, 12000.00);

    // 4-Pillar Gross Values
    assert.strictEqual(telemetry.recoveredRevenue, 148500.00);
    assert.strictEqual(telemetry.directSavings, 96400.00);
    assert.strictEqual(telemetry.capacityValue, 132325.00);
    assert.strictEqual(telemetry.avoidedCosts, 45000.00);
    assert.strictEqual(telemetry.grossValidatedValue, 422225.00);

    // Labor Offsets & Net Value
    assert.strictEqual(telemetry.staffInterventionHours, 280.00);
    assert.strictEqual(telemetry.hourlyLaborRate, 65.00);
    assert.strictEqual(telemetry.staffLaborCost, 18200.00);
    assert.strictEqual(telemetry.netValidatedValue, 404025.00);

    // Executive ROI Metrics
    assert.strictEqual(telemetry.netRoiPercent, 861.96);
    assert.strictEqual(telemetry.roiMultiplier, 9.62);
    assert.strictEqual(telemetry.paybackPeriodMonths, 1.04);
    assert.strictEqual(telemetry.costOfInaction, 164500.00);
  });

  test('2. Facility UUID alias resolution matches Naples Surgery Center across strings and object configurations', () => {
    assert.strictEqual(matchesFacilityId('fac-naples-01', '00000000-0000-0000-0000-000000000002'), true);
    assert.strictEqual(matchesFacilityId('00000000-0000-0000-0000-000000000002', 'fac-naples-01'), true);
    assert.strictEqual(matchesFacilityId('fac-naples-01', 'fac-naples-01'), true);
    assert.strictEqual(matchesFacilityId('fac-naples-01', { id: 'fac-naples-01' }), true);
    assert.strictEqual(matchesFacilityId('fac-naples-01', { facilityId: '00000000-0000-0000-0000-000000000002' }), true);
    assert.strictEqual(matchesFacilityId('fac-miami-04', 'fac-naples-01'), false);
    assert.strictEqual(matchesFacilityId('fac-naples-01', 'ALL'), true);
  });

  test('3. 4-Pillar gross value math correctly sums revenue, savings, capacity, and avoided costs', () => {
    const metrics = calculateRoiMetrics({
      recoveredRevenue: 148500.00,
      directSavings: 96400.00,
      capacityValue: 132325.00,
      avoidedCosts: 45000.00
    });

    const expectedGross = 148500.00 + 96400.00 + 132325.00 + 45000.00;
    assert.strictEqual(metrics.grossValidatedValue, 422225.00);
    assert.strictEqual(metrics.grossValidatedValue, expectedGross);
  });

  test('4. Net value math deducts staff intervention labor ($280 hrs @ $65/hr = $18,200)', () => {
    const metrics = calculateRoiMetrics({
      recoveredRevenue: 148500.00,
      directSavings: 96400.00,
      capacityValue: 132325.00,
      avoidedCosts: 45000.00,
      staffInterventionHours: 280.00,
      hourlyLaborRate: 65.00
    });

    assert.strictEqual(metrics.staffLaborCost, 18200.00);
    assert.strictEqual(metrics.netValidatedValue, 422225.00 - 18200.00);
    assert.strictEqual(metrics.netValidatedValue, 404025.00);
  });

  test('5. Net ROI % formula accurately yields ((404025 - 42000) / 42000) * 100 = 861.96%', () => {
    const metrics = calculateRoiMetrics({
      recoveredRevenue: 148500.00,
      directSavings: 96400.00,
      capacityValue: 132325.00,
      avoidedCosts: 45000.00,
      staffInterventionHours: 280.00,
      hourlyLaborRate: 65.00,
      totalPlatformInvestment: 42000.00
    });

    // ((404,025 - 42,000) / 42,000) * 100 = (362,025 / 42,000) * 100 = 861.9642... -> 861.96%
    assert.strictEqual(metrics.netRoiPercent, 861.96);
  });

  test('6. ROI multiplier formula accurately yields 404025 / 42000 = 9.62x', () => {
    const metrics = calculateRoiMetrics({
      recoveredRevenue: 148500.00,
      directSavings: 96400.00,
      capacityValue: 132325.00,
      avoidedCosts: 45000.00,
      staffInterventionHours: 280.00,
      hourlyLaborRate: 65.00,
      totalPlatformInvestment: 42000.00
    });

    // 404,025 / 42,000 = 9.6196... -> 9.62x
    assert.strictEqual(metrics.roiMultiplier, 9.62);
  });

  test('7. Payback period formula accurately yields 42000 / (404025 / 10) = 1.04 months (31 days)', () => {
    const metrics = calculateRoiMetrics({
      recoveredRevenue: 148500.00,
      directSavings: 96400.00,
      capacityValue: 132325.00,
      avoidedCosts: 45000.00,
      staffInterventionHours: 280.00,
      hourlyLaborRate: 65.00,
      totalPlatformInvestment: 42000.00,
      activeMonths: 10
    });

    // 42,000 / (404,025 / 10) = 42,000 / 40,402.5 = 1.0395... -> 1.04 months
    assert.strictEqual(metrics.paybackPeriodMonths, 1.04);
  });

  test('8. Line-item attribution retrieval returns verified provenance rows across all 4 pillars', () => {
    const items = getRoiValueLineItems('VAL_ROI_2026_YTD');

    assert.strictEqual(items.length, 8);

    const pillarsPresent = new Set(items.map(i => i.pillarCode));
    assert.ok(pillarsPresent.has(VALUE_PILLARS.RECOVERED_REVENUE));
    assert.ok(pillarsPresent.has(VALUE_PILLARS.DIRECT_SAVINGS));
    assert.ok(pillarsPresent.has(VALUE_PILLARS.CAPACITY_VALUE));
    assert.ok(pillarsPresent.has(VALUE_PILLARS.AVOIDED_COST));

    // Net sum of items matches net validated value
    const grossSum = items.reduce((acc, i) => acc + i.grossAmount, 0);
    const laborSum = items.reduce((acc, i) => acc + i.laborOffset, 0);
    const netSum = items.reduce((acc, i) => acc + i.netAmount, 0);

    assert.strictEqual(grossSum, 422225.00);
    assert.strictEqual(laborSum, 18200.00);
    assert.strictEqual(netSum, 404025.00);
  });

  test('9. Dual facade re-export parity between src/services/ and src/lib/', () => {
    assert.strictEqual(typeof libRoiValueReportService.getRoiReportTelemetry, 'function');
    assert.strictEqual(typeof libRoiValueReportService.getRoiValueLineItems, 'function');
    assert.strictEqual(typeof libRoiValueReportService.publishAndFreezeRoiReport, 'function');
    assert.strictEqual(typeof libRoiValueReportService.calculateRoiMetrics, 'function');
    assert.strictEqual(typeof libRoiValueReportService.matchesFacilityId, 'function');
    assert.deepStrictEqual(libRoiValueReportService.ROI_REPORT_STATUSES, ROI_REPORT_STATUSES);
    assert.deepStrictEqual(libRoiValueReportService.VALUE_PILLARS, VALUE_PILLARS);
  });

  test('10. Publication hard-freezes report and writes 64-character SHA-256 cryptographic seal', () => {
    const res = publishAndFreezeRoiReport('VAL_ROI_2026_YTD', '00000000-0000-0000-0000-000000000001');

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.reportCode, 'VAL_ROI_2026_YTD');
    assert.strictEqual(res.status, ROI_REPORT_STATUSES.PUBLISHED_AUDITED);
    assert.ok(res.frozenHash, 'Frozen hash must not be empty');
    assert.strictEqual(res.frozenHash.length, 64, 'Frozen hash must be 64 characters long');

    const updated = getRoiReportByIdOrCode('VAL_ROI_2026_YTD');
    assert.strictEqual(updated.status, ROI_REPORT_STATUSES.PUBLISHED_AUDITED);
    assert.strictEqual(updated.isPublished, true);
    assert.strictEqual(updated.frozenHash, res.frozenHash);
  });

  test('11. Migration 121 UP/DOWN SQL structural integrity and RLS policy verification', () => {
    const upMigrationPath = path.resolve(__dirname, '../supabase/migrations/121_roi_and_value_report.sql');
    const downMigrationPath = path.resolve(__dirname, '../supabase/migrations/121_roi_and_value_report_down.sql');

    assert.ok(fs.existsSync(upMigrationPath), '121_roi_and_value_report.sql must exist');
    assert.ok(fs.existsSync(downMigrationPath), '121_roi_and_value_report_down.sql must exist');

    const upSql = fs.readFileSync(upMigrationPath, 'utf8');
    const downSql = fs.readFileSync(downMigrationPath, 'utf8');

    // UP Migration assertions
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.facility_roi_reports'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.roi_value_line_items'));
    assert.ok(upSql.includes('CREATE OR REPLACE VIEW public.vw_facility_roi_telemetry'));
    assert.ok(upSql.includes('ALTER TABLE public.facility_roi_reports ENABLE ROW LEVEL SECURITY'));
    assert.ok(upSql.includes('ALTER TABLE public.roi_value_line_items ENABLE ROW LEVEL SECURITY'));
    assert.ok(upSql.includes('CREATE POLICY tenant_isolation_roi_reports'));
    assert.ok(upSql.includes('CREATE POLICY tenant_isolation_roi_line_items'));
    assert.ok(upSql.includes('VAL_ROI_2026_YTD'));

    // DOWN Migration assertions
    assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_facility_roi_telemetry CASCADE;'));
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.roi_value_line_items CASCADE;'));
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.facility_roi_reports CASCADE;'));
  });

  test('12. Strict Zero-Prohibited Token Compliance (no purple/violet/indigo/magenta/fuchsia) and App shell integration', () => {
    const filesToCheck = [
      path.resolve(__dirname, '../src/components/RoiValueReportView.jsx'),
      path.resolve(__dirname, '../src/components/RoiValueReportView.css'),
      path.resolve(__dirname, '../src/services/roiValueReportService.js'),
      path.resolve(__dirname, '../src/lib/roiValueReportService.js')
    ];

    const prohibitedPattern = /\b(purple|violet|indigo|magenta|fuchsia)\b/i;

    filesToCheck.forEach(file => {
      assert.ok(fs.existsSync(file), `File ${file} must exist`);
      const content = fs.readFileSync(file, 'utf8');
      const match = content.match(prohibitedPattern);
      assert.strictEqual(
        match,
        null,
        `Prohibited token "${match ? match[0] : ''}" found in ${path.basename(file)}!`
      );
    });

    const appPath = path.resolve(__dirname, '../src/App.jsx');
    assert.ok(fs.existsSync(appPath), 'src/App.jsx must exist');

    const appContent = fs.readFileSync(appPath, 'utf8');

    assert.ok(
      appContent.includes("import RoiValueReportView from './components/RoiValueReportView';"),
      'App.jsx must import RoiValueReportView'
    );
    assert.ok(
      appContent.includes("activeTab === 'roi_value_report'"),
      'App.jsx must handle roi_value_report activeTab'
    );
    assert.ok(
      appContent.includes('<RoiValueReportView activeFacility={activeFacility} />'),
      'App.jsx must render RoiValueReportView with activeFacility prop'
    );
    assert.ok(
      appContent.includes("'roi_value_report'"),
      'App.jsx exclusion array must include roi_value_report'
    );
  });
});
