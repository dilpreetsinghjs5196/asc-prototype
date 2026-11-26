/**
 * ==============================================================================
 * Service: sourceProvenanceService.js
 * Module 16: Enterprise Data Quality Governance (Phase G5)
 * Description: Unified Source Provenance Registry, Ingestion Batch Envelopes,
 *              SemVer Mapping Versioning, End-to-End Record Lineage Tracing,
 *              Cryptographic Hash-Chained Audit Ledger, and SHA-256 Attestation.
 * ==============================================================================
 */

import crypto from 'crypto';

export const NAPLES_FACILITY_ID = '00000000-0000-0000-0000-000000000002';
export const HIPAA_RETENTION_DAYS = 2555;
export const GENESIS_CHAIN_SEAL = 'GENESIS_00000000000000000000000000000000000000000000000000000000';

export const CANONICAL_SOURCE_SYSTEMS = [
  'SIS_EHR',
  'HST_EHR',
  'CLEARINGHOUSE_EDI',
  'ACCOUNTING_GL',
  'PAYROLL_WFM',
  'INVENTORY_POU',
  'VENDOR_INVOICE',
  'EXCEL_CSV'
];

export const CANONICAL_BATCH_STATUSES = [
  'INGESTED',
  'VALIDATED',
  'COMMITTED',
  'SUPERSEDED',
  'ROLLED_BACK'
];

export const CANONICAL_LINEAGE_EVENT_TYPES = [
  'INGESTED',
  'TRANSFORMED',
  'MANUAL_OVERRIDE',
  'REPLAYED',
  'MERGED_TO_GOLDEN',
  'CALCULATION_FREEZE'
];

/**
 * Normalizes facility identifier across strings, aliases, and objects.
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
 * Generates an immutable 64-character SHA-256 seal prefixed with `sha256_spr_`.
 */
export function computeSprProvenanceSeal(payload) {
  const canonicalJson = JSON.stringify(payload || {});
  const digest = crypto.createHash('sha256').update(canonicalJson).digest('hex');
  return `sha256_spr_${digest.slice(0, 53)}`;
}

/**
 * Masks provenance secrets cleanly so plaintext credentials never leak.
 */
export function maskSprSecret(rawSecret) {
  if (!rawSecret) return 'spr_sec_****_unset';
  const str = String(rawSecret);
  if (str.startsWith('spr_sec_****_')) return str;
  const tail = str.slice(-4);
  return `spr_sec_****_${tail}`;
}

/**
 * Enforces strict SemVer mapping version tags matching `map-vMAJOR.MINOR.PATCH`.
 */
export function validateMappingVersionTag(versionTag) {
  const tag = String(versionTag || '').trim();
  if (!/^map-v\d+\.\d+\.\d+$/.test(tag)) {
    throw new Error(`ERR_SPR_INVALID_MAPPING_VERSION: Mapping version "${tag}" must follow map-vMAJOR.MINOR.PATCH`);
  }
  return { valid: true, version_tag: tag };
}

/**
 * Computes deterministic seal for a single audit chain link.
 */
export function computeChainLinkSeal(facilityId, event) {
  return computeSprProvenanceSeal({
    facility_id: facilityId,
    event_seq: event.event_seq,
    lineage_id: event.lineage_id,
    event_type: event.event_type,
    mapping_version_tag: event.mapping_version_tag,
    before_state_json: event.before_state_json || {},
    after_state_json: event.after_state_json || {},
    prev_chain_seal: event.prev_chain_seal
  });
}

/**
 * Verifies hash-chain link continuity and per-event SHA-256 integrity across
 * sorted audit events, flagging any broken or tampered event sequence numbers.
 */
export function validateProvenanceChain(facilityId, chainEvents = []) {
  const sorted = [...chainEvents].sort((a, b) => Number(a.event_seq) - Number(b.event_seq));
  const breaks = [];
  let expectedPrev = GENESIS_CHAIN_SEAL;

  for (const ev of sorted) {
    const expectedSeal = computeChainLinkSeal(facilityId, ev);
    if (ev.prev_chain_seal !== expectedPrev || ev.sha256_event_seal !== expectedSeal) {
      breaks.push({
        event_seq: ev.event_seq,
        lineage_id: ev.lineage_id,
        expected_prev_seal: expectedPrev,
        actual_prev_seal: ev.prev_chain_seal,
        expected_event_seal: expectedSeal,
        actual_event_seal: ev.sha256_event_seal
      });
    }
    expectedPrev = ev.sha256_event_seal;
  }

  return {
    intact: breaks.length === 0,
    total_events_checked: sorted.length,
    chain_breaks_detected: breaks.length,
    breaks
  };
}

// ==============================================================================
// Deterministic In-Memory Facility Store (Naples Surgery Center Seed)
// ==============================================================================

const facilityStateStore = new Map();

function buildInitialFacilityStore(facilityId) {
  const config = {
    id: 'e5000001-0000-4000-8000-000000000001',
    facility_id: facilityId,
    retention_days: HIPAA_RETENTION_DAYS,
    require_batch_manifest_seal: true,
    require_mapping_version_tag: true,
    enforce_immutable_append_only: true,
    client_secret_encrypted: 'spr_sec_****_naples_7721',
    sync_status: 'ACTIVE',
    health_status: 'HEALTHY',
    updated_at: '2026-11-26T09:00:00.000Z'
  };

  const sourceSystems = [
    {
      id: 'src-sys-01',
      facility_id: facilityId,
      source_system: 'SIS_EHR',
      connector_code: 'CONN-SIS-NAP',
      display_name: 'SIS Perioperative EHR & Scheduling',
      source_priority_rank: 1,
      active_schema_version: 'map-v2.4.0',
      trust_tier: 'TIER_1_SYSTEM_OF_RECORD',
      last_batch_control_number: 'SIS-BAT-20261126-01',
      is_active: true
    },
    {
      id: 'src-sys-02',
      facility_id: facilityId,
      source_system: 'CLEARINGHOUSE_EDI',
      connector_code: 'CONN-WAYSTAR-NAP',
      display_name: 'Waystar 837/835 EDI Clearinghouse',
      source_priority_rank: 2,
      active_schema_version: 'map-v1.9.2',
      trust_tier: 'TIER_2_CLEARINGHOUSE',
      last_batch_control_number: 'EDI-BAT-20261126-08',
      is_active: true
    },
    {
      id: 'src-sys-03',
      facility_id: facilityId,
      source_system: 'VENDOR_INVOICE',
      connector_code: 'CONN-EDI810-NAP',
      display_name: 'Vendor 810 & AP Invoice OCR Gateway',
      source_priority_rank: 3,
      active_schema_version: 'map-v1.5.0',
      trust_tier: 'TIER_1_SYSTEM_OF_RECORD',
      last_batch_control_number: 'INV-BAT-20261125-04',
      is_active: true
    },
    {
      id: 'src-sys-04',
      facility_id: facilityId,
      source_system: 'ACCOUNTING_GL',
      connector_code: 'CONN-NS-NAP',
      display_name: 'NetSuite ASC General Ledger',
      source_priority_rank: 4,
      active_schema_version: 'map-v1.3.1',
      trust_tier: 'TIER_1_SYSTEM_OF_RECORD',
      last_batch_control_number: 'GL-BAT-20261125-02',
      is_active: true
    }
  ];

  const mappingVersions = [
    {
      id: 'map-sis-240',
      facility_id: facilityId,
      mapping_code: 'MAP-SIS-CASE-240',
      source_system: 'SIS_EHR',
      entity_type: 'SURGICAL_CASE',
      version_tag: 'map-v2.4.0',
      field_transform_spec_json: {
        patient_mrn: 'TRIM_UPPER',
        dos: 'ISO_DATE',
        cut_start: 'UTC_TIMESTAMPTZ',
        cpt_codes: 'ARRAY_DEDUP'
      },
      effective_from: '2026-10-01T00:00:00.000Z',
      effective_to: null,
      is_active: true,
      approved_by: 'data_steward@naplessurgery.com',
      sha256_spec_seal: computeSprProvenanceSeal({ code: 'MAP-SIS-CASE-240', version: 'map-v2.4.0' })
    },
    {
      id: 'map-835-192',
      facility_id: facilityId,
      mapping_code: 'MAP-EDI-835-192',
      source_system: 'CLEARINGHOUSE_EDI',
      entity_type: 'CLAIM_REMIT',
      version_tag: 'map-v1.9.2',
      field_transform_spec_json: {
        clp01_claim_id: 'TRIM',
        clp03_billed: 'CENTS_TO_USD_2DP',
        clp04_paid: 'CENTS_TO_USD_2DP',
        cas_carc: 'WEDI_NORM'
      },
      effective_from: '2026-09-15T00:00:00.000Z',
      effective_to: null,
      is_active: true,
      approved_by: 'rcm_lead@naplessurgery.com',
      sha256_spec_seal: computeSprProvenanceSeal({ code: 'MAP-EDI-835-192', version: 'map-v1.9.2' })
    },
    {
      id: 'map-inv-150',
      facility_id: facilityId,
      mapping_code: 'MAP-VND-810-150',
      source_system: 'VENDOR_INVOICE',
      entity_type: 'VENDOR_INVOICE',
      version_tag: 'map-v1.5.0',
      field_transform_spec_json: {
        invoice_no: 'ALPHANUM_NORM',
        unit_price: 'USD_2DP',
        sku: 'VENDOR_ALIAS_MAP'
      },
      effective_from: '2026-11-01T00:00:00.000Z',
      effective_to: null,
      is_active: true,
      approved_by: 'controller@naplessurgery.com',
      sha256_spec_seal: computeSprProvenanceSeal({ code: 'MAP-VND-810-150', version: 'map-v1.5.0' })
    }
  ];

  const ingestionBatches = [
    {
      id: 'bat-sis-01',
      facility_id: facilityId,
      batch_control_number: 'SIS-BAT-20261126-01',
      source_system: 'SIS_EHR',
      mapping_version_id: 'map-sis-240',
      mapping_version_tag: 'map-v2.4.0',
      payload_format: 'HL7_JSON',
      records_received: 42,
      records_accepted: 41,
      records_quarantined: 1,
      source_checksum: 'sha256_raw_sis_8812aa9901cc',
      batch_status: 'COMMITTED',
      ingested_by: 'sis.gateway@naplessurgery.com',
      sha256_batch_seal: computeSprProvenanceSeal({ batch: 'SIS-BAT-20261126-01', checksum: 'sha256_raw_sis_8812aa9901cc' }),
      created_at: '2026-11-26T06:30:00.000Z'
    },
    {
      id: 'bat-835-08',
      facility_id: facilityId,
      batch_control_number: 'EDI-BAT-20261126-08',
      source_system: 'CLEARINGHOUSE_EDI',
      mapping_version_id: 'map-835-192',
      mapping_version_tag: 'map-v1.9.2',
      payload_format: 'X12_835',
      records_received: 118,
      records_accepted: 118,
      records_quarantined: 0,
      source_checksum: 'sha256_raw_edi_9941bb7722dd',
      batch_status: 'COMMITTED',
      ingested_by: 'waystar.bot@naplessurgery.com',
      sha256_batch_seal: computeSprProvenanceSeal({ batch: 'EDI-BAT-20261126-08', checksum: 'sha256_raw_edi_9941bb7722dd' }),
      created_at: '2026-11-26T07:15:00.000Z'
    },
    {
      id: 'bat-inv-04',
      facility_id: facilityId,
      batch_control_number: 'INV-BAT-20261125-04',
      source_system: 'VENDOR_INVOICE',
      mapping_version_id: 'map-inv-150',
      mapping_version_tag: 'map-v1.5.0',
      payload_format: 'X12_810',
      records_received: 29,
      records_accepted: 28,
      records_quarantined: 1,
      source_checksum: 'sha256_raw_inv_7730cc4411ee',
      batch_status: 'COMMITTED',
      ingested_by: 'edi810.gateway@naplessurgery.com',
      sha256_batch_seal: computeSprProvenanceSeal({ batch: 'INV-BAT-20261125-04', checksum: 'sha256_raw_inv_7730cc4411ee' }),
      created_at: '2026-11-25T19:10:00.000Z'
    }
  ];

  const recordLineage = [
    {
      id: 'lin-501',
      facility_id: facilityId,
      lineage_code: 'SPR-LIN-501',
      target_entity_type: 'SURGICAL_CASE',
      target_record_id: 'CAS-20261126-104',
      source_system: 'SIS_EHR',
      source_record_id: 'SIS-ENC-998142',
      batch_id: 'bat-sis-01',
      batch_control_number: 'SIS-BAT-20261126-01',
      mapping_version_tag: 'map-v2.4.0',
      raw_payload_hash: 'sha256_raw_998142a',
      transformed_payload_hash: 'sha256_trf_104b',
      is_current_active: true,
      sha256_lineage_seal: computeSprProvenanceSeal({ code: 'SPR-LIN-501', target: 'CAS-20261126-104' }),
      created_at: '2026-11-26T06:31:00.000Z'
    },
    {
      id: 'lin-502',
      facility_id: facilityId,
      lineage_code: 'SPR-LIN-502',
      target_entity_type: 'CLAIM_REMIT',
      target_record_id: 'ERA-20261126-882',
      source_system: 'CLEARINGHOUSE_EDI',
      source_record_id: 'CLP-UHC-55219',
      batch_id: 'bat-835-08',
      batch_control_number: 'EDI-BAT-20261126-08',
      mapping_version_tag: 'map-v1.9.2',
      raw_payload_hash: 'sha256_raw_55219c',
      transformed_payload_hash: 'sha256_trf_882d',
      is_current_active: true,
      sha256_lineage_seal: computeSprProvenanceSeal({ code: 'SPR-LIN-502', target: 'ERA-20261126-882' }),
      created_at: '2026-11-26T07:16:00.000Z'
    },
    {
      id: 'lin-503',
      facility_id: facilityId,
      lineage_code: 'SPR-LIN-503',
      target_entity_type: 'VENDOR_INVOICE',
      target_record_id: 'GLD-INV-9001',
      source_system: 'VENDOR_INVOICE',
      source_record_id: 'inv-810-9910',
      batch_id: 'bat-inv-04',
      batch_control_number: 'INV-BAT-20261125-04',
      mapping_version_tag: 'map-v1.5.0',
      raw_payload_hash: 'sha256_raw_9910e',
      transformed_payload_hash: 'sha256_trf_9001f',
      is_current_active: true,
      sha256_lineage_seal: computeSprProvenanceSeal({ code: 'SPR-LIN-503', target: 'GLD-INV-9001' }),
      created_at: '2026-11-25T19:12:00.000Z'
    }
  ];

  // Build valid hash-chained seeded events
  const ev1Base = {
    id: 'ev-spr-1',
    facility_id: facilityId,
    event_seq: 1,
    lineage_id: 'lin-501',
    event_type: 'INGESTED',
    actor_email: 'sis.gateway@naplessurgery.com',
    actor_role: 'Ingestion Gateway',
    before_state_json: {},
    after_state_json: { case_id: 'CAS-20261126-104', status: 'INGESTED' },
    mapping_version_tag: 'map-v2.4.0',
    prev_chain_seal: GENESIS_CHAIN_SEAL,
    created_at: '2026-11-26T06:31:00.000Z'
  };
  ev1Base.sha256_event_seal = computeChainLinkSeal(facilityId, ev1Base);

  const ev2Base = {
    id: 'ev-spr-2',
    facility_id: facilityId,
    event_seq: 2,
    lineage_id: 'lin-501',
    event_type: 'TRANSFORMED',
    actor_email: 'data_steward@naplessurgery.com',
    actor_role: 'Data Operations Steward',
    before_state_json: { status: 'INGESTED' },
    after_state_json: { status: 'COMMITTED', primary_cpt: '29881' },
    mapping_version_tag: 'map-v2.4.0',
    prev_chain_seal: ev1Base.sha256_event_seal,
    created_at: '2026-11-26T06:32:00.000Z'
  };
  ev2Base.sha256_event_seal = computeChainLinkSeal(facilityId, ev2Base);

  const ev3Base = {
    id: 'ev-spr-3',
    facility_id: facilityId,
    event_seq: 3,
    lineage_id: 'lin-502',
    event_type: 'INGESTED',
    actor_email: 'waystar.bot@naplessurgery.com',
    actor_role: 'EDI Clearinghouse Bot',
    before_state_json: {},
    after_state_json: { era_id: 'ERA-20261126-882', paid_usd: 3180.50 },
    mapping_version_tag: 'map-v1.9.2',
    prev_chain_seal: ev2Base.sha256_event_seal,
    created_at: '2026-11-26T07:16:00.000Z'
  };
  ev3Base.sha256_event_seal = computeChainLinkSeal(facilityId, ev3Base);

  const ev4Base = {
    id: 'ev-spr-4',
    facility_id: facilityId,
    event_seq: 4,
    lineage_id: 'lin-503',
    event_type: 'MERGED_TO_GOLDEN',
    actor_email: 'dmr-auto-engine@naplessurgery.com',
    actor_role: 'System Matching Engine',
    before_state_json: { source_id: 'inv-810-9910' },
    after_state_json: { golden_code: 'GLD-INV-9001', total_usd: 4250.00 },
    mapping_version_tag: 'map-v1.5.0',
    prev_chain_seal: ev3Base.sha256_event_seal,
    created_at: '2026-11-25T19:12:00.000Z'
  };
  ev4Base.sha256_event_seal = computeChainLinkSeal(facilityId, ev4Base);

  const auditChain = [ev1Base, ev2Base, ev3Base, ev4Base];

  const verificationRuns = [
    {
      id: 'ver-run-01',
      facility_id: facilityId,
      run_code: 'SPR-VER-20261126-01',
      records_audited: 4,
      chain_breaks_detected: 0,
      orphaned_batches_detected: 0,
      reproducibility_rate: 100.00,
      executed_by: 'compliance@naplessurgery.com',
      sha256_sync_seal: computeSprProvenanceSeal({ run_code: 'SPR-VER-20261126-01', chain_breaks: 0 }),
      created_at: '2026-11-26T08:30:00.000Z'
    }
  ];

  return {
    config,
    sourceSystems,
    mappingVersions,
    ingestionBatches,
    recordLineage,
    auditChain,
    verificationRuns
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

export async function getSprConfig(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return {
    ...store.config,
    client_secret_encrypted: maskSprSecret(store.config.client_secret_encrypted)
  };
}

export async function updateSprConfig(facilityInput, updates = {}) {
  const store = ensureFacilityStore(facilityInput);
  const nextRetention = Number(updates.retention_days ?? store.config.retention_days);
  if (!Number.isFinite(nextRetention) || nextRetention < HIPAA_RETENTION_DAYS) {
    throw new Error(`ERR_SPR_RETENTION_BELOW_MINIMUM: Audit retention cannot be less than ${HIPAA_RETENTION_DAYS} days (7 years HIPAA)`);
  }

  store.config = {
    ...store.config,
    retention_days: nextRetention,
    require_batch_manifest_seal: updates.require_batch_manifest_seal ?? store.config.require_batch_manifest_seal,
    require_mapping_version_tag: updates.require_mapping_version_tag ?? store.config.require_mapping_version_tag,
    enforce_immutable_append_only: updates.enforce_immutable_append_only ?? store.config.enforce_immutable_append_only,
    updated_at: new Date().toISOString()
  };

  return getSprConfig(facilityInput);
}

export async function getSprTelemetry(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  const latestRun = store.verificationRuns[0];
  return {
    facility_id: store.config.facility_id,
    retention_days: store.config.retention_days,
    tracked_lineage_count: store.recordLineage.filter(l => l.is_current_active).length,
    active_mapping_versions_count: store.mappingVersions.filter(m => m.is_active).length,
    ingestion_batches_count: store.ingestionBatches.length,
    audit_chain_events_count: store.auditChain.length,
    chain_reproducibility_rate: latestRun ? latestRun.reproducibility_rate : 100.00,
    latest_sync_seal: latestRun ? latestRun.sha256_sync_seal : computeSprProvenanceSeal(store.config),
    sync_status: store.config.sync_status,
    health_status: store.config.health_status
  };
}

export async function getSprSourceSystems(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return [...store.sourceSystems];
}

export async function getSprMappingVersions(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return [...store.mappingVersions];
}

export async function getSprIngestionBatches(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return [...store.ingestionBatches];
}

export async function getSprRecordLineage(facilityInput, filters = {}) {
  const store = ensureFacilityStore(facilityInput);
  let results = [...store.recordLineage];
  if (filters.source_system && filters.source_system !== 'ALL') {
    results = results.filter(l => l.source_system === filters.source_system);
  }
  if (filters.target_entity_type && filters.target_entity_type !== 'ALL') {
    results = results.filter(l => l.target_entity_type === filters.target_entity_type);
  }
  return results;
}

export async function getSprAuditChain(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return [...store.auditChain].sort((a, b) => Number(a.event_seq) - Number(b.event_seq));
}

export async function getSprVerificationRuns(facilityInput) {
  const store = ensureFacilityStore(facilityInput);
  return [...store.verificationRuns];
}

// ==============================================================================
// Authoritative Mutations & End-to-End Lineage Tracer
// ==============================================================================

/**
 * Publishes a new SemVer schema mapping version and retires the prior active
 * version for the same (source_system, entity_type) cleanly.
 */
export async function registerSourceMappingVersion(facilityInput, payload = {}) {
  const store = ensureFacilityStore(facilityInput);
  const { source_system, entity_type, version_tag, field_transform_spec_json, approved_by } = payload;

  if (!CANONICAL_SOURCE_SYSTEMS.includes(source_system)) {
    throw new Error(`ERR_SPR_INVALID_SOURCE: Unsupported source system ${source_system}`);
  }
  validateMappingVersionTag(version_tag);

  const now = new Date().toISOString();

  // Retire prior active version for the same source + entity
  for (const m of store.mappingVersions) {
    if (m.source_system === source_system && m.entity_type === entity_type && m.is_active) {
      m.is_active = false;
      m.effective_to = now;
    }
  }

  const mappingCode = `MAP-${source_system.slice(0, 3)}-${Date.now().toString().slice(-4)}`;
  const specSeal = computeSprProvenanceSeal({
    facility_id: store.config.facility_id,
    source_system,
    entity_type,
    version_tag,
    field_transform_spec_json
  });

  const newMapping = {
    id: `map-${Date.now()}`,
    facility_id: store.config.facility_id,
    mapping_code: mappingCode,
    source_system,
    entity_type: entity_type || 'GENERAL_ENTITY',
    version_tag,
    field_transform_spec_json: field_transform_spec_json || {},
    effective_from: now,
    effective_to: null,
    is_active: true,
    approved_by: approved_by || 'data_steward@naplessurgery.com',
    sha256_spec_seal: specSeal
  };

  store.mappingVersions.unshift(newMapping);

  // Sync active schema version marker on registered source system
  const sys = store.sourceSystems.find(s => s.source_system === source_system);
  if (sys) sys.active_schema_version = version_tag;

  return { ...newMapping };
}

/**
 * Records a mandatory provenance tuple for an ingested record and appends
 * a tamper-evident hash-chained event to `spr_audit_chain`.
 */
export async function recordIngestionProvenance(facilityInput, payload = {}) {
  const store = ensureFacilityStore(facilityInput);
  const {
    target_entity_type,
    target_record_id,
    source_system,
    source_record_id,
    batch_control_number,
    mapping_version_tag,
    actor_email,
    actor_role,
    before_state_json,
    after_state_json,
    event_type
  } = payload;

  if (!source_system || !source_record_id || !batch_control_number || !mapping_version_tag || !target_record_id) {
    throw new Error(
      'ERR_SPR_MISSING_PROVENANCE: target_record_id, source_system, source_record_id, batch_control_number, and mapping_version_tag are mandatory'
    );
  }
  validateMappingVersionTag(mapping_version_tag);

  const now = new Date().toISOString();

  // Ensure batch envelope exists
  let batch = store.ingestionBatches.find(b => b.batch_control_number === batch_control_number);
  if (!batch) {
    batch = {
      id: `bat-${Date.now()}`,
      facility_id: store.config.facility_id,
      batch_control_number,
      source_system,
      mapping_version_id: null,
      mapping_version_tag,
      payload_format: 'JSON',
      records_received: 1,
      records_accepted: 1,
      records_quarantined: 0,
      source_checksum: computeSprProvenanceSeal({ batch_control_number, source_system }),
      batch_status: 'COMMITTED',
      ingested_by: actor_email || 'ingestion.bot@naplessurgery.com',
      sha256_batch_seal: computeSprProvenanceSeal({ batch_control_number, source_system, mapping_version_tag, now }),
      created_at: now
    };
    store.ingestionBatches.unshift(batch);
  }

  const lineageId = `lin-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const lineageCode = `SPR-LIN-${Math.floor(1000 + Math.random() * 8999)}`;
  const lineageEntry = {
    id: lineageId,
    facility_id: store.config.facility_id,
    lineage_code: lineageCode,
    target_entity_type: target_entity_type || 'SURGICAL_CASE',
    target_record_id,
    source_system,
    source_record_id,
    batch_id: batch.id,
    batch_control_number,
    mapping_version_tag,
    raw_payload_hash: computeSprProvenanceSeal({ source_record_id, raw: true }),
    transformed_payload_hash: computeSprProvenanceSeal({ target_record_id, after_state_json }),
    is_current_active: true,
    sha256_lineage_seal: computeSprProvenanceSeal({ lineageCode, source_record_id, batch_control_number, mapping_version_tag }),
    created_at: now
  };
  store.recordLineage.unshift(lineageEntry);

  const sortedChain = [...store.auditChain].sort((a, b) => Number(a.event_seq) - Number(b.event_seq));
  const lastEvent = sortedChain[sortedChain.length - 1];
  const nextSeq = lastEvent ? Number(lastEvent.event_seq) + 1 : 1;
  const prevSeal = lastEvent ? lastEvent.sha256_event_seal : GENESIS_CHAIN_SEAL;

  const newEvent = {
    id: `ev-spr-${Date.now()}-${nextSeq}`,
    facility_id: store.config.facility_id,
    event_seq: nextSeq,
    lineage_id: lineageId,
    event_type: event_type || 'INGESTED',
    actor_email: actor_email || 'ingestion.bot@naplessurgery.com',
    actor_role: actor_role || 'Ingestion Gateway',
    before_state_json: before_state_json || {},
    after_state_json: after_state_json || { target_record_id, source_record_id },
    mapping_version_tag,
    prev_chain_seal: prevSeal,
    created_at: now
  };
  newEvent.sha256_event_seal = computeChainLinkSeal(store.config.facility_id, newEvent);
  store.auditChain.push(newEvent);

  return {
    lineage: { ...lineageEntry },
    batch: { ...batch },
    chain_event: { ...newEvent }
  };
}

/**
 * Traces end-to-end provenance for any target_record_id, lineage_code, or lineage UUID.
 */
export async function traceRecordFullLineage(facilityInput, identifier) {
  const store = ensureFacilityStore(facilityInput);
  const lineage = store.recordLineage.find(
    l => l.id === identifier || l.lineage_code === identifier || l.target_record_id === identifier
  );
  if (!lineage) {
    throw new Error(`ERR_SPR_LINEAGE_NOT_FOUND: No provenance lineage found for "${identifier}"`);
  }

  const batch = store.ingestionBatches.find(b => b.batch_control_number === lineage.batch_control_number) || null;
  const mapping = store.mappingVersions.find(
    m => m.source_system === lineage.source_system && m.version_tag === lineage.mapping_version_tag
  ) || null;
  const events = store.auditChain
    .filter(e => e.lineage_id === lineage.id)
    .sort((a, b) => Number(a.event_seq) - Number(b.event_seq));

  return {
    lineage: { ...lineage },
    source_system: lineage.source_system,
    source_record_id: lineage.source_record_id,
    batch_envelope: batch ? { ...batch } : null,
    mapping_version: mapping ? { ...mapping } : null,
    audit_events: events
  };
}

/**
 * Executes a full cryptographic verification pass across the facility's hash chain
 * and batch references, logging an immutable verification attestation run.
 */
export async function verifyProvenanceChainIntegrity(facilityInput, executedBy = 'compliance@naplessurgery.com') {
  const store = ensureFacilityStore(facilityInput);
  const chainReport = validateProvenanceChain(store.config.facility_id, store.auditChain);

  const batchSet = new Set(store.ingestionBatches.map(b => b.batch_control_number));
  const orphanedBatches = store.recordLineage.filter(l => !batchSet.has(l.batch_control_number)).length;

  const totalChecked = Math.max(chainReport.total_events_checked, 1);
  const reproducibilityRate = chainReport.chain_breaks_detected === 0 && orphanedBatches === 0
    ? 100.00
    : Number((((totalChecked - chainReport.chain_breaks_detected) / totalChecked) * 100).toFixed(2));

  const runCode = `SPR-VER-${Date.now()}`;
  const now = new Date().toISOString();
  const seal = computeSprProvenanceSeal({
    facility_id: store.config.facility_id,
    runCode,
    chain_breaks_detected: chainReport.chain_breaks_detected,
    orphaned_batches: orphanedBatches,
    reproducibilityRate,
    now
  });

  const runRecord = {
    id: `ver-${Date.now()}`,
    facility_id: store.config.facility_id,
    run_code: runCode,
    records_audited: chainReport.total_events_checked,
    chain_breaks_detected: chainReport.chain_breaks_detected,
    orphaned_batches_detected: orphanedBatches,
    reproducibility_rate: reproducibilityRate,
    executed_by: executedBy,
    sha256_sync_seal: seal,
    created_at: now
  };

  store.verificationRuns.unshift(runRecord);
  return {
    ...runRecord,
    intact: chainReport.intact && orphanedBatches === 0,
    breaks: chainReport.breaks
  };
}

export default {
  NAPLES_FACILITY_ID,
  HIPAA_RETENTION_DAYS,
  GENESIS_CHAIN_SEAL,
  CANONICAL_SOURCE_SYSTEMS,
  CANONICAL_BATCH_STATUSES,
  CANONICAL_LINEAGE_EVENT_TYPES,
  normalizeFacilityId,
  computeSprProvenanceSeal,
  maskSprSecret,
  validateMappingVersionTag,
  computeChainLinkSeal,
  validateProvenanceChain,
  getSprConfig,
  updateSprConfig,
  getSprTelemetry,
  getSprSourceSystems,
  getSprMappingVersions,
  getSprIngestionBatches,
  getSprRecordLineage,
  getSprAuditChain,
  getSprVerificationRuns,
  registerSourceMappingVersion,
  recordIngestionProvenance,
  traceRecordFullLineage,
  verifyProvenanceChainIntegrity
};
