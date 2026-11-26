/**
 * ==============================================================================
 * Test Suite: duplicate-and-matching-rules.test.js
 * Module 16: Enterprise Data Quality Governance (Phase G4)
 * Tests: Telemetry & Exposure Metrics, Facility UUID Normalization,
 *        Config & Secret Masking, Rule Weight Conservation (100.00%),
 *        Deterministic Matching (Exact Collision, Fuzzy Candidate, Distinct),
 *        Field Survivorship Precedence & Steward Overrides, Manual Merge +
 *        Golden Master Sealing, Distinct Reason Enforcement, Unmerge Reversal,
 *        Batch Scan Provenance + Dual Facade Parity, Migration 136 UP/DOWN SQL,
 *        Zero Prohibited Tokens & App.jsx Shell Wiring.
 * ==============================================================================
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import service, {
  NAPLES_FACILITY_ID,
  CANONICAL_ENTITY_TYPES,
  normalizeFacilityId,
  computeDmrProvenanceSeal,
  maskDmrSecret,
  validateRuleFieldWeights,
  evaluateRecordPairMatch,
  resolveFieldSurvivorship,
  getDmrConfig,
  updateDmrConfig,
  getDmrTelemetry,
  getDmrMatchingRules,
  getDmrSurvivorshipPolicies,
  getDmrCandidatePairs,
  getDmrGoldenRecords,
  getDmrMergeHistory,
  mergeCandidatePair,
  markCandidatePairDistinct,
  revertGoldenMerge,
  runDuplicateMatchScan
} from '../src/services/duplicateMatchingService.js';

import * as facade from '../src/lib/duplicateMatchingService.js';

describe('Phase G4: Duplicate Detection, Matching Rules & Survivorship', () => {

  test('1. Telemetry returns accurate exposure, golden master counts, and sha256_dmr_ seal', async () => {
    const telemetry = await getDmrTelemetry(NAPLES_FACILITY_ID);
    assert.ok(telemetry, 'Telemetry must be returned');
    assert.equal(telemetry.facility_id, NAPLES_FACILITY_ID);
    assert.equal(telemetry.auto_merge_threshold, 95.00);
    assert.equal(telemetry.manual_review_threshold, 75.00);
    assert.ok(telemetry.pending_review_count >= 4, 'Expected at least 4 pending pairs');
    assert.ok(telemetry.active_golden_records_count >= 1, 'Expected >=1 active golden record');
    assert.ok(telemetry.latest_sync_seal.startsWith('sha256_dmr_'));
    assert.equal(telemetry.latest_sync_seal.length, 64);
  });

  test('2. Facility UUID alias resolution matches Naples Surgery Center across strings and objects', () => {
    assert.equal(normalizeFacilityId('fac-naples-01'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId('naples-surgery-center'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ id: 'fac-naples-01' }), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ uuid: NAPLES_FACILITY_ID }), NAPLES_FACILITY_ID);
    assert.equal(CANONICAL_ENTITY_TYPES.length, 6);
  });

  test('3. Config retrieval, threshold ordering guard, and masked secret verification', async () => {
    const cfg = await getDmrConfig('fac-naples-01');
    assert.ok(cfg.client_secret_encrypted.startsWith('dmr_sec_****_'));
    assert.equal(maskDmrSecret('raw_super_secret_token_9941'), 'dmr_sec_****_9941');

    await assert.rejects(
      () => updateDmrConfig(NAPLES_FACILITY_ID, { auto_merge_threshold: 70, manual_review_threshold: 80 }),
      /ERR_DMR_INVALID_THRESHOLD/
    );
  });

  test('4. Rule weight conservation validator enforces strict 100.00% sum across entities', async () => {
    const rules = await getDmrMatchingRules(NAPLES_FACILITY_ID);
    assert.ok(rules.length >= 6);
    for (const rule of rules) {
      const check = validateRuleFieldWeights(rule.field_weights);
      assert.equal(check.valid, true);
      assert.equal(check.total_weight, 100.00);
    }
    assert.throws(
      () => validateRuleFieldWeights({ tax_id_ein: 50, legal_name: 40 }),
      /ERR_DMR_INVALID_WEIGHT_SUM/
    );
  });

  test('5. evaluateRecordPairMatch computes exact collision (100.00), fuzzy candidate, and distinct separation', () => {
    // Exact vendor invoice key collision
    const exactMatch = evaluateRecordPairMatch(
      'VENDOR_INVOICE',
      { vendor_code: 'VND-STRYKER', invoice_number: 'INV-2026-100', invoice_total_usd: 1500.00, invoice_date: '2026-11-20' },
      { vendor_code: 'VND-STRYKER', invoice_number: 'INV2026100', invoice_total_usd: 1500.00, invoice_date: '2026-11-20' }
    );
    assert.equal(exactMatch.confidence_score, 100.00);
    assert.equal(exactMatch.match_classification, 'EXACT_DUPLICATE');
    assert.equal(exactMatch.exact_collision_triggered, true);
    assert.equal(exactMatch.sha256_seal.length, 64);

    // Partial vendor fuzzy similarity without EIN match
    const fuzzyCandidate = evaluateRecordPairMatch(
      'VENDOR',
      { tax_id_ein: '12-3456789', legal_name: 'Medtronic Spinal Technologies', vendor_code: 'MED-01', remit_zip: '34102' },
      { tax_id_ein: '12-3456789', legal_name: 'Medtronic Spinal Care LLC', vendor_code: 'MED-99', remit_zip: '34102' }
    );
    assert.ok(fuzzyCandidate.confidence_score >= 80);

    // Distinct non-match
    const distinctPair = evaluateRecordPairMatch(
      'PATIENT',
      { mrn: 'MRN-11111', last_name: 'Thompson', first_name: 'Arthur', dob: '1958-01-12', ssn_last4: '1122' },
      { mrn: 'MRN-99887', last_name: 'Castellano', first_name: 'Maria', dob: '1989-11-04', ssn_last4: '9981' }
    );
    assert.equal(distinctPair.match_classification, 'DISTINCT_NON_MATCH');
    assert.ok(distinctPair.confidence_score < 75.00);
  });

  test('6. resolveFieldSurvivorship honors source precedence, numeric precision, and human overrides', async () => {
    const policies = await getDmrSurvivorshipPolicies(NAPLES_FACILITY_ID);
    const vndPolicy = policies.find(p => p.entity_type === 'VENDOR');

    const result = resolveFieldSurvivorship(
      { _source_module: 'ACCOUNTING_GL', vendor_code: 'ZIMMER-01', legal_name: 'Zimmer Biomet Holdings Inc', tax_id_ein: '13-4041511', verified_at: '2026-11-15T10:00:00Z' },
      { _source_module: 'INVENTORY_POU', vendor_code: 'ZIMMER-SURG', legal_name: 'Zimmer Biomet Surgical LLC', tax_id_ein: '13-4041511', verified_at: '2026-11-22T11:30:00Z' },
      vndPolicy,
      { legal_name: 'A' }
    );

    // ACCOUNTING_GL outranks INVENTORY_POU for vendor_code; override forces Record A on legal_name
    assert.equal(result.survived_payload.vendor_code, 'ZIMMER-01');
    assert.equal(result.field_provenance.vendor_code.winning_source, 'ACCOUNTING_GL');
    assert.equal(result.survived_payload.legal_name, 'Zimmer Biomet Holdings Inc');
    assert.equal(result.field_provenance.legal_name.strategy_applied, 'MANUAL_STEWARD_OVERRIDE');
  });

  test('7. Manual merge promotes Golden Master and seals immutable MANUAL_MERGE audit record', async () => {
    const res = await mergeCandidatePair(NAPLES_FACILITY_ID, 'd4200002-0000-4000-8000-000000000002', {
      actor_email: 'steward@naplessurgery.com',
      reason: 'Confirmed EIN 13-4041511 across GL and POU vendor master'
    });

    assert.equal(res.pair.resolution_status, 'MANUALLY_MERGED');
    assert.ok(res.golden_record.golden_code.startsWith('GLD-'));
    assert.equal(res.golden_record.is_active, true);
    assert.equal(res.history_entry.action_type, 'MANUAL_MERGE');
    assert.equal(res.history_entry.sha256_seal.length, 64);

    const goldenList = await getDmrGoldenRecords(NAPLES_FACILITY_ID);
    assert.ok(goldenList.some(g => g.id === res.golden_record.id));
  });

  test('8. Confirming distinct enforces >=5 character reason and blocks duplicate confirmation', async () => {
    await assert.rejects(
      () => markCandidatePairDistinct(NAPLES_FACILITY_ID, 'd4200003-0000-4000-8000-000000000003', { reason: 'no' }),
      /ERR_DMR_REASON_REQUIRED/
    );

    const res = await markCandidatePairDistinct(NAPLES_FACILITY_ID, 'd4200003-0000-4000-8000-000000000003', {
      reason: 'Verified distinct twin siblings sharing address and birth date'
    });
    assert.equal(res.pair.resolution_status, 'CONFIRMED_DISTINCT');
    assert.equal(res.history_entry.action_type, 'CONFIRM_DISTINCT');
  });

  test('9. Unmerge revert deactivates Golden Master, restores REVERSED status, and logs provenance', async () => {
    await assert.rejects(
      () => revertGoldenMerge(NAPLES_FACILITY_ID, 'd4200001-0000-4000-8000-000000000001', { reason: 'err' }),
      /ERR_DMR_REASON_REQUIRED/
    );

    const rev = await revertGoldenMerge(NAPLES_FACILITY_ID, 'd4200001-0000-4000-8000-000000000001', {
      reason: 'Invoice split credit memo requires separate AP vouchers'
    });
    assert.equal(rev.pair.resolution_status, 'REVERSED');
    assert.equal(rev.pair.golden_record_id, null);
    assert.equal(rev.history_entry.action_type, 'UNMERGE_REVERT');
    assert.equal(rev.history_entry.sha256_seal.length, 64);

    const hist = await getDmrMergeHistory(NAPLES_FACILITY_ID);
    assert.ok(hist.some(h => h.action_type === 'UNMERGE_REVERT'));
  });

  test('10. Batch scan creates SHA-256 sealed run log & dual facade parity matches src/services vs src/lib', async () => {
    const run = await runDuplicateMatchScan(NAPLES_FACILITY_ID, { entity_scope: 'ALL' });
    assert.ok(run.batch_control_number.startsWith('DMR-BATCH-'));
    assert.equal(run.sha256_sync_seal.length, 64);

    const candidates = await getDmrCandidatePairs(NAPLES_FACILITY_ID);
    assert.ok(candidates.length >= 5);

    const sealCheck = computeDmrProvenanceSeal({ test: 'parity' });
    assert.equal(facade.computeDmrProvenanceSeal({ test: 'parity' }), sealCheck);
    assert.equal(typeof facade.evaluateRecordPairMatch, 'function');
    assert.equal(typeof facade.mergeCandidatePair, 'function');
    assert.equal(typeof facade.revertGoldenMerge, 'function');
    assert.equal(service.NAPLES_FACILITY_ID, facade.NAPLES_FACILITY_ID);
  });

  test('11. Migration 136 UP/DOWN SQL structural integrity and RLS policies', () => {
    const upPath = path.resolve('supabase/migrations/136_duplicate_and_matching_rules.sql');
    const downPath = path.resolve('supabase/migrations/136_duplicate_and_matching_rules_down.sql');
    assert.ok(fs.existsSync(upPath), 'Migration 136 UP file must exist');
    assert.ok(fs.existsSync(downPath), 'Migration 136 DOWN file must exist');

    const upSql = fs.readFileSync(upPath, 'utf8');
    const downSql = fs.readFileSync(downPath, 'utf8');

    const expectedTables = [
      'dmr_configs',
      'dmr_matching_rules',
      'dmr_survivorship_policies',
      'dmr_golden_records',
      'dmr_candidate_pairs',
      'dmr_merge_history',
      'dmr_match_runs'
    ];

    for (const tbl of expectedTables) {
      assert.ok(upSql.includes(`CREATE TABLE IF NOT EXISTS public.${tbl}`), `Missing UP table ${tbl}`);
      assert.ok(upSql.includes(`ALTER TABLE public.${tbl} ENABLE ROW LEVEL SECURITY`), `Missing RLS on ${tbl}`);
      assert.ok(downSql.includes(`DROP TABLE IF EXISTS public.${tbl} CASCADE`), `Missing DOWN drop for ${tbl}`);
    }
    assert.ok(upSql.includes('CREATE OR REPLACE VIEW public.vw_dmr_telemetry'));
    assert.ok(upSql.includes('app.current_facility_id'));
    assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_dmr_telemetry'));
  });

  test('12. Strict zero-prohibited token compliance and App.jsx shell integration', () => {
    const filesToCheck = [
      path.resolve('src/components/DuplicateMatchingRulesView.jsx'),
      path.resolve('src/components/DuplicateMatchingRulesView.css'),
      path.resolve('src/services/duplicateMatchingService.js'),
      path.resolve('src/lib/duplicateMatchingService.js')
    ];

    const prohibited = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];
    for (const file of filesToCheck) {
      assert.ok(fs.existsSync(file), `File must exist: ${file}`);
      const content = fs.readFileSync(file, 'utf8').toLowerCase();
      for (const word of prohibited) {
        assert.equal(content.includes(word), false, `Prohibited color token "${word}" found in ${file}`);
      }
    }

    const appSource = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8');
    assert.ok(appSource.includes("import DuplicateMatchingRulesView from './components/DuplicateMatchingRulesView'"));
    assert.ok(appSource.includes("activeTab === 'duplicate_matching_rules'"));
    assert.ok(appSource.includes('<DuplicateMatchingRulesView activeFacility={activeFacility} />'));
  });
});
