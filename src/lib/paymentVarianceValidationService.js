/**
 * ASC Payment Variance Validation Engine Service
 * Phase 93A: Payment Variance Validation (Extends Phase 93 Underpayment Detection)
 * 
 * Core Design Principle:
 * "Detection is not proof. Validation must establish the governing contract,
 * adjudication context, calculation lineage, and confidence before recovery action is recommended."
 */

// 1. Validation Outcomes Taxonomy (12 Deterministic States)
export const VALIDATION_STATUSES = {
  VALID_UNDERPAYMENT: {
    id: 'VALID_UNDERPAYMENT',
    label: 'Valid Underpayment',
    description: 'Confirmed recoverable short-pay against active contract version and complete 835 remittance.',
    colorToken: 'rose',
    isRecoveryEligible: true
  },
  VALID_CONTRACTUAL_ADJUSTMENT: {
    id: 'VALID_CONTRACTUAL_ADJUSTMENT',
    label: 'Valid Contractual Allowance',
    description: 'Verified legitimate contractual write-off per active fee schedule agreement.',
    colorToken: 'slate',
    isRecoveryEligible: false
  },
  PATIENT_RESPONSIBILITY: {
    id: 'PATIENT_RESPONSIBILITY',
    label: 'Patient Responsibility (PR)',
    description: 'Variance represents statutory patient liability (deductible, co-insurance, or co-pay).',
    colorToken: 'amber',
    isRecoveryEligible: false
  },
  SECONDARY_PAYER_PENDING: {
    id: 'SECONDARY_PAYER_PENDING',
    label: 'Secondary Payer Pending',
    description: 'Primary payer adjudicated; remaining balance automatically forwarded to secondary insurer.',
    colorToken: 'sky',
    isRecoveryEligible: false
  },
  CASE_RATE_OR_BUNDLED: {
    id: 'CASE_RATE_OR_BUNDLED',
    label: 'Case Rate / Packaged Code',
    description: 'Procedure code legally packaged into comprehensive primary surgical case rate.',
    colorToken: 'slate',
    isRecoveryEligible: false
  },
  MPPR_OR_MULTIPLE_PROCEDURE_REDUCTION: {
    id: 'MPPR_OR_MULTIPLE_PROCEDURE_REDUCTION',
    label: 'MPPR Statutory Reduction',
    description: 'Standard 50% multiple procedure payment reduction correctly applied per contract terms.',
    colorToken: 'slate',
    isRecoveryEligible: false
  },
  CODING_OR_MODIFIER_REVIEW: {
    id: 'CODING_OR_MODIFIER_REVIEW',
    label: 'Coding / Modifier Review',
    description: 'Modifier or documentation discrepancy requiring certified clinical coding audit.',
    colorToken: 'amber',
    isRecoveryEligible: false
  },
  IMPLANT_CARVEOUT_REVIEW: {
    id: 'IMPLANT_CARVEOUT_REVIEW',
    label: 'Implant Carve-Out Review',
    description: 'Invoice cost markup carve-out pending vendor invoice verification or catalog match.',
    colorToken: 'rose',
    isRecoveryEligible: true
  },
  COB_OR_OTHER_PAYER_REVIEW: {
    id: 'COB_OR_OTHER_PAYER_REVIEW',
    label: 'COB / Multi-Payer Ambiguity',
    description: 'Coordination of benefits discrepancy or overlapping coverage between health plans.',
    colorToken: 'sky',
    isRecoveryEligible: false
  },
  PAYMENT_POSTING_OR_RECONCILIATION_ISSUE: {
    id: 'PAYMENT_POSTING_OR_RECONCILIATION_ISSUE',
    label: 'Posting / Ledger Match Error',
    description: 'Electronic remittance posting mismatch or unapplied cash batch in patient ledger.',
    colorToken: 'amber',
    isRecoveryEligible: false
  },
  INSUFFICIENT_DATA: {
    id: 'INSUFFICIENT_DATA',
    label: 'Insufficient Authoritative Data',
    description: 'Missing governing contract schedule, plan ID, or unmatched electronic 835 remittance.',
    colorToken: 'slate',
    isRecoveryEligible: false
  },
  NEEDS_MANUAL_REVIEW: {
    id: 'NEEDS_MANUAL_REVIEW',
    label: 'Manual Review Required',
    description: 'Conflicting adjudication rules requiring business office supervisor or CFO review.',
    colorToken: 'sky',
    isRecoveryEligible: false
  }
};

// 2. Confidence Levels Taxonomy
export const CONFIDENCE_LEVELS = {
  HIGH: {
    id: 'HIGH',
    label: 'High Confidence',
    badgeClass: 'bg-emerald-950/40 text-emerald-400 border-emerald-800',
    description: 'Exact payer/plan match, effective contract version, complete lines, and matched 835 ERA.'
  },
  MEDIUM: {
    id: 'MEDIUM',
    label: 'Medium Confidence',
    badgeClass: 'bg-sky-950/40 text-sky-400 border-sky-800',
    description: 'Contract matched but secondary coordination or modifier review is pending.'
  },
  LOW: {
    id: 'LOW',
    label: 'Low Confidence',
    badgeClass: 'bg-amber-950/40 text-amber-300 border-amber-800',
    description: 'Heuristic estimate; contract schedule missing specific procedural amendment.'
  },
  UNKNOWN: {
    id: 'UNKNOWN',
    label: 'Unknown',
    badgeClass: 'bg-slate-800 text-slate-400 border-slate-700',
    description: 'Missing authoritative contract, plan, or remittance data.'
  }
};

// 3. Deterministic Financial & Validation Logic

/**
 * Calculates payment variance amount:
 * variance = expectedAllowed - actualAllowed
 */
export function calculateVarianceAmount(expectedAllowed, actualAllowed) {
  const exp = Number(expectedAllowed) || 0.0;
  const act = Number(actualAllowed) || 0.0;
  return Number((exp - act).toFixed(2));
}

/**
 * Calculates payment variance percentage:
 * pct = expectedAllowed > 0 ? ((expectedAllowed - actualAllowed) / expectedAllowed) * 100 : 0.00
 */
export function calculateVariancePercentage(expectedAllowed, actualAllowed) {
  const exp = Number(expectedAllowed) || 0.0;
  const act = Number(actualAllowed) || 0.0;
  if (exp <= 0) return 0.00;
  return Number((((exp - act) / exp) * 100.0).toFixed(2));
}

/**
 * 10-Step Deterministic Validation Rule Engine:
 * Evaluates adjudication context to assign outcome status, confidence, and rule path.
 */
export function evaluateValidationOutcome(expectedAllowed, actualAllowed, context = {}) {
  const exp = Number(expectedAllowed) || 0.0;
  const act = Number(actualAllowed) || 0.0;
  const variance = calculateVarianceAmount(exp, act);

  // Step 1: Incomplete authoritative data check
  if (!context.contract_version_id || !context.plan_id || !context.source_835_id) {
    return {
      status: 'INSUFFICIENT_DATA',
      confidence: 'UNKNOWN',
      completenessScore: 40.00,
      rootCause: 'MISSING_CONTRACT_OR_835_RECORD',
      isRecoveryEligible: false,
      ruleTrace: ['Step 1: Check authoritative source data -> Contract or 835 missing']
    };
  }

  // Step 2: Secondary payer pending check
  if (context.has_secondary_payer && context.secondary_forwarded) {
    return {
      status: 'SECONDARY_PAYER_PENDING',
      confidence: 'HIGH',
      completenessScore: 95.00,
      rootCause: 'COB_SECONDARY_CROSSOVER_PENDING',
      isRecoveryEligible: false,
      ruleTrace: ['Step 1: Data complete', 'Step 2: Secondary crossover confirmed active']
    };
  }

  // Step 3: Patient responsibility allocation check (PR-1, PR-2, PR-3)
  const patientResp = Number(context.patient_responsibility) || 0.0;
  if (patientResp > 0 && Math.abs(variance - patientResp) < 1.00) {
    return {
      status: 'PATIENT_RESPONSIBILITY',
      confidence: 'HIGH',
      completenessScore: 98.00,
      rootCause: 'PATIENT_DEDUCTIBLE_COPAY_ASSIGNMENT',
      isRecoveryEligible: false,
      ruleTrace: ['Step 1: Data complete', 'Step 2: No secondary', 'Step 3: Variance matches CARC PR-1/PR-2']
    };
  }

  // Step 4: Statutory MPPR reduction check (Secondary procedure discounted exactly 50%)
  if (context.is_secondary_procedure && context.mppr_applied) {
    const expectedDiscounted = exp * 0.50;
    if (Math.abs(act - expectedDiscounted) < 5.00) {
      return {
        status: 'MPPR_OR_MULTIPLE_PROCEDURE_REDUCTION',
        confidence: 'HIGH',
        completenessScore: 96.00,
        rootCause: 'STATUTORY_50_PERCENT_MPPR_REDUCTION',
        isRecoveryEligible: false,
        ruleTrace: ['Step 1: Data complete', 'Step 2-3: No PR', 'Step 4: Statutory MPPR 50% discount verified']
      };
    }
  }

  // Step 5: Case rate / comprehensive packaging check
  if (context.is_case_rate_inclusive) {
    return {
      status: 'CASE_RATE_OR_BUNDLED',
      confidence: 'HIGH',
      completenessScore: 94.00,
      rootCause: 'INCLUSIVE_UNDER_PRIMARY_CASE_RATE',
      isRecoveryEligible: false,
      ruleTrace: ['Step 1: Data complete', 'Step 5: Code packaged into primary procedure case rate']
    };
  }

  // Step 6: Implant carve-out pending invoice audit
  if (context.is_implant_carveout && !context.implant_invoice_attached) {
    return {
      status: 'IMPLANT_CARVEOUT_REVIEW',
      confidence: 'MEDIUM',
      completenessScore: 82.00,
      rootCause: 'IMPLANT_INVOICE_VERIFICATION_PENDING',
      isRecoveryEligible: true,
      ruleTrace: ['Step 1: Data complete', 'Step 6: Implant Rev 0278 requires manufacturer invoice verification']
    };
  }

  // Step 7: Coding or modifier review required
  if (context.modifier_ambiguity_flag) {
    return {
      status: 'CODING_OR_MODIFIER_REVIEW',
      confidence: 'MEDIUM',
      completenessScore: 80.00,
      rootCause: 'MODIFIER_59_DISTINCT_PROCEDURAL_QUERY',
      isRecoveryEligible: false,
      ruleTrace: ['Step 1: Data complete', 'Step 7: Modifier -59 or laterality documentation requires coding audit']
    };
  }

  // Step 8: Valid contractual adjustment
  if (variance <= 0 || context.verified_contractual_allowance) {
    return {
      status: 'VALID_CONTRACTUAL_ADJUSTMENT',
      confidence: 'HIGH',
      completenessScore: 98.00,
      rootCause: 'CONTRACT_SCHEDULE_DISCOUNT_COMPLIANT',
      isRecoveryEligible: false,
      ruleTrace: ['Step 1: Data complete', 'Step 8: Payment matches contracted allowable fee schedule']
    };
  }

  // Step 9: Confirmed Valid Underpayment (True Short-Pay)
  if (variance > 50.00 && context.contract_rate_authoritative) {
    return {
      status: 'VALID_UNDERPAYMENT',
      confidence: 'HIGH',
      completenessScore: 98.00,
      rootCause: 'PAYER_REIMBURSED_BELOW_CONTRACT_SCHEDULE',
      isRecoveryEligible: true,
      ruleTrace: [
        'Step 1: Contract and 835 confirmed',
        'Step 2: No secondary crossover',
        'Step 3: PR isolated',
        'Step 4-7: No MPPR or bundle packaging',
        'Step 9: Contract allowable violated by payer'
      ]
    };
  }

  // Step 10: Fallback to Manual Review
  return {
    status: 'NEEDS_MANUAL_REVIEW',
    confidence: 'MEDIUM',
    completenessScore: 75.00,
    rootCause: 'MULTI_FACTOR_RULE_DISCREPANCY',
    isRecoveryEligible: false,
    ruleTrace: ['Step 1-9 evaluated -> Conflicting rule outputs require supervisor audit']
  };
}

// 4. Baseline Payment Variances Dataset
export const BASELINE_PAYMENT_VARIANCES = [
  {
    id: 'pv-001',
    organization_id: 'org-asc-001',
    facility_id: 'fac-main-001',
    case_id: 10420,
    claim_id: 'c7a8b9c0-9991-4444-8888-000000000001',
    payer_id: 'pyr-bcbs-001',
    plan_id: 'pln-bcbs-ppo',
    contract_id: 'cnt-bcbs-2026',
    contract_version_id: 'cv-bcbs-v2.1',
    payer_name: 'Blue Cross Blue Shield',
    patient_name: 'Jonathan Reynolds',
    procedure_name: 'Knee Arthroscopy w/ Meniscectomy',
    cpt_code: '29881',
    date_of_service: '2026-10-15',
    expected_allowed: 3850.00,
    actual_allowed: 2950.00,
    actual_paid: 2360.00,
    patient_responsibility: 590.00,
    contractual_adjustment: 0.00,
    variance_amount: 900.00,
    variance_percent: 23.38,
    variance_type: 'FEE_SCHEDULE_DEFICIT',
    validation_status: 'VALID_UNDERPAYMENT',
    root_cause_code: 'PAYER_REIMBURSED_BELOW_CONTRACT_SCHEDULE',
    confidence_level: 'HIGH',
    data_completeness_score: 98.00,
    filing_deadline: '2026-12-15',
    owner_user_id: 'usr-biller-01',
    calculation_version_id: 'calc-v93-01',
    source_835_id: 'era-835-9921',
    lines: [
      {
        id: 'pvl-001-1',
        claim_line_id: 'cl-001-1',
        cpt_hcpcs_code: '29881',
        modifiers: ['RT'],
        units: 1,
        expected_allowed: 3850.00,
        actual_allowed: 2950.00,
        actual_paid: 2360.00,
        line_variance: 900.00,
        rule_path: { fee_schedule: 'ASC_ORTHO_2026', line_multiplier: 1.0 },
        carc_codes: ['CO-45'],
        rarc_codes: ['N522'],
        validation_result: 'VALID_UNDERPAYMENT'
      }
    ],
    resolution_notes: 'Validated: BCBS adjudicated against outdated 2024 tier-2 schedule instead of active 2026 ASC commercial amendment. Full contract lineage established.'
  },
  {
    id: 'pv-002',
    organization_id: 'org-asc-001',
    facility_id: 'fac-main-001',
    case_id: 10455,
    claim_id: 'c7a8b9c0-9992-4444-8888-000000000002',
    payer_id: 'pyr-aetna-002',
    plan_id: 'pln-aet-choice',
    contract_id: 'cnt-aetna-2026',
    contract_version_id: 'cv-aet-v1.4',
    payer_name: 'Aetna Commercial',
    patient_name: 'Sarah Jenkins',
    procedure_name: 'Rotator Cuff Repair w/ Hardware',
    cpt_code: '29827',
    date_of_service: '2026-10-20',
    expected_allowed: 6200.00,
    actual_allowed: 3800.00,
    actual_paid: 3040.00,
    patient_responsibility: 760.00,
    contractual_adjustment: 0.00,
    variance_amount: 2400.00,
    variance_percent: 38.71,
    variance_type: 'IMPLANT_CARVEOUT_UNPAID',
    validation_status: 'IMPLANT_CARVEOUT_REVIEW',
    root_cause_code: 'IMPLANT_INVOICE_VERIFICATION_PENDING',
    confidence_level: 'MEDIUM',
    data_completeness_score: 84.00,
    filing_deadline: '2026-12-20',
    owner_user_id: 'usr-biller-02',
    calculation_version_id: 'calc-v93-02',
    source_835_id: 'era-835-9922',
    lines: [
      {
        id: 'pvl-002-1',
        claim_line_id: 'cl-002-1',
        cpt_hcpcs_code: '29827',
        modifiers: ['LT'],
        units: 1,
        expected_allowed: 3800.00,
        actual_allowed: 3800.00,
        actual_paid: 3040.00,
        line_variance: 0.00,
        rule_path: { fee_schedule: 'ASC_SHOULDER_2026' },
        carc_codes: [],
        rarc_codes: [],
        validation_result: 'VALID_CONTRACTUAL_ADJUSTMENT'
      },
      {
        id: 'pvl-002-2',
        claim_line_id: 'cl-002-2',
        cpt_hcpcs_code: 'C1713',
        modifiers: [],
        units: 2,
        expected_allowed: 2400.00,
        actual_allowed: 0.00,
        actual_paid: 0.00,
        line_variance: 2400.00,
        rule_path: { carveout: 'INVOICE_PLUS_12_PCT' },
        carc_codes: ['CO-97'],
        rarc_codes: ['N650'],
        validation_result: 'IMPLANT_CARVEOUT_REVIEW'
      }
    ],
    resolution_notes: 'Validated: Surgical base rate paid correctly; $2,400 variance is isolated on Revenue Code 0278 (C1713 anchor). Pending Stryker distributor invoice verification.'
  },
  {
    id: 'pv-003',
    organization_id: 'org-asc-001',
    facility_id: 'fac-main-001',
    case_id: 10390,
    claim_id: 'c7a8b9c0-9993-4444-8888-000000000003',
    payer_id: 'pyr-uhc-003',
    plan_id: 'pln-uhc-choice',
    contract_id: 'cnt-uhc-2026',
    contract_version_id: 'cv-uhc-v3.0',
    payer_name: 'UnitedHealthcare',
    patient_name: 'Robert Thornton',
    procedure_name: 'Lumbar Laminectomy w/ Additional Level',
    cpt_code: '63047',
    date_of_service: '2026-09-25',
    expected_allowed: 5100.00,
    actual_allowed: 3825.00,
    actual_paid: 3060.00,
    patient_responsibility: 765.00,
    contractual_adjustment: 1275.00,
    variance_amount: 1275.00,
    variance_percent: 25.00,
    variance_type: 'MPPR_REDUCTION',
    validation_status: 'MPPR_OR_MULTIPLE_PROCEDURE_REDUCTION',
    root_cause_code: 'STATUTORY_50_PERCENT_MPPR_REDUCTION',
    confidence_level: 'HIGH',
    data_completeness_score: 96.00,
    filing_deadline: '2026-11-25',
    owner_user_id: 'usr-biller-01',
    calculation_version_id: 'calc-v93-03',
    source_835_id: 'era-835-9923',
    lines: [
      {
        id: 'pvl-003-1',
        claim_line_id: 'cl-003-1',
        cpt_hcpcs_code: '63047',
        modifiers: [],
        units: 1,
        expected_allowed: 2550.00,
        actual_allowed: 2550.00,
        actual_paid: 2040.00,
        line_variance: 0.00,
        rule_path: { primary_rate: 2550.00 },
        carc_codes: [],
        rarc_codes: [],
        validation_result: 'VALID_CONTRACTUAL_ADJUSTMENT'
      },
      {
        id: 'pvl-003-2',
        claim_line_id: 'cl-003-2',
        cpt_hcpcs_code: '63048',
        modifiers: ['51'],
        units: 1,
        expected_allowed: 2550.00,
        actual_allowed: 1275.00,
        actual_paid: 1020.00,
        line_variance: 1275.00,
        rule_path: { mppr_rate: '50_PCT_REDUCTION' },
        carc_codes: ['CO-59'],
        rarc_codes: ['MA01'],
        validation_result: 'MPPR_OR_MULTIPLE_PROCEDURE_REDUCTION'
      }
    ],
    resolution_notes: 'Validated: $1,275 variance represents legitimate standard statutory 50% multiple procedure reduction on secondary CPT 63048. Non-recoverable contractual allowance.'
  },
  {
    id: 'pv-004',
    organization_id: 'org-asc-001',
    facility_id: 'fac-main-001',
    case_id: 10480,
    claim_id: 'c7a8b9c0-9994-4444-8888-000000000004',
    payer_id: 'pyr-med-004',
    plan_id: 'pln-med-b',
    contract_id: 'cnt-cms-opps',
    contract_version_id: 'cv-cms-2026',
    payer_name: 'Medicare Part B',
    patient_name: 'Emily Watson',
    procedure_name: 'Cataract Surgery w/ IOL',
    cpt_code: '66984',
    date_of_service: '2026-10-22',
    expected_allowed: 1120.00,
    actual_allowed: 1120.00,
    actual_paid: 896.00,
    patient_responsibility: 224.00,
    contractual_adjustment: 0.00,
    variance_amount: 224.00,
    variance_percent: 20.00,
    variance_type: 'PATIENT_LIABILITY',
    validation_status: 'PATIENT_RESPONSIBILITY',
    root_cause_code: 'PATIENT_DEDUCTIBLE_COPAY_ASSIGNMENT',
    confidence_level: 'HIGH',
    data_completeness_score: 98.00,
    filing_deadline: '2026-12-22',
    owner_user_id: 'usr-biller-03',
    calculation_version_id: 'calc-v93-04',
    source_835_id: 'era-835-9924',
    lines: [
      {
        id: 'pvl-004-1',
        claim_line_id: 'cl-004-1',
        cpt_hcpcs_code: '66984',
        modifiers: ['RT'],
        units: 1,
        expected_allowed: 1120.00,
        actual_allowed: 1120.00,
        actual_paid: 896.00,
        line_variance: 224.00,
        rule_path: { opps_base: 1120.00 },
        carc_codes: ['PR-2'],
        rarc_codes: ['N24'],
        validation_result: 'PATIENT_RESPONSIBILITY'
      }
    ],
    resolution_notes: 'Validated: Medicare allowed full $1,120.00 fee. The $224 difference is statutory 20% Medicare Part B patient co-insurance (PR-2), not an underpayment.'
  },
  {
    id: 'pv-005',
    organization_id: 'org-asc-001',
    facility_id: 'fac-main-001',
    case_id: 10410,
    claim_id: 'c7a8b9c0-9995-4444-8888-000000000005',
    payer_id: 'pyr-cigna-005',
    plan_id: 'pln-cig-open',
    contract_id: 'cnt-cigna-2026',
    contract_version_id: 'cv-cig-v2.0',
    payer_name: 'Cigna Healthcare',
    patient_name: 'Michael Chang',
    procedure_name: 'Laparoscopic Cholecystectomy',
    cpt_code: '47562',
    date_of_service: '2026-10-05',
    expected_allowed: 4400.00,
    actual_allowed: 3520.00,
    actual_paid: 2816.00,
    patient_responsibility: 704.00,
    contractual_adjustment: 0.00,
    variance_amount: 880.00,
    variance_percent: 20.00,
    variance_type: 'SECONDARY_PAYER_PENDING',
    validation_status: 'SECONDARY_PAYER_PENDING',
    root_cause_code: 'COB_SECONDARY_CROSSOVER_PENDING',
    confidence_level: 'HIGH',
    data_completeness_score: 95.00,
    filing_deadline: '2026-12-05',
    owner_user_id: 'usr-biller-01',
    calculation_version_id: 'calc-v93-05',
    source_835_id: 'era-835-9925',
    lines: [
      {
        id: 'pvl-005-1',
        claim_line_id: 'cl-005-1',
        cpt_hcpcs_code: '47562',
        modifiers: [],
        units: 1,
        expected_allowed: 4400.00,
        actual_allowed: 3520.00,
        actual_paid: 2816.00,
        line_variance: 880.00,
        rule_path: { primary_cob_allowed: 3520.00 },
        carc_codes: ['OA-23'],
        rarc_codes: ['MA04'],
        validation_result: 'SECONDARY_PAYER_PENDING'
      }
    ],
    resolution_notes: 'Validated: Cigna adjudicated as primary; 835 loop 2110 MOA confirms balance transferred to Medicare Supplemental secondary. Non-actionable until secondary adjudicates.'
  },
  {
    id: 'pv-006',
    organization_id: 'org-asc-001',
    facility_id: 'fac-main-001',
    case_id: 10495,
    claim_id: 'c7a8b9c0-9996-4444-8888-000000000006',
    payer_id: 'pyr-hum-006',
    plan_id: null,
    contract_id: null,
    contract_version_id: null,
    payer_name: 'Humana Commercial',
    patient_name: 'Amanda Vance',
    procedure_name: 'Bilateral Carpal Tunnel Release',
    cpt_code: '64721',
    date_of_service: '2026-10-18',
    expected_allowed: 2200.00,
    actual_allowed: 1750.00,
    actual_paid: 1400.00,
    patient_responsibility: 350.00,
    contractual_adjustment: 0.00,
    variance_amount: 450.00,
    variance_percent: 20.45,
    variance_type: 'MISSING_CONTRACT_SCHEDULE',
    validation_status: 'INSUFFICIENT_DATA',
    root_cause_code: 'MISSING_CONTRACT_OR_835_RECORD',
    confidence_level: 'UNKNOWN',
    data_completeness_score: 45.00,
    filing_deadline: '2026-12-18',
    owner_user_id: 'usr-biller-02',
    calculation_version_id: null,
    source_835_id: 'era-835-9926',
    lines: [
      {
        id: 'pvl-006-1',
        claim_line_id: 'cl-006-1',
        cpt_hcpcs_code: '64721',
        modifiers: ['50'],
        units: 1,
        expected_allowed: 2200.00,
        actual_allowed: 1750.00,
        actual_paid: 1400.00,
        line_variance: 450.00,
        rule_path: { heuristic: 'UNINDEXED_PAYER_SCHEDULE' },
        carc_codes: ['CO-45'],
        rarc_codes: [],
        validation_result: 'INSUFFICIENT_DATA'
      }
    ],
    resolution_notes: 'Validation Halt: Humana 2026 commercial agreement schedule is unindexed in contract engine. Requires contract specialist upload before asserting underpayment.'
  }
];

// 5. Aggregation Helpers

/**
 * Aggregates summary KPIs across payment variances
 */
export function getValidationSummaryMetrics(variances = BASELINE_PAYMENT_VARIANCES) {
  const totalVariances = variances.length;
  let totalVarianceAmount = 0.00;
  let validUnderpaymentAmount = 0.00;
  let contractualAllowanceAmount = 0.00;
  let patientLiabilityAmount = 0.00;
  let pendingReviewAmount = 0.00;

  variances.forEach(pv => {
    const v = Number(pv.variance_amount) || 0.0;
    totalVarianceAmount += v;

    if (pv.validation_status === 'VALID_UNDERPAYMENT') {
      validUnderpaymentAmount += v;
    } else if (
      pv.validation_status === 'VALID_CONTRACTUAL_ADJUSTMENT' ||
      pv.validation_status === 'MPPR_OR_MULTIPLE_PROCEDURE_REDUCTION' ||
      pv.validation_status === 'CASE_RATE_OR_BUNDLED'
    ) {
      contractualAllowanceAmount += v;
    } else if (pv.validation_status === 'PATIENT_RESPONSIBILITY') {
      patientLiabilityAmount += Number(pv.patient_responsibility) || v;
    } else {
      pendingReviewAmount += v;
    }
  });

  return {
    totalVariances,
    totalVarianceAmount: Number(totalVarianceAmount.toFixed(2)),
    validUnderpaymentAmount: Number(validUnderpaymentAmount.toFixed(2)),
    contractualAllowanceAmount: Number(contractualAllowanceAmount.toFixed(2)),
    patientLiabilityAmount: Number(patientLiabilityAmount.toFixed(2)),
    pendingReviewAmount: Number(pendingReviewAmount.toFixed(2))
  };
}

/**
 * Aggregates variance count and dollars by validation outcome status
 */
export function getOutcomeDistribution(variances = BASELINE_PAYMENT_VARIANCES) {
  const dist = {};

  Object.keys(VALIDATION_STATUSES).forEach(status => {
    dist[status] = {
      id: status,
      label: VALIDATION_STATUSES[status].label,
      description: VALIDATION_STATUSES[status].description,
      colorToken: VALIDATION_STATUSES[status].colorToken,
      isRecoveryEligible: VALIDATION_STATUSES[status].isRecoveryEligible,
      count: 0,
      total_variance: 0.00
    };
  });

  variances.forEach(pv => {
    if (dist[pv.validation_status]) {
      dist[pv.validation_status].count += 1;
      dist[pv.validation_status].total_variance += Number(pv.variance_amount) || 0.0;
    }
  });

  return Object.values(dist).map(d => ({
    ...d,
    total_variance: Number(d.total_variance.toFixed(2))
  })).sort((a, b) => b.total_variance - a.total_variance);
}

// 6. Stateful In-Memory Payment Variance Validation Store
class PaymentVarianceValidationStore {
  constructor() {
    this.variances = JSON.parse(JSON.stringify(BASELINE_PAYMENT_VARIANCES));
  }

  getVariances(filters = {}, referenceDate = new Date()) {
    let result = this.variances.map(pv => {
      const dos = new Date(pv.date_of_service);
      const ref = new Date(referenceDate);
      const daysSinceDOS = Math.max(0, Math.floor((ref.getTime() - dos.getTime()) / (1000 * 60 * 60 * 24)));

      let daysUntilDeadline = null;
      if (pv.filing_deadline) {
        const ddl = new Date(pv.filing_deadline);
        daysUntilDeadline = Math.floor((ddl.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24));
      }

      return {
        ...pv,
        days_since_dos: daysSinceDOS,
        days_until_deadline: daysUntilDeadline
      };
    });

    if (filters.status && filters.status !== 'ALL') {
      result = result.filter(pv => pv.validation_status === filters.status);
    }
    if (filters.confidence && filters.confidence !== 'ALL') {
      result = result.filter(pv => pv.confidence_level === filters.confidence);
    }
    if (filters.payer && filters.payer !== 'ALL') {
      result = result.filter(pv => pv.payer_name === filters.payer);
    }
    if (filters.recoveryEligibleOnly) {
      result = result.filter(pv => {
        const info = VALIDATION_STATUSES[pv.validation_status];
        return info && info.isRecoveryEligible;
      });
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(pv =>
        pv.id.toLowerCase().includes(q) ||
        pv.claim_id.toLowerCase().includes(q) ||
        pv.patient_name.toLowerCase().includes(q) ||
        pv.payer_name.toLowerCase().includes(q) ||
        pv.cpt_code.toLowerCase().includes(q) ||
        pv.procedure_name.toLowerCase().includes(q)
      );
    }

    return result.sort((a, b) => b.variance_amount - a.variance_amount);
  }

  getVarianceById(id) {
    return this.variances.find(pv => pv.id === id) || null;
  }

  validateVariance(id, options = {}) {
    const pv = this.getVarianceById(id);
    if (!pv) throw new Error(`Payment variance record ${id} not found`);

    const result = evaluateValidationOutcome(pv.expected_allowed, pv.actual_allowed, {
      contract_version_id: pv.contract_version_id,
      plan_id: pv.plan_id,
      source_835_id: pv.source_835_id,
      patient_responsibility: pv.patient_responsibility,
      has_secondary_payer: pv.validation_status === 'SECONDARY_PAYER_PENDING',
      secondary_forwarded: pv.validation_status === 'SECONDARY_PAYER_PENDING',
      contract_rate_authoritative: Boolean(pv.contract_id),
      ...options
    });

    pv.validation_status = result.status;
    pv.confidence_level = result.confidence;
    pv.data_completeness_score = result.completenessScore;
    pv.root_cause_code = result.rootCause;
    pv.validated_at = new Date().toISOString();
    pv.resolution_notes = `${pv.resolution_notes ? pv.resolution_notes + ' | ' : ''}Validated [${result.status}]: ${options.notes || result.ruleTrace.join(' -> ')}`;
    return pv;
  }

  advanceToRecovery(id, { notes } = {}) {
    const pv = this.getVarianceById(id);
    if (!pv) throw new Error(`Payment variance record ${id} not found`);

    const outcome = VALIDATION_STATUSES[pv.validation_status];
    if (!outcome || !outcome.isRecoveryEligible) {
      throw new Error(`Cannot advance status '${pv.validation_status}' to recovery. Only recovery-eligible validated underpayments can advance.`);
    }

    pv.validated_at = new Date().toISOString();
    pv.resolution_notes = `${pv.resolution_notes ? pv.resolution_notes + ' | ' : ''}Advanced to Recovery Evidence Worklist: ${notes || 'Queued for payer dispute submission'}`;
    return pv;
  }

  flagManualReview(id, { reason, notes } = {}) {
    const pv = this.getVarianceById(id);
    if (!pv) throw new Error(`Payment variance record ${id} not found`);

    pv.validation_status = 'NEEDS_MANUAL_REVIEW';
    pv.validated_at = new Date().toISOString();
    pv.resolution_notes = `${pv.resolution_notes ? pv.resolution_notes + ' | ' : ''}Supervisor Review Requested (${reason || 'RULE_AMBIGUITY'}): ${notes || 'Flagged for manual contract review'}`;
    return pv;
  }

  dismissVariance(id, { reason, notes } = {}) {
    const pv = this.getVarianceById(id);
    if (!pv) throw new Error(`Payment variance record ${id} not found`);

    pv.validation_status = 'VALID_CONTRACTUAL_ADJUSTMENT';
    pv.validated_at = new Date().toISOString();
    pv.resolution_notes = `${pv.resolution_notes ? pv.resolution_notes + ' | ' : ''}Dismissed (${reason || 'CONTRACTUAL_ALLOWANCE'}): ${notes || 'Audited and dismissed per agreement terms'}`;
    return pv;
  }
}

export const paymentVarianceValidationService = new PaymentVarianceValidationStore();
export default paymentVarianceValidationService;

