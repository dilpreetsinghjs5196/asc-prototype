/**
 * Next Best Case Matching & Capacity Allocation Engine (Phase AA / A10)
 * Module 10: OR Scheduling & Utilization Optimization
 * 
 * Provides deterministic mathematical algorithms for:
 * - Four-Pillar Case Fit Scoring (Readiness 30%, Probability 25%, Financial 25%, Time & Slot Fit 20%)
 * - Hard Clinical & Physical Disqualification Gates (Prior Auth, Overfill, Implant SLA, Suite Match)
 * - Multi-Factor Candidate Ranking for Open Capacity Slots
 * - Facility Waitlist Backlog Management & Clinical Clearance Audit
 * - Case Offer & Allocation Lifecycle Workflows (RANKED, OFFERED, ACCEPTED, BOOKED)
 */

export const DEFAULT_FACILITY_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
export const DEFAULT_BENCHMARK_MARGIN = 2500.00; // $2,500 target benchmark case contribution margin

export const DEFAULT_SCORING_WEIGHTS = {
  readiness: 0.30,
  probability: 0.25,
  financial: 0.25,
  timeFit: 0.20
};

export const PRIOR_AUTH_STATUSES = {
  APPROVED: { code: 'APPROVED', label: 'Prior Auth Approved', points: 30, badgeClass: 'badge-emerald' },
  PENDING: { code: 'PENDING', label: 'Auth In Review', points: 0, badgeClass: 'badge-amber' },
  DENIED: { code: 'DENIED', label: 'Prior Auth Denied', points: 0, badgeClass: 'badge-crimson' },
  EXPIRED: { code: 'EXPIRED', label: 'Auth Expired', points: 0, badgeClass: 'badge-crimson' }
};

export const DISQUALIFICATION_REASONS = {
  READINESS_GATE_FAILED: {
    code: 'READINESS_GATE_FAILED',
    label: 'Prior Auth Denied / Expired',
    description: 'Insurance pre-authorization has been denied or expired; case cannot proceed.'
  },
  DURATION_EXCEEDS_SLOT: {
    code: 'DURATION_EXCEEDS_SLOT',
    label: 'Case Overfills Slot Duration',
    description: 'Predicted operative duration (P80) exceeds available contiguous room window.'
  },
  SPECIALTY_EQUIPMENT_MISMATCH: {
    code: 'SPECIALTY_EQUIPMENT_MISMATCH',
    label: 'Room Equipment / Specialty Mismatch',
    description: 'Target operating suite does not possess required specialized surgical instrumentation.'
  },
  IMPLANT_SLA_BREACH: {
    code: 'IMPLANT_SLA_BREACH',
    label: 'Implant Delivery SLA Breach',
    description: 'Required surgical hardware cannot be delivered and autoclaved 24h prior to surgery.'
  }
};

export const RECOMMENDATION_STATUSES = {
  RANKED: { code: 'RANKED', label: 'Ranked Candidate', badgeClass: 'badge-blue' },
  OFFERED_TO_SURGEON: { code: 'OFFERED_TO_SURGEON', label: 'Offered to Clinic', badgeClass: 'badge-amber' },
  ACCEPTED: { code: 'ACCEPTED', label: 'Accepted by Surgeon', badgeClass: 'badge-emerald' },
  BOOKED_IN_OR: { code: 'BOOKED_IN_OR', label: 'Confirmed & Booked in OR', badgeClass: 'badge-emerald' },
  DECLINED: { code: 'DECLINED', label: 'Declined by Surgeon', badgeClass: 'badge-neutral' },
  EXPIRED: { code: 'EXPIRED', label: 'Slot Expired', badgeClass: 'badge-crimson' }
};

/**
 * 1. Pillar: Clinical & Pre-Op Readiness Score (0 to 100)
 */
export function calculateReadinessScore(backlogCase) {
  if (!backlogCase) return { score: 0, isDisqualified: true, reason: 'READINESS_GATE_FAILED' };

  const auth = backlogCase.priorAuthStatus || 'PENDING';
  if (auth === 'DENIED' || auth === 'EXPIRED') {
    return {
      score: 0.0,
      isDisqualified: true,
      reason: 'READINESS_GATE_FAILED'
    };
  }

  let pts = 0;
  if (auth === 'APPROVED') pts += 30;
  if (backlogCase.hpCleared) pts += 25;
  if (backlogCase.labsCleared) pts += 20;
  if (backlogCase.consentSigned) pts += 15;
  if (backlogCase.patientAvailable) pts += 10;

  return {
    score: Math.min(100.0, Number(pts.toFixed(2))),
    isDisqualified: false,
    reason: null
  };
}

/**
 * 2. Pillar: Surgeon & Patient Booking Probability Score (0 to 100)
 */
export function calculateProbabilityScore(backlogCase, targetSlot) {
  if (!backlogCase || !targetSlot) return 50.0;

  // Surgeon acceptance rate benchmark (default 80% if not specified)
  const acceptanceRate = typeof backlogCase.surgeonAcceptanceRate === 'number'
    ? backlogCase.surgeonAcceptanceRate
    : 0.80;
  const surgeonPts = acceptanceRate * 40; // Max 40 pts

  // Lead-time feasibility based on targetSlot.leadTimeHours
  const leadHours = Number(targetSlot.leadTimeHours) || 48;
  let leadPts = 15;
  if (leadHours >= 72) {
    leadPts = 35;
  } else if (leadHours >= 48) {
    leadPts = 25;
  } else if (leadHours >= 24) {
    leadPts = 15;
  } else {
    leadPts = 5;
  }

  // Block day alignment (does surgeon regularly operate on this day?)
  const blockAligned = backlogCase.surgeonPreferredDays && targetSlot.dayOfWeek
    ? backlogCase.surgeonPreferredDays.includes(targetSlot.dayOfWeek)
    : true;
  const dayPts = blockAligned ? 25 : 10;

  const total = surgeonPts + leadPts + dayPts;
  return Math.min(100.0, Number(total.toFixed(2)));
}

/**
 * 3. Pillar: Financial Contribution Margin Yield Score (0 to 100)
 */
export function calculateFinancialScore(projectedMargin, benchmarkMargin = DEFAULT_BENCHMARK_MARGIN) {
  const margin = Math.max(0, Number(projectedMargin) || 0);
  const bench = Math.max(100, Number(benchmarkMargin) || DEFAULT_BENCHMARK_MARGIN);

  const score = Math.min(100.0, (margin / bench) * 100.0);
  return Number(score.toFixed(2));
}

/**
 * 4. Pillar: Time & Equipment Slot Compatibility Score (0 to 100)
 */
export function calculateTimeFitScore(
  predictedDurationMinutes,
  slotDurationMinutes,
  specialtyMatch = true,
  implantBreach = false
) {
  const dur = Math.max(0, Number(predictedDurationMinutes) || 0);
  const slot = Math.max(1, Number(slotDurationMinutes) || 60);

  // Hard Gate 1: Duration Overfill
  if (dur > slot) {
    return {
      score: 0.0,
      durationUtilizationPct: Number(((dur / slot) * 100).toFixed(1)),
      isDisqualified: true,
      reason: 'DURATION_EXCEEDS_SLOT'
    };
  }

  // Hard Gate 2: Implant Delivery SLA Breach
  if (implantBreach) {
    return {
      score: 0.0,
      durationUtilizationPct: Number(((dur / slot) * 100).toFixed(1)),
      isDisqualified: true,
      reason: 'IMPLANT_SLA_BREACH'
    };
  }

  // Hard Gate 3: Specialty Suite Incompatibility
  if (!specialtyMatch) {
    return {
      score: 0.0,
      durationUtilizationPct: Number(((dur / slot) * 100).toFixed(1)),
      isDisqualified: true,
      reason: 'SPECIALTY_EQUIPMENT_MISMATCH'
    };
  }

  const utilRatio = dur / slot;
  let durPts = 25;
  if (utilRatio >= 0.75 && utilRatio <= 0.95) {
    durPts = 70; // Goldilocks zone: 75% to 95% slot utilization
  } else if (utilRatio >= 0.50 && utilRatio < 0.75) {
    durPts = 50;
  } else if (utilRatio > 0.95 && utilRatio <= 1.00) {
    durPts = 60; // Tight but fits
  } else {
    durPts = 30; // Underutilization
  }

  const suitePts = specialtyMatch ? 20 : 0;
  const sterilizationPts = 10;

  const total = durPts + suitePts + sterilizationPts;
  return {
    score: Math.min(100.0, Number(total.toFixed(2))),
    durationUtilizationPct: Number((utilRatio * 100).toFixed(1)),
    isDisqualified: false,
    reason: null
  };
}

/**
 * Composite Fit Score Calculation:
 * Score = w_R * S_readiness + w_P * S_probability + w_F * S_financial + w_T * S_timeFit
 */
export function calculateCompositeFitScore(
  readinessScore,
  probabilityScore,
  financialScore,
  timeFitScore,
  weights = DEFAULT_SCORING_WEIGHTS
) {
  const w = { ...DEFAULT_SCORING_WEIGHTS, ...weights };
  const r = Math.max(0, Number(readinessScore) || 0);
  const p = Math.max(0, Number(probabilityScore) || 0);
  const f = Math.max(0, Number(financialScore) || 0);
  const t = Math.max(0, Number(timeFitScore) || 0);

  const composite = (w.readiness * r) + (w.probability * p) + (w.financial * f) + (w.timeFit * t);
  return Number(Math.min(100.0, Math.max(0.0, composite)).toFixed(2));
}

/**
 * Evaluates and ranks all backlog cases against a target capacity slot:
 */
export function rankCandidatesForSlot(
  backlogCases = [],
  targetSlot = {},
  weights = DEFAULT_SCORING_WEIGHTS,
  benchmarkMargin = DEFAULT_BENCHMARK_MARGIN
) {
  const cases = Array.isArray(backlogCases) ? backlogCases : [];
  if (!targetSlot || cases.length === 0) return [];

  const evaluated = cases.map((c) => {
    // 1. Clinical Readiness
    const readiness = calculateReadinessScore(c);

    // 2. Booking Probability
    const probability = calculateProbabilityScore(c, targetSlot);

    // 3. Financial Margin
    const financial = calculateFinancialScore(c.projectedContributionMargin, benchmarkMargin);

    // 4. Time & Physical Compatibility
    const specialtyMatch = !targetSlot.assignedSpecialtyCode ||
      targetSlot.assignedSpecialtyCode === 'ALL' ||
      targetSlot.assignedSpecialtyCode === c.specialtyCode;

    const implantBreach = c.requiresImplant && !c.implantDeliveryConfirmed && (targetSlot.leadTimeHours || 0) < 48;

    const timeFit = calculateTimeFitScore(
      c.predictedDurationMinutes,
      targetSlot.slotDurationMinutes,
      specialtyMatch,
      implantBreach
    );

    const isDisqualified = readiness.isDisqualified || timeFit.isDisqualified;
    const disqualificationReason = readiness.reason || timeFit.reason || null;

    const compositeFitScore = isDisqualified
      ? 0.00
      : calculateCompositeFitScore(readiness.score, probability, financial, timeFit.score, weights);

    return {
      backlogCaseId: c.id,
      patientName: c.patientName,
      patientMrn: c.patientMrn,
      surgeonName: c.surgeonName,
      specialtyCode: c.specialtyCode,
      procedureName: c.procedureName,
      primaryCptCode: c.primaryCptCode,
      predictedDurationMinutes: c.predictedDurationMinutes,
      projectedContributionMargin: c.projectedContributionMargin,
      priorAuthStatus: c.priorAuthStatus,
      hpCleared: c.hpCleared,
      labsCleared: c.labsCleared,
      consentSigned: c.consentSigned,
      patientAvailable: c.patientAvailable,
      requiresImplant: c.requiresImplant,
      implantDeliveryConfirmed: c.implantDeliveryConfirmed,
      backlogStatus: c.backlogStatus,
      // Evaluated Metrics
      compositeFitScore,
      readinessScore: readiness.score,
      probabilityScore: probability,
      financialScore: financial,
      timeFitScore: timeFit.score,
      durationUtilizationPct: timeFit.durationUtilizationPct,
      isDisqualified,
      disqualificationReason,
      recommendationStatus: 'RANKED'
    };
  });

  // Sort: Qualified cases first by compositeFitScore DESC, then disqualified cases
  evaluated.sort((a, b) => {
    if (a.isDisqualified && !b.isDisqualified) return 1;
    if (!a.isDisqualified && b.isDisqualified) return -1;
    return b.compositeFitScore - a.compositeFitScore;
  });

  // Assign Rank Position (1, 2, 3...)
  return evaluated.map((item, idx) => ({
    ...item,
    rankPosition: idx + 1
  }));
}

/**
 * Aggregates Facility-level Next Best Case KPIs:
 */
export function calculateFacilityNbcKpis(recommendations = [], backlogCases = []) {
  const recs = Array.isArray(recommendations) ? recommendations : [];
  const backlog = Array.isArray(backlogCases) ? backlogCases : [];

  const totalBacklogCount = backlog.length;
  const qualifiedList = recs.filter(r => !r.isDisqualified);
  const qualifiedCandidatesCount = qualifiedList.length;

  const topRankedCandidate = qualifiedList.length > 0 ? qualifiedList[0] : null;
  const topRankedFitScore = topRankedCandidate ? topRankedCandidate.compositeFitScore : 0.0;

  const totalPotentialMargin = qualifiedList.reduce(
    (acc, r) => acc + (Number(r.projectedContributionMargin) || 0),
    0
  );

  const avgReadinessPct = recs.length > 0
    ? Number((recs.reduce((acc, r) => acc + (Number(r.readinessScore) || 0), 0) / recs.length).toFixed(1))
    : 0.0;

  const avgDurationUtilizationPct = qualifiedList.length > 0
    ? Number((qualifiedList.reduce((acc, r) => acc + (Number(r.durationUtilizationPct) || 0), 0) / qualifiedList.length).toFixed(1))
    : 0.0;

  return {
    totalBacklogCount,
    qualifiedCandidatesCount,
    topRankedCandidate,
    topRankedFitScore,
    totalPotentialMargin: Number(totalPotentialMargin.toFixed(2)),
    avgReadinessPct,
    avgDurationUtilizationPct
  };
}

/**
 * Filters Scored Recommendations:
 */
export function filterNbcRecommendations(recommendations = [], filters = {}) {
  const { specialty, qualification, status, searchQuery } = filters;

  return recommendations.filter((r) => {
    if (specialty && specialty !== 'ALL' && r.specialtyCode !== specialty) {
      return false;
    }
    if (qualification && qualification !== 'ALL') {
      if (qualification === 'QUALIFIED' && r.isDisqualified) return false;
      if (qualification === 'DISQUALIFIED' && !r.isDisqualified) return false;
    }
    if (status && status !== 'ALL' && r.recommendationStatus !== status) {
      return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      const matchPatient = r.patientName && r.patientName.toLowerCase().includes(q);
      const matchSurgeon = r.surgeonName && r.surgeonName.toLowerCase().includes(q);
      const matchProc = r.procedureName && r.procedureName.toLowerCase().includes(q);
      const matchCpt = r.primaryCptCode && r.primaryCptCode.toLowerCase().includes(q);
      if (!matchPatient && !matchSurgeon && !matchProc && !matchCpt) {
        return false;
      }
    }
    return true;
  });
}

// ==============================================================================
// Clinical Realistic Seed Data for Phase AA / A10 Engine Simulation
// ==============================================================================

export const SEED_OPEN_SLOTS = [
  {
    id: 'slot-ortho-01',
    facilityId: DEFAULT_FACILITY_ID,
    operatingRoomId: 'or-1',
    roomName: 'OR 1 - Orthopedic / Arthroscopy',
    assignedSpecialtyCode: 'ORTHOPEDICS',
    slotDate: '2026-11-18',
    dayOfWeek: 'Wednesday',
    startTime: '08:00',
    endTime: '12:00',
    slotDurationMinutes: 240, // 4.0 hrs
    leadTimeHours: 132, // 5.5 days out
    slotDescription: 'Surrendered Wednesday morning block; optimal for major joint or complex knee arthroscopy.'
  },
  {
    id: 'slot-robotics-02',
    facilityId: DEFAULT_FACILITY_ID,
    operatingRoomId: 'or-2',
    roomName: 'OR 2 - Robotic & Minimally Invasive',
    assignedSpecialtyCode: 'GENERAL_SURGERY',
    slotDate: '2026-11-16',
    dayOfWeek: 'Monday',
    startTime: '08:00',
    endTime: '11:30',
    slotDurationMinutes: 210, // 3.5 hrs
    leadTimeHours: 84, // 3.5 days out
    slotDescription: 'Morning open pool block; dual console robotic capability available.'
  },
  {
    id: 'slot-eye-03',
    facilityId: DEFAULT_FACILITY_ID,
    operatingRoomId: 'or-3',
    roomName: 'OR 3 - Ophthalmology Specialty Suite',
    assignedSpecialtyCode: 'OPHTHALMOLOGY',
    slotDate: '2026-11-16',
    dayOfWeek: 'Monday',
    startTime: '10:00',
    endTime: '12:00',
    slotDurationMinutes: 120, // 2.0 hrs
    leadTimeHours: 84, // 3.5 days out
    slotDescription: 'High-speed eye suite with Zeiss microscope and phacoemulsification console.'
  },
  {
    id: 'slot-spine-04',
    facilityId: DEFAULT_FACILITY_ID,
    operatingRoomId: 'or-4',
    roomName: 'OR 4 - Spine & Pain Procedures',
    assignedSpecialtyCode: 'SPINE_SURGERY',
    slotDate: '2026-11-17',
    dayOfWeek: 'Tuesday',
    startTime: '12:00',
    endTime: '13:15',
    slotDurationMinutes: 75, // 1.25 hrs
    leadTimeHours: 108, // 4.5 days out
    slotDescription: 'Short afternoon window with C-arm fluoroscopy ready for targeted interventional procedures.'
  }
];

export const SEED_BACKLOG_CASES = [
  {
    id: 'nbc-case-001',
    facilityId: DEFAULT_FACILITY_ID,
    patientName: 'Eleanor Vance',
    patientMrn: 'MRN-849201',
    surgeonId: 'surg-chen',
    surgeonName: 'Dr. Michael Chen, MD',
    specialtyCode: 'ORTHOPEDICS',
    procedureName: 'Total Knee Arthroplasty (Right)',
    primaryCptCode: '27447',
    predictedDurationMinutes: 135,
    projectedContributionMargin: 3850.00,
    priorAuthStatus: 'APPROVED',
    hpCleared: true,
    labsCleared: true,
    consentSigned: true,
    patientAvailable: true,
    requiresImplant: true,
    implantDeliveryConfirmed: true,
    surgeonAcceptanceRate: 0.92,
    surgeonPreferredDays: ['Monday', 'Wednesday', 'Friday'],
    backlogStatus: 'ACTIVE_WAITLIST'
  },
  {
    id: 'nbc-case-002',
    facilityId: DEFAULT_FACILITY_ID,
    patientName: 'David Kowalski',
    patientMrn: 'MRN-849202',
    surgeonId: 'surg-chen',
    surgeonName: 'Dr. Michael Chen, MD',
    specialtyCode: 'ORTHOPEDICS',
    procedureName: 'Knee Arthroscopy w/ Meniscectomy',
    primaryCptCode: '29881',
    predictedDurationMinutes: 65,
    projectedContributionMargin: 1950.00,
    priorAuthStatus: 'APPROVED',
    hpCleared: true,
    labsCleared: true,
    consentSigned: true,
    patientAvailable: true,
    requiresImplant: false,
    implantDeliveryConfirmed: false,
    surgeonAcceptanceRate: 0.88,
    surgeonPreferredDays: ['Wednesday', 'Thursday'],
    backlogStatus: 'ACTIVE_WAITLIST'
  },
  {
    id: 'nbc-case-003',
    facilityId: DEFAULT_FACILITY_ID,
    patientName: 'Robert Martinez',
    patientMrn: 'MRN-849203',
    surgeonId: 'surg-jenkins',
    surgeonName: 'Dr. Sarah Jenkins, MD',
    specialtyCode: 'GENERAL_SURGERY',
    procedureName: 'Robotic Inguinal Hernia Repair (Bilateral)',
    primaryCptCode: '49650',
    predictedDurationMinutes: 110,
    projectedContributionMargin: 2900.00,
    priorAuthStatus: 'APPROVED',
    hpCleared: true,
    labsCleared: true,
    consentSigned: true,
    patientAvailable: true,
    requiresImplant: false,
    implantDeliveryConfirmed: false,
    surgeonAcceptanceRate: 0.85,
    surgeonPreferredDays: ['Monday', 'Thursday'],
    backlogStatus: 'ACTIVE_WAITLIST'
  },
  {
    id: 'nbc-case-004',
    facilityId: DEFAULT_FACILITY_ID,
    patientName: 'Patricia Adams',
    patientMrn: 'MRN-849204',
    surgeonId: 'surg-jenkins',
    surgeonName: 'Dr. Sarah Jenkins, MD',
    specialtyCode: 'GENERAL_SURGERY',
    procedureName: 'Laparoscopic Cholecystectomy',
    primaryCptCode: '47562',
    predictedDurationMinutes: 75,
    projectedContributionMargin: 2200.00,
    priorAuthStatus: 'PENDING',
    hpCleared: true,
    labsCleared: false,
    consentSigned: true,
    patientAvailable: true,
    requiresImplant: false,
    implantDeliveryConfirmed: false,
    surgeonAcceptanceRate: 0.80,
    surgeonPreferredDays: ['Monday', 'Tuesday'],
    backlogStatus: 'ACTIVE_WAITLIST'
  },
  {
    id: 'nbc-case-005',
    facilityId: DEFAULT_FACILITY_ID,
    patientName: 'Thomas Wright',
    patientMrn: 'MRN-849205',
    surgeonId: 'surg-vance',
    surgeonName: 'Dr. Marcus Vance, MD',
    specialtyCode: 'ORTHOPEDICS',
    procedureName: 'Shoulder Arthroscopy w/ Rotator Cuff Repair',
    primaryCptCode: '29827',
    predictedDurationMinutes: 120,
    projectedContributionMargin: 3200.00,
    priorAuthStatus: 'APPROVED',
    hpCleared: true,
    labsCleared: true,
    consentSigned: true,
    patientAvailable: true,
    requiresImplant: true,
    implantDeliveryConfirmed: true,
    surgeonAcceptanceRate: 0.90,
    surgeonPreferredDays: ['Wednesday', 'Friday'],
    backlogStatus: 'ACTIVE_WAITLIST'
  },
  {
    id: 'nbc-case-006',
    facilityId: DEFAULT_FACILITY_ID,
    patientName: 'Margaret O\'Connor',
    patientMrn: 'MRN-849206',
    surgeonId: 'surg-zhao',
    surgeonName: 'Dr. Kevin Zhao, MD',
    specialtyCode: 'OPHTHALMOLOGY',
    procedureName: 'Cataract Extraction w/ IOL (Right Eye)',
    primaryCptCode: '66984',
    predictedDurationMinutes: 30,
    projectedContributionMargin: 1650.00,
    priorAuthStatus: 'APPROVED',
    hpCleared: true,
    labsCleared: true,
    consentSigned: true,
    patientAvailable: true,
    requiresImplant: true,
    implantDeliveryConfirmed: true,
    surgeonAcceptanceRate: 0.95,
    surgeonPreferredDays: ['Monday', 'Wednesday'],
    backlogStatus: 'ACTIVE_WAITLIST'
  },
  {
    id: 'nbc-case-007',
    facilityId: DEFAULT_FACILITY_ID,
    patientName: 'William Harrison',
    patientMrn: 'MRN-849207',
    surgeonId: 'surg-zhao',
    surgeonName: 'Dr. Kevin Zhao, MD',
    specialtyCode: 'OPHTHALMOLOGY',
    procedureName: 'Complex Cataract Extraction (Left Eye)',
    primaryCptCode: '66982',
    predictedDurationMinutes: 45,
    projectedContributionMargin: 2100.00,
    priorAuthStatus: 'APPROVED',
    hpCleared: true,
    labsCleared: true,
    consentSigned: false,
    patientAvailable: true,
    requiresImplant: true,
    implantDeliveryConfirmed: true,
    surgeonAcceptanceRate: 0.90,
    surgeonPreferredDays: ['Monday'],
    backlogStatus: 'ACTIVE_WAITLIST'
  },
  {
    id: 'nbc-case-008',
    facilityId: DEFAULT_FACILITY_ID,
    patientName: 'Jameson Bell',
    patientMrn: 'MRN-849208',
    surgeonId: 'surg-miller',
    surgeonName: 'Dr. Rachel Miller, MD',
    specialtyCode: 'SPINE_SURGERY',
    procedureName: 'Lumbar Microdiscectomy (L4-L5)',
    primaryCptCode: '63030',
    predictedDurationMinutes: 105,
    projectedContributionMargin: 4200.00,
    priorAuthStatus: 'APPROVED',
    hpCleared: true,
    labsCleared: true,
    consentSigned: true,
    patientAvailable: true,
    requiresImplant: false,
    implantDeliveryConfirmed: false,
    surgeonAcceptanceRate: 0.75,
    surgeonPreferredDays: ['Tuesday', 'Thursday'],
    backlogStatus: 'ACTIVE_WAITLIST'
  },
  {
    id: 'nbc-case-009',
    facilityId: DEFAULT_FACILITY_ID,
    patientName: 'Gregory Scott',
    patientMrn: 'MRN-849209',
    surgeonId: 'surg-miller',
    surgeonName: 'Dr. Rachel Miller, MD',
    specialtyCode: 'SPINE_SURGERY',
    procedureName: 'Transforaminal Epidural Steroid Injection',
    primaryCptCode: '64483',
    predictedDurationMinutes: 40,
    projectedContributionMargin: 1250.00,
    priorAuthStatus: 'APPROVED',
    hpCleared: true,
    labsCleared: true,
    consentSigned: true,
    patientAvailable: true,
    requiresImplant: false,
    implantDeliveryConfirmed: false,
    surgeonAcceptanceRate: 0.90,
    surgeonPreferredDays: ['Tuesday'],
    backlogStatus: 'ACTIVE_WAITLIST'
  },
  {
    id: 'nbc-case-010',
    facilityId: DEFAULT_FACILITY_ID,
    patientName: 'Arthur Pendelton',
    patientMrn: 'MRN-849210',
    surgeonId: 'surg-chen',
    surgeonName: 'Dr. Michael Chen, MD',
    specialtyCode: 'ORTHOPEDICS',
    procedureName: 'Total Hip Arthroplasty (Left)',
    primaryCptCode: '27130',
    predictedDurationMinutes: 150,
    projectedContributionMargin: 4100.00,
    priorAuthStatus: 'DENIED', // Trigger hard gate
    hpCleared: true,
    labsCleared: true,
    consentSigned: true,
    patientAvailable: true,
    requiresImplant: true,
    implantDeliveryConfirmed: false,
    surgeonAcceptanceRate: 0.85,
    surgeonPreferredDays: ['Wednesday'],
    backlogStatus: 'ACTIVE_WAITLIST'
  }
];

export default {
  DEFAULT_FACILITY_ID,
  DEFAULT_BENCHMARK_MARGIN,
  DEFAULT_SCORING_WEIGHTS,
  PRIOR_AUTH_STATUSES,
  DISQUALIFICATION_REASONS,
  RECOMMENDATION_STATUSES,
  calculateReadinessScore,
  calculateProbabilityScore,
  calculateFinancialScore,
  calculateTimeFitScore,
  calculateCompositeFitScore,
  rankCandidatesForSlot,
  calculateFacilityNbcKpis,
  filterNbcRecommendations,
  SEED_OPEN_SLOTS,
  SEED_BACKLOG_CASES
};

