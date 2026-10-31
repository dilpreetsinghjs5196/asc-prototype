# PHASE 67 — RISK AND BLOCKER REGISTER
## Comprehensive Vulnerability Analysis, Critical Architectural Blockers, and Mitigations

> **Module:** Commercial Rate Rules & Financial Adjudication Engine  
> **Target Migration:** `043_payer_contract_rate_rules.sql` (Planning Reference Only)  
> **Status:** PRODUCTION SPECIFICATION — READ-ONLY AUDIT STAGE  
> **Upstream Dependencies:** Phases 60–66 Verified

---

## 1. Risk Classification Methodology

Risks and blockers are evaluated using standard enterprise healthcare software rigor:
- **P0 — Critical Release Blocker:** Causes financial inaccuracy, audit clawbacks, security breach, cross-tenant data leakage, or silent corruption of financial records. Must be corrected prior to production deployment.
- **P1 — High Priority Risk:** Degrades calculation integrity, causes administrative delay, lacks edge-case validation, or introduces manual reconciliation bottlenecks. Must have an approved mitigation plan.
- **P2 — Medium Priority Concern:** UI usability frictions, non-blocking telemetry gaps, or sub-optimal batch indexing. Addressed during standard sprint cycles.

---

## 2. Identified Blockers & Risk Register

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 PHASE 67 RISK & BLOCKER MATRIX                                   │
├────┬──────┬──────────────────────────────────────────┬───────────┬───────────────┬───────────────┤
│ ID │ Sev  │ Risk Title / Description                 │ Area      │ Status        │ Target Phase  │
├────┼──────┼──────────────────────────────────────────┼───────────┼───────────────┼───────────────┤
│ R1 │ P0   │ Dual Pricing Architecture Divide         │ Core Arch │ Open Blocker  │ Phase 67 / 68 │
│ R2 │ P0   │ Hardcoded 35% Discount in Client Service │ Code Debt │ Open Blocker  │ Phase 67      │
│ R3 │ P0   │ J8 Device Offset "Double Dipping" Risk   │ Financial │ Open Blocker  │ Phase 67      │
│ R4 │ P0   │ Absence of Immutable Commercial Snapshot │ Audit/RLS │ Open Blocker  │ Phase 67      │
│ R5 │ P1   │ Unlisted CPT Silent Zero-Dollar Billing  │ Revenue   │ Open Risk     │ Phase 67      │
│ R6 │ P1   │ Unverified Implant Invoices on Carve-Out │ Compliance│ Open Risk     │ Phase 67      │
│ R7 │ P1   │ Multi-Facility Rate Leakage              │ Security  │ Open Risk     │ Phase 67      │
│ R8 │ P1   │ High-Volume Batch Simulation Timeouts    │ Perf/DB   │ Open Risk     │ Phase 67      │
│ R9 │ P2   │ Modifier 50 Unit Discrepancy (1 vs 2)    │ Billing   │ Monitored     │ Phase 67      │
└────┴──────┴──────────────────────────────────────────┴───────────┴───────────────┴───────────────┘
```

---

## 3. Deep-Dive Analysis of P0 Critical Blockers

### 3.1 [R1 - P0 Blocker] Dual Pricing Architecture Divide
- **Description:** The repository currently has two completely disconnected pricing engines:
  1. *Legacy Clinical Engine:* `calculate_surgery_financials()` and `surgery_procedures.contracted_reimbursement` referencing legacy `payer_fee_schedules` (Migration 002).
  2. *Modern Contract Architecture:* `fn_resolve_payer_contract()` and `payer_contract_versions` (Migration 042).
- **Impact:** Case costing dashboards on the frontend might query legacy flat fee schedules, while billing tools query Phase 66/67 contracts, producing conflicting financial figures for the same surgical case.
- **Mandatory Mitigation:**
  1. Deprecate legacy `calculate_surgery_financials()` in favor of `fn_calculate_commercial_reimbursement()`.
  2. Maintain a database view `payer_fee_schedules` pointing to `payer_contract_cpt_rates` for backwards compatibility during migration.

---

### 3.2 [R2 - P0 Blocker] Hardcoded 35% Discount in Client Service
- **Description:** Line 425 of `src/services/payerContractService.js` contains a hardcoded fallback:
  ```javascript
  const billedDiscount = gross * 0.65; // Assumes 35% discount
  ```
- **Impact:** Any commercial claim adjudicated through this frontend service without an explicit fee schedule rate is silently priced at a 35% discount, regardless of the payer's actual contracted discount rate (which typically ranges between 15% and 60%).
- **Mandatory Mitigation:**
  1. Eradicate all client-side fallback discount math.
  2. Read `payer_contract_versions.billed_charge_discount_pct` directly from the database via server-side RPC.
  3. Raise a structured error `UNCONTRACTED_DISCOUNT_MISSING` if no percentage is defined.

---

### 3.3 [R3 - P0 Blocker] J8 Device-Intensive "Double Dipping" Risk
- **Description:** On CMS Payment Indicator `J8` procedures (e.g. CPT 23430, 29888), the statutory Medicare baseline already embeds a 30% to 75% device offset. If an ASC's commercial contract specifies "175% of Medicare plus Invoice Cost + 10% for Implants", a naive engine adds the carve-out on top of the unreduced Medicare rate, paying for the hardware twice.
- **Impact:** Guaranteed post-payment audit clawbacks from payers, potential civil False Claims Act exposure if Medicare Advantage is involved, and distorted surgeon profitability metrics.
- **Mandatory Mitigation:**
  1. Implement automated device offset subtraction in `fn_resolve_contract_rate()`:
     $$\text{Service Baseline} = \text{National Rate} - \text{Device Offset Amount}$$
  2. Only add the carve-out calculation to the isolated service allowable.

---

### 3.4 [R4 - P0 Blocker] Absence of Immutable Commercial Snapshot Ledger
- **Description:** While Phase 60 implemented `medicare_base_rate_calculations` and `medicare_base_rate_calc_lines` for statutory Medicare audits, commercial contracts currently have no immutable snapshot ledger. Claims reference live rate tables directly.
- **Impact:** When a managed care contract is renegotiated or updated in 2025, past cases from 2024 dynamically recalculate at 2025 rates, corrupting historical general ledger accounting and retrospective profitability reports.
- **Mandatory Mitigation:**
  1. Deploy `payer_contract_rate_calculations` and `payer_contract_rate_calculation_lines` in Migration 043.
  2. Stamp every completed case calculation with an immutable SHA-256 fingerprint.

---

## 4. Deep-Dive Analysis of P1 High Priority Risks

### 4.1 [R5 - P1 Risk] Unlisted CPT Silent Zero-Dollar Billing
- **Scenario:** A surgeon performs an unlisted arthroscopic procedure (CPT 29999). It is not listed in Exhibit A. A naive calculation engine evaluates the rate to `NULL` or `$0.00`.
- **Mitigation:** Enforce "Fail-Closed" contract default rules:
  1. Check contract `unlisted_cpt_methodology`.
  2. If methodology = `PERCENT_OF_BILLED_CHARGES`, apply discount to gross charge.
  3. If unconfigured, mark calculation status `NEEDS_MANUAL_ADJUDICATION_REVIEW` and block claim generation.

### 4.2 [R6 - P1 Risk] Unverified Implant Invoices on Carve-Out Claims
- **Scenario:** An implant carve-out is claimed on a commercial claim, but the vendor invoice has not yet been scanned or approved by sterile processing/materials management.
- **Mitigation:**
  1. Claim scrubber rule blocks claim submission if `is_carve_out = TRUE` and `implant_invoice_id IS NULL`.
  2. Emit warning `IMPLANT_INVOICE_REQUIRED_FOR_CARVEOUT` in UI.

### 4.3 [R7 - P1 Risk] Multi-Facility Rate Exhibit Contamination
- **Scenario:** An organization contract version covers 3 facilities, but Facility C has a lower fee schedule carve-out negotiated with local Blue Cross.
- **Mitigation:**
  1. Phase 66 contract scoping (`payer_contract_facility_scopes`) takes precedence over parent organization defaults.
  2. The resolver checks facility-level rate exhibits before parent organization defaults.

