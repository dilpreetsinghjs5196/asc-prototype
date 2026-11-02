# PHASE 68 — CANONICAL HASH DESIGN & PAYLOAD SERIALIZATION
## Forensic Analysis of Cryptographic Serialization, Field Coverage, and Deterministic Hash Generation

> **Module:** Expected Reimbursement Engine & Rate Adjudication  
> **Status:** AUDIT & SPECIFICATION DESIGN  
> **Target Version:** ASCANALYST v2026.1  
> **Author:** Principal Database Security Architect, Financial Systems Auditor  

---

## 1. FORENSIC AUDIT OF THE PROPOSED HASH DESIGN (`CONCAT_WS`)

In the existing Phase 68 draft and Migration 044 (`supabase/migrations/044_expected_reimbursement_engine.sql`), cryptographic hashing was implemented using PostgreSQL `CONCAT_WS('|', ...)`:

```sql
v_calc_hash := encode(digest(
    CONCAT_WS('|',
        v_facility_id::text,
        p_surgery_id::text,
        v_payer_id::text,
        v_contract_version_id::text,
        v_dos::text,
        v_total_gross::text,
        v_total_allowable::text,
        v_est_patient_resp::text,
        v_est_payer_reimb::text,
        v_mppr_code
    ), 'sha256'), 'hex');
```

Our forensic audit identifies six severe mathematical and security vulnerabilities in this approach:

### 1.1 The NULL-Skipping Delimiter Collision Vulnerability
In PostgreSQL standard behavior, `CONCAT_WS(sep, str1, str2, ...)` **silently ignores NULL arguments**. It does not emit consecutive delimiters for NULLs.
- **Scenario A:** Field 1 = `'A'`, Field 2 = `NULL`, Field 3 = `'B'` $\rightarrow$ `CONCAT_WS('|', 'A', NULL, 'B')` produces `'A|B'`.
- **Scenario B:** Field 1 = `'A'`, Field 2 = `'B'`, Field 3 = `NULL` $\rightarrow$ `CONCAT_WS('|', 'A', 'B', NULL)` produces `'A|B'`.
- **Impact:** Two completely different financial states produce **identical hashes**. An attacker or data corruption that shifts a value from Field 3 to Field 2 while nullifying Field 3 cannot be detected by the hash.

### 1.2 Delimiter Injection & Token Hijacking
The pipe delimiter `|` is not escaped. If an input field (such as `mppr_rule_set_code` or a contract identifier) contains a pipe character (e.g. `'CASCADE|TIER1'`), the serialized string is split into an unintended token boundary, creating collision opportunities.

### 1.3 Floating String Representations of Decimal Numerics
In PostgreSQL, casting a `NUMERIC` directly to text (`val::text`) strips trailing zeros in certain contexts or produces non-uniform formatting across different database client drivers. E.g., `150.00::text` versus `150::text`. Without explicit formatting (`to_char`), decimal serialization is nondeterministic.

### 1.4 Complete Omission of Child Lines and Implants
In Migration 044, neither `fn_calculate_expected_reimbursement` nor `fn_verify_reimbursement_calculation_integrity` hashes the line items or implant carve-outs! A rogue database update could alter CPT codes, modifiers, or line allowable amounts in `reimbursement_calculation_lines`, and the verification function would still report `is_valid = TRUE`!

### 1.5 Omission of Intermediate Adjustments
`reimbursement_calculation_adjustments` records MPPR reductions, J8 device offset deductions, and stop-loss variances. These records are completely unhashed in Migration 044.

---

## 2. PROPOSED RFC 8785 CANONICAL JSON SPECIFICATION

To achieve absolute determinism, cross-platform reproducibility, and immunity to delimiter collisions, the engine must adopt **RFC 8785 JSON Canonicalization Scheme (JCS)** principles.

PostgreSQL natively provides deterministic JSON key ordering via `jsonb_build_object()`.

### 2.1 Canonical Payload Structure (`v_canonical_json`)
```json
{
  "header": {
    "organization_id": "00000000-0000-0000-0000-000000000001",
    "facility_id": "00000000-0000-0000-0000-000000000002",
    "surgery_id": 1042,
    "encounter_identifier": "SURG-1042",
    "payer_id": "20000000-0000-0000-0000-000000000001",
    "plan_id": null,
    "contract_id": "30000000-0000-0000-0000-000000000001",
    "contract_version_id": "40000000-0000-0000-0000-000000000001",
    "date_of_service": "2026-11-15",
    "calculation_sequence": 1,
    "calculation_status": "CALCULATED",
    "total_gross_billed": "23000.00",
    "total_contract_allowable": "11179.10",
    "estimated_patient_responsibility": "3035.82",
    "estimated_payer_reimbursement": "8143.28",
    "facility_acquisition_cost": "5175.00",
    "expected_contribution_margin": "6004.10",
    "mppr_rule_set_code": "COM_STD_CASCADE",
    "stop_loss_triggered": false,
    "calculation_engine_version": "v2026.1-ph68"
  },
  "lines": [
    {
      "line_number": 1,
      "cpt_code": "29827",
      "modifiers": [],
      "units": "1.00",
      "line_gross_charge": "14500.00",
      "applied_methodology": "PERCENT_OF_MEDICARE",
      "base_benchmark_rate": "3348.57",
      "contract_multiplier": "1.8000",
      "modifier_adjustment_factor": "1.0000",
      "mppr_rank": 1,
      "mppr_discount_pct": "1.0000",
      "j8_device_offset_deducted": "0.00",
      "line_contract_allowable": "6027.43",
      "line_patient_responsibility": "1637.54",
      "line_payer_reimbursement": "4389.89",
      "is_packaged": false,
      "is_carve_out": false
    },
    {
      "line_number": 2,
      "cpt_code": "23430",
      "modifiers": [],
      "units": "1.00",
      "line_gross_charge": "8500.00",
      "applied_methodology": "PERCENT_OF_MEDICARE",
      "base_benchmark_rate": "4707.41",
      "contract_multiplier": "1.8000",
      "modifier_adjustment_factor": "1.0000",
      "mppr_rank": 2,
      "mppr_discount_pct": "0.5000",
      "j8_device_offset_deducted": "2100.00",
      "line_contract_allowable": "2346.67",
      "line_patient_responsibility": "637.53",
      "line_payer_reimbursement": "1709.14",
      "is_packaged": false,
      "is_carve_out": false
    }
  ],
  "adjustments": [
    {
      "line_number": 2,
      "adjustment_type": "J8_DEVICE_OFFSET_DEDUCTION",
      "adjustment_amount": "-2100.00",
      "factor_applied": null
    },
    {
      "line_number": 2,
      "adjustment_type": "MPPR_SECONDARY_REDUCTION",
      "adjustment_amount": "-2346.67",
      "factor_applied": "0.5000"
    }
  ]
}
```

### 2.2 Canonical Formatting Invariants
1. **Currency Fields:** Formatted strictly via `to_char(val, 'FM999999990.00')` (always two decimal places).
2. **Multipliers & Fractions:** Formatted strictly via `to_char(val, 'FM0.0000')` (always four decimal places).
3. **NULL Values:** Explicit JSON `null`, preserving presence and position.
4. **Line Sorting:** Lines are sorted deterministically by `ORDER BY line_number ASC, cpt_code ASC`.
5. **Adjustments Sorting:** Adjustments are sorted deterministically by `ORDER BY line_number ASC, adjustment_type ASC`.
6. **Hash Generation:**
   ```sql
   v_calculation_hash := encode(digest(convert_to(v_canonical_json::text, 'UTF8'), 'sha256'), 'hex');
   ```

---

## 3. COMPREHENSIVE FIELD-COVERAGE MATRIX

The matrix below audits every database column across calculation entities to establish whether it belongs inside the immutable cryptographic payload:

| Field Name | Entity / Table | In Hash? | Inclusion Rationale | Excluded Rationale (if No) |
| :--- | :--- | :---: | :--- | :--- |
| `organization_id` | `reimbursement_calculations` | **YES** | Binds multi-tenant organizational boundary | — |
| `facility_id` | `reimbursement_calculations` | **YES** | Binds facility tenancy boundary | — |
| `surgery_id` | `reimbursement_calculations` | **YES** | Binds calculation to specific surgical encounter | — |
| `encounter_identifier` | `reimbursement_calculations` | **YES** | Binds business encounter reference | — |
| `payer_id` | `reimbursement_calculations` | **YES** | Binds primary commercial payer identity | — |
| `plan_id` | `reimbursement_calculations` | **YES** | Binds specific commercial health plan product | — |
| `contract_id` | `reimbursement_calculations` | **YES** | Binds overarching commercial agreement | — |
| `contract_version_id` | `reimbursement_calculations` | **YES** | Binds effective-dated contract version lock | — |
| `date_of_service` | `reimbursement_calculations` | **YES** | Primary temporal anchor for fee schedules | — |
| `calculation_sequence` | `reimbursement_calculations` | **YES** | Binds immutable sequence order (#1, #2, ...) | — |
| `calculation_status` | `reimbursement_calculations` | **YES** | Binds state machine result (e.g. `CALCULATED`) | — |
| `total_gross_billed` | `reimbursement_calculations` | **YES** | Authoritative gross chargemaster total | — |
| `total_contract_allowable`| `reimbursement_calculations` | **YES** | Primary financial settlement metric | — |
| `estimated_patient_resp` | `reimbursement_calculations` | **YES** | Verified patient liability share | — |
| `estimated_payer_reimb` | `reimbursement_calculations` | **YES** | Net receivable due from commercial payer | — |
| `facility_acquisition_cost`| `reimbursement_calculations` | **YES** | Total direct supply, room, and implant cost | — |
| `expected_margin` | `reimbursement_calculations` | **YES** | Net procedural contribution margin | — |
| `mppr_rule_set_code` | `reimbursement_calculations` | **YES** | Contractual cascade rule identifier | — |
| `stop_loss_triggered` | `reimbursement_calculations` | **YES** | Captures whether stop-loss threshold met | — |
| `calculation_engine_ver` | `reimbursement_calculations` | **YES** | Software engine version (`v2026.1-ph68`) | — |
| `id` (PK) | `reimbursement_calculations` | **NO** | Surrogate database key; generated on insert | Transient database artifact |
| `is_latest_calculation` | `reimbursement_calculations` | **NO** | Mutable lifecycle pointer | Breaks immutability if hashed |
| `superseded_by_calc_id` | `reimbursement_calculations` | **NO** | Mutable succession pointer | Populated after snapshot created |
| `recalculation_reason` | `reimbursement_calculations` | **NO** | Metadata explaining *why* recalculation ran | Kept in audit log event |
| `calculation_timestamp` | `reimbursement_calculations` | **NO** | Physical write timestamp | Clock drift causes non-reproducibility |
| `calculated_by` | `reimbursement_calculations` | **NO** | Actor identity | Kept in audit event; math is actor-agnostic |
| `created_at` | `reimbursement_calculations` | **NO** | Database physical timestamp | Storage detail |
| `line_number` | `reimbursement_calculation_lines` | **YES** | Deterministic position in claim hierarchy | — |
| `cpt_code` | `reimbursement_calculation_lines` | **YES** | Core clinical procedure code | — |
| `modifiers` | `reimbursement_calculation_lines` | **YES** | Bilateral (50) and operative modifiers | — |
| `units` | `reimbursement_calculation_lines` | **YES** | Submitted billing units | — |
| `line_gross_charge` | `reimbursement_calculation_lines` | **YES** | Line-item chargemaster charge | — |
| `applied_methodology` | `reimbursement_calculation_lines` | **YES** | Resolved pricing rule (e.g. `% of Medicare`) | — |
| `base_benchmark_rate` | `reimbursement_calculation_lines` | **YES** | Unreduced base rate before modifiers | — |
| `contract_multiplier` | `reimbursement_calculation_lines` | **YES** | Contract percentage factor | — |
| `mppr_rank` | `reimbursement_calculation_lines` | **YES** | Procedural ranking in MPPR sort | — |
| `mppr_discount_pct` | `reimbursement_calculation_lines` | **YES** | Multiplier applied to line allowable | — |
| `j8_offset_deducted` | `reimbursement_calculation_lines` | **YES** | Statutory CMS device offset deducted | — |
| `line_contract_allowable`| `reimbursement_calculation_lines` | **YES** | Net allowable for individual procedure | — |
| `is_packaged` | `reimbursement_calculation_lines` | **YES** | Captures whether secondary procedure bundled| — |
| `is_carve_out` | `reimbursement_calculation_lines` | **YES** | Captures whether implant carved out | — |
| `calculation_trace` | `reimbursement_calculation_lines` | **NO** | Natural language text description | Non-canonical prose formatting |
| `adjustment_type` | `calculation_adjustments` | **YES** | Exact modifier, MPPR, or offset deduction | — |
| `adjustment_amount` | `calculation_adjustments` | **YES** | Numeric adjustment dollar value | — |
| `factor_applied` | `calculation_adjustments` | **YES** | Percentage factor applied | — |
