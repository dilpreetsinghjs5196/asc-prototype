# PHASE 77 — FINANCIAL CALCULATION VERSIONING & FREEZE ENGINE
## Closed-Period Immutability, Historical Restatement Governance, Simulation Dry-Runs & Backward Compatibility

> **Module:** Financial Systems & Managerial Accounting Governance  
> **Status:** PRODUCTION SPECIFICATION & IMPLEMENTATION  
> **Target Version:** ASCANALYST v2026.1 Enterprise  
> **Phase:** 77 — Financial Calculation Versioning  
> **Authors:** Principal Healthcare Financial Systems Architect, Chief Financial Officer, Healthcare Regulatory Auditor, PostgreSQL Database Architect  
> **Classification:** Strict Healthcare Financial Governance (HIPAA 45 CFR § 164.312(b), ASC Cost Reporting, GAAP / ASC 606, SOX § 404)  
> **Target Migration:** `053_financial_calculation_versioning.sql` (Staged) / `053_financial_calculation_versioning_down.sql`  
> **Upstream Dependencies:** Phase 70 (Financial Data Dictionary), Phase 71 (Case Financial Ledger), Phase 72 (Case Cost Model), Phase 73 (Facility Financial Settings), Phase 74 (Contribution Margin Engine), Phase 75 (Contribution Per OR Hour), Phase 76 (Financial Completeness Score)  

---

## 1. PURPOSE

The primary purpose of Phase 77 is to establish an authoritative, deterministic **Financial Calculation Versioning & Freeze Engine** across the ASCANALYST platform.

In Ambulatory Surgery Centers (ASCs), financial cost accounting models, contract allowable schedules, clinical labor burden multipliers, and OR minute rates evolve over time. However:
- When a surgery center closes its books at month-end or quarter-end, the financial results for that closed period must become **immutable**.
- If wage rates or implant catalog prices increase in October 2026, viewing a surgical case from February 2026 must **never** retroactively recalculate using October assumptions, as this corrupts GAAP financial statements, Board reports, and statutory Medicare cost filings.
- Conversely, when evaluating potential changes to payer contracts or labor union agreements, administrators require the ability to run **Deterministic Simulation Dry-Runs** comparing baseline results against proposed new version models across historical caseloads without contaminating production accounting records.

Phase 77 resolves these imperatives by delivering:
1. **Immutable Accounting Period Freezes:** Allows CFOs and financial controllers to freeze closed accounting periods (`2026-Q1`, `2026-OCT`) once Phase 76 Completeness Gates ($\ge 90$ points) are satisfied.
2. **Version-Tagged Calculation Records:** Stamps every ledger snapshot, margin calculation, and yield metric with an authoritative calculation version identifier (e.g. `2026.1_BASELINE`, `2026.2_UPDATED`).
3. **Deterministic Dry-Run Simulation Engine:** Computes exact delta and percentage variance between two calculation versions without writing mutations to production case records.
4. **Governed Restatement & Unfreeze Audit Workflow:** Requires multi-factor CFO authentication, formal business rationale, and immutable provenance logging for any temporary period reopening.

---

## 2. SCOPE

- **Production Requirements:** Complete schema and service contracts for calculation versions, accounting period freezes, simulation dry-runs, and restatement audits.
- **Product Compatibility:** Operates seamlessly alongside Phase 71 (Ledger), Phase 72 (Cost Model), Phase 73 (Facility Settings), Phase 74 (Margin Engine), Phase 75 (OR Yield), and Phase 76 (Completeness Score).
- **Strict Tenancy & Multi-Facility RBAC:** Enforces strict isolation per facility via `is_facility_accessible(facility_id)`.
- **Authoritative Server-Side Logic:** Calculation version inventory and period freeze status codified via PostgreSQL tables, views, and RLS policies.
- **Design System Fidelity:** Maestro Clinical Design System (Slate, Emerald, Sky Blue, Amber, Rose; strictly 0 purple/violet tokens) with responsive table layouts (`min-width: 1100px`).

---

## 3. CURRENT STATE AUDIT

An audit of existing database migrations (001–052) and client components was conducted prior to implementation:

| Existing Field / Component | Current Location | Classification | Current Defect / Semantic Risk | Target State in Phase 77 |
| :--- | :--- | :---: | :--- | :--- |
| `case_contribution_margin_snapshots.calculation_version` | Migration 050 | **KEEP** | Static string default `'2026.1'`; unlinked to formal version registry | Foreign key relationship to registered version registry |
| `Period Freeze Mechanism` | None | **MISSING** | Historical cases recalculate dynamically if facility rates change | Table `accounting_period_freezes` with immutable status |
| `Simulation Dry-Runs` | None | **MISSING** | No facility to test proposed rate updates against historical data | Table `financial_recalculation_runs` + dry-run simulator |
| `Pre-Freeze Completeness Gate` | None | **MISSING** | Incomplete cases could be prematurely frozen into closed periods | Automated audit check requiring Phase 76 Score $\ge 90.00$ |
| `Version Audit Trail` | None | **MISSING** | No record of who locked, unlocked, or restated financial calculations | Table `financial_recalculation_runs` + provenance logging |

---

## 4. TARGET STATE ARCHITECTURE

Phase 77 establishes the governance and version control lifecycle for all financial calculations:

```mermaid
flowchart TD
    subgraph VersionRegistry["Calculation Version Lifecycle"]
        DRAFT["1. DRAFT Version\n(Testing & Parameter Calibration)"]
        ACTIVE["2. ACTIVE Production Version\n(Applied to In-Flight Cases)"]
        FROZEN_V["3. FROZEN / LOCKED Version\n(Immutable Baseline for Closed Periods)"]
        SUPERSEDED["4. SUPERSEDED / ARCHIVED\n(Read-Only Historical Reference)"]
    end

    DRAFT -->|Approval Gate| ACTIVE
    ACTIVE -->|Period Close| FROZEN_V
    ACTIVE -->|New Version Promoted| SUPERSEDED

    subgraph AccountingPeriodLifecycle["Accounting Period Freeze Gate"]
        OPEN_P["Open Accounting Period"]
        GATE{"Completeness Check\n(Phase 76 Score >= 90?)"}
        FROZEN_P["Frozen Closed Period\n(Immutable Financial Truth)"]
        REOPEN["Reopened Audit Exception\n(Requires CFO Rationale & Audit Stamp)"]
    end

    OPEN_P --> GATE
    GATE -->|Pass| FROZEN_P
    GATE -->|Fail (<90)| BLOCK["Blocked: Unresolved Gaps"]
    FROZEN_P -->|Exception Override| REOPEN
    REOPEN --> FROZEN_P

    subgraph Simulator["Simulation & Dry-Run Engine"]
        COMPARE["Compare Source Version vs Target Version"]
        RUN_SIM["Calculate Case Delta Variance ($ and %)"]
        AUDIT_LOG["Record Recalculation Run in Audit History"]
    end

    ACTIVE & DRAFT --> COMPARE --> RUN_SIM --> AUDIT_LOG
```

---

## 5. DATA MODEL / SCHEMA

### 5.1 Tables Created

1. **`financial_calculation_versions`**:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `facility_id UUID NOT NULL REFERENCES public.facilities(id)`
   - `version_code VARCHAR(32) NOT NULL` (e.g. `2026.1_BASELINE`, `2026.2_UPDATED`)
   - `version_name VARCHAR(128) NOT NULL`
   - `settings_id UUID REFERENCES public.facility_financial_settings(id)`
   - `status VARCHAR(32) NOT NULL CHECK (status IN ('DRAFT', 'ACTIVE', 'FROZEN', 'SUPERSEDED', 'DEPRECATED'))`
   - `effective_from DATE NOT NULL`, `effective_to DATE`
   - `is_locked BOOLEAN NOT NULL DEFAULT FALSE`
   - `locked_at TIMESTAMPTZ`, `locked_by UUID`, `lock_rationale TEXT`

2. **`accounting_period_freezes`**:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `facility_id UUID NOT NULL REFERENCES public.facilities(id)`
   - `period_name VARCHAR(64) NOT NULL` (e.g. `2026-Q1`, `2026-OCT`)
   - `period_start_date DATE NOT NULL`, `period_end_date DATE NOT NULL`
   - `calculation_version_id UUID NOT NULL REFERENCES public.financial_calculation_versions(id)`
   - `freeze_status VARCHAR(32) NOT NULL CHECK (freeze_status IN ('OPEN', 'PENDING_APPROVAL', 'FROZEN', 'REOPENED_AUDIT'))`
   - `total_cases_frozen INTEGER NOT NULL DEFAULT 0`
   - `total_frozen_revenue NUMERIC(14,2) NOT NULL DEFAULT 0.00`
   - `total_frozen_direct_costs NUMERIC(14,2) NOT NULL DEFAULT 0.00`
   - `total_frozen_contribution_margin NUMERIC(14,2) NOT NULL DEFAULT 0.00`
   - `frozen_at TIMESTAMPTZ`, `frozen_by UUID`

3. **`financial_recalculation_runs`**:
   - Tracks all production recalculation batches and dry-run simulations:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `run_type VARCHAR(32) NOT NULL CHECK (run_type IN ('PRODUCTION_POST', 'DRY_RUN_SIMULATION', 'AUDIT_BENCHMARK', 'HISTORICAL_RESTATEMENT'))`
   - `source_version_id UUID`, `target_version_id UUID`
   - `cases_evaluated INTEGER NOT NULL`
   - `total_baseline_margin NUMERIC(14,2)`, `total_recalculated_margin NUMERIC(14,2)`
   - `margin_variance NUMERIC(14,2)`, `variance_pct NUMERIC(6,2)`
   - `executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `executed_by UUID`

---

## 6. BUSINESS RULES & DETERMINISTIC FORMULAS

1. **Pre-Freeze Completeness Gate:** An accounting period cannot transition from `OPEN` to `FROZEN` if any case within that period has a Phase 76 Financial Completeness Score $< 90.00$, unless explicitly exempted by a CFO override approval.
2. **Immutability of Frozen Periods:** Once `freeze_status = 'FROZEN'`, all underlying journal lines, margin snapshots, and OR yield records are locked against modification.
3. **Simulation Variance Calculation:**
   $$\text{Margin Variance} = \text{Recalculated Margin} - \text{Baseline Margin}$$
   $$\text{Variance \%} = \text{ROUND}\left( \frac{\text{Margin Variance}}{\text{Baseline Margin}} \times 100.00, 2 \right)$$
4. **Deterministic Version Binding:** Cases always bind to the calculation version whose `effective_from` $\le \text{date\_of\_service} \le \text{effective\_to}$.
5. **Reopening Audit Governance:** Reopening a frozen period requires:
   - Authorized role (`cfo` or `system_administrator`).
   - Recorded `unfreeze_reason` (minimum 20 characters).
   - Timestamp and user provenance logged to `financial_recalculation_runs`.

---

## 7. PERMISSIONS & RBAC

| Role | View Versions & Freezes | Trigger Simulation Dry-Run | Freeze Accounting Period | Reopen Closed Period |
| :--- | :---: | :---: | :---: | :---: |
| `cfo` / `financial_director` | Allowed | Allowed | Allowed | Allowed |
| `system_administrator` | Allowed | Allowed | Allowed | Allowed |
| `compliance_officer` | Allowed | Allowed | Restricted | Restricted |
| `billing_specialist` | Allowed | Allowed (Dry-Run only) | Prohibited | Prohibited |
| `director_of_nursing` | Allowed (Read-only) | Prohibited | Prohibited | Prohibited |
| `clinical_staff` | Restricted | Prohibited | Prohibited | Prohibited |

---

## 8. API & SERVICE REQUIREMENTS

- **Service Module:** `src/lib/calculationVersioningService.js` (and re-export `src/services/calculationVersioningService.js`)
- **Authoritative Methods:**
  - `getActiveCalculationVersion(facilityId)`: Retrieves current production version.
  - `freezeAccountingPeriod(periodId, userId)`: Evaluates completeness gate and locks period.
  - `unfreezeAccountingPeriod(periodId, reason, userId)`: Reopens period with audit provenance.
  - `runSimulationDryRun(sourceVersionId, targetVersionId, cases)`: Computes variance without mutation.
  - `getBaselineSampleData()`: Generates initial periods, versions, and simulation runs.

---

## 9. UI / WORKFLOW REQUIREMENTS

- **Component:** `src/components/CalculationVersioningView.jsx` & `CalculationVersioningView.css`
- **Layout & Structure:**
  - **KPI Banner:** Active Version Badge, Frozen Accounting Periods, Protected Frozen Margin ($), Simulation Dry-Run Variance ($).
  - **Tab Controls:** Accounting Period Freezes, Version Inventory, Recalculation & Simulation Simulator, Version Audit Trail.
  - **Data Table:** Wrapped in `<div className="table-responsive">` with `min-width: 1100px`.
  - **Visual Badging:** Maestro status pills (`FROZEN` = Emerald, `ACTIVE` = Sky Blue, `DRAFT` = Amber, `REOPENED` = Rose).
  - **Simulation Modal:** Side-by-side comparison of baseline vs proposed version with delta highlight.
  - **Freeze Dialog:** Automated check showing audit completeness gate pass/fail before confirmation.
  - **CSV Export:** Capability to export frozen period ledgers and simulation results.

---

## 10. AUDIT & PROVENANCE

- Every lock/unlock action records `locked_at`, `locked_by`, and `lock_rationale`.
- Recalculation runs capture complete input parameters, case IDs, and execution summaries in `financial_recalculation_runs.run_summary`.
- Backward compatibility is guaranteed: historical reports query frozen snapshots without live re-computation.

---

## 11. QA & TEST CASES

- **Unit Tests:** Version status transitions, period freeze completeness validation, simulation delta math, variance percentage calculation.
- **Security & Tenancy:** Verifies RLS policies enforce `is_facility_accessible(facility_id)`.
- **Palette Governance:** Static scan ensuring zero banned purple/violet tokens.
- **End-to-End Regression:** Ensures full suite of 1,020+ tests pass without breaking prior phases.

---

## 12. ACCEPTANCE CRITERIA

- [x] Migration `053_financial_calculation_versioning.sql` and `053_financial_calculation_versioning_down.sql` created and verified.
- [x] Client calculation service `calculationVersioningService.js` implemented with pure functions.
- [x] UI component `CalculationVersioningView.jsx` matches Maestro clinical design guidelines (0 purple tokens).
- [x] Responsive layout with `overflow-x: auto` and `min-width: 1100px` verified.
- [x] All unit and integration tests pass without regression.
- [x] App navigation updated to include Calculation Versioning.

---

## 13. DEPENDENCIES

- Phase 70: Financial Data Dictionary
- Phase 71: Case Financial Ledger
- Phase 72: Case Cost Model
- Phase 73: Facility Financial Settings
- Phase 74: Contribution Margin Engine
- Phase 75: Contribution Per OR Hour
- Phase 76: Financial Completeness Score

---

## 14. DEFINITION OF DONE

Phase 77 is fully complete: database tables, rollup views, RLS policies, client service layer, comprehensive unit tests, Maestro UI view, and single-file documentation are complete and verified, concluding Phase 07 (Financials) in its entirety.

---

## 15. IMPLEMENTATION NOTES

- **Migration Files Created:**
  - `supabase/migrations/053_financial_calculation_versioning.sql`
  - `supabase/migrations/053_financial_calculation_versioning_down.sql`
- **Service Layer:**
  - `src/lib/calculationVersioningService.js`
  - `src/services/calculationVersioningService.js`
- **UI Components:**
  - `src/components/CalculationVersioningView.jsx`
  - `src/components/CalculationVersioningView.css`
- **Test Suite:**
  - `tests/calculation-versioning.test.js`
- **Application Integration:**
  - Registered in `src/App.jsx` under Financials menu as "Financial Calculation Versioning".
