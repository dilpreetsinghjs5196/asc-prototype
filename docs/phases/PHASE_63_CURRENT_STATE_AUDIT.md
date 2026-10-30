# PHASE 63 — CURRENT STATE AUDIT
## Repository Audit: Device-Intensive Payment Rules, Packaging Logic & Upstream Medicare Engines

### Executive Summary

| Dimension | Audit Finding |
| :--- | :--- |
| **Audit Date** | October 30, 2026 |
| **Scope** | Codebase & Database Inspection for Phase 63 (Device-Intensive Payment & Packaging) |
| **Upstream Phase Status** | **Phase 60** (Base Rate Engine), **Phase 61** (CMS Payment Indicators), and **Phase 62** (Geographic Wage Adjustment) implemented, tested, and active. |
| **Overall Audit Verdict** | **CONDITIONAL GO** — Architectural and regulatory foundations exist, but critical P1 defects in device offset data, MPPR math, and gross chargemaster fallbacks must be addressed. |
| **Critical Defect (P1)** | `src/utils/hospitalUtils.js` line 162 falls back to gross chargemaster rates when Medicare reimbursement is missing, and hardcodes a generic 35% offset on line 198. |
| **Data Model Defect (P1)** | Existing `cms_asc_addenda` table defaults device offset percentages to flat `0.3500` (or `0.0000`) instead of official CMS code-specific empirical values (30.01% – 85.00%+). |
| **Functional Gap (P1)** | No database crosswalk exists linking CPT device-intensive procedures (`J8`) to mandatory CMS device category HCPCS C-codes (`C1776`, `C1767`, `C1785`). |
| **Financial Gap (P2)** | No reconciliation mechanism connects actual physical implant acquisition costs (`case_device_cost_allocations`) with Medicare device offset reimbursement allowances. |

---

### 1. Detailed Inspection of Upstream Components

#### 1.1 Phase 60 — Medicare ASC Base Rate Engine
* **`public.cms_asc_addenda`** ([`018_cms_asc_coverage_and_payment.sql`](file:///e:/medicalAI/asc-prototype/supabase/migrations/018_cms_asc_coverage_and_payment.sql#L43-L70), [`036_medicare_asc_base_rate_engine.sql`](file:///e:/medicalAI/asc-prototype/supabase/migrations/036_medicare_asc_base_rate_engine.sql#L190-L210)):
  - *Current State:* Stores 4,335+ CPT/HCPCS records for CY 2026. Contains columns `is_device_intensive`, `device_offset_percentage`, `device_offset_amount`, and `service_portion_rate`.
  - *Deficiency:* In migration 018, only 5 procedures (`28465`, `27447`, `27130`, `63685`, `33208`) were seeded with an offset, and all 5 were set to an identical flat `0.3500` (35%). Official CMS regulations establish code-specific empirical offsets across ~600+ device-intensive procedures (e.g. CPT 63685 is 82.45%, CPT 33208 is 71.20%).
  - *Classification:* **REFACTOR**.

* **`public.medicare_base_rate_calculations` & `medicare_base_rate_calc_lines`** ([`036_medicare_asc_base_rate_engine.sql`](file:///e:/medicalAI/asc-prototype/supabase/migrations/036_medicare_asc_base_rate_engine.sql#L215-L275)):
  - *Current State:* Immutable calculation snapshots recording unadjusted baseline, wage-adjusted rate, and line items.
  - *Deficiency:* Line items store `is_device_intensive` and `device_offset_amount`, but do not record paired device C-codes, device margin variance vs actual invoice cost, or packaging indicators.
  - *Classification:* **REFACTOR**.

* **`public.fn_resolve_medicare_base_rate`** ([`038_medicare_geographic_wage_adjustment.sql`](file:///e:/medicalAI/asc-prototype/supabase/migrations/038_medicare_geographic_wage_adjustment.sql#L430-L600)):
  - *Current State:* Server stored procedure resolving base rates with 50/50 statutory wage math and device offset carve-out.
  - *Strengths:* Implements 42 CFR § 416.171(b)(2) carve-out correctly from the national unadjusted rate.
  - *Deficiency:* Does not validate whether a paired device was implanted or reconcile with case device costs.
  - *Classification:* **KEEP / INTEGRATE**.

#### 1.2 Phase 61 — CMS Payment Indicators
* **`public.cms_payment_indicator_definitions`** ([`037_cms_payment_indicators_and_interpretation.sql`](file:///e:/medicalAI/asc-prototype/supabase/migrations/037_cms_payment_indicators_and_interpretation.sql#L40-L75)):
  - *Current State:* Defines all 12 statutory CMS indicators (`A2`, `J8`, `N1`, `Z2`, `K2`, `G2`, `P2`, `P3`, `R2`, `F4`, `B5`, `C`).
  - *Strengths:* Correctly identifies `J8` as `Device_Intensive` with `requires_device_code = true`, and `N1` as `Packaged_APC` with `is_packaged = true`.
  - *Classification:* **KEEP**.

* **`public.cms_indicator_claim_rules`** ([`037_cms_payment_indicators_and_interpretation.sql`](file:///e:/medicalAI/asc-prototype/supabase/migrations/037_cms_payment_indicators_and_interpretation.sql#L205-L250)):
  - *Current State:* Deploys `SCRUB-20` (IPO Block), `SCRUB-21` (J8 Device Required), `SCRUB-22` (N1 Standalone Block), `SCRUB-23` (R2 Documentation), and `SCRUB-24` (E5 Excluded).
  - *Deficiency:* `SCRUB-21` checks whether *any* device exists for a J8 procedure, but does NOT validate whether the specific implant HCPCS C-code satisfies the CMS-mandated device category for that specific CPT procedure.
  - *Classification:* **REFACTOR / EXPAND**.

#### 1.3 Phase 62 — Geographic Wage Adjustment
* **`public.facility_medicare_geographic_assignments`** ([`038_medicare_geographic_wage_adjustment.sql`](file:///e:/medicalAI/asc-prototype/supabase/migrations/038_medicare_geographic_wage_adjustment.sql#L25-L50)):
  - *Current State:* Effective-dated facility CBSA mapping with CMS-855A verification audit trail.
  - *Classification:* **KEEP**.

* **`public.fn_resolve_facility_wage_index`** ([`038_medicare_geographic_wage_adjustment.sql`](file:///e:/medicalAI/asc-prototype/supabase/migrations/038_medicare_geographic_wage_adjustment.sql#L240-L350)):
  - *Current State:* Resolves authoritative effective-dated wage index with fail-closed exception handling.
  - *Classification:* **KEEP**.

#### 1.4 Existing Device, Implant & Financial Modules
* **`public.case_devices`** ([`023_charge_completeness_engine.sql`](file:///e:/medicalAI/asc-prototype/supabase/migrations/023_charge_completeness_engine.sql#L23-L40), [`035_case_implant_usage.sql`](file:///e:/medicalAI/asc-prototype/supabase/migrations/035_case_implant_usage.sql#L16-L65)):
  - *Current State:* Authoritative clinical tracking of devices opened, implanted, wasted, and returned. Includes `hcpcs_code` (e.g. `C1776`), `udi_di`, `unit_cost`, and `charge_amount`.
  - *Classification:* **KEEP**.

* **`public.case_device_cost_allocations`** ([`032_facility_implant_pricing.sql`](file:///e:/medicalAI/asc-prototype/supabase/migrations/032_facility_implant_pricing.sql#L267-L308)):
  - *Current State:* Reconciles actual vendor acquisition cost per case device item across 5 hierarchy tiers (`TIER_1_RECONCILED_INVOICE`, `TIER_2_ACCRUED_CONTRACT`, etc.).
  - *Strengths:* Provides 100% verified actual hardware acquisition costs (`allocated_extended_acquisition_cost`).
  - *Classification:* **KEEP**.

* **`src/utils/hospitalUtils.js`** ([`hospitalUtils.js`](file:///e:/medicalAI/asc-prototype/src/utils/hospitalUtils.js#L118-L222)):
  - *Current State:* Legacy client revenue calculator with MPPR logic.
  - *Critical Defects:*
    1. Line 162: Falls back to `cpt.gross_charge` when Medicare reimbursement is missing, violating regulatory truth.
    2. Line 198: Hardcodes `0.35` (35%) device offset default.
    3. Line 213: Deducts device offset from an already wage-adjusted rate, causing wage index distortion.
  - *Classification:* **REPLACE / DEPRECATE**.

---

### 2. Component Inventory & Classification Table

| Component / Artifact | Current File / Object | Classification | Evidence & Deficiencies | Target Phase 63 Action |
| :--- | :--- | :---: | :--- | :--- |
| **`cms_asc_addenda`** | `supabase/migrations/018_...sql`, `036_...sql` | **REFACTOR** | Stores flat 35% device offset on 5 codes; missing code-specific empirical offsets across ~600+ J8 procedures. | Retain as base rate catalog; supplement with dedicated `cms_device_intensive_procedures` table. |
| **`case_devices`** | `supabase/migrations/023_...sql`, `035_...sql` | **KEEP** | Authoritative clinical actuals with UDI and HCPCS code. | Retain as clinical implant source of truth. |
| **`case_device_cost_allocations`** | `supabase/migrations/032_...sql` | **KEEP** | Authoritative vendor invoice acquisition cost. | Reconcile against CMS device offset reimbursement. |
| **`cpt_implant_mappings`** | `supabase/migrations/027_...sql` | **KEEP** | Clinical guideline requirement mappings (AAOS/NASS). | Use to verify clinical requirement satisfaction. |
| **`cms_indicator_claim_rules`** | `supabase/migrations/037_...sql` | **REFACTOR** | `SCRUB-21` checks if device exists, but does not validate C-code category match. | Enhance `SCRUB-21` with authoritative CPT-to-C-Code category crosswalk validation. |
| **`hospitalUtils.js`** | `src/utils/hospitalUtils.js` | **REPLACE** | Line 162 gross chargemaster fallback; Line 198 hardcoded 35% offset; flawed MPPR math. | Deprecate in favor of server stored procedure `fn_calculate_device_intensive_payment`. |
| **`cms_device_categories`** | Database Schema | **MISSING** | No reference table exists for CMS HCPCS C-codes (`C1776`, `C1785`, `C1767`, etc.) and packaging rules. | Propose in Migration 039. |
| **`cpt_device_category_crosswalk`** | Database Schema | **MISSING** | No crosswalk exists establishing which C-codes satisfy which CPT J8 procedures under CMS edits. | Propose in Migration 039. |
| **`medicare_device_calculation_ledgers`** | Database Schema | **MISSING** | No ledger links CPT Medicare payment, CMS device offset, and actual implant invoice cost. | Propose in Migration 039. |
| **`fn_calculate_device_intensive_payment`** | Stored Procedure | **MISSING** | Existing calculation does not handle MPPR on device procedures or implant margin reconciliation. | Propose in Migration 039. |
| **`fn_validate_device_packaging`** | Stored Procedure | **MISSING** | No RPC validates C-code packaging and J8 pairing rules prior to claim submission. | Propose in Migration 039. |

---

### 3. Repository Search Audit Results

```
Key Search Term               Matches in Repo     Primary Locations
-----------------------------------------------------------------------------------------------------
device_intensive              42 matches          018.sql, 036.sql, 037.sql, 038.sql, medicareRateService.js
device_offset_percentage      28 matches          018.sql, 036.sql, 037.sql, 038.sql, hospitalUtils.js
device_offset_amount          31 matches          018.sql, 036.sql, 037.sql, 038.sql, hospitalUtils.js
packaging_indicator / N1      35 matches          037.sql, medicareRateService.js, hospitalUtils.js
separately_payable / K2       18 matches          037.sql, medicareRateService.js
hcpcs_c_code / C1776          14 matches          caseImplantUsageService.js, 023.sql, 035.sql
apply_medicare_mppr           22 matches          001.sql, rbacService.js, hospitalUtils.js
```

---

### 4. Audit Verdict & Release Gates

* **Verdict:** **CONDITIONAL GO**
* **Release Gates Required Before Implementation:**
  1. *Gate 1 (P1):* Ingestion of official CMS CY 2026 / CY 2025 Device-Intensive Procedure List with exact code-specific offset percentages (eliminating flat 35% defaults).
  2. *Gate 2 (P1):* Hard deprecation of `src/utils/hospitalUtils.js` gross chargemaster fallback.
  3. *Gate 3 (P1):* Creation of `cms_device_categories` and `cpt_device_category_crosswalk` for rigorous C-code pre-bill claim scrubbing.
  4. *Gate 4 (P2):* Implementation of server-authoritative implant margin reconciliation ledger connecting actual invoice costs to Medicare device offsets.

