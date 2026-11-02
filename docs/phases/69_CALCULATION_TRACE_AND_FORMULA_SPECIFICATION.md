# PHASE 69 — CALCULATION TRACE & FORMULA SPECIFICATION
## Line-by-Line Mathematical Traces, Intermediate Factor Schemas, and Unapplied Rule Auditing

> **Module:** Expected Reimbursement Engine & Rate Adjudication  
> **Status:** FORMULA & TRACE DATA MODEL SPECIFICATION  
> **Target Version:** ASCANALYST v2026.1  
> **Author:** Principal Financial Systems Architect, Reimbursement Specialist  

---

## 1. CALCULATION TRACE DATA MODEL

Rather than unstructured free-text comments, Phase 69 introduces a **relational, machine-readable calculation trace**:

```sql
CREATE TABLE IF NOT EXISTS public.reimbursement_calculation_traces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calculation_id UUID NOT NULL REFERENCES public.reimbursement_calculations(id) ON DELETE CASCADE,
    calculation_line_id UUID NOT NULL REFERENCES public.reimbursement_calculation_lines(id) ON DELETE CASCADE,
    step_sequence SMALLINT NOT NULL CHECK (step_sequence >= 1),
    
    -- Formula & Methodology Identifiers
    step_name VARCHAR(100) NOT NULL, -- 'WAGE_INDEX_ADJUSTMENT' | 'J8_OFFSET_DEDUCTION' | 'MPPR_CASCADE'
    formula_code VARCHAR(50) NOT NULL,
    formula_template TEXT NOT NULL, -- e.g. '({unadjusted_rate} * 0.50 * {wage_index}) + ({unadjusted_rate} * 0.50)'
    
    -- Variable Bindings & Provenance References
    variable_bindings JSONB NOT NULL DEFAULT '{}'::jsonb,
    applied_rule_id UUID, -- References specific contract term or carve-out rule
    source_version_id UUID REFERENCES public.reimbursement_source_versions(id) ON DELETE RESTRICT,
    
    -- Intermediate Results & Rounding
    input_amount NUMERIC(12, 2) NOT NULL,
    factor_applied NUMERIC(6, 4),
    intermediate_result NUMERIC(12, 2) NOT NULL,
    rounding_mode VARCHAR(30) NOT NULL DEFAULT 'ROUND_HALF_UP',
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_calc_line_step UNIQUE (calculation_line_id, step_sequence)
);

CREATE INDEX IF NOT EXISTS idx_calc_trace_line ON public.reimbursement_calculation_traces(calculation_line_id);
```

---

## 2. DETERMINISTIC FORMULAS & INTERMEDIATE MATHEMATICS

All authoritative calculations follow strictly ordered, deterministic arithmetic:

### 2.1 Medicare ASC Baseline Wage Adjustment
$$\text{Labor Portion} = \text{Unadjusted Rate} \times 0.5000 \times \text{CBSA Wage Index}$$
$$\text{Non-Labor Portion} = \text{Unadjusted Rate} \times 0.5000$$
$$\text{Wage-Adjusted Baseline} = \text{ROUND}(\text{Labor Portion} + \text{Non-Labor Portion}, 2)$$

### 2.2 Percent of Medicare with J8 Device Offset Carve-Out
When implants are carved out separately under contract terms:
$$\text{Adjusted Baseline} = \text{Wage-Adjusted Baseline} - \text{CMS Statutory Device Offset}$$
$$\text{Unreduced Line Allowable} = \text{ROUND}(\text{Adjusted Baseline} \times \text{Contract Multiplier}, 2)$$

### 2.3 Multiple Procedure Payment Reduction (MPPR)
Procedures are ordered descending by unreduced base allowable:
$$\text{Reduced Line Allowable} = \text{ROUND}(\text{Unreduced Line Allowable} \times \text{MPPR Tier Multiplier}, 2)$$

### 2.4 Implant Carve-Out Reimbursement
For billable implants meeting the contract invoice threshold ($\text{Unit Cost} \ge \text{Threshold}$):
$$\text{Carve-Out Reimbursement} = \sum (\text{Invoice Unit Cost} \times \text{Quantity}) \times (1.0000 + \text{Contract Markup Pct})$$

### 2.5 Patient Responsibility Benefit Ordering
Patient liability is partitioned in strict clinical sequence:
1. **Deductible:** $\text{Applied Deductible} = \text{LEAST}(\text{Remaining Deductible}, \text{Contract Allowable})$
2. **Copay:** $\text{Applied Copay} = \text{LEAST}(\text{Plan Copay}, \text{Contract Allowable} - \text{Applied Deductible})$
3. **Coinsurance:** $\text{Applied Coinsurance} = \text{ROUND}((\text{Contract Allowable} - \text{Applied Deductible} - \text{Applied Copay}) \times \text{Coinsurance Pct}, 2)$
4. **Out-of-Pocket Cap:** $\text{Total Patient Liability} = \text{LEAST}(\text{Deductible} + \text{Copay} + \text{Coinsurance}, \text{Remaining OOP Max})$
5. **Estimated Payer Reimbursement:**
   $$\text{Estimated Payer Reimbursement} = \text{Total Contract Allowable} - \text{Total Patient Liability}$$

---

## 3. UNAPPLIED RULE LEDGER (`reimbursement_unapplied_rules`)

A critical requirement for revenue cycle defense is proving why certain rules were **NOT applied**.

```sql
CREATE TABLE IF NOT EXISTS public.reimbursement_unapplied_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calculation_id UUID NOT NULL REFERENCES public.reimbursement_calculations(id) ON DELETE CASCADE,
    calculation_line_id UUID REFERENCES public.reimbursement_calculation_lines(id) ON DELETE CASCADE,
    rule_category VARCHAR(50) NOT NULL, -- 'MPPR' | 'J8_OFFSET' | 'STOP_LOSS' | 'IMPLANT_CARVEOUT'
    rule_name VARCHAR(100) NOT NULL,
    inapplicability_reason_code VARCHAR(50) NOT NULL,
    explanation_text TEXT NOT NULL,
    evaluated_context JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
```

### Canonical Unapplied Explanations:
1. **MPPR Exemption:**  
   - *Reason Code:* `ADD_ON_CODE_EXEMPT`  
   - *Explanation:* *"CPT +29828 is an add-on procedure and is statutorily exempt from Multiple Procedure Payment Reductions."*
2. **J8 Offset Exemption:**  
   - *Reason Code:* `IMPLANTS_NOT_CARVED_OUT`  
   - *Explanation:* *"Procedure CPT 23430 has CMS PI J8, but implants were not carved out separately. Procedural baseline was paid intact without device deduction."*
3. **Implant Carve-Out Threshold Unmet:**  
   - *Reason Code:* `BELOW_MINIMUM_THRESHOLD`  
   - *Explanation:* *"Vendor invoice unit cost ($180.00) is less than contract minimum carve-out threshold ($250.00). Item is packaged into surgical fee."*
4. **Catastrophic Stop-Loss Unmet:**  
   - *Reason Code:* `THRESHOLD_NOT_EXCEEDED`  
   - *Explanation:* *"Total encounter gross billed charges ($28,500.00) did not exceed contract stop-loss trigger ($35,000.00). Standard fee schedule governs."*
