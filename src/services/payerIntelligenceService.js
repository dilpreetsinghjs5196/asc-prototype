/**
 * ==============================================================================
 * Phase B3: Payer Intelligence Service
 * Module 11: Surgeon & Clinical Intelligence / Executive Intelligence
 * Description: Deterministic calculations for ASC payer portfolio intelligence,
 *              evaluating payer economics, adjudication velocity (Days to Pay),
 *              first-pass denial friction, contractual underpayment leakage,
 *              and accounts receivable (AR) aging risk.
 * ==============================================================================
 */

export const PAYER_CATEGORIES = {
  COMMERCIAL: { key: 'Commercial', label: 'Commercial HMO/PPO', color: '#0284c7' },
  MEDICARE: { key: 'Medicare', label: 'Medicare Part B (MAC)', color: '#059669' },
  MEDICARE_ADVANTAGE: { key: 'Medicare_Advantage', label: 'Medicare Advantage', color: '#0d9488' },
  MEDICAID: { key: 'Medicaid', label: 'Medicaid / Managed Care', color: '#d97706' },
  WORKERS_COMP: { key: 'Workers_Comp', label: "Workers' Compensation", color: '#475569' }
};

export const PERFORMANCE_GRADES = {
  A: {
    key: 'A',
    label: 'Grade A — Preferred Partner',
    description: 'High net yield, rapid turnaround (<25 days), low denial friction (<6%).',
    color: '#059669',
    badgeBg: 'rgba(5, 150, 105, 0.12)',
    badgeBorder: 'rgba(5, 150, 105, 0.35)'
  },
  B: {
    key: 'B',
    label: 'Grade B — Standard Partner',
    description: 'Acceptable payment velocity (25-35 days), moderate appeal overhead.',
    color: '#0284c7',
    badgeBg: 'rgba(2, 132, 199, 0.12)',
    badgeBorder: 'rgba(2, 132, 199, 0.35)'
  },
  C: {
    key: 'C',
    label: 'Grade C — Frictional Partner',
    description: 'Sluggish adjudication (>35 days), elevated denial rates, contract leakage.',
    color: '#d97706',
    badgeBg: 'rgba(217, 119, 6, 0.12)',
    badgeBorder: 'rgba(217, 119, 6, 0.35)'
  },
  D: {
    key: 'D',
    label: 'Grade D — High Friction Risk',
    description: 'Severe payment delays (>50 days), frequent non-payment, renegotiation target.',
    color: '#dc2626',
    badgeBg: 'rgba(220, 38, 38, 0.12)',
    badgeBorder: 'rgba(220, 38, 38, 0.35)'
  },
  F: {
    key: 'F',
    label: 'Grade F — Critical Network Risk',
    description: 'Systemic underpayment, chronic delinquent AR, contract termination candidate.',
    color: '#991b1b',
    badgeBg: 'rgba(153, 27, 27, 0.12)',
    badgeBorder: 'rgba(153, 27, 27, 0.35)'
  }
};

export const PAYER_BENCHMARKS = {
  TARGET_REALIZATION_RATE_PCT: 70.0,
  MAX_DAYS_TO_PAY: 30.0,
  MAX_DENIAL_RATE_PCT: 8.0,
  MIN_OVERTURN_RATE_PCT: 75.0,
  MAX_UNDERPAYMENT_RATE_PCT: 5.0,
  MAX_AGED_AR_OVER_90_PCT: 10.0
};

/**
 * Calculate Collection Realization Rate (%)
 */
export function calculateRealizationRate(collections = 0, billed = 0) {
  if (billed <= 0) return 0.0;
  const rate = (collections / billed) * 100;
  return Number(rate.toFixed(2));
}

/**
 * Calculate Adjudication Turnaround Days (Days to Pay)
 */
export function calculateDaysToPay(submissionDate, paymentDate) {
  if (!submissionDate || !paymentDate) return 0.0;
  const sub = new Date(submissionDate);
  const pay = new Date(paymentDate);
  const diffMs = pay.getTime() - sub.getTime();
  const days = Math.max(0, diffMs / (1000 * 60 * 60 * 24));
  return Number(days.toFixed(1));
}

/**
 * Calculate First-Pass Denial Rate (%)
 */
export function calculateDenialRate(deniedClaims = 0, totalClaims = 0) {
  if (totalClaims <= 0) return 0.0;
  const rate = (deniedClaims / totalClaims) * 100;
  return Number(rate.toFixed(2));
}

/**
 * Calculate Denial Overturn Resolution Rate (%)
 */
export function calculateDenialOverturnRate(overturnedCount = 0, totalDeniedCount = 0) {
  if (totalDeniedCount <= 0) return 0.0;
  const rate = (overturnedCount / totalDeniedCount) * 100;
  return Number(rate.toFixed(2));
}

/**
 * Calculate Contractual Underpayment Rate (%)
 */
export function calculateUnderpaymentRate(underpaidCount = 0, totalClaims = 0) {
  if (totalClaims <= 0) return 0.0;
  const rate = (underpaidCount / totalClaims) * 100;
  return Number(rate.toFixed(2));
}

/**
 * Calculate Aged AR Exposure Ratio (% past 90 days)
 */
export function calculateAgedArRatio(ar91To120 = 0, arOver120 = 0, totalAr = 0) {
  if (totalAr <= 0) return 0.0;
  const aged = ar91To120 + arOver120;
  const ratio = (aged / totalAr) * 100;
  return Number(ratio.toFixed(2));
}

/**
 * Calculate Payer Friction Index (PFI, 0 - 100)
 */
export function calculatePayerFrictionIndex(
  daysToPay = 0,
  denialRatePct = 0,
  underpaymentRatePct = 0,
  agedArOver90Pct = 0
) {
  // Normalize days to pay against 60-day baseline
  const normDays = Math.min(100, (daysToPay / 60) * 100);
  const pfi =
    (0.35 * normDays) +
    (0.30 * Math.min(100, denialRatePct)) +
    (0.20 * Math.min(100, underpaymentRatePct)) +
    (0.15 * Math.min(100, agedArOver90Pct));

  return Number(Math.min(100, Math.max(0, pfi)).toFixed(2));
}

/**
 * Classify Payer Performance Grade
 */
export function classifyPayerGrade(payerFrictionIndex = 0) {
  if (payerFrictionIndex < 20.0) return 'A';
  if (payerFrictionIndex < 40.0) return 'B';
  if (payerFrictionIndex < 65.0) return 'C';
  if (payerFrictionIndex < 80.0) return 'D';
  return 'F';
}

/**
 * Aggregate Facility-Wide Payer Intelligence KPIs
 */
export function calculateFacilityPayerKpis(payers = []) {
  if (!payers || payers.length === 0) {
    return {
      totalBilled: 0,
      totalCollections: 0,
      portfolioRealizationRate: 0.0,
      avgDaysToPay: 0.0,
      avgDenialRate: 0.0,
      totalUnderpayment: 0,
      totalAr: 0,
      totalAgedArOver90: 0,
      agedArOver90Pct: 0.0,
      highFrictionCount: 0,
      payersCount: 0
    };
  }

  let totalBilled = 0;
  let totalCollections = 0;
  let totalDaysWeight = 0;
  let totalDenialWeight = 0;
  let totalClaims = 0;
  let totalUnderpayment = 0;
  let totalAr = 0;
  let totalAgedArOver90 = 0;
  let highFrictionCount = 0;

  payers.forEach(p => {
    totalBilled += p.totalBilledAmount || 0;
    totalCollections += p.totalNetCollections || 0;
    const claims = p.claimsCount || 0;
    totalClaims += claims;
    totalDaysWeight += (p.avgDaysToPay || 0) * claims;
    totalDenialWeight += (p.firstPassDenialRatePct || 0) * claims;
    totalUnderpayment += p.totalUnderpaymentVariance || 0;
    totalAr += p.totalArBalance || 0;
    totalAgedArOver90 += (p.ar91To120 || 0) + (p.arOver120 || 0);

    if (['C', 'D', 'F'].includes(p.performanceGrade)) {
      highFrictionCount += 1;
    }
  });

  const portfolioRealizationRate = calculateRealizationRate(totalCollections, totalBilled);
  const avgDaysToPay = totalClaims > 0 ? Number((totalDaysWeight / totalClaims).toFixed(1)) : 0.0;
  const avgDenialRate = totalClaims > 0 ? Number((totalDenialWeight / totalClaims).toFixed(2)) : 0.0;
  const agedArOver90Pct = calculateAgedArRatio(0, totalAgedArOver90, totalAr);

  return {
    totalBilled: Math.round(totalBilled),
    totalCollections: Math.round(totalCollections),
    portfolioRealizationRate,
    avgDaysToPay,
    avgDenialRate,
    totalUnderpayment: Math.round(totalUnderpayment),
    totalAr: Math.round(totalAr),
    totalAgedArOver90: Math.round(totalAgedArOver90),
    agedArOver90Pct,
    highFrictionCount,
    payersCount: payers.length
  };
}

/**
 * Seed Dataset: 8 Major Commercial & Government Payers for ASC Portfolio
 */
export const SEED_PAYER_INTELLIGENCE_METRICS = [
  {
    id: 'pim-001',
    payerCode: 'PAY-MEDB',
    payerName: 'Medicare Part B (Novitas MAC)',
    payerCategory: 'Medicare',
    claimsCount: 380,
    cleanClaimsCount: 362,
    totalBilledAmount: 1240000.0,
    totalContractualAdjustments: 421600.0,
    totalNetCollections: 818400.0,
    realizationRatePct: 66.0,
    avgDaysToPay: 16.2,
    eraAdoptionPct: 99.4,
    promptPayCompliancePct: 98.8,
    firstPassDenialCount: 18,
    firstPassDenialRatePct: 4.74,
    denialOverturnRatePct: 85.0,
    totalDeniedAmount: 48600.0,
    unrecoveredDeniedAmount: 7290.0,
    underpaymentClaimsCount: 7,
    underpaymentRatePct: 1.84,
    totalUnderpaymentVariance: 12400.0,
    arCurrent30: 78000.0,
    ar31To60: 16900.0,
    ar61To90: 0.0,
    ar91To120: 3100.0,
    arOver120: 0.0,
    totalArBalance: 98000.0,
    agedArOver90Pct: 3.16,
    payerFrictionIndex: 12.07,
    performanceGrade: 'A',
    topDenialCarc: 'CO-4 (Modifier Coding)',
    disputeOpportunity: 'Low friction; automated ERA adjudication with minimal MPPR dispute.'
  },
  {
    id: 'pim-002',
    payerCode: 'PAY-BCBS',
    payerName: 'Blue Cross Blue Shield (Commercial)',
    payerCategory: 'Commercial',
    claimsCount: 520,
    cleanClaimsCount: 482,
    totalBilledAmount: 2450000.0,
    totalContractualAdjustments: 661500.0,
    totalNetCollections: 1788500.0,
    realizationRatePct: 73.0,
    avgDaysToPay: 24.5,
    eraAdoptionPct: 96.2,
    promptPayCompliancePct: 94.6,
    firstPassDenialCount: 38,
    firstPassDenialRatePct: 7.31,
    denialOverturnRatePct: 78.0,
    totalDeniedAmount: 142000.0,
    unrecoveredDeniedAmount: 31240.0,
    underpaymentClaimsCount: 24,
    underpaymentRatePct: 4.62,
    totalUnderpaymentVariance: 68200.0,
    arCurrent30: 165000.0,
    ar31To60: 44700.0,
    ar61To90: 0.0,
    ar91To120: 11200.0,
    arOver120: 4100.0,
    totalArBalance: 225000.0,
    agedArOver90Pct: 6.8,
    payerFrictionIndex: 18.42,
    performanceGrade: 'A',
    topDenialCarc: 'PR-197 (Prior Authorization)',
    disputeOpportunity: 'High-volume core payer; unbundling of secondary arthroscopy codes.'
  },
  {
    id: 'pim-003',
    payerCode: 'PAY-CIGNA',
    payerName: 'Cigna Healthcare',
    payerCategory: 'Commercial',
    claimsCount: 260,
    cleanClaimsCount: 238,
    totalBilledAmount: 1150000.0,
    totalContractualAdjustments: 322000.0,
    totalNetCollections: 828000.0,
    realizationRatePct: 72.0,
    avgDaysToPay: 28.4,
    eraAdoptionPct: 94.8,
    promptPayCompliancePct: 92.4,
    firstPassDenialCount: 22,
    firstPassDenialRatePct: 8.46,
    denialOverturnRatePct: 74.0,
    totalDeniedAmount: 82000.0,
    unrecoveredDeniedAmount: 21320.0,
    underpaymentClaimsCount: 14,
    underpaymentRatePct: 5.38,
    totalUnderpaymentVariance: 38500.0,
    arCurrent30: 92000.0,
    ar31To60: 30600.0,
    ar61To90: 0.0,
    ar91To120: 6800.0,
    arOver120: 2600.0,
    totalArBalance: 132000.0,
    agedArOver90Pct: 7.12,
    payerFrictionIndex: 21.22,
    performanceGrade: 'B',
    topDenialCarc: 'CO-50 (Medical Necessity)',
    disputeOpportunity: 'Consistent payer; appeals successful when operative notes submitted.'
  },
  {
    id: 'pim-004',
    payerCode: 'PAY-AETNA',
    payerName: 'Aetna / CVS Health',
    payerCategory: 'Commercial',
    claimsCount: 310,
    cleanClaimsCount: 280,
    totalBilledAmount: 1420000.0,
    totalContractualAdjustments: 426000.0,
    totalNetCollections: 994000.0,
    realizationRatePct: 70.0,
    avgDaysToPay: 31.0,
    eraAdoptionPct: 93.0,
    promptPayCompliancePct: 89.2,
    firstPassDenialCount: 30,
    firstPassDenialRatePct: 9.68,
    denialOverturnRatePct: 71.0,
    totalDeniedAmount: 112000.0,
    unrecoveredDeniedAmount: 32480.0,
    underpaymentClaimsCount: 19,
    underpaymentRatePct: 6.13,
    totalUnderpaymentVariance: 44800.0,
    arCurrent30: 108000.0,
    ar31To60: 42200.0,
    ar61To90: 0.0,
    ar91To120: 9400.0,
    arOver120: 4400.0,
    totalArBalance: 164000.0,
    agedArOver90Pct: 8.41,
    payerFrictionIndex: 23.48,
    performanceGrade: 'B',
    topDenialCarc: 'PR-197 (Pre-certification)',
    disputeOpportunity: 'Moderate friction; frequent auth checks on pain management injections.'
  },
  {
    id: 'pim-005',
    payerCode: 'PAY-HUMANA',
    payerName: 'Humana (Medicare Advantage)',
    payerCategory: 'Medicare_Advantage',
    claimsCount: 210,
    cleanClaimsCount: 180,
    totalBilledAmount: 890000.0,
    totalContractualAdjustments: 311500.0,
    totalNetCollections: 578500.0,
    realizationRatePct: 65.0,
    avgDaysToPay: 36.8,
    eraAdoptionPct: 91.2,
    promptPayCompliancePct: 84.0,
    firstPassDenialCount: 30,
    firstPassDenialRatePct: 14.29,
    denialOverturnRatePct: 62.0,
    totalDeniedAmount: 105000.0,
    unrecoveredDeniedAmount: 39900.0,
    underpaymentClaimsCount: 18,
    underpaymentRatePct: 8.57,
    totalUnderpaymentVariance: 48200.0,
    arCurrent30: 74000.0,
    ar31To60: 36000.0,
    ar61To90: 0.0,
    ar91To120: 11800.0,
    arOver120: 6200.0,
    totalArBalance: 128000.0,
    agedArOver90Pct: 14.06,
    payerFrictionIndex: 29.56,
    performanceGrade: 'B',
    topDenialCarc: 'CO-50 (Medical Necessity Guidelines)',
    disputeOpportunity: 'Aggressive review on cataract premium lenses and knee scopes.'
  },
  {
    id: 'pim-006',
    payerCode: 'PAY-UHC',
    payerName: 'UnitedHealthcare (Commercial & Optum)',
    payerCategory: 'Commercial',
    claimsCount: 410,
    cleanClaimsCount: 342,
    totalBilledAmount: 1860000.0,
    totalContractualAdjustments: 613800.0,
    totalNetCollections: 1246200.0,
    realizationRatePct: 67.0,
    avgDaysToPay: 44.5,
    eraAdoptionPct: 88.5,
    promptPayCompliancePct: 76.2,
    firstPassDenialCount: 68,
    firstPassDenialRatePct: 16.59,
    denialOverturnRatePct: 54.0,
    totalDeniedAmount: 265000.0,
    unrecoveredDeniedAmount: 121900.0,
    underpaymentClaimsCount: 46,
    underpaymentRatePct: 11.22,
    totalUnderpaymentVariance: 114600.0,
    arCurrent30: 135000.0,
    ar31To60: 98100.0,
    ar61To90: 0.0,
    ar91To120: 34200.0,
    arOver120: 18700.0,
    totalArBalance: 286000.0,
    agedArOver90Pct: 18.5,
    payerFrictionIndex: 35.91,
    performanceGrade: 'B',
    topDenialCarc: 'CO-197 / CO-16 (Prior Auth & Incomplete Info)',
    disputeOpportunity: 'Systemic underpayment on bilateral modifier -50 and implant carveouts.'
  },
  {
    id: 'pim-007',
    payerCode: 'PAY-MEDICAID',
    payerName: 'State Medicaid / Managed Care',
    payerCategory: 'Medicaid',
    claimsCount: 190,
    cleanClaimsCount: 152,
    totalBilledAmount: 620000.0,
    totalContractualAdjustments: 347200.0,
    totalNetCollections: 272800.0,
    realizationRatePct: 44.0,
    avgDaysToPay: 52.4,
    eraAdoptionPct: 82.0,
    promptPayCompliancePct: 68.0,
    firstPassDenialCount: 37,
    firstPassDenialRatePct: 19.47,
    denialOverturnRatePct: 48.0,
    totalDeniedAmount: 94000.0,
    unrecoveredDeniedAmount: 48880.0,
    underpaymentClaimsCount: 15,
    underpaymentRatePct: 7.89,
    totalUnderpaymentVariance: 18400.0,
    arCurrent30: 58000.0,
    ar31To60: 52200.0,
    ar61To90: 0.0,
    ar91To120: 19400.0,
    arOver120: 12400.0,
    totalArBalance: 142000.0,
    agedArOver90Pct: 22.39,
    payerFrictionIndex: 41.31,
    performanceGrade: 'C',
    topDenialCarc: 'CO-27 (Coverage Terminated) / CO-29 (Timely Filing)',
    disputeOpportunity: 'Severe aging; recurring eligibility lapses require front-end clearinghouse check.'
  },
  {
    id: 'pim-008',
    payerCode: 'PAY-WORKCOMP',
    payerName: "Workers' Compensation (Travelers & Liberty)",
    payerCategory: 'Workers_Comp',
    claimsCount: 85,
    cleanClaimsCount: 74,
    totalBilledAmount: 540000.0,
    totalContractualAdjustments: 151200.0,
    totalNetCollections: 388800.0,
    realizationRatePct: 72.0,
    avgDaysToPay: 64.2,
    eraAdoptionPct: 54.0,
    promptPayCompliancePct: 52.0,
    firstPassDenialCount: 10,
    firstPassDenialRatePct: 11.76,
    denialOverturnRatePct: 68.0,
    totalDeniedAmount: 78000.0,
    unrecoveredDeniedAmount: 24960.0,
    underpaymentClaimsCount: 12,
    underpaymentRatePct: 14.12,
    totalUnderpaymentVariance: 52600.0,
    arCurrent30: 62000.0,
    ar31To60: 60800.0,
    ar61To90: 0.0,
    ar91To120: 28400.0,
    arOver120: 23800.0,
    totalArBalance: 175000.0,
    agedArOver90Pct: 29.83,
    payerFrictionIndex: 48.28,
    performanceGrade: 'C',
    topDenialCarc: 'CO-24 (Charges are not covered under Workers Comp)',
    disputeOpportunity: 'Paper-heavy manual adjudication; high surgical reimbursement but prolonged AR lag.'
  }
];

export default {
  PAYER_CATEGORIES,
  PERFORMANCE_GRADES,
  PAYER_BENCHMARKS,
  calculateRealizationRate,
  calculateDaysToPay,
  calculateDenialRate,
  calculateDenialOverturnRate,
  calculateUnderpaymentRate,
  calculateAgedArRatio,
  calculatePayerFrictionIndex,
  classifyPayerGrade,
  calculateFacilityPayerKpis,
  SEED_PAYER_INTELLIGENCE_METRICS
};
