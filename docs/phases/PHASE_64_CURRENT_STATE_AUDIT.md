# PHASE 64 — CURRENT STATE AUDIT: MULTIPLE PROCEDURE PAYMENT RULES
## Repository Inspection, Database Schema Audit, and Architectural Findings

**Audit Date**: October 2026  
**System**: ASCANALYST Enterprise Medical Operations & Financial Intelligence  
**Scope**: Existing Multiple Procedure Payment Reduction (MPPR) logic, pricing resolvers, modifier handling, payer fee structures, and interaction with Phases 60–63.  
**Execution Mode**: READ-ONLY AUDIT. Zero modifications to application source, schema, or database records.

---

## 1. Executive Summary

A comprehensive forensic audit of the repository, Supabase database migrations, TypeScript/JavaScript services, stored procedures, and UI components was conducted to evaluate current readiness for **Phase 64: Multiple Procedure Payment Rules & Related Reimbursement Reductions**.

### Key Audit Findings:
1. **Facility Level Toggle Exists**: `public.facilities` possesses an `apply_medicare_mppr` boolean flag (introduced in migration `001_multi_tenancy_core.sql` and exposed in `src/components/Settings.jsx`), governed by RBAC permissions `tenancy.toggle_mppr` and `billing.apply_mppr`.
2. **Duplicate and Competing Calculation Engines**:
   - Engine A: `src/utils/hospitalUtils.js` -> `calculateMedicareRevenue` (Applies client-side sorting and 50% discount; partially updated in Phase 63 to protect J8 offsets).
   - Engine B: `src/utils/hospitalUtils.js` -> `calculateAuthoritativeAscRevenue` (Separate client-side calculation introduced in Phase 44 with bilateral 150% handling, but lacking device offset awareness).
   - Engine C: PostgreSQL RPC `calculate_surgery_financials` (Stored procedure in migrations `009`, `010`, `021`, `022`, applying a 50% discount on secondary surgical lines without recording line-by-line audit ledgers).
   - Engine D: `src/lib/medicareDeviceService.js` -> `calculateMpprSecondaryJ8Payment` (Phase 63 service isolating device offset from 50% service cuts).
3. **Absence of Server-Side MPPR Audit Ledger**: There is currently no persistent database table recording the exact primary/secondary ranking, initial allowable, reduction methodology, carve-outs, or post-reduction allowable per procedure line.
4. **Lack of Payer-Specific Contract Rule Sets**: `public.payer_fee_schedules` records flat contracted rates per CPT code but has no schema for payer-specific multiple procedure cascades (e.g., 100% / 50% / 25% / 0%).
5. **No Endoscopy Family Base-Code Logic**: The codebase treats all secondary eligible procedures with a flat 50% reduction, missing CMS statutory endoscopy family base-code deduction rules under 42 CFR § 416.172(c).

---

## 2. Component-by-Component Classification (KEEP, REFACTOR, REPLACE, MISSING)

| Component / Subsystem | Repository Path / Database Object | Current Behavior | Classification | Evidence & Rationale |
| :--- | :--- | :--- | :--- | :--- |
| **Medicare ASC Base Rate Addenda** | `public.cms_asc_addenda` | Authoritative quarterly CMS rate and payment indicator reference | **KEEP** | Established in Phase 60 (migration 036). Provides national unadjusted rates and baseline indicators. |
| **Facility Medicare Settings** | `public.facility_medicare_settings` | Effective CBSA and wage-index overrides per facility | **KEEP** | Established in Phase 60/62 (migrations 036, 038). Essential for resolving base rates before MPPR. |
| **Payment Indicator Eligibility** | `public.cms_payment_indicators` | Reference metadata defining `is_mppr_eligible`, `is_device_intensive`, `is_packaged` | **KEEP** | Deployed in Phase 61 (migration 037). Accurately flags `A2`, `G2`, `P2`, `P3`, `J8` as MPPR-eligible. |
| **Geographic Wage Adjustment** | `public.fn_resolve_facility_wage_index` | Resolves authoritative wage index | **KEEP** | Deployed in Phase 62 (migration 038). Must precede or integrate with service-share MPPR calculation. |
| **Device-Intensive Payment Engine** | `public.fn_resolve_device_intensive_offset` & `medicareDeviceService.js` | Computes device offset and protects device portion from MPPR | **KEEP** | Deployed in Phase 63 (migration 039). Conforms to 42 CFR § 416.171(b)(2). |
| **Facility MPPR Settings Column** | `public.facilities.apply_medicare_mppr` | Boolean toggle controlling whether MPPR is active for facility | **KEEP** | Deployed in migrations 001 and 008. Well-integrated with RBAC. |
| **CPT Billing Rules Table** | `public.cpt_billing_rules` | Contains `is_mppr_exempt`, `bilateral_indicator`, `mue_value` | **KEEP** | Deployed in migration 021. Tracks code-level MPPR exemption (e.g., add-on codes). |
| **Claim Scrubbing Rule SCRUB-18** | `public.fn_scrub_claim` & `ClaimScrubberWorkbench.jsx` | Warns if primary procedure with highest allowable is not on Line 1 | **KEEP & REFACTOR** | Migration 024. Validates line sequencing, but needs expansion for bilateral units and commercial modifier 51 rules. |
| **Client Revenue Calculator A** | `src/utils/hospitalUtils.js` (`calculateMedicareRevenue`) | Client-side line sort and 50% discount application | **REFACTOR** | Sorts by client-resolved rates. Falls back to gross charges if rates are missing. Must delegate to authoritative server RPC. |
| **Client Revenue Calculator B** | `src/utils/hospitalUtils.js` (`calculateAuthoritativeAscRevenue`) | Computes bilateral 150% and 50% secondary discounts | **REPLACE** | Duplicate engine. Does not protect J8 device offsets. Disconnected from Phase 63 architecture. |
| **Server Financial RPC** | `public.calculate_surgery_financials` | Stored procedure recalculating encounter financials | **REFACTOR** | Lacks line-item audit snapshot for MPPR; does not store ranking sequence or breakdown of wage/device shares. |
| **Multiple Procedure Audit Ledger** | `public.mppr_calculation_ledgers` / `snapshots` | Historical audit table capturing ranking, reductions, and provenance | **MISSING** | No dedicated table exists to preserve immutable proof of MPPR deductions for audits. |
| **Commercial Payer MPPR Cascades** | `public.payer_mppr_rule_sets` & rules | Multi-tiered payer discount schedules (100/50/25/0) | **MISSING** | Commercial payers are currently forced into either flat fee schedule rates or arbitrary client fallbacks. |
| **Endoscopy Family Pricing Engine** | `public.cms_endoscopy_families` | CMS endoscopy base-code difference calculation (42 CFR § 416.172(c)) | **MISSING** | Endoscopy codes are currently lumped into standard 50% surgical cuts, violating CMS ASC rules. |

---

## 3. Forensic Inspection of Upstream Phases

### Phase 60: Medicare ASC Base Rate Engine
- **Existing Schema**: `public.cms_asc_addenda` stores `cpt_code`, `payment_indicator`, `carrier_priced_flag`, and `national_unadjusted_rate`.
- **Calculations**: `public.medicare_base_rate_calculations` and `public.medicare_base_rate_calc_lines` store single-code baseline calculations.
- **Finding**: Base rate calculations currently evaluate lines in isolation. They do not compute multi-procedure line discounts across an encounter.

### Phase 61: CMS Payment Indicators
- **Existing Schema**: `public.cms_payment_indicators` defines `is_mppr_eligible BOOLEAN NOT NULL DEFAULT true`.
- **Verified Indicators**:
  - `A2`, `G2`, `P2`, `P3`, `J8`: `is_mppr_eligible = TRUE`.
  - `Z2` (Radiology): `is_mppr_eligible = FALSE` (Exempt covered ancillary).
  - `K2` (Drugs/Biologicals): `is_mppr_eligible = FALSE` (Exempt covered ancillary).
  - `N1` (Packaged Service): `is_mppr_eligible = FALSE` ($0.00 separate payment; bundled into primary APC).
  - `C` (Inpatient-Only): `is_mppr_eligible = FALSE` (Prohibited in ASC).
  - `E5` (Statutorily Excluded): `is_mppr_eligible = FALSE`.
- **Finding**: Payment indicator metadata is sound and ready for server-side integration.

### Phase 62: Geographic Wage Adjustment
- **Interaction**: Wage adjustment adjusts the labor-related share (50%) of the service rate by the facility wage index.
- **Critical Interaction Requirement**: In MPPR, does wage adjustment occur *before* or *after* the 50% cut?
  - **Statutory CMS Fact**: Under 42 CFR § 416.171 and § 416.172, the formula is algebraically commutative for standard surgical codes:
    $$\text{Secondary Rate} = \text{Adjusted Rate} \times 0.50 = [(\text{Unadj} \times 0.50 \times WI) + (\text{Unadj} \times 0.50)] \times 0.50$$
  - However, for **Device-Intensive (J8)** codes, wage adjustment applies **only** to the unadjusted service share, and the 50% MPPR applies **only** to the adjusted service share. The device offset is 100% exempt from both.

### Phase 63: Device-Intensive Payment Rules
- **Implementation Status**: FULLY IMPLEMENTED (Migration `039_device_intensive_payment_rules.sql`, `src/lib/medicareDeviceService.js`, Tab 6 in `MedicareRateExplorer.jsx`, test suite `tests/medicare-device-intensive-payment.test.js`).
- **Verified Mechanics**:
  - Primary TKA `27447` ($10,500.00 national rate, 33.15% offset, 0.9412 WI):
    - Device Offset: `$3,480.75` (100% protected).
    - Service Adjusted: `$6,812.88`.
    - Total Primary Allowable: `$10,293.63`.
  - Secondary TKA `27447` under MPPR:
    - Device Offset: `$3,480.75` (Paid at 100%).
    - Service Share Halved: $\text{ROUND}(6812.88 \times 0.50, 2) = \$3,406.44$.
    - Total Secondary Allowable: **`$6,887.19`**.
- **Finding**: Phase 63 establishes the exact mathematical standard that Phase 64 must extend to multi-code claim encounters.

---

## 4. Analysis of Conflicting and Duplicate Calculation Paths

### Defect 1: Dual Competing Client Functions in `src/utils/hospitalUtils.js`
1. `calculateMedicareRevenue`:
   - Prioritizes `wage_adjusted_rate` > `contracted_reimbursement` > `reimbursement` > `gross_charge`.
   - Protects J8 device offsets.
   - Applies 150% for modifier 50.
2. `calculateAuthoritativeAscRevenue`:
   - Prioritizes `gross_charge` > `contracted_reimbursement` > `reimbursement`.
   - **Does not protect J8 device offsets** (applies flat 50% to the whole rate, severely underpaying implants!).
   - Applies 50% for modifier 73 (discontinued procedure).

**Impact**: If different screens call `calculateAuthoritativeAscRevenue` instead of `calculateMedicareRevenue`, an ASC will falsely report hundreds of thousands of dollars in implant revenue loss.

### Defect 2: Gross Charge Fallback in Client Sorting
- Line 189 in `hospitalUtils.js`:
  ```javascript
  const sortedCpts = [...resolvedLines].sort((a, b) => getBasePrice(b) - getBasePrice(a));
  ```
- If a facility has an active chargemaster with gross charges ($18,000 for a minor scope and $12,000 for a major arthroplasty) and the Medicare allowable rate is missing on one line, `getBasePrice` falls back to `gross_charge`.
- **Result**: The minor scope is falsely ranked as Rank 1 (100%), and the high-value arthroplasty is relegated to Rank 2 (50%), corrupting reimbursement estimates.
- **Statutory Invariant**: **Ranking must be based strictly on authoritative Medicare allowable rates, never on chargemaster gross charges.**

---

## 5. Summary of Audit Classifications

| Total Components Audited | KEEP | REFACTOR | REPLACE | MISSING |
| :---: | :---: | :---: | :---: | :---: |
| 14 | 7 | 3 | 1 | 3 |

**Audit Conclusion**: The repository has solid foundations from Phases 60–63 (addenda, payment indicators, wage indices, and device offset math). However, existing multi-procedure reimbursement logic is scattered across competing client functions and legacy RPCs without an authoritative server-side sequencing and audit engine. Phase 64 must consolidate these into a unified, server-authoritative architecture.
