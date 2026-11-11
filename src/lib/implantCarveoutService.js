/**
 * ==============================================================================
 * IMPLANT CARVEOUT DETECTION & RECOVERY SERVICE (PHASE 97)
 * ==============================================================================
 * Authoritative deterministic engine for surgical implant and medical device
 * carve-out detection, contractual allowable calculation, priority ranking,
 * vendor invoice audit, and claim dispute generation in ASCs.
 * ==============================================================================
 */

// ==============================================================================
// 1. TAXONOMY & ENUMERATIONS
// ==============================================================================

export const REIMBURSEMENT_MODELS = {
  INVOICE_COST_PLUS_PERCENT: {
    code: 'INVOICE_COST_PLUS_PERCENT',
    label: 'Invoice Cost + Markup %',
    description: 'Contractual allowable equals vendor invoice acquisition cost multiplied by (1 + markup %)'
  },
  PASS_THROUGH_AT_COST: {
    code: 'PASS_THROUGH_AT_COST',
    label: 'Pass-Through at Cost (100%)',
    description: 'Reimbursed dollar-for-dollar at actual vendor acquisition invoice cost without markup'
  },
  INVOICE_PLUS_FIXED_FEE: {
    code: 'INVOICE_PLUS_FIXED_FEE',
    label: 'Invoice Cost + Fixed Handling Fee',
    description: 'Invoice cost plus contractually agreed handling or processing dollar fee per case'
  },
  THRESHOLD_OVERAGE_PLUS_MARKUP: {
    code: 'THRESHOLD_OVERAGE_PLUS_MARKUP',
    label: 'Threshold Overage + Markup %',
    description: 'Carve-out applies to invoice cost exceeding stop-loss threshold, plus markup percentage'
  },
  FEE_SCHEDULE_FIXED: {
    code: 'FEE_SCHEDULE_FIXED',
    label: 'Fixed Device Fee Schedule',
    description: 'Contractual fixed fee allowance per device HCPCS / C-code'
  }
};

export const LEAKAGE_TYPES = {
  UNBILLED_IMPLANT: {
    code: 'UNBILLED_IMPLANT',
    label: 'Unbilled Implant Carve-Out',
    severity: 'CRITICAL',
    description: 'Implant logged in OR records and purchased, but device HCPCS line was omitted from 837 claim'
  },
  ZERO_PAID_BUNDLED: {
    code: 'ZERO_PAID_BUNDLED',
    label: 'Zero-Paid / Erroneously Bundled',
    severity: 'HIGH',
    description: 'Device was billed on claim, but payer adjudicated at $0.00 (CARC 97/45) in violation of carve-out terms'
  },
  MISSING_INVOICE_DENIAL: {
    code: 'MISSING_INVOICE_DENIAL',
    label: 'Missing Invoice Denial (CARC 16)',
    severity: 'HIGH',
    description: 'Payer denied or pended line (CARC 16 / N225) requiring vendor manufacturer invoice'
  },
  MARKUP_UNDERPAID: {
    code: 'MARKUP_UNDERPAID',
    label: 'Contractual Markup Omitted',
    severity: 'MEDIUM',
    description: 'Payer paid invoice acquisition cost at 100% but omitted contractually required markup percentage'
  },
  THRESHOLD_CALCULATION_ERROR: {
    code: 'THRESHOLD_CALCULATION_ERROR',
    label: 'Threshold Calculation Error',
    severity: 'MEDIUM',
    description: 'Payer deducted excessive stop-loss threshold or miscalculated per-item vs aggregate deductible'
  }
};

export const RECOVERY_ACTION_TIERS = {
  TIER_1_CRITICAL_RECOVERY: {
    code: 'TIER_1_CRITICAL_RECOVERY',
    label: 'Tier 1: Critical High-Dollar Recovery',
    badgeColor: '#dc2626',
    rank: 1,
    minScore: 80.00,
    action: 'Generate immediate corrected 837 claim with attached vendor invoice or priority appeal.'
  },
  TIER_2_HIGH_YIELD_DISPUTE: {
    code: 'TIER_2_HIGH_YIELD_DISPUTE',
    label: 'Tier 2: High-Yield Contractual Dispute',
    badgeColor: '#ea580c',
    rank: 2,
    minScore: 65.00,
    action: 'Submit formal carve-out underpayment appeal with contract clause and invoice proof.'
  },
  TIER_3_DOCUMENTATION_CURE: {
    code: 'TIER_3_DOCUMENTATION_CURE',
    label: 'Tier 3: Documentation Cure Hold',
    badgeColor: '#0284c7',
    rank: 3,
    minScore: 45.00,
    action: 'Acquire verified vendor manufacturer invoice from Materials Management before filing.'
  },
  TIER_4_LOW_VARIANCE_MONITOR: {
    code: 'TIER_4_LOW_VARIANCE_MONITOR',
    label: 'Tier 4: Low Variance Monitor',
    badgeColor: '#64748b',
    rank: 4,
    minScore: 25.00,
    action: 'Batch review or secondary audit for low dollar short-pays.'
  },
  TIER_5_EXPIRED_OR_NON_CARVED: {
    code: 'TIER_5_EXPIRED_OR_NON_CARVED',
    label: 'Tier 5: Expired / Ineligible',
    badgeColor: '#94a3b8',
    rank: 5,
    minScore: 0.00,
    action: 'Timely filing expired or non-carved plan; close to contractual adjustment.'
  }
};

export const DOCUMENTATION_TIERS = {
  INVOICE_AND_LOG_VERIFIED: {
    code: 'INVOICE_AND_LOG_VERIFIED',
    label: 'Invoice Attached + OR Log + UDI Verified',
    score: 100.00
  },
  INVOICE_ON_FILE_NO_UDI: {
    code: 'INVOICE_ON_FILE_NO_UDI',
    label: 'Invoice on File (UDI Barcode Pending)',
    score: 80.00
  },
  LOG_VERIFIED_INVOICE_PENDING: {
    code: 'LOG_VERIFIED_INVOICE_PENDING',
    label: 'OR Log Verified (Invoice Pending Vendor)',
    score: 45.00
  },
  DOCUMENTATION_MISSING: {
    code: 'DOCUMENTATION_MISSING',
    label: 'Documentation Deficit',
    score: 10.00
  }
};

export const OVERTURN_LIKELIHOOD_TIERS = {
  CONTRACT_CARVEOUT_VIOLATION: {
    code: 'CONTRACT_CARVEOUT_VIOLATION',
    label: 'Payer Contract Violation (Bundled Claim Line)',
    score: 95.00
  },
  MISSING_INVOICE_CURE: {
    code: 'MISSING_INVOICE_CURE',
    label: 'Missing Invoice Denial (Cured with Attachment)',
    score: 90.00
  },
  MARKUP_RECONCILIATION: {
    code: 'MARKUP_RECONCILIATION',
    label: 'Mathematical Markup Discrepancy',
    score: 85.00
  },
  THRESHOLD_DISPUTE: {
    code: 'THRESHOLD_DISPUTE',
    label: 'Stop-Loss / Threshold Calculation Dispute',
    score: 60.00
  },
  UNLISTED_DEVICE_REVIEW: {
    code: 'UNLISTED_DEVICE_REVIEW',
    label: 'Unlisted HCPCS Device Code Review',
    score: 40.00
  }
};

export const DISCREPANCY_STATUSES = {
  DETECTED: { code: 'DETECTED', label: 'Carve-Out Discrepancy Detected', color: '#64748b' },
  INVOICE_ACQUISITION_HOLD: { code: 'INVOICE_ACQUISITION_HOLD', label: 'Invoice Acquisition Hold', color: '#f59e0b' },
  INVOICE_ATTACHED: { code: 'INVOICE_ATTACHED', label: 'Invoice Verified & Attached', color: '#0284c7' },
  CORRECTED_CLAIM_QUEUED: { code: 'CORRECTED_CLAIM_QUEUED', label: 'Corrected 837 Claim Staged', color: '#10b981' },
  DISPUTE_SUBMITTED: { code: 'DISPUTE_SUBMITTED', label: 'Formal Carve-Out Appeal Filed', color: '#0d9488' },
  RECOVERED: { code: 'RECOVERED', label: 'Carve-Out Recovered & Reconciled', color: '#059669' },
  DISMISSED_NOT_ELIGIBLE: { code: 'DISMISSED_NOT_ELIGIBLE', label: 'Audited Non-Carved Out', color: '#64748b' },
  EXPIRED_UNRECOVERABLE: { code: 'EXPIRED_UNRECOVERABLE', label: 'Timely Filing Expired', color: '#991b1b' }
};

export const SCORING_WEIGHTS = {
  VARIANCE: 0.40,
  DOCUMENTATION: 0.25,
  OVERTURN_LIKELIHOOD: 0.20,
  FILING_URGENCY: 0.15
};

export const DEFAULT_IMPLANT_BENCHMARK = 2500.00;

// ==============================================================================
// 2. AUTHORITATIVE DETERMINISTIC CALCULATION ALGORITHMS
// ==============================================================================

/**
 * Calculates expected carve-out reimbursement based on contract terms.
 */
export function calculateExpectedCarveout(reimbursementModel, invoiceCost, options = {}) {
  const cost = Math.max(0, Number(invoiceCost) || 0);
  const markup = Math.max(0, Number(options.markupPercentage) || 0);
  const fixedFee = Math.max(0, Number(options.fixedFeeAmount) || 0);
  const threshold = Math.max(0, Number(options.minThreshold) || 0);
  const feeRate = Math.max(0, Number(options.feeScheduleRate) || 0);
  const qty = Math.max(1, Number(options.quantityImplanted) || 1);
  const cap = options.maxReimbursementCap ? Number(options.maxReimbursementCap) : null;

  let expected = 0.00;

  switch (reimbursementModel) {
    case 'INVOICE_COST_PLUS_PERCENT':
      expected = cost * (1 + markup);
      break;

    case 'PASS_THROUGH_AT_COST':
      expected = cost;
      break;

    case 'INVOICE_PLUS_FIXED_FEE':
      expected = cost + fixedFee;
      break;

    case 'THRESHOLD_OVERAGE_PLUS_MARKUP': {
      const overage = Math.max(0, cost - threshold);
      expected = overage * (1 + markup);
      break;
    }

    case 'FEE_SCHEDULE_FIXED':
      expected = feeRate * qty;
      break;

    default:
      expected = cost;
  }

  // Enforce contract cap if defined and greater than zero
  if (cap !== null && cap > 0 && expected > cap) {
    expected = cap;
  }

  return Number(expected.toFixed(2));
}

/**
 * Deterministic variance invariant: Expected Carve-Out minus Payer Paid Carve-Out.
 */
export function calculateCarveoutVariance(expectedAmount, payerPaidAmount) {
  const expected = Math.max(0, Number(expectedAmount) || 0);
  const paid = Math.max(0, Number(payerPaidAmount) || 0);
  const diff = expected - paid;
  return Math.max(0, Number(diff.toFixed(2)));
}

/**
 * Normalizes carve-out variance against high-cost implant benchmark ($2,500.00).
 */
export function calculateVarianceScore(variance, benchmark = DEFAULT_IMPLANT_BENCHMARK) {
  const v = Math.max(0, Number(variance) || 0);
  const bench = Number(benchmark) > 0 ? Number(benchmark) : DEFAULT_IMPLANT_BENCHMARK;
  if (v <= 0) return 0.00;
  const score = Math.min(100.00, (v / bench) * 100.00);
  return Number(score.toFixed(2));
}

/**
 * Maps documentation readiness tier to authoritative subscore (0-100).
 */
export function calculateDocumentationScore(documentationTier) {
  if (typeof documentationTier === 'string' && DOCUMENTATION_TIERS[documentationTier]) {
    return DOCUMENTATION_TIERS[documentationTier].score;
  }
  return DOCUMENTATION_TIERS.DOCUMENTATION_MISSING.score;
}

/**
 * Maps overturn likelihood tier to authoritative subscore (0-100).
 */
export function calculateOverturnScore(overturnTier) {
  if (typeof overturnTier === 'string' && OVERTURN_LIKELIHOOD_TIERS[overturnTier]) {
    return OVERTURN_LIKELIHOOD_TIERS[overturnTier].score;
  }
  return OVERTURN_LIKELIHOOD_TIERS.UNLISTED_DEVICE_REVIEW.score;
}

/**
 * Filing Urgency Score based on statutory days remaining:
 * - 1 - 15 days: 100.00 (Critical urgency)
 * - 16 - 30 days: 80.00
 * - 31 - 60 days: 60.00
 * - 61 - 90 days: 40.00
 * - > 90 days: 20.00
 * - < 0 days (Expired): 0.00
 */
export function calculateFilingUrgencyScore(daysRemaining) {
  const days = Number(daysRemaining);
  if (isNaN(days) || days < 0) return 0.00;
  if (days <= 15) return 100.00;
  if (days <= 30) return 80.00;
  if (days <= 60) return 60.00;
  if (days <= 90) return 40.00;
  return 20.00;
}

/**
 * Computes composite Carve-Out Priority Score (0.00 - 100.00).
 */
export function calculateCarveoutPriorityScore(varScore, docScore, overturnScore, urgencyScore) {
  const v = Math.max(0, Math.min(100, Number(varScore) || 0));
  const d = Math.max(0, Math.min(100, Number(docScore) || 0));
  const o = Math.max(0, Math.min(100, Number(overturnScore) || 0));
  const u = Math.max(0, Math.min(100, Number(urgencyScore) || 0));

  const composite = (v * SCORING_WEIGHTS.VARIANCE) +
                    (d * SCORING_WEIGHTS.DOCUMENTATION) +
                    (o * SCORING_WEIGHTS.OVERTURN_LIKELIHOOD) +
                    (u * SCORING_WEIGHTS.FILING_URGENCY);

  return Number(composite.toFixed(2));
}

/**
 * Maps composite score and days remaining into actionable recovery action tiers.
 */
export function classifyRecoveryActionTier(priorityScore, daysRemaining) {
  const days = Number(daysRemaining);
  const score = Number(priorityScore) || 0;

  // Invariant: Expired filing window is forced to Tier 5
  if (!isNaN(days) && days < 0) {
    return RECOVERY_ACTION_TIERS.TIER_5_EXPIRED_OR_NON_CARVED.code;
  }

  if (score >= RECOVERY_ACTION_TIERS.TIER_1_CRITICAL_RECOVERY.minScore) {
    return RECOVERY_ACTION_TIERS.TIER_1_CRITICAL_RECOVERY.code;
  }
  if (score >= RECOVERY_ACTION_TIERS.TIER_2_HIGH_YIELD_DISPUTE.minScore) {
    return RECOVERY_ACTION_TIERS.TIER_2_HIGH_YIELD_DISPUTE.code;
  }
  if (score >= RECOVERY_ACTION_TIERS.TIER_3_DOCUMENTATION_CURE.minScore) {
    return RECOVERY_ACTION_TIERS.TIER_3_DOCUMENTATION_CURE.code;
  }
  if (score >= RECOVERY_ACTION_TIERS.TIER_4_LOW_VARIANCE_MONITOR.minScore) {
    return RECOVERY_ACTION_TIERS.TIER_4_LOW_VARIANCE_MONITOR.code;
  }
  return RECOVERY_ACTION_TIERS.TIER_5_EXPIRED_OR_NON_CARVED.code;
}

/**
 * Scores a full carve-out discrepancy record authoritatively.
 */
export function scoreCarveoutDiscrepancy(record, benchmark = DEFAULT_IMPLANT_BENCHMARK) {
  const model = record.reimbursement_model || 'INVOICE_COST_PLUS_PERCENT';
  const invoiceCost = Math.max(0, Number(record.invoice_cost) || 0);
  const payerPaid = Math.max(0, Number(record.payer_paid_carveout) || 0);

  const expectedCarveout = calculateExpectedCarveout(model, invoiceCost, {
    markupPercentage: record.markup_percentage,
    fixedFeeAmount: record.fixed_fee_amount,
    minThreshold: record.min_threshold,
    maxReimbursementCap: record.max_reimbursement_cap,
    feeScheduleRate: record.fee_schedule_rate,
    quantityImplanted: record.quantity_implanted
  });

  const variance = calculateCarveoutVariance(expectedCarveout, payerPaid);
  const daysRemaining = Number(record.days_until_deadline);

  const varScore = calculateVarianceScore(variance, benchmark);
  const docScore = calculateDocumentationScore(record.documentation_readiness_tier);
  const overturnScore = calculateOverturnScore(record.overturn_tier);
  const urgencyScore = calculateFilingUrgencyScore(daysRemaining);

  let compositeScore = calculateCarveoutPriorityScore(varScore, docScore, overturnScore, urgencyScore);
  let actionTier = classifyRecoveryActionTier(compositeScore, daysRemaining);
  let status = record.discrepancy_status || 'DETECTED';

  // Rule 4 Invariant: Expired timely filing forces status to EXPIRED_UNRECOVERABLE
  if (daysRemaining < 0) {
    status = 'EXPIRED_UNRECOVERABLE';
    actionTier = RECOVERY_ACTION_TIERS.TIER_5_EXPIRED_OR_NON_CARVED.code;
  }

  return {
    ...record,
    expected_carveout_amount: expectedCarveout,
    carveout_variance: variance,
    variance_score: varScore,
    documentation_score: docScore,
    overturn_score: overturnScore,
    urgency_score: urgencyScore,
    carveout_priority_score: compositeScore,
    recovery_action_tier: actionTier,
    discrepancy_status: status,
    updated_at: new Date().toISOString()
  };
}

// ==============================================================================
// 3. BASELINE REALISTIC IMPLANT CARVEOUT DATASET
// ==============================================================================

const INITIAL_IMPLANT_DISCREPANCIES = [
  {
    id: 'cd-001',
    facility_id: 'fac-surgical-01',
    case_id: 'case-901',
    claim_id: 'clm-8801',
    claim_number: 'CLM-2026-08801',
    patient_id: 'pat-101',
    patient_name: 'Arthur Pendelton',
    patient_mrn: 'MRN-10192',
    payer_id: 'pyr-bcbs',
    payer_name: 'Blue Cross Blue Shield',
    primary_cpt: '27447',
    procedure_name: 'Total Knee Arthroplasty (TKR)',
    date_of_service: '2026-10-12',
    remittance_date: '2026-10-28',
    device_name: 'Zimmer Biomet Persona Trabecular Metal Knee Construct',
    device_category: 'ORTHOPEDIC_IMPLANT',
    hcpcs_device_code: 'C1776',
    vendor_name: 'Zimmer Biomet',
    catalog_number: 'ZB-42-0199',
    udi_di: '(01)00887123456789',
    quantity_implanted: 1,
    invoice_number: 'INV-ZB-98124',
    invoice_cost: 5800.00,
    invoice_attached: true,
    invoice_attachment_url: '/invoices/INV-ZB-98124.pdf',
    reimbursement_model: 'INVOICE_COST_PLUS_PERCENT',
    markup_percentage: 0.1200, // 12% markup => Expected: $6,496.00
    billed_carveout_amount: 6500.00,
    payer_paid_carveout: 0.00,
    carveout_leakage_type: 'ZERO_PAID_BUNDLED',
    documentation_readiness_tier: 'INVOICE_AND_LOG_VERIFIED',
    overturn_tier: 'CONTRACT_CARVEOUT_VIOLATION',
    payer_carc_code: 'CARC-97',
    payer_rarc_code: 'N432',
    filing_deadline: '2026-12-15',
    days_until_deadline: 18,
    discrepancy_status: 'INVOICE_ATTACHED',
    notes: 'Payer adjudicated C1776 at $0 stating bundled into 27447. Contract Section 8.4 mandates Invoice + 12% carve-out.'
  },
  {
    id: 'cd-002',
    facility_id: 'fac-surgical-01',
    case_id: 'case-902',
    claim_id: 'clm-8802',
    claim_number: 'CLM-2026-08802',
    patient_id: 'pat-102',
    patient_name: 'Eleanor Vance',
    patient_mrn: 'MRN-10244',
    payer_id: 'pyr-uhc',
    payer_name: 'UnitedHealthcare Commercial',
    primary_cpt: '22612',
    procedure_name: 'Lumbar Arthrodesis with Interbody Fusion',
    date_of_service: '2026-09-24',
    remittance_date: '2026-10-18',
    device_name: 'Medtronic PEEK Interbody Cage & Titanium Pedicle Screws',
    device_category: 'SPINE_HARDWARE',
    hcpcs_device_code: 'C1713',
    vendor_name: 'Medtronic Spine',
    catalog_number: 'MDT-SPN-7721',
    udi_di: '(01)00723456789012',
    quantity_implanted: 1,
    invoice_number: 'INV-MDT-88219',
    invoice_cost: 7400.00,
    invoice_attached: false,
    invoice_attachment_url: null,
    reimbursement_model: 'PASS_THROUGH_AT_COST',
    markup_percentage: 0.0000, // Pass-through at Cost => Expected: $7,400.00
    billed_carveout_amount: 8500.00,
    payer_paid_carveout: 0.00,
    carveout_leakage_type: 'MISSING_INVOICE_DENIAL',
    documentation_readiness_tier: 'LOG_VERIFIED_INVOICE_PENDING',
    overturn_tier: 'MISSING_INVOICE_CURE',
    payer_carc_code: 'CARC-16',
    payer_rarc_code: 'N225',
    filing_deadline: '2026-12-01',
    days_until_deadline: 12,
    discrepancy_status: 'INVOICE_ACQUISITION_HOLD',
    notes: 'Payer denied C1713 with CARC 16/N225 (Missing manufacturer invoice). Vendor invoice requested from Medtronic Materials rep.'
  },
  {
    id: 'cd-003',
    facility_id: 'fac-surgical-01',
    case_id: 'case-903',
    claim_id: 'clm-8803',
    claim_number: 'CLM-2026-08803',
    patient_id: 'pat-103',
    patient_name: 'Marcus Brody',
    patient_mrn: 'MRN-10388',
    payer_id: 'pyr-aetna',
    payer_name: 'Aetna Open Choice',
    primary_cpt: '29888',
    procedure_name: 'Arthroscopic ACL Reconstruction',
    date_of_service: '2026-10-05',
    remittance_date: '2026-10-25',
    device_name: 'Smith & Nephew Endobutton CL & Bio-Interference Screw',
    device_category: 'ORTHOPEDIC_IMPLANT',
    hcpcs_device_code: 'C1713',
    vendor_name: 'Smith & Nephew',
    catalog_number: 'SN-ACL-3310',
    udi_di: '(01)00654321987654',
    quantity_implanted: 1,
    invoice_number: 'INV-SN-54210',
    invoice_cost: 1850.00,
    invoice_attached: true,
    invoice_attachment_url: '/invoices/INV-SN-54210.pdf',
    reimbursement_model: 'INVOICE_COST_PLUS_PERCENT',
    markup_percentage: 0.1500, // 15% markup => Expected: $2,127.50
    billed_carveout_amount: 0.00, // UNBILLED!
    payer_paid_carveout: 0.00,
    carveout_leakage_type: 'UNBILLED_IMPLANT',
    documentation_readiness_tier: 'INVOICE_AND_LOG_VERIFIED',
    overturn_tier: 'CONTRACT_CARVEOUT_VIOLATION',
    payer_carc_code: null,
    payer_rarc_code: null,
    filing_deadline: '2027-01-15',
    days_until_deadline: 45,
    discrepancy_status: 'DETECTED',
    notes: 'OR consumption log and purchase order confirmed. Implant line was completely omitted on initial 837 claim submission. Generating corrected claim (Frequency 7).'
  },
  {
    id: 'cd-004',
    facility_id: 'fac-surgical-01',
    case_id: 'case-904',
    claim_id: 'clm-8804',
    claim_number: 'CLM-2026-08804',
    patient_id: 'pat-104',
    patient_name: 'Regina Phalange',
    patient_mrn: 'MRN-10452',
    payer_id: 'pyr-cigna',
    payer_name: 'Cigna HealthSpring',
    primary_cpt: '63685',
    procedure_name: 'Insertion of Spinal Cord Neurostimulator Generator',
    date_of_service: '2026-09-15',
    remittance_date: '2026-10-10',
    device_name: 'Boston Scientific Precision Montage IPG Neurostimulator',
    device_category: 'NEUROSTIMULATOR',
    hcpcs_device_code: 'C1767',
    vendor_name: 'Boston Scientific',
    catalog_number: 'BSC-NM-9901',
    udi_di: '(01)00876543210987',
    quantity_implanted: 1,
    invoice_number: 'INV-BSC-10293',
    invoice_cost: 14500.00,
    invoice_attached: true,
    invoice_attachment_url: '/invoices/INV-BSC-10293.pdf',
    reimbursement_model: 'INVOICE_COST_PLUS_PERCENT',
    markup_percentage: 0.1000, // 10% markup => Expected: $15,950.00
    billed_carveout_amount: 17500.00,
    payer_paid_carveout: 14500.00, // Paid only at cost ($14,500), short by $1,450
    carveout_leakage_type: 'MARKUP_UNDERPAID',
    documentation_readiness_tier: 'INVOICE_AND_LOG_VERIFIED',
    overturn_tier: 'MARKUP_RECONCILIATION',
    payer_carc_code: 'CARC-45',
    payer_rarc_code: 'M127',
    filing_deadline: '2026-12-20',
    days_until_deadline: 25,
    discrepancy_status: 'DISPUTE_SUBMITTED',
    notes: 'Cigna paid base invoice cost at $14,500 but omitted 10% contractual markup ($1,450.00 variance). Formal underpayment demand packet filed.'
  },
  {
    id: 'cd-005',
    facility_id: 'fac-surgical-01',
    case_id: 'case-905',
    claim_id: 'clm-8805',
    claim_number: 'CLM-2026-08805',
    patient_id: 'pat-105',
    patient_name: 'Howard Wolowitz',
    patient_mrn: 'MRN-10599',
    payer_id: 'pyr-humana',
    payer_name: 'Humana Choice Care',
    primary_cpt: '63650',
    procedure_name: 'Percutaneous Implantation of Neurostimulator Lead',
    date_of_service: '2026-10-02',
    remittance_date: '2026-10-22',
    device_name: 'Abbott St. Jude Medical 8-Channel Trial Neurostim Lead',
    device_category: 'NEUROSTIMULATOR',
    hcpcs_device_code: 'C1883',
    vendor_name: 'Abbott Neuromodulation',
    catalog_number: 'ABT-LD-881',
    udi_di: '(01)00345678901234',
    quantity_implanted: 1,
    invoice_number: 'INV-ABT-77441',
    invoice_cost: 3200.00,
    invoice_attached: true,
    invoice_attachment_url: '/invoices/INV-ABT-77441.pdf',
    reimbursement_model: 'THRESHOLD_OVERAGE_PLUS_MARKUP',
    min_threshold: 500.00, // ($3,200 - $500) * 1.10 = $2,700 * 1.10 = $2,970.00
    markup_percentage: 0.1000,
    billed_carveout_amount: 3500.00,
    payer_paid_carveout: 2200.00, // Underpaid by $770 due to miscalculated deductible
    carveout_leakage_type: 'THRESHOLD_CALCULATION_ERROR',
    documentation_readiness_tier: 'INVOICE_AND_LOG_VERIFIED',
    overturn_tier: 'THRESHOLD_DISPUTE',
    payer_carc_code: 'CARC-45',
    payer_rarc_code: 'N382',
    filing_deadline: '2027-01-05',
    days_until_deadline: 35,
    discrepancy_status: 'DETECTED',
    notes: 'Humana deducted $1,000 threshold instead of contractual $500 stop-loss deductible. Underpaid by $770.00.'
  },
  {
    id: 'cd-006',
    facility_id: 'fac-surgical-01',
    case_id: 'case-906',
    claim_id: 'clm-8806',
    claim_number: 'CLM-2026-08806',
    patient_id: 'pat-106',
    patient_name: 'Claire Dunphy',
    patient_mrn: 'MRN-10688',
    payer_id: 'pyr-wc-travelers',
    payer_name: 'Travelers Workers Compensation',
    primary_cpt: '27130',
    procedure_name: 'Total Hip Arthroplasty (THA)',
    date_of_service: '2026-09-08',
    remittance_date: '2026-10-01',
    device_name: 'Stryker Trident II Acetabular Cup & Accolade II Stem',
    device_category: 'ORTHOPEDIC_IMPLANT',
    hcpcs_device_code: 'C1776',
    vendor_name: 'Stryker Orthopaedics',
    catalog_number: 'STR-THA-9002',
    udi_di: '(01)00543210987654',
    quantity_implanted: 1,
    invoice_number: 'INV-STR-49921',
    invoice_cost: 6200.00,
    invoice_attached: true,
    invoice_attachment_url: '/invoices/INV-STR-49921.pdf',
    reimbursement_model: 'INVOICE_PLUS_FIXED_FEE',
    fixed_fee_amount: 350.00, // Expected: $6,550.00
    billed_carveout_amount: 7200.00,
    payer_paid_carveout: 0.00,
    carveout_leakage_type: 'ZERO_PAID_BUNDLED',
    documentation_readiness_tier: 'INVOICE_AND_LOG_VERIFIED',
    overturn_tier: 'CONTRACT_CARVEOUT_VIOLATION',
    payer_carc_code: 'CARC-97',
    payer_rarc_code: 'N432',
    filing_deadline: '2026-11-20',
    days_until_deadline: 7, // CRITICAL: 7 days left!
    discrepancy_status: 'CORRECTED_CLAIM_QUEUED',
    notes: 'Workers Comp bundled $6,200 implant into procedure fee. Urgent timely filing deadline in 7 days. Staged for clearinghouse.'
  },
  {
    id: 'cd-007',
    facility_id: 'fac-surgical-01',
    case_id: 'case-907',
    claim_id: 'clm-8807',
    claim_number: 'CLM-2026-08807',
    patient_id: 'pat-107',
    patient_name: 'Mitchell Pritchett',
    patient_mrn: 'MRN-10755',
    payer_id: 'pyr-aetna',
    payer_name: 'Aetna Open Choice',
    primary_cpt: '66984',
    procedure_name: 'Extracapsular Cataract Extraction with IOL',
    date_of_service: '2026-05-10',
    remittance_date: '2026-06-02',
    device_name: 'Alcon AcrySof IQ Toric Extended Depth Intraocular Lens',
    device_category: 'OPHTHALMIC_IOL',
    hcpcs_device_code: 'L8699',
    vendor_name: 'Alcon Surgical',
    catalog_number: 'ALC-IOL-88',
    udi_di: '(01)00123456789012',
    quantity_implanted: 1,
    invoice_number: 'INV-ALC-3382',
    invoice_cost: 1200.00,
    invoice_attached: true,
    invoice_attachment_url: '/invoices/INV-ALC-3382.pdf',
    reimbursement_model: 'PASS_THROUGH_AT_COST',
    billed_carveout_amount: 1400.00,
    payer_paid_carveout: 0.00,
    carveout_leakage_type: 'ZERO_PAID_BUNDLED',
    documentation_readiness_tier: 'INVOICE_AND_LOG_VERIFIED',
    overturn_tier: 'CONTRACT_CARVEOUT_VIOLATION',
    payer_carc_code: 'CARC-97',
    payer_rarc_code: 'N432',
    filing_deadline: '2026-10-10',
    days_until_deadline: -32, // EXPIRED!
    discrepancy_status: 'EXPIRED_UNRECOVERABLE',
    notes: 'Aetna bundled premium toric IOL. Filing deadline elapsed 32 days ago. Locked as unrecoverable write-off.'
  }
];

// ==============================================================================
// 4. IMPLANT CARVEOUT STORE & SERVICE CLASS
// ==============================================================================

export class ImplantCarveoutStore {
  constructor() {
    this.storageKey = 'ascanalyst_implant_carveout_discrepancies_v1';
    this.discrepancies = this.loadState();
  }

  loadState() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(this.storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.map(d => scoreCarveoutDiscrepancy(d));
          }
        }
      }
    } catch {
      // Fallback
    }
    return INITIAL_IMPLANT_DISCREPANCIES.map(d => scoreCarveoutDiscrepancy(d));
  }

  saveState() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(this.storageKey, JSON.stringify(this.discrepancies));
      }
    } catch {
      // Fallback
    }
  }

  /**
   * Returns all discrepancies sorted by Rule 5 Invariant:
   * 1. recovery_action_tier ASC (Tier 1 first)
   * 2. carveout_variance DESC
   * 3. days_until_deadline ASC
   */
  getAllDiscrepancies(facilityId = null) {
    let list = facilityId
      ? this.discrepancies.filter(d => d.facility_id === facilityId)
      : [...this.discrepancies];

    const getRank = (tierCode) => {
      return RECOVERY_ACTION_TIERS[tierCode] ? RECOVERY_ACTION_TIERS[tierCode].rank : 99;
    };

    return list.sort((a, b) => {
      const rankA = getRank(a.recovery_action_tier);
      const rankB = getRank(b.recovery_action_tier);
      if (rankA !== rankB) return rankA - rankB;

      if (b.carveout_variance !== a.carveout_variance) {
        return b.carveout_variance - a.carveout_variance;
      }

      return a.days_until_deadline - b.days_until_deadline;
    });
  }

  getDiscrepancyById(id) {
    return this.discrepancies.find(d => d.id === id) || null;
  }

  /**
   * Attaches vendor manufacturer invoice, transitioning status to INVOICE_ATTACHED
   * and upgrading documentation readiness.
   */
  attachInvoice(discrepancyId, invoiceNumber, invoiceUrl = null, verifiedCost = null) {
    const idx = this.discrepancies.findIndex(d => d.id === discrepancyId);
    if (idx === -1) throw new Error(`Carve-Out Discrepancy ${discrepancyId} not found.`);

    if (!invoiceNumber || invoiceNumber.trim().length < 3) {
      throw new Error('Valid vendor invoice number is mandatory.');
    }

    const d = this.discrepancies[idx];
    const cost = verifiedCost !== null && Number(verifiedCost) > 0 ? Number(verifiedCost) : d.invoice_cost;

    const updated = {
      ...d,
      invoice_number: invoiceNumber,
      invoice_cost: cost,
      invoice_attached: true,
      invoice_attachment_url: invoiceUrl || `/invoices/${invoiceNumber}.pdf`,
      documentation_readiness_tier: 'INVOICE_AND_LOG_VERIFIED',
      discrepancy_status: 'INVOICE_ATTACHED',
      updated_at: new Date().toISOString()
    };

    this.discrepancies[idx] = scoreCarveoutDiscrepancy(updated);
    this.saveState();
    return this.discrepancies[idx];
  }

  /**
   * Generates formal dispute packet or corrected claim.
   * Requires invoice_attached = true per Rule 3 Invariant.
   */
  generateDisputePacket(discrepancyId, disputeType = 'CORRECTED_CLAIM', notes = '') {
    const idx = this.discrepancies.findIndex(d => d.id === discrepancyId);
    if (idx === -1) throw new Error(`Carve-Out Discrepancy ${discrepancyId} not found.`);

    const d = this.discrepancies[idx];

    // Rule 3 Invariant: Invoice Attachment Gate
    if (!d.invoice_attached) {
      throw new Error('Cannot file carve-out dispute without verified vendor manufacturer invoice.');
    }

    if (d.days_until_deadline < 0) {
      throw new Error('Cannot dispute an expired carve-out claim.');
    }

    const newStatus = disputeType === 'CORRECTED_CLAIM' ? 'CORRECTED_CLAIM_QUEUED' : 'DISPUTE_SUBMITTED';

    const updated = {
      ...d,
      discrepancy_status: newStatus,
      notes: notes ? `${d.notes ? d.notes + ' | ' : ''}${notes}` : d.notes,
      updated_at: new Date().toISOString()
    };

    this.discrepancies[idx] = scoreCarveoutDiscrepancy(updated);
    this.saveState();

    return {
      discrepancy: this.discrepancies[idx],
      packet: {
        discrepancyId: d.id,
        claimNumber: d.claim_number,
        payerName: d.payer_name,
        deviceCode: d.hcpcs_device_code,
        deviceName: d.device_name,
        catalogNumber: d.catalog_number,
        udiDi: d.udi_di,
        invoiceNumber: d.invoice_number,
        invoiceCost: d.invoice_cost,
        expectedReimbursement: d.expected_carveout_amount,
        carveoutVariance: d.carveout_variance,
        disputeType,
        generatedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Records successful recovery of missing carve-out from subsequent remittance.
   */
  recordRecovery(discrepancyId, recoveredAmount, notes = '') {
    const idx = this.discrepancies.findIndex(d => d.id === discrepancyId);
    if (idx === -1) throw new Error(`Carve-Out Discrepancy ${discrepancyId} not found.`);

    const amt = Number(recoveredAmount) || 0;
    if (amt <= 0) throw new Error('Recovered amount must be greater than zero.');

    const d = this.discrepancies[idx];
    const newPaid = Number((d.payer_paid_carveout + amt).toFixed(2));
    const newVariance = calculateCarveoutVariance(d.expected_carveout_amount, newPaid);

    const updated = {
      ...d,
      payer_paid_carveout: newPaid,
      carveout_variance: newVariance,
      discrepancy_status: newVariance === 0 ? 'RECOVERED' : d.discrepancy_status,
      recovery_action_tier: newVariance === 0 ? 'TIER_5_EXPIRED_OR_NON_CARVED' : d.recovery_action_tier,
      notes: notes ? `${d.notes ? d.notes + ' | ' : ''}Recovered $${amt}: ${notes}` : d.notes,
      updated_at: new Date().toISOString()
    };

    this.discrepancies[idx] = scoreCarveoutDiscrepancy(updated);
    this.saveState();
    return this.discrepancies[idx];
  }

  /**
   * Dismisses a discrepancy as non-carved out or valid contract adjustment.
   */
  dismissDiscrepancy(discrepancyId, reasonNotes = '') {
    const idx = this.discrepancies.findIndex(d => d.id === discrepancyId);
    if (idx === -1) throw new Error(`Carve-Out Discrepancy ${discrepancyId} not found.`);

    if (!reasonNotes || reasonNotes.trim().length < 8) {
      throw new Error('Mandatory formal dismissal notes required.');
    }

    const d = this.discrepancies[idx];
    const updated = {
      ...d,
      discrepancy_status: 'DISMISSED_NOT_ELIGIBLE',
      recovery_action_tier: 'TIER_5_EXPIRED_OR_NON_CARVED',
      carveout_variance: 0.00,
      notes: `${d.notes ? d.notes + ' | ' : ''}Dismissed: ${reasonNotes}`,
      updated_at: new Date().toISOString()
    };

    this.discrepancies[idx] = scoreCarveoutDiscrepancy(updated);
    this.saveState();
    return this.discrepancies[idx];
  }

  /**
   * Computes portfolio-wide summary metrics.
   */
  getMetrics(facilityId = null) {
    const all = this.getAllDiscrepancies(facilityId);
    const active = all.filter(d => !['RECOVERED', 'DISMISSED_NOT_ELIGIBLE', 'EXPIRED_UNRECOVERABLE'].includes(d.discrepancy_status));

    const totalActiveCount = active.length;
    const totalActiveVariance = active.reduce((acc, d) => acc + d.carveout_variance, 0);

    const unbilledActive = active.filter(d => d.carveout_leakage_type === 'UNBILLED_IMPLANT');
    const unbilledVarianceAtRisk = unbilledActive.reduce((acc, d) => acc + d.carveout_variance, 0);

    const invoiceDeficitsCount = active.filter(d => !d.invoice_attached).length;
    const recoveredCashMtd = all.filter(d => d.discrepancy_status === 'RECOVERED')
                               .reduce((acc, d) => acc + d.payer_paid_carveout, 0);

    const tierDistribution = {
      TIER_1_CRITICAL_RECOVERY: all.filter(d => d.recovery_action_tier === 'TIER_1_CRITICAL_RECOVERY').length,
      TIER_2_HIGH_YIELD_DISPUTE: all.filter(d => d.recovery_action_tier === 'TIER_2_HIGH_YIELD_DISPUTE').length,
      TIER_3_DOCUMENTATION_CURE: all.filter(d => d.recovery_action_tier === 'TIER_3_DOCUMENTATION_CURE').length,
      TIER_4_LOW_VARIANCE_MONITOR: all.filter(d => d.recovery_action_tier === 'TIER_4_LOW_VARIANCE_MONITOR').length,
      TIER_5_EXPIRED_OR_NON_CARVED: all.filter(d => d.recovery_action_tier === 'TIER_5_EXPIRED_OR_NON_CARVED').length
    };

    const leakageDistribution = {
      UNBILLED_IMPLANT: all.filter(d => d.carveout_leakage_type === 'UNBILLED_IMPLANT').length,
      ZERO_PAID_BUNDLED: all.filter(d => d.carveout_leakage_type === 'ZERO_PAID_BUNDLED').length,
      MISSING_INVOICE_DENIAL: all.filter(d => d.carveout_leakage_type === 'MISSING_INVOICE_DENIAL').length,
      MARKUP_UNDERPAID: all.filter(d => d.carveout_leakage_type === 'MARKUP_UNDERPAID').length,
      THRESHOLD_CALCULATION_ERROR: all.filter(d => d.carveout_leakage_type === 'THRESHOLD_CALCULATION_ERROR').length
    };

    return {
      totalActiveCount,
      totalActiveVariance: Number(totalActiveVariance.toFixed(2)),
      unbilledVarianceAtRisk: Number(unbilledVarianceAtRisk.toFixed(2)),
      invoiceDeficitsCount,
      recoveredCashMtd: Number(recoveredCashMtd.toFixed(2)),
      tierDistribution,
      leakageDistribution
    };
  }
}

export const implantCarveoutService = new ImplantCarveoutStore();
export default implantCarveoutService;
