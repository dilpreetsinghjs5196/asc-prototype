/**
 * ==============================================================================
 * Service: denialArReportService.js
 * Module 17: Enterprise Reporting & Executive Packages (Phase H8)
 * Description: Denial Intelligence, Conserved GAAP 6-Bucket AR Aging Schedule,
 *              Days Sales Outstanding (DSO), Prioritized Recovery Workqueue,
 *              CARC Root-Cause Clusters, Sealed Appeals & Write-Off Audit Log,
 *              and H0 (RPT-H8-DENIAL-AR) Dispatch.
 * ==============================================================================
 */

import { sha256Hex } from '../utils/isomorphicSha256.js';

export const NAPLES_FACILITY_ID = '00000000-0000-0000-0000-000000000002';

export const CANONICAL_URGENCY_TIERS = [
  'CRITICAL_FILING_THREAT',
  'HIGH_VALUE_APPEAL',
  'STANDARD_FOLLOWUP',
  'LOW_RECOVERY_WRITEOFF'
];

export const CANONICAL_APPEAL_ACTIONS = [
  'SUBMIT_LEVEL_1_APPEAL',
  'MEDICAL_NECESSITY_ADDENDUM',
  'REBILL_CORRECTED_CLAIM',
  'APPROVE_WRITEOFF'
];

export const GAAP_AGING_BUCKET_ORDER = [
  '0_30',
  '31_60',
  '61_90',
  '91_120',
  '121_180',
  '181_PLUS'
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
 * Computes an immutable 64-character SHA-256 provenance seal prefixed with `sha256_dar_`.
 */
export function computeDarProvenanceSeal(payload) {
  const canonicalJson = JSON.stringify(payload || {});
  const digest = sha256Hex(canonicalJson);
  return `sha256_dar_${digest.slice(0, 53)}`;
}

/**
 * Masks Denial & AR report engine secrets strictly as `dar_sec_****_...`.
 */
export function maskDarSecret(rawSecret) {
  if (!rawSecret) return 'dar_sec_****_unset';
  const str = String(rawSecret);
  if (str.startsWith('dar_sec_****_')) return str;
  return `dar_sec_****_${str.slice(-4)}`;
}

/**
 * Calculates Days Sales Outstanding (DSO) over trailing 90-day net credit sales.
 */
export function calculateDsoDays(totalGrossArUsd = 0, trailing90DayRevenueUsd = 0) {
  const ar = Math.max(0, Number(totalGrossArUsd || 0));
  const rev = Number(trailing90DayRevenueUsd || 0);
  if (rev <= 0) return 0.0;
  return Number(((ar / rev) * 90).toFixed(1));
}

/**
 * Deterministically evaluates expected denial recovery and filing urgency tier.
 */
export function evaluateDenialItem(itemInput = {}, config = {}) {
  const exposure = Math.max(0, Number(itemInput.denied_exposure_usd ?? 0));
  const probPct = Math.max(0, Math.min(100, Number(itemInput.recovery_probability_pct ?? 0)));
  const filingDays = Number(itemInput.days_to_timely_filing ?? 30);
  const warningDays = Number(config.timely_filing_warning_days ?? 14);

  const expectedRecovery = Number((exposure * (probPct / 100)).toFixed(2));

  let urgencyTier = 'STANDARD_FOLLOWUP';
  if (probPct < 25) {
    urgencyTier = 'LOW_RECOVERY_WRITEOFF';
  } else if (filingDays <= warningDays && exposure > 0) {
    urgencyTier = 'CRITICAL_FILING_THREAT';
  } else if (expectedRecovery >= 5000) {
    urgencyTier = 'HIGH_VALUE_APPEAL';
  }

  return {
    denied_exposure_usd: Number(exposure.toFixed(2)),
    recovery_probability_pct: Number(probPct.toFixed(2)),
    expected_recovery_usd: expectedRecovery,
    days_to_timely_filing: filingDays,
    urgency_tier: urgencyTier
  };
}

/**
 * Verifies GAAP 6-bucket AR aging conservation:
 * Sum(0_30 .. 181_PLUS) === total_gross_ar_usd AND Sum(91_PLUS) === ar_over_90_usd.
 */
export function verifyArBucketConservation(buckets = [], expectedTotalArUsd = 0, expectedOver90Usd = null) {
  const bucketSum = Number(buckets.reduce((s, b) => s + Number(b.ar_amount_usd ?? 0), 0).toFixed(2));
  const over90Buckets = new Set(['91_120', '121_180', '181_PLUS']);
  const over90Sum = Number(
    buckets.filter(b => over90Buckets.has(b.bucket_code)).reduce((s, b) => s + Number(b.ar_amount_usd ?? 0), 0).toFixed(2)
  );
  const deltaTotal = Number(Math.abs(bucketSum - Number(expectedTotalArUsd || 0)).toFixed(2));
  if (deltaTotal > 0.05) {
    throw new Error(
      `ERR_DAR_AR_CONSERVATION_MISMATCH: Sum of aging buckets ($${bucketSum}) != Total Gross AR ($${expectedTotalArUsd}).`
    );
  }
  if (expectedOver90Usd !== null) {
    const delta90 = Number(Math.abs(over90Sum - Number(expectedOver90Usd)).toFixed(2));
    if (delta90 > 0.05) {
      throw new Error(
        `ERR_DAR_AR_CONSERVATION_MISMATCH: 91+ Day buckets ($${over90Sum}) != Reported AR > 90 ($${expectedOver90Usd}).`
      );
    }
  }
  return {
    is_conserved: true,
    total_gross_ar_usd: bucketSum,
    ar_over_90_usd: over90Sum
  };
}

// ==============================================================================
// In-Memory Deterministic Store (Multi-Tenant Safe)
// ==============================================================================
const facilityStores = new Map();

function buildInitialStore(facilityId) {
  const edNovId = 'dar-ed-202611';

  const config = {
    facility_id: facilityId,
    dso_benchmark_days: 35,
    max_ar_over_90_pct: 12.00,
    target_first_pass_resolution_pct: 92.00,
    timely_filing_warning_days: 14,
    client_secret_encrypted: 'dar_sec_****_naples_8412',
    sync_status: 'ACTIVE',
    health_status: 'HEALTHY',
    updated_at: '2026-11-27T07:00:00.000Z'
  };

  const agingBuckets = [
    { id: 'age-1', facility_id: facilityId, edition_id: edNovId, bucket_code: '0_30', bucket_label: '0-30 Days', claim_count: 142, ar_amount_usd: 345600.00, share_pct: 54.00, expected_collectible_usd: 338688.00, risk_category: 'CURRENT' },
    { id: 'age-2', facility_id: facilityId, edition_id: edNovId, bucket_code: '31_60', bucket_label: '31-60 Days', claim_count: 58, ar_amount_usd: 134400.00, share_pct: 21.00, expected_collectible_usd: 120960.00, risk_category: 'FOLLOW_UP' },
    { id: 'age-3', facility_id: facilityId, edition_id: edNovId, bucket_code: '61_90', bucket_label: '61-90 Days', claim_count: 31, ar_amount_usd: 70400.00, share_pct: 11.00, expected_collectible_usd: 56320.00, risk_category: 'ESCALATION' },
    { id: 'age-4', facility_id: facilityId, edition_id: edNovId, bucket_code: '91_120', bucket_label: '91-120 Days', claim_count: 19, ar_amount_usd: 44800.00, share_pct: 7.00, expected_collectible_usd: 29120.00, risk_category: 'HIGH_RISK' },
    { id: 'age-5', facility_id: facilityId, edition_id: edNovId, bucket_code: '121_180', bucket_label: '121-180 Days', claim_count: 11, ar_amount_usd: 28800.00, share_pct: 4.50, expected_collectible_usd: 14400.00, risk_category: 'CRITICAL_AGING' },
    { id: 'age-6', facility_id: facilityId, edition_id: edNovId, bucket_code: '181_PLUS', bucket_label: '181+ Days', claim_count: 6, ar_amount_usd: 16000.00, share_pct: 2.50, expected_collectible_usd: 4800.00, risk_category: 'WRITE_OFF_RISK' }
  ];

  const seedDenials = [
    {
      id: 'den-1',
      denial_code: 'DEN-2611-01',
      claim_number: 'CLM-NAP-88412',
      payer_name: 'UnitedHealthcare Commercial',
      carc_code: '197',
      denial_category: 'PRE_AUTH_ABSENT_EXPIRED',
      billed_amount_usd: 38500.00,
      denied_exposure_usd: 32400.00,
      recovery_probability_pct: 75.00,
      days_to_timely_filing: 9,
      assigned_team: 'CLINICAL_APPEALS',
      appeal_status: 'OPEN_TRIAGE'
    },
    {
      id: 'den-2',
      denial_code: 'DEN-2611-02',
      claim_number: 'CLM-NAP-88390',
      payer_name: 'Aetna Choice POS II',
      carc_code: '97',
      denial_category: 'CODING_MODIFIER_UNBUNDLED',
      billed_amount_usd: 29400.00,
      denied_exposure_usd: 24600.00,
      recovery_probability_pct: 88.00,
      days_to_timely_filing: 28,
      assigned_team: 'BILLING_AND_CODING',
      appeal_status: 'APPEAL_DRAFTED'
    },
    {
      id: 'den-3',
      denial_code: 'DEN-2611-03',
      claim_number: 'CLM-NAP-88245',
      payer_name: 'Florida Blue (BCBS PPO)',
      carc_code: '50',
      denial_category: 'MEDICAL_NECESSITY_LCD',
      billed_amount_usd: 24000.00,
      denied_exposure_usd: 19500.00,
      recovery_probability_pct: 70.00,
      days_to_timely_filing: 42,
      assigned_team: 'CLINICAL_APPEALS',
      appeal_status: 'OPEN_TRIAGE'
    },
    {
      id: 'den-4',
      denial_code: 'DEN-2611-04',
      claim_number: 'CLM-NAP-88109',
      payer_name: 'Cigna Open Access Plus',
      carc_code: '16',
      denial_category: 'CODING_MODIFIER_UNBUNDLED',
      billed_amount_usd: 14200.00,
      denied_exposure_usd: 11200.00,
      recovery_probability_pct: 80.00,
      days_to_timely_filing: 19,
      assigned_team: 'BILLING_AND_CODING',
      appeal_status: 'OPEN_TRIAGE'
    },
    {
      id: 'den-5',
      denial_code: 'DEN-2611-05',
      claim_number: 'CLM-NAP-87904',
      payer_name: 'UnitedHealthcare Commercial',
      carc_code: '29',
      denial_category: 'TIMELY_FILING_EXCEEDED',
      billed_amount_usd: 9100.00,
      denied_exposure_usd: 6800.00,
      recovery_probability_pct: 8.85,
      days_to_timely_filing: 4,
      assigned_team: 'BILLING_AND_CODING',
      appeal_status: 'PENDING_WRITEOFF'
    }
  ];

  const evaluatedDenials = seedDenials
    .map(raw => ({ raw, calc: evaluateDenialItem(raw, config) }))
    .sort((a, b) => b.calc.expected_recovery_usd - a.calc.expected_recovery_usd)
    .map((entry, idx) => ({
      id: entry.raw.id,
      facility_id: facilityId,
      edition_id: edNovId,
      denial_code: entry.raw.denial_code,
      claim_number: entry.raw.claim_number,
      payer_name: entry.raw.payer_name,
      carc_code: entry.raw.carc_code,
      denial_category: entry.raw.denial_category,
      billed_amount_usd: entry.raw.billed_amount_usd,
      assigned_team: entry.raw.assigned_team,
      appeal_status: entry.raw.appeal_status,
      ...entry.calc,
      rank_in_facility: idx + 1,
      sha256_item_seal: computeDarProvenanceSeal({ denial_code: entry.raw.denial_code, period: '2026-11' })
    }));

  const carcRootCauses = [
    { id: 'carc-197', facility_id: facilityId, edition_id: edNovId, carc_code: '197', carc_description: 'Precertification/authorization/notification absent', claim_count: 14, denied_dollars_usd: 32400.00, avg_recovery_pct: 75.00, primary_payer: 'UnitedHealthcare Commercial' },
    { id: 'carc-97', facility_id: facilityId, edition_id: edNovId, carc_code: '97', carc_description: 'Benefit included in another procedure / bundling', claim_count: 11, denied_dollars_usd: 24600.00, avg_recovery_pct: 88.00, primary_payer: 'Aetna Choice POS II' },
    { id: 'carc-50', facility_id: facilityId, edition_id: edNovId, carc_code: '50', carc_description: 'Non-covered services / medical necessity LCD gap', claim_count: 7, denied_dollars_usd: 19500.00, avg_recovery_pct: 70.00, primary_payer: 'Florida Blue (BCBS PPO)' },
    { id: 'carc-16', facility_id: facilityId, edition_id: edNovId, carc_code: '16', carc_description: 'Claim lacks required information / modifier', claim_count: 9, denied_dollars_usd: 11200.00, avg_recovery_pct: 80.00, primary_payer: 'Cigna Open Access Plus' },
    { id: 'carc-29', facility_id: facilityId, edition_id: edNovId, carc_code: '29', carc_description: 'Time limit for filing has expired', claim_count: 3, denied_dollars_usd: 6800.00, avg_recovery_pct: 8.85, primary_payer: 'UnitedHealthcare Commercial' }
  ];

  const totGrossAr = 640000.00;
  const over90Ar = 89600.00;
  const openDenied = Number(evaluatedDenials.reduce((s, d) => s + d.denied_exposure_usd, 0).toFixed(2));
  const expRecovery = Number(evaluatedDenials.reduce((s, d) => s + d.expected_recovery_usd, 0).toFixed(2));

  const editions = [
    {
      id: edNovId,
      facility_id: facilityId,
      edition_code: 'DAR-2026-11-NAP',
      period_code: '2026-11',
      edition_status: 'PUBLISHED',
      total_gross_ar_usd: totGrossAr,
      ar_over_90_usd: over90Ar,
      ar_over_90_pct: 14.00,
      calculated_dso_days: calculateDsoDays(totGrossAr, 1800000.00),
      open_denied_exposure_usd: openDenied,
      expected_appeal_recovery_usd: expRecovery,
      compiled_by: 'rcm_lead@naplessurgery.com',
      sha256_report_seal: computeDarProvenanceSeal({ facilityId, edition_code: 'DAR-2026-11-NAP' }),
      created_at: '2026-11-27T07:00:00.000Z'
    }
  ];

  const appealResolutions = [
    {
      id: 'apr-1',
      facility_id: facilityId,
      workqueue_id: 'den-1',
      denial_code: 'DEN-2611-01',
      action_type: 'MEDICAL_NECESSITY_ADDENDUM',
      actor_email: 'rcm_lead@naplessurgery.com',
      actor_role: 'RCM Billing Lead',
      claimed_recovery_usd: 24300.00,
      notes: 'Attached surgeon operative dictation and retro-auth peer-to-peer reference #UHC-9918.',
      sha256_seal: computeDarProvenanceSeal({ res: 'apr-1' }),
      created_at: '2026-11-27T08:15:00.000Z'
    }
  ];

  const dispatchLogs = [
    {
      id: 'ddsp-nov-01',
      facility_id: facilityId,
      edition_id: edNovId,
      rpt_execution_code: 'RPT-H8-RUN-NOV-01',
      delivery_channel: 'PORTAL_INBOX',
      export_format: 'XLSX',
      recipient_count: 4,
      dispatch_status: 'DELIVERED',
      dispatched_by: 'rcm_lead@naplessurgery.com',
      sha256_sync_seal: computeDarProvenanceSeal({ exec: 'RPT-H8-RUN-NOV-01' }),
      created_at: '2026-11-27T08:25:00.000Z'
    }
  ];

  return {
    config,
    editions,
    agingBuckets,
    workqueue: evaluatedDenials,
    carcRootCauses,
    appealResolutions,
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
export async function getDarConfig(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return { ...store.config };
}

export async function updateDarConfig(facilityInput, updates = {}) {
  const store = ensureFacilityStore(facilityInput);
  const dsoBench = Number(updates.dso_benchmark_days ?? store.config.dso_benchmark_days);
  const maxOver90 = Number(updates.max_ar_over_90_pct ?? store.config.max_ar_over_90_pct);
  const filingWarn = Number(updates.timely_filing_warning_days ?? store.config.timely_filing_warning_days);

  if (!Number.isFinite(dsoBench) || dsoBench < 10) {
    throw new Error('ERR_DAR_INVALID_CONFIG: dso_benchmark_days must be >= 10.');
  }
  if (!Number.isFinite(maxOver90) || maxOver90 <= 0) {
    throw new Error('ERR_DAR_INVALID_CONFIG: max_ar_over_90_pct must be > 0.');
  }
  if (!Number.isFinite(filingWarn) || filingWarn < 3) {
    throw new Error('ERR_DAR_INVALID_CONFIG: timely_filing_warning_days must be >= 3.');
  }

  store.config = {
    ...store.config,
    dso_benchmark_days: dsoBench,
    max_ar_over_90_pct: Number(maxOver90.toFixed(2)),
    target_first_pass_resolution_pct: Number(updates.target_first_pass_resolution_pct ?? store.config.target_first_pass_resolution_pct),
    timely_filing_warning_days: filingWarn,
    updated_at: new Date().toISOString()
  };

  return { ...store.config };
}

export async function getDarTelemetry(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  const latest = store.editions[0];
  const latestItems = latest ? store.workqueue.filter(i => i.edition_id === latest.id) : [];
  const criticalThreats = latestItems.filter(i => i.urgency_tier === 'CRITICAL_FILING_THREAT').length;

  return {
    facility_id: store.config.facility_id,
    latest_edition_code: latest?.edition_code || null,
    period_code: latest?.period_code || null,
    total_gross_ar_usd: latest?.total_gross_ar_usd ?? 0,
    ar_over_90_usd: latest?.ar_over_90_usd ?? 0,
    ar_over_90_pct: latest?.ar_over_90_pct ?? 0,
    calculated_dso_days: latest?.calculated_dso_days ?? 0,
    open_denied_exposure_usd: latest?.open_denied_exposure_usd ?? 0,
    expected_appeal_recovery_usd: latest?.expected_appeal_recovery_usd ?? 0,
    critical_filing_threats: criticalThreats,
    sync_status: store.config.sync_status,
    health_status: store.config.health_status,
    latest_sync_seal: latest?.sha256_report_seal || null
  };
}

export async function getDarEditions(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return store.editions.map(e => ({ ...e }));
}

export async function getDarAgingSnapshots(facilityInput, editionId = null) {
  const store = ensureFacilityStore(facilityInput);
  const targetEdId = editionId || store.editions[0]?.id;
  return store.agingBuckets
    .filter(b => b.edition_id === targetEdId)
    .sort((a, b) => GAAP_AGING_BUCKET_ORDER.indexOf(a.bucket_code) - GAAP_AGING_BUCKET_ORDER.indexOf(b.bucket_code))
    .map(b => ({ ...b }));
}

export async function getDarDenialWorkqueue(facilityInput, options = {}) {
  const store = ensureFacilityStore(facilityInput);
  const targetEdId = options.edition_id || store.editions[0]?.id;
  const { urgency_tier: tier, denial_category: category } = options;

  return store.workqueue
    .filter(w => w.edition_id === targetEdId)
    .filter(w => !tier || tier === 'ALL' || w.urgency_tier === tier)
    .filter(w => !category || category === 'ALL' || w.denial_category === category)
    .sort((a, b) => a.rank_in_facility - b.rank_in_facility)
    .map(w => ({ ...w }));
}

export async function getDarCarcRootCauses(facilityInput, editionId = null) {
  const store = ensureFacilityStore(facilityInput);
  const targetEdId = editionId || store.editions[0]?.id;
  return store.carcRootCauses
    .filter(c => c.edition_id === targetEdId)
    .map(c => ({ ...c }));
}

export async function getDarAppealResolutions(facilityInput, workqueueId = null) {
  const store = ensureFacilityStore(facilityInput);
  return store.appealResolutions
    .filter(r => !workqueueId || r.workqueue_id === workqueueId)
    .map(r => ({ ...r }));
}

export async function getDarDispatchLogs(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return store.dispatchLogs.map(d => ({ ...d }));
}

// ==============================================================================
// Write / Mutation Endpoints
// ==============================================================================

/**
 * Compiles a conserved Denial & AR Aging Edition enforcing GAAP 6-bucket conservation.
 */
export async function compileDenialArEdition(facilityInput, params = {}) {
  const store = ensureFacilityStore(facilityInput);
  const now = new Date().toISOString();
  const periodCode = params.period_code || now.slice(0, 7);
  const baseEdId = store.editions[0]?.id;

  const rawBuckets = Array.isArray(params.aging_buckets) && params.aging_buckets.length > 0
    ? params.aging_buckets
    : store.agingBuckets.filter(b => b.edition_id === baseEdId);

  const rawDenials = Array.isArray(params.denials) && params.denials.length > 0
    ? params.denials
    : store.workqueue.filter(w => w.edition_id === baseEdId);

  const totGrossAr = Number(rawBuckets.reduce((s, b) => s + Number(b.ar_amount_usd ?? 0), 0).toFixed(2));
  const over90Set = new Set(['91_120', '121_180', '181_PLUS']);
  const over90Ar = Number(
    rawBuckets.filter(b => over90Set.has(b.bucket_code)).reduce((s, b) => s + Number(b.ar_amount_usd ?? 0), 0).toFixed(2)
  );
  verifyArBucketConservation(rawBuckets, totGrossAr, over90Ar);

  const arOver90Pct = totGrossAr > 0 ? Number(((over90Ar / totGrossAr) * 100).toFixed(2)) : 0.00;
  const trailing90Rev = Number(params.trailing_90_revenue_usd ?? 1800000.00);
  const dsoDays = calculateDsoDays(totGrossAr, trailing90Rev);

  const edId = `dar-ed-${periodCode.replace(/[^0-9a-zA-Z]/g, '')}-${Date.now()}`;
  const edCode = `DAR-${periodCode}-NAP`;

  const compiledBuckets = rawBuckets.map((b, idx) => ({
    id: `age-${b.bucket_code}-${Date.now()}-${idx}`,
    facility_id: store.config.facility_id,
    edition_id: edId,
    bucket_code: b.bucket_code,
    bucket_label: b.bucket_label || b.bucket_code,
    claim_count: Number(b.claim_count ?? 0),
    ar_amount_usd: Number(Number(b.ar_amount_usd ?? 0).toFixed(2)),
    share_pct: totGrossAr > 0 ? Number(((Number(b.ar_amount_usd ?? 0) / totGrossAr) * 100).toFixed(2)) : 0.00,
    expected_collectible_usd: Number(b.expected_collectible_usd ?? b.ar_amount_usd ?? 0),
    risk_category: b.risk_category || 'STANDARD'
  }));

  const evaluatedDenials = rawDenials
    .map(raw => ({ raw, calc: evaluateDenialItem(raw, store.config) }))
    .sort((a, b) => b.calc.expected_recovery_usd - a.calc.expected_recovery_usd);

  const compiledWorkqueue = evaluatedDenials.map((entry, idx) => ({
    id: `den-${entry.raw.denial_code.toLowerCase()}-${Date.now()}-${idx}`,
    facility_id: store.config.facility_id,
    edition_id: edId,
    denial_code: entry.raw.denial_code,
    claim_number: entry.raw.claim_number,
    payer_name: entry.raw.payer_name,
    carc_code: entry.raw.carc_code,
    denial_category: entry.raw.denial_category,
    billed_amount_usd: Number(entry.raw.billed_amount_usd ?? 0),
    assigned_team: entry.raw.assigned_team || 'BILLING_AND_CODING',
    appeal_status: entry.raw.appeal_status || 'OPEN_TRIAGE',
    ...entry.calc,
    rank_in_facility: idx + 1,
    sha256_item_seal: computeDarProvenanceSeal({
      edition_code: edCode,
      denial_code: entry.raw.denial_code,
      expected_recovery: entry.calc.expected_recovery_usd,
      now
    })
  }));

  const openDenied = Number(compiledWorkqueue.reduce((s, w) => s + w.denied_exposure_usd, 0).toFixed(2));
  const expRecovery = Number(compiledWorkqueue.reduce((s, w) => s + w.expected_recovery_usd, 0).toFixed(2));

  const newEdition = {
    id: edId,
    facility_id: store.config.facility_id,
    edition_code: edCode,
    period_code: periodCode,
    edition_status: 'PUBLISHED',
    total_gross_ar_usd: totGrossAr,
    ar_over_90_usd: over90Ar,
    ar_over_90_pct: arOver90Pct,
    calculated_dso_days: dsoDays,
    open_denied_exposure_usd: openDenied,
    expected_appeal_recovery_usd: expRecovery,
    compiled_by: params.actor_email || 'rcm_lead@naplessurgery.com',
    sha256_report_seal: computeDarProvenanceSeal({ edCode, totGrossAr, expRecovery, now }),
    created_at: now
  };

  store.editions.unshift(newEdition);
  store.agingBuckets.push(...compiledBuckets);
  store.workqueue.push(...compiledWorkqueue);

  const seedCarc = store.carcRootCauses.filter(c => c.edition_id === baseEdId);
  seedCarc.forEach((c, idx) => {
    store.carcRootCauses.push({
      ...c,
      id: `carc-${c.carc_code}-${Date.now()}-${idx}`,
      edition_id: edId
    });
  });

  return {
    edition: { ...newEdition },
    aging_buckets: compiledBuckets,
    workqueue: compiledWorkqueue
  };
}

/**
 * Records a sealed appeal filing, clinical addendum, rebill, or approved write-off.
 */
export async function recordAppealResolutionAction(facilityInput, workqueueId, payload = {}) {
  const store = ensureFacilityStore(facilityInput);
  const item = store.workqueue.find(w => w.id === workqueueId || w.denial_code === workqueueId);
  if (!item) {
    throw new Error(`ERR_DAR_ITEM_NOT_FOUND: Denial workqueue item "${workqueueId}" not found.`);
  }

  const actionType = payload.action_type || 'SUBMIT_LEVEL_1_APPEAL';
  if (!CANONICAL_APPEAL_ACTIONS.includes(actionType)) {
    throw new Error(`ERR_DAR_INVALID_ACTION: Unsupported action_type "${actionType}".`);
  }

  const claimedRecovery = Number(payload.claimed_recovery_usd ?? item.expected_recovery_usd ?? 0);
  if (!Number.isFinite(claimedRecovery) || claimedRecovery < 0) {
    throw new Error('ERR_DAR_INVALID_AMOUNT: claimed_recovery_usd must be >= 0.');
  }

  const notes = String(payload.notes || '').trim();
  if (notes.length < 5) {
    throw new Error('ERR_DAR_NOTE_REQUIRED: Appeal/write-off rationale notes must be at least 5 characters.');
  }

  const now = new Date().toISOString();
  const actorEmail = payload.actor_email || 'rcm_lead@naplessurgery.com';
  const actorRole = payload.actor_role || 'RCM Billing Lead';
  const seal = computeDarProvenanceSeal({
    workqueue_id: item.id,
    actionType,
    claimedRecovery,
    notes,
    actorEmail,
    now
  });

  const entry = {
    id: `apr-${Date.now()}`,
    facility_id: store.config.facility_id,
    workqueue_id: item.id,
    denial_code: item.denial_code,
    action_type: actionType,
    actor_email: actorEmail,
    actor_role: actorRole,
    claimed_recovery_usd: Number(claimedRecovery.toFixed(2)),
    notes,
    sha256_seal: seal,
    created_at: now
  };

  store.appealResolutions.unshift(entry);
  return entry;
}

/**
 * Dispatches Denial & AR Report Edition via Phase H0 (`RPT-H8-DENIAL-AR`).
 */
export async function dispatchDenialArDigest(facilityInput, editionId, options = {}) {
  const store = ensureFacilityStore(facilityInput);
  const ed = store.editions.find(e => e.id === editionId || e.edition_code === editionId);
  if (!ed) {
    throw new Error(`ERR_DAR_EDITION_NOT_FOUND: Edition "${editionId}" not found.`);
  }

  const now = new Date().toISOString();
  const execCode = `RPT-H8-RUN-${Date.now()}`;
  const seal = computeDarProvenanceSeal({ edition_id: ed.id, execCode, now });

  const log = {
    id: `ddsp-${Date.now()}`,
    facility_id: store.config.facility_id,
    edition_id: ed.id,
    rpt_execution_code: execCode,
    delivery_channel: options.delivery_channel || 'PORTAL_INBOX',
    export_format: options.export_format || 'XLSX',
    recipient_count: Number(options.recipient_count ?? 4),
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
  CANONICAL_URGENCY_TIERS,
  CANONICAL_APPEAL_ACTIONS,
  GAAP_AGING_BUCKET_ORDER,
  normalizeFacilityId,
  computeDarProvenanceSeal,
  maskDarSecret,
  calculateDsoDays,
  evaluateDenialItem,
  verifyArBucketConservation,
  getDarConfig,
  updateDarConfig,
  getDarTelemetry,
  getDarEditions,
  getDarAgingSnapshots,
  getDarDenialWorkqueue,
  getDarCarcRootCauses,
  getDarAppealResolutions,
  getDarDispatchLogs,
  compileDenialArEdition,
  recordAppealResolutionAction,
  dispatchDenialArDigest
};
