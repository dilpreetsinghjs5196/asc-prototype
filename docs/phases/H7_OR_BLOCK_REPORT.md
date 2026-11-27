# H7 OR BLOCK REPORT

## Purpose
Governed OR utilization, block release compliance, turnover velocity, recoverable capacity, and financial yield report under Module 17 (`RPT-H7-OR-BLOCK`).

## Scope
- Define production requirements for **Phase H7: OR Block Report (`RPT-H7-OR-BLOCK`)**.
- Preserve compatibility with Module 10 OR scheduling views (`orUtilizationMetricsService.js`, `blockUtilizationMetricsService.js`, `blockReleaseEventsService.js`, `blockScheduleModelService.js`, `turnoverMetricsService.js`, `recoverableCapacityService.js`).
- Enforce deterministic block time conservation, opportunity-cost calculations, organization/facility tenancy, RBAC, and SHA-256 provenance seals (`sha256_obr_`).

---

## Current State
- `src/services/orUtilizationMetricsService.js` + `OrUtilizationMetricsView.jsx`: **KEEP** (Module 10 real-time room occupancy and prime-time utilization metrics).
- `src/services/blockUtilizationMetricsService.js` + `BlockUtilizationMetricsView.jsx`: **KEEP** (Module 10 block utilization and SBPI engine).
- `src/services/blockReleaseEventsService.js` + `BlockReleaseEventsView.jsx`: **KEEP** (Module 10 live release compliance tracking).
- `src/services/turnoverMetricsService.js` + `recoverableCapacityService.js`: **KEEP** (Module 10 turnover & open slot backfilling).
- `src/services/reportingArchitectureService.js` (`RPT-H7-OR-BLOCK`): **REFACTOR / INTEGRATE** (catalog metadata exists; wire H7 edition compilation & H0 dispatch receipts).
- Governed H7 OR Block Report tables (`obr_*`), snapshot editions, MEC governance action trail, and executive reporting view (`OrBlockReportView.jsx`): **MISSING** (implemented in Phase H7).

---

## Target State
Provide OR directors, facility administrators, and CFOs a periodic **OR Block Utilization, Release & Financial Yield Report** reconciling:
1. **Raw vs Adjusted Block Utilization (%)** (deducting compliant `>=72h` on-time releases from allocated denominator).
2. **Abandoned Idle Time (Hours & Opportunity Cost $)** from late forfeitures & unfilled block hoarding.
3. **First-Case On-Time Start (FCOTS %) & Mean Turnover Minutes** across suites.
4. **Financial Yield per Utilized OR Hour ($/hr)** and **MEC Rightsizing Actions** (`EXPAND_ALLOCATION`, `MAINTAIN`, `PROBATIONARY_NOTICE`, `RIGHTSIZE_DOWNGRADE`).

---

## Data Model / Schema
Implemented in `supabase/migrations/145_or_block_report.sql` (and `_down.sql`):
- `public.obr_configs`: Target block utilization (`75.00%`), max allowable turnover credit (`45` min), release cutoff hours (`72`h), hourly opportunity cost benchmark (`$1,250.00`/hr), masked secret (`obr_sec_****_...`).
- `public.obr_suite_benchmarks`: Per-suite targets (`target_utilization_pct`, `target_turnover_minutes`, `fcots_target_pct`, `revenue_per_hour_target_usd`).
- `public.obr_report_editions`: Periodic digest snapshots (`edition_code`, `period_code`, `total_allocated_hours`, `total_utilized_hours`, `total_released_hours`, `total_abandoned_idle_hours`, `facility_adjusted_util_pct`, `recoverable_capacity_value_usd`, `sha256_report_seal`).
- `public.obr_block_scorecards`: Ranked block owners with allocated/released/utilized/idle minutes, FCOTS %, turnover min, margin/utilized hr, opportunity cost, `block_tier`, `rightsizing_action`, and `sha256_card_seal`.
- `public.obr_release_events`: Compliant vs late/abandoned release audit log & backfill recovery value.
- `public.obr_mec_governance_actions`: Sealed Medical Executive Committee actions (`EXPAND_BLOCK`, `ISSUE_60D_NOTICE`, `DOWNGRADE_FORFEIT`, `APPROVE_REALLOCATION`).
- `public.obr_dispatch_logs`: Sealed H0 (`RPT-H7-OR-BLOCK`) dispatch receipts.
- `public.vw_obr_telemetry`: Facility KPI summary view.
- Idempotent RLS policies (`app.current_facility_id`) on all 7 tables.

---

## Business Rules
- **Adjusted Block Utilization Formula**:
  - `net_allocated_minutes = Math.max(0, allocated_minutes - on_time_released_minutes)`
  - `raw_utilization_pct = allocated_minutes > 0 ? Number(((utilized_in_block_minutes / allocated_minutes) * 100).toFixed(2)) : 0.00`
  - `adjusted_utilization_pct = net_allocated_minutes > 0 ? Number(((utilized_in_block_minutes / net_allocated_minutes) * 100).toFixed(2)) : (utilized_in_block_minutes > 0 ? 100.00 : 0.00)`
  - `abandoned_idle_minutes = Math.max(0, net_allocated_minutes - utilized_in_block_minutes)`
- **Time Conservation Identity**:
  - `allocated_minutes === on_time_released_minutes + utilized_in_block_minutes + abandoned_idle_minutes` (for utilized <= net allocated; overruns flagged explicitly without negative idle time).
- **Tier & Rightsizing Bands**:
  - `>= 85%`: `EXCEEDS_BENCHMARK` / `EXPAND_ALLOCATION`
  - `>= 75%`: `MEETS_BENCHMARK` / `MAINTAIN`
  - `>= 60%`: `UNDERUTILIZED_WARNING` / `PROBATIONARY_NOTICE`
  - `< 60%`: `CRITICAL_UNDERUTILIZATION` / `RIGHTSIZE_DOWNGRADE`
- **MEC Action Guard**: Rationale notes `>= 5` characters (`ERR_OBR_NOTE_REQUIRED`).

---

## Permissions / Security
- Viewable by `Facility Administrator`, `Clinical Nursing Director`, `OR Scheduler`, and `CFO / Finance Director`.
- Config edits, edition compilation, and MEC allocation actions audited by user, role, and timestamp.
- Tenant isolation enforced via `normalizeFacilityId` and Postgres RLS.

---

## API / Service Requirements
Exported identically from `src/services/orBlockReportService.js` and `src/lib/orBlockReportService.js`:
- `normalizeFacilityId`, `computeObrProvenanceSeal`, `maskObrSecret`, `evaluateOrBlockPerformance`, `verifyBlockTimeConservation`
- `getObrConfig`, `updateObrConfig`, `getObrTelemetry`, `getObrSuiteBenchmarks`, `getObrEditions`, `getObrBlockScorecards`, `getObrReleaseEvents`, `getObrMecActions`, `getObrDispatchLogs`
- `compileOrBlockEdition`, `recordMecGovernanceAction`, `dispatchOrBlockDigest`

---

## UI / Workflow Requirements
Implemented in `src/components/OrBlockReportView.jsx` & `.css`:
- **4-Card Telemetry Ribbon**: Blocks & Utilized Hours, Adjusted Utilization %, Total Block Contribution Margin ($), and Recoverable Idle Opportunity Cost ($) + SHA-256 Seal.
- **4 Subtabs**:
  1. *Block Utilization Leaderboard*: Block Tier & Specialty filters, responsive anti-clipping table + Time & Yield Decomposition inspector, Recent Block Release log for owner, and MEC Rightsizing Action form.
  2. *OR Suite Benchmarks*: Room-level utilization, turnover, FCOTS %, and revenue/hour targets.
  3. *Release Compliance Events*: Audit trail of on-time (`>=72h`) vs late/abandoned block releases and backfill capture.
  4. *MEC Actions & H0 Dispatches*: Governance log and H0 (`RPT-H7-OR-BLOCK`) dispatch receipts + *Utilization & Cutoff Modal*.

---

## Audit / Provenance
Every compiled edition, block scorecard, MEC action, and H0 dispatch stores an immutable 64-character `sha256_obr_` digest computed via browser-safe `sha256Hex`.

---

## QA / Test Cases
Defined in `tests/or-block-report.test.js` (12 automated tests):
1. Facility telemetry accuracy & `sha256_obr_` seal check.
2. Facility UUID alias resolution across strings and objects.
3. Config retrieval, masked secret (`obr_sec_****_...`), and invalid target utilization/cutoff bounds (`ERR_OBR_INVALID_CONFIG`).
4. `evaluateOrBlockPerformance` computes raw/adjusted utilization %, idle opportunity cost, rightsizing tier, and 0-minute safe guard.
5. Block tier & specialty filtering across scorecards.
6. Compiling a new edition satisfies `verifyBlockTimeConservation` and updates ranked blocks cleanly.
7. Recording MEC governance action enforces `>=5` char note (`ERR_OBR_NOTE_REQUIRED`) and creates sealed record.
8. Suite benchmarks and release events return reconciled Naples data.
9. H0 `dispatchOrBlockDigest` creates sealed dispatch receipt.
10. Dual facade parity between `src/services/orBlockReportService.js` and `src/lib/orBlockReportService.js`.
11. Migration 145 UP/DOWN SQL structural integrity (7 tables, view, RLS, idempotent seeds).
12. Zero prohibited color tokens (`purple`, `violet`, `indigo`, `magenta`, `fuchsia`), dark `<select>`/`<option>` + anti-clipping CSS, browser-safe crypto, and `App.jsx` shell wiring.

---

## Acceptance Criteria
- ESLint (`0 errors`), full regression suite, and `npm run build` pass cleanly.
- Responsive light & dark UI verified with zero horizontal clipping.

---

## Dependencies
- Upstream Modules: H0 (`reportingArchitectureService`), Module 10 (`orUtilizationMetricsService`, `blockUtilizationMetricsService`, `blockReleaseEventsService`, `turnoverMetricsService`).

---

## Definition of Done
Complete when Migration 145 UP/DOWN SQL, `orBlockReportService.js` + `src/lib` facade, `OrBlockReportView.jsx`/`.css`, `src/App.jsx` wiring (`or_block_report`), 12/12 H7 tests, full test suite, ESLint, Vite build, and spec updates are verified and committed to `reporting-works`.

---

## Implementation Notes
- **Commit Target Branch:** `reporting-works`
- **Database Migration:** `supabase/migrations/145_or_block_report.sql` & `145_or_block_report_down.sql`
- **Service & Facade:** `src/services/orBlockReportService.js` & `src/lib/orBlockReportService.js`
- **UI & Shell:** `src/components/OrBlockReportView.jsx`, `src/components/OrBlockReportView.css`, `src/App.jsx` (`or_block_report`)
- **Verification Test Suite:** `tests/or-block-report.test.js`
