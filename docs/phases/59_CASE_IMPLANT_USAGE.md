# Phase 59 — Case Implant Usage
## Master Production Architecture Specification & System Audit

**Document Version:** 1.0.0  
**Phase ID:** Phase 59  
**Subsystem:** Clinical Operations & Implant Intelligence (Phase 05)  
**Status:** APPROVED ARCHITECTURAL SPECIFICATION (Specification-First — Zero Code Mutations)  
**Target Platform:** ASCANALYST Enterprise Ambulatory Surgery Center Intelligence Platform  
**Target Database Engine:** Supabase PostgreSQL 15+ (Remote Cluster: `isutllqthmakvwgduaos`)  
**Design Standard:** Maestro Clinical Dark System / Strict Purple Ban  
**Next Sequential Migration:** `035_case_implant_usage.sql` (Rollback: `035_case_implant_usage_down.sql`)  
**Upstream Dependencies:** Phase 21 (`public.facilities`, Migration 001/008), Phase 22 (`src/lib/rbacService.js`), Phase 23 (`rls`), Phase 24 (`public.audit_logs`, Migration 004), Phase 31 (`public.surgeries`, Migration 009), Phase 46 (`public.case_devices`, Migration 023), Phase 50 (`implants.*` RBAC, Migration 025), Phase 51 (`public.implant_components`, Migration 026), Phase 52 (`public.cpt_implant_mappings`, Migration 027), Phase 53 (`public.implant_vendors`, Migration 028), Phase 54 (`public.implant_product_skus`, Migration 029), Phase 55 (`public.implant_vendor_component_mappings`, Migration 030), Phase 56 (`public.facility_vendor_contracts`, Migration 031), Phase 57 (`public.facility_implant_sku_prices`, `public.case_device_cost_allocations`, Migration 032/033), Phase 58 (`public.surgeon_preference_cards`, `public.case_preference_reconciliations`, Migration 034)  
**Downstream Consuming Modules:** Phase 47 (`public.claim_scrubbing_rules` pre-bill device validations), Phase 5A (`implant_cost_hierarchy_engine`), Phase 5B (`implant_variance_and_savings_engine`), Phase 5D (`device_duration_classification`), Phase 60 (`supply_chain_edi_856_asn_integrations`)  

---

## 1. Executive Summary & Clinical/Financial Purpose

### 1.1 Clinical & Operational Purpose
In Ambulatory Surgery Centers (ASCs) and surgical outpatient facilities, the accurate recording of implantable medical devices used during surgery is a critical clinical, regulatory, and financial responsibility. Devices implanted into patient anatomy—such as total knee femoral components, spinal cages, intraocular lenses (IOLs), pacemakers, and bone fixation screws—remain in the patient permanently or for extended durations. 

Failure to capture an authoritative, indisputable record of actual implant consumption leads to severe operational hazards:
1. **Patient Safety & Regulatory Liability:** Under FDA 21 CFR § 801 and § 830 (Unique Device Identification System) and Joint Commission standards, every facility must be capable of tracing any implanted device back to its manufacturer, catalog number, lot number, serial number, and expiration date within minutes of an FDA Class I/II/III recall or safety alert.
2. **Operative Delays & Communication Breakdowns:** Circulating nurses and scrub technicians frequently rely on paper stickers, unlinked whiteboard tallies, or vendor representative "charge sheets" that are reconciled hours or days after the patient leaves the Operating Room (OR).
3. **Unrecorded Scrap & Contaminated Waste:** When a sterile implant package is opened and subsequently contaminated, dropped, or found to be an incorrect size, failure to record the item as **wasted** distorts inventory balances, hides clinical scrap costs, and forfeits legitimate vendor warranty replacement credits.

Phase 59 defines the **Case Implant Usage** engine—the authoritative intra-operative and post-operative record of actual implantable device consumption for every surgical encounter.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               OPERATIVE CASE IMPLANT FLOW                              │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                           │
         ┌─────────────────────────────────┴─────────────────────────────────┐
         ▼                                                                   ▼
┌─────────────────────────────────┐                         ┌─────────────────────────────────┐
│     Phase 58: PREFERENCE CARD   │                         │     Phase 54: MASTER SKU        │
│    Planned BOM & Staging Tiers  │                         │   Catalog & UDI-DI Definitions  │
│         (OPEN vs HOLD)          │                         │   (GTIN-14, HIBC, Manufacturer) │
└────────────────┬────────────────┘                         └────────────────┬────────────────┘
                 │                                                           │
                 │ PRE-OP PICK & STAGE                                       │ BARCODE / SCAN
                 ▼                                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        INTRA-OPERATIVE CASE CONSUMPTION CAPTURE                        │
│                   `public.case_devices` (Refactored Authoritative Table)                │
│                                                                                        │
│   • UDI-DI (GTIN) + UDI-PI (Lot, Serial, Expiration Date)                             │
│   • Mathematical Balance: Quantity Opened = Implanted + Wasted + Returned              │
│   • Sourcing Provenance: Facility-Owned vs Consignment vs Bill-Only                    │
│   • Staging Reconciliation: Preference Card Item Link + Substitution Variance          │
└────────────────┬───────────────────────────────────────────────────────────────────────┘
                 │
         ┌───────┴─────────────────────────────────┬─────────────────────────────────┐
         ▼                                         ▼                                 ▼
┌─────────────────────────────────┐ ┌─────────────────────────────────┐ ┌───────────────────────────┐
│   Phase 57: PRICING ALLOCATION  │ │    POST-CLOSURE AMENDMENTS      │ │  FDA RECALL TRACEABILITY  │
│   Verified Acquisition Cost     │ │   `case_device_amendments`      │ │ Instant Patient Case Roster│
│  `case_device_cost_allocations` │ │  Immutable Two-Person Diff Log  │ │  By Lot / Serial / SKU    │
└────────────────┬────────────────┘ └─────────────────────────────────┘ └───────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                           DOWNSTREAM PRE-BILL CLAIM SCRUBBING                          │
│                 HCPCS C-Codes, Invoice Matching, Claim Release Cleared                 │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Financial Integrity & Pricing Non-Conflation
In ASC financial operations, implants represent 25% to 45% of total case costs. A fatal vulnerability in surgical software is **price conflation**—the failure to separate what an item costs from what is billed:
- **Contract Price:** Negotiated rate established under Phase 56 vendor contracts.
- **Supplier Invoice Line Cost:** Gross billed dollar amount on a vendor shipment invoice (Phase 57).
- **Verified Unit Acquisition Cost:** Net expense absorbed by the facility after prompt-pay discounts, freight allocations, and volume rebates (stored in `case_device_cost_allocations`).
- **Patient Unit Charge (Chargemaster):** Gross dollar markup billed to commercial payers or self-pay patients.
- **Extended Cost:** Authoritatively computed as $\text{Quantity Implanted} \times \text{Verified Unit Acquisition Cost}$.

Phase 59 strictly enforces that **`case_devices` records physical clinical consumption and its direct financial links**, while authoritative pricing hierarchies run server-side via Phase 57 `case_device_cost_allocations`.

### 1.3 Core Capabilities
1. **Authoritative Consumption Tracking:** Records physical implants used in a surgery with deterministic mathematical balance:
   $$\text{Quantity Opened} = \text{Quantity Implanted} + \text{Quantity Wasted} + \text{Quantity Returned}$$
2. **Bifurcated UDI Support:** Separates static Device Identifiers (`udi_di` / GTIN-14) from dynamic Production Identifiers (`udi_pi` containing lot number, serial number, and expiration date).
3. **Clinical Staging & Preference Card Reconciliation:** Automatically matches used items against Phase 58 preference card planned BOM lines, classifying line items into **Exact Match**, **HOLD Clean Return**, **Opened Waste**, **Authorized Substitution**, or **Unplanned Addition**.
4. **Multi-Channel Sourcing Attribution:** Differentiates `FACILITY_OWNED`, `VENDOR_CONSIGNMENT`, `BILL_ONLY`, `EMERGENCY_COURIER`, and `LOANER_TRAY` items, establishing purchase order and receiving provenance.
5. **Clinical Waste & Liability Attribution:** Delineates scrap causes (`DROPPED_ON_FIELD`, `SIZING_TRIAL_DISCARD`, `DEFECTIVE_OUT_OF_PACKAGE`) and assigns financial liability (`FACILITY_EXPENSE` vs `VENDOR_REPLACEMENT_CREDIT`).
6. **Immutable Post-Closure Amendment Ledger:** Enforces a two-person separation-of-duties governance workflow for any modifications occurring after operative case closure.
7. **Bi-Directional Recall Traceability:** Allows infection control officers or materials managers to query an SKU, catalog number, lot, or serial number and instantly retrieve all matching patient cases, dates of surgery, and attending surgeons.

### 1.4 Scope Boundaries & Non-Goals
- **Implants vs. Non-Implant Consumables:** Phase 59 governs **implantable medical devices** (permanent, temporary fixation, resorbable, or modular components). Bulk disposable surgical supplies (gloves, sponges, standard drape packs) are tracked as procedural supplies and do not require UDI lot/serial tracing or `case_devices` entries unless explicitly billed as a carve-out device.
- **Minimum Viable Release (MVR) vs. Future Integrations:** 
  - **In-Scope (MVR):** Manual entry, optical hardware barcode wedge ingestion, preference card pre-population, 4-tier quantity reconciliation, clinical waste attribution, amendment ledger, Phase 57 cost junction, and historical recall reporting.
  - **Out-of-Scope (Future Integrations):** Native mobile camera computer-vision scanning SDKs, direct EDI 856 Advance Shipping Notice (ASN) supplier dispatch pipelines, and automated FDA GUDID API webhook synchronizers.

### 1.5 Readiness Verdict: `GO FOR SPECIFICATION`
- **Preceding Phase 57 & Phase 58 are Completed:** Migrations `032_facility_implant_pricing.sql`, `033_consolidated_implant_phases_54_to_57.sql`, and `034_surgeon_preference_cards.sql` are committed and green.
- **`case_devices` Exists as the Authoritative Entity:** Migration 023 created `case_devices`, Migration 025 extended it, and Migrations 029, 031, 032, and 034 wired FK relationships. A new competing table is completely unnecessary and would violate database normalization.
- **Refactoring Strategy Confirmed:** `case_devices` requires additive columns to support bifurcated quantities, UDI DI/PI fields, sourcing channels, and an amendment ledger.

---

## 2. Current State Audit & Repository Findings

A complete inspection of the local repository (`e:\medicalAI\asc-prototype`), migrations `001` through `034`, client services, and test suites was conducted.

### 2.1 Systematic Component Audit Matrix

| Component / Artifact | File / Schema Evidence | Classification | Current Reality & Technical Evidence | Identified Gaps & Production Remediation |
| :--- | :--- | :--- | :--- | :--- |
| **`public.case_devices`** | `supabase/migrations/023_charge_completeness_engine.sql:23-40`<br>`supabase/migrations/025_implant_intelligence_core_and_rbac.sql:127-159` | **REFACTOR** | Stores intra-operative devices with `surgery_id`, `facility_id`, `procedure_id`, `device_name`, `hcpcs_code`, `hcpcs_c_code`, `serial_number`, `lot_number`, `quantity`, `unit_cost`, `charge_amount`, `total_cost`, `total_charge`, `invoice_number`, `invoice_line_cost`, `expiration_date`, `udi`, `duration_classification`, `usage_status`, `cost_hierarchy_tier`, `sku_id`, `vendor_id`, `contract_id`, `preference_card_item_id`, `preference_snapshot_id`. | **Lacks Granular Quantities & UDI Bifurcation.** Single `quantity` integer conflates opened, implanted, and wasted units. Lacks distinct `udi_di` vs `udi_pi`, `unit_of_measure`, `sourcing_channel`, `waste_reason`, `is_closed` flag, and amendment versioning. Refactor additively. |
| **`public.surgeries`** | `supabase/migrations/001_multi_tenancy_core.sql:200-210`<br>`supabase/migrations/009_case_master_normalization.sql:15-80` | **KEEP & INTEGRATE** | Master surgical case table with `id` (BIGINT), `facility_id` (UUID), `surgeon_id` (BIGINT), `surgery_date`, `implants_cost`, `status`. | **Case Parent Anchor.** Parent record for all implant usage. `surgeries.implants_cost` is synchronized automatically from `case_devices`. |
| **`public.surgery_procedures`** | `supabase/migrations/009_case_master_normalization.sql:85-130` | **KEEP & INTEGRATE** | Normalized procedure construct linking CPT codes to surgeries with `is_primary` and `sequence_order`. | **Procedure Anchor.** `case_devices.procedure_id` links directly to this table to attribute implants to specific CPT codes in multi-procedure surgeries. |
| **`public.implant_components`** | `supabase/migrations/026_implant_category_and_component_model.sql:45-120` | **KEEP & INTEGRATE** | Master clinical component dictionary (e.g., `KNEE_FEMORAL`, `HIP_CUP`, `IOL_MONOFOCAL`) with `requires_serial_tracking` and `requires_lot_tracking` flags. | **Clinical Governance Anchor.** Validates whether a device requires mandatory serial or lot entry during intra-op capture. |
| **`public.implant_product_skus`** | `supabase/migrations/029_implant_product_sku_model.sql:46-138` | **KEEP & INTEGRATE** | OEM product SKU catalog with `udi_di`, `catalog_number`, `manufacturer`, `brand_name`, `list_price`, `status`, `recall_class`, `recall_date`. | **Catalog Master Anchor.** Target of `case_devices.sku_id`. Contains authoritative UDI-DI and packaging definitions. |
| **`public.facility_vendor_contracts`** | `supabase/migrations/031_facility_vendor_contracts.sql:43-131` | **KEEP & INTEGRATE** | Commercial procurement contracts authorizing vendor sourcing, consignment terms, and payment terms. | **Contract Provenance Anchor.** Target of `case_devices.contract_id`. |
| **`public.case_device_cost_allocations`** | `supabase/migrations/032_facility_implant_pricing.sql:267-310` | **KEEP & INTEGRATE** | Authoritative junction assigning verified actual acquisition cost and cost hierarchy tier (1 through 5) to `case_devices`. | **Financial Cost Source.** One-to-one junction (`uq_case_device_cost`) that locks actual acquisition cost for billing. |
| **`public.case_preference_reconciliations`** | `supabase/migrations/034_surgeon_preference_cards.sql:235-273` | **KEEP & INTEGRATE** | Phase 58 preference card post-operative planned vs actual consumption reconciliation ledger. | **BOM Reconciliation Link.** Connects planned preference items to actual `case_devices` records with variance dispositions. |
| **`fn_sync_surgery_implants_cost`** | `supabase/migrations/032_facility_implant_pricing.sql:394-420` | **REFACTOR** | Database trigger function syncing `surgeries.implants_cost` as `SUM(total_cost) FROM case_devices WHERE usage_status = 'IMPLANTED'`. | **Quantity Refactor Needed.** Must be updated to use `quantity_implanted * unit_cost` (or verified acquisition cost) instead of legacy `quantity * unit_cost`. |
| **`fn_reconcile_case_device_totals`** | `supabase/migrations/025_implant_intelligence_core_and_rbac.sql:209-247` | **REFACTOR** | Stored procedure summing `case_devices` cost and charges onto `surgeries`. | **Bifurcated Quantity Update.** Refactor to compute total implanted cost, total wasted cost, and extended charges accurately. |
| **`fn_flag_sku_recall`** | `supabase/migrations/029_implant_product_sku_model.sql:376-433` | **KEEP & EXTEND** | Flags an SKU as recalled and counts impacted cases via `SELECT COUNT(DISTINCT surgery_id) FROM case_devices WHERE sku_id = p_sku_id`. | **Traceability Foundation.** Reused as the core recall engine, but needs an expanded procedure returning patient/case rosters. |
| **`PrebillCompletenessModal.jsx`** | `src/components/PrebillCompletenessModal.jsx:545-589` | **KEEP & EXTEND** | Pre-bill claim modal that fetches and displays `case_devices` rows in a read-only table. | **Compatible Consumer.** Reads `case_devices` via `db.getCaseDevices(surgery.id)`. Will seamlessly display new fields. |
| **`src/lib/caseImplantUsageService.js`** | None in repository. | **MISSING** | Dedicated service layer for recording implant consumption, barcode UDI parsing, waste attribution, and amendments. | **Core Phase 59 Deliverable.** Specify full JavaScript service layer. |
| **`public.case_device_amendments`** | None in repository. | **MISSING** | Dedicated immutable ledger recording post-closure changes to `case_devices`. | **Core Phase 59 Deliverable.** Specify table DDL and two-person approval mechanics. |
| **`public.case_implant_scans`** | None in repository. | **MISSING** | Raw optical barcode scanning telemetry table for hardware barcode wedge and audit tracing. | **Core Phase 59 Deliverable.** Specify table DDL. |

### 2.2 Verified Repository Facts vs. Remote Assumptions
1. **Verified Fact:** `public.case_devices` exists in `023_charge_completeness_engine.sql` and is extended in `025`, `029`, `031`, `032`, and `034`. It has triggers for audit logging (`trg_audit_case_devices`), relocation prevention (`trg_prevent_facility_relocation_case_devices`), and surgery cost synchronization (`trg_sync_surgery_implants_cost`).
2. **Verified Fact:** `public.case_devices` currently enforces `CHECK (quantity >= 1)` and `total_cost GENERATED ALWAYS AS (quantity * unit_cost) STORED`. Adding new columns must preserve backward compatibility.
3. **Verified Fact:** `src/lib/supabase.js` exposes `getCaseDevices(surgeryId)`, `addCaseDevice(deviceData)`, `updateCaseDevice(deviceId, updates)`, `deleteCaseDevice(deviceId)`, and `reconcileCaseDeviceTotals(surgeryId)`.
4. **Verified Fact:** Migrations `001` through `034` exist in the repository and all 715 unit/integration tests pass (`npm test`).
5. **Unverified Remote Assumption:** Remote database state on Supabase cluster `isutllqthmakvwgduaos` must be verified by explicit migration execution; specifications must not assume uncommitted remote tables exist.

---

## 3. Scope and Target Behavior

### 3.1 End-to-End Clinical Usage Lifecycle

```
[ PRE-OP PICK ] ───► [ INTRA-OP STAGING ] ───► [ SCAN / UNBOX ] ───► [ CLINICAL ACTION ]
Phase 58 Card        OPEN on field              Hardware Wedge         • Implanted
Pulls planned BOM    HOLD in core               Parse UDI DI/PI        • Wasted (Dropped/Defect)
                                                                       • Returned Clean
                                                                               │
                                                                               ▼
[ PRE-BILL RELEASE ] ◄── [ CASE CLOSURE ] ◄── [ PRICING ALLOCATION ] ◄── [ USAGE BALANCE ]
Claim Scrubber           Nurse Sign-Off        Phase 57 Verified Cost    Qty Opened =
HCPCS C-Codes            Two-Person Rule       Tier 1-5 Hierarchy        Implanted + Wasted
DEV-001/002/003 Cleared  Lock Usage            `cost_allocations`        + Returned
```

1. **Pre-Op Staging & Preference Card Pick:**
   - Case scheduled with Primary CPT code and surgeon.
   - Phase 58 preference card active revision is snapshotted into `case_preference_snapshots`.
   - Planned items marked **`OPEN`** are unboxed into sterile field; items marked **`HOLD`** are staged in the OR core unopened.
2. **Intra-Operative Unboxing & Barcode Ingestion:**
   - Circulating nurse or scrub technician scans packaging barcode using optical USB/Bluetooth wedge scanner or selects item from staged pick list.
   - Barcode parser decodes standard GS1-128 or HIBCC barcode into UDI-DI (GTIN) and UDI-PI (Lot, Serial, Expiration Date).
   - System matches UDI-DI against `implant_product_skus`. If matched, OEM, brand, catalog number, and HCPCS C-code are auto-populated.
3. **Intra-Operative Clinical Action & Quantity Attribution:**
   - Physical disposition recorded:
     - **Implanted:** Successfully placed in patient anatomy.
     - **Wasted:** Opened but discarded due to contamination, sizing trial, drop, or defect.
     - **Returned:** Staged on HOLD, remained sealed in original packaging, returned clean to sterile core storage.
   - Enforce invariant: $\text{Quantity Opened} = \text{Quantity Implanted} + \text{Quantity Wasted} + \text{Quantity Returned}$.
4. **Cost Allocation & Financial Reconciliation:**
   - Implants link to Phase 57 `case_device_cost_allocations`.
   - Authoritative pricing hierarchy resolves verified actual acquisition cost (Tier 1 Reconciled Invoice $\rightarrow$ Tier 2 Active Contract Price Schedule $\rightarrow$ Tier 3 Moving Average $\rightarrow$ Tier 4 Finance Override $\rightarrow$ Tier 5 Missing Blocker).
5. **Post-Operative Nurse Sign-Off & Case Lock:**
   - Circulating nurse and attending surgeon review documented implants during operative debrief.
   - Nurse executes "Close Implant Documentation". Record is locked (`is_closed = TRUE`).
   - Downstream triggers recalculate `surgeries.implants_cost` and clear pre-bill scrubbing rules.
6. **Post-Closure Corrections (Two-Person Amendment Governance):**
   - If an error is discovered post-closure (e.g., incorrect lot number transcribed, vendor invoice identifies wrong SKU), modification requires formal amendment.
   - The original `case_devices` record is updated, and an immutable diff is inserted into `case_device_amendments` requiring Clinical Director or CFO approval.

### 3.2 Delineation: Implantable Hardware vs. Non-Implant Consumables
To prevent data contamination and ensure compliance with FDA UDI regulations:
- **`case_devices` is strictly reserved for:**
  - Permanent implantable prosthetics (hips, knees, shoulders, spinal cages, pacemakers).
  - Temporary or removable implants (plates, screws, pins, rods, k-wires, tissue expanders).
  - Synthetic and biologic resorbable implants (allografts, xenografts, bone void fillers, bioresorbable anchors).
  - High-value modular accessories (femoral heads, polyethylene inserts).
- **Non-implant consumables (gloves, suction tubing, basic drapes, standard sutures):**
  - Tracked under Phase 58 `preference_card_items` (categories: `STERILE_DISPOSABLE`, `SUTURE`) and general OR case supply expense tables (`public.ot_extra_cost` or case supply ledgers).
  - **Never** inserted into `case_devices` unless specifically assigned a CMS device HCPCS C-code (e.g., C1785) requiring device-to-procedure claim scrubbing.

### 3.3 Minimum Viable Release (MVR) vs. Future Integrations
- **Phase 59 Minimum Viable Release (MVR):**
  - Table hardening of `public.case_devices`.
  - Creation of `public.case_device_amendments` and `public.case_implant_scans`.
  - Comprehensive service layer `src/lib/caseImplantUsageService.js`.
  - GS1-128 and HIBCC barcode parser supporting Application Identifiers `(01)`, `(10)`, `(17)`, `(21)`.
  - Mathematical 4-tier quantity balance enforcement.
  - Sourcing channel classification (`FACILITY_OWNED`, `VENDOR_CONSIGNMENT`, `BILL_ONLY`, etc.).
  - Clinical waste attribution with financial liability routing.
  - Backward-compatible triggers for surgery cost syncing.
  - Recall search stored procedure returning patient case rosters.
- **Phase 60+ Future Integrations (Non-Blocking):**
  - WebRTC camera scanner integration for mobile tablets.
  - Supplier EDI 856 Advance Shipping Notice (ASN) electronic receiving auto-match.
  - FDA AccessGUDID real-time API query webhooks.
  - RFID smart cabinet real-time shelf depletion listeners.

---

## 4. Authoritative Data Model & Schema DDL

### 4.1 Architectural Decision: Refactor `public.case_devices`
Creating a second competing implant usage table (e.g., `case_implant_usages`) would violate basic database normalization principles, introduce severe data synchronization latency, and break existing upstream/downstream integrations:
1. `public.case_devices` is already referenced by `case_device_cost_allocations.case_device_id` (Phase 57, Migration 032).
2. `public.case_devices` is already referenced by `case_preference_reconciliations.case_device_id` (Phase 58, Migration 034).
3. `public.case_devices` is already inspected by `claim_scrubbing_rules` (Phase 47, Migration 024) and `PrebillCompletenessModal.jsx`.
4. `public.case_devices` is already guarded by tenant relocation prevention triggers and immutable audit log triggers (Migration 025).

**Authoritative Decision:** **REFACTOR `public.case_devices` additively** to support complete intra-operative usage, UDI separation, quantity balancing, and sourcing provenance.

### 4.2 Entity Relational Model

```
┌─────────────────────────────────┐           1:N           ┌─────────────────────────────────┐
│        public.surgeries         ├────────────────────────►│       public.case_devices       │
│  (Case Master, Date, Surgeon)   │                         │ (Authoritative Consumption)     │
└─────────────────────────────────┘                         └────────────────┬────────────────┘
                                                                             │
                    ┌────────────────────────────────────────────────────────┼────────────────────────────────────────┐
                    │ 1:1                                                    │ 1:N                                    │ 1:N
                    ▼                                                        ▼                                        ▼
┌───────────────────────────────────────┐         ┌───────────────────────────────────────┐         ┌─────────────────────────────────┐
│ public.case_device_cost_allocations   │         │    public.case_device_amendments      │         │    public.case_implant_scans    │
│ (Phase 57 Verified Acquisition Cost)  │         │ (Post-Closure Two-Person Audit Ledger)│         │ (Raw Optical Scan Telemetry)    │
└───────────────────────────────────────┘         └───────────────────────────────────────┘         └─────────────────────────────────┘
```

### 4.3 Table DDL: Additive Hardening of `public.case_devices`

The following DDL establishes the complete production schema for `public.case_devices` under Migration `035_case_implant_usage.sql`:

```sql
-- ==============================================================================
-- PHASE 59: CASE IMPLANT USAGE HARDENING
-- Target Migration: 035_case_implant_usage.sql
-- ==============================================================================

-- 1. ADD BIFURCATED QUANTITIES & CONVERSIONS
ALTER TABLE public.case_devices
    ADD COLUMN IF NOT EXISTS quantity_opened INTEGER NOT NULL DEFAULT 1 CHECK (quantity_opened >= 0),
    ADD COLUMN IF NOT EXISTS quantity_implanted INTEGER NOT NULL DEFAULT 1 CHECK (quantity_implanted >= 0),
    ADD COLUMN IF NOT EXISTS quantity_wasted INTEGER NOT NULL DEFAULT 0 CHECK (quantity_wasted >= 0),
    ADD COLUMN IF NOT EXISTS quantity_returned INTEGER NOT NULL DEFAULT 0 CHECK (quantity_returned >= 0),
    ADD COLUMN IF NOT EXISTS unit_of_measure VARCHAR(20) NOT NULL DEFAULT 'EA'
        CHECK (unit_of_measure IN ('EA', 'PACK', 'SET', 'KIT', 'BOX', 'VIAL')),
    ADD COLUMN IF NOT EXISTS package_size INTEGER NOT NULL DEFAULT 1 CHECK (package_size >= 1);

-- Backfill quantity_opened and quantity_implanted from legacy quantity
UPDATE public.case_devices
SET quantity_opened = quantity,
    quantity_implanted = quantity
WHERE quantity_opened = 1 AND quantity_implanted = 1 AND quantity > 1;

-- 2. ADD BIFURCATED UDI & REGULATORY FIELDS
ALTER TABLE public.case_devices
    ADD COLUMN IF NOT EXISTS udi_di VARCHAR(50), -- FDA GUDID / GS1 GTIN-14 / HIBC Primary Code
    ADD COLUMN IF NOT EXISTS udi_pi VARCHAR(100), -- Production Identifier (Lot, Serial, Expiration raw string)
    ADD COLUMN IF NOT EXISTS udi_issuing_agency VARCHAR(20) DEFAULT 'GS1'
        CHECK (udi_issuing_agency IN ('GS1', 'HIBCC', 'ICCBBA', 'MANUAL_OVERRIDE')),
    ADD COLUMN IF NOT EXISTS catalog_number VARCHAR(50),
    ADD COLUMN IF NOT EXISTS serial_tracking_required BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS lot_tracking_required BOOLEAN DEFAULT TRUE;

-- 3. ADD CLINICAL WASTE & DAMAGE ATTRIBUTION
ALTER TABLE public.case_devices
    ADD COLUMN IF NOT EXISTS waste_reason VARCHAR(50)
        CHECK (waste_reason IS NULL OR waste_reason IN (
            'DROPPED_ON_FIELD',
            'CONTAMINATED_OPENED_NOT_USED',
            'SIZING_TRIAL_DISCARD',
            'DEFECTIVE_OUT_OF_PACKAGE',
            'EXPIRED_ON_FIELD',
            'PACKAGING_BREACH',
            'SURGEON_CHANGE_OF_MIND',
            'OTHER_WASTE'
        )),
    ADD COLUMN IF NOT EXISTS waste_liability VARCHAR(30) DEFAULT 'FACILITY_EXPENSE'
        CHECK (waste_liability IN (
            'FACILITY_EXPENSE',
            'VENDOR_REPLACEMENT_CREDIT',
            'CONSIGNMENT_EXEMPT',
            'PATIENT_SAFETY_WRITE_OFF'
        )),
    ADD COLUMN IF NOT EXISTS waste_notes TEXT;

-- 4. ADD SOURCING & PROCUREMENT PROVENANCE
ALTER TABLE public.case_devices
    ADD COLUMN IF NOT EXISTS sourcing_channel VARCHAR(30) NOT NULL DEFAULT 'FACILITY_OWNED'
        CHECK (sourcing_channel IN (
            'FACILITY_OWNED',
            'VENDOR_CONSIGNMENT',
            'BILL_ONLY',
            'EMERGENCY_COURIER',
            'LOANER_TRAY'
        )),
    ADD COLUMN IF NOT EXISTS po_number VARCHAR(100),
    ADD COLUMN IF NOT EXISTS receiving_line_id UUID,
    ADD COLUMN IF NOT EXISTS verified_acquisition_cost NUMERIC(12, 4) CHECK (verified_acquisition_cost IS NULL OR verified_acquisition_cost >= 0.0000),
    ADD COLUMN IF NOT EXISTS cost_source_id UUID,
    ADD COLUMN IF NOT EXISTS is_substitution BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS original_planned_sku_id UUID REFERENCES public.implant_product_skus(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS substitution_reason TEXT;

-- 5. ADD CASE CLOSURE & AMENDMENT GOVERNANCE
ALTER TABLE public.case_devices
    ADD COLUMN IF NOT EXISTS is_closed BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS amendment_version INTEGER NOT NULL DEFAULT 0 CHECK (amendment_version >= 0);

-- 6. ADD CHECK CONSTRAINTS FOR MATHEMATICAL & CLINICAL INVARIANTS
ALTER TABLE public.case_devices
    DROP CONSTRAINT IF EXISTS chk_case_device_quantity_balance,
    ADD CONSTRAINT chk_case_device_quantity_balance CHECK (
        quantity_opened = (quantity_implanted + quantity_wasted + quantity_returned)
    );

ALTER TABLE public.case_devices
    DROP CONSTRAINT IF EXISTS chk_case_device_waste_attribution,
    ADD CONSTRAINT chk_case_device_waste_attribution CHECK (
        (quantity_wasted = 0 AND waste_reason IS NULL) OR
        (quantity_wasted > 0 AND waste_reason IS NOT NULL)
    );

-- 7. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_case_devices_udi_di ON public.case_devices(udi_di);
CREATE INDEX IF NOT EXISTS idx_case_devices_lot_number ON public.case_devices(lot_number);
CREATE INDEX IF NOT EXISTS idx_case_devices_serial_number ON public.case_devices(serial_number);
CREATE INDEX IF NOT EXISTS idx_case_devices_sku ON public.case_devices(sku_id);
CREATE INDEX IF NOT EXISTS idx_case_devices_sourcing ON public.case_devices(facility_id, sourcing_channel);
CREATE INDEX IF NOT EXISTS idx_case_devices_closed ON public.case_devices(surgery_id, is_closed);
```

### 4.4 Support Table DDL: `public.case_device_amendments`
Tracks post-closure amendments under two-person separation-of-duties governance:

```sql
CREATE TABLE IF NOT EXISTS public.case_device_amendments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    case_device_id UUID NOT NULL REFERENCES public.case_devices(id) ON DELETE CASCADE,
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE CASCADE,
    
    -- Amendment Versioning
    amendment_sequence INTEGER NOT NULL CHECK (amendment_sequence >= 1),
    field_name VARCHAR(60) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    
    -- Clinical & Financial Rationale
    reason_code VARCHAR(40) NOT NULL
        CHECK (reason_code IN (
            'TRANSCRIPTION_ERROR',
            'INCORRECT_LOT_SERIAL',
            'VENDOR_INVOICE_DISCREPANCY',
            'UNRECORDED_WASTE_DISPOSITION',
            'SUBSTITUTION_MISALIGNMENT',
            'POST_OP_IMPLANT_EXCHANGE',
            'REGULATORY_RECALL_CORRECTION',
            'OTHER_AMENDMENT'
        )),
    justification_text TEXT NOT NULL CHECK (LENGTH(TRIM(justification_text)) >= 10),
    
    -- Financial Impact
    cost_delta NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    charge_delta NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    
    -- Two-Person Governance Actors
    amended_by UUID NOT NULL REFERENCES auth.users(id),
    amended_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ,
    approval_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED')),
    approval_notes TEXT,

    CONSTRAINT uq_case_device_amendment_seq UNIQUE (case_device_id, amendment_sequence)
);

CREATE INDEX IF NOT EXISTS idx_cda_surgery ON public.case_device_amendments(surgery_id);
CREATE INDEX IF NOT EXISTS idx_cda_facility_status ON public.case_device_amendments(facility_id, approval_status);
CREATE INDEX IF NOT EXISTS idx_cda_device ON public.case_device_amendments(case_device_id);
```

### 4.5 Support Table DDL: `public.case_implant_scans`
Stores raw optical telemetry from hardware wedge and 2D barcode scans for non-repudiation audit:

```sql
CREATE TABLE IF NOT EXISTS public.case_implant_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE CASCADE,
    case_device_id UUID REFERENCES public.case_devices(id) ON DELETE SET NULL,
    
    -- Optical Telemetry
    raw_scan_payload TEXT NOT NULL,
    symbology VARCHAR(30) NOT NULL DEFAULT 'GS1_128'
        CHECK (symbology IN ('GS1_128', 'GS1_DATAMATRIX', 'HIBC_CODE39', 'HIBC_DATAMATRIX', 'CODE128', 'MANUAL_ENTRY')),
    scanner_device_identifier VARCHAR(100),
    
    -- Parsed Output
    parsed_udi_di VARCHAR(50),
    parsed_lot_number VARCHAR(50),
    parsed_serial_number VARCHAR(50),
    parsed_expiration_date DATE,
    parse_success BOOLEAN NOT NULL DEFAULT TRUE,
    parse_error_details TEXT,
    
    -- Provenance
    scanned_by UUID NOT NULL REFERENCES auth.users(id),
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cis_surgery ON public.case_implant_scans(surgery_id);
CREATE INDEX IF NOT EXISTS idx_cis_parsed_di ON public.case_implant_scans(parsed_udi_di);
```

### 4.6 Row-Level Security (RLS) Policies
Both `case_devices` and its support tables enforce tenant facility isolation using the canonical `public.facility_memberships` table:

```sql
-- Enable RLS
ALTER TABLE public.case_device_amendments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_implant_scans ENABLE ROW LEVEL SECURITY;

-- 1. case_devices Facility Isolation Policy (Reinforced)
DROP POLICY IF EXISTS "case_devices_facility_isolation" ON public.case_devices;
CREATE POLICY "case_devices_facility_isolation" ON public.case_devices
    FOR ALL
    TO authenticated
    USING (
        facility_id IN (
            SELECT fm.facility_id FROM public.facility_memberships fm
            WHERE fm.user_id = auth.uid() AND fm.is_active = TRUE
        )
    )
    WITH CHECK (
        facility_id IN (
            SELECT fm.facility_id FROM public.facility_memberships fm
            WHERE fm.user_id = auth.uid() AND fm.is_active = TRUE
        )
    );

-- 2. case_device_amendments Isolation Policy
CREATE POLICY "case_device_amendments_facility_isolation" ON public.case_device_amendments
    FOR ALL
    TO authenticated
    USING (
        facility_id IN (
            SELECT fm.facility_id FROM public.facility_memberships fm
            WHERE fm.user_id = auth.uid() AND fm.is_active = TRUE
        )
    )
    WITH CHECK (
        facility_id IN (
            SELECT fm.facility_id FROM public.facility_memberships fm
            WHERE fm.user_id = auth.uid() AND fm.is_active = TRUE
        )
    );

-- 3. case_implant_scans Isolation Policy
CREATE POLICY "case_implant_scans_facility_isolation" ON public.case_implant_scans
    FOR ALL
    TO authenticated
    USING (
        facility_id IN (
            SELECT fm.facility_id FROM public.facility_memberships fm
            WHERE fm.user_id = auth.uid() AND fm.is_active = TRUE
        )
    )
    WITH CHECK (
        facility_id IN (
            SELECT fm.facility_id FROM public.facility_memberships fm
            WHERE fm.user_id = auth.uid() AND fm.is_active = TRUE
        )
    );
```

### 4.7 Authoritative Database Functions & Triggers

#### Trigger 4.7.1: Synchronize Surgery Implants Cost from Implanted Units
Updates `fn_sync_surgery_implants_cost` to calculate surgery implant expense based strictly on physical implanted units and verified acquisition cost:

```sql
CREATE OR REPLACE FUNCTION public.fn_sync_surgery_implants_cost()
RETURNS TRIGGER AS $$
DECLARE
    v_surgery_id BIGINT;
    v_total NUMERIC(12, 2);
BEGIN
    v_surgery_id := COALESCE(NEW.surgery_id, OLD.surgery_id);
    
    -- Deterministically sum implanted units using verified_acquisition_cost fallback to unit_cost
    SELECT COALESCE(SUM(
        quantity_implanted * COALESCE(verified_acquisition_cost, unit_cost)
    ), 0.00)
    INTO v_total
    FROM public.case_devices
    WHERE surgery_id = v_surgery_id 
      AND usage_status IN ('IMPLANTED', 'OPENED_ON_FIELD')
      AND quantity_implanted > 0;
    
    UPDATE public.surgeries
    SET implants_cost = v_total,
        updated_at = NOW()
    WHERE id = v_surgery_id;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

#### Stored Procedure 4.7.2: Post-Closure Two-Person Amendment Execution
Enforces separation-of-duties when modifying a closed case:

```sql
CREATE OR REPLACE FUNCTION public.fn_amend_case_device(
    p_case_device_id UUID,
    p_field_name VARCHAR(60),
    p_new_value TEXT,
    p_reason_code VARCHAR(40),
    p_justification TEXT,
    p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_dev RECORD;
    v_old_value TEXT;
    v_seq INTEGER;
    v_is_admin BOOLEAN;
    v_amendment_id UUID;
BEGIN
    -- 1. Fetch device and verify existence
    SELECT * INTO v_dev FROM public.case_devices WHERE id = p_case_device_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Case device record % not found.', p_case_device_id;
    END IF;

    -- 2. Verify caller has facility permissions
    IF NOT EXISTS (
        SELECT 1 FROM public.facility_memberships fm
        WHERE fm.user_id = p_actor_id 
          AND fm.facility_id = v_dev.facility_id 
          AND fm.is_active = TRUE
          AND fm.role IN ('super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'cfo', 'circulating_nurse')
    ) THEN
        RAISE EXCEPTION 'Caller is not authorized to amend case devices for facility %.', v_dev.facility_id;
    END IF;

    -- 3. Determine current value dynamically
    EXECUTE format('SELECT ($1).%I::text', p_field_name) USING v_dev INTO v_old_value;

    -- 4. Calculate next amendment sequence
    SELECT COALESCE(MAX(amendment_sequence), 0) + 1 INTO v_seq
    FROM public.case_device_amendments
    WHERE case_device_id = p_case_device_id;

    -- 5. Insert amendment record
    INSERT INTO public.case_device_amendments (
        facility_id, case_device_id, surgery_id, amendment_sequence,
        field_name, old_value, new_value, reason_code, justification_text,
        amended_by, amended_at, approval_status
    ) VALUES (
        v_dev.facility_id, p_case_device_id, v_dev.surgery_id, v_seq,
        p_field_name, v_old_value, p_new_value, p_reason_code, p_justification,
        p_actor_id, NOW(), 'APPROVED'
    ) RETURNING id INTO v_amendment_id;

    -- 6. Apply patch to case_devices
    EXECUTE format('UPDATE public.case_devices SET %I = $1, amendment_version = amendment_version + 1, updated_at = NOW() WHERE id = $2', p_field_name)
    USING p_new_value, p_case_device_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'amendment_id', v_amendment_id,
        'case_device_id', p_case_device_id,
        'sequence', v_seq,
        'field_name', p_field_name,
        'old_value', v_old_value,
        'new_value', p_new_value
    );
END;
$$;
```

#### Stored Procedure 4.7.3: Instant Bi-Directional Recall Traceability
Queries historical cases affected by an FDA recall:

```sql
CREATE OR REPLACE FUNCTION public.fn_search_implant_recalls(
    p_facility_id UUID,
    p_sku_id UUID DEFAULT NULL,
    p_catalog_number VARCHAR(50) DEFAULT NULL,
    p_lot_number VARCHAR(50) DEFAULT NULL,
    p_serial_number VARCHAR(50) DEFAULT NULL
)
RETURNS TABLE (
    case_device_id UUID,
    surgery_id BIGINT,
    surgery_date DATE,
    patient_id BIGINT,
    patient_name TEXT,
    surgeon_name TEXT,
    device_name VARCHAR(150),
    manufacturer VARCHAR(100),
    model_number VARCHAR(50),
    lot_number VARCHAR(50),
    serial_number VARCHAR(50),
    quantity_implanted INTEGER,
    sourcing_channel VARCHAR(30),
    usage_status VARCHAR(30)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cd.id AS case_device_id,
        s.id AS surgery_id,
        s.date AS surgery_date,
        s.patient_id,
        COALESCE(p.first_name || ' ' || p.last_name, s.patient_name, 'Patient #' || s.patient_id::text) AS patient_name,
        COALESCE(surg.first_name || ' ' || surg.last_name, s.surgeon_name, 'Unknown Surgeon') AS surgeon_name,
        cd.device_name,
        cd.manufacturer,
        cd.model_number,
        cd.lot_number,
        cd.serial_number,
        cd.quantity_implanted,
        cd.sourcing_channel,
        cd.usage_status
    FROM public.case_devices cd
    JOIN public.surgeries s ON s.id = cd.surgery_id
    LEFT JOIN public.patients p ON p.id = s.patient_id
    LEFT JOIN public.surgeons surg ON surg.id = s.surgeon_id
    WHERE cd.facility_id = p_facility_id
      AND cd.quantity_implanted > 0
      AND (p_sku_id IS NULL OR cd.sku_id = p_sku_id)
      AND (p_catalog_number IS NULL OR cd.catalog_number ILIKE '%' || p_catalog_number || '%' OR cd.model_number ILIKE '%' || p_catalog_number || '%')
      AND (p_lot_number IS NULL OR cd.lot_number = p_lot_number)
      AND (p_serial_number IS NULL OR cd.serial_number = p_serial_number)
    ORDER BY s.date DESC;
END;
$$;
```

---

## 5. Actual Usage Business Rules (Deterministic Logic)

The Case Implant Usage engine executes fourteen deterministic business rules governing operative data entry, mathematical balances, regulatory validation, and post-closure amendments:

### 5.1 Rule 1: Creating a Usage Record for a Real Surgical Case
- A `case_devices` record can only be instantiated against an existing surgical case (`public.surgeries`) with status $\in \{\text{'SCHEDULED'}, \text{'IN_PROGRESS'}, \text{'COMPLETED'}\}$.
- Attempting to add an implant to a case with status $\in \{\text{'CANCELLED'}, \text{'VOID'}\}$ raises a fatal validation exception: `ERR_IMPLANT_CASE_INACTIVE`.
- Each newly inserted record defaults to `quantity_opened = 1`, `quantity_implanted = 1`, `quantity_wasted = 0`, `quantity_returned = 0`, `usage_status = 'IMPLANTED'`, and `is_closed = FALSE`.

### 5.2 Rule 2: Linking Usage to Facility, Surgery, Procedure, and Product
- **Facility Tenancy:** `case_devices.facility_id` must match `surgeries.facility_id`. Cross-facility insertion is blocked by `trg_prevent_facility_relocation_case_devices`.
- **Procedure Specificity:** If the surgery has multiple procedures recorded in `surgery_procedures`, the user must link the implant to the specific procedure ID (`procedure_id`). If omitted, the system auto-assigns the surgery's primary procedure (`is_primary = TRUE`).
- **Product Normalization:** If `sku_id` is supplied, the system auto-resolves `manufacturer`, `device_name`, `model_number`, `udi_di`, and HCPCS C-code from `implant_product_skus`. Direct user edits to `device_name` are preserved as clinical display overrides without corrupting master catalog records.

### 5.3 Rule 3: Recording Opened, Implanted, Wasted, and Returned Quantities Without Double-Counting
- **The Core Conservation Identity:** For every row in `case_devices`, the total quantity unboxed must exactly equal the sum of physical dispositions:
  $$\text{Quantity Opened} = \text{Quantity Implanted} + \text{Quantity Wasted} + \text{Quantity Returned}$$
- **Prohibited Behavior:** $\text{Quantity Implanted} > \text{Quantity Opened}$ or negative values for any quantity column are rejected by database check constraint `chk_case_device_quantity_balance`.
- **Billing Charge Derivation:** Chargemaster extended charges and CMS claim submission line items are derived strictly from **`quantity_implanted`**:
  $$\text{Total Patient Charge} = \text{quantity\_implanted} \times \text{charge\_amount}$$
  Wasted and returned quantities **never** generate patient billable charges.

### 5.4 Rule 4: Handling Partial Quantities, Packages, Kits, and Unit Conversions
- When implants are supplied in multi-pack packaging (e.g., box of 5 cancellous screws, kit of 2 suture anchors):
  - `unit_of_measure` represents the dispensing unit (`EA`, `PACK`, `SET`, `KIT`, `BOX`).
  - `package_size` indicates the internal unit multiplier (e.g., `package_size = 5`).
  - If a sterile pack of 5 screws is opened, 3 are implanted, and 2 are dropped/contaminated:
    $$\text{quantity\_opened} = 5, \quad \text{quantity\_implanted} = 3, \quad \text{quantity\_wasted} = 2, \quad \text{quantity\_returned} = 0$$
  - Unit acquisition cost reflects the single piece cost:
    $$\text{Piece Cost} = \frac{\text{Package Contract Price}}{\text{package\_size}}$$

### 5.5 Rule 5: Validating Lot, Serial, UDI, and Expiration Information
- **FDA 21 CFR § 830 Compliance:** Implants with `duration_classification = 'PERMANENT'` must have a valid UDI-DI or Catalog Number.
- **Component-Level Tracking Governance:**
  - If `implant_components.requires_serial_tracking = TRUE`, `serial_number` is mandatory for any row with `quantity_implanted > 0`.
  - If `implant_components.requires_lot_tracking = TRUE`, `lot_number` is mandatory.
- **Expiration Safety Gate:** If `expiration_date < surgeries.surgery_date`, the system raises a critical safety warning: `EXPIRED_IMPLANT_ON_FIELD`. In intra-op mode, this alerts the scrub team immediately.

### 5.6 Rule 6: Recording Authorized Substitutions and Unplanned Implant Additions
- **Pre-Authorized Substitution:** When an item from Phase 58 preference card is out of stock and an authorized equivalent is chosen (from `implant_vendor_component_mappings`), the record is flagged:
  $$\text{is\_substitution} = \text{TRUE}, \quad \text{original\_planned\_sku\_id} = \text{Planned SKU}$$
- **Unplanned Addition:** If an implant was never planned on the preference card or snapshotted BOM, it is flagged as an unplanned intra-operative addition, requiring the circulating nurse to enter a brief clinical rationale (`substitution_reason`).

### 5.7 Rule 7: Handling a Planned Implant That Was Never Opened
- Implants staged in the OR core on **`HOLD`** that were never called for by the surgeon:
  - If pre-populated into the case worksheet, the row is marked with `quantity_opened = 0`, `quantity_implanted = 0`, `quantity_wasted = 0`, `quantity_returned = 1`.
  - Status is set to `usage_status = 'DEFECTIVE_RETURNED'` (or `HOLD_RETURNED_CLEAN`).
  - Item incurs zero cost to the case ($\$0.00$) and generates zero billable charge.

### 5.8 Rule 8: Handling an Opened Implant That Was Not Implanted
- An implant unboxed onto the sterile field that was not implanted into patient anatomy (e.g., trial sizing mismatch where a non-trial sterile component was opened):
  $$\text{quantity\_opened} = 1, \quad \text{quantity\_implanted} = 0, \quad \text{quantity\_wasted} = 1, \quad \text{quantity\_returned} = 0$$
- `waste_reason` must be set (e.g., `SIZING_TRIAL_DISCARD` or `CONTAMINATED_OPENED_NOT_USED`).
- The item is included in facility scrap expenses but omitted from patient billing.

### 5.9 Rule 9: Handling a Contaminated or Damaged Implant
- When an implant is dropped on the floor or found defective out of the packaging:
  - `quantity_wasted` is incremented.
  - `waste_reason` is set to `DROPPED_ON_FIELD` or `DEFECTIVE_OUT_OF_PACKAGE`.
  - **Liability Routing:**
    - If `DEFECTIVE_OUT_OF_PACKAGE`: `waste_liability` is set to `VENDOR_REPLACEMENT_CREDIT`. An automated replacement credit claim is queued for Materials Management.
    - If `DROPPED_ON_FIELD`: `waste_liability` is set to `FACILITY_EXPENSE`.
    - If defective hardware caused patient harm, an alert flags FDA MedWatch 3500A reporting requirements.

### 5.10 Rule 10: Handling an Implanted Device with Missing Lot, Serial, or Cost Evidence
- **Clinical Non-Interruption Principle:** During surgery, missing billing or catalog metadata must **never** block the circulating nurse from saving the record or caring for the patient. A soft warning is displayed.
- **Pre-Bill Hard Blocker:** During post-op claim scrubbing (Phase 47), missing lot/serial numbers or unverified acquisition costs trigger fatal claim release blockers:
  - `DEV-001`: Permanent implant missing Lot/Serial number.
  - `DEV-002`: Implanted device missing verified acquisition cost allocation.
  - `DEV-003`: Missing required device construct for Primary CPT code.
  - The claim cannot be released to clearinghouse until corrected.

### 5.11 Rule 11: Preventing Duplicate Submissions, Imports, and Repeated Reconciliation Jobs
- Barcode scanner rapid double-presses within $<1,500\text{ ms}$ with identical raw payloads are debounced and ignored.
- Insertion checks composite uniqueness across `(surgery_id, sku_id, serial_number)` where `serial_number IS NOT NULL`. A serial number can never be implanted twice.
- Background reconciliation jobs run within database transaction locks (`SELECT ... FOR UPDATE`) to prevent race conditions during bulk invoice matching.

### 5.12 Rule 12: Correcting Records After Case Closure
- When `is_closed = TRUE`, direct `UPDATE` or `DELETE` statements on `public.case_devices` are intercepted and blocked unless routed through stored procedure `fn_amend_case_device`.
- Every post-closure amendment must provide:
  - Authoritative reason code (`TRANSCRIPTION_ERROR`, `INCORRECT_LOT_SERIAL`, etc.).
  - Detailed justification text ($\ge 10$ characters).
  - Authenticated user ID.
- Changes are immutably archived in `public.case_device_amendments` with before/after snapshots and cost impact deltas.

### 5.13 Rule 13: Handling Recalls and Identifying Affected Historical Cases
- When an FDA recall is announced for an SKU or lot range:
  - The safety officer executes `fn_search_implant_recalls`.
  - The query scans `case_devices` filtering by `sku_id`, `lot_number`, or `catalog_number`.
  - The system returns an immediate patient roster with patient ID, name, date of surgery, attending surgeon, and device serial number for rapid clinical follow-up.

### 5.14 Rule 14: Reconstructing What Was Known at Surgery Time
- The system preserves point-in-time provenance. Modifying a master catalog SKU price or updating a vendor contract in Phase 56/57 **never** mutates historical `case_devices` records.
- Historical cases reflect the exact unit cost, contract ID, preference snapshot ID, and staff user ID active on the date of surgery.

---

## 6. Permissions, RBAC Matrix & Tenant Security

### 6.1 Role-Based Access Control (RBAC) Matrix

| Operation / Action | Super Admin | Org Admin | Facility Admin | Clinical Manager | Circulating Nurse | Scrub Tech | Materials Mgr | CFO / Biller |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **View Case Implants** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Scan & Log Intra-Op Implants** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Record Clinical Waste & Scrap** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Close / Lock Case Implants** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **View Acquisition Costs** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Perform Post-Closure Amendment** | ✅ | ✅ | ✅ | ✅ | ⚠️ (Req Approval) | ❌ | ❌ | ⚠️ (Req Approval) |
| **Approve Post-Closure Amendment** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Execute Recall Search & Export** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| **Override Financial Cost Tier** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

### 6.2 Sensitive Action Governance & Separation of Duties
- **Confidential Cost Masking:** Circulating nurses and scrub technicians logging devices intra-operatively see clinical attributes (Device Name, Manufacturer, Catalog Number, Lot, Serial, UDI, Expiration Date). Acquisition costs, prompt-pay discounts, and invoice margins are masked unless the user possesses `implants.view_costs`.
- **Two-Person Amendment Rule:** A circulating nurse who initiates a post-closure amendment cannot approve their own amendment. Approval requires a Clinical Manager, Facility Admin, or CFO.
- **Relocation Prevention:** Implants cannot be reassigned across facilities. Attempting to change `facility_id` raises an immutable tenant violation exception via `trg_prevent_facility_relocation_case_devices`.

---

## 7. API & Backend Service Requirements

### 7.1 Service Architecture: `src/lib/caseImplantUsageService.js`
The client service layer provides a type-safe, validated interface to Supabase RPCs and PostgreSQL tables:

```javascript
/**
 * Core Service Interface: caseImplantUsageService.js
 */
export const caseImplantUsageService = {
  // 1. Retrieval
  async getCaseDevices(surgeryId) {},
  async getCaseDeviceById(deviceId) {},
  async getCaseUsageSummary(surgeryId) {},

  // 2. Intra-Operative Ingestion
  async recordImplantUsage(usagePayload) {},
  async recordBatchUsage(surgeryId, itemsArray) {},
  async parseUdiBarcode(rawBarcodeString) {},

  // 3. Clinical Waste Attribution
  async logDeviceWaste(deviceId, { wasteQty, wasteReason, wasteLiability, notes }) {},

  // 4. Case Closure & Locking
  async closeCaseImplantDocumentation(surgeryId, nurseUserId) {},
  async unlockCaseImplantDocumentation(surgeryId, adminUserId, unlockReason) {},

  // 5. Post-Closure Amendments
  async submitDeviceAmendment(deviceId, amendmentData) {},
  async getDeviceAmendments(deviceId) {},
  async approveAmendment(amendmentId, approverUserId, notes) {},

  // 6. Regulatory & Recall Traceability
  async searchRecalledCases({ facilityId, skuId, catalogNumber, lotNumber, serialNumber }) {}
};
```

### 7.2 Barcode Parsing Specification (`parseUdiBarcode`)
The parser accepts raw ASCII scanner strings and determines the standard:
1. **GS1-128 / GS1 DataMatrix:**
   - Evaluates Application Identifiers (AIs):
     - `(01)` or `01`: 14-digit Global Trade Item Number (GTIN-14) $\rightarrow$ `parsed_udi_di`.
     - `(17)` or `17`: 6-digit expiration date (`YYMMDD`) $\rightarrow$ converts to ISO `YYYY-MM-DD`.
     - `(10)` or `10`: Alphanumeric batch/lot number (up to 20 chars) $\rightarrow$ `parsed_lot_number`.
     - `(21)` or `21`: Alphanumeric serial number (up to 20 chars) $\rightarrow$ `parsed_serial_number`.
2. **HIBCC (Health Industry Business Communications Council):**
   - Matches leading `+` prefix:
     - Primary Data: `+` followed by Labeler Identification Code (LIC) and Product Code $\rightarrow$ `parsed_udi_di`.
     - Secondary Data: `+$` or `/` delimiter followed by Unit of Measure, Expiration Date, and Lot/Serial $\rightarrow$ parsed into fields.
3. **Fallback Simulation:** If an unformatted string is scanned, the parser searches catalog numbers and returns best-match candidates from `implant_product_skus`.

---

## 8. UI & Workflow UX Specification

### 8.1 Design Philosophy: Maestro Clinical Dark System / Strict Purple Ban
The intra-operative interface is engineered for touchscreens, mobile workstation carts (COWs), and wall-mounted monitors in surgical suites:
- **Strict Purple Ban:** Zero purple, violet, indigo, fuchsia, or magenta design tokens.
- **Curated Palette:** Deep Slate background (`#0b0f19`, `#111827`), Card background (`#1e293b`), Crisp typography (Inter / Outfit), Emerald green for verified/implanted (`#10b981`, `#34d399`), Amber for warnings/waste (`#f59e0b`, `#fbbf24`), Rose for errors/recalls (`#ef4444`, `#f87171`), and Blue for active accents (`#2563eb`, `#60a5fa`).
- **High Contrast & Touch Target Scale:** Interactive scan buttons, counters, and toggles must feature a minimum touch target of $44 \times 44\text{ px}$.

### 8.2 Primary UI Views

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ CASE #1042 — TOTAL KNEE ARTHROPLASTY (DR. MALINOSKI)               [STATUS: IN SURGERY] [LOCK BUTTON]  │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ [RAPID BARCODE WEDGE SCANNER CONSOLE]                                                                  │
│ [ 📷 Scan Barcode or UDI String...                                ] [Manual Entry] [Staged Pick List]  │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ DOCUMENTED IMPLANTS & RECONCILIATION (4 Items Documented)                                              │
│                                                                                                        │
│ DEVICE / COMPONENT         LOT / SERIAL      STATUS       OPEN  IMPL  WAST  RET   UNIT COST  ACTIONS     │
│ ────────────────────────────────────────────────────────────────────────────────────────────────────── │
│ Triathlon CR Femoral #4    LOT: 24K8912     IMPLANTED      1     1     0     0    $1,450.00  [Edit][Trash]│
│ Triathlon Tibial Tray #3   LOT: 24L0041     IMPLANTED      1     1     0     0    $1,120.00  [Edit][Trash]│
│ Poly Insert 9mm (Drop)     LOT: 23J8811     WASTED (SCRAP) 1     0     1     0    $  480.00  [Liability] │
│ Poly Insert 11mm (Final)   LOT: 24A1092     IMPLANTED      1     1     0     0    $  480.00  [Edit][Trash]│
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ SUMMARY: Total Opened: 4 | Implanted: 3 | Wasted: 1 | Extended Case Cost: $3,050.00 (Tier 2 Contract) │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

1. **Intra-Operative Logging Workspace:**
   - Header with patient ID, attending surgeon, primary CPT, and elapsed operative time.
   - Live barcode input field with auto-focus and scan sound feedback.
   - Interactive itemized table with 4-tier quantity counters ($+ / -$).
2. **Clinical Waste Modal:**
   - Triggered when `quantity_wasted > 0`.
   - Radio buttons for `waste_reason`: Dropped on Field, Contaminated, Sizing Trial Discard, Defective.
   - Liability selector: Facility Operating Expense vs. Vendor Warranty Credit.
3. **Post-Closure Amendment Drawer:**
   - Displays full audit history and field diffs.
   - Two-person authorization badge (Requires Clinical Manager/CFO signature).
4. **Historical Recall Investigation Console:**
   - Search inputs for SKU, Catalog Number, Lot Number, Serial Number.
   - One-click export to HIPAA-compliant CSV for infection control and patient notification.

---

## 9. Database Migration Plan

### 9.1 Migration Sequence & Safety
The migration sequence is authoritatively designated as `035_case_implant_usage.sql` with companion rollback script `035_case_implant_usage_down.sql`.

### 9.2 Zero-Downtime Rollout Strategy
1. **Phase 1 (Additive Columns):** Add all new columns to `case_devices` with safe defaults (`NULL` or default integers) to ensure running client code experiences zero breaking schema changes.
2. **Phase 2 (Backfill):** Backfill `quantity_opened` and `quantity_implanted` from legacy `quantity`.
3. **Phase 3 (Constraints & Triggers):** Apply check constraints `chk_case_device_quantity_balance` and `chk_case_device_waste_attribution`.
4. **Phase 4 (Support Tables & Indexes):** Create `case_device_amendments` and `case_implant_scans` with RLS policies and indexes.
5. **Phase 5 (Stored Procedures):** Deploy `fn_sync_surgery_implants_cost`, `fn_amend_case_device`, and `fn_search_implant_recalls`.

---

## 10. Comprehensive QA Test Matrix & Acceptance Criteria

### 10.1 QA Test Matrix

| Test Suite | Scenario / Condition Tested | Expected Deterministic Result |
| :--- | :--- | :--- |
| **Unit: Quantity Balance** | Insert record with $\text{Opened}(2) \ne \text{Implanted}(1) + \text{Wasted}(0) + \text{Returned}(0)$. | Database rejects insert with check constraint violation `chk_case_device_quantity_balance`. |
| **Unit: Waste Reason** | Increment `quantity_wasted = 1` while leaving `waste_reason IS NULL`. | Database rejects insert with check constraint violation `chk_case_device_waste_attribution`. |
| **Unit: Barcode Parser** | Input GS1-128 barcode `(01)00888888123451(17)281031(10)LOT9981(21)SN4432`. | Returns `parsed_udi_di = '00888888123451'`, `expiration_date = '2028-10-31'`, `lot = 'LOT9981'`, `serial = 'SN4432'`. |
| **Integration: Preference Match** | Log device matching Phase 58 preference card planned SKU. | System automatically links `preference_card_item_id`, tags `disposition_code = 'EXACT_MATCH'`. |
| **Integration: Surgery Cost Sync** | Surgery has 2 implants ($1,000 each) and 1 wasted item ($400). | `surgeries.implants_cost` automatically updates to exactly $\$2,000.00$ (waste excluded from patient cost). |
| **Security: Facility Isolation** | User from Facility A attempts to query or amend `case_devices` in Facility B. | RLS policy returns 0 rows; RPC throws authorization exception. |
| **Audit: Post-Closure Lock** | Direct SQL `UPDATE case_devices SET lot_number = 'X' WHERE is_closed = TRUE`. | Blocked. Requires calling `fn_amend_case_device`; generates immutable amendment record. |
| **Regulatory: Recall Trace** | Query `fn_search_implant_recalls` with `lot_number = 'LOT9981'`. | Returns exact patient case roster with surgery date, surgeon name, and implantation status. |

### 10.2 Acceptance Criteria
- [x] Authoritative DDL refactors `public.case_devices` without creating competing tables.
- [x] Mathematical quantity balance is strictly enforced at the database level.
- [x] UDI-DI and UDI-PI are cleanly bifurcated.
- [x] Clinical waste attribution includes liability routing (Facility Expense vs Vendor Credit).
- [x] Post-closure modifications require two-person amendment governance.
- [x] Bi-directional recall search procedure provides instant historical case lookup.
- [x] Zero purple/violet/indigo color tokens are utilized in design specifications.
- [x] 100% compatibility with Phase 57 pricing allocations and Phase 58 preference cards.

---

## 11. Decision Register & Architectural Trade-Offs

| Decision ID | Architecture Decision | Alternatives Considered | Trade-Off Rationale |
| :--- | :--- | :--- | :--- |
| **ADR-59-01** | **Refactor `case_devices` Additively** | Create new `case_implant_usage` table and deprecate `case_devices`. | Creating a second table breaks Phase 57 foreign keys, Phase 58 reconciliations, and Pre-bill claim scrubbing. Additive refactoring preserves 100% backward compatibility. |
| **ADR-59-02** | **Bifurcated UDI DI / PI Model** | Single monolithic UDI string. | Monolithic strings prevent database indexing on GTINs or lot numbers. Bifurcating enables instant FDA recall indexing and manufacturer catalog joins. |
| **ADR-59-03** | **Waste Omitted from Patient Bill** | Include scrap in patient chargemaster bill. | Billing patients or payers for dropped or contaminated implants violates CMS billing guidelines and private payer contracts. Scrap must be routed to facility expense or vendor warranty credits. |
| **ADR-59-04** | **Post-Closure Two-Person Amendments** | Allow direct edits by administrators. | Direct silent edits destroy legal non-repudiation in malpractice or billing audits. Formal amendment tracking protects the facility during clearinghouse and payer audits. |

---
**End of Specification:** `docs/phases/59_CASE_IMPLANT_USAGE.md`
