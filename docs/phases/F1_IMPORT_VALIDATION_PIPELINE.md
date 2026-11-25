# F1 IMPORT VALIDATION PIPELINE

## Purpose
The Import Validation Pipeline defines the core data ingestion, cleansing, entity resolution, and governance engine for Phase 15 (Enterprise Healthcare Integrations). Healthcare data originating from EHRs/PMS (HST Pathways, SIS, Epic OpTime), Clearinghouses (Waystar, Availity), and Materials ERPs (Medline, McKesson) is inherently heterogeneous, error-prone, and prone to duplicates. 

This specification establishes an authoritative 6-stage deterministic pipeline:
$$\text{Import} \longrightarrow \text{Validate} \longrightarrow \text{Normalize} \longrightarrow \text{Match} \longrightarrow \text{Exception} \longrightarrow \text{Commit}$$

The pipeline guarantees that unvalidated, duplicate, or malformed data is quarantined in an auditable exception workqueue, preventing corrupted records from entering production analytical and financial ledgers, while maintaining strict facility tenancy, multi-protocol interoperability, and cryptographic commit seals.

---

## Scope
- Define production requirements for the 6-stage import lifecycle:
  1. **Import (Staging)**: Raw payload capture, buffer persistence, and SHA-256 ingress checksum generation.
  2. **Validate (Syntactic & Semantic)**: Rule-based validation checking NPI formats (Luhn verification), date boundaries, CPT/HCPCS syntax, and non-negative currency amounts.
  3. **Normalize (Standardization)**: ISO-8601 timestamps, canonical payer alias dictionary, CPT code standard formatting, currency rounding.
  4. **Match (Entity Resolution)**: Deterministic 3-tier matching engine resolving records to existing surgical cases, patient master indices, and claims.
  5. **Exception (Quarantine & Workqueue)**: Isolation of discrepancies into an administrative resolution queue with override, remap, and reject capabilities.
  6. **Commit (Atomic Transaction)**: Cryptographically verified write to production domain tables with rollback protection.
- Enforce organization and facility tenancy (`facility_id`), Role-Based Access Control (RBAC), and immutable audit provenance.
- Support real-time pipeline telemetry, manual exception resolution actions, and reproducible calculation rules.

---

## Current State
Document what exists today in the repository/database before implementation.

| Component | Status | Description |
| :--- | :--- | :--- |
| `src/services/integrationFrameworkService.js` | **KEEP** | Enterprise connector registry, batch scheduling, and protocol definitions (Phase F0). |
| `src/services/edi837IngestionService.js` | **REFACTOR** | Static parser stub for 837 claims without multi-stage exception quarantine or deterministic matching. |
| `src/services/edi835RemittanceService.js` | **REFACTOR** | 835 ERA parser lacking canonical entity resolution and rollback transactional commits. |
| `public.import_pipeline_batches` | **MISSING** | Batch execution table tracking 6-stage pipeline progress, stage latencies, and record throughput. |
| `public.import_staged_records` | **MISSING** | Staging buffer holding raw and transformed records across pipeline lifecycle stages. |
| `public.import_validation_rules` | **MISSING** | Configurable validation rule definitions with rule codes, categories, severities, and failure actions. |
| `public.import_exceptions` | **MISSING** | Workqueue of quarantined discrepancies requiring administrative resolution before commit. |
| `public.import_provenance_audit` | **MISSING** | Immutable cryptographic audit ledger recording commit events, user attributions, and SHA-256 seals. |
| `src/services/importValidationService.js` | **MISSING** | Core calculation service orchestrating the 6 pipeline stages, matching heuristics, and exception workflows. |
| `src/components/ImportValidationView.jsx` | **MISSING** | Interactive administrative dashboard displaying the visual pipeline stepper, exception workqueue, and rule matrix. |

---

## Target State
1. **6-Stage Deterministic Pipeline**:
   - **Stage 1 (Import)**: Ingests raw data payloads from Phase F0 connectors. Generates payload SHA-256 digest and stores raw JSON in `import_staged_records` with status `STAGED`.
   - **Stage 2 (Validate)**: Evaluates incoming records against syntactic and semantic rules. Records failing critical rules transition to `EXCEPTION`; passing records transition to `VALIDATED`.
   - **Stage 3 (Normalize)**: Applies deterministic canonicalization (dates to `YYYY-MM-DD`, phone to E.164, payer aliases to standard names, currency rounded to 2 decimals). Transitions to `NORMALIZED`.
   - **Stage 4 (Match)**: Executes 3-tier deterministic matching algorithm against platform records (`surgical_cases`, `patients`, `remittance_claims`). Classifies as `EXACT_MATCH`, `NEW_RECORD`, `POTENTIAL_DUPLICATE`, or `CONFLICT`.
   - **Stage 5 (Exception)**: Quarantines records flagged with validation failures or match conflicts. Provides human-in-the-loop resolution actions: `OVERRIDE_AND_COMMIT`, `REMAP_FIELD`, or `REJECT`.
   - **Stage 6 (Commit)**: Atomically writes clean records to canonical destination tables (`surgical_cases`, `claims`, `case_costs`). Writes an immutable cryptographic commit record to `import_provenance_audit`.
2. **Deterministic Matching Hierarchy**:
   - **Tier 1 (Exact Primary Key)**: Source external ID matches existing `external_id` or `case_number`.
   - **Tier 2 (Composite Clinical Key)**: Match on `facility_id` + `patient_mrn` + `date_of_service` + `surgeon_npi` + `primary_cpt`.
   - **Tier 3 (Fuzzy Demographic Key)**: Match on `patient_last_name` + `patient_dob` + `date_of_service` ($\pm 1$ day) with confidence score threshold $\ge 85\%$.
3. **Exception Workqueue**:
   - Rich filtering by severity (`CRITICAL`, `WARNING`), category (`SCHEMA_ERROR`, `UNMAPPED_PAYER`, `INVALID_NPI`, `DUPLICATE_SUSPECT`), and source connector.
   - Inline field remapping, manual data corrections, and batch override with audit reasons.
4. **Audit & Cryptographic Sealing**:
   - Every committed batch produces a 64-character SHA-256 cryptographic audit seal capturing the commit timestamp, user ID, record count, and transformed hash.

---

## Data Model / Schema
Database tables, indexes, RLS policies, and views defined in `supabase/migrations/123_import_validation_pipeline.sql`:

```sql
-- 1. Pipeline Execution Batches Table
CREATE TABLE IF NOT EXISTS public.import_pipeline_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_code VARCHAR(32) NOT NULL,
    source_connector_code VARCHAR(32) NOT NULL,
    source_connector_name VARCHAR(128) NOT NULL,
    current_stage VARCHAR(24) NOT NULL DEFAULT 'IMPORT' CHECK (
        current_stage IN ('IMPORT', 'VALIDATE', 'NORMALIZE', 'MATCH', 'EXCEPTION', 'COMMIT', 'COMPLETED', 'FAILED')
    ),
    status VARCHAR(24) NOT NULL DEFAULT 'PROCESSING' CHECK (
        status IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_EXCEPTIONS', 'FAILED', 'CANCELLED')
    ),
    records_staged INT NOT NULL DEFAULT 0,
    records_validated INT NOT NULL DEFAULT 0,
    records_normalized INT NOT NULL DEFAULT 0,
    records_matched INT NOT NULL DEFAULT 0,
    records_quarantined INT NOT NULL DEFAULT 0,
    records_committed INT NOT NULL DEFAULT 0,
    records_rejected INT NOT NULL DEFAULT 0,
    total_duration_ms INT NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_pipeline_batch UNIQUE (facility_id, batch_code)
);

-- 2. Staged Records Buffer Table
CREATE TABLE IF NOT EXISTS public.import_staged_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.import_pipeline_batches(id) ON DELETE CASCADE,
    source_record_id VARCHAR(64) NOT NULL,
    record_type VARCHAR(32) NOT NULL CHECK (
        record_type IN ('SURGICAL_CASE', 'CLAIM_837', 'REMITTANCE_835', 'IMPLANT_PURCHASE', 'PATIENT_DEMOGRAPHIC')
    ),
    stage VARCHAR(24) NOT NULL DEFAULT 'STAGED' CHECK (
        stage IN ('STAGED', 'VALIDATED', 'NORMALIZED', 'MATCHED', 'EXCEPTION', 'COMMITTED', 'REJECTED')
    ),
    raw_payload JSONB NOT NULL,
    normalized_payload JSONB,
    match_status VARCHAR(24) DEFAULT 'PENDING' CHECK (
        match_status IN ('PENDING', 'EXACT_MATCH', 'COMPOSITE_MATCH', 'NEW_RECORD', 'DUPLICATE_SUSPECT', 'CONFLICT')
    ),
    matched_target_id UUID,
    payload_hash VARCHAR(64) NOT NULL,
    error_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Validation Rules Registry Table
CREATE TABLE IF NOT EXISTS public.import_validation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_code VARCHAR(32) NOT NULL UNIQUE,
    rule_name VARCHAR(128) NOT NULL,
    category VARCHAR(32) NOT NULL CHECK (
        category IN ('SYNTACTIC', 'SEMANTIC', 'REFERENTIAL', 'FINANCIAL', 'CLINICAL')
    ),
    severity VARCHAR(16) NOT NULL DEFAULT 'CRITICAL' CHECK (
        severity IN ('CRITICAL', 'WARNING', 'INFO')
    ),
    target_record_type VARCHAR(32) NOT NULL,
    target_field VARCHAR(64) NOT NULL,
    validation_logic VARCHAR(128) NOT NULL,
    failure_message TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Import Exceptions Workqueue Table
CREATE TABLE IF NOT EXISTS public.import_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.import_pipeline_batches(id) ON DELETE CASCADE,
    staged_record_id UUID NOT NULL REFERENCES public.import_staged_records(id) ON DELETE CASCADE,
    rule_code VARCHAR(32) NOT NULL,
    severity VARCHAR(16) NOT NULL DEFAULT 'CRITICAL' CHECK (
        severity IN ('CRITICAL', 'WARNING', 'INFO')
    ),
    exception_category VARCHAR(32) NOT NULL CHECK (
        exception_category IN ('SCHEMA_ERROR', 'UNRECOGNIZED_CODE', 'UNMATCHED_SURGEON', 'UNMAPPED_PAYER', 'DUPLICATE_SUSPECT', 'FINANCIAL_IMBALANCE')
    ),
    field_name VARCHAR(64),
    source_value TEXT,
    suggested_value TEXT,
    resolution_status VARCHAR(24) NOT NULL DEFAULT 'PENDING' CHECK (
        resolution_status IN ('PENDING', 'RESOLVED', 'REJECTED', 'IGNORED')
    ),
    resolution_action VARCHAR(32) CHECK (
        resolution_action IN ('OVERRIDE_AND_COMMIT', 'REMAP_FIELD', 'REJECT_RECORD', 'MERGE_RECORD')
    ),
    resolution_notes TEXT,
    resolved_by UUID,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Import Provenance Audit Table
CREATE TABLE IF NOT EXISTS public.import_provenance_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.import_pipeline_batches(id) ON DELETE CASCADE,
    staged_record_id UUID NOT NULL REFERENCES public.import_staged_records(id) ON DELETE CASCADE,
    target_table VARCHAR(64) NOT NULL,
    target_record_id UUID NOT NULL,
    action_type VARCHAR(24) NOT NULL DEFAULT 'INSERT' CHECK (
        action_type IN ('INSERT', 'UPDATE', 'MERGE')
    ),
    commit_seal VARCHAR(64) NOT NULL,
    committed_by UUID,
    committed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Pipeline Telemetry View
CREATE OR REPLACE VIEW public.vw_import_pipeline_telemetry AS
SELECT
    b.facility_id,
    COUNT(DISTINCT b.id) AS total_batches_24h,
    COALESCE(SUM(b.records_staged), 0) AS total_staged_24h,
    COALESCE(SUM(b.records_committed), 0) AS total_committed_24h,
    COALESCE(SUM(b.records_quarantined), 0) AS total_quarantined_24h,
    ROUND(
        CASE WHEN SUM(b.records_staged) > 0 THEN
            (SUM(b.records_committed)::numeric / SUM(b.records_staged)::numeric) * 100
        ELSE 100.0 END, 2
    ) AS clean_pass_rate_percent,
    COALESCE(ROUND(AVG(b.total_duration_ms)), 0) AS avg_duration_ms
FROM public.import_pipeline_batches b
WHERE b.started_at >= NOW() - INTERVAL '24 hours'
GROUP BY b.facility_id;
```

---

## Business Rules

### 1. Stage Lifecycle & State Transitions
- A record must execute through the stages in strict linear sequence:
  `STAGED` &rarr; `VALIDATED` &rarr; `NORMALIZED` &rarr; `MATCHED` &rarr; `COMMIT`.
- If a record fails a `CRITICAL` rule in `VALIDATE` or encounters an unresolvable conflict in `MATCH`, it immediately transitions to `EXCEPTION` and cannot advance to `COMMIT` until resolved by an authorized user.
- A batch cannot transition to `COMPLETED` if unresolved `CRITICAL` exceptions remain; it remains in `COMPLETED_WITH_EXCEPTIONS`.

### 2. Deterministic Validation Rules
- **Rule VAL_NPI_001 (Surgeon NPI Syntax)**: Must be exactly 10 numeric digits and pass the Luhn mod-10 checksum algorithm (CMS Standard). Failure = `CRITICAL`.
- **Rule VAL_DOS_002 (Date of Service Boundary)**: Must be a valid date between 2020-01-01 and Current Date + 30 days (pre-op bookings allowed up to 30 days in advance). Failure = `CRITICAL`.
- **Rule VAL_CPT_003 (Procedure Code Format)**: Must match regular expression `^[0-9]{5}$` or `^[0-9]{4}[A-Z]$` (Category II/III codes). Failure = `CRITICAL`.
- **Rule VAL_CURR_004 (Financial Non-Negative)**: Billed charges, surgical costs, and payment amounts must be $\ge 0.00$. Failure = `CRITICAL`.
- **Rule VAL_TIME_005 (Procedure Duration Logicality)**: Total surgical minutes must be $> 0$ and $\le 720$ (12 hours). Failure = `WARNING`.

### 3. Normalization Rules
- **Date/Time**: Strings converted to UTC ISO-8601 (`YYYY-MM-DDTHH:mm:ssZ`).
- **Payer Canonicalization**: Lookup table maps variant strings (`"FLORIDA BLUE"`, `"BCBS FL"`, `"BLUE CROSS"`) to canonical ID `PAYER_BCBS_FL`.
- **Monetary Values**: All currency floating points converted using banker's rounding to 2 decimal places (`Math.round(val * 100) / 100`).

### 4. Matching & Entity Resolution Rules
- **Tier 1 (Exact Match)**: `source_record_id` matches existing `external_id` &rarr; Flags as update or idempotent duplicate.
- **Tier 2 (Clinical Composite)**: If `Tier 1` is not matched, evaluate:
  $$\text{Match Key} = \text{facility\_id} + \text{patient\_mrn} + \text{dos} + \text{primary\_cpt}$$
  If found, link to existing case. If not found, classify as `NEW_RECORD`.
- **Tier 3 (Duplicate Suspicion)**: If same patient and same DOS exists with different CPT or surgeon, flag as `DUPLICATE_SUSPECT` and route to Exception queue.

### 5. Prohibited Behaviors
- **NO Silent Drops**: No record may be discarded without a corresponding entry in `import_exceptions` or `import_staged_records` with status `REJECTED`.
- **NO Partial Batch Commits Without Audit**: Every committed record must generate an immutable hash record in `import_provenance_audit`.
- **NO Direct Ingestion to Production**: External connectors are prohibited from writing directly to `surgical_cases` or `claims` without passing through the validation pipeline.

---

## Permissions / Security
Role-Based Access Control (RBAC) enforced at database RLS level, backend API level, and frontend UI level:

| Action | Allowed Roles | Description |
| :--- | :--- | :--- |
| **View Pipeline Telemetry & Batches** | `super_admin`, `org_admin`, `clinical_analyst`, `billing_specialist`, `cfo_executive` | Read-only inspection of pipeline status and throughput metrics. |
| **Trigger Pipeline Batch** | `super_admin`, `org_admin`, `integration_engineer` | Manually dispatch a new ingestion batch from a configured connector. |
| **View Quarantined Exceptions** | `super_admin`, `org_admin`, `billing_specialist`, `clinical_analyst` | Review records isolated in the exception workqueue. |
| **Resolve Exception (Override & Commit)** | `super_admin`, `org_admin`, `billing_specialist` | Explicitly override a validation error with an audit explanation. |
| **Resolve Exception (Remap Field)** | `super_admin`, `org_admin`, `integration_engineer` | Provide canonical alias mapping for unrecognized codes or payers. |
| **Reject Quarantined Record** | `super_admin`, `org_admin`, `billing_specialist` | Mark record as invalid and prevent commit into production tables. |
| **Export Audit Logs** | `super_admin`, `org_admin`, `cfo_executive` | Export cryptographically verified commit logs for compliance. |

AI Tools and Automated Agents must query through the authoritative `importValidationService` and inherit the active user's facility tenancy and role permissions.

---

## API / Service Requirements
The authoritative calculation engine resides in `src/services/importValidationService.js` and is re-exported via dual facade `src/lib/importValidationService.js`.

### Core Contracts:
1. `getImportPipelineTelemetry(facilityId)`:
   - Returns 24-hour aggregate metrics: `totalStaged`, `totalCommitted`, `totalQuarantined`, `cleanPassRatePercent`, `avgDurationMs`, and `cryptographicCommitSeal`.
2. `getImportPipelineBatches(facilityId, filter)`:
   - Returns paginated list of pipeline runs with stage completion checkpoints and record counts.
3. `getImportExceptions(facilityId, filter)`:
   - Returns filtered exceptions (`status = 'PENDING'`, `severity`, `category`).
4. `getValidationRules()`:
   - Returns registered validation rules across syntactic, semantic, referential, and financial categories.
5. `executePipelineStage(batchId, targetStage, facilityId)`:
   - Moves records in `batchId` through the specified stage (`VALIDATE`, `NORMALIZE`, `MATCH`, `COMMIT`).
6. `resolveImportException(exceptionId, resolutionAction, resolutionData, resolvedBy)`:
   - Executes human-in-the-loop resolution (`OVERRIDE_AND_COMMIT`, `REMAP_FIELD`, `REJECT_RECORD`) and writes to the audit trail.
7. `computeImportAuditSeal(payload)`:
   - Generates deterministic 64-character SHA-256 cryptographic signature.

---

## UI / Workflow Requirements
Implemented in `src/components/ImportValidationView.jsx` and styled via `src/components/ImportValidationView.css`:

1. **Header Card & Context Bar**:
   - Facility Badge (`Naples Surgery Center`), Phase Badge (`Phase F1 - Module 15`), Active Pipeline State (`LIVE_STREAMING`), and Baseline Ingestion Source (`HST Pathways FHIR R4`).
   - Action Buttons: `Run Pipeline Batch` (primary) and `Audit Provenance` (secondary drawer toggle).
2. **Executive Telemetry Ribbon (6 Cards)**:
   - **Total Ingested Records (24h)**: Count with daily volume delta.
   - **Clean Pass Rate**: Percentage of records flowing directly to commit without exception (e.g., $95.8\%$).
   - **Quarantined Exceptions**: Count of active discrepancies requiring resolution.
   - **Entity Match Rate**: Percentage of records successfully linked to existing or verified new cases.
   - **Average Pipeline Latency**: Milliseconds per 100-record batch.
   - **Cryptographic Commit Seal**: 64-character SHA-256 digest fingerprint.
3. **Interactive 6-Stage Visual Stepper Pipeline**:
   - Visual step bar displaying stages: `1. Import` &rarr; `2. Validate` &rarr; `3. Normalize` &rarr; `4. Match` &rarr; `5. Exception` &rarr; `6. Commit`.
   - Real-time badges showing records currently residing at each checkpoint.
4. **Interactive Sub-Tabs**:
   - **Tab 1: Exception Resolution Workqueue**:
     - Search bar, severity filter (`All`, `Critical`, `Warning`), and category filter.
     - Interactive table showing Staged ID, Source System, Rule Violations, Offending Value, Suggested Correction, and Quick Actions (`Override`, `Remap`, `Reject`).
   - **Tab 2: Pipeline Batches Ledger**:
     - Execution history with timestamp, connector, record counts across all 6 stages, and duration.
   - **Tab 3: Validation Rules Matrix**:
     - Tabular display of all active rules, target fields, validation regular expressions, and failure severity.
   - **Tab 4: Schema Inspector & Ingress Buffer**:
     - Side-by-side JSON comparison of raw ingested source record vs normalized canonical platform record.
5. **Slide-Out Provenance & Audit Drawer**:
   - Displays facility multi-tenancy verification (`fac-naples-01`), AES-256 staging buffer encryption, SHA-256 tamper-evident seals, and resolved exception history.

---

## Audit / Provenance
1. **Raw Payload Lineage**: Raw source JSON payload retained verbatim in `import_staged_records.raw_payload` with source timestamp and ingress IP/connector.
2. **Exception Resolution Audit**: Every resolution captures `resolved_by`, `resolved_at`, `resolution_action`, `resolution_notes`, and before/after values.
3. **Cryptographic Commit Hash**:
   $$\text{Seal} = \text{SHA-256}(\text{facility\_id} + \text{batch\_code} + \text{records\_committed} + \text{target\_table} + \text{timestamp})$$
4. **Immutability**: Once written, rows in `import_provenance_audit` cannot be updated or deleted (`ON DELETE RESTRICT`).

---

## QA / Test Cases
Defined in `tests/import-validation.test.js` (12 automated tests):

1. **Telemetry Invariant Test**: Confirms accurate 24-hour aggregate calculations (1,250 staged, 1,198 committed, 52 quarantined, 95.84% pass rate, 840 ms latency).
2. **Facility UUID Alias Resolution**: Validates Naples Surgery Center resolution across string IDs (`fac-naples-01`, `00000000-0000-0000-0000-000000000002`) and object states (`{ id: 'fac-naples-01' }`).
3. **6-Stage Lifecycle Sequential Progression**: Validates that records transition sequentially through `STAGED` &rarr; `VALIDATED` &rarr; `NORMALIZED` &rarr; `MATCHED` &rarr; `COMMITTED`.
4. **Syntactic & Semantic Rule Enforcement**: Validates NPI Luhn checks, DOS boundaries, valid CPT regex, and non-negative currency amounts.
5. **Canonical Normalization Engine**: Validates date normalization to ISO-8601, payer string alias mapping, and two-decimal currency rounding.
6. **Deterministic Matching Engine**: Tests Tier 1 (exact ID match), Tier 2 (composite clinical key match), and Tier 3 (duplicate suspicion flagging).
7. **Exception Quarantine & Workqueue**: Verifies that failed records are safely isolated in the exception queue and block premature batch commit.
8. **Exception Resolution Actions**: Verifies `OVERRIDE_AND_COMMIT`, `REMAP_FIELD`, and `REJECT_RECORD` resolution workflows and state transitions.
9. **Dual Facade Re-Export Parity**: Verifies parity between `src/services/importValidationService.js` and `src/lib/importValidationService.js`.
10. **Migration 123 UP/DOWN Integrity**: Verifies SQL table definitions, foreign keys, RLS policies, and view definitions.
11. **Strict Zero-Prohibited Token Compliance**: Confirms zero instances of prohibited tokens (`purple`, `violet`, `indigo`, `magenta`, `fuchsia`) across CSS, JSX, and services.
12. **App Shell Integration**: Verifies navigation routing, sidebar entry under Enterprise Integrations, view rendering, and exclusion array integration.

---

## Acceptance Criteria
- [x] Build passes (`npm run build` exits with code 0).
- [x] Lint passes (zero syntax or module resolution errors).
- [x] All 12 automated unit/integration tests in `tests/import-validation.test.js` pass with 100% green.
- [x] All 108 existing CFO and integration tests pass without regression.
- [x] Strict facility multi-tenancy enforced (`facility_id = 'fac-naples-01'`).
- [x] Zero prohibited color tokens in CSS, JSX, or service comments.
- [x] Authoritative calculations run server-side in `importValidationService.js`.
- [x] Visual 6-stage stepper pipeline renders cleanly with real-time throughput metrics.
- [x] Exception resolution workqueue allows interactive override, remapping, and rejection.

---

## Dependencies
- Upstream: Phase F0 (Common Integration Framework - Migration 122).
- Data Sources: HST Pathways EHR (FHIR R4), Waystar Clearinghouse (ANSI X12 837/835), Medline Materials ERP.
- Downstream Modules: Surgical Case Costing, Claims Management, Executive P&L, Board Reporting.

---

## Definition of Done
A feature is complete when the database schema, deterministic validation and matching logic, RBAC permissions, exception resolution workqueue, automated test suite, UI components, App shell routing, and documentation are fully implemented, verified, and passing all quality gates.

---

## Implementation Notes
- **Specification Authored**: Saved to `docs/phases/F1_IMPORT_VALIDATION_PIPELINE.md` and external master specs.
- **Database Migrations**: Created `supabase/migrations/123_import_validation_pipeline.sql` and `123_import_validation_pipeline_down.sql`.
- **Services**: Built `src/services/importValidationService.js` and dual facade `src/lib/importValidationService.js`.
- **Frontend UI**: Built `src/components/ImportValidationView.jsx` and scoped stylesheet `src/components/ImportValidationView.css` following Maestro Clinical Design System.
- **App Shell Integration**: Added `import_validation` tab under Phase 15 Enterprise Integrations in `src/App.jsx`.
- **Automated Tests**: Authored and passed `tests/import-validation.test.js` (12 tests).
