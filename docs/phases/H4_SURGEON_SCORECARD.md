# H4 SURGEON SCORECARD

## Purpose
Phase H4 delivers the **Executive Surgeon Performance & Benchmark Scorecard Report (`RPT-H4-SURGEON-CARD`)** under Module 17 (Enterprise Reporting). Medical Directors, CFOs, Administrators, and individual credentialed Surgeons require a reproducible, specialty-adjusted performance dossier measuring case volume, net contribution margin per OR hour, turnover efficiency, preference card supply discipline, and G1 documentation completeness—ranked against peer specialty benchmarks with strict surgeon-privacy anonymization for self-service review and SHA-256 provenance.

---

## Scope
- Define production requirements for **Surgeon Scorecard Report (Phase H4)**:
  1. **Benchmark & Rubric Config (`ssr_configs`)**: Conserved 4-pillar weighting (`35%` Contribution Margin/OR Hr + `25%` OR Turnover & Efficiency + `25%` Supply/Implant Discipline + `15%` Clinical Doc Completeness = `100.00%`), minimum eligible case volume (`10` cases), peer anonymization flag (`anonymize_peer_names_for_surgeon_view`), and masked secret (`ssr_sec_****_...`).
  2. **Specialty Benchmark Matrix (`ssr_specialty_benchmarks`)**: Specialty medians & top-quartile targets (`Orthopedic Surgery`, `Sports Medicine`, `Pain / Spine`, `Ophthalmology`).
  3. **Compiled Scorecard Editions (`ssr_report_editions`)**: Monthly/quarterly scorecard batches (`edition_code`, `period_code`, avg composite score, total margin contribution, and 64-char `sha256_ssr_` seal).
  4. **Individual Surgeon Scorecards (`ssr_surgeon_scorecards`)**: Rank, specialty metrics, normalized component scores, `composite_score`, `performance_tier` (`TOP_QUARTILE_ELITE`, `ABOVE_BENCHMARK`, `WATCH_COACHING`, `ACTION_REQUIRED`), and 64-char card seal.
  5. **CPT Mix Drill-Downs (`ssr_cpt_mix_details`)**: Top procedure profitability and preference-card supply variance per surgeon.
  6. **Peer Review Coaching Ledger (`ssr_peer_reviews`) & H0 Dispatches (`ssr_dispatch_logs`)**: Documented Medical Director coaching/commendation notes and confidential Phase H0 (`RPT-H4-SURGEON-CARD`) deliveries.
- Preserve full compatibility with Module 8 interactive operational views (`surgeonIntelligenceService.js`, `surgeonFinancialScorecardService.js`, `surgeonImplantVarianceService.js`).

---

## Current State

| Component | Status | Classification | Description |
| :--- | :--- | :--- | :--- |
| `src/services/surgeonFinancialScorecardService.js` & `SurgeonFinancialScorecardView.jsx` | Exists | **KEEP** | Module 8 operational surgeon financial analytics UI (`surgeon_financial_scorecard`). Remains untouched. |
| `src/services/surgeonImplantVarianceService.js` & `surgeonIntelligenceService.js` | Exists | **KEEP** | Module 8 implant preference card variance and clinical utilization feeds. |
| `src/services/reportingArchitectureService.js` (`RPT-H4-SURGEON-CARD`) | Exists | **KEEP** | Phase H0 report catalog entry and RBAC policy for executive & Medical Director distribution. |
| `public.ssr_*` (7 tables + `vw_ssr_telemetry`) | Non-existent | **MISSING** | Scorecard editions, 4-pillar rubric configs, specialty benchmarks, CPT mix breakdowns, peer reviews, and dispatch logs. |
| `src/services/surgeonScorecardReportService.js` & facade | Non-existent | **MISSING** | Weight conservation validator, deterministic 4-pillar scorer, peer anonymizer (`getAnonymizedPeerView`), review logger, and H0 dispatcher. |
| `src/components/SurgeonScorecardReportView.jsx` | Non-existent | **MISSING** | Interactive Surgeon Scorecard & Peer Benchmark report console with Anonymized Surgeon Self-View toggle. |

---

## Target State
1. **Conserved 4-Pillar Composite Scoring (`evaluateSurgeonScorecard`)**:
   - $\sum \text{Pillar Weights} \equiv 100.00\%$ (`validateScorecardWeights`).
   - Contribution Margin / OR Hour = $\text{ROUND}(\text{Contribution Margin} \div \text{Total OR Hours}, 2)$ (safe `0.00` when `0` hours).
   - Tier thresholds: `TOP_QUARTILE_ELITE` (`>= 85.00`), `ABOVE_BENCHMARK` (`70.00–84.99`), `WATCH_COACHING` (`55.00–69.99`), `ACTION_REQUIRED` (`< 55.00`).
2. **Privacy-Preserving Surgeon Peer Comparison**:
   - When `actor_role === 'Surgeon Self-View'` and `anonymize_peer_names_for_surgeon_view = TRUE`, peer cards strip external names and NPIs (`Peer Surgeon #Rank`), leaving only the requesting surgeon's own row identified cleanly.

---

## Data Model / Schema
Defined in `supabase/migrations/142_surgeon_scorecard_report.sql` (and rollback `142_surgeon_scorecard_report_down.sql`):
1. `public.ssr_configs`
2. `public.ssr_specialty_benchmarks`
3. `public.ssr_report_editions` (`sha256_report_seal VARCHAR(128) NOT NULL`)
4. `public.ssr_surgeon_scorecards` (`sha256_card_seal VARCHAR(128) NOT NULL`)
5. `public.ssr_cpt_mix_details`
6. `public.ssr_peer_reviews` (`sha256_seal VARCHAR(128) NOT NULL`)
7. `public.ssr_dispatch_logs` (`sha256_sync_seal VARCHAR(128) NOT NULL`)
- Telemetry view: `public.vw_ssr_telemetry`.
- Tenant isolation enforced across all 7 tables via RLS policies using `app.current_facility_id`.

---

## Business Rules

### Rule 1: Strict 100.00% Rubric Weight Conservation
Rubric weights across Contribution Margin, OR Efficiency, Supply Discipline, and Documentation Quality must sum to `100.00%` (`ERR_SSR_INVALID_WEIGHT_SUM`).

### Rule 2: Peer Anonymization for Surgeon Self-Service
Surgeon callers cannot enumerate unmasked peer names or NPIs when `anonymize_peer_names_for_surgeon_view = TRUE`.

### Rule 3: Mandatory Coaching / Review Justification
Logging a peer review note requires a summary of at least 5 characters (`ERR_SSR_NOTE_REQUIRED`).

### Rule 4: Cryptographic SHA-256 Provenance
Every compiled edition, scorecard row, coaching note, and H0 dispatch emits an immutable **64-character** `sha256_ssr_` + 53 hex digest via isomorphic `sha256Hex`.

---

## Permissions / Security
- Facility RLS (`app.current_facility_id`) enforces strict single-facility scoping.
- Secrets masked cleanly as `ssr_sec_****_...`.
- RBAC Matrix:
  - `Medical Director` / `Facility Administrator` / `CFO / Finance Director`: Unmasked view across all credentialed surgeons, configure rubric weights, log peer review notes, dispatch confidential reports.
  - `Surgeon Self-View`: Views own detailed card unmasked; peer rows anonymized cleanly (`Peer Surgeon #N`).
  - `AI Analyst`: Shares exact caller privacy constraints (`getAnonymizedPeerView` applies identically when invoked by a surgeon session).

---

## API / Service Requirements
Implemented in `src/services/surgeonScorecardReportService.js` and re-exported via `src/lib/surgeonScorecardReportService.js`:
- `normalizeFacilityId(facilityInput)`
- `computeSsrProvenanceSeal(payload)`
- `maskSsrSecret(rawSecret)`
- `validateScorecardWeights(weights)`
- `evaluateSurgeonScorecard(surgeonMetrics, benchmark, config)`
- `getSsrConfig(facilityInput)` / `updateSsrConfig(facilityInput, updates)`
- `getSsrTelemetry(facilityInput)`
- `getSsrSpecialtyBenchmarks(facilityInput)`
- `getSsrEditions(facilityInput)`
- `getSsrSurgeonScorecards(facilityInput, options)`
- `getSsrCptMix(facilityInput, scorecardId)`
- `getSsrPeerReviews(facilityInput, scorecardId)`
- `getSsrDispatchLogs(facilityInput)`
- `compileSurgeonScorecardEdition(facilityInput, payload)`
- `recordSurgeonPeerReview(facilityInput, scorecardId, options)`
- `dispatchSurgeonScorecardDigest(facilityInput, editionId, options)`

---

## UI / Workflow Requirements
Implemented in `src/components/SurgeonScorecardReportView.jsx` & `.css`:
- **4-Card Telemetry Ribbon**: Surgeons Evaluated, Mean Composite Score, Total Facility Surgeon Margin ($), and Top-Quartile Count + SHA-256 Seal.
- **4 Subtabs**:
  1. *Ranked Surgeon Scorecards*: Role-aware leaderboard (`Executive / Medical Director` vs `Surgeon Self-View` anonymization toggle) + detailed 4-pillar inspector & CPT mix drill-down.
  2. *Specialty Benchmarks*: Peer target medians & top-quartile OR/hour margin benchmarks across specialties.
  3. *CPT Mix & Preference Variance*: Procedure unit profitability and implant card variance analysis.
  4. *Peer Review Log & H0 Dispatches*: Coaching commendation/action log and confidential H0 dispatch history + *Rubric Weights Modal*.

---

## Audit / Provenance
`ssr_report_editions`, `ssr_surgeon_scorecards`, `ssr_peer_reviews`, and `ssr_dispatch_logs` record full rubric versions, actor attribution, timestamps, and 64-character `sha256_ssr_` cryptographic seals.

---

## QA / Test Cases
Defined in `tests/surgeon-scorecard-report.test.js` (12 automated test suites):
1. Facility telemetry accuracy & `sha256_ssr_` seal verification.
2. Facility UUID alias resolution across strings and objects.
3. Config retrieval, secret masking (`ssr_sec_****_...`), and 4-pillar weight conservation rejection (`ERR_SSR_INVALID_WEIGHT_SUM`).
4. `evaluateSurgeonScorecard` computes margin/OR hr, 4-pillar score, and tier classifications cleanly (plus 0-hour safe guard).
5. Peer privacy control (`getSsrSurgeonScorecards` with `actor_role: 'Surgeon Self-View'`) masks other surgeons while revealing own card.
6. Compiling a new scorecard edition filters below min case threshold cleanly and ranks scores descending.
7. Recording peer review enforces `>=5` char note (`ERR_SSR_NOTE_REQUIRED`) and appends SHA-256 sealed `ssr_peer_reviews` log.
8. Specialty benchmarks and CPT mix accessors return reconciled facility rows.
9. H0 `dispatchSurgeonScorecardDigest` creates sealed `ssr_dispatch_logs` record.
10. Dual facade parity between `src/services/surgeonScorecardReportService.js` and `src/lib/surgeonScorecardReportService.js`.
11. Migration 142 UP/DOWN SQL structural integrity (7 tables, view, RLS, idempotent seeds).
12. Strict zero prohibited color tokens (`purple`, `violet`, `indigo`, `magenta`, `fuchsia`) + `App.jsx` shell wiring.

---

## Acceptance Criteria
- ESLint and `npm run build` pass cleanly without errors or externalized crypto warnings.
- Full test suite across F0–F9, G0–G5, H0–H4, and Phase 76 passes with zero failures.
- Full light & dark mode `<select>`/`<option>` contrast verified.

---

## Dependencies
- Upstream Modules: H0 (`reportingArchitectureService`), H1 (`dailyAdminBriefService`), Module 8 (`surgeonFinancialScorecardService`, `surgeonImplantVarianceService`, `surgeonIntelligenceService`).

---

## Definition of Done
Complete when Migration 142 UP/DOWN SQL, `surgeonScorecardReportService.js` + `src/lib` facade, `SurgeonScorecardReportView.jsx`/`.css`, `src/App.jsx` sidebar wiring, 12/12 H4 tests, full regression suite, ESLint, `npm run build`, and spec updates are verified and committed cleanly to `reporting-works`.

---

## Implementation Notes
- **Commit Target Branch:** `reporting-works`
- **Database Migration:** `supabase/migrations/142_surgeon_scorecard_report.sql` & `142_surgeon_scorecard_report_down.sql`
- **Service & Facade:** `src/services/surgeonScorecardReportService.js` & `src/lib/surgeonScorecardReportService.js`
- **UI & Shell:** `src/components/SurgeonScorecardReportView.jsx`, `src/components/SurgeonScorecardReportView.css`, `src/App.jsx` (`surgeon_scorecard_report` tab under `Enterprise Reporting (Phase 17)`)
- **Verification Test Suite:** `tests/surgeon-scorecard-report.test.js`
