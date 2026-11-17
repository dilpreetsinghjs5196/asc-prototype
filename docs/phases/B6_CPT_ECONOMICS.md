# B6 CPT ECONOMICS

## Purpose
CPT reimbursement, cost, margin, and OR-hour economics. This specification defines production standards for procedure-level financial modeling across ambulatory surgical center (ASC) procedural catalogs. It establishes deterministic mathematical models for activity-based cost decomposition (supplies, implants, time-driven nursing labor, anesthesia consumables, and allocated facility overhead), procedural gross and contribution margins, suite hourly productivity yield ($/OR-hour), breakeven case volumes, and block opportunity cost analysis.

## Scope
- Define production requirements for the CPT Economics Subsystem within Module 11 (Surgeon & Clinical Intelligence / Executive Intelligence).
- Preserve full backward compatibility with CPT Master & Code Normalization (Phase 17), Activity-Based Case Cost Model (Phase 92), Case Financial Ledger (Phase 91), Facility Financial & Cost Settings (Phase 93), Contribution Margin Engine (Phase 93A), Surgeon Financial Scorecard (Phase B1), and CPT Intelligence (Phase B5).
- Establish auditable, server-authoritative calculations for gross margin, direct contribution margin, contribution margin percentage, fully loaded operating margin, margin per OR-minute and OR-hour, breakeven volume, and block opportunity cost.
- Enforce strict organization/facility multi-tenancy and PostgreSQL Row Level Security (RLS).
- Implement role-based access control (RBAC): Surgery Center Administrators, Chief Financial Officers, Business Office Managers, Clinical Directors, and Financial Analysts can evaluate procedural profitability, negotiate payer contracts, and optimize suite scheduling.

## Current State
- **Phase 17 (CPT Master & Code Normalization):** Maintains normalized procedure catalogs (`public.cpt_codes`) with AMA descriptors.
- **Phase 91 (Case Financial Ledger):** Records event-sourced journal entries for case revenues, implant invoices, and supply allocations.
- **Phase 92 (Activity-Based Case Cost Model):** Decomposes operational costs into 8 granular accounting buckets (implants, sterile supplies, nursing labor, anesthesia, sterile processing, pharmacy, facility overhead, equipment depreciation).
- **Phase 93A (Contribution Margin Engine):** Computes encounter-level contribution margins and breakeven rates.
- **Phase B5 (CPT Intelligence):** Profiles procedures across operational duration variance, cross-surgeon technique variations, Medicare parity spreads, and CARC denial friction.
- **CPT Economics Gap:** While case-level ledger entries and broad CPT intelligence metrics exist, ASC leadership lacks a dedicated procedural economics engine that models the complete micro-economic profile of each CPT code. Facilities struggle to determine the true fully loaded cost per procedure, frequently miscalculating high-revenue orthopedic cases that yield negligible net margin due to unchecked implant and overtime nursing labor costs. Furthermore, leadership cannot easily evaluate the opportunity cost of dedicating prime block hours to low-margin procedures versus high-velocity, high-margin anchor cases.
- **Classification:**
  - Case Financial Ledger (`case_financial_ledger`): **KEEP**.
  - Case Cost Accounting Models: **KEEP**.
  - Broad Procedural Profiling (`cpt_intelligence_metrics`): **KEEP**.
  - Dedicated Multi-Tier CPT Economics Engine: **MISSING** (Implemented in Phase B6).

## Target State
1. **Activity-Based Procedural Cost Decomposition:**
   - Every evaluated CPT code is broken down into 5 deterministic cost tiers:
     1. **Implant & Hardware Cost ($C_{\text{implant}}$):** Total invoice acquisition cost for prosthetic joints, anchors, screws, plates, and biologic grafts.
     2. **Specialized Sterile Supplies ($C_{\text{supply}}$):** Drapes, tubing, specialized disposable handpieces, sutures, irrigation fluid, and sterile processing trays.
     3. **Time-Driven Clinical Labor ($C_{\text{labor}}$):** Circulating RN and surgical technologist loaded wages multiplied by actual room minutes:
        $$C_{\text{labor}} = T_{\text{actual\_minutes}} \times \text{LoadedWagePerMinute}$$
     4. **Anesthesia & Medications ($C_{\text{anes}}$):** Anesthetic gases, reversal agents, IV sedation, local blocks, and recovery medications.
     5. **Allocated Facility Overhead ($C_{\text{overhead}}$):** Fixed building lease, utilities, sterile processing center, regulatory compliance, and non-clinical administration allocated on an hourly suite occupancy basis:
        $$C_{\text{overhead}} = \left(\frac{T_{\text{actual\_minutes}}}{60}\right) \times \text{FacilityHourlyOverheadRate}$$
2. **Deterministic Margin Architecture:**
   - **Net Collections Realization ($R_{\text{net}}$):** Actual adjudicated cash receipts from primary, secondary, and patient co-pay/deductible portions.
   - **Direct Variable Cost ($C_{\text{direct}}$):**
     $$C_{\text{direct}} = C_{\text{implant}} + C_{\text{supply}} + C_{\text{labor}} + C_{\text{anes}}$$
   - **Procedural Contribution Margin ($CM_{\text{cpt}}$):**
     $$CM_{\text{cpt}} = R_{\text{net}} - C_{\text{direct}}$$
   - **Contribution Margin Percentage ($CM\%_{\text{cpt}}$):**
     $$CM\%_{\text{cpt}} = \left(\frac{CM_{\text{cpt}}}{R_{\text{net}}}\right) \times 100$$
   - **Fully Loaded Operating Margin ($NM_{\text{cpt}}$):** Net operating profit after absorbing facility fixed overhead:
     $$NM_{\text{cpt}} = R_{\text{net}} - (C_{\text{direct}} + C_{\text{overhead}})$$
   - **Fully Loaded Operating Margin Percentage ($NM\%_{\text{cpt}}$):**
     $$NM\%_{\text{cpt}} = \left(\frac{NM_{\text{cpt}}}{R_{\text{net}}}\right) \times 100$$
3. **OR-Hour Financial Velocity & Opportunity Cost:**
   - **Margin Per OR-Hour ($Yield_{\text{OR\_hour}}$):**
     $$Yield_{\text{OR\_hour}} = \left(\frac{CM_{\text{cpt}}}{T_{\text{actual\_minutes}}}\right) \times 60$$
   - **Fully Loaded Margin Per OR-Hour ($NetYield_{\text{OR\_hour}}$):**
     $$NetYield_{\text{OR\_hour}} = \left(\frac{NM_{\text{cpt}}}{T_{\text{actual\_minutes}}}\right) \times 60$$
   - **Block Opportunity Cost ($\Delta Y_{\text{opp}}$):** Dollar yield differential between scheduling a target procedure versus the facility's prime suite benchmark:
     $$\Delta Y_{\text{opp}} = \max(0, \text{BenchmarkHourlyYield} - Yield_{\text{OR\_hour}}) \times \left(\frac{T_{\text{actual\_minutes}}}{60}\right)$$
4. **Breakeven Volume Modeling:**
   - **Breakeven Case Volume ($N_{\text{breakeven}}$):** Minimum procedural volume required to absorb allocated annual specialty overhead:
     $$N_{\text{breakeven}} = \frac{\text{AnnualAllocatedOverhead}}{CM_{\text{per\_case}}}$$
5. **Economic Profitability Quadrants:**
   - `PRIME_YIELD_ANCHOR`: High Margin per OR-Hour ($\ge \$2,200/\text{hr}$) and healthy contribution percentage ($\ge 50\%$).
   - `VOLUME_PROFIT_BUILDER`: Moderate Margin per OR-Hour ($\$1,400\text{--}\$2,199/\text{hr}$) with rapid room turnover and high case frequency.
   - `MARGIN_SQUEEZE_AT_RISK`: High top-line billed charges but compressed margins ($< 30\%$) due to heavy implant or extended labor duration.
   - `ECONOMIC_DEFICIT`: Sub-overhead yield ($< \$800/\text{hr}$) or negative net operating income; fails to cover baseline facility operating expenses.

## Data Model / Schema
PostgreSQL migration `095_cpt_economics.sql` establishes:
1. `public.cpt_economics_metrics`:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE`
   - `cpt_code VARCHAR(16) NOT NULL`
   - `procedure_name VARCHAR(256) NOT NULL`
   - `specialty VARCHAR(64) NOT NULL`
   - `annual_case_volume INTEGER NOT NULL DEFAULT 0`
   - `avg_operative_minutes NUMERIC(6, 1) NOT NULL DEFAULT 0.0`
   - `avg_billed_charges NUMERIC(12, 2) NOT NULL DEFAULT 0.00`
   - `avg_net_collections NUMERIC(12, 2) NOT NULL DEFAULT 0.00`
   - `collection_realization_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00`
   - `implant_cost_per_case NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `sterile_supply_cost_per_case NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `labor_cost_per_case NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `anesthesia_meds_cost_per_case NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `total_direct_cost_per_case NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `allocated_overhead_per_case NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `total_loaded_cost_per_case NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `contribution_margin_per_case NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `contribution_margin_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00`
   - `net_margin_per_case NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `net_margin_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00`
   - `margin_per_or_minute NUMERIC(8, 2) NOT NULL DEFAULT 0.00`
   - `margin_per_or_hour NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `loaded_margin_per_or_hour NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `breakeven_annual_cases INTEGER NOT NULL DEFAULT 0`
   - `opportunity_cost_per_case NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `economic_quadrant VARCHAR(32) NOT NULL DEFAULT 'VOLUME_PROFIT_BUILDER'`
   - `primary_economic_lever VARCHAR(256)`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `CONSTRAINT uq_cpt_economics_facility UNIQUE (facility_id, cpt_code)`
2. `public.cpt_cost_component_breakdown`:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE`
   - `cpt_code VARCHAR(16) NOT NULL`
   - `cost_category VARCHAR(64) NOT NULL` -- 'IMPLANTS', 'STERILE_SUPPLIES', 'NURSING_LABOR', 'ANESTHESIA_PHARMACY', 'FACILITY_OVERHEAD'
   - `cost_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `cost_percentage_of_total NUMERIC(5, 2) NOT NULL DEFAULT 0.00`
   - `is_variable_cost BOOLEAN NOT NULL DEFAULT true`
   - `vendor_or_contract_reference VARCHAR(128)`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
3. `public.cpt_economic_payer_yields`:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE`
   - `cpt_code VARCHAR(16) NOT NULL`
   - `payer_code VARCHAR(64) NOT NULL`
   - `payer_name VARCHAR(256) NOT NULL`
   - `cases_count INTEGER NOT NULL DEFAULT 0`
   - `avg_allowed_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `avg_net_collections NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `contribution_margin_per_case NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `margin_per_or_hour NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
4. Analytical Views:
   - `vw_cpt_economics_summary`: Aggregated specialty-level revenues, direct variable costs, overhead absorption, and hourly OR yields.
   - `vw_cpt_breakeven_and_yield_matrix`: Identifies procedures with sub-breakeven volumes or high opportunity cost deficits.
5. Row Level Security & Indexes:
   - RLS enabled on all tables enforcing `facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID`.

## Business Rules
1. **Direct Variable Cost ($C_{\text{direct}}$):**
   $$C_{\text{direct}} = C_{\text{implant}} + C_{\text{supply}} + C_{\text{labor}} + C_{\text{anes}}$$
2. **Procedural Contribution Margin ($CM_{\text{cpt}}$):**
   $$CM_{\text{cpt}} = R_{\text{net}} - C_{\text{direct}}$$
3. **Contribution Margin Percentage ($CM\%_{\text{cpt}}$):**
   If $R_{\text{net}} > 0$:
   $$CM\%_{\text{cpt}} = \left(\frac{CM_{\text{cpt}}}{R_{\text{net}}}\right) \times 100$$
4. **Fully Loaded Operating Margin ($NM_{\text{cpt}}$):**
   $$NM_{\text{cpt}} = R_{\text{net}} - (C_{\text{direct}} + C_{\text{overhead}})$$
5. **Margin Per OR-Hour ($Yield_{\text{OR\_hour}}$):**
   If $T_{\text{actual\_minutes}} > 0$:
   $$Yield_{\text{OR\_hour}} = \left(\frac{CM_{\text{cpt}}}{T_{\text{actual\_minutes}}}\right) \times 60$$
6. **Breakeven Volume ($N_{\text{breakeven}}$):**
   If $CM_{\text{cpt}} > 0$:
   $$N_{\text{breakeven}} = \left\lceil \frac{\text{AnnualAllocatedOverhead}}{CM_{\text{cpt}}} \right\rceil$$

## Permissions / Security
- **Multi-Tenancy:** Strictly partition all CPT economic metrics and cost decompositions by `facility_id`.
- **Role-Based Access Control (RBAC):**
  - View Access: `administrator`, `executive`, `clinical_director`, `cfo`, `biller`, `analyst`.
  - Strategy & Overhead Rate Configuration: `administrator`, `executive`, `cfo`.
  - Export & Payer Modeling: `administrator`, `executive`, `cfo`, `analyst`.

## API / Service Requirements
- `cptEconomicsService.js` provides:
  - `calculateGrossMargin(netCollections, implantCost, supplyCost)`
  - `calculateDirectContributionMargin(netCollections, totalDirectCost)`
  - `calculateDirectContributionMarginPct(contributionMargin, netCollections)`
  - `calculateFullyLoadedNetMargin(netCollections, totalLoadedCost)`
  - `calculateMarginPerOrHour(contributionMargin, actualOrMinutes)`
  - `calculateFullyLoadedMarginPerOrHour(fullyLoadedMargin, actualOrMinutes)`
  - `calculateBreakevenCases(allocatedFixedOverhead, contributionMarginPerCase)`
  - `classifyEconomicQuadrant(marginPerOrHour, contributionMarginPct)`
  - `calculateFacilityEconomicsKpis(cptEconomicsList)`

## UI / Workflow Requirements
- **Executive 5-Card Ribbon:**
  1. Total Procedural Net Collections ($\$5,428,600$).
  2. Total Direct Contribution Margin ($\$2,750,150$).
  3. Average Margin per OR-Hour ($\$1,999/\text{hr}$).
  4. Portfolio Fully Loaded Operating Margin ($36.8\%$).
  5. Prime Yield Anchor Procedures ($5$ procedures).
- **Tab 1: CPT Profitability & OR-Hour Yield Matrix:** Comprehensive table filterable by specialty and economic quadrant with search, case volume, net collections, direct variable costs, contribution margin, margin %, margin/OR-hr (with progress bar), fully loaded margin, and dossier trigger.
- **Tab 2: Activity-Based Cost Component Breakdown:** Granular cost breakdown per procedure: Implants, Sterile Supplies, Time-Driven Staff Labor, Anesthesia/Drugs, and Facility Overhead allocation.
- **Tab 3: Breakeven & OR Opportunity Cost Radar:** Breakeven volume vs actual volume analysis, fixed cost absorption, and prime block opportunity cost ranking.
- **Pinned CPT Economic Drilldown Modal:** Complete procedural financial waterfall (Billed -> Net Collections -> Direct Costs -> Contribution Margin -> Overhead -> Net Operating Margin), cost decomposition triad, payer reimbursement spread, and actionable margin playbook.

## Audit / Provenance
- All CPT economic metrics retain `facility_id`, `created_at`, `updated_at`, and calculation formula version metadata.
- Adjustments to wage rates or overhead allocation methodologies log user identity and before/after states.

## QA / Test Cases
1. Validate canonical economic quadrants and benchmark thresholds.
2. Validate deterministic formulas: direct contribution margin, margin percentage, fully loaded net margin, margin per OR-hour, and breakeven volume.
3. Validate facility KPI aggregations across 10 diverse ambulatory surgical procedures.
4. Validate Migration 095 UP and DOWN SQL integrity (tables, views, indexes, RLS).
5. Enforce Maestro Clinical Design System Zero-Purple compliance in JSX and CSS.
6. Verify App.jsx navigation and tab routing.

## Acceptance Criteria
- Build passes (`npm run build`).
- Unit and integration tests pass (`node --test tests/cpt-economics.test.js`).
- Full Module 11 test suite passes without regressions.
- Zero purple/violet tokens in components or stylesheets.
- Clean multi-tenant isolation enforced.

## Dependencies
- Phase 17: CPT Master & Code Normalization
- Phase 91: Case Financial Ledger
- Phase 92: Activity-Based Case Cost Model
- Phase 93A: Contribution Margin Engine
- Phase B5: CPT Intelligence

## Definition of Done
The CPT Economics feature is considered complete when the 14-section specification, PostgreSQL migrations, deterministic calculation engine, Maestro clinical UI, App.jsx wiring, comprehensive test suite, and clean production build have all been executed, verified, and committed to git.

## Implementation Notes
- Migration `095_cpt_economics.sql` and `095_cpt_economics_down.sql` created.
- Deterministic service `src/services/cptEconomicsService.js` and facade wrapper `src/lib/cptEconomicsService.js` created.
- Maestro clinical UI `src/components/CptEconomicsView.jsx` and scoped CSS `src/components/CptEconomicsView.css` created.
- Shell wiring updated in `src/App.jsx`.
- Verified with `node --test tests/cpt-economics.test.js` and `npm run build`.
