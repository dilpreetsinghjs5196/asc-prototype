import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  VENDOR_VALUE_GRADES,
  COMPARISON_BENCHMARKS,
  calculateUnitCostVariance,
  calculatePriceVariancePct,
  calculatePotentialSavings,
  calculateContractComplianceRate,
  calculateEffectiveNetPrice,
  classifyVendorValueGrade,
  calculateFacilityVendorKpis,
  SEED_VENDOR_COST_COMPARISONS,
  SEED_VENDOR_SKU_PRICING,
  SEED_SURGEON_VENDOR_PREFERENCES
} from '../src/services/vendorCostComparisonService.js';

import * as libWrapper from '../src/lib/vendorCostComparisonService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 1. Deterministic Calculation Unit Tests
test('calculateUnitCostVariance computes exact dollar delta against benchmark', () => {
  assert.equal(calculateUnitCostVariance(2850, 2850), 0.0);
  assert.equal(calculateUnitCostVariance(3250, 2850), 400.0);
  assert.equal(calculateUnitCostVariance(1480, 1150), 330.0);
  assert.equal(calculateUnitCostVariance(2500, 2800), -300.0);
});

test('calculatePriceVariancePct computes percentage spread with zero guard', () => {
  assert.equal(calculatePriceVariancePct(2850, 2850), 0.0);
  assert.equal(calculatePriceVariancePct(3250, 2850), 14.04);
  assert.equal(calculatePriceVariancePct(1480, 1150), 28.7);
  assert.equal(calculatePriceVariancePct(1500, 0), 0.0);
  assert.equal(calculatePriceVariancePct(0, 1000), -100.0);
});

test('calculatePotentialSavings computes annual opportunity based on volume', () => {
  assert.equal(calculatePotentialSavings(3250, 2850, 110), 44000.0);
  assert.equal(calculatePotentialSavings(1480, 1150, 110), 36300.0);
  assert.equal(calculatePotentialSavings(2850, 2850, 180), 0.0);
  assert.equal(calculatePotentialSavings(2500, 3000, 50), 0.0); // No negative savings
});

test('calculateContractComplianceRate computes audit matching percentage', () => {
  assert.equal(calculateContractComplianceRate(0, 0), 0.0);
  assert.equal(calculateContractComplianceRate(197, 200), 98.5);
  assert.equal(calculateContractComplianceRate(88, 100), 88.0);
  assert.equal(calculateContractComplianceRate(150, 100), 100.0); // Clamped
});

test('calculateEffectiveNetPrice calculates rebate-adjusted net cost', () => {
  assert.equal(calculateEffectiveNetPrice(2850, 150), 2700.0);
  assert.equal(calculateEffectiveNetPrice(3250, 80), 3170.0);
  assert.equal(calculateEffectiveNetPrice(100, 150), 0.0); // Non-negative floor
});

test('classifyVendorValueGrade correctly classifies all 4 canonical value grades', () => {
  // Off-Contract Rogue: isContracted false or variance > 25%
  assert.equal(
    classifyVendorValueGrade(26.39, 78.0, false),
    'OFF_CONTRACT_EXPENSIVE'
  );
  assert.equal(
    classifyVendorValueGrade(28.7, 88.4, true),
    'OFF_CONTRACT_EXPENSIVE' // > 25%
  );

  // Cost Disadvantage: variance > 10% or compliance < 85%
  assert.equal(
    classifyVendorValueGrade(14.04, 91.2, true),
    'COST_DISADVANTAGE'
  );

  // Tier 1 Preferred: variance <= 2% and compliance >= 95%
  assert.equal(
    classifyVendorValueGrade(0.0, 98.5, true),
    'TIER_1_PREFERRED'
  );

  // Competitive Standard: standard contracted rates
  assert.equal(
    classifyVendorValueGrade(5.5, 90.0, true),
    'COMPETITIVE_STANDARD'
  );
});

test('calculateFacilityVendorKpis aggregates facility-wide procurement metrics', () => {
  const emptyKpis = calculateFacilityVendorKpis([]);
  assert.equal(emptyKpis.totalImplantSpend, 0.0);
  assert.equal(emptyKpis.evaluatedConstructsCount, 0);

  const kpis = calculateFacilityVendorKpis(SEED_VENDOR_COST_COMPARISONS);
  assert.ok(kpis.totalImplantSpend > 1000000.0, `Expected spend > $1M, got ${kpis.totalImplantSpend}`);
  assert.ok(kpis.totalPotentialSavings > 100000.0, `Expected savings > $100k, got ${kpis.totalPotentialSavings}`);
  assert.ok(kpis.maxPriceSpreadPct >= 25.0, `Expected max spread >= 25%, got ${kpis.maxPriceSpreadPct}`);
  assert.ok(kpis.offContractSpendDollars > 0, 'Off-contract spend detected');
  assert.ok(kpis.evaluatedConstructsCount >= 6, `Expected >= 6 constructs, got ${kpis.evaluatedConstructsCount}`);
  assert.ok(kpis.evaluatedVendorsCount >= 5, `Expected >= 5 vendors, got ${kpis.evaluatedVendorsCount}`);
  assert.ok(kpis.gradeDistribution.TIER_1_PREFERRED >= 5);
});

// 2. Seed Data Structure & Integrity Tests
test('SEED_VENDOR_COST_COMPARISONS contains comprehensive procedural constructs', () => {
  assert.equal(SEED_VENDOR_COST_COMPARISONS.length, 10);

  SEED_VENDOR_COST_COMPARISONS.forEach(item => {
    assert.ok(item.constructCategory, 'constructCategory is required');
    assert.ok(item.cptCode, 'cptCode is required');
    assert.ok(item.procedureName, 'procedureName is required');
    assert.ok(item.specialty, 'specialty is required');
    assert.ok(item.vendorCode, 'vendorCode is required');
    assert.ok(item.vendorName, 'vendorName is required');
    assert.ok(item.avgConstructCost > 0, 'avgConstructCost > 0');
    assert.ok(item.facilityBenchmarkCost > 0, 'facilityBenchmarkCost > 0');
    assert.ok(VENDOR_VALUE_GRADES[item.valueGrade], `Valid grade: ${item.valueGrade}`);
    assert.ok(Array.isArray(item.competingQuotes) && item.competingQuotes.length > 0, 'competingQuotes required');
  });
});

test('SEED_VENDOR_SKU_PRICING contains itemized SKU contract price audits', () => {
  assert.ok(SEED_VENDOR_SKU_PRICING.length >= 6);

  SEED_VENDOR_SKU_PRICING.forEach(sku => {
    assert.ok(sku.skuCode, 'skuCode is required');
    assert.ok(sku.productName, 'productName is required');
    assert.ok(sku.vendorName, 'vendorName is required');
    assert.ok(sku.listPrice > 0, 'listPrice > 0');
    assert.ok(sku.contractedTierPrice > 0, 'contractedTierPrice > 0');
    assert.ok(sku.actualInvoicePrice > 0, 'actualInvoicePrice > 0');
    assert.ok(sku.annualUnitsUsed > 0, 'annualUnitsUsed > 0');
  });
});

test('SEED_SURGEON_VENDOR_PREFERENCES contains physician brand loyalty data', () => {
  assert.ok(SEED_SURGEON_VENDOR_PREFERENCES.length >= 5);

  SEED_SURGEON_VENDOR_PREFERENCES.forEach(pref => {
    assert.ok(pref.surgeonId > 0, 'surgeonId > 0');
    assert.ok(pref.surgeonName, 'surgeonName is required');
    assert.ok(pref.cptCode, 'cptCode is required');
    assert.ok(pref.primaryVendorName, 'primaryVendorName is required');
    assert.ok(pref.vendorVolumeSharePct > 0, 'vendorVolumeSharePct > 0');
    assert.ok(pref.avgSurgeonConstructCost > 0, 'avgSurgeonConstructCost > 0');
  });
});

// 3. Lib Facade Wrapper Test
test('src/lib/vendorCostComparisonService.js re-exports all constants and functions', () => {
  assert.ok(libWrapper.VENDOR_VALUE_GRADES);
  assert.ok(libWrapper.COMPARISON_BENCHMARKS);
  assert.ok(libWrapper.calculateUnitCostVariance);
  assert.ok(libWrapper.calculatePriceVariancePct);
  assert.ok(libWrapper.calculatePotentialSavings);
  assert.ok(libWrapper.calculateContractComplianceRate);
  assert.ok(libWrapper.calculateEffectiveNetPrice);
  assert.ok(libWrapper.classifyVendorValueGrade);
  assert.ok(libWrapper.calculateFacilityVendorKpis);
  assert.ok(libWrapper.SEED_VENDOR_COST_COMPARISONS);
  assert.ok(libWrapper.SEED_VENDOR_SKU_PRICING);
  assert.ok(libWrapper.SEED_SURGEON_VENDOR_PREFERENCES);
});

// 4. Migration Files Integrity Tests
test('Migration 097_vendor_cost_comparison.sql contains complete DDL', () => {
  const migPath = path.join(rootDir, 'supabase', 'migrations', '097_vendor_cost_comparison.sql');
  assert.ok(fs.existsSync(migPath), 'Migration UP file must exist');

  const sql = fs.readFileSync(migPath, 'utf8');
  assert.ok(sql.includes('vendor_cost_comparison_metrics'), 'vendor_cost_comparison_metrics table created');
  assert.ok(sql.includes('vendor_product_sku_pricing'), 'vendor_product_sku_pricing table created');
  assert.ok(sql.includes('surgeon_vendor_preferences'), 'surgeon_vendor_preferences table created');
  assert.ok(sql.includes('vw_vendor_cost_variance_summary'), 'vw_vendor_cost_variance_summary view created');
  assert.ok(sql.includes('vw_vendor_contract_compliance_radar'), 'vw_vendor_contract_compliance_radar view created');
  assert.ok(sql.includes('ROW LEVEL SECURITY'), 'RLS enabled');
  assert.ok(sql.includes('app.current_facility_id'), 'Tenant filter by facility_id present');
});

test('Migration 097_vendor_cost_comparison_down.sql contains clean rollback', () => {
  const downPath = path.join(rootDir, 'supabase', 'migrations', '097_vendor_cost_comparison_down.sql');
  assert.ok(fs.existsSync(downPath), 'Migration DOWN file must exist');

  const sql = fs.readFileSync(downPath, 'utf8');
  assert.ok(sql.includes('DROP TABLE IF EXISTS public.surgeon_vendor_preferences'), 'Drops surgeon preferences table');
  assert.ok(sql.includes('DROP TABLE IF EXISTS public.vendor_product_sku_pricing'), 'Drops SKU pricing table');
  assert.ok(sql.includes('DROP TABLE IF EXISTS public.vendor_cost_comparison_metrics'), 'Drops metrics table');
  assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_vendor_cost_variance_summary'), 'Drops summary view');
});

// 5. Zero-Purple Design System Compliance
test('Phase B8 UI component and CSS are strictly Zero-Purple compliant', () => {
  const jsxPath = path.join(rootDir, 'src', 'components', 'VendorCostComparisonView.jsx');
  const cssPath = path.join(rootDir, 'src', 'components', 'VendorCostComparisonView.css');

  assert.ok(fs.existsSync(jsxPath), 'JSX component must exist');
  assert.ok(fs.existsSync(cssPath), 'CSS file must exist');

  const jsxContent = fs.readFileSync(jsxPath, 'utf8').toLowerCase();
  const cssContent = fs.readFileSync(cssPath, 'utf8').toLowerCase();

  const prohibitedTokens = ['purple', 'violet', 'fuchsia', 'magenta', '#9333ea', '#8a2be2', '#7c3aed', '#6366f1'];

  prohibitedTokens.forEach(token => {
    assert.ok(!jsxContent.includes(token), `JSX contains prohibited token: ${token}`);
    assert.ok(!cssContent.includes(token), `CSS contains prohibited token: ${token}`);
  });
});

// 6. App.jsx Integration Verification
test('App.jsx correctly imports and registers VendorCostComparisonView', () => {
  const appPath = path.join(rootDir, 'src', 'App.jsx');
  const appContent = fs.readFileSync(appPath, 'utf8');

  assert.ok(appContent.includes("import VendorCostComparisonView from './components/VendorCostComparisonView'"), 'App imports VendorCostComparisonView');
  assert.ok(appContent.includes("activeTab === 'vendor_cost_comparison'"), 'App routes vendor_cost_comparison');
  assert.ok(appContent.includes('Vendor Cost Comparison'), 'Sidebar item labeled correctly');
  assert.ok(appContent.includes('<VendorCostComparisonView />'), 'Component mounted in main tab body');
});
