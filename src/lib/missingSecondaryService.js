/**
 * MISSING SECONDARY PAYMENT SERVICE
 * Phase 95 — Revenue Cycle Management
 * 
 * Production service for detecting secondary and COB revenue leakage,
 * calculating deterministic expected reimbursement across Medigap and commercial COB models,
 * enforcing patient statement suppression holds, and prioritizing secondary recovery queues.
 */

// ==============================================================================
// 1. CONSTANTS & TAXONOMY
// ==============================================================================

export const SECONDARY_COB_MODELS = {
  MEDIGAP_SUPPLEMENT: {
    code: 'MEDIGAP_SUPPLEMENT',
    label: 'Medicare Supplement / Medigap',
    badgeColor: '#0284c7', // Sky Blue
    description: 'Pays 100% of Medicare Part B 20% coinsurance balance on ASC surgical encounters.'
  },
  STANDARD_COB: {
    code: 'STANDARD_COB',
    label: 'Standard Coordination of Benefits',
    badgeColor: '#10b981', // Emerald
    description: 'Reimburses lesser of primary unpaid balance or (secondary allowed minus primary paid).'
  },
  NON_DUPLICATION_CARVEOUT: {
    code: 'NON_DUPLICATION_CARVEOUT',
    label: 'Non-Duplication (Carve-Out COB)',
    badgeColor: '#f59e0b', // Amber
    description: 'Calculates secondary allowed minus primary paid; pays positive difference only.'
  }
};

export const LEAKAGE_ROOT_CAUSES = {
  UNFILED_SECONDARY_CLAIM: {
    code: 'UNFILED_SECONDARY_CLAIM',
    label: 'Unfiled Secondary Claim',
    badgeColor: '#ef4444',
    description: 'Primary claim adjudicated with PR balance, active secondary policy on file, but claim was never submitted.'
  },
  FAILED_CROSSOVER: {
    code: 'FAILED_CROSSOVER',
    label: 'Failed Automatic Crossover',
    badgeColor: '#f97316',
    description: 'Medicare Part B automatic crossover (COBA) failed or was rejected; secondary 837P not dispatched.'
  },
  PREMATURE_PATIENT_BILLING: {
    code: 'PREMATURE_PATIENT_BILLING',
    label: 'Premature Patient Billing',
    badgeColor: '#e11d48',
    description: 'Patient balance statement was erroneously generated before secondary insurance was billed or adjudicated.'
  },
  SECONDARY_TIMELY_FILING_RISK: {
    code: 'SECONDARY_TIMELY_FILING_RISK',
    label: 'Timely Filing Expiration Risk',
    badgeColor: '#dc2626',
    description: 'Secondary filing window is approaching statutory cutoff (<= 30 days from primary EOB date).'
  },
  MISSING_PRIMARY_EOB: {
    code: 'MISSING_PRIMARY_EOB',
    label: 'Missing Primary EOB Attachment',
    badgeColor: '#d97706',
    description: 'Secondary submission blocked or rejected because primary 835 remittance advice was not attached.'
  },
  SECONDARY_COB_DENIAL: {
    code: 'SECONDARY_COB_DENIAL',
    label: 'Secondary COB Denial (CARC 22/23)',
    badgeColor: '#b45309',
    description: 'Secondary payer denied coverage requiring member coordination of benefits questionnaire update.'
  },
  SECONDARY_UNDERPAYMENT: {
    code: 'SECONDARY_UNDERPAYMENT',
    label: 'Secondary COB Underpayment',
    badgeColor: '#0284c7',
    description: 'Secondary payer paid less than the contractual COB entitlement (e.g. reduced 20% Medicare coinsurance).'
  }
};

export const PRIORITY_TIERS = {
  CRITICAL_URGENT: {
    code: 'CRITICAL_URGENT',
    label: 'Critical Urgent',
    badgeColor: '#ef4444',
    minScore: 80.00,
    maxScore: 100.00,
    rank: 5,
    description: 'Imminent secondary filing deadline (<= 15 days) or substantial recoverable balance (> $1,500).'
  },
  HIGH_PRIORITY: {
    code: 'HIGH_PRIORITY',
    label: 'High Priority',
    badgeColor: '#f97316',
    minScore: 65.00,
    maxScore: 79.99,
    rank: 4,
    description: 'Strong recovery yield with verified Medigap/commercial policy and primary EOB available.'
  },
  MEDIUM_PRIORITY: {
    code: 'MEDIUM_PRIORITY',
    label: 'Medium Priority',
    badgeColor: '#0284c7',
    minScore: 45.00,
    maxScore: 64.99,
    rank: 3,
    description: 'Standard secondary queue with > 30 days remaining in statutory filing window.'
  },
  LOW_PRIORITY: {
    code: 'LOW_PRIORITY',
    label: 'Low Priority',
    badgeColor: '#64748b',
    minScore: 25.00,
    maxScore: 44.99,
    rank: 2,
    description: 'Marginal balance (< $100) or unverified secondary policy documentation.'
  },
  UNCOLLECTIBLE_HOLD: {
    code: 'UNCOLLECTIBLE_HOLD',
    label: 'Uncollectible Hold',
    badgeColor: '#475569',
    minScore: 0.00,
    maxScore: 24.99,
    rank: 1,
    description: 'Secondary timely filing limit elapsed from primary EOB date. Supervisor audit required for write-off.'
  }
};

export const QUEUE_STATUSES = {
  IDENTIFIED: { code: 'IDENTIFIED', label: 'Identified Leakage', color: '#64748b' },
  READY_TO_FILE: { code: 'READY_TO_FILE', label: 'Ready to File', color: '#0284c7' },
  SUBMITTED: { code: 'SUBMITTED', label: 'Secondary Claim Submitted', color: '#f59e0b' },
  PENDING_ADJUDICATION: { code: 'PENDING_ADJUDICATION', label: 'Pending Secondary 835', color: '#06b6d4' },
  RECOVERED: { code: 'RECOVERED', label: 'Secondary Cash Recovered', color: '#10b981' },
  TRANSFERRED_TO_PATIENT: { code: 'TRANSFERRED_TO_PATIENT', label: 'Transferred to Patient', color: '#38bdf8' },
  WRITTEN_OFF: { code: 'WRITTEN_OFF', label: 'Written Off', color: '#475569' }
};

export const COVERAGE_CERTAINTY_TIERS = {
  VERIFIED_ACTIVE: { code: 'VERIFIED_ACTIVE', label: 'Real-Time 271 Verified Active', score: 100.00 },
  VERIFIED_COMMERCIAL: { code: 'VERIFIED_COMMERCIAL', label: 'Commercial Policy Card on File', score: 75.00 },
  MEDICAID_PENDING: { code: 'MEDICAID_PENDING', label: 'Dual-Eligible Pending Confirmation', score: 50.00 },
  UNVERIFIED_POLICY: { code: 'UNVERIFIED_POLICY', label: 'Unverified Policy Number', score: 25.00 }
};

export const FILING_READINESS_TIERS = {
  READY_CLEAN_EDI: { code: 'READY_CLEAN_EDI', label: 'Clean 837P Loop 2320 Ready', score: 100.00 },
  ATTACHMENTS_NEEDED: { code: 'ATTACHMENTS_NEEDED', label: 'Primary EOB PDF Upload Needed', score: 70.00 },
  INCOMPLETE_COB_DATA: { code: 'INCOMPLETE_COB_DATA', label: 'Missing Secondary Subscriber Info', score: 30.00 }
};

export const SCORING_WEIGHTS = {
  BALANCE: 0.35,
  FILING_URGENCY: 0.30,
  COVERAGE_CERTAINTY: 0.20,
  FILING_READINESS: 0.15
};

export const DEFAULT_SECONDARY_BENCHMARK = 1500.00;

// ==============================================================================
// 2. AUTHORITATIVE DETERMINISTIC COB & SCORING ALGORITHMS
// ==============================================================================

/**
 * Calculates Medigap secondary reimbursement for Medicare Part B primary encounters.
 * Medigap pays 100% of the 20% Medicare Part B coinsurance.
 */
export function calculateMedigapExpected(primaryAllowed, coinsurancePct = 0.20) {
  const allowed = Math.max(0, Number(primaryAllowed) || 0);
  const pct = Math.max(0, Math.min(1, Number(coinsurancePct) || 0.20));
  return Number((allowed * pct).toFixed(2));
}

/**
 * Standard Coordination of Benefits:
 * Reimburses lesser of primary remaining PR balance or (secondary allowed - primary paid).
 */
export function calculateStandardCobExpected(primaryPatientResp, secondaryAllowed, primaryPaid) {
  const pr = Math.max(0, Number(primaryPatientResp) || 0);
  const secAllowed = Math.max(0, Number(secondaryAllowed) || 0);
  const priPaid = Math.max(0, Number(primaryPaid) || 0);

  const secLiability = Math.max(0, secAllowed - priPaid);
  const expected = Math.min(pr, secLiability);
  return Number(expected.toFixed(2));
}

/**
 * Non-Duplication (Carve-Out COB):
 * Secondary pays max(0, secondary allowed - primary paid).
 */
export function calculateNonDuplicationExpected(secondaryAllowed, primaryPaid) {
  const secAllowed = Math.max(0, Number(secondaryAllowed) || 0);
  const priPaid = Math.max(0, Number(primaryPaid) || 0);

  const expected = Math.max(0, secAllowed - priPaid);
  return Number(expected.toFixed(2));
}

/**
 * Resolves expected secondary reimbursement based on governing COB model.
 */
export function calculateExpectedSecondary(model, primaryPR, primaryAllowed, primaryPaid, secondaryAllowed) {
  switch (model) {
    case 'MEDIGAP_SUPPLEMENT':
      return calculateMedigapExpected(primaryAllowed, 0.20);
    case 'NON_DUPLICATION_CARVEOUT':
      return calculateNonDuplicationExpected(secondaryAllowed, primaryPaid);
    case 'STANDARD_COB':
    default:
      return calculateStandardCobExpected(primaryPR, secondaryAllowed, primaryPaid);
  }
}

/**
 * Balance Score (0 - 100) normalized against facility secondary benchmark ($1,500.00).
 */
export function calculateBalanceScore(expectedAmount, benchmark = DEFAULT_SECONDARY_BENCHMARK) {
  const amount = Number(expectedAmount) || 0;
  const bench = Number(benchmark) > 0 ? Number(benchmark) : DEFAULT_SECONDARY_BENCHMARK;
  if (amount <= 0) return 0.00;
  const score = Math.min(100.00, (amount / bench) * 100.00);
  return Number(score.toFixed(2));
}

/**
 * Evaluates remaining calendar days from primary EOB date before secondary filing limit expires.
 * - <= 15 days: 100.00 (Critical Statutory Cliff)
 * - 16 - 30 days: 85.00
 * - 31 - 60 days: 65.00
 * - 61 - 90 days: 40.00
 * - > 90 days: 20.00
 * - Expired (< 0 days): 0.00 (Forced to UNCOLLECTIBLE_HOLD)
 */
export function calculateFilingUrgencyScore(daysUntilDeadline) {
  const days = Number(daysUntilDeadline);
  if (isNaN(days) || days < 0) return 0.00;
  if (days <= 15) return 100.00;
  if (days <= 30) return 85.00;
  if (days <= 60) return 65.00;
  if (days <= 90) return 40.00;
  return 20.00;
}

export function calculateCertaintyScore(certaintyTier) {
  const tier = COVERAGE_CERTAINTY_TIERS[certaintyTier];
  return tier ? tier.score : 50.00;
}

export function calculateReadinessScore(readinessTier) {
  const tier = FILING_READINESS_TIERS[readinessTier];
  return tier ? tier.score : 50.00;
}

/**
 * 4-Factor Deterministic Composite Secondary Priority Score (0.00 - 100.00)
 */
export function calculateSecondaryPriorityScore(balanceScore, urgencyScore, certaintyScore, readinessScore) {
  const b = Math.max(0, Math.min(100, Number(balanceScore) || 0));
  const u = Math.max(0, Math.min(100, Number(urgencyScore) || 0));
  const c = Math.max(0, Math.min(100, Number(certaintyScore) || 0));
  const r = Math.max(0, Math.min(100, Number(readinessScore) || 0));

  const total = (b * SCORING_WEIGHTS.BALANCE) +
                (u * SCORING_WEIGHTS.FILING_URGENCY) +
                (c * SCORING_WEIGHTS.COVERAGE_CERTAINTY) +
                (r * SCORING_WEIGHTS.FILING_READINESS);

  return Number(total.toFixed(2));
}

/**
 * Classifies composite score into 5 actionable priority tiers.
 * Rule 2 Invariant: If daysUntilDeadline < 0, forced to UNCOLLECTIBLE_HOLD.
 */
export function classifySecondaryPriorityTier(priorityScore, daysUntilDeadline) {
  const days = Number(daysUntilDeadline);
  if (!isNaN(days) && days < 0) {
    return PRIORITY_TIERS.UNCOLLECTIBLE_HOLD.code;
  }
  const score = Number(priorityScore) || 0;
  if (score >= PRIORITY_TIERS.CRITICAL_URGENT.minScore) return PRIORITY_TIERS.CRITICAL_URGENT.code;
  if (score >= PRIORITY_TIERS.HIGH_PRIORITY.minScore) return PRIORITY_TIERS.HIGH_PRIORITY.code;
  if (score >= PRIORITY_TIERS.MEDIUM_PRIORITY.minScore) return PRIORITY_TIERS.MEDIUM_PRIORITY.code;
  if (score >= PRIORITY_TIERS.LOW_PRIORITY.minScore) return PRIORITY_TIERS.LOW_PRIORITY.code;
  return PRIORITY_TIERS.UNCOLLECTIBLE_HOLD.code;
}

/**
 * Authoritatively scores a missing secondary record.
 */
export function scoreSecondaryRecord(record, benchmark = DEFAULT_SECONDARY_BENCHMARK) {
  const expectedAmount = Number(record.secondary_expected_amount) || 0;
  const daysUntilDeadline = Number(record.days_until_filing_deadline);
  const certaintyTier = record.coverage_certainty || 'VERIFIED_ACTIVE';
  const readinessTier = record.filing_readiness || 'READY_CLEAN_EDI';

  const balanceScore = calculateBalanceScore(expectedAmount, benchmark);
  const urgencyScore = calculateFilingUrgencyScore(daysUntilDeadline);
  const certaintyScore = calculateCertaintyScore(certaintyTier);
  const readinessScore = calculateReadinessScore(readinessTier);

  const priorityScore = calculateSecondaryPriorityScore(balanceScore, urgencyScore, certaintyScore, readinessScore);
  const priorityTier = classifySecondaryPriorityTier(priorityScore, daysUntilDeadline);

  return {
    ...record,
    balance_score: balanceScore,
    urgency_score: urgencyScore,
    certainty_score: certaintyScore,
    readiness_score: readinessScore,
    priority_score: priorityScore,
    priority_tier: priorityTier,
    updated_at: new Date().toISOString()
  };
}

// ==============================================================================
// 3. BASELINE REALISTIC ASC DATASET
// ==============================================================================

const INITIAL_MISSING_SECONDARY_CASES = [
  {
    id: 'msp-001',
    organization_id: 'org-asc-01',
    facility_id: 'fac-surgical-01',
    claim_id: 'clm-9901',
    claim_number: 'CLM-2026-09901',
    patient_id: 'pat-771',
    patient_name: 'Arthur Pendelton',
    patient_mrn: 'MRN-77102',
    cpt_code: '29888',
    procedure_name: 'Arthroscopic ACL Reconstruction with Meniscal Repair',
    primary_payer_id: 'pyr-medicare-01',
    primary_payer_name: 'Medicare Part B / Novitas',
    primary_paid_amount: 3400.00,
    primary_allowed_amount: 4250.00,
    primary_eob_date: '2026-09-01',
    primary_patient_resp_amount: 850.00, // 20% coinsurance
    secondary_payer_id: 'pyr-aarp-01',
    secondary_payer_name: 'AARP / UnitedHealthcare Medigap Plan G',
    secondary_policy_number: 'AARP-992014-G',
    secondary_cob_model: 'MEDIGAP_SUPPLEMENT',
    secondary_expected_amount: 850.00, // 100% of 20% coinsurance
    secondary_actual_paid_amount: 0.00,
    secondary_filing_deadline: '2026-11-23',
    days_until_filing_deadline: 12, // Critical Cliff
    leakage_root_cause: 'FAILED_CROSSOVER',
    coverage_certainty: 'VERIFIED_ACTIVE',
    filing_readiness: 'READY_CLEAN_EDI',
    queue_status: 'READY_TO_FILE',
    patient_statement_held: true,
    assigned_user_id: null,
    assigned_user_name: null,
    notes: 'Electronic crossover missing Remark Code MA18. Primary 835 attached and 837P Loop 2320 ready for dispatch.'
  },
  {
    id: 'msp-002',
    organization_id: 'org-asc-01',
    facility_id: 'fac-surgical-01',
    claim_id: 'clm-9902',
    claim_number: 'CLM-2026-09902',
    patient_id: 'pat-772',
    patient_name: 'Eleanor Vance',
    patient_mrn: 'MRN-88219',
    cpt_code: '27447',
    procedure_name: 'Total Knee Arthroplasty with Cruciate-Retaining Implant',
    primary_payer_id: 'pyr-medicare-01',
    primary_payer_name: 'Medicare Part B / Novitas',
    primary_paid_amount: 6240.00,
    primary_allowed_amount: 7800.00,
    primary_eob_date: '2026-09-12',
    primary_patient_resp_amount: 1560.00, // 20% coinsurance
    secondary_payer_id: 'pyr-mutual-01',
    secondary_payer_name: 'Mutual of Omaha Medigap Plan F',
    secondary_policy_number: 'MOO-784112-F',
    secondary_cob_model: 'MEDIGAP_SUPPLEMENT',
    secondary_expected_amount: 1560.00,
    secondary_actual_paid_amount: 0.00,
    secondary_filing_deadline: '2026-12-03',
    days_until_filing_deadline: 22,
    leakage_root_cause: 'UNFILED_SECONDARY_CLAIM',
    coverage_certainty: 'VERIFIED_ACTIVE',
    filing_readiness: 'READY_CLEAN_EDI',
    queue_status: 'READY_TO_FILE',
    patient_statement_held: true,
    assigned_user_id: 'usr-spec-01',
    assigned_user_name: 'Sarah Jenkins, CPC',
    notes: 'High-value surgical coinsurance balance. Primary EOB cleared; pending secondary batch submission.'
  },
  {
    id: 'msp-003',
    organization_id: 'org-asc-01',
    facility_id: 'fac-surgical-01',
    claim_id: 'clm-9903',
    claim_number: 'CLM-2026-09903',
    patient_id: 'pat-773',
    patient_name: 'Marcus Brody',
    patient_mrn: 'MRN-44910',
    cpt_code: '29827',
    procedure_name: 'Arthroscopic Rotator Cuff Repair',
    primary_payer_id: 'pyr-bcbs-01',
    primary_payer_name: 'Blue Cross Blue Shield Commercial',
    primary_paid_amount: 2100.00,
    primary_allowed_amount: 2800.00,
    primary_eob_date: '2026-09-28',
    primary_patient_resp_amount: 700.00, // Deductible & coinsurance
    secondary_payer_id: 'pyr-aetna-01',
    secondary_payer_name: 'Aetna Commercial Employer Group',
    secondary_policy_number: 'AET-33901-SEC',
    secondary_cob_model: 'STANDARD_COB',
    secondary_expected_amount: 400.00, // Lesser of $700 vs ($2,500 sec allowed - $2,100 pri paid = $400)
    secondary_actual_paid_amount: 0.00,
    secondary_filing_deadline: '2026-12-26',
    days_until_filing_deadline: 45,
    leakage_root_cause: 'UNFILED_SECONDARY_CLAIM',
    coverage_certainty: 'VERIFIED_COMMERCIAL',
    filing_readiness: 'ATTACHMENTS_NEEDED',
    queue_status: 'IDENTIFIED',
    patient_statement_held: true,
    assigned_user_id: null,
    assigned_user_name: null,
    notes: 'Secondary allowed is $2,500. Standard COB limits secondary payment to $400. Primary EOB PDF required.'
  },
  {
    id: 'msp-004',
    organization_id: 'org-asc-01',
    facility_id: 'fac-surgical-01',
    claim_id: 'clm-9904',
    claim_number: 'CLM-2026-09904',
    patient_id: 'pat-774',
    patient_name: 'Dorothy Gale',
    patient_mrn: 'MRN-33821',
    cpt_code: '66984',
    procedure_name: 'Cataract Extraction with IOL Insertion',
    primary_payer_id: 'pyr-uhc-01',
    primary_payer_name: 'UnitedHealthcare Commercial',
    primary_paid_amount: 1550.00,
    primary_allowed_amount: 1950.00,
    primary_eob_date: '2026-10-18',
    primary_patient_resp_amount: 400.00,
    secondary_payer_id: 'pyr-cigna-01',
    secondary_payer_name: 'Cigna Healthcare Secondary',
    secondary_policy_number: 'CIG-99120-COB',
    secondary_cob_model: 'NON_DUPLICATION_CARVEOUT',
    secondary_expected_amount: 50.00, // max(0, 1600 - 1550) = $50
    secondary_actual_paid_amount: 0.00,
    secondary_filing_deadline: '2027-01-20',
    days_until_filing_deadline: 70,
    leakage_root_cause: 'SECONDARY_UNDERPAYMENT',
    coverage_certainty: 'VERIFIED_COMMERCIAL',
    filing_readiness: 'READY_CLEAN_EDI',
    queue_status: 'IDENTIFIED',
    patient_statement_held: true,
    assigned_user_id: null,
    assigned_user_name: null,
    notes: 'Carve-out COB policy: Secondary allowed is $1,600. Secondary liability is strictly $50.00.'
  },
  {
    id: 'msp-005',
    organization_id: 'org-asc-01',
    facility_id: 'fac-surgical-01',
    claim_id: 'clm-9905',
    claim_number: 'CLM-2026-09905',
    patient_id: 'pat-775',
    patient_name: 'Tobias Funke',
    patient_mrn: 'MRN-19283',
    cpt_code: '63030',
    procedure_name: 'Lumbar Laminotomy with Decompression',
    primary_payer_id: 'pyr-humana-01',
    primary_payer_name: 'Humana Medicare Advantage',
    primary_paid_amount: 2400.00,
    primary_allowed_amount: 3100.00,
    primary_eob_date: '2026-09-10',
    primary_patient_resp_amount: 700.00,
    secondary_payer_id: 'pyr-medicaid-01',
    secondary_payer_name: 'State Medicaid Dual-Eligible Crossover',
    secondary_policy_number: 'MCD-66102-QMB',
    secondary_cob_model: 'MEDIGAP_SUPPLEMENT',
    secondary_expected_amount: 700.00,
    secondary_actual_paid_amount: 0.00,
    secondary_filing_deadline: '2026-11-29',
    days_until_filing_deadline: 18,
    leakage_root_cause: 'MISSING_PRIMARY_EOB',
    coverage_certainty: 'MEDICAID_PENDING',
    filing_readiness: 'ATTACHMENTS_NEEDED',
    queue_status: 'READY_TO_FILE',
    patient_statement_held: true,
    assigned_user_id: null,
    assigned_user_name: null,
    notes: 'Dual-eligible QMB patient cannot be balance-billed under federal law. Primary EOB must be attached to avoid civil monetary penalties.'
  },
  {
    id: 'msp-006',
    organization_id: 'org-asc-01',
    facility_id: 'fac-surgical-01',
    claim_id: 'clm-9906',
    claim_number: 'CLM-2026-09906',
    patient_id: 'pat-776',
    patient_name: 'Lucille Bluth',
    patient_mrn: 'MRN-55190',
    cpt_code: '45380',
    procedure_name: 'Diagnostic Colonoscopy with Polypectomy',
    primary_payer_id: 'pyr-medicare-01',
    primary_payer_name: 'Medicare Part B / Novitas',
    primary_paid_amount: 1120.00,
    primary_allowed_amount: 1400.00,
    primary_eob_date: '2026-10-02',
    primary_patient_resp_amount: 280.00,
    secondary_payer_id: 'pyr-bankers-01',
    secondary_payer_name: 'Bankers Life Medigap Plan N',
    secondary_policy_number: 'BLK-44109-N',
    secondary_cob_model: 'MEDIGAP_SUPPLEMENT',
    secondary_expected_amount: 280.00,
    secondary_actual_paid_amount: 0.00,
    secondary_filing_deadline: '2026-12-19',
    days_until_filing_deadline: 38,
    leakage_root_cause: 'PREMATURE_PATIENT_BILLING',
    coverage_certainty: 'VERIFIED_ACTIVE',
    filing_readiness: 'READY_CLEAN_EDI',
    queue_status: 'IDENTIFIED',
    patient_statement_held: false, // Erroneously unheld!
    assigned_user_id: null,
    assigned_user_name: null,
    notes: 'CRITICAL COMPLIANCE BREACH: Patient statement of $280 sent erroneously before secondary Medigap billing. Requires immediate hold suppression.'
  },
  {
    id: 'msp-007',
    organization_id: 'org-asc-01',
    facility_id: 'fac-surgical-01',
    claim_id: 'clm-9907',
    claim_number: 'CLM-2026-09907',
    patient_id: 'pat-777',
    patient_name: 'Gob Bluth',
    patient_mrn: 'MRN-66291',
    cpt_code: '64721',
    procedure_name: 'Carpal Tunnel Neuroplasty',
    primary_payer_id: 'pyr-medicare-01',
    primary_payer_name: 'Medicare Part B / Novitas',
    primary_paid_amount: 1760.00,
    primary_allowed_amount: 2200.00,
    primary_eob_date: '2026-07-28',
    primary_patient_resp_amount: 440.00,
    secondary_payer_id: 'pyr-aetna-01',
    secondary_payer_name: 'Aetna Senior Supplemental',
    secondary_policy_number: 'AET-SEN-8812',
    secondary_cob_model: 'MEDIGAP_SUPPLEMENT',
    secondary_expected_amount: 440.00,
    secondary_actual_paid_amount: 0.00,
    secondary_filing_deadline: '2026-10-26',
    days_until_filing_deadline: -16, // EXPIRED
    leakage_root_cause: 'SECONDARY_TIMELY_FILING_RISK',
    coverage_certainty: 'VERIFIED_ACTIVE',
    filing_readiness: 'READY_CLEAN_EDI',
    queue_status: 'IDENTIFIED',
    patient_statement_held: true,
    assigned_user_id: null,
    assigned_user_name: null,
    notes: 'Secondary timely filing window (90 days from primary EOB) expired. Secondary billing blocked. Supervisor write-off recommended.'
  },
  {
    id: 'msp-008',
    organization_id: 'org-asc-01',
    facility_id: 'fac-surgical-01',
    claim_id: 'clm-9908',
    claim_number: 'CLM-2026-09908',
    patient_id: 'pat-778',
    patient_name: 'George Michael',
    patient_mrn: 'MRN-88401',
    cpt_code: '62321',
    procedure_name: 'Cervical Epidural Steroid Injection',
    primary_payer_id: 'pyr-cigna-01',
    primary_payer_name: 'Cigna Commercial Primary',
    primary_paid_amount: 4200.00,
    primary_allowed_amount: 5400.00,
    primary_eob_date: '2026-09-18',
    primary_patient_resp_amount: 1200.00,
    secondary_payer_id: 'pyr-bcbs-01',
    secondary_payer_name: 'Blue Cross Blue Shield Secondary',
    secondary_policy_number: 'BCBS-COB-99124',
    secondary_cob_model: 'STANDARD_COB',
    secondary_expected_amount: 1000.00, // Secondary allowed $5,200 - $4,200 = $1,000
    secondary_actual_paid_amount: 0.00,
    secondary_filing_deadline: '2026-12-06',
    days_until_filing_deadline: 25,
    leakage_root_cause: 'SECONDARY_COB_DENIAL',
    coverage_certainty: 'VERIFIED_COMMERCIAL',
    filing_readiness: 'READY_CLEAN_EDI',
    queue_status: 'SUBMITTED',
    patient_statement_held: true,
    assigned_user_id: 'usr-spec-02',
    assigned_user_name: 'Michael Torres, RHIA',
    submitted_at: '2026-10-25T11:20:00Z',
    notes: 'Secondary denied under CARC 22. Patient completed updated COB verification on 10/24; claim re-submitted to BCBS.'
  }
];

// ==============================================================================
// 4. MISSING SECONDARY STORE & SERVICE CLASS
// ==============================================================================

export class MissingSecondaryStore {
  constructor() {
    this.storageKey = 'ascanalyst_missing_secondary_v1';
    this.cases = this.loadState();
  }

  loadState() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(this.storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.map(c => scoreSecondaryRecord(c));
          }
        }
      }
    } catch {
      // Fallback
    }
    return INITIAL_MISSING_SECONDARY_CASES.map(c => scoreSecondaryRecord(c));
  }

  saveState() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(this.storageKey, JSON.stringify(this.cases));
      }
    } catch {
      // Storage unavailable
    }
  }

  /**
   * Returns all secondary leakage records sorted according to Rule 4 Invariant:
   * 1. Priority Tier Rank DESC
   * 2. Secondary Expected Amount DESC
   * 3. Days Until Filing Deadline ASC
   */
  getAllCases(facilityId = null, filters = {}) {
    let list = this.cases.map(c => scoreSecondaryRecord(c));

    if (facilityId) {
      list = list.filter(c => c.facility_id === facilityId);
    }

    if (filters.tier && filters.tier !== 'ALL') {
      list = list.filter(c => c.priority_tier === filters.tier);
    }

    if (filters.status && filters.status !== 'ALL') {
      list = list.filter(c => c.queue_status === filters.status);
    }

    if (filters.cause && filters.cause !== 'ALL') {
      list = list.filter(c => c.leakage_root_cause === filters.cause);
    }

    if (filters.cobModel && filters.cobModel !== 'ALL') {
      list = list.filter(c => c.secondary_cob_model === filters.cobModel);
    }

    if (filters.heldOnly) {
      list = list.filter(c => c.patient_statement_held === true);
    }

    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(c =>
        c.claim_number.toLowerCase().includes(q) ||
        c.patient_name.toLowerCase().includes(q) ||
        c.primary_payer_name.toLowerCase().includes(q) ||
        c.secondary_payer_name.toLowerCase().includes(q) ||
        c.cpt_code.toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) => {
      const rankA = PRIORITY_TIERS[a.priority_tier]?.rank || 0;
      const rankB = PRIORITY_TIERS[b.priority_tier]?.rank || 0;
      if (rankB !== rankA) return rankB - rankA;
      if (b.secondary_expected_amount !== a.secondary_expected_amount) {
        return b.secondary_expected_amount - a.secondary_expected_amount;
      }
      return a.days_until_filing_deadline - b.days_until_filing_deadline;
    });
  }

  getCaseById(id) {
    const found = this.cases.find(c => c.id === id);
    return found ? scoreSecondaryRecord(found) : null;
  }

  submitSecondaryClaim(id, submissionMethod = 'ELECTRONIC_EDI_837P', clearinghouseTrace = '') {
    const idx = this.cases.findIndex(c => c.id === id);
    if (idx === -1) throw new Error(`Secondary leakage case ${id} not found.`);

    if (this.cases[idx].days_until_filing_deadline < 0) {
      throw new Error('Cannot submit secondary claim after timely filing deadline has expired without an approved filing waiver.');
    }

    const updated = {
      ...this.cases[idx],
      queue_status: 'SUBMITTED',
      submission_method: submissionMethod,
      clearinghouse_trace: clearinghouseTrace || `EDI-${Date.now()}`,
      submitted_at: new Date().toISOString(),
      patient_statement_held: true,
      updated_at: new Date().toISOString()
    };

    this.cases[idx] = scoreSecondaryRecord(updated);
    this.saveState();
    return this.cases[idx];
  }

  markSecondaryRecovered(id, recoveredAmount, checkNumber = '') {
    const idx = this.cases.findIndex(c => c.id === id);
    if (idx === -1) throw new Error(`Secondary leakage case ${id} not found.`);

    const amt = Number(recoveredAmount) || this.cases[idx].secondary_expected_amount;
    const remainingPatientBalance = Math.max(0, this.cases[idx].primary_patient_resp_amount - amt);

    const updated = {
      ...this.cases[idx],
      queue_status: 'RECOVERED',
      secondary_actual_paid_amount: amt,
      recovery_check_number: checkNumber,
      recovered_at: new Date().toISOString(),
      // If balance remaining, statement hold is released for legitimate residual balance
      patient_statement_held: remainingPatientBalance > 0 ? false : true,
      remaining_patient_due: remainingPatientBalance,
      updated_at: new Date().toISOString()
    };

    this.cases[idx] = scoreSecondaryRecord(updated);
    this.saveState();
    return this.cases[idx];
  }

  suppressPatientStatement(id, isHeld = true) {
    const idx = this.cases.findIndex(c => c.id === id);
    if (idx === -1) throw new Error(`Secondary leakage case ${id} not found.`);

    const updated = {
      ...this.cases[idx],
      patient_statement_held: Boolean(isHeld),
      updated_at: new Date().toISOString()
    };

    this.cases[idx] = scoreSecondaryRecord(updated);
    this.saveState();
    return this.cases[idx];
  }

  transferToPatient(id, supervisorId, supervisorName, reasonNotes) {
    const idx = this.cases.findIndex(c => c.id === id);
    if (idx === -1) throw new Error(`Secondary leakage case ${id} not found.`);

    if (!reasonNotes || reasonNotes.trim().length < 8) {
      throw new Error('Documented supervisor justification is required before releasing held balance to patient statement.');
    }

    const updated = {
      ...this.cases[idx],
      queue_status: 'TRANSFERRED_TO_PATIENT',
      patient_statement_held: false,
      transfer_supervisor_id: supervisorId,
      transfer_supervisor_name: supervisorName,
      transfer_reason: reasonNotes,
      transferred_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.cases[idx] = scoreSecondaryRecord(updated);
    this.saveState();
    return this.cases[idx];
  }

  writeOffSecondary(id, supervisorId, supervisorName, reasonNotes) {
    const idx = this.cases.findIndex(c => c.id === id);
    if (idx === -1) throw new Error(`Secondary leakage case ${id} not found.`);

    if (!reasonNotes || reasonNotes.trim().length < 8) {
      throw new Error('Documented write-off justification notes are mandatory.');
    }

    const updated = {
      ...this.cases[idx],
      queue_status: 'WRITTEN_OFF',
      priority_tier: 'UNCOLLECTIBLE_HOLD',
      write_off_supervisor_id: supervisorId,
      write_off_supervisor_name: supervisorName,
      write_off_notes: reasonNotes,
      written_off_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.cases[idx] = scoreSecondaryRecord(updated);
    this.saveState();
    return this.cases[idx];
  }

  getMetrics(facilityId = null) {
    const all = this.getAllCases(facilityId);
    const active = all.filter(c => !['RECOVERED', 'TRANSFERRED_TO_PATIENT', 'WRITTEN_OFF'].includes(c.queue_status));

    const activeCasesCount = active.length;
    const totalPatientRespAmount = active.reduce((acc, c) => acc + c.primary_patient_resp_amount, 0);
    const totalExpectedRecovery = active.reduce((acc, c) => acc + c.secondary_expected_amount, 0);

    const criticalHighCases = active.filter(c => ['CRITICAL_URGENT', 'HIGH_PRIORITY'].includes(c.priority_tier));
    const criticalHighPipeline = criticalHighCases.reduce((acc, c) => acc + c.secondary_expected_amount, 0);

    const heldCases = all.filter(c => c.patient_statement_held);
    const statementsHeldCount = heldCases.length;
    const heldAmount = heldCases.reduce((acc, c) => acc + c.primary_patient_resp_amount, 0);

    const tierDistribution = {
      CRITICAL_URGENT: all.filter(c => c.priority_tier === 'CRITICAL_URGENT').length,
      HIGH_PRIORITY: all.filter(c => c.priority_tier === 'HIGH_PRIORITY').length,
      MEDIUM_PRIORITY: all.filter(c => c.priority_tier === 'MEDIUM_PRIORITY').length,
      LOW_PRIORITY: all.filter(c => c.priority_tier === 'LOW_PRIORITY').length,
      UNCOLLECTIBLE_HOLD: all.filter(c => c.priority_tier === 'UNCOLLECTIBLE_HOLD').length
    };

    const causeDistribution = {
      UNFILED_SECONDARY_CLAIM: all.filter(c => c.leakage_root_cause === 'UNFILED_SECONDARY_CLAIM').length,
      FAILED_CROSSOVER: all.filter(c => c.leakage_root_cause === 'FAILED_CROSSOVER').length,
      PREMATURE_PATIENT_BILLING: all.filter(c => c.leakage_root_cause === 'PREMATURE_PATIENT_BILLING').length,
      SECONDARY_TIMELY_FILING_RISK: all.filter(c => c.leakage_root_cause === 'SECONDARY_TIMELY_FILING_RISK').length,
      MISSING_PRIMARY_EOB: all.filter(c => c.leakage_root_cause === 'MISSING_PRIMARY_EOB').length,
      SECONDARY_COB_DENIAL: all.filter(c => c.leakage_root_cause === 'SECONDARY_COB_DENIAL').length,
      SECONDARY_UNDERPAYMENT: all.filter(c => c.leakage_root_cause === 'SECONDARY_UNDERPAYMENT').length
    };

    return {
      activeCasesCount,
      totalPatientRespAmount: Number(totalPatientRespAmount.toFixed(2)),
      totalExpectedRecovery: Number(totalExpectedRecovery.toFixed(2)),
      criticalHighPipeline: Number(criticalHighPipeline.toFixed(2)),
      statementsHeldCount,
      heldAmount: Number(heldAmount.toFixed(2)),
      tierDistribution,
      causeDistribution
    };
  }

  generateCobClaimPacket(id) {
    const item = this.getCaseById(id);
    if (!item) throw new Error(`Record ${id} not found.`);

    return {
      claimNumber: item.claim_number,
      patientName: item.patient_name,
      patientMrn: item.patient_mrn,
      cptCode: item.cpt_code,
      primaryPayer: item.primary_payer_name,
      primaryAllowed: item.primary_allowed_amount,
      primaryPaid: item.primary_paid_amount,
      primaryPatientResp: item.primary_patient_resp_amount,
      primaryEobDate: item.primary_eob_date,
      secondaryPayer: item.secondary_payer_name,
      secondaryPolicyNumber: item.secondary_policy_number,
      cobModel: item.secondary_cob_model,
      secondaryExpected: item.secondary_expected_amount,
      ediFormat: {
        loop2320_otherSubscriber: {
          payerSequence: 'S', // Secondary
          relationshipCode: '18', // Self
          claimFilingIndicator: item.secondary_cob_model === 'MEDIGAP_SUPPLEMENT' ? 'MB' : 'CI',
          payerName: item.secondary_payer_name,
          policyNumber: item.secondary_policy_number
        },
        loop2330_otherPayerAdjudication: {
          adjudicationDate: item.primary_eob_date,
          paidAmount: item.primary_paid_amount,
          patientRespAmount: item.primary_patient_resp_amount,
          allowedAmount: item.primary_allowed_amount
        }
      },
      readyForTransmission: item.filing_readiness === 'READY_CLEAN_EDI'
    };
  }

  resetToDefaults() {
    this.cases = INITIAL_MISSING_SECONDARY_CASES.map(c => scoreSecondaryRecord(c));
    this.saveState();
    return this.cases;
  }
}

export const missingSecondaryService = new MissingSecondaryStore();
