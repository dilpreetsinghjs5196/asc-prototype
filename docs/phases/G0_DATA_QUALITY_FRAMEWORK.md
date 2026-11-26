# G0 DATA QUALITY FRAMEWORK

## Purpose
The Data Quality Framework establishes the enterprise-wide data governance architecture, canonical quality dimensions, deterministic scoring engine, declarative rule registry, exception remediation workflow, and cryptographic certification ledger for the ASCANALYST platform.

Before executive financial dashboards, P&L statements, AI Operations Analyst responses, or board packages consume operational records from Phase 15 integrations (SIS, HST, Clearinghouse EDI, General Ledger, Payroll, Inventory, Vendor Invoices), Phase G0 guarantees every dataset is measurably evaluated across six auditable dimensions—**Completeness, Accuracy, Consistency, Timeliness, Uniqueness, and Validity**—and enforces deterministic quality gates backed by facility tenancy and RBAC.

---

## Scope
- Define production requirements for the **Data Quality Framework (Phase G0)**:
  1. **Framework Governance Configuration (`dq_framework_configs`)**: Facility-level certification thresholds (`CERTIFIED >= 95%`, `CAUTION_REVIEW >= 85%`, below `85%` → `QUARANTINED_HOLD`), AI tool gating (`block_ai_on_quarantine`), automated scan schedule, and masked alert secrets.
  2. **Six-Dimension Weight Matrix (`dq_dimension_weights`)**: Configurable, strictly balanced weights summing to `100.00%`:
     - **Completeness (`25%`)**: Required clinical, demographic, CPT, payer, and financial attributes present.
     - **Accuracy (`25%`)**: Arithmetic invariants, allowed range checks, and fee-schedule tolerances.
     - **Consistency (`20%`)**: Cross-system reconciliation (EHR vs. Claims, GL vs. Bank, PO vs. Invoice).
     - **Timeliness (`15%`)**: SLA freshness across real-time and batch pipelines.
     - **Uniqueness (`10%`)**: Zero duplicate encounters, claims, vendor invoices, or patient records.
     - **Validity (`5%`)**: Conformance to ICD-10/CPT formats, FDA UDI standards, and chronological invariants.
  3. **Declarative Rule Registry (`dq_rule_definitions`)**: Centralized catalog of deterministic validation rules mapped to dimensions, target domains, severity (`CRITICAL`, `WARNING`, `INFO`), and rule expressions.
  4. **Assessment Scan Runs (`dq_assessment_runs`)**: Audit snapshots recording per-dimension scores, composite DQI, records scanned, pass/fail counts, gate status, and 64-character SHA-256 certification seals.
  5. **Domain Trust Scorecards (`dq_domain_scores`)**: Domain-by-domain health view across EHR Cases, Claims 837, Remittances 835, Accounting GL, Payroll Labor, Inventory POU, and Vendor Invoices.
  6. **Exception & Waiver Workqueue (`dq_exception_logs`)**: Structured remediation queue for failed rules supporting `OPEN`, `IN_REVIEW`, `REMEDIATED`, and audited `WAIVED` states.
  7. **Cryptographic Provenance (`dq_provenance_ledger`)**: Immutable SHA-256 ledger tracking every DQI calculation, rule change, scan execution, and waiver approval.
- Enforce organization and facility tenancy (`facility_id`), RBAC, and zero prohibited color tokens.

---

## Current State

| Component | Status | Description |
| :--- | :--- | :--- |
| `src/services/importValidationService.js` | **KEEP** | Ingestion-time 6-stage validator for inbound batches (Phase F1). |
| `src/services/aiHallucinationRulesService.js` | **KEEP** | AI output grounding rules (consumes Data Quality gate status). |
| `src/services/integrationFrameworkService.js` | **KEEP** | Upstream connector health & DLQ status registry (Phase F0). |
| `public.dq_framework_configs` | **MISSING** | Facility-level DQI thresholds, AI gate policy, and alert configuration. |
| `public.dq_dimension_weights` | **MISSING** | Six-dimension weighting matrix with sum-to-100% invariant. |
| `public.dq_rule_definitions` | **MISSING** | Declarative cross-domain data quality rule catalog. |
| `public.dq_assessment_runs` | **MISSING** | Historical quality scan runs with composite DQI and SHA-256 seals. |
| `public.dq_domain_scores` | **MISSING** | Per-domain data trust breakdown across operational modules. |
| `public.dq_exception_logs` | **MISSING** | Exception quarantine and remediation/waiver audit workqueue. |
| `public.dq_provenance_ledger` | **MISSING** | Immutable SHA-256 governance ledger for quality certification. |
| `src/services/dataQualityFrameworkService.js` | **MISSING** | Deterministic weighted DQI calculator and rule evaluation engine. |
| `src/components/DataQualityFrameworkView.jsx` | **MISSING** | Interactive governance console, 6-dimension cards, rules, and exceptions. |

---

## Target State
1. **Deterministic Weighted Data Quality Index (DQI)**:
   $$\text{Composite DQI} = \sum_{d \in \text{Dimensions}} \left( \text{Score}_d \times \frac{\text{Weight}_d}{100} \right), \quad \sum_{d} \text{Weight}_d = 100.00$$
2. **Automated Trust Gate Classification**:
   - **`CERTIFIED`**: $\text{DQI} \ge 95.0$ **and** `critical_open_exceptions == 0`.
   - **`CAUTION_REVIEW`**: $85.0 \le \text{DQI} < 95.0$ **and** `critical_open_exceptions == 0`.
   - **`QUARANTINED_HOLD`**: $\text{DQI} < 85.0$ **or** `critical_open_exceptions > 0`.
3. **Unified Rule Evaluation Engine**:
   - Supports deterministic operators: `NOT_NULL`, `CHRONOLOGY_LTE`, `NON_NEGATIVE`, `EQUAL_BALANCE`, `REGEX_MATCH`, and `RANGE_PCT`.
4. **Cryptographic Certification Seal**:
   - Every assessment run computes:
     $$\text{Seal} = \text{SHA-256}(\text{facility\_id} \parallel \text{run\_code} \parallel \text{overall\_dqi\_score} \parallel \text{records\_evaluated} \parallel \text{gate\_status})$$

---

## Data Model / Schema
Defined in `supabase/migrations/132_data_quality_framework.sql`:
1. `public.dq_framework_configs`
2. `public.dq_dimension_weights`
3. `public.dq_rule_definitions`
4. `public.dq_assessment_runs` (`sha256_sync_seal VARCHAR(128) NOT NULL`)
5. `public.dq_domain_scores`
6. `public.dq_exception_logs`
7. `public.dq_provenance_ledger` (`sha256_seal VARCHAR(128) NOT NULL`)
- Telemetry aggregation view: `public.vw_data_quality_telemetry`.
- Row-Level Security (`app.current_facility_id`) enabled across all 7 tables.

---

## Business Rules

### Rule 1: Weight Matrix Conservation Invariant
The sum of all six active dimension weights for any facility must strictly equal `100.00%` (`±0.01%` tolerance). Any update violating this invariant is rejected with `ERR_DQ_WEIGHT_SUM_INVALID`.

### Rule 2: Critical Exception Gate Override
Regardless of numeric DQI score, if any `CRITICAL` severity rule failure remains in `OPEN` or `IN_REVIEW` state without remediation or documented executive waiver, the overall gate status cannot promote to `CERTIFIED` and must remain `CAUTION_REVIEW` or `QUARANTINED_HOLD`.

### Rule 3: Immutable Exception Waiver Governance
Marking a failed quality rule as `WAIVED` requires a non-empty business justification (`waiver_reason`) and records the approving `operator_id` and timestamp in `dq_provenance_ledger`.

### Rule 4: Zero-Trust AI Grounding Hook
When `block_ai_on_quarantine = TRUE`, domains marked `QUARANTINED_HOLD` display an explicit uncertified warning banner before executive export or AI Copilot summarization.

---

## Permissions / Security
- Facility-level tenant isolation enforced via PostgreSQL RLS (`app.current_facility_id`).
- Alert webhook/signing secrets masked in all client responses (`dq_sec_****_...`).
- RBAC Matrix:
  - `Super Admin` / `Data Governance Lead`: Edit dimension weights, toggle rules, approve waivers, and update certification thresholds.
  - `Facility Administrator` / `Finance Director`: Trigger quality scans, inspect domain scorecards, and remediate/resolve exceptions.
  - `Financial Analyst` / `AI Analyst`: Read-only access to DQI scorecards, rule definitions, and provenance seals.

---

## API / Service Requirements
Backend service `src/services/dataQualityFrameworkService.js` and facade `src/lib/dataQualityFrameworkService.js` expose:
- `getDqFrameworkConfig(facilityInput)`
- `updateDqFrameworkConfig(facilityInput, updates)`
- `getDqTelemetry(facilityInput)`
- `getDqDimensionWeights(facilityInput)`
- `getDqRuleDefinitions(facilityInput)`
- `getDqAssessmentRuns(facilityInput)`
- `getDqDomainScores(facilityInput)`
- `getDqExceptions(facilityInput)`
- `validateDimensionWeights(weights)`
- `calculateCompositeDqiScore(dimensionScores, weights, criticalExceptionsCount)`
- `evaluateDataQualityRule(rule, record)`
- `triggerDataQualityScan(facilityInput, operatorId)`
- `toggleDqRuleStatus(ruleId, isActive)`
- `resolveDqException(exceptionId, action, notes, operatorId)`

---

## UI / Workflow Requirements
Component `src/components/DataQualityFrameworkView.jsx` and `src/components/DataQualityFrameworkView.css`:
- **Header Action Bar**: Live trust gate pill (`CERTIFIED` / `CAUTION_REVIEW` / `QUARANTINED_HOLD`), "Run Quality Audit Scan", "Test Rule Engine", and settings modal trigger.
- **4-Metric Telemetry Ribbon**:
  1. *Composite DQI Score* (`96.4 / 100`)
  2. *Rule Pass Rate* (`94.2%` across active checks)
  3. *Open Critical Exceptions*
  4. *Certified Data Domains* (`5 / 6 Certified`)
- **6-Dimension Weighted Scorecard Grid**: Live scorebars and weights for Completeness, Accuracy, Consistency, Timeliness, Uniqueness, and Validity.
- **4 Navigation Subtabs**:
  1. *Domain Scorecards*: Module-by-module quality scores across EHR, Claims, Remit, GL, Payroll, Inventory, and Vendor Invoices.
  2. *Quality Rules Engine*: Searchable catalog of deterministic rules with interactive Active/Paused toggle.
  3. *Assessment Run History*: Historical quality scans with per-dimension breakdown and 64-char SHA-256 seals.
  4. *Quality Exceptions*: Quarantine workqueue with one-click **Remediate** and audited **Waive** workflows.
- **Zero Prohibited Tokens**: Strictly zero purple, violet, indigo, magenta, or fuchsia tokens; `padding: 0` on `.dqf-container`.

---

## Audit / Provenance
- Every DQI run, rule toggle, and exception waiver writes an immutable entry with `sha256_seal`, operator identity, timestamp, and JSON metadata to `dq_provenance_ledger`.

---

## QA / Test Cases
Automated test suite `tests/data-quality-framework.test.js`:
1. Telemetry returns accurate DQI metrics for Naples Surgery Center (`fac-naples-01`).
2. Facility UUID alias resolution across strings and objects.
3. Config retrieval and masked secret verification (`dq_sec_****_...`).
4. 6-Dimension weight conservation validator (accepts 100.00%, rejects imbalanced weights).
5. Deterministic composite DQI score calculation and gate classification (`CERTIFIED`, `CAUTION_REVIEW`, `QUARANTINED_HOLD`).
6. Deterministic rule evaluator (`NOT_NULL`, `CHRONOLOGY_LTE`, `NON_NEGATIVE`, `EQUAL_BALANCE`, `REGEX_MATCH`).
7. Domain scorecards retrieval across all upstream operational modules.
8. Rule status toggle and exception remediation / waiver state transitions.
9. Triggering manual Data Quality Scan produces run record with 64-char SHA-256 seal (`sha256_dq_`).
10. Dual facade re-export parity between `src/services/` and `src/lib/`.
11. Migration 132 UP/DOWN SQL structural integrity and RLS policies.
12. Strict zero-prohibited token compliance and `src/App.jsx` shell integration.

---

## Acceptance Criteria
- Build passes (`npm run build`).
- All 132 tests across Phases F0–F9 + G0 pass with zero failures.
- Tenant isolation enforced on all 7 tables via `facility_id` and RLS.
- Zero prohibited accent colors present anywhere in the codebase.

---

## Dependencies
- Upstream: Phase F0–F9 (Enterprise Healthcare Integrations).
- Database: Migration 132 (`supabase/migrations/132_data_quality_framework.sql`).

---

## Definition of Done
Phase G0 is complete when Migration 132 UP/DOWN, `dataQualityFrameworkService.js`, `src/lib/dataQualityFrameworkService.js`, `DataQualityFrameworkView.jsx/.css`, `src/App.jsx` shell integration, 12 passing tests in `tests/data-quality-framework.test.js`, full regression run, and clean production build are verified.

---

## Implementation Notes
- **Branch:** `data-quality-works`
- **Files Created:** `docs/phases/G0_DATA_QUALITY_FRAMEWORK.md`, `ASCANALYST_MD_SPECS/Phase_16_Data_Quality/G0_DATA_QUALITY_FRAMEWORK.md`, `supabase/migrations/132_data_quality_framework.sql`, `132_data_quality_framework_down.sql`, `src/services/dataQualityFrameworkService.js`, `src/lib/dataQualityFrameworkService.js`, `src/components/DataQualityFrameworkView.jsx`, `src/components/DataQualityFrameworkView.css`, `tests/data-quality-framework.test.js`.
- **Files Modified:** `src/App.jsx` (added Phase 16 Data Quality Governance section with `data_quality_framework` tab and `ShieldCheck` icon).
