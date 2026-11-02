# PHASE 69 — QA AND ACCEPTANCE CRITERIA
## Comprehensive Test Plan, Verification Matrix & Definition of Done

> **Module:** Expected Reimbursement Engine & Rate Adjudication  
> **Status:** QA ACCEPTANCE SPECIFICATION  
> **Target Version:** ASCANALYST v2026.1  
> **Author:** Principal QA Architect, Financial Systems Test Engineer  

---

## 1. COMPREHENSIVE TEST SUITE MATRIX

The matrix below details the required automated tests across six distinct verification domains:

| Test ID | Test Category | Scenario Description | Execution Harness | Expected Behavior | Pass / Fail Criteria |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`SRC-01`** | Source Integrity | Valid source raw file upload & checksum | Node / pgTAP | Computes SHA-256 digest; matches raw bytes. | Exact hash equality. |
| **`SRC-02`** | Source Integrity | Tampered raw file detection | Database Test | Staged file with altered byte trips checksum check. | Rejects with `CHECKSUM_MISMATCH`. |
| **`SRC-03`** | Source Integrity | Duplicate version upload rejection | Database Test | Uploading same `(source_id, version_code)` fails. | Unique constraint violation. |
| **`SRC-04`** | Source Integrity | Unapproved source calculation block | Stored Procedure | Adjudication query excludes `DRAFT` sources. | Sets `BASELINE_NOT_AVAILABLE`. |
| **`EFF-01`** | Effective Dates | Exact DOS version match | Resolution Engine | DOS `2026-05-15` resolves to active `2026-Q2` version.| Correct version ID returned. |
| **`EFF-02`** | Effective Dates | Effective date window boundary | Resolution Engine | DOS on exact start (`2026-01-01`) resolves correctly. | Correct version ID returned. |
| **`EFF-03`** | Effective Dates | Version gap fails closed | Resolution Engine | DOS in gap between expired Q1 and future Q2 fails. | Sets `BASELINE_NOT_AVAILABLE`. |
| **`EFF-04`** | Effective Dates | Overlapping active version rejection | Database Constraint | Inserting overlapping date ranges for active source. | Exclusion constraint violation. |
| **`TRC-01`** | Calculation Trace| Complete line formula logging | Stored Procedure | Every line creates ordered step entries in traces table.| Complete trace JSON returned. |
| **`TRC-02`** | Calculation Trace| Unapplied rule logging | Stored Procedure | Inapplicable MPPR or stop-loss logged in unapplied table.| Explanations populated. |
| **`TRC-03`** | Calculation Trace| Missing rate fails closed | Stored Procedure | CPT with no fee schedule or default rule fails. | Status `RATE_NOT_FOUND`. |
| **`SEC-01`** | Security & RBAC | Cross-tenant trace access denied | RLS Policy | User in Org A queries calculation trace in Org B. | `403 Forbidden` / 0 rows. |
| **`SEC-02`** | Security & RBAC | Separation of Duties (SoD) block | Stored Procedure | User who uploaded dataset attempts to approve it. | Exception: `SoD Violation`. |
| **`SEC-03`** | Security & RBAC | Unauthorized trace mutation block | Database Trigger | Direct SQL UPDATE on `reimbursement_calculation_traces`.| Trigger raises `Audit Violation`.|
| **`FIN-01`** | Financial Math | Exact decimal precision | Unit Test | All currency asserted in `NUMERIC(12,2)`. | Zero JS float drift ($0.00 delta).|
| **`FIN-02`** | Financial Math | Zero-sum liability partition | Check Constraint | `patient_responsibility + payer_reimbursement = allowable`. | Constraint validated. |
| **`REG-01`** | Regression | Claim scrubber gross charge integrity | E2E Workbench | Scrubber displays expected rate without mutating billed charge.| Billed charges intact. |

---

## 2. DEFINITION OF DONE FOR PHASE 69

A feature in Phase 69 is defined as **COMPLETE** only when all of the following gates are satisfied:
1. **Schema Specifications Complete:** All data models (`reimbursement_sources`, `reimbursement_source_versions`, `reimbursement_calculation_traces`, `reimbursement_unapplied_rules`) are formally documented with types, constraints, and indexes.
2. **Deterministic Precedence Codified:** The 5-tier resolution cascade is mathematically defined without universal assumptions.
3. **Trace & Unapplied Models Documented:** Clear schema defined for both triggered rules and bypassed rules.
4. **Security & SoD Policed:** Separation of Duties between dataset importers and approvers is enforced by database rules.
5. **Zero Floating Point Math:** All financial calculations strictly use PostgreSQL `NUMERIC` with Round Half-Up.
6. **Zero Purple/Violet Tokens:** All UI specifications strictly obey the Maestro Purple Ban.
7. **Unanimous Documentation Parity:** 100% cryptographic parity achieved between workspace and master specification directories.
