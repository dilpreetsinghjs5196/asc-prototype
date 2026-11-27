/**
 * ==============================================================================
 * Service: dailyAdminBriefService.js
 * Module 17: Enterprise Reporting & Executive Packages (Phase H1)
 * Description: Morning 06:00 AM Daily Administrator Brief Compiler,
 *              Deterministic OR & Margin KPI Engine, Readiness Classification,
 *              P0/P1 Action Blocker Triage, Admin Sign-Off, and H0 Dispatch.
 * ==============================================================================
 */

import crypto from 'crypto';

export const NAPLES_FACILITY_ID = '00000000-0000-0000-0000-000000000002';

export const CANONICAL_BRIEF_READINESS = [
  'GREEN_ON_TRACK',
  'AMBER_ATTENTION_REQUIRED',
  'RED_ACTION_CRITICAL'
];

export const CANONICAL_ACTION_PRIORITIES = [
  'P0_CRITICAL',
  'P1_HIGH',
  'P2_MEDIUM'
];

export const CANONICAL_ACTION_STATUSES = [
  'OPEN',
  'ACKNOWLEDGED',
  'RESOLVED',
  'DEFERRED'
];

export const CANONICAL_DOMAINS = [
  'OR_OPERATIONS',
  'CLINICAL_DOCUMENTATION',
  'REVENUE_CYCLE',
  'MATERIALS_IMPLANT',
  'DATA_QUALITY'
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
 * Computes an immutable 64-character SHA-256 provenance seal prefixed with `sha256_dab_`.
 */
export function computeDabProvenanceSeal(payload) {
  const canonicalJson = JSON.stringify(payload || {});
  const digest = crypto.createHash('sha256').update(canonicalJson).digest('hex');
  return `sha256_dab_${digest.slice(0, 53)}`;
}

/**
 * Masks brief engine secrets strictly as `dab_sec_****_...`.
 */
export function maskDabSecret(rawSecret) {
  if (!rawSecret) return 'dab_sec_****_unset';
  const str = String(rawSecret);
  if (str.startsWith('dab_sec_****_')) return str;
  return `dab_sec_****_${str.slice(-4)}`;
}

/**
 * Classifies Daily Admin Brief readiness status deterministically.
 */
export function evaluateBriefReadinessStatus(params = {}) {
  const {
    p0_critical_count = 0,
    dq_trust_score = 100.0,
    unbilled_hold_cases_count = 0,
    open_ieq_exceptions_count = 0,
    or_prime_time_util_pct = 80.0,
    prebill_hold_alert_limit = 3
  } = params;

  if (
    Number(p0_critical_count) > 0 ||
    Number(dq_trust_score) < 50.00 ||
    Number(unbilled_hold_cases_count) > Number(prebill_hold_alert_limit) * 2
  ) {
    return 'RED_ACTION_CRITICAL';
  }

  if (
    Number(unbilled_hold_cases_count) >= Number(prebill_hold_alert_limit) ||
    Number(open_ieq_exceptions_count) > 0 ||
    Number(or_prime_time_util_pct) < 70.00
  ) {
    return 'AMBER_ATTENTION_REQUIRED';
  }

  return 'GREEN_ON_TRACK';
}

/**
 * Computes deterministic operational & financial metrics for a daily brief
 * with divide-by-zero protection.
 */
export function computeDailyBriefMetrics(rawInputs = {}, config = {}) {
  const actualOrMinutes = Number(rawInputs.actual_or_minutes ?? 0);
  const availablePrimeMinutes = Number(rawInputs.available_prime_minutes ?? 0);
  const onTimeFirstCases = Number(rawInputs.on_time_first_cases ?? 0);
  const totalFirstCases = Number(rawInputs.total_first_cases ?? 0);

  const projectedNetRevenue = Number(rawInputs.projected_net_revenue_usd ?? 0);
  const directSuppliesCost = Number(rawInputs.direct_supplies_cost_usd ?? 0);
  const clinicalLaborCost = Number(rawInputs.clinical_labor_cost_usd ?? 0);

  const orUtilPct = availablePrimeMinutes > 0
    ? Number(Math.min(120, Math.max(0, (actualOrMinutes / availablePrimeMinutes) * 100)).toFixed(2))
    : 0.00;

  const fcotsRatePct = totalFirstCases > 0
    ? Number(Math.min(100, Math.max(0, (onTimeFirstCases / totalFirstCases) * 100)).toFixed(2))
    : 0.00;

  const projectedMargin = Number((projectedNetRevenue - directSuppliesCost - clinicalLaborCost).toFixed(2));

  const readinessStatus = evaluateBriefReadinessStatus({
    p0_critical_count: rawInputs.p0_critical_count ?? 0,
    dq_trust_score: rawInputs.dq_trust_score ?? 95.0,
    unbilled_hold_cases_count: rawInputs.unbilled_hold_cases_count ?? 0,
    open_ieq_exceptions_count: rawInputs.open_ieq_exceptions_count ?? 0,
    or_prime_time_util_pct: orUtilPct,
    prebill_hold_alert_limit: config.prebill_hold_alert_limit ?? 3
  });

  return {
    or_prime_time_util_pct: orUtilPct,
    fcots_on_time_rate_pct: fcotsRatePct,
    projected_net_revenue_usd: Number(projectedNetRevenue.toFixed(2)),
    projected_contribution_margin_usd: projectedMargin,
    readiness_status: readinessStatus
  };
}

// ==============================================================================
// Deterministic In-Memory Facility Store (Naples Surgery Center Seed)
// ==============================================================================

const facilityStateStore = new Map();

function buildInitialFacilityStore(facilityId) {
  const config = {
    id: 'h1000001-0000-4000-8000-000000000001',
    facility_id: facilityId,
    brief_cutoff_hour: 6,
    prebill_hold_alert_limit: 3,
    or_idle_alert_minutes: 45,
    include_cash_snapshot: true,
    include_dq_gate_status: true,
    client_secret_encrypted: 'dab_sec_****_naples_6014',
    sync_status: 'ACTIVE',
    health_status: 'HEALTHY',
    updated_at: '2026-11-27T06:00:00.000Z'
  };

  const snapId = 'snap-20261127';
  const snapshots = [
    {
      id: snapId,
      facility_id: facilityId,
      brief_code: 'DAB-20261127-NAP',
      brief_date: '2026-11-27',
      scheduled_cases_count: 22,
      completed_cases_count: 0,
      cancelled_cases_count: 1,
      or_prime_time_util_pct: 84.50,
      fcots_on_time_rate_pct: 80.00,
      avg_turnover_minutes: 19,
      projected_net_revenue_usd: 96400.00,
      projected_contribution_margin_usd: 52180.00,
      unbilled_hold_cases_count: 2,
      open_ieq_exceptions_count: 2,
      dq_trust_score: 94.80,
      readiness_status: 'RED_ACTION_CRITICAL',
      executive_headline: '22 cases scheduled across 5 suites ($52,180 est. margin); 1 P0 expired implant lot & 1 OR-3 anesthesia start risk.',
      generated_by: 'scheduler.bot@naplessurgery.com',
      sha256_brief_seal: computeDabProvenanceSeal({ brief_code: 'DAB-20261127-NAP', date: '2026-11-27' }),
      created_at: '2026-11-27T06:00:05.000Z'
    }
  ];

  const actionItems = [
    {
      id: 'dab-act-101',
      facility_id: facilityId,
      snapshot_id: snapId,
      action_code: 'DAB-ACT-101',
      priority_tier: 'P0_CRITICAL',
      domain: 'MATERIALS_IMPLANT',
      title: 'Quarantined SwiveLock Implant Lot Flagged for OR-2',
      detail_summary: 'SKU AR-2324BCM lot verification alert from Phase G3 IEQ ticket EXC-2026-103 before 08:30 AM case.',
      financial_impact_usd: 4250.00,
      owner_role: 'Materials Manager',
      assignee_email: 'materials_mgr@naplesasc.com',
      status: 'OPEN',
      acknowledged_by: null,
      resolution_note: null,
      updated_at: '2026-11-27T06:00:05.000Z'
    },
    {
      id: 'dab-act-102',
      facility_id: facilityId,
      snapshot_id: snapId,
      action_code: 'DAB-ACT-102',
      priority_tier: 'P1_HIGH',
      domain: 'CLINICAL_DOCUMENTATION',
      title: '2 Signed H&P / Consent Forms Missing for Afternoon Block',
      detail_summary: 'Orthopedic cases CAS-1127-14 and CAS-1127-17 require attending attestation prior to pre-op check-in.',
      financial_impact_usd: 6800.00,
      owner_role: 'Clinical Nursing Director',
      assignee_email: 'nursing_dir@naplesasc.com',
      status: 'OPEN',
      acknowledged_by: null,
      resolution_note: null,
      updated_at: '2026-11-27T06:00:05.000Z'
    },
    {
      id: 'dab-act-103',
      facility_id: facilityId,
      snapshot_id: snapId,
      action_code: 'DAB-ACT-103',
      priority_tier: 'P2_MEDIUM',
      domain: 'OR_OPERATIONS',
      title: 'OR-4 Backfill Opportunity (75 Min Open Prime Window)',
      detail_summary: 'Cancelled podiatry case opened 13:15–14:30 gap; push waitlist arthroscopy case to capture utilization.',
      financial_impact_usd: 2950.00,
      owner_role: 'OR Scheduler',
      assignee_email: 'or_scheduler@naplesasc.com',
      status: 'ACKNOWLEDGED',
      acknowledged_by: 'or_scheduler@naplesasc.com',
      resolution_note: 'Waitlist patient contacted for 13:15 slot.',
      updated_at: '2026-11-27T06:12:00.000Z'
    }
  ];

  const orSuitePulse = [
    { id: 'rm-1', facility_id: facilityId, snapshot_id: snapId, room_code: 'OR-01', specialty_primary: 'Orthopedic Surgery', scheduled_cases: 5, booked_minutes: 435, available_prime_minutes: 480, utilization_pct: 90.63, fcots_delay_minutes: 0, avg_turnover_minutes: 18, open_backfill_minutes: 45 },
    { id: 'rm-2', facility_id: facilityId, snapshot_id: snapId, room_code: 'OR-02', specialty_primary: 'Sports Medicine', scheduled_cases: 5, booked_minutes: 410, available_prime_minutes: 480, utilization_pct: 85.42, fcots_delay_minutes: 5, avg_turnover_minutes: 19, open_backfill_minutes: 70 },
    { id: 'rm-3', facility_id: facilityId, snapshot_id: snapId, room_code: 'OR-03', specialty_primary: 'Pain / Spine', scheduled_cases: 6, booked_minutes: 420, available_prime_minutes: 480, utilization_pct: 87.50, fcots_delay_minutes: 12, avg_turnover_minutes: 16, open_backfill_minutes: 60 },
    { id: 'rm-4', facility_id: facilityId, snapshot_id: snapId, room_code: 'OR-04', specialty_primary: 'Podiatry / General', scheduled_cases: 3, booked_minutes: 355, available_prime_minutes: 480, utilization_pct: 73.96, fcots_delay_minutes: 0, avg_turnover_minutes: 22, open_backfill_minutes: 125 },
    { id: 'rm-5', facility_id: facilityId, snapshot_id: snapId, room_code: 'OR-05', specialty_primary: 'Ophthalmology', scheduled_cases: 3, booked_minutes: 408, available_prime_minutes: 480, utilization_pct: 85.00, fcots_delay_minutes: 0, avg_turnover_minutes: 18, open_backfill_minutes: 72 }
  ];

  const surgeonRoster = [
    { id: 'sr-1', facility_id: facilityId, snapshot_id: snapId, surgeon_name: 'Dr. Malinoski Kelly', specialty: 'Orthopedic Surgery', scheduled_cases: 6, doc_hold_count: 0, implant_alert_count: 1, projected_margin_usd: 21450.00, readiness_flag: 'CRITICAL_MISSING' },
    { id: 'sr-2', facility_id: facilityId, snapshot_id: snapId, surgeon_name: 'Dr. Gardner Paul', specialty: 'Sports Medicine', scheduled_cases: 5, doc_hold_count: 1, implant_alert_count: 0, projected_margin_usd: 14820.00, readiness_flag: 'HOLD_WARNING' },
    { id: 'sr-3', facility_id: facilityId, snapshot_id: snapId, surgeon_name: 'Dr. Bonett Andrew', specialty: 'Pain / Spine', scheduled_cases: 6, doc_hold_count: 1, implant_alert_count: 0, projected_margin_usd: 9860.00, readiness_flag: 'HOLD_WARNING' },
    { id: 'sr-4', facility_id: facilityId, snapshot_id: snapId, surgeon_name: 'Dr. Walsh Mark', specialty: 'Ophthalmology', scheduled_cases: 5, doc_hold_count: 0, implant_alert_count: 0, projected_margin_usd: 6050.00, readiness_flag: 'CLEARED' }
  ];

  const acknowledgments = [
    {
      id: 'ack-01',
      facility_id: facilityId,
      snapshot_id: snapId,
      action_type: 'PUBLISH_BRIEF',
      actor_email: 'scheduler.bot@naplessurgery.com',
      actor_role: 'System H0 Scheduler',
      notes: 'Morning 06:00 AM automated compilation sealed from SIS_EHR, Case Completeness G1 & IEQ G3.',
      sha256_seal: computeDabProvenanceSeal({ action: 'PUBLISH_BRIEF', snapshot_id: snapId }),
      created_at: '2026-11-27T06:00:05.000Z'
    }
  ];

  const dispatchLogs = [
    {
      id: 'dsp-01',
      facility_id: facilityId,
      snapshot_id: snapId,
      rpt_execution_code: 'RPT-RUN-20261127-01',
      delivery_channel: 'EMAIL_DIGEST',
      export_format: 'PDF',
      recipient_count: 2,
      dispatch_status: 'DELIVERED',
      dispatched_by: 'scheduler.bot@naplessurgery.com',
      sha256_sync_seal: computeDabProvenanceSeal({ exec: 'RPT-RUN-20261127-01', snapshot_id: snapId }),
      created_at: '2026-11-27T06:00:10.000Z'
    }
  ];

  return {
    config,
    snapshots,
    actionItems,
    orSuitePulse,
    surgeonRoster,
    acknowledgments,
    dispatchLogs
  };
}

function ensureFacilityStore(facilityInput) {
  const facilityId = normalizeFacilityId(facilityInput);
  if (!facilityStateStore.has(facilityId)) {
    facilityStateStore.set(facilityId, buildInitialFacilityStore(facilityId));
  }
  return facilityStateStore.get(facilityId);
}

function recomputeSnapshotReadiness(store, snapshot) {
  const openP0Count = store.actionItems.filter(
    a => a.snapshot_id === snapshot.id &&
      a.priority_tier === 'P0_CRITICAL' &&
      (a.status === 'OPEN' || a.status === 'ACKNOWLEDGED')
  ).length;
  const openIeqAdjusted = openP0Count === 0 && snapshot.open_ieq_exceptions_count > 0
    ? 0
    : snapshot.open_ieq_exceptions_count;

  snapshot.readiness_status = evaluateBriefReadinessStatus({
    p0_critical_count: openP0Count,
    dq_trust_score: snapshot.dq_trust_score,
    unbilled_hold_cases_count: snapshot.unbilled_hold_cases_count,
    open_ieq_exceptions_count: openIeqAdjusted,
    or_prime_time_util_pct: snapshot.or_prime_time_util_pct,
    prebill_hold_alert_limit: store.config.prebill_hold_alert_limit
  });
}

// ==============================================================================
// Read / Query Functions
// ==============================================================================

export async function getDabConfig(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return {
    ...store.config,
    client_secret_encrypted: maskDabSecret(store.config.client_secret_encrypted)
  };
}

export async function updateDabConfig(facilityInput, updates = {}) {
  const store = ensureFacilityStore(facilityInput);
  const nextCutoff = Number(updates.brief_cutoff_hour ?? store.config.brief_cutoff_hour);
  const nextHoldLimit = Number(updates.prebill_hold_alert_limit ?? store.config.prebill_hold_alert_limit);

  if (!Number.isInteger(nextCutoff) || nextCutoff < 0 || nextCutoff > 23) {
    throw new Error('ERR_DAB_INVALID_CONFIG: brief_cutoff_hour must be an integer between 0 and 23');
  }
  if (!Number.isInteger(nextHoldLimit) || nextHoldLimit < 1) {
    throw new Error('ERR_DAB_INVALID_CONFIG: prebill_hold_alert_limit must be >= 1');
  }

  store.config = {
    ...store.config,
    brief_cutoff_hour: nextCutoff,
    prebill_hold_alert_limit: nextHoldLimit,
    or_idle_alert_minutes: Number(updates.or_idle_alert_minutes ?? store.config.or_idle_alert_minutes),
    include_cash_snapshot: updates.include_cash_snapshot ?? store.config.include_cash_snapshot,
    include_dq_gate_status: updates.include_dq_gate_status ?? store.config.include_dq_gate_status,
    updated_at: new Date().toISOString()
  };

  return getDabConfig(facilityInput);
}

export async function getDabTelemetry(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  const latest = store.snapshots[0];
  const openActions = store.actionItems.filter(a => a.status === 'OPEN' || a.status === 'ACKNOWLEDGED').length;

  return {
    facility_id: store.config.facility_id,
    brief_cutoff_hour: store.config.brief_cutoff_hour,
    latest_brief_code: latest ? latest.brief_code : null,
    latest_or_util_pct: latest ? latest.or_prime_time_util_pct : 0.00,
    latest_projected_margin_usd: latest ? latest.projected_contribution_margin_usd : 0.00,
    latest_readiness_status: latest ? latest.readiness_status : 'GREEN_ON_TRACK',
    open_action_count: openActions,
    latest_sync_seal: latest ? latest.sha256_brief_seal : computeDabProvenanceSeal(store.config),
    sync_status: store.config.sync_status,
    health_status: store.config.health_status
  };
}

export async function getDabDailySnapshots(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return [...store.snapshots];
}

export async function getDabActionItems(facilityInput, snapshotId = null) {
  const store = ensureFacilityStore(facilityInput);
  return snapshotId
    ? store.actionItems.filter(a => a.snapshot_id === snapshotId)
    : [...store.actionItems];
}

export async function getDabOrSuitePulse(facilityInput, snapshotId = null) {
  const store = ensureFacilityStore(facilityInput);
  return snapshotId
    ? store.orSuitePulse.filter(r => r.snapshot_id === snapshotId)
    : [...store.orSuitePulse];
}

export async function getDabSurgeonRoster(facilityInput, snapshotId = null) {
  const store = ensureFacilityStore(facilityInput);
  return snapshotId
    ? store.surgeonRoster.filter(s => s.snapshot_id === snapshotId)
    : [...store.surgeonRoster];
}

export async function getDabAcknowledgments(facilityInput, snapshotId = null) {
  const store = ensureFacilityStore(facilityInput);
  return snapshotId
    ? store.acknowledgments.filter(k => k.snapshot_id === snapshotId)
    : [...store.acknowledgments];
}

export async function getDabDispatchLogs(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return [...store.dispatchLogs];
}

// ==============================================================================
// Mutations (Compile Brief, Action Triage, Admin Sign-Off, H0 Dispatch)
// ==============================================================================

/**
 * Compiles a new deterministic Daily Admin Brief edition from operational telemetry.
 */
export async function compileDailyAdminBrief(facilityInput, payload = {}) {
  const store = ensureFacilityStore(facilityInput);
  const briefDate = payload.brief_date || '2026-11-28';
  const actorEmail = payload.actor_email || 'admin@naplessurgery.com';
  const opInputs = payload.operational_inputs || {
    actual_or_minutes: 1980,
    available_prime_minutes: 2400,
    on_time_first_cases: 5,
    total_first_cases: 5,
    projected_net_revenue_usd: 102500.00,
    direct_supplies_cost_usd: 31200.00,
    clinical_labor_cost_usd: 14800.00,
    p0_critical_count: 0,
    dq_trust_score: 96.40,
    unbilled_hold_cases_count: 1,
    open_ieq_exceptions_count: 0
  };

  const metrics = computeDailyBriefMetrics(opInputs, store.config);
  const now = new Date().toISOString();
  const snapId = `snap-${briefDate.replace(/-/g, '')}-${Date.now().toString().slice(-3)}`;
  const briefCode = `DAB-${briefDate.replace(/-/g, '')}-NAP`;
  const seal = computeDabProvenanceSeal({
    facility_id: store.config.facility_id,
    briefCode,
    briefDate,
    metrics,
    actorEmail,
    now
  });

  const newSnapshot = {
    id: snapId,
    facility_id: store.config.facility_id,
    brief_code: briefCode,
    brief_date: briefDate,
    scheduled_cases_count: Number(opInputs.scheduled_cases_count ?? 24),
    completed_cases_count: Number(opInputs.completed_cases_count ?? 0),
    cancelled_cases_count: Number(opInputs.cancelled_cases_count ?? 0),
    or_prime_time_util_pct: metrics.or_prime_time_util_pct,
    fcots_on_time_rate_pct: metrics.fcots_on_time_rate_pct,
    avg_turnover_minutes: Number(opInputs.avg_turnover_minutes ?? 17),
    projected_net_revenue_usd: metrics.projected_net_revenue_usd,
    projected_contribution_margin_usd: metrics.projected_contribution_margin_usd,
    unbilled_hold_cases_count: Number(opInputs.unbilled_hold_cases_count ?? 1),
    open_ieq_exceptions_count: Number(opInputs.open_ieq_exceptions_count ?? 0),
    dq_trust_score: Number(opInputs.dq_trust_score ?? 96.40),
    readiness_status: metrics.readiness_status,
    executive_headline: opInputs.executive_headline || `${Number(opInputs.scheduled_cases_count ?? 24)} cases compiled (${metrics.or_prime_time_util_pct}% prime util, $${metrics.projected_contribution_margin_usd.toLocaleString('en-US')} est. margin).`,
    generated_by: actorEmail,
    sha256_brief_seal: seal,
    created_at: now
  };

  store.snapshots.unshift(newSnapshot);
  store.acknowledgments.unshift({
    id: `ack-${Date.now()}`,
    facility_id: store.config.facility_id,
    snapshot_id: snapId,
    action_type: 'PUBLISH_BRIEF',
    actor_email: actorEmail,
    actor_role: 'Facility Administrator',
    notes: `Compiled deterministic Daily Admin Brief for ${briefDate} (${metrics.readiness_status})`,
    sha256_seal: seal,
    created_at: now
  });

  return { ...newSnapshot };
}

/**
 * Transitions an Admin Brief action blocker and dynamically recalculates snapshot readiness.
 */
export async function updateDabActionStatus(facilityInput, actionId, options = {}) {
  const store = ensureFacilityStore(facilityInput);
  const action = store.actionItems.find(a => a.id === actionId || a.action_code === actionId);
  if (!action) {
    throw new Error(`ERR_DAB_ACTION_NOT_FOUND: Action "${actionId}" not found`);
  }

  const nextStatus = options.status;
  if (!CANONICAL_ACTION_STATUSES.includes(nextStatus)) {
    throw new Error(`ERR_DAB_INVALID_STATUS: Unknown action status "${nextStatus}"`);
  }

  const note = String(options.resolution_note || '').trim();
  if ((nextStatus === 'RESOLVED' || nextStatus === 'DEFERRED') && note.length < 5) {
    throw new Error('ERR_DAB_NOTE_REQUIRED: Resolving or deferring a blocker requires a reason (>=5 chars)');
  }

  const actorEmail = options.actor_email || 'admin@naplessurgery.com';
  const actorRole = options.actor_role || 'Facility Administrator';
  const now = new Date().toISOString();

  action.status = nextStatus;
  if (nextStatus === 'ACKNOWLEDGED' || nextStatus === 'RESOLVED') {
    action.acknowledged_by = actorEmail;
  }
  if (note) action.resolution_note = note;
  action.updated_at = now;

  const parentSnap = store.snapshots.find(s => s.id === action.snapshot_id);
  if (parentSnap) {
    recomputeSnapshotReadiness(store, parentSnap);
    parentSnap.sha256_brief_seal = computeDabProvenanceSeal({
      brief_code: parentSnap.brief_code,
      readiness_status: parentSnap.readiness_status,
      updated_action: action.action_code,
      now
    });
  }

  const ackEntry = {
    id: `ack-${Date.now()}`,
    facility_id: store.config.facility_id,
    snapshot_id: action.snapshot_id,
    action_type: 'ACTION_RESOLVE',
    actor_email: actorEmail,
    actor_role: actorRole,
    notes: `${action.action_code} -> ${nextStatus}: ${note || 'Acknowledged'}`,
    sha256_seal: computeDabProvenanceSeal({ action_code: action.action_code, nextStatus, note, now }),
    created_at: now
  };
  store.acknowledgments.unshift(ackEntry);

  return {
    action: { ...action },
    snapshot_readiness: parentSnap ? parentSnap.readiness_status : null,
    acknowledgment: ackEntry
  };
}

/**
 * Records formal morning administrator sign-off on a compiled daily brief edition.
 */
export async function signOffDailyBrief(facilityInput, snapshotId, options = {}) {
  const store = ensureFacilityStore(facilityInput);
  const snap = store.snapshots.find(s => s.id === snapshotId || s.brief_code === snapshotId);
  if (!snap) {
    throw new Error(`ERR_DAB_SNAPSHOT_NOT_FOUND: Brief snapshot "${snapshotId}" not found`);
  }

  const actorEmail = options.actor_email || 'admin@naplessurgery.com';
  const actorRole = options.actor_role || 'Facility Administrator';
  const notes = String(options.notes || 'Daily morning huddle reviewed & acknowledged').trim();
  const now = new Date().toISOString();
  const seal = computeDabProvenanceSeal({ snapshot_id: snap.id, action: 'ADMIN_SIGN_OFF', actorEmail, notes, now });

  const ackEntry = {
    id: `ack-${Date.now()}`,
    facility_id: store.config.facility_id,
    snapshot_id: snap.id,
    action_type: 'ADMIN_SIGN_OFF',
    actor_email: actorEmail,
    actor_role: actorRole,
    notes,
    sha256_seal: seal,
    created_at: now
  };
  store.acknowledgments.unshift(ackEntry);
  return ackEntry;
}

/**
 * Dispatches the Daily Admin Brief via Phase H0 (`RPT-H1-DAILY-BRIEF`) and logs SHA-256 receipt.
 */
export async function dispatchDailyBriefDigest(facilityInput, snapshotId, options = {}) {
  const store = ensureFacilityStore(facilityInput);
  const snap = store.snapshots.find(s => s.id === snapshotId || s.brief_code === snapshotId);
  if (!snap) {
    throw new Error(`ERR_DAB_SNAPSHOT_NOT_FOUND: Brief snapshot "${snapshotId}" not found`);
  }

  const now = new Date().toISOString();
  const execCode = `RPT-RUN-${Date.now()}`;
  const seal = computeDabProvenanceSeal({
    snapshot_id: snap.id,
    execCode,
    channel: options.delivery_channel || 'EMAIL_DIGEST',
    now
  });

  const log = {
    id: `dsp-${Date.now()}`,
    facility_id: store.config.facility_id,
    snapshot_id: snap.id,
    rpt_execution_code: execCode,
    delivery_channel: options.delivery_channel || 'EMAIL_DIGEST',
    export_format: options.export_format || 'PDF',
    recipient_count: Number(options.recipient_count ?? 3),
    dispatch_status: 'DELIVERED',
    dispatched_by: options.actor_email || 'admin@naplessurgery.com',
    sha256_sync_seal: seal,
    created_at: now
  };
  store.dispatchLogs.unshift(log);
  return log;
}

export default {
  NAPLES_FACILITY_ID,
  CANONICAL_BRIEF_READINESS,
  CANONICAL_ACTION_PRIORITIES,
  CANONICAL_ACTION_STATUSES,
  CANONICAL_DOMAINS,
  normalizeFacilityId,
  computeDabProvenanceSeal,
  maskDabSecret,
  evaluateBriefReadinessStatus,
  computeDailyBriefMetrics,
  getDabConfig,
  updateDabConfig,
  getDabTelemetry,
  getDabDailySnapshots,
  getDabActionItems,
  getDabOrSuitePulse,
  getDabSurgeonRoster,
  getDabAcknowledgments,
  getDabDispatchLogs,
  compileDailyAdminBrief,
  updateDabActionStatus,
  signOffDailyBrief,
  dispatchDailyBriefDigest
};
