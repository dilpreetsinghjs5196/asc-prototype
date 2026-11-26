/**
 * ==============================================================================
 * Test Suite: source-provenance.test.js
 * Module 16: Enterprise Data Quality Governance (Phase G5)
 * Tests: Telemetry & Chain Reproducibility, Facility UUID Normalization,
 *        Config & 7-Year HIPAA Retention Guardrail + Masked Secrets,
 *        SemVer Mapping Tag Validation, Mapping Version Publish & Retirement,
 *        Mandatory Provenance Tuple Enforcement, End-to-End Lineage Tracer,
 *        Hash-Chain Tamper Detection, Chain Integrity Audit Verification Run,
 *        Dual Facade Parity, Migration 137 UP/DOWN SQL + RLS,
 *        Zero Prohibited Tokens & App.jsx Shell Wiring.
 * ==============================================================================
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import service, {
  NAPLES_FACILITY_ID,
  HIPAA_RETENTION_DAYS,
  normalizeFacilityId,
  computeSprProvenanceSeal,
  maskSprSecret,
  validateMappingVersionTag,
  validateProvenanceChain,
  getSprConfig,
  updateSprConfig,
  getSprTelemetry,
  getSprMappingVersions,
  getSprAuditChain,
  registerSourceMappingVersion,
  recordIngestionProvenance,
  traceRecordFullLineage,
  verifyProvenanceChainIntegrity
} from '../src/services/sourceProvenanceService.js';

import * as facade from '../src/lib/sourceProvenanceService.js';

describe('Phase G5: Source Provenance, Mapping Versions & Cryptographic Lineage', () => {

  test('1. Telemetry returns accurate lineage, batch, and hash-chain metrics for Naples Surgery Center', async () => {
    const telemetry = await getSprTelemetry(NAPLES_FACILITY_ID);
    assert.ok(telemetry);
    assert.equal(telemetry.facility_id, NAPLES_FACILITY_ID);
    assert.equal(telemetry.retention_days, HIPAA_RETENTION_DAYS);
    assert.ok(telemetry.tracked_lineage_count >= 3);
    assert.ok(telemetry.active_mapping_versions_count >= 3);
    assert.equal(telemetry.chain_reproducibility_rate, 100.00);
    assert.ok(telemetry.latest_sync_seal.startsWith('sha256_spr_'));
    assert.equal(telemetry.latest_sync_seal.length, 64);
  });

  test('2. Facility UUID alias resolution matches Naples Surgery Center across strings and objects', () => {
    assert.equal(normalizeFacilityId('fac-naples-01'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId('naples-surgery-center'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ id: 'fac-naples-01' }), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ uuid: NAPLES_FACILITY_ID }), NAPLES_FACILITY_ID);
  });

  test('3. Config retrieval, masked secret check, and >=2555-day HIPAA retention floor guardrail', async () => {
    const cfg = await getSprConfig('fac-naples-01');
    assert.ok(cfg.client_secret_encrypted.startsWith('spr_sec_****_'));
    assert.equal(maskSprSecret('raw_provenance_secret_8812'), 'spr_sec_****_8812');

    await assert.rejects(
      () => updateSprConfig(NAPLES_FACILITY_ID, { retention_days: 365 }),
      /ERR_SPR_RETENTION_BELOW_MINIMUM/
    );
  });

  test('4. SemVer mapping version validator enforces strict map-vMAJOR.MINOR.PATCH syntax', () => {
    const valid = validateMappingVersionTag('map-v2.4.0');
    assert.equal(valid.valid, true);
    assert.throws(() => validateMappingVersionTag('v2.4'), /ERR_SPR_INVALID_MAPPING_VERSION/);
    assert.throws(() => validateMappingVersionTag('latest'), /ERR_SPR_INVALID_MAPPING_VERSION/);
  });

  test('5. Publishing new mapping version activates spec and retires superseded active version', async () => {
    const published = await registerSourceMappingVersion(NAPLES_FACILITY_ID, {
      source_system: 'SIS_EHR',
      entity_type: 'SURGICAL_CASE',
      version_tag: 'map-v2.5.0',
      field_transform_spec_json: { cut_start: 'STRICT_UTC_ISO' },
      approved_by: 'steward@naplessurgery.com'
    });

    assert.equal(published.version_tag, 'map-v2.5.0');
    assert.equal(published.is_active, true);
    assert.equal(published.sha256_spec_seal.length, 64);

    const allMappings = await getSprMappingVersions(NAPLES_FACILITY_ID);
    const oldSis = allMappings.find(m => m.mapping_code === 'MAP-SIS-CASE-240');
    assert.equal(oldSis.is_active, false);
    assert.ok(oldSis.effective_to !== null, 'Superseded mapping must receive effective_to timestamp');
  });

  test('6. recordIngestionProvenance rejects incomplete tuples and appends chained audit link', async () => {
    await assert.rejects(
      () => recordIngestionProvenance(NAPLES_FACILITY_ID, { source_system: 'SIS_EHR', target_record_id: 'CAS-999' }),
      /ERR_SPR_MISSING_PROVENANCE/
    );

    const recorded = await recordIngestionProvenance(NAPLES_FACILITY_ID, {
      target_entity_type: 'SURGICAL_CASE',
      target_record_id: 'CAS-20261126-777',
      source_system: 'SIS_EHR',
      source_record_id: 'SIS-ENC-77710',
      batch_control_number: 'SIS-BAT-20261126-09',
      mapping_version_tag: 'map-v2.5.0',
      actor_email: 'sis.gateway@naplessurgery.com'
    });

    assert.equal(recorded.lineage.target_record_id, 'CAS-20261126-777');
    assert.equal(recorded.chain_event.sha256_event_seal.length, 64);
    assert.ok(recorded.chain_event.prev_chain_seal.startsWith('sha256_spr_'));
  });

  test('7. traceRecordFullLineage resolves full end-to-end tuple from target ID to source batch and events', async () => {
    const trace = await traceRecordFullLineage(NAPLES_FACILITY_ID, 'CAS-20261126-777');
    assert.equal(trace.source_system, 'SIS_EHR');
    assert.equal(trace.source_record_id, 'SIS-ENC-77710');
    assert.ok(trace.batch_envelope, 'Batch envelope must resolve');
    assert.equal(trace.batch_envelope.batch_control_number, 'SIS-BAT-20261126-09');
    assert.ok(trace.mapping_version, 'Mapping version must resolve');
    assert.equal(trace.mapping_version.version_tag, 'map-v2.5.0');
    assert.ok(trace.audit_events.length >= 1);
  });

  test('8. validateProvenanceChain passes intact chain and catches tampered payload/link deterministically', async () => {
    const chain = await getSprAuditChain(NAPLES_FACILITY_ID);
    const intactReport = validateProvenanceChain(NAPLES_FACILITY_ID, chain);
    assert.equal(intactReport.intact, true);
    assert.equal(intactReport.chain_breaks_detected, 0);

    // Simulate tampering with event #2 state without updating seals
    const tampered = chain.map((ev, i) => (
      i === 1 ? { ...ev, after_state_json: { tampered: true } } : ev
    ));
    const tamperedReport = validateProvenanceChain(NAPLES_FACILITY_ID, tampered);
    assert.equal(tamperedReport.intact, false);
    assert.equal(tamperedReport.chain_breaks_detected, 1);
  });

  test('9. verifyProvenanceChainIntegrity logs 100% intact attestation run with 64-char SHA-256 seal', async () => {
    const auditRun = await verifyProvenanceChainIntegrity(NAPLES_FACILITY_ID, 'compliance@naplessurgery.com');
    assert.equal(auditRun.intact, true);
    assert.equal(auditRun.chain_breaks_detected, 0);
    assert.equal(auditRun.reproducibility_rate, 100.00);
    assert.equal(auditRun.sha256_sync_seal.length, 64);
  });

  test('10. Dual facade re-export parity between src/services/ and src/lib/', () => {
    const testSeal = computeSprProvenanceSeal({ parity: 'ok' });
    assert.equal(facade.computeSprProvenanceSeal({ parity: 'ok' }), testSeal);
    assert.equal(facade.NAPLES_FACILITY_ID, service.NAPLES_FACILITY_ID);
    assert.equal(typeof facade.traceRecordFullLineage, 'function');
    assert.equal(typeof facade.verifyProvenanceChainIntegrity, 'function');
    assert.equal(typeof facade.registerSourceMappingVersion, 'function');
  });

  test('11. Migration 137 UP/DOWN SQL structural integrity and RLS policies', () => {
    const upPath = path.resolve('supabase/migrations/137_source_provenance.sql');
    const downPath = path.resolve('supabase/migrations/137_source_provenance_down.sql');
    assert.ok(fs.existsSync(upPath), 'Migration 137 UP file must exist');
    assert.ok(fs.existsSync(downPath), 'Migration 137 DOWN file must exist');

    const upSql = fs.readFileSync(upPath, 'utf8');
    const downSql = fs.readFileSync(downPath, 'utf8');

    const expectedTables = [
      'spr_configs',
      'spr_source_systems',
      'spr_mapping_versions',
      'spr_ingestion_batches',
      'spr_record_lineage',
      'spr_audit_chain',
      'spr_verification_runs'
    ];

    for (const tbl of expectedTables) {
      assert.ok(upSql.includes(`CREATE TABLE IF NOT EXISTS public.${tbl}`), `Missing UP table ${tbl}`);
      assert.ok(upSql.includes(`ALTER TABLE public.${tbl} ENABLE ROW LEVEL SECURITY`), `Missing RLS on ${tbl}`);
      assert.ok(downSql.includes(`DROP TABLE IF EXISTS public.${tbl} CASCADE`), `Missing DOWN drop for ${tbl}`);
    }
    assert.ok(upSql.includes('CREATE OR REPLACE VIEW public.vw_spr_telemetry'));
    assert.ok(upSql.includes('app.current_facility_id'));
    assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_spr_telemetry'));
  });

  test('12. Strict zero-prohibited token compliance and App.jsx shell integration', () => {
    const filesToCheck = [
      path.resolve('src/components/SourceProvenanceView.jsx'),
      path.resolve('src/components/SourceProvenanceView.css'),
      path.resolve('src/services/sourceProvenanceService.js'),
      path.resolve('src/lib/sourceProvenanceService.js')
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
    assert.ok(appSource.includes("import SourceProvenanceView from './components/SourceProvenanceView'"));
    assert.ok(appSource.includes("activeTab === 'source_provenance'"));
    assert.ok(appSource.includes('<SourceProvenanceView activeFacility={activeFacility} />'));
  });
});
