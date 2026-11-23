# E2 ROLLING FORECAST & CONTINUOUS PROJECTION ENGINE

## Purpose
The Rolling Forecast and Continuous Projection engine delivers an auditable, multi-horizon financial forecasting model tailored specifically for Ambulatory Surgery Centers (ASCs). In dynamic outpatient surgical environments, static annual budgets become outdated almost immediately due to seasonal deductible resets (e.g., lower elective case volumes in Q1), surgeon block scheduling shifts (vacations, block releases, new surgeon onboarding), payer contract re-negotiations, and procedural case-mix fluctuations.

This module establishes a deterministic, multi-method forecasting engine spanning a 12-month rolling horizon (or 4 rolling quarters). Each period, as historical accounting actuals close in Phase E0 Management P&L and variances are analyzed in Phase E1 Budget vs. Actual, the rolling forecast drops the oldest actualized period, adds a new future projection period, and dynamically updates operational assumptions to provide continuous financial visibility, capacity headroom tracking, and EBITDA projections.

---

## Scope
- **Production Requirements:** Continuous 12-month rolling horizon lifecycle management (`DRAFT`, `UNDER_REVIEW`, `ACTIVE_PROJECTION`, `SUPERSEDED`, `ARCHIVED`), multi-method deterministic projection algorithms, dynamic seasonal indexing, capacity-constrained OR scheduling bounds, multi-scenario sensitivity modeling (Baseline, Optimistic, Conservative), and cryptographic forecast freeze seals.
- **ASCANALYST Compatibility:** Seamless integration with Phase E0 Management P&L (`management_pnl_statement_lines`), Phase E1 Budget vs. Actual (`budget_variance_analyses`), Phase 71 Case Financial Ledger (`case_financial_ledger_entries`), Phase 72 Cost Model (`facility_financial_settings`), Phase 73 Contribution Margin Engine (`contribution_margin_engine`), and OR Block Scheduling modules.
- **Deterministic Billing & Financial Logic:** Hard mathematical rules for Trailing 3-Month Run-Rate (T3M), historical seasonal curve adjustment, OR minute capacity ceilings, case-mix yield scaling, and Gross-to-Net revenue deductions.
- **Tenancy & RBAC:** Enforced facility isolation with Naples Surgery Center (`fac-naples-01` / `00000000-0000-0000-0000-000000000002`) compatibility, CFO-exclusive projection activation, and tamper-evident SHA-256 digital seals.

---

## Current State
An audit of existing repository assets and database models reveals the following component classifications:

| Component | Status | Classification | Current Behavior & Gap Analysis |
|:---|:---|:---|:---|
| `public.management_pnl_statement_lines` (Migration 114) | Active | **KEEP** | Authoritative closed-period actuals for Gross Revenue, NPR, Direct Clinical Costs, EBITDA, and NOI. Serves as the historical baseline for trailing run-rate calculations. |
| `public.facility_budgets` & `public.budget_variance_analyses` (Migration 115) | Active | **KEEP** | Annual static budget targets and 3-way variance decompositions. Supplies the benchmark against which rolling projections are compared. |
| `public.case_financial_ledger_entries` (Migration 047) | Active | **KEEP** | Case-level billing transactions and actual case volumes. Supplies operational drivers. |
| `public.facility_financial_settings` (Migration 049) | Active | **KEEP** | Baseline clinical wages, indirect allocation factors, and effective dates. Supplies cost parameters. |
| Static Spreadsheets & Manual Excel Forecasts | Legacy | **REPLACE** | Off-system disconnected spreadsheets with broken links, no multi-period roll-forward logic, zero OR capacity bounds, and no audit trail. |
| Rolling Forecast Master Schema | Missing | **MISSING** | No database tables tracking 12-month rolling forecast plans, version lineages, horizon boundaries, or CFO approval status. |
| Multi-Period Projection Matrix Table | Missing | **MISSING** | No normalized storage for future monthly projection periods, seasonality multipliers, or line-item projections. |
| Deterministic Forecasting Method Engine | Missing | **MISSING** | No automated mathematical engines supporting T3M Run-Rate, Seasonal Indexing, Capacity-Constrained OR Pipeline, or Scheduled Backlog models. |
| Scenario Sensitivity & Confidence Intervals | Missing | **MISSING** | No multi-scenario simulation infrastructure (Baseline, Optimistic, Conservative) with dynamic sensitivity toggles. |

---

## Target State
The target state delivers an enterprise-grade CFO Rolling Forecast & Continuous Projection suite:
1. **Continuous 12-Month Rolling Horizon:**
   - Formal forecast records (`facility_rolling_forecasts`) maintaining an unbroken 12-month forward-looking trajectory (e.g. November 2026 through October 2027).
   - Automated roll-forward: when October 2026 actuals close, the baseline updates to October 2026 actuals, and October 2027 is projected.
   - Strict version control: only one rolling forecast version may be `ACTIVE_PROJECTION` per facility at any given time.
   - Cryptographic SHA-256 seal stamped upon CFO approval.
2. **Deterministic Forecasting Methodologies:**
   - **Method 1: Trailing 3-Month Run-Rate (T3M):** Weighted moving average of recent closed actuals:
     $$\text{Run-Rate} = 0.50 \times M_{-1} + 0.30 \times M_{-2} + 0.20 \times M_{-3}$$
   - **Method 2: Historical Seasonal Indexing:** Adjusts annual baseline rates using empirical ASC seasonality factors (e.g., Q1 deductible dip $0.88\times$, Q2 steady $1.02\times$, Q3 summer lull $0.95\times$, Q4 year-end surge $1.15\times$).
   - **Method 3: Capacity-Constrained OR Scheduling Pipeline:** Projections bounded by physical facility constraints:
     $$\text{Max Capacity} = \text{OR Rooms} \times \text{Operating Days} \times \text{Staffed Hours/Day}$$
     $$\text{Projected Cases} = \min(\text{Unconstrained Cases}, \frac{\text{Available OR Minutes} \times \text{Utilization Rate}}{\text{Average Duration per Case}})$$
   - **Method 4: Scheduled Case Backlog & Pre-Auth Pipeline:** High-confidence near-term forecast (Months +1 and +2) derived from actual scheduled cases adjusted for historical cancellation rates (e.g. $4.5\%$).
   - **Method 5: Blended / Composite Forecast:** CFO-configured weighted ensemble of methods (e.g. $40\%$ Backlog, $30\%$ Seasonal, $30\%$ Run-Rate).
3. **Multi-Scenario Sensitivity Modeling:**
   - **Baseline Scenario ($1.00\times$):** Deterministic projection based on selected primary methodology.
   - **Optimistic Bull Case ($+8\%$ Volume, $+2\%$ Margin):** Favorable physician onboarding, higher surgical block utilization, and improved implant pricing.
   - **Conservative Bear Case ($-10\%$ Volume, $-3\%$ Margin):** Physician block vacation, higher supply inflation, or payer denial delays.
4. **Interactive CFO Analytics UI & Dark Mode:**
   - Built under the Maestro Clinical Design System (Emerald, Amber, Crimson, Sky, Slate) with strict zero-purple token compliance.
   - Executive Horizon Ribbon: 5 key telemetry cards (12-Month Projected NPR, 12-Month Projected EBITDA, Projected Annual Cases, OR Capacity Headroom, Forecast Reliability Score).
   - Dynamic Horizon Selector (Full 12 Months, Next 6 Months, Next Quarter).
   - Monthly Trajectory Waterfall & Area Trend Chart comparing actuals, baseline forecast, and confidence intervals.
   - Expandable Multi-Period Matrix Table displaying monthly projections, quarterly rollups, and variance from budget.
   - Method Parameter Tuning Drawer allowing CFOs to inspect and override seasonality weights and capacity utilization assumptions.

---

## Data Model / Schema

### 1. `public.facility_rolling_forecasts`
Stores rolling forecast plans, version lineages, horizon definitions, primary methodologies, and cryptographic seals.
```sql
CREATE TABLE IF NOT EXISTS public.facility_rolling_forecasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    forecast_code VARCHAR(32) NOT NULL, -- e.g. 'RF2026_12M_BASE', 'RF2026_Q4_OPTIMISTIC'
    forecast_name VARCHAR(128) NOT NULL, -- e.g. '12-Month Rolling Operating Forecast (Nov 2026 - Oct 2027)'
    horizon_type VARCHAR(24) NOT NULL DEFAULT '12_MONTH' CHECK (
        horizon_type IN ('3_MONTH', '6_MONTH', '12_MONTH', '4_QUARTER')
    ),
    baseline_period_code VARCHAR(16) NOT NULL, -- e.g. '2026-M10'
    primary_method VARCHAR(32) NOT NULL DEFAULT 'BLENDED_COMPOSITE' CHECK (
        primary_method IN ('T3M_RUN_RATE', 'SEASONAL_INDEX', 'CAPACITY_PIPELINE', 'SCHEDULED_BACKLOG', 'BLENDED_COMPOSITE')
    ),
    version_number INT NOT NULL DEFAULT 1,
    status VARCHAR(24) NOT NULL DEFAULT 'DRAFT' CHECK (
        status IN ('DRAFT', 'UNDER_REVIEW', 'ACTIVE_PROJECTION', 'SUPERSEDED', 'ARCHIVED')
    ),
    start_period_code VARCHAR(16) NOT NULL, -- e.g. '2026-M11'
    end_period_code VARCHAR(16) NOT NULL,   -- e.g. '2027-M10'
    is_active BOOLEAN NOT NULL DEFAULT false,
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES auth.users(id),
    frozen_hash VARCHAR(64),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_forecast_code UNIQUE (facility_id, forecast_code)
);

CREATE INDEX IF NOT EXISTS idx_rolling_forecasts_facility ON public.facility_rolling_forecasts(facility_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rolling_forecasts_status ON public.facility_rolling_forecasts(status);
```

### 2. `public.rolling_forecast_periods`
Defines sequential monthly future projection periods within a forecast plan, tracking horizon sequence, seasonality index, and confidence score.
```sql
CREATE TABLE IF NOT EXISTS public.rolling_forecast_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    forecast_id UUID NOT NULL REFERENCES public.facility_rolling_forecasts(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    period_code VARCHAR(16) NOT NULL, -- e.g. '2026-M11', '2026-M12', '2027-M01'
    period_name VARCHAR(64) NOT NULL, -- e.g. 'November 2026'
    sequence_order INT NOT NULL CHECK (sequence_order BETWEEN 1 AND 24),
    calendar_year INT NOT NULL,
    calendar_month INT NOT NULL CHECK (calendar_month BETWEEN 1 AND 12),
    quarter_code VARCHAR(16) NOT NULL, -- e.g. '2026-Q4'
    seasonality_index NUMERIC(5, 4) NOT NULL DEFAULT 1.0000, -- e.g. 1.1500 for Dec, 0.8800 for Jan
    working_days INT NOT NULL DEFAULT 21,
    confidence_score NUMERIC(5, 4) NOT NULL DEFAULT 0.9500, -- drops as horizon extends into future
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_forecast_period UNIQUE (forecast_id, period_code)
);

CREATE INDEX IF NOT EXISTS idx_rf_periods_forecast ON public.rolling_forecast_periods(forecast_id, sequence_order);
```

### 3. `public.rolling_forecast_line_items`
Stores line-item projections across financial and operational tiers for each period and scenario.
```sql
CREATE TABLE IF NOT EXISTS public.rolling_forecast_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    forecast_id UUID NOT NULL REFERENCES public.facility_rolling_forecasts(id) ON DELETE CASCADE,
    period_id UUID NOT NULL REFERENCES public.rolling_forecast_periods(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    period_code VARCHAR(16) NOT NULL,
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
    baseline_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    optimistic_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    conservative_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    method_used VARCHAR(32) NOT NULL DEFAULT 'BLENDED_COMPOSITE',
    unit_benchmark_rate NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    variance_vs_annual_budget NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_forecast_period_line UNIQUE (forecast_id, period_code, line_code)
);

CREATE INDEX IF NOT EXISTS idx_rf_lines_forecast ON public.rolling_forecast_line_items(forecast_id, period_code);
CREATE INDEX IF NOT EXISTS idx_rf_lines_code ON public.rolling_forecast_line_items(line_code);
```

### 4. `public.rolling_forecast_methods`
Stores configuration parameters, weights, and empirical coefficients for projection algorithms.
```sql
CREATE TABLE IF NOT EXISTS public.rolling_forecast_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    method_code VARCHAR(32) NOT NULL,
    method_name VARCHAR(128) NOT NULL,
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_method_code UNIQUE (facility_id, method_code)
);
```

### 5. Telemetry View: `public.vw_rolling_forecast_telemetry`
Aggregates summary 12-month projections, EBITDA totals, capacity headroom, and forecast reliability indexes.
```sql
CREATE OR REPLACE VIEW public.vw_rolling_forecast_telemetry AS
SELECT
    f.facility_id,
    f.id AS forecast_id,
    f.forecast_code,
    f.forecast_name,
    f.horizon_type,
    f.baseline_period_code,
    f.primary_method,
    f.status,
    f.is_active,
    f.start_period_code,
    f.end_period_code,
    COALESCE(SUM(CASE WHEN l.line_code = 'NPR' THEN l.baseline_amount END), 0.00) AS projected_12m_npr,
    COALESCE(SUM(CASE WHEN l.line_code = 'EBITDA' THEN l.baseline_amount END), 0.00) AS projected_12m_ebitda,
    COALESCE(SUM(CASE WHEN l.line_code = 'CASE_VOLUME' THEN l.baseline_amount END), 0.00) AS projected_12m_case_volume,
    COALESCE(SUM(CASE WHEN l.line_code = 'DIR_COSTS' THEN l.baseline_amount END), 0.00) AS projected_12m_direct_costs,
    COALESCE(AVG(p.confidence_score), 0.0000) AS avg_confidence_score,
    COUNT(DISTINCT p.period_code) AS horizon_period_count
FROM public.facility_rolling_forecasts f
JOIN public.rolling_forecast_periods p ON p.forecast_id = f.id
JOIN public.rolling_forecast_line_items l ON l.forecast_id = f.id AND l.period_code = p.period_code
GROUP BY f.facility_id, f.id, f.forecast_code, f.forecast_name, f.horizon_type, f.baseline_period_code, f.primary_method, f.status, f.is_active, f.start_period_code, f.end_period_code;
```

---

## Business Rules

### 1. Multi-Period Horizon Math
- The standard rolling forecast horizon spans exactly 12 forward-looking calendar months ($M_{+1}$ to $M_{+12}$).
- When an accounting period closes in Phase E0 Management P&L (e.g. October 2026), that period serves as the historical anchor $M_0$.
- The forecast spans from $M_{+1}$ (e.g. November 2026) to $M_{+12}$ (October 2027).

### 2. Deterministic Projection Method Invariants

#### A. Trailing 3-Month (T3M) Run-Rate
$$\text{Baseline Run-Rate}(L) = 0.50 \times A(M_{-1}, L) + 0.30 \times A(M_{-2}, L) + 0.20 \times A(M_{-3}, L)$$
Where $A(M, L)$ represents actual closed amount for statement line $L$ in month $M$.

#### B. Seasonal Indexing
Each calendar month is indexed based on historical ASC surgical patterns:
$$\text{Seasonal Amount}(M, L) = \text{Baseline Run-Rate}(L) \times S(M)$$
Standard ASC Seasonality Coefficients:
- Q1 (Jan: $0.88$, Feb: $0.92$, Mar: $0.96$) — Deductible resets, lower patient out-of-pocket elective scheduling.
- Q2 (Apr: $1.00$, May: $1.02$, Jun: $1.04$) — Peak spring elective orthopedic and spine volume.
- Q3 (Jul: $0.94$, Aug: $0.96$, Sep: $1.02$) — Physician summer vacation lull followed by September recovery.
- Q4 (Oct: $1.08$, Nov: $1.12$, Dec: $1.18$) — Year-end rush to meet annual deductibles and HSA spending deadlines.

#### C. Capacity-Constrained OR Scheduling Pipeline
- Physical OR Capacity Ceilings:
  $$\text{OR Operating Hours/Month} = \text{Operating Days} \times \text{OR Rooms} \times \text{Staffed Hours/Day} \times 60 \text{ min}$$
  For Naples Surgery Center (4 ORs, 21 days, 9 hours/day):
  $$\text{Total Available Minutes} = 21 \times 4 \times 9 \times 60 = 45,360 \text{ minutes}$$
- Target Utilization Rate: $78.0\%$ ($35,380$ surgical minutes utilized).
- Average Case Duration: $76.0$ minutes.
- Maximum Monthly Case Capacity: $\lfloor 35,380 / 76.0 \rfloor \approx 465$ cases.
- Invariant: No projected case volume may exceed physical capacity ($465$ cases/month) without flagging an operational constraint alert.

#### D. Blended Composite Ensemble
$$\text{Projected}(M, L) = 0.40 \times \text{Backlog}(M, L) + 0.35 \times \text{Seasonal}(M, L) + 0.25 \times \text{T3M}(M, L)$$

### 3. Financial Equation Invariants
Across every forecast period $M$ and scenario $S$:
1. $\text{Gross Revenue} = \text{OR Fees} + \text{Implant Charges} + \text{Supply Charges}$.
2. $\text{Net Patient Revenue (NPR)} = \text{Gross Revenue} - \text{Contractual Allowances} - \text{Bad Debt}$.
3. $\text{Direct Clinical Margin} = \text{NPR} - (\text{Implants} + \text{Supplies} + \text{Direct Labor})$.
4. $\text{EBITDA} = \text{Direct Clinical Margin} - \text{Variable Facility Costs} - \text{Fixed OPEX}$.
5. $\text{Net Operating Income (NOI)} = \text{EBITDA} - \text{Depreciation \& Amortization}$.

### 4. Multi-Scenario Invariants
For any period $M$:
$$\text{Conservative}(M, \text{NPR}) \le \text{Baseline}(M, \text{NPR}) \le \text{Optimistic}(M, \text{NPR})$$
$$\text{Conservative}(M, \text{EBITDA}) \le \text{Baseline}(M, \text{EBITDA}) \le \text{Optimistic}(M, \text{EBITDA})$$

### 5. Status Transitions & Immutability
- `DRAFT` $\to$ `UNDER_REVIEW` $\to$ `ACTIVE_PROJECTION` $\to$ `SUPERSEDED` $\to$ `ARCHIVED`.
- Only a user with the `CFO` or `ADMIN` role may transition a forecast to `ACTIVE_PROJECTION`.
- Activating a new forecast automatically supersedes the existing `ACTIVE_PROJECTION`.
- Stamped with an immutable SHA-256 seal across all periods and projected lines upon approval.

---

## Permissions / Security
- **Tenancy:** All queries, inserts, and mutations enforce strict `facility_id` tenant isolation.
- **RBAC Roles:**
  - `CFO`: Full view, scenario modeling, parameter override, and exclusive authority to approve `ACTIVE_PROJECTION`.
  - `FACILITY_ADMIN`: View forecast, run sensitivity simulations, export financial dossiers.
  - `CLINICAL_DIRECTOR`: View case volume projections and OR capacity utilization metrics.
  - `ANALYST` / `VIEWER`: Read-only access to published active projections.
- **AI Tool Contract:** AI agents querying projections operate under the active user's facility and role boundaries, with strict verification of frozen seals.

---

## API / Service Requirements

### Service Interface: `src/services/rollingForecastService.js`

```javascript
/**
 * Retrieves the currently active or specified rolling forecast for a facility.
 */
export function getFacilityRollingForecasts(facilityId);

/**
 * Retrieves full multi-period projection line items and quarterly rollups.
 */
export function getRollingForecastMatrix(facilityId, forecastId, scenario = 'BASELINE');

/**
 * Computes executive telemetry KPIs across the 12-month horizon.
 */
export function getRollingForecastTelemetry(facilityId, forecastId);

/**
 * Runs deterministic projection recalculations across multiple methodologies.
 */
export function calculateForecastMethodProjections(facilityId, methodCode, baselineData, horizonMonths = 12);

/**
 * Simulates multi-scenario sensitivity bounds (Baseline, Bull +8%, Bear -10%).
 */
export function simulateScenarioProjections(baselineProjections, scenarioType);

/**
 * Approves a rolling forecast, assigns ACTIVE_PROJECTION status, and computes SHA-256 seal.
 */
export function approveAndFreezeRollingForecast(forecastId, approvedBy);

/**
 * Dual-facade re-export in src/lib/rollingForecastService.js.
 */
```

---

## UI / Workflow Requirements

### 1. Executive Horizon Ribbon
- 5 high-impact cards spanning the 12-month forward horizon:
  1. **12-Month Projected NPR:** Total projected revenue with variance vs. annual budget.
  2. **12-Month Projected EBITDA:** Total projected operating profitability with EBITDA margin $\%$.
  3. **Projected Annual Case Volume:** Total surgical cases with average monthly run-rate.
  4. **OR Capacity Headroom:** Remaining unallocated surgical hours/minutes before physical ceiling.
  5. **Forecast Reliability Index:** Composite confidence metric based on horizon proximity and methodology weighting.

### 2. Method & Scenario Switcher Toolbar
- **Methodology Selector:** Blended Composite, Seasonal Indexing, T3M Run-Rate, Capacity Pipeline.
- **Scenario Toggle:** Baseline ($1.00\times$), Bull Case ($+8\%$ Vol / $+2\%$ Yield), Bear Case ($-10\%$ Vol / $-3\%$ Yield).
- **Horizon Range:** 12-Month Full View, Next 6 Months, Next Quarter (Q4 2026).

### 3. Trajectory Waterfall & Horizon Trend
- Visual financial trajectory showing actuals (Oct 2026) bridging into future monthly projections (Nov 2026 - Oct 2027).
- Shaded confidence bands illustrating Bull and Bear scenario envelopes.

### 4. Multi-Period Hierarchical Statement Table
- Horizontally scrollable table with sticky left column for Line Items and Account Categories.
- Columns for each projected month (Nov 2026 through Oct 2027), quarterly subtotals (Q4 2026, Q1 2027, Q2 2027, Q3 2027), and 12-Month Horizon Total.
- Expandable / collapsible sections:
  - Surgical Case Volume & OR Utilization
  - Gross Charges & Deductions (yielding Net Patient Revenue)
  - Direct Procedural Costs (Implants, Supplies, Labor yielding Clinical Margin)
  - Variable Facility Expenses & Fixed OPEX
  - Operating EBITDA & Net Operating Income

### 5. Method Parameter Tuning Drawer
- Slide-out drawer allowing CFOs to inspect historical weights, tweak seasonal multipliers, adjust target OR utilization, and save custom scenario models.

---

## Audit / Provenance
- All forecast creation, method adjustments, and scenario overrides retain user UUID, timestamp, before/after values, and methodology parameters.
- Freezing an `ACTIVE_PROJECTION` generates a tamper-evident SHA-256 seal:
  $$\text{Seal} = \text{SHA256}(\text{forecast\_id} \,\|\, \text{facility\_id} \,\|\, \text{start\_period} \,\|\, \text{end\_period} \,\|\, \text{total\_ebitda} \,\|\, \text{timestamp})$$

---

## QA / Test Cases (12 Core Tests)
1. **Telemetry Aggregation:** Verifies summary 12-month projected NPR, EBITDA, and case volume totals match underlying monthly sums.
2. **Facility UUID Resolution:** Verifies alias matching for Naples Surgery Center (`fac-naples-01`).
3. **T3M Run-Rate Math:** Proves weighted moving average ($50\% / 30\% / 20\%$) satisfies deterministic formula.
4. **Seasonal Indexing:** Verifies month-specific seasonal multipliers scale baseline run-rates accurately.
5. **Capacity Constraints:** Proves projected cases never exceed physical OR room and staffed hour ceilings.
6. **Accounting Invariants:** Verifies Gross-to-Net, Clinical Margin, and EBITDA equations balance across all 12 forecast periods.
7. **Scenario Monotonicity:** Verifies Conservative $\le$ Baseline $\le$ Optimistic across NPR and EBITDA lines.
8. **Dual Facade Parity:** Confirms identical function signatures between `src/services/` and `src/lib/`.
9. **Cryptographic Freeze Seal:** Validates SHA-256 seal generation and immutability upon approval.
10. **Migration 116 SQL Integrity:** Validates UP/DOWN migrations, tables, constraints, and RLS policies.
11. **Zero-Purple CSS Compliance:** Proves 0 occurrences of prohibited color tokens in styles and JSX.
12. **App Shell Integration:** Verifies navigation routing, tab state, and icon integration in `src/App.jsx`.

---

## Acceptance Criteria
- Production build passes cleanly (`npm run build`).
- Unit and integration test suite passes 100% (`node --test tests/rolling-forecast.test.js`).
- Strict zero-purple ban enforced across all files.
- Facility tenant isolation verified in database schema and services.
- Projections reflect deterministic mathematical equations without mock/placeholder artifacts.

---

## Dependencies
- Upstream: Phase E0 Management P&L (`management_pnl_statement_lines`), Phase E1 Budget vs. Actual (`facility_budgets`), Phase 71 Case Financial Ledger, Phase 72 Cost Model.
- Downstream: Phase E3 13-Week Cash Forecast, Phase E4 Break-Even Analysis, Phase E6 Board Reporting.

---

## Definition of Done
A feature is not complete because a screen exists. It is complete only when the data model, deterministic logic, permissions, validation, auditability, tests, UI states, documentation, and acceptance criteria are complete.

---

## Implementation Notes
- **Branch:** `feature/phase-e2-rolling-forecast`
- **Migration:** `supabase/migrations/116_rolling_forecast.sql` and `116_rolling_forecast_down.sql`
- **Services:** `src/services/rollingForecastService.js` and `src/lib/rollingForecastService.js`
- **Components:** `src/components/RollingForecastView.jsx` and `src/components/RollingForecastView.css`
- **Shell:** `src/App.jsx`
- **Tests:** `tests/rolling-forecast.test.js`
