# F2 EXCEL CSV IMPORT

## Purpose
The Excel & CSV Ingestion Engine establishes an enterprise-grade file-based data ingestion, schema mapping, row-level validation, and exception management framework for Phase 15 (Enterprise Healthcare Integrations). While modern ASCs increasingly connect directly to clearinghouses and EHRs via real-time APIs (Phase F0 and F1), a substantial proportion of operational and financial data arrives as spreadsheet exports from legacy scheduling software, third-party billing agencies, vendor implant purchase invoices, and payer contract fee schedule updates.

This specification provides a deterministic, auditable multi-step ingestion lifecycle:
$$\text{File Upload} \longrightarrow \text{Header Auto-Mapping} \longrightarrow \text{Row Validation} \longrightarrow \text{Inline Exception Correction} \longrightarrow \text{Atomic Domain Commit}$$

The engine eliminates manual transcription errors, enforces strict schema adherence, sanitizes healthcare entities (NPI Luhn verification, CPT validation, non-negative currency amounts), isolates tenant data per facility (`facility_id`), and provides cryptographic SHA-256 commit seals for auditable data provenance.

---

## Scope
- Define production requirements for 4 canonical spreadsheet ingestion templates:
  1. **Surgical Cases (`TEMPLATE_SURGICAL_CASES`)**: Case scheduling, date of service, patient MRN, surgeon NPI, OR room, primary CPT, operative minutes, case type.
  2. **835 Remittance Advice (`TEMPLATE_REMITTANCE_835`)**: ERA line items, claim control number, billed amount, allowed amount, paid amount, contractual adjustment, patient responsibility, CARC denial code.
  3. **Implant Purchases (`TEMPLATE_IMPLANT_PURCHASES`)**: Vendor invoices, case reference, vendor name, catalog number, lot/serial number, quantity, unit cost, total purchase cost.
  4. **Payer Fee Schedules (`TEMPLATE_FEE_SCHEDULE`)**: Payer contract allowables by CPT/HCPCS code, modifier, allowable amount, effective start and end dates.
- Deliver automated column header fuzzy matching utilizing alias dictionaries and Levenshtein similarity scoring ($\ge 85\%$ confidence for auto-binding).
- Execute row-by-row syntactic and semantic validation rules:
  - CMS NPI Luhn 10-digit checksum verification.
  - AMA CPT-4 and HCPCS Level II code syntax validation.
  - ISO-8601 date parsing and chronological boundary checks.
  - Strict non-negative currency enforcement ($\ge 0.00$) with 2-decimal financial rounding.
- Provide an interactive inline exception resolution grid allowing authorized staff to correct offending values and re-evaluate validation on the fly before commit.
- Atomically commit clean records to platform domain tables with rollback protection and immutable SHA-256 ingestion audit records.
- Enforce organization and facility tenancy (`facility_id`), RBAC, and zero prohibited color tokens.

---

## Current State
Document what exists today in the repository/database before implementation.

| Component | Status | Description |
| :--- | :--- | :--- |
| `src/services/integrationFrameworkService.js` | **KEEP** | Enterprise connector registry, batch scheduling, and protocol definitions (Phase F0). |
| `src/services/importValidationService.js` | **KEEP** | 6-stage validation pipeline and exception workqueue (Phase F1). |
| `src/components/ImportValidationView.jsx` | **KEEP** | UI for multi-stage pipeline telemetry and exception resolution. |
| `public.excel_import_templates` | **MISSING** | Canonical spreadsheet template definitions, required headers, aliases, and field data types. |
| `public.excel_import_batches` | **MISSING** | File upload batch ledger tracking status, row counts, filename, file hash, and parsing duration. |
| `public.excel_import_staged_rows` | **MISSING** | Staging buffer holding raw parsed rows, normalized fields, validation status, and error messages. |
| `public.excel_import_exceptions` | **MISSING** | Quarantined spreadsheet row exceptions with offending values, error codes, and override audit history. |
| `public.excel_import_provenance_records` | **MISSING** | Cryptographic ledger recording atomic commit events, user attributions, and SHA-256 ingestion seals. |
| `src/services/excelCsvImportService.js` | **MISSING** | Core calculation service handling template schemas, fuzzy column mapping, row validation, inline correction, and atomic commit. |
| `src/components/ExcelCsvImportView.jsx` | **MISSING** | Interactive file dropzone, column mapping wizard, inline exception grid, and batch ledger. |

---

## Target State
1. **Four Ingestion Template Schemas**:
   - `TEMPLATE_SURGICAL_CASES`: Required fields `surgery_date`, `patient_mrn`, `surgeon_npi`, `primary_cpt`, `or_room_name`.
   - `TEMPLATE_REMITTANCE_835`: Required fields `claim_number`, `service_date`, `billed_amount`, `paid_amount`, `allowed_amount`.
   - `TEMPLATE_IMPLANT_PURCHASES`: Required fields `invoice_number`, `vendor_name`, `catalog_number`, `quantity`, `unit_cost`.
   - `TEMPLATE_FEE_SCHEDULE`: Required fields `payer_name`, `cpt_code`, `allowable_amount`, `effective_date`.
2. **Column Header Auto-Mapping**:
   - Normalizes case, removes whitespace, underscores, hyphens.
   - Comprehensive alias dictionaries matching typical EHR/ERP export headers:
     - `surgery_date`: `['surg date', 'date of service', 'dos', 'case date', 'procedure date', 'service date']`
     - `surgeon_npi`: `['npi', 'provider npi', 'surgeon id', 'physician npi', 'doctor npi', 'doc npi']`
     - `primary_cpt`: `['cpt', 'cpt code', 'procedure code', 'hcpcs', 'px code', 'primary px']`
     - `billed_amount`: `['billed', 'charges', 'charge amount', 'gross charges', 'total billed']`
     - `unit_cost`: `['cost', 'unit price', 'item cost', 'purchase price', 'price each']`
3. **Row-Level Syntactic & Semantic Validation Engine**:
   - `ERR_INVALID_NPI`: 10-digit check with Luhn algorithm (`80840` prefix + 9 digits mod 10).
   - `ERR_INVALID_CPT`: 5-character string conforming to `^[0-9]{4}[0-9A-Z]$`.
   - `ERR_INVALID_DATE`: ISO date parsing with sanity boundaries ($2010\text{-}01\text{-}01 \le \text{date} \le \text{today} + 365\text{ days}$).
   - `ERR_INVALID_CURRENCY`: Floating point parse $\ge 0.00$, non-negative.
   - `ERR_MISSING_REQUIRED`: Null, empty, or whitespace-only mandatory fields.
4. **Interactive Inline Exception Correction**:
   - Allows users to edit staged rows directly in the UI.
   - On edit, row is dynamically re-validated; if all errors resolve, the row status transitions from `QUARANTINED` to `VALIDATED`.
5. **Atomic Commit & Provenance Sealing**:
   - Only `VALIDATED` rows are committed.
   - Commit writes records to target operational tables (`surgical_cases`, `case_costs`, `payer_fee_schedules`) within a transactional boundary.
   - Produces a 64-character SHA-256 cryptographic commit seal:
     $$\text{Seal} = \text{SHA-256}(\text{batch\_id} \parallel \text{facility\_id} \parallel \text{row\_count} \parallel \text{timestamp} \parallel \text{user\_id})$$

---

## Data Model / Schema
Database tables, indexes, RLS policies, and views defined in `supabase/migrations/124_excel_csv_import.sql`:

```sql
-- 1. Ingestion Templates Table
CREATE TABLE IF NOT EXISTS public.excel_import_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    template_code VARCHAR(32) NOT NULL,
    template_name VARCHAR(128) NOT NULL,
    description TEXT,
    target_table VARCHAR(64) NOT NULL,
    required_columns JSONB NOT NULL DEFAULT '[]'::jsonb,
    optional_columns JSONB NOT NULL DEFAULT '[]'::jsonb,
    column_aliases JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_import_template UNIQUE (facility_id, template_code)
);

-- 2. File Import Batches Ledger
CREATE TABLE IF NOT EXISTS public.excel_import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_code VARCHAR(32) NOT NULL,
    template_code VARCHAR(32) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    file_size_bytes INT NOT NULL DEFAULT 0,
    file_mime_type VARCHAR(128) NOT NULL,
    file_hash_sha256 VARCHAR(64) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'PARSED' CHECK (
        status IN ('UPLOADED', 'PARSED', 'MAPPING_PENDING', 'VALIDATING', 'EXCEPTION_REVIEW', 'COMMITTED', 'FAILED')
    ),
    total_rows INT NOT NULL DEFAULT 0,
    valid_rows INT NOT NULL DEFAULT 0,
    quarantined_rows INT NOT NULL DEFAULT 0,
    committed_rows INT NOT NULL DEFAULT 0,
    mapping_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    processing_duration_ms INT NOT NULL DEFAULT 0,
    uploaded_by VARCHAR(128) NOT NULL DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    CONSTRAINT unq_facility_excel_batch UNIQUE (facility_id, batch_code)
);

-- 3. Staged Rows Buffer
CREATE TABLE IF NOT EXISTS public.excel_import_staged_rows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.excel_import_batches(id) ON DELETE CASCADE,
    row_index INT NOT NULL,
    raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    mapped_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    validation_status VARCHAR(24) NOT NULL DEFAULT 'PENDING' CHECK (
        validation_status IN ('PENDING', 'VALIDATED', 'QUARANTINED', 'COMMITTED', 'REJECTED')
    ),
    error_count INT NOT NULL DEFAULT 0,
    error_details JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_corrected BOOLEAN NOT NULL DEFAULT FALSE,
    corrected_at TIMESTAMPTZ,
    corrected_by VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Import Row Exceptions Table
CREATE TABLE IF NOT EXISTS public.excel_import_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.excel_import_batches(id) ON DELETE CASCADE,
    staged_row_id UUID NOT NULL REFERENCES public.excel_import_staged_rows(id) ON DELETE CASCADE,
    field_name VARCHAR(64) NOT NULL,
    offending_value TEXT,
    suggested_value TEXT,
    error_code VARCHAR(32) NOT NULL,
    error_message TEXT NOT NULL,
    severity VARCHAR(16) NOT NULL DEFAULT 'CRITICAL' CHECK (severity IN ('CRITICAL', 'WARNING')),
    resolution_status VARCHAR(24) NOT NULL DEFAULT 'UNRESOLVED' CHECK (
        resolution_status IN ('UNRESOLVED', 'MANUALLY_CORRECTED', 'OVERRIDDEN', 'REJECTED')
    ),
    resolution_notes TEXT,
    resolved_by VARCHAR(128),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Provenance & Cryptographic Commit Records
CREATE TABLE IF NOT EXISTS public.excel_import_provenance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.excel_import_batches(id) ON DELETE CASCADE,
    batch_code VARCHAR(32) NOT NULL,
    template_code VARCHAR(32) NOT NULL,
    rows_committed INT NOT NULL,
    sha256_commit_seal VARCHAR(64) NOT NULL,
    committed_by VARCHAR(128) NOT NULL,
    committed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
```

---

## Business Rules
1. **File Constraint Validation**:
   - Allowed file extensions: `.xlsx`, `.xls`, `.csv`.
   - Maximum upload size: $25\text{MB}$.
   - Files with missing headers or 0 data rows immediately fail with `ERR_EMPTY_FILE`.
2. **Column Auto-Mapping Rules**:
   - Header strings are normalized: trim whitespace, convert to lower case, replace non-alphanumeric characters with underscores.
   - If exact match exists in alias list $\rightarrow 100\%$ confidence.
   - If partial substring match exists $\rightarrow 85\%$ confidence.
   - All required template fields must be bound to a spreadsheet column before ingestion proceeds to validation.
3. **Deterministic Row Validation**:
   - **NPI Luhn Algorithm**: Prepend `80840` to the 9-digit prefix, apply Luhn mod 10 check; calculated check digit must match the 10th digit.
   - **CPT Validation**: 5 characters, digits or alphanumeric CMS code.
   - **Currency Amounts**: Must parse to valid float and satisfy amount $\ge 0.00$. Negative values quarantined with `ERR_NEGATIVE_CURRENCY`.
   - **Date Boundaries**: Parsed dates must fall within $2010\text{-}01\text{-}01$ and $\text{today} + 365\text{ days}$.
4. **Inline Correction Rules**:
   - Any user update to a quarantined row resets error count and re-runs row validation rules.
   - If zero errors remain, status changes to `VALIDATED` and `is_corrected` is set to `TRUE`.
5. **Atomic Commit Transaction**:
   - Only rows with status `VALIDATED` can be committed.
   - Commit operation is atomic: partial failures trigger complete transaction rollback.
   - On successful commit, a cryptographic SHA-256 seal is generated and recorded.

---

## Permissions / Security
| Role | View Templates & Batches | Upload Files & Map | Edit Staged Exceptions | Commit to Production | Download Sample Templates |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Super Admin | Yes | Yes | Yes | Yes | Yes |
| Facility Admin | Yes | Yes | Yes | Yes | Yes |
| Financial Analyst | Yes | Yes | Yes | No | Yes |
| Clinical Auditor | Yes | No | No | No | Yes |
| Surgeon | No | No | No | No | No |

---

## API / Service Requirements
The calculation service `src/services/excelCsvImportService.js` provides:
1. `getExcelImportTelemetry(facilityId)`: Computes 24h summary metrics (Total Staged Rows, Clean Rate %, Quarantined Rows, Committed Records, Template Match Score, SHA-256 Seal).
2. `getImportTemplates(facilityId)`: Retrieves canonical template schemas, required/optional columns, and header aliases.
3. `autoMapHeaders(fileHeaders, templateCode)`: Executes fuzzy matching algorithm returning column mapping with confidence scores.
4. `validateRow(rowData, templateCode)`: Evaluates syntactic and semantic rules against a mapped row payload.
5. `uploadAndProcessFile(filePayload, templateCode, facilityId)`: Simulates file intake, header mapping, row staging, and exception detection.
6. `correctStagedRow(stagedRowId, correctedFields, facilityId)`: Applies inline human edits, re-evaluates validation, and updates row status.
7. `commitStagedBatch(batchId, facilityId, user)`: Atomically commits valid rows and generates SHA-256 provenance record.
8. `computeExcelImportSeal(payload)`: Generates 64-character SHA-256 cryptographic digest.

---

## UI / Workflow Requirements
- **Header Control Strip**: Naples Surgery Center badge, Phase F2 Ingestion Engine badge, action buttons (`Download Sample Templates`, `Audit Provenance`).
- **Telemetry Ribbon (6 Cards)**:
  1. *Total Imported Rows*: Volume of rows processed in the active period.
  2. *Clean Ingestion Rate*: Percentage of rows passing validation without error.
  3. *Quarantined Rows*: Volume of rows currently requiring human review.
  4. *Committed Records*: Volume of successfully written domain records.
  5. *Header Match Score*: Average auto-mapping confidence percentage.
  6. *SHA-256 Ingestion Seal*: Truncated cryptographic checksum with tooltip.
- **Interactive File Ingestion Dropzone**:
  - Template selector (Surgical Cases, 835 Remittance, Implant Purchases, Fee Schedules).
  - Drag-and-drop file uploader accepting `.xlsx`, `.xls`, `.csv`.
  - Column Mapping Wizard showing Source Header $\rightarrow$ Target Platform Field with match confidence badges.
- **Sub-Tabs**:
  1. *Staged Rows & Exceptions (Inline Editor)*: Editable grid with validation error badges, offending values, and instant re-validation.
  2. *Batch Ingestion Ledger*: Historical upload runs with timestamps, record counts, file sizes, and status badges.
  3. *Template Schemas & Dictionaries*: Interactive catalog showing required/optional headers and data types.
- **Slide-out Provenance Drawer**: Detailed audit ledger showing SHA-256 commit seals, operator ID, and field-level change history.
- **Design System Standards**:
  - Full support for Light Theme (`--bg-main: #f8fafc`) and Dark Theme.
  - High contrast form inputs (`#ffffff` in light mode with `#cbd5e1` borders).
  - Strict Zero Prohibited Accent Tokens (`purple`, `violet`, `indigo`, `magenta`, `fuchsia`).

---

## Audit / Provenance
Every import batch retains immutable audit provenance:
- Original file metadata: filename, MIME type, size in bytes, SHA-256 file checksum.
- Field remapping history: operator ID, timestamp, before/after mapping configuration.
- Exception corrections: modified cell, original value, corrected value, user ID, timestamp.
- Cryptographic Commit Seal: 64-character SHA-256 digest linking batch payload to facility tenancy.

---

## QA / Test Cases
Automated test suite `tests/excel-csv-import.test.js` covers 12 comprehensive test assertions:
1. Telemetry accuracy (Total rows, clean rate %, exceptions, committed rows, duration, SHA-256 seal).
2. Facility UUID alias resolution matches Naples Surgery Center across strings and objects.
3. Template registry returns all 4 standard schemas with required fields.
4. Header auto-mapping fuzzy match (e.g. "Surg Date", "DOS" $\rightarrow$ `surgery_date`).
5. Row-level validation rules (NPI Luhn verification, CPT format, currency non-negative).
6. File upload and staging creates batch record and transitions status.
7. Inline correction of quarantined row clears error flags and updates status.
8. Batch commit atomically writes rows and records SHA-256 seal.
9. Dual facade re-export parity between `src/services/` and `src/lib/`.
10. Migration 124 UP/DOWN SQL structural integrity and RLS policies.
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
- Domain tables: `facilities`, `surgical_cases`, `case_costs`, `payer_fee_schedules`.

---

## Definition of Done
A feature is complete only when the data model, deterministic logic, permissions, validation, auditability, tests, UI states, documentation, and acceptance criteria are complete.

---

## Implementation Notes
- **Specification**: Written to `docs/phases/F2_EXCEL_CSV_IMPORT.md` and `e:\medicalAI\ASCANALYST_All_Modules\ASCANALYST_MD_SPECS\Phase_15_Integrations\F2_EXCEL_CSV_IMPORT.md`.
- **Database**: Migration `124_excel_csv_import.sql` and `124_excel_csv_import_down.sql`.
- **Backend Services**: `src/services/excelCsvImportService.js` and `src/lib/excelCsvImportService.js`.
- **Frontend Components**: `src/components/ExcelCsvImportView.jsx` and `src/components/ExcelCsvImportView.css`.
- **Shell**: Integrated in `src/App.jsx` under `activeTab === 'excel_csv_import'`.
- **Tests**: `tests/excel-csv-import.test.js` (12 tests, 100% pass rate).
