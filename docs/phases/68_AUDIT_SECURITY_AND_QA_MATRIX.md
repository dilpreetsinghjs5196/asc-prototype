# PHASE 68 — AUDIT, SECURITY AND QA ACCEPTANCE MATRIX
## Comprehensive 25-Scenario Verification Matrix for Ledger Cryptography, Lineage, and Tenancy

> **Module:** Expected Reimbursement Engine & Rate Adjudication  
> **Status:** AUDIT & QA ACCEPTANCE SPECIFICATION  
> **Target Version:** ASCANALYST v2026.1  
> **Author:** Principal Database Security Architect, Principal QA Engineer  

---

## 1. COMPREHENSIVE 25-SCENARIO VERIFICATION MATRIX

The matrix below specifies the exact test assertions, execution harnesses, and pass/fail criteria required for Phase 68 audit, security, and cryptographic provenance:

| Test ID | Category | Scenario Description | Execution Method | Expected Behavior | Pass / Fail Criteria |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`AUD-01`** | Hash Integrity | Valid calculation snapshot hash verification | `fn_verify_reimbursement_calculation_integrity` | Recomputed canonical hash exactly matches recorded `calculation_hash`. | `is_valid = TRUE`, matching hashes returned. |
| **`AUD-02`** | Tamper Detection | Header allowable field alteration | Direct SQL UPDATE on `total_contract_allowable` (simulated superuser) | Verification RPC detects variance between row state and recorded hash. | `is_valid = FALSE`, message: `TAMPER ALERT`. |
| **`AUD-03`** | Tamper Detection | Child line amount alteration | Direct SQL UPDATE on `line_contract_allowable` in lines table | Verification RPC detects variance in line-item subtree. | `is_valid = FALSE`, hash mismatch detected. |
| **`AUD-04`** | Tamper Detection | Unauthorized child line insertion | Direct SQL INSERT of unauthorized CPT into lines table | Line count and concatenated line sub-tree altered; hash mismatch flagged. | `is_valid = FALSE`, hash mismatch detected. |
| **`AUD-05`** | Tamper Detection | Unauthorized child line deletion | Direct SQL DELETE of CPT line item | Line count altered; hash mismatch flagged. | `is_valid = FALSE`, hash mismatch detected. |
| **`AUD-06`** | Tamper Detection | Adjustment table alteration | Direct SQL UPDATE on `adjustment_amount` in adjustments table | Adjustment subtree altered; hash mismatch flagged. | `is_valid = FALSE`, hash mismatch detected. |
| **`AUD-07`** | Provenance | Missing source version reference | Insert calculation with `NULL` `contract_version_id` | Database foreign key constraint or CHECK constraint rejects insertion. | Foreign key / NOT NULL constraint violation. |
| **`AUD-08`** | Serialization | NULL vs. empty string distinction | Compare canonical payload of `{field: null}` vs `{field: ""}` | Serialization emits distinct tokens; hashes are completely different. | `hash(null) <> hash("")`. |
| **`AUD-09`** | Serialization | Deterministic decimal formatting | Compare `150.00::numeric` vs `150::numeric` | Formatted strictly via `to_char('FM999999990.00')`; hashes are identical. | Exact hash equality. |
| **`AUD-10`** | Determinism | Stable line ordering on equal keys | Multiple procedures with same `line_number` or CPT | Deterministic multi-column sort (`ORDER BY line_number, cpt_code, id`) ensures identical order. | Hash remains identical across test runs. |
| **`AUD-11`** | Tenancy Isolation | Cross-organization verification | User in Org A calls `fn_verify` on Org B calculation | `is_facility_accessible()` check in RPC rejects caller before returning payload. | `403 Forbidden` / `ACCESS_DENIED`. |
| **`AUD-12`** | Immutability | Unauthorized direct table UPDATE | Authenticated biller attempts `UPDATE reimbursement_calculations` | Statement-level trigger `trg_block_reimbursement_mutation` aborts transaction. | PostgreSQL Exception: `Financial Ledger Violation`. |
| **`AUD-13`** | Immutability | Unauthorized direct table DELETE | Authenticated biller attempts `DELETE FROM reimbursement_calculations` | Statement-level trigger aborts transaction. | PostgreSQL Exception: `Financial Ledger Violation`. |
| **`AUD-14`** | Immutability | Unauthorized child record mutation | Authenticated biller attempts `UPDATE reimbursement_calculation_lines` | Statement-level trigger on child table aborts transaction. | PostgreSQL Exception: `Financial Ledger Violation`. |
| **`AUD-15`** | Superuser Audit | Privileged database operator tampering | PostgreSQL `postgres` superuser alters row with triggers disabled | Audit log detects hash mismatch on subsequent verification; WAL forensics log DDL bypass. | Documented limitation: Superuser tampering requires external WAL / WORM storage. |
| **`AUD-16`** | Concurrency | Simultaneous recalculation race | Two parallel client sessions trigger recalculation for same surgery | Transaction advisory lock (`pg_advisory_xact_lock`) serializes transactions; both receive valid sequences. | Sequences generated are strictly `[1, 2]` without duplication. |
| **`AUD-17`** | Lineage | Circular succession prevention | Attempt to set `superseded_by_calculation_id = id` | Database check constraint or foreign key logic rejects circular reference. | Constraint violation: `CHECK (superseded_by <> id)`. |
| **`AUD-18`** | Governance | Mandatory recalculation reason | Trigger recalculation with empty reason (`""` or `< 10 chars`) | Stored procedure raises exception prior to committing sequence. | Exception: `Recalculation Governance Violation`. |
| **`AUD-19`** | State Machine | Failed calculation distinction | Encounter missing CPT rates prices with status `RATE_NOT_FOUND` | Record is saved with `RATE_NOT_FOUND` without updating active calculation pointer. | Active pointer remains on previous valid snapshot. |
| **`AUD-20`** | Atomicity | Calculation & audit log atomicity | Stored procedure encounters constraint violation during line insert | Complete transaction rolls back; no orphan audit log or header record persists. | Zero partial records in database. |
| **`AUD-21`** | Identity | Client-supplied actor spoofing | Caller passes `{p_user_id: "fake-uuid"}` to RPC | Procedure ignores parameter and reads `auth.uid()`; recorded actor matches authenticated JWT. | `calculated_by = auth.uid()`. |
| **`AUD-22`** | Network Security| Untrusted client telemetry | Client sends forged `X-Forwarded-For: 127.0.0.1` | IP is stored in `client_telemetry_hints` only; no authorization permissions granted based on IP. | System treats IP as unauthenticated hint. |
| **`AUD-23`** | Reproducibility| Exact 10-year historical reproduction | Rerun calculation using historical version-locked contract & CMS addenda | Mathematical engine produces identical dollar amounts to the exact cent ($0.00 delta). | Allowable matches original calculation to $0.01. |
| **`AUD-24`** | Non-Overwrite | Current-rule calculation isolation | Rerun calculation using newly updated current fee schedule | Generates new distinct calculation sequence; does NOT overwrite historical sequence #1. | Sequence #1 remains untouched in database. |
| **`AUD-25`** | PHI & Access | Unauthorized audit log access | Clinical nurse role attempts to query `public.audit_logs` | PostgreSQL RLS policy rejects SELECT query. | 0 rows returned or `403 Forbidden`. |

---

## 2. TEST IMPLEMENTATION HARNESS REQUIREMENTS

1. **Synthetic Data Policy:** All test encounters, surgeon names, and patient IDs must be 100% synthetic (e.g., `Patient: John Doe (MRN 7721)`). Zero real PHI may exist in test fixtures.
2. **Dual-Harness Execution:**
   - **Database-Level Controls:** Verified using `pgTAP` suites inside isolated PostgreSQL testing containers.
   - **Service & Contract Controls:** Verified using Node.js test runner (`node --test tests/reimbursement-security-rbac.test.js`).

