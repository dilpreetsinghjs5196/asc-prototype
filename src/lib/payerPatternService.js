/**
 * RECURRING PAYER UNDERPAYMENT PATTERNS SERVICE
 * Phase 93C — Revenue Cycle Management
 * 
 * Production service for detecting repeated underpayment patterns across payers,
 * health plans, CPT codes, modifiers, and contract rules, and bundling validated
 * multi-claim cohorts into authoritative batch recovery opportunities.
 */

// ==============================================================================
// 1. CONSTANTS & TAXONOMY
// ==============================================================================

export const PATTERN_ROOT_CAUSES = {
  FEE_SCHEDULE_MISMATCH: {
    code: 'FEE_SCHEDULE_MISMATCH',
    label: 'Fee Schedule Mismatch',
    badgeColor: '#0284c7',
    description: 'Repeated adjudication using outdated, reduced, or default fee tables instead of contracted rate.'
  },
  IMPLANT_CARVEOUT_OMISSION: {
    code: 'IMPLANT_CARVEOUT_OMISSION',
    label: 'Implant Carveout Omission',
    badgeColor: '#f59e0b',
    description: 'Repeated non-payment or packaging of high-cost surgical implants on Rev 0278 lines.'
  },
  MPPR_OVER_DISCOUNT: {
    code: 'MPPR_OVER_DISCOUNT',
    label: 'MPPR Over-Discounting',
    badgeColor: '#06b6d4',
    description: 'Repeated excessive multiple procedure cuts (>50% cut, or cuts applied to sole primary procedure).'
  },
  MODIFIER_REDUCTION_ERROR: {
    code: 'MODIFIER_REDUCTION_ERROR',
    label: 'Modifier Reduction Error',
    badgeColor: '#eab308',
    description: 'Repeated payment reduction on procedures billed with modifier -59, -X{EPSU}, -50, or -22.'
  },
  CASE_RATE_UNPACKAGING_ERROR: {
    code: 'CASE_RATE_UNPACKAGING_ERROR',
    label: 'Case-Rate Packaging Error',
    badgeColor: '#38bdf8',
    description: 'Repeated packaging of separately billable clinical procedures into a single case rate.'
  },
  CONTRACT_VERSION_MISMATCH: {
    code: 'CONTRACT_VERSION_MISMATCH',
    label: 'Contract Version Mismatch',
    badgeColor: '#2dd4bf',
    description: 'Repeated adjudication under superseded contract version or expired rate schedule.'
  },
  SECONDARY_PROCEDURE_UNDERPAYMENT: {
    code: 'SECONDARY_PROCEDURE_UNDERPAYMENT',
    label: 'Secondary Procedure Short-Pay',
    badgeColor: '#34d399',
    description: 'Repeated zero-dollar or below-contract allowance on secondary surgical procedures.'
  },
  LINE_LEVEL_CARC_EXCLUSION: {
    code: 'LINE_LEVEL_CARC_EXCLUSION',
    label: 'Line-Level CARC Exclusion',
    badgeColor: '#ef4444',
    description: 'Repeated automated denials driven by specific automated payer CARC/RARC rule engines.'
  }
};

export const PATTERN_STATUSES = {
  OPEN: {
    code: 'OPEN',
    label: 'Open (Evaluating)',
    badgeColor: '#64748b',
    description: 'Identified variance cluster currently below batch threshold.'
  },
  UNDER_REVIEW: {
    code: 'UNDER_REVIEW',
    label: 'Under Review',
    badgeColor: '#0ea5e9',
    description: 'Assigned to RCM contract specialist for multi-claim validation.'
  },
  VALIDATED: {
    code: 'VALIDATED',
    label: 'Validated Pattern',
    badgeColor: '#10b981',
    description: 'Clinically and contractually verified as genuine systemic underpayment.'
  },
  BATCH_RECOVERY_READY: {
    code: 'BATCH_RECOVERY_READY',
    label: 'Batch Ready',
    badgeColor: '#0284c7',
    description: 'Cohort exceeds volume/dollar threshold and is ready for batch opportunity creation.'
  },
  IN_RECOVERY: {
    code: 'IN_RECOVERY',
    label: 'In Recovery',
    badgeColor: '#06b6d4',
    description: 'Dispute packet formally submitted to payer contracting leadership.'
  },
  RESOLVED: {
    code: 'RESOLVED',
    label: 'Resolved (Settled)',
    badgeColor: '#10b981',
    description: 'Payer acknowledged pattern and issued batch re-adjudication / settlement.'
  },
  DISMISSED: {
    code: 'DISMISSED',
    label: 'Dismissed',
    badgeColor: '#94a3b8',
    description: 'Reviewed and confirmed as legitimate contractual adjustment upon multi-claim review.'
  },
  EXPIRED: {
    code: 'EXPIRED',
    label: 'Expired',
    badgeColor: '#dc2626',
    description: 'Earliest statutory filing deadline elapsed before batch action was taken.'
  }
};

export const BATCH_STATUSES = {
  DRAFT: 'DRAFT',
  READY_FOR_SUPERVISOR: 'READY_FOR_SUPERVISOR',
  APPROVED: 'APPROVED',
  DISPATCHED_TO_PAYER: 'DISPATCHED_TO_PAYER',
  SETTLED: 'SETTLED',
  CLOSED: 'CLOSED',
  EXPIRED: 'EXPIRED'
};

// ==============================================================================
// 2. DETERMINISTIC GROUPING & ANALYTICAL FORMULAE
// ==============================================================================

/**
 * Generates multi-dimensional deterministic grouping key (Rule 1)
 * Prevents false grouping across different plans, contracts, or modifier signatures.
 */
export function generateGroupingKey(claim) {
  if (!claim || !claim.payer_id) return null;

  const payer = String(claim.payer_id).trim();
  const plan = claim.plan_id ? String(claim.plan_id).trim() : 'DEFAULT_PLAN';
  const contractVer = claim.contract_version_id ? String(claim.contract_version_id).trim() : 'DEFAULT_VER';
  const rootCause = String(claim.root_cause_code || 'GENERIC_UNDERPAYMENT').trim();
  const cpt = claim.cpt_hcpcs_code ? String(claim.cpt_hcpcs_code).trim() : 'ALL_CPT';
  
  // Sort modifiers for exact signature match
  const mods = Array.isArray(claim.modifiers) && claim.modifiers.length > 0
    ? [...claim.modifiers].sort().join(',')
    : 'NONE';
    
  const ruleSig = claim.rule_signature ? String(claim.rule_signature).trim() : 'DEFAULT_RULE';

  return `${payer}|${plan}|${contractVer}|${rootCause}|${cpt}|${mods}|${ruleSig}`;
}

/**
 * Evaluates whether a claim cluster qualifies as an actionable pattern (Rule 2)
 * Threshold: at least 3 validated claims OR aggregate validated recoverable >= threshold
 */
export function qualifiesAsPattern(claims = [], facilityThreshold = 2500) {
  const validatedClaims = claims.filter(c => c.validation_status === 'VALID_UNDERPAYMENT');
  const count = validatedClaims.length;
  const aggregateAmount = validatedClaims.reduce((sum, c) => sum + (parseFloat(c.variance_amount) || 0), 0);

  const meetsVolume = count >= 3;
  const meetsHighDollar = count >= 2 && aggregateAmount >= facilityThreshold;

  return {
    qualifies: meetsVolume || meetsHighDollar,
    meetsVolume,
    meetsHighDollar,
    validatedCount: count,
    aggregateAmount: +aggregateAmount.toFixed(2),
    thresholdUsed: facilityThreshold
  };
}

/**
 * Quality-Capped Confidence Inheritance (Rule 3)
 * Confidence cannot exceed the proportion of validated claims in the cluster.
 */
export function calculatePatternConfidence(claims = []) {
  if (!claims || claims.length === 0) return 'UNKNOWN';

  const validatedCount = claims.filter(c => c.validation_status === 'VALID_UNDERPAYMENT').length;
  const ratio = validatedCount / claims.length;

  if (ratio < 0.60) return 'LOW';
  if (ratio < 0.85) return 'MEDIUM';
  return 'HIGH';
}

/**
 * Earliest Statutory Filing Deadline Calculation (Rule 4)
 * Returns the earliest relevant filing deadline across all included claims.
 */
export function calculateEarliestDeadline(claims = []) {
  const dates = claims
    .map(c => c.filing_deadline)
    .filter(Boolean)
    .map(d => new Date(d).getTime())
    .filter(t => !isNaN(t));

  if (dates.length === 0) return null;
  const earliestTime = Math.min(...dates);
  return new Date(earliestTime).toISOString().split('T')[0];
}

/**
 * Composite Priority Score for Batch Opportunities
 * Weight: Dollar Value (50%), Claim Count (30%), Deadline Urgency (20%)
 */
export function calculatePriorityScore(claimCount, aggregateRecovery, earliestDeadline) {
  const recovery = Math.max(0, parseFloat(aggregateRecovery) || 0);
  const count = Math.max(1, parseInt(claimCount) || 1);

  // Value subscore (capped at $15,000 = 100)
  const valueScore = Math.min(100, (recovery / 15000) * 100);

  // Volume subscore (capped at 10 claims = 100)
  const volumeScore = Math.min(100, (count / 10) * 100);

  // Urgency subscore based on days remaining
  let urgencyScore = 50;
  if (earliestDeadline) {
    const daysLeft = Math.max(0, Math.round((new Date(earliestDeadline) - new Date()) / 86400000));
    if (daysLeft <= 14) urgencyScore = 100;
    else if (daysLeft <= 30) urgencyScore = 80;
    else if (daysLeft <= 60) urgencyScore = 60;
    else urgencyScore = 40;
  }

  const composite = (valueScore * 0.50) + (volumeScore * 0.30) + (urgencyScore * 0.20);
  return +composite.toFixed(2);
}

// ==============================================================================
// 3. BASELINE DATASET (SYSTEMIC PAYER UNDERPAYMENT PATTERNS)
// ==============================================================================

const INITIAL_PAYER_PATTERNS = [
  {
    id: 'pat-001',
    organization_id: 'org-asc-001',
    facility_id: 'fac-asc-001',
    payer_id: 'pyr-bcbs',
    payer_name: 'Blue Cross Blue Shield of TX',
    plan_id: 'pln-bcbs-ppo',
    plan_name: 'Blue Choice Commercial PPO',
    contract_id: 'ctr-bcbs-2026',
    contract_version_id: 'ver-2026-v1',
    pattern_code: 'PAT-BCBS-29827-FEE',
    root_cause_code: 'FEE_SCHEDULE_MISMATCH',
    cpt_hcpcs_code: '29827',
    procedure_name: 'Arthroscopy, shoulder, surgical; with rotator cuff repair',
    modifier_signature: 'NONE',
    rule_signature: 'RULE-BCBS-SCHED-2026-SEC4',
    first_detected_date: '2026-09-12',
    last_detected_date: '2026-11-04',
    claim_count: 5,
    validated_claim_count: 5,
    aggregate_variance: 7000.00,
    validated_recoverable_amount: 7000.00,
    confidence_level: 'HIGH',
    status: 'BATCH_RECOVERY_READY',
    earliest_filing_deadline: '2026-11-28',
    notes: 'Repeated payment variance pattern detected: Payer applied obsolete 2025 fee schedule rate ($3,450.00) across 5 consecutive shoulder arthroscopy cases instead of contracted 2026 rate ($4,850.00). Each case is short by $1,400.00.',
    created_at: '2026-10-15T09:00:00Z',
    updated_at: '2026-11-09T14:30:00Z',
    claims: [
      {
        payment_variance_id: 'pv-001-a',
        claim_id: 'clm-9041',
        claim_number: 'CLM-2026-9041',
        patient_name: 'Robert Davis',
        date_of_service: '2026-09-12',
        expected_allowed: 4850.00,
        actual_allowed: 3450.00,
        variance_amount: 1400.00,
        validation_status: 'VALID_UNDERPAYMENT',
        filing_deadline: '2026-11-28'
      },
      {
        payment_variance_id: 'pv-001-b',
        claim_id: 'clm-9055',
        claim_number: 'CLM-2026-9055',
        patient_name: 'Carolyn Adams',
        date_of_service: '2026-09-24',
        expected_allowed: 4850.00,
        actual_allowed: 3450.00,
        variance_amount: 1400.00,
        validation_status: 'VALID_UNDERPAYMENT',
        filing_deadline: '2026-12-04'
      },
      {
        payment_variance_id: 'pv-001-c',
        claim_id: 'clm-9082',
        claim_number: 'CLM-2026-9082',
        patient_name: 'James Wilson',
        date_of_service: '2026-10-08',
        expected_allowed: 4850.00,
        actual_allowed: 3450.00,
        variance_amount: 1400.00,
        validation_status: 'VALID_UNDERPAYMENT',
        filing_deadline: '2026-12-18'
      },
      {
        payment_variance_id: 'pv-001-d',
        claim_id: 'clm-9120',
        claim_number: 'CLM-2026-9120',
        patient_name: 'Anthony Miller',
        date_of_service: '2026-10-20',
        expected_allowed: 4850.00,
        actual_allowed: 3450.00,
        variance_amount: 1400.00,
        validation_status: 'VALID_UNDERPAYMENT',
        filing_deadline: '2026-12-30'
      },
      {
        payment_variance_id: 'pv-001-e',
        claim_id: 'clm-9164',
        claim_number: 'CLM-2026-9164',
        patient_name: 'Susan Clark',
        date_of_service: '2026-11-04',
        expected_allowed: 4850.00,
        actual_allowed: 3450.00,
        variance_amount: 1400.00,
        validation_status: 'VALID_UNDERPAYMENT',
        filing_deadline: '2027-01-14'
      }
    ],
    batch_opportunity: null
  },
  {
    id: 'pat-002',
    organization_id: 'org-asc-001',
    facility_id: 'fac-asc-001',
    payer_id: 'pyr-uhc',
    payer_name: 'UnitedHealthcare Commercial',
    plan_id: 'pln-uhc-choice',
    plan_name: 'Choice Plus Network',
    contract_id: 'ctr-uhc-2026',
    contract_version_id: 'ver-uhc-2026-a',
    pattern_code: 'PAT-UHC-29888-IMP',
    root_cause_code: 'IMPLANT_CARVEOUT_OMISSION',
    cpt_hcpcs_code: '29888',
    procedure_name: 'Arthroscopically aided ACL reconstruction',
    modifier_signature: 'NONE',
    rule_signature: 'RULE-UHC-CARVEOUT-SEC4.2',
    first_detected_date: '2026-09-18',
    last_detected_date: '2026-11-05',
    claim_count: 4,
    validated_claim_count: 4,
    aggregate_variance: 7200.00,
    validated_recoverable_amount: 7200.00,
    confidence_level: 'HIGH',
    status: 'VALIDATED',
    earliest_filing_deadline: '2026-12-05',
    notes: 'Repeated payment variance pattern detected: UHC claims adjudicator consistently bundled HCPCS L8699 bioabsorbable interference screw into primary surgical case rate instead of paying invoice + 15% carveout ($1,800.00 per case).',
    created_at: '2026-10-20T11:00:00Z',
    updated_at: '2026-11-08T15:00:00Z',
    claims: [
      {
        payment_variance_id: 'pv-002-a',
        claim_id: 'clm-9114',
        claim_number: 'CLM-2026-9114',
        patient_name: 'Jessica Taylor',
        date_of_service: '2026-09-18',
        expected_allowed: 6200.00,
        actual_allowed: 4400.00,
        variance_amount: 1800.00,
        validation_status: 'VALID_UNDERPAYMENT',
        filing_deadline: '2026-12-05'
      },
      {
        payment_variance_id: 'pv-002-b',
        claim_id: 'clm-9130',
        claim_number: 'CLM-2026-9130',
        patient_name: 'Daniel Brooks',
        date_of_service: '2026-10-02',
        expected_allowed: 6200.00,
        actual_allowed: 4400.00,
        variance_amount: 1800.00,
        validation_status: 'VALID_UNDERPAYMENT',
        filing_deadline: '2026-12-19'
      },
      {
        payment_variance_id: 'pv-002-c',
        claim_id: 'clm-9152',
        claim_number: 'CLM-2026-9152',
        patient_name: 'Kevin Moore',
        date_of_service: '2026-10-18',
        expected_allowed: 6200.00,
        actual_allowed: 4400.00,
        variance_amount: 1800.00,
        validation_status: 'VALID_UNDERPAYMENT',
        filing_deadline: '2027-01-02'
      },
      {
        payment_variance_id: 'pv-002-d',
        claim_id: 'clm-9178',
        claim_number: 'CLM-2026-9178',
        patient_name: 'Amanda Perez',
        date_of_service: '2026-11-05',
        expected_allowed: 6200.00,
        actual_allowed: 4400.00,
        variance_amount: 1800.00,
        validation_status: 'VALID_UNDERPAYMENT',
        filing_deadline: '2027-01-18'
      }
    ],
    batch_opportunity: null
  },
  {
    id: 'pat-003',
    organization_id: 'org-asc-001',
    facility_id: 'fac-asc-001',
    payer_id: 'pyr-aetna',
    payer_name: 'Aetna Health Inc',
    plan_id: 'pln-aetna-elect',
    plan_name: 'Open Access Elect Choice',
    contract_id: 'ctr-aetna-2026',
    contract_version_id: 'ver-aetna-2026-b',
    pattern_code: 'PAT-AETNA-27447-MPPR',
    root_cause_code: 'MPPR_OVER_DISCOUNT',
    cpt_hcpcs_code: '27447',
    procedure_name: 'Total knee arthroplasty (TKA)',
    modifier_signature: 'NONE',
    rule_signature: 'RULE-AETNA-MPPR-SEC8',
    first_detected_date: '2026-09-01',
    last_detected_date: '2026-10-22',
    claim_count: 3,
    validated_claim_count: 3,
    aggregate_variance: 6750.00,
    validated_recoverable_amount: 6750.00,
    confidence_level: 'HIGH',
    status: 'IN_RECOVERY',
    earliest_filing_deadline: '2026-11-20',
    notes: 'Repeated payment variance pattern detected: Aetna claim engine applied secondary procedure 25% MPPR reduction cut to primary solo joint replacement ($2,250.00 cut per claim). Escalated into active batch dispute.',
    created_at: '2026-10-10T14:00:00Z',
    updated_at: '2026-11-06T11:00:00Z',
    claims: [
      {
        payment_variance_id: 'pv-003-a',
        claim_id: 'clm-8902',
        claim_number: 'CLM-2026-8902',
        patient_name: 'Michael Chang',
        date_of_service: '2026-09-01',
        expected_allowed: 9400.00,
        actual_allowed: 7150.00,
        variance_amount: 2250.00,
        validation_status: 'VALID_UNDERPAYMENT',
        filing_deadline: '2026-11-20'
      },
      {
        payment_variance_id: 'pv-003-b',
        claim_id: 'clm-8940',
        claim_number: 'CLM-2026-8940',
        patient_name: 'George Ramirez',
        date_of_service: '2026-09-22',
        expected_allowed: 9400.00,
        actual_allowed: 7150.00,
        variance_amount: 2250.00,
        validation_status: 'VALID_UNDERPAYMENT',
        filing_deadline: '2026-12-08'
      },
      {
        payment_variance_id: 'pv-003-c',
        claim_id: 'clm-8995',
        claim_number: 'CLM-2026-8995',
        patient_name: 'Patricia King',
        date_of_service: '2026-10-22',
        expected_allowed: 9400.00,
        actual_allowed: 7150.00,
        variance_amount: 2250.00,
        validation_status: 'VALID_UNDERPAYMENT',
        filing_deadline: '2027-01-05'
      }
    ],
    batch_opportunity: {
      id: 'bro-001',
      batch_number: 'BATCH-2026-AETNA-TKA-01',
      claim_count: 3,
      potential_recovery: 6750.00,
      validated_recovery: 6750.00,
      filing_deadline_earliest: '2026-11-20',
      priority_score: 88.50,
      owner_user_id: 'usr-supervisor-1',
      status: 'DISPATCHED_TO_PAYER',
      created_at: '2026-10-26T10:00:00Z'
    }
  },
  {
    id: 'pat-004',
    organization_id: 'org-asc-001',
    facility_id: 'fac-asc-001',
    payer_id: 'pyr-cigna',
    payer_name: 'Cigna Healthcare',
    plan_id: 'pln-cigna-oap',
    plan_name: 'Open Access Plus',
    contract_id: 'ctr-cigna-2026',
    contract_version_id: 'ver-cigna-2026-1',
    pattern_code: 'PAT-CIGNA-66984-MOD',
    root_cause_code: 'MODIFIER_REDUCTION_ERROR',
    cpt_hcpcs_code: '66984',
    procedure_name: 'Cataract surgery with IOL insertion',
    modifier_signature: '59',
    rule_signature: 'RULE-CIGNA-MOD59-EXCL',
    first_detected_date: '2026-09-15',
    last_detected_date: '2026-10-28',
    claim_count: 3,
    validated_claim_count: 2,
    aggregate_variance: 2550.00,
    validated_recoverable_amount: 1700.00,
    confidence_level: 'MEDIUM',
    status: 'UNDER_REVIEW',
    earliest_filing_deadline: '2026-12-14',
    notes: 'Repeated payment variance pattern detected: Cigna automated scrubbing engine systematically denied modifier -59 on concurrent anterior vitrectomy (CPT 67010) as bundled, shorting $850.00 per case. One claim pending operative report review.',
    created_at: '2026-10-25T16:00:00Z',
    updated_at: '2026-11-08T10:00:00Z',
    claims: [
      {
        payment_variance_id: 'pv-004-a',
        claim_id: 'clm-9205',
        claim_number: 'CLM-2026-9205',
        patient_name: 'Barbara Martinez',
        date_of_service: '2026-09-15',
        expected_allowed: 2950.00,
        actual_allowed: 2100.00,
        variance_amount: 850.00,
        validation_status: 'VALID_UNDERPAYMENT',
        filing_deadline: '2026-12-14'
      },
      {
        payment_variance_id: 'pv-004-b',
        claim_id: 'clm-9220',
        claim_number: 'CLM-2026-9220',
        patient_name: 'Ronald Scott',
        date_of_service: '2026-10-04',
        expected_allowed: 2950.00,
        actual_allowed: 2100.00,
        variance_amount: 850.00,
        validation_status: 'VALID_UNDERPAYMENT',
        filing_deadline: '2026-12-28'
      },
      {
        payment_variance_id: 'pv-004-c',
        claim_id: 'clm-9255',
        claim_number: 'CLM-2026-9255',
        patient_name: 'Helen Foster',
        date_of_service: '2026-10-28',
        expected_allowed: 2950.00,
        actual_allowed: 2100.00,
        variance_amount: 850.00,
        validation_status: 'NEEDS_MANUAL_REVIEW',
        filing_deadline: '2027-01-20'
      }
    ],
    batch_opportunity: null
  },
  {
    id: 'pat-005',
    organization_id: 'org-asc-001',
    facility_id: 'fac-asc-001',
    payer_id: 'pyr-humana',
    payer_name: 'Humana Medicare Advantage',
    plan_id: 'pln-humana-gold',
    plan_name: 'Humana Gold Plus HMO',
    contract_id: 'ctr-humana-ma-2026',
    contract_version_id: 'ver-humana-2026-1',
    pattern_code: 'PAT-HUMANA-45380-LINE',
    root_cause_code: 'LINE_LEVEL_CARC_EXCLUSION',
    cpt_hcpcs_code: '45380',
    procedure_name: 'Colonoscopy with biopsy',
    modifier_signature: 'NONE',
    rule_signature: 'RULE-HUMANA-CARC96-REV',
    first_detected_date: '2026-10-14',
    last_detected_date: '2026-11-01',
    claim_count: 2,
    validated_claim_count: 2,
    aggregate_variance: 1000.00,
    validated_recoverable_amount: 1000.00,
    confidence_level: 'LOW',
    status: 'OPEN',
    earliest_filing_deadline: '2026-11-22',
    notes: 'Repeated payment variance pattern detected: CARC 96 applied to secondary lesion biopsy. Currently below 3-claim volume and $2,500 threshold; remains OPEN for ongoing surveillance.',
    created_at: '2026-11-01T15:00:00Z',
    updated_at: '2026-11-07T09:00:00Z',
    claims: [
      {
        payment_variance_id: 'pv-005-a',
        claim_id: 'clm-9280',
        claim_number: 'CLM-2026-9280',
        patient_name: 'William Henderson',
        date_of_service: '2026-10-14',
        expected_allowed: 1650.00,
        actual_allowed: 1150.00,
        variance_amount: 500.00,
        validation_status: 'VALID_UNDERPAYMENT',
        filing_deadline: '2026-11-22'
      },
      {
        payment_variance_id: 'pv-005-b',
        claim_id: 'clm-9295',
        claim_number: 'CLM-2026-9295',
        patient_name: 'Donna Hughes',
        date_of_service: '2026-11-01',
        expected_allowed: 1650.00,
        actual_allowed: 1150.00,
        variance_amount: 500.00,
        validation_status: 'VALID_UNDERPAYMENT',
        filing_deadline: '2027-01-15'
      }
    ],
    batch_opportunity: null
  },
  {
    id: 'pat-006',
    organization_id: 'org-asc-001',
    facility_id: 'fac-asc-001',
    payer_id: 'pyr-wellcare',
    payer_name: 'WellCare Medicare Advantage',
    plan_id: 'pln-wellcare-val',
    plan_name: 'WellCare Value HMO',
    contract_id: 'ctr-wellcare-2025',
    contract_version_id: 'ver-wellcare-2025-a',
    pattern_code: 'PAT-WELLCARE-49505-EXP',
    root_cause_code: 'CONTRACT_VERSION_MISMATCH',
    cpt_hcpcs_code: '49505',
    procedure_name: 'Inguinal hernia repair',
    modifier_signature: 'NONE',
    rule_signature: 'RULE-WELLCARE-EXP-2025',
    first_detected_date: '2026-06-15',
    last_detected_date: '2026-07-15',
    claim_count: 3,
    validated_claim_count: 3,
    aggregate_variance: 2160.00,
    validated_recoverable_amount: 2160.00,
    confidence_level: 'HIGH',
    status: 'EXPIRED',
    earliest_filing_deadline: '2026-10-15',
    notes: 'Repeated payment variance pattern detected: Statutory 90-day appeal filing window lapsed on earliest claim (2026-10-15) prior to batch action. Pattern closed as EXPIRED.',
    created_at: '2026-07-20T10:00:00Z',
    updated_at: '2026-10-16T00:00:00Z',
    claims: [
      {
        payment_variance_id: 'pv-006-a',
        claim_id: 'clm-7840',
        claim_number: 'CLM-2026-7840',
        patient_name: 'Thomas White',
        date_of_service: '2026-06-15',
        expected_allowed: 3200.00,
        actual_allowed: 2480.00,
        variance_amount: 720.00,
        validation_status: 'VALID_UNDERPAYMENT',
        filing_deadline: '2026-10-15'
      },
      {
        payment_variance_id: 'pv-006-b',
        claim_id: 'clm-7865',
        claim_number: 'CLM-2026-7865',
        patient_name: 'Edward King',
        date_of_service: '2026-06-28',
        expected_allowed: 3200.00,
        actual_allowed: 2480.00,
        variance_amount: 720.00,
        validation_status: 'VALID_UNDERPAYMENT',
        filing_deadline: '2026-10-28'
      },
      {
        payment_variance_id: 'pv-006-c',
        claim_id: 'clm-7890',
        claim_number: 'CLM-2026-7890',
        patient_name: 'Brian Lee',
        date_of_service: '2026-07-15',
        expected_allowed: 3200.00,
        actual_allowed: 2480.00,
        variance_amount: 720.00,
        validation_status: 'VALID_UNDERPAYMENT',
        filing_deadline: '2026-11-12'
      }
    ],
    batch_opportunity: null
  }
];

// ==============================================================================
// 4. PAYER PATTERN STORE CLASS
// ==============================================================================

export class PayerPatternStore {
  constructor() {
    this.patterns = JSON.parse(JSON.stringify(INITIAL_PAYER_PATTERNS));
  }

  /**
   * Returns all detected recurring patterns
   */
  getAllPatterns() {
    return [...this.patterns];
  }

  /**
   * Returns a specific pattern by ID
   */
  getPatternById(id) {
    return this.patterns.find(p => p.id === id) || null;
  }

  /**
   * Returns aggregate portfolio metrics
   */
  getMetrics() {
    const totalPatterns = this.patterns.length;
    const activePatterns = this.patterns.filter(p => !['RESOLVED', 'DISMISSED', 'EXPIRED'].includes(p.status));
    
    const totalAffectedClaims = this.patterns.reduce((sum, p) => sum + (p.claim_count || 0), 0);
    const totalValidatedClaims = this.patterns.reduce((sum, p) => sum + (p.validated_claim_count || 0), 0);
    const totalVariance = this.patterns.reduce((sum, p) => sum + (p.aggregate_variance || 0), 0);
    const totalValidatedRecoverable = this.patterns.reduce((sum, p) => sum + (p.validated_recoverable_amount || 0), 0);

    const batchPipeline = this.patterns
      .filter(p => p.batch_opportunity && ['READY_FOR_SUPERVISOR', 'APPROVED', 'DISPATCHED_TO_PAYER'].includes(p.batch_opportunity.status))
      .reduce((sum, p) => sum + (p.batch_opportunity.validated_recovery || 0), 0);

    // Highest impact pattern
    let highestPattern = null;
    let maxVal = -1;
    this.patterns.forEach(p => {
      if (p.validated_recoverable_amount > maxVal) {
        maxVal = p.validated_recoverable_amount;
        highestPattern = p;
      }
    });

    return {
      totalPatterns,
      activePatterns: activePatterns.length,
      totalAffectedClaims,
      totalValidatedClaims,
      totalVariance: +totalVariance.toFixed(2),
      totalValidatedRecoverable: +totalValidatedRecoverable.toFixed(2),
      batchPipeline: +batchPipeline.toFixed(2),
      highestImpactPattern: highestPattern ? {
        pattern_code: highestPattern.pattern_code,
        payer_name: highestPattern.payer_name,
        amount: highestPattern.validated_recoverable_amount,
        claim_count: highestPattern.claim_count
      } : null
    };
  }

  /**
   * Detects patterns across a set of raw payment variances (API Requirement)
   */
  detect_underpayment_patterns(facilityId = 'fac-asc-001', rawVariances = []) {
    if (!rawVariances || rawVariances.length === 0) {
      return this.getAllPatterns();
    }

    const clusters = new Map();

    rawVariances.forEach(item => {
      const key = generateGroupingKey(item);
      if (!key) return;

      if (!clusters.has(key)) {
        clusters.set(key, []);
      }
      clusters.get(key).push(item);
    });

    const newPatterns = [];

    clusters.forEach((claimsInCluster, key) => {
      const sample = claimsInCluster[0];
      const check = qualifiesAsPattern(claimsInCluster);
      const earliestDeadline = calculateEarliestDeadline(claimsInCluster);
      const confidence = calculatePatternConfidence(claimsInCluster);

      const patternId = `pat-gen-${Date.now().toString(16)}-${Math.floor(Math.random() * 1000)}`;
      const rootCause = sample.root_cause_code || 'FEE_SCHEDULE_MISMATCH';

      const patternObj = {
        id: patternId,
        organization_id: sample.organization_id || 'org-asc-001',
        facility_id: facilityId,
        payer_id: sample.payer_id,
        payer_name: sample.payer_name || 'Commercial Payer',
        plan_id: sample.plan_id || null,
        plan_name: sample.plan_name || 'Commercial Network',
        contract_id: sample.contract_id || null,
        contract_version_id: sample.contract_version_id || null,
        pattern_code: `PAT-${(sample.payer_name || 'PAYER').slice(0, 4).toUpperCase()}-${sample.cpt_hcpcs_code || 'ALL'}-${rootCause.slice(0, 3)}`,
        root_cause_code: rootCause,
        cpt_hcpcs_code: sample.cpt_hcpcs_code || null,
        procedure_name: sample.procedure_name || 'Surgical Procedure Underpayment',
        modifier_signature: sample.modifiers && sample.modifiers.length > 0 ? sample.modifiers.sort().join(',') : 'NONE',
        rule_signature: sample.rule_signature || 'RULE-STANDARD-AUDIT',
        first_detected_date: claimsInCluster[0].date_of_service,
        last_detected_date: claimsInCluster[claimsInCluster.length - 1].date_of_service,
        claim_count: claimsInCluster.length,
        validated_claim_count: check.validatedCount,
        aggregate_variance: claimsInCluster.reduce((sum, c) => sum + (parseFloat(c.variance_amount) || 0), 0),
        validated_recoverable_amount: check.aggregateAmount,
        confidence_level: confidence,
        status: check.qualifies ? 'BATCH_RECOVERY_READY' : 'OPEN',
        earliest_filing_deadline: earliestDeadline,
        notes: `Repeated payment variance pattern detected across ${claimsInCluster.length} encounters for rule ${sample.rule_signature || rootCause}.`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        claims: claimsInCluster,
        batch_opportunity: null
      };

      this.patterns.unshift(patternObj);
      newPatterns.push(patternObj);
    });

    return newPatterns;
  }

  /**
   * Recalculates metrics for a pattern after claim addition, removal, or dismissal
   */
  rebuild_underpayment_pattern(patternId) {
    const pattern = this.getPatternById(patternId);
    if (!pattern) throw new Error(`Pattern ${patternId} not found.`);

    const claims = pattern.claims || [];
    const check = qualifiesAsPattern(claims);

    pattern.claim_count = claims.length;
    pattern.validated_claim_count = check.validatedCount;
    pattern.aggregate_variance = +claims.reduce((sum, c) => sum + (parseFloat(c.variance_amount) || 0), 0).toFixed(2);
    pattern.validated_recoverable_amount = check.aggregateAmount;
    pattern.confidence_level = calculatePatternConfidence(claims);
    pattern.earliest_filing_deadline = calculateEarliestDeadline(claims);
    pattern.updated_at = new Date().toISOString();

    if (claims.length === 0) {
      pattern.status = 'DISMISSED';
    } else if (check.qualifies && pattern.status === 'OPEN') {
      pattern.status = 'BATCH_RECOVERY_READY';
    }

    return pattern;
  }

  /**
   * Bundles a validated pattern into an authoritative batch recovery opportunity
   */
  create_batch_recovery_opportunity(patternId, options = {}) {
    const pattern = this.getPatternById(patternId);
    if (!pattern) throw new Error(`Pattern ${patternId} not found.`);

    if (pattern.validated_claim_count < 2) {
      throw new Error(`Cannot create batch opportunity. Pattern has only ${pattern.validated_claim_count} validated claims (minimum 2 required).`);
    }

    const priorityScore = calculatePriorityScore(
      pattern.validated_claim_count,
      pattern.validated_recoverable_amount,
      pattern.earliest_filing_deadline
    );

    const batchId = `bro-${Date.now()}`;
    const batchNumber = `BATCH-${new Date().getFullYear()}-${pattern.pattern_code.slice(4, 12)}-${Math.floor(10 + Math.random() * 90)}`;

    const opportunity = {
      id: batchId,
      batch_number: batchNumber,
      pattern_id: pattern.id,
      facility_id: pattern.facility_id,
      claim_count: pattern.validated_claim_count,
      potential_recovery: pattern.aggregate_variance,
      validated_recovery: pattern.validated_recoverable_amount,
      filing_deadline_earliest: pattern.earliest_filing_deadline,
      priority_score: priorityScore,
      owner_user_id: options.owner_user_id || 'usr-supervisor-1',
      status: 'READY_FOR_SUPERVISOR',
      notes: options.notes || `Systemic batch recovery opportunity created for ${pattern.payer_name}.`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    pattern.batch_opportunity = opportunity;
    pattern.status = 'BATCH_RECOVERY_READY';
    pattern.updated_at = new Date().toISOString();

    return opportunity;
  }

  /**
   * Returns itemized claim list for a pattern
   */
  list_pattern_claims(patternId) {
    const pattern = this.getPatternById(patternId);
    if (!pattern) throw new Error(`Pattern ${patternId} not found.`);
    return [...(pattern.claims || [])];
  }

  /**
   * Calculates comprehensive statistical financial impact
   */
  calculate_pattern_financial_impact(patternId) {
    const pattern = this.getPatternById(patternId);
    if (!pattern) throw new Error(`Pattern ${patternId} not found.`);

    const count = pattern.validated_claim_count || 1;
    const total = pattern.validated_recoverable_amount || 0;
    const avgShortPay = +(total / count).toFixed(2);

    // Approximate annual projection based on span
    const d1 = new Date(pattern.first_detected_date);
    const d2 = new Date(pattern.last_detected_date);
    const daysSpan = Math.max(30, Math.round((d2 - d1) / 86400000));
    const monthlyRate = (count / daysSpan) * 30;
    const projectedAnnualLoss = +(monthlyRate * 12 * avgShortPay).toFixed(2);

    return {
      patternId: pattern.id,
      patternCode: pattern.pattern_code,
      totalClaims: count,
      validatedRecoverable: total,
      averageShortPayPerCase: avgShortPay,
      daysSpan,
      monthlyFrequency: +monthlyRate.toFixed(1),
      projectedAnnualExposure: projectedAnnualLoss
    };
  }

  /**
   * Generates systemic batch dispute demand letter for payer contracting department
   */
  generateBatchDisputePackage(patternId) {
    const pattern = this.getPatternById(patternId);
    if (!pattern) throw new Error(`Pattern ${patternId} not found.`);

    const impact = this.calculate_pattern_financial_impact(patternId);

    return `
SYSTEMIC PAYMENT VARIANCE DEMAND & CONTRACT AUDIT NOTICE
---------------------------------------------------------
Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
To: Payer Contracting & Claims Administration — ${pattern.payer_name}
Plan Scope: ${pattern.plan_name}
Pattern Reference: ${pattern.pattern_code}
Earliest Reconsideration Deadline: ${pattern.earliest_filing_deadline || 'Urgent 30-Day Window'}

EXECUTIVE SUMMARY OF SYSTEMIC ADJUDICATION DISCREPANCY:
ASCANALYST automated contract intelligence has identified a statistically verified, repetitive payment variance pattern impacting surgical encounters at this facility.

Discrepancy Category: ${pattern.root_cause_code.replace(/_/g, ' ')}
Procedure Code: CPT ${pattern.cpt_hcpcs_code || 'Multiple'} (${pattern.procedure_name})
Contract Governing Rule: ${pattern.rule_signature}
Total Encounters Documented: ${pattern.claim_count} claims
Aggregate Contractual Short-Pay: $${pattern.validated_recoverable_amount.toFixed(2)}
Average Discrepancy per Encounter: $${impact.averageShortPayPerCase.toFixed(2)}
Projected Annualized Exposure: $${impact.projectedAnnualExposure.toFixed(2)}

DETAILED SCHEDULE OF CONSTITUENT CLAIMS:
${pattern.claims.map((c, i) => `[${i + 1}] Claim ${c.claim_number} | DOS: ${c.date_of_service} | Patient: ${c.patient_name} | Expected: $${c.expected_allowed.toFixed(2)} | Paid: $${c.actual_allowed.toFixed(2)} | Variance: $${c.variance_amount.toFixed(2)}`).join('\n')}

REQUESTED ADMINISTRATIVE ACTION:
In accordance with commercial contract terms and prompt-payment regulations:
1. Re-adjudicate the constituent claims listed above as a consolidated batch dispute.
2. Update claim adjudication logic to prevent ongoing recurring payment discrepancies.
3. Issue supplemental settlement in the aggregate amount of $${pattern.validated_recoverable_amount.toFixed(2)}.
`.trim();
  }
}

export const payerPatternService = new PayerPatternStore();
export default payerPatternService;

