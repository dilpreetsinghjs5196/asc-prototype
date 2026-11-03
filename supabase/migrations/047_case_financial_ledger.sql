-- ==============================================================================
-- MIGRATION: 047_case_financial_ledger.sql
-- PHASE: 71 — Case Financial Ledger & Contribution Margin Engine
-- STATUS: STAGED / AUTHORIZATION PENDING (Read-Only Safety Preserved)
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Case Financial Ledger Entries Table (Immutable Transaction Journal)
CREATE TABLE IF NOT EXISTS public.case_financial_ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE RESTRICT,
    entry_number BIGSERIAL,
    entry_type VARCHAR(32) NOT NULL CHECK (
        entry_type IN (
            'CHARGE',
            'EXPECTED_ALLOWABLE',
            'PAYER_PAYMENT',
            'PATIENT_PAYMENT',
            'SECONDARY_PAYMENT',
            'CONTRACTUAL_ADJUSTMENT',
            'ADMIN_WRITE_OFF',
            'REFUND_RECOUPMENT',
            'IMPLANT_COST',
            'SUPPLY_COST',
            'LABOR_COST',
            'OR_TIME_COST'
        )
    ),
    entry_sign SMALLINT NOT NULL CHECK (entry_sign IN (1, -1, 0)),
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0.00),
    effective_date DATE NOT NULL,
    description TEXT NOT NULL,
    source_module VARCHAR(64) NOT NULL,
    source_reference_id VARCHAR(128),
    status VARCHAR(24) NOT NULL DEFAULT 'POSTED' CHECK (
        status IN ('POSTED', 'PROVISIONAL', 'REVERSED', 'VOIDED')
    ),
    reversal_of_entry_id UUID REFERENCES public.case_financial_ledger_entries(id),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    audit_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Indexes for Case Financial Ledger Entries
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_source_unq
    ON public.case_financial_ledger_entries(surgery_id, entry_type, source_reference_id)
    WHERE status = 'POSTED' AND source_reference_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ledger_surgery ON public.case_financial_ledger_entries(surgery_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_facility ON public.case_financial_ledger_entries(facility_id, effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_type ON public.case_financial_ledger_entries(entry_type, effective_date);

-- 2. Immutability Trigger: Prohibits UPDATE and DELETE Operations
CREATE OR REPLACE FUNCTION public.fn_enforce_case_ledger_immutability()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Case financial ledger entries are immutable. Direct UPDATE and DELETE operations are prohibited. Use a REVERSAL entry instead.'
        USING ERRCODE = '23505';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_case_ledger_immutability ON public.case_financial_ledger_entries;
CREATE TRIGGER trg_case_ledger_immutability
    BEFORE UPDATE OR DELETE ON public.case_financial_ledger_entries
    FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_case_ledger_immutability();

-- 3. Row-Level Security (RLS) Policies
ALTER TABLE public.case_financial_ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY case_ledger_select_policy ON public.case_financial_ledger_entries
    FOR SELECT TO authenticated
    USING (public.is_facility_accessible(facility_id));

CREATE POLICY case_ledger_insert_policy ON public.case_financial_ledger_entries
    FOR INSERT TO authenticated
    WITH CHECK (public.is_facility_accessible(facility_id));

-- 4. Authoritative Summary View for Case Balances
CREATE OR REPLACE VIEW public.vw_case_financial_summaries AS
SELECT
    surgery_id,
    facility_id,
    COALESCE(SUM(CASE WHEN entry_type = 'CHARGE' AND status = 'POSTED' THEN amount ELSE 0 END), 0.00) AS total_billed_charges,
    COALESCE(MAX(CASE WHEN entry_type = 'EXPECTED_ALLOWABLE' AND status = 'POSTED' THEN amount ELSE NULL END), 0.00) AS contract_total_allowable,
    COALESCE(SUM(CASE WHEN entry_type IN ('PAYER_PAYMENT', 'PATIENT_PAYMENT', 'SECONDARY_PAYMENT') AND status = 'POSTED' THEN amount ELSE 0 END), 0.00)
    - COALESCE(SUM(CASE WHEN entry_type = 'REFUND_RECOUPMENT' AND status = 'POSTED' THEN amount ELSE 0 END), 0.00) AS total_net_collections,
    COALESCE(SUM(CASE WHEN entry_type = 'CONTRACTUAL_ADJUSTMENT' AND status = 'POSTED' THEN amount ELSE 0 END), 0.00) AS total_contractual_adjustments,
    COALESCE(SUM(CASE WHEN entry_type IN ('IMPLANT_COST', 'SUPPLY_COST', 'LABOR_COST', 'OR_TIME_COST') AND status = 'POSTED' THEN amount ELSE 0 END), 0.00) AS total_direct_case_costs,
    -- Expected Contribution Margin = Allowable - Direct Costs
    COALESCE(MAX(CASE WHEN entry_type = 'EXPECTED_ALLOWABLE' AND status = 'POSTED' THEN amount ELSE NULL END), 0.00)
    - COALESCE(SUM(CASE WHEN entry_type IN ('IMPLANT_COST', 'SUPPLY_COST', 'LABOR_COST', 'OR_TIME_COST') AND status = 'POSTED' THEN amount ELSE 0 END), 0.00) AS expected_contribution_margin,
    -- Actual Contribution Margin = Net Collections - Direct Costs
    (COALESCE(SUM(CASE WHEN entry_type IN ('PAYER_PAYMENT', 'PATIENT_PAYMENT', 'SECONDARY_PAYMENT') AND status = 'POSTED' THEN amount ELSE 0 END), 0.00)
    - COALESCE(SUM(CASE WHEN entry_type = 'REFUND_RECOUPMENT' AND status = 'POSTED' THEN amount ELSE 0 END), 0.00))
    - COALESCE(SUM(CASE WHEN entry_type IN ('IMPLANT_COST', 'SUPPLY_COST', 'LABOR_COST', 'OR_TIME_COST') AND status = 'POSTED' THEN amount ELSE 0 END), 0.00) AS actual_contribution_margin
FROM public.case_financial_ledger_entries
GROUP BY surgery_id, facility_id;
