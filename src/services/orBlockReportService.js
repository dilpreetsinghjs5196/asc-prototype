/**
 * ==============================================================================
 * Service: orBlockReportService.js
 * Module 17: Enterprise Reporting & Executive Packages (Phase H7)
 * Description: OR Block Utilization, Release Compliance, Turnover Efficiency,
 *              Abandoned Idle Capacity Opportunity Cost, MEC Governance Log,
 *              and H0 (RPT-H7-OR-BLOCK) Dispatch with SHA-256 Provenance Seals.
 * ==============================================================================
 */

import { sha256Hex } from '../utils/isomorphicSha256.js';

export const NAPLES_FACILITY_ID = '00000000-0000-0000-0000-000000000002';

export const CANONICAL_BLOCK_TIERS = [
  'EXCEEDS_BENCHMARK',
  'MEETS_BENCHMARK',
  'UNDERUTILIZED_WARNING',
  'CRITICAL_UNDERUTILIZATION'
];

export const CANONICAL_MEC_ACTIONS = [
  'EXPAND_BLOCK',
  'ISSUE_60D_NOTICE',
  'DOWNGRADE_FORFEIT',
  'APPROVE_REALLOCATION'
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
 * Computes an immutable 64-character SHA-256 provenance seal prefixed with `sha256_obr_`.
 */
export function computeObrProvenanceSeal(payload) {
  const canonicalJson = JSON.stringify(payload || {});
  const digest = sha256Hex(canonicalJson);
  return `sha256_obr_${digest.slice(0, 53)}`;
}

/**
 * Masks OR block report engine secrets strictly as `obr_sec_****_...`.
 */
export function maskObrSecret(rawSecret) {
  if (!rawSecret) return 'obr_sec_****_unset';
  const str = String(rawSecret);
  if (str.startsWith('obr_sec_****_')) return str;
  return `obr_sec_****_${str.slice(-4)}`;
}

/**
 * Deterministically evaluates OR block utilization, abandoned idle minutes,
 * idle opportunity cost ($), yield per utilized hour, benchmark tier, and MEC rightsizing.
 */
export function evaluateOrBlockPerformance(blockInput = {}, config = {}) {
  const allocatedMin = Math.max(0, Number(blockInput.allocated_minutes ?? 0));
  const releasedMin = Math.max(0, Number(blockInput.on_time_released_minutes ?? 0));
  const utilizedMin = Math.max(0, Number(blockInput.utilized_in_block_minutes ?? 0));
  const contribMargin = Number(blockInput.contribution_margin_usd ?? 0);
  const hourlyBenchmark = Number(config.hourly_margin_benchmark_usd ?? 1250.00);

  const netAllocatedMin = Math.max(0, allocatedMin - releasedMin);
  const abandonedIdleMin = Math.max(0, netAllocatedMin - utilizedMin);

  const rawUtilPct = allocatedMin > 0
    ? Number(((utilizedMin / allocatedMin) * 100).toFixed(2))
    : 0.00;
  const adjustedUtilPct = netAllocatedMin > 0
    ? Number(((utilizedMin / netAllocatedMin) * 100).toFixed(2))
    : (utilizedMin > 0 ? 100.00 : 0.00);

  const utilizedHours = utilizedMin / 60;
  const marginPerUtilizedHr = utilizedHours > 0
    ? Number((contribMargin / utilizedHours).toFixed(2))
    : 0.00;
  const opportunityCostUsd = Number(((abandonedIdleMin / 60) * hourlyBenchmark).toFixed(2));

  let blockTier = 'CRITICAL_UNDERUTILIZATION';
  let rightsizingAction = 'RIGHTSIZE_DOWNGRADE';
  if (adjustedUtilPct >= 85) {
    blockTier = 'EXCEEDS_BENCHMARK';
    rightsizingAction = 'EXPAND_ALLOCATION';
  } else if (adjustedUtilPct >= 75) {
    blockTier = 'MEETS_BENCHMARK';
    rightsizingAction = 'MAINTAIN';
  } else if (adjustedUtilPct >= 60) {
    blockTier = 'UNDERUTILIZED_WARNING';
    rightsizingAction = 'PROBATIONARY_NOTICE';
  }

  return {
    allocated_minutes: allocatedMin,
    on_time_released_minutes: releasedMin,
    utilized_in_block_minutes: utilizedMin,
    abandoned_idle_minutes: abandonedIdleMin,
    raw_utilization_pct: rawUtilPct,
    adjusted_utilization_pct: adjustedUtilPct,
    contribution_margin_usd: Number(contribMargin.toFixed(2)),
    margin_per_utilized_hour_usd: marginPerUtilizedHr,
    opportunity_cost_usd: opportunityCostUsd,
    block_tier: blockTier,
    rightsizing_action: rightsizingAction
  };
}

/**
 * Verifies OR capacity time conservation across allocated, released, utilized, and idle hours:
 * Allocated Hours === Released Hours + Utilized Hours + Abandoned Idle Hours (when Utilized <= Net Allocated).
 */
export function verifyBlockTimeConservation(editionTotals = {}) {
  const allocated = Number(editionTotals.total_allocated_hours ?? 0);
  const released = Number(editionTotals.total_released_hours ?? 0);
  const utilized = Number(editionTotals.total_utilized_hours ?? 0);
  const idle = Number(editionTotals.total_abandoned_idle_hours ?? 0);

  const accounted = Number((released + utilized + idle).toFixed(2));
  const delta = Number(Math.abs(allocated - accounted).toFixed(2));
  if (delta > 0.1) {
    throw new Error(
      `ERR_OBR_TIME_CONSERVATION_MISMATCH: Allocated (${allocated}h) vs Released+Utilized+Idle (${accounted}h) differs by ${delta}h.`
    );
  }
  return {
    is_conserved: true,
    accounted_hours: accounted,
    delta_hours: delta
  };
}

// ==============================================================================
// In-Memory Deterministic Store (Multi-Tenant Safe)
// ==============================================================================
const facilityStores = new Map();

function buildInitialStore(facilityId) {
  const edNovId = 'obr-ed-202611';

  const config = {
    facility_id: facilityId,
    target_block_utilization_pct: 75.00,
    max_allowable_turnover_mins: 45,
    release_notice_cutoff_hours: 72,
    hourly_margin_benchmark_usd: 1250.00,
    client_secret_encrypted: 'obr_sec_****_naples_7301',
    sync_status: 'ACTIVE',
    health_status: 'HEALTHY',
    updated_at: '2026-11-27T07:00:00.000Z'
  };

  const benchmarks = [
    {
      id: 'osb-1',
      facility_id: facilityId,
      suite_name: 'OR Suite 1 (Ortho)',
      target_utilization_pct: 80.00,
      target_turnover_minutes: 19,
      fcots_target_pct: 92.00,
      revenue_per_hour_target_usd: 4100.00
    },
    {
      id: 'osb-2',
      facility_id: facilityId,
      suite_name: 'OR Suite 2 (Sports)',
      target_utilization_pct: 78.00,
      target_turnover_minutes: 18,
      fcots_target_pct: 90.00,
      revenue_per_hour_target_usd: 3800.00
    },
    {
      id: 'osb-3',
      facility_id: facilityId,
      suite_name: 'OR Suite 3 (Spine)',
      target_utilization_pct: 76.00,
      target_turnover_minutes: 15,
      fcots_target_pct: 91.00,
      revenue_per_hour_target_usd: 3200.00
    },
    {
      id: 'osb-4',
      facility_id: facilityId,
      suite_name: 'OR Suite 4 (Ophth)',
      target_utilization_pct: 74.00,
      target_turnover_minutes: 14,
      fcots_target_pct: 94.00,
      revenue_per_hour_target_usd: 2600.00
    }
  ];

  const seedBlocks = [
    {
      id: 'blk-mal',
      block_owner_code: 'BLK-MAL',
      block_owner_name: 'Dr. Malinoski Kelly Block',
      specialty: 'Orthopedic Surgery',
      suite_name: 'OR Suite 1 (Ortho)',
      allocated_minutes: 4200,
      on_time_released_minutes: 240,
      utilized_in_block_minutes: 3750,
      avg_turnover_minutes: 17,
      fcots_on_time_pct: 94.50,
      contribution_margin_usd: 263450.00
    },
    {
      id: 'blk-gar',
      block_owner_code: 'BLK-GAR',
      block_owner_name: 'Dr. Gardner Paul Block',
      specialty: 'Sports Medicine',
      suite_name: 'OR Suite 2 (Sports)',
      allocated_minutes: 3600,
      on_time_released_minutes: 240,
      utilized_in_block_minutes: 3060,
      avg_turnover_minutes: 18,
      fcots_on_time_pct: 91.20,
      contribution_margin_usd: 215630.00
    },
    {
      id: 'blk-bon',
      block_owner_code: 'BLK-BON',
      block_owner_name: 'Dr. Bonett Andrew Block',
      specialty: 'Pain / Spine',
      suite_name: 'OR Suite 3 (Spine)',
      allocated_minutes: 3600,
      on_time_released_minutes: 240,
      utilized_in_block_minutes: 2970,
      avg_turnover_minutes: 16,
      fcots_on_time_pct: 89.00,
      contribution_margin_usd: 157850.00
    },
    {
      id: 'blk-wal',
      block_owner_code: 'BLK-WAL',
      block_owner_name: 'Dr. Walsh Mark Block',
      specialty: 'Ophthalmology',
      suite_name: 'OR Suite 4 (Ophth)',
      allocated_minutes: 3000,
      on_time_released_minutes: 240,
      utilized_in_block_minutes: 2040,
      avg_turnover_minutes: 21,
      fcots_on_time_pct: 82.40,
      contribution_margin_usd: 69310.00
    }
  ];

  const evaluatedCards = seedBlocks
    .map(raw => ({ raw, calc: evaluateOrBlockPerformance(raw, config) }))
    .sort((a, b) => b.calc.adjusted_utilization_pct - a.calc.adjusted_utilization_pct)
    .map((entry, idx) => ({
      id: entry.raw.id,
      facility_id: facilityId,
      edition_id: edNovId,
      block_owner_code: entry.raw.block_owner_code,
      block_owner_name: entry.raw.block_owner_name,
      specialty: entry.raw.specialty,
      suite_name: entry.raw.suite_name,
      avg_turnover_minutes: entry.raw.avg_turnover_minutes,
      fcots_on_time_pct: entry.raw.fcots_on_time_pct,
      ...entry.calc,
      rank_in_facility: idx + 1,
      sha256_card_seal: computeObrProvenanceSeal({ block_owner_code: entry.raw.block_owner_code, period: '2026-11' })
    }));

  const totAllocHrs = Number((evaluatedCards.reduce((s, c) => s + c.allocated_minutes, 0) / 60).toFixed(2));
  const totRelHrs = Number((evaluatedCards.reduce((s, c) => s + c.on_time_released_minutes, 0) / 60).toFixed(2));
  const totUtilHrs = Number((evaluatedCards.reduce((s, c) => s + c.utilized_in_block_minutes, 0) / 60).toFixed(2));
  const totIdleHrs = Number((evaluatedCards.reduce((s, c) => s + c.abandoned_idle_minutes, 0) / 60).toFixed(2));
  const netAllocHrs = totAllocHrs - totRelHrs;
  const facAdjUtilPct = netAllocHrs > 0 ? Number(((totUtilHrs / netAllocHrs) * 100).toFixed(2)) : 0.00;
  const totMargin = Number(evaluatedCards.reduce((s, c) => s + c.contribution_margin_usd, 0).toFixed(2));
  const totOppCost = Number(evaluatedCards.reduce((s, c) => s + c.opportunity_cost_usd, 0).toFixed(2));

  const editions = [
    {
      id: edNovId,
      facility_id: facilityId,
      edition_code: 'OBR-2026-11-NAP',
      period_code: '2026-11',
      edition_status: 'PUBLISHED',
      blocks_evaluated: evaluatedCards.length,
      total_allocated_hours: totAllocHrs,
      total_released_hours: totRelHrs,
      total_utilized_hours: totUtilHrs,
      total_abandoned_idle_hours: totIdleHrs,
      facility_adjusted_util_pct: facAdjUtilPct,
      total_contribution_margin_usd: totMargin,
      recoverable_capacity_value_usd: totOppCost,
      compiled_by: 'or_director@naplessurgery.com',
      sha256_report_seal: computeObrProvenanceSeal({ facilityId, edition_code: 'OBR-2026-11-NAP' }),
      created_at: '2026-11-27T07:00:00.000Z'
    }
  ];

  const releaseEvents = [
    {
      id: 'rel-wal-1',
      facility_id: facilityId,
      scorecard_id: 'blk-wal',
      block_owner_code: 'BLK-WAL',
      block_date: '2026-11-12',
      suite_name: 'OR Suite 4 (Ophth)',
      released_hours: 4.00,
      notice_hours_prior: 96,
      release_classification: 'COMPLIANT_ON_TIME',
      backfilled_hours: 3.50,
      recovered_margin_usd: 7350.00
    },
    {
      id: 'rel-wal-2',
      facility_id: facilityId,
      scorecard_id: 'blk-wal',
      block_owner_code: 'BLK-WAL',
      block_date: '2026-11-19',
      suite_name: 'OR Suite 4 (Ophth)',
      released_hours: 6.00,
      notice_hours_prior: 18,
      release_classification: 'LATE_RELEASE',
      backfilled_hours: 1.50,
      recovered_margin_usd: 2800.00
    },
    {
      id: 'rel-bon-1',
      facility_id: facilityId,
      scorecard_id: 'blk-bon',
      block_owner_code: 'BLK-BON',
      block_date: '2026-11-14',
      suite_name: 'OR Suite 3 (Spine)',
      released_hours: 4.00,
      notice_hours_prior: 120,
      release_classification: 'COMPLIANT_ON_TIME',
      backfilled_hours: 4.00,
      recovered_margin_usd: 11200.00
    }
  ];

  const mecActions = [
    {
      id: 'mec-wal-1',
      facility_id: facilityId,
      scorecard_id: 'blk-wal',
      block_owner_code: 'BLK-WAL',
      action_type: 'ISSUE_60D_NOTICE',
      actor_email: 'or_director@naplessurgery.com',
      actor_role: 'Clinical Nursing Director',
      hours_delta: -4.00,
      notes: '73.9% adjusted utilization below 75% benchmark; 18h late release caused 10.5 idle OR hrs.',
      sha256_seal: computeObrProvenanceSeal({ act: 'mec-wal-1' }),
      created_at: '2026-11-27T08:15:00.000Z'
    }
  ];

  const dispatchLogs = [
    {
      id: 'odsp-nov-01',
      facility_id: facilityId,
      edition_id: edNovId,
      rpt_execution_code: 'RPT-H7-RUN-NOV-01',
      delivery_channel: 'PORTAL_INBOX',
      export_format: 'PDF',
      recipient_count: 4,
      dispatch_status: 'DELIVERED',
      dispatched_by: 'or_director@naplessurgery.com',
      sha256_sync_seal: computeObrProvenanceSeal({ exec: 'RPT-H7-RUN-NOV-01' }),
      created_at: '2026-11-27T08:25:00.000Z'
    }
  ];

  return {
    config,
    benchmarks,
    editions,
    scorecards: evaluatedCards,
    releaseEvents,
    mecActions,
    dispatchLogs
  };
}

function ensureFacilityStore(facilityInput) {
  const fid = normalizeFacilityId(facilityInput);
  if (!facilityStores.has(fid)) {
    facilityStores.set(fid, buildInitialStore(fid));
  }
  return facilityStores.get(fid);
}

// ==============================================================================
// Read Accessors
// ==============================================================================
export async function getObrConfig(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return { ...store.config };
}

export async function updateObrConfig(facilityInput, updates = {}) {
  const store = ensureFacilityStore(facilityInput);
  const targetUtil = Number(updates.target_block_utilization_pct ?? store.config.target_block_utilization_pct);
  const cutoffHrs = Number(updates.release_notice_cutoff_hours ?? store.config.release_notice_cutoff_hours);
  const hourlyMargin = Number(updates.hourly_margin_benchmark_usd ?? store.config.hourly_margin_benchmark_usd);

  if (!Number.isFinite(targetUtil) || targetUtil < 20 || targetUtil > 100) {
    throw new Error('ERR_OBR_INVALID_CONFIG: target_block_utilization_pct must be between 20 and 100.');
  }
  if (!Number.isFinite(cutoffHrs) || cutoffHrs < 12) {
    throw new Error('ERR_OBR_INVALID_CONFIG: release_notice_cutoff_hours must be >= 12.');
  }
  if (!Number.isFinite(hourlyMargin) || hourlyMargin < 0) {
    throw new Error('ERR_OBR_INVALID_CONFIG: hourly_margin_benchmark_usd must be >= 0.');
  }

  store.config = {
    ...store.config,
    target_block_utilization_pct: Number(targetUtil.toFixed(2)),
    max_allowable_turnover_mins: Number(updates.max_allowable_turnover_mins ?? store.config.max_allowable_turnover_mins),
    release_notice_cutoff_hours: cutoffHrs,
    hourly_margin_benchmark_usd: Number(hourlyMargin.toFixed(2)),
    updated_at: new Date().toISOString()
  };

  return { ...store.config };
}

export async function getObrTelemetry(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  const latest = store.editions[0];

  return {
    facility_id: store.config.facility_id,
    latest_edition_code: latest?.edition_code || null,
    period_code: latest?.period_code || null,
    blocks_evaluated: latest?.blocks_evaluated ?? 0,
    total_utilized_hours: latest?.total_utilized_hours ?? 0,
    total_abandoned_idle_hours: latest?.total_abandoned_idle_hours ?? 0,
    facility_adjusted_util_pct: latest?.facility_adjusted_util_pct ?? 0,
    total_contribution_margin_usd: latest?.total_contribution_margin_usd ?? 0,
    recoverable_capacity_value_usd: latest?.recoverable_capacity_value_usd ?? 0,
    sync_status: store.config.sync_status,
    health_status: store.config.health_status,
    latest_sync_seal: latest?.sha256_report_seal || null
  };
}

export async function getObrSuiteBenchmarks(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return store.benchmarks.map(b => ({ ...b }));
}

export async function getObrEditions(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return store.editions.map(e => ({ ...e }));
}

export async function getObrBlockScorecards(facilityInput, options = {}) {
  const store = ensureFacilityStore(facilityInput);
  const targetEdId = options.edition_id || store.editions[0]?.id;
  const { block_tier: tier, specialty } = options;

  return store.scorecards
    .filter(c => c.edition_id === targetEdId)
    .filter(c => !tier || tier === 'ALL' || c.block_tier === tier)
    .filter(c => !specialty || specialty === 'ALL' || c.specialty === specialty)
    .sort((a, b) => a.rank_in_facility - b.rank_in_facility)
    .map(c => ({ ...c }));
}

export async function getObrReleaseEvents(facilityInput, options = {}) {
  const store = ensureFacilityStore(facilityInput);
  const { scorecard_id: scorecardId, block_owner_code: ownerCode } = options;
  return store.releaseEvents
    .filter(e => !scorecardId || e.scorecard_id === scorecardId)
    .filter(e => !ownerCode || e.block_owner_code === ownerCode)
    .map(e => ({ ...e }));
}

export async function getObrMecActions(facilityInput, scorecardId = null) {
  const store = ensureFacilityStore(facilityInput);
  return store.mecActions
    .filter(a => !scorecardId || a.scorecard_id === scorecardId)
    .map(a => ({ ...a }));
}

export async function getObrDispatchLogs(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return store.dispatchLogs.map(d => ({ ...d }));
}

// ==============================================================================
// Write / Mutation Endpoints
// ==============================================================================

/**
 * Compiles a conserved OR Block Report Edition ranking block owners by adjusted utilization.
 */
export async function compileOrBlockEdition(facilityInput, params = {}) {
  const store = ensureFacilityStore(facilityInput);
  const now = new Date().toISOString();
  const periodCode = params.period_code || now.slice(0, 7);
  const rawBlocks = Array.isArray(params.blocks) && params.blocks.length > 0
    ? params.blocks
    : store.scorecards.filter(c => c.edition_id === store.editions[0]?.id);

  if (rawBlocks.length === 0) {
    throw new Error('ERR_OBR_NO_BLOCKS: At least one OR block record is required to compile an edition.');
  }

  const edId = `obr-ed-${periodCode.replace(/[^0-9a-zA-Z]/g, '')}-${Date.now()}`;
  const edCode = `OBR-${periodCode}-NAP`;

  const evaluated = rawBlocks
    .map(raw => ({ raw, calc: evaluateOrBlockPerformance(raw, store.config) }))
    .sort((a, b) => b.calc.adjusted_utilization_pct - a.calc.adjusted_utilization_pct);

  const compiledCards = evaluated.map((entry, idx) => ({
    id: `blk-${entry.raw.block_owner_code.toLowerCase()}-${Date.now()}-${idx}`,
    facility_id: store.config.facility_id,
    edition_id: edId,
    block_owner_code: entry.raw.block_owner_code,
    block_owner_name: entry.raw.block_owner_name,
    specialty: entry.raw.specialty,
    suite_name: entry.raw.suite_name || 'OR Suite 1',
    avg_turnover_minutes: Number(entry.raw.avg_turnover_minutes ?? 18),
    fcots_on_time_pct: Number(entry.raw.fcots_on_time_pct ?? 90),
    ...entry.calc,
    rank_in_facility: idx + 1,
    sha256_card_seal: computeObrProvenanceSeal({
      edition_code: edCode,
      block_owner_code: entry.raw.block_owner_code,
      adjusted_utilization_pct: entry.calc.adjusted_utilization_pct,
      now
    })
  }));

  const totAllocHrs = Number((compiledCards.reduce((s, c) => s + c.allocated_minutes, 0) / 60).toFixed(2));
  const totRelHrs = Number((compiledCards.reduce((s, c) => s + c.on_time_released_minutes, 0) / 60).toFixed(2));
  const totUtilHrs = Number((compiledCards.reduce((s, c) => s + c.utilized_in_block_minutes, 0) / 60).toFixed(2));
  const totIdleHrs = Number((compiledCards.reduce((s, c) => s + c.abandoned_idle_minutes, 0) / 60).toFixed(2));
  const netAllocHrs = totAllocHrs - totRelHrs;
  const facAdjUtilPct = netAllocHrs > 0 ? Number(((totUtilHrs / netAllocHrs) * 100).toFixed(2)) : 0.00;
  const totMargin = Number(compiledCards.reduce((s, c) => s + c.contribution_margin_usd, 0).toFixed(2));
  const totOppCost = Number(compiledCards.reduce((s, c) => s + c.opportunity_cost_usd, 0).toFixed(2));

  verifyBlockTimeConservation({
    total_allocated_hours: totAllocHrs,
    total_released_hours: totRelHrs,
    total_utilized_hours: totUtilHrs,
    total_abandoned_idle_hours: totIdleHrs
  });

  const newEdition = {
    id: edId,
    facility_id: store.config.facility_id,
    edition_code: edCode,
    period_code: periodCode,
    edition_status: 'PUBLISHED',
    blocks_evaluated: compiledCards.length,
    total_allocated_hours: totAllocHrs,
    total_released_hours: totRelHrs,
    total_utilized_hours: totUtilHrs,
    total_abandoned_idle_hours: totIdleHrs,
    facility_adjusted_util_pct: facAdjUtilPct,
    total_contribution_margin_usd: totMargin,
    recoverable_capacity_value_usd: totOppCost,
    compiled_by: params.actor_email || 'or_director@naplessurgery.com',
    sha256_report_seal: computeObrProvenanceSeal({ edCode, facAdjUtilPct, totOppCost, now }),
    created_at: now
  };

  store.editions.unshift(newEdition);
  store.scorecards.push(...compiledCards);

  return {
    edition: { ...newEdition },
    scorecards: compiledCards.map(c => ({ ...c }))
  };
}

/**
 * Records a sealed MEC block allocation / probationary notice action.
 */
export async function recordMecGovernanceAction(facilityInput, scorecardId, payload = {}) {
  const store = ensureFacilityStore(facilityInput);
  const card = store.scorecards.find(c => c.id === scorecardId || c.block_owner_code === scorecardId);
  if (!card) {
    throw new Error(`ERR_OBR_SCORECARD_NOT_FOUND: Block scorecard "${scorecardId}" not found.`);
  }

  const actionType = payload.action_type || 'ISSUE_60D_NOTICE';
  if (!CANONICAL_MEC_ACTIONS.includes(actionType)) {
    throw new Error(`ERR_OBR_INVALID_ACTION: Unsupported action_type "${actionType}".`);
  }

  const notes = String(payload.notes || '').trim();
  if (notes.length < 5) {
    throw new Error('ERR_OBR_NOTE_REQUIRED: MEC governance notes must be at least 5 characters.');
  }

  const hoursDelta = Number(payload.hours_delta ?? 0);
  const now = new Date().toISOString();
  const actorEmail = payload.actor_email || 'or_director@naplessurgery.com';
  const actorRole = payload.actor_role || 'Clinical Nursing Director';
  const seal = computeObrProvenanceSeal({
    scorecard_id: card.id,
    actionType,
    hoursDelta,
    notes,
    actorEmail,
    now
  });

  const entry = {
    id: `mec-${Date.now()}`,
    facility_id: store.config.facility_id,
    scorecard_id: card.id,
    block_owner_code: card.block_owner_code,
    action_type: actionType,
    actor_email: actorEmail,
    actor_role: actorRole,
    hours_delta: Number(hoursDelta.toFixed(2)),
    notes,
    sha256_seal: seal,
    created_at: now
  };

  store.mecActions.unshift(entry);
  return entry;
}

/**
 * Dispatches OR Block Edition via Phase H0 (`RPT-H7-OR-BLOCK`).
 */
export async function dispatchOrBlockDigest(facilityInput, editionId, options = {}) {
  const store = ensureFacilityStore(facilityInput);
  const ed = store.editions.find(e => e.id === editionId || e.edition_code === editionId);
  if (!ed) {
    throw new Error(`ERR_OBR_EDITION_NOT_FOUND: Edition "${editionId}" not found.`);
  }

  const now = new Date().toISOString();
  const execCode = `RPT-H7-RUN-${Date.now()}`;
  const seal = computeObrProvenanceSeal({ edition_id: ed.id, execCode, now });

  const log = {
    id: `odsp-${Date.now()}`,
    facility_id: store.config.facility_id,
    edition_id: ed.id,
    rpt_execution_code: execCode,
    delivery_channel: options.delivery_channel || 'PORTAL_INBOX',
    export_format: options.export_format || 'PDF',
    recipient_count: Number(options.recipient_count ?? ed.blocks_evaluated ?? 4),
    dispatch_status: 'DELIVERED',
    dispatched_by: options.actor_email || 'or_director@naplessurgery.com',
    sha256_sync_seal: seal,
    created_at: now
  };

  store.dispatchLogs.unshift(log);
  return log;
}

export default {
  NAPLES_FACILITY_ID,
  CANONICAL_BLOCK_TIERS,
  CANONICAL_MEC_ACTIONS,
  normalizeFacilityId,
  computeObrProvenanceSeal,
  maskObrSecret,
  evaluateOrBlockPerformance,
  verifyBlockTimeConservation,
  getObrConfig,
  updateObrConfig,
  getObrTelemetry,
  getObrSuiteBenchmarks,
  getObrEditions,
  getObrBlockScorecards,
  getObrReleaseEvents,
  getObrMecActions,
  getObrDispatchLogs,
  compileOrBlockEdition,
  recordMecGovernanceAction,
  dispatchOrBlockDigest
};
