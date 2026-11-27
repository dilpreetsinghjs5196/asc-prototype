# H6 CPT ECONOMICS REPORT

## Purpose
Deterministic procedural unit economics report reconciling net reimbursement, implant/supply/labor direct costs, OR duration consumption, allocated facility overhead, and contribution margin per OR-hour under Module 17 (`RPT-H6-CPT-ECON`).

## Scope
- Define production requirements for **Phase H6: CPT Economics Report (`RPT-H6-CPT-ECON`)**.
- Preserve full compatibility with Module 11 CPT workspaces (`cptEconomicsService.js`, `CptEconomicsView.jsx`, `cptIntelligenceService.js`, `CptIntelligenceView.jsx`, `cptDenialPaymentService.js`).
- Enforce conserved financial accounting (`Net Operating Income = Net Reimbursement - Direct Cost - Allocated Overhead`), tenant isolation, RBAC, and SHA-256 provenance seals (`sha256_cer_`).

---

## Current State
- `src/services/cptEconomicsService.js` + `CptEconomicsView.jsx`: **KEEP** (Module 11 micro-economic modeling & interactive sensitivity tooling).
- `src/services/cptIntelligenceService.js` + `CptIntelligenceView.jsx`: **KEEP** (Module 11 procedural throughput, technique variance, and tiering).
- `src/services/cptDenialPaymentService.js` + `CptDenialPaymentView.jsx`: **KEEP** (Module 11 CPT denial friction & recovery rates).
- `src/services/reportingArchitectureService.js` (`RPT-H6-CPT-ECON`): **REFACTOR / INTEGRATE** (catalog entry exists; wire H6 edition compilation & H0 dispatch logs).
- Governed H6 CPT Economics database schema (`cer_*`), conserved accounting edition store, payer parity matrix, cost optimization audit trail, and reporting workspace (`CptEconomicsReportView.jsx`): **MISSING** (implemented in Phase H6).

---

## Target State
Provide CFOs, facility administrators, and materials/OR directors a governed, auditable **CPT Unit Economics Report** detailing:
1. Per-CPT **Net Reimbursement**, **Direct Cost** (`Implants + Supplies + Direct Labor`), **Contribution Margin ($ & %)**, **OR Duration (min)**, **Allocated Overhead**, **Net Operating Income**, and **Margin / OR-Hour ($/hr)**.
2. **Economic Quadrant Classification**: `PRIME_YIELD_ANCHOR`, `VOLUME_PROFIT_BUILDER`, `MARGIN_SQUEEZE_AT_RISK`, `ECONOMIC_DEFICIT`.
3. **Payer Rate Spread Matrix** per CPT (e.g., Medicare Parity %, BCBS vs UHC net margin variance).
4. **Cost Optimization & Contracting Action Log** + sealed **H0 (`RPT-H6-CPT-ECON`) Dispatch**.

---

## Data Model / Schema
Implemented in `supabase/migrations/144_cpt_economics_report.sql` (and `_down.sql`):
- `public.cer_configs`: Overhead rate per OR-hour (`$450.00`), target margin/OR-hour (`$2,000.00`), minimum contribution margin (`45.00%`), minimum statistical case count (`5`), masked secret (`cer_sec_****_...`).
- `public.cer_specialty_benchmarks`: Facility targets per surgical specialty (`target_margin_per_or_hour_usd`, `target_duration_minutes`, `max_implant_cost_pct`, `target_contribution_margin_pct`).
- `public.cer_report_editions`: Periodic CPT economics snapshots (`edition_code`, `period_code`, conserved totals for volume, net reimbursement, direct cost, allocated overhead, net operating income, `sha256_report_seal`).
- `public.cer_cpt_scorecards`: Ranked procedural economics cards with `cpt_code`, `procedure_label`, `specialty`, `case_count`, `avg_or_duration_minutes`, cost breakdown columns, `margin_per_or_hour_usd`, `economic_quadrant`, and `sha256_card_seal`.
- `public.cer_payer_rate_matrix`: CPT-by-payer reimbursement & Medicare parity breakdown.
- `public.cer_cost_optimization_reviews`: Sealed optimization action records (`IMPLANT_NEGOTIATION`, `PREF_CARD_STANDARDIZE`, `SCHEDULING_OPTIMIZE`, `PAYER_CARVEOUT_ESCALATE`).
- `public.cer_dispatch_logs`: Sealed H0 (`RPT-H6-CPT-ECON`) dispatch logs.
- `public.vw_cer_telemetry`: Facility KPI summary view.
- Idempotent RLS policies (`app.current_facility_id`) on all 7 tables.

---

## Business Rules
- **Unit Accounting Identity**:
  - `avg_direct_cost_usd = avg_implant_cost_usd + avg_supply_cost_usd + avg_labor_cost_usd`
  - `contribution_margin_per_case_usd = avg_net_reimbursement_usd - avg_direct_cost_usd`
  - `allocated_overhead_per_case_usd = (avg_or_duration_minutes / 60) * facility_overhead_per_or_hour_usd`
  - `net_operating_income_per_case_usd = contribution_margin_per_case_usd - allocated_overhead_per_case_usd`
  - `margin_per_or_hour_usd = avg_or_duration_minutes > 0 ? (contribution_margin_per_case_usd / (avg_or_duration_minutes / 60)) : 0.00`
- **Edition Conservation Identity**:
  - `total_net_operating_income_usd === total_net_reimbursement_usd - total_direct_cost_usd - total_allocated_overhead_usd`
- **Quadrant Rules**:
  - `net_operating_income_per_case_usd < 0 || margin_per_or_hour_usd < 800` -> `ECONOMIC_DEFICIT`
  - `margin_per_or_hour_usd >= 2200 && contribution_margin_pct >= 50` -> `PRIME_YIELD_ANCHOR`
  - `contribution_margin_pct < 30` -> `MARGIN_SQUEEZE_AT_RISK`
  - Otherwise -> `VOLUME_PROFIT_BUILDER`
- **Optimization Action Guard**: Notes `>= 5` characters (`ERR_CER_NOTE_REQUIRED`) and `target_savings_per_case_usd >= 0`.

---

## Permissions / Security
- Viewable by `Facility Administrator`, `CFO / Finance Director`, `Controller`, and authorized clinical/materials leads.
- Overhead/benchmark updates, edition compilation, and optimization logging audited by user + role + timestamp.
- Facility isolation enforced via `normalizeFacilityId` and PostgreSQL RLS.

---

## API / Service Requirements
Exported identically from `src/services/cptEconomicsReportService.js` and `src/lib/cptEconomicsReportService.js`:
- `normalizeFacilityId`, `computeCerProvenanceSeal`, `maskCerSecret`, `evaluateCptUnitEconomics`, `verifyEditionConservation`
- `getCerConfig`, `updateCerConfig`, `getCerTelemetry`, `getCerSpecialtyBenchmarks`, `getCerEditions`, `getCerCptScorecards`, `getCerPayerRateMatrix`, `getCerOptimizationReviews`, `getCerDispatchLogs`
- `compileCptEconomicsEdition`, `recordCostOptimizationReview`, `dispatchCptEconomicsDigest`

---

## UI / Workflow Requirements
Implemented in `src/components/CptEconomicsReportView.jsx` & `.css`:
- **4-Card Telemetry Ribbon**: CPTs Evaluated & Case Volume, Net Reimbursement Total ($), Weighted Margin / OR Hour ($/hr), and Total Net Operating Income ($) + SHA-256 Seal.
- **4 Subtabs**:
  1. *CPT Leaderboard*: Specialty & Economic Quadrant filters, responsive anti-clipping table + Unit Cost Decomposition inspector (`Reimbursement` -> `Implants/Supplies/Labor` -> `Contribution` -> `Allocated Overhead` -> `Net Operating Income`), CPT Payer Rate mini-matrix, and Cost Optimization logging form.
  2. *Specialty Benchmarks*: Target Margin/OR Hr, OR Duration target, and Max Implant Cost % targets.
  3. *Payer Rate Matrix*: Payer-by-CPT net reimbursement and Medicare parity spread audit.
  4. *Optimization Log & H0 Dispatches*: Cost optimization audit trail and H0 (`RPT-H6-CPT-ECON`) dispatch receipts + *Cost & Overhead Modal*.

---

## Audit / Provenance
Every compiled edition, CPT card, optimization action, and H0 dispatch stores an immutable 64-character `sha256_cer_` digest computed via browser-safe `sha256Hex`.

---

## QA / Test Cases
Defined in `tests/cpt-economics-report.test.js` (12 automated tests):
1. Facility telemetry accuracy & `sha256_cer_` seal check.
2. Facility UUID alias resolution across strings and objects.
3. Config retrieval, masked secret (`cer_sec_****_...`), and invalid overhead/min-case bounds check (`ERR_CER_INVALID_CONFIG`).
4. `evaluateCptUnitEconomics` unit decomposition, quadrant classification (`PRIME_YIELD_ANCHOR` / `ECONOMIC_DEFICIT`), and 0-minute safe guard.
5. Specialty & quadrant filtering across CPT scorecards.
6. Compiling a new edition enforces `min_cases_for_statistical_validity` filter and satisfies conserved `verifyEditionConservation`.
7. Recording optimization review enforces `>=5` char note (`ERR_CER_NOTE_REQUIRED`) and creates sealed review record.
8. Specialty benchmarks and payer rate matrix accessors return reconciled Naples data.
9. H0 `dispatchCptEconomicsDigest` creates sealed dispatch receipt.
10. Dual facade parity between `src/services/cptEconomicsReportService.js` and `src/lib/cptEconomicsReportService.js`.
11. Migration 144 UP/DOWN SQL structural integrity (7 tables, view, RLS, idempotent seeds).
12. Zero prohibited color tokens (`purple`, `violet`, `indigo`, `magenta`, `fuchsia`), dark `<select>`/`<option>` + anti-clipping CSS, browser-safe crypto, and `App.jsx` shell wiring.

---

## Acceptance Criteria
- ESLint (`0 errors`), full regression suite, and `npm run build` pass cleanly.
- Responsive light & dark UI verified with zero horizontal clipping.

---

## Dependencies
- Upstream Modules: H0 (`reportingArchitectureService`), Module 11 (`cptEconomicsService`, `cptIntelligenceService`, `cptDenialPaymentService`).

---

## Definition of Done
Complete when Migration 144 UP/DOWN SQL, `cptEconomicsReportService.js` + `src/lib` facade, `CptEconomicsReportView.jsx`/`.css`, `src/App.jsx` wiring (`cpt_economics_report`), 12/12 H6 tests, full test suite, ESLint, Vite build, and spec updates are verified and committed to `reporting-works`.

---

## Implementation Notes
- **Commit Target Branch:** `reporting-works`
- **Database Migration:** `supabase/migrations/144_cpt_economics_report.sql` & `144_cpt_economics_report_down.sql`
- **Service & Facade:** `src/services/cptEconomicsReportService.js` & `src/lib/cptEconomicsReportService.js`
- **UI & Shell:** `src/components/CptEconomicsReportView.jsx`, `src/components/CptEconomicsReportView.css`, `src/App.jsx` (`cpt_economics_report`)
- **Verification Test Suite:** `tests/cpt-economics-report.test.js`
