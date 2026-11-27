/**
 * ==============================================================================
 * Service: payerScorecardReportService.js
 * Module 17: Enterprise Reporting & Executive Packages (Phase H5)
 * Description: Payer Scorecard Compiler, Category Benchmarks,
 *              Conserved 4-Pillar Composite Grading (100.00% weights),
 *              Contract Yield & Underpayment Leakage Reconciliation,
 *              Negotiation & Demand Action Log, and H0 (RPT-H5-PAYER-CARD)
 *              Dispatch with SHA-256 Provenance Seals.
 * ==============================================================================
 */

import { sha256Hex } from '../utils/isomorphicSha256.js';

export const NAPLES_FACILITY_ID = '00000000-0000-0000-0000-000000000002';

export const CANONICAL_PAYER_GRADES = [
  'A_PREFERRED',
  'B_STANDARD',
  'C_FRICTIONAL',
  'D_HIGH_RISK',
  'F_CRITICAL'
];

export const CANONICAL_NEGOTIATION_ACTIONS = [
  'RENEGOTIATION_NOTICE',
  'UNDERPAYMENT_DEMAND',
  'CARVEOUT_AUDIT',
  'CONTRACT_SIGN_OFF'
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
 * Computes an immutable 64-character SHA-256 provenance seal prefixed with `sha256_psr_`.
 */
export function computePsrProvenanceSeal(payload) {
  const canonicalJson = JSON.stringify(payload || {});
  const digest = sha256Hex(canonicalJson);
  return `sha256_psr_${digest.slice(0, 53)}`;
}

/**
 * Masks payer scorecard engine secrets strictly as `psr_sec_****_...`.
 */
export function maskPsrSecret(rawSecret) {
  if (!rawSecret) return 'psr_sec_****_unset';
  const str = String(rawSecret);
  if (str.startsWith('psr_sec_****_')) return str;
  return `psr_sec_****_${str.slice(-4)}`;
}

/**
 * Validates that the 4 payer scorecard pillar weights conserve exact 100.00%.
 */
export function validatePayerWeights(weights = {}) {
  const wYield = Number(weights.weight_contract_yield_pct ?? 35);
  const wVel = Number(weights.weight_payment_velocity_pct ?? 25);
  const wClean = Number(weights.weight_clean_claim_rate_pct ?? 25);
  const wCarve = Number(weights.weight_carveout_recovery_pct ?? 15);

  const items = [wYield, wVel, wClean, wCarve];
  if (items.some(v => !Number.isFinite(v) || v < 0 || v > 100)) {
    throw new Error('ERR_PSR_INVALID_WEIGHT_SUM: Individual pillar weights must be between 0 and 100.');
  }
  const total = Number((wYield + wVel + wClean + wCarve).toFixed(2));
  if (Math.abs(total - 100) > 0.01) {
    throw new Error(
      `ERR_PSR_INVALID_WEIGHT_SUM: 4-pillar weights sum to ${total.toFixed(2)}%, must equal 100.00%.`
    );
  }
  return {
    weight_contract_yield_pct: Number(wYield.toFixed(2)),
    weight_payment_velocity_pct: Number(wVel.toFixed(2)),
    weight_clean_claim_rate_pct: Number(wClean.toFixed(2)),
    weight_carveout_recovery_pct: Number(wCarve.toFixed(2)),
    total_weight_pct: 100.00
  };
}

/**
 * Deterministically evaluates payer contract compliance yield, underpayment leakage,
 * 4-pillar normalized scores, composite index, performance grade, and renewal alert status.
 */
export function evaluatePayerScorecard(payerMetrics = {}, benchmark = {}, config = {}) {
  const weights = validatePayerWeights(config);
  const expectedAllowed = Number(payerMetrics.expected_allowed_usd ?? 0);
  const actualCollected = Number(payerMetrics.actual_collected_usd ?? 0);

  const underpaymentLeakage = Number(Math.max(0, expectedAllowed - actualCollected).toFixed(2));
  const contractYieldPct = expectedAllowed > 0
    ? Number(clamp((actualCollected / expectedAllowed) * 100, 0, 105).toFixed(2))
    : 0.00;

  const targetYield = Math.max(Number(benchmark.target_yield_pct ?? config.target_yield_floor_pct ?? 95), 1);
  const yieldScore = contractYieldPct >= targetYield
    ? clamp(92 + ((contractYieldPct - targetYield) / 5) * 8, 0, 100)
    : clamp(92 - (targetYield - contractYieldPct) * 4.5, 0, 92);

  const avgDays = Number(payerMetrics.avg_days_to_pay ?? 30);
  const targetDays = Math.max(Number(benchmark.target_days_to_pay ?? config.target_days_to_pay ?? 28), 1);
  const velocityScore = avgDays <= targetDays
    ? clamp(92 + ((targetDays - avgDays) / targetDays) * 12, 0, 100)
    : clamp(92 - ((avgDays - targetDays) / targetDays) * 55, 0, 100);

  const denialPct = Number(payerMetrics.first_pass_denial_pct ?? 0);
  const cleanClaimRate = clamp(100 - denialPct, 0, 100);
  const cleanScore = clamp(cleanClaimRate, 0, 100);

  const carveoutPct = Number(payerMetrics.carveout_recovery_pct ?? 90);
  const carveoutScore = clamp(carveoutPct, 0, 100);

  const composite = Number((
    yieldScore * (weights.weight_contract_yield_pct / 100) +
    velocityScore * (weights.weight_payment_velocity_pct / 100) +
    cleanScore * (weights.weight_clean_claim_rate_pct / 100) +
    carveoutScore * (weights.weight_carveout_recovery_pct / 100)
  ).toFixed(2));

  let grade = 'F_CRITICAL';
  if (composite >= 88) grade = 'A_PREFERRED';
  else if (composite >= 76) grade = 'B_STANDARD';
  else if (composite >= 64) grade = 'C_FRICTIONAL';
  else if (composite >= 50) grade = 'D_HIGH_RISK';

  const daysToRenewal = Number(payerMetrics.days_to_renewal ?? 180);
  const renewalWindow = Number(config.critical_renewal_window_days ?? 90);
  const renewalAlertStatus = daysToRenewal <= renewalWindow ? 'RENEWAL_NOTICE_URGENT' : 'MONITORING';

  return {
    underpayment_leakage_usd: underpaymentLeakage,
    contract_yield_pct: contractYieldPct,
    pillar_scores: {
      contract_yield_score: Number(yieldScore.toFixed(2)),
      payment_velocity_score: Number(velocityScore.toFixed(2)),
      clean_claim_rate_score: Number(cleanScore.toFixed(2)),
      carveout_recovery_score: Number(carveoutScore.toFixed(2))
    },
    composite_score: composite,
    performance_grade: grade,
    renewal_alert_status: renewalAlertStatus
  };
}

// ==============================================================================
// In-Memory Deterministic Store (Multi-Tenant Safe)
// ==============================================================================
const facilityStores = new Map();

function buildInitialStore(facilityId) {
  const edQ4Id = 'psr-ed-2026q4';

  const config = {
    facility_id: facilityId,
    weight_contract_yield_pct: 35.00,
    weight_payment_velocity_pct: 25.00,
    weight_clean_claim_rate_pct: 25.00,
    weight_carveout_recovery_pct: 15.00,
    target_yield_floor_pct: 95.00,
    target_days_to_pay: 30,
    critical_renewal_window_days: 90,
    client_secret_encrypted: 'psr_sec_****_naples_5129',
    sync_status: 'ACTIVE',
    health_status: 'HEALTHY',
    updated_at: '2026-11-27T07:00:00.000Z'
  };

  const benchmarks = [
    {
      id: 'pbench-comm',
      facility_id: facilityId,
      payer_category: 'Commercial',
      target_yield_pct: 95.50,
      target_days_to_pay: 28,
      max_denial_rate_pct: 6.00,
      target_carveout_recovery_pct: 92.00
    },
    {
      id: 'pbench-med',
      facility_id: facilityId,
      payer_category: 'Medicare',
      target_yield_pct: 98.50,
      target_days_to_pay: 18,
      max_denial_rate_pct: 3.00,
      target_carveout_recovery_pct: 95.00
    },
    {
      id: 'pbench-ma',
      facility_id: facilityId,
      payer_category: 'Medicare_Advantage',
      target_yield_pct: 94.00,
      target_days_to_pay: 26,
      max_denial_rate_pct: 7.50,
      target_carveout_recovery_pct: 88.00
    },
    {
      id: 'pbench-wc',
      facility_id: facilityId,
      payer_category: 'Workers_Comp',
      target_yield_pct: 93.00,
      target_days_to_pay: 38,
      max_denial_rate_pct: 8.50,
      target_carveout_recovery_pct: 86.00
    }
  ];

  const editions = [
    {
      id: edQ4Id,
      facility_id: facilityId,
      edition_code: 'PSR-2026-Q4-NAP',
      period_code: '2026-Q4',
      edition_status: 'PUBLISHED',
      payers_evaluated: 5,
      avg_composite_score: 79.40,
      total_net_collections_usd: 1796500.00,
      total_underpayment_leakage_usd: 83500.00,
      compiled_by: 'rcm_lead@naplessurgery.com',
      sha256_report_seal: computePsrProvenanceSeal({
        facilityId,
        edition_code: 'PSR-2026-Q4-NAP',
        period_code: '2026-Q4'
      }),
      created_at: '2026-11-27T07:00:00.000Z'
    }
  ];

  const scorecards = [
    {
      id: 'pcard-med',
      facility_id: facilityId,
      edition_id: edQ4Id,
      payer_code: 'PYR-MED',
      payer_name: 'Medicare Part B (FCSO MAC)',
      payer_category: 'Medicare',
      methodology: 'PERCENT_OF_MEDICARE',
      claim_count: 214,
      billed_charges_usd: 1420000.00,
      expected_allowed_usd: 492000.00,
      actual_collected_usd: 487500.00,
      underpayment_leakage_usd: 4500.00,
      contract_yield_pct: 99.09,
      avg_days_to_pay: 16,
      first_pass_denial_pct: 2.40,
      carveout_recovery_pct: 96.50,
      ar_over_90_pct: 3.10,
      days_to_renewal: 365,
      renewal_alert_status: 'MONITORING',
      composite_score: 94.80,
      performance_grade: 'A_PREFERRED',
      rank_in_facility: 1,
      pillar_scores: {
        contract_yield_score: 92.94,
        payment_velocity_score: 93.33,
        clean_claim_rate_score: 97.60,
        carveout_recovery_score: 96.50
      },
      sha256_card_seal: computePsrProvenanceSeal({ payer_code: 'PYR-MED', period: '2026-Q4' })
    },
    {
      id: 'pcard-bcbs',
      facility_id: facilityId,
      edition_id: edQ4Id,
      payer_code: 'PYR-BCBS',
      payer_name: 'Florida Blue (BCBS PPO)',
      payer_category: 'Commercial',
      methodology: 'FEE_SCHEDULE',
      claim_count: 186,
      billed_charges_usd: 1680000.00,
      expected_allowed_usd: 610000.00,
      actual_collected_usd: 591700.00,
      underpayment_leakage_usd: 18300.00,
      contract_yield_pct: 97.00,
      avg_days_to_pay: 23,
      first_pass_denial_pct: 4.80,
      carveout_recovery_pct: 91.20,
      ar_over_90_pct: 6.40,
      days_to_renewal: 142,
      renewal_alert_status: 'MONITORING',
      composite_score: 88.20,
      performance_grade: 'A_PREFERRED',
      rank_in_facility: 2,
      pillar_scores: {
        contract_yield_score: 94.40,
        payment_velocity_score: 94.14,
        clean_claim_rate_score: 95.20,
        carveout_recovery_score: 91.20
      },
      sha256_card_seal: computePsrProvenanceSeal({ payer_code: 'PYR-BCBS', period: '2026-Q4' })
    },
    {
      id: 'pcard-aet',
      facility_id: facilityId,
      edition_id: edQ4Id,
      payer_code: 'PYR-AET',
      payer_name: 'Aetna Choice POS II',
      payer_category: 'Commercial',
      methodology: 'CASE_RATE',
      claim_count: 112,
      billed_charges_usd: 920000.00,
      expected_allowed_usd: 340000.00,
      actual_collected_usd: 323000.00,
      underpayment_leakage_usd: 17000.00,
      contract_yield_pct: 95.00,
      avg_days_to_pay: 29,
      first_pass_denial_pct: 7.20,
      carveout_recovery_pct: 84.50,
      ar_over_90_pct: 9.80,
      days_to_renewal: 74,
      renewal_alert_status: 'RENEWAL_NOTICE_URGENT',
      composite_score: 78.60,
      performance_grade: 'B_STANDARD',
      rank_in_facility: 3,
      pillar_scores: {
        contract_yield_score: 89.75,
        payment_velocity_score: 90.04,
        clean_claim_rate_score: 92.80,
        carveout_recovery_score: 84.50
      },
      sha256_card_seal: computePsrProvenanceSeal({ payer_code: 'PYR-AET', period: '2026-Q4' })
    },
    {
      id: 'pcard-cig',
      facility_id: facilityId,
      edition_id: edQ4Id,
      payer_code: 'PYR-CIG',
      payer_name: 'Cigna Open Access Plus',
      payer_category: 'Commercial',
      methodology: 'PERCENT_OF_MEDICARE',
      claim_count: 88,
      billed_charges_usd: 640000.00,
      expected_allowed_usd: 218000.00,
      actual_collected_usd: 200500.00,
      underpayment_leakage_usd: 17500.00,
      contract_yield_pct: 91.97,
      avg_days_to_pay: 36,
      first_pass_denial_pct: 9.40,
      carveout_recovery_pct: 78.00,
      ar_over_90_pct: 14.50,
      days_to_renewal: 195,
      renewal_alert_status: 'MONITORING',
      composite_score: 69.40,
      performance_grade: 'C_FRICTIONAL',
      rank_in_facility: 4,
      pillar_scores: {
        contract_yield_score: 76.12,
        payment_velocity_score: 76.29,
        clean_claim_rate_score: 90.60,
        carveout_recovery_score: 78.00
      },
      sha256_card_seal: computePsrProvenanceSeal({ payer_code: 'PYR-CIG', period: '2026-Q4' })
    },
    {
      id: 'pcard-uhc',
      facility_id: facilityId,
      edition_id: edQ4Id,
      payer_code: 'PYR-UHC',
      payer_name: 'UnitedHealthcare Commercial',
      payer_category: 'Commercial',
      methodology: 'FEE_SCHEDULE',
      claim_count: 129,
      billed_charges_usd: 890000.00,
      expected_allowed_usd: 220000.00,
      actual_collected_usd: 193800.00,
      underpayment_leakage_usd: 26200.00,
      contract_yield_pct: 88.09,
      avg_days_to_pay: 44,
      first_pass_denial_pct: 12.60,
      carveout_recovery_pct: 68.40,
      ar_over_90_pct: 19.20,
      days_to_renewal: 48,
      renewal_alert_status: 'RENEWAL_NOTICE_URGENT',
      composite_score: 66.00,
      performance_grade: 'C_FRICTIONAL',
      rank_in_facility: 5,
      pillar_scores: {
        contract_yield_score: 58.66,
        payment_velocity_score: 60.57,
        clean_claim_rate_score: 87.40,
        carveout_recovery_score: 68.40
      },
      sha256_card_seal: computePsrProvenanceSeal({ payer_code: 'PYR-UHC', period: '2026-Q4' })
    }
  ];

  const variances = [
    {
      id: 'pvar-uhc-29827',
      facility_id: facilityId,
      scorecard_id: 'pcard-uhc',
      payer_code: 'PYR-UHC',
      cpt_code: '29827',
      procedure_label: 'Arthroscopic Rotator Cuff Repair (Implant Carve-Out)',
      claim_count: 18,
      contract_allowed_usd: 84600.00,
      actual_paid_usd: 70200.00,
      shortfall_usd: 14400.00,
      variance_reason: 'IMPLANT_CARVEOUT_OMITTED'
    },
    {
      id: 'pvar-uhc-27447',
      facility_id: facilityId,
      scorecard_id: 'pcard-uhc',
      payer_code: 'PYR-UHC',
      cpt_code: '27447',
      procedure_label: 'Outpatient Total Knee Arthroplasty',
      claim_count: 9,
      contract_allowed_usd: 76500.00,
      actual_paid_usd: 68700.00,
      shortfall_usd: 7800.00,
      variance_reason: 'MULTIPLE_PROCEDURE_REDUCTION'
    },
    {
      id: 'pvar-uhc-64483',
      facility_id: facilityId,
      scorecard_id: 'pcard-uhc',
      payer_code: 'PYR-UHC',
      cpt_code: '64483',
      procedure_label: 'Lumbar Transforaminal Epidural',
      claim_count: 24,
      contract_allowed_usd: 31200.00,
      actual_paid_usd: 27200.00,
      shortfall_usd: 4000.00,
      variance_reason: 'LEGACY_FEE_SCHEDULE_MISMATCH'
    },
    {
      id: 'pvar-aet-29888',
      facility_id: facilityId,
      scorecard_id: 'pcard-aet',
      payer_code: 'PYR-AET',
      cpt_code: '29888',
      procedure_label: 'Arthroscopic ACL Reconstruction',
      claim_count: 14,
      contract_allowed_usd: 72000.00,
      actual_paid_usd: 59500.00,
      shortfall_usd: 12500.00,
      variance_reason: 'BUNDLED_GRAFT_DENIAL'
    },
    {
      id: 'pvar-cig-66984',
      facility_id: facilityId,
      scorecard_id: 'pcard-cig',
      payer_code: 'PYR-CIG',
      cpt_code: '66984',
      procedure_label: 'Cataract Extraction w/ Premium IOL Carve-Out',
      claim_count: 31,
      contract_allowed_usd: 68200.00,
      actual_paid_usd: 54700.00,
      shortfall_usd: 13500.00,
      variance_reason: 'BASE_RATE_STEPDOWN'
    }
  ];

  const negotiationActions = [
    {
      id: 'pneg-uhc-1',
      facility_id: facilityId,
      scorecard_id: 'pcard-uhc',
      payer_code: 'PYR-UHC',
      action_type: 'UNDERPAYMENT_DEMAND',
      actor_email: 'rcm_lead@naplessurgery.com',
      actor_role: 'RCM Billing Lead',
      target_recovery_usd: 26200.00,
      notes: 'Issued bulk ERA 835 variance demand prior to 48-day UHC renewal notice window.',
      sha256_seal: computePsrProvenanceSeal({ action: 'pneg-uhc-1' }),
      created_at: '2026-11-27T08:10:00.000Z'
    }
  ];

  const dispatchLogs = [
    {
      id: 'pdsp-q4-01',
      facility_id: facilityId,
      edition_id: edQ4Id,
      rpt_execution_code: 'RPT-H5-RUN-Q4-01',
      delivery_channel: 'PORTAL_INBOX',
      export_format: 'XLSX',
      recipient_count: 5,
      dispatch_status: 'DELIVERED',
      dispatched_by: 'rcm_lead@naplessurgery.com',
      sha256_sync_seal: computePsrProvenanceSeal({ exec: 'RPT-H5-RUN-Q4-01' }),
      created_at: '2026-11-27T08:25:00.000Z'
    }
  ];

  return {
    config,
    benchmarks,
    editions,
    scorecards,
    variances,
    negotiationActions,
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
export async function getPsrConfig(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return { ...store.config };
}

export async function updatePsrConfig(facilityInput, updates = {}) {
  const store = ensureFacilityStore(facilityInput);
  const nextWeights = {
    weight_contract_yield_pct: updates.weight_contract_yield_pct ?? store.config.weight_contract_yield_pct,
    weight_payment_velocity_pct: updates.weight_payment_velocity_pct ?? store.config.weight_payment_velocity_pct,
    weight_clean_claim_rate_pct: updates.weight_clean_claim_rate_pct ?? store.config.weight_clean_claim_rate_pct,
    weight_carveout_recovery_pct: updates.weight_carveout_recovery_pct ?? store.config.weight_carveout_recovery_pct
  };

  const validated = validatePayerWeights(nextWeights);
  const renewalWindow = Number(updates.critical_renewal_window_days ?? store.config.critical_renewal_window_days);
  if (!Number.isFinite(renewalWindow) || renewalWindow < 15) {
    throw new Error('ERR_PSR_INVALID_CONFIG: critical_renewal_window_days must be >= 15.');
  }

  store.config = {
    ...store.config,
    weight_contract_yield_pct: validated.weight_contract_yield_pct,
    weight_payment_velocity_pct: validated.weight_payment_velocity_pct,
    weight_clean_claim_rate_pct: validated.weight_clean_claim_rate_pct,
    weight_carveout_recovery_pct: validated.weight_carveout_recovery_pct,
    target_yield_floor_pct: Number(updates.target_yield_floor_pct ?? store.config.target_yield_floor_pct),
    target_days_to_pay: Number(updates.target_days_to_pay ?? store.config.target_days_to_pay),
    critical_renewal_window_days: renewalWindow,
    updated_at: new Date().toISOString()
  };

  return { ...store.config };
}

export async function getPsrTelemetry(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  const latest = store.editions[0];
  const latestCards = latest ? store.scorecards.filter(c => c.edition_id === latest.id) : [];
  const urgentRenewals = latestCards.filter(
    c => c.renewal_alert_status === 'RENEWAL_NOTICE_URGENT'
  ).length;

  return {
    facility_id: store.config.facility_id,
    latest_edition_code: latest?.edition_code || null,
    period_code: latest?.period_code || null,
    payers_evaluated: latest?.payers_evaluated ?? 0,
    avg_composite_score: latest?.avg_composite_score ?? 0,
    total_net_collections_usd: latest?.total_net_collections_usd ?? 0,
    total_underpayment_leakage_usd: latest?.total_underpayment_leakage_usd ?? 0,
    urgent_renewals_count: urgentRenewals,
    sync_status: store.config.sync_status,
    health_status: store.config.health_status,
    latest_sync_seal: latest?.sha256_report_seal || null
  };
}

export async function getPsrCategoryBenchmarks(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return store.benchmarks.map(b => ({ ...b }));
}

export async function getPsrEditions(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return store.editions.map(e => ({ ...e }));
}

export async function getPsrPayerScorecards(facilityInput, options = {}) {
  const store = ensureFacilityStore(facilityInput);
  const targetEdId = options.edition_id || store.editions[0]?.id;
  const { category, grade } = options;

  return store.scorecards
    .filter(c => c.edition_id === targetEdId)
    .filter(c => !category || category === 'ALL' || c.payer_category === category)
    .filter(c => !grade || grade === 'ALL' || c.performance_grade === grade)
    .sort((a, b) => a.rank_in_facility - b.rank_in_facility)
    .map(c => ({ ...c }));
}

export async function getPsrContractVariances(facilityInput, options = {}) {
  const store = ensureFacilityStore(facilityInput);
  const { scorecard_id: scorecardId, payer_code: payerCode } = options;
  return store.variances
    .filter(v => !scorecardId || v.scorecard_id === scorecardId)
    .filter(v => !payerCode || v.payer_code === payerCode)
    .map(v => ({ ...v }));
}

export async function getPsrNegotiationActions(facilityInput, scorecardId = null) {
  const store = ensureFacilityStore(facilityInput);
  return store.negotiationActions
    .filter(a => !scorecardId || a.scorecard_id === scorecardId)
    .map(a => ({ ...a }));
}

export async function getPsrDispatchLogs(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return store.dispatchLogs.map(d => ({ ...d }));
}

// ==============================================================================
// Write / Mutation Endpoints
// ==============================================================================

/**
 * Compiles a new Payer Scorecard Edition, ranking payers descending by composite score.
 */
export async function compilePayerScorecardEdition(facilityInput, params = {}) {
  const store = ensureFacilityStore(facilityInput);
  const now = new Date().toISOString();
  const periodCode = params.period_code || now.slice(0, 7);
  const rawPayers = Array.isArray(params.payers) && params.payers.length > 0
    ? params.payers
    : store.scorecards.filter(c => c.edition_id === store.editions[0]?.id).map(c => ({
        payer_code: c.payer_code,
        payer_name: c.payer_name,
        payer_category: c.payer_category,
        methodology: c.methodology,
        claim_count: c.claim_count,
        billed_charges_usd: c.billed_charges_usd,
        expected_allowed_usd: c.expected_allowed_usd,
        actual_collected_usd: c.actual_collected_usd,
        avg_days_to_pay: c.avg_days_to_pay,
        first_pass_denial_pct: c.first_pass_denial_pct,
        carveout_recovery_pct: c.carveout_recovery_pct,
        ar_over_90_pct: c.ar_over_90_pct,
        days_to_renewal: c.days_to_renewal
      }));

  if (rawPayers.length === 0) {
    throw new Error('ERR_PSR_NO_PAYERS: At least one payer record is required to compile an edition.');
  }

  const edId = `psr-ed-${periodCode.replace(/[^0-9a-zA-Z]/g, '')}-${Date.now()}`;
  const edCode = `PSR-${periodCode}-NAP`;

  const evaluated = rawPayers.map(p => {
    const bench = store.benchmarks.find(b => b.payer_category === p.payer_category) || store.benchmarks[0];
    const calc = evaluatePayerScorecard(p, bench, store.config);
    return { raw: p, calc };
  });

  evaluated.sort((a, b) => b.calc.composite_score - a.calc.composite_score);

  const compiledCards = evaluated.map((entry, idx) => ({
    id: `pcard-${entry.raw.payer_code.toLowerCase()}-${Date.now()}-${idx}`,
    facility_id: store.config.facility_id,
    edition_id: edId,
    payer_code: entry.raw.payer_code,
    payer_name: entry.raw.payer_name,
    payer_category: entry.raw.payer_category,
    methodology: entry.raw.methodology || 'FEE_SCHEDULE',
    claim_count: Number(entry.raw.claim_count ?? 0),
    billed_charges_usd: Number(entry.raw.billed_charges_usd ?? 0),
    expected_allowed_usd: Number(entry.raw.expected_allowed_usd ?? 0),
    actual_collected_usd: Number(entry.raw.actual_collected_usd ?? 0),
    underpayment_leakage_usd: entry.calc.underpayment_leakage_usd,
    contract_yield_pct: entry.calc.contract_yield_pct,
    avg_days_to_pay: Number(entry.raw.avg_days_to_pay ?? 30),
    first_pass_denial_pct: Number(entry.raw.first_pass_denial_pct ?? 0),
    carveout_recovery_pct: Number(entry.raw.carveout_recovery_pct ?? 90),
    ar_over_90_pct: Number(entry.raw.ar_over_90_pct ?? 0),
    days_to_renewal: Number(entry.raw.days_to_renewal ?? 180),
    renewal_alert_status: entry.calc.renewal_alert_status,
    composite_score: entry.calc.composite_score,
    performance_grade: entry.calc.performance_grade,
    rank_in_facility: idx + 1,
    pillar_scores: entry.calc.pillar_scores,
    sha256_card_seal: computePsrProvenanceSeal({
      edition_code: edCode,
      payer_code: entry.raw.payer_code,
      composite_score: entry.calc.composite_score,
      now
    })
  }));

  const totalCollections = Number(
    compiledCards.reduce((sum, c) => sum + c.actual_collected_usd, 0).toFixed(2)
  );
  const totalLeakage = Number(
    compiledCards.reduce((sum, c) => sum + c.underpayment_leakage_usd, 0).toFixed(2)
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
    payers_evaluated: compiledCards.length,
    avg_composite_score: avgComposite,
    total_net_collections_usd: totalCollections,
    total_underpayment_leakage_usd: totalLeakage,
    compiled_by: params.actor_email || 'rcm_lead@naplessurgery.com',
    sha256_report_seal: computePsrProvenanceSeal({ edCode, totalCollections, totalLeakage, avgComposite, now }),
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
 * Records a sealed payer negotiation / underpayment demand action.
 */
export async function recordPayerNegotiationAction(facilityInput, scorecardId, payload = {}) {
  const store = ensureFacilityStore(facilityInput);
  const card = store.scorecards.find(c => c.id === scorecardId || c.payer_code === scorecardId);
  if (!card) {
    throw new Error(`ERR_PSR_SCORECARD_NOT_FOUND: Payer scorecard "${scorecardId}" not found.`);
  }

  const actionType = payload.action_type || 'UNDERPAYMENT_DEMAND';
  if (!CANONICAL_NEGOTIATION_ACTIONS.includes(actionType)) {
    throw new Error(`ERR_PSR_INVALID_ACTION: Unsupported action_type "${actionType}".`);
  }

  const targetRecovery = Number(payload.target_recovery_usd ?? card.underpayment_leakage_usd ?? 0);
  if (!Number.isFinite(targetRecovery) || targetRecovery < 0) {
    throw new Error('ERR_PSR_INVALID_AMOUNT: target_recovery_usd must be >= 0.');
  }

  const notes = String(payload.notes || '').trim();
  if (notes.length < 5) {
    throw new Error('ERR_PSR_NOTE_REQUIRED: Negotiation notes must be at least 5 characters.');
  }

  const now = new Date().toISOString();
  const actorEmail = payload.actor_email || 'rcm_lead@naplessurgery.com';
  const actorRole = payload.actor_role || 'RCM Billing Lead';
  const seal = computePsrProvenanceSeal({
    scorecard_id: card.id,
    actionType,
    targetRecovery,
    notes,
    actorEmail,
    now
  });

  const entry = {
    id: `pneg-${Date.now()}`,
    facility_id: store.config.facility_id,
    scorecard_id: card.id,
    payer_code: card.payer_code,
    action_type: actionType,
    actor_email: actorEmail,
    actor_role: actorRole,
    target_recovery_usd: Number(targetRecovery.toFixed(2)),
    notes,
    sha256_seal: seal,
    created_at: now
  };

  store.negotiationActions.unshift(entry);
  return entry;
}

/**
 * Dispatches Payer Scorecard Edition via Phase H0 (`RPT-H5-PAYER-CARD`).
 */
export async function dispatchPayerScorecardDigest(facilityInput, editionId, options = {}) {
  const store = ensureFacilityStore(facilityInput);
  const ed = store.editions.find(e => e.id === editionId || e.edition_code === editionId);
  if (!ed) {
    throw new Error(`ERR_PSR_EDITION_NOT_FOUND: Edition "${editionId}" not found.`);
  }

  const now = new Date().toISOString();
  const execCode = `RPT-H5-RUN-${Date.now()}`;
  const seal = computePsrProvenanceSeal({ edition_id: ed.id, execCode, now });

  const log = {
    id: `pdsp-${Date.now()}`,
    facility_id: store.config.facility_id,
    edition_id: ed.id,
    rpt_execution_code: execCode,
    delivery_channel: options.delivery_channel || 'PORTAL_INBOX',
    export_format: options.export_format || 'XLSX',
    recipient_count: Number(options.recipient_count ?? ed.payers_evaluated ?? 5),
    dispatch_status: 'DELIVERED',
    dispatched_by: options.actor_email || 'rcm_lead@naplessurgery.com',
    sha256_sync_seal: seal,
    created_at: now
  };

  store.dispatchLogs.unshift(log);
  return log;
}

export default {
  NAPLES_FACILITY_ID,
  CANONICAL_PAYER_GRADES,
  CANONICAL_NEGOTIATION_ACTIONS,
  normalizeFacilityId,
  computePsrProvenanceSeal,
  maskPsrSecret,
  validatePayerWeights,
  evaluatePayerScorecard,
  getPsrConfig,
  updatePsrConfig,
  getPsrTelemetry,
  getPsrCategoryBenchmarks,
  getPsrEditions,
  getPsrPayerScorecards,
  getPsrContractVariances,
  getPsrNegotiationActions,
  getPsrDispatchLogs,
  compilePayerScorecardEdition,
  recordPayerNegotiationAction,
  dispatchPayerScorecardDigest
};
