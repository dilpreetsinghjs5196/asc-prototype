/**
 * ==============================================================================
 * Phase E1 Test Suite: Budget vs. Actual & Variance Reporting Engine
 * Module 14: CFO Dashboard & Financial Accounting
 * Tests: Annual budget modeling, 3-way variance decomposition (volume, rate, mix),
 *        flexible budgeting, favorable/unfavorable polarity, severity thresholds,
 *        cryptographic freeze seals, Migration 115 SQL integrity, zero-purple CSS,
 *        and App.jsx shell integration.
 * ==============================================================================
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BUDGET_STATUSES,
  ACCOUNT_CATEGORIES,
  SEVERITY_TIERS,
  MATERIALITY_CONFIG,
  calculateDollarVariance,
  isVarianceFavorable,
  calculatePercentVariance,
  classifySeverity,
  calculateFlexibleBudget,
  calculateVolumeRateMixDecomposition,
  computeBudgetProvenanceHash,
  matchesFacilityId,
  resetLiveBudgetState,
  getFacilityBudgets,
  getBudgetByIdOrCode,
  getBudgetVarianceLineItems,
  getBvaExecutiveTelemetry,
  approveAndFreezeBudget,
  saveVarianceExplanation,
  isExpenseOrCostCategory,
  INITIAL_FACILITY_BUDGETS,
  INITIAL_BVA_LINE_ITEMS
} from '../src/services/budgetVarianceService.js';

import * as libBudgetVarianceService from '../src/lib/budgetVarianceService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase E1: Budget vs. Actual & Variance Reporting Engine', () => {

  beforeEach(() => {
    resetLiveBudgetState();
  });

  test('1. Telemetry & Summary Aggregation returns accurate variance totals for October 2026', () => {
    const telemetry = getBvaExecutiveTelemetry('fac-naples-01', '2026-M10');

    assert.ok(telemetry, 'Telemetry must not be null');
    assert.strictEqual(telemetry.periodCode, '2026-M10', 'Must load October 2026 period');
    assert.strictEqual(telemetry.budgetCode, 'FY2026_ORIGINAL');
    assert.strictEqual(telemetry.budgetStatus, BUDGET_STATUSES.APPROVED_ACTIVE);
    assert.strictEqual(telemetry.isApproved, true);

    // NPR: Actual $1,150,000, Budget $1,180,000, Variance -$30,000 (-2.54%)
    assert.strictEqual(telemetry.npr.actual, 1150000.00);
    assert.strictEqual(telemetry.npr.budget, 1180000.00);
    assert.strictEqual(telemetry.npr.variance, -30000.00);
    assert.strictEqual(telemetry.npr.percentVariance, -2.54);
    assert.strictEqual(telemetry.npr.isFavorable, false);

    // EBITDA: Actual $310,000, Budget $320,000, Variance -$10,000 (-3.13%)
    assert.strictEqual(telemetry.ebitda.actual, 310000.00);
    assert.strictEqual(telemetry.ebitda.budget, 320000.00);
    assert.strictEqual(telemetry.ebitda.variance, -10000.00);
    assert.strictEqual(telemetry.ebitda.percentVariance, -3.13);
    assert.strictEqual(telemetry.ebitda.isFavorable, false);

    // Case Volume: Actual 240, Budget 250, Variance -10 (-4.0%)
    assert.strictEqual(telemetry.volume.actual, 240);
    assert.strictEqual(telemetry.volume.budget, 250);
    assert.strictEqual(telemetry.volume.variance, -10);
    assert.strictEqual(telemetry.volume.percentVariance, -4.0);

    // Direct clinical costs total: $345k + $145k + $110k = $600k vs budget $610k (favorable savings)
    assert.strictEqual(telemetry.directCosts.actual, 600000.00);
    assert.strictEqual(telemetry.directCosts.budget, 610000.00);
    assert.strictEqual(telemetry.directCosts.variance, -10000.00);
    assert.strictEqual(telemetry.directCosts.isFavorable, true);

    // Counts
    assert.ok(telemetry.counts.total > 0, 'Must have line items');
    assert.ok(telemetry.counts.favorable >= 0);
    assert.ok(telemetry.counts.unfavorable >= 0);
  });

  test('2. Facility UUID alias resolution matches Naples Surgery Center correctly', () => {
    const naplesUuid = '00000000-0000-0000-0000-000000000002';
    const naplesSlug = 'fac-naples-01';

    assert.ok(matchesFacilityId(naplesSlug, naplesUuid));
    assert.ok(matchesFacilityId(naplesUuid, naplesSlug));
    assert.ok(matchesFacilityId(naplesSlug, 'ALL'));

    const budgetsByUuid = getFacilityBudgets(naplesUuid);
    assert.strictEqual(budgetsByUuid.length, 2, 'Must retrieve 2 budgets via UUID alias');

    const telemetryByUuid = getBvaExecutiveTelemetry(naplesUuid, '2026-M10');
    assert.strictEqual(telemetryByUuid.npr.actual, 1150000.00, 'NPR actual must match across alias');
  });

  test('3. Dollar variance and favorable/unfavorable polarity logic', () => {
    // Revenue line: Actual > Budget is favorable
    assert.strictEqual(isVarianceFavorable(120000, 100000, ACCOUNT_CATEGORIES.NET_REVENUE), true);
    assert.strictEqual(isVarianceFavorable(90000, 100000, ACCOUNT_CATEGORIES.NET_REVENUE), false);

    // Margin line: Actual >= Budget is favorable
    assert.strictEqual(isVarianceFavorable(310000, 320000, ACCOUNT_CATEGORIES.MARGIN), false);
    assert.strictEqual(isVarianceFavorable(330000, 320000, ACCOUNT_CATEGORIES.MARGIN), true);

    // Expense / Cost line: Actual <= Budget is favorable (savings)
    assert.strictEqual(isVarianceFavorable(345000, 350000, ACCOUNT_CATEGORIES.DIRECT_COST), true);
    assert.strictEqual(isVarianceFavorable(360000, 350000, ACCOUNT_CATEGORIES.DIRECT_COST), false);

    // Volume line: Actual >= Budget is favorable
    assert.strictEqual(isVarianceFavorable(240, 250, ACCOUNT_CATEGORIES.VOLUME), false);
    assert.strictEqual(isVarianceFavorable(260, 250, ACCOUNT_CATEGORIES.VOLUME), true);

    // Dollar variance math
    assert.strictEqual(calculateDollarVariance(1150000, 1180000), -30000.00);
    assert.strictEqual(calculateDollarVariance(600000, 610000), -10000.00);
  });

  test('4. Percentage variance calculation handles edge cases safely', () => {
    // Normal cases
    assert.strictEqual(calculatePercentVariance(105, 100), 5.0);
    assert.strictEqual(calculatePercentVariance(95, 100), -5.0);

    // Zero budget, zero actual -> 0%
    assert.strictEqual(calculatePercentVariance(0, 0), 0.0);

    // Zero budget, positive actual -> 100%
    assert.strictEqual(calculatePercentVariance(5000, 0), 100.0);

    // Negative budget handling
    assert.strictEqual(calculatePercentVariance(-90, -100), 10.0);
  });

  test('5. 3-Way Variance Decomposition equation balances (Volume + Rate + Mix = Total)', () => {
    const decomp = calculateVolumeRateMixDecomposition({
      actualAmount: 1150000.00,
      budgetAmount: 1180000.00,
      actualVolume: 240,
      budgetVolume: 250,
      actualUnitRate: 4791.67,
      budgetUnitRate: 4720.00,
      category: ACCOUNT_CATEGORIES.NET_REVENUE
    });

    assert.strictEqual(decomp.totalDollarVariance, -30000.00);
    
    // Sum of components must match total within floating point rounding
    const sum = Number((decomp.volumeImpact + decomp.rateImpact + decomp.mixImpact).toFixed(2));
    assert.strictEqual(sum, -30000.00, 'Volume + Rate + Mix must exactly equal total variance');
  });

  test('6. Flexible budget computation scales unit benchmark rates with actual volume', () => {
    const actualVolume = 240;
    const budgetUnitRate = 4720.00;
    const flexBudget = calculateFlexibleBudget(actualVolume, budgetUnitRate);

    // 240 * $4,720 = $1,132,800
    assert.strictEqual(flexBudget, 1132800.00);
  });

  test('7. Materiality and severity threshold classification', () => {
    // <= 3% is NORMAL
    assert.strictEqual(classifySeverity(2.5, 5000), SEVERITY_TIERS.NORMAL);
    assert.strictEqual(classifySeverity(-1.8, -3000), SEVERITY_TIERS.NORMAL);

    // > 3% and <= 10% is ATTENTION
    assert.strictEqual(classifySeverity(4.5, 8000), SEVERITY_TIERS.ATTENTION);
    assert.strictEqual(classifySeverity(-8.0, -12000), SEVERITY_TIERS.ATTENTION);

    // > 10% or >= $25,000 is CRITICAL
    assert.strictEqual(classifySeverity(12.5, 5000), SEVERITY_TIERS.CRITICAL);
    assert.strictEqual(classifySeverity(-15.0, -9000), SEVERITY_TIERS.CRITICAL);
    assert.strictEqual(classifySeverity(2.0, 30000), SEVERITY_TIERS.CRITICAL, 'Dollar magnitude threshold triggered');
  });

  test('8. Dual facade re-export parity between lib and services', () => {
    assert.strictEqual(typeof libBudgetVarianceService.getFacilityBudgets, 'function');
    assert.strictEqual(typeof libBudgetVarianceService.getBvaExecutiveTelemetry, 'function');
    assert.strictEqual(typeof libBudgetVarianceService.calculateVolumeRateMixDecomposition, 'function');
    assert.strictEqual(libBudgetVarianceService.BUDGET_STATUSES.APPROVED_ACTIVE, 'APPROVED_ACTIVE');
  });

  test('9. Budget approval hard-freezes version and writes SHA-256 seal', () => {
    const unapprovedBudget = getBudgetByIdOrCode('FY2026_Q4_REFORECAST', 'fac-naples-01');
    assert.strictEqual(unapprovedBudget.isApproved, false);
    assert.strictEqual(unapprovedBudget.status, BUDGET_STATUSES.UNDER_REVIEW);

    const approved = approveAndFreezeBudget(unapprovedBudget.id, 'usr-cfo-001');
    assert.strictEqual(approved.isApproved, true);
    assert.strictEqual(approved.status, BUDGET_STATUSES.APPROVED_ACTIVE);
    assert.ok(approved.frozenHash.length >= 32, 'Must generate cryptographic hash');

    // The original budget should now be SUPERSEDED
    const original = getBudgetByIdOrCode('FY2026_ORIGINAL', 'fac-naples-01');
    assert.strictEqual(original.status, BUDGET_STATUSES.SUPERSEDED);
  });

  test('10. Migration 115 UP/DOWN SQL structural integrity and RLS policy verification', () => {
    const upSqlPath = path.join(__dirname, '../supabase/migrations/115_budget_vs_actual.sql');
    const downSqlPath = path.join(__dirname, '../supabase/migrations/115_budget_vs_actual_down.sql');

    assert.ok(fs.existsSync(upSqlPath), 'Migration 115 UP script must exist');
    assert.ok(fs.existsSync(downSqlPath), 'Migration 115 DOWN script must exist');

    const upSql = fs.readFileSync(upSqlPath, 'utf8');
    const downSql = fs.readFileSync(downSqlPath, 'utf8');

    // Verify UP SQL tables and RLS
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.facility_budgets'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.budget_line_items'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.budget_variance_analyses'));
    assert.ok(upSql.includes('ENABLE ROW LEVEL SECURITY'));
    assert.ok(upSql.includes('current_setting(\'app.current_facility_id\', true)'));
    assert.ok(!upSql.includes('public.user_facility_access'), 'Must NOT reference non-existent table');

    // Verify DOWN SQL drops
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.budget_variance_analyses CASCADE'));
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.facility_budgets CASCADE'));
  });

  test('11. Strict Zero-Purple CSS Compliance in BudgetVarianceView', () => {
    const cssPath = path.join(__dirname, '../src/components/BudgetVarianceView.css');
    const jsxPath = path.join(__dirname, '../src/components/BudgetVarianceView.jsx');

    assert.ok(fs.existsSync(cssPath), 'CSS file must exist');
    assert.ok(fs.existsSync(jsxPath), 'JSX file must exist');

    const cssContent = fs.readFileSync(cssPath, 'utf8');
    const jsxContent = fs.readFileSync(jsxPath, 'utf8');

    const prohibitedPattern = /purple|violet|indigo|magenta|fuchsia/i;
    assert.strictEqual(prohibitedPattern.test(cssContent), false, 'CSS must strictly avoid prohibited purple tokens');
    assert.strictEqual(prohibitedPattern.test(jsxContent), false, 'JSX must strictly avoid prohibited purple tokens');

    // Verify dark mode presence
    assert.ok(cssContent.includes('[data-theme="dark"]'), 'Must support data-theme="dark"');
    assert.ok(cssContent.includes('.dark'), 'Must support .dark');
  });

  test('12. App Shell Integration (src/App.jsx)', () => {
    const appJsxPath = path.join(__dirname, '../src/App.jsx');
    const appContent = fs.readFileSync(appJsxPath, 'utf8');

    assert.ok(appContent.includes("import BudgetVarianceView from './components/BudgetVarianceView'"), 'Must import BudgetVarianceView');
    assert.ok(appContent.includes("activeTab === 'budget_variance'"), 'Must have activeTab check');
    assert.ok(appContent.includes('<BudgetVarianceView activeFacility={activeFacility} />'), 'Must render BudgetVarianceView');
    assert.ok(appContent.includes('Budget vs. Actual (BvA)'), 'Must have sidebar label');
  });

});
