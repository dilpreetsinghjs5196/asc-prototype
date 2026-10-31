# PHASE 66 — PAYER CONTRACT MODEL: RISK AND BLOCKER REGISTER

**Author:** ASCANALYST Risk Management & Clinical Engineering  
**Scope:** Architecture Blockers, Financial Risks, Upstream Dependencies, Regression Safeguards  

---

## 1. Upstream Dependency Verification

| Upstream Phase | Component | Verification Status | Dependency Requirement for Phase 66 |
| :--- | :--- | :--- | :--- |
| **Phase 60** | `medicare_base_rate_calculations` | **VERIFIED** | Provides localized ASC base rates for `% of Medicare` multipliers. |
| **Phase 61** | `cms_payment_indicator_definitions` | **VERIFIED** | Supplies indicator interpretations (A2, G2, J8, R2). |
| **Phase 62** | `medicare_wage_indices`, CBSA mappings | **VERIFIED** | Calculates geographic wage scaling. |
| **Phase 63** | `cms_device_intensive_procedures` | **VERIFIED** | Separates wage-adjusted service portion from unadjusted device portion. |
| **Phase 64** | `multiple_procedure_rule_sets` | **VERIFIED** | Supplies cascading reduction rules (`COM_STD_CASCADE`, `CMS_50_PERCENT`). |
| **Phase 65** | `payer_master`, `payer_plans` | **VERIFIED** | Foundation entity model. All contracts bind to `payer_master(id)`. |

---

## 2. Identified Risks, Failure Modes & Mitigation Strategies

### Risk 1: Overlapping Active Contracts with Conflicting Multipliers (Severity: P1 — High)
- **Failure Mode**: Two active contracts cover the same facility, payer, and plan during the same date of service, but specify different multipliers (e.g. 140% vs. 150%).
- **Financial Impact**: Arbitrary or inconsistent claim reimbursement estimations, distorted EBITDA reporting.
- **Mitigation Strategy**:
  - Implement unique partial index and conflict detection trigger `fn_check_payer_contract_overlap()`.
  - When equal-precedence overlap is detected, contract activation is blocked with error `CONTRACT_OVERLAP_CONFLICT`.
  - Engine fails closed and flags encounters for manual supervisor review.

### Risk 2: Silent Substitution of Missing Commercial Rates with Zero or Medicare (Severity: P1 — High)
- **Failure Mode**: An operative report bills a CPT code not present in the commercial fee schedule; system silently defaults to `$0.00` or Medicare rate.
- **Financial Impact**: Erroneous financial write-offs, inaccurate patient collections, or underbilling payers.
- **Mitigation Strategy**:
  - Engine enforces strict fail-closed contract evaluation.
  - If a CPT is not found in `payer_contract_terms`, the engine checks for an explicit contract fallback (e.g. `% of billed charges`). If none exists, emits `UNPRICED_CPT_CODE` and prevents final claim generation.

### Risk 3: Retroactive Amendment Tampering with Historical Financial Snapshots (Severity: P1 — High)
- **Failure Mode**: An amendment effective retroactively alters historical `surgery_financial_snapshots` or finalized claim records.
- **Financial Impact**: Destroys auditability, alters previously audited fiscal period financial statements.
- **Mitigation Strategy**:
  - `surgery_financial_snapshots` remains strictly immutable once frozen.
  - Retroactive amendments create a new contract version with an effective start date in the past, but do NOT rewrite prior frozen snapshots.
  - Emits a delta variance report for accounts receivable underpayment recovery.

### Risk 4: Unauthenticated or Cross-Tenant Document Access (Severity: P2 — Medium)
- **Failure Mode**: A user from Facility A accesses proprietary fee schedules belonging to Facility B.
- **Financial Impact**: Breach of commercial non-disclosure agreements, legal liability.
- **Mitigation Strategy**:
  - Storage bucket `payer-contracts` is strictly private.
  - Download URLs generated via short-lived signed URLs (15-min TTL) with server-side facility membership verification.
  - Every document download logged in `payer_contract_audit_logs`.

### Risk 5: Accidental Re-use of Implant Vendor Contract Logic (Severity: P2 — Medium)
- **Failure Mode**: Developer attempts to reuse `facility_vendor_contracts` for payer agreements.
- **Impact**: Schema pollution, loss of payer plan scoping, broken COB hierarchies.
- **Mitigation Strategy**:
  - Keep vendor supply procurement contracts completely separate from payer revenue contracts.
  - Dedicated service layer `payerContractService.js` wired exclusively to `payer_contracts`.

---

## 3. Financial Regression Prevention Safeguards

To prevent Phase 66 implementation from corrupting existing calculations:
1. **Medicare Claims Untouched**: Medicare statutory claims (`payer_category = 'Medicare'`) continue using `medicareAscService.js` and statutory addenda without diversion.
2. **Phase 64 MPPR Integrity**: MPPR secondary reductions in `mpprService.js` remain authoritative for procedural ranking.
3. **Phase 63 Device Non-Degradation**: Device offset calculations remain shielded from wage index reductions.
4. **Historical Snapshots Preserved**: Frozen cases retain their exact historical expected reimbursement numbers.

---

*Proceed to Implementation Plan.*
