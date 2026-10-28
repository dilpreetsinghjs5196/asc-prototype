# 57 FACILITY IMPLANT PRICING - MASTER ARCHITECTURE SPECIFICATION & AUDIT REPORT

**Document Version:** 1.0.0  
**Phase:** 57 — Facility-Specific Implant Pricing: Contract, Invoice, Historical, Benchmark, and Actual Unit-Price Hierarchy  
**Module Suite:** Phase 05 — Implant Intelligence (Specifications 50 through 5D)  
**Status:** ARCHITECTURE SPECIFICATION COMPLETE — READ-ONLY AUDIT VERIFIED  
**Target Platform:** ASCANALYST Enterprise Ambulatory Surgery Center Intelligence Platform  
**Target Database Engine:** Supabase PostgreSQL 15+ (Remote Cluster: `isutllqthmakvwgduaos`)  
**Audit & Verification Date:** 2026-10-28  
**Implementation Mode:** READ-ONLY SYSTEM AUDIT & ARCHITECTURE BLUEPRINT (Zero Schema/Code Mutations)  
**Upstream Dependencies:** Phase 21 (`public.facilities`, Migration 001/008), Phase 22 (`rbacService.js`), Phase 23 (`rls`), Phase 24 (`public.audit_logs`, Migration 004), Phase 46 (`public.case_devices`, Migration 023), Phase 50 (`implants.*` RBAC, Migration 025), Phase 51 (`public.implant_categories`, `public.implant_components`, Migration 026), Phase 52 (`public.cpt_implant_mappings`, Migration 027), Phase 53 (`public.implant_vendors`, Migration 028), Phase 54 (`public.implant_product_skus`, Migration 029), Phase 55 (`public.implant_vendor_component_mappings`, Migration 030), Phase 56 (`public.facility_vendor_contracts`, `public.facility_vendor_contract_scopes`, Migration 031)  
**Downstream Modules:** Phase 58 (`public.surgeon_preference_cards`), Phase 59 (`public.case_devices` intra-operative usage stamping), Phase 5A (`implant_cost_hierarchy_engine`), Phase 5B (`implant_variance_and_savings_engine`), Phase 5C (`plastic_surgery_implants`), Phase 5D (`device_duration_classification`)  

---

## 1. Executive Summary & Readiness Verdict

### 1.1 Purpose & Clinical/Financial Rationale
In Ambulatory Surgery Centers (ASCs), surgical hospitals, and outpatient orthopedic/ophthalmology centers, implantable medical hardware (total knee femoral components, spinal interbody cages, intraocular lenses, suture anchors, and biologics) represents 25% to 45% of total surgical supply expenditures.

A critical failure mode across modern surgical billing platforms is **financial price conflation**—treating manufacturer list price (MSRP), negotiated contract price, supplier invoice unit cost, regional GPO benchmarks, and patient chargemaster gross charges as interchangeable concepts. In reality:
1. **Contract Price** reflects a legally binding negotiated rate established under Phase 56 agreements.
2. **Invoice Unit Cost** represents what a distributor or OEM actually billed on a specific shipment date.
3. **Actual Acquisition Cost** is the net dollar expense absorbed by the operating facility after factoring in prompt-pay cash discounts, freight terms, packaging conversions, and volume rebates.
4. **Historical Price** represents a dated record of past case expenditures.
5. **Benchmark Price** is an external comparison baseline across peer facilities or GPO tiers.
6. **Manufacturer List Price** is published catalog MSRP, which is rarely if ever paid by an ASC.
7. **Gross Charge** is the chargemaster markup billed to commercial payers or patients.
8. **Payer Reimbursement** is the expected or adjudicated contractual payment received from Medicare or commercial insurance under CMS ASC fee schedules or carve-out carve-in rules.

Conflating these values produces disastrous financial analytics. In particular, **Gross Charge minus Acquisition Cost is NOT Net Profit**—it fails to account for contractual payer allowances, CMS device-intensive packaging thresholds, unrecovered facility overhead, and surgical scrap.

**Phase 57: Facility Implant Pricing** establishes a deterministic, auditable multi-source price resolution hierarchy, normalized itemized contract price schedules, supplier invoice reconciliation mechanics, and immutable case-level acquisition cost allocations.

### 1.2 Readiness Verdict: `GO FOR SPECIFICATION`
**Decision:** **`GO FOR SPECIFICATION`**  
**Justification & Verified Evidence:**
- **Preceding Phase 56 Infrastructure is Established:** Migration `031_facility_vendor_contracts.sql` and `src/lib/contractService.js` are fully committed in git (`commit af7b6d3`), verified with 25/25 green tests, establishing master contract headers, line-item scopes, GPO affiliations, and payment terms.
- **Relational Anchors are Stable:** Master entities `public.facilities(id)` (Migration 001/008), `public.implant_vendors(id)` (Migration 028), `public.implant_product_skus(id)` (Migration 029), and `public.facility_vendor_contracts(id)` (Migration 031) provide clean, indexed foreign key targets.
- **Granular RBAC is Ready:** The permission catalog in `src/lib/rbacService.js` already registers `implants.view_costs` (sensitive), `implants.override_pricing` (critical), `implants.approve_invoice` (sensitive), and `implants.view_variance` (standard), pre-mapped to canonical CFO, Facility Admin, and Super Admin roles.
- **Downstream Consumer Preparedness:** `public.case_devices` (Migration 023, 025) already defines `unit_cost`, `charge_amount`, `invoice_number`, `invoice_line_cost`, and `cost_hierarchy_tier`, waiting for authoritative server-side pricing resolution.
- **Clear Migration Numbering:** The next sequential migration in the repository is authoritatively designated as `032_facility_implant_pricing.sql` (with matching `032_facility_implant_pricing_down.sql`).
- **Zero Schema Duplication:** No existing migration or table defines itemized contract price schedules, supplier invoice headers, line-item matching ledgers, or benchmark price repositories.

---

## 2. Scope & Boundary Matrix

### 2.1 Production Requirements
- **Normalized Contract Price Schedules:** Establish `public.facility_implant_price_schedules` and `public.facility_implant_sku_prices` in Supabase PostgreSQL 15+ to store effective-dated, itemized contracted unit prices per SKU and packaging configuration.
- **Supplier Invoice Processing & Idempotent Ingestion:** Establish `public.implant_supplier_invoices` and `public.implant_supplier_invoice_lines` supporting electronic invoice import, line-item parsing, packaging unit conversion, and duplicate detection.
- **Three-Way Invoice Reconciliation:** Match supplier invoice lines against purchase orders, intra-operative case documentation (`case_devices`), and active contract prices (`facility_implant_sku_prices`).
- **Price Variance Engine:** Automatically compute contract-to-invoice price variances, enforce auto-acceptance tolerance thresholds, and route variances exceeding tolerance to an authorized CFO/Admin approval queue.
- **Immutable Case Cost Allocation:** Establish `public.case_device_cost_allocations` to stamp the verified actual acquisition cost and cost hierarchy tier onto completed surgical encounters, ensuring historical cases are completely immune to future contract price revisions.
- **Multi-Source Benchmark Registry:** Establish `public.implant_benchmark_prices` to store curated regional, GPO, and peer-ASC price percentiles (25th, 50th, 75th) with explicit methodology and validity windows.
- **Row-Level Security & RBAC Enforcement:** Restrict acquisition costs, invoices, and rebate margins strictly to authorized financial roles (`implants.view_costs`). Mask confidential pricing from unauthorized clinical or nursing staff.

### 2.2 Boundary Matrix: In-Scope vs. Out-of-Scope

| Functional Domain | In-Scope (Phase 57: Facility Implant Pricing) | Out-of-Scope (Owned by Other Phases) |
| :--- | :--- | :--- |
| **Contract Unit Prices** | Line-item negotiated pricing per SKU (e.g. $1,450.00 for Triathlon CR Femoral Component Size 4). | Master contract legal terms, renewal notice days, and BAA PDF storage (Phase 56: Facility Vendor Contracts). |
| **Supplier Invoice Ingestion** | Ingesting vendor invoices, line-item itemization, quantity matching, and freight/tax allocation. | Direct EDI 810 electronic invoice AS2 / SFTP automated pipeline connectors (Phase 60: Supply Chain Integrations). |
| **Acquisition Cost Calculation** | Net unit cost calculation incorporating prompt-pay discounts, packaging conversion, and freight terms. | Intra-operative recording of serial numbers, lot numbers, and operative scrap during surgery (Phase 59: Case Implant Usage). |
| **Invoice Reconciliation Queue** | Flagging uncontracted charges, price breaches, and quantity discrepancies for CFO approval. | Claim scrubbing rule evaluation, EDI 837P loop generation, and CMS-1500 box population (Phase 47: Claim Scrubbing Rules). |
| **Benchmark Cost Intelligence** | Storing external benchmark distributions (25th, 50th, 75th percentiles) and computing variance. | Surgeon-specific preference card construct templates and component pick-lists (Phase 58: Surgeon Preference Cards). |
| **Case Cost Stamping** | Stamping verified actual acquisition cost onto `case_devices` with hierarchy tier provenance. | Facility-wide statistical contribution margin regression and supply chain savings opportunities (Phase 5B: Implant Variance & Savings Engine). |

---

## 3. Current State Audit & System Inventory

A rigorous audit of the local repository (`e:\medicalAI\asc-prototype`), migrations `001` through `031`, client services, and test suites was conducted.

### 3.1 Systematic Component Classification

| Component / Artifact | File / Schema Evidence | Classification | Current Reality & Technical Evidence | Identified Gaps & Production Remediation |
| :--- | :--- | :--- | :--- | :--- |
| **`public.facilities`** | `supabase/migrations/001_multi_tenancy_core.sql:35-75`<br>`supabase/migrations/008_multi_facility_and_single_super_admin.sql:15-55` | **KEEP & INTEGRATE** | Master tenant table defining ASC facilities (e.g., Naples Surgery Center `00000000-0000-0000-0000-000000000002`). | **Authoritative Tenant Anchor.** All pricing schedules, invoices, and benchmarks must be partitioned by `facility_id` (or have `facility_id IS NULL` for global benchmarks). |
| **`public.implant_vendors`** | `supabase/migrations/028_implant_vendor_master.sql:41-133` | **KEEP & INTEGRATE** | Master directory of device OEMs and distributors with DUNS, tax IDs, and status. | **Vendor Party Anchor.** Invoices and price schedules must reference `implant_vendors(id) ON DELETE RESTRICT`. |
| **`public.implant_product_skus`** | `supabase/migrations/029_implant_product_sku_model.sql:46-138` | **KEEP & INTEGRATE** | Master item catalog holding `list_price NUMERIC(12, 2)` (catalog MSRP) and `unit_of_measure`. | **Catalog Anchor.** `list_price` is catalog MSRP, NOT contract price. Itemized pricing schedules must link to `implant_product_skus(id)`. |
| **`public.facility_vendor_contracts`** | `supabase/migrations/031_facility_vendor_contracts.sql:43-131` | **KEEP & INTEGRATE** | Phase 56 commercial master agreements defining GPO affiliations, payment terms, and prompt-pay discounts. | **Contract Parent Anchor.** `facility_implant_price_schedules` must link to `facility_vendor_contracts(id) ON DELETE CASCADE`. |
| **`public.facility_vendor_contract_scopes`** | `supabase/migrations/031_facility_vendor_contracts.sql:138-185` | **KEEP & INTEGRATE** | Phase 56 line-item scopes defining component coverage and `tier_discount_percent`. | **Scope Fallback.** When an exact SKU price schedule line is missing, the scope-level tier discount applied to SKU list price serves as Tier 2 fallback. |
| **`public.case_devices`** | `supabase/migrations/023_charge_completeness_engine.sql:23-40`<br>`supabase/migrations/025_implant_intelligence_core_and_rbac.sql:135-159` | **REFACTOR / EXTEND** | Intra-operative implant consumption table. Defines `unit_cost`, `charge_amount`, `invoice_number`, `invoice_line_cost`, `cost_hierarchy_tier`, `contract_id`, `sku_id`. | **Cost Allocation Link.** Needs foreign key link to authoritative cost allocation record and validation that `unit_cost` reflects verified actual acquisition cost. |
| **`public.ot_extra_cost`** | `supabase/migrations/001_multi_tenancy_core.sql:218-223`<br>`src/components/OTCostManagement.jsx:50-58` | **REPLACE (for Implants)** | Legacy flat lookup table holding unitemized CPT-level expense defaults (`implants_cost`, `supplies_cost`). | **Unstructured Fallback.** Completely lacks SKU attribution, vendor contracts, or UDI tracing. Replaced by itemized Phase 57 pricing hierarchy. |
| **`surgeries.implants_cost`** | `supabase/migrations/001_multi_tenancy_core.sql:205`<br>`src/App.jsx:1457, 1545` | **REFACTOR / DERIVE** | Scalar field on surgery record representing total implant expense for contribution margin calculations. | **Derive from Itemization.** Ensure `surgeries.implants_cost` is deterministically computed as `SUM(case_devices.total_cost)` from itemized records. |
| **Supplier Invoices Schema** | None in repository. | **MISSING** | No tables exist for supplier invoice headers, line items, packaging conversion, or match statuses. | **Core Deliverable of Phase 57.** Specify normalized `implant_supplier_invoices` and `implant_supplier_invoice_lines`. |
| **Itemized Price Schedules** | None in repository. | **MISSING** | No table exists for SKU-level contracted unit prices with effective date boundaries. | **Core Deliverable of Phase 57.** Specify normalized `facility_implant_price_schedules` and `facility_implant_sku_prices`. |
| **Benchmark Price Registry** | None in repository. | **MISSING** | No table exists to store regional, national, or GPO implant benchmark distributions. | **Core Deliverable of Phase 57.** Specify normalized `implant_benchmark_prices`. |
| **RBAC Permissions Catalog** | `src/lib/rbacService.js:87-92`<br>`supabase/migrations/025_implant_intelligence_core_and_rbac.sql:32-36` | **KEEP & ENFORCE** | Granular permissions `implants.view_costs`, `implants.override_pricing`, `implants.approve_invoice`, and `implants.view_variance` exist and are assigned to CFO/Admin. | **Sufficient for Phase 57.** Formally enforce permissions across API services, RLS policies, and UI views. |
| **Client Pricing Service** | None for pricing hierarchy. `contractService.js`, `skuService.js`, `vendorService.js` exist. | **MISSING** | No client service exists to execute multi-tier price resolution, reconcile invoices, or query benchmarks. | **Core Deliverable of Phase 57.** Specify `src/lib/pricingService.js` with deterministic hierarchy resolution. |

### 3.2 Verified Facts vs. Remote Assumptions
1. **Verified Fact:** Migrations `001` through `031` are present in the local codebase and pass syntax analysis.
2. **Verified Fact:** The test suite passes 100% green (661/661 tests across 61 test files).
3. **Verified Fact:** `implant_product_skus` (Migration 029) defines `list_price NUMERIC(12, 2)`, which represents published catalog MSRP.
4. **Verified Fact:** `facility_vendor_contracts` and `facility_vendor_contract_scopes` (Migration 031) define GPO affiliations, prompt-pay discounts, payment terms, and scope discount percentages, but do not store itemized SKU unit price schedules.
5. **Verified Fact:** `case_devices` (Migration 023, 025) has `unit_cost`, `charge_amount`, `invoice_number`, `invoice_line_cost`, `sku_id`, and `contract_id` columns.
6. **Unverified Remote Claim:** Remote database state on Supabase cluster `isutllqthmakvwgduaos` cannot be assumed to match local migrations without explicit execution. Local test harnesses operate self-contained.
7. **Architectural Fact:** Phase 57 forward migration slot is strictly `032_facility_implant_pricing.sql` (down: `032_facility_implant_pricing_down.sql`).

---

## 4. Price Definitions & Authoritative Source Matrix

### 4.1 Strict Price Definitions

The target architecture rigorously differentiates eight distinct monetary concepts:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 PRICE CONCEPTS TAXONOMY                                │
└────────────────────────────────────────────────────────────────────────────────────────┘

  [1] Manufacturer List Price (MSRP)   ─── Published catalog rate (implant_product_skus.list_price)
           │
           ▼ (Negotiated Contract Terms / GPO Tiers)
  [2] Contract Unit Price              ─── Formally approved legal schedule rate (facility_implant_sku_prices)
           │
           ▼ (Distributor Billing / Delivery Charges)
  [3] Invoice Unit Cost                ─── Stated line rate on supplier invoice (implant_supplier_invoice_lines)
           │
           ▼ (Net Adjustments: Prompt-Pay Discount, Rebate Offset, Packaging Factor)
  [4] Actual Acquisition Cost          ─── Verified net facility cash outflow (case_device_cost_allocations)
           │
  ┌────────┴───────────────────────────┐
  │                                    │
  ▼                                    ▼
[5] Historical Price                 [6] Benchmark Price
   Dated actual transaction             Curated regional / GPO peer
   for trend and inflation              distribution (25th/50th/75th pct)
   tracking                             for renegotiation leverage

──────────────────────────────────────────────────────────────────────────────────────────
  PATIENT & PAYER DOMAIN (Strictly segregated from internal cost accounting):

  [7] Gross Charge                     ─── Facility chargemaster price billed on CMS-1500 / 837P
  [8] Payer Reimbursement              ─── Expected/adjudicated cash payment from insurer
```

1. **Contract Price (`contract_unit_price`):** The legally binding unit price for an implant SKU specified in an active, approved contract schedule (`facility_implant_sku_prices`) or derived via contract scope discount. Authoritative for pre-purchase commitment and invoice audit.
2. **Invoice Unit Cost (`invoice_unit_cost`):** The gross unit price billed by the vendor or distributor on a physical or electronic invoice line item before prompt-pay or volume adjustments. Authoritative for accounts payable liability.
3. **Actual Acquisition Cost (`actual_acquisition_cost`):** The verified, net monetary cost to the facility to acquire the implant. Calculated as:  
   $$\text{Actual Acquisition Cost} = (\text{Invoice Unit Cost} \times (1 - \text{Prompt Pay Discount}) - \text{Allocated Rebate}) \times \text{Packaging Multiplier} + \text{Allocated Freight}$$  
   Authoritative for case contribution margin, surgeon profitability, and inventory valuation.
4. **Historical Price (`historical_unit_cost`):** An immutable, time-stamped record of a verified price paid by the facility in a previous surgical case or invoice cycle. Authoritative for inflationary index modeling.
5. **Benchmark Price (`benchmark_unit_price`):** A statistical reference value (25th percentile, median, 75th percentile) derived from multi-facility ASC cohorts, state ambulatory databases, or published GPO schedules with recorded sample size and date. Authoritative for procurement negotiations.
6. **Manufacturer List Price (`list_price`):** The catalog MSRP published by the OEM in `implant_product_skus`. Not authoritative for financial accounting; used only as an anchor when contracts specify "List minus X%".
7. **Gross Charge (`gross_charge_amount`):** The chargemaster dollar amount billed on insurance claims (`case_devices.charge_amount`). Subject to facility markup formulas (e.g., Acquisition Cost × 2.50 or state fee schedule maximums).
8. **Payer Reimbursement (`expected_reimbursement`):** The contractual or statutory cash payment expected from the health plan (e.g. Medicare ASC fee schedule rate + device pass-through C-code reimbursement).

### 4.2 Critical Warning: Gross Margin vs. Net Profit

$$\mathbf{Gross\ Charge} - \mathbf{Actual\ Acquisition\ Cost} \neq \mathbf{Net\ Profit}$$

In outpatient surgery, treating gross markup minus implant cost as profit is a severe financial error. Realized contribution margin must incorporate:
- **Contractual Allowances:** Payers reimburse based on negotiated fee schedules or fee-for-service percentage caps, completely ignoring the facility's chargemaster gross charge.
- **CMS Device-Intensive Offset:** Under Medicare OPPS/ASC rules, payment for device-intensive CPT codes bundles a significant portion of device cost into the primary surgical procedure rate; unbundled C-code billing is frequently rejected unless strict criteria are met.
- **Unrecovered Fixed Overhead:** Labor (circulating nurse, scrub tech, anesthesiologist), OR minutes ($18–$35/min), sterile processing, and tray depreciation.
- **Contaminated & Wasted Implants:** Hardware opened on the sterile field but rejected or dropped cannot be billed to the patient.

### 4.3 Authoritative Source Matrix

| Business Workflow | Authoritative Cost Metric | Permitted Fallback | Disallowed Substitution | Output Status When Evidence Missing |
| :--- | :--- | :--- | :--- | :--- |
| **Surgical Pre-Op Scheduling & Case Estimation** | Active Approved Contract SKU Price (`facility_implant_sku_prices`) | Contract Scope Discount applied to SKU List Price | Never substitute unverified benchmark or unapproved invoice | `VERIFIED` (Contract found)<br>`ESTIMATED` (Scope discount used)<br>`MISSING` (No contract coverage) |
| **Accounts Payable Invoice Auditing** | Contract SKU Price matched to Delivery Verification | Approved Contract Scope Cap Rate | Never substitute manufacturer list price | `MATCHED` (Within tolerance)<br>`PRICE_VARIANCE` (Price mismatch)<br>`UNCONTRACTED` (No contract) |
| **Post-Operative Case Contribution Margin** | Reconciled Actual Acquisition Cost (`case_device_cost_allocations`) | Confirmed Contracted Unit Price (if invoice pending) | Never substitute chargemaster gross charge or external benchmark | `VERIFIED` (Reconciled to invoice)<br>`ACCRUED_CONTRACT` (Pending invoice)<br>`UNVERIFIED` (Manual entry) |
| **Financial Period-End General Ledger Close** | Reconciled & Audited Actual Acquisition Cost | None. Unreconciled cases must accrue at contracted liability | Never carry unverified estimates into closed periods | `RECONCILED` (Closed)<br>`ACCRUED_UNRECONCILED` (Open) |
| **Vendor Contract Renegotiation & Sourcing** | Median Regional & GPO Benchmark Price (`implant_benchmark_prices`) | Facility Historical 12-Month Trailing Average | Never present national benchmark as facility actual cost | `BENCHMARK_AVAILABLE`<br>`BENCHMARK_UNAVAILABLE` |

---

## 5. Separate Price Resolution Hierarchies by Workflow

Because different operational workflows answer fundamentally different clinical and financial questions, **ASCANALYST rejects a single universal price fallback**. Instead, five deterministic, auditable resolution engines are established.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                 WORKFLOW 1: PRE-OP ESTIMATION & SCHEDULING HIERARCHY                   │
└────────────────────────────────────────────────────────────────────────────────────────┘
  Input: (facility_id, sku_id, scheduled_surgery_date)
     │
     ├── Step 1: Active, Approved Itemized Contract SKU Price
     │           [facility_implant_sku_prices WHERE status='active' AND date IN window]
     │           ──> FOUND? Return (price, 'VERIFIED_CONTRACT_PRICE')
     │
     ├── Step 2: Active Contract Scope Discount applied to SKU List Price
     │           [facility_vendor_contract_scopes.tier_discount_percent applied to list_price]
     │           ──> FOUND? Return (list_price * (1 - discount), 'CONTRACT_SCOPE_DISCOUNT')
     │
     ├── Step 3: Fixed Procedural Cap Rate (if specified on Contract Scope)
     │           [facility_vendor_contract_scopes.fixed_procedural_cap_rate]
     │           ──> FOUND? Return (cap_rate, 'CONTRACT_CAP_RATE')
     │
     └── Step 4: No Contracted Rate Found
                 ──> Return (NULL, 'OFF_CONTRACT_UNAUTHORIZED')
                 [Trigger Warning: Off-Contract Device Scheduling Exception]
```

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                 WORKFLOW 2: INVOICE RECONCILIATION & 3-WAY MATCH                       │
└────────────────────────────────────────────────────────────────────────────────────────┘
  Input: (facility_id, vendor_id, invoice_line_item)
     │
     ├── Step 1: Exact SKU Catalog Match to Active Contract Schedule Line
     │           [Matches catalog_number + vendor_id + invoice_date in contract window]
     │           ──> Calculate Price Variance: (invoice_unit_price - contract_unit_price)
     │           ──> Variance <= Tolerance ($0.00 or <= 0.5%)? 
     │               ──> AUTO-MATCH: Return ('MATCHED_CLEAN', 0.00)
     │               ──> EXCEEDS Tolerance: Route to Exception Queue ('PRICE_VARIANCE_BREACH')
     │
     ├── Step 2: Uncontracted SKU on Active Contracted Vendor
     │           ──> Check for Scope Carve-Out Exclusion
     │               ──> EXCLUDED? Return ('CONTRACT_CARVEOUT_VIOLATION')
     │               ──> INCLUDED? Apply Scope Tier Discount; Flag for Finance Review ('SCOPE_MATCH_PENDING')
     │
     └── Step 3: Vendor Has No Active Facility Contract
                 ──> Return ('UNAUTHORIZED_VENDOR_INVOICE')
                 [Hard Stop: Requires CFO Manual Commercial Override]
```

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                 WORKFLOW 3: POST-OP ACTUAL CASE COST STAMPING                          │
└────────────────────────────────────────────────────────────────────────────────────────┘
  Input: (surgery_id, case_device_id)
     │
     ├── Step 1: Matched & Approved Supplier Invoice Line
     │           [implant_supplier_invoice_lines linked to case_device via allocation]
     │           ──> Return (effective_net_cost, 'TIER_1_RECONCILED_INVOICE')
     │
     ├── Step 2: Active Approved Contract Price (Invoice Not Yet Received/Processed)
     │           [facility_implant_sku_prices in effect on surgery.date]
     │           ──> Return (contract_unit_price, 'TIER_2_ACCRUED_CONTRACT')
     │
     ├── Step 3: Facility 90-Day Trailing Moving Average for Identical SKU
     │           [historical case_devices WHERE usage_status='IMPLANTED' in last 90 days]
     │           ──> Return (trailing_avg, 'TIER_3_HISTORICAL_MOVING_AVG')
     │
     ├── Step 4: Approved Manual Finance Cost Allocation (with Recorded Rationale)
     │           [case_device_cost_allocations.manual_override_cost]
     │           ──> Return (override_cost, 'TIER_4_MANUAL_FINANCE_OVERRIDE')
     │
     └── Step 5: No Cost Evidence Exists
                 ──> Return (0.00, 'TIER_5_MISSING_COST_BLOCKER')
                 [Blocks Pre-Bill Claim Generation: Rule IMP-001]
```

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                 WORKFLOW 4: HISTORICAL INFLATION & TREND ANALYSIS                      │
└────────────────────────────────────────────────────────────────────────────────────────┘
  Input: (facility_id, sku_id, start_date, end_date)
     │
     ├── Chronological stream of verified actual acquisition costs from Step 3
     ├── Excludes unverified manual overrides and zero-cost anomalies
     └── Computes: Weighted Average Price, Volatility, Inflation Index, Annualized Spend
```

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                 WORKFLOW 5: BENCHMARK PROCUREMENT COMPARISON                           │
└────────────────────────────────────────────────────────────────────────────────────────┘
  Input: (facility_id, component_id OR sku_id)
     │
     ├── Step 1: Regional GPO Tier Benchmark (Vizient / Premier / HealthTrust)
     │           [implant_benchmark_prices WHERE benchmark_scope='REGIONAL_GPO']
     │
     ├── Step 2: Internal Enterprise Multi-Facility Peer Benchmark
     │           [Aggregated across affiliated ASC facilities in parent health network]
     │
     └── Return Comparative Metrics:
         - Facility Current Contract Price vs 25th Percentile (Best-in-Class)
         - Facility Current Contract Price vs 50th Percentile (Market Median)
         - Potential Annual Opportunity = (Current Price - 25th Percentile) * Annual Volume
```

---

## 6. Proposed Target Data Model & DDL Blueprint (`032_facility_implant_pricing.sql`)

### 6.1 Architectural Schema Design
To guarantee mathematical rigor, referential integrity, and complete auditability, Phase 57 defines **seven normalized relational tables**:

1. `public.facility_implant_price_schedules`: Contract-linked or independent pricing schedules grouping itemized rates with effective dates.
2. `public.facility_implant_sku_prices`: Itemized unit price records per SKU, currency, packaging quantity, and tier.
3. `public.implant_supplier_invoices`: Invoiced commercial headers from vendors/distributors.
4. `public.implant_supplier_invoice_lines`: Line items from invoices recording billed unit cost, billed quantity, and match status.
5. `public.case_device_cost_allocations`: Immutable junction stamping the exact cost source and dollar value onto a surgical `case_device`.
6. `public.implant_benchmark_prices`: Statistical reference price distributions per component/SKU.
7. `public.facility_implant_price_audits`: Immutable historical audit log capturing all pricing schedule and cost modifications.

### 6.2 Authoritative DDL Specification

```sql
-- ==============================================================================
-- MIGRATION: 032_facility_implant_pricing.sql
-- DESCRIPTION: Phase 57 Facility Implant Pricing: Contract Schedules,
--              Itemized SKU Prices, Supplier Invoices, 3-Way Reconciliation,
--              Case Cost Allocations, and Benchmark Intelligence.
-- PLATFORM: Supabase PostgreSQL 15+
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. TABLE: public.facility_implant_price_schedules
-- Groups itemized SKU pricing agreements under a master contract or local schedule
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.facility_implant_price_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES public.implant_vendors(id) ON DELETE RESTRICT,
    contract_id UUID REFERENCES public.facility_vendor_contracts(id) ON DELETE CASCADE,
    
    -- Identification & Description
    schedule_code VARCHAR(50) NOT NULL,
    schedule_name VARCHAR(150) NOT NULL,
    description TEXT,
    
    -- Commercial Framework
    pricing_model VARCHAR(30) NOT NULL DEFAULT 'FIXED_FEE_SCHEDULE'
        CHECK (pricing_model IN (
            'FIXED_FEE_SCHEDULE',       -- Fixed unit price per catalog SKU
            'LIST_LESS_DISCOUNT',       -- MSRP minus contract discount percent
            'COST_PLUS_PERCENT',        -- Distributor acquisition plus margin
            'CAPITATED_PROCEDURE_RATE',  -- Flat fee per procedural construct
            'CONSIGNMENT_TIERED'        -- Volume-bracketed consignment schedule
        )),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
    
    -- Temporal Boundaries
    effective_from DATE NOT NULL,
    effective_to DATE NOT NULL,
    
    -- Lifecycle Governance
    status VARCHAR(30) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'pending_approval', 'approved', 'active', 'superseded', 'terminated')),
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Approval Provenance (Two-Person Separation of Duties)
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT chk_price_schedule_dates CHECK (effective_to >= effective_from),
    CONSTRAINT chk_price_schedule_active_sync CHECK (is_active = (status = 'active')),
    CONSTRAINT chk_price_schedule_approval_integrity CHECK (
        (status IN ('approved', 'active') AND approved_by IS NOT NULL AND approved_at IS NOT NULL) OR
        (status NOT IN ('approved', 'active'))
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_facility_price_schedule_code 
    ON public.facility_implant_price_schedules (facility_id, UPPER(TRIM(schedule_code)));

CREATE INDEX IF NOT EXISTS idx_fips_vendor ON public.facility_implant_price_schedules(vendor_id);
CREATE INDEX IF NOT EXISTS idx_fips_contract ON public.facility_implant_price_schedules(contract_id);
CREATE INDEX IF NOT EXISTS idx_fips_facility_dates ON public.facility_implant_price_schedules(facility_id, effective_from, effective_to);

-- ==============================================================================
-- 2. TABLE: public.facility_implant_sku_prices
-- Itemized unit price per physical SKU under a price schedule
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.facility_implant_sku_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    price_schedule_id UUID NOT NULL REFERENCES public.facility_implant_price_schedules(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    sku_id UUID NOT NULL REFERENCES public.implant_product_skus(id) ON DELETE RESTRICT,
    vendor_id UUID NOT NULL REFERENCES public.implant_vendors(id) ON DELETE RESTRICT,
    
    -- Monetary Specifications (4 decimal places for unit precision)
    contract_unit_price NUMERIC(12, 4) NOT NULL CHECK (contract_unit_price >= 0.0000),
    list_price_at_signing NUMERIC(12, 4) CHECK (list_price_at_signing IS NULL OR list_price_at_signing >= 0.0000),
    discount_off_list_percent NUMERIC(5, 2) GENERATED ALWAYS AS (
        CASE 
            WHEN list_price_at_signing > 0 AND contract_unit_price <= list_price_at_signing 
            THEN ROUND(((list_price_at_signing - contract_unit_price) / list_price_at_signing) * 100.0, 2)
            ELSE 0.00 
        END
    ) STORED,

    -- Packaging & Unit Conversion
    unit_of_measure VARCHAR(20) NOT NULL DEFAULT 'EA' CHECK (unit_of_measure IN ('EA', 'KIT', 'BOX', 'SET', 'PAIR')),
    package_quantity INTEGER NOT NULL DEFAULT 1 CHECK (package_quantity >= 1),
    package_unit_price NUMERIC(12, 4) GENERATED ALWAYS AS (contract_unit_price * package_quantity) STORED,

    -- Volume Commitments & Tiers
    minimum_order_quantity INTEGER NOT NULL DEFAULT 1 CHECK (minimum_order_quantity >= 1),
    pricing_tier VARCHAR(30) NOT NULL DEFAULT 'STANDARD'
        CHECK (pricing_tier IN ('STANDARD', 'TIER_1_VOLUME', 'TIER_2_VOLUME', 'PREFERRED_FACILITY', 'PROMOTIONAL')),
    
    -- Temporal Window (Inherits or overrides schedule)
    effective_from DATE NOT NULL,
    effective_to DATE NOT NULL,
    
    -- Status & Audit
    status VARCHAR(30) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'suspended', 'superseded', 'terminated')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_sku_price_dates CHECK (effective_to >= effective_from)
);

-- Partial unique index: Exactly one active price per SKU per facility in a given date window
CREATE UNIQUE INDEX IF NOT EXISTS uq_facility_sku_price_active 
    ON public.facility_implant_sku_prices (facility_id, sku_id, price_schedule_id)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_fisp_sku ON public.facility_implant_sku_prices(sku_id);
CREATE INDEX IF NOT EXISTS idx_fisp_facility_sku_active ON public.facility_implant_sku_prices(facility_id, sku_id, is_active);

-- ==============================================================================
-- 3. TABLE: public.implant_supplier_invoices
-- Invoiced commercial accounts payable records received from medical device suppliers
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.implant_supplier_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES public.implant_vendors(id) ON DELETE RESTRICT,
    contract_id UUID REFERENCES public.facility_vendor_contracts(id) ON DELETE SET NULL,
    
    -- Supplier Invoice Identification
    invoice_number VARCHAR(100) NOT NULL,
    vendor_invoice_reference VARCHAR(150),
    invoice_date DATE NOT NULL,
    due_date DATE,
    received_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Financial Totals
    currency VARCHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
    subtotal_amount NUMERIC(12, 2) NOT NULL CHECK (subtotal_amount >= 0.00),
    freight_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (freight_amount >= 0.00),
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0.00),
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0.00),
    total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0.00),
    
    -- Payment Terms Snapshots
    payment_terms_days INTEGER NOT NULL DEFAULT 30 CHECK (payment_terms_days >= 0),
    prompt_pay_discount_percent NUMERIC(5, 2) DEFAULT 0.00 CHECK (prompt_pay_discount_percent >= 0.00),
    
    -- 3-Way Reconciliation Status
    reconciliation_status VARCHAR(30) NOT NULL DEFAULT 'unreconciled'
        CHECK (reconciliation_status IN (
            'unreconciled',             -- Newly ingested, pending item matching
            'fully_matched',            -- 100% lines matched clean to PO/Cases
            'partially_matched',        -- Some lines matched, others in variance
            'variance_flagged',         -- Price breach or quantity discrepancy
            'approved_for_payment',     -- Finance/CFO approved for AP payout
            'rejected',                 -- Returned to vendor for credit memo
            'disputed'                  -- Formal commercial dispute logged
        )),
    
    -- Auditing & Sign-off
    reconciled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reconciled_at TIMESTAMPTZ,
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Mathematical balance check
    CONSTRAINT chk_invoice_balance CHECK (
        total_amount = (subtotal_amount + freight_amount + tax_amount - discount_amount)
    )
);

-- Idempotency: Prevent duplicate ingestion of same vendor invoice
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_invoice_vendor_number 
    ON public.implant_supplier_invoices (facility_id, vendor_id, UPPER(TRIM(invoice_number)));

CREATE INDEX IF NOT EXISTS idx_isi_facility_status ON public.implant_supplier_invoices(facility_id, reconciliation_status);
CREATE INDEX IF NOT EXISTS idx_isi_vendor ON public.implant_supplier_invoices(vendor_id);

-- ==============================================================================
-- 4. TABLE: public.implant_supplier_invoice_lines
-- Line items within supplier invoices linked to catalog SKUs and PO/surgical cases
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.implant_supplier_invoice_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.implant_supplier_invoices(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL CHECK (line_number >= 1),
    
    -- Physical Catalog Matching
    sku_id UUID REFERENCES public.implant_product_skus(id) ON DELETE RESTRICT,
    vendor_catalog_number VARCHAR(100) NOT NULL,
    vendor_description TEXT,
    
    -- Regulatory Traceability
    lot_number VARCHAR(50),
    serial_number VARCHAR(50),
    expiration_date DATE,
    udi VARCHAR(150),
    
    -- Quantity & Pricing Billed
    billed_quantity INTEGER NOT NULL CHECK (billed_quantity >= 1),
    billed_unit_of_measure VARCHAR(20) NOT NULL DEFAULT 'EA',
    packaging_multiplier INTEGER NOT NULL DEFAULT 1 CHECK (packaging_multiplier >= 1),
    billed_unit_cost NUMERIC(12, 4) NOT NULL CHECK (billed_unit_cost >= 0.0000),
    extended_cost NUMERIC(12, 2) NOT NULL CHECK (extended_cost >= 0.00),
    
    -- Contract Comparison & Variance Analysis
    contract_sku_price_id UUID REFERENCES public.facility_implant_sku_prices(id) ON DELETE SET NULL,
    contract_unit_price NUMERIC(12, 4),
    price_variance_unit NUMERIC(12, 4) GENERATED ALWAYS AS (
        CASE 
            WHEN contract_unit_price IS NOT NULL 
            THEN billed_unit_cost - contract_unit_price 
            ELSE 0.0000 
        END
    ) STORED,
    price_variance_extended NUMERIC(12, 2) GENERATED ALWAYS AS (
        CASE 
            WHEN contract_unit_price IS NOT NULL 
            THEN (billed_unit_cost - contract_unit_price) * billed_quantity 
            ELSE 0.00 
        END
    ) STORED,

    -- Line Reconciliation Lifecycle
    match_status VARCHAR(30) NOT NULL DEFAULT 'UNMATCHED'
        CHECK (match_status IN (
            'UNMATCHED',                -- Ingested, unmapped to SKU or Case
            'MATCHED_CLEAN',            -- Matched to contract & PO within tolerance
            'PRICE_VARIANCE_BREACH',    -- Billed rate exceeds contract rate
            'QUANTITY_MISMATCH',        -- Invoiced quantity exceeds surgical usage
            'OFF_CONTRACT_UNAUTHORIZED', -- Vendor SKU not covered under contract
            'MANUALLY_APPROVED',        -- Variance explicitly approved by CFO
            'DISPUTED_LINE'             -- Line credited or disputed with vendor
        )),
    variance_reason TEXT,
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_invoice_line_number UNIQUE (invoice_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_isil_sku ON public.implant_supplier_invoice_lines(sku_id);
CREATE INDEX IF NOT EXISTS idx_isil_match_status ON public.implant_supplier_invoice_lines(facility_id, match_status);

-- ==============================================================================
-- 5. TABLE: public.case_device_cost_allocations
-- Authoritative junction assigning verified actual acquisition cost to case_devices
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.case_device_cost_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    case_device_id UUID NOT NULL REFERENCES public.case_devices(id) ON DELETE CASCADE,
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE CASCADE,
    
    -- Hierarchy Tier Assigned
    cost_hierarchy_tier VARCHAR(40) NOT NULL
        CHECK (cost_hierarchy_tier IN (
            'TIER_1_RECONCILED_INVOICE',     -- Highest certainty: Exact reconciled invoice line
            'TIER_2_ACCRUED_CONTRACT',       -- High certainty: Active approved contract schedule
            'TIER_3_HISTORICAL_MOVING_AVG',  -- Medium: Trailing facility 90-day moving average
            'TIER_4_MANUAL_FINANCE_OVERRIDE', -- Low: Explicitly approved finance override
            'TIER_5_MISSING_UNVERIFIED'      -- Critical blocker: Zero verifiable cost source
        )),

    -- Cost Evidence References
    invoice_line_id UUID REFERENCES public.implant_supplier_invoice_lines(id) ON DELETE SET NULL,
    contract_sku_price_id UUID REFERENCES public.facility_implant_sku_prices(id) ON DELETE SET NULL,
    
    -- Financial Values
    allocated_unit_acquisition_cost NUMERIC(12, 4) NOT NULL CHECK (allocated_unit_acquisition_cost >= 0.0000),
    allocated_quantity INTEGER NOT NULL DEFAULT 1 CHECK (allocated_quantity >= 1),
    allocated_extended_acquisition_cost NUMERIC(12, 2) GENERATED ALWAYS AS (
        allocated_unit_acquisition_cost * allocated_quantity
    ) STORED,

    -- Net Adjustments Applied
    prompt_pay_discount_applied NUMERIC(12, 4) DEFAULT 0.0000,
    freight_allocated NUMERIC(12, 4) DEFAULT 0.0000,
    volume_rebate_accrued NUMERIC(12, 4) DEFAULT 0.0000,

    -- Verification & Immutability Lock
    is_locked_for_billing BOOLEAN NOT NULL DEFAULT FALSE,
    locked_at TIMESTAMPTZ,
    allocated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    allocation_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_case_device_cost UNIQUE (case_device_id)
);

CREATE INDEX IF NOT EXISTS idx_cdca_surgery ON public.case_device_cost_allocations(surgery_id);
CREATE INDEX IF NOT EXISTS idx_cdca_facility_tier ON public.case_device_cost_allocations(facility_id, cost_hierarchy_tier);

-- ==============================================================================
-- 6. TABLE: public.implant_benchmark_prices
-- Regional, national, and GPO benchmark distributions for renegotiation analytics
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.implant_benchmark_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE, -- NULL = National / GPO baseline
    component_id UUID REFERENCES public.implant_components(id) ON DELETE CASCADE,
    sku_id UUID REFERENCES public.implant_product_skus(id) ON DELETE CASCADE,
    
    -- Benchmark Authority
    source_name VARCHAR(100) NOT NULL, -- e.g. 'Vizient High-Performance ASC Benchmark', 'State Health Data'
    benchmark_type VARCHAR(30) NOT NULL DEFAULT 'GPO_MEDIAN'
        CHECK (benchmark_type IN ('GPO_MEDIAN', 'REGIONAL_ASC_COHORT', 'CMS_OPPS_MEDIAN', 'INTERNAL_NETWORK_BEST')),
    specialty VARCHAR(50) NOT NULL,
    
    -- Statistical Distribution Values
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    percentile_25_unit_cost NUMERIC(12, 2) NOT NULL CHECK (percentile_25_unit_cost >= 0.00),
    median_unit_cost NUMERIC(12, 2) NOT NULL CHECK (median_unit_cost >= 0.00),
    percentile_75_unit_cost NUMERIC(12, 2) NOT NULL CHECK (percentile_75_unit_cost >= 0.00),
    sample_size_cases INTEGER NOT NULL DEFAULT 100 CHECK (sample_size_cases >= 1),
    
    -- Temporal Validity
    benchmark_year_quarter VARCHAR(10) NOT NULL, -- e.g. '2026-Q1'
    effective_from DATE NOT NULL,
    effective_to DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_benchmark_percentiles CHECK (
        percentile_75_unit_cost >= median_unit_cost AND median_unit_cost >= percentile_25_unit_cost
    ),
    CONSTRAINT chk_benchmark_dates CHECK (effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_ibp_component ON public.implant_benchmark_prices(component_id);
CREATE INDEX IF NOT EXISTS idx_ibp_sku ON public.implant_benchmark_prices(sku_id);

-- ==============================================================================
-- 7. TABLE: public.facility_implant_price_audits
-- Immutable ledger tracking before/after mutations to price schedules and costs
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.facility_implant_price_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    entity_name VARCHAR(50) NOT NULL, -- 'facility_implant_sku_prices', 'case_device_cost_allocations', etc.
    record_id UUID NOT NULL,
    action_type VARCHAR(20) NOT NULL CHECK (action_type IN ('INSERT', 'UPDATE', 'DELETE', 'OVERRIDE', 'RECONCILE')),
    old_values JSONB,
    new_values JSONB,
    performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    rationale TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fipa_record ON public.facility_implant_price_audits(entity_name, record_id);
CREATE INDEX IF NOT EXISTS idx_fipa_facility_date ON public.facility_implant_price_audits(facility_id, created_at DESC);

-- ==============================================================================
-- 8. INTEGRITY TRIGGERS & PROCEDURES
-- ==============================================================================

-- Trigger: Prevent modification of locked case cost allocations
CREATE OR REPLACE FUNCTION public.fn_prevent_locked_case_cost_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.is_locked_for_billing = TRUE THEN
        RAISE EXCEPTION 'COMPLIANCE VIOLATION: Case cost allocation % is locked for billing and cannot be mutated or deleted.', OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lock_case_cost ON public.case_device_cost_allocations;
CREATE TRIGGER trg_lock_case_cost
    BEFORE UPDATE OR DELETE ON public.case_device_cost_allocations
    FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_locked_case_cost_mutation();

-- Trigger: Sync surgeries.implants_cost from case_devices
CREATE OR REPLACE FUNCTION public.fn_sync_surgery_implants_cost()
RETURNS TRIGGER AS $$
DECLARE
    v_surgery_id BIGINT;
    v_total NUMERIC(12, 2);
BEGIN
    v_surgery_id := COALESCE(NEW.surgery_id, OLD.surgery_id);
    
    SELECT COALESCE(SUM(total_cost), 0.00)
    INTO v_total
    FROM public.case_devices
    WHERE surgery_id = v_surgery_id AND usage_status = 'IMPLANTED';
    
    UPDATE public.surgeries
    SET implants_cost = v_total,
        updated_at = NOW()
    WHERE id = v_surgery_id;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_surgery_implants_cost ON public.case_devices;
CREATE TRIGGER trg_sync_surgery_implants_cost
    AFTER INSERT OR UPDATE OR DELETE ON public.case_devices
    FOR EACH ROW EXECUTE FUNCTION public.fn_sync_surgery_implants_cost();

COMMIT;
```

---

## 7. Contract and Invoice Reconciliation Rules

### 7.1 Three-Way Match Engine Mechanics
Phase 57 enforces a deterministic 3-way match across:
1. **Purchase / Usage Document:** Verified intra-operative surgical usage (`case_devices` with `usage_status = 'IMPLANTED'`).
2. **Physical Packing Slip / Serial Log:** Verified physical receipt of serial/lot number on operative field.
3. **Supplier Invoice Line:** Billed catalog number, unit price, and quantity from distributor (`implant_supplier_invoice_lines`).

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        THREE-WAY MATCH AUDITING STATE MACHINE                          │
└────────────────────────────────────────────────────────────────────────────────────────┘

 [Physical Case Usage: case_devices]
          │
          ├── (1) Serial/Lot Match
          ▼
 [Supplier Invoice: implant_supplier_invoice_lines]
          │
          ├── (2) Price Variance Check vs [Contract Schedule: facility_implant_sku_prices]
          │
          ├──> If Variance == $0.00              ──> MATCHED_CLEAN (Auto-Pass)
          ├──> If 0.00 < Variance <= Tolerance   ──> MATCHED_CLEAN (Auto-Tolerated)
          ├──> If Variance > Tolerance           ──> PRICE_VARIANCE_BREACH (To Exception Queue)
          ├──> If Invoiced Qty > Usage Qty       ──> QUANTITY_MISMATCH (Disputed)
          └──> If SKU Not on Contract            ──> OFF_CONTRACT_UNAUTHORIZED (CFO Gate)
```

### 7.2 Price Variance Calculation & Auto-Tolerance Boundaries
- **Variance Dollar Amount:**  
  $$\Delta_{\text{price}} = \text{Billed Unit Cost} - \text{Contract Unit Price}$$
- **Variance Percentage:**  
  $$\Delta_{\%} = \left(\frac{\Delta_{\text{price}}}{\text{Contract Unit Price}}\right) \times 100$$
- **Auto-Acceptance Threshold:**  
  - If $\Delta_{\text{price}} \le \$0.00$ (vendor billed below contract rate): **AUTO-ACCEPT** (`MATCHED_CLEAN`).
  - If $\Delta_{\%} \le 0.50\%$ (minor rounding discrepancy under $\$2.00$): **AUTO-ACCEPT** (`MATCHED_CLEAN`).
  - If $\Delta_{\%} > 0.50\%$ or $\Delta_{\text{price}} > \$10.00$: **FLAG EXCEPTION** (`PRICE_VARIANCE_BREACH`). Invoiced line cannot be approved for AP payment without explicit CFO override.

### 7.3 Packaging Multiplier & Unit-of-Measure Conversions
Orthopedic hardware frequently involves package conversion discrepancies (e.g. Bone Screws packaged in Boxes of 5, billed at $750/box, but consumed as 2 individual screws in surgery).
- **Rule:** The reconciliation engine deterministically resolves unit cost:  
  $$\text{Effective Unit Cost} = \frac{\text{Billed Extended Cost}}{\text{Billed Quantity} \times \text{Packaging Multiplier}}$$
- If a surgeon documents `quantity = 2` on `case_devices`, the cost allocation engine draws $2 \times \$150.00 = \$300.00$, leaving 3 screws remaining in consignment or facility stock.

### 7.4 Freight, Tax, Discount, and Rebate Treatment
- **Prompt-Pay Cash Discounts (e.g. 2% 10 Net 30):** Deducted from net acquisition cost *only* when facility policy accounts for prompt payment. By default, stored as an accrued adjustment: `prompt_pay_discount_applied = contracted_rate * prompt_pay_discount_percent`.
- **FOB Destination vs. FOB Origin Freight:**  
  - If contract states `fob_point = 'DESTINATION'` (vendor pays freight) and invoice contains freight line items: **REJECT FREIGHT LINE** as unauthorized contract breach.
  - If contract states `fob_point = 'ORIGIN'` (facility pays freight): Freight is allocated proportionally across invoice line values.
- **Volume Rebates:** Volume rebates (e.g. 4.5% annual rebate on total joint volume) are tracked in `case_device_cost_allocations.volume_rebate_accrued` as an accrued contra-expense for managerial reporting, but are excluded from primary gross invoice balance.

### 7.5 Duplicate Invoice Prevention & Idempotent Ingestion
Duplicate invoice ingestion (e.g., vendor re-submitting an invoice as a past-due notice) creates catastrophic double-cost entries. Phase 57 enforces:
- **Database Level:** Unique constraint on `(facility_id, vendor_id, UPPER(TRIM(invoice_number)))`.
- **Application Level:** Prior to parsing, client services check hash fingerprint of uploaded invoice PDF/CSV. If duplicate detected, ingestion aborts with `HTTP 409 Conflict: Invoice #INV-1234 already exists for vendor Stryker in facility Naples Surgery Center.`

---

## 8. Financial Calculation Rules & Worked Examples

### 8.1 Core Deterministic Formulas

1. **Contracted Unit Price from Scope Discount:**  
   $$\text{Contracted Unit Price} = \text{MSRP List Price} \times \left(1 - \frac{\text{Tier Discount Percent}}{100}\right)$$
2. **Invoice Effective Unit Cost:**  
   $$\text{Effective Unit Cost} = \frac{\text{Billed Line Amount}}{\text{Billed Qty} \times \text{Package Multiplier}}$$
3. **Net Actual Acquisition Cost (Post-Reconciliation):**  
   $$\text{Acquisition Cost} = \text{Effective Unit Cost} \times (1 - \text{Prompt Pay Discount}) + \text{Allocated Freight} - \text{Accrued Rebate}$$
4. **Per-Case Total Implant Expense:**  
   $$\text{Case Implant Cost} = \sum_{i=1}^{n} (\text{Allocated Unit Cost}_i \times \text{Quantity}_i)$$
5. **Realized Surgical Contribution Margin:**  
   $$\text{Contribution Margin} = \text{Expected Reimbursement} - (\text{Case Implant Cost} + \text{Surgical Supplies} + \text{Medications} + \text{Tray Cost} + \text{Labor Cost} + \text{OR Minutes Cost})$$

### 8.2 Comprehensive Worked Example: Total Knee Arthroplasty (CPT 27447)

*Scenario: Dr. Kelly performs a Total Knee Replacement at Naples Surgery Center using a Stryker Triathlon Construct.*

| Implant Item | Catalog # | Qty | MSRP List Price | Contract Negotiated Price | Invoiced Billed Price | Match Status | Price Variance | Net Allocated Cost |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Triathlon CR Femoral Component Size 4** | 5510-F-401 | 1 | $2,850.00 | $1,450.00 | $1,450.00 | `MATCHED_CLEAN` | $0.00 (0.0%) | $1,421.00 *(2% Prompt Pay)* |
| **Triathlon Primary Tibial Baseplate Size 4** | 5520-B-400 | 1 | $1,950.00 | $980.00 | $980.00 | `MATCHED_CLEAN` | $0.00 (0.0%) | $960.40 *(2% Prompt Pay)* |
| **Triathlon X3 Polyethylene Insert 9mm** | 5532-P-409 | 1 | $1,200.00 | $550.00 | $610.00 | `PRICE_VARIANCE_BREACH` | +$60.00 (+10.9%) | **FLAGGED FOR REVIEW** |
| **Triathlon Symmetric Patella 32mm** | 5550-P-320 | 1 | $650.00 | $320.00 | $320.00 | `MATCHED_CLEAN` | $0.00 (0.0%) | $313.60 *(2% Prompt Pay)* |

#### Financial Analysis:
1. **Total Contracted Construct Cost:**  
   $$\$1,450.00 + \$980.00 + \$550.00 + \$320.00 = \mathbf{\$3,300.00}$$
2. **Vendor Billed Construct Total:**  
   $$\$1,450.00 + \$980.00 + \$610.00 + \$320.00 = \mathbf{\$3,360.00}\quad (+\$60.00\ \text{Variance})$$
3. **Payer Billing & Reimbursement:**
   - Facility Chargemaster Gross Charge (Markup @ 2.5×): $\$3,300.00 \times 2.50 = \$8,250.00$
   - Medicare ASC Final Payment for CPT 27447 (Device-Intensive): $\$10,250.00$
4. **Direct Cost Accounting:**
   - Net Implant Cost (Assuming $60 breach approved by CFO): $\$3,360.00 \times 0.98 = \$3,292.80$
   - Surgical Supplies & Drapes: $\$450.00$
   - Anesthesia & Medications: $\$180.00$
   - Instrument Tray Sterilization: $\$120.00$
   - Direct OR Labor (110 minutes @ $18/min): $\$1,980.00$
   - OR Room Overhead (110 minutes @ $15/min): $\$1,650.00$
   - **Total Case Direct Cost:** $\$3,292.80 + \$450.00 + \$180.00 + \$120.00 + \$1,980.00 + \$1,650.00 = \mathbf{\$7,672.80}$
5. **True Case Contribution Margin:**  
   $$\text{Net Contribution Margin} = \$10,250.00 - \$7,672.80 = \mathbf{+\$2,577.20}\quad (\mathbf{25.1\%}\ \text{Margin})$$

*Observation: Notice that if the facility had erroneously used the Chargemaster Gross Charge ($8,250) or List Price ($6,650) to evaluate case profitability, the calculation would be completely inverted or detached from cash reality.*

---

## 9. Security, RBAC, and Tenant Isolation

### 9.1 Tenant Isolation Architecture
Multi-tenancy is strictly enforced across all seven Phase 57 tables:
- **Server-Side Verification:** Facility membership is verified via `public.get_auth_user_facilities()` using PostgreSQL session tokens (`auth.uid()`).
- **Zero Client Trust:** Callers can never provide or forge a `facility_id` in headers or payloads to view another facility's prices.
- **Cross-Facility Poisoning Prevention:** Trigger `prevent_facility_relocation()` prevents mutating the `facility_id` on existing pricing or invoice records.

### 9.2 RBAC Permission Matrix

| Role | `implants.view_costs` | `implants.manage_pricing` | `implants.approve_invoice` | `implants.override_pricing` | `implants.view_variance` | `implants.export_reports` |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Super Admin** | Full Read | Full Write | Full Sign-off | Full Override | Full Read | Unredacted |
| **CFO / Finance Director** | Full Read | Full Write | Full Sign-off | Full Override | Full Read | Unredacted |
| **Facility Admin** | Full Read | Edit Schedules | Full Sign-off | Needs CFO | Full Read | Masked Rebates |
| **Materials / Supply Manager** | Full Read | Draft Schedules | Ingest & Match | Blocked | Full Read | Masked Rebates |
| **Billing / Claim Specialist** | Unit Cost Only | Read-Only | Read-Only | Blocked | Read-Only | Masked Rebates |
| **Clinical Director / Nurse** | Masked [CONFIDENTIAL] | Blocked | Blocked | Blocked | Blocked | Blocked |
| **Surgeon** | Masked [CONFIDENTIAL] | Blocked | Blocked | Blocked | Benchmark Only | Blocked |

### 9.3 Row-Level Security Policies Specification

```sql
-- Enable RLS across all tables
ALTER TABLE public.facility_implant_price_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_implant_sku_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.implant_supplier_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.implant_supplier_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_device_cost_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.implant_benchmark_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_implant_price_audits ENABLE ROW LEVEL SECURITY;

-- 1. Price Schedules: Tenant Read Policy (Restricted to Finance Roles)
CREATE POLICY "facility_implant_price_schedules_select" ON public.facility_implant_price_schedules
    FOR SELECT TO authenticated
    USING (
        facility_id IN (SELECT public.get_auth_user_facilities()) AND
        public.user_has_permission('implants.view_costs')
    );

-- 2. Price Schedules: Tenant Modify Policy (CFO / Admin Only)
CREATE POLICY "facility_implant_price_schedules_modify" ON public.facility_implant_price_schedules
    FOR ALL TO authenticated
    USING (
        facility_id IN (SELECT public.get_auth_user_facilities()) AND
        public.user_has_permission('implants.manage_contracts')
    )
    WITH CHECK (
        facility_id IN (SELECT public.get_auth_user_facilities()) AND
        public.user_has_permission('implants.manage_contracts')
    );

-- 3. Supplier Invoices: Tenant Read Policy
CREATE POLICY "implant_supplier_invoices_select" ON public.implant_supplier_invoices
    FOR SELECT TO authenticated
    USING (
        facility_id IN (SELECT public.get_auth_user_facilities()) AND
        public.user_has_permission('implants.view_costs')
    );

-- 4. Benchmark Prices: Global Read Access (Anonymized peer comparison)
CREATE POLICY "implant_benchmark_prices_select" ON public.implant_benchmark_prices
    FOR SELECT TO authenticated
    USING (
        (facility_id IS NULL OR facility_id IN (SELECT public.get_auth_user_facilities()))
    );
```

### 9.4 Hardened Stored Procedures & Separation of Duties
All authoritative calculation and review routines operate as `SECURITY DEFINER` functions with:
1. `SET search_path = public, pg_temp;` (Prevents search_path hijacking).
2. Explicit check that `auth.uid() IS NOT NULL` and caller belongs to target `facility_id`.
3. Enforcement that the user who ingested or created an invoice line cannot approve their own price breach override (`auth.uid() != created_by`).

---

## 10. Service Layer & API Contracts (`pricingService.js`)

The proposed client service layer `src/lib/pricingService.js` provides deterministic calculation methods wired onto the application singleton `db`.

### 10.1 Service Interface Specification

```javascript
/**
 * Phase 57: Facility Implant Pricing Client Service Layer
 */
export const pricingService = {
  /**
   * Resolve authoritative price hierarchy for a given SKU and surgery date
   * @param {Object} params - { facilityId, skuId, surgeryDate }
   * @returns {Promise<Object>} { resolvedPrice, tier, source, variance, currency }
   */
  async resolveSkuPriceHierarchy({ facilityId, skuId, surgeryDate = null }) {},

  /**
   * Query facility price schedules with filter options
   * @param {Object} filters - { facilityId, vendorId, status, search, limit, offset }
   * @returns {Promise<Object>} { items, totalCount, metrics }
   */
  async getPriceSchedules(filters = {}) {},

  /**
   * Retrieve itemized SKU prices for a specific schedule
   * @param {string} scheduleId 
   * @returns {Promise<Array>} List of SKU prices with discount off list
   */
  async getScheduleSkuPrices(scheduleId) {},

  /**
   * Ingest new supplier invoice header with idempotent duplicate check
   * @param {Object} invoiceData 
   * @returns {Promise<Object>} Created invoice record
   */
  async createSupplierInvoice(invoiceData) {},

  /**
   * Ingest batch invoice lines and execute automated 3-way match
   * @param {string} invoiceId 
   * @param {Array<Object>} lines 
   * @returns {Promise<Object>} { matchedCount, breachCount, lines }
   */
  async processInvoiceLines(invoiceId, lines = []) {},

  /**
   * Authorize / override a price variance breach on an invoice line
   * @param {Object} params - { lineId, approved, rationale, overrideUnitCost }
   * @returns {Promise<Object>} Updated invoice line
   */
  async reviewPriceVariance({ lineId, approved, rationale, overrideUnitCost = null }) {},

  /**
   * Stamp verified actual acquisition cost onto a surgical case_device
   * @param {Object} allocationData - { caseDeviceId, surgeryId, invoiceLineId, tier, netCost }
   * @returns {Promise<Object>} Created allocation record
   */
  async allocateCaseDeviceCost(allocationData) {},

  /**
   * Retrieve regional & GPO benchmark distributions for comparison
   * @param {Object} params - { componentId, skuId, specialty }
   * @returns {Promise<Object>} { benchmark25, median, benchmark75, opportunity }
   */
  async getPriceBenchmarks(params = {}) {},

  /**
   * Calculate case-level total implant cost and margin breakdown
   * @param {string|number} surgeryId 
   * @returns {Promise<Object>} { totalCost, totalCharge, contributionMargin, items }
   */
  async getCaseImplantFinancialSummary(surgeryId) {}
};
```

---

## 11. UI & Workflow Requirements

### 11.1 Dedicated Workspace: Facility Implant Pricing Suite
The user interface is integrated into the ASCANALYST platform under `activeTab === 'facility_implant_pricing'`, conforming strictly to Maestro Design Guidelines (Slate, Emerald, Amber, Blue, Rose; Zero Purple Ban).

### 11.2 Key Views & Components
1. **Pricing Master Ledger & Schedules Explorer:**
   - KPI Summary Cards: Active Schedules, Average Margin Variance, Open Invoices Pending Match, Total Uncontracted Breaches.
   - Schedules Table: Schedule Code, Vendor, Effective Dates, Pricing Model, Tier Count, Status, Actions.
   - Slide-over Drawer: SKU itemized list with List Price, Contract Price, Discount %, Packaging Multiplier.
2. **Three-Way Invoice Reconciliation Workbench:**
   - Split-pane interface: Uploaded Invoice Lines on Left vs. Case Usage & Contract Line on Right.
   - Status Badges:
     - `MATCHED_CLEAN` (Green): Exact match within 0.5% tolerance.
     - `PRICE_VARIANCE_BREACH` (Amber/Red): Billed rate exceeds contract.
     - `QUANTITY_MISMATCH` (Orange): Invoiced qty > Operative usage.
     - `OFF_CONTRACT` (Rose): SKU not covered under Phase 56 contract.
   - Action Bar: "Auto-Match Clean Lines", "Submit Variance to CFO", "Generate Credit Memo Request".
3. **Price Variance & Discrepancy Approval Modal:**
   - Enforces Two-Person Separation of Duties.
   - Displays Side-by-Side: Contract Unit Price ($1,450.00) vs Invoiced Billed Price ($1,580.00) (+$130.00 / +8.9%).
   - Mandatory Rationale field (minimum 10 characters) required when approving an above-contract cost.
4. **Benchmark Analytics & Renegotiation Drill-Down:**
   - Quartile Box-Plot visualization showing current facility contract price vs. 25th percentile, median, and 75th percentile.
   - Annualized Dollar Opportunity Calculator.
5. **Component UI States:**
   - **Loading State:** Skeleton table rows with pulse animation.
   - **Empty State:** Clean graphic with call to action: "No pricing schedules active for this vendor. Ingest contract schedule or import supplier invoice."
   - **Stale Price Warning Banner:** Amber alert when a pricing schedule has expired or is within 30 days of termination.
   - **Price Conflict Alert:** Red banner when two overlapping active prices are detected for the same SKU.
   - **Permission-Denied Masking:** Replaces dollar values with `[CONFIDENTIAL - FINANCE RESTRICTED]` for clinical and nursing roles lacking `implants.view_costs`.

---

## 12. Auditability, Provenance & Historical Integrity

### 12.1 The Historical Immutability Invariant
A primary compliance mandate for ASC cost accounting is: **Modifying or renegotiating a current contract price must never rewrite historical surgical case costs.**

- **Mechanism:** When a surgical claim is approved and locked for billing (`case_device_cost_allocations.is_locked_for_billing = TRUE`), its `allocated_unit_acquisition_cost` becomes strictly immutable.
- The trigger `fn_prevent_locked_case_cost_mutation()` rejects any `UPDATE` or `DELETE` statement targeting locked cost allocations.
- If a subsequent vendor credit memo is issued 60 days later, the adjustment is recorded as a distinct adjusting journal entry, preserving the original audited case baseline.

### 12.2 Provenance Tracing Ledger (`facility_implant_price_audits`)
Every price change, schedule approval, manual override, and invoice reconciliation records:
- Operating Facility ID and User Session ID (`performed_by = auth.uid()`).
- High-precision timestamp (`created_at`).
- Full JSONB state diff: `{ "old_values": { "contract_unit_price": 1450.00 }, "new_values": { "contract_unit_price": 1520.00 } }`.
- Mandatory textual rationale (e.g., "Vendor annual inflation escalator applied per Amendment #2").

---

## 13. QA Test Matrix & Acceptance Criteria

### 13.1 Comprehensive Test Plan (Phase 57)

| Test ID | Test Category | Scenario / Assertion Tested | Expected Outcome |
| :--- | :--- | :--- | :--- |
| **P57-TST-001** | Schema & DDL | Execute forward migration `032_facility_implant_pricing.sql` and down migration `032_..._down.sql`. | All 7 tables, triggers, indexes, and constraints create and tear down cleanly without error. |
| **P57-TST-002** | Effective Dates | Insert schedule with `effective_to < effective_from`. | Check constraint `chk_price_schedule_dates` aborts with check constraint violation. |
| **P57-TST-003** | Partial Unique Index | Attempt to create two active prices for identical SKU in overlapping date window for same facility. | Unique index `uq_facility_sku_price_active` aborts with duplicate key violation. |
| **P57-TST-004** | Separation of Duties | Creator attempts to approve their own price schedule (`approved_by = created_by`). | Trigger rejects with `AUTHORIZATION VIOLATION: Creator cannot approve their own schedule`. |
| **P57-TST-005** | Numeric Precision | Insert unit price `$1,450.2550` and package quantity `5`. | Precision preserved without floating-point rounding truncation; package price computed as `$7,251.2750`. |
| **P57-TST-006** | Invoice Balance | Insert invoice where `total_amount != subtotal + freight + tax - discount`. | Check constraint `chk_invoice_balance` aborts with constraint error. |
| **P57-TST-007** | Idempotent Ingestion | Ingest duplicate vendor invoice with identical `(facility_id, vendor_id, invoice_number)`. | Unique index `uq_supplier_invoice_vendor_number` aborts with duplicate key error. |
| **P57-TST-008** | Hierarchy Step 1 | Query price for SKU with active contract schedule. | Returns exact `contract_unit_price` with tier `VERIFIED_CONTRACT_PRICE`. |
| **P57-TST-009** | Hierarchy Step 2 | Query price for SKU without schedule line, but covered under Phase 56 Contract Scope. | Computes `list_price * (1 - discount)` with tier `CONTRACT_SCOPE_DISCOUNT`. |
| **P57-TST-010** | Hierarchy Step 3 | Query price for uncontracted SKU. | Returns `NULL` with tier `OFF_CONTRACT_UNAUTHORIZED`; blocks silent fallback. |
| **P57-TST-011** | 3-Way Match Clean | Invoiced rate matches contracted rate within $0.00 variance. | Line marked as `MATCHED_CLEAN`. |
| **P57-TST-012** | Price Breach Queue | Invoiced rate is $1,600 vs Contract rate $1,450 (+$150 breach). | Line flagged as `PRICE_VARIANCE_BREACH`; routes to CFO exception queue. |
| **P57-TST-013** | Variance Sign-off | CFO approves price breach with 15-character rationale. | Match status transitions to `MANUALLY_APPROVED` with recorded audit entry. |
| **P57-TST-014** | Case Cost Lock | Attempt to update `allocated_unit_acquisition_cost` on locked case device. | Trigger `fn_prevent_locked_case_cost_mutation` raises compliance exception. |
| **P57-TST-015** | Surgery Sync | Add 2 case devices ($1,200 and $800) to surgery #101. | Trigger `fn_sync_surgery_implants_cost` updates `surgeries.implants_cost` to exactly `$2,000.00`. |
| **P57-TST-016** | RLS Isolation | Authenticated user from Facility B queries invoices belonging to Facility A. | Query returns zero rows (Tenant isolation verified). |
| **P57-TST-017** | RLS Cost Masking | User without `implants.view_costs` queries `facility_implant_sku_prices`. | Query returns zero rows or rejects access. |
| **P57-TST-018** | Benchmark Boxplot | Query benchmark percentiles for Total Knee Femoral Component. | Percentiles satisfy: `P75 ($1,650) >= Median ($1,400) >= P25 ($1,250)`. |
| **P57-TST-019** | Maestro Guideline | Scan JSX and CSS code for banned purple/violet/magenta/fuchsia tokens. | Zero matches detected across codebase. |
| **P57-TST-020** | Build Integrity | Execute `npm run build` and `npm run lint`. | Build completes in < 8s; zero ESLint errors. |

---

## 14. Dependencies, Risks, and Implementation Plan

### 14.1 Sequential Migration Dependency Chain
Phase 57 relies on the sequential integrity of the database schema pipeline:
```
Migration 028 (Phase 53: Implant Vendors)
   └── Migration 029 (Phase 54: Implant Product SKUs & List Price)
          └── Migration 030 (Phase 55: Vendor-Component Mapping Matrix)
                 └── Migration 031 (Phase 56: Facility Vendor Contracts & Scopes)
                        └── Migration 032 (Phase 57: Facility Implant Pricing Schedules & Invoices)
```
*Note:* As verified in previous audit turns, attempting to run `032` before `029`, `030`, or `031` will trigger PostgreSQL relation errors (`42P01`). All migrations must execute in strict sequential order.

### 14.2 Key Risks & Mitigations

| Risk | Impact | Architectural Mitigation |
| :--- | :--- | :--- |
| **Vendor Invoice Format Diversity** | Electronic invoices arrive as scanned PDFs, CSVs, or proprietary distributor spreadsheets. | Normalized intermediate parsing schema (`implant_supplier_invoice_lines`) with automated catalog matching and manual reconciliation fallback. |
| **Silent Historical Drift** | Updating contract terms causes historical closed surgeries to recalculate margins. | Hardened database lock trigger (`fn_prevent_locked_case_cost_mutation`) ensuring completed cases reference immutable frozen allocations. |
| **Consignment Reconciliation Lag** | Consignment usage is billed 30–60 days after surgery date. | Tier 2 `ACCRUED_CONTRACT` pricing holds cost liability until Tier 1 invoice matching occurs. |
| **Uncontracted Hardware Creep** | Surgeons request non-formulary custom revision implants during complex trauma cases. | Sourcing Authorization Simulator (Phase 56) and Pre-Bill Rule `IMP-005` flag uncontracted items immediately. |

---

## 15. Definition of Done & Sign-Off

### 15.1 Production Definition of Done Checklist
- [x] **Architecture Specification Complete:** Fully authored in `docs/phases/57_FACILITY_IMPLANT_PRICING.md`.
- [x] **Price Definitions Formalized:** Strict distinction among List, Contract, Invoice, Actual Acquisition, Historical, Benchmark, Gross Charge, and Reimbursement.
- [x] **Separate Price Hierarchies Defined:** 5 independent resolution workflows specified without universal silent fallbacks.
- [x] **Normalized Data Model Specified:** 7-table schema with UUID primary keys, decimal precision (`NUMERIC(12, 4)` / `NUMERIC(12, 2)`), effective dates, and audit triggers.
- [x] **Invoice 3-Way Match & Reconciliation Rules:** Match engine, packaging multipliers, freight/tax allocation, and duplicate detection specified.
- [x] **Financial Formulas Documented:** Deterministic equations with worked clinical total joint replacement example.
- [x] **Security, RLS & RBAC Matrix Defined:** Tenant isolation, cost masking, separation of duties, and AI parity established.
- [x] **Service Layer Contract Defined:** `pricingService.js` method signatures and return shapes specified.
- [x] **UI Workspace Specified:** Pricing Ledger, Invoice Reconciliation Workbench, Variance Approval Modal, and Maestro Compliance.
- [x] **Auditability & Provenance Guaranteed:** Locked case cost triggers and JSONB audit logging.
- [x] **QA Matrix Defined:** 20 granular automated unit, integration, and security test cases.
- [x] **Read-Only Audit Maintained:** Zero migrations executed, zero schema modifications, zero code mutations.

---

### 15.2 Final Readiness Verdict

$$\mathbf{VERDICT:\ GO\ FOR\ SPECIFICATION}$$

**Summary:** The architectural requirements, data model, calculation rules, security boundaries, and service interfaces for **Phase 57: Facility Implant Pricing** are complete, fully validated against the existing repository evidence, and ready for production implementation following sequential migration `032`.
