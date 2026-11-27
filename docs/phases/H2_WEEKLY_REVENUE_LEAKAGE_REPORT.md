# H2 WEEKLY REVENUE LEAKAGE REPORT

## Purpose
Phase H2 delivers the **Weekly Revenue Leakage & Prioritized Recovery Report (`RPT-H2-LEAKAGE`)** under Module 17 (Enterprise Reporting). Each Monday at `07:00` AM, CFOs, RCM Billing Leads, and Facility Administrators require an auditable weekly synthesis of unbilled surgical cases, contractual payer underpayments, missed implant carveouts, modifier omissions, and approaching timely-filing deadlines—deterministically ranked by expected net recovery and urgency, with end-to-end recovery tracking and SHA-256 provenance.

---

## Scope
- Define production requirements for **Weekly Revenue Leakage Report (Phase H2)**:
  1. **Leakage Report Governance (`wlr_configs`)**: Configures week rollover day (`MONDAY`), materiality floor (`$250.00`), priority ranking mode (`EXPECTED_NET_RECOVERY`), category inclusion toggles, and masked secret (`wlr_sec_****_...`).
  2. **Weekly Compiled Editions (`wlr_weekly_editions`)**: Per-week immutable snapshot (`week_code`, `week_start_date`, `week_end_date`, gross leakage total, expected net recovery, week-over-week recovered ($), WoW leakage change (%), category exposure totals, and 64-char `sha256_wlr_` seal).
  3. **Prioritized Recovery Queue (`wlr_priority_opportunities`)**: Deterministically scored recovery queue ranking items into `P0_IMMEDIATE`, `P1_THIS_WEEK`, and `P2_STANDARD` based on expected net recovery and days remaining until payer timely filing limit.
  4. **Category & Payer Breakdowns (`wlr_category_breakdown`, `wlr_payer_leakage_summary`)**: Reconciled category and payer exposure sub-ledgers whose sums match edition totals.
  5. **Recovery Action Log (`wlr_weekly_actions`) & H0 Dispatch Logs (`wlr_dispatch_logs`)**: Audited state changes (`OPEN`, `IN_RECOVERY`, `SUBMITTED_PAYER`, `RECOVERED`, `WRITTEN_OFF`) and Monday 07:00 AM H0 (`RPT-H2-LEAKAGE`) digest dispatches.
- Preserve full compatibility with Module 11 operational detection engines (`revenueLeakageService.js`, `underpaymentService.js`, `implantCarveoutService.js`, `unbilledCaseService.js`, `recoverableRevenueWorkqueueService.js`).

---

## Current State

| Component | Status | Classification | Description |
| :--- | :--- | :--- | :--- |
| `src/services/revenueLeakageService.js` & `RevenueLeakageView.jsx` | Exists | **KEEP** | Module 11 real-time algorithmic detection workqueue (`revenue_leakage` tab). Coexists as upstream detector feeding H2 weekly reporting. |
| `src/services/underpaymentService.js` & `implantCarveoutService.js` | Exists | **KEEP** | Contract variance and high-cost implant carveout evaluators feeding H2 category totals. |
| `src/services/reportingArchitectureService.js` (`RPT-H2-LEAKAGE`) | Exists | **KEEP** | Phase H0 report definition, cron scheduler (`0 7 * * 1`), and DQ trust-gate enforcement. |
| `public.wlr_*` (7 tables + `vw_wlr_telemetry`) | Non-existent | **MISSING** | Weekly leakage report editions, prioritized opportunities, category/payer breakdowns, action log, and dispatch receipts. |
| `src/services/weeklyLeakageReportService.js` & facade | Non-existent | **MISSING** | Deterministic urgency/probability scorer, edition compiler, conservation reconciliation, recovery tracker, and H0 dispatcher. |
| `src/components/WeeklyRevenueLeakageReportView.jsx` | Non-existent | **MISSING** | Interactive Monday Weekly Leakage Report console with Priority Queue, Category/Payer Mix, and H0 Dispatch. |

---

## Target State
1. **Deterministic Priority Scoring (`scoreAndRankRecoveryOpportunity`)**:
   - $\text{Expected Net Recovery} = \text{ROUND}(\text{Gross Leakage} \times \frac{\text{Recovery Probability \%}}{100}, 2)$
   - Urgency Multiplier: `1.50` when `days_to_timely_filing_limit <= 14`, `1.25` when `<= 30`, else `1.00`.
   - `priority_score = round2(expected_net_recovery * urgency_multiplier)`.
   - Priority Tier: `P0_IMMEDIATE` if `days <= 14` or `expected_net_recovery >= 3000`; `P1_THIS_WEEK` if `expected_net_recovery >= 750`; else `P2_STANDARD`.
2. **Exact Category Sum Conservation**:
   - Compiling a weekly edition guarantees $\sum \text{category.gross\_leakage\_usd} = \text{edition.total\_identified\_leakage\_usd}$ and $\sum \text{category.expected\_net\_recovery\_usd} = \text{edition.expected\_net\_recovery\_usd}$ within `$0.01`.
3. **Mandatory Audit Justification & Recovery Bounds**:
   - Transitioning an item to `RECOVERED` or `WRITTEN_OFF` requires a `resolution_note` (`>= 5` chars) and validates `recovered_usd >= 0`.

---

## Data Model / Schema
Defined in `supabase/migrations/140_weekly_revenue_leakage_report.sql` (and rollback `140_weekly_revenue_leakage_report_down.sql`):
1. `public.wlr_configs`
2. `public.wlr_weekly_editions` (`sha256_report_seal VARCHAR(128) NOT NULL`)
3. `public.wlr_priority_opportunities`
4. `public.wlr_category_breakdown`
5. `public.wlr_payer_leakage_summary`
6. `public.wlr_weekly_actions` (`sha256_seal VARCHAR(128) NOT NULL`)
7. `public.wlr_dispatch_logs` (`sha256_sync_seal VARCHAR(128) NOT NULL`)
- Telemetry view: `public.vw_wlr_telemetry`.
- Tenant isolation enforced across all 7 tables via RLS policies using `app.current_facility_id`.

---

## Business Rules

### Rule 1: Valid Week Range Guard
`week_start_date` must strictly precede or equal `week_end_date` (`ERR_WLR_INVALID_WEEK`).

### Rule 2: Mandatory Resolution Justification
Marking any opportunity `RECOVERED` or `WRITTEN_OFF` requires a resolution note of at least 5 characters (`ERR_WLR_NOTE_REQUIRED`).

### Rule 3: Recovery Amount Sanity Bound
Recorded `recovered_usd` must be finite, non-negative, and not exceed `gross_leakage_usd * 1.1` (`ERR_WLR_INVALID_RECOVERY_AMOUNT`).

### Rule 4: Cryptographic SHA-256 Provenance
Every compiled weekly edition, recovery status mutation, and H0 digest dispatch emits an immutable **64-character** `sha256_wlr_` + 53 hex digest via isomorphic `sha256Hex`.

---

## Permissions / Security
- Facility RLS (`app.current_facility_id`) enforces strict single-facility scoping across editions, opportunities, and payouts.
- Secrets masked cleanly as `wlr_sec_****_...`.
- RBAC Matrix:
  - `CFO / Finance Director` / `RCM Billing Lead` / `Facility Administrator`: Compile weekly leakage editions, re-assign/update recovery workflow states, record recovered dollars, and dispatch Monday H0 digests.
  - `Controller` / `Auditor` / `AI Analyst`: Read-only access to category breakdowns, payer concentration metrics, and recovery action timelines.

---

## API / Service Requirements
Implemented in `src/services/weeklyLeakageReportService.js` and re-exported via `src/lib/weeklyLeakageReportService.js`:
- `normalizeFacilityId(facilityInput)`
- `computeWlrProvenanceSeal(payload)`
- `maskWlrSecret(rawSecret)`
- `computeExpectedNetRecovery(grossUsd, probabilityPct)`
- `scoreAndRankRecoveryOpportunity(item)`
- `getWlrConfig(facilityInput)` / `updateWlrConfig(facilityInput, updates)`
- `getWlrTelemetry(facilityInput)`
- `getWlrEditions(facilityInput)`
- `getWlrPriorityOpportunities(facilityInput, filters)`
- `getWlrCategoryBreakdown(facilityInput, editionId)`
- `getWlrPayerSummary(facilityInput, editionId)`
- `getWlrWeeklyActions(facilityInput, editionId)`
- `getWlrDispatchLogs(facilityInput)`
- `compileWeeklyLeakageReport(facilityInput, payload)`
- `updateOpportunityRecoveryStatus(facilityInput, opportunityId, options)`
- `dispatchWeeklyLeakageDigest(facilityInput, editionId, options)`

---

## UI / Workflow Requirements
Implemented in `src/components/WeeklyRevenueLeakageReportView.jsx` & `.css`:
- **4-Card Telemetry Ribbon**: Gross Identified Leakage ($), Expected Net Recovery ($), P0 Immediate / Timely Filing Alerts, and Realized Recovered WoW + SHA-256 Seal.
- **4 Subtabs**:
  1. *Prioritized Recovery Queue*: Filter by category & status, inspect urgency countdown (`days_to_timely_filing_limit`), enter recovery note + realized amount, and trigger `RECOVERED` / `SUBMITTED_PAYER` / `WRITTEN_OFF`.
  2. *Category & WoW Breakdown*: Unbilled Cases, Payer Underpayments, Implant Carveouts, Modifier Omissions, and Timely Filing exposure bars.
  3. *Payer Concentration Matrix*: Leakage and expected recovery grouped by Commercial/Medicare payers.
  4. *Recovery Audit & H0 Dispatches*: Immutable recovery status log and H0 weekly digest receipts + *Config Modal*.

---

## Audit / Provenance
`wlr_weekly_editions`, `wlr_weekly_actions`, and `wlr_dispatch_logs` retain actor email, role, prior/updated states, recovered dollar deltas, timestamp, and 64-char `sha256_wlr_` seals.

---

## QA / Test Cases
Defined in `tests/weekly-revenue-leakage-report.test.js` (12 automated test suites):
1. Facility telemetry accuracy & `sha256_wlr_` seal verification.
2. Facility UUID alias resolution across strings and objects.
3. Config retrieval, secret masking (`wlr_sec_****_...`), and materiality bound validation.
4. `computeExpectedNetRecovery` & `scoreAndRankRecoveryOpportunity` deterministic urgency/tier scoring.
5. Compiling new weekly edition validates dates (`ERR_WLR_INVALID_WEEK`), ranks opportunities, and conserves category totals cleanly.
6. Updating opportunity status enforces `>=5` char note (`ERR_WLR_NOTE_REQUIRED`) and recovery ceiling (`ERR_WLR_INVALID_RECOVERY_AMOUNT`).
7. Marking an opportunity `RECOVERED` increments edition `realized_recovered_wow_usd` and appends sealed `wlr_weekly_actions` entry.
8. Category & Payer summaries accurately reflect edition decomposition.
9. H0 `dispatchWeeklyLeakageDigest` creates sealed `wlr_dispatch_logs` record.
10. Dual facade parity between `src/services/weeklyLeakageReportService.js` and `src/lib/weeklyLeakageReportService.js`.
11. Migration 140 UP/DOWN SQL structural integrity (7 tables, view, RLS, idempotent seeds).
12. Strict zero prohibited color tokens (`purple`, `violet`, `indigo`, `magenta`, `fuchsia`) + `App.jsx` shell wiring.

---

## Acceptance Criteria
- ESLint and `npm run build` pass cleanly without errors or externalized crypto warnings.
- Full test suite across F0–F9, G0–G5, H0–H2, and Phase 76 passes with zero failures.
- Dark mode `<select>`/`<option>` contrast and responsive grids verified.

---

## Dependencies
- Upstream Modules: H0 (`reportingArchitectureService`), H1 (`dailyAdminBriefService`), Module 11 (`revenueLeakageService`, `underpaymentService`, `implantCarveoutService`, `unbilledCaseService`).

---

## Definition of Done
Complete when Migration 140 UP/DOWN SQL, `weeklyLeakageReportService.js` + `src/lib` facade, `WeeklyRevenueLeakageReportView.jsx`/`.css`, `src/App.jsx` sidebar wiring, 12/12 H2 tests, full regression suite, ESLint, `npm run build`, and spec updates are verified and committed to `reporting-works`.

---

## Implementation Notes
- **Commit Target Branch:** `reporting-works`
- **Database Migration:** `supabase/migrations/140_weekly_revenue_leakage_report.sql` & `140_weekly_revenue_leakage_report_down.sql`
- **Service & Facade:** `src/services/weeklyLeakageReportService.js` & `src/lib/weeklyLeakageReportService.js` (uses `src/utils/isomorphicSha256.js`)
- **UI & Shell:** `src/components/WeeklyRevenueLeakageReportView.jsx`, `src/components/WeeklyRevenueLeakageReportView.css`, `src/App.jsx` (`weekly_revenue_leakage_report` tab under `Enterprise Reporting (Phase 17)`)
- **Verification Test Suite:** `tests/weekly-revenue-leakage-report.test.js`
