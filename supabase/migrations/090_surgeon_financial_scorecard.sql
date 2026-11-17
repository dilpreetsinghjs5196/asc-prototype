-- ==============================================================================
-- Migration: 090_surgeon_financial_scorecard.sql
-- Phase B1: Surgeon Financial Scorecard
-- Module: Module 11: Surgeon & Clinical Intelligence
-- Description: Creates surgeon financial scorecards, CPT procedural economics,
--              analytical summary views, indexes, and multi-tenant RLS.
-- ==============================================================================

-- 1. Surgeon Financial Scorecards Table
CREATE TABLE IF NOT EXISTS public.surgeon_financial_scorecards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    surgeon_id BIGINT NOT NULL REFERENCES public.surgeons(id) ON DELETE CASCADE,
    period_type VARCHAR(16) NOT NULL DEFAULT 'MONTHLY', -- 'MONTHLY', 'QUARTERLY', 'YTD', 'ANNUAL'
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_cases INTEGER NOT NULL DEFAULT 0,
    total_or_minutes INTEGER NOT NULL DEFAULT 0,
    avg_case_minutes NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    gross_billed_charges NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    contractual_adjustments NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    net_collections NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    collection_realization_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    direct_labor_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    direct_implant_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    direct_supply_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    direct_sterile_processing_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_direct_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    net_contribution_margin NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    contribution_margin_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    margin_per_or_hour NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    facility_percentile_rank NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    payer_mix_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    cpt_mix_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_surgeon_fin_scorecard UNIQUE (facility_id, surgeon_id, period_start, period_end)
);

-- 2. Surgeon CPT Financial Performance Table
CREATE TABLE IF NOT EXISTS public.surgeon_cpt_financial_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    surgeon_id BIGINT NOT NULL REFERENCES public.surgeons(id) ON DELETE CASCADE,
    cpt_code VARCHAR(16) NOT NULL,
    cpt_description VARCHAR(256) NOT NULL,
    case_count INTEGER NOT NULL DEFAULT 0,
    avg_duration_minutes NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    avg_billed_charges NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    avg_net_collections NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    avg_direct_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    avg_contribution_margin NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    margin_per_or_hour NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Indexes for Query Acceleration
CREATE INDEX IF NOT EXISTS idx_sfs_facility_surgeon ON public.surgeon_financial_scorecards (facility_id, surgeon_id);
CREATE INDEX IF NOT EXISTS idx_sfs_period ON public.surgeon_financial_scorecards (facility_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_scfp_surgeon_cpt ON public.surgeon_cpt_financial_performance (facility_id, surgeon_id, cpt_code);

-- 4. Analytical Summary Views
CREATE OR REPLACE VIEW public.vw_surgeon_financial_scorecard_summary AS
SELECT
    sfs.id AS scorecard_id,
    sfs.facility_id,
    sfs.surgeon_id,
    CONCAT(s.firstname, ' ', s.lastname) AS surgeon_full_name,
    s.specialty,
    s.license_number,
    sfs.period_type,
    sfs.period_start,
    sfs.period_end,
    sfs.total_cases,
    sfs.total_or_minutes,
    sfs.avg_case_minutes,
    sfs.gross_billed_charges,
    sfs.contractual_adjustments,
    sfs.net_collections,
    sfs.collection_realization_pct,
    sfs.direct_labor_cost,
    sfs.direct_implant_cost,
    sfs.direct_supply_cost,
    sfs.direct_sterile_processing_cost,
    sfs.total_direct_cost,
    sfs.net_contribution_margin,
    sfs.contribution_margin_pct,
    sfs.margin_per_or_hour,
    sfs.facility_percentile_rank,
    sfs.payer_mix_json,
    sfs.cpt_mix_json,
    sfs.updated_at
FROM public.surgeon_financial_scorecards sfs
JOIN public.surgeons s ON s.id = sfs.surgeon_id;

CREATE OR REPLACE VIEW public.vw_surgeon_cpt_profitability_ranking AS
SELECT
    scfp.id AS cpt_perf_id,
    scfp.facility_id,
    scfp.surgeon_id,
    CONCAT(s.firstname, ' ', s.lastname) AS surgeon_full_name,
    s.specialty,
    scfp.cpt_code,
    scfp.cpt_description,
    scfp.case_count,
    scfp.avg_duration_minutes,
    scfp.avg_billed_charges,
    scfp.avg_net_collections,
    scfp.avg_direct_cost,
    scfp.avg_contribution_margin,
    scfp.margin_per_or_hour,
    scfp.period_start,
    scfp.period_end
FROM public.surgeon_cpt_financial_performance scfp
JOIN public.surgeons s ON s.id = scfp.surgeon_id
ORDER BY scfp.surgeon_id, scfp.avg_contribution_margin DESC;

-- 5. Multi-Tenant Row Level Security (RLS)
ALTER TABLE public.surgeon_financial_scorecards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surgeon_cpt_financial_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_surgeon_financial_scorecards_facility ON public.surgeon_financial_scorecards
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
    WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

CREATE POLICY rls_surgeon_cpt_financial_performance_facility ON public.surgeon_cpt_financial_performance
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
    WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);
