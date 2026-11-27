/**
 * ==============================================================================
 * Service: surgeonScorecardReportService.js
 * Module 17: Enterprise Reporting & Executive Packages (Phase H4)
 * Description: Surgeon Scorecard Compiler, Specialty Peer Benchmarks,
 *              Conserved 4-Pillar Composite Scoring (100.00% weights),
 *              Role-Aware Peer Anonymization, Confidential Peer Review Log,
 *              and H0 (RPT-H4-SURGEON-CARD) Dispatch with SHA-256 Seals.
 * ==============================================================================
 */

import { sha256Hex } from '../utils/isomorphicSha256.js';

export const NAPLES_FACILITY_ID = '00000000-0000-0000-0000-000000000002';

export const CANONICAL_PERFORMANCE_TIERS = [
  'TOP_QUARTILE_ELITE',
  'ABOVE_BENCHMARK',
  'WATCH_COACHING',
  'ACTION_REQUIRED'
];

export const CANONICAL_REVIEW_ACTIONS = [
  'MEDICAL_DIR_REVIEW',
  'SUPPLY_COACHING',
  'COMMENDATION',
  'SURGEON_ACK'
];

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

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
 * Computes an immutable 64-character SHA-256 provenance seal prefixed with `sha256_ssr_`.
 */
export function computeSsrProvenanceSeal(payload) {
  const canonicalJson = JSON.stringify(payload || {});
  const digest = sha256Hex(canonicalJson);
  return `sha256_ssr_${digest.slice(0, 53)}`;
}

/**
 * Masks scorecard engine secrets strictly as `ssr_sec_****_...`.
 */
export function maskSsrSecret(rawSecret) {
  if (!rawSecret) return 'ssr_sec_****_unset';
  const str = String(rawSecret);
  if (str.startsWith('ssr_sec_****_')) return str;
  return `ssr_sec_****_${str.slice(-4)}`;
}

/**
 * Validates that the 4 scoring pillar weights conserve exact 100.00%.
 */
export function validateScorecardWeights(weights = {}) {
  const wMargin = Number(weights.weight_contribution_margin_pct ?? 35);
  const wEff = Number(weights.weight_or_efficiency_pct ?? 25);
  const wSupply = Number(weights.weight_supply_discipline_pct ?? 25);
  const wDoc = Number(weights.weight_documentation_quality_pct ?? 15);

  const items = [wMargin, wEff, wSupply, wDoc];
  if (items.some(v => !Number.isFinite(v) || v < 0 || v > 100)) {
    throw new Error('ERR_SSR_INVALID_WEIGHT_SUM: Individual pillar weights must be between 0 and 100.');
  }
  const total = Number((wMargin + wEff + wSupply + wDoc).toFixed(2));
  if (Math.abs(total - 100) > 0.01) {
    throw new Error(
      `ERR_SSR_INVALID_WEIGHT_SUM: 4-pillar weights sum to ${total.toFixed(2)}%, must equal 100.00%.`
    );
  }
  return {
    weight_contribution_margin_pct: Number(wMargin.toFixed(2)),
    weight_or_efficiency_pct: Number(wEff.toFixed(2)),
    weight_supply_discipline_pct: Number(wSupply.toFixed(2)),
    weight_documentation_quality_pct: Number(wDoc.toFixed(2)),
    total_weight_pct: 100.00
  };
}

/**
 * Deterministically evaluates a surgeon's 4-pillar normalized scores, composite index, and tier.
 */
export function evaluateSurgeonScorecard(surgeonMetrics = {}, benchmark = {}, config = {}) {
  const weights = validateScorecardWeights(config);
  const netRev = Number(surgeonMetrics.net_revenue_usd ?? 0);
  const directCost = Number(surgeonMetrics.direct_cost_usd ?? 0);
  const contributionMargin = Number(
    (surgeonMetrics.contribution_margin_usd ?? (netRev - directCost)).toFixed(2)
  );
  const orHours = Number(surgeonMetrics.total_or_hours ?? 0);
  const marginPerOrHour = orHours > 0 ? Number((contributionMargin / orHours).toFixed(2)) : 0.00;

  const medianHr = Math.max(Number(benchmark.median_margin_per_or_hour_usd ?? 2400), 1);
  const topQHr = Math.max(Number(benchmark.top_quartile_margin_per_or_hour_usd ?? 3200), medianHr + 1);
  let marginScore = 0;
  if (marginPerOrHour >= topQHr) {
    marginScore = clamp(90 + ((marginPerOrHour - topQHr) / topQHr) * 20, 0, 100);
  } else if (marginPerOrHour >= medianHr) {
    marginScore = 75 + ((marginPerOrHour - medianHr) / (topQHr - medianHr)) * 15;
  } else if (marginPerOrHour > 0) {
    marginScore = clamp((marginPerOrHour / medianHr) * 75, 0, 75);
  }

  const avgTurnover = Number(surgeonMetrics.avg_turnover_minutes ?? 18);
  const benchTurnover = Math.max(Number(benchmark.benchmark_turnover_minutes ?? 18), 1);
  const efficiencyScore = avgTurnover <= benchTurnover
    ? clamp(90 + ((benchTurnover - avgTurnover) / benchTurnover) * 15, 0, 100)
    : clamp(90 - ((avgTurnover - benchTurnover) / benchTurnover) * 50, 0, 100);

  const prefVar = Number(surgeonMetrics.preference_card_variance_pct ?? 0);
  const benchVar = Math.max(Number(benchmark.benchmark_supply_variance_pct ?? 3.0), 0.5);
  const supplyScore = prefVar <= benchVar
    ? clamp(92 + Math.max(0, benchVar - prefVar) * 2.5, 0, 100)
    : clamp(92 - (prefVar - benchVar) * 9, 0, 100);

  const docCompleteness = Number(surgeonMetrics.doc_completeness_pct ?? 95);
  const docScore = clamp(docCompleteness, 0, 100);

  const composite = Number((
    marginScore * (weights.weight_contribution_margin_pct / 100) +
    efficiencyScore * (weights.weight_or_efficiency_pct / 100) +
    supplyScore * (weights.weight_supply_discipline_pct / 100) +
    docScore * (weights.weight_documentation_quality_pct / 100)
  ).toFixed(2));

  let performanceTier = 'ACTION_REQUIRED';
  if (composite >= 85) performanceTier = 'TOP_QUARTILE_ELITE';
  else if (composite >= 70) performanceTier = 'ABOVE_BENCHMARK';
  else if (composite >= 55) performanceTier = 'WATCH_COACHING';

  return {
    contribution_margin_usd: contributionMargin,
    margin_per_or_hour_usd: marginPerOrHour,
    pillar_scores: {
      contribution_margin_score: Number(marginScore.toFixed(2)),
      or_efficiency_score: Number(efficiencyScore.toFixed(2)),
      supply_discipline_score: Number(supplyScore.toFixed(2)),
      documentation_quality_score: Number(docScore.toFixed(2))
    },
    composite_score: composite,
    performance_tier: performanceTier
  };
}

// ==============================================================================
// In-Memory Deterministic Store (Multi-Tenant Safe)
// ==============================================================================
const facilityStores = new Map();

function buildInitialStore(facilityId) {
  const edNovId = 'ssr-ed-202611';

  const config = {
    facility_id: facilityId,
    weight_contribution_margin_pct: 35.00,
    weight_or_efficiency_pct: 25.00,
    weight_supply_discipline_pct: 25.00,
    weight_documentation_quality_pct: 15.00,
    anonymize_peer_names_for_surgeon_view: true,
    min_cases_for_benchmark: 10,
    client_secret_encrypted: 'ssr_sec_****_naples_4418',
    sync_status: 'ACTIVE',
    health_status: 'HEALTHY',
    updated_at: '2026-11-27T07:00:00.000Z'
  };

  const benchmarks = [
    {
      id: 'bench-ortho',
      facility_id: facilityId,
      specialty: 'Orthopedic Surgery',
      median_margin_per_or_hour_usd: 2950.00,
      top_quartile_margin_per_or_hour_usd: 3850.00,
      benchmark_turnover_minutes: 19,
      benchmark_supply_variance_pct: 3.50,
      benchmark_doc_completeness_pct: 95.00
    },
    {
      id: 'bench-sports',
      facility_id: facilityId,
      specialty: 'Sports Medicine',
      median_margin_per_or_hour_usd: 2700.00,
      top_quartile_margin_per_or_hour_usd: 3500.00,
      benchmark_turnover_minutes: 18,
      benchmark_supply_variance_pct: 3.00,
      benchmark_doc_completeness_pct: 96.00
    },
    {
      id: 'bench-spine',
      facility_id: facilityId,
      specialty: 'Pain / Spine',
      median_margin_per_or_hour_usd: 2350.00,
      top_quartile_margin_per_or_hour_usd: 3100.00,
      benchmark_turnover_minutes: 15,
      benchmark_supply_variance_pct: 2.50,
      benchmark_doc_completeness_pct: 97.00
    },
    {
      id: 'bench-ophth',
      facility_id: facilityId,
      specialty: 'Ophthalmology',
      median_margin_per_or_hour_usd: 2100.00,
      top_quartile_margin_per_or_hour_usd: 2750.00,
      benchmark_turnover_minutes: 14,
      benchmark_supply_variance_pct: 2.00,
      benchmark_doc_completeness_pct: 98.00
    }
  ];

  const editionSeal = computeSsrProvenanceSeal({
    facilityId,
    edition_code: 'SSR-2026-11-NAP',
    period_code: '2026-11'
  });

  const editions = [
    {
      id: edNovId,
      facility_id: facilityId,
      edition_code: 'SSR-2026-11-NAP',
      period_code: '2026-11',
      edition_status: 'PUBLISHED',
      surgeons_evaluated: 4,
      avg_composite_score: 83.40,
      total_facility_surgeon_margin_usd: 706240.00,
      compiled_by: 'medical_dir@naplessurgery.com',
      sha256_report_seal: editionSeal,
      created_at: '2026-11-27T07:00:00.000Z'
    }
  ];

  const scorecards = [
    {
      id: 'card-mal',
      facility_id: facilityId,
      edition_id: edNovId,
      surgeon_code: 'SRG-MAL',
      surgeon_name: 'Dr. Malinoski Kelly',
      specialty: 'Orthopedic Surgery',
      npi: '1982736450',
      completed_cases: 48,
      total_or_hours: 62.50,
      net_revenue_usd: 412000.00,
      direct_cost_usd: 148550.00,
      contribution_margin_usd: 263450.00,
      margin_per_or_hour_usd: 4215.20,
      avg_turnover_minutes: 17,
      preference_card_variance_pct: 1.80,
      doc_completeness_pct: 97.50,
      composite_score: 92.40,
      performance_tier: 'TOP_QUARTILE_ELITE',
      rank_in_facility: 1,
      pillar_scores: {
        contribution_margin_score: 94.80,
        or_efficiency_score: 91.58,
        supply_discipline_score: 96.25,
        documentation_quality_score: 97.50
      },
      sha256_card_seal: computeSsrProvenanceSeal({ surgeon_code: 'SRG-MAL', period: '2026-11' })
    },
    {
      id: 'card-gar',
      facility_id: facilityId,
      edition_id: edNovId,
      surgeon_code: 'SRG-GAR',
      surgeon_name: 'Dr. Gardner Paul',
      specialty: 'Sports Medicine',
      npi: '1456789012',
      completed_cases: 36,
      total_or_hours: 51.00,
      net_revenue_usd: 329000.00,
      direct_cost_usd: 113370.00,
      contribution_margin_usd: 215630.00,
      margin_per_or_hour_usd: 4228.04,
      avg_turnover_minutes: 18,
      preference_card_variance_pct: 2.40,
      doc_completeness_pct: 95.80,
      composite_score: 88.60,
      performance_tier: 'TOP_QUARTILE_ELITE',
      rank_in_facility: 2,
      pillar_scores: {
        contribution_margin_score: 94.16,
        or_efficiency_score: 90.00,
        supply_discipline_score: 93.50,
        documentation_quality_score: 95.80
      },
      sha256_card_seal: computeSsrProvenanceSeal({ surgeon_code: 'SRG-GAR', period: '2026-11' })
    },
    {
      id: 'card-bon',
      facility_id: facilityId,
      edition_id: edNovId,
      surgeon_code: 'SRG-BON',
      surgeon_name: 'Dr. Bonett Andrew',
      specialty: 'Pain / Spine',
      npi: '1345678901',
      completed_cases: 41,
      total_or_hours: 49.50,
      net_revenue_usd: 268000.00,
      direct_cost_usd: 110150.00,
      contribution_margin_usd: 157850.00,
      margin_per_or_hour_usd: 3188.89,
      avg_turnover_minutes: 16,
      preference_card_variance_pct: 4.90,
      doc_completeness_pct: 92.40,
      composite_score: 79.10,
      performance_tier: 'ABOVE_BENCHMARK',
      rank_in_facility: 3,
      pillar_scores: {
        contribution_margin_score: 90.57,
        or_efficiency_score: 86.67,
        supply_discipline_score: 70.40,
        documentation_quality_score: 92.40
      },
      sha256_card_seal: computeSsrProvenanceSeal({ surgeon_code: 'SRG-BON', period: '2026-11' })
    },
    {
      id: 'card-wal',
      facility_id: facilityId,
      edition_id: edNovId,
      surgeon_code: 'SRG-WAL',
      surgeon_name: 'Dr. Walsh Mark',
      specialty: 'Ophthalmology',
      npi: '1234567890',
      completed_cases: 28,
      total_or_hours: 34.00,
      net_revenue_usd: 134500.00,
      direct_cost_usd: 65190.00,
      contribution_margin_usd: 69310.00,
      margin_per_or_hour_usd: 2038.53,
      avg_turnover_minutes: 21,
      preference_card_variance_pct: 6.20,
      doc_completeness_pct: 89.20,
      composite_score: 73.50,
      performance_tier: 'ABOVE_BENCHMARK',
      rank_in_facility: 4,
      pillar_scores: {
        contribution_margin_score: 72.80,
        or_efficiency_score: 65.00,
        supply_discipline_score: 54.20,
        documentation_quality_score: 89.20
      },
      sha256_card_seal: computeSsrProvenanceSeal({ surgeon_code: 'SRG-WAL', period: '2026-11' })
    }
  ];

  const cptMix = [
    {
      id: 'cpt-mal-29881',
      facility_id: facilityId,
      scorecard_id: 'card-mal',
      surgeon_code: 'SRG-MAL',
      cpt_code: '29881',
      procedure_label: 'Knee Arthroscopy w/ Meniscectomy',
      case_count: 22,
      avg_margin_per_case_usd: 4820.00,
      implant_cost_per_case_usd: 680.00,
      variance_vs_peer_pct: -4.20
    },
    {
      id: 'cpt-mal-29827',
      facility_id: facilityId,
      scorecard_id: 'card-mal',
      surgeon_code: 'SRG-MAL',
      cpt_code: '29827',
      procedure_label: 'Arthroscopic Rotator Cuff Repair',
      case_count: 16,
      avg_margin_per_case_usd: 6140.00,
      implant_cost_per_case_usd: 1840.00,
      variance_vs_peer_pct: 2.10
    },
    {
      id: 'cpt-mal-27447',
      facility_id: facilityId,
      scorecard_id: 'card-mal',
      surgeon_code: 'SRG-MAL',
      cpt_code: '27447',
      procedure_label: 'Total Knee Arthroplasty (Outpatient)',
      case_count: 10,
      avg_margin_per_case_usd: 5917.00,
      implant_cost_per_case_usd: 3420.00,
      variance_vs_peer_pct: -1.50
    },
    {
      id: 'cpt-gar-29888',
      facility_id: facilityId,
      scorecard_id: 'card-gar',
      surgeon_code: 'SRG-GAR',
      cpt_code: '29888',
      procedure_label: 'Arthroscopic ACL Reconstruction',
      case_count: 19,
      avg_margin_per_case_usd: 6410.00,
      implant_cost_per_case_usd: 2150.00,
      variance_vs_peer_pct: 1.80
    },
    {
      id: 'cpt-bon-64483',
      facility_id: facilityId,
      scorecard_id: 'card-bon',
      surgeon_code: 'SRG-BON',
      cpt_code: '64483',
      procedure_label: 'Lumbar Transforaminal Epidural',
      case_count: 25,
      avg_margin_per_case_usd: 3120.00,
      implant_cost_per_case_usd: 410.00,
      variance_vs_peer_pct: 5.40
    },
    {
      id: 'cpt-wal-66984',
      facility_id: facilityId,
      scorecard_id: 'card-wal',
      surgeon_code: 'SRG-WAL',
      cpt_code: '66984',
      procedure_label: 'Extracapsular Cataract Removal w/ IOL',
      case_count: 28,
      avg_margin_per_case_usd: 2475.36,
      implant_cost_per_case_usd: 590.00,
      variance_vs_peer_pct: 6.20
    }
  ];

  const peerReviews = [
    {
      id: 'rev-mal-1',
      facility_id: facilityId,
      scorecard_id: 'card-mal',
      surgeon_code: 'SRG-MAL',
      action_type: 'COMMENDATION',
      actor_email: 'medical_dir@naplessurgery.com',
      actor_role: 'Medical Director',
      notes: 'Top-quartile OR contribution ($4,215/OR hr) with -1.8% preference card savings.',
      sha256_seal: computeSsrProvenanceSeal({ review: 'rev-mal-1' }),
      created_at: '2026-11-27T08:15:00.000Z'
    }
  ];

  const dispatchLogs = [
    {
      id: 'sdsp-nov-01',
      facility_id: facilityId,
      edition_id: edNovId,
      rpt_execution_code: 'RPT-H4-RUN-NOV-01',
      delivery_channel: 'PORTAL_INBOX',
      export_format: 'PDF',
      recipient_count: 4,
      dispatch_status: 'DELIVERED',
      dispatched_by: 'medical_dir@naplessurgery.com',
      sha256_sync_seal: computeSsrProvenanceSeal({ exec: 'RPT-H4-RUN-NOV-01' }),
      created_at: '2026-11-27T08:30:00.000Z'
    }
  ];

  return {
    config,
    benchmarks,
    editions,
    scorecards,
    cptMix,
    peerReviews,
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
export async function getSsrConfig(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return { ...store.config };
}

export async function updateSsrConfig(facilityInput, updates = {}) {
  const store = ensureFacilityStore(facilityInput);
  const nextCandidate = {
    weight_contribution_margin_pct:
      updates.weight_contribution_margin_pct ?? store.config.weight_contribution_margin_pct,
    weight_or_efficiency_pct:
      updates.weight_or_efficiency_pct ?? store.config.weight_or_efficiency_pct,
    weight_supply_discipline_pct:
      updates.weight_supply_discipline_pct ?? store.config.weight_supply_discipline_pct,
    weight_documentation_quality_pct:
      updates.weight_documentation_quality_pct ?? store.config.weight_documentation_quality_pct
  };

  const validated = validateScorecardWeights(nextCandidate);
  const minCases = updates.min_cases_for_benchmark ?? store.config.min_cases_for_benchmark;
  if (!Number.isFinite(Number(minCases)) || Number(minCases) < 1) {
    throw new Error('ERR_SSR_INVALID_CONFIG: min_cases_for_benchmark must be >= 1.');
  }

  store.config = {
    ...store.config,
    weight_contribution_margin_pct: validated.weight_contribution_margin_pct,
    weight_or_efficiency_pct: validated.weight_or_efficiency_pct,
    weight_supply_discipline_pct: validated.weight_supply_discipline_pct,
    weight_documentation_quality_pct: validated.weight_documentation_quality_pct,
    anonymize_peer_names_for_surgeon_view:
      updates.anonymize_peer_names_for_surgeon_view !== undefined
        ? Boolean(updates.anonymize_peer_names_for_surgeon_view)
        : store.config.anonymize_peer_names_for_surgeon_view,
    min_cases_for_benchmark: Number(minCases),
    updated_at: new Date().toISOString()
  };

  return { ...store.config };
}

export async function getSsrTelemetry(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  const latest = store.editions[0];
  const latestCards = latest
    ? store.scorecards.filter(c => c.edition_id === latest.id)
    : [];
  const topQuartileCount = latestCards.filter(
    c => c.performance_tier === 'TOP_QUARTILE_ELITE'
  ).length;

  return {
    facility_id: store.config.facility_id,
    latest_edition_code: latest?.edition_code || null,
    period_code: latest?.period_code || null,
    surgeons_evaluated: latest?.surgeons_evaluated ?? 0,
    avg_composite_score: latest?.avg_composite_score ?? 0,
    total_surgeon_margin_usd: latest?.total_facility_surgeon_margin_usd ?? 0,
    top_quartile_count: topQuartileCount,
    anonymize_peer_names_for_surgeon_view: store.config.anonymize_peer_names_for_surgeon_view,
    sync_status: store.config.sync_status,
    health_status: store.config.health_status,
    latest_sync_seal: latest?.sha256_report_seal || null
  };
}

export async function getSsrSpecialtyBenchmarks(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return store.benchmarks.map(b => ({ ...b }));
}

export async function getSsrEditions(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return store.editions.map(e => ({ ...e }));
}

/**
 * Returns facility surgeon scorecards filtered by edition & specialty.
 * Enforces peer anonymization when `actor_role === 'Surgeon Self-View'`
 * and `config.anonymize_peer_names_for_surgeon_view` is enabled.
 */
export async function getSsrSurgeonScorecards(facilityInput, options = {}) {
  const store = ensureFacilityStore(facilityInput);
  const targetEdId = options.edition_id || store.editions[0]?.id;
  const specialty = options.specialty;
  const actorRole = options.actor_role || 'Executive / Medical Director';
  const viewerSurgeonCode = options.viewer_surgeon_code || 'SRG-MAL';
  const shouldAnonymizePeers =
    Boolean(store.config.anonymize_peer_names_for_surgeon_view) &&
    actorRole === 'Surgeon Self-View';

  return store.scorecards
    .filter(c => c.edition_id === targetEdId)
    .filter(c => !specialty || specialty === 'ALL' || c.specialty === specialty)
    .sort((a, b) => a.rank_in_facility - b.rank_in_facility)
    .map(c => {
      const isSelf = c.surgeon_code === viewerSurgeonCode;
      if (shouldAnonymizePeers && !isSelf) {
        return {
          ...c,
          surgeon_name: `Peer Surgeon #${c.rank_in_facility}`,
          npi: '**********',
          is_anonymized_peer: true
        };
      }
      return {
        ...c,
        is_anonymized_peer: false
      };
    });
}

export async function getSsrCptMix(facilityInput, options = {}) {
  const store = ensureFacilityStore(facilityInput);
  const { scorecard_id: scorecardId, surgeon_code: surgeonCode } = options;
  return store.cptMix
    .filter(row => !scorecardId || row.scorecard_id === scorecardId)
    .filter(row => !surgeonCode || row.surgeon_code === surgeonCode)
    .map(row => ({ ...row }));
}

export async function getSsrPeerReviews(facilityInput, scorecardId = null) {
  const store = ensureFacilityStore(facilityInput);
  return store.peerReviews
    .filter(r => !scorecardId || r.scorecard_id === scorecardId)
    .map(r => ({ ...r }));
}

export async function getSsrDispatchLogs(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return store.dispatchLogs.map(d => ({ ...d }));
}

// ==============================================================================
// Write / Mutation Endpoints
// ==============================================================================

/**
 * Compiles a new period's Surgeon Scorecard Edition cleanly, filtering out
 * surgeons below `config.min_cases_for_benchmark` and ranking descending.
 */
export async function compileSurgeonScorecardEdition(facilityInput, params = {}) {
  const store = ensureFacilityStore(facilityInput);
  const now = new Date().toISOString();
  const periodCode = params.period_code || now.slice(0, 7);
  const rawSurgeons = Array.isArray(params.surgeons) && params.surgeons.length > 0
    ? params.surgeons
    : store.scorecards.filter(c => c.edition_id === store.editions[0]?.id).map(c => ({
        surgeon_code: c.surgeon_code,
        surgeon_name: c.surgeon_name,
        specialty: c.specialty,
        npi: c.npi,
        completed_cases: c.completed_cases,
        total_or_hours: c.total_or_hours,
        net_revenue_usd: c.net_revenue_usd,
        direct_cost_usd: c.direct_cost_usd,
        avg_turnover_minutes: c.avg_turnover_minutes,
        preference_card_variance_pct: c.preference_card_variance_pct,
        doc_completeness_pct: c.doc_completeness_pct
      }));

  const eligible = rawSurgeons.filter(
    s => Number(s.completed_cases ?? 0) >= Number(store.config.min_cases_for_benchmark)
  );

  if (eligible.length === 0) {
    throw new Error(
      `ERR_SSR_NO_ELIGIBLE_SURGEONS: No surgeons meet min_cases_for_benchmark >= ${store.config.min_cases_for_benchmark}.`
    );
  }

  const edId = `ssr-ed-${periodCode.replace(/[^0-9a-zA-Z]/g, '')}-${Date.now()}`;
  const edCode = `SSR-${periodCode}-NAP`;

  const evaluated = eligible.map(s => {
    const bench = store.benchmarks.find(b => b.specialty === s.specialty) || store.benchmarks[0];
    const calc = evaluateSurgeonScorecard(s, bench, store.config);
    return {
      raw: s,
      calc
    };
  });

  evaluated.sort((a, b) => b.calc.composite_score - a.calc.composite_score);

  const compiledCards = evaluated.map((entry, idx) => ({
    id: `card-${entry.raw.surgeon_code.toLowerCase()}-${Date.now()}-${idx}`,
    facility_id: store.config.facility_id,
    edition_id: edId,
    surgeon_code: entry.raw.surgeon_code,
    surgeon_name: entry.raw.surgeon_name,
    specialty: entry.raw.specialty,
    npi: entry.raw.npi || '0000000000',
    completed_cases: Number(entry.raw.completed_cases),
    total_or_hours: Number(entry.raw.total_or_hours),
    net_revenue_usd: Number(entry.raw.net_revenue_usd),
    direct_cost_usd: Number(entry.raw.direct_cost_usd),
    contribution_margin_usd: entry.calc.contribution_margin_usd,
    margin_per_or_hour_usd: entry.calc.margin_per_or_hour_usd,
    avg_turnover_minutes: Number(entry.raw.avg_turnover_minutes),
    preference_card_variance_pct: Number(entry.raw.preference_card_variance_pct),
    doc_completeness_pct: Number(entry.raw.doc_completeness_pct),
    composite_score: entry.calc.composite_score,
    performance_tier: entry.calc.performance_tier,
    rank_in_facility: idx + 1,
    pillar_scores: entry.calc.pillar_scores,
    sha256_card_seal: computeSsrProvenanceSeal({
      edition_code: edCode,
      surgeon_code: entry.raw.surgeon_code,
      composite_score: entry.calc.composite_score,
      now
    })
  }));

  const totalMargin = Number(
    compiledCards.reduce((sum, c) => sum + c.contribution_margin_usd, 0).toFixed(2)
  );
  const avgComposite = Number(
    (compiledCards.reduce((sum, c) => sum + c.composite_score, 0) / compiledCards.length).toFixed(2)
  );

  const newEdition = {
    id: edId,
    facility_id: store.config.facility_id,
    edition_code: edCode,
    period_code: periodCode,
    edition_status: 'PUBLISHED',
    surgeons_evaluated: compiledCards.length,
    avg_composite_score: avgComposite,
    total_facility_surgeon_margin_usd: totalMargin,
    compiled_by: params.actor_email || 'medical_dir@naplessurgery.com',
    sha256_report_seal: computeSsrProvenanceSeal({ edCode, totalMargin, avgComposite, now }),
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
 * Records a confidential peer review / commendation / supply coaching entry.
 */
export async function recordSurgeonPeerReview(facilityInput, scorecardId, payload = {}) {
  const store = ensureFacilityStore(facilityInput);
  const card = store.scorecards.find(c => c.id === scorecardId || c.surgeon_code === scorecardId);
  if (!card) {
    throw new Error(`ERR_SSR_SCORECARD_NOT_FOUND: Scorecard "${scorecardId}" not found.`);
  }

  const actionType = payload.action_type || 'MEDICAL_DIR_REVIEW';
  if (!CANONICAL_REVIEW_ACTIONS.includes(actionType)) {
    throw new Error(`ERR_SSR_INVALID_ACTION: Unsupported action_type "${actionType}".`);
  }

  const notes = String(payload.notes || '').trim();
  if (notes.length < 5) {
    throw new Error('ERR_SSR_NOTE_REQUIRED: Peer review notes must be at least 5 characters.');
  }

  const now = new Date().toISOString();
  const actorEmail = payload.actor_email || 'medical_dir@naplessurgery.com';
  const actorRole = payload.actor_role || 'Medical Director';
  const seal = computeSsrProvenanceSeal({
    scorecard_id: card.id,
    actionType,
    notes,
    actorEmail,
    now
  });

  const entry = {
    id: `rev-${Date.now()}`,
    facility_id: store.config.facility_id,
    scorecard_id: card.id,
    surgeon_code: card.surgeon_code,
    action_type: actionType,
    actor_email: actorEmail,
    actor_role: actorRole,
    notes,
    sha256_seal: seal,
    created_at: now
  };

  store.peerReviews.unshift(entry);
  return entry;
}

/**
 * Dispatches confidential Surgeon Scorecard Edition via Phase H0 (`RPT-H4-SURGEON-CARD`).
 */
export async function dispatchSurgeonScorecardDigest(facilityInput, editionId, options = {}) {
  const store = ensureFacilityStore(facilityInput);
  const ed = store.editions.find(e => e.id === editionId || e.edition_code === editionId);
  if (!ed) {
    throw new Error(`ERR_SSR_EDITION_NOT_FOUND: Edition "${editionId}" not found.`);
  }

  const now = new Date().toISOString();
  const execCode = `RPT-H4-RUN-${Date.now()}`;
  const seal = computeSsrProvenanceSeal({ edition_id: ed.id, execCode, now });

  const log = {
    id: `sdsp-${Date.now()}`,
    facility_id: store.config.facility_id,
    edition_id: ed.id,
    rpt_execution_code: execCode,
    delivery_channel: options.delivery_channel || 'PORTAL_INBOX',
    export_format: options.export_format || 'PDF',
    recipient_count: Number(options.recipient_count ?? ed.surgeons_evaluated ?? 4),
    dispatch_status: 'DELIVERED',
    dispatched_by: options.actor_email || 'medical_dir@naplessurgery.com',
    sha256_sync_seal: seal,
    created_at: now
  };

  store.dispatchLogs.unshift(log);
  return log;
}

export default {
  NAPLES_FACILITY_ID,
  CANONICAL_PERFORMANCE_TIERS,
  CANONICAL_REVIEW_ACTIONS,
  normalizeFacilityId,
  computeSsrProvenanceSeal,
  maskSsrSecret,
  validateScorecardWeights,
  evaluateSurgeonScorecard,
  getSsrConfig,
  updateSsrConfig,
  getSsrTelemetry,
  getSsrSpecialtyBenchmarks,
  getSsrEditions,
  getSsrSurgeonScorecards,
  getSsrCptMix,
  getSsrPeerReviews,
  getSsrDispatchLogs,
  compileSurgeonScorecardEdition,
  recordSurgeonPeerReview,
  dispatchSurgeonScorecardDigest
};
