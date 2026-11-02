# PHASE 68 — AUDIT CROSS-DOCUMENT CONSISTENCY REPORT
## Cross-Phase Alignment Analysis for Contracts, Calculations, Ledgers, and Migration Governance

> **Module:** Expected Reimbursement Engine & Rate Adjudication  
> **Status:** AUDIT CONSISTENCY REPORT — READ-ONLY VALIDATION  
> **Target Version:** ASCANALYST v2026.1  
> **Author:** Principal Database Security Architect, Financial Systems Auditor  

---

## 1. CROSS-DOCUMENT ARTIFACT COMPARISON MATRIX

The matrix below compares the audit, provenance, and ledger invariants across all Phase 66, 67, and 68 documentation specifications and pending migrations:

| Specification Document | Migration 044 Status | Hash Formulation | Status Enum | Ledger Immutability Model | Dependency on Phase 67 | Alignment State |
| :--- | :---: | :--- | :---: | :--- | :---: | :---: |
| **`68_TARGET_ARCHITECTURE.md`** | `[PROPOSED / UNAUTHORIZED]` | Full Sub-Tree Coverage | 10 Canonical | Append-only ledger | Mandatory Gate | ✅ Consistent |
| **`68_SECURITY_AND_RBAC.md`** | `[PROPOSED / UNAUTHORIZED]` | SHA-256 Ledger Digest | 10 Canonical | Zero client writes, Force RLS | Mandatory Gate | ✅ Consistent |
| **`68_DATA_MODEL_AND_MIGRATION_PLAN.md`**| `[SPECIFICATION ONLY]` | SHA-256 Hash Column | 10 Canonical | Append-only with triggers | Mandatory Gate | ✅ Consistent |
| **`68_API_AND_SERVICE_CONTRACTS.md`** | `[CONTRACT DESIGN ONLY]` | Verified Hash Payload | 10 Canonical | Versioned sequence generation | Mandatory Gate | ✅ Consistent |
| **`68_CALCULATION_RULES_AND_EXAMPLES.md`**| `[CALCULATION SPEC ONLY]`| Mathematical Determinism | 10 Canonical | Append-only case studies | Mandatory Gate | ✅ Consistent |
| **`68_UI_WORKFLOW_SPECIFICATION.md`** | `[UI DESIGN SPEC ONLY]` | Visual Hash Pill & Verify | 10 Canonical | Sequence history & diff | Mandatory Gate | ✅ Consistent |
| **`68_QA_AND_ACCEPTANCE_CRITERIA.md`** | `[QA VERIFICATION SPEC]` | Test Suite Assertion | 10 Canonical | Immutability trigger checks | Mandatory Gate | ✅ Consistent |
| **`044_expected_reimbursement_engine.sql`**| **PROPOSED / PENDING** | Header-Only `CONCAT_WS` | 11 Statuses (incl. Stop-loss) | In-place update whitelist | Mandatory Gate | ⚠️ **Discrepancy (See Sec 2)** |

---

## 2. FORENSIC DISCREPANCY AUDIT & RECONCILIATION DIRECTIVES

### 2.1 Discrepancy 1: Hash Scope in Migration 044 vs. Architecture Specification
- **Finding:** In `044_expected_reimbursement_engine.sql`, lines 578–590 compute `v_calc_hash` using header fields only (`v_facility_id`, `p_surgery_id`, `v_payer_id`, `v_dos`, `v_total_allowable`, etc.). The line items in `reimbursement_calculation_lines` and adjustments in `reimbursement_calculation_adjustments` are **omitted** from the hash.
- **Architectural Specification:** `68_CANONICAL_HASH_DESIGN.md` mandates RFC 8785 Canonical JSON covering header, lines, and adjustments.
- **Reconciliation Directive:** Migration 044 must remain UNAUTHORIZED. Prior to any future implementation review, the stored procedure `fn_calculate_expected_reimbursement` must be revised to serialize the canonical sub-tree payload before hashing.

### 2.2 Discrepancy 2: In-Place Mutation Whitelist vs. Pure Ledger Immutability
- **Finding:** In `044_expected_reimbursement_engine.sql`, line 606 updates historical rows in place (`SET is_latest_calculation = FALSE`), and line 863 creates a trigger whitelist permitting updates to `is_latest_calculation` and `superseded_by_calculation_id`.
- **Architectural Specification:** `68_LEDGER_IMMUTABILITY_AND_LINEAGE.md` identifies this as a violation of pure append-only ledger principles and recommends decoupling active calculation tracking into `reimbursement_calculation_pointers`.
- **Reconciliation Directive:** Preserved as a documented limitation of the proposed migration. Approach B (Decoupled State Pointer) must be evaluated in the formal Migration 044 revision cycle.

### 2.3 Discrepancy 3: Status Enum in Migration 044 Check Constraint
- **Finding:** In `044_expected_reimbursement_engine.sql`, line 48 includes `'STOP_LOSS_APPLIED'` in the `calculation_status` check constraint enum, whereas the Target Architecture establishes 10 canonical statuses and models stop-loss via the boolean flag `stop_loss_triggered = TRUE`.
- **Reconciliation Directive:** Documented for correction during the pre-deployment migration review.

---

## 3. UPSTREAM PHASE DEPENDENCY GOVERNANCE

1. **Phase 66 (Payer Contract Model & Versioning):** Fully verified in database schema (`payer_contracts`, `payer_contract_versions`). Active contract resolution is functional.
2. **Phase 67 (Payer Contract Rate Rules & Methodologies):** Documented in `043_payer_contract_rate_rules.sql`. **Preserved as a mandatory approval and deployment gate.** Phase 68 cannot calculate commercial rates without Phase 67's exhibits.
3. **Phase 68 (Expected Reimbursement Engine):** **Migration 044 remains UNAUTHORIZED.** No deployment readiness is claimed.

