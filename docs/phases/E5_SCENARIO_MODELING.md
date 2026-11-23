# E5 SCENARIO MODELING & WHAT-IF STRESS TESTING

## Purpose
The Scenario Modeling and What-If Stress Testing engine establishes an auditable, deterministic simulation framework for Ambulatory Surgery Center (ASC) executive leadership and CFOs. Outpatient surgical facilities operate under intense operational sensitivity: single-digit percentage shifts in commercial payer allowable rates, surgeon recruitment or departure, orthopedic and spine implant price increases, or clinical nursing wage inflation directly affect operating EBITDA, debt covenants, and cash runway.

This module defines deterministic mathematical models to project multi-variable operational scenarios, evaluate strategic growth initiatives (e.g., surgeon onboarding, new surgical service lines), model payer reimbursement rate reductions or contract fee schedule changes, stress-test cost inflation shocks, and validate Operating Room (OR) capacity and block utilization constraints.

---

## Scope
- **Production Requirements:** Multi-scenario management (`DRAFT`, `SIMULATED`, `BOARD_REVIEW`, `APPROVED_STRATEGY`, `SUPERSEDED`, `ARCHIVED`), multi-lever simulation (Volume, Payer Rate, Implants, Supplies, Labor Wages, Fixed Overhead), comparative variance analysis against baseline P&L actuals, OR room-hour capacity constraint validation, and side-by-side multi-scenario decision matrix.
- **ASCANALYST Compatibility:** Native integration with Phase E0 Management P&L (`management_pnl_statement_lines`), Phase E1 Budget vs. Actual (`budget_variance_analyses`), Phase E2 Rolling Forecast (`rolling_forecast_line_items`), Phase E3 13-Week Cash Forecast (`facility_cash_forecasts`), Phase E4 Break-Even Analysis (`facility_break_even_models`), and Phase 60 OR Scheduling (`operating_room_models`).
- **Deterministic Billing & Financial Logic:** Hard mathematical invariants governing Net Patient Revenue ($\Delta \text{NPR} = \sum (Q_s \times R_s) - \text{Baseline NPR}$), Direct Clinical Costs ($\Delta \text{DCC} = \sum (Q_s \times VC_s) - \text{Baseline DCC}$), Operating EBITDA ($\Delta \text{EBITDA} = \Delta \text{CM} - \Delta FC$), and OR Capacity Utilization ($\text{Util} = \sum (Q_s \times D_s) / \text{Max Available OR Minutes}$).
- **Tenancy & RBAC:** Enforced facility isolation with Naples Surgery Center (`fac-naples-01` / `00000000-0000-0000-0000-000000000002`) compatibility, CFO-exclusive strategy approval, and cryptographic SHA-256 digital seals.

---

## Current State
An audit of existing repository assets and database models reveals the following component classifications:

| Component | Status | Classification | Current Behavior & Gap Analysis |
|:---|:---|:---|:---|
| `public.management_pnl_statement_lines` (Migration 114) | Active | **KEEP** | Closed-period financial baseline (October 2026: 240 cases, $1,150,000 NPR, $670,000 Direct Costs, $240,000 Fixed Costs, $240,000 EBITDA). |
| `public.facility_break_even_models` (Migration 118) | Active | **KEEP** | Provides base unit contribution margin ($2,000/case) and break-even thresholds (120 cases). |
| `public.operating_room_models` (Migration 060) | Active | **KEEP** | OR suite room configurations, available staffing hours, and baseline turnover metrics. |
| Ad-hoc Offline Spreadsheet Simulations | Legacy | **REPLACE** | Disconnected manual Excel sheets lacking version control, audit trails, and multi-tenancy. Prone to cell formula errors and disconnected from actual closed-period general ledgers. |
| Scenario Model Master Schema | Missing | **MISSING** | No database tables tracking scenario definitions, parameter levers, version lineages, or CFO approval status. |
| Specialty Scenario Impact Schema | Missing | **MISSING** | No normalized storage for specialty-level case volume shifts, procedural duration demands, and specialty unit economics. |
| Deterministic Scenario Simulation Engine | Missing | **MISSING** | No automated mathematical service computing multi-lever scenario impacts across revenue, cost, margin, EBITDA, and OR capacity. |
| Side-by-Side Comparative Scenario Matrix | Missing | **MISSING** | No executive interface allowing side-by-side comparison of baseline against expansion, payer cuts, cost inflation, and conservative stress tests. |

---

## Target State
The target state delivers an enterprise-grade CFO Scenario Modeling & What-If Stress Testing suite:
1. **Authoritative Operational Baseline (October 2026 Close):**
   - **Monthly Surgical Volume:** 240 cases across 21 operating days (4 ORs).
   - **Net Patient Revenue (NPR):** $\$1,150,000.00$ ($\$4,791.67$ average net collections per case).
   - **Direct Clinical Costs:** $\$670,000.00$ ($\$2,791.67$ variable cost per case: Implants $\$345\text{k}$, Supplies $\$155\text{k}$, Direct Scrub/Circulating Labor $\$170\text{k}$).
   - **Direct Clinical Contribution Margin:** $\$480,000.00$ ($41.74\%$ of NPR; $\$2,000.00$ unit CM).
   - **Fixed Operating Overhead:** $\$240,000.00$/month.
   - **Operating EBITDA:** $\$240,000.00$ ($20.87\%$ EBITDA Margin).
   - **OR Capacity Utilization:** $18,240$ surgical minutes used out of $40,320$ available minutes ($45.24\%$ utilization across 4 ORs at 8 hrs/day).
2. **Standard Pre-Packaged Strategic Scenarios:**
   - **Scenario 1: Baseline Operating Model (`SCEN_BASE_2026`)** - Unchanged operating posture.
   - **Scenario 2: Total Joint & Spine Expansion (`SCEN_ORTHO_EXP`)** - Recruiting 2 high-volume surgeons; +20 Orthopedic joint cases, +10 Spine cases; +3,150 OR minutes; +$262k NPR; +$111k EBITDA.
   - **Scenario 3: Commercial Payer Rate Compression (`SCEN_PAYER_CUT`)** - Payer contract negotiation scenario: -4.0% across commercial fee schedules; -$46k NPR; -$46k EBITDA (EBITDA drops to $194k, margin drops to 17.6%).
   - **Scenario 4: Supply Chain & Implant Inflation (`SCEN_INFLATION`)** - +7.0% implant costs, +5.0% surgical supplies; +$31.9k direct costs; -$31.9k EBITDA.
   - **Scenario 5: Multi-Factor Conservative Stress Test (`SCEN_STRESS_TEST`)** - -10.0% surgical volume, -2.5% payer yield, +6.0% supply inflation, +4.0% clinical labor wage increases; EBITDA compressed to $118.5k (down -50.6%).
3. **Deterministic Mathematical Formulas:**
   - **Adjusted Specialty Net Revenue:**
     $$R_{s,\text{adj}} = R_{s,\text{base}} \times \left(1 + \frac{\Delta R_{\text{payer}}}{100}\right)$$
   - **Adjusted Specialty Variable Cost:**
     $$VC_{s,\text{adj}} = \left(C_{\text{imp}} \times (1 + \Delta_{\text{imp}})\right) + \left(C_{\text{sup}} \times (1 + \Delta_{\text{sup}})\right) + \left(C_{\text{lab}} \times (1 + \Delta_{\text{lab}})\right)$$
   - **Scenario Contribution Margin:**
     $$\text{CM}_{\text{scen}} = \sum_{s} \left(Q_{s,\text{scen}} \times (R_{s,\text{adj}} - VC_{s,\text{adj}})\right)$$
   - **Scenario Operating EBITDA:**
     $$\text{EBITDA}_{\text{scen}} = \text{CM}_{\text{scen}} - (FC_{\text{base}} + \Delta FC)$$
   - **OR Capacity Feasibility Check:**
     $$\text{OR Minutes Required} = \sum_{s} \left(Q_{s,\text{scen}} \times (\text{Duration}_s + \text{Turnover})\right)$$
     $$\text{Capacity Utilization \%} = \frac{\text{OR Minutes Required}}{40,320 \text{ minutes}} \times 100$$
     $$\text{Status} = \begin{cases} \text{Optimal} & \text{if Util} \le 75\% \\ \text{Near Capacity} & \text{if } 75\% < \text{Util} \le 85\% \\ \text{Constrained / Overtime Required} & \text{if Util} > 85\% \end{cases}$$
4. **Governance & Immutability:**
   - Board Review and CFO approval workflow.
   - SHA-256 digital freeze seal computing hash across all scenario parameters and outputs.

---

## Data Model / Schema

### 1. `public.facility_scenarios`
Stores scenario definitions, parameter inputs, projected financial outputs, and cryptographic seals.
```sql
CREATE TABLE IF NOT EXISTS public.facility_scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    scenario_code VARCHAR(32) NOT NULL, -- e.g. 'SCEN_2026_BASE', 'SCEN_ORTHO_EXP'
    scenario_name VARCHAR(128) NOT NULL,
    scenario_type VARCHAR(32) NOT NULL DEFAULT 'WHAT_IF' CHECK (
        scenario_type IN ('BASELINE', 'EXPANSION', 'PAYER_RENEGOTIATION', 'COST_INFLATION', 'RECESSION_STRESS', 'WHAT_IF')
    ),
    status VARCHAR(24) NOT NULL DEFAULT 'DRAFT' CHECK (
        status IN ('DRAFT', 'SIMULATED', 'BOARD_REVIEW', 'APPROVED_STRATEGY', 'SUPERSEDED', 'ARCHIVED')
    ),
    baseline_period_code VARCHAR(16) NOT NULL DEFAULT '2026-M10',
    version_number INT NOT NULL DEFAULT 1,
    
    -- Parameter Levers
    case_volume_delta_percent NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    reimbursement_rate_delta_percent NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    implant_cost_inflation_percent NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    supply_cost_inflation_percent NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    labor_wage_inflation_percent NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    fixed_overhead_delta NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    
    -- Calculated Outputs
    projected_cases INT NOT NULL DEFAULT 240,
    projected_npr NUMERIC(14, 2) NOT NULL DEFAULT 1150000.00,
    projected_direct_costs NUMERIC(14, 2) NOT NULL DEFAULT 670000.00,
    projected_contribution_margin NUMERIC(14, 2) NOT NULL DEFAULT 480000.00,
    projected_fixed_overhead NUMERIC(14, 2) NOT NULL DEFAULT 240000.00,
    projected_ebitda NUMERIC(14, 2) NOT NULL DEFAULT 240000.00,
    projected_ebitda_margin_percent NUMERIC(6, 2) NOT NULL DEFAULT 20.87,
    projected_break_even_cases INT NOT NULL DEFAULT 120,
    projected_margin_of_safety_cases INT NOT NULL DEFAULT 120,
    or_minutes_utilized INT NOT NULL DEFAULT 18240,
    or_capacity_utilization_percent NUMERIC(6, 2) NOT NULL DEFAULT 45.24,
    
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_approved BOOLEAN NOT NULL DEFAULT false,
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES public.users(id),
    frozen_hash VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_facility_scenario UNIQUE (facility_id, scenario_code, version_number)
);
```

### 2. `public.scenario_specialty_impacts`
Stores procedural specialty breakdown per scenario.
```sql
CREATE TABLE IF NOT EXISTS public.scenario_specialty_impacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario_id UUID NOT NULL REFERENCES public.facility_scenarios(id) ON DELETE CASCADE,
    specialty_code VARCHAR(32) NOT NULL, -- 'ORTHOPEDICS', 'SPINE', etc.
    specialty_name VARCHAR(128) NOT NULL,
    baseline_cases INT NOT NULL DEFAULT 0,
    scenario_cases INT NOT NULL DEFAULT 0,
    baseline_revenue_per_case NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    scenario_revenue_per_case NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    baseline_variable_cost_per_case NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    scenario_variable_cost_per_case NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    projected_contribution_margin NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    projected_or_minutes INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_scenario_specialty UNIQUE (scenario_id, specialty_code)
);
```

---

## Business Rules
1. **Tenant Isolation:** Every scenario belongs to exactly one `facility_id`. Cross-tenant simulation or leakage is blocked.
2. **Baseline Immutability:** Baseline values are derived from closed-period Management P&L actuals and cannot be overwritten by what-if adjustments.
3. **Additive Invariant:** The sum of specialty cases, revenues, and variable costs must strictly balance to total projected scenario values.
4. **Capacity Ceiling:** Available monthly OR capacity is strictly calculated as:
   $$\text{Max Minutes} = \text{Operating Days (21)} \times \text{ORs (4)} \times 8 \text{ hours} \times 60 \text{ minutes} = 40,320 \text{ minutes}$$
   Scenarios exceeding $85\%$ capacity trigger operational staffing warnings.
5. **Approval Lock:** Approving a scenario sets `is_approved = true`, generates a SHA-256 seal, and prevents subsequent lever modifications.

---

## Acceptance Criteria
- Migration 119 applies cleanly with RLS policies and seed data for Naples Surgery Center.
- Down migration cleanly rolls back tables and views without residual side effects.
- Core service provides deterministic simulation math with dual facade parity (`src/services/` and `src/lib/`).
- Interactive UI provides executive ribbon, multi-lever parameter controls, OR capacity meter, side-by-side comparative scenario table, and cryptographic seal audit drawer.
- Zero prohibited accent tokens (`purple`, `violet`, `indigo`, `magenta`, `fuchsia`) across all CSS, JSX, and comments.
- 100% automated test coverage in `tests/scenario-modeling.test.js` (12 tests) and all existing test suites passing.
- `npm run build` compiles with zero errors.
