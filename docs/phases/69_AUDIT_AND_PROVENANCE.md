# PHASE 69 — AUDIT AND PROVENANCE SPECIFICATION
## Cryptographic Integrity, Source Lineage, and 10-Year Historical Defensibility

> **Module:** Expected Reimbursement Engine & Rate Adjudication  
> **Status:** AUDIT & PROVENANCE SPECIFICATION  
> **Target Version:** ASCANALYST v2026.1  
> **Author:** Principal Security Architect, Compliance and Audit Officer  

---

## 1. THE SEVEN-TIER AUDIT DEFENSE MATRIX

In compliance with CMS Medicare ASC regulations, SOX § 404 financial audits, and HIPAA § 164.312(b), Phase 69 establishes an unbroken chain of custody across seven distinct verification tiers:

| Verification Tier | Focus of Defense | Architectural Mechanism | Failure State Behavior |
| :--- | :--- | :--- | :--- |
| **Tier 1: Source File Integrity** | Proving the raw external file has not suffered bit rot or tampering | Raw file SHA-256 checksum in `reimbursement_source_versions` | Checksum mismatch raises `FILE_CORRUPTED` alert |
| **Tier 2: Source Approval Provenance** | Proving the dataset was formally signed off by an authorized executive | Executive approval record in `reimbursement_source_approvals` | Unapproved source cannot be activated |
| **Tier 3: Temporal Eligibility** | Proving the dataset was legally active on the date of surgery | Date range exclusion check (`effective_start <= DOS <= effective_end`)| Out-of-window dates fail closed |
| **Tier 4: Contract Clause Binding** | Proving which contract clause governed the methodology | Direct foreign key from calculation trace to contract term ID | Missing contract rule fails closed (`RATE_NOT_FOUND`)|
| **Tier 5: Intermediate Arithmetic Trace**| Proving every intermediate calculation factor | Relational trace in `reimbursement_calculation_traces` | Non-traceable calculations rejected by trigger |
| **Tier 6: Cryptographic Ledger Digest** | Proving the committed calculation snapshot has not been altered | RFC 8785 Canonical JSON SHA-256 hash | Verification RPC raises `TAMPER ALERT` |
| **Tier 7: Historical Reproducibility** | Proving the exact same result can be re-executed 10 years later | Immutable version-locking of all upstream source files | Math produces identical cent amount ($0.00 delta) |

---

## 2. THE DISTINCTION BETWEEN HASH MATCH AND AUDIT DEFECT

> ⚠️ **CRITICAL AUDIT DIRECTIVE:**  
> A matching SHA-256 cryptographic hash proves **ONLY** that the stored database row matches the payload created when the calculation was committed.  
> It does **NOT** prove:
> - That the uploaded fee schedule was legally negotiated or accurate.
> - That the billing specialist selected the correct clinical CPT code.
> - That the patient's insurance policy was active on the date of surgery.
> - That the calculation is immune to root-level database superuser tampering.

True auditability requires combining cryptographic hashes with **source provenance, effective-date validation, unapplied rule logs, and immutable append-only ledgers**.

