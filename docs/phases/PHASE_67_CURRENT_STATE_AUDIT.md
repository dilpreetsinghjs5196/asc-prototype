# PHASE 67 — CURRENT STATE AUDIT: PAYER CONTRACT RATE RULES
## Enterprise ASC Medical Operations & Financial Intelligence Platform

> **Audit Context:** Phase 67 Production Specification  
> **Status:** READ-ONLY AUDIT COMPLETED  
> **Scope:** Audit of existing repository, database schemas, Medicare base rate engine, CMS payment indicators, geographic wage adjustments, device-intensive offsets, MPPR reduction engines, payer master, contract models, and legacy pricing services.  
> **Proposed Migration Target:** `043_payer_contract_rate_rules.sql` (Planning Reference Only — NOT Created).

---

## 1. Executive Audit Summary

A comprehensive architectural and code-level audit was conducted across all database migrations (`001` through `042`), client-side services, utilities, and components to evaluate how contracted commercial rates, Medicare multipliers, fee schedules, case rates, implant carve-outs, and contractual exceptions are currently modeled and executed.

### Core Audit Findings
1. **Upstream Foundation Solidified:** 
   - Migration `040_multiple_procedure_payment_rules.sql` provides authoritative commercial MPPR reduction cascades (`COM_STD_CASCADE`, `COM_SYM_50`).
   - Migration `041_payer_master.sql` establishes decoupled enterprise payer and plan master records.
   - Migration `042_payer_contract_model.sql` establishes decoupled contract ownership (`organization_id`), multi-facility scope inheritance (`payer_contract_facility_scopes`), plan scopes (`payer_contract_plan_scopes`), immutable version locking triggers (`trg_block_approved_contract_version_modification`), and a 7-step deterministic resolver (`fn_resolve_payer_contract`).
2. **Critical Architectural Defect — The "Dual Pricing Divide":**
   - The platform currently maintains **two disconnected pricing mechanisms**:
     - *Legacy Clinical Pipeline (Migrations 002, 010, 017, 022):* `calculate_surgery_financials` queries `surgery_procedures.contracted_reimbursement` or flat `payer_fee_schedules` (Migration 002). This legacy table references `payers.id` directly without any contract versioning, plan scopes, or % of Medicare calculations.
     - *Modern Contract Model (Migration 042):* `payer_contract_terms` and `fn_resolve_payer_contract` resolve versioned contract rates, but **no server-side calculation engine currently consumes them to price surgeries, claims, or encounters**.
3. **Hardcoded Calculation Fallbacks in Client Code:**
   - In `src/lib/payerContractService.js:calculateCommercialEncounterReimbursement`, `PERCENT_OF_BILLED_CHARGES` is calculated using a hardcoded `0.65` multiplier (`gross * 0.65`, assuming a flat 35% discount).
   - In `src/utils/hospitalUtils.js`, `calculateAuthoritativeAscRevenue` falls back to `national_unadjusted_rate` or `gross_charge` if commercial terms are missing.
4. **Missing Fee Schedule Scale & Batch Entity Model:**
   - `payer_contract_terms` in Migration 042 is a flat 1NF table linked directly to `payer_contract_versions`. Commercial payer fee schedules frequently contain 2,500 to 5,000 CPT line items. Storing them as individual terms without versioned rate schedule headers, effective-dated CPT tables, or import staging models creates database bloat and prevents bulk exhibit updates.
5. **Absence of Immutable Commercial Calculation Snapshots:**
   - Phase 60 deployed `medicare_base_rate_calculations` and `medicare_base_rate_calc_lines` to preserve Medicare calculation provenance.
   - **Zero equivalent snapshot mechanism exists for Commercial Contracts.** When contract rates are amended, historical encounter margins are vulnerable to retroactive distortion.

---

## 2. Upstream Subsystem Audit & Integration Analysis

### 2.1 Phase 60 — Medicare ASC Base Rate Engine
- **Database Objects:** `public.cms_asc_releases`, `public.cms_asc_addenda`, `public.facility_medicare_settings`, `public.medicare_base_rate_calculations`, `public.fn_resolve_medicare_base_rate`.
- **Audit Assessment:** **KEEP & CONSUME AS UPSTREAM BENCHMARK**.
- **Reliability:** High. `fn_resolve_medicare_base_rate(p_dos, p_cpt_code, p_facility_id, p_wage_index_override)` reliably computes the statutory localized Medicare ASC baseline.
- **Contract Rate Gap:** Commercial contracts referencing `% of Medicare` frequently specify whether they pay against the *Current Calendar Year Medicare Rate*, a *Contractually Frozen Benchmark Year* (e.g. "CY 2024 CMS-1786-FC Final Rule"), or *National Unadjusted vs. Locally Wage-Adjusted*. Currently, `fn_resolve_payer_contract` assumes the dynamic DOS Medicare rate with local wage adjustment; there is no configuration to freeze the benchmark year or toggle national vs. local baseline.

### 2.2 Phase 61 — CMS Payment Indicators
- **Database Objects:** `public.cms_payment_indicators`, `public.cms_asc_addenda.payment_indicator`.
- **Audit Assessment:** **KEEP (WITH COMMERCIAL OVERRIDE CAPACITY)**.
- **Reliability:** High for Medicare statutory claims.
- **Contract Rate Gap:** CMS classifies packaged services as `N1` ($0.00 separate allowable). However, commercial contracts frequently negotiate separate reimbursement for specific packaged supplies, C-codes, or imaging (e.g. C1776 implant or 74176 CT abdomen). Phase 67 must allow commercial contracts to explicitly override CMS packaging status.

### 2.3 Phase 62 — Geographic Wage Adjustment
- **Database Objects:** `public.facility_geographic_assignments`, `public.medicare_wage_indices`, `public.fn_resolve_facility_wage_index`.
- **Audit Assessment:** **KEEP**.
- **Reliability:** Verified. Resolves CBSA and effective-dated wage indices.
- **Double Wage Adjustment Hazard:** If a commercial contract specifies a `COMMERCIAL_FEE_SCHEDULE` ($4,250 flat fee), the wage index **must never be applied**. If a contract specifies `PERCENT_OF_MEDICARE`, the wage index is already incorporated into the Medicare baseline; the multiplier must be applied once to the final baseline without reapplying wage adjustment.

### 2.4 Phase 63 — Device-Intensive Payment Rules
- **Database Objects:** `public.cms_device_offset_percentages`, `public.fn_resolve_device_intensive_offset`.
- **Audit Assessment:** **KEEP & PROTECT AGAINST DOUBLE DIPPING**.
- **Reliability:** Verified under 42 CFR § 416.171(b)(2).
- **Double Payment Hazard:** For a J8 device-intensive procedure (e.g. 29827 / 66984), Medicare's statutory rate already embeds the device offset in the base allowable. If a commercial contract pays `165% of Medicare` AND also reimburses implants separately via `PASS_THROUGH_INVOICE_PLUS_PERCENT`, the facility would be reimbursed for the device **twice** unless the engine carves out the Medicare device offset portion before calculating the procedure allowable.

### 2.5 Phase 64 — Multiple Procedure Payment Rules
- **Database Objects:** `public.multiple_procedure_rule_sets`, `public.multiple_procedure_rules`, `public.cms_endoscopy_families`, `public.fn_calculate_mppr_reimbursement`.
- **Audit Assessment:** **KEEP & REFACTOR CONSUMPTION**.
- **Reliability:** Verified. Supports statutory Medicare (100%/50%) and commercial cascades (100%/50%/25%/0%).
- **Contract Rate Gap:** `fn_calculate_mppr_reimbursement` currently ranks procedures solely using Medicare base rates. Under commercial fee schedules, procedure ranking for MPPR **must be ranked strictly based on the contracted commercial allowable amount**, never Medicare rates or gross chargemaster charges.

### 2.6 Phase 65 — Payer Master & Plan Master
- **Database Objects:** `public.payer_master`, `public.payer_plans`, `public.facility_payers`, `public.payer_identifiers`, `public.patient_insurance_coverages`.
- **Audit Assessment:** **KEEP**.
- **Reliability:** Fully normalized, multi-tenant, and verified.

### 2.7 Phase 66 — Payer Contract Model
- **Database Objects:** `public.payer_contracts`, `public.payer_contract_versions`, `public.payer_contract_facility_scopes`, `public.payer_contract_plan_scopes`, `public.payer_contract_service_scopes`, `public.payer_contract_terms`, `public.payer_contract_documents`, `public.payer_contract_amendments`, `public.payer_contract_approvals`, `public.payer_contract_audit_logs`, `public.fn_resolve_payer_contract`.
- **Audit Assessment:** **KEEP & EXPAND IN PHASE 67**.
- **Reliability:** 100% verified. Provides the 7-step hierarchy for selecting the active legal contract and version.

---

## 3. Comprehensive Component Classification (KEEP / REFACTOR / REPLACE / MISSING)

| Component / Database Object / Source File | Domain | Current State & Evidence | Verdict | Target Production Responsibility in Phase 67 |
|:---|:---|:---|:---:|:---|
| `public.payer_fee_schedules` (`supabase/migrations/002_clinical_normalization.sql`) | Database Table | Flat table referencing `public.payers(id)` and `cpt_codes(id)`. Lacks contract linkage, versioning, plan scope, and methodologies. | **REPLACE** | Deprecate and replace with normalized `payer_contract_rate_schedules` and `payer_contract_cpt_rates`. |
| `public.payer_contract_terms` (`supabase/migrations/042_payer_contract_model.sql`) | Database Table | Stores CPT-specific terms (`FIXED_FEE`, `PERCENT_OF_MEDICARE`, `PERCENT_OF_BILLED`, `CASE_RATE`), contracted rates, and multipliers. | **KEEP** | Retain for Tier-1 contract-level overrides; augment with bulk rate schedule linkage. |
| `public.calculate_surgery_financials` (`supabase/migrations/022_cpt_versioning_and_licensed_content.sql`) | Stored Procedure | Computes case margin from `surgery_procedures.contracted_reimbursement`. Lacks commercial contract resolution. | **REFACTOR** | Wire into Phase 67 authoritative rate engine (`fn_calculate_commercial_reimbursement`). |
| `public.fn_resolve_payer_contract` (`supabase/migrations/042_payer_contract_model.sql`) | Stored Procedure | Authoritative 7-step deterministic procedure resolving contract, version, methodology, and terms. | **KEEP** | Upstream resolver for Phase 67 rate calculations. Must remain the sole contract selector. |
| `public.fn_calculate_mppr_reimbursement` (`supabase/migrations/040_multiple_procedure_payment_rules.sql`) | Stored Procedure | Ranks procedures and applies tiered discounts. Currently restricted to Medicare base rates. | **REFACTOR** | Allow caller to inject pre-resolved commercial allowables for commercial cascade ranking. |
| `public.implant_supplier_invoices` & `invoice_lines` (`supabase/migrations/032_facility_implant_pricing.sql`) | Database Tables | Tracks verified vendor invoice costs and reconciliation status for used implants. | **KEEP** | Authoritative data source for `PASS_THROUGH_INVOICE_PLUS_PERCENT` and `AT_COST` carve-out calculations. |
| `public.case_devices` (`supabase/migrations/023_charge_completeness_engine.sql`) | Database Table | Itemized implants and supplies logged on surgical cases with `unit_cost` and `charge_amount`. | **KEEP** | Primary clinical case input for itemized implant carve-out adjudication. |
| `src/lib/payerContractService.js` | Client Service | Provides `getPayerContracts`, `resolvePayerContract`, and client-side simulation. | **REFACTOR** | Wire client simulation methods to authoritative server-side RPCs; eliminate hardcoded `0.65` discount. |
| `src/utils/hospitalUtils.js: calculateAuthoritativeAscRevenue` | Client Utility | Calculates revenue with MPPR and bilateral rules. Includes fail-closed check for uncontracted commercial claims. | **REFACTOR** | Integrate commercial contract rate resolution into multi-line procedure pricing. |
| `src/services/aiOperations/FinancialEngine.js` | Client Utility | Calculates OR, labor, and implant costs to determine net margin. | **KEEP** | Remains pure direct-cost calculator. Consumes authoritative contractual revenue from Phase 67. |
| `public.payer_contract_rate_schedules` | Database Table | Versioned header for full fee schedules exhibits (e.g. "BCBS Outpatient Surgery Schedule 2026"). | **MISSING** | **CREATE (Phase 67):** Normalizes bulk fee schedules linked to contract versions. |
| `public.payer_contract_cpt_rates` | Database Table | Itemized CPT/HCPCS rates under a rate schedule version with modifier and facility support. | **MISSING** | **CREATE (Phase 67):** High-performance storage for 3,000+ line-item commercial fee schedules. |
| `public.payer_contract_case_rates` | Database Table | Bundled payment terms defining primary CPT, bundle amount, and included/excluded rules. | **MISSING** | **CREATE (Phase 67):** Formalizes bundled surgical package reimbursement. |
| `public.payer_contract_case_rate_inclusions` | Database Table | Explicit crosswalk of secondary CPT codes bundled into a primary case rate. | **MISSING** | **CREATE (Phase 67):** Prevents duplicate billing of bundled procedures. |
| `public.payer_contract_carve_outs` | Database Table | Granular implant and supply carve-out rules by HCPCS, category, or manufacturer. | **MISSING** | **CREATE (Phase 67):** Eliminates crude single-percentage version defaults; supports category caps. |
| `public.payer_contract_rate_exceptions` | Database Table | Contractual exceptions: stop-loss thresholds, minimum case allowables, bilateral overrides. | **MISSING** | **CREATE (Phase 67):** Stores auditable contractual exception rules. |
| `public.payer_contract_rate_calculations` | Database Table | Immutable calculation header snapshot capturing contract, version, methodology, and total allowable. | **MISSING** | **CREATE (Phase 67):** Ensures 100% reproducible historical financial audits. |
| `public.payer_contract_rate_calculation_lines` | Database Table | Line-by-line snapshot capturing base allowable, MPPR reductions, carve-outs, and provenance. | **MISSING** | **CREATE (Phase 67):** Line-item financial audit ledger. |
| `public.payer_contract_rate_import_batches` | Database Table | Batch metadata for uploaded commercial fee schedule CSV/XLSX exhibits. | **MISSING** | **CREATE (Phase 67):** Governs rate file upload, staging, validation, and approval. |
| `public.payer_contract_rate_import_staging` | Database Table | Staged CPT rate records awaiting validation and CFO approval before activation. | **MISSING** | **CREATE (Phase 67):** Isolates unverified rate uploads from production fee schedules. |
| `public.fn_resolve_contract_rate` | Stored Procedure | High-performance RPC resolving the exact contractual allowable for a CPT under a contract version. | **MISSING** | **CREATE (Phase 67):** Authoritative term/schedule rate resolver. |
| `public.fn_calculate_commercial_reimbursement` | Stored Procedure | Authoritative server-side calculation engine adjudicating entire encounters with MPPR and carve-outs. | **MISSING** | **CREATE (Phase 67):** Authoritative financial calculation engine. |

---

## 4. Codebase Search Evidence & Keyword Audit

Targeted search across repository and database migrations:

```text
1. "reimbursement_methodology":
   - Found in Migration 041 line 187: CHECK (reimbursement_methodology IN ('PERCENT_OF_MEDICARE', 'COMMERCIAL_FEE_SCHEDULE', 'PERCENT_OF_BILLED_CHARGES', 'CASE_RATE_BUNDLES', 'HYBRID'))
   - Found in Migration 042 lines 53, 81, 295, 329.
   - Found in src/lib/payerContractService.js lines 27, 48, 69, 90, 384, 417.

2. "contracted_rate":
   - Found in Migration 002 line 126 (payer_fee_schedules).
   - Found in Migration 017 lines 197, 243 (cpt_master normalization).
   - Found in Migration 022 lines 92, 116, 181 (cpt_code_versions).
   - Found in Migration 042 lines 151, 298, 365 (payer_contract_terms).
   - Found in src/lib/payerContractService.js lines 167-172, 386, 415.

3. "payer_fee_schedules":
   - Found in Migration 002 line 121 (legacy table).
   - Found in Migration 010 line 27 (foreign key in surgery_procedures).
   - Found in Migration 017 & 022 (legacy rate lookups).
   - Found in src/lib/supabase.js line 3627 (legacy query wrapper).

4. "device_carve_out" / "device_carve_out_mode":
   - Found in Migration 041 line 207 (device_carve_out_enabled, device_invoice_markup_pct).
   - Found in Migration 042 lines 55, 301, 331 (device_carve_out_mode: PASS_THROUGH_INVOICE_PLUS_PERCENT).
   - Found in src/lib/payerContractService.js lines 128, 143, 158, 388, 457.

5. "medicare_multiplier":
   - Found in Migration 041 line 205 (medicare_multiplier NUMERIC(6,4)).
   - Found in Migration 042 lines 296, 330.
   - Found in src/lib/payerContractService.js lines 126, 141, 385, 419.

6. "billed_charge_discount_pct":
   - Found in Migration 042 lines 54, 297, 330.
   - DEFECT DETECTED: src/lib/payerContractService.js line 425 ignores database column and hardcodes 0.65 (35% discount).
```

---

## 5. Identified Defects, Conflicting Logic & Gaps

### Defect 1: Silent Commercial Fallback to Statutory Medicare Rates in Legacy Procedures
- **Location:** `public.calculate_surgery_financials` (`022_cpt_versioning_and_licensed_content.sql`, Line 278).
- **Issue:** When `v_proc.contracted_reimbursement` is NULL (i.e. no legacy fee schedule entry exists), the function defaults to `v_proc.baseline_charge` or `cpt_codes.reimbursement` (the Medicare statutory rate).
- **Risk:** High (Financial distortion). An uncontracted commercial claim silently receives Medicare allowable revenue rather than throwing an uncontracted blocker or converting to billed charges.

### Defect 2: Hardcoded Billed Charge Discount in Client Service
- **Location:** `src/lib/payerContractService.js`, Line 425.
- **Issue:** `baseAllowable = Math.round(gross * 0.65 * 100) / 100; // 35% discount standard`
- **Risk:** High. Ignores the contracted discount percentage stored in `payer_contract_versions.billed_charge_discount_pct` (e.g. 40%, 45%, or 20%).

### Defect 3: Absence of Double-Dipping Protection on Device-Intensive Procedures under % of Medicare
- **Location:** `src/lib/payerContractService.js`, Lines 418 & 457.
- **Issue:** For CPT `29827` (Rotator Cuff Repair, CMS Payment Indicator `J8`), the Medicare rate already includes a ~28% device offset in the base allowable. If a contract reimburses 165% of Medicare AND also reimburses implant invoices at Invoice + 10%, the facility is paid for the anchors twice.
- **Risk:** Critical (Compliance and audit clawback hazard). The engine must deduct the Medicare device offset from the baseline before applying the % of Medicare multiplier when an implant carve-out is active.

### Defect 4: Single Flat Carve-Out Rule per Contract Version
- **Location:** `public.payer_contract_versions` (`042_payer_contract_model.sql`, Lines 55-56).
- **Issue:** A single contract version can only specify one global `device_carve_out_mode` and `device_invoice_markup_pct`. Real-world ASC contracts distinguish between total joint prostheses (e.g. invoice + 5% capped at $4,000), biologic implants (invoice at cost), and general fixation screws/plates ($0 bundled).
- **Risk:** Moderate. Cannot model real commercial contracts without granular carve-out entities.

---

## 6. Audit Conclusion & Phase 67 Mandate

The Phase 66 contract foundation is complete, verified, and operational in database and UI. However, Phase 67 must build the **authoritative financial calculation engine** and **normalized rate architecture**:
1. Implement `payer_contract_rate_schedules` and `payer_contract_cpt_rates` for bulk fee schedule exhibits.
2. Implement `payer_contract_case_rates` and `payer_contract_case_rate_inclusions` for bundled surgical packages.
3. Implement `payer_contract_carve_outs` for granular implant reimbursement logic.
4. Implement `payer_contract_rate_exceptions` for stop-loss, minimum payments, and bilateral overrides.
5. Implement `payer_contract_rate_calculations` and `payer_contract_rate_calculation_lines` for immutable audit snapshots.
6. Build authoritative server-side RPCs (`fn_resolve_contract_rate`, `fn_calculate_commercial_reimbursement`) to eliminate client-side hardcoded math.
7. Refactor `calculate_surgery_financials` and `calculateAuthoritativeAscRevenue` to cleanly consume Phase 67 contracts.

