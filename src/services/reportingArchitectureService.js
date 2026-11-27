/**
 * ==============================================================================
 * Service: reportingArchitectureService.js
 * Module 17: Enterprise Reporting & Executive Packages (Phase H0)
 * Description: Canonical Report Catalog (H1-H9), Deterministic Filter Validator,
 *              5-Field Cron Scheduler, Role-Based Access Control (RBAC),
 *              Data Quality Trust-Gate Watermarking, and SHA-256 Artifacts.
 * ==============================================================================
 */

import { sha256Hex } from '../utils/isomorphicSha256.js';

export const NAPLES_FACILITY_ID = '00000000-0000-0000-0000-000000000002';

export const CANONICAL_EXPORT_FORMATS = ['PDF', 'CSV', 'XLSX', 'JSON'];

export const CANONICAL_SCHEDULE_CADENCES = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ON_CLOSE'];

export const CANONICAL_REPORT_CATEGORIES = [
  'EXECUTIVE',
  'FINANCE',
  'REVENUE_CYCLE',
  'CLINICAL_OR',
  'SURGEON',
  'PAYER'
];

export const CANONICAL_TRUST_GATE_STATUSES = [
  'CERTIFIED',
  'PROVISIONAL_WATERMARKED',
  'BLOCKED_TRUST_GATE'
];

export const CANONICAL_DELIVERY_CHANNELS = [
  'EMAIL_DIGEST',
  'PORTAL_INBOX',
  'SFTP_DROP',
  'WEBHOOK'
];

/**
 * Normalizes facility identifier across strings, aliases, and facility objects.
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
 * Computes an immutable 64-character SHA-256 provenance seal prefixed with `sha256_rpt_`.
 */
export function computeRptProvenanceSeal(payload) {
  const canonicalJson = JSON.stringify(payload || {});
  const digest = sha256Hex(canonicalJson);
  return `sha256_rpt_${digest.slice(0, 53)}`;
}

/**
 * Masks reporting secrets strictly as `rpt_sec_****_...`.
 */
export function maskRptSecret(rawSecret) {
  if (!rawSecret) return 'rpt_sec_****_unset';
  const str = String(rawSecret);
  if (str.startsWith('rpt_sec_****_')) return str;
  return `rpt_sec_****_${str.slice(-4)}`;
}

/**
 * Validates standard 5-field cron expressions (`m h dom mon dow`).
 */
export function validateCronExpression(cronExpr) {
  const expr = String(cronExpr || '').trim();
  const parts = expr.split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`ERR_RPT_INVALID_CRON: Expected 5-field cron expression (got ${parts.length} fields)`);
  }
  const tokenRegex = /^(\*|\d+|\d+-\d+|\*\/\d+|\d+(,\d+)+)$/;
  for (const field of parts) {
    if (!tokenRegex.test(field)) {
      throw new Error(`ERR_RPT_INVALID_CRON: Malformed cron token "${field}"`);
    }
  }
  return { valid: true, cron_expression: expr };
}

/**
 * Validates filter date boundaries and export row limits.
 */
export function validateReportFilterPayload(filters = {}, maxRows = 50000) {
  const dateFrom = filters.date_from || '2026-11-01';
  const dateTo = filters.date_to || '2026-11-27';
  const rowLimit = Number(filters.row_limit ?? 1000);

  if (Date.parse(dateFrom) > Date.parse(dateTo)) {
    throw new Error(`ERR_RPT_INVALID_FILTERS: date_from (${dateFrom}) cannot exceed date_to (${dateTo})`);
  }
  if (!Number.isFinite(rowLimit) || rowLimit < 1 || rowLimit > Number(maxRows)) {
    throw new Error(`ERR_RPT_INVALID_FILTERS: row_limit (${rowLimit}) must be between 1 and ${maxRows}`);
  }

  return {
    ...filters,
    date_from: dateFrom,
    date_to: dateTo,
    row_limit: rowLimit
  };
}

/**
 * Enforces RBAC role authorization consistently across UI and AI callers.
 */
export function authorizeReportAction(actorRole, reportDef, actionType = 'GENERATE_RUN') {
  const role = String(actorRole || '').trim();
  if (!reportDef || !Array.isArray(reportDef.allowed_roles)) {
    return { authorized: false, denial_reason: 'Missing report RBAC policy' };
  }
  if (actionType === 'SCHEDULE_CREATE' || actionType === 'SCHEDULE_TOGGLE') {
    const schedRoles = ['Facility Administrator', 'CFO / Finance Director', 'Data Operations Steward'];
    if (!schedRoles.includes(role)) {
      return {
        authorized: false,
        denial_reason: `Role "${role}" lacks reporting schedule administration privilege`
      };
    }
  }
  if (!reportDef.allowed_roles.includes(role)) {
    return {
      authorized: false,
      denial_reason: `Role "${role}" is not permitted for ${reportDef.report_code} (${reportDef.required_permission})`
    };
  }
  return { authorized: true, denial_reason: null };
}

/**
 * Evaluates Module 16 Financial Completeness Trust Score against Facility Trust Gate.
 */
export function evaluateExportTrustGate(dqTrustScore = 100.0, minScore = 75.0, enforceGate = true) {
  const score = Number(dqTrustScore);
  const floor = Number(minScore);

  if (!enforceGate || score >= floor) {
    return {
      trust_gate_status: 'CERTIFIED',
      is_watermarked: false,
      watermark_text: null,
      blocked: false
    };
  }
  if (score >= 50.0) {
    return {
      trust_gate_status: 'PROVISIONAL_WATERMARKED',
      is_watermarked: true,
      watermark_text: `PROVISIONAL — DQ TRUST SCORE ${score.toFixed(1)}% < ${floor.toFixed(1)}% THRESHOLD`,
      blocked: false
    };
  }
  return {
    trust_gate_status: 'BLOCKED_TRUST_GATE',
    is_watermarked: true,
    watermark_text: `BLOCKED — CRITICAL DQ FAILURE (${score.toFixed(1)}%)`,
    blocked: true
  };
}

// ==============================================================================
// Deterministic In-Memory Facility Store (Naples Surgery Center Seed)
// ==============================================================================

const facilityStateStore = new Map();

function buildInitialFacilityStore(facilityId) {
  const config = {
    id: 'h0000001-0000-4000-8000-000000000001',
    facility_id: facilityId,
    enforce_dq_trust_gate: true,
    min_financial_trust_score: 75.00,
    watermark_draft_exports: true,
    max_export_rows: 50000,
    default_timezone: 'America/New_York',
    retention_days: 2555,
    client_secret_encrypted: 'rpt_sec_****_naples_8109',
    sync_status: 'ACTIVE',
    health_status: 'HEALTHY',
    updated_at: '2026-11-27T08:00:00.000Z'
  };

  const definitions = [
    {
      id: 'def-h1',
      facility_id: facilityId,
      report_code: 'RPT-H1-DAILY-BRIEF',
      report_phase: 'H1',
      title: 'Daily Administrator Operational Brief',
      category: 'EXECUTIVE',
      default_filters: { window: 'LAST_24H', row_limit: 200 },
      supported_formats: ['PDF', 'CSV', 'JSON'],
      required_permission: 'reports.view_executive',
      allowed_roles: ['Facility Administrator', 'CFO / Finance Director', 'Clinical Nursing Director', 'Data Operations Steward'],
      data_source_modules: ['SIS_EHR', 'OR_BLOCK', 'DATA_QUALITY'],
      version_tag: 'rpt-v1.0.0',
      is_active: true
    },
    {
      id: 'def-h2',
      facility_id: facilityId,
      report_code: 'RPT-H2-LEAKAGE',
      report_phase: 'H2',
      title: 'Weekly Revenue Leakage & Carveout Report',
      category: 'REVENUE_CYCLE',
      default_filters: { window: 'LAST_7D', row_limit: 500 },
      supported_formats: ['PDF', 'XLSX', 'CSV', 'JSON'],
      required_permission: 'reports.view_rcm',
      allowed_roles: ['Facility Administrator', 'CFO / Finance Director', 'RCM Billing Lead', 'Data Operations Steward'],
      data_source_modules: ['REVENUE_LEAKAGE', 'CLEARINGHOUSE_EDI'],
      version_tag: 'rpt-v1.0.0',
      is_active: true
    },
    {
      id: 'def-h3',
      facility_id: facilityId,
      report_code: 'RPT-H3-MONTHLY-CFO',
      report_phase: 'H3',
      title: 'Monthly CFO Margin, Cash & Variance Dossier',
      category: 'FINANCE',
      default_filters: { window: 'MTD', row_limit: 1000 },
      supported_formats: ['PDF', 'XLSX', 'JSON'],
      required_permission: 'reports.view_cfo',
      allowed_roles: ['Facility Administrator', 'CFO / Finance Director', 'Controller'],
      data_source_modules: ['MANAGEMENT_PNL', 'CASH_FORECAST', 'FINANCIAL_COMPLETENESS'],
      version_tag: 'rpt-v1.0.0',
      is_active: true
    },
    {
      id: 'def-h4',
      facility_id: facilityId,
      report_code: 'RPT-H4-SURGEON-CARD',
      report_phase: 'H4',
      title: 'Surgeon Financial & Preference Scorecard',
      category: 'SURGEON',
      default_filters: { window: 'LAST_30D', row_limit: 250 },
      supported_formats: ['PDF', 'XLSX', 'CSV'],
      required_permission: 'reports.view_surgeon',
      allowed_roles: ['Facility Administrator', 'CFO / Finance Director', 'Medical Director'],
      data_source_modules: ['SURGEON_INTELLIGENCE', 'INVENTORY_POU'],
      version_tag: 'rpt-v1.0.0',
      is_active: true
    },
    {
      id: 'def-h5',
      facility_id: facilityId,
      report_code: 'RPT-H5-PAYER-CARD',
      report_phase: 'H5',
      title: 'Payer Reimbursement & Contract Variance Scorecard',
      category: 'PAYER',
      default_filters: { window: 'LAST_90D', row_limit: 500 },
      supported_formats: ['PDF', 'XLSX', 'CSV'],
      required_permission: 'reports.view_payer',
      allowed_roles: ['Facility Administrator', 'CFO / Finance Director', 'RCM Billing Lead'],
      data_source_modules: ['PAYER_INTELLIGENCE', 'EDI_835'],
      version_tag: 'rpt-v1.0.0',
      is_active: true
    },
    {
      id: 'def-h6',
      facility_id: facilityId,
      report_code: 'RPT-H6-CPT-ECON',
      report_phase: 'H6',
      title: 'CPT Procedure Unit Economics & Cost Breakdown',
      category: 'FINANCE',
      default_filters: { window: 'LAST_90D', row_limit: 1000 },
      supported_formats: ['XLSX', 'CSV', 'PDF'],
      required_permission: 'reports.view_finance',
      allowed_roles: ['Facility Administrator', 'CFO / Finance Director', 'Controller'],
      data_source_modules: ['CPT_INTELLIGENCE', 'CASE_COST_MODEL'],
      version_tag: 'rpt-v1.0.0',
      is_active: true
    },
    {
      id: 'def-h7',
      facility_id: facilityId,
      report_code: 'RPT-H7-OR-BLOCK',
      report_phase: 'H7',
      title: 'OR Block Utilization, Releases & Turnover Digest',
      category: 'CLINICAL_OR',
      default_filters: { window: 'LAST_30D', row_limit: 500 },
      supported_formats: ['PDF', 'CSV'],
      required_permission: 'reports.view_or',
      allowed_roles: ['Facility Administrator', 'Clinical Nursing Director', 'OR Scheduler'],
      data_source_modules: ['OR_UTILIZATION', 'SIS_EHR'],
      version_tag: 'rpt-v1.0.0',
      is_active: true
    },
    {
      id: 'def-h8',
      facility_id: facilityId,
      report_code: 'RPT-H8-DENIAL-AR',
      report_phase: 'H8',
      title: 'Denials, Appeals & AR Aging Workqueue Report',
      category: 'REVENUE_CYCLE',
      default_filters: { window: 'CURRENT_AR', row_limit: 2000 },
      supported_formats: ['XLSX', 'CSV', 'PDF'],
      required_permission: 'reports.view_rcm',
      allowed_roles: ['Facility Administrator', 'CFO / Finance Director', 'RCM Billing Lead'],
      data_source_modules: ['DENIALS_MODEL', 'AR_AGING'],
      version_tag: 'rpt-v1.0.0',
      is_active: true
    },
    {
      id: 'def-h9',
      facility_id: facilityId,
      report_code: 'RPT-H9-BOARD-PKG',
      report_phase: 'H9',
      title: 'Quarterly Executive Board Governance Package',
      category: 'EXECUTIVE',
      default_filters: { window: 'QUARTERLY', row_limit: 500 },
      supported_formats: ['PDF', 'JSON'],
      required_permission: 'reports.approve_board_pkg',
      allowed_roles: ['Facility Administrator', 'CFO / Finance Director'],
      data_source_modules: ['BOARD_REPORTING', 'ROI_VALUE_REPORT', 'FINANCIAL_COMPLETENESS'],
      version_tag: 'rpt-v1.0.0',
      is_active: true
    }
  ];

  const savedFilters = [
    {
      id: 'flt-01',
      facility_id: facilityId,
      filter_name: 'Ortho Q4 Margin Watch',
      report_code: 'RPT-H4-SURGEON-CARD',
      filter_payload: {
        date_from: '2026-10-01',
        date_to: '2026-11-26',
        specialty: 'Orthopedic Surgery',
        row_limit: 250
      },
      created_by: 'cfo@naplessurgery.com',
      is_shared_facility_wide: true
    }
  ];

  const schedules = [
    {
      id: 'sch-01',
      facility_id: facilityId,
      schedule_code: 'SCH-DAILY-ADMIN',
      report_code: 'RPT-H1-DAILY-BRIEF',
      cadence: 'DAILY',
      cron_expression: '0 6 * * 1-5',
      delivery_channel: 'EMAIL_DIGEST',
      export_format: 'PDF',
      recipient_emails: ['admin@naplessurgery.com', 'nursing_dir@naplessurgery.com'],
      filter_preset: { date_from: '2026-11-26', date_to: '2026-11-27', row_limit: 200 },
      is_enabled: true,
      last_run_status: 'SUCCESS',
      created_by: 'admin@naplessurgery.com'
    },
    {
      id: 'sch-02',
      facility_id: facilityId,
      schedule_code: 'SCH-WEEKLY-LEAK',
      report_code: 'RPT-H2-LEAKAGE',
      cadence: 'WEEKLY',
      cron_expression: '0 7 * * 1',
      delivery_channel: 'PORTAL_INBOX',
      export_format: 'XLSX',
      recipient_emails: ['cfo@naplessurgery.com', 'rcm_lead@naplessurgery.com'],
      filter_preset: { date_from: '2026-11-20', date_to: '2026-11-27', row_limit: 500 },
      is_enabled: true,
      last_run_status: 'SUCCESS',
      created_by: 'cfo@naplessurgery.com'
    }
  ];

  const execSeal = computeRptProvenanceSeal({ code: 'RPT-RUN-20261127-01', report: 'RPT-H1-DAILY-BRIEF' });
  const executions = [
    {
      id: 'exec-01',
      facility_id: facilityId,
      execution_code: 'RPT-RUN-20261127-01',
      report_code: 'RPT-H1-DAILY-BRIEF',
      schedule_id: 'sch-01',
      generation_mode: 'SCHEDULED',
      filter_snapshot: { date_from: '2026-11-26', date_to: '2026-11-26', row_limit: 120 },
      export_format: 'PDF',
      row_count: 48,
      dq_trust_score_at_run: 94.80,
      trust_gate_status: 'CERTIFIED',
      status: 'COMPLETED',
      duration_ms: 312,
      generated_by: 'scheduler.bot@naplessurgery.com',
      sha256_report_seal: execSeal,
      created_at: '2026-11-27T06:00:05.000Z'
    }
  ];

  const exportArtifacts = [
    {
      id: 'art-01',
      facility_id: facilityId,
      execution_id: 'exec-01',
      artifact_code: 'ART-20261127-01',
      export_format: 'PDF',
      file_name: 'Naples_Daily_Admin_Brief_20261127.pdf',
      byte_size: 184320,
      is_watermarked: false,
      watermark_text: null,
      content_checksum_sha256: computeRptProvenanceSeal({ artifact: 'ART-20261127-01', exec: 'exec-01' }),
      exported_by: 'scheduler.bot@naplessurgery.com',
      created_at: '2026-11-27T06:00:05.000Z'
    }
  ];

  const accessAudit = [
    {
      id: 'aud-01',
      facility_id: facilityId,
      report_code: 'RPT-H1-DAILY-BRIEF',
      execution_id: 'exec-01',
      action_type: 'GENERATE_RUN',
      actor_email: 'scheduler.bot@naplessurgery.com',
      actor_role: 'Facility Administrator',
      access_granted: true,
      denial_reason: null,
      sha256_seal: execSeal,
      created_at: '2026-11-27T06:00:05.000Z'
    }
  ];

  return {
    config,
    definitions,
    savedFilters,
    schedules,
    executions,
    exportArtifacts,
    accessAudit
  };
}

function ensureFacilityStore(facilityInput) {
  const facilityId = normalizeFacilityId(facilityInput);
  if (!facilityStateStore.has(facilityId)) {
    facilityStateStore.set(facilityId, buildInitialFacilityStore(facilityId));
  }
  return facilityStateStore.get(facilityId);
}

// ==============================================================================
// Read / Query Functions
// ==============================================================================

export async function getRptConfig(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return {
    ...store.config,
    client_secret_encrypted: maskRptSecret(store.config.client_secret_encrypted)
  };
}

export async function updateRptConfig(facilityInput, updates = {}) {
  const store = ensureFacilityStore(facilityInput);
  const nextMinScore = Number(updates.min_financial_trust_score ?? store.config.min_financial_trust_score);
  const nextMaxRows = Number(updates.max_export_rows ?? store.config.max_export_rows);

  if (!Number.isFinite(nextMinScore) || nextMinScore < 50 || nextMinScore > 100) {
    throw new Error('ERR_RPT_INVALID_THRESHOLD: min_financial_trust_score must be between 50 and 100');
  }
  if (!Number.isFinite(nextMaxRows) || nextMaxRows < 100 || nextMaxRows > 500000) {
    throw new Error('ERR_RPT_INVALID_ROW_LIMIT: max_export_rows must be between 100 and 500000');
  }

  store.config = {
    ...store.config,
    enforce_dq_trust_gate: updates.enforce_dq_trust_gate ?? store.config.enforce_dq_trust_gate,
    min_financial_trust_score: nextMinScore,
    watermark_draft_exports: updates.watermark_draft_exports ?? store.config.watermark_draft_exports,
    max_export_rows: nextMaxRows,
    updated_at: new Date().toISOString()
  };

  return getRptConfig(facilityInput);
}

export async function getRptTelemetry(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  const latestExec = store.executions[0];
  return {
    facility_id: store.config.facility_id,
    enforce_dq_trust_gate: store.config.enforce_dq_trust_gate,
    min_financial_trust_score: store.config.min_financial_trust_score,
    active_definitions_count: store.definitions.filter(d => d.is_active).length,
    enabled_schedules_count: store.schedules.filter(s => s.is_enabled).length,
    completed_executions_count: store.executions.filter(e => e.status === 'COMPLETED').length,
    access_denials_count: store.accessAudit.filter(a => !a.access_granted).length,
    latest_sync_seal: latestExec ? latestExec.sha256_report_seal : computeRptProvenanceSeal(store.config),
    sync_status: store.config.sync_status,
    health_status: store.config.health_status
  };
}

export async function getRptDefinitions(facilityInput, filters = {}) {
  const store = ensureFacilityStore(facilityInput);
  let res = [...store.definitions];
  if (filters.category && filters.category !== 'ALL') {
    res = res.filter(d => d.category === filters.category);
  }
  return res;
}

export async function getRptSavedFilters(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return [...store.savedFilters];
}

export async function getRptSchedules(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return [...store.schedules];
}

export async function getRptExecutions(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return [...store.executions];
}

export async function getRptExportArtifacts(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return [...store.exportArtifacts];
}

export async function getRptAccessAudit(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return [...store.accessAudit];
}

// ==============================================================================
// Mutations (Generate Report, Create Schedule, Toggle Schedule, Save Filter)
// ==============================================================================

/**
 * Generates an on-demand or scheduled report execution, enforcing filter limits,
 * RBAC access policy, and Module 16 Data Quality Trust Gate watermarking/blocking.
 */
export async function generateReportRun(facilityInput, payload = {}) {
  const store = ensureFacilityStore(facilityInput);
  const {
    report_code,
    export_format = 'PDF',
    actor_email = 'cfo@naplessurgery.com',
    actor_role = 'CFO / Finance Director',
    generation_mode = 'ON_DEMAND',
    dq_trust_score = 94.80,
    filters = {}
  } = payload;

  const def = store.definitions.find(d => d.report_code === report_code);
  if (!def) {
    throw new Error(`ERR_RPT_UNKNOWN_REPORT: Report code "${report_code}" is not registered`);
  }
  if (!def.supported_formats.includes(export_format)) {
    throw new Error(`ERR_RPT_UNSUPPORTED_FORMAT: Format "${export_format}" is not enabled for ${report_code}`);
  }

  const normalizedFilters = validateReportFilterPayload(filters, store.config.max_export_rows);
  const now = new Date().toISOString();

  // 1. Deterministic RBAC Authorization Check
  const auth = authorizeReportAction(actor_role, def, 'GENERATE_RUN');
  if (!auth.authorized) {
    const denialSeal = computeRptProvenanceSeal({ report_code, actor_email, actor_role, denied: true, now });
    store.accessAudit.unshift({
      id: `aud-${Date.now()}`,
      facility_id: store.config.facility_id,
      report_code,
      execution_id: null,
      action_type: 'ACCESS_DENIED',
      actor_email,
      actor_role,
      access_granted: false,
      denial_reason: auth.denial_reason,
      sha256_seal: denialSeal,
      created_at: now
    });
    throw new Error(`ERR_RPT_RBAC_DENIED: ${auth.denial_reason}`);
  }

  // 2. Module 16 Trust Gate Check
  const gate = evaluateExportTrustGate(
    dq_trust_score,
    store.config.min_financial_trust_score,
    store.config.enforce_dq_trust_gate
  );

  const execCode = `RPT-RUN-${Date.now()}`;
  const reportSeal = computeRptProvenanceSeal({
    facility_id: store.config.facility_id,
    execCode,
    report_code,
    export_format,
    normalizedFilters,
    dq_trust_score,
    gate,
    now
  });

  if (gate.blocked) {
    const blockedExec = {
      id: `exec-${Date.now()}`,
      facility_id: store.config.facility_id,
      execution_code: execCode,
      report_code,
      schedule_id: null,
      generation_mode,
      filter_snapshot: normalizedFilters,
      export_format,
      row_count: 0,
      dq_trust_score_at_run: Number(dq_trust_score),
      trust_gate_status: gate.trust_gate_status,
      status: 'BLOCKED',
      duration_ms: 42,
      generated_by: actor_email,
      sha256_report_seal: reportSeal,
      created_at: now
    };
    store.executions.unshift(blockedExec);
    throw new Error(`ERR_RPT_TRUST_GATE_BLOCKED: Execution halted because DQ Trust Score (${dq_trust_score}%) is critically below 50.0%`);
  }

  const execId = `exec-${Date.now()}`;
  const execRecord = {
    id: execId,
    facility_id: store.config.facility_id,
    execution_code: execCode,
    report_code,
    schedule_id: null,
    generation_mode,
    filter_snapshot: normalizedFilters,
    export_format,
    row_count: Math.min(normalizedFilters.row_limit, 142),
    dq_trust_score_at_run: Number(dq_trust_score),
    trust_gate_status: gate.trust_gate_status,
    status: 'COMPLETED',
    duration_ms: 245,
    generated_by: actor_email,
    sha256_report_seal: reportSeal,
    created_at: now
  };
  store.executions.unshift(execRecord);

  const ext = export_format.toLowerCase();
  const artifact = {
    id: `art-${Date.now()}`,
    facility_id: store.config.facility_id,
    execution_id: execId,
    artifact_code: `ART-${Date.now()}`,
    export_format,
    file_name: `${report_code.replace(/[^A-Z0-9]+/g, '_')}_${execCode}.${ext}`,
    byte_size: export_format === 'PDF' ? 196400 : 28410,
    is_watermarked: Boolean(gate.is_watermarked && store.config.watermark_draft_exports),
    watermark_text: gate.watermark_text,
    content_checksum_sha256: reportSeal,
    exported_by: actor_email,
    created_at: now
  };
  store.exportArtifacts.unshift(artifact);

  store.accessAudit.unshift({
    id: `aud-${Date.now()}-${Math.floor(Math.random() * 100)}`,
    facility_id: store.config.facility_id,
    report_code,
    execution_id: execId,
    action_type: 'GENERATE_RUN',
    actor_email,
    actor_role,
    access_granted: true,
    denial_reason: null,
    sha256_seal: reportSeal,
    created_at: now
  });

  return {
    execution: { ...execRecord },
    artifact: { ...artifact }
  };
}

/**
 * Creates a validated recurring delivery schedule with 5-field cron enforcement.
 */
export async function createReportSchedule(facilityInput, payload = {}) {
  const store = ensureFacilityStore(facilityInput);
  const {
    report_code,
    cadence = 'WEEKLY',
    cron_expression,
    delivery_channel = 'EMAIL_DIGEST',
    export_format = 'PDF',
    recipient_emails = [],
    actor_email = 'cfo@naplessurgery.com',
    actor_role = 'CFO / Finance Director'
  } = payload;

  const def = store.definitions.find(d => d.report_code === report_code);
  if (!def) {
    throw new Error(`ERR_RPT_UNKNOWN_REPORT: Report code "${report_code}" is not registered`);
  }

  const auth = authorizeReportAction(actor_role, def, 'SCHEDULE_CREATE');
  if (!auth.authorized) {
    throw new Error(`ERR_RPT_RBAC_DENIED: ${auth.denial_reason}`);
  }

  validateCronExpression(cron_expression);

  const cleanedRecipients = Array.isArray(recipient_emails)
    ? recipient_emails.map(e => String(e).trim()).filter(Boolean)
    : String(recipient_emails).split(',').map(e => e.trim()).filter(Boolean);

  if (cleanedRecipients.length === 0) {
    throw new Error('ERR_RPT_RECIPIENTS_REQUIRED: At least one delivery recipient email is required');
  }

  const scheduleCode = `SCH-${report_code.slice(4, 10)}-${Date.now().toString().slice(-4)}`;
  const now = new Date().toISOString();

  const newSchedule = {
    id: `sch-${Date.now()}`,
    facility_id: store.config.facility_id,
    schedule_code: scheduleCode,
    report_code,
    cadence,
    cron_expression,
    delivery_channel,
    export_format,
    recipient_emails: cleanedRecipients,
    filter_preset: def.default_filters,
    is_enabled: true,
    last_run_status: 'READY',
    created_by: actor_email,
    created_at: now
  };

  store.schedules.unshift(newSchedule);

  store.accessAudit.unshift({
    id: `aud-${Date.now()}`,
    facility_id: store.config.facility_id,
    report_code,
    execution_id: null,
    action_type: 'SCHEDULE_CREATE',
    actor_email,
    actor_role,
    access_granted: true,
    denial_reason: null,
    sha256_seal: computeRptProvenanceSeal(newSchedule),
    created_at: now
  });

  return { ...newSchedule };
}

/**
 * Toggles a recurring report schedule between enabled and paused.
 */
export async function toggleReportSchedule(facilityInput, scheduleId, options = {}) {
  const store = ensureFacilityStore(facilityInput);
  const sched = store.schedules.find(s => s.id === scheduleId || s.schedule_code === scheduleId);
  if (!sched) {
    throw new Error(`ERR_RPT_SCHEDULE_NOT_FOUND: Schedule "${scheduleId}" not found`);
  }

  sched.is_enabled = options.is_enabled ?? !sched.is_enabled;
  const now = new Date().toISOString();

  store.accessAudit.unshift({
    id: `aud-${Date.now()}`,
    facility_id: store.config.facility_id,
    report_code: sched.report_code,
    execution_id: null,
    action_type: 'SCHEDULE_TOGGLE',
    actor_email: options.actor_email || 'admin@naplessurgery.com',
    actor_role: options.actor_role || 'Facility Administrator',
    access_granted: true,
    denial_reason: null,
    sha256_seal: computeRptProvenanceSeal({ schedule_code: sched.schedule_code, is_enabled: sched.is_enabled, now }),
    created_at: now
  });

  return { ...sched };
}

export async function saveFilterPreset(facilityInput, payload = {}) {
  const store = ensureFacilityStore(facilityInput);
  const { report_code, filter_name, filter_payload, created_by } = payload;
  if (!filter_name || String(filter_name).trim().length < 3) {
    throw new Error('ERR_RPT_INVALID_FILTER_NAME: Filter preset name must be at least 3 characters');
  }
  const normalized = validateReportFilterPayload(filter_payload, store.config.max_export_rows);
  const preset = {
    id: `flt-${Date.now()}`,
    facility_id: store.config.facility_id,
    filter_name: String(filter_name).trim(),
    report_code,
    filter_payload: normalized,
    created_by: created_by || 'cfo@naplessurgery.com',
    is_shared_facility_wide: true
  };
  store.savedFilters.unshift(preset);
  return { ...preset };
}

export default {
  NAPLES_FACILITY_ID,
  CANONICAL_EXPORT_FORMATS,
  CANONICAL_SCHEDULE_CADENCES,
  CANONICAL_REPORT_CATEGORIES,
  CANONICAL_TRUST_GATE_STATUSES,
  CANONICAL_DELIVERY_CHANNELS,
  normalizeFacilityId,
  computeRptProvenanceSeal,
  maskRptSecret,
  validateCronExpression,
  validateReportFilterPayload,
  authorizeReportAction,
  evaluateExportTrustGate,
  getRptConfig,
  updateRptConfig,
  getRptTelemetry,
  getRptDefinitions,
  getRptSavedFilters,
  getRptSchedules,
  getRptExecutions,
  getRptExportArtifacts,
  getRptAccessAudit,
  generateReportRun,
  createReportSchedule,
  toggleReportSchedule,
  saveFilterPreset
};
