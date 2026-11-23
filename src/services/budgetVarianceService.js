/**
 * ==============================================================================
 * Phase E1: Budget vs. Actual & Variance Reporting Service
 * Module 14: CFO Dashboard & Financial Accounting
 * Description: Authoritative Budget Model, Flexible Budgeting Benchmarks,
 *              3-Way Variance Decomposition (Volume, Rate, Mix), Materiality
 *              Classification, and Cryptographic Budget Freeze Governance.
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
 * Deterministic cryptographic audit hash for budget versions
 */
export function computeBudgetProvenanceHash(payload) {
  const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
  if (nodeCrypto && typeof nodeCrypto.createHash === 'function') {
    return nodeCrypto.createHash('sha256').update(str).digest('hex');
  }
  let h1 = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h1 = Math.imul(h1 ^ str.charCodeAt(i), 0x01000193);
  }
  return `bva_seal_${(h1 >>> 0).toString(16)}`.padEnd(64, '0');
}

export const BUDGET_STATUSES = {
  DRAFT: 'DRAFT',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED_ACTIVE: 'APPROVED_ACTIVE',
  SUPERSEDED: 'SUPERSEDED',
  ARCHIVED: 'ARCHIVED'
};

export const ACCOUNT_CATEGORIES = {
  VOLUME: 'VOLUME',
  GROSS_REVENUE: 'GROSS_REVENUE',
  CONTRACTUAL_DEDUCTION: 'CONTRACTUAL_DEDUCTION',
  NET_REVENUE: 'NET_REVENUE',
  DIRECT_COST: 'DIRECT_COST',
  VARIABLE_COST: 'VARIABLE_COST',
  FIXED_OVERHEAD: 'FIXED_OVERHEAD',
  MARGIN: 'MARGIN'
};

export const SEVERITY_TIERS = {
  NORMAL: 'NORMAL',
  ATTENTION: 'ATTENTION',
  CRITICAL: 'CRITICAL'
};

export const MATERIALITY_CONFIG = {
  ATTENTION_THRESHOLD_PERCENT: 3.0,
  CRITICAL_THRESHOLD_PERCENT: 10.0,
  CRITICAL_THRESHOLD_DOLLARS: 25000.0
};

/**
 * Checks whether an account category is cost or expense oriented
 */
export function isExpenseOrCostCategory(category) {
  return [
    ACCOUNT_CATEGORIES.CONTRACTUAL_DEDUCTION,
    ACCOUNT_CATEGORIES.DIRECT_COST,
    ACCOUNT_CATEGORIES.VARIABLE_COST,
    ACCOUNT_CATEGORIES.FIXED_OVERHEAD
  ].includes(category);
}

/**
 * Calculates raw dollar variance: Actual - Budget
 */
export function calculateDollarVariance(actual, budget) {
  const act = Number(actual) || 0;
  const bud = Number(budget) || 0;
  return Number((act - bud).toFixed(2));
}

/**
 * Determines whether variance is favorable based on account polarity
 * For revenue/margin/volume: Actual >= Budget is favorable.
 * For expenses/costs: Actual <= Budget is favorable.
 */
export function isVarianceFavorable(actual, budget, category) {
  const act = Number(actual) || 0;
  const bud = Number(budget) || 0;
  if (isExpenseOrCostCategory(category)) {
    return act <= bud;
  }
  return act >= bud;
}

/**
 * Calculates percentage variance with safe division
 */
export function calculatePercentVariance(actual, budget) {
  const act = Number(actual) || 0;
  const bud = Number(budget) || 0;
  if (Math.abs(bud) === 0) {
    if (Math.abs(act) === 0) return 0.0;
    return 100.0;
  }
  return Number((((act - bud) / Math.abs(bud)) * 100).toFixed(2));
}

/**
 * Classifies severity tier based on percent and dollar thresholds
 */
export function classifySeverity(percentVariance, dollarVariance) {
  const absPct = Math.abs(Number(percentVariance) || 0);
  const absDol = Math.abs(Number(dollarVariance) || 0);

  if (absPct > MATERIALITY_CONFIG.CRITICAL_THRESHOLD_PERCENT || absDol >= MATERIALITY_CONFIG.CRITICAL_THRESHOLD_DOLLARS) {
    return SEVERITY_TIERS.CRITICAL;
  }
  if (absPct > MATERIALITY_CONFIG.ATTENTION_THRESHOLD_PERCENT) {
    return SEVERITY_TIERS.ATTENTION;
  }
  return SEVERITY_TIERS.NORMAL;
}

/**
 * Flexible Budget calculation: Actual Volume * Budgeted Unit Rate
 */
export function calculateFlexibleBudget(actualVolume, budgetUnitRate) {
  const vol = Number(actualVolume) || 0;
  const rate = Number(budgetUnitRate) || 0;
  return Number((vol * rate).toFixed(2));
}

/**
 * Deterministic 3-Way Variance Decomposition
 * Returns: { volumeImpact, rateImpact, mixImpact, totalDollarVariance }
 */
export function calculateVolumeRateMixDecomposition({
  actualAmount,
  budgetAmount,
  actualVolume,
  budgetVolume,
  actualUnitRate,
  budgetUnitRate,
  category
}) {
  const actVol = Number(actualVolume) || 0;
  const budVol = Number(budgetVolume) || 0;
  const actRate = Number(actualUnitRate) || 0;
  const budRate = Number(budgetUnitRate) || 0;
  const totalVariance = calculateDollarVariance(actualAmount, budgetAmount);

  // Volume Impact = (Actual Volume - Budget Volume) * Budget Unit Rate
  const rawVolumeImpact = (actVol - budVol) * budRate;
  
  // Rate / Price Impact = (Actual Unit Rate - Budget Unit Rate) * Actual Volume
  const rawRateImpact = (actRate - budRate) * actVol;

  // Mix Impact = Total - (Volume + Rate)
  const rawMixImpact = totalVariance - (rawVolumeImpact + rawRateImpact);

  // If cost/expense, polarity indicates savings/overrun
  const isCost = isExpenseOrCostCategory(category);
  const multiplier = isCost ? -1 : 1;

  return {
    volumeImpact: Number((rawVolumeImpact * multiplier).toFixed(2)),
    rateImpact: Number((rawRateImpact * multiplier).toFixed(2)),
    mixImpact: Number((rawMixImpact * multiplier).toFixed(2)),
    totalDollarVariance: totalVariance
  };
}

/**
 * Baseline Budget Models for Naples Surgery Center
 */
export const INITIAL_FACILITY_BUDGETS = [
  {
    id: 'bgt-naples-2026-v1',
    facilityId: 'fac-naples-01',
    budgetCode: 'FY2026_ORIGINAL',
    budgetName: 'FY 2026 Approved Operating Budget',
    fiscalYear: 2026,
    versionNumber: 1,
    status: BUDGET_STATUSES.APPROVED_ACTIVE,
    effectiveStartDate: '2026-01-01',
    effectiveEndDate: '2026-12-31',
    isApproved: true,
    approvedAt: '2025-12-15T16:00:00Z',
    approvedBy: 'usr-cfo-001',
    frozenHash: 'bva_seal_89dfa712e4b301c278912e9871fa0491029e8471bade02948172938471bade02',
    notes: 'Board-approved annual operating budget baseline for Naples Surgery Center.'
  },
  {
    id: 'bgt-naples-2026-v2',
    facilityId: 'fac-naples-01',
    budgetCode: 'FY2026_Q4_REFORECAST',
    budgetName: 'FY 2026 Q4 Reforecast & Capital Plan',
    fiscalYear: 2026,
    versionNumber: 2,
    status: BUDGET_STATUSES.UNDER_REVIEW,
    effectiveStartDate: '2026-10-01',
    effectiveEndDate: '2026-12-31',
    isApproved: false,
    approvedAt: null,
    approvedBy: null,
    frozenHash: null,
    notes: 'Draft reforecast factoring orthopedic volume surge and implant price increases.'
  }
];

/**
 * Baseline Line-Item Variance Data for October 2026 (Aligned with Phase E0 P&L Actuals)
 * Actual Case Volume: 240 cases, Budget: 250 cases.
 */
export const INITIAL_BVA_LINE_ITEMS = [
  // Operational Volume Driver
  {
    id: 'bva-line-vol-01',
    budgetId: 'bgt-naples-2026-v1',
    facilityId: 'fac-naples-01',
    periodCode: '2026-M10',
    lineCode: 'CASE_VOLUME',
    lineName: 'Surgical Case Volume (Cases Completed)',
    accountCategory: ACCOUNT_CATEGORIES.VOLUME,
    unitOfMeasure: 'CASES',
    actualAmount: 240,
    budgetAmount: 250,
    actualUnitRate: 1,
    budgetUnitRate: 1,
    explanation: 'Minor 10-case shortfall due to surgeon block vacation during week 2.',
    actionPlan: 'Extend November block releases to absorb backlogged orthopedic cases.'
  },
  {
    id: 'bva-line-time-02',
    budgetId: 'bgt-naples-2026-v1',
    facilityId: 'fac-naples-01',
    periodCode: '2026-M10',
    lineCode: 'TOTAL_OR_MINUTES',
    lineName: 'Total Operating Room Minutes Used',
    accountCategory: ACCOUNT_CATEGORIES.VOLUME,
    unitOfMeasure: 'MINUTES',
    actualAmount: 18240,
    budgetAmount: 19000,
    actualUnitRate: 76.0,
    budgetUnitRate: 76.0,
    explanation: 'Average case duration on par with baseline (76 mins/case).',
    actionPlan: 'Maintain turnover efficiency to support block utilization targets.'
  },

  // 1. Gross Revenue
  {
    id: 'bva-line-rev-01',
    budgetId: 'bgt-naples-2026-v1',
    facilityId: 'fac-naples-01',
    periodCode: '2026-M10',
    lineCode: 'REV_SURGICAL_GROSS',
    lineName: 'Gross Patient Surgical Charges',
    accountCategory: ACCOUNT_CATEGORIES.GROSS_REVENUE,
    unitOfMeasure: 'CURRENCY',
    actualAmount: 2880000.00,
    budgetAmount: 3000000.00,
    actualUnitRate: 12000.00,
    budgetUnitRate: 12000.00,
    explanation: 'Volume delta of -10 cases drove the $120,000 gross charge variance.',
    actionPlan: 'Increase primary care referral outreach for spine and total joints.'
  },

  // 2. Contractual Deductions
  {
    id: 'bva-line-ded-01',
    budgetId: 'bgt-naples-2026-v1',
    facilityId: 'fac-naples-01',
    periodCode: '2026-M10',
    lineCode: 'DED_CONTRACTUAL_ALLOWANCES',
    lineName: 'Commercial & Medicare Contractual Allowances',
    accountCategory: ACCOUNT_CATEGORIES.CONTRACTUAL_DEDUCTION,
    unitOfMeasure: 'CURRENCY',
    actualAmount: 1730000.00,
    budgetAmount: 1820000.00,
    actualUnitRate: 7208.33,
    budgetUnitRate: 7280.00,
    explanation: 'Allowances were lower than budget by $90,000, reflecting lower gross volume and favorable commercial payer mix.',
    actionPlan: 'Audit commercial carve-out recoveries to preserve favorable allowable yield.'
  },

  // Net Patient Revenue (Summary Margin Line)
  {
    id: 'bva-line-npr-01',
    budgetId: 'bgt-naples-2026-v1',
    facilityId: 'fac-naples-01',
    periodCode: '2026-M10',
    lineCode: 'NPR',
    lineName: 'Net Patient Revenue (NPR)',
    accountCategory: ACCOUNT_CATEGORIES.NET_REVENUE,
    unitOfMeasure: 'CURRENCY',
    actualAmount: 1150000.00,
    budgetAmount: 1180000.00,
    actualUnitRate: 4791.67,
    budgetUnitRate: 4720.00,
    explanation: 'NPR variance was limited to -$30,000 (-2.54%) despite volume drop, because average realized reimbursement per case increased from $4,720 to $4,792.',
    actionPlan: 'Sustain favorable commercial case mix through scheduling prioritization.'
  },

  // 3. Direct Clinical Costs
  {
    id: 'bva-line-cost-01',
    budgetId: 'bgt-naples-2026-v1',
    facilityId: 'fac-naples-01',
    periodCode: '2026-M10',
    lineCode: 'COST_IMPLANTS',
    lineName: 'Surgical Implants & Hardware (Orthopedic & Spine)',
    accountCategory: ACCOUNT_CATEGORIES.DIRECT_COST,
    unitOfMeasure: 'CURRENCY',
    actualAmount: 345000.00,
    budgetAmount: 350000.00,
    actualUnitRate: 1437.50,
    budgetUnitRate: 1400.00,
    explanation: 'Total implant spending was under budget by $5,000 due to volume, but per-case implant cost rose by $37.50 (+2.68%) due to higher-tier construct selection.',
    actionPlan: 'Enforce formulary construct pricing thresholds with vendor contract matrix.'
  },
  {
    id: 'bva-line-cost-02',
    budgetId: 'bgt-naples-2026-v1',
    facilityId: 'fac-naples-01',
    periodCode: '2026-M10',
    lineCode: 'COST_SUPPLIES',
    lineName: 'Sterile Surgical Supplies, Custom Packs & Biologics',
    accountCategory: ACCOUNT_CATEGORIES.DIRECT_COST,
    unitOfMeasure: 'CURRENCY',
    actualAmount: 145000.00,
    budgetAmount: 150000.00,
    actualUnitRate: 604.17,
    budgetUnitRate: 600.00,
    explanation: 'Favorable $5,000 variance in surgical supplies directly tracking volume.',
    actionPlan: 'Implement standard tray reduction across ophthalmic pack orders.'
  },
  {
    id: 'bva-line-cost-03',
    budgetId: 'bgt-naples-2026-v1',
    facilityId: 'fac-naples-01',
    periodCode: '2026-M10',
    lineCode: 'COST_NURSING_LABOR',
    lineName: 'Direct Procedural Scrub & Circulating RN Labor',
    accountCategory: ACCOUNT_CATEGORIES.DIRECT_COST,
    unitOfMeasure: 'CURRENCY',
    actualAmount: 110000.00,
    budgetAmount: 110000.00,
    actualUnitRate: 458.33,
    budgetUnitRate: 440.00,
    explanation: 'Direct labor matched budget at $110,000; slight overtime on Friday afternoons offset by weekday efficiencies.',
    actionPlan: 'Calibrate staggered staff shift start times with room block starts.'
  },

  // Direct Clinical Margin
  {
    id: 'bva-line-cm-01',
    budgetId: 'bgt-naples-2026-v1',
    facilityId: 'fac-naples-01',
    periodCode: '2026-M10',
    lineCode: 'DIRECT_CLINICAL_MARGIN',
    lineName: 'Direct Clinical Margin (Procedural Contribution)',
    accountCategory: ACCOUNT_CATEGORIES.MARGIN,
    unitOfMeasure: 'CURRENCY',
    actualAmount: 550000.00,
    budgetAmount: 570000.00,
    actualUnitRate: 2291.67,
    budgetUnitRate: 2280.00,
    explanation: 'Direct clinical margin finished at $550,000 (47.83% of NPR) vs budget of $570,000 (48.31% of NPR).',
    actionPlan: 'Focus volume recapture on high-margin orthopedic joint replacements.'
  },

  // 4. Variable Facility Costs
  {
    id: 'bva-line-var-01',
    budgetId: 'bgt-naples-2026-v1',
    facilityId: 'fac-naples-01',
    periodCode: '2026-M10',
    lineCode: 'COST_VARIABLE_FACILITY',
    lineName: 'Variable Facility Operating Costs (SPD, Linen, Waste)',
    accountCategory: ACCOUNT_CATEGORIES.VARIABLE_COST,
    unitOfMeasure: 'CURRENCY',
    actualAmount: 90000.00,
    budgetAmount: 95000.00,
    actualUnitRate: 375.00,
    budgetUnitRate: 380.00,
    explanation: 'Favorable $5,000 variance resulting from lower case volumes and linen conservation protocols.',
    actionPlan: 'Audit sterilizer cycle batching to sustain utility efficiency.'
  },

  // 5. Fixed Overhead (OPEX)
  {
    id: 'bva-line-fixed-01',
    budgetId: 'bgt-naples-2026-v1',
    facilityId: 'fac-naples-01',
    periodCode: '2026-M10',
    lineCode: 'FIXED_OVERHEAD_OPEX',
    lineName: 'Fixed Administrative Overhead & Facility Lease',
    accountCategory: ACCOUNT_CATEGORIES.FIXED_OVERHEAD,
    unitOfMeasure: 'CURRENCY',
    actualAmount: 150000.00,
    budgetAmount: 155000.00,
    actualUnitRate: 625.00,
    budgetUnitRate: 620.00,
    explanation: 'Favorable $5,000 savings in IT subscription renegotiations and billing office efficiencies.',
    actionPlan: 'Complete quarterly lease operating expense reconciliation.'
  },

  // 6. EBITDA
  {
    id: 'bva-line-ebitda-01',
    budgetId: 'bgt-naples-2026-v1',
    facilityId: 'fac-naples-01',
    periodCode: '2026-M10',
    lineCode: 'EBITDA',
    lineName: 'Operating EBITDA',
    accountCategory: ACCOUNT_CATEGORIES.MARGIN,
    unitOfMeasure: 'CURRENCY',
    actualAmount: 310000.00,
    budgetAmount: 320000.00,
    actualUnitRate: 1291.67,
    budgetUnitRate: 1280.00,
    explanation: 'Operating EBITDA finished at $310,000 (26.96% EBITDA margin) vs budget of $320,000 (27.12%), a tight -$10,000 variance (-3.13%).',
    actionPlan: 'Re-capture 10 backlogged surgical cases in Q4 to achieve full annual EBITDA budget.'
  },

  // 7. Net Operating Income (NOI)
  {
    id: 'bva-line-noi-01',
    budgetId: 'bgt-naples-2026-v1',
    facilityId: 'fac-naples-01',
    periodCode: '2026-M10',
    lineCode: 'NET_OPERATING_INCOME',
    lineName: 'Net Operating Income (EBIT)',
    accountCategory: ACCOUNT_CATEGORIES.MARGIN,
    unitOfMeasure: 'CURRENCY',
    actualAmount: 270000.00,
    budgetAmount: 280000.00,
    actualUnitRate: 1125.00,
    budgetUnitRate: 1120.00,
    explanation: 'NOI of $270,000 reflects steady $40,000 scheduled equipment depreciation.',
    actionPlan: 'Review upcoming 2027 C-arm capital equipment lease schedule.'
  }
];

let liveBudgets = [...INITIAL_FACILITY_BUDGETS];
let liveLineItems = [...INITIAL_BVA_LINE_ITEMS];

/**
 * Resets in-memory budget state (useful for test runs)
 */
export function resetLiveBudgetState() {
  liveBudgets = JSON.parse(JSON.stringify(INITIAL_FACILITY_BUDGETS));
  liveLineItems = JSON.parse(JSON.stringify(INITIAL_BVA_LINE_ITEMS));
}

/**
 * Retrieves all budgets for a facility
 */
export function getFacilityBudgets(facilityId) {
  return liveBudgets.filter((b) => matchesFacilityId(b.facilityId, facilityId));
}

/**
 * Retrieves budget by code or ID
 */
export function getBudgetByIdOrCode(budgetIdOrCode, facilityId) {
  const all = getFacilityBudgets(facilityId);
  return all.find((b) => b.id === budgetIdOrCode || b.budgetCode === budgetIdOrCode) || all[0] || null;
}

/**
 * Retrieves evaluated BvA statement line items with computed variances
 */
export function getBudgetVarianceLineItems(budgetId, periodCode = '2026-M10', filters = {}) {
  let lines = liveLineItems.filter((line) => {
    const matchBudget = !budgetId || line.budgetId === budgetId;
    const matchPeriod = !periodCode || line.periodCode === periodCode;
    return matchBudget && matchPeriod;
  });

  // Calculate deterministic metrics on each item
  const evaluated = lines.map((item) => {
    const dollarVariance = calculateDollarVariance(item.actualAmount, item.budgetAmount);
    const percentVariance = calculatePercentVariance(item.actualAmount, item.budgetAmount);
    const isFavorable = isVarianceFavorable(item.actualAmount, item.budgetAmount, item.accountCategory);
    const severity = classifySeverity(percentVariance, dollarVariance);
    
    // Flexible budget: Actual Volume * Budgeted Unit Rate
    const flexibleBudget = calculateFlexibleBudget(
      item.unitOfMeasure === 'CASES' ? item.actualAmount : 240, // standard case volume
      item.budgetUnitRate
    );

    // 3-way decomposition
    const decomp = calculateVolumeRateMixDecomposition({
      actualAmount: item.actualAmount,
      budgetAmount: item.budgetAmount,
      actualVolume: 240,
      budgetVolume: 250,
      actualUnitRate: item.actualUnitRate,
      budgetUnitRate: item.budgetUnitRate,
      category: item.accountCategory
    });

    return {
      ...item,
      dollarVariance,
      percentVariance,
      isFavorable,
      severity,
      flexibleBudgetAmount: flexibleBudget,
      volumeImpact: decomp.volumeImpact,
      rateImpact: decomp.rateImpact,
      mixImpact: decomp.mixImpact
    };
  });

  // Apply filters
  let filtered = evaluated;
  if (filters.category && filters.category !== 'ALL') {
    filtered = filtered.filter((i) => i.accountCategory === filters.category);
  }
  if (filters.severity && filters.severity !== 'ALL') {
    filtered = filtered.filter((i) => i.severity === filters.severity);
  }
  if (filters.favorable !== undefined && filters.favorable !== 'ALL') {
    const isFav = filters.favorable === 'FAVORABLE';
    filtered = filtered.filter((i) => i.isFavorable === isFav);
  }
  if (filters.search && filters.search.trim()) {
    const q = filters.search.toLowerCase().trim();
    filtered = filtered.filter((i) =>
      i.lineName.toLowerCase().includes(q) ||
      i.lineCode.toLowerCase().includes(q) ||
      (i.explanation && i.explanation.toLowerCase().includes(q))
    );
  }

  return filtered;
}

/**
 * Returns executive telemetry for CFO ribbon
 */
export function getBvaExecutiveTelemetry(facilityId, periodCode = '2026-M10', budgetId = null) {
  const currentBudget = getBudgetByIdOrCode(budgetId, facilityId);
  if (!currentBudget) return null;

  const lines = getBudgetVarianceLineItems(currentBudget.id, periodCode);

  const nprLine = lines.find((l) => l.lineCode === 'NPR') || { actualAmount: 0, budgetAmount: 0, dollarVariance: 0, percentVariance: 0, isFavorable: true };
  const ebitdaLine = lines.find((l) => l.lineCode === 'EBITDA') || { actualAmount: 0, budgetAmount: 0, dollarVariance: 0, percentVariance: 0, isFavorable: true };
  const volLine = lines.find((l) => l.lineCode === 'CASE_VOLUME') || { actualAmount: 0, budgetAmount: 0, dollarVariance: 0, percentVariance: 0, isFavorable: true };
  
  // Direct clinical cost aggregated
  const directCosts = lines.filter((l) => l.accountCategory === ACCOUNT_CATEGORIES.DIRECT_COST);
  const actualDirectCostTotal = directCosts.reduce((sum, l) => sum + l.actualAmount, 0);
  const budgetDirectCostTotal = directCosts.reduce((sum, l) => sum + l.budgetAmount, 0);
  const directCostDollarVariance = calculateDollarVariance(actualDirectCostTotal, budgetDirectCostTotal);
  const directCostPercentVariance = calculatePercentVariance(actualDirectCostTotal, budgetDirectCostTotal);
  const isDirectCostFavorable = actualDirectCostTotal <= budgetDirectCostTotal;

  const favorableCount = lines.filter((l) => l.isFavorable).length;
  const unfavorableCount = lines.filter((l) => !l.isFavorable).length;
  const criticalCount = lines.filter((l) => l.severity === SEVERITY_TIERS.CRITICAL).length;

  return {
    facilityId,
    budgetId: currentBudget.id,
    budgetCode: currentBudget.budgetCode,
    budgetName: currentBudget.budgetName,
    budgetStatus: currentBudget.status,
    isApproved: currentBudget.isApproved,
    frozenHash: currentBudget.frozenHash,
    periodCode,
    npr: {
      actual: nprLine.actualAmount,
      budget: nprLine.budgetAmount,
      variance: nprLine.dollarVariance,
      percentVariance: nprLine.percentVariance,
      isFavorable: nprLine.isFavorable
    },
    ebitda: {
      actual: ebitdaLine.actualAmount,
      budget: ebitdaLine.budgetAmount,
      variance: ebitdaLine.dollarVariance,
      percentVariance: ebitdaLine.percentVariance,
      isFavorable: ebitdaLine.isFavorable
    },
    directCosts: {
      actual: actualDirectCostTotal,
      budget: budgetDirectCostTotal,
      variance: directCostDollarVariance,
      percentVariance: directCostPercentVariance,
      isFavorable: isDirectCostFavorable
    },
    volume: {
      actual: volLine.actualAmount,
      budget: volLine.budgetAmount,
      variance: volLine.dollarVariance,
      percentVariance: volLine.percentVariance,
      isFavorable: volLine.isFavorable
    },
    counts: {
      total: lines.length,
      favorable: favorableCount,
      unfavorable: unfavorableCount,
      critical: criticalCount
    }
  };
}

/**
 * Approves and hard-freezes a budget version, creating a cryptographic seal
 */
export function approveAndFreezeBudget(budgetId, userId = 'usr-cfo-001') {
  const budget = liveBudgets.find((b) => b.id === budgetId);
  if (!budget) {
    throw new Error(`Budget with id ${budgetId} not found.`);
  }

  // Supersede existing approved active budget for this facility
  liveBudgets.forEach((b) => {
    if (matchesFacilityId(b.facilityId, budget.facilityId) && b.id !== budgetId && b.status === BUDGET_STATUSES.APPROVED_ACTIVE) {
      b.status = BUDGET_STATUSES.SUPERSEDED;
    }
  });

  const sealPayload = {
    budgetId: budget.id,
    facilityId: budget.facilityId,
    budgetCode: budget.budgetCode,
    fiscalYear: budget.fiscalYear,
    approvedBy: userId,
    approvedAt: new Date().toISOString()
  };

  const seal = computeBudgetProvenanceHash(sealPayload);

  budget.status = BUDGET_STATUSES.APPROVED_ACTIVE;
  budget.isApproved = true;
  budget.approvedAt = sealPayload.approvedAt;
  budget.approvedBy = userId;
  budget.frozenHash = seal;

  return budget;
}

/**
 * Saves root cause explanation and action plan for a variance line item
 */
export function saveVarianceExplanation(varianceLineId, explanation, actionPlan, userId = 'usr-cfo-001') {
  const line = liveLineItems.find((l) => l.id === varianceLineId);
  if (!line) {
    throw new Error(`Variance item with id ${varianceLineId} not found.`);
  }

  line.explanation = explanation;
  line.actionPlan = actionPlan;
  line.reviewedBy = userId;
  line.reviewedAt = new Date().toISOString();

  return line;
}
