/**
 * ==============================================================================
 * Phase B6: CPT Economics Service
 * Module 11: Surgeon & Clinical Intelligence / Executive Intelligence
 * Description: Deterministic procedural micro-economic modeling: activity-based
 *              cost decomposition, direct contribution margins, suite hourly
 *              productivity yields, fully loaded net operating income, and
 *              breakeven case volume absorption.
 * ==============================================================================
 */

export const ECONOMIC_QUADRANTS = {
  PRIME_YIELD_ANCHOR: {
    key: 'PRIME_YIELD_ANCHOR',
    label: 'Prime Yield Anchor',
    description: 'High margin per OR-hour (≥ $2,200/hr) with robust contribution margin (≥ 50%)',
    color: '#059669',
    badgeBg: 'rgba(5, 150, 105, 0.12)',
    badgeBorder: 'rgba(5, 150, 105, 0.35)'
  },
  VOLUME_PROFIT_BUILDER: {
    key: 'VOLUME_PROFIT_BUILDER',
    label: 'Volume Profit Builder',
    description: 'Steady, dependable high-velocity cases ($1,400 - $2,199/hr) with rapid turnover',
    color: '#0284c7',
    badgeBg: 'rgba(2, 132, 199, 0.12)',
    badgeBorder: 'rgba(2, 132, 199, 0.35)'
  },
  MARGIN_SQUEEZE_AT_RISK: {
    key: 'MARGIN_SQUEEZE_AT_RISK',
    label: 'Margin Squeeze / At-Risk',
    description: 'High top-line revenue but razor-thin margin (< 30%) due to heavy implant or labor cost',
    color: '#d97706',
    badgeBg: 'rgba(217, 119, 6, 0.12)',
    badgeBorder: 'rgba(217, 119, 6, 0.35)'
  },
  ECONOMIC_DEFICIT: {
    key: 'ECONOMIC_DEFICIT',
    label: 'Economic Deficit / Sub-Overhead',
    description: 'Fails to cover fully loaded overhead (< $800/hr) or generates negative operating income',
    color: '#dc2626',
    badgeBg: 'rgba(220, 38, 38, 0.12)',
    badgeBorder: 'rgba(220, 38, 38, 0.35)'
  }
};

export const ECONOMIC_BENCHMARKS = {
  TARGET_MARGIN_PER_OR_HOUR: 2000.0,
  MIN_CONTRIBUTION_MARGIN_PCT: 45.0,
  MIN_COLLECTION_REALIZATION_PCT: 60.0,
  FACILITY_HOURLY_OVERHEAD_BENCHMARK: 450.0
};

/**
 * Calculate Procedural Gross Margin ($)
 * Net Collections less Material Goods (Implants + Sterile Supplies)
 */
export function calculateGrossMargin(netCollections = 0, implantCost = 0, supplyCost = 0) {
  const margin = (netCollections || 0) - ((implantCost || 0) + (supplyCost || 0));
  return Number(margin.toFixed(2));
}

/**
 * Calculate Direct Contribution Margin ($)
 * Net Collections less Total Direct Variable Cost (Implants, Supplies, Labor, Anesthesia/Meds)
 */
export function calculateDirectContributionMargin(netCollections = 0, totalDirectCost = 0) {
  const margin = (netCollections || 0) - (totalDirectCost || 0);
  return Number(margin.toFixed(2));
}

/**
 * Calculate Direct Contribution Margin Percentage (%)
 */
export function calculateDirectContributionMarginPct(contributionMargin = 0, netCollections = 0) {
  if (!netCollections || netCollections <= 0) return 0.0;
  const pct = (contributionMargin / netCollections) * 100;
  return Number(pct.toFixed(2));
}

/**
 * Calculate Fully Loaded Net Margin ($)
 * Net Collections less Total Loaded Cost (Direct Costs + Allocated Fixed Overhead)
 */
export function calculateFullyLoadedNetMargin(netCollections = 0, totalLoadedCost = 0) {
  const net = (netCollections || 0) - (totalLoadedCost || 0);
  return Number(net.toFixed(2));
}

/**
 * Calculate Margin Per OR-Minute ($/min)
 */
export function calculateMarginPerOrMinute(contributionMargin = 0, actualOrMinutes = 0) {
  if (!actualOrMinutes || actualOrMinutes <= 0) return 0.0;
  const rate = contributionMargin / actualOrMinutes;
  return Number(rate.toFixed(2));
}

/**
 * Calculate Margin Per OR-Hour ($/hr)
 */
export function calculateMarginPerOrHour(contributionMargin = 0, actualOrMinutes = 0) {
  if (!actualOrMinutes || actualOrMinutes <= 0) return 0.0;
  const yieldPerHour = (contributionMargin / actualOrMinutes) * 60;
  return Number(yieldPerHour.toFixed(2));
}

/**
 * Calculate Fully Loaded Margin Per OR-Hour ($/hr)
 */
export function calculateFullyLoadedMarginPerOrHour(fullyLoadedNetMargin = 0, actualOrMinutes = 0) {
  if (!actualOrMinutes || actualOrMinutes <= 0) return 0.0;
  const yieldPerHour = (fullyLoadedNetMargin / actualOrMinutes) * 60;
  return Number(yieldPerHour.toFixed(2));
}

/**
 * Calculate Breakeven Case Volume (cases/year)
 * Cases required to absorb allocated annual fixed overhead
 */
export function calculateBreakevenCases(allocatedAnnualOverhead = 0, contributionMarginPerCase = 0) {
  if (!contributionMarginPerCase || contributionMarginPerCase <= 0) return 0;
  const cases = Math.ceil(allocatedAnnualOverhead / contributionMarginPerCase);
  return Math.max(0, cases);
}

/**
 * Calculate Suite Block Opportunity Cost ($)
 * Yield deficit relative to prime facility hourly benchmark
 */
export function calculateBlockOpportunityCost(
  benchmarkHourlyYield = 2000.0,
  marginPerHour = 0,
  actualOrMinutes = 0
) {
  if (!actualOrMinutes || actualOrMinutes <= 0) return 0.0;
  const deficitPerHour = Math.max(0, benchmarkHourlyYield - marginPerHour);
  const cost = deficitPerHour * (actualOrMinutes / 60);
  return Number(cost.toFixed(2));
}

/**
 * Classify Economic Quadrant
 */
export function classifyEconomicQuadrant(
  marginPerOrHour = 0,
  contributionMarginPct = 0,
  netMarginPct = 0
) {
  if (marginPerOrHour < 800.0 || netMarginPct < 0) {
    return 'ECONOMIC_DEFICIT';
  }
  if (contributionMarginPct < 30.0 || (marginPerOrHour < 1400.0 && marginPerOrHour >= 800.0)) {
    return 'MARGIN_SQUEEZE_AT_RISK';
  }
  if (marginPerOrHour >= 2200.0 && (contributionMarginPct >= 40.0 || netMarginPct >= 35.0)) {
    return 'PRIME_YIELD_ANCHOR';
  }
  return 'VOLUME_PROFIT_BUILDER';
}

/**
 * Aggregate Facility-Wide CPT Economics KPIs
 */
export function calculateFacilityEconomicsKpis(cptEconomicsList = []) {
  if (!cptEconomicsList || cptEconomicsList.length === 0) {
    return {
      totalEvaluatedProcedures: 0,
      totalAnnualVolume: 0,
      totalNetCollections: 0,
      totalDirectCosts: 0,
      totalContributionMargin: 0,
      portfolioContributionMarginPct: 0.0,
      avgMarginPerOrHour: 0.0,
      portfolioFullyLoadedMarginPct: 0.0,
      primeYieldAnchorCount: 0,
      economicDeficitCount: 0
    };
  }

  let totalVol = 0;
  let totalNet = 0;
  let totalDirect = 0;
  let totalMargin = 0;
  let totalLoaded = 0;
  let totalMarginPerHourSum = 0;
  let primeCount = 0;
  let deficitCount = 0;

  cptEconomicsList.forEach(cpt => {
    const vol = cpt.annualCaseVolume || 0;
    const net = (cpt.avgNetCollections || 0) * vol;
    const direct = (cpt.totalDirectCostPerCase || 0) * vol;
    const margin = (cpt.contributionMarginPerCase || 0) * vol;
    const loaded = (cpt.totalLoadedCostPerCase || 0) * vol;

    totalVol += vol;
    totalNet += net;
    totalDirect += direct;
    totalMargin += margin;
    totalLoaded += loaded;
    totalMarginPerHourSum += cpt.marginPerOrHour || 0;

    if (cpt.economicQuadrant === 'PRIME_YIELD_ANCHOR') {
      primeCount += 1;
    }
    if (cpt.economicQuadrant === 'ECONOMIC_DEFICIT') {
      deficitCount += 1;
    }
  });

  const count = cptEconomicsList.length;
  const portfolioContributionMarginPct = totalNet > 0 ? Number(((totalMargin / totalNet) * 100).toFixed(2)) : 0.0;
  const portfolioFullyLoadedMarginPct = totalNet > 0 ? Number((((totalNet - totalLoaded) / totalNet) * 100).toFixed(2)) : 0.0;
  const avgMarginPerOrHour = Number((totalMarginPerHourSum / count).toFixed(2));

  return {
    totalEvaluatedProcedures: count,
    totalAnnualVolume: totalVol,
    totalNetCollections: Math.round(totalNet),
    totalDirectCosts: Math.round(totalDirect),
    totalContributionMargin: Math.round(totalMargin),
    portfolioContributionMarginPct,
    avgMarginPerOrHour,
    portfolioFullyLoadedMarginPct,
    primeYieldAnchorCount: primeCount,
    economicDeficitCount: deficitCount
  };
}

/**
 * Deterministic Seed Dataset: 10 Core Surgical Procedures with Complete Cost Accounting
 */
export const SEED_CPT_ECONOMICS = [
  {
    id: 'cpt-econ-27447',
    cptCode: '27447',
    procedureName: 'Total Knee Arthroplasty (TKA)',
    specialty: 'Orthopedics',
    annualCaseVolume: 184,
    avgOperativeMinutes: 84.5,
    avgBilledCharges: 10760.87,
    avgNetCollections: 7200.0,
    collectionRealizationPct: 66.91,
    implantCostPerCase: 2500.0,
    sterileSupplyCostPerCase: 600.0,
    laborCostPerCase: 600.0,
    anesthesiaMedsCostPerCase: 200.0,
    totalDirectCostPerCase: 3900.0,
    allocatedOverheadPerCase: 633.75, // $450/hr * (84.5 / 60)
    totalLoadedCostPerCase: 4533.75,
    contributionMarginPerCase: 3300.0,
    contributionMarginPct: 45.83,
    netMarginPerCase: 2666.25,
    netMarginPct: 37.03,
    marginPerOrMinute: 39.05,
    marginPerOrHour: 2343.2,
    loadedMarginPerOrHour: 1893.2,
    breakevenAnnualCases: 36, // $116,610 allocated annual fixed overhead / $3,300
    opportunityCostPerCase: 0.0,
    economicQuadrant: 'PRIME_YIELD_ANCHOR',
    primaryEconomicLever: 'Standardize knee constructs from single vendor to capture additional $180/case rebate.',
    costComponents: [
      { category: 'Implants & Prosthetics', amount: 2500.0, pctOfTotal: 55.14, isVariable: true, vendor: 'Stryker Orthopaedics' },
      { category: 'Sterile Processing & Packs', amount: 600.0, pctOfTotal: 13.24, isVariable: true, vendor: 'Medline Custom Trays' },
      { category: 'Time-Driven Clinical Labor', amount: 600.0, pctOfTotal: 13.24, isVariable: true, vendor: 'ASC In-House Nursing' },
      { category: 'Facility Allocated Overhead', amount: 633.75, pctOfTotal: 13.98, isVariable: false, vendor: 'Facility Fixed Lease & SPD' },
      { category: 'Anesthesia Drugs & Sedation', amount: 200.0, pctOfTotal: 4.41, isVariable: true, vendor: 'AmerisourceBergen' }
    ],
    payerYields: [
      { payerCode: 'PAY-BCBS', payerName: 'Blue Cross Blue Shield', casesCount: 78, avgAllowedAmount: 7200.0, avgNetCollections: 7200.0, contributionMarginPerCase: 3300.0, marginPerOrHour: 2343.2 },
      { payerCode: 'PAY-UHC', payerName: 'UnitedHealthcare Commercial', casesCount: 52, avgAllowedAmount: 6600.0, avgNetCollections: 6600.0, contributionMarginPerCase: 2700.0, marginPerOrHour: 1917.16 },
      { payerCode: 'PAY-AET', payerName: 'Aetna Managed Care', casesCount: 34, avgAllowedAmount: 7100.0, avgNetCollections: 7100.0, contributionMarginPerCase: 3200.0, marginPerOrHour: 2272.19 },
      { payerCode: 'PAY-MED', payerName: 'Medicare Direct (Part B)', casesCount: 20, avgAllowedAmount: 3550.0, avgNetCollections: 3550.0, contributionMarginPerCase: -350.0, marginPerOrHour: -248.52 }
    ]
  },
  {
    id: 'cpt-econ-27130',
    cptCode: '27130',
    procedureName: 'Total Hip Arthroplasty (THA)',
    specialty: 'Orthopedics',
    annualCaseVolume: 120,
    avgOperativeMinutes: 88.0,
    avgBilledCharges: 12000.0,
    avgNetCollections: 7800.0,
    collectionRealizationPct: 65.0,
    implantCostPerCase: 2800.0,
    sterileSupplyCostPerCase: 650.0,
    laborCostPerCase: 650.0,
    anesthesiaMedsCostPerCase: 200.0,
    totalDirectCostPerCase: 4300.0,
    allocatedOverheadPerCase: 660.0, // $450/hr * (88.0 / 60)
    totalLoadedCostPerCase: 4960.0,
    contributionMarginPerCase: 3500.0,
    contributionMarginPct: 44.87,
    netMarginPerCase: 2840.0,
    netMarginPct: 36.41,
    marginPerOrMinute: 39.77,
    marginPerOrHour: 2386.36,
    loadedMarginPerOrHour: 1936.36,
    breakevenAnnualCases: 23,
    opportunityCostPerCase: 0.0,
    economicQuadrant: 'PRIME_YIELD_ANCHOR',
    primaryEconomicLever: 'Maintain direct anterior approach efficiency; expand block allocation on Thursdays.',
    costComponents: [
      { category: 'Implants & Prosthetics', amount: 2800.0, pctOfTotal: 56.45, isVariable: true, vendor: 'DePuy Synthes' },
      { category: 'Sterile Processing & Packs', amount: 650.0, pctOfTotal: 13.1, isVariable: true, vendor: 'Medline Custom Trays' },
      { category: 'Time-Driven Clinical Labor', amount: 650.0, pctOfTotal: 13.1, isVariable: true, vendor: 'ASC In-House Nursing' },
      { category: 'Facility Allocated Overhead', amount: 660.0, pctOfTotal: 13.31, isVariable: false, vendor: 'Facility Fixed Lease & SPD' },
      { category: 'Anesthesia Drugs & Sedation', amount: 200.0, pctOfTotal: 4.03, isVariable: true, vendor: 'AmerisourceBergen' }
    ],
    payerYields: [
      { payerCode: 'PAY-BCBS', payerName: 'Blue Cross Blue Shield', casesCount: 50, avgAllowedAmount: 7800.0, avgNetCollections: 7800.0, contributionMarginPerCase: 3500.0, marginPerOrHour: 2386.36 },
      { payerCode: 'PAY-UHC', payerName: 'UnitedHealthcare Commercial', casesCount: 36, avgAllowedAmount: 7200.0, avgNetCollections: 7200.0, contributionMarginPerCase: 2900.0, marginPerOrHour: 1977.27 },
      { payerCode: 'PAY-CIG', payerName: 'Cigna Health', casesCount: 22, avgAllowedAmount: 7600.0, avgNetCollections: 7600.0, contributionMarginPerCase: 3300.0, marginPerOrHour: 2250.0 },
      { payerCode: 'PAY-MED', payerName: 'Medicare Direct (Part B)', casesCount: 12, avgAllowedAmount: 3680.0, avgNetCollections: 3680.0, contributionMarginPerCase: -620.0, marginPerOrHour: -422.73 }
    ]
  },
  {
    id: 'cpt-econ-29827',
    cptCode: '29827',
    procedureName: 'Arthroscopy, Rotator Cuff Repair',
    specialty: 'Orthopedics',
    annualCaseVolume: 165,
    avgOperativeMinutes: 72.0,
    avgBilledCharges: 7000.0,
    avgNetCollections: 4150.0,
    collectionRealizationPct: 59.29,
    implantCostPerCase: 1200.0,
    sterileSupplyCostPerCase: 600.0,
    laborCostPerCase: 500.0,
    anesthesiaMedsCostPerCase: 150.0,
    totalDirectCostPerCase: 2450.0,
    allocatedOverheadPerCase: 540.0, // $450/hr * (72.0 / 60)
    totalLoadedCostPerCase: 2990.0,
    contributionMarginPerCase: 1700.0,
    contributionMarginPct: 40.96,
    netMarginPerCase: 1160.0,
    netMarginPct: 27.95,
    marginPerOrMinute: 23.61,
    marginPerOrHour: 1416.67,
    loadedMarginPerOrHour: 966.67,
    breakevenAnnualCases: 53,
    opportunityCostPerCase: 700.0,
    economicQuadrant: 'MARGIN_SQUEEZE_AT_RISK',
    primaryEconomicLever: 'Cap suture anchor construct spend to 2 anchors per case unless massive tear documented.',
    costComponents: [
      { category: 'Implants & Suture Anchors', amount: 1200.0, pctOfTotal: 40.13, isVariable: true, vendor: 'Arthrex SutureBridge' },
      { category: 'Sterile Processing & Packs', amount: 600.0, pctOfTotal: 20.07, isVariable: true, vendor: 'Medline Custom Trays' },
      { category: 'Time-Driven Clinical Labor', amount: 500.0, pctOfTotal: 16.72, isVariable: true, vendor: 'ASC In-House Nursing' },
      { category: 'Facility Allocated Overhead', amount: 540.0, pctOfTotal: 18.06, isVariable: false, vendor: 'Facility Fixed Lease & SPD' },
      { category: 'Anesthesia Drugs & Sedation', amount: 150.0, pctOfTotal: 5.02, isVariable: true, vendor: 'AmerisourceBergen' }
    ],
    payerYields: [
      { payerCode: 'PAY-BCBS', payerName: 'Blue Cross Blue Shield', casesCount: 65, avgAllowedAmount: 4150.0, avgNetCollections: 4150.0, contributionMarginPerCase: 1700.0, marginPerOrHour: 1416.67 },
      { payerCode: 'PAY-UHC', payerName: 'UnitedHealthcare Commercial', casesCount: 45, avgAllowedAmount: 3950.0, avgNetCollections: 3950.0, contributionMarginPerCase: 1500.0, marginPerOrHour: 1250.0 },
      { payerCode: 'PAY-AET', payerName: 'Aetna Managed Care', casesCount: 35, avgAllowedAmount: 4550.0, avgNetCollections: 4550.0, contributionMarginPerCase: 2100.0, marginPerOrHour: 1750.0 },
      { payerCode: 'PAY-MED', payerName: 'Medicare Direct (Part B)', casesCount: 20, avgAllowedAmount: 2420.0, avgNetCollections: 2420.0, contributionMarginPerCase: -30.0, marginPerOrHour: -25.0 }
    ]
  },
  {
    id: 'cpt-econ-29881',
    cptCode: '29881',
    procedureName: 'Knee Arthroscopy w/ Meniscectomy',
    specialty: 'Orthopedics',
    annualCaseVolume: 210,
    avgOperativeMinutes: 38.0,
    avgBilledCharges: 4000.0,
    avgNetCollections: 2400.0,
    collectionRealizationPct: 60.0,
    implantCostPerCase: 0.0,
    sterileSupplyCostPerCase: 550.0,
    laborCostPerCase: 450.0,
    anesthesiaMedsCostPerCase: 100.0,
    totalDirectCostPerCase: 1100.0,
    allocatedOverheadPerCase: 285.0, // $450/hr * (38.0 / 60)
    totalLoadedCostPerCase: 1385.0,
    contributionMarginPerCase: 1300.0,
    contributionMarginPct: 54.17,
    netMarginPerCase: 1015.0,
    netMarginPct: 42.29,
    marginPerOrMinute: 34.21,
    marginPerOrHour: 2052.63,
    loadedMarginPerOrHour: 1602.63,
    breakevenAnnualCases: 46,
    opportunityCostPerCase: 0.0,
    economicQuadrant: 'VOLUME_PROFIT_BUILDER',
    primaryEconomicLever: 'High turnover velocity; cluster cases sequentially in Room 2 on Tuesday mornings.',
    costComponents: [
      { category: 'Sterile Processing & Packs', amount: 550.0, pctOfTotal: 39.71, isVariable: true, vendor: 'Medline Custom Trays' },
      { category: 'Time-Driven Clinical Labor', amount: 450.0, pctOfTotal: 32.49, isVariable: true, vendor: 'ASC In-House Nursing' },
      { category: 'Facility Allocated Overhead', amount: 285.0, pctOfTotal: 20.58, isVariable: false, vendor: 'Facility Fixed Lease & SPD' },
      { category: 'Anesthesia Drugs & Sedation', amount: 100.0, pctOfTotal: 7.22, isVariable: true, vendor: 'AmerisourceBergen' }
    ],
    payerYields: [
      { payerCode: 'PAY-BCBS', payerName: 'Blue Cross Blue Shield', casesCount: 85, avgAllowedAmount: 2600.0, avgNetCollections: 2600.0, contributionMarginPerCase: 1500.0, marginPerOrHour: 2368.42 },
      { payerCode: 'PAY-UHC', payerName: 'UnitedHealthcare Commercial', casesCount: 65, avgAllowedAmount: 2450.0, avgNetCollections: 2450.0, contributionMarginPerCase: 1350.0, marginPerOrHour: 2131.58 },
      { payerCode: 'PAY-CIG', payerName: 'Cigna Health', casesCount: 35, avgAllowedAmount: 2550.0, avgNetCollections: 2550.0, contributionMarginPerCase: 1450.0, marginPerOrHour: 2289.47 },
      { payerCode: 'PAY-MED', payerName: 'Medicare Direct (Part B)', casesCount: 25, avgAllowedAmount: 1380.0, avgNetCollections: 1380.0, contributionMarginPerCase: 280.0, marginPerOrHour: 442.11 }
    ]
  },
  {
    id: 'cpt-econ-66984',
    cptCode: '66984',
    procedureName: 'Cataract Removal with IOL',
    specialty: 'Ophthalmology',
    annualCaseVolume: 420,
    avgOperativeMinutes: 18.5,
    avgBilledCharges: 3000.0,
    avgNetCollections: 1450.0,
    collectionRealizationPct: 48.33,
    implantCostPerCase: 250.0,
    sterileSupplyCostPerCase: 210.0,
    laborCostPerCase: 200.0,
    anesthesiaMedsCostPerCase: 50.0,
    totalDirectCostPerCase: 710.0,
    allocatedOverheadPerCase: 138.75, // $450/hr * (18.5 / 60)
    totalLoadedCostPerCase: 848.75,
    contributionMarginPerCase: 740.0,
    contributionMarginPct: 51.03,
    netMarginPerCase: 601.25,
    netMarginPct: 41.47,
    marginPerOrMinute: 40.0,
    marginPerOrHour: 2400.0,
    loadedMarginPerOrHour: 1950.0,
    breakevenAnnualCases: 79,
    opportunityCostPerCase: 0.0,
    economicQuadrant: 'PRIME_YIELD_ANCHOR',
    primaryEconomicLever: 'Top velocity anchor; optimize cassette pack bulk discounts across eye suites.',
    costComponents: [
      { category: 'Intraocular Lenses (IOL)', amount: 250.0, pctOfTotal: 29.46, isVariable: true, vendor: 'Alcon AcrySof' },
      { category: 'Sterile Processing & Packs', amount: 210.0, pctOfTotal: 24.74, isVariable: true, vendor: 'Bausch + Lomb Packs' },
      { category: 'Time-Driven Clinical Labor', amount: 200.0, pctOfTotal: 23.56, isVariable: true, vendor: 'ASC In-House Nursing' },
      { category: 'Facility Allocated Overhead', amount: 138.75, pctOfTotal: 16.35, isVariable: false, vendor: 'Facility Fixed Lease & SPD' },
      { category: 'Anesthesia Drugs & Sedation', amount: 50.0, pctOfTotal: 5.89, isVariable: true, vendor: 'AmerisourceBergen' }
    ],
    payerYields: [
      { payerCode: 'PAY-MED', payerName: 'Medicare Direct (Part B)', casesCount: 220, avgAllowedAmount: 1120.0, avgNetCollections: 1120.0, contributionMarginPerCase: 410.0, marginPerOrHour: 1329.73 },
      { payerCode: 'PAY-BCBS', payerName: 'Blue Cross Blue Shield', casesCount: 110, avgAllowedAmount: 1750.0, avgNetCollections: 1750.0, contributionMarginPerCase: 1040.0, marginPerOrHour: 3372.97 },
      { payerCode: 'PAY-UHC', payerName: 'UnitedHealthcare Commercial', casesCount: 60, avgAllowedAmount: 1680.0, avgNetCollections: 1680.0, contributionMarginPerCase: 970.0, marginPerOrHour: 3145.95 },
      { payerCode: 'PAY-AET', payerName: 'Aetna Managed Care', casesCount: 30, avgAllowedAmount: 1720.0, avgNetCollections: 1720.0, contributionMarginPerCase: 1010.0, marginPerOrHour: 3275.68 }
    ]
  },
  {
    id: 'cpt-econ-66982',
    cptCode: '66982',
    procedureName: 'Complex Cataract Removal w/ IOL',
    specialty: 'Ophthalmology',
    annualCaseVolume: 75,
    avgOperativeMinutes: 32.0,
    avgBilledCharges: 4200.0,
    avgNetCollections: 2250.0,
    collectionRealizationPct: 53.57,
    implantCostPerCase: 350.0,
    sterileSupplyCostPerCase: 300.0,
    laborCostPerCase: 250.0,
    anesthesiaMedsCostPerCase: 75.0,
    totalDirectCostPerCase: 975.0,
    allocatedOverheadPerCase: 240.0, // $450/hr * (32.0 / 60)
    totalLoadedCostPerCase: 1215.0,
    contributionMarginPerCase: 1275.0,
    contributionMarginPct: 56.67,
    netMarginPerCase: 1035.0,
    netMarginPct: 46.0,
    marginPerOrMinute: 39.84,
    marginPerOrHour: 2390.63,
    loadedMarginPerOrHour: 1940.63,
    breakevenAnnualCases: 14,
    opportunityCostPerCase: 0.0,
    economicQuadrant: 'PRIME_YIELD_ANCHOR',
    primaryEconomicLever: 'Ensure operative reports explicitly document iris expansion device or trypan blue use.',
    costComponents: [
      { category: 'Intraocular Lenses & Devices', amount: 350.0, pctOfTotal: 28.81, isVariable: true, vendor: 'Alcon / Malyugin Ring' },
      { category: 'Sterile Processing & Packs', amount: 300.0, pctOfTotal: 24.69, isVariable: true, vendor: 'Bausch + Lomb Packs' },
      { category: 'Time-Driven Clinical Labor', amount: 250.0, pctOfTotal: 20.58, isVariable: true, vendor: 'ASC In-House Nursing' },
      { category: 'Facility Allocated Overhead', amount: 240.0, pctOfTotal: 19.75, isVariable: false, vendor: 'Facility Fixed Lease & SPD' },
      { category: 'Anesthesia Drugs & Sedation', amount: 75.0, pctOfTotal: 6.17, isVariable: true, vendor: 'AmerisourceBergen' }
    ],
    payerYields: [
      { payerCode: 'PAY-MED', payerName: 'Medicare Direct (Part B)', casesCount: 40, avgAllowedAmount: 1360.0, avgNetCollections: 1360.0, contributionMarginPerCase: 385.0, marginPerOrHour: 721.88 },
      { payerCode: 'PAY-BCBS', payerName: 'Blue Cross Blue Shield', casesCount: 20, avgAllowedAmount: 2350.0, avgNetCollections: 2350.0, contributionMarginPerCase: 1375.0, marginPerOrHour: 2578.13 },
      { payerCode: 'PAY-UHC', payerName: 'UnitedHealthcare Commercial', casesCount: 15, avgAllowedAmount: 2200.0, avgNetCollections: 2200.0, contributionMarginPerCase: 1225.0, marginPerOrHour: 2296.88 }
    ]
  },
  {
    id: 'cpt-econ-45385',
    cptCode: '45385',
    procedureName: 'Colonoscopy Flexible w/ Polypectomy',
    specialty: 'Gastroenterology',
    annualCaseVolume: 380,
    avgOperativeMinutes: 22.0,
    avgBilledCharges: 2000.0,
    avgNetCollections: 1050.0,
    collectionRealizationPct: 52.5,
    implantCostPerCase: 0.0,
    sterileSupplyCostPerCase: 250.0,
    laborCostPerCase: 200.0,
    anesthesiaMedsCostPerCase: 80.0,
    totalDirectCostPerCase: 530.0,
    allocatedOverheadPerCase: 165.0, // $450/hr * (22.0 / 60)
    totalLoadedCostPerCase: 695.0,
    contributionMarginPerCase: 520.0,
    contributionMarginPct: 49.52,
    netMarginPerCase: 355.0,
    netMarginPct: 33.81,
    marginPerOrMinute: 23.64,
    marginPerOrHour: 1418.18,
    loadedMarginPerOrHour: 968.18,
    breakevenAnnualCases: 121,
    opportunityCostPerCase: 213.33,
    economicQuadrant: 'VOLUME_PROFIT_BUILDER',
    primaryEconomicLever: 'Maximize Endoscopy Suite 1 throughput with staggered intake and rapid room turnover.',
    costComponents: [
      { category: 'Sterile Processing & Snares', amount: 250.0, pctOfTotal: 35.97, isVariable: true, vendor: 'Boston Scientific' },
      { category: 'Time-Driven Clinical Labor', amount: 200.0, pctOfTotal: 28.78, isVariable: true, vendor: 'ASC In-House Nursing' },
      { category: 'Facility Allocated Overhead', amount: 165.0, pctOfTotal: 23.74, isVariable: false, vendor: 'Facility Fixed Lease & SPD' },
      { category: 'Anesthesia Drugs & Sedation', amount: 80.0, pctOfTotal: 11.51, isVariable: true, vendor: 'AmerisourceBergen' }
    ],
    payerYields: [
      { payerCode: 'PAY-BCBS', payerName: 'Blue Cross Blue Shield', casesCount: 150, avgAllowedAmount: 1250.0, avgNetCollections: 1250.0, contributionMarginPerCase: 720.0, marginPerOrHour: 1963.64 },
      { payerCode: 'PAY-MED', payerName: 'Medicare Direct (Part B)', casesCount: 130, avgAllowedAmount: 640.0, avgNetCollections: 640.0, contributionMarginPerCase: 110.0, marginPerOrHour: 300.0 },
      { payerCode: 'PAY-UHC', payerName: 'UnitedHealthcare Commercial', casesCount: 70, avgAllowedAmount: 1180.0, avgNetCollections: 1180.0, contributionMarginPerCase: 650.0, marginPerOrHour: 1772.73 },
      { payerCode: 'PAY-AET', payerName: 'Aetna Managed Care', casesCount: 30, avgAllowedAmount: 1220.0, avgNetCollections: 1220.0, contributionMarginPerCase: 690.0, marginPerOrHour: 1881.82 }
    ]
  },
  {
    id: 'cpt-econ-43239',
    cptCode: '43239',
    procedureName: 'Upper GI Endoscopy w/ Biopsy',
    specialty: 'Gastroenterology',
    annualCaseVolume: 290,
    avgOperativeMinutes: 17.0,
    avgBilledCharges: 1800.0,
    avgNetCollections: 950.0,
    collectionRealizationPct: 52.78,
    implantCostPerCase: 0.0,
    sterileSupplyCostPerCase: 220.0,
    laborCostPerCase: 180.0,
    anesthesiaMedsCostPerCase: 70.0,
    totalDirectCostPerCase: 470.0,
    allocatedOverheadPerCase: 127.5, // $450/hr * (17.0 / 60)
    totalLoadedCostPerCase: 597.5,
    contributionMarginPerCase: 480.0,
    contributionMarginPct: 50.53,
    netMarginPerCase: 352.5,
    netMarginPct: 37.11,
    marginPerOrMinute: 28.24,
    marginPerOrHour: 1694.12,
    loadedMarginPerOrHour: 1244.12,
    breakevenAnnualCases: 77,
    opportunityCostPerCase: 86.67,
    economicQuadrant: 'VOLUME_PROFIT_BUILDER',
    primaryEconomicLever: 'Pair EGD sequentially with colonoscopies (same-session endoscopy block efficiency).',
    costComponents: [
      { category: 'Sterile Processing & Biopsy Forceps', amount: 220.0, pctOfTotal: 36.82, isVariable: true, vendor: 'Olympus America' },
      { category: 'Time-Driven Clinical Labor', amount: 180.0, pctOfTotal: 30.13, isVariable: true, vendor: 'ASC In-House Nursing' },
      { category: 'Facility Allocated Overhead', amount: 127.5, pctOfTotal: 21.34, isVariable: false, vendor: 'Facility Fixed Lease & SPD' },
      { category: 'Anesthesia Drugs & Sedation', amount: 70.0, pctOfTotal: 11.72, isVariable: true, vendor: 'AmerisourceBergen' }
    ],
    payerYields: [
      { payerCode: 'PAY-BCBS', payerName: 'Blue Cross Blue Shield', casesCount: 110, avgAllowedAmount: 1150.0, avgNetCollections: 1150.0, contributionMarginPerCase: 680.0, marginPerOrHour: 2400.0 },
      { payerCode: 'PAY-MED', payerName: 'Medicare Direct (Part B)', casesCount: 100, avgAllowedAmount: 590.0, avgNetCollections: 590.0, contributionMarginPerCase: 120.0, marginPerOrHour: 423.53 },
      { payerCode: 'PAY-UHC', payerName: 'UnitedHealthcare Commercial', casesCount: 55, avgAllowedAmount: 1090.0, avgNetCollections: 1090.0, contributionMarginPerCase: 620.0, marginPerOrHour: 2188.24 },
      { payerCode: 'PAY-CIG', payerName: 'Cigna Health', casesCount: 25, avgAllowedAmount: 1120.0, avgNetCollections: 1120.0, contributionMarginPerCase: 650.0, marginPerOrHour: 2294.12 }
    ]
  },
  {
    id: 'cpt-econ-31267',
    cptCode: '31267',
    procedureName: 'Nasal/Sinus Endoscopy w/ Tissue Removal',
    specialty: 'ENT',
    annualCaseVolume: 115,
    avgOperativeMinutes: 68.0,
    avgBilledCharges: 5500.0,
    avgNetCollections: 2800.0,
    collectionRealizationPct: 50.91,
    implantCostPerCase: 400.0,
    sterileSupplyCostPerCase: 700.0,
    laborCostPerCase: 650.0,
    anesthesiaMedsCostPerCase: 150.0,
    totalDirectCostPerCase: 1900.0,
    allocatedOverheadPerCase: 510.0, // $450/hr * (68.0 / 60)
    totalLoadedCostPerCase: 2410.0,
    contributionMarginPerCase: 900.0,
    contributionMarginPct: 32.14,
    netMarginPerCase: 390.0,
    netMarginPct: 13.93,
    marginPerOrMinute: 13.24,
    marginPerOrHour: 794.12,
    loadedMarginPerOrHour: 344.12,
    breakevenAnnualCases: 65,
    opportunityCostPerCase: 1366.67,
    economicQuadrant: 'ECONOMIC_DEFICIT',
    primaryEconomicLever: 'Sinus microdebrider and packing costs exceed threshold; renegotiate balloon sinuplasty carve-outs.',
    costComponents: [
      { category: 'Sterile Processing & Debriders', amount: 700.0, pctOfTotal: 29.05, isVariable: true, vendor: 'Medtronic ENT' },
      { category: 'Time-Driven Clinical Labor', amount: 650.0, pctOfTotal: 26.97, isVariable: true, vendor: 'ASC In-House Nursing' },
      { category: 'Facility Allocated Overhead', amount: 510.0, pctOfTotal: 21.16, isVariable: false, vendor: 'Facility Fixed Lease & SPD' },
      { category: 'Implants & Dissolvable Stents', amount: 400.0, pctOfTotal: 16.6, isVariable: true, vendor: 'Intersect ENT Propel' },
      { category: 'Anesthesia Drugs & Sedation', amount: 150.0, pctOfTotal: 6.22, isVariable: true, vendor: 'AmerisourceBergen' }
    ],
    payerYields: [
      { payerCode: 'PAY-BCBS', payerName: 'Blue Cross Blue Shield', casesCount: 45, avgAllowedAmount: 2850.0, avgNetCollections: 2850.0, contributionMarginPerCase: 950.0, marginPerOrHour: 838.24 },
      { payerCode: 'PAY-UHC', payerName: 'UnitedHealthcare Commercial', casesCount: 35, avgAllowedAmount: 2750.0, avgNetCollections: 2750.0, contributionMarginPerCase: 850.0, marginPerOrHour: 750.0 },
      { payerCode: 'PAY-AET', payerName: 'Aetna Managed Care', casesCount: 20, avgAllowedAmount: 3150.0, avgNetCollections: 3150.0, contributionMarginPerCase: 1250.0, marginPerOrHour: 1102.94 },
      { payerCode: 'PAY-MED', payerName: 'Medicare Direct (Part B)', casesCount: 15, avgAllowedAmount: 1840.0, avgNetCollections: 1840.0, contributionMarginPerCase: -60.0, marginPerOrHour: -52.94 }
    ]
  },
  {
    id: 'cpt-econ-64483',
    cptCode: '64483',
    procedureName: 'Transforaminal Epidural Lumbar Injection',
    specialty: 'Pain Management',
    annualCaseVolume: 320,
    avgOperativeMinutes: 14.0,
    avgBilledCharges: 1200.0,
    avgNetCollections: 640.0,
    collectionRealizationPct: 53.33,
    implantCostPerCase: 0.0,
    sterileSupplyCostPerCase: 150.0,
    laborCostPerCase: 110.0,
    anesthesiaMedsCostPerCase: 40.0,
    totalDirectCostPerCase: 300.0,
    allocatedOverheadPerCase: 105.0, // $450/hr * (14.0 / 60)
    totalLoadedCostPerCase: 405.0,
    contributionMarginPerCase: 340.0,
    contributionMarginPct: 53.13,
    netMarginPerCase: 235.0,
    netMarginPct: 36.72,
    marginPerOrMinute: 24.29,
    marginPerOrHour: 1457.14,
    loadedMarginPerOrHour: 1007.14,
    breakevenAnnualCases: 99,
    opportunityCostPerCase: 126.67,
    economicQuadrant: 'VOLUME_PROFIT_BUILDER',
    primaryEconomicLever: 'Maintain 4-cases/hour fluoroscopy suite throughput; monitor Medicare LCD injection frequency caps.',
    costComponents: [
      { category: 'Sterile Processing & Trays', amount: 150.0, pctOfTotal: 37.04, isVariable: true, vendor: 'BD Medical' },
      { category: 'Time-Driven Clinical Labor', amount: 110.0, pctOfTotal: 27.16, isVariable: true, vendor: 'ASC In-House Nursing' },
      { category: 'Facility Allocated Overhead', amount: 105.0, pctOfTotal: 25.93, isVariable: false, vendor: 'Facility Fixed Lease & SPD' },
      { category: 'Anesthesia Drugs & Sedation', amount: 40.0, pctOfTotal: 9.88, isVariable: true, vendor: 'AmerisourceBergen' }
    ],
    payerYields: [
      { payerCode: 'PAY-BCBS', payerName: 'Blue Cross Blue Shield', casesCount: 130, avgAllowedAmount: 820.0, avgNetCollections: 820.0, contributionMarginPerCase: 520.0, marginPerOrHour: 2228.57 },
      { payerCode: 'PAY-MED', payerName: 'Medicare Direct (Part B)', casesCount: 110, avgAllowedAmount: 380.0, avgNetCollections: 380.0, contributionMarginPerCase: 80.0, marginPerOrHour: 342.86 },
      { payerCode: 'PAY-UHC', payerName: 'UnitedHealthcare Commercial', casesCount: 50, avgAllowedAmount: 740.0, avgNetCollections: 740.0, contributionMarginPerCase: 440.0, marginPerOrHour: 1885.71 },
      { payerCode: 'PAY-WC', payerName: 'Workers Compensation (State)', casesCount: 30, avgAllowedAmount: 880.0, avgNetCollections: 880.0, contributionMarginPerCase: 580.0, marginPerOrHour: 2485.71 }
    ]
  }
];

export default {
  ECONOMIC_QUADRANTS,
  ECONOMIC_BENCHMARKS,
  calculateGrossMargin,
  calculateDirectContributionMargin,
  calculateDirectContributionMarginPct,
  calculateFullyLoadedNetMargin,
  calculateMarginPerOrMinute,
  calculateMarginPerOrHour,
  calculateFullyLoadedMarginPerOrHour,
  calculateBreakevenCases,
  calculateBlockOpportunityCost,
  classifyEconomicQuadrant,
  calculateFacilityEconomicsKpis,
  SEED_CPT_ECONOMICS
};
