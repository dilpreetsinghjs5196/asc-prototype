/**
 * ==============================================================================
 * Test Suite: financial-completeness.test.js
 * Module 16: Enterprise Data Quality Governance (Phase G2)
 * Tests: Telemetry & Trust Gate Status, Facility UUID Normalization,
 *        Secret Masking, 5-Pillar Weight Conservation, Deterministic Financial
 *        Trust Score & Cash Variance Override, Case Margin Completeness Evaluator,
 *        Exception Remediation & Accrual Promotion, Audit Run SHA-256 Seal,
 *        Dual Facade Parity, Migration 134 UP/DOWN Integrity, Zero Prohibited
 *        Tokens, and App.jsx Shell Integration.
 * ==============================================================================
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import service, {
  NAPLES_FACILITY_ID,
  CANONICAL_FIN_PILLARS,
  normalizeFacilityId,
  computeFinancialCompletenessSeal,
  maskFinancialCompletenessSecret,
  validateFinPillarWeights,
  calculateFinancialTrustScore,
  evaluateCaseMarginCompleteness,
  getFinCompletenessConfig,
  getFinCompletenessTelemetry,
  getFinCompletenessPillars,
  getFinPeriodTrustAssessments,
  getFinCaseMarginReadiness,
  getFinCompletenessExceptions,
  getFinAuditRuns,
  resolveFinCompletenessException,
  triggerFinancialTrustAudit
} from '../src/services/dqFinancialCompletenessService.js';

import * as facade from '../src/lib/dqFinancialCompletenessService.js';

describe('Phase G2: Financial Completeness & Trust Thresholds', () => {

  // Test 1: Telemetry
  test('1. Telemetry returns accurate financial trust metrics for Naples Surgery Center', async () => {
    const telemetry = await getFinCompletenessTelemetry(NAPLES_FACILITY_ID);
    assert.ok(telemetry, 'Telemetry should exist');
    assert.equal(telemetry.facility_id, NAPLES_FACILITY_ID);
    assert.equal(telemetry.sync_status, 'ACTIVE');
    assert.ok(telemetry.latest_trust_score > 85, `Expected trust score > 85, got ${telemetry.latest_trust_score}`);
    assert.equal(telemetry.latest_trust_tier, 'UNRELIABLE_HOLD');
    assert.ok(telemetry.total_exposure_on_hold_usd >= 2000, 'Should track open exposure on hold');
    assert.ok(telemetry.latest_sync_seal.startsWith('sha256_fcs_'), 'Seal must use sha256_fcs_ prefix');
  });

  // Test 2: Facility ID Normalization
  test('2. Facility UUID alias resolution matches Naples Surgery Center across strings and objects', () => {
    assert.equal(normalizeFacilityId('fac-naples-01'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId('naples-surgery-center'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ id: 'fac-naples-01' }), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ facility_id: NAPLES_FACILITY_ID }), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId(null), NAPLES_FACILITY_ID);
  });

  // Test 3: Config & Masked Secret
  test('3. Configuration retrieval and masked secret verification', async () => {
    const config = await getFinCompletenessConfig(NAPLES_FACILITY_ID);
    assert.equal(config.trusted_min_score, 96.00);
    assert.equal(config.provisional_min_score, 88.00);
    assert.equal(config.max_cash_variance_usd, 1.00);
    assert.equal(config.block_board_export_on_hold, true);
    assert.ok(config.client_secret_masked.startsWith('fcs_sec_****_'), 'Secret must be masked');
    assert.ok(!config.client_secret_masked.includes('enc_v2'), 'Raw secret must not leak');
  });

  // Test 4: 5-Pillar Weight Conservation
  test('4. 5-pillar financial weight conservation validator enforces strict 100.00% sum', async () => {
    const pillars = await getFinCompletenessPillars(NAPLES_FACILITY_ID);
    const valid = validateFinPillarWeights(pillars);
    assert.equal(valid.isValid, true);
    assert.equal(valid.totalWeight, 100.00);
    assert.equal(CANONICAL_FIN_PILLARS.length, 5);

    const broken = pillars.map((p, i) => i === 0 ? { ...p, weight_pct: 50 } : p);
    const invalid = validateFinPillarWeights(broken);
    assert.equal(invalid.isValid, false);
    assert.ok(invalid.errors.some(e => e.includes('ERR_FCS_PILLAR_SUM_INVALID')));
  });

  // Test 5: Deterministic Financial Trust Score & Cash Variance Override
  test('5. Deterministic calculateFinancialTrustScore enforces BOARD_TRUSTED, PROVISIONAL_ESTIMATE, and UNRELIABLE_HOLD', async () => {
    const pillars = await getFinCompletenessPillars(NAPLES_FACILITY_ID);

    // 98 across all pillars + $0 cash variance + 0 critical imbalances -> BOARD_TRUSTED
    const trusted = calculateFinancialTrustScore({
      pillarScores: {
        REVENUE_CHARGE_COMPLETENESS: 98,
        DIRECT_COST_COMPLETENESS: 98,
        LABOR_OVERHEAD_ALLOCATION: 98,
        CASH_REMITTANCE_RECONCILIATION: 98,
        GL_CLOSING_PERIOD_INTEGRITY: 98
      },
      pillars,
      criticalImbalancesCount: 0,
      cashVarianceUsd: 0.00
    });
    assert.equal(trusted.financialTrustScore, 98.00);
    assert.equal(trusted.trustTier, 'BOARD_TRUSTED');

    // Score 92 + 0 critical + $0.50 cash variance -> PROVISIONAL_ESTIMATE
    const provisional = calculateFinancialTrustScore({
      pillarScores: {
        REVENUE_CHARGE_COMPLETENESS: 92,
        DIRECT_COST_COMPLETENESS: 92,
        LABOR_OVERHEAD_ALLOCATION: 92,
        CASH_REMITTANCE_RECONCILIATION: 92,
        GL_CLOSING_PERIOD_INTEGRITY: 92
      },
      pillars,
      criticalImbalancesCount: 0,
      cashVarianceUsd: 0.50
    });
    assert.equal(provisional.trustTier, 'PROVISIONAL_ESTIMATE');

    // High score 99 BUT $25.00 cash variance > $1.00 tolerance -> UNRELIABLE_HOLD
    const heldByCash = calculateFinancialTrustScore({
      pillarScores: {
        REVENUE_CHARGE_COMPLETENESS: 99,
        DIRECT_COST_COMPLETENESS: 99,
        LABOR_OVERHEAD_ALLOCATION: 99,
        CASH_REMITTANCE_RECONCILIATION: 99,
        GL_CLOSING_PERIOD_INTEGRITY: 99
      },
      pillars,
      criticalImbalancesCount: 0,
      cashVarianceUsd: 25.00
    });
    assert.equal(heldByCash.trustTier, 'UNRELIABLE_HOLD');
  });

  // Test 6: Case Margin Completeness Evaluator
  test('6. Deterministic evaluateCaseMarginCompleteness flags verified vs missing cost/revenue states', () => {
    const verified = evaluateCaseMarginCompleteness({
      billed_revenue: 6450,
      direct_supply_implant_cost: 2470,
      direct_labor_cost: 259.49
    });
    assert.equal(verified.marginReadinessStatus, 'MARGIN_VERIFIED');
    assert.equal(verified.isReliableForBenchmarking, true);
    assert.equal(verified.grossMarginUsd, 3720.51);

    const missingCogs = evaluateCaseMarginCompleteness({
      billed_revenue: 4250,
      direct_supply_implant_cost: 0,
      direct_labor_cost: 472.15,
      requires_supply_cost: true
    });
    assert.equal(missingCogs.marginReadinessStatus, 'MISSING_IMPLANT_COST');
    assert.equal(missingCogs.isReliableForBenchmarking, false);

    const unbilled = evaluateCaseMarginCompleteness({
      billed_revenue: 0,
      direct_supply_implant_cost: 200,
      direct_labor_cost: 150
    });
    assert.equal(unbilled.marginReadinessStatus, 'UNBILLED_REVENUE');
  });

  // Test 7: Case Margin Readiness Catalog
  test('7. Case margin readiness catalog returns verified and blind-spot surgical encounters', async () => {
    const margins = await getFinCaseMarginReadiness(NAPLES_FACILITY_ID);
    assert.equal(margins.length, 4);
    assert.ok(margins.some(m => m.margin_readiness_status === 'MARGIN_VERIFIED'));
    assert.ok(margins.some(m => m.margin_readiness_status === 'MISSING_IMPLANT_COST'));
    assert.ok(margins.some(m => m.margin_readiness_status === 'MISSING_LABOR_COST'));
  });

  // Test 8: Resolving & Posting Accrual Estimates Promotes Period Trust Tier
  test('8. Remediating and accruing open financial exceptions clears critical holds and promotes period trust tier', async () => {
    const excs = await getFinCompletenessExceptions(NAPLES_FACILITY_ID);
    assert.equal(excs.filter(e => e.remediation_status === 'OPEN').length, 2);

    const r1 = await resolveFinCompletenessException('fcs-exc-01', 'REMEDIATED', 'cfo@naplesasc.com');
    assert.equal(r1.success, true);
    const r2 = await resolveFinCompletenessException('fcs-exc-02', 'ACCRUED_ESTIMATE', 'cfo@naplesasc.com');
    assert.equal(r2.success, true);

    assert.equal(r2.updatedPeriod.critical_imbalances_count, 0);
    assert.ok(r2.updatedPeriod.financial_trust_score >= 96.00);
    assert.equal(r2.updatedPeriod.trust_tier, 'BOARD_TRUSTED');
  });

  // Test 9: Batch Trust Audit Creates 64-Char SHA-256 Seal
  test('9. Triggering financial trust audit generates run record with exact 64-char SHA-256 seal', async () => {
    const run = await triggerFinancialTrustAudit(NAPLES_FACILITY_ID, 'qa@naplesasc.com');
    assert.ok(run, 'Audit run must exist');
    assert.ok(run.run_code.startsWith('FCS-AUD-'));
    assert.ok(run.sha256_sync_seal.startsWith('sha256_fcs_'));
    assert.equal(run.sha256_sync_seal.length, 64, 'Seal must be strictly 64 characters');
  });

  // Test 10: Dual Facade Parity
  test('10. Dual facade re-export parity between src/services/ and src/lib/', () => {
    const expected = [
      'NAPLES_FACILITY_ID',
      'CANONICAL_FIN_PILLARS',
      'normalizeFacilityId',
      'computeFinancialCompletenessSeal',
      'maskFinancialCompletenessSecret',
      'validateFinPillarWeights',
      'calculateFinancialTrustScore',
      'evaluateCaseMarginCompleteness',
      'getFinCompletenessConfig',
      'getFinCompletenessTelemetry',
      'getFinCompletenessPillars',
      'getFinPeriodTrustAssessments',
      'getFinCaseMarginReadiness',
      'getFinCompletenessExceptions',
      'getFinAuditRuns',
      'resolveFinCompletenessException',
      'triggerFinancialTrustAudit'
    ];

    for (const key of expected) {
      assert.ok(facade[key], `Facade must re-export ${key}`);
      assert.equal(typeof facade[key], typeof service[key], `Type parity for ${key}`);
    }
  });

  // Test 11: Migration 134 UP/DOWN Integrity & RLS
  test('11. Migration 134 UP/DOWN SQL structural integrity and RLS policies', () => {
    const upPath = path.resolve('supabase/migrations/134_financial_completeness.sql');
    const downPath = path.resolve('supabase/migrations/134_financial_completeness_down.sql');

    assert.ok(fs.existsSync(upPath));
    assert.ok(fs.existsSync(downPath));

    const upSql = fs.readFileSync(upPath, 'utf8');
    const downSql = fs.readFileSync(downPath, 'utf8');

    const tables = [
      'fin_completeness_configs',
      'fin_completeness_pillars',
      'fin_period_trust_assessments',
      'fin_case_margin_readiness',
      'fin_completeness_exceptions',
      'fin_trust_gate_audit_runs',
      'fin_completeness_provenance_ledger'
    ];

    for (const tbl of tables) {
      assert.ok(upSql.includes(`CREATE TABLE IF NOT EXISTS public.${tbl}`), `Missing ${tbl}`);
      assert.ok(upSql.includes(`ALTER TABLE public.${tbl} ENABLE ROW LEVEL SECURITY`), `Missing RLS on ${tbl}`);
      assert.ok(downSql.includes(`DROP TABLE IF EXISTS public.${tbl}`), `Missing DROP ${tbl} in down`);
    }

    assert.ok(upSql.includes('CREATE OR REPLACE VIEW public.vw_financial_completeness_telemetry'));
    assert.ok(upSql.includes('app.current_facility_id'));
    assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_financial_completeness_telemetry'));
  });

  // Test 12: Zero Prohibited Tokens & App.jsx Integration
  test('12. Strict zero-prohibited token compliance and App.jsx shell integration', () => {
    const prohibitedTokens = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];
    const files = [
      path.resolve('src/components/DqFinancialCompletenessView.jsx'),
      path.resolve('src/components/DqFinancialCompletenessView.css'),
      path.resolve('src/services/dqFinancialCompletenessService.js'),
      path.resolve('src/lib/dqFinancialCompletenessService.js')
    ];

    for (const f of files) {
      assert.ok(fs.existsSync(f), `Missing file: ${f}`);
      const content = fs.readFileSync(f, 'utf8').toLowerCase();
      for (const token of prohibitedTokens) {
        assert.ok(!content.includes(token), `Prohibited token '${token}' found in ${path.basename(f)}`);
      }
    }

    const appContent = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8');
    assert.ok(appContent.includes("import DqFinancialCompletenessView from './components/DqFinancialCompletenessView'"));
    assert.ok(appContent.includes("activeTab === 'dq_financial_completeness'"));
    assert.ok(appContent.includes('<DqFinancialCompletenessView activeFacility={activeFacility} />'));
    assert.ok(appContent.includes('Financial Completeness & Trust Thresholds'));
  });

});
