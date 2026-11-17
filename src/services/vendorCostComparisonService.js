/**
 * ==============================================================================
 * Phase B8: Vendor Cost Comparison Service
 * Module 11: Surgeon & Clinical Intelligence / Supply Chain & Materials Management
 * Description: Deterministic cross-vendor price comparison engine by implant,
 *              CPT, surgeon, and facility. Analyzes unit cost variance,
 *              contract price compliance, rebate-adjusted net acquisition costs,
 *              physician brand loyalties, and construct standardization savings.
 * ==============================================================================
 */

export const VENDOR_VALUE_GRADES = {
  TIER_1_PREFERRED: {
    key: 'TIER_1_PREFERRED',
    label: 'Tier 1 Preferred',
    description: 'Lowest net construct cost, ≥ 95% contract compliance, integrated volume rebates',
    color: '#059669',
    badgeBg: 'rgba(5, 150, 105, 0.12)',
    badgeBorder: 'rgba(5, 150, 105, 0.35)'
  },
  COMPETITIVE_STANDARD: {
    key: 'COMPETITIVE_STANDARD',
    label: 'Competitive Standard',
    description: 'Standard contracted pricing, 85 - 94% compliance, moderate cost variance (≤ 10%)',
    color: '#0284c7',
    badgeBg: 'rgba(2, 132, 199, 0.12)',
    badgeBorder: 'rgba(2, 132, 199, 0.35)'
  },
  COST_DISADVANTAGE: {
    key: 'COST_DISADVANTAGE',
    label: 'Cost Disadvantage',
    description: 'Premium pricing (10.1 - 25% above benchmark), minimal rebate yields or terms',
    color: '#d97706',
    badgeBg: 'rgba(217, 119, 6, 0.12)',
    badgeBorder: 'rgba(217, 119, 6, 0.35)'
  },
  OFF_CONTRACT_EXPENSIVE: {
    key: 'OFF_CONTRACT_EXPENSIVE',
    label: 'Off-Contract Rogue',
    description: 'Uncontracted procurement, > 25% premium above benchmark, no warranty or price cap',
    color: '#dc2626',
    badgeBg: 'rgba(220, 38, 38, 0.12)',
    badgeBorder: 'rgba(220, 38, 38, 0.35)'
  }
};

export const COMPARISON_BENCHMARKS = {
  MAX_ACCEPTABLE_PRICE_VARIANCE_PCT: 10.0,
  MIN_CONTRACT_COMPLIANCE_RATE: 90.0,
  TARGET_OFF_CONTRACT_SPEND_PCT: 0.0
};

/**
 * Calculate Unit Cost Variance ($)
 * Actual Construct Price less Facility Benchmark Price
 */
export function calculateUnitCostVariance(actualPrice = 0, benchmarkPrice = 0) {
  const variance = (actualPrice || 0) - (benchmarkPrice || 0);
  return Number(variance.toFixed(2));
}

/**
 * Calculate Price Variance Percentage (%)
 * ((Actual - Benchmark) / Benchmark) * 100
 */
export function calculatePriceVariancePct(actualPrice = 0, benchmarkPrice = 0) {
  if (!benchmarkPrice || benchmarkPrice <= 0) return 0.0;
  const pct = (((actualPrice || 0) - benchmarkPrice) / benchmarkPrice) * 100;
  return Number(Math.max(-100, Math.min(500, pct)).toFixed(2));
}

/**
 * Calculate Potential Annual Standardization Savings ($)
 * max(0, CurrentPrice - TargetPrice) * CaseVolume
 */
export function calculatePotentialSavings(currentPrice = 0, targetPrice = 0, volume = 0) {
  const delta = Math.max(0, (currentPrice || 0) - (targetPrice || 0));
  const savings = delta * (volume || 0);
  return Number(savings.toFixed(2));
}

/**
 * Calculate Contract Price Compliance Rate (%)
 * (CompliantInvoices / TotalInvoices) * 100
 */
export function calculateContractComplianceRate(compliantInvoices = 0, totalInvoices = 0) {
  if (!totalInvoices || totalInvoices <= 0) return 0.0;
  const rate = ((compliantInvoices || 0) / totalInvoices) * 100;
  return Number(Math.max(0, Math.min(100, rate)).toFixed(2));
}

/**
 * Calculate Effective Net Acquisition Price ($)
 * Invoice Price less Rebate Per Unit
 */
export function calculateEffectiveNetPrice(invoicePrice = 0, rebatePerUnit = 0) {
  const net = Math.max(0, (invoicePrice || 0) - (rebatePerUnit || 0));
  return Number(net.toFixed(2));
}

/**
 * Classify Vendor Value Grade
 */
export function classifyVendorValueGrade(costVariancePct = 0, complianceRate = 0, isContracted = true) {
  if (!isContracted || costVariancePct > 25.0) {
    return 'OFF_CONTRACT_EXPENSIVE';
  }
  if (costVariancePct > 10.0 || complianceRate < 85.0) {
    return 'COST_DISADVANTAGE';
  }
  if (costVariancePct <= 2.0 && complianceRate >= 95.0) {
    return 'TIER_1_PREFERRED';
  }
  return 'COMPETITIVE_STANDARD';
}

/**
 * Aggregate Facility-Wide Vendor Cost Comparison KPIs
 */
export function calculateFacilityVendorKpis(comparisonList = []) {
  if (!comparisonList || comparisonList.length === 0) {
    return {
      totalImplantSpend: 0.0,
      totalPotentialSavings: 0.0,
      maxPriceSpreadPct: 0.0,
      offContractSpendDollars: 0.0,
      evaluatedConstructsCount: 0,
      evaluatedVendorsCount: 0,
      gradeDistribution: {
        TIER_1_PREFERRED: 0,
        COMPETITIVE_STANDARD: 0,
        COST_DISADVANTAGE: 0,
        OFF_CONTRACT_EXPENSIVE: 0
      }
    };
  }

  let totalImplantSpend = 0.0;
  let totalPotentialSavings = 0.0;
  let maxPriceSpreadPct = 0.0;
  let offContractSpendDollars = 0.0;

  const constructSet = new Set();
  const vendorSet = new Set();
  const gradeDistribution = {
    TIER_1_PREFERRED: 0,
    COMPETITIVE_STANDARD: 0,
    COST_DISADVANTAGE: 0,
    OFF_CONTRACT_EXPENSIVE: 0
  };

  comparisonList.forEach(item => {
    const spend = item.annualSpendDollars || 0;
    const savings = item.potentialSavingsDollars || 0;
    const varPct = item.costVariancePct || 0;

    totalImplantSpend += spend;
    totalPotentialSavings += savings;
    if (varPct > maxPriceSpreadPct) {
      maxPriceSpreadPct = varPct;
    }

    if (!item.isContracted) {
      offContractSpendDollars += spend;
    }

    if (item.constructCategory) {
      constructSet.add(item.constructCategory);
    }
    if (item.vendorCode) {
      vendorSet.add(item.vendorCode);
    }

    const grade = item.valueGrade || 'COMPETITIVE_STANDARD';
    if (gradeDistribution[grade] !== undefined) {
      gradeDistribution[grade]++;
    }
  });

  return {
    totalImplantSpend: Number(totalImplantSpend.toFixed(2)),
    totalPotentialSavings: Number(totalPotentialSavings.toFixed(2)),
    maxPriceSpreadPct: Number(maxPriceSpreadPct.toFixed(2)),
    offContractSpendDollars: Number(offContractSpendDollars.toFixed(2)),
    evaluatedConstructsCount: constructSet.size,
    evaluatedVendorsCount: vendorSet.size,
    gradeDistribution
  };
}

/**
 * 10 Comprehensive Surgical Constructs with Cross-Vendor Comparisons
 */
export const SEED_VENDOR_COST_COMPARISONS = [
  {
    constructCategory: 'TOTAL_KNEE',
    cptCode: '27447',
    procedureName: 'Total Knee Arthroplasty (TKA)',
    specialty: 'Orthopedics',
    vendorCode: 'ZIMMER_BIOMET',
    vendorName: 'Zimmer Biomet (Persona Knee)',
    annualCaseVolume: 180,
    avgConstructCost: 2850.0,
    facilityBenchmarkCost: 2850.0,
    costVarianceDollars: 0.0,
    costVariancePct: 0.0,
    annualSpendDollars: 513000.0,
    potentialSavingsDollars: 0.0,
    contractComplianceRatePct: 98.5,
    rebateYieldPerUnit: 150.0,
    effectiveNetCost: 2700.0,
    isContracted: true,
    valueGrade: 'TIER_1_PREFERRED',
    competingQuotes: [
      { vendorName: 'Zimmer Biomet', constructCost: 2850.0, varianceVsBenchmark: 0.0, contractTier: 'Tier 1 Preferred' },
      { vendorName: 'Stryker Orthopaedics (Triathlon)', constructCost: 3250.0, varianceVsBenchmark: 400.0, contractTier: 'Tier 2 Standard' },
      { vendorName: 'DePuy Synthes (Attune)', constructCost: 3580.0, varianceVsBenchmark: 730.0, contractTier: 'Off-Contract Non-Committed' }
    ]
  },
  {
    constructCategory: 'TOTAL_KNEE',
    cptCode: '27447',
    procedureName: 'Total Knee Arthroplasty (TKA)',
    specialty: 'Orthopedics',
    vendorCode: 'STRYKER_ORTHO',
    vendorName: 'Stryker Orthopaedics (Triathlon Knee)',
    annualCaseVolume: 110,
    avgConstructCost: 3250.0,
    facilityBenchmarkCost: 2850.0,
    costVarianceDollars: 400.0,
    costVariancePct: 14.04,
    annualSpendDollars: 357500.0,
    potentialSavingsDollars: 44000.0,
    contractComplianceRatePct: 91.2,
    rebateYieldPerUnit: 80.0,
    effectiveNetCost: 3170.0,
    isContracted: true,
    valueGrade: 'COST_DISADVANTAGE',
    competingQuotes: [
      { vendorName: 'Zimmer Biomet', constructCost: 2850.0, varianceVsBenchmark: 0.0, contractTier: 'Tier 1 Preferred' },
      { vendorName: 'Stryker Orthopaedics', constructCost: 3250.0, varianceVsBenchmark: 400.0, contractTier: 'Tier 2 Standard' },
      { vendorName: 'DePuy Synthes', constructCost: 3580.0, varianceVsBenchmark: 730.0, contractTier: 'Off-Contract Non-Committed' }
    ]
  },
  {
    constructCategory: 'ROTATOR_CUFF',
    cptCode: '29827',
    procedureName: 'Rotator Cuff Repair Arthroscopic',
    specialty: 'Orthopedics',
    vendorCode: 'SMITH_NEPHEW',
    vendorName: 'Smith & Nephew (HEALICOIL & TWINFIX)',
    annualCaseVolume: 85,
    avgConstructCost: 1150.0,
    facilityBenchmarkCost: 1150.0,
    costVarianceDollars: 0.0,
    costVariancePct: 0.0,
    annualSpendDollars: 97750.0,
    potentialSavingsDollars: 0.0,
    contractComplianceRatePct: 96.0,
    rebateYieldPerUnit: 60.0,
    effectiveNetCost: 1090.0,
    isContracted: true,
    valueGrade: 'TIER_1_PREFERRED',
    competingQuotes: [
      { vendorName: 'Smith & Nephew', constructCost: 1150.0, varianceVsBenchmark: 0.0, contractTier: 'Tier 1 Preferred' },
      { vendorName: 'Arthrex (SwiveLock / FiberTape)', constructCost: 1480.0, varianceVsBenchmark: 330.0, contractTier: 'Tier 2 Standard' },
      { vendorName: 'Stryker Sports Med', constructCost: 1520.0, varianceVsBenchmark: 370.0, contractTier: 'Off-Contract Non-Committed' }
    ]
  },
  {
    constructCategory: 'ROTATOR_CUFF',
    cptCode: '29827',
    procedureName: 'Rotator Cuff Repair Arthroscopic',
    specialty: 'Orthopedics',
    vendorCode: 'ARTHREX_CORP',
    vendorName: 'Arthrex (SpeedBridge SwiveLock / FiberTape)',
    annualCaseVolume: 110,
    avgConstructCost: 1480.0,
    facilityBenchmarkCost: 1150.0,
    costVarianceDollars: 330.0,
    costVariancePct: 28.7,
    annualSpendDollars: 162800.0,
    potentialSavingsDollars: 36300.0,
    contractComplianceRatePct: 88.4,
    rebateYieldPerUnit: 40.0,
    effectiveNetCost: 1440.0,
    isContracted: true,
    valueGrade: 'COST_DISADVANTAGE',
    competingQuotes: [
      { vendorName: 'Smith & Nephew', constructCost: 1150.0, varianceVsBenchmark: 0.0, contractTier: 'Tier 1 Preferred' },
      { vendorName: 'Arthrex', constructCost: 1480.0, varianceVsBenchmark: 330.0, contractTier: 'Tier 2 Standard' },
      { vendorName: 'Stryker Sports Med', constructCost: 1520.0, varianceVsBenchmark: 370.0, contractTier: 'Off-Contract Non-Committed' }
    ]
  },
  {
    constructCategory: 'CATARACT_IOL',
    cptCode: '66984',
    procedureName: 'Cataract Surgery w/ IOL Insertion',
    specialty: 'Ophthalmology',
    vendorCode: 'ALCON_SURGICAL',
    vendorName: 'Alcon Surgical (AcrySof IQ Monofocal)',
    annualCaseVolume: 480,
    avgConstructCost: 280.0,
    facilityBenchmarkCost: 280.0,
    costVarianceDollars: 0.0,
    costVariancePct: 0.0,
    annualSpendDollars: 134400.0,
    potentialSavingsDollars: 0.0,
    contractComplianceRatePct: 99.2,
    rebateYieldPerUnit: 25.0,
    effectiveNetCost: 255.0,
    isContracted: true,
    valueGrade: 'TIER_1_PREFERRED',
    competingQuotes: [
      { vendorName: 'Alcon Surgical', constructCost: 280.0, varianceVsBenchmark: 0.0, contractTier: 'Tier 1 Preferred' },
      { vendorName: 'Johnson & Johnson Vision (Tecnis)', constructCost: 310.0, varianceVsBenchmark: 30.0, contractTier: 'Tier 2 Standard' },
      { vendorName: 'Bausch + Lomb (enVista)', constructCost: 340.0, varianceVsBenchmark: 60.0, contractTier: 'Off-Contract Non-Committed' }
    ]
  },
  {
    constructCategory: 'TOTAL_HIP',
    cptCode: '27130',
    procedureName: 'Total Hip Arthroplasty (THA)',
    specialty: 'Orthopedics',
    vendorCode: 'ZIMMER_BIOMET',
    vendorName: 'Zimmer Biomet (G7 Acetabular & Avenir Stem)',
    annualCaseVolume: 120,
    avgConstructCost: 3450.0,
    facilityBenchmarkCost: 3450.0,
    costVarianceDollars: 0.0,
    costVariancePct: 0.0,
    annualSpendDollars: 414000.0,
    potentialSavingsDollars: 0.0,
    contractComplianceRatePct: 97.5,
    rebateYieldPerUnit: 180.0,
    effectiveNetCost: 3270.0,
    isContracted: true,
    valueGrade: 'TIER_1_PREFERRED',
    competingQuotes: [
      { vendorName: 'Zimmer Biomet', constructCost: 3450.0, varianceVsBenchmark: 0.0, contractTier: 'Tier 1 Preferred' },
      { vendorName: 'Stryker Orthopaedics (Accolade II)', constructCost: 3890.0, varianceVsBenchmark: 440.0, contractTier: 'Tier 2 Standard' },
      { vendorName: 'DePuy Synthes (Pinnacle/Corail)', constructCost: 4120.0, varianceVsBenchmark: 670.0, contractTier: 'Off-Contract Non-Committed' }
    ]
  },
  {
    constructCategory: 'ACDF_SPINE',
    cptCode: '22551',
    procedureName: 'Anterior Cervical Discectomy & Fusion (ACDF)',
    specialty: 'Spine Surgery',
    vendorCode: 'STRYKER_SPINE',
    vendorName: 'Stryker Spine (Caspar Plate & AVS PEEK)',
    annualCaseVolume: 65,
    avgConstructCost: 3600.0,
    facilityBenchmarkCost: 3600.0,
    costVarianceDollars: 0.0,
    costVariancePct: 0.0,
    annualSpendDollars: 234000.0,
    potentialSavingsDollars: 0.0,
    contractComplianceRatePct: 94.0,
    rebateYieldPerUnit: 200.0,
    effectiveNetCost: 3400.0,
    isContracted: true,
    valueGrade: 'TIER_1_PREFERRED',
    competingQuotes: [
      { vendorName: 'Stryker Spine', constructCost: 3600.0, varianceVsBenchmark: 0.0, contractTier: 'Tier 1 Preferred' },
      { vendorName: 'Medtronic Spine (Atlantis)', constructCost: 3950.0, varianceVsBenchmark: 350.0, contractTier: 'Tier 2 Standard' },
      { vendorName: 'Globus Medical (Coalition)', constructCost: 4550.0, varianceVsBenchmark: 950.0, contractTier: 'Off-Contract Non-Committed' }
    ]
  },
  {
    constructCategory: 'ACDF_SPINE',
    cptCode: '22551',
    procedureName: 'Anterior Cervical Discectomy & Fusion (ACDF)',
    specialty: 'Spine Surgery',
    vendorCode: 'GLOBUS_MEDICAL',
    vendorName: 'Globus Medical (Coalition AGX Stand-Alone)',
    annualCaseVolume: 35,
    avgConstructCost: 4550.0,
    facilityBenchmarkCost: 3600.0,
    costVarianceDollars: 950.0,
    costVariancePct: 26.39,
    annualSpendDollars: 159250.0,
    potentialSavingsDollars: 33250.0,
    contractComplianceRatePct: 78.0,
    rebateYieldPerUnit: 0.0,
    effectiveNetCost: 4550.0,
    isContracted: false,
    valueGrade: 'OFF_CONTRACT_EXPENSIVE',
    competingQuotes: [
      { vendorName: 'Stryker Spine', constructCost: 3600.0, varianceVsBenchmark: 0.0, contractTier: 'Tier 1 Preferred' },
      { vendorName: 'Medtronic Spine', constructCost: 3950.0, varianceVsBenchmark: 350.0, contractTier: 'Tier 2 Standard' },
      { vendorName: 'Globus Medical', constructCost: 4550.0, varianceVsBenchmark: 950.0, contractTier: 'Off-Contract Non-Committed' }
    ]
  },
  {
    constructCategory: 'ACL_RECONSTRUCTION',
    cptCode: '29888',
    procedureName: 'ACL Reconstruction Arthroscopic',
    specialty: 'Orthopedics / Sports Med',
    vendorCode: 'SMITH_NEPHEW',
    vendorName: 'Smith & Nephew (Endobutton CL & Biosure)',
    annualCaseVolume: 50,
    avgConstructCost: 1490.0,
    facilityBenchmarkCost: 1490.0,
    costVarianceDollars: 0.0,
    costVariancePct: 0.0,
    annualSpendDollars: 74500.0,
    potentialSavingsDollars: 0.0,
    contractComplianceRatePct: 96.5,
    rebateYieldPerUnit: 75.0,
    effectiveNetCost: 1415.0,
    isContracted: true,
    valueGrade: 'TIER_1_PREFERRED',
    competingQuotes: [
      { vendorName: 'Smith & Nephew', constructCost: 1490.0, varianceVsBenchmark: 0.0, contractTier: 'Tier 1 Preferred' },
      { vendorName: 'Arthrex (TightRope RT)', constructCost: 1850.0, varianceVsBenchmark: 360.0, contractTier: 'Tier 2 Standard' },
      { vendorName: 'MTF Biologics (Allograft Tendon)', constructCost: 2100.0, varianceVsBenchmark: 610.0, contractTier: 'Off-Contract Non-Committed' }
    ]
  },
  {
    constructCategory: 'SINUS_BALLOON',
    cptCode: '31295',
    procedureName: 'Sinus Balloon Dilation Maxillary',
    specialty: 'Otolaryngology (ENT)',
    vendorCode: 'ACCLARENT_JNJ',
    vendorName: 'Acclarent / J&J (Relieva Ultima Balloon)',
    annualCaseVolume: 40,
    avgConstructCost: 1850.0,
    facilityBenchmarkCost: 1850.0,
    costVarianceDollars: 0.0,
    costVariancePct: 0.0,
    annualSpendDollars: 74000.0,
    potentialSavingsDollars: 0.0,
    contractComplianceRatePct: 93.5,
    rebateYieldPerUnit: 100.0,
    effectiveNetCost: 1750.0,
    isContracted: true,
    valueGrade: 'TIER_1_PREFERRED',
    competingQuotes: [
      { vendorName: 'Acclarent / J&J', constructCost: 1850.0, varianceVsBenchmark: 0.0, contractTier: 'Tier 1 Preferred' },
      { vendorName: 'Entellus / Stryker (XprESS)', constructCost: 2150.0, varianceVsBenchmark: 300.0, contractTier: 'Tier 2 Standard' }
    ]
  }
];

/**
 * Seed Itemized SKU Catalog with Invoice vs Contract Price Audit
 */
export const SEED_VENDOR_SKU_PRICING = [
  {
    skuCode: 'ZB-PER-FEM-4L',
    productName: 'Persona Knee Femoral Component Size 4 Left',
    constructCategory: 'TOTAL_KNEE',
    vendorCode: 'ZIMMER_BIOMET',
    vendorName: 'Zimmer Biomet',
    listPrice: 1650.0,
    contractedTierPrice: 1220.0,
    actualInvoicePrice: 1220.0,
    invoiceVarianceDollars: 0.0,
    annualUnitsUsed: 180,
    isConsignment: true
  },
  {
    skuCode: 'STR-TRI-FEM-5',
    productName: 'Triathlon Knee Femoral Component Size 5 CR',
    constructCategory: 'TOTAL_KNEE',
    vendorCode: 'STRYKER_ORTHO',
    vendorName: 'Stryker Orthopaedics',
    listPrice: 1780.0,
    contractedTierPrice: 1340.0,
    actualInvoicePrice: 1410.0,
    invoiceVarianceDollars: 70.0,
    annualUnitsUsed: 110,
    isConsignment: true
  },
  {
    skuCode: 'SN-HL-55-SA',
    productName: 'HEALICOIL PK Suture Anchor 5.5mm w/ Dual Ultrabraid',
    constructCategory: 'ROTATOR_CUFF',
    vendorCode: 'SMITH_NEPHEW',
    vendorName: 'Smith & Nephew',
    listPrice: 620.0,
    contractedTierPrice: 385.0,
    actualInvoicePrice: 385.0,
    invoiceVarianceDollars: 0.0,
    annualUnitsUsed: 170,
    isConsignment: true
  },
  {
    skuCode: 'ARTH-SW-475',
    productName: 'SwiveLock C BioComposite 4.75mm Anchor',
    constructCategory: 'ROTATOR_CUFF',
    vendorCode: 'ARTHREX_CORP',
    vendorName: 'Arthrex',
    listPrice: 695.0,
    contractedTierPrice: 495.0,
    actualInvoicePrice: 535.0,
    invoiceVarianceDollars: 40.0,
    annualUnitsUsed: 220,
    isConsignment: false
  },
  {
    skuCode: 'ALC-SN60WF',
    productName: 'AcrySof IQ Aspheric Monofocal UV Posterior IOL',
    constructCategory: 'CATARACT_IOL',
    vendorCode: 'ALCON_SURGICAL',
    vendorName: 'Alcon Surgical',
    listPrice: 420.0,
    contractedTierPrice: 280.0,
    actualInvoicePrice: 280.0,
    invoiceVarianceDollars: 0.0,
    annualUnitsUsed: 480,
    isConsignment: true
  },
  {
    skuCode: 'GLOB-COAL-AGX',
    productName: 'Coalition AGX Integrated Cervical Plate-Spacer 14x12',
    constructCategory: 'ACDF_SPINE',
    vendorCode: 'GLOBUS_MEDICAL',
    vendorName: 'Globus Medical',
    listPrice: 5200.0,
    contractedTierPrice: 4100.0,
    actualInvoicePrice: 4550.0,
    invoiceVarianceDollars: 450.0,
    annualUnitsUsed: 35,
    isConsignment: false
  }
];

/**
 * Seed Surgeon Sourcing Preferences and Brand Loyalty Matrix
 */
export const SEED_SURGEON_VENDOR_PREFERENCES = [
  {
    surgeonId: 101,
    surgeonName: 'Dr. Marcus Vance',
    cptCode: '27447',
    primaryVendorCode: 'ZIMMER_BIOMET',
    primaryVendorName: 'Zimmer Biomet',
    vendorVolumeSharePct: 92.5,
    avgSurgeonConstructCost: 2850.0,
    facilityTier1Cost: 2850.0,
    excessSpendPerCase: 0.0,
    potentialAnnualSavings: 0.0,
    notes: 'Aligned with contracted Tier 1 Zimmer Biomet construct'
  },
  {
    surgeonId: 104,
    surgeonName: 'Dr. Aaron Jacobs',
    cptCode: '27447',
    primaryVendorCode: 'STRYKER_ORTHO',
    primaryVendorName: 'Stryker Orthopaedics',
    vendorVolumeSharePct: 88.0,
    avgSurgeonConstructCost: 3250.0,
    facilityTier1Cost: 2850.0,
    excessSpendPerCase: 400.0,
    potentialAnnualSavings: 36000.0,
    notes: 'Preference card requests off-tier Stryker Triathlon construct ($400 excess/case)'
  },
  {
    surgeonId: 102,
    surgeonName: 'Dr. Elena Rostova',
    cptCode: '29827',
    primaryVendorCode: 'ARTHREX_CORP',
    primaryVendorName: 'Arthrex',
    vendorVolumeSharePct: 84.6,
    avgSurgeonConstructCost: 1480.0,
    facilityTier1Cost: 1150.0,
    excessSpendPerCase: 330.0,
    potentialAnnualSavings: 28050.0,
    notes: 'Uses 4-anchor double-row Arthrex construct vs contracted Smith & Nephew'
  },
  {
    surgeonId: 103,
    surgeonName: 'Dr. Priya Patel',
    cptCode: '66984',
    primaryVendorCode: 'ALCON_SURGICAL',
    primaryVendorName: 'Alcon Surgical',
    vendorVolumeSharePct: 96.0,
    avgSurgeonConstructCost: 280.0,
    facilityTier1Cost: 280.0,
    excessSpendPerCase: 0.0,
    potentialAnnualSavings: 0.0,
    notes: '100% compliant with Tier 1 contracted Alcon monofocal lens formulary'
  },
  {
    surgeonId: 105,
    surgeonName: 'Dr. Gregory House',
    cptCode: '22551',
    primaryVendorCode: 'GLOBUS_MEDICAL',
    primaryVendorName: 'Globus Medical',
    vendorVolumeSharePct: 91.4,
    avgSurgeonConstructCost: 4550.0,
    facilityTier1Cost: 3600.0,
    excessSpendPerCase: 950.0,
    potentialAnnualSavings: 30400.0,
    notes: 'Demands off-contract Globus Coalition stand-alone cage ($950 excess/case)'
  }
];
