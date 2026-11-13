/**
 * Recoverable Capacity & Opportunity Value Engine (Phase A9)
 * Module 10: OR Scheduling & Utilization Optimization
 * 
 * Provides deterministic mathematical calculations for:
 * - Unused Capacity Decomposition (Actionable Blocks vs Fragmented Wastage)
 * - Actionability Classification (PRIME_ACTIONABLE_BLOCK, MARGINAL_SLOT, FRAGMENTED_STRANDED)
 * - Actionability Ratio (%)
 * - Dual Financial Recovery Modeling:
 *   1. Surgical Case Backfill Yield ($1,250.00/hr)
 *   2. Crew Downstaffing Labor Avoidance ($175.00/hr)
 * - Capacity Recovery Lifecycle Workflows (IDENTIFIED, BACKFILL_PROPOSED, DOWNSTAFFING_INITIATED, RECOVERED)
 */

export const DEFAULT_FACILITY_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
export const DEFAULT_CONTRIBUTION_MARGIN_RATE = 1250.00; // $1,250/hr average facility surgical contribution margin
export const DEFAULT_DOWNSTAFFING_HOURLY_RATE = 175.00;  // $175/hr clinical crew avoided labor expense

export const ACTIONABILITY_TIERS = {
  PRIME_ACTIONABLE_BLOCK: {
    code: 'PRIME_ACTIONABLE_BLOCK',
    label: 'Prime Actionable Block (≥90m, ≥48h)',
    badgeClass: 'badge-emerald',
    description: 'Contiguous unbooked time ≥ 90m with ≥ 48h advance lead time; high backfill yield.'
  },
  MARGINAL_SLOT: {
    code: 'MARGINAL_SLOT',
    label: 'Marginal Slot (60–89m or 24–47h)',
    badgeClass: 'badge-amber',
    description: 'Contiguous time 60–89m or 24–47h lead time; eligible for short cases or staff downstaffing.'
  },
  FRAGMENTED_STRANDED: {
    code: 'FRAGMENTED_STRANDED',
    label: 'Fragmented Stranded Wastage (<60m)',
    badgeClass: 'badge-crimson',
    description: 'Unbookable friction gaps < 60m or < 24h lead time; non-actionable downtime.'
  }
};

export const RECOVERY_PATHWAYS = {
  CASE_BACKFILL: {
    code: 'CASE_BACKFILL',
    label: 'Surgical Case Backfill',
    badgeClass: 'badge-emerald',
    description: 'Pair slot with waitlisted patient; yields incremental surgical contribution margin ($1,250/hr).'
  },
  LABOR_DOWNSTAFFING: {
    code: 'LABOR_DOWNSTAFFING',
    label: 'Clinical Crew Downstaffing',
    badgeClass: 'badge-blue',
    description: 'Release staffed shift when backfill is unachievable > 48h out; avoids idle labor expense ($175/hr).'
  },
  UNRECOVERABLE_FRAGMENT: {
    code: 'UNRECOVERABLE_FRAGMENT',
    label: 'Unrecoverable Friction',
    badgeClass: 'badge-neutral',
    description: 'Fragmented interval cannot be converted into patient cases or staff savings.'
  }
};

export const RECOVERY_STATUSES = {
  IDENTIFIED: {
    code: 'IDENTIFIED',
    label: 'Identified Opportunity',
    badgeClass: 'badge-blue'
  },
  BACKFILL_PROPOSED: {
    code: 'BACKFILL_PROPOSED',
    label: 'Backfill Proposed',
    badgeClass: 'badge-amber'
  },
  DOWNSTAFFING_INITIATED: {
    code: 'DOWNSTAFFING_INITIATED',
    label: 'Downstaffing Notice Sent',
    badgeClass: 'badge-amber'
  },
  RECOVERED: {
    code: 'RECOVERED',
    label: 'Capacity Recovered',
    badgeClass: 'badge-emerald'
  },
  EXPIRED_UNACTIONED: {
    code: 'EXPIRED_UNACTIONED',
    label: 'Expired Unactioned',
    badgeClass: 'badge-crimson'
  }
};

/**
 * Classifies a contiguous unused capacity slot:
 * - PRIME_ACTIONABLE_BLOCK: duration >= minViableDuration (default 90m) AND leadTimeHours >= minLeadTime (default 48h)
 * - MARGINAL_SLOT: duration >= 60m AND leadTimeHours >= 24h
 * - FRAGMENTED_STRANDED: duration < 60m OR leadTimeHours < 24h
 */
export function classifySlotActionability(
  slotDurationMinutes,
  leadTimeHours,
  minViableDurationMinutes = 90,
  minLeadTimeHours = 48
) {
  const dur = Number(slotDurationMinutes) || 0;
  const lead = Number(leadTimeHours) || 0;
  const minDur = Number(minViableDurationMinutes) || 90;
  const minLead = Number(minLeadTimeHours) || 48;

  if (dur >= minDur && lead >= minLead) {
    return {
      isActionable: true,
      actionabilityTier: 'PRIME_ACTIONABLE_BLOCK',
      recommendedPathway: 'CASE_BACKFILL'
    };
  }

  if (dur >= 60 && lead >= 24) {
    return {
      isActionable: true,
      actionabilityTier: 'MARGINAL_SLOT',
      recommendedPathway: lead >= 48 ? 'LABOR_DOWNSTAFFING' : 'CASE_BACKFILL'
    };
  }

  return {
    isActionable: false,
    actionabilityTier: 'FRAGMENTED_STRANDED',
    recommendedPathway: 'UNRECOVERABLE_FRAGMENT'
  };
}

/**
 * Calculates financial recoverable values based on pathway:
 */
export function calculateRecoverableValue(
  slotMinutes,
  recoveryPathway = 'CASE_BACKFILL',
  contributionMarginRate = DEFAULT_CONTRIBUTION_MARGIN_RATE,
  downstaffingRate = DEFAULT_DOWNSTAFFING_HOURLY_RATE
) {
  const mins = Math.max(0, Number(slotMinutes) || 0);
  const cmRate = Math.max(0, Number(contributionMarginRate) || DEFAULT_CONTRIBUTION_MARGIN_RATE);
  const dsRate = Math.max(0, Number(downstaffingRate) || DEFAULT_DOWNSTAFFING_HOURLY_RATE);
  const hours = mins / 60;

  const potentialContributionMargin = Number((hours * cmRate).toFixed(2));
  const avoidedLaborCost = Number((hours * dsRate).toFixed(2));

  let netRecoverableValue = 0.00;
  if (recoveryPathway === 'CASE_BACKFILL') {
    netRecoverableValue = potentialContributionMargin;
  } else if (recoveryPathway === 'LABOR_DOWNSTAFFING') {
    netRecoverableValue = avoidedLaborCost;
  }

  return {
    potentialContributionMargin,
    avoidedLaborCost,
    netRecoverableValue
  };
}

/**
 * Calculates the Actionability Ratio:
 * Ratio = (Actionable Minutes / Total Unused Minutes) * 100
 */
export function calculateActionabilityRatio(actionableMinutes, totalUnusedMinutes) {
  const actionable = Math.max(0, Number(actionableMinutes) || 0);
  const total = Math.max(0, Number(totalUnusedMinutes) || 0);

  if (total <= 0) return 0.0;
  return Number(((actionable / total) * 100).toFixed(1));
}

/**
 * Aggregates facility-wide KPIs for Recoverable Capacity:
 */
export function calculateFacilityCapacityKpis(slots = []) {
  const list = Array.isArray(slots) ? slots : [];
  const totalSlots = list.length;

  if (totalSlots === 0) {
    return {
      totalSlots: 0,
      totalUnusedHours: 0.0,
      actionableSlotsCount: 0,
      actionableHours: 0.0,
      actionabilityRatioPct: 0.0,
      fragmentedWastageHours: 0.0,
      totalPotentialBackfillMargin: 0.00,
      totalPotentialLaborSavings: 0.00,
      totalNetRecoverableValue: 0.00,
      recoveredCount: 0
    };
  }

  const totalUnusedMinutes = list.reduce((acc, s) => acc + (Number(s.slotDurationMinutes) || 0), 0);
  const actionableSlots = list.filter(s => s.isActionable);
  const actionableMinutes = actionableSlots.reduce((acc, s) => acc + (Number(s.slotDurationMinutes) || 0), 0);
  const fragmentedMinutes = totalUnusedMinutes - actionableMinutes;

  const actionabilityRatioPct = calculateActionabilityRatio(actionableMinutes, totalUnusedMinutes);

  const totalPotentialBackfillMargin = Number(
    list.reduce((acc, s) => acc + (Number(s.potentialContributionMargin) || 0), 0).toFixed(2)
  );
  const totalPotentialLaborSavings = Number(
    list.reduce((acc, s) => acc + (Number(s.avoidedLaborCost) || 0), 0).toFixed(2)
  );
  const totalNetRecoverableValue = Number(
    list.reduce((acc, s) => acc + (Number(s.netRecoverableValue) || 0), 0).toFixed(2)
  );

  const recoveredCount = list.filter(s => s.recoveryStatus === 'RECOVERED').length;

  return {
    totalSlots,
    totalUnusedHours: Number((totalUnusedMinutes / 60).toFixed(1)),
    actionableSlotsCount: actionableSlots.length,
    actionableHours: Number((actionableMinutes / 60).toFixed(1)),
    actionabilityRatioPct,
    fragmentedWastageHours: Number((fragmentedMinutes / 60).toFixed(1)),
    totalPotentialBackfillMargin,
    totalPotentialLaborSavings,
    totalNetRecoverableValue,
    recoveredCount
  };
}

/**
 * Filters capacity slots:
 */
export function filterCapacitySlots(slots = [], filters = {}) {
  const { room, actionability, pathway, status, searchQuery } = filters;

  return slots.filter(s => {
    if (room && room !== 'ALL' && s.operatingRoomId !== room) {
      return false;
    }
    if (actionability && actionability !== 'ALL') {
      if (actionability === 'ACTIONABLE' && !s.isActionable) return false;
      if (actionability === 'NON_ACTIONABLE' && s.isActionable) return false;
    }
    if (pathway && pathway !== 'ALL' && s.recoveryPathway !== pathway) {
      return false;
    }
    if (status && status !== 'ALL' && s.recoveryStatus !== status) {
      return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      const matchRoom = s.roomName && s.roomName.toLowerCase().includes(q);
      const matchSpecialty = s.assignedSpecialtyCode && s.assignedSpecialtyCode.toLowerCase().includes(q);
      const matchNotes = s.actionNotes && s.actionNotes.toLowerCase().includes(q);
      if (!matchRoom && !matchSpecialty && !matchNotes) {
        return false;
      }
    }
    return true;
  });
}

// ==============================================================================
// Clinical Realistic Seed Data for Phase A9 Engine Simulation
// ==============================================================================

export const SEED_CAPACITY_SLOTS = [
  {
    id: 'rcs-001',
    facilityId: DEFAULT_FACILITY_ID,
    operatingRoomId: 'or-1',
    roomName: 'OR 1 - Orthopedic / Arthroscopy',
    slotDate: '2026-11-16',
    startTime: '13:00',
    endTime: '17:00',
    slotDurationMinutes: 240, // 4.0 hrs
    isActionable: true,
    actionabilityTier: 'PRIME_ACTIONABLE_BLOCK',
    leadTimeDays: 3.5,
    leadTimeHours: 84,
    recoveryPathway: 'CASE_BACKFILL',
    recoveryStatus: 'IDENTIFIED',
    assignedSpecialtyCode: 'ORTHOPEDICS',
    assignedCaseId: null,
    potentialContributionMargin: 5000.00, // 4 * 1250
    avoidedLaborCost: 700.00, // 4 * 175
    netRecoverableValue: 5000.00,
    actionNotes: 'Early block release surrendered by Dr. Chen; prime 4h afternoon block available for joint replacement backlog.'
  },
  {
    id: 'rcs-002',
    facilityId: DEFAULT_FACILITY_ID,
    operatingRoomId: 'or-1',
    roomName: 'OR 1 - Orthopedic / Arthroscopy',
    slotDate: '2026-11-17',
    startTime: '11:45',
    endTime: '12:15',
    slotDurationMinutes: 30, // 0.5 hrs
    isActionable: false,
    actionabilityTier: 'FRAGMENTED_STRANDED',
    leadTimeDays: 4.5,
    leadTimeHours: 108,
    recoveryPathway: 'UNRECOVERABLE_FRAGMENT',
    recoveryStatus: 'EXPIRED_UNACTIONED',
    assignedSpecialtyCode: 'ORTHOPEDICS',
    assignedCaseId: null,
    potentialContributionMargin: 0.00,
    avoidedLaborCost: 0.00,
    netRecoverableValue: 0.00,
    actionNotes: 'Tiny 30-minute transition gap between arthroscopy cases; unviable for patient booking.'
  },
  {
    id: 'rcs-003',
    facilityId: DEFAULT_FACILITY_ID,
    operatingRoomId: 'or-2',
    roomName: 'OR 2 - Robotic & Minimally Invasive',
    slotDate: '2026-11-16',
    startTime: '08:00',
    endTime: '11:30',
    slotDurationMinutes: 210, // 3.5 hrs
    isActionable: true,
    actionabilityTier: 'PRIME_ACTIONABLE_BLOCK',
    leadTimeDays: 3.5,
    leadTimeHours: 84,
    recoveryPathway: 'CASE_BACKFILL',
    recoveryStatus: 'BACKFILL_PROPOSED',
    assignedSpecialtyCode: 'GENERAL_SURGERY',
    assignedCaseId: 'CASE-2026-9012',
    potentialContributionMargin: 4375.00, // 3.5 * 1250
    avoidedLaborCost: 612.50,
    netRecoverableValue: 4375.00,
    actionNotes: 'Pairing with waitlisted Laparoscopic Inguinal Hernia repair add-on.'
  },
  {
    id: 'rcs-004',
    facilityId: DEFAULT_FACILITY_ID,
    operatingRoomId: 'or-2',
    roomName: 'OR 2 - Robotic & Minimally Invasive',
    slotDate: '2026-11-17',
    startTime: '14:00',
    endTime: '17:00',
    slotDurationMinutes: 180, // 3.0 hrs
    isActionable: true,
    actionabilityTier: 'PRIME_ACTIONABLE_BLOCK',
    leadTimeDays: 4.5,
    leadTimeHours: 108,
    recoveryPathway: 'LABOR_DOWNSTAFFING',
    recoveryStatus: 'DOWNSTAFFING_INITIATED',
    assignedSpecialtyCode: 'GENERAL_SURGERY',
    assignedCaseId: null,
    potentialContributionMargin: 3750.00,
    avoidedLaborCost: 525.00, // 3 * 175
    netRecoverableValue: 525.00,
    actionNotes: 'No surgeon backlog available > 72h out. Shift release approved to capture $525 in clinical crew payroll savings.'
  },
  {
    id: 'rcs-005',
    facilityId: DEFAULT_FACILITY_ID,
    operatingRoomId: 'or-3',
    roomName: 'OR 3 - Ophthalmology Specialty Suite',
    slotDate: '2026-11-16',
    startTime: '10:00',
    endTime: '12:00',
    slotDurationMinutes: 120, // 2.0 hrs
    isActionable: true,
    actionabilityTier: 'PRIME_ACTIONABLE_BLOCK',
    leadTimeDays: 3.5,
    leadTimeHours: 84,
    recoveryPathway: 'CASE_BACKFILL',
    recoveryStatus: 'RECOVERED',
    assignedSpecialtyCode: 'OPHTHALMOLOGY',
    assignedCaseId: 'CASE-2026-9044',
    potentialContributionMargin: 2500.00,
    avoidedLaborCost: 350.00,
    netRecoverableValue: 2500.00,
    actionNotes: 'Successfully scheduled 4 add-on cataract extractions into released block window.'
  },
  {
    id: 'rcs-006',
    facilityId: DEFAULT_FACILITY_ID,
    operatingRoomId: 'or-3',
    roomName: 'OR 3 - Ophthalmology Specialty Suite',
    slotDate: '2026-11-16',
    startTime: '15:30',
    endTime: '16:00',
    slotDurationMinutes: 30, // 0.5 hrs
    isActionable: false,
    actionabilityTier: 'FRAGMENTED_STRANDED',
    leadTimeDays: 3.5,
    leadTimeHours: 84,
    recoveryPathway: 'UNRECOVERABLE_FRAGMENT',
    recoveryStatus: 'EXPIRED_UNACTIONED',
    assignedSpecialtyCode: 'OPHTHALMOLOGY',
    assignedCaseId: null,
    potentialContributionMargin: 0.00,
    avoidedLaborCost: 0.00,
    netRecoverableValue: 0.00,
    actionNotes: 'End-of-day fragmented 30-minute interval.'
  },
  {
    id: 'rcs-007',
    facilityId: DEFAULT_FACILITY_ID,
    operatingRoomId: 'or-4',
    roomName: 'OR 4 - Spine & Pain Procedures',
    slotDate: '2026-11-16',
    startTime: '13:30',
    endTime: '17:00',
    slotDurationMinutes: 210, // 3.5 hrs
    isActionable: true,
    actionabilityTier: 'PRIME_ACTIONABLE_BLOCK',
    leadTimeDays: 3.5,
    leadTimeHours: 84,
    recoveryPathway: 'CASE_BACKFILL',
    recoveryStatus: 'IDENTIFIED',
    assignedSpecialtyCode: 'SPINE_SURGERY',
    assignedCaseId: null,
    potentialContributionMargin: 4375.00,
    avoidedLaborCost: 612.50,
    netRecoverableValue: 4375.00,
    actionNotes: 'Open afternoon spine slot; suitable for single-level discectomy backlog.'
  },
  {
    id: 'rcs-008',
    facilityId: DEFAULT_FACILITY_ID,
    operatingRoomId: 'or-4',
    roomName: 'OR 4 - Spine & Pain Procedures',
    slotDate: '2026-11-17',
    startTime: '12:00',
    endTime: '13:15',
    slotDurationMinutes: 75, // 1.25 hrs
    isActionable: true,
    actionabilityTier: 'MARGINAL_SLOT',
    leadTimeDays: 4.5,
    leadTimeHours: 108,
    recoveryPathway: 'CASE_BACKFILL',
    recoveryStatus: 'IDENTIFIED',
    assignedSpecialtyCode: 'SPINE_SURGERY',
    assignedCaseId: null,
    potentialContributionMargin: 1562.50,
    avoidedLaborCost: 218.75,
    netRecoverableValue: 1562.50,
    actionNotes: '75-minute slot; viable for epidural steroid injection series or radiofrequency ablation.'
  },
  {
    id: 'rcs-009',
    facilityId: DEFAULT_FACILITY_ID,
    operatingRoomId: 'or-1',
    roomName: 'OR 1 - Orthopedic / Arthroscopy',
    slotDate: '2026-11-18',
    startTime: '08:00',
    endTime: '12:00',
    slotDurationMinutes: 240, // 4.0 hrs
    isActionable: true,
    actionabilityTier: 'PRIME_ACTIONABLE_BLOCK',
    leadTimeDays: 5.5,
    leadTimeHours: 132,
    recoveryPathway: 'CASE_BACKFILL',
    recoveryStatus: 'BACKFILL_PROPOSED',
    assignedSpecialtyCode: 'ORTHOPEDICS',
    assignedCaseId: 'CASE-2026-9055',
    potentialContributionMargin: 5000.00,
    avoidedLaborCost: 700.00,
    netRecoverableValue: 5000.00,
    actionNotes: 'Waitlisted rotator cuff repair queued for booking intake.'
  },
  {
    id: 'rcs-010',
    facilityId: DEFAULT_FACILITY_ID,
    operatingRoomId: 'or-2',
    roomName: 'OR 2 - Robotic & Minimally Invasive',
    slotDate: '2026-11-18',
    startTime: '13:00',
    endTime: '14:00',
    slotDurationMinutes: 60, // 1.0 hr
    isActionable: true,
    actionabilityTier: 'MARGINAL_SLOT',
    leadTimeDays: 5.5,
    leadTimeHours: 132,
    recoveryPathway: 'LABOR_DOWNSTAFFING',
    recoveryStatus: 'IDENTIFIED',
    assignedSpecialtyCode: 'GENERAL_SURGERY',
    assignedCaseId: null,
    potentialContributionMargin: 1250.00,
    avoidedLaborCost: 175.00,
    netRecoverableValue: 175.00,
    actionNotes: 'Single 60-minute unbooked period; eligible for early room closure.'
  },
  {
    id: 'rcs-011',
    facilityId: DEFAULT_FACILITY_ID,
    operatingRoomId: 'or-3',
    roomName: 'OR 3 - Ophthalmology Specialty Suite',
    slotDate: '2026-11-18',
    startTime: '11:30',
    endTime: '12:15',
    slotDurationMinutes: 45, // 0.75 hrs
    isActionable: false,
    actionabilityTier: 'FRAGMENTED_STRANDED',
    leadTimeDays: 5.5,
    leadTimeHours: 132,
    recoveryPathway: 'UNRECOVERABLE_FRAGMENT',
    recoveryStatus: 'EXPIRED_UNACTIONED',
    assignedSpecialtyCode: 'OPHTHALMOLOGY',
    assignedCaseId: null,
    potentialContributionMargin: 0.00,
    avoidedLaborCost: 0.00,
    netRecoverableValue: 0.00,
    actionNotes: '45-minute turnover delay fragment.'
  },
  {
    id: 'rcs-012',
    facilityId: DEFAULT_FACILITY_ID,
    operatingRoomId: 'or-4',
    roomName: 'OR 4 - Spine & Pain Procedures',
    slotDate: '2026-11-18',
    startTime: '15:00',
    endTime: '17:00',
    slotDurationMinutes: 120, // 2.0 hrs
    isActionable: true,
    actionabilityTier: 'PRIME_ACTIONABLE_BLOCK',
    leadTimeDays: 5.5,
    leadTimeHours: 132,
    recoveryPathway: 'LABOR_DOWNSTAFFING',
    recoveryStatus: 'DOWNSTAFFING_INITIATED',
    assignedSpecialtyCode: 'SPINE_SURGERY',
    assignedCaseId: null,
    potentialContributionMargin: 2500.00,
    avoidedLaborCost: 350.00,
    netRecoverableValue: 350.00,
    actionNotes: 'Staff downstaffing notice issued 5 days in advance.'
  }
];

export const SEED_ACTIONABILITY_THRESHOLDS = [
  {
    id: 'thresh-001',
    facilityId: DEFAULT_FACILITY_ID,
    specialtyCode: 'ORTHOPEDICS',
    specialtyName: 'Orthopedic Surgery',
    minViableCaseDurationMinutes: 90,
    minLeadTimeHours: 48,
    hourlyContributionMargin: 1350.00,
    hourlyDownstaffingRate: 185.00,
    clinicalRationale: 'Total joints and complex arthroscopy require at least 90m plus sterile tray setup.'
  },
  {
    id: 'thresh-002',
    facilityId: DEFAULT_FACILITY_ID,
    specialtyCode: 'OPHTHALMOLOGY',
    specialtyName: 'Ophthalmology (Eye)',
    minViableCaseDurationMinutes: 45,
    minLeadTimeHours: 24,
    hourlyContributionMargin: 1150.00,
    hourlyDownstaffingRate: 165.00,
    clinicalRationale: 'High-speed cataract cases can be backfilled into 45-minute windows with 24h notice.'
  },
  {
    id: 'thresh-003',
    facilityId: DEFAULT_FACILITY_ID,
    specialtyCode: 'GENERAL_SURGERY',
    specialtyName: 'General Surgery',
    minViableCaseDurationMinutes: 75,
    minLeadTimeHours: 48,
    hourlyContributionMargin: 1250.00,
    hourlyDownstaffingRate: 175.00,
    clinicalRationale: 'Laparoscopic hernia and gallbladder procedures require 75m minimum viable block.'
  },
  {
    id: 'thresh-004',
    facilityId: DEFAULT_FACILITY_ID,
    specialtyCode: 'ENT_OTOLARYNGOLOGY',
    specialtyName: 'ENT / Otolaryngology',
    minViableCaseDurationMinutes: 60,
    minLeadTimeHours: 48,
    hourlyContributionMargin: 1200.00,
    hourlyDownstaffingRate: 170.00,
    clinicalRationale: 'Pediatric tube and tonsillectomy procedures fit efficiently in 60m windows.'
  },
  {
    id: 'thresh-005',
    facilityId: DEFAULT_FACILITY_ID,
    specialtyCode: 'SPINE_SURGERY',
    specialtyName: 'Spine Surgery',
    minViableCaseDurationMinutes: 120,
    minLeadTimeHours: 72,
    hourlyContributionMargin: 1500.00,
    hourlyDownstaffingRate: 200.00,
    clinicalRationale: 'Major spine cases require 120m minimum and 72h advance imaging clearance.'
  },
  {
    id: 'thresh-006',
    facilityId: DEFAULT_FACILITY_ID,
    specialtyCode: 'UROLOGY',
    specialtyName: 'Urology',
    minViableCaseDurationMinutes: 60,
    minLeadTimeHours: 48,
    hourlyContributionMargin: 1250.00,
    hourlyDownstaffingRate: 175.00,
    clinicalRationale: 'Cystoscopy and lithotripsy cases viable in 60m openings.'
  }
];

export default {
  DEFAULT_FACILITY_ID,
  DEFAULT_CONTRIBUTION_MARGIN_RATE,
  DEFAULT_DOWNSTAFFING_HOURLY_RATE,
  ACTIONABILITY_TIERS,
  RECOVERY_PATHWAYS,
  RECOVERY_STATUSES,
  classifySlotActionability,
  calculateRecoverableValue,
  calculateActionabilityRatio,
  calculateFacilityCapacityKpis,
  filterCapacitySlots,
  SEED_CAPACITY_SLOTS,
  SEED_ACTIONABILITY_THRESHOLDS
};

