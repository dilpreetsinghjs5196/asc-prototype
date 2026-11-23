/**
 * ==============================================================================
 * Phase E6 Test Suite: Board Reporting & Executive KPI Package Engine
 * Module 14: CFO Dashboard & Financial Accounting
 * Tests: Scorecard telemetry, facility alias resolution, budget variance invariants,
 *        debt covenant headroom, DSO & clean claim rates, OR capacity utilization,
 *        5 structured sections & narrative highlights, dual facade parity,
 *        cryptographic freeze seal, Migration 120 SQL integrity, zero prohibited
 *        token compliance, and App shell integration.
 * ==============================================================================
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PACKAGE_STATUSES,
  SECTION_CODES,
  OR_CAPACITY_CONSTANTS,
  INITIAL_FACILITY_BOARD_PACKAGES,
  INITIAL_BOARD_PACKAGE_SECTIONS,
  matchesFacilityId,
  computeBoardPackageHash,
  calculateBoardPackageKPIs,
  resetLiveBoardReportingState,
  getFacilityBoardPackages,
  getBoardPackageByIdOrCode,
  getBoardPackageSections,
  getBoardPackageTelemetry,
  publishAndFreezeBoardPackage,
  generateBoardPackageDossier
} from '../src/services/boardReportingService.js';

import * as libBoardReportingService from '../src/lib/boardReportingService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase E6: Board Reporting & Executive KPI Package Engine', () => {

  beforeEach(() => {
    resetLiveBoardReportingState();
  });

  test('1. Telemetry returns accurate October 2026 scorecard (240 cases, $1.15M NPR, $240k EBITDA, $1.25M cash)', () => {
    const telemetry = getBoardPackageTelemetry('fac-naples-01', 'BOD_2026_M10');

    assert.ok(telemetry, 'Telemetry must not be null');
    assert.strictEqual(telemetry.packageCode, 'BOD_2026_M10');
    assert.strictEqual(telemetry.status, PACKAGE_STATUSES.PUBLISHED_TO_BOARD);
    assert.strictEqual(telemetry.isActive, true);
    assert.strictEqual(telemetry.isPublished, true);

    // Scorecard outputs: 240 cases, $1.15M NPR, $240k EBITDA
    assert.strictEqual(telemetry.actualCases, 240);
    assert.strictEqual(telemetry.budgetedCases, 250);
    assert.strictEqual(telemetry.caseVariance, -10);

    assert.strictEqual(telemetry.actualNpr, 1150000.00);
    assert.strictEqual(telemetry.budgetedNpr, 1180000.00);
    assert.strictEqual(telemetry.nprVariance, -30000.00);

    assert.strictEqual(telemetry.actualEbitda, 240000.00);
    assert.strictEqual(telemetry.budgetedEbitda, 250000.00);
    assert.strictEqual(telemetry.ebitdaVariance, -10000.00);
    assert.strictEqual(telemetry.ebitdaMarginPercent, 20.87);

    assert.strictEqual(telemetry.endingCashBalance, 1250000.00);
    assert.strictEqual(telemetry.minimumCashCovenant, 400000.00);
    assert.strictEqual(telemetry.covenantHeadroom, 850000.00);

    assert.strictEqual(telemetry.daysSalesOutstanding, 32);
    assert.strictEqual(telemetry.cleanClaimRate, 96.80);
    assert.strictEqual(telemetry.orCapacityUtilizationPercent, 45.24);
  });

  test('2. Facility UUID alias resolution matches Naples Surgery Center correctly across strings and objects', () => {
    assert.strictEqual(matchesFacilityId('fac-naples-01', '00000000-0000-0000-0000-000000000002'), true);
    assert.strictEqual(matchesFacilityId('00000000-0000-0000-0000-000000000002', 'fac-naples-01'), true);
    assert.strictEqual(matchesFacilityId('fac-naples-01', 'fac-naples-01'), true);
    assert.strictEqual(matchesFacilityId('fac-naples-01', { id: 'fac-naples-01' }), true);
    assert.strictEqual(matchesFacilityId('fac-naples-01', { facilityId: '00000000-0000-0000-0000-000000000002' }), true);
    assert.strictEqual(matchesFacilityId('fac-miami-04', 'fac-naples-01'), false);
    assert.strictEqual(matchesFacilityId('fac-naples-01', 'ALL'), true);
  });

  test('3. Budget variance invariants (Delta = Actual - Budget) for Cases (-10), NPR (-$30,000), and EBITDA (-$10,000)', () => {
    const kpis = calculateBoardPackageKPIs({
      actualCases: 240,
      budgetedCases: 250,
      actualNpr: 1150000.00,
      budgetedNpr: 1180000.00,
      actualEbitda: 240000.00,
      budgetedEbitda: 250000.00
    });

    assert.strictEqual(kpis.caseVariance, -10);
    assert.strictEqual(kpis.nprVariance, -30000.00);
    assert.strictEqual(kpis.ebitdaVariance, -10000.00);
    assert.strictEqual(kpis.ebitdaMarginPercent, 20.87);
  });

  test('4. Debt covenant headroom calculation (Cash - Floor = $1.25M - $400k = $850k)', () => {
    const kpis = calculateBoardPackageKPIs({
      endingCashBalance: 1250000.00,
      minimumCashCovenant: 400000.00
    });

    assert.strictEqual(kpis.covenantHeadroom, 850000.00);
    assert.strictEqual(kpis.endingCashBalance - kpis.minimumCashCovenant, 850000.00);
  });

  test('5. Days Sales Outstanding (DSO) calculation (32 days) and clean claim rate (96.8%)', () => {
    const telemetry = getBoardPackageTelemetry('fac-naples-01', 'BOD_2026_M10');

    assert.strictEqual(telemetry.daysSalesOutstanding, 32);
    assert.ok(telemetry.daysSalesOutstanding <= 35, 'DSO must be within target benchmark of 35 days');
    assert.strictEqual(telemetry.cleanClaimRate, 96.80);
    assert.ok(telemetry.cleanClaimRate >= 95.0, 'Clean claim rate must meet WEDI SNIP benchmark');
  });

  test('6. OR Capacity utilization (18,240 / 40,320 = 45.24%) across 4 operating rooms', () => {
    // 21 days * 4 ORs * 480 mins/day = 40,320 available minutes
    assert.strictEqual(OR_CAPACITY_CONSTANTS.TOTAL_AVAILABLE_OR_MINUTES, 40320);

    const kpis = calculateBoardPackageKPIs({
      actualCases: 240,
      avgCaseMinutes: 76
    });

    assert.strictEqual(kpis.totalOrMinutesUsed, 18240);
    assert.strictEqual(kpis.orCapacityUtilizationPercent, 45.24);
  });

  test('7. Section retrieval returns all 5 sections in correct display order with key highlights', () => {
    const sections = getBoardPackageSections('BOD_2026_M10');

    assert.strictEqual(sections.length, 5);

    const expectedCodes = [
      SECTION_CODES.FINANCIAL,
      SECTION_CODES.CLINICAL_OPS,
      SECTION_CODES.RCM_CASH,
      SECTION_CODES.STRATEGY,
      SECTION_CODES.RISK
    ];

    sections.forEach((sec, idx) => {
      assert.strictEqual(sec.displayOrder, idx + 1);
      assert.strictEqual(sec.sectionCode, expectedCodes[idx]);
      assert.ok(Array.isArray(sec.keyHighlights) && sec.keyHighlights.length >= 3);
      assert.ok(sec.narrativeText && sec.narrativeText.length > 50);
      assert.ok(sec.cfoCommentary && sec.cfoCommentary.startsWith('CFO Note:'));
    });
  });

  test('8. Dual facade re-export parity between src/services/ and src/lib/', () => {
    assert.strictEqual(typeof libBoardReportingService.getBoardPackageTelemetry, 'function');
    assert.strictEqual(typeof libBoardReportingService.getBoardPackageSections, 'function');
    assert.strictEqual(typeof libBoardReportingService.publishAndFreezeBoardPackage, 'function');
    assert.strictEqual(typeof libBoardReportingService.calculateBoardPackageKPIs, 'function');
    assert.strictEqual(typeof libBoardReportingService.matchesFacilityId, 'function');
    assert.deepStrictEqual(libBoardReportingService.PACKAGE_STATUSES, PACKAGE_STATUSES);
    assert.deepStrictEqual(libBoardReportingService.SECTION_CODES, SECTION_CODES);
  });

  test('9. Board package publication hard-freezes version and writes SHA-256 seal', () => {
    const res = publishAndFreezeBoardPackage('BOD_2026_M10', '00000000-0000-0000-0000-000000000001');

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.packageCode, 'BOD_2026_M10');
    assert.strictEqual(res.status, PACKAGE_STATUSES.PUBLISHED_TO_BOARD);
    assert.ok(res.frozenHash, 'Frozen hash must not be empty');
    assert.strictEqual(res.frozenHash.length, 64, 'Frozen hash must be 64 characters long');

    const updated = getBoardPackageByIdOrCode('BOD_2026_M10');
    assert.strictEqual(updated.status, PACKAGE_STATUSES.PUBLISHED_TO_BOARD);
    assert.strictEqual(updated.isPublished, true);
    assert.strictEqual(updated.frozenHash, res.frozenHash);
  });

  test('10. Migration 120 UP/DOWN SQL structural integrity and RLS policy verification', () => {
    const upMigrationPath = path.resolve(__dirname, '../supabase/migrations/120_board_reporting.sql');
    const downMigrationPath = path.resolve(__dirname, '../supabase/migrations/120_board_reporting_down.sql');

    assert.ok(fs.existsSync(upMigrationPath), '120_board_reporting.sql must exist');
    assert.ok(fs.existsSync(downMigrationPath), '120_board_reporting_down.sql must exist');

    const upSql = fs.readFileSync(upMigrationPath, 'utf8');
    const downSql = fs.readFileSync(downMigrationPath, 'utf8');

    // UP Migration assertions
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.facility_board_packages'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.board_package_sections'));
    assert.ok(upSql.includes('CREATE OR REPLACE VIEW public.vw_board_package_telemetry'));
    assert.ok(upSql.includes('ALTER TABLE public.facility_board_packages ENABLE ROW LEVEL SECURITY'));
    assert.ok(upSql.includes('ALTER TABLE public.board_package_sections ENABLE ROW LEVEL SECURITY'));
    assert.ok(upSql.includes('CREATE POLICY tenant_isolation_board_packages'));
    assert.ok(upSql.includes('CREATE POLICY tenant_isolation_board_sections'));
    assert.ok(upSql.includes('BOD_2026_M10'));

    // DOWN Migration assertions
    assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_board_package_telemetry CASCADE;'));
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.board_package_sections CASCADE;'));
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.facility_board_packages CASCADE;'));
  });

  test('11. Strict Zero-Prohibited Token Compliance in BoardReportingView and services', () => {
    const filesToCheck = [
      path.resolve(__dirname, '../src/components/BoardReportingView.jsx'),
      path.resolve(__dirname, '../src/components/BoardReportingView.css'),
      path.resolve(__dirname, '../src/services/boardReportingService.js'),
      path.resolve(__dirname, '../src/lib/boardReportingService.js')
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
  });

  test('12. App Shell Integration (src/App.jsx) structure check', () => {
    const appPath = path.resolve(__dirname, '../src/App.jsx');
    assert.ok(fs.existsSync(appPath), 'src/App.jsx must exist');

    const appContent = fs.readFileSync(appPath, 'utf8');

    assert.ok(
      appContent.includes("import BoardReportingView from './components/BoardReportingView';"),
      'App.jsx must import BoardReportingView'
    );
    assert.ok(
      appContent.includes("activeTab === 'board_reporting'"),
      'App.jsx must handle board_reporting activeTab'
    );
    assert.ok(
      appContent.includes('<BoardReportingView activeFacility={activeFacility} />'),
      'App.jsx must render BoardReportingView with activeFacility prop'
    );
    assert.ok(
      appContent.includes("'board_reporting'"),
      'App.jsx exclusion array must include board_reporting'
    );
  });
});
