# 81 837 INGESTION

## Purpose
Define the production-ready Electronic Data Interchange (EDI) 837 Health Care Claim file ingestion, WEDI SNIP syntax and semantic validation, normalization, automated surgical case matching, exception queue resolution, and transaction tracking engine for Ambulatory Surgery Centers (ASCs).

## Scope
- Ingestion of both ASC X12N 837I (005010X223A2) Institutional ASC facility fee claims and ASC X12N 837P (005010X222A1) Professional fee claims.
- Multi-tier syntax and semantic validation adhering to WEDI Strategic National Implementation Process (SNIP) Levels 1 through 4.
- Deterministic automated matching against existing scheduled or completed surgical cases (`public.surgeries`), patients (`public.patients`), and master claims (`public.claims`).
- Exception handling workflows for unmatched claims, duplicate interchange transmissions, syntax rejections, and demographic mismatches.
- Multi-tenancy isolation and Role-Based Access Control (RBAC).

## Current State
Document what exists today in the repository/database before implementation.
- **`public.claims` & `public.claim_lines` (Phase 24/80)**: **KEEP** — Houses production claims and itemized lines. Currently, claims are generated internally from surgical records; no automated inbound parser exists to ingest third-party or clearinghouse EDI 837 files.
- **`public.surgeries` (Phase 01/09)**: **KEEP** — Central case repository against which inbound 837 claims must match.
- **`edi_837_ingestion_batches`**: **MISSING** — Table tracking file uploads, SHA-256 file hashes, ISA control numbers, submitter/receiver identifiers, batch status, claim counts, and totals.
- **`edi_837_staged_claims`**: **MISSING** — Staging area holding parsed claim segments, line items, and match scores prior to ledger commit.
- **`edi_837_ingestion_exceptions`**: **MISSING** — Actionable remediation queue for claims that fail SNIP validation or cannot be deterministically matched to a surgical case.
- **EDI Parser Service & Ingestion UI**: **MISSING** — Server/client service capable of parsing X12 segment envelopes (ISA, GS, ST, CLM, SV2, SV1, SE, GE, IEA), evaluating SNIP rules, and surfacing reconciliation tools to billers.

## Target State
The production-ready 837 Ingestion Engine delivers:
1. **Robust EDI 837 Parser & Normalizer**:
   - Parses standard X12 delimiters (`*` element, `:` sub-element, `~` segment terminator).
   - Extracts Interchange Control Numbers (ISA13), Group Numbers (GS06), Transaction Set IDs (ST02), Submitter Name/ID (Loop 1000A), Receiver Name/ID (Loop 1000B), Billing Provider NPI & Tax ID (Loop 2000A), Subscriber & Patient demographics (Loops 2000B/2000C).
   - Normalizes institutional UB-04 lines (Loop 2400 SV2: Revenue Code, CPT, Modifiers, Charge, Units) and professional CMS-1500 lines (Loop 2400 SV1: CPT, Modifiers, Charge, Units).
2. **WEDI SNIP 1–4 Validation Engine**:
   - **SNIP Level 1 (Integrity)**: Verifies valid X12 syntax, segment ordering, mandatory segments (ISA, GS, ST, BHT, NM1, CLM, SE, GE, IEA), and element delimiters.
   - **SNIP Level 2 (HIPAA Requirements)**: Verifies standard field lengths, 10-digit NPI format (`^[0-9]{10}$`), 9-digit Federal Tax ID / EIN, valid Place of Service code (`24` for ASC).
   - **SNIP Level 3 (Balance Testing)**: Enforces claim-level balance: $\text{CLM02 (Total Billed Charge)} = \sum \text{Line Charges (SV203 or SV102)}$.
   - **SNIP Level 4 (Situational Testing)**: Verifies conditional inter-segment logic (e.g. if patient differs from subscriber in Loop 2000C, relationship code and demographic DOB must exist).
3. **Deterministic 3-Tier Case Matching Engine**:
   - **Tier 1 (Exact Match, 100% Confidence)**: Matches `CLM01 (Patient Control Number)` against `surgeries.case_number` OR Patient MRN + Date of Service + Surgeon NPI.
   - **Tier 2 (High Confidence Match, 90% Confidence)**: Patient First/Last Name + Exact Date of Service + Facility Tenancy.
   - **Tier 3 (Potential Match / Exception, < 80% Confidence)**: Patient Last Name + Date of Service within $\pm 2$ days. Routes to Exception Queue for biller review.
4. **Interactive Exception Resolution Queue**:
   - Unmatched or rejected claims are held in a remediation workspace allowing billers to:
     - Link to an existing unscheduled or manual case.
     - Auto-spawn a new verified surgery record in `public.surgeries`.
     - Reject/discard corrupted or duplicate transmissions.
5. **Auditable Ingestion Ledger**:
   - Retains raw file payloads, file hashes to prevent replay attacks, batch processing telemetry, and actor audit stamps.

## Data Model / Schema
### Required Tables, Indexes, and Constraints

```sql
-- 1. EDI 837 Ingestion Batches Table
CREATE TABLE IF NOT EXISTS public.edi_837_ingestion_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
    batch_number VARCHAR(64) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_hash_sha256 VARCHAR(64) NOT NULL,
    format_type VARCHAR(24) NOT NULL DEFAULT '837I' CHECK (format_type IN ('837I', '837P')),
    isa_control_number VARCHAR(32),
    submitter_identifier VARCHAR(64),
    receiver_identifier VARCHAR(64),
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (
        status IN ('PENDING', 'PROCESSING', 'VALIDATED', 'COMPLETED_WITH_EXCEPTIONS', 'COMPLETED_CLEAN', 'REJECTED')
    ),
    total_claims_count INT NOT NULL DEFAULT 0 CHECK (total_claims_count >= 0),
    matched_claims_count INT NOT NULL DEFAULT 0 CHECK (matched_claims_count >= 0),
    exception_claims_count INT NOT NULL DEFAULT 0 CHECK (exception_claims_count >= 0),
    total_billed_charge NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (total_billed_charge >= 0),
    raw_payload_preview TEXT,
    error_summary TEXT,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ingested_by UUID REFERENCES auth.users(id),
    CONSTRAINT uq_fac_837_hash UNIQUE (facility_id, file_hash_sha256)
);

CREATE INDEX IF NOT EXISTS idx_837_batches_fac ON public.edi_837_ingestion_batches(facility_id, status);
CREATE INDEX IF NOT EXISTS idx_837_batches_date ON public.edi_837_ingestion_batches(facility_id, ingested_at DESC);

-- 2. Staged Claims Extracted from EDI 837
CREATE TABLE IF NOT EXISTS public.edi_837_staged_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES public.edi_837_ingestion_batches(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    patient_control_number VARCHAR(64) NOT NULL,
    subscriber_member_id VARCHAR(64) NOT NULL,
    patient_first_name VARCHAR(100) NOT NULL,
    patient_last_name VARCHAR(100) NOT NULL,
    patient_dob DATE,
    date_of_service DATE NOT NULL,
    billing_provider_npi VARCHAR(10) NOT NULL,
    rendering_provider_npi VARCHAR(10),
    primary_payer_name VARCHAR(128) NOT NULL,
    total_billed_charge NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (total_billed_charge >= 0),
    claim_frequency_code VARCHAR(4) NOT NULL DEFAULT '1',
    line_item_count INT NOT NULL DEFAULT 0 CHECK (line_item_count >= 0),
    snip_validation_status VARCHAR(24) NOT NULL DEFAULT 'PASSED' CHECK (
        snip_validation_status IN ('PASSED', 'FAILED_SNIP1', 'FAILED_SNIP2', 'FAILED_SNIP3', 'FAILED_SNIP4')
    ),
    match_status VARCHAR(32) NOT NULL DEFAULT 'UNMATCHED' CHECK (
        match_status IN ('MATCHED_EXACT', 'MATCHED_PROBABLE', 'UNMATCHED', 'RESOLVED_MANUAL', 'DISCARDED')
    ),
    matched_surgery_id BIGINT REFERENCES public.surgeries(id) ON DELETE SET NULL,
    created_claim_id UUID REFERENCES public.claims(id) ON DELETE SET NULL,
    raw_segments JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_837_staged_batch ON public.edi_837_staged_claims(batch_id, match_status);
CREATE INDEX IF NOT EXISTS idx_837_staged_ctrl ON public.edi_837_staged_claims(facility_id, patient_control_number);

-- 3. Ingestion Exceptions Queue Table
CREATE TABLE IF NOT EXISTS public.edi_837_ingestion_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.edi_837_ingestion_batches(id) ON DELETE CASCADE,
    staged_claim_id UUID NOT NULL REFERENCES public.edi_837_staged_claims(id) ON DELETE CASCADE,
    exception_type VARCHAR(48) NOT NULL CHECK (
        exception_type IN (
            'UNMATCHED_SURGERY_CASE', 'DUPLICATE_CLAIM_SUBMISSION', 'SNIP_SYNTAX_ERROR',
            'NPI_FACILITY_MISMATCH', 'BALANCE_SUM_MISMATCH', 'INVALID_REVENUE_CODE'
        )
    ),
    severity VARCHAR(16) NOT NULL DEFAULT 'ERROR' CHECK (severity IN ('WARNING', 'ERROR', 'FATAL')),
    error_message TEXT NOT NULL,
    resolution_status VARCHAR(24) NOT NULL DEFAULT 'OPEN' CHECK (
        resolution_status IN ('OPEN', 'RESOLVED', 'IGNORED')
    ),
    resolution_action VARCHAR(32),
    resolved_by UUID REFERENCES auth.users(id),
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_837_exceptions_fac ON public.edi_837_ingestion_exceptions(facility_id, resolution_status);

-- 4. Rollup View: EDI 837 Batch Summary
CREATE OR REPLACE VIEW public.vw_edi_837_batch_summary AS
SELECT
    b.id AS batch_id,
    b.facility_id,
    b.batch_number,
    b.file_name,
    b.format_type,
    b.status,
    b.total_claims_count,
    b.matched_claims_count,
    b.exception_claims_count,
    b.total_billed_charge,
    ROUND(CASE WHEN b.total_claims_count > 0 THEN (b.matched_claims_count::numeric / b.total_claims_count) * 100 ELSE 0.00 END, 2) AS auto_match_rate_pct,
    b.ingested_at,
    b.ingested_by
FROM public.edi_837_ingestion_batches b;

-- 5. Row-Level Security (RLS)
ALTER TABLE public.edi_837_ingestion_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edi_837_staged_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edi_837_ingestion_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY batches_select_policy ON public.edi_837_ingestion_batches
    FOR SELECT TO authenticated USING (public.is_facility_accessible(facility_id));

CREATE POLICY batches_insert_policy ON public.edi_837_ingestion_batches
    FOR INSERT TO authenticated WITH CHECK (public.is_facility_accessible(facility_id));

CREATE POLICY staged_claims_select_policy ON public.edi_837_staged_claims
    FOR SELECT TO authenticated USING (public.is_facility_accessible(facility_id));

CREATE POLICY staged_claims_insert_policy ON public.edi_837_staged_claims
    FOR INSERT TO authenticated WITH CHECK (public.is_facility_accessible(facility_id));

CREATE POLICY exceptions_select_policy ON public.edi_837_ingestion_exceptions
    FOR SELECT TO authenticated USING (public.is_facility_accessible(facility_id));

CREATE POLICY exceptions_insert_policy ON public.edi_837_ingestion_exceptions
    FOR INSERT TO authenticated WITH CHECK (public.is_facility_accessible(facility_id));
```

## Business Rules
1. **Replay Protection & Duplicate Detection**:
   - Every file must have its SHA-256 hash evaluated. If `(facility_id, file_hash_sha256)` already exists in `edi_837_ingestion_batches`, the batch is immediately flagged as a duplicate and rejected.
   - Claim-level deduplication: If a claim with identical `patient_control_number` and `date_of_service` exists with `claim_frequency_code = '1'` (Original), the inbound record must be routed to the Exception Queue as `DUPLICATE_CLAIM_SUBMISSION` unless `claim_frequency_code = '7'` (Replacement).
2. **Deterministic SNIP Validation Criteria**:
   - **SNIP 1**: Missing `ISA`, `GS`, `ST`, `BHT`, `NM1*85`, `CLM`, or `SE` is FATAL.
   - **SNIP 2**: Billing NPI must match 10 digits (`^\d{10}$`). POS must equal `24` for ASC claims.
   - **SNIP 3**: Line charge sum must balance: $|\text{CLM02} - \sum \text{Line Charges}| < 0.01$. If variance exists, flag as `BALANCE_SUM_MISMATCH`.
3. **Automated Case Matching Rules**:
   - Match Score 100: Matches `patient_control_number` to `surgeries.case_number`.
   - Match Score 90: Matches Patient First/Last Name + Exact Date of Service (`surgeries.date`).
   - Match Score 60: Matches Patient Last Name + Date of Service within $\pm 2$ days. Held as `MATCHED_PROBABLE` requiring confirmation.
   - Unmatched claims spawn an `UNMATCHED_SURGERY_CASE` exception item.
4. **Line-Item Revenue Code Mapping**:
   - ASC 837I facility claims require valid revenue codes (`0490` for surgical suite, `0272` for sterile supply/implant).

## Permissions / Security
- **View Batches & Ingested Claims**: `biller`, `billing_rcm`, `coder`, `cfo`, `facility_admin`, `super_admin`.
- **Upload & Ingest EDI 837 Files**: `biller`, `billing_rcm`, `facility_admin`, `super_admin`.
- **Resolve Ingestion Exceptions**: `biller`, `billing_rcm`, `facility_admin`, `super_admin`.
- **Tenant Isolation**: Row-Level Security (RLS) ensures users only see batches and claims for accessible facilities.

## API / Service Requirements
The client/backend service (`src/lib/edi837IngestionService.js`) provides:
1. `parseEdi837Content(rawText)`: Parses X12 837 text into structured JS objects (interchange, group, transactions, claims, and lines).
2. `validateSnipRules(parsedClaim)`: Evaluates SNIP levels 1 through 4, returning `{ isValid, level, errors }`.
3. `matchClaimsAgainstSurgeries(stagedClaims, surgeries)`: Executes deterministic 3-tier matching.
4. `calculateBatchSummaryKpis(batches, exceptions)`: Computes facility KPI scorecard.
5. `resolveException(exceptionId, action, surgeryId)`: Updates exception status to `RESOLVED` and links staged claim to surgery.
6. `getBaselineSampleData()`: Provides pre-configured realistic 837I and 837P test batches.

## UI / Workflow Requirements
1. **Executive KPI Ribbon**:
   - Total Batches Processed
   - Average Auto-Match Rate (%)
   - Total Billed Charges Ingested ($)
   - Open Ingestion Exceptions (Count & At-Risk $)
2. **Interactive Ingestion Simulator & File Upload**:
   - Dropzone to upload `.edi`, `.x12`, `.837`, `.txt` files or click "Simulate 837I Batch Ingestion" to run sample files.
3. **4 Master Analytical Tabs**:
   - **Tab 1: Ingestion Batches**: Table of all batches, status badges, claim counts, total charges, and match rates.
   - **Tab 2: Staged Claims & Matching**: Master list of claims in batch, matching scores, target surgery ID, and SNIP status.
   - **Tab 3: Exception Resolution Queue**: Actionable cards/table for claims needing biller intervention (with 1-click "Link to Surgery" modal).
   - **Tab 4: Raw X12 & SNIP Inspector**: Segment viewer with syntax highlighting and element-level explanations.
4. **Exception Resolution Modal**:
   - Allows biller to match an unlinked 837 claim to an existing surgery or approve as a standalone new surgical case.
5. **2-Tier Maestro Search & Filter Bar**:
   - Scoped search input, batch selector, exception status dropdown, and CSV export.

## Audit / Provenance
- Ingested files retain cryptographic SHA-256 hashes in `edi_837_ingestion_batches`.
- Exception resolutions capture the acting biller's user ID, timestamp, before/after resolution state, and notes.
- Downstream claims created in `public.claims` record `source_system_id` referencing the origin 837 batch ID.

## QA / Test Cases
1. **Parser Fidelity**: Parse valid 837I and 837P segments and verify correct extraction of ISA, CLM, and SV2 lines.
2. **SNIP Validation Logic**: Verify SNIP 1 (missing mandatory segment), SNIP 2 (invalid NPI), and SNIP 3 (balance mismatch) trigger appropriate error codes.
3. **Deterministic Case Matching**: Verify exact, probable, and unmatched conditions match target surgeries appropriately.
4. **Replay Protection**: Verify duplicate file hash throws duplicate error.
5. **Maestro Design Compliance**: Zero disallowed purple tokens, responsive layout `<div className="table-responsive">` with `min-width: 1100px`.
6. **App Wiring**: Verify `App.jsx` cleanly renders `Edi837IngestionView` without errors.

## Acceptance Criteria
- Build passes (`npm run build` exits 0).
- All unit and integration tests pass (`tests/edi837-ingestion.test.js` passes 100%).
- Full workspace test suite maintains 100% pass rate.
- No mock/placeholder numbers presented as production truth.
- Tenant isolation is verified via facility-scoped RLS policies.
- P0/P1 issues block release.

## Dependencies
- Phase 01: Multi-Tenancy Core (`public.facilities`, `public.surgeries`)
- Phase 02: RBAC Roles (`biller`, `billing_rcm`, `cfo`)
- Phase 24: Claim Scrubbing Engine
- Phase 80: Claims Model (`public.claims`, `public.claim_lines`, `rcm_status`)

## Definition of Done
The 837 Ingestion feature is complete only when the database schema, X12 parser, SNIP validation rules, case matching logic, exception queue, UI views, tests, and documentation are complete and committed.

## Implementation Notes
- **Specification**: Authored `81_837_INGESTION.md` in `Phase_08_RCM`.
- **Database**: Created migration `055_edi_837_ingestion.sql` and rollback `055_edi_837_ingestion_down.sql`.
- **Services**: Created `src/lib/edi837IngestionService.js` and `src/services/edi837IngestionService.js`.
- **UI Components**: Created `src/components/Edi837IngestionView.jsx` and `src/components/Edi837IngestionView.css`.
- **App Wiring**: Integrated into `src/App.jsx` under Revenue Cycle (RCM) section.
- **Tests**: Created comprehensive suite `tests/edi837-ingestion.test.js`.
