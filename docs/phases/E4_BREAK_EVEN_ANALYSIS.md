# E4 BREAK-EVEN ANALYSIS & COST-VOLUME-PROFIT (CVP) ENGINE

## Purpose
The Break-Even Analysis and Cost-Volume-Profit (CVP) engine establishes an auditable, deterministic operational economics model for Ambulatory Surgery Centers (ASCs). In outpatient surgical facilities, financial viability is governed by heavy structural fixed costs (facility rent, clinical leadership salaries, depreciation, equipment leases, and accreditation fees) contrasted against procedure-specific variable costs (surgical implants, sterile custom packs, pharmaceuticals, and case-length nursing labor).

This module defines deterministic mathematical models to calculate the exact operational volume, surgical procedural mix, and Net Patient Revenue required to achieve zero operating loss ($\text{EBITDA} = \$0$), quantify operational risk via the Margin of Safety (MOS), compute the Degree of Operating Leverage (DOL), calculate specialty-specific break-even thresholds (Orthopedics, Spine, Ophthalmology, Pain Management), and model required case volumes for target EBITDA profit milestones.

---

## Scope
- **Production Requirements:** Multi-version break-even model lifecycle management (`DRAFT`, `UNDER_REVIEW`, `ACTIVE_BENCHMARK`, `SUPERSEDED`, `ARCHIVED`), deterministic fixed vs. variable cost classification, unit contribution margin calculations, facility-level and specialty-level break-even volume equations, margin of safety tracking, operating leverage quantification, and target EBITDA sensitivity simulations.
- **ASCANALYST Compatibility:** Seamless integration with Phase E0 Management P&L (`management_pnl_statement_lines`), Phase E1 Budget vs. Actual (`budget_variance_analyses`), Phase E2 Rolling Forecast (`rolling_forecast_line_items`), Phase 72 Cost Model (`facility_financial_settings`), and Phase 73 Contribution Margin Engine (`contribution_margin_engine`).
- **Deterministic Billing & Financial Logic:** Hard mathematical invariants governing Contribution Margin ($CM = R - VC$), Contribution Margin Ratio ($CMR = CM / R$), Break-Even Volume ($Q_{BE} = FC / CM$), Break-Even Revenue ($R_{BE} = FC / CMR$), Margin of Safety ($MOS = \text{Actual} - \text{Break-Even}$), and Operating Leverage ($DOL = \text{Total } CM / \text{EBITDA}$).
- **Tenancy & RBAC:** Enforced facility isolation with Naples Surgery Center (`fac-naples-01` / `00000000-0000-0000-0000-000000000002`) compatibility, CFO-exclusive benchmark approval, and cryptographic SHA-256 digital seals.

---

## Current State
An audit of existing repository assets and database models reveals the following component classifications:

| Component | Status | Classification | Current Behavior & Gap Analysis |
|:---|:---|:---|:---|
| `public.management_pnl_statement_lines` (Migration 114) | Active | **KEEP** | Authoritative closed-period actuals for Net Revenue, Direct Costs, and Fixed Overhead. Supplies the baseline inputs for fixed vs. variable cost segregation. |
| `public.facility_financial_settings` (Migration 049) | Active | **KEEP** | Baseline clinical wages and indirect overhead factors. Supplies unit cost allocation factors. |
| `public.contribution_margin_engine` (Migration 050) | Active | **KEEP** | Surgery-level contribution margins and case direct costs. |
| Static CVP Spreadsheets & Ad-hoc Formulas | Legacy | **REPLACE** | Disconnected manual Excel sheets with hardcoded volume assumptions, static unit margins, and no automated tie-in to actual closed P&L periods. |
| Break-Even Benchmark Model Master Schema | Missing | **MISSING** | No database tables tracking annual or quarterly break-even benchmarks, version lineages, or CFO approval status. |
| Specialty-Specific CVP Breakdown Table | Missing | **MISSING** | No normalized storage for specialty-level unit revenues, variable costs, contribution margins, and specialty break-even case counts. |
| Deterministic CVP Mathematical Engine | Missing | **MISSING** | No automated mathematical service computing break-even volume, dollar revenue, margin of safety, and operating leverage. |
| Target Profit & Sensitivity Simulation | Missing | **MISSING** | No interactive simulation infrastructure to compute required surgical volume under supply cost inflation or payer reimbursement fee changes. |

---

## Target State
The target state delivers an enterprise-grade CFO Break-Even & Cost-Volume-Profit (CVP) suite:
1. **Authoritative Cost Classification & Segregation:**
   - **Fixed Costs ($FC$):** Facility lease/rent, administrative compensation, IT/EHR subscriptions, medical director fees, insurance, and equipment depreciation ($\approx \$240,000$ per month for Naples Surgery Center).
   - **Variable Costs ($VC$):** Direct procedural costs scaling with surgical volume: surgical implants, sterile packs, pharmaceuticals, direct scrub/circulating RN hourly labor, and variable SPD processing ($\approx \$2,791.67$ per case).
   - **Net Patient Revenue ($R$):** Net collections after contractual allowances and bad debt ($\approx \$4,791.67$ per case).
2. **Deterministic Facility-Level Break-Even Equations:**
   - **Unit Contribution Margin ($CM$):**
     $$CM = R - VC = \$4,791.67 - \$2,791.67 = \$2,000.00 \text{ per case}$$
   - **Contribution Margin Ratio ($CMR$):**
     $$CMR = \frac{CM}{R} = \frac{\$2,000.00}{\$4,791.67} = 41.74\%$$
   - **Break-Even Case Volume ($Q_{BE}$):**
     $$Q_{BE} = \frac{FC}{CM} = \frac{\$240,000}{\$2,000} = 120 \text{ cases per month}$$
   - **Break-Even Dollar Revenue ($R_{BE}$):**
     $$R_{BE} = \frac{FC}{CMR} = \frac{\$240,000}{0.41739} = \$575,000.00 \text{ per month}$$
   - **Daily Break-Even Run-Rate:**
     $$\text{Cases/Day} = \frac{Q_{BE}}{\text{Operating Days}} = \frac{120}{21} = 5.71 \approx 6 \text{ cases/day across 4 ORs (1.5 cases/OR/day)}$$
3. **Operational Risk & Leverage Metrics:**
   - **Margin of Safety ($MOS$):**
     $$\text{Volume MOS} = \text{Actual Cases} - Q_{BE} = 240 - 120 = 120 \text{ cases } (50.0\%)$$
     $$\text{Revenue MOS} = \text{Actual Revenue} - R_{BE} = \$1,150,000 - \$575,000 = \$575,000 (50.0\%)$$
   - **Degree of Operating Leverage ($DOL$):**
     $$DOL = \frac{\text{Total Contribution Margin}}{\text{EBITDA}} = \frac{240 \times \$2,000}{\$240,000} = 2.00$$
4. **Specialty-Specific CVP Breakdown:**
   - Evaluates unit contribution margins and break-even thresholds across distinct surgical specialties:
     - **Orthopedics & Joint Reconstruction:** $R = \$8,500$, $VC = \$4,900$, $CM = \$3,600$, $CMR = 42.4\%$.
     - **Spine (ACDF, Decompression):** $R = \$9,200$, $VC = \$5,300$, $CM = \$3,900$, $CMR = 42.4\%$.
     - **Ophthalmology (Cataracts):** $R = \$2,200$, $VC = \$950$, $CM = \$1,250$, $CMR = 56.8\%$.
     - **Pain Management (Injections):** $R = \$1,400$, $VC = \$350$, $CM = \$1,050$, $CMR = 75.0\%$.
     - **General Surgery & ENT:** $R = \$3,800$, $VC = \$1,900$, $CM = \$1,900$, $CMR = 50.0\%$.
5. **Interactive Target Profit & Sensitivity Simulator:**
   - Calculates required case volume for target EBITDA goals:
     $$Q_{\text{Target}} = \frac{FC + \text{Target EBITDA}}{CM}$$
   - Models sensitivity to supply cost inflation, payer reimbursement compression, and fixed overhead escalation.

---

## Data Model / Schema

### 1. `public.facility_break_even_models`
Stores facility break-even model versions, fixed costs, contribution margin ratios, break-even thresholds, and cryptographic seals.
```sql
CREATE TABLE IF NOT EXISTS public.facility_break_even_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    model_code VARCHAR(32) NOT NULL, -- e.g. 'BE2026_M10_BASE', 'BE2026_ANNUAL'
    model_name VARCHAR(128) NOT NULL, -- e.g. 'October 2026 Baseline Break-Even Model'
    period_type VARCHAR(16) NOT NULL DEFAULT 'MONTHLY' CHECK (period_type IN ('MONTHLY', 'QUARTERLY', 'ANNUAL')),
    baseline_period_code VARCHAR(16) NOT NULL, -- e.g. '2026-M10'
    version_number INT NOT NULL DEFAULT 1,
    status VARCHAR(24) NOT NULL DEFAULT 'DRAFT' CHECK (
        status IN ('DRAFT', 'UNDER_REVIEW', 'ACTIVE_BENCHMARK', 'SUPERSEDED', 'ARCHIVED')
    ),
    fixed_overhead_costs NUMERIC(14, 2) NOT NULL DEFAULT 240000.00,
    average_revenue_per_case NUMERIC(14, 2) NOT NULL DEFAULT 4791.67,
    average_variable_cost_per_case NUMERIC(14, 2) NOT NULL DEFAULT 2791.67,
    unit_contribution_margin NUMERIC(14, 2) NOT NULL DEFAULT 2000.00,
    contribution_margin_ratio NUMERIC(6, 4) NOT NULL DEFAULT 0.4174,
    break_even_cases INT NOT NULL DEFAULT 120,
    break_even_revenue NUMERIC(14, 2) NOT NULL DEFAULT 575000.00,
    operating_days_per_period INT NOT NULL DEFAULT 21,
    daily_break_even_cases NUMERIC(6, 2) NOT NULL DEFAULT 5.71,
    actual_cases INT NOT NULL DEFAULT 240,
    margin_of_safety_cases INT NOT NULL DEFAULT 120,
    margin_of_safety_percent NUMERIC(6, 2) NOT NULL DEFAULT 50.00,
    degree_of_operating_leverage NUMERIC(6, 2) NOT NULL DEFAULT 2.00,
    is_active BOOLEAN NOT NULL DEFAULT false,
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES auth.users(id),
    frozen_hash VARCHAR(64),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_be_model_code UNIQUE (facility_id, model_code)
);

CREATE INDEX IF NOT EXISTS idx_facility_be_models ON public.facility_break_even_models(facility_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_be_models_status ON public.facility_break_even_models(status);
```

### 2. `public.break_even_specialty_benchmarks`
Stores specialty-specific volume, revenue, variable cost, and unit contribution margin economics.
```sql
CREATE TABLE IF NOT EXISTS public.break_even_specialty_benchmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID NOT NULL REFERENCES public.facility_break_even_models(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    specialty_code VARCHAR(32) NOT NULL, -- e.g. 'ORTHOPEDICS', 'SPINE', 'OPHTHALMOLOGY', 'PAIN'
    specialty_name VARCHAR(64) NOT NULL,
    actual_monthly_cases INT NOT NULL DEFAULT 0,
    average_case_duration_minutes INT NOT NULL DEFAULT 75,
    revenue_per_case NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    implant_cost_per_case NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    supply_cost_per_case NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    labor_cost_per_case NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    variable_cost_per_case NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    unit_contribution_margin NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    contribution_margin_ratio NUMERIC(6, 4) NOT NULL DEFAULT 0.0000,
    allocated_fixed_cost NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    specialty_break_even_cases INT NOT NULL DEFAULT 0,
    margin_of_safety_cases INT NOT NULL DEFAULT 0,
    margin_of_safety_percent NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_be_model_specialty UNIQUE (model_id, specialty_code)
);

CREATE INDEX IF NOT EXISTS idx_be_specialty_model ON public.break_even_specialty_benchmarks(model_id);
```

### 3. Telemetry View: `public.vw_break_even_telemetry`
Aggregates key break-even KPIs, safety margins, and operating leverage metrics per facility.
```sql
CREATE OR REPLACE VIEW public.vw_break_even_telemetry AS
SELECT
    m.facility_id,
    m.id AS model_id,
    m.model_code,
    m.model_name,
    m.status,
    m.is_active,
    m.fixed_overhead_costs,
    m.average_revenue_per_case,
    m.average_variable_cost_per_case,
    m.unit_contribution_margin,
    m.contribution_margin_ratio,
    m.break_even_cases,
    m.break_even_revenue,
    m.actual_cases,
    m.margin_of_safety_cases,
    m.margin_of_safety_percent,
    m.degree_of_operating_leverage,
    m.daily_break_even_cases,
    COUNT(s.id) AS specialty_count,
    COALESCE(SUM(s.actual_monthly_cases), 0) AS total_specialty_cases
FROM public.facility_break_even_models m
LEFT JOIN public.break_even_specialty_benchmarks s ON s.model_id = m.id
GROUP BY m.facility_id, m.id, m.model_code, m.model_name, m.status, m.is_active, m.fixed_overhead_costs, m.average_revenue_per_case, m.average_variable_cost_per_case, m.unit_contribution_margin, m.contribution_margin_ratio, m.break_even_cases, m.break_even_revenue, m.actual_cases, m.margin_of_safety_cases, m.margin_of_safety_percent, m.degree_of_operating_leverage, m.daily_break_even_cases;
```

---

## Business Rules

### 1. Deterministic CVP Mathematical Invariants
Across all facility and specialty break-even models:
1. $\text{Unit Contribution Margin } (CM) = R - VC$.
2. $\text{Contribution Margin Ratio } (CMR) = \frac{CM}{R}$.
3. $\text{Break-Even Case Volume } (Q_{BE}) = \lceil \frac{FC}{CM} \rceil$.
4. $\text{Break-Even Dollar Revenue } (R_{BE}) = \frac{FC}{CMR} = Q_{BE} \times R$.
5. $\text{Daily Break-Even Volume} = \frac{Q_{BE}}{\text{Operating Days}}$.
6. $\text{Volume Margin of Safety } (MOS_Q) = Q_{\text{Actual}} - Q_{BE}$.
7. $\text{Percentage Margin of Safety } (MOS_\%) = \frac{MOS_Q}{Q_{\text{Actual}}} \times 100\%$.
8. $\text{Degree of Operating Leverage } (DOL) = \frac{Q_{\text{Actual}} \times CM}{\text{EBITDA}}$.

### 2. Target Profit Milestones
For any target EBITDA goal:
$$Q_{\text{Target}} = \lceil \frac{FC + \text{Target EBITDA}}{CM} \rceil$$
$$\text{Revenue}_{\text{Target}} = \frac{FC + \text{Target EBITDA}}{CMR}$$

### 3. Specialty Mix Invariants
- Total facility fixed costs must equal the sum of allocated fixed costs across specialties:
  $$FC_{\text{Total}} = \sum FC_{\text{Specialty}}$$
- Sum of specialty actual cases must equal facility actual cases:
  $$Q_{\text{Total}} = \sum Q_{\text{Specialty}}$$

### 4. Status Transitions & Immutability
- `DRAFT` $\to$ `UNDER_REVIEW` $\to$ `ACTIVE_BENCHMARK` $\to$ `SUPERSEDED` $\to$ `ARCHIVED`.
- Only users with `CFO` or `ADMIN` roles may approve an `ACTIVE_BENCHMARK`.
- Stamped with an immutable SHA-256 seal upon approval.

---

## Permissions / Security
- **Tenancy:** All queries, inserts, and mutations enforce strict `facility_id` tenant isolation.
- **RBAC Roles:**
  - `CFO`: Full view, adjust cost allocations, run target profit simulations, approve `ACTIVE_BENCHMARK`.
  - `FACILITY_ADMIN`: View break-even charts, review specialty contribution margins, export CVP dossiers.
  - `CLINICAL_DIRECTOR`: View daily break-even case volume and OR minute utilization targets.
  - `ANALYST` / `VIEWER`: Read-only access to published break-even models.
- **AI Tool Contract:** AI agents querying break-even data operate under the active user's facility tenancy and role boundaries.

---

## API / Service Requirements

### Service Interface: `src/services/breakEvenService.js`

```javascript
/**
 * Retrieves the currently active or specified break-even model for a facility.
 */
export function getFacilityBreakEvenModels(facilityId);

/**
 * Retrieves full break-even metrics and specialty benchmarks.
 */
export function getBreakEvenAnalysis(facilityId, modelId = 'BE2026_M10_BASE');

/**
 * Computes executive telemetry KPIs for ribbon display.
 */
export function getBreakEvenTelemetry(facilityId, modelId = 'BE2026_M10_BASE');

/**
 * Simulates target profit volume or sensitivity shifts (inflation, rate changes).
 */
export function simulateBreakEvenSensitivity(baselineModel, options = {});

/**
 * Approves a break-even model, marks it ACTIVE_BENCHMARK, and computes SHA-256 seal.
 */
export function approveAndFreezeBreakEvenModel(modelId, approvedBy);

/**
 * Dual-facade re-export in src/lib/breakEvenService.js.
 */
```

---

## UI / Workflow Requirements

### 1. Executive CVP Telemetry Ribbon
- 5 high-impact cards:
  1. **Monthly Break-Even Volume:** Minimum cases to cover fixed costs (120 cases/month).
  2. **Break-Even Dollar Revenue:** Minimum monthly Net Patient Revenue ($575,000/month).
  3. **Unit Contribution Margin:** Net revenue minus variable costs per procedure ($2,000/case; 41.7% CMR).
  4. **Margin of Safety (MOS):** Operational buffer above break-even (120 cases / 50.0% cushion).
  5. **Degree of Operating Leverage (DOL):** Profit sensitivity to volume changes (2.00x leverage).

### 2. Interactive Cost-Volume-Profit (CVP) Visual Graph
- Visual chart displaying:
  - **Fixed Cost Line:** Horizontal baseline at $240,000.
  - **Total Cost Line:** Fixed Costs + Variable Costs slope.
  - **Total Revenue Line:** Net Patient Revenue slope.
  - **Break-Even Intersection Point:** Crossover point at 120 cases ($575,000).
  - **Shaded Areas:** Red Loss Zone ($0$ to $120$ cases) and Green Profit Zone ($>120$ cases).
  - **Current Operating Point Indicator:** Pinpoint at 240 cases ($1,150,000 NPR, $310,000 EBITDA).

### 3. Specialty CVP Economics Table
- Table breaking down procedural economics by specialty:
  - Orthopedics & Total Joint
  - Spine Surgery
  - Ophthalmology
  - Interventional Pain Management
  - General Surgery & ENT
- Columns: Monthly Volume, Case Duration, Revenue/Case, Variable Cost/Case, Unit CM, CM Ratio, Allocated Fixed Cost, Specialty Break-Even Volume, Margin of Safety.

### 4. Interactive Target Profit & Sensitivity Simulator
- Real-time calculator sliders:
  - **Target Monthly EBITDA:** Slider from $0 to $600,000 (calculates required cases).
  - **Supply Cost Inflation:** Slider from -10% to +20% (recalculates break-even point).
  - **Payer Reimbursement Compression:** Slider from -10% to +10% (recalculates CMR).

### 5. Parameter Tuning & Governance Drawer
- Inspect fixed cost component line items (Lease, Admin, IT, Depreciation).
- View SHA-256 cryptographic seal and provenance metadata.

---

## Audit / Provenance
- All modifications to cost allocations, fixed cost definitions, or specialty benchmarks retain user UUID, timestamp, and before/after values.
- Freezing an `ACTIVE_BENCHMARK` generates a tamper-evident SHA-256 seal:
  $$\text{Seal} = \text{SHA256}(\text{model\_id} \,\|\, \text{facility\_id} \,\|\, \text{fixed\_costs} \,\|\, \text{be\_cases} \,\|\, \text{unit\_cm} \,\|\, \text{timestamp})$$

---

## QA / Test Cases (12 Core Tests)
1. **Telemetry Aggregation:** Verifies break-even volume (120 cases), break-even revenue ($575k), unit CM ($2,000), and MOS (50%) match calculations.
2. **Facility UUID Resolution:** Verifies alias matching for Naples Surgery Center (`fac-naples-01`).
3. **Unit Contribution Margin Math:** Proves $CM = R - VC$ and $CMR = CM / R$ across facility and specialties.
4. **Break-Even Volume Formula:** Proves $Q_{BE} = \lceil FC / CM \rceil$.
5. **Break-Even Revenue Formula:** Proves $R_{BE} = FC / CMR = Q_{BE} \times R$.
6. **Margin of Safety Equation:** Proves $MOS_Q = Q_{\text{Actual}} - Q_{BE}$ and $MOS_\% = (MOS_Q / Q_{\text{Actual}}) \times 100\%$.
7. **Degree of Operating Leverage:** Proves $DOL = (Q_{\text{Actual}} \times CM) / \text{EBITDA}$.
8. **Target Profit Solver:** Proves $Q_{\text{Target}} = \lceil (FC + \text{Target EBITDA}) / CM \rceil$.
9. **Specialty Economics Integrity:** Verifies sum of allocated fixed costs equals total facility fixed costs.
10. **Migration 118 SQL Integrity:** Validates UP/DOWN migrations, tables, constraints, and RLS policies.
11. **Strict Zero-Purple CSS Compliance:** Proves 0 occurrences of prohibited color tokens in styles and JSX.
12. **App Shell Integration:** Verifies navigation routing, tab state, and icon integration in `src/App.jsx`.

---

## Acceptance Criteria
- Production build passes cleanly (`npm run build`).
- Unit and integration test suite passes 100% (`node --test tests/break-even.test.js`).
- Strict zero-purple ban enforced across all files.
- Facility tenant isolation verified in database schema and services.
- Projections reflect deterministic CVP mathematics without mock/placeholder artifacts.

---

## Dependencies
- Upstream: Phase E0 Management P&L (`management_pnl_statement_lines`), Phase E1 Budget vs. Actual (`facility_budgets`), Phase E2 Rolling Forecast (`facility_rolling_forecasts`), Phase 72 Cost Model, Phase 73 Contribution Margin Engine.
- Downstream: Phase E5 Scenario Modeling, Phase E6 Board Reporting, Phase E7 ROI & Value Report.

---

## Definition of Done
A feature is not complete because a screen exists. It is complete only when the data model, deterministic logic, permissions, validation, auditability, tests, UI states, documentation, and acceptance criteria are complete.

---

## Implementation Notes
- **Branch:** `feature/phase-e4-break-even-analysis`
- **Migration:** `supabase/migrations/118_break_even_analysis.sql` and `118_break_even_analysis_down.sql`
- **Services:** `src/services/breakEvenService.js` and `src/lib/breakEvenService.js`
- **Components:** `src/components/BreakEvenView.jsx` and `src/components/BreakEvenView.css`
- **Shell:** `src/App.jsx`
- **Tests:** `tests/break-even.test.js`
