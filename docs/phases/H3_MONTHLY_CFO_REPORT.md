# H3 MONTHLY CFO REPORT

## Purpose
Phase H3 delivers the **Monthly CFO Financial & Operational Report (`RPT-H3-MONTHLY-CFO`)** under Module 17 (Enterprise Reporting). Following each month-end close, the CFO, Controller, and Facility Administrator require a single, GAAP-reconciled monthly report synthesizing the Management P&L waterfall (Gross Charges → Net Revenue → Direct Supplies/Labor → EBITDA Margin %), Budget vs. Actual variance explanations, Cash Roll-Forward & EBITDA-to-Cash conversion, Days Cash on Hand & AR DSO, Module 16 Financial Trust Gate checks, and dual-key Controller-to-CFO close certification with SHA-256 provenance.

---

## Scope
- Define production requirements for **Monthly CFO Report (Phase H3)**:
  1. **Close Governance Rules (`mcr_configs`)**: Configures target monthly close day (`5th` business day), Module 16 G2 Trust Gate enforcement (`require_dq_trust_gate = TRUE`, `min_trust_score_for_signoff = 75.00%`), material variance explanation threshold (`5.00%`), EBITDA target margin (`22.00%`), and masked secrets (`mcr_sec_****_...`).
  2. **Monthly CFO Editions (`mcr_monthly_editions`)**: Authoritative per-period package (`report_code`, `fiscal_period`, gross/net revenue, EBITDA $, EBITDA Margin %, collections, cash conversion %, ending cash balance, DCOH, AR DSO, DQ trust score, close workflow status `DRAFT` | `CONTROLLER_VERIFIED` | `CFO_SIGNED_OFF` | `LOCKED_CLOSED`, and 64-char `sha256_mcr_` seal).
  3. **Reconciled P&L Bridge (`mcr_pnl_bridge`)**: Line-by-line Actual vs. Budget waterfall whose lines satisfy exact accounting conservation ($\text{Net Revenue} - \text{Direct Costs} - \text{OpEx} = \text{EBITDA}$).
  4. **Cash & Working Capital Bridge (`mcr_cash_ar_bridges`)**: Opening cash + Operating inflows - Payroll/AP outflows - CapEx/Debt outflows = Closing cash balance alongside GL variance check.
  5. **Material Variance Commentary (`mcr_variance_commentary`)**: Requires documented driver explanations for variances exceeding materiality before CFO lock is permitted.
  6. **Dual-Gate Sign-Offs (`mcr_signoffs`) & H0 Dispatches (`mcr_dispatch_logs`)**: Controller verification + CFO lock certification trail and `RPT-H3-MONTHLY-CFO` dispatch logs.
- Preserve full compatibility with Module 14 services (`managementPnlService.js`, `budgetVarianceService.js`, `cashForecastService.js`, `breakEvenService.js`, `boardReportingService.js`) and Module 16 G2 (`dqFinancialCompletenessService.js`).

---

## Current State

| Component | Status | Classification | Description |
| :--- | :--- | :--- | :--- |
| `src/services/managementPnlService.js` & `budgetVarianceService.js` | Exists | **KEEP** | Module 14 E0–E1 financial engines supplying P&L lines and budget comparisons. Coexist under Finance views. |
| `src/services/cashForecastService.js` & `dqFinancialCompletenessService.js` | Exists | **KEEP** | Module 14 E3 cash liquidity and Module 16 G2 financial completeness trust gate evaluators. |
| `src/services/reportingArchitectureService.js` (`RPT-H3-MONTHLY-CFO`) | Exists | **KEEP** | Phase H0 report catalog entry, RBAC permissions (`CFO / Finance Director`, `Controller`), and watermarking policy. |
| `public.mcr_*` (7 tables + `vw_mcr_telemetry`) | Non-existent | **MISSING** | Monthly CFO editions, reconciled P&L waterfall, cash bridges, variance explanations, close sign-offs, and dispatch receipts. |
| `src/services/monthlyCfoReportService.js` & facade | Non-existent | **MISSING** | Deterministic P&L/Cash reconciliation math, DQ gate & unexplained-variance close guards, dual-key sign-off workflow, and H0 dispatcher. |
| `src/components/MonthlyCfoReportView.jsx` | Non-existent | **MISSING** | Interactive Monthly CFO Close & Executive P&L/Cash Report UI with variance commentary & certification controls. |

---

## Target State
1. **Deterministic Financial & Cash Conservation**:
   - $\text{Net Patient Revenue} = \text{Gross Charges} - \text{Contractual Allowances}$
   - $\text{EBITDA} = \text{Net Patient Revenue} - (\text{Direct Supplies} + \text{Clinical Labor} + \text{Fixed Overhead})$
   - $\text{Closing Cash} = \text{Opening Cash} + \text{Operating Inflows} - \text{Payroll/AP Outflows} - \text{CapEx/Debt Outflows}$
2. **Strict Period-Close Gatekeeping**:
   - Editions follow a deterministic transition path: `DRAFT` → `CONTROLLER_VERIFIED` → `CFO_SIGNED_OFF` → `LOCKED_CLOSED`.
   - Advancing to `CFO_SIGNED_OFF` or `LOCKED_CLOSED` fails deterministically if `dq_trust_score < min_trust_score_for_signoff` (`ERR_MCR_TRUST_GATE_FAILED`) or if any `OPEN_EXPLANATION` material variance remains unresolved (`ERR_MCR_UNEXPLAINED_VARIANCE`).
   - Once `LOCKED_CLOSED`, no mutations are permitted (`ERR_MCR_PERIOD_LOCKED`).

---

## Data Model / Schema
Defined in `supabase/migrations/141_monthly_cfo_report.sql` (and rollback `141_monthly_cfo_report_down.sql`):
1. `public.mcr_configs`
2. `public.mcr_monthly_editions` (`sha256_report_seal VARCHAR(128) NOT NULL`)
3. `public.mcr_pnl_bridge`
4. `public.mcr_cash_ar_bridges`
5. `public.mcr_variance_commentary`
6. `public.mcr_signoffs` (`sha256_seal VARCHAR(128) NOT NULL`)
7. `public.mcr_dispatch_logs` (`sha256_sync_seal VARCHAR(128) NOT NULL`)
- Telemetry view: `public.vw_mcr_telemetry`.
- Tenant isolation enforced across all 7 tables via RLS policies using `app.current_facility_id`.

---

## Business Rules

### Rule 1: Exact P&L Accounting Conservation
`verifyPnlReconciliationInvariant` verifies that Net Revenue minus Direct COGS and Fixed Operating Expense matches reported EBITDA within `$0.01` (`ERR_MCR_PNL_IMBALANCE`).

### Rule 2: Dual-Key Close Sequence & Immutability
Skipping states (e.g., `DRAFT` directly to `LOCKED_CLOSED`) raises `ERR_MCR_INVALID_TRANSITION`; attempting edits after `LOCKED_CLOSED` raises `ERR_MCR_PERIOD_LOCKED`.

### Rule 3: Trust-Gate & Variance Explanation Prerequisite
CFO sign-off (`CFO_SIGNED_OFF`) and period lock (`LOCKED_CLOSED`) require both verified DQ trust score (`>= min_trust_score_for_signoff`) and zero `OPEN_EXPLANATION` material variances.

### Rule 4: Cryptographic SHA-256 Provenance
Every compiled monthly package, sign-off transition, variance verification, and H0 digest dispatch emits a **64-character** `sha256_mcr_` + 53 hex digest via isomorphic `sha256Hex`.

---

## Permissions / Security
- Facility RLS (`app.current_facility_id`) enforces strict single-facility scoping across periods, financials, and sign-offs.
- Secrets masked cleanly as `mcr_sec_****_...`.
- RBAC Matrix:
  - `Controller`: Verify P&L / Cash bridges, explain material variances, advance period to `CONTROLLER_VERIFIED`.
  - `CFO / Finance Director` / `Facility Administrator`: Approve `CFO_SIGNED_OFF` & `LOCKED_CLOSED`, update close thresholds, and dispatch Monday/Month-end H0 digests.
  - `Auditor` / `AI Analyst`: Read-only access to compiled P&L, cash roll-forwards, variance notes, and SHA-256 sign-off logs.

---

## API / Service Requirements
Implemented in `src/services/monthlyCfoReportService.js` and re-exported via `src/lib/monthlyCfoReportService.js`:
- `normalizeFacilityId(facilityInput)`
- `computeMcrProvenanceSeal(payload)`
- `maskMcrSecret(rawSecret)`
- `computeMonthlyCfoMetrics(rawInputs)`
- `verifyPnlReconciliationInvariant(pnlLines)`
- `getMcrConfig(facilityInput)` / `updateMcrConfig(facilityInput, updates)`
- `getMcrTelemetry(facilityInput)`
- `getMcrEditions(facilityInput)`
- `getMcrPnlBridge(facilityInput, editionId)`
- `getMcrCashBridge(facilityInput, editionId)`
- `getMcrVarianceCommentary(facilityInput, editionId)`
- `getMcrSignoffs(facilityInput, editionId)`
- `getMcrDispatchLogs(facilityInput)`
- `compileMonthlyCfoReport(facilityInput, payload)`
- `verifyVarianceCommentary(facilityInput, varianceId, options)`
- `advanceCfoSignoff(facilityInput, editionId, options)`
- `dispatchMonthlyCfoDigest(facilityInput, editionId, options)`

---

## UI / Workflow Requirements
Implemented in `src/components/MonthlyCfoReportView.jsx` & `.css`:
- **4-Card Telemetry Ribbon**: Net Patient Revenue & Budget Variance, EBITDA ($) & Margin (%), Ending Cash & Conversion Rate (%), and Close Sign-Off Status + SHA-256 Seal.
- **4 Subtabs**:
  1. *P&L Waterfall & Budget Variance*: Full Actual vs. Budget vs. Variance table across Revenue, Direct Costs, OpEx, and EBITDA.
  2. *Cash Flow & AR Bridge*: Cash roll-forward ledger + DCOH / AR DSO / GL variance card.
  3. *Material Variance Commentary*: Explain & verify open variances (`>=5%`) required before CFO certification.
  4. *Close Sign-Offs & H0 Dispatches*: Controller/CFO dual-key close workflow buttons (`Advance to CONTROLLER_VERIFIED`, `CFO Sign-Off`, `Lock Closed Period`), audit history, and *Close Rules* modal.

---

## Audit / Provenance
Every compilation, variance explanation verification, Controller/CFO close certification, and H0 dispatch appends immutable timestamped attribution and 64-character `sha256_mcr_` seals.

---

## QA / Test Cases
Defined in `tests/monthly-cfo-report.test.js` (12 automated test suites):
1. Facility telemetry accuracy & `sha256_mcr_` seal verification.
2. Facility UUID alias resolution across strings and objects.
3. Config retrieval, masked secret check (`mcr_sec_****_...`), and trust threshold bounds validation.
4. Deterministic `computeMonthlyCfoMetrics` math (Net Rev, EBITDA, Margin %, Cash Conversion %, Cash Roll-Forward).
5. `verifyPnlReconciliationInvariant` validates balanced waterfall and rejects imbalanced lines (`ERR_MCR_PNL_IMBALANCE`).
6. Compiling a new monthly CFO edition creates P&L bridge, cash roll-forward, and 64-char seal.
7. Close gate enforces unexplained-variance block (`ERR_MCR_UNEXPLAINED_VARIANCE`) and DQ trust floor block (`ERR_MCR_TRUST_GATE_FAILED`).
8. Verifying variance commentary enforces `>=5` char note and unblocks Controller -> CFO Sign-Off -> `LOCKED_CLOSED` immutable freeze (`ERR_MCR_PERIOD_LOCKED`).
9. H0 `dispatchMonthlyCfoDigest` records sealed `mcr_dispatch_logs` entry.
10. Dual facade parity between `src/services/monthlyCfoReportService.js` and `src/lib/monthlyCfoReportService.js`.
11. Migration 141 UP/DOWN SQL structural integrity (7 tables, view, RLS, idempotent seeds).
12. Strict zero prohibited color tokens (`purple`, `violet`, `indigo`, `magenta`, `fuchsia`) + `App.jsx` shell wiring.

---

## Acceptance Criteria
- ESLint and `npm run build` pass cleanly without errors or externalized crypto warnings.
- Full test suite across F0–F9, G0–G5, H0–H3, and Phase 76 passes with zero failures.
- Full light & dark mode `<select>`/`<option>` contrast verified.

---

## Dependencies
- Upstream Modules: H0 (`reportingArchitectureService`), H2 (`weeklyLeakageReportService`), G2 (`dqFinancialCompletenessService`), Module 14 (`managementPnlService`, `budgetVarianceService`, `cashForecastService`, `boardReportingService`).

---

## Definition of Done
Complete when Migration 141 UP/DOWN SQL, `monthlyCfoReportService.js` + `src/lib` facade, `MonthlyCfoReportView.jsx`/`.css`, `src/App.jsx` sidebar wiring, 12/12 H3 tests, full regression suite, ESLint, `npm run build`, and specification updates are verified and committed cleanly to `reporting-works`.

---

## Implementation Notes
- **Commit Target Branch:** `reporting-works`
- **Database Migration:** `supabase/migrations/141_monthly_cfo_report.sql` & `141_monthly_cfo_report_down.sql`
- **Service & Facade:** `src/services/monthlyCfoReportService.js` & `src/lib/monthlyCfoReportService.js`
- **UI & Shell:** `src/components/MonthlyCfoReportView.jsx`, `src/components/MonthlyCfoReportView.css`, `src/App.jsx` (`monthly_cfo_report` tab under `Enterprise Reporting (Phase 17)`)
- **Verification Test Suite:** `tests/monthly-cfo-report.test.js`
