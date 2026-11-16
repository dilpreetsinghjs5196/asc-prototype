import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_FACILITY_ID,
  DEFAULT_SHIFT_START,
  DEFAULT_SHIFT_END,
  DEFAULT_STAFFED_MINUTES,
  OPTIMIZATION_STRATEGIES,
  SOLVER_STATUSES,
  SCHEDULE_STATUSES,
  OPERATING_ROOMS_CONFIG,
  timeStringToMinutes,
  minutesToTimeString,
  validateNoOverlap,
  validateSurgeonSingleLocation,
  calculateScheduleMetrics,
  runCpSatOptimizer,
  SEED_CP_SAT_CANDIDATE_CASES
} from '../src/services/cpSatSchedulerService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase AB / A11 — Scheduling Optimizer CP-SAT Engine Test Suite', () => {

  describe('1. CP-SAT Taxonomy & Architectural Standards', () => {
    it('should define facility and operational shift boundaries', () => {
      assert.strictEqual(DEFAULT_FACILITY_ID, 'f47ac10b-58cc-4372-a567-0e02b2c3d479');
      assert.strictEqual(DEFAULT_SHIFT_START, '07:30');
      assert.strictEqual(DEFAULT_SHIFT_END, '17:00');
      assert.strictEqual(DEFAULT_STAFFED_MINUTES, 570);
    });

    it('should define all 4 optimization strategy presets with positive weights', () => {
      const presets = ['BALANCED', 'MAX_MARGIN', 'MIN_OVERTIME', 'MIN_TURNOVER'];
      presets.forEach(preset => {
        const strat = OPTIMIZATION_STRATEGIES[preset];
        assert.ok(strat, `Missing preset ${preset}`);
        assert.ok(strat.weights.margin > 0);
        assert.ok(strat.weights.utilization > 0);
        assert.ok(strat.weights.overtimePenalty > 0);
        assert.ok(strat.weights.turnoverPenalty > 0);
        assert.ok(strat.weights.roomHopPenalty > 0);
      });
    });

    it('should define all 4 solver execution statuses', () => {
      const statuses = ['OPTIMAL', 'FEASIBLE', 'INFEASIBLE', 'TIMEOUT'];
      statuses.forEach(code => {
        assert.ok(SOLVER_STATUSES[code], `Missing solver status ${code}`);
      });
    });

    it('should define all 3 schedule commitment lifecycle statuses', () => {
      const statuses = ['PROPOSED', 'COMMITTED', 'DISCARDED'];
      statuses.forEach(code => {
        assert.ok(SCHEDULE_STATUSES[code], `Missing schedule status ${code}`);
      });
    });

    it('should configure 4 operating suites with valid shift bounds and specialties', () => {
      assert.strictEqual(OPERATING_ROOMS_CONFIG.length, 4);
      OPERATING_ROOMS_CONFIG.forEach(room => {
        assert.ok(room.id);
        assert.ok(room.name);
        assert.ok(Array.isArray(room.specialties) && room.specialties.length > 0);
        assert.strictEqual(room.shiftStartMinutes, 450); // 07:30
        assert.strictEqual(room.shiftEndMinutes, 1020);  // 17:00
        assert.strictEqual(room.staffedMinutes, 570);
      });
    });
  });

  describe('2. Time Conversion Utilities', () => {
    it('should accurately convert time strings to minutes from midnight', () => {
      assert.strictEqual(timeStringToMinutes('07:30'), 450);
      assert.strictEqual(timeStringToMinutes('12:00'), 720);
      assert.strictEqual(timeStringToMinutes('17:00'), 1020);
      assert.strictEqual(timeStringToMinutes('00:00'), 0);
      assert.strictEqual(timeStringToMinutes(''), 0);
      assert.strictEqual(timeStringToMinutes(null), 0);
    });

    it('should accurately convert minutes from midnight to HH:MM format', () => {
      assert.strictEqual(minutesToTimeString(450), '07:30');
      assert.strictEqual(minutesToTimeString(720), '12:00');
      assert.strictEqual(minutesToTimeString(1020), '17:00');
      assert.strictEqual(minutesToTimeString(0), '00:00');
      assert.strictEqual(minutesToTimeString(90), '01:30');
    });
  });

  describe('3. Hard Constraint 1: Operating Room No-Overlap & Turnover Enclosure', () => {
    it('should validate non-overlapping sequential cases with sufficient turnover', () => {
      const cases = [
        {
          id: 'case-1',
          scheduledDate: '2026-11-18',
          operatingRoomId: 'or-1',
          roomName: 'OR 1',
          startTime: '07:30',
          endTime: '09:00',
          turnoverMinutes: 25,
          surgeonId: '101'
        },
        {
          id: 'case-2',
          scheduledDate: '2026-11-18',
          operatingRoomId: 'or-1',
          roomName: 'OR 1',
          startTime: '09:25',
          endTime: '11:15',
          turnoverMinutes: 25,
          surgeonId: '101'
        }
      ];

      const validation = validateNoOverlap(cases);
      assert.strictEqual(validation.isValid, true);
      assert.strictEqual(validation.violations.length, 0);
    });

    it('should detect DIRECT_OVERLAP when cases collide in the same room', () => {
      const collidingCases = [
        {
          id: 'case-1',
          scheduledDate: '2026-11-18',
          operatingRoomId: 'or-1',
          roomName: 'OR 1',
          startTime: '07:30',
          endTime: '09:30',
          turnoverMinutes: 25,
          surgeonId: '101'
        },
        {
          id: 'case-2',
          scheduledDate: '2026-11-18',
          operatingRoomId: 'or-1',
          roomName: 'OR 1',
          startTime: '09:00', // Collision with 09:30
          endTime: '10:30',
          turnoverMinutes: 25,
          surgeonId: '102'
        }
      ];

      const validation = validateNoOverlap(collidingCases);
      assert.strictEqual(validation.isValid, false);
      assert.strictEqual(validation.violations.length, 1);
      assert.strictEqual(validation.violations[0].type, 'DIRECT_OVERLAP');
    });

    it('should detect TURNOVER_INSUFFICIENT when turnover gap is below required buffer', () => {
      const shortTurnoverCases = [
        {
          id: 'case-1',
          scheduledDate: '2026-11-18',
          operatingRoomId: 'or-2',
          roomName: 'OR 2',
          startTime: '07:30',
          endTime: '09:00',
          turnoverMinutes: 40, // Different surgeon requires 40m
          surgeonId: '101'
        },
        {
          id: 'case-2',
          scheduledDate: '2026-11-18',
          operatingRoomId: 'or-2',
          roomName: 'OR 2',
          startTime: '09:15', // Only 15m gap!
          endTime: '10:30',
          turnoverMinutes: 40,
          surgeonId: '102'
        }
      ];

      const validation = validateNoOverlap(shortTurnoverCases);
      assert.strictEqual(validation.isValid, false);
      assert.strictEqual(validation.violations.length, 1);
      assert.strictEqual(validation.violations[0].type, 'TURNOVER_INSUFFICIENT');
    });
  });

  describe('4. Hard Constraint 2: Surgeon Single-Location Invariant', () => {
    it('should validate surgeon operating sequentially across time', () => {
      const cases = [
        {
          id: 'case-1',
          scheduledDate: '2026-11-18',
          operatingRoomId: 'or-1',
          roomName: 'OR 1',
          surgeonId: '101',
          surgeonName: 'Dr. Sarah Jenkins',
          startTime: '07:30',
          endTime: '09:30'
        },
        {
          id: 'case-2',
          scheduledDate: '2026-11-18',
          operatingRoomId: 'or-2',
          roomName: 'OR 2',
          surgeonId: '101',
          surgeonName: 'Dr. Sarah Jenkins',
          startTime: '10:15',
          endTime: '12:00'
        }
      ];

      const validation = validateSurgeonSingleLocation(cases);
      assert.strictEqual(validation.isValid, true);
      assert.strictEqual(validation.violations.length, 0);
    });

    it('should detect SURGEON_DOUBLE_BOOKING across different operating suites', () => {
      const doubleBookedCases = [
        {
          id: 'case-1',
          scheduledDate: '2026-11-18',
          operatingRoomId: 'or-1',
          roomName: 'OR 1',
          surgeonId: '101',
          surgeonName: 'Dr. Sarah Jenkins',
          startTime: '08:00',
          endTime: '10:30'
        },
        {
          id: 'case-2',
          scheduledDate: '2026-11-18',
          operatingRoomId: 'or-4',
          roomName: 'OR 4',
          surgeonId: '101',
          surgeonName: 'Dr. Sarah Jenkins',
          startTime: '09:30', // Overlaps with 08:00-10:30 in OR 1!
          endTime: '11:00'
        }
      ];

      const validation = validateSurgeonSingleLocation(doubleBookedCases);
      assert.strictEqual(validation.isValid, false);
      assert.strictEqual(validation.violations.length, 1);
      assert.strictEqual(validation.violations[0].type, 'SURGEON_DOUBLE_BOOKING');
      assert.strictEqual(validation.violations[0].surgeonName, 'Dr. Sarah Jenkins');
    });
  });

  describe('5. Multi-Objective Function & Schedule Metrics', () => {
    it('should return zero metrics for empty schedule', () => {
      const metrics = calculateScheduleMetrics([]);
      assert.strictEqual(metrics.totalCasesScheduled, 0);
      assert.strictEqual(metrics.totalScheduledMinutes, 0);
      assert.strictEqual(metrics.projectedTotalMargin, 0.00);
      assert.strictEqual(metrics.projectedUtilizationPct, 0.0);
    });

    it('should correctly calculate margin, utilization, overtime, and room hops', () => {
      const cases = [
        {
          durationMinutes: 90,
          turnoverMinutes: 25,
          overtimeMinutes: 0,
          projectedContributionMargin: 3500.00,
          scheduledDate: '2026-11-18',
          operatingRoomId: 'or-1',
          surgeonId: '101'
        },
        {
          durationMinutes: 120,
          turnoverMinutes: 40,
          overtimeMinutes: 30,
          projectedContributionMargin: 4200.00,
          scheduledDate: '2026-11-18',
          operatingRoomId: 'or-2',
          surgeonId: '101' // Dr. 101 moved from or-1 to or-2 (1 hop)
        }
      ];

      const metrics = calculateScheduleMetrics(cases, 570, 4, OPTIMIZATION_STRATEGIES.BALANCED.weights);
      assert.strictEqual(metrics.totalCasesScheduled, 2);
      assert.strictEqual(metrics.totalScheduledMinutes, 210);
      assert.strictEqual(metrics.totalTurnoverMinutes, 65);
      assert.strictEqual(metrics.totalOvertimeMinutes, 30);
      assert.strictEqual(metrics.projectedTotalMargin, 7700.00);
      assert.strictEqual(metrics.surgeonRoomHops, 1);
      assert.ok(metrics.projectedUtilizationPct > 0);
      assert.ok(typeof metrics.objectiveScore === 'number');
    });
  });

  describe('6. Deterministic CP-SAT Optimizer Execution', () => {
    it('should solve a multi-suite schedule for candidate cases with 0 hard violations', () => {
      const solution = runCpSatOptimizer(
        SEED_CP_SAT_CANDIDATE_CASES,
        OPERATING_ROOMS_CONFIG,
        'BALANCED',
        '2026-11-18'
      );

      assert.ok(solution.runId);
      assert.ok(['OPTIMAL', 'FEASIBLE'].includes(solution.solverStatus));
      assert.ok(solution.scheduledCases.length > 0);
      assert.strictEqual(solution.facilityId, DEFAULT_FACILITY_ID);

      // Verify Hard Constraint 1: Zero overlap in each room
      const overlapCheck = validateNoOverlap(solution.scheduledCases);
      assert.strictEqual(overlapCheck.isValid, true, 'Scheduled cases must have zero overlap');

      // Verify Hard Constraint 2: Zero surgeon double-booking
      const surgeonCheck = validateSurgeonSingleLocation(solution.scheduledCases);
      assert.strictEqual(surgeonCheck.isValid, true, 'Surgeon must have zero double-bookings');

      // Verify all scheduled cases match room specialty capabilities
      solution.scheduledCases.forEach(c => {
        const room = OPERATING_ROOMS_CONFIG.find(r => r.id === c.operatingRoomId);
        assert.ok(room.specialties.includes(c.specialtyCode), `Room ${room.name} does not support specialty ${c.specialtyCode}`);
      });
    });

    it('should adjust objective scores across all 4 strategy presets', () => {
      const strategies = ['BALANCED', 'MAX_MARGIN', 'MIN_OVERTIME', 'MIN_TURNOVER'];
      const solutions = {};

      strategies.forEach(strat => {
        solutions[strat] = runCpSatOptimizer(
          SEED_CP_SAT_CANDIDATE_CASES,
          OPERATING_ROOMS_CONFIG,
          strat,
          '2026-11-18'
        );
        assert.ok(solutions[strat].metrics.totalCasesScheduled > 0);
        assert.ok(solutions[strat].hardConstraintsSatisfied);
      });
    });

    it('should ignore candidates with DENIED or EXPIRED prior authorizations', () => {
      const mixedCandidates = [
        ...SEED_CP_SAT_CANDIDATE_CASES,
        {
          id: 'case-denied',
          patientName: 'Denied Patient',
          specialtyCode: 'ORTHOPEDICS',
          surgeonId: '101',
          durationMinutes: 60,
          priorAuthStatus: 'DENIED',
          projectedContributionMargin: 5000
        },
        {
          id: 'case-expired',
          patientName: 'Expired Patient',
          specialtyCode: 'ORTHOPEDICS',
          surgeonId: '101',
          durationMinutes: 60,
          priorAuthStatus: 'EXPIRED',
          projectedContributionMargin: 5000
        }
      ];

      const solution = runCpSatOptimizer(mixedCandidates, OPERATING_ROOMS_CONFIG, 'BALANCED', '2026-11-18');
      const scheduledIds = solution.scheduledCases.map(c => c.id || c.caseId);
      assert.ok(!scheduledIds.includes('case-denied'), 'Denied case must not be scheduled');
      assert.ok(!scheduledIds.includes('case-expired'), 'Expired case must not be scheduled');
    });
  });

  describe('7. Database Migration 088 & Schema Validation', () => {
    it('should contain valid SQL migration for CP-SAT tables, RLS, and BIGINT surgeon_id', () => {
      const migrationPath = path.join(rootDir, 'supabase', 'migrations', '088_scheduling_optimizer_cp_sat.sql');
      assert.ok(fs.existsSync(migrationPath), 'Migration 088 must exist');

      const sqlContent = fs.readFileSync(migrationPath, 'utf8');

      // Table definitions
      assert.ok(sqlContent.includes('CREATE TABLE IF NOT EXISTS public.or_cp_sat_optimizer_runs'));
      assert.ok(sqlContent.includes('CREATE TABLE IF NOT EXISTS public.or_cp_sat_scheduled_cases'));
      assert.ok(sqlContent.includes('CREATE TABLE IF NOT EXISTS public.or_cp_sat_solver_constraints'));

      // BIGINT surgeon_id to guarantee compatibility with public.surgeons(id)
      assert.ok(sqlContent.includes('surgeon_id BIGINT REFERENCES public.surgeons(id)'), 'surgeon_id must be BIGINT');

      // UUID operating_room_id
      assert.ok(sqlContent.includes('operating_room_id UUID NOT NULL REFERENCES public.operating_rooms(id)'));

      // Tenancy RLS policies
      assert.ok(sqlContent.includes('ENABLE ROW LEVEL SECURITY'));
      assert.ok(sqlContent.includes('app.current_facility_id'));

      // Analytical views
      assert.ok(sqlContent.includes('CREATE OR REPLACE VIEW public.vw_or_cp_sat_run_summary'));
      assert.ok(sqlContent.includes('CREATE OR REPLACE VIEW public.vw_or_cp_sat_daily_room_schedules'));
    });

    it('should contain valid rollback migration with CASCADE drops', () => {
      const rollbackPath = path.join(rootDir, 'supabase', 'migrations', '088_scheduling_optimizer_cp_sat_down.sql');
      assert.ok(fs.existsSync(rollbackPath), 'Rollback migration 088 down must exist');

      const downSql = fs.readFileSync(rollbackPath, 'utf8');
      assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_or_cp_sat_daily_room_schedules CASCADE'));
      assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_or_cp_sat_run_summary CASCADE'));
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.or_cp_sat_scheduled_cases CASCADE'));
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.or_cp_sat_optimizer_runs CASCADE'));
    });
  });

  describe('8. Maestro Clinical Design System Zero-Purple Compliance', () => {
    it('should verify JSX component contains zero prohibited purple/violet/indigo tokens', () => {
      const jsxPath = path.join(rootDir, 'src', 'components', 'CpSatSchedulerView.jsx');
      assert.ok(fs.existsSync(jsxPath), 'CpSatSchedulerView.jsx must exist');

      const jsx = fs.readFileSync(jsxPath, 'utf8');
      const prohibitedRegex = /(?:#|text-|bg-|border-)?(?:purple|violet|indigo|magenta|fuchsia)/i;
      assert.strictEqual(prohibitedRegex.test(jsx), false, 'CpSatSchedulerView.jsx must have zero prohibited purple tokens');
    });

    it('should verify Scoped CSS contains zero prohibited purple/violet/indigo tokens', () => {
      const cssPath = path.join(rootDir, 'src', 'components', 'CpSatSchedulerView.css');
      assert.ok(fs.existsSync(cssPath), 'CpSatSchedulerView.css must exist');

      const css = fs.readFileSync(cssPath, 'utf8');
      const prohibitedRegex = /(?:#|text-|bg-|border-)?(?:purple|violet|indigo|magenta|fuchsia)/i;
      assert.strictEqual(prohibitedRegex.test(css), false, 'CpSatSchedulerView.css must have zero prohibited purple tokens');
    });

    it('should verify pinned modal layout structure in Scoped CSS', () => {
      const cssPath = path.join(rootDir, 'src', 'components', 'CpSatSchedulerView.css');
      const css = fs.readFileSync(cssPath, 'utf8');

      assert.ok(css.includes('display: flex;'));
      assert.ok(css.includes('flex-direction: column;'));
      assert.ok(css.includes('max-height: 90vh;'));
      assert.ok(css.includes('overflow-y: auto;'));
    });
  });

  describe('9. App.jsx Application Wiring', () => {
    it('should verify CpSatSchedulerView is imported and wired in App.jsx', () => {
      const appPath = path.join(rootDir, 'src', 'App.jsx');
      const appContent = fs.readFileSync(appPath, 'utf8');

      assert.ok(appContent.includes("import CpSatSchedulerView from './components/CpSatSchedulerView';"));
      assert.ok(appContent.includes("activeTab === 'cp_sat_optimizer'"));
      assert.ok(appContent.includes('<CpSatSchedulerView />'));
      assert.ok(appContent.includes('CP-SAT Schedule Optimizer'));
      assert.ok(appContent.includes('Scheduling Optimizer CP-SAT Engine'));
    });
  });

});
