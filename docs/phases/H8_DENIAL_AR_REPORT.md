# H8 DENIAL AR REPORT

## Purpose
Executive Denial Intelligence, GAAP 6-Bucket Accounts Receivable (AR) Aging, Days Sales Outstanding (DSO), Timely Filing Risk, and Appeals Recovery Report under Module 17 (`RPT-H8-DENIAL-AR`).

## Scope
- Define production requirements for **Phase H8: Denial & AR Report (`RPT-H8-DENIAL-AR`)**.
- Preserve full compatibility with Module 12 RCM operational engines (`denialsService.js`, `arAgingService.js`, `appealsService.js`, `carcRarcService.js`, `denialPrioritizationService.js`).
- Enforce conserved GAAP AR aging bucket reconciliation, deterministic expected recovery math, organization/facility tenancy, RBAC, and SHA-256 provenance seals (`sha256_dar_`).

---

## Current State
- `src/lib/denialsService.js` + `DenialsModelView.jsx`: **KEEP** (Module 12 operational denial queue management & CARC taxonomy).
- `src/lib/arAgingService.js` + `ArAgingView.jsx`: **KEEP** (Module 12 GAAP 6-bucket DOS & Bill Date AR collector work queues).
- `src/lib/appealsService.js` + `AppealsWorkflowView.jsx`: **KEEP** (Module 12 multi-tier payer dispute workflow).
- `src/services/carcRarcService.js` + `denialPrioritizationService.js`: **KEEP** (Module 12 WEDI/X12 normalization & recovery scoring).
- `src/services/reportingArchitectureService.js` (`RPT-H8-DENIAL-AR`): **REFACTOR / INTEGRATE** (catalog metadata exists; connect H8 edition snapshots & H0 dispatch receipts).
- Governed H8 Denial & AR Report tables (`dar_*`), conserved AR aging edition snapshots, executive recovery action audit trail, and reporting workspace (`DenialArReportView.jsx`): **MISSING** (implemented in Phase H8).

---

## Target State
Provide CFOs, controllers, and RCM billing leads a periodic **Denial & AR Aging Report** unifying:
1. **Conserved GAAP 6-Bucket AR Aging Schedule** (`0–30`, `31–60`, `61–90`, `91–120`, `121–180`, `181+` Days) reconciling exact Gross AR ($) and `AR > 90 Days %`.
2. **Days Sales Outstanding (DSO)** computed against trailing 90-day net patient credit revenue.
3. **Prioritized Denial Workqueue & CARC Root-Cause Clusters** ranked deterministically by Expected Recovery ($) and Timely Filing threat deadlines.
4. Sealed **Appeals / Corrected Claim / Write-Off Approval Log** + **H0 (`RPT-H8-DENIAL-AR`) Dispatch**.

---

## Data Model / Schema
Implemented in `supabase/migrations/146_denial_ar_report.sql` (and `_down.sql`):
- `public.dar_configs`: DSO benchmark (`35` days), max AR > 90 days ceiling (`12.00%`), first-pass resolution target (`92.00%`), timely filing warning threshold (`14` days), masked secret (`dar_sec_****_...`).
- `public.dar_report_editions`: Periodic snapshots (`edition_code`, `period_code`, `total_gross_ar_usd`, `ar_over_90_usd`, `ar_over_90_pct`, `calculated_dso_days`, `open_denied_exposure_usd`, `expected_appeal_recovery_usd`, `sha256_report_seal`).
- `public.dar_aging_snapshots`: 6 GAAP aging buckets (`0_30`, `31_60`, `61_90`, `91_120`, `121_180`, `181_PLUS`) per edition with claim counts, AR dollars, share %, expected collectible $, and risk tier.
- `public.dar_denial_workqueue`: Ranked denied claims with CARC code, denial category, exposure $, recovery %, expected recovery $, timely filing countdown, `urgency_tier`, `appeal_status`, and `sha256_item_seal`.
- `public.dar_carc_root_causes`: CARC denial cluster rollups by claim volume, exposure, and recovery yield.
- `public.dar_appeal_resolutions`: Sealed appeal/rebill/write-off decision log (`SUBMIT_LEVEL_1_APPEAL`, `MEDICAL_NECESSITY_ADDENDUM`, `REBILL_CORRECTED_CLAIM`, `APPROVE_WRITEOFF`).
- `public.dar_dispatch_logs`: Sealed H0 (`RPT-H8-DENIAL-AR`) dispatch receipts.
- `public.vw_dar_telemetry`: Facility KPI summary view.
- Idempotent RLS policies (`app.current_facility_id`) on all 7 tables.

---

## Business Rules
- **Expected Recovery & Urgency Classification**:
  - `expected_recovery_usd = Number((denied_exposure_usd * (recovery_probability_pct / 100)).toFixed(2))`
  - `CRITICAL_FILING_THREAT`: `days_to_timely_filing <= timely_filing_warning_days && denied_exposure_usd > 0 && recovery_probability_pct >= 25`
  - `LOW_RECOVERY_WRITEOFF`: `recovery_probability_pct < 25`
  - `HIGH_VALUE_APPEAL`: `expected_recovery_usd >= 5000`
  - Otherwise: `STANDARD_FOLLOWUP`
- **GAAP AR Bucket Conservation Identity**:
  - `SUM(buckets 0_30 .. 181_PLUS) === total_gross_ar_usd` (`ERR_DAR_AR_CONSERVATION_MISMATCH` if mismatch > `$0.05`)
  - `ar_over_90_usd === SUM(buckets 91_120, 121_180, 181_PLUS)`
- **DSO Identity**:
  - `calculated_dso_days = trailing_90_credit_rev > 0 ? Number(((total_gross_ar_usd / trailing_90_credit_rev) * 90).toFixed(1)) : 0.0`
- **Appeal/Write-Off Guard**: Notes `>= 5` characters (`ERR_DAR_NOTE_REQUIRED`) and non-negative `claimed_recovery_usd`.

---

## Permissions / Security
- Viewable by `Facility Administrator`, `CFO / Finance Director`, `Controller`, and `RCM Billing Lead`.
- Write-offs (`APPROVE_WRITEOFF`) and DSO threshold updates restricted to Administrator / CFO / RCM Lead roles and fully audited.
- Tenant isolation enforced via `normalizeFacilityId` and Postgres RLS (`app.current_facility_id`).

---

## API / Service Requirements
Exported identically from `src/services/denialArReportService.js` and `src/lib/denialArReportService.js`:
- `normalizeFacilityId`, `computeDarProvenanceSeal`, `maskDarSecret`, `evaluateDenialItem`, `calculateDsoDays`, `verifyArBucketConservation`
- `getDarConfig`, `updateDarConfig`, `getDarTelemetry`, `getDarEditions`, `getDarAgingSnapshots`, `getDarDenialWorkqueue`, `getDarCarcRootCauses`, `getDarAppealResolutions`, `getDarDispatchLogs`
- `compileDenialArEdition`, `recordAppealResolutionAction`, `dispatchDenialArDigest`

---

## UI / Workflow Requirements
Implemented in `src/components/DenialArReportView.jsx` & `.css`:
- **4-Card Telemetry Ribbon**: Total Gross AR ($ & DSO Days), AR > 90 Days (% & $), Open Denied Exposure ($), and Expected Appeal Recovery ($) + SHA-256 Seal.
- **4 Subtabs**:
  1. *Denial Recovery Workqueue*: Urgency & Denial Category filters, responsive anti-clipping table + Claim Exposure/Filing Countdown inspector, and Sealed Appeal / Write-Off Action form.
  2. *GAAP 6-Bucket AR Aging*: Full 6-tier schedule (`0–30` through `181+`) verifying `100.0%` conserved Gross AR.
  3. *CARC Root-Cause Clusters*: Payer & reason-code breakdown identifying systemic coding/prior-auth friction.
  4. *Appeals Audit Log & H0 Dispatches*: Sealed appeal decisions and H0 (`RPT-H8-DENIAL-AR`) dispatch history + *DSO & Filing Thresholds Modal*.

---

## Audit / Provenance
Every compiled edition, denial workqueue item, appeal/write-off action, and H0 dispatch stores an immutable 64-character `sha256_dar_` digest using browser-safe `sha256Hex`.

---

## QA / Test Cases
Defined in `tests/denial-ar-report.test.js` (12 automated tests):
1. Facility telemetry accuracy (Gross AR, DSO, AR > 90%, Open Denials, Expected Recovery) & `sha256_dar_` seal check.
2. Facility UUID alias resolution across strings and objects.
3. Config retrieval, masked secret (`dar_sec_****_...`), and invalid DSO/filing bounds (`ERR_DAR_INVALID_CONFIG`).
4. `evaluateDenialItem` and `calculateDsoDays` deterministic math, urgency classification (`CRITICAL_FILING_THREAT` / `LOW_RECOVERY_WRITEOFF`), and zero-denominator guard.
5. Urgency & Denial Category filtering across workqueue items.
6. Compiling a new edition enforces `verifyArBucketConservation` and computes conserved totals & DSO.
7. Recording appeal/write-off action enforces `>=5` char note (`ERR_DAR_NOTE_REQUIRED`) and creates sealed audit entry.
8. GAAP 6-bucket AR aging snapshots & CARC root causes return reconciled Naples data summing cleanly.
9. H0 `dispatchDenialArDigest` logs sealed dispatch receipt.
10. Dual facade parity between `src/services/denialArReportService.js` and `src/lib/denialArReportService.js`.
11. Migration 146 UP/DOWN SQL structural integrity (7 tables, view, RLS, idempotent seeds).
12. Zero prohibited color tokens (`purple`, `violet`, `indigo`, `magenta`, `fuchsia`), dark `<select>`/`<option>` + anti-clipping CSS, browser-safe crypto, and `App.jsx` shell wiring.

---

## Acceptance Criteria
- ESLint (`0 errors`), full regression suite across F0–F9, G0–G5, H0–H8, and `npm run build` pass cleanly.
- Responsive light & dark UI verified with zero horizontal clipping.

---

## Dependencies
- Upstream Modules: H0 (`reportingArchitectureService`), Module 12 (`denialsService`, `arAgingService`, `appealsService`, `carcRarcService`).

---

## Definition of Done
Complete when Migration 146 UP/DOWN SQL, `denialArReportService.js` + `src/lib` facade, `DenialArReportView.jsx`/`.css`, `src/App.jsx` wiring (`denial_ar_report`), 12/12 H8 tests, full test suite, ESLint, Vite build, and spec updates are verified and committed to `reporting-works`.

---

## Implementation Notes
- **Commit Target Branch:** `reporting-works`
- **Database Migration:** `supabase/migrations/146_denial_ar_report.sql` & `146_denial_ar_report_down.sql`
- **Service & Facade:** `src/services/denialArReportService.js` & `src/lib/denialArReportService.js`
- **UI & Shell:** `src/components/DenialArReportView.jsx`, `src/components/DenialArReportView.css`, `src/App.jsx` (`denial_ar_report`)
- **Verification Test Suite:** `tests/denial-ar-report.test.js`
