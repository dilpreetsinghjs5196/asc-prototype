# PHASE 68 — AUDIT AND PROVENANCE SPECIFICATION
## Cryptographic Integrity, Ledger Immutability, and Historical Reproducibility

> **Phase:** 68 — Expected Reimbursement Engine  
> **Author:** Principal Security Architect, Compliance and Audit Officer  
> **Status:** AUDIT & PROVENANCE SPECIFICATION — READ-ONLY VALIDATION  
> **Target Version:** ASCANALYST v2026.1  
> **Comprehensive Audit Suite:** See [`68_AUDIT_AND_PROVENANCE_SPECIFICATION.md`](file:///e:/medicalAI/asc-prototype/docs/phases/68_AUDIT_AND_PROVENANCE_SPECIFICATION.md) for master review.  

---

## 1. AUDIT & PROVENANCE PHILOSOPHY

In healthcare revenue cycle management, an expected reimbursement estimate directly impacts revenue recognition, financial accruals, claim scrubbing approvals, and contractual underpayment recovery.

Therefore, calculation records cannot merely be "logged"; they must form an **immutable, reproducible financial ledger**. Every calculation must be permanently attributable to:
1. Exact inputs (clinical codes, modifiers, invoices, dates).
2. Authoritative upstream rule versions (CMS Addenda release, CBSA wage index table, contract version lock).
3. The executing identity (user ID, session ID, client IP, timestamp).
4. The exact intermediate mathematical deductions.

A SHA-256 hash alone is insufficient without database-level write restrictions, append-only versioning, and server-side verification functions.

---

## 2. CANONICAL FINGERPRINTING & HASH GENERATION

### 2.1 RFC 8785 Canonical JSON Serialization
Rather than primitive string concatenation (`CONCAT_WS('|', ...)`), which is vulnerable to delimiter collision and NULL-skipping ambiguity, the engine serializes an RFC 8785 Canonical JSON payload covering header, line items, and adjustments:

```sql
-- Full sub-tree serialization (Header + Lines + Adjustments)
v_canonical_json := jsonb_build_object(
    'header', jsonb_build_object(
        'facility_id', v_facility_id,
        'surgery_id', p_surgery_id,
        'payer_id', v_payer_id,
        'contract_version_id', v_contract_version_id,
        'date_of_service', v_dos,
        'total_gross_billed', to_char(v_total_gross, 'FM999999990.00'),
        'total_contract_allowable', to_char(v_total_allowable, 'FM999999990.00'),
        'estimated_patient_responsibility', to_char(v_est_patient_resp, 'FM999999990.00'),
        'estimated_payer_reimbursement', to_char(v_est_payer_reimb, 'FM999999990.00'),
        'mppr_rule_set_code', v_mppr_code,
        'stop_loss_triggered', v_stop_loss_triggered
    ),
    'lines', (
        SELECT jsonb_agg(
            jsonb_build_object(
                'line_number', line_number,
                'cpt_code', cpt_code,
                'modifiers', modifiers,
                'units', to_char(units, 'FM9990.00'),
                'line_allowable', to_char(line_contract_allowable, 'FM999999990.00')
            ) ORDER BY line_number ASC, cpt_code ASC
        ) FROM public.reimbursement_calculation_lines WHERE calculation_id = v_calc_id
    )
);

v_calculation_hash := encode(digest(convert_to(v_canonical_json::text, 'UTF8'), 'sha256'), 'hex');
```

---

## 3. APPEND-ONLY RECALCULATION LINEAGE

When clinical coding, implant invoices, or contracts change post-operatively:
1. **Never Overwrite:** The initial calculation (Sequence #1) is preserved unaltered.
2. **Decoupled Pointer Model:** The historical row is 100% append-only. Active sequence tracking is managed via `reimbursement_calculation_pointers` (or derived state queries) to avoid mutating historical rows.
3. **Mandatory Audit Reason:** The user must supply a documented business rationale (e.g. `POST_OP_CPT_RECODING`), recorded in `recalculation_reason`.
4. **Historical Comparison:** Auditors can run diff queries comparing Sequence #1 with Sequence #2 at any future date to verify why accounts receivable estimates shifted.

---

## 4. INTEGRATION WITH HIPAA AUDIT LOGS

Every calculation invocation generates an automatic event in `public.audit_logs`:
- **Event Category:** `FINANCIAL_ADJUDICATION`
- **Action:** `CALCULATE_EXPECTED_REIMBURSEMENT` (or `RECALCULATE_ENCOUNTER`)
- **Entity:** `reimbursement_calculations`
- **Actor:** Authenticated `auth.uid()`
- **Facility ID:** Tenancy scope
- **State Diff:** Stored in `audit_logs.payload`, detailing total gross, allowable, patient share, and calculation hash.
- **Client Metadata:** User agent, client IP, calculation engine version (`v2026.1-ph68`).

---

## 5. TECHNICAL SPECIFICATION COMPANIONS
- [`68_AUDIT_AND_PROVENANCE_SPECIFICATION.md`](file:///e:/medicalAI/asc-prototype/docs/phases/68_AUDIT_AND_PROVENANCE_SPECIFICATION.md): Master audit and governance specification.
- [`68_CANONICAL_HASH_DESIGN.md`](file:///e:/medicalAI/asc-prototype/docs/phases/68_CANONICAL_HASH_DESIGN.md): Detailed RFC 8785 serialization model and field-coverage matrix.
- [`68_LEDGER_IMMUTABILITY_AND_LINEAGE.md`](file:///e:/medicalAI/asc-prototype/docs/phases/68_LEDGER_IMMUTABILITY_AND_LINEAGE.md): Analysis of append-only ledger designs and concurrency safeguards.
- [`68_AUDIT_LOG_AND_IDENTITY_PROVENANCE.md`](file:///e:/medicalAI/asc-prototype/docs/phases/68_AUDIT_LOG_AND_IDENTITY_PROVENANCE.md): HIPAA audit log integration, atomic transactions, and PHI minimization.
- [`68_HISTORICAL_REPRODUCIBILITY.md`](file:///e:/medicalAI/asc-prototype/docs/phases/68_HISTORICAL_REPRODUCIBILITY.md): The 10-year audit reproduction architecture and source table version-locking.
- [`68_AUDIT_SECURITY_AND_QA_MATRIX.md`](file:///e:/medicalAI/asc-prototype/docs/phases/68_AUDIT_SECURITY_AND_QA_MATRIX.md): Comprehensive 25-scenario acceptance and security test matrix.
- [`68_AUDIT_CROSS_DOCUMENT_CONSISTENCY.md`](file:///e:/medicalAI/asc-prototype/docs/phases/68_AUDIT_CROSS_DOCUMENT_CONSISTENCY.md): Cross-phase consistency analysis across all Phase 66, 67, and 68 artifacts.
