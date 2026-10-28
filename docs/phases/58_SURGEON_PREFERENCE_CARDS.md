# Phase 58 — Surgeon Preference Cards
## Production Specification: Clinical Preference Cards, Procedural Bills of Materials, Staging Governance, and Case Reconciliation

**Document Version:** 1.0.0  
**Phase ID:** Phase 58  
**Subsystem:** Clinical Operations & Implant Intelligence (Phase 05)  
**Author:** AI Architecture & Clinical Systems Engineering Team  
**Status:** Approved Specification (Audit & Architecture Only — No Code Mutations)  
**Design Standard:** Maestro Clinical Dark System / Strict Purple Ban  
**Next Migration Identifier:** `034_surgeon_preference_cards.sql`  

---

## 1. Executive Summary & Purpose

### 1.1 Purpose
The **Surgeon Preference Cards** subsystem establishes the authoritative, auditable clinical bill-of-materials (BOM) and operative staging requirements for surgical procedures performed within Ambulatory Surgery Centers (ASCs). It bridges the operational divide between clinical surgical technique, sterile processing, supply chain procurement, and post-operative financial reconciliation.

In high-velocity ASC environments, surgical case preparation currently suffers from fragmented paper "pick lists," tribal knowledge among scrub technicians, and ad-hoc whiteboard notations. These informal practices cause OR turnover delays, excessive waste from opened but unused implants, unexpected supply stockouts mid-procedure, and contentious post-case discrepancies between surgeon expectations and facility acquisition costs.

Phase 58 delivers a multi-dimensional, version-governed preference engine that deterministically maps:
$$\text{Scheduled Case} \longrightarrow \langle \text{Surgeon}, \text{Primary CPT}, \text{Secondary CPTs}, \text{Facility}, \text{Laterality} \rangle \longrightarrow \text{Authoritative Preference Revision}$$

### 1.2 Core Capabilities
1. **Multi-Specialty Item Classification:** Granular categorization covering **Implants** (linked to Phase 54 SKUs and Phase 51 Components), **Sterile Disposables/Packs**, **Instrumentation Trays/Loaners**, **Capital Equipment**, **Suture Sequences**, and **Topical Medications/Biologics**.
2. **Deterministic Staging Protocol (OPEN vs. HOLD):** Strict operational bifurcation between items that must be opened onto the sterile back table prior to patient entry (**OPEN**) versus contingency items that must be staged inside the OR core but remain sterile in outer packaging until explicitly requested by the attending surgeon (**HOLD**).
3. **Clinical Substitutions & Equivalency Engine:** Pre-authorized alternative SKUs and vendor components mapped to clinical preference tiers (Phase 55), enabling circulating nurses and materials managers to resolve supply stockouts without interrupting the operative sterile field.
4. **Surgeon & Facility Variance Exception Management:** Two-person separation-of-duties governance for clinical exceptions, document attachments, and surgeon-requested customizations off the facility standard formulary.
5. **Runtime Case Snapshotting & Pre-Op Readiness Gate:** Immutably snapshots the active approved preference card into the scheduled case upon scheduling freeze ($T-24\text{h}$), generating an auditable pick list and pre-incision readiness checklist.
6. **Post-Op Planned-vs-Actual Usage Reconciliation:** Line-by-line consumption reconciliation against Phase 23 `case_devices` and Phase 57 actual acquisition costs, categorizing variances into **Exact Match**, **Unused Returned**, **Contaminated Wasted**, **Substituted**, and **Unplanned Addition**.

### 1.3 Scope Boundaries & Non-Goals
- **Planning Data, Not Inventory Depletion:** Preference card items represent clinical intent and planned demand. They do not decrement perpetual warehouse inventory until post-operative case completion.
- **Planning Data, Not Billable Charges:** An item listed on a preference card must **never** automatically generate a patient billable charge, claim line, or supplier invoice payable. Only physical usage verified post-procedure through Phase 23 `case_devices` and Phase 57 cost allocations qualifies for billing workflows.
- **Specification-First Protocol:** This phase comprises architectural analysis, repository auditing, relational schema design, API contract definition, and QA verification planning. **No production code, database mutations, or seed data will be written in this task.**

---

## 2. Current State Audit & Repository Findings

A comprehensive audit was performed across the `asc-prototype` codebase, database migrations (001 through 033), client services, and UI components to assess existing assets and integration readiness.

### 2.1 Repository & Database Audit Matrix

| Component / File Path | Current Type & Schema | Audit Classification | Verified Evidence & Limitations |
|---|---|---|---|
| `public.surgeons`<br>`supabase/migrations/013_surgeon_model_and_affiliations.sql` | PostgreSQL Table | **KEEP** | Authoritative identity table containing `id` (BIGINT), `surgeon_uuid` (UUID), `npi`, `license_number`, `credentials`, `specialty`, and `is_active`. Fully compatible as the primary surgeon entity foreign key. |
| `public.surgeon_facility_affiliations`<br>`supabase/migrations/013_surgeon_model_and_affiliations.sql` | PostgreSQL Table | **KEEP** | Validates surgeon credentials and appointment status per facility. Essential for ensuring surgeons can only author or use preference cards at affiliated facilities. |
| `public.surgeon_privileges`<br>`supabase/migrations/013_surgeon_model_and_affiliations.sql` | PostgreSQL Table | **KEEP** | Authoritative CPT-to-surgeon procedural credentialing ledger. Validates whether an attending surgeon is credentialed to perform the CPT code linked to a preference card. |
| `public.surgeries`<br>`supabase/migrations/001_multi_tenancy_core.sql`<br>`supabase/migrations/009_case_master_normalization.sql` | PostgreSQL Table | **REFACTOR** | Stores core scheduled surgical cases. Contains `surgeon_id`, `facility_id`, `surgery_date`, and legacy CPT arrays. **Requires adding:** `preference_card_id UUID`, `preference_card_revision_id UUID`, and `preference_readiness_status VARCHAR(30)`. |
| `public.surgery_procedures`<br>`supabase/migrations/009_case_master_normalization.sql` | PostgreSQL Table | **KEEP** | Normalized 1:M procedural construct per surgery with `cpt_code`, `is_primary`, and `sequence_order`. Directly referenced during multi-CPT preference card resolution. |
| `public.case_devices`<br>`supabase/migrations/023_charge_completeness_engine.sql`<br>`supabase/migrations/025_implant_intelligence_core_and_rbac.sql` | PostgreSQL Table | **REFACTOR** | Records actual physical implant items used in surgery. Contains `usage_status` (`PLANNED`, `OPENED_ON_FIELD`, `IMPLANTED`, `CONTAMINATED_WASTED`). **Requires adding:** `preference_card_item_id UUID` and `preference_snapshot_id UUID` to link planned lines to actual usage. |
| `public.implant_components`<br>`supabase/migrations/026_implant_category_and_component_model.sql` | PostgreSQL Table | **KEEP** | Master clinical component dictionary (e.g. `KNEE_FEMORAL`, `IOL_MONOFOCAL`). Reused directly for generic preference card staging specifications. |
| `public.implant_product_skus`<br>`supabase/migrations/029_implant_product_sku_model.sql` | PostgreSQL Table | **KEEP** | Master catalog table for granular physical OEM items with UDI-DI, catalog numbers, and sterile packaging flags. Referenced when preference cards specify exact manufacturer catalog numbers. |
| `public.implant_vendor_component_mappings`<br>`supabase/migrations/030_implant_vendor_component_mapping.sql` | PostgreSQL Table | **KEEP** | OEM-to-component capability matrix with preference tiers (`PREFERRED`, `SECONDARY`, `RESTRICTED`). Directly informs clinical substitution rules. |
| `public.facility_vendor_contracts`<br>`supabase/migrations/031_facility_vendor_contracts.sql` | PostgreSQL Table | **KEEP** | Facility procurement contracts authorizing sourcing and commercial terms. Reused to alert when a preferred card item is off-contract. |
| `public.facility_implant_price_schedules`<br>`supabase/migrations/032_facility_implant_pricing.sql` | PostgreSQL Table | **KEEP** | Unit pricing schedules. Reused in post-operative cost variance reconciliation. |
| `src/components/SurgeonPortal.jsx` | React Component | **REFACTOR** | Attending surgeon portal. Contains comment stub `// 'cases' | 'blocks' | 'performance' | 'preference' | 'profile'`. The `'preference'` tab is currently completely unrendered and needs implementation. |
| `src/components/SurgeonManagement.jsx` | React Component | **REFACTOR** | Master directory for surgeon profiles. Currently lacks preference card counts, quick links to surgeon cards, and card assignment badges. |
| `public.preference_cards`<br>`public.preference_card_revisions`<br>`public.preference_card_items` | Database Entities | **MISSING** | **Zero preference card tables exist in the database.** No schema, triggers, RLS, or service layer currently exists for clinical preference cards. |
| `src/lib/preferenceCardService.js` | Service Layer | **MISSING** | Client/backend service layer for preference card authoring, revision publishing, and case reconciliation does not exist. |

---

## 3. Production Behavior & Target Functional Requirements

### 3.1 Preference Card Identity & Scope
A Surgeon Preference Card represents an operational agreement between an Attending Surgeon and the ASC Operative Services team for a specific procedural construct.

```
                    ┌────────────────────────────────────────┐
                    │    Surgeon Preference Card (Header)    │
                    │  Surgeon + Primary CPT + Facility/Org   │
                    └───────────────────┬────────────────────┘
                                        │ 1:N
                    ┌───────────────────▼────────────────────┐
                    │  Card Revisions (Versioned & Audited)   │
                    │      Rev #1 (Superseded)                │
                    │      Rev #2 (ACTIVE - Effective Date)   │
                    │      Rev #3 (Draft / In Review)         │
                    └───────────────────┬────────────────────┘
                                        │ 1:N
         ┌──────────────────────────────┼──────────────────────────────┐
         │                              │                              │
┌────────▼──────────────┐   ┌───────────▼───────────┐   ┌──────────────▼─────────────┐
│ Preference Card Items │   │ Approved Substitutions│   │ Procedure CPT Associations │
│ (Implants, Packs,     │   │ (OEM Equivalents,     │   │ (Primary & Co-Billed CPTs) │
│  Trays, Equipment)    │   │  Phase 55 Alignments) │   │                            │
└───────────────────────┘   └───────────────────────┘   └────────────────────────────┘
```

1. **Card Scoping Tiers:**
   - **Surgeon-Specific Facility Card (Standard):** Assigned to a specific surgeon at a specific facility for a primary CPT code.
   - **Surgeon-Specific Enterprise Card (Global Template):** Defined for a surgeon across all network facilities, with facility-specific overrides for local inventory.
   - **Facility Specialty Master Card (House Card):** Default "house card" used when a new surgeon has not yet authored personal preferences or for emergency walk-in cases.
2. **Procedural Association:**
   - Each card is keyed to a **Primary CPT Code** (e.g. `27447` — Total Knee Arthroplasty).
   - A card can link multiple **Secondary / Co-Billed CPT Codes** (e.g. `27487` revision, `20680` hardware removal) that frequently occur in conjunction.

### 3.2 Bill of Materials (BOM) Itemization
Every item on a preference card revision must be explicitly classified:
- **`IMPLANT`:** Physical devices permanently implanted into patient anatomy. Linked to Phase 51 `implant_components` and Phase 54 `implant_product_skus`.
- **`STERILE_DISPOSABLE`:** Single-use sterile drapes, gowns, suction tubing, blade cartridges, irrigation tubing, and specialty packs.
- **`INSTRUMENT_TRAY`:** Reusable sterile instrument sets (e.g. "Primary Knee Major Set", "Triathlon Prep Tray", "Drill Battery Set").
- **`CAPITAL_EQUIPMENT`:** Major OR room assets (e.g. "Mako Robotic Arm", "C-Arm Fluoroscope", "Arthroscope Tower", "Tourniquet System").
- **`SUTURE`:** Suture threads, needles, skin staplers, and mesh anchors.
- **`MEDICATION_BIOLOGIC`:** Topical antibiotics, bone wax, hemostatic matrix, local anesthetics, and irrigation additives.

### 3.3 Staging Behavior: OPEN vs. HOLD
A failure in supply staging directly causes operative waste or delays. Phase 58 enforces a deterministic staging attribute on every item:
- **`OPEN` (Field Staged):**
  - Item **must** be opened, aseptically passed to the sterile field, and counted prior to the surgical incision.
  - *Examples:* Main surgical drape pack, basic instrument set, suction tubing, primary incision scalpel.
- **`HOLD` (Core Staged):**
  - Item **must** be physically pulled from storage and verified in the OR core/sub-sterile room, but **must remain unopened** in sterile outer packaging until explicitly commanded by the surgeon.
  - *Examples:* Sizing trials, backup implants, specialty biologics, drain tubes, revision augments.
  - *Rule:* If a `HOLD` item is opened without verbal confirmation, the system logs an operational non-conformance.

### 3.4 Clinical Substitutions & Formulary Alignment
- Preference cards must specify pre-approved substitutions for high-risk or supply-chain-constrained items.
- If the preferred Stryker femoral component (`5520-F-401`) is stocked out:
  - **Tier 1 (Identical OEM Alternate):** Stryker Triathlon Universal alternate size.
  - **Tier 2 (Contracted Cross-OEM Equivalent):** Zimmer Biomet Persona Knee component (Phase 55 Preferred Mapping).
  - **Tier 3 (Clinical Director Emergency Approval):** Non-preferred vendor requiring real-time clinical authorization.

### 3.5 Runtime Case Snapshotting
- Preference cards are fluid templates undergoing continuous revisions.
- When an OR case is scheduled and locked (Case Scheduling Freeze), the system creates an immutable **Case Preference Snapshot**.
- Later edits to the preference card revision **never retroactively mutate** past cases or cases currently in progress.

### 3.6 Post-Operative Reconciliation (Planned vs. Actual)
Following case closure, the system runs a deterministic reconciliation comparing:
$$\text{Planned Case Preference Snapshot} \quad \longleftrightarrow \quad \text{Actual Intra-Operative Usage (Phase 23/25)}$$

Every variance is automatically classified:
1. **`EXACT_MATCH`:** Planned $N$ units $\to$ Implanted $N$ units.
2. **`HOLD_RETURNED`:** Staged on `HOLD` $\to$ Not requested $\to$ Safely returned to clean storage with zero financial loss.
3. **`CONTAMINATED_WASTE`:** Staged on `OPEN` or opened on field $\to$ Not implanted $\to$ Scrapped with cost logged to surgeon waste analytics.
4. **`APPROVED_SUBSTITUTION`:** Stocked out preferred item $\to$ Pre-approved alternative used.
5. **`UNPLANNED_ADDITION`:** Item not listed on preference card $\to$ Requested ad-hoc during surgery. Generates an automated prompt for the surgeon to update their card revision.

---

## 4. Target Data Model & Database Architecture

To achieve production durability, Phase 58 introduces a normalized, tenant-isolated relational schema consisting of **7 tables** in the `public` schema.

```
                              ┌─────────────────────────────────────────┐
                              │      surgeon_preference_cards           │
                              │ PK: id                                  │
                              │ FK: facility_id, surgeon_id, primary_cpt│
                              └────────────────────┬────────────────────┘
                                                   │ 1:N
                              ┌────────────────────▼────────────────────┐
                              │   surgeon_preference_card_revisions     │
                              │ PK: id                                  │
                              │ FK: card_id, approved_by, created_by    │
                              └─────────┬─────────────────────┬─────────┘
                                        │ 1:N                 │ 1:N
               ┌────────────────────────▼────────┐   ┌────────▼────────────────────────┐
               │     preference_card_items       │   │    preference_card_procedures   │
               │ PK: id                          │   │ PK: id                          │
               │ FK: revision_id, sku_id, comp_id│   │ FK: revision_id, cpt_code       │
               └────────────────┬────────────────┘   └─────────────────────────────────┘
                                │ 1:N
               ┌────────────────▼────────────────┐
               │  preference_card_substitutions  │
               │ PK: id                          │
               │ FK: card_item_id, alt_sku_id    │
               └─────────────────────────────────┘

                              ┌─────────────────────────────────────────┐
                              │       case_preference_snapshots         │
                              │ PK: id                                  │
                              │ FK: surgery_id, revision_id, locked_by  │
                              └────────────────────┬────────────────────┘
                                                   │ 1:N
                              ┌────────────────────▼────────────────────┐
                              │   case_preference_reconciliations       │
                              │ PK: id                                  │
                              │ FK: snapshot_id, case_device_id         │
                              └─────────────────────────────────────────┘
```

### 4.1 Schema DDL Specification

#### Table 1: `public.surgeon_preference_cards`
Header identity for a surgeon's procedural preferences.

```sql
CREATE TABLE IF NOT EXISTS public.surgeon_preference_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE, -- NULL = Enterprise Template
    surgeon_id BIGINT NOT NULL REFERENCES public.surgeons(id) ON DELETE RESTRICT,
    
    -- Procedural Keying
    card_code VARCHAR(50) NOT NULL,
    card_name VARCHAR(150) NOT NULL,
    specialty VARCHAR(50) NOT NULL,
    primary_cpt VARCHAR(10) NOT NULL,
    description TEXT,
    
    -- Operational Parameters
    estimated_duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (estimated_duration_minutes > 0),
    turnover_time_minutes INTEGER NOT NULL DEFAULT 25 CHECK (turnover_time_minutes >= 0),
    laterality_applicable BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Status & Lifecycle
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_house_card BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_card_code_format CHECK (card_code ~ '^[A-Z0-9_\-]+$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pref_card_code 
    ON public.surgeon_preference_cards (facility_id, UPPER(TRIM(card_code))) NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_spc_surgeon ON public.surgeon_preference_cards(surgeon_id);
CREATE INDEX IF NOT EXISTS idx_spc_cpt ON public.surgeon_preference_cards(primary_cpt);
CREATE INDEX IF NOT EXISTS idx_spc_facility ON public.surgeon_preference_cards(facility_id);
```

#### Table 2: `public.surgeon_preference_card_revisions`
Immutable versioned revisions ensuring historical reconstruction.

```sql
CREATE TABLE IF NOT EXISTS public.surgeon_preference_card_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID NOT NULL REFERENCES public.surgeon_preference_cards(id) ON DELETE CASCADE,
    facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE,
    
    -- Versioning Governance
    revision_number INTEGER NOT NULL DEFAULT 1 CHECK (revision_number >= 1),
    status VARCHAR(30) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'pending_approval', 'approved', 'active', 'superseded', 'retired')),
    
    -- Temporal Validity
    effective_from DATE NOT NULL,
    effective_to DATE,
    change_summary TEXT,
    
    -- Approval Provenance (Two-Person Separation of Duties)
    submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    submitted_at TIMESTAMPTZ,
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_card_revision UNIQUE (card_id, revision_number),
    CONSTRAINT chk_revision_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT chk_revision_approval CHECK (
        (status IN ('approved', 'active') AND approved_at IS NOT NULL) OR
        (status NOT IN ('approved', 'active'))
    )
);

CREATE INDEX IF NOT EXISTS idx_spcr_card_status ON public.surgeon_preference_card_revisions(card_id, status);
CREATE INDEX IF NOT EXISTS idx_spcr_dates ON public.surgeon_preference_card_revisions(effective_from, effective_to);
```

#### Table 3: `public.preference_card_procedures`
Secondary CPT codes covered under the card revision.

```sql
CREATE TABLE IF NOT EXISTS public.preference_card_procedures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    revision_id UUID NOT NULL REFERENCES public.surgeon_preference_card_revisions(id) ON DELETE CASCADE,
    cpt_code VARCHAR(10) NOT NULL,
    procedure_name VARCHAR(150),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    clinical_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_revision_cpt UNIQUE (revision_id, cpt_code)
);

CREATE INDEX IF NOT EXISTS idx_pcp_cpt ON public.preference_card_procedures(cpt_code);
```

#### Table 4: `public.preference_card_items`
Itemized Bill of Materials (BOM) for the surgical procedure.

```sql
CREATE TABLE IF NOT EXISTS public.preference_card_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    revision_id UUID NOT NULL REFERENCES public.surgeon_preference_card_revisions(id) ON DELETE CASCADE,
    
    -- Classification
    item_category VARCHAR(30) NOT NULL
        CHECK (item_category IN (
            'IMPLANT',
            'STERILE_DISPOSABLE',
            'INSTRUMENT_TRAY',
            'CAPITAL_EQUIPMENT',
            'SUTURE',
            'MEDICATION_BIOLOGIC'
        )),
    
    -- Master Catalog Links (Nullable based on item_category)
    component_id UUID REFERENCES public.implant_components(id) ON DELETE RESTRICT,
    sku_id UUID REFERENCES public.implant_product_skus(id) ON DELETE RESTRICT,
    custom_item_name VARCHAR(150) NOT NULL,
    manufacturer VARCHAR(100),
    catalog_number VARCHAR(100),
    
    -- Staging & Quantities
    staging_behavior VARCHAR(20) NOT NULL DEFAULT 'OPEN'
        CHECK (staging_behavior IN ('OPEN', 'HOLD')),
    planned_quantity INTEGER NOT NULL DEFAULT 1 CHECK (planned_quantity >= 1),
    unit_of_measure VARCHAR(20) NOT NULL DEFAULT 'EA'
        CHECK (unit_of_measure IN ('EA', 'BOX', 'PACK', 'KIT', 'SET', 'VIAL', 'TRAY')),
    
    -- Operational Logic
    is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
    laterality_modifier VARCHAR(10) DEFAULT 'STANDARD'
        CHECK (laterality_modifier IN ('STANDARD', 'LEFT_ONLY', 'RIGHT_ONLY', 'BILATERAL_DOUBLE')),
    open_trigger_stage VARCHAR(50) DEFAULT 'PRE_INCISION',
    prep_instructions TEXT,
    sequence_order INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pci_revision ON public.preference_card_items(revision_id);
CREATE INDEX IF NOT EXISTS idx_pci_category ON public.preference_card_items(item_category);
CREATE INDEX IF NOT EXISTS idx_pci_sku ON public.preference_card_items(sku_id);
```

#### Table 5: `public.preference_card_substitutions`
Pre-approved clinical substitutions for inventory resilience.

```sql
CREATE TABLE IF NOT EXISTS public.preference_card_substitutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    preference_card_item_id UUID NOT NULL REFERENCES public.preference_card_items(id) ON DELETE CASCADE,
    
    -- Substitute Reference
    substitute_sku_id UUID REFERENCES public.implant_product_skus(id) ON DELETE RESTRICT,
    substitute_component_id UUID REFERENCES public.implant_components(id) ON DELETE RESTRICT,
    substitute_item_name VARCHAR(150) NOT NULL,
    substitute_catalog_number VARCHAR(100),
    substitute_vendor_id UUID REFERENCES public.implant_vendors(id) ON DELETE RESTRICT,
    
    -- Substitution Governance
    substitution_tier VARCHAR(30) NOT NULL DEFAULT 'TIER_1_OEM_EQUIVALENT'
        CHECK (substitution_tier IN (
            'TIER_1_OEM_EQUIVALENT',      -- Same manufacturer alternative size/model
            'TIER_2_CONTRACT_FORMULARY',   -- Contracted alternative vendor (Phase 55 Preferred)
            'TIER_3_EMERGENCY_SUBSTITUTE'  -- Clinical Director authorized substitute
        )),
    is_auto_substitute_allowed BOOLEAN NOT NULL DEFAULT TRUE,
    clinical_justification TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pcs_item ON public.preference_card_substitutions(preference_card_item_id);
```

#### Table 6: `public.case_preference_snapshots`
Immutable pre-op case snapshot capturing exact card state when case was staged.

```sql
CREATE TABLE IF NOT EXISTS public.case_preference_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE CASCADE,
    revision_id UUID NOT NULL REFERENCES public.surgeon_preference_card_revisions(id) ON DELETE RESTRICT,
    
    -- Snapshot Metadata
    case_date DATE NOT NULL,
    surgeon_id BIGINT NOT NULL REFERENCES public.surgeons(id) ON DELETE RESTRICT,
    primary_cpt VARCHAR(10) NOT NULL,
    case_laterality VARCHAR(10) DEFAULT 'NONE',
    
    -- Pre-Op Readiness Gate
    readiness_status VARCHAR(30) NOT NULL DEFAULT 'PENDING_PREP'
        CHECK (readiness_status IN (
            'PENDING_PREP',        -- Case scheduled, pick list not pulled
            'ITEMS_PULLED',        -- SPD/Materials completed core pulling
            'CASE_READY',          -- All OPEN & HOLD items staged in OR
            'SUPPLY_BREACH',       -- Critical item missing or stocked out
            'VERIFIED_BY_SCRUB'    -- Scrub tech verified sterile table
        )),
    verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    frozen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    snapshot_payload JSONB NOT NULL, -- Full frozen BOM JSON including items & substitutions

    CONSTRAINT uq_case_preference_snapshot UNIQUE (surgery_id)
);

CREATE INDEX IF NOT EXISTS idx_cps_surgery ON public.case_preference_snapshots(surgery_id);
CREATE INDEX IF NOT EXISTS idx_cps_facility_date ON public.case_preference_snapshots(facility_id, case_date);
```

#### Table 7: `public.case_preference_reconciliations`
Item-by-item post-operative variance reconciliation.

```sql
CREATE TABLE IF NOT EXISTS public.case_preference_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    snapshot_id UUID NOT NULL REFERENCES public.case_preference_snapshots(id) ON DELETE CASCADE,
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE CASCADE,
    
    -- Planned vs Actual Item Links
    preference_card_item_id UUID REFERENCES public.preference_card_items(id) ON DELETE SET NULL,
    case_device_id UUID REFERENCES public.case_devices(id) ON DELETE SET NULL,
    item_description VARCHAR(150) NOT NULL,
    item_category VARCHAR(30) NOT NULL,
    
    -- Variance Analysis
    planned_staging VARCHAR(20) NOT NULL, -- 'OPEN' or 'HOLD'
    planned_quantity INTEGER NOT NULL DEFAULT 0,
    actual_quantity_opened INTEGER NOT NULL DEFAULT 0,
    actual_quantity_implanted INTEGER NOT NULL DEFAULT 0,
    actual_quantity_wasted INTEGER NOT NULL DEFAULT 0,
    actual_quantity_returned INTEGER NOT NULL DEFAULT 0,
    
    -- Clinical Disposition
    disposition_code VARCHAR(40) NOT NULL
        CHECK (disposition_code IN (
            'EXACT_MATCH',
            'HOLD_RETURNED_CLEAN',
            'OPENED_CONTAMINATED_WASTE',
            'SUBSTITUTED_EQUIVALENT',
            'UNPLANNED_ADDITION',
            'MISSING_OMITTED'
        )),
    variance_reason TEXT,
    waste_estimated_cost NUMERIC(10, 2) DEFAULT 0.00,
    reconciled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reconciled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cpr_snapshot ON public.case_preference_reconciliations(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_cpr_surgery ON public.case_preference_reconciliations(surgery_id);
CREATE INDEX IF NOT EXISTS idx_cpr_disposition ON public.case_preference_reconciliations(facility_id, disposition_code);
```

---

## 5. Core Deterministic Business Rules

### Rule 5.1: Automatic Preference Card Matching Algorithm
When a case is scheduled in `public.surgeries`, the system executes the deterministic resolution function `public.fn_resolve_case_preference_card`:

```
Input: facility_id, surgeon_id, primary_cpt, surgery_date

Step 1: Check for Active Surgeon-Specific Card at Facility
        WHERE surgeon_id = :surgeon_id 
          AND facility_id = :facility_id 
          AND primary_cpt = :primary_cpt 
          AND is_active = TRUE
          AND revision.status = 'active'
          AND :surgery_date BETWEEN revision.effective_from AND COALESCE(revision.effective_to, '9999-12-31')

Step 2: If NOT FOUND, Check for Enterprise Template Card for Surgeon
        WHERE surgeon_id = :surgeon_id 
          AND facility_id IS NULL 
          AND primary_cpt = :primary_cpt 
          AND is_active = TRUE

Step 3: If NOT FOUND, Fallback to Facility House Card
        WHERE is_house_card = TRUE 
          AND facility_id = :facility_id 
          AND primary_cpt = :primary_cpt

Step 4: If STILL NOT FOUND, Return NULL (Readiness Status: NO_PREFERENCE_CARD_AVAILABLE)
```

### Rule 5.2: Revision Lifecycle & Approval Gate
- **`draft` $\to$ `pending_approval`:** Triggered when the author (Surgeon, PA, or Materials Manager) completes item editing.
- **`pending_approval` $\to$ `approved`:** Requires Clinical Director, OR Supervisor, or CFO review. The author **cannot approve their own submission** (Phase 24 Two-Person Separation of Duties).
- **`approved` $\to$ `active`:** Activated automatically when `CURRENT_DATE >= effective_from`. Upon activation, any prior revision is automatically marked **`superseded`**.
- **`retired`:** Explicitly decommissioned by the Clinical Director. Retired cards are never selected for new scheduled cases.

### Rule 5.3: Laterality & Multi-CPT Construct Multipliers
- When a surgery is documented as **`BILATERAL`**:
  - Items with `laterality_modifier = 'BILATERAL_DOUBLE'` automatically double their planned quantities ($Q_{\text{plan}} = Q_{\text{base}} \times 2$).
  - Items with `laterality_modifier = 'STANDARD'` (e.g. skin prep kits, positioning beanbags) retain $Q_{\text{plan}} = 1$.
- When a surgery has secondary CPT codes:
  - If a secondary CPT matches a linked procedure in `preference_card_procedures`, items flagged specifically for that co-procedure are appended to the case BOM without duplicating general setup items.

### Rule 5.4: Supply Chain & Formula Alignment Check
Every night during the batch scheduling run ($T-48\text{h}$):
1. The system crosses all `preference_card_items` against Phase 54 `implant_product_skus.is_active` and Phase 56 `facility_vendor_contracts.status`.
2. If an item is **recalled, discontinued, or vendor-suspended**, the case readiness is flagged with **`SUPPLY_BREACH`**, highlighting the pre-approved substitution from `preference_card_substitutions`.

---

## 6. Financial & Billing Boundaries (Strict Isolation)

### 6.1 Architectural Decoupling from Billing
To prevent fraudulent claims or corrupted general ledgers, Phase 58 establishes a strict, impenetrable boundary between planning and billing:

```
[ CLINICAL PLANNING ]                 [ OPERATIVE CONSUMPTION ]          [ FINANCIAL RECONCILIATION ]
Surgeon Preference Card                Case Device Ledger                Facility Pricing & Billing
-----------------------                ------------------                --------------------------
Planned Items (OPEN/HOLD)   ══════>    Actual Items Implanted   ══════>  Reconciled Unit Cost (Ph 57)
Planned Quantities                     Verified Serial / Lot #           Phase 24 Scrubbing Rules
Target Catalog Numbers                 Usage Status: IMPLANTED           Clean Claim Generation (Ph 47)
          │                                     │                                     │
          ▼                                     ▼                                     ▼
  NEVER DIRECTLY WRITES                 AUTHORITATIVE PROOF                   PENNY-ACCURATE CLAIM
  TO BILLING / INVOICING                OF CONSUMPTION                        OR COST ALLOCATION
```

1. **Preference Quantities Are Not Consumed Units:** Listing a quantity of 2 femoral components on a preference card does not generate a $2 \times \text{cost}$ financial liability. Only rows with `usage_status = 'IMPLANTED'` in `case_devices` transition to `case_device_cost_allocations`.
2. **Missing Costs Remain Explicitly Missing:** If an item listed on a preference card has no active contract in Phase 56/57, its cost is marked `UNVERIFIED_COST` ($0.00 is strictly prohibited as a placeholder).
3. **Waste Accountability:** Items opened under `staging_behavior = 'OPEN'` that are not implanted are categorized as `OPENED_CONTAMINATED_WASTE`. Their verified invoice cost is charged to the facility's **Surgeon Operative Variance Ledger** for benchmarking, but is **never billed to Medicare or private payers**.

---

## 7. Permissions, RBAC & Tenant Security

### 7.1 Role-Based Access Control (RBAC) Matrix

| RBAC Role | View Cards | Create Draft | Edit Draft | Submit | Approve / Publish | Edit Substitutions | Freeze / Stage Case | Reconcile Usage |
|---|---|---|---|---|---|---|---|---|
| `super_admin` | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| `facility_admin` | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| `clinical_director` / `cfo` | Yes | Yes | Yes | Yes | **Yes** (Authoritative) | Yes | Yes | Yes |
| `attending_surgeon` | Yes | Yes | Yes (Own) | Yes (Own) | No (Separation) | Yes (Own) | View Only | View Variance |
| `materials_manager` | Yes | Yes | Yes | Yes | No | **Yes** (Formulary) | Yes | Yes |
| `circulating_nurse` | Yes | No | No | No | No | No | **Yes** (Verify) | **Yes** (Input) |
| `scrub_technician` | Yes | No | No | No | No | No | **Yes** (Checklist) | No |
| `auditor` / `compliance` | Yes (RO) | No | No | No | No | No | View Only | View Only |

### 7.2 Row-Level Security (RLS) Policies
All 7 tables enforce multi-facility tenant isolation via `public.get_auth_user_facilities()`:

```sql
ALTER TABLE public.surgeon_preference_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surgeon_preference_card_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preference_card_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_preference_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_preference_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spc_facility_isolation_select" ON public.surgeon_preference_cards
    FOR SELECT TO authenticated
    USING (facility_id IS NULL OR facility_id IN (SELECT public.get_auth_user_facilities()));

CREATE POLICY "spc_facility_isolation_modify" ON public.surgeon_preference_cards
    FOR ALL TO authenticated
    USING (facility_id IN (SELECT public.get_auth_user_facilities()))
    WITH CHECK (facility_id IN (SELECT public.get_auth_user_facilities()));
```

---

## 8. API & Service Architecture (`preferenceCardService.js`)

The client service communicates via Supabase PostgreSQL RPCs and PostgREST endpoints.

### 8.1 Authoritative Service Methods

```javascript
export const preferenceCardService = {
  // 1. Directory & Query
  async getPreferenceCards({ facilityId, surgeonId, primaryCpt, status, search, limit = 50, offset = 0 }),
  async getPreferenceCardById(cardId),
  async getCardRevisionDetails(revisionId),
  
  // 2. Authoring & Revision Lifecycle
  async createCardDraft(cardPayload),
  async updateCardDraft(revisionId, itemUpdates),
  async cloneCardToNewDraft(sourceRevisionId, targetSurgeonId, targetFacilityId),
  async submitForApproval(revisionId, changeSummary),
  async approveCardRevision(revisionId, approvalRationale),
  async rejectCardRevision(revisionId, rejectionReason),
  async retireCard(cardId, decommissionRationale),

  // 3. Procedural & Substitution Management
  async addCardItem(revisionId, itemPayload),
  async removeCardItem(itemId),
  async configureSubstitution(itemId, substitutionPayload),
  
  // 4. Case Execution & Staging Gate
  async resolveCasePreferenceCard({ facilityId, surgeonId, primaryCpt, surgeryDate }),
  async freezeCasePreferenceSnapshot(surgeryId),
  async updateCaseReadinessStatus(snapshotId, readinessStatus, verifiedNotes),
  
  // 5. Post-Op Reconciliation
  async executeCaseReconciliation(surgeryId),
  async getCaseReconciliationLedger(surgeryId),
  async getSurgeonVarianceAnalytics({ facilityId, surgeonId, startDate, endDate })
};
```

---

## 9. User Experience & Maestro UI Architecture

The interface will be constructed as a high-density, multi-view operational workspace in `src/components/SurgeonPreferenceCards.jsx` with dedicated styling in `SurgeonPreferenceCards.css`.

### 9.1 Maestro Design System & Strict Purple Ban
- **Strict Color Tokens:** Slate (`#0f172a`, `#1e293b`), Sky/Cyan (`#0284c7`, `#38bdf8`), Emerald (`#10b981`), Amber (`#f59e0b`), Rose (`#f43f5e`).
- **Forbidden:** Zero purple, violet, indigo, fuchsia, or magenta tokens in CSS, JSX, or badges.

### 9.2 Workspace Views
1. **Master Directory Tab:** Search by surgeon name, NPI, CPT code, and specialty. Filter by card status (`ACTIVE`, `PENDING APPROVAL`, `DRAFT`, `HOUSE CARD`).
2. **Interactive BOM Editor:** Visual split-panel showing card details on the left and the itemized bill of materials on the right, tabbed by **Implants**, **Disposables**, **Trays**, **Equipment**, and **Sutures**. Drag-and-drop sequencing and one-click `OPEN` $\leftrightarrow$ `HOLD` toggles.
3. **Side-by-Side Revision Diff Viewer:** Compares Revision $N$ against Revision $N-1$, highlighting added items in green, removed items in red, and quantity changes in amber.
4. **Pre-Op Case Readiness Console:** OR circulating nurse board displaying scheduled cases for the day, active pick list status, and stockout alerts (`SUPPLY_BREACH`).
5. **Post-Op Reconciliation Ledger:** Color-coded variance grid showing planned versus actual item consumption, waste cost quantification, and one-click "Add to Surgeon Card" workflow for unplanned items.

---

## 10. Database Migration Plan (`034_surgeon_preference_cards.sql`)

### 10.1 Execution Pre-requisites
1. **Migration 013** (`public.surgeons`, `surgeon_facility_affiliations`).
2. **Migration 026** (`public.implant_components`).
3. **Migration 029** (`public.implant_product_skus`).
4. **Migration 031** (`public.facility_vendor_contracts`).
5. **Migration 032** (`public.facility_implant_price_schedules`).

### 10.2 Forward Migration Scope (`034_surgeon_preference_cards.sql`)
1. Create 7 tables with strict foreign keys, check constraints, and unique indexes.
2. Alter `public.surgeries` to add `preference_card_id UUID`, `preference_card_revision_id UUID`, and `preference_readiness_status VARCHAR(30)`.
3. Alter `public.case_devices` to add `preference_card_item_id UUID` and `preference_snapshot_id UUID`.
4. Deploy deterministic resolution stored procedure `public.fn_resolve_case_preference_card`.
5. Enable RLS and attach tenant security policies.
6. Seed baseline cards for Naples Surgery Center (`00000000-0000-0000-0000-000000000002`) covering Orthopedics Total Knee (`27447`) and Ophthalmology Cataract (`66984`).

### 10.3 Down Migration Scope (`034_surgeon_preference_cards_down.sql`)
1. Drop triggers and stored procedures.
2. Remove added columns from `public.case_devices` and `public.surgeries`.
3. Drop all 7 preference card tables in reverse dependency order.

---

## 11. QA Test Matrix & Acceptance Criteria

### 11.1 Test Scenarios (`tests/surgeon-preference-cards.test.js`)

| Test Suite | Scenario / Assertion Description | Acceptance Standard |
|---|---|---|
| **DDL & Schema** | Migration 034 SQL files exist, are substantive, and create all 7 tables. | All tables, foreign keys, and indexes pass static AST checks. |
| **Card Matching** | `resolveCasePreferenceCard` matches exact surgeon, CPT, and facility. | Resolves Surgeon Card > Enterprise Card > House Card. |
| **Revision Gate** | Author cannot approve their own card revision. | Throws `SEPARATION_OF_DUTIES_VIOLATION`. |
| **Approval Sync** | Active revision requires `approved_at IS NOT NULL`. | Check constraint rejects active revisions without approval. |
| **Staging Validation**| Items enforce `OPEN` vs `HOLD` with positive quantities. | Check constraints block $Q \le 0$ or invalid staging codes. |
| **Snapshot Lock** | Once case preference snapshot is frozen, later card edits do not alter case BOM. | Snapshot JSON payload remains immutable. |
| **Substitution** | Validates Tier 1, 2, and 3 clinical substitutions against Phase 55 mappings. | Blocks unmapped or restricted vendor components. |
| **RLS Tenant Isolation** | Querying preference cards from Facility B as Facility A returns empty array. | Zero cross-tenant data leakage. |
| **Financial Boundary**| Preference card items do not create invoices or claim charges. | `case_device_cost_allocations` remains untouched during card authoring. |
| **Maestro Purple Ban**| CSS and JSX contain zero purple/violet/magenta/fuchsia tokens. | RegEx token validator passes with zero violations. |

---

## 12. Decision Register & Architecture Trade-Offs

| Decision Item | Options Evaluated | Selected Architecture | Clinical & Financial Rationale |
|---|---|---|---|
| **1. Card Tenancy Ownership** | A) Surgeon-owned across network.<br>B) Facility-owned strict.<br>C) Hybrid Enterprise Template with Facility Customization. | **Option C (Hybrid)** | Enables a health system to maintain standard clinical templates while allowing Naples Surgery Center to customize packs for local vendor contracts. |
| **2. Multi-CPT Construct Representation** | A) 1 card per CPT strictly.<br>B) 1 card per Surgeon with multiple CPT links.<br>C) Separate cards merged on the fly in OR. | **Option B (Card per Construct)** | Surgeons do not operate in single CPT isolation. Total knee includes excision, balancing, and closure. Grouping avoids OR pick-list chaos. |
| **3. Staging Granularity** | A) Simple checkbox "Needed".<br>B) Explicit `OPEN` vs `HOLD`.<br>C) Multi-stage timing (T-60, T-30, Incision). | **Option B (`OPEN` vs `HOLD`)** | Proven standard in high-volume ASCs. Drastically reduces expensive implant waste while ensuring emergency equipment is in the room. |
| **4. Actual Usage Attribution** | A) Overwrite preference card after surgery.<br>B) Separate post-op reconciliation ledger linked to `case_devices`. | **Option B (Separate Ledger)** | Preserves the integrity of the planned baseline for statistical variance analysis and surgeon cost profiling. |

---

## 13. Implementation Notes (Specification Phase)

- **Audit Execution:** Completed across migrations 001–033, `src/lib/`, and `src/components/`.
- **Database Status:** No migrations executed; no database tables altered.
- **Application Status:** No UI components or client services modified.
- **Deliverable Produced:** Authoritative specification file created at `docs/phases/58_SURGEON_PREFERENCE_CARDS.md`.
- **Next Phase Step:** Ready for Phase 58 implementation upon user approval (Migration 034, `preferenceCardService.js`, `SurgeonPreferenceCards.jsx`, and test suite).
