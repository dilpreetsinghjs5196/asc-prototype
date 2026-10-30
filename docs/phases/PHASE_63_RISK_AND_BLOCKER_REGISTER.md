# PHASE 63 — RISK & BLOCKER REGISTER
## Technical, Regulatory, Financial & Tenancy Risk Catalog

**Product:** ASCANALYST Financial & Clinical Operations Platform  
**Phase:** 63 — Device-Intensive Payment Rules & Packaging Logic  
**Status:** AUDIT FINDINGS & BLOCKER REMEDIATION PROTOCOLS  

---

## 1. Executive Summary: Implementation Gate Verdict

| Phase 63 Gate Check | Status | Release Condition |
| :--- | :--- | :--- |
| **Architectural Feasibility** | **APPROVED** | Target schema (Migration 039) preserves Phase 60–62 contracts |
| **CMS Statutory Alignment** | **VERIFIED** | 42 CFR § 416.171(b)(2) formulas mathematically proven |
| **Current Repository Status** | **CONDITIONAL BLOCK** | **4 P1 Defects Must Be Remediated in Migration 039** |

---

## 2. Identified Release Blockers & Remediation Protocols

### BLOCKER 1 (P1): Gross Chargemaster Fallback Leak
- **Location:** `src/utils/hospitalUtils.js` (lines 160–165)
- **Defect Description:** When a procedure has missing Medicare reimbursement data, the utility falls back to `cpt.gross_charge || cpt.charge_amount`. For implant C-codes (`C1776`) or unlisted codes, gross charges ($10,000–$25,000+) are added to expected revenue, creating catastrophic financial reporting distortion.
- **Remediation Protocol:** 
  1. Replace gross charge fallback with explicit `$0.00` allowable for packaged indicators (`N1`, `C-codes`).
  2. Throw `UNRESOLVED_MEDICARE_ALLOWABLE` error for covered procedures lacking authoritative rates.
  3. Hard block gross charge fallback in unit test suite.

---

### BLOCKER 2 (P1): Flat 35% Device Offset Seed Defect
- **Location:** `supabase/migrations/036_medicare_asc_base_rate_engine.sql` and `src/lib/medicareRateService.js`
- **Defect Description:** The seed data hardcoded only 5 procedures with a flat `0.3500` offset (`simDevPct = 0.35`). In reality, CMS publishes code-specific empirical offsets across 600+ J8 procedures ranging from `0.3001` to over `0.8500`. Applying a flat 35% creates up to a 50% calculation error on procedures like `63685` (actual offset 82.45%).
- **Remediation Protocol:**
  1. Ingest full CMS-1823-FC Addendum AA device-intensive dataset into `public.cms_device_intensive_procedures`.
  2. Deprecate client-side hardcoded `0.35` constant.
  3. Require `fn_resolve_medicare_base_rate` to query code-specific offset from `cms_device_intensive_procedures`.

---

### BLOCKER 3 (P1): SCRUB-21 Pre-Bill Validation Category Gap
- **Location:** `supabase/migrations/037_cms_payment_indicators.sql`
- **Defect Description:** Rule `SCRUB-21` currently checks only whether *any* device is attached to the surgical case (`case_devices.length > 0`). It does not verify whether the attached device matches the CMS-mandated HCPCS C-code category (e.g., knee arthroplasty `27447` requires `C1776`). A claim with an anchor screw `C1713` would pass validation and be rejected by Medicare MAC.
- **Remediation Protocol:**
  1. Deploy `public.cpt_device_category_crosswalk` in Migration 039.
  2. Upgrade `SCRUB-21` in stored procedure `fn_scrub_claim_lines` to validate that at least one attached case device maps to the specific required C-code category for that CPT.

---

### BLOCKER 4 (P1): Missing CMS Offset vs Vendor Cost Margin Ledger
- **Location:** Service layer & Database Schema
- **Defect Description:** Facilities currently have no reporting mechanism to reconcile the CMS device reimbursement allowance against the actual vendor acquisition cost paid on vendor invoices (`case_device_cost_allocations.allocated_extended_acquisition_cost`). Clinical teams cannot see whether they have an implant surplus or deficit.
- **Remediation Protocol:**
  1. Deploy `public.medicare_device_calculation_ledgers` in Migration 039.
  2. Implement `medicareDeviceService.getDeviceMarginReconciliation(surgeryId)`.
  3. Expose Device Margin Reconciliation card in UI.

---

## 3. Risk Register Across Architectural Domains

| Risk ID | Domain | Severity | Description | Mitigation Strategy | Owner |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **RSK-63-01** | Regulatory | **P1** | CMS changes device offset threshold or formula in future Final Rule. | Table-driven versioning keyed to `cms_asc_releases.release_year`. | Backend |
| **RSK-63-02** | Financial | **P1** | Double-billing implant hardware by submitting separate allowable on C-code lines. | Automated claim scrubber forces C-code lines to `$0.00` allowable with indicator `N1`. | Billing / Engine |
| **RSK-63-03** | Tenancy | **P2** | Cross-facility visibility of custom vendor implant contract discounts. | Strict facility-scoped RLS policies on contract pricing tables (`facility_implant_pricing`). | Security / DB |
| **RSK-63-04** | Data Quality| **P2** | Missing C-code mapping for newly FDA-approved implant SKUs. | Fallback crosswalk to generic `L8699` with mandatory manual audit requirement. | Clinical / Materials |
| **RSK-63-05** | UI / UX | **P2** | Violation of strict Maestro Purple Ban tokens in device UI cards. | Static automated CSS/JSX regex audit in pre-commit hooks and Vitest. | Frontend |

