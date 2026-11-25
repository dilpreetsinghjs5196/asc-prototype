# F4 HST INTEGRATION

## Purpose
The HST Pathways Integration module establishes an enterprise-grade connector, schema mapping, perioperative milestone parser, and automated synchronization gateway between HST Pathways EHR/PMS (HST Practice Management, HST eChart, HST Case Coordination) and the ASC Analyst platform.

In the ambulatory surgery center ecosystem, HST Pathways is the primary operating system—coordinating patient scheduling, electronic intra-operative documentation, anesthesia administration, clinical inventory consumption, and multi-tier claims billing. Phase F4 provides deterministic, bi-directional, and auditable synchronization of clinical scheduling, perioperative milestones, and itemized charges into the platform's analytical ledgers, eliminating dual data entry, accelerating case billing velocity, and enforcing strict cryptographic auditability and tenant isolation.

---

## Scope
- Define production requirements for the HST Pathways Integration Gateway:
  1. **Connector Configuration (`hst_connector_configs`)**: Facility-level HST Pathways API endpoint, Center ID, OAuth2 client ID/secret, polling frequencies (15-min incremental, nightly reconciliation), and health check telemetry.
  2. **Incremental Sync Pipeline (`hst_sync_batches`)**: High-throughput cursor-based incremental sync tracking records pulled, inserted, updated, and skipped across clinical scheduling, intra-op charting, and revenue cycle streams.
  3. **Case & Entity Mapping (`hst_case_mappings`)**: Deterministic cross-reference linking HST internal case IDs (`hst_case_id`) to platform case entities with 3-tier entity resolution.
  4. **Perioperative Milestone Engine (`hst_milestone_events`)**: Chronological normalization and validation of surgical time stamps:
     $$\text{Arrival} \le \text{Pre-Op In} \le \text{Room In} \le \text{Anesthesia Start} \le \text{Incision} \le \text{Close} \le \text{Anesthesia End} \le \text{Room Out} \le \text{PACU In} \le \text{Discharge}$$
  5. **Itemized Charge Capture (`hst_charge_items`)**: Extraction of procedure codes (CPT-4/HCPCS), modifiers, revenue codes, implant construct costs, and pharmacy items from HST Practice Management.
  6. **Cryptographic Provenance (`hst_provenance_ledger`)**: SHA-256 immutable audit logging linking every ingested HST payload to facility tenancy.
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
| `src/services/sisIntegrationService.js` | **KEEP** | SIS EHR and PMS integration gateway (Phase F3). |
| `public.hst_connector_configs` | **MISSING** | Facility-level HST API endpoint credentials, sync schedules, and connection state. |
| `public.hst_sync_batches` | **MISSING** | Execution logs tracking incremental sync cycles, record counts, and latencies. |
| `public.hst_case_mappings` | **MISSING** | Cross-reference linking HST external case identifiers to platform cases. |
| `public.hst_milestone_events` | **MISSING** | Normalized perioperative milestone timestamps extracted from HST eChart. |
| `public.hst_charge_items` | **MISSING** | Itemized procedure, implant, and supply charges captured from HST PM. |
| `public.hst_provenance_ledger` | **MISSING** | Immutable cryptographic audit ledger recording HST payload checksums and sync seals. |
| `src/services/hstIntegrationService.js` | **MISSING** | Core calculation service handling HST connectivity, milestone parsing, and charge reconciliation. |
| `src/components/HstIntegrationView.jsx` | **MISSING** | UI dashboard displaying HST connection health, sync telemetry, milestone flow, and charge audits. |

---

## Target State
1. **Automated HST Pathways Connector Architecture**:
   - Dual-mode synchronization:
     - **Incremental Polling Sync**: 15-minute cursor-based polling (`last_modified_timestamp >= cursor`) for active day surgical encounters.
     - **Daily Financial Reconciliation**: Nightly batch matching HST Practice Management finalized charges against platform contract models.
   - Comprehensive error recovery: Automatic exponential backoff retries with dead-letter queue staging for malformed HST payloads.
2. **Deterministic Perioperative Milestone Parser**:
   - Standardizes raw HST electronic charting time stamps into canonical ISO-8601 timestamps:
     - `patient_arrival_time`: Patient arrival at ASC registration.
     - `preop_in_time`: Patient enters pre-operative bay.
     - `room_in_time`: Patient enters operating suite (OR).
     - `anesthesia_start_time`: Anesthesia induction began.
     - `incision_time`: Surgical cut / scope insertion.
     - `close_time`: Surgical closure / dressing applied.
     - `anesthesia_end_time`: Anesthesia reversal complete.
     - `room_out_time`: Patient wheels out of OR suite.
     - `pacu_in_time`: Patient admitted to PACU Phase I recovery.
     - `discharge_time`: Patient achieves discharge readiness score (Aldrete score $\ge 9$).
   - Enforces strict chronological sanity invariants: any reversed sequence (e.g. `room_in_time > incision_time`) triggers a milestone anomaly exception (`ERR_CHRONOLOGY_INVERSION`).
3. **Itemized Charge Reconciliation**:
   - Maps HST Practice Management charge ledger entries to platform analytical ledgers.
   - Flags missing implant construct charges when intra-operative eChart notes indicate implant consumption but no corresponding charge line exists in HST billing.
4. **Cryptographic Ingestion Provenance**:
   - Generates a SHA-256 seal for every HST sync batch:
     $$\text{Seal} = \text{SHA-256}(\text{facility\_id} \parallel \text{hst\_batch\_id} \parallel \text{case\_count} \parallel \text{cursor\_timestamp} \parallel \text{status})$$

---

## Data Model / Schema
Database tables, indexes, RLS policies, and views defined in `supabase/migrations/126_hst_integration.sql`:

```sql
-- 1. HST Connector Configuration Table
CREATE TABLE IF NOT EXISTS public.hst_connector_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    api_endpoint_url VARCHAR(255) NOT NULL,
    hst_center_id VARCHAR(64) NOT NULL,
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
    CONSTRAINT unq_facility_hst_config UNIQUE (facility_id)
);

-- 2. HST Sync Batches Ledger Table
CREATE TABLE IF NOT EXISTS public.hst_sync_batches (
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
    sha256_sync_seal VARCHAR(128) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT unq_facility_hst_batch UNIQUE (facility_id, batch_code)
);

-- 3. HST Case Cross-Reference Mapping Table
CREATE TABLE IF NOT EXISTS public.hst_case_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    hst_case_id VARCHAR(64) NOT NULL,
    hst_case_number VARCHAR(64) NOT NULL,
    hst_patient_mrn VARCHAR(64) NOT NULL,
    hst_account_number VARCHAR(64),
    platform_case_id UUID,
    surgery_date DATE NOT NULL,
    surgeon_npi VARCHAR(10) NOT NULL,
    surgeon_name VARCHAR(128) NOT NULL,
    primary_cpt VARCHAR(10) NOT NULL,
    or_room_name VARCHAR(64) NOT NULL,
    case_status VARCHAR(32) NOT NULL DEFAULT 'COMPLETED',
    echart_documentation_status VARCHAR(32) NOT NULL DEFAULT 'LOCKED',
    billing_status VARCHAR(32) NOT NULL DEFAULT 'BILLED',
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_hst_case UNIQUE (facility_id, hst_case_id)
);

-- 4. HST Perioperative Milestone Events Table
CREATE TABLE IF NOT EXISTS public.hst_milestone_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    hst_case_id VARCHAR(64) NOT NULL,
    patient_arrival_time TIMESTAMPTZ,
    preop_in_time TIMESTAMPTZ,
    room_in_time TIMESTAMPTZ,
    anesthesia_start_time TIMESTAMPTZ,
    incision_time TIMESTAMPTZ,
    close_time TIMESTAMPTZ,
    anesthesia_end_time TIMESTAMPTZ,
    room_out_time TIMESTAMPTZ,
    pacu_in_time TIMESTAMPTZ,
    discharge_time TIMESTAMPTZ,
    total_room_minutes INT,
    surgical_duration_minutes INT,
    anesthesia_duration_minutes INT,
    turnover_minutes INT,
    is_chronology_valid BOOLEAN NOT NULL DEFAULT TRUE,
    anomaly_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. HST Itemized Charge Items Table
CREATE TABLE IF NOT EXISTS public.hst_charge_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    hst_case_id VARCHAR(64) NOT NULL,
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
    revenue_code VARCHAR(16),
    modifier_code VARCHAR(16),
    posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. HST Cryptographic Provenance Ledger Table
CREATE TABLE IF NOT EXISTS public.hst_provenance_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.hst_sync_batches(id) ON DELETE CASCADE,
    event_type VARCHAR(32) NOT NULL,
    records_impacted INT NOT NULL DEFAULT 0,
    sha256_seal VARCHAR(128) NOT NULL,
    operator_id VARCHAR(128) NOT NULL DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
```

---

## Business Rules

1. **Deterministic Milestone Chronological Invariant**:
   $$\text{patient\_arrival} \le \text{room\_in} \le \text{incision} \le \text{close} \le \text{room\_out} \le \text{discharge}$$
   - If any downstream milestone timestamp precedes an upstream milestone timestamp, `is_chronology_valid` is set to `FALSE` and `ERR_CHRONOLOGY_INVERSION` is pushed to `anomaly_flags`.
2. **Surgical Turnover Duration Calculation**:
   $$\text{Turnover Minutes} = \frac{\text{Current Case Room In} - \text{Preceding Case Room Out}}{60 \text{ seconds}}$$
   - Normal benchmarks: 15–25 minutes for same-specialty turnovers. Turnover $> 45$ minutes triggers an operational delay attribution flag.
3. **Implant Construct Reconciliation**:
   - If an intra-operative eChart indicates implant consumption (`is_implant_construct = TRUE`) without a matching charge item in HST Practice Management within 24 hours of case closure, an unbilled implant warning is created.
4. **Secret Masking & Security**:
   - Client secrets, passwords, and tokens are encrypted at rest and masked as `hst_sec_••••••••••••` in all UI telemetry and logging.

---

## Permissions / Security
- Enforces multi-tenancy isolation where `facility_id` must match `CURRENT_SETTING('app.current_facility_id', TRUE)::UUID`.
- RBAC permissions:
  - `integrations.view_hst`: View HST sync telemetry, case mappings, and charge logs (`clinical_analyst`, `billing_specialist`, `admin`).
  - `integrations.manage_hst`: Update endpoint credentials, trigger manual syncs, and reprocess batches (`admin`, `super_admin`).

---

## API / Service Requirements
The backend service [hstIntegrationService.js](file:///e:/medicalAI/asc-prototype/src/services/hstIntegrationService.js) exposes:
- `getHstConnectorConfig(facilityId)`: Retrieves active HST connector configuration.
- `getHstTelemetry(facilityId)`: Aggregates real-time 24h sync health, milestones logged, charges captured, and completeness rates.
- `getHstSyncBatches(facilityId)`: Returns execution history of all incremental and reconciliation batches.
- `getHstCaseMappings(facilityId)`: Returns cross-referenced HST surgical cases with clinical and billing statuses.
- `getHstMilestones(facilityId)`: Returns normalized perioperative milestone event chains.
- `getHstChargeItems(facilityId)`: Returns itemized charges captured from HST PM.
- `validateHstMilestoneChronology(milestones)`: Evaluates chronological consistency across the 10 milestone timestamps.
- `calculateHstTurnoverMinutes(prevCaseOut, currentCaseIn)`: Computes OR suite turnover duration.
- `auditHstCaseCharges(charges)`: Groups and audits procedural, implant, and supply charges.
- `triggerManualHstSync(facilityId, syncType)`: Executes an on-demand sync batch with cryptographic SHA-256 seal generation.
- Re-exported via dual facade in [src/lib/hstIntegrationService.js](file:///e:/medicalAI/asc-prototype/src/lib/hstIntegrationService.js).

---

## UI / Workflow Requirements
Implemented in [HstIntegrationView.jsx](file:///e:/medicalAI/asc-prototype/src/components/HstIntegrationView.jsx):
1. **Header Control Card**: Active center ID, connection status badge, last successful sync timestamp, "Sync Now" button, and "Connection Settings" trigger.
2. **Telemetry Ribbon**: 4 KPI cards:
   - Total Synced Cases (24h)
   - Chronological Milestone Completeness (%)
   - Itemized Charges Captured ($ & Count)
   - Active Connector Status (Latency ms & Health)
3. **Interactive 10-Milestone Flow Visualizer**:
   Arrival $\rightarrow$ Pre-Op $\rightarrow$ Room In $\rightarrow$ Induction $\rightarrow$ Incision $\rightarrow$ Close $\rightarrow$ Anesthesia End $\rightarrow$ Room Out $\rightarrow$ PACU $\rightarrow$ Discharge.
4. **Interactive Navigation Tabs**:
   - **Case Mapping Registry**: Case table with surgeon, CPT, OR room, eChart lock status, and billing readiness.
   - **Perioperative Milestones**: Event timeline with chronological status badge and anomaly diagnostics.
   - **Itemized Charge Audit**: Charge breakdown by category (Procedure, Implant, Supply, Anesthesia) with lot/serial numbers.
   - **Sync Batches & Provenance Ledger**: Batch execution logs with SHA-256 cryptographic seals.
5. **Slide-Out Connection Settings Drawer**: Form for endpoint URL, center code, OAuth2 client credentials, polling frequency, and test connection button.

---

## Acceptance Criteria
- [x] Database migration `126_hst_integration.sql` executes without error in PostgreSQL/Supabase.
- [x] Rollback migration `126_hst_integration_down.sql` cleanly drops all tables and policies.
- [x] Chronological milestone validation correctly flags out-of-order timestamps (`ERR_CHRONOLOGY_INVERSION`).
- [x] Dual facade re-export parity between `src/services/hstIntegrationService.js` and `src/lib/hstIntegrationService.js`.
- [x] Full Light Mode and Dark Mode support with zero background bleed and high-contrast inputs.
- [x] Strict Zero Prohibited Token compliance: zero purple, violet, indigo, magenta, or fuchsia tokens.
- [x] Unit test suite passing 100% across all integration phases.
- [x] Production build passes with 0 errors.

---

## Definition of Done
Phase F4 is complete when the schema, backend engine, dual facade, UI component, CSS, shell integration, and automated tests are verified and committed on `feature/phase-f0-integration-framework`.

---

## Implementation Notes
- **Files Created/Modified**:
  - `docs/phases/F4_HST_INTEGRATION.md`
  - `e:\medicalAI\ASCANALYST_All_Modules\ASCANALYST_MD_SPECS\Phase_15_Integrations\F4_HST_INTEGRATION.md`
  - `supabase/migrations/126_hst_integration.sql`
  - `supabase/migrations/126_hst_integration_down.sql`
  - `src/services/hstIntegrationService.js`
  - `src/lib/hstIntegrationService.js`
  - `src/components/HstIntegrationView.jsx`
  - `src/components/HstIntegrationView.css`
  - `src/App.jsx`
  - `tests/hst-integration.test.js`
- **Key Architectural Decisions**:
  - `sha256_sync_seal` and `sha256_seal` columns sized to `VARCHAR(128)` to prevent string overflow.
  - `platform_case_id` declared as `UUID` without foreign key constraint to non-existent tables.
  - Implemented 10-milestone timeline representing the complete HST eChart perioperative flow.
