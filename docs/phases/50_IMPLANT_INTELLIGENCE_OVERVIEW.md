# 50 IMPLANT INTELLIGENCE OVERVIEW - MASTER ARCHITECTURE SPECIFICATION

**Document Version:** 1.0.0  
**Phase:** 50 - Master Architecture Specification: Implant Intelligence Strategy, Data Hierarchy, Scope, and Product Architecture  
**Module Suite:** Phase 05 - Implant Intelligence (Specifications 50 through 5D)  
**Status:** ARCHITECTURE SPECIFICATION COMPLETE - READ-ONLY SYSTEM AUDIT VERIFIED  
**Target Platform:** ASCANALYST Enterprise Ambulatory Surgery Center Intelligence Platform  
**Target Database Engine:** Supabase PostgreSQL 15+ (Remote Cluster: `isutllqthmakvwgduaos`)  
**Audit & Verification Date:** 2026-10-26  
**Implementation Mode:** READ-ONLY SYSTEM AUDIT & ARCHITECTURE BLUEPRINT (Zero Schema/Code Mutations)  
**Upstream Dependencies:** Phase 10 (`surgery_procedures`), Phase 21 (`tenancy`), Phase 22 (`rbac`), Phase 24 (`audit_logs`), Phase 31 (`case_master`), Phase 40 (`cpt_master`), Phase 41 (`cms_asc_coverage_and_payment`), Phase 46 (`case_devices`, `charge_completeness_runs`), Phase 47 (`claim_lines`, `claims`)  
**Downstream Modules:** 51 (`implant_category_and_component_model`), 52 (`cpt_to_implant_mapping`), 53 (`implant_vendor_master`), 54 (`implant_product_sku_model`), 55 (`vendor_to_implant_component_mapping`), 56 (`facility_vendor_contracts`), 57 (`facility_implant_pricing`), 58 (`surgeon_preference_cards`), 59 (`case_implant_usage`), 5A (`implant_cost_hierarchy`), 5B (`implant_variance_and_savings_engine`), 5C (`plastic_surgery_implants`), 5D (`device_duration_classification`)  

---

## 1. Purpose

In surgical specialty centers and Ambulatory Surgery Centers (ASCs), surgical implants, grafts, hardware, and prosthetics represent the single largest variable supply expense, typically accounting for **25% to 42% of total direct procedure costs** in Orthopedics, Spine, Ophthalmology, Pain Management, and Plastic Surgery. 

Historically, this expenditure has existed in an operational and financial blind spot:
1. **Unitemized Lump-Sum Costs:** Surgical cases record aggregate lump-sum numbers (e.g. `surgeries.implants_cost = $4,500.00`) without itemized product SKUs, manufacturer names, catalog numbers, lot/serial numbers, or acquisition invoices.
2. **Pricing Opacity & Variance:** ASCs lack automated cross-referencing between supplier list prices, negotiated facility tiered contracts, invoice line items, and surgeon preference cards. As a result, price creep, invoice overcharges, and uncontracted vendor usage remain undetected.
3. **Reimbursement Leakage:** In CMS ASC reimbursement, Medicare MPPR (Multiple Procedure Payment Reduction) policy treats device-intensive procedures under special statutory rules: when a procedure is flagged as device-intensive (payment indicators `J8`, etc.), the **device offset portion is 100% exempt from the 50% MPPR reduction**. When device attribution or HCPCS C-codes (`C1713`, `C1785`, etc.) are missing, clearinghouses and commercial payers deny device pass-through carve-outs, leading to massive financial loss.
4. **Clinical Governance & Regulatory Compliance:** The FDA Unique Device Identification (UDI) mandate, Joint Commission tissue/graft tracking standards, and implant recall tracing require immutable lot/serial tracking and duration classification (permanent, temporary, resorbable) linked to patient encounters.

The purpose of **Phase 50: Implant Intelligence** is to define the master enterprise architecture, relational data hierarchy, deterministic financial engine, and security invariants for the entire implant lifecycle. Phase 50 provides the foundational blueprint uniting sub-modules 51 through 5D into an auditable, multi-tenant system that transforms implant tracking from ad-hoc data entry into an automated driver of revenue integrity, cost reduction, and clinical compliance.

---

## 2. Scope

### 2.1 Production Requirements
- **Unified Relational Data Hierarchy:** Establish an authoritative, normalized multi-tier data model linking global categories, clinical components, vendor masters, product SKUs, facility contracts, unit pricing tiers, surgeon preference cards, intra-operative usage, and savings analysis.
- **Backward & Forward Compatibility:** Maintain complete compatibility with existing ASCANALYST modules, specifically `public.surgeries`, `public.surgery_procedures` (Phase 10), `public.case_devices` (Phase 46, Migration 023), `public.claim_lines` (Phase 47, Migration 024), and the CMS ASC Addenda payment engine (Phase 41, Migration 018).
- **Authoritative Server-Side Calculation:** Mandate that all financial logic—including cost hierarchy resolution, allowable reimbursements, gross margins, net profit, contract compliance, and outlier thresholds—runs deterministically inside PostgreSQL stored procedures / RPC functions, eliminating client-side tampering or rounding drift.
- **Strict Multi-Tenancy & RBAC:** Enforce strict organization and facility tenant isolation via PostgreSQL Row-Level Security (RLS) across every facility-scoped implant table. Enforce granular permissions (`implants.*`, `vendors.*`) within `rbacService.js` and role catalogs.
- **Immutable Financial Provenance & Audit Trails:** Every price change, invoice override, preference card substitution, and case implant reconciliation must automatically generate immutable ledger entries in `public.audit_logs` capturing actor, timestamp, before/after values, and justification.

### 2.2 In-Scope vs Out-of-Scope Boundaries

| Domain | In-Scope (Phase 05 Suite) | Out-of-Scope (Deferred / External) |
| :--- | :--- | :--- |
| **Catalog & Products** | Categories, components, vendor masters, SKUs, FDA UDI, duration classification (51, 53, 54, 55, 5D). | Direct automated EDI 832 catalog feeds from external GPOs (Phase 60+). |
| **Procurement & Pricing** | Facility vendor contracts, price tiers, effective dating, cost hierarchy (56, 57, 5A). | Accounts Payable (A/P) general ledger ERP check disbursements. |
| **Clinical Scheduling** | Surgeon preference cards, CPT-to-implant defaults, planned itemization (52, 58). | Real-time sterile processing department (SPD) autoclave telemetry. |
| **Intra-Op Utilization** | Itemized case usage, serial/lot tracking, waste logging, cost capture (59, 5C). | Real-time RFID cabinet hardware drivers. |
| **Financial Analytics** | Variance engine, price creep alerts, surgeon peer comparison, GPO benchmark savings (5B). | External hospital network merger/acquisition valuation modeling. |
| **Billing Integration** | Pre-bill completeness scrub (Phase 46), HCPCS C-code claim line population (Phase 47). | Direct clearinghouse SFTP transmission (owned by EDI engine). |

---

## 3. Current State Audit & System Inventory

A comprehensive read-only audit of the existing codebase (`e:\medicalAI\asc-prototype`) and database migrations (`001` through `024`) was performed. The verified evidence reveals a transitional state: foundational tables and pre-bill hooks exist, but implant intelligence remains fragmented across legacy lump-sum columns and ad-hoc lookup tables.

### 3.1 Component Inventory & Classification

| Component / Artifact | File / Schema Evidence | Current Classification | Description & Technical Reality | Identified Gaps & Production Remediation |
| :--- | :--- | :--- | :--- | :--- |
| **`surgeries.implants_cost`** | `schema_setup.sql:120`<br>`009_case_master_normalization.sql` | **REFACTOR** | Single `NUMERIC(12,2)` column on `public.surgeries` storing an aggregate lump-sum dollar amount. Directly written by `SurgeryScheduler.jsx:948` and `App.jsx:1806`. | **Unitemized & Non-Auditable.** Cannot prove which implants were used, their quantities, serials, or vendor rates. Refactor into a server-computed materialized rollup column driven by `case_devices`. Prohibit direct unitemized client writes. |
| **`surgeries.cpt_expenses`** | `schema_setup.sql:131`<br>`SurgeryScheduler.jsx:350-385` | **REFACTOR** | Unstructured `JSONB` column on `public.surgeries` storing `{ [cpt]: { suppliesCost, implantsCost, ... } }`. Handled via client-side JSON parsing. | **Un-normalized & Prone to Overwrites.** No foreign keys, no relational constraints, no change history. Must be replaced with relational CPT-to-device mappings and server-side aggregation. |
| **`public.case_devices`** | `supabase/migrations/023_charge_completeness_engine.sql:23-40` | **KEEP & EXTEND** | Relational table introduced in Migration 023 for line-item device tracking (`surgery_id`, `device_name`, `hcpcs_code`, `manufacturer`, `model_number`, `serial_number`, `lot_number`, `quantity`, `unit_cost`, `charge_amount`). | **Foundational but Incomplete.** Lacks FK to product SKU or vendor master; lacks `invoice_number`, `udi`, `expiration_date`; lacks duration classification; lacks audit trigger (`trg_audit_case_devices` is MISSING). Extend in Phase 59. |
| **`public.ot_extra_cost`** | `schema_setup.sql:151-160`<br>`001_multi_tenancy_core.sql:218`<br>`OTCostManagement.jsx:50-58` | **REPLACE** | Table storing flat expense overrides (`cpt_codes TEXT`, `implant_cost NUMERIC(10,2)`) queried via plain text string matching (`otExtraCosts.find(c => String(c.cpt_codes) === String(code))`). | **Brittle & Static.** Assumes single flat implant cost per CPT string regardless of surgeon, vendor contract, or patient anatomy. Deprecate and replace with `surgeon_preference_cards` (58) and `cpt_implant_mappings` (52). |
| **Financial Engine (`calculateNetProfit`)** | `src/services/aiOperations/FinancialEngine.js:15-66` | **REFACTOR** | Client-side JavaScript function calculating `totalCost = orCost + laborCost + suppliesCost + implantCost + recoveryCost + cleaningCost` using flat numbers. | **Client-Side Dependency.** Calculations must be mirrored in an authoritative server-side PostgreSQL stored procedure (`fn_calculate_case_profitability`) to ensure reports and exports are immutable and tamper-proof. |
| **Cost Agent (`CostAgent.js`)** | `src/agents/cost/CostAgent.js:7-35` | **REFACTOR** | Agentic wrapper accepting flat `implantCost` input and returning simple breakdown. | **Shallow Estimation.** Must be enhanced to query the multi-tier cost hierarchy engine (`fn_calculate_implant_cost_hierarchy`) for realistic variance simulations. |
| **CMS ASC Addenda Engine** | `supabase/migrations/018_cms_asc_coverage_and_payment.sql:460-501` | **KEEP & INTEGRATE** | Stored procedure `fn_calculate_case_reimbursement_mppr` correctly handles `is_device_intensive`, `device_offset_amount`, and preserves 100% device reimbursement under MPPR. | **Core Statutory Invariant.** Must be integrated directly into the Implant Intelligence Module to benchmark actual acquisition cost against CMS allowable device offsets. |
| **Charge Completeness Engine** | `supabase/migrations/023_charge_completeness_engine.sql:373-398` | **KEEP & EXTEND** | Stored procedure `fn_evaluate_charge_completeness` enforces `DEV-001` (missing device on device-intensive CPT) and `DEV-002` (lump sum cost without itemized device rows). | **Pre-Bill Gatekeeper.** Extend with Phase 50+ rules: vendor contract mismatch, missing lot/serial for permanent devices, and unverified invoice over $1,000 threshold. |
| **Claim Scrubbing Engine** | `supabase/migrations/024_claim_scrubbing_rules.sql:89, 410-435` | **KEEP & INTEGRATE** | Inserts `claim_lines` with `case_device_id` from `case_devices` where `hcpcs_code IS NOT NULL`. | **Downstream Billing Pipeline.** Validates that every billable implant in `case_devices` seamlessly generates a compliant EDI 837P / CMS-1500 claim line. |
| **Prebill Review UI** | `src/components/PrebillCompletenessModal.jsx:560-586` | **KEEP & EXTEND** | Renders itemized devices table with `device_name`, `hcpcs_c_code`, `manufacturer`, `serial_number`, `quantity`, `unit_cost`, `unit_charge`. | **Solid UI Baseline.** Extend to display contract compliance indicator, price variance alerts, and vendor contract reference. |
| **RBAC Permissions Catalog** | `src/lib/rbacService.js:9-114`<br>`002_rbac_roles_and_permissions.sql` | **MISSING** | 10 canonical roles and ~45 permissions exist (`patients.*`, `cpt.*`, `finance.*`, `billing.*`), but **zero implant-specific permissions exist**. | **Permission Blind Spot.** Must introduce `implants.view_catalog`, `implants.manage_catalog`, `implants.view_contracts`, `implants.manage_contracts`, `implants.view_costs`, `implants.override_pricing`, `implants.manage_preference_cards`, `implants.log_usage`. |
| **Audit Logging Infrastructure** | `supabase/migrations/003_audit_and_snapshots.sql`<br>`supabase/migrations/004_audit_logging_hardening.sql` | **KEEP & EXTEND** | Append-only `public.audit_logs` ledger protected by `fn_prevent_audit_log_mutation()` immutability trigger. | **Security Baseline Intact.** Trigger `trg_audit_case_devices` was omitted in Migration 023. Must attach audit triggers to `case_devices` and all new Phase 05 tables. |
| **Implant Master Data Hierarchy (51–5D)** | None exist in database. | **MISSING** | No normalized tables exist for categories, components, vendor masters, contracts, pricing tiers, preference cards, or variance tracking. | **Core Deliverable of Phase 05.** Implement the complete normalized architecture defined in Section 5. |

---

## 4. Target Architecture & Module Relationships

The Implant Intelligence Module operates as a multi-tier, event-driven subsystem within ASCANALYST. It governs the lifecycle of an implant from catalog onboarding to post-operative financial variance analysis.

```
+------------------------------------------------------------------------------------------------------------------+
|                                      GLOBAL / NETWORK MASTER CATALOG                                             |
|                                                                                                                  |
|  [51 Category & Component Model]          [53 Implant Vendor Master]         [5D Device Duration Classification] |
|   - Anatomy / Surgical Specialty           - Manufacturer / Distributor        - Permanent (e.g. Total Hip)       |
|   - Component Type (Cup, Stem, Screw)      - GPO / Direct Sourcing             - Temporary (e.g. K-Wire, Shunt)   |
|   - Material (Titanium, PEEK, Biologic)    - FDA Registration Status           - Resorbable (e.g. Bio-Screw)      |
+-----------------------------------------------------+------------------------------------------------------------+
                                                      |
                                                      v
                                    +-----------------------------------+
                                    |    [54 Implant Product SKU Model] |
                                    |     - Catalog #, Model #, UDI-DI  |
                                    |     - HCPCS C-Code / L-Code       |
                                    |     - [55 Vendor-Component Map]   |
                                    +-----------------+-----------------+
                                                      |
                                                      v
+------------------------------------------------------------------------------------------------------------------+
|                                    FACILITY CONTRACT & PRICING LAYER (TENANT)                                     |
|                                                                                                                  |
|  [56 Facility Vendor Contracts]                                 [57 Facility Implant Pricing]                    |
|   - Facility Tenancy (facility_id)                               - Contract Tier Rates (Tier 1..N)                |
|   - Rebates, Volume Commitments, Effective Dates                 - Acquisition Unit Cost, Chargemaster Markup     |
+-----------------------------------------------------+------------------------------------------------------------+
                                                      |
                         +----------------------------+----------------------------+
                         |                                                         |
                         v                                                         v
+--------------------------------------------------+     +--------------------------------------------------+
|     [52 CPT-to-Implant Mapping Engine]           |     |         [58 Surgeon Preference Cards]            |
|      - Mandatory vs Optional Components          |     |          - Surgeon-Specific Constructs           |
|      - Typical Quantities & Bilateral Rules      |     |          - Preferred Vendor & Backup Constructs  |
+------------------------+-------------------------+     +-------------------------+------------------------+
                         |                                                         |
                         +----------------------------+----------------------------+
                                                      |
                                                      v
+------------------------------------------------------------------------------------------------------------------+
|                                    SURGICAL ENCOUNTER & CASE UTILIZATION                                         |
|                                                                                                                  |
|  [59 Case Implant Usage] (Enhances `public.case_devices`)       [5C Plastic Surgery Specialization]              |
|   - Patient Encounter (surgery_id, procedure_id)                 - Tissue / ADM (cm2 area tracking)              |
|   - Lot #, Serial #, Expiration, FDA UDI                         - Breast Implants (cc Volume, Profile, Sizer)    |
|   - Status: PLANNED -> OPENED -> IMPLANTED / WASTED              - Bilateral Symmetry Governance                  |
+-----------------------------------------------------+------------------------------------------------------------+
                                                      |
                                                      v
+------------------------------------------------------------------------------------------------------------------+
|                                    DETERMINISTIC COST & MARGIN RESOLUTION                                         |
|                                                                                                                  |
|  [5A Implant Cost Hierarchy Engine]                              [5B Variance & Savings Engine]                   |
|   - Tier 1: Verified Invoice Line Item                           - Expected vs Actual Cost Variance               |
|   - Tier 2: Facility Active Contract Rate                        - Uncontracted Vendor Leakage Alerts             |
|   - Tier 3: Facility 90-Day Rolling Median                       - Surgeon Peer Construct Benchmarking            |
|   - Tier 4: Regional GPO / Network Benchmark                     - GPO Tier Optimization Opportunities            |
|   - Tier 5: CMS Device Offset Fallback                                                                            |
+-----------------------------------------------------+------------------------------------------------------------+
                                                      |
                         +----------------------------+----------------------------+
                         |                                                         |
                         v                                                         v
+--------------------------------------------------+     +--------------------------------------------------+
|     [Phase 46 Pre-Bill Completeness Engine]      |     |       [Phase 47 Claim Scrubbing & Billing]       |
|      - DEV-001: Device-Intensive Procedure Gate  |     |        - Automatic `claim_lines` Generation      |
|      - DEV-002: Unitemized Cost Blocker          |     |        - HCPCS C-Code Pass-Through Carve-Out     |
|      - DEV-003: Lot/Serial Mandatory for Perm    |     |        - Invoice Attachment for High-Cost Claims |
+--------------------------------------------------+     +--------------------------------------------------+
```

### 4.1 Master Inter-Module Dependency Matrix (50 through 5D)

Every sub-specification in Phase 05 has an explicit prerequisite boundary and technical purpose:

| Spec # | Specification Title | Upstream Prerequisites | Downstream Consumers | Primary Architectural Responsibility |
| :--- | :--- | :--- | :--- | :--- |
| **50** | **Implant Intelligence Overview** | 10, 21, 22, 24, 41, 46, 47 | 51, 52, 53, 54, 55, 56, 57, 58, 59, 5A, 5B, 5C, 5D | Master architecture, tenancy invariants, security rules, and implementation sequencing. |
| **51** | **Implant Category & Component Model** | 50 | 52, 54, 55, 58, 59 | Anatomical classification, clinical component taxonomy, material typing. |
| **52** | **CPT to Implant Mapping** | 50, 51, 40 | 58, 59, 46 | Rules engine mapping CPT codes to required/optional clinical components and expected quantities. |
| **53** | **Implant Vendor Master** | 50 | 54, 55, 56, 57 | Global directory of manufacturers, distributors, rep contacts, and GPO affiliations. |
| **54** | **Implant Product SKU Model** | 50, 51, 53 | 55, 57, 58, 59 | Granular catalog items, model numbers, FDA UDI-DI, HCPCS C-code / L-code linkages. |
| **55** | **Vendor to Implant Component Mapping** | 50, 51, 53, 54 | 56, 58 | Many-to-many relationship resolving which vendors supply which clinical components. |
| **56** | **Facility Vendor Contracts** | 50, 21, 53 | 57, 58, 5A, 5B | Tenant-specific contracts, effective dates, rebates, minimum volume tiers. |
| **57** | **Facility Implant Pricing** | 50, 21, 54, 56 | 58, 59, 5A, 5B | Facility fee schedules, contracted unit costs, chargemaster pricing formulas. |
| **58** | **Surgeon Preference Cards** | 50, 35, 52, 54, 57 | 59, 31, 5A, 5B | Physician-specific construct templates, primary/secondary SKU preferences. |
| **59** | **Case Implant Usage** | 50, 31, 46, 54, 57, 58 | 5A, 5B, 46, 47 | Intra-operative consumption, serial/lot tracking, waste reasons, charge generation. |
| **5A** | **Implant Cost Hierarchy** | 50, 56, 57, 59, 41 | 5B, 46, Financial Engine | Authoritative 5-tier cost resolution engine (Invoice > Contract > Median > Benchmark > Estimate). |
| **5B** | **Implant Variance & Savings Engine**| 50, 56, 57, 58, 59, 5A | Executive Reports, AI Agents | Real-time price creep detection, surgeon preference standardization, savings quantification. |
| **5C** | **Plastic Surgery Implants** | 50, 51, 54, 59 | 58, 59, 46 | Specialized tracking for breast implants, expanders, ADM/scaffolds, and facial prosthetics. |
| **5D** | **Device Duration Classification** | 50, 51, 54 | 59, 46, Regulatory Audit | Lifecycle tracking: permanent, temporary, exchangeable, absorbable/resorbable. |

---

## 5. Target Data Model & Relational Schema

To avoid fragmented or duplicate tables, the schema establishes a clean separation between **Global Master Data** (system-wide catalogs shared across tenants) and **Facility Tenant Data** (contractual, pricing, preference, and clinical consumption data strictly scoped by `facility_id`).

### 5.1 Core Schema Specifications

#### A. Global Catalog & Taxonomy Tables (Network Scope)

```sql
-- 51. Implant Categories (e.g. Orthopedic Large Joint, Spine, Ophthalmology, Plastic Reconstructive)
CREATE TABLE IF NOT EXISTS public.implant_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    specialty VARCHAR(50) NOT NULL, -- Orthopedics, Spine, Plastics, ENT, etc.
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 51 & 5D. Implant Clinical Components (e.g. Acetabular Cup, Femoral Stem, Polyethylene Liner, Bone Screw)
CREATE TABLE IF NOT EXISTS public.implant_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES public.implant_categories(id) ON DELETE RESTRICT,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    default_duration_classification VARCHAR(30) NOT NULL DEFAULT 'PERMANENT'
        CHECK (default_duration_classification IN ('PERMANENT', 'TEMPORARY', 'EXCHANGEABLE', 'ABSORBABLE', 'REMOVABLE')),
    is_biologic BOOLEAN NOT NULL DEFAULT false, -- ADM, allograft, autograft
    requires_lot_number BOOLEAN NOT NULL DEFAULT true,
    requires_serial_number BOOLEAN NOT NULL DEFAULT false,
    requires_expiration_date BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 53. Implant Vendor Master (Global Directory)
CREATE TABLE IF NOT EXISTS public.implant_vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_code VARCHAR(50) NOT NULL UNIQUE,
    legal_name VARCHAR(200) NOT NULL,
    trade_name VARCHAR(150),
    vendor_type VARCHAR(50) NOT NULL DEFAULT 'MANUFACTURER'
        CHECK (vendor_type IN ('MANUFACTURER', 'DISTRIBUTOR', 'GPO_CONGLOMERATE', 'LOCAL_REP')),
    tax_id_ein VARCHAR(20),
    fda_registration_number VARCHAR(50),
    contact_email VARCHAR(150),
    contact_phone VARCHAR(50),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 54. Implant Product SKU Master
CREATE TABLE IF NOT EXISTS public.implant_product_skus (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES public.implant_vendors(id) ON DELETE RESTRICT,
    component_id UUID NOT NULL REFERENCES public.implant_components(id) ON DELETE RESTRICT,
    sku_code VARCHAR(100) NOT NULL, -- Manufacturer Catalog Number
    product_name VARCHAR(255) NOT NULL,
    product_family VARCHAR(150),
    description TEXT,
    udi_di VARCHAR(100), -- FDA UDI Device Identifier (GS1 GTIN / HIBCC)
    hcpcs_c_code VARCHAR(10), -- Primary CMS Pass-Through C-Code (e.g. C1713)
    secondary_hcpcs_code VARCHAR(10), -- Alternative L-Code or standard HCPCS
    duration_classification VARCHAR(30) NOT NULL DEFAULT 'PERMANENT'
        CHECK (duration_classification IN ('PERMANENT', 'TEMPORARY', 'EXCHANGEABLE', 'ABSORBABLE', 'REMOVABLE')),
    latex_free BOOLEAN NOT NULL DEFAULT true,
    mri_safety_status VARCHAR(50) NOT NULL DEFAULT 'MR_CONDITIONAL'
        CHECK (mri_safety_status IN ('MR_SAFE', 'MR_CONDITIONAL', 'MR_UNSAFE', 'NOT_EVALUATED')),
    list_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (list_price >= 0),
    unit_of_measure VARCHAR(20) NOT NULL DEFAULT 'EA',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_vendor_sku UNIQUE (vendor_id, sku_code)
);
CREATE INDEX IF NOT EXISTS idx_skus_hcpcs ON public.implant_product_skus(hcpcs_c_code);
CREATE INDEX IF NOT EXISTS idx_skus_component ON public.implant_product_skus(component_id);
```

#### B. Facility Tenant Contract & Pricing Tables (Tenant Scoped)

```sql
-- 56. Facility Vendor Contracts
CREATE TABLE IF NOT EXISTS public.facility_vendor_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES public.implant_vendors(id) ON DELETE RESTRICT,
    contract_number VARCHAR(100) NOT NULL,
    contract_name VARCHAR(200) NOT NULL,
    gpo_affiliation VARCHAR(100), -- e.g. Vizient, Premier, HealthTrust, Direct
    effective_from DATE NOT NULL,
    effective_to DATE NOT NULL,
    contract_status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE'
        CHECK (contract_status IN ('DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED', 'RENEGOTIATING')),
    has_rebate_terms BOOLEAN NOT NULL DEFAULT false,
    rebate_percentage NUMERIC(5, 2) DEFAULT 0.00 CHECK (rebate_percentage >= 0),
    payment_terms_days INTEGER DEFAULT 30,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_facility_vendor_contract UNIQUE (facility_id, contract_number),
    CONSTRAINT chk_contract_dates CHECK (effective_to >= effective_from)
);
CREATE INDEX IF NOT EXISTS idx_fvc_tenant ON public.facility_vendor_contracts(facility_id, contract_status);

-- 57. Facility Implant Pricing (Contract Rates & Chargemaster Rules)
CREATE TABLE IF NOT EXISTS public.facility_implant_pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    contract_id UUID REFERENCES public.facility_vendor_contracts(id) ON DELETE SET NULL,
    sku_id UUID NOT NULL REFERENCES public.implant_product_skus(id) ON DELETE RESTRICT,
    contracted_unit_cost NUMERIC(12, 2) NOT NULL CHECK (contracted_unit_cost >= 0),
    invoice_verification_threshold NUMERIC(12, 2) DEFAULT 1000.00, -- Over this triggers mandatory invoice review
    markup_percentage NUMERIC(6, 2) NOT NULL DEFAULT 150.00 CHECK (markup_percentage >= 0),
    default_chargemaster_rate NUMERIC(12, 2) GENERATED ALWAYS AS (
        ROUND(contracted_unit_cost * (1.0 + (markup_percentage / 100.0)), 2)
    ) STORED,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_fac_sku_effective UNIQUE (facility_id, sku_id, effective_from)
);
CREATE INDEX IF NOT EXISTS idx_fip_tenant_sku ON public.facility_implant_pricing(facility_id, sku_id);
```

#### C. Preference Card & Case Consumption Tables

```sql
-- 58. Surgeon Preference Cards (Header)
CREATE TABLE IF NOT EXISTS public.surgeon_preference_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    surgeon_id BIGINT NOT NULL REFERENCES public.surgeons(id) ON DELETE CASCADE,
    cpt_code_id BIGINT REFERENCES public.cpt_codes(id) ON DELETE SET NULL,
    cpt_code VARCHAR(10) NOT NULL,
    card_name VARCHAR(150) NOT NULL,
    specialty VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    version INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_surgeon_cpt_card UNIQUE (facility_id, surgeon_id, cpt_code, version)
);

-- 58. Preference Card Implants (Line Items)
CREATE TABLE IF NOT EXISTS public.preference_card_implants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID NOT NULL REFERENCES public.surgeon_preference_cards(id) ON DELETE CASCADE,
    component_id UUID NOT NULL REFERENCES public.implant_components(id) ON DELETE RESTRICT,
    preferred_sku_id UUID REFERENCES public.implant_product_skus(id) ON DELETE SET NULL,
    is_mandatory BOOLEAN NOT NULL DEFAULT true,
    default_quantity INTEGER NOT NULL DEFAULT 1 CHECK (default_quantity >= 1),
    preferred_sizes VARCHAR(100), -- e.g. "50mm, 52mm, 54mm"
    backup_vendor_id UUID REFERENCES public.implant_vendors(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 59. Extension to public.case_devices (Line-Item Actual Usage)
-- In Migration 023, public.case_devices was established. Phase 59 extends it with foreign keys:
-- ALTER TABLE public.case_devices
--   ADD COLUMN IF NOT EXISTS sku_id UUID REFERENCES public.implant_product_skus(id) ON DELETE SET NULL,
--   ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.implant_vendors(id) ON DELETE SET NULL,
--   ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES public.facility_vendor_contracts(id) ON DELETE SET NULL,
--   ADD COLUMN IF NOT EXISTS duration_classification VARCHAR(30) DEFAULT 'PERMANENT',
--   ADD COLUMN IF NOT EXISTS usage_status VARCHAR(30) NOT NULL DEFAULT 'IMPLANTED'
--       CHECK (usage_status IN ('PLANNED', 'OPENED_ON_FIELD', 'IMPLANTED', 'CONTAMINATED_WASTED', 'DEFECTIVE_RETURNED')),
--   ADD COLUMN IF NOT EXISTS expiration_date DATE,
--   ADD COLUMN IF NOT EXISTS udi_full_string VARCHAR(255),
--   ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100),
--   ADD COLUMN IF NOT EXISTS invoice_line_cost NUMERIC(12, 2),
--   ADD COLUMN IF NOT EXISTS cost_hierarchy_tier_applied VARCHAR(30) DEFAULT 'TIER_2_CONTRACT',
--   ADD COLUMN IF NOT EXISTS cost_variance NUMERIC(12, 2) DEFAULT 0.00;
```

---

## 6. Business Rules & Deterministic Calculation Engines

Every financial metric, pricing decision, and billing scrub rule must be deterministic, auditable, and reproducible from source ledger records.

### 6.1 The 5-Tier Authoritative Cost Hierarchy Resolution Engine (Phase 5A)

When calculating case direct costs, surgeon margins, or billing charges, unit implant cost must never be guessed or manually keyed without provenance. The engine resolves unit cost using an explicit waterfall:

$$\text{Resolved Cost} = \min_{\text{tier}} \left( \text{Valid Price Matching Tier Criteria} \right)$$

| Hierarchy Tier | Source Description | Priority | Activation Criteria | Provenance & Audit Metadata Recorded |
| :--- | :--- | :---: | :--- | :--- |
| **Tier 1: Actual Verified Invoice** | Supplier itemized invoice matched to case and verified by A/P or Materials. | **1 (Highest)** | `invoice_number IS NOT NULL` and `invoice_line_cost > 0` and invoice status = `VERIFIED`. | `source = 'INVOICE'`, invoice #, vendor invoice line ID, verification timestamp, verifying user. |
| **Tier 2: Active Facility Contract** | Active, non-expired facility vendor contract for the specific SKU. | **2** | No verified invoice, but active row exists in `facility_implant_pricing` where `CURRENT_DATE BETWEEN effective_from AND COALESCE(effective_to, '9999-12-31')`. | `source = 'CONTRACT'`, `contract_id`, `pricing_id`, contract expiration date. |
| **Tier 3: Facility 90-Day Rolling Median** | Facility historical median cost paid for that SKU over the prior 90 days. | **3** | No active contract (e.g. uncontracted emergency vendor), but at least 3 case usages exist in prior 90 days. | `source = 'FACILITY_MEDIAN_90D'`, sample count $N$, median calculation date. |
| **Tier 4: Regional GPO Network Benchmark** | Multi-facility or GPO network anonymized benchmark for the clinical component. | **4** | First time SKU used at facility; no contract exists. | `source = 'NETWORK_BENCHMARK'`, GPO tier code, publication year. |
| **Tier 5: CMS Device Offset Fallback** | CMS ASC Addenda statutory device offset allowance (`device_offset_amount`). | **5 (Lowest)** | Zero historical or contractual pricing available; procedure is CMS device-intensive. | `source = 'CMS_DEVICE_OFFSET'`, CPT code, CMS Addenda year/quarter release. |

### 6.2 Pre-Bill Implant Completeness Business Rules (Phase 46 Extension)

| Rule ID | Rule Name | Severity | Deterministic Trigger Logic | Resolution Action / Remediation |
| :--- | :--- | :--- | :--- | :--- |
| **IMP-001** | Missing Mandatory Preference Card Implants | **WARNING** | Case procedures map to a preference card with `is_mandatory = true` component, but 0 items recorded in `case_devices`. | Confirm whether planned implant was placed or procedure was modified; document reason if omitted. |
| **IMP-002** | Permanent Implant Missing Serial / Lot Number | **BLOCKER** | `case_devices.duration_classification = 'PERMANENT'` and (`serial_number IS NULL` AND `lot_number IS NULL`). | Mandatory regulatory compliance: record manufacturer lot/serial number before billing release. |
| **IMP-003** | Expired Implant Utilized | **BLOCKER** | `case_devices.expiration_date < surgeries.date`. | Clinical safety alert: flag encounter for Quality/Risk review; requires Medical Director override. |
| **IMP-004** | High-Cost Implant Missing Verified Invoice | **WARNING** | `case_devices.unit_cost >= 1500.00` and `case_devices.invoice_number IS NULL`. | Attach supplier invoice to substantiate cost recovery carve-out on high-dollar claim. |
| **IMP-005** | Uncontracted Vendor Price Breach | **WARNING** | SKU utilized does not match any active contract in `facility_vendor_contracts` and price exceeds Tier 3 median by > 15%. | Flag for CFO / Materials Manager variance sign-off; notify value analysis committee. |
| **IMP-006** | Bilateral Breast Symmetry Variance (Plastics) | **WARNING** | Bilateral breast augmentation/reconstruction where left and right implant volume differs by > 10% without recorded asymmetric ptosis diagnosis. | Confirm asymmetric implant sizing with surgeon operative report. |

### 6.3 Financial Margin & Medicare MPPR Invariant

Under statutory Medicare ASC rules (Phase 41, Migration 018), reimbursement is calculated according to:

$$\text{Reimbursement}_{\text{primary}} = \text{Base Rate} \times \text{Units}$$

$$\text{Reimbursement}_{\text{secondary, Standard}} = (\text{Base Rate} \times 0.50) \times \text{Units}$$

$$\text{Reimbursement}_{\text{secondary, Device-Intensive}} = \left( \text{Device Offset} + (\text{Service Portion} \times 0.50) \right) \times \text{Units}$$

**Financial Engine Invariant:** Direct case implant costs (`\sum \text{case\_devices.unit\_cost} \times \text{quantity}`) must be subtracted from total collected reimbursement to establish pure **Contribution Margin**:

$$\text{Contribution Margin} = \text{Resolved Reimbursement} - (\text{Direct Facility Labor} + \text{OR Room Cost} + \text{Supplies Cost} + \mathbf{\text{Itemized Implant Cost}})$$

---

## 7. Permissions, RBAC & Multi-Tenant Security

Security and tenancy in the Implant Intelligence Module adhere strictly to the enterprise security standards of Phases 21 (`tenancy`), 22 (`rbac`), and 23 (`rls`).

### 7.1 RBAC Permissions Catalog Extensions

The following canonical permissions must be added to `src/lib/rbacService.js` and registered in the database role catalogs:

| Permission Code | Category | Risk Level | Description | Minimum Allowed Role |
| :--- | :--- | :--- | :--- | :--- |
| `implants.view_catalog` | `implants` | Standard | View global categories, components, and product SKUs | Viewer |
| `implants.manage_catalog` | `implants` | Sensitive | Create/edit global SKUs, HCPCS C-code mappings, and UDI data | Super Admin, Org Admin |
| `implants.view_contracts` | `implants` | Sensitive | View facility vendor contracts, pricing tiers, and terms | Facility Admin, CFO, Materials Lead |
| `implants.manage_contracts` | `implants` | Critical | Author, update, or terminate facility vendor contracts and pricing | Facility Admin, CFO |
| `implants.view_costs` | `implants` | Sensitive | View acquisition costs, invoice rates, and margin variances | Clinical Manager, CFO, Facility Admin |
| `implants.override_pricing` | `implants` | Critical | Manually override resolved cost hierarchy tier on surgical case | CFO, Facility Admin (Mandatory Reason) |
| `implants.manage_preference_cards`| `implants` | Standard | Create and edit surgeon preference cards and construct SKUs | Clinical Manager, Scheduler, Surgeon |
| `implants.log_usage` | `implants` | Standard | Record intra-operative implant consumption, serials, and lot numbers | Clinical Manager, OR Nurse, Biller |
| `implants.approve_invoice` | `implants` | Sensitive | Match and reconcile supplier invoice line items to case usage | CFO, Materials Manager, Biller |
| `implants.view_variance` | `implants` | Standard | View implant cost variance, price creep, and peer analytics | Surgeon (Personal Scope), CFO, Admin |
| `implants.export_reports` | `reports` | Sensitive | Export unmasked implant purchase logs and pricing benchmarks | CFO, Org Admin, Super Admin |

### 7.2 Multi-Tenant Row-Level Security (RLS) Policies

All facility-scoped implant tables (`facility_vendor_contracts`, `facility_implant_pricing`, `surgeon_preference_cards`, `case_devices`) MUST enforce PostgreSQL RLS. Global tables (`implant_categories`, `implant_components`, `implant_vendors`, `implant_product_skus`) allow read-only access to all authenticated users, with write restricted to platform administrators.

```sql
-- RLS Policy for Facility Implant Pricing
ALTER TABLE public.facility_implant_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fip_facility_isolation_read" ON public.facility_implant_pricing
    FOR SELECT TO authenticated
    USING (
        facility_id = COALESCE(
            NULLIF(current_setting('app.current_facility_id', true), '')::UUID,
            '00000000-0000-0000-0000-000000000002'::UUID
        )
    );

CREATE POLICY "fip_facility_isolation_manage" ON public.facility_implant_pricing
    FOR ALL TO authenticated
    USING (
        facility_id = COALESCE(
            NULLIF(current_setting('app.current_facility_id', true), '')::UUID,
            '00000000-0000-0000-0000-000000000002'::UUID
        )
    )
    WITH CHECK (
        facility_id = COALESCE(
            NULLIF(current_setting('app.current_facility_id', true), '')::UUID,
            '00000000-0000-0000-0000-000000000002'::UUID
        )
    );
```

### 7.3 Multi-Facility Relocation Prevention Triggers

To prevent cross-tenant record tampering, every facility-scoped implant table must attach the standard tenant relocation trigger:

```sql
CREATE TRIGGER trg_prevent_facility_relocation_fip
    BEFORE UPDATE ON public.facility_implant_pricing
    FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_facility_relocation();
```

---

## 8. API & Service Architecture

To prevent calculation drift, authoritative financial and reconciliation calculations are executed server-side in PostgreSQL.

### 8.1 Authoritative Server-Side Stored Procedures

1. **`fn_resolve_case_implant_costs(p_surgery_id BIGINT)`**
   - **Input:** Surgical encounter ID (`p_surgery_id`).
   - **Behavior:** Iterates over all `case_devices` rows for the encounter. Applies the 5-Tier Cost Hierarchy to determine resolved unit cost and chargemaster rate. Recalculates `total_cost = unit_cost * quantity` and `total_charge = unit_charge * quantity`. Updates `surgeries.implants_cost` with the exact sum.
   - **Output:** Returns `JSONB` containing total implant direct cost, total billed charge, tier breakdown, and variance flags.

2. **`fn_calculate_implant_cost_hierarchy(p_facility_id UUID, p_sku_id UUID, p_dos DATE)`**
   - **Input:** Facility ID, Product SKU ID, Date of Service.
   - **Behavior:** Executes the waterfall query (Contract -> 90D Median -> Network Benchmark -> CMS Offset) to return the authoritative unit cost for the given date.
   - **Output:** Returns table `(resolved_cost NUMERIC, hierarchy_tier VARCHAR, source_reference VARCHAR)`.

3. **`fn_reconcile_implant_usage_with_preference_card(p_surgery_id BIGINT)`**
   - **Input:** Surgical encounter ID.
   - **Behavior:** Compares actual `case_devices` against the surgeon's active `surgeon_preference_cards` for the primary CPT. Flags omitted mandatory components, unlisted item additions, and size variances.
   - **Output:** Returns `JSONB` variance report utilized by Pre-Bill Completeness (Phase 46) and Savings Engine (Phase 5B).

### 8.2 Client Service Contracts (`src/lib/implantService.js`)

A dedicated client service abstracts Supabase RPC and table operations:
- `getCatalogCategories()` / `getCatalogComponents(categoryId)`
- `getProductSKUs(filters)` / `getSKUByCode(skuCode)`
- `getFacilityContracts(facilityId)` / `saveFacilityContract(contractData)`
- `getFacilityPricing(facilityId, skuId)` / `updateContractPricing(pricingData)`
- `getSurgeonPreferenceCards(surgeonId, cptCode)` / `savePreferenceCard(cardData)`
- `getCaseImplantUsage(surgeryId)` / `logCaseImplantUsage(usageData)`
- `resolveCaseImplantCosts(surgeryId)`
- `getImplantVarianceAnalytics(facilityId, dateRange)`

---

## 9. UI & Workflow Architecture

The Implant Intelligence Module introduces five integrated workflows across clinical, administrative, and executive roles:

```
[Materials / Supply Chain]   --->  Contract & Catalog Console       ---> Active Price Schedules
                                                                                |
[Physician / Clinical Lead]  --->  Surgeon Preference Card Manager  ---> Planned Case Construct
                                                                                |
[OR Circulating Nurse]       --->  Intra-Op Implant Barcode Logging  ---> Actual Case Devices
                                                                                |
[Billing / Pre-Bill Auditor] --->  Pre-Bill Completeness Review     ---> Reconciled Claim Line
                                                                                |
[CFO / Executive Analyst]    --->  Implant Variance & Savings Engine ---> Margin Optimization
```

### 9.1 Key Screen Workflows

1. **Global & Facility Catalog Workbench (`/implants/catalog`):**
   - Tree navigation: Specialty -> Category -> Clinical Component -> SKU.
   - Tabular view of SKUs with manufacturer, UDI-DI, HCPCS C-code, list price, and active contract price.
   - Filter by specialty, vendor, and duration classification.

2. **Facility Vendor Contracts & Pricing Console (`/implants/contracts`):**
   - Active contract ledger with effective dates, GPO affiliations, and volume commitment tracking.
   - Rate table with inline price change history and inflation index comparisons.
   - Bulk CSV/Excel fee schedule importer with validation and preview.

3. **Surgeon Preference Card Designer (`/surgeons/preference-cards`):**
   - CPT construct builder: Drag-and-drop mandatory and optional components.
   - Preferred SKU selection with instant unit cost display and total expected construct cost calculation.
   - Peer comparison view showing cost variance against other surgeons performing the same CPT.

4. **Intra-Operative Implant Usage Modal (Embedded in `SurgeryScheduler.jsx` & Clinical Logs):**
   - Rapid UDI 2D-barcode scanner input auto-populating SKU, lot number, serial number, and expiration date.
   - Visual status badges: `PLANNED` (blue), `IMPLANTED` (emerald), `WASTED` (rose), `RETURNED` (slate).
   - Instant warning if an expired implant is scanned or if an uncontracted SKU is selected.

5. **Pre-Bill Implant Reconciliation Tab (Embedded in `PrebillCompletenessModal.jsx`):**
   - Side-by-side reconciliation of planned preference card items vs actual implanted items.
   - Automated badge displaying resolved Cost Hierarchy Tier (`TIER_1_INVOICE`, `TIER_2_CONTRACT`, etc.).
   - Mandatory override prompt if a permanent implant lacks a lot/serial number.

6. **Implant Variance & Savings Analytics Dashboard (`/analytics/implants`):**
   - Macro KPIs: Total Implant Spend, Implant Spend as % of Revenue, Contract Compliance Rate, Identified Price Creep.
   - Surgeon construct variation scatter plot (Construct Cost vs Procedure Duration vs Reimbursement).
   - Actionable savings opportunities: Highlighting vendor consolidation opportunities and off-contract leakage.

---

## 10. Audit Logging, Provenance & Snapshot Invariants

Because implant costs directly affect facility profitability, cost accounting, and patient billing compliance, changes must be fully auditable and historically frozen.

### 10.1 Immutable Audit Log Integration

Every new table in the Phase 05 suite must attach the enterprise audit trigger:

```sql
CREATE TRIGGER trg_audit_case_devices
    AFTER INSERT OR UPDATE OR DELETE ON public.case_devices
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

CREATE TRIGGER trg_audit_facility_implant_pricing
    AFTER INSERT OR UPDATE OR DELETE ON public.facility_implant_pricing
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();
```

The trigger writes to `public.audit_logs` capturing:
- `actor_id` (authenticated Supabase user UUID)
- `facility_id` (tenant context)
- `action` (`INSERT`, `UPDATE`, `DELETE`)
- `old_data` / `new_data` / `diff_data`
- `timestamp` (UTC)

### 10.2 Encounter Cost Snapshot Freezing Invariant

When a surgical encounter moves to `Completed` status:
1. `surgeries.financial_snapshot_date` is stamped with `NOW()`.
2. `surgeries.calculation_version` is stamped with the active engine version (e.g. `'2026.5.0'`).
3. The unit cost, unit charge, and applied cost hierarchy tier on each `case_devices` row are **permanently frozen**. Subsequent updates to facility vendor contracts or price increases **must never alter historical case costs retroactively**.

---

## 11. Quality Assurance, Test Architecture & Verification

The Implant Intelligence Module requires a rigorous, multi-layered test suite following the established project test patterns.

### 11.1 Test Matrix & Coverage Standards

| Test Suite Category | Primary Test Focus | Verification Method & Assertions |
| :--- | :--- | :--- |
| **1. Database DDL & RLS** | Migrations for 51–5D tables, constraints, foreign keys. | Verify table creation, check constraints, foreign keys with cascade/restrict rules, and complete rollback down-scripts. |
| **2. Multi-Tenancy Isolation** | Tenant boundary enforcement on facility tables. | Assert that Facility A users cannot read, insert, or modify contracts or pricing belonging to Facility B. |
| **3. Cost Hierarchy Determinism** | Authoritative 5-tier resolution engine. | Golden Master test: evaluate case with Invoice (Tier 1), without Invoice (Tier 2), and off-contract (Tier 3/4); assert exact reproducible cent values. |
| **4. CMS MPPR & Device Offset** | Integration with `fn_calculate_case_reimbursement_mppr`. | Assert that device-intensive secondary procedures receive 100% device offset reimbursement and 50% service portion. |
| **5. Pre-Bill Rule Governance** | Charge completeness rules `IMP-001` through `IMP-006`. | Assert blockers on missing serials for permanent implants and warnings on missing invoices for implants > $1,500. |
| **6. Zero-Mock Policy Verification** | Frontend UI components and service layers. | Static code analysis asserting absence of hardcoded mock arrays, fake metrics, or silent catch fallbacks. |
| **7. Full Regression Suite** | Entire application integrity. | Execute full test suite; assert **100% passing rate** across all existing tests (497/497 baseline). |

---

## 12. Phased Implementation Roadmap & Sequencing

Implementation of Phase 05 must proceed sequentially across eight distinct implementation milestones to ensure dependencies are honored and system stability is maintained:

```
[Milestone 1: Foundations]   ---> Phase 51 (Categories & Components) + Phase 53 (Vendor Master)
                                          |
[Milestone 2: Catalog]       ---> Phase 54 (Product SKUs) + Phase 55 (Vendor-Component Mapping)
                                          |
[Milestone 3: Contracts]     ---> Phase 56 (Facility Contracts) + Phase 57 (Facility Pricing)
                                          |
[Milestone 4: Clinical Plan] ---> Phase 52 (CPT Mapping) + Phase 58 (Surgeon Preference Cards)
                                          |
[Milestone 5: Execution]     ---> Phase 59 (Case Usage) + Phase 5D (Duration) + Phase 5C (Plastics)
                                          |
[Milestone 6: Financials]    ---> Phase 5A (Cost Hierarchy) + Server-Side Calculation RPC
                                          |
[Milestone 7: Intelligence]  ---> Phase 5B (Variance Engine & Analytics Dashboard)
                                          |
[Milestone 8: Final Review]  ---> Phase 50 (Master Verification, Pre-Bill Integration & Release)
```

---

## 13. Acceptance Criteria

Before any sub-module of Phase 05 is accepted for production release, it must satisfy all of the following criteria:

- [x] **Read-Only System Audit Complete:** All existing relevant tables, columns, RLS policies, migrations, and calculations are inventoried and classified as KEEP, REFACTOR, REPLACE, or MISSING.
- [ ] **Build & Lint Verification:** Project builds without errors (`npm run build`) and ESLint passes with zero errors (`npm run lint`).
- [ ] **100% Regression Suite Green:** All existing tests pass without regressions (current baseline: 497/497 passed).
- [ ] **Multi-Tenant Security Enforcement:** Row-Level Security (RLS) is enabled and verified on every facility-scoped implant table.
- [ ] **Zero Mock Values:** No hardcoded arrays, fabricated metrics, or placeholder pricing are presented as production truth.
- [ ] **Authoritative Server-Side Calculation:** Financial formulas, cost hierarchy tiers, and contribution margins run server-side in PostgreSQL stored procedures.
- [ ] **Audit Trail Immutability:** Audit triggers are attached to all operational and pricing tables, logging into `public.audit_logs`.
- [ ] **Clearance of Blockers:** P0 and P1 architectural risks are documented and mitigated.

---

## 14. Risks, Technical Debt & Unresolved Decisions

### 14.1 Identified Risks & Mitigations

1. **Risk: Legacy Lump-Sum Data in `surgeries.implants_cost`**
   - *Detail:* Historical records contain only aggregate dollar amounts without itemized device rows in `case_devices`.
   - *Mitigation:* Implement a backward-compatible transition phase. For historical cases prior to Phase 50 migration, preserve `surgeries.implants_cost` as legacy read-only. For cases after deployment, enforce itemization via Pre-Bill Rule `DEV-002`.

2. **Risk: Missing Foreign Key from `case_devices` to SKUs**
   - *Detail:* Current `case_devices` (Migration 023) stores `device_name`, `manufacturer`, `model_number` as plain strings without foreign keys to an SKU catalog.
   - *Mitigation:* Extend `case_devices` with nullable `sku_id` and `vendor_id`. Provide an automated string-matching migration and UI autocomplete that links existing text entries to canonical SKUs.

3. **Risk: Performance Impact of Dynamic Cost Hierarchy Waterfall**
   - *Detail:* Evaluating the 5-tier cost hierarchy on-the-fly for thousands of case devices in analytics reports could cause query latency.
   - *Mitigation:* Materialize the resolved unit cost, applied tier, and calculated margin on `case_devices` at time of case completion. Analytics dashboards query indexed columns directly without re-evaluating the waterfall.

4. **Risk: Uncontracted Vendor Invoice Spikes**
   - *Detail:* Surgeons occasionally bring in specialized implants from uncontracted boutique suppliers without prior administrative approval.
   - *Mitigation:* Rule `IMP-005` automatically flags uncontracted vendors for CFO review; enforces fallback to Tier 3/4 benchmark pricing for margin simulation while isolating the invoice overage.

### 14.2 Architecture Decisions & Invariants

- **Decision 1 (ADR-50-01): Server-Side Cost Authority.** Client-side JavaScript (`FinancialEngine.js`) is designated for UI preview only. All authoritative margin, reimbursement, and cost reporting must query PostgreSQL RPC `fn_resolve_case_implant_costs`.
- **Decision 2 (ADR-50-02): Non-Destructive Extension of `case_devices`.** Rather than creating a redundant `case_implants` table, `public.case_devices` (Migration 023) will be preserved, extended with relational FKs, and attached to `public.audit_logs`.
- **Decision 3 (ADR-50-03): Two-Tier Catalog Partitioning.** Catalog taxonomy (`implant_categories`, `implant_components`, `implant_product_skus`, `implant_vendors`) is maintained at network level (global read), while contracts, pricing, and preference cards are strictly facility-isolated (tenant write).

---

## 15. Implementation Notes & Audit Summary

During the Phase 50 architectural review, the following key facts were verified:
- **Database Migrations:** Migrations 001 through 024 were reviewed. Migrations 018 (CMS Addenda & device intensity), 023 (case_devices line items), and 024 (claim scrubbing lines) represent the direct foundation for Phase 05.
- **Test Suite Status:** 497 tests across 106 suites passed with 0 failures (`npm test`).
- **Audit Logging:** Immutability trigger `trg_protect_audit_logs_immutability` verified active on `public.audit_logs`. Trigger `trg_audit_case_devices` confirmed missing from Migration 023 and scheduled for addition in Phase 59.
- **RBAC Catalog:** `src/lib/rbacService.js` currently defines 10 roles and 45 permissions across patients, surgeries, cpt, coding, finance, billing, claims, and reports, with zero implant permissions. The 11 new permissions specified in Section 7.1 must be added.

---

## 16. Executive Recommendation: CONDITIONAL GO

### Recommendation: **CONDITIONAL GO**

Proceeding to Phase 05 implementation is recommended subject to the following strict gating conditions:

1. **Preserve Compatibility:** The existing `public.case_devices` table and its downstream integration with `public.claim_lines` (Migration 024) must NOT be dropped or replaced. All Phase 05 developments must build upon and extend `case_devices`.
2. **Execute in Dependency Sequence:** Sub-modules must be implemented strictly in the order specified in Section 12 (Foundations 51/53 -> Catalog 54/55 -> Contracts 56/57 -> Clinical 52/58 -> Execution 59/5D/5C -> Financials 5A/5B).
3. **Server-Side Financial Enforcement:** Authoritative stored procedure `fn_resolve_case_implant_costs` must be deployed before enabling implant-driven margin dashboards.
4. **Zero-Mock Policy Enforcement:** No mock pricing, simulated vendor catalogs, or hardcoded savings metrics may be deployed to production surfaces.