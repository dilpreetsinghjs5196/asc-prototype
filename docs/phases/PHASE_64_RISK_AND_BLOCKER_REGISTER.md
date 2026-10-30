# PHASE 64 — RISK AND BLOCKER REGISTER
## Forensic Vulnerability Analysis, Upstream Defects, and Release Gates

**Evaluation Scope**: Multiple Procedure Payment Reduction (MPPR) Engine, Payer Fee Schedules, Financial Integrity  
**Risk Classification Standard**: P0 (Critical Financial/Regulatory Blocker) | P1 (High Impact Defect) | P2 (Medium Operational Defect)  
**Status**: Active Production Gate

---

## 1. P0/P1 Risk and Blocker Matrix

| ID | Severity | Category | Risk Description | Root Cause / Repository Finding | Impact on Facility Operations | Mandatory Resolution Gate |
| :---: | :---: | :---: | :--- | :--- | :--- | :--- |
| **BLK-64-01** | **P0** | **Financial Integrity** | **Dual Competing Calculation Engines in Client Layer** | `src/utils/hospitalUtils.js` contains both `calculateMedicareRevenue` and `calculateAuthoritativeAscRevenue`. The latter applies flat 50% cuts to whole lines, completely stripping J8 device offset protections. | Depending on which screen is viewed, estimated case margin swings by thousands of dollars ($1,740+ per knee/disc arthroplasty). | Deprecate `calculateAuthoritativeAscRevenue`. Consolidate all reimbursement logic into server-side RPC `fn_calculate_mppr_reimbursement`. |
| **BLK-64-02** | **P0** | **Regulatory Violation** | **Client-Side Chargemaster Fallback in Procedure Ranking** | In `hospitalUtils.js` line 189, if Medicare allowable is null/undefined, `getBasePrice` falls back to `gross_charge`. Sorting by gross charge violates CMS ranking rules. | Highly charged minor procedures (e.g., $18,000 minor scope) rank over lower-charged high-value procedures ($12,000 spine case), causing catastrophic underpayment estimates. | Enforce fail-closed ranking: only authoritative CMS/payer allowable rates may be used for ranking. Missing rate halts calculation with `ERR_MISSING_FEE_SCHEDULE`. |
| **BLK-64-03** | **P1** | **Audit Incompleteness** | **Absence of Server-Side MPPR Calculation Audit Snapshots** | `calculate_surgery_financials` updates case revenue but writes zero persistent ledger records of line-by-line rank order, pre-cut allowable, or reduction dollars. | Inability to defend billing audits or verify RAC (Recovery Audit Contractor) clawbacks against historical CMS releases. | Deploy `public.mppr_calculation_snapshots` and `public.mppr_calculation_lines` with immutability triggers. |
| **BLK-64-04** | **P1** | **Contractual Non-Compliance** | **Lack of Commercial Payer MPPR Cascades** | `public.payer_fee_schedules` records flat rates but has no structure for payer discount cascades (100/50/25/0). Commercial lines are either unreduced or reduced by Medicare rules. | Inaccurate billing estimates on commercial claims. Either claims are underbilled (if 0% lines are billed) or underpaid by surprise contract discounts. | Deploy `public.multiple_procedure_rule_sets` and assign rule sets to commercial payers. |
| **BLK-64-05** | **P1** | **Regulatory Non-Compliance** | **Absence of CMS Endoscopy Family Base-Code Deduction Logic** | Multiple endoscopies are currently cut by a flat 50%, ignoring the CMS statutory base-code difference rule under 42 CFR § 416.172(c). | Incorrect Medicare reimbursement calculations on all multi-colonoscopy and upper endoscopy cases. | Deploy `public.cms_endoscopy_families` and implement base-code difference deduction. |
| **BLK-64-06** | **P2** | **Billing Workflow** | **Missing Modifier 51 Claim Scrubber Edit for Commercial Payers** | Scrubber does not distinguish Medicare (which prohibits 51) from commercial payers (which require 51 on secondary lines). | Commercial claims denied by payers as duplicate services; Medicare claims returned for improper modifier 51 reporting. | Implement scrubber rule `SCRUB-COMM-51` enforcing 51 on commercial secondary lines and blocking 51 on Medicare claims. |

---

## 2. Invariant Protection Rules

To prevent financial leakage, regulatory penalties, and audit exposure, the following invariants are non-negotiable:

1. **Gross Charge Ban**: Gross chargemaster charges shall NEVER be used to rank procedures for Medicare MPPR, nor shall they substitute for missing reimbursement rates.
2. **Device Offset Protection Invariant**: The statutory device offset amount on Payment Indicator `J8` procedures shall NEVER be discounted by 50% under Medicare ASC MPPR.
3. **Single-Line Bilateral Invariant**: Modifier 50 must be billed on exactly 1 line with units = 1. Doubled units with modifier 50 represent an illegal 300% billing inflation.
4. **Add-On Exemption Invariant**: Add-on codes (CPT codes with `+`) shall NEVER receive an MPPR discount across any unit or rank.
5. **Packaged Exclusion Invariant**: Packaged services (`N1`) shall receive exactly $0.00 separate payment and shall NEVER be entered into the MPPR ranking queue.
6. **No Cascading Deletion of Financial Snapshots**: Snapshots must use `ON DELETE RESTRICT` or statement-level triggers to guarantee that financial audit evidence cannot be purged.

---

## 3. Upstream Dependency Verification

| Upstream Phase | Required Status | Current Implementation Status | Release Impact |
| :--- | :--- | :--- | :--- |
| **Phase 60 — Base Rate Engine** | Deployed | **VERIFIED** (`036_medicare_asc_base_rate_engine.sql`) | Ready. Resolves baseline national unadjusted rates. |
| **Phase 61 — Payment Indicators** | Deployed | **VERIFIED** (`037_cms_payment_indicators_and_interpretation.sql`) | Ready. Provides `is_mppr_eligible` metadata. |
| **Phase 62 — Geographic Wage Adjustment** | Deployed | **VERIFIED** (`038_medicare_geographic_wage_adjustment.sql`) | Ready. Provides facility CBSA wage index resolution. |
| **Phase 63 — Device-Intensive Payment Rules** | Deployed | **VERIFIED** (`039_device_intensive_payment_rules.sql`) | Ready. Provides J8 device offset math and C-code packaging. |

---

## 4. Final Risk Assessment

All four upstream phases (60, 61, 62, and 63) are verified and in production. The primary risk to Phase 64 is the existence of legacy competing client functions (`calculateAuthoritativeAscRevenue`) and the absence of a server-side snapshot ledger. 

**Risk Verdict**: **CONDITIONAL GO**.  
Phase 64 can proceed to implementation once the implementation plan specifies the complete deprecation of duplicate client calculators and enforces server-side authoritative snapshot logging.
