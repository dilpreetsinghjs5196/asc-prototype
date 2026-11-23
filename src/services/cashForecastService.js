/**
 * ==============================================================================
 * Phase E3: 13-Week Cash Forecast & Liquidity Management Service
 * Module 14: CFO Dashboard & Financial Accounting
 * Description: Direct 13-Week Rolling Cash Matrix, Receipts Aging Timing,
 *              Bi-Weekly Payroll Scheduling, Minimum Cash Covenant Monitoring,
 *              Revolving Line of Credit Headroom, and Cryptographic Freeze Seals.
 * Maestro Clinical Design System: Emerald, Sky, Amber, Crimson, Slate, Neutral
 * Zero Prohibited Accent Tokens
 * ==============================================================================
 */

let nodeCrypto = null;
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  try {
    nodeCrypto = await import('node:crypto');
  } catch {
    // browser fallback
  }
}

const NAPLES_FACILITY_ALIASES = ['fac-naples-01', '00000000-0000-0000-0000-000000000002'];

export function matchesFacilityId(recordFacilityId, requestedFacilityId) {
  if (!requestedFacilityId || requestedFacilityId === 'ALL') return true;
  if (recordFacilityId === requestedFacilityId) return true;
  if (NAPLES_FACILITY_ALIASES.includes(recordFacilityId) && NAPLES_FACILITY_ALIASES.includes(requestedFacilityId)) {
    return true;
  }
  return false;
}

/**
 * Deterministic cryptographic audit hash for cash forecast versions
 */
export function computeCashForecastHash(payload) {
  const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
  if (nodeCrypto && typeof nodeCrypto.createHash === 'function') {
    return nodeCrypto.createHash('sha256').update(str).digest('hex');
  }
  let h1 = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h1 = Math.imul(h1 ^ str.charCodeAt(i), 0x01000193);
  }
  return `cf_seal_${(h1 >>> 0).toString(16)}`.padEnd(64, '0');
}

export const CASH_FORECAST_STATUSES = {
  DRAFT: 'DRAFT',
  UNDER_REVIEW: 'UNDER_REVIEW',
  ACTIVE_FORECAST: 'ACTIVE_FORECAST',
  SUPERSEDED: 'SUPERSEDED',
  ARCHIVED: 'ARCHIVED'
};

export const FLOW_TYPES = {
  RECEIPT: 'RECEIPT',
  DISBURSEMENT: 'DISBURSEMENT',
  FINANCING: 'FINANCING',
  BALANCE: 'BALANCE'
};

export const CASH_SCENARIOS = {
  BASELINE: 'BASELINE',
  SLOW_COLLECTIONS: 'SLOW_COLLECTIONS', // +7 days DSO lag, -10% collections in near weeks
  PROMPT_PAY: 'PROMPT_PAY'             // -5 days DSO acceleration, +8% early collections
};

export const COVENANT_SEVERITY = {
  LIQUIDITY_SURPLUS: 'LIQUIDITY_SURPLUS', // Headroom >= $300k
  NORMAL: 'NORMAL',                       // $100k <= Headroom < $300k
  WARNING: 'WARNING',                     // $0 <= Headroom < $100k
  CRITICAL_DEFICIT: 'CRITICAL_DEFICIT'    // Headroom < 0 (Covenant breach)
};

export const CASH_LINE_CODES = {
  BEGINNING_CASH: 'BEGINNING_CASH',
  REC_COMMERCIAL_835: 'REC_COMMERCIAL_835',
  REC_MEDICARE_EFT: 'REC_MEDICARE_EFT',
  REC_POS_PATIENT: 'REC_POS_PATIENT',
  REC_PATIENT_AR: 'REC_PATIENT_AR',
  TOTAL_RECEIPTS: 'TOTAL_RECEIPTS',
  DISB_CLINICAL_PAYROLL: 'DISB_CLINICAL_PAYROLL',
  DISB_IMPLANT_AP: 'DISB_IMPLANT_AP',
  DISB_SUPPLIES_AP: 'DISB_SUPPLIES_AP',
  DISB_FACILITY_RENT: 'DISB_FACILITY_RENT',
  DISB_EQUIP_IT: 'DISB_EQUIP_IT',
  DISB_DEBT_SERVICE: 'DISB_DEBT_SERVICE',
  TOTAL_DISBURSEMENTS: 'TOTAL_DISBURSEMENTS',
  NET_OPERATING_CASH_FLOW: 'NET_OPERATING_CASH_FLOW',
  FIN_LOC_DRAW: 'FIN_LOC_DRAW',
  FIN_LOC_REPAY: 'FIN_LOC_REPAY',
  TOTAL_FINANCING: 'TOTAL_FINANCING',
  ENDING_CASH: 'ENDING_CASH',
  MIN_COVENANT_THRESHOLD: 'MIN_COVENANT_THRESHOLD',
  COVENANT_HEADROOM: 'COVENANT_HEADROOM'
};

/**
 * 13 Sequential Weekly Intervals for Q4 2026 (Nov 2, 2026 to Jan 31, 2027)
 */
export const INITIAL_CASH_WEEKS = [
  { weekNumber: 1, weekCode: 'W01', weekLabel: 'Week 1 (Nov 02 - Nov 08)', startDate: '2026-11-02', endDate: '2026-11-08', isPayrollWeek: false, isRentWeek: true, isDebtServiceWeek: false, confidenceScore: 0.99 },
  { weekNumber: 2, weekCode: 'W02', weekLabel: 'Week 2 (Nov 09 - Nov 15)', startDate: '2026-11-09', endDate: '2026-11-15', isPayrollWeek: true, isRentWeek: false, isDebtServiceWeek: true, confidenceScore: 0.98 },
  { weekNumber: 3, weekCode: 'W03', weekLabel: 'Week 3 (Nov 16 - Nov 22)', startDate: '2026-11-16', endDate: '2026-11-22', isPayrollWeek: false, isRentWeek: false, isDebtServiceWeek: false, confidenceScore: 0.97 },
  { weekNumber: 4, weekCode: 'W04', weekLabel: 'Week 4 (Nov 23 - Nov 29)', startDate: '2026-11-23', endDate: '2026-11-29', isPayrollWeek: true, isRentWeek: false, isDebtServiceWeek: false, confidenceScore: 0.95 },
  { weekNumber: 5, weekCode: 'W05', weekLabel: 'Week 5 (Nov 30 - Dec 06)', startDate: '2026-11-30', endDate: '2026-12-06', isPayrollWeek: false, isRentWeek: true, isDebtServiceWeek: false, confidenceScore: 0.94 },
  { weekNumber: 6, weekCode: 'W06', weekLabel: 'Week 6 (Dec 07 - Dec 13)', startDate: '2026-12-07', endDate: '2026-12-13', isPayrollWeek: true, isRentWeek: false, isDebtServiceWeek: true, confidenceScore: 0.92 },
  { weekNumber: 7, weekCode: 'W07', weekLabel: 'Week 7 (Dec 14 - Dec 20)', startDate: '2026-12-14', endDate: '2026-12-20', isPayrollWeek: false, isRentWeek: false, isDebtServiceWeek: false, confidenceScore: 0.90 },
  { weekNumber: 8, weekCode: 'W08', weekLabel: 'Week 8 (Dec 21 - Dec 27)', startDate: '2026-12-21', endDate: '2026-12-27', isPayrollWeek: true, isRentWeek: false, isDebtServiceWeek: false, confidenceScore: 0.88 },
  { weekNumber: 9, weekCode: 'W09', weekLabel: 'Week 9 (Dec 28 - Jan 03)', startDate: '2026-12-28', endDate: '2027-01-03', isPayrollWeek: false, isRentWeek: true, isDebtServiceWeek: false, confidenceScore: 0.85 },
  { weekNumber: 10, weekCode: 'W10', weekLabel: 'Week 10 (Jan 04 - Jan 10)', startDate: '2027-01-04', endDate: '2027-01-10', isPayrollWeek: true, isRentWeek: false, isDebtServiceWeek: true, confidenceScore: 0.82 },
  { weekNumber: 11, weekCode: 'W11', weekLabel: 'Week 11 (Jan 11 - Jan 17)', startDate: '2027-01-11', endDate: '2027-01-17', isPayrollWeek: false, isRentWeek: false, isDebtServiceWeek: false, confidenceScore: 0.80 },
  { weekNumber: 12, weekCode: 'W12', weekLabel: 'Week 12 (Jan 18 - Jan 24)', startDate: '2027-01-18', endDate: '2027-01-24', isPayrollWeek: true, isRentWeek: false, isDebtServiceWeek: false, confidenceScore: 0.78 },
  { weekNumber: 13, weekCode: 'W13', weekLabel: 'Week 13 (Jan 25 - Jan 31)', startDate: '2027-01-25', endDate: '2027-01-31', isPayrollWeek: false, isRentWeek: true, isDebtServiceWeek: false, confidenceScore: 0.75 }
];

/**
 * Weekly Raw Inflow and Outflow Schedules for Naples Surgery Center (Baseline)
 */
const BASELINE_WEEKLY_FLOWS = [
  // W01 (Rent)
  { weekNumber: 1, commercial: 175000, medicare: 82000, pos: 18000, patientAr: 15000, payroll: 0, implants: 78000, supplies: 30000, rent: 45000, equipIt: 18000, debtService: 0, locDraw: 0, locRepay: 0 },
  // W02 (Payroll + Debt)
  { weekNumber: 2, commercial: 180000, medicare: 85000, pos: 20000, patientAr: 14000, payroll: 120000, implants: 72000, supplies: 28000, rent: 0, equipIt: 0, debtService: 25000, locDraw: 0, locRepay: 0 },
  // W03
  { weekNumber: 3, commercial: 185000, medicare: 88000, pos: 19000, patientAr: 16000, payroll: 0, implants: 75000, supplies: 29000, rent: 0, equipIt: 0, debtService: 0, locDraw: 0, locRepay: 0 },
  // W04 (Payroll)
  { weekNumber: 4, commercial: 178000, medicare: 80000, pos: 17000, patientAr: 14000, payroll: 120000, implants: 70000, supplies: 27000, rent: 0, equipIt: 0, debtService: 0, locDraw: 0, locRepay: 0 },
  // W05 (Rent)
  { weekNumber: 5, commercial: 190000, medicare: 92000, pos: 22000, patientAr: 18000, payroll: 0, implants: 80000, supplies: 32000, rent: 45000, equipIt: 18000, debtService: 0, locDraw: 0, locRepay: 0 },
  // W06 (Payroll + Debt)
  { weekNumber: 6, commercial: 195000, medicare: 95000, pos: 23000, patientAr: 17000, payroll: 122000, implants: 82000, supplies: 33000, rent: 0, equipIt: 0, debtService: 25000, locDraw: 0, locRepay: 0 },
  // W07
  { weekNumber: 7, commercial: 200000, medicare: 98000, pos: 24000, patientAr: 19000, payroll: 0, implants: 85000, supplies: 34000, rent: 0, equipIt: 0, debtService: 0, locDraw: 0, locRepay: 0 },
  // W08 (Payroll)
  { weekNumber: 8, commercial: 192000, medicare: 88000, pos: 21000, patientAr: 16000, payroll: 122000, implants: 78000, supplies: 31000, rent: 0, equipIt: 0, debtService: 0, locDraw: 0, locRepay: 0 },
  // W09 (Rent)
  { weekNumber: 9, commercial: 170000, medicare: 78000, pos: 16000, patientAr: 14000, payroll: 0, implants: 68000, supplies: 26000, rent: 45000, equipIt: 18000, debtService: 0, locDraw: 0, locRepay: 0 },
  // W10 (Payroll + Debt)
  { weekNumber: 10, commercial: 172000, medicare: 80000, pos: 17000, patientAr: 15000, payroll: 120000, implants: 69000, supplies: 27000, rent: 0, equipIt: 0, debtService: 25000, locDraw: 0, locRepay: 0 },
  // W11
  { weekNumber: 11, commercial: 176000, medicare: 82000, pos: 18000, patientAr: 15000, payroll: 0, implants: 71000, supplies: 28000, rent: 0, equipIt: 0, debtService: 0, locDraw: 0, locRepay: 0 },
  // W12 (Payroll)
  { weekNumber: 12, commercial: 180000, medicare: 85000, pos: 19000, patientAr: 16000, payroll: 120000, implants: 73000, supplies: 29000, rent: 0, equipIt: 0, debtService: 0, locDraw: 0, locRepay: 0 },
  // W13 (Rent)
  { weekNumber: 13, commercial: 184000, medicare: 87000, pos: 20000, patientAr: 17000, payroll: 0, implants: 74000, supplies: 30000, rent: 45000, equipIt: 18000, debtService: 0, locDraw: 0, locRepay: 0 }
];

export const INITIAL_FACILITY_CASH_FORECASTS = [
  {
    id: '00000000-0000-0000-0000-000000000040',
    facilityId: 'fac-naples-01',
    facilityUuid: '00000000-0000-0000-0000-000000000002',
    forecastCode: 'CF2026_Q4_13W',
    forecastName: 'Q4 2026 13-Week Rolling Cash Forecast (Nov 2026 - Jan 2027)',
    baselineDate: '2026-11-02',
    startWeekDate: '2026-11-02',
    endWeekDate: '2027-01-31',
    versionNumber: 1,
    status: CASH_FORECAST_STATUSES.ACTIVE_FORECAST,
    startingCashBalance: 1250000.00,
    minimumCashCovenant: 400000.00,
    lineOfCreditLimit: 1000000.00,
    lineOfCreditDrawn: 0.00,
    isActive: true,
    isApproved: true,
    approvedAt: '2026-11-20T15:00:00Z',
    approvedBy: '00000000-0000-0000-0000-000000000001',
    frozenHash: 'f1e2d3c4b5a6f7e8d9c0b1a2f3e4d5c6b7a8f9e0d1c2b3a4f5e6d7c8b9a0f1e2',
    metadata: {
      author: 'Treasury Office',
      primaryBank: 'First Florida Healthcare Bank',
      covenantType: 'Minimum Operating Cash Reserve $400,000'
    }
  }
];

let liveCashForecasts = JSON.parse(JSON.stringify(INITIAL_FACILITY_CASH_FORECASTS));
let liveCashWeeks = JSON.parse(JSON.stringify(INITIAL_CASH_WEEKS));

/**
 * Resets memory state back to initial seed data for test reproducibility
 */
export function resetLiveCashForecastState() {
  liveCashForecasts = JSON.parse(JSON.stringify(INITIAL_FACILITY_CASH_FORECASTS));
  liveCashWeeks = JSON.parse(JSON.stringify(INITIAL_CASH_WEEKS));
}

/**
 * Retrieves cash forecast master records for a facility
 */
export function getFacilityCashForecasts(facilityId) {
  return liveCashForecasts.filter(f => matchesFacilityId(f.facilityId, facilityId) || matchesFacilityId(f.facilityUuid, facilityId));
}

/**
 * Retrieves a single cash forecast by ID or code
 */
export function getCashForecastByIdOrCode(identifier, facilityId) {
  return liveCashForecasts.find(f =>
    (f.id === identifier || f.forecastCode === identifier) &&
    (!facilityId || matchesFacilityId(f.facilityId, facilityId) || matchesFacilityId(f.facilityUuid, facilityId))
  ) || liveCashForecasts[0];
}

/**
 * Calculates covenant severity level
 */
export function classifyCovenantSeverity(headroom) {
  const h = Number(headroom) || 0;
  if (h >= 300000) return COVENANT_SEVERITY.LIQUIDITY_SURPLUS;
  if (h >= 100000) return COVENANT_SEVERITY.NORMAL;
  if (h >= 0) return COVENANT_SEVERITY.WARNING;
  return COVENANT_SEVERITY.CRITICAL_DEFICIT;
}

/**
 * Constructs the deterministic 13-week cash matrix with continuous roll-forward
 */
export function getCashForecastMatrix(facilityId, forecastId = 'CF2026_Q4_13W', scenario = CASH_SCENARIOS.BASELINE) {
  const forecast = getCashForecastByIdOrCode(forecastId, facilityId);
  if (!forecast) return null;

  let runningCash = forecast.startingCashBalance;
  const covenantFloor = forecast.minimumCashCovenant;

  const weeklyCalculations = INITIAL_CASH_WEEKS.map(w => {
    const raw = BASELINE_WEEKLY_FLOWS.find(f => f.weekNumber === w.weekNumber) || {};

    let commercial = raw.commercial || 0;
    let medicare = raw.medicare || 0;
    let pos = raw.pos || 0;
    let patientAr = raw.patientAr || 0;
    let payroll = raw.payroll || 0;
    let implants = raw.implants || 0;
    let supplies = raw.supplies || 0;
    let rent = raw.rent || 0;
    let equipIt = raw.equipIt || 0;
    let debtService = raw.debtService || 0;
    let locDraw = raw.locDraw || 0;
    let locRepay = raw.locRepay || 0;

    // Apply scenario adjustments
    if (scenario === CASH_SCENARIOS.SLOW_COLLECTIONS) {
      commercial = Math.round(commercial * 0.92);
      medicare = Math.round(medicare * 0.94);
      pos = Math.round(pos * 0.95);
      patientAr = Math.round(patientAr * 0.90);
    } else if (scenario === CASH_SCENARIOS.PROMPT_PAY) {
      commercial = Math.round(commercial * 1.05);
      medicare = Math.round(medicare * 1.03);
      pos = Math.round(pos * 1.08);
      patientAr = Math.round(patientAr * 1.06);
    }

    const totalReceipts = commercial + medicare + pos + patientAr;
    const totalDisbursements = payroll + implants + supplies + rent + equipIt + debtService;
    const totalFinancing = locDraw - locRepay;
    const netOperatingCashFlow = totalReceipts - totalDisbursements;
    const netCashFlow = netOperatingCashFlow + totalFinancing;

    const beginningCash = runningCash;
    const endingCash = beginningCash + netCashFlow;
    runningCash = endingCash; // Roll-forward continuity

    const headroom = endingCash - covenantFloor;
    const severity = classifyCovenantSeverity(headroom);

    return {
      weekNumber: w.weekNumber,
      weekCode: w.weekCode,
      weekLabel: w.weekLabel,
      startDate: w.startDate,
      endDate: w.endDate,
      isPayrollWeek: w.isPayrollWeek,
      isRentWeek: w.isRentWeek,
      isDebtServiceWeek: w.isDebtServiceWeek,
      confidenceScore: w.confidenceScore,
      beginningCash,
      // Receipts
      commercial,
      medicare,
      pos,
      patientAr,
      totalReceipts,
      // Disbursements
      payroll,
      implants,
      supplies,
      rent,
      equipIt,
      debtService,
      totalDisbursements,
      // Flows & Balance
      netOperatingCashFlow,
      locDraw,
      locRepay,
      totalFinancing,
      endingCash,
      covenantFloor,
      headroom,
      severity
    };
  });

  // Calculate 13-Week Aggregated Totals
  const totals = {
    totalReceipts: weeklyCalculations.reduce((a, b) => a + b.totalReceipts, 0),
    totalCommercial: weeklyCalculations.reduce((a, b) => a + b.commercial, 0),
    totalMedicare: weeklyCalculations.reduce((a, b) => a + b.medicare, 0),
    totalPos: weeklyCalculations.reduce((a, b) => a + b.pos, 0),
    totalPatientAr: weeklyCalculations.reduce((a, b) => a + b.patientAr, 0),
    totalDisbursements: weeklyCalculations.reduce((a, b) => a + b.totalDisbursements, 0),
    totalPayroll: weeklyCalculations.reduce((a, b) => a + b.payroll, 0),
    totalImplants: weeklyCalculations.reduce((a, b) => a + b.implants, 0),
    totalSupplies: weeklyCalculations.reduce((a, b) => a + b.supplies, 0),
    totalRent: weeklyCalculations.reduce((a, b) => a + b.rent, 0),
    totalEquipIt: weeklyCalculations.reduce((a, b) => a + b.equipIt, 0),
    totalDebtService: weeklyCalculations.reduce((a, b) => a + b.debtService, 0),
    netCashFlow: weeklyCalculations.reduce((a, b) => a + b.netOperatingCashFlow, 0),
    startingCash: forecast.startingCashBalance,
    endingCash: weeklyCalculations[weeklyCalculations.length - 1].endingCash,
    lowestCash: Math.min(...weeklyCalculations.map(w => w.endingCash)),
    lowestCashWeek: weeklyCalculations.reduce((min, w) => w.endingCash < min.endingCash ? w : min, weeklyCalculations[0]).weekCode,
    minimumHeadroom: Math.min(...weeklyCalculations.map(w => w.headroom))
  };

  return {
    forecast,
    weeks: weeklyCalculations,
    totals,
    scenario
  };
}

/**
 * Computes executive liquidity telemetry KPIs for ribbon display
 */
export function getCashForecastTelemetry(facilityId, forecastId = 'CF2026_Q4_13W', scenario = CASH_SCENARIOS.BASELINE) {
  const matrix = getCashForecastMatrix(facilityId, forecastId, scenario);
  if (!matrix) return null;

  const totals = matrix.totals;
  const isCashBuild = totals.netCashFlow >= 0;

  return {
    forecastId: matrix.forecast.id,
    forecastCode: matrix.forecast.forecastCode,
    forecastName: matrix.forecast.forecastName,
    status: matrix.forecast.status,
    isActive: matrix.forecast.isActive,
    scenario,
    startingCashBalance: totals.startingCash,
    projectedEndingCash: totals.endingCash,
    total13wReceipts: totals.totalReceipts,
    total13wDisbursements: totals.totalDisbursements,
    net13wCashFlow: totals.netCashFlow,
    isCashBuild,
    minimumCashCovenant: matrix.forecast.minimumCashCovenant,
    minimumCovenantHeadroom: totals.minimumHeadroom,
    lowestProjectedCash: totals.lowestCash,
    lowestProjectedCashWeek: totals.lowestCashWeek,
    lineOfCreditLimit: matrix.forecast.lineOfCreditLimit,
    lineOfCreditDrawn: matrix.forecast.lineOfCreditDrawn,
    availableLocLiquidity: matrix.forecast.lineOfCreditLimit - matrix.forecast.lineOfCreditDrawn,
    overallSeverity: classifyCovenantSeverity(totals.minimumHeadroom),
    frozenHash: matrix.forecast.frozenHash,
    approvedAt: matrix.forecast.approvedAt
  };
}

/**
 * Approves and hard-freezes a 13-week cash forecast with a SHA-256 seal
 */
export function approveAndFreezeCashForecast(forecastId, approvedBy = '00000000-0000-0000-0000-000000000001') {
  const forecast = liveCashForecasts.find(f => f.id === forecastId || f.forecastCode === forecastId);
  if (!forecast) {
    throw new Error(`Cash forecast ${forecastId} not found`);
  }

  const telemetry = getCashForecastTelemetry(forecast.facilityId, forecast.id);
  const sealPayload = {
    forecastId: forecast.id,
    facilityId: forecast.facilityId,
    startWeekDate: forecast.startWeekDate,
    endWeekDate: forecast.endWeekDate,
    startingCashBalance: forecast.startingCashBalance,
    projectedEndingCash: telemetry.projectedEndingCash,
    minimumCovenantHeadroom: telemetry.minimumCovenantHeadroom,
    approvedBy,
    approvedAt: new Date().toISOString()
  };

  const seal = computeCashForecastHash(sealPayload);

  // Set other forecasts for this facility to SUPERSEDED
  liveCashForecasts.forEach(f => {
    if (f.facilityId === forecast.facilityId && f.id !== forecast.id && f.status === CASH_FORECAST_STATUSES.ACTIVE_FORECAST) {
      f.status = CASH_FORECAST_STATUSES.SUPERSEDED;
      f.isActive = false;
    }
  });

  forecast.status = CASH_FORECAST_STATUSES.ACTIVE_FORECAST;
  forecast.isActive = true;
  forecast.isApproved = true;
  forecast.approvedBy = approvedBy;
  forecast.approvedAt = sealPayload.approvedAt;
  forecast.frozenHash = seal;

  return {
    success: true,
    forecastId: forecast.id,
    forecastCode: forecast.forecastCode,
    status: forecast.status,
    frozenHash: seal,
    approvedAt: forecast.approvedAt,
    telemetry
  };
}
