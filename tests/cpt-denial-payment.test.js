import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PAYMENT_PERFORMANCE_TIERS,
  DENIAL_BENCHMARKS,
  COMMON_CARC_CODES,
  calculateDenialRate,
  calculateCleanClaimRate,
  calculateDaysToPay,
  calculateOverturnRate,
  calculateUnderpaymentRate,
  calculateUnderpaymentVariance,
  calculatePaymentVelocityIndex,
  classifyPaymentPerformanceTier,
  calculateFacilityDenialPaymentKpis,
  SEED_CPT_DENIAL_PAYMENT
} from '../src/services/cptDenialPaymentService.js';

import * as libWrapper from '../src/lib/cptDenialPaymentService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 1. Deterministic Calculation Unit Tests
test('calculateDenialRate computes accurate percentage and clamps boundaries', () => {
  assert.equal(calculateDenialRate(0, 100), 0.0);
  assert.equal(calculateDenialRate(12, 100), 12.0);
  assert.equal(calculateDenialRate(36, 320), 11.25);
  assert.equal(calculateDenialRate(50, 0), 0.0);
  assert.equal(calculateDenialRate(150, 100), 100.0);
});

test('calculateCleanClaimRate handles zero claims and high accuracy', () => {
  assert.equal(calculateCleanClaimRate(0, 0), 0.0);
  assert.equal(calculateCleanClaimRate(284, 320), 88.75);
  assert.equal(calculateCleanClaimRate(462, 480), 96.25);
  assert.equal(calculateCleanClaimRate(650, 650), 100.0);
});

test('calculateDaysToPay computes average days with zero guard', () => {
  assert.equal(calculateDaysToPay(0, 0), 0.0);
  assert.equal(calculateDaysToPay(11648, 320), 36.4);
  assert.equal(calculateDaysToPay(9504, 480), 19.8);
});

test('calculateOverturnRate computes appeal success percentage', () => {
  assert.equal(calculateOverturnRate(0, 0), 0.0);
  assert.equal(calculateOverturnRate(25, 32), 78.13);
  assert.equal(calculateOverturnRate(10, 10), 100.0);
  assert.equal(calculateOverturnRate(18, 30), 60.0);
});

test('calculateUnderpaymentRate computes underpaid ratio', () => {
  assert.equal(calculateUnderpaymentRate(0, 0), 0.0);
  assert.equal(calculateUnderpaymentRate(42, 320), 13.13);
  assert.equal(calculateUnderpaymentRate(14, 480), 2.92);
});

test('calculateUnderpaymentVariance computes contract fee leakage non-negatively', () => {
  assert.equal(calculateUnderpaymentVariance(150000, 105400), 44600.0);
  assert.equal(calculateUnderpaymentVariance(50000, 60000), 0.0);
});

test('calculatePaymentVelocityIndex returns 0-100 normalized score', () => {
  // Excellent claim flow
  const excellentScore = calculatePaymentVelocityIndex(1.85, 16.5, 1.85, 100.0);
  assert.ok(excellentScore >= 90.0, `Expected score >= 90, got ${excellentScore}`);

  // High-friction sink
  const sinkScore = calculatePaymentVelocityIndex(16.41, 46.2, 13.33, 60.0);
  assert.ok(sinkScore <= 55.0, `Expected score <= 55, got ${sinkScore}`);
});

test('classifyPaymentPerformanceTier correctly classifies all 4 tiers', () => {
  // Chronic Denial Sink: high denial > 14% or days > 45d or underpayment > 12%
  assert.equal(
    classifyPaymentPerformanceTier(16.41, 46.2, 83.59, 60.0, 13.33),
    'CHRONIC_DENIAL_SINK'
  );

  // Friction At-Risk: denial > 8% or days > 30d
  assert.equal(
    classifyPaymentPerformanceTier(11.25, 36.4, 88.75, 78.13, 8.5),
    'FRICTION_AT_RISK'
  );

  // Excellent Flow: denial <= 4% and days <= 21d and clean >= 95%
  assert.equal(
    classifyPaymentPerformanceTier(3.75, 19.8, 96.25, 93.75, 2.92),
    'EXCELLENT_FLOW'
  );

  // Acceptable Flow: moderate metrics
  assert.equal(
    classifyPaymentPerformanceTier(5.0, 21.2, 95.0, 86.36, 5.38),
    'ACCEPTABLE_FLOW'
  );
});

test('calculateFacilityDenialPaymentKpis computes facility portfolio aggregations', () => {
  const emptyResult = calculateFacilityDenialPaymentKpis([]);
  assert.equal(emptyResult.totalBilledClaims, 0);
  assert.equal(emptyResult.firstPassDenialRate, 0.0);

  const kpis = calculateFacilityDenialPaymentKpis(SEED_CPT_DENIAL_PAYMENT);
  assert.ok(kpis.totalBilledClaims > 3000, `Expected > 3000 claims, got ${kpis.totalBilledClaims}`);
  assert.ok(kpis.cleanClaimRate >= 90.0, `Expected clean claim rate >= 90%, got ${kpis.cleanClaimRate}`);
  assert.ok(kpis.firstPassDenialRate > 0 && kpis.firstPassDenialRate < 10.0);
  assert.ok(kpis.totalUnderpaymentVariance > 100000.0);
  assert.ok(kpis.chronicSinkCount >= 2, `Expected at least 2 sink codes, got ${kpis.chronicSinkCount}`);
});

// 2. Seed Data Structure & Integrity Tests
test('SEED_CPT_DENIAL_PAYMENT contains 10 comprehensive clinical procedures', () => {
  assert.equal(SEED_CPT_DENIAL_PAYMENT.length, 10);

  SEED_CPT_DENIAL_PAYMENT.forEach(cpt => {
    assert.ok(cpt.cptCode, 'cptCode is required');
    assert.ok(cpt.procedureName, 'procedureName is required');
    assert.ok(cpt.specialty, 'specialty is required');
    assert.ok(cpt.totalBilledClaims > 0, 'totalBilledClaims > 0');
    assert.ok(cpt.cleanClaimRate >= 0 && cpt.cleanClaimRate <= 100);
    assert.ok(cpt.firstPassDenialRate >= 0 && cpt.firstPassDenialRate <= 100);
    assert.ok(cpt.avgDaysToPay > 0, 'avgDaysToPay > 0');
    assert.ok(PAYMENT_PERFORMANCE_TIERS[cpt.performanceTier], `Valid tier: ${cpt.performanceTier}`);
    assert.ok(Array.isArray(cpt.carcBreakdown) && cpt.carcBreakdown.length > 0, 'CARC breakdown required');
    assert.ok(Array.isArray(cpt.payerVariation) && cpt.payerVariation.length > 0, 'Payer variation required');
  });
});

test('COMMON_CARC_CODES contains key standard billing adjustment codes', () => {
  assert.ok(COMMON_CARC_CODES['CO-50'], 'CO-50 Medical Necessity exists');
  assert.ok(COMMON_CARC_CODES['CO-197'], 'CO-197 Prior Auth exists');
  assert.ok(COMMON_CARC_CODES['CO-97'], 'CO-97 Bundling exists');
  assert.ok(COMMON_CARC_CODES['CO-16'], 'CO-16 Missing documentation exists');
  assert.ok(COMMON_CARC_CODES['CO-45'], 'CO-45 Fee schedule underpayment exists');
});

// 3. Lib Facade Wrapper Test
test('src/lib/cptDenialPaymentService.js re-exports all constants and functions', () => {
  assert.ok(libWrapper.PAYMENT_PERFORMANCE_TIERS);
  assert.ok(libWrapper.DENIAL_BENCHMARKS);
  assert.ok(libWrapper.calculateDenialRate);
  assert.ok(libWrapper.calculateCleanClaimRate);
  assert.ok(libWrapper.calculateDaysToPay);
  assert.ok(libWrapper.calculateOverturnRate);
  assert.ok(libWrapper.calculateUnderpaymentRate);
  assert.ok(libWrapper.calculateUnderpaymentVariance);
  assert.ok(libWrapper.calculatePaymentVelocityIndex);
  assert.ok(libWrapper.classifyPaymentPerformanceTier);
  assert.ok(libWrapper.calculateFacilityDenialPaymentKpis);
  assert.ok(libWrapper.SEED_CPT_DENIAL_PAYMENT);
});

// 4. Migration Files Integrity Tests
test('Migration 096_cpt_denial_and_payment_performance.sql contains complete DDL', () => {
  const migPath = path.join(rootDir, 'supabase', 'migrations', '096_cpt_denial_and_payment_performance.sql');
  assert.ok(fs.existsSync(migPath), 'Migration UP file must exist');

  const sql = fs.readFileSync(migPath, 'utf8');
  assert.ok(sql.includes('cpt_denial_payment_metrics'), 'cpt_denial_payment_metrics table created');
  assert.ok(sql.includes('cpt_carc_denial_reasons'), 'cpt_carc_denial_reasons table created');
  assert.ok(sql.includes('cpt_payer_payment_velocity'), 'cpt_payer_payment_velocity table created');
  assert.ok(sql.includes('vw_cpt_denial_velocity_summary'), 'vw_cpt_denial_velocity_summary view created');
  assert.ok(sql.includes('vw_cpt_underpayment_leakage_radar'), 'vw_cpt_underpayment_leakage_radar view created');
  assert.ok(sql.includes('ROW LEVEL SECURITY'), 'RLS enabled');
  assert.ok(sql.includes('app.current_facility_id'), 'Tenant filter by facility_id present');
});

test('Migration 096_cpt_denial_and_payment_performance_down.sql contains clean rollback', () => {
  const downPath = path.join(rootDir, 'supabase', 'migrations', '096_cpt_denial_and_payment_performance_down.sql');
  assert.ok(fs.existsSync(downPath), 'Migration DOWN file must exist');

  const sql = fs.readFileSync(downPath, 'utf8');
  assert.ok(sql.includes('DROP TABLE IF EXISTS public.cpt_payer_payment_velocity'), 'Drops payer velocity table');
  assert.ok(sql.includes('DROP TABLE IF EXISTS public.cpt_carc_denial_reasons'), 'Drops CARC reasons table');
  assert.ok(sql.includes('DROP TABLE IF EXISTS public.cpt_denial_payment_metrics'), 'Drops metrics table');
  assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_cpt_denial_velocity_summary'), 'Drops summary view');
});

// 5. Zero-Purple Design System Compliance
test('Phase B7 UI component and CSS are strictly Zero-Purple compliant', () => {
  const jsxPath = path.join(rootDir, 'src', 'components', 'CptDenialPaymentView.jsx');
  const cssPath = path.join(rootDir, 'src', 'components', 'CptDenialPaymentView.css');

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
test('App.jsx correctly imports and registers CptDenialPaymentView', () => {
  const appPath = path.join(rootDir, 'src', 'App.jsx');
  const appContent = fs.readFileSync(appPath, 'utf8');

  assert.ok(appContent.includes("import CptDenialPaymentView from './components/CptDenialPaymentView'"), 'App imports CptDenialPaymentView');
  assert.ok(appContent.includes("activeTab === 'cpt_denial_payment'"), 'App routes cpt_denial_payment');
  assert.ok(appContent.includes('Denial & Payment Performance'), 'Sidebar item labeled correctly');
  assert.ok(appContent.includes('<CptDenialPaymentView />'), 'Component mounted in main tab body');
});
