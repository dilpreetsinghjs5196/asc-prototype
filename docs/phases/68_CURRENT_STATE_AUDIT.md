# PHASE 68 — CURRENT STATE AUDIT
## Comprehensive Codebase, Database Schema, and Financial Calculation Engine Audit

> **Phase:** 68 — Expected Reimbursement Engine  
> **Author:** Principal Healthcare Revenue Cycle Architect, Senior Database Architect, ASC Reimbursement Specialist  
> **Status:** AUDIT COMPLETE — EVIDENCE-BASED READ-ONLY INSPECTION  
> **Target Version:** ASCANALYST v2026.1  

---

## 1. EXECUTIVE SUMMARY & AUDIT CONTEXT

The ASCANALYST financial intelligence platform requires an authoritative, deterministic, server-side **Expected Reimbursement Engine** that accurately calculates estimated net reimbursement for ASC surgical encounters and provides transparent, line-level explanations.

To prevent financial misstatements, regulatory non-compliance, and billing reconciliation discrepancies, the engine must enforce strict separation across nine fundamental financial constructs:
1. **Gross Billed Charges** (Chargemaster fee schedule)
2. **Medicare ASC Baseline Reimbursement** (CMS statutory benchmark)
3. **Contractual Expected Reimbursement** (Contract allowable)
4. **Estimated Payer Reimbursement** (Expected net insurance payment)
5. **Actual Adjudicated Reimbursement** (ERA 835 / EOB allowable)
6. **Actual Remittance / Payment** (Cash settlement received)
7. **Patient Responsibility** (Copay, coinsurance, deductible, elective upgrades)
8. **Facility Acquisition Cost** (Direct supplies, implants, OR room/labor operating expense)
9. **Expected Facility Contribution / Margin** (Expected reimbursement minus acquisition cost)

This audit inspects the current repository state across git branch `feature/phase-50-implant-intelligence` at commit `48aaadb`, inspecting existing database migrations (`001` through `043`), service layers, calculation functions, and UI workflows.

---

## 2. REPOSITORY & MIGRATION INVENTORY

### 2.1 Git State
- **Active Branch:** `feature/phase-50-implant-intelligence`
- **Head Commit:** `48aaadb` (`fix(phase-67): refine locking trigger to BEFORE UPDATE OR DELETE and attach after seed data`)
- **Working Tree:** Clean (all upstream migrations 040, 041, 042, and 043 committed and active).

### 2.2 Migrations Inspected

| Migration Number | File Name | Primary Scope | Status |
| :--- | :--- | :--- | :--- |
| **002** | `002_clinical_normalization.sql` | Legacy `payer_fee_schedules`, `surgery_procedures` | **REPLACE** |
| **003** | `003_audit_and_snapshots.sql` | `surgery_financial_snapshots` (unversioned, unhashed) | **REPLACE** |
| **009 / 010** | `009_case_master_normalization.sql`, `010_case_cpt_codes_normalization.sql` | Initial `calculate_surgery_financials()` RPC | **REPLACE** |
| **021 / 022** | `021_cpt_modifiers_units_laterality.sql`, `022_cpt_versioning_and_licensed_content.sql` | Hardened `calculate_surgery_financials()`, `fn_resolve_cpt_pricing()` | **REPLACE** |
| **023** | `023_charge_completeness_engine.sql` | `case_devices`, implant charging completeness | **KEEP** |
| **024** | `024_claim_scrubbing_rules.sql` | `claims`, `claim_lines`, `fn_generate_claim_from_encounter` | **REFACTOR** |
| **032** | `032_facility_implant_pricing.sql` | Facility implant purchase contracts & cost tiers | **KEEP** |
| **035** | `035_case_implant_usage.sql` | Point-of-care implant usage logs | **KEEP** |
| **036** | `036_medicare_asc_base_rate_engine.sql` | Phase 60: `cms_asc_addenda`, `fn_resolve_medicare_base_rate` | **KEEP** |
| **037** | `037_cms_payment_indicators_and_interpretation.sql` | Phase 61: `cms_payment_indicators`, `fn_interpret_payment_indicator` | **KEEP** |
| **038** | `038_medicare_geographic_wage_adjustment.sql` | Phase 62: `medicare_wage_indices`, `fn_calculate_asc_wage_adjusted_rate` | **KEEP** |
| **039** | `039_device_intensive_payment_rules.sql` | Phase 63: `cms_device_intensive_procedures`, device offsets | **KEEP** |
| **040** | `040_multiple_procedure_payment_rules.sql` | Phase 64: `multiple_procedure_rule_sets`, MPPR cascades | **KEEP** |
| **041** | `041_payer_master.sql` | Phase 65: `payer_master`, `payer_plans`, `payer_identifiers` | **KEEP** |
| **042** | `042_payer_contract_model.sql` | Phase 66: `payer_contracts`, `payer_contract_versions`, `fn_resolve_payer_contract` | **KEEP** |
| **043** | `043_payer_contract_rate_rules.sql` | Phase 67: `payer_contract_rate_schedules`, `cpt_rates`, `case_rates`, `carve_outs` | **KEEP** |

---

## 3. DETAILED COMPONENT CLASSIFICATIONS

### 3.1 Component 1: `public.cms_asc_addenda` & `public.fn_resolve_medicare_base_rate`
- **Classification:** **KEEP**
- **Location:** `supabase/migrations/036_medicare_asc_base_rate_engine.sql`, `src/lib/medicareRateService.js`
- **Current Behavior:** Provides authoritative statutory CMS ASC baseline rates, payment indicators (`A2`, `G2`, `P2`, `P3`, `J8`, etc.), and 50/50 local wage index adjustments.
- **Evidence:** Lines 100–160 of `036_medicare_asc_base_rate_engine.sql`.
- **Limitation / Risk:** Must NOT be treated as commercial reimbursement. Must only be invoked when the resolved contract methodology is `PERCENT_OF_MEDICARE`.
- **Recommendation:** Keep as the upstream baseline provider. The Expected Reimbursement Engine will consume its outputs conditionally.

---

### 3.2 Component 2: `public.cms_device_intensive_procedures` & `fn_resolve_device_intensive_calculation`
- **Classification:** **KEEP**
- **Location:** `supabase/migrations/039_device_intensive_payment_rules.sql`, `src/lib/medicareDeviceService.js`
- **Current Behavior:** Resolves statutory device offset percentages and amounts for J8 procedures.
- **Evidence:** `039_device_intensive_payment_rules.sql` lines 80–140.
- **Limitation / Risk:** If commercial contracts carve out implants at invoice cost while reimbursing the CPT as % of Medicare, failing to subtract the device offset results in paying for the device twice (double-dipping clawback risk).
- **Recommendation:** Keep as device offset source; require Expected Reimbursement Engine to apply offset deduction when carve-outs are active.

---

### 3.3 Component 3: `public.multiple_procedure_rule_sets` & `multiple_procedure_rate_cascades`
- **Classification:** **KEEP**
- **Location:** `supabase/migrations/040_multiple_procedure_payment_rules.sql`, `src/lib/mpprService.js`
- **Current Behavior:** Stores effective-dated ranking metrics (`ALLOWABLE_DESC`, `FEE_DESC`), add-on code exemptions, and tier reductions (`COM_STD_CASCADE` 100/50/25/0, `COM_SYM_50` 100/50/50/50).
- **Evidence:** `040_multiple_procedure_payment_rules.sql` lines 25–95.
- **Limitation / Risk:** Must not be globally hardcoded to 50%; must be linked to the active contract version's `mppr_rule_set_code`.
- **Recommendation:** Keep as upstream ranking and multiplier provider.

---

### 3.4 Component 4: `public.payer_master` & `public.payer_plans`
- **Classification:** **KEEP**
- **Location:** `supabase/migrations/041_payer_master.sql`, `src/lib/payerMasterService.js`
- **Current Behavior:** Normalizes enterprise payers and health benefit plans with NAIC codes and clearinghouse routing identifiers.
- **Evidence:** `041_payer_master.sql` lines 25–80.
- **Limitation / Risk:** Legacy `public.payers` and `public.claims.primary_payer_id` still reference the old flat table instead of `payer_master`.
- **Recommendation:** Keep `payer_master` and map foreign keys from encounter calculations to `payer_master(id)` and `payer_plans(id)`.

---

### 3.5 Component 5: `public.payer_contracts` & `public.payer_contract_versions`
- **Classification:** **KEEP**
- **Location:** `supabase/migrations/042_payer_contract_model.sql`, `src/lib/payerContractService.js`
- **Current Behavior:** Implements immutable contract versions, multi-facility scopes, and temporal validity with `fn_resolve_payer_contract()`.
- **Evidence:** `042_payer_contract_model.sql` lines 20–100.
- **Limitation / Risk:** Contract resolution must return `CONTRACT_NOT_FOUND` if dates/facility do not match, without falling back to arbitrary defaults.
- **Recommendation:** Keep as the definitive contract version authority.

---

### 3.6 Component 6: `public.payer_contract_rate_schedules`, `cpt_rates`, `case_rates`, `carve_outs`
- **Classification:** **KEEP**
- **Location:** `supabase/migrations/043_payer_contract_rate_rules.sql`, `src/lib/payerRateService.js`
- **Current Behavior:** Stores contracted exhibits, line CPT rates, bundled case rate definitions, implant invoice markups, and stop-loss exception thresholds.
- **Evidence:** `043_payer_contract_rate_rules.sql` lines 25–200.
- **Limitation / Risk:** In `043`, `fn_calculate_commercial_reimbursement` had a base implementation that handled stop-loss and basic rates, but did not implement full case packaging roll-up or patient responsibility estimation.
- **Recommendation:** Keep normalized schema; build Phase 68 authoritative engine on top of these tables.

---

### 3.7 Component 7: `public.calculate_surgery_financials()`
- **Classification:** **REPLACE**
- **Location:** `supabase/migrations/022_cpt_versioning_and_licensed_content.sql` (lines 203–315), `src/lib/supabase.js` (lines 3901–3935)
- **Current Behavior:** Evaluates revenue using:
  ```sql
  v_proc_rate := COALESCE(v_proc.contracted_reimbursement, v_proc.line_expected_reimbursement, v_proc.baseline_charge, 0.00);
  ```
  If `contracted_reimbursement` is NULL, it falls back directly to `baseline_charge` (gross chargemaster)! Also applies arbitrary `$14.00/min` room cost and `$15.00/min` labor cost. Has no contract version resolution.
- **Evidence:** Line 278 of `022_cpt_versioning_and_licensed_content.sql`.
- **Limitation / Risk:** **CRITICAL FINANCIAL DEFECT (P0)**. Blurs gross charges and reimbursement. Silent fallback to gross charges inflates expected revenue by 300–400%!
- **Recommendation:** Deprecate and replace with Phase 68 authoritative server-side calculation engine `public.fn_calculate_expected_reimbursement()`.

---

### 3.8 Component 8: `public.payer_fee_schedules`
- **Classification:** **REPLACE**
- **Location:** `supabase/migrations/002_clinical_normalization.sql` (lines 121–135)
- **Current Behavior:** Flat table storing `(facility_id, payer_id, cpt_code_id, contracted_rate)`. References legacy `payers` and `cpt_codes`.
- **Evidence:** Lines 121–135 of `002_clinical_normalization.sql`.
- **Limitation / Risk:** Lacks contract versioning, exhibits, case rate bundles, carve-outs, or percentage-of-Medicare multipliers.
- **Recommendation:** Fully superseded by Phase 67 exhibits (`payer_contract_cpt_rates`); decommission in favor of normalized exhibits.

---

### 3.9 Component 9: `public.fn_resolve_cpt_pricing()`
- **Classification:** **REPLACE**
- **Location:** `supabase/migrations/022_cpt_versioning_and_licensed_content.sql` (lines 81–175)
- **Current Behavior:** Evaluates a 3-tier cascade: (1) `payer_fee_schedules` (legacy), (2) `cpt_code_versions` facility override, (3) `cpt_code_versions` CMS national standard. If gross charge is missing, computes `ROUND(reimbursement * 3.5)`.
- **Evidence:** Lines 81–175 of `022_cpt_versioning_and_licensed_content.sql`.
- **Limitation / Risk:** Bypasses Phase 60 statutory Medicare engine and Phase 66–67 contract models. Synthesizes gross charges from reimbursement using a hardcoded 3.5 multiplier.
- **Recommendation:** Replace with calls to `fn_resolve_contract_rate()` and `fn_resolve_medicare_base_rate()`.

---

### 3.10 Component 10: `public.claims` & `public.claim_lines`
- **Classification:** **REFACTOR**
- **Location:** `supabase/migrations/024_claim_scrubbing_rules.sql`, `src/lib/claimScrubbingService.js`
- **Current Behavior:** `claims` stores `total_expected_reimbursement` and `claim_lines` stores `expected_reimbursement`. `fn_generate_claim_from_encounter()` blindly copies `surgery_procedures.line_expected_reimbursement`.
- **Evidence:** Lines 341–410 of `024_claim_scrubbing_rules.sql`.
- **Limitation / Risk:** Has no foreign key link to the calculation snapshot header or version ID that generated the expected reimbursement.
- **Recommendation:** Refactor claim generation to link to the immutable `reimbursement_calculation_id` generated by the Phase 68 engine.

---

### 3.11 Component 11: `public.surgery_financial_snapshots`
- **Classification:** **REPLACE**
- **Location:** `supabase/migrations/003_audit_and_snapshots.sql` (lines 235–255)
- **Current Behavior:** Stores a single case-level summary row without line items, without calculation trace, without contract version foreign key, and with `UPDATE` granted to authenticated users.
- **Evidence:** Lines 235–255 of `003_audit_and_snapshots.sql`.
- **Limitation / Risk:** Lacks line-level explanation; lacks cryptographic integrity; grants mutation permissions to client.
- **Recommendation:** Replace with immutable, append-only calculation snapshot tables `reimbursement_calculations` and `reimbursement_calculation_lines`.

---

### 3.12 Component 12: Expected Reimbursement Explanation Engine
- **Classification:** **MISSING**
- **Location:** Not present in repository.
- **Current Behavior:** The frontend currently synthesizes explanation text in client-side JavaScript or leaves it blank.
- **Limitation / Risk:** Inconsistent explanation between UI, reports, and AI Analyst. Non-reproducible.
- **Recommendation:** Build authoritative server-side explanation generator that outputs a structured, human- and machine-readable execution trace from the calculation engine.

---

### 3.13 Component 13: Patient Responsibility Estimator
- **Classification:** **MISSING**
- **Location:** Not present in repository.
- **Current Behavior:** Entire contracted allowable is treated as expected payer reimbursement. Deductible, copayment, coinsurance, and non-covered patient upgrades are ignored.
- **Limitation / Risk:** Grossly overstates anticipated cash collection from insurance payers.
- **Recommendation:** Implement explicit separation of Contracted Total Allowable into Estimated Payer Portion and Estimated Patient Responsibility.

---

### 3.14 Component 14: Historical Calculation Recalculation & Diff Service
- **Classification:** **MISSING**
- **Location:** Not present in repository.
- **Current Behavior:** Recalculations overwrite previous results or produce isolated detached records.
- **Limitation / Risk:** Inability to perform financial audits or explain why expected reimbursement changed after contract renegotiations or coding corrections.
- **Recommendation:** Implement immutable calculation versioning (`calculation_sequence_number`), preserving original calculations with `recalculation_reason` and diff comparison.

---

## 4. CURRENT FINANCIAL CALCULATION DEFECTS IDENTIFIED

1. **Defect 1: Silent Fallback to Chargemaster Baseline (P0)**
   - *Location:* `022_cpt_versioning_and_licensed_content.sql` line 278.
   - *Impact:* `COALESCE(contracted, line_expected, baseline_charge)` treats gross chargemaster fees ($8,000–$15,000) as expected cash reimbursement when contracts are unmapped.
2. **Defect 2: Dual Pricing Engine Divide (P0)**
   - *Location:* `supabase.js` (`resolveCPTPricing`) vs `medicareRateService.js` vs `payerRateService.js`.
   - *Impact:* Client services call three competing pricing endpoints, leading to divergent numbers across screens.
3. **Defect 3: Absence of Patient Responsibility Partitioning (P1)**
   - *Location:* `024_claim_scrubbing_rules.sql` lines 48, 98.
   - *Impact:* Claims and reports treat 100% of allowable as payer reimbursement, distorting accounts receivable aging.
4. **Defect 4: Unversioned Snapshot Table with Client Mutation Grants (P1)**
   - *Location:* `003_audit_and_snapshots.sql` line 268.
   - *Impact:* `GRANT UPDATE ON surgery_financial_snapshots TO authenticated` allows client code to alter frozen financial snapshots.

---

## 5. AUDIT SUMMARY TABLE

| Component | Repository Location | Action | Reason |
| :--- | :--- | :--- | :--- |
| `cms_asc_addenda` | `036_medicare_asc_base_rate_engine.sql` | **KEEP** | Authoritative statutory CMS benchmark |
| `cms_device_intensive` | `039_device_intensive_payment_rules.sql` | **KEEP** | Statutory J8 device offset source |
| `multiple_procedure_rules` | `040_multiple_procedure_payment_rules.sql` | **KEEP** | Standardized MPPR ranking & multipliers |
| `payer_master` / `payer_plans` | `041_payer_master.sql` | **KEEP** | Normalized enterprise payer catalog |
| `payer_contracts` / `versions` | `042_payer_contract_model.sql` | **KEEP** | Contract model & multi-facility scopes |
| `payer_contract_rate_schedules` | `043_payer_contract_rate_rules.sql` | **KEEP** | Normalized rate exhibits & CPT rates |
| `calculate_surgery_financials` | `022_cpt_versioning_and_licensed_content.sql` | **REPLACE** | Flawed fallback to gross charges |
| `payer_fee_schedules` | `002_clinical_normalization.sql` | **REPLACE** | Legacy flat unversioned table |
| `fn_resolve_cpt_pricing` | `022_cpt_versioning_and_licensed_content.sql` | **REPLACE** | Outdated 3-tier cascade with 3.5 multiplier |
| `claims` / `claim_lines` | `024_claim_scrubbing_rules.sql` | **REFACTOR** | Link to immutable calculation snapshot ID |
| `surgery_financial_snapshots` | `003_audit_and_snapshots.sql` | **REPLACE** | Mutable summary row, lacks line items |
| `Explanation Engine` | None | **MISSING** | No server-side calculation trace generator |
| `Patient Responsibility` | None | **MISSING** | No copay/coinsurance/deductible deduction |
| `Recalculation Diff` | None | **MISSING** | No versioned comparison between calculations |

