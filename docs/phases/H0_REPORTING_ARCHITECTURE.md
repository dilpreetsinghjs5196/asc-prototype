# H0 REPORTING ARCHITECTURE

## Purpose
Phase H0 establishes the unified **Enterprise Reporting Architecture, Filter Normalization, Multi-Format Export, Automated Delivery Scheduling, RBAC Enforcement, and Cryptographic Report Provenance** engine across Module 17 (`H0–H9`) in ASCANALYST. Every executive brief, revenue leakage dossier, CFO financial package, surgeon/payer scorecard, OR block digest, and AR aging export consumes standardized filter contracts, inherits Module 16 data-quality trust gates (Phases G2 & G5), honors strict facility/role RBAC (including AI tool callers), and stamps every output with a reproducible 64-character SHA-256 provenance seal (`sha256_rpt_`).

---

## Scope
- Define production requirements for **Reporting Architecture (Phase H0)**:
  1. **Governance & Trust Gate Config (`rpt_configs`)**: Controls Data Quality Trust Gate enforcement (`enforce_dq_trust_gate`, `min_financial_trust_score >= 75.00%`), draft/provisional watermarking (`watermark_draft_exports`), row export limits (`max_export_rows`), timezone (`America/New_York`), 7-year HIPAA retention (`2555` days), and masked secrets (`rpt_sec_****_...`).
  2. **Canonical Report Registry (`rpt_definitions`)**: Master catalog covering `H1`–`H9` (`RPT-H1-DAILY-BRIEF` through `RPT-H9-BOARD-PKG`), defining permitted export formats (`PDF`, `CSV`, `XLSX`, `JSON`), required permissions, allowed roles, default filter payloads, and upstream source modules.
  3. **Saved Filter Presets (`rpt_saved_filters`)**: Normalized parameter templates enforcing `date_from <= date_to`, facility scoping, and bounded row limits.
  4. **Recurring Delivery Schedules (`rpt_schedules`)**: Validated 5-field cron schedules (`DAILY`, `WEEKLY`, `MONTHLY`, `QUARTERLY`, `ON_CLOSE`) supporting `EMAIL_DIGEST`, `PORTAL_INBOX`, `SFTP_DROP`, and `WEBHOOK` channels.
  5. **Execution Ledger (`rpt_executions`) & Export Artifacts (`rpt_export_artifacts`)**: Reproducible execution snapshots capturing exact filter JSON, DQ trust score at runtime, watermark state, byte size, checksum, and 64-character SHA-256 seal.
  6. **Security & Export Audit Log (`rpt_access_audit`)**: Immutable record of every report view, generation, download, schedule change, and RBAC denial (`ACCESS_DENIED`).
- Preserve full compatibility with existing Phase E6 (`BoardReportingView.jsx`), Phase E7 (`RoiValueReportView.jsx`), and `jsPDF` exports in `SurgeryScheduler.jsx`.

---

## Current State

| Component | Status | Classification | Description |
| :--- | :--- | :--- | :--- |
| `src/services/boardReportingService.js` & `BoardReportingView.jsx` | Exists | **KEEP / INTEGRATE** | Generates Phase E6 Board KPI dossiers with SHA-256 seals (`computeBoardPackageHash`); registers into H0/H9 catalog. |
| `src/services/roiValueReportService.js` & `RoiValueReportView.jsx` | Exists | **KEEP / INTEGRATE** | Generates Phase E7 software ROI validation reports; remains preserved while sharing H0 scheduling & RBAC contracts. |
| `src/components/SurgeryScheduler.jsx` (`jsPDF`) | Exists | **KEEP** | Client-side surgical schedule PDF export utility. |
| `src/services/dqFinancialCompletenessService.js` | Exists | **KEEP** | Supplies Module 16 G2 financial trust score evaluated by H0 trust gates. |
| `public.rpt_*` (7 tables + `vw_rpt_telemetry`) | Non-existent | **MISSING** | Report catalog, saved filter presets, cron delivery schedules, execution runs, export artifacts, and access audit log. |
| `src/services/reportingArchitectureService.js` & facade | Non-existent | **MISSING** | Filter validator, cron parser, RBAC authorization guard, trust-gate watermarker, scheduler, and export artifact generator. |
| `src/components/ReportingArchitectureView.jsx` | Non-existent | **MISSING** | Unified report catalog, interactive generator, schedule manager, artifact ledger, and RBAC audit UI. |

---

## Target State
1. **Single Authoritative Report Generation Pipeline**:
   - All `H1–H9` reports execute through `generateReportRun`, validating `(1)` normalized facility scope, `(2)` date range & row limits, `(3)` caller RBAC permission, and `(4)` Module 16 G2 Trust Gate score.
2. **Deterministic Trust-Gate Watermarking & Blocking**:
   - When `enforce_dq_trust_gate = TRUE`:
     - `score >= min_financial_trust_score` → `CERTIFIED` (clean export, unwatermarked).
     - `50.00 <= score < min_financial_trust_score` → `PROVISIONAL_WATERMARKED` (stamped `"PROVISIONAL — DATA QUALITY BELOW TRUST THRESHOLD"`).
     - `score < 50.00` → `BLOCKED_TRUST_GATE` (`ERR_RPT_TRUST_GATE_BLOCKED`, generation halted).
3. **Unified RBAC Across UI & AI Analysts**:
   - Unauthorized roles (e.g., an external viewer attempting CFO-restricted schedules or PHI exports) are rejected (`ERR_RPT_RBAC_DENIED`) and logged cleanly into `rpt_access_audit` with `access_granted = FALSE`.

---

## Data Model / Schema
Defined in `supabase/migrations/138_reporting_architecture.sql` (and rollback `138_reporting_architecture_down.sql`):
1. `public.rpt_configs`
2. `public.rpt_definitions`
3. `public.rpt_saved_filters`
4. `public.rpt_schedules`
5. `public.rpt_executions` (`sha256_report_seal VARCHAR(128) NOT NULL`)
6. `public.rpt_export_artifacts` (`content_checksum_sha256 VARCHAR(128) NOT NULL`)
7. `public.rpt_access_audit` (`sha256_seal VARCHAR(128) NOT NULL`)
- Telemetry view: `public.vw_rpt_telemetry`.
- Tenant isolation enforced across all 7 tables via RLS policies using `app.current_facility_id`.

---

## Business Rules

### Rule 1: Filter Integrity & Date Ordering
All filter payloads require `date_from <= date_to` and `row_limit <= config.max_export_rows` (`ERR_RPT_INVALID_FILTERS`).

### Rule 2: Strict 5-Field Cron Validation for Schedules
Scheduled jobs require valid 5-field cron expressions (`ERR_RPT_INVALID_CRON`) and at least one delivery target recipient (`ERR_RPT_RECIPIENTS_REQUIRED`).

### Rule 3: RBAC Enforcement for Generation, Export & Scheduling
- Only roles listed in `reportDef.allowed_roles` may generate or export that report (`ERR_RPT_RBAC_DENIED`).
- All denials append an immutable `ACCESS_DENIED` record in `rpt_access_audit`.

### Rule 4: Data Quality Trust-Gate Enforcement
Runtime DQ trust score (`dq_trust_score_at_run`) is snapshotted at generation time; scores `< 50.00` block certified execution when gating is enabled, while `50.00`–`74.99` apply mandatory `PROVISIONAL_WATERMARKED` banners.

### Rule 5: Cryptographic SHA-256 Provenance
Every execution, downloadable artifact, and access audit log emits a 64-character `sha256_rpt_` + 53 hex digest.

---

## Permissions / Security
- Facility RLS (`app.current_facility_id`) isolates filter presets, schedules, executions, and artifacts by tenant.
- Secrets masked cleanly as `rpt_sec_****_...`.
- RBAC Matrix:
  - `Facility Administrator` / `CFO / Finance Director`: Full catalog, scheduling, config updates, and certified PDF/XLSX/CSV export.
  - `Data Operations Steward` / `RCM Billing Lead` / `Medical Director`: Generate and export domain-permitted operational & clinical reports.
  - `AI Analyst`: Strictly honors caller role RBAC; cannot bypass trust gates or create unapproved external delivery schedules.

---

## API / Service Requirements
Implemented in `src/services/reportingArchitectureService.js` and re-exported via `src/lib/reportingArchitectureService.js`:
- `normalizeFacilityId(facilityInput)`
- `computeRptProvenanceSeal(payload)`
- `maskRptSecret(rawSecret)`
- `validateCronExpression(cronExpr)`
- `validateReportFilterPayload(filters, maxRows)`
- `authorizeReportAction(actorRole, reportDef, actionType)`
- `evaluateExportTrustGate(dqTrustScore, minScore, enforceGate)`
- `getRptConfig(facilityInput)` / `updateRptConfig(facilityInput, updates)`
- `getRptTelemetry(facilityInput)`
- `getRptDefinitions(facilityInput, filters)`
- `getRptSavedFilters(facilityInput)` / `saveFilterPreset(facilityInput, payload)`
- `getRptSchedules(facilityInput)` / `createReportSchedule(facilityInput, payload)` / `toggleReportSchedule(facilityInput, scheduleId, options)`
- `getRptExecutions(facilityInput)` / `getRptExportArtifacts(facilityInput)` / `getRptAccessAudit(facilityInput)`
- `generateReportRun(facilityInput, payload)`

---

## UI / Workflow Requirements
Implemented in `src/components/ReportingArchitectureView.jsx` & `ReportingArchitectureView.css`:
- **4-Card Telemetry Ribbon**: Active Report Definitions (`H1–H9`), Enabled Delivery Schedules, Certified Executions Count, and Trust Gate & Latest Seal.
- **4 Subtabs**:
  1. *Report Catalog & Generator*: Category filter, search, selected report contract panel, interactive date/format/role/DQ-score generator form, and trust-gate feedback banner.
  2. *Delivery Schedules (Cron)*: Schedule creation form with 5-field cron validator and toggle active/paused controls.
  3. *Executions & Export Artifacts*: Run ledger showing trust status badges (`CERTIFIED`, `PROVISIONAL_WATERMARKED`, `BLOCKED_TRUST_GATE`), watermark markers, row counts, and SHA-256 seals.
  4. *RBAC & Access Audit Log*: Security log showing granted & denied (`ACCESS_DENIED`) actions + *Governance Config Modal*.

---

## Audit / Provenance
`rpt_executions`, `rpt_export_artifacts`, and `rpt_access_audit` preserve exact filter JSON snapshots, actor identity & role, DQ trust score at runtime, watermark state, checksum, and 64-character `sha256_rpt_` seals.

---

## QA / Test Cases
Defined in `tests/reporting-architecture.test.js` (12 automated test suites):
1. Facility telemetry accuracy & `sha256_rpt_` prefix verification.
2. Facility UUID alias resolution across strings and objects.
3. Config retrieval, secret masking, and row limit/trust threshold update bounds.
4. Filter payload validation (`date_from <= date_to`, `row_limit <= max_export_rows`).
5. Cron expression validation (valid 5-field crons pass; invalid expressions throw `ERR_RPT_INVALID_CRON`).
6. Deterministic RBAC authorization (`authorizeReportAction` grants CFO/Steward and denies unauthorized roles cleanly while logging `ACCESS_DENIED`).
7. Data Quality Trust Gate evaluation (`CERTIFIED`, `PROVISIONAL_WATERMARKED`, `BLOCKED_TRUST_GATE`).
8. End-to-end `generateReportRun` records execution, watermarked/clean artifact, and 64-char SHA-256 seals.
9. Schedule creation & pause/resume toggling (`createReportSchedule`, `toggleReportSchedule`).
10. Dual facade parity between `src/services/reportingArchitectureService.js` and `src/lib/reportingArchitectureService.js`.
11. Migration 138 UP/DOWN SQL structural integrity (7 tables, view, RLS, idempotent seeds).
12. Strict zero prohibited color tokens (`purple`, `violet`, `indigo`, `magenta`, `fuchsia`) + `App.jsx` shell wiring.

---

## Acceptance Criteria
- ESLint and `npm run build` pass with zero errors.
- All automated tests pass across F0–F9, G0–G5, H0, and Phase 76.
- Facility isolation enforced and zero prohibited accent tokens used.

---

## Dependencies
- Upstream Modules: E6 (`boardReportingService`), E7 (`roiValueReportService`), G2 (`dqFinancialCompletenessService`), G5 (`sourceProvenanceService`).

---

## Definition of Done
Complete when Migration 138 UP/DOWN SQL, `reportingArchitectureService.js` + `src/lib` facade, `ReportingArchitectureView.jsx`/`.css`, `src/App.jsx` sidebar wiring, 12/12 H0 tests, full regression suite, ESLint, `npm run build`, and specification updates are verified and committed to branch `reporting-works`.

---

## Implementation Notes
- **Commit Target Branch:** `reporting-works`
- **Database Migration:** `supabase/migrations/138_reporting_architecture.sql` & `138_reporting_architecture_down.sql`
- **Service & Facade:** `src/services/reportingArchitectureService.js` & `src/lib/reportingArchitectureService.js`
- **UI & Shell:** `src/components/ReportingArchitectureView.jsx`, `src/components/ReportingArchitectureView.css`, `src/App.jsx` (`reporting_architecture` tab under `Enterprise Reporting (Phase 17)`)
- **Verification Test Suite:** `tests/reporting-architecture.test.js`
