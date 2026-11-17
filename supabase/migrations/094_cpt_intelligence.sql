-- ==============================================================================
-- Migration: 094_cpt_intelligence.sql
-- Phase B5: CPT Intelligence Subsystem
-- Module: Module 11: Surgeon & Clinical Intelligence / Executive Intelligence
-- Description: Establishes CPT procedural intelligence metrics, cross-surgeon
--              technique variance, payer reimbursement spread, analytical views,
--              indexes, and multi-tenant RLS.
-- ==============================================================================

-- 1. CPT Intelligence Metrics Table
CREATE TABLE IF NOT EXISTS public.cpt_intelligence_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    cpt_code VARCHAR(16) NOT NULL,
    procedure_name VARCHAR(256) NOT NULL,
    specialty VARCHAR(64) NOT NULL,
    anatomic_category VARCHAR(64),
    annual_case_volume INTEGER NOT NULL DEFAULT 0,
    avg_scheduled_minutes NUMERIC(6, 1) NOT NULL DEFAULT 0.0,
    avg_actual_or_minutes NUMERIC(6, 1) NOT NULL DEFAULT 0.0,
    p80_duration_minutes NUMERIC(6, 1) NOT NULL DEFAULT 0.0,
    avg_turnover_minutes NUMERIC(6, 1) NOT NULL DEFAULT 0.0,
    total_billed_charges NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    net_collections NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    total_direct_cost NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    implant_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    supply_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    labor_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    contribution_margin NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    margin_per_case NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    margin_per_or_hour NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    medicare_asc_base_rate NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    commercial_avg_allowed NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    medicare_parity_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    first_pass_denial_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    denial_overturn_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    avg_days_to_pay NUMERIC(5, 1) NOT NULL DEFAULT 0.0,
    avg_documentation_lag_days NUMERIC(4, 1) NOT NULL DEFAULT 0.0,
    procedural_friction_index NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    performance_tier VARCHAR(32) NOT NULL DEFAULT 'TIER_2_EFFICIENT_VOLUME', -- 'TIER_1_ANCHOR_PROFIT', 'TIER_2_EFFICIENT_VOLUME', 'TIER_3_MARGIN_DILUTER', 'TIER_4_HIGH_FRICTION'
    primary_opportunity VARCHAR(256),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_cpt_facility UNIQUE (facility_id, cpt_code)
);

-- 2. CPT Surgeon Performance Breakdown Table
CREATE TABLE IF NOT EXISTS public.cpt_surgeon_performance_breakdown (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    cpt_code VARCHAR(16) NOT NULL,
    surgeon_id BIGINT NOT NULL REFERENCES public.surgeons(id) ON DELETE CASCADE,
    surgeon_name VARCHAR(128) NOT NULL,
    case_count INTEGER NOT NULL DEFAULT 0,
    avg_skin_to_skin_minutes NUMERIC(5, 1) NOT NULL DEFAULT 0.0,
    p80_duration_minutes NUMERIC(5, 1) NOT NULL DEFAULT 0.0,
    avg_supply_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    avg_implant_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    avg_contribution_margin NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    margin_per_or_hour NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. CPT Payer Reimbursement Spread Table
CREATE TABLE IF NOT EXISTS public.cpt_payer_reimbursement_spread (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    cpt_code VARCHAR(16) NOT NULL,
    payer_code VARCHAR(64) NOT NULL,
    payer_name VARCHAR(256) NOT NULL,
    claims_count INTEGER NOT NULL DEFAULT 0,
    contract_rate NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    actual_avg_allowed NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    medicare_parity_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    first_pass_denial_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    primary_denial_reason VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Analytical Views
CREATE OR REPLACE VIEW public.vw_cpt_intelligence_summary AS
SELECT
    facility_id,
    specialty,
    COUNT(DISTINCT cpt_code) AS procedure_count,
    SUM(annual_case_volume) AS total_case_volume,
    ROUND(SUM(net_collections), 2) AS total_net_collections,
    ROUND(SUM(total_direct_cost), 2) AS total_direct_cost,
    ROUND(SUM(contribution_margin), 2) AS total_contribution_margin,
    ROUND(AVG(margin_per_or_hour), 2) AS avg_margin_per_or_hour,
    ROUND(AVG(medicare_parity_pct), 2) AS avg_medicare_parity_pct,
    ROUND(AVG(first_pass_denial_rate_pct), 2) AS avg_denial_rate_pct,
    ROUND(AVG(procedural_friction_index), 2) AS avg_friction_index
FROM public.cpt_intelligence_metrics
GROUP BY facility_id, specialty;

CREATE OR REPLACE VIEW public.vw_cpt_margin_friction_radar AS
SELECT
    id,
    facility_id,
    cpt_code,
    procedure_name,
    specialty,
    annual_case_volume,
    margin_per_or_hour,
    medicare_parity_pct,
    first_pass_denial_rate_pct,
    procedural_friction_index,
    performance_tier,
    primary_opportunity
FROM public.cpt_intelligence_metrics
WHERE performance_tier IN ('TIER_3_MARGIN_DILUTER', 'TIER_4_HIGH_FRICTION')
   OR first_pass_denial_rate_pct >= 10.0
   OR margin_per_or_hour < 1200.0;

-- 5. Indexes for Query Performance
CREATE INDEX IF NOT EXISTS idx_cpt_intel_facility ON public.cpt_intelligence_metrics(facility_id);
CREATE INDEX IF NOT EXISTS idx_cpt_intel_code ON public.cpt_intelligence_metrics(cpt_code);
CREATE INDEX IF NOT EXISTS idx_cpt_intel_tier ON public.cpt_intelligence_metrics(performance_tier);
CREATE INDEX IF NOT EXISTS idx_cpt_intel_specialty ON public.cpt_intelligence_metrics(specialty);
CREATE INDEX IF NOT EXISTS idx_cpt_surg_cpt ON public.cpt_surgeon_performance_breakdown(cpt_code, surgeon_id);
CREATE INDEX IF NOT EXISTS idx_cpt_payer_cpt ON public.cpt_payer_reimbursement_spread(cpt_code, payer_code);

-- 6. Multi-Tenancy Row Level Security (RLS)
ALTER TABLE public.cpt_intelligence_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpt_surgeon_performance_breakdown ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpt_payer_reimbursement_spread ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_cpt_intelligence_metrics_facility ON public.cpt_intelligence_metrics
    FOR ALL USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID
    );

CREATE POLICY rls_cpt_surgeon_performance_facility ON public.cpt_surgeon_performance_breakdown
    FOR ALL USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID
    );

CREATE POLICY rls_cpt_payer_reimbursement_facility ON public.cpt_payer_reimbursement_spread
    FOR ALL USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID
    );
