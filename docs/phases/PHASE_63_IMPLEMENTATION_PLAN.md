# PHASE 63 — IMPLEMENTATION PLAN
## Step-by-Step 7-Stage Execution Roadmap for Post-Approval Development

**Product:** ASCANALYST Financial & Clinical Operations Platform  
**Phase:** 63 — Device-Intensive Payment Rules & Packaging Logic  
**Status:** READY FOR STAGED IMPLEMENTATION UPON APPROVAL  

---

## Stage 1: Database Migration 039 (DDL, Constraints & RLS)
- **Forward Migration File:** `supabase/migrations/039_device_intensive_payment_rules.sql`
- **Down Migration File:** `supabase/migrations/039_device_intensive_payment_rules_down.sql`
- **Actions:**
  1. Create `public.cms_device_categories` with C-code directory.
  2. Create `public.cms_device_intensive_procedures` with empirical device offset percentages.
  3. Create `public.cpt_device_category_crosswalk` linking surgical CPTs to required C-codes.
  4. Create `public.medicare_device_calculation_ledgers` for line-item audit reconciliation.
  5. Enable RLS on all 4 tables with dual-resolution policies (using `is_facility_accessible` and `user_has_facility_role`; **never querying `public.user_roles`**).
  6. Deploy immutability triggers on calculation ledgers.

---

## Stage 2: CMS Reference Data Ingestion
- **Source:** CMS-1823-FC Addendum AA & CMS Device-to-Procedure Edits Table.
- **Actions:**
  1. Ingest official CY 2026 empirical device offset percentages for all ~600+ J8 procedures.
  2. Populate Level II C-code directory (`C1776`, `C1767`, `C1785`, `C1882`, `C2617`, `C1713`, `L8699`).
  3. Seed CPT-to-device crosswalk with mandatory validation flags.
  4. Verify checksum against CMS publication.

---

## Stage 3: Stored Procedures & Engine Upgrade
- **Actions:**
  1. Deploy `public.fn_resolve_device_intensive_offset(p_cpt_code, p_dos)`.
  2. Upgrade `public.fn_resolve_medicare_base_rate` to dynamically call `fn_resolve_device_intensive_offset` instead of flat 35%.
  3. Upgrade pre-bill validation rule `SCRUB-21` in `public.fn_scrub_claim_lines` to enforce specific C-code category matching.
  4. Deploy `public.fn_reconcile_device_margin(p_surgery_id)` calculating CMS offset allowance versus vendor invoice costs.

---

## Stage 4: Client Service Layer
- **File:** `src/lib/medicareDeviceService.js`
- **Actions:**
  1. Export domain constants (`CMS_DEVICE_CATEGORIES`, `DEFAULT_DEVICE_OFFSETS`).
  2. Implement `getDeviceIntensiveProcedures(filters, pagination)`.
  3. Implement `getDeviceCategoryCrosswalk(cptCode)`.
  4. Implement `getDeviceMarginReconciliation(surgeryId)`.
  5. Bind methods onto `db` singleton in `src/lib/supabase.js`.
  6. Remediate gross chargemaster fallback in `src/utils/hospitalUtils.js`.

---

## Stage 5: User Interface Integration
- **Components:**
  - New tab in `MedicareRateExplorer.jsx`: **Device-Intensive Rules & C-Code Crosswalk**.
  - Interactive Device Offset Margin Calculator.
  - Pre-bill claim scrubbing alert drawer integration.
- **Maestro Design Compliance:**
  - Strict compliance with the **Maestro Purple Ban** (zero `#7c3aed`, `#8b5cf6`, `purple`, `violet`, `indigo` tokens).
  - High-contrast clinical slate palette (`#0f172a`, `#2563eb`, `#059669`, `#dc2626`).

---

## Stage 6: Security & Granular RBAC Permissions
- **File:** `src/lib/rbacService.js`
- **Actions:**
  1. Register 8 new Phase 63 permissions in `PERMISSIONS_CATALOG.device_intensive`:
     - `device.view_offsets`
     - `device.view_categories`
     - `device.view_crosswalk`
     - `device.edit_crosswalk`
     - `device.view_margin_ledger`
     - `device.override_offset`
     - `device.audit_reconciliation`
     - `device.export_data`
  2. Map permissions to canonical roles (Super Admin, Org Admin, Facility Admin, CFO, Biller, Coder, Materials Manager).

---

## Stage 7: Automated Verification & Test Suite
- **Test File:** `tests/medicare-device-intensive-payment.test.js`
- **Test Categories:**
  1. Schema DDL & forward/down migration safety.
  2. 42 CFR § 416.171(b)(2) mathematical formula precision.
  3. ASCQR 2.0% quality penalty carve-out isolation.
  4. MPPR 50% secondary procedure device offset protection.
  5. C-code packaging ($0.00 allowable) invariant.
  6. Multi-tenant RLS isolation and negative authorization.
  7. Strict Purple Ban static regex audit across all JSX and CSS files.

