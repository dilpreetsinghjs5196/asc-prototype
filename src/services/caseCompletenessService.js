/**
 * ==============================================================================
 * Service: caseCompletenessService.js
 * Module 16: Enterprise Data Quality Governance (Phase G1)
 * Description: Five-Pillar Operational & Clinical Case Completeness Scoring,
 *              Perioperative Timestamp Chronology Verification, Coding/UDI
 *              Readiness Gates, Granular Field-Gap Remediation, and SHA-256
 *              Audit Provenance.
 * ==============================================================================
 */

import crypto from 'crypto';

export const NAPLES_FACILITY_ID = '00000000-0000-0000-0000-000000000002';

export const CANONICAL_PILLARS = [
  'DEMOGRAPHICS_IDENTITY',
  'PERIOPERATIVE_TIMESTAMPS',
  'CARE_TEAM_STAFFING',
  'CLINICAL_CODING',
  'ATTESTATION_IMPLANT_UDI'
];

/**
 * Normalizes facility identifier whether passed as string, alias, or object
 */
export function normalizeFacilityId(facilityInput) {
  if (!facilityInput) return NAPLES_FACILITY_ID;
  if (typeof facilityInput === 'object') {
    const rawId = facilityInput.id || facilityInput.facility_id || facilityInput.facilityId || facilityInput.uuid;
    return normalizeFacilityId(rawId);
  }
  const str = String(facilityInput).trim();
  if (
    str === 'fac-naples-01' ||
    str === 'naples-surgery-center' ||
    str.toLowerCase().includes('naples')
  ) {
    return NAPLES_FACILITY_ID;
  }
  return str || NAPLES_FACILITY_ID;
}

/**
 * Generates an immutable 64-char SHA-256 seal for case completeness records & runs
 */
export function computeCaseCompletenessSeal(facilityId, identifier, score, blockersCount, status) {
  const normId = normalizeFacilityId(facilityId);
  const payload = `${normId}|${identifier}|${Number(score).toFixed(2)}|${Number(blockersCount)}|${status}`;
  const rawHash = crypto.createHash('sha256').update(payload).digest('hex');
  return `sha256_ccs_${rawHash.substring(0, 53)}`; // Exactly 64 chars (11 + 53)
}

/**
 * Masks sensitive credentials for UI and logging safety
 */
export function maskCaseCompletenessSecret(secret) {
  if (!secret) return 'ccs_sec_****_none';
  if (secret.length <= 8) return 'ccs_sec_****_mask';
  return `ccs_sec_****_${secret.slice(-4)}`;
}

/**
 * Validates that the 5 completeness rubric weights sum strictly to 100.00%
 */
export function validateCompletenessRubricWeights(rubrics = []) {
  if (!Array.isArray(rubrics) || rubrics.length === 0) {
    return { isValid: false, totalWeight: 0, errors: ['ERR_CCS_RUBRIC_EMPTY: Rubrics list cannot be empty.'] };
  }

  const errors = [];
  let totalWeight = 0;
  const seen = new Set();

  for (const r of rubrics) {
    const code = String(r.pillar_code || '').toUpperCase();
    const val = Number(r.weight_pct);
    if (!CANONICAL_PILLARS.includes(code)) {
      errors.push(`ERR_CCS_UNKNOWN_PILLAR: Invalid pillar '${code}'.`);
    }
    if (seen.has(code)) {
      errors.push(`ERR_CCS_DUPLICATE_PILLAR: Duplicate entry for '${code}'.`);
    }
    seen.add(code);

    if (isNaN(val) || val < 0 || val > 100) {
      errors.push(`ERR_CCS_INVALID_WEIGHT: Weight for '${code}' must be between 0 and 100.`);
    } else {
      totalWeight += val;
    }
  }

  for (const p of CANONICAL_PILLARS) {
    if (!seen.has(p)) {
      errors.push(`ERR_CCS_MISSING_PILLAR: Missing rubric pillar '${p}'.`);
    }
  }

  totalWeight = Number(totalWeight.toFixed(2));
  if (Math.abs(totalWeight - 100.0) > 0.01) {
    errors.push(`ERR_CCS_RUBRIC_SUM_INVALID: Rubric weights sum to ${totalWeight}%, must strictly equal 100.00%.`);
  }

  return {
    isValid: errors.length === 0,
    totalWeight,
    errors
  };
}

/**
 * Evaluates a single surgical encounter across all 5 operational & clinical pillars
 */
export function evaluateCaseCompleteness(
  caseRecord = {},
  rubrics = DEFAULT_RUBRICS,
  thresholds = { billingReady: 95.0, review: 80.0 }
) {
  const gaps = [];

  // Pillar 1: Demographics & Identity (patient_mrn, encounter_id, service_date, primary_payer_id)
  const demoFields = [
    { key: 'patient_mrn', severity: 'CRITICAL', req: 'Patient MRN must be present' },
    { key: 'case_identifier', severity: 'CRITICAL', req: 'Canonical encounter identifier required' },
    { key: 'service_date', severity: 'CRITICAL', req: 'Date of Service required' },
    { key: 'primary_payer_id', severity: 'WARNING', req: 'Primary insurance payer identifier required' }
  ];
  let demoPresent = 0;
  for (const f of demoFields) {
    if (caseRecord[f.key] !== undefined && caseRecord[f.key] !== null && String(caseRecord[f.key]).trim() !== '') {
      demoPresent++;
    } else {
      gaps.push({ pillar_code: 'DEMOGRAPHICS_IDENTITY', field_name: f.key, severity: f.severity, expected_requirement: f.req });
    }
  }
  const demographics_score = Number(((demoPresent / demoFields.length) * 100).toFixed(2));

  // Pillar 2: Perioperative Timestamps (presence + monotonic chronology)
  const tsOrder = ['preop_in', 'room_in', 'incision_start', 'procedure_close', 'room_out', 'pacu_in', 'discharge_out'];
  let tsPresent = 0;
  const parsedTimes = [];
  for (const tsKey of tsOrder) {
    const val = caseRecord[tsKey];
    if (val && !isNaN(new Date(val).getTime())) {
      tsPresent++;
      parsedTimes.push({ key: tsKey, ms: new Date(val).getTime() });
    } else {
      const sev = ['room_in', 'room_out', 'discharge_out'].includes(tsKey) ? 'CRITICAL' : 'WARNING';
      gaps.push({
        pillar_code: 'PERIOPERATIVE_TIMESTAMPS',
        field_name: tsKey,
        severity: sev,
        expected_requirement: `Valid timestamp required for ${tsKey}`
      });
    }
  }

  let chronologyValid = true;
  for (let i = 1; i < parsedTimes.length; i++) {
    if (parsedTimes[i].ms < parsedTimes[i - 1].ms) {
      chronologyValid = false;
      gaps.push({
        pillar_code: 'PERIOPERATIVE_TIMESTAMPS',
        field_name: `${parsedTimes[i - 1].key}->${parsedTimes[i].key}`,
        severity: 'CRITICAL',
        expected_requirement: `Monotonic chronology violated: ${parsedTimes[i - 1].key} must precede ${parsedTimes[i].key}`
      });
    }
  }
  let timestamps_score = Number(((tsPresent / tsOrder.length) * 100).toFixed(2));
  if (!chronologyValid) {
    timestamps_score = Math.min(timestamps_score, 50.00);
  }

  // Pillar 3: Care Team Staffing (surgeon_name, anesthesia_provider, circulating_rn, scrub_tech)
  const staffFields = [
    { key: 'surgeon_name', severity: 'CRITICAL', req: 'Attending surgeon required' },
    { key: 'anesthesia_provider', severity: 'WARNING', req: 'Anesthesia provider (CRNA/MD) assigned' },
    { key: 'circulating_rn', severity: 'WARNING', req: 'Circulating RN documented' },
    { key: 'scrub_tech', severity: 'WARNING', req: 'Scrub Tech assigned for case costing' }
  ];
  let staffPresent = 0;
  for (const f of staffFields) {
    if (caseRecord[f.key] && String(caseRecord[f.key]).trim() !== '') {
      staffPresent++;
    } else {
      gaps.push({ pillar_code: 'CARE_TEAM_STAFFING', field_name: f.key, severity: f.severity, expected_requirement: f.req });
    }
  }
  const staffing_score = Number(((staffPresent / staffFields.length) * 100).toFixed(2));

  // Pillar 4: Clinical Coding (primary_cpt, icd10_primary_dx, asa_class, laterality_modifier)
  const codingFields = [
    { key: 'primary_cpt', severity: 'CRITICAL', req: 'Validated primary CPT code required' },
    { key: 'icd10_primary_dx', severity: 'CRITICAL', req: 'Primary ICD-10 diagnosis required' },
    { key: 'asa_class', severity: 'WARNING', req: 'ASA physical classification documented' },
    { key: 'laterality_modifier', severity: 'WARNING', req: 'Anatomical laterality/modifier confirmed' }
  ];
  let codingPresent = 0;
  for (const f of codingFields) {
    if (caseRecord[f.key] && String(caseRecord[f.key]).trim() !== '') {
      codingPresent++;
    } else {
      gaps.push({ pillar_code: 'CLINICAL_CODING', field_name: f.key, severity: f.severity, expected_requirement: f.req });
    }
  }
  const coding_score = Number(((codingPresent / codingFields.length) * 100).toFixed(2));

  // Pillar 5: Attestation & Implant UDI
  const requiresImplantUdi = Boolean(caseRecord.has_implant);
  let attEarned = 0;
  const attTotal = requiresImplantUdi ? 2 : 1;

  if (caseRecord.surgeon_op_note_signed) {
    attEarned++;
  } else {
    gaps.push({
      pillar_code: 'ATTESTATION_IMPLANT_UDI',
      field_name: 'surgeon_op_note_signed',
      severity: 'CRITICAL',
      expected_requirement: 'Electronic surgeon attestation signature on operative report required'
    });
  }

  if (requiresImplantUdi) {
    if (caseRecord.implant_udi_logged) {
      attEarned++;
    } else {
      gaps.push({
        pillar_code: 'ATTESTATION_IMPLANT_UDI',
        field_name: 'implant_udi_logged',
        severity: 'CRITICAL',
        expected_requirement: 'FDA UDI lot/serial/expiration required for implant case'
      });
    }
  }
  const attestation_score = Number(((attEarned / attTotal) * 100).toFixed(2));

  // Weighted Composite Score
  const pillarMap = {
    DEMOGRAPHICS_IDENTITY: demographics_score,
    PERIOPERATIVE_TIMESTAMPS: timestamps_score,
    CARE_TEAM_STAFFING: staffing_score,
    CLINICAL_CODING: coding_score,
    ATTESTATION_IMPLANT_UDI: attestation_score
  };

  let weightedSum = 0;
  let totalWeight = 0;
  for (const r of rubrics) {
    const w = Number(r.weight_pct) || 0;
    weightedSum += (pillarMap[r.pillar_code] ?? 100) * (w / 100);
    totalWeight += w;
  }

  const overall_completeness_score = totalWeight > 0
    ? Number(((weightedSum / (totalWeight / 100))).toFixed(2))
    : 0;

  const critical_blockers_count = gaps.filter(g => g.severity === 'CRITICAL').length;
  const missing_fields_count = gaps.length;

  let readiness_status = 'BILLING_READY';
  if (critical_blockers_count > 0 || overall_completeness_score < thresholds.review) {
    readiness_status = 'INCOMPLETE_HOLD';
  } else if (overall_completeness_score < thresholds.billingReady) {
    readiness_status = 'CLINICAL_REVIEW';
  }

  return {
    demographics_score,
    timestamps_score,
    staffing_score,
    coding_score,
    attestation_score,
    overall_completeness_score,
    missing_fields_count,
    critical_blockers_count,
    readiness_status,
    gaps
  };
}

// ==========================================
// MOCK REPOSITORY & DEFAULT DATA
// ==========================================

const DEFAULT_CONFIG = {
  facility_id: NAPLES_FACILITY_ID,
  billing_ready_min_score: 95.00,
  review_min_score: 80.00,
  enforce_coding_lock: true,
  enforce_implant_udi: true,
  client_secret_encrypted: 'enc_v2_55d30e24fa958602139485029348502934850293485029348502934850293301',
  sync_status: 'ACTIVE',
  health_status: 'HEALTHY',
  updated_at: new Date().toISOString()
};

const DEFAULT_RUBRICS = [
  {
    id: 'rub-01',
    facility_id: NAPLES_FACILITY_ID,
    pillar_code: 'DEMOGRAPHICS_IDENTITY',
    pillar_label: 'Demographics & Identity',
    weight_pct: 15.00,
    mandatory_fields_count: 4,
    description: 'Patient MRN, encounter ID, date of service, and primary payer eligibility verified.'
  },
  {
    id: 'rub-02',
    facility_id: NAPLES_FACILITY_ID,
    pillar_code: 'PERIOPERATIVE_TIMESTAMPS',
    pillar_label: 'Perioperative Timestamps',
    weight_pct: 25.00,
    mandatory_fields_count: 7,
    description: 'Pre-Op, Wheels-In, Incision, Close, Wheels-Out, and PACU discharge chronological order.'
  },
  {
    id: 'rub-03',
    facility_id: NAPLES_FACILITY_ID,
    pillar_code: 'CARE_TEAM_STAFFING',
    pillar_label: 'Care Team Staffing',
    weight_pct: 20.00,
    mandatory_fields_count: 4,
    description: 'Primary Surgeon, Anesthesia Provider, Circulating RN, and Scrub Tech logged.'
  },
  {
    id: 'rub-04',
    facility_id: NAPLES_FACILITY_ID,
    pillar_code: 'CLINICAL_CODING',
    pillar_label: 'Clinical Coding',
    weight_pct: 25.00,
    mandatory_fields_count: 4,
    description: 'Primary CPT, ICD-10 diagnosis, ASA class, and anatomical laterality modifier.'
  },
  {
    id: 'rub-05',
    facility_id: NAPLES_FACILITY_ID,
    pillar_code: 'ATTESTATION_IMPLANT_UDI',
    pillar_label: 'Attestation & Implant UDI',
    weight_pct: 15.00,
    mandatory_fields_count: 2,
    description: 'Signed surgeon operative report and FDA UDI serial/lot/expiration verification.'
  }
];

const DEFAULT_SCORES = [
  {
    id: 'ccs-case-01',
    facility_id: NAPLES_FACILITY_ID,
    case_identifier: 'CAS-20260224-001',
    service_date: '2026-02-22',
    surgeon_name: 'Dr. Brian Miller',
    specialty_name: 'Orthopedics',
    primary_cpt: '29881',
    demographics_score: 100.00,
    timestamps_score: 100.00,
    staffing_score: 100.00,
    coding_score: 100.00,
    attestation_score: 100.00,
    overall_completeness_score: 100.00,
    missing_fields_count: 0,
    critical_blockers_count: 0,
    readiness_status: 'BILLING_READY',
    sha256_sync_seal: 'sha256_ccs_1a289fbc0123456789abcdef0123456789abcdef0123456789abc'
  },
  {
    id: 'ccs-case-02',
    facility_id: NAPLES_FACILITY_ID,
    case_identifier: 'CAS-20260224-002',
    service_date: '2026-02-22',
    surgeon_name: 'Dr. Michael Chang',
    specialty_name: 'Ophthalmology',
    primary_cpt: '66984',
    demographics_score: 100.00,
    timestamps_score: 100.00,
    staffing_score: 100.00,
    coding_score: 100.00,
    attestation_score: 100.00,
    overall_completeness_score: 100.00,
    missing_fields_count: 0,
    critical_blockers_count: 0,
    readiness_status: 'BILLING_READY',
    sha256_sync_seal: 'sha256_ccs_2b390acd1234567890abcdef1234567890abcdef1234567890abc'
  },
  {
    id: 'ccs-case-03',
    facility_id: NAPLES_FACILITY_ID,
    case_identifier: 'CAS-20260224-003',
    service_date: '2026-02-23',
    surgeon_name: 'Dr. Sarah Jenkins',
    specialty_name: 'General Surgery',
    primary_cpt: '47562',
    demographics_score: 100.00,
    timestamps_score: 60.00,
    staffing_score: 100.00,
    coding_score: 60.00,
    attestation_score: 50.00,
    overall_completeness_score: 72.50,
    missing_fields_count: 3,
    critical_blockers_count: 2,
    readiness_status: 'INCOMPLETE_HOLD',
    sha256_sync_seal: 'sha256_ccs_3c401bde2345678901abcdef2345678901abcdef2345678901abc'
  },
  {
    id: 'ccs-case-04',
    facility_id: NAPLES_FACILITY_ID,
    case_identifier: 'CAS-20260224-004',
    service_date: '2026-02-23',
    surgeon_name: 'Dr. Brian Miller',
    specialty_name: 'Orthopedics',
    primary_cpt: '64721',
    demographics_score: 100.00,
    timestamps_score: 100.00,
    staffing_score: 75.00,
    coding_score: 100.00,
    attestation_score: 100.00,
    overall_completeness_score: 95.00,
    missing_fields_count: 1,
    critical_blockers_count: 0,
    readiness_status: 'CLINICAL_REVIEW',
    sha256_sync_seal: 'sha256_ccs_4d512cef3456789012abcdef3456789012abcdef3456789012abc'
  }
];

const DEFAULT_GAPS = [
  {
    id: 'gap-01',
    facility_id: NAPLES_FACILITY_ID,
    case_score_id: 'ccs-case-03',
    case_identifier: 'CAS-20260224-003',
    pillar_code: 'PERIOPERATIVE_TIMESTAMPS',
    field_name: 'pacu_discharge_time',
    severity: 'CRITICAL',
    expected_requirement: 'Valid PACU discharge timestamp >= pacu_in required',
    remediation_status: 'OPEN',
    resolution_value: null,
    resolved_by: null
  },
  {
    id: 'gap-02',
    facility_id: NAPLES_FACILITY_ID,
    case_score_id: 'ccs-case-03',
    case_identifier: 'CAS-20260224-003',
    pillar_code: 'CLINICAL_CODING',
    field_name: 'icd10_primary_dx',
    severity: 'CRITICAL',
    expected_requirement: 'Validated ICD-10 diagnosis code required prior to 837 claim build',
    remediation_status: 'OPEN',
    resolution_value: null,
    resolved_by: null
  },
  {
    id: 'gap-03',
    facility_id: NAPLES_FACILITY_ID,
    case_score_id: 'ccs-case-03',
    case_identifier: 'CAS-20260224-003',
    pillar_code: 'ATTESTATION_IMPLANT_UDI',
    field_name: 'surgeon_op_note_signed',
    severity: 'WARNING',
    expected_requirement: 'Electronic surgeon attestation signature pending',
    remediation_status: 'OPEN',
    resolution_value: null,
    resolved_by: null
  },
  {
    id: 'gap-04',
    facility_id: NAPLES_FACILITY_ID,
    case_score_id: 'ccs-case-04',
    case_identifier: 'CAS-20260224-004',
    pillar_code: 'CARE_TEAM_STAFFING',
    field_name: 'scrub_tech_id',
    severity: 'WARNING',
    expected_requirement: 'Assigned Scrub Tech employee ID recommended for labor costing',
    remediation_status: 'OPEN',
    resolution_value: null,
    resolved_by: null
  }
];

const DEFAULT_BENCHMARKS = [
  {
    id: 'bench-01',
    facility_id: NAPLES_FACILITY_ID,
    specialty_name: 'Orthopedics',
    total_cases: 184,
    avg_completeness_score: 97.50,
    billing_ready_pct: 92.40,
    top_gap_field: 'scrub_tech_id'
  },
  {
    id: 'bench-02',
    facility_id: NAPLES_FACILITY_ID,
    specialty_name: 'Ophthalmology',
    total_cases: 312,
    avg_completeness_score: 99.10,
    billing_ready_pct: 97.80,
    top_gap_field: 'implant_udi_serial'
  },
  {
    id: 'bench-03',
    facility_id: NAPLES_FACILITY_ID,
    specialty_name: 'General Surgery',
    total_cases: 96,
    avg_completeness_score: 88.40,
    billing_ready_pct: 78.10,
    top_gap_field: 'pacu_discharge_time'
  },
  {
    id: 'bench-04',
    facility_id: NAPLES_FACILITY_ID,
    specialty_name: 'GI Endoscopy',
    total_cases: 250,
    avg_completeness_score: 96.80,
    billing_ready_pct: 94.00,
    top_gap_field: 'asa_physical_class'
  }
];

const DEFAULT_AUDIT_RUNS = [
  {
    id: 'ccs-run-01',
    facility_id: NAPLES_FACILITY_ID,
    run_code: 'CCS-AUD-20260224-01',
    cases_evaluated: 4,
    billing_ready_count: 2,
    incomplete_hold_count: 1,
    mean_completeness_score: 91.88,
    duration_ms: 265,
    sha256_sync_seal: 'sha256_ccs_9e623dfa4567890123abcdef4567890123abcdef4567890123abc',
    executed_at: new Date(Date.now() - 3600000).toISOString()
  }
];

// In-memory state
let currentConfig = { ...DEFAULT_CONFIG };
let currentRubrics = [...DEFAULT_RUBRICS];
let currentScores = [...DEFAULT_SCORES];
let currentGaps = [...DEFAULT_GAPS];
let currentBenchmarks = [...DEFAULT_BENCHMARKS];
let currentRuns = [...DEFAULT_AUDIT_RUNS];

export async function getCaseCompletenessConfig(facilityInput) {
  const normId = normalizeFacilityId(facilityInput);
  return {
    ...currentConfig,
    facility_id: normId,
    client_secret_masked: maskCaseCompletenessSecret(currentConfig.client_secret_encrypted)
  };
}

export async function updateCaseCompletenessConfig(facilityInput, updates) {
  const normId = normalizeFacilityId(facilityInput);
  currentConfig = {
    ...currentConfig,
    ...updates,
    facility_id: normId,
    updated_at: new Date().toISOString()
  };
  return {
    ...currentConfig,
    client_secret_masked: maskCaseCompletenessSecret(currentConfig.client_secret_encrypted)
  };
}

export async function getCaseCompletenessRubrics(facilityInput) {
  normalizeFacilityId(facilityInput);
  return [...currentRubrics];
}

export async function getCaseCompletenessScores(facilityInput) {
  normalizeFacilityId(facilityInput);
  return [...currentScores];
}

export async function getCaseCompletenessFieldGaps(caseIdentifier) {
  if (!caseIdentifier) return [...currentGaps];
  return currentGaps.filter(g => g.case_identifier === caseIdentifier);
}

export async function getCaseSpecialtyBenchmarks(facilityInput) {
  normalizeFacilityId(facilityInput);
  return [...currentBenchmarks];
}

export async function getCaseAuditRuns(facilityInput) {
  normalizeFacilityId(facilityInput);
  return [...currentRuns];
}

export async function getCaseCompletenessTelemetry(facilityInput) {
  const normId = normalizeFacilityId(facilityInput);
  const total = currentScores.length;
  const sumScores = currentScores.reduce((acc, s) => acc + Number(s.overall_completeness_score), 0);
  const avgScore = total > 0 ? Number((sumScores / total).toFixed(2)) : 0;

  const readyCount = currentScores.filter(s => s.readiness_status === 'BILLING_READY').length;
  const billingReadyPct = total > 0 ? Number(((readyCount / total) * 100).toFixed(1)) : 0;
  const holdCount = currentScores.filter(s => s.readiness_status === 'INCOMPLETE_HOLD').length;
  const openGapsCount = currentGaps.filter(g => g.remediation_status === 'OPEN').length;

  return {
    facility_id: normId,
    billing_ready_min_score: currentConfig.billing_ready_min_score,
    review_min_score: currentConfig.review_min_score,
    sync_status: currentConfig.sync_status,
    health_status: currentConfig.health_status,
    avg_case_completeness_score: avgScore,
    billing_ready_pct: billingReadyPct,
    cases_on_hold_count: holdCount,
    open_field_gaps_count: openGapsCount,
    total_cases_scored: total,
    latest_sync_seal: currentRuns[0]?.sha256_sync_seal || 'sha256_ccs_none'
  };
}

/**
 * Resolves a field gap and deterministically recalculates the parent case completeness score
 */
export async function resolveCaseFieldGap(gapId, operatorId = 'him_coding_lead@naplesasc.com', resolutionValue = 'VERIFIED') {
  const gap = currentGaps.find(g => g.id === gapId);
  if (!gap) {
    return { success: false, message: 'Field gap not found' };
  }

  gap.remediation_status = 'RESOLVED';
  gap.resolution_value = resolutionValue;
  gap.resolved_by = operatorId;
  gap.resolved_at = new Date().toISOString();

  // Recalculate parent case score & readiness
  const parentCase = currentScores.find(c => c.case_identifier === gap.case_identifier);
  if (parentCase) {
    const remainingOpen = currentGaps.filter(g => g.case_identifier === parentCase.case_identifier && g.remediation_status === 'OPEN');
    parentCase.missing_fields_count = remainingOpen.length;
    parentCase.critical_blockers_count = remainingOpen.filter(g => g.severity === 'CRITICAL').length;

    // Update affected pillar to 100 if no open gaps remain in that pillar
    const pillarRemaining = remainingOpen.filter(g => g.pillar_code === gap.pillar_code).length;
    if (pillarRemaining === 0) {
      if (gap.pillar_code === 'DEMOGRAPHICS_IDENTITY') parentCase.demographics_score = 100.00;
      if (gap.pillar_code === 'PERIOPERATIVE_TIMESTAMPS') parentCase.timestamps_score = 100.00;
      if (gap.pillar_code === 'CARE_TEAM_STAFFING') parentCase.staffing_score = 100.00;
      if (gap.pillar_code === 'CLINICAL_CODING') parentCase.coding_score = 100.00;
      if (gap.pillar_code === 'ATTESTATION_IMPLANT_UDI') parentCase.attestation_score = 100.00;
    }

    // Recompute weighted overall score
    const weighted =
      (parentCase.demographics_score * 0.15) +
      (parentCase.timestamps_score * 0.25) +
      (parentCase.staffing_score * 0.20) +
      (parentCase.coding_score * 0.25) +
      (parentCase.attestation_score * 0.15);

    parentCase.overall_completeness_score = Number(weighted.toFixed(2));

    if (parentCase.critical_blockers_count > 0 || parentCase.overall_completeness_score < currentConfig.review_min_score) {
      parentCase.readiness_status = 'INCOMPLETE_HOLD';
    } else if (parentCase.overall_completeness_score < currentConfig.billing_ready_min_score) {
      parentCase.readiness_status = 'CLINICAL_REVIEW';
    } else {
      parentCase.readiness_status = 'BILLING_READY';
    }

    parentCase.sha256_sync_seal = computeCaseCompletenessSeal(
      parentCase.facility_id,
      parentCase.case_identifier,
      parentCase.overall_completeness_score,
      parentCase.critical_blockers_count,
      parentCase.readiness_status
    );
  }

  return { success: true, gap, updatedCase: parentCase };
}

/**
 * Triggers a facility-wide case completeness audit batch with SHA-256 provenance seal
 */
export async function triggerCaseCompletenessAudit(facilityInput, operatorId = 'him_coding_lead@naplesasc.com') {
  const normId = normalizeFacilityId(facilityInput);
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const runCode = `CCS-AUD-${dateStr}-${String(currentRuns.length + 1).padStart(2, '0')}`;

  const readyCount = currentScores.filter(s => s.readiness_status === 'BILLING_READY').length;
  const holdCount = currentScores.filter(s => s.readiness_status === 'INCOMPLETE_HOLD').length;
  const meanScore = currentScores.length > 0
    ? Number((currentScores.reduce((acc, s) => acc + Number(s.overall_completeness_score), 0) / currentScores.length).toFixed(2))
    : 100.0;

  const seal = computeCaseCompletenessSeal(normId, runCode, meanScore, holdCount, 'COMPLETED');

  const newRun = {
    id: `ccs-run-${Date.now()}`,
    facility_id: normId,
    run_code: runCode,
    cases_evaluated: currentScores.length,
    billing_ready_count: readyCount,
    incomplete_hold_count: holdCount,
    mean_completeness_score: meanScore,
    duration_ms: 240,
    sha256_sync_seal: seal,
    operator_id: operatorId,
    executed_at: now.toISOString()
  };

  currentRuns.unshift(newRun);
  return newRun;
}

export default {
  NAPLES_FACILITY_ID,
  CANONICAL_PILLARS,
  normalizeFacilityId,
  computeCaseCompletenessSeal,
  maskCaseCompletenessSecret,
  validateCompletenessRubricWeights,
  evaluateCaseCompleteness,
  getCaseCompletenessConfig,
  updateCaseCompletenessConfig,
  getCaseCompletenessTelemetry,
  getCaseCompletenessRubrics,
  getCaseCompletenessScores,
  getCaseCompletenessFieldGaps,
  getCaseSpecialtyBenchmarks,
  getCaseAuditRuns,
  resolveCaseFieldGap,
  triggerCaseCompletenessAudit
};
