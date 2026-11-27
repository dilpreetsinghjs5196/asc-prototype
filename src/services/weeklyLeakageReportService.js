/**
 * ==============================================================================
 * Service: weeklyLeakageReportService.js
 * Module 17: Enterprise Reporting & Executive Packages (Phase H2)
 * Description: Weekly Revenue Leakage & Prioritized Recovery Report Compiler,
 *              Expected Net Recovery & Urgency Ranking Engine, Category & Payer
 *              Decomposition, Recovery Workflow & Payout Tracking, and SHA-256 Seals.
 * ==============================================================================
 */

import { sha256Hex } from '../utils/isomorphicSha256.js';

export const NAPLES_FACILITY_ID = '00000000-0000-0000-0000-000000000002';

export const CANONICAL_LEAKAGE_CATEGORIES = [
  'UNBILLED_CASE',
  'PAYER_UNDERPAYMENT',
  'IMPLANT_CARVEOUT',
  'MODIFIER_OMISSION',
  'DENIAL_TIMELY_FILING'
];

export const CANONICAL_PRIORITY_TIERS = [
  'P0_IMMEDIATE',
  'P1_THIS_WEEK',
  'P2_STANDARD'
];

export const CANONICAL_OPPORTUNITY_STATUSES = [
  'OPEN',
  'IN_RECOVERY',
  'SUBMITTED_PAYER',
  'RECOVERED',
  'WRITTEN_OFF'
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
 * Computes an immutable 64-character SHA-256 provenance seal prefixed with `sha256_wlr_`.
 */
export function computeWlrProvenanceSeal(payload) {
  const canonicalJson = JSON.stringify(payload || {});
  const digest = sha256Hex(canonicalJson);
  return `sha256_wlr_${digest.slice(0, 53)}`;
}

/**
 * Masks leakage report secrets strictly as `wlr_sec_****_...`.
 */
export function maskWlrSecret(rawSecret) {
  if (!rawSecret) return 'wlr_sec_****_unset';
  const str = String(rawSecret);
  if (str.startsWith('wlr_sec_****_')) return str;
  return `wlr_sec_****_${str.slice(-4)}`;
}

/**
 * Deterministically computes expected net recovery from gross leakage & probability.
 */
export function computeExpectedNetRecovery(grossLeakageUsd, recoveryProbabilityPct) {
  const gross = Math.max(0, Number(grossLeakageUsd || 0));
  const prob = Math.min(100, Math.max(0, Number(recoveryProbabilityPct || 0)));
  return Number((gross * (prob / 100)).toFixed(2));
}

/**
 * Deterministically scores and classifies a recovery opportunity by expected recovery
 * and remaining payer timely-filing window.
 */
export function scoreAndRankRecoveryOpportunity(item = {}) {
  const gross = Math.max(0, Number(item.gross_leakage_usd || 0));
  const prob = Math.min(100, Math.max(0, Number(item.recovery_probability_pct ?? 75)));
  const days = Math.max(0, Number(item.days_to_timely_filing_limit ?? 45));

  const expectedNet = computeExpectedNetRecovery(gross, prob);
  const urgencyMultiplier = days <= 14 ? 1.50 : days <= 30 ? 1.25 : 1.00;
  const priorityScore = Number((expectedNet * urgencyMultiplier).toFixed(2));

  let priorityTier = 'P2_STANDARD';
  if (days <= 14 || expectedNet >= 3000.00) {
    priorityTier = 'P0_IMMEDIATE';
  } else if (expectedNet >= 750.00) {
    priorityTier = 'P1_THIS_WEEK';
  }

  return {
    ...item,
    gross_leakage_usd: Number(gross.toFixed(2)),
    recovery_probability_pct: Number(prob.toFixed(2)),
    expected_net_recovery_usd: expectedNet,
    days_to_timely_filing_limit: days,
    priority_score: priorityScore,
    priority_tier: priorityTier
  };
}

// ==============================================================================
// Deterministic In-Memory Facility Store (Naples Surgery Center Seed)
// ==============================================================================

const facilityStateStore = new Map();

function buildInitialFacilityStore(facilityId) {
  const config = {
    id: 'h2000001-0000-4000-8000-000000000001',
    facility_id: facilityId,
    week_start_day: 'MONDAY',
    materiality_threshold_usd: 250.00,
    auto_rank_by: 'EXPECTED_NET_RECOVERY',
    include_unbilled_cases: true,
    include_implant_carveouts: true,
    include_payer_underpayments: true,
    client_secret_encrypted: 'wlr_sec_****_naples_7022',
    sync_status: 'ACTIVE',
    health_status: 'HEALTHY',
    updated_at: '2026-11-27T07:00:00.000Z'
  };

  const edId = 'wlr-ed-w48';
  const editions = [
    {
      id: edId,
      facility_id: facilityId,
      week_code: 'WLR-2026-W48',
      week_start_date: '2026-11-23',
      week_end_date: '2026-11-29',
      total_identified_leakage_usd: 46820.00,
      expected_net_recovery_usd: 36914.50,
      realized_recovered_wow_usd: 12450.00,
      wow_leakage_delta_pct: -8.40,
      unbilled_exposure_usd: 14200.00,
      underpayment_exposure_usd: 16840.00,
      implant_carveout_exposure_usd: 9450.00,
      modifier_omission_exposure_usd: 3480.00,
      timely_filing_risk_usd: 2850.00,
      open_opportunities_count: 5,
      edition_status: 'PUBLISHED',
      compiled_by: 'scheduler.bot@naplessurgery.com',
      sha256_report_seal: computeWlrProvenanceSeal({ week_code: 'WLR-2026-W48', total: 46820.00 }),
      created_at: '2026-11-27T07:00:05.000Z'
    }
  ];

  const opportunities = [
    {
      id: 'wlr-opp-402',
      facility_id: facilityId,
      edition_id: edId,
      opportunity_code: 'WLR-OPP-402',
      leakage_category: 'PAYER_UNDERPAYMENT',
      source_module: 'EDI_835',
      payer_name: 'Florida Blue',
      surgeon_name: 'Dr. Gardner Paul',
      case_or_claim_ref: 'CLM-835-99102',
      gross_leakage_usd: 16840.00,
      recovery_probability_pct: 78.00,
      expected_net_recovery_usd: 13135.20,
      days_to_timely_filing_limit: 11,
      priority_score: 19702.80,
      priority_tier: 'P0_IMMEDIATE',
      owner_role: 'CFO / Finance Director',
      assignee_email: 'cfo@naplesasc.com',
      status: 'IN_RECOVERY',
      recovered_usd: 0.00,
      resolution_note: null,
      updated_at: '2026-11-27T07:00:05.000Z'
    },
    {
      id: 'wlr-opp-401',
      facility_id: facilityId,
      edition_id: edId,
      opportunity_code: 'WLR-OPP-401',
      leakage_category: 'UNBILLED_CASE',
      source_module: 'UNBILLED_CASES',
      payer_name: 'UnitedHealthcare',
      surgeon_name: 'Dr. Malinoski Kelly',
      case_or_claim_ref: 'CAS-20261119-08',
      gross_leakage_usd: 14200.00,
      recovery_probability_pct: 92.00,
      expected_net_recovery_usd: 13064.00,
      days_to_timely_filing_limit: 18,
      priority_score: 16330.00,
      priority_tier: 'P0_IMMEDIATE',
      owner_role: 'RCM Billing Lead',
      assignee_email: 'rcm_lead@naplesasc.com',
      status: 'OPEN',
      recovered_usd: 0.00,
      resolution_note: null,
      updated_at: '2026-11-27T07:00:05.000Z'
    },
    {
      id: 'wlr-opp-403',
      facility_id: facilityId,
      edition_id: edId,
      opportunity_code: 'WLR-OPP-403',
      leakage_category: 'IMPLANT_CARVEOUT',
      source_module: 'IMPLANT_CARVEOUT',
      payer_name: 'Aetna',
      surgeon_name: 'Dr. Malinoski Kelly',
      case_or_claim_ref: 'CLM-IMP-44210',
      gross_leakage_usd: 9450.00,
      recovery_probability_pct: 75.00,
      expected_net_recovery_usd: 7087.50,
      days_to_timely_filing_limit: 26,
      priority_score: 8859.38,
      priority_tier: 'P0_IMMEDIATE',
      owner_role: 'Materials Manager',
      assignee_email: 'materials_mgr@naplesasc.com',
      status: 'OPEN',
      recovered_usd: 0.00,
      resolution_note: null,
      updated_at: '2026-11-27T07:00:05.000Z'
    },
    {
      id: 'wlr-opp-404',
      facility_id: facilityId,
      edition_id: edId,
      opportunity_code: 'WLR-OPP-404',
      leakage_category: 'MODIFIER_OMISSION',
      source_module: 'REVENUE_LEAKAGE',
      payer_name: 'Medicare',
      surgeon_name: 'Dr. Bonett Andrew',
      case_or_claim_ref: 'CLM-M59-77219',
      gross_leakage_usd: 3480.00,
      recovery_probability_pct: 70.00,
      expected_net_recovery_usd: 2436.00,
      days_to_timely_filing_limit: 42,
      priority_score: 2436.00,
      priority_tier: 'P1_THIS_WEEK',
      owner_role: 'RCM Billing Lead',
      assignee_email: 'rcm_lead@naplesasc.com',
      status: 'OPEN',
      recovered_usd: 0.00,
      resolution_note: null,
      updated_at: '2026-11-27T07:00:05.000Z'
    },
    {
      id: 'wlr-opp-405',
      facility_id: facilityId,
      edition_id: edId,
      opportunity_code: 'WLR-OPP-405',
      leakage_category: 'DENIAL_TIMELY_FILING',
      source_module: 'DENIALS_MODEL',
      payer_name: 'UnitedHealthcare',
      surgeon_name: 'Dr. Walsh Mark',
      case_or_claim_ref: 'CLM-DNL-33108',
      gross_leakage_usd: 2850.00,
      recovery_probability_pct: 41.82,
      expected_net_recovery_usd: 1191.80,
      days_to_timely_filing_limit: 9,
      priority_score: 1787.70,
      priority_tier: 'P0_IMMEDIATE',
      owner_role: 'RCM Billing Lead',
      assignee_email: 'rcm_lead@naplesasc.com',
      status: 'OPEN',
      recovered_usd: 0.00,
      resolution_note: null,
      updated_at: '2026-11-27T07:00:05.000Z'
    }
  ];

  const categoryBreakdown = [
    { id: 'cat-1', facility_id: facilityId, edition_id: edId, leakage_category: 'UNBILLED_CASE', item_count: 1, gross_leakage_usd: 14200.00, expected_net_recovery_usd: 13064.00, wow_change_pct: -12.50 },
    { id: 'cat-2', facility_id: facilityId, edition_id: edId, leakage_category: 'PAYER_UNDERPAYMENT', item_count: 1, gross_leakage_usd: 16840.00, expected_net_recovery_usd: 13135.20, wow_change_pct: -6.20 },
    { id: 'cat-3', facility_id: facilityId, edition_id: edId, leakage_category: 'IMPLANT_CARVEOUT', item_count: 1, gross_leakage_usd: 9450.00, expected_net_recovery_usd: 7087.50, wow_change_pct: -4.10 },
    { id: 'cat-4', facility_id: facilityId, edition_id: edId, leakage_category: 'MODIFIER_OMISSION', item_count: 1, gross_leakage_usd: 3480.00, expected_net_recovery_usd: 2436.00, wow_change_pct: 2.00 },
    { id: 'cat-5', facility_id: facilityId, edition_id: edId, leakage_category: 'DENIAL_TIMELY_FILING', item_count: 1, gross_leakage_usd: 2850.00, expected_net_recovery_usd: 1191.80, wow_change_pct: -15.00 }
  ];

  const payerSummary = [
    { id: 'pay-1', facility_id: facilityId, edition_id: edId, payer_name: 'UnitedHealthcare', item_count: 2, gross_leakage_usd: 17050.00, expected_net_recovery_usd: 14255.80, min_timely_filing_days: 9 },
    { id: 'pay-2', facility_id: facilityId, edition_id: edId, payer_name: 'Florida Blue', item_count: 1, gross_leakage_usd: 16840.00, expected_net_recovery_usd: 13135.20, min_timely_filing_days: 11 },
    { id: 'pay-3', facility_id: facilityId, edition_id: edId, payer_name: 'Aetna', item_count: 1, gross_leakage_usd: 9450.00, expected_net_recovery_usd: 7087.50, min_timely_filing_days: 26 },
    { id: 'pay-4', facility_id: facilityId, edition_id: edId, payer_name: 'Medicare', item_count: 1, gross_leakage_usd: 3480.00, expected_net_recovery_usd: 2436.00, min_timely_filing_days: 42 }
  ];

  const weeklyActions = [
    {
      id: 'wact-01',
      facility_id: facilityId,
      edition_id: edId,
      opportunity_id: null,
      action_type: 'EDITION_PUBLISHED',
      actor_email: 'scheduler.bot@naplessurgery.com',
      actor_role: 'System H0 Scheduler',
      recovered_amount_usd: 12450.00,
      notes: 'Compiled Monday W48 Revenue Leakage & Recovery Dossier ($36,914.50 expected net recovery).',
      sha256_seal: computeWlrProvenanceSeal({ action: 'EDITION_PUBLISHED', week_code: 'WLR-2026-W48' }),
      created_at: '2026-11-27T07:00:05.000Z'
    }
  ];

  const dispatchLogs = [
    {
      id: 'wdsp-01',
      facility_id: facilityId,
      edition_id: edId,
      rpt_execution_code: 'RPT-H2-RUN-W48-01',
      delivery_channel: 'PORTAL_INBOX',
      export_format: 'XLSX',
      recipient_count: 2,
      dispatch_status: 'DELIVERED',
      dispatched_by: 'scheduler.bot@naplessurgery.com',
      sha256_sync_seal: computeWlrProvenanceSeal({ exec: 'RPT-H2-RUN-W48-01', edition_id: edId }),
      created_at: '2026-11-27T07:00:10.000Z'
    }
  ];

  return {
    config,
    editions,
    opportunities,
    categoryBreakdown,
    payerSummary,
    weeklyActions,
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

// ==============================================================================
// Read / Query Functions
// ==============================================================================

export async function getWlrConfig(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return {
    ...store.config,
    client_secret_encrypted: maskWlrSecret(store.config.client_secret_encrypted)
  };
}

export async function updateWlrConfig(facilityInput, updates = {}) {
  const store = ensureFacilityStore(facilityInput);
  const nextMat = Number(updates.materiality_threshold_usd ?? store.config.materiality_threshold_usd);
  if (!Number.isFinite(nextMat) || nextMat < 0) {
    throw new Error('ERR_WLR_INVALID_CONFIG: materiality_threshold_usd must be >= 0');
  }

  store.config = {
    ...store.config,
    materiality_threshold_usd: Number(nextMat.toFixed(2)),
    auto_rank_by: updates.auto_rank_by ?? store.config.auto_rank_by,
    include_unbilled_cases: updates.include_unbilled_cases ?? store.config.include_unbilled_cases,
    include_implant_carveouts: updates.include_implant_carveouts ?? store.config.include_implant_carveouts,
    include_payer_underpayments: updates.include_payer_underpayments ?? store.config.include_payer_underpayments,
    updated_at: new Date().toISOString()
  };

  return getWlrConfig(facilityInput);
}

export async function getWlrTelemetry(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  const latest = store.editions[0];
  const openP0 = store.opportunities.filter(
    o => o.priority_tier === 'P0_IMMEDIATE' && o.status !== 'RECOVERED' && o.status !== 'WRITTEN_OFF'
  ).length;

  return {
    facility_id: store.config.facility_id,
    materiality_threshold_usd: store.config.materiality_threshold_usd,
    latest_week_code: latest ? latest.week_code : null,
    latest_gross_leakage_usd: latest ? latest.total_identified_leakage_usd : 0.00,
    latest_expected_recovery_usd: latest ? latest.expected_net_recovery_usd : 0.00,
    latest_realized_recovered_usd: latest ? latest.realized_recovered_wow_usd : 0.00,
    open_p0_count: openP0,
    latest_sync_seal: latest ? latest.sha256_report_seal : computeWlrProvenanceSeal(store.config),
    sync_status: store.config.sync_status,
    health_status: store.config.health_status
  };
}

export async function getWlrEditions(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return [...store.editions];
}

export async function getWlrPriorityOpportunities(facilityInput, filters = {}) {
  const store = ensureFacilityStore(facilityInput);
  let res = [...store.opportunities];
  if (filters.edition_id) res = res.filter(o => o.edition_id === filters.edition_id);
  if (filters.leakage_category && filters.leakage_category !== 'ALL') {
    res = res.filter(o => o.leakage_category === filters.leakage_category);
  }
  if (filters.status && filters.status !== 'ALL') {
    res = res.filter(o => o.status === filters.status);
  }
  return res.sort((a, b) => Number(b.priority_score) - Number(a.priority_score));
}

export async function getWlrCategoryBreakdown(facilityInput, editionId = null) {
  const store = ensureFacilityStore(facilityInput);
  return editionId
    ? store.categoryBreakdown.filter(c => c.edition_id === editionId)
    : [...store.categoryBreakdown];
}

export async function getWlrPayerSummary(facilityInput, editionId = null) {
  const store = ensureFacilityStore(facilityInput);
  return editionId
    ? store.payerSummary.filter(p => p.edition_id === editionId)
    : [...store.payerSummary];
}

export async function getWlrWeeklyActions(facilityInput, editionId = null) {
  const store = ensureFacilityStore(facilityInput);
  return editionId
    ? store.weeklyActions.filter(a => a.edition_id === editionId)
    : [...store.weeklyActions];
}

export async function getWlrDispatchLogs(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return [...store.dispatchLogs];
}

// ==============================================================================
// Mutations (Compile Weekly Edition, Update Recovery, Dispatch H0 Digest)
// ==============================================================================

/**
 * Compiles a new Weekly Revenue Leakage edition, scoring & ranking all eligible
 * items above materiality floor and conserving category/payer sums cleanly.
 */
export async function compileWeeklyLeakageReport(facilityInput, payload = {}) {
  const store = ensureFacilityStore(facilityInput);
  const weekCode = payload.week_code || `WLR-2026-W${49 + store.editions.length - 1}`;
  const weekStart = payload.week_start_date || '2026-11-30';
  const weekEnd = payload.week_end_date || '2026-12-06';

  if (Date.parse(weekStart) > Date.parse(weekEnd)) {
    throw new Error(`ERR_WLR_INVALID_WEEK: week_start_date (${weekStart}) cannot exceed week_end_date (${weekEnd})`);
  }

  const actorEmail = payload.actor_email || 'cfo@naplessurgery.com';
  const priorGross = Number(payload.prior_week_leakage_usd ?? (store.editions[0]?.total_identified_leakage_usd || 46820.00));
  const rawItems = payload.opportunities_input || [
    {
      opportunity_code: `WLR-OPP-${Date.now().toString().slice(-3)}1`,
      leakage_category: 'PAYER_UNDERPAYMENT',
      source_module: 'EDI_835',
      payer_name: 'Florida Blue',
      surgeon_name: 'Dr. Gardner Paul',
      case_or_claim_ref: 'CLM-835-99401',
      gross_leakage_usd: 11200.00,
      recovery_probability_pct: 82.00,
      days_to_timely_filing_limit: 12,
      owner_role: 'RCM Billing Lead',
      assignee_email: 'rcm_lead@naplesasc.com'
    },
    {
      opportunity_code: `WLR-OPP-${Date.now().toString().slice(-3)}2`,
      leakage_category: 'UNBILLED_CASE',
      source_module: 'UNBILLED_CASES',
      payer_name: 'UnitedHealthcare',
      surgeon_name: 'Dr. Malinoski Kelly',
      case_or_claim_ref: 'CAS-20261125-19',
      gross_leakage_usd: 15600.00,
      recovery_probability_pct: 90.00,
      days_to_timely_filing_limit: 20,
      owner_role: 'RCM Billing Lead',
      assignee_email: 'rcm_lead@naplesasc.com'
    }
  ];

  const editionId = `wlr-ed-${Date.now()}`;
  const now = new Date().toISOString();

  const scoredItems = rawItems
    .filter(item => Number(item.gross_leakage_usd || 0) >= Number(store.config.materiality_threshold_usd))
    .map((item, idx) => ({
      id: `wlr-opp-${Date.now()}-${idx}`,
      facility_id: store.config.facility_id,
      edition_id: editionId,
      status: 'OPEN',
      recovered_usd: 0.00,
      resolution_note: null,
      updated_at: now,
      ...scoreAndRankRecoveryOpportunity(item)
    }))
    .sort((a, b) => Number(b.priority_score) - Number(a.priority_score));

  const sumField = (fn) => Number(scoredItems.reduce((s, x) => s + fn(x), 0).toFixed(2));
  const totalGross = sumField(x => x.gross_leakage_usd);
  const totalExpected = sumField(x => x.expected_net_recovery_usd);
  const wowDelta = priorGross > 0
    ? Number((((totalGross - priorGross) / priorGross) * 100).toFixed(2))
    : 0.00;

  const byCat = (cat) => sumField(x => (x.leakage_category === cat ? x.gross_leakage_usd : 0));

  const seal = computeWlrProvenanceSeal({
    facility_id: store.config.facility_id,
    weekCode,
    totalGross,
    totalExpected,
    now
  });

  const newEdition = {
    id: editionId,
    facility_id: store.config.facility_id,
    week_code: weekCode,
    week_start_date: weekStart,
    week_end_date: weekEnd,
    total_identified_leakage_usd: totalGross,
    expected_net_recovery_usd: totalExpected,
    realized_recovered_wow_usd: 0.00,
    wow_leakage_delta_pct: wowDelta,
    unbilled_exposure_usd: byCat('UNBILLED_CASE'),
    underpayment_exposure_usd: byCat('PAYER_UNDERPAYMENT'),
    implant_carveout_exposure_usd: byCat('IMPLANT_CARVEOUT'),
    modifier_omission_exposure_usd: byCat('MODIFIER_OMISSION'),
    timely_filing_risk_usd: byCat('DENIAL_TIMELY_FILING'),
    open_opportunities_count: scoredItems.length,
    edition_status: 'PUBLISHED',
    compiled_by: actorEmail,
    sha256_report_seal: seal,
    created_at: now
  };

  store.editions.unshift(newEdition);
  store.opportunities.unshift(...scoredItems);

  // Build category breakdown conserving totals
  const catMap = new Map();
  for (const opp of scoredItems) {
    const prev = catMap.get(opp.leakage_category) || { item_count: 0, gross: 0, exp: 0 };
    prev.item_count += 1;
    prev.gross += opp.gross_leakage_usd;
    prev.exp += opp.expected_net_recovery_usd;
    catMap.set(opp.leakage_category, prev);
  }
  for (const [cat, vals] of catMap.entries()) {
    store.categoryBreakdown.unshift({
      id: `cat-${Date.now()}-${cat}`,
      facility_id: store.config.facility_id,
      edition_id: editionId,
      leakage_category: cat,
      item_count: vals.item_count,
      gross_leakage_usd: Number(vals.gross.toFixed(2)),
      expected_net_recovery_usd: Number(vals.exp.toFixed(2)),
      wow_change_pct: wowDelta
    });
  }

  // Build payer concentration summary
  const payMap = new Map();
  for (const opp of scoredItems) {
    const prev = payMap.get(opp.payer_name) || { item_count: 0, gross: 0, exp: 0, minDays: opp.days_to_timely_filing_limit };
    prev.item_count += 1;
    prev.gross += opp.gross_leakage_usd;
    prev.exp += opp.expected_net_recovery_usd;
    prev.minDays = Math.min(prev.minDays, opp.days_to_timely_filing_limit);
    payMap.set(opp.payer_name, prev);
  }
  for (const [payer, vals] of payMap.entries()) {
    store.payerSummary.unshift({
      id: `pay-${Date.now()}-${payer}`,
      facility_id: store.config.facility_id,
      edition_id: editionId,
      payer_name: payer,
      item_count: vals.item_count,
      gross_leakage_usd: Number(vals.gross.toFixed(2)),
      expected_net_recovery_usd: Number(vals.exp.toFixed(2)),
      min_timely_filing_days: vals.minDays
    });
  }

  store.weeklyActions.unshift({
    id: `wact-${Date.now()}`,
    facility_id: store.config.facility_id,
    edition_id: editionId,
    opportunity_id: null,
    action_type: 'EDITION_PUBLISHED',
    actor_email: actorEmail,
    actor_role: 'CFO / Finance Director',
    recovered_amount_usd: 0.00,
    notes: `Compiled ${weekCode} ($${totalGross.toLocaleString('en-US')} gross / $${totalExpected.toLocaleString('en-US')} expected net).`,
    sha256_seal: seal,
    created_at: now
  });

  return {
    edition: { ...newEdition },
    opportunities_count: scoredItems.length
  };
}

/**
 * Transitions recovery status on an opportunity, enforcing mandatory reason notes,
 * recovery payout bounds, edition realized totals, and SHA-256 provenance.
 */
export async function updateOpportunityRecoveryStatus(facilityInput, opportunityId, options = {}) {
  const store = ensureFacilityStore(facilityInput);
  const opp = store.opportunities.find(o => o.id === opportunityId || o.opportunity_code === opportunityId);
  if (!opp) {
    throw new Error(`ERR_WLR_OPPORTUNITY_NOT_FOUND: Opportunity "${opportunityId}" not found`);
  }

  const nextStatus = options.status;
  if (!CANONICAL_OPPORTUNITY_STATUSES.includes(nextStatus)) {
    throw new Error(`ERR_WLR_INVALID_STATUS: Unknown opportunity status "${nextStatus}"`);
  }

  const note = String(options.resolution_note || '').trim();
  if ((nextStatus === 'RECOVERED' || nextStatus === 'WRITTEN_OFF') && note.length < 5) {
    throw new Error('ERR_WLR_NOTE_REQUIRED: Marking RECOVERED or WRITTEN_OFF requires a reason (>=5 chars)');
  }

  const recoveredUsd = Number(options.recovered_usd ?? opp.recovered_usd ?? 0);
  if (!Number.isFinite(recoveredUsd) || recoveredUsd < 0 || recoveredUsd > opp.gross_leakage_usd * 1.1) {
    throw new Error(`ERR_WLR_INVALID_RECOVERY_AMOUNT: Recovered amount ($${recoveredUsd}) must be within [0, 110% of gross]`);
  }

  const deltaRecovered = Number((recoveredUsd - Number(opp.recovered_usd || 0)).toFixed(2));
  const actorEmail = options.actor_email || 'rcm_lead@naplessurgery.com';
  const actorRole = options.actor_role || 'RCM Billing Lead';
  const now = new Date().toISOString();

  opp.status = nextStatus;
  opp.recovered_usd = Number(recoveredUsd.toFixed(2));
  if (note) opp.resolution_note = note;
  opp.updated_at = now;

  const edition = store.editions.find(e => e.id === opp.edition_id);
  if (edition) {
    edition.realized_recovered_wow_usd = Number(
      (Number(edition.realized_recovered_wow_usd || 0) + Math.max(0, deltaRecovered)).toFixed(2)
    );
    edition.open_opportunities_count = store.opportunities.filter(
      o => o.edition_id === edition.id && o.status !== 'RECOVERED' && o.status !== 'WRITTEN_OFF'
    ).length;
  }

  const actionEntry = {
    id: `wact-${Date.now()}`,
    facility_id: store.config.facility_id,
    edition_id: opp.edition_id,
    opportunity_id: opp.id,
    action_type: `OPP_${nextStatus}`,
    actor_email: actorEmail,
    actor_role: actorRole,
    recovered_amount_usd: opp.recovered_usd,
    notes: `${opp.opportunity_code} -> ${nextStatus}: ${note || 'Updated pipeline'}`,
    sha256_seal: computeWlrProvenanceSeal({ code: opp.opportunity_code, nextStatus, recoveredUsd, now }),
    created_at: now
  };
  store.weeklyActions.unshift(actionEntry);

  return {
    opportunity: { ...opp },
    edition_realized_wow_usd: edition ? edition.realized_recovered_wow_usd : opp.recovered_usd,
    action: actionEntry
  };
}

/**
 * Dispatches Weekly Revenue Leakage Report via Phase H0 (`RPT-H2-LEAKAGE`).
 */
export async function dispatchWeeklyLeakageDigest(facilityInput, editionId, options = {}) {
  const store = ensureFacilityStore(facilityInput);
  const ed = store.editions.find(e => e.id === editionId || e.week_code === editionId);
  if (!ed) {
    throw new Error(`ERR_WLR_EDITION_NOT_FOUND: Weekly edition "${editionId}" not found`);
  }

  const now = new Date().toISOString();
  const execCode = `RPT-H2-RUN-${Date.now()}`;
  const seal = computeWlrProvenanceSeal({
    edition_id: ed.id,
    execCode,
    channel: options.delivery_channel || 'EMAIL_DIGEST',
    now
  });

  const log = {
    id: `wdsp-${Date.now()}`,
    facility_id: store.config.facility_id,
    edition_id: ed.id,
    rpt_execution_code: execCode,
    delivery_channel: options.delivery_channel || 'EMAIL_DIGEST',
    export_format: options.export_format || 'XLSX',
    recipient_count: Number(options.recipient_count ?? 3),
    dispatch_status: 'DELIVERED',
    dispatched_by: options.actor_email || 'cfo@naplessurgery.com',
    sha256_sync_seal: seal,
    created_at: now
  };
  store.dispatchLogs.unshift(log);
  return log;
}

export default {
  NAPLES_FACILITY_ID,
  CANONICAL_LEAKAGE_CATEGORIES,
  CANONICAL_PRIORITY_TIERS,
  CANONICAL_OPPORTUNITY_STATUSES,
  normalizeFacilityId,
  computeWlrProvenanceSeal,
  maskWlrSecret,
  computeExpectedNetRecovery,
  scoreAndRankRecoveryOpportunity,
  getWlrConfig,
  updateWlrConfig,
  getWlrTelemetry,
  getWlrEditions,
  getWlrPriorityOpportunities,
  getWlrCategoryBreakdown,
  getWlrPayerSummary,
  getWlrWeeklyActions,
  getWlrDispatchLogs,
  compileWeeklyLeakageReport,
  updateOpportunityRecoveryStatus,
  dispatchWeeklyLeakageDigest
};
