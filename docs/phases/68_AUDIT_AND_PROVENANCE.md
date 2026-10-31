# PHASE 68 — AUDIT AND PROVENANCE SPECIFICATION
## Cryptographic Integrity, Ledger Immutability, and Historical Reproducibility

> **Phase:** 68 — Expected Reimbursement Engine  
> **Author:** Principal Security Architect, Compliance and Audit Officer  
> **Status:** AUDIT & PROVENANCE SPECIFICATION  
> **Target Version:** ASCANALYST v2026.1  

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

### 2.1 Canonical Payload Serialization
Before committing to `public.reimbursement_calculations`, the PostgreSQL engine constructs a canonical JSON string comprising strictly ordered, normalized fields:

```sql
v_canonical_string := CONCAT_WS('|',
    v_facility_id::text,
    v_surgery_id::text,
    v_payer_id::text,
    v_contract_version_id::text,
    v_dos::text,
    v_total_gross_billed::text,
    v_total_allowable::text,
    v_patient_responsibility::text,
    v_payer_reimbursement::text,
    v_mppr_rule_set_code,
    (SELECT string_agg(cpt_code || ':' || units::text || ':' || final_line_allowable::text, ',' ORDER BY line_number) 
     FROM v_staged_lines)
);

v_calculation_hash := encode(digest(v_canonical_string, 'sha256'), 'hex');
```

### 2.2 Server-Side Integrity Verification RPC
```sql
CREATE OR REPLACE FUNCTION public.fn_verify_reimbursement_calculation_integrity(
    p_calculation_id UUID
)
RETURNS TABLE (
    is_valid BOOLEAN,
    recorded_hash VARCHAR(64),
    computed_hash VARCHAR(64),
    verification_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_calc RECORD;
    v_recomputed_hash VARCHAR(64);
BEGIN
    SELECT * INTO v_calc FROM public.reimbursement_calculations WHERE id = p_calculation_id;
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::VARCHAR(64), NULL::VARCHAR(64), 'Calculation record not found.'::TEXT;
        RETURN;
    END IF;

    -- Re-generate canonical hash from current database row contents
    -- If any row column was tampered with, hash will not match
    v_recomputed_hash := encode(digest(
        CONCAT_WS('|',
            v_calc.facility_id::text,
            v_calc.surgery_id::text,
            v_calc.payer_id::text,
            v_calc.contract_version_id::text,
            v_calc.date_of_service::text,
            v_calc.total_gross_billed::text,
            v_calc.total_contract_allowable::text,
            v_calc.estimated_patient_responsibility::text,
            v_calc.estimated_payer_reimbursement::text,
            v_calc.mppr_rule_set_code,
            (SELECT string_agg(cpt_code || ':' || units::text || ':' || line_contract_allowable::text, ',' ORDER BY line_number)
             FROM public.reimbursement_calculation_lines WHERE calculation_id = p_calculation_id)
        ), 'sha256'), 'hex');

    IF v_recomputed_hash = v_calc.calculation_hash THEN
        RETURN QUERY SELECT TRUE, v_calc.calculation_hash, v_recomputed_hash, 'Ledger record verified: Hash matches canonical payload.'::TEXT;
    ELSE
        RETURN QUERY SELECT FALSE, v_calc.calculation_hash, v_recomputed_hash, 'TAMPER ALERT: Recorded hash does not match computed payload.'::TEXT;
    END IF;
END;
$$;
```

---

## 3. APPEND-ONLY RECALCULATION LINEAGE

When clinical coding, implant invoices, or contracts change post-operatively:
1. **Never Overwrite:** The initial calculation (Sequence #1) is preserved unaltered.
2. **Succession Pointer:** Sequence #1 has its `is_latest_calculation` flag set to `FALSE` and `superseded_by_calculation_id` set to the UUID of Sequence #2.
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

