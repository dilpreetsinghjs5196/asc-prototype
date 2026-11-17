/**
 * ==============================================================================
 * Phase B4: Payer Contract Performance Service
 * Module 11: Surgeon & Clinical Intelligence / Executive Intelligence
 * Description: Deterministic calculations for contract-vs-actual reimbursement
 *              reconciliation, contract compliance yield, fee leakage variance,
 *              renewal notice countdowns, and negotiation leverage playbooks.
 * ==============================================================================
 */

export const REIMBURSEMENT_METHODOLOGIES = {
  FEE_SCHEDULE: {
    key: 'FEE_SCHEDULE',
    label: 'Commercial Fee Schedule',
    description: 'Line-item negotiated rate table per CPT code'
  },
  PERCENT_OF_MEDICARE: {
    key: 'PERCENT_OF_MEDICARE',
    label: '% of Medicare ASC Base',
    description: 'Multiplier applied to statutory Medicare base addenda'
  },
  CASE_RATE: {
    key: 'CASE_RATE',
    label: 'Fixed Case Rate Package',
    description: 'All-inclusive procedural facility bundle'
  },
  PERCENT_OF_CHARGES: {
    key: 'PERCENT_OF_CHARGES',
    label: '% of Billed Charges',
    description: 'Discounted percentage off master chargemaster rate'
  }
};

export const RENEGOTIATION_STATUSES = {
  CRITICAL_RENEWAL_ALERT: {
    key: 'CRITICAL_RENEWAL_ALERT',
    label: 'Critical Notice Alert (≤ 60d)',
    color: '#dc2626',
    badgeBg: 'rgba(220, 38, 38, 0.12)',
    badgeBorder: 'rgba(220, 38, 38, 0.35)'
  },
  RENEGOTIATION_WINDOW_OPEN: {
    key: 'RENEGOTIATION_WINDOW_OPEN',
    label: 'Window Open (61-120d)',
    color: '#d97706',
    badgeBg: 'rgba(217, 119, 6, 0.12)',
    badgeBorder: 'rgba(217, 119, 6, 0.35)'
  },
  MONITORING: {
    key: 'MONITORING',
    label: 'Standard Monitoring (> 120d)',
    color: '#059669',
    badgeBg: 'rgba(5, 150, 105, 0.12)',
    badgeBorder: 'rgba(5, 150, 105, 0.35)'
  },
  IN_ACTIVE_BARGAINING: {
    key: 'IN_ACTIVE_BARGAINING',
    label: 'Active Bargaining',
    color: '#0284c7',
    badgeBg: 'rgba(2, 132, 199, 0.12)',
    badgeBorder: 'rgba(2, 132, 199, 0.35)'
  },
  LOCKED_AUTO_RENEWED: {
    key: 'LOCKED_AUTO_RENEWED',
    label: 'Auto-Renewed / Locked',
    color: '#64748b',
    badgeBg: 'rgba(100, 116, 139, 0.12)',
    badgeBorder: 'rgba(100, 116, 139, 0.35)'
  }
};

export const NEGOTIATION_PRIORITIES = {
  CRITICAL: { key: 'CRITICAL', label: 'Critical', color: '#dc2626' },
  HIGH: { key: 'HIGH', label: 'High', color: '#d97706' },
  MEDIUM: { key: 'MEDIUM', label: 'Medium', color: '#0284c7' },
  LOW: { key: 'LOW', label: 'Low', color: '#64748b' }
};

export const CONTRACT_BENCHMARKS = {
  MIN_ACCEPTABLE_YIELD_PCT: 95.0,
  TARGET_IMPLANT_RECOVERY_PCT: 90.0,
  CRITICAL_RENEWAL_NOTICE_DAYS: 60
};

/**
 * Calculate Contract Compliance Yield (%)
 */
export function calculateContractYieldPct(actualAllowed = 0, expectedAllowed = 0) {
  if (expectedAllowed <= 0) return 0.0;
  const yieldPct = (actualAllowed / expectedAllowed) * 100;
  return Number(yieldPct.toFixed(2));
}

/**
 * Calculate Contractual Leakage Variance ($)
 */
export function calculateContractLeakage(expectedAllowed = 0, actualAllowed = 0) {
  const deficit = Math.max(0, expectedAllowed - actualAllowed);
  return Number(deficit.toFixed(2));
}

/**
 * Calculate Days Until Written Renewal Notice Cutoff
 */
export function calculateDaysUntilNoticeCutoff(targetNoticeDate, currentDate = new Date('2026-11-17')) {
  if (!targetNoticeDate) return 0;
  const target = new Date(targetNoticeDate);
  const current = new Date(currentDate);
  const diffMs = target.getTime() - current.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return days;
}

/**
 * Classify Contract Renegotiation Lifecycle Status
 */
export function classifyRenegotiationStatus(daysUntilNoticeCutoff = 0, currentStatus = 'MONITORING') {
  if (currentStatus === 'IN_ACTIVE_BARGAINING' || currentStatus === 'LOCKED_AUTO_RENEWED') {
    return currentStatus;
  }
  if (daysUntilNoticeCutoff <= CONTRACT_BENCHMARKS.CRITICAL_RENEWAL_NOTICE_DAYS) {
    return 'CRITICAL_RENEWAL_ALERT';
  }
  if (daysUntilNoticeCutoff <= 120) {
    return 'RENEGOTIATION_WINDOW_OPEN';
  }
  return 'MONITORING';
}

/**
 * Calculate High-Cost Implant Carve-Out Recovery Rate (%)
 */
export function calculateImplantCarveoutRecoveryPct(recovered = 0, spend = 0) {
  if (spend <= 0) return 0.0;
  const pct = (recovered / spend) * 100;
  return Number(pct.toFixed(2));
}

/**
 * Calculate Projected Annual Revenue Uplift ($)
 */
export function calculatePotentialAnnualUplift(actualAllowed = 0, proposedRateAdjustmentPct = 0) {
  if (actualAllowed <= 0 || proposedRateAdjustmentPct <= 0) return 0.0;
  const uplift = actualAllowed * (proposedRateAdjustmentPct / 100);
  return Number(uplift.toFixed(2));
}

/**
 * Calculate Negotiation Leverage Score (0 – 100)
 */
export function calculateNegotiationLeverageScore(
  volumeSharePct = 0,
  yieldDeficitPct = 0,
  marginPerOrHour = 0,
  daysUntilNotice = 90
) {
  // Notice urgency (closer to cutoff = higher urgency)
  const normNotice = Math.max(0, Math.min(100, ((120 - Math.min(120, daysUntilNotice)) / 120) * 100));
  // Yield deficit (larger underpayment = higher leverage argument)
  const normYield = Math.max(0, Math.min(100, yieldDeficitPct * 5));
  // Volume share (higher facility case volume = greater network leverage)
  const normVol = Math.max(0, Math.min(100, volumeSharePct * 3));
  // Margin per OR-hour
  const normMargin = Math.max(0, Math.min(100, (marginPerOrHour / 2500) * 100));

  const score = (0.35 * normNotice) + (0.30 * normYield) + (0.20 * normVol) + (0.15 * normMargin);
  return Number(Math.min(100, Math.max(0, score)).toFixed(1));
}

/**
 * Aggregate Facility-Wide Payer Contract KPIs
 */
export function calculateFacilityContractKpis(contractList = []) {
  if (!contractList || contractList.length === 0) {
    return {
      totalExpectedAllowed: 0,
      totalActualAllowed: 0,
      overallYieldPct: 0.0,
      totalLeakage: 0,
      activeRenewalAlertsCount: 0,
      totalPotentialAnnualUplift: 0,
      avgImplantRecoveryPct: 0.0,
      contractsCount: 0
    };
  }

  let totalExpected = 0;
  let totalActual = 0;
  let totalLeakage = 0;
  let activeAlerts = 0;
  let totalUplift = 0;
  let totalImplantRecoverySum = 0;

  contractList.forEach(c => {
    totalExpected += c.contractExpectedAllowed || 0;
    totalActual += c.actualAllowedAmount || 0;
    totalLeakage += c.contractLeakageVariance || 0;
    totalUplift += c.potentialAnnualUplift || 0;
    totalImplantRecoverySum += c.implantCarveoutRecoveryPct || 0;

    if (['CRITICAL_RENEWAL_ALERT', 'RENEGOTIATION_WINDOW_OPEN'].includes(c.renegotiationStatus)) {
      activeAlerts += 1;
    }
  });

  const overallYieldPct = calculateContractYieldPct(totalActual, totalExpected);
  const avgImplantRecoveryPct = Number((totalImplantRecoverySum / contractList.length).toFixed(1));

  return {
    totalExpectedAllowed: Math.round(totalExpected),
    totalActualAllowed: Math.round(totalActual),
    overallYieldPct,
    totalLeakage: Math.round(totalLeakage),
    activeRenewalAlertsCount: activeAlerts,
    totalPotentialAnnualUplift: Math.round(totalUplift),
    avgImplantRecoveryPct,
    contractsCount: contractList.length
  };
}

/**
 * Seed Dataset: 8 Major Commercial & Managed Care Contracts
 */
export const SEED_PAYER_CONTRACT_PERFORMANCE = [
  {
    id: 'pcp-001',
    contractNumber: 'BCBS-ASC-2024',
    contractName: 'Blue Cross Blue Shield Commercial Direct',
    payerCode: 'PAY-BCBS',
    payerName: 'Blue Cross Blue Shield (Commercial)',
    reimbursementMethodology: 'FEE_SCHEDULE',
    effectiveDate: '2024-01-01',
    expirationDate: '2025-03-31',
    renewalNoticeDeadline: '2025-01-01',
    daysUntilNoticeCutoff: 45,
    renegotiationStatus: 'CRITICAL_RENEWAL_ALERT',
    totalCasesVolume: 520,
    totalBilledCharges: 2450000.0,
    contractExpectedAllowed: 1860000.0,
    actualAllowedAmount: 1788500.0,
    netCollections: 1788500.0,
    contractComplianceYieldPct: 96.16,
    contractLeakageVariance: 71500.0,
    implantCarveoutSpend: 184000.0,
    implantCarveoutRecovered: 169280.0,
    implantCarveoutRecoveryPct: 92.0,
    avgContributionMarginPerOrHour: 1980.0,
    negotiationLeverageScore: 84.5,
    negotiationPriority: 'CRITICAL',
    proposedRateAdjustmentPct: 7.5,
    potentialAnnualUplift: 134138.0,
    primaryNegotiationTarget: 'Increase orthopedic fee schedule +7.5% and eliminate unbundling on 29827.',
    contractExhibits: [
      { cptCode: '27447', name: 'Total Knee Arthroplasty', contractRate: 7200.0, actualAllowed: 7200.0, yieldPct: 100.0 },
      { cptCode: '29827', name: 'Rotator Cuff Repair', contractRate: 4600.0, actualAllowed: 4150.0, yieldPct: 90.2 },
      { cptCode: '66984', name: 'Cataract Surgery w/ IOL', contractRate: 1450.0, actualAllowed: 1450.0, yieldPct: 100.0 }
    ]
  },
  {
    id: 'pcp-002',
    contractNumber: 'UHC-OPT-2023',
    contractName: 'UnitedHealthcare Commercial Agreement',
    payerCode: 'PAY-UHC',
    payerName: 'UnitedHealthcare (Commercial & Optum)',
    reimbursementMethodology: 'PERCENT_OF_MEDICARE',
    effectiveDate: '2023-06-01',
    expirationDate: '2025-04-30',
    renewalNoticeDeadline: '2025-02-03',
    daysUntilNoticeCutoff: 78,
    renegotiationStatus: 'RENEGOTIATION_WINDOW_OPEN',
    totalCasesVolume: 410,
    totalBilledCharges: 1860000.0,
    contractExpectedAllowed: 1380000.0,
    actualAllowedAmount: 1246200.0,
    netCollections: 1246200.0,
    contractComplianceYieldPct: 90.3,
    contractLeakageVariance: 133800.0,
    implantCarveoutSpend: 142000.0,
    implantCarveoutRecovered: 110760.0,
    implantCarveoutRecoveryPct: 78.0,
    avgContributionMarginPerOrHour: 1540.0,
    negotiationLeverageScore: 88.2,
    negotiationPriority: 'CRITICAL',
    proposedRateAdjustmentPct: 9.0,
    potentialAnnualUplift: 112158.0,
    primaryNegotiationTarget: 'Bump Medicare multiplier from 195% to 215%; formalize invoice + 12% carve-out.',
    contractExhibits: [
      { cptCode: '29827', name: 'Rotator Cuff Repair', contractRate: 4400.0, actualAllowed: 3820.0, yieldPct: 86.8 },
      { cptCode: '27130', name: 'Total Hip Arthroplasty', contractRate: 7800.0, actualAllowed: 7200.0, yieldPct: 92.3 },
      { cptCode: '63650', name: 'Spinal Cord Stimulator', contractRate: 5100.0, actualAllowed: 4650.0, yieldPct: 91.2 }
    ]
  },
  {
    id: 'pcp-003',
    contractNumber: 'AETNA-COM-2024',
    contractName: 'Aetna Open Choice PPO Agreement',
    payerCode: 'PAY-AETNA',
    payerName: 'Aetna / CVS Health',
    reimbursementMethodology: 'FEE_SCHEDULE',
    effectiveDate: '2024-04-01',
    expirationDate: '2025-06-30',
    renewalNoticeDeadline: '2025-04-05',
    daysUntilNoticeCutoff: 140,
    renegotiationStatus: 'MONITORING',
    totalCasesVolume: 310,
    totalBilledCharges: 1420000.0,
    contractExpectedAllowed: 1040000.0,
    actualAllowedAmount: 994000.0,
    netCollections: 994000.0,
    contractComplianceYieldPct: 95.58,
    contractLeakageVariance: 46000.0,
    implantCarveoutSpend: 98000.0,
    implantCarveoutRecovered: 89180.0,
    implantCarveoutRecoveryPct: 91.0,
    avgContributionMarginPerOrHour: 1820.0,
    negotiationLeverageScore: 52.0,
    negotiationPriority: 'MEDIUM',
    proposedRateAdjustmentPct: 6.0,
    potentialAnnualUplift: 59640.0,
    primaryNegotiationTarget: 'Add pain management bilateral exception and streamline prior authorization.',
    contractExhibits: [
      { cptCode: '29881', name: 'Knee Meniscectomy', contractRate: 2350.0, actualAllowed: 2350.0, yieldPct: 100.0 },
      { cptCode: '64483', name: 'Transforaminal Epidural', contractRate: 1100.0, actualAllowed: 980.0, yieldPct: 89.1 }
    ]
  },
  {
    id: 'pcp-004',
    contractNumber: 'CIGNA-DIRECT-2024',
    contractName: 'Cigna Healthcare Commercial Agreement',
    payerCode: 'PAY-CIGNA',
    payerName: 'Cigna Healthcare',
    reimbursementMethodology: 'FEE_SCHEDULE',
    effectiveDate: '2024-06-01',
    expirationDate: '2025-09-30',
    renewalNoticeDeadline: '2025-06-15',
    daysUntilNoticeCutoff: 210,
    renegotiationStatus: 'MONITORING',
    totalCasesVolume: 260,
    totalBilledCharges: 1150000.0,
    contractExpectedAllowed: 865000.0,
    actualAllowedAmount: 828000.0,
    netCollections: 828000.0,
    contractComplianceYieldPct: 95.72,
    contractLeakageVariance: 37000.0,
    implantCarveoutSpend: 76000.0,
    implantCarveoutRecovered: 69920.0,
    implantCarveoutRecoveryPct: 92.0,
    avgContributionMarginPerOrHour: 1890.0,
    negotiationLeverageScore: 44.0,
    negotiationPriority: 'LOW',
    proposedRateAdjustmentPct: 5.0,
    potentialAnnualUplift: 41400.0,
    primaryNegotiationTarget: 'Harmonize spinal instrumentation fee schedule with market median.',
    contractExhibits: [
      { cptCode: '27447', name: 'Total Knee Arthroplasty', contractRate: 6950.0, actualAllowed: 6950.0, yieldPct: 100.0 },
      { cptCode: '29827', name: 'Rotator Cuff Repair', contractRate: 4300.0, actualAllowed: 4100.0, yieldPct: 95.3 }
    ]
  },
  {
    id: 'pcp-005',
    contractNumber: 'HUMANA-MA-2024',
    contractName: 'Humana Medicare Advantage Agreement',
    payerCode: 'PAY-HUMANA',
    payerName: 'Humana (Medicare Advantage)',
    reimbursementMethodology: 'PERCENT_OF_MEDICARE',
    effectiveDate: '2024-01-01',
    expirationDate: '2025-03-31',
    renewalNoticeDeadline: '2025-01-08',
    daysUntilNoticeCutoff: 52,
    renegotiationStatus: 'CRITICAL_RENEWAL_ALERT',
    totalCasesVolume: 210,
    totalBilledCharges: 890000.0,
    contractExpectedAllowed: 630000.0,
    actualAllowedAmount: 578500.0,
    netCollections: 578500.0,
    contractComplianceYieldPct: 91.83,
    contractLeakageVariance: 51500.0,
    implantCarveoutSpend: 62000.0,
    implantCarveoutRecovered: 52700.0,
    implantCarveoutRecoveryPct: 85.0,
    avgContributionMarginPerOrHour: 1420.0,
    negotiationLeverageScore: 79.4,
    negotiationPriority: 'HIGH',
    proposedRateAdjustmentPct: 8.0,
    potentialAnnualUplift: 46280.0,
    primaryNegotiationTarget: 'Update Medicare ASC baseline from 2022 to 2025 conversion table.',
    contractExhibits: [
      { cptCode: '66984', name: 'Cataract Surgery w/ IOL', contractRate: 1380.0, actualAllowed: 1260.0, yieldPct: 91.3 },
      { cptCode: '29881', name: 'Knee Meniscectomy', contractRate: 2100.0, actualAllowed: 1950.0, yieldPct: 92.9 }
    ]
  },
  {
    id: 'pcp-006',
    contractNumber: 'MOL-MED-2024',
    contractName: 'Molina Medicaid Managed Care',
    payerCode: 'PAY-MEDICAID',
    payerName: 'State Medicaid / Managed Care',
    reimbursementMethodology: 'CASE_RATE',
    effectiveDate: '2024-03-01',
    expirationDate: '2025-08-31',
    renewalNoticeDeadline: '2025-05-25',
    daysUntilNoticeCutoff: 190,
    renegotiationStatus: 'MONITORING',
    totalCasesVolume: 190,
    totalBilledCharges: 620000.0,
    contractExpectedAllowed: 295000.0,
    actualAllowedAmount: 272800.0,
    netCollections: 272800.0,
    contractComplianceYieldPct: 92.47,
    contractLeakageVariance: 22200.0,
    implantCarveoutSpend: 31000.0,
    implantCarveoutRecovered: 24800.0,
    implantCarveoutRecoveryPct: 80.0,
    avgContributionMarginPerOrHour: 980.0,
    negotiationLeverageScore: 36.5,
    negotiationPriority: 'LOW',
    proposedRateAdjustmentPct: 4.0,
    potentialAnnualUplift: 10912.0,
    primaryNegotiationTarget: 'Expand case rate definition to carve out expensive pain stimulator leads.',
    contractExhibits: [
      { cptCode: '66984', name: 'Cataract Surgery w/ IOL', contractRate: 980.0, actualAllowed: 950.0, yieldPct: 96.9 }
    ]
  },
  {
    id: 'pcp-007',
    contractNumber: 'LIBERTY-WC-2023',
    contractName: 'Liberty Mutual Workers Comp Agreement',
    payerCode: 'PAY-WORKCOMP',
    payerName: "Workers' Compensation (Liberty Mutual)",
    reimbursementMethodology: 'PERCENT_OF_CHARGES',
    effectiveDate: '2023-11-01',
    expirationDate: '2025-02-15',
    renewalNoticeDeadline: '2024-12-17',
    daysUntilNoticeCutoff: 30,
    renegotiationStatus: 'CRITICAL_RENEWAL_ALERT',
    totalCasesVolume: 85,
    totalBilledCharges: 540000.0,
    contractExpectedAllowed: 445000.0,
    actualAllowedAmount: 388800.0,
    netCollections: 388800.0,
    contractComplianceYieldPct: 87.37,
    contractLeakageVariance: 56200.0,
    implantCarveoutSpend: 82000.0,
    implantCarveoutRecovered: 65600.0,
    implantCarveoutRecoveryPct: 80.0,
    avgContributionMarginPerOrHour: 2250.0,
    negotiationLeverageScore: 91.5,
    negotiationPriority: 'CRITICAL',
    proposedRateAdjustmentPct: 12.0,
    potentialAnnualUplift: 46656.0,
    primaryNegotiationTarget: 'Transition from % of charges to dedicated surgical fee schedule + 30-day prompt-pay statute.',
    contractExhibits: [
      { cptCode: '29827', name: 'Rotator Cuff Repair', contractRate: 6400.0, actualAllowed: 5500.0, yieldPct: 85.9 },
      { cptCode: '63650', name: 'Spinal Cord Stimulator', contractRate: 7200.0, actualAllowed: 6400.0, yieldPct: 88.9 }
    ]
  },
  {
    id: 'pcp-008',
    contractNumber: 'KSR-HMO-2024',
    contractName: 'Kaiser Permanente Regional Case Rate',
    payerCode: 'PAY-COMMERCIAL',
    payerName: 'Kaiser Permanente HMO',
    reimbursementMethodology: 'CASE_RATE',
    effectiveDate: '2024-05-01',
    expirationDate: '2025-07-31',
    renewalNoticeDeadline: '2025-05-01',
    daysUntilNoticeCutoff: 165,
    renegotiationStatus: 'MONITORING',
    totalCasesVolume: 120,
    totalBilledCharges: 520000.0,
    contractExpectedAllowed: 520000.0,
    actualAllowedAmount: 504400.0,
    netCollections: 504400.0,
    contractComplianceYieldPct: 97.0,
    contractLeakageVariance: 15600.0,
    implantCarveoutSpend: 42000.0,
    implantCarveoutRecovered: 40740.0,
    implantCarveoutRecoveryPct: 97.0,
    avgContributionMarginPerOrHour: 1910.0,
    negotiationLeverageScore: 48.0,
    negotiationPriority: 'MEDIUM',
    proposedRateAdjustmentPct: 5.5,
    potentialAnnualUplift: 27742.0,
    primaryNegotiationTarget: 'Maintain case rate tier and secure volume growth in sports medicine.',
    contractExhibits: [
      { cptCode: '29881', name: 'Knee Meniscectomy', contractRate: 2400.0, actualAllowed: 2360.0, yieldPct: 98.3 }
    ]
  }
];

export default {
  REIMBURSEMENT_METHODOLOGIES,
  RENEGOTIATION_STATUSES,
  NEGOTIATION_PRIORITIES,
  CONTRACT_BENCHMARKS,
  calculateContractYieldPct,
  calculateContractLeakage,
  calculateDaysUntilNoticeCutoff,
  classifyRenegotiationStatus,
  calculateImplantCarveoutRecoveryPct,
  calculatePotentialAnnualUplift,
  calculateNegotiationLeverageScore,
  calculateFacilityContractKpis,
  SEED_PAYER_CONTRACT_PERFORMANCE
};
