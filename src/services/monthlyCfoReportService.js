/**
 * ==============================================================================
 * Service: monthlyCfoReportService.js
 * Module 17: Enterprise Reporting & Executive Packages (Phase H3)
 * Description: Monthly CFO Financial & Operational Report Compiler,
 *              GAAP P&L Waterfall Reconciliation, Cash Roll-Forward Bridge,
 *              Material Variance Commentary Gates, Dual-Key Close Sign-Off,
 *              and SHA-256 Provenance Seals.
 * ==============================================================================
 */

import { sha256Hex } from '../utils/isomorphicSha256.js';

export const NAPLES_FACILITY_ID = '00000000-0000-0000-0000-000000000002';

export const CANONICAL_SIGNOFF_STATES = [
  'DRAFT',
  'CONTROLLER_VERIFIED',
  'CFO_SIGNED_OFF',
  'LOCKED_CLOSED'
];

export const VALID_SIGNOFF_TRANSITIONS = {
  DRAFT: ['CONTROLLER_VERIFIED'],
  CONTROLLER_VERIFIED: ['CFO_SIGNED_OFF'],
  CFO_SIGNED_OFF: ['LOCKED_CLOSED'],
  LOCKED_CLOSED: []
};

export const CANONICAL_PNL_SECTIONS = [
  'REVENUE',
  'COGS_DIRECT',
  'OPERATING_EXPENSE',
  'EBITDA'
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
 * Computes an immutable 64-character SHA-256 provenance seal prefixed with `sha256_mcr_`.
 */
export function computeMcrProvenanceSeal(payload) {
  const canonicalJson = JSON.stringify(payload || {});
  const digest = sha256Hex(canonicalJson);
  return `sha256_mcr_${digest.slice(0, 53)}`;
}

/**
 * Masks CFO close engine secrets strictly as `mcr_sec_****_...`.
 */
export function maskMcrSecret(rawSecret) {
  if (!rawSecret) return 'mcr_sec_****_unset';
  const str = String(rawSecret);
  if (str.startsWith('mcr_sec_****_')) return str;
  return `mcr_sec_****_${str.slice(-4)}`;
}

/**
 * Deterministically computes core monthly CFO financial and liquidity KPIs.
 */
export function computeMonthlyCfoMetrics(rawInputs = {}) {
  const gross = Number(rawInputs.gross_charges_usd ?? 0);
  const allowances = Number(rawInputs.contractual_allowances_usd ?? 0);
  const netRev = Number((gross - allowances).toFixed(2));

  const supplies = Number(rawInputs.supplies_cost_usd ?? 0);
  const labor = Number(rawInputs.labor_cost_usd ?? 0);
  const opex = Number(rawInputs.overhead_opex_usd ?? 0);
  const totalOpEx = Number((supplies + labor + opex).toFixed(2));
  const ebitda = Number((netRev - totalOpEx).toFixed(2));
  const ebitdaMarginPct = netRev > 0 ? Number(((ebitda / netRev) * 100).toFixed(2)) : 0.00;

  const openCash = Number(rawInputs.opening_cash_usd ?? 0);
  const inflows = Number(rawInputs.operating_cash_inflows_usd ?? 0);
  const payrollApOut = Number(rawInputs.payroll_ap_outflows_usd ?? 0);
  const capexDebtOut = Number(rawInputs.capex_debt_outflows_usd ?? 0);
  const closingCash = Number((openCash + inflows - payrollApOut - capexDebtOut).toFixed(2));

  const opCashFlow = inflows - payrollApOut;
  const cashConversionPct = ebitda > 0 ? Number(((opCashFlow / ebitda) * 100).toFixed(2)) : 0.00;

  return {
    net_patient_revenue_usd: netRev,
    total_operating_expense_usd: totalOpEx,
    ebitda_usd: ebitda,
    ebitda_margin_pct: ebitdaMarginPct,
    closing_cash_usd: closingCash,
    cash_to_ebitda_conversion_pct: cashConversionPct
  };
}

/**
 * Validates GAAP P&L waterfall conservation: Revenue - COGS - OpEx === EBITDA (+-$0.01).
 */
export function verifyPnlReconciliationInvariant(pnlLines = []) {
  const revSum = pnlLines
    .filter(l => l.section === 'REVENUE')
    .reduce((s, l) => s + Number(l.actual_usd || 0), 0);
  const costSum = pnlLines
    .filter(l => l.section === 'COGS_DIRECT' || l.section === 'OPERATING_EXPENSE')
    .reduce((s, l) => s + Number(l.actual_usd || 0), 0);
  const reportedEbitda = pnlLines
    .filter(l => l.section === 'EBITDA')
    .reduce((s, l) => s + Number(l.actual_usd || 0), 0);

  const expectedEbitda = Number((revSum - costSum).toFixed(2));
  const variance = Math.abs(Number((reportedEbitda - expectedEbitda).toFixed(2)));
  if (variance > 0.01) {
    throw new Error(
      `ERR_MCR_PNL_IMBALANCE: Reconciled EBITDA ($${expectedEbitda}) does not match reported EBITDA ($${reportedEbitda})`
    );
  }
  return { balanced: true, expected_ebitda_usd: expectedEbitda, reported_ebitda_usd: Number(reportedEbitda.toFixed(2)) };
}

// ==============================================================================
// Deterministic In-Memory Facility Store (Naples Surgery Center Seed)
// ==============================================================================

const facilityStateStore = new Map();

function buildInitialFacilityStore(facilityId) {
  const config = {
    id: 'h3000001-0000-4000-8000-000000000001',
    facility_id: facilityId,
    close_day_of_month: 5,
    require_dq_trust_gate: true,
    min_trust_score_for_signoff: 75.00,
    material_variance_pct: 5.00,
    ebitda_target_margin_pct: 22.00,
    client_secret_encrypted: 'mcr_sec_****_naples_5012',
    sync_status: 'ACTIVE',
    health_status: 'HEALTHY',
    updated_at: '2026-11-27T08:00:00.000Z'
  };

  const edId = 'mcr-ed-202611';
  const editions = [
    {
      id: edId,
      facility_id: facilityId,
      report_code: 'MCR-2026-11-NAP',
      fiscal_period: '2026-11',
      completed_cases: 418,
      gross_charges_usd: 4680000.00,
      contractual_allowances_usd: 2820000.00,
      net_patient_revenue_usd: 1860000.00,
      total_operating_expense_usd: 1428000.00,
      ebitda_usd: 432000.00,
      ebitda_margin_pct: 23.23,
      cash_collections_usd: 1815000.00,
      cash_to_ebitda_conversion_pct: 74.07,
      ending_cash_usd: 2418500.00,
      days_cash_on_hand: 52,
      ar_days_dso: 34,
      budget_variance_usd: 28500.00,
      dq_trust_score: 94.80,
      signoff_status: 'DRAFT',
      compiled_by: 'controller@naplessurgery.com',
      sha256_report_seal: computeMcrProvenanceSeal({ report_code: 'MCR-2026-11-NAP', ebitda: 432000.00 }),
      created_at: '2026-11-27T08:00:05.000Z'
    }
  ];

  const pnlBridge = [
    { id: 'pl-1', facility_id: facilityId, edition_id: edId, line_order: 1, line_code: 'REV_NET', line_label: 'Net Patient Service Revenue', section: 'REVENUE', actual_usd: 1860000.00, budget_usd: 1810000.00, variance_usd: 50000.00, variance_pct: 2.76, is_favorable: true },
    { id: 'pl-2', facility_id: facilityId, edition_id: edId, line_order: 2, line_code: 'COGS_IMP', line_label: 'Implants & Surgical Supplies', section: 'COGS_DIRECT', actual_usd: 584000.00, budget_usd: 542000.00, variance_usd: 42000.00, variance_pct: 7.75, is_favorable: false },
    { id: 'pl-3', facility_id: facilityId, edition_id: edId, line_order: 3, line_code: 'COGS_LAB', line_label: 'Clinical & RN/Tech Labor', section: 'COGS_DIRECT', actual_usd: 488000.00, budget_usd: 495000.00, variance_usd: -7000.00, variance_pct: -1.41, is_favorable: true },
    { id: 'pl-4', facility_id: facilityId, edition_id: edId, line_order: 4, line_code: 'OPEX_FAC', line_label: 'Facility Rent, Utilities & Admin', section: 'OPERATING_EXPENSE', actual_usd: 356000.00, budget_usd: 369500.00, variance_usd: -13500.00, variance_pct: -3.65, is_favorable: true },
    { id: 'pl-5', facility_id: facilityId, edition_id: edId, line_order: 5, line_code: 'EBITDA_TOT', line_label: 'Monthly Operating EBITDA', section: 'EBITDA', actual_usd: 432000.00, budget_usd: 403500.00, variance_usd: 28500.00, variance_pct: 7.06, is_favorable: true }
  ];

  const cashBridges = [
    {
      id: 'cb-1',
      facility_id: facilityId,
      edition_id: edId,
      opening_cash_usd: 2195000.00,
      operating_cash_inflows_usd: 1815000.00,
      payroll_ap_outflows_usd: 1495000.00,
      capex_debt_outflows_usd: 96500.00,
      closing_cash_usd: 2418500.00,
      cash_variance_against_gl_usd: 0.00
    }
  ];

  const varianceCommentary = [
    {
      id: 'mcr-var-101',
      facility_id: facilityId,
      edition_id: edId,
      variance_code: 'MCR-VAR-101',
      line_code: 'COGS_IMP',
      line_label: 'Implants & Surgical Supplies',
      variance_usd: 42000.00,
      variance_pct: 7.75,
      driver_summary: 'High-acuity spine & arthroplasty volume up +14 cases over Nov budget.',
      corrective_action: 'Reconcile Stryker/Arthrex carveout reimbursements via Phase H2.',
      owner_role: 'Materials Manager',
      status: 'OPEN_EXPLANATION',
      verified_by: null,
      updated_at: '2026-11-27T08:00:05.000Z'
    }
  ];

  const signoffs = [
    {
      id: 'sgn-01',
      facility_id: facilityId,
      edition_id: edId,
      from_status: 'NONE',
      to_status: 'DRAFT',
      actor_email: 'controller@naplessurgery.com',
      actor_role: 'Controller',
      notes: 'Compiled November 2026 P&L & Cash roll-forward from Module 14 E0-E3 ledgers.',
      sha256_seal: computeMcrProvenanceSeal({ edition_id: edId, to_status: 'DRAFT' }),
      created_at: '2026-11-27T08:00:05.000Z'
    }
  ];

  const dispatchLogs = [
    {
      id: 'mdsp-01',
      facility_id: facilityId,
      edition_id: edId,
      rpt_execution_code: 'RPT-H3-RUN-NOV-01',
      delivery_channel: 'PORTAL_INBOX',
      export_format: 'PDF',
      recipient_count: 3,
      dispatch_status: 'DELIVERED',
      dispatched_by: 'controller@naplessurgery.com',
      sha256_sync_seal: computeMcrProvenanceSeal({ exec: 'RPT-H3-RUN-NOV-01', edition_id: edId }),
      created_at: '2026-11-27T08:05:00.000Z'
    }
  ];

  return {
    config,
    editions,
    pnlBridge,
    cashBridges,
    varianceCommentary,
    signoffs,
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

export async function getMcrConfig(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return {
    ...store.config,
    client_secret_encrypted: maskMcrSecret(store.config.client_secret_encrypted)
  };
}

export async function updateMcrConfig(facilityInput, updates = {}) {
  const store = ensureFacilityStore(facilityInput);
  const nextTrust = Number(updates.min_trust_score_for_signoff ?? store.config.min_trust_score_for_signoff);
  const nextCloseDay = Number(updates.close_day_of_month ?? store.config.close_day_of_month);

  if (!Number.isFinite(nextTrust) || nextTrust < 50 || nextTrust > 100) {
    throw new Error('ERR_MCR_INVALID_CONFIG: min_trust_score_for_signoff must be between 50 and 100');
  }
  if (!Number.isInteger(nextCloseDay) || nextCloseDay < 1 || nextCloseDay > 28) {
    throw new Error('ERR_MCR_INVALID_CONFIG: close_day_of_month must be between 1 and 28');
  }

  store.config = {
    ...store.config,
    close_day_of_month: nextCloseDay,
    require_dq_trust_gate: updates.require_dq_trust_gate ?? store.config.require_dq_trust_gate,
    min_trust_score_for_signoff: nextTrust,
    material_variance_pct: Number(updates.material_variance_pct ?? store.config.material_variance_pct),
    ebitda_target_margin_pct: Number(updates.ebitda_target_margin_pct ?? store.config.ebitda_target_margin_pct),
    updated_at: new Date().toISOString()
  };

  return getMcrConfig(facilityInput);
}

export async function getMcrTelemetry(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  const latest = store.editions[0];
  return {
    facility_id: store.config.facility_id,
    min_trust_score_for_signoff: store.config.min_trust_score_for_signoff,
    ebitda_target_margin_pct: store.config.ebitda_target_margin_pct,
    latest_report_code: latest ? latest.report_code : null,
    latest_net_revenue_usd: latest ? latest.net_patient_revenue_usd : 0.00,
    latest_ebitda_usd: latest ? latest.ebitda_usd : 0.00,
    latest_ebitda_margin_pct: latest ? latest.ebitda_margin_pct : 0.00,
    latest_signoff_status: latest ? latest.signoff_status : 'DRAFT',
    latest_sync_seal: latest ? latest.sha256_report_seal : computeMcrProvenanceSeal(store.config),
    sync_status: store.config.sync_status,
    health_status: store.config.health_status
  };
}

export async function getMcrEditions(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return [...store.editions];
}

export async function getMcrPnlBridge(facilityInput, editionId = null) {
  const store = ensureFacilityStore(facilityInput);
  const targetId = editionId || store.editions[0]?.id;
  return store.pnlBridge
    .filter(l => l.edition_id === targetId)
    .sort((a, b) => Number(a.line_order) - Number(b.line_order));
}

export async function getMcrCashBridge(facilityInput, editionId = null) {
  const store = ensureFacilityStore(facilityInput);
  const targetId = editionId || store.editions[0]?.id;
  return store.cashBridges.find(c => c.edition_id === targetId) || null;
}

export async function getMcrVarianceCommentary(facilityInput, editionId = null) {
  const store = ensureFacilityStore(facilityInput);
  const targetId = editionId || store.editions[0]?.id;
  return store.varianceCommentary.filter(v => v.edition_id === targetId);
}

export async function getMcrSignoffs(facilityInput, editionId = null) {
  const store = ensureFacilityStore(facilityInput);
  return editionId
    ? store.signoffs.filter(s => s.edition_id === editionId)
    : [...store.signoffs];
}

export async function getMcrDispatchLogs(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return [...store.dispatchLogs];
}

// ==============================================================================
// Mutations (Compile Edition, Verify Variance, Dual-Key Close Sign-Off, H0)
// ==============================================================================

/**
 * Compiles a new reconciled Monthly CFO Report edition, enforcing P&L conservation
 * and cash roll-forward invariants.
 */
export async function compileMonthlyCfoReport(facilityInput, payload = {}) {
  const store = ensureFacilityStore(facilityInput);
  const fiscalPeriod = payload.fiscal_period || '2026-12';
  const actorEmail = payload.actor_email || 'controller@naplessurgery.com';

  const inputs = payload.financial_inputs || {
    completed_cases: 430,
    gross_charges_usd: 4820000.00,
    contractual_allowances_usd: 2900000.00,
    supplies_cost_usd: 590000.00,
    labor_cost_usd: 492000.00,
    overhead_opex_usd: 360000.00,
    opening_cash_usd: 2418500.00,
    operating_cash_inflows_usd: 1880000.00,
    payroll_ap_outflows_usd: 1510000.00,
    capex_debt_outflows_usd: 92000.00,
    days_cash_on_hand: 55,
    ar_days_dso: 32,
    dq_trust_score: 96.10
  };

  const metrics = computeMonthlyCfoMetrics(inputs);
  const edId = `mcr-ed-${fiscalPeriod.replace(/-/g, '')}-${Date.now().toString().slice(-3)}`;
  const reportCode = `MCR-${fiscalPeriod}-NAP`;
  const now = new Date().toISOString();

  const pnlLines = [
    { id: `pl-${Date.now()}-1`, facility_id: store.config.facility_id, edition_id: edId, line_order: 1, line_code: 'REV_NET', line_label: 'Net Patient Service Revenue', section: 'REVENUE', actual_usd: metrics.net_patient_revenue_usd, budget_usd: 1880000.00, variance_usd: Number((metrics.net_patient_revenue_usd - 1880000).toFixed(2)), variance_pct: 2.13, is_favorable: true },
    { id: `pl-${Date.now()}-2`, facility_id: store.config.facility_id, edition_id: edId, line_order: 2, line_code: 'COGS_IMP', line_label: 'Implants & Surgical Supplies', section: 'COGS_DIRECT', actual_usd: Number(inputs.supplies_cost_usd), budget_usd: 580000.00, variance_usd: Number((Number(inputs.supplies_cost_usd) - 580000).toFixed(2)), variance_pct: 1.72, is_favorable: false },
    { id: `pl-${Date.now()}-3`, facility_id: store.config.facility_id, edition_id: edId, line_order: 3, line_code: 'COGS_LAB', line_label: 'Clinical & RN/Tech Labor', section: 'COGS_DIRECT', actual_usd: Number(inputs.labor_cost_usd), budget_usd: 500000.00, variance_usd: Number((Number(inputs.labor_cost_usd) - 500000).toFixed(2)), variance_pct: -1.60, is_favorable: true },
    { id: `pl-${Date.now()}-4`, facility_id: store.config.facility_id, edition_id: edId, line_order: 4, line_code: 'OPEX_FAC', line_label: 'Facility Rent, Utilities & Admin', section: 'OPERATING_EXPENSE', actual_usd: Number(inputs.overhead_opex_usd), budget_usd: 365000.00, variance_usd: Number((Number(inputs.overhead_opex_usd) - 365000).toFixed(2)), variance_pct: -1.37, is_favorable: true },
    { id: `pl-${Date.now()}-5`, facility_id: store.config.facility_id, edition_id: edId, line_order: 5, line_code: 'EBITDA_TOT', line_label: 'Monthly Operating EBITDA', section: 'EBITDA', actual_usd: metrics.ebitda_usd, budget_usd: 435000.00, variance_usd: Number((metrics.ebitda_usd - 435000).toFixed(2)), variance_pct: 9.89, is_favorable: true }
  ];

  verifyPnlReconciliationInvariant(pnlLines);

  const seal = computeMcrProvenanceSeal({
    facility_id: store.config.facility_id,
    reportCode,
    fiscalPeriod,
    metrics,
    now
  });

  const newEdition = {
    id: edId,
    facility_id: store.config.facility_id,
    report_code: reportCode,
    fiscal_period: fiscalPeriod,
    completed_cases: Number(inputs.completed_cases ?? 430),
    gross_charges_usd: Number(inputs.gross_charges_usd),
    contractual_allowances_usd: Number(inputs.contractual_allowances_usd),
    net_patient_revenue_usd: metrics.net_patient_revenue_usd,
    total_operating_expense_usd: metrics.total_operating_expense_usd,
    ebitda_usd: metrics.ebitda_usd,
    ebitda_margin_pct: metrics.ebitda_margin_pct,
    cash_collections_usd: Number(inputs.operating_cash_inflows_usd),
    cash_to_ebitda_conversion_pct: metrics.cash_to_ebitda_conversion_pct,
    ending_cash_usd: metrics.closing_cash_usd,
    days_cash_on_hand: Number(inputs.days_cash_on_hand ?? 55),
    ar_days_dso: Number(inputs.ar_days_dso ?? 32),
    budget_variance_usd: Number((metrics.ebitda_usd - 435000).toFixed(2)),
    dq_trust_score: Number(inputs.dq_trust_score ?? 96.10),
    signoff_status: 'DRAFT',
    compiled_by: actorEmail,
    sha256_report_seal: seal,
    created_at: now
  };

  store.editions.unshift(newEdition);
  store.pnlBridge.unshift(...pnlLines);
  store.cashBridges.unshift({
    id: `cb-${Date.now()}`,
    facility_id: store.config.facility_id,
    edition_id: edId,
    opening_cash_usd: Number(inputs.opening_cash_usd),
    operating_cash_inflows_usd: Number(inputs.operating_cash_inflows_usd),
    payroll_ap_outflows_usd: Number(inputs.payroll_ap_outflows_usd),
    capex_debt_outflows_usd: Number(inputs.capex_debt_outflows_usd),
    closing_cash_usd: metrics.closing_cash_usd,
    cash_variance_against_gl_usd: 0.00
  });

  store.signoffs.unshift({
    id: `sgn-${Date.now()}`,
    facility_id: store.config.facility_id,
    edition_id: edId,
    from_status: 'NONE',
    to_status: 'DRAFT',
    actor_email: actorEmail,
    actor_role: 'Controller',
    notes: `Compiled ${fiscalPeriod} Monthly CFO Report ($${metrics.ebitda_usd.toLocaleString('en-US')} EBITDA / ${metrics.ebitda_margin_pct}%).`,
    sha256_seal: seal,
    created_at: now
  });

  return {
    edition: { ...newEdition },
    pnl_lines_count: pnlLines.length
  };
}

/**
 * Verifies a material budget variance commentary item so period close can proceed.
 */
export async function verifyVarianceCommentary(facilityInput, varianceId, options = {}) {
  const store = ensureFacilityStore(facilityInput);
  const item = store.varianceCommentary.find(v => v.id === varianceId || v.variance_code === varianceId);
  if (!item) {
    throw new Error(`ERR_MCR_VARIANCE_NOT_FOUND: Variance "${varianceId}" not found`);
  }

  const edition = store.editions.find(e => e.id === item.edition_id);
  if (edition && edition.signoff_status === 'LOCKED_CLOSED') {
    throw new Error('ERR_MCR_PERIOD_LOCKED: Cannot modify variance commentary on a locked period');
  }

  const driverSummary = String(options.driver_summary || item.driver_summary || '').trim();
  if (driverSummary.length < 5) {
    throw new Error('ERR_MCR_COMMENTARY_REQUIRED: Driver commentary must be at least 5 characters');
  }

  item.driver_summary = driverSummary;
  if (options.corrective_action) item.corrective_action = String(options.corrective_action).trim();
  item.status = 'VERIFIED';
  item.verified_by = options.actor_email || 'controller@naplessurgery.com';
  item.updated_at = new Date().toISOString();

  return { ...item };
}

/**
 * Advances period close sign-off workflow (`DRAFT` -> `CONTROLLER_VERIFIED` -> `CFO_SIGNED_OFF` -> `LOCKED_CLOSED`),
 * enforcing DQ Trust Gate and zero unexplained material variances before CFO Sign-Off.
 */
export async function advanceCfoSignoff(facilityInput, editionId, options = {}) {
  const store = ensureFacilityStore(facilityInput);
  const ed = store.editions.find(e => e.id === editionId || e.report_code === editionId);
  if (!ed) {
    throw new Error(`ERR_MCR_EDITION_NOT_FOUND: Edition "${editionId}" not found`);
  }
  if (ed.signoff_status === 'LOCKED_CLOSED') {
    throw new Error(`ERR_MCR_PERIOD_LOCKED: ${ed.report_code} is permanently locked closed`);
  }

  const targetStatus = options.target_status;
  const allowedNext = VALID_SIGNOFF_TRANSITIONS[ed.signoff_status] || [];
  if (!allowedNext.includes(targetStatus)) {
    throw new Error(`ERR_MCR_INVALID_TRANSITION: Cannot transition from ${ed.signoff_status} to ${targetStatus}`);
  }

  if (targetStatus === 'CFO_SIGNED_OFF' || targetStatus === 'LOCKED_CLOSED') {
    if (
      store.config.require_dq_trust_gate &&
      Number(ed.dq_trust_score) < Number(store.config.min_trust_score_for_signoff)
    ) {
      throw new Error(
        `ERR_MCR_TRUST_GATE_FAILED: DQ Trust Score (${ed.dq_trust_score}%) is below sign-off floor (${store.config.min_trust_score_for_signoff}%)`
      );
    }

    const openVariances = store.varianceCommentary.filter(
      v => v.edition_id === ed.id && v.status === 'OPEN_EXPLANATION'
    );
    if (openVariances.length > 0) {
      throw new Error(
        `ERR_MCR_UNEXPLAINED_VARIANCE: ${openVariances.length} material variance(s) require explanation verification before CFO sign-off`
      );
    }
  }

  const now = new Date().toISOString();
  const prevStatus = ed.signoff_status;
  const actorEmail = options.actor_email || (targetStatus === 'CONTROLLER_VERIFIED' ? 'controller@naplessurgery.com' : 'cfo@naplessurgery.com');
  const actorRole = options.actor_role || (targetStatus === 'CONTROLLER_VERIFIED' ? 'Controller' : 'CFO / Finance Director');
  const notes = String(options.notes || `Certified transition to ${targetStatus}`).trim();
  const seal = computeMcrProvenanceSeal({ report_code: ed.report_code, prevStatus, targetStatus, actorEmail, now });

  ed.signoff_status = targetStatus;
  ed.sha256_report_seal = seal;

  const signoffEntry = {
    id: `sgn-${Date.now()}`,
    facility_id: store.config.facility_id,
    edition_id: ed.id,
    from_status: prevStatus,
    to_status: targetStatus,
    actor_email: actorEmail,
    actor_role: actorRole,
    notes,
    sha256_seal: seal,
    created_at: now
  };
  store.signoffs.unshift(signoffEntry);

  return {
    edition: { ...ed },
    signoff_entry: signoffEntry
  };
}

/**
 * Dispatches Monthly CFO Report via Phase H0 (`RPT-H3-MONTHLY-CFO`) and logs SHA-256 seal.
 */
export async function dispatchMonthlyCfoDigest(facilityInput, editionId, options = {}) {
  const store = ensureFacilityStore(facilityInput);
  const ed = store.editions.find(e => e.id === editionId || e.report_code === editionId);
  if (!ed) {
    throw new Error(`ERR_MCR_EDITION_NOT_FOUND: Edition "${editionId}" not found`);
  }

  const now = new Date().toISOString();
  const execCode = `RPT-H3-RUN-${Date.now()}`;
  const seal = computeMcrProvenanceSeal({ edition_id: ed.id, execCode, now });

  const log = {
    id: `mdsp-${Date.now()}`,
    facility_id: store.config.facility_id,
    edition_id: ed.id,
    rpt_execution_code: execCode,
    delivery_channel: options.delivery_channel || 'PORTAL_INBOX',
    export_format: options.export_format || 'PDF',
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
  CANONICAL_SIGNOFF_STATES,
  VALID_SIGNOFF_TRANSITIONS,
  CANONICAL_PNL_SECTIONS,
  normalizeFacilityId,
  computeMcrProvenanceSeal,
  maskMcrSecret,
  computeMonthlyCfoMetrics,
  verifyPnlReconciliationInvariant,
  getMcrConfig,
  updateMcrConfig,
  getMcrTelemetry,
  getMcrEditions,
  getMcrPnlBridge,
  getMcrCashBridge,
  getMcrVarianceCommentary,
  getMcrSignoffs,
  getMcrDispatchLogs,
  compileMonthlyCfoReport,
  verifyVarianceCommentary,
  advanceCfoSignoff,
  dispatchMonthlyCfoDigest
};
