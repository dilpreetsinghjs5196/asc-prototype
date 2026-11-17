/**
 * ==============================================================================
 * Phase B1: Surgeon Financial Scorecard Service
 * Module 11: Surgeon & Clinical Intelligence
 * Description: Deterministic financial calculations for surgeon volume, billed charges,
 *              net collections, direct costs, contribution margin per OR-hour,
 *              payer mix, and CPT procedural economics.
 * ==============================================================================
 */

export const PAYER_CATEGORIES = {
  COMMERCIAL: { key: 'COMMERCIAL', label: 'Commercial PPO/HMO', color: '#0284c7' },
  MEDICARE: { key: 'MEDICARE', label: 'Medicare ASC', color: '#059669' },
  MEDICAID: { key: 'MEDICAID', label: 'Managed Medicaid', color: '#d97706' },
  WORKERS_COMP: { key: 'WORKERS_COMP', label: 'Workers Compensation', color: '#475569' },
  SELF_PAY: { key: 'SELF_PAY', label: 'Self-Pay / Cosmetic', color: '#dc2626' }
};

export const FINANCIAL_BENCHMARKS = {
  TARGET_COLLECTION_REALIZATION_PCT: 70.0,
  TARGET_MARGIN_PER_OR_HOUR: 1800.0,
  TARGET_CONTRIBUTION_MARGIN_PCT: 60.0,
  MAX_DIRECT_COST_RATIO_PCT: 40.0
};

/**
 * Calculate Net Collection Realization Rate (%)
 */
export function calculateRealizationRate(netCollections = 0, grossBilled = 0) {
  if (grossBilled <= 0) return 0.0;
  const rate = (netCollections / grossBilled) * 100;
  return Number(rate.toFixed(2));
}

/**
 * Calculate Total Direct Case Cost ($)
 */
export function calculateTotalDirectCost(costs = {}) {
  const {
    laborCost = 0,
    implantCost = 0,
    supplyCost = 0,
    sterileCost = 0
  } = costs;

  const total = laborCost + implantCost + supplyCost + sterileCost;
  return Number(total.toFixed(2));
}

/**
 * Calculate Net Contribution Margin ($)
 */
export function calculateContributionMargin(netCollections = 0, totalDirectCost = 0) {
  const cm = netCollections - totalDirectCost;
  return Number(cm.toFixed(2));
}

/**
 * Calculate Contribution Margin Percentage (%)
 */
export function calculateContributionMarginPct(netContributionMargin = 0, netCollections = 0) {
  if (netCollections <= 0) return 0.0;
  const pct = (netContributionMargin / netCollections) * 100;
  return Number(pct.toFixed(2));
}

/**
 * Calculate Contribution Margin per OR-Hour ($/OR-hr)
 */
export function calculateMarginPerOrHour(netContributionMargin = 0, totalOrMinutes = 0) {
  if (totalOrMinutes <= 0) return 0.0;
  const orHours = totalOrMinutes / 60;
  const yieldPerHour = netContributionMargin / orHours;
  return Number(yieldPerHour.toFixed(2));
}

/**
 * Calculate Percentile Rank of a value in a dataset
 */
export function calculatePercentileRank(value, allValues = []) {
  if (!allValues || allValues.length === 0) return 50.0;
  const sorted = [...allValues].sort((a, b) => a - b);
  const below = sorted.filter(v => v < value).length;
  const rank = (below / sorted.length) * 100;
  return Number(rank.toFixed(1));
}

/**
 * Flag Negative-Margin Loss Leaders
 */
export function flagNegativeMarginCpts(cptList = []) {
  return cptList.filter(c => (c.avgContributionMargin || 0) < 0);
}

/**
 * Aggregate Facility-Wide Financial KPIs
 */
export function calculateFacilityFinancialKpis(scorecards = []) {
  if (!scorecards || scorecards.length === 0) {
    return {
      totalCases: 0,
      totalGrossBilled: 0,
      totalNetCollections: 0,
      totalContributionMargin: 0,
      avgMarginPerOrHour: 0,
      facilityRealizationPct: 0
    };
  }

  let totalCases = 0;
  let totalBilled = 0;
  let totalCollected = 0;
  let totalCm = 0;
  let totalMinutes = 0;

  scorecards.forEach(s => {
    totalCases += s.totalCases || 0;
    totalBilled += s.grossBilledCharges || 0;
    totalCollected += s.netCollections || 0;
    totalCm += s.netContributionMargin || 0;
    totalMinutes += s.totalOrMinutes || 0;
  });

  const realizationPct = totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0;
  const avgMarginPerHour = totalMinutes > 0 ? totalCm / (totalMinutes / 60) : 0;

  return {
    totalCases,
    totalGrossBilled: Math.round(totalBilled),
    totalNetCollections: Math.round(totalCollected),
    totalContributionMargin: Math.round(totalCm),
    avgMarginPerOrHour: Math.round(avgMarginPerHour),
    facilityRealizationPct: Number(realizationPct.toFixed(1))
  };
}

/**
 * Seed Financial Scorecards for Attending Surgeons
 */
export const SEED_SURGEON_FINANCIAL_SCORECARDS = [
  {
    surgeonId: 3,
    surgeonName: 'Dr. Marcus Vance',
    specialty: 'Orthopedics',
    npi: '1982746192',
    totalCases: 48,
    totalOrMinutes: 4620,
    avgCaseMinutes: 96.25,
    grossBilledCharges: 284500,
    contractualAdjustments: 85350,
    netCollections: 199150,
    collectionRealizationPct: 70.0,
    directLaborCost: 8800,
    directImplantCost: 12400,
    directSupplyCost: 3600,
    directSterileCost: 1550,
    totalDirectCost: 26350,
    netContributionMargin: 172800,
    contributionMarginPct: 86.8,
    marginPerOrHour: 2244.16,
    facilityPercentileRank: 95.0,
    payerMix: [
      { payerCategory: 'COMMERCIAL', caseCount: 34, collected: 149360, sharePct: 75.0 },
      { payerCategory: 'MEDICARE', caseCount: 10, collected: 39830, sharePct: 20.0 },
      { payerCategory: 'WORKERS_COMP', caseCount: 4, collected: 9960, sharePct: 5.0 }
    ],
    cptEconomics: [
      { cptCode: '27447', description: 'Total Knee Arthroplasty', cases: 22, avgDuration: 110, avgBilled: 7200, avgCollected: 5100, avgDirectCost: 680, avgContributionMargin: 4420, marginPerOrHour: 2410.91 },
      { cptCode: '29881', description: 'Knee Arthroscopy Meniscectomy', cases: 16, avgDuration: 65, avgBilled: 4200, avgCollected: 2950, avgDirectCost: 320, avgContributionMargin: 2630, marginPerOrHour: 2427.69 },
      { cptCode: '29827', description: 'Shoulder Rotator Cuff Repair', cases: 10, avgDuration: 120, avgBilled: 8400, avgCollected: 5800, avgDirectCost: 890, avgContributionMargin: 4910, marginPerOrHour: 2455.00 }
    ]
  },
  {
    surgeonId: 7,
    surgeonName: 'Dr. Cliff Burmiester',
    specialty: 'Orthopedics',
    npi: '1871635281',
    totalCases: 42,
    totalOrMinutes: 4100,
    avgCaseMinutes: 97.62,
    grossBilledCharges: 246000,
    contractualAdjustments: 73800,
    netCollections: 172200,
    collectionRealizationPct: 70.0,
    directLaborCost: 7800,
    directImplantCost: 10800,
    directSupplyCost: 3100,
    directSterileCost: 1300,
    totalDirectCost: 23000,
    netContributionMargin: 149200,
    contributionMarginPct: 86.6,
    marginPerOrHour: 2183.41,
    facilityPercentileRank: 90.0,
    payerMix: [
      { payerCategory: 'COMMERCIAL', caseCount: 30, collected: 129150, sharePct: 75.0 },
      { payerCategory: 'MEDICARE', caseCount: 9, collected: 34440, sharePct: 20.0 },
      { payerCategory: 'WORKERS_COMP', caseCount: 3, collected: 8610, sharePct: 5.0 }
    ],
    cptEconomics: [
      { cptCode: '27130', description: 'Total Hip Arthroplasty', cases: 18, avgDuration: 115, avgBilled: 7500, avgCollected: 5300, avgDirectCost: 720, avgContributionMargin: 4580, marginPerOrHour: 2389.57 },
      { cptCode: '29881', description: 'Knee Arthroscopy Meniscectomy', cases: 14, avgDuration: 70, avgBilled: 4200, avgCollected: 2950, avgDirectCost: 340, avgContributionMargin: 2610, marginPerOrHour: 2237.14 },
      { cptCode: '29824', description: 'Shoulder Distal Claviculectomy', cases: 10, avgDuration: 90, avgBilled: 5800, avgCollected: 4100, avgDirectCost: 510, avgContributionMargin: 3590, marginPerOrHour: 2393.33 }
    ]
  },
  {
    surgeonId: 8,
    surgeonName: 'Dr. Katie Arcos',
    specialty: 'Orthopedics',
    npi: '1760524170',
    totalCases: 36,
    totalOrMinutes: 3780,
    avgCaseMinutes: 105.0,
    grossBilledCharges: 198000,
    contractualAdjustments: 63360,
    netCollections: 134640,
    collectionRealizationPct: 68.0,
    directLaborCost: 6900,
    directImplantCost: 8900,
    directSupplyCost: 2900,
    directSterileCost: 1440,
    totalDirectCost: 20140,
    netContributionMargin: 114500,
    contributionMarginPct: 85.0,
    marginPerOrHour: 1817.46,
    facilityPercentileRank: 75.0,
    payerMix: [
      { payerCategory: 'COMMERCIAL', caseCount: 24, collected: 94248, sharePct: 70.0 },
      { payerCategory: 'MEDICARE', caseCount: 8, collected: 26928, sharePct: 20.0 },
      { payerCategory: 'MEDICAID', caseCount: 4, collected: 13464, sharePct: 10.0 }
    ],
    cptEconomics: [
      { cptCode: '29827', description: 'Shoulder Rotator Cuff Repair', cases: 16, avgDuration: 125, avgBilled: 8200, avgCollected: 5600, avgDirectCost: 910, avgContributionMargin: 4690, marginPerOrHour: 2251.20 },
      { cptCode: '29881', description: 'Knee Meniscectomy', cases: 12, avgDuration: 75, avgBilled: 4100, avgCollected: 2800, avgDirectCost: 350, avgContributionMargin: 2450, marginPerOrHour: 1960.00 },
      { cptCode: '29806', description: 'Shoulder Capsulorrhaphy', cases: 8, avgDuration: 110, avgBilled: 7400, avgCollected: 5100, avgDirectCost: 780, avgContributionMargin: 4320, marginPerOrHour: 2356.36 }
    ]
  },
  {
    surgeonId: 9,
    surgeonName: 'Dr. Daniela Burchhardt',
    specialty: 'Ophthalmology',
    npi: '1659413069',
    totalCases: 56,
    totalOrMinutes: 2800,
    avgCaseMinutes: 50.0,
    grossBilledCharges: 168000,
    contractualAdjustments: 58800,
    netCollections: 109200,
    collectionRealizationPct: 65.0,
    directLaborCost: 5200,
    directImplantCost: 5800,
    directSupplyCost: 2600,
    directSterileCost: 1400,
    totalDirectCost: 15000,
    netContributionMargin: 94200,
    contributionMarginPct: 86.3,
    marginPerOrHour: 2018.57,
    facilityPercentileRank: 80.0,
    payerMix: [
      { payerCategory: 'MEDICARE', caseCount: 38, collected: 74256, sharePct: 68.0 },
      { payerCategory: 'COMMERCIAL', caseCount: 14, collected: 27300, sharePct: 25.0 },
      { payerCategory: 'SELF_PAY', caseCount: 4, collected: 7644, sharePct: 7.0 }
    ],
    cptEconomics: [
      { cptCode: '66984', description: 'Cataract Surgery w/ IOL', cases: 38, avgDuration: 45, avgBilled: 2900, avgCollected: 1950, avgDirectCost: 240, avgContributionMargin: 1710, marginPerOrHour: 2280.00 },
      { cptCode: '66982', description: 'Complex Cataract Surgery', cases: 12, avgDuration: 60, avgBilled: 3800, avgCollected: 2550, avgDirectCost: 310, avgContributionMargin: 2240, marginPerOrHour: 2240.00 },
      { cptCode: '65855', description: 'Trabeculoplasty Laser', cases: 6, avgDuration: 30, avgBilled: 1400, avgCollected: 950, avgDirectCost: 110, avgContributionMargin: 840, marginPerOrHour: 1680.00 }
    ]
  },
  {
    surgeonId: 11,
    surgeonName: 'Dr. Mark Basile',
    specialty: 'Plastic/Cosmetic',
    npi: '1548302958',
    totalCases: 28,
    totalOrMinutes: 3920,
    avgCaseMinutes: 140.0,
    grossBilledCharges: 224000,
    contractualAdjustments: 78400,
    netCollections: 145600,
    collectionRealizationPct: 65.0,
    directLaborCost: 9800,
    directImplantCost: 14200,
    directSupplyCost: 6800,
    directSterileCost: 2800,
    totalDirectCost: 33600,
    netContributionMargin: 112000,
    contributionMarginPct: 76.9,
    marginPerOrHour: 1714.29,
    facilityPercentileRank: 60.0,
    payerMix: [
      { payerCategory: 'COMMERCIAL', caseCount: 16, collected: 87360, sharePct: 60.0 },
      { payerCategory: 'SELF_PAY', caseCount: 10, collected: 50960, sharePct: 35.0 },
      { payerCategory: 'MEDICARE', caseCount: 2, collected: 7280, sharePct: 5.0 }
    ],
    cptEconomics: [
      { cptCode: '19325', description: 'Mammaplasty Augmentation', cases: 14, avgDuration: 130, avgBilled: 8600, avgCollected: 5800, avgDirectCost: 1200, avgContributionMargin: 4600, marginPerOrHour: 2123.08 },
      { cptCode: '15823', description: 'Blepharoplasty Upper Eyelid', cases: 8, avgDuration: 90, avgBilled: 4800, avgCollected: 3200, avgDirectCost: 450, avgContributionMargin: 2750, marginPerOrHour: 1833.33 },
      { cptCode: '15830', description: 'Excision Excessive Skin Abdomen', cases: 6, avgDuration: 180, avgBilled: 12400, avgCollected: 8100, avgDirectCost: 2100, avgContributionMargin: 6000, marginPerOrHour: 2000.00 }
    ]
  },
  {
    surgeonId: 12,
    surgeonName: 'Dr. Troy Shell Masouras',
    specialty: 'General Surgery',
    npi: '1437291847',
    totalCases: 24,
    totalOrMinutes: 2640,
    avgCaseMinutes: 110.0,
    grossBilledCharges: 132000,
    contractualAdjustments: 48840,
    netCollections: 83160,
    collectionRealizationPct: 63.0,
    directLaborCost: 6200,
    directImplantCost: 4800,
    directSupplyCost: 4900,
    directSterileCost: 2460,
    totalDirectCost: 18360,
    netContributionMargin: 64800,
    contributionMarginPct: 77.9,
    marginPerOrHour: 1472.73,
    facilityPercentileRank: 45.0,
    payerMix: [
      { payerCategory: 'COMMERCIAL', caseCount: 14, collected: 54054, sharePct: 65.0 },
      { payerCategory: 'MEDICARE', caseCount: 6, collected: 19958, sharePct: 24.0 },
      { payerCategory: 'MEDICAID', caseCount: 4, collected: 9148, sharePct: 11.0 }
    ],
    cptEconomics: [
      { cptCode: '49505', description: 'Inguinal Hernia Repair Initial', cases: 12, avgDuration: 95, avgBilled: 5200, avgCollected: 3300, avgDirectCost: 650, avgContributionMargin: 2650, marginPerOrHour: 1673.68 },
      { cptCode: '47562', description: 'Laparoscopic Cholecystectomy', cases: 8, avgDuration: 120, avgBilled: 7100, avgCollected: 4500, avgDirectCost: 980, avgContributionMargin: 3520, marginPerOrHour: 1760.00 },
      { cptCode: '49585', description: 'Umbilical Hernia Repair', cases: 4, avgDuration: 80, avgBilled: 4200, avgCollected: 2600, avgDirectCost: 520, avgContributionMargin: 2080, marginPerOrHour: 1560.00 }
    ]
  },
  {
    surgeonId: 13,
    surgeonName: 'Dr. Ben McManus',
    specialty: 'Orthopedics',
    npi: '1326180736',
    totalCases: 20,
    totalOrMinutes: 2400,
    avgCaseMinutes: 120.0,
    grossBilledCharges: 118000,
    contractualAdjustments: 44840,
    netCollections: 73160,
    collectionRealizationPct: 62.0,
    directLaborCost: 5800,
    directImplantCost: 8900,
    directSupplyCost: 4100,
    directSterileCost: 2360,
    totalDirectCost: 21160,
    netContributionMargin: 52000,
    contributionMarginPct: 71.1,
    marginPerOrHour: 1300.0,
    facilityPercentileRank: 35.0,
    payerMix: [
      { payerCategory: 'COMMERCIAL', caseCount: 11, collected: 43896, sharePct: 60.0 },
      { payerCategory: 'MEDICARE', caseCount: 5, collected: 18290, sharePct: 25.0 },
      { payerCategory: 'MEDICAID', caseCount: 4, collected: 10974, sharePct: 15.0 }
    ],
    cptEconomics: [
      { cptCode: '29881', description: 'Knee Meniscectomy', cases: 10, avgDuration: 85, avgBilled: 4200, avgCollected: 2700, avgDirectCost: 480, avgContributionMargin: 2220, marginPerOrHour: 1567.06 },
      { cptCode: '29827', description: 'Rotator Cuff Repair', cases: 6, avgDuration: 145, avgBilled: 8400, avgCollected: 5200, avgDirectCost: 1450, avgContributionMargin: 3750, marginPerOrHour: 1551.72 },
      { cptCode: '29806', description: 'Shoulder Capsulorrhaphy', cases: 4, avgDuration: 135, avgBilled: 7600, avgCollected: 4600, avgDirectCost: 1380, avgContributionMargin: 3220, marginPerOrHour: 1431.11 }
    ]
  },
  {
    surgeonId: 14,
    surgeonName: 'Dr. Robert Klausner',
    specialty: 'Pain Management',
    npi: '1215079625',
    totalCases: 64,
    totalOrMinutes: 2240,
    avgCaseMinutes: 35.0,
    grossBilledCharges: 142000,
    contractualAdjustments: 45440,
    netCollections: 96560,
    collectionRealizationPct: 68.0,
    directLaborCost: 4600,
    directImplantCost: 5800,
    directSupplyCost: 4900,
    directSterileCost: 2860,
    totalDirectCost: 18160,
    netContributionMargin: 78400,
    contributionMarginPct: 81.2,
    marginPerOrHour: 2100.0,
    facilityPercentileRank: 85.0,
    payerMix: [
      { payerCategory: 'COMMERCIAL', caseCount: 40, collected: 62764, sharePct: 65.0 },
      { payerCategory: 'MEDICARE', caseCount: 16, collected: 24140, sharePct: 25.0 },
      { payerCategory: 'WORKERS_COMP', caseCount: 8, collected: 9656, sharePct: 10.0 }
    ],
    cptEconomics: [
      { cptCode: '64483', description: 'Transforaminal Epidural Lumbar', cases: 34, avgDuration: 30, avgBilled: 2100, avgCollected: 1450, avgDirectCost: 220, avgContributionMargin: 1230, marginPerOrHour: 2460.00 },
      { cptCode: '64635', description: 'Lumbar Facet Radiofrequency', cases: 20, avgDuration: 40, avgBilled: 2800, avgCollected: 1900, avgDirectCost: 310, avgContributionMargin: 1590, marginPerOrHour: 2385.00 },
      { cptCode: '63650', description: 'Spinal Cord Stimulator Trial', cases: 10, avgDuration: 55, avgBilled: 4200, avgCollected: 2850, avgDirectCost: 580, avgContributionMargin: 2270, marginPerOrHour: 2476.36 }
    ]
  },
  {
    surgeonId: 15,
    surgeonName: 'Dr. Aaron Jacobs',
    specialty: 'Orthopedics',
    npi: '1104968514',
    totalCases: 14,
    totalOrMinutes: 1960,
    avgCaseMinutes: 140.0,
    grossBilledCharges: 78000,
    contractualAdjustments: 32760,
    netCollections: 45240,
    collectionRealizationPct: 58.0,
    directLaborCost: 4800,
    directImplantCost: 6800,
    directSupplyCost: 2400,
    directSterileCost: 1840,
    totalDirectCost: 15840,
    netContributionMargin: 29400,
    contributionMarginPct: 65.0,
    marginPerOrHour: 900.0,
    facilityPercentileRank: 15.0,
    payerMix: [
      { payerCategory: 'MEDICAID', caseCount: 7, collected: 18096, sharePct: 40.0 },
      { payerCategory: 'MEDICARE', caseCount: 4, collected: 13572, sharePct: 30.0 },
      { payerCategory: 'COMMERCIAL', caseCount: 3, collected: 13572, sharePct: 30.0 }
    ],
    cptEconomics: [
      { cptCode: '29881', description: 'Knee Meniscectomy', cases: 6, avgDuration: 110, avgBilled: 3800, avgCollected: 2100, avgDirectCost: 590, avgContributionMargin: 1510, marginPerOrHour: 823.64 },
      { cptCode: '29827', description: 'Rotator Cuff Repair', cases: 5, avgDuration: 165, avgBilled: 7800, avgCollected: 4200, avgDirectCost: 1680, avgContributionMargin: 2520, marginPerOrHour: 916.36 },
      { cptCode: '29806', description: 'Shoulder Capsulorrhaphy', cases: 3, avgDuration: 150, avgBilled: 7200, avgCollected: 3900, avgDirectCost: 1520, avgContributionMargin: 2380, marginPerOrHour: 952.00 }
    ]
  }
];

export default {
  PAYER_CATEGORIES,
  FINANCIAL_BENCHMARKS,
  calculateRealizationRate,
  calculateTotalDirectCost,
  calculateContributionMargin,
  calculateContributionMarginPct,
  calculateMarginPerOrHour,
  calculatePercentileRank,
  flagNegativeMarginCpts,
  calculateFacilityFinancialKpis,
  SEED_SURGEON_FINANCIAL_SCORECARDS
};
