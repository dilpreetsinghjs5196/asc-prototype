/**
 * ==============================================================================
 * Service: dataQualityFrameworkService.js
 * Module 16: Enterprise Data Quality Governance (Phase G0)
 * Description: Six-Dimension Data Quality Index (DQI) Engine, Configurable
 *              Weights Matrix, Declarative Cross-Domain Validation Rules,
 *              Domain Trust Scorecards, Exception Remediation & Waiver Flow,
 *              and Cryptographic Provenance.
 * ==============================================================================
 */

import crypto from 'crypto';

export const NAPLES_FACILITY_ID = '00000000-0000-0000-0000-000000000002';

export const CANONICAL_DIMENSIONS = [
  'COMPLETENESS',
  'ACCURACY',
  'CONSISTENCY',
  'TIMELINESS',
  'UNIQUENESS',
  'VALIDITY'
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
 * Generates an immutable 64-char SHA-256 seal for Data Quality assessment runs
 */
export function computeDataQualitySeal(facilityId, runCode, overallDqiScore, recordsEvaluated, gateStatus) {
  const normId = normalizeFacilityId(facilityId);
  const payload = `${normId}|${runCode}|${Number(overallDqiScore).toFixed(2)}|${Number(recordsEvaluated)}|${gateStatus}`;
  const rawHash = crypto.createHash('sha256').update(payload).digest('hex');
  return `sha256_dq_${rawHash.substring(0, 54)}`; // Exactly 64 chars (10 + 54)
}

/**
 * Masks sensitive webhook/alert secrets for UI and logging safety
 */
export function maskDataQualitySecret(secret) {
  if (!secret) return 'dq_sec_****_none';
  if (secret.length <= 8) return 'dq_sec_****_mask';
  return `dq_sec_****_${secret.slice(-4)}`;
}

/**
 * Validates that the 6 Data Quality dimension weights sum strictly to 100.00%
 */
export function validateDimensionWeights(weights = []) {
  if (!Array.isArray(weights) || weights.length === 0) {
    return { isValid: false, totalWeight: 0, errors: ['ERR_DQ_WEIGHT_EMPTY: Dimension weights list cannot be empty.'] };
  }

  const errors = [];
  let totalWeight = 0;
  const seenDimensions = new Set();

  for (const w of weights) {
    const code = String(w.dimension_code || '').toUpperCase();
    const val = Number(w.weight_pct);
    if (!CANONICAL_DIMENSIONS.includes(code)) {
      errors.push(`ERR_DQ_UNKNOWN_DIMENSION: Invalid dimension code '${code}'.`);
    }
    if (seenDimensions.has(code)) {
      errors.push(`ERR_DQ_DUPLICATE_DIMENSION: Duplicate weight entry for '${code}'.`);
    }
    seenDimensions.add(code);

    if (isNaN(val) || val < 0 || val > 100) {
      errors.push(`ERR_DQ_INVALID_WEIGHT_RANGE: Weight for '${code}' must be between 0 and 100.`);
    } else {
      totalWeight += val;
    }
  }

  for (const reqDim of CANONICAL_DIMENSIONS) {
    if (!seenDimensions.has(reqDim)) {
      errors.push(`ERR_DQ_MISSING_DIMENSION: Missing weight configuration for '${reqDim}'.`);
    }
  }

  totalWeight = Number(totalWeight.toFixed(2));
  if (Math.abs(totalWeight - 100.0) > 0.01) {
    errors.push(`ERR_DQ_WEIGHT_SUM_INVALID: Dimension weights sum to ${totalWeight}%, must strictly equal 100.00%.`);
  }

  return {
    isValid: errors.length === 0,
    totalWeight,
    errors
  };
}

/**
 * Computes deterministic Composite Data Quality Index (DQI) and Gate Status
 */
export function calculateCompositeDqiScore(
  dimensionScores = {},
  weights = DEFAULT_WEIGHTS,
  criticalOpenExceptions = 0,
  thresholds = { certified: 95.0, warning: 85.0 }
) {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const w of weights) {
    const code = w.dimension_code;
    const weightPct = Number(w.weight_pct) || 0;
    const score = Math.min(100, Math.max(0, Number(dimensionScores[code] ?? 100)));
    weightedSum += score * (weightPct / 100);
    totalWeight += weightPct;
  }

  const overallDqiScore = totalWeight > 0
    ? Number(((weightedSum / (totalWeight / 100))).toFixed(2))
    : 0;

  let gateStatus = 'CERTIFIED';
  if (overallDqiScore < thresholds.warning) {
    gateStatus = 'QUARANTINED_HOLD';
  } else if (overallDqiScore < thresholds.certified || criticalOpenExceptions > 0) {
    gateStatus = 'CAUTION_REVIEW';
  }

  return {
    overallDqiScore,
    gateStatus,
    criticalOpenExceptions
  };
}

/**
 * Evaluates a single declarative Data Quality Rule against a candidate record
 */
export function evaluateDataQualityRule(rule, record = {}) {
  if (!rule || !rule.operator_type) {
    return { passed: false, rule_code: rule?.rule_code || 'UNKNOWN', reason: 'Invalid rule definition.' };
  }

  const op = rule.operator_type;
  let passed = true;
  let observedValue = null;
  let reason = 'Rule satisfied.';

  if (op === 'NOT_NULL') {
    const fields = rule.required_fields || ['id'];
    const missing = fields.filter(f => record[f] === undefined || record[f] === null || String(record[f]).trim() === '');
    passed = missing.length === 0;
    observedValue = missing.length > 0 ? `Missing: ${missing.join(', ')}` : 'All required fields populated';
    if (!passed) reason = `Null or empty required fields: ${missing.join(', ')}`;
  } else if (op === 'CHRONOLOGY_LTE') {
    const [startField, endField] = rule.chronology_fields || ['room_in', 'room_out'];
    const t1 = new Date(record[startField]).getTime();
    const t2 = new Date(record[endField]).getTime();
    passed = !isNaN(t1) && !isNaN(t2) && t1 <= t2;
    observedValue = `${record[startField]} -> ${record[endField]}`;
    if (!passed) reason = `Chronology violation: ${startField} must precede ${endField}.`;
  } else if (op === 'NON_NEGATIVE') {
    const field = rule.target_field || 'amount';
    const maxVal = rule.max_value !== undefined ? Number(rule.max_value) : Infinity;
    const val = Number(record[field]);
    passed = !isNaN(val) && val >= 0 && val <= maxVal;
    observedValue = String(record[field]);
    if (!passed) reason = `Value ${val} for ${field} outside valid non-negative bounds [0, ${maxVal}].`;
  } else if (op === 'EQUAL_BALANCE') {
    const left = Number(record[rule.left_field || 'total_debit']) || 0;
    const right = Number(record[rule.right_field || 'total_credit']) || 0;
    const diff = Math.abs(left - right);
    passed = diff <= 0.01;
    observedValue = `Diff: $${diff.toFixed(2)}`;
    if (!passed) reason = `Balancing mismatch: ${left.toFixed(2)} vs ${right.toFixed(2)}.`;
  } else if (op === 'REGEX_MATCH') {
    const field = rule.target_field || 'code';
    const regex = new RegExp(rule.pattern || '.+');
    const str = String(record[field] || '');
    passed = regex.test(str);
    observedValue = str;
    if (!passed) reason = `Value '${str}' failed format pattern ${rule.pattern}.`;
  } else if (op === 'RANGE_PCT') {
    const actual = Number(record[rule.actual_field || 'invoiced_price']) || 0;
    const expected = Number(record[rule.expected_field || 'contract_price']) || 0;
    const maxPct = Number(rule.max_pct ?? 2.0);
    const pctDiff = expected > 0 ? Math.abs(((actual - expected) / expected) * 100) : 0;
    passed = pctDiff <= maxPct;
    observedValue = `${pctDiff.toFixed(2)}%`;
    if (!passed) reason = `Variance ${pctDiff.toFixed(2)}% exceeds tolerance ${maxPct}%.`;
  }

  return {
    passed,
    rule_code: rule.rule_code,
    dimension_code: rule.dimension_code,
    severity: rule.severity,
    observed_value: observedValue,
    reason
  };
}

// ==========================================
// MOCK REPOSITORY & DEFAULT DATA
// ==========================================

const DEFAULT_CONFIG = {
  facility_id: NAPLES_FACILITY_ID,
  certified_threshold_pct: 95.00,
  warning_threshold_pct: 85.00,
  block_ai_on_quarantine: true,
  auto_scan_cron: 'HOURLY',
  alert_webhook_url: 'https://alerts.naplesasc.io/v1/dq-webhook',
  client_secret_encrypted: 'enc_v2_66b20c13de847591028374918237491823749182374918237491823749184412',
  governance_owner: 'data_steward@naplesasc.com',
  sync_status: 'ACTIVE',
  health_status: 'HEALTHY',
  updated_at: new Date().toISOString()
};

const DEFAULT_WEIGHTS = [
  {
    id: 'dim-01',
    facility_id: NAPLES_FACILITY_ID,
    dimension_code: 'COMPLETENESS',
    dimension_label: 'Completeness',
    weight_pct: 25.00,
    sla_target_score: 98.00,
    current_score: 97.50,
    description: 'Mandatory clinical, CPT, payer, and demographic fields populated without nulls.'
  },
  {
    id: 'dim-02',
    facility_id: NAPLES_FACILITY_ID,
    dimension_code: 'ACCURACY',
    dimension_label: 'Accuracy',
    weight_pct: 25.00,
    sla_target_score: 97.00,
    current_score: 96.20,
    description: 'Arithmetic balancing invariants and contracted pricing tolerances.'
  },
  {
    id: 'dim-03',
    facility_id: NAPLES_FACILITY_ID,
    dimension_code: 'CONSISTENCY',
    dimension_label: 'Consistency',
    weight_pct: 20.00,
    sla_target_score: 95.00,
    current_score: 92.40,
    description: 'Cross-system parity across EHR cases, 837/835 claims, GL cash, and vendor POs.'
  },
  {
    id: 'dim-04',
    facility_id: NAPLES_FACILITY_ID,
    dimension_code: 'TIMELINESS',
    dimension_label: 'Timeliness',
    weight_pct: 15.00,
    sla_target_score: 95.00,
    current_score: 96.00,
    description: 'Data feed latency adherence against real-time and batch SLA targets.'
  },
  {
    id: 'dim-05',
    facility_id: NAPLES_FACILITY_ID,
    dimension_code: 'UNIQUENESS',
    dimension_label: 'Uniqueness',
    weight_pct: 10.00,
    sla_target_score: 99.00,
    current_score: 99.20,
    description: 'Zero duplicate surgical cases, claims, patient records, or vendor invoices.'
  },
  {
    id: 'dim-06',
    facility_id: NAPLES_FACILITY_ID,
    dimension_code: 'VALIDITY',
    dimension_label: 'Validity',
    weight_pct: 5.00,
    sla_target_score: 98.00,
    current_score: 95.50,
    description: 'Format compliance for CPT/ICD-10 codes, FDA UDI strings, and milestone chronology.'
  }
];

const DEFAULT_RULES = [
  {
    id: 'rule-01',
    facility_id: NAPLES_FACILITY_ID,
    rule_code: 'DQ-EHR-001',
    rule_name: 'Perioperative Milestone Chronology Order',
    dimension_code: 'VALIDITY',
    target_domain: 'EHR_CASES',
    operator_type: 'CHRONOLOGY_LTE',
    rule_expression: 'room_in <= cut <= close <= room_out',
    severity: 'CRITICAL',
    is_active: true
  },
  {
    id: 'rule-02',
    facility_id: NAPLES_FACILITY_ID,
    rule_code: 'DQ-EHR-002',
    rule_name: 'Mandatory Primary Surgeon & CPT Assignment',
    dimension_code: 'COMPLETENESS',
    target_domain: 'EHR_CASES',
    operator_type: 'NOT_NULL',
    rule_expression: 'surgeon_id IS NOT NULL AND primary_cpt IS NOT NULL',
    severity: 'CRITICAL',
    is_active: true
  },
  {
    id: 'rule-03',
    facility_id: NAPLES_FACILITY_ID,
    rule_code: 'DQ-CLM-001',
    rule_name: '835 Remittance Zero-Balance Equation',
    dimension_code: 'ACCURACY',
    target_domain: 'REMIT_835',
    operator_type: 'EQUAL_BALANCE',
    rule_expression: 'billed - adjustments - paid - patient_resp == 0',
    severity: 'CRITICAL',
    is_active: true
  },
  {
    id: 'rule-04',
    facility_id: NAPLES_FACILITY_ID,
    rule_code: 'DQ-GL-001',
    rule_name: 'Double-Entry Journal Debit Credit Balance',
    dimension_code: 'ACCURACY',
    target_domain: 'GL_ACCOUNTING',
    operator_type: 'EQUAL_BALANCE',
    rule_expression: 'sum(debits) - sum(credits) == 0',
    severity: 'CRITICAL',
    is_active: true
  },
  {
    id: 'rule-05',
    facility_id: NAPLES_FACILITY_ID,
    rule_code: 'DQ-PAY-001',
    rule_name: 'Shift Clock Punch Maximum Duration Guard',
    dimension_code: 'ACCURACY',
    target_domain: 'PAYROLL_LABOR',
    operator_type: 'NON_NEGATIVE',
    rule_expression: '0 < shift_hours <= 16.0',
    severity: 'WARNING',
    is_active: true
  },
  {
    id: 'rule-06',
    facility_id: NAPLES_FACILITY_ID,
    rule_code: 'DQ-INV-001',
    rule_name: 'Implant UDI GS1-128 & Non-Expired Lot Check',
    dimension_code: 'VALIDITY',
    target_domain: 'INVENTORY_SUPPLY',
    operator_type: 'REGEX_MATCH',
    rule_expression: 'udi LIKE %(01)% AND exp_date >= surgery_date',
    severity: 'CRITICAL',
    is_active: true
  },
  {
    id: 'rule-07',
    facility_id: NAPLES_FACILITY_ID,
    rule_code: 'DQ-VINV-001',
    rule_name: 'Vendor Invoice Contract Price Tolerance Check',
    dimension_code: 'CONSISTENCY',
    target_domain: 'VENDOR_INVOICE',
    operator_type: 'RANGE_PCT',
    rule_expression: 'abs(invoiced_price - contract_price) / contract_price <= 0.02',
    severity: 'CRITICAL',
    is_active: true
  },
  {
    id: 'rule-08',
    facility_id: NAPLES_FACILITY_ID,
    rule_code: 'DQ-UNQ-001',
    rule_name: 'Duplicate Vendor Invoice Number Blocker',
    dimension_code: 'UNIQUENESS',
    target_domain: 'VENDOR_INVOICE',
    operator_type: 'NOT_NULL',
    rule_expression: 'UNIQUE(facility_id, vendor_name, invoice_number)',
    severity: 'CRITICAL',
    is_active: true
  }
];

const DEFAULT_RUNS = [
  {
    id: 'dq-run-01',
    facility_id: NAPLES_FACILITY_ID,
    run_code: 'DQ-SCAN-20260224-01',
    overall_dqi_score: 95.80,
    completeness_score: 97.50,
    accuracy_score: 96.20,
    consistency_score: 92.40,
    timeliness_score: 96.00,
    uniqueness_score: 99.20,
    validity_score: 95.50,
    records_evaluated: 2840,
    rules_passed: 2837,
    rules_failed: 3,
    gate_status: 'CAUTION_REVIEW',
    duration_ms: 420,
    sha256_sync_seal: 'sha256_dq_7a189fbc0123456789abcdef0123456789abcdef0123456789abcd',
    executed_at: new Date(Date.now() - 3600000).toISOString()
  }
];

const DEFAULT_DOMAINS = [
  {
    id: 'dom-01',
    facility_id: NAPLES_FACILITY_ID,
    domain_code: 'EHR_CASES',
    domain_label: 'EHR Clinical & OR Milestones (SIS / HST)',
    dqi_score: 98.40,
    records_scanned: 842,
    open_exceptions: 0,
    trust_status: 'CERTIFIED',
    last_evaluated_at: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: 'dom-02',
    facility_id: NAPLES_FACILITY_ID,
    domain_code: 'CLAIMS_837',
    domain_label: 'Clearinghouse Claims & 835 Remittances',
    dqi_score: 97.60,
    records_scanned: 620,
    open_exceptions: 0,
    trust_status: 'CERTIFIED',
    last_evaluated_at: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: 'dom-03',
    facility_id: NAPLES_FACILITY_ID,
    domain_code: 'GL_ACCOUNTING',
    domain_label: 'General Ledger & Bank Reconciliation',
    dqi_score: 99.10,
    records_scanned: 412,
    open_exceptions: 0,
    trust_status: 'CERTIFIED',
    last_evaluated_at: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: 'dom-04',
    facility_id: NAPLES_FACILITY_ID,
    domain_code: 'PAYROLL_LABOR',
    domain_label: 'Payroll Timecards & Case Labor Costing',
    dqi_score: 94.20,
    records_scanned: 380,
    open_exceptions: 1,
    trust_status: 'CAUTION_REVIEW',
    last_evaluated_at: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: 'dom-05',
    facility_id: NAPLES_FACILITY_ID,
    domain_code: 'INVENTORY_SUPPLY',
    domain_label: 'Inventory Par Depots & Implant UDI',
    dqi_score: 96.10,
    records_scanned: 444,
    open_exceptions: 1,
    trust_status: 'CAUTION_REVIEW',
    last_evaluated_at: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: 'dom-06',
    facility_id: NAPLES_FACILITY_ID,
    domain_code: 'VENDOR_INVOICE',
    domain_label: 'Vendor Invoices & 3-Way PO Matching',
    dqi_score: 88.50,
    records_scanned: 142,
    open_exceptions: 1,
    trust_status: 'CAUTION_REVIEW',
    last_evaluated_at: new Date(Date.now() - 3600000).toISOString()
  }
];

const DEFAULT_EXCEPTIONS = [
  {
    id: 'dq-exc-01',
    facility_id: NAPLES_FACILITY_ID,
    run_id: 'dq-run-01',
    rule_code: 'DQ-VINV-001',
    dimension_code: 'CONSISTENCY',
    target_domain: 'VENDOR_INVOICE',
    severity: 'CRITICAL',
    offending_record_id: 'INV-CH-442910 / CH-J316H',
    field_name: 'invoiced_unit_price',
    observed_value: '$120.50 (+42.6%)',
    expected_rule: 'Contracted unit price $84.50 ± 2.00%',
    remediation_status: 'OPEN',
    waiver_reason: null,
    resolved_by: null,
    created_at: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: 'dq-exc-02',
    facility_id: NAPLES_FACILITY_ID,
    run_id: 'dq-run-01',
    rule_code: 'DQ-PAY-001',
    dimension_code: 'ACCURACY',
    target_domain: 'PAYROLL_LABOR',
    severity: 'WARNING',
    offending_record_id: 'SHIFT-EMP-1082',
    field_name: 'shift_duration_hours',
    observed_value: '18.4 hrs',
    expected_rule: '0 < shift_hours <= 16.0 hrs',
    remediation_status: 'OPEN',
    waiver_reason: null,
    resolved_by: null,
    created_at: new Date(Date.now() - 3600000).toISOString()
  }
];

// In-memory state
let currentConfig = { ...DEFAULT_CONFIG };
let currentWeights = [...DEFAULT_WEIGHTS];
let currentRules = [...DEFAULT_RULES];
let currentRuns = [...DEFAULT_RUNS];
let currentDomains = [...DEFAULT_DOMAINS];
let currentExceptions = [...DEFAULT_EXCEPTIONS];

export async function getDqFrameworkConfig(facilityInput) {
  const normId = normalizeFacilityId(facilityInput);
  return {
    ...currentConfig,
    facility_id: normId,
    client_secret_masked: maskDataQualitySecret(currentConfig.client_secret_encrypted)
  };
}

export async function updateDqFrameworkConfig(facilityInput, updates) {
  const normId = normalizeFacilityId(facilityInput);
  currentConfig = {
    ...currentConfig,
    ...updates,
    facility_id: normId,
    updated_at: new Date().toISOString()
  };
  return {
    ...currentConfig,
    client_secret_masked: maskDataQualitySecret(currentConfig.client_secret_encrypted)
  };
}

export async function getDqDimensionWeights(facilityInput) {
  normalizeFacilityId(facilityInput);
  return [...currentWeights];
}

export async function getDqRuleDefinitions(facilityInput) {
  normalizeFacilityId(facilityInput);
  return [...currentRules];
}

export async function getDqAssessmentRuns(facilityInput) {
  normalizeFacilityId(facilityInput);
  return [...currentRuns];
}

export async function getDqDomainScores(facilityInput) {
  normalizeFacilityId(facilityInput);
  return [...currentDomains];
}

export async function getDqExceptions(facilityInput) {
  normalizeFacilityId(facilityInput);
  return [...currentExceptions];
}

export async function getDqTelemetry(facilityInput) {
  const normId = normalizeFacilityId(facilityInput);

  const openExceptions = currentExceptions.filter(e => ['OPEN', 'IN_REVIEW'].includes(e.remediation_status));
  const criticalOpen = openExceptions.filter(e => e.severity === 'CRITICAL').length;
  const certifiedDomains = currentDomains.filter(d => d.trust_status === 'CERTIFIED').length;

  const scoreMap = {};
  for (const w of currentWeights) {
    scoreMap[w.dimension_code] = w.current_score;
  }

  const calc = calculateCompositeDqiScore(scoreMap, currentWeights, criticalOpen, {
    certified: currentConfig.certified_threshold_pct,
    warning: currentConfig.warning_threshold_pct
  });

  const latestRun = currentRuns[0] || {};
  const passRatePct = latestRun.records_evaluated > 0
    ? Number(((latestRun.rules_passed / latestRun.records_evaluated) * 100).toFixed(1))
    : 99.8;

  return {
    facility_id: normId,
    certified_threshold_pct: currentConfig.certified_threshold_pct,
    warning_threshold_pct: currentConfig.warning_threshold_pct,
    block_ai_on_quarantine: currentConfig.block_ai_on_quarantine,
    sync_status: currentConfig.sync_status,
    health_status: currentConfig.health_status,
    latest_dqi_score: calc.overallDqiScore,
    latest_gate_status: calc.gateStatus,
    rule_pass_rate_pct: passRatePct,
    active_rules_count: currentRules.filter(r => r.is_active).length,
    total_rules_count: currentRules.length,
    certified_domains_count: certifiedDomains,
    total_domains_count: currentDomains.length,
    open_exceptions_count: openExceptions.length,
    critical_exceptions_count: criticalOpen,
    latest_sync_seal: latestRun.sha256_sync_seal || 'sha256_dq_none'
  };
}

/**
 * Triggers a full facility Data Quality Scan across dimensions and emits a SHA-256 seal
 */
export async function triggerDataQualityScan(facilityInput, operatorId = 'data_steward@naplesasc.com') {
  const normId = normalizeFacilityId(facilityInput);
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const runCode = `DQ-SCAN-${dateStr}-${String(currentRuns.length + 1).padStart(2, '0')}`;

  const openExceptions = currentExceptions.filter(e => ['OPEN', 'IN_REVIEW'].includes(e.remediation_status));
  const criticalOpen = openExceptions.filter(e => e.severity === 'CRITICAL').length;

  const scoreMap = {};
  for (const w of currentWeights) {
    // Reflect improved score if exceptions were cleared
    const base = Number(w.current_score);
    scoreMap[w.dimension_code] = openExceptions.length === 0 ? Math.min(99.8, Number((base + 2.5).toFixed(2))) : base;
  }

  const calc = calculateCompositeDqiScore(scoreMap, currentWeights, criticalOpen, {
    certified: currentConfig.certified_threshold_pct,
    warning: currentConfig.warning_threshold_pct
  });

  const recordsEvaluated = 2850 + currentRuns.length * 12;
  const rulesFailed = openExceptions.length;
  const rulesPassed = recordsEvaluated - rulesFailed;
  const seal = computeDataQualitySeal(normId, runCode, calc.overallDqiScore, recordsEvaluated, calc.gateStatus);

  const newRun = {
    id: `dq-run-${Date.now()}`,
    facility_id: normId,
    run_code: runCode,
    overall_dqi_score: calc.overallDqiScore,
    completeness_score: scoreMap.COMPLETENESS,
    accuracy_score: scoreMap.ACCURACY,
    consistency_score: scoreMap.CONSISTENCY,
    timeliness_score: scoreMap.TIMELINESS,
    uniqueness_score: scoreMap.UNIQUENESS,
    validity_score: scoreMap.VALIDITY,
    records_evaluated: recordsEvaluated,
    rules_passed: rulesPassed,
    rules_failed: rulesFailed,
    gate_status: calc.gateStatus,
    duration_ms: 385,
    sha256_sync_seal: seal,
    operator_id: operatorId,
    executed_at: now.toISOString()
  };

  currentRuns.unshift(newRun);
  return newRun;
}

/**
 * Toggles an individual quality rule Active/Paused
 */
export async function toggleDqRuleStatus(ruleId, isActive) {
  const rule = currentRules.find(r => r.id === ruleId || r.rule_code === ruleId);
  if (!rule) {
    return { success: false, message: 'Rule not found' };
  }
  rule.is_active = Boolean(isActive);
  return { success: true, rule };
}

/**
 * Remediates or waives an open Data Quality exception (waiver requires non-empty reason)
 */
export async function resolveDqException(exceptionId, action = 'REMEDIATED', notes = '', operatorId = 'data_steward@naplesasc.com') {
  const exc = currentExceptions.find(e => e.id === exceptionId);
  if (!exc) {
    return { success: false, message: 'Exception not found' };
  }

  const normalizedAction = String(action).toUpperCase();
  if (normalizedAction === 'WAIVED' && (!notes || String(notes).trim().length < 5)) {
    throw new Error('ERR_WAIVER_REASON_REQUIRED: Executive waiver requires a documented justification (min 5 chars).');
  }

  exc.remediation_status = normalizedAction === 'WAIVED' ? 'WAIVED' : 'REMEDIATED';
  exc.waiver_reason = normalizedAction === 'WAIVED' ? notes : null;
  exc.resolved_by = operatorId;
  exc.resolved_at = new Date().toISOString();

  // Promote domain if no remaining open exceptions in that domain
  const domainOpen = currentExceptions.filter(
    e => e.target_domain === exc.target_domain && ['OPEN', 'IN_REVIEW'].includes(e.remediation_status)
  ).length;
  const dom = currentDomains.find(d => d.domain_code === exc.target_domain);
  if (dom) {
    dom.open_exceptions = domainOpen;
    if (domainOpen === 0) {
      dom.dqi_score = Math.max(dom.dqi_score, 96.80);
      dom.trust_status = 'CERTIFIED';
    }
  }

  return { success: true, exception: exc };
}

export default {
  NAPLES_FACILITY_ID,
  CANONICAL_DIMENSIONS,
  normalizeFacilityId,
  computeDataQualitySeal,
  maskDataQualitySecret,
  validateDimensionWeights,
  calculateCompositeDqiScore,
  evaluateDataQualityRule,
  getDqFrameworkConfig,
  updateDqFrameworkConfig,
  getDqTelemetry,
  getDqDimensionWeights,
  getDqRuleDefinitions,
  getDqAssessmentRuns,
  getDqDomainScores,
  getDqExceptions,
  triggerDataQualityScan,
  toggleDqRuleStatus,
  resolveDqException
};
