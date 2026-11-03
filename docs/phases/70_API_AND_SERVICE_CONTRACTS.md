# PHASE 70 — API AND SERVICE CONTRACTS
## Backend Stored Procedures, Client Domain Services, TypeScript Interfaces & Service Contracts

> **Phase:** 70 — Financial Data Dictionary  
> **Status:** API & SERVICE ARCHITECTURE SPECIFICATION  
> **Target Version:** ASCANALYST v2026.1 Enterprise  
> **Classification:** Service Contracts & Interface Definitions  

---

## 1. SERVICE ARCHITECTURE PHILOSOPHY

Financial intelligence in ASCANALYST must never rely on disparate client-side utility math. All canonical metric definitions, completeness evaluations, and variance reconciliations are exposed via strictly typed, server-authoritative contracts.

---

## 2. BACKEND POSTGRESQL RPC CONTRACTS (PROPOSED)

### 2.1 `fn_get_financial_metric_definition`
Returns the canonical definition, approved formula, and precision rules for a specified metric code:

```sql
CREATE OR REPLACE FUNCTION public.fn_get_financial_metric_definition(
    p_metric_code VARCHAR(64)
)
RETURNS TABLE (
    metric_code VARCHAR(64),
    canonical_name VARCHAR(128),
    financial_category VARCHAR(32),
    storage_datatype VARCHAR(32),
    business_definition TEXT,
    technical_definition TEXT,
    accounting_treatment VARCHAR(64),
    active_formula_expression TEXT,
    rounding_method VARCHAR(32)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.metric_code,
        m.canonical_name,
        m.financial_category,
        m.storage_datatype,
        m.business_definition,
        m.technical_definition,
        m.accounting_treatment,
        f.formula_expression,
        f.rounding_method
    FROM public.financial_metric_definitions m
    LEFT JOIN public.financial_formula_registry f 
        ON f.metric_id = m.id AND f.is_approved = TRUE 
        AND (f.effective_end_date IS NULL OR f.effective_end_date >= CURRENT_DATE)
    WHERE m.metric_code = p_metric_code AND m.is_active = TRUE
    ORDER BY f.effective_start_date DESC
    LIMIT 1;
END;
$$;
```

---

### 2.2 `fn_evaluate_encounter_financial_completeness`
Evaluates an encounter's clinical and financial records to determine its completeness badge:

```sql
CREATE OR REPLACE FUNCTION public.fn_evaluate_encounter_financial_completeness(
    p_surgery_id BIGINT
)
RETURNS TABLE (
    completeness_status VARCHAR(32),
    is_complete BOOLEAN,
    missing_items JSONB,
    quality_score NUMERIC(5,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_has_contract BOOLEAN;
    v_missing_invoices INT;
    v_missing_wages INT;
    v_status VARCHAR(32);
    v_missing JSONB := '[]'::jsonb;
BEGIN
    -- Check if contract was resolved
    SELECT EXISTS (
        SELECT 1 FROM public.reimbursement_calculations 
        WHERE surgery_id = p_surgery_id AND calculation_status = 'CALCULATED'
    ) INTO v_has_contract;

    IF NOT v_has_contract THEN
        v_missing := v_missing || jsonb_build_object('item', 'PAYER_CONTRACT', 'severity', 'CRITICAL');
    END IF;

    -- Check for missing implant costs
    SELECT COUNT(*) INTO v_missing_invoices
    FROM public.case_devices cd
    WHERE cd.case_id = p_surgery_id AND (cd.cost IS NULL OR cd.cost <= 0);

    IF v_missing_invoices > 0 THEN
        v_missing := v_missing || jsonb_build_object('item', 'IMPLANT_INVOICE', 'count', v_missing_invoices);
    END IF;

    -- Determine overall status
    IF NOT v_has_contract THEN
        v_status := 'RATE_NOT_FOUND';
    ELSIF v_missing_invoices > 0 THEN
        v_status := 'MISSING_SOURCE_DATA';
    ELSE
        v_status := 'COMPLETE';
    END IF;

    RETURN QUERY SELECT v_status, (v_status = 'COMPLETE'), v_missing, 
        CASE WHEN v_status = 'COMPLETE' THEN 100.00 ELSE 60.00 END;
END;
$$;
```

---

## 3. TYPESCRIPT INTERFACES

```typescript
export interface FinancialMetricDefinition {
  metricCode: string;
  canonicalName: string;
  category: 'CHARGE' | 'REVENUE' | 'PAYMENT' | 'COST' | 'MARGIN' | 'ADJUSTMENT' | 'METRIC';
  storageDatatype: string;
  sourceTable: string;
  sourceColumn: string;
  businessDefinition: string;
  technicalDefinition: string;
  accountingTreatment: string;
  activeFormula?: string;
  roundingMethod: string;
}

export type FinancialCompletenessStatusCode =
  | 'COMPLETE'
  | 'PARTIALLY_COMPLETE'
  | 'ESTIMATED'
  | 'PENDING_VERIFICATION'
  | 'MISSING_SOURCE_DATA'
  | 'RATE_NOT_FOUND'
  | 'MANUAL_REVIEW_REQUIRED'
  | 'RECONCILIATION_REQUIRED'
  | 'SUPERSEDED'
  | 'INVALID';

export interface FinancialCompletenessEvaluation {
  surgeryId: number;
  status: FinancialCompletenessStatusCode;
  isComplete: boolean;
  missingItems: Array<{ item: string; severity: string; count?: number }>;
  qualityScore: number;
}
```

---

## 4. ERROR CODE STANDARDS

- `ERR_METRIC_NOT_FOUND`: The requested financial metric code is not registered.
- `ERR_INCOMPLETE_SOURCE_DATA`: Calculation blocked due to missing vendor invoices or wage hours.
- `ERR_UNAUTHORIZED_FINANCIAL_ACCESS`: User lacks role permissions to view sensitive fee schedules or margins.
- `ERR_INVALID_DENOMINATOR`: Attempted margin percentage calculation with zero or negative allowable.
