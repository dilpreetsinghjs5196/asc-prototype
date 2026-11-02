# PHASE 68 — AUDIT LOG AND IDENTITY PROVENANCE
## HIPAA Audit Ledger Integration, Actor Identity Verification, and Network Telemetry Governance

> **Module:** Expected Reimbursement Engine & Rate Adjudication  
> **Status:** AUDIT & SPECIFICATION DESIGN  
> **Target Version:** ASCANALYST v2026.1  
> **Author:** Principal Security Architect, Compliance and Audit Officer  

---

## 1. INTEGRATION WITH `public.audit_logs`

To comply with HIPAA Administrative Safeguards (45 CFR § 164.312(b) — Audit Controls), every reimbursement adjudication, recalculation, integrity check, and calculation rejection must generate an immutable, structured audit event in `public.audit_logs`.

### 1.1 Canonical Audit Event Schema
```sql
INSERT INTO public.audit_logs (
    id,
    organization_id,
    facility_id,
    event_category,
    event_action,
    entity_name,
    entity_id,
    actor_id,
    actor_role,
    payload,
    created_at
) VALUES (
    gen_random_uuid(),
    v_org_id,
    v_facility_id,
    'FINANCIAL_ADJUDICATION',
    v_event_action, -- 'CALCULATE_EXPECTED_REIMBURSEMENT' | 'RECALCULATE_ENCOUNTER' | 'INTEGRITY_CHECK'
    'reimbursement_calculations',
    v_calc_id::text,
    auth.uid(),
    v_actor_role,
    jsonb_build_object(
        'calculation_id', v_calc_id,
        'surgery_id', p_surgery_id,
        'calculation_sequence', v_next_seq,
        'calculation_status', v_calc_status,
        'total_gross_billed', v_total_gross,
        'total_contract_allowable', v_total_allowable,
        'estimated_patient_responsibility', v_est_patient_resp,
        'estimated_payer_reimbursement', v_est_payer_reimb,
        'calculation_hash', v_calc_hash,
        'recalculation_reason', p_recalculation_reason,
        'contract_id', v_contract_id,
        'contract_version_id', v_contract_version_id,
        'client_telemetry', jsonb_build_object(
            'engine_version', 'v2026.1-ph68',
            'client_ip_hint', NULLIF(current_setting('request.headers', true)::jsonb->>'x-forwarded-for', ''),
            'user_agent_hint', NULLIF(current_setting('request.headers', true)::jsonb->>'user-agent', '')
        )
    ),
    timezone('utc', now())
);
```

---

## 2. ATOMIC TRANSACTION CONSISTENCY

A common defect in web architectures is decoupling audit logging from database mutations (e.g. inserting the calculation record in PostgreSQL, and firing an asynchronous HTTP call or external log emitter). If the network drops or the server crashes, the audit ledger diverges from the database.

### Mandatory Architectural Invariant:
1. **Intra-Transaction Ingestion:** Audit log events are written **inside the exact same PostgreSQL database transaction** as the calculation snapshot.
2. **Atomic Rollback:** If the calculation stored procedure encounters an unhandled exception or constraint violation, the transaction rolls back cleanly, ensuring phantom calculations do not linger in the audit log.
3. **Failed Calculation Logging:** When an expected business error occurs (e.g., `RATE_NOT_FOUND` or `REQUIRED_DATA_MISSING`), the procedure catches the condition, records an audit event with status `CALCULATION_FAILED` or `MISSING_DATA`, and commits the diagnostic record for operational visibility.

---

## 3. SESSION ACTOR IDENTITY VS. UNTRUSTED CLIENT TELEMETRY

In healthcare financial security, the executing actor's identity must be cryptographically verified.

### 3.1 Authoritative Actor Derivation
- Actor identity is derived strictly from **`auth.uid()`** (the cryptographically signed Supabase/PostgreSQL JWT token).
- Any caller-supplied parameter attempting to specify `user_id` is **strictly ignored and rejected**.
- Tenancy membership is verified via `public.is_facility_accessible(v_facility_id)`.

### 3.2 Network Telemetry Governance (Untrusted Data Classification)
HTTP headers such as `X-Forwarded-For`, `Client-IP`, and `User-Agent` are often spoofable by malicious actors or proxies.
- **Classification:** Labeled strictly as **`client_telemetry_hints`**.
- **Security Rule:** Network headers are recorded for diagnostic and forensic correlation only. They **must never** be used for authorization, tenancy boundaries, or access control decisions.

---

## 4. HIPAA MINIMUM NECESSARY & PHI MINIMIZATION

HIPAA 45 CFR § 164.514(d) requires covered entities to limit protected health information (PHI) in operational records to the minimum necessary to accomplish the intended purpose.

### Audit Payload Restrictions:
1. **No Direct Patient Identifiers:** Audit log payloads must **not** store patient legal names, dates of birth, Social Security Numbers, phone numbers, or narrative clinical operative notes.
2. **Relational Referencing:** Audits bind strictly to surrogate database identifiers (`surgery_id`, `patient_id`, `calculation_id`). Authorized auditors correlate identities through access-controlled joins.
3. **Financial Summary Focus:** Payloads retain financial figures (Gross, Allowable, Patient Responsibility, Payer Due) and cryptographic fingerprints, fulfilling financial audit mandates without PHI proliferation.

---

## 5. AUDIT LOG PROTECTION & RETENTION

The `public.audit_logs` table represents the legal record of disclosure and financial accounting:
1. **Direct Mutation Revoked:** `authenticated`, `anon`, and `public` roles have zero `UPDATE`, `DELETE`, or `TRUNCATE` permissions on `public.audit_logs`.
2. **Access Control (RLS):** Governed by Row-Level Security; only users possessing `reimbursement.audit` or `super_admin` permissions can query audit logs for their active facility.
3. **Retention Policy:** In compliance with CMS ASC Medicare record-retention statutes, audit records must be retained in an append-only archive for a minimum of **ten (10) years**.

