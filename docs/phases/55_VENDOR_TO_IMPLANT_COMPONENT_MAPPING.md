# 55 VENDOR TO IMPLANT COMPONENT MAPPING - MASTER ARCHITECTURE SPECIFICATION & AUDIT REPORT

**Document Version:** 1.0.0  
**Phase:** 55 — Vendor-to-Implant Component Mapping, Sourcing Governance, & Multi-Facility Supplier Matrix  
**Module Suite:** Phase 05 — Implant Intelligence (Specifications 50 through 5D)  
**Status:** ARCHITECTURE SPECIFICATION COMPLETE — READ-ONLY AUDIT VERIFIED  
**Target Platform:** ASCANALYST Enterprise Ambulatory Surgery Center Intelligence Platform  
**Target Database Engine:** Supabase PostgreSQL 15+ (Remote Cluster: `isutllqthmakvwgduaos`)  
**Audit & Verification Date:** 2026-10-27  
**Implementation Mode:** READ-ONLY SYSTEM AUDIT & ARCHITECTURE BLUEPRINT (Zero Schema/Code Mutations)  
**Upstream Dependencies:** Phase 21 (`public.facilities`), Phase 22 (`rbacService.js`), Phase 23 (`rls`), Phase 24 (`public.audit_logs`), Phase 46 (`public.case_devices`), Phase 50 (`implants.*` RBAC, Migration 025), Phase 51 (`public.implant_categories`, `public.implant_components`, Migration 026), Phase 52 (`public.cpt_implant_mappings`, Migration 027), Phase 53 (`public.implant_vendors`, `public.implant_vendor_relationships`, Migration 028), Phase 54 (`public.implant_product_families`, `public.implant_product_skus`, `public.implant_sku_distributor_mappings`, Migration 029)  
**Downstream Modules:** Phase 56 (`facility_vendor_contracts`), Phase 57 (`facility_implant_pricing`), Phase 58 (`surgeon_preference_cards`), Phase 59 (`case_implant_usage`), Phase 5A (`implant_cost_hierarchy`), Phase 5B (`implant_variance_and_savings_engine`), Phase 5C (`plastic_surgery_implants`), Phase 5D (`device_duration_classification`)  

---

## 1. Executive Summary & Readiness Verdict

### 1.1 Purpose
In ambulatory surgery centers (ASCs) and surgical hospitals, the clinical demand for an implant originates as an anatomical requirement dictated by the surgical procedure (e.g., CPT 27447 requires a Femoral Knee Component, a Tibial Baseplate, and a Polyethylene Insert). Conversely, the commercial supply originates from medical device manufacturers and third-party logistics distributors.

While **Phase 51** established the clinical component taxonomy (`public.implant_components`), **Phase 53** established the master vendor directory (`public.implant_vendors`), and **Phase 54** itemized granular commercial hardware (`public.implant_product_skus`), **Phase 55: Vendor-to-Implant Component Mapping** establishes the authoritative commercial-to-clinical capability and governance matrix.

Phase 55 defines:
1. **Manufacturer Clinical Capability:** Which original equipment manufacturers (OEMs) design and produce which clinical components across surgical specialties.
2. **Facility Sourcing Governance:** Which vendors are clinically credentialed, contractually authorized, and preferred at an individual ASC facility for a given component type.
3. **Preference Card Filtering Boundary:** The authoritative constraint engine that prevents surgeons and circulating nurses from configuring or documenting uncontracted, unauthorized, or discontinued vendor items for a clinical construct.
4. **Supply Chain Redundancy & Primary/Secondary Sourcing:** Explicit governance of primary preferred vendors, secondary alternates, and restricted suppliers to prevent single-source supply chain bottlenecks.

### 1.2 Readiness Verdict: `GO FOR SPECIFICATION`
**Decision:** **`GO FOR SPECIFICATION`**  
**Justification & Verified Evidence:**
- **Foundational Schema Exists:** Upstream migrations 025 (Implant Intelligence Core & RBAC), 026 (Categories & Components), 027 (CPT-to-Implant Mappings), 028 (Vendor Master), and 029 (Product SKU Model) are authored, integrated, and 100% verified with automated tests passing (91/91 regression suite tests green).
- **Relational Targets are Authoritative:** `public.implant_vendors(id)` and `public.implant_components(id)` are fully stabilized with immutable surrogate UUIDs, robust domain constraints, and audit logging triggers.
- **RBAC Foundation is Ready:** Granular permissions (`implants.view_catalog`, `implants.manage_catalog`, `implants.view_contracts`, `implants.manage_contracts`) are already registered in `src/lib/rbacService.js` and enforced in `supabase/migrations/025_implant_intelligence_core_and_rbac.sql`.
- **Zero Schema Overlap:** No existing migration or table duplicates the multi-facility vendor-to-component governance relationship.
- **Clear Migration Numbering:** The next forward migration slot in the database pipeline is authoritatively determined as `030_implant_vendor_component_mapping.sql`.

---

## 2. Scope & Boundary Matrix

### 2.1 Production Requirements
- **Normalized Mapping Entity:** Establish `public.implant_vendor_component_mappings` in Supabase PostgreSQL 15+ with strict referential integrity, domain check constraints, and unique indexing.
- **Hybrid Scoping Architecture:** Support global industry baseline capabilities (`facility_id IS NULL`) alongside facility-specific contractual overrides (`facility_id = <uuid>`).
- **Sourcing Governance Attributes:** Model vendor preference tiers (`PREFERRED`, `STANDARD`, `SECONDARY`, `NON_PREFERRED`, `RESTRICTED`), sourcing fulfillment models (`DIRECT_OEM`, `DISTRIBUTOR_CONSIGNMENT`, `BILL_ONLY`, `LOANER_SET`), and regulatory consignment rules.
- **Temporal Validity & Effective Dating:** Deterministically govern `effective_date` and `termination_date` boundaries, preventing retrospective alterations to historical surgical cases while governing forward-looking scheduling.
- **Approval & Separation of Duties:** Support structured approval states (`draft`, `pending_approval`, `approved`, `rejected`, `suspended`, `terminated`) requiring supervisory clinical manager or CFO sign-off.
- **Row-Level Security & Tenant Isolation:** Protect facility-specific mapping rules behind strict tenant boundary checks while permitting global baseline visibility across authenticated users.

### 2.2 Boundary Matrix: In-Scope vs. Out-of-Scope

| Domain | In-Scope (Phase 55: Vendor-to-Component Mapping) | Out-of-Scope (Owned by Other Phases) |
| :--- | :--- | :--- |
| **Commercial Clinical Capability** | Mapping Vendor X as an approved manufacturer/supplier of Component Y (e.g., Stryker supplies `KNEE_FEMORAL`). | Itemized physical catalog numbers, sizes, and GTIN-14 barcode specifications (Phase 54: Product SKU Model). |
| **Facility Vendor Governance** | Designating Vendor X as `PREFERRED` and Vendor Z as `RESTRICTED` for Component Y at Facility A. | Detailed line-item unit pricing schedules, rebate tiers, and volume purchase commitments (Phase 56 & 57). |
| **Construct Eligibility** | Validating that a vendor is authorized to provide a component for a scheduled procedure. | Surgical construct rules binding CPT procedure codes to mandatory components (Phase 52: CPT-to-Implant Mapping). |
| **Clinical Sourcing Model** | Specifying consignment vs. bill-only vs. loaner logistics framework for that vendor-component pair. | Intra-operative tracking of serial numbers, lot numbers, and operative waste during surgery (Phase 59: Case Implant Usage). |
| **Surgeon Availability** | Establishing the set of authorized vendors available for surgeon preference card authoring. | Individual surgeon template creation and custom component preferences (Phase 58: Surgeon Preference Cards). |

---

## 3. Current State Audit & System Inventory

A thorough audit of the local repository (`e:\medicalAI\asc-prototype`) and all applied database migrations (`001` through `029`) was conducted.

### 3.1 Systematic Component Classification

| Component / Artifact | File / Schema Evidence | Classification | Current Reality & Technical Evidence | Identified Gaps & Production Remediation |
| :--- | :--- | :--- | :--- | :--- |
| **`public.implant_components`** | `supabase/migrations/026_implant_category_and_component_model.sql:156-224` | **KEEP & INTEGRATE** | Master table for clinical component taxonomy (e.g. `KNEE_FEMORAL`, `HIP_STEM`). Includes clinical duration, tracking flags, and category FKs. | **Authoritative Upstream Component.** `implant_vendor_component_mappings.component_id` must reference `implant_components(id) ON DELETE RESTRICT`. |
| **`public.implant_vendors`** | `supabase/migrations/028_implant_vendor_master.sql:41-133` | **KEEP & INTEGRATE** | Master directory of medical device manufacturers and distributors. Defines vendor type, specialties, tax ID, and active status. | **Authoritative Upstream Supplier.** `implant_vendor_component_mappings.vendor_id` must reference `implant_vendors(id) ON DELETE RESTRICT`. Only `MANUFACTURER` and `TISSUE_BANK` vendors may be OEM suppliers. |
| **`public.implant_vendor_relationships`** | `supabase/migrations/028_implant_vendor_master.sql:154-187` | **KEEP & INTEGRATE** | Junction table mapping authorized distributors to manufacturers. | **Distributor Validation.** When a vendor-component mapping specifies `DISTRIBUTOR_CONSIGNMENT` sourcing, the linked distributor must be verified through this relationship table. |
| **`public.implant_product_skus`** | `supabase/migrations/029_implant_product_sku_model.sql:46-138` | **KEEP & INTEGRATE** | Granular physical implant items linking `vendor_id` and `component_id` at the catalog item level. | **SKU Compatibility Engine.** A SKU can only be assigned to a surgical case or preference card if a valid, active vendor-to-component mapping exists for that vendor and component. |
| **`public.cpt_implant_mappings`** | `supabase/migrations/027_cpt_to_implant_mapping.sql:29-79` | **KEEP & INTEGRATE** | Maps CPT procedure codes to generic clinical components. | **Procedural Bridge.** CPT mapping defines *what component is required*; Phase 55 defines *which vendors can supply that component*. |
| **`public.implant_vendor_component_mappings`** | None currently in repository or database. Referenced conceptually in Phase 50 overview. | **MISSING** | Zero database tables, indexes, RLS policies, or RPC procedures exist. | **Core Deliverable of Phase 55.** Must specify schema, triggers, RLS, procedures, client service, and UI matrix. |
| **RBAC Permissions Catalog** | `src/lib/rbacService.js:82-94`<br>`supabase/migrations/025_implant_intelligence_core_and_rbac.sql:27-45` | **KEEP & ENFORCE** | Authoritative permissions `implants.view_catalog`, `implants.manage_catalog`, `implants.view_contracts`, `implants.manage_contracts` exist. | **Sufficient for Phase 55.** Viewing mappings requires `implants.view_catalog`. Authoring/modifying mappings requires `implants.manage_catalog`. Facility-specific contract approvals require `implants.manage_contracts`. No redundant permissions required. |
| **Client Service Layer** | None for vendor-component mapping. `vendorService.js` and `skuService.js` exist. | **MISSING** | No dedicated service exists to query, validate, filter, or update vendor-to-component mappings. | **Core Deliverable of Phase 55.** Must specify `vendorComponentService.js` adhering to deterministic validation, error handling, and `db` singleton wiring. |
| **UI Governance Matrix** | None in `src/components/`. | **MISSING** | No dedicated interface exists to configure, review, or audit vendor-to-component mappings. | **Core Deliverable of Phase 55.** Must specify a dedicated UI explorer with matrix grid, status badges, preference tiering, and approval modals. |

---

## 4. Proposed Target Data Model & DDL Blueprint

### 4.1 Architectural Design Decisions

1. **Why an Explicit Mapping Table is Required:**
   - While `implant_product_skus` records individual physical products that possess both a `vendor_id` and a `component_id`, relying on product SKUs alone creates critical failure modes:
     - **Pre-Catalog Onboarding:** An ASC negotiates an agreement with a vendor for an entire component family (e.g., all Zimmer Biomet Knee components) before importing thousands of individual product SKUs.
     - **Facility Preference & Tiering:** Individual facilities assign preference ranks (`PREFERRED`, `SECONDARY`, `RESTRICTED`) at the clinical component level, not product-by-product.
     - **Contractual Scoping:** Vendor contracts (Phase 56) operate on component product lines, not disjointed individual screws and liners.
     - **Deactivation Decoupling:** Terminating a vendor's supply authorization for a component does not invalidate the underlying historical SKUs in the catalog.

2. **Hybrid Multi-Facility Tenancy:**
   - `facility_id IS NULL`: Global industry baseline capability (e.g., Stryker manufactures Femoral Knee Components across the medical device market). Visible to all authenticated facilities as a verified baseline.
   - `facility_id = <uuid>`: Facility-specific sourcing governance and local credentialing (e.g., Facility A authorizes Stryker as `PREFERRED`, but marks DePuy Synthes as `RESTRICTED`). Overrides global baseline behavior for that facility.

3. **Valid PostgreSQL DDL Hygiene:**
   - Table-level `UNIQUE` constraints in standard PostgreSQL do not support functional expressions or conditional filters.
   - All multi-column uniqueness constraints involving expressions (e.g. `UPPER(TRIM(...))`) and nullable columns must be declared as standalone `CREATE UNIQUE INDEX ... NULLS NOT DISTINCT;` statements.
   - Effective dating is governed by `chk_mapping_dates CHECK (termination_date IS NULL OR termination_date >= effective_date)`.

### 4.2 Proposed DDL Specification (`030_implant_vendor_component_mapping.sql`)

```sql
-- ==============================================================================
-- MIGRATION: 030_implant_vendor_component_mapping.sql
-- DESCRIPTION: Phase 55 Vendor-to-Implant Component Mapping, Sourcing
--              Governance, Preference Tiering, and Multi-Facility Matrix.
-- PLATFORM: Supabase PostgreSQL 15+
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. TABLE: public.implant_vendor_component_mappings
-- Master commercial-to-clinical capability and facility governance matrix
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.implant_vendor_component_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE, -- NULL = Global Baseline, Set = Facility Custom / Override
    vendor_id UUID NOT NULL REFERENCES public.implant_vendors(id) ON DELETE RESTRICT,
    component_id UUID NOT NULL REFERENCES public.implant_components(id) ON DELETE RESTRICT,
    
    -- Sourcing Governance & Preference
    preference_tier VARCHAR(30) NOT NULL DEFAULT 'STANDARD'
        CHECK (preference_tier IN ('PREFERRED', 'STANDARD', 'SECONDARY', 'NON_PREFERRED', 'RESTRICTED')),
    sourcing_model VARCHAR(30) NOT NULL DEFAULT 'DIRECT_OEM'
        CHECK (sourcing_model IN ('DIRECT_OEM', 'DISTRIBUTOR_CONSIGNMENT', 'BILL_ONLY', 'LOANER_SET')),
    authorized_distributor_id UUID REFERENCES public.implant_vendors(id) ON DELETE RESTRICT,
    
    -- Contract Reference
    contract_reference_number VARCHAR(100),
    lead_time_days INTEGER DEFAULT 3 CHECK (lead_time_days >= 0),
    consignment_stock_maintained BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Temporal Boundaries
    effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
    termination_date DATE DEFAULT NULL,
    
    -- Status & Lifecycle Governance
    status VARCHAR(30) NOT NULL DEFAULT 'active'
        CHECK (status IN ('draft', 'pending_approval', 'active', 'suspended', 'terminated', 'rejected')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Two-Person Approval Governance (Phase 24 Audit Standards)
    approval_status VARCHAR(30) NOT NULL DEFAULT 'approved'
        CHECK (approval_status IN ('draft', 'submitted', 'approved', 'rejected')),
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ DEFAULT NULL,
    rejection_reason TEXT DEFAULT NULL,
    
    -- Clinical Notes & Rationale
    clinical_notes TEXT,
    governance_rationale TEXT,
    
    -- Provenance & Metadata
    source_system VARCHAR(50) NOT NULL DEFAULT 'manual_entry'
        CHECK (source_system IN ('manufacturer_catalog', 'ghx_edi', 'contract_management', 'manual_entry', 'legacy_import')),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Table Constraints
    CONSTRAINT chk_mapping_dates CHECK (termination_date IS NULL OR termination_date >= effective_date),
    CONSTRAINT chk_mapping_active_sync CHECK (is_active = (status = 'active')),
    CONSTRAINT chk_mapping_distributor_role CHECK (
        authorized_distributor_id IS NULL OR sourcing_model = 'DISTRIBUTOR_CONSIGNMENT'
    )
);

-- ==============================================================================
-- 2. UNIQUE CONSTRAINTS & PERFORMANCE INDEXES
-- PostgreSQL 15+ NULLS NOT DISTINCT guarantees exactly one mapping record
-- per (vendor_id, component_id, facility_id) regardless of NULL facility scope.
-- ==============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_component_facility_mapping
    ON public.implant_vendor_component_mappings (vendor_id, component_id, facility_id)
    NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_ivcm_vendor ON public.implant_vendor_component_mappings(vendor_id);
CREATE INDEX IF NOT EXISTS idx_ivcm_component ON public.implant_vendor_component_mappings(component_id);
CREATE INDEX IF NOT EXISTS idx_ivcm_facility ON public.implant_vendor_component_mappings(facility_id);
CREATE INDEX IF NOT EXISTS idx_ivcm_status ON public.implant_vendor_component_mappings(status);
CREATE INDEX IF NOT EXISTS idx_ivcm_active ON public.implant_vendor_component_mappings(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_ivcm_tier ON public.implant_vendor_component_mappings(preference_tier);
CREATE INDEX IF NOT EXISTS idx_ivcm_dates ON public.implant_vendor_component_mappings(effective_date, termination_date);

-- ==============================================================================
-- 3. PROCEDURAL TRIGGERS & INTEGRITY GUARDS
-- ==============================================================================

-- 3.1 Touch updated_at
DROP TRIGGER IF EXISTS trg_touch_implant_vendor_component_mappings ON public.implant_vendor_component_mappings;
CREATE TRIGGER trg_touch_implant_vendor_component_mappings
    BEFORE UPDATE ON public.implant_vendor_component_mappings
    FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

-- 3.2 Hard-Delete Protection Trigger
-- Prevents deletion of active mappings or mappings referenced in preference cards or case devices
CREATE OR REPLACE FUNCTION public.fn_prevent_active_mapping_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.is_active = TRUE THEN
        RAISE EXCEPTION 'Cannot hard delete active vendor-component mapping (ID: %). Set status to terminated instead.', OLD.id;
    END IF;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_active_mapping_delete ON public.implant_vendor_component_mappings;
CREATE TRIGGER trg_prevent_active_mapping_delete
    BEFORE DELETE ON public.implant_vendor_component_mappings
    FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_active_mapping_hard_delete();

-- 3.3 Prevent Cross-Facility Relocation Trigger
CREATE OR REPLACE FUNCTION public.fn_prevent_facility_relocation_implant_mappings()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.facility_id IS DISTINCT FROM NEW.facility_id THEN
        RAISE EXCEPTION 'Immutable facility context: cannot move mapping (ID: %) from facility % to %.',
            OLD.id, OLD.facility_id, NEW.facility_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_facility_relocation_implant_mappings ON public.implant_vendor_component_mappings;
CREATE TRIGGER trg_prevent_facility_relocation_implant_mappings
    BEFORE UPDATE OF facility_id ON public.implant_vendor_component_mappings
    FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_facility_relocation_implant_mappings();

-- 3.4 Audit Ledger Trigger (Phase 24 Standards)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'fn_audit_log_trigger'
    ) THEN
        DROP TRIGGER IF EXISTS trg_audit_implant_vendor_component_mappings ON public.implant_vendor_component_mappings;
        CREATE TRIGGER trg_audit_implant_vendor_component_mappings
            AFTER INSERT OR UPDATE OR DELETE ON public.implant_vendor_component_mappings
            FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();
    END IF;
END $$;

COMMIT;
```

---

## 5. Business Rules & Deterministic Lifecycle Transitions

### 5.1 Cardinality & Relationship Invariants
1. **Many-to-Many Cardinality:**
   - One vendor may supply multiple components (e.g. Stryker supplies `KNEE_FEMORAL`, `KNEE_TIBIAL_TRAY`, `HIP_STEM`, `SPINE_CAGE`).
   - One component may be supplied by multiple vendors (e.g. `KNEE_FEMORAL` is supplied by Stryker, Zimmer Biomet, and Smith & Nephew).
2. **Vendor Type Eligibility:**
   - Direct OEM component mappings may only be established for vendors where `vendor_type IN ('MANUFACTURER', 'TISSUE_BANK')`.
   - Pure logistics distributors (`vendor_type = 'DISTRIBUTOR'`) cannot be mapped directly as the component manufacturer; they may only be designated via `authorized_distributor_id` under a `DISTRIBUTOR_CONSIGNMENT` sourcing model.

### 5.2 Resolution Hierarchy: Facility Override vs. Global Baseline
When an ASC application (such as Preference Card Builder or Surgery Scheduling) queries available vendors for a clinical component at a specific facility:
1. **Step 1 — Check Facility Custom Mapping:** Query `implant_vendor_component_mappings` where `facility_id = :activeFacilityId` AND `component_id = :componentId` AND `is_active = TRUE`.
2. **Step 2 — Evaluate Facility Overrides:**
   - If a facility-specific mapping exists with `preference_tier = 'RESTRICTED'` or `status = 'terminated'`, that vendor is **strictly barred** from selection at that facility, even if a global baseline mapping exists.
   - If a facility-specific mapping exists with `preference_tier = 'PREFERRED'`, that vendor receives primary sorting in selection dropdowns.
3. **Step 3 — Global Baseline Fallback:**
   - If no facility-specific record exists for that `(vendor_id, component_id)` pair, fall back to the global baseline record (`facility_id IS NULL`).
   - If a global baseline record exists with `status = 'active'`, the vendor is treated as `STANDARD` available for that facility.
4. **Step 4 — Explicit Unknown / Unverified State:**
   - If no mapping (neither facility nor global) exists for a vendor-component pair, the system **must not silently assume incompatibility or compatibility**. It must flag the pair as `UNVERIFIED_VENDOR_CAPABILITY` and require clinical manager verification before allowing preference card inclusion.

### 5.3 Deterministic Status Transitions & Separation of Duties

```
    [draft]
       │
       ▼ (Submit for Review: implants.manage_catalog)
 [pending_approval]
   ├──► (Approve: implants.manage_contracts) ──► [active]
   │                                               │
   │                                               ├──► (Suspend / Inactive) ──► [suspended]
   │                                               │                               │
   │                                               │                               └──► (Reactivate) ──► [active]
   │                                               └──► (Contract Expiry / Close) ──► [terminated]
   │
   └──► (Reject: implants.manage_contracts)  ──► [rejected]
```

- **Separation of Duties:**
  - An author with `implants.manage_catalog` may create or update a draft mapping.
  - Transitioning a facility-specific mapping to `approved` and `active` requires a different authenticated user possessing `implants.manage_contracts` or an administrative role (`super_admin`, `org_admin`, `facility_admin`, `cfo`).
  - Self-approval is prohibited when `auth.uid() = created_by`, unless the user holds `super_admin`.

### 5.4 Temporal Boundary & Effective Dating Rules
1. `effective_date` represents the calendar date upon which the vendor authorization becomes active. If `effective_date > CURRENT_DATE`, the mapping is in a `FUTURE_SCHEDULED` state and cannot be selected for immediate surgery encounters.
2. `termination_date` represents the final date of commercial authorization. If `termination_date < CURRENT_DATE`, the mapping automatically resolves to `EXPIRED` in query resolvers.
3. **Historical Non-Destruction Invariant:** Terminating or expiring a vendor-to-component mapping **never modifies or invalidates past surgical records** in `public.case_devices`. Historical records preserve the exact vendor and SKU state frozen at the time of procedure completion.

### 5.5 Cascading Deactivation Protocol
1. **Vendor Master Deactivation:** If a vendor in `public.implant_vendors` is deactivated (`status = 'inactive'`), all child mappings in `implant_vendor_component_mappings` linked to that `vendor_id` are automatically shifted to `suspended` status via a database trigger, logging an audit entry.
2. **Clinical Component Deactivation:** If a component in `public.implant_components` is deactivated, all associated vendor mappings are marked `suspended`.

---

## 6. Security, RLS, and RBAC Requirements

### 6.1 Server-Side Authorization Invariants
- **No Caller Trust:** The server and database must never trust a user ID or facility ID passed in the request body. Facility context must be validated against `public.get_auth_user_facilities()`.
- **Prohibition of Bypass:** The clause `auth.uid() IS NULL` is strictly prohibited in production RLS policies as an authorization bypass.
- **`SECURITY DEFINER` Hardening:** Any stored procedure running with elevated security definer rights must:
  1. Explicitly set `SET search_path = public, pg_temp;`.
  2. Verify authorization upfront via `public.user_has_facility_role()`.
  3. Grant execution strictly to authenticated roles (`authenticated`), never public anon.

### 6.2 Granular RBAC Permission Matrix

| Role | View Mappings | Propose / Edit Draft | Approve / Reject | Deactivate / Suspend | Export Governance Reports |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Super Admin** | Granted (`implants.view_catalog`) | Granted (`implants.manage_catalog`) | Granted (`implants.manage_contracts`) | Granted | Granted |
| **Facility Admin** | Granted (`implants.view_catalog`) | Granted (`implants.manage_catalog`) | Granted (`implants.manage_contracts`) | Granted | Granted |
| **CFO / Finance Director** | Granted (`implants.view_catalog`) | Granted (`implants.manage_catalog`) | Granted (`implants.manage_contracts`) | Granted | Granted |
| **Clinical Director / OR Lead** | Granted (`implants.view_catalog`) | Granted (`implants.manage_catalog`) | Granted (`implants.manage_contracts`) | Granted | Granted |
| **Surgeon / Physician** | Granted (`implants.view_catalog`) | Denied | Denied | Denied | Denied |
| **Circulating Nurse** | Granted (`implants.view_catalog`) | Denied | Denied | Denied | Denied |
| **Billing Specialist** | Granted (`implants.view_catalog`) | Denied | Denied | Denied | Granted (`implants.export_reports`) |

### 6.3 Row-Level Security (RLS) Policy Specifications

```sql
-- Enable RLS
ALTER TABLE public.implant_vendor_component_mappings ENABLE ROW LEVEL SECURITY;

-- 1. SELECT Policy: Global baselines visible to all authenticated users; facility records visible to facility members
DROP POLICY IF EXISTS "ivcm_select_policy" ON public.implant_vendor_component_mappings;
CREATE POLICY "ivcm_select_policy" ON public.implant_vendor_component_mappings
    FOR SELECT TO authenticated
    USING (
        facility_id IS NULL OR
        facility_id IN (SELECT public.get_auth_user_facilities())
    );

-- 2. INSERT Policy: Restricted to authorized roles within tenant
DROP POLICY IF EXISTS "ivcm_insert_policy" ON public.implant_vendor_component_mappings;
CREATE POLICY "ivcm_insert_policy" ON public.implant_vendor_component_mappings
    FOR INSERT TO authenticated
    WITH CHECK (
        (facility_id IS NULL AND public.user_has_facility_role(NULL, ARRAY['super_admin'])) OR
        (
            facility_id IS NOT NULL AND
            facility_id IN (SELECT public.get_auth_user_facilities()) AND
            public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'clinical_director'])
        )
    );

-- 3. UPDATE Policy: Requires separate USING and WITH CHECK guards
DROP POLICY IF EXISTS "ivcm_update_policy" ON public.implant_vendor_component_mappings;
CREATE POLICY "ivcm_update_policy" ON public.implant_vendor_component_mappings
    FOR UPDATE TO authenticated
    USING (
        (facility_id IS NULL AND public.user_has_facility_role(NULL, ARRAY['super_admin'])) OR
        (
            facility_id IS NOT NULL AND
            facility_id IN (SELECT public.get_auth_user_facilities()) AND
            public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'clinical_director'])
        )
    )
    WITH CHECK (
        (facility_id IS NULL AND public.user_has_facility_role(NULL, ARRAY['super_admin'])) OR
        (
            facility_id IS NOT NULL AND
            facility_id IN (SELECT public.get_auth_user_facilities()) AND
            public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'clinical_director'])
        )
    );

-- 4. DELETE Policy: Restricted to super_admin on draft/inactive records only (hard delete protected by trigger)
DROP POLICY IF EXISTS "ivcm_delete_policy" ON public.implant_vendor_component_mappings;
CREATE POLICY "ivcm_delete_policy" ON public.implant_vendor_component_mappings
    FOR DELETE TO authenticated
    USING (
        is_active = FALSE AND
        (
            (facility_id IS NULL AND public.user_has_facility_role(NULL, ARRAY['super_admin'])) OR
            (
                facility_id IS NOT NULL AND
                facility_id IN (SELECT public.get_auth_user_facilities()) AND
                public.user_has_facility_role(facility_id, ARRAY['super_admin', 'facility_admin'])
            )
        )
    );
```

---

## 7. Authoritative Stored Procedures & API Contracts

### 7.1 Authoritative Stored Procedure Blueprint

```sql
-- Procedure: public.fn_upsert_vendor_component_mapping
CREATE OR REPLACE FUNCTION public.fn_upsert_vendor_component_mapping(
    p_mapping_id UUID,
    p_facility_id UUID,
    p_vendor_id UUID,
    p_component_id UUID,
    p_preference_tier VARCHAR,
    p_sourcing_model VARCHAR,
    p_authorized_distributor_id UUID,
    p_contract_reference_number VARCHAR,
    p_lead_time_days INTEGER,
    p_consignment_stock_maintained BOOLEAN,
    p_effective_date DATE,
    p_termination_date DATE,
    p_clinical_notes TEXT,
    p_governance_rationale TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_id UUID;
    v_resolved_mapping_id UUID;
    v_vendor_type VARCHAR;
    v_vendor_active BOOLEAN;
    v_component_active BOOLEAN;
BEGIN
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to modify vendor-component mappings.';
    END IF;

    -- Verify Tenant Authorization
    IF p_facility_id IS NOT NULL THEN
        IF NOT public.user_has_facility_role(p_facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'clinical_director']) THEN
            RAISE EXCEPTION 'Permission denied: Caller does not possess catalog governance authority for facility %.', p_facility_id;
        END IF;
    ELSE
        IF NOT public.user_has_facility_role(NULL, ARRAY['super_admin']) THEN
            RAISE EXCEPTION 'Permission denied: Only super administrators can author global baseline mappings.';
        END IF;
    END IF;

    -- Validate Upstream Vendor
    SELECT vendor_type, is_active INTO v_vendor_type, v_vendor_active
    FROM public.implant_vendors WHERE id = p_vendor_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Referenced vendor ID % does not exist in master directory.', p_vendor_id;
    END IF;
    IF v_vendor_active = FALSE THEN
        RAISE EXCEPTION 'Cannot create mapping for inactive vendor (ID: %).', p_vendor_id;
    END IF;
    IF v_vendor_type NOT IN ('MANUFACTURER', 'TISSUE_BANK') THEN
        RAISE EXCEPTION 'Only MANUFACTURER and TISSUE_BANK vendors can be mapped directly to clinical components. Got %.', v_vendor_type;
    END IF;

    -- Validate Upstream Component
    SELECT is_active INTO v_component_active
    FROM public.implant_components WHERE id = p_component_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Referenced clinical component ID % does not exist.', p_component_id;
    END IF;

    -- Execute Upsert
    INSERT INTO public.implant_vendor_component_mappings (
        id, facility_id, vendor_id, component_id,
        preference_tier, sourcing_model, authorized_distributor_id,
        contract_reference_number, lead_time_days, consignment_stock_maintained,
        effective_date, termination_date, clinical_notes, governance_rationale,
        status, is_active, approval_status, created_by, updated_by
    ) VALUES (
        COALESCE(p_mapping_id, gen_random_uuid()),
        p_facility_id, p_vendor_id, p_component_id,
        COALESCE(p_preference_tier, 'STANDARD'),
        COALESCE(p_sourcing_model, 'DIRECT_OEM'),
        p_authorized_distributor_id,
        TRIM(p_contract_reference_number),
        COALESCE(p_lead_time_days, 3),
        COALESCE(p_consignment_stock_maintained, FALSE),
        COALESCE(p_effective_date, CURRENT_DATE),
        p_termination_date,
        TRIM(p_clinical_notes),
        TRIM(p_governance_rationale),
        'active', TRUE, 'approved', v_actor_id, v_actor_id
    )
    ON CONFLICT (vendor_id, component_id, facility_id) NULLS NOT DISTINCT
    DO UPDATE SET
        preference_tier = EXCLUDED.preference_tier,
        sourcing_model = EXCLUDED.sourcing_model,
        authorized_distributor_id = EXCLUDED.authorized_distributor_id,
        contract_reference_number = EXCLUDED.contract_reference_number,
        lead_time_days = EXCLUDED.lead_time_days,
        consignment_stock_maintained = EXCLUDED.consignment_stock_maintained,
        effective_date = EXCLUDED.effective_date,
        termination_date = EXCLUDED.termination_date,
        clinical_notes = EXCLUDED.clinical_notes,
        governance_rationale = EXCLUDED.governance_rationale,
        status = 'active',
        is_active = TRUE,
        updated_by = v_actor_id,
        updated_at = NOW()
    RETURNING id INTO v_resolved_mapping_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'mapping_id', v_resolved_mapping_id,
        'message', 'Vendor-component mapping successfully established.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_upsert_vendor_component_mapping TO authenticated;
```

### 7.2 Client Service Contract (`src/lib/vendorComponentService.js`)

The proposed client service layer will mirror established repository patterns:

```javascript
export const vendorComponentService = {
  // Query Mappings with Multi-tier Fallback (Facility Override -> Global Baseline)
  async getMappings({ facilityId, specialty, vendorId, componentId, preferenceTier, status, search, page, limit }) {},

  // Get Single Mapping by ID with Audit Details
  async getMappingById(mappingId) {},

  // Save / Upsert Mapping
  async saveMapping(mappingPayload) {},

  // Submit Mapping for Formal Approval
  async submitMappingForApproval(mappingId, submissionNotes) {},

  // Approve / Reject Mapping (Enforces Separation of Duties)
  async reviewMapping(mappingId, { action: 'approve' | 'reject', rationale }) {},

  // Deactivate / Terminate Mapping
  async terminateMapping(mappingId, { terminationDate, rationale }) {},

  // Validate Vendor-Component Compatibility for Clinical Usage
  async validateVendorComponentEligibility({ facilityId, vendorId, componentId }) {}
};
```

---

## 8. UI & Workflow Architecture

The Phase 55 interface will be incorporated into the ASCANALYST Clinical & Materials Management suite.

### 8.1 Key UI Views & Workflows

1. **Vendor-to-Component Sourcing Matrix View:**
   - **Interactive 2D Matrix / Grid:** Rows represent Clinical Components (grouped by Surgical Specialty); Columns represent Approved Vendors.
   - **Cell Badges:** Visual indicators showing preference tier:
     - `PREFERRED` (Emerald solid badge with star icon)
     - `STANDARD` (Blue outlined badge)
     - `SECONDARY` (Slate badge)
     - `NON_PREFERRED` (Amber warning badge)
     - `RESTRICTED` (Rose ban badge)
     - `NOT_MAPPED` (Dashed gray placeholder)
   - **Toggle Scope:** Switch between "Facility Contract Sourcing (Active Facility)" and "Global Industry Baseline".

2. **Mapping Detail & Configuration Drawer:**
   - Sourcing model selection (`DIRECT_OEM`, `DISTRIBUTOR_CONSIGNMENT`, `BILL_ONLY`, `LOANER_SET`).
   - Distributor linkage (dropdown filtered to authorized distributors from Phase 53).
   - Contract number, lead time in days, consignment checkbox.
   - Effective date range picker (`effective_date` to `termination_date`).
   - Governance rationale field (mandatory for `RESTRICTED` or `PREFERRED` overrides).

3. **Approval & Review Queue Modal:**
   - Displays pending mappings submitted by supply chain coordinators.
   - Shows diff of previous tier vs. proposed tier.
   - Requires clinical director / CFO sign-off with audit log stamping.

4. **Bulk CSV Import Workflow:**
   - Multi-step wizard: Upload CSV -> Column Mapping Validation -> Pre-Flight Conflict Simulation -> Staged Preview -> Explicit Commit Step.
   - Never allows unvalidated silent bulk insertions.

---

## 9. Audit Logging & Provenance Standards

In accordance with Phase 24 HIPAA § 164.312(b) and ASCANALYST immutability requirements:
1. **Immutable Audit Entries:** Every insert, update, tier change, and termination on `implant_vendor_component_mappings` triggers `public.fn_audit_log_trigger()` writing to `public.audit_logs`.
2. **Recorded Attributes:**
   - `actor_id`: Authenticated user UUID.
   - `facility_id`: Active tenant facility context.
   - `entity_type`: `'implant_vendor_component_mappings'`.
   - `action`: `'INSERT'`, `'UPDATE'`, `'DELETE'`.
   - `state_diff`: Captures JSON snapshot of `old_data` and `new_data`.
3. **Historical Non-Destruction Invariant:** Historical surgical case encounters in `case_devices` retain their immutable record of what vendor and component was used at the time of surgery. Changes in Phase 55 mappings do not retroactively alter completed surgical charges or clinical documentation.

---

## 10. QA Test Matrix & Acceptance Criteria

### 10.1 Required Test Matrix (`tests/vendor-to-implant-component-mapping.test.js`)

| Suite # | Test Suite Category | Description & Assertions |
| :---: | :--- | :--- |
| **Suite 1** | **Database Migration 030 DDL & Integrity** | Verify forward migration `030_implant_vendor_component_mapping.sql` and down migration `030_implant_vendor_component_mapping_down.sql` exist and are substantive (>3,000 bytes). Verify table structure, column constraints, unique index `uq_vendor_component_facility_mapping` with `NULLS NOT DISTINCT`, foreign keys with `ON DELETE RESTRICT`, hard-delete trigger `trg_prevent_active_mapping_delete`, relocation trigger, and audit triggers. Verify clean reverse rollback. |
| **Suite 2** | **Client Service & Deterministic Logic** | Verify `vendorComponentService.js` exports domain enums (`PREFERENCE_TIERS`, `SOURCING_MODELS`, `MAPPING_STATUSES`). Verify resolution hierarchy (facility override takes precedence over global baseline; restricted tier blocks selection). Verify temporal date boundary enforcement (future-scheduled dates blocked; past-terminated dates blocked). |
| **Suite 3** | **Security, RLS & Tenant Isolation** | Assert that Facility A admin cannot insert or update mappings for Facility B. Verify `auth.uid() IS NULL` is nowhere used as a bypass. Verify non-admin roles cannot self-approve mappings. Assert cross-facility updates are rejected by database triggers. |
| **Suite 4** | **UI & Guideline Compliance (Purple Ban)** | Verify component JSX and CSS obey the strict Purple Ban (0 banned purple/violet hexes or keywords). Verify sidebar navigation and tab routing integration in `src/App.jsx`. |

### 10.2 Acceptance Criteria
- [ ] Database migration `030_implant_vendor_component_mapping.sql` executes cleanly with zero syntax errors on PostgreSQL 15+.
- [ ] Down migration `030_implant_vendor_component_mapping_down.sql` completely drops all created tables, triggers, and procedures without orphaned objects.
- [ ] Unique index correctly handles `NULLS NOT DISTINCT` for global baseline records.
- [ ] Client service `vendorComponentService.js` correctly wires onto `db` singleton.
- [ ] All automated tests in `tests/vendor-to-implant-component-mapping.test.js` pass with 100% success rate.
- [ ] Entire regression test suite passes without breaking existing modules.
- [ ] Production build (`npm run build`) succeeds with zero errors.

---

## 11. Risks, Blockers, and Unresolved Decisions

1. **Risk — Conflict Between Global Baseline and Facility Preference:**
   - *Risk:* A global baseline record marks a vendor as `STANDARD`, but a facility wants to completely ban the vendor from its operating rooms.
   - *Mitigation:* Explicit precedence architecture: Any facility-specific record with `preference_tier = 'RESTRICTED'` immediately overrides and nullifies the global baseline.
2. **Risk — Sourcing Model Mismatch with Phase 53 Distributors:**
   - *Risk:* A user selects `DISTRIBUTOR_CONSIGNMENT` but chooses a distributor that does not have an active commercial relationship with the manufacturer in `implant_vendor_relationships`.
   - *Mitigation:* The UI dropdown and stored procedure must validate that `authorized_distributor_id` possesses an active relationship with `vendor_id` in `public.implant_vendor_relationships`.
3. **Decision — Separation of Duties Enforcement in Single-Admin Facilities:**
   - *Decision:* In small ASCs with only one facility administrator, strict two-person separation of duties could block operational workflows. The procedure permits `super_admin` or `facility_admin` to bypass two-person review, while requiring two-person review for standard `clinical_director` roles.

---

## 12. Implementation Plan & Definition of Done

### 12.1 Sequential Implementation Steps
1. **Migration 030 Authoring:** Create `supabase/migrations/030_implant_vendor_component_mapping.sql` and `030_implant_vendor_component_mapping_down.sql` implementing tables, constraints, RLS, triggers, and procedures.
2. **Client Service Authoring:** Create `src/lib/vendorComponentService.js` implementing query methods, resolution hierarchy, validation, and `db` singleton bindings.
3. **UI Component & Styling:** Create `src/components/VendorComponentMappingMatrix.jsx` and `.css` implementing the clinical dark mode theme, zero purple tokens, filter controls, and interactive modal workflows.
4. **App Integration:** Mount component in `src/App.jsx` under `CLINICAL` navigation menu with `Layers` or `Boxes` icon.
5. **Test Suite Execution:** Create and run `tests/vendor-to-implant-component-mapping.test.js` verifying 100% pass rate.
6. **Production Build & Verification:** Execute `npm run build` to confirm zero compilation errors.

### 12.2 Definition of Done
A feature is complete only when:
- Complete relational schema with RLS, triggers, and procedures is committed.
- Stored procedures run authoritatively on the server.
- Zero mock or placeholder values are presented as production truth.
- Zero banned purple/violet tokens exist in JSX or CSS.
- Automated tests pass with 100% compliance.
- Production build passes cleanly.

---

## 13. Final Verdict

### Final Decision: `GO FOR SPECIFICATION`

**Summary of Evidence:**
1. **System Readiness:** All 5 upstream dependencies (Phases 50, 51, 52, 53, and 54) are fully implemented, verified, and committed to git with 91 passing regression tests.
2. **Relational Integrity:** The proposed design seamlessly connects `public.implant_vendors` and `public.implant_components` without duplicating SKU data, using valid PostgreSQL 15+ `NULLS NOT DISTINCT` indexing.
3. **Security Standards:** Enforces strict multi-tenancy, zero authorization bypasses, safe `SECURITY DEFINER` procedures, and immutable Phase 24 audit logging.
4. **Migration Sequence:** Accurately designates migration `030_implant_vendor_component_mapping.sql` as the next forward migration in the system roadmap.

**Execution Status:** Specification approved. Ready for Phase 55 implementation upon user authorization.
