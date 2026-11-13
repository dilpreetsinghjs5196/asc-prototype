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
  ACCURACY_STATUSES,
  SCHEDULING_TENDENCIES,
  CALIBRATION_ACTIONS,
  DEFAULT_TOLERANCE_MINUTES,
  DEFAULT_OVERTIME_HOURLY_RATE,
  calculateDurationVariance,
  classifyAccuracyStatus,
  calculateMeanDurationBias,
  determineSchedulingTendency,
  calculateOverrunLaborCost,
  calculateFacilityAccuracyKpis,
  filterBookingAccuracyLogs,
  SEED_BOOKING_ACCURACY_LOGS,
  SEED_SURGEON_BOOKING_PROFILES,
  SEED_CPT_CALIBRATION_BENCHMARKS
} from '../src/services/bookingAccuracyService.js';

describe('Phase A6 — Booking Accuracy & Duration Calibration Engine Test Suite', () => {

  // 1. Taxonomy & Threshold Standards
  describe('1. Booking Accuracy Taxonomy & Threshold Standards', () => {
    test('should define all 3 authoritative booking accuracy statuses', () => {
      const keys = Object.keys(ACCURACY_STATUSES);
      assert.strictEqual(keys.length, 3);
      assert.ok(ACCURACY_STATUSES.ACCURATE);
      assert.ok(ACCURACY_STATUSES.UNDER_ESTIMATED);
      assert.ok(ACCURACY_STATUSES.OVER_ESTIMATED);
    });

    test('should define all 3 surgeon scheduling tendencies', () => {
      const keys = Object.keys(SCHEDULING_TENDENCIES);
      assert.strictEqual(keys.length, 3);
      assert.ok(SCHEDULING_TENDENCIES.CHRONIC_UNDER_BOOKER);
      assert.ok(SCHEDULING_TENDENCIES.CALIBRATED);
      assert.ok(SCHEDULING_TENDENCIES.CHRONIC_PADDER);
    });

    test('should define all 4 calibration governance actions', () => {
      const keys = Object.keys(CALIBRATION_ACTIONS);
      assert.strictEqual(keys.length, 4);
      assert.ok(CALIBRATION_ACTIONS.MANDATORY_CPT_MEDIAN);
      assert.ok(CALIBRATION_ACTIONS.EXTEND_DEFAULT_TEMPLATE);
      assert.ok(CALIBRATION_ACTIONS.SHRINK_DEFAULT_TEMPLATE);
      assert.ok(CALIBRATION_ACTIONS.MAINTAIN);
    });

    test('should enforce ±15m tolerance and $450/hr overtime labor standards', () => {
      assert.strictEqual(DEFAULT_TOLERANCE_MINUTES, 15);
      assert.strictEqual(DEFAULT_OVERTIME_HOURLY_RATE, 450.00);
    });
  });

  // 2. Deterministic Duration Variance & Accuracy Classification
  describe('2. Deterministic Duration Variance & Accuracy Classification', () => {
    test('calculateDurationVariance: accurately calculates variance minutes and percentage', () => {
      // Overrun: 60m scheduled, 85m actual -> +25m (+41.67%)
      const overrun = calculateDurationVariance(85, 60);
      assert.strictEqual(overrun.varianceMinutes, 25);
      assert.strictEqual(overrun.variancePct, 41.67);

      // Underrun: 45m scheduled, 24m actual -> -21m (-46.67%)
      const underrun = calculateDurationVariance(24, 45);
      assert.strictEqual(underrun.varianceMinutes, -21);
      assert.strictEqual(underrun.variancePct, -46.67);

      // On-target: 75m scheduled, 72m actual -> -3m (-4.00%)
      const onTarget = calculateDurationVariance(72, 75);
      assert.strictEqual(onTarget.varianceMinutes, -3);
      assert.strictEqual(onTarget.variancePct, -4.00);

      // Edge cases: zero scheduled duration
      const zeroScheduled = calculateDurationVariance(50, 0);
      assert.strictEqual(zeroScheduled.varianceMinutes, 50);
      assert.strictEqual(zeroScheduled.variancePct, 0.00);
    });

    test('classifyAccuracyStatus: respects ±15m tolerance window', () => {
      assert.strictEqual(classifyAccuracyStatus(0), 'ACCURATE');
      assert.strictEqual(classifyAccuracyStatus(15), 'ACCURATE');
      assert.strictEqual(classifyAccuracyStatus(-15), 'ACCURATE');
      assert.strictEqual(classifyAccuracyStatus(16), 'UNDER_ESTIMATED');
      assert.strictEqual(classifyAccuracyStatus(35), 'UNDER_ESTIMATED');
      assert.strictEqual(classifyAccuracyStatus(-16), 'OVER_ESTIMATED');
      assert.strictEqual(classifyAccuracyStatus(-30), 'OVER_ESTIMATED');
    });
  });

  // 3. Mean Duration Bias & Surgeon Scheduling Tendency
  describe('3. Mean Duration Bias & Surgeon Scheduling Tendency', () => {
    test('calculateMeanDurationBias: calculates average case variance accurately', () => {
      // Empty input
      assert.strictEqual(calculateMeanDurationBias([]), 0.00);

      // Overrunning surgeon: variances [25, 35, 40] -> (100 / 3) = 33.33m
      assert.strictEqual(calculateMeanDurationBias([25, 35, 40]), 33.33);

      // Padding surgeon: variances [-21, -19] -> (-40 / 2) = -20.00m
      assert.strictEqual(calculateMeanDurationBias([-21, -19]), -20.00);

      // Calibrated surgeon: [-3, -2, 4, -5, -2, -2] -> (-10 / 6) = -1.67m
      assert.strictEqual(calculateMeanDurationBias([-3, -2, 4, -5, -2, -2]), -1.67);
    });

    test('determineSchedulingTendency: classifies chronic under-booker, padder, and calibrated profiles', () => {
      // MDB > +10.0m -> CHRONIC_UNDER_BOOKER
      assert.strictEqual(determineSchedulingTendency(21.40), 'CHRONIC_UNDER_BOOKER');
      assert.strictEqual(determineSchedulingTendency(10.01), 'CHRONIC_UNDER_BOOKER');

      // MDB < -10.0m -> CHRONIC_PADDER
      assert.strictEqual(determineSchedulingTendency(-18.20), 'CHRONIC_PADDER');
      assert.strictEqual(determineSchedulingTendency(-10.01), 'CHRONIC_PADDER');

      // -10.0m <= MDB <= +10.0m -> CALIBRATED
      assert.strictEqual(determineSchedulingTendency(10.00), 'CALIBRATED');
      assert.strictEqual(determineSchedulingTendency(-10.00), 'CALIBRATED');
      assert.strictEqual(determineSchedulingTendency(1.20), 'CALIBRATED');
      assert.strictEqual(determineSchedulingTendency(-1.50), 'CALIBRATED');
      assert.strictEqual(determineSchedulingTendency(0.00), 'CALIBRATED');
    });
  });

  // 4. Overrun Labor Cost Calculation
  describe('4. Downstream Delay & Overtime Labor Cost Math', () => {
    test('calculateOverrunLaborCost: calculates dollar overtime impact at clinical crew rates', () => {
      // 60 mins at $450/hr = $450.00
      assert.strictEqual(calculateOverrunLaborCost(60, 450), 450.00);
      // 35 mins at $450/hr = (35/60)*450 = $262.50
      assert.strictEqual(calculateOverrunLaborCost(35, 450), 262.50);
      // 40 mins at $450/hr = (40/60)*450 = $300.00
      assert.strictEqual(calculateOverrunLaborCost(40, 450), 300.00);
      // 50 mins at $450/hr = (50/60)*450 = $375.00
      assert.strictEqual(calculateOverrunLaborCost(50, 450), 375.00);
      // 0 mins = $0.00
      assert.strictEqual(calculateOverrunLaborCost(0, 450), 0.00);
      // Negative mins = $0.00
      assert.strictEqual(calculateOverrunLaborCost(-20, 450), 0.00);
    });
  });

  // 5. Facility KPIs Aggregation & Filter Engine
  describe('5. Facility KPIs Aggregation & Filter Engine', () => {
    test('calculateFacilityAccuracyKpis: aggregates facility seed metrics accurately', () => {
      const kpis = calculateFacilityAccuracyKpis(SEED_BOOKING_ACCURACY_LOGS, SEED_SURGEON_BOOKING_PROFILES);
      
      assert.strictEqual(kpis.totalCases, 12);
      assert.strictEqual(kpis.accurateCases, 6);
      assert.strictEqual(kpis.underEstimatedCases, 4);
      assert.strictEqual(kpis.overEstimatedCases, 2);
      assert.strictEqual(kpis.overallAccuracyRatePct, 50.0);
      assert.ok(kpis.totalDownstreamDelayMinutes > 0);
      assert.ok(kpis.totalIdleGapHours > 0);
      assert.strictEqual(kpis.totalOvertimeLaborCost, 937.50);
      assert.strictEqual(kpis.calibratedSurgeonsCount, 3);
      assert.strictEqual(kpis.underBookerCount, 2);
      assert.strictEqual(kpis.padderCount, 1);
    });

    test('filterBookingAccuracyLogs: filters by specialty, surgeon, accuracy status, and query', () => {
      const orthoCases = filterBookingAccuracyLogs(SEED_BOOKING_ACCURACY_LOGS, { specialty: 'ORTHOPEDICS' });
      assert.strictEqual(orthoCases.length, 4);

      const overrunCases = filterBookingAccuracyLogs(SEED_BOOKING_ACCURACY_LOGS, { accuracyStatus: 'UNDER_ESTIMATED' });
      assert.strictEqual(overrunCases.length, 4);

      const vanceCases = filterBookingAccuracyLogs(SEED_BOOKING_ACCURACY_LOGS, { surgeon: 'Dr. Emily Vance, MD' });
      assert.strictEqual(vanceCases.length, 2);

      const queryMatches = filterBookingAccuracyLogs(SEED_BOOKING_ACCURACY_LOGS, { searchQuery: 'Cataract' });
      assert.strictEqual(queryMatches.length, 2);
    });
  });

  // 6. Database Migration 083 Integrity & RLS Multi-Tenancy
  describe('6. Database Migration 083 Integrity & Multi-Tenancy Governance', () => {
    const upMigrationPath = path.join(ROOT_DIR, 'supabase', 'migrations', '083_booking_accuracy.sql');
    const downMigrationPath = path.join(ROOT_DIR, 'supabase', 'migrations', '083_booking_accuracy_down.sql');

    test('UP migration 083 exists and contains required tables and columns', () => {
      assert.ok(fs.existsSync(upMigrationPath), '083_booking_accuracy.sql must exist');
      const sql = fs.readFileSync(upMigrationPath, 'utf8');

      // Tables
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.or_case_booking_accuracy_logs'));
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.or_surgeon_booking_profiles'));

      // Core columns
      assert.ok(sql.includes('scheduled_duration_minutes INTEGER NOT NULL'));
      assert.ok(sql.includes('actual_in_room_minutes INTEGER NOT NULL'));
      assert.ok(sql.includes('duration_variance_minutes INTEGER NOT NULL'));
      assert.ok(sql.includes('accuracy_status VARCHAR(32) NOT NULL'));
      assert.ok(sql.includes('mean_duration_bias_minutes NUMERIC(6, 2) NOT NULL'));
      assert.ok(sql.includes('scheduling_tendency VARCHAR(32) NOT NULL'));
      assert.ok(sql.includes('financial_labor_impact NUMERIC(10, 2) NOT NULL'));

      // Analytical views
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_or_booking_accuracy_facility_summary'));
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_or_surgeon_scheduling_bias'));

      // RLS policies
      assert.ok(sql.includes('ALTER TABLE public.or_case_booking_accuracy_logs ENABLE ROW LEVEL SECURITY;'));
      assert.ok(sql.includes('ALTER TABLE public.or_surgeon_booking_profiles ENABLE ROW LEVEL SECURITY;'));
      assert.ok(sql.includes("app.current_facility_id"));
    });

    test('DOWN migration 083 cleanly drops views, policies, indexes, and tables with CASCADE', () => {
      assert.ok(fs.existsSync(downMigrationPath), '083_booking_accuracy_down.sql must exist');
      const sql = fs.readFileSync(downMigrationPath, 'utf8');

      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_or_surgeon_scheduling_bias CASCADE;'));
      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_or_booking_accuracy_facility_summary CASCADE;'));
      assert.ok(sql.includes('DROP POLICY IF EXISTS rls_or_surgeon_booking_profiles_facility'));
      assert.ok(sql.includes('DROP POLICY IF EXISTS rls_or_case_booking_accuracy_logs_facility'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.or_surgeon_booking_profiles CASCADE;'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.or_case_booking_accuracy_logs CASCADE;'));
    });
  });

  // 7. Design System Governance (Zero Purple Ban) & App.jsx Wiring
  describe('7. Maestro Design System Governance & App Integration', () => {
    test('BookingAccuracyView.jsx and CSS strictly adhere to Zero Purple Rule', () => {
      const jsxPath = path.join(ROOT_DIR, 'src', 'components', 'BookingAccuracyView.jsx');
      const cssPath = path.join(ROOT_DIR, 'src', 'components', 'BookingAccuracyView.css');

      assert.ok(fs.existsSync(jsxPath), 'BookingAccuracyView.jsx must exist');
      assert.ok(fs.existsSync(cssPath), 'BookingAccuracyView.css must exist');

      const jsx = fs.readFileSync(jsxPath, 'utf8');
      const css = fs.readFileSync(cssPath, 'utf8');

      const prohibitedTokens = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];

      prohibitedTokens.forEach(token => {
        const tokenRegex = new RegExp(`\\b${token}\\b`, 'i');
        assert.ok(!tokenRegex.test(jsx), `BookingAccuracyView.jsx contains prohibited token: ${token}`);
        assert.ok(!tokenRegex.test(css), `BookingAccuracyView.css contains prohibited token: ${token}`);
      });
    });

    test('App.jsx properly imports, routes, and renders BookingAccuracyView', () => {
      const appJsxPath = path.join(ROOT_DIR, 'src', 'App.jsx');
      const appJsx = fs.readFileSync(appJsxPath, 'utf8');

      // Import check
      assert.ok(appJsx.includes("import BookingAccuracyView from './components/BookingAccuracyView';"));

      // Sidebar menu item
      assert.ok(appJsx.includes("activeTab === 'booking_accuracy'"));
      assert.ok(appJsx.includes("Booking Accuracy & Bias"));

      // Header title & subtitle
      assert.ok(appJsx.includes("{activeTab === 'booking_accuracy' && 'Case Booking Accuracy & Duration Calibration'}"));

      // Date picker exclusion
      assert.ok(appJsx.includes("'booking_accuracy'"));

      // View rendering
      assert.ok(appJsx.includes('<BookingAccuracyView />'));
    });
  });
});

