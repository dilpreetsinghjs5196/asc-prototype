# H9 BOARD PACKAGE

## Purpose
Quarterly Executive Board Governance Package uniting Module 17 reports (H1–H8), debt covenant compliance, DQ trust gates, strategic capital resolutions, and sequential CFO/Board sign-off (`RPT-H9-BOARD-PKG`).

## Scope
- Define production requirements for **Phase H9: Executive Board Reporting Package (`RPT-H9-BOARD-PKG`)**.
- Preserve compatibility with Module 14 operational executive services (`boardReportingService.js`, `BoardReportingView.jsx`, `roiValueReportService.js`).
- Enforce G2 Financial Completeness Trust Gate checks, sequential governance transitions (`DRAFT -> CFO_VERIFIED -> BOARD_APPROVED -> LOCKED_PUBLISHED`), tenant isolation, RBAC, and SHA-256 provenance seals (`sha256_bpk_`).

---

## Current State
- `src/services/boardReportingService.js` + `BoardReportingView.jsx`: **KEEP** (Module 14 executive KPI synthesis across E0–E5 and presentation dossier view).
- `src/services/roiValueReportService.js` + `RoiValueReportView.jsx`: **KEEP** (Module 13 realized ROI initiative tracking).
- `src/services/reportingArchitectureService.js` (`RPT-H9-BOARD-PKG`): **REFACTOR / INTEGRATE** (catalog definition exists; wire H9 package editions & confidential H0 dispatch receipts).
- Governed H9 Board Package schema (`bpk_*`), debt covenant evaluator, sequential CFO -> Board Chair approval state machine, strategic vote ledger, and reporting workspace (`BoardPackageReportView.jsx`): **MISSING** (implemented in Phase H9).

---

## Target State
Provide Board Directors, Managing Partners, CFOs, and Facility Administrators a cryptographically sealed **Quarterly Board Package** featuring:
1. **Cross-Report Financial & Operational Executive Summary**: Net Revenue, EBITDA ($ & %), DSO Days, Adjusted OR Utilization %, and Verified Realized ROI synthesized from H1–H8.
2. **Debt & Liquidity Covenant Compliance Monitor**: Automated `MIN`/`MAX` covenant checks (DSCR, Total Leverage, Unrestricted Days Cash on Hand, Fixed Charge Coverage).
3. **Structured 5-Pillar Board Narratives** (`FINANCIAL_PNL`, `CLINICAL_OR_CAPACITY`, `PAYER_RCM_CYCLE`, `SURGEON_STRATEGY`, `COMPLIANCE_RISK`).
4. **Strategic Resolutions & CapEx Voting Ledger** + sequential **CFO -> Board Approval Sign-Off** gated by Data Quality Trust Score.

---

## Data Model / Schema
Implemented in `supabase/migrations/147_board_package_report.sql` (and `_down.sql`):
- `public.bpk_configs`: Facility trust-score gate (`80.00%`), min DSCR (`1.25x`), max leverage (`3.50x`), dual-key CFO & Chair sign-off requirement, masked secret (`bpk_sec_****_...`).
- `public.bpk_packages`: Quarterly Board dossiers (`package_code`, `period_code`, `package_status`, `dq_trust_score`, financial & OR/RCM rollups, `is_covenant_compliant`, `sha256_package_seal`).
- `public.bpk_covenants`: Bank covenant monitors with `threshold_value`, `actual_value`, `comparator` (`MIN`/`MAX`), and deterministic `compliance_status` (`COMPLIANT`, `WATCH`, `BREACH`).
- `public.bpk_executive_sections`: Narrative commentary sections referencing upstream phase codes (`H3`, `H4`, `H5`, `H7`, `H8`).
- `public.bpk_strategic_resolutions`: Board vote tracker (`APPROVED`, `DEFERRED`, `PENDING_VOTE`, `REJECTED`) with capital impact ($).
- `public.bpk_signoff_audit`: Immutable state transition audit (`DRAFT -> CFO_VERIFIED -> BOARD_APPROVED -> LOCKED_PUBLISHED`).
- `public.bpk_dispatch_logs`: Sealed H0 (`RPT-H9-BOARD-PKG`) board packet delivery logs.
- `public.vw_bpk_telemetry`: Facility KPI summary view.
- Idempotent RLS policies (`app.current_facility_id`) on all 7 tables.

---

## Business Rules
- **Sequential Lifecycle**: `DRAFT -> CFO_VERIFIED -> BOARD_APPROVED -> LOCKED_PUBLISHED`. Skipping steps or modifying locked packages rejects cleanly (`ERR_BPK_INVALID_TRANSITION`, `ERR_BPK_LOCKED`).
- **Trust Gate Enforcement**: Transitioning past `DRAFT` requires `dq_trust_score >= config.min_dq_trust_score_for_board` (`ERR_BPK_TRUST_GATE_BLOCKED`).
- **Debt Covenant Evaluator (`evaluateDebtCovenant`)**:
  - `MIN` comparator: `actual >= threshold` (`COMPLIANT`), `actual >= threshold * 0.9` (`WATCH`), else `BREACH`.
  - `MAX` comparator: `actual <= threshold` (`COMPLIANT`), `actual <= threshold * 1.1` (`WATCH`), else `BREACH`.
- **EBITDA Margin Identity**: `net_revenue_usd > 0 ? Number(((ebitda_usd / net_revenue_usd) * 100).toFixed(2)) : 0.00`.
- **Sign-Off & Resolution Note Guard**: Notes `>= 5` characters (`ERR_BPK_NOTE_REQUIRED`).

---

## Permissions / Security
- Board package creation, compilation, and final distribution restricted to `Facility Administrator` and `CFO / Finance Director`.
- Read access controlled by strict RBAC + facility tenant isolation (`app.current_facility_id`).

---

## API / Service Requirements
Exported identically from `src/services/boardPackageReportService.js` and `src/lib/boardPackageReportService.js`:
- `normalizeFacilityId`, `computeBpkProvenanceSeal`, `maskBpkSecret`, `evaluateDebtCovenant`, `computeBoardExecutiveMetrics`
- `getBpkConfig`, `updateBpkConfig`, `getBpkTelemetry`, `getBpkPackages`, `getBpkCovenants`, `getBpkExecutiveSections`, `getBpkResolutions`, `getBpkSignoffAudit`, `getBpkDispatchLogs`
- `compileBoardPackageEdition`, `advanceBoardPackageStatus`, `recordBoardResolutionVote`, `dispatchBoardPackageDigest`

---

## UI / Workflow Requirements
Implemented in `src/components/BoardPackageReportView.jsx` & `.css`:
- **4-Card Telemetry Ribbon**: Quarterly Net Revenue & EBITDA, Adjusted OR Util & DSO, Covenant & Trust Gate Status, and Verified ROI + SHA-256 Seal.
- **4 Subtabs**:
  1. *Executive Dossier & Narratives*: 5-pillar synthesis narratives + sequential CFO/Board Sign-Off stepper (`DRAFT -> CFO_VERIFIED -> BOARD_APPROVED -> LOCKED_PUBLISHED`).
  2. *Debt Covenants*: Live `MIN`/`MAX` covenant compliance table.
  3. *Strategic Resolutions*: Capital allocation & OR block voting register + vote recording form.
  4. *Sign-Off Audit & H0 Dispatches*: Governance audit trail and H0 (`RPT-H9-BOARD-PKG`) board delivery receipts + *Trust Gate & Covenant Config Modal*.

---

## Audit / Provenance
Every compiled Board dossier, sign-off transition, resolution vote, and H0 distribution persists a 64-character `sha256_bpk_` seal using browser-safe `sha256Hex`.

---

## QA / Test Cases
Defined in `tests/board-package-report.test.js` (12 automated tests):
1. Facility telemetry accuracy & `sha256_bpk_` seal check.
2. Facility UUID alias resolution across strings and objects.
3. Config retrieval, secret masking (`bpk_sec_****_...`), and invalid trust-floor/DSCR bounds (`ERR_BPK_INVALID_CONFIG`).
4. `evaluateDebtCovenant` (`MIN` & `MAX` comparators -> `COMPLIANT`, `WATCH`, `BREACH`) and `computeBoardExecutiveMetrics` zero-revenue guard.
5. Executive sections & debt covenant matrix return reconciled Naples records.
6. Compiling a new quarterly Board dossier initializes `DRAFT` state and sealed KPI snapshot.
7. Trust gate blocks low-DQ advancement (`ERR_BPK_TRUST_GATE_BLOCKED`), sequential sign-off succeeds cleanly, and `LOCKED_PUBLISHED` blocks post-lock edits (`ERR_BPK_LOCKED`).
8. Recording strategic resolution vote enforces `>=5` char note (`ERR_BPK_NOTE_REQUIRED`) and creates sealed resolution entry.
9. H0 `dispatchBoardPackageDigest` logs sealed board delivery receipt.
10. Dual facade parity between `src/services/boardPackageReportService.js` and `src/lib/boardPackageReportService.js`.
11. Migration 147 UP/DOWN SQL structural integrity (7 tables, view, RLS, idempotent seeds).
12. Zero prohibited color tokens (`purple`, `violet`, `indigo`, `magenta`, `fuchsia`), dark `<select>`/`<option>` + anti-clipping CSS, browser-safe crypto, and `App.jsx` shell wiring.

---

## Acceptance Criteria
- ESLint (`0 errors`), full regression suite across F0–F9, G0–G5, H0–H9, and `npm run build` pass cleanly.
- Responsive light & dark UI verified cleanly.

---

## Dependencies
- Upstream Modules: H0–H8 (`reportingArchitectureService`, `dailyAdminBriefService`, `weeklyLeakageReportService`, `monthlyCfoReportService`, `surgeonScorecardReportService`, `payerScorecardReportService`, `cptEconomicsReportService`, `orBlockReportService`, `denialArReportService`), Module 14 (`boardReportingService`, `roiValueReportService`).

---

## Definition of Done
Complete when Migration 147 UP/DOWN SQL, `boardPackageReportService.js` + `src/lib` facade, `BoardPackageReportView.jsx`/`.css`, `src/App.jsx` wiring (`board_package_report`), 12/12 H9 tests, full test suite, ESLint, Vite build, and spec updates are verified and committed to `reporting-works`.

---

## Implementation Notes
- **Commit Target Branch:** `reporting-works`
- **Database Migration:** `supabase/migrations/147_board_package_report.sql` & `147_board_package_report_down.sql`
- **Service & Facade:** `src/services/boardPackageReportService.js` & `src/lib/boardPackageReportService.js`
- **UI & Shell:** `src/components/BoardPackageReportView.jsx`, `src/components/BoardPackageReportView.css`, `src/App.jsx` (`board_package_report`)
- **Verification Test Suite:** `tests/board-package-report.test.js`
