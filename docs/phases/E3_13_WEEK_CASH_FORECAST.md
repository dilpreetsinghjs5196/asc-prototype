# E3 13-WEEK CASH FORECAST & LIQUIDITY MANAGEMENT ENGINE

## Purpose
The 13-Week Cash Forecast (13WCF) and Liquidity Management engine provides an auditable, week-by-week direct cash flow projection model tailored specifically for Ambulatory Surgery Centers (ASCs). While the Management P&L (Phase E0) measures accrual accounting profitability and the Rolling Forecast (Phase E2) projects multi-month operational volumes, the 13-Week Cash Forecast governs **actual treasury liquidity, operating cash balances, debt service coverage, and working capital runway**.

In outpatient surgical facilities, cash flow timing is characterized by pronounced structural asymmetries:
- **Receipts Asymmetry:** Cash collections from commercial payers and Medicare lag behind surgical dates by 28 to 45 Days Sales Outstanding (DSO) based on claim adjudication velocity and clearinghouse turnaround.
- **Disbursements Asymmetry:** Cash outflows are lumpy and non-negotiable—bi-weekly clinical payroll (scrub nurses, circulating RNs, surgical techs) spikes every other week, facility leases and rent are due on the 1st of each month, and surgical implant vendor invoices (orthopedic implants, spinal cages, intraocular lenses) require strict Net 30/Net 60 payment terms to maintain vendor supply lines.

This specification establishes an authoritative weekly direct cash model, deterministic collections timing curves, bi-weekly payroll scheduling, minimum cash covenant monitoring, revolving line of credit (LOC) drawdown tracking, and cryptographic forecast freeze seals.

---

## Scope
- **Production Requirements:** Continuous 13-week rolling cash model lifecycle (`DRAFT`, `UNDER_REVIEW`, `ACTIVE_FORECAST`, `SUPERSEDED`, `ARCHIVED`), weekly receipts categorization (Commercial 835, Medicare/Medicaid EFT, Point-of-Service copays), weekly disbursements categorization (Bi-weekly payroll, Vendor AP, Facility Rent, Debt Service, Tax/Distributions), minimum covenant threshold monitoring ($400,000 threshold), and SHA-256 digital seals.
- **ASCANALYST Compatibility:** Seamless integration with Phase E0 Management P&L (`management_pnl_statement_lines`), Phase E1 Budget vs. Actual (`budget_variance_analyses`), Phase E2 Rolling Forecast (`rolling_forecast_line_items`), Phase 80 Claims & Remittance Advice (`edi_835_remittance`), and Accounts Payable ledgers.
- **Deterministic Financial Logic:** Hard mathematical roll-forward invariants ($\text{Beginning Cash}_{w+1} = \text{Ending Cash}_w$), DSO collections aging decay functions, and bi-weekly payroll alternation.
- **Tenancy & RBAC:** Enforced facility isolation with Naples Surgery Center (`fac-naples-01` / `00000000-0000-0000-0000-000000000002`) compatibility, CFO-exclusive liquidity approval, and audit logging.

---

## Current State
An audit of existing repository assets and database models reveals the following component classifications:

| Component | Status | Classification | Current Behavior & Gap Analysis |
|:---|:---|:---|:---|
| `public.management_pnl_statement_lines` (Migration 114) | Active | **KEEP** | Closed-period accrual revenue and expenses. Provides authoritative historical baseline for collection and expense run-rates. |
| `public.rolling_forecast_line_items` (Migration 116) | Active | **KEEP** | 12-month forward surgical case volumes and gross-to-net projections that feed near-term weekly billing assumptions. |
| `public.facility_budgets` (Migration 115) | Active | **KEEP** | Annual approved expenditure baselines and benchmarks. |
| `public.case_financial_ledger_entries` (Migration 047) | Active | **KEEP** | Posted case-level charges and patient balances. |
| Static Spreadsheets & Manual Treasury Worksheets | Legacy | **REPLACE** | Disconnected manual Excel cash sheets with broken cell links, no automated bank balance sync, zero DSO decay math, and no audit trail. |
| 13-Week Cash Forecast Master Schema | Missing | **MISSING** | No database tables tracking 13-week forecast plans, starting cash balances, minimum covenant thresholds, or CFO approval status. |
| Sequential Weekly Cash Ledger Matrix | Missing | **MISSING** | No normalized storage for 13 weekly intervals, receipts by source, scheduled disbursements, and running cash balances. |
| Deterministic Cash Roll-Forward Engine | Missing | **MISSING** | No automated mathematical validation ensuring week-over-week cash continuity ($\text{Ending Cash}_w = \text{Beginning Cash}_{w+1}$). |
| Liquidity Covenant & Headroom Alerts | Missing | **MISSING** | No automated early warning triggers when projected cash balances breach minimum debt covenants or operational safety buffers. |

---

## Target State
The target state delivers an enterprise-grade CFO 13-Week Cash Forecast & Treasury Liquidity suite:
1. **Continuous 13-Week Rolling Cash Matrix:**
   - Formal forecast records (`facility_cash_forecasts`) spanning an unbroken 13-week forward horizon (Weeks W1 through W13, e.g. November 3, 2026 through January 31, 2027).
   - Strict week-over-week continuity: ending cash of Week $w$ is deterministically locked as the beginning cash of Week $w+1$.
   - Tamper-evident SHA-256 cryptographic seal stamped upon CFO approval.
2. **Deterministic Cash Inflow Modeling (Receipts):**
   - **Commercial Payer Collections (835 ERA Deposits):** Modelled via collection decay curves based on 32-day average DSO:
     $$\text{Receipts}_w = 0.15 \times \text{Charges}_{w} + 0.45 \times \text{Charges}_{w-2} + 0.25 \times \text{Charges}_{w-4} + 0.15 \times \text{Charges}_{w-6}$$
   - **Government Collections (Medicare/Medicaid EFT):** Deterministic 14-day turnaround matching statutory clean claim cycles.
   - **Point-of-Service (POS) Collections:** Real-time patient copays, deductibles, and co-insurance collected on the day of surgery.
   - **Secondary & Patient AR Collections:** Timed payments from patient payment portals and secondary commercial payers.
3. **Deterministic Cash Outflow Modeling (Disbursements):**
   - **Bi-Weekly Clinical Payroll:** Alternating week disbursement cadence (Weeks W2, W4, W6, W8, W10, W12) reflecting actual ASC payroll dates.
   - **Surgical Implant Vendor AP:** Payments scheduled strictly to vendor Net 30/Net 60 due dates to optimize discounts and maintain supplier credit.
   - **Facility Lease & Fixed Rent:** Lump-sum payment on the 1st week of each calendar month (Weeks W1, W5, W9, W13).
   - **Equipment Lease & Maintenance:** Fixed monthly service contracts for C-arms, autoclaves, and surgical scopes.
   - **Debt Service Amortization:** Scheduled monthly bank principal and interest payments.
4. **Liquidity Covenant & Risk Governance:**
   - **Minimum Operating Cash Covenant:** Configurable threshold (e.g. $\$400,000$ minimum cash balance).
   - **Covenant Headroom:** Real-time monitoring of $\text{Headroom}_w = \text{Ending Cash}_w - \text{Covenant Minimum}$.
   - **Automated Alerts:** Flags `LIQUIDITY_SURPLUS` ($\text{Headroom} > \$300\text{k}$), `NORMAL` ($\$100\text{k} \le \text{Headroom} \le \$300\text{k}$), `WARNING` ($\$0 \le \text{Headroom} < \$100\text{k}$), or `CRITICAL_DEFICIT` ($\text{Headroom} < 0$).
5. **Interactive CFO Analytics UI & Dark Mode:**
   - Built under the Maestro Clinical Design System (Emerald, Sky, Amber, Crimson, Slate) with strict zero-purple token compliance.
   - Executive Liquidity Ribbon: 5 key telemetry cards (Starting Operating Cash, 13-Week Ending Cash, Net Cash Burn/Build, Minimum Covenant Headroom, Lowest Projected Cash Week).
   - Dynamic Cash Runway & Balance Trajectory Chart: visual weekly inflows, outflows, and running cash balance line relative to covenant floor.
   - Expandable 13-Week Direct Statement Table: line items, weekly values, quarterly totals, and burn/build summaries.
   - Covenant & LOC Drawdown Drawer: interactive simulation of revolver borrowings and vendor payment term shifts.

---

## Data Model / Schema

### 1. `public.facility_cash_forecasts`
Stores 13-week cash forecast plans, version lineages, starting cash balances, covenant thresholds, and cryptographic seals.
```sql
CREATE TABLE IF NOT EXISTS public.facility_cash_forecasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    forecast_code VARCHAR(32) NOT NULL, -- e.g. 'CF2026_Q4_13W', 'CF2027_Q1_13W'
    forecast_name VARCHAR(128) NOT NULL, -- e.g. 'Q4 2026 13-Week Rolling Cash Forecast'
    baseline_date DATE NOT NULL,         -- e.g. '2026-11-02'
    start_week_date DATE NOT NULL,       -- Monday of Week 1
    end_week_date DATE NOT NULL,         -- Sunday of Week 13
    version_number INT NOT NULL DEFAULT 1,
    status VARCHAR(24) NOT NULL DEFAULT 'DRAFT' CHECK (
        status IN ('DRAFT', 'UNDER_REVIEW', 'ACTIVE_FORECAST', 'SUPERSEDED', 'ARCHIVED')
    ),
    starting_cash_balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    minimum_cash_covenant NUMERIC(14, 2) NOT NULL DEFAULT 400000.00,
    line_of_credit_limit NUMERIC(14, 2) NOT NULL DEFAULT 1000000.00,
    line_of_credit_drawn NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT false,
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES auth.users(id),
    frozen_hash VARCHAR(64),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_cash_forecast_code UNIQUE (facility_id, forecast_code)
);

CREATE INDEX IF NOT EXISTS idx_facility_cash_forecasts ON public.facility_cash_forecasts(facility_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_forecasts_status ON public.facility_cash_forecasts(status);
```

### 2. `public.cash_forecast_weeks`
Defines the 13 sequential weekly intervals, tracking calendar dates, payroll flags, rent flags, and confidence scores.
```sql
CREATE TABLE IF NOT EXISTS public.cash_forecast_weeks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    forecast_id UUID NOT NULL REFERENCES public.facility_cash_forecasts(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    week_number INT NOT NULL CHECK (week_number BETWEEN 1 AND 13),
    week_code VARCHAR(16) NOT NULL, -- e.g. 'W01', 'W02' ... 'W13'
    week_label VARCHAR(64) NOT NULL, -- e.g. 'Week 1 (Nov 03 - Nov 09)'
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_payroll_week BOOLEAN NOT NULL DEFAULT false,
    is_rent_week BOOLEAN NOT NULL DEFAULT false,
    is_debt_service_week BOOLEAN NOT NULL DEFAULT false,
    confidence_score NUMERIC(5, 4) NOT NULL DEFAULT 0.9500,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_forecast_week UNIQUE (forecast_id, week_number)
);

CREATE INDEX IF NOT EXISTS idx_cash_weeks_forecast ON public.cash_forecast_weeks(forecast_id, week_number);
```

### 3. `public.cash_forecast_line_items`
Stores line-item cash inflows (receipts), outflows (disbursements), and financing movements across all 13 weeks.
```sql
CREATE TABLE IF NOT EXISTS public.cash_forecast_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    forecast_id UUID NOT NULL REFERENCES public.facility_cash_forecasts(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    week_number INT NOT NULL CHECK (week_number BETWEEN 1 AND 13),
    line_code VARCHAR(32) NOT NULL, -- e.g. 'REC_COMMERCIAL', 'DISB_PAYROLL', 'ENDING_CASH'
    line_name VARCHAR(128) NOT NULL,
    flow_type VARCHAR(24) NOT NULL CHECK (flow_type IN ('RECEIPT', 'DISBURSEMENT', 'FINANCING', 'BALANCE')),
    category VARCHAR(32) NOT NULL,
    projected_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    actual_amount NUMERIC(14, 2),
    variance_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_forecast_week_line UNIQUE (forecast_id, week_number, line_code)
);

CREATE INDEX IF NOT EXISTS idx_cf_lines_forecast ON public.cash_forecast_line_items(forecast_id, week_number);
CREATE INDEX IF NOT EXISTS idx_cf_lines_code ON public.cash_forecast_line_items(line_code);
```

### 4. Telemetry View: `public.vw_cash_forecast_telemetry`
Aggregates summary 13-week cash metrics, net burn/build, lowest cash week, and covenant headroom.
```sql
CREATE OR REPLACE VIEW public.vw_cash_forecast_telemetry AS
SELECT
    f.facility_id,
    f.id AS forecast_id,
    f.forecast_code,
    f.forecast_name,
    f.status,
    f.is_active,
    f.starting_cash_balance,
    f.minimum_cash_covenant,
    f.line_of_credit_limit,
    f.line_of_credit_drawn,
    COALESCE(SUM(CASE WHEN l.flow_type = 'RECEIPT' THEN l.projected_amount END), 0.00) AS total_13w_receipts,
    COALESCE(SUM(CASE WHEN l.flow_type = 'DISBURSEMENT' THEN l.projected_amount END), 0.00) AS total_13w_disbursements,
    COALESCE(SUM(CASE WHEN l.flow_type = 'RECEIPT' THEN l.projected_amount END), 0.00) -
    COALESCE(SUM(CASE WHEN l.flow_type = 'DISBURSEMENT' THEN l.projected_amount END), 0.00) AS net_13w_cash_flow,
    COALESCE(MAX(CASE WHEN l.line_code = 'ENDING_CASH' AND l.week_number = 13 THEN l.projected_amount END), 0.00) AS projected_ending_cash,
    COALESCE(MIN(CASE WHEN l.line_code = 'ENDING_CASH' THEN l.projected_amount END), 0.00) AS lowest_projected_cash,
    COALESCE(MIN(CASE WHEN l.line_code = 'ENDING_CASH' THEN l.projected_amount END), 0.00) - f.minimum_cash_covenant AS minimum_covenant_headroom
FROM public.facility_cash_forecasts f
LEFT JOIN public.cash_forecast_line_items l ON l.forecast_id = f.id
GROUP BY f.facility_id, f.id, f.forecast_code, f.forecast_name, f.status, f.is_active, f.starting_cash_balance, f.minimum_cash_covenant, f.line_of_credit_limit, f.line_of_credit_drawn;
```

---

## Business Rules

### 1. Deterministic Cash Roll-Forward Equation
Across all weeks $w \in [1, 13]$:
1. $\text{Total Receipts}_w = \sum \text{Receipts}_w$.
2. $\text{Total Disbursements}_w = \sum \text{Disbursements}_w$.
3. $\text{Net Cash Flow}_w = \text{Total Receipts}_w - \text{Total Disbursements}_w + \text{Net Financing}_w$.
4. $\text{Ending Cash}_w = \text{Beginning Cash}_w + \text{Net Cash Flow}_w$.
5. **Continuous Continuity Invariant:**
   $$\text{Beginning Cash}_{w+1} = \text{Ending Cash}_w \quad (\forall w \in [1, 12])$$

### 2. Receipts Timing & Collection Decay Curve
Outpatient surgical billing collections follow empirical aging lag distributions:
- Week $w$ (Current POS Copays & Self-Pay): $15\%$ of week collections.
- Week $w+2$ (Clean Medicare & Rapid Payer EFT): $45\%$ of week collections.
- Week $w+4$ (Commercial In-Network Adjudications): $25\%$ of week collections.
- Week $w+6$ to $w+8$ (Out-of-Network & Secondary Commercial): $15\%$ of week collections.

### 3. Disbursements Cadence
- **Bi-Weekly Clinical Payroll:** Disbursed strictly on even weeks ($W2, W4, W6, W8, W10, W12$). Baseline: $\approx \$120,000$ per pay period.
- **Facility Lease / Rent:** Disbursed on the 1st week of each month ($W1, W5, W9, W13$). Baseline: $\$45,000$ per month.
- **Surgical Implants & Supplies (Vendor AP):** Disbursed weekly based on Net 30/Net 60 payment terms ($\approx \$65,000 - \$85,000$/week).
- **Equipment Leases & IT Software:** Disbursed monthly in $W1, W5, W9, W13$ ($\approx \$18,000$/month).
- **Debt Service:** Principal and interest amortization disbursed in $W2, W6, W10$ ($\approx \$25,000$/month).

### 4. Liquidity Covenant & Headroom Invariants
- Let $C_{\min}$ be the Minimum Operating Cash Covenant ($\$400,000$).
- For each week $w$, calculate Headroom $H_w = \text{Ending Cash}_w - C_{\min}$.
- **Severity Classification:**
  - $H_w \ge \$300,000 \implies$ `LIQUIDITY_SURPLUS` (Safe for partner equity distribution).
  - $\$100,000 \le H_w < \$300,000 \implies$ `NORMAL` (Adequate operating cushion).
  - $\$0 \le H_w < \$100,000 \implies$ `WARNING` (CFO alert; defer discretionary CapEx).
  - $H_w < \$0 \implies$ `CRITICAL_DEFICIT` (Covenant breach; trigger line of credit draw).

### 5. Status Transitions & Immutability
- `DRAFT` $\to$ `UNDER_REVIEW` $\to$ `ACTIVE_FORECAST` $\to$ `SUPERSEDED` $\to$ `ARCHIVED`.
- Only users with `CFO` or `ADMIN` roles may approve an `ACTIVE_FORECAST`.
- Stamped with an immutable SHA-256 seal across all 13 weekly balances upon approval.

---

## Permissions / Security
- **Tenancy:** All queries, mutations, and views enforce strict `facility_id` tenant isolation.
- **RBAC Roles:**
  - `CFO`: Full view, adjust receipts timing, authorize line of credit drawdowns, approve `ACTIVE_FORECAST`.
  - `FACILITY_ADMIN`: View cash runway, review vendor AP schedules, export cash dossiers.
  - `BUSINESS_OFFICE_MANAGER`: Input POS collections and billing deposit actuals.
  - `VIEWER` / `ANALYST`: Read-only access to published cash forecasts.
- **AI Tool Contract:** AI agents querying liquidity data operate under the active user's facility tenancy and role boundaries.

---

## API / Service Requirements

### Service Interface: `src/services/cashForecastService.js`

```javascript
/**
 * Retrieves the currently active or specified 13-week cash forecast for a facility.
 */
export function getFacilityCashForecasts(facilityId);

/**
 * Retrieves the full 13-week matrix of receipts, disbursements, and weekly cash balances.
 */
export function getCashForecastMatrix(facilityId, forecastId, scenario = 'BASELINE');

/**
 * Computes executive liquidity telemetry KPIs for the ribbon display.
 */
export function getCashForecastTelemetry(facilityId, forecastId, scenario = 'BASELINE');

/**
 * Simulates collections acceleration or deceleration scenarios (Prompt Pay, Slow Collections).
 */
export function simulateCashScenario(baselineForecast, scenarioType);

/**
 * Approves a cash forecast, marks it ACTIVE_FORECAST, and computes SHA-256 seal.
 */
export function approveAndFreezeCashForecast(forecastId, approvedBy);

/**
 * Dual-facade re-export in src/lib/cashForecastService.js.
 */
```

---

## UI / Workflow Requirements

### 1. Executive Liquidity Ribbon
- 5 high-impact cards spanning the 13-week horizon:
  1. **Starting Operating Cash:** Verified bank balance at the start of Week 1 ($1,250,000).
  2. **13-Week Ending Projected Cash:** Projected balance at the end of Week 13 ($1,546,000).
  3. **Net Cash Build / Burn:** Total receipts minus disbursements (+$296,000 Build).
  4. **Minimum Covenant Headroom:** Buffer above the $400,000 debt covenant (+$785,000 headroom at trough).
  5. **Lowest Projected Cash Week:** Week number and cash balance at the lowest liquidity trough (Week 4: $1,185,000).

### 2. Interactive Weekly Cash Runway Trajectory
- Visual chart showing weekly cash receipts (green bars) vs. cash disbursements (crimson bars) overlaid with the running ending cash balance line (sky blue) and the red horizontal dashed covenant floor ($400,000).

### 3. Comprehensive 13-Week Direct Statement Table
- Horizontally scrollable table with sticky left column for Line Items and Flow Categories.
- Columns for each of the 13 weeks (W01 to W13) plus a 13-Week Total column.
- Expandable / collapsible sections:
  - **Beginning Cash Balance**
  - **Operating Cash Receipts** (Commercial Payers, Medicare/Medicaid EFT, Point-of-Service, Patient AR)
  - **Operating Cash Disbursements** (Clinical Payroll, Implant AP, Supply AP, Facility Rent, Utilities/IT, Debt Service)
  - **Net Operating Cash Flow** (Burn / Build)
  - **Financing & Revolver Activity** (LOC Drawdowns, LOC Repayments)
  - **Ending Cash Balance**
  - **Covenant Headroom & Status Badge**

### 4. Scenario Switcher & Liquidity Tuning Drawer
- Scenario toggles:
  - **Baseline:** Standard 32-day DSO collections and regular AP payment terms.
  - **Conservative (Slow Collections):** +7 days DSO delay; tests liquidity buffer under payer payment slowdowns.
  - **Favorable (Prompt Pay Acceleration):** -5 days DSO acceleration; tests surplus cash available for partner equity distributions.
- Slide-out drawer to adjust minimum covenant threshold ($400k default) or model line of credit borrowings.

---

## Audit / Provenance
- All modifications to collections assumptions, vendor AP schedules, or starting cash retain user UUID, timestamp, and before/after values.
- Freezing an `ACTIVE_FORECAST` generates a tamper-evident SHA-256 seal:
  $$\text{Seal} = \text{SHA256}(\text{forecast\_id} \,\|\, \text{facility\_id} \,\|\, \text{start\_date} \,\|\, \text{end\_date} \,\|\, \text{ending\_cash} \,\|\, \text{timestamp})$$

---

## QA / Test Cases (12 Core Tests)
1. **Telemetry Aggregation:** Verifies starting cash, ending cash, total receipts, total disbursements, and net cash build/burn match underlying weekly sums.
2. **Facility UUID Resolution:** Verifies alias matching for Naples Surgery Center (`fac-naples-01`).
3. **Continuous Roll-Forward Invariant:** Proves $\text{Beginning Cash}_{w+1} = \text{Ending Cash}_w$ across all 12 transitions.
4. **Bi-Weekly Payroll Alternation:** Proves clinical payroll disbursements occur strictly on alternating even weeks (W2, W4, W6, W8, W10, W12).
5. **Monthly Rent Timing:** Proves facility lease payments occur strictly on the first week of each month (W1, W5, W9, W13).
6. **Minimum Covenant Headroom:** Proves covenant headroom calculation ($H_w = \text{Ending Cash}_w - C_{\min}$) and alert triggers.
7. **Scenario Sensitivity:** Proves Slow Collections scenario yields lower ending cash than Baseline, and Prompt Pay yields higher ending cash.
8. **Dual Facade Parity:** Confirms identical function signatures between `src/services/` and `src/lib/`.
9. **Cryptographic Freeze Seal:** Validates SHA-256 seal generation and immutability upon approval.
10. **Migration 117 SQL Integrity:** Validates UP/DOWN migrations, tables, constraints, and RLS policies.
11. **Strict Zero-Purple CSS Compliance:** Proves 0 occurrences of prohibited color tokens in styles and JSX.
12. **App Shell Integration:** Verifies navigation routing, tab state, and icon integration in `src/App.jsx`.

---

## Acceptance Criteria
- Production build passes cleanly (`npm run build`).
- Unit and integration test suite passes 100% (`node --test tests/cash-forecast.test.js`).
- Strict zero-purple ban enforced across all files.
- Facility tenant isolation verified in database schema and services.
- Projections reflect deterministic cash flow mathematics without mock/placeholder artifacts.

---

## Dependencies
- Upstream: Phase E0 Management P&L (`management_pnl_statement_lines`), Phase E1 Budget vs. Actual (`facility_budgets`), Phase E2 Rolling Forecast (`facility_rolling_forecasts`), Phase 80 Claims & Remittance.
- Downstream: Phase E4 Break-Even Analysis, Phase E6 Board Reporting, Phase E7 ROI & Value Report.

---

## Definition of Done
A feature is not complete because a screen exists. It is complete only when the data model, deterministic logic, permissions, validation, auditability, tests, UI states, documentation, and acceptance criteria are complete.

---

## Implementation Notes
- **Branch:** `feature/phase-e3-13-week-cash-forecast`
- **Migration:** `supabase/migrations/117_13_week_cash_forecast.sql` and `117_13_week_cash_forecast_down.sql`
- **Services:** `src/services/cashForecastService.js` and `src/lib/cashForecastService.js`
- **Components:** `src/components/CashForecastView.jsx` and `src/components/CashForecastView.css`
- **Shell:** `src/App.jsx`
- **Tests:** `tests/cash-forecast.test.js`
