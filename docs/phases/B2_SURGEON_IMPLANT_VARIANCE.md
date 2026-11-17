# B2 SURGEON IMPLANT VARIANCE

## Purpose
Surgeon implant and vendor cost variance analytics, construct standardization opportunities, sterile waste quantification, and preference card harmonization. This specification establishes production-grade clinical supply chain engineering standards for identifying physician-level implant expenditure disparities across identical CPT procedures, modeling contracted construct substitution savings, and delivering auditable clinical evidence to surgeons and materials management.

## Scope
- Define production requirements for the Surgeon Implant Variance Subsystem within Module 11 (Surgeon & Clinical Intelligence).
- Preserve full backward compatibility with the Surgeon Model (Phase 35), Implant Category & Component Model (Phase 51), CPT-to-Implant Mapping (Phase 52), Implant Vendor Master (Phase 53), Product SKU Model (Phase 54), Facility Vendor Contracts (Phase 56), Surgeon Preference Cards (Phase 58), Case Implant Usage (Phase 59), and Surgeon Financial Scorecards (Phase B1).
- Establish auditable, server-authoritative mathematical formulas for procedure-level implant cost variance against specialty peer medians, unit cost deltas, total excess spend, and realizable savings opportunities.
- Enforce strict organization/facility multi-tenancy and PostgreSQL Row Level Security (RLS).
- Enable confidential physician engagement through objective peer comparisons without compromising physician-facility partnership.

## Current State
- **Phase 35 (Surgeon Model):** Maintains attending surgeons in `public.surgeons`.
- **Phase 50-57 (Implant Master & Vendor Contracts):** Catalogs implant categories, product SKUs, contracted acquisition costs, and vendor pricing matrices.
- **Phase 58 (Surgeon Preference Cards):** Stores physician preference cards specifying standard surgical trays, open items, and hold items.
- **Phase 59 (Case Implant Usage):** Records actual OR implant consumption, lot numbers, serial numbers, and barcode scans.
- **Phase 97 (Implant Carveout Detection):** Audits insurance carveout underpayments for device-intensive procedures.
- **Phase B0 & B1 (Surgeon Intelligence & Financial Scorecards):** Evaluates overall surgeon margin yield and high-level supply cost variance.
- **Implant Variance Gap:** Currently, surgery center materials managers lack automated, procedural-level visibility into why two surgeons performing the exact same CPT code (e.g. CPT 27447 Total Knee or CPT 29827 Rotator Cuff) exhibit an implant cost variance of $1,200+ per case. Schedulers and supply chain coordinators assemble preference cards manually, unable to identify when a surgeon's loyalty to off-contract vendors or excessive "open" staging creates unrecoverable facility expense.
- **Classification:**
  - Vendor & SKU Master (`implant_vendors`, `implant_skus`): **KEEP**.
  - Preference Cards & Case Usage (`surgeon_preference_cards`, `case_implant_usage`): **KEEP**.
  - General Supply Screen (`src/components/CommandCenter.jsx`): **KEEP**.
  - Surgeon Implant Variance & Savings Optimization Engine: **MISSING** (Implemented in Phase B2).

## Target State
1. **Procedural Implant Cost Variance Modeling:**
   - Evaluates actual implant consumption per surgeon for each CPT procedure against:
     - **Specialty Peer Median Cost ($\tilde{C}_{\text{peer}}$):** The median implant cost incurred by all facility surgeons performing that CPT over the rolling period.
     - **Facility Contract Target Cost ($C_{\text{contract}}$):** The baseline cost achievable using contracted Tier-1 vendor pricing.
   - Calculates **Unit Cost Variance ($\Delta C$):**
     $$\Delta C = C_{\text{surgeon}} - \tilde{C}_{\text{peer}}$$
   - Calculates **Variance Percentage ($V\%$):**
     $$V\% = \left(\frac{C_{\text{surgeon}} - \tilde{C}_{\text{peer}}}{\tilde{C}_{\text{peer}}}\right) \times 100$$
2. **Total Excess Spend & Realizable Savings Engine:**
   - **Total Excess Spend ($E_{\text{spend}}$):**
     $$E_{\text{spend}} = \max\left(0, \Delta C \times N_{\text{cases}}\right)$$
   - **Realizable Savings Opportunity ($S_{\text{opp}}$):**
     $$S_{\text{opp}} = \sum_{\text{cases}} \left(C_{\text{surgeon}} - C_{\text{substitute}}\right)$$
     Where $C_{\text{substitute}}$ represents the clinically equivalent construct from the facility's contracted Tier-1 formulary.
3. **Surgeon Sterile Waste & Hold-Item Staging Audit:**
   - Measures opened-but-unused implants staged on preference cards that cannot be resterilized or returned.
   - Calculates **Waste Rate Percentage ($W\%$):**
     $$W\% = \left(\frac{\text{Wasted Implant Cost}}{\text{Total Staged Implant Cost}}\right) \times 100$$
   - Flags surgeons with $W\% > 3.0\%$ for preference card "OPEN" vs "HOLD" reclassification.
4. **Vendor Loyalty & Sourcing Concentration:**
   - Maps each surgeon's procedural volume and total spend across device manufacturers (Arthrex, Stryker, Zimmer Biomet, DePuy Synthes, Smith & Nephew, Alcon).
   - Identifies off-contract procurement and quantifies missed manufacturer volume tier rebates.
5. **Actionable Preference Card Harmonization Recommendations:**
   - Provides specific, itemized SKU substitution guidance (e.g., "Switch 5.5mm PEEK Suture Anchor from Vendor A ($485) to Contracted Bio-Composite Anchor from Vendor B ($295), saving $190/anchor across 24 annual cases = $4,560 net savings").
6. **Clinical Maestro UI:**
   - 5-Card Operational Ribbon: Evaluated Surgical Procedures, Center Implant Spend ($), Total Excess Variance ($), Potential Realizable Savings ($), Avg Waste Rate (%).
   - Interactive Filter Toolbar: Surgeon Selector, Specialty Filter, Variance Status Filter (All, Outliers >20%, Moderate 5-20%, Efficient ±5%), Horizon Pills (`30D`, `90D`, `180D`, `365D`, `YTD`).
   - 3-Tab Operational Interface:
     1. Surgeon Procedure Implant Variance Matrix
     2. Construct Standardization & Savings Opportunities
     3. Vendor Market Share & Waste Audit
   - Pinned Modal: Itemized Construct Comparison & Preference Card Harmonization Plan.

## Data Model / Schema

### 1. `surgeon_implant_variances`
Master ledger recording procedure-level implant expenditure and variance per attending surgeon:
- `id` UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `facility_id` UUID NOT NULL REFERENCES `public.facilities(id)` ON DELETE CASCADE
- `surgeon_id` BIGINT NOT NULL REFERENCES `public.surgeons(id)` ON DELETE CASCADE
- `cpt_code` VARCHAR(16) NOT NULL
- `procedure_name` VARCHAR(256) NOT NULL
- `specialty_code` VARCHAR(64) NOT NULL
- `evaluation_period_start` DATE NOT NULL
- `evaluation_period_end` DATE NOT NULL
- `case_count` INTEGER NOT NULL DEFAULT 0
- `surgeon_avg_implant_cost` NUMERIC(10, 2) NOT NULL DEFAULT 0.00
- `peer_median_implant_cost` NUMERIC(10, 2) NOT NULL DEFAULT 0.00
- `contract_baseline_cost` NUMERIC(10, 2) NOT NULL DEFAULT 0.00
- `unit_cost_variance` NUMERIC(10, 2) NOT NULL DEFAULT 0.00
- `variance_pct` NUMERIC(6, 2) NOT NULL DEFAULT 0.00
- `total_excess_spend` NUMERIC(12, 2) NOT NULL DEFAULT 0.00
- `primary_vendor_id` UUID REFERENCES `public.implant_vendors(id)` ON DELETE SET NULL
- `primary_vendor_name` VARCHAR(128) NOT NULL
- `primary_construct_name` VARCHAR(256) NOT NULL
- `recommended_substitute_construct` VARCHAR(256)
- `potential_unit_savings` NUMERIC(10, 2) NOT NULL DEFAULT 0.00
- `potential_total_savings` NUMERIC(12, 2) NOT NULL DEFAULT 0.00
- `waste_rate_pct` NUMERIC(5, 2) NOT NULL DEFAULT 0.00
- `waste_cost_total` NUMERIC(10, 2) NOT NULL DEFAULT 0.00
- `variance_status` VARCHAR(32) NOT NULL DEFAULT 'EFFICIENT' -- 'EFFICIENT', 'MODERATE_VARIANCE', 'HIGH_VARIANCE_OUTLIER'
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT `NOW()`
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT `NOW()`
- CONSTRAINT `uq_surgeon_implant_variance` UNIQUE (`facility_id`, `surgeon_id`, `cpt_code`, `evaluation_period_start`, `evaluation_period_end`)

### 2. `surgeon_vendor_loyalty_metrics`
Tracks vendor procurement share and contract tier alignment per surgeon:
- `id` UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `facility_id` UUID NOT NULL REFERENCES `public.facilities(id)` ON DELETE CASCADE
- `surgeon_id` BIGINT NOT NULL REFERENCES `public.surgeons(id)` ON DELETE CASCADE
- `vendor_id` UUID REFERENCES `public.implant_vendors(id)` ON DELETE SET NULL
- `vendor_name` VARCHAR(128) NOT NULL
- `specialty_code` VARCHAR(64) NOT NULL
- `case_count` INTEGER NOT NULL DEFAULT 0
- `total_spend` NUMERIC(12, 2) NOT NULL DEFAULT 0.00
- `spend_share_pct` NUMERIC(5, 2) NOT NULL DEFAULT 0.00
- `is_contracted_tier1` BOOLEAN NOT NULL DEFAULT TRUE
- `rebate_eligible` BOOLEAN NOT NULL DEFAULT FALSE
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT `NOW()`

### 3. Analytical Views
- `vw_surgeon_implant_variance_summary`: Joins `surgeon_implant_variances` with `public.surgeons` to provide real-time dashboard variance metrics.
- `vw_facility_implant_savings_opportunities`: Ranks savings opportunities by total realizable dollar impact.

## Business Rules

### Rule 1: Variance Status Classification
The variance status for any surgeon-CPT combination is classified based on percentage deviation from the specialty peer median:
$$\text{Status} = \begin{cases} \text{EFFICIENT} & \text{if } V\% \le 5.0\% \\ \text{MODERATE\_VARIANCE} & \text{if } 5.0\% < V\% < 20.0\% \\ \text{HIGH\_VARIANCE\_OUTLIER} & \text{if } V\% \ge 20.0\% \end{cases}$$

### Rule 2: Minimum Case Volume Filter
A surgeon must have completed at least $\ge 3$ cases for a specific CPT within the evaluation window to establish statistical significance. For CPTs with $< 3$ cases, the variance is marked `INSUFFICIENT_VOLUME` to prevent outlier distortion.

### Rule 3: Construct Substitution Savings Math
$$\text{Potential Unit Savings} = \max\left(0, \text{Surgeon Avg Implant Cost} - \text{Contract Baseline Cost}\right)$$
$$\text{Potential Total Savings} = \text{Potential Unit Savings} \times \text{Case Count}$$

### Rule 4: Sterile Waste Flagging
If $\text{waste\_rate\_pct} > 3.0\%$ or $\text{waste\_cost\_total} > \$500.00$, the system automatically generates an action flag: `EXCESS_STERILE_WASTE_REVIEW` and recommends converting secondary backup implants from "OPEN" to "HOLD" status on the surgeon's preference card.

### Rule 5: Zero-Purple Maestro Design Token Standard
All JSX and CSS components must strictly adhere to the Maestro Clinical Design System with zero prohibited purple/violet/indigo/magenta/fuchsia tokens.

## Permissions / Security
- `supply_chain.view_implant_variance`: View aggregate implant variances, savings opportunities, and vendor loyalty metrics.
- `supply_chain.view_surgeon_variance_drilldown`: View detailed SKU-level construct pricing and surgeon comparisons (CFO, Materials Manager, Executive Director).
- `supply_chain.manage_substitutions`: Approve construct substitutions and update surgeon preference cards.
- Multi-tenancy: Strictly isolated via PostgreSQL Row Level Security (`facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid`).

## API / Service Requirements
- `GET /api/v1/intelligence/surgeons/implant-variance`: Retrieve procedure-level implant variances across all facility surgeons.
- `GET /api/v1/intelligence/surgeons/:id/implant-variance`: Retrieve detailed implant variance and construct comparisons for a specific surgeon.
- `GET /api/v1/intelligence/surgeons/savings-opportunities`: Retrieve facility-wide ranked implant standardization savings opportunities.
- `POST /api/v1/intelligence/surgeons/preference-cards/harmonize`: Commit construct substitutions into the Phase 58 preference card system.

## UI / Workflow Requirements
- **Maestro Clinical Design System:** Strictly ZERO prohibited purple/violet/indigo/magenta/fuchsia tokens. Palette restricted to Medical Blue (`#0284c7`), Slate (`#0f172a`, `#64748b`), Emerald (`#059669`), Amber (`#d97706`), and Crimson (`#dc2626`).
- **5-Card Operational Ribbon:** Evaluated Procedures, Total Implant Spend ($), Total Excess Spend ($), Realizable Savings ($), Avg Sterile Waste (%).
- **Interactive Filter Toolbar:** Surgeon search input, Specialty filter, Variance Status filter, Horizon pills (`30D`, `90D`, `180D`, `365D`, `YTD`).
- **3-Tab Operational Interface:**
  1. Surgeon Procedure Implant Variance Matrix
  2. Construct Standardization & Savings Opportunities
  3. Vendor Market Share & Waste Audit
- **Pinned Flex Column Modals:** Pinned header and footer, scrollable modal body (`overflow-y: auto`), never expanding off-screen.

## Audit / Provenance
All calculations record:
- Batch calculation ID, facility ID, calculating user/system process.
- Pricing contract version ID, master SKU fee schedule date.
- Input case count and total evaluated implant units.
- Preference card amendment audit history with before/after SKU mappings.

## QA / Test Cases
- Unit tests verifying unit cost variance and percentage formulas.
- Unit tests verifying total excess spend and realizable savings math.
- Unit tests validating variance status tiering (`EFFICIENT`, `MODERATE_VARIANCE`, `HIGH_VARIANCE_OUTLIER`).
- Unit tests verifying sterile waste threshold detection (> 3%).
- Database migration UP and DOWN tests ensuring PostgreSQL syntax validity, RLS enforcement, and foreign key integrity.
- Maestro design system compliance test verifying ZERO prohibited color tokens in JSX and CSS.
- Application routing verification in `src/App.jsx`.

## Acceptance Criteria
- Build passes (`npm run build` with 0 errors).
- All automated tests pass with 100% success.
- Clean idempotent database migration and rollback SQL (`091_surgeon_implant_variance.sql`).
- All calculations are reproducible from case implant usage records.
- Working tree clean and committed to git branch `feature/phase-80-claims-model`.

## Dependencies
- Phase 35: Surgeon Model (`public.surgeons`)
- Phase 51-54: Implant Taxonomy, SKUs & Vendor Master
- Phase 56: Facility Vendor Contracts
- Phase 58: Surgeon Preference Cards
- Phase 59: Case Implant Usage
- Phase B1: Surgeon Financial Scorecards

## Definition of Done
A feature is complete only when the authoritative data model, deterministic service layer, automated variance calculations, security RLS policies, clinical UI views, zero-purple design compliance, automated test suites, and documentation are fully delivered and verified.

## Implementation Notes
- **Specification Files Authored:**
  - `e:\medicalAI\ASCANALYST_All_Modules\ASCANALYST_MD_SPECS\Phase_11_Intelligence\B2_SURGEON_IMPLANT_VARIANCE.md`
  - `docs/phases/B2_SURGEON_IMPLANT_VARIANCE.md`
- **Database Migrations:**
  - `supabase/migrations/091_surgeon_implant_variance.sql`
  - `supabase/migrations/091_surgeon_implant_variance_down.sql`
- **Service Layer:**
  - `src/services/surgeonImplantVarianceService.js`
  - `src/lib/surgeonImplantVarianceService.js`
- **Clinical UI & Scoped CSS:**
  - `src/components/SurgeonImplantVarianceView.jsx`
  - `src/components/SurgeonImplantVarianceView.css`
- **Application Wiring:**
  - `src/App.jsx`
- **Test Automation:**
  - `tests/surgeon-implant-variance.test.js`
