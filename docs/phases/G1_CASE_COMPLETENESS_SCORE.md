# G1 CASE COMPLETENESS SCORE

## Purpose
The Case Completeness Score module provides deterministic operational, clinical, and coding readiness scoring for every surgical encounter in the ASCANALYST platform. Before a case is released to claim generation (Phase F5) or included in surgeon/CPT profitability scorecards, every encounter is scored across a transparent 5-pillar weighted rubric to expose missing OR timestamps, unassigned staff, incomplete coding, unsigned operative reports, and missing FDA implant UDIs.

---

## Scope
- Define production requirements for **Case Completeness Scoring (Phase G1)**:
  1. **Governance Configuration (`case_completeness_configs`)**: Facility-level thresholds (`BILLING_READY >= 95%`, `CLINICAL_REVIEW >= 80%`, below `80%` → `INCOMPLETE_HOLD`), coding-lock enforcement, implant UDI mandatory check, and masked secrets.
  2. **5-Pillar Scoring Rubric (`case_completeness_rubrics`)**: Configurable weights strictly summing to `100.00%`:
     - **Demographics & Identity (`15%`)**: Encounter ID, Patient MRN, Date of Service, Primary Payer ID.
     - **Perioperative Timestamps (`25%`)**: `preop_in <= room_in <= incision_start <= procedure_close <= room_out <= pacu_in <= discharge_out`.
     - **Care Team Staffing (`20%`)**: Primary Surgeon, Anesthesia Provider, Circulating RN, Scrub Tech.
     - **Clinical Coding (`25%`)**: Primary CPT, ICD-10 diagnosis, ASA class, laterality/modifier verification.
     - **Attestation & Implant UDI (`15%`)**: Signed operative note plus FDA UDI lot/serial/expiration for implant-bearing procedures.
  3. **Per-Case Scorecards (`case_completeness_scores`)**: Case-level score breakdown, gap count, critical blocker count, readiness status, and 64-character SHA-256 certification seal.
  4. **Granular Field Gap Checklist (`case_completeness_field_gaps`)**: Actionable missing/invalid field items tied to each surgical encounter with remediation tracking (`OPEN`, `RESOLVED`, `NOT_APPLICABLE`).
  5. **Specialty Benchmarks (`case_completeness_specialty_benchmarks`)**: Specialty-level readiness averages and top recurring documentation bottlenecks.
  6. **Audit Run History (`case_completeness_audit_runs`) & Provenance (`case_completeness_provenance_ledger`)**: Batch evaluation history and immutable SHA-256 ledger.
- Integrate with Phase G0 (`Data Quality Framework`) and Phase F3/F4 EHR streams (`SIS`, `HST`).
- Enforce facility tenancy (`facility_id`), RBAC, and zero prohibited accent tokens.

---

## Current State

| Component | Status | Description |
| :--- | :--- | :--- |
| `src/services/dataQualityFrameworkService.js` | **KEEP** | Enterprise 6-dimension DQI framework and governance hub (Phase G0). |
| `src/services/sisIntegrationService.js` | **KEEP** | Upstream SIS milestone & charge stream (Phase F3). |
| `src/services/hstIntegrationService.js` | **KEEP** | Upstream HST eChart & PM encounter stream (Phase F4). |
| `public.case_completeness_configs` | **MISSING** | Facility readiness thresholds and coding/UDI gate settings. |
| `public.case_completeness_rubrics` | **MISSING** | 5-pillar weighted scoring rubric (100.00% conservation). |
| `public.case_completeness_scores` | **MISSING** | Per-case completeness scorecards and readiness gate states. |
| `public.case_completeness_field_gaps` | **MISSING** | Field-level deficiency checklist with remediation tracking. |
| `public.case_completeness_specialty_benchmarks` | **MISSING** | Specialty-grouped completeness KPI rollups. |
| `public.case_completeness_audit_runs` | **MISSING** | Batch scoring execution logs with SHA-256 seals. |
| `public.case_completeness_provenance_ledger` | **MISSING** | Immutable audit provenance table for case score changes. |
| `src/services/caseCompletenessService.js` | **MISSING** | Authoritative case scorer and gap remediation service. |
| `src/components/CaseCompletenessView.jsx` | **MISSING** | UI dashboard for case scorecards, drill-downs, and benchmarks. |

---

## Target State
1. **Deterministic Weighted Case Score**:
   $$\text{Case Score} = \sum_{p=1}^{5} \left( \text{Pillar Score}_p \times \frac{\text{Pillar Weight}_p}{100} \right), \quad \sum_{p=1}^{5} \text{Pillar Weight}_p = 100.00$$
2. **Readiness Gate Transitions**:
   - **`BILLING_READY`**: $\text{Case Score} \ge 95.0$ **and** `critical_blockers_count == 0`.
   - **`CLINICAL_REVIEW`**: $80.0 \le \text{Case Score} < 95.0$ **and** `critical_blockers_count == 0`.
   - **`INCOMPLETE_HOLD`**: $\text{Case Score} < 80.0$ **or** `critical_blockers_count > 0`.
3. **Interactive Field-Gap Remediation**:
   - Resolving all critical field gaps on a held case deterministically recalculates the pillar scores and automatically promotes the case to `BILLING_READY`.

---

## Data Model / Schema
Defined in `supabase/migrations/133_case_completeness_score.sql`:
1. `public.case_completeness_configs`
2. `public.case_completeness_rubrics`
3. `public.case_completeness_scores` (`sha256_sync_seal VARCHAR(128) NOT NULL`)
4. `public.case_completeness_field_gaps`
5. `public.case_completeness_specialty_benchmarks`
6. `public.case_completeness_audit_runs` (`sha256_sync_seal VARCHAR(128) NOT NULL`)
7. `public.case_completeness_provenance_ledger` (`sha256_seal VARCHAR(128) NOT NULL`)
- Telemetry aggregation view: `public.vw_case_completeness_telemetry`.
- Tenant isolation enforced via `app.current_facility_id` RLS policies on all 7 tables.

---

## Business Rules

### Rule 1: Rubric Conservation Invariant
The sum of the 5 operational/clinical rubric weights must strictly equal `100.00%` (`±0.01%`). Violations throw `ERR_CCS_RUBRIC_SUM_INVALID`.

### Rule 2: Critical Blocker Pre-Bill Hold
Any missing `CRITICAL` field (such as `primary_cpt`, inverted OR timestamps, unsigned operative report, or missing implant UDI on an implant case) sets `critical_blockers_count >= 1` and forces `readiness_status = 'INCOMPLETE_HOLD'`, preventing automated 837 claim dispatch.

### Rule 3: Monotonic Perioperative Chronology
Timestamps present must satisfy:
$$\text{preop\_in} \le \text{room\_in} \le \text{incision\_start} \le \text{procedure\_close} \le \text{room\_out} \le \text{pacu\_in} \le \text{discharge\_out}$$

### Rule 4: Cryptographic Sealing
Every scored case and batch audit scan generates a 64-character SHA-256 seal (`sha256_ccs_` prefix + 53 hex characters).

---

## Permissions / Security
- Facility-level RLS isolation (`app.current_facility_id`).
- API secrets masked (`ccs_sec_****_...`).
- RBAC Matrix:
  - `Clinical Nursing Director` / `OR Manager`: Remediate OR timestamps, staffing assignments, and PACU/nursing gaps.
  - `Certified Coder` / `HIM Lead`: Remediate CPT/ICD-10/modifier gaps and verify operative report signatures.
  - `Financial Analyst` / `Facility Administrator`: Full read access to readiness rates, specialty benchmarks, and audit runs.

---

## API / Service Requirements
`src/services/caseCompletenessService.js` and facade `src/lib/caseCompletenessService.js`:
- `getCaseCompletenessConfig(facilityInput)`
- `updateCaseCompletenessConfig(facilityInput, updates)`
- `getCaseCompletenessTelemetry(facilityInput)`
- `getCaseCompletenessRubrics(facilityInput)`
- `getCaseCompletenessScores(facilityInput)`
- `getCaseCompletenessFieldGaps(caseIdentifier)`
- `getCaseSpecialtyBenchmarks(facilityInput)`
- `getCaseAuditRuns(facilityInput)`
- `validateCompletenessRubricWeights(rubrics)`
- `evaluateCaseCompleteness(caseRecord, rubrics, thresholds)`
- `triggerCaseCompletenessAudit(facilityInput, operatorId)`
- `resolveCaseFieldGap(gapId, operatorId, resolutionValue)`

---

## UI / Workflow Requirements
Component `src/components/CaseCompletenessView.jsx` and `src/components/CaseCompletenessView.css`:
- **Header Action Bar**: Readiness summary pill, "Verify Rubric Weights", "Run Case Audit", and Settings modal trigger.
- **4-Card Telemetry Ribbon**: Avg Case Completeness Score, Billing-Ready Cases %, Cases on Hold, Total Open Field Gaps.
- **5-Pillar Weight Breakdown Bar**: Demographics (15%), OR Timestamps (25%), Care Team (20%), Clinical Coding (25%), Attestation & Implant UDI (15%).
- **4 Subtabs**:
  1. *Case Scorecards & Drilldown* (master-detail case table + interactive missing-field remediation checklist).
  2. *Specialty Benchmarks* (specialty readiness leaderboard and top recurring missing fields).
  3. *Rubric Weight Matrix* (5-pillar weights and SLA rules).
  4. *Audit Run History* (batch runs with 64-char SHA-256 seals).
- **Zero Prohibited Tokens**: Strictly zero purple, violet, indigo, magenta, or fuchsia tokens; `padding: 0` on `.ccs-container`.

---

## Audit / Provenance
- Every case evaluation, gap remediation, and batch scan preserves operator identity, timestamp, and immutable SHA-256 seal in `case_completeness_provenance_ledger`.

---

## QA / Test Cases
Automated test suite `tests/case-completeness.test.js`:
1. Telemetry returns accurate completeness metrics for Naples Surgery Center (`fac-naples-01`).
2. Facility UUID alias resolution across strings and objects.
3. Configuration retrieval and masked secret verification (`ccs_sec_****_...`).
4. 5-pillar rubric weight conservation validator (accepts 100.00%, rejects invalid totals).
5. Deterministic `evaluateCaseCompleteness` returns `100` (`BILLING_READY`) on a fully complete surgical encounter.
6. `evaluateCaseCompleteness` detects missing CPT/timestamps/implant UDI and classifies `INCOMPLETE_HOLD` with critical blockers.
7. Monotonic OR chronology check detects inverted timestamps inside `PERIOPERATIVE_TIMESTAMPS`.
8. Field-gap remediation recalculates case score and promotes `INCOMPLETE_HOLD` case to `BILLING_READY` when critical gaps clear.
9. Batch case completeness audit creates run record with exact 64-char `sha256_ccs_` seal.
10. Dual facade re-export parity (`src/services/` vs `src/lib/`).
11. Migration 133 UP/DOWN SQL structural integrity and RLS policies.
12. Strict zero-prohibited token compliance and `src/App.jsx` shell integration.

---

## Acceptance Criteria
- Build passes (`npm run build`).
- All 144 tests across F0–F9 + G0–G1 pass cleanly.
- Tenant isolation verified across all 7 tables.
- Zero prohibited accent tokens.

---

## Dependencies
- Upstream: Phase G0 (`Data Quality Framework`), Phase F3 (`SIS Integration`), Phase F4 (`HST Pathways Integration`).
- Database: Migration 133 (`supabase/migrations/133_case_completeness_score.sql`).

---

## Definition of Done
Phase G1 is complete when Migration 133 UP/DOWN, `caseCompletenessService.js`, `src/lib/caseCompletenessService.js`, `CaseCompletenessView.jsx/.css`, `src/App.jsx` shell integration, 12 passing tests in `tests/case-completeness.test.js`, full regression run, and clean production build pass.

---

## Implementation Notes
- **Branch:** `data-quality-works`
- **Files Created:** `docs/phases/G1_CASE_COMPLETENESS_SCORE.md`, `ASCANALYST_MD_SPECS/Phase_16_Data_Quality/G1_CASE_COMPLETENESS_SCORE.md`, `supabase/migrations/133_case_completeness_score.sql`, `133_case_completeness_score_down.sql`, `src/services/caseCompletenessService.js`, `src/lib/caseCompletenessService.js`, `src/components/CaseCompletenessView.jsx`, `src/components/CaseCompletenessView.css`, `tests/case-completeness.test.js`.
- **Files Modified:** `src/App.jsx` (`case_completeness_score` tab with `FileCheck2` icon).
