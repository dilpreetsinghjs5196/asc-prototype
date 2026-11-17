-- ==============================================================================
-- Migration: 093_payer_contract_performance.sql
-- Phase B4: Payer Contract Performance Subsystem
-- Module: Module 11: Surgeon & Clinical Intelligence / Executive Intelligence
-- Description: Establishes contract performance metrics, CPT yield audits,
--              renegotiation radar views, indexes, and multi-tenant RLS.
-- ==============================================================================

-- 1. Payer Contract Performance Metrics Table
CREATE TABLE IF NOT EXISTS public.payer_contract_performance_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    contract_id UUID REFERENCES public.payer_contracts(id) ON DELETE CASCADE,
    payer_id UUID REFERENCES public.payer_master(id) ON DELETE SET NULL,
    contract_number VARCHAR(80) NOT NULL,
    contract_name VARCHAR(256) NOT NULL,
    payer_code VARCHAR(64) NOT NULL,
    payer_name VARCHAR(256) NOT NULL,
    reimbursement_methodology VARCHAR(40) NOT NULL DEFAULT 'FEE_SCHEDULE', -- 'FEE_SCHEDULE', 'PERCENT_OF_MEDICARE', 'CASE_RATE', 'PERCENT_OF_CHARGES'
    effective_date DATE NOT NULL,
    expiration_date DATE NOT NULL,
    renewal_notice_deadline DATE NOT NULL,
    days_until_notice_cutoff INTEGER NOT NULL DEFAULT 0,
    renegotiation_status VARCHAR(32) NOT NULL DEFAULT 'MONITORING', -- 'CRITICAL_RENEWAL_ALERT', 'RENEGOTIATION_WINDOW_OPEN', 'MONITORING', 'LOCKED_AUTO_RENEWED', 'IN_ACTIVE_BARGAINING'
    total_cases_volume INTEGER NOT NULL DEFAULT 0,
    total_billed_charges NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    contract_expected_allowed NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    actual_allowed_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    net_collections NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    contract_compliance_yield_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    contract_leakage_variance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    implant_carveout_spend NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    implant_carveout_recovered NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    implant_carveout_recovery_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    avg_contribution_margin_per_or_hour NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    negotiation_leverage_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    negotiation_priority VARCHAR(16) NOT NULL DEFAULT 'MEDIUM', -- 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'
    proposed_rate_adjustment_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    potential_annual_uplift NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    primary_negotiation_target VARCHAR(256),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_payer_contract_performance UNIQUE (facility_id, contract_number, effective_date, expiration_date)
);

-- 2. Payer Contract CPT Yields Table
CREATE TABLE IF NOT EXISTS public.payer_contract_cpt_yields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    contract_performance_id UUID REFERENCES public.payer_contract_performance_metrics(id) ON DELETE CASCADE,
    cpt_code VARCHAR(16) NOT NULL,
    procedure_name VARCHAR(256) NOT NULL,
    specialty VARCHAR(64) NOT NULL,
    case_count INTEGER NOT NULL DEFAULT 0,
    contract_rate NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    actual_avg_allowed NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    unit_variance NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    total_variance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    yield_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Indexes for Query Acceleration
CREATE INDEX IF NOT EXISTS idx_pcpm_facility ON public.payer_contract_performance_metrics (facility_id);
CREATE INDEX IF NOT EXISTS idx_pcpm_contract_number ON public.payer_contract_performance_metrics (facility_id, contract_number);
CREATE INDEX IF NOT EXISTS idx_pcpm_status ON public.payer_contract_performance_metrics (facility_id, renegotiation_status);
CREATE INDEX IF NOT EXISTS idx_pccy_contract_perf ON public.payer_contract_cpt_yields (facility_id, contract_performance_id);

-- 4. Analytical Views
CREATE OR REPLACE VIEW public.vw_payer_contract_performance_summary AS
SELECT
    m.id AS performance_id,
    m.facility_id,
    m.contract_number,
    m.contract_name,
    m.payer_code,
    m.payer_name,
    m.reimbursement_methodology,
    m.expiration_date,
    m.days_until_notice_cutoff,
    m.renegotiation_status,
    m.total_cases_volume,
    m.contract_expected_allowed,
    m.actual_allowed_amount,
    m.contract_compliance_yield_pct,
    m.contract_leakage_variance,
    m.implant_carveout_recovery_pct,
    m.negotiation_leverage_score,
    m.negotiation_priority,
    m.potential_annual_uplift,
    m.primary_negotiation_target,
    m.updated_at
FROM public.payer_contract_performance_metrics m;

CREATE OR REPLACE VIEW public.vw_contract_renegotiation_pipeline AS
SELECT
    m.facility_id,
    m.id AS performance_id,
    m.contract_number,
    m.contract_name,
    m.payer_name,
    m.expiration_date,
    m.renewal_notice_deadline,
    m.days_until_notice_cutoff,
    m.renegotiation_status,
    m.negotiation_priority,
    m.negotiation_leverage_score,
    m.proposed_rate_adjustment_pct,
    m.potential_annual_uplift,
    m.primary_negotiation_target
FROM public.payer_contract_performance_metrics m
WHERE m.renegotiation_status IN ('CRITICAL_RENEWAL_ALERT', 'RENEGOTIATION_WINDOW_OPEN', 'IN_ACTIVE_BARGAINING')
ORDER BY m.days_until_notice_cutoff ASC;

-- 5. Multi-Tenant Row Level Security (RLS)
ALTER TABLE public.payer_contract_performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_contract_cpt_yields ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_payer_contract_performance_facility ON public.payer_contract_performance_metrics
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
    WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

CREATE POLICY rls_payer_contract_cpt_yields_facility ON public.payer_contract_cpt_yields
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
    WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);
