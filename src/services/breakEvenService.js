/**
 * ==============================================================================
 * Phase E4: Break-Even Analysis & Cost-Volume-Profit (CVP) Service
 * Module 14: CFO Dashboard & Financial Accounting
 * Description: Deterministic Break-Even Modeling, Fixed vs. Variable Cost
 *              Segregation, Specialty-Level CVP Benchmarks, Margin of Safety,
 *              Degree of Operating Leverage (DOL), and Target Profit Simulations.
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
 * Deterministic cryptographic audit hash for break-even models
 */
export function computeBreakEvenHash(payload) {
  const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
  if (nodeCrypto && typeof nodeCrypto.createHash === 'function') {
    return nodeCrypto.createHash('sha256').update(str).digest('hex');
  }
  let h1 = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h1 = Math.imul(h1 ^ str.charCodeAt(i), 0x01000193);
  }
  return `be_seal_${(h1 >>> 0).toString(16)}`.padEnd(64, '0');
}

export const MODEL_STATUSES = {
  DRAFT: 'DRAFT',
  UNDER_REVIEW: 'UNDER_REVIEW',
  ACTIVE_BENCHMARK: 'ACTIVE_BENCHMARK',
  SUPERSEDED: 'SUPERSEDED',
  ARCHIVED: 'ARCHIVED'
};

export const PERIOD_TYPES = {
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  ANNUAL: 'ANNUAL'
};

/**
 * Deterministic CVP Mathematical Formulas
 */

export function calculateUnitContributionMargin(revenuePerCase, variableCostPerCase) {
  const rev = Number(revenuePerCase) || 0;
  const vc = Number(variableCostPerCase) || 0;
  return Number((rev - vc).toFixed(2));
}

export function calculateContributionMarginRatio(unitCm, revenuePerCase) {
  const cm = Number(unitCm) || 0;
  const rev = Number(revenuePerCase) || 1;
  return Number((cm / rev).toFixed(4));
}

export function calculateBreakEvenVolume(fixedCosts, unitCm) {
  const fc = Number(fixedCosts) || 0;
  const cm = Number(unitCm);
  if (isNaN(cm) || cm <= 0) return 0;
  return Math.ceil(fc / cm);
}

export function calculateBreakEvenRevenue(fixedCosts, contributionMarginRatio) {
  const fc = Number(fixedCosts) || 0;
  const cmr = Number(contributionMarginRatio);
  if (isNaN(cmr) || cmr <= 0) return 0;
  return Number((fc / cmr).toFixed(2));
}

export function calculateMarginOfSafety(actualCases, breakEvenCases) {
  const actual = Number(actualCases) || 0;
  const be = Number(breakEvenCases) || 0;
  const cases = actual - be;
  const percent = actual > 0 ? Number(((cases / actual) * 100).toFixed(2)) : 0;
  return { cases, percent };
}

export function calculateDegreeOfOperatingLeverage(totalContributionMargin, ebitda) {
  const cm = Number(totalContributionMargin) || 0;
  const ebit = Number(ebitda);
  if (isNaN(ebit) || ebit <= 0) return 0;
  return Number((cm / ebit).toFixed(2));
}

export function calculateTargetProfitVolume(fixedCosts, targetEbitda, unitCm) {
  const fc = Number(fixedCosts) || 0;
  const target = Number(targetEbitda) || 0;
  const cm = Number(unitCm);
  if (isNaN(cm) || cm <= 0) return 0;
  return Math.ceil((fc + target) / cm);
}

/**
 * Specialty Benchmark Economics (Naples Surgery Center Baseline)
 */
export const INITIAL_SPECIALTY_BENCHMARKS = [
  {
    specialtyCode: 'ORTHOPEDICS',
    specialtyName: 'Orthopedics & Joint Reconstruction',
    actualMonthlyCases: 65,
    averageCaseDurationMinutes: 90,
    revenuePerCase: 8500.00,
    implantCostPerCase: 3200.00,
    supplyCostPerCase: 900.00,
    laborCostPerCase: 800.00,
    variableCostPerCase: 4900.00,
    unitContributionMargin: 3600.00,
    contributionMarginRatio: 0.4235,
    allocatedFixedCost: 72000.00, // 30% of $240k
    specialtyBreakEvenCases: 20,
    marginOfSafetyCases: 45,
    marginOfSafetyPercent: 69.23
  },
  {
    specialtyCode: 'SPINE',
    specialtyName: 'Spine Surgery (ACDF & Decompression)',
    actualMonthlyCases: 35,
    averageCaseDurationMinutes: 105,
    revenuePerCase: 9200.00,
    implantCostPerCase: 3600.00,
    supplyCostPerCase: 950.00,
    laborCostPerCase: 750.00,
    variableCostPerCase: 5300.00,
    unitContributionMargin: 3900.00,
    contributionMarginRatio: 0.4239,
    allocatedFixedCost: 48000.00, // 20% of $240k
    specialtyBreakEvenCases: 13,
    marginOfSafetyCases: 22,
    marginOfSafetyPercent: 62.86
  },
  {
    specialtyCode: 'OPHTHALMOLOGY',
    specialtyName: 'Ophthalmology (Cataract & Premium IOL)',
    actualMonthlyCases: 70,
    averageCaseDurationMinutes: 25,
    revenuePerCase: 2200.00,
    implantCostPerCase: 350.00,
    supplyCostPerCase: 250.00,
    laborCostPerCase: 350.00,
    variableCostPerCase: 950.00,
    unitContributionMargin: 1250.00,
    contributionMarginRatio: 0.5682,
    allocatedFixedCost: 48000.00, // 20% of $240k
    specialtyBreakEvenCases: 39,
    marginOfSafetyCases: 31,
    marginOfSafetyPercent: 44.29
  },
  {
    specialtyCode: 'PAIN_MANAGEMENT',
    specialtyName: 'Interventional Pain Management',
    actualMonthlyCases: 50,
    averageCaseDurationMinutes: 30,
    revenuePerCase: 1400.00,
    implantCostPerCase: 0.00,
    supplyCostPerCase: 200.00,
    laborCostPerCase: 150.00,
    variableCostPerCase: 350.00,
    unitContributionMargin: 1050.00,
    contributionMarginRatio: 0.7500,
    allocatedFixedCost: 36000.00, // 15% of $240k
    specialtyBreakEvenCases: 35,
    marginOfSafetyCases: 15,
    marginOfSafetyPercent: 30.00
  },
  {
    specialtyCode: 'GENERAL_SURGERY',
    specialtyName: 'General Surgery & ENT',
    actualMonthlyCases: 20,
    averageCaseDurationMinutes: 60,
    revenuePerCase: 3800.00,
    implantCostPerCase: 400.00,
    supplyCostPerCase: 700.00,
    laborCostPerCase: 800.00,
    variableCostPerCase: 1900.00,
    unitContributionMargin: 1900.00,
    contributionMarginRatio: 0.5000,
    allocatedFixedCost: 36000.00, // 15% of $240k
    specialtyBreakEvenCases: 19,
    marginOfSafetyCases: 1,
    marginOfSafetyPercent: 5.00
  }
];

export const INITIAL_FACILITY_BREAK_EVEN_MODELS = [
  {
    id: '00000000-0000-0000-0000-000000000050',
    facilityId: 'fac-naples-01',
    facilityUuid: '00000000-0000-0000-0000-000000000002',
    modelCode: 'BE2026_M10_BASE',
    modelName: 'October 2026 Baseline Break-Even Model',
    periodType: PERIOD_TYPES.MONTHLY,
    baselinePeriodCode: '2026-M10',
    versionNumber: 1,
    status: MODEL_STATUSES.ACTIVE_BENCHMARK,
    fixedOverheadCosts: 240000.00,
    averageRevenuePerCase: 4791.67,
    averageVariableCostPerCase: 2791.67,
    unitContributionMargin: 2000.00,
    contributionMarginRatio: 0.4174,
    breakEvenCases: 120,
    breakEvenRevenue: 575000.00,
    operatingDaysPerPeriod: 21,
    dailyBreakEvenCases: 5.71,
    actualCases: 240,
    actualRevenue: 1150000.00,
    marginOfSafetyCases: 120,
    marginOfSafetyPercent: 50.00,
    degreeOfOperatingLeverage: 2.00,
    isActive: true,
    isApproved: true,
    approvedAt: '2026-11-20T15:30:00Z',
    approvedBy: '00000000-0000-0000-0000-000000000001',
    frozenHash: 'b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5',
    metadata: {
      author: 'CFO Office',
      sourcePeriod: '2026-M10 Management P&L',
      method: 'Deterministic CVP Linear Engine'
    }
  }
];

let liveBreakEvenModels = JSON.parse(JSON.stringify(INITIAL_FACILITY_BREAK_EVEN_MODELS));
let liveSpecialties = JSON.parse(JSON.stringify(INITIAL_SPECIALTY_BENCHMARKS));

/**
 * Resets memory state back to initial seed data for test reproducibility
 */
export function resetLiveBreakEvenState() {
  liveBreakEvenModels = JSON.parse(JSON.stringify(INITIAL_FACILITY_BREAK_EVEN_MODELS));
  liveSpecialties = JSON.parse(JSON.stringify(INITIAL_SPECIALTY_BENCHMARKS));
}

/**
 * Retrieves break-even models for a facility
 */
export function getFacilityBreakEvenModels(facilityId) {
  return liveBreakEvenModels.filter(m => matchesFacilityId(m.facilityId, facilityId) || matchesFacilityId(m.facilityUuid, facilityId));
}

/**
 * Retrieves a single model by ID or code
 */
export function getBreakEvenModelByIdOrCode(identifier, facilityId) {
  return liveBreakEvenModels.find(m =>
    (m.id === identifier || m.modelCode === identifier) &&
    (!facilityId || matchesFacilityId(m.facilityId, facilityId) || matchesFacilityId(m.facilityUuid, facilityId))
  ) || liveBreakEvenModels[0];
}

/**
 * Retrieves full break-even analysis including specialty breakdowns
 */
export function getBreakEvenAnalysis(facilityId, modelId = 'BE2026_M10_BASE') {
  const model = getBreakEvenModelByIdOrCode(modelId, facilityId);
  if (!model) return null;

  return {
    model,
    specialties: liveSpecialties,
    facilityId: model.facilityId,
    baselinePeriodCode: model.baselinePeriodCode
  };
}

/**
 * Computes executive telemetry KPIs for ribbon display
 */
export function getBreakEvenTelemetry(facilityId, modelId = 'BE2026_M10_BASE') {
  const analysis = getBreakEvenAnalysis(facilityId, modelId);
  if (!analysis) return null;

  const m = analysis.model;

  return {
    modelId: m.id,
    modelCode: m.modelCode,
    modelName: m.modelName,
    status: m.status,
    isActive: m.isActive,
    fixedOverheadCosts: m.fixedOverheadCosts,
    averageRevenuePerCase: m.averageRevenuePerCase,
    averageVariableCostPerCase: m.averageVariableCostPerCase,
    unitContributionMargin: m.unitContributionMargin,
    contributionMarginRatio: m.contributionMarginRatio,
    breakEvenCases: m.breakEvenCases,
    breakEvenRevenue: m.breakEvenRevenue,
    actualCases: m.actualCases,
    marginOfSafetyCases: m.marginOfSafetyCases,
    marginOfSafetyPercent: m.marginOfSafetyPercent,
    degreeOfOperatingLeverage: m.degreeOfOperatingLeverage,
    dailyBreakEvenCases: m.dailyBreakEvenCases,
    operatingDaysPerPeriod: m.operatingDaysPerPeriod,
    specialtyCount: analysis.specialties.length,
    frozenHash: m.frozenHash,
    approvedAt: m.approvedAt
  };
}

/**
 * Simulates target profit volume or sensitivity shifts
 */
export function simulateBreakEvenSensitivity(baselineModel, options = {}) {
  const base = baselineModel || liveBreakEvenModels[0];

  const targetEbitda = Number(options.targetEbitda) || 0;
  const supplyInflationPercent = Number(options.supplyInflationPercent) || 0;
  const reimbursementChangePercent = Number(options.reimbursementChangePercent) || 0;
  const fixedCostShift = Number(options.fixedCostShift) || 0;

  const adjustedFixed = base.fixedOverheadCosts + fixedCostShift;
  const adjustedRevenuePerCase = Number((base.averageRevenuePerCase * (1 + reimbursementChangePercent / 100)).toFixed(2));
  const adjustedVariableCost = Number((base.averageVariableCostPerCase * (1 + supplyInflationPercent / 100)).toFixed(2));

  const adjustedUnitCm = calculateUnitContributionMargin(adjustedRevenuePerCase, adjustedVariableCost);
  const adjustedCmr = calculateContributionMarginRatio(adjustedUnitCm, adjustedRevenuePerCase);
  const breakEvenCases = calculateBreakEvenVolume(adjustedFixed, adjustedUnitCm);
  const breakEvenRevenue = calculateBreakEvenRevenue(adjustedFixed, adjustedCmr);
  const targetCases = calculateTargetProfitVolume(adjustedFixed, targetEbitda, adjustedUnitCm);
  const marginOfSafety = calculateMarginOfSafety(base.actualCases, breakEvenCases);

  return {
    adjustedFixed,
    adjustedRevenuePerCase,
    adjustedVariableCost,
    adjustedUnitCm,
    adjustedCmr,
    breakEvenCases,
    breakEvenRevenue,
    targetEbitda,
    targetCases,
    marginOfSafetyCases: marginOfSafety.cases,
    marginOfSafetyPercent: marginOfSafety.percent
  };
}

/**
 * Approves and hard-freezes a break-even benchmark model with SHA-256 seal
 */
export function approveAndFreezeBreakEvenModel(modelId, approvedBy = '00000000-0000-0000-0000-000000000001') {
  const model = liveBreakEvenModels.find(m => m.id === modelId || m.modelCode === modelId);
  if (!model) {
    throw new Error(`Break-even model ${modelId} not found`);
  }

  const sealPayload = {
    modelId: model.id,
    facilityId: model.facilityId,
    fixedOverheadCosts: model.fixedOverheadCosts,
    breakEvenCases: model.breakEvenCases,
    breakEvenRevenue: model.breakEvenRevenue,
    unitContributionMargin: model.unitContributionMargin,
    approvedBy,
    approvedAt: new Date().toISOString()
  };

  const seal = computeBreakEvenHash(sealPayload);

  // Set existing to SUPERSEDED
  liveBreakEvenModels.forEach(m => {
    if (m.facilityId === model.facilityId && m.id !== model.id && m.status === MODEL_STATUSES.ACTIVE_BENCHMARK) {
      m.status = MODEL_STATUSES.SUPERSEDED;
      m.isActive = false;
    }
  });

  model.status = MODEL_STATUSES.ACTIVE_BENCHMARK;
  model.isActive = true;
  model.isApproved = true;
  model.approvedBy = approvedBy;
  model.approvedAt = sealPayload.approvedAt;
  model.frozenHash = seal;

  return {
    success: true,
    modelId: model.id,
    modelCode: model.modelCode,
    status: model.status,
    frozenHash: seal,
    approvedAt: model.approvedAt
  };
}
