# F3 SIS INTEGRATION

## Purpose
The Surgical Information Systems (SIS) Integration module establishes an enterprise-grade connector, schema mapping, perioperative milestone parser, and automated synchronization gateway between SIS EHR/PMS (SIS Exchange / SIS Charts / SIS AdvantX) and the ASC Analyst platform. 

In modern ambulatory surgery centers, SIS serves as the core operational backbone—capturing case scheduling, electronic nursing documentation, anesthesia times, intra-operative implant consumption, charge generation, and billing claims. Phase F3 ensures deterministic, real-time and scheduled synchronization of perioperative milestones and itemized charges into the platform's analytical ledgers, eliminating dual data entry, accelerating case billing velocity, and enforcing strict cryptographic auditability and tenant isolation.

---

## Scope
- Define production requirements for the SIS Integration Gateway:
  1. **Connector Configuration (`sis_connector_configs`)**: Facility-level SIS API endpoints, facility credentials, OAuth2 client ID/secret, polling frequencies (15-min incremental, nightly reconciliation), and health check telemetry.
  2. **Incremental Sync Pipeline (`sis_sync_batches`)**: High-throughput cursor-based incremental sync tracking records pulled, inserted, updated, and skipped across clinical scheduling, intra-op charting, and revenue cycle streams.
  3. **Case & Entity Mapping (`sis_case_mappings`)**: Deterministic cross-reference linking SIS internal case IDs (`sis_case_id`) to platform `surgical_cases` with 3-tier entity resolution.
  4. **Perioperative Milestone Engine (`sis_milestone_events`)**: Chronological normalization and validation of surgical time stamps:
     $$\text{Check-In} \le \text{Room In} \le \text{Anesthesia Start} \le \text{Incision} \le \text{Close} \le \text{Room Out} \le \text{PACU In} \le \text{Discharge}$$
  5. **Itemized Charge Capture (`sis_charge_items`)**: Extraction of procedure codes (CPT-4/HCPCS), modifiers, revenue codes, implant construct costs, and pharmacy items from SIS AdvantX.
  6. **Cryptographic Provenance (`sis_provenance_ledger`)**: SHA-256 immutable audit logging linking every ingested SIS payload to facility tenancy.
- Support interactive connectivity testing, manual on-demand sync triggers, chronological milestone validation visualizer, and charge variance diagnostics.
- Enforce organization and facility tenancy (`facility_id`), RBAC, and zero prohibited color tokens.

---

## Current State
Document what exists today in the repository/database before implementation.

| Component | Status | Description |
| :--- | :--- | :--- |
| `src/services/integrationFrameworkService.js` | **KEEP** | Enterprise connector registry with generic connector schema (Phase F0). |
| `src/services/importValidationService.js` | **KEEP** | 6-stage validation pipeline and exception workqueue (Phase F1). |
| `src/services/excelCsvImportService.js` | **KEEP** | Excel/CSV file upload and schema auto-mapping engine (Phase F2). |
| `public.sis_connector_configs` | **MISSING** | Facility-level SIS API endpoint credentials, sync schedules, and connection state. |
| `public.sis_sync_batches` | **MISSING** | Execution logs tracking incremental sync cycles, record counts, and latencies. |
| `public.sis_case_mappings` | **MISSING** | Cross-reference linking SIS external case identifiers to platform surgical cases. |
| `public.sis_milestone_events` | **MISSING** | Normalized perioperative milestone timestamps extracted from SIS nursing charting. |
| `public.sis_charge_items` | **MISSING** | Itemized procedure and supply charges captured from SIS AdvantX/Financials. |
| `public.sis_provenance_ledger` | **MISSING** | Immutable cryptographic audit ledger recording SIS payload checksums and sync seals. |
| `src/services/sisIntegrationService.js` | **MISSING** | Core calculation service handling SIS connectivity, milestone parsing, and charge reconciliation. |
| `src/components/SisIntegrationView.jsx` | **MISSING** | UI dashboard displaying SIS connection health, sync telemetry, milestone flow, and charge audits. |

---

## Target State
1. **Automated SIS Connector Architecture**:
   - Dual-mode synchronization:
     - **Incremental Polling Sync**: 15-minute cursor-based polling (`last_modified_timestamp >= cursor`) for active day surgical encounters.
     - **Daily Financial Reconciliation**: Nightly batch matching SIS AdvantX finalized charges against platform expected payments and contract models.
   - Comprehensive error recovery: Automatic exponential backoff retries with dead-letter queue staging for malformed SIS payloads.
2. **Deterministic Perioperative Milestone Parser**:
   - Standardizes raw SIS electronic nursing time stamps into canonical ISO-8601 timestamps:
     - `check_in_time`: Patient arrival at ASC registration.
     - `room_in_time`: Patient enters operating suite (OR).
     - `anesthesia_start_time`: Anesthesia induction began.
     - `incision_time`: Surgical cut / scope insertion.
     - `close_time`: Surgical closure / dressing applied.
     - `room_out_time`: Patient wheels out of OR suite.
     - `pacu_in_time`: Patient admitted to PACU Phase I recovery.
     - `pacu_out_time`: Patient achieves discharge readiness score (Aldrete score $\ge 9$).
   - Enforces strict chronological sanity invariants: any reversed sequence (e.g. `room_in_time > incision_time`) triggers a milestone anomaly exception.
3. **Itemized Charge Reconciliation**:
   - Maps SIS AdvantX charge ledger entries to platform `case_costs` and `claim_payments`.
   - Flags missing implant construct charges when intra-operative nursing notes indicate implant consumption but no corresponding charge line exists in SIS billing.
4. **Cryptographic Ingestion Provenance**:
   - Generates a 64-character SHA-256 seal for every SIS sync batch:
     $$\text{Seal} = \text{SHA-256}(\text{facility\_id} \parallel \text{sis\_batch\_id} \parallel \text{case\_count} \parallel \text{cursor\_timestamp} \parallel \text{status})$$

---

## Data Model / Schema
Database tables, indexes, RLS policies, and views defined in `supabase/migrations/125_sis_integration.sql`:

```sql
-- 1. SIS Connector Configuration Table
CREATE TABLE IF NOT EXISTS public.sis_connector_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    api_endpoint_url VARCHAR(255) NOT NULL,
    sis_facility_code VARCHAR(64) NOT NULL,
    auth_type VARCHAR(32) NOT NULL DEFAULT 'OAUTH2' CHECK (auth_type IN ('OAUTH2', 'API_KEY', 'MTLS')),
    client_id VARCHAR(128) NOT NULL,
    client_secret_encrypted TEXT,
    polling_interval_minutes INT NOT NULL DEFAULT 15,
    sync_status VARCHAR(24) NOT NULL DEFAULT 'CONNECTED' CHECK (
        sync_status IN ('CONNECTED', 'SYNCING', 'PAUSED', 'ERROR', 'DISCONNECTED')
    ),
    last_successful_sync_at TIMESTAMPTZ,
    last_sync_cursor_at TIMESTAMPTZ,
    health_status VARCHAR(24) NOT NULL DEFAULT 'HEALTHY' CHECK (health_status IN ('HEALTHY', 'DEGRADED', 'UNHEALTHY')),
    auto_sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_sis_config UNIQUE (facility_id)
);

-- 2. SIS Sync Batches Ledger Table
CREATE TABLE IF NOT EXISTS public.sis_sync_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_code VARCHAR(32) NOT NULL,
    sync_type VARCHAR(32) NOT NULL DEFAULT 'INCREMENTAL' CHECK (
        sync_type IN ('INCREMENTAL', 'DAILY_RECONCILIATION', 'MANUAL_TRIGGER', 'HISTORICAL_BACKFILL')
    ),
    status VARCHAR(24) NOT NULL DEFAULT 'COMPLETED' CHECK (
        status IN ('PENDING', 'RUNNING', 'COMPLETED', 'COMPLETED_WITH_WARNINGS', 'FAILED')
    ),
    cases_retrieved INT NOT NULL DEFAULT 0,
    cases_inserted INT NOT NULL DEFAULT 0,
    cases_updated INT NOT NULL DEFAULT 0,
    milestones_parsed INT NOT NULL DEFAULT 0,
    charges_synced INT NOT NULL DEFAULT 0,
    exceptions_flagged INT NOT NULL DEFAULT 0,
    duration_ms INT NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    sha256_sync_seal VARCHAR(64) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT unq_facility_sis_batch UNIQUE (facility_id, batch_code)
);

-- 3. SIS Case Cross-Reference Mapping Table
CREATE TABLE IF NOT EXISTS public.sis_case_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    sis_case_id VARCHAR(64) NOT NULL,
    sis_patient_id VARCHAR(64) NOT NULL,
    sis_account_number VARCHAR(64),
    platform_case_id UUID REFERENCES public.surgical_cases(id) ON DELETE SET NULL,
    surgery_date DATE NOT NULL,
    surgeon_npi VARCHAR(10) NOT NULL,
    surgeon_name VARCHAR(128) NOT NULL,
    primary_cpt VARCHAR(10) NOT NULL,
    or_room_name VARCHAR(64) NOT NULL,
    case_status VARCHAR(32) NOT NULL DEFAULT 'COMPLETED',
    clinical_documentation_status VARCHAR(32) NOT NULL DEFAULT 'LOCKED',
    billing_status VARCHAR(32) NOT NULL DEFAULT 'BILLED',
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_sis_case UNIQUE (facility_id, sis_case_id)
);

-- 4. SIS Perioperative Milestone Events Table
CREATE TABLE IF NOT EXISTS public.sis_milestone_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    sis_case_id VARCHAR(64) NOT NULL,
    check_in_time TIMESTAMPTZ,
    room_in_time TIMESTAMPTZ,
    anesthesia_start_time TIMESTAMPTZ,
    incision_time TIMESTAMPTZ,
    close_time TIMESTAMPTZ,
    room_out_time TIMESTAMPTZ,
    pacu_in_time TIMESTAMPTZ,
    pacu_out_time TIMESTAMPTZ,
    total_room_minutes INT GENERATED ALWAYS AS (
        CASE WHEN room_in_time IS NOT NULL AND room_out_time IS NOT NULL 
        THEN ROUND(EXTRACT(EPOCH FROM (room_out_time - room_in_time)) / 60)::INT 
        ELSE NULL END
    ) STORED,
    surgical_duration_minutes INT GENERATED ALWAYS AS (
        CASE WHEN incision_time IS NOT NULL AND close_time IS NOT NULL 
        THEN ROUND(EXTRACT(EPOCH FROM (close_time - incision_time)) / 60)::INT 
        ELSE NULL END
    ) STORED,
    turnover_minutes INT,
    is_chronology_valid BOOLEAN NOT NULL DEFAULT TRUE,
    anomaly_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. SIS Itemized Charge Items Table
CREATE TABLE IF NOT EXISTS public.sis_charge_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    sis_case_id VARCHAR(64) NOT NULL,
    line_item_id VARCHAR(64) NOT NULL,
    charge_category VARCHAR(32) NOT NULL CHECK (
        charge_category IN ('SURGICAL_PROCEDURE', 'ANESTHESIA', 'IMPLANT', 'SUPPLY', 'PHARMACY', 'FACILITY_FEE')
    ),
    code VARCHAR(32) NOT NULL,
    description VARCHAR(255) NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1.00,
    unit_charge NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_charge NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    cost_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    is_implant_construct BOOLEAN NOT NULL DEFAULT FALSE,
    lot_number VARCHAR(64),
    serial_number VARCHAR(64),
    posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. SIS Cryptographic Provenance Ledger
CREATE TABLE IF NOT EXISTS public.sis_provenance_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.sis_sync_batches(id) ON DELETE CASCADE,
    event_type VARCHAR(32) NOT NULL,
    records_impacted INT NOT NULL DEFAULT 0,
    sha256_seal VARCHAR(64) NOT NULL,
    operator_id VARCHAR(128) NOT NULL DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
```

---

## Business Rules
1. **Connectivity & Heartbeat**:
   - Automated heartbeat check runs every 5 minutes. If 3 consecutive failures occur, connection state transitions to `ERROR` and status alerts trigger.
   - Credentials stored with industry-standard encryption at rest.
2. **Deterministic Milestone Chronological Invariant**:
   - Each case milestone must satisfy strict sequential non-decreasing order:
     $$\text{Check-In} \le \text{Room In} \le \text{Anesthesia Start} \le \text{Incision} \le \text{Close} \le \text{Room Out} \le \text{PACU In} \le \text{Discharge}$$
   - If `incision_time > close_time` or `room_in_time > room_out_time`, `is_chronology_valid` is set to `FALSE` and the anomaly is flagged with `ERR_CHRONOLOGY_INVERSION`.
3. **Turnover Time Calculation**:
   - Turnover time is deterministically computed as the difference in minutes between previous case's `room_out_time` and subsequent case's `room_in_time` within the same operating room on the same surgical date:
     $$\text{Turnover} = \text{Case}_{k}.\text{room\_in\_time} - \text{Case}_{k-1}.\text{room\_out\_time}$$
   - Any turnover $< 5$ minutes or $> 120$ minutes is flagged for operational review.
4. **Charge Capture Completeness**:
   - Every locked SIS clinical case must produce corresponding charges within 24 hours of case closure.
   - Cases exceeding 48 hours without charges trigger `ERR_UNBILLED_CASE_EXPOSURE`.
5. **Cryptographic Sealing**:
   - Every completed synchronization cycle writes a 64-character SHA-256 seal to `sis_provenance_ledger`.

---

## Permissions / Security
| Role | View SIS Sync & Telemetry | Trigger Manual Sync | Edit API Credentials | Resolve Anomaly Flags | View Audit Provenance |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Super Admin | Yes | Yes | Yes | Yes | Yes |
| Facility Admin | Yes | Yes | Yes | Yes | Yes |
| Clinical Director | Yes | Yes | No | Yes | Yes |
| Materials Manager | Yes | No | No | Yes | No |
| Billing Auditor | Yes | No | No | No | Yes |

---

## API / Service Requirements
The calculation service `src/services/sisIntegrationService.js` provides:
1. `getSisConnectorConfig(facilityId)`: Retrieves active SIS API endpoint, status, and health metrics.
2. `getSisTelemetry(facilityId)`: Computes 24h summary metrics (Sync Status, Total Synced Cases, Milestone Completeness %, Charge Capture Lag Hours, Anomaly Count, SHA-256 Seal).
3. `getSisSyncBatches(facilityId)`: Retrieves execution history of incremental sync runs.
4. `getSisMilestones(facilityId, filters)`: Retrieves perioperative time logs with chronological validation flags.
5. `getSisChargeAudit(facilityId)`: Audits itemized charges and highlights unbilled constructs.
6. `triggerManualSync(facilityId, syncType)`: Executes on-demand synchronization cycle, updates sync cursor, and generates SHA-256 seal.
7. `testSisConnection(facilityId)`: Simulates synthetic handshake with SIS API gateway.
8. `computeSisProvenanceSeal(payload)`: Generates 64-character SHA-256 cryptographic digest.

---

## UI / Workflow Requirements
- **Header Control Strip**: Naples Surgery Center badge, SIS Gateway Active badge, action buttons (`Test Connection`, `Trigger Manual Sync`, `Audit Provenance`).
- **Telemetry Ribbon (6 Cards)**:
  1. *Connection Health*: Active status (`CONNECTED - Healthy`).
  2. *24h Case Sync Volume*: Number of clinical cases synchronized.
  3. *Milestone Completeness*: Percentage of cases with complete 8-point milestones ($\ge 98\%$).
  4. *Clinical-to-Billing Lag*: Average hours from surgical close to charge posting.
  5. *Milestone Anomalies*: Quarantined chronological sequence issues.
  6. *SHA-256 Provenance Seal*: Truncated cryptographic checksum with tooltip.
- **Sub-Tabs**:
  1. *Perioperative Milestones*: Chronological milestone timeline visualizer, duration calculators (Room Min, Cut-to-Close, Turnover), and anomaly flags.
  2. *Charge & Construct Audit*: Breakdown of procedure, supply, and implant charges synced from SIS AdvantX with unit costs and total billing amounts.
  3. *Sync Batches Ledger*: Historical execution runs with record counts, durations, and commit seals.
  4. *Connector Configuration*: Endpoint management, polling frequencies, and credentials status.
- **Slide-out Provenance Drawer**: Detailed audit ledger showing SHA-256 sync seals and payload attribution.
- **Design System Standards**:
  - Full support for Light Theme (`--bg-main: #f8fafc`) and Dark Theme.
  - High contrast form inputs (`#ffffff` in light mode with `#cbd5e1` borders).
  - Strict Zero Prohibited Accent Tokens (`purple`, `violet`, `indigo`, `magenta`, `fuchsia`).

---

## Audit / Provenance
Every sync batch retains immutable audit provenance:
- Endpoint URL, SIS facility code, sync cursor before/after timestamps.
- Breakdown of records inserted, updated, and skipped.
- Cryptographic Commit Seal: 64-character SHA-256 digest linking batch payload to facility tenancy.

---

## QA / Test Cases
Automated test suite `tests/sis-integration.test.js` covers 12 comprehensive test assertions:
1. Telemetry accuracy (Total synced cases, milestone completeness %, billing lag, anomaly count, SHA-256 seal).
2. Facility UUID alias resolution matches Naples Surgery Center across strings and objects.
3. Connector configuration retrieval and status verification.
4. Deterministic milestone chronological invariant validation (`room_in <= cut <= close <= room_out`).
5. Detection and flagging of inverted milestone chronological timestamps.
6. Perioperative surgical duration and turnover time calculations.
7. Itemized charge reconciliation categorizes procedural, supply, and implant items.
8. Manual sync trigger execution updates cursor and records SHA-256 seal.
9. Dual facade re-export parity between `src/services/` and `src/lib/`.
10. Migration 125 UP/DOWN SQL structural integrity and RLS policies.
11. Strict zero prohibited token compliance.
12. App Shell Integration structure check in `src/App.jsx`.

---

## Acceptance Criteria
- [x] Build passes (`npm run build` exits 0).
- [x] Lint and syntax checks pass.
- [x] All 12 automated unit and integration tests pass.
- [x] Strict tenant isolation enforced for Naples Surgery Center.
- [x] Zero prohibited color tokens present in CSS or component code.
- [x] Full Light and Dark theme fidelity.
- [x] Dual facade architectural parity verified.

---

## Dependencies
- Phase F0 Common Integration Framework (`122_integration_framework.sql`).
- Phase F1 Import Validation Pipeline (`123_import_validation_pipeline.sql`).
- Phase F2 Excel/CSV Import (`124_excel_csv_import.sql`).
- Domain tables: `facilities`, `surgical_cases`, `case_costs`.

---

## Definition of Done
A feature is complete only when the data model, deterministic logic, permissions, validation, auditability, tests, UI states, documentation, and acceptance criteria are complete.

---

## Implementation Notes
- **Specification**: Written to `docs/phases/F3_SIS_INTEGRATION.md` and `e:\medicalAI\ASCANALYST_All_Modules\ASCANALYST_MD_SPECS\Phase_15_Integrations\F3_SIS_INTEGRATION.md`.
- **Database**: Migration `125_sis_integration.sql` and `125_sis_integration_down.sql`.
- **Backend Services**: `src/services/sisIntegrationService.js` and `src/lib/sisIntegrationService.js`.
- **Frontend Components**: `src/components/SisIntegrationView.jsx` and `src/components/SisIntegrationView.css`.
- **Shell**: Integrated in `src/App.jsx` under `activeTab === 'sis_integration'`.
- **Tests**: `tests/sis-integration.test.js` (12 tests, 100% pass rate).
