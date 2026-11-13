/**
 * Booking Accuracy & Duration Calibration Engine (Phase A6)
 * Module 10: OR Scheduling & Utilization Optimization
 * 
 * Provides deterministic mathematical calculations for:
 * - Case Duration Variance (Actual vs Booked)
 * - Booking Accuracy Status (ACCURATE, UNDER_ESTIMATED, OVER_ESTIMATED)
 * - Mean Duration Bias (MDB) & Surgeon Scheduling Tendency
 * - Downstream Cascading Delays & Overtime Labor Cost ($450/hr)
 * - Historical CPT Median Duration Benchmarks & Scheduling Calibration Warnings
 */

export const DEFAULT_FACILITY_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
export const DEFAULT_TOLERANCE_MINUTES = 15;
export const DEFAULT_TOLERANCE_PCT = 15.0;
export const DEFAULT_OVERTIME_HOURLY_RATE = 450.00; // Clinical team overtime cost per OR hour

export const ACCURACY_STATUSES = {
  ACCURATE: {
    code: 'ACCURATE',
    label: 'Accurate (±15m)',
    badgeClass: 'badge-emerald',
    description: 'Actual in-room duration fell within 15 minutes of scheduled booking.'
  },
  UNDER_ESTIMATED: {
    code: 'UNDER_ESTIMATED',
    label: 'Under-Estimated (Overrun)',
    badgeClass: 'badge-crimson',
    description: 'Actual duration exceeded booked time by >15 minutes; triggers cascading delays & overtime.'
  },
  OVER_ESTIMATED: {
    code: 'OVER_ESTIMATED',
    label: 'Over-Estimated (Underrun)',
    badgeClass: 'badge-amber',
    description: 'Actual duration finished >15 minutes earlier than booked; leaves unfillable room starvation.'
  }
};

export const SCHEDULING_TENDENCIES = {
  CHRONIC_UNDER_BOOKER: {
    code: 'CHRONIC_UNDER_BOOKER',
    label: 'Chronic Under-Booker (+MDB > 10m)',
    badgeClass: 'badge-crimson',
    description: 'Optimism bias; cases run consistently longer than booked, creating cascading schedule delays.'
  },
  CALIBRATED: {
    code: 'CALIBRATED',
    label: 'Calibrated (MDB ±10m)',
    badgeClass: 'badge-emerald',
    description: 'Surgeon schedules realistically within predictable operating variance.'
  },
  CHRONIC_PADDER: {
    code: 'CHRONIC_PADDER',
    label: 'Chronic Padder (-MDB < -10m)',
    badgeClass: 'badge-amber',
    description: 'Defensive padding; cases finish earlier than booked, stranding unused OR capacity.'
  }
};

export const CALIBRATION_ACTIONS = {
  MANDATORY_CPT_MEDIAN: {
    code: 'MANDATORY_CPT_MEDIAN',
    label: 'Enforce Historical CPT Median',
    badgeClass: 'badge-crimson',
    description: 'Lock scheduling templates to 20-case median actual duration to eliminate persistent delays.'
  },
  EXTEND_DEFAULT_TEMPLATE: {
    code: 'EXTEND_DEFAULT_TEMPLATE',
    label: 'Extend Default Template (+15m)',
    badgeClass: 'badge-amber',
    description: 'Add 15 minutes buffer to surgeon baseline booking template.'
  },
  SHRINK_DEFAULT_TEMPLATE: {
    code: 'SHRINK_DEFAULT_TEMPLATE',
    label: 'Shrink Default Template (-15m)',
    badgeClass: 'badge-amber',
    description: 'Remove 15 minutes of defensive padding to recapture stranded OR capacity.'
  },
  MAINTAIN: {
    code: 'MAINTAIN',
    label: 'Maintain Current Profile',
    badgeClass: 'badge-blue',
    description: 'Surgeon scheduling is well-calibrated; no template adjustment required.'
  }
};

/**
 * Calculates duration variance and percentage:
 * Variance = Actual In-Room Minutes - Scheduled Duration Minutes
 * Variance % = (Variance / Scheduled Duration Minutes) * 100
 */
export function calculateDurationVariance(actualMinutes, scheduledMinutes) {
  const actual = Number(actualMinutes) || 0;
  const scheduled = Number(scheduledMinutes) || 0;

  if (scheduled <= 0) {
    return {
      varianceMinutes: actual,
      variancePct: 0.00
    };
  }

  const varianceMinutes = actual - scheduled;
  const variancePct = Number(((varianceMinutes / scheduled) * 100).toFixed(2));

  return {
    varianceMinutes,
    variancePct
  };
}

/**
 * Classifies case booking accuracy status:
 * - Accurate: |Variance| <= toleranceMinutes (default 15m)
 * - Under-Estimated: Variance > +toleranceMinutes (Case overrun)
 * - Over-Estimated: Variance < -toleranceMinutes (Case underrun)
 */
export function classifyAccuracyStatus(varianceMinutes, toleranceMinutes = DEFAULT_TOLERANCE_MINUTES) {
  const variance = Number(varianceMinutes) || 0;
  const tolerance = Math.abs(Number(toleranceMinutes) || DEFAULT_TOLERANCE_MINUTES);

  if (variance > tolerance) {
    return 'UNDER_ESTIMATED';
  }
  if (variance < -tolerance) {
    return 'OVER_ESTIMATED';
  }
  return 'ACCURATE';
}

/**
 * Calculates Mean Duration Bias (MDB):
 * MDB = (1 / N) * SUM(Actual - Scheduled)
 */
export function calculateMeanDurationBias(caseVariances = []) {
  if (!Array.isArray(caseVariances) || caseVariances.length === 0) {
    return 0.00;
  }
  const sum = caseVariances.reduce((acc, v) => acc + (Number(v) || 0), 0);
  return Number((sum / caseVariances.length).toFixed(2));
}

/**
 * Determines surgeon scheduling tendency from Mean Duration Bias:
 * - Chronic Under-Booker: MDB > +10.0m
 * - Chronic Padder: MDB < -10.0m
 * - Calibrated: -10.0m <= MDB <= +10.0m
 */
export function determineSchedulingTendency(meanDurationBias) {
  const mdb = Number(meanDurationBias) || 0;
  if (mdb > 10.0) {
    return 'CHRONIC_UNDER_BOOKER';
  }
  if (mdb < -10.0) {
    return 'CHRONIC_PADDER';
  }
  return 'CALIBRATED';
}

/**
 * Calculates overtime labor cost for delayed or overrun cases:
 * Cost = (Overtime Minutes / 60) * Hourly Rate
 */
export function calculateOverrunLaborCost(overtimeMinutes, hourlyRate = DEFAULT_OVERTIME_HOURLY_RATE) {
  const mins = Math.max(0, Number(overtimeMinutes) || 0);
  const rate = Math.max(0, Number(hourlyRate) || DEFAULT_OVERTIME_HOURLY_RATE);
  return Number(((mins / 60) * rate).toFixed(2));
}

/**
 * Aggregates high-level facility booking accuracy KPIs.
 */
export function calculateFacilityAccuracyKpis(caseLogs = [], surgeonProfiles = []) {
  const cases = Array.isArray(caseLogs) ? caseLogs : [];
  const profiles = Array.isArray(surgeonProfiles) ? surgeonProfiles : [];

  const totalCases = cases.length;
  const accurateCases = cases.filter(c => c.accuracyStatus === 'ACCURATE').length;
  const underEstimatedCases = cases.filter(c => c.accuracyStatus === 'UNDER_ESTIMATED').length;
  const overEstimatedCases = cases.filter(c => c.accuracyStatus === 'OVER_ESTIMATED').length;

  const overallAccuracyRatePct = totalCases > 0
    ? Number(((accurateCases / totalCases) * 100).toFixed(1))
    : 0.0;

  const totalVariance = cases.reduce((acc, c) => acc + (Number(c.durationVarianceMinutes) || 0), 0);
  const meanDurationBiasMinutes = totalCases > 0
    ? Number((totalVariance / totalCases).toFixed(1))
    : 0.0;

  const totalDownstreamDelayMinutes = cases.reduce((acc, c) => acc + (Number(c.downstreamDelayMinutes) || 0), 0);
  const totalIdleGapMinutes = cases
    .filter(c => c.accuracyStatus === 'OVER_ESTIMATED')
    .reduce((acc, c) => acc + Math.abs(Number(c.durationVarianceMinutes) || 0), 0);

  const totalOvertimeMinutes = cases.reduce((acc, c) => acc + (Number(c.overtimeMinutes) || 0), 0);
  const totalOvertimeLaborCost = cases.reduce((acc, c) => acc + (Number(c.financialLaborImpact) || 0), 0);

  const calibratedSurgeonsCount = profiles.filter(p => p.schedulingTendency === 'CALIBRATED').length;
  const underBookerCount = profiles.filter(p => p.schedulingTendency === 'CHRONIC_UNDER_BOOKER').length;
  const padderCount = profiles.filter(p => p.schedulingTendency === 'CHRONIC_PADDER').length;

  return {
    totalCases,
    accurateCases,
    underEstimatedCases,
    overEstimatedCases,
    overallAccuracyRatePct,
    meanDurationBiasMinutes,
    totalDownstreamDelayMinutes,
    totalIdleGapMinutes,
    totalIdleGapHours: Number((totalIdleGapMinutes / 60).toFixed(1)),
    totalOvertimeMinutes,
    totalOvertimeLaborCost: Number(totalOvertimeLaborCost.toFixed(2)),
    calibratedSurgeonsCount,
    underBookerCount,
    padderCount
  };
}

/**
 * Filters case booking accuracy records.
 */
export function filterBookingAccuracyLogs(logs = [], filters = {}) {
  const { specialty, surgeon, accuracyStatus, searchQuery } = filters;

  return logs.filter(log => {
    if (specialty && specialty !== 'ALL' && log.specialtyCode !== specialty) {
      return false;
    }
    if (surgeon && surgeon !== 'ALL' && log.surgeonName !== surgeon) {
      return false;
    }
    if (accuracyStatus && accuracyStatus !== 'ALL' && log.accuracyStatus !== accuracyStatus) {
      return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      const matchCase = log.caseId && log.caseId.toLowerCase().includes(q);
      const matchSurgeon = log.surgeonName && log.surgeonName.toLowerCase().includes(q);
      const matchProc = log.procedureName && log.procedureName.toLowerCase().includes(q);
      const matchCpt = log.primaryCptCode && log.primaryCptCode.toLowerCase().includes(q);
      if (!matchCase && !matchSurgeon && !matchProc && !matchCpt) {
        return false;
      }
    }
    return true;
  });
}

// ==============================================================================
// Clinical Realistic Seed Data for Phase A6 Engine Simulation
// ==============================================================================

export const SEED_BOOKING_ACCURACY_LOGS = [
  {
    id: 'bacc-001',
    facilityId: DEFAULT_FACILITY_ID,
    caseId: 'CASE-2026-8910',
    surgeryDate: '2026-11-10',
    operatingRoomId: 'or-1',
    roomName: 'OR 1 - Orthopedic / Arthroscopy',
    surgeonName: 'Dr. Robert Chen, MD',
    specialtyCode: 'ORTHOPEDICS',
    primaryCptCode: '29881',
    procedureName: 'Knee Arthroscopy w/ Meniscectomy',
    scheduledDurationMinutes: 60,
    actualInRoomMinutes: 85,
    durationVarianceMinutes: 25,
    variancePct: 41.67,
    accuracyStatus: 'UNDER_ESTIMATED',
    downstreamDelayMinutes: 25,
    causedRoomOvertime: false,
    overtimeMinutes: 0,
    historicalMedianCptMinutes: 82,
    financialLaborImpact: 0.00,
    notes: 'Case ran 25m over scheduled booking; caused delay for subsequent patient admission.'
  },
  {
    id: 'bacc-002',
    facilityId: DEFAULT_FACILITY_ID,
    caseId: 'CASE-2026-8911',
    surgeryDate: '2026-11-10',
    operatingRoomId: 'or-1',
    roomName: 'OR 1 - Orthopedic / Arthroscopy',
    surgeonName: 'Dr. Robert Chen, MD',
    specialtyCode: 'ORTHOPEDICS',
    primaryCptCode: '29827',
    procedureName: 'Rotator Cuff Repair (Arthroscopic)',
    scheduledDurationMinutes: 90,
    actualInRoomMinutes: 125,
    durationVarianceMinutes: 35,
    variancePct: 38.89,
    accuracyStatus: 'UNDER_ESTIMATED',
    downstreamDelayMinutes: 35,
    causedRoomOvertime: true,
    overtimeMinutes: 35,
    historicalMedianCptMinutes: 120,
    financialLaborImpact: 262.50, // (35/60)*450
    notes: 'Complex tear extension. Pushed final turnover past 17:00 staffing window.'
  },
  {
    id: 'bacc-003',
    facilityId: DEFAULT_FACILITY_ID,
    caseId: 'CASE-2026-8912',
    surgeryDate: '2026-11-10',
    operatingRoomId: 'or-2',
    roomName: 'OR 2 - Robotic & Minimally Invasive',
    surgeonName: 'Dr. Sarah Jenkins, MD',
    specialtyCode: 'GENERAL_SURGERY',
    primaryCptCode: '47562',
    procedureName: 'Laparoscopic Cholecystectomy',
    scheduledDurationMinutes: 75,
    actualInRoomMinutes: 72,
    durationVarianceMinutes: -3,
    variancePct: -4.00,
    accuracyStatus: 'ACCURATE',
    downstreamDelayMinutes: 0,
    causedRoomOvertime: false,
    overtimeMinutes: 0,
    historicalMedianCptMinutes: 70,
    financialLaborImpact: 0.00,
    notes: 'Within tolerance window (±15m). Seamless transition to next case.'
  },
  {
    id: 'bacc-004',
    facilityId: DEFAULT_FACILITY_ID,
    caseId: 'CASE-2026-8913',
    surgeryDate: '2026-11-10',
    operatingRoomId: 'or-2',
    roomName: 'OR 2 - Robotic & Minimally Invasive',
    surgeonName: 'Dr. Sarah Jenkins, MD',
    specialtyCode: 'GENERAL_SURGERY',
    primaryCptCode: '49505',
    procedureName: 'Inguinal Hernia Repair (Laparoscopic)',
    scheduledDurationMinutes: 80,
    actualInRoomMinutes: 78,
    durationVarianceMinutes: -2,
    variancePct: -2.50,
    accuracyStatus: 'ACCURATE',
    downstreamDelayMinutes: 0,
    causedRoomOvertime: false,
    overtimeMinutes: 0,
    historicalMedianCptMinutes: 76,
    financialLaborImpact: 0.00,
    notes: 'Well-calibrated scheduling.'
  },
  {
    id: 'bacc-005',
    facilityId: DEFAULT_FACILITY_ID,
    caseId: 'CASE-2026-8914',
    surgeryDate: '2026-11-11',
    operatingRoomId: 'or-3',
    roomName: 'OR 3 - Ophthalmology Specialty Suite',
    surgeonName: 'Dr. Emily Vance, MD',
    specialtyCode: 'OPHTHALMOLOGY',
    primaryCptCode: '66984',
    procedureName: 'Cataract Extracapsular w/ IOL',
    scheduledDurationMinutes: 45,
    actualInRoomMinutes: 24,
    durationVarianceMinutes: -21,
    variancePct: -46.67,
    accuracyStatus: 'OVER_ESTIMATED',
    downstreamDelayMinutes: 0,
    causedRoomOvertime: false,
    overtimeMinutes: 0,
    historicalMedianCptMinutes: 25,
    financialLaborImpact: 0.00,
    notes: 'Chronic defensive padding. Room sat idle for 21 minutes waiting for next pre-op prep.'
  },
  {
    id: 'bacc-006',
    facilityId: DEFAULT_FACILITY_ID,
    caseId: 'CASE-2026-8915',
    surgeryDate: '2026-11-11',
    operatingRoomId: 'or-3',
    roomName: 'OR 3 - Ophthalmology Specialty Suite',
    surgeonName: 'Dr. Emily Vance, MD',
    specialtyCode: 'OPHTHALMOLOGY',
    primaryCptCode: '66984',
    procedureName: 'Cataract Extracapsular w/ IOL',
    scheduledDurationMinutes: 45,
    actualInRoomMinutes: 26,
    durationVarianceMinutes: -19,
    variancePct: -42.22,
    accuracyStatus: 'OVER_ESTIMATED',
    downstreamDelayMinutes: 0,
    causedRoomOvertime: false,
    overtimeMinutes: 0,
    historicalMedianCptMinutes: 25,
    financialLaborImpact: 0.00,
    notes: 'Defensive padding creates artificial OR capacity bottlenecks.'
  },
  {
    id: 'bacc-007',
    facilityId: DEFAULT_FACILITY_ID,
    caseId: 'CASE-2026-8916',
    surgeryDate: '2026-11-11',
    operatingRoomId: 'or-4',
    roomName: 'OR 4 - Spine & Pain Procedures',
    surgeonName: 'Dr. Marcus Thorne, MD',
    specialtyCode: 'SPINE_SURGERY',
    primaryCptCode: '63030',
    procedureName: 'Lumbar Laminotomy / Discectomy',
    scheduledDurationMinutes: 120,
    actualInRoomMinutes: 155,
    durationVarianceMinutes: 35,
    variancePct: 29.17,
    accuracyStatus: 'UNDER_ESTIMATED',
    downstreamDelayMinutes: 35,
    causedRoomOvertime: true,
    overtimeMinutes: 40,
    historicalMedianCptMinutes: 150,
    financialLaborImpact: 300.00, // (40/60)*450
    notes: 'Surgeon regularly under-books spine procedures compared to 20-case historical median.'
  },
  {
    id: 'bacc-008',
    facilityId: DEFAULT_FACILITY_ID,
    caseId: 'CASE-2026-8917',
    surgeryDate: '2026-11-11',
    operatingRoomId: 'or-4',
    roomName: 'OR 4 - Spine & Pain Procedures',
    surgeonName: 'Dr. Marcus Thorne, MD',
    specialtyCode: 'SPINE_SURGERY',
    primaryCptCode: '22612',
    procedureName: 'Posterior Lumbar Arthrodesis',
    scheduledDurationMinutes: 180,
    actualInRoomMinutes: 220,
    durationVarianceMinutes: 40,
    variancePct: 22.22,
    accuracyStatus: 'UNDER_ESTIMATED',
    downstreamDelayMinutes: 40,
    causedRoomOvertime: true,
    overtimeMinutes: 50,
    financialLaborImpact: 375.00, // (50/60)*450
    notes: 'Severe schedule overrun. Nursing overtime incurred.'
  },
  {
    id: 'bacc-009',
    facilityId: DEFAULT_FACILITY_ID,
    caseId: 'CASE-2026-8918',
    surgeryDate: '2026-11-12',
    operatingRoomId: 'or-1',
    roomName: 'OR 1 - Orthopedic / Arthroscopy',
    surgeonName: 'Dr. Kevin Zhao, MD',
    specialtyCode: 'ORTHOPEDICS',
    primaryCptCode: '27447',
    procedureName: 'Total Knee Arthroplasty (Outpatient)',
    scheduledDurationMinutes: 110,
    actualInRoomMinutes: 114,
    durationVarianceMinutes: 4,
    variancePct: 3.64,
    accuracyStatus: 'ACCURATE',
    downstreamDelayMinutes: 0,
    causedRoomOvertime: false,
    overtimeMinutes: 0,
    historicalMedianCptMinutes: 112,
    financialLaborImpact: 0.00,
    notes: 'Highly accurate scheduling; ±4 minutes.'
  },
  {
    id: 'bacc-010',
    facilityId: DEFAULT_FACILITY_ID,
    caseId: 'CASE-2026-8919',
    surgeryDate: '2026-11-12',
    operatingRoomId: 'or-1',
    roomName: 'OR 1 - Orthopedic / Arthroscopy',
    surgeonName: 'Dr. Kevin Zhao, MD',
    specialtyCode: 'ORTHOPEDICS',
    primaryCptCode: '29880',
    procedureName: 'Bicompartmental Knee Arthroscopy',
    scheduledDurationMinutes: 70,
    actualInRoomMinutes: 65,
    durationVarianceMinutes: -5,
    variancePct: -7.14,
    accuracyStatus: 'ACCURATE',
    downstreamDelayMinutes: 0,
    causedRoomOvertime: false,
    overtimeMinutes: 0,
    historicalMedianCptMinutes: 68,
    financialLaborImpact: 0.00,
    notes: 'Calibrated performance.'
  },
  {
    id: 'bacc-011',
    facilityId: DEFAULT_FACILITY_ID,
    caseId: 'CASE-2026-8920',
    surgeryDate: '2026-11-12',
    operatingRoomId: 'or-2',
    roomName: 'OR 2 - Robotic & Minimally Invasive',
    surgeonName: 'Dr. Amanda Foster, MD',
    specialtyCode: 'ENT_OTOLARYNGOLOGY',
    primaryCptCode: '69436',
    procedureName: 'Tympanostomy w/ Tube Insertion',
    scheduledDurationMinutes: 30,
    actualInRoomMinutes: 28,
    durationVarianceMinutes: -2,
    variancePct: -6.67,
    accuracyStatus: 'ACCURATE',
    downstreamDelayMinutes: 0,
    causedRoomOvertime: false,
    overtimeMinutes: 0,
    historicalMedianCptMinutes: 29,
    financialLaborImpact: 0.00,
    notes: 'On target.'
  },
  {
    id: 'bacc-012',
    facilityId: DEFAULT_FACILITY_ID,
    caseId: 'CASE-2026-8921',
    surgeryDate: '2026-11-12',
    operatingRoomId: 'or-2',
    roomName: 'OR 2 - Robotic & Minimally Invasive',
    surgeonName: 'Dr. Amanda Foster, MD',
    specialtyCode: 'ENT_OTOLARYNGOLOGY',
    primaryCptCode: '42820',
    procedureName: 'Tonsillectomy and Adenoidectomy',
    scheduledDurationMinutes: 50,
    actualInRoomMinutes: 48,
    durationVarianceMinutes: -2,
    variancePct: -4.00,
    accuracyStatus: 'ACCURATE',
    downstreamDelayMinutes: 0,
    causedRoomOvertime: false,
    overtimeMinutes: 0,
    historicalMedianCptMinutes: 50,
    financialLaborImpact: 0.00,
    notes: 'Optimal duration calibration.'
  }
];

export const SEED_SURGEON_BOOKING_PROFILES = [
  {
    id: 'prof-001',
    facilityId: DEFAULT_FACILITY_ID,
    surgeonName: 'Dr. Robert Chen, MD',
    specialtyCode: 'ORTHOPEDICS',
    evaluatedCasesCount: 42,
    accurateCasesCount: 18,
    underEstimatedCasesCount: 22,
    overEstimatedCasesCount: 2,
    overallAccuracyRatePct: 42.86,
    meanDurationBiasMinutes: 21.40,
    schedulingTendency: 'CHRONIC_UNDER_BOOKER',
    totalOverrunMinutes: 580,
    totalIdleGapMinutes: 35,
    netFinancialDelayImpact: 4350.00,
    calibrationAction: 'MANDATORY_CPT_MEDIAN',
    lastReviewedAt: '2026-11-08T14:30:00Z',
    clinicalJustification: 'Under-books arthroscopy by 20–25m consistently, causing chronic schedule delays.'
  },
  {
    id: 'prof-002',
    facilityId: DEFAULT_FACILITY_ID,
    surgeonName: 'Dr. Marcus Thorne, MD',
    specialtyCode: 'SPINE_SURGERY',
    evaluatedCasesCount: 28,
    accurateCasesCount: 10,
    underEstimatedCasesCount: 16,
    overEstimatedCasesCount: 2,
    overallAccuracyRatePct: 35.71,
    meanDurationBiasMinutes: 28.50,
    schedulingTendency: 'CHRONIC_UNDER_BOOKER',
    totalOverrunMinutes: 690,
    totalIdleGapMinutes: 40,
    netFinancialDelayImpact: 5175.00,
    calibrationAction: 'MANDATORY_CPT_MEDIAN',
    lastReviewedAt: '2026-11-05T09:15:00Z',
    clinicalJustification: 'Major spine cases routinely run 30–45m over booked duration. Staff overtime driver.'
  },
  {
    id: 'prof-003',
    facilityId: DEFAULT_FACILITY_ID,
    surgeonName: 'Dr. Emily Vance, MD',
    specialtyCode: 'OPHTHALMOLOGY',
    evaluatedCasesCount: 56,
    accurateCasesCount: 20,
    underEstimatedCasesCount: 4,
    overEstimatedCasesCount: 32,
    overallAccuracyRatePct: 35.71,
    meanDurationBiasMinutes: -18.20,
    schedulingTendency: 'CHRONIC_PADDER',
    totalOverrunMinutes: 45,
    totalIdleGapMinutes: 620,
    netFinancialDelayImpact: 337.50,
    calibrationAction: 'SHRINK_DEFAULT_TEMPLATE',
    lastReviewedAt: '2026-11-09T16:00:00Z',
    clinicalJustification: 'Pads cataract cases by 20 minutes each; leaves room idle for 3+ hours per block.'
  },
  {
    id: 'prof-004',
    facilityId: DEFAULT_FACILITY_ID,
    surgeonName: 'Dr. Sarah Jenkins, MD',
    specialtyCode: 'GENERAL_SURGERY',
    evaluatedCasesCount: 48,
    accurateCasesCount: 41,
    underEstimatedCasesCount: 4,
    overEstimatedCasesCount: 3,
    overallAccuracyRatePct: 85.42,
    meanDurationBiasMinutes: 1.20,
    schedulingTendency: 'CALIBRATED',
    totalOverrunMinutes: 55,
    totalIdleGapMinutes: 45,
    netFinancialDelayImpact: 412.50,
    calibrationAction: 'MAINTAIN',
    lastReviewedAt: '2026-11-10T11:00:00Z',
    clinicalJustification: 'Highly calibrated booking profile; variance well within normal distribution.'
  },
  {
    id: 'prof-005',
    facilityId: DEFAULT_FACILITY_ID,
    surgeonName: 'Dr. Kevin Zhao, MD',
    specialtyCode: 'ORTHOPEDICS',
    evaluatedCasesCount: 36,
    accurateCasesCount: 31,
    underEstimatedCasesCount: 3,
    overEstimatedCasesCount: 2,
    overallAccuracyRatePct: 86.11,
    meanDurationBiasMinutes: 2.10,
    schedulingTendency: 'CALIBRATED',
    totalOverrunMinutes: 40,
    totalIdleGapMinutes: 30,
    netFinancialDelayImpact: 300.00,
    calibrationAction: 'MAINTAIN',
    lastReviewedAt: '2026-11-10T10:30:00Z',
    clinicalJustification: 'Excellent timing precision; low room turnover delay impact.'
  },
  {
    id: 'prof-006',
    facilityId: DEFAULT_FACILITY_ID,
    surgeonName: 'Dr. Amanda Foster, MD',
    specialtyCode: 'ENT_OTOLARYNGOLOGY',
    evaluatedCasesCount: 34,
    accurateCasesCount: 30,
    underEstimatedCasesCount: 2,
    overEstimatedCasesCount: 2,
    overallAccuracyRatePct: 88.24,
    meanDurationBiasMinutes: -1.50,
    schedulingTendency: 'CALIBRATED',
    totalOverrunMinutes: 25,
    totalIdleGapMinutes: 35,
    netFinancialDelayImpact: 187.50,
    calibrationAction: 'MAINTAIN',
    lastReviewedAt: '2026-11-11T13:45:00Z',
    clinicalJustification: 'ENT procedures highly calibrated to historical 20-case actual medians.'
  }
];

export const SEED_CPT_CALIBRATION_BENCHMARKS = [
  {
    cptCode: '29881',
    procedureName: 'Knee Arthroscopy w/ Meniscectomy',
    specialtyCode: 'ORTHOPEDICS',
    standardBookedMinutes: 60,
    historical20CaseMedianMinutes: 82,
    discrepancyMinutes: 22,
    warningStatus: 'DURATION_DISCREPANCY_WARNING',
    recommendation: 'Increase template from 60m to 80m (+20m) to stop cascade overrun.'
  },
  {
    cptCode: '29827',
    procedureName: 'Rotator Cuff Repair (Arthroscopic)',
    specialtyCode: 'ORTHOPEDICS',
    standardBookedMinutes: 90,
    historical20CaseMedianMinutes: 120,
    discrepancyMinutes: 30,
    warningStatus: 'DURATION_DISCREPANCY_WARNING',
    recommendation: 'Increase template from 90m to 120m (+30m) for rotator cuff repairs.'
  },
  {
    cptCode: '66984',
    procedureName: 'Cataract Extracapsular w/ IOL',
    specialtyCode: 'OPHTHALMOLOGY',
    standardBookedMinutes: 45,
    historical20CaseMedianMinutes: 25,
    discrepancyMinutes: -20,
    warningStatus: 'DURATION_DISCREPANCY_WARNING',
    recommendation: 'Reduce template from 45m to 25m (-20m); recapture 2.5 hours per block day.'
  },
  {
    cptCode: '63030',
    procedureName: 'Lumbar Laminotomy / Discectomy',
    specialtyCode: 'SPINE_SURGERY',
    standardBookedMinutes: 120,
    historical20CaseMedianMinutes: 150,
    discrepancyMinutes: 30,
    warningStatus: 'DURATION_DISCREPANCY_WARNING',
    recommendation: 'Adjust baseline booking to 150m (+30m) to prevent routine nursing overtime.'
  },
  {
    cptCode: '47562',
    procedureName: 'Laparoscopic Cholecystectomy',
    specialtyCode: 'GENERAL_SURGERY',
    standardBookedMinutes: 75,
    historical20CaseMedianMinutes: 70,
    discrepancyMinutes: -5,
    warningStatus: 'CALIBRATED',
    recommendation: 'Booking time aligns with historical surgical actuals.'
  },
  {
    cptCode: '69436',
    procedureName: 'Tympanostomy w/ Tube Insertion',
    specialtyCode: 'ENT_OTOLARYNGOLOGY',
    standardBookedMinutes: 30,
    historical20CaseMedianMinutes: 29,
    discrepancyMinutes: -1,
    warningStatus: 'CALIBRATED',
    recommendation: 'Booking time aligns with historical surgical actuals.'
  }
];

