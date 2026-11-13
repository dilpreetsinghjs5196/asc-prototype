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
  TURNOVER_TYPES,
  TURNOVER_STATUSES,
  DELAY_REASONS,
  DEFAULT_HOURLY_RUN_RATE,
  DEFAULT_WARNING_THRESHOLD_MINUTES,
  calculateTurnoverDuration,
  determineTurnoverType,
  getBenchmarkTarget,
  calculateTurnoverVariance,
  classifyTurnoverStatus,
  calculateTurnoverFinancialImpact,
  calculateFacilityTurnoverKpis,
  calculateDelayReasonPareto,
  filterTurnoverEvents,
  SEED_TURNOVER_EVENTS,
  SEED_TURNOVER_BENCHMARKS
} from '../src/services/turnoverMetricsService.js';

describe('Phase A7 — Turnover Metrics & Benchmark Engine Test Suite', () => {

  // 1. Taxonomy & Threshold Standards
  describe('1. Turnover Taxonomy & Threshold Standards', () => {
    test('should define both turnover types with default benchmark minutes', () => {
      const keys = Object.keys(TURNOVER_TYPES);
      assert.strictEqual(keys.length, 2);
      assert.strictEqual(TURNOVER_TYPES.SAME_SURGEON.defaultBenchmark, 20);
      assert.strictEqual(TURNOVER_TYPES.DIFFERENT_SURGEON.defaultBenchmark, 35);
    });

    test('should define all 3 turnover compliance statuses', () => {
      const keys = Object.keys(TURNOVER_STATUSES);
      assert.strictEqual(keys.length, 3);
      assert.ok(TURNOVER_STATUSES.COMPLIANT);
      assert.ok(TURNOVER_STATUSES.MINOR_DELAY);
      assert.ok(TURNOVER_STATUSES.PROLONGED_TURNOVER);
    });

    test('should define all 8 clinical delay root-cause codes', () => {
      const keys = Object.keys(DELAY_REASONS);
      assert.strictEqual(keys.length, 8);
      assert.ok(DELAY_REASONS.EVS_CLEANING_DELAY);
      assert.ok(DELAY_REASONS.INSTRUMENT_STERILIZATION_DELAY);
      assert.ok(DELAY_REASONS.SURGEON_UNAVAILABLE);
      assert.ok(DELAY_REASONS.ANESTHESIA_PREOP_DELAY);
      assert.ok(DELAY_REASONS.NURSING_STAFF_SHORTAGE);
      assert.ok(DELAY_REASONS.EQUIPMENT_MALFUNCTION_SETUP);
      assert.ok(DELAY_REASONS.PATIENT_ADMISSION_DELAY);
      assert.ok(DELAY_REASONS.OTHER_CLINICAL_HOLD);
    });

    test('should enforce $650.00/hr staffed room run-rate and 10m warning threshold', () => {
      assert.strictEqual(DEFAULT_HOURLY_RUN_RATE, 650.00);
      assert.strictEqual(DEFAULT_WARNING_THRESHOLD_MINUTES, 10);
    });
  });

  // 2. Deterministic Duration Math & Type Determination
  describe('2. Deterministic Duration Math & Type Determination', () => {
    test('calculateTurnoverDuration: accurately measures minutes between wheels out and wheels in', () => {
      const outTime = '2026-11-10T09:30:00Z';
      const inTime = '2026-11-10T09:52:00Z'; // 22 minutes
      assert.strictEqual(calculateTurnoverDuration(outTime, inTime), 22);

      // Edge case: same minute -> 0
      assert.strictEqual(calculateTurnoverDuration(outTime, outTime), 0);

      // Edge case: invalid sequence (inTime < outTime) -> 0
      assert.strictEqual(calculateTurnoverDuration(inTime, outTime), 0);

      // Edge case: invalid timestamps
      assert.strictEqual(calculateTurnoverDuration('invalid', 'invalid'), 0);
    });

    test('determineTurnoverType: assigns SAME_SURGEON vs DIFFERENT_SURGEON dynamically', () => {
      assert.strictEqual(
        determineTurnoverType('Dr. Robert Chen, MD', 'Dr. Robert Chen, MD'),
        'SAME_SURGEON'
      );
      assert.strictEqual(
        determineTurnoverType('dr. robert chen, md ', '  Dr. Robert Chen, MD'),
        'SAME_SURGEON'
      );
      assert.strictEqual(
        determineTurnoverType('Dr. Robert Chen, MD', 'Dr. Kevin Zhao, MD'),
        'DIFFERENT_SURGEON'
      );
    });

    test('getBenchmarkTarget: retrieves default and specialty-specific targets', () => {
      // Default without custom benchmarks
      assert.strictEqual(getBenchmarkTarget('SAME_SURGEON'), 20);
      assert.strictEqual(getBenchmarkTarget('DIFFERENT_SURGEON'), 35);

      // Specialty-specific custom benchmarks
      const orthoTargetSame = getBenchmarkTarget('SAME_SURGEON', 'ORTHOPEDICS', SEED_TURNOVER_BENCHMARKS);
      assert.strictEqual(orthoTargetSame, 25);

      const eyeTargetSame = getBenchmarkTarget('SAME_SURGEON', 'OPHTHALMOLOGY', SEED_TURNOVER_BENCHMARKS);
      assert.strictEqual(eyeTargetSame, 15);

      const spineTargetDiff = getBenchmarkTarget('DIFFERENT_SURGEON', 'SPINE_SURGERY', SEED_TURNOVER_BENCHMARKS);
      assert.strictEqual(spineTargetDiff, 45);
    });
  });

  // 3. Turnover Variance & Status Classification
  describe('3. Turnover Variance & Status Classification', () => {
    test('calculateTurnoverVariance: calculates delta between actual and benchmark target', () => {
      // On-time: 18m actual, 20m target -> -2m
      assert.strictEqual(calculateTurnoverVariance(18, 20), -2);

      // Minor delay: 22m actual, 20m target -> +2m
      assert.strictEqual(calculateTurnoverVariance(22, 20), 2);

      // Prolonged delay: 50m actual, 35m target -> +15m
      assert.strictEqual(calculateTurnoverVariance(50, 35), 15);
    });

    test('classifyTurnoverStatus: categorizes into COMPLIANT, MINOR_DELAY, and PROLONGED_TURNOVER', () => {
      // Variance <= 0 -> COMPLIANT
      assert.strictEqual(classifyTurnoverStatus(0), 'COMPLIANT');
      assert.strictEqual(classifyTurnoverStatus(-5), 'COMPLIANT');

      // 0 < Variance <= 10 -> MINOR_DELAY
      assert.strictEqual(classifyTurnoverStatus(1), 'MINOR_DELAY');
      assert.strictEqual(classifyTurnoverStatus(10), 'MINOR_DELAY');

      // Variance > 10 -> PROLONGED_TURNOVER
      assert.strictEqual(classifyTurnoverStatus(11), 'PROLONGED_TURNOVER');
      assert.strictEqual(classifyTurnoverStatus(25), 'PROLONGED_TURNOVER');
    });
  });

  // 4. Financial Idle Labor Cost Engine
  describe('4. Financial Idle Labor Cost Engine', () => {
    test('calculateTurnoverFinancialImpact: accurately computes run-rate and excess delay costs', () => {
      // 60 minutes actual, 15m variance at $650/hr
      const impact = calculateTurnoverFinancialImpact(60, 15, 650);
      assert.strictEqual(impact.totalIdleCost, 650.00);
      assert.strictEqual(impact.excessDelayCost, 162.50); // (15/60)*650

      // Compliant case: 18m actual, -2m variance
      const compliantImpact = calculateTurnoverFinancialImpact(18, -2, 650);
      assert.strictEqual(compliantImpact.totalIdleCost, 195.00); // (18/60)*650
      assert.strictEqual(compliantImpact.excessDelayCost, 0.00); // no excess cost
    });
  });

  // 5. Facility KPIs Aggregation & Pareto Analysis
  describe('5. Facility KPIs Aggregation & Pareto Analysis', () => {
    test('calculateFacilityTurnoverKpis: aggregates facility seed metrics accurately', () => {
      const kpis = calculateFacilityTurnoverKpis(SEED_TURNOVER_EVENTS);

      assert.strictEqual(kpis.totalTurnovers, 12);
      assert.strictEqual(kpis.sameSurgeonCount, 10);
      assert.strictEqual(kpis.differentSurgeonCount, 2);
      assert.ok(kpis.avgTurnoverMinutes > 0);
      assert.ok(kpis.avgSameSurgeonMinutes > 0);
      assert.ok(kpis.avgDifferentSurgeonMinutes > 0);
      assert.strictEqual(kpis.compliantCount, 5);
      assert.strictEqual(kpis.minorDelayCount, 3);
      assert.strictEqual(kpis.prolongedCount, 4);
      assert.ok(kpis.totalDelayMinutes > 0);
      assert.ok(kpis.totalExcessCost > 0);
    });

    test('calculateDelayReasonPareto: sorts delays by total lost minutes descending', () => {
      const pareto = calculateDelayReasonPareto(SEED_TURNOVER_EVENTS);

      assert.ok(pareto.length > 0);
      // Ensure sorted descending
      for (let i = 0; i < pareto.length - 1; i++) {
        assert.ok(pareto[i].totalDelayMinutes >= pareto[i + 1].totalDelayMinutes);
      }
      // Sum of percentages should round to 100%
      const totalPct = pareto.reduce((acc, r) => acc + r.pctOfTotalDelay, 0);
      assert.ok(Math.round(totalPct) >= 99 && Math.round(totalPct) <= 101);
    });

    test('filterTurnoverEvents: filters by room, turnover type, status, delay reason, and query', () => {
      const or1Events = filterTurnoverEvents(SEED_TURNOVER_EVENTS, { room: 'or-1' });
      assert.strictEqual(or1Events.length, 4);

      const diffSurgeon = filterTurnoverEvents(SEED_TURNOVER_EVENTS, { turnoverType: 'DIFFERENT_SURGEON' });
      assert.strictEqual(diffSurgeon.length, 2);

      const prolonged = filterTurnoverEvents(SEED_TURNOVER_EVENTS, { turnoverStatus: 'PROLONGED_TURNOVER' });
      assert.strictEqual(prolonged.length, 4);

      const searchMatch = filterTurnoverEvents(SEED_TURNOVER_EVENTS, { searchQuery: 'Rotator Cuff' });
      assert.strictEqual(searchMatch.length, 2);
    });
  });

  // 6. Database Migration 084 Integrity & RLS Multi-Tenancy
  describe('6. Database Migration 084 Integrity & Multi-Tenancy Governance', () => {
    const upMigrationPath = path.join(ROOT_DIR, 'supabase', 'migrations', '084_turnover_metrics.sql');
    const downMigrationPath = path.join(ROOT_DIR, 'supabase', 'migrations', '084_turnover_metrics_down.sql');

    test('UP migration 084 exists and contains required tables and columns', () => {
      assert.ok(fs.existsSync(upMigrationPath), '084_turnover_metrics.sql must exist');
      const sql = fs.readFileSync(upMigrationPath, 'utf8');

      // Tables
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.or_turnover_events'));
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.or_turnover_benchmarks'));

      // Core columns
      assert.ok(sql.includes('turnover_type VARCHAR(32) NOT NULL'));
      assert.ok(sql.includes('actual_turnover_minutes INTEGER NOT NULL'));
      assert.ok(sql.includes('benchmark_target_minutes INTEGER NOT NULL'));
      assert.ok(sql.includes('turnover_variance_minutes INTEGER NOT NULL'));
      assert.ok(sql.includes('turnover_status VARCHAR(32) NOT NULL'));
      assert.ok(sql.includes('delay_reason_code VARCHAR(64)'));
      assert.ok(sql.includes('financial_idle_cost NUMERIC(10, 2) NOT NULL'));
      assert.ok(sql.includes('excess_delay_cost NUMERIC(10, 2) NOT NULL'));

      // Analytical views
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_or_turnover_facility_summary'));
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_or_turnover_delay_attribution'));

      // RLS policies
      assert.ok(sql.includes('ALTER TABLE public.or_turnover_events ENABLE ROW LEVEL SECURITY;'));
      assert.ok(sql.includes('ALTER TABLE public.or_turnover_benchmarks ENABLE ROW LEVEL SECURITY;'));
      assert.ok(sql.includes("app.current_facility_id"));
    });

    test('DOWN migration 084 cleanly drops views, policies, indexes, and tables with CASCADE', () => {
      assert.ok(fs.existsSync(downMigrationPath), '084_turnover_metrics_down.sql must exist');
      const sql = fs.readFileSync(downMigrationPath, 'utf8');

      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_or_turnover_delay_attribution CASCADE;'));
      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_or_turnover_facility_summary CASCADE;'));
      assert.ok(sql.includes('DROP POLICY IF EXISTS rls_or_turnover_benchmarks_facility'));
      assert.ok(sql.includes('DROP POLICY IF EXISTS rls_or_turnover_events_facility'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.or_turnover_benchmarks CASCADE;'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.or_turnover_events CASCADE;'));
    });
  });

  // 7. Design System Governance & App.jsx Wiring
  describe('7. Maestro Design System Governance & App Integration', () => {
    test('TurnoverMetricsView.jsx and CSS strictly adhere to Zero Purple Rule', () => {
      const jsxPath = path.join(ROOT_DIR, 'src', 'components', 'TurnoverMetricsView.jsx');
      const cssPath = path.join(ROOT_DIR, 'src', 'components', 'TurnoverMetricsView.css');

      assert.ok(fs.existsSync(jsxPath), 'TurnoverMetricsView.jsx must exist');
      assert.ok(fs.existsSync(cssPath), 'TurnoverMetricsView.css must exist');

      const jsx = fs.readFileSync(jsxPath, 'utf8');
      const css = fs.readFileSync(cssPath, 'utf8');

      const prohibitedTokens = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];

      prohibitedTokens.forEach(token => {
        const tokenRegex = new RegExp(`\\b${token}\\b`, 'i');
        assert.ok(!tokenRegex.test(jsx), `TurnoverMetricsView.jsx contains prohibited token: ${token}`);
        assert.ok(!tokenRegex.test(css), `TurnoverMetricsView.css contains prohibited token: ${token}`);
      });
    });

    test('App.jsx properly imports, routes, and renders TurnoverMetricsView', () => {
      const appJsxPath = path.join(ROOT_DIR, 'src', 'App.jsx');
      const appJsx = fs.readFileSync(appJsxPath, 'utf8');

      // Import check
      assert.ok(appJsx.includes("import TurnoverMetricsView from './components/TurnoverMetricsView';"));

      // Sidebar menu item
      assert.ok(appJsx.includes("activeTab === 'turnover_metrics'"));
      assert.ok(appJsx.includes("Turnover Metrics & Delays"));

      // Header title & subtitle
      assert.ok(appJsx.includes("{activeTab === 'turnover_metrics' && 'Operating Room Turnover Metrics & Benchmarks'}"));

      // Date picker exclusion
      assert.ok(appJsx.includes("'turnover_metrics'"));

      // View rendering
      assert.ok(appJsx.includes('<TurnoverMetricsView />'));
    });
  });
});

