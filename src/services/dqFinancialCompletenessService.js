/**
 * ==============================================================================
 * Service: financialCompletenessService.js
 * Module 16: Enterprise Data Quality Governance (Phase G2)
 * Description: Five-Pillar Financial Completeness Rules, Case Margin Integrity,
 *              Cash-to-Bank Variance Thresholds, Executive Trust Gates, and
 *              SHA-256 Financial Provenance.
 * ==============================================================================
 */

import { sha256Hex } from '../utils/isomorphicSha256.js';

export const NAPLES_FACILITY_ID = '00000000-0000-0000-0000-000000000002';

export const CANONICAL_FIN_PILLARS = [
  'REVENUE_CHARGE_COMPLETENESS',
  'DIRECT_COST_COMPLETENESS',
  'LABOR_OVERHEAD_ALLOCATION',
  'CASH_REMITTANCE_RECONCILIATION',
  'GL_CLOSING_PERIOD_INTEGRITY'
];

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
 * Generates an immutable 64-char SHA-256 seal for financial completeness assessments
 */
export function computeFinancialCompletenessSeal(facilityId, periodOrRunCode, trustScore, cashVarianceUsd, trustTier) {
  const normId = normalizeFacilityId(facilityId);
  const payload = `${normId}|${periodOrRunCode}|${Number(trustScore).toFixed(2)}|${Number(cashVarianceUsd).toFixed(2)}|${trustTier}`;
  const rawHash = sha256Hex(payload);
  return `sha256_fcs_${rawHash.substring(0, 53)}`; // Exactly 64 chars (11 + 53)
}

/**
 * Masks sensitive credentials for UI and logging safety
 */
export function maskFinancialCompletenessSecret(secret) {
  if (!secret) return 'fcs_sec_****_none';
  if (secret.length <= 8) return 'fcs_sec_****_mask';
  return `fcs_sec_****_${secret.slice(-4)}`;
}

/**
 * Validates that the 5 financial completeness pillars sum strictly to 100.00%
 */
export function validateFinPillarWeights(pillars = []) {
  if (!Array.isArray(pillars) || pillars.length === 0) {
    return { isValid: false, totalWeight: 0, errors: ['ERR_FCS_PILLAR_EMPTY: Pillars list cannot be empty.'] };
  }

  const errors = [];
  let totalWeight = 0;
  const seen = new Set();

  for (const p of pillars) {
    const code = String(p.pillar_code || '').toUpperCase();
    const val = Number(p.weight_pct);
    if (!CANONICAL_FIN_PILLARS.includes(code)) {
      errors.push(`ERR_FCS_UNKNOWN_PILLAR: Invalid pillar '${code}'.`);
    }
    if (seen.has(code)) {
      errors.push(`ERR_FCS_DUPLICATE_PILLAR: Duplicate entry for '${code}'.`);
    }
    seen.add(code);

    if (isNaN(val) || val < 0 || val > 100) {
      errors.push(`ERR_FCS_INVALID_WEIGHT: Weight for '${code}' must be between 0 and 100.`);
    } else {
      totalWeight += val;
    }
  }

  for (const req of CANONICAL_FIN_PILLARS) {
    if (!seen.has(req)) {
      errors.push(`ERR_FCS_MISSING_PILLAR: Missing financial pillar '${req}'.`);
    }
  }

  totalWeight = Number(totalWeight.toFixed(2));
  if (Math.abs(totalWeight - 100.0) > 0.01) {
    errors.push(`ERR_FCS_PILLAR_SUM_INVALID: Financial pillar weights sum to ${totalWeight}%, must strictly equal 100.00%.`);
  }

  return {
    isValid: errors.length === 0,
    totalWeight,
    errors
  };
}

/**
 * Computes deterministic Financial Trust Score & Executive Trust Tier
 */
export function calculateFinancialTrustScore({
  pillarScores = {},
  pillars = DEFAULT_PILLARS,
  criticalImbalancesCount = 0,
  cashVarianceUsd = 0,
  thresholds = { trusted: 96.0, provisional: 88.0, maxCashVarianceUsd: 1.00 }
}) {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const p of pillars) {
    const weight = Number(p.weight_pct) || 0;
    const score = Math.min(100, Math.max(0, Number(pillarScores[p.pillar_code] ?? 100)));
    weightedSum += score * (weight / 100);
    totalWeight += weight;
  }

  const financialTrustScore = totalWeight > 0
    ? Number(((weightedSum / (totalWeight / 100))).toFixed(2))
    : 0;

  const absCashVar = Math.abs(Number(cashVarianceUsd) || 0);
  const maxVar = Number(thresholds.maxCashVarianceUsd ?? 1.00);

  let trustTier = 'BOARD_TRUSTED';
  if (criticalImbalancesCount > 0 || absCashVar > maxVar || financialTrustScore < thresholds.provisional) {
    trustTier = 'UNRELIABLE_HOLD';
  } else if (financialTrustScore < thresholds.trusted) {
    trustTier = 'PROVISIONAL_ESTIMATE';
  }

  return {
    financialTrustScore,
    trustTier,
    criticalImbalancesCount,
    cashVarianceUsd: Number(absCashVar.toFixed(2))
  };
}

/**
 * Evaluates Case-Level Margin Completeness (Revenue + Direct COGS + Direct Labor)
 */
export function evaluateCaseMarginCompleteness(caseFinancials = {}) {
  const rev = Number(caseFinancials.billed_revenue) || 0;
  const supplyCost = Number(caseFinancials.direct_supply_implant_cost) || 0;
  const laborCost = Number(caseFinancials.direct_labor_cost) || 0;

  const hasRevenueCharge = Boolean(caseFinancials.has_revenue_charge ?? rev > 0);
  const requiresSupplyCost = Boolean(caseFinancials.requires_supply_cost ?? true);
  const hasSupplyImplantCost = Boolean(caseFinancials.has_supply_implant_cost ?? (!requiresSupplyCost || supplyCost > 0));
  const hasLaborAllocation = Boolean(caseFinancials.has_labor_allocation ?? laborCost > 0);

  let marginReadinessStatus = 'MARGIN_VERIFIED';
  if (!hasRevenueCharge) {
    marginReadinessStatus = 'UNBILLED_REVENUE';
  } else if (!hasSupplyImplantCost) {
    marginReadinessStatus = 'MISSING_IMPLANT_COST';
  } else if (!hasLaborAllocation) {
    marginReadinessStatus = 'MISSING_LABOR_COST';
  }

  const grossMarginUsd = Number((rev - supplyCost - laborCost).toFixed(2));
  const marginPct = rev > 0 ? Number(((grossMarginUsd / rev) * 100).toFixed(1)) : 0;

  return {
    hasRevenueCharge,
    hasSupplyImplantCost,
    hasLaborAllocation,
    marginReadinessStatus,
    grossMarginUsd,
    marginPct,
    isReliableForBenchmarking: marginReadinessStatus === 'MARGIN_VERIFIED'
  };
}

// ==========================================
// MOCK REPOSITORY & DEFAULT DATA
// ==========================================

const DEFAULT_CONFIG = {
  facility_id: NAPLES_FACILITY_ID,
  trusted_min_score: 96.00,
  provisional_min_score: 88.00,
  max_cash_variance_usd: 1.00,
  block_board_export_on_hold: true,
  block_ai_recommendations_on_hold: true,
  client_secret_encrypted: 'enc_v2_44e40f35ab069713240596130459613045961304596130459613045961305521',
  sync_status: 'ACTIVE',
  health_status: 'HEALTHY',
  updated_at: new Date().toISOString()
};

const DEFAULT_PILLARS = [
  {
    id: 'fcs-pil-01',
    facility_id: NAPLES_FACILITY_ID,
    pillar_code: 'REVENUE_CHARGE_COMPLETENESS',
    pillar_label: 'Revenue & Charge Completeness',
    weight_pct: 25.00,
    sla_target_score: 98.00,
    current_score: 94.00,
    description: 'Completed clinical encounters matched to billed 837 claims and contracted fee schedules.'
  },
  {
    id: 'fcs-pil-02',
    facility_id: NAPLES_FACILITY_ID,
    pillar_code: 'DIRECT_COST_COMPLETENESS',
    pillar_label: 'Direct Supply & Implant COGS',
    weight_pct: 25.00,
    sla_target_score: 96.00,
    current_score: 86.00,
    description: 'Implant constructs and surgical supplies matched to contracted GPO or vendor invoice costs.'
  },
  {
    id: 'fcs-pil-03',
    facility_id: NAPLES_FACILITY_ID,
    pillar_code: 'LABOR_OVERHEAD_ALLOCATION',
    pillar_label: 'Labor & Overhead Allocation',
    weight_pct: 20.00,
    sla_target_score: 95.00,
    current_score: 92.00,
    description: 'Perioperative RN, Scrub Tech, and CRNA payroll costs allocated per surgical OR minute.'
  },
  {
    id: 'fcs-pil-04',
    facility_id: NAPLES_FACILITY_ID,
    pillar_code: 'CASH_REMITTANCE_RECONCILIATION',
    pillar_label: 'Cash & 835 ERA Reconciliation',
    weight_pct: 15.00,
    sla_target_score: 99.00,
    current_score: 100.00,
    description: '4-way balancing across 837 claims, 835 remittances, and EFT operating bank deposits.'
  },
  {
    id: 'fcs-pil-05',
    facility_id: NAPLES_FACILITY_ID,
    pillar_code: 'GL_CLOSING_PERIOD_INTEGRITY',
    pillar_label: 'GL Closing Period Integrity',
    weight_pct: 15.00,
    sla_target_score: 100.00,
    current_score: 100.00,
    description: 'Double-entry journal debit-to-credit zero variance and cutoff integrity.'
  }
];

const DEFAULT_PERIODS = [
  {
    id: 'fcs-per-01',
    facility_id: NAPLES_FACILITY_ID,
    period_code: '2026-02',
    revenue_score: 94.00,
    direct_cost_score: 86.00,
    labor_score: 92.00,
    cash_recon_score: 100.00,
    gl_integrity_score: 100.00,
    financial_trust_score: 93.40,
    unbilled_revenue_exposure: 4250.00,
    missing_cost_cases_count: 1,
    cash_variance_usd: 0.00,
    critical_imbalances_count: 1,
    trust_tier: 'UNRELIABLE_HOLD',
    sha256_sync_seal: 'sha256_fcs_1b389fbc0123456789abcdef0123456789abcdef0123456789abc'
  },
  {
    id: 'fcs-per-02',
    facility_id: NAPLES_FACILITY_ID,
    period_code: '2026-01',
    revenue_score: 99.20,
    direct_cost_score: 98.40,
    labor_score: 97.50,
    cash_recon_score: 100.00,
    gl_integrity_score: 100.00,
    financial_trust_score: 98.90,
    unbilled_revenue_exposure: 0.00,
    missing_cost_cases_count: 0,
    cash_variance_usd: 0.00,
    critical_imbalances_count: 0,
    trust_tier: 'BOARD_TRUSTED',
    sha256_sync_seal: 'sha256_fcs_2c490acd1234567890abcdef1234567890abcdef1234567890abc'
  }
];

const DEFAULT_CASE_MARGINS = [
  {
    id: 'fcm-01',
    facility_id: NAPLES_FACILITY_ID,
    case_identifier: 'CAS-20260224-001',
    service_date: '2026-02-22',
    primary_cpt: '29881',
    billed_revenue: 6450.00,
    direct_supply_implant_cost: 2470.00,
    direct_labor_cost: 259.49,
    has_revenue_charge: true,
    has_supply_implant_cost: true,
    has_labor_allocation: true,
    margin_readiness_status: 'MARGIN_VERIFIED'
  },
  {
    id: 'fcm-02',
    facility_id: NAPLES_FACILITY_ID,
    case_identifier: 'CAS-20260224-002',
    service_date: '2026-02-22',
    primary_cpt: '66984',
    billed_revenue: 2890.00,
    direct_supply_implant_cost: 215.00,
    direct_labor_cost: 59.13,
    has_revenue_charge: true,
    has_supply_implant_cost: true,
    has_labor_allocation: true,
    margin_readiness_status: 'MARGIN_VERIFIED'
  },
  {
    id: 'fcm-03',
    facility_id: NAPLES_FACILITY_ID,
    case_identifier: 'CAS-20260224-003',
    service_date: '2026-02-23',
    primary_cpt: '47562',
    billed_revenue: 4250.00,
    direct_supply_implant_cost: 0.00,
    direct_labor_cost: 472.15,
    has_revenue_charge: true,
    has_supply_implant_cost: false,
    has_labor_allocation: true,
    margin_readiness_status: 'MISSING_IMPLANT_COST'
  },
  {
    id: 'fcm-04',
    facility_id: NAPLES_FACILITY_ID,
    case_identifier: 'CAS-20260224-004',
    service_date: '2026-02-23',
    primary_cpt: '64721',
    billed_revenue: 3120.00,
    direct_supply_implant_cost: 145.00,
    direct_labor_cost: 0.00,
    has_revenue_charge: true,
    has_supply_implant_cost: true,
    has_labor_allocation: false,
    margin_readiness_status: 'MISSING_LABOR_COST'
  }
];

const DEFAULT_EXCEPTIONS = [
  {
    id: 'fcs-exc-01',
    facility_id: NAPLES_FACILITY_ID,
    period_code: '2026-02',
    exception_code: 'ERR_MISSING_IMPLANT_COGS',
    pillar_code: 'DIRECT_COST_COMPLETENESS',
    severity: 'CRITICAL',
    offending_identifier: 'CAS-20260224-003',
    financial_exposure_usd: 1850.00,
    description: 'Completed case CAS-20260224-003 has billed revenue ($4,250) but $0 implant/supply COGS attached; creates overstated margin.',
    remediation_status: 'OPEN',
    resolved_by: null
  },
  {
    id: 'fcs-exc-02',
    facility_id: NAPLES_FACILITY_ID,
    period_code: '2026-02',
    exception_code: 'WARN_MISSING_CRNA_LABOR',
    pillar_code: 'LABOR_OVERHEAD_ALLOCATION',
    severity: 'WARNING',
    offending_identifier: 'CAS-20260224-004',
    financial_exposure_usd: 210.00,
    description: 'Direct OR nursing & anesthesia labor cost pending timesheet sync for CAS-20260224-004.',
    remediation_status: 'OPEN',
    resolved_by: null
  }
];

const DEFAULT_AUDIT_RUNS = [
  {
    id: 'fcs-run-01',
    facility_id: NAPLES_FACILITY_ID,
    run_code: 'FCS-AUD-20260224-01',
    period_code: '2026-02',
    financial_trust_score: 93.40,
    trust_tier: 'UNRELIABLE_HOLD',
    cases_margin_verified: 2,
    total_cases_audited: 4,
    duration_ms: 310,
    sha256_sync_seal: 'sha256_fcs_3d501bde2345678901abcdef2345678901abcdef2345678901abc',
    executed_at: new Date(Date.now() - 3600000).toISOString()
  }
];

// In-memory state
let currentConfig = { ...DEFAULT_CONFIG };
let currentPillars = [...DEFAULT_PILLARS];
let currentPeriods = [...DEFAULT_PERIODS];
let currentCaseMargins = [...DEFAULT_CASE_MARGINS];
let currentExceptions = [...DEFAULT_EXCEPTIONS];
let currentAuditRuns = [...DEFAULT_AUDIT_RUNS];

export async function getFinCompletenessConfig(facilityInput) {
  const normId = normalizeFacilityId(facilityInput);
  return {
    ...currentConfig,
    facility_id: normId,
    client_secret_masked: maskFinancialCompletenessSecret(currentConfig.client_secret_encrypted)
  };
}

export async function updateFinCompletenessConfig(facilityInput, updates) {
  const normId = normalizeFacilityId(facilityInput);
  currentConfig = {
    ...currentConfig,
    ...updates,
    facility_id: normId,
    updated_at: new Date().toISOString()
  };
  return {
    ...currentConfig,
    client_secret_masked: maskFinancialCompletenessSecret(currentConfig.client_secret_encrypted)
  };
}

export async function getFinCompletenessPillars(facilityInput) {
  normalizeFacilityId(facilityInput);
  return [...currentPillars];
}

export async function getFinPeriodTrustAssessments(facilityInput) {
  normalizeFacilityId(facilityInput);
  return [...currentPeriods];
}

export async function getFinCaseMarginReadiness(facilityInput) {
  normalizeFacilityId(facilityInput);
  return [...currentCaseMargins];
}

export async function getFinCompletenessExceptions(facilityInput) {
  normalizeFacilityId(facilityInput);
  return [...currentExceptions];
}

export async function getFinAuditRuns(facilityInput) {
  normalizeFacilityId(facilityInput);
  return [...currentAuditRuns];
}

export async function getFinCompletenessTelemetry(facilityInput) {
  const normId = normalizeFacilityId(facilityInput);
  const currentPeriod = currentPeriods[0];
  const verifiedCount = currentCaseMargins.filter(c => c.margin_readiness_status === 'MARGIN_VERIFIED').length;
  const marginVerifiedPct = currentCaseMargins.length > 0
    ? Number(((verifiedCount / currentCaseMargins.length) * 100).toFixed(1))
    : 100.0;

  const openExposureUsd = currentExceptions
    .filter(e => e.remediation_status === 'OPEN')
    .reduce((acc, e) => acc + Number(e.financial_exposure_usd || 0), 0);

  return {
    facility_id: normId,
    trusted_min_score: currentConfig.trusted_min_score,
    provisional_min_score: currentConfig.provisional_min_score,
    max_cash_variance_usd: currentConfig.max_cash_variance_usd,
    sync_status: currentConfig.sync_status,
    health_status: currentConfig.health_status,
    latest_trust_score: currentPeriod.financial_trust_score,
    latest_trust_tier: currentPeriod.trust_tier,
    margin_verified_pct: marginVerifiedPct,
    latest_cash_variance_usd: currentPeriod.cash_variance_usd,
    total_exposure_on_hold_usd: Number(openExposureUsd.toFixed(2)),
    open_exceptions_count: currentExceptions.filter(e => e.remediation_status === 'OPEN').length,
    latest_sync_seal: currentAuditRuns[0]?.sha256_sync_seal || 'sha256_fcs_none'
  };
}

/**
 * Remediates or posts an accrual estimate for a financial blind-spot exception and recalculates Period Trust
 */
export async function resolveFinCompletenessException(
  exceptionId,
  action = 'REMEDIATED',
  operatorId = 'cfo_controller@naplesasc.com',
  _notes = ''
) {
  const exc = currentExceptions.find(e => e.id === exceptionId);
  if (!exc) {
    return { success: false, message: 'Exception not found' };
  }

  const normAction = String(action).toUpperCase() === 'ACCRUED_ESTIMATE' ? 'ACCRUED_ESTIMATE' : 'REMEDIATED';
  exc.remediation_status = normAction;
  exc.resolved_by = operatorId;
  exc.resolved_at = new Date().toISOString();

  // Fix corresponding case margin record
  const caseRow = currentCaseMargins.find(c => c.case_identifier === exc.offending_identifier);
  if (caseRow) {
    if (exc.exception_code === 'ERR_MISSING_IMPLANT_COGS') {
      caseRow.direct_supply_implant_cost = exc.financial_exposure_usd;
      caseRow.has_supply_implant_cost = true;
    } else if (exc.exception_code === 'WARN_MISSING_CRNA_LABOR') {
      caseRow.direct_labor_cost = exc.financial_exposure_usd;
      caseRow.has_labor_allocation = true;
    }
    if (caseRow.has_revenue_charge && caseRow.has_supply_implant_cost && caseRow.has_labor_allocation) {
      caseRow.margin_readiness_status = 'MARGIN_VERIFIED';
    }
  }

  // Recalculate pillar score & period trust score
  const pillar = currentPillars.find(p => p.pillar_code === exc.pillar_code);
  if (pillar) {
    pillar.current_score = normAction === 'ACCRUED_ESTIMATE' ? 96.00 : 98.50;
  }

  const period = currentPeriods.find(p => p.period_code === exc.period_code);
  if (period) {
    const remainingOpen = currentExceptions.filter(e => e.period_code === period.period_code && e.remediation_status === 'OPEN');
    period.critical_imbalances_count = remainingOpen.filter(e => e.severity === 'CRITICAL').length;
    period.missing_cost_cases_count = currentCaseMargins.filter(c => c.margin_readiness_status !== 'MARGIN_VERIFIED').length;

    if (exc.pillar_code === 'DIRECT_COST_COMPLETENESS') period.direct_cost_score = pillar.current_score;
    if (exc.pillar_code === 'LABOR_OVERHEAD_ALLOCATION') period.labor_score = pillar.current_score;
    if (exc.pillar_code === 'REVENUE_CHARGE_COMPLETENESS') period.revenue_score = pillar.current_score;

    const scoreMap = {
      REVENUE_CHARGE_COMPLETENESS: period.revenue_score,
      DIRECT_COST_COMPLETENESS: period.direct_cost_score,
      LABOR_OVERHEAD_ALLOCATION: period.labor_score,
      CASH_REMITTANCE_RECONCILIATION: period.cash_recon_score,
      GL_CLOSING_PERIOD_INTEGRITY: period.gl_integrity_score
    };

    const recalc = calculateFinancialTrustScore({
      pillarScores: scoreMap,
      pillars: currentPillars,
      criticalImbalancesCount: period.critical_imbalances_count,
      cashVarianceUsd: period.cash_variance_usd,
      thresholds: {
        trusted: currentConfig.trusted_min_score,
        provisional: currentConfig.provisional_min_score,
        maxCashVarianceUsd: currentConfig.max_cash_variance_usd
      }
    });

    period.financial_trust_score = recalc.financialTrustScore;
    period.trust_tier = recalc.trustTier;
    period.sha256_sync_seal = computeFinancialCompletenessSeal(
      period.facility_id,
      period.period_code,
      period.financial_trust_score,
      period.cash_variance_usd,
      period.trust_tier
    );
  }

  return { success: true, exception: exc, updatedPeriod: period };
}

/**
 * Triggers a batch Financial Completeness Trust Audit with SHA-256 provenance seal
 */
export async function triggerFinancialTrustAudit(facilityInput, operatorId = 'cfo_controller@naplesasc.com') {
  const normId = normalizeFacilityId(facilityInput);
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const runCode = `FCS-AUD-${dateStr}-${String(currentAuditRuns.length + 1).padStart(2, '0')}`;

  const activePeriod = currentPeriods[0];
  const verifiedCount = currentCaseMargins.filter(c => c.margin_readiness_status === 'MARGIN_VERIFIED').length;
  const seal = computeFinancialCompletenessSeal(
    normId,
    runCode,
    activePeriod.financial_trust_score,
    activePeriod.cash_variance_usd,
    activePeriod.trust_tier
  );

  const newRun = {
    id: `fcs-run-${Date.now()}`,
    facility_id: normId,
    run_code: runCode,
    period_code: activePeriod.period_code,
    financial_trust_score: activePeriod.financial_trust_score,
    trust_tier: activePeriod.trust_tier,
    cases_margin_verified: verifiedCount,
    total_cases_audited: currentCaseMargins.length,
    duration_ms: 280,
    sha256_sync_seal: seal,
    operator_id: operatorId,
    executed_at: now.toISOString()
  };

  currentAuditRuns.unshift(newRun);
  return newRun;
}

export default {
  NAPLES_FACILITY_ID,
  CANONICAL_FIN_PILLARS,
  normalizeFacilityId,
  computeFinancialCompletenessSeal,
  maskFinancialCompletenessSecret,
  validateFinPillarWeights,
  calculateFinancialTrustScore,
  evaluateCaseMarginCompleteness,
  getFinCompletenessConfig,
  updateFinCompletenessConfig,
  getFinCompletenessTelemetry,
  getFinCompletenessPillars,
  getFinPeriodTrustAssessments,
  getFinCaseMarginReadiness,
  getFinCompletenessExceptions,
  getFinAuditRuns,
  resolveFinCompletenessException,
  triggerFinancialTrustAudit
};
