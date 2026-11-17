/**
 * ==============================================================================
 * Phase B2: Surgeon Implant Variance Service
 * Module 11: Surgeon & Clinical Intelligence
 * Description: Deterministic calculations for procedure-level surgeon implant cost
 *              variance, construct substitution savings, sterile waste quantification,
 *              and preference card harmonization.
 * ==============================================================================
 */

export const VARIANCE_STATUSES = {
  EFFICIENT: {
    key: 'EFFICIENT',
    label: 'Efficient (≤ 5%)',
    color: '#059669', // Emerald
    badgeBg: 'rgba(5, 150, 105, 0.12)',
    badgeBorder: 'rgba(5, 150, 105, 0.35)',
    badgeText: '#059669'
  },
  MODERATE_VARIANCE: {
    key: 'MODERATE_VARIANCE',
    label: 'Moderate (5% - 20%)',
    color: '#d97706', // Amber
    badgeBg: 'rgba(217, 119, 6, 0.12)',
    badgeBorder: 'rgba(217, 119, 6, 0.35)',
    badgeText: '#d97706'
  },
  HIGH_VARIANCE_OUTLIER: {
    key: 'HIGH_VARIANCE_OUTLIER',
    label: 'High Outlier (> 20%)',
    color: '#dc2626', // Crimson
    badgeBg: 'rgba(220, 38, 38, 0.12)',
    badgeBorder: 'rgba(220, 38, 38, 0.35)',
    badgeText: '#dc2626'
  }
};

export const IMPLANT_STANDARDS = {
  MAX_ACCEPTABLE_VARIANCE_PCT: 5.0,
  CRITICAL_OUTLIER_THRESHOLD_PCT: 20.0,
  MAX_STERILE_WASTE_PCT: 3.0
};

/**
 * Calculate Unit Cost Variance ($)
 */
export function calculateUnitVariance(surgeonCost = 0, peerMedianCost = 0) {
  const delta = surgeonCost - peerMedianCost;
  return Number(delta.toFixed(2));
}

/**
 * Calculate Variance Percentage (%)
 */
export function calculateVariancePct(surgeonCost = 0, peerMedianCost = 0) {
  if (peerMedianCost <= 0) return 0.0;
  const pct = ((surgeonCost - peerMedianCost) / peerMedianCost) * 100;
  return Number(pct.toFixed(2));
}

/**
 * Classify Variance Status
 */
export function classifyVarianceStatus(variancePct = 0) {
  if (variancePct <= IMPLANT_STANDARDS.MAX_ACCEPTABLE_VARIANCE_PCT) {
    return 'EFFICIENT';
  }
  if (variancePct < IMPLANT_STANDARDS.CRITICAL_OUTLIER_THRESHOLD_PCT) {
    return 'MODERATE_VARIANCE';
  }
  return 'HIGH_VARIANCE_OUTLIER';
}

/**
 * Calculate Total Excess Spend ($)
 */
export function calculateTotalExcessSpend(unitVariance = 0, caseCount = 0) {
  if (unitVariance <= 0 || caseCount <= 0) return 0.0;
  const total = unitVariance * caseCount;
  return Number(total.toFixed(2));
}

/**
 * Calculate Potential Savings from Construct Substitution ($)
 */
export function calculatePotentialSavings(surgeonCost = 0, substituteCost = 0, caseCount = 0) {
  if (caseCount <= 0) {
    return { unitSavings: 0.0, totalSavings: 0.0 };
  }
  const unitSavings = Math.max(0, surgeonCost - substituteCost);
  const totalSavings = unitSavings * caseCount;
  return {
    unitSavings: Number(unitSavings.toFixed(2)),
    totalSavings: Number(totalSavings.toFixed(2))
  };
}

/**
 * Calculate Sterile Waste Metrics
 */
export function calculateSterileWaste(wastedCost = 0, totalStagedCost = 0) {
  if (totalStagedCost <= 0) {
    return { wasteRatePct: 0.0, isExcessive: false };
  }
  const rate = (wastedCost / totalStagedCost) * 100;
  const wasteRatePct = Number(rate.toFixed(2));
  return {
    wasteRatePct,
    isExcessive: wasteRatePct > IMPLANT_STANDARDS.MAX_STERILE_WASTE_PCT
  };
}

/**
 * Aggregate Facility-Wide Implant Variance KPIs
 */
export function calculateFacilityImplantKpis(variances = []) {
  if (!variances || variances.length === 0) {
    return {
      totalProcedures: 0,
      totalImplantSpend: 0,
      totalExcessSpend: 0,
      totalRealizableSavings: 0,
      avgSterileWastePct: 0,
      outliersCount: 0
    };
  }

  let totalSpend = 0;
  let totalExcess = 0;
  let totalSavings = 0;
  let totalWasteRate = 0;
  let outliersCount = 0;

  variances.forEach(v => {
    totalSpend += (v.surgeonAvgImplantCost || 0) * (v.caseCount || 0);
    totalExcess += v.totalExcessSpend || 0;
    totalSavings += v.potentialTotalSavings || 0;
    totalWasteRate += v.wasteRatePct || 0;
    if (v.varianceStatus === 'HIGH_VARIANCE_OUTLIER') {
      outliersCount += 1;
    }
  });

  return {
    totalProcedures: variances.length,
    totalImplantSpend: Math.round(totalSpend),
    totalExcessSpend: Math.round(totalExcess),
    totalRealizableSavings: Math.round(totalSavings),
    avgSterileWastePct: Number((totalWasteRate / variances.length).toFixed(1)),
    outliersCount
  };
}

/**
 * Seed Implant Variance Records for Attending Surgeons
 */
export const SEED_SURGEON_IMPLANT_VARIANCES = [
  {
    id: 'var-001',
    surgeonId: 3,
    surgeonName: 'Dr. Marcus Vance',
    specialty: 'Orthopedics',
    cptCode: '27447',
    procedureName: 'Total Knee Arthroplasty',
    caseCount: 22,
    surgeonAvgImplantCost: 2850.0,
    peerMedianImplantCost: 2980.0,
    contractBaselineCost: 2650.0,
    unitCostVariance: -130.0,
    variancePct: -4.36,
    totalExcessSpend: 0.0,
    primaryVendorName: 'Zimmer Biomet',
    primaryConstructName: 'Persona Personalized Total Knee Construct',
    recommendedSubstitute: 'Contracted Tier-1 Zimmer Standard Trays',
    potentialUnitSavings: 200.0,
    potentialTotalSavings: 4400.0,
    wasteRatePct: 1.2,
    wasteCostTotal: 750.0,
    varianceStatus: 'EFFICIENT'
  },
  {
    id: 'var-002',
    surgeonId: 7,
    surgeonName: 'Dr. Cliff Burmiester',
    specialty: 'Orthopedics',
    cptCode: '27130',
    procedureName: 'Total Hip Arthroplasty',
    caseCount: 18,
    surgeonAvgImplantCost: 3120.0,
    peerMedianImplantCost: 3180.0,
    contractBaselineCost: 2890.0,
    unitCostVariance: -60.0,
    variancePct: -1.89,
    totalExcessSpend: 0.0,
    primaryVendorName: 'DePuy Synthes',
    primaryConstructName: 'Pinnacle Acetabular & Corail Stem Construct',
    recommendedSubstitute: 'Contracted DePuy Standard Sizing Trays',
    potentialUnitSavings: 230.0,
    potentialTotalSavings: 4140.0,
    wasteRatePct: 1.5,
    wasteCostTotal: 840.0,
    varianceStatus: 'EFFICIENT'
  },
  {
    id: 'var-003',
    surgeonId: 8,
    surgeonName: 'Dr. Katie Arcos',
    specialty: 'Orthopedics',
    cptCode: '29827',
    procedureName: 'Shoulder Rotator Cuff Repair',
    caseCount: 16,
    surgeonAvgImplantCost: 1850.0,
    peerMedianImplantCost: 1720.0,
    contractBaselineCost: 1480.0,
    unitCostVariance: 130.0,
    variancePct: 7.56,
    totalExcessSpend: 2080.0,
    primaryVendorName: 'Arthrex',
    primaryConstructName: 'SpeedBridge Double-Row BioComposite Construct',
    recommendedSubstitute: 'Arthrex SwiveLock Standard Double-Row (Contracted)',
    potentialUnitSavings: 370.0,
    potentialTotalSavings: 5920.0,
    wasteRatePct: 2.1,
    wasteCostTotal: 620.0,
    varianceStatus: 'MODERATE_VARIANCE'
  },
  {
    id: 'var-004',
    surgeonId: 13,
    surgeonName: 'Dr. Ben McManus',
    specialty: 'Orthopedics',
    cptCode: '29827',
    procedureName: 'Shoulder Rotator Cuff Repair',
    caseCount: 6,
    surgeonAvgImplantCost: 2450.0,
    peerMedianImplantCost: 1720.0,
    contractBaselineCost: 1480.0,
    unitCostVariance: 730.0,
    variancePct: 42.44, // Triggers HIGH_VARIANCE_OUTLIER
    totalExcessSpend: 4380.0,
    primaryVendorName: 'Stryker',
    primaryConstructName: 'Premium PEEK Anchor Dual-Loaded Construct',
    recommendedSubstitute: 'Arthrex SwiveLock Standard BioComposite ($1,480)',
    potentialUnitSavings: 970.0,
    potentialTotalSavings: 5820.0,
    wasteRatePct: 5.4, // Triggers excessive waste
    wasteCostTotal: 790.0,
    varianceStatus: 'HIGH_VARIANCE_OUTLIER'
  },
  {
    id: 'var-005',
    surgeonId: 15,
    surgeonName: 'Dr. Aaron Jacobs',
    specialty: 'Orthopedics',
    cptCode: '29827',
    procedureName: 'Shoulder Rotator Cuff Repair',
    caseCount: 5,
    surgeonAvgImplantCost: 2380.0,
    peerMedianImplantCost: 1720.0,
    contractBaselineCost: 1480.0,
    unitCostVariance: 660.0,
    variancePct: 38.37, // Triggers HIGH_VARIANCE_OUTLIER
    totalExcessSpend: 3300.0,
    primaryVendorName: 'Smith & Nephew',
    primaryConstructName: 'Healicoil Knotless Anchor Construct',
    recommendedSubstitute: 'Contracted Tier-1 Arthrex BioComposite ($1,480)',
    potentialUnitSavings: 900.0,
    potentialTotalSavings: 4500.0,
    wasteRatePct: 6.2, // Triggers excessive waste
    wasteCostTotal: 740.0,
    varianceStatus: 'HIGH_VARIANCE_OUTLIER'
  },
  {
    id: 'var-006',
    surgeonId: 9,
    surgeonName: 'Dr. Daniela Burchhardt',
    specialty: 'Ophthalmology',
    cptCode: '66984',
    procedureName: 'Cataract Surgery w/ IOL',
    caseCount: 38,
    surgeonAvgImplantCost: 310.0,
    peerMedianImplantCost: 325.0,
    contractBaselineCost: 285.0,
    unitCostVariance: -15.0,
    variancePct: -4.62,
    totalExcessSpend: 0.0,
    primaryVendorName: 'Alcon Surgical',
    primaryConstructName: 'AcrySof IQ Monofocal Foldable IOL',
    recommendedSubstitute: 'Alcon Contracted Tier-1 Monofocal IOL',
    potentialUnitSavings: 25.0,
    potentialTotalSavings: 950.0,
    wasteRatePct: 0.8,
    wasteCostTotal: 95.0,
    varianceStatus: 'EFFICIENT'
  },
  {
    id: 'var-007',
    surgeonId: 11,
    surgeonName: 'Dr. Mark Basile',
    specialty: 'Plastic/Cosmetic',
    cptCode: '19325',
    procedureName: 'Mammaplasty Augmentation',
    caseCount: 14,
    surgeonAvgImplantCost: 1420.0,
    peerMedianImplantCost: 1380.0,
    contractBaselineCost: 1250.0,
    unitCostVariance: 40.0,
    variancePct: 2.9,
    totalExcessSpend: 560.0,
    primaryVendorName: 'Mentor Worldwide',
    primaryConstructName: 'MemoryGel Smooth High-Profile Breast Implants',
    recommendedSubstitute: 'Contracted Mentor Volume Tier Formulary',
    potentialUnitSavings: 170.0,
    potentialTotalSavings: 2380.0,
    wasteRatePct: 1.4,
    wasteCostTotal: 280.0,
    varianceStatus: 'EFFICIENT'
  },
  {
    id: 'var-008',
    surgeonId: 14,
    surgeonName: 'Dr. Robert Klausner',
    specialty: 'Pain Management',
    cptCode: '63650',
    procedureName: 'Spinal Cord Stimulator Trial',
    caseCount: 10,
    surgeonAvgImplantCost: 1650.0,
    peerMedianImplantCost: 1580.0,
    contractBaselineCost: 1390.0,
    unitCostVariance: 70.0,
    variancePct: 4.43,
    totalExcessSpend: 700.0,
    primaryVendorName: 'Medtronic Neuromodulation',
    primaryConstructName: '1x8 Percutaneous Lead Trial Kit',
    recommendedSubstitute: 'Medtronic Contracted Trial Formulary Pack',
    potentialUnitSavings: 260.0,
    potentialTotalSavings: 2600.0,
    wasteRatePct: 1.8,
    wasteCostTotal: 300.0,
    varianceStatus: 'EFFICIENT'
  }
];

export default {
  VARIANCE_STATUSES,
  IMPLANT_STANDARDS,
  calculateUnitVariance,
  calculateVariancePct,
  classifyVarianceStatus,
  calculateTotalExcessSpend,
  calculatePotentialSavings,
  calculateSterileWaste,
  calculateFacilityImplantKpis,
  SEED_SURGEON_IMPLANT_VARIANCES
};
