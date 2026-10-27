# Phase 55: Vendor-to-Implant Component Mapping — Implementation Plan

> **Phase:** 55  
> **Module:** Implant Intelligence (Phase 05 Suite)  
> **Target Schema:** `030_implant_vendor_component_mapping.sql`  
> **Status:** IN IMPLEMENTATION  
> **Branch:** `feature/phase-50-implant-intelligence`  

---

## 1. Objectives & Overview
Implement the complete, production-ready **Vendor-to-Implant Component Mapping** module. This establishes the commercial-to-clinical capability matrix connecting medical device manufacturers (`public.implant_vendors`) and clinical components (`public.implant_components`), governing facility sourcing preferences (`PREFERRED`, `STANDARD`, `SECONDARY`, `NON_PREFERRED`, `RESTRICTED`), distributor consignment logistics, and temporal validity boundaries.

---

## 2. Deliverables Checklist

### Step 1: Authoritative Database Migrations
- [ ] Create `supabase/migrations/030_implant_vendor_component_mapping.sql`
  - Table: `public.implant_vendor_component_mappings`
  - Columns: `facility_id`, `vendor_id`, `component_id`, `preference_tier`, `sourcing_model`, `authorized_distributor_id`, `contract_reference_number`, `lead_time_days`, `consignment_stock_maintained`, `effective_date`, `termination_date`, `status`, `is_active`, `approval_status`, `approved_by`, `approved_at`, `rejection_reason`, `clinical_notes`, `governance_rationale`, `source_system`, audit columns.
  - Constraints: Date boundary check, status-active sync, distributor role check.
  - Unique Index: `uq_vendor_component_facility_mapping` on `(vendor_id, component_id, facility_id) NULLS NOT DISTINCT`.
  - Triggers: `trg_touch_implant_vendor_component_mappings`, `trg_prevent_active_mapping_delete`, `trg_prevent_facility_relocation_implant_mappings`, audit trigger.
  - Authoritative Stored Procedures: `fn_upsert_vendor_component_mapping`, `fn_deactivate_vendor_component_mapping`, `fn_reactivate_vendor_component_mapping`, `fn_change_mapping_preference_tier`.
  - RLS Policies: Multi-facility tenant isolation and global baseline visibility.
  - Seed Data: Global baseline capabilities across major OEMs (Stryker, Zimmer Biomet, Medtronic, Alcon, Arthrex) and components.
- [ ] Create `supabase/migrations/030_implant_vendor_component_mapping_down.sql`
  - Safe reverse-order transactional drop script.

### Step 2: Client Service Layer
- [ ] Create `src/lib/vendorComponentService.js`
  - Enums: `PREFERENCE_TIERS`, `SOURCING_MODELS`, `MAPPING_STATUSES`, `APPROVAL_STATUSES`.
  - In-memory baseline mocks for test/offline resilience.
  - Queries with multi-tier resolution (Facility Custom Overrides > Global Industry Baselines).
  - Validation rules for vendor eligibility and date ranges.
  - Mutation methods: `saveMapping`, `updatePreferenceTier`, `terminateMapping`, `reactivateMapping`.
  - Eligibility engine: `validateVendorComponentEligibility`.
  - Integration with `db` singleton.

### Step 3: Master UI Component & Styling
- [ ] Create `src/components/VendorComponentMappingMatrix.css`
  - Clinical dark mode theme with slate, deep blue, emerald, and amber tokens.
  - Zero purple/violet/magenta/fuchsia hex codes or keywords (**Strict Purple Ban**).
- [ ] Create `src/components/VendorComponentMappingMatrix.jsx`
  - Summary KPI Stat Cards (Total Mappings, Active Sources, Preferred, Restricted, Mapped OEMs).
  - Dual View Modes: Interactive 2D Matrix Grid View + Detailed Tabular Ledger View.
  - Search & Filters (Specialty, Vendor, Component, Preference Tier, Global vs. Facility scope).
  - Add / Edit Mapping Modal with distributor cross-link and validation.
  - Quick Preference Tier Change Modal with mandatory governance rationale.
  - Row actions for Edit, Change Tier, Terminate, Reactivate.

### Step 4: Application Integration
- [ ] Update `src/App.jsx`
  - Import `VendorComponentMappingMatrix`.
  - Add "Supplier Matrix" navigation item under `CLINICAL` menu with `Layers` icon.
  - Add header subtitle description for `activeTab === 'vendor_component_mappings'`.
  - Mount `<VendorComponentMappingMatrix activeFacility={activeFacility} ... />` in main tab router.

### Step 5: Automated Test Suite & Verification
- [ ] Create `tests/vendor-to-implant-component-mapping.test.js`
  - Suite 1: Database Migration 030 DDL, Schema Integrity, Constraints, Triggers, Down migration.
  - Suite 2: Client Service Layer, Hierarchy Resolution, Date Boundaries, Validation, DB Singleton bindings.
  - Suite 3: UI Component, Strict Purple Ban, App.jsx routing integration.
- [ ] Execute `node --test tests/vendor-to-implant-component-mapping.test.js`.
- [ ] Execute regression test suite across all implant modules.
- [ ] Verify production bundle with `npm run build`.
