/**
 * ==============================================================================
 * Test Suite: data-quality-framework.test.js
 * Module 16: Enterprise Data Quality Governance (Phase G0)
 * Tests: Telemetry & Gate Classification, Facility UUID Normalization,
 *        Secret Masking, 6-Dimension Weight Invariant, Composite DQI Formula,
 *        Declarative Rule Evaluator, Domain Scorecards, Rule Toggle & Waiver Flow,
 *        Manual Audit Scan SHA-256 Sealing, Facade Parity, Migration 132 UP/DOWN
 *        SQL Integrity, Zero Prohibited Tokens, and App Shell Integration.
 * ==============================================================================
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import service, {
  NAPLES_FACILITY_ID,
  CANONICAL_DIMENSIONS,
  normalizeFacilityId,
  computeDataQualitySeal,
  maskDataQualitySecret,
  validateDimensionWeights,
  calculateCompositeDqiScore,
  evaluateDataQualityRule,
  getDqFrameworkConfig,
  getDqTelemetry,
  getDqDimensionWeights,
  getDqRuleDefinitions,
  getDqAssessmentRuns,
  getDqDomainScores,
  getDqExceptions,
  triggerDataQualityScan,
  toggleDqRuleStatus,
  resolveDqException
} from '../src/services/dataQualityFrameworkService.js';

import * as facade from '../src/lib/dataQualityFrameworkService.js';

describe('Phase G0: Data Quality Framework & Governance', () => {

  // Test 1: Telemetry
  test('1. Telemetry returns accurate DQI metrics for Naples Surgery Center', async () => {
    const telemetry = await getDqTelemetry(NAPLES_FACILITY_ID);
    assert.ok(telemetry, 'Telemetry should exist');
    assert.equal(telemetry.facility_id, NAPLES_FACILITY_ID);
    assert.equal(telemetry.sync_status, 'ACTIVE');
    assert.equal(telemetry.health_status, 'HEALTHY');
    assert.ok(telemetry.latest_dqi_score >= 90, `Expected DQI >= 90, got ${telemetry.latest_dqi_score}`);
    assert.equal(telemetry.latest_gate_status, 'CAUTION_REVIEW');
    assert.equal(telemetry.active_rules_count, 8);
    assert.equal(telemetry.total_domains_count, 6);
    assert.ok(telemetry.latest_sync_seal.startsWith('sha256_dq_'), 'Seal must use sha256_dq_ prefix');
  });

  // Test 2: Facility ID Normalization
  test('2. Facility UUID alias resolution matches Naples Surgery Center correctly across strings and objects', () => {
    assert.equal(normalizeFacilityId('fac-naples-01'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId('naples-surgery-center'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ id: 'fac-naples-01' }), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ facility_id: NAPLES_FACILITY_ID }), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId(null), NAPLES_FACILITY_ID);
  });

  // Test 3: Governance Configuration & Secret Masking
  test('3. Governance configuration retrieval and masked secret verification', async () => {
    const config = await getDqFrameworkConfig(NAPLES_FACILITY_ID);
    assert.ok(config, 'Config should exist');
    assert.equal(config.certified_threshold_pct, 95.00);
    assert.equal(config.warning_threshold_pct, 85.00);
    assert.equal(config.block_ai_on_quarantine, true);
    assert.ok(config.client_secret_masked.startsWith('dq_sec_****_'), 'Secret must be masked');
    assert.ok(!config.client_secret_masked.includes('enc_v2'), 'Raw secret must not leak');
  });

  // Test 4: 6-Dimension Weight Conservation Validator
  test('4. 6-Dimension weights validation enforces strict 100.00% sum across all canonical dimensions', async () => {
    const weights = await getDqDimensionWeights(NAPLES_FACILITY_ID);
    const validCheck = validateDimensionWeights(weights);
    assert.equal(validCheck.isValid, true);
    assert.equal(validCheck.totalWeight, 100.00);
    assert.equal(CANONICAL_DIMENSIONS.length, 6);

    const invalidWeights = weights.map((w, idx) => idx === 0 ? { ...w, weight_pct: 40 } : w);
    const invalidCheck = validateDimensionWeights(invalidWeights);
    assert.equal(invalidCheck.isValid, false);
    assert.ok(invalidCheck.errors.some(e => e.includes('ERR_DQ_WEIGHT_SUM_INVALID')));
  });

  // Test 5: Deterministic Composite DQI Score & Gate Classification
  test('5. Deterministic composite DQI score calculation and gate classification', async () => {
    const weights = await getDqDimensionWeights(NAPLES_FACILITY_ID);

    // 100 across all dimensions + 0 critical -> CERTIFIED
    const perfect = calculateCompositeDqiScore(
      { COMPLETENESS: 100, ACCURACY: 100, CONSISTENCY: 100, TIMELINESS: 100, UNIQUENESS: 100, VALIDITY: 100 },
      weights,
      0
    );
    assert.equal(perfect.overallDqiScore, 100);
    assert.equal(perfect.gateStatus, 'CERTIFIED');

    // Score >= 95 but critical exception open -> CAUTION_REVIEW
    const blockedByCritical = calculateCompositeDqiScore(
      { COMPLETENESS: 98, ACCURACY: 98, CONSISTENCY: 98, TIMELINESS: 98, UNIQUENESS: 98, VALIDITY: 98 },
      weights,
      1
    );
    assert.equal(blockedByCritical.overallDqiScore, 98);
    assert.equal(blockedByCritical.gateStatus, 'CAUTION_REVIEW');

    // Score < 85 -> QUARANTINED_HOLD
    const lowScore = calculateCompositeDqiScore(
      { COMPLETENESS: 80, ACCURACY: 80, CONSISTENCY: 80, TIMELINESS: 80, UNIQUENESS: 80, VALIDITY: 80 },
      weights,
      0
    );
    assert.equal(lowScore.overallDqiScore, 80);
    assert.equal(lowScore.gateStatus, 'QUARANTINED_HOLD');
  });

  // Test 6: Declarative Rule Evaluator
  test('6. Deterministic rule evaluator validates NOT_NULL, CHRONOLOGY_LTE, EQUAL_BALANCE, and RANGE_PCT', () => {
    const notNullRule = { rule_code: 'R1', dimension_code: 'COMPLETENESS', severity: 'CRITICAL', operator_type: 'NOT_NULL', required_fields: ['surgeon_id', 'primary_cpt'] };
    assert.equal(evaluateDataQualityRule(notNullRule, { surgeon_id: 'SRG-1', primary_cpt: '29881' }).passed, true);
    assert.equal(evaluateDataQualityRule(notNullRule, { surgeon_id: 'SRG-1', primary_cpt: '' }).passed, false);

    const chronoRule = { rule_code: 'R2', dimension_code: 'VALIDITY', severity: 'CRITICAL', operator_type: 'CHRONOLOGY_LTE', chronology_fields: ['room_in', 'room_out'] };
    assert.equal(evaluateDataQualityRule(chronoRule, { room_in: '2026-02-24T08:00:00Z', room_out: '2026-02-24T09:15:00Z' }).passed, true);
    assert.equal(evaluateDataQualityRule(chronoRule, { room_in: '2026-02-24T10:00:00Z', room_out: '2026-02-24T09:15:00Z' }).passed, false);

    const balRule = { rule_code: 'R3', dimension_code: 'ACCURACY', severity: 'CRITICAL', operator_type: 'EQUAL_BALANCE', left_field: 'total_debit', right_field: 'total_credit' };
    assert.equal(evaluateDataQualityRule(balRule, { total_debit: 5000.00, total_credit: 5000.00 }).passed, true);
    assert.equal(evaluateDataQualityRule(balRule, { total_debit: 5000.00, total_credit: 4950.00 }).passed, false);

    const rangeRule = { rule_code: 'R4', dimension_code: 'CONSISTENCY', severity: 'CRITICAL', operator_type: 'RANGE_PCT', actual_field: 'invoiced', expected_field: 'contract', max_pct: 2.0 };
    assert.equal(evaluateDataQualityRule(rangeRule, { invoiced: 101.00, contract: 100.00 }).passed, true);
    assert.equal(evaluateDataQualityRule(rangeRule, { invoiced: 120.50, contract: 84.50 }).passed, false);
  });

  // Test 7: Domain Scorecards Coverage
  test('7. Domain scorecards cover upstream operational domains (EHR, Claims, GL, Payroll, Inventory, Vendor Invoices)', async () => {
    const domains = await getDqDomainScores(NAPLES_FACILITY_ID);
    assert.equal(domains.length, 6);
    const codes = domains.map(d => d.domain_code);
    for (const expected of ['EHR_CASES', 'CLAIMS_837', 'GL_ACCOUNTING', 'PAYROLL_LABOR', 'INVENTORY_SUPPLY', 'VENDOR_INVOICE']) {
      assert.ok(codes.includes(expected), `Domain ${expected} must be scored`);
    }
  });

  // Test 8: Rule Status Toggle & Exception Waiver Enforcement
  test('8. Rule toggle and exception remediation / waiver enforcement require justification', async () => {
    const toggleRes = await toggleDqRuleStatus('DQ-PAY-001', false);
    assert.equal(toggleRes.success, true);
    assert.equal(toggleRes.rule.is_active, false);
    await toggleDqRuleStatus('DQ-PAY-001', true);

    const exceptions = await getDqExceptions(NAPLES_FACILITY_ID);
    const openExc = exceptions.find(e => e.remediation_status === 'OPEN');
    assert.ok(openExc, 'Should have at least one open exception');

    // Reject empty waiver reason
    await assert.rejects(
      () => resolveDqException(openExc.id, 'WAIVED', ''),
      /ERR_WAIVER_REASON_REQUIRED/
    );

    // Remediate cleanly
    const remRes = await resolveDqException(openExc.id, 'REMEDIATED', 'Vendor credit memo applied');
    assert.equal(remRes.success, true);
    assert.equal(remRes.exception.remediation_status, 'REMEDIATED');
  });

  // Test 9: Manual Audit Scan Creates Run Record with 64-char SHA-256 Seal
  test('9. Triggering manual Data Quality Scan produces run record with 64-char SHA-256 seal', async () => {
    const scanRun = await triggerDataQualityScan(NAPLES_FACILITY_ID, 'qa_verifier@naplesasc.com');
    assert.ok(scanRun, 'Scan run should be returned');
    assert.ok(scanRun.run_code.startsWith('DQ-SCAN-'), 'Run code format check');
    assert.ok(scanRun.overall_dqi_score > 0 && scanRun.overall_dqi_score <= 100);
    assert.ok(scanRun.sha256_sync_seal.startsWith('sha256_dq_'), 'Seal must have sha256_dq_ prefix');
    assert.equal(scanRun.sha256_sync_seal.length, 64, 'Seal must be strictly 64 characters');
  });

  // Test 10: Dual Facade Re-Export Parity
  test('10. Dual facade re-export parity between src/services/ and src/lib/', () => {
    const expectedExports = [
      'NAPLES_FACILITY_ID',
      'CANONICAL_DIMENSIONS',
      'normalizeFacilityId',
      'computeDataQualitySeal',
      'maskDataQualitySecret',
      'validateDimensionWeights',
      'calculateCompositeDqiScore',
      'evaluateDataQualityRule',
      'getDqFrameworkConfig',
      'getDqTelemetry',
      'getDqDimensionWeights',
      'getDqRuleDefinitions',
      'getDqAssessmentRuns',
      'getDqDomainScores',
      'getDqExceptions',
      'triggerDataQualityScan',
      'toggleDqRuleStatus',
      'resolveDqException'
    ];

    for (const key of expectedExports) {
      assert.ok(facade[key], `Facade must re-export ${key}`);
      assert.equal(typeof facade[key], typeof service[key], `Type parity for ${key}`);
    }
  });

  // Test 11: Migration 132 UP/DOWN SQL Integrity & RLS
  test('11. Migration 132 UP/DOWN SQL structural integrity and RLS policies', () => {
    const upPath = path.resolve('supabase/migrations/132_data_quality_framework.sql');
    const downPath = path.resolve('supabase/migrations/132_data_quality_framework_down.sql');

    assert.ok(fs.existsSync(upPath), '132_data_quality_framework.sql must exist');
    assert.ok(fs.existsSync(downPath), '132_data_quality_framework_down.sql must exist');

    const upSql = fs.readFileSync(upPath, 'utf8');
    const downSql = fs.readFileSync(downPath, 'utf8');

    const expectedTables = [
      'dq_framework_configs',
      'dq_dimension_weights',
      'dq_rule_definitions',
      'dq_assessment_runs',
      'dq_domain_scores',
      'dq_exception_logs',
      'dq_provenance_ledger'
    ];

    for (const tbl of expectedTables) {
      assert.ok(upSql.includes(`CREATE TABLE IF NOT EXISTS public.${tbl}`), `Missing table ${tbl}`);
      assert.ok(upSql.includes(`ALTER TABLE public.${tbl} ENABLE ROW LEVEL SECURITY`), `Missing RLS on ${tbl}`);
      assert.ok(downSql.includes(`DROP TABLE IF EXISTS public.${tbl}`), `Missing DROP TABLE ${tbl} in down script`);
    }

    assert.ok(upSql.includes('CREATE OR REPLACE VIEW public.vw_data_quality_telemetry'), 'Missing telemetry view');
    assert.ok(upSql.includes('app.current_facility_id'), 'Missing facility tenant isolation');
    assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_data_quality_telemetry'), 'Missing DROP VIEW in down script');
  });

  // Test 12: Strict Zero Prohibited Tokens & App Shell Integration
  test('12. Strict zero-prohibited token compliance and App.jsx shell integration', () => {
    const prohibitedTokens = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];
    const filesToCheck = [
      path.resolve('src/components/DataQualityFrameworkView.jsx'),
      path.resolve('src/components/DataQualityFrameworkView.css'),
      path.resolve('src/services/dataQualityFrameworkService.js'),
      path.resolve('src/lib/dataQualityFrameworkService.js')
    ];

    for (const filePath of filesToCheck) {
      assert.ok(fs.existsSync(filePath), `File must exist: ${filePath}`);
      const content = fs.readFileSync(filePath, 'utf8').toLowerCase();
      for (const token of prohibitedTokens) {
        assert.ok(!content.includes(token), `Prohibited token '${token}' found in ${path.basename(filePath)}`);
      }
    }

    const appContent = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8');
    assert.ok(appContent.includes("import DataQualityFrameworkView from './components/DataQualityFrameworkView'"), 'App.jsx must import DataQualityFrameworkView');
    assert.ok(appContent.includes("activeTab === 'data_quality_framework'"), 'App.jsx must route data_quality_framework tab');
    assert.ok(appContent.includes('<DataQualityFrameworkView activeFacility={activeFacility} />'), 'App.jsx must render DataQualityFrameworkView');
    assert.ok(appContent.includes('Data Quality Framework & Governance'), 'App.jsx must define header title');
  });

});
