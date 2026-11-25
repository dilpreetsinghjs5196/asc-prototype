/**
 * ==============================================================================
 * Phase F1: Import Validation Pipeline Service
 * Module 15: Enterprise Healthcare Integrations
 * Description: Deterministic 6-Stage Healthcare Ingestion Lifecycle:
 *              Import > Validate > Normalize > Match > Exception > Commit.
 *              Multi-tenancy RLS, Validation Rules Registry, Exception Workqueue,
 *              and Cryptographic Commit Provenance.
 * Maestro Clinical Design System: Emerald, Sky, Amber, Crimson, Slate, Neutral
 * Zero Prohibited Accent Tokens
 * ==============================================================================
 */

let nodeCrypto = null;
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  try {
    nodeCrypto = await import('node:crypto');
  } catch {
    // browser environment fallback
  }
}

const NAPLES_FACILITY_ALIASES = ['fac-naples-01', '00000000-0000-0000-0000-000000000002'];

export function matchesFacilityId(recordFacilityId, requestedFacilityId) {
  if (!requestedFacilityId || requestedFacilityId === 'ALL') return true;
  const targetId = typeof requestedFacilityId === 'object' && requestedFacilityId !== null
    ? (requestedFacilityId.id || requestedFacilityId.facilityId || requestedFacilityId.facilityUuid || '')
    : String(requestedFacilityId);

  if (!targetId || targetId === 'ALL') return true;
  if (String(recordFacilityId).toLowerCase() === String(targetId).toLowerCase()) return true;
  if (
    NAPLES_FACILITY_ALIASES.includes(String(recordFacilityId).toLowerCase()) &&
    NAPLES_FACILITY_ALIASES.includes(String(targetId).toLowerCase())
  ) {
    return true;
  }
  return false;
}

/**
 * Deterministic cryptographic audit hash for pipeline commitments
 */
export function computeImportAuditSeal(payload) {
  const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
  if (nodeCrypto && typeof nodeCrypto.createHash === 'function') {
    return nodeCrypto.createHash('sha256').update(str).digest('hex');
  }
  let h1 = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h1 = Math.imul(h1 ^ str.charCodeAt(i), 0x01000193);
  }
  return `pipe_seal_${(h1 >>> 0).toString(16)}`.padEnd(64, '0');
}

export const PIPELINE_STAGES = {
  IMPORT: 'IMPORT',
  VALIDATE: 'VALIDATE',
  NORMALIZE: 'NORMALIZE',
  MATCH: 'MATCH',
  EXCEPTION: 'EXCEPTION',
  COMMIT: 'COMMIT'
};

export const RECORD_TYPES = {
  SURGICAL_CASE: 'SURGICAL_CASE',
  CLAIM_837: 'CLAIM_837',
  REMITTANCE_835: 'REMITTANCE_835',
  IMPLANT_PURCHASE: 'IMPLANT_PURCHASE'
};

export const MATCH_STATUSES = {
  EXACT_MATCH: 'EXACT_MATCH',
  COMPOSITE_MATCH: 'COMPOSITE_MATCH',
  NEW_RECORD: 'NEW_RECORD',
  DUPLICATE_SUSPECT: 'DUPLICATE_SUSPECT',
  CONFLICT: 'CONFLICT'
};

export const EXCEPTION_SEVERITIES = {
  CRITICAL: 'CRITICAL',
  WARNING: 'WARNING',
  INFO: 'INFO'
};

export const EXCEPTION_CATEGORIES = {
  SCHEMA_ERROR: 'SCHEMA_ERROR',
  UNRECOGNIZED_CODE: 'UNRECOGNIZED_CODE',
  UNMATCHED_SURGEON: 'UNMATCHED_SURGEON',
  UNMAPPED_PAYER: 'UNMAPPED_PAYER',
  DUPLICATE_SUSPECT: 'DUPLICATE_SUSPECT',
  FINANCIAL_IMBALANCE: 'FINANCIAL_IMBALANCE'
};

export const EXCEPTION_STATUSES = {
  PENDING: 'PENDING',
  RESOLVED: 'RESOLVED',
  REJECTED: 'REJECTED',
  IGNORED: 'IGNORED'
};

export const RESOLUTION_ACTIONS = {
  OVERRIDE_AND_COMMIT: 'OVERRIDE_AND_COMMIT',
  REMAP_FIELD: 'REMAP_FIELD',
  REJECT_RECORD: 'REJECT_RECORD',
  MERGE_RECORD: 'MERGE_RECORD'
};

/**
 * Standard CMS NPI Luhn Validation algorithm
 */
export function validateNpiLuhn(npi) {
  if (!npi || typeof npi !== 'string' && typeof npi !== 'number') return false;
  const str = String(npi).trim();
  if (!/^\d{10}$/.test(str)) return false;

  // Prefix 80840 per CMS NPI Luhn standard for US healthcare provider identifiers
  const full = '80840' + str;
  let sum = 0;
  let alternate = false;
  for (let i = full.length - 1; i >= 0; i--) {
    let digit = parseInt(full.charAt(i), 10);
    if (alternate) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

/**
 * Payer Canonicalization Dictionary
 */
export const CANONICAL_PAYER_MAP = {
  'FLORIDA BLUE': 'PAYER_BCBS_FL',
  'FL BLUE': 'PAYER_BCBS_FL',
  'BLUE CROSS BLUE SHIELD OF FLORIDA': 'PAYER_BCBS_FL',
  'BCBS OF FL': 'PAYER_BCBS_FL',
  'UNITED HEALTHCARE': 'PAYER_UHC',
  'UHC': 'PAYER_UHC',
  'UNITED HEALTH': 'PAYER_UHC',
  'AETNA HEALTH': 'PAYER_AETNA',
  'AETNA INC': 'PAYER_AETNA',
  'CIGNA HEALTHCARE': 'PAYER_CIGNA',
  'CIGNA': 'PAYER_CIGNA',
  'MEDICARE PART B': 'PAYER_MEDICARE_FL',
  'CMS MEDICARE': 'PAYER_MEDICARE_FL'
};

export function normalizePayerName(rawPayer) {
  if (!rawPayer) return 'PAYER_UNMAPPED';
  const clean = String(rawPayer).trim().toUpperCase();
  return CANONICAL_PAYER_MAP[clean] || 'PAYER_UNMAPPED';
}

export const INITIAL_VALIDATION_RULES = [
  {
    id: 'rule_001',
    ruleCode: 'VAL_NPI_001',
    ruleName: 'Surgeon NPI Luhn Checksum',
    category: 'SYNTACTIC',
    severity: EXCEPTION_SEVERITIES.CRITICAL,
    targetRecordType: RECORD_TYPES.SURGICAL_CASE,
    targetField: 'surgeon_npi',
    validationLogic: 'REGEX_10_DIGIT_LUHN',
    failureMessage: 'NPI must be exactly 10 digits and satisfy CMS Luhn check'
  },
  {
    id: 'rule_002',
    ruleCode: 'VAL_DOS_002',
    ruleName: 'Date of Service Boundary',
    category: 'SEMANTIC',
    severity: EXCEPTION_SEVERITIES.CRITICAL,
    targetRecordType: RECORD_TYPES.SURGICAL_CASE,
    targetField: 'surgery_date',
    validationLogic: 'DATE_BETWEEN_2020_AND_NOW_PLUS_30D',
    failureMessage: 'DOS cannot be prior to 2020 or >30 days in the future'
  },
  {
    id: 'rule_003',
    ruleCode: 'VAL_CPT_003',
    ruleName: 'CPT / HCPCS Code Format',
    category: 'SYNTACTIC',
    severity: EXCEPTION_SEVERITIES.CRITICAL,
    targetRecordType: RECORD_TYPES.SURGICAL_CASE,
    targetField: 'primary_cpt',
    validationLogic: 'REGEX_CPT_STANDARD',
    failureMessage: 'CPT must be 5 numeric digits or 4 digits followed by alpha character'
  },
  {
    id: 'rule_004',
    ruleCode: 'VAL_CURR_004',
    ruleName: 'Financial Non-Negative Integrity',
    category: 'FINANCIAL',
    severity: EXCEPTION_SEVERITIES.CRITICAL,
    targetRecordType: RECORD_TYPES.CLAIM_837,
    targetField: 'billed_amount',
    validationLogic: 'NUMERIC_GTE_ZERO',
    failureMessage: 'Billed charges and reimbursement values must be >= 0.00'
  },
  {
    id: 'rule_005',
    ruleCode: 'VAL_TIME_005',
    ruleName: 'Operative Duration Range',
    category: 'CLINICAL',
    severity: EXCEPTION_SEVERITIES.WARNING,
    targetRecordType: RECORD_TYPES.SURGICAL_CASE,
    targetField: 'duration_minutes',
    validationLogic: 'NUMERIC_BETWEEN_1_AND_720',
    failureMessage: 'Operating room surgical duration must be between 1 and 720 minutes'
  }
];

export const INITIAL_PIPELINE_BATCHES = [
  {
    id: 'pipe_batch_001',
    facilityId: 'fac-naples-01',
    facilityUuid: '00000000-0000-0000-0000-000000000002',
    batchCode: 'PIPE_20261125_001',
    sourceConnectorCode: 'CONN_HST_PATHWAYS',
    sourceConnectorName: 'HST Pathways EHR / Practice Management',
    currentStage: PIPELINE_STAGES.COMMIT,
    status: 'COMPLETED_WITH_EXCEPTIONS',
    recordsStaged: 250,
    recordsValidated: 246,
    recordsNormalized: 246,
    recordsMatched: 245,
    recordsQuarantined: 5,
    recordsCommitted: 245,
    recordsRejected: 0,
    totalDurationMs: 840,
    startedAt: '2026-11-25T08:30:00Z',
    completedAt: '2026-11-25T08:32:00Z'
  },
  {
    id: 'pipe_batch_002',
    facilityId: 'fac-naples-01',
    facilityUuid: '00000000-0000-0000-0000-000000000002',
    batchCode: 'PIPE_20261125_002',
    sourceConnectorCode: 'CONN_WAYSTAR_EDI',
    sourceConnectorName: 'Waystar Clearinghouse EDI Gateway',
    currentStage: PIPELINE_STAGES.COMMIT,
    status: 'COMPLETED',
    recordsStaged: 180,
    recordsValidated: 180,
    recordsNormalized: 180,
    recordsMatched: 180,
    recordsQuarantined: 0,
    recordsCommitted: 180,
    recordsRejected: 0,
    totalDurationMs: 620,
    startedAt: '2026-11-25T07:15:00Z',
    completedAt: '2026-11-25T07:16:30Z'
  },
  {
    id: 'pipe_batch_003',
    facilityId: 'fac-naples-01',
    facilityUuid: '00000000-0000-0000-0000-000000000002',
    batchCode: 'PIPE_20261125_003',
    sourceConnectorCode: 'CONN_MEDLINE_ERP',
    sourceConnectorName: 'Medline Supply Chain & Materials ERP',
    currentStage: PIPELINE_STAGES.COMMIT,
    status: 'COMPLETED_WITH_EXCEPTIONS',
    recordsStaged: 95,
    recordsValidated: 93,
    recordsNormalized: 93,
    recordsMatched: 93,
    recordsQuarantined: 2,
    recordsCommitted: 93,
    recordsRejected: 0,
    totalDurationMs: 510,
    startedAt: '2026-11-25T06:00:00Z',
    completedAt: '2026-11-25T06:01:10Z'
  }
];

export const INITIAL_EXCEPTIONS = [
  {
    id: 'exc_001',
    facilityId: 'fac-naples-01',
    batchCode: 'PIPE_20261125_001',
    stagedRecordId: 'stg_rec_8812',
    sourceRecordId: 'HST_CASE_99410',
    ruleCode: 'VAL_NPI_001',
    severity: EXCEPTION_SEVERITIES.CRITICAL,
    exceptionCategory: EXCEPTION_CATEGORIES.UNMATCHED_SURGEON,
    fieldName: 'surgeon_npi',
    sourceValue: '1234567890',
    suggestedValue: '1841392818 (Dr. Brian Miller)',
    resolutionStatus: EXCEPTION_STATUSES.PENDING,
    resolutionAction: null,
    resolutionNotes: null,
    createdAt: '2026-11-25T08:30:15Z'
  },
  {
    id: 'exc_002',
    facilityId: 'fac-naples-01',
    batchCode: 'PIPE_20261125_001',
    stagedRecordId: 'stg_rec_8815',
    sourceRecordId: 'HST_CASE_99413',
    ruleCode: 'VAL_PAYER_006',
    severity: EXCEPTION_SEVERITIES.CRITICAL,
    exceptionCategory: EXCEPTION_CATEGORIES.UNMAPPED_PAYER,
    fieldName: 'primary_payer_name',
    sourceValue: 'FL SUNSHINE HEALTH COMM',
    suggestedValue: 'PAYER_SUNSHINE_FL',
    resolutionStatus: EXCEPTION_STATUSES.PENDING,
    resolutionAction: null,
    resolutionNotes: null,
    createdAt: '2026-11-25T08:30:20Z'
  },
  {
    id: 'exc_003',
    facilityId: 'fac-naples-01',
    batchCode: 'PIPE_20261125_001',
    stagedRecordId: 'stg_rec_8820',
    sourceRecordId: 'HST_CASE_99418',
    ruleCode: 'MATCH_DUP_007',
    severity: EXCEPTION_SEVERITIES.WARNING,
    exceptionCategory: EXCEPTION_CATEGORIES.DUPLICATE_SUSPECT,
    fieldName: 'case_composite_key',
    sourceValue: 'MRN-77401-20261125-29881',
    suggestedValue: 'Existing Case ID: CASE-NAP-2026-1102 (Diff OR Room)',
    resolutionStatus: EXCEPTION_STATUSES.PENDING,
    resolutionAction: null,
    resolutionNotes: null,
    createdAt: '2026-11-25T08:30:45Z'
  }
];

let liveBatches = JSON.parse(JSON.stringify(INITIAL_PIPELINE_BATCHES));
let liveExceptions = JSON.parse(JSON.stringify(INITIAL_EXCEPTIONS));
let liveRules = JSON.parse(JSON.stringify(INITIAL_VALIDATION_RULES));

/**
 * Resets memory state back to initial seed data for test reproducibility
 */
export function resetLiveImportPipeline() {
  liveBatches = JSON.parse(JSON.stringify(INITIAL_PIPELINE_BATCHES));
  liveExceptions = JSON.parse(JSON.stringify(INITIAL_EXCEPTIONS));
  liveRules = JSON.parse(JSON.stringify(INITIAL_VALIDATION_RULES));
}

/**
 * Returns aggregated operational telemetry for the Import Validation Pipeline
 */
export function getImportPipelineTelemetry(facilityId) {
  const batches = getImportPipelineBatches(facilityId);
  const pendingExceptions = getImportExceptions(facilityId, { status: EXCEPTION_STATUSES.PENDING });

  const totalStaged = batches.reduce((sum, b) => sum + b.recordsStaged, 0);
  const totalCommitted = batches.reduce((sum, b) => sum + b.recordsCommitted, 0);
  const totalQuarantined = batches.reduce((sum, b) => sum + b.recordsQuarantined, 0);
  const cleanPassRate = totalStaged > 0 ? Number(((totalCommitted / totalStaged) * 100).toFixed(2)) : 100.00;
  const avgDurationMs = batches.length > 0
    ? Math.round(batches.reduce((sum, b) => sum + b.totalDurationMs, 0) / batches.length)
    : 0;

  const resolvedFacilityId = typeof facilityId === 'object' && facilityId !== null
    ? (facilityId.id || 'fac-naples-01')
    : (facilityId || 'fac-naples-01');

  return {
    facilityId: resolvedFacilityId,
    totalBatches24h: batches.length,
    totalStaged24h: totalStaged,
    totalCommitted24h: totalCommitted,
    totalQuarantined24h: totalQuarantined,
    activeExceptionsCount: pendingExceptions.length,
    cleanPassRatePercent: cleanPassRate,
    avgDurationMs,
    cryptographicCommitSeal: computeImportAuditSeal({
      facilityId: resolvedFacilityId,
      totalCommitted,
      activeExceptions: pendingExceptions.length,
      timestamp: '2026-11-25T10:00:00Z'
    })
  };
}

/**
 * Retrieves all pipeline batches for a facility
 */
export function getImportPipelineBatches(facilityId) {
  return liveBatches.filter(b => matchesFacilityId(b.facilityId, facilityId) || matchesFacilityId(b.facilityUuid, facilityId));
}

/**
 * Retrieves exceptions with optional filters
 */
export function getImportExceptions(facilityId, filter = {}) {
  let list = liveExceptions.filter(e => matchesFacilityId(e.facilityId, facilityId));

  if (filter.status && filter.status !== 'ALL') {
    list = list.filter(e => e.resolutionStatus === filter.status);
  }
  if (filter.severity && filter.severity !== 'ALL') {
    list = list.filter(e => e.severity === filter.severity);
  }
  if (filter.category && filter.category !== 'ALL') {
    list = list.filter(e => e.exceptionCategory === filter.category);
  }

  return list;
}

/**
 * Retrieves registered validation rules
 */
export function getValidationRules() {
  return liveRules;
}

/**
 * Executes a simulated 6-stage pipeline batch for a connector
 */
export function runPipelineBatch(sourceConnectorCode, facilityId = 'fac-naples-01') {
  const batchCode = `PIPE_${Date.now()}`;
  const now = new Date().toISOString();

  const newBatch = {
    id: `batch_${Date.now()}`,
    facilityId: typeof facilityId === 'object' && facilityId !== null ? (facilityId.id || 'fac-naples-01') : (facilityId || 'fac-naples-01'),
    facilityUuid: '00000000-0000-0000-0000-000000000002',
    batchCode,
    sourceConnectorCode,
    sourceConnectorName: sourceConnectorCode === 'CONN_HST_PATHWAYS'
      ? 'HST Pathways EHR / Practice Management'
      : sourceConnectorCode === 'CONN_WAYSTAR_EDI'
      ? 'Waystar Clearinghouse EDI Gateway'
      : 'Enterprise Healthcare Connector',
    currentStage: PIPELINE_STAGES.COMMIT,
    status: 'COMPLETED',
    recordsStaged: 50,
    recordsValidated: 50,
    recordsNormalized: 50,
    recordsMatched: 50,
    recordsQuarantined: 0,
    recordsCommitted: 50,
    recordsRejected: 0,
    totalDurationMs: 420,
    startedAt: now,
    completedAt: now
  };

  liveBatches.unshift(newBatch);

  return {
    success: true,
    batchCode: newBatch.batchCode,
    recordsCommitted: newBatch.recordsCommitted,
    currentStage: newBatch.currentStage,
    durationMs: newBatch.totalDurationMs
  };
}

/**
 * Resolves a quarantined exception in the workqueue
 */
export function resolveImportException(exceptionId, resolutionAction, resolutionData = {}, resolvedBy = '00000000-0000-0000-0000-000000000001') {
  const exception = liveExceptions.find(e => e.id === exceptionId);
  if (!exception) {
    throw new Error(`Exception ${exceptionId} not found`);
  }

  const now = new Date().toISOString();
  exception.resolutionStatus = resolutionAction === RESOLUTION_ACTIONS.REJECT_RECORD
    ? EXCEPTION_STATUSES.REJECTED
    : EXCEPTION_STATUSES.RESOLVED;
  exception.resolutionAction = resolutionAction;
  exception.resolutionNotes = resolutionData.notes || `Resolved via ${resolutionAction}`;
  exception.resolvedBy = resolvedBy;
  exception.resolvedAt = now;

  return {
    success: true,
    exceptionId: exception.id,
    resolutionStatus: exception.resolutionStatus,
    resolutionAction: exception.resolutionAction,
    resolvedAt: exception.resolvedAt
  };
}
