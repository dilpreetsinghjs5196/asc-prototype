/**
 * ==============================================================================
 * Service: cptEconomicsReportService.js
 * Module 17: Enterprise Reporting & Executive Packages (Phase H6)
 * Description: Procedural Unit Economics Compiler, Activity-Based Cost
 *              Decomposition, Conserved Operating Income Identity,
 *              Economic Quadrant Classification, Payer Parity Spread Matrix,
 *              Cost Optimization Log, and H0 (RPT-H6-CPT-ECON) Dispatch.
 * ==============================================================================
 */

import { sha256Hex } from '../utils/isomorphicSha256.js';

export const NAPLES_FACILITY_ID = '00000000-0000-0000-0000-000000000002';

export const CANONICAL_ECONOMIC_QUADRANTS = [
  'PRIME_YIELD_ANCHOR',
  'VOLUME_PROFIT_BUILDER',
  'MARGIN_SQUEEZE_AT_RISK',
  'ECONOMIC_DEFICIT'
];

export const CANONICAL_OPTIMIZATION_ACTIONS = [
  'IMPLANT_NEGOTIATION',
  'PREF_CARD_STANDARDIZE',
  'SCHEDULING_OPTIMIZE',
  'PAYER_CARVEOUT_ESCALATE'
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
 * Computes an immutable 64-character SHA-256 provenance seal prefixed with `sha256_cer_`.
 */
export function computeCerProvenanceSeal(payload) {
  const canonicalJson = JSON.stringify(payload || {});
  const digest = sha256Hex(canonicalJson);
  return `sha256_cer_${digest.slice(0, 53)}`;
}

/**
 * Masks CPT economics engine secrets strictly as `cer_sec_****_...`.
 */
export function maskCerSecret(rawSecret) {
  if (!rawSecret) return 'cer_sec_****_unset';
  const str = String(rawSecret);
  if (str.startsWith('cer_sec_****_')) return str;
  return `cer_sec_****_${str.slice(-4)}`;
}

/**
 * Deterministically evaluates CPT unit cost decomposition, OR-hour productivity yield,
 * allocated overhead, Net Operating Income, and Economic Quadrant classification.
 */
export function evaluateCptUnitEconomics(cptInput = {}, config = {}) {
  const caseCount = Number(cptInput.case_count ?? 0);
  const avgDurationMin = Number(cptInput.avg_or_duration_minutes ?? 0);
  const netReimb = Number(cptInput.avg_net_reimbursement_usd ?? 0);
  const implantCost = Number(cptInput.avg_implant_cost_usd ?? 0);
  const supplyCost = Number(cptInput.avg_supply_cost_usd ?? 0);
  const laborCost = Number(cptInput.avg_labor_cost_usd ?? 0);
  const overheadPerHour = Number(config.facility_overhead_per_or_hour_usd ?? 450.00);

  const avgDirectCost = Number((implantCost + supplyCost + laborCost).toFixed(2));
  const contributionMargin = Number((netReimb - avgDirectCost).toFixed(2));
  const contributionMarginPct = netReimb > 0
    ? Number(((contributionMargin / netReimb) * 100).toFixed(2))
    : 0.00;

  const orHoursPerCase = avgDurationMin > 0 ? avgDurationMin / 60 : 0;
  const totalOrHours = Number((caseCount * orHoursPerCase).toFixed(2));
  const allocatedOverheadPerCase = Number((orHoursPerCase * overheadPerHour).toFixed(2));
  const netOperatingIncomePerCase = Number((contributionMargin - allocatedOverheadPerCase).toFixed(2));
  const marginPerOrHour = orHoursPerCase > 0
    ? Number((contributionMargin / orHoursPerCase).toFixed(2))
    : 0.00;

  let quadrant = 'VOLUME_PROFIT_BUILDER';
  if (netOperatingIncomePerCase < 0 || marginPerOrHour < 800) {
    quadrant = 'ECONOMIC_DEFICIT';
  } else if (marginPerOrHour >= 2200 && contributionMarginPct >= 50) {
    quadrant = 'PRIME_YIELD_ANCHOR';
  } else if (contributionMarginPct < 30) {
    quadrant = 'MARGIN_SQUEEZE_AT_RISK';
  }

  return {
    case_count: caseCount,
    avg_or_duration_minutes: avgDurationMin,
    total_or_hours: totalOrHours,
    avg_net_reimbursement_usd: Number(netReimb.toFixed(2)),
    avg_implant_cost_usd: Number(implantCost.toFixed(2)),
    avg_supply_cost_usd: Number(supplyCost.toFixed(2)),
    avg_labor_cost_usd: Number(laborCost.toFixed(2)),
    avg_direct_cost_usd: avgDirectCost,
    contribution_margin_per_case_usd: contributionMargin,
    contribution_margin_pct: contributionMarginPct,
    allocated_overhead_per_case_usd: allocatedOverheadPerCase,
    net_operating_income_per_case_usd: netOperatingIncomePerCase,
    margin_per_or_hour_usd: marginPerOrHour,
    economic_quadrant: quadrant
  };
}

/**
 * Verifies the conserved accounting identity on a CPT Economics Report edition:
 * Net Operating Income === Net Reimbursement - Direct Cost - Allocated Overhead.
 */
export function verifyEditionConservation(editionTotals = {}) {
  const netReimb = Number(editionTotals.total_net_reimbursement_usd ?? 0);
  const directCost = Number(editionTotals.total_direct_cost_usd ?? 0);
  const allocOverhead = Number(editionTotals.total_allocated_overhead_usd ?? 0);
  const reportedNoi = Number(editionTotals.total_net_operating_income_usd ?? 0);
  const expectedNoi = Number((netReimb - directCost - allocOverhead).toFixed(2));
  const delta = Number(Math.abs(reportedNoi - expectedNoi).toFixed(2));
  if (delta > 0.05) {
    throw new Error(
      `ERR_CER_CONSERVATION_MISMATCH: Reported NOI ($${reportedNoi}) deviates from NetReimb - Direct - Overhead ($${expectedNoi}) by $${delta}.`
    );
  }
  return {
    is_balanced: true,
    expected_noi_usd: expectedNoi,
    delta_usd: delta
  };
}

// ==============================================================================
// In-Memory Deterministic Store (Multi-Tenant Safe)
// ==============================================================================
const facilityStores = new Map();

function buildInitialStore(facilityId) {
  const edQ4Id = 'cer-ed-2026q4';

  const config = {
    facility_id: facilityId,
    facility_overhead_per_or_hour_usd: 450.00,
    target_margin_per_or_hour_usd: 2000.00,
    min_contribution_margin_pct: 45.00,
    min_cases_for_statistical_validity: 5,
    client_secret_encrypted: 'cer_sec_****_naples_6214',
    sync_status: 'ACTIVE',
    health_status: 'HEALTHY',
    updated_at: '2026-11-27T07:00:00.000Z'
  };

  const benchmarks = [
    {
      id: 'cbench-ortho',
      facility_id: facilityId,
      specialty: 'Orthopedic Surgery',
      target_margin_per_or_hour_usd: 3200.00,
      target_duration_minutes: 68,
      max_implant_cost_pct: 28.00,
      target_contribution_margin_pct: 52.00
    },
    {
      id: 'cbench-sports',
      facility_id: facilityId,
      specialty: 'Sports Medicine',
      target_margin_per_or_hour_usd: 2800.00,
      target_duration_minutes: 58,
      max_implant_cost_pct: 24.00,
      target_contribution_margin_pct: 55.00
    },
    {
      id: 'cbench-spine',
      facility_id: facilityId,
      specialty: 'Pain / Spine',
      target_margin_per_or_hour_usd: 2400.00,
      target_duration_minutes: 28,
      max_implant_cost_pct: 12.00,
      target_contribution_margin_pct: 62.00
    },
    {
      id: 'cbench-ophth',
      facility_id: facilityId,
      specialty: 'Ophthalmology',
      target_margin_per_or_hour_usd: 2100.00,
      target_duration_minutes: 24,
      max_implant_cost_pct: 18.00,
      target_contribution_margin_pct: 58.00
    }
  ];

  const seedInputs = [
    {
      id: 'cer-cpt-29888',
      cpt_code: '29888',
      procedure_label: 'Arthroscopic ACL Reconstruction',
      specialty: 'Sports Medicine',
      case_count: 19,
      avg_or_duration_minutes: 62,
      avg_net_reimbursement_usd: 8950.00,
      avg_implant_cost_usd: 1750.00,
      avg_supply_cost_usd: 420.00,
      avg_labor_cost_usd: 370.00
    },
    {
      id: 'cer-cpt-29881',
      cpt_code: '29881',
      procedure_label: 'Knee Arthroscopy w/ Meniscectomy',
      specialty: 'Orthopedic Surgery',
      case_count: 28,
      avg_or_duration_minutes: 42,
      avg_net_reimbursement_usd: 6240.00,
      avg_implant_cost_usd: 580.00,
      avg_supply_cost_usd: 490.00,
      avg_labor_cost_usd: 350.00
    },
    {
      id: 'cer-cpt-64483',
      cpt_code: '64483',
      procedure_label: 'Lumbar Transforaminal Epidural',
      specialty: 'Pain / Spine',
      case_count: 36,
      avg_or_duration_minutes: 26,
      avg_net_reimbursement_usd: 3890.00,
      avg_implant_cost_usd: 180.00,
      avg_supply_cost_usd: 310.00,
      avg_labor_cost_usd: 280.00
    },
    {
      id: 'cer-cpt-66984',
      cpt_code: '66984',
      procedure_label: 'Cataract Extraction w/ IOL',
      specialty: 'Ophthalmology',
      case_count: 38,
      avg_or_duration_minutes: 24,
      avg_net_reimbursement_usd: 3680.00,
      avg_implant_cost_usd: 590.00,
      avg_supply_cost_usd: 360.00,
      avg_labor_cost_usd: 255.00
    },
    {
      id: 'cer-cpt-29827',
      cpt_code: '29827',
      procedure_label: 'Arthroscopic Rotator Cuff Repair',
      specialty: 'Orthopedic Surgery',
      case_count: 18,
      avg_or_duration_minutes: 78,
      avg_net_reimbursement_usd: 8120.00,
      avg_implant_cost_usd: 2950.00,
      avg_supply_cost_usd: 640.00,
      avg_labor_cost_usd: 480.00
    },
    {
      id: 'cer-cpt-27447',
      cpt_code: '27447',
      procedure_label: 'Outpatient Total Knee Arthroplasty',
      specialty: 'Orthopedic Surgery',
      case_count: 13,
      avg_or_duration_minutes: 120,
      avg_net_reimbursement_usd: 11420.00,
      avg_implant_cost_usd: 6850.00,
      avg_supply_cost_usd: 1120.00,
      avg_labor_cost_usd: 910.00
    }
  ];

  const evaluatedCards = seedInputs
    .map(raw => ({ raw, calc: evaluateCptUnitEconomics(raw, config) }))
    .sort((a, b) => b.calc.margin_per_or_hour_usd - a.calc.margin_per_or_hour_usd)
    .map((entry, idx) => ({
      id: entry.raw.id,
      facility_id: facilityId,
      edition_id: edQ4Id,
      cpt_code: entry.raw.cpt_code,
      procedure_label: entry.raw.procedure_label,
      specialty: entry.raw.specialty,
      ...entry.calc,
      rank_in_facility: idx + 1,
      sha256_card_seal: computeCerProvenanceSeal({ cpt_code: entry.raw.cpt_code, period: '2026-Q4' })
    }));

  const totVol = evaluatedCards.reduce((s, c) => s + c.case_count, 0);
  const totReimb = Number(evaluatedCards.reduce((s, c) => s + c.avg_net_reimbursement_usd * c.case_count, 0).toFixed(2));
  const totDirect = Number(evaluatedCards.reduce((s, c) => s + c.avg_direct_cost_usd * c.case_count, 0).toFixed(2));
  const totOverhead = Number(evaluatedCards.reduce((s, c) => s + c.allocated_overhead_per_case_usd * c.case_count, 0).toFixed(2));
  const totNoi = Number((totReimb - totDirect - totOverhead).toFixed(2));
  const totHours = evaluatedCards.reduce((s, c) => s + c.total_or_hours, 0);
  const totContrib = totReimb - totDirect;
  const weightedHr = totHours > 0 ? Number((totContrib / totHours).toFixed(2)) : 0.00;

  const editions = [
    {
      id: edQ4Id,
      facility_id: facilityId,
      edition_code: 'CER-2026-Q4-NAP',
      period_code: '2026-Q4',
      edition_status: 'PUBLISHED',
      cpts_evaluated: evaluatedCards.length,
      total_case_volume: totVol,
      total_net_reimbursement_usd: totReimb,
      total_direct_cost_usd: totDirect,
      total_allocated_overhead_usd: totOverhead,
      total_net_operating_income_usd: totNoi,
      weighted_margin_per_or_hour_usd: weightedHr,
      compiled_by: 'cfo@naplessurgery.com',
      sha256_report_seal: computeCerProvenanceSeal({ facilityId, edition_code: 'CER-2026-Q4-NAP' }),
      created_at: '2026-11-27T07:00:00.000Z'
    }
  ];

  const payerRates = [
    {
      id: 'cpr-29827-bcbs',
      facility_id: facilityId,
      scorecard_id: 'cer-cpt-29827',
      cpt_code: '29827',
      payer_code: 'PYR-BCBS',
      payer_name: 'Florida Blue (BCBS PPO)',
      case_count: 8,
      net_reimbursement_per_case_usd: 8850.00,
      net_margin_per_case_usd: 4780.00,
      medicare_parity_pct: 214.00
    },
    {
      id: 'cpr-29827-med',
      facility_id: facilityId,
      scorecard_id: 'cer-cpt-29827',
      cpt_code: '29827',
      payer_code: 'PYR-MED',
      payer_name: 'Medicare Part B (FCSO MAC)',
      case_count: 6,
      net_reimbursement_per_case_usd: 7140.00,
      net_margin_per_case_usd: 3070.00,
      medicare_parity_pct: 100.00
    },
    {
      id: 'cpr-29827-uhc',
      facility_id: facilityId,
      scorecard_id: 'cer-cpt-29827',
      cpt_code: '29827',
      payer_code: 'PYR-UHC',
      payer_name: 'UnitedHealthcare Commercial',
      case_count: 4,
      net_reimbursement_per_case_usd: 6520.00,
      net_margin_per_case_usd: 2450.00,
      medicare_parity_pct: 158.00
    },
    {
      id: 'cpr-27447-bcbs',
      facility_id: facilityId,
      scorecard_id: 'cer-cpt-27447',
      cpt_code: '27447',
      payer_code: 'PYR-BCBS',
      payer_name: 'Florida Blue (BCBS PPO)',
      case_count: 7,
      net_reimbursement_per_case_usd: 12350.00,
      net_margin_per_case_usd: 3470.00,
      medicare_parity_pct: 148.00
    },
    {
      id: 'cpr-27447-med',
      facility_id: facilityId,
      scorecard_id: 'cer-cpt-27447',
      cpt_code: '27447',
      payer_code: 'PYR-MED',
      payer_name: 'Medicare Part B (FCSO MAC)',
      case_count: 6,
      net_reimbursement_per_case_usd: 10335.00,
      net_margin_per_case_usd: 1455.00,
      medicare_parity_pct: 100.00
    }
  ];

  const optimizationReviews = [
    {
      id: 'crev-29827-1',
      facility_id: facilityId,
      scorecard_id: 'cer-cpt-29827',
      cpt_code: '29827',
      action_type: 'IMPLANT_NEGOTIATION',
      actor_email: 'materials_mgr@naplessurgery.com',
      actor_role: 'Materials Director',
      target_savings_per_case_usd: 420.00,
      notes: 'Negotiate capitated shoulder anchor bundle ($420/case reduction target).',
      sha256_seal: computeCerProvenanceSeal({ rev: 'crev-29827-1' }),
      created_at: '2026-11-27T08:20:00.000Z'
    }
  ];

  const dispatchLogs = [
    {
      id: 'cdsp-q4-01',
      facility_id: facilityId,
      edition_id: edQ4Id,
      rpt_execution_code: 'RPT-H6-RUN-Q4-01',
      delivery_channel: 'PORTAL_INBOX',
      export_format: 'XLSX',
      recipient_count: 4,
      dispatch_status: 'DELIVERED',
      dispatched_by: 'cfo@naplessurgery.com',
      sha256_sync_seal: computeCerProvenanceSeal({ exec: 'RPT-H6-RUN-Q4-01' }),
      created_at: '2026-11-27T08:30:00.000Z'
    }
  ];

  return {
    config,
    benchmarks,
    editions,
    scorecards: evaluatedCards,
    payerRates,
    optimizationReviews,
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
export async function getCerConfig(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return { ...store.config };
}

export async function updateCerConfig(facilityInput, updates = {}) {
  const store = ensureFacilityStore(facilityInput);
  const overhead = Number(updates.facility_overhead_per_or_hour_usd ?? store.config.facility_overhead_per_or_hour_usd);
  const minCases = Number(updates.min_cases_for_statistical_validity ?? store.config.min_cases_for_statistical_validity);
  if (!Number.isFinite(overhead) || overhead < 0) {
    throw new Error('ERR_CER_INVALID_CONFIG: facility_overhead_per_or_hour_usd must be >= 0.');
  }
  if (!Number.isFinite(minCases) || minCases < 1) {
    throw new Error('ERR_CER_INVALID_CONFIG: min_cases_for_statistical_validity must be >= 1.');
  }

  store.config = {
    ...store.config,
    facility_overhead_per_or_hour_usd: Number(overhead.toFixed(2)),
    target_margin_per_or_hour_usd: Number(updates.target_margin_per_or_hour_usd ?? store.config.target_margin_per_or_hour_usd),
    min_contribution_margin_pct: Number(updates.min_contribution_margin_pct ?? store.config.min_contribution_margin_pct),
    min_cases_for_statistical_validity: minCases,
    updated_at: new Date().toISOString()
  };

  return { ...store.config };
}

export async function getCerTelemetry(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  const latest = store.editions[0];
  const latestCards = latest ? store.scorecards.filter(c => c.edition_id === latest.id) : [];
  const anchorCount = latestCards.filter(c => c.economic_quadrant === 'PRIME_YIELD_ANCHOR').length;

  return {
    facility_id: store.config.facility_id,
    latest_edition_code: latest?.edition_code || null,
    period_code: latest?.period_code || null,
    cpts_evaluated: latest?.cpts_evaluated ?? 0,
    total_case_volume: latest?.total_case_volume ?? 0,
    total_net_reimbursement_usd: latest?.total_net_reimbursement_usd ?? 0,
    total_net_operating_income_usd: latest?.total_net_operating_income_usd ?? 0,
    weighted_margin_per_or_hour_usd: latest?.weighted_margin_per_or_hour_usd ?? 0,
    anchor_cpt_count: anchorCount,
    sync_status: store.config.sync_status,
    health_status: store.config.health_status,
    latest_sync_seal: latest?.sha256_report_seal || null
  };
}

export async function getCerSpecialtyBenchmarks(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return store.benchmarks.map(b => ({ ...b }));
}

export async function getCerEditions(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return store.editions.map(e => ({ ...e }));
}

export async function getCerCptScorecards(facilityInput, options = {}) {
  const store = ensureFacilityStore(facilityInput);
  const targetEdId = options.edition_id || store.editions[0]?.id;
  const { specialty, quadrant } = options;

  return store.scorecards
    .filter(c => c.edition_id === targetEdId)
    .filter(c => !specialty || specialty === 'ALL' || c.specialty === specialty)
    .filter(c => !quadrant || quadrant === 'ALL' || c.economic_quadrant === quadrant)
    .sort((a, b) => a.rank_in_facility - b.rank_in_facility)
    .map(c => ({ ...c }));
}

export async function getCerPayerRateMatrix(facilityInput, options = {}) {
  const store = ensureFacilityStore(facilityInput);
  const { scorecard_id: scorecardId, cpt_code: cptCode } = options;
  return store.payerRates
    .filter(r => !scorecardId || r.scorecard_id === scorecardId)
    .filter(r => !cptCode || r.cpt_code === cptCode)
    .map(r => ({ ...r }));
}

export async function getCerOptimizationReviews(facilityInput, scorecardId = null) {
  const store = ensureFacilityStore(facilityInput);
  return store.optimizationReviews
    .filter(r => !scorecardId || r.scorecard_id === scorecardId)
    .map(r => ({ ...r }));
}

export async function getCerDispatchLogs(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return store.dispatchLogs.map(d => ({ ...d }));
}

// ==============================================================================
// Write / Mutation Endpoints
// ==============================================================================

/**
 * Compiles a conserved CPT Economics Report Edition applying minimum case gate
 * and facility overhead allocation.
 */
export async function compileCptEconomicsEdition(facilityInput, params = {}) {
  const store = ensureFacilityStore(facilityInput);
  const now = new Date().toISOString();
  const periodCode = params.period_code || now.slice(0, 7);
  const rawCpts = Array.isArray(params.cpts) && params.cpts.length > 0
    ? params.cpts
    : store.scorecards.filter(c => c.edition_id === store.editions[0]?.id);

  const eligible = rawCpts.filter(
    c => Number(c.case_count ?? 0) >= Number(store.config.min_cases_for_statistical_validity)
  );
  if (eligible.length === 0) {
    throw new Error(
      `ERR_CER_NO_ELIGIBLE_CPTS: No CPT codes meet min_cases_for_statistical_validity >= ${store.config.min_cases_for_statistical_validity}.`
    );
  }

  const edId = `cer-ed-${periodCode.replace(/[^0-9a-zA-Z]/g, '')}-${Date.now()}`;
  const edCode = `CER-${periodCode}-NAP`;

  const evaluated = eligible
    .map(raw => ({ raw, calc: evaluateCptUnitEconomics(raw, store.config) }))
    .sort((a, b) => b.calc.margin_per_or_hour_usd - a.calc.margin_per_or_hour_usd);

  const compiledCards = evaluated.map((entry, idx) => ({
    id: `cer-cpt-${entry.raw.cpt_code}-${Date.now()}-${idx}`,
    facility_id: store.config.facility_id,
    edition_id: edId,
    cpt_code: entry.raw.cpt_code,
    procedure_label: entry.raw.procedure_label,
    specialty: entry.raw.specialty,
    ...entry.calc,
    rank_in_facility: idx + 1,
    sha256_card_seal: computeCerProvenanceSeal({
      edition_code: edCode,
      cpt_code: entry.raw.cpt_code,
      margin_per_or_hour: entry.calc.margin_per_or_hour_usd,
      now
    })
  }));

  const totVol = compiledCards.reduce((s, c) => s + c.case_count, 0);
  const totReimb = Number(compiledCards.reduce((s, c) => s + c.avg_net_reimbursement_usd * c.case_count, 0).toFixed(2));
  const totDirect = Number(compiledCards.reduce((s, c) => s + c.avg_direct_cost_usd * c.case_count, 0).toFixed(2));
  const totOverhead = Number(compiledCards.reduce((s, c) => s + c.allocated_overhead_per_case_usd * c.case_count, 0).toFixed(2));
  const totNoi = Number((totReimb - totDirect - totOverhead).toFixed(2));
  const totHours = compiledCards.reduce((s, c) => s + c.total_or_hours, 0);
  const weightedHr = totHours > 0 ? Number(((totReimb - totDirect) / totHours).toFixed(2)) : 0.00;

  verifyEditionConservation({
    total_net_reimbursement_usd: totReimb,
    total_direct_cost_usd: totDirect,
    total_allocated_overhead_usd: totOverhead,
    total_net_operating_income_usd: totNoi
  });

  const newEdition = {
    id: edId,
    facility_id: store.config.facility_id,
    edition_code: edCode,
    period_code: periodCode,
    edition_status: 'PUBLISHED',
    cpts_evaluated: compiledCards.length,
    total_case_volume: totVol,
    total_net_reimbursement_usd: totReimb,
    total_direct_cost_usd: totDirect,
    total_allocated_overhead_usd: totOverhead,
    total_net_operating_income_usd: totNoi,
    weighted_margin_per_or_hour_usd: weightedHr,
    compiled_by: params.actor_email || 'cfo@naplessurgery.com',
    sha256_report_seal: computeCerProvenanceSeal({ edCode, totNoi, weightedHr, now }),
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
 * Records a sealed cost optimization / preference-card / rate carve-out review action.
 */
export async function recordCostOptimizationReview(facilityInput, scorecardId, payload = {}) {
  const store = ensureFacilityStore(facilityInput);
  const card = store.scorecards.find(c => c.id === scorecardId || c.cpt_code === scorecardId);
  if (!card) {
    throw new Error(`ERR_CER_SCORECARD_NOT_FOUND: CPT scorecard "${scorecardId}" not found.`);
  }

  const actionType = payload.action_type || 'IMPLANT_NEGOTIATION';
  if (!CANONICAL_OPTIMIZATION_ACTIONS.includes(actionType)) {
    throw new Error(`ERR_CER_INVALID_ACTION: Unsupported action_type "${actionType}".`);
  }

  const targetSavings = Number(payload.target_savings_per_case_usd ?? 0);
  if (!Number.isFinite(targetSavings) || targetSavings < 0) {
    throw new Error('ERR_CER_INVALID_SAVINGS: target_savings_per_case_usd must be >= 0.');
  }

  const notes = String(payload.notes || '').trim();
  if (notes.length < 5) {
    throw new Error('ERR_CER_NOTE_REQUIRED: Optimization notes must be at least 5 characters.');
  }

  const now = new Date().toISOString();
  const actorEmail = payload.actor_email || 'materials_mgr@naplessurgery.com';
  const actorRole = payload.actor_role || 'Materials Director';
  const seal = computeCerProvenanceSeal({
    scorecard_id: card.id,
    actionType,
    targetSavings,
    notes,
    actorEmail,
    now
  });

  const entry = {
    id: `crev-${Date.now()}`,
    facility_id: store.config.facility_id,
    scorecard_id: card.id,
    cpt_code: card.cpt_code,
    action_type: actionType,
    actor_email: actorEmail,
    actor_role: actorRole,
    target_savings_per_case_usd: Number(targetSavings.toFixed(2)),
    notes,
    sha256_seal: seal,
    created_at: now
  };

  store.optimizationReviews.unshift(entry);
  return entry;
}

/**
 * Dispatches CPT Economics Edition via Phase H0 (`RPT-H6-CPT-ECON`).
 */
export async function dispatchCptEconomicsDigest(facilityInput, editionId, options = {}) {
  const store = ensureFacilityStore(facilityInput);
  const ed = store.editions.find(e => e.id === editionId || e.edition_code === editionId);
  if (!ed) {
    throw new Error(`ERR_CER_EDITION_NOT_FOUND: Edition "${editionId}" not found.`);
  }

  const now = new Date().toISOString();
  const execCode = `RPT-H6-RUN-${Date.now()}`;
  const seal = computeCerProvenanceSeal({ edition_id: ed.id, execCode, now });

  const log = {
    id: `cdsp-${Date.now()}`,
    facility_id: store.config.facility_id,
    edition_id: ed.id,
    rpt_execution_code: execCode,
    delivery_channel: options.delivery_channel || 'PORTAL_INBOX',
    export_format: options.export_format || 'XLSX',
    recipient_count: Number(options.recipient_count ?? 4),
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
  CANONICAL_ECONOMIC_QUADRANTS,
  CANONICAL_OPTIMIZATION_ACTIONS,
  normalizeFacilityId,
  computeCerProvenanceSeal,
  maskCerSecret,
  evaluateCptUnitEconomics,
  verifyEditionConservation,
  getCerConfig,
  updateCerConfig,
  getCerTelemetry,
  getCerSpecialtyBenchmarks,
  getCerEditions,
  getCerCptScorecards,
  getCerPayerRateMatrix,
  getCerOptimizationReviews,
  getCerDispatchLogs,
  compileCptEconomicsEdition,
  recordCostOptimizationReview,
  dispatchCptEconomicsDigest
};
