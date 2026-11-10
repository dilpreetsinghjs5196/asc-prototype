/**
 * ASC Claim, Remittance & Payment Reconciliation Engine
 * Phase 89: Revenue Cycle Management (RCM)
 * 
 * Four-way matching (Billed Claims, 835 Remittance, Bank Deposits, Patient Liability),
 * deterministic balancing invariants, contractual underpayment detection, and discrepancy handling.
 */

// 1. Reconciliation Match Statuses
export const RECONCILIATION_STATUSES = {
  FULLY_RECONCILED: {
    id: 'FULLY_RECONCILED',
    label: 'Fully Reconciled ($0.00 Variance)',
    badgeClass: 'bg-emerald-950/40 text-emerald-400 border-emerald-800',
    colorToken: 'emerald',
    description: '100% matched across claim, remittance advice, and bank deposit.'
  },
  PARTIALLY_RECONCILED: {
    id: 'PARTIALLY_RECONCILED',
    label: 'Partially Reconciled',
    badgeClass: 'bg-sky-950/40 text-sky-400 border-sky-800',
    colorToken: 'sky',
    description: 'Payment posted but secondary or patient responsibility pending.'
  },
  UNDERPAYMENT_DISCREPANCY: {
    id: 'UNDERPAYMENT_DISCREPANCY',
    label: 'Underpayment Discrepancy',
    badgeClass: 'bg-amber-950/50 text-amber-300 border-amber-700 font-semibold',
    colorToken: 'amber',
    description: 'Carrier reimbursed less than contracted rate without valid CARC code.'
  },
  OVERPAYMENT_DISCREPANCY: {
    id: 'OVERPAYMENT_DISCREPANCY',
    label: 'Overpayment / Duplicate',
    badgeClass: 'bg-amber-950/50 text-amber-300 border-amber-700 font-semibold',
    colorToken: 'amber',
    description: 'Payment exceeds expected allowable; escrow holding required for refund.'
  },
  UNMATCHED_REMITTANCE: {
    id: 'UNMATCHED_REMITTANCE',
    label: 'Unmatched Remittance',
    badgeClass: 'bg-rose-950/50 text-rose-300 border-rose-700 font-bold',
    colorToken: 'rose',
    description: '835 ERA advice received but no matching EFT deposit found in bank.'
  },
  SUSPENSE_UNIDENTIFIED_CASH: {
    id: 'SUSPENSE_UNIDENTIFIED_CASH',
    label: 'Suspense / Unapplied Cash',
    badgeClass: 'bg-rose-950/50 text-rose-300 border-rose-700 font-bold',
    colorToken: 'rose',
    description: 'Bank deposit received without corresponding ERA or claim crosswalk.'
  },
  CLOSED_BALANCED: {
    id: 'CLOSED_BALANCED',
    label: 'Closed & Balanced',
    badgeClass: 'bg-slate-800 text-slate-400 border-slate-700',
    colorToken: 'slate',
    description: 'Account brought to zero balance through validated adjustment or write-off.'
  }
};

// 2. Discrepancy Exception Types
export const DISCREPANCY_TYPES = {
  UNDERPAYMENT_CONTRACT_RATE: {
    id: 'UNDERPAYMENT_CONTRACT_RATE',
    label: 'Contractual Rate Underpayment',
    defaultAction: 'APPEAL_UNDERPAYMENT',
    description: 'Payer paid below contracted fee schedule or applied improper multiple procedure reduction.'
  },
  OVERPAYMENT_DUPLICATE: {
    id: 'OVERPAYMENT_DUPLICATE',
    label: 'Duplicate / Overpayment',
    defaultAction: 'REFUND_OVERPAYMENT',
    description: 'Carrier duplicate claim payment or uncontracted positive fee schedule variance.'
  },
  UNMATCHED_EFT_DEPOSIT: {
    id: 'UNMATCHED_EFT_DEPOSIT',
    label: 'Unmatched Bank Deposit',
    defaultAction: 'MATCH_SUSPENSE_DEPOSIT',
    description: 'Cash credited to lockbox or checking account without EDI 835 trace ID.'
  },
  MISSING_ERA_REMITTANCE: {
    id: 'MISSING_ERA_REMITTANCE',
    label: 'Missing 835 Remittance',
    defaultAction: 'PORTAL_REMITTANCE_SEARCH',
    description: 'Payer claims payment dispatched via EFT but electronic remittance not posted.'
  },
  UNBALANCED_CAS_SPLIT: {
    id: 'UNBALANCED_CAS_SPLIT',
    label: 'Unbalanced CAS Remittance Split',
    defaultAction: 'POST_CONTRACTUAL_CORRECTION',
    description: 'Line charge amount does not balance with paid + adjustments in CLP segment.'
  },
  UNAUTHORIZED_FEE_DISALLOWANCE: {
    id: 'UNAUTHORIZED_FEE_DISALLOWANCE',
    label: 'Unauthorized Fee Disallowance',
    defaultAction: 'APPEAL_UNDERPAYMENT',
    description: 'Silent PPO discount or unauthorized administrative fee reduction applied.'
  }
};

// 3. Discrepancy Resolution Disposition Actions
export const DISPOSITION_ACTIONS = {
  APPEAL_UNDERPAYMENT: {
    id: 'APPEAL_UNDERPAYMENT',
    label: 'Route to Level 1 Underpayment Appeal',
    targetModule: 'APPEALS_WORKFLOW'
  },
  POST_CONTRACTUAL_CORRECTION: {
    id: 'POST_CONTRACTUAL_CORRECTION',
    label: 'Adjust Contractual Allowance Ledger',
    targetModule: 'PAYMENT_ADJUSTMENTS'
  },
  REFUND_OVERPAYMENT: {
    id: 'REFUND_OVERPAYMENT',
    label: 'Initiate Escrow Refund Authorization',
    targetModule: 'PAYMENT_ADJUSTMENTS'
  },
  MATCH_SUSPENSE_DEPOSIT: {
    id: 'MATCH_SUSPENSE_DEPOSIT',
    label: 'Link Unapplied Deposit to Remittance',
    targetModule: 'RECONCILIATION_ENGINE'
  },
  WRITE_OFF: {
    id: 'WRITE_OFF',
    label: 'Authorize Administrative Variance Write-Off',
    targetModule: 'RECONCILIATION_ENGINE'
  }
};

// 4. Deterministic Financial Invariant Calculations
export function calculateReconciliationVariance(billedAmount, paidAmount, contractualAdjAmount = 0.00, patientRespAmount = 0.00) {
  const billed = Number(billedAmount) || 0;
  const paid = Number(paidAmount) || 0;
  const co = Number(contractualAdjAmount) || 0;
  const pr = Number(patientRespAmount) || 0;

  const variance = billed - (paid + co + pr);
  return Number(variance.toFixed(2));
}

export function calculateBankDepositVariance(depositAmount, remittancePaidAmount) {
  const deposit = Number(depositAmount) || 0;
  const remit = Number(remittancePaidAmount) || 0;
  const variance = deposit - remit;
  return Number(variance.toFixed(2));
}

export function calculateExpectedUnderpayment(expectedReimbursement, actualPaidAmount, patientResponsibilityAmount = 0.00) {
  const exp = Number(expectedReimbursement) || 0;
  const paid = Number(actualPaidAmount) || 0;
  const pr = Number(patientResponsibilityAmount) || 0;

  const diff = exp - (paid + pr);
  return Number(Math.max(0, diff).toFixed(2));
}

// 5. Executive KPI Aggregation
export function calculateReconciliationKpis(recordsList = []) {
  let totalBilledDollars = 0;
  let totalReconciledDollars = 0;
  let totalUnderpaymentExposure = 0;
  let totalSuspenseExposure = 0;
  let totalVarianceDollars = 0;
  let fullyReconciledCount = 0;
  let discrepancyCount = 0;

  const statusCounts = {
    FULLY_RECONCILED: 0,
    PARTIALLY_RECONCILED: 0,
    UNDERPAYMENT_DISCREPANCY: 0,
    OVERPAYMENT_DISCREPANCY: 0,
    UNMATCHED_REMITTANCE: 0,
    SUSPENSE_UNIDENTIFIED_CASH: 0,
    CLOSED_BALANCED: 0
  };

  recordsList.forEach(rec => {
    const billed = Number(rec.billedAmount) || 0;
    const paid = Number(rec.remittancePaidAmount) || 0;
    const variance = Math.abs(Number(rec.varianceAmount) || 0);

    totalBilledDollars += billed;
    totalVarianceDollars += variance;

    if (statusCounts[rec.status] !== undefined) {
      statusCounts[rec.status]++;
    }

    if (rec.status === 'FULLY_RECONCILED' || rec.status === 'CLOSED_BALANCED') {
      fullyReconciledCount++;
      totalReconciledDollars += paid;
    }

    if (rec.status === 'UNDERPAYMENT_DISCREPANCY') {
      discrepancyCount++;
      totalUnderpaymentExposure += (Number(rec.underpaymentAmount) || variance);
    }

    if (rec.status === 'SUSPENSE_UNIDENTIFIED_CASH' || rec.status === 'UNMATCHED_REMITTANCE') {
      totalSuspenseExposure += (Number(rec.bankDepositAmount) || paid);
    }
  });

  const totalProcessedDollars = totalReconciledDollars + totalUnderpaymentExposure + totalSuspenseExposure;
  const cleanMatchRatePct = totalProcessedDollars > 0
    ? Number(((totalReconciledDollars / totalProcessedDollars) * 100).toFixed(1))
    : 100.0;

  const benchmarkPassed = cleanMatchRatePct >= 98.0; // Target is >= 98.0%

  return {
    totalBilledDollars: Number(totalBilledDollars.toFixed(2)),
    totalReconciledDollars: Number(totalReconciledDollars.toFixed(2)),
    totalUnderpaymentExposure: Number(totalUnderpaymentExposure.toFixed(2)),
    totalSuspenseExposure: Number(totalSuspenseExposure.toFixed(2)),
    totalVarianceDollars: Number(totalVarianceDollars.toFixed(2)),
    totalRecordsCount: recordsList.length,
    fullyReconciledCount,
    discrepancyCount,
    cleanMatchRatePct,
    benchmarkPassed,
    statusCounts
  };
}

// 6. Baseline Reconciliation Dataset for Simulation & Verification
export function getBaselineReconciliationRecords() {
  return [
    {
      id: 'rec-001',
      facilityId: '00000000-0000-0000-0000-000000000002',
      reconciliationControlNumber: 'REC-2026-0012',
      claimNumber: 'CLM-2026-0042',
      patientName: 'Garon, Suzanne',
      patientMrn: 'MRN-84920',
      primaryPayerName: 'Blue Cross Blue Shield Florida',
      financialClass: 'COMMERCIAL',
      dateOfService: '2026-10-18',
      billedAmount: 8450.00,
      expectedReimbursement: 4200.00,
      remittancePaidAmount: 3950.00,
      bankDepositAmount: 3950.00,
      contractualAdjustmentAmount: 4250.00, // CO-45
      patientResponsibilityAmount: 250.00, // PR-1 Deductible
      varianceAmount: 0.00, // 8450 - (3950 + 4250 + 250) = 0.00
      bankDepositVariance: 0.00,
      status: 'FULLY_RECONCILED',
      eftTraceNumber: 'EFT-BCBS-9910482',
      depositBatchNumber: 'DEP-2026-1025',
      notes: 'Three-way match balanced across 837, 835, and lockbox deposit.'
    },
    {
      id: 'rec-002',
      facilityId: '00000000-0000-0000-0000-000000000002',
      reconciliationControlNumber: 'REC-2026-0034',
      claimNumber: 'CLM-2026-0088',
      patientName: 'Smith, Johnathan',
      patientMrn: 'MRN-77312',
      primaryPayerName: 'UnitedHealthcare Commercial',
      financialClass: 'COMMERCIAL',
      dateOfService: '2026-09-15',
      billedAmount: 11200.00,
      expectedReimbursement: 5800.00,
      remittancePaidAmount: 4600.00, // Paid $4,600 vs expected $5,800
      bankDepositAmount: 4600.00,
      contractualAdjustmentAmount: 5400.00,
      patientResponsibilityAmount: 0.00,
      varianceAmount: 1200.00, // $1,200 Underpayment
      underpaymentAmount: 1200.00,
      bankDepositVariance: 0.00,
      status: 'UNDERPAYMENT_DISCREPANCY',
      eftTraceNumber: 'EFT-UHC-8419200',
      depositBatchNumber: 'DEP-2026-0928',
      notes: 'Carrier applied unauthorized multiple procedure reduction on CPT 49505.'
    },
    {
      id: 'rec-003',
      facilityId: '00000000-0000-0000-0000-000000000002',
      reconciliationControlNumber: 'REC-2026-0056',
      claimNumber: 'CLM-2026-0105',
      patientName: 'Chen, Wei',
      patientMrn: 'MRN-91044',
      primaryPayerName: 'Medicare Part B Florida',
      financialClass: 'MEDICARE',
      dateOfService: '2026-08-10',
      billedAmount: 6200.00,
      expectedReimbursement: 2850.00,
      remittancePaidAmount: 2280.00,
      bankDepositAmount: 2280.00,
      contractualAdjustmentAmount: 3350.00,
      patientResponsibilityAmount: 570.00, // 20% Coinsurance PR-2
      varianceAmount: 0.00, // 6200 - (2280 + 3350 + 570) = 0.00
      bankDepositVariance: 0.00,
      status: 'FULLY_RECONCILED',
      eftTraceNumber: 'EFT-CMS-7719204',
      depositBatchNumber: 'DEP-2026-0824',
      notes: 'Medicare Part B 80% primary payment reconciled with zero variance.'
    },
    {
      id: 'rec-004',
      facilityId: '00000000-0000-0000-0000-000000000002',
      reconciliationControlNumber: 'REC-2026-0078',
      claimNumber: 'CLM-2026-0144',
      patientName: 'Rodriguez, Carmen',
      patientMrn: 'MRN-60219',
      primaryPayerName: 'Aetna Open Choice PPO',
      financialClass: 'COMMERCIAL',
      dateOfService: '2026-07-22',
      billedAmount: 14800.00,
      expectedReimbursement: 7200.00,
      remittancePaidAmount: 0.00,
      bankDepositAmount: 0.00,
      contractualAdjustmentAmount: 0.00,
      patientResponsibilityAmount: 0.00,
      varianceAmount: 14800.00, // Full Denial Balance
      underpaymentAmount: 7200.00,
      bankDepositVariance: 0.00,
      status: 'UNDERPAYMENT_DISCREPANCY',
      eftTraceNumber: 'DENIED-NO-EFT',
      depositBatchNumber: null,
      notes: 'Claim denied CO-197 pre-auth. Transferred to Phase 86 appeals.'
    },
    {
      id: 'rec-005',
      facilityId: '00000000-0000-0000-0000-000000000002',
      reconciliationControlNumber: 'REC-2026-0099',
      claimNumber: 'CLM-2026-0199',
      patientName: 'Kowalski, David',
      patientMrn: 'MRN-55418',
      primaryPayerName: 'Travelers Workers Compensation',
      financialClass: 'WORKERS_COMP',
      dateOfService: '2026-06-12',
      billedAmount: 7900.00,
      expectedReimbursement: 4100.00,
      remittancePaidAmount: 4100.00,
      bankDepositAmount: 0.00, // Remittance received but no bank deposit
      contractualAdjustmentAmount: 3800.00,
      patientResponsibilityAmount: 0.00,
      varianceAmount: 0.00,
      bankDepositVariance: -4100.00, // Missing $4,100 bank cash
      status: 'UNMATCHED_REMITTANCE',
      eftTraceNumber: 'EFT-TRV-993188',
      depositBatchNumber: null,
      notes: 'ERA processed on 2026-06-28; paper check reported mailed but not cashed.'
    },
    {
      id: 'rec-006',
      facilityId: '00000000-0000-0000-0000-000000000002',
      reconciliationControlNumber: 'REC-2026-0120',
      claimNumber: 'CLM-UNLINKED-001',
      patientName: 'Unidentified Patient Deposit',
      patientMrn: 'MRN-UNKNOWN',
      primaryPayerName: 'Cigna Lockbox Deposit',
      financialClass: 'COMMERCIAL',
      dateOfService: '2026-10-10',
      billedAmount: 0.00,
      expectedReimbursement: 0.00,
      remittancePaidAmount: 0.00,
      bankDepositAmount: 2450.00, // Cash in bank without claim link
      contractualAdjustmentAmount: 0.00,
      patientResponsibilityAmount: 0.00,
      varianceAmount: 0.00,
      bankDepositVariance: 2450.00, // Unidentified cash in bank
      status: 'SUSPENSE_UNIDENTIFIED_CASH',
      eftTraceNumber: 'EFT-CIGNA-449102',
      depositBatchNumber: 'DEP-2026-1012',
      notes: 'Lockbox deposit of $2,450.00 received without matching 835 ERA advice.'
    }
  ];
}

const reconciliationService = {
  RECONCILIATION_STATUSES,
  DISCREPANCY_TYPES,
  DISPOSITION_ACTIONS,
  calculateReconciliationVariance,
  calculateBankDepositVariance,
  calculateExpectedUnderpayment,
  calculateReconciliationKpis,
  getBaselineReconciliationRecords
};

export default reconciliationService;

