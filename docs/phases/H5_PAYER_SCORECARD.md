# H5 PAYER SCORECARD

## Purpose
Payer scorecard layout, metrics, contract compliance yields, adjudication velocity, and renewal governance under Enterprise Reporting (Module 17).

## Scope
- Define production requirements for **Phase H5: Payer Scorecard (`RPT-H5-PAYER-CARD`)**.
- Preserve compatibility with Module 11 operational payer views (`payerIntelligenceService.js`, `payerContractPerformanceService.js`, `payerPatternService.js`, `PayerMasterDirectory.jsx`).
- Enforce deterministic 4-pillar conserved contract grading (`100.00%` sum), underpayment variance math, organization/facility tenancy, RBAC, and SHA-256 provenance seals (`sha256_psr_`).

---

## Current State
- `src/services/payerIntelligenceService.js` + `PayerIntelligenceView.jsx`: **KEEP** (Module 11 real-time payer turnaround, denial friction, and AR aging analytics).
- `src/services/payerContractPerformanceService.js` + `PayerContractPerformanceView.jsx`: **KEEP** (Module 11 fee schedule methodologies, contract yield calculation, renewal countdowns, negotiation matrix).
- `src/services/payerPatternService.js` + `PayerUnderpaymentPatternsView.jsx`: **KEEP** (Module 11 CPT/carve-out variance clustering).
- `src/services/reportingArchitectureService.js` (`RPT-H5-PAYER-CARD`): **REFACTOR / INTEGRATE** (catalog metadata exists; connect H5 edition compilation & confidential H0 dispatch receipts).
- Governed H5 Payer Scorecard tables (`psr_*`), conserved 4-pillar grading rubric, negotiation escalation audit log, and dedicated reporting workspace (`PayerScorecardReportView.jsx`): **MISSING** (implemented in this phase).

---

## Target State
Provide facility administrators, CFOs, and RCM billing leads a monthly/quarterly **Payer Reimbursement & Contract Scorecard** ranking contracted payers across 4 conserved pillars:
1. **Contract Yield Compliance (`35.00%`)**: Actual collected vs contracted expected allowed (`(actual / expected) * 100`).
2. **Payment Velocity / DSO (`25.00%`)**: Average Days to Pay from claim submission to ERA 835 settlement vs category benchmark.
3. **First-Pass Clean Claim Rate (`25.00%`)**: `100 - first_pass_denial_pct` benchmarking billing & medical necessity friction.
4. **Carve-Out & Implant Recovery (`15.00%`)**: Percentage of high-cost implant/device carve-outs reimbursed per addendum terms.

Includes **Contract Renewal & Escalation Radar**, **CPT/Carve-Out Variance Drill-Down**, sealed **Negotiation & Underpayment Demand Action Log**, and **H0 (`RPT-H5-PAYER-CARD`) Dispatch**.

---

## Data Model / Schema
Implemented in `supabase/migrations/143_payer_scorecard_report.sql` (and `_down.sql`):
- `public.psr_configs`: Facility-scoped rubric weights (`chk_psr_weights_100` enforcing exact `100.00%` sum), `target_yield_floor_pct`, `target_days_to_pay`, `critical_renewal_window_days`, masked secret (`psr_sec_****_...`), sync/health telemetry.
- `public.psr_category_benchmarks`: Facility peer benchmarks by `payer_category` (`Commercial`, `Medicare`, `Medicare_Advantage`, `Medicaid`, `Workers_Comp`).
- `public.psr_report_editions`: Periodic scorecard runs (`edition_code`, `period_code`, `payers_evaluated`, `avg_composite_score`, `total_net_collections_usd`, `total_underpayment_leakage_usd`, `sha256_report_seal`).
- `public.psr_payer_scorecards`: Ranked per-payer rows with billed charges, expected allowed, actual collected, `underpayment_leakage_usd`, `contract_yield_pct`, `avg_days_to_pay`, `first_pass_denial_pct`, `carveout_recovery_pct`, `days_to_renewal`, `composite_score`, `performance_grade`, and `sha256_card_seal`.
- `public.psr_contract_variance_details`: CPT/carve-out shortfall drill-down (`cpt_code`, `procedure_label`, `contract_allowed_usd`, `actual_paid_usd`, `shortfall_usd`, `variance_reason`).
- `public.psr_negotiation_actions`: Sealed negotiation & demand actions (`RENEGOTIATION_NOTICE`, `UNDERPAYMENT_DEMAND`, `CARVEOUT_AUDIT`, `CONTRACT_SIGN_OFF`).
- `public.psr_dispatch_logs`: Sealed H0 (`RPT-H5-PAYER-CARD`) dispatch logs.
- `public.vw_psr_telemetry`: Facility KPI summary view.
- Strict idempotent tenant-isolation RLS policies on all 7 tables (`app.current_facility_id`).

---

## Business Rules
- **4-Pillar Weight Conservation**: `weight_contract_yield_pct + weight_payment_velocity_pct + weight_clean_claim_rate_pct + weight_carveout_recovery_pct === 100.00` (rejects with `ERR_PSR_INVALID_WEIGHT_SUM`).
- **Contract Yield & Leakage Invariant**:
  - `contract_yield_pct = expected_allowed_usd > 0 ? Number(((actual_collected_usd / expected_allowed_usd) * 100).toFixed(2)) : 0.00`
  - `underpayment_leakage_usd = Number(Math.max(0, expected_allowed_usd - actual_collected_usd).toFixed(2))`
- **Grade Bands**:
  - `>= 88`: `A_PREFERRED`
  - `>= 76`: `B_STANDARD`
  - `>= 64`: `C_FRICTIONAL`
  - `>= 50`: `D_HIGH_RISK`
  - `< 50`: `F_CRITICAL`
- **Negotiation Action Guard**: Minimum 5-character documented rationale (`ERR_PSR_NOTE_REQUIRED`) and non-negative `target_recovery_usd`.

---

## Permissions / Security
- Viewable by `Facility Administrator`, `CFO / Finance Director`, `Controller`, and `RCM Billing Lead`.
- Rubric updates, edition compilation, and contract sign-off restricted to Administrator / CFO / RCM Lead roles.
- Multi-tenant isolation via `normalizeFacilityId` and Postgres RLS (`app.current_facility_id`).

---

## API / Service Requirements
Exported identically from `src/services/payerScorecardReportService.js` and `src/lib/payerScorecardReportService.js`:
- `normalizeFacilityId`, `computePsrProvenanceSeal`, `maskPsrSecret`, `validatePayerWeights`, `evaluatePayerScorecard`
- `getPsrConfig`, `updatePsrConfig`, `getPsrTelemetry`, `getPsrCategoryBenchmarks`, `getPsrEditions`, `getPsrPayerScorecards`, `getPsrContractVariances`, `getPsrNegotiationActions`, `getPsrDispatchLogs`
- `compilePayerScorecardEdition`, `recordPayerNegotiationAction`, `dispatchPayerScorecardDigest`

---

## UI / Workflow Requirements
Implemented in `src/components/PayerScorecardReportView.jsx` & `.css`:
- **4-Card Telemetry Ribbon**: Payers Evaluated, Mean Composite Score, Total Net Collections ($), Underpayment Leakage Exposure ($) + SHA-256 Seal.
- **4 Subtabs**:
  1. *Ranked Payer Scorecards*: Category/Grade filters, responsive full-width/split layout (no horizontal clipping), 4-pillar inspector, CPT shortfall mini-list, and Negotiation/Demand logging form.
  2. *Category Peer Benchmarks*: Target yield, Days to Pay, max denial %, and carve-out benchmarks per payer category.
  3. *Contract Shortfalls & Carve-Outs*: Line-level CPT variance audit across expected vs paid amounts.
  4. *Negotiation Log & H0 Dispatches*: Demand/notice audit trail and H0 (`RPT-H5-PAYER-CARD`) dispatch receipts + *Rubric Weights Modal*.

---

## Audit / Provenance
Every compiled edition, payer card, negotiation action, and dispatch log persists an immutable 64-character `sha256_psr_` digest using browser-safe `sha256Hex`.

---

## QA / Test Cases
Defined in `tests/payer-scorecard-report.test.js` (12 automated tests):
1. Facility telemetry accuracy & `sha256_psr_` seal check.
2. Facility UUID alias resolution across strings and objects.
3. Config retrieval, secret masking (`psr_sec_****_...`), and 4-pillar weight conservation guard (`ERR_PSR_INVALID_WEIGHT_SUM`).
4. `evaluatePayerScorecard` deterministic yield, leakage, 4-pillar scores, grade bands, and zero-denominator guard.
5. Payer scorecard category & grade filtering plus descending composite rank check.
6. Compiling a new edition computes conserved totals, leakage, and ranks cleanly.
7. Recording negotiation action enforces `>=5` char note (`ERR_PSR_NOTE_REQUIRED`) and creates sealed record.
8. Category benchmarks & CPT contract variance drill-down return reconciled Naples records.
9. H0 `dispatchPayerScorecardDigest` logs sealed dispatch receipt.
10. Dual facade parity between `src/services/payerScorecardReportService.js` and `src/lib/payerScorecardReportService.js`.
11. Migration 143 UP/DOWN SQL structural integrity (7 tables, view, RLS, idempotent seeds).
12. Zero prohibited color tokens (`purple`, `violet`, `indigo`, `magenta`, `fuchsia`), dark `<select>`/`<option>` styles, and `App.jsx` shell wiring.

---

## Acceptance Criteria
- ESLint (`0 errors`), full regression suite across F0–F9, G0–G5, H0–H5, and `npm run build` pass cleanly.
- Responsive light & dark UI verified with zero horizontal clipping.

---

## Dependencies
- Upstream Modules: H0 (`reportingArchitectureService`), Module 11 (`payerIntelligenceService`, `payerContractPerformanceService`, `payerPatternService`).

---

## Definition of Done
Complete when Migration 143 UP/DOWN SQL, `payerScorecardReportService.js` + `src/lib` facade, `PayerScorecardReportView.jsx`/`.css`, `src/App.jsx` wiring (`payer_scorecard_report`), 12/12 H5 tests, full test suite, ESLint, Vite build, and spec updates are verified and committed to `reporting-works`.

---

## Implementation Notes
- **Commit Target Branch:** `reporting-works`
- **Database Migration:** `supabase/migrations/143_payer_scorecard_report.sql` & `143_payer_scorecard_report_down.sql`
- **Service & Facade:** `src/services/payerScorecardReportService.js` & `src/lib/payerScorecardReportService.js`
- **UI & Shell:** `src/components/PayerScorecardReportView.jsx`, `src/components/PayerScorecardReportView.css`, `src/App.jsx` (`payer_scorecard_report`)
- **Verification Test Suite:** `tests/payer-scorecard-report.test.js`
