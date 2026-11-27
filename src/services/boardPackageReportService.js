/**
 * ==============================================================================
 * Service: boardPackageReportService.js
 * Module 17: Enterprise Reporting & Executive Packages (Phase H9)
 * Description: Quarterly Executive Board Package Compiler, Cross-Report
 *              Financial & Operational Synthesis (H1-H8), Debt Covenant
 *              Compliance Monitor, G2 Trust Gate Enforcement, Strategic
 *              Resolutions Vote Ledger, Sequential CFO->Board Sign-Off, and
 *              H0 (RPT-H9-BOARD-PKG) Distribution.
 * ==============================================================================
 */

import { sha256Hex } from '../utils/isomorphicSha256.js';

export const NAPLES_FACILITY_ID = '00000000-0000-0000-0000-000000000002';

export const CANONICAL_PACKAGE_STATUSES = [
  'DRAFT',
  'CFO_VERIFIED',
  'BOARD_APPROVED',
  'LOCKED_PUBLISHED'
];

export const VALID_PACKAGE_TRANSITIONS = {
  DRAFT: ['CFO_VERIFIED'],
  CFO_VERIFIED: ['BOARD_APPROVED'],
  BOARD_APPROVED: ['LOCKED_PUBLISHED'],
  LOCKED_PUBLISHED: []
};

export const CANONICAL_VOTE_OUTCOMES = [
  'APPROVED',
  'DEFERRED',
  'PENDING_VOTE',
  'REJECTED'
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
 * Computes an immutable 64-character SHA-256 provenance seal prefixed with `sha256_bpk_`.
 */
export function computeBpkProvenanceSeal(payload) {
  const canonicalJson = JSON.stringify(payload || {});
  const digest = sha256Hex(canonicalJson);
  return `sha256_bpk_${digest.slice(0, 53)}`;
}

/**
 * Masks Board Package engine secrets strictly as `bpk_sec_****_...`.
 */
export function maskBpkSecret(rawSecret) {
  if (!rawSecret) return 'bpk_sec_****_unset';
  const str = String(rawSecret);
  if (str.startsWith('bpk_sec_****_')) return str;
  return `bpk_sec_****_${str.slice(-4)}`;
}

/**
 * Deterministically evaluates bank/debt covenant compliance (`MIN` or `MAX`).
 */
export function evaluateDebtCovenant(covenant = {}) {
  const comparator = covenant.comparator === 'MAX' ? 'MAX' : 'MIN';
  const threshold = Number(covenant.threshold_value ?? 0);
  const actual = Number(covenant.actual_value ?? 0);

  let status;
  if (comparator === 'MIN') {
    if (actual >= threshold) status = 'COMPLIANT';
    else if (actual >= threshold * 0.9) status = 'WATCH';
    else status = 'BREACH';
  } else {
    if (actual <= threshold) status = 'COMPLIANT';
    else if (actual <= threshold * 1.1) status = 'WATCH';
    else status = 'BREACH';
  }

  return {
    ...covenant,
    comparator,
    threshold_value: Number(threshold.toFixed(2)),
    actual_value: Number(actual.toFixed(2)),
    compliance_status: status
  };
}

/**
 * Deterministically computes quarterly Board financial metrics with zero-denominator guard.
 */
export function computeBoardExecutiveMetrics(raw = {}) {
  const netRev = Number(raw.net_revenue_usd ?? 0);
  const ebitda = Number(raw.ebitda_usd ?? 0);
  const ebitdaMarginPct = netRev > 0 ? Number(((ebitda / netRev) * 100).toFixed(2)) : 0.00;
  return {
    net_revenue_usd: Number(netRev.toFixed(2)),
    ebitda_usd: Number(ebitda.toFixed(2)),
    ebitda_margin_pct: ebitdaMarginPct,
    dso_days: Number(Number(raw.dso_days ?? 32.0).toFixed(1)),
    or_adjusted_util_pct: Number(Number(raw.or_adjusted_util_pct ?? 85.0).toFixed(2)),
    realized_roi_value_usd: Number(Number(raw.realized_roi_value_usd ?? 0).toFixed(2))
  };
}

// ==============================================================================
// In-Memory Deterministic Store (Multi-Tenant Safe)
// ==============================================================================
const facilityStores = new Map();

function buildInitialStore(facilityId) {
  const pkgQ4Id = 'bpk-pkg-2026q4';

  const config = {
    facility_id: facilityId,
    min_dq_trust_score_for_board: 80.00,
    min_dscr_covenant: 1.25,
    max_leverage_ratio: 3.50,
    require_cfo_and_chair_signoff: true,
    client_secret_encrypted: 'bpk_sec_****_naples_9501',
    sync_status: 'ACTIVE',
    health_status: 'HEALTHY',
    updated_at: '2026-11-27T07:00:00.000Z'
  };

  const covenants = [
    evaluateDebtCovenant({ id: 'cov-1', facility_id: facilityId, package_id: pkgQ4Id, covenant_name: 'Debt Service Coverage Ratio (DSCR)', lender_facility: 'Truist Healthcare Credit', comparator: 'MIN', threshold_value: 1.25, actual_value: 2.42, unit_label: 'x' }),
    evaluateDebtCovenant({ id: 'cov-2', facility_id: facilityId, package_id: pkgQ4Id, covenant_name: 'Total Funded Debt / TTM EBITDA', lender_facility: 'Truist Healthcare Credit', comparator: 'MAX', threshold_value: 3.50, actual_value: 1.85, unit_label: 'x' }),
    evaluateDebtCovenant({ id: 'cov-3', facility_id: facilityId, package_id: pkgQ4Id, covenant_name: 'Unrestricted Days Cash on Hand', lender_facility: 'JPMorgan Treasury Line', comparator: 'MIN', threshold_value: 45.00, actual_value: 68.40, unit_label: 'days' }),
    evaluateDebtCovenant({ id: 'cov-4', facility_id: facilityId, package_id: pkgQ4Id, covenant_name: 'Quarterly Capital Expenditure Cap', lender_facility: 'Board Fiscal Policy', comparator: 'MAX', threshold_value: 350.00, actual_value: 210.00, unit_label: '$K' })
  ];

  const packages = [
    {
      id: pkgQ4Id,
      facility_id: facilityId,
      package_code: 'BPK-2026-Q4-NAP',
      period_code: '2026-Q4',
      package_status: 'CFO_VERIFIED',
      dq_trust_score: 94.20,
      net_revenue_usd: 5580000.00,
      ebitda_usd: 1339200.00,
      ebitda_margin_pct: 24.00,
      dso_days: 32.0,
      or_adjusted_util_pct: 87.95,
      realized_roi_value_usd: 284500.00,
      is_covenant_compliant: covenants.every(c => c.compliance_status !== 'BREACH'),
      compiled_by: 'cfo@naplessurgery.com',
      sha256_package_seal: computeBpkProvenanceSeal({ facilityId, package_code: 'BPK-2026-Q4-NAP', period_code: '2026-Q4' }),
      created_at: '2026-11-27T07:00:00.000Z'
    }
  ];

  const sections = [
    {
      id: 'bsec-fin',
      facility_id: facilityId,
      package_id: pkgQ4Id,
      section_code: 'FINANCIAL_PNL',
      section_title: 'GAAP Financial Performance & Cash Liquidity',
      source_phase_ref: 'H3 / H6',
      headline_metric: '$5.58M Rev · 24.0% EBITDA',
      executive_summary: 'Quarterly EBITDA reached $1.34M (+180 bps vs prior year) anchored by Orthopedic & Sports Medicine CPT unit economics.',
      reviewed_by_cfo: true
    },
    {
      id: 'bsec-or',
      facility_id: facilityId,
      package_id: pkgQ4Id,
      section_code: 'CLINICAL_OR_CAPACITY',
      section_title: 'OR Block Utilization & Suite Throughput',
      source_phase_ref: 'H1 / H4 / H7',
      headline_metric: '87.95% Adj OR Util',
      executive_summary: 'Suites 1–3 operated above 88% adjusted utilization; reallocation of 6h/mo underutilized Friday PM ophthalmology block recommended.',
      reviewed_by_cfo: true
    },
    {
      id: 'bsec-rcm',
      facility_id: facilityId,
      package_id: pkgQ4Id,
      section_code: 'PAYER_RCM_CYCLE',
      section_title: 'Payer Contract Yield, Denials & AR Velocity',
      source_phase_ref: 'H2 / H5 / H8',
      headline_metric: '32.0d DSO · $69.2K Exp Rec',
      executive_summary: 'DSO tightened to 32.0 days while UHC carve-out demands ($26.2K) and CARC 197 pre-auth retro-reviews ($24.3K) remain open prior to 48d renewal.',
      reviewed_by_cfo: true
    },
    {
      id: 'bsec-comp',
      facility_id: facilityId,
      package_id: pkgQ4Id,
      section_code: 'COMPLIANCE_RISK',
      section_title: 'Data Quality Trust Gates & Provenance',
      source_phase_ref: 'G2 / H0',
      headline_metric: '94.2% DQ Trust Score',
      executive_summary: 'All financial close reports cleared the 80% G2 Trust Gate with unbroken SHA-256 cryptographic seals.',
      reviewed_by_cfo: true
    }
  ];

  const resolutions = [
    {
      id: 'bres-1',
      facility_id: facilityId,
      package_id: pkgQ4Id,
      resolution_code: 'RES-2026-Q4-01',
      title: 'Approve Capitated Shoulder Anchor Bundle Renewal w/ Stryker',
      category: 'SUPPLY_CHAIN',
      capital_impact_usd: 142000.00,
      vote_outcome: 'APPROVED',
      sponsor_role: 'CFO / Materials Director',
      notes: 'Saves $420/case across 340 annual arthroscopic shoulder cases.',
      sha256_seal: computeBpkProvenanceSeal({ resolution_code: 'RES-2026-Q4-01' }),
      created_at: '2026-11-27T08:00:00.000Z'
    },
    {
      id: 'bres-2',
      facility_id: facilityId,
      package_id: pkgQ4Id,
      resolution_code: 'RES-2026-Q4-02',
      title: 'Authorize C-Arm Fluoroscopy Lease Buyout vs Renewal',
      category: 'CAPITAL_EQUIPMENT',
      capital_impact_usd: 185000.00,
      vote_outcome: 'PENDING_VOTE',
      sponsor_role: 'Facility Administrator',
      notes: 'Improves Pain/Spine NOI by $68/case over 48-month useful life.',
      sha256_seal: computeBpkProvenanceSeal({ resolution_code: 'RES-2026-Q4-02' }),
      created_at: '2026-11-27T08:05:00.000Z'
    }
  ];

  const signoffAudit = [
    {
      id: 'bsgn-1',
      facility_id: facilityId,
      package_id: pkgQ4Id,
      from_status: 'DRAFT',
      to_status: 'CFO_VERIFIED',
      actor_email: 'cfo@naplessurgery.com',
      actor_role: 'CFO / Finance Director',
      notes: 'Verified H3 EBITDA bridge, H8 GAAP 6-bucket AR balance, and bank covenant ratios.',
      sha256_seal: computeBpkProvenanceSeal({ signoff: 'bsgn-1' }),
      created_at: '2026-11-27T08:15:00.000Z'
    }
  ];

  const dispatchLogs = [
    {
      id: 'bdsp-q4-01',
      facility_id: facilityId,
      package_id: pkgQ4Id,
      rpt_execution_code: 'RPT-H9-RUN-Q4-01',
      delivery_channel: 'BOARD_PORTAL',
      export_format: 'PDF',
      recipient_count: 7,
      dispatch_status: 'DELIVERED',
      dispatched_by: 'cfo@naplessurgery.com',
      sha256_sync_seal: computeBpkProvenanceSeal({ exec: 'RPT-H9-RUN-Q4-01' }),
      created_at: '2026-11-27T08:30:00.000Z'
    }
  ];

  return {
    config,
    packages,
    covenants,
    sections,
    resolutions,
    signoffAudit,
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
export async function getBpkConfig(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return { ...store.config };
}

export async function updateBpkConfig(facilityInput, updates = {}) {
  const store = ensureFacilityStore(facilityInput);
  const trustFloor = Number(updates.min_dq_trust_score_for_board ?? store.config.min_dq_trust_score_for_board);
  const minDscr = Number(updates.min_dscr_covenant ?? store.config.min_dscr_covenant);
  const maxLev = Number(updates.max_leverage_ratio ?? store.config.max_leverage_ratio);

  if (!Number.isFinite(trustFloor) || trustFloor < 50 || trustFloor > 100) {
    throw new Error('ERR_BPK_INVALID_CONFIG: min_dq_trust_score_for_board must be between 50 and 100.');
  }
  if (!Number.isFinite(minDscr) || minDscr <= 0) {
    throw new Error('ERR_BPK_INVALID_CONFIG: min_dscr_covenant must be > 0.');
  }
  if (!Number.isFinite(maxLev) || maxLev <= 0) {
    throw new Error('ERR_BPK_INVALID_CONFIG: max_leverage_ratio must be > 0.');
  }

  store.config = {
    ...store.config,
    min_dq_trust_score_for_board: Number(trustFloor.toFixed(2)),
    min_dscr_covenant: Number(minDscr.toFixed(2)),
    max_leverage_ratio: Number(maxLev.toFixed(2)),
    require_cfo_and_chair_signoff:
      updates.require_cfo_and_chair_signoff !== undefined
        ? Boolean(updates.require_cfo_and_chair_signoff)
        : store.config.require_cfo_and_chair_signoff,
    updated_at: new Date().toISOString()
  };

  return { ...store.config };
}

export async function getBpkTelemetry(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  const latest = store.packages[0];
  const covs = latest ? store.covenants.filter(c => c.package_id === latest.id) : [];
  const breached = covs.filter(c => c.compliance_status === 'BREACH').length;

  return {
    facility_id: store.config.facility_id,
    latest_package_code: latest?.package_code || null,
    latest_package_status: latest?.package_status || null,
    period_code: latest?.period_code || null,
    dq_trust_score: latest?.dq_trust_score ?? 0,
    net_revenue_usd: latest?.net_revenue_usd ?? 0,
    ebitda_usd: latest?.ebitda_usd ?? 0,
    ebitda_margin_pct: latest?.ebitda_margin_pct ?? 0,
    dso_days: latest?.dso_days ?? 0,
    or_adjusted_util_pct: latest?.or_adjusted_util_pct ?? 0,
    realized_roi_value_usd: latest?.realized_roi_value_usd ?? 0,
    is_covenant_compliant: latest?.is_covenant_compliant ?? true,
    covenant_breaches: breached,
    sync_status: store.config.sync_status,
    health_status: store.config.health_status,
    latest_sync_seal: latest?.sha256_package_seal || null
  };
}

export async function getBpkPackages(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return store.packages.map(p => ({ ...p }));
}

export async function getBpkCovenants(facilityInput, packageId = null) {
  const store = ensureFacilityStore(facilityInput);
  const targetPkgId = packageId || store.packages[0]?.id;
  return store.covenants.filter(c => c.package_id === targetPkgId).map(c => ({ ...c }));
}

export async function getBpkExecutiveSections(facilityInput, packageId = null) {
  const store = ensureFacilityStore(facilityInput);
  const targetPkgId = packageId || store.packages[0]?.id;
  return store.sections.filter(s => s.package_id === targetPkgId).map(s => ({ ...s }));
}

export async function getBpkResolutions(facilityInput, packageId = null) {
  const store = ensureFacilityStore(facilityInput);
  const targetPkgId = packageId || store.packages[0]?.id;
  return store.resolutions.filter(r => r.package_id === targetPkgId).map(r => ({ ...r }));
}

export async function getBpkSignoffAudit(facilityInput, packageId = null) {
  const store = ensureFacilityStore(facilityInput);
  const targetPkgId = packageId || store.packages[0]?.id;
  return store.signoffAudit.filter(a => a.package_id === targetPkgId).map(a => ({ ...a }));
}

export async function getBpkDispatchLogs(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return store.dispatchLogs.map(d => ({ ...d }));
}

// ==============================================================================
// Write / Mutation Endpoints
// ==============================================================================

/**
 * Compiles a new Quarterly Executive Board Package in DRAFT status.
 */
export async function compileBoardPackageEdition(facilityInput, params = {}) {
  const store = ensureFacilityStore(facilityInput);
  const now = new Date().toISOString();
  const periodCode = params.period_code || '2027-Q1';
  const basePkgId = store.packages[0]?.id;

  const pkgId = `bpk-pkg-${periodCode.replace(/[^0-9a-zA-Z]/g, '')}-${Date.now()}`;
  const pkgCode = `BPK-${periodCode}-NAP`;

  const metrics = computeBoardExecutiveMetrics({
    net_revenue_usd: params.net_revenue_usd ?? 5720000.00,
    ebitda_usd: params.ebitda_usd ?? 1401400.00,
    dso_days: params.dso_days ?? 30.8,
    or_adjusted_util_pct: params.or_adjusted_util_pct ?? 89.10,
    realized_roi_value_usd: params.realized_roi_value_usd ?? 312000.00
  });
  const dqTrust = Number(params.dq_trust_score ?? 95.10);

  const rawCovs = Array.isArray(params.covenants) && params.covenants.length > 0
    ? params.covenants
    : store.covenants.filter(c => c.package_id === basePkgId);

  const compiledCovs = rawCovs.map((c, idx) =>
    evaluateDebtCovenant({
      ...c,
      id: `cov-${Date.now()}-${idx}`,
      facility_id: store.config.facility_id,
      package_id: pkgId
    })
  );

  const isCompliant = compiledCovs.every(c => c.compliance_status !== 'BREACH');

  const newPkg = {
    id: pkgId,
    facility_id: store.config.facility_id,
    package_code: pkgCode,
    period_code: periodCode,
    package_status: 'DRAFT',
    dq_trust_score: dqTrust,
    ...metrics,
    is_covenant_compliant: isCompliant,
    compiled_by: params.actor_email || 'cfo@naplessurgery.com',
    sha256_package_seal: computeBpkProvenanceSeal({ pkgCode, periodCode, metrics, dqTrust, now }),
    created_at: now
  };

  store.packages.unshift(newPkg);
  store.covenants.push(...compiledCovs);

  store.sections
    .filter(s => s.package_id === basePkgId)
    .forEach((s, idx) => {
      store.sections.push({
        ...s,
        id: `bsec-${Date.now()}-${idx}`,
        package_id: pkgId
      });
    });

  store.resolutions
    .filter(r => r.package_id === basePkgId)
    .forEach((r, idx) => {
      store.resolutions.push({
        ...r,
        id: `bres-${Date.now()}-${idx}`,
        package_id: pkgId
      });
    });

  return {
    package: { ...newPkg },
    covenants: compiledCovs
  };
}

/**
 * Advances Board Package governance state (`DRAFT -> CFO_VERIFIED -> BOARD_APPROVED -> LOCKED_PUBLISHED`)
 * enforcing DQ Trust Gate and sequential transition rules.
 */
export async function advanceBoardPackageStatus(facilityInput, packageId, targetStatus, options = {}) {
  const store = ensureFacilityStore(facilityInput);
  const pkg = store.packages.find(p => p.id === packageId || p.package_code === packageId);
  if (!pkg) {
    throw new Error(`ERR_BPK_PACKAGE_NOT_FOUND: Board package "${packageId}" not found.`);
  }
  if (pkg.package_status === 'LOCKED_PUBLISHED') {
    throw new Error(`ERR_BPK_LOCKED: Package "${pkg.package_code}" is LOCKED_PUBLISHED and immutable.`);
  }

  const allowedNext = VALID_PACKAGE_TRANSITIONS[pkg.package_status] || [];
  if (!allowedNext.includes(targetStatus)) {
    throw new Error(
      `ERR_BPK_INVALID_TRANSITION: Cannot transition ${pkg.package_status} -> ${targetStatus}.`
    );
  }

  if (pkg.dq_trust_score < store.config.min_dq_trust_score_for_board) {
    throw new Error(
      `ERR_BPK_TRUST_GATE_BLOCKED: DQ trust score ${pkg.dq_trust_score}% below Board threshold ${store.config.min_dq_trust_score_for_board}%.`
    );
  }

  const notes = String(options.notes || '').trim();
  if (notes.length < 5) {
    throw new Error('ERR_BPK_NOTE_REQUIRED: Sign-off notes must be at least 5 characters.');
  }

  const now = new Date().toISOString();
  const prevStatus = pkg.package_status;
  const actorEmail = options.actor_email || (targetStatus === 'CFO_VERIFIED' ? 'cfo@naplessurgery.com' : 'chair@naplessurgery.com');
  const actorRole = options.actor_role || (targetStatus === 'CFO_VERIFIED' ? 'CFO / Finance Director' : 'Board Chair');
  const seal = computeBpkProvenanceSeal({ package_code: pkg.package_code, prevStatus, targetStatus, actorEmail, now });

  pkg.package_status = targetStatus;
  pkg.sha256_package_seal = seal;

  const auditEntry = {
    id: `bsgn-${Date.now()}`,
    facility_id: store.config.facility_id,
    package_id: pkg.id,
    from_status: prevStatus,
    to_status: targetStatus,
    actor_email: actorEmail,
    actor_role: actorRole,
    notes,
    sha256_seal: seal,
    created_at: now
  };
  store.signoffAudit.unshift(auditEntry);

  return {
    package: { ...pkg },
    signoff_entry: auditEntry
  };
}

/**
 * Records a sealed Board strategic resolution or CapEx vote.
 */
export async function recordBoardResolutionVote(facilityInput, resolutionId, payload = {}) {
  const store = ensureFacilityStore(facilityInput);
  const res = store.resolutions.find(r => r.id === resolutionId || r.resolution_code === resolutionId);
  if (!res) {
    throw new Error(`ERR_BPK_RESOLUTION_NOT_FOUND: Resolution "${resolutionId}" not found.`);
  }

  const pkg = store.packages.find(p => p.id === res.package_id);
  if (pkg && pkg.package_status === 'LOCKED_PUBLISHED') {
    throw new Error(`ERR_BPK_LOCKED: Package "${pkg.package_code}" is LOCKED_PUBLISHED; votes cannot be altered.`);
  }

  const voteOutcome = payload.vote_outcome || 'APPROVED';
  if (!CANONICAL_VOTE_OUTCOMES.includes(voteOutcome)) {
    throw new Error(`ERR_BPK_INVALID_VOTE: Unsupported vote_outcome "${voteOutcome}".`);
  }

  const notes = String(payload.notes || '').trim();
  if (notes.length < 5) {
    throw new Error('ERR_BPK_NOTE_REQUIRED: Board resolution rationale must be at least 5 characters.');
  }

  const now = new Date().toISOString();
  const seal = computeBpkProvenanceSeal({
    resolution_id: res.id,
    voteOutcome,
    notes,
    now
  });

  res.vote_outcome = voteOutcome;
  res.notes = notes;
  res.sha256_seal = seal;

  return { ...res };
}

/**
 * Dispatches Quarterly Board Package via Phase H0 (`RPT-H9-BOARD-PKG`).
 */
export async function dispatchBoardPackageDigest(facilityInput, packageId, options = {}) {
  const store = ensureFacilityStore(facilityInput);
  const pkg = store.packages.find(p => p.id === packageId || p.package_code === packageId);
  if (!pkg) {
    throw new Error(`ERR_BPK_PACKAGE_NOT_FOUND: Board package "${packageId}" not found.`);
  }

  const now = new Date().toISOString();
  const execCode = `RPT-H9-RUN-${Date.now()}`;
  const seal = computeBpkProvenanceSeal({ package_id: pkg.id, execCode, now });

  const log = {
    id: `bdsp-${Date.now()}`,
    facility_id: store.config.facility_id,
    package_id: pkg.id,
    rpt_execution_code: execCode,
    delivery_channel: options.delivery_channel || 'BOARD_PORTAL',
    export_format: options.export_format || 'PDF',
    recipient_count: Number(options.recipient_count ?? 7),
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
  CANONICAL_PACKAGE_STATUSES,
  VALID_PACKAGE_TRANSITIONS,
  CANONICAL_VOTE_OUTCOMES,
  normalizeFacilityId,
  computeBpkProvenanceSeal,
  maskBpkSecret,
  evaluateDebtCovenant,
  computeBoardExecutiveMetrics,
  getBpkConfig,
  updateBpkConfig,
  getBpkTelemetry,
  getBpkPackages,
  getBpkCovenants,
  getBpkExecutiveSections,
  getBpkResolutions,
  getBpkSignoffAudit,
  getBpkDispatchLogs,
  compileBoardPackageEdition,
  advanceBoardPackageStatus,
  recordBoardResolutionVote,
  dispatchBoardPackageDigest
};
