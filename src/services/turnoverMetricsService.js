/**
 * Turnover Metrics & Benchmark Engine (Phase A7)
 * Module 10: OR Scheduling & Utilization Optimization
 * 
 * Provides deterministic mathematical calculations for:
 * - Wheels Out (Case N) to Wheels In (Case N+1) Turnover Duration
 * - Same-Surgeon vs Different-Surgeon Dynamic Benchmark Assignment
 * - Turnover Variance & Status Classification (COMPLIANT, MINOR_DELAY, PROLONGED_TURNOVER)
 * - Root-Cause Delay Attribution & Pareto Analysis
 * - Staffed OR Idle Room Labor Run-Rate Cost ($650.00/hr)
 */

export const DEFAULT_FACILITY_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
export const DEFAULT_HOURLY_RUN_RATE = 650.00; // Clinical crew and room overhead run-rate cost per OR hour
export const DEFAULT_WARNING_THRESHOLD_MINUTES = 10; // Threshold above benchmark before flagged as prolonged

export const TURNOVER_TYPES = {
  SAME_SURGEON: {
    code: 'SAME_SURGEON',
    label: 'Same Surgeon',
    defaultBenchmark: 20,
    badgeClass: 'badge-blue',
    description: 'Consecutive cases by the same primary surgeon; minimal table/tray reconfiguration.'
  },
  DIFFERENT_SURGEON: {
    code: 'DIFFERENT_SURGEON',
    label: 'Different Surgeon / Cross-Specialty',
    defaultBenchmark: 35,
    badgeClass: 'badge-amber',
    description: 'Case transition between different surgeons or specialties; requires complete room restaging.'
  }
};

export const TURNOVER_STATUSES = {
  COMPLIANT: {
    code: 'COMPLIANT',
    label: 'Compliant (≤ Target)',
    badgeClass: 'badge-emerald',
    description: 'Turnover was completed within or faster than benchmark standard.'
  },
  MINOR_DELAY: {
    code: 'MINOR_DELAY',
    label: 'Minor Delay (1–10m)',
    badgeClass: 'badge-amber',
    description: 'Turnover experienced minor operational friction within 10 minutes of benchmark.'
  },
  PROLONGED_TURNOVER: {
    code: 'PROLONGED_TURNOVER',
    label: 'Prolonged Turnover (>10m Delay)',
    badgeClass: 'badge-crimson',
    description: 'Critical operational delay exceeding benchmark by >10m; causes schedule cascading.'
  }
};

export const DELAY_REASONS = {
  EVS_CLEANING_DELAY: {
    code: 'EVS_CLEANING_DELAY',
    label: 'EVS / Terminal Cleaning Delay',
    badgeClass: 'badge-amber',
    description: 'Housekeeping backlog, biohazard wipe-down, or floor dry time.'
  },
  INSTRUMENT_STERILIZATION_DELAY: {
    code: 'INSTRUMENT_STERILIZATION_DELAY',
    label: 'SPD / Sterile Processing & Trays',
    badgeClass: 'badge-crimson',
    description: 'Sterile processing backlog, missing specialty instrument tray or implants.'
  },
  SURGEON_UNAVAILABLE: {
    code: 'SURGEON_UNAVAILABLE',
    label: 'Surgeon Unavailable / Late',
    badgeClass: 'badge-crimson',
    description: 'Surgeon rounding in PACU, in clinic consult, or delayed transit.'
  },
  ANESTHESIA_PREOP_DELAY: {
    code: 'ANESTHESIA_PREOP_DELAY',
    label: 'Anesthesia / Regional Block',
    badgeClass: 'badge-amber',
    description: 'Pre-op peripheral nerve block, difficult airway staging, or consent review.'
  },
  NURSING_STAFF_SHORTAGE: {
    code: 'NURSING_STAFF_SHORTAGE',
    label: 'Nursing Staff Relief / Shortage',
    badgeClass: 'badge-amber',
    description: 'Circulating nurse shift handover, scrub tech meal relief shortage.'
  },
  EQUIPMENT_MALFUNCTION_SETUP: {
    code: 'EQUIPMENT_MALFUNCTION_SETUP',
    label: 'Equipment & Tech Reconfiguration',
    badgeClass: 'badge-blue',
    description: 'Arthroscopy tower, C-arm fluoroscopy, or specialty table repositioning.'
  },
  PATIENT_ADMISSION_DELAY: {
    code: 'PATIENT_ADMISSION_DELAY',
    label: 'Pre-op Transport / Admissions Hold',
    badgeClass: 'badge-blue',
    description: 'Patient pre-op check-in hold, lab result delay, or stretcher transport wait.'
  },
  OTHER_CLINICAL_HOLD: {
    code: 'OTHER_CLINICAL_HOLD',
    label: 'Clinical Hold / Emergency Hold',
    badgeClass: 'badge-neutral',
    description: 'Pathology frozen section consult or urgent clinical hold.'
  }
};

/**
 * Calculates turnover duration in minutes from Wheels Out of Case N to Wheels In of Case N+1:
 * Returns minutes integer. Throws or returns 0 if invalid.
 */
export function calculateTurnoverDuration(wheelsOutTime, wheelsInTime) {
  const outTime = new Date(wheelsOutTime).getTime();
  const inTime = new Date(wheelsInTime).getTime();

  if (isNaN(outTime) || isNaN(inTime) || inTime < outTime) {
    return 0;
  }

  const diffMs = inTime - outTime;
  return Math.round(diffMs / (1000 * 60));
}

/**
 * Determines whether a turnover is Same-Surgeon or Different-Surgeon:
 */
export function determineTurnoverType(priorSurgeonName, nextSurgeonName) {
  if (!priorSurgeonName || !nextSurgeonName) {
    return 'SAME_SURGEON';
  }
  return priorSurgeonName.trim().toLowerCase() === nextSurgeonName.trim().toLowerCase()
    ? 'SAME_SURGEON'
    : 'DIFFERENT_SURGEON';
}

/**
 * Retrieves the appropriate benchmark target in minutes:
 */
export function getBenchmarkTarget(turnoverType, specialtyCode = null, customBenchmarks = []) {
  if (Array.isArray(customBenchmarks) && specialtyCode) {
    const match = customBenchmarks.find(b => b.specialtyCode === specialtyCode);
    if (match) {
      return turnoverType === 'SAME_SURGEON'
        ? match.sameSurgeonBenchmarkMinutes
        : match.differentSurgeonBenchmarkMinutes;
    }
  }

  return turnoverType === 'SAME_SURGEON'
    ? TURNOVER_TYPES.SAME_SURGEON.defaultBenchmark
    : TURNOVER_TYPES.DIFFERENT_SURGEON.defaultBenchmark;
}

/**
 * Calculates variance against benchmark:
 * Variance = Actual Minutes - Benchmark Target Minutes
 */
export function calculateTurnoverVariance(actualMinutes, benchmarkMinutes) {
  const actual = Number(actualMinutes) || 0;
  const target = Number(benchmarkMinutes) || 0;
  return actual - target;
}

/**
 * Classifies turnover compliance status:
 * - COMPLIANT: Variance <= 0
 * - MINOR_DELAY: 0 < Variance <= warningThreshold (default 10m)
 * - PROLONGED_TURNOVER: Variance > warningThreshold
 */
export function classifyTurnoverStatus(varianceMinutes, warningThresholdMinutes = DEFAULT_WARNING_THRESHOLD_MINUTES) {
  const variance = Number(varianceMinutes) || 0;
  const threshold = Number(warningThresholdMinutes) || DEFAULT_WARNING_THRESHOLD_MINUTES;

  if (variance <= 0) {
    return 'COMPLIANT';
  }
  if (variance <= threshold) {
    return 'MINOR_DELAY';
  }
  return 'PROLONGED_TURNOVER';
}

/**
 * Calculates financial labor idle cost and excess delay cost:
 * Total Idle Cost = (Actual Turnover / 60) * Hourly Run-Rate
 * Excess Delay Cost = (max(0, Variance) / 60) * Hourly Run-Rate
 */
export function calculateTurnoverFinancialImpact(actualTurnoverMinutes, varianceMinutes, hourlyRate = DEFAULT_HOURLY_RUN_RATE) {
  const actualMins = Math.max(0, Number(actualTurnoverMinutes) || 0);
  const varianceMins = Math.max(0, Number(varianceMinutes) || 0);
  const rate = Math.max(0, Number(hourlyRate) || DEFAULT_HOURLY_RUN_RATE);

  const totalIdleCost = Number(((actualMins / 60) * rate).toFixed(2));
  const excessDelayCost = Number(((varianceMins / 60) * rate).toFixed(2));

  return {
    totalIdleCost,
    excessDelayCost
  };
}

/**
 * Calculates facility-wide aggregated KPIs for Turnover Performance:
 */
export function calculateFacilityTurnoverKpis(events = []) {
  const list = Array.isArray(events) ? events : [];
  const totalTurnovers = list.length;

  if (totalTurnovers === 0) {
    return {
      totalTurnovers: 0,
      sameSurgeonCount: 0,
      differentSurgeonCount: 0,
      avgTurnoverMinutes: 0.0,
      avgSameSurgeonMinutes: 0.0,
      avgDifferentSurgeonMinutes: 0.0,
      compliantCount: 0,
      complianceRatePct: 0.0,
      minorDelayCount: 0,
      prolongedCount: 0,
      prolongedRatePct: 0.0,
      totalDelayMinutes: 0,
      totalIdleCost: 0.00,
      totalExcessCost: 0.00
    };
  }

  const sameSurgeonList = list.filter(e => e.turnoverType === 'SAME_SURGEON');
  const differentSurgeonList = list.filter(e => e.turnoverType === 'DIFFERENT_SURGEON');

  const sameSurgeonCount = sameSurgeonList.length;
  const differentSurgeonCount = differentSurgeonList.length;

  const totalActualMins = list.reduce((acc, e) => acc + (Number(e.actualTurnoverMinutes) || 0), 0);
  const avgTurnoverMinutes = Number((totalActualMins / totalTurnovers).toFixed(1));

  const totalSameMins = sameSurgeonList.reduce((acc, e) => acc + (Number(e.actualTurnoverMinutes) || 0), 0);
  const avgSameSurgeonMinutes = sameSurgeonCount > 0
    ? Number((totalSameMins / sameSurgeonCount).toFixed(1))
    : 0.0;

  const totalDiffMins = differentSurgeonList.reduce((acc, e) => acc + (Number(e.actualTurnoverMinutes) || 0), 0);
  const avgDifferentSurgeonMinutes = differentSurgeonCount > 0
    ? Number((totalDiffMins / differentSurgeonCount).toFixed(1))
    : 0.0;

  const compliantCount = list.filter(e => e.turnoverStatus === 'COMPLIANT').length;
  const complianceRatePct = Number(((compliantCount / totalTurnovers) * 100).toFixed(1));

  const minorDelayCount = list.filter(e => e.turnoverStatus === 'MINOR_DELAY').length;
  const prolongedCount = list.filter(e => e.turnoverStatus === 'PROLONGED_TURNOVER').length;
  const prolongedRatePct = Number(((prolongedCount / totalTurnovers) * 100).toFixed(1));

  const totalDelayMinutes = list.reduce(
    (acc, e) => acc + (e.turnoverVarianceMinutes > 0 ? e.turnoverVarianceMinutes : 0),
    0
  );

  const totalIdleCost = Number(list.reduce((acc, e) => acc + (Number(e.financialIdleCost) || 0), 0).toFixed(2));
  const totalExcessCost = Number(list.reduce((acc, e) => acc + (Number(e.excessDelayCost) || 0), 0).toFixed(2));

  return {
    totalTurnovers,
    sameSurgeonCount,
    differentSurgeonCount,
    avgTurnoverMinutes,
    avgSameSurgeonMinutes,
    avgDifferentSurgeonMinutes,
    compliantCount,
    complianceRatePct,
    minorDelayCount,
    prolongedCount,
    prolongedRatePct,
    totalDelayMinutes,
    totalIdleCost,
    totalExcessCost
  };
}

/**
 * Calculates Delay Reason Pareto Distribution:
 */
export function calculateDelayReasonPareto(events = []) {
  const delayedEvents = (Array.isArray(events) ? events : []).filter(e => e.turnoverVarianceMinutes > 0);
  const reasonMap = {};

  delayedEvents.forEach(e => {
    const code = e.delayReasonCode || 'OTHER_CLINICAL_HOLD';
    if (!reasonMap[code]) {
      const def = DELAY_REASONS[code] || DELAY_REASONS.OTHER_CLINICAL_HOLD;
      reasonMap[code] = {
        code,
        label: def.label,
        badgeClass: def.badgeClass,
        count: 0,
        totalDelayMinutes: 0,
        totalCost: 0.00
      };
    }
    reasonMap[code].count += 1;
    reasonMap[code].totalDelayMinutes += e.turnoverVarianceMinutes;
    reasonMap[code].totalCost += (Number(e.excessDelayCost) || 0);
  });

  const result = Object.values(reasonMap).sort((a, b) => b.totalDelayMinutes - a.totalDelayMinutes);
  const totalMins = result.reduce((acc, r) => acc + r.totalDelayMinutes, 0);

  return result.map(r => ({
    ...r,
    pctOfTotalDelay: totalMins > 0 ? Number(((r.totalDelayMinutes / totalMins) * 100).toFixed(1)) : 0.0,
    totalCost: Number(r.totalCost.toFixed(2))
  }));
}

/**
 * Filters turnover event records:
 */
export function filterTurnoverEvents(events = [], filters = {}) {
  const { room, specialty, turnoverType, turnoverStatus, delayReason, searchQuery } = filters;

  return events.filter(e => {
    if (room && room !== 'ALL' && e.operatingRoomId !== room) {
      return false;
    }
    if (specialty && specialty !== 'ALL' && e.priorSpecialtyCode !== specialty && e.nextSpecialtyCode !== specialty) {
      return false;
    }
    if (turnoverType && turnoverType !== 'ALL' && e.turnoverType !== turnoverType) {
      return false;
    }
    if (turnoverStatus && turnoverStatus !== 'ALL' && e.turnoverStatus !== turnoverStatus) {
      return false;
    }
    if (delayReason && delayReason !== 'ALL' && e.delayReasonCode !== delayReason) {
      return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      const matchPrior = e.priorCaseId && e.priorCaseId.toLowerCase().includes(q);
      const matchNext = e.nextCaseId && e.nextCaseId.toLowerCase().includes(q);
      const matchSurgeon = (e.priorSurgeonName && e.priorSurgeonName.toLowerCase().includes(q)) ||
                           (e.nextSurgeonName && e.nextSurgeonName.toLowerCase().includes(q));
      const matchProc = (e.priorProcedureName && e.priorProcedureName.toLowerCase().includes(q)) ||
                        (e.nextProcedureName && e.nextProcedureName.toLowerCase().includes(q));
      if (!matchPrior && !matchNext && !matchSurgeon && !matchProc) {
        return false;
      }
    }
    return true;
  });
}

// ==============================================================================
// Clinical Realistic Seed Data for Phase A7 Engine Simulation
// ==============================================================================

export const SEED_TURNOVER_EVENTS = [
  {
    id: 'to-001',
    facilityId: DEFAULT_FACILITY_ID,
    operatingRoomId: 'or-1',
    roomName: 'OR 1 - Orthopedic / Arthroscopy',
    surgeryDate: '2026-11-10',
    priorCaseId: 'CASE-2026-8910',
    priorSurgeonName: 'Dr. Robert Chen, MD',
    priorSpecialtyCode: 'ORTHOPEDICS',
    priorProcedureName: 'Knee Arthroscopy w/ Meniscectomy',
    nextCaseId: 'CASE-2026-8911',
    nextSurgeonName: 'Dr. Robert Chen, MD',
    nextSpecialtyCode: 'ORTHOPEDICS',
    nextProcedureName: 'Rotator Cuff Repair (Arthroscopic)',
    turnoverType: 'SAME_SURGEON',
    priorWheelsOutTime: '2026-11-10T09:30:00Z',
    cleanStartTime: '2026-11-10T09:33:00Z',
    cleanCompleteTime: '2026-11-10T09:42:00Z',
    setupReadyTime: '2026-11-10T09:48:00Z',
    nextWheelsInTime: '2026-11-10T09:52:00Z',
    actualTurnoverMinutes: 22,
    benchmarkTargetMinutes: 20,
    turnoverVarianceMinutes: 2,
    turnoverStatus: 'MINOR_DELAY',
    delayReasonCode: 'EQUIPMENT_MALFUNCTION_SETUP',
    delayDescription: 'Repositioning shoulder traction attachment for rotator cuff setup.',
    financialIdleCost: 238.33, // (22/60)*650
    excessDelayCost: 21.67 // (2/60)*650
  },
  {
    id: 'to-002',
    facilityId: DEFAULT_FACILITY_ID,
    operatingRoomId: 'or-1',
    roomName: 'OR 1 - Orthopedic / Arthroscopy',
    surgeryDate: '2026-11-10',
    priorCaseId: 'CASE-2026-8911',
    priorSurgeonName: 'Dr. Robert Chen, MD',
    priorSpecialtyCode: 'ORTHOPEDICS',
    priorProcedureName: 'Rotator Cuff Repair (Arthroscopic)',
    nextCaseId: 'CASE-2026-8918',
    nextSurgeonName: 'Dr. Kevin Zhao, MD',
    nextSpecialtyCode: 'ORTHOPEDICS',
    nextProcedureName: 'Total Knee Arthroplasty (Outpatient)',
    turnoverType: 'DIFFERENT_SURGEON',
    priorWheelsOutTime: '2026-11-10T12:05:00Z',
    cleanStartTime: '2026-11-10T12:08:00Z',
    cleanCompleteTime: '2026-11-10T12:22:00Z',
    setupReadyTime: '2026-11-10T12:48:00Z',
    nextWheelsInTime: '2026-11-10T12:55:00Z',
    actualTurnoverMinutes: 50,
    benchmarkTargetMinutes: 35,
    turnoverVarianceMinutes: 15,
    turnoverStatus: 'PROLONGED_TURNOVER',
    delayReasonCode: 'INSTRUMENT_STERILIZATION_DELAY',
    delayDescription: 'SPD delay delivering total joint implant trials from decontamination.',
    financialIdleCost: 541.67, // (50/60)*650
    excessDelayCost: 162.50 // (15/60)*650
  },
  {
    id: 'to-003',
    facilityId: DEFAULT_FACILITY_ID,
    operatingRoomId: 'or-2',
    roomName: 'OR 2 - Robotic & Minimally Invasive',
    surgeryDate: '2026-11-10',
    priorCaseId: 'CASE-2026-8912',
    priorSurgeonName: 'Dr. Sarah Jenkins, MD',
    priorSpecialtyCode: 'GENERAL_SURGERY',
    priorProcedureName: 'Laparoscopic Cholecystectomy',
    nextCaseId: 'CASE-2026-8913',
    nextSurgeonName: 'Dr. Sarah Jenkins, MD',
    nextSpecialtyCode: 'GENERAL_SURGERY',
    nextProcedureName: 'Inguinal Hernia Repair (Laparoscopic)',
    turnoverType: 'SAME_SURGEON',
    priorWheelsOutTime: '2026-11-10T09:15:00Z',
    cleanStartTime: '2026-11-10T09:18:00Z',
    cleanCompleteTime: '2026-11-10T09:26:00Z',
    setupReadyTime: '2026-11-10T09:31:00Z',
    nextWheelsInTime: '2026-11-10T09:33:00Z',
    actualTurnoverMinutes: 18,
    benchmarkTargetMinutes: 20,
    turnoverVarianceMinutes: -2,
    turnoverStatus: 'COMPLIANT',
    delayReasonCode: null,
    delayDescription: 'Efficient turnover; lap tower maintained in sterile field.',
    financialIdleCost: 195.00,
    excessDelayCost: 0.00
  },
  {
    id: 'to-004',
    facilityId: DEFAULT_FACILITY_ID,
    operatingRoomId: 'or-3',
    roomName: 'OR 3 - Ophthalmology Specialty Suite',
    surgeryDate: '2026-11-11',
    priorCaseId: 'CASE-2026-8914',
    priorSurgeonName: 'Dr. Emily Vance, MD',
    priorSpecialtyCode: 'OPHTHALMOLOGY',
    priorProcedureName: 'Cataract Extracapsular w/ IOL',
    nextCaseId: 'CASE-2026-8915',
    nextSurgeonName: 'Dr. Emily Vance, MD',
    nextSpecialtyCode: 'OPHTHALMOLOGY',
    nextProcedureName: 'Cataract Extracapsular w/ IOL',
    turnoverType: 'SAME_SURGEON',
    priorWheelsOutTime: '2026-11-11T08:30:00Z',
    cleanStartTime: '2026-11-11T08:32:00Z',
    cleanCompleteTime: '2026-11-11T08:38:00Z',
    setupReadyTime: '2026-11-11T08:41:00Z',
    nextWheelsInTime: '2026-11-11T08:44:00Z',
    actualTurnoverMinutes: 14,
    benchmarkTargetMinutes: 15,
    turnoverVarianceMinutes: -1,
    turnoverStatus: 'COMPLIANT',
    delayReasonCode: null,
    delayDescription: 'Standard eye tray turnaround with pre-staged stretcher.',
    financialIdleCost: 151.67,
    excessDelayCost: 0.00
  },
  {
    id: 'to-005',
    facilityId: DEFAULT_FACILITY_ID,
    operatingRoomId: 'or-3',
    roomName: 'OR 3 - Ophthalmology Specialty Suite',
    surgeryDate: '2026-11-11',
    priorCaseId: 'CASE-2026-8915',
    priorSurgeonName: 'Dr. Emily Vance, MD',
    priorSpecialtyCode: 'OPHTHALMOLOGY',
    priorProcedureName: 'Cataract Extracapsular w/ IOL',
    nextCaseId: 'CASE-2026-8924',
    nextSurgeonName: 'Dr. Emily Vance, MD',
    nextSpecialtyCode: 'OPHTHALMOLOGY',
    nextProcedureName: 'Trabeculectomy ab externo',
    turnoverType: 'SAME_SURGEON',
    priorWheelsOutTime: '2026-11-11T09:15:00Z',
    cleanStartTime: '2026-11-11T09:18:00Z',
    cleanCompleteTime: '2026-11-11T09:28:00Z',
    setupReadyTime: '2026-11-11T09:40:00Z',
    nextWheelsInTime: '2026-11-11T09:44:00Z',
    actualTurnoverMinutes: 29,
    benchmarkTargetMinutes: 15,
    turnoverVarianceMinutes: 14,
    turnoverStatus: 'PROLONGED_TURNOVER',
    delayReasonCode: 'SURGEON_UNAVAILABLE',
    delayDescription: 'Surgeon took unscheduled urgent clinic patient call in office.',
    financialIdleCost: 314.17,
    excessDelayCost: 151.67
  },
  {
    id: 'to-006',
    facilityId: DEFAULT_FACILITY_ID,
    operatingRoomId: 'or-4',
    roomName: 'OR 4 - Spine & Pain Procedures',
    surgeryDate: '2026-11-11',
    priorCaseId: 'CASE-2026-8916',
    priorSurgeonName: 'Dr. Marcus Thorne, MD',
    priorSpecialtyCode: 'SPINE_SURGERY',
    priorProcedureName: 'Lumbar Laminotomy / Discectomy',
    nextCaseId: 'CASE-2026-8917',
    nextSurgeonName: 'Dr. Marcus Thorne, MD',
    nextSpecialtyCode: 'SPINE_SURGERY',
    nextProcedureName: 'Posterior Lumbar Arthrodesis',
    turnoverType: 'SAME_SURGEON',
    priorWheelsOutTime: '2026-11-11T10:45:00Z',
    cleanStartTime: '2026-11-11T10:50:00Z',
    cleanCompleteTime: '2026-11-11T11:08:00Z',
    setupReadyTime: '2026-11-11T11:22:00Z',
    nextWheelsInTime: '2026-11-11T11:32:00Z',
    actualTurnoverMinutes: 47,
    benchmarkTargetMinutes: 30,
    turnoverVarianceMinutes: 17,
    turnoverStatus: 'PROLONGED_TURNOVER',
    delayReasonCode: 'EVS_CLEANING_DELAY',
    delayDescription: 'Heavy fluid containment spill on floor required double wet-vac pass.',
    financialIdleCost: 509.17,
    excessDelayCost: 184.17
  },
  {
    id: 'to-007',
    facilityId: DEFAULT_FACILITY_ID,
    operatingRoomId: 'or-2',
    roomName: 'OR 2 - Robotic & Minimally Invasive',
    surgeryDate: '2026-11-12',
    priorCaseId: 'CASE-2026-8920',
    priorSurgeonName: 'Dr. Amanda Foster, MD',
    priorSpecialtyCode: 'ENT_OTOLARYNGOLOGY',
    priorProcedureName: 'Tympanostomy w/ Tube Insertion',
    nextCaseId: 'CASE-2026-8921',
    nextSurgeonName: 'Dr. Amanda Foster, MD',
    nextSpecialtyCode: 'ENT_OTOLARYNGOLOGY',
    nextProcedureName: 'Tonsillectomy and Adenoidectomy',
    turnoverType: 'SAME_SURGEON',
    priorWheelsOutTime: '2026-11-12T08:45:00Z',
    cleanStartTime: '2026-11-12T08:48:00Z',
    cleanCompleteTime: '2026-11-12T08:56:00Z',
    setupReadyTime: '2026-11-12T09:02:00Z',
    nextWheelsInTime: '2026-11-12T09:04:00Z',
    actualTurnoverMinutes: 19,
    benchmarkTargetMinutes: 20,
    turnoverVarianceMinutes: -1,
    turnoverStatus: 'COMPLIANT',
    delayReasonCode: null,
    delayDescription: 'Smooth pediatric turnover.',
    financialIdleCost: 205.83,
    excessDelayCost: 0.00
  },
  {
    id: 'to-008',
    facilityId: DEFAULT_FACILITY_ID,
    operatingRoomId: 'or-2',
    roomName: 'OR 2 - Robotic & Minimally Invasive',
    surgeryDate: '2026-11-12',
    priorCaseId: 'CASE-2026-8921',
    priorSurgeonName: 'Dr. Amanda Foster, MD',
    priorSpecialtyCode: 'ENT_OTOLARYNGOLOGY',
    priorProcedureName: 'Tonsillectomy and Adenoidectomy',
    nextCaseId: 'CASE-2026-8925',
    nextSurgeonName: 'Dr. Sarah Jenkins, MD',
    nextSpecialtyCode: 'GENERAL_SURGERY',
    nextProcedureName: 'Umbilical Hernia Repair',
    turnoverType: 'DIFFERENT_SURGEON',
    priorWheelsOutTime: '2026-11-12T10:15:00Z',
    cleanStartTime: '2026-11-12T10:18:00Z',
    cleanCompleteTime: '2026-11-12T10:32:00Z',
    setupReadyTime: '2026-11-12T10:52:00Z',
    nextWheelsInTime: '2026-11-12T10:57:00Z',
    actualTurnoverMinutes: 42,
    benchmarkTargetMinutes: 35,
    turnoverVarianceMinutes: 7,
    turnoverStatus: 'MINOR_DELAY',
    delayReasonCode: 'ANESTHESIA_PREOP_DELAY',
    delayDescription: 'Delay placing difficult pediatric peripheral IV line in pre-op.',
    financialIdleCost: 455.00,
    excessDelayCost: 75.83
  },
  {
    id: 'to-009',
    facilityId: DEFAULT_FACILITY_ID,
    operatingRoomId: 'or-1',
    roomName: 'OR 1 - Orthopedic / Arthroscopy',
    surgeryDate: '2026-11-12',
    priorCaseId: 'CASE-2026-8919',
    priorSurgeonName: 'Dr. Kevin Zhao, MD',
    priorSpecialtyCode: 'ORTHOPEDICS',
    priorProcedureName: 'Bicompartmental Knee Arthroscopy',
    nextCaseId: 'CASE-2026-8926',
    nextSurgeonName: 'Dr. Kevin Zhao, MD',
    nextSpecialtyCode: 'ORTHOPEDICS',
    nextProcedureName: 'ACL Reconstruction (Hamstring Autograft)',
    turnoverType: 'SAME_SURGEON',
    priorWheelsOutTime: '2026-11-12T11:30:00Z',
    cleanStartTime: '2026-11-12T11:33:00Z',
    cleanCompleteTime: '2026-11-12T11:44:00Z',
    setupReadyTime: '2026-11-12T11:51:00Z',
    nextWheelsInTime: '2026-11-12T11:54:00Z',
    actualTurnoverMinutes: 24,
    benchmarkTargetMinutes: 25,
    turnoverVarianceMinutes: -1,
    turnoverStatus: 'COMPLIANT',
    delayReasonCode: null,
    delayDescription: 'Ortho arthroscopy back-to-back within standard window.',
    financialIdleCost: 260.00,
    excessDelayCost: 0.00
  },
  {
    id: 'to-010',
    facilityId: DEFAULT_FACILITY_ID,
    operatingRoomId: 'or-1',
    roomName: 'OR 1 - Orthopedic / Arthroscopy',
    surgeryDate: '2026-11-12',
    priorCaseId: 'CASE-2026-8926',
    priorSurgeonName: 'Dr. Kevin Zhao, MD',
    priorSpecialtyCode: 'ORTHOPEDICS',
    priorProcedureName: 'ACL Reconstruction (Hamstring Autograft)',
    nextCaseId: 'CASE-2026-8927',
    nextSurgeonName: 'Dr. Kevin Zhao, MD',
    nextSpecialtyCode: 'ORTHOPEDICS',
    nextProcedureName: 'Carpal Tunnel Release (Endoscopic)',
    turnoverType: 'SAME_SURGEON',
    priorWheelsOutTime: '2026-11-12T14:15:00Z',
    cleanStartTime: '2026-11-12T14:18:00Z',
    cleanCompleteTime: '2026-11-12T14:28:00Z',
    setupReadyTime: '2026-11-12T14:40:00Z',
    nextWheelsInTime: '2026-11-12T14:47:00Z',
    actualTurnoverMinutes: 32,
    benchmarkTargetMinutes: 25,
    turnoverVarianceMinutes: 7,
    turnoverStatus: 'MINOR_DELAY',
    delayReasonCode: 'NURSING_STAFF_SHORTAGE',
    delayDescription: 'Circulating nurse afternoon break coverage handoff delayed.',
    financialIdleCost: 346.67,
    excessDelayCost: 75.83
  },
  {
    id: 'to-011',
    facilityId: DEFAULT_FACILITY_ID,
    operatingRoomId: 'or-4',
    roomName: 'OR 4 - Spine & Pain Procedures',
    surgeryDate: '2026-11-12',
    priorCaseId: 'CASE-2026-8928',
    priorSurgeonName: 'Dr. Marcus Thorne, MD',
    priorSpecialtyCode: 'SPINE_SURGERY',
    priorProcedureName: 'Anterior Cervical Discectomy (ACDF)',
    nextCaseId: 'CASE-2026-8929',
    nextSurgeonName: 'Dr. Marcus Thorne, MD',
    nextSpecialtyCode: 'SPINE_SURGERY',
    nextProcedureName: 'Lumbar Microdiscectomy',
    turnoverType: 'SAME_SURGEON',
    priorWheelsOutTime: '2026-11-12T13:00:00Z',
    cleanStartTime: '2026-11-12T13:05:00Z',
    cleanCompleteTime: '2026-11-12T13:20:00Z',
    setupReadyTime: '2026-11-12T13:38:00Z',
    nextWheelsInTime: '2026-11-12T13:48:00Z',
    actualTurnoverMinutes: 48,
    benchmarkTargetMinutes: 30,
    turnoverVarianceMinutes: 18,
    turnoverStatus: 'PROLONGED_TURNOVER',
    delayReasonCode: 'PATIENT_ADMISSION_DELAY',
    delayDescription: 'Patient late arrival to pre-op registration due to transport failure.',
    financialIdleCost: 520.00,
    excessDelayCost: 195.00
  },
  {
    id: 'to-012',
    facilityId: DEFAULT_FACILITY_ID,
    operatingRoomId: 'or-2',
    roomName: 'OR 2 - Robotic & Minimally Invasive',
    surgeryDate: '2026-11-12',
    priorCaseId: 'CASE-2026-8925',
    priorSurgeonName: 'Dr. Sarah Jenkins, MD',
    priorSpecialtyCode: 'GENERAL_SURGERY',
    priorProcedureName: 'Umbilical Hernia Repair',
    nextCaseId: 'CASE-2026-8930',
    nextSurgeonName: 'Dr. Sarah Jenkins, MD',
    nextSpecialtyCode: 'GENERAL_SURGERY',
    nextProcedureName: 'Excision of Lipoma',
    turnoverType: 'SAME_SURGEON',
    priorWheelsOutTime: '2026-11-12T13:10:00Z',
    cleanStartTime: '2026-11-12T13:13:00Z',
    cleanCompleteTime: '2026-11-12T13:20:00Z',
    setupReadyTime: '2026-11-12T13:25:00Z',
    nextWheelsInTime: '2026-11-12T13:28:00Z',
    actualTurnoverMinutes: 18,
    benchmarkTargetMinutes: 20,
    turnoverVarianceMinutes: -2,
    turnoverStatus: 'COMPLIANT',
    delayReasonCode: null,
    delayDescription: 'Minor soft tissue case turnover on target.',
    financialIdleCost: 195.00,
    excessDelayCost: 0.00
  }
];

export const SEED_TURNOVER_BENCHMARKS = [
  {
    id: 'bench-001',
    facilityId: DEFAULT_FACILITY_ID,
    specialtyCode: 'ORTHOPEDICS',
    specialtyName: 'Orthopedic Surgery',
    sameSurgeonBenchmarkMinutes: 25,
    differentSurgeonBenchmarkMinutes: 40,
    warningThresholdMinutes: 10,
    hourlyRunRateCost: 650.00,
    clinicalRationale: 'Accounts for complex power equipment, traction tables, and heavy instrumentation.'
  },
  {
    id: 'bench-002',
    facilityId: DEFAULT_FACILITY_ID,
    specialtyCode: 'OPHTHALMOLOGY',
    specialtyName: 'Ophthalmology (Eye)',
    sameSurgeonBenchmarkMinutes: 15,
    differentSurgeonBenchmarkMinutes: 25,
    warningThresholdMinutes: 8,
    hourlyRunRateCost: 650.00,
    clinicalRationale: 'High-volume rapid turnover model with pre-staged stretchers and microscope setup.'
  },
  {
    id: 'bench-003',
    facilityId: DEFAULT_FACILITY_ID,
    specialtyCode: 'GENERAL_SURGERY',
    specialtyName: 'General Surgery',
    sameSurgeonBenchmarkMinutes: 20,
    differentSurgeonBenchmarkMinutes: 35,
    warningThresholdMinutes: 10,
    hourlyRunRateCost: 650.00,
    clinicalRationale: 'Standard lap tower and insufflation turnover with standard sterile drape change.'
  },
  {
    id: 'bench-004',
    facilityId: DEFAULT_FACILITY_ID,
    specialtyCode: 'ENT_OTOLARYNGOLOGY',
    specialtyName: 'ENT / Otolaryngology',
    sameSurgeonBenchmarkMinutes: 20,
    differentSurgeonBenchmarkMinutes: 30,
    warningThresholdMinutes: 10,
    hourlyRunRateCost: 650.00,
    clinicalRationale: 'Microscopic and pediatric airway setups with suction canister replacements.'
  },
  {
    id: 'bench-005',
    facilityId: DEFAULT_FACILITY_ID,
    specialtyCode: 'SPINE_SURGERY',
    specialtyName: 'Spine Surgery',
    sameSurgeonBenchmarkMinutes: 30,
    differentSurgeonBenchmarkMinutes: 45,
    warningThresholdMinutes: 12,
    hourlyRunRateCost: 650.00,
    clinicalRationale: 'Jackson table positioning, C-arm sterile draping, neuromonitoring leads setup.'
  },
  {
    id: 'bench-006',
    facilityId: DEFAULT_FACILITY_ID,
    specialtyCode: 'UROLOGY',
    specialtyName: 'Urology',
    sameSurgeonBenchmarkMinutes: 20,
    differentSurgeonBenchmarkMinutes: 35,
    warningThresholdMinutes: 10,
    hourlyRunRateCost: 650.00,
    clinicalRationale: 'Cystoscopy and ureteroscopy irrigation fluid containment setup.'
  }
];

