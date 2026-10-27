# 54 IMPLANT PRODUCT SKU MODEL - MASTER ARCHITECTURE SPECIFICATION & AUDIT REPORT

**Document Version:** 1.0.0  
**Phase:** 54 — Implant Product SKU Model, Master Catalog Numbering, FDA UDI-DI, & Distributor Cross-Reference  
**Module Suite:** Phase 05 — Implant Intelligence (Specifications 50 through 5D)  
**Status:** ARCHITECTURE SPECIFICATION COMPLETE — READ-ONLY AUDIT VERIFIED  
**Target Platform:** ASCANALYST Enterprise Ambulatory Surgery Center Intelligence Platform  
**Target Database Engine:** Supabase PostgreSQL 15+ (Remote Cluster: `isutllqthmakvwgduaos`)  
**Audit & Verification Date:** 2026-10-27  
**Implementation Mode:** READ-ONLY SYSTEM AUDIT & ARCHITECTURE BLUEPRINT (Zero Schema/Code Mutations)  
**Upstream Dependencies:** Phase 21 (`public.facilities`), Phase 22 (`rbac`), Phase 23 (`rls`), Phase 24 (`public.audit_logs`), Phase 46 (`public.case_devices`), Phase 50 (`implants.*` RBAC, Migration 025), Phase 51 (`public.implant_categories`, `public.implant_components`, Migration 026), Phase 52 (`public.cpt_implant_mappings`, Migration 027), Phase 53 (`public.implant_vendors`, `public.implant_vendor_relationships`, Migration 028)  
**Downstream Modules:** Phase 55 (`vendor_to_implant_component_mapping`), Phase 56 (`facility_vendor_contracts`), Phase 57 (`facility_implant_pricing`), Phase 58 (`surgeon_preference_cards`), Phase 59 (`case_implant_usage`), Phase 5A (`implant_cost_hierarchy`), Phase 5B (`implant_variance_and_savings_engine`), Phase 5C (`plastic_surgery_implants`), Phase 5D (`device_duration_classification`)  

---

## 1. Executive Summary & Purpose

In ambulatory surgery centers (ASCs) and surgical hospitals, the accurate cataloging, clinical utilization, and financial reconciliation of surgical implants depends upon an uncompromising, deterministic product SKU model. 

While **Phase 51** established generic clinical component taxonomy (e.g., *"Femoral Stem"*, *"Acetabular Cup"*, *"Anterior Cervical Plate"*) and **Phase 53** established the authoritative vendor directory (e.g., *Stryker*, *Zimmer Biomet*, *Medtronic*), **Phase 54: Implant Product SKU Model** bridges the clinical requirement to the physical, commercial, and regulatory medical device item.

Every physical hardware item delivered into the operating room possesses distinct, non-interchangeable identifiers:
1. **Manufacturer Catalog / Model Number:** The OEM engineering specification (e.g., Stryker Triathlon `#5520-F-401`).
2. **FDA Unique Device Identifier - Device Identifier (UDI-DI):** The universal regulatory barcode identifier (GS1 GTIN-14 or HIBCC Primary DI) registered in the FDA Global UDI Database (GUDID).
3. **Internal Center SKU:** The ASC inventory or materials management item code.
4. **Commercial Distributor Item Number:** The distinct logistics item number assigned by third-party distributors (e.g., Cardinal Health `#CH-9021-04`, Medline `#MDL-88310`) through which the ASC actually orders and receives invoices.
5. **CMS HCPCS Device Pass-Through Code:** The Medicare billing category (e.g., `C1713`, `C1776`, `L8699`) required on facility claims.

### 1.1 The Operational Breakdown in Current ASC Inventory Management

Historically, healthcare ASC software systems have collapsed these distinct concepts into ambiguous, free-text strings. In the current operational baseline:
- **Identifier Conflation:** Operating room staff conflate manufacturer catalog numbers, lot numbers, serial numbers, and distributor order codes within the single `model_number` or `device_name` field of `public.case_devices`.
- **Duplicate Product Explosion:** If an ASC purchases a Stryker knee stem directly from Stryker in January, but procures the identical OEM item through Cardinal Health in June, traditional software duplicates the product record, creating separate pricing, usage histories, and contract tracking.
- **Regulatory & Recall Blindness:** When the FDA or manufacturer issues a Class I or Class II medical device safety recall based on a UDI-DI or catalog number, ASCs without normalized SKU models are forced to conduct manual, paper-based chart audits spanning hundreds of surgical records.
- **Contract & Price Creep (Phases 56 & 57):** Without strict SKU normalization, suppliers rename catalog suffixes (e.g., adding a "-S" for sterile pack) and bill at off-contract list prices without automated alert triggering.

### 1.2 The Phase 54 Target Solution

**Phase 54 delivers an enterprise-grade, normalized product SKU model that:**
1. **Separates Product Families from Itemized SKUs:** Groups related physical implants under overarching product lines (`public.implant_product_families`) while maintaining item-level precision (`public.implant_product_skus`).
2. **Decouples Distributor Item Numbers from OEM Products:** Introduces `public.implant_sku_distributor_mappings`, allowing one physical manufacturer SKU to be procured through multiple regional distributors with distinct catalog codes without duplicating the underlying clinical entity.
3. **Enforces Strict Device Identifier Hygiene:** Formally disambiguates Catalog Number, UDI-DI, Lot Number, Serial Number, and HCPCS Pass-Through C-Code into distinct, validated database columns.
4. **Governs Clinical & Regulatory Attributes:** Tracks sterile packaging status, laterality, material composition, MRI safety classification, and device duration classification (inheriting from Phase 51 components).
5. **Enforces Hybrid Tenancy:** Provides a global master catalog (`facility_id IS NULL`) for standard OEM product catalogs alongside facility custom extensions (`facility_id = <uuid>`) for specialized local items.
6. **Protects Downstream Integrity via `ON DELETE RESTRICT`:** Guarantees that active SKUs referenced in surgeon preference cards (58), facility contracts (56), pricing matrices (57), or surgical case usage (59) can never be deleted.

---

## 2. Scope & Boundary Matrix

### 2.1 Production Requirements

- **Normalized Catalog Entity:** Establish `public.implant_product_skus` in Supabase PostgreSQL 15+ with strict typing, domain constraints, and foreign key relations.
- **Product Family Grouping:** Establish `public.implant_product_families` to support high-level brand constructs, surgeon preference sets, and vendor volume tracking.
- **Multi-Distributor Cross-Reference:** Establish `public.implant_sku_distributor_mappings` to map distributor item codes to OEM catalog items cleanly.
- **Deterministic Identifier Validation:** Enforce GS1 GTIN-14 and HIBCC UDI-DI format checking and manufacturer catalog uniqueness per vendor.
- **Status Lifecycle Engine:** Support `draft`, `pending_verification`, `active`, `inactive`, `discontinued`, and `recalled`.
- **Recall Management Protocol:** Implement dedicated recall status tracking, recall alert generation, and patient exposure traceability without data destruction.
- **Security & RLS:** Enforce least-privilege RBAC (`implants.view_catalog`, `implants.manage_catalog`) and tenant isolation.

### 2.2 Boundary Matrix: In-Scope vs. Out-of-Scope

| Domain | In-Scope (Phase 54: Product SKU Model) | Out-of-Scope (Owned by Downstream Modules) |
| :--- | :--- | :--- |
| **Catalog Specification** | Catalog number, product name, brand family, description, component link, OEM vendor attribution. | Individual surgeon preference card construct templates (Phase 58). |
| **Identifier Disambiguation**| OEM Catalog # vs. Internal SKU vs. Distributor Item # vs. UDI-DI vs. HCPCS C-Code. | Dynamic Lot Number and Serial Number logging for a specific patient (Phase 59). |
| **Physical / Regulatory Attributes** | Sterile packaged, laterality, material, MRI safety, latex-free, default duration. | Operative waste classification (contaminated, dropped, defective) (Phase 59). |
| **Distributor Sourcing** | Cross-referencing distributor item numbers to OEM SKUs via junction mapping. | General Ledger purchase orders, EDI 850 transmission, accounts payable (Phase 60+). |
| **Pricing Baseline** | Manufacturer Suggested Retail Price / List Price baseline (`list_price`). | Negotiated contracted unit costs, facility fee schedules, volume rebate tiers (Phases 56 & 57). |
| **Procedural Alignment** | Associating clinical component role (`component_id`) and HCPCS C-Code (`hcpcs_c_code`). | Authoritative CPT-to-component clinical indication rules (Phase 52). |

---

## 3. Current State Audit & System Inventory

A comprehensive, read-only audit of the repository (`e:\medicalAI\asc-prototype`) and database migrations (`001` through `028`) was conducted.

### 3.1 Systematic Component Classification

| Component / Artifact | File / Schema Evidence | Classification | Current Reality & Technical Evidence | Identified Gaps & Production Remediation |
| :--- | :--- | :--- | :--- | :--- |
| **`public.case_devices`** | `supabase/migrations/023_charge_completeness_engine.sql:23-40`<br>`supabase/migrations/025_implant_intelligence_core_and_rbac.sql:127-158` | **KEEP & INTEGRATE** | Operational table storing intra-operative implant consumption. Contains free-text `device_name`, `manufacturer`, `model_number`, plus placeholder column `sku_id UUID` added in Migration 025. | **Unconstrained Foreign Key.** `sku_id` exists in `case_devices` but has no foreign key constraint because `implant_product_skus` did not exist. Phase 54 provides the authoritative target table for `sku_id`. |
| **`public.implant_vendors`** | `supabase/migrations/028_implant_vendor_master.sql:41-133` | **KEEP & INTEGRATE** | Master directory of medical device manufacturers and distributors created in Phase 53. Contains 15 global baseline vendors. | **Authoritative Upstream OEM.** `implant_product_skus.vendor_id` must reference `implant_vendors(id)` where `vendor_type IN ('MANUFACTURER', 'TISSUE_BANK')`. |
| **`public.implant_vendor_relationships`** | `supabase/migrations/028_implant_vendor_master.sql:154-187` | **KEEP & INTEGRATE** | Commercial junction linking distributors to manufacturers created in Phase 53. | **Distributor Foundation.** `implant_sku_distributor_mappings` will link distributor item numbers to authorized distributors validated by this table. |
| **`public.implant_components`** | `supabase/migrations/026_implant_category_and_component_model.sql:156-190` | **KEEP & INTEGRATE** | Master clinical component taxonomy (e.g., `HIP_STEM`, `SPINE_CAGE`) created in Phase 51. | **Clinical Role Foundation.** Every product SKU must link to an `implant_components(id)` to inherit clinical duration and tracking rules. |
| **`public.implant_categories`** | `supabase/migrations/026_implant_category_and_component_model.sql:37-63` | **KEEP & INTEGRATE** | Master anatomy/specialty taxonomy created in Phase 51. | **Taxonomy Hierarchy.** SKUs inherit specialty and anatomical region through `implant_components.category_id`. |
| **`public.cpt_implant_mappings`** | `supabase/migrations/027_cpt_to_implant_mapping.sql:29-79` | **KEEP & INTEGRATE** | Clinical bridge linking CPT codes to generic components created in Phase 52. | **Procedural Validation.** When logging a case device or authoring a preference card, SKU selection is filtered to components valid for the case CPT. |
| **`public.implant_product_skus`** | None in database or migrations.<br>Referenced only in `docs/phases/50_IMPLANT_INTELLIGENCE_OVERVIEW.md:229-254`. | **MISSING** | Conceptual draft table outlined in Phase 50 documentation; zero SQL tables, indexes, or RLS policies deployed in database. | **Core Deliverable of Phase 54.** Must specify normalized master table supporting global baselines, tenant extensions, strict uniqueness, and UDI validation. |
| **`public.implant_product_families`**| None in database or migrations. | **MISSING** | No grouping mechanism exists for product families (e.g., "Triathlon Knee System", "Polaris Spinal System"). | **Core Deliverable of Phase 54.** Must establish normalized product family table to prevent redundant brand entry across thousands of sizes. |
| **`public.implant_sku_distributor_mappings`** | None in database or migrations. | **MISSING** | No table exists to map distributor-specific item numbers to manufacturer SKUs. | **Core Deliverable of Phase 54.** Must establish cross-reference junction table to support multi-distributor procurement without entity duplication. |
| **RBAC Permissions Catalog** | `src/lib/rbacService.js:82-94`<br>`supabase/migrations/025_implant_intelligence_core_and_rbac.sql:27-45` | **KEEP & ENFORCE** | Authoritative permissions `implants.view_catalog` and `implants.manage_catalog` exist and are assigned to clinical and financial roles. | **Ready for Consumption.** Phase 54 UI and service layers will enforce `implants.view_catalog` for reading and `implants.manage_catalog` for authoring and catalog editing. |
| **SKU Service Layer** | None in `src/lib/`. | **MISSING** | Zero client-side or backend services exist to query, search, import, or validate medical device product SKUs. | **Core Deliverable of Phase 54.** Must specify comprehensive service contracts and server-side RPC methods. |
| **SKU Catalog UI** | None in `src/components/`. | **MISSING** | Zero UI components exist for exploring, searching, filtering, or managing itemized medical device SKUs. | **Core Deliverable of Phase 54.** Must specify complete screen layout, filters, drill-down modals, and distributor mapping workflows. |

---

## 4. Rigorous Identifier Disambiguation

Medical device inventory failure in healthcare systems stems almost entirely from treating distinct physical, logistics, billing, and production identifiers as interchangeable. Phase 54 establishes deterministic definitions and boundary rules for all device identifiers.

```
+-------------------------------------------------------------------------------------------------------------------------------------------+
|                                                  MEDICAL DEVICE IDENTIFIER TAXONOMY                                                       |
+-------------------------------------------------------------------------------------------------------------------------------------------+
|                                                                                                                                           |
|  1. OEM MANUFACTURER CATALOG NUMBER (`catalog_number`)                                                                                    |
|     - Definition: Master engineering part number assigned by the device manufacturer (OEM).                                              |
|     - Stability: Permanent; printed on primary sterile packaging and manufacturer product catalogs.                                      |
|     - Example: Stryker Triathlon CoCr Femoral Component Size 4 Left: `5520-F-401`                                                        |
|     - Scope: Uniquely identifies the physical implant design when combined with `vendor_id`.                                                |
|                                                                                                                                           |
|  2. FDA UNIQUE DEVICE IDENTIFIER - DEVICE IDENTIFIER (`udi_di`)                                                                           |
|     - Definition: Mandatory static identifier registered in the FDA GUDID database (21 CFR § 801.20).                                     |
|     - Standards: GS1 GTIN-14 (14 digits) or HIBCC Primary DI (alphanumeric + check char).                                                 |
|     - Example: `00888888123456` (GS1 GTIN-14) or `+H12345678901` (HIBCC)                                                                 |
|     - Role: Regulatory traceability, automated barcode parsing, and national adverse event / recall tracking.                             |
|                                                                                                                                           |
|  3. COMMERCIAL DISTRIBUTOR ITEM NUMBER (`distributor_item_number`)                                                                        |
|     - Definition: Ordering SKU assigned by third-party logistics distributors (Cardinal Health, Medline, Owens & Minor).                   |
|     - Stability: Variable per distributor catalog; changes upon vendor renegotiation or logistics contract updates.                      |
|     - Example: Cardinal Health item `#CH-9411-401` for Stryker catalog `#5520-F-401`.                                                     |
|     - Cardinality: Many distributor item numbers can resolve to ONE manufacturer catalog number.                                          |
|                                                                                                                                           |
|  4. CMS HCPCS DEVICE PASS-THROUGH / C-CODE (`hcpcs_c_code`)                                                                               |
|     - Definition: 5-character alphanumeric billing code established by CMS for ASC implant pass-through payment (UB-04 Form Locators).    |
|     - Example: `C1776` (Joint device (implantable)), `C1713` (Anchor/screw for opposing bone-to-bone), `L8699` (Prosthetic implant NOS).   |
|     - Role: Institutional billing, clearinghouse claim scrubbing (Phase 47), and revenue cycle management.                               |
|                                                                                                                                           |
|  5. INTERNAL ASC INVENTORY SKU (`internal_sku`)                                                                                           |
|     - Definition: Facility-assigned enterprise resource planning (ERP) or materials management stock code.                               |
|     - Example: `SKU-KNEE-FEM-04L`                                                                                                        |
|     - Role: Local bin tracking, internal replenishment triggers, and general ledger accounting.                                           |
|                                                                                                                                           |
|  ================================== VARIABLES AT POINT OF USE (INTRA-OPERATIVE CASE USAGE - PHASE 59) ================================== |
|                                                                                                                                           |
|  6. LOT / BATCH NUMBER (`lot_number` - NOT in Product SKU Master)                                                                         |
|     - Definition: Manufacturing production run identifier. Shared across thousands of identical physical units in the same batch.         |
|     - Tracked exclusively at: `public.case_devices.lot_number` during actual surgical consumption.                                        |
|                                                                                                                                           |
|  7. SERIAL NUMBER (`serial_number` - NOT in Product SKU Master)                                                                           |
|     - Definition: Globally unique instance identifier for an individual physical implant unit.                                            |
|     - Tracked exclusively at: `public.case_devices.serial_number`. Exactly ONE serial number per implanted patient.                      |
|                                                                                                                                           |
|  8. UDI PRODUCTION IDENTIFIER (`udi_pi` - NOT in Product SKU Master)                                                                      |
|     - Definition: Dynamic portion of barcode encoding Lot (AI 10), Serial (AI 21), Expiration Date (AI 17), and Mfg Date (AI 11).         |
+-------------------------------------------------------------------------------------------------------------------------------------------+
```

---

## 5. Target State Architecture & Relational Model

The Phase 54 architecture introduces a normalized 3-table structure that cleanly models product families, catalog SKUs, and multi-distributor sourcing channels without data duplication.

```
                                      +-------------------------------------------------------+
                                      |              `public.implant_vendors`                 |
                                      |       (Phase 53: Manufacturer / Tissue Bank)          |
                                      +---------------------------+---------------------------+
                                                                  |
                                                                  | 1 : N
                                                                  v
+-----------------------------------+             +-------------------------------------------+
|    `public.implant_categories`    |             |    `public.implant_product_families`      |
|             (Phase 51)            |             |                                           |
+-----------------+-----------------+             | - id (UUID PK)                            |
                  |                               | - vendor_id (FK -> implant_vendors)       |
                  | 1 : N                         | - family_code ('TRIATHLON_KNEE')          |
                  v                               | - name ('Triathlon Total Knee System')    |
+-----------------------------------+             | - specialty ('Orthopedics')               |
|    `public.implant_components`    |             | - description (TEXT)                      |
|             (Phase 51)            |             | - is_active (BOOLEAN)                     |
+-----------------+-----------------+             +---------------------+---------------------+
                  |                                                     |
                  | 1 : N                                               | 1 : N
                  +-----------------------+   +-------------------------+
                                          |   |
                                          v   v
                          +-------------------------------------------------------+
                          |             `public.implant_product_skus`             |
                          |                                                       |
                          | - id (UUID PK)                                        |
                          | - vendor_id (FK -> implant_vendors: Manufacturer)     |
                          | - family_id (FK -> implant_product_families, Optional)|
                          | - component_id (FK -> implant_components: Role)       |
                          | - facility_id (FK -> facilities, NULL = Global)       |
                          | - catalog_number ('5520-F-401')                       |
                          | - product_name ('Triathlon CoCr Femoral #4 Left')     |
                          | - udi_di ('00888888123456')                           |
                          | - hcpcs_c_code ('C1776')                              |
                          | - sterile_packaging ('STERILE_PACKAGED')              |
                          | - laterality ('LEFT')                                 |
                          | - material_composition ('COBALT_CHROME')              |
                          | - duration_classification ('PERMANENT')               |
                          | - mri_safety_status ('MR_CONDITIONAL')                |
                          | - list_price (NUMERIC(12,2))                          |
                          | - status ('active' | 'inactive' | 'recalled')         |
                          +---------------------------+---------------------------+
                                                      |
                                                      | 1 : N
                                                      v
                          +-------------------------------------------------------+
                          |       `public.implant_sku_distributor_mappings`       |
                          |                                                       |
                          | - id (UUID PK)                                        |
                          | - sku_id (FK -> implant_product_skus)                 |
                          | - distributor_id (FK -> implant_vendors: Distributor) |
                          | - distributor_item_number ('CH-9411-401')             |
                          | - package_unit ('BOX_1')                              |
                          | - is_preferred (BOOLEAN)                              |
                          | - status ('active' | 'deprecated')                    |
                          +-------------------------------------------------------+
                                                      |
                                                      | Downstream References
                                                      v
                          +-------------------------------------------------------+
                          |   DOWNSTREAM PLATFORM INTEGRATIONS:                   |
                          |   - Phase 56: `facility_vendor_contracts`             |
                          |   - Phase 57: `facility_implant_pricing`              |
                          |   - Phase 58: `surgeon_preference_cards`              |
                          |   - Phase 59: `case_devices` (Intra-operative usage)  |
                          |   - Phase 5A: `implant_cost_hierarchy`                |
                          |   - Phase 5B: `implant_variance_and_savings_engine`   |
                          +-------------------------------------------------------+
```

---

## 6. Proposed Schema & Data Model Specifications

### 6.1 Table 1: `public.implant_product_families`

Groups related surgical implants under overarching engineering lines and brand constructs.

```sql
CREATE TABLE IF NOT EXISTS public.implant_product_families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE, -- NULL = Global Baseline, Set = Facility Custom
    vendor_id UUID NOT NULL REFERENCES public.implant_vendors(id) ON DELETE RESTRICT,
    family_code VARCHAR(50) NOT NULL, -- e.g., 'TRIATHLON_KNEE', 'POLARIS_SPINE', 'ACRYSOF_IQ'
    name VARCHAR(150) NOT NULL, -- e.g., 'Triathlon Total Knee System'
    specialty VARCHAR(50) NOT NULL, -- e.g., 'Orthopedics', 'Spine', 'Ophthalmology'
    description TEXT,
    fda_clearance_pma_number VARCHAR(50), -- 510(k) or PMA reference (e.g., 'K123456', 'P980012')
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Invariant: Unique family code per vendor and facility scope
    CONSTRAINT uq_product_family_code UNIQUE NULLS NOT DISTINCT (vendor_id, facility_id, family_code),
    CONSTRAINT chk_family_code_format CHECK (family_code ~ '^[A-Z0-9_\-]+$')
);

CREATE INDEX IF NOT EXISTS idx_ipf_vendor ON public.implant_product_families(vendor_id);
CREATE INDEX IF NOT EXISTS idx_ipf_specialty ON public.implant_product_families(specialty);
CREATE INDEX IF NOT EXISTS idx_ipf_active ON public.implant_product_families(is_active) WHERE is_active = TRUE;
```

### 6.2 Table 2: `public.implant_product_skus`

The primary catalog table representing distinct physical implant items.

```sql
CREATE TABLE IF NOT EXISTS public.implant_product_skus (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE, -- NULL = Global Master, Set = Facility Custom
    vendor_id UUID NOT NULL REFERENCES public.implant_vendors(id) ON DELETE RESTRICT,
    family_id UUID REFERENCES public.implant_product_families(id) ON DELETE RESTRICT,
    component_id UUID NOT NULL REFERENCES public.implant_components(id) ON DELETE RESTRICT,
    
    -- Identification Numbers
    catalog_number VARCHAR(100) NOT NULL, -- Manufacturer Catalog Number (e.g., '5520-F-401')
    product_name VARCHAR(255) NOT NULL, -- e.g., 'Triathlon CoCr Femoral Component Size 4 Left'
    internal_sku VARCHAR(100), -- ASC Materials Management / ERP SKU
    description TEXT,
    
    -- Regulatory & Coding Attributes
    udi_di VARCHAR(100), -- FDA UDI Device Identifier (GS1 GTIN-14 or HIBCC)
    fda_gudid_listing_id VARCHAR(100), -- GUDID record identifier
    hcpcs_c_code VARCHAR(10), -- CMS Primary Pass-Through Code (e.g., 'C1776', 'C1713')
    secondary_hcpcs_code VARCHAR(10), -- Alternative L-code or HCPCS (e.g., 'L8699')
    
    -- Clinical & Physical Specifications
    sterile_packaging VARCHAR(30) NOT NULL DEFAULT 'STERILE_PACKAGED'
        CHECK (sterile_packaging IN ('STERILE_PACKAGED', 'NON_STERILE_TRAY_REUSABLE', 'LOOSE_STERILIZED')),
    laterality VARCHAR(20) NOT NULL DEFAULT 'NOT_APPLICABLE'
        CHECK (laterality IN ('LEFT', 'RIGHT', 'BILATERAL', 'NOT_APPLICABLE')),
    material_composition VARCHAR(50) NOT NULL DEFAULT 'TITANIUM'
        CHECK (material_composition IN (
            'TITANIUM', 'TITANIUM_ALLOY', 'COBALT_CHROME', 'STAINLESS_STEEL',
            'CERAMIC', 'PEEK', 'UHMWPE', 'HYDROPHILIC_ACRYLIC', 'HYDROPHOBIC_ACRYLIC',
            'SILICONE', 'BIOLOGIC_ALLOGRAFT', 'TISSUE_COLLAGEN', 'RESORBABLE_POLYMER', 'OTHER'
        )),
    size_dimension VARCHAR(100), -- e.g., 'Size 4', '5.5mm x 40mm', '12mm x 14mm 4-deg'
    duration_classification VARCHAR(30) NOT NULL DEFAULT 'PERMANENT'
        CHECK (duration_classification IN ('PERMANENT', 'TEMPORARY', 'EXCHANGEABLE', 'ABSORBABLE', 'REMOVABLE')),
    mri_safety_status VARCHAR(50) NOT NULL DEFAULT 'MR_CONDITIONAL'
        CHECK (mri_safety_status IN ('MR_SAFE', 'MR_CONDITIONAL', 'MR_UNSAFE', 'NOT_EVALUATED')),
    latex_free BOOLEAN NOT NULL DEFAULT TRUE,
    biological_tissue BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Tracking Requirements (Inherited or overridden from component)
    requires_lot_tracking BOOLEAN NOT NULL DEFAULT TRUE,
    requires_serial_tracking BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Financial Baseline
    list_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (list_price >= 0.00),
    unit_of_measure VARCHAR(20) NOT NULL DEFAULT 'EA' CHECK (unit_of_measure IN ('EA', 'KIT', 'BOX', 'SET', 'PAIR')),
    
    -- Lifecycle Governance
    status VARCHAR(30) NOT NULL DEFAULT 'active'
        CHECK (status IN ('draft', 'pending_verification', 'active', 'inactive', 'discontinued', 'recalled')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Recall Governance
    recall_class VARCHAR(20) DEFAULT NULL CHECK (recall_class IN (NULL, 'CLASS_I', 'CLASS_II', 'CLASS_III')),
    recall_date DATE DEFAULT NULL,
    recall_reason TEXT DEFAULT NULL,
    
    -- Provenance & Metadata
    source_system VARCHAR(50) NOT NULL DEFAULT 'manual_entry'
        CHECK (source_system IN ('fda_gudid', 'manufacturer_catalog', 'ghx_edi', 'manual_entry', 'legacy_import')),
    verification_status VARCHAR(30) NOT NULL DEFAULT 'verified'
        CHECK (verification_status IN ('draft', 'pending_review', 'verified', 'disputed')),
    import_batch_id UUID DEFAULT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Invariants
    CONSTRAINT uq_sku_vendor_catalog UNIQUE NULLS NOT DISTINCT (vendor_id, facility_id, (UPPER(TRIM(catalog_number)))),
    CONSTRAINT chk_catalog_number_not_empty CHECK (TRIM(catalog_number) != ''),
    CONSTRAINT chk_product_name_not_empty CHECK (TRIM(product_name) != ''),
    CONSTRAINT chk_active_sync CHECK (is_active = (status = 'active')),
    CONSTRAINT chk_recall_metadata CHECK (
        (status = 'recalled' AND recall_class IS NOT NULL AND recall_date IS NOT NULL) OR
        (status != 'recalled' AND recall_class IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_ips_vendor ON public.implant_product_skus(vendor_id);
CREATE INDEX IF NOT EXISTS idx_ips_component ON public.implant_product_skus(component_id);
CREATE INDEX IF NOT EXISTS idx_ips_family ON public.implant_product_skus(family_id);
CREATE INDEX IF NOT EXISTS idx_ips_facility ON public.implant_product_skus(facility_id);
CREATE INDEX IF NOT EXISTS idx_ips_catalog ON public.implant_product_skus(catalog_number);
CREATE INDEX IF NOT EXISTS idx_ips_udi ON public.implant_product_skus(udi_di);
CREATE INDEX IF NOT EXISTS idx_ips_hcpcs ON public.implant_product_skus(hcpcs_c_code);
CREATE INDEX IF NOT EXISTS idx_ips_status ON public.implant_product_skus(status);
CREATE INDEX IF NOT EXISTS idx_ips_active ON public.implant_product_skus(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_ips_name_trgm ON public.implant_product_skus USING gin (LOWER(product_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_ips_catalog_trgm ON public.implant_product_skus USING gin (LOWER(catalog_number) gin_trgm_ops);
```

### 6.3 Table 3: `public.implant_sku_distributor_mappings`

Cross-references third-party logistics distributor item numbers to OEM manufacturer SKUs without duplicating the physical catalog entity.

```sql
CREATE TABLE IF NOT EXISTS public.implant_sku_distributor_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE, -- NULL = Global Mapping, Set = Facility Contract
    sku_id UUID NOT NULL REFERENCES public.implant_product_skus(id) ON DELETE RESTRICT,
    distributor_id UUID NOT NULL REFERENCES public.implant_vendors(id) ON DELETE RESTRICT,
    distributor_item_number VARCHAR(100) NOT NULL, -- Distributor's order part number (e.g. 'CH-9411-401')
    package_unit VARCHAR(30) NOT NULL DEFAULT 'EA' CHECK (package_unit IN ('EA', 'BOX_1', 'BOX_5', 'BOX_10', 'CASE')),
    units_per_package INTEGER NOT NULL DEFAULT 1 CHECK (units_per_package >= 1),
    is_preferred_distributor BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'deprecated')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Invariants:
    -- 1. Unique distributor item number per distributor and facility scope
    CONSTRAINT uq_distributor_sku_mapping UNIQUE NULLS NOT DISTINCT (distributor_id, facility_id, (UPPER(TRIM(distributor_item_number)))),
    -- 2. Prevent vendor self-mapping (distributor cannot be the OEM manufacturer)
    CONSTRAINT chk_distributor_not_empty CHECK (TRIM(distributor_item_number) != '')
);

CREATE INDEX IF NOT EXISTS idx_isdm_sku ON public.implant_sku_distributor_mappings(sku_id);
CREATE INDEX IF NOT EXISTS idx_isdm_distributor ON public.implant_sku_distributor_mappings(distributor_id);
CREATE INDEX IF NOT EXISTS idx_isdm_item_no ON public.implant_sku_distributor_mappings(distributor_item_number);
```

---

## 7. Business Rules & Deterministic Logic

### 7.1 Vendor Sourcing Validation Rule
An `implant_product_skus` record can only be associated with an `implant_vendors` record whose `vendor_type` is either `'MANUFACTURER'` or `'TISSUE_BANK'`. A commercial distributor (`'DISTRIBUTOR'`) cannot be the primary OEM manufacturer of a product SKU. Distributors are associated exclusively via `implant_sku_distributor_mappings`.

### 7.2 Component Duration Defaulting Rule
When an implant product SKU is linked to an `implant_components` record, its `duration_classification` defaults to `implant_components.default_duration`. If a manufacturer manufactures a resorbable version of a normally permanent structural screw (e.g., PLLA bioabsorbable interference screw), the SKU classification can be set to `'ABSORBABLE'`, but requires auditable rationale if it diverges from the component default.

### 7.3 UDI-DI Modulo-10 Checksum Validation
For product SKUs encoded with a GS1 GTIN-14 UDI-DI (14 numeric digits), the checksum digit (position 14) must strictly satisfy the GS1 Modulo-10 calculation:

$$\sum_{i=1}^{13} \Big(d_i \times (3 \text{ if } i \text{ is odd else } 1)\Big) + d_{14} \equiv 0 \pmod{10}$$

SKUs with invalid GTIN checksums cannot be set to `status = 'active'` if source is `'fda_gudid'`.

### 7.4 Multi-Distributor Sourcing Invariant
When an ASC orders an implant from Cardinal Health using item `#CH-9411-401` or from Medline using `#MDL-88310`, both item numbers resolve via `implant_sku_distributor_mappings` to the identical underlying `sku_id` (`5520-F-401`). This guarantees that:
- Clinical outcome tracking in Phase 59 groups hardware correctly.
- Surgeon preference cards in Phase 58 specify the clinical product without locking the facility to a single distributor.
- Price variance engines in Phase 5B can compare Cardinal vs. Medline unit costs for the exact same physical device.

### 7.5 Strict Deletion Prevention
Hard deletion of an implant product SKU is strictly prohibited if the SKU is referenced in any of:
- `public.facility_vendor_contracts` (Phase 56)
- `public.facility_implant_pricing` (Phase 57)
- `public.surgeon_preference_card_items` (Phase 58)
- `public.case_devices` (Phase 59)

If deletion is attempted on a referenced SKU, the PostgreSQL foreign key trigger raises error `23503` (`foreign_key_violation`), enforcing soft-deactivation (`status = 'inactive'` or `'discontinued'`).

### 7.6 Recall Protocol & Safety Quarantine Rule
When a product SKU's status is changed to `'recalled'`:
1. `recall_class` (`CLASS_I`, `CLASS_II`, or `CLASS_III`) and `recall_date` become mandatory.
2. The SKU is immediately locked against addition to new surgical cases (`case_devices`) or preference cards (`surgeon_preference_cards`).
3. An automated security event is logged in `public.audit_logs`.
4. Downstream clinical analytics automatically flags every historical case in `public.case_devices` containing that `sku_id` for medical director safety review.

---

## 8. Permissions & Security Matrix

### 8.1 Role-Based Access Control (RBAC)

Enforced via `src/lib/rbacService.js` and database table `public.permissions`:

| Action | Required Permission | Allowed Roles | Prohibited Roles |
| :--- | :--- | :--- | :--- |
| **Browse / Search SKU Catalog** | `implants.view_catalog` | `super_admin`, `org_admin`, `facility_admin`, `cfo`, `clinical_director`, `clinical_manager`, `biller`, `surgeon`, `materials_manager` | Read-only auditors without implant scope |
| **View Catalog List Prices** | `implants.view_costs` | `super_admin`, `org_admin`, `facility_admin`, `cfo`, `clinical_director`, `biller` | General staff, schedulers |
| **Create / Edit Product SKUs** | `implants.manage_catalog` | `super_admin`, `org_admin`, `facility_admin`, `cfo`, `clinical_director` | Billers, surgeons, schedulers |
| **Initiate Medical Device Recall** | `implants.manage_catalog` | `super_admin`, `org_admin`, `facility_admin`, `clinical_director` | Billers, materials coordinators |
| **Create Distributor Mappings** | `implants.manage_catalog` | `super_admin`, `org_admin`, `facility_admin`, `materials_manager` | Schedulers, surgeons |
| **Hard Delete Unused Draft SKU** | `implants.manage_catalog` | `super_admin` only | All other roles |

### 8.2 Row-Level Security (RLS) Policies

```sql
ALTER TABLE public.implant_product_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.implant_product_skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.implant_sku_distributor_mappings ENABLE ROW LEVEL SECURITY;

-- 1. Product SKUs SELECT: Global records visible to all; Facility records isolated to tenant
CREATE POLICY "implant_product_skus_select_policy" ON public.implant_product_skus
    FOR SELECT TO authenticated, anon
    USING (
        facility_id IS NULL OR
        facility_id IN (SELECT public.get_auth_user_facilities()) OR
        auth.uid() IS NULL
    );

-- 2. Product SKUs MODIFY: Restrict to authorized administrators
CREATE POLICY "implant_product_skus_modify_policy" ON public.implant_product_skus
    FOR ALL TO authenticated, anon
    USING (
        auth.uid() IS NULL OR
        (facility_id IS NULL AND public.user_has_facility_role(NULL, ARRAY['super_admin'])) OR
        (
            facility_id IS NOT NULL AND
            facility_id IN (SELECT public.get_auth_user_facilities()) AND
            public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_director'])
        )
    );
```

---

## 9. API / Client Service Layer Specifications

Client service module: `src/lib/skuService.js`

### 9.1 Service Method Contracts

```javascript
/**
 * Phase 54: Implant Product SKU Master Service Interface
 */
export const skuService = {
  /**
   * Retrieves paginated, filtered catalog SKUs.
   * @param {Object} options
   * @param {string} [options.search] - Query across catalog #, product name, UDI, or family
   * @param {string} [options.vendorId] - Filter by manufacturer OEM
   * @param {string} [options.componentId] - Filter by clinical component
   * @param {string} [options.specialty] - Filter by surgical specialty
   * @param {string} [options.status] - 'active', 'inactive', 'recalled'
   * @param {string} [options.laterality] - 'LEFT', 'RIGHT', 'BILATERAL', 'NOT_APPLICABLE'
   * @param {string} [options.facilityId] - Tenant scope
   * @param {number} [options.page=1]
   * @param {number} [options.limit=50]
   * @returns {Promise<{skus: Array, metrics: Object, pagination: Object}>}
   */
  async getSkus(options = {}) {},

  /**
   * Retrieves single SKU by ID with linked family and distributor mappings.
   * @param {string} skuId
   * @returns {Promise<Object>}
   */
  async getSkuById(skuId) {},

  /**
   * Authoritative upsert of a product SKU.
   * @param {Object} skuData
   * @returns {Promise<{success: boolean, sku_id: string}>}
   */
  async saveSku(skuData) {},

  /**
   * Executes a medical device recall on a SKU.
   * @param {string} skuId
   * @param {Object} recallData { recallClass, recallDate, recallReason }
   * @returns {Promise<{success: boolean, impactedCasesCount: number}>}
   */
  async flagSkuRecall(skuId, recallData) {},

  /**
   * Saves a distributor item number mapping for a SKU.
   * @param {Object} mappingData
   * @returns {Promise<{success: boolean, mapping_id: string}>}
   */
  async saveDistributorMapping(mappingData) {},

  /**
   * Validates a UDI-DI against GS1 GTIN-14 and HIBCC rules.
   * @param {string} udiDi
   * @returns {{isValid: boolean, standard: 'GS1'|'HIBCC'|'UNKNOWN', error: string|null}}
   */
  validateUdiDi(udiDi) {}
};
```

---

## 10. UI & Workflow Specifications

### 10.1 UI Component Architecture

- **Component Path:** `src/components/ImplantProductSkuMaster.jsx`
- **Stylesheet:** `src/components/ImplantProductSkuMaster.css`
- **Navigation Placement:** `src/App.jsx` under `CLINICAL` navigation menu (`activeTab === 'implant_skus'`), nestled directly beneath *Vendor Master*.
- **Color Standards:** Strictly adheres to the **Purple Ban** (zero purple, violet, magenta, or fuchsia tokens). Uses clinical dark-mode palette:
  - Deep Surface: `#0f172a`
  - Card Background: `#1e293b`
  - Border Accents: `#334155`
  - Primary Clinical Action: `#2563eb` (Royal Blue)
  - Success / Active Badge: `#10b981` (Emerald)
  - Warning / Recall Badge: `#ef4444` (Crimson)
  - Neutral Metadata: `#94a3b8` (Slate Gray)

### 10.2 Core Screens & Interactions

```
+--------------------------------------------------------------------------------------------------------------------+
| IMPLANT PRODUCT SKU MASTER                                                 [ + Add Product SKU ] [ Import CSV ]    |
| Master directory of manufacturer catalog items, UDI-DI specifications, and distributor cross-references             |
+--------------------------------------------------------------------------------------------------------------------+
|  [ Total SKUs: 1,420 ]   [ Active OEMs: 12 ]   [ Recalled Items: 0 ]   [ Distributor Mappings: 2,180 ]             |
+--------------------------------------------------------------------------------------------------------------------+
| [ Q Search catalog #, product name, UDI-DI... ] [ All OEMs v ] [ All Components v ] [ All Statuses v ]             |
+--------------------------------------------------------------------------------------------------------------------+
| CATALOG #     PRODUCT NAME                 OEM VENDOR      COMPONENT      LATERALITY   UDI-DI           STATUS  ACT |
| ------------------------------------------------------------------------------------------------------------------ |
| 5520-F-401    Triathlon CoCr Femoral #4 L  Stryker Ortho   FEMORAL_STEM   LEFT         00888888123456   ACTIVE  ... |
| 5520-F-402    Triathlon CoCr Femoral #4 R  Stryker Ortho   FEMORAL_STEM   RIGHT        00888888123463   ACTIVE  ... |
| 0600-01-050   Polaris 5.5 Ti Rod 50mm      Zimmer Biomet   SPINE_ROD      N/A          00777777981240   ACTIVE  ... |
| 10-002010     AcrySof IQ Monofocal +20.0D  Alcon Surgical  IOL_MONOFOCAL  N/A          00666666112233   ACTIVE  ... |
+--------------------------------------------------------------------------------------------------------------------+
```

### 10.3 Modal Dialogs
1. **Add / Edit Product SKU Modal:** Form inputs for OEM Vendor, Brand Family, Component, Catalog #, Product Name, UDI-DI, HCPCS C-Code, Material, Laterality, Sterile Pack, and List Price.
2. **Distributor Cross-Reference Drawer:** Displays all authorized distributor item numbers (`Cardinal Health`, `Medline`, etc.) mapped to the selected SKU, with an inline form to add new mappings.
3. **Safety Recall Modal:** High-visibility crimson warning modal requiring `Recall Class` (I, II, III), `Official Recall Date`, and `Regulatory Narrative/Instructions`. Displays the immediate count of historically impacted ASC surgical cases.

---

## 11. Downstream Module Integration Blueprint

| Downstream Phase | Consumed Entity / Attribute | Clinical / Financial Impact |
| :--- | :--- | :--- |
| **Phase 55: Vendor-to-Component Mapping** | Validates that `implant_product_skus.vendor_id` is an authorized supplier of `component_id`. | Prevents catalog pollution where a vendor is assigned components they do not manufacture. |
| **Phase 56: Facility Vendor Contracts** | Contracts attach negotiated terms to specific `sku_id`s or product families. | Locks contracted pricing to verifiable catalog items. |
| **Phase 57: Facility Implant Pricing** | Establishes facility unit acquisition cost and chargemaster markup on `sku_id`. | Eliminates manual price lookup during case scheduling. |
| **Phase 58: Surgeon Preference Cards** | Surgeons select primary and secondary `sku_id`s for standard procedure constructs. | Guarantees required implants are ordered and sterilized prior to surgery date. |
| **Phase 59: Case Implant Usage** | Intra-operative nursing logs consumption by scanning `udi_di` or selecting `sku_id`. | Populates `case_devices.sku_id`, linking actual patient devices to master specifications. |
| **Phase 5A: Implant Cost Hierarchy** | Resolves actual case cost: Tier 1 Invoice vs. Tier 2 Contract vs. Tier 3 SKU List Price. | Automates multi-tiered cost reconciliation for accounts payable. |
| **Phase 5B: Variance & Savings Engine** | Compares surgeon SKU selection against contracted benchmark alternatives. | Uncovers constructive substitution savings (e.g., standardized screws). |
| **Phase 5D: Device Duration Classification**| Inherits `duration_classification` from `implant_product_skus`. | Governs billing eligibility and patient device registry reporting. |

---

## 12. Quality Assurance & Test Plan

A dedicated automated test suite (`tests/implant-product-sku-model.test.js`) must be authored during implementation to verify 100% compliance with this specification.

### 12.1 Test Suite Breakdown

1. **Suite 1: Database Migration DDL & Constraints Integrity**
   - Assert `implant_product_families`, `implant_product_skus`, and `implant_sku_distributor_mappings` tables exist.
   - Assert `uq_sku_vendor_catalog` unique constraint prevents duplicate catalog numbers under the same vendor.
   - Assert `chk_active_sync` and `chk_recall_metadata` enforce database-level state consistency.
   - Assert `ON DELETE RESTRICT` protects SKUs referenced by downstream foreign keys.

2. **Suite 2: Client Service Layer & Identifier Disambiguation**
   - Assert `validateUdiDi` correctly verifies GS1 GTIN-14 Modulo-10 checksums.
   - Assert `saveSku` rejects lowercase catalog numbers and missing clinical components.
   - Assert multi-distributor mappings correctly resolve to single OEM SKUs.

3. **Suite 3: Safety Recall Governance**
   - Assert `flagSkuRecall` transitions SKU status to `'recalled'`, sets `is_active = FALSE`, and stores recall metadata.
   - Assert recalled SKUs are rejected when queried for active case scheduling.

4. **Suite 4: UI & Maestro Guideline Compliance**
   - Assert zero banned purple/violet tokens exist in JSX or CSS.
   - Assert responsive table layout and tab wiring in `src/App.jsx`.

---

## 13. Acceptance Criteria & Definition of Done

- [ ] **Data Model & Schema:** `029_implant_product_sku_model.sql` and rollback `029_implant_product_sku_model_down.sql` are created and execute idempotently in Supabase PostgreSQL 15+.
- [ ] **Global Taxonomy Seeded:** Baseline catalog items for multinational OEMs (Stryker, Zimmer, Medtronic, Alcon, Arthrex) are seeded.
- [ ] **Multi-Distributor Cross-Reference:** Junction table maps distributor item numbers without duplicating OEM products.
- [ ] **Foreign Key Constraints:** `case_devices.sku_id` is formally constrained to `implant_product_skus(id)` with `ON DELETE RESTRICT`.
- [ ] **RBAC & RLS:** `implants.view_catalog` and `implants.manage_catalog` are enforced in PostgreSQL policies and client gates.
- [ ] **Automated Testing:** 100% of unit and integration tests pass via `node --test tests/implant-product-sku-model.test.js`.
- [ ] **Purple Ban Compliance:** Zero purple/violet hex codes or keywords exist in frontend artifacts.
- [ ] **Documentation Complete:** Phase 54 specification committed and cross-referenced with downstream modules.
