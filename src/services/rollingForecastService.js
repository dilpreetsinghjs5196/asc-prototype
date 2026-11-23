/**
 * ==============================================================================
 * Phase E2: Rolling Forecast & Continuous Projections Service
 * Module 14: CFO Dashboard & Financial Accounting
 * Description: Continuous 12-Month Rolling Horizon Model, Multi-Method Projections
 *              (T3M Run-Rate, Seasonal Indexing, Capacity-Constrained Pipeline,
 *              Scheduled Backlog, Blended Composite), Multi-Scenario Sensitivity
 *              (Baseline, Bull +8%, Bear -10%), and Cryptographic Freeze Seals.
 * Maestro Clinical Design System: Emerald, Amber, Crimson, Sky, Slate, Neutral
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
 * Deterministic cryptographic audit hash for rolling forecast versions
 */
export function computeRollingForecastHash(payload) {
  const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
  if (nodeCrypto && typeof nodeCrypto.createHash === 'function') {
    return nodeCrypto.createHash('sha256').update(str).digest('hex');
  }
  let h1 = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h1 = Math.imul(h1 ^ str.charCodeAt(i), 0x01000193);
  }
  return `rf_seal_${(h1 >>> 0).toString(16)}`.padEnd(64, '0');
}

export const FORECAST_STATUSES = {
  DRAFT: 'DRAFT',
  UNDER_REVIEW: 'UNDER_REVIEW',
  ACTIVE_PROJECTION: 'ACTIVE_PROJECTION',
  SUPERSEDED: 'SUPERSEDED',
  ARCHIVED: 'ARCHIVED'
};

export const HORIZON_TYPES = {
  THREE_MONTH: '3_MONTH',
  SIX_MONTH: '6_MONTH',
  TWELVE_MONTH: '12_MONTH',
  FOUR_QUARTER: '4_QUARTER'
};

export const FORECAST_METHODS = {
  T3M_RUN_RATE: 'T3M_RUN_RATE',
  SEASONAL_INDEX: 'SEASONAL_INDEX',
  CAPACITY_PIPELINE: 'CAPACITY_PIPELINE',
  SCHEDULED_BACKLOG: 'SCHEDULED_BACKLOG',
  BLENDED_COMPOSITE: 'BLENDED_COMPOSITE'
};

export const SCENARIOS = {
  BASELINE: 'BASELINE',
  OPTIMISTIC: 'OPTIMISTIC',     // Bull Case: +8% cases, +2% NPR yield, +1% supply efficiency
  CONSERVATIVE: 'CONSERVATIVE'  // Bear Case: -10% cases, -3% NPR yield, +4% supply inflation
};

export const STATEMENT_LINE_CODES = {
  CASE_VOLUME: 'CASE_VOLUME',
  TOTAL_OR_MINUTES: 'TOTAL_OR_MINUTES',
  REV_SURGICAL_GROSS: 'REV_SURGICAL_GROSS',
  REV_IMPLANT_GROSS: 'REV_IMPLANT_GROSS',
  DED_ALLOWANCES: 'DED_ALLOWANCES',
  NPR: 'NPR',
  COST_IMPLANTS: 'COST_IMPLANTS',
  COST_SUPPLIES: 'COST_SUPPLIES',
  COST_LABOR: 'COST_LABOR',
  DIR_COSTS: 'DIR_COSTS',
  CLINICAL_MARGIN: 'CLINICAL_MARGIN',
  EXP_VARIABLE_FACILITY: 'EXP_VARIABLE_FACILITY',
  EXP_FIXED_OVERHEAD: 'EXP_FIXED_OVERHEAD',
  EBITDA: 'EBITDA',
  EXP_DEP_AMORT: 'EXP_DEP_AMORT',
  NOI: 'NOI'
};

/**
 * Historical Seasonality Curves for Outpatient Surgery Centers (ASCs)
 * Q1: Deductibles reset -> lower elective volume (Jan 0.88, Feb 0.92, Mar 0.96)
 * Q2: Spring peak -> high elective orthopedic & spine (Apr 1.00, May 1.02, Jun 1.04)
 * Q3: Summer lull followed by Sept recovery (Jul 0.94, Aug 0.96, Sep 1.02)
 * Q4: Year-end rush to utilize met deductibles & FSA (Oct 1.08, Nov 1.12, Dec 1.18)
 */
export const ASC_SEASONALITY_FACTORS = {
  1: 0.8800,  // Jan
  2: 0.9200,  // Feb
  3: 0.9600,  // Mar
  4: 1.0000,  // Apr
  5: 1.0200,  // May
  6: 1.0400,  // Jun
  7: 0.9400,  // Jul
  8: 0.9600,  // Aug
  9: 1.0200,  // Sep
  10: 1.0800, // Oct
  11: 1.1200, // Nov
  12: 1.1800  // Dec
};

/**
 * Physical Facility Constraints (Naples Surgery Center baseline)
 */
export const FACILITY_CAPACITY_CONSTRAINTS = {
  OR_ROOMS: 4,
  OPERATING_DAYS_PER_MONTH: 21,
  STAFFED_HOURS_PER_DAY: 9,
  TARGET_UTILIZATION_RATE: 0.78, // 78% target block utilization
  AVERAGE_CASE_DURATION_MINUTES: 76.0,
  get TOTAL_AVAILABLE_MINUTES_PER_MONTH() {
    return this.OR_ROOMS * this.OPERATING_DAYS_PER_MONTH * this.STAFFED_HOURS_PER_DAY * 60; // 45,360 mins
  },
  get TARGET_UTILIZED_MINUTES_PER_MONTH() {
    return Math.round(this.TOTAL_AVAILABLE_MINUTES_PER_MONTH * this.TARGET_UTILIZATION_RATE); // 35,381 mins
  },
  get MAXIMUM_MONTHLY_CASE_CAPACITY() {
    return Math.floor(this.TARGET_UTILIZED_MINUTES_PER_MONTH / this.AVERAGE_CASE_DURATION_MINUTES); // 465 cases
  }
};

/**
 * Trailing 3-Month (T3M) Run-Rate Calculator
 * Formula: 50% M-1 + 30% M-2 + 20% M-3
 */
export function calculateT3MRunRate(mMinus1, mMinus2, mMinus3) {
  const val1 = Number(mMinus1) || 0;
  const val2 = Number(mMinus2) || 0;
  const val3 = Number(mMinus3) || 0;
  return Number((0.50 * val1 + 0.30 * val2 + 0.20 * val3).toFixed(2));
}

/**
 * Seasonal Projection Calculator
 * Formula: Baseline Run-Rate * Month Seasonality Factor
 */
export function calculateSeasonalProjection(baselineRunRate, monthSeasonalityFactor) {
  const base = Number(baselineRunRate) || 0;
  const factor = Number(monthSeasonalityFactor) || 1.0;
  return Number((base * factor).toFixed(2));
}

/**
 * Capacity-Constrained Pipeline Calculator
 * Bounded by physical OR ceilings
 */
export function calculateCapacityConstrainedCases(unconstrainedCases, availableMinutes, utilizationRate, avgCaseMinutes) {
  const reqCases = Number(unconstrainedCases) || 0;
  const avail = Number(availableMinutes) || FACILITY_CAPACITY_CONSTRAINTS.TOTAL_AVAILABLE_MINUTES_PER_MONTH;
  const util = Number(utilizationRate) || FACILITY_CAPACITY_CONSTRAINTS.TARGET_UTILIZATION_RATE;
  const avgMin = Number(avgCaseMinutes) || FACILITY_CAPACITY_CONSTRAINTS.AVERAGE_CASE_DURATION_MINUTES;

  const maxCases = Math.floor((avail * util) / avgMin);
  return Math.min(reqCases, maxCases);
}

/**
 * Blended Multi-Method Composite Formula
 * 40% Backlog + 35% Seasonal + 25% T3M Run-Rate
 */
export function calculateBlendedComposite(backlogAmount, seasonalAmount, runRateAmount) {
  const b = Number(backlogAmount) || 0;
  const s = Number(seasonalAmount) || 0;
  const r = Number(runRateAmount) || 0;
  return Number((0.40 * b + 0.35 * s + 0.25 * r).toFixed(2));
}

/**
 * Scenario Sensitivity Calculator
 * Baseline: 1.0x
 * Optimistic: Volume +8%, NPR Yield +2%, Supply Cost -1%
 * Conservative: Volume -10%, NPR Yield -3%, Supply Cost +4%
 */
export function calculateScenarioAmount(baselineAmount, lineCode, scenario) {
  const base = Number(baselineAmount) || 0;
  if (scenario === SCENARIOS.BASELINE) return base;

  if (scenario === SCENARIOS.OPTIMISTIC) {
    if (lineCode === STATEMENT_LINE_CODES.CASE_VOLUME || lineCode === STATEMENT_LINE_CODES.TOTAL_OR_MINUTES) {
      return Math.round(base * 1.08);
    }
    if ([STATEMENT_LINE_CODES.REV_SURGICAL_GROSS, STATEMENT_LINE_CODES.REV_IMPLANT_GROSS, STATEMENT_LINE_CODES.NPR, STATEMENT_LINE_CODES.CLINICAL_MARGIN, STATEMENT_LINE_CODES.EBITDA, STATEMENT_LINE_CODES.NOI].includes(lineCode)) {
      return Number((base * 1.10).toFixed(2)); // volume + price yield
    }
    if ([STATEMENT_LINE_CODES.COST_IMPLANTS, STATEMENT_LINE_CODES.COST_SUPPLIES].includes(lineCode)) {
      return Number((base * 1.07).toFixed(2)); // volume 8% with 1% bulk savings
    }
    if (lineCode === STATEMENT_LINE_CODES.COST_LABOR) {
      return Number((base * 1.06).toFixed(2)); // staffing efficiency
    }
    if ([STATEMENT_LINE_CODES.EXP_FIXED_OVERHEAD, STATEMENT_LINE_CODES.EXP_DEP_AMORT].includes(lineCode)) {
      return base; // fixed
    }
    return Number((base * 1.08).toFixed(2));
  }

  if (scenario === SCENARIOS.CONSERVATIVE) {
    if (lineCode === STATEMENT_LINE_CODES.CASE_VOLUME || lineCode === STATEMENT_LINE_CODES.TOTAL_OR_MINUTES) {
      return Math.round(base * 0.90);
    }
    if ([STATEMENT_LINE_CODES.REV_SURGICAL_GROSS, STATEMENT_LINE_CODES.REV_IMPLANT_GROSS, STATEMENT_LINE_CODES.NPR, STATEMENT_LINE_CODES.CLINICAL_MARGIN, STATEMENT_LINE_CODES.EBITDA, STATEMENT_LINE_CODES.NOI].includes(lineCode)) {
      return Number((base * 0.87).toFixed(2)); // volume -10% plus yield contraction
    }
    if ([STATEMENT_LINE_CODES.COST_IMPLANTS, STATEMENT_LINE_CODES.COST_SUPPLIES].includes(lineCode)) {
      return Number((base * 0.94).toFixed(2)); // lower volume but 4% inflation
    }
    if (lineCode === STATEMENT_LINE_CODES.COST_LABOR) {
      return Number((base * 0.92).toFixed(2)); // minimum staffing floors
    }
    if ([STATEMENT_LINE_CODES.EXP_FIXED_OVERHEAD, STATEMENT_LINE_CODES.EXP_DEP_AMORT].includes(lineCode)) {
      return base; // fixed
    }
    return Number((base * 0.90).toFixed(2));
  }

  return base;
}

/**
 * 12 Sequential Forward Projection Periods (November 2026 to October 2027)
 */
export const INITIAL_FORECAST_PERIODS = [
  { sequenceOrder: 1, periodCode: '2026-M11', periodName: 'November 2026', calendarYear: 2026, calendarMonth: 11, quarterCode: '2026-Q4', seasonalityIndex: 1.1200, workingDays: 20, confidenceScore: 0.98, plannedCases: 270 },
  { sequenceOrder: 2, periodCode: '2026-M12', periodName: 'December 2026', calendarYear: 2026, calendarMonth: 12, quarterCode: '2026-Q4', seasonalityIndex: 1.1800, workingDays: 22, confidenceScore: 0.96, plannedCases: 285 },
  { sequenceOrder: 3, periodCode: '2027-M01', periodName: 'January 2027', calendarYear: 2027, calendarMonth: 1, quarterCode: '2027-Q1', seasonalityIndex: 0.8800, workingDays: 21, confidenceScore: 0.94, plannedCases: 215 },
  { sequenceOrder: 4, periodCode: '2027-M02', periodName: 'February 2027', calendarYear: 2027, calendarMonth: 2, quarterCode: '2027-Q1', seasonalityIndex: 0.9200, workingDays: 20, confidenceScore: 0.92, plannedCases: 225 },
  { sequenceOrder: 5, periodCode: '2027-M03', periodName: 'March 2027', calendarYear: 2027, calendarMonth: 3, quarterCode: '2027-Q1', seasonalityIndex: 0.9600, workingDays: 22, confidenceScore: 0.90, plannedCases: 235 },
  { sequenceOrder: 6, periodCode: '2027-M04', periodName: 'April 2027', calendarYear: 2027, calendarMonth: 4, quarterCode: '2027-Q2', seasonalityIndex: 1.0000, workingDays: 21, confidenceScore: 0.88, plannedCases: 245 },
  { sequenceOrder: 7, periodCode: '2027-M05', periodName: 'May 2027', calendarYear: 2027, calendarMonth: 5, quarterCode: '2027-Q2', seasonalityIndex: 1.0200, workingDays: 22, confidenceScore: 0.86, plannedCases: 250 },
  { sequenceOrder: 8, periodCode: '2027-M06', periodName: 'June 2027', calendarYear: 2027, calendarMonth: 6, quarterCode: '2027-Q2', seasonalityIndex: 1.0400, workingDays: 21, confidenceScore: 0.84, plannedCases: 255 },
  { sequenceOrder: 9, periodCode: '2027-M07', periodName: 'July 2027', calendarYear: 2027, calendarMonth: 7, quarterCode: '2027-Q3', seasonalityIndex: 0.9400, workingDays: 21, confidenceScore: 0.82, plannedCases: 230 },
  { sequenceOrder: 10, periodCode: '2027-M08', periodName: 'August 2027', calendarYear: 2027, calendarMonth: 8, quarterCode: '2027-Q3', seasonalityIndex: 0.9600, workingDays: 22, confidenceScore: 0.80, plannedCases: 235 },
  { sequenceOrder: 11, periodCode: '2027-M09', periodName: 'September 2027', calendarYear: 2027, calendarMonth: 9, quarterCode: '2027-Q3', seasonalityIndex: 1.0200, workingDays: 21, confidenceScore: 0.78, plannedCases: 250 },
  { sequenceOrder: 12, periodCode: '2027-M10', periodName: 'October 2027', calendarYear: 2027, calendarMonth: 10, quarterCode: '2027-Q4', seasonalityIndex: 1.0800, workingDays: 21, confidenceScore: 0.75, plannedCases: 265 }
];

/**
 * Generates statement line values for a given period based on planned case count
 */
function buildMonthlyStatementLines(period, forecastId, facilityId) {
  const cases = period.plannedCases;
  const orMinutes = cases * 76;
  const grossRev = cases * 12000;
  const allowances = cases * 7100;
  const badDebt = cases * 150;
  const npr = grossRev - allowances - badDebt; // cases * 4,750
  const implants = cases * 1440;
  const supplies = cases * 600;
  const labor = cases * 460;
  const dirCosts = implants + supplies + labor; // cases * 2,500
  const clinicalMargin = npr - dirCosts; // cases * 2,250
  const variableExp = cases * 290;
  const fixedOpex = 170000; // fixed monthly
  const ebitda = clinicalMargin - variableExp - fixedOpex;
  const depAmort = 40000; // fixed monthly
  const noi = ebitda - depAmort;

  const rawLines = [
    { lineCode: STATEMENT_LINE_CODES.CASE_VOLUME, lineName: 'Surgical Case Volume (Procedures)', accountCategory: 'VOLUME', base: cases, isCurrency: false },
    { lineCode: STATEMENT_LINE_CODES.TOTAL_OR_MINUTES, lineName: 'Operating Room Minutes Utilized', accountCategory: 'VOLUME', base: orMinutes, isCurrency: false },
    { lineCode: STATEMENT_LINE_CODES.REV_SURGICAL_GROSS, lineName: 'Gross Patient Surgical Charges', accountCategory: 'GROSS_REVENUE', base: grossRev, isCurrency: true },
    { lineCode: STATEMENT_LINE_CODES.DED_ALLOWANCES, lineName: 'Contractual Allowances & Bad Debt Deductions', accountCategory: 'CONTRACTUAL_DEDUCTION', base: allowances + badDebt, isCurrency: true },
    { lineCode: STATEMENT_LINE_CODES.NPR, lineName: 'Net Patient Revenue (NPR)', accountCategory: 'NET_REVENUE', base: npr, isCurrency: true },
    { lineCode: STATEMENT_LINE_CODES.COST_IMPLANTS, lineName: 'Surgical Implants & Hardware', accountCategory: 'DIRECT_COST', base: implants, isCurrency: true },
    { lineCode: STATEMENT_LINE_CODES.COST_SUPPLIES, lineName: 'Sterile Surgical Supplies & Biologics', accountCategory: 'DIRECT_COST', base: supplies, isCurrency: true },
    { lineCode: STATEMENT_LINE_CODES.COST_LABOR, lineName: 'Direct Procedural Scrub & RN Labor', accountCategory: 'DIRECT_COST', base: labor, isCurrency: true },
    { lineCode: STATEMENT_LINE_CODES.DIR_COSTS, lineName: 'Total Direct Clinical Costs', accountCategory: 'DIRECT_COST', base: dirCosts, isCurrency: true },
    { lineCode: STATEMENT_LINE_CODES.CLINICAL_MARGIN, lineName: 'Direct Clinical Contribution Margin', accountCategory: 'MARGIN', base: clinicalMargin, isCurrency: true },
    { lineCode: STATEMENT_LINE_CODES.EXP_VARIABLE_FACILITY, lineName: 'Variable Facility & SPD Costs', accountCategory: 'VARIABLE_COST', base: variableExp, isCurrency: true },
    { lineCode: STATEMENT_LINE_CODES.EXP_FIXED_OVERHEAD, lineName: 'Fixed Administrative Overhead (OPEX)', accountCategory: 'FIXED_OVERHEAD', base: fixedOpex, isCurrency: true },
    { lineCode: STATEMENT_LINE_CODES.EBITDA, lineName: 'Operating EBITDA', accountCategory: 'MARGIN', base: ebitda, isCurrency: true },
    { lineCode: STATEMENT_LINE_CODES.EXP_DEP_AMORT, lineName: 'Depreciation & Amortization', accountCategory: 'FIXED_OVERHEAD', base: depAmort, isCurrency: true },
    { lineCode: STATEMENT_LINE_CODES.NOI, lineName: 'Net Operating Income (EBIT)', accountCategory: 'MARGIN', base: noi, isCurrency: true }
  ];

  return rawLines.map(r => ({
    forecastId,
    facilityId,
    periodCode: period.periodCode,
    periodName: period.periodName,
    quarterCode: period.quarterCode,
    lineCode: r.lineCode,
    lineName: r.lineName,
    accountCategory: r.accountCategory,
    isCurrency: r.isCurrency,
    baselineAmount: r.base,
    optimisticAmount: calculateScenarioAmount(r.base, r.lineCode, SCENARIOS.OPTIMISTIC),
    conservativeAmount: calculateScenarioAmount(r.base, r.lineCode, SCENARIOS.CONSERVATIVE),
    methodUsed: FORECAST_METHODS.BLENDED_COMPOSITE,
    seasonalityIndex: period.seasonalityIndex,
    confidenceScore: period.confidenceScore
  }));
}

/**
 * Initial Rolling Forecast Master record for Naples Surgery Center
 */
export const INITIAL_FACILITY_ROLLING_FORECASTS = [
  {
    id: '00000000-0000-0000-0000-000000000030',
    facilityId: 'fac-naples-01',
    facilityUuid: '00000000-0000-0000-0000-000000000002',
    forecastCode: 'RF2026_12M_BASE',
    forecastName: '12-Month Rolling Operating Forecast (Nov 2026 - Oct 2027)',
    horizonType: HORIZON_TYPES.TWELVE_MONTH,
    baselinePeriodCode: '2026-M10',
    primaryMethod: FORECAST_METHODS.BLENDED_COMPOSITE,
    versionNumber: 1,
    status: FORECAST_STATUSES.ACTIVE_PROJECTION,
    startPeriodCode: '2026-M11',
    endPeriodCode: '2027-M10',
    isActive: true,
    isApproved: true,
    approvedAt: '2026-11-20T14:30:00Z',
    approvedBy: '00000000-0000-0000-0000-000000000001',
    frozenHash: 'a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8',
    metadata: {
      author: 'CFO Office',
      benchmarkModel: 'FY2026_ORIGINAL',
      methodology: 'Blended 40% Backlog / 35% Seasonal / 25% T3M'
    }
  }
];

let liveRollingForecasts = JSON.parse(JSON.stringify(INITIAL_FACILITY_ROLLING_FORECASTS));
let liveForecastPeriods = JSON.parse(JSON.stringify(INITIAL_FORECAST_PERIODS));
let liveLineItems = INITIAL_FORECAST_PERIODS.flatMap(p =>
  buildMonthlyStatementLines(p, liveRollingForecasts[0].id, liveRollingForecasts[0].facilityId)
);

/**
 * Resets memory state back to initial seed data for test reproducibility
 */
export function resetLiveRollingForecastState() {
  liveRollingForecasts = JSON.parse(JSON.stringify(INITIAL_FACILITY_ROLLING_FORECASTS));
  liveForecastPeriods = JSON.parse(JSON.stringify(INITIAL_FORECAST_PERIODS));
  liveLineItems = INITIAL_FORECAST_PERIODS.flatMap(p =>
    buildMonthlyStatementLines(p, liveRollingForecasts[0].id, liveRollingForecasts[0].facilityId)
  );
}

/**
 * Retrieves rolling forecast master records for a facility
 */
export function getFacilityRollingForecasts(facilityId) {
  return liveRollingForecasts.filter(f => matchesFacilityId(f.facilityId, facilityId) || matchesFacilityId(f.facilityUuid, facilityId));
}

/**
 * Retrieves a single forecast by ID or forecast code
 */
export function getRollingForecastByIdOrCode(identifier, facilityId) {
  return liveRollingForecasts.find(f =>
    (f.id === identifier || f.forecastCode === identifier) &&
    (!facilityId || matchesFacilityId(f.facilityId, facilityId) || matchesFacilityId(f.facilityUuid, facilityId))
  ) || liveRollingForecasts[0];
}

/**
 * Retrieves the full multi-period projection matrix with monthly values, quarterly subtotals, and 12-month totals
 */
export function getRollingForecastMatrix(facilityId, forecastId = 'RF2026_12M_BASE', scenario = SCENARIOS.BASELINE, horizon = HORIZON_TYPES.TWELVE_MONTH) {
  const forecast = getRollingForecastByIdOrCode(forecastId, facilityId);
  if (!forecast) return null;

  // Filter periods by horizon
  let maxPeriods = 12;
  if (horizon === HORIZON_TYPES.THREE_MONTH) maxPeriods = 3;
  if (horizon === HORIZON_TYPES.SIX_MONTH) maxPeriods = 6;

  const periods = liveForecastPeriods.slice(0, maxPeriods);
  const periodCodes = periods.map(p => p.periodCode);

  const lines = liveLineItems.filter(l =>
    (l.forecastId === forecast.id) && periodCodes.includes(l.periodCode)
  );

  // Group by lineCode
  const lineCodesInOrder = [
    STATEMENT_LINE_CODES.CASE_VOLUME,
    STATEMENT_LINE_CODES.TOTAL_OR_MINUTES,
    STATEMENT_LINE_CODES.REV_SURGICAL_GROSS,
    STATEMENT_LINE_CODES.DED_ALLOWANCES,
    STATEMENT_LINE_CODES.NPR,
    STATEMENT_LINE_CODES.COST_IMPLANTS,
    STATEMENT_LINE_CODES.COST_SUPPLIES,
    STATEMENT_LINE_CODES.COST_LABOR,
    STATEMENT_LINE_CODES.DIR_COSTS,
    STATEMENT_LINE_CODES.CLINICAL_MARGIN,
    STATEMENT_LINE_CODES.EXP_VARIABLE_FACILITY,
    STATEMENT_LINE_CODES.EXP_FIXED_OVERHEAD,
    STATEMENT_LINE_CODES.EBITDA,
    STATEMENT_LINE_CODES.EXP_DEP_AMORT,
    STATEMENT_LINE_CODES.NOI
  ];

  const rows = lineCodesInOrder.map(code => {
    const periodValues = {};
    let total = 0;
    const quarters = {};

    periods.forEach(p => {
      const match = lines.find(l => l.lineCode === code && l.periodCode === p.periodCode);
      let val = 0;
      if (match) {
        if (scenario === SCENARIOS.OPTIMISTIC) val = match.optimisticAmount;
        else if (scenario === SCENARIOS.CONSERVATIVE) val = match.conservativeAmount;
        else val = match.baselineAmount;
      }
      periodValues[p.periodCode] = val;
      total += val;

      quarters[p.quarterCode] = (quarters[p.quarterCode] || 0) + val;
    });

    const firstMatch = lines.find(l => l.lineCode === code);
    return {
      lineCode: code,
      lineName: firstMatch?.lineName || code,
      accountCategory: firstMatch?.accountCategory || 'MARGIN',
      isCurrency: firstMatch?.isCurrency ?? true,
      periodValues,
      quarterValues: quarters,
      totalAmount: Number(total.toFixed(2))
    };
  });

  return {
    forecast,
    periods,
    rows,
    horizon,
    scenario
  };
}

/**
 * Computes executive telemetry KPIs for ribbon display
 */
export function getRollingForecastTelemetry(facilityId, forecastId = 'RF2026_12M_BASE', scenario = SCENARIOS.BASELINE) {
  const matrix = getRollingForecastMatrix(facilityId, forecastId, scenario, HORIZON_TYPES.TWELVE_MONTH);
  if (!matrix) return null;

  const nprRow = matrix.rows.find(r => r.lineCode === STATEMENT_LINE_CODES.NPR);
  const ebitdaRow = matrix.rows.find(r => r.lineCode === STATEMENT_LINE_CODES.EBITDA);
  const casesRow = matrix.rows.find(r => r.lineCode === STATEMENT_LINE_CODES.CASE_VOLUME);
  const orMinRow = matrix.rows.find(r => r.lineCode === STATEMENT_LINE_CODES.TOTAL_OR_MINUTES);
  const clinicalMarginRow = matrix.rows.find(r => r.lineCode === STATEMENT_LINE_CODES.CLINICAL_MARGIN);

  const projected12mNpr = nprRow?.totalAmount || 0;
  const projected12mEbitda = ebitdaRow?.totalAmount || 0;
  const projected12mCases = casesRow?.totalAmount || 0;
  const projected12mOrMinutes = orMinRow?.totalAmount || 0;
  const projected12mClinicalMargin = clinicalMarginRow?.totalAmount || 0;

  // Annual budget baseline comparison for Naples: Budget NPR = $14,160,000, Budget EBITDA = $3,840,000
  const annualBudgetNpr = 14160000;
  const annualBudgetEbitda = 3840000;

  const nprVarianceVsBudget = Number((projected12mNpr - annualBudgetNpr).toFixed(2));
  const ebitdaVarianceVsBudget = Number((projected12mEbitda - annualBudgetEbitda).toFixed(2));
  const ebitdaMarginPercent = projected12mNpr > 0 ? Number(((projected12mEbitda / projected12mNpr) * 100).toFixed(1)) : 0;

  // Capacity headroom calculation
  const totalPhysicalAvailableMinutes = FACILITY_CAPACITY_CONSTRAINTS.TOTAL_AVAILABLE_MINUTES_PER_MONTH * 12; // 544,320 mins
  const utilizedMinutesPercent = Number(((projected12mOrMinutes / totalPhysicalAvailableMinutes) * 100).toFixed(1));
  const capacityHeadroomMinutes = totalPhysicalAvailableMinutes - projected12mOrMinutes;
  const capacityHeadroomPercent = Number((100 - utilizedMinutesPercent).toFixed(1));

  // Average confidence score
  const avgConfidence = Number((matrix.periods.reduce((acc, p) => acc + p.confidenceScore, 0) / matrix.periods.length).toFixed(3));

  return {
    forecastId: matrix.forecast.id,
    forecastCode: matrix.forecast.forecastCode,
    forecastName: matrix.forecast.forecastName,
    forecastStatus: matrix.forecast.status,
    isActive: matrix.forecast.isActive,
    scenario,
    projected12mNpr,
    projected12mEbitda,
    projected12mCases,
    projected12mClinicalMargin,
    ebitdaMarginPercent,
    nprVarianceVsBudget,
    ebitdaVarianceVsBudget,
    isEbitdaFavorable: ebitdaVarianceVsBudget >= 0,
    isNprFavorable: nprVarianceVsBudget >= 0,
    totalPhysicalAvailableMinutes,
    projected12mOrMinutes,
    utilizedMinutesPercent,
    capacityHeadroomMinutes,
    capacityHeadroomPercent,
    avgConfidenceScore: avgConfidence,
    horizonPeriodCount: matrix.periods.length,
    frozenHash: matrix.forecast.frozenHash,
    approvedAt: matrix.forecast.approvedAt
  };
}

/**
 * Simulates projections across the 4 deterministic forecasting methodologies
 */
export function calculateForecastMethodProjections(facilityId, methodCode, baselineNpr = 1150000, baselineCases = 240) {
  const results = [];
  INITIAL_FORECAST_PERIODS.forEach(p => {
    let projectedCases = p.plannedCases;
    let projectedNpr = p.plannedCases * 4750;

    if (methodCode === FORECAST_METHODS.T3M_RUN_RATE) {
      // Steady weighted run-rate without strong seasonal swings
      projectedCases = Math.round(calculateT3MRunRate(baselineCases, 238, 232));
      projectedNpr = Math.round(calculateT3MRunRate(baselineNpr, 1140000, 1110000));
    } else if (methodCode === FORECAST_METHODS.SEASONAL_INDEX) {
      // Strongly driven by empirical seasonality
      projectedCases = Math.round(calculateSeasonalProjection(baselineCases, p.seasonalityIndex));
      projectedNpr = Math.round(calculateSeasonalProjection(baselineNpr, p.seasonalityIndex));
    } else if (methodCode === FORECAST_METHODS.CAPACITY_PIPELINE) {
      // Capped by 78% OR utilization target
      projectedCases = calculateCapacityConstrainedCases(
        p.plannedCases,
        FACILITY_CAPACITY_CONSTRAINTS.TOTAL_AVAILABLE_MINUTES_PER_MONTH,
        FACILITY_CAPACITY_CONSTRAINTS.TARGET_UTILIZATION_RATE,
        FACILITY_CAPACITY_CONSTRAINTS.AVERAGE_CASE_DURATION_MINUTES
      );
      projectedNpr = projectedCases * 4750;
    } else if (methodCode === FORECAST_METHODS.SCHEDULED_BACKLOG) {
      // Near months high confidence, further months decay
      const decay = p.sequenceOrder <= 2 ? 1.05 : Math.max(0.70, 1.0 - (p.sequenceOrder * 0.03));
      projectedCases = Math.round(baselineCases * decay);
      projectedNpr = Math.round(projectedCases * 4750);
    } else {
      // Blended Composite
      projectedCases = p.plannedCases;
      projectedNpr = p.plannedCases * 4750;
    }

    results.push({
      periodCode: p.periodCode,
      periodName: p.periodName,
      quarterCode: p.quarterCode,
      projectedCases,
      projectedNpr,
      projectedEbitda: Math.round(projectedNpr * 0.28)
    });
  });

  return results;
}

/**
 * Approves and hard-freezes a rolling forecast with a SHA-256 seal
 */
export function approveAndFreezeRollingForecast(forecastId, approvedBy = '00000000-0000-0000-0000-000000000001') {
  const forecast = liveRollingForecasts.find(f => f.id === forecastId || f.forecastCode === forecastId);
  if (!forecast) {
    throw new Error(`Rolling forecast ${forecastId} not found`);
  }

  const telemetry = getRollingForecastTelemetry(forecast.facilityId, forecast.id);
  const sealPayload = {
    forecastId: forecast.id,
    facilityId: forecast.facilityId,
    startPeriodCode: forecast.startPeriodCode,
    endPeriodCode: forecast.endPeriodCode,
    projected12mNpr: telemetry.projected12mNpr,
    projected12mEbitda: telemetry.projected12mEbitda,
    approvedBy,
    approvedAt: new Date().toISOString()
  };

  const seal = computeRollingForecastHash(sealPayload);

  // Set all other forecasts for this facility to SUPERSEDED
  liveRollingForecasts.forEach(f => {
    if (f.facilityId === forecast.facilityId && f.id !== forecast.id && f.status === FORECAST_STATUSES.ACTIVE_PROJECTION) {
      f.status = FORECAST_STATUSES.SUPERSEDED;
      f.isActive = false;
    }
  });

  forecast.status = FORECAST_STATUSES.ACTIVE_PROJECTION;
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
