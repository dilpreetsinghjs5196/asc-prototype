# F0 INTEGRATION FRAMEWORK

## Purpose
The Common Integration Framework establishes the foundational architectural backbone for Phase 15 (Enterprise Healthcare Integrations). Ambulatory Surgery Centers (ASCs) rely on heterogeneous external systems—including EHRs/Practice Management Systems (HST Pathways, SIS, Epic OpTime), Clearinghouses (Waystar, Availity, Change Healthcare), Supply Chain ERPs (Medline, McKesson), and General Ledger accounting systems (NetSuite, QuickBooks Online). 

This specification defines the unified connector registry, automated batch ingestion engine, canonical field mapping matrix, data provenance ledger, and real-time integration health telemetry. It guarantees deterministic, auditable data ingestion with zero data leakage, strict facility multi-tenancy, and cryptographic provenance verification.

## Scope
- Define production architecture for integration connectors, scheduled batch executions, canonical field mappings, dead-letter queue (DLQ) error handling, and transaction provenance.
- Support multi-protocol transport: REST API (JSON/OAuth2), SFTP (ANSI X12 837/835), FHIR R4 (US Core Resources), and Webhook-driven event streams.
- Enforce deterministic field transformation, idempotent batch execution, and tamper-evident SHA-256 payload hashing.
- Enforce facility multi-tenancy (`facility_id`), Role-Based Access Control (RBAC), and credential masking.
- Provide real-time operational telemetry, manual replay triggers, and integration audit logs.

## Current State
Document what exists today in the repository/database before implementation.

| Component | Status | Description |
| :--- | :--- | :--- |
| `src/services/edi837IngestionService.js` | **KEEP** | Lightweight parser stub for clearinghouse 837 EDI files. |
| `src/services/edi835RemittanceService.js` | **KEEP** | Lightweight parser stub for 835 electronic remittance files. |
| `public.integration_connectors` | **MISSING** | Master table storing configured external connectors, auth protocols, endpoint URLs, and health statuses. |
| `public.integration_batches` | **MISSING** | Batch execution ledger tracking batch status (`QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`), record counts, and latencies. |
| `public.integration_mappings` | **MISSING** | Field translation rules mapping external schemas to canonical platform tables. |
| `public.integration_provenance_records` | **MISSING** | Granular data lineage table binding source records to canonical records via cryptographic SHA-256 hashes. |
| `src/services/integrationFrameworkService.js` | **MISSING** | Core service managing connectors, triggering batch jobs, applying field mappings, and aggregating telemetry. |
| `src/components/IntegrationFrameworkView.jsx` | **MISSING** | Interactive operational dashboard for integration monitoring, connector health, batch history, and mapping verification. |

## Target State
1. **Connector Registry**:
   - Multi-protocol support (`REST_API`, `SFTP`, `FHIR_R4`, `HL7_V2`, `WEBHOOK`).
   - Categorized by domain: `EHR_PMS`, `CLEARINGHOUSE_EDI`, `SUPPLY_CHAIN_ERP`, `ACCOUNTING_GL`.
   - Health telemetry: Heartbeat checks, uptime percentage, error count, and status (`HEALTHY`, `DEGRADED`, `DOWN`, `PAUSED`).
   - Credential masking: Secrets stored securely; UI displays masked fingerprints (e.g., `sk_live_...9f4a`).

2. **Automated Batch Processing Engine**:
   - Idempotent batch execution with unique batch codes (`BATCH_20261125_001`).
   - Granular metrics: extracted records, transformed records, ingested records, rejected records, transfer bytes, and processing duration.
   - Fault tolerance: Automated retry with exponential backoff and Dead-Letter Queue (DLQ) routing for unparseable records.
   - Manual controls: Single-click batch execution and failed batch replay capabilities for administrators.

3. **Canonical Data Mapping & Schema Normalization**:
   - Source entity to target entity mappings (e.g., `hst.surgery_case` -> `public.surgical_cases`).
   - Declarative JSON transformation rules, type coercion, and value translation tables.
   - Field mapping validation score (% of required canonical fields successfully mapped).

4. **Cryptographic Data Provenance**:
   - Every ingested transaction records source system reference, connector ID, batch ID, and SHA-256 payload digest.
   - Guarantees complete auditability from source EHR/Clearinghouse record to executive CFO dashboard.

## Data Model / Schema
Database tables, indexes, RLS policies, and views defined in `supabase/migrations/122_integration_framework.sql`:

```sql
-- 1. Integration Connectors Registry Table
CREATE TABLE IF NOT EXISTS public.integration_connectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    connector_code VARCHAR(32) NOT NULL,
    connector_name VARCHAR(128) NOT NULL,
    category VARCHAR(32) NOT NULL CHECK (
        category IN ('EHR_PMS', 'CLEARINGHOUSE_EDI', 'SUPPLY_CHAIN_ERP', 'ACCOUNTING_GL', 'ANALYTICS_WAREHOUSE')
    ),
    protocol VARCHAR(24) NOT NULL CHECK (
        protocol IN ('REST_API', 'SFTP', 'FHIR_R4', 'HL7_V2', 'DATABASE_CDC', 'WEBHOOK')
    ),
    endpoint_url VARCHAR(256) NOT NULL,
    sync_frequency VARCHAR(24) NOT NULL DEFAULT 'HOURLY',
    status VARCHAR(24) NOT NULL DEFAULT 'HEALTHY' CHECK (
        status IN ('HEALTHY', 'DEGRADED', 'DOWN', 'PAUSED')
    ),
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_heartbeat_at TIMESTAMPTZ,
    last_sync_at TIMESTAMPTZ,
    uptime_percent NUMERIC(5, 2) NOT NULL DEFAULT 99.90,
    credentials_masked JSONB NOT NULL DEFAULT '{"auth_type": "API_KEY", "masked_key": "sk_live_...9f4a"}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_connector UNIQUE (facility_id, connector_code)
);

-- 2. Integration Batches Execution Ledger Table
CREATE TABLE IF NOT EXISTS public.integration_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    connector_id UUID NOT NULL REFERENCES public.integration_connectors(id) ON DELETE CASCADE,
    batch_code VARCHAR(32) NOT NULL,
    job_type VARCHAR(24) NOT NULL DEFAULT 'INBOUND_SYNC' CHECK (
        job_type IN ('INBOUND_SYNC', 'OUTBOUND_DISPATCH', 'CDC_POLL', 'MANUAL_REPLAY')
    ),
    status VARCHAR(24) NOT NULL DEFAULT 'COMPLETED' CHECK (
        status IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED')
    ),
    records_extracted INT NOT NULL DEFAULT 0,
    records_transformed INT NOT NULL DEFAULT 0,
    records_ingested INT NOT NULL DEFAULT 0,
    records_rejected INT NOT NULL DEFAULT 0,
    duration_ms INT NOT NULL DEFAULT 0,
    bytes_transferred INT NOT NULL DEFAULT 0,
    error_summary TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_batch UNIQUE (facility_id, batch_code)
);

-- 3. Integration Mappings Table
CREATE TABLE IF NOT EXISTS public.integration_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    connector_id UUID NOT NULL REFERENCES public.integration_connectors(id) ON DELETE CASCADE,
    mapping_code VARCHAR(32) NOT NULL,
    source_entity VARCHAR(64) NOT NULL,
    target_entity VARCHAR(64) NOT NULL,
    version_number INT NOT NULL DEFAULT 1,
    field_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_connector_mapping UNIQUE (connector_id, mapping_code)
);

-- 4. Integration Provenance Records Table
CREATE TABLE IF NOT EXISTS public.integration_provenance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    connector_id UUID NOT NULL REFERENCES public.integration_connectors(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.integration_batches(id) ON DELETE CASCADE,
    source_record_id VARCHAR(64) NOT NULL,
    target_table VARCHAR(64) NOT NULL,
    target_record_id UUID NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    source_timestamp TIMESTAMPTZ NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Integration Framework Telemetry View
CREATE OR REPLACE VIEW public.vw_integration_framework_telemetry AS
SELECT
    c.facility_id,
    COUNT(DISTINCT c.id) AS total_connectors,
    COUNT(DISTINCT CASE WHEN c.is_active = true AND c.status = 'HEALTHY' THEN c.id END) AS healthy_connectors,
    COUNT(DISTINCT b.id) AS total_batches_24h,
    COUNT(DISTINCT CASE WHEN b.status = 'COMPLETED' THEN b.id END) AS completed_batches_24h,
    COALESCE(SUM(b.records_ingested), 0) AS total_records_ingested_24h,
    COALESCE(SUM(b.records_rejected), 0) AS total_records_rejected_24h,
    ROUND(
        CASE WHEN COUNT(b.id) > 0 THEN
            (COUNT(CASE WHEN b.status = 'COMPLETED' THEN 1 END)::numeric / COUNT(b.id)::numeric) * 100
        ELSE 100.0 END, 2
    ) AS batch_success_rate_percent,
    COALESCE(ROUND(AVG(b.duration_ms)), 0) AS avg_duration_ms
FROM public.integration_connectors c
LEFT JOIN public.integration_batches b ON b.connector_id = c.id AND b.started_at >= NOW() - INTERVAL '24 hours'
GROUP BY c.facility_id;
```

## Business Rules
1. **Connector Tenancy & Idempotency**:
   - Each connector must be strictly bound to a single facility tenant.
   - Batch executions must be idempotent; executing the same batch code twice is rejected.
2. **Health Calculation**:
   - If a connector fails 3 consecutive heartbeats or sync jobs within 1 hour, status transitions from `HEALTHY` to `DEGRADED`.
   - If no heartbeat is received for 6 hours, status transitions to `DOWN`.
3. **Dead-Letter Queue (DLQ) Rule**:
   - Any record failing canonical validation or schema type coercion is moved to DLQ with exact error provenance, allowing partial batch success without halting the pipeline.
4. **Data Provenance Invariance**:
   - Every canonical record must store a SHA-256 payload digest. Altering the source payload without a new batch produces an audit mismatch.
5. **Secret Protection Rule**:
   - Raw API keys, private certificates, and client secrets must never be returned in plaintext API responses. Only masked fingerprints are returned.

## Permissions / Security
- `super_admin`, `org_admin`: Full access to create, edit, pause, and configure connectors, mappings, and credentials.
- `facility_administrator`, `cfo`: Full access to view telemetry, inspect batch history, and trigger manual batch replays.
- `clinical_director`, `materials_manager`: Read-only access to respective connector statuses and sync logs.
- AI Agents: Access strictly restricted via read-only tools and tenant-scoped RLS policies.

## API / Service Requirements
- `getFacilityConnectors(facilityId)`: Retrieves all configured connectors for a facility.
- `getConnectorByIdOrCode(identifier, facilityId)`: Retrieves connector configuration and health metadata.
- `getFacilityBatches(facilityId, connectorId)`: Retrieves recent batch execution ledger.
- `getIntegrationMappings(connectorId)`: Retrieves canonical field mapping rules.
- `getIntegrationTelemetry(facilityId)`: Aggregates real-time 24-hour operational telemetry.
- `triggerManualSyncBatch(connectorCode, facilityId)`: Dispatches immediate sync batch and logs execution.
- `replayFailedBatch(batchCode, facilityId)`: Re-queues failed or rejected DLQ records.

## UI / Workflow Requirements
- **Integration Operational Telemetry Ribbon (6 Cards)**:
  1. Active Connectors (`4 / 4 Online`)
  2. 24h Batches Executed (`48 Batches`)
  3. Batch Success Rate (`97.92%`)
  4. Records Ingested 24h (`12,450 Records`)
  5. Average Batch Latency (`1,420 ms`)
  6. Rejected / DLQ Records (`14 Records / 0.11%`)
- **Configured Connectors Grid**:
  - Cards for HST Pathways (EHR), Waystar (Clearinghouse), Medline (ERP), and NetSuite (GL) detailing protocol, frequency, last sync timestamp, and status pills.
- **Batch Execution History Ledger**:
  - Filterable by connector and status (`ALL`, `COMPLETED`, `FAILED`).
  - Columns: Batch Code, Connector, Job Type, Status, Records (Extracted/Ingested/Rejected), Latency, Completed Timestamp.
- **Canonical Field Mappings Drawer / View**:
  - Interactive table showing source field, transform expression, canonical target field, and sample values.
- **Manual Sync / Replay Controls**:
  - Modal with single-click manual synchronization trigger and execution progress toast.
- **Strict Theme & Color Ban**:
  - Full support for dark theme and light theme.
  - Strict ZERO prohibited tokens (`purple`, `violet`, `indigo`, `magenta`, `fuchsia`).

## Audit / Provenance
- All connector state transitions retain timestamp, user ID, and before/after status.
- Batch executions retain source record IDs and cryptographic SHA-256 payload digests.

## QA / Test Cases
1. Telemetry returns accurate 24-hour metrics (4 connectors, 48 batches, 97.92% success rate, 12,450 records).
2. Facility UUID alias resolution matches Naples Surgery Center across strings and object configurations.
3. Connector retrieval returns all 4 enterprise connectors (HST, Waystar, Medline, NetSuite) with correct protocols.
4. Batch execution ledger returns idempotent runs with correct record counts and status transitions.
5. Canonical field mapping resolution correctly maps source fields to platform tables.
6. Triggering manual sync batch creates a new batch record with `COMPLETED` status and incremented telemetry.
7. Replay failed batch properly simulates reprocessing of DLQ records.
8. Secret masking verification: Ensures no plaintext API keys or credentials exist in API models.
9. Dual facade re-export parity between `src/services/` and `src/lib/`.
10. Migration 122 UP/DOWN SQL structural integrity and RLS policy verification.
11. Strict Zero-Prohibited Token Compliance (no purple/violet/indigo/magenta/fuchsia).
12. App Shell Integration (`src/App.jsx`) structure check.

## Acceptance Criteria
- Build passes (`npm run build`).
- Lint passes with zero errors.
- All 12 test cases pass in `tests/integration-framework.test.js`.
- Tenant isolation enforced for `fac-naples-01`.
- Clean light and dark mode design adhering to Maestro Clinical Design System.

## Dependencies
- Phase 14: CFO Dashboard & Financial Accounting (P&L, budget, cash, scenario, and ROI boundaries).
- Core Tenancy: `public.facilities` master table.

## Definition of Done
The feature is complete when the database schema, core calculation services, UI components, App shell integration, test suites, and documentation are all merged, verified with 0 errors, and committed.

## Implementation Notes
- Migration: `supabase/migrations/122_integration_framework.sql` and `122_integration_framework_down.sql`
- Service: `src/services/integrationFrameworkService.js` and `src/lib/integrationFrameworkService.js`
- Component: `src/components/IntegrationFrameworkView.jsx` and `src/components/IntegrationFrameworkView.css`
- App Shell: `src/App.jsx`
- Test Suite: `tests/integration-framework.test.js`
