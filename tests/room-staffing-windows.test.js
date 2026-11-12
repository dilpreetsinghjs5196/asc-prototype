/**
 * ==============================================================================
 * PHASE A1: ROOM STAFFING WINDOWS & DENOMINATOR ENGINE TEST SUITE
 * Operational Shifts, Scheduled Closures, Overtime Exceptions & Net Denominators
 * ==============================================================================
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  DAYS_OF_WEEK,
  CLOSURE_TYPES,
  EXCEPTION_TYPES,
  MIN_SHIFT_MINUTES,
  MAX_SHIFT_MINUTES,
  SEED_STAFFING_WINDOWS,
  SEED_ROOM_CLOSURES,
  SEED_ROOM_EXCEPTIONS,
  calculateShiftMinutes,
  validateStaffingWindow,
  calculateNetStaffedMinutes,
  calculateFacilityStaffingKpis
} from '../src/services/roomStaffingWindowService.js';
import { SEED_OPERATING_ROOMS } from '../src/services/operatingRoomModelService.js';

describe('Phase A1 — Room Staffing Windows Test Suite', () => {

  // ============================================================================
  // 1. Taxonomy & Definitions
  // ============================================================================
  describe('1. Taxonomy & Definitions', () => {
    it('should define all 7 days of week with proper indices and weekend flags', () => {
      assert.strictEqual(DAYS_OF_WEEK.length, 7);
      assert.strictEqual(DAYS_OF_WEEK[0].day, 0); // Sunday
      assert.strictEqual(DAYS_OF_WEEK[0].isWeekend, true);
      assert.strictEqual(DAYS_OF_WEEK[1].day, 1); // Monday
      assert.strictEqual(DAYS_OF_WEEK[1].isWeekend, false);
      assert.strictEqual(DAYS_OF_WEEK[6].day, 6); // Saturday
      assert.strictEqual(DAYS_OF_WEEK[6].isWeekend, true);
    });

    it('should define all 6 room closure categories with default deduction minutes', () => {
      const expectedClosures = [
        'FACILITY_HOLIDAY',
        'PLANNED_MAINTENANCE',
        'HVAC_CERTIFICATION',
        'STAFF_TRAINING',
        'STAFFING_SHORTAGE',
        'EMERGENCY_REPAIR'
      ];

      for (const code of expectedClosures) {
        assert.ok(CLOSURE_TYPES[code], `Missing closure type: ${code}`);
        assert.ok(typeof CLOSURE_TYPES[code].defaultDeductionMinutes === 'number');
        assert.ok(CLOSURE_TYPES[code].defaultDeductionMinutes > 0);
      }
    });

    it('should define core shift boundary invariants', () => {
      assert.strictEqual(MIN_SHIFT_MINUTES, 120, 'Minimum shift duration must be 120 minutes (2h)');
      assert.strictEqual(MAX_SHIFT_MINUTES, 720, 'Maximum shift duration must be 720 minutes (12h)');
      assert.ok(EXCEPTION_TYPES.OVERTIME_EXTENSION, 'Must support overtime extension');
      assert.ok(EXCEPTION_TYPES.EARLY_START, 'Must support early start');
    });
  });

  // ============================================================================
  // 2. Shift Duration & Boundary Validation
  // ============================================================================
  describe('2. Shift Duration & Boundary Validation', () => {
    it('calculateShiftMinutes: accurately calculates minutes between times', () => {
      assert.strictEqual(calculateShiftMinutes('07:00', '17:00'), 600); // 10 hours
      assert.strictEqual(calculateShiftMinutes('07:30', '16:00'), 510); // 8.5 hours
      assert.strictEqual(calculateShiftMinutes('08:00', '12:00'), 240); // 4 hours
      assert.strictEqual(calculateShiftMinutes('17:00', '07:00'), 0); // invalid / negative capped at 0
    });

    it('validateStaffingWindow: enforces minimum 120 min duration', () => {
      const shortShift = {
        operating_room_id: 'room-or-1',
        day_of_week: 1,
        start_time: '07:00',
        end_time: '08:30', // 90 min < 120 min
        circulator_rn_count: 1,
        scrub_tech_count: 1
      };
      const res = validateStaffingWindow(shortShift);
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some(e => e.includes('must be at least 120 minutes')));
    });

    it('validateStaffingWindow: enforces core clinical crew minimums', () => {
      const missingCrew = {
        operating_room_id: 'room-or-1',
        day_of_week: 1,
        start_time: '07:00',
        end_time: '17:00',
        circulator_rn_count: 0, // Invalid!
        scrub_tech_count: 0     // Invalid!
      };
      const res = validateStaffingWindow(missingCrew);
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some(e => e.includes('Circulating RN is required')));
      assert.ok(res.errors.some(e => e.includes('Surgical Technologist is required')));
    });

    it('validateStaffingWindow: approves compliant shift parameters', () => {
      const validShift = {
        operating_room_id: 'room-or-1',
        day_of_week: 1,
        start_time: '07:00',
        end_time: '17:00',
        circulator_rn_count: 1,
        scrub_tech_count: 1
      };
      const res = validateStaffingWindow(validShift);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.calculatedMinutes, 600);
    });
  });

  // ============================================================================
  // 3. Authoritative Net Staffed Denominator Engine
  // ============================================================================
  describe('3. Deterministic Denominator Engine', () => {
    it('should compute exact net staffed minutes over a clean week without closures', () => {
      // Mon 2026-11-02 to Fri 2026-11-06 for OR-1:
      // Mon-Thu: 4 x 600m = 2400m
      // Fri: 1 x 480m = 480m
      // Total = 2880m = 48.0 hours
      const result = calculateNetStaffedMinutes(
        'room-or-1',
        '2026-11-02',
        '2026-11-06',
        SEED_STAFFING_WINDOWS,
        [], // no closures
        []  // no exceptions
      );

      assert.strictEqual(result.gross_minutes, 2880);
      assert.strictEqual(result.closure_deductions_minutes, 0);
      assert.strictEqual(result.exception_minutes, 0);
      assert.strictEqual(result.net_minutes, 2880);
      assert.strictEqual(result.net_hours, 48.0);
      assert.strictEqual(result.days_count, 5);
    });

    it('should deduct full-day closure accurately from the denominator', () => {
      // Friday 2026-11-20 is closed for HVAC Recertification (OR-1 is 480m on Fri)
      const mockClosure = [
        {
          id: 'c-test',
          operating_room_id: 'room-or-1',
          closure_date: '2026-11-20',
          closure_type: 'HVAC_CERTIFICATION',
          reason: 'HVAC Recert',
          deducted_denominator_minutes: 480,
          is_all_day: true
        }
      ];

      const result = calculateNetStaffedMinutes(
        'room-or-1',
        '2026-11-16', // Mon
        '2026-11-20', // Fri (closed)
        SEED_STAFFING_WINDOWS,
        mockClosure,
        []
      );

      // Gross = 2400 + 480 = 2880
      // Closure deduction = 480
      // Net = 2400m = 40.0 hours
      assert.strictEqual(result.gross_minutes, 2880);
      assert.strictEqual(result.closure_deductions_minutes, 480);
      assert.strictEqual(result.net_minutes, 2400);
      assert.strictEqual(result.net_hours, 40.0);
    });

    it('should apply facility-wide closures (operating_room_id === null) to all rooms', () => {
      const facilityHoliday = [
        {
          id: 'c-hol',
          operating_room_id: null, // Facility-wide
          closure_date: '2026-11-26', // Thursday
          closure_type: 'FACILITY_HOLIDAY',
          reason: 'Thanksgiving',
          deducted_denominator_minutes: 600,
          is_all_day: true
        }
      ];

      // Test OR-1 on Thursday 2026-11-26
      const resOR1 = calculateNetStaffedMinutes(
        'room-or-1',
        '2026-11-26',
        '2026-11-26',
        SEED_STAFFING_WINDOWS,
        facilityHoliday,
        []
      );
      assert.strictEqual(resOR1.gross_minutes, 600);
      assert.strictEqual(resOR1.closure_deductions_minutes, 600);
      assert.strictEqual(resOR1.net_minutes, 0);

      // Test OR-3 on Thursday 2026-11-26 (shift is 540m)
      const resOR3 = calculateNetStaffedMinutes(
        'room-or-3',
        '2026-11-26',
        '2026-11-26',
        SEED_STAFFING_WINDOWS,
        facilityHoliday,
        []
      );
      assert.strictEqual(resOR3.gross_minutes, 540);
      assert.strictEqual(resOR3.closure_deductions_minutes, 540);
      assert.strictEqual(resOR3.net_minutes, 0);
    });

    it('should augment denominator with authorized overtime exceptions', () => {
      const mockException = [
        {
          id: 'e-test',
          operating_room_id: 'room-or-2',
          exception_date: '2026-11-18', // Wednesday
          exception_type: 'EARLY_START',
          adjustment_minutes: 60, // +1 hour
          reason: 'Emergency early start'
        }
      ];

      // Wednesday 2026-11-18 for OR-2: standard shift is 630m
      const result = calculateNetStaffedMinutes(
        'room-or-2',
        '2026-11-18',
        '2026-11-18',
        SEED_STAFFING_WINDOWS,
        [],
        mockException
      );

      // Gross = 630m, Exception = +60m, Net = 690m (11.5 hours)
      assert.strictEqual(result.gross_minutes, 630);
      assert.strictEqual(result.exception_minutes, 60);
      assert.strictEqual(result.net_minutes, 690);
      assert.strictEqual(result.net_hours, 11.5);
    });

    it('should return 0 for invalid date ranges', () => {
      const result = calculateNetStaffedMinutes('room-or-1', '2026-12-01', '2026-11-01');
      assert.strictEqual(result.net_minutes, 0);
      assert.strictEqual(result.net_hours, 0);
    });
  });

  // ============================================================================
  // 4. Facility Staffing KPIs
  // ============================================================================
  describe('4. Facility Staffing KPIs', () => {
    it('should compute weekly staffed capacity and peak day metrics', () => {
      const kpis = calculateFacilityStaffingKpis(SEED_OPERATING_ROOMS, SEED_STAFFING_WINDOWS, SEED_ROOM_CLOSURES);
      assert.ok(kpis.weekly_staffed_hours > 200, 'Weekly capacity must exceed 200 hours');
      assert.strictEqual(kpis.staffed_rooms_count, 6);
      assert.ok(kpis.avg_daily_shift_hours >= 7.0);
      assert.ok(kpis.peak_day_hours > 0);
      assert.ok(kpis.total_weekly_shifts >= 20);
    });
  });

  // ============================================================================
  // 5. Database Migration 078 Schema Integrity
  // ============================================================================
  describe('5. Database Migration 078 Schema Integrity', () => {
    const upPath = path.resolve(process.cwd(), 'supabase/migrations/078_room_staffing_windows.sql');
    const downPath = path.resolve(process.cwd(), 'supabase/migrations/078_room_staffing_windows_down.sql');

    it('should verify migration 078 UP file exists and creates all 3 tables and views', () => {
      assert.ok(fs.existsSync(upPath), '078_room_staffing_windows.sql must exist');
      const sql = fs.readFileSync(upPath, 'utf8');

      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.room_staffing_windows'));
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.room_closure_events'));
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.room_staffing_exceptions'));
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_room_staffing_weekly_matrix'));
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_room_staffed_capacity_summary'));
    });

    it('should enforce multi-tenant RLS policies using app.current_facility_id', () => {
      const sql = fs.readFileSync(upPath, 'utf8');
      assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'));
      assert.ok(sql.includes("current_setting('app.current_facility_id', true)"));
      assert.ok(sql.includes('rls_rsw_facility'));
      assert.ok(sql.includes('rls_rce_facility'));
      assert.ok(sql.includes('rls_rse_facility'));
    });

    it('should verify rollback migration 078 DOWN cleanly drops all views and child tables', () => {
      assert.ok(fs.existsSync(downPath), '078_room_staffing_windows_down.sql must exist');
      const downSql = fs.readFileSync(downPath, 'utf8');

      assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_room_staffed_capacity_summary CASCADE'));
      assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_room_staffing_weekly_matrix CASCADE'));
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.room_staffing_exceptions CASCADE'));
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.room_closure_events CASCADE'));
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.room_staffing_windows CASCADE'));
    });
  });

  // ============================================================================
  // 6. Maestro Clinical UI & Zero Purple Compliance
  // ============================================================================
  describe('6. Maestro Clinical UI & Zero Purple Compliance', () => {
    const jsxPath = path.resolve(process.cwd(), 'src/components/RoomStaffingWindowsView.jsx');
    const cssPath = path.resolve(process.cwd(), 'src/components/RoomStaffingWindowsView.css');

    it('should verify component JSX exists and contains zero prohibited purple tokens', () => {
      assert.ok(fs.existsSync(jsxPath), 'RoomStaffingWindowsView.jsx must exist');
      const jsx = fs.readFileSync(jsxPath, 'utf8');

      const prohibitedTokens = ['purple', 'violet', 'indigo', 'fuchsia', 'magenta'];
      for (const token of prohibitedTokens) {
        assert.strictEqual(
          jsx.toLowerCase().includes(token),
          false,
          `RoomStaffingWindowsView.jsx contains prohibited design token: ${token}`
        );
      }
    });

    it('should verify scoped CSS exists and contains zero prohibited purple tokens', () => {
      assert.ok(fs.existsSync(cssPath), 'RoomStaffingWindowsView.css must exist');
      const css = fs.readFileSync(cssPath, 'utf8');

      const prohibitedTokens = ['purple', 'violet', 'indigo', 'fuchsia', 'magenta'];
      for (const token of prohibitedTokens) {
        assert.strictEqual(
          css.toLowerCase().includes(token),
          false,
          `RoomStaffingWindowsView.css contains prohibited design token: ${token}`
        );
      }
    });

    it('should verify modal styling is strictly isolated and namespaced', () => {
      const css = fs.readFileSync(cssPath, 'utf8');
      assert.ok(css.includes('.or-staffing-modal-header'));
      assert.ok(css.includes('background-color: #ffffff !important;'));
      assert.ok(css.includes('color: #0f172a !important;'));
      assert.ok(css.includes('.staffing-form-control'));
    });
  });

  // ============================================================================
  // 7. App.jsx Integration Verification
  // ============================================================================
  describe('7. App.jsx Integration Verification', () => {
    const appPath = path.resolve(process.cwd(), 'src/App.jsx');

    it('should verify RoomStaffingWindowsView is wired into App.jsx', () => {
      assert.ok(fs.existsSync(appPath), 'src/App.jsx must exist');
      const appContent = fs.readFileSync(appPath, 'utf8');

      assert.ok(
        appContent.includes("import RoomStaffingWindowsView from './components/RoomStaffingWindowsView';"),
        'Must import RoomStaffingWindowsView in App.jsx'
      );
      assert.ok(
        appContent.includes("activeTab === 'room_staffing'"),
        'Must render RoomStaffingWindowsView on activeTab === "room_staffing"'
      );
      assert.ok(
        appContent.includes("Room Staffing Windows"),
        'Must register Room Staffing Windows in sidebar menu'
      );
    });
  });
});

