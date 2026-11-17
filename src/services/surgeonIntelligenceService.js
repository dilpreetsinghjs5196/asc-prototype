/**
 * ==============================================================================
 * Phase B0: Surgeon Intelligence Framework Service
 * Module 11: Surgeon & Clinical Intelligence
 * Description: Deterministic mathematical engine for surgeon operational, clinical,
 *              and financial intelligence, 5-pillar scoring, tier classification,
 *              and anomaly detection.
 * ==============================================================================
 */

export const PERFORMANCE_TIERS = {
  PINNACLE: {
    key: 'PINNACLE',
    label: 'Pinnacle',
    minScore: 90.0,
    color: '#059669', // Emerald
    badgeBg: 'rgba(5, 150, 105, 0.12)',
    badgeBorder: 'rgba(5, 150, 105, 0.35)',
    badgeText: '#059669',
    description: 'High-margin, highly punctual, optimal block utilization. Priority block allocations.'
  },
  CORE_PERFORMER: {
    key: 'CORE_PERFORMER',
    label: 'Core Performer',
    minScore: 75.0,
    color: '#0284c7', // Medical Blue
    badgeBg: 'rgba(2, 132, 199, 0.12)',
    badgeBorder: 'rgba(2, 132, 199, 0.35)',
    badgeText: '#0284c7',
    description: 'Consistent, dependable surgical throughput with strong operational compliance.'
  },
  OPPORTUNITY: {
    key: 'OPPORTUNITY',
    label: 'Opportunity',
    minScore: 60.0,
    color: '#d97706', // Amber
    badgeBg: 'rgba(217, 119, 6, 0.12)',
    badgeBorder: 'rgba(217, 119, 6, 0.35)',
    badgeText: '#d97706',
    description: 'High clinical quality with addressable operational bottlenecks (tardiness, cost, turnover).'
  },
  AT_RISK: {
    key: 'AT_RISK',
    label: 'At Risk',
    minScore: 0.0,
    color: '#dc2626', // Crimson
    badgeBg: 'rgba(220, 38, 38, 0.12)',
    badgeBorder: 'rgba(220, 38, 38, 0.35)',
    badgeText: '#dc2626',
    description: 'Frequent late cancellations, chronic start delays, low margin yield, or block underutilization.'
  }
};

export const SCORING_WEIGHTS = {
  FINANCIAL: 0.30,
  OPERATIONAL: 0.25,
  BLOCK: 0.20,
  QUALITY: 0.15,
  SUPPLY: 0.10
};

export const ALERT_TYPES = {
  VOLUME_CHURN_RISK: {
    key: 'VOLUME_CHURN_RISK',
    label: 'Volume Churn Risk',
    severity: 'CRITICAL',
    badgeColor: '#dc2626'
  },
  CHRONIC_START_DELAY: {
    key: 'CHRONIC_START_DELAY',
    label: 'Chronic Start Delay',
    severity: 'WARNING',
    badgeColor: '#d97706'
  },
  SUPPLY_COST_OUTLIER: {
    key: 'SUPPLY_COST_OUTLIER',
    label: 'Supply Cost Outlier',
    severity: 'WARNING',
    badgeColor: '#d97706'
  },
  BLOCK_UNDERUTILIZATION: {
    key: 'BLOCK_UNDERUTILIZATION',
    label: 'Block Underutilization',
    severity: 'CRITICAL',
    badgeColor: '#dc2626'
  },
  EXCESSIVE_TURNOVER: {
    key: 'EXCESSIVE_TURNOVER',
    label: 'Excessive Turnover Delay',
    severity: 'INFO',
    badgeColor: '#0284c7'
  }
};

/**
 * Pillar 1: Financial Margin & Economic Yield (0 to 100)
 */
export function calculateFinancialScore(metrics = {}) {
  const {
    marginPerHour = 0,
    netCollections = 0,
    billedCharges = 1,
    commercialRatio = 0.5
  } = metrics;

  // Margin per OR-hour (Target: $1,800/hr = 60 pts)
  const marginScore = Math.min(60, (marginPerHour / 1800) * 60);

  // Collections Realization Rate (Target: 70%+ = 25 pts)
  const realizationPct = billedCharges > 0 ? (netCollections / billedCharges) * 100 : 0;
  const realizationScore = Math.min(25, (realizationPct / 70) * 25);

  // Commercial Payer Mix (Target: 75%+ = 15 pts)
  const commercialScore = Math.min(15, (commercialRatio / 0.75) * 15);

  const total = marginScore + realizationScore + commercialScore;
  return Math.max(0, Math.min(100, Number(total.toFixed(2))));
}

/**
 * Pillar 2: OR Operational Efficiency & Punctuality (0 to 100)
 */
export function calculateOperationalScore(metrics = {}) {
  const {
    firstCaseOnTimePct = 85,
    durationVarianceMinutes = 0,
    avgTurnoverMinutes = 25
  } = metrics;

  // On-time start rate (Target: 85%+ = 40 pts)
  const onTimeScore = Math.min(40, (firstCaseOnTimePct / 85) * 40);

  // Duration variance against P80 (Within 10m = 35 pts, -2 pts per min over 10m)
  const excessDurationVariance = Math.max(0, Math.abs(durationVarianceMinutes) - 10);
  const durationScore = Math.max(0, 35 - excessDurationVariance * 2);

  // Turnover efficiency (Target: 25m same-surgeon = 25 pts, -1 pt per min over 25m)
  const excessTurnover = Math.max(0, avgTurnoverMinutes - 25);
  const turnoverScore = Math.max(0, 25 - excessTurnover * 1);

  const total = onTimeScore + durationScore + turnoverScore;
  return Math.max(0, Math.min(100, Number(total.toFixed(2))));
}

/**
 * Pillar 3: Block Utilization & Schedule Reliability (0 to 100)
 */
export function calculateBlockScore(metrics = {}) {
  const {
    blockUtilizationPct = 75,
    releaseNoticeHours = 72,
    addonCasesCount = 2
  } = metrics;

  // Block Utilization (Target: 75%+ = 60 pts)
  const utilScore = Math.min(60, (blockUtilizationPct / 75) * 60);

  // Release Notice Compliance (>= 72h = 25 pts, 48-71h = 18 pts, < 48h = 10 pts, < 24h = 0 pts)
  let releaseScore = 0;
  if (releaseNoticeHours >= 72) {
    releaseScore = 25;
  } else if (releaseNoticeHours >= 48) {
    releaseScore = 18;
  } else if (releaseNoticeHours >= 24) {
    releaseScore = 10;
  } else {
    releaseScore = 0;
  }

  // Add-on utilization (Short notice case uptake: 5 pts per case, max 15 pts)
  const addonScore = Math.min(15, addonCasesCount * 5);

  const total = utilScore + releaseScore + addonScore;
  return Math.max(0, Math.min(100, Number(total.toFixed(2))));
}

/**
 * Pillar 4: Clinical Quality & Schedule Integrity (0 to 100)
 */
export function calculateQualityScore(metrics = {}) {
  const {
    lateCancellationRate = 3.0,
    docCompletenessPct = 95,
    hospitalTransfersCount = 0
  } = metrics;

  // Late cancellation rate (Target <= 3% = 50 pts; >= 15% = 0 pts)
  const excessCancel = Math.max(0, lateCancellationRate - 3.0);
  const cancelScore = Math.max(0, 50 - excessCancel * 4.16);

  // Documentation completeness (Target 100% = 30 pts)
  const docScore = Math.min(30, (docCompletenessPct / 100) * 30);

  // Safety & Complication (Zero hospital transfer/admissions = 20 pts, -10 pts per incident)
  const safetyScore = Math.max(0, 20 - hospitalTransfersCount * 10);

  const total = cancelScore + docScore + safetyScore;
  return Math.max(0, Math.min(100, Number(total.toFixed(2))));
}

/**
 * Pillar 5: Supply Chain & Waste Discipline (0 to 100)
 */
export function calculateSupplyScore(metrics = {}) {
  const {
    costVariancePct = 0,
    unusedWastePct = 1.5,
    daysSincePrefCardReview = 60
  } = metrics;

  // Cost variance vs specialty peer benchmark (Within 5% = 50 pts, -2 pts per % excess)
  const excessCostVariance = Math.max(0, costVariancePct - 5);
  const costScore = Math.max(0, 50 - excessCostVariance * 2);

  // Unused sterile waste rate (Target <= 2% = 30 pts, -5 pts per % excess)
  const excessWaste = Math.max(0, unusedWastePct - 2);
  const wasteScore = Math.max(0, 30 - excessWaste * 5);

  // Preference card review currency (Reviewed within 180 days = 20 pts, else 10 pts)
  const prefCardScore = daysSincePrefCardReview <= 180 ? 20 : 10;

  const total = costScore + wasteScore + prefCardScore;
  return Math.max(0, Math.min(100, Number(total.toFixed(2))));
}

/**
 * Composite Score Calculation
 */
export function calculateCompositeScore(scores = {}) {
  const {
    financialScore = 0,
    operationalScore = 0,
    blockScore = 0,
    qualityScore = 0,
    supplyScore = 0
  } = scores;

  const composite =
    financialScore * SCORING_WEIGHTS.FINANCIAL +
    operationalScore * SCORING_WEIGHTS.OPERATIONAL +
    blockScore * SCORING_WEIGHTS.BLOCK +
    qualityScore * SCORING_WEIGHTS.QUALITY +
    supplyScore * SCORING_WEIGHTS.SUPPLY;

  return Math.max(0, Math.min(100, Number(composite.toFixed(2))));
}

/**
 * Classify Tier based on Composite Score
 */
export function classifyPerformanceTier(compositeScore) {
  if (compositeScore >= PERFORMANCE_TIERS.PINNACLE.minScore) {
    return 'PINNACLE';
  }
  if (compositeScore >= PERFORMANCE_TIERS.CORE_PERFORMER.minScore) {
    return 'CORE_PERFORMER';
  }
  if (compositeScore >= PERFORMANCE_TIERS.OPPORTUNITY.minScore) {
    return 'OPPORTUNITY';
  }
  return 'AT_RISK';
}

/**
 * Anomaly Alert Detection Engine
 */
export function detectSurgeonAlerts(surgeon = {}) {
  const alerts = [];

  // 1. Volume Churn Risk (Drop >= 20%)
  if (surgeon.volumeGrowthPct !== undefined && surgeon.volumeGrowthPct <= -20) {
    alerts.push({
      id: `alert-churn-${surgeon.id}`,
      surgeonId: surgeon.id,
      surgeonName: surgeon.name,
      alertType: 'VOLUME_CHURN_RISK',
      severity: 'CRITICAL',
      metricName: '60-Day Case Volume Growth',
      observedValue: surgeon.volumeGrowthPct,
      benchmarkThreshold: 0,
      variancePct: surgeon.volumeGrowthPct,
      message: `Case volume dropped ${Math.abs(surgeon.volumeGrowthPct)}% over rolling 60 days. Risk of volume loss to competing facilities.`,
      recommendedAction: 'Schedule executive retention review and review block scheduling availability.',
      status: 'OPEN'
    });
  }

  // 2. Chronic Start Delay (First case on-time start < 60% with >= 8 cases)
  if (surgeon.firstCaseOnTimePct < 60 && (surgeon.totalCases || 0) >= 8) {
    alerts.push({
      id: `alert-delay-${surgeon.id}`,
      surgeonId: surgeon.id,
      surgeonName: surgeon.name,
      alertType: 'CHRONIC_START_DELAY',
      severity: 'WARNING',
      metricName: 'First-Case On-Time Start Rate',
      observedValue: surgeon.firstCaseOnTimePct,
      benchmarkThreshold: 85,
      variancePct: Number(((surgeon.firstCaseOnTimePct - 85) / 85 * 100).toFixed(1)),
      message: `First-case on-time start rate is ${surgeon.firstCaseOnTimePct}%, below the 85% facility benchmark.`,
      recommendedAction: 'Coordinate with pre-op nursing and surgeon office to audit patient arrival and surgical consent lead-times.',
      status: 'OPEN'
    });
  }

  // 3. Supply Cost Outlier (Cost variance >= 20% over peer benchmark)
  if (surgeon.supplyCostVariancePct >= 20) {
    alerts.push({
      id: `alert-supply-${surgeon.id}`,
      surgeonId: surgeon.id,
      surgeonName: surgeon.name,
      alertType: 'SUPPLY_COST_OUTLIER',
      severity: 'WARNING',
      metricName: 'Supply Cost Variance vs Peer Median',
      observedValue: surgeon.supplyCostVariancePct,
      benchmarkThreshold: 5,
      variancePct: surgeon.supplyCostVariancePct,
      message: `Supply and implant costs are ${surgeon.supplyCostVariancePct}% higher than specialty peer median ($${surgeon.avgSupplyCostPerCase?.toLocaleString()} / case).`,
      recommendedAction: 'Conduct preference card audit to identify open-vs-hold items and standardize vendor constructs.',
      status: 'OPEN'
    });
  }

  // 4. Block Underutilization (Utilization < 70% with allocated block hours)
  if (surgeon.blockUtilizationPct < 70 && (surgeon.allocatedBlockHours || 0) > 0) {
    alerts.push({
      id: `alert-block-${surgeon.id}`,
      surgeonId: surgeon.id,
      surgeonName: surgeon.name,
      alertType: 'BLOCK_UNDERUTILIZATION',
      severity: 'CRITICAL',
      metricName: 'Block Schedule Utilization',
      observedValue: surgeon.blockUtilizationPct,
      benchmarkThreshold: 75,
      variancePct: Number(((surgeon.blockUtilizationPct - 75) / 75 * 100).toFixed(1)),
      message: `Block utilization is ${surgeon.blockUtilizationPct}%, failing the 75% retention threshold.`,
      recommendedAction: 'Initiate 90-day block clawback review to release underutilized block hours to the open pool.',
      status: 'OPEN'
    });
  }

  return alerts;
}

/**
 * Aggregate Facility-Wide KPI Metrics
 */
export function calculateFacilitySurgeonKpis(profiles = []) {
  if (!profiles || profiles.length === 0) {
    return {
      totalSurgeons: 0,
      avgCompositeScore: 0,
      topPerformerMargin: 0,
      atRiskCount: 0,
      avgOnTimeStartPct: 0
    };
  }

  let totalScore = 0;
  let maxMargin = 0;
  let atRiskCount = 0;
  let totalOnTime = 0;

  profiles.forEach(p => {
    totalScore += p.compositeScore || 0;
    if ((p.marginPerOrHour || 0) > maxMargin) {
      maxMargin = p.marginPerOrHour;
    }
    if (p.tier === 'AT_RISK') {
      atRiskCount += 1;
    }
    totalOnTime += p.firstCaseOnTimePct || 0;
  });

  return {
    totalSurgeons: profiles.length,
    avgCompositeScore: Number((totalScore / profiles.length).toFixed(1)),
    topPerformerMargin: Math.round(maxMargin),
    atRiskCount,
    avgOnTimeStartPct: Number((totalOnTime / profiles.length).toFixed(1))
  };
}

/**
 * Realistic Seed Profiles for Naples Surgery Center Attending Surgeons
 */
export const SEED_SURGEON_INTELLIGENCE_PROFILES = [
  {
    id: 3,
    name: 'Dr. Marcus Vance',
    specialty: 'Orthopedics',
    npi: '1982746192',
    tier: 'PINNACLE',
    compositeScore: 94.2,
    financialScore: 96.0,
    operationalScore: 92.5,
    blockScore: 95.0,
    qualityScore: 94.0,
    supplyScore: 91.0,
    totalCases: 48,
    totalOrMinutes: 4620,
    totalRevenue: 284500,
    contributionMargin: 172800,
    marginPerOrHour: 2244,
    firstCaseOnTimePct: 94,
    durationVarianceMinutes: 4,
    avgTurnoverMinutes: 22,
    blockUtilizationPct: 88,
    allocatedBlockHours: 80,
    releaseNoticeHours: 96,
    lateCancellationRate: 2.1,
    docCompletenessPct: 98,
    supplyCostVariancePct: 3.2,
    avgSupplyCostPerCase: 1820,
    volumeGrowthPct: 14.5
  },
  {
    id: 7,
    name: 'Dr. Cliff Burmiester',
    specialty: 'Orthopedics',
    npi: '1871635281',
    tier: 'PINNACLE',
    compositeScore: 91.8,
    financialScore: 94.5,
    operationalScore: 89.0,
    blockScore: 92.0,
    qualityScore: 93.0,
    supplyScore: 88.0,
    totalCases: 42,
    totalOrMinutes: 4100,
    totalRevenue: 246000,
    contributionMargin: 149200,
    marginPerOrHour: 2183,
    firstCaseOnTimePct: 88,
    durationVarianceMinutes: 6,
    avgTurnoverMinutes: 24,
    blockUtilizationPct: 85,
    allocatedBlockHours: 72,
    releaseNoticeHours: 80,
    lateCancellationRate: 2.4,
    docCompletenessPct: 96,
    supplyCostVariancePct: 4.8,
    avgSupplyCostPerCase: 1940,
    volumeGrowthPct: 8.2
  },
  {
    id: 8,
    name: 'Dr. Katie Arcos',
    specialty: 'Orthopedics',
    npi: '1760524170',
    tier: 'CORE_PERFORMER',
    compositeScore: 84.6,
    financialScore: 86.0,
    operationalScore: 83.0,
    blockScore: 85.0,
    qualityScore: 88.0,
    supplyScore: 80.0,
    totalCases: 36,
    totalOrMinutes: 3780,
    totalRevenue: 198000,
    contributionMargin: 114500,
    marginPerOrHour: 1817,
    firstCaseOnTimePct: 82,
    durationVarianceMinutes: 8,
    avgTurnoverMinutes: 27,
    blockUtilizationPct: 80,
    allocatedBlockHours: 64,
    releaseNoticeHours: 60,
    lateCancellationRate: 3.8,
    docCompletenessPct: 94,
    supplyCostVariancePct: 7.5,
    avgSupplyCostPerCase: 2150,
    volumeGrowthPct: 4.0
  },
  {
    id: 9,
    name: 'Dr. Daniela Burchhardt',
    specialty: 'Ophthalmology',
    npi: '1659413069',
    tier: 'CORE_PERFORMER',
    compositeScore: 87.4,
    financialScore: 88.5,
    operationalScore: 91.0,
    blockScore: 84.0,
    qualityScore: 90.0,
    supplyScore: 82.0,
    totalCases: 56,
    totalOrMinutes: 2800,
    totalRevenue: 168000,
    contributionMargin: 94200,
    marginPerOrHour: 2018,
    firstCaseOnTimePct: 92,
    durationVarianceMinutes: 3,
    avgTurnoverMinutes: 18,
    blockUtilizationPct: 82,
    allocatedBlockHours: 50,
    releaseNoticeHours: 72,
    lateCancellationRate: 2.8,
    docCompletenessPct: 97,
    supplyCostVariancePct: 5.2,
    avgSupplyCostPerCase: 890,
    volumeGrowthPct: 12.0
  },
  {
    id: 11,
    name: 'Dr. Mark Basile',
    specialty: 'Plastic/Cosmetic',
    npi: '1548302958',
    tier: 'CORE_PERFORMER',
    compositeScore: 78.5,
    financialScore: 82.0,
    operationalScore: 75.0,
    blockScore: 76.0,
    qualityScore: 84.0,
    supplyScore: 74.0,
    totalCases: 28,
    totalOrMinutes: 3920,
    totalRevenue: 224000,
    contributionMargin: 112000,
    marginPerOrHour: 1714,
    firstCaseOnTimePct: 74,
    durationVarianceMinutes: 14,
    avgTurnoverMinutes: 32,
    blockUtilizationPct: 76,
    allocatedBlockHours: 68,
    releaseNoticeHours: 54,
    lateCancellationRate: 4.5,
    docCompletenessPct: 91,
    supplyCostVariancePct: 11.4,
    avgSupplyCostPerCase: 2680,
    volumeGrowthPct: -2.5
  },
  {
    id: 12,
    name: 'Dr. Troy Shell Masouras',
    specialty: 'General Surgery',
    npi: '1437291847',
    tier: 'OPPORTUNITY',
    compositeScore: 71.2,
    financialScore: 73.0,
    operationalScore: 68.0,
    blockScore: 72.0,
    qualityScore: 80.0,
    supplyScore: 64.0,
    totalCases: 24,
    totalOrMinutes: 2640,
    totalRevenue: 132000,
    contributionMargin: 64800,
    marginPerOrHour: 1472,
    firstCaseOnTimePct: 68,
    durationVarianceMinutes: 16,
    avgTurnoverMinutes: 36,
    blockUtilizationPct: 71,
    allocatedBlockHours: 48,
    releaseNoticeHours: 48,
    lateCancellationRate: 5.8,
    docCompletenessPct: 88,
    supplyCostVariancePct: 16.5,
    avgSupplyCostPerCase: 1650,
    volumeGrowthPct: -6.0
  },
  {
    id: 13,
    name: 'Dr. Ben McManus',
    specialty: 'Orthopedics',
    npi: '1326180736',
    tier: 'OPPORTUNITY',
    compositeScore: 66.8,
    financialScore: 68.0,
    operationalScore: 62.0,
    blockScore: 65.0,
    qualityScore: 76.0,
    supplyScore: 62.0,
    totalCases: 20,
    totalOrMinutes: 2400,
    totalRevenue: 118000,
    contributionMargin: 52000,
    marginPerOrHour: 1300,
    firstCaseOnTimePct: 58,
    durationVarianceMinutes: 22,
    avgTurnoverMinutes: 38,
    blockUtilizationPct: 64,
    allocatedBlockHours: 44,
    releaseNoticeHours: 36,
    lateCancellationRate: 7.2,
    docCompletenessPct: 85,
    supplyCostVariancePct: 22.0, // Triggers SUPPLY_COST_OUTLIER
    avgSupplyCostPerCase: 2890,
    volumeGrowthPct: -12.0
  },
  {
    id: 14,
    name: 'Dr. Robert Klausner',
    specialty: 'Pain Management',
    npi: '1215079625',
    tier: 'CORE_PERFORMER',
    compositeScore: 82.3,
    financialScore: 84.0,
    operationalScore: 86.0,
    blockScore: 81.0,
    qualityScore: 85.0,
    supplyScore: 72.0,
    totalCases: 64,
    totalOrMinutes: 2240,
    totalRevenue: 142000,
    contributionMargin: 78400,
    marginPerOrHour: 2100,
    firstCaseOnTimePct: 89,
    durationVarianceMinutes: 5,
    avgTurnoverMinutes: 19,
    blockUtilizationPct: 81,
    allocatedBlockHours: 40,
    releaseNoticeHours: 68,
    lateCancellationRate: 3.2,
    docCompletenessPct: 93,
    supplyCostVariancePct: 6.8,
    avgSupplyCostPerCase: 450,
    volumeGrowthPct: 7.5
  },
  {
    id: 15,
    name: 'Dr. Aaron Jacobs',
    specialty: 'Orthopedics',
    npi: '1104968514',
    tier: 'AT_RISK',
    compositeScore: 54.2,
    financialScore: 56.0,
    operationalScore: 51.0,
    blockScore: 50.0,
    qualityScore: 62.0,
    supplyScore: 52.0,
    totalCases: 14,
    totalOrMinutes: 1960,
    totalRevenue: 78000,
    contributionMargin: 29400,
    marginPerOrHour: 900,
    firstCaseOnTimePct: 52, // Triggers CHRONIC_START_DELAY
    durationVarianceMinutes: 26,
    avgTurnoverMinutes: 44,
    blockUtilizationPct: 58, // Triggers BLOCK_UNDERUTILIZATION
    allocatedBlockHours: 40,
    releaseNoticeHours: 20,
    lateCancellationRate: 11.5,
    docCompletenessPct: 78,
    supplyCostVariancePct: 24.5, // Triggers SUPPLY_COST_OUTLIER
    avgSupplyCostPerCase: 3120,
    volumeGrowthPct: -26.0 // Triggers VOLUME_CHURN_RISK
  }
];

export default {
  PERFORMANCE_TIERS,
  SCORING_WEIGHTS,
  ALERT_TYPES,
  calculateFinancialScore,
  calculateOperationalScore,
  calculateBlockScore,
  calculateQualityScore,
  calculateSupplyScore,
  calculateCompositeScore,
  classifyPerformanceTier,
  detectSurgeonAlerts,
  calculateFacilitySurgeonKpis,
  SEED_SURGEON_INTELLIGENCE_PROFILES
};
