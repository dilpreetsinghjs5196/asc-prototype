-- ==============================================================================
-- MIGRATION: 046_financial_data_dictionary.sql
-- PHASE: 70 — Financial Data Dictionary
-- STATUS: STAGED / AUTHORIZATION PENDING (Read-Only Safety Preserved)
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Financial Metric Definitions Catalog
CREATE TABLE IF NOT EXISTS public.financial_metric_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_code VARCHAR(64) NOT NULL UNIQUE,
    canonical_name VARCHAR(128) NOT NULL,
    financial_category VARCHAR(32) NOT NULL CHECK (financial_category IN ('CHARGE', 'REVENUE', 'PAYMENT', 'COST', 'MARGIN', 'ADJUSTMENT', 'METRIC', 'QUALITY')),
    storage_datatype VARCHAR(32) NOT NULL DEFAULT 'NUMERIC(12,2)',
    source_table VARCHAR(64) NOT NULL,
    source_column VARCHAR(64) NOT NULL,
    business_definition TEXT NOT NULL,
    technical_definition TEXT NOT NULL,
    accounting_treatment VARCHAR(64) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Versioned Financial Formula Registry
CREATE TABLE IF NOT EXISTS public.financial_formula_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    formula_code VARCHAR(64) NOT NULL,
    version_number VARCHAR(16) NOT NULL,
    metric_id UUID NOT NULL REFERENCES public.financial_metric_definitions(id) ON DELETE RESTRICT,
    formula_expression TEXT NOT NULL,
    rounding_method VARCHAR(32) NOT NULL DEFAULT 'ROUND_HALF_UP',
    effective_start_date DATE NOT NULL,
    effective_end_date DATE,
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(formula_code, version_number)
);

-- 3. Case Financial Reconciliations Ledger
CREATE TABLE IF NOT EXISTS public.case_financial_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE RESTRICT,
    calculation_id UUID REFERENCES public.reimbursement_calculations(id),
    contract_total_allowable NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    gross_payer_payments NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    patient_payments NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    contractual_adjustments NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    underpayment_variance NUMERIC(12,2) GENERATED ALWAYS AS (contract_total_allowable - (gross_payer_payments + patient_payments + contractual_adjustments)) STORED,
    completeness_status VARCHAR(32) NOT NULL DEFAULT 'PENDING_VERIFICATION',
    reconciled_at TIMESTAMPTZ,
    reconciled_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Enable Row Level Security & Indices
ALTER TABLE public.financial_metric_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_formula_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_financial_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_reconciliations_facility ON public.case_financial_reconciliations(facility_id);
CREATE INDEX IF NOT EXISTS idx_reconciliations_surgery ON public.case_financial_reconciliations(surgery_id);
CREATE INDEX IF NOT EXISTS idx_reconciliations_status ON public.case_financial_reconciliations(completeness_status);

-- 5. Stored Procedures: Dictionary Lookups & Completeness
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

