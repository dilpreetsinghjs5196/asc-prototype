import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Import service layer under test
import {
  BENCHMARK_TIERS,
  DEFAULT_BENCHMARK_TARGET_PCT,
  MAX_ALLOWABLE_TURNOVER_MINS,
  calculateRawUtilizationPct,
  calculateTurnoverInclusivePct,
  calculatePrimeTimeUtilizationPct,
  calculateBlockUtilization,
  determineUtilizationTier,
  calculateFinancialYieldMetrics,
  calculateFacilityUtilizationKpis,
  filterRoomUtilization,
  filterSurgeonBlockUtilization,
  SEED_DAILY_ROOM_UTILIZATION,
  SEED_SURGEON_BLOCK_UTILIZATION
} from '../src/services/orUtilizationMetricsService.js';

describe('Phase A4 — OR Utilization Metrics & Benchmarking Engine Test Suite', () => {

  // 1. Benchmark Taxonomy & Governance
  describe('1. Benchmark Taxonomy & Governance', () => {
    test('should define all 4 authoritative utilization benchmark tiers', () => {
      const keys = Object.keys(BENCHMARK_TIERS);
      assert.strictEqual(keys.length, 4);
      assert.ok(BENCHMARK_TIERS.EXCEEDS_BENCHMARK);
      assert.ok(BENCHMARK_TIERS.MEETS_BENCHMARK);
      assert.ok(BENCHMARK_TIERS.UNDERUTILIZED_WARNING);
      assert.ok(BENCHMARK_TIERS.CRITICAL_UNDERUTILIZATION);
    });

    test('should define default utilization target as 75.0% and turnover cap as 45m', () => {
      assert.strictEqual(DEFAULT_BENCHMARK_TARGET_PCT, 75.00);
      assert.strictEqual(MAX_ALLOWABLE_TURNOVER_MINS, 45);
    });

    test('should have explicit rightsizing recommendations for all tiers', () => {
      assert.strictEqual(BENCHMARK_TIERS.EXCEEDS_BENCHMARK.recommendation, 'EXPAND_BLOCK');
      assert.strictEqual(BENCHMARK_TIERS.MEETS_BENCHMARK.recommendation, 'MAINTAIN_BLOCK');
      assert.strictEqual(BENCHMARK_TIERS.UNDERUTILIZED_WARNING.recommendation, 'UTILIZATION_WARNING');
      assert.strictEqual(BENCHMARK_TIERS.CRITICAL_UNDERUTILIZATION.recommendation, 'REDUCE_OR_FORFEIT');
    });
  });

  // 2. Deterministic Utilization Calculations
  describe('2. Deterministic Utilization Math & Denominator Rules', () => {
    test('calculateRawUtilizationPct: computes accurate ratio of in-room to staffed minutes', () => {
      // 480 case minutes out of 600 staffed minutes = 80.00%
      assert.strictEqual(calculateRawUtilizationPct(480, 600), 80.00);
      // 510 case minutes out of 600 staffed minutes = 85.00%
      assert.strictEqual(calculateRawUtilizationPct(510, 600), 85.00);
      // Zero staffed minutes returns 0.00
      assert.strictEqual(calculateRawUtilizationPct(100, 0), 0.00);
      // Zero in-room minutes returns 0.00
      assert.strictEqual(calculateRawUtilizationPct(0, 600), 0.00);
    });

    test('calculateTurnoverInclusivePct: credits turnover within capped boundaries', () => {
      // 480 in-room + 60 turnover out of 600 staffed = 540 / 600 = 90.00%
      assert.strictEqual(calculateTurnoverInclusivePct(480, 60, 600), 90.00);
      // Zero staffed minutes returns 0.00
      assert.strictEqual(calculateTurnoverInclusivePct(100, 20, 0), 0.00);
    });

    test('calculatePrimeTimeUtilizationPct: computes ratio within 07:00-15:00 window', () => {
      // 400 prime-time minutes out of 480 prime-time staffed = 83.33%
      assert.strictEqual(calculatePrimeTimeUtilizationPct(400, 480), 83.33);
      // Zero prime case minutes = 0.00
      assert.strictEqual(calculatePrimeTimeUtilizationPct(0, 480), 0.00);
    });

    test('calculateBlockUtilization: deducts on-time release from denominator', () => {
      // Allocated: 6240m (104h), On-time released: 960m (16h)
      // Net Denominator = 6240 - 960 = 5280m (88h)
      // Utilized: 4620m (77h) -> 4620 / 5280 = 87.50%
      const result = calculateBlockUtilization(4620, 6240, 960);
      assert.strictEqual(result.netDenominatorMinutes, 5280);
      assert.strictEqual(result.utilizationPct, 87.50);
      assert.strictEqual(result.isFullyExcused, false);

      // Late release test: If released late (0m on-time released), full 6240 remains in denominator
      const lateResult = calculateBlockUtilization(4620, 6240, 0);
      assert.strictEqual(lateResult.netDenominatorMinutes, 6240);
      assert.strictEqual(lateResult.utilizationPct, 74.04); // Dropped from 87.5% to 74.04% due to penalty

      // Full on-time surrender (100% excused)
      const excusedResult = calculateBlockUtilization(0, 480, 480);
      assert.strictEqual(excusedResult.netDenominatorMinutes, 0);
      assert.strictEqual(excusedResult.utilizationPct, 100.00);
      assert.strictEqual(excusedResult.isFullyExcused, true);
    });

    test('determineUtilizationTier: classifies percentages into governance categories', () => {
      assert.strictEqual(determineUtilizationTier(87.5, 75).code, 'EXCEEDS_BENCHMARK');
      assert.strictEqual(determineUtilizationTier(76.5, 75).code, 'MEETS_BENCHMARK');
      assert.strictEqual(determineUtilizationTier(64.2, 75).code, 'UNDERUTILIZED_WARNING');
      assert.strictEqual(determineUtilizationTier(52.1, 75).code, 'CRITICAL_UNDERUTILIZATION');
    });

    test('calculateFinancialYieldMetrics: computes revenue and margin per OR hour', () => {
      // $100,000 revenue, $60,000 margin, 3000 case minutes (50h), 3600 staffed minutes (60h)
      const yieldData = calculateFinancialYieldMetrics(100000, 60000, 3000, 3600);
      assert.strictEqual(yieldData.revenuePerUtilizedHour, 2000.00); // 100k / 50h
      assert.strictEqual(yieldData.marginPerUtilizedHour, 1200.00);  // 60k / 50h
      assert.strictEqual(yieldData.marginPerStaffedHour, 1000.00);   // 60k / 60h
      assert.strictEqual(yieldData.utilizedHours, 50.0);
      assert.strictEqual(yieldData.staffedHours, 60.0);
    });
  });

  // 3. Facility KPIs & Query Filtering
  describe('3. Facility KPIs & Query Filtering', () => {
    test('calculateFacilityUtilizationKpis: computes accurate facility summary metrics', () => {
      const kpis = calculateFacilityUtilizationKpis(SEED_DAILY_ROOM_UTILIZATION, SEED_SURGEON_BLOCK_UTILIZATION);

      assert.ok(kpis.grossStaffedUtilPct >= 65.0 && kpis.grossStaffedUtilPct <= 85.0);
      assert.ok(kpis.primeTimeUtilPct >= 70.0);
      assert.ok(kpis.turnoverInclusivePct > kpis.grossStaffedUtilPct);
      assert.ok(kpis.blockComplianceRatePct >= 50.0);
      assert.ok(kpis.totalStaffedHours > 0);
      assert.ok(kpis.totalCasesCount >= 20);
      assert.ok(kpis.totalRevenue > 0);
      assert.ok(kpis.totalMargin > 0);
      assert.ok(kpis.marginPerStaffedHour > 0);
    });

    test('filterRoomUtilization: filters rooms by room number, minimum utilization, and search', () => {
      const all = filterRoomUtilization(SEED_DAILY_ROOM_UTILIZATION);
      assert.strictEqual(all.length, SEED_DAILY_ROOM_UTILIZATION.length);

      // Filter by room OR-1
      const or1 = filterRoomUtilization(SEED_DAILY_ROOM_UTILIZATION, { operatingRoomId: 'room-or-1' });
      assert.strictEqual(or1.length, 1);
      assert.strictEqual(or1[0].room_number, 'OR-1');

      // Filter by min utilization >= 80%
      const highUtil = filterRoomUtilization(SEED_DAILY_ROOM_UTILIZATION, { minUtilPct: 80 });
      assert.ok(highUtil.length >= 3);
      assert.ok(highUtil.every(r => r.raw_utilization_pct >= 80));

      // Filter by search text
      const searchEndo = filterRoomUtilization(SEED_DAILY_ROOM_UTILIZATION, { search: 'Endoscopy' });
      assert.strictEqual(searchEndo.length, 1);
      assert.strictEqual(searchEndo[0].room_number, 'ENDO-1');
    });

    test('filterSurgeonBlockUtilization: filters surgeon blocks by specialty, tier, and search', () => {
      const all = filterSurgeonBlockUtilization(SEED_SURGEON_BLOCK_UTILIZATION);
      assert.strictEqual(all.length, SEED_SURGEON_BLOCK_UTILIZATION.length);

      // Filter by specialty ORTHOPEDICS
      const ortho = filterSurgeonBlockUtilization(SEED_SURGEON_BLOCK_UTILIZATION, { specialtyCode: 'ORTHOPEDICS' });
      assert.strictEqual(ortho.length, 2);

      // Filter by tier CRITICAL_UNDERUTILIZATION
      const critical = filterSurgeonBlockUtilization(SEED_SURGEON_BLOCK_UTILIZATION, { utilizationTier: 'CRITICAL_UNDERUTILIZATION' });
      assert.strictEqual(critical.length, 1);
      assert.strictEqual(critical[0].surgeon_name, 'Dr. Sarah Jenkins, MD');

      // Filter by search query
      const searched = filterSurgeonBlockUtilization(SEED_SURGEON_BLOCK_UTILIZATION, { search: 'Rostova' });
      assert.strictEqual(searched.length, 1);
      assert.strictEqual(searched[0].surgeon_name, 'Dr. Elena Rostova, MD');
    });
  });

  // 4. Database Migration SQL Integrity (081)
  describe('4. Database Migration SQL Integrity (081)', () => {
    test('forward migration 081 exists with core tables, views, indexes, and RLS', () => {
      const upPath = path.join(ROOT_DIR, 'supabase', 'migrations', '081_or_utilization_metrics.sql');
      assert.ok(fs.existsSync(upPath), '081_or_utilization_metrics.sql must exist');

      const sql = fs.readFileSync(upPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.or_utilization_daily_snapshots'));
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.or_surgeon_block_utilization_snapshots'));
      assert.ok(sql.includes('staffed_minutes INTEGER NOT NULL'));
      assert.ok(sql.includes('in_room_case_minutes INTEGER NOT NULL'));
      assert.ok(sql.includes('turnover_minutes INTEGER NOT NULL'));
      assert.ok(sql.includes('net_adjusted_denominator_minutes INTEGER NOT NULL'));
      assert.ok(sql.includes('block_utilization_pct NUMERIC(5, 2) NOT NULL'));
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_or_utilization_facility_summary'));
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_or_surgeon_block_compliance'));
      assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'));
      assert.ok(sql.includes('rls_or_utilization_daily_snapshots_facility'));
      assert.ok(sql.includes('rls_or_surgeon_block_utilization_facility'));
    });

    test('down migration 081 cleanly drops all views, policies, indexes, and tables CASCADE', () => {
      const downPath = path.join(ROOT_DIR, 'supabase', 'migrations', '081_or_utilization_metrics_down.sql');
      assert.ok(fs.existsSync(downPath), '081_or_utilization_metrics_down.sql must exist');

      const sql = fs.readFileSync(downPath, 'utf8');
      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_or_surgeon_block_compliance CASCADE'));
      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_or_utilization_facility_summary CASCADE'));
      assert.ok(sql.includes('DROP POLICY IF EXISTS rls_or_surgeon_block_utilization_facility ON public.or_surgeon_block_utilization_snapshots'));
      assert.ok(sql.includes('DROP POLICY IF EXISTS rls_or_utilization_daily_snapshots_facility ON public.or_utilization_daily_snapshots'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.or_surgeon_block_utilization_snapshots CASCADE'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.or_utilization_daily_snapshots CASCADE'));
    });
  });

  // 5. Maestro Design System Governance & App Wiring
  describe('5. Maestro Design System Governance & App Wiring', () => {
    test('strictly ZERO prohibited tokens in JSX and CSS', () => {
      const jsxPath = path.join(ROOT_DIR, 'src', 'components', 'OrUtilizationMetricsView.jsx');
      const cssPath = path.join(ROOT_DIR, 'src', 'components', 'OrUtilizationMetricsView.css');

      assert.ok(fs.existsSync(jsxPath), 'OrUtilizationMetricsView.jsx must exist');
      assert.ok(fs.existsSync(cssPath), 'OrUtilizationMetricsView.css must exist');

      const jsx = fs.readFileSync(jsxPath, 'utf8');
      const css = fs.readFileSync(cssPath, 'utf8');

      // Prohibited tokens regex: purple, violet, indigo, magenta, fuchsia tokens
      const prohibitedRegex = /(purple|violet|indigo|magenta|fuchsia)/i;

      assert.ok(!prohibitedRegex.test(jsx), 'OrUtilizationMetricsView.jsx contains prohibited design tokens');
      assert.ok(!prohibitedRegex.test(css), 'OrUtilizationMetricsView.css contains prohibited design tokens');
    });

    test('App.jsx correctly imports and registers OrUtilizationMetricsView', () => {
      const appPath = path.join(ROOT_DIR, 'src', 'App.jsx');
      const app = fs.readFileSync(appPath, 'utf8');

      assert.ok(app.includes("import OrUtilizationMetricsView from './components/OrUtilizationMetricsView'"));
      assert.ok(app.includes("activeTab === 'or_utilization'"));
      assert.ok(app.includes("<OrUtilizationMetricsView />"));
      assert.ok(app.includes("OR Utilization & Benchmarking"));
      assert.ok(app.includes("Operating Room Utilization Metrics & Governance"));
    });

    test('Phase A4 master specification documents exist and are complete', () => {
      const localSpecPath = path.join(ROOT_DIR, 'docs', 'phases', 'A4_OR_UTILIZATION_METRICS.md');
      const externalSpecPath = 'e:\\medicalAI\\ASCANALYST_All_Modules\\ASCANALYST_MD_SPECS\\Phase_10_OR_Scheduling\\A4_OR_UTILIZATION_METRICS.md';

      assert.ok(fs.existsSync(localSpecPath), 'docs/phases/A4_OR_UTILIZATION_METRICS.md must exist');
      assert.ok(fs.existsSync(externalSpecPath), 'External spec must exist');

      const specContent = fs.readFileSync(localSpecPath, 'utf8');
      assert.ok(specContent.includes('# A4 OR UTILIZATION METRICS'));
      assert.ok(specContent.includes('## Purpose'));
      assert.ok(specContent.includes('## Scope'));
      assert.ok(specContent.includes('## Current State'));
      assert.ok(specContent.includes('## Target State'));
      assert.ok(specContent.includes('## Data Model / Schema'));
      assert.ok(specContent.includes('## Business Rules'));
      assert.ok(specContent.includes('## Permissions / Security'));
      assert.ok(specContent.includes('## API / Service Requirements'));
      assert.ok(specContent.includes('## UI / Workflow Requirements'));
      assert.ok(specContent.includes('## Audit / Provenance'));
      assert.ok(specContent.includes('## QA / Test Cases'));
      assert.ok(specContent.includes('## Acceptance Criteria'));
    });
  });
});
