/**
 * OR Utilization Metrics & Benchmarking Engine (Phase A4)
 * Module 10: OR Scheduling & Utilization Optimization
 * 
 * Provides deterministic mathematical calculations for:
 * - Gross Staffed Utilization (%)
 * - Turnover-Inclusive Room Occupancy (%)
 * - Prime-Time Utilization (%)
 * - Adjusted Surgeon Block Utilization (with on-time release deductions)
 * - Financial Yield per Staffed and Utilized OR Hour
 */

export const DEFAULT_FACILITY_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
export const DEFAULT_BENCHMARK_TARGET_PCT = 75.00;
export const MAX_ALLOWABLE_TURNOVER_MINS = 45; // Caps turnover credit to 45 min per changeover

export const BENCHMARK_TIERS = {
  EXCEEDS_BENCHMARK: {
    code: 'EXCEEDS_BENCHMARK',
    label: 'Exceeds Benchmark (≥85%)',
    minPct: 85.00,
    maxPct: 1000.00,
    badgeClass: 'badge-emerald',
    recommendation: 'EXPAND_BLOCK',
    recommendationLabel: 'Candidate for Block Expansion / Prime Allocation'
  },
  MEETS_BENCHMARK: {
    code: 'MEETS_BENCHMARK',
    label: 'Meets Benchmark (75%–84.9%)',
    minPct: 75.00,
    maxPct: 84.99,
    badgeClass: 'badge-blue',
    recommendation: 'MAINTAIN_BLOCK',
    recommendationLabel: 'Maintain Current Block Allocation'
  },
  UNDERUTILIZED_WARNING: {
    code: 'UNDERUTILIZED_WARNING',
    label: 'Underutilized Warning (60%–74.9%)',
    minPct: 60.00,
    maxPct: 74.99,
    badgeClass: 'badge-amber',
    recommendation: 'UTILIZATION_WARNING',
    recommendationLabel: 'Issue Formal 60-Day Utilization Notice'
  },
  CRITICAL_UNDERUTILIZATION: {
    code: 'CRITICAL_UNDERUTILIZATION',
    label: 'Critical Underutilization (<60%)',
    minPct: 0.00,
    maxPct: 59.99,
    badgeClass: 'badge-crimson',
    recommendation: 'REDUCE_OR_FORFEIT',
    recommendationLabel: 'Rightsize Block / Reduce Frequency to Alternate Weeks'
  }
};

/**
 * Calculates raw staffed utilization percentage:
 * Raw Util % = (In-Room Case Minutes / Net Staffed Minutes) * 100
 */
export function calculateRawUtilizationPct(inRoomMinutes, staffedMinutes) {
  const inRoom = Number(inRoomMinutes) || 0;
  const staffed = Number(staffedMinutes) || 0;
  if (staffed <= 0 || inRoom <= 0) return 0.00;
  const pct = (inRoom / staffed) * 100;
  return Number(pct.toFixed(2));
}

/**
 * Calculates turnover-inclusive occupancy percentage:
 * Turnover Util % = ((In-Room Case Minutes + Capped Turnover Minutes) / Net Staffed Minutes) * 100
 */
export function calculateTurnoverInclusivePct(inRoomMinutes, turnoverMinutes, staffedMinutes, maxTurnoverCap = MAX_ALLOWABLE_TURNOVER_MINS) {
  const inRoom = Number(inRoomMinutes) || 0;
  const turnover = Math.min(Number(turnoverMinutes) || 0, maxTurnoverCap * 10); // cap per day
  const staffed = Number(staffedMinutes) || 0;
  if (staffed <= 0) return 0.00;
  const pct = ((inRoom + turnover) / staffed) * 100;
  return Number(pct.toFixed(2));
}

/**
 * Calculates prime-time utilization percentage:
 * Prime Util % = (Prime-Time Case Minutes / Prime-Time Staffed Minutes) * 100
 */
export function calculatePrimeTimeUtilizationPct(primeCaseMinutes, primeStaffedMinutes = 480) {
  const primeCase = Number(primeCaseMinutes) || 0;
  const primeStaffed = Number(primeStaffedMinutes) || 480;
  if (primeStaffed <= 0 || primeCase <= 0) return 0.00;
  const pct = (primeCase / primeStaffed) * 100;
  return Number(pct.toFixed(2));
}

/**
 * Calculates adjusted surgeon block utilization with statutory on-time surrender deduction:
 * Net Denominator = Allocated Minutes - On-Time Released Minutes
 * Block Util % = (Utilized In-Block Minutes / Net Denominator) * 100
 */
export function calculateBlockUtilization(utilizedInBlockMinutes, allocatedBlockMinutes, onTimeReleasedMinutes = 0) {
  const utilized = Number(utilizedInBlockMinutes) || 0;
  const allocated = Number(allocatedBlockMinutes) || 0;
  const onTimeReleased = Number(onTimeReleasedMinutes) || 0;

  const netDenominator = Math.max(0, allocated - onTimeReleased);

  if (netDenominator === 0) {
    return {
      netDenominatorMinutes: 0,
      utilizationPct: 100.00,
      isFullyExcused: true,
      displayNote: '100% On-Time Surrendered (Excused Denominator)'
    };
  }

  const pct = Number(((utilized / netDenominator) * 100).toFixed(2));
  return {
    netDenominatorMinutes: netDenominator,
    utilizationPct: pct,
    isFullyExcused: false,
    displayNote: `${utilized}m used of ${netDenominator}m net block (${onTimeReleased}m on-time released)`
  };
}

/**
 * Determines compliance tier based on utilization percentage against target
 */
export function determineUtilizationTier(utilizationPct, targetPct = DEFAULT_BENCHMARK_TARGET_PCT) {
  const val = Number(utilizationPct) || 0;
  if (val >= 85.00) return BENCHMARK_TIERS.EXCEEDS_BENCHMARK;
  if (val >= Number(targetPct)) return BENCHMARK_TIERS.MEETS_BENCHMARK;
  if (val >= 60.00) return BENCHMARK_TIERS.UNDERUTILIZED_WARNING;
  return BENCHMARK_TIERS.CRITICAL_UNDERUTILIZATION;
}

/**
 * Calculates financial yield metrics per OR hour
 */
export function calculateFinancialYieldMetrics(totalRevenue, totalMargin, utilizedMinutes, staffedMinutes) {
  const rev = Number(totalRevenue) || 0;
  const margin = Number(totalMargin) || 0;
  const utilizedHours = (Number(utilizedMinutes) || 0) / 60;
  const staffedHours = (Number(staffedMinutes) || 0) / 60;

  const revenuePerUtilizedHour = utilizedHours > 0 ? Number((rev / utilizedHours).toFixed(2)) : 0.00;
  const marginPerUtilizedHour = utilizedHours > 0 ? Number((margin / utilizedHours).toFixed(2)) : 0.00;
  const marginPerStaffedHour = staffedHours > 0 ? Number((margin / staffedHours).toFixed(2)) : 0.00;

  return {
    revenuePerUtilizedHour,
    marginPerUtilizedHour,
    marginPerStaffedHour,
    utilizedHours: Number(utilizedHours.toFixed(1)),
    staffedHours: Number(staffedHours.toFixed(1))
  };
}

/**
 * Calculates facility-level rollup KPIs from daily room snapshots and block snapshots
 */
export function calculateFacilityUtilizationKpis(dailySnapshots = [], blockSnapshots = []) {
  if (!dailySnapshots.length) {
    return {
      grossStaffedUtilPct: 0.00,
      primeTimeUtilPct: 0.00,
      turnoverInclusivePct: 0.00,
      blockComplianceRatePct: 0.00,
      totalStaffedHours: 0,
      totalInRoomHours: 0,
      totalTurnoverHours: 0,
      totalOvertimeHours: 0,
      totalCasesCount: 0,
      totalRevenue: 0.00,
      totalMargin: 0.00,
      marginPerStaffedHour: 0.00
    };
  }

  const totalStaffedMinutes = dailySnapshots.reduce((acc, d) => acc + Number(d.staffed_minutes || 0), 0);
  const totalInRoomMinutes = dailySnapshots.reduce((acc, d) => acc + Number(d.in_room_case_minutes || 0), 0);
  const totalTurnoverMinutes = dailySnapshots.reduce((acc, d) => acc + Number(d.turnover_minutes || 0), 0);
  const totalPrimeCaseMinutes = dailySnapshots.reduce((acc, d) => acc + Number(d.prime_time_case_minutes || 0), 0);
  const totalPrimeStaffedMinutes = dailySnapshots.reduce((acc, d) => acc + Number(d.prime_time_staffed_minutes || 480), 0);
  const totalOvertimeMinutes = dailySnapshots.reduce((acc, d) => acc + Number(d.overtime_minutes || 0), 0);
  const totalCasesCount = dailySnapshots.reduce((acc, d) => acc + Number(d.case_count || 0), 0);

  const grossStaffedUtilPct = totalStaffedMinutes > 0
    ? Number(((totalInRoomMinutes / totalStaffedMinutes) * 100).toFixed(1))
    : 0.00;

  const turnoverInclusivePct = totalStaffedMinutes > 0
    ? Number((((totalInRoomMinutes + totalTurnoverMinutes) / totalStaffedMinutes) * 100).toFixed(1))
    : 0.00;

  const primeTimeUtilPct = totalPrimeStaffedMinutes > 0
    ? Number(((totalPrimeCaseMinutes / totalPrimeStaffedMinutes) * 100).toFixed(1))
    : 0.00;

  // Block compliance calculation
  const compliantBlocksCount = blockSnapshots.filter(b => b.block_utilization_pct >= b.target_utilization_pct).length;
  const blockComplianceRatePct = blockSnapshots.length > 0
    ? Number(((compliantBlocksCount / blockSnapshots.length) * 100).toFixed(1))
    : 0.00;

  const totalRevenue = blockSnapshots.reduce((acc, b) => acc + Number(b.net_revenue_generated || 0), 0);
  const totalMargin = blockSnapshots.reduce((acc, b) => acc + Number(b.contribution_margin_generated || 0), 0);
  const totalStaffedHours = Number((totalStaffedMinutes / 60).toFixed(1));

  const marginPerStaffedHour = totalStaffedHours > 0
    ? Number((totalMargin / totalStaffedHours).toFixed(2))
    : 0.00;

  return {
    grossStaffedUtilPct,
    primeTimeUtilPct,
    turnoverInclusivePct,
    blockComplianceRatePct,
    totalStaffedHours,
    totalInRoomHours: Number((totalInRoomMinutes / 60).toFixed(1)),
    totalTurnoverHours: Number((totalTurnoverMinutes / 60).toFixed(1)),
    totalOvertimeHours: Number((totalOvertimeMinutes / 60).toFixed(1)),
    totalCasesCount,
    totalRevenue,
    totalMargin,
    marginPerStaffedHour
  };
}

// ==========================================
// SEED DATA: DAILY ROOM UTILIZATION SNAPSHOTS
// ==========================================
export const SEED_DAILY_ROOM_UTILIZATION = [
  {
    id: 'util-or1-today',
    facility_id: DEFAULT_FACILITY_ID,
    operating_room_id: 'room-or-1',
    room_number: 'OR-1',
    room_name: 'Main Orthopedic & Total Joint Suite',
    utilization_date: '2026-11-12',
    staffed_minutes: 600, // 10h (07:00 - 17:00)
    prime_time_staffed_minutes: 480, // 8h
    in_room_case_minutes: 485,
    turnover_minutes: 65,
    prime_time_case_minutes: 410,
    overtime_minutes: 25,
    unutilized_staffed_minutes: 50,
    raw_utilization_pct: 80.83,
    turnover_inclusive_utilization_pct: 91.67,
    prime_time_utilization_pct: 85.42,
    case_count: 5,
    delayed_starts_count: 0
  },
  {
    id: 'util-or2-today',
    facility_id: DEFAULT_FACILITY_ID,
    operating_room_id: 'room-or-2',
    room_number: 'OR-2',
    room_name: 'Minimally Invasive Spine & Neuro Suite',
    utilization_date: '2026-11-12',
    staffed_minutes: 600,
    prime_time_staffed_minutes: 480,
    in_room_case_minutes: 510,
    turnover_minutes: 55,
    prime_time_case_minutes: 430,
    overtime_minutes: 35,
    unutilized_staffed_minutes: 35,
    raw_utilization_pct: 85.00,
    turnover_inclusive_utilization_pct: 94.17,
    prime_time_utilization_pct: 89.58,
    case_count: 3,
    delayed_starts_count: 1
  },
  {
    id: 'util-or3-today',
    facility_id: DEFAULT_FACILITY_ID,
    operating_room_id: 'room-or-3',
    room_number: 'OR-3',
    room_name: 'Cardiovascular & Thoracic Suite',
    utilization_date: '2026-11-12',
    staffed_minutes: 600,
    prime_time_staffed_minutes: 480,
    in_room_case_minutes: 390,
    turnover_minutes: 45,
    prime_time_case_minutes: 360,
    overtime_minutes: 0,
    unutilized_staffed_minutes: 165,
    raw_utilization_pct: 65.00,
    turnover_inclusive_utilization_pct: 72.50,
    prime_time_utilization_pct: 75.00,
    case_count: 4,
    delayed_starts_count: 0
  },
  {
    id: 'util-or4-today',
    facility_id: DEFAULT_FACILITY_ID,
    operating_room_id: 'room-or-4',
    room_number: 'OR-4',
    room_name: 'General & Pediatric Surgery Suite',
    utilization_date: '2026-11-12',
    staffed_minutes: 540, // 9h
    prime_time_staffed_minutes: 480,
    in_room_case_minutes: 420,
    turnover_minutes: 60,
    prime_time_case_minutes: 380,
    overtime_minutes: 0,
    unutilized_staffed_minutes: 60,
    raw_utilization_pct: 77.78,
    turnover_inclusive_utilization_pct: 88.89,
    prime_time_utilization_pct: 79.17,
    case_count: 4,
    delayed_starts_count: 0
  },
  {
    id: 'util-or5-today',
    facility_id: DEFAULT_FACILITY_ID,
    operating_room_id: 'room-or-5',
    room_number: 'OR-5',
    room_name: 'Robotic & Specialized Microsurgery Suite',
    utilization_date: '2026-11-12',
    staffed_minutes: 600,
    prime_time_staffed_minutes: 480,
    in_room_case_minutes: 330,
    turnover_minutes: 50,
    prime_time_case_minutes: 330,
    overtime_minutes: 0,
    unutilized_staffed_minutes: 220,
    raw_utilization_pct: 55.00,
    turnover_inclusive_utilization_pct: 63.33,
    prime_time_utilization_pct: 68.75,
    case_count: 2,
    delayed_starts_count: 0
  },
  {
    id: 'util-proc1-today',
    facility_id: DEFAULT_FACILITY_ID,
    operating_room_id: 'room-proc-1',
    room_number: 'PROC-1',
    room_name: 'Interventional Pain & Minor Procedures',
    utilization_date: '2026-11-12',
    staffed_minutes: 480, // 8h
    prime_time_staffed_minutes: 480,
    in_room_case_minutes: 380,
    turnover_minutes: 40,
    prime_time_case_minutes: 380,
    overtime_minutes: 0,
    unutilized_staffed_minutes: 60,
    raw_utilization_pct: 79.17,
    turnover_inclusive_utilization_pct: 87.50,
    prime_time_utilization_pct: 79.17,
    case_count: 8,
    delayed_starts_count: 0
  },
  {
    id: 'util-endo1-today',
    facility_id: DEFAULT_FACILITY_ID,
    operating_room_id: 'room-endo-1',
    room_number: 'ENDO-1',
    room_name: 'GI & Endoscopy Procedure Suite',
    utilization_date: '2026-11-12',
    staffed_minutes: 480,
    prime_time_staffed_minutes: 480,
    in_room_case_minutes: 410,
    turnover_minutes: 45,
    prime_time_case_minutes: 410,
    overtime_minutes: 0,
    unutilized_staffed_minutes: 25,
    raw_utilization_pct: 85.42,
    turnover_inclusive_utilization_pct: 94.79,
    prime_time_utilization_pct: 85.42,
    case_count: 9,
    delayed_starts_count: 0
  }
];

// ========================================================
// SEED DATA: 90-DAY SURGEON BLOCK UTILIZATION & COMPLIANCE
// ========================================================
export const SEED_SURGEON_BLOCK_UTILIZATION = [
  {
    id: 'sbu-1',
    facility_id: DEFAULT_FACILITY_ID,
    block_definition_id: 'blk-ortho-vance',
    block_name: 'Monday Orthopedic Primary Block',
    operating_room_id: 'room-or-1',
    room_number: 'OR-1',
    surgeon_name: 'Dr. Marcus Vance, MD',
    specialty_code: 'ORTHOPEDICS',
    reporting_period: 'Last 90 Days (Q3/Q4)',
    allocated_block_minutes: 6240, // 13 weeks * 8h = 104 hrs
    on_time_released_minutes: 960,  // 2 full days surrendered >120h prior
    late_released_minutes: 0,
    net_adjusted_denominator_minutes: 5280, // 88 hrs
    utilized_in_block_minutes: 4620, // 77 hrs
    utilized_out_of_block_minutes: 360,
    block_utilization_pct: 87.50,
    target_utilization_pct: 75.00,
    utilization_tier: 'EXCEEDS_BENCHMARK',
    total_cases_performed: 38,
    net_revenue_generated: 412500.00,
    contribution_margin_generated: 236400.00,
    rightsizing_recommendation: 'EXPAND_BLOCK',
    governance_action: 'Candidate for Prime Morning Hours Expansion'
  },
  {
    id: 'sbu-2',
    facility_id: DEFAULT_FACILITY_ID,
    block_definition_id: 'blk-spine-rostova',
    block_name: 'Monday Comprehensive Spine Block',
    operating_room_id: 'room-or-2',
    room_number: 'OR-2',
    surgeon_name: 'Dr. Elena Rostova, MD',
    specialty_code: 'SPINE',
    reporting_period: 'Last 90 Days (Q3/Q4)',
    allocated_block_minutes: 7800, // 13 weeks * 10h = 130 hrs
    on_time_released_minutes: 600,  // 1 day surrendered >120h
    late_released_minutes: 0,
    net_adjusted_denominator_minutes: 7200, // 120 hrs
    utilized_in_block_minutes: 5850, // 97.5 hrs
    utilized_out_of_block_minutes: 240,
    block_utilization_pct: 81.25,
    target_utilization_pct: 75.00,
    utilization_tier: 'MEETS_BENCHMARK',
    total_cases_performed: 24,
    net_revenue_generated: 546000.00,
    contribution_margin_generated: 318000.00,
    rightsizing_recommendation: 'MAINTAIN_BLOCK',
    governance_action: 'Allocation Maintained (Consistently Above Benchmark)'
  },
  {
    id: 'sbu-3',
    facility_id: DEFAULT_FACILITY_ID,
    block_definition_id: 'blk-ortho-group',
    block_name: 'Tuesday Total Joint Arthroplasty Block',
    operating_room_id: 'room-or-1',
    room_number: 'OR-1',
    surgeon_name: 'Austin Joint Replacement Specialists',
    specialty_code: 'ORTHOPEDICS',
    reporting_period: 'Last 90 Days (Q3/Q4)',
    allocated_block_minutes: 6240,
    on_time_released_minutes: 480,
    late_released_minutes: 480,
    net_adjusted_denominator_minutes: 5760, // 96 hrs
    utilized_in_block_minutes: 4420,
    utilized_out_of_block_minutes: 420,
    block_utilization_pct: 76.74,
    target_utilization_pct: 75.00,
    utilization_tier: 'MEETS_BENCHMARK',
    total_cases_performed: 31,
    net_revenue_generated: 388000.00,
    contribution_margin_generated: 214500.00,
    rightsizing_recommendation: 'MAINTAIN_BLOCK',
    governance_action: 'Allocation Maintained (Group Cross-Coverage Active)'
  },
  {
    id: 'sbu-4',
    facility_id: DEFAULT_FACILITY_ID,
    block_definition_id: 'blk-cardio-thornwood',
    block_name: 'Wednesday Vascular & Cardiac Block',
    operating_room_id: 'room-or-3',
    room_number: 'OR-3',
    surgeon_name: 'Dr. Gregory Thornwood, MD',
    specialty_code: 'CARDIOVASCULAR',
    reporting_period: 'Last 90 Days (Q3/Q4)',
    allocated_block_minutes: 5460, // 13 weeks * 7h
    on_time_released_minutes: 420,
    late_released_minutes: 840, // 2 days surrendered late (<120h)
    net_adjusted_denominator_minutes: 5040, // only on-time deducted
    utilized_in_block_minutes: 3220,
    utilized_out_of_block_minutes: 180,
    block_utilization_pct: 63.89,
    target_utilization_pct: 75.00,
    utilization_tier: 'UNDERUTILIZED_WARNING',
    total_cases_performed: 16,
    net_revenue_generated: 295000.00,
    contribution_margin_generated: 142000.00,
    rightsizing_recommendation: 'UTILIZATION_WARNING',
    governance_action: '60-Day Utilization Warning Issued (Late Release Penalties Applied)'
  },
  {
    id: 'sbu-5',
    facility_id: DEFAULT_FACILITY_ID,
    block_definition_id: 'blk-robotics-jenkins',
    block_name: 'Friday Advanced Laparoscopy & Robotic Block',
    operating_room_id: 'room-or-5',
    room_number: 'OR-5',
    surgeon_name: 'Dr. Sarah Jenkins, MD',
    specialty_code: 'GENERAL_SURGERY',
    reporting_period: 'Last 90 Days (Q3/Q4)',
    allocated_block_minutes: 6240,
    on_time_released_minutes: 0,
    late_released_minutes: 1440, // Hoarded or surrendered same-day
    net_adjusted_denominator_minutes: 6240, // No deduction granted
    utilized_in_block_minutes: 3280,
    utilized_out_of_block_minutes: 0,
    block_utilization_pct: 52.56,
    target_utilization_pct: 75.00,
    utilization_tier: 'CRITICAL_UNDERUTILIZATION',
    total_cases_performed: 12,
    net_revenue_generated: 168000.00,
    contribution_margin_generated: 78000.00,
    rightsizing_recommendation: 'REDUCE_OR_FORFEIT',
    governance_action: 'Executive Review: Reduce to Alternate Weeks (Every-Other-Week)'
  }
];

/**
 * Filter daily room utilization snapshots
 */
export function filterRoomUtilization(snapshots = [], filters = {}) {
  const { search, operatingRoomId, minUtilPct } = filters;
  return snapshots.filter(s => {
    if (operatingRoomId && operatingRoomId !== 'ALL' && s.operating_room_id !== operatingRoomId) {
      return false;
    }
    if (minUtilPct !== undefined && minUtilPct !== 'ALL' && s.raw_utilization_pct < Number(minUtilPct)) {
      return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const matchRoom = s.room_number?.toLowerCase().includes(q) || s.room_name?.toLowerCase().includes(q);
      if (!matchRoom) return false;
    }
    return true;
  });
}

/**
 * Filter surgeon block utilization snapshots
 */
export function filterSurgeonBlockUtilization(snapshots = [], filters = {}) {
  const { search, specialtyCode, utilizationTier } = filters;
  return snapshots.filter(s => {
    if (specialtyCode && specialtyCode !== 'ALL' && s.specialty_code !== specialtyCode) {
      return false;
    }
    if (utilizationTier && utilizationTier !== 'ALL' && s.utilization_tier !== utilizationTier) {
      return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const matchSurgeon = s.surgeon_name?.toLowerCase().includes(q) || s.block_name?.toLowerCase().includes(q);
      if (!matchSurgeon) return false;
    }
    return true;
  });
}
