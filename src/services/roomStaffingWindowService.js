/**
 * Room Staffing Windows & Utilization Denominator Engine (Phase A1)
 * Module 10: OR Scheduling & Utilization Optimization
 * 
 * Provides deterministic calculations for recurring operating room shifts,
 * planned closures, overtime extensions, and authoritative net staffed denominator hours.
 */

export const DAYS_OF_WEEK = [
  { day: 0, code: 'SUN', label: 'Sunday', isWeekend: true },
  { day: 1, code: 'MON', label: 'Monday', isWeekend: false },
  { day: 2, code: 'TUE', label: 'Tuesday', isWeekend: false },
  { day: 3, code: 'WED', label: 'Wednesday', isWeekend: false },
  { day: 4, code: 'THU', label: 'Thursday', isWeekend: false },
  { day: 5, code: 'FRI', label: 'Friday', isWeekend: false },
  { day: 6, code: 'SAT', label: 'Saturday', isWeekend: true }
];

export const CLOSURE_TYPES = {
  FACILITY_HOLIDAY: { code: 'FACILITY_HOLIDAY', label: 'Facility Recognized Holiday', defaultDeductionMinutes: 600 },
  PLANNED_MAINTENANCE: { code: 'PLANNED_MAINTENANCE', label: 'Preventive Maintenance / Bio-Clean', defaultDeductionMinutes: 480 },
  HVAC_CERTIFICATION: { code: 'HVAC_CERTIFICATION', label: 'Sterile HVAC & Airflow Certification', defaultDeductionMinutes: 480 },
  STAFF_TRAINING: { code: 'STAFF_TRAINING', label: 'Clinical In-Service & Staff Training', defaultDeductionMinutes: 240 },
  STAFFING_SHORTAGE: { code: 'STAFFING_SHORTAGE', label: 'Clinical Staffing Shortage', defaultDeductionMinutes: 480 },
  EMERGENCY_REPAIR: { code: 'EMERGENCY_REPAIR', label: 'Emergency Facility Repair', defaultDeductionMinutes: 480 }
};

export const EXCEPTION_TYPES = {
  EARLY_START: { code: 'EARLY_START', label: 'Authorized Early Morning Start' },
  OVERTIME_EXTENSION: { code: 'OVERTIME_EXTENSION', label: 'Scheduled Overtime Extension' },
  PARTIAL_CLOSURE: { code: 'PARTIAL_CLOSURE', label: 'Partial Mid-Day Closure' },
  CREW_AUGMENTATION: { code: 'CREW_AUGMENTATION', label: 'Augmented Crew Deployment' }
};

export const MIN_SHIFT_MINUTES = 120; // 2.0 hours
export const MAX_SHIFT_MINUTES = 720; // 12.0 hours

/**
 * Calculates duration in minutes between two 'HH:MM:SS' or 'HH:MM' time strings
 */
export function calculateShiftMinutes(startTimeStr, endTimeStr) {
  if (!startTimeStr || !endTimeStr) return 0;
  const [sh, sm] = startTimeStr.split(':').map(Number);
  const [eh, em] = endTimeStr.split(':').map(Number);
  const startMin = (sh * 60) + (sm || 0);
  const endMin = (eh * 60) + (em || 0);
  return Math.max(0, endMin - startMin);
}

/**
 * Validates shift parameters against clinical governance invariants
 */
export function validateStaffingWindow(window) {
  const errors = [];
  if (!window.operating_room_id) errors.push('Operating room assignment is required');
  if (typeof window.day_of_week !== 'number' || window.day_of_week < 0 || window.day_of_week > 6) {
    errors.push('Day of week must be between 0 (Sunday) and 6 (Saturday)');
  }

  const durationMin = calculateShiftMinutes(window.start_time, window.end_time);
  if (durationMin < MIN_SHIFT_MINUTES) {
    errors.push(`Shift duration must be at least ${MIN_SHIFT_MINUTES} minutes (2.0 hours)`);
  }
  if (durationMin > MAX_SHIFT_MINUTES) {
    errors.push(`Standard shift duration cannot exceed ${MAX_SHIFT_MINUTES} minutes (12.0 hours)`);
  }

  if ((window.circulator_rn_count || 0) < 1) {
    errors.push('At least 1 licensed Circulating RN is required per staffed window');
  }
  if ((window.scrub_tech_count || 0) < 1) {
    errors.push('At least 1 certified Surgical Technologist is required per staffed window');
  }

  return {
    valid: errors.length === 0,
    errors,
    calculatedMinutes: durationMin
  };
}

/**
 * Baseline Seed Staffing Windows across 6 Austin Surgery Center ORs
 */
export const SEED_STAFFING_WINDOWS = [
  // OR-1: Main Orthopedic & Joint Suite (Mon-Thu 07:00-17:00 [600m], Fri 07:00-15:00 [480m])
  { id: 'w-or1-mon', operating_room_id: 'room-or-1', day_of_week: 1, shift_name: 'Standard Surgical Day', start_time: '07:00', end_time: '17:00', gross_staffed_minutes: 600, circulator_rn_count: 1, scrub_tech_count: 1, anesthesia_provider_count: 1, is_active: true },
  { id: 'w-or1-tue', operating_room_id: 'room-or-1', day_of_week: 2, shift_name: 'Standard Surgical Day', start_time: '07:00', end_time: '17:00', gross_staffed_minutes: 600, circulator_rn_count: 1, scrub_tech_count: 1, anesthesia_provider_count: 1, is_active: true },
  { id: 'w-or1-wed', operating_room_id: 'room-or-1', day_of_week: 3, shift_name: 'Standard Surgical Day', start_time: '07:00', end_time: '17:00', gross_staffed_minutes: 600, circulator_rn_count: 1, scrub_tech_count: 1, anesthesia_provider_count: 1, is_active: true },
  { id: 'w-or1-thu', operating_room_id: 'room-or-1', day_of_week: 4, shift_name: 'Standard Surgical Day', start_time: '07:00', end_time: '17:00', gross_staffed_minutes: 600, circulator_rn_count: 1, scrub_tech_count: 1, anesthesia_provider_count: 1, is_active: true },
  { id: 'w-or1-fri', operating_room_id: 'room-or-1', day_of_week: 5, shift_name: 'Friday Shortened Shift', start_time: '07:00', end_time: '15:00', gross_staffed_minutes: 480, circulator_rn_count: 1, scrub_tech_count: 1, anesthesia_provider_count: 1, is_active: true },

  // OR-2: Spine & Advanced Neuro Suite (Mon-Thu 07:00-17:30 [630m], Fri 07:30-15:30 [480m])
  { id: 'w-or2-mon', operating_room_id: 'room-or-2', day_of_week: 1, shift_name: 'Complex Spine Extended Day', start_time: '07:00', end_time: '17:30', gross_staffed_minutes: 630, circulator_rn_count: 1, scrub_tech_count: 2, anesthesia_provider_count: 1, is_active: true },
  { id: 'w-or2-tue', operating_room_id: 'room-or-2', day_of_week: 2, shift_name: 'Complex Spine Extended Day', start_time: '07:00', end_time: '17:30', gross_staffed_minutes: 630, circulator_rn_count: 1, scrub_tech_count: 2, anesthesia_provider_count: 1, is_active: true },
  { id: 'w-or2-wed', operating_room_id: 'room-or-2', day_of_week: 3, shift_name: 'Complex Spine Extended Day', start_time: '07:00', end_time: '17:30', gross_staffed_minutes: 630, circulator_rn_count: 1, scrub_tech_count: 2, anesthesia_provider_count: 1, is_active: true },
  { id: 'w-or2-thu', operating_room_id: 'room-or-2', day_of_week: 4, shift_name: 'Complex Spine Extended Day', start_time: '07:00', end_time: '17:30', gross_staffed_minutes: 630, circulator_rn_count: 1, scrub_tech_count: 2, anesthesia_provider_count: 1, is_active: true },
  { id: 'w-or2-fri', operating_room_id: 'room-or-2', day_of_week: 5, shift_name: 'Friday Shortened Shift', start_time: '07:30', end_time: '15:30', gross_staffed_minutes: 480, circulator_rn_count: 1, scrub_tech_count: 1, anesthesia_provider_count: 1, is_active: true },

  // OR-3: Robotic & Minimally Invasive (Mon-Fri 07:30-16:30 [540m])
  { id: 'w-or3-mon', operating_room_id: 'room-or-3', day_of_week: 1, shift_name: 'Robotic Standard Day', start_time: '07:30', end_time: '16:30', gross_staffed_minutes: 540, circulator_rn_count: 1, scrub_tech_count: 1, anesthesia_provider_count: 1, is_active: true },
  { id: 'w-or3-tue', operating_room_id: 'room-or-3', day_of_week: 2, shift_name: 'Robotic Standard Day', start_time: '07:30', end_time: '16:30', gross_staffed_minutes: 540, circulator_rn_count: 1, scrub_tech_count: 1, anesthesia_provider_count: 1, is_active: true },
  { id: 'w-or3-wed', operating_room_id: 'room-or-3', day_of_week: 3, shift_name: 'Robotic Standard Day', start_time: '07:30', end_time: '16:30', gross_staffed_minutes: 540, circulator_rn_count: 1, scrub_tech_count: 1, anesthesia_provider_count: 1, is_active: true },
  { id: 'w-or3-thu', operating_room_id: 'room-or-3', day_of_week: 4, shift_name: 'Robotic Standard Day', start_time: '07:30', end_time: '16:30', gross_staffed_minutes: 540, circulator_rn_count: 1, scrub_tech_count: 1, anesthesia_provider_count: 1, is_active: true },
  { id: 'w-or3-fri', operating_room_id: 'room-or-3', day_of_week: 5, shift_name: 'Robotic Standard Day', start_time: '07:30', end_time: '16:30', gross_staffed_minutes: 540, circulator_rn_count: 1, scrub_tech_count: 1, anesthesia_provider_count: 1, is_active: true },

  // OR-4: Ophthalmology & ENT Clean Suite (Mon-Fri 07:00-15:00 [480m])
  { id: 'w-or4-mon', operating_room_id: 'room-or-4', day_of_week: 1, shift_name: 'Ophthalmic High Turnover Day', start_time: '07:00', end_time: '15:00', gross_staffed_minutes: 480, circulator_rn_count: 1, scrub_tech_count: 1, anesthesia_provider_count: 1, is_active: true },
  { id: 'w-or4-tue', operating_room_id: 'room-or-4', day_of_week: 2, shift_name: 'Ophthalmic High Turnover Day', start_time: '07:00', end_time: '15:00', gross_staffed_minutes: 480, circulator_rn_count: 1, scrub_tech_count: 1, anesthesia_provider_count: 1, is_active: true },
  { id: 'w-or4-wed', operating_room_id: 'room-or-4', day_of_week: 3, shift_name: 'Ophthalmic High Turnover Day', start_time: '07:00', end_time: '15:00', gross_staffed_minutes: 480, circulator_rn_count: 1, scrub_tech_count: 1, anesthesia_provider_count: 1, is_active: true },
  { id: 'w-or4-thu', operating_room_id: 'room-or-4', day_of_week: 4, shift_name: 'Ophthalmic High Turnover Day', start_time: '07:00', end_time: '15:00', gross_staffed_minutes: 480, circulator_rn_count: 1, scrub_tech_count: 1, anesthesia_provider_count: 1, is_active: true },
  { id: 'w-or4-fri', operating_room_id: 'room-or-4', day_of_week: 5, shift_name: 'Ophthalmic High Turnover Day', start_time: '07:00', end_time: '15:00', gross_staffed_minutes: 480, circulator_rn_count: 1, scrub_tech_count: 1, anesthesia_provider_count: 1, is_active: true },

  // PROC-1: Pain Management & Fluoroscopy (Mon, Wed, Fri only: 08:00-16:00 [480m])
  { id: 'w-proc1-mon', operating_room_id: 'room-proc-1', day_of_week: 1, shift_name: 'Pain Procedures', start_time: '08:00', end_time: '16:00', gross_staffed_minutes: 480, circulator_rn_count: 1, scrub_tech_count: 1, anesthesia_provider_count: 0, is_active: true },
  { id: 'w-proc1-wed', operating_room_id: 'room-proc-1', day_of_week: 3, shift_name: 'Pain Procedures', start_time: '08:00', end_time: '16:00', gross_staffed_minutes: 480, circulator_rn_count: 1, scrub_tech_count: 1, anesthesia_provider_count: 0, is_active: true },
  { id: 'w-proc1-fri', operating_room_id: 'room-proc-1', day_of_week: 5, shift_name: 'Pain Procedures', start_time: '08:00', end_time: '16:00', gross_staffed_minutes: 480, circulator_rn_count: 1, scrub_tech_count: 1, anesthesia_provider_count: 0, is_active: true },

  // ENDO-1: GI / Endoscopy Suite (Mon-Fri: 07:00-15:30 [510m])
  { id: 'w-endo1-mon', operating_room_id: 'room-endo-1', day_of_week: 1, shift_name: 'Endoscopy Morning/Afternoon', start_time: '07:00', end_time: '15:30', gross_staffed_minutes: 510, circulator_rn_count: 1, scrub_tech_count: 1, anesthesia_provider_count: 1, is_active: true },
  { id: 'w-endo1-tue', operating_room_id: 'room-endo-1', day_of_week: 2, shift_name: 'Endoscopy Morning/Afternoon', start_time: '07:00', end_time: '15:30', gross_staffed_minutes: 510, circulator_rn_count: 1, scrub_tech_count: 1, anesthesia_provider_count: 1, is_active: true },
  { id: 'w-endo1-wed', operating_room_id: 'room-endo-1', day_of_week: 3, shift_name: 'Endoscopy Morning/Afternoon', start_time: '07:00', end_time: '15:30', gross_staffed_minutes: 510, circulator_rn_count: 1, scrub_tech_count: 1, anesthesia_provider_count: 1, is_active: true },
  { id: 'w-endo1-thu', operating_room_id: 'room-endo-1', day_of_week: 4, shift_name: 'Endoscopy Morning/Afternoon', start_time: '07:00', end_time: '15:30', gross_staffed_minutes: 510, circulator_rn_count: 1, scrub_tech_count: 1, anesthesia_provider_count: 1, is_active: true },
  { id: 'w-endo1-fri', operating_room_id: 'room-endo-1', day_of_week: 5, shift_name: 'Endoscopy Morning/Afternoon', start_time: '07:00', end_time: '15:30', gross_staffed_minutes: 510, circulator_rn_count: 1, scrub_tech_count: 1, anesthesia_provider_count: 1, is_active: true }
];

/**
 * Baseline Seed Planned Closures & Exceptions
 */
export const SEED_ROOM_CLOSURES = [
  {
    id: 'c-1',
    operating_room_id: null, // Facility-wide closure
    closure_date: '2026-11-26',
    closure_type: 'FACILITY_HOLIDAY',
    reason: 'Thanksgiving Day — Facility Closed',
    deducted_denominator_minutes: 600,
    is_all_day: true
  },
  {
    id: 'c-2',
    operating_room_id: 'room-or-1',
    closure_date: '2026-11-20',
    closure_type: 'HVAC_CERTIFICATION',
    reason: 'Annual Laminar Flow & Particle Count Recertification',
    deducted_denominator_minutes: 480,
    is_all_day: true
  }
];

export const SEED_ROOM_EXCEPTIONS = [
  {
    id: 'e-1',
    operating_room_id: 'room-or-2',
    exception_date: '2026-11-18',
    exception_type: 'EARLY_START',
    adjusted_start_time: '06:30',
    adjustment_minutes: 30,
    reason: 'Emergency Revision Lumbar Fusion — Authorized Early Start',
    is_overtime_burden: true
  }
];

/**
 * Deterministically compute Net Staffed Available Minutes (The Denominator)
 * for a specific OR or all ORs over an arbitrary date range.
 */
export function calculateNetStaffedMinutes(roomId, startDateStr, endDateStr, windows = SEED_STAFFING_WINDOWS, closures = SEED_ROOM_CLOSURES, exceptions = SEED_ROOM_EXCEPTIONS) {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return {
      net_minutes: 0,
      gross_minutes: 0,
      closure_deductions_minutes: 0,
      exception_minutes: 0,
      net_hours: 0,
      days_count: 0
    };
  }

  let totalGross = 0;
  let totalClosures = 0;
  let totalExceptions = 0;
  let daysCount = 0;

  const cur = new Date(start);
  while (cur <= end) {
    daysCount++;
    const dayOfWeek = cur.getDay(); // 0-6
    const dateStr = cur.toISOString().split('T')[0];

    // Find matching window(s)
    const matchingWindows = windows.filter(w => 
      w.is_active &&
      (roomId === 'ALL' || w.operating_room_id === roomId) &&
      w.day_of_week === dayOfWeek
    );

    matchingWindows.forEach(win => {
      const gross = win.gross_staffed_minutes || 0;
      totalGross += gross;

      // Find closures for this room or facility-wide on this date
      const matchingClosures = closures.filter(c =>
        c.closure_date === dateStr &&
        (c.operating_room_id === null || c.operating_room_id === win.operating_room_id)
      );

      let dayClosureDeduction = 0;
      matchingClosures.forEach(c => {
        if (c.is_all_day) {
          dayClosureDeduction = Math.max(dayClosureDeduction, gross);
        } else {
          dayClosureDeduction += Math.min(gross, c.deducted_denominator_minutes || 0);
        }
      });
      // Cap closure deduction at gross
      dayClosureDeduction = Math.min(gross, dayClosureDeduction);
      totalClosures += dayClosureDeduction;

      // Find exceptions for this room on this date
      const matchingExceptions = exceptions.filter(e =>
        e.exception_date === dateStr &&
        e.operating_room_id === win.operating_room_id
      );

      matchingExceptions.forEach(e => {
        totalExceptions += (e.adjustment_minutes || 0);
      });
    });

    cur.setDate(cur.getDate() + 1);
  }

  const netMinutes = Math.max(0, totalGross - totalClosures + totalExceptions);
  const netHours = Math.round((netMinutes / 60) * 10) / 10;

  return {
    net_minutes: netMinutes,
    gross_minutes: totalGross,
    closure_deductions_minutes: totalClosures,
    exception_minutes: totalExceptions,
    net_hours: netHours,
    days_count: daysCount
  };
}

/**
 * Aggregates weekly facility staffing KPIs
 */
export function calculateFacilityStaffingKpis(rooms = [], windows = SEED_STAFFING_WINDOWS, closures = SEED_ROOM_CLOSURES) {
  const activeWindows = windows.filter(w => w.is_active);
  const totalWeeklyMinutes = activeWindows.reduce((acc, w) => acc + (w.gross_staffed_minutes || 0), 0);
  const totalWeeklyHours = Math.round((totalWeeklyMinutes / 60) * 10) / 10;

  const staffedRoomIds = new Set(activeWindows.map(w => w.operating_room_id));
  const staffedRoomsCount = staffedRoomIds.size;

  const totalShifts = activeWindows.length;
  const avgShiftHours = totalShifts > 0 
    ? Math.round((totalWeeklyMinutes / totalShifts / 60) * 10) / 10 
    : 0;

  // Closures scheduled this month
  const totalClosureHours = Math.round(
    closures.reduce((acc, c) => acc + (c.deducted_denominator_minutes || 0), 0) / 60 * 10
  ) / 10;

  // Peak Day
  const dayMinutes = [0, 0, 0, 0, 0, 0, 0];
  activeWindows.forEach(w => {
    dayMinutes[w.day_of_week] += (w.gross_staffed_minutes || 0);
  });
  let peakDayIdx = 1;
  let maxMin = 0;
  dayMinutes.forEach((m, idx) => {
    if (m > maxMin) {
      maxMin = m;
      peakDayIdx = idx;
    }
  });

  const peakDayObj = DAYS_OF_WEEK.find(d => d.day === peakDayIdx) || DAYS_OF_WEEK[1];
  const peakDayHours = Math.round((maxMin / 60) * 10) / 10;

  return {
    weekly_staffed_hours: totalWeeklyHours,
    weekly_staffed_minutes: totalWeeklyMinutes,
    staffed_rooms_count: staffedRoomsCount,
    avg_daily_shift_hours: avgShiftHours,
    scheduled_closure_hours: totalClosureHours,
    peak_day_name: peakDayObj.label,
    peak_day_hours: peakDayHours,
    total_weekly_shifts: totalShifts
  };
}

