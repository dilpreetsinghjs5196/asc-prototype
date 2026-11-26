# G5 SOURCE PROVENANCE

## Purpose
Phase G5 establishes the enterprise **Source Provenance, Batch Envelope Lineage, Mapping Versioning, and Hash-Chained Audit Governance** layer for Module 16 (Enterprise Data Quality Governance) in ASCANALYST. Every financial metric, surgical encounter, claim, inventory consumption, and journal entry must remain cryptographically traceable back to its originating external source system (`SIS_EHR`, `HST_EHR`, `CLEARINGHOUSE_EDI`, `ACCOUNTING_GL`, `PAYROLL_WFM`, `INVENTORY_POU`, `VENDOR_INVOICE`, `EXCEL_CSV`), originating `source_record_id`, ingestion `batch_control_number`, exact schema `mapping_version_tag`, and immutable operator/system audit chain.

---

## Scope
- Define production requirements for **Source Provenance (Phase G5)**:
  1. **Tenant Provenance Governance Config (`spr_configs`)**: Retention horizon (`2555` days / 7-year HIPAA & CMS audit compliance), mandatory batch seal/mapping version enforcement toggles, masked engine secret (`spr_sec_****_...`), and health status.
  2. **Source System Catalog (`spr_source_systems`)**: Authoritative registry of connected EHR, Clearinghouse, ERP, WFM, POU, AP, and Spreadsheet connectors with active schema versions and trust tiers.
  3. **Versioned Schema Mapping Registry (`spr_mapping_versions`)**: SemVer-tagged transformation specs (`map-vX.Y.Z`) with effective dates (`effective_from`, `effective_to`), approver metadata, and SHA-256 spec seals.
  4. **Ingestion Batch Envelopes (`spr_ingestion_batches`)**: Batch control numbers, format metadata, accepted/quarantined counts, source checksums, and lifecycle states (`INGESTED`, `VALIDATED`, `COMMITTED`, `SUPERSEDED`, `ROLLED_BACK`).
  5. **Record Lineage Map (`spr_record_lineage`)**: Direct tuple linking `target_entity_type` + `target_record_id` to `(source_system, source_record_id, batch_control_number, mapping_version_tag)` with raw and transformed payload hashes.
  6. **Hash-Chained Audit Ledger (`spr_audit_chain`) & Verification Attestations (`spr_verification_runs`)**: Append-only event sequence linking `prev_chain_seal` -> `sha256_event_seal` (`sha256_spr_...`) plus batch chain verification runs.
- Preserve full compatibility with existing `src/services/calculationVersioningService.js`, `src/services/integrationFrameworkService.js`, and G0–G4 governance tables.

---

## Current State

| Component | Status | Classification | Description |
| :--- | :--- | :--- | :--- |
| `src/services/calculationVersioningService.js` | Exists | **KEEP** | Manages financial calculation formula versions and period freezes (Phase 77). Complementary to G5 source ingestion provenance. |
| `src/services/integrationFrameworkService.js` | Exists | **KEEP** | Tracks connector health and sync jobs (Phase F0). Provides upstream batch metadata ingested into G5 envelopes. |
| `public.*_provenance_ledger` (F9–G4 module logs) | Fragmented | **KEEP / FEDERATE** | Individual phase tables record phase-local SHA-256 seals (`sha256_ieq_`, `sha256_dmr_`), but lack a unified record-to-batch-to-mapping tracer across systems. |
| `public.spr_*` (7 tables + `vw_spr_telemetry`) | Non-existent | **MISSING** | Unified source registry, SemVer mapping registry, batch envelopes, record lineage, hash-chained audit ledger, and chain verification runs. |
| `src/services/sourceProvenanceService.js` & facade | Non-existent | **MISSING** | Provenance recorder, lineage tracer, SemVer validator, and hash-chain integrity verifier. |
| `src/components/SourceProvenanceView.jsx` | Non-existent | **MISSING** | Interactive record lineage breadcrumb tracer, mapping version publisher, and hash-chain auditor UI. |

---

## Target State
1. **End-to-End Traceability Without Blind Spots**:
   - Querying any surgical case, claim, vendor invoice, or journal entry returns its exact upstream tuple: `source_system`, `source_record_id`, `batch_control_number`, `mapping_version_tag`, `raw_payload_hash`, `transformed_payload_hash`, and chained `sha256_event_seal`.
2. **Deterministic Mapping Versioning**:
   - Every transformation spec carries a strict `map-vMAJOR.MINOR.PATCH` tag (`validateMappingVersionTag`). Publishing a new version cleanly retires the previous version's `effective_to` timestamp without invalidating historical lineage rows that used prior mapping versions.
3. **Cryptographic Chain Tamper Evidence**:
   - Every `spr_audit_chain` event computes its `sha256_spr_` seal over `(facility_id, event_seq, lineage_id, event_type, mapping_version_tag, before_state_json, after_state_json, prev_chain_seal)`. Any missing link or hash mismatch causes `validateProvenanceChain` / `verifyProvenanceChainIntegrity` to report exact broken sequence IDs.

---

## Data Model / Schema
Defined in `supabase/migrations/137_source_provenance.sql` (and rollback `137_source_provenance_down.sql`):
1. `public.spr_configs`: `retention_days INT DEFAULT 2555`, `require_batch_manifest_seal`, `require_mapping_version_tag`, `enforce_immutable_append_only`, `client_secret_encrypted`, `sync_status`, `health_status`.
2. `public.spr_source_systems`: `source_system`, `connector_code`, `display_name`, `source_priority_rank`, `active_schema_version`, `trust_tier`, `last_batch_control_number`.
3. `public.spr_mapping_versions`: `mapping_code`, `source_system`, `entity_type`, `version_tag`, `field_transform_spec_json`, `effective_from`, `effective_to`, `is_active`, `approved_by`, `sha256_spec_seal VARCHAR(128)`.
4. `public.spr_ingestion_batches`: `batch_control_number`, `source_system`, `mapping_version_id`, `mapping_version_tag`, `payload_format`, `records_received`, `records_accepted`, `records_quarantined`, `source_checksum`, `batch_status`, `ingested_by`, `sha256_batch_seal VARCHAR(128)`.
5. `public.spr_record_lineage`: `lineage_code`, `target_entity_type`, `target_record_id`, `source_system`, `source_record_id`, `batch_id`, `batch_control_number`, `mapping_version_tag`, `raw_payload_hash`, `transformed_payload_hash`, `is_current_active`, `sha256_lineage_seal VARCHAR(128)`.
6. `public.spr_audit_chain`: `event_seq`, `lineage_id`, `event_type`, `actor_email`, `actor_role`, `before_state_json`, `after_state_json`, `mapping_version_tag`, `prev_chain_seal`, `sha256_event_seal VARCHAR(128)`.
7. `public.spr_verification_runs`: `run_code`, `records_audited`, `chain_breaks_detected`, `orphaned_batches_detected`, `reproducibility_rate`, `executed_by`, `sha256_sync_seal VARCHAR(128)`.
- Telemetry view: `public.vw_spr_telemetry`.
- Tenant isolation enforced across all 7 tables via RLS policies using `app.current_facility_id`.

---

## Business Rules

### Rule 1: Mandatory Provenance Tuple on Ingestion
Recording lineage rejects any payload lacking `source_system`, `source_record_id`, `batch_control_number`, or `mapping_version_tag` (`ERR_SPR_MISSING_PROVENANCE`).

### Rule 2: Strict SemVer Mapping Version Tagging
Mapping version tags must match `^map-v\d+\.\d+\.\d+$` (`ERR_SPR_INVALID_MAPPING_VERSION`). Publishing a new version sets `effective_to = NOW()` and `is_active = FALSE` on the superseded mapping for `(facility_id, source_system, entity_type)`.

### Rule 3: Minimum 7-Year Healthcare Audit Retention
`retention_days` cannot be configured below `2555` days (7 years) in compliance with HIPAA/CMS financial recordkeeping rules (`ERR_SPR_RETENTION_BELOW_MINIMUM`).

### Rule 4: Immutable Chained Audit Events
Every lineage write appends a hash-chained `spr_audit_chain` entry referencing the prior event's `sha256_event_seal` (`GENESIS_0000...` for sequence 1). Rewriting or deleting intermediate links is prohibited and surfaced immediately by `verifyProvenanceChainIntegrity`.

### Rule 5: Cryptographic SHA-256 Provenance Seals
All specs, batches, lineage maps, chain events, and verification runs receive 64-character `sha256_spr_` + 53 hex character SHA-256 digests.

---

## Permissions / Security
- Tenant isolation enforced via `app.current_facility_id` RLS policies across all 7 tables.
- Secrets masked cleanly as `spr_sec_****_...`.
- RBAC Matrix:
  - `Data Operations Steward` / `Facility Administrator`: Publish mapping versions, execute provenance integrity audits, configure retention >=2555 days.
  - `Compliance Officer` / `Auditor` / `Controller`: Inspect end-to-end lineage traces, batch checksums, mapping version diffs, and hash-chain verification reports.
  - `AI Analyst` / Tools: Strictly read-only access under identical facility RLS and RBAC checks; cannot mutate `spr_audit_chain` or lower retention bounds.

---

## API / Service Requirements
Implemented in `src/services/sourceProvenanceService.js` and re-exported via `src/lib/sourceProvenanceService.js`:
- `normalizeFacilityId(facilityInput)`
- `computeSprProvenanceSeal(payload)`
- `maskSprSecret(rawSecret)`
- `validateMappingVersionTag(versionTag)`
- `validateProvenanceChain(chainEvents)`
- `getSprConfig(facilityInput)` / `updateSprConfig(facilityInput, updates)`
- `getSprTelemetry(facilityInput)`
- `getSprSourceSystems(facilityInput)`
- `getSprMappingVersions(facilityInput)`
- `getSprIngestionBatches(facilityInput)`
- `getSprRecordLineage(facilityInput, filters)`
- `getSprAuditChain(facilityInput)`
- `getSprVerificationRuns(facilityInput)`
- `registerSourceMappingVersion(facilityInput, payload)`
- `recordIngestionProvenance(facilityInput, payload)`
- `traceRecordFullLineage(facilityInput, targetIdOrCode)`
- `verifyProvenanceChainIntegrity(facilityInput, executedBy)`

---

## UI / Workflow Requirements
Implemented in `src/components/SourceProvenanceView.jsx` & `SourceProvenanceView.css`:
- **4-Card Telemetry Ribbon**: Tracked Lineage Records, Active Mapping Versions, Audited Batch Envelopes, and Hash-Chain Reproducibility Rate + latest SHA-256 seal.
- **4 Subtabs**:
  1. *Record Lineage Tracer*: Search/select any record to inspect its visual Source -> Batch -> Mapping Version -> Target Entity lineage flow plus chained event timeline.
  2. *Ingestion Batches*: Batch control envelopes, accepted vs. quarantined row counts, source format, and batch SHA-256 seal.
  3. *Mapping Versions*: SemVer `map-vX.Y.Z` transform specs, effective windows, and *Publish Mapping Version* modal.
  4. *Hash Chain & Integrity Runs*: Chained cryptographic event table (`prev_chain_seal` -> `sha256_event_seal`) and *Run Integrity Audit* button.

---

## Audit / Provenance
Hash-chained `spr_audit_chain` preserves `event_seq`, `lineage_id`, `event_type`, `actor_email`, `actor_role`, `before_state_json`, `after_state_json`, `mapping_version_tag`, `prev_chain_seal`, `sha256_event_seal`, and timestamp for every provenance event.

---

## QA / Test Cases
Defined in `tests/source-provenance.test.js` (12 automated test suites):
1. Facility telemetry accuracy & 64-char `sha256_spr_` seal verification.
2. Facility UUID alias resolution across strings and objects.
3. Config retrieval, secret masking, and >=2555-day HIPAA retention guardrail.
4. SemVer mapping version tag validator (`map-vMAJOR.MINOR.PATCH`).
5. Publishing a new mapping version cleanly retires prior active version with `effective_to`.
6. Recording ingestion provenance enforces mandatory tuple (`ERR_SPR_MISSING_PROVENANCE`) and appends hash-chained audit event.
7. `traceRecordFullLineage` resolves source system, source record ID, batch envelope, mapping version, and chronological event chain.
8. `validateProvenanceChain` passes intact chains and detects broken `prev_chain_seal` tampering deterministically.
9. `verifyProvenanceChainIntegrity` executes full audit verification run with 64-char SHA-256 seal.
10. Dual facade parity between `src/services/sourceProvenanceService.js` and `src/lib/sourceProvenanceService.js`.
11. Migration 137 UP/DOWN SQL structural integrity (7 tables, view, RLS, idempotent seeds, clean teardown).
12. Strict zero prohibited color tokens (`purple`, `violet`, `indigo`, `magenta`, `fuchsia`) + `App.jsx` wiring.

---

## Acceptance Criteria
- Production Vite build (`npm run build`) and ESLint pass cleanly.
- Full test suite across Modules F0–F9, G0–G5, and Phase 76 passes with zero failures.
- Reproducible chain hashes and strict tenant isolation verified.
- Zero prohibited color tokens.

---

## Dependencies
- Upstream Modules: F0 (`integrationFrameworkService`), G0 (`dataQualityFrameworkService`), G3 (`importExceptionQueueService`), G4 (`duplicateMatchingService`), Phase 77 (`calculationVersioningService`).

---

## Definition of Done
Complete when Migration 137 UP/DOWN SQL, `sourceProvenanceService.js` + `src/lib` facade, `SourceProvenanceView.jsx`/`.css`, `src/App.jsx` tab wiring, 12/12 G5 tests, full regression suite, ESLint, `npm run build`, and specification updates are verified and committed to `data-quality-works`.

---

## Implementation Notes
- **Commit Target Branch:** `data-quality-works`
- **Database Migration:** `supabase/migrations/137_source_provenance.sql` & `137_source_provenance_down.sql`
- **Service & Facade:** `src/services/sourceProvenanceService.js` & `src/lib/sourceProvenanceService.js`
- **UI & Shell:** `src/components/SourceProvenanceView.jsx`, `src/components/SourceProvenanceView.css`, `src/App.jsx` (`source_provenance` tab with `History` icon)
- **Verification Test Suite:** `tests/source-provenance.test.js`
