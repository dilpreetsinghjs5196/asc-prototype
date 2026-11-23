# E1 BUDGET VS ACTUAL & VARIANCE REPORTING

## Purpose
The Budget vs. Actual (BvA) Model and Variance Reporting engine provides deterministic financial comparison, volume-rate-mix decomposition, and operational variance governance for Ambulatory Surgery Centers (ASCs). In an ASC surgical environment, top-line financial variances cannot be evaluated through generic revenue line-item accounting alone; a variance in Net Patient Revenue (NPR) or Direct Clinical Margin is fundamentally driven by a multi-dimensional combination of **case volume fluctuations**, **surgical specialty mix shifts** (e.g. orthopedics vs. ophthalmology vs. pain management), **payer reimbursement rate discrepancies**, and **clinical supply cost inflation** (implants and custom pack pricing).

This specification establishes an auditable budget baseline model, deterministic 3-way variance math (Volume Variance, Rate/Price Variance, Case Mix Variance), automated materiality threshold classification, and cryptographic budget freeze governance.

---

## Scope
- **Production Requirements:** Multi-version budget lifecycle management (`DRAFT`, `UNDER_REVIEW`, `APPROVED_ACTIVE`, `SUPERSEDED`, `ARCHIVED`), period-specific target allocations (monthly, quarterly, annual), flexible budgeting benchmarks, and root-cause mitigation tracking.
- **ASCANALYST Compatibility:** Seamless bidirectional data flow with Phase E0 Management P&L (`management_pnl_statement_lines`), Phase 71 Case Financial Ledger (`case_financial_ledger_entries`), Phase 73 Contribution Margin Engine (`contribution_margin_engine`), and Phase D6 Realized Value Calculation (`realized_value_calculations`).
- **Deterministic Financial Logic:** Hard mathematical rules for favorable/unfavorable polarity inversion (Revenue/Margin vs. Cost/Expense accounts), flexible budget re-baselining, and volume-price-mix variance bridge equations.
- **Tenancy & RBAC:** Enforced facility isolation with Naples Surgery Center (`fac-naples-01` / `00000000-0000-0000-0000-000000000002`) compatibility, CFO-exclusive budget approval, and SHA-256 seal verification.

---

## Current State
An audit of existing repository assets and database models reveals the following component classifications:

| Component | Status | Classification | Current Behavior & Gap Analysis |
|:---|:---|:---|:---|
| `public.management_pnl_statement_lines` (Migration 114) | Active | **KEEP** | Authoritative actual ledger totals for Gross Revenue, Contractual Deductions, NPR, Direct Clinical Costs, EBITDA, and NOI. Provides the actuals feeding into the BvA engine. |
| `public.case_financial_ledger_entries` (Migration 047) | Active | **KEEP** | Case-level billing transactions and actual case volumes. Supplies operational drivers. |
| `public.contribution_margin_engine` (Migration 050) | Active | **KEEP** | Computes surgery-level contribution margins and case-level variances against baseline cost targets. |
| `public.realized_value_calculations` (Migration 113) | Active | **KEEP** | Quantifies realized value impact from executive interventions that close budget deficit gaps. |
| Static / Manual Spreadsheet Budgets | Legacy | **REPLACE** | Off-system manual Excel models with no audit history, unverified formula links, and zero automated synchronization with closed P&L periods. |
| Facility Budget Master & Versioning Schema | Missing | **MISSING** | No database tables tracking annual approved budgets, quarterly re-forecasts, version lineages, or CFO approval status. |
| Line-Item Budget Target Allocations | Missing | **MISSING** | No normalized storage for monthly budgeted case volume, procedural charge targets, allowable assumptions, or OPEX budgets. |
| Deterministic 3-Way Variance Decomposition Engine | Missing | **MISSING** | No automated mathematical decomposition separating pure volume gains/losses from reimbursement price changes and specialty mix shifts. |
| Variance Severity & Mitigation Workflow | Missing | **MISSING** | No system flags for material ($>5\%$) or critical ($>10\%$) budget deficits requiring formal CFO explanation and action plans. |

---

## Target State
The target state delivers an enterprise-grade CFO Budget vs. Actual intelligence suite:
1. **Multi-Version Budget Management:**
   - Formal budget records (`facility_budgets`) supporting annual baseline targets (`FY2026_ORIGINAL`) and quarterly re-forecast iterations (`FY2026_Q3_FORECAST`).
   - Strict version control: only one budget version may be `APPROVED_ACTIVE` per facility and fiscal period at any given time.
   - Tamper-evident SHA-256 digital seals stamped upon CFO approval.
2. **Standardized Line-Item Budget Targets:**
   - Detailed targets across both financial lines (Gross Revenue, Allowances, NPR, Implants, Supplies, Labor, Fixed Overhead, EBITDA) and operational volume drivers (Case Volume, Total OR Minutes, Average Cases per Day).
   - Dynamic unit rate benchmarks (e.g. Target NPR per Case, Target Implant Cost per Orthopedic Case, Nursing Cost per OR Minute).
3. **Deterministic 3-Way Variance Decomposition:**
   - **Flexible Budget:** $\text{Flex Budget} = \text{Actual Volume} \times \text{Budget Unit Rate}$.
   - **Volume Variance:** $(\text{Actual Volume} - \text{Budget Volume}) \times \text{Budget Unit Rate}$.
   - **Rate / Price Variance:** $(\text{Actual Unit Rate} - \text{Budget Unit Rate}) \times \text{Actual Volume}$.
   - **Mix Variance:** Variance driven by procedural acuity and specialty case proportions.
4. **Materiality & Variance Polarity Engine:**
   - **Revenue & Margin Lines:** $\text{Actual} \ge \text{Budget} \implies \text{FAVORABLE}$; $\text{Actual} < \text{Budget} \implies \text{UNFAVORABLE}$.
   - **Expense & Cost Lines:** $\text{Actual} \le \text{Budget} \implies \text{FAVORABLE}$; $\text{Actual} > \text{Budget} \implies \text{UNFAVORABLE}$.
   - **Severity Tiers:** `NORMAL` ($|\Delta \%| \le 3\%$), `ATTENTION` ($3\% < |\Delta \%| \le 10\%$), `CRITICAL` ($|\Delta \%| > 10\%$).
5. **Interactive Executive UI & Dark Mode:**
   - Designed under the Maestro Clinical Design System (Emerald, Amber, Crimson, Sky, Slate) with zero prohibited accent tokens.
   - Executive Ribbon: 5 key telemetry cards (Total Revenue Variance, Operating Cost Variance, EBITDA Variance, Case Volume Delta, Critical Alerts).
   - Interactive Flexible Budgeting & Variance Bridge Waterfall.
   - Expandable Hierarchical BvA Statement Table with one-click drilldown into root causes.
   - Variance Mitigation & Explanation Drawer allowing CFOs and Clinical Directors to log explanatory notes and action plans.

---

## Data Model / Schema

### 1. `public.facility_budgets`
Stores annual budget plans, re-forecast versions, approval provenance, and cryptographic seals.
```sql
CREATE TABLE IF NOT EXISTS public.facility_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    budget_code VARCHAR(32) NOT NULL, -- e.g. 'FY2026_ORIGINAL', 'FY2026_Q3_FORECAST'
    budget_name VARCHAR(128) NOT NULL, -- e.g. 'FY 2026 Approved Operating Budget'
    fiscal_year INT NOT NULL CHECK (fiscal_year BETWEEN 2020 AND 2050),
    version_number INT NOT NULL DEFAULT 1,
    status VARCHAR(24) NOT NULL DEFAULT 'DRAFT' CHECK (
        status IN ('DRAFT', 'UNDER_REVIEW', 'APPROVED_ACTIVE', 'SUPERSEDED', 'ARCHIVED')
    ),
    effective_start_date DATE NOT NULL,
    effective_end_date DATE NOT NULL,
    is_approved BOOLEAN NOT NULL DEFAULT false,
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES auth.users(id),
    frozen_hash VARCHAR(64),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_budget_code UNIQUE (facility_id, budget_code)
);
```

### 2. `public.budget_line_items`
Stores monthly and annual target values, account categories, units of measure, and benchmark unit rates.
```sql
CREATE TABLE IF NOT EXISTS public.budget_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    budget_id UUID NOT NULL REFERENCES public.facility_budgets(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    period_code VARCHAR(16) NOT NULL, -- e.g. '2026-M10', '2026-Q4', '2026-FY'
    line_code VARCHAR(32) NOT NULL, -- e.g. 'CASE_VOLUME', 'GROSS_REVENUE', 'NPR', 'DIR_IMPLANTS', 'EBITDA'
    line_name VARCHAR(128) NOT NULL,
    account_category VARCHAR(32) NOT NULL CHECK (account_category IN (
        'VOLUME',
        'GROSS_REVENUE',
        'CONTRACTUAL_DEDUCTION',
        'NET_REVENUE',
        'DIRECT_COST',
        'VARIABLE_COST',
        'FIXED_OVERHEAD',
        'MARGIN'
    )),
    unit_of_measure VARCHAR(24) NOT NULL DEFAULT 'CURRENCY' CHECK (
        unit_of_measure IN ('CURRENCY', 'CASES', 'MINUTES', 'RATIO_PERCENT')
    ),
    target_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    target_unit_rate NUMERIC(14, 2) NOT NULL DEFAULT 0.00, -- e.g. $ per case or $ per min
    calculation_formula TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_budget_period_line UNIQUE (budget_id, period_code, line_code)
);
```

### 3. `public.budget_variance_analyses`
Stores computed variances, polarity, severity, volume/rate decomposition, and root cause notes.
```sql
CREATE TABLE IF NOT EXISTS public.budget_variance_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    budget_id UUID NOT NULL REFERENCES public.facility_budgets(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    period_code VARCHAR(16) NOT NULL,
    line_code VARCHAR(32) NOT NULL,
    line_name VARCHAR(128) NOT NULL,
    account_category VARCHAR(32) NOT NULL,
    actual_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    budget_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    dollar_variance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    percent_variance NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    is_favorable BOOLEAN NOT NULL DEFAULT true,
    severity VARCHAR(24) NOT NULL DEFAULT 'NORMAL' CHECK (
        severity IN ('NORMAL', 'ATTENTION', 'CRITICAL')
    ),
    flexible_budget_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    volume_impact NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    rate_impact NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    mix_impact NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    explanation TEXT,
    action_plan TEXT,
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_variance_period_line UNIQUE (budget_id, period_code, line_code)
);
```

---

## Business Rules

### 1. Polarity Inversion (Favorable vs. Unfavorable)
The business interpretation of variance strictly depends on the account classification:
- **Revenue & Margins (`GROSS_REVENUE`, `NET_REVENUE`, `MARGIN`):**
  $$\Delta \$ = \text{Actual} - \text{Budget}$$
  $$\text{is\_favorable} = (\text{Actual} \ge \text{Budget})$$
- **Costs & Expenses (`CONTRACTUAL_DEDUCTION`, `DIRECT_COST`, `VARIABLE_COST`, `FIXED_OVERHEAD`):**
  $$\Delta \$ = \text{Budget} - \text{Actual} \quad (\text{or presented as } \text{Actual} - \text{Budget} \text{ where negative is surplus})$$
  $$\text{is\_favorable} = (\text{Actual} \le \text{Budget})$$
- **Operational Volume (`VOLUME`):**
  $$\Delta = \text{Actual} - \text{Budget}$$
  $$\text{is\_favorable} = (\text{Actual} \ge \text{Budget})$$

### 2. Percentage Variance Calculation
$$\Delta \% = \begin{cases} 
0.00\% & \text{if } |\text{Budget}| = 0 \text{ and } |\text{Actual}| = 0 \\
100.00\% & \text{if } |\text{Budget}| = 0 \text{ and } |\text{Actual}| > 0 \\
\frac{\text{Actual} - \text{Budget}}{|\text{Budget}|} \times 100\% & \text{otherwise}
\end{cases}$$

### 3. Flexible Budgeting & 3-Way Variance Decomposition
- **Volume Variance:**
  $$\text{Volume Variance} = (\text{Actual Cases} - \text{Budget Cases}) \times \text{Budget Unit Rate}$$
- **Rate / Price Variance:**
  $$\text{Rate Variance} = (\text{Actual Unit Rate} - \text{Budget Unit Rate}) \times \text{Actual Cases}$$
- **Mix Variance:**
  $$\text{Mix Variance} = \text{Total Dollar Variance} - (\text{Volume Variance} + \text{Rate Variance})$$

### 4. Severity Tiers & Materiality Thresholds
- **`NORMAL`:** Absolute variance percentage $|\Delta \%| \le 3.0\%$.
- **`ATTENTION`:** Absolute variance percentage $3.0\% < |\Delta \%| \le 10.0\%$.
- **`CRITICAL`:** Absolute variance percentage $|\Delta \%| > 10.0\%$ OR dollar variance $|\Delta \$| \ge \$25,000.00$.

### 5. Single Active Budget Constraint
For any given facility and fiscal year, exactly one budget record can hold the status `APPROVED_ACTIVE`. Activating a new re-forecast version automatically transitions the prior active version to `SUPERSEDED`.

### 6. Cryptographic Seal
When a budget is approved, a deterministic SHA-256 hash is computed over the facility ID, budget code, line codes, target amounts, and timestamp. The hash is saved to `frozen_hash`. Once approved, target values become immutable.

---

## Permissions / Security

| Role | View BvA Reports | Create / Edit Budget | Approve Budget (CFO) | Log Root Cause / Action | Export Dossier |
|:---|:---:|:---:|:---:|:---:|:---:|
| `cfo` | Yes | Yes | Yes | Yes | Yes |
| `facility_administrator` | Yes | Yes | No | Yes | Yes |
| `clinical_director` | Yes | No | No | Yes | Yes |
| `executive_viewer` | Yes | No | No | No | Yes |
| `analyst` | Yes | No | No | No | Yes |
| `staff` | No | No | No | No | No |

- **Row Level Security (RLS):** All queries are filtered through `facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid OR current_setting('app.is_super_admin', true) = 'true'`.

---

## API / Service Requirements

The service layer (`src/services/budgetVarianceService.js`) provides:
1. `getFacilityBudgets(facilityId)`: Retrieves all budget versions for a facility.
2. `getBudgetByCode(budgetCode, facilityId)`: Retrieves budget master and associated line items.
3. `calculateBudgetVariance(actuals, budget)`: Computes deterministic dollar variance, percentage variance, favorable flag, and severity.
4. `calculateVolumeRateMixDecomposition(actuals, budget, actualVolume, budgetVolume)`: Decomposes variances into volume, rate, and mix components.
5. `approveAndFreezeBudget(budgetId, userId)`: Verifies role, generates SHA-256 seal, sets status to `APPROVED_ACTIVE`, and supersedes older versions.
6. `saveVarianceExplanation(varianceId, explanation, actionPlan, userId)`: Stores mitigation notes.
7. `getBvaExecutiveTelemetry(facilityId, periodCode)`: Returns summary KPI cards (Revenue variance, Cost variance, EBITDA variance, Case Volume variance, Alert counts).

---

## UI / Workflow Requirements

- **Header & Version Selector:** Displays current facility, fiscal year, active budget version selector, and freeze status badge.
- **5-Card CFO Executive Ribbon:**
  1. **Net Patient Revenue Variance:** Total actual vs. budget revenue delta, formatted with favorable emerald / unfavorable crimson badges.
  2. **Direct Clinical Cost Variance:** Total surgical supplies & implant variance with unit-per-case metrics.
  3. **Operating EBITDA Variance:** Cash flow variance and percent deviation against budget target.
  4. **Surgical Case Volume Delta:** Actual cases vs. budget cases with flexible budget impact.
  5. **Material Alerts:** Count of line items exceeding the 10% critical threshold.
- **Variance Bridge Waterfall Card:** Visualizes the waterfall bridge: Budgeted EBITDA $\to$ Volume Impact $\to$ Rate Impact $\to$ Mix Impact $\to$ Actual EBITDA.
- **Search & Filter Toolbar:** Filter by Account Category (All, Revenue, Direct Costs, OPEX, Margin) and Status (All, Favorable, Unfavorable, Critical).
- **Hierarchical Statement Table:** Displays line items grouped by financial tier, with Actual, Budget, Flexible Budget, Dollar Variance, Percent Variance, and Favorable/Unfavorable pills.
- **Root Cause & Action Plan Drawer:** Slides out upon clicking any variance line item, displaying historical trends, volume drivers, and input fields for root cause analysis and action plans.
- **Theme Support:** 100% native support for Light Mode and Dark Mode (`[data-theme="dark"]` and `.dark`).
- **Zero Prohibited Accent Tokens:** Strict enforcement of the zero-purple rule.

---

## Audit / Provenance
All budget activations, line modifications, variance calculations, and action plans record:
- User ID (`auth.users(id)`)
- Timestamp (`TIMESTAMPTZ`)
- Facility ID & Tenant context
- Before/After state in `facility_budgets.metadata`
- Cryptographic hash (`frozen_hash`) computed using SHA-256.

---

## QA / Test Cases
- **Test 1:** Telemetry & Summary Aggregation returns accurate variance totals for October 2026.
- **Test 2:** Facility alias resolution matches Naples Surgery Center correctly (`fac-naples-01`).
- **Test 3:** Favorable / Unfavorable polarity rule correctly inverts for revenue vs. expense lines.
- **Test 4:** Division by zero guard handles zero-budget line items without returning `NaN` or `Infinity`.
- **Test 5:** 3-Way Variance Decomposition equation balances: $\text{Dollar Variance} = \text{Volume Impact} + \text{Rate Impact} + \text{Mix Impact}$.
- **Test 6:** Flexible budgeting benchmarks scale accurately with actual volume.
- **Test 7:** Materiality and severity threshold classification correctly flags $>10\%$ as `CRITICAL`.
- **Test 8:** Budget approval enforces single active version per facility and computes SHA-256 seal.
- **Test 9:** Migration 115 UP/DOWN SQL structural integrity and RLS policies.
- **Test 10:** Strict Zero-Purple CSS Compliance in `BudgetVarianceView.css`.
- **Test 11:** App shell navigation and tab integration in `src/App.jsx`.

---

## Acceptance Criteria
- [x] Build passes (`npm run build` exits 0).
- [x] Lint & automated tests pass (`node --test tests/budget-variance.test.js` passes 100%).
- [x] No mock/placeholder numbers presented as production truth; all values derive from deterministic calculations.
- [x] Tenant isolation verified across queries.
- [x] Strict zero prohibited accent tokens (no purple, violet, indigo, magenta, fuchsia).
- [x] Full Light Mode and Dark Mode visual parity.

---

## Dependencies
- Phase 71: Case Financial Ledger (`case_financial_ledger_entries`)
- Phase 73: Contribution Margin Engine (`contribution_margin_engine`)
- Phase D6: Realized Value Calculation (`realized_value_calculations`)
- Phase E0: Management P&L & Reconciliation Boundaries (`management_pnl_statement_lines`)

---

## Definition of Done
Feature E1 is complete when:
1. Production specification is published and synchronized across local `docs/phases/` and global `ASCANALYST_MD_SPECS/Phase_14_CFO/`.
2. Supabase migration 115 UP and DOWN scripts are written and validated with robust RLS policies.
3. Backend service and calculation engine are fully implemented.
4. Executive UI component with Light/Dark mode and zero prohibited tokens is built and wired into `App.jsx`.
5. Automated test suite passes 100% and production build succeeds.

---

## Implementation Notes
- **Specification Files:** `docs/phases/E1_BUDGET_VS_ACTUAL.md` and `ASCANALYST_MD_SPECS/Phase_14_CFO/E1_BUDGET_VS_ACTUAL.md`.
- **Migrations:** `supabase/migrations/115_budget_vs_actual.sql` and `supabase/migrations/115_budget_vs_actual_down.sql`.
- **Services:** `src/services/budgetVarianceService.js` and facade `src/lib/budgetVarianceService.js`.
- **Components:** `src/components/BudgetVarianceView.jsx` and `src/components/BudgetVarianceView.css`.
- **App Shell:** `src/App.jsx` sidebar, header, and route integration.
- **Tests:** `tests/budget-variance.test.js`.
