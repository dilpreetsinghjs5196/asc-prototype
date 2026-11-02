# PHASE 69 — API AND SERVICE CONTRACTS
## Server-Side Endpoints, PostgreSQL RPC Signatures, and Service Layer Architecture

> **Module:** Expected Reimbursement Engine & Rate Adjudication  
> **Status:** API & SERVICE CONTRACT SPECIFICATION  
> **Target Version:** ASCANALYST v2026.1  
> **Author:** Principal Backend Architect, Senior API Designer  

---

## 1. SERVER-SIDE SERVICE RESPONSIBILITIES

Authoritative calculations, source resolution, and formula traces execute strictly server-side:

| Service Name | Core Responsibility | Input Contract | Output Contract | Authorization Required |
| :--- | :--- | :--- | :--- | :--- |
| **`SourceRegistryService`** | Manages catalog of regulatory bodies and payer contracts | `source_code`, `publisher`, `source_type` | `ReimbursementSource` record | `reimbursement.source.manage` |
| **`SourceVersionService`** | Manages version codes, effective windows, and file checksums | `source_id`, `version_code`, `file_checksum` | `SourceVersion` record | `reimbursement.source.import` |
| **`SourceImportService`** | Uploads raw datasets into quarantine staging tables | Multi-part raw CSV/Excel byte stream | `ImportBatchReceipt` | `reimbursement.source.import` |
| **`EffectiveRuleResolver`**| Resolves active approved version for a given encounter DOS | `source_id`, `date_of_service` | `source_version_id` | Server-side internal |
| **`CalculationTraceService`**| Retrieves line-level structured execution traces | `calculation_id` | `CalculationTracePayload` | `reimbursement.explanation.view`|
| **`HistoricalReproductionService`**| Re-executes math using original version-locked inputs | `calculation_id` | `ReproductionVerificationReport`| `reimbursement.audit` |
| **`CalculationComparisonService`**| Compares two calculation runs and computes delta | `calc_id_1`, `calc_id_2` | `CalculationVarianceDiff` | `reimbursement.calculation.view`|

---

## 2. POSTGRESQL STORED PROCEDURE SIGNATURES

All functions execute under `SECURITY DEFINER` with fixed, hardened `search_path = pg_catalog, public, pg_temp;`.

### 2.1 RPC 1: `public.fn_get_reimbursement_calculation_trace`
Retrieves the complete step-by-step mathematical trace and unapplied rule log for an encounter calculation:

```sql
CREATE OR REPLACE FUNCTION public.fn_get_reimbursement_calculation_trace(
    p_calculation_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_calc RECORD;
    v_traces JSONB;
    v_unapplied JSONB;
BEGIN
    -- Verify tenancy
    SELECT * INTO v_calc FROM public.reimbursement_calculations WHERE id = p_calculation_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Calculation % not found', p_calculation_id USING ERRCODE = 'P0002';
    END IF;

    IF NOT public.is_facility_accessible(v_calc.facility_id) THEN
        RAISE EXCEPTION 'Access Denied: Facility not accessible' USING ERRCODE = '42501';
    END IF;

    -- Aggregate line traces
    SELECT jsonb_agg(
        jsonb_build_object(
            'line_id', t.calculation_line_id,
            'step_sequence', t.step_sequence,
            'step_name', t.step_name,
            'formula_code', t.formula_code,
            'formula_template', t.formula_template,
            'variable_bindings', t.variable_bindings,
            'input_amount', t.input_amount,
            'factor_applied', t.factor_applied,
            'intermediate_result', t.intermediate_result,
            'source_version', sv.version_code,
            'source_name', rs.source_name
        ) ORDER BY t.step_sequence
    ) INTO v_traces
    FROM public.reimbursement_calculation_traces t
    LEFT JOIN public.reimbursement_source_versions sv ON t.source_version_id = sv.id
    LEFT JOIN public.reimbursement_sources rs ON sv.source_id = rs.id
    WHERE t.calculation_id = p_calculation_id;

    -- Aggregate unapplied rules
    SELECT jsonb_agg(
        jsonb_build_object(
            'rule_category', u.rule_category,
            'rule_name', u.rule_name,
            'reason_code', u.inapplicability_reason_code,
            'explanation', u.explanation_text
        )
    ) INTO v_unapplied
    FROM public.reimbursement_unapplied_rules u
    WHERE u.calculation_id = p_calculation_id;

    RETURN jsonb_build_object(
        'calculation_id', p_calculation_id,
        'traces', COALESCE(v_traces, '[]'::jsonb),
        'unapplied_rules', COALESCE(v_unapplied, '[]'::jsonb)
    );
END;
$$;
```

---

### 2.2 RPC 2: `public.fn_compare_reimbursement_calculations`
Computes an audited side-by-side variance diff between two calculation runs:

```sql
CREATE OR REPLACE FUNCTION public.fn_compare_reimbursement_calculations(
    p_calc_id_1 UUID,
    p_calc_id_2 UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;
```

#### Return Payload (`JSONB`):
```json
{
  "sequence_1": 1,
  "sequence_2": 2,
  "allowable_delta": 2346.67,
  "allowable_pct_change": 0.2662,
  "patient_share_delta": 0.00,
  "payer_share_delta": 2346.67,
  "reason_for_recalculation": "POST_OP_CPT_RECODING: Added CPT 23430 biceps tenodesis",
  "line_deltas": [
    {
      "cpt_code": "23430",
      "change_type": "ADDED",
      "line_allowable_1": null,
      "line_allowable_2": 2346.67
    }
  ]
}
```
