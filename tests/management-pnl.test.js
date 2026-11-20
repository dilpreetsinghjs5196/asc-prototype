/**
 * ==============================================================================
 * Phase E0 Test Suite: Management P&L & Reconciliation Boundaries Engine
 * Module 14: CFO Dashboard & Financial Accounting
 * Tests: Chart of accounts hierarchy, Gross-to-Net revenue deductions,
 *        Clinical contribution margin, EBITDA, Net Operating Income (EBIT),
 *        Multi-boundary reconciliations, period freeze governance,
 *        cryptographic provenance seals, Migration 114 SQL, zero-purple CSS,
 *        and App.jsx shell integration.
 * ==============================================================================
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PNL_SECTIONS,
  RECONCILIATION_BOUNDARIES,
  PERIOD_STATUSES,
  calculateNpr,
  calculateDirectClinicalMargin,
  calculateGrossOperatingProfit,
  calculateEbitda,
  calculateNetOperatingIncome,
  calculateMarginPercentage,
  validateReconciliation,
  computePnlProvenanceHash,
  matchesFacilityId,
  resetManagementPnlStore,
  getManagementPnlPeriods,
  getPeriodByIdOrCode,
  getPnlStatementLines,
  getPeriodReconciliations,
  calculatePnlSummary,
  freezeAccountingPeriod,
  getManagementPnlTelemetry,
  SEED_MANAGEMENT_PNL_PERIODS,
  SEED_MANAGEMENT_PNL_STATEMENT_LINES,
  SEED_MANAGEMENT_PNL_RECONCILIATIONS
} from '../src/services/managementPnlService.js';

import * as libManagementPnlService from '../src/lib/managementPnlService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase E0: Management P&L & Reconciliation Boundaries Engine', () => {

  beforeEach(() => {
    resetManagementPnlStore();
  });

  test('1. Telemetry & Summary Aggregation returns accurate facility P&L totals for October 2026', () => {
    const telemetry = getManagementPnlTelemetry('fac-naples-01', '2026-M10');

    assert.strictEqual(telemetry.periodCode, '2026-M10', 'Must load October 2026');
    assert.strictEqual(telemetry.grossPatientRevenue, 2880000.00, 'Gross revenue must equal $2,880,000.00');
    assert.strictEqual(telemetry.totalDeductions, -1730000.00, 'Total deductions must equal -$1,730,000.00');
    assert.strictEqual(telemetry.netPatientRevenue, 1150000.00, 'NPR must equal $1,150,000.00');
    assert.strictEqual(telemetry.directClinicalMargin, 550000.00, 'Clinical margin must equal $550,000.00');
    assert.strictEqual(telemetry.clinicalMarginPct, 47.8, 'Clinical margin must equal 47.8%');
    assert.strictEqual(telemetry.grossOperatingProfit, 495000.00, 'GOP must equal $495,000.00');
    assert.strictEqual(telemetry.ebitda, 310000.00, 'EBITDA must equal $310,000.00');
    assert.strictEqual(telemetry.ebitdaMarginPct, 27.0, 'EBITDA margin must equal 27.0%');
    assert.strictEqual(telemetry.netOperatingIncome, 270000.00, 'NOI must equal $270,000.00');
    assert.strictEqual(telemetry.operatingMarginPct, 23.5, 'Operating margin must equal 23.5%');
    assert.strictEqual(telemetry.reconciliationsCount, 5, 'Must have 5 reconciliation boundaries');
    assert.strictEqual(telemetry.balancedCount, 5, 'All 5 reconciliations must be balanced');
    assert.strictEqual(telemetry.flaggedCount, 0, 'Zero flagged variances');
  });

  test('2. Facility UUID alias resolution matches Naples Surgery Center correctly', () => {
    const naplesUuid = '00000000-0000-0000-0000-000000000002';
    const naplesSlug = 'fac-naples-01';

    assert.ok(matchesFacilityId(naplesSlug, naplesUuid), 'Slug must match UUID alias');
    assert.ok(matchesFacilityId(naplesUuid, naplesSlug), 'UUID alias must match slug');
    assert.ok(matchesFacilityId(naplesSlug, 'ALL'), 'ALL matches any facility');

    const periodsByUuid = getManagementPnlPeriods(naplesUuid);
    assert.strictEqual(periodsByUuid.length, 3, 'Must retrieve 3 accounting periods via UUID alias');

    const telemetryByUuid = getManagementPnlTelemetry(naplesUuid, '2026-M10');
    assert.strictEqual(telemetryByUuid.netPatientRevenue, 1150000.00, 'NPR must match across alias');
  });

  test('3. Deterministic Gross-to-Net math invariants (NPR = Gross - Allowances - Writeoffs - BadDebt)', () => {
    // Gross: $2,880,000; Allowances: $1,660,000; Writeoffs: $45,000; BadDebt: $25,000 -> NPR = $1,150,000
    const npr1 = calculateNpr(2880000.00, 1660000.00, 45000.00, 25000.00);
    assert.strictEqual(npr1, 1150000.00, 'NPR must equal Gross minus Deductions');

    // Negative allowance inputs should be handled safely as absolute deductions
    const npr2 = calculateNpr(1000000.00, -600000.00, -20000.00, -10000.00);
    assert.strictEqual(npr2, 370000.00, 'Negative allowances must be deducted properly');

    // Zero gross case
    assert.strictEqual(calculateNpr(0, 50000), 0.00);
  });

  test('4. Direct Clinical Contribution Margin math (DCM = NPR - Direct Costs)', () => {
    // NPR: $1,150,000; Direct Costs: $600,000 ($285K implants, $115K supplies, $48K pharma, $152K labor)
    const dcm = calculateDirectClinicalMargin(1150000.00, 600000.00);
    assert.strictEqual(dcm, 550000.00, 'DCM must equal $550,000.00');

    const pct = calculateMarginPercentage(dcm, 1150000.00);
    assert.strictEqual(pct, 47.8, 'Clinical Margin % must be 47.8%');
  });

  test('5. EBITDA & NOI Math Invariants (EBITDA = GOP - OPEX; NOI = EBITDA - DepAmort)', () => {
    // CM: $550,000; Variable Facility Costs: $55,000 -> GOP = $495,000
    const gop = calculateGrossOperatingProfit(550000.00, 550000.00 - 495000.00);
    assert.strictEqual(gop, 495000.00, 'GOP must equal $495,000.00');

    // GOP: $495,000; Fixed Overhead OPEX: $185,000 -> EBITDA = $310,000
    const ebitda = calculateEbitda(gop, 185000.00);
    assert.strictEqual(ebitda, 310000.00, 'EBITDA must equal $310,000.00');

    // EBITDA: $310,000; Dep & Amort: $40,000 -> NOI = $270,000
    const noi = calculateNetOperatingIncome(ebitda, 40000.00);
    assert.strictEqual(noi, 270000.00, 'NOI must equal $270,000.00');
  });

  test('6. Margin Percentages normalized against NPR', () => {
    const npr = 1150000.00;
    assert.strictEqual(calculateMarginPercentage(550000.00, npr), 47.8, 'DCM % must be 47.8%');
    assert.strictEqual(calculateMarginPercentage(310000.00, npr), 27.0, 'EBITDA % must be 27.0%');
    assert.strictEqual(calculateMarginPercentage(270000.00, npr), 23.5, 'NOI % must be 23.5%');

    // Edge case: zero or negative NPR
    assert.strictEqual(calculateMarginPercentage(50000.00, 0), 0.0);
  });

  test('7. Reconciliation Boundary Validator checks tolerances accurately', () => {
    // Exact match: 0 variance
    const res1 = validateReconciliation(2880000.00, 2880000.00, 0.00);
    assert.strictEqual(res1.isBalanced, true);
    assert.strictEqual(res1.variance, 0.00);
    assert.strictEqual(res1.status, 'RECONCILED_BALANCED');

    // Within $50 tolerance: $15 variance
    const res2 = validateReconciliation(1149985.00, 1150000.00, 50.00);
    assert.strictEqual(res2.isBalanced, true);
    assert.strictEqual(res2.variance, 15.00);
    assert.strictEqual(res2.status, 'RECONCILED_BALANCED');

    // Exceeding tolerance: $250 variance with $50 tolerance
    const res3 = validateReconciliation(100000.00, 100250.00, 50.00);
    assert.strictEqual(res3.isBalanced, false);
    assert.strictEqual(res3.variance, 250.00);
    assert.strictEqual(res3.status, 'VARIANCE_FLAGGED');
  });

  test('8. Period Retrieval and Statement Line Chart of Accounts Hierarchy', () => {
    const lines = getPnlStatementLines('pnl-per-2026-10');
    assert.ok(lines.length >= 20, 'Must have at least 20 detailed statement lines');

    // Verify ordering by lineNumber
    for (let i = 0; i < lines.length - 1; i++) {
      assert.ok(lines[i].lineNumber <= lines[i + 1].lineNumber, 'Lines must be sorted by line_number');
    }

    // Verify section filtering
    const revLines = getPnlStatementLines('pnl-per-2026-10', { section: PNL_SECTIONS.GROSS_REVENUE });
    assert.ok(revLines.length > 0);
    revLines.forEach(l => assert.strictEqual(l.section, PNL_SECTIONS.GROSS_REVENUE));
  });

  test('9. Period Freeze Governance hard-freezes provisional period and seals with SHA-256', () => {
    const period = getPeriodByIdOrCode('2026-M10', 'fac-naples-01');
    assert.strictEqual(period.status, PERIOD_STATUSES.PROVISIONAL_CLOSE);
    assert.strictEqual(period.isClosed, false);

    const result = freezeAccountingPeriod(period.id, { userId: 'usr_cfo_marcus' });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.period.status, PERIOD_STATUSES.HARD_CLOSE_FROZEN);
    assert.strictEqual(result.period.isClosed, true);
    assert.ok(result.frozenHash && result.frozenHash.length >= 32, 'Must generate cryptographic frozen hash');

    // Attempting to freeze again must throw error
    assert.throws(() => {
      freezeAccountingPeriod(period.id, { userId: 'usr_cfo_marcus' });
    }, /already frozen/);
  });

  test('10. Migration 114 UP/DOWN SQL structural integrity', () => {
    const upPath = path.join(__dirname, '..', 'supabase', 'migrations', '114_management_pnl.sql');
    const downPath = path.join(__dirname, '..', 'supabase', 'migrations', '114_management_pnl_down.sql');

    assert.ok(fs.existsSync(upPath), 'Migration 114 UP must exist');
    assert.ok(fs.existsSync(downPath), 'Migration 114 DOWN must exist');

    const upSql = fs.readFileSync(upPath, 'utf8');
    const downSql = fs.readFileSync(downPath, 'utf8');

    // Schema verification
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.management_pnl_periods'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.management_pnl_statement_lines'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.management_pnl_reconciliations'));
    assert.ok(upSql.includes('CREATE OR REPLACE VIEW public.vw_management_pnl_telemetry'));

    // Check constraints and RLS
    assert.ok(upSql.includes("status IN ('OPEN', 'PROVISIONAL_CLOSE', 'HARD_CLOSE_FROZEN')"));
    assert.ok(upSql.includes('DROP POLICY IF EXISTS tenant_isolation_pnl_periods'));
    assert.ok(upSql.includes('DROP POLICY IF EXISTS tenant_isolation_pnl_lines'));
    assert.ok(upSql.includes('DROP POLICY IF EXISTS tenant_isolation_pnl_recon'));

    // Rollback verification
    assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_management_pnl_telemetry'));
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.management_pnl_reconciliations'));
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.management_pnl_statement_lines'));
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.management_pnl_periods'));
  });

  test('11. Strict Zero-Purple CSS Compliance in ManagementPnlView', () => {
    const cssPath = path.join(__dirname, '..', 'src', 'components', 'ManagementPnlView.css');
    const jsxPath = path.join(__dirname, '..', 'src', 'components', 'ManagementPnlView.jsx');

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

  test('12. App Shell Integration (src/App.jsx)', () => {
    const appJsxPath = path.join(__dirname, '..', 'src', 'App.jsx');
    const appJsx = fs.readFileSync(appJsxPath, 'utf8');

    assert.ok(
      appJsx.includes("import ManagementPnlView from './components/ManagementPnlView'"),
      'App.jsx must import ManagementPnlView'
    );
    assert.ok(
      appJsx.includes("activeTab === 'management_pnl'"),
      'App.jsx must register management_pnl active tab'
    );
    assert.ok(
      appJsx.includes('Management P&L (CFO)'),
      'App.jsx must contain sidebar menu label "Management P&L (CFO)"'
    );
    assert.ok(
      appJsx.includes('Management P&L & Reconciliation Boundaries'),
      'App.jsx must set header title for management_pnl'
    );
    assert.ok(
      appJsx.includes('<ManagementPnlView activeFacility={activeFacility} />'),
      'App.jsx must render ManagementPnlView'
    );
  });

});
