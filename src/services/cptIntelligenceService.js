/**
 * ==============================================================================
 * Phase B5: CPT Intelligence Service
 * Module 11: Surgeon & Clinical Intelligence / Executive Intelligence
 * Description: Deterministic procedural analytics across operational duration,
 *              financial contribution margins, OR-hour yield velocity, cross-surgeon
 *              technique variance, Medicare parity, and billing denial friction.
 * ==============================================================================
 */

export const CPT_SPECIALTIES = {
  ORTHOPEDICS: { key: 'ORTHOPEDICS', label: 'Orthopedics' },
  OPHTHALMOLOGY: { key: 'OPHTHALMOLOGY', label: 'Ophthalmology' },
  GASTROENTEROLOGY: { key: 'GASTROENTEROLOGY', label: 'Gastroenterology' },
  ENT: { key: 'ENT', label: 'Otolaryngology (ENT)' },
  GENERAL_SURGERY: { key: 'GENERAL_SURGERY', label: 'General Surgery' },
  PAIN_MANAGEMENT: { key: 'PAIN_MANAGEMENT', label: 'Pain Management' }
};

export const CPT_PERFORMANCE_TIERS = {
  TIER_1_ANCHOR_PROFIT: {
    key: 'TIER_1_ANCHOR_PROFIT',
    label: 'Anchor Profit (Tier 1)',
    description: 'High contribution per OR-hour (≥ $2,000/hr) with low billing friction',
    color: '#059669',
    badgeBg: 'rgba(5, 150, 105, 0.12)',
    badgeBorder: 'rgba(5, 150, 105, 0.35)'
  },
  TIER_2_EFFICIENT_VOLUME: {
    key: 'TIER_2_EFFICIENT_VOLUME',
    label: 'Efficient Volume (Tier 2)',
    description: 'Predictable high-velocity cases with solid margins ($1,200 - $1,999/hr)',
    color: '#0284c7',
    badgeBg: 'rgba(2, 132, 199, 0.12)',
    badgeBorder: 'rgba(2, 132, 199, 0.35)'
  },
  TIER_3_MARGIN_DILUTER: {
    key: 'TIER_3_MARGIN_DILUTER',
    label: 'Margin Diluter (Tier 3)',
    description: 'Low yield (< $1,200/hr) driven by elevated implant or nursing time costs',
    color: '#d97706',
    badgeBg: 'rgba(217, 119, 6, 0.12)',
    badgeBorder: 'rgba(217, 119, 6, 0.35)'
  },
  TIER_4_HIGH_FRICTION: {
    key: 'TIER_4_HIGH_FRICTION',
    label: 'High Friction / Denial Risk (Tier 4)',
    description: 'Chronic first-pass claim rejections (≥ 10%) or pre-auth documentation lag',
    color: '#dc2626',
    badgeBg: 'rgba(220, 38, 38, 0.12)',
    badgeBorder: 'rgba(220, 38, 38, 0.35)'
  }
};

export const CPT_BENCHMARKS = {
  TARGET_MARGIN_PER_OR_HOUR: 1800.0,
  MIN_MEDICARE_PARITY_PCT: 175.0,
  MAX_ACCEPTABLE_DENIAL_RATE_PCT: 8.0,
  MAX_FRICTION_INDEX: 35.0
};

/**
 * Calculate Procedural Contribution Margin ($)
 * Net Collections less Total Direct Variable Cost (implants, supplies, labor)
 */
export function calculateCptContributionMargin(netCollections = 0, totalDirectCost = 0) {
  const margin = (netCollections || 0) - (totalDirectCost || 0);
  return Number(margin.toFixed(2));
}

/**
 * Calculate Procedural Contribution Margin Per OR-Hour ($/hr)
 * Normalized suite productivity metric based on actual operative minutes
 */
export function calculateCptMarginPerOrHour(contributionMargin = 0, actualOrMinutes = 0) {
  if (!actualOrMinutes || actualOrMinutes <= 0) return 0.0;
  const yieldPerHour = (contributionMargin / actualOrMinutes) * 60;
  return Number(yieldPerHour.toFixed(2));
}

/**
 * Calculate Medicare ASC Base Rate Parity Percentage (%)
 * Ratio of commercial allowed reimbursement to statutory Medicare ASC rate
 */
export function calculateCptMedicarePercent(actualAllowed = 0, medicareAscBaseRate = 0) {
  if (!medicareAscBaseRate || medicareAscBaseRate <= 0) return 0.0;
  const parity = (actualAllowed / medicareAscBaseRate) * 100;
  return Number(parity.toFixed(2));
}

/**
 * Calculate Operative Duration Variance vs P80 Benchmark (minutes)
 * Positive = overrun; Negative = faster than calibrated P80
 */
export function calculateCptDurationVariance(actualDuration = 0, p80Duration = 0) {
  const variance = (actualDuration || 0) - (p80Duration || 0);
  return Number(variance.toFixed(1));
}

/**
 * Calculate First-Pass Procedural Denial Rate (%)
 */
export function calculateCptDenialRate(deniedCases = 0, totalCases = 0) {
  if (!totalCases || totalCases <= 0) return 0.0;
  const rate = (deniedCases / totalCases) * 100;
  return Number(rate.toFixed(2));
}

/**
 * Calculate Procedural Friction Index (0 - 100)
 * Weighted composite of denial rate, adjudication velocity, and documentation lag
 */
export function calculateCptFrictionIndex(denialRate = 0, daysToPay = 0, docLagDays = 0) {
  const denialComp = Math.min(50, (denialRate || 0) * 3.5);
  const velocityComp = Math.min(30, Math.max(0, ((daysToPay || 0) - 15) * 1.0));
  const docComp = Math.min(20, (docLagDays || 0) * 5.0);

  const index = denialComp + velocityComp + docComp;
  return Number(Math.min(100, Math.max(0, index)).toFixed(1));
}

/**
 * Classify CPT Performance Tier
 */
export function classifyCptTier(marginPerOrHour = 0, frictionIndex = 0, denialRate = 0) {
  if (denialRate >= 10.0 || frictionIndex >= 45.0) {
    return 'TIER_4_HIGH_FRICTION';
  }
  if (marginPerOrHour >= 2000.0 && frictionIndex < 35.0) {
    return 'TIER_1_ANCHOR_PROFIT';
  }
  if (marginPerOrHour < 1200.0) {
    return 'TIER_3_MARGIN_DILUTER';
  }
  return 'TIER_2_EFFICIENT_VOLUME';
}

/**
 * Aggregate Facility-Wide CPT Intelligence KPIs
 */
export function calculateFacilityCptKpis(cptList = []) {
  if (!cptList || cptList.length === 0) {
    return {
      totalEvaluatedCpts: 0,
      totalAnnualVolume: 0,
      totalNetCollections: 0,
      totalContributionMargin: 0,
      avgMarginPerOrHour: 0.0,
      portfolioMedicareParityPct: 0.0,
      avgFirstPassDenialRatePct: 0.0,
      highFrictionCount: 0,
      anchorProfitCount: 0
    };
  }

  let totalVol = 0;
  let totalNet = 0;
  let totalMargin = 0;
  let totalMarginPerHourSum = 0;
  let totalMedicareParitySum = 0;
  let totalDenialRateSum = 0;
  let highFriction = 0;
  let anchorCount = 0;

  cptList.forEach(cpt => {
    totalVol += cpt.annualCaseVolume || 0;
    totalNet += cpt.netCollections || 0;
    totalMargin += cpt.contributionMargin || 0;
    totalMarginPerHourSum += cpt.marginPerOrHour || 0;
    totalMedicareParitySum += cpt.medicareParityPct || 0;
    totalDenialRateSum += cpt.firstPassDenialRatePct || 0;

    if (cpt.performanceTier === 'TIER_4_HIGH_FRICTION' || cpt.firstPassDenialRatePct >= 10.0) {
      highFriction += 1;
    }
    if (cpt.performanceTier === 'TIER_1_ANCHOR_PROFIT') {
      anchorCount += 1;
    }
  });

  const count = cptList.length;
  const avgMarginPerOrHour = Number((totalMarginPerHourSum / count).toFixed(2));
  const portfolioMedicareParityPct = Number((totalMedicareParitySum / count).toFixed(2));
  const avgFirstPassDenialRatePct = Number((totalDenialRateSum / count).toFixed(2));

  return {
    totalEvaluatedCpts: count,
    totalAnnualVolume: totalVol,
    totalNetCollections: Math.round(totalNet),
    totalContributionMargin: Math.round(totalMargin),
    avgMarginPerOrHour,
    portfolioMedicareParityPct,
    avgFirstPassDenialRatePct,
    highFrictionCount: highFriction,
    anchorProfitCount: anchorCount
  };
}

/**
 * Deterministic Seed Dataset: 10 Core Surgical Procedures across Key Specialties
 */
export const SEED_CPT_INTELLIGENCE = [
  {
    id: 'cpt-27447',
    cptCode: '27447',
    procedureName: 'Total Knee Arthroplasty (TKA)',
    specialty: 'ORTHOPEDICS',
    anatomicCategory: 'Lower Extremity / Knee',
    annualCaseVolume: 184,
    avgScheduledMinutes: 95.0,
    avgActualOrMinutes: 84.5,
    p80DurationMinutes: 90.0,
    avgTurnoverMinutes: 24.0,
    totalBilledCharges: 1980000.0,
    netCollections: 1324800.0,
    totalDirectCost: 680800.0,
    implantCost: 460000.0,
    supplyCost: 110400.0,
    laborCost: 110400.0,
    contributionMargin: 644000.0,
    marginPerCase: 3500.0,
    marginPerOrHour: 2485.21,
    medicareAscBaseRate: 3550.0,
    commercialAvgAllowed: 7200.0,
    medicareParityPct: 202.82,
    firstPassDenialRatePct: 4.89,
    denialOverturnRatePct: 88.0,
    avgDaysToPay: 26.4,
    avgDocumentationLagDays: 1.2,
    proceduralFrictionIndex: 21.5,
    performanceTier: 'TIER_1_ANCHOR_PROFIT',
    primaryOpportunity: 'Standardize knee constructs from single vendor to capture additional $180/case rebate.',
    surgeonBreakdown: [
      {
        surgeonId: 101,
        surgeonName: 'Dr. Marcus Vance',
        caseCount: 96,
        avgSkinToSkinMinutes: 76.0,
        p80DurationMinutes: 82.0,
        avgSupplyCost: 580.0,
        avgImplantCost: 2450.0,
        avgContributionMargin: 3720.0,
        marginPerOrHour: 2936.84
      },
      {
        surgeonId: 104,
        surgeonName: 'Dr. Sarah Lin',
        caseCount: 88,
        avgSkinToSkinMinutes: 93.8,
        p80DurationMinutes: 98.0,
        avgSupplyCost: 620.0,
        avgImplantCost: 2550.0,
        avgContributionMargin: 3260.0,
        marginPerOrHour: 2085.29
      }
    ],
    payerSpread: [
      { payerCode: 'PAY-BCBS', payerName: 'Blue Cross Blue Shield', claimsCount: 78, contractRate: 7200.0, actualAvgAllowed: 7200.0, medicareParityPct: 202.82, firstPassDenialRatePct: 3.8, primaryDenialReason: 'None (Clean)' },
      { payerCode: 'PAY-UHC', payerName: 'UnitedHealthcare Commercial', claimsCount: 52, contractRate: 6850.0, actualAvgAllowed: 6600.0, medicareParityPct: 185.92, firstPassDenialRatePct: 5.7, primaryDenialReason: 'CO-197 (Pre-authorization)' },
      { payerCode: 'PAY-AET', payerName: 'Aetna Managed Care', claimsCount: 34, contractRate: 7100.0, actualAvgAllowed: 7100.0, medicareParityPct: 200.0, firstPassDenialRatePct: 2.9, primaryDenialReason: 'None (Clean)' },
      { payerCode: 'PAY-MED', payerName: 'Medicare Direct (Part B)', claimsCount: 20, contractRate: 3550.0, actualAvgAllowed: 3550.0, medicareParityPct: 100.0, firstPassDenialRatePct: 1.0, primaryDenialReason: 'None (Statutory)' }
    ]
  },
  {
    id: 'cpt-27130',
    cptCode: '27130',
    procedureName: 'Total Hip Arthroplasty (THA)',
    specialty: 'ORTHOPEDICS',
    anatomicCategory: 'Lower Extremity / Hip',
    annualCaseVolume: 120,
    avgScheduledMinutes: 100.0,
    avgActualOrMinutes: 88.0,
    p80DurationMinutes: 94.0,
    avgTurnoverMinutes: 25.0,
    totalBilledCharges: 1440000.0,
    netCollections: 936000.0,
    totalDirectCost: 492000.0,
    implantCost: 336000.0,
    supplyCost: 78000.0,
    laborCost: 78000.0,
    contributionMargin: 444000.0,
    marginPerCase: 3700.0,
    marginPerOrHour: 2522.73,
    medicareAscBaseRate: 3680.0,
    commercialAvgAllowed: 7800.0,
    medicareParityPct: 211.96,
    firstPassDenialRatePct: 5.0,
    denialOverturnRatePct: 85.0,
    avgDaysToPay: 27.2,
    avgDocumentationLagDays: 1.4,
    proceduralFrictionIndex: 22.4,
    performanceTier: 'TIER_1_ANCHOR_PROFIT',
    primaryOpportunity: 'Maintain direct anterior approach efficiency; expand block allocation on Thursdays.',
    surgeonBreakdown: [
      {
        surgeonId: 101,
        surgeonName: 'Dr. Marcus Vance',
        caseCount: 80,
        avgSkinToSkinMinutes: 82.0,
        p80DurationMinutes: 88.0,
        avgSupplyCost: 650.0,
        avgImplantCost: 2800.0,
        avgContributionMargin: 3850.0,
        marginPerOrHour: 2817.07
      },
      {
        surgeonId: 104,
        surgeonName: 'Dr. Sarah Lin',
        caseCount: 40,
        avgSkinToSkinMinutes: 100.0,
        p80DurationMinutes: 106.0,
        avgSupplyCost: 650.0,
        avgImplantCost: 2800.0,
        avgContributionMargin: 3400.0,
        marginPerOrHour: 2040.0
      }
    ],
    payerSpread: [
      { payerCode: 'PAY-BCBS', payerName: 'Blue Cross Blue Shield', claimsCount: 50, contractRate: 7800.0, actualAvgAllowed: 7800.0, medicareParityPct: 211.96, firstPassDenialRatePct: 4.0, primaryDenialReason: 'None (Clean)' },
      { payerCode: 'PAY-UHC', payerName: 'UnitedHealthcare Commercial', claimsCount: 36, contractRate: 7400.0, actualAvgAllowed: 7200.0, medicareParityPct: 195.65, firstPassDenialRatePct: 5.5, primaryDenialReason: 'CO-197 (Pre-authorization)' },
      { payerCode: 'PAY-CIG', payerName: 'Cigna Health', claimsCount: 22, contractRate: 7600.0, actualAvgAllowed: 7600.0, medicareParityPct: 206.52, firstPassDenialRatePct: 4.5, primaryDenialReason: 'None (Clean)' },
      { payerCode: 'PAY-MED', payerName: 'Medicare Direct (Part B)', claimsCount: 12, contractRate: 3680.0, actualAvgAllowed: 3680.0, medicareParityPct: 100.0, firstPassDenialRatePct: 0.0, primaryDenialReason: 'None (Statutory)' }
    ]
  },
  {
    id: 'cpt-29827',
    cptCode: '29827',
    procedureName: 'Arthroscopy, Shoulder with Rotator Cuff Repair',
    specialty: 'ORTHOPEDICS',
    anatomicCategory: 'Upper Extremity / Shoulder',
    annualCaseVolume: 165,
    avgScheduledMinutes: 80.0,
    avgActualOrMinutes: 72.0,
    p80DurationMinutes: 78.0,
    avgTurnoverMinutes: 22.0,
    totalBilledCharges: 1155000.0,
    netCollections: 684750.0,
    totalDirectCost: 379500.0,
    implantCost: 198000.0,
    supplyCost: 99000.0,
    laborCost: 82500.0,
    contributionMargin: 305250.0,
    marginPerCase: 1850.0,
    marginPerOrHour: 1541.67,
    medicareAscBaseRate: 2420.0,
    commercialAvgAllowed: 4600.0,
    medicareParityPct: 190.08,
    firstPassDenialRatePct: 14.55,
    denialOverturnRatePct: 76.0,
    avgDaysToPay: 36.8,
    avgDocumentationLagDays: 2.8,
    proceduralFrictionIndex: 48.2,
    performanceTier: 'TIER_4_HIGH_FRICTION',
    primaryOpportunity: 'Resolve high unbundling denials on co-billed 29826 (acromioplasty) with strict billing rules.',
    surgeonBreakdown: [
      {
        surgeonId: 101,
        surgeonName: 'Dr. Marcus Vance',
        caseCount: 95,
        avgSkinToSkinMinutes: 65.0,
        p80DurationMinutes: 70.0,
        avgSupplyCost: 550.0,
        avgImplantCost: 1100.0,
        avgContributionMargin: 2050.0,
        marginPerOrHour: 1892.31
      },
      {
        surgeonId: 105,
        surgeonName: 'Dr. Aaron Jacobs',
        caseCount: 70,
        avgSkinToSkinMinutes: 81.5,
        p80DurationMinutes: 90.0,
        avgSupplyCost: 650.0,
        avgImplantCost: 1350.0,
        avgContributionMargin: 1580.0,
        marginPerOrHour: 1163.19
      }
    ],
    payerSpread: [
      { payerCode: 'PAY-BCBS', payerName: 'Blue Cross Blue Shield', claimsCount: 65, contractRate: 4600.0, actualAvgAllowed: 4150.0, medicareParityPct: 171.49, firstPassDenialRatePct: 13.8, primaryDenialReason: 'CO-97 (Unbundling 29826)' },
      { payerCode: 'PAY-UHC', payerName: 'UnitedHealthcare Commercial', claimsCount: 45, contractRate: 4400.0, actualAvgAllowed: 3950.0, medicareParityPct: 163.22, firstPassDenialRatePct: 17.7, primaryDenialReason: 'CO-50 (Medical Necessity)' },
      { payerCode: 'PAY-AET', payerName: 'Aetna Managed Care', claimsCount: 35, contractRate: 4550.0, actualAvgAllowed: 4550.0, medicareParityPct: 188.02, firstPassDenialRatePct: 8.5, primaryDenialReason: 'None (Clean)' },
      { payerCode: 'PAY-MED', payerName: 'Medicare Direct (Part B)', claimsCount: 20, contractRate: 2420.0, actualAvgAllowed: 2420.0, medicareParityPct: 100.0, firstPassDenialRatePct: 5.0, primaryDenialReason: 'None (Statutory)' }
    ]
  },
  {
    id: 'cpt-29881',
    cptCode: '29881',
    procedureName: 'Arthroscopy Knee with Meniscectomy',
    specialty: 'ORTHOPEDICS',
    anatomicCategory: 'Lower Extremity / Knee',
    annualCaseVolume: 210,
    avgScheduledMinutes: 45.0,
    avgActualOrMinutes: 38.0,
    p80DurationMinutes: 42.0,
    avgTurnoverMinutes: 18.0,
    totalBilledCharges: 840000.0,
    netCollections: 504000.0,
    totalDirectCost: 210000.0,
    implantCost: 0.0,
    supplyCost: 115500.0,
    laborCost: 94500.0,
    contributionMargin: 294000.0,
    marginPerCase: 1400.0,
    marginPerOrHour: 2210.53,
    medicareAscBaseRate: 1380.0,
    commercialAvgAllowed: 2600.0,
    medicareParityPct: 188.41,
    firstPassDenialRatePct: 4.29,
    denialOverturnRatePct: 89.0,
    avgDaysToPay: 22.5,
    avgDocumentationLagDays: 1.1,
    proceduralFrictionIndex: 18.2,
    performanceTier: 'TIER_1_ANCHOR_PROFIT',
    primaryOpportunity: 'High turnover velocity; cluster cases sequentially in Room 2 on Tuesday mornings.',
    surgeonBreakdown: [
      {
        surgeonId: 101,
        surgeonName: 'Dr. Marcus Vance',
        caseCount: 120,
        avgSkinToSkinMinutes: 32.0,
        p80DurationMinutes: 36.0,
        avgSupplyCost: 500.0,
        avgImplantCost: 0.0,
        avgContributionMargin: 1520.0,
        marginPerOrHour: 2850.0
      },
      {
        surgeonId: 105,
        surgeonName: 'Dr. Aaron Jacobs',
        caseCount: 90,
        avgSkinToSkinMinutes: 46.0,
        p80DurationMinutes: 50.0,
        avgSupplyCost: 600.0,
        avgImplantCost: 0.0,
        avgContributionMargin: 1240.0,
        marginPerOrHour: 1617.39
      }
    ],
    payerSpread: [
      { payerCode: 'PAY-BCBS', payerName: 'Blue Cross Blue Shield', claimsCount: 85, contractRate: 2600.0, actualAvgAllowed: 2600.0, medicareParityPct: 188.41, firstPassDenialRatePct: 3.5, primaryDenialReason: 'None (Clean)' },
      { payerCode: 'PAY-UHC', payerName: 'UnitedHealthcare Commercial', claimsCount: 65, contractRate: 2450.0, actualAvgAllowed: 2450.0, medicareParityPct: 177.54, firstPassDenialRatePct: 4.6, primaryDenialReason: 'None (Clean)' },
      { payerCode: 'PAY-CIG', payerName: 'Cigna Health', claimsCount: 35, contractRate: 2550.0, actualAvgAllowed: 2550.0, medicareParityPct: 184.78, firstPassDenialRatePct: 2.8, primaryDenialReason: 'None (Clean)' },
      { payerCode: 'PAY-MED', payerName: 'Medicare Direct (Part B)', claimsCount: 25, contractRate: 1380.0, actualAvgAllowed: 1380.0, medicareParityPct: 100.0, firstPassDenialRatePct: 0.0, primaryDenialReason: 'None (Statutory)' }
    ]
  },
  {
    id: 'cpt-66984',
    cptCode: '66984',
    procedureName: 'Extracapsular Cataract Removal w/ IOL',
    specialty: 'OPHTHALMOLOGY',
    anatomicCategory: 'Ocular / Anterior Segment',
    annualCaseVolume: 420,
    avgScheduledMinutes: 25.0,
    avgActualOrMinutes: 18.5,
    p80DurationMinutes: 20.0,
    avgTurnoverMinutes: 12.0,
    totalBilledCharges: 1260000.0,
    netCollections: 609000.0,
    totalDirectCost: 277200.0,
    implantCost: 105000.0,
    supplyCost: 88200.0,
    laborCost: 84000.0,
    contributionMargin: 331800.0,
    marginPerCase: 790.0,
    marginPerOrHour: 2562.16,
    medicareAscBaseRate: 1120.0,
    commercialAvgAllowed: 1750.0,
    medicareParityPct: 156.25,
    firstPassDenialRatePct: 3.1,
    denialOverturnRatePct: 92.0,
    avgDaysToPay: 18.4,
    avgDocumentationLagDays: 0.8,
    proceduralFrictionIndex: 14.5,
    performanceTier: 'TIER_1_ANCHOR_PROFIT',
    primaryOpportunity: 'Top velocity anchor; optimize cassette pack bulk discounts across eye suites.',
    surgeonBreakdown: [
      {
        surgeonId: 102,
        surgeonName: 'Dr. Emily Carter',
        caseCount: 260,
        avgSkinToSkinMinutes: 16.5,
        p80DurationMinutes: 18.0,
        avgSupplyCost: 200.0,
        avgImplantCost: 250.0,
        avgContributionMargin: 820.0,
        marginPerOrHour: 2981.82
      },
      {
        surgeonId: 106,
        surgeonName: 'Dr. Robert Chen',
        caseCount: 160,
        avgSkinToSkinMinutes: 21.8,
        p80DurationMinutes: 24.0,
        avgSupplyCost: 220.0,
        avgImplantCost: 250.0,
        avgContributionMargin: 740.0,
        marginPerOrHour: 2036.7
      }
    ],
    payerSpread: [
      { payerCode: 'PAY-MED', payerName: 'Medicare Direct (Part B)', claimsCount: 220, contractRate: 1120.0, actualAvgAllowed: 1120.0, medicareParityPct: 100.0, firstPassDenialRatePct: 1.8, primaryDenialReason: 'None (Statutory)' },
      { payerCode: 'PAY-BCBS', payerName: 'Blue Cross Blue Shield', claimsCount: 110, contractRate: 1750.0, actualAvgAllowed: 1750.0, medicareParityPct: 156.25, firstPassDenialRatePct: 3.6, primaryDenialReason: 'None (Clean)' },
      { payerCode: 'PAY-UHC', payerName: 'UnitedHealthcare Commercial', claimsCount: 60, contractRate: 1680.0, actualAvgAllowed: 1680.0, medicareParityPct: 150.0, firstPassDenialRatePct: 4.2, primaryDenialReason: 'None (Clean)' },
      { payerCode: 'PAY-AET', payerName: 'Aetna Managed Care', claimsCount: 30, contractRate: 1720.0, actualAvgAllowed: 1720.0, medicareParityPct: 153.57, firstPassDenialRatePct: 3.3, primaryDenialReason: 'None (Clean)' }
    ]
  },
  {
    id: 'cpt-66982',
    cptCode: '66982',
    procedureName: 'Complex Extracapsular Cataract Removal',
    specialty: 'OPHTHALMOLOGY',
    anatomicCategory: 'Ocular / Anterior Segment',
    annualCaseVolume: 75,
    avgScheduledMinutes: 40.0,
    avgActualOrMinutes: 32.0,
    p80DurationMinutes: 36.0,
    avgTurnoverMinutes: 14.0,
    totalBilledCharges: 315000.0,
    netCollections: 168750.0,
    totalDirectCost: 67500.0,
    implantCost: 26250.0,
    supplyCost: 22500.0,
    laborCost: 18750.0,
    contributionMargin: 101250.0,
    marginPerCase: 1350.0,
    marginPerOrHour: 2531.25,
    medicareAscBaseRate: 1360.0,
    commercialAvgAllowed: 2350.0,
    medicareParityPct: 172.79,
    firstPassDenialRatePct: 8.0,
    denialOverturnRatePct: 82.0,
    avgDaysToPay: 24.5,
    avgDocumentationLagDays: 1.5,
    proceduralFrictionIndex: 24.8,
    performanceTier: 'TIER_1_ANCHOR_PROFIT',
    primaryOpportunity: 'Ensure operative reports explicitly document iris expansion device or trypan blue use.',
    surgeonBreakdown: [
      {
        surgeonId: 102,
        surgeonName: 'Dr. Emily Carter',
        caseCount: 50,
        avgSkinToSkinMinutes: 28.5,
        p80DurationMinutes: 32.0,
        avgSupplyCost: 300.0,
        avgImplantCost: 350.0,
        avgContributionMargin: 1420.0,
        marginPerOrHour: 2989.47
      },
      {
        surgeonId: 106,
        surgeonName: 'Dr. Robert Chen',
        caseCount: 25,
        avgSkinToSkinMinutes: 39.0,
        p80DurationMinutes: 44.0,
        avgSupplyCost: 350.0,
        avgImplantCost: 350.0,
        avgContributionMargin: 1210.0,
        marginPerOrHour: 1861.54
      }
    ],
    payerSpread: [
      { payerCode: 'PAY-MED', payerName: 'Medicare Direct (Part B)', claimsCount: 40, contractRate: 1360.0, actualAvgAllowed: 1360.0, medicareParityPct: 100.0, firstPassDenialRatePct: 5.0, primaryDenialReason: 'CO-50 (Complexity Medical Necessity)' },
      { payerCode: 'PAY-BCBS', payerName: 'Blue Cross Blue Shield', claimsCount: 20, contractRate: 2350.0, actualAvgAllowed: 2350.0, medicareParityPct: 172.79, firstPassDenialRatePct: 7.5, primaryDenialReason: 'CO-50 (Documentation)' },
      { payerCode: 'PAY-UHC', payerName: 'UnitedHealthcare Commercial', claimsCount: 15, contractRate: 2200.0, actualAvgAllowed: 2200.0, medicareParityPct: 161.76, firstPassDenialRatePct: 13.3, primaryDenialReason: 'CO-197 (Pre-authorization)' }
    ]
  },
  {
    id: 'cpt-45385',
    cptCode: '45385',
    procedureName: 'Colonoscopy Flexible with Polypectomy (Snare)',
    specialty: 'GASTROENTEROLOGY',
    anatomicCategory: 'Digestive / Lower GI',
    annualCaseVolume: 380,
    avgScheduledMinutes: 30.0,
    avgActualOrMinutes: 22.0,
    p80DurationMinutes: 25.0,
    avgTurnoverMinutes: 12.0,
    totalBilledCharges: 760000.0,
    netCollections: 399000.0,
    totalDirectCost: 171000.0,
    implantCost: 0.0,
    supplyCost: 95000.0,
    laborCost: 76000.0,
    contributionMargin: 228000.0,
    marginPerCase: 600.0,
    marginPerOrHour: 1636.36,
    medicareAscBaseRate: 640.0,
    commercialAvgAllowed: 1250.0,
    medicareParityPct: 195.31,
    firstPassDenialRatePct: 5.26,
    denialOverturnRatePct: 91.0,
    avgDaysToPay: 21.0,
    avgDocumentationLagDays: 0.6,
    proceduralFrictionIndex: 16.8,
    performanceTier: 'TIER_2_EFFICIENT_VOLUME',
    primaryOpportunity: 'Maximize Endoscopy Suite 1 throughput with staggered intake and rapid room turnover.',
    surgeonBreakdown: [
      {
        surgeonId: 103,
        surgeonName: 'Dr. Michael Chang',
        caseCount: 220,
        avgSkinToSkinMinutes: 19.5,
        p80DurationMinutes: 22.0,
        avgSupplyCost: 240.0,
        avgImplantCost: 0.0,
        avgContributionMargin: 640.0,
        marginPerOrHour: 1969.23
      },
      {
        surgeonId: 107,
        surgeonName: 'Dr. Elena Rostova',
        caseCount: 160,
        avgSkinToSkinMinutes: 25.5,
        p80DurationMinutes: 28.0,
        avgSupplyCost: 260.0,
        avgImplantCost: 0.0,
        avgContributionMargin: 545.0,
        marginPerOrHour: 1282.35
      }
    ],
    payerSpread: [
      { payerCode: 'PAY-BCBS', payerName: 'Blue Cross Blue Shield', claimsCount: 150, contractRate: 1250.0, actualAvgAllowed: 1250.0, medicareParityPct: 195.31, firstPassDenialRatePct: 4.0, primaryDenialReason: 'None (Clean)' },
      { payerCode: 'PAY-MED', payerName: 'Medicare Direct (Part B)', claimsCount: 130, contractRate: 640.0, actualAvgAllowed: 640.0, medicareParityPct: 100.0, firstPassDenialRatePct: 2.3, primaryDenialReason: 'None (Statutory)' },
      { payerCode: 'PAY-UHC', payerName: 'UnitedHealthcare Commercial', claimsCount: 70, contractRate: 1180.0, actualAvgAllowed: 1180.0, medicareParityPct: 184.38, firstPassDenialRatePct: 6.8, primaryDenialReason: 'CO-97 (Screening vs Diagnostic)' },
      { payerCode: 'PAY-AET', payerName: 'Aetna Managed Care', claimsCount: 30, contractRate: 1220.0, actualAvgAllowed: 1220.0, medicareParityPct: 190.63, firstPassDenialRatePct: 5.0, primaryDenialReason: 'None (Clean)' }
    ]
  },
  {
    id: 'cpt-43239',
    cptCode: '43239',
    procedureName: 'Upper GI Endoscopy (EGD) with Biopsy',
    specialty: 'GASTROENTEROLOGY',
    anatomicCategory: 'Digestive / Upper GI',
    annualCaseVolume: 290,
    avgScheduledMinutes: 25.0,
    avgActualOrMinutes: 17.0,
    p80DurationMinutes: 20.0,
    avgTurnoverMinutes: 11.0,
    totalBilledCharges: 522000.0,
    netCollections: 275500.0,
    totalDirectCost: 116000.0,
    implantCost: 0.0,
    supplyCost: 63800.0,
    laborCost: 52200.0,
    contributionMargin: 159500.0,
    marginPerCase: 550.0,
    marginPerOrHour: 1941.18,
    medicareAscBaseRate: 590.0,
    commercialAvgAllowed: 1150.0,
    medicareParityPct: 194.92,
    firstPassDenialRatePct: 4.48,
    denialOverturnRatePct: 90.0,
    avgDaysToPay: 20.5,
    avgDocumentationLagDays: 0.5,
    proceduralFrictionIndex: 15.2,
    performanceTier: 'TIER_2_EFFICIENT_VOLUME',
    primaryOpportunity: 'Pair EGD sequentially with colonoscopies (same-session endoscopy block efficiency).',
    surgeonBreakdown: [
      {
        surgeonId: 103,
        surgeonName: 'Dr. Michael Chang',
        caseCount: 170,
        avgSkinToSkinMinutes: 15.0,
        p80DurationMinutes: 18.0,
        avgSupplyCost: 210.0,
        avgImplantCost: 0.0,
        avgContributionMargin: 580.0,
        marginPerOrHour: 2320.0
      },
      {
        surgeonId: 107,
        surgeonName: 'Dr. Elena Rostova',
        caseCount: 120,
        avgSkinToSkinMinutes: 19.8,
        p80DurationMinutes: 23.0,
        avgSupplyCost: 230.0,
        avgImplantCost: 0.0,
        avgContributionMargin: 508.0,
        marginPerOrHour: 1539.39
      }
    ],
    payerSpread: [
      { payerCode: 'PAY-BCBS', payerName: 'Blue Cross Blue Shield', claimsCount: 110, contractRate: 1150.0, actualAvgAllowed: 1150.0, medicareParityPct: 194.92, firstPassDenialRatePct: 3.6, primaryDenialReason: 'None (Clean)' },
      { payerCode: 'PAY-MED', payerName: 'Medicare Direct (Part B)', claimsCount: 100, contractRate: 590.0, actualAvgAllowed: 590.0, medicareParityPct: 100.0, firstPassDenialRatePct: 2.0, primaryDenialReason: 'None (Statutory)' },
      { payerCode: 'PAY-UHC', payerName: 'UnitedHealthcare Commercial', claimsCount: 55, contractRate: 1090.0, actualAvgAllowed: 1090.0, medicareParityPct: 184.75, firstPassDenialRatePct: 7.2, primaryDenialReason: 'CO-97 (Multiple Procedure)' },
      { payerCode: 'PAY-CIG', payerName: 'Cigna Health', claimsCount: 25, contractRate: 1120.0, actualAvgAllowed: 1120.0, medicareParityPct: 189.83, firstPassDenialRatePct: 4.0, primaryDenialReason: 'None (Clean)' }
    ]
  },
  {
    id: 'cpt-31267',
    cptCode: '31267',
    procedureName: 'Nasal/Sinus Endoscopy with Maxillary Antrostomy & Tissue Removal',
    specialty: 'ENT',
    anatomicCategory: 'Respiratory / Sinus',
    annualCaseVolume: 115,
    avgScheduledMinutes: 75.0,
    avgActualOrMinutes: 68.0,
    p80DurationMinutes: 74.0,
    avgTurnoverMinutes: 22.0,
    totalBilledCharges: 632500.0,
    netCollections: 322000.0,
    totalDirectCost: 201250.0,
    implantCost: 46000.0,
    supplyCost: 80500.0,
    laborCost: 74750.0,
    contributionMargin: 120750.0,
    marginPerCase: 1050.0,
    marginPerOrHour: 926.47,
    medicareAscBaseRate: 1840.0,
    commercialAvgAllowed: 3200.0,
    medicareParityPct: 173.91,
    firstPassDenialRatePct: 11.3,
    denialOverturnRatePct: 74.0,
    avgDaysToPay: 34.0,
    avgDocumentationLagDays: 2.2,
    proceduralFrictionIndex: 41.5,
    performanceTier: 'TIER_3_MARGIN_DILUTER',
    primaryOpportunity: 'Margin diluter: sinus debrider blade and balloon catheter costs exceed case margin; negotiate device carveout.',
    surgeonBreakdown: [
      {
        surgeonId: 108,
        surgeonName: 'Dr. Jason Sterling',
        caseCount: 75,
        avgSkinToSkinMinutes: 62.0,
        p80DurationMinutes: 68.0,
        avgSupplyCost: 680.0,
        avgImplantCost: 380.0,
        avgContributionMargin: 1180.0,
        marginPerOrHour: 1141.94
      },
      {
        surgeonId: 109,
        surgeonName: 'Dr. Rebecca Hughes',
        caseCount: 40,
        avgSkinToSkinMinutes: 79.2,
        p80DurationMinutes: 85.0,
        avgSupplyCost: 740.0,
        avgImplantCost: 440.0,
        avgContributionMargin: 806.0,
        marginPerOrHour: 610.61
      }
    ],
    payerSpread: [
      { payerCode: 'PAY-BCBS', payerName: 'Blue Cross Blue Shield', claimsCount: 45, contractRate: 3200.0, actualAvgAllowed: 2850.0, medicareParityPct: 154.89, firstPassDenialRatePct: 11.1, primaryDenialReason: 'CO-50 (Medical Necessity CT Scan)' },
      { payerCode: 'PAY-UHC', payerName: 'UnitedHealthcare Commercial', claimsCount: 35, contractRate: 3100.0, actualAvgAllowed: 2750.0, medicareParityPct: 149.46, firstPassDenialRatePct: 14.3, primaryDenialReason: 'CO-197 (Pre-authorization)' },
      { payerCode: 'PAY-AET', payerName: 'Aetna Managed Care', claimsCount: 20, contractRate: 3150.0, actualAvgAllowed: 3150.0, medicareParityPct: 171.2, firstPassDenialRatePct: 5.0, primaryDenialReason: 'None (Clean)' },
      { payerCode: 'PAY-MED', payerName: 'Medicare Direct (Part B)', claimsCount: 15, contractRate: 1840.0, actualAvgAllowed: 1840.0, medicareParityPct: 100.0, firstPassDenialRatePct: 6.7, primaryDenialReason: 'CO-50 (Lack of pre-op trial)' }
    ]
  },
  {
    id: 'cpt-64483',
    cptCode: '64483',
    procedureName: 'Transforaminal Epidural Lumbar/Sacral Injection',
    specialty: 'PAIN_MANAGEMENT',
    anatomicCategory: 'Spine / Neurological',
    annualCaseVolume: 320,
    avgScheduledMinutes: 20.0,
    avgActualOrMinutes: 14.0,
    p80DurationMinutes: 16.0,
    avgTurnoverMinutes: 8.0,
    totalBilledCharges: 384000.0,
    netCollections: 204800.0,
    totalDirectCost: 83200.0,
    implantCost: 0.0,
    supplyCost: 48000.0,
    laborCost: 35200.0,
    contributionMargin: 121600.0,
    marginPerCase: 380.0,
    marginPerOrHour: 1628.57,
    medicareAscBaseRate: 380.0,
    commercialAvgAllowed: 820.0,
    medicareParityPct: 215.79,
    firstPassDenialRatePct: 6.88,
    denialOverturnRatePct: 84.0,
    avgDaysToPay: 19.8,
    avgDocumentationLagDays: 0.4,
    proceduralFrictionIndex: 18.5,
    performanceTier: 'TIER_2_EFFICIENT_VOLUME',
    primaryOpportunity: 'Maintain 4-cases/hour fluoroscopy suite throughput; monitor Medicare LCD injection frequency caps.',
    surgeonBreakdown: [
      {
        surgeonId: 110,
        surgeonName: 'Dr. David Kim',
        caseCount: 200,
        avgSkinToSkinMinutes: 12.5,
        p80DurationMinutes: 15.0,
        avgSupplyCost: 145.0,
        avgImplantCost: 0.0,
        avgContributionMargin: 405.0,
        marginPerOrHour: 1944.0
      },
      {
        surgeonId: 111,
        surgeonName: 'Dr. Lisa Morales',
        caseCount: 120,
        avgSkinToSkinMinutes: 16.5,
        p80DurationMinutes: 18.0,
        avgSupplyCost: 160.0,
        avgImplantCost: 0.0,
        avgContributionMargin: 338.0,
        marginPerOrHour: 1229.09
      }
    ],
    payerSpread: [
      { payerCode: 'PAY-BCBS', payerName: 'Blue Cross Blue Shield', claimsCount: 130, contractRate: 820.0, actualAvgAllowed: 820.0, medicareParityPct: 215.79, firstPassDenialRatePct: 5.4, primaryDenialReason: 'None (Clean)' },
      { payerCode: 'PAY-MED', payerName: 'Medicare Direct (Part B)', claimsCount: 110, contractRate: 380.0, actualAvgAllowed: 380.0, medicareParityPct: 100.0, firstPassDenialRatePct: 7.3, primaryDenialReason: 'CO-50 (Frequency Limit)' },
      { payerCode: 'PAY-UHC', payerName: 'UnitedHealthcare Commercial', claimsCount: 50, contractRate: 780.0, actualAvgAllowed: 740.0, medicareParityPct: 194.74, firstPassDenialRatePct: 9.0, primaryDenialReason: 'CO-197 (Pre-authorization)' },
      { payerCode: 'PAY-WC', payerName: 'Workers Compensation (State)', claimsCount: 30, contractRate: 880.0, actualAvgAllowed: 880.0, medicareParityPct: 231.58, firstPassDenialRatePct: 8.0, primaryDenialReason: 'CO-16 (Claim under review)' }
    ]
  }
];

export default {
  CPT_SPECIALTIES,
  CPT_PERFORMANCE_TIERS,
  CPT_BENCHMARKS,
  calculateCptContributionMargin,
  calculateCptMarginPerOrHour,
  calculateCptMedicarePercent,
  calculateCptDurationVariance,
  calculateCptDenialRate,
  calculateCptFrictionIndex,
  classifyCptTier,
  calculateFacilityCptKpis,
  SEED_CPT_INTELLIGENCE
};
