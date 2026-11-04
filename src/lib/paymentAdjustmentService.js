/**
 * ==============================================================================
 * PAYMENTS & ADJUSTMENTS SERVICE (PHASE 83 — REVENUE CYCLE MANAGEMENT)
 * ==============================================================================
 * Production double-entry cash posting, contractual adjustments, administrative
 * write-offs, refund approval governance, and unapplied cash management for ASCs.
 * Strict multi-tenancy & Maestro Clinical Design System token compliance.
 * ==============================================================================
 */

// 1. Transaction Types
export const TRANSACTION_TYPES = {
  PAYER_PAYMENT: { code: 'PAYER_PAYMENT', label: 'Payer Reimbursement (Insurance)', isCredit: true, badgeClass: 'badge-emerald' },
  PATIENT_PAYMENT: { code: 'PATIENT_PAYMENT', label: 'Patient Co-pay / Coinsurance', isCredit: true, badgeClass: 'badge-sky' },
  CONTRACTUAL_ADJUSTMENT: { code: 'CONTRACTUAL_ADJUSTMENT', label: 'Contractual Fee Schedule Write-Off', isCredit: true, badgeClass: 'badge-amber' },
  ADMIN_WRITE_OFF: { code: 'ADMIN_WRITE_OFF', label: 'Administrative / Bad Debt Write-Off', isCredit: true, badgeClass: 'badge-slate' },
  REFUND: { code: 'REFUND', label: 'Overpayment Refund Disbursed', isCredit: false, badgeClass: 'badge-rose' },
  RECOUPMENT: { code: 'RECOUPMENT', label: 'Payer Retroactive Clawback / Recoupment', isCredit: false, badgeClass: 'badge-rose' }
};

// 2. Deposit Batch Statuses & Types
export const BATCH_TYPES = {
  ELECTRONIC_ERA: 'ELECTRONIC_ERA',
  MANUAL_LOCKBOX: 'MANUAL_LOCKBOX',
  CREDIT_CARD_GATEWAY: 'CREDIT_CARD_GATEWAY',
  PATIENT_PORTAL: 'PATIENT_PORTAL'
};

export const BATCH_STATUSES = {
  OPEN: 'OPEN',
  BALANCED_POSTED: 'BALANCED_POSTED',
  OUT_OF_BALANCE: 'OUT_OF_BALANCE',
  CLOSED_FROZEN: 'CLOSED_FROZEN'
};

export const BATCH_STATUS_CONFIG = {
  [BATCH_STATUSES.OPEN]: { label: 'Open Deposit Batch', badgeClass: 'badge-sky' },
  [BATCH_STATUSES.BALANCED_POSTED]: { label: 'Balanced & Posted', badgeClass: 'badge-emerald' },
  [BATCH_STATUSES.OUT_OF_BALANCE]: { label: 'Out of Balance', badgeClass: 'badge-rose' },
  [BATCH_STATUSES.CLOSED_FROZEN]: { label: 'Closed & Period Frozen', badgeClass: 'badge-slate' }
};

// 3. Refund Approval Statuses
export const REFUND_STATUSES = {
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  DISBURSED: 'DISBURSED',
  REJECTED: 'REJECTED'
};

// 4. Threshold Limits for Approval Separation of Duties
export const REFUND_APPROVAL_THRESHOLD_CFO = 250.00; // >= $250 requires CFO or Super Admin

/**
 * Calculates authoritative double-entry posting balance for a claim
 * Formula: Outstanding AR = Gross Charge - (Payer + Patient Payments + Contractual + Admin Write-Offs) + Refunds - Recoupments
 * @param {number} grossCharge - Total claim gross charge
 * @param {Array} transactions - Array of transaction objects for this claim
 * @returns {Object} Net balance summary
 */
export function calculatePostingBalances(grossCharge = 0, transactions = []) {
  let payerPaid = 0;
  let patientPaid = 0;
  let contractualAdj = 0;
  let adminWriteOff = 0;
  let refunds = 0;
  let recoupments = 0;

  transactions.forEach(tx => {
    const amt = Number(tx.amount || 0);
    switch (tx.transactionType) {
      case 'PAYER_PAYMENT':
        payerPaid += amt;
        break;
      case 'PATIENT_PAYMENT':
        patientPaid += amt;
        break;
      case 'CONTRACTUAL_ADJUSTMENT':
        contractualAdj += amt;
        break;
      case 'ADMIN_WRITE_OFF':
        adminWriteOff += amt;
        break;
      case 'REFUND':
        refunds += amt;
        break;
      case 'RECOUPMENT':
        recoupments += amt;
        break;
      default:
        break;
    }
  });

  const totalCredits = payerPaid + patientPaid + contractualAdj + adminWriteOff;
  const netOutstandingAr = Math.round((Number(grossCharge) - totalCredits + refunds - recoupments) * 100) / 100;

  return {
    grossCharge: Number(grossCharge),
    totalPayerPaid: Math.round(payerPaid * 100) / 100,
    totalPatientPaid: Math.round(patientPaid * 100) / 100,
    totalContractualAdj: Math.round(contractualAdj * 100) / 100,
    totalContractualAdjustments: Math.round(contractualAdj * 100) / 100,
    totalAdminWriteOff: Math.round(adminWriteOff * 100) / 100,
    totalRefunds: Math.round(refunds * 100) / 100,
    totalRecoupments: Math.round(recoupments * 100) / 100,
    totalCredits: Math.round(totalCredits * 100) / 100,
    netCashCollected: Math.round((payerPaid + patientPaid - refunds) * 100) / 100,
    outstandingArBalance: netOutstandingAr,
    isFullySettled: Math.abs(netOutstandingAr) < 0.01,
    isOverpaid: netOutstandingAr < 0,
    overpaymentAmount: netOutstandingAr < 0 ? Math.abs(netOutstandingAr) : 0.00
  };
}

/**
 * Validates batch deposit balancing against transaction lines or direct amounts
 * Total Batch Amount == SUM(Posted Transactions) + Unapplied Cash
 * @param {Object|number} batchOrAmount - Batch object or stated batch amount
 * @param {Array|number} transactionsOrPosted - Transactions assigned to this batch or posted cash amount
 * @param {number} [unappliedCash=0] - Unapplied amount if using scalar numbers
 * @returns {Object} Balancing validation report
 */
export function validateBatchBalancing(batchOrAmount, transactionsOrPosted = [], unappliedCash = 0) {
  if (typeof batchOrAmount === 'number') {
    const stated = batchOrAmount;
    if (stated < 0) {
      return {
        isBalanced: false,
        error: 'Stated batch amount cannot be negative.',
        variance: Math.abs(stated)
      };
    }
    const posted = Number(transactionsOrPosted || 0);
    const unapplied = Number(unappliedCash || 0);
    const variance = Math.round(Math.abs(stated - (posted + unapplied)) * 100) / 100;
    const isBalanced = variance <= 0.05;
    return {
      statedBatchAmount: stated,
      postedCashAmount: posted,
      unappliedAmount: unapplied,
      variance,
      isBalanced,
      status: isBalanced ? BATCH_STATUSES.BALANCED_POSTED : BATCH_STATUSES.OUT_OF_BALANCE
    };
  }

  const batch = batchOrAmount || {};
  const transactions = Array.isArray(transactionsOrPosted) ? transactionsOrPosted : [];
  const batchTransactions = transactions.filter(t => t.batchId === batch.id);
  const postedSum = batchTransactions.reduce((acc, t) => {
    // Only cash payment transactions add to posted deposit amount
    if (t.transactionType === 'PAYER_PAYMENT' || t.transactionType === 'PATIENT_PAYMENT') {
      return acc + Number(t.amount || 0);
    }
    return acc;
  }, 0);

  const unapplied = Number(batch.unappliedAmount || 0);
  const calculatedTotal = postedSum + unapplied;
  const stated = Number(batch.totalBatchAmount || batch.batchAmount || 0);
  const variance = Math.round(Math.abs(stated - calculatedTotal) * 100) / 100;
  const isBalanced = variance <= 0.05;

  return {
    batchId: batch.id,
    statedBatchAmount: stated,
    postedCashAmount: Math.round(postedSum * 100) / 100,
    unappliedAmount: unapplied,
    variance,
    isBalanced,
    status: isBalanced ? BATCH_STATUSES.BALANCED_POSTED : BATCH_STATUSES.OUT_OF_BALANCE
  };
}

/**
 * Validates separation of duties and financial threshold authorization for refunds
 * @param {Object} refund - Refund request object
 * @param {string|Object} approverRoleOrUser - Role slug of approver or approver user object { id, role }
 * @param {string} [approverUserId] - User ID of approver if role passed as string
 * @returns {Object} Authorization check result { canApprove, reason, isValid, error }
 */
export function validateRefundApproval(refund, approverRoleOrUser = 'biller', approverUserId = 'user-02') {
  let role = 'biller';
  let userId = approverUserId;

  if (typeof approverRoleOrUser === 'object' && approverRoleOrUser !== null) {
    role = approverRoleOrUser.role || 'biller';
    userId = approverRoleOrUser.id || 'user-02';
  } else if (typeof approverRoleOrUser === 'string') {
    role = approverRoleOrUser;
  }

  if (refund.requestedBy && refund.requestedBy === userId) {
    const errorMsg = 'Separation of duties violation: You cannot approve your own refund request.';
    return {
      canApprove: false,
      reason: errorMsg,
      isValid: false,
      error: errorMsg
    };
  }

  const amt = Number(refund.amount || 0);
  if (amt >= REFUND_APPROVAL_THRESHOLD_CFO) {
    const isCfoOrAdmin = ['cfo', 'super_admin', 'org_admin'].includes(role.toLowerCase());
    if (!isCfoOrAdmin) {
      const errorMsg = `Refund amount ($${amt.toFixed(2)}) meets or exceeds CFO threshold ($${REFUND_APPROVAL_THRESHOLD_CFO.toFixed(2)}). CFO or Super Admin authorization strictly required.`;
      return {
        canApprove: false,
        reason: errorMsg,
        isValid: false,
        error: errorMsg
      };
    }
  }

  return { canApprove: true, isValid: true };
}

/**
 * Computes executive KPI scorecard metrics across payments, adjustments, and refunds
 * @param {Array} batches - Deposit batches
 * @param {Array} transactions - Cash posting transactions
 * @param {Array} refunds - Refund ledger records
 * @returns {Object} Executive KPI scorecard
 */
export function calculatePaymentKpis(batches = [], transactions = [], refunds = []) {
  let cashCollected = 0;
  let payerPaid = 0;
  let patientPaid = 0;
  let contractualWriteoffs = 0;
  let adminWriteoffs = 0;

  transactions.forEach(t => {
    const amt = Number(t.amount || 0);
    if (t.transactionType === 'PAYER_PAYMENT') {
      payerPaid += amt;
      cashCollected += amt;
    } else if (t.transactionType === 'PATIENT_PAYMENT') {
      patientPaid += amt;
      cashCollected += amt;
    } else if (t.transactionType === 'CONTRACTUAL_ADJUSTMENT') {
      contractualWriteoffs += amt;
    } else if (t.transactionType === 'ADMIN_WRITE_OFF') {
      adminWriteoffs += amt;
    }
  });

  const totalUnapplied = batches.reduce((acc, b) => acc + Number(b.unappliedAmount || 0), 0);
  const totalRefunds = refunds.reduce((acc, r) => acc + Number(r.amount || 0), 0);
  const disbursedRefunds = refunds
    .filter(r => r.approvalStatus === 'DISBURSED')
    .reduce((acc, r) => acc + Number(r.amount || 0), 0);

  return {
    totalCashCollected: Math.round(cashCollected * 100) / 100,
    totalPayerPaid: Math.round(payerPaid * 100) / 100,
    totalPatientPaid: Math.round(patientPaid * 100) / 100,
    totalContractualWriteoffs: Math.round(contractualWriteoffs * 100) / 100,
    totalContractualAdjustments: Math.round(contractualWriteoffs * 100) / 100,
    totalAdminWriteoffs: Math.round(adminWriteoffs * 100) / 100,
    totalAdminWriteOffs: Math.round(adminWriteoffs * 100) / 100,
    totalUnappliedCash: Math.round(totalUnapplied * 100) / 100,
    totalRefundsRecoupments: Math.round(totalRefunds * 100) / 100,
    totalDisbursedRefunds: Math.round(disbursedRefunds * 100) / 100,
    pendingRefundsCount: refunds.filter(r => r.approvalStatus === 'PENDING_APPROVAL').length,
    totalTransactionCount: transactions.length,
    openBatchesCount: batches.filter(b => b.status === BATCH_STATUSES.OPEN).length
  };
}

/**
 * Baseline sample data for development, testing, and UI simulation
 */
export function getBaselineSampleData() {
  const batches = [
    {
      id: 'batch-rcm-001',
      facilityId: 'fac-naples-01',
      batchNumber: 'DEP-20261020-01',
      depositDate: '2026-10-20',
      bankAccountName: 'First Horizon Operating Account *4401',
      batchType: BATCH_TYPES.ELECTRONIC_ERA,
      totalBatchAmount: 1456.00,
      postedAmount: 1456.00,
      unappliedAmount: 0.00,
      status: BATCH_STATUSES.BALANCED_POSTED,
      notes: 'Medicare Part B ERA Electronic Deposit auto-posted'
    },
    {
      id: 'batch-rcm-002',
      facilityId: 'fac-naples-01',
      batchNumber: 'DEP-20261029-02',
      depositDate: '2026-10-29',
      bankAccountName: 'First Horizon Operating Account *4401',
      batchType: BATCH_TYPES.ELECTRONIC_ERA,
      totalBatchAmount: 3450.00,
      postedAmount: 2950.00,
      unappliedAmount: 500.00,
      status: BATCH_STATUSES.OPEN,
      notes: 'BCBS Commercial ERA Deposit with $500 unapplied suspense funds'
    },
    {
      id: 'batch-rcm-003',
      facilityId: 'fac-naples-01',
      batchNumber: 'LOCKBOX-20261031-01',
      depositDate: '2026-10-31',
      bankAccountName: 'First Horizon Operating Account *4401',
      batchType: BATCH_TYPES.MANUAL_LOCKBOX,
      totalBatchAmount: 850.00,
      postedAmount: 850.00,
      unappliedAmount: 0.00,
      status: BATCH_STATUSES.BALANCED_POSTED,
      notes: 'Patient copays and deductible check lockbox deposit'
    }
  ];

  const transactions = [
    {
      id: 'tx-rcm-101',
      batchId: 'batch-rcm-001',
      facilityId: 'fac-naples-01',
      claimId: 'claim-phase80-001',
      claimControlNumber: 'CLM-2026-0891',
      transactionType: 'PAYER_PAYMENT',
      paymentMethod: 'EFT',
      referenceNumber: 'EFT-8849201948',
      amount: 1456.00,
      carcCode: null,
      patientMrn: 'MRN-84920',
      patientName: 'Eleanor Vance',
      payerName: 'Medicare Part B (Florida First Coast)',
      transactionDate: '2026-10-20',
      postedBy: 'user-biller-01'
    },
    {
      id: 'tx-rcm-102',
      batchId: 'batch-rcm-001',
      facilityId: 'fac-naples-01',
      claimId: 'claim-phase80-001',
      claimControlNumber: 'CLM-2026-0891',
      transactionType: 'CONTRACTUAL_ADJUSTMENT',
      paymentMethod: 'OFFSET',
      referenceNumber: 'ERA-ADJ-001',
      amount: 2394.00,
      carcCode: 'CO-45',
      patientMrn: 'MRN-84920',
      patientName: 'Eleanor Vance',
      payerName: 'Medicare Part B (Florida First Coast)',
      transactionDate: '2026-10-20',
      postedBy: 'user-biller-01'
    },
    {
      id: 'tx-rcm-103',
      batchId: 'batch-rcm-002',
      facilityId: 'fac-naples-01',
      claimId: 'claim-phase80-002',
      claimControlNumber: 'CLM-2026-0892',
      transactionType: 'PAYER_PAYMENT',
      paymentMethod: 'EFT',
      referenceNumber: 'EFT-7718290192',
      amount: 2950.00,
      carcCode: null,
      patientMrn: 'MRN-91204',
      patientName: 'Marcus Aurelius Sterling',
      payerName: 'Blue Cross Blue Shield of Florida',
      transactionDate: '2026-10-29',
      postedBy: 'user-biller-01'
    },
    {
      id: 'tx-rcm-104',
      batchId: 'batch-rcm-002',
      facilityId: 'fac-naples-01',
      claimId: 'claim-phase80-002',
      claimControlNumber: 'CLM-2026-0892',
      transactionType: 'CONTRACTUAL_ADJUSTMENT',
      paymentMethod: 'OFFSET',
      referenceNumber: 'ERA-ADJ-002',
      amount: 2650.00,
      carcCode: 'CO-45',
      patientMrn: 'MRN-91204',
      patientName: 'Marcus Aurelius Sterling',
      payerName: 'Blue Cross Blue Shield of Florida',
      transactionDate: '2026-10-29',
      postedBy: 'user-biller-01'
    },
    {
      id: 'tx-rcm-105',
      batchId: 'batch-rcm-003',
      facilityId: 'fac-naples-01',
      claimId: 'claim-phase80-003',
      claimControlNumber: 'CLM-2026-0893',
      transactionType: 'PATIENT_PAYMENT',
      paymentMethod: 'CHECK',
      referenceNumber: 'CHK-4491',
      amount: 600.00,
      carcCode: null,
      patientMrn: 'MRN-77341',
      patientName: 'Devon Hayes',
      payerName: 'Self-Pay / Patient Share',
      transactionDate: '2026-10-31',
      postedBy: 'user-biller-01'
    },
    {
      id: 'tx-rcm-106',
      batchId: 'batch-rcm-003',
      facilityId: 'fac-naples-01',
      claimId: 'claim-phase80-003',
      claimControlNumber: 'CLM-2026-0893',
      transactionType: 'ADMIN_WRITE_OFF',
      paymentMethod: 'OFFSET',
      referenceNumber: 'WO-PROMPT-PAY',
      amount: 50.00,
      carcCode: 'WO-PROMPT',
      patientMrn: 'MRN-77341',
      patientName: 'Devon Hayes',
      payerName: 'Administrative Courtesy',
      transactionDate: '2026-10-31',
      postedBy: 'user-biller-01'
    }
  ];

  const refunds = [
    {
      id: 'ref-rcm-001',
      facilityId: 'fac-naples-01',
      claimId: 'claim-phase80-003',
      claimControlNumber: 'CLM-2026-0893',
      originalTransactionId: 'tx-rcm-105',
      type: 'PATIENT_REFUND',
      amount: 150.00,
      reasonCode: 'OVERPAYMENT',
      disbursementReference: 'REF-CHK-1092',
      approvalStatus: REFUND_STATUSES.APPROVED,
      requestedBy: 'user-biller-01',
      approvedBy: 'user-cfo-01',
      approvedAt: '2026-11-01T14:30:00Z',
      notes: 'Patient overpaid upfront estimated copay; verified secondary payment covered balance'
    },
    {
      id: 'ref-rcm-002',
      facilityId: 'fac-naples-01',
      claimId: 'claim-phase80-002',
      claimControlNumber: 'CLM-2026-0892',
      originalTransactionId: 'tx-rcm-103',
      type: 'PAYER_RECOUPMENT',
      amount: 320.00,
      reasonCode: 'MEDICARE_AUDIT',
      disbursementReference: 'OFFSET-20261102',
      approvalStatus: REFUND_STATUSES.PENDING_APPROVAL,
      requestedBy: 'user-biller-01',
      approvedBy: null,
      approvedAt: null,
      notes: 'Retroactive payer recoupment request received on prior quarter audited claim'
    }
  ];

  return { batches, transactions, refunds };
}

export const paymentAdjustmentService = {
  TRANSACTION_TYPES,
  BATCH_TYPES,
  BATCH_STATUSES,
  BATCH_STATUS_CONFIG,
  REFUND_STATUSES,
  REFUND_APPROVAL_THRESHOLD_CFO,
  calculatePostingBalances,
  validateBatchBalancing,
  validateRefundApproval,
  calculatePaymentKpis,
  getBaselineSampleData
};

export default paymentAdjustmentService;
