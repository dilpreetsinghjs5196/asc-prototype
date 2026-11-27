# H1 DAILY ADMIN BRIEF

## Purpose
Phase H1 delivers the **Daily Administrator Brief (`RPT-H1-DAILY-BRIEF`)** under Module 17 (Enterprise Reporting). Each morning prior to first case start (`06:00` local facility time), ASC Administrators, Clinical Nursing Directors, and Finance Leads require a deterministic, single-screen operational and financial pulse synthesizing today's OR suite utilization, first-case on-time starts (FCOTS), pre-bill documentation holds (G1), open import/duplicate exceptions (G3/G4), projected net contribution margin, prioritized P0/P1 action blockers, and signed administrator acknowledgment with SHA-256 provenance.

---

## Scope
- Define production requirements for **Daily Admin Brief (Phase H1)**:
  1. **Brief Governance Config (`dab_configs`)**: Morning delivery cutoff hour (`06:00`), pre-bill hold alert cap (`3`), OR idle alert threshold (`45 min`), financial snapshot & DQ gate inclusion toggles, and masked secret (`dab_sec_****_...`).
  2. **Daily Brief Snapshots (`dab_daily_snapshots`)**: Immutable per-date brief edition (`brief_date`, `brief_code`, scheduled/completed/cancelled case counts, prime-time OR utilization %, turnover avg, projected net revenue & contribution margin, unbilled holds, open IEQ exceptions, DQ trust score, deterministic readiness tier `GREEN_ON_TRACK` | `AMBER_ATTENTION_REQUIRED` | `RED_ACTION_CRITICAL`, and 64-character SHA-256 seal).
  3. **Prioritized Admin Action Blockers (`dab_action_items`)**: P0/P1/P2 daily triage tasks with financial impact ($), owner role, acknowledgement/resolution state machine (`OPEN`, `ACKNOWLEDGED`, `RESOLVED`, `DEFERRED`), and dynamic readiness recalculation.
  4. **OR Suite Pulse (`dab_or_suite_pulse`)**: Per-OR-suite booked vs. actual utilization, FCOTS delay minutes, average turnover, and open backfill slots.
  5. **Surgeon Daily Roster (`dab_surgeon_day_roster`)**: Scheduled surgeons, case loads, documentation/implant readiness flags, and projected daily margin contribution.
  6. **Administrator Sign-Off Ledger (`dab_acknowledgments`) & Dispatch Logs (`dab_dispatch_logs`)**: Morning review sign-off trail and Phase H0 (`RPT-H1-DAILY-BRIEF`) digest dispatch records.
- Preserve full compatibility with Phase H0 (`reportingArchitectureService`), Phase G1 (`caseCompletenessService`), Phase G3 (`importExceptionQueueService`), and Phase B4/B5 OR Utilization metrics.

---

## Current State

| Component | Status | Classification | Description |
| :--- | :--- | :--- | :--- |
| `src/services/reportingArchitectureService.js` | Exists | **KEEP** | Registers `RPT-H1-DAILY-BRIEF` catalog entry, RBAC guards, cron scheduler (`0 6 * * 1-5`), and trust-gate watermarking (Phase H0). |
| `src/services/caseCompletenessService.js` | Exists | **KEEP** | Supplies pre-bill hold counts and missing H&P / consent / implant UDI flags (Phase G1). |
| `src/services/importExceptionQueueService.js` | Exists | **KEEP** | Supplies active CRITICAL/HIGH import exception backlog feeding P0/P1 brief blockers (Phase G3). |
| `src/App.jsx` (legacy static Command Center mock constants) | Legacy | **REFACTOR / COEXIST** | Inline `MOCK_SURGEON_PERF` inside `App.jsx` remains untouched for main dashboard backward compatibility while H1 introduces a dedicated deterministic daily brief engine. |
| `public.dab_*` (7 tables + `vw_dab_telemetry`) | Non-existent | **MISSING** | Brief configs, snapshots, action blockers, OR suite pulse, surgeon roster, acknowledgments, and dispatch logs. |
| `src/services/dailyAdminBriefService.js` & facade | Non-existent | **MISSING** | Deterministic brief compiler, readiness classifier, action item state transitions, admin sign-off, and H0 dispatch logger. |
| `src/components/DailyAdminBriefView.jsx` | Non-existent | **MISSING** | Interactive 06:00 AM Executive Brief console with OR Suite Pulse, Surgeon Day Roster, P0/P1 Action Triage, and Sign-Off. |

---

## Target State
1. **Deterministic Metric Compilation (`computeDailyBriefMetrics`)**:
   - OR Prime-Time Utilization (%): $\text{ROUND}\left(\frac{\text{actual\_or\_minutes}}{\text{available\_prime\_minutes}} \times 100, 2\right)$ (handles `0` denominator safely as `0.00`).
   - FCOTS Rate (%): $\text{ROUND}\left(\frac{\text{on\_time\_first\_cases}}{\text{total\_first\_cases}} \times 100, 2\right)$.
   - Projected Contribution Margin ($): $\text{Projected Net Revenue} - \text{Direct Supplies Cost} - \text{Clinical Labor Cost}$.
2. **Deterministic Readiness Classification (`evaluateBriefReadinessStatus`)**:
   - `RED_ACTION_CRITICAL` if `p0_critical_count > 0` OR `dq_trust_score < 50.00` OR `unbilled_hold_cases_count > prebill_hold_alert_limit * 2`.
   - `AMBER_ATTENTION_REQUIRED` if `unbilled_hold_cases_count >= prebill_hold_alert_limit` OR `open_ieq_exceptions_count > 0` OR `or_prime_time_util_pct < 70.00`.
   - `GREEN_ON_TRACK` otherwise.
3. **Interactive Action Triage & Live Readiness Recalculation**:
   - Resolving all `P0_CRITICAL` blockers in `dab_action_items` automatically recomputes `evaluateBriefReadinessStatus` on the parent brief snapshot and updates its telemetry seal.

---

## Data Model / Schema
Defined in `supabase/migrations/139_daily_admin_brief.sql` (and rollback `139_daily_admin_brief_down.sql`):
1. `public.dab_configs`
2. `public.dab_daily_snapshots` (`sha256_brief_seal VARCHAR(128) NOT NULL`)
3. `public.dab_action_items`
4. `public.dab_or_suite_pulse`
5. `public.dab_surgeon_day_roster`
6. `public.dab_acknowledgments` (`sha256_seal VARCHAR(128) NOT NULL`)
7. `public.dab_dispatch_logs` (`sha256_sync_seal VARCHAR(128) NOT NULL`)
- Telemetry view: `public.vw_dab_telemetry`.
- Tenant isolation enforced across all 7 tables via RLS policies using `app.current_facility_id`.

---

## Business Rules

### Rule 1: Strict Numerator/Denominator Safety
Zero available OR prime minutes or zero first-case counts return `0.00%` (never `NaN` or `Infinity`).

### Rule 2: Mandatory Resolution Justification
Marking a blocker `RESOLVED` or `DEFERRED` requires a `resolution_note` of at least 5 characters (`ERR_DAB_NOTE_REQUIRED`).

### Rule 3: No Silent Bypass of P0 Clinical / Financial Blockers
Brief readiness stays `RED_ACTION_CRITICAL` until every `P0_CRITICAL` blocker is resolved or deferred with documented sign-off.

### Rule 4: Cryptographic SHA-256 Provenance
Every compiled daily snapshot, admin sign-off, and H0 dispatch record produces an immutable **64-character** `sha256_dab_` + 53 hex digest.

---

## Permissions / Security
- Tenant isolation via RLS (`app.current_facility_id`).
- Secret values masked strictly as `dab_sec_****_...`.
- RBAC Matrix:
  - `Facility Administrator` / `Clinical Nursing Director` / `CFO / Finance Director`: Compile daily briefs, acknowledge/resolve action blockers, sign off brief editions, and dispatch H0 morning digests.
  - `OR Scheduler` / `RCM Billing Lead` / `Materials Manager`: Update action items within their assigned domain.
  - `AI Analyst` / `Auditor`: Read-only access to compiled metrics, OR suite pulse, surgeon roster, and sign-off provenance.

---

## API / Service Requirements
Implemented in `src/services/dailyAdminBriefService.js` and re-exported via `src/lib/dailyAdminBriefService.js`:
- `normalizeFacilityId(facilityInput)`
- `computeDabProvenanceSeal(payload)`
- `maskDabSecret(rawSecret)`
- `evaluateBriefReadinessStatus(params)`
- `computeDailyBriefMetrics(rawInputs, config)`
- `getDabConfig(facilityInput)` / `updateDabConfig(facilityInput, updates)`
- `getDabTelemetry(facilityInput)`
- `getDabDailySnapshots(facilityInput)`
- `getDabActionItems(facilityInput, snapshotId)`
- `getDabOrSuitePulse(facilityInput, snapshotId)`
- `getDabSurgeonRoster(facilityInput, snapshotId)`
- `getDabAcknowledgments(facilityInput, snapshotId)`
- `getDabDispatchLogs(facilityInput)`
- `compileDailyAdminBrief(facilityInput, payload)`
- `updateDabActionStatus(facilityInput, actionId, options)`
- `signOffDailyBrief(facilityInput, snapshotId, options)`
- `dispatchDailyBriefDigest(facilityInput, snapshotId, options)`

---

## UI / Workflow Requirements
Implemented in `src/components/DailyAdminBriefView.jsx` & `DailyAdminBriefView.css`:
- **4-Card Telemetry Ribbon**: OR Prime-Time Utilization & FCOTS, Projected Day Contribution Margin, Active P0/P1 Blockers & Holds, and Readiness Status + 64-char SHA-256 Brief Seal.
- **4 Subtabs**:
  1. *Morning Blocker Triage & Sign-Off*: Prioritized P0/P1/P2 blockers with financial exposure, inline Ack/Resolve/Defer workflow, and Administrator Sign-Off button.
  2. *OR Suite Pulse*: Room-by-room booked vs. actual utilization bar, FCOTS delta minutes, turnover avg, and open capacity.
  3. *Surgeon Day Roster*: Case counts, doc/UDI hold warnings, and projected surgeon day margin.
  4. *Edition History, Acknowledgments & H0 Dispatches*: Chronological brief snapshots, admin sign-off trail, and H0 digest dispatches + *Config Modal*.

---

## Audit / Provenance
Every brief compilation, action resolution, administrator sign-off, and morning digest dispatch appends immutable timestamped attribution and a 64-character `sha256_dab_` cryptographic seal.

---

## QA / Test Cases
Defined in `tests/daily-admin-brief.test.js` (12 automated test suites):
1. Facility telemetry accuracy & `sha256_dab_` prefix verification.
2. Facility UUID alias resolution across strings and objects.
3. Config retrieval, secret masking (`dab_sec_****_...`), and threshold update bounds.
4. Deterministic `computeDailyBriefMetrics` math (OR utilization %, FCOTS %, margin, divide-by-zero protection).
5. Deterministic `evaluateBriefReadinessStatus` classification (`RED_ACTION_CRITICAL`, `AMBER_ATTENTION_REQUIRED`, `GREEN_ON_TRACK`).
6. Compiling a new daily brief creates snapshot + `PUBLISH_BRIEF` acknowledgment with 64-char SHA-256 seal.
7. Action triage enforces >=5 char note on `RESOLVED`/`DEFERRED` (`ERR_DAB_NOTE_REQUIRED`) and dynamically promotes readiness when P0s clear.
8. Administrator daily sign-off appends immutable `ADMIN_SIGN_OFF` record.
9. Morning H0 digest dispatch logs sealed `dab_dispatch_logs` entry.
10. Dual facade parity between `src/services/dailyAdminBriefService.js` and `src/lib/dailyAdminBriefService.js`.
11. Migration 139 UP/DOWN SQL structural integrity (7 tables, view, RLS, idempotent seeds).
12. Strict zero prohibited color tokens (`purple`, `violet`, `indigo`, `magenta`, `fuchsia`) + `App.jsx` shell wiring.

---

## Acceptance Criteria
- ESLint and `npm run build` pass with zero errors.
- Full test suite across F0–F9, G0–G5, H0–H1, and Phase 76 passes with zero failures.
- Facility isolation enforced and zero prohibited accent tokens used.

---

## Dependencies
- Upstream Modules: H0 (`reportingArchitectureService`), G1 (`caseCompletenessService`), G3 (`importExceptionQueueService`), G4 (`duplicateMatchingService`).

---

## Definition of Done
Complete when Migration 139 UP/DOWN SQL, `dailyAdminBriefService.js` + `src/lib` facade, `DailyAdminBriefView.jsx`/`.css`, `src/App.jsx` sidebar wiring, 12/12 H1 tests, full regression suite, ESLint, `npm run build`, and specification updates are verified and committed cleanly to branch `reporting-works`.

---

## Implementation Notes
- **Commit Target Branch:** `reporting-works`
- **Database Migration:** `supabase/migrations/139_daily_admin_brief.sql` & `139_daily_admin_brief_down.sql`
- **Service & Facade:** `src/services/dailyAdminBriefService.js` & `src/lib/dailyAdminBriefService.js`
- **UI & Shell:** `src/components/DailyAdminBriefView.jsx`, `src/components/DailyAdminBriefView.css`, `src/App.jsx` (`daily_admin_brief` tab under `Enterprise Reporting (Phase 17)`)
- **Verification Test Suite:** `tests/daily-admin-brief.test.js`
