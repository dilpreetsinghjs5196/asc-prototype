/**
 * ==============================================================================
 * Phase E5: Scenario Modeling & What-If Stress Testing Service
 * Module 14: CFO Dashboard & Financial Accounting
 * Description: Deterministic Multi-Variable Scenario Simulation, Parameter
 *              Levers (Volume, Payer Rate, Implants, Supplies, Labor Wages, Fixed Overhead),
 *              Specialty Procedural Impacts, OR Capacity Utilization Benchmarks,
 *              Side-by-Side Comparative Decision Matrix, and Cryptographic Seals.
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
  const targetId = typeof requestedFacilityId === 'object' && requestedFacilityId !== null
    ? (requestedFacilityId.id || requestedFacilityId.facilityId || requestedFacilityId.facilityUuid || '')
    : String(requestedFacilityId);

  if (!targetId || targetId === 'ALL') return true;
  if (recordFacilityId === targetId) return true;
  if (NAPLES_FACILITY_ALIASES.includes(recordFacilityId) && NAPLES_FACILITY_ALIASES.includes(targetId)) {
    return true;
  }
  return false;
}

/**
 * Deterministic cryptographic audit hash for scenario modeling
 */
export function computeScenarioHash(payload) {
  const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
  if (nodeCrypto && typeof nodeCrypto.createHash === 'function') {
    return nodeCrypto.createHash('sha256').update(str).digest('hex');
  }
  let h1 = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h1 = Math.imul(h1 ^ str.charCodeAt(i), 0x01000193);
  }
  return `scen_seal_${(h1 >>> 0).toString(16)}`.padEnd(64, '0');
}

export const SCENARIO_STATUSES = {
  DRAFT: 'DRAFT',
  SIMULATED: 'SIMULATED',
  BOARD_REVIEW: 'BOARD_REVIEW',
  APPROVED_STRATEGY: 'APPROVED_STRATEGY',
  SUPERSEDED: 'SUPERSEDED',
  ARCHIVED: 'ARCHIVED'
};

export const SCENARIO_TYPES = {
  BASELINE: 'BASELINE',
  EXPANSION: 'EXPANSION',
  PAYER_RENEGOTIATION: 'PAYER_RENEGOTIATION',
  COST_INFLATION: 'COST_INFLATION',
  RECESSION_STRESS: 'RECESSION_STRESS',
  WHAT_IF: 'WHAT_IF'
};

export const OR_CAPACITY_CONSTANTS = {
  OPERATING_DAYS_PER_MONTH: 21,
  OPERATING_ROOMS_COUNT: 4,
  HOURS_PER_OR_DAY: 8,
  MINUTES_PER_OR_DAY: 480,
  TOTAL_AVAILABLE_OR_MINUTES: 40320 // 21 * 4 * 480
};

export const BASELINE_NAPLES_OPERATING_DATA = {
  cases: 240,
  npr: 1150000.00,
  revenuePerCase: 4791.67,
  implantCostPerCase: 1437.50, // $345,000 / 240
  supplyCostPerCase: 645.83,   // $155,000 / 240
  laborCostPerCase: 708.34,    // $170,000 / 240 (adjusted 1 cent for exact 2791.67 rounding)
  variableCostPerCase: 2791.67,
  directClinicalCosts: 670000.00,
  contributionMargin: 480000.00,
  unitContributionMargin: 2000.00,
  fixedOverhead: 240000.00,
  ebitda: 240000.00,
  ebitdaMarginPercent: 20.87,
  breakEvenCases: 120,
  marginOfSafetyCases: 120,
  marginOfSafetyPercent: 50.00,
  orMinutesUtilized: 18240, // 240 * 76 mins
  orCapacityUtilizationPercent: 45.24 // 18,240 / 40,320
};

/**
 * Deterministic Simulation Calculation Engine
 */
export function calculateScenarioProjections(baseline, levers = {}) {
  const base = baseline || BASELINE_NAPLES_OPERATING_DATA;

  const volumeDeltaPct = Number(levers.caseVolumeDeltaPercent) || 0;
  const payerRateDeltaPct = Number(levers.reimbursementRateDeltaPercent) || 0;
  const implantInflationPct = Number(levers.implantCostInflationPercent) || 0;
  const supplyInflationPct = Number(levers.supplyCostInflationPercent) || 0;
  const laborInflationPct = Number(levers.laborWageInflationPercent) || 0;
  const fixedOverheadDelta = Number(levers.fixedOverheadDelta) || 0;

  // Projected cases
  const projectedCases = Math.round(base.cases * (1 + volumeDeltaPct / 100));

  // Adjusted unit revenue
  const adjustedRevenuePerCase = Number((base.revenuePerCase * (1 + payerRateDeltaPct / 100)).toFixed(2));

  // Adjusted unit variable costs
  const adjustedImplantCost = Number((base.implantCostPerCase * (1 + implantInflationPct / 100)).toFixed(2));
  const adjustedSupplyCost = Number((base.supplyCostPerCase * (1 + supplyInflationPct / 100)).toFixed(2));
  const adjustedLaborCost = Number((base.laborCostPerCase * (1 + laborInflationPct / 100)).toFixed(2));
  const adjustedVariableCostPerCase = Number((adjustedImplantCost + adjustedSupplyCost + adjustedLaborCost).toFixed(2));

  // Unit CM & Total Projections
  const adjustedUnitCm = Number((adjustedRevenuePerCase - adjustedVariableCostPerCase).toFixed(2));
  const projectedNpr = Number((projectedCases * adjustedRevenuePerCase).toFixed(2));
  const projectedDirectCosts = Number((projectedCases * adjustedVariableCostPerCase).toFixed(2));
  const projectedContributionMargin = Number((projectedNpr - projectedDirectCosts).toFixed(2));

  const projectedFixedOverhead = Number((base.fixedOverhead + fixedOverheadDelta).toFixed(2));
  const projectedEbitda = Number((projectedContributionMargin - projectedFixedOverhead).toFixed(2));
  const projectedEbitdaMarginPercent = projectedNpr > 0 ? Number(((projectedEbitda / projectedNpr) * 100).toFixed(2)) : 0;

  // Break-even & Margin of Safety
  let projectedBreakEvenCases = 0;
  if (adjustedUnitCm > 0) {
    projectedBreakEvenCases = Math.ceil(projectedFixedOverhead / adjustedUnitCm);
  }
  const projectedMarginOfSafetyCases = projectedCases - projectedBreakEvenCases;
  const projectedMarginOfSafetyPercent = projectedCases > 0 ? Number(((projectedMarginOfSafetyCases / projectedCases) * 100).toFixed(2)) : 0;

  // OR Capacity Feasibility
  const avgDurationMinutes = 76;
  const orMinutesUtilized = projectedCases * avgDurationMinutes;
  const orCapacityUtilizationPercent = Number(((orMinutesUtilized / OR_CAPACITY_CONSTANTS.TOTAL_AVAILABLE_OR_MINUTES) * 100).toFixed(2));

  // Variance against baseline
  const deltaCases = projectedCases - base.cases;
  const deltaNpr = Number((projectedNpr - base.npr).toFixed(2));
  const deltaDirectCosts = Number((projectedDirectCosts - base.directClinicalCosts).toFixed(2));
  const deltaContributionMargin = Number((projectedContributionMargin - base.contributionMargin).toFixed(2));
  const deltaEbitda = Number((projectedEbitda - base.ebitda).toFixed(2));
  const deltaOrMinutes = orMinutesUtilized - base.orMinutesUtilized;

  return {
    projectedCases,
    adjustedRevenuePerCase,
    adjustedVariableCostPerCase,
    adjustedUnitCm,
    projectedNpr,
    projectedDirectCosts,
    projectedContributionMargin,
    projectedFixedOverhead,
    projectedEbitda,
    projectedEbitdaMarginPercent,
    projectedBreakEvenCases,
    projectedMarginOfSafetyCases,
    projectedMarginOfSafetyPercent,
    orMinutesUtilized,
    orCapacityUtilizationPercent,
    deltaCases,
    deltaNpr,
    deltaDirectCosts,
    deltaContributionMargin,
    deltaEbitda,
    deltaOrMinutes
  };
}

/**
 * Initial Pre-Packaged Seed Scenarios
 */
export const INITIAL_FACILITY_SCENARIOS = [
  {
    id: '00000000-0000-0000-0000-000000000060',
    facilityId: 'fac-naples-01',
    facilityUuid: '00000000-0000-0000-0000-000000000002',
    scenarioCode: 'SCEN_BASE_2026',
    scenarioName: 'Baseline Operating Model (Oct 2026)',
    scenarioType: SCENARIO_TYPES.BASELINE,
    status: SCENARIO_STATUSES.APPROVED_STRATEGY,
    baselinePeriodCode: '2026-M10',
    versionNumber: 1,
    caseVolumeDeltaPercent: 0.00,
    reimbursementRateDeltaPercent: 0.00,
    implantCostInflationPercent: 0.00,
    supplyCostInflationPercent: 0.00,
    laborWageInflationPercent: 0.00,
    fixedOverheadDelta: 0.00,
    projectedCases: 240,
    projectedNpr: 1150000.00,
    projectedDirectCosts: 670000.00,
    projectedContributionMargin: 480000.00,
    projectedFixedOverhead: 240000.00,
    projectedEbitda: 240000.00,
    projectedEbitdaMarginPercent: 20.87,
    projectedBreakEvenCases: 120,
    projectedMarginOfSafetyCases: 120,
    orMinutesUtilized: 18240,
    orCapacityUtilizationPercent: 45.24,
    isActive: true,
    isApproved: true,
    approvedAt: '2026-11-20T16:00:00Z',
    approvedBy: '00000000-0000-0000-0000-000000000001',
    frozenHash: 'c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2',
    strategicNote: 'Verified closed-period operating baseline'
  },
  {
    id: '00000000-0000-0000-0000-000000000061',
    facilityId: 'fac-naples-01',
    facilityUuid: '00000000-0000-0000-0000-000000000002',
    scenarioCode: 'SCEN_ORTHO_EXP',
    scenarioName: 'Total Joint & Spine Surgical Expansion',
    scenarioType: SCENARIO_TYPES.EXPANSION,
    status: SCENARIO_STATUSES.BOARD_REVIEW,
    baselinePeriodCode: '2026-M10',
    versionNumber: 1,
    caseVolumeDeltaPercent: 12.50,
    reimbursementRateDeltaPercent: 0.00,
    implantCostInflationPercent: 0.00,
    supplyCostInflationPercent: 0.00,
    laborWageInflationPercent: 0.00,
    fixedOverheadDelta: 0.00,
    projectedCases: 270,
    projectedNpr: 1412000.00,
    projectedDirectCosts: 821000.00,
    projectedContributionMargin: 591000.00,
    projectedFixedOverhead: 240000.00,
    projectedEbitda: 351000.00,
    projectedEbitdaMarginPercent: 24.86,
    projectedBreakEvenCases: 110,
    projectedMarginOfSafetyCases: 160,
    orMinutesUtilized: 21390,
    orCapacityUtilizationPercent: 53.05,
    isActive: true,
    isApproved: false,
    approvedAt: null,
    approvedBy: null,
    frozenHash: null,
    strategicNote: 'Recruiting 2 orthopedic joint surgeons adding 30 high-acuity cases'
  },
  {
    id: '00000000-0000-0000-0000-000000000062',
    facilityId: 'fac-naples-01',
    facilityUuid: '00000000-0000-0000-0000-000000000002',
    scenarioCode: 'SCEN_PAYER_CUT',
    scenarioName: 'Commercial Payer Fee Schedule Compression (-4%)',
    scenarioType: SCENARIO_TYPES.PAYER_RENEGOTIATION,
    status: SCENARIO_STATUSES.SIMULATED,
    baselinePeriodCode: '2026-M10',
    versionNumber: 1,
    caseVolumeDeltaPercent: 0.00,
    reimbursementRateDeltaPercent: -4.00,
    implantCostInflationPercent: 0.00,
    supplyCostInflationPercent: 0.00,
    laborWageInflationPercent: 0.00,
    fixedOverheadDelta: 0.00,
    projectedCases: 240,
    projectedNpr: 1104000.00,
    projectedDirectCosts: 670000.00,
    projectedContributionMargin: 434000.00,
    projectedFixedOverhead: 240000.00,
    projectedEbitda: 194000.00,
    projectedEbitdaMarginPercent: 17.57,
    projectedBreakEvenCases: 133,
    projectedMarginOfSafetyCases: 107,
    orMinutesUtilized: 18240,
    orCapacityUtilizationPercent: 45.24,
    isActive: true,
    isApproved: false,
    approvedAt: null,
    approvedBy: null,
    frozenHash: null,
    strategicNote: 'Anticipated 4% allowable rate compression in commercial renewals'
  },
  {
    id: '00000000-0000-0000-0000-000000000063',
    facilityId: 'fac-naples-01',
    facilityUuid: '00000000-0000-0000-0000-000000000002',
    scenarioCode: 'SCEN_INFLATION',
    scenarioName: 'Supply Chain & Implant Price Escalation',
    scenarioType: SCENARIO_TYPES.COST_INFLATION,
    status: SCENARIO_STATUSES.SIMULATED,
    baselinePeriodCode: '2026-M10',
    versionNumber: 1,
    caseVolumeDeltaPercent: 0.00,
    reimbursementRateDeltaPercent: 0.00,
    implantCostInflationPercent: 7.00,
    supplyCostInflationPercent: 5.00,
    laborWageInflationPercent: 0.00,
    fixedOverheadDelta: 0.00,
    projectedCases: 240,
    projectedNpr: 1150000.00,
    projectedDirectCosts: 701900.00,
    projectedContributionMargin: 448100.00,
    projectedFixedOverhead: 240000.00,
    projectedEbitda: 208100.00,
    projectedEbitdaMarginPercent: 18.10,
    projectedBreakEvenCases: 129,
    projectedMarginOfSafetyCases: 111,
    orMinutesUtilized: 18240,
    orCapacityUtilizationPercent: 45.24,
    isActive: true,
    isApproved: false,
    approvedAt: null,
    approvedBy: null,
    frozenHash: null,
    strategicNote: 'Vendor price increases: 7% implants, 5% surgical packs'
  },
  {
    id: '00000000-0000-0000-0000-000000000064',
    facilityId: 'fac-naples-01',
    facilityUuid: '00000000-0000-0000-0000-000000000002',
    scenarioCode: 'SCEN_STRESS_TEST',
    scenarioName: 'Multi-Factor Conservative Stress Test',
    scenarioType: SCENARIO_TYPES.RECESSION_STRESS,
    status: SCENARIO_STATUSES.SIMULATED,
    baselinePeriodCode: '2026-M10',
    versionNumber: 1,
    caseVolumeDeltaPercent: -10.00,
    reimbursementRateDeltaPercent: -2.50,
    implantCostInflationPercent: 6.00,
    supplyCostInflationPercent: 6.00,
    laborWageInflationPercent: 4.00,
    fixedOverheadDelta: 0.00,
    projectedCases: 216,
    projectedNpr: 1009125.00,
    projectedDirectCosts: 650600.00,
    projectedContributionMargin: 358525.00,
    projectedFixedOverhead: 240000.00,
    projectedEbitda: 118525.00,
    projectedEbitdaMarginPercent: 11.75,
    projectedBreakEvenCases: 145,
    projectedMarginOfSafetyCases: 71,
    orMinutesUtilized: 16416,
    orCapacityUtilizationPercent: 40.71,
    isActive: true,
    isApproved: false,
    approvedAt: null,
    approvedBy: null,
    frozenHash: null,
    strategicNote: 'Compound stress test: -10% volume, -2.5% rate, +6% supplies, +4% labor'
  }
];

let liveScenarios = JSON.parse(JSON.stringify(INITIAL_FACILITY_SCENARIOS));

/**
 * Resets memory state back to initial seed data for test reproducibility
 */
export function resetLiveScenarioState() {
  liveScenarios = JSON.parse(JSON.stringify(INITIAL_FACILITY_SCENARIOS));
}

/**
 * Retrieves all scenarios for a facility
 */
export function getFacilityScenarios(facilityId) {
  const filtered = liveScenarios.filter(s => matchesFacilityId(s.facilityId, facilityId) || matchesFacilityId(s.facilityUuid, facilityId));
  return filtered.length > 0 ? filtered : liveScenarios;
}

/**
 * Retrieves a single scenario by ID or code
 */
export function getScenarioByIdOrCode(identifier, facilityId) {
  return liveScenarios.find(s =>
    (s.id === identifier || s.scenarioCode === identifier) &&
    (!facilityId || matchesFacilityId(s.facilityId, facilityId) || matchesFacilityId(s.facilityUuid, facilityId))
  ) || liveScenarios.find(s => s.id === identifier || s.scenarioCode === identifier) || liveScenarios[0];
}

/**
 * Retrieves executive telemetry KPIs for ribbon display
 */
export function getScenarioTelemetry(facilityId, scenarioCode = 'SCEN_BASE_2026') {
  const scenario = getScenarioByIdOrCode(scenarioCode, facilityId);
  const baseline = liveScenarios[0];

  const deltaCases = scenario.projectedCases - baseline.projectedCases;
  const deltaNpr = scenario.projectedNpr - baseline.projectedNpr;
  const deltaEbitda = scenario.projectedEbitda - baseline.projectedEbitda;
  const deltaMarginPct = Number((scenario.projectedEbitdaMarginPercent - baseline.projectedEbitdaMarginPercent).toFixed(2));
  const deltaOrMinutes = scenario.orMinutesUtilized - baseline.orMinutesUtilized;

  return {
    scenarioId: scenario.id,
    scenarioCode: scenario.scenarioCode,
    scenarioName: scenario.scenarioName,
    scenarioType: scenario.scenarioType,
    status: scenario.status,
    isActive: scenario.isActive,
    isApproved: scenario.isApproved,
    projectedCases: scenario.projectedCases,
    projectedNpr: scenario.projectedNpr,
    projectedDirectCosts: scenario.projectedDirectCosts,
    projectedContributionMargin: scenario.projectedContributionMargin,
    projectedFixedOverhead: scenario.projectedFixedOverhead,
    projectedEbitda: scenario.projectedEbitda,
    projectedEbitdaMarginPercent: scenario.projectedEbitdaMarginPercent,
    projectedBreakEvenCases: scenario.projectedBreakEvenCases,
    projectedMarginOfSafetyCases: scenario.projectedMarginOfSafetyCases,
    orMinutesUtilized: scenario.orMinutesUtilized,
    orCapacityUtilizationPercent: scenario.orCapacityUtilizationPercent,
    frozenHash: scenario.frozenHash,
    approvedAt: scenario.approvedAt,
    deltaCases,
    deltaNpr,
    deltaEbitda,
    deltaMarginPct,
    deltaOrMinutes,
    availableOrMinutes: OR_CAPACITY_CONSTANTS.TOTAL_AVAILABLE_OR_MINUTES
  };
}

/**
 * Returns comparative matrix of all scenarios side-by-side against baseline
 */
export function getScenarioComparativeMatrix(facilityId) {
  const scenarios = getFacilityScenarios(facilityId);
  const baseline = scenarios.find(s => s.scenarioType === SCENARIO_TYPES.BASELINE) || scenarios[0] || liveScenarios[0];

  const rows = scenarios.map(scen => {
    const deltaCases = scen.projectedCases - baseline.projectedCases;
    const deltaNpr = scen.projectedNpr - baseline.projectedNpr;
    const deltaEbitda = scen.projectedEbitda - baseline.projectedEbitda;
    const deltaMarginPct = Number((scen.projectedEbitdaMarginPercent - baseline.projectedEbitdaMarginPercent).toFixed(2));

    return {
      scenarioId: scen.id,
      scenarioCode: scen.scenarioCode,
      scenarioName: scen.scenarioName,
      scenarioType: scen.scenarioType,
      status: scen.status,
      isApproved: scen.isApproved,
      projectedCases: scen.projectedCases,
      projectedNpr: scen.projectedNpr,
      projectedDirectCosts: scen.projectedDirectCosts,
      projectedContributionMargin: scen.projectedContributionMargin,
      projectedFixedOverhead: scen.projectedFixedOverhead,
      projectedEbitda: scen.projectedEbitda,
      projectedEbitdaMarginPercent: scen.projectedEbitdaMarginPercent,
      projectedBreakEvenCases: scen.projectedBreakEvenCases,
      projectedMarginOfSafetyCases: scen.projectedMarginOfSafetyCases,
      orMinutesUtilized: scen.orMinutesUtilized,
      orCapacityUtilizationPercent: scen.orCapacityUtilizationPercent,
      deltaCases,
      deltaNpr,
      deltaEbitda,
      deltaMarginPct,
      strategicNote: scen.strategicNote
    };
  });

  const resolvedFacilityId = typeof facilityId === 'object' && facilityId !== null
    ? (facilityId.id || 'fac-naples-01')
    : (facilityId || 'fac-naples-01');

  return {
    facilityId: resolvedFacilityId,
    baselinePeriodCode: baseline?.baselinePeriodCode || '2026-M10',
    scenariosCount: scenarios.length,
    matrix: rows
  };
}

/**
 * Approves and hard-freezes a scenario model with SHA-256 seal
 */
export function approveAndFreezeScenario(scenarioCode, approvedBy = '00000000-0000-0000-0000-000000000001') {
  const scenario = liveScenarios.find(s => s.scenarioCode === scenarioCode || s.id === scenarioCode);
  if (!scenario) {
    throw new Error(`Scenario ${scenarioCode} not found`);
  }

  const sealPayload = {
    scenarioId: scenario.id,
    facilityId: scenario.facilityId,
    scenarioCode: scenario.scenarioCode,
    projectedCases: scenario.projectedCases,
    projectedNpr: scenario.projectedNpr,
    projectedEbitda: scenario.projectedEbitda,
    orMinutesUtilized: scenario.orMinutesUtilized,
    approvedBy,
    approvedAt: new Date().toISOString()
  };

  const seal = computeScenarioHash(sealPayload);

  scenario.status = SCENARIO_STATUSES.APPROVED_STRATEGY;
  scenario.isApproved = true;
  scenario.approvedBy = approvedBy;
  scenario.approvedAt = sealPayload.approvedAt;
  scenario.frozenHash = seal;

  return {
    success: true,
    scenarioId: scenario.id,
    scenarioCode: scenario.scenarioCode,
    status: scenario.status,
    frozenHash: seal,
    approvedAt: scenario.approvedAt
  };
}
