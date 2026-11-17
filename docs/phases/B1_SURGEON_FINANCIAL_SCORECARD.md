# B1 SURGEON FINANCIAL SCORECARD

## Purpose
Surgeon volume, gross billed charges, contractual adjustments, net collections, direct surgical costs, contribution margin, OR-hour yield, and payer/CPT procedural mix analytics. This specification establishes production-grade financial engineering standards for evaluating surgeon economic performance, identifying procedure-level profitability variances, analyzing payer reimbursement realization, and delivering confidential physician scorecards.

## Scope
- Define production requirements for the Surgeon Financial Scorecard Subsystem within Module 11 (Surgeon & Clinical Intelligence).
- Preserve full backward compatibility with the Surgeon Model (Phase 35), Double-Entry Financial Ledger (Phase 70-74), Contribution Margin per OR-Hour (Phase 75), Claims Ingestion & RCM (Phase 80-83), and Surgeon Intelligence Framework (Phase B0).
- Establish auditable, server-authoritative mathematical formulas for revenue cycle realization, direct surgical cost attribution, contribution margin yield, and procedural profitability.
- Enforce strict organization/facility multi-tenancy and PostgreSQL Row Level Security (RLS).
- Implement role-gated access controls: facility leadership (Executive Director, Administrator, CFO) can view all attending scorecards and facility rankings, while individual attending surgeons can view only their personal scorecard and anonymous peer benchmarks.

## Current State
- **Phase 35 (Surgeon Model):** Provides `public.surgeons` entity with 19 attending surgeons.
- **Phase 70-74 (Case Ledger & Financial Model):** Maintains double-entry transactions and procedural cost models tracking 8 direct cost categories (OR nursing, scrub tech, anesthesia supplies, sterile processing, implants, surgical consumables, and overhead).
- **Phase 75 (Contribution Margin per OR-Hour):** Formulates facility-wide contribution margin per staffed OR-hour ($/OR-hr).
- **Phase 80-83 (Claims & Remittance):** Ingests EDI 837 claims and 835 remittances, capturing gross charges, contractual allowances, and cash payments.
- **Phase B0 (Surgeon Intelligence):** Provides high-level 5-pillar composite scoring and anomaly alerting.
- **Financial Scorecard Gap:** Currently, facility leadership lacks a unified, surgeon-specific financial ledger that correlates operative case hours with true net collections, direct implant/supply consumption, and payer contract realization. Financial reports are aggregated at the facility level, obscuring surgeon-level cost variances and unprofitable procedural outliers.
- **Classification:**
  - Base Surgeon Demographics (`public.surgeons`): **KEEP**.
  - Case Financial Transaction Ledger (`surgeries`, `financial_dictionary`): **KEEP**.
  - General OR Performance Screen (`src/components/CommandCenter.jsx`): **KEEP**.
  - Dedicated Surgeon Financial Scorecard Engine: **MISSING** (Implemented in Phase B1).

## Target State
1. **End-to-End Revenue Cycle Waterfall per Surgeon:**
   - **Gross Billed Charges ($B$):** Total facility charges submitted on Form CMS-1450 / UB-04.
   - **Contractual Adjustments ($A$):** Fee schedule allowances negotiated per payer agreement.
   - **Net Collections ($C$):** Total cash realized from primary payers, secondary payers, and patient responsibility.
   - **Collection Realization Rate ($R_{\text{col}}$):**
     $$R_{\text{col}} = \frac{\text{Net Cash Collections}}{\text{Gross Billed Charges}} \times 100$$
2. **Direct Surgical Cost Accounting (Time-Driven Activity-Based Costing):**
   - **Direct Clinical Labor:** OR circulating nurse and surgical scrub technician time ($/min).
   - **Direct Implant Hardware:** Acquisition invoice cost of all implanted screws, plates, anchors, and prostheses.
   - **Direct Sterile Supplies & Consumables:** Procedural packs, drapes, sutures, and specialized instrumentation.
   - **Sterile Processing:** Decontamination, ultrasonic cleaning, and autoclave sterilization cycles.
   - **Total Direct Case Cost ($D$):** $\sum \text{Direct Expenses}$
3. **Deterministic Economic Margin Yield:**
   - **Net Contribution Margin ($\text{CM}$):**
     $$\text{CM} = \text{Net Cash Collections} - \text{Total Direct Costs}$$
   - **Contribution Margin Ratio ($\text{CM}\%$):**
     $$\text{CM}\% = \frac{\text{Net Contribution Margin}}{\text{Net Cash Collections}} \times 100$$
   - **Contribution Margin per OR-Hour ($\text{CM}_{\text{OR-Hr}}$):**
     $$\text{CM}_{\text{OR-Hr}} = \frac{\text{Net Contribution Margin}}{\text{Total Operative Minutes} / 60}$$
4. **Multi-Payer Portfolio Mix Analysis:**
   - Breakdown of case volume and net collections across 5 payer categories: Commercial PPO/HMO, Medicare ASC, Managed Medicaid, Workers' Compensation, and Self-Pay / Cosmetic.
   - Commercial Payer Concentration Index evaluating financial stability.
5. **CPT Procedural Profitability Ranking:**
   - Granular breakdown of each surgeon's top CPT codes ranked by volume, average surgical duration, average direct cost, and margin yield per OR-hour.
   - Identifies high-margin procedure champions vs negative-margin loss leaders.
6. **Confidential Peer Percentile Benchmarking:**
   - Calculates surgeon percentile ranking ($P_{25}, P_{50}, P_{75}, P_{90}$) across specialty peers within the facility.
7. **Clinical Maestro UI:**
   - 5-Card Financial Ribbon: Total Surgical Cases, Net Cash Collections ($), Total Contribution Margin ($), Avg Margin per OR-Hour ($/hr), Facility Net Realization Rate (%).
   - Interactive Filter Toolbar: Surgeon Selector, Specialty Filter, Horizon Pills (30D, 90D, 180D, 365D, YTD), Realization Benchmark Filter.
   - 3-Tab Analytical Interface:
     1. Surgeon Financial Ledger & Summary
     2. Payer Mix Distribution & Realization Waterfall
     3. CPT Procedural Economics & Cost Structure
   - Pinned Modal: Detailed Surgeon Financial Drill-down & Procedure Variance Report.

## Data Model / Schema

### 1. `surgeon_financial_scorecards`
Master financial ledger recording periodic financial performance per attending surgeon:
- `id` UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `facility_id` UUID NOT NULL REFERENCES `public.facilities(id)` ON DELETE CASCADE
- `surgeon_id` BIGINT NOT NULL REFERENCES `public.surgeons(id)` ON DELETE CASCADE
- `period_type` VARCHAR(16) NOT NULL DEFAULT 'MONTHLY' -- 'MONTHLY', 'QUARTERLY', 'YTD', 'ANNUAL'
- `period_start` DATE NOT NULL
- `period_end` DATE NOT NULL
- `total_cases` INTEGER NOT NULL DEFAULT 0
- `total_or_minutes` INTEGER NOT NULL DEFAULT 0
- `avg_case_minutes` NUMERIC(6, 2) NOT NULL DEFAULT 0.00
- `gross_billed_charges` NUMERIC(12, 2) NOT NULL DEFAULT 0.00
- `contractual_adjustments` NUMERIC(12, 2) NOT NULL DEFAULT 0.00
- `net_collections` NUMERIC(12, 2) NOT NULL DEFAULT 0.00
- `collection_realization_pct` NUMERIC(5, 2) NOT NULL DEFAULT 0.00
- `direct_labor_cost` NUMERIC(12, 2) NOT NULL DEFAULT 0.00
- `direct_implant_cost` NUMERIC(12, 2) NOT NULL DEFAULT 0.00
- `direct_supply_cost` NUMERIC(12, 2) NOT NULL DEFAULT 0.00
- `direct_sterile_processing_cost` NUMERIC(12, 2) NOT NULL DEFAULT 0.00
- `total_direct_cost` NUMERIC(12, 2) NOT NULL DEFAULT 0.00
- `net_contribution_margin` NUMERIC(12, 2) NOT NULL DEFAULT 0.00
- `contribution_margin_pct` NUMERIC(5, 2) NOT NULL DEFAULT 0.00
- `margin_per_or_hour` NUMERIC(10, 2) NOT NULL DEFAULT 0.00
- `facility_percentile_rank` NUMERIC(5, 2) NOT NULL DEFAULT 0.00
- `payer_mix_json` JSONB NOT NULL DEFAULT '{}'::jsonb
- `cpt_mix_json` JSONB NOT NULL DEFAULT '[]'::jsonb
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT `NOW()`
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT `NOW()`
- CONSTRAINT `uq_surgeon_fin_scorecard` UNIQUE (`facility_id`, `surgeon_id`, `period_start`, `period_end`)

### 2. `surgeon_cpt_financial_performance`
Procedural financial performance ledger tracking CPT-level metrics per surgeon:
- `id` UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `facility_id` UUID NOT NULL REFERENCES `public.facilities(id)` ON DELETE CASCADE
- `surgeon_id` BIGINT NOT NULL REFERENCES `public.surgeons(id)` ON DELETE CASCADE
- `cpt_code` VARCHAR(16) NOT NULL
- `cpt_description` VARCHAR(256) NOT NULL
- `case_count` INTEGER NOT NULL DEFAULT 0
- `avg_duration_minutes` NUMERIC(6, 2) NOT NULL DEFAULT 0.00
- `avg_billed_charges` NUMERIC(10, 2) NOT NULL DEFAULT 0.00
- `avg_net_collections` NUMERIC(10, 2) NOT NULL DEFAULT 0.00
- `avg_direct_cost` NUMERIC(10, 2) NOT NULL DEFAULT 0.00
- `avg_contribution_margin` NUMERIC(10, 2) NOT NULL DEFAULT 0.00
- `margin_per_or_hour` NUMERIC(10, 2) NOT NULL DEFAULT 0.00
- `period_start` DATE NOT NULL
- `period_end` DATE NOT NULL
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT `NOW()`

### 3. Analytical Views
- `vw_surgeon_financial_scorecard_summary`: Joins `surgeon_financial_scorecards` with `public.surgeons` to provide real-time dashboard data.
- `vw_surgeon_cpt_profitability_ranking`: Ranks CPT procedural economics by surgeon and specialty.

## Business Rules

### Rule 1: Revenue Cycle Realization Formula
The net collection realization rate is calculated with exact mathematical precision:
$$R_{\text{col}} = \begin{cases} \left(\frac{C}{B}\right) \times 100 & \text{if } B > 0 \\ 0.00 & \text{if } B = 0 \end{cases}$$
Where:
- $B = \text{Gross Billed Charges}$
- $C = \text{Net Cash Collections}$
- Normal commercial benchmark: $65.0\% \le R_{\text{col}} \le 75.0\%$.

### Rule 2: Contribution Margin and Yield Calculation
$$\text{Total Direct Cost} = \text{Labor Cost} + \text{Implant Cost} + \text{Supply Cost} + \text{Sterile Cost}$$
$$\text{Net Contribution Margin} = \text{Net Collections} - \text{Total Direct Cost}$$
$$\text{Margin per OR-Hour} = \begin{cases} \frac{\text{Net Contribution Margin}}{(\text{Total OR Minutes} / 60)} & \text{if Total OR Minutes} > 0 \\ 0.00 & \text{if Total OR Minutes} = 0 \end{cases}$$

### Rule 3: Procedural Outlier & Negative Margin Flagging
If any CPT procedure generates $\text{avg\_contribution\_margin} < \$0.00$, the system automatically flags the procedure as `NEGATIVE_MARGIN_LOSS_LEADER` and triggers a clinical supply and implant review.

### Rule 4: Payer Mix Classification Standards
Payer records are mapped into 5 standardized categories:
1. `COMMERCIAL`: Aetna, Blue Cross Blue Shield, Cigna, UnitedHealthcare, Humana Commercial.
2. `MEDICARE`: Medicare Part B fee-for-service, Medicare Advantage.
3. `MEDICAID`: Florida Medicaid, Managed Medicaid plans.
4. `WORKERS_COMP`: Workers' compensation and commercial occupational health.
5. `SELF_PAY`: Direct patient cash pay, cosmetic elective cases.

### Rule 5: Zero-Purple Maestro Design Token Standard
All JSX and CSS components must strictly adhere to the Maestro Clinical Design System with zero prohibited purple/violet/indigo/magenta/fuchsia tokens.

## Permissions / Security
- `financials.view_surgeon_scorecards_all`: View all surgeon financial scorecards across the facility (CFO, Executive Director, Administrator).
- `financials.view_own_surgeon_scorecard`: Attending surgeons can view only their personal financial metrics and blind specialty percentiles.
- `financials.export_scorecards`: Export executive PDF and Excel financial reports.
- `financials.recalculate_scorecards`: Trigger server-side recalculation of rolling scorecards.
- Multi-tenancy: Strictly isolated via PostgreSQL Row Level Security (`facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid`).

## API / Service Requirements
- `GET /api/v1/intelligence/surgeons/financial-scorecards`: Retrieve financial scorecards for all facility surgeons with period filtering.
- `GET /api/v1/intelligence/surgeons/:id/financial-scorecard`: Retrieve detailed financial breakdown, revenue cycle waterfall, and CPT mix for a specific surgeon.
- `GET /api/v1/intelligence/surgeons/:id/cpt-economics`: Retrieve CPT procedural economics for a specific surgeon.
- `POST /api/v1/intelligence/surgeons/financial-scorecards/recalculate`: Trigger server-side recalculation of financial scorecards from raw case logs.

## UI / Workflow Requirements
- **Maestro Clinical Design System:** Strictly ZERO prohibited purple/violet/indigo/magenta/fuchsia tokens. Palette restricted to Medical Blue (`#0284c7`), Slate (`#0f172a`, `#64748b`), Emerald (`#059669`), Amber (`#d97706`), and Crimson (`#dc2626`).
- **5-Card Financial Ribbon:** Total Surgical Cases, Net Cash Collections ($), Total Contribution Margin ($), Avg Margin per OR-Hour ($/hr), Facility Net Realization Rate (%).
- **Interactive Filter Toolbar:** Surgeon search input, Specialty filter, Performance Tier filter, Horizon pills (`30D`, `90D`, `180D`, `365D`, `YTD`).
- **3-Tab Analytical Views:**
  1. Surgeon Financial Ledger & Summary
  2. Payer Mix Distribution & Realization Waterfall
  3. CPT Procedural Economics & Cost Structure
- **Pinned Flex Column Modals:** Pinned header and footer, scrollable modal body (`overflow-y: auto`), never expanding off-screen.

## Audit / Provenance
All financial calculations record:
- Batch calculation ID, facility ID, calculating user/system process.
- Model formula version (`v1.0.0-financial`).
- Source case transaction count and total billing ledger timestamp.
- Audit history of manual contractual adjustments or fee schedule revisions.

## QA / Test Cases
- Unit tests verifying revenue cycle waterfall math (Gross Billed $\to$ Collections $\to$ Realization %).
- Unit tests verifying direct surgical cost aggregation and contribution margin calculations.
- Unit tests verifying contribution margin per OR-hour formula and division-by-zero protection.
- Unit tests verifying negative margin CPT detection.
- Database migration UP and DOWN tests ensuring PostgreSQL syntax validity, RLS enforcement, and foreign key integrity.
- Maestro design system compliance test verifying ZERO prohibited color tokens in JSX and CSS.
- Application routing verification in `src/App.jsx`.

## Acceptance Criteria
- Build passes (`npm run build` with 0 errors).
- All automated tests pass with 100% success.
- Clean idempotent database migration and rollback SQL (`090_surgeon_financial_scorecard.sql`).
- Attending surgeons cannot view other named surgeons' financial yields.
- Working tree clean and committed to git branch `feature/phase-80-claims-model`.

## Dependencies
- Phase 35: Surgeon Model (`public.surgeons`)
- Phase 70-74: Double-Entry Financial Ledger & Procedural Cost Model
- Phase 75: Contribution Margin per OR-Hour
- Phase 80-83: Claims & Remittance Ingestion
- Phase B0: Surgeon Intelligence Framework

## Definition of Done
A feature is complete only when the authoritative data model, deterministic service layer, automated financial calculations, security RLS policies, clinical UI views, zero-purple design compliance, automated test suites, and documentation are fully delivered and verified.

## Implementation Notes
- **Specification Files Authored:**
  - `e:\medicalAI\ASCANALYST_All_Modules\ASCANALYST_MD_SPECS\Phase_11_Intelligence\B1_SURGEON_FINANCIAL_SCORECARD.md`
  - `docs/phases/B1_SURGEON_FINANCIAL_SCORECARD.md`
- **Database Migrations:**
  - `supabase/migrations/090_surgeon_financial_scorecard.sql`
  - `supabase/migrations/090_surgeon_financial_scorecard_down.sql`
- **Service Layer:**
  - `src/services/surgeonFinancialScorecardService.js`
  - `src/lib/surgeonFinancialScorecardService.js`
- **Clinical UI & Scoped CSS:**
  - `src/components/SurgeonFinancialScorecardView.jsx`
  - `src/components/SurgeonFinancialScorecardView.css`
- **Application Wiring:**
  - `src/App.jsx`
- **Test Automation:**
  - `tests/surgeon-financial-scorecard.test.js`
