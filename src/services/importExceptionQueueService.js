/**
 * ==============================================================================
 * Service: importExceptionQueueService.js
 * Module 16: Enterprise Data Quality Governance (Phase G3)
 * Description: Unified Import Exception Review Queue, Deterministic SLA
 *              Tracking, Role-Based Auto-Ownership Routing, Inline Payload
 *              Repair & Replay Engine, and SHA-256 Provenance.
 * ==============================================================================
 */

import { sha256Hex } from '../utils/isomorphicSha256.js';

export const NAPLES_FACILITY_ID = '00000000-0000-0000-0000-000000000002';

export const CANONICAL_QUEUE_STATUSES = [
  'OPEN',
  'ASSIGNED',
  'IN_REVIEW',
  'ESCALATED',
  'RESOLVED_REPLAYED',
  'DISMISSED_SUPPRESSED'
];

export const SEVERITY_SLA_HOURS = {
  CRITICAL: 4,
  HIGH: 12,
  MEDIUM: 24,
  LOW: 72
};

export const VALID_STATE_TRANSITIONS = {
  OPEN: ['ASSIGNED', 'IN_REVIEW', 'ESCALATED'],
  ASSIGNED: ['IN_REVIEW', 'ESCALATED', 'RESOLVED_REPLAYED', 'DISMISSED_SUPPRESSED'],
  IN_REVIEW: ['ESCALATED', 'RESOLVED_REPLAYED', 'DISMISSED_SUPPRESSED'],
  ESCALATED: ['IN_REVIEW', 'RESOLVED_REPLAYED', 'DISMISSED_SUPPRESSED'],
  RESOLVED_REPLAYED: [],
  DISMISSED_SUPPRESSED: []
};

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
 * Generates an immutable 64-char SHA-256 seal for exception queue & replay records
 */
export function computeIeqProvenanceSeal(facilityId, ticketOrReplayCode, sourceModule, status, financialImpactUsd = 0) {
  const normId = normalizeFacilityId(facilityId);
  const payload = `${normId}|${ticketOrReplayCode}|${sourceModule}|${status}|${Number(financialImpactUsd).toFixed(2)}`;
  const rawHash = sha256Hex(payload);
  return `sha256_ieq_${rawHash.substring(0, 53)}`; // Exactly 64 chars (11 + 53)
}

/**
 * Masks sensitive credentials for UI and logging safety
 */
export function maskIeqSecret(secret) {
  if (!secret) return 'ieq_sec_****_none';
  if (secret.length <= 8) return 'ieq_sec_****_mask';
  return `ieq_sec_****_${secret.slice(-4)}`;
}

/**
 * Deterministically assigns owner role, default assignee, priority score, and SLA deadline
 */
export function determineExceptionOwnerAndSla(
  { sourceModule, exceptionCategory, severity = 'MEDIUM', createdAt = new Date() },
  routingRules = DEFAULT_ROUTING_RULES
) {
  const sev = String(severity).toUpperCase();
  const baseSlaHours = SEVERITY_SLA_HOURS[sev] || 24;

  const exactRoute = routingRules.find(
    r => r.is_active !== false && r.source_module === sourceModule && r.exception_category === exceptionCategory
  );
  const fallbackRoute = exactRoute || routingRules.find(r => r.is_active !== false && r.source_module === sourceModule);

  const slaHours = fallbackRoute?.sla_hours_override || baseSlaHours;
  const createdTime = new Date(createdAt).getTime();
  const slaDueAt = new Date(createdTime + slaHours * 3600 * 1000).toISOString();

  const priorityMap = { CRITICAL: 100, HIGH: 75, MEDIUM: 40, LOW: 15 };

  return {
    assignedRole: fallbackRoute?.assigned_role || 'Data Operations Steward',
    assignedTo: fallbackRoute?.default_assignee_email || 'data_steward@naplesasc.com',
    slaHours,
    slaDueAt,
    priorityScore: priorityMap[sev] || 40
  };
}

/**
 * Enforces deterministic state machine transition rules and dismissal justifications
 */
export function validateQueueTransition(currentStatus, targetStatus, notes = '') {
  const from = String(currentStatus || '').toUpperCase();
  const to = String(targetStatus || '').toUpperCase();

  if (!CANONICAL_QUEUE_STATUSES.includes(from) || !CANONICAL_QUEUE_STATUSES.includes(to)) {
    return { isValid: false, errorCode: 'ERR_IEQ_UNKNOWN_STATUS', message: `Unknown status transition: ${from} -> ${to}` };
  }

  const allowed = VALID_STATE_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    return {
      isValid: false,
      errorCode: 'ERR_IEQ_INVALID_TRANSITION',
      message: `Transition from ${from} to ${to} is prohibited by queue governance.`
    };
  }

  if (to === 'DISMISSED_SUPPRESSED' && String(notes || '').trim().length < 5) {
    return {
      isValid: false,
      errorCode: 'ERR_DISMISS_REASON_REQUIRED',
      message: 'Dismissing or suppressing an import exception requires a documented reason (min 5 characters).'
    };
  }

  return { isValid: true, errorCode: null, message: 'Transition valid.' };
}

// ==========================================
// MOCK REPOSITORY & DEFAULT DATA
// ==========================================

const DEFAULT_CONFIG = {
  facility_id: NAPLES_FACILITY_ID,
  critical_sla_hours: 4,
  high_sla_hours: 12,
  medium_sla_hours: 24,
  low_sla_hours: 72,
  auto_assign_by_domain: true,
  require_reason_for_dismissal: true,
  client_secret_encrypted: 'enc_v2_33f50a46bc170824351607241560724156072415607241560724156072416632',
  sync_status: 'ACTIVE',
  health_status: 'HEALTHY',
  updated_at: new Date().toISOString()
};

const DEFAULT_ROUTING_RULES = [
  {
    id: 'rt-01',
    facility_id: NAPLES_FACILITY_ID,
    source_module: 'VENDOR_INVOICE',
    exception_category: 'PRICE_VARIANCE',
    assigned_role: 'Materials Manager',
    default_assignee_email: 'materials_mgr@naplesasc.com',
    sla_hours_override: 4,
    is_active: true
  },
  {
    id: 'rt-02',
    facility_id: NAPLES_FACILITY_ID,
    source_module: 'PAYROLL_WFM',
    exception_category: 'MISSED_PUNCH',
    assigned_role: 'HR & Payroll Coordinator',
    default_assignee_email: 'payroll_admin@naplesasc.com',
    sla_hours_override: 12,
    is_active: true
  },
  {
    id: 'rt-03',
    facility_id: NAPLES_FACILITY_ID,
    source_module: 'INVENTORY_POU',
    exception_category: 'EXPIRED_LOT_SCANNED',
    assigned_role: 'Materials Manager',
    default_assignee_email: 'materials_mgr@naplesasc.com',
    sla_hours_override: 4,
    is_active: true
  },
  {
    id: 'rt-04',
    facility_id: NAPLES_FACILITY_ID,
    source_module: 'SIS_EHR',
    exception_category: 'CHRONOLOGY_INVERSION',
    assigned_role: 'Clinical Nursing Director',
    default_assignee_email: 'nursing_dir@naplesasc.com',
    sla_hours_override: 4,
    is_active: true
  },
  {
    id: 'rt-05',
    facility_id: NAPLES_FACILITY_ID,
    source_module: 'EXCEL_CSV',
    exception_category: 'SCHEMA_MAPPING',
    assigned_role: 'Data Operations Steward',
    default_assignee_email: 'data_steward@naplesasc.com',
    sla_hours_override: 24,
    is_active: true
  }
];

const DEFAULT_EXCEPTIONS = [
  {
    id: 'ieq-exc-101',
    facility_id: NAPLES_FACILITY_ID,
    exception_ticket_code: 'EXC-2026-101',
    source_module: 'VENDOR_INVOICE',
    batch_control_number: 'INV-CH-442910',
    exception_code: 'ERR_PRICE_OVERBILLING',
    exception_category: 'PRICE_VARIANCE',
    severity: 'CRITICAL',
    financial_impact_usd: 360.00,
    assigned_role: 'Materials Manager',
    assigned_to: 'materials_mgr@naplesasc.com',
    queue_status: 'IN_REVIEW',
    sla_due_at: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
    raw_payload_json: { vendor: 'Cardinal Health', sku: 'CH-J316H', invoiced_price: 120.50, contract_price: 84.50, qty: 10 },
    corrected_payload_json: null,
    resolution_notes: null,
    sha256_sync_seal: 'sha256_ieq_1c489fbc0123456789abcdef0123456789abcdef0123456789abc',
    created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString()
  },
  {
    id: 'ieq-exc-102',
    facility_id: NAPLES_FACILITY_ID,
    exception_ticket_code: 'EXC-2026-102',
    source_module: 'PAYROLL_WFM',
    batch_control_number: 'PAY-BAT-20260224-01',
    exception_code: 'ERR_MISSED_CLOCK_OUT',
    exception_category: 'MISSED_PUNCH',
    severity: 'HIGH',
    financial_impact_usd: 415.00,
    assigned_role: 'HR & Payroll Coordinator',
    assigned_to: 'payroll_admin@naplesasc.com',
    queue_status: 'ASSIGNED',
    sla_due_at: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
    raw_payload_json: { employee_id: 'EMP-1082', clock_in: '2026-02-21T06:30:00Z', clock_out: '2026-02-22T01:00:00Z', hours: 18.5 },
    corrected_payload_json: null,
    resolution_notes: null,
    sha256_sync_seal: 'sha256_ieq_2d590acd1234567890abcdef1234567890abcdef1234567890abc',
    created_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString()
  },
  {
    id: 'ieq-exc-103',
    facility_id: NAPLES_FACILITY_ID,
    exception_ticket_code: 'EXC-2026-103',
    source_module: 'INVENTORY_POU',
    batch_control_number: 'INV-SYNC-20260224-01',
    exception_code: 'ERR_EXPIRED_IMPLANT_SCANNED',
    exception_category: 'EXPIRED_LOT_SCANNED',
    severity: 'CRITICAL',
    financial_impact_usd: 215.00,
    assigned_role: 'Materials Manager',
    assigned_to: 'materials_mgr@naplesasc.com',
    queue_status: 'ESCALATED',
    sla_due_at: new Date(Date.now() - 3600 * 1000).toISOString(),
    raw_payload_json: { sku: 'SKU-1003', lot: 'LOT-1902', expiration: '2026-01-15', surgery_date: '2026-02-24' },
    corrected_payload_json: null,
    resolution_notes: null,
    sha256_sync_seal: 'sha256_ieq_3e601bde2345678901abcdef2345678901abcdef2345678901abc',
    created_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString()
  },
  {
    id: 'ieq-exc-104',
    facility_id: NAPLES_FACILITY_ID,
    exception_ticket_code: 'EXC-2026-104',
    source_module: 'SIS_EHR',
    batch_control_number: 'SIS_SYNC_20260224_04',
    exception_code: 'ERR_CHRONOLOGY_INVERSION',
    exception_category: 'CHRONOLOGY_INVERSION',
    severity: 'CRITICAL',
    financial_impact_usd: 0.00,
    assigned_role: 'Clinical Nursing Director',
    assigned_to: 'nursing_dir@naplesasc.com',
    queue_status: 'OPEN',
    sla_due_at: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
    raw_payload_json: { case_id: 'CAS-20260224-008', room_in: '09:30', cut_time: '08:15' },
    corrected_payload_json: null,
    resolution_notes: null,
    sha256_sync_seal: 'sha256_ieq_4f712cef3456789012abcdef3456789012abcdef3456789012abc',
    created_at: new Date(Date.now() - 3600 * 1000).toISOString()
  },
  {
    id: 'ieq-exc-105',
    facility_id: NAPLES_FACILITY_ID,
    exception_ticket_code: 'EXC-2026-105',
    source_module: 'EXCEL_CSV',
    batch_control_number: 'CSV-IMP-20260222-01',
    exception_code: 'WARN_UNMAPPED_COLUMN',
    exception_category: 'SCHEMA_MAPPING',
    severity: 'MEDIUM',
    financial_impact_usd: 0.00,
    assigned_role: 'Data Operations Steward',
    assigned_to: 'data_steward@naplesasc.com',
    queue_status: 'RESOLVED_REPLAYED',
    sla_due_at: new Date(Date.now() + 10 * 3600 * 1000).toISOString(),
    raw_payload_json: { header: 'Payer_Plan_Cd' },
    corrected_payload_json: { mapped_to: 'primary_payer_code' },
    resolution_notes: 'Mapped Payer_Plan_Cd and replayed 18 staging rows cleanly.',
    sha256_sync_seal: 'sha256_ieq_5a823dfa4567890123abcdef4567890123abcdef4567890123abc',
    created_at: new Date(Date.now() - 72000 * 1000).toISOString(),
    resolved_at: new Date(Date.now() - 68000 * 1000).toISOString()
  }
];

const DEFAULT_ACTIONS = [
  {
    id: 'act-01',
    exception_id: 'ieq-exc-101',
    from_status: 'OPEN',
    to_status: 'IN_REVIEW',
    action_type: 'CLAIM',
    actor_id: 'materials_mgr@naplesasc.com',
    action_notes: 'Auto-routed via VENDOR_INVOICE rule; requested Vizient price sheet check.',
    created_at: new Date(Date.now() - 5400 * 1000).toISOString()
  },
  {
    id: 'act-02',
    exception_id: 'ieq-exc-103',
    from_status: 'ASSIGNED',
    to_status: 'ESCALATED',
    action_type: 'ESCALATE',
    actor_id: 'system_sla_monitor',
    action_notes: '4-hour CRITICAL SLA expired; escalated to Materials Manager & Clinical Director.',
    created_at: new Date(Date.now() - 3600 * 1000).toISOString()
  },
  {
    id: 'act-03',
    exception_id: 'ieq-exc-105',
    from_status: 'IN_REVIEW',
    to_status: 'RESOLVED_REPLAYED',
    action_type: 'REPLAY_SUCCESS',
    actor_id: 'data_steward@naplesasc.com',
    action_notes: 'Mapped Payer_Plan_Cd and replayed 18 staging rows cleanly.',
    created_at: new Date(Date.now() - 68000 * 1000).toISOString()
  }
];

const DEFAULT_REPLAY_BATCHES = [
  {
    id: 'rpl-01',
    facility_id: NAPLES_FACILITY_ID,
    replay_code: 'IEQ-RPL-20260222-01',
    source_module: 'EXCEL_CSV',
    tickets_replayed: 1,
    succeeded_count: 1,
    failed_count: 0,
    triggered_by: 'data_steward@naplesasc.com',
    sha256_sync_seal: 'sha256_ieq_6b934efa5678901234abcdef5678901234abcdef5678901234abc',
    executed_at: new Date(Date.now() - 68000 * 1000).toISOString()
  }
];

// In-memory state
let currentConfig = { ...DEFAULT_CONFIG };
let currentRoutes = [...DEFAULT_ROUTING_RULES];
let currentExceptions = [...DEFAULT_EXCEPTIONS];
let currentActions = [...DEFAULT_ACTIONS];
let currentReplays = [...DEFAULT_REPLAY_BATCHES];

export async function getIeqConfig(facilityInput) {
  const normId = normalizeFacilityId(facilityInput);
  return {
    ...currentConfig,
    facility_id: normId,
    client_secret_masked: maskIeqSecret(currentConfig.client_secret_encrypted)
  };
}

export async function updateIeqConfig(facilityInput, updates) {
  const normId = normalizeFacilityId(facilityInput);
  currentConfig = {
    ...currentConfig,
    ...updates,
    facility_id: normId,
    updated_at: new Date().toISOString()
  };
  return {
    ...currentConfig,
    client_secret_masked: maskIeqSecret(currentConfig.client_secret_encrypted)
  };
}

export async function getIeqRoutingRules(facilityInput) {
  normalizeFacilityId(facilityInput);
  return [...currentRoutes];
}

export async function getIeqExceptions(facilityInput) {
  normalizeFacilityId(facilityInput);
  return [...currentExceptions];
}

export async function getIeqResolutionActions(exceptionId) {
  if (!exceptionId) return [...currentActions];
  return currentActions.filter(a => a.exception_id === exceptionId);
}

export async function getIeqReplayBatches(facilityInput) {
  normalizeFacilityId(facilityInput);
  return [...currentReplays];
}

export async function getIeqOwnerWorkloads(facilityInput) {
  normalizeFacilityId(facilityInput);
  const grouped = {};

  for (const item of currentExceptions) {
    const email = item.assigned_to || 'unassigned@naplesasc.com';
    if (!grouped[email]) {
      grouped[email] = {
        role_name: item.assigned_role,
        assignee_email: email,
        open_tickets_count: 0,
        sla_breached_count: 0,
        avg_resolution_minutes: 36,
        resolved_mtd_count: 0
      };
    }

    if (['RESOLVED_REPLAYED', 'DISMISSED_SUPPRESSED'].includes(item.queue_status)) {
      grouped[email].resolved_mtd_count += 1;
    } else {
      grouped[email].open_tickets_count += 1;
      if (item.queue_status === 'ESCALATED' || new Date(item.sla_due_at).getTime() < Date.now()) {
        grouped[email].sla_breached_count += 1;
      }
    }
  }

  return Object.values(grouped);
}

export async function getIeqTelemetry(facilityInput) {
  const normId = normalizeFacilityId(facilityInput);
  const terminal = ['RESOLVED_REPLAYED', 'DISMISSED_SUPPRESSED'];

  const activeItems = currentExceptions.filter(i => !terminal.includes(i.queue_status));
  const escalatedCount = activeItems.filter(
    i => i.queue_status === 'ESCALATED' || new Date(i.sla_due_at).getTime() < Date.now()
  ).length;

  const exposureAtRiskUsd = activeItems.reduce((acc, i) => acc + Number(i.financial_impact_usd || 0), 0);
  const resolvedCount = currentExceptions.filter(i => i.queue_status === 'RESOLVED_REPLAYED').length;

  return {
    facility_id: normId,
    critical_sla_hours: currentConfig.critical_sla_hours,
    auto_assign_by_domain: currentConfig.auto_assign_by_domain,
    sync_status: currentConfig.sync_status,
    health_status: currentConfig.health_status,
    active_queue_count: activeItems.length,
    escalated_sla_count: escalatedCount,
    financial_impact_at_risk_usd: Number(exposureAtRiskUsd.toFixed(2)),
    resolved_replayed_count: resolvedCount,
    avg_resolution_minutes: 36,
    latest_sync_seal: currentReplays[0]?.sha256_sync_seal || 'sha256_ieq_none'
  };
}

/**
 * Reassigns an exception ticket to a designated role/user
 */
export async function assignIeqException(exceptionId, assigneeEmail, assignedRole, actorId = 'data_steward@naplesasc.com') {
  const exc = currentExceptions.find(e => e.id === exceptionId);
  if (!exc) return { success: false, message: 'Ticket not found' };

  const prevStatus = exc.queue_status;
  if (prevStatus === 'OPEN') {
    const check = validateQueueTransition(prevStatus, 'ASSIGNED');
    if (!check.isValid) throw new Error(check.message);
    exc.queue_status = 'ASSIGNED';
  }

  exc.assigned_to = assigneeEmail;
  if (assignedRole) exc.assigned_role = assignedRole;

  currentActions.unshift({
    id: `act-${Date.now()}`,
    exception_id: exc.id,
    from_status: prevStatus,
    to_status: exc.queue_status,
    action_type: 'REASSIGN',
    actor_id: actorId,
    action_notes: `Assigned to ${assigneeEmail} (${exc.assigned_role})`,
    created_at: new Date().toISOString()
  });

  return { success: true, exception: exc };
}

/**
 * Escalates an active ticket due to SLA breach or manual triage
 */
export async function escalateIeqException(exceptionId, reason = 'SLA breach risk escalation', actorId = 'data_steward@naplesasc.com') {
  const exc = currentExceptions.find(e => e.id === exceptionId);
  if (!exc) return { success: false, message: 'Ticket not found' };

  const prevStatus = exc.queue_status;
  const check = validateQueueTransition(prevStatus, 'ESCALATED', reason);
  if (!check.isValid) throw new Error(check.message);

  exc.queue_status = 'ESCALATED';
  currentActions.unshift({
    id: `act-${Date.now()}`,
    exception_id: exc.id,
    from_status: prevStatus,
    to_status: 'ESCALATED',
    action_type: 'ESCALATE',
    actor_id: actorId,
    action_notes: reason,
    created_at: new Date().toISOString()
  });

  return { success: true, exception: exc };
}

/**
 * Repairs payload and replays ticket into target pipeline with 64-char SHA-256 seal
 */
export async function resolveAndReplayIeqException(
  exceptionId,
  correctedPayload = {},
  resolutionNotes = 'Payload repaired and replayed cleanly',
  actorId = 'materials_mgr@naplesasc.com'
) {
  const exc = currentExceptions.find(e => e.id === exceptionId);
  if (!exc) return { success: false, message: 'Ticket not found' };

  const prevStatus = exc.queue_status;
  if (prevStatus === 'OPEN') {
    exc.queue_status = 'IN_REVIEW';
  }

  const check = validateQueueTransition(exc.queue_status, 'RESOLVED_REPLAYED', resolutionNotes);
  if (!check.isValid) throw new Error(check.message);

  const now = new Date();
  exc.corrected_payload_json = { ...exc.raw_payload_json, ...correctedPayload };
  exc.resolution_notes = resolutionNotes;
  exc.queue_status = 'RESOLVED_REPLAYED';
  exc.resolved_at = now.toISOString();
  exc.sha256_sync_seal = computeIeqProvenanceSeal(
    exc.facility_id,
    exc.exception_ticket_code,
    exc.source_module,
    'RESOLVED_REPLAYED',
    exc.financial_impact_usd
  );

  currentActions.unshift({
    id: `act-${Date.now()}`,
    exception_id: exc.id,
    from_status: prevStatus,
    to_status: 'RESOLVED_REPLAYED',
    action_type: 'REPLAY_SUCCESS',
    actor_id: actorId,
    action_notes: resolutionNotes,
    created_at: now.toISOString()
  });

  const replayCode = `IEQ-RPL-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${String(currentReplays.length + 1).padStart(2, '0')}`;
  const replaySeal = computeIeqProvenanceSeal(
    exc.facility_id,
    replayCode,
    exc.source_module,
    'COMMITTED',
    exc.financial_impact_usd
  );

  const replayBatch = {
    id: `rpl-${Date.now()}`,
    facility_id: exc.facility_id,
    replay_code: replayCode,
    source_module: exc.source_module,
    tickets_replayed: 1,
    succeeded_count: 1,
    failed_count: 0,
    triggered_by: actorId,
    sha256_sync_seal: replaySeal,
    executed_at: now.toISOString()
  };

  currentReplays.unshift(replayBatch);
  return { success: true, exception: exc, replayBatch };
}

/**
 * Dismisses / suppresses a ticket (strictly requires non-empty audit justification)
 */
export async function dismissIeqException(exceptionId, dismissalReason = '', actorId = 'data_steward@naplesasc.com') {
  const exc = currentExceptions.find(e => e.id === exceptionId);
  if (!exc) return { success: false, message: 'Ticket not found' };

  const prevStatus = exc.queue_status;
  if (prevStatus === 'OPEN') {
    exc.queue_status = 'IN_REVIEW';
  }

  const check = validateQueueTransition(exc.queue_status, 'DISMISSED_SUPPRESSED', dismissalReason);
  if (!check.isValid) throw new Error(check.message);

  exc.queue_status = 'DISMISSED_SUPPRESSED';
  exc.resolution_notes = dismissalReason;
  exc.resolved_at = new Date().toISOString();

  currentActions.unshift({
    id: `act-${Date.now()}`,
    exception_id: exc.id,
    from_status: prevStatus,
    to_status: 'DISMISSED_SUPPRESSED',
    action_type: 'DISMISS',
    actor_id: actorId,
    action_notes: dismissalReason,
    created_at: new Date().toISOString()
  });

  return { success: true, exception: exc };
}

export default {
  NAPLES_FACILITY_ID,
  CANONICAL_QUEUE_STATUSES,
  SEVERITY_SLA_HOURS,
  VALID_STATE_TRANSITIONS,
  normalizeFacilityId,
  computeIeqProvenanceSeal,
  maskIeqSecret,
  determineExceptionOwnerAndSla,
  validateQueueTransition,
  getIeqConfig,
  updateIeqConfig,
  getIeqTelemetry,
  getIeqRoutingRules,
  getIeqExceptions,
  getIeqResolutionActions,
  getIeqOwnerWorkloads,
  getIeqReplayBatches,
  assignIeqException,
  escalateIeqException,
  resolveAndReplayIeqException,
  dismissIeqException
};
