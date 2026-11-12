/**
 * Block Utilization Metrics, Release Efficiency & Rightsizing Engine (Phase A5)
 * Module 10: OR Scheduling & Utilization Optimization
 * 
 * Provides deterministic mathematical calculations for:
 * - Adjusted vs Raw Block Utilization (%)
 * - Abandoned / Unused Block Wastage (Minutes & Hours)
 * - Financial Opportunity Cost of Block Hoarding ($)
 * - Release Compliance Rate (%)
 * - Surgeon Block Performance Index (SBPI 0–100)
 * - Automated Medical Executive Committee (MEC) Rightsizing Recommendations
 */

export const DEFAULT_FACILITY_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
export const DEFAULT_HOURLY_CONTRIBUTION_MARGIN = 1250.00; // Average ASC contribution margin per OR hour

export const RIGHTSIZING_ACTIONS = {
  EXPAND_ALLOCATION: {
    code: 'EXPAND_ALLOCATION',
    label: 'Eligible for Block Expansion / Prime Hours',
    badgeClass: 'badge-emerald',
    description: 'High block utilization and strong out-of-block demand justify adding OR time.'
  },
  MAINTAIN: {
    code: 'MAINTAIN',
    label: 'Maintain Current Block Allocation',
    badgeClass: 'badge-blue',
    description: 'Surgeon consistently meets benchmark (≥75%) and releases unused time compliantly.'
  },
  PROBATIONARY_NOTICE: {
    code: 'PROBATIONARY_NOTICE',
    label: 'Formal 60-Day Remediation Warning',
    badgeClass: 'badge-amber',
    description: 'Utilization has dropped below benchmark (60%–74.9%) or chronic late releases detected.'
  },
  RIGHTSIZE_DOWNGRADE: {
    code: 'RIGHTSIZE_DOWNGRADE',
    label: 'Rightsize: Downgrade to Alternate Weeks / Forfeit',
    badgeClass: 'badge-crimson',
    description: 'Critical underutilization (<60%) with high idle wastage warrants immediate rightsizing.'
  }
};

/**
 * Calculates adjusted block utilization percentage:
 * Net Denominator = Allocated Minutes - On-Time Released Minutes
 * Adjusted Util % = (Utilized In-Block Minutes / Net Denominator) * 100
 */
export function calculateAdjustedBlockUtilization(utilizedInBlockMinutes, allocatedBlockMinutes, onTimeReleasedMinutes = 0) {
  const utilized = Number(utilizedInBlockMinutes) || 0;
  const allocated = Number(allocatedBlockMinutes) || 0;
  const onTimeReleased = Number(onTimeReleasedMinutes) || 0;

  const netDenominator = Math.max(0, allocated - onTimeReleased);

  if (netDenominator === 0) {
    return {
      netDenominatorMinutes: 0,
      utilizationPct: 100.00,
      isFullyExcused: true
    };
  }

  const pct = Number(((utilized / netDenominator) * 100).toFixed(2));
  return {
    netDenominatorMinutes: netDenominator,
    utilizationPct: pct,
    isFullyExcused: false
  };
}

/**
 * Calculates raw block utilization (ignoring release credit)
 */
export function calculateRawBlockUtilization(utilizedInBlockMinutes, allocatedBlockMinutes) {
  const utilized = Number(utilizedInBlockMinutes) || 0;
  const allocated = Number(allocatedBlockMinutes) || 0;
  if (allocated <= 0) return 0.00;
  return Number(((utilized / allocated) * 100).toFixed(2));
}

/**
 * Calculates unused abandoned block minutes:
 * Unused = Max(0, Allocated - Utilized - OnTimeReleased - LateReleased)
 */
export function calculateUnusedBlockMinutes(allocatedMinutes, utilizedMinutes, onTimeReleasedMinutes = 0, lateReleasedMinutes = 0) {
  const allocated = Number(allocatedMinutes) || 0;
  const utilized = Number(utilizedMinutes) || 0;
  const onTime = Number(onTimeReleasedMinutes) || 0;
  const late = Number(lateReleasedMinutes) || 0;

  return Math.max(0, allocated - utilized - onTime - late);
}

/**
 * Calculates the financial opportunity cost of hoarded/abandoned block time
 */
export function calculateOpportunityCost(unusedMinutes, hourlyContributionMargin = DEFAULT_HOURLY_CONTRIBUTION_MARGIN) {
  const unused = Number(unusedMinutes) || 0;
  const rate = Number(hourlyContributionMargin) || DEFAULT_HOURLY_CONTRIBUTION_MARGIN;
  const cost = (unused / 60) * rate;
  return Number(cost.toFixed(2));
}

/**
 * Calculates release compliance rate:
 * Ratio of on-time released minutes to total released minutes
 */
export function calculateReleaseCompliance(onTimeReleasedMinutes, lateReleasedMinutes, utilizationPct = 100) {
  const onTime = Number(onTimeReleasedMinutes) || 0;
  const late = Number(lateReleasedMinutes) || 0;
  const total = onTime + late;

  if (total === 0) {
    return Number(utilizationPct) >= 75.0 ? 100.00 : 0.00;
  }

  return Number(((onTime / total) * 100).toFixed(2));
}

/**
 * Calculates the Surgeon Block Performance Index (SBPI 0–100):
 * SBPI = (0.50 * Adjusted Util) + (0.30 * Release Compliance) + (0.20 * Out-of-Block Absorption Ratio)
 */
export function calculateSbpiScore(adjustedUtilPct, releaseCompliancePct, outOfBlockMinutes = 0, allocatedMinutes = 0) {
  const util = Number(adjustedUtilPct) || 0;
  const compliance = Number(releaseCompliancePct) || 0;
  const outOfBlock = Number(outOfBlockMinutes) || 0;
  const allocated = Number(allocatedMinutes) || 0;

  const outOfBlockRatio = allocated > 0 ? Math.min(100, (outOfBlock / allocated) * 100) : 0;
  const sbpi = (0.50 * util) + (0.30 * compliance) + (0.20 * outOfBlockRatio);

  return Number(Math.min(100, Math.max(0, sbpi)).toFixed(1));
}

/**
 * Determines rightsizing recommendation based on SBPI score and adjusted utilization
 */
export function determineRightsizingRecommendation(sbpiScore, adjustedUtilPct) {
  const sbpi = Number(sbpiScore) || 0;
  const util = Number(adjustedUtilPct) || 0;

  if (sbpi >= 85.0 && util >= 85.0) return 'EXPAND_ALLOCATION';
  if (sbpi >= 75.0 && util >= 75.0) return 'MAINTAIN';
  if (sbpi >= 60.0) return 'PROBATIONARY_NOTICE';
  return 'RIGHTSIZE_DOWNGRADE';
}

/**
 * Calculates facility-level aggregate summary KPIs
 */
export function calculateFacilityBlockSummaryKpis(periodLedgers = []) {
  if (!periodLedgers.length) {
    return {
      avgAdjustedUtilPct: 0.00,
      avgReleaseCompliancePct: 0.00,
      totalWastedHours: 0,
      totalOpportunityCost: 0.00,
      probationaryCount: 0,
      expandCandidateCount: 0,
      totalAllocatedHours: 0,
      totalUtilizedHours: 0
    };
  }

  const totalAllocatedMinutes = periodLedgers.reduce((acc, l) => acc + Number(l.allocated_minutes || 0), 0);
  const totalUtilizedMinutes = periodLedgers.reduce((acc, l) => acc + Number(l.utilized_minutes || 0), 0);
  const totalWastedMinutes = periodLedgers.reduce((acc, l) => acc + Number(l.unused_abandoned_minutes || 0), 0);
  const totalCost = periodLedgers.reduce((acc, l) => acc + Number(l.wastage_opportunity_cost || 0), 0);

  const avgAdjustedUtilPct = Number(
    (periodLedgers.reduce((acc, l) => acc + Number(l.adjusted_utilization_pct || 0), 0) / periodLedgers.length).toFixed(1)
  );

  const avgReleaseCompliancePct = Number(
    (periodLedgers.reduce((acc, l) => acc + Number(l.release_compliance_pct || 0), 0) / periodLedgers.length).toFixed(1)
  );

  const probationaryCount = periodLedgers.filter(l => l.rightsizing_action === 'PROBATIONARY_NOTICE').length;
  const expandCandidateCount = periodLedgers.filter(l => l.rightsizing_action === 'EXPAND_ALLOCATION').length;

  return {
    avgAdjustedUtilPct,
    avgReleaseCompliancePct,
    totalWastedHours: Number((totalWastedMinutes / 60).toFixed(1)),
    totalOpportunityCost: totalCost,
    probationaryCount,
    expandCandidateCount,
    totalAllocatedHours: Number((totalAllocatedMinutes / 60).toFixed(1)),
    totalUtilizedHours: Number((totalUtilizedMinutes / 60).toFixed(1))
  };
}

// ==========================================
// SEED DATA: 90-DAY PERIODIC BLOCK LEDGERS
// ==========================================
export const SEED_BLOCK_UTILIZATION_LEDGERS = [
  {
    id: 'bul-1',
    facility_id: DEFAULT_FACILITY_ID,
    block_definition_id: 'blk-ortho-vance',
    block_name: 'Monday Orthopedic Primary Block',
    operating_room_id: 'room-or-1',
    room_number: 'OR-1',
    surgeon_name: 'Dr. Marcus Vance, MD',
    specialty_code: 'ORTHOPEDICS',
    period_type: 'QUARTERLY',
    period_start: '2026-08-01',
    period_end: '2026-10-31',
    allocated_minutes: 6240, // 13 weeks * 8h = 104 hrs
    utilized_minutes: 4620,  // 77 hrs
    on_time_released_minutes: 960,  // 16 hrs (2 full days >120h notice)
    late_released_minutes: 0,
    unused_abandoned_minutes: 660,  // 11 hrs
    out_of_block_minutes: 720,      // 12 hrs demand spillover
    adjusted_utilization_pct: 87.50,
    raw_utilization_pct: 74.04,
    release_compliance_pct: 100.00,
    sbpi_score: 88.1,
    wastage_opportunity_cost: 13750.00, // 11h * $1250
    rightsizing_action: 'EXPAND_ALLOCATION',
    recommendation_notes: 'High out-of-block spillover (12h) and 87.5% utilization warrant +2h expansion or 2nd weekly block.'
  },
  {
    id: 'bul-2',
    facility_id: DEFAULT_FACILITY_ID,
    block_definition_id: 'blk-spine-rostova',
    block_name: 'Monday Comprehensive Spine Block',
    operating_room_id: 'room-or-2',
    room_number: 'OR-2',
    surgeon_name: 'Dr. Elena Rostova, MD',
    specialty_code: 'SPINE',
    period_type: 'QUARTERLY',
    period_start: '2026-08-01',
    period_end: '2026-10-31',
    allocated_minutes: 7800, // 13 weeks * 10h = 130 hrs
    utilized_minutes: 5850,  // 97.5 hrs
    on_time_released_minutes: 600,  // 10 hrs
    late_released_minutes: 0,
    unused_abandoned_minutes: 1350, // 22.5 hrs
    out_of_block_minutes: 300,
    adjusted_utilization_pct: 81.25,
    raw_utilization_pct: 75.00,
    release_compliance_pct: 100.00,
    sbpi_score: 81.4,
    wastage_opportunity_cost: 28125.00,
    rightsizing_action: 'MAINTAIN',
    recommendation_notes: 'Consistent benchmark performance; release compliance is 100%. Allocation maintained.'
  },
  {
    id: 'bul-3',
    facility_id: DEFAULT_FACILITY_ID,
    block_definition_id: 'blk-ortho-group',
    block_name: 'Tuesday Total Joint Arthroplasty Block',
    operating_room_id: 'room-or-1',
    room_number: 'OR-1',
    surgeon_name: 'Austin Joint Replacement Specialists',
    specialty_code: 'ORTHOPEDICS',
    period_type: 'QUARTERLY',
    period_start: '2026-08-01',
    period_end: '2026-10-31',
    allocated_minutes: 6240,
    utilized_minutes: 4420,
    on_time_released_minutes: 480,  // 8h on-time
    late_released_minutes: 480,     // 8h late
    unused_abandoned_minutes: 860,  // 14.3h
    out_of_block_minutes: 480,
    adjusted_utilization_pct: 76.74,
    raw_utilization_pct: 70.83,
    release_compliance_pct: 50.00,
    sbpi_score: 75.1,
    wastage_opportunity_cost: 17916.67,
    rightsizing_action: 'MAINTAIN',
    recommendation_notes: 'Group cross-coverage keeps utilization at 76.7%, but late release frequency requires monitoring.'
  },
  {
    id: 'bul-4',
    facility_id: DEFAULT_FACILITY_ID,
    block_definition_id: 'blk-cardio-thornwood',
    block_name: 'Wednesday Vascular & Cardiac Block',
    operating_room_id: 'room-or-3',
    room_number: 'OR-3',
    surgeon_name: 'Dr. Gregory Thornwood, MD',
    specialty_code: 'CARDIOVASCULAR',
    period_type: 'QUARTERLY',
    period_start: '2026-08-01',
    period_end: '2026-10-31',
    allocated_minutes: 5460, // 13 weeks * 7h
    utilized_minutes: 3220,  // 53.7 hrs
    on_time_released_minutes: 420,
    late_released_minutes: 840,
    unused_abandoned_minutes: 980,  // 16.3 hrs
    out_of_block_minutes: 180,
    adjusted_utilization_pct: 63.89,
    raw_utilization_pct: 58.97,
    release_compliance_pct: 33.33,
    sbpi_score: 64.9,
    wastage_opportunity_cost: 20416.67,
    rightsizing_action: 'PROBATIONARY_NOTICE',
    recommendation_notes: 'Utilization under benchmark (63.9%) and low release compliance (33.3%). 60-day notice issued.'
  },
  {
    id: 'bul-5',
    facility_id: DEFAULT_FACILITY_ID,
    block_definition_id: 'blk-robotics-jenkins',
    block_name: 'Friday Advanced Laparoscopy & Robotic Block',
    operating_room_id: 'room-or-5',
    room_number: 'OR-5',
    surgeon_name: 'Dr. Sarah Jenkins, MD',
    specialty_code: 'GENERAL_SURGERY',
    period_type: 'QUARTERLY',
    period_start: '2026-08-01',
    period_end: '2026-10-31',
    allocated_minutes: 6240,
    utilized_minutes: 3280,  // 54.7 hrs
    on_time_released_minutes: 0,
    late_released_minutes: 1440, // 24 hrs late releases
    unused_abandoned_minutes: 1520, // 25.3 hrs abandoned
    out_of_block_minutes: 0,
    adjusted_utilization_pct: 52.56,
    raw_utilization_pct: 52.56,
    release_compliance_pct: 0.00,
    sbpi_score: 46.3,
    wastage_opportunity_cost: 31666.67,
    rightsizing_action: 'RIGHTSIZE_DOWNGRADE',
    recommendation_notes: 'Critical underutilization (52.6%) and $31.7k opportunity cost. Recommended downgrade to alternate weeks (EOW).'
  }
];

// ==========================================
// SEED DATA: GOVERNANCE COMMITTEE ACTIONS LOG
// ==========================================
export const SEED_BLOCK_GOVERNANCE_ACTIONS = [
  {
    id: 'bga-1',
    facility_id: DEFAULT_FACILITY_ID,
    block_definition_id: 'blk-robotics-jenkins',
    block_name: 'Friday Advanced Laparoscopy & Robotic Block',
    surgeon_name: 'Dr. Sarah Jenkins, MD',
    action_type: 'RIGHTSIZE_DOWNGRADE',
    action_status: 'PENDING_COMMITTEE_REVIEW',
    effective_date: '2026-12-01',
    previous_allocation_minutes: 6240,
    proposed_allocation_minutes: 3120, // Reduce from weekly to EOW
    executive_rationale: '90-day block utilization is 52.6% with zero on-time releases and $31,666 in hoarded block opportunity cost.',
    approved_by: 'Pending Medical Executive Committee Review'
  },
  {
    id: 'bga-2',
    facility_id: DEFAULT_FACILITY_ID,
    block_definition_id: 'blk-ortho-vance',
    block_name: 'Monday Orthopedic Primary Block',
    surgeon_name: 'Dr. Marcus Vance, MD',
    action_type: 'EXPAND_ALLOCATION',
    action_status: 'APPROVED_EXECUTED',
    effective_date: '2026-11-15',
    previous_allocation_minutes: 6240,
    proposed_allocation_minutes: 7800, // +2h extension per week
    executive_rationale: 'Surgeon achieved 87.5% adjusted utilization with 100% on-time release compliance and 12h out-of-block add-on demand.',
    approved_by: 'Dr. Robert Sterling, MD (Chief of Surgery)'
  }
];

/**
 * Filter periodic block utilization ledgers
 */
export function filterBlockLedgers(ledgers = [], filters = {}) {
  const { search, specialtyCode, rightsizingAction } = filters;
  return ledgers.filter(l => {
    if (specialtyCode && specialtyCode !== 'ALL' && l.specialty_code !== specialtyCode) {
      return false;
    }
    if (rightsizingAction && rightsizingAction !== 'ALL' && l.rightsizing_action !== rightsizingAction) {
      return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const matchText = l.surgeon_name?.toLowerCase().includes(q) || l.block_name?.toLowerCase().includes(q);
      if (!matchText) return false;
    }
    return true;
  });
}

