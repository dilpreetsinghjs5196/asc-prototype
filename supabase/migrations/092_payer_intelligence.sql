-- ==============================================================================
-- Migration: 092_payer_intelligence.sql
-- Phase B3: Payer Intelligence Subsystem
-- Module: Module 11: Surgeon & Clinical Intelligence / Executive Intelligence
-- Description: Establishes payer portfolio intelligence tables, denial reason
--              summaries, analytical views, indexes, and multi-tenant RLS.
-- ==============================================================================

-- 1. Payer Intelligence Metrics Table
CREATE TABLE IF NOT EXISTS public.payer_intelligence_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    payer_id UUID REFERENCES public.payer_master(id) ON DELETE SET NULL,
    payer_code VARCHAR(64) NOT NULL,
    payer_name VARCHAR(256) NOT NULL,
    payer_category VARCHAR(32) NOT NULL DEFAULT 'Commercial', -- 'Commercial', 'Medicare', 'Medicaid', 'Medicare_Advantage', 'Workers_Comp'
    evaluation_period_start DATE NOT NULL,
    evaluation_period_end DATE NOT NULL,
    claims_count INTEGER NOT NULL DEFAULT 0,
    clean_claims_count INTEGER NOT NULL DEFAULT 0,
    total_billed_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    total_contractual_adjustments NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    total_net_collections NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    realization_rate_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    avg_days_to_pay NUMERIC(6, 1) NOT NULL DEFAULT 0.0,
    era_adoption_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    prompt_pay_compliance_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    first_pass_denial_count INTEGER NOT NULL DEFAULT 0,
    first_pass_denial_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    denial_overturn_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    total_denied_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    unrecovered_denied_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    underpayment_claims_count INTEGER NOT NULL DEFAULT 0,
    underpayment_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    total_underpayment_variance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    ar_current_30 NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    ar_31_60 NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    ar_61_90 NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    ar_91_120 NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    ar_over_120 NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    total_ar_balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    aged_ar_over_90_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    payer_friction_index NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    performance_grade VARCHAR(4) NOT NULL DEFAULT 'B', -- 'A', 'B', 'C', 'D', 'F'
    top_denial_carc VARCHAR(32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_payer_intelligence_period UNIQUE (facility_id, payer_code, evaluation_period_start, evaluation_period_end)
);

-- 2. Payer Denial Reason Summaries Table
CREATE TABLE IF NOT EXISTS public.payer_denial_reason_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    payer_id UUID REFERENCES public.payer_master(id) ON DELETE SET NULL,
    payer_code VARCHAR(64) NOT NULL,
    carc_code VARCHAR(16) NOT NULL,
    carc_description VARCHAR(256) NOT NULL,
    denial_count INTEGER NOT NULL DEFAULT 0,
    denied_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    overturn_count INTEGER NOT NULL DEFAULT 0,
    overturn_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Indexes for Query Performance
CREATE INDEX IF NOT EXISTS idx_pim_facility_payer ON public.payer_intelligence_metrics (facility_id, payer_code);
CREATE INDEX IF NOT EXISTS idx_pim_category ON public.payer_intelligence_metrics (facility_id, payer_category);
CREATE INDEX IF NOT EXISTS idx_pim_grade ON public.payer_intelligence_metrics (facility_id, performance_grade);
CREATE INDEX IF NOT EXISTS idx_pdrs_facility_payer ON public.payer_denial_reason_summaries (facility_id, payer_code);

-- 4. Analytical Views
CREATE OR REPLACE VIEW public.vw_payer_intelligence_summary AS
SELECT
    pim.id AS metric_id,
    pim.facility_id,
    pim.payer_code,
    pim.payer_name,
    pim.payer_category,
    pim.claims_count,
    pim.total_billed_amount,
    pim.total_net_collections,
    pim.realization_rate_pct,
    pim.avg_days_to_pay,
    pim.first_pass_denial_rate_pct,
    pim.denial_overturn_rate_pct,
    pim.total_underpayment_variance,
    pim.total_ar_balance,
    pim.aged_ar_over_90_pct,
    pim.payer_friction_index,
    pim.performance_grade,
    pim.top_denial_carc,
    pim.updated_at
FROM public.payer_intelligence_metrics pim;

CREATE OR REPLACE VIEW public.vw_facility_payer_risk_overview AS
SELECT
    pim.facility_id,
    COUNT(DISTINCT pim.payer_code) AS total_active_payers,
    SUM(pim.claims_count) AS total_claims_volume,
    SUM(pim.total_billed_amount) AS portfolio_billed_charges,
    SUM(pim.total_net_collections) AS portfolio_net_collections,
    ROUND((SUM(pim.total_net_collections) / NULLIF(SUM(pim.total_billed_amount), 0) * 100)::numeric, 2) AS portfolio_realization_pct,
    ROUND(AVG(pim.avg_days_to_pay)::numeric, 1) AS portfolio_avg_days_to_pay,
    ROUND(AVG(pim.first_pass_denial_rate_pct)::numeric, 2) AS portfolio_avg_denial_rate_pct,
    SUM(pim.total_underpayment_variance) AS total_underpayment_exposure,
    SUM(pim.total_ar_balance) AS total_portfolio_ar,
    SUM(pim.ar_91_120 + pim.ar_over_120) AS total_aged_ar_over_90,
    COUNT(CASE WHEN pim.performance_grade IN ('C', 'D', 'F') THEN 1 END) AS high_friction_payers_count
FROM public.payer_intelligence_metrics pim
GROUP BY pim.facility_id;

-- 5. Multi-Tenant Row Level Security (RLS)
ALTER TABLE public.payer_intelligence_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_denial_reason_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_payer_intelligence_metrics_facility ON public.payer_intelligence_metrics
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
    WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

CREATE POLICY rls_payer_denial_reason_summaries_facility ON public.payer_denial_reason_summaries
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
    WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);
