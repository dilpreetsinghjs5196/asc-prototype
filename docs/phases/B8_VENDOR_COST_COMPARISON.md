# B8 VENDOR COST COMPARISON

## Purpose
Vendor and product price comparisons by implant construct, CPT procedure, attending surgeon, and surgical facility. This specification defines production standards for surgical supply chain intelligence across ambulatory surgical center (ASC) procurement channels. It establishes deterministic, auditable models for cross-vendor unit price variance, contract price compliance audits, rebate-adjusted net acquisition costs, physician-specific vendor preference spreads, and construct standardization savings opportunities.

## Scope
- Define production requirements for the Vendor Cost Comparison Subsystem within Module 11 (Surgeon & Clinical Intelligence / Supply Chain & Materials Management).
- Preserve full backward compatibility with Implant Master (Phase 50-57), CPT-to-Implant Mapping (Phase 52), Facility Vendor Contracts (Phase 56), Case Implant Usage (Phase 59), Case Financial Ledger (Phase 91), Surgeon Implant Variance (Phase B2), CPT Intelligence (Phase B5), and CPT Economics (Phase B6).
- Use deterministic, server-authoritative calculations for unit price variance, price variance percentages, potential standardization savings, contract compliance rates, effective net acquisition prices, and vendor value grading.
- Enforce strict organization/facility multi-tenancy and PostgreSQL Row Level Security (RLS) with `app.current_facility_id`.
- Support Role-Based Access Control (RBAC): Surgery Center Administrators, Chief Financial Officers, Materials Managers, Purchasing Directors, and Clinical Service Chiefs can benchmark manufacturer pricing, eliminate rogue off-contract spend, and negotiate competitive committed-volume vendor tiers.

## Current State
- **Phase 50-57 (Implant & Vendor Master):** Stores manufacturers in `public.implant_vendors`, catalog SKUs in `public.implant_skus`, and contracted price schedules in `public.facility_vendor_contracts`.
- **Phase 58-59 (Preference Cards & Case Usage):** Captures surgical preference card staging and actual case-level implant barcode scans and invoices.
- **Phase 97 (Implant Carveout Detection):** Audits payer reimbursement carveouts for device-intensive procedural claims.
- **Phase B2 (Surgeon Implant Variance):** Compares individual surgeon implant spending against facility specialty peer medians.
- **Vendor Cost Comparison Gap:** While surgeon-level variance and raw catalog tables exist, materials managers and administrators lack an integrated, cross-vendor price comparison engine. Facilities are unable to view head-to-head price spreads between competing vendors (e.g., Stryker vs Zimmer Biomet on primary total knee constructs, or Arthrex vs Smith & Nephew on suture anchors) for the exact same clinical indication. Furthermore, leadership cannot easily audit whether invoices match contracted discount tiers or quantify the institutional savings achievable by transitioning high-volume surgeons from off-contract suppliers to contracted Tier-1 vendors.
- **Classification:**
  - Vendor & SKU Catalogs (`implant_vendors`, `implant_skus`): **KEEP**.
  - Case Implant Usage Logs (`case_implant_usage`): **KEEP**.
  - Surgeon Peer Variance (`surgeon_implant_variance`): **KEEP**.
  - Dedicated Multi-Dimensional Vendor Cost Comparison Subsystem: **MISSING** (Implemented in Phase B8).

## Target State
1. **Multi-Dimensional Cross-Vendor Pricing Architecture:**
   - Every evaluated implant construct is benchmarked across 4 comparative dimensions:
     1. **By Implant Construct / Category:** Cross-vendor comparison of clinically equivalent constructs (e.g., Posterior Stabilized TKA Construct, Double-Row Rotator Cuff Repair Construct, Stand-Alone ACDF Cervical Cage).
     2. **By CPT Code:** Direct procedural cost comparison across all manufacturer systems utilized for that CPT (e.g., CPT 27447, CPT 29827, CPT 66984, CPT 22551).
     3. **By Surgeon:** Analysis of physician brand loyalty, showing each surgeon's preferred vendor, average construct acquisition cost, and delta against the facility's lowest contracted alternative.
     4. **By Facility / Sister Centers:** Multi-facility enterprise price parity audits to leverage collective purchasing volume across network surgery centers.

2. **Deterministic Mathematical Formulas:**
   - **Average Construct Acquisition Cost ($AC_{\text{vendor}}$):**
     $$AC_{\text{vendor}} = \frac{1}{N_{\text{cases}}} \sum_{i=1}^{N_{\text{cases}}} \text{Cost}_{\text{construct}, i}$$
   - **Unit Price Variance vs Facility Benchmark ($\Delta P$):**
     $$\Delta P = AC_{\text{vendor}} - AC_{\text{benchmark}}$$
     Where $AC_{\text{benchmark}}$ represents the facility's lowest contracted Tier-1 construct cost for that clinical category.
   - **Price Variance Percentage ($PV\%$):**
     $$PV\% = \left(\frac{AC_{\text{vendor}} - AC_{\text{benchmark}}}{AC_{\text{benchmark}}}\right) \times 100$$
   - **Total Annual Vendor Spend ($S_{\text{vendor}}$):**
     $$S_{\text{vendor}} = \sum (\text{Unit Invoice Price} \times \text{Units Consumed})$$
   - **Potential Standardization Savings ($S_{\text{standardize}}$):**
     $$S_{\text{standardize}} = \sum_{\text{cases}} \max(0, AC_{\text{vendor}} - AC_{\text{target\_contract}})$$
   - **Contract Price Compliance Rate ($CPCR\%$):**
     Percentage of paid invoices matching or beating contracted price tier:
     $$CPCR\% = \left(\frac{N_{\text{compliant\_invoices}}}{N_{\text{total\_invoices}}}\right) \times 100$$
   - **Effective Net Acquisition Price ($P_{\text{net}}$):**
     Invoice acquisition price adjusted for earned manufacturer volume rebate:
     $$P_{\text{net}} = P_{\text{invoice}} - \text{RebatePerUnit}$$

3. **Vendor Value Classification Grades:**
   - `TIER_1_PREFERRED`: Lowest net construct cost, $\ge 95\%$ contract price compliance, volume rebate integration, primary facility formulary.
   - `COMPETITIVE_STANDARD`: Standard contracted pricing, $85\text{--}94\%$ compliance, moderate cost variance ($\le 10\%$).
   - `COST_DISADVANTAGE`: Premium pricing ($10.1\text{--}25\%$ above benchmark), minimal rebate yields, or refusal of consignment terms.
   - `OFF_CONTRACT_EXPENSIVE`: Off-contract rogue procurement, $> 25\%$ premium above benchmark, zero contractual warranty or price protection.

4. **Construct Standardization & Price Matching Intelligence:**
   - Generates actionable supplier renegotiation signals:
     - Identifies when Vendor B charges $\$1,850$ for an implant construct that Vendor A supplies at $\$1,420$.
     - Recommends vendor price-matching targets based on volume commitment concessions.
     - Quantifies the financial impact of standardizing preference cards across attending orthopedic, spine, and ophthalmology surgeons.

## Data Model / Schema
PostgreSQL migration `097_vendor_cost_comparison.sql` establishes:
1. `public.vendor_cost_comparison_metrics`:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE`
   - `construct_category VARCHAR(64) NOT NULL` -- 'TOTAL_KNEE', 'ROTATOR_CUFF', 'CATARACT_IOL', 'ACDF_SPINE', etc.
   - `cpt_code VARCHAR(16) NOT NULL`
   - `procedure_name VARCHAR(256) NOT NULL`
   - `specialty VARCHAR(64) NOT NULL`
   - `vendor_code VARCHAR(64) NOT NULL`
   - `vendor_name VARCHAR(256) NOT NULL`
   - `annual_case_volume INTEGER NOT NULL DEFAULT 0`
   - `avg_construct_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `facility_benchmark_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `cost_variance_dollars NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `cost_variance_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00`
   - `annual_spend_dollars NUMERIC(12, 2) NOT NULL DEFAULT 0.00`
   - `potential_savings_dollars NUMERIC(12, 2) NOT NULL DEFAULT 0.00`
   - `contract_compliance_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00`
   - `rebate_yield_per_unit NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `effective_net_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `is_contracted BOOLEAN NOT NULL DEFAULT true`
   - `value_grade VARCHAR(32) NOT NULL DEFAULT 'COMPETITIVE_STANDARD'`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `CONSTRAINT uq_vendor_cost_facility_construct UNIQUE (facility_id, cpt_code, vendor_code)`
2. `public.vendor_product_sku_pricing`:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE`
   - `sku_code VARCHAR(64) NOT NULL`
   - `product_name VARCHAR(256) NOT NULL`
   - `construct_category VARCHAR(64) NOT NULL`
   - `vendor_code VARCHAR(64) NOT NULL`
   - `vendor_name VARCHAR(256) NOT NULL`
   - `list_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `contracted_tier_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `actual_invoice_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `invoice_variance_dollars NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `annual_units_used INTEGER NOT NULL DEFAULT 0`
   - `is_consignment BOOLEAN NOT NULL DEFAULT false`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
3. `public.surgeon_vendor_preferences`:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE`
   - `surgeon_id BIGINT NOT NULL`
   - `surgeon_name VARCHAR(128) NOT NULL`
   - `cpt_code VARCHAR(16) NOT NULL`
   - `primary_vendor_code VARCHAR(64) NOT NULL`
   - `primary_vendor_name VARCHAR(256) NOT NULL`
   - `vendor_volume_share_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00`
   - `avg_surgeon_construct_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `facility_tier1_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `excess_spend_per_case NUMERIC(10, 2) NOT NULL DEFAULT 0.00`
   - `potential_annual_savings NUMERIC(12, 2) NOT NULL DEFAULT 0.00`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
4. `public.vw_vendor_cost_variance_summary`:
   - Aggregates multi-vendor price spreads and total savings opportunities by construct category.
5. `public.vw_vendor_contract_compliance_radar`:
   - Tracks invoice price creep where actual billed amounts exceed contracted pricing tiers.
6. Multi-Tenant RLS policies enforcing `facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID`.

## Business Rules
1. **Zero Negative Costs:** Acquisition costs, benchmark prices, and unit quantities must be non-negative.
2. **Benchmark Integrity:** The facility benchmark cost for any construct category is defined as the minimum contracted Tier-1 price among approved formulary vendors.
3. **Clamping & Compliance:** Contract compliance percentage is bounded between $0.00\%$ and $100.00\%$.
4. **Deterministic Value Grading:**
   - If `is_contracted === false` OR `cost_variance_pct > 25.0` $\rightarrow$ `OFF_CONTRACT_EXPENSIVE`.
   - Else if `cost_variance_pct > 10.0` OR `contract_compliance_rate_pct < 85.0` $\rightarrow$ `COST_DISADVANTAGE`.
   - Else if `cost_variance_pct <= 2.0` AND `contract_compliance_rate_pct >= 95.0` $\rightarrow$ `TIER_1_PREFERRED`.
   - Else $\rightarrow$ `COMPETITIVE_STANDARD`.
5. **Authoritative Calculation:** All financial sums and variances run server-side or in verified pure services; UI components never mock numbers.
6. **Multi-Tenancy:** Cross-facility data leakage is strictly prohibited.

## Permissions / Security
- `materials:view`: Inspect vendor prices, construct comparisons, and surgeon brand loyalties.
- `materials:contract_edit`: Update contracted tier prices, rebate agreements, and benchmark thresholds.
- `materials:export`: Export cross-vendor comparison sheets and SKU audits for contract negotiations.
- RLS Policy: Direct tenant segregation on `vendor_cost_comparison_metrics`, `vendor_product_sku_pricing`, and `surgeon_vendor_preferences`.

## API / Service Requirements
- Service module: `src/services/vendorCostComparisonService.js`
- Exported functions:
  - `calculateUnitCostVariance(actualPrice, benchmarkPrice)`
  - `calculatePriceVariancePct(actualPrice, benchmarkPrice)`
  - `calculatePotentialSavings(currentPrice, targetPrice, volume)`
  - `calculateContractComplianceRate(compliantInvoices, totalInvoices)`
  - `calculateEffectiveNetPrice(invoicePrice, rebatePerUnit)`
  - `classifyVendorValueGrade(costVariancePct, complianceRate, isContracted)`
  - `calculateFacilityVendorKpis(comparisonList)`
- Facade export wrapper: `src/lib/vendorCostComparisonService.js`.

## UI / Workflow Requirements
- **Top 5-Card Metric Ribbon:**
  1. *Total Implant Spend:* Total facility annualized procurement spend across all vendors.
  2. *Standardization Savings:* Total realizable annual savings through construct standardization or price matching.
  3. *Max Vendor Price Spread:* Widest percentage price discrepancy between competing vendors for identical constructs.
  4. *Off-Contract Leakage:* Total dollar spend incurred with non-contracted or off-formulary vendors.
  5. *Evaluated Constructs:* Total unique construct categories and tracked SKUs.
- **Three Core Analytical Tabs:**
  1. *Tab 1: Construct & CPT Cross-Vendor Pricing Matrix:* Side-by-side comparative table with specialty/vendor filters, search, benchmark cost, price variance %, value grade, and dossier trigger.
  2. *Tab 2: Surgeon Sourcing & Loyalty Comparison:* Physician-level vendor allocation table displaying primary brand loyalty, case volume share %, cost per case, and construct substitution savings.
  3. *Tab 3: SKU Catalog & Contract Price Audit:* Itemized SKU-level price comparison comparing list price, contracted tier price, and actual invoice price to detect invoice price creep.
- **Pinned Vendor Cost Dossier Modal:**
  - Detailed side-by-side comparison between competing manufacturers for a selected construct (e.g. Total Knee Arthroplasty Construct: Stryker vs Zimmer Biomet vs DePuy Synthes).
  - Component breakdown (femoral, tibial, poly, patella).
  - Action buttons: "Export Price Negotiation Dossier", "Initiate RFP Price Match", and "Close Dossier".
- **Design System Standards:**
  - Scoped CSS prefix: `vcc-`
  - Responsive ribbon grid: `repeat(auto-fit, minmax(190px, 1fr))` on `< 1300px`, `repeat(5, minmax(0, 1fr))` on `≥ 1300px`.
  - Zero-Purple strict clinical palette (Emerald, Sky Blue, Amber, Crimson, Slate).

## Audit / Provenance
- All modifications to contract prices, vendor discount tiers, or preference card mappings log user identity, timestamp, before/after values, and facility tenant ID.
- SKU invoice records maintain full provenance linking to accounts payable purchase orders and EDI 810 invoices.

## QA / Test Cases
- Deterministic calculation tests: division by zero guards, boundary checks for variances, savings, and compliance rates.
- Value grade classification tests: all 4 grades thoroughly asserted.
- Facility KPI aggregation tests: sum and average calculations across heterogeneous vendor portfolios.
- Migration tests: verifying DDL tables, indexes, views, and RLS policies.
- UI styling and Zero-Purple compliance tests: static analysis verifying absence of prohibited tokens.
- Integration tests: verify `App.jsx` wiring and facade wrapper exports.

## Acceptance Criteria
- [x] All 14 specification sections defined.
- [x] Database migrations `097_vendor_cost_comparison.sql` and `097_vendor_cost_comparison_down.sql` created.
- [x] Backend service `src/services/vendorCostComparisonService.js` and lib wrapper created.
- [x] Clinical UI component `src/components/VendorCostComparisonView.jsx` and scoped CSS created.
- [x] App shell navigation and tab mounting configured in `src/App.jsx`.
- [x] Comprehensive test suite `tests/vendor-cost-comparison.test.js` passing.
- [x] All Module 11 test suites passing together.
- [x] Clean `npm run build` with zero errors.

## Dependencies
- Upstream: Phase 50-57 (Implant & Vendor Master), Phase 56 (Vendor Contracts), Phase 59 (Case Usage), Phase B2 (Surgeon Implant Variance), Phase B5 (CPT Intelligence), Phase B6 (CPT Economics).
- Downstream: Phase B9 (Supply Chain Contract Renegotiation Workqueue).

## Definition of Done
The phase is considered complete when the migration scripts, deterministic service layer, interactive clinical UI component, scoped styles, app shell routing, and test suites are committed and verified with zero build regressions.

## Implementation Notes
- Migration `097_vendor_cost_comparison.sql` establishes 3 tables, 2 analytical views, and RLS policies.
- Migration `097_vendor_cost_comparison_down.sql` provides clean rollback.
- Service `vendorCostComparisonService.js` provides 10 real-world surgical constructs across Orthopedics, Spine, Sports Medicine, Ophthalmology, and ENT with competing vendor options and SKU breakdowns.
- UI component adheres strictly to Maestro Clinical Design System with zero purple tokens.
