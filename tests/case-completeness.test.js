/**
 * ==============================================================================
 * Test Suite: case-completeness.test.js
 * Module 16: Enterprise Data Quality Governance (Phase G1)
 * Tests: Telemetry & Readiness Rates, Facility UUID Normalization,
 *        Masked Secret Verification, 5-Pillar Weight Sum Invariant,
 *        Deterministic evaluateCaseCompleteness (Ready / Hold / Chronology),
 *        Field Gap Remediation & Score Promotion, Audit Scan SHA-256 Seal,
 *        Facade Parity, Migration 133 UP/DOWN Integrity, Zero Prohibited Tokens,
 *        and App.jsx Shell Integration.
 * ==============================================================================
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import service, {
  NAPLES_FACILITY_ID,
  CANONICAL_PILLARS,
  normalizeFacilityId,
  computeCaseCompletenessSeal,
  maskCaseCompletenessSecret,
  validateCompletenessRubricWeights,
  evaluateCaseCompleteness,
  getCaseCompletenessConfig,
  getCaseCompletenessTelemetry,
  getCaseCompletenessRubrics,
  getCaseCompletenessScores,
  getCaseCompletenessFieldGaps,
  getCaseSpecialtyBenchmarks,
  getCaseAuditRuns,
  resolveCaseFieldGap,
  triggerCaseCompletenessAudit
} from '../src/services/caseCompletenessService.js';

import * as facade from '../src/lib/caseCompletenessService.js';

describe('Phase G1: Case Completeness Score & Clinical Readiness', () => {

  // Test 1: Telemetry
  test('1. Telemetry returns accurate completeness metrics for Naples Surgery Center', async () => {
    const telemetry = await getCaseCompletenessTelemetry(NAPLES_FACILITY_ID);
    assert.ok(telemetry, 'Telemetry should exist');
    assert.equal(telemetry.facility_id, NAPLES_FACILITY_ID);
    assert.equal(telemetry.sync_status, 'ACTIVE');
    assert.ok(telemetry.avg_case_completeness_score > 80, 'Avg score should be positive');
    assert.equal(telemetry.total_cases_scored, 4);
    assert.ok(telemetry.latest_sync_seal.startsWith('sha256_ccs_'), 'Seal must use sha256_ccs_ prefix');
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
    const config = await getCaseCompletenessConfig(NAPLES_FACILITY_ID);
    assert.equal(config.billing_ready_min_score, 95.00);
    assert.equal(config.review_min_score, 80.00);
    assert.equal(config.enforce_coding_lock, true);
    assert.equal(config.enforce_implant_udi, true);
    assert.ok(config.client_secret_masked.startsWith('ccs_sec_****_'), 'Secret must be masked');
    assert.ok(!config.client_secret_masked.includes('enc_v2'), 'Raw secret must not leak');
  });

  // Test 4: 5-Pillar Weight Conservation
  test('4. 5-pillar rubric weight conservation validator enforces strict 100.00% sum', async () => {
    const rubrics = await getCaseCompletenessRubrics(NAPLES_FACILITY_ID);
    const valid = validateCompletenessRubricWeights(rubrics);
    assert.equal(valid.isValid, true);
    assert.equal(valid.totalWeight, 100.00);
    assert.equal(CANONICAL_PILLARS.length, 5);

    const broken = rubrics.map((r, i) => i === 0 ? { ...r, weight_pct: 50 } : r);
    const invalid = validateCompletenessRubricWeights(broken);
    assert.equal(invalid.isValid, false);
    assert.ok(invalid.errors.some(e => e.includes('ERR_CCS_RUBRIC_SUM_INVALID')));
  });

  // Test 5: Complete Case -> 100% BILLING_READY
  test('5. Deterministic evaluateCaseCompleteness returns 100% BILLING_READY on complete surgical encounter', async () => {
    const rubrics = await getCaseCompletenessRubrics(NAPLES_FACILITY_ID);
    const completeCase = {
      patient_mrn: 'MRN-88412',
      case_identifier: 'CAS-PERFECT-01',
      service_date: '2026-02-24',
      primary_payer_id: 'PAY-BCBS-FL',
      preop_in: '2026-02-24T07:00:00Z',
      room_in: '2026-02-24T08:00:00Z',
      incision_start: '2026-02-24T08:15:00Z',
      procedure_close: '2026-02-24T09:05:00Z',
      room_out: '2026-02-24T09:15:00Z',
      pacu_in: '2026-02-24T09:20:00Z',
      discharge_out: '2026-02-24T10:30:00Z',
      surgeon_name: 'Dr. Brian Miller',
      anesthesia_provider: 'Elena Rodriguez, CRNA',
      circulating_rn: 'Sarah Jenkins, RN',
      scrub_tech: 'Marcus Vance, CST',
      primary_cpt: '29881',
      icd10_primary_dx: 'M23.211',
      asa_class: 'ASA II',
      laterality_modifier: 'RT',
      surgeon_op_note_signed: true,
      has_implant: true,
      implant_udi_logged: true
    };

    const res = evaluateCaseCompleteness(completeCase, rubrics);
    assert.equal(res.overall_completeness_score, 100.00);
    assert.equal(res.critical_blockers_count, 0);
    assert.equal(res.missing_fields_count, 0);
    assert.equal(res.readiness_status, 'BILLING_READY');
  });

  // Test 6: Incomplete Case -> INCOMPLETE_HOLD
  test('6. evaluateCaseCompleteness detects missing CPT, timestamps, and implant UDI as INCOMPLETE_HOLD', async () => {
    const rubrics = await getCaseCompletenessRubrics(NAPLES_FACILITY_ID);
    const heldCase = {
      patient_mrn: 'MRN-88499',
      case_identifier: 'CAS-HOLD-01',
      service_date: '2026-02-24',
      room_in: '2026-02-24T08:00:00Z',
      surgeon_name: 'Dr. Sarah Jenkins',
      has_implant: true,
      implant_udi_logged: false,
      surgeon_op_note_signed: false
    };

    const res = evaluateCaseCompleteness(heldCase, rubrics);
    assert.equal(res.readiness_status, 'INCOMPLETE_HOLD');
    assert.ok(res.critical_blockers_count >= 3, 'Should flag missing CPT, room_out/discharge, op note, and UDI');
    assert.ok(res.gaps.some(g => g.field_name === 'implant_udi_logged'));
    assert.ok(res.gaps.some(g => g.field_name === 'primary_cpt'));
  });

  // Test 7: Monotonic OR Chronology Violation Detection
  test('7. Monotonic OR chronology check detects inverted timestamps in PERIOPERATIVE_TIMESTAMPS', async () => {
    const rubrics = await getCaseCompletenessRubrics(NAPLES_FACILITY_ID);
    const invertedCase = {
      patient_mrn: 'MRN-1',
      case_identifier: 'CAS-INV',
      service_date: '2026-02-24',
      primary_payer_id: 'BCBS',
      preop_in: '2026-02-24T07:00:00Z',
      room_in: '2026-02-24T09:30:00Z',
      incision_start: '2026-02-24T08:15:00Z', // Before room_in!
      procedure_close: '2026-02-24T09:05:00Z',
      room_out: '2026-02-24T09:45:00Z',
      pacu_in: '2026-02-24T09:50:00Z',
      discharge_out: '2026-02-24T10:30:00Z',
      surgeon_name: 'Dr. Miller',
      primary_cpt: '29881',
      icd10_primary_dx: 'M23.211',
      surgeon_op_note_signed: true
    };

    const res = evaluateCaseCompleteness(invertedCase, rubrics);
    assert.ok(res.timestamps_score <= 50.00, 'Inverted chronology must cap timestamp pillar score');
    assert.equal(res.readiness_status, 'INCOMPLETE_HOLD');
    assert.ok(res.gaps.some(g => g.field_name.includes('room_in->incision_start')));
  });

  // Test 8: Gap Remediation Recalculates Case Score & Promotes Readiness
  test('8. Resolving all open field gaps recalculates case score and promotes to BILLING_READY', async () => {
    const gaps = await getCaseCompletenessFieldGaps('CAS-20260224-003');
    assert.equal(gaps.filter(g => g.remediation_status === 'OPEN').length, 3);

    for (const g of gaps) {
      await resolveCaseFieldGap(g.id, 'qa@naplesasc.com', 'VERIFIED');
    }

    const updatedScores = await getCaseCompletenessScores(NAPLES_FACILITY_ID);
    const cas3 = updatedScores.find(s => s.case_identifier === 'CAS-20260224-003');
    assert.equal(cas3.overall_completeness_score, 100.00);
    assert.equal(cas3.critical_blockers_count, 0);
    assert.equal(cas3.readiness_status, 'BILLING_READY');
    assert.equal(cas3.sha256_sync_seal.length, 64);
  });

  // Test 9: Batch Audit Scan Creates 64-Char SHA-256 Seal
  test('9. Triggering manual Case Completeness Audit generates run record with 64-char SHA-256 seal', async () => {
    const run = await triggerCaseCompletenessAudit(NAPLES_FACILITY_ID, 'qa@naplesasc.com');
    assert.ok(run, 'Audit run must be created');
    assert.ok(run.run_code.startsWith('CCS-AUD-'));
    assert.ok(run.sha256_sync_seal.startsWith('sha256_ccs_'));
    assert.equal(run.sha256_sync_seal.length, 64, 'Seal must be strictly 64 characters');
  });

  // Test 10: Dual Facade Re-Export Parity
  test('10. Dual facade re-export parity between src/services/ and src/lib/', () => {
    const expected = [
      'NAPLES_FACILITY_ID',
      'CANONICAL_PILLARS',
      'normalizeFacilityId',
      'computeCaseCompletenessSeal',
      'maskCaseCompletenessSecret',
      'validateCompletenessRubricWeights',
      'evaluateCaseCompleteness',
      'getCaseCompletenessConfig',
      'getCaseCompletenessTelemetry',
      'getCaseCompletenessRubrics',
      'getCaseCompletenessScores',
      'getCaseCompletenessFieldGaps',
      'getCaseSpecialtyBenchmarks',
      'getCaseAuditRuns',
      'resolveCaseFieldGap',
      'triggerCaseCompletenessAudit'
    ];

    for (const key of expected) {
      assert.ok(facade[key], `Facade must re-export ${key}`);
      assert.equal(typeof facade[key], typeof service[key], `Type parity for ${key}`);
    }
  });

  // Test 11: Migration 133 UP/DOWN SQL Structural Integrity & RLS
  test('11. Migration 133 UP/DOWN SQL structural integrity and RLS policies', () => {
    const upPath = path.resolve('supabase/migrations/133_case_completeness_score.sql');
    const downPath = path.resolve('supabase/migrations/133_case_completeness_score_down.sql');

    assert.ok(fs.existsSync(upPath));
    assert.ok(fs.existsSync(downPath));

    const upSql = fs.readFileSync(upPath, 'utf8');
    const downSql = fs.readFileSync(downPath, 'utf8');

    const tables = [
      'case_completeness_configs',
      'case_completeness_rubrics',
      'case_completeness_scores',
      'case_completeness_field_gaps',
      'case_completeness_specialty_benchmarks',
      'case_completeness_audit_runs',
      'case_completeness_provenance_ledger'
    ];

    for (const tbl of tables) {
      assert.ok(upSql.includes(`CREATE TABLE IF NOT EXISTS public.${tbl}`), `Missing ${tbl}`);
      assert.ok(upSql.includes(`ALTER TABLE public.${tbl} ENABLE ROW LEVEL SECURITY`), `Missing RLS on ${tbl}`);
      assert.ok(downSql.includes(`DROP TABLE IF EXISTS public.${tbl}`), `Missing DROP ${tbl} in down`);
    }

    assert.ok(upSql.includes('CREATE OR REPLACE VIEW public.vw_case_completeness_telemetry'));
    assert.ok(upSql.includes('app.current_facility_id'));
    assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_case_completeness_telemetry'));
  });

  // Test 12: Zero Prohibited Tokens & App.jsx Shell Integration
  test('12. Strict zero-prohibited token compliance and App.jsx shell integration', () => {
    const prohibitedTokens = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];
    const files = [
      path.resolve('src/components/CaseCompletenessView.jsx'),
      path.resolve('src/components/CaseCompletenessView.css'),
      path.resolve('src/services/caseCompletenessService.js'),
      path.resolve('src/lib/caseCompletenessService.js')
    ];

    for (const f of files) {
      assert.ok(fs.existsSync(f), `Missing file: ${f}`);
      const content = fs.readFileSync(f, 'utf8').toLowerCase();
      for (const token of prohibitedTokens) {
        assert.ok(!content.includes(token), `Prohibited token '${token}' found in ${path.basename(f)}`);
      }
    }

    const appContent = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8');
    assert.ok(appContent.includes("import CaseCompletenessView from './components/CaseCompletenessView'"));
    assert.ok(appContent.includes("activeTab === 'case_completeness_score'"));
    assert.ok(appContent.includes('<CaseCompletenessView activeFacility={activeFacility} />'));
    assert.ok(appContent.includes('Case Completeness Score & Clinical Readiness'));
  });

});
