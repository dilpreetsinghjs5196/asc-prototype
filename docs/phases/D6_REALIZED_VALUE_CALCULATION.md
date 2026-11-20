# D6 REALIZED VALUE CALCULATION

## Purpose
The Realized Value Calculation Engine is the authoritative economic evaluation and ROI accounting platform for all executed Decision Intelligence recommendations. It goes beyond simple claim reimbursement by computing multi-dimensional value across four distinct economic pillars: **Recovered Revenue** (direct cash flow from appeals and underpayments), **Direct Cost Savings** (vendor discounts and implant price reductions), **Capacity Value** (monetized surgical throughput from released/reallocated OR blocks), and **Avoided Costs** (prevention of timely filing write-offs, compliance penalties, and cancellation expenses). It enforces rigorous net ROI formulas deducting intervention labor costs and provides auditable itemized financial provenance.

## Scope
- Quantify realized economic returns across the Four Value Pillars: Recovered Revenue, Direct Cost Savings, Capacity Value, and Avoided Costs.
- Formulate deterministic calculation models for surgical capacity monetization based on facility-specific Contribution Margin per OR Hour ($\text{CM/OR Hr}$).
- Deduct staff and administrative intervention costs to calculate true **Net Realized Value** and **ROI Multiplier**.
- Prevent double-counting by enforcing mutual exclusivity rules across calculation categories and source transactions.
- Enforce organization and facility multi-tenancy isolation (`facility_id UUID`) and role-based access control.
- Maintain immutable cryptographic SHA-256 calculation provenance hashes linking back to source claims, 835 ERAs, vendor invoices, and OR case schedules.

## Current State
Prior to Phase D6, the system recorded basic gross realized cash receipts in the Decision Ledger (D4) and attributed machine vs. human contributions (D5). However, the system had no multi-pillar value calculation framework. Surgical block releases were tracked solely as schedule changes without monetizing freed capacity; implant carveouts did not separate acquisition savings from recovered claim margins; timely filing appeals did not account for avoided bad-debt write-offs; and no intervention labor costs were subtracted to demonstrate authentic Net ROI.

| Component | Status | Description |
| :--- | :--- | :--- |
| `public.next_best_financial_actions` | **KEEP** | Authoritative financial recommendations catalog established in Phase D0. |
| `public.recommendation_scoring_profiles` | **KEEP** | Mathematical priority scoring profiles established in Phase D1. |
| `public.recommendation_evidence_items` | **KEEP** | Multi-source clinical, contractual, and remittance evidence established in Phase D2. |
| `public.recommendation_approvals` | **KEEP** | Human authorization and dual-key signoffs established in Phase D3. |
| `public.decision_ledger_entries` | **KEEP** | Historical block-chained decision entries established in Phase D4. |
| `public.recommendation_outcomes` | **KEEP** | Causal attribution and counterfactual uplift established in Phase D5. |
| Single-dimensional cash receipt tracking | **REPLACE** | Replace raw cash receipts with the 4-Pillar Economic Value Model (Cash, Savings, Capacity, Avoidance). |
| `public.realized_value_calculations` | **MISSING** | Production table tracking 4-pillar value calculations, labor costs, net value, and ROI multipliers. |
| `public.realized_value_line_items` | **MISSING** | Itemized line-item audit ledger detailing unit rates, quantities, and source record references. |
| Capacity Monetization Engine | **MISSING** | Deterministic calculation monetizing freed OR hours using active facility contribution margin per hour. |
| Realized Value & ROI Workbench UI | **MISSING** | Maestro Clinical interface displaying 4-pillar distribution, net ROI multipliers, and itemization drawers. |

## Target State
In the target state, every executed recommendation is evaluated through an authoritative 4-Pillar Realized Value Engine:
1. **The Four Value Pillars:**
   - **Pillar 1: Recovered Revenue ($\text{RR}$):** Hard cash collected via appeals, secondary crossover claims, patient copay pre-collections, and payer underpayment recovery.
   - **Pillar 2: Direct Cost Savings ($\text{DS}$):** Vendor price dispute recoveries, wholesale implant credits, and preference card tray waste reductions.
   - **Pillar 3: Capacity Value ($\text{CV}$):** Monetized OR time freed from low-utilized blocks and filled with high-margin surgical cases:
     $$\text{Capacity Value} = \text{Hours Freed} \times \text{OR Utilization Fill Rate} \times \text{Facility Contribution Margin Per Hour}$$
   - **Pillar 4: Avoided Costs ($\text{AC}$):** Avoided permanent timely filing write-offs, avoided Florida prompt-pay penalties, and avoided day-of-surgery cancellation expenses.
2. **Gross vs. Net ROI Accounting:**
   - **Gross Realized Value:** $\text{Gross Value} = \text{RR} + \text{DS} + \text{CV} + \text{AC}$.
   - **Net Realized Value:** $\text{Net Value} = \text{Gross Value} - \text{Intervention Labor Cost}$.
   - **ROI Multiplier:** $\text{ROI Multiplier} = \frac{\text{Net Realized Value}}{\text{Intervention Labor Cost}}$ (or gross yield multiplier when labor is negligible).
3. **Itemized Audit Traceability:** Every calculation links to granular line items detailing quantity, unit rate, and foreign key pointers to underlying ERP/EHR artifacts.
4. **Closed-Loop Financial Verification:** Cryptographic SHA-256 calculation hashes prove mathematical consistency and protect against retroactive financial statement revisions.

## Data Model / Schema

### 1. `public.realized_value_calculations`
```sql
CREATE TABLE IF NOT EXISTS public.realized_value_calculations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    action_id UUID REFERENCES public.next_best_financial_actions(id) ON DELETE CASCADE,
    ledger_entry_id UUID REFERENCES public.decision_ledger_entries(id) ON DELETE SET NULL,
    calculation_code VARCHAR(32) NOT NULL UNIQUE,
    action_code VARCHAR(32) NOT NULL,
    category VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    value_pillar VARCHAR(32) NOT NULL CHECK (value_pillar IN (
        'RECOVERED_REVENUE',
        'DIRECT_SAVINGS',
        'CAPACITY_VALUE',
        'AVOIDED_COST'
    )),
    recovered_revenue_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (recovered_revenue_amount >= 0),
    direct_savings_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (direct_savings_amount >= 0),
    capacity_value_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (capacity_value_amount >= 0),
    avoided_cost_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (avoided_cost_amount >= 0),
    gross_realized_value NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    intervention_labor_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (intervention_labor_cost >= 0),
    net_realized_value NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    roi_multiplier NUMERIC(6, 2) NOT NULL DEFAULT 1.00,
    capacity_hours_freed NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    capacity_cm_per_hour NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    avoided_risk_type VARCHAR(64),
    calculation_provenance_hash VARCHAR(64) NOT NULL,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    verified_by_user_id VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rvc_facility ON public.realized_value_calculations(facility_id, value_pillar);
CREATE INDEX IF NOT EXISTS idx_rvc_action ON public.realized_value_calculations(action_id);
CREATE INDEX IF NOT EXISTS idx_rvc_category ON public.realized_value_calculations(category);
CREATE INDEX IF NOT EXISTS idx_rvc_code ON public.realized_value_calculations(calculation_code);
```

### 2. `public.realized_value_line_items`
```sql
CREATE TABLE IF NOT EXISTS public.realized_value_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calculation_id UUID NOT NULL REFERENCES public.realized_value_calculations(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    line_item_name VARCHAR(128) NOT NULL,
    pillar VARCHAR(32) NOT NULL CHECK (pillar IN (
        'RECOVERED_REVENUE',
        'DIRECT_SAVINGS',
        'CAPACITY_VALUE',
        'AVOIDED_COST',
        'INTERVENTION_COST'
    )),
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1.00,
    unit_rate NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    source_table VARCHAR(64),
    source_record_id VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rv_items_calculation ON public.realized_value_line_items(calculation_id);
CREATE INDEX IF NOT EXISTS idx_rv_items_facility ON public.realized_value_line_items(facility_id);
```

### 3. `public.vw_realized_value_telemetry`
```sql
CREATE OR REPLACE VIEW public.vw_realized_value_telemetry AS
SELECT
    facility_id,
    COUNT(id) AS total_calculations_count,
    COALESCE(SUM(gross_realized_value), 0.00) AS total_gross_realized_value,
    COALESCE(SUM(recovered_revenue_amount), 0.00) AS total_recovered_revenue_amount,
    COALESCE(SUM(direct_savings_amount), 0.00) AS total_direct_savings_amount,
    COALESCE(SUM(capacity_value_amount), 0.00) AS total_capacity_value_amount,
    COALESCE(SUM(avoided_cost_amount), 0.00) AS total_avoided_cost_amount,
    COALESCE(SUM(intervention_labor_cost), 0.00) AS total_intervention_labor_cost,
    COALESCE(SUM(net_realized_value), 0.00) AS total_net_realized_value,
    COALESCE(SUM(capacity_hours_freed), 0.00) AS total_capacity_hours_freed,
    CASE 
        WHEN COALESCE(SUM(intervention_labor_cost), 0.00) > 0 
        THEN ROUND((COALESCE(SUM(net_realized_value), 0.00) / SUM(intervention_labor_cost)), 2)
        ELSE ROUND(COALESCE(SUM(gross_realized_value), 0.00) / 1000.0, 2)
    END AS cumulative_roi_multiplier,
    MAX(updated_at) AS latest_calculation_at
FROM public.realized_value_calculations
GROUP BY facility_id;
```

## Business Rules

### 1. The 4-Pillar Value Decomposition & Invariants
Every value calculation entry decomposes into exactly four non-negative pillars:
$$\text{Gross Realized Value} = \text{Recovered Revenue} + \text{Direct Savings} + \text{Capacity Value} + \text{Avoided Cost}$$
- Each dollar attributed must map strictly to one pillar; double-counting between cash recovery and capacity is prohibited.

### 2. Capacity Value Formulation
Capacity value is derived deterministically from operating room throughput economics:
$$\text{Capacity Value} = \text{Hours Freed} \times \text{Fill Rate Pct} \times \text{Contribution Margin Per Hour}$$
- Baseline facility contribution margin for Naples Surgery Center is established at $\$1,975.00$ per OR Hour (consistent with Phase 30 / Contribution Margin Engine).

### 3. Net Realized Value & ROI Multiplier
$$\text{Net Realized Value} = \text{Gross Realized Value} - \text{Intervention Labor Cost}$$
$$\text{ROI Multiplier} = \begin{cases}
\text{Round}\left(\frac{\text{Net Realized Value}}{\text{Intervention Labor Cost}}, 2\right) & \text{if Labor Cost} > 0 \\
\text{Round}\left(\frac{\text{Gross Realized Value}}{100.00}, 2\right) & \text{if Labor Cost} = 0
\end{cases}$$

### 4. Prohibited Behaviors
- **No Negative Pillar Inputs:** Individual pillar amounts cannot be negative. Write-offs or penalties are modeled under Avoided Costs or as negative net outcomes, not negative pillar inputs.
- **No Unaudited Capacity Claims:** Capacity hours freed must be backed by a canceled block release identifier or scheduler log timestamp.

## Permissions / Security
- **Tenancy Boundary:** Strictly enforced by `facility_id UUID`.
- **Role Permissions:**
  - `cfo`, `admin`, `super_admin`: Full access to view financial calculations, configure hourly contribution margin assumptions, execute recalculations, and export certified ROI statements.
  - `financial_controller`, `billing_specialist`: Access to log recovered revenue items and labor hours.
  - `clinical_director`, `materials_manager`: Access to view capacity value metrics, OR block release hours, and implant cost savings.
  - `viewer`: Read-only aggregate telemetry viewing.

## API / Service Requirements

### Backend Services (`realizedValueService.js`)
- `getRealizedValueCalculations(facilityId, filters)`: Retrieves calculations with optional value pillar, category, or search filters.
- `getCalculationById(id)`: Retrieves single calculation with itemized line items and cryptographic provenance.
- `calculateCapacityValue(hoursFreed, fillRatePct, cmPerHour)`: Deterministic capacity monetization formula.
- `calculateNetRealizedValue(grossValue, laborCost)`: Computes net economic impact.
- `calculateRoiMultiplier(netValue, laborCost)`: Computes ROI multiplier.
- `recordRealizedValueCalculation(calculationData, userContext)`: Persists calculation, line items, and provenance hash.
- `getCalculationLineItems(calculationId)`: Returns itemized billing/EHR source rows.
- `getRealizedValueTelemetry(facilityId)`: Computes 4-pillar sums, net value, capacity hours, and cumulative ROI.
- `computeCalculationProvenanceHash(payload)`: Authoritative SHA-256 calculation hash.

## UI / Workflow Requirements
- **Realized Value & ROI Workbench:**
  - **Telemetry Ribbon (5 Cards):**
    1. *Total Gross Realized Value:* Cumulative economic value across all 4 pillars (\$56,310.00).
    2. *Net Value Delivered:* Realized value net of intervention staff costs (\$53,420.00).
    3. *Cumulative ROI Multiplier:* Platform investment return multiple (19.5x ROI).
    4. *Capacity Value Generated:* OR throughput value generated from released hours (\$15,800.00).
    5. *Cost Avoidance & Savings:* Prevented write-offs, penalties, and supply savings (\$6,140.00).
  - **4-Pillar Visual Breakdown Bar:** Interactive segmented visualizer displaying percentage distribution between Recovered Revenue, Capacity Value, Direct Savings, and Avoided Costs.
  - **Calculations Master Table:**
    - Calculation Code & Action Title (e.g. `RVC-2026-001` - Urgent CARC 16 Appeal).
    - Primary Value Pillar Badge (`RECOVERED_REVENUE`, `CAPACITY_VALUE`, `DIRECT_SAVINGS`, `AVOIDED_COST`).
    - Financial Accounting: Gross Realized, Labor Cost, Net Value Delivered.
    - ROI Multiplier Badge (e.g. `24.8x ROI`).
    - Capacity & Risk Metadata: Hours freed or risk prevented.
    - Action Menu: "Inspect Itemization" button.
  - **Interactive Drawer / Modal:**
    - *Itemization & Provenance Inspector Drawer:* Itemized table of source line items (hours, unit rates, source tables, and record IDs), net value waterfall, and SHA-256 provenance hash.

## Audit / Provenance
Every realized value calculation retains:
- `calculation_provenance_hash`: SHA-256 hash computed over calculation code, pillar allocations, labor cost, net value, and timestamp.
- Direct foreign key linkages to Decision Ledger (D4), Action Recommendations (D0), and source claim/block identifiers.

## QA / Test Cases
1. **Telemetry & 4-Pillar Aggregation:** Verify accurate calculation of gross realized value, pillar totals (cash, savings, capacity, avoidance), net value, and cumulative ROI.
2. **Facility UUID Alias Resolution:** Confirm `'00000000-0000-0000-0000-000000000002'` resolves interchangeably with `'fac-naples-01'`.
3. **Deterministic Capacity Value Formula:** Verify mathematical calculation of capacity value from hours, fill rate, and contribution margin per hour.
4. **Gross-to-Net Math Invariant:** Confirm $\text{Net Value} = \text{Gross Value} - \text{Labor Cost}$.
5. **ROI Multiplier Accuracy:** Verify exact calculation of ROI multiplier across positive labor and zero-labor edge cases.
6. **Negative Pillar Input Rejection:** Verify that negative pillar amounts are strictly blocked.
7. **Line Item Detail Retrieval:** Confirm calculations load their itemized breakdown line items.
8. **Record Realized Value Calculation:** Verify creating a new calculation persists data, computes net value, and records SHA-256 hash.
9. **PostgreSQL Migration 113:** Verify UP and DOWN migration idempotency, UUID foreign keys, constraints, and RLS policies.
10. **Zero-Purple Maestro Clinical Token Compliance:** Verify zero prohibited purple tokens across all CSS and JSX files.
11. **Dual Re-export Facade Parity:** Verify `src/lib/realizedValueService.js` re-exports all methods and constants from `src/services/realizedValueService.js`.
12. **App Shell Navigation Wiring:** Verify integration in `src/App.jsx` including sidebar menu item, headers, date filter exclusion, and tab render.

## Acceptance Criteria
- Build passes (`npm run build`).
- Full test suite passes without regressions (`npm test`).
- No mock/placeholder values presented as production truth.
- Tenant isolation strictly verified.
- 4-pillar math and ROI calculations mathematically verified.

## Dependencies
- Upstream: Phase D0 (`next_best_financial_actions`), Phase D1 (`recommendation_scoring_profiles`), Phase D2 (`recommendation_evidence_items`), Phase D3 (`recommendation_approvals`), Phase D4 (`decision_ledger_entries`), Phase D5 (`recommendation_outcomes`).
- PostgreSQL: `pgcrypto` extension for `gen_random_uuid()`.

## Definition of Done
A feature is complete only when the schema migration, authoritative value service, 4-pillar calculations, itemization models, UI view, and automated test suite are fully operational and verified.

## Implementation Notes
- Migration `113_realized_value_calculation.sql` deploys `realized_value_calculations`, `realized_value_line_items`, and `vw_realized_value_telemetry` with RLS.
- Migration `113_realized_value_calculation_down.sql` provides clean rollback capability.
- Client service `realizedValueService.js` and facade `src/lib/realizedValueService.js` authored with comprehensive 4-pillar seeds and line items.
- UI component `RealizedValueCalculationView.jsx` and styling `RealizedValueCalculationView.css` authored following Maestro Clinical design system.
