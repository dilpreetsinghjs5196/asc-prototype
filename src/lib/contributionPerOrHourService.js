/**
 * ==============================================================================
 * Contribution Per OR Hour & Financial Yield Service
 * Phase 75: Operating Room Capacity Economics & Procedural Throughput Analytics
 * ==============================================================================
 * 
 * Unites Phase 73 (Facility Financial Settings) and Phase 74 (Contribution Margin Engine)
 * with clinical perioperative time logs (operating room minutes, turnovers, and block allocation).
 * 
 * Strict Healthcare Financial Governance:
 * - Fixed precision arithmetic (NUMERIC(10,2), NUMERIC(12,2))
 * - Zero division protection: GREATEST(or_minutes, 1.00)
 * - Maestro Clinical Design System: strictly Slate, Emerald, Sky, Amber, Rose
 */

import { contributionMarginEngineService } from './contributionMarginEngineService.js';
import { facilityFinancialSettingsService } from './facilityFinancialSettingsService.js';

export const OR_YIELD_TIERS = {
  PRIME_YIELD: 'PRIME_YIELD',
  ABOVE_TARGET: 'ABOVE_TARGET',
  TARGET_MET: 'TARGET_MET',
  SUB_TARGET: 'SUB_TARGET',
  DILUTIVE: 'DILUTIVE'
};

export const OR_YIELD_TIER_CONFIG = {
  [OR_YIELD_TIERS.PRIME_YIELD]: {
    key: OR_YIELD_TIERS.PRIME_YIELD,
    label: 'Prime Yield (≥1.5x)',
    shortLabel: 'Prime Yield',
    thresholdText: 'Yield ≥ 150% of Hurdle (≥$2,250/hr)',
    colorToken: 'emerald',
    badgeClass: 'bg-emerald-950/40 text-emerald-300 border-emerald-800',
    description: 'Outstanding margin generation per OR suite minute; prime block candidate.'
  },
  [OR_YIELD_TIERS.ABOVE_TARGET]: {
    key: OR_YIELD_TIERS.ABOVE_TARGET,
    label: 'Above Target (1.1x–1.5x)',
    shortLabel: 'Above Target',
    thresholdText: 'Yield 110% – 149% of Hurdle ($1,650–$2,249/hr)',
    colorToken: 'sky',
    badgeClass: 'bg-sky-950/40 text-sky-300 border-sky-800',
    description: 'High velocity and solid contribution margin exceeding annual ASC hurdle.'
  },
  [OR_YIELD_TIERS.TARGET_MET]: {
    key: OR_YIELD_TIERS.TARGET_MET,
    label: 'Target Met (0.9x–1.1x)',
    shortLabel: 'Target Met',
    thresholdText: 'Yield 90% – 109% of Hurdle ($1,350–$1,649/hr)',
    colorToken: 'slate',
    badgeClass: 'bg-slate-800/60 text-slate-300 border-slate-700',
    description: 'Surgical case meets baseline staffed OR hour capacity costs.'
  },
  [OR_YIELD_TIERS.SUB_TARGET]: {
    key: OR_YIELD_TIERS.SUB_TARGET,
    label: 'Sub-Target (<0.9x)',
    shortLabel: 'Sub-Target',
    thresholdText: 'Yield < 90% of Hurdle (<$1,350/hr)',
    colorToken: 'amber',
    badgeClass: 'bg-amber-950/40 text-amber-300 border-amber-800',
    description: 'Low yield density per OR hour; examine case duration or supply costs.'
  },
  [OR_YIELD_TIERS.DILUTIVE]: {
    key: OR_YIELD_TIERS.DILUTIVE,
    label: 'Dilutive (<$0/hr)',
    shortLabel: 'Dilutive (Loss)',
    thresholdText: 'Negative Contribution Margin (<$0/hr)',
    colorToken: 'rose',
    badgeClass: 'bg-rose-950/40 text-rose-300 border-rose-800',
    description: 'Case operates at a cash loss while exhausting limited OR suite capacity.'
  }
};

export const BENCHMARK_TURNOVER_MINUTES = 20.00;
export const TURNOVER_DRAG_RATE_PER_MIN = 15.00;
export const DEFAULT_TARGET_HOURLY_HURDLE = 1500.00;

export function roundToTwo(num) {
  if (num === null || num === undefined || isNaN(num)) return 0.00;
  return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
}

export function roundToThree(num) {
  if (num === null || num === undefined || isNaN(num)) return 0.000;
  return Math.round((Number(num) + Number.EPSILON) * 1000) / 1000;
}

export const contributionPerOrHourService = {
  /**
   * Classifies hourly yield and contribution margin into authoritative yield tiers.
   */
  classifyYieldTier(cmPerHour, targetHurdle = DEFAULT_TARGET_HOURLY_HURDLE, contributionMargin = 0) {
    const cm = Number(contributionMargin) || 0.00;
    const hourly = Number(cmPerHour) || 0.00;
    const hurdle = GREATEST(Number(targetHurdle) || DEFAULT_TARGET_HOURLY_HURDLE, 0.01);

    if (cm < 0.00 || hourly < 0.00) {
      return OR_YIELD_TIERS.DILUTIVE;
    }
    if (hourly >= hurdle * 1.50) {
      return OR_YIELD_TIERS.PRIME_YIELD;
    }
    if (hourly >= hurdle * 1.10) {
      return OR_YIELD_TIERS.ABOVE_TARGET;
    }
    if (hourly >= hurdle * 0.90) {
      return OR_YIELD_TIERS.TARGET_MET;
    }
    return OR_YIELD_TIERS.SUB_TARGET;
  },

  /**
   * Calculates deterministic OR financial yield metrics for a surgical case.
   */
  calculateCaseOrYield(caseRecord, targetHurdle = DEFAULT_TARGET_HOURLY_HURDLE) {
    if (!caseRecord) {
      throw new Error('Invalid case record supplied to calculateCaseOrYield');
    }

    const orMins = Math.max(Number(caseRecord.orMinutes || caseRecord.actualDurationMinutes || caseRecord.durationMinutes || 60), 1.00);
    const turnoverMins = Math.max(Number(caseRecord.turnoverMinutes !== undefined ? caseRecord.turnoverMinutes : (caseRecord.turnover_time || 20)), 0.00);
    const hurdle = Math.max(Number(targetHurdle) || DEFAULT_TARGET_HOURLY_HURDLE, 0.01);

    // Contribution Margins
    const expCM = Number(caseRecord.expectedContributionMargin !== undefined ? caseRecord.expectedContributionMargin : 1450.00);
    const actCM = Number(caseRecord.actualContributionMargin !== undefined ? caseRecord.actualContributionMargin : expCM);

    const totalRoomMinutes = roundToTwo(orMins + turnoverMins);
    const cmPerOrMinute = roundToTwo(expCM / orMins);
    const cmPerOrHour = roundToTwo((expCM / orMins) * 60.00);
    const actualCmPerOrHour = roundToTwo((actCM / orMins) * 60.00);

    const yieldVarianceHourly = roundToTwo(cmPerOrHour - hurdle);
    const yieldIndex = roundToThree(cmPerOrHour / hurdle);

    // Turnover drag cost: Excess minutes above 20 benchmark mins evaluated at $15/min
    let turnoverDragCost = 0.00;
    if (turnoverMins > BENCHMARK_TURNOVER_MINUTES) {
      turnoverDragCost = roundToTwo((turnoverMins - BENCHMARK_TURNOVER_MINUTES) * TURNOVER_DRAG_RATE_PER_MIN);
    }

    const yieldTier = this.classifyYieldTier(cmPerOrHour, hurdle, expCM);

    return {
      surgeryId: caseRecord.id || caseRecord.surgeryId,
      facilityId: caseRecord.facilityId || 'fac-001',
      orRoomName: caseRecord.orRoomName || caseRecord.or_room || 'OR 1',
      operatingRoomId: caseRecord.operatingRoomId || null,
      surgeonName: caseRecord.surgeonName || caseRecord.doctor_name || 'Dr. Unassigned',
      surgeonId: caseRecord.surgeonId || null,
      specialty: caseRecord.specialty || 'General Surgery',
      procedureName: caseRecord.procedureName || caseRecord.procedure || 'Surgical Procedure',
      cptCodes: caseRecord.cptCodes || caseRecord.cpt_codes || '47562',
      orMinutes: orMins,
      turnoverMinutes: turnoverMins,
      totalRoomMinutes,
      expectedContributionMargin: roundToTwo(expCM),
      actualContributionMargin: roundToTwo(actCM),
      cmPerOrMinute,
      cmPerOrHour,
      actualCmPerOrHour,
      targetHourlyHurdle: hurdle,
      yieldVarianceHourly,
      yieldIndex,
      yieldTier,
      tierConfig: OR_YIELD_TIER_CONFIG[yieldTier],
      turnoverDragCost,
      isProvisional: Boolean(caseRecord.isProvisional)
    };
  },

  /**
   * Aggregates OR Room Suite Financial Yields across a set of cases.
   */
  aggregateOrRoomYield(cases = [], targetHurdle = DEFAULT_TARGET_HOURLY_HURDLE) {
    const roomMap = {};

    cases.forEach(c => {
      const yieldResult = this.calculateCaseOrYield(c, targetHurdle);
      const room = yieldResult.orRoomName;

      if (!roomMap[room]) {
        roomMap[room] = {
          roomName: room,
          totalCases: 0,
          totalOrMinutes: 0,
          totalTurnoverMinutes: 0,
          totalRoomMinutes: 0,
          totalExpectedCM: 0,
          totalActualCM: 0,
          totalTurnoverDrag: 0,
          primeYieldCases: 0,
          dilutiveCases: 0
        };
      }

      const item = roomMap[room];
      item.totalCases += 1;
      item.totalOrMinutes += yieldResult.orMinutes;
      item.totalTurnoverMinutes += yieldResult.turnoverMinutes;
      item.totalRoomMinutes += yieldResult.totalRoomMinutes;
      item.totalExpectedCM += yieldResult.expectedContributionMargin;
      item.totalActualCM += yieldResult.actualContributionMargin;
      item.totalTurnoverDrag += yieldResult.turnoverDragCost;
      if (yieldResult.yieldTier === OR_YIELD_TIERS.PRIME_YIELD) item.primeYieldCases += 1;
      if (yieldResult.yieldTier === OR_YIELD_TIERS.DILUTIVE) item.dilutiveCases += 1;
    });

    return Object.values(roomMap).map(rm => {
      const totalOrHours = roundToTwo(rm.totalOrMinutes / 60.00);
      const totalOccupancyHours = roundToTwo(rm.totalRoomMinutes / 60.00);
      const avgCmPerUtilizedHour = rm.totalOrMinutes > 0
        ? roundToTwo((rm.totalExpectedCM / rm.totalOrMinutes) * 60.00)
        : 0.00;
      const avgCmPerOccupancyHour = rm.totalRoomMinutes > 0
        ? roundToTwo((rm.totalExpectedCM / rm.totalRoomMinutes) * 60.00)
        : 0.00;
      const primeYieldPct = rm.totalCases > 0
        ? roundToTwo((rm.primeYieldCases / rm.totalCases) * 100.00)
        : 0.00;

      return {
        ...rm,
        totalExpectedCM: roundToTwo(rm.totalExpectedCM),
        totalActualCM: roundToTwo(rm.totalActualCM),
        totalTurnoverDrag: roundToTwo(rm.totalTurnoverDrag),
        totalOrHours,
        totalOccupancyHours,
        avgCmPerUtilizedHour,
        avgCmPerOccupancyHour,
        primeYieldPct
      };
    }).sort((a, b) => b.avgCmPerUtilizedHour - a.avgCmPerUtilizedHour);
  },

  /**
   * Aggregates Surgeon Yield Benchmarks across a set of cases.
   */
  aggregateSurgeonYield(cases = [], targetHurdle = DEFAULT_TARGET_HOURLY_HURDLE) {
    const surgeonMap = {};

    cases.forEach(c => {
      const yieldResult = this.calculateCaseOrYield(c, targetHurdle);
      const surgeon = yieldResult.surgeonName;

      if (!surgeonMap[surgeon]) {
        surgeonMap[surgeon] = {
          surgeonName: surgeon,
          specialty: yieldResult.specialty,
          totalCases: 0,
          totalOrMinutes: 0,
          totalExpectedCM: 0,
          targetMetCases: 0,
          primeYieldCases: 0,
          dilutiveCases: 0
        };
      }

      const item = surgeonMap[surgeon];
      item.totalCases += 1;
      item.totalOrMinutes += yieldResult.orMinutes;
      item.totalExpectedCM += yieldResult.expectedContributionMargin;
      if ([OR_YIELD_TIERS.PRIME_YIELD, OR_YIELD_TIERS.ABOVE_TARGET, OR_YIELD_TIERS.TARGET_MET].includes(yieldResult.yieldTier)) {
        item.targetMetCases += 1;
      }
      if (yieldResult.yieldTier === OR_YIELD_TIERS.PRIME_YIELD) item.primeYieldCases += 1;
      if (yieldResult.yieldTier === OR_YIELD_TIERS.DILUTIVE) item.dilutiveCases += 1;
    });

    return Object.values(surgeonMap).map(s => {
      const totalOrHours = roundToTwo(s.totalOrMinutes / 60.00);
      const avgCmPerOrHour = s.totalOrMinutes > 0
        ? roundToTwo((s.totalExpectedCM / s.totalOrMinutes) * 60.00)
        : 0.00;
      const hurdleCompliancePct = s.totalCases > 0
        ? roundToTwo((s.targetMetCases / s.totalCases) * 100.00)
        : 0.00;

      return {
        ...s,
        totalExpectedCM: roundToTwo(s.totalExpectedCM),
        totalOrHours,
        avgCmPerOrHour,
        hurdleCompliancePct
      };
    }).sort((a, b) => b.avgCmPerOrHour - a.avgCmPerOrHour);
  },

  /**
   * Aggregates Specialty Yield Matrix across a set of cases.
   */
  aggregateSpecialtyYield(cases = [], targetHurdle = DEFAULT_TARGET_HOURLY_HURDLE) {
    const specialtyMap = {};

    cases.forEach(c => {
      const yieldResult = this.calculateCaseOrYield(c, targetHurdle);
      const spec = yieldResult.specialty || 'General Surgery';

      if (!specialtyMap[spec]) {
        specialtyMap[spec] = {
          specialty: spec,
          totalCases: 0,
          totalOrMinutes: 0,
          totalTurnoverMinutes: 0,
          totalExpectedCM: 0,
          highYieldCases: 0
        };
      }

      const item = specialtyMap[spec];
      item.totalCases += 1;
      item.totalOrMinutes += yieldResult.orMinutes;
      item.totalTurnoverMinutes += yieldResult.turnoverMinutes;
      item.totalExpectedCM += yieldResult.expectedContributionMargin;
      if ([OR_YIELD_TIERS.PRIME_YIELD, OR_YIELD_TIERS.ABOVE_TARGET].includes(yieldResult.yieldTier)) {
        item.highYieldCases += 1;
      }
    });

    return Object.values(specialtyMap).map(sp => {
      const totalOrHours = roundToTwo(sp.totalOrMinutes / 60.00);
      const avgCaseMinutes = sp.totalCases > 0 ? roundToTwo(sp.totalOrMinutes / sp.totalCases) : 0.00;
      const avgTurnoverMinutes = sp.totalCases > 0 ? roundToTwo(sp.totalTurnoverMinutes / sp.totalCases) : 0.00;
      const avgCmPerOrHour = sp.totalOrMinutes > 0
        ? roundToTwo((sp.totalExpectedCM / sp.totalOrMinutes) * 60.00)
        : 0.00;
      const highYieldPct = sp.totalCases > 0
        ? roundToTwo((sp.highYieldCases / sp.totalCases) * 100.00)
        : 0.00;

      return {
        ...sp,
        totalExpectedCM: roundToTwo(sp.totalExpectedCM),
        totalOrHours,
        avgCaseMinutes,
        avgTurnoverMinutes,
        avgCmPerOrHour,
        highYieldPct
      };
    }).sort((a, b) => b.avgCmPerOrHour - a.avgCmPerOrHour);
  },

  /**
   * Calculates overall facility KPI banner metrics.
   */
  calculateFacilityYieldKpis(cases = [], targetHurdle = DEFAULT_TARGET_HOURLY_HURDLE) {
    let totalOrMinutes = 0;
    let totalTurnoverMinutes = 0;
    let totalExpectedCM = 0;
    let totalTurnoverDrag = 0;
    let primeYieldCases = 0;
    let dilutiveCases = 0;

    cases.forEach(c => {
      const y = this.calculateCaseOrYield(c, targetHurdle);
      totalOrMinutes += y.orMinutes;
      totalTurnoverMinutes += y.turnoverMinutes;
      totalExpectedCM += y.expectedContributionMargin;
      totalTurnoverDrag += y.turnoverDragCost;
      if (y.yieldTier === OR_YIELD_TIERS.PRIME_YIELD) primeYieldCases += 1;
      if (y.yieldTier === OR_YIELD_TIERS.DILUTIVE) dilutiveCases += 1;
    });

    const totalCases = cases.length;
    const totalOrHours = roundToTwo(totalOrMinutes / 60.00);
    const facilityAvgCmPerOrHour = totalOrMinutes > 0
      ? roundToTwo((totalExpectedCM / totalOrMinutes) * 60.00)
      : 0.00;
    const primeYieldPct = totalCases > 0
      ? roundToTwo((primeYieldCases / totalCases) * 100.00)
      : 0.00;

    return {
      totalCases,
      totalOrHours,
      totalTurnoverHours: roundToTwo(totalTurnoverMinutes / 60.00),
      totalExpectedCM: roundToTwo(totalExpectedCM),
      facilityAvgCmPerOrHour,
      targetHurdle,
      hourlyVariance: roundToTwo(facilityAvgCmPerOrHour - targetHurdle),
      primeYieldPct,
      primeYieldCases,
      dilutiveCases,
      totalTurnoverDrag: roundToTwo(totalTurnoverDrag)
    };
  },

  /**
   * Generates comprehensive baseline sample cases for UI and static test verification.
   */
  getBaselineSampleCases() {
    return [
      {
        id: 201,
        patient: 'Eleanor Vance',
        mrn: 'MRN-90214',
        procedure: 'Phacoemulsification Cataract Extr w/ IOL',
        cpt_codes: '66984',
        date: '2026-10-24',
        surgeonName: 'Dr. James Thorne, MD',
        specialty: 'Ophthalmology',
        or_room: 'OR 3',
        orMinutes: 24,
        turnoverMinutes: 14,
        expectedContributionMargin: 1250.00,
        actualContributionMargin: 1250.00
      },
      {
        id: 202,
        patient: 'Marcus Brody',
        mrn: 'MRN-77312',
        procedure: 'Knee Arthroscopy & Partial Meniscectomy',
        cpt_codes: '29881',
        date: '2026-10-24',
        surgeonName: 'Dr. Sarah Lin, MD',
        specialty: 'Orthopedics',
        or_room: 'OR 1',
        orMinutes: 48,
        turnoverMinutes: 22,
        expectedContributionMargin: 1680.00,
        actualContributionMargin: 1600.00
      },
      {
        id: 203,
        patient: 'Robert Sterling',
        mrn: 'MRN-84511',
        procedure: 'Laparoscopic Cholecystectomy',
        cpt_codes: '47562',
        date: '2026-10-25',
        surgeonName: 'Dr. Robert Chen, MD',
        specialty: 'General Surgery',
        or_room: 'OR 2',
        orMinutes: 75,
        turnoverMinutes: 32,
        expectedContributionMargin: 1820.00,
        actualContributionMargin: 1750.00
      },
      {
        id: 204,
        patient: 'Claire Bennet',
        mrn: 'MRN-62190',
        procedure: 'Total Hip Arthroplasty (Anterior Approach)',
        cpt_codes: '27130',
        date: '2026-10-25',
        surgeonName: 'Dr. Sarah Lin, MD',
        specialty: 'Orthopedics',
        or_room: 'OR 1',
        orMinutes: 135,
        turnoverMinutes: 26,
        expectedContributionMargin: 3100.00,
        actualContributionMargin: 3000.00
      },
      {
        id: 205,
        patient: 'Gregory House',
        mrn: 'MRN-55419',
        procedure: 'Lumbar Epidural Steroid Injection L4-L5',
        cpt_codes: '62323',
        date: '2026-10-26',
        surgeonName: 'Dr. Alistair Finch, MD',
        specialty: 'Pain Management',
        or_room: 'OR 4',
        orMinutes: 18,
        turnoverMinutes: 12,
        expectedContributionMargin: 820.00,
        actualContributionMargin: 820.00
      },
      {
        id: 206,
        patient: 'Thomas Wayne',
        mrn: 'MRN-43098',
        procedure: 'Tympanoplasty w/ Mastoidectomy',
        cpt_codes: '69641',
        date: '2026-10-26',
        surgeonName: 'Dr. Elena Rostova, MD',
        specialty: 'ENT',
        or_room: 'OR 2',
        orMinutes: 110,
        turnoverMinutes: 28,
        expectedContributionMargin: 1420.00,
        actualContributionMargin: 1300.00
      },
      {
        id: 207,
        patient: 'Victor Fries',
        mrn: 'MRN-33120',
        procedure: 'Excision Complex Soft Tissue Mass',
        cpt_codes: '27048',
        date: '2026-10-27',
        surgeonName: 'Dr. Robert Chen, MD',
        specialty: 'General Surgery',
        or_room: 'OR 3',
        orMinutes: 90,
        turnoverMinutes: 35,
        expectedContributionMargin: -280.00,
        actualContributionMargin: -320.00
      }
    ];
  }
};

function GREATEST(val, minVal) {
  return Math.max(val, minVal);
}

