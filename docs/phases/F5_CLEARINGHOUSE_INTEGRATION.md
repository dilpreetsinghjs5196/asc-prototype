# F5 CLEARINGHOUSE INTEGRATION

## Purpose
The Clearinghouse Integration module establishes an enterprise-grade EDI gateway, claims transmission engine, and electronic remittance advice (ERA) adjudication processor connecting the ASC Analyst platform to major healthcare clearinghouses (Availity, Change Healthcare/Optum, Waystar, Experian Health).

In ambulatory surgery center revenue cycle management (RCM), clearinghouses serve as the authoritative transit hub between healthcare providers and commercial/governmental payers. Phase F5 automates the generation and transmission of ANSI ASC X12 837 institutional (837I / UB-04 bill type 831) and professional (837P / CMS-1500) claims, parses EDI 999 functional acknowledgments and EDI 277CA claim-level acknowledgments, validates transactions against WEDI SNIP Levels 1 through 7, and ingests ANSI ASC X12 835 remittance advice with strict mathematical balancing verification and cryptographic audit provenance.

---

## Scope
- Define production requirements for the Clearinghouse EDI Gateway:
  1. **Connector Configuration (`clearinghouse_connector_configs`)**: Facility-level clearinghouse vendor setup (Availity, Change Healthcare, Waystar), dual REST/SFTP endpoints, Submitter ID, Receiver ID, OAuth2 / SFTP credentials, and WEDI SNIP level enforcement.
  2. **Transmission Batches (`clearinghouse_transmission_batches`)**: Bidirectional interchange logging tracking outbound 837 batches, inbound 835 remittances, 999 syntax acknowledgments, and 277CA claim status updates with duration and record counts.
  3. **Claim Records Ledger (`clearinghouse_claim_records`)**: Claim-level tracking capturing patient control number (PCN), bill type, total billed charges, payer ID, format (837I vs 837P), WEDI SNIP validation status, and lifecycle transitions (`TRANSMITTED` $\rightarrow$ `ACCEPTED_999` $\rightarrow$ `ACCEPTED_277CA` $\rightarrow$ `PAID` / `DENIED`).
  4. **835 Remittance Adjudication Engine (`clearinghouse_remit_adjudications`)**: Automated processing of Electronic Remittance Advice (ERA) CLP segments, validating the fundamental healthcare balancing invariant:
     $$\text{Total Billed} - \text{Contractual Adjustment} (\text{CAS}_{\text{CO}}) - \text{Payer Paid} - \text{Patient Responsibility} (\text{CAS}_{\text{PR}}) = 0$$
  5. **Clearinghouse Exception Workqueue (`clearinghouse_exception_logs`)**: Real-time quarantine of SNIP 1–7 syntax violations, 999 rejections, 277CA claim-level errors, unmapped payer identifiers, and remittance balancing discrepancies.
  6. **Cryptographic Provenance (`clearinghouse_provenance_ledger`)**: SHA-256 immutable audit logging linking every transmitted batch and ingested ERA to facility tenancy.
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
| `src/services/hstIntegrationService.js` | **KEEP** | HST Pathways EHR/PMS integration gateway (Phase F4). |
| `public.clearinghouse_connector_configs` | **MISSING** | Facility-level clearinghouse gateway credentials, Submitter/Receiver IDs, and connection state. |
| `public.clearinghouse_transmission_batches` | **MISSING** | Execution logs tracking outbound 837 claim dispatches and inbound 835 remittances. |
| `public.clearinghouse_claim_records` | **MISSING** | Granular claim tracking linked to patient control numbers, bill types, and SNIP status. |
| `public.clearinghouse_remit_adjudications` | **MISSING** | Normalized 835 ERA remittance lines with CARC/RARC codes and balancing verification. |
| `public.clearinghouse_exception_logs` | **MISSING** | Quarantine workqueue for clearinghouse rejections and balancing discrepancies. |
| `public.clearinghouse_provenance_ledger` | **MISSING** | Immutable cryptographic audit ledger recording clearinghouse payload checksums and seals. |
| `src/services/clearinghouseIntegrationService.js` | **MISSING** | Core calculation service handling EDI 837 dispatch, SNIP validation, and 835 balancing. |
| `src/components/ClearinghouseIntegrationView.jsx` | **MISSING** | UI dashboard displaying gateway health, telemetry, 5-stage pipeline, and 4 audit subtabs. |

---

## Target State
1. **Automated Clearinghouse EDI Gateway Architecture**:
   - Dual-protocol transport:
     - **REST API Gateway**: Real-time claim submission, eligibility queries, and immediate 999 retrieval over HTTPS mTLS.
     - **Secure FTP (SFTP)**: High-volume batch claim drops and scheduled 835 ERA file pickups via SSH File Transfer Protocol.
   - Intelligent status resolution:
     - Automated matching of 999 functional acknowledgments (`A` = Accepted, `R` = Rejected).
     - Automated parsing of 277CA claim acknowledgment STC status codes.
2. **Deterministic WEDI SNIP Levels 1–7 Validation Engine**:
   - SNIP 1 (EDI Syntax): Valid ISA/GS envelopes, delimiters (`*`, `:`, `~`), mandatory segment presence.
   - SNIP 2 (HIPAA Rules): Element length restrictions, required loops, ASC X12 5010 segment counts.
   - SNIP 3 (Balancing): Service line charge sum equals claim total billed charge.
   - SNIP 4 (Situational): Conditional dependencies (e.g. accident indicator requires accident date and state).
   - SNIP 5 (External Code Sets): Valid CPT-4/HCPCS codes, ICD-10-CM diagnosis codes, POS codes.
   - SNIP 6 (Product/Specialty): ASC bill type `831` (Ambulatory Surgery Center), valid rendering taxonomy.
   - SNIP 7 (Trading Partner): Valid payer ID matching clearinghouse routing tables.
3. **Deterministic 835 Remittance Balancing Math**:
   - Authoritative formula:
     $$\Delta = \text{Total Billed} - \text{Contractual Adjustment} - \text{Payer Paid} - \text{Patient Responsibility}$$
   - Any claim where $|\Delta| > 0.00$ is flagged as `REMIT_IMBALANCE` and routed to the exception workqueue.
4. **Cryptographic Provenance**:
   - Generates an immutable SHA-256 seal for every transmission batch:
     $$\text{Seal} = \text{SHA-256}(\text{facility\_id} \parallel \text{batch\_control\_number} \parallel \text{claim\_count} \parallel \text{total\_billed} \parallel \text{status})$$

---

## Data Model / Schema
Database tables, indexes, RLS policies, and views defined in `supabase/migrations/127_clearinghouse_integration.sql`:

```sql
-- 1. Clearinghouse Connector Configuration Table
CREATE TABLE IF NOT EXISTS public.clearinghouse_connector_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    clearinghouse_vendor VARCHAR(64) NOT NULL DEFAULT 'AVAILITY' CHECK (
        clearinghouse_vendor IN ('AVAILITY', 'CHANGE_HEALTHCARE', 'WAYSTAR', 'EXPERIAN_HEALTH', 'TRIZETTO')
    ),
    gateway_mode VARCHAR(32) NOT NULL DEFAULT 'REST_SFTP' CHECK (
        gateway_mode IN ('REST_API', 'SFTP', 'REST_SFTP', 'HYBRID')
    ),
    api_endpoint_url VARCHAR(255) NOT NULL,
    sftp_host VARCHAR(255),
    sftp_port INT DEFAULT 22,
    submitter_id VARCHAR(64) NOT NULL,
    receiver_id VARCHAR(64) NOT NULL,
    client_id VARCHAR(128) NOT NULL,
    client_secret_encrypted TEXT,
    auto_batch_schedule VARCHAR(32) NOT NULL DEFAULT 'DAILY_5PM',
    connection_status VARCHAR(24) NOT NULL DEFAULT 'CONNECTED' CHECK (
        connection_status IN ('CONNECTED', 'TRANSMITTING', 'PAUSED', 'ERROR', 'DISCONNECTED')
    ),
    health_status VARCHAR(24) NOT NULL DEFAULT 'HEALTHY' CHECK (
        health_status IN ('HEALTHY', 'DEGRADED', 'UNHEALTHY')
    ),
    wedi_snip_level INT NOT NULL DEFAULT 7 CHECK (wedi_snip_level BETWEEN 1 AND 7),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_clearinghouse_config UNIQUE (facility_id)
);

-- 2. Clearinghouse Transmission Batches Ledger Table
CREATE TABLE IF NOT EXISTS public.clearinghouse_transmission_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_control_number VARCHAR(64) NOT NULL,
    transmission_type VARCHAR(24) NOT NULL CHECK (
        transmission_type IN ('OUTBOUND_837I', 'OUTBOUND_837P', 'INBOUND_835', 'INBOUND_999', 'INBOUND_277CA')
    ),
    direction VARCHAR(16) NOT NULL CHECK (direction IN ('OUTBOUND', 'INBOUND')),
    status VARCHAR(24) NOT NULL DEFAULT 'COMPLETED' CHECK (
        status IN ('QUEUED', 'TRANSMITTING', 'COMPLETED', 'ACKNOWLEDGED_999', 'ACCEPTED_277CA', 'REJECTED', 'ERROR')
    ),
    claim_count INT NOT NULL DEFAULT 0,
    total_billed_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    total_paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    acknowledgment_999_code VARCHAR(16),
    claim_ack_277ca_code VARCHAR(16),
    duration_ms INT NOT NULL DEFAULT 0,
    sha256_sync_seal VARCHAR(128) NOT NULL,
    transmitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_batch_control UNIQUE (facility_id, batch_control_number)
);

-- 3. Clearinghouse Claim Records Ledger Table
CREATE TABLE IF NOT EXISTS public.clearinghouse_claim_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES public.clearinghouse_transmission_batches(id) ON DELETE SET NULL,
    patient_control_number VARCHAR(64) NOT NULL,
    platform_case_id UUID,
    patient_name VARCHAR(128) NOT NULL,
    subscriber_member_id VARCHAR(64) NOT NULL,
    payer_name VARCHAR(128) NOT NULL,
    payer_id VARCHAR(32) NOT NULL,
    claim_format VARCHAR(16) NOT NULL DEFAULT '837I' CHECK (claim_format IN ('837I', '837P')),
    bill_type VARCHAR(8) NOT NULL DEFAULT '831',
    total_billed_charge NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    claim_status VARCHAR(24) NOT NULL DEFAULT 'TRANSMITTED' CHECK (
        claim_status IN ('READY', 'TRANSMITTED', 'ACCEPTED_999', 'ACCEPTED_277CA', 'REJECTED', 'PAID', 'DENIED', 'UNDERPAID')
    ),
    wedi_snip_status VARCHAR(24) NOT NULL DEFAULT 'PASSED_SNIP_7' CHECK (
        wedi_snip_status IN ('PASSED_SNIP_7', 'PASSED_SNIP_4', 'WARNING_SNIP_5', 'FAILED_SNIP_1', 'FAILED_SNIP_2', 'FAILED_SNIP_3')
    ),
    error_description TEXT,
    service_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_pcn UNIQUE (facility_id, patient_control_number)
);

-- 4. Clearinghouse Remittance Adjudications Ledger Table
CREATE TABLE IF NOT EXISTS public.clearinghouse_remit_adjudications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES public.clearinghouse_transmission_batches(id) ON DELETE SET NULL,
    claim_record_id UUID REFERENCES public.clearinghouse_claim_records(id) ON DELETE CASCADE,
    patient_control_number VARCHAR(64) NOT NULL,
    payer_claim_control_number VARCHAR(64) NOT NULL,
    billed_charge NUMERIC(12,2) NOT NULL,
    allowed_amount NUMERIC(12,2) NOT NULL,
    paid_amount NUMERIC(12,2) NOT NULL,
    contractual_adjustment NUMERIC(12,2) NOT NULL,
    patient_responsibility NUMERIC(12,2) NOT NULL,
    carc_codes TEXT[] NOT NULL DEFAULT '{}',
    rarc_codes TEXT[] NOT NULL DEFAULT '{}',
    is_balanced BOOLEAN NOT NULL DEFAULT TRUE,
    remit_status VARCHAR(24) NOT NULL DEFAULT 'ADJUDICATED' CHECK (
        remit_status IN ('ADJUDICATED', 'DENIED', 'REVERSAL', 'IMBALANCED')
    ),
    check_eft_trace_number VARCHAR(64) NOT NULL,
    check_eft_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_remit_claim UNIQUE (facility_id, patient_control_number, payer_claim_control_number)
);

-- 5. Clearinghouse Exception Logs Table
CREATE TABLE IF NOT EXISTS public.clearinghouse_exception_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES public.clearinghouse_transmission_batches(id) ON DELETE CASCADE,
    claim_record_id UUID REFERENCES public.clearinghouse_claim_records(id) ON DELETE SET NULL,
    exception_code VARCHAR(32) NOT NULL,
    exception_category VARCHAR(32) NOT NULL CHECK (
        exception_category IN ('SYNTAX_999', 'CLAIM_STATUS_277CA', 'SNIP_VALIDATION', 'REMIT_IMBALANCE', 'UNMAPPED_PAYER')
    ),
    severity VARCHAR(16) NOT NULL CHECK (severity IN ('CRITICAL', 'WARNING', 'INFO')),
    offending_segment VARCHAR(128),
    resolution_action VARCHAR(64) NOT NULL DEFAULT 'PENDING_BILLER_REVIEW',
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Clearinghouse Provenance Ledger Table
CREATE TABLE IF NOT EXISTS public.clearinghouse_provenance_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES public.clearinghouse_transmission_batches(id) ON DELETE CASCADE,
    event_type VARCHAR(48) NOT NULL,
    records_impacted INT NOT NULL DEFAULT 0,
    sha256_seal VARCHAR(128) NOT NULL,
    operator_id VARCHAR(64) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Business Rules

### Rule 1: WEDI SNIP Levels 1–7 Pre-Flight Validation
Before generating an EDI 837 batch, every claim record must pass pre-flight validation up to the configured SNIP level:
- If `wedi_snip_level >= 1`: Delimiters (`*`, `~`, `:`) must not appear in unescaped data values; mandatory header (ISA, GS, ST, BHT) segments must be present.
- If `wedi_snip_level >= 2`: ASC X12 5010 segment element count limits are enforced.
- If `wedi_snip_level >= 3`: Claim total charge must equal the sum of line item charges ($\sum \text{SV203} = \text{CLM02}$).
- If `wedi_snip_level >= 5`: Valid CPT/HCPCS 5-character procedural code and ICD-10 diagnosis code format.
- If `wedi_snip_level >= 6`: Ambulatory surgery center institutional claims must specify bill type `831` (Freestanding ASC).
- If `wedi_snip_level >= 7`: Valid active clearinghouse payer ID.

### Rule 2: Deterministic 835 Remittance Balancing Check
For every 835 remittance line parsed from an ERA file, the adjudicator enforces:
$$\text{Billed Charge} - \text{Contractual Adjustment} - \text{Payer Paid} - \text{Patient Responsibility} = 0.00$$
Where:
- $\text{Contractual Adjustment} = \sum \text{CAS}_{\text{CO}}$ (e.g. CARC 45: Fee schedule charges exceed allowable).
- $\text{Patient Responsibility} = \sum \text{CAS}_{\text{PR}}$ (e.g. CARC 1: Deductible, CARC 2: Coinsurance, CARC 3: Copay).
- If the difference $|\Delta| > 0.00$: The record is flagged with `is_balanced = false`, status `IMBALANCED`, and logged as `ERR_REMIT_UNBALANCED`.

### Rule 3: 277CA Acknowledgment Status Progression
Claims update state deterministically upon receipt of 277CA STC segments:
- STC status category `A1` / `A2` (Claim acknowledged / accepted into adjudication) $\rightarrow$ claim status transitions to `ACCEPTED_277CA`.
- STC status category `A3` / `A7` (Returned as unprocessable / Rejected) $\rightarrow$ claim status transitions to `REJECTED`, and an exception record is generated.

### Rule 4: Cryptographic Batch Sealing
Every outbound 837 claim batch and inbound 835 ERA batch generates an immutable SHA-256 seal stored in `clearinghouse_transmission_batches.sha256_sync_seal` and logged in `clearinghouse_provenance_ledger`.

---

## Permissions / Security
- Enforces facility-level tenancy isolation through PostgreSQL Row-Level Security (`app.current_facility_id`).
- Secrets (OAuth2 client secret, SFTP passwords, private keys) are encrypted at rest and masked in all UI responses (`clh_sec_****_9918`).
- RBAC Matrix:
  - `Facility Administrator`: Full read, write, manual batch dispatch, configuration editing, exception resolution.
  - `Billing Specialist`: Read, queue claims, manual batch dispatch, exception resolution.
  - `Financial Analyst`: Read-only access to transmission batches, claim statuses, remittance ledgers, and telemetry.

---

## API / Service Requirements
Backend service module `src/services/clearinghouseIntegrationService.js` and facade `src/lib/clearinghouseIntegrationService.js` provide:
- `getClearinghouseConnectorConfig(facilityId)`: Retrieves facility gateway configuration with masked secrets.
- `getClearinghouseTelemetry(facilityId)`: Computes 24h rolling metrics: transmitted claims, clean acceptance %, total ERA paid, gateway latency.
- `getClearinghouseTransmissionBatches(facilityId)`: Returns transmission batch history with 999 and 277CA statuses.
- `getClearinghouseClaimRecords(facilityId)`: Returns claim-level details and SNIP statuses.
- `getClearinghouseRemitAdjudications(facilityId)`: Returns 835 remittance records with CARC/RARC codes and balancing indicators.
- `getClearinghouseExceptions(facilityId)`: Returns active clearinghouse exceptions.
- `validateWediSnip(claimData)`: Evaluates claims against WEDI SNIP levels 1–7.
- `validate835Balancing(remitData)`: Authoritative mathematical validation of 835 balancing equation.
- `testClearinghouseConnection(facilityId)`: Tests live clearinghouse connectivity.
- `triggerClearinghouseBatchDispatch(facilityId, claimIds)`: Generates and dispatches an 837 batch.
- `ingest835RemittanceBatch(facilityId, payload)`: Parses and commits an inbound 835 ERA payload.
- `resolveClearinghouseException(exceptionId, resolution)`: Resolves a quarantined exception.

---

## UI / Workflow Requirements
Component `src/components/ClearinghouseIntegrationView.jsx` and styling `src/components/ClearinghouseIntegrationView.css`:
- **Header Action Bar**: Live gateway connection pill, clearinghouse vendor badge (Availity EDI Gateway), "Test Connection", "Dispatch 837 Batch", "Ingest 835 ERA".
- **4-Metric Telemetry Ribbon**:
  1. *Outbound Claims (24h)*: Transmitted claim count and total billed volume.
  2. *First-Pass Clean Acceptance Rate*: Percentage of claims passing SNIP 7 and accepted via 999/277CA.
  3. *Total 835 ERA Paid*: Dollar amount of settled payer adjudications.
  4. *Gateway Latency & EDI 999 Speed*: Round-trip acknowledgment latency in milliseconds.
- **5-Stage Visualizer**:
  1. 837 Dispatch (ANSI X12 837I/P Envelope Generation)
  2. 999 Acknowledgment (Syntactic Validation Passed)
  3. 277CA Claim Status (Accepted into Adjudication)
  4. 835 Remit Adjudication (CLP & CARC Ingestion)
  5. Balance & Post (Mathematical Invariant Verified)
- **4 Navigation Subtabs**:
  - *Outbound Claims Queue*: Patient Control Number, format, bill type, patient, payer, billed amount, SNIP level status, actions.
  - *Inbound 835 Remittances & CARC Balancing*: Payer claim control number, check/EFT trace, billed, allowed, paid, contractual adjustment, patient liability, balancing indicator badge, CARC/RARC chips.
  - *Transmission Batches & 999/277CA Logs*: Batch control number, direction, status, claim count, billed/paid sums, 999 code, 277CA code, duration, SHA-256 seal.
  - *Clearinghouse Exceptions Workqueue*: Offending EDI segment, exception code, category, severity, resolution button.
- **Settings Drawer**: Modal to inspect and update gateway credentials, Submitter ID, Receiver ID, and SNIP validation levels.
- **Zero Prohibited Tokens**: Strict adherence to design tokens—no purple, violet, indigo, magenta, fuchsia.
- **Light/Dark Mode Support**: Flawless contrast, `padding: 0` on root container `.clh-container` preventing layout overflow.

---

## Audit / Provenance
- All EDI interchanges, batch transmissions, and remittance ingests record an immutable SHA-256 seal.
- All modifications and exception resolutions log operator ID, timestamp, and audit trail metadata.

---

## QA / Test Cases
Automated test suite `tests/clearinghouse-integration.test.js`:
1. Telemetry returns accurate 24-hour metrics for Naples Surgery Center (`fac-naples-01`).
2. Facility UUID alias resolution matches Naples Surgery Center correctly across strings and objects.
3. Connector configuration retrieval and status verification.
4. Deterministic WEDI SNIP levels 1–7 pre-flight validation (valid claim).
5. Detection and flagging of WEDI SNIP validation errors (invalid CPT format, invalid bill type, missing segments).
6. Deterministic 835 ERA remittance balancing invariant validation ($\text{Billed} - \text{Adj} - \text{Paid} - \text{Patient} = 0$).
7. Detection and flagging of imbalanced 835 remittance lines (`ERR_REMIT_UNBALANCED`).
8. 277CA claim acknowledgment status code resolution (`A1`/`A2` accepted, `A3`/`A7` rejected).
9. Manual 837 batch dispatch execution creates batch record with SHA-256 seal.
10. Dual facade re-export parity between `src/services/` and `src/lib/`.
11. Migration 127 UP/DOWN SQL structural integrity and RLS policies.
12. Strict Zero-Prohibited Token Compliance in `ClearinghouseIntegrationView` and shell integration.

---

## Acceptance Criteria
- Build passes (`npm run build`).
- Lint and type checks pass.
- All 72 tests across Phases F0 through F5 pass without warnings.
- Tenant isolation enforced on all clearinghouse tables via `facility_id`.
- Zero prohibited accent colors present.
- 835 balancing invariant verified mathematically.

---

## Dependencies
- Upstream: Phase F0 (Integration Framework), Phase F1 (Import Validation Pipeline), Phase F4 (HST Pathways Integration).
- Database: Migration 127 (`supabase/migrations/127_clearinghouse_integration.sql`).

---

## Definition of Done
Phase F5 is complete when:
1. Migration 127 and rollback script 127 down are authored with complete RLS, telemetry view, and seeded Naples Surgery Center data.
2. `clearinghouseIntegrationService.js` and facade `src/lib/clearinghouseIntegrationService.js` are fully implemented with deterministic SNIP 1–7 and 835 balancing rules.
3. `ClearinghouseIntegrationView.jsx` and `ClearinghouseIntegrationView.css` are authored with zero prohibited tokens, 5-stage pipeline, 4 subtabs, and settings modal.
4. Shell integration in `src/App.jsx` renders the `'clearinghouse_integration'` tab.
5. 12 automated tests in `tests/clearinghouse-integration.test.js` pass with 100% pass rate.
6. Full test suite (72 tests) and `npm run build` exit code 0.

---

## Implementation Notes
- Migration file: `supabase/migrations/127_clearinghouse_integration.sql`
- Rollback file: `supabase/migrations/127_clearinghouse_integration_down.sql`
- Core service: `src/services/clearinghouseIntegrationService.js`
- Facade: `src/lib/clearinghouseIntegrationService.js`
- View: `src/components/ClearinghouseIntegrationView.jsx`
- Styles: `src/components/ClearinghouseIntegrationView.css`
- Tests: `tests/clearinghouse-integration.test.js`
- App Shell: `src/App.jsx`
- Specifications: `docs/phases/F5_CLEARINGHOUSE_INTEGRATION.md` and `e:\medicalAI\ASCANALYST_All_Modules\ASCANALYST_MD_SPECS\Phase_15_Integrations\F5_CLEARINGHOUSE_INTEGRATION.md`
