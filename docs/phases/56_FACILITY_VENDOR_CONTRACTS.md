# 56 FACILITY VENDOR CONTRACTS - MASTER ARCHITECTURE SPECIFICATION & AUDIT REPORT

**Document Version:** 1.0.0  
**Phase:** 56 — Facility-Specific Vendor Contracts, Commercial Terms, Effective Dates, and Sourcing Authorization  
**Module Suite:** Phase 05 — Implant Intelligence (Specifications 50 through 5D)  
**Status:** ARCHITECTURE SPECIFICATION COMPLETE — READ-ONLY AUDIT VERIFIED  
**Target Platform:** ASCANALYST Enterprise Ambulatory Surgery Center Intelligence Platform  
**Target Database Engine:** Supabase PostgreSQL 15+ (Remote Cluster: `isutllqthmakvwgduaos`)  
**Audit & Verification Date:** 2026-10-28  
**Implementation Mode:** READ-ONLY SYSTEM AUDIT & ARCHITECTURE BLUEPRINT (Zero Schema/Code Mutations)  
**Upstream Dependencies:** Phase 21 (`public.facilities`, Migration 001/008), Phase 22 (`rbacService.js`), Phase 23 (`rls`), Phase 24 (`public.audit_logs`, Migration 004), Phase 46 (`public.case_devices`, Migration 023), Phase 50 (`implants.*` RBAC, Migration 025), Phase 51 (`public.implant_categories`, `public.implant_components`, Migration 026), Phase 52 (`public.cpt_implant_mappings`, Migration 027), Phase 53 (`public.implant_vendors`, `public.implant_vendor_relationships`, Migration 028), Phase 54 (`public.implant_product_families`, `public.implant_product_skus`, `public.implant_sku_distributor_mappings`, Migration 029), Phase 55 (`public.implant_vendor_component_mappings`, Migration 030)  
**Downstream Modules:** Phase 57 (`public.facility_implant_pricing`), Phase 58 (`public.surgeon_preference_cards`), Phase 59 (`public.case_devices` usage stamping), Phase 5A (`implant_cost_hierarchy`), Phase 5B (`implant_variance_and_savings_engine`), Phase 5C (`plastic_surgery_implants`), Phase 5D (`device_duration_classification`)  

---

## 1. Executive Summary & Readiness Verdict

### 1.1 Purpose & Clinical/Financial Rationale
In Ambulatory Surgery Centers (ASCs), surgical hospitals, and outpatient surgery networks, implantable medical devices (orthopedic total joints, spinal hardware, intraocular lenses, biologic grafts, and surgical fixation screws) constitute the single largest variable supply expense, routinely consuming 25% to 45% of total surgical revenue.

While **Phase 51** established the clinical component taxonomy (`public.implant_components`), **Phase 53** established the master vendor directory (`public.implant_vendors`), **Phase 54** cataloged physical hardware items (`public.implant_product_skus`), and **Phase 55** defined clinical vendor-to-component capability and preference tiering (`public.implant_vendor_component_mappings`), **Phase 56: Facility Vendor Contracts** establishes the legally binding commercial authorization layer.

Phase 56 provides:
1. **Facility-Specific Legal & Commercial Authorization:** Authoritative recording of negotiated commercial agreements between an ASC operating facility and a medical device manufacturer or broadline/consignment distributor.
2. **Contract Scoping & Non-Relational Prevention:** A normalized, relational scoping architecture (`public.facility_vendor_contract_scopes`) supporting vendor-wide coverage, specialty carve-outs, component-level authorizations, product family lines, or specific SKU schedules—strictly prohibiting opaque JSON or unvalidated comma-separated anti-patterns.
3. **Temporal Validity & Effective Date Governance:** Deterministic calendar boundary enforcement (`effective_from` to `effective_to`), automatic expiration handling, renewal notifications, and notice-period alerts.
4. **Commercial Terms Governance:** Comprehensive modeling of payment terms (net days, prompt-pay discounts), freight/delivery conditions (FOB Destination/Origin), consignment governance rules, GPO affiliations (Vizient, Premier, HealthTrust), volume commitment tracking, and confidential rebate tier structures.
5. **Two-Person Approval & Separation of Duties:** Strict lifecycle state machine (`draft → pending_approval → approved → active → suspended / expired / terminated / renewed / amended`) preventing unilateral administrative modifications without supervisory clinical or financial sign-off.
6. **Immutable Historical Provenance:** Contract amendments are modeled as versioned entities preserving complete lineage. Completed historical surgical encounters (`public.case_devices`) permanently retain the contract terms that were in force at the exact date of surgery, completely immune to downstream vendor termination or price revisions.

### 1.2 Readiness Verdict: `GO FOR SPECIFICATION`
**Decision:** **`GO FOR SPECIFICATION`**  
**Justification & Verified Evidence:**
- **Foundational Schema Exists:** Upstream migrations 001 through 030 are fully committed and verified in the repository. All 58 test suites (636/636 tests) pass green with zero regressions.
- **Relational Anchor Entities are Stable:** Master tables `public.facilities(id)` (Migration 001/008), `public.implant_vendors(id)` (Migration 028), `public.implant_components(id)` (Migration 026), and `public.implant_product_skus(id)` (Migration 029) are fully stabilized with immutable UUID primary keys, check constraints, and audit logging triggers.
- **RBAC Foundation is Ready:** Granular permissions `implants.view_contracts` and `implants.manage_contracts` are already seeded in `src/lib/rbacService.js` and registered in `supabase/migrations/025_implant_intelligence_core_and_rbac.sql:27-45`.
- **Downstream Consumer Preparedness:** `public.case_devices` has already been extended with `contract_id UUID` in Migration 025 (`supabase/migrations/025_implant_intelligence_core_and_rbac.sql:152`), waiting for the primary key foreign constraint to be established by Phase 56.
- **Clear Migration Numbering:** The next forward migration slot in the database pipeline is authoritatively determined as `031_facility_vendor_contracts.sql` (with matching down-migration `031_facility_vendor_contracts_down.sql`).
- **No Schema Duplication:** No existing migration or table duplicates multi-facility vendor contract headers, line-item scopes, or contract document attachments.

---

## 2. Scope & Boundary Matrix

### 2.1 Production Requirements
- **Normalized Contract Entity:** Establish `public.facility_vendor_contracts` in Supabase PostgreSQL 15+ with strict tenant foreign keys, unique constraint on `(facility_id, contract_number, amendment_number)`, domain check constraints, and performance indexes.
- **Normalized Contract Scope Entity:** Establish `public.facility_vendor_contract_scopes` linking contracts to covered components, product families, SKUs, or specialties, with explicit inclusion/exclusion (`is_excluded`) flags.
- **Normalized Contract Document Entity:** Establish `public.facility_vendor_contract_documents` linking contracts to uploaded executed PDF agreements, pricing exhibits, and BAAs with SHA-256 cryptographic verification and confidential classification.
- **Temporal Validity & Effective Dating:** Enforce `effective_to >= effective_from`. Deterministically evaluate whether a contract is active on a given procedure date. Prevent overlapping active contracts for identical scopes.
- **Strict Separation of Duties:** Prevent contract creators from approving their own contracts (`auth.uid() != created_by`), requiring CFO, Facility Admin, or Super Admin sign-off.
- **Row-Level Security & Tenant Isolation:** Facility isolation guaranteed by `facility_id IN (SELECT public.get_auth_user_facilities())`. Mask confidential rebate and discount terms from clinical and nursing staff lacking financial clearance (`implants.view_costs`).

### 2.2 Boundary Matrix: In-Scope vs. Out-of-Scope

| Functional Domain | In-Scope (Phase 56: Facility Vendor Contracts) | Out-of-Scope (Owned by Other Phases) |
| :--- | :--- | :--- |
| **Legal & Commercial Existence** | Authoritative existence of legal contract between Facility A and Vendor V (e.g. Master Agreement #STR-2026-01). | Master vendor tax ID, corporate addresses, DUNS numbers, and FDA FEI credentials (Phase 53: Vendor Master). |
| **Contract Scoping & Carve-Outs** | Defining that Contract #101 covers Orthopedics Total Joint components, but excludes custom revision stems. | Granular unit acquisition costs ($1,850.00) and chargemaster markup percentages (150%) (Phase 57: Facility Implant Pricing). |
| **Commercial Terms** | Payment terms (Net 30/45), delivery terms (FOB Destination), consignment audit frequency, GPO tiers, and rebate thresholds. | Intra-operative recording of serial numbers, lot numbers, and operative waste during surgery (Phase 59: Case Implant Usage). |
| **Sourcing Authorization** | Proving that a vendor or distributor is contractually permitted to sell to Facility A within a date window. | Clinical component taxonomy, duration classification, and anatomical classification (Phase 51: Implant Category & Component Model). |
| **Distributor Commercial Linkage** | Specifying authorized billing distributors under a manufacturer agreement. | 3rd-party logistics distributor package configurations (e.g. Box of 5) and catalog cross-references (Phase 54: Product SKU Model). |
| **Surgeon Selection Eligibility** | Providing the list of active, contracted vendors and scopes to filter surgeon preference cards. | Surgeon-specific component preferences and procedure-level standard construct templates (Phase 58: Surgeon Preference Cards). |
| **Pre-Bill Commercial Validation** | Triggering Pre-Bill Rule `IMP-005` (Uncontracted Vendor Price Breach) when a case uses off-contract hardware. | Claim scrubbing rule evaluation, EDI 837P loop generation, and CMS-1500 box population (Phase 47: Claim Scrubbing Rules). |

---

## 3. Current State Audit & System Inventory

A comprehensive audit of the local repository (`e:\medicalAI\asc-prototype`), existing database migrations (`001` through `030`), application services, and type definitions was conducted.

### 3.1 Systematic Component Classification

| Component / Artifact | File / Schema Evidence | Classification | Current Reality & Technical Evidence | Identified Gaps & Production Remediation |
| :--- | :--- | :--- | :--- | :--- |
| **`public.facilities`** | `supabase/migrations/001_multi_tenancy_core.sql:35-75`<br>`supabase/migrations/008_multi_facility_and_single_super_admin.sql:15-55` | **KEEP & INTEGRATE** | Master tenant table defining ASC facilities (e.g., Naples Surgery Center `00000000-0000-0000-0000-000000000002`). | **Authoritative Tenant Anchor.** `facility_vendor_contracts.facility_id` must reference `public.facilities(id) ON DELETE CASCADE`. |
| **`public.implant_vendors`** | `supabase/migrations/028_implant_vendor_master.sql:41-133` | **KEEP & INTEGRATE** | Master directory of device manufacturers, distributors, and tissue banks. Defines vendor codes, status, and tax IDs. | **Authoritative Vendor Anchor.** `facility_vendor_contracts.vendor_id` must reference `public.implant_vendors(id) ON DELETE RESTRICT`. Defensive code in 028 lines 232-235 already anticipates `facility_vendor_contracts`. |
| **`public.implant_vendor_relationships`** | `supabase/migrations/028_implant_vendor_master.sql:151-187` | **KEEP & INTEGRATE** | Junction table mapping authorized distributors to manufacturers across territories. | **Distributor Validation.** When a contract specifies an authorized distributor for delivery/billing, the relationship must validate against this table. |
| **`public.implant_components`** | `supabase/migrations/026_implant_category_and_component_model.sql:156-224` | **KEEP & INTEGRATE** | Master clinical component catalog (e.g. `KNEE_FEMORAL`, `HIP_STEM`, `SPINE_CAGE`). | **Scope Anchor.** `facility_vendor_contract_scopes.component_id` must reference `public.implant_components(id) ON DELETE RESTRICT`. |
| **`public.implant_product_families`** | `supabase/migrations/029_implant_product_sku_model.sql:18-40` | **KEEP & INTEGRATE** | Product line groupings (e.g. 'Triathlon Knee System', 'Trident Acetabular System'). | **Scope Anchor.** `facility_vendor_contract_scopes.family_id` must reference `public.implant_product_families(id) ON DELETE RESTRICT`. |
| **`public.implant_product_skus`** | `supabase/migrations/029_implant_product_sku_model.sql:46-138` | **KEEP & INTEGRATE** | Master catalog of physical implant items with UDI-DI, catalog numbers, HCPCS C-codes. | **Scope Anchor.** `facility_vendor_contract_scopes.sku_id` must reference `public.implant_product_skus(id) ON DELETE RESTRICT`. |
| **`public.implant_vendor_component_mappings`** | `supabase/migrations/030_implant_vendor_component_mapping.sql:15-67` | **KEEP & INTEGRATE** | Phase 55 sourcing governance matrix mapping vendors to clinical components with preference tiers. | **Upstream Sourcing Bridge.** Phase 55 defines *who can supply what*; Phase 56 defines *the formal contract and commercial terms governing that supply*. |
| **`public.case_devices`** | `supabase/migrations/023_charge_completeness_engine.sql:23-40`<br>`supabase/migrations/025_implant_intelligence_core_and_rbac.sql:152` | **REFACTOR / EXTEND** | Intra-operative implant consumption table. `contract_id UUID` was added in Migration 025 without a foreign key. | **Link Foreign Key.** Add `FOREIGN KEY (contract_id) REFERENCES public.facility_vendor_contracts(id) ON DELETE RESTRICT`. |
| **`public.facility_vendor_contracts`** | Referenced conceptually in `50_IMPLANT_INTELLIGENCE_OVERVIEW.md:260-280`. | **MISSING** | Table does not exist in any migration or remote schema. | **Core Deliverable of Phase 56.** Author authoritative DDL blueprint with header, lifecycle, and terms. |
| **`public.facility_vendor_contract_scopes`** | None currently in repository. | **MISSING** | No relational table exists to store contract scopes, component families, or carve-outs. | **Core Deliverable of Phase 56.** Author normalized scope table to prevent unstructured JSON anti-patterns. |
| **`public.facility_vendor_contract_documents`** | None currently in repository. | **MISSING** | No relational table exists to store contract PDF storage references, hashes, and confidentiality flags. | **Core Deliverable of Phase 56.** Author document attachment metadata table. |
| **RBAC Permissions Catalog** | `src/lib/rbacService.js:85-86`<br>`supabase/migrations/025_implant_intelligence_core_and_rbac.sql:30-31` | **KEEP & ENFORCE** | Authoritative permissions `implants.view_contracts` and `implants.manage_contracts` are already registered and mapped. | **Sufficient for Phase 56.** `implants.view_contracts` grants read access; `implants.manage_contracts` grants authoring; CFO/Admin roles required for approval. |
| **`public.ot_extra_cost` & `surgeries.implants_cost`** | `supabase/migrations/001_multi_tenancy_core.sql:218`<br>`supabase/migrations/016_data_migration_from_surgeries.sql:34` | **REPLACE** | Legacy unitemized implant cost storage ($5,400 lump sum per case). | **Unstructured Anti-Pattern.** Lacks vendor attribution, contract linkage, or itemization. To be superseded by Phase 56/57 itemized contract pricing. |
| **Client Service Layer** | None for contracts. `vendorService.js`, `skuService.js`, `vendorComponentService.js` exist. | **MISSING** | No service exists to query, validate, or mutate facility vendor contracts. | **Core Deliverable of Phase 56.** Specify `src/lib/contractService.js` with deterministic validation and `db` singleton wiring. |
| **UI Contract Workspace** | None in `src/components/`. | **MISSING** | No interface exists to view contracts, manage scopes, upload documents, or approve terms. | **Core Deliverable of Phase 56.** Specify Contract Explorer, Detail Drawer, Scope Builder, and Approval Modal. |

### 3.2 Verified Facts vs. Remote Assumptions
1. **Verified Fact:** Migrations `001` through `030` are physically present in the local codebase, pass syntax analysis, and execute cleanly in test harnesses.
2. **Verified Fact:** 636 automated tests across 58 test suites pass with 100% success rate in `tests/`.
3. **Verified Fact:** `public.case_devices` contains an unconstrained `contract_id UUID` column added in Migration 025 (`supabase/migrations/025_implant_intelligence_core_and_rbac.sql:152`).
4. **Verified Fact:** `src/lib/rbacService.js` contains `implants.view_contracts` (risk: sensitive) and `implants.manage_contracts` (risk: critical).
5. **Unverified Remote Claim:** Whether remote database cluster `isutllqthmakvwgduaos` has Migration 030 applied cannot be verified without live Supabase API credentials; local fallback and test suites operate with zero network mocks.
6. **Architectural Fact:** Phase 56 migration will be numbered strictly as `031_facility_vendor_contracts.sql` to maintain sequential integrity.

---

## 4. Proposed Target Data Model & DDL Blueprint

### 4.1 Architectural Design Decisions

1. **Header vs. Scope Line Items Normalization:**
   - Medical device vendor contracts are complex commercial instruments. A single contract (e.g. "Stryker Master Orthopedic Agreement 2026") typically covers multiple surgical specialties (Joint Replacement, Sports Medicine, Trauma), dozens of component families (Knees, Hips, Shoulders), and hundreds of SKUs, while carving out specific exclusions (e.g., custom patient-matched guides or revision cutting blocks).
   - Storing covered items as comma-separated strings or opaque JSON in the contract header violates First Normal Form (1NF), destroys database-enforced referential integrity, prevents index-backed joins during surgery scheduling, and makes conflict detection impossible.
   - **Resolution:** A 3-table normalized relational model:
     - `public.facility_vendor_contracts`: Legal header, parties, terms, dates, lifecycle, and commercial conditions.
     - `public.facility_vendor_contract_scopes`: Relational line items defining included/excluded specialties, components, families, or SKUs with discount schedules.
     - `public.facility_vendor_contract_documents`: Secure metadata registry for uploaded contract PDF files, amendments, and certificates of insurance.

2. **Multi-Tenancy & Scope Invariants:**
   - Contracts are strictly facility-scoped (`facility_id UUID NOT NULL REFERENCES public.facilities(id)`). Unlike clinical taxonomy (Phase 51) or vendor master directories (Phase 53), **contracts never have `facility_id IS NULL`**. A contract is an agreement between an individual operating facility (or legal ASC entity) and a commercial vendor.
   - Corporate or network-wide agreements negotiated by an enterprise parent organization (e.g. Naples Health Network) are modeled by generating facility-specific contract instances referencing a shared `parent_organization_contract_id` or GPO identifier.

3. **PostgreSQL 15+ Unique Indexing & Date Validation:**
   - A facility may have multiple historical amendments or sequential versions of a contract number.
   - Active contract uniqueness per vendor and contract type is enforced using partial unique indexes and exclusion constraints.
   - Effective date boundaries must satisfy: `CONSTRAINT chk_contract_dates CHECK (effective_to >= effective_from)`.

---

### 4.2 Proposed DDL Specification (`031_facility_vendor_contracts.sql`)

```sql
-- ==============================================================================
-- MIGRATION: 031_facility_vendor_contracts.sql
-- DESCRIPTION: Phase 56 Facility Vendor Contracts, Commercial Terms,
--              Scope Line-Items, Document Attachments, and Lifecycle Governance.
-- PLATFORM: Supabase PostgreSQL 15+
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. TABLE: public.facility_vendor_contracts
-- Master facility-level vendor contract header and commercial terms
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.facility_vendor_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES public.implant_vendors(id) ON DELETE RESTRICT,
    
    -- Identification & Classification
    contract_number VARCHAR(100) NOT NULL,
    contract_name VARCHAR(255) NOT NULL,
    contract_type VARCHAR(50) NOT NULL DEFAULT 'DIRECT_OEM'
        CHECK (contract_type IN (
            'DIRECT_OEM',              -- Direct contract with manufacturer
            'DISTRIBUTOR_CONSIGNMENT', -- Consignment inventory managed via 3PL distributor
            'GPO_TIERED',              -- Tiered pricing agreement via national GPO
            'CUSTOM_LOCAL',            -- Facility-negotiated local custom pricing agreement
            'TRIAL_EVALUATION',        -- Clinical trial / consignment evaluation period
            'CAPITATED_PROCEDURAL'     -- Single-fee comprehensive procedural package
        )),
    
    -- Contract Lifecycle & State Machine
    status VARCHAR(30) NOT NULL DEFAULT 'draft'
        CHECK (status IN (
            'draft',             -- Initial contract formulation by materials manager
            'pending_approval',  -- Submitted for executive / CFO review
            'approved',          -- Formally signed off; waiting for effective_from
            'active',            -- Currently valid and authorizing sourcing & pricing
            'suspended',         -- Temporarily frozen (credit hold, recall, dispute)
            'expired',           -- Passed effective_to without renewal
            'terminated',        -- Cancelled prior to effective_to
            'rejected',          -- Rejected during approval workflow
            'renewed'            -- Replaced by forward renewal contract
        )),
    is_active BOOLEAN NOT NULL DEFAULT FALSE, -- High-speed operational filter (true ONLY when status = 'active')

    -- Temporal Boundaries & Renewal Governance
    effective_from DATE NOT NULL,
    effective_to DATE NOT NULL,
    auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
    renewal_notice_days INTEGER NOT NULL DEFAULT 60 CHECK (renewal_notice_days >= 0),
    auto_renew_term_months INTEGER DEFAULT 12 CHECK (auto_renew_term_months IS NULL OR auto_renew_term_months > 0),
    next_review_date DATE,
    terminated_at TIMESTAMPTZ,
    termination_reason TEXT,
    
    -- GPO & Network Procurement Affiliation
    gpo_affiliation VARCHAR(100), -- e.g. 'Vizient', 'Premier', 'HealthTrust', 'Direct'
    gpo_tier_level VARCHAR(50),   -- e.g. 'Tier 1 Baseline', 'Tier 4 Commitment'
    gpo_contract_reference VARCHAR(100),
    
    -- Commercial Terms & Logistics
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    payment_terms_days INTEGER NOT NULL DEFAULT 30 CHECK (payment_terms_days >= 0),
    prompt_pay_discount_percent NUMERIC(5, 2) DEFAULT 0.00 CHECK (prompt_pay_discount_percent >= 0.00 AND prompt_pay_discount_percent <= 100.00),
    prompt_pay_days INTEGER DEFAULT 10 CHECK (prompt_pay_days IS NULL OR prompt_pay_days >= 0),
    fob_point VARCHAR(30) NOT NULL DEFAULT 'DESTINATION'
        CHECK (fob_point IN ('DESTINATION', 'ORIGIN')),
    freight_terms VARCHAR(30) NOT NULL DEFAULT 'PREPAID'
        CHECK (freight_terms IN ('PREPAID', 'COLLECT', 'ADD_TO_INVOICE', 'THIRD_PARTY')),
    emergency_courier_covered BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Consignment & Logistics Governance
    is_consignment BOOLEAN NOT NULL DEFAULT FALSE,
    consignment_reconciliation_frequency VARCHAR(30) DEFAULT 'MONTHLY'
        CHECK (consignment_reconciliation_frequency IN ('MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'NOT_APPLICABLE')),
    consignment_audit_required BOOLEAN NOT NULL DEFAULT TRUE,
    loaner_set_lead_time_days INTEGER DEFAULT 2 CHECK (loaner_set_lead_time_days IS NULL OR loaner_set_lead_time_days >= 0),
    restocking_fee_percent NUMERIC(5, 2) DEFAULT 0.00 CHECK (restocking_fee_percent >= 0.00 AND restocking_fee_percent <= 100.00),

    -- Financial Commitments & Rebates (Confidential)
    annual_volume_commitment_amount NUMERIC(14, 2) DEFAULT 0.00 CHECK (annual_volume_commitment_amount >= 0.00),
    has_rebate_terms BOOLEAN NOT NULL DEFAULT FALSE,
    rebate_structure_type VARCHAR(50) DEFAULT 'NONE'
        CHECK (rebate_structure_type IN ('NONE', 'FLAT_PERCENT', 'VOLUME_TIERED', 'GROWTH_BASED', 'STANDARDIZATION_REBATE')),
    rebate_percentage NUMERIC(5, 2) DEFAULT 0.00 CHECK (rebate_percentage >= 0.00 AND rebate_percentage <= 100.00),
    rebate_settlement_frequency VARCHAR(30) DEFAULT 'ANNUAL'
        CHECK (rebate_settlement_frequency IN ('MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL')),
    rebate_terms_description TEXT,

    -- Versioning, Amendments & Historical Lineage
    amendment_number INTEGER NOT NULL DEFAULT 0 CHECK (amendment_number >= 0), -- 0 = Base Contract, 1+ = Amendment
    is_current_version BOOLEAN NOT NULL DEFAULT TRUE,
    parent_contract_id UUID REFERENCES public.facility_vendor_contracts(id) ON DELETE SET NULL,
    superseded_by_id UUID REFERENCES public.facility_vendor_contracts(id) ON DELETE SET NULL,
    superseded_at TIMESTAMPTZ,
    amendment_rationale TEXT,

    -- Two-Person Approval Governance (Phase 24 Standards)
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    submitted_at TIMESTAMPTZ,
    rejection_reason TEXT,

    -- Primary Contacts & Representatives
    contract_owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Internal Materials / CFO Lead
    vendor_signatory_name VARCHAR(150),
    vendor_signatory_title VARCHAR(100),
    vendor_rep_name VARCHAR(150),
    vendor_rep_phone VARCHAR(50),
    vendor_rep_email VARCHAR(150),
    
    -- Provenance & Metadata
    source_system VARCHAR(50) NOT NULL DEFAULT 'manual_entry'
        CHECK (source_system IN ('manual_entry', 'ghx_edi', 'erp_sync', 'contract_import', 'legacy_import')),
    notes TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT chk_contract_dates CHECK (effective_to >= effective_from),
    CONSTRAINT chk_contract_active_sync CHECK (is_active = (status = 'active')),
    CONSTRAINT chk_contract_approval_integrity CHECK (
        (status IN ('approved', 'active') AND approved_by IS NOT NULL AND approved_at IS NOT NULL) OR
        (status NOT IN ('approved', 'active'))
    )
);

-- ==============================================================================
-- 2. TABLE: public.facility_vendor_contract_scopes
-- Relational line-item scopes: specialties, components, families, SKUs, carve-outs
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.facility_vendor_contract_scopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES public.facility_vendor_contracts(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    
    -- Scope Type & Target Binding
    scope_type VARCHAR(30) NOT NULL DEFAULT 'ALL_VENDOR_PRODUCTS'
        CHECK (scope_type IN (
            'ALL_VENDOR_PRODUCTS',    -- Covers entire vendor catalog
            'SPECIALTY',              -- Covers an entire clinical specialty (e.g. 'Orthopedics')
            'COMPONENT',              -- Covers all SKUs belonging to a clinical component
            'PRODUCT_FAMILY',         -- Covers a specific product line family
            'SKU_LINE_ITEM'           -- Covers a single itemized product SKU
        )),
    
    -- Foreign Key Target Bindings (Nullability governed by scope_type check)
    specialty VARCHAR(50),
    component_id UUID REFERENCES public.implant_components(id) ON DELETE RESTRICT,
    family_id UUID REFERENCES public.implant_product_families(id) ON DELETE RESTRICT,
    sku_id UUID REFERENCES public.implant_product_skus(id) ON DELETE RESTRICT,
    
    -- Authorized Sourcing Logistics
    authorized_distributor_id UUID REFERENCES public.implant_vendors(id) ON DELETE RESTRICT,
    is_consignment_covered BOOLEAN NOT NULL DEFAULT FALSE,

    -- Inclusion vs. Exclusion Carve-Out
    is_excluded BOOLEAN NOT NULL DEFAULT FALSE, -- TRUE = Carve-out exclusion from parent scope
    exclusion_reason TEXT,

    -- Scope-Level Commercial Terms
    tier_discount_percent NUMERIC(5, 2) DEFAULT 0.00 CHECK (tier_discount_percent >= 0.00 AND tier_discount_percent <= 100.00),
    fixed_procedural_cap_rate NUMERIC(12, 2) DEFAULT NULL CHECK (fixed_procedural_cap_rate IS NULL OR fixed_procedural_cap_rate >= 0.00),
    
    -- Status & Auditing
    status VARCHAR(30) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'suspended', 'terminated')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Structural Integrity Constraints
    CONSTRAINT chk_scope_target_consistency CHECK (
        (scope_type = 'ALL_VENDOR_PRODUCTS' AND specialty IS NULL AND component_id IS NULL AND family_id IS NULL AND sku_id IS NULL) OR
        (scope_type = 'SPECIALTY' AND specialty IS NOT NULL AND component_id IS NULL AND family_id IS NULL AND sku_id IS NULL) OR
        (scope_type = 'COMPONENT' AND component_id IS NOT NULL AND sku_id IS NULL) OR
        (scope_type = 'PRODUCT_FAMILY' AND family_id IS NOT NULL AND sku_id IS NULL) OR
        (scope_type = 'SKU_LINE_ITEM' AND sku_id IS NOT NULL)
    ),
    CONSTRAINT chk_scope_active_sync CHECK (is_active = (status = 'active'))
);

-- ==============================================================================
-- 3. TABLE: public.facility_vendor_contract_documents
-- Contract PDF attachments, BAA agreements, exhibits, and SHA-256 verification
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.facility_vendor_contract_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES public.facility_vendor_contracts(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    
    document_name VARCHAR(255) NOT NULL,
    document_type VARCHAR(50) NOT NULL DEFAULT 'MASTER_AGREEMENT'
        CHECK (document_type IN (
            'MASTER_AGREEMENT',          -- Primary signed bilateral agreement
            'PRICING_SCHEDULE',          -- Exhibit A / Line item acquisition price schedule
            'AMENDMENT',                 -- Formal legal contract modification
            'BAA_AGREEMENT',             -- Business Associate Agreement (HIPAA compliance)
            'CERTIFICATE_OF_INSURANCE',  -- Vendor liability insurance certificate
            'CONSIGNMENT_AGREEMENT',     -- Consignment terms and bailment schedule
            'REBATE_SCHEDULE',           -- Confidential rebate and growth tier agreement
            'TERMINATION_LETTER',        -- Formal contract cancellation notice
            'OTHER'
        )),
    
    -- Supabase Storage Metadata
    storage_bucket VARCHAR(100) NOT NULL DEFAULT 'contract-documents',
    storage_path VARCHAR(500) NOT NULL,
    file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0),
    mime_type VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
    file_sha256 VARCHAR(64) NOT NULL, -- SHA-256 hash for document integrity and provenance
    
    -- Security & Access Classification
    is_confidential BOOLEAN NOT NULL DEFAULT TRUE, -- Restricted to CFO, Admin, Materials Director
    
    -- Effective Dates of Document
    effective_date DATE,
    expiration_date DATE,
    
    uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_document_dates CHECK (expiration_date IS NULL OR expiration_date >= effective_date)
);

-- ==============================================================================
-- 4. LINK FOREIGN KEY FROM case_devices TO facility_vendor_contracts
-- Closes the relational loop from surgical case consumption to master contract
-- ==============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'case_devices' AND column_name = 'contract_id'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_schema = 'public' AND constraint_name = 'fk_case_devices_contract_id'
        ) THEN
            ALTER TABLE public.case_devices
                ADD CONSTRAINT fk_case_devices_contract_id
                FOREIGN KEY (contract_id) REFERENCES public.facility_vendor_contracts(id) ON DELETE RESTRICT;
        END IF;
    END IF;
END $$;

-- ==============================================================================
-- 5. UNIQUE CONSTRAINTS & PERFORMANCE INDEXES
-- ==============================================================================

-- 5.1 Unique contract number and amendment version per facility
CREATE UNIQUE INDEX IF NOT EXISTS uq_facility_contract_version
    ON public.facility_vendor_contracts (facility_id, (UPPER(TRIM(contract_number))), amendment_number);

-- 5.2 Only one current version per contract number at a facility
CREATE UNIQUE INDEX IF NOT EXISTS uq_facility_contract_current_version
    ON public.facility_vendor_contracts (facility_id, (UPPER(TRIM(contract_number))))
    WHERE is_current_version = TRUE;

-- 5.3 Performance & Filtering Indexes
CREATE INDEX IF NOT EXISTS idx_fvc_facility ON public.facility_vendor_contracts(facility_id);
CREATE INDEX IF NOT EXISTS idx_fvc_vendor ON public.facility_vendor_contracts(vendor_id);
CREATE INDEX IF NOT EXISTS idx_fvc_status ON public.facility_vendor_contracts(status);
CREATE INDEX IF NOT EXISTS idx_fvc_active ON public.facility_vendor_contracts(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_fvc_dates ON public.facility_vendor_contracts(effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_fvc_type ON public.facility_vendor_contracts(contract_type);
CREATE INDEX IF NOT EXISTS idx_fvc_parent ON public.facility_vendor_contracts(parent_contract_id);
CREATE INDEX IF NOT EXISTS idx_fvc_owner ON public.facility_vendor_contracts(contract_owner_user_id);

-- Scope Table Indexes
CREATE INDEX IF NOT EXISTS idx_fvcs_contract ON public.facility_vendor_contract_scopes(contract_id);
CREATE INDEX IF NOT EXISTS idx_fvcs_facility ON public.facility_vendor_contract_scopes(facility_id);
CREATE INDEX IF NOT EXISTS idx_fvcs_type ON public.facility_vendor_contract_scopes(scope_type);
CREATE INDEX IF NOT EXISTS idx_fvcs_component ON public.facility_vendor_contract_scopes(component_id) WHERE component_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fvcs_family ON public.facility_vendor_contract_scopes(family_id) WHERE family_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fvcs_sku ON public.facility_vendor_contract_scopes(sku_id) WHERE sku_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fvcs_specialty ON public.facility_vendor_contract_scopes(specialty) WHERE specialty IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fvcs_distributor ON public.facility_vendor_contract_scopes(authorized_distributor_id) WHERE authorized_distributor_id IS NOT NULL;

-- Document Table Indexes
CREATE INDEX IF NOT EXISTS idx_fvcd_contract ON public.facility_vendor_contract_documents(contract_id);
CREATE INDEX IF NOT EXISTS idx_fvcd_facility ON public.facility_vendor_contract_documents(facility_id);
CREATE INDEX IF NOT EXISTS idx_fvcd_type ON public.facility_vendor_contract_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_fvcd_sha ON public.facility_vendor_contract_documents(file_sha256);

-- ==============================================================================
-- 6. TRIGGERS & PROCEDURAL INTEGRITY GUARDS
-- ==============================================================================

-- 6.1 Touch updated_at Triggers
DROP TRIGGER IF EXISTS trg_touch_facility_vendor_contracts ON public.facility_vendor_contracts;
CREATE TRIGGER trg_touch_facility_vendor_contracts
    BEFORE UPDATE ON public.facility_vendor_contracts
    FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_facility_vendor_contract_scopes ON public.facility_vendor_contract_scopes;
CREATE TRIGGER trg_touch_facility_vendor_contract_scopes
    BEFORE UPDATE ON public.facility_vendor_contract_scopes
    FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_facility_vendor_contract_documents ON public.facility_vendor_contract_documents;
CREATE TRIGGER trg_touch_facility_vendor_contract_documents
    BEFORE UPDATE ON public.facility_vendor_contract_documents
    FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

-- 6.2 Hard-Delete Protection Trigger
-- Strictly blocks hard-deleting active, approved, or historically referenced contracts
CREATE OR REPLACE FUNCTION public.fn_prevent_active_contract_delete()
RETURNS TRIGGER AS $$
DECLARE
    v_usage_count INTEGER;
BEGIN
    IF OLD.status IN ('active', 'approved', 'suspended') THEN
        RAISE EXCEPTION 'Cannot hard delete contract % in state %. Mark contract as terminated or expired instead.', OLD.contract_number, OLD.status;
    END IF;

    -- Check if referenced by historical surgical cases in case_devices
    SELECT COUNT(*) INTO v_usage_count
    FROM public.case_devices
    WHERE contract_id = OLD.id;

    IF v_usage_count > 0 THEN
        RAISE EXCEPTION 'Cannot hard delete contract % (ID: %): Referenced by % surgical case device records. Historical retention required.',
            OLD.contract_number, OLD.id, v_usage_count;
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_prevent_active_contract_delete ON public.facility_vendor_contracts;
CREATE TRIGGER trg_prevent_active_contract_delete
    BEFORE DELETE ON public.facility_vendor_contracts
    FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_active_contract_delete();

-- 6.3 Cross-Facility Relocation Prevention Trigger
CREATE OR REPLACE FUNCTION public.fn_prevent_facility_relocation_contracts()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.facility_id IS DISTINCT FROM NEW.facility_id THEN
        RAISE EXCEPTION 'Immutable facility context: cannot move contract (ID: %) from facility % to %.',
            OLD.id, OLD.facility_id, NEW.facility_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_prevent_facility_relocation_contracts ON public.facility_vendor_contracts;
CREATE TRIGGER trg_prevent_facility_relocation_contracts
    BEFORE UPDATE OF facility_id ON public.facility_vendor_contracts
    FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_facility_relocation_contracts();

-- 6.4 Prevent Self-Approval & Enforce Separation of Duties
CREATE OR REPLACE FUNCTION public.fn_enforce_contract_approval_separation()
RETURNS TRIGGER AS $$
DECLARE
    v_is_super_admin BOOLEAN;
BEGIN
    -- Only evaluate on transition into 'approved' or 'active'
    IF (NEW.status IN ('approved', 'active') AND OLD.status NOT IN ('approved', 'active')) THEN
        IF NEW.approved_by IS NULL THEN
            RAISE EXCEPTION 'Approval violation: Contract % cannot be activated without an explicit approved_by actor UUID.', NEW.contract_number;
        END IF;

        -- Check if approver is identical to creator or submitter
        IF (NEW.approved_by = NEW.created_by OR NEW.approved_by = NEW.submitted_by) THEN
            -- Super admin bypass permitted for small facilities
            SELECT public.user_has_facility_role(NULL, ARRAY['super_admin']) INTO v_is_super_admin;
            IF NOT v_is_super_admin THEN
                RAISE EXCEPTION 'Separation of duties violation: Creator or submitter (User %) cannot approve their own vendor contract (%). A second authorized administrative approver is required.',
                    NEW.approved_by, NEW.contract_number;
            END IF;
        END IF;

        -- Record approval timestamp if not set
        IF NEW.approved_at IS NULL THEN
            NEW.approved_at := NOW();
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_enforce_contract_approval_separation ON public.facility_vendor_contracts;
CREATE TRIGGER trg_enforce_contract_approval_separation
    BEFORE UPDATE OF status, approved_by ON public.facility_vendor_contracts
    FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_contract_approval_separation();

-- 6.5 Attach Audit Logging Trigger (Phase 24 Standards)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'fn_audit_log_trigger'
    ) THEN
        DROP TRIGGER IF EXISTS trg_audit_facility_vendor_contracts ON public.facility_vendor_contracts;
        CREATE TRIGGER trg_audit_facility_vendor_contracts
            AFTER INSERT OR UPDATE OR DELETE ON public.facility_vendor_contracts
            FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

        DROP TRIGGER IF EXISTS trg_audit_facility_vendor_contract_scopes ON public.facility_vendor_contract_scopes;
        CREATE TRIGGER trg_audit_facility_vendor_contract_scopes
            AFTER INSERT OR UPDATE OR DELETE ON public.facility_vendor_contract_scopes
            FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

        DROP TRIGGER IF EXISTS trg_audit_facility_vendor_contract_documents ON public.facility_vendor_contract_documents;
        CREATE TRIGGER trg_audit_facility_vendor_contract_documents
            AFTER INSERT OR UPDATE OR DELETE ON public.facility_vendor_contract_documents
            FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();
    END IF;
END $$;

COMMIT;
```

---

## 5. Contract Lifecycle & Business Rules Engine

### 5.1 Deterministic Lifecycle State Machine

```
               [draft] 
                  │
                  ▼ (Submit: implants.manage_contracts)
          [pending_approval]
             │          │
 (Reject)    │          │ (Approve: CFO / Admin)
             ▼          ▼
        [rejected]   [approved]
                        │
                        ▼ (effective_from reached)
                     [active] ◄───────────────────────────┐
                        │                                  │ (Reactivate / Resume)
        ┌───────────────┼───────────────┬──────────────────┤
        │               │               │                  │
        ▼               ▼               ▼                  ▼
   [suspended]      [expired]     [terminated]         [renewed]
(Credit hold/recall) (Passed to)   (Early cancel)    (Successor contract)
        │
        └──────────────────────────────────────────────────┘
```

#### State Definitions & Permitted Operations

| Contract State | Permitted Sourcing? | Allows Case Pricing? | Editable Terms? | Permitted Transitions |
| :--- | :---: | :---: | :---: | :--- |
| **`draft`** | **NO** | **NO** | Yes (all fields) | `pending_approval` |
| **`pending_approval`** | **NO** | **NO** | No (locked) | `approved`, `rejected`, `draft` |
| **`rejected`** | **NO** | **NO** | No (read-only) | `draft` (archive or rework) |
| **`approved`** | **NO** (until date) | **NO** (until date) | No (locked) | `active` (automatic on `effective_from`) |
| **`active`** | **YES** | **YES** | Restricted (scopes/amend) | `suspended`, `expired`, `terminated`, `renewed` |
| **`suspended`** | **NO** | **NO** | No | `active` (resume), `terminated` |
| **`expired`** | **NO** | **NO** | No (immutable history) | `renewed` |
| **`terminated`** | **NO** | **NO** | No (immutable history) | None (terminal state) |
| **`renewed`** | **NO** (closed term) | **NO** (closed term) | No (immutable history) | None (superseded by child contract) |

---

### 5.2 Deterministic Business Rules & Invariants

#### Rule 1: No Unapproved Active Contracts
A contract can never enter `status = 'active'` or have `is_active = TRUE` unless it has passed formal approval with non-null `approved_by` and `approved_at` timestamps.

#### Rule 2: Two-Person Approval Governance (Separation of Duties)
- Sourcing specialists or materials managers who author a contract (`created_by`) or submit it for review (`submitted_by`) are strictly prohibited from approving it (`approved_by != created_by AND approved_by != submitted_by`).
- Approval requires role `cfo`, `facility_admin`, or `org_admin`.
- Sole-administrator exception: Only global `super_admin` accounts can bypass the two-person separation of duties in small rural ASCs with single administrative staffing.

#### Rule 3: Calendar Date Boundaries & Real-Time Status Resolution
- Sourcing eligibility and case implant pricing depend strictly on the surgical encounter date:
  $$\text{effective\_from} \le \text{Procedure Date} \le \text{effective\_to}$$
- If a scheduled surgery is slated for 2026-11-15, but the contract expires on 2026-10-31, the scheduling engine raises an alert: `CONTRACT_EXPIRATION_PRIOR_TO_SURGERY`.
- A background cron routine evaluates contracts daily:
  - If `CURRENT_DATE > effective_to` AND `status = 'active'`, the contract transitions to `status = 'expired'`, `is_active = FALSE`.
  - If `CURRENT_DATE >= effective_from` AND `status = 'approved'`, the contract automatically transitions to `status = 'active'`, `is_active = TRUE`.

#### Rule 4: Overlapping Active Contract Conflict Resolution
A single operating facility cannot maintain two simultaneous `active` contracts with identical scope overlaps for the same vendor:
- When an administrator attempts to activate a contract covering Vendor V for Specialty S:
  - The system queries for active contracts at `facility_id` where `vendor_id = V` AND date intervals overlap:
    $$(\text{NEW.effective\_from} \le \text{EXISTING.effective\_to}) \land (\text{NEW.effective\_to} \ge \text{EXISTING.effective\_from})$$
  - If an overlapping active contract exists with matching or superset scope, activation is **rejected with an error**: `OVERLAPPING_ACTIVE_CONTRACT_DETECTED`.
  - **Resolution Protocol:** The existing contract must be terminated early with documented rationale, or amended via an official Contract Amendment.

#### Rule 5: Contract Amendments & Version Lineage
- Contracts must not be silently updated in-place after approval.
- Any change to covered scopes, payment terms, or discount tiers requires an official **Contract Amendment**:
  1. System generates a clone of the contract with `amendment_number = parent.amendment_number + 1`.
  2. Cloned contract is placed in `draft` state with `parent_contract_id` set to the original contract.
  3. When the amendment is approved and activated:
     - The parent contract's `is_current_version` is set to `FALSE`.
     - Parent contract's `superseded_by_id` is set to the new amendment UUID, with `superseded_at = NOW()`.
     - Parent contract remains in the database permanently to support historical cases.

#### Rule 6: Historical Non-Destruction Invariant
- Once a surgical case is completed in `public.case_devices`, its `contract_id` pointer is **frozen in time**.
- If a vendor agreement is subsequently cancelled, renegotiated, or terminated due to legal dispute, **completed case records never change**. Historical profit margin calculations, invoice reconciliations, and cost analyses remain reproducible to the exact penny as of the date of surgery.

#### Rule 7: Emergency Exception Sourcing Protocol
- If an emergency trauma or unscheduled surgical case requires hardware from an uncontracted vendor or under an expired contract:
  1. The circulating nurse or materials coordinator flags the item with `usage_status = 'IMPLANTED'`, `cost_hierarchy_tier = 'TIER_4_EMERGENCY_OVERRIDE'`.
  2. Pre-Bill Rule `IMP-005` (Uncontracted Vendor Price Breach) is flagged as a **BLOCKER**.
  3. Clearance requires explicit electronic signature from the Clinical Director or CFO with a mandatory clearance rationale (e.g., "Urgent trauma limb salvage; off-contract Zimmer revision component authorized").
  4. An immutable audit record is committed to `public.audit_logs` with `action = 'OVERRIDE'`, `source = 'UI'`.

---

## 6. Integration Boundaries: Phase 55 vs. Phase 56 vs. Phase 57

A common failure mode in healthcare supply chain architectures is conflating **clinical credentialing**, **contractual existence**, and **line-item pricing**. ASCANALYST enforces strict separation across Phases 55, 56, and 57:

```
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 55: Vendor-to-Component Mapping (Clinical Sourcing Matrix)      │
│ - "Can Stryker provide Knee Femoral components at Naples ASC?"         │
│ - Governance tier: PREFERRED, STANDARD, SECONDARY, RESTRICTED         │
│ - Fulfillment: DIRECT_OEM, DISTRIBUTOR_CONSIGNMENT, BILL_ONLY          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 56: Facility Vendor Contracts (Legal & Commercial Terms)        │
│ - "Does an active legal contract exist with Stryker on Date D?"        │
│ - Contract #STR-2026-01, Net 30, FOB Dest, GPO Vizient Tier 2         │
│ - Covered Scopes: Total Joints (Included), Custom Revision (Excluded)  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 57: Facility Implant Pricing (Acquisition & Chargemaster Rates)  │
│ - "What is the exact acquisition cost for SKU #0604-0012?"            │
│ - Contracted Unit Cost: $1,850.00 | Markup: 150%                      │
│ - Default Chargemaster Gross Charge: $4,625.00                        │
└────────────────────────────────────────────────────────────────────────┘
```

### 6.1 Triple Boundary Matrix

| Architectural Dimension | Phase 55: Sourcing Mapping | Phase 56: Facility Contracts (THIS SPEC) | Phase 57: Facility Pricing |
| :--- | :--- | :--- | :--- |
| **Primary Relational Table** | `implant_vendor_component_mappings` | `facility_vendor_contracts` & `_scopes` | `facility_implant_pricing` |
| **Core Question Answered** | Is this vendor clinically permitted and preferred for this anatomy? | Is there a binding commercial agreement authorizing purchase on this date? | What exact dollar amount is paid and billed for this physical item? |
| **Granularity Level** | Component Taxonomy (`KNEE_FEMORAL`) | Legal Agreement & Scope Categories | Granular Catalog SKU (`0604-0012`) |
| **Primary Actor / Role** | Clinical Director / Value Analysis | Materials Director / CFO / Legal | CFO / Revenue Cycle Director / Biller |
| **Temporal Scope** | Ongoing clinical policy | Contract term (`effective_from` to `to`) | Effective-dated price schedules |
| **Conflation Safeguard** | **A Phase 55 mapping DOES NOT prove a contract exists.** A vendor may be clinically preferred but awaiting contract execution. | **A Phase 56 contract DOES NOT prove a SKU is clinically authorized.** A contract may cover an entire catalog, but specific components may be restricted. | **A Phase 57 price DOES NOT equal reimbursement.** Acquisition cost is what the ASC pays; reimbursement is what payers remit via Medicare ASC fee schedules or commercial carve-outs. |

### 6.2 Authoritative Sourcing & Pricing Resolution Algorithm

When a surgical encounter documents or plans an implant item at Facility $F$ for Procedure Date $D$:

```
Step 1: Clinical Construct Evaluation (Phase 52)
        └── Procedure CPT requires Component C.

Step 2: Clinical Sourcing Verification (Phase 55)
        └── Query implant_vendor_component_mappings WHERE facility_id = F AND component_id = C.
            ├── If preference_tier = 'RESTRICTED' ──► BLOCK (Vendor barred from facility).
            └── If mapping status != 'active'     ──► WARN (Unverified clinical supplier).

Step 3: Commercial Contract Verification (Phase 56)
        └── Query facility_vendor_contracts WHERE facility_id = F AND vendor_id = V
            AND status = 'active' AND effective_from <= D <= effective_to.
            ├── If NO contract exists ──► Flag TIER_3_OFF_CONTRACT (Triggers IMP-005 review).
            └── If contract exists ──► Evaluate facility_vendor_contract_scopes:
                ├── If SKU/Component matches an EXCLUDED scope ──► Flag TIER_3_OFF_CONTRACT.
                └── If SKU/Component matches an INCLUDED scope ──► Confirm CONTRACT_AUTHORIZED.

Step 4: Contracted Acquisition Cost Resolution (Phase 57)
        └── Query facility_implant_pricing WHERE facility_id = F AND contract_id = Contract.id
            AND sku_id = SKU.id AND effective_from <= D <= COALESCE(effective_to, 'infinity').
            ├── If pricing row found ──► Apply Tier 2 Contracted Unit Cost.
            └── If pricing row missing ──► Fall back to Supplier Invoice (Tier 1) or List Price (Tier 4).
```

---

## 7. Security, Row-Level Security (RLS) & RBAC Matrix

### 7.1 Server-Side Authorization Invariants
1. **Zero Caller Trust:** The server and database must never trust caller-supplied `user_id` or `facility_id` parameters. Tenancy is strictly derived from the authenticated session: `facility_id IN (SELECT public.get_auth_user_facilities())`.
2. **Prohibition of Bypass:** The clause `auth.uid() IS NULL` is strictly forbidden in runtime production RLS policies. It is permitted only inside database migration blocks for seeding.
3. **`SECURITY DEFINER` Hardening:** All contract stored procedures must:
   - Explicitly declare `SET search_path = public, pg_temp;`.
   - Validate facility membership and permissions before mutating records.
   - Restrict execution grants to authenticated users: `GRANT EXECUTE ON FUNCTION ... TO authenticated;`.

---

### 7.2 Granular RBAC Permission Matrix

| Role | View Contracts & Scopes | View Confidential Rebates & Terms | Create / Edit Draft Contracts | Submit for Approval | Approve / Activate Contracts | Terminate / Suspend | Export Contract Reports |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Super Admin** | Granted | Granted | Granted | Granted | Granted | Granted | Granted |
| **Facility Admin** | Granted | Granted | Granted | Granted | Granted | Granted | Granted |
| **CFO / Finance Director** | Granted | Granted | Granted | Granted | Granted | Granted | Granted |
| **Materials / Supply Manager** | Granted | Masked | Granted | Granted | Denied | Denied | Granted |
| **Clinical Director / OR Lead** | Granted | Masked | Denied | Denied | Denied | Denied | Denied |
| **Surgeon / Physician** | View Scope Only | Masked | Denied | Denied | Denied | Denied | Denied |
| **Circulating Nurse** | View Scope Only | Masked | Denied | Denied | Denied | Denied | Denied |
| **Billing Specialist** | Granted | Masked | Denied | Denied | Denied | Denied | Granted |

*Masked:* Contract header, number, vendor, effective dates, and covered components are visible; confidential financial fields (`annual_volume_commitment_amount`, `rebate_percentage`, `rebate_structure_type`, confidential document attachments) return `NULL` or `[CONFIDENTIAL]`.

---

### 7.3 Row-Level Security (RLS) Policy Specifications

```sql
-- Enable RLS on all Phase 56 tables
ALTER TABLE public.facility_vendor_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_vendor_contract_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_vendor_contract_documents ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 1. POLICIES: facility_vendor_contracts
-- ==============================================================================

-- 1.1 SELECT: Active members of the facility can read contracts
DROP POLICY IF EXISTS "fvc_select_tenant_members" ON public.facility_vendor_contracts;
CREATE POLICY "fvc_select_tenant_members" ON public.facility_vendor_contracts
    FOR SELECT TO authenticated
    USING (
        facility_id IN (SELECT public.get_auth_user_facilities()) OR
        public.user_has_facility_role(NULL, ARRAY['super_admin'])
    );

-- 1.2 INSERT: Authorized procurement/finance roles can author contracts
DROP POLICY IF EXISTS "fvc_insert_procurement_roles" ON public.facility_vendor_contracts;
CREATE POLICY "fvc_insert_procurement_roles" ON public.facility_vendor_contracts
    FOR INSERT TO authenticated
    WITH CHECK (
        (facility_id IN (SELECT public.get_auth_user_facilities()) AND
         public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'materials_manager'])) OR
        public.user_has_facility_role(NULL, ARRAY['super_admin'])
    );

-- 1.3 UPDATE: Separation of duties on draft vs active updates
DROP POLICY IF EXISTS "fvc_update_procurement_roles" ON public.facility_vendor_contracts;
CREATE POLICY "fvc_update_procurement_roles" ON public.facility_vendor_contracts
    FOR UPDATE TO authenticated
    USING (
        (facility_id IN (SELECT public.get_auth_user_facilities()) AND
         public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'materials_manager'])) OR
        public.user_has_facility_role(NULL, ARRAY['super_admin'])
    )
    WITH CHECK (
        (facility_id IN (SELECT public.get_auth_user_facilities()) AND
         public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'materials_manager'])) OR
        public.user_has_facility_role(NULL, ARRAY['super_admin'])
    );

-- 1.4 DELETE: Restricted to Super Admin and Facility Admin on draft/rejected records only
DROP POLICY IF EXISTS "fvc_delete_admin_drafts_only" ON public.facility_vendor_contracts;
CREATE POLICY "fvc_delete_admin_drafts_only" ON public.facility_vendor_contracts
    FOR DELETE TO authenticated
    USING (
        status IN ('draft', 'rejected') AND
        ((facility_id IN (SELECT public.get_auth_user_facilities()) AND
          public.user_has_facility_role(facility_id, ARRAY['super_admin', 'facility_admin'])) OR
         public.user_has_facility_role(NULL, ARRAY['super_admin']))
    );

-- ==============================================================================
-- 2. POLICIES: facility_vendor_contract_scopes
-- ==============================================================================

DROP POLICY IF EXISTS "fvcs_select_tenant_members" ON public.facility_vendor_contract_scopes;
CREATE POLICY "fvcs_select_tenant_members" ON public.facility_vendor_contract_scopes
    FOR SELECT TO authenticated
    USING (
        facility_id IN (SELECT public.get_auth_user_facilities()) OR
        public.user_has_facility_role(NULL, ARRAY['super_admin'])
    );

DROP POLICY IF EXISTS "fvcs_insert_procurement_roles" ON public.facility_vendor_contract_scopes;
CREATE POLICY "fvcs_insert_procurement_roles" ON public.facility_vendor_contract_scopes
    FOR INSERT TO authenticated
    WITH CHECK (
        (facility_id IN (SELECT public.get_auth_user_facilities()) AND
         public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'materials_manager'])) OR
        public.user_has_facility_role(NULL, ARRAY['super_admin'])
    );

DROP POLICY IF EXISTS "fvcs_update_procurement_roles" ON public.facility_vendor_contract_scopes;
CREATE POLICY "fvcs_update_procurement_roles" ON public.facility_vendor_contract_scopes
    FOR UPDATE TO authenticated
    USING (
        (facility_id IN (SELECT public.get_auth_user_facilities()) AND
         public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'materials_manager'])) OR
        public.user_has_facility_role(NULL, ARRAY['super_admin'])
    )
    WITH CHECK (
        (facility_id IN (SELECT public.get_auth_user_facilities()) AND
         public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'materials_manager'])) OR
        public.user_has_facility_role(NULL, ARRAY['super_admin'])
    );

DROP POLICY IF EXISTS "fvcs_delete_procurement_roles" ON public.facility_vendor_contract_scopes;
CREATE POLICY "fvcs_delete_procurement_roles" ON public.facility_vendor_contract_scopes
    FOR DELETE TO authenticated
    USING (
        (facility_id IN (SELECT public.get_auth_user_facilities()) AND
         public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'materials_manager'])) OR
        public.user_has_facility_role(NULL, ARRAY['super_admin'])
    );

-- ==============================================================================
-- 3. POLICIES: facility_vendor_contract_documents
-- ==============================================================================

-- Document Select: Non-confidential docs visible to all facility members; confidential docs restricted to Finance/Admin
DROP POLICY IF EXISTS "fvcd_select_document_security" ON public.facility_vendor_contract_documents;
CREATE POLICY "fvcd_select_document_security" ON public.facility_vendor_contract_documents
    FOR SELECT TO authenticated
    USING (
        (facility_id IN (SELECT public.get_auth_user_facilities()) AND
         (is_confidential = FALSE OR
          public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'materials_manager']))) OR
        public.user_has_facility_role(NULL, ARRAY['super_admin'])
    );

DROP POLICY IF EXISTS "fvcd_insert_document_roles" ON public.facility_vendor_contract_documents;
CREATE POLICY "fvcd_insert_document_roles" ON public.facility_vendor_contract_documents
    FOR INSERT TO authenticated
    WITH CHECK (
        (facility_id IN (SELECT public.get_auth_user_facilities()) AND
         public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'materials_manager'])) OR
        public.user_has_facility_role(NULL, ARRAY['super_admin'])
    );

DROP POLICY IF EXISTS "fvcd_delete_admin_only" ON public.facility_vendor_contract_documents;
CREATE POLICY "fvcd_delete_admin_only" ON public.facility_vendor_contract_documents
    FOR DELETE TO authenticated
    USING (
        (facility_id IN (SELECT public.get_auth_user_facilities()) AND
         public.user_has_facility_role(facility_id, ARRAY['super_admin', 'facility_admin', 'cfo'])) OR
        public.user_has_facility_role(NULL, ARRAY['super_admin'])
    );
```

---

## 8. Authoritative Stored Procedures & API/Service Contracts

### 8.1 Authoritative Stored Procedures Blueprint

#### Procedure 1: Upsert Contract Draft (`fn_upsert_facility_vendor_contract`)

```sql
CREATE OR REPLACE FUNCTION public.fn_upsert_facility_vendor_contract(
    p_contract_id UUID,
    p_facility_id UUID,
    p_vendor_id UUID,
    p_contract_number VARCHAR,
    p_contract_name VARCHAR,
    p_contract_type VARCHAR,
    p_effective_from DATE,
    p_effective_to DATE,
    p_auto_renew BOOLEAN,
    p_renewal_notice_days INTEGER,
    p_gpo_affiliation VARCHAR,
    p_payment_terms_days INTEGER,
    p_prompt_pay_discount_percent NUMERIC,
    p_prompt_pay_days INTEGER,
    p_fob_point VARCHAR,
    p_freight_terms VARCHAR,
    p_is_consignment BOOLEAN,
    p_consignment_reconciliation_frequency VARCHAR,
    p_annual_volume_commitment_amount NUMERIC,
    p_has_rebate_terms BOOLEAN,
    p_rebate_structure_type VARCHAR,
    p_rebate_percentage NUMERIC,
    p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_id UUID;
    v_resolved_id UUID;
    v_existing_status VARCHAR;
BEGIN
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to modify vendor contracts.';
    END IF;

    -- Verify Tenant Authorization
    IF NOT public.user_has_facility_role(p_facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'materials_manager']) THEN
        RAISE EXCEPTION 'Permission denied: Caller does not possess contract management authority for facility %.', p_facility_id;
    END IF;

    -- Verify Vendor Exists and is Active
    IF NOT EXISTS (SELECT 1 FROM public.implant_vendors WHERE id = p_vendor_id AND is_active = TRUE) THEN
        RAISE EXCEPTION 'Referenced vendor ID % does not exist or is inactive in master directory.', p_vendor_id;
    END IF;

    -- Date Validation
    IF p_effective_to < p_effective_from THEN
        RAISE EXCEPTION 'Invalid date boundaries: effective_to (%) cannot precede effective_from (%).', p_effective_to, p_effective_from;
    END IF;

    -- If updating, verify contract is in editable state (draft or rejected)
    IF p_contract_id IS NOT NULL THEN
        SELECT status INTO v_existing_status
        FROM public.facility_vendor_contracts
        WHERE id = p_contract_id AND facility_id = p_facility_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Contract ID % not found for facility %.', p_contract_id, p_facility_id;
        END IF;

        IF v_existing_status NOT IN ('draft', 'rejected', 'pending_approval') THEN
            RAISE EXCEPTION 'Contract % is currently % and cannot be modified directly. An amendment must be created.',
                p_contract_number, v_existing_status;
        END IF;
    END IF;

    -- Execute Upsert
    INSERT INTO public.facility_vendor_contracts (
        id, facility_id, vendor_id, contract_number, contract_name, contract_type,
        status, is_active, effective_from, effective_to, auto_renew, renewal_notice_days,
        gpo_affiliation, payment_terms_days, prompt_pay_discount_percent, prompt_pay_days,
        fob_point, freight_terms, is_consignment, consignment_reconciliation_frequency,
        annual_volume_commitment_amount, has_rebate_terms, rebate_structure_type, rebate_percentage,
        notes, created_by, updated_by
    ) VALUES (
        COALESCE(p_contract_id, gen_random_uuid()),
        p_facility_id, p_vendor_id, TRIM(p_contract_number), TRIM(p_contract_name),
        COALESCE(p_contract_type, 'DIRECT_OEM'),
        'draft', FALSE, p_effective_from, p_effective_to,
        COALESCE(p_auto_renew, FALSE), COALESCE(p_renewal_notice_days, 60),
        TRIM(p_gpo_affiliation), COALESCE(p_payment_terms_days, 30),
        COALESCE(p_prompt_pay_discount_percent, 0.00), p_prompt_pay_days,
        COALESCE(p_fob_point, 'DESTINATION'), COALESCE(p_freight_terms, 'PREPAID'),
        COALESCE(p_is_consignment, FALSE), COALESCE(p_consignment_reconciliation_frequency, 'MONTHLY'),
        COALESCE(p_annual_volume_commitment_amount, 0.00), COALESCE(p_has_rebate_terms, FALSE),
        COALESCE(p_rebate_structure_type, 'NONE'), COALESCE(p_rebate_percentage, 0.00),
        TRIM(p_notes), v_actor_id, v_actor_id
    )
    ON CONFLICT (id) DO UPDATE SET
        contract_name = EXCLUDED.contract_name,
        contract_type = EXCLUDED.contract_type,
        effective_from = EXCLUDED.effective_from,
        effective_to = EXCLUDED.effective_to,
        auto_renew = EXCLUDED.auto_renew,
        renewal_notice_days = EXCLUDED.renewal_notice_days,
        gpo_affiliation = EXCLUDED.gpo_affiliation,
        payment_terms_days = EXCLUDED.payment_terms_days,
        prompt_pay_discount_percent = EXCLUDED.prompt_pay_discount_percent,
        prompt_pay_days = EXCLUDED.prompt_pay_days,
        fob_point = EXCLUDED.fob_point,
        freight_terms = EXCLUDED.freight_terms,
        is_consignment = EXCLUDED.is_consignment,
        consignment_reconciliation_frequency = EXCLUDED.consignment_reconciliation_frequency,
        annual_volume_commitment_amount = EXCLUDED.annual_volume_commitment_amount,
        has_rebate_terms = EXCLUDED.has_rebate_terms,
        rebate_structure_type = EXCLUDED.rebate_structure_type,
        rebate_percentage = EXCLUDED.rebate_percentage,
        notes = EXCLUDED.notes,
        updated_by = v_actor_id,
        updated_at = NOW()
    RETURNING id INTO v_resolved_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'contract_id', v_resolved_id,
        'message', 'Contract draft saved successfully.'
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_upsert_facility_vendor_contract TO authenticated;
```

#### Procedure 2: Review Contract Approval (`fn_review_facility_vendor_contract`)

```sql
CREATE OR REPLACE FUNCTION public.fn_review_facility_vendor_contract(
    p_contract_id UUID,
    p_action VARCHAR, -- 'approve' or 'reject'
    p_rationale TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_id UUID;
    v_contract RECORD;
    v_is_super_admin BOOLEAN;
    v_new_status VARCHAR;
    v_is_active BOOLEAN;
BEGIN
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT * INTO v_contract
    FROM public.facility_vendor_contracts
    WHERE id = p_contract_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Contract ID % does not exist.', p_contract_id;
    END IF;

    IF v_contract.status != 'pending_approval' THEN
        RAISE EXCEPTION 'Contract % cannot be reviewed; status is %, not pending_approval.',
            v_contract.contract_number, v_contract.status;
    END IF;

    -- Verify Approver Authority (CFO, Facility Admin, Super Admin)
    IF NOT public.user_has_facility_role(v_contract.facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo']) THEN
        RAISE EXCEPTION 'Permission denied: Only CFO or Facility Administrators can approve or reject vendor contracts.';
    END IF;

    -- Enforce Separation of Duties
    IF (v_actor_id = v_contract.created_by OR v_actor_id = v_contract.submitted_by) THEN
        SELECT public.user_has_facility_role(NULL, ARRAY['super_admin']) INTO v_is_super_admin;
        IF NOT v_is_super_admin THEN
            RAISE EXCEPTION 'Separation of duties violation: Creator or submitter cannot approve their own vendor contract. Second-person approval required.';
        END IF;
    END IF;

    IF p_action = 'approve' THEN
        -- Evaluate whether contract becomes immediately active or scheduled approved
        IF CURRENT_DATE >= v_contract.effective_from THEN
            v_new_status := 'active';
            v_is_active := TRUE;
        ELSE
            v_new_status := 'approved';
            v_is_active := FALSE;
        END IF;

        UPDATE public.facility_vendor_contracts SET
            status = v_new_status,
            is_active = v_is_active,
            approved_by = v_actor_id,
            approved_at = NOW(),
            rejection_reason = NULL,
            updated_by = v_actor_id,
            updated_at = NOW()
        WHERE id = p_contract_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'contract_id', p_contract_id,
            'status', v_new_status,
            'message', 'Contract successfully approved and activated.'
        );

    ELSIF p_action = 'reject' THEN
        IF TRIM(p_rationale) IS NULL OR LENGTH(TRIM(p_rationale)) < 5 THEN
            RAISE EXCEPTION 'Mandatory rejection rationale must be provided (minimum 5 characters).';
        END IF;

        UPDATE public.facility_vendor_contracts SET
            status = 'rejected',
            is_active = FALSE,
            rejection_reason = TRIM(p_rationale),
            updated_by = v_actor_id,
            updated_at = NOW()
        WHERE id = p_contract_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'contract_id', p_contract_id,
            'status', 'rejected',
            'message', 'Contract submission rejected.'
        );
    ELSE
        RAISE EXCEPTION 'Invalid review action: %. Permitted: approve, reject.', p_action;
    END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_review_facility_vendor_contract TO authenticated;
```

#### Procedure 3: Create Contract Amendment (`fn_create_contract_amendment`)

```sql
CREATE OR REPLACE FUNCTION public.fn_create_contract_amendment(
    p_parent_contract_id UUID,
    p_amendment_rationale TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_id UUID;
    v_parent RECORD;
    v_new_contract_id UUID := gen_random_uuid();
    v_new_amendment_no INTEGER;
BEGIN
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT * INTO v_parent
    FROM public.facility_vendor_contracts
    WHERE id = p_parent_contract_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Parent contract ID % does not exist.', p_parent_contract_id;
    END IF;

    IF v_parent.status NOT IN ('active', 'expired') THEN
        RAISE EXCEPTION 'Amendments can only be created from active or expired contracts. Got: %.', v_parent.status;
    END IF;

    IF TRIM(p_amendment_rationale) IS NULL OR LENGTH(TRIM(p_amendment_rationale)) < 10 THEN
        RAISE EXCEPTION 'Detailed amendment rationale is required (minimum 10 characters).';
    END IF;

    v_new_amendment_no := v_parent.amendment_number + 1;

    -- Clone Header
    INSERT INTO public.facility_vendor_contracts (
        id, facility_id, vendor_id, contract_number, contract_name, contract_type,
        status, is_active, effective_from, effective_to, auto_renew, renewal_notice_days,
        gpo_affiliation, gpo_tier_level, gpo_contract_reference, payment_terms_days,
        prompt_pay_discount_percent, prompt_pay_days, fob_point, freight_terms,
        is_consignment, consignment_reconciliation_frequency, consignment_audit_required,
        annual_volume_commitment_amount, has_rebate_terms, rebate_structure_type, rebate_percentage,
        amendment_number, is_current_version, parent_contract_id, amendment_rationale,
        notes, created_by, updated_by
    ) VALUES (
        v_new_contract_id, v_parent.facility_id, v_parent.vendor_id, v_parent.contract_number,
        v_parent.contract_name || ' (Amendment ' || v_new_amendment_no || ')', v_parent.contract_type,
        'draft', FALSE, v_parent.effective_from, v_parent.effective_to, v_parent.auto_renew, v_parent.renewal_notice_days,
        v_parent.gpo_affiliation, v_parent.gpo_tier_level, v_parent.gpo_contract_reference, v_parent.payment_terms_days,
        v_parent.prompt_pay_discount_percent, v_parent.prompt_pay_days, v_parent.fob_point, v_parent.freight_terms,
        v_parent.is_consignment, v_parent.consignment_reconciliation_frequency, v_parent.consignment_audit_required,
        v_parent.annual_volume_commitment_amount, v_parent.has_rebate_terms, v_parent.rebate_structure_type, v_parent.rebate_percentage,
        v_new_amendment_no, FALSE, v_parent.id, TRIM(p_amendment_rationale),
        v_parent.notes, v_actor_id, v_actor_id
    );

    -- Clone Existing Scopes
    INSERT INTO public.facility_vendor_contract_scopes (
        contract_id, facility_id, scope_type, specialty, component_id, family_id, sku_id,
        authorized_distributor_id, is_consignment_covered, is_excluded, exclusion_reason,
        tier_discount_percent, fixed_procedural_cap_rate, status, is_active, notes
    )
    SELECT
        v_new_contract_id, facility_id, scope_type, specialty, component_id, family_id, sku_id,
        authorized_distributor_id, is_consignment_covered, is_excluded, exclusion_reason,
        tier_discount_percent, fixed_procedural_cap_rate, 'active', TRUE, notes
    FROM public.facility_vendor_contract_scopes
    WHERE contract_id = p_parent_contract_id AND is_active = TRUE;

    RETURN jsonb_build_object(
        'success', TRUE,
        'parent_contract_id', p_parent_contract_id,
        'amendment_contract_id', v_new_contract_id,
        'amendment_number', v_new_amendment_no,
        'message', 'Contract amendment draft successfully cloned and staged.'
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_create_contract_amendment TO authenticated;
```

---

### 8.2 Client Service Contract (`src/lib/contractService.js`)

```javascript
/**
 * ASCANALYST Phase 56: Facility Vendor Contracts Client Service Layer
 * Authoritative client abstraction adhering to db singleton pattern.
 */

export const CONTRACT_TYPES = Object.freeze([
  'DIRECT_OEM',
  'DISTRIBUTOR_CONSIGNMENT',
  'GPO_TIERED',
  'CUSTOM_LOCAL',
  'TRIAL_EVALUATION',
  'CAPITATED_PROCEDURAL'
]);

export const CONTRACT_STATUSES = Object.freeze([
  'draft',
  'pending_approval',
  'approved',
  'active',
  'suspended',
  'expired',
  'terminated',
  'rejected',
  'renewed'
]);

export const SCOPE_TYPES = Object.freeze([
  'ALL_VENDOR_PRODUCTS',
  'SPECIALTY',
  'COMPONENT',
  'PRODUCT_FAMILY',
  'SKU_LINE_ITEM'
]);

export const contractService = {
  // Query contracts with multi-criteria filtering and summary metrics
  async getContracts({
    facilityId,
    vendorId,
    status,
    contractType,
    specialty,
    isExpiringSoon, // boolean (within 60 days)
    search,
    page = 1,
    limit = 25
  }) {},

  // Retrieve complete contract details with scopes, documents, and amendment tree
  async getContractById(contractId) {},

  // Save new or updated draft contract
  async saveContractDraft(contractPayload) {},

  // Submit contract for executive approval
  async submitForApproval(contractId, submissionNotes) {},

  // Review approval (Approve or Reject with mandatory reason)
  async reviewContract(contractId, { action: 'approve' | 'reject', rationale }) {},

  // Suspend active contract (temporary freeze)
  async suspendContract(contractId, { reason }) {},

  // Terminate contract early
  async terminateContract(contractId, { terminationDate, terminationReason }) {},

  // Create versioned contract amendment
  async createAmendment(parentContractId, { amendmentRationale }) {},

  // Manage Contract Scopes
  async addContractScope(contractId, scopePayload) {},
  async updateContractScope(scopeId, scopePayload) {},
  async deleteContractScope(scopeId) {},

  // Sourcing Validation Query: Determine contract eligibility for surgery encounter
  async validateContractCoverage({
    facilityId,
    vendorId,
    componentId,
    skuId,
    procedureDate
  }) {},

  // Document Management
  async uploadContractDocument(contractId, file, documentMetadata) {},
  async getContractDocuments(contractId) {},
  async downloadContractDocument(documentId) {},
  async deleteContractDocument(documentId) {}
};
```

---

## 9. UI & Workflow Architecture

The Phase 56 user experience is integrated into the ASCANALYST Supply Chain & Financial Management suite.

### 9.1 Key Screens & Interaction Workflows

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ASCANALYST ── Facility Contracts Explorer                              [+ New Contract]│
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [Total Active: 28]  [Expiring in 60d: 3]  [Pending Approval: 2]  [Annual Spend: $1.4M] │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Filters: [Vendor: All ▼] [Status: Active ▼] [Type: All ▼] [Search: contract or vendor]│
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Contract #     Vendor          Type         Effective Range   Status     Scopes  Docs │
│ CTR-2026-STR   Stryker Ortho   DIRECT_OEM   2026/01 - 2026/12 [ACTIVE]   14 Comp  3 📄 │
│ CTR-2026-ZIM   Zimmer Biomet   GPO_TIERED   2026/03 - 2027/02 [ACTIVE]   All Prod 2 📄 │
│ CTR-2026-DEP   DePuy Synthes   DIST_CONSIGN 2026/06 - 2027/05 [PENDING]  6 Comp   1 📄 │
│ CTR-2025-ALC   Alcon Vision    CUSTOM_LOCAL 2025/01 - 2025/12 [EXPIRED]  IOL Only 2 📄 │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

#### View 1: Contract Explorer & Operational KPI Board
- **Summary Metric Cards:**
  - Active Contracts Count
  - Contracts Expiring within 30/60/90 Days (Amber alert pill)
  - Pending Approval Count (Blue review badge)
  - Active Volume Spend Commitment Progress Bar
- **Multi-Filter Bar:** Vendor selector, Lifecycle status multi-select, Contract type, GPO affiliation, Search input.
- **Contract Data Grid:** Sortable columns, status badges, covered scope count, document attachment quick-launcher.

#### View 2: Contract Detail & Lifecycle Management Drawer
- **Lifecycle Stepper:** Visual timeline illustrating `Draft → Pending Approval → Approved → Active → Expired`.
- **General & Logistics Tab:** Master terms, effective date picker, FOB point, freight terms, net payment days, consignment flags.
- **Scope & Coverage Builder Tab:** Interactive sub-grid listing covered specialties, components, or SKUs with `INCLUDED` (emerald) vs `EXCLUDED` (rose) badges.
- **Confidential Financials Tab:** (Visible only to roles holding `implants.view_costs` / CFO / Admin). Displays annual commitment, prompt-pay discounts, and confidential rebate tier percentages. Non-cleared roles receive a secure masked disclaimer.
- **Document Management Tab:** Upload zone for PDF contracts, SHA-256 fingerprint verification, expiration date tracker, and preview drawer.
- **Amendment History Tree:** Interactive lineage showing parent contracts, amendments, approval actors, and historical superseded contracts.

#### View 3: Two-Person Approval Modal
- Displays side-by-side comparison of terms if an amendment.
- Enforces separation-of-duties check: Blocks approval button if `auth.uid() = contract.created_by` with informative warning message.
- Input field for mandatory sign-off notes or rejection rationale.

#### View 4: Staged Bulk Contract Import Wizard
- Multi-step wizard:
  1. Upload CSV file with contract headers and scope line-items.
  2. Automated column header mapping and data type validation.
  3. Pre-Flight Conflict Simulation: Verifies vendors exist in `implant_vendors`, checks for date interval overlaps, and flags potential duplicates.
  4. Staged Preview Grid: Displays green valid rows and amber warning rows.
  5. Explicit Commit Action: Atomic database transaction importing valid contracts into `draft` state.

---

### 9.2 UI States & Error Handling Standards

| State | Visual Treatment & System Behavior |
| :--- | :--- |
| **Loading** | Skeleton loaders mirroring table headers and KPI cards; pulsating dark slate placeholders. |
| **Empty (No Contracts)** | Center-aligned illustrated state: "No vendor contracts established for this facility. Click '+ New Contract' to author a commercial agreement or import GPO contracts." |
| **Validation Error** | Inline rose message callouts (`#F43F5E`); highlight conflicting date fields or empty mandatory numbers. |
| **Permission Denied** | Informative banner: "Administrative clearance required (`implants.manage_contracts`) to edit or submit vendor contracts. Contact your facility administrator." |
| **Overlap Conflict** | Warning modal: "Active contract overlap detected: Vendor X already has an active contract (#CTR-2026-001) for this scope covering 2026-01-01 to 2026-12-31. Terminate or amend the existing agreement first." |
| **Expired Warning** | Prominent amber pill (`#F59E0B`): "Contract expired on 2026-09-30. Sourcing authorization is suspended. Create a renewal amendment to re-authorize." |

---

### 9.3 AI Query Governance & Context Masking
When AI assistant features (Phase 43/50) query vendor contracts to answer operational or procurement questions:
1. **Tenant Filtering:** AI retrieval queries MUST include `facility_id` matching active session context.
2. **Confidential Masking:** If the user session lacks `implants.view_costs`, AI system prompts and semantic search embeddings MUST redact:
   - Specific rebate percentages (`rebate_percentage`)
   - Volume commitment dollar thresholds (`annual_volume_commitment_amount`)
   - Confidential pricing schedules attached as documents
3. **Audit Trail:** AI agent queries against contract intelligence log an audit entry with `action = 'AI_ANALYSIS'`, `source = 'AI_AGENT'`.

---

## 10. Audit Logging & Provenance Standards

In compliance with Phase 24 HIPAA § 164.312(b) and ASCANALYST immutability requirements:

### 10.1 Immutable Audit Log Integration
Every mutation on `facility_vendor_contracts`, `facility_vendor_contract_scopes`, and `facility_vendor_contract_documents` fires `public.fn_audit_log_trigger()` logging directly into `public.audit_logs`:
- **Recorded Attributes:**
  - `facility_id`: Active tenant UUID.
  - `actor_id`: Authenticated user UUID (`auth.uid()`).
  - `entity_type`: `'facility_vendor_contracts'`, `'facility_vendor_contract_scopes'`, or `'facility_vendor_contract_documents'`.
  - `action`: `'INSERT'`, `'UPDATE'`, `'DELETE'`, `'EXECUTE'`, `'OVERRIDE'`.
  - `source`: `'UI'`, `'API'`, `'BACKGROUND_JOB'`, or `'IMPORT'`.
  - `correlation_id`: Unique transaction UUID tracing multi-table operations.
  - `state_diff`: Captures JSON snapshot of `old_data` and `new_data`.

### 10.2 Specifically Audited Critical Events
1. **Status Transitions:** Draft → Pending Approval → Approved → Active → Terminated.
2. **Effective Date Modifications:** Any alteration to `effective_from` or `effective_to`.
3. **Scope Carve-Out Changes:** Any addition or removal of excluded components or product lines.
4. **Commercial Term Adjustments:** Payment terms, prompt-pay discounts, or rebate rate changes.
5. **Document Operations:** Uploading, replacing, or archiving contract PDF documents.
6. **Emergency Override Sourcing:** Case-level clearance of uncontracted vendor implants under Pre-Bill Rule `IMP-005`.

---

## 11. QA Test Matrix & Acceptance Criteria

### 11.1 Required QA Test Matrix (`tests/facility-vendor-contracts.test.js`)

| Suite # | Test Suite Category | Description & Assertions |
| :---: | :--- | :--- |
| **Suite 1** | **Database Migration 031 DDL & Integrity** | Verify forward migration `031_facility_vendor_contracts.sql` and down migration `031_facility_vendor_contracts_down.sql` exist and are substantive (>5,000 bytes). Verify creation of `facility_vendor_contracts`, `facility_vendor_contract_scopes`, and `facility_vendor_contract_documents`. Assert foreign key from `case_devices(contract_id)` to `facility_vendor_contracts(id)`. Verify check constraints (`effective_to >= effective_from`, `is_active` sync). Verify rollback drops all objects cleanly. |
| **Suite 2** | **Contract Lifecycle & Deterministic State Machine** | Assert valid transitions: `draft → pending_approval → approved → active → expired/terminated`. Assert that draft contract cannot have `is_active = TRUE`. Assert that contract cannot activate without `approved_by` and `approved_at`. Test separation of duties: assert rejection when creator attempts self-approval. Verify auto-expiration evaluation when procedure date exceeds `effective_to`. |
| **Suite 3** | **Sourcing Eligibility & Overlap Resolution** | Test `validateContractCoverage` stored procedure. Assert vendor with active contract covering Knee Femoral returns `CONTRACT_AUTHORIZED`. Assert vendor with expired contract returns `UNCONTRACTED_VENDOR_SOURCING`. Assert that component explicitly marked with `is_excluded = TRUE` returns `SCOPE_EXCLUDED`. Assert rejection of overlapping active contracts for identical vendor and scope. |
| **Suite 4** | **Multi-Tenant Isolation & RLS Security** | Assert that Facility A user cannot view, update, or delete contracts belonging to Facility B. Assert `auth.uid() IS NULL` is nowhere used as a bypass in RLS policies. Assert cross-facility update is blocked by relocation prevention trigger. Assert confidential terms (rebates, commitments) are hidden from users lacking `implants.view_costs`. |
| **Suite 5** | **UI & Guideline Compliance (Purple Ban)** | Verify all JSX and CSS files obey strict Maestro Purple Ban (zero purple, violet, indigo, fuchsia tokens). Verify responsive grid layout, status badge colors, loading skeletons, and empty state illustrations. |

---

### 11.2 Production Acceptance Criteria Checklist
- [ ] Database migration `031_facility_vendor_contracts.sql` executes cleanly on Supabase PostgreSQL 15+.
- [ ] Down migration `031_facility_vendor_contracts_down.sql` cleanly drops all objects in reverse dependency order.
- [ ] Foreign key constraint `fk_case_devices_contract_id` links `case_devices` to `facility_vendor_contracts`.
- [ ] Stored procedures execute server-side with hardened `SECURITY DEFINER` and safe `search_path`.
- [ ] Separation of duties strictly enforced: self-approval blocked for non-super admins.
- [ ] Two-person approval workflow logs complete before/after audit entries in `public.audit_logs`.
- [ ] Client service `src/lib/contractService.js` wired onto `db` singleton.
- [ ] 100% of tests in `tests/facility-vendor-contracts.test.js` pass green.
- [ ] Entire regression test suite passes without regressions (current baseline: 636/636 tests green).
- [ ] Zero mock or placeholder values presented as production truth.
- [ ] Strict Maestro Purple Ban verified across all CSS and JSX files.
- [ ] Production build (`npm run build`) passes cleanly with zero errors.

---

## 12. Risks, Blockers, and Unresolved Architectural Decisions

### 12.1 Identified Risks & Mitigations

1. **Risk: Multi-Distributor Consignment Ambiguity**
   - *Risk:* An ASC purchases Stryker implants through both a direct manufacturer consignment agreement and an independent logistics distributor (e.g. Medline or a local sales agency) with different delivery markups.
   - *Mitigation:* The `facility_vendor_contract_scopes` table explicitly incorporates `authorized_distributor_id REFERENCES public.implant_vendors(id)`. If sourcing via a distributor, the contract scope binds the specific distributor and confirms their relationship via `implant_vendor_relationships` (Phase 53).

2. **Risk: Retroactive Rebate Calculation Complexity**
   - *Risk:* Annual volume rebates (e.g., 5% rebate if annual spend exceeds $500,000) cannot be calculated at the point of intra-operative case documentation because the final annual spend is unknown.
   - *Mitigation:* Phase 56 records the legal terms and rebate tiers (`annual_volume_commitment_amount`, `rebate_percentage`). Point-of-care case margins evaluate baseline contract unit cost; the downstream Phase 5B Variance & Analytics Engine computes projected and retroactively accrued volume rebates.

3. **Risk: Small Facility Administrative Bottlenecks**
   - *Risk:* In small single-OR surgery centers with only one clinical/materials administrator, strict two-person separation of duties could block urgent contract authorizations.
   - *Mitigation:* The database trigger explicitly permits `super_admin` or delegated network `org_admin` accounts to sign off, while providing an auditable Emergency Override pathway.

4. **Risk: Pre-Catalog Contract Execution**
   - *Risk:* An ASC signs a master agreement with a new vendor before importing individual catalog SKUs into `implant_product_skus`.
   - *Mitigation:* Supported by design: `facility_vendor_contract_scopes` allows `scope_type = 'ALL_VENDOR_PRODUCTS'` or `scope_type = 'COMPONENT'`. SKUs can be imported subsequently (Phase 54) and automatically inherit the active master contract.

---

## 13. Implementation Plan & Definition of Done

### 13.1 Phased Implementation Roadmap
Implementation of Phase 56 will proceed in six discrete, test-driven steps upon user authorization:

1. **Step 1 — Database Migration 031 Authoring:**
   - Create `supabase/migrations/031_facility_vendor_contracts.sql` and `031_facility_vendor_contracts_down.sql`.
   - Deploy tables: `facility_vendor_contracts`, `facility_vendor_contract_scopes`, `facility_vendor_contract_documents`.
   - Establish foreign key `fk_case_devices_contract_id` on `public.case_devices`.
   - Deploy triggers for `updated_at`, relocation prevention, hard-delete prevention, approval separation of duties, and audit logs.
   - Deploy stored procedures `fn_upsert_facility_vendor_contract`, `fn_review_facility_vendor_contract`, `fn_create_contract_amendment`.

2. **Step 2 — Client Service Layer Authoring:**
   - Create `src/lib/contractService.js` implementing all query, upsert, approval, amendment, and validation methods.
   - Bind methods to `db` singleton in `src/lib/supabase.js`.

3. **Step 3 — UI Component & Styling Implementation:**
   - Create `src/components/FacilityVendorContracts.jsx` and `src/components/FacilityVendorContracts.css`.
   - Implement Contract Explorer, KPI summary cards, multi-filter controls, detail drawer, scope builder, and approval modals.
   - Obey clinical dark mode theme and strict Maestro Purple Ban.

4. **Step 4 — Application Navigation Integration:**
   - Mount component in `src/App.jsx` under `CLINICAL` or `FINANCE` navigation with `FileText` or `Briefcase` icon.
   - Verify tab state persistence and facility context switching.

5. **Step 5 — Automated QA Test Suite:**
   - Author `tests/facility-vendor-contracts.test.js` covering Migrations, Service Logic, Security/RLS, and UI compliance.
   - Execute test runner and assert 100% pass rate.

6. **Step 6 — Production Build & Lint Verification:**
   - Run `npm test`, `npm run lint`, and `npm run build` to confirm zero regressions.

---

### 13.2 Definition of Done
Phase 56 is complete only when:
- Complete relational DDL with constraints, RLS, triggers, and procedures is committed.
- Two-person approval workflow and separation of duties operate deterministically.
- All 5 test suites pass with 100% compliance in `tests/facility-vendor-contracts.test.js`.
- All existing 636 regression tests remain green.
- Zero mock or placeholder values are presented as production truth.
- Zero banned purple/violet tokens exist in JSX or CSS.
- Production build succeeds without errors or warnings.

---

## 14. Final Verdict

### Final Decision: `GO FOR SPECIFICATION`

**Summary of Audit Findings:**
1. **Foundational Preconditions Satisfied:** All upstream dependencies (Phases 50 through 55) are verified, stabilized, and tested.
2. **Relational Integrity Guaranteed:** The 3-table normalized schema (`facility_vendor_contracts`, `facility_vendor_contract_scopes`, `facility_vendor_contract_documents`) prevents unvalidated text/JSON anti-patterns while enabling granular carve-outs and multi-distributor sourcing.
3. **Security & Compliance Hardened:** Multi-tenant RLS, strict separation of duties, masked confidential terms, and immutable Phase 24 audit logging guarantee HIPAA § 164.312(b) compliance.
4. **Migration Sequence Confirmed:** `031_facility_vendor_contracts.sql` is authoritatively established as the next sequential migration.

**Execution Status:** Master architecture specification approved. Ready for Phase 56 implementation upon user authorization.
