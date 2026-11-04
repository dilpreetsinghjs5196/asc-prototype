/**
 * ==============================================================================
 * CLAIMS SERVICE (PHASE 80 — REVENUE CYCLE MANAGEMENT)
 * ==============================================================================
 * Comprehensive claims model, line-item adjudication, RCM 15-state lifecycle
 * machine, external clearinghouse/payer trace IDs, and deterministic AR math.
 * Strict multi-tenancy & Maestro Clinical Design System token compliance.
 * ==============================================================================
 */

// 1. Canonical Claim Lifecycle Statuses
export const CLAIM_LIFECYCLE_STATUSES = {
  DRAFT: 'DRAFT',
  READY_TO_SCRUB: 'READY_TO_SCRUB',
  SCRUBBING: 'SCRUBBING',
  SCRUB_FAILED: 'SCRUB_FAILED',
  SCRUB_PASSED: 'SCRUB_PASSED',
  READY_TO_TRANSMIT: 'READY_TO_TRANSMIT',
  TRANSMITTED: 'TRANSMITTED',
  ACCEPTED_CLEARINGHOUSE: 'ACCEPTED_CLEARINGHOUSE',
  ACCEPTED_PAYER: 'ACCEPTED_PAYER',
  REJECTED_CLEARINGHOUSE: 'REJECTED_CLEARINGHOUSE',
  REJECTED_PAYER: 'REJECTED_PAYER',
  IN_ADJUDICATION: 'IN_ADJUDICATION',
  PAID: 'PAID',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  DENIED: 'DENIED',
  APPEALED: 'APPEALED',
  REBILLED: 'REBILLED',
  VOIDED: 'VOIDED',
  CLOSED_BALANCED: 'CLOSED_BALANCED'
};

// 2. Billing Formats
export const BILLING_FORMATS = {
  UB04_INSTITUTIONAL: 'UB04_INSTITUTIONAL',
  CMS1500_PROFESSIONAL: 'CMS1500_PROFESSIONAL'
};

// 3. Claim Frequency Types (Box 4 / Loop 2300 CLM05-3)
export const CLAIM_FREQUENCY_TYPES = {
  ORIGINAL: '1',
  REPLACEMENT: '7',
  VOID: '8'
};

// 4. Status Configuration & Maestro Design System Tokens
export const CLAIM_STATUS_CONFIG = {
  [CLAIM_LIFECYCLE_STATUSES.DRAFT]: {
    label: 'Draft / Unbilled',
    shortLabel: 'Draft',
    badgeClass: 'badge-slate',
    color: '#94a3b8',
    stage: 'PRE_SUBMISSION'
  },
  [CLAIM_LIFECYCLE_STATUSES.READY_TO_SCRUB]: {
    label: 'Ready to Scrub',
    shortLabel: 'Pending Scrub',
    badgeClass: 'badge-sky',
    color: '#38bdf8',
    stage: 'PRE_SUBMISSION'
  },
  [CLAIM_LIFECYCLE_STATUSES.SCRUBBING]: {
    label: 'Scrubbing in Progress',
    shortLabel: 'Scrubbing',
    badgeClass: 'badge-sky',
    color: '#38bdf8',
    stage: 'PRE_SUBMISSION'
  },
  [CLAIM_LIFECYCLE_STATUSES.SCRUB_FAILED]: {
    label: 'Scrub Failed (Edits Required)',
    shortLabel: 'Scrub Failed',
    badgeClass: 'badge-rose',
    color: '#fb7185',
    stage: 'PRE_SUBMISSION'
  },
  [CLAIM_LIFECYCLE_STATUSES.SCRUB_PASSED]: {
    label: 'Clean Claim (Scrub Passed)',
    shortLabel: 'Scrub Passed',
    badgeClass: 'badge-emerald',
    color: '#34d399',
    stage: 'PRE_SUBMISSION'
  },
  [CLAIM_LIFECYCLE_STATUSES.READY_TO_TRANSMIT]: {
    label: 'Ready to Transmit (837 Batch)',
    shortLabel: 'Ready 837',
    badgeClass: 'badge-sky',
    color: '#38bdf8',
    stage: 'TRANSMISSION'
  },
  [CLAIM_LIFECYCLE_STATUSES.TRANSMITTED]: {
    label: 'Transmitted to Clearinghouse',
    shortLabel: 'Transmitted',
    badgeClass: 'badge-sky',
    color: '#38bdf8',
    stage: 'TRANSMISSION'
  },
  [CLAIM_LIFECYCLE_STATUSES.ACCEPTED_CLEARINGHOUSE]: {
    label: 'Accepted by Clearinghouse (999)',
    shortLabel: 'CH Accepted',
    badgeClass: 'badge-sky',
    color: '#38bdf8',
    stage: 'TRANSMISSION'
  },
  [CLAIM_LIFECYCLE_STATUSES.ACCEPTED_PAYER]: {
    label: 'Payer Acknowledged (277CA)',
    shortLabel: 'Payer Accepted',
    badgeClass: 'badge-sky',
    color: '#38bdf8',
    stage: 'ADJUDICATION'
  },
  [CLAIM_LIFECYCLE_STATUSES.REJECTED_CLEARINGHOUSE]: {
    label: 'Clearinghouse Rejected',
    shortLabel: 'CH Rejected',
    badgeClass: 'badge-rose',
    color: '#fb7185',
    stage: 'TRANSMISSION'
  },
  [CLAIM_LIFECYCLE_STATUSES.REJECTED_PAYER]: {
    label: 'Payer Rejected (Front-End)',
    shortLabel: 'Payer Rejected',
    badgeClass: 'badge-rose',
    color: '#fb7185',
    stage: 'ADJUDICATION'
  },
  [CLAIM_LIFECYCLE_STATUSES.IN_ADJUDICATION]: {
    label: 'In Payer Adjudication',
    shortLabel: 'In Adjudication',
    badgeClass: 'badge-amber',
    color: '#fbbf24',
    stage: 'ADJUDICATION'
  },
  [CLAIM_LIFECYCLE_STATUSES.PAID]: {
    label: 'Paid in Full',
    shortLabel: 'Paid',
    badgeClass: 'badge-emerald',
    color: '#34d399',
    stage: 'RESOLVED'
  },
  [CLAIM_LIFECYCLE_STATUSES.PARTIALLY_PAID]: {
    label: 'Partially Paid (Short Pay)',
    shortLabel: 'Partial Pay',
    badgeClass: 'badge-amber',
    color: '#fbbf24',
    stage: 'ADJUDICATION'
  },
  [CLAIM_LIFECYCLE_STATUSES.DENIED]: {
    label: 'Claim Denied (CARC/RARC)',
    shortLabel: 'Denied',
    badgeClass: 'badge-rose',
    color: '#fb7185',
    stage: 'DENIAL_APPEAL'
  },
  [CLAIM_LIFECYCLE_STATUSES.APPEALED]: {
    label: 'Appeal Under Review',
    shortLabel: 'Appealed',
    badgeClass: 'badge-amber',
    color: '#fbbf24',
    stage: 'DENIAL_APPEAL'
  },
  [CLAIM_LIFECYCLE_STATUSES.REBILLED]: {
    label: 'Rebilled / Replaced (Freq 7)',
    shortLabel: 'Rebilled',
    badgeClass: 'badge-slate',
    color: '#94a3b8',
    stage: 'RESOLVED'
  },
  [CLAIM_LIFECYCLE_STATUSES.VOIDED]: {
    label: 'Voided Claim (Freq 8)',
    shortLabel: 'Voided',
    badgeClass: 'badge-slate',
    color: '#94a3b8',
    stage: 'RESOLVED'
  },
  [CLAIM_LIFECYCLE_STATUSES.CLOSED_BALANCED]: {
    label: 'Zero Balance (Reconciled)',
    shortLabel: 'Closed',
    badgeClass: 'badge-emerald',
    color: '#34d399',
    stage: 'RESOLVED'
  }
};

// 5. ASC UB-04 Revenue Code Catalog
export const ASC_REVENUE_CODES = {
  '0490': { code: '0490', name: 'Ambulatory Surgical Care (Facility Rate)' },
  '0272': { code: '0272', name: 'Sterile Supply / Implants & Prosthetics' },
  '0250': { code: '0250', name: 'Pharmacy / General Drugs' },
  '0360': { code: '0360', name: 'Operating Room Services' },
  '0710': { code: '0710', name: 'Recovery Room / PACU' }
};

/**
 * Deterministically compute claim-level financial balances from child lines
 * @param {Object} claim - Claim header record
 * @param {Array} lines - Array of child claim line items
 * @returns {Object} Reconciled financial totals
 */
export function calculateClaimBalances(claim, lines = []) {
  if (!lines || lines.length === 0) {
    const gross = Number(claim?.totalGrossCharge || 0);
    const paid = Number(claim?.totalPaidAmount || 0);
    const contractual = Number(claim?.totalContractualAdjustment || 0);
    const patient = Number(claim?.totalPatientBalance || 0);
    const outstanding = Math.max(0, Math.round((gross - paid - contractual - patient) * 100) / 100);

    return {
      totalGrossCharge: gross,
      totalAllowedAmount: Number(claim?.totalAllowedAmount || 0),
      totalPaidAmount: paid,
      totalContractualAdjustment: contractual,
      totalPatientBalance: patient,
      outstandingArBalance: outstanding,
      lineCount: 0,
      paymentYieldPct: gross > 0 ? Math.round((paid / gross) * 10000) / 100 : 0.00
    };
  }

  let grossSum = 0;
  let allowedSum = 0;
  let paidSum = 0;
  let contractualSum = 0;
  let patientSum = 0;
  let disallowedSum = 0;

  lines.forEach(line => {
    const gross = Number(line.grossCharge || 0);
    const allowed = Number(line.allowedAmount || 0);
    const paid = Number(line.paidAmount || 0);
    const contractual = Number(line.contractualAdjustment || 0);
    const copay = Number(line.patientCopay || 0);
    const coinsurance = Number(line.patientCoinsurance || 0);
    const deductible = Number(line.patientDeductible || 0);
    const disallowed = Number(line.disallowedAmount || 0);

    grossSum += gross;
    allowedSum += allowed;
    paidSum += paid;
    contractualSum += contractual;
    patientSum += (copay + coinsurance + deductible);
    disallowedSum += disallowed;
  });

  grossSum = Math.round(grossSum * 100) / 100;
  allowedSum = Math.round(allowedSum * 100) / 100;
  paidSum = Math.round(paidSum * 100) / 100;
  contractualSum = Math.round(contractualSum * 100) / 100;
  patientSum = Math.round(patientSum * 100) / 100;
  disallowedSum = Math.round(disallowedSum * 100) / 100;

  const outstanding = Math.max(0, Math.round((grossSum - paidSum - contractualSum - patientSum) * 100) / 100);
  const yieldPct = grossSum > 0 ? Math.round((paidSum / grossSum) * 10000) / 100 : 0.00;

  return {
    totalGrossCharge: grossSum,
    totalAllowedAmount: allowedSum,
    totalPaidAmount: paidSum,
    totalContractualAdjustment: contractualSum,
    totalPatientBalance: patientSum,
    disallowedAmount: disallowedSum,
    outstandingArBalance: outstanding,
    lineCount: lines.length,
    paymentYieldPct: yieldPct
  };
}

/**
 * Validate allowed lifecycle transitions between RCM states
 * @param {string} currentStatus - Current lifecycle status
 * @param {string} targetStatus - Proposed target status
 * @returns {Object} { isValid: boolean, reason?: string }
 */
export function validateStateTransition(currentStatus, targetStatus) {
  if (currentStatus === targetStatus) {
    return { isValid: true };
  }

  // Terminal or Reconciled status cannot be reverted directly to DRAFT
  if ((currentStatus === CLAIM_LIFECYCLE_STATUSES.PAID || currentStatus === CLAIM_LIFECYCLE_STATUSES.CLOSED_BALANCED) &&
      targetStatus === CLAIM_LIFECYCLE_STATUSES.DRAFT) {
    return {
      isValid: false,
      reason: 'Reconciled or Paid claims cannot be reverted directly to Draft. Create a Replacement Rebill (Frequency 7).'
    };
  }

  // Pre-submission gates: DRAFT cannot skip straight to TRANSMITTED
  if (currentStatus === CLAIM_LIFECYCLE_STATUSES.DRAFT && targetStatus === CLAIM_LIFECYCLE_STATUSES.TRANSMITTED) {
    return {
      isValid: false,
      reason: 'Claim must undergo pre-submission claim scrubbing and batch preparation before transmission.'
    };
  }

  // Voided claims cannot be altered
  if (currentStatus === CLAIM_LIFECYCLE_STATUSES.VOIDED) {
    return {
      isValid: false,
      reason: 'Voided claims are permanently closed and cannot transition to active lifecycle states.'
    };
  }

  return { isValid: true };
}

/**
 * Aggregate executive KPI metrics across a facility's claims portfolio
 * @param {Array} claims - Array of claim records
 * @returns {Object} Executive KPI scorecard
 */
export function calculateFacilityRcmKpis(claims = []) {
  if (!claims || claims.length === 0) {
    return {
      totalClaims: 0,
      totalActiveAr: 0.00,
      cleanClaimRate: 0.00,
      pendingAdjudicationAmount: 0.00,
      deniedAtRiskAmount: 0.00,
      totalBilledAmount: 0.00,
      totalCollectedAmount: 0.00,
      overallYieldPct: 0.00
    };
  }

  let totalActiveAr = 0;
  let cleanClaimCount = 0;
  let pendingAdjudicationAmount = 0;
  let deniedAtRiskAmount = 0;
  let totalBilled = 0;
  let totalCollected = 0;

  claims.forEach(c => {
    const gross = Number(c.totalGrossCharge || 0);
    const paid = Number(c.totalPaidAmount || 0);
    const ar = Number(c.outstandingArBalance || 0);

    totalBilled += gross;
    totalCollected += paid;

    if (c.rcmStatus !== CLAIM_LIFECYCLE_STATUSES.CLOSED_BALANCED && c.rcmStatus !== CLAIM_LIFECYCLE_STATUSES.VOIDED) {
      totalActiveAr += ar;
    }

    if (c.scrubStatus === 'SCRUB_PASSED' || c.rcmStatus === CLAIM_LIFECYCLE_STATUSES.SCRUB_PASSED) {
      cleanClaimCount += 1;
    }

    if (c.rcmStatus === CLAIM_LIFECYCLE_STATUSES.ACCEPTED_PAYER || c.rcmStatus === CLAIM_LIFECYCLE_STATUSES.IN_ADJUDICATION) {
      pendingAdjudicationAmount += (Number(c.totalAllowedAmount) || gross);
    }

    if (c.rcmStatus === CLAIM_LIFECYCLE_STATUSES.DENIED || c.rcmStatus === CLAIM_LIFECYCLE_STATUSES.APPEALED) {
      deniedAtRiskAmount += ar > 0 ? ar : gross;
    }
  });

  const cleanRate = claims.length > 0 ? Math.round((cleanClaimCount / claims.length) * 10000) / 100 : 0.00;
  const overallYield = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 10000) / 100 : 0.00;

  return {
    totalClaims: claims.length,
    totalActiveAr: Math.round(totalActiveAr * 100) / 100,
    cleanClaimRate: cleanRate,
    pendingAdjudicationAmount: Math.round(pendingAdjudicationAmount * 100) / 100,
    deniedAtRiskAmount: Math.round(deniedAtRiskAmount * 100) / 100,
    totalBilledAmount: Math.round(totalBilled * 100) / 100,
    totalCollectedAmount: Math.round(totalCollected * 100) / 100,
    overallYieldPct: overallYield
  };
}

/**
 * Generate baseline sample claims for development, testing, and UI demonstration
 * @returns {Object} Sample claims, lines, and audit history
 */
export function getBaselineSampleData() {
  const claims = [
    {
      id: 'claim-101',
      facilityId: 'fac-naples-01',
      patientControlNumber: 'CLM-2026-0891',
      patientName: 'Eleanor Vance',
      patientMrn: 'MRN-84920',
      surgeryId: 101,
      procedureName: 'Cataract Ext w/ IOL Complex',
      surgeonName: 'Dr. Robert Chen, MD',
      primaryPayerId: 'payer-medicare-fl',
      primaryPayerName: 'Medicare Part B (Florida First Coast)',
      payerType: 'MEDICARE',
      billingFormat: BILLING_FORMATS.UB04_INSTITUTIONAL,
      claimType: 'INSTITUTIONAL',
      claimFrequencyType: CLAIM_FREQUENCY_TYPES.ORIGINAL,
      rcmStatus: CLAIM_LIFECYCLE_STATUSES.PAID,
      scrubStatus: 'SCRUB_PASSED',
      clearinghouseClaimId: 'CH-TRN-984210',
      payerClaimControlNumber: 'ICN-2026-FL-889102',
      transmissionBatchId: 'BATCH-20261015-01',
      initialSubmittedAt: '2026-10-15T09:30:00Z',
      adjudicatedAt: '2026-10-24T14:15:00Z',
      totalGrossCharge: 3850.00,
      totalAllowedAmount: 1820.00,
      totalPaidAmount: 1456.00,
      totalContractualAdjustment: 2030.00,
      totalPatientBalance: 364.00,
      outstandingArBalance: 0.00,
      dateOfService: '2026-10-12',
      lines: [
        {
          id: 'line-101-1',
          claimId: 'claim-101',
          lineNumber: 1,
          revenueCode: '0490',
          cptCode: '66984',
          procedureDescription: 'Cataract extraction with intraocular lens prosthesis',
          modifiers: ['RT', 'SG'],
          units: 1,
          grossCharge: 2950.00,
          allowedAmount: 1420.00,
          paidAmount: 1136.00,
          contractualAdjustment: 1530.00,
          patientCopay: 0.00,
          patientCoinsurance: 284.00,
          patientDeductible: 0.00,
          disallowedAmount: 0.00,
          lineBalance: 0.00,
          lineRcmStatus: 'ADJUDICATED_PAID'
        },
        {
          id: 'line-101-2',
          claimId: 'claim-101',
          lineNumber: 2,
          revenueCode: '0272',
          cptCode: 'C1788',
          procedureDescription: 'New technology intraocular lens (Toric Premium IOL)',
          modifiers: ['SG'],
          units: 1,
          grossCharge: 900.00,
          allowedAmount: 400.00,
          paidAmount: 320.00,
          contractualAdjustment: 500.00,
          patientCopay: 0.00,
          patientCoinsurance: 80.00,
          patientDeductible: 0.00,
          disallowedAmount: 0.00,
          lineBalance: 0.00,
          lineRcmStatus: 'ADJUDICATED_PAID'
        }
      ]
    },
    {
      id: 'claim-102',
      facilityId: 'fac-naples-01',
      patientControlNumber: 'CLM-2026-0892',
      patientName: 'Marcus Aurelius Sterling',
      patientMrn: 'MRN-91204',
      surgeryId: 102,
      procedureName: 'Knee Arthroscopy Meniscectomy',
      surgeonName: 'Dr. Sarah Jenkins, MD',
      primaryPayerId: 'payer-bcbs-fl',
      primaryPayerName: 'Blue Cross Blue Shield of Florida',
      payerType: 'COMMERCIAL',
      billingFormat: BILLING_FORMATS.UB04_INSTITUTIONAL,
      claimType: 'INSTITUTIONAL',
      claimFrequencyType: CLAIM_FREQUENCY_TYPES.ORIGINAL,
      rcmStatus: CLAIM_LIFECYCLE_STATUSES.IN_ADJUDICATION,
      scrubStatus: 'SCRUB_PASSED',
      clearinghouseClaimId: 'CH-TRN-984255',
      payerClaimControlNumber: 'ICN-BCBS-2026-9041',
      transmissionBatchId: 'BATCH-20261026-02',
      initialSubmittedAt: '2026-10-26T16:00:00Z',
      adjudicatedAt: null,
      totalGrossCharge: 5600.00,
      totalAllowedAmount: 2950.00,
      totalPaidAmount: 0.00,
      totalContractualAdjustment: 0.00,
      totalPatientBalance: 0.00,
      outstandingArBalance: 5600.00,
      dateOfService: '2026-10-24',
      lines: [
        {
          id: 'line-102-1',
          claimId: 'claim-102',
          lineNumber: 1,
          revenueCode: '0490',
          cptCode: '29881',
          procedureDescription: 'Arthroscopy, knee, surgical; with meniscectomy (medial)',
          modifiers: ['LT', 'SG'],
          units: 1,
          grossCharge: 4400.00,
          allowedAmount: 2350.00,
          paidAmount: 0.00,
          contractualAdjustment: 0.00,
          patientCopay: 0.00,
          patientCoinsurance: 0.00,
          patientDeductible: 0.00,
          disallowedAmount: 0.00,
          lineBalance: 4400.00,
          lineRcmStatus: 'SUBMITTED'
        },
        {
          id: 'line-102-2',
          claimId: 'claim-102',
          lineNumber: 2,
          revenueCode: '0272',
          cptCode: '29877',
          procedureDescription: 'Arthroscopy, knee, debridement/shaving of articular cartilage',
          modifiers: ['59', 'SG'],
          units: 1,
          grossCharge: 1200.00,
          allowedAmount: 600.00,
          paidAmount: 0.00,
          contractualAdjustment: 0.00,
          patientCopay: 0.00,
          patientCoinsurance: 0.00,
          patientDeductible: 0.00,
          disallowedAmount: 0.00,
          lineBalance: 1200.00,
          lineRcmStatus: 'SUBMITTED'
        }
      ]
    },
    {
      id: 'claim-103',
      facilityId: 'fac-naples-01',
      patientControlNumber: 'CLM-2026-0893',
      patientName: 'Devon Hayes',
      patientMrn: 'MRN-77341',
      surgeryId: 103,
      procedureName: 'Diagnostic Colonoscopy w/ Snare Polypectomy',
      surgeonName: 'Dr. Frank Sterling, MD',
      primaryPayerId: 'payer-aetna-comm',
      primaryPayerName: 'Aetna Commercial Health',
      payerType: 'COMMERCIAL',
      billingFormat: BILLING_FORMATS.UB04_INSTITUTIONAL,
      claimType: 'INSTITUTIONAL',
      claimFrequencyType: CLAIM_FREQUENCY_TYPES.ORIGINAL,
      rcmStatus: CLAIM_LIFECYCLE_STATUSES.DENIED,
      scrubStatus: 'SCRUB_PASSED',
      clearinghouseClaimId: 'CH-TRN-984288',
      payerClaimControlNumber: 'ICN-AET-2026-3391',
      transmissionBatchId: 'BATCH-20261018-01',
      initialSubmittedAt: '2026-10-18T11:20:00Z',
      adjudicatedAt: '2026-10-27T10:00:00Z',
      totalGrossCharge: 2450.00,
      totalAllowedAmount: 0.00,
      totalPaidAmount: 0.00,
      totalContractualAdjustment: 0.00,
      totalPatientBalance: 0.00,
      outstandingArBalance: 2450.00,
      dateOfService: '2026-10-16',
      lines: [
        {
          id: 'line-103-1',
          claimId: 'claim-103',
          lineNumber: 1,
          revenueCode: '0490',
          cptCode: '45385',
          procedureDescription: 'Colonoscopy with removal of tumor/polyp by snare technique',
          modifiers: ['SG'],
          units: 1,
          grossCharge: 2450.00,
          allowedAmount: 0.00,
          paidAmount: 0.00,
          contractualAdjustment: 0.00,
          patientCopay: 0.00,
          patientCoinsurance: 0.00,
          patientDeductible: 0.00,
          disallowedAmount: 2450.00,
          lineBalance: 2450.00,
          lineRcmStatus: 'ADJUDICATED_DENIED'
        }
      ]
    },
    {
      id: 'claim-104',
      facilityId: 'fac-naples-01',
      patientControlNumber: 'CLM-2026-0894',
      patientName: 'Sophia Montgomery',
      patientMrn: 'MRN-64218',
      surgeryId: 104,
      procedureName: 'Tympanostomy with General Anesthesia',
      surgeonName: 'Dr. Gregory Vance, MD',
      primaryPayerId: 'payer-united-comm',
      primaryPayerName: 'UnitedHealthcare Commercial',
      payerType: 'COMMERCIAL',
      billingFormat: BILLING_FORMATS.UB04_INSTITUTIONAL,
      claimType: 'INSTITUTIONAL',
      claimFrequencyType: CLAIM_FREQUENCY_TYPES.ORIGINAL,
      rcmStatus: CLAIM_LIFECYCLE_STATUSES.READY_TO_TRANSMIT,
      scrubStatus: 'SCRUB_PASSED',
      clearinghouseClaimId: null,
      payerClaimControlNumber: null,
      transmissionBatchId: null,
      initialSubmittedAt: null,
      adjudicatedAt: null,
      totalGrossCharge: 1980.00,
      totalAllowedAmount: 1100.00,
      totalPaidAmount: 0.00,
      totalContractualAdjustment: 0.00,
      totalPatientBalance: 0.00,
      outstandingArBalance: 1980.00,
      dateOfService: '2026-10-28',
      lines: [
        {
          id: 'line-104-1',
          claimId: 'claim-104',
          lineNumber: 1,
          revenueCode: '0490',
          cptCode: '69436',
          procedureDescription: 'Tympanostomy (requiring insertion of ventilating tube), general anesthesia',
          modifiers: ['50', 'SG'],
          units: 1,
          grossCharge: 1980.00,
          allowedAmount: 1100.00,
          paidAmount: 0.00,
          contractualAdjustment: 0.00,
          patientCopay: 0.00,
          patientCoinsurance: 0.00,
          patientDeductible: 0.00,
          disallowedAmount: 0.00,
          lineBalance: 1980.00,
          lineRcmStatus: 'ENTERED'
        }
      ]
    },
    {
      id: 'claim-105',
      facilityId: 'fac-naples-01',
      patientControlNumber: 'CLM-2026-0895',
      patientName: 'Liam Patrick Gallagher',
      patientMrn: 'MRN-55829',
      surgeryId: 105,
      procedureName: 'Lumbar Microdiscectomy L4-L5',
      surgeonName: 'Dr. Harold Finch, MD',
      primaryPayerId: 'payer-cigna-comm',
      primaryPayerName: 'Cigna Healthcare',
      payerType: 'COMMERCIAL',
      billingFormat: BILLING_FORMATS.UB04_INSTITUTIONAL,
      claimType: 'INSTITUTIONAL',
      claimFrequencyType: CLAIM_FREQUENCY_TYPES.ORIGINAL,
      rcmStatus: CLAIM_LIFECYCLE_STATUSES.SCRUB_FAILED,
      scrubStatus: 'SCRUB_FAILED',
      clearinghouseClaimId: null,
      payerClaimControlNumber: null,
      transmissionBatchId: null,
      initialSubmittedAt: null,
      adjudicatedAt: null,
      totalGrossCharge: 8200.00,
      totalAllowedAmount: 4300.00,
      totalPaidAmount: 0.00,
      totalContractualAdjustment: 0.00,
      totalPatientBalance: 0.00,
      outstandingArBalance: 8200.00,
      dateOfService: '2026-10-29',
      lines: [
        {
          id: 'line-105-1',
          claimId: 'claim-105',
          lineNumber: 1,
          revenueCode: '0490',
          cptCode: '63030',
          procedureDescription: 'Laminotomy with decompression of nerve root, 1 interspace, lumbar',
          modifiers: ['SG'],
          units: 1,
          grossCharge: 8200.00,
          allowedAmount: 4300.00,
          paidAmount: 0.00,
          contractualAdjustment: 0.00,
          patientCopay: 0.00,
          patientCoinsurance: 0.00,
          patientDeductible: 0.00,
          disallowedAmount: 0.00,
          lineBalance: 8200.00,
          lineRcmStatus: 'ENTERED'
        }
      ]
    },
    {
      id: 'claim-106',
      facilityId: 'fac-naples-01',
      patientControlNumber: 'CLM-2026-0896',
      patientName: 'Clara Oswald',
      patientMrn: 'MRN-44210',
      surgeryId: 106,
      procedureName: 'Total Knee Arthroplasty (Outpatient ASC)',
      surgeonName: 'Dr. Sarah Jenkins, MD',
      primaryPayerId: 'payer-medicare-fl',
      primaryPayerName: 'Medicare Part B (Florida First Coast)',
      payerType: 'MEDICARE',
      billingFormat: BILLING_FORMATS.UB04_INSTITUTIONAL,
      claimType: 'INSTITUTIONAL',
      claimFrequencyType: CLAIM_FREQUENCY_TYPES.ORIGINAL,
      rcmStatus: CLAIM_LIFECYCLE_STATUSES.ACCEPTED_PAYER,
      scrubStatus: 'SCRUB_PASSED',
      clearinghouseClaimId: 'CH-TRN-984320',
      payerClaimControlNumber: 'ICN-CMS-2026-1188',
      transmissionBatchId: 'BATCH-20261027-01',
      initialSubmittedAt: '2026-10-27T14:30:00Z',
      adjudicatedAt: null,
      totalGrossCharge: 12500.00,
      totalAllowedAmount: 8400.00,
      totalPaidAmount: 0.00,
      totalContractualAdjustment: 0.00,
      totalPatientBalance: 0.00,
      outstandingArBalance: 12500.00,
      dateOfService: '2026-10-25',
      lines: [
        {
          id: 'line-106-1',
          claimId: 'claim-106',
          lineNumber: 1,
          revenueCode: '0490',
          cptCode: '27447',
          procedureDescription: 'Arthroplasty, knee, condyle and plateau; medial and lateral compartments',
          modifiers: ['LT', 'SG'],
          units: 1,
          grossCharge: 9500.00,
          allowedAmount: 6200.00,
          paidAmount: 0.00,
          contractualAdjustment: 0.00,
          patientCopay: 0.00,
          patientCoinsurance: 0.00,
          patientDeductible: 0.00,
          disallowedAmount: 0.00,
          lineBalance: 9500.00,
          lineRcmStatus: 'SUBMITTED'
        },
        {
          id: 'line-106-2',
          claimId: 'claim-106',
          lineNumber: 2,
          revenueCode: '0272',
          cptCode: 'C1776',
          procedureDescription: 'Joint device (implantable); pin, sleeve, mesh or wedge',
          modifiers: ['SG'],
          units: 1,
          grossCharge: 3000.00,
          allowedAmount: 2200.00,
          paidAmount: 0.00,
          contractualAdjustment: 0.00,
          patientCopay: 0.00,
          patientCoinsurance: 0.00,
          patientDeductible: 0.00,
          disallowedAmount: 0.00,
          lineBalance: 3000.00,
          lineRcmStatus: 'SUBMITTED'
        }
      ]
    }
  ];

  const auditHistory = [
    {
      id: 'audit-001',
      claimId: 'claim-101',
      fromStatus: 'DRAFT',
      toStatus: 'READY_TO_SCRUB',
      transitionEvent: 'SUBMIT_TO_SCRUBBER',
      actorRole: 'biller',
      timestamp: '2026-10-14T10:00:00Z',
      notes: 'Initial billing review complete. Initiated pre-submission NCCI rule validation.'
    },
    {
      id: 'audit-002',
      claimId: 'claim-101',
      fromStatus: 'READY_TO_SCRUB',
      toStatus: 'SCRUB_PASSED',
      transitionEvent: 'SCRUB_VALIDATION_SUCCESS',
      actorRole: 'system',
      timestamp: '2026-10-14T10:01:15Z',
      notes: 'Zero fatal errors. Passed NCCI PTP edits and POS 24 validation.'
    },
    {
      id: 'audit-003',
      claimId: 'claim-101',
      fromStatus: 'READY_TO_TRANSMIT',
      toStatus: 'TRANSMITTED',
      transitionEvent: 'EDI_837_BATCH_DISPATCH',
      actorRole: 'system',
      timestamp: '2026-10-15T09:30:00Z',
      notes: 'Dispatched in batch BATCH-20261015-01 via Clearinghouse SFTP.'
    },
    {
      id: 'audit-004',
      claimId: 'claim-101',
      fromStatus: 'TRANSMITTED',
      toStatus: 'PAID',
      transitionEvent: 'ERA_835_AUTO_POST',
      actorRole: 'system',
      timestamp: '2026-10-24T14:15:00Z',
      notes: 'Remittance ERA received. Paid $1,456.00 with $2,030.00 contractual write-off and $364.00 coinsurance.'
    },
    {
      id: 'audit-005',
      claimId: 'claim-103',
      fromStatus: 'IN_ADJUDICATION',
      toStatus: 'DENIED',
      transitionEvent: 'CARC_DENIAL_POSTED',
      actorRole: 'system',
      timestamp: '2026-10-27T10:00:00Z',
      notes: 'Payer denied claim. Reason CARC 16: Lacks prior authorization on medical necessity.'
    }
  ];

  return { claims, auditHistory };
}

export const claimsService = {
  CLAIM_LIFECYCLE_STATUSES,
  BILLING_FORMATS,
  CLAIM_FREQUENCY_TYPES,
  CLAIM_STATUS_CONFIG,
  ASC_REVENUE_CODES,
  calculateClaimBalances,
  validateStateTransition,
  calculateFacilityRcmKpis,
  getBaselineSampleData
};

export default claimsService;

