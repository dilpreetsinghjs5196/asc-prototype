-- ==============================================================================
-- Migration: 091_surgeon_implant_variance.sql
-- Phase B2: Surgeon Implant Variance & Savings Optimization
-- Module: Module 11: Surgeon & Clinical Intelligence
-- Description: Creates surgeon implant variances, vendor loyalty metrics,
--              analytical summary views, indexes, and multi-tenant RLS.
-- ==============================================================================

-- 1. Surgeon Implant Variances Table
CREATE TABLE IF NOT EXISTS public.surgeon_implant_variances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    surgeon_id BIGINT NOT NULL REFERENCES public.surgeons(id) ON DELETE CASCADE,
    cpt_code VARCHAR(16) NOT NULL,
    procedure_name VARCHAR(256) NOT NULL,
    specialty_code VARCHAR(64) NOT NULL,
    evaluation_period_start DATE NOT NULL,
    evaluation_period_end DATE NOT NULL,
    case_count INTEGER NOT NULL DEFAULT 0,
    surgeon_avg_implant_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    peer_median_implant_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    contract_baseline_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    unit_cost_variance NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    variance_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    total_excess_spend NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    primary_vendor_id UUID REFERENCES public.implant_vendors(id) ON DELETE SET NULL,
    primary_vendor_name VARCHAR(128) NOT NULL,
    primary_construct_name VARCHAR(256) NOT NULL,
    recommended_substitute_construct VARCHAR(256),
    potential_unit_savings NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    potential_total_savings NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    waste_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    waste_cost_total NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    variance_status VARCHAR(32) NOT NULL DEFAULT 'EFFICIENT', -- 'EFFICIENT', 'MODERATE_VARIANCE', 'HIGH_VARIANCE_OUTLIER'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_surgeon_implant_variance UNIQUE (facility_id, surgeon_id, cpt_code, evaluation_period_start, evaluation_period_end)
);

-- 2. Surgeon Vendor Loyalty Metrics Table
CREATE TABLE IF NOT EXISTS public.surgeon_vendor_loyalty_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    surgeon_id BIGINT NOT NULL REFERENCES public.surgeons(id) ON DELETE CASCADE,
    vendor_id UUID REFERENCES public.implant_vendors(id) ON DELETE SET NULL,
    vendor_name VARCHAR(128) NOT NULL,
    specialty_code VARCHAR(64) NOT NULL,
    case_count INTEGER NOT NULL DEFAULT 0,
    total_spend NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    spend_share_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    is_contracted_tier1 BOOLEAN NOT NULL DEFAULT TRUE,
    rebate_eligible BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Indexes for Performance Acceleration
CREATE INDEX IF NOT EXISTS idx_siv_facility_surgeon ON public.surgeon_implant_variances (facility_id, surgeon_id);
CREATE INDEX IF NOT EXISTS idx_siv_cpt ON public.surgeon_implant_variances (facility_id, cpt_code);
CREATE INDEX IF NOT EXISTS idx_siv_status ON public.surgeon_implant_variances (facility_id, variance_status);
CREATE INDEX IF NOT EXISTS idx_svlm_surgeon_vendor ON public.surgeon_vendor_loyalty_metrics (facility_id, surgeon_id, vendor_id);

-- 4. Analytical Views
CREATE OR REPLACE VIEW public.vw_surgeon_implant_variance_summary AS
SELECT
    v.id AS variance_id,
    v.facility_id,
    v.surgeon_id,
    CONCAT(s.firstname, ' ', s.lastname) AS surgeon_full_name,
    s.specialty,
    v.cpt_code,
    v.procedure_name,
    v.case_count,
    v.surgeon_avg_implant_cost,
    v.peer_median_implant_cost,
    v.contract_baseline_cost,
    v.unit_cost_variance,
    v.variance_pct,
    v.total_excess_spend,
    v.primary_vendor_name,
    v.primary_construct_name,
    v.recommended_substitute_construct,
    v.potential_unit_savings,
    v.potential_total_savings,
    v.waste_rate_pct,
    v.waste_cost_total,
    v.variance_status,
    v.updated_at
FROM public.surgeon_implant_variances v
JOIN public.surgeons s ON s.id = v.surgeon_id;

CREATE OR REPLACE VIEW public.vw_facility_implant_savings_opportunities AS
SELECT
    v.facility_id,
    v.cpt_code,
    v.procedure_name,
    v.specialty_code,
    COUNT(DISTINCT v.surgeon_id) AS surgeons_count,
    SUM(v.case_count) AS total_procedure_cases,
    SUM(v.total_excess_spend) AS total_excess_spend,
    SUM(v.potential_total_savings) AS total_realizable_savings,
    SUM(v.waste_cost_total) AS total_waste_cost
FROM public.surgeon_implant_variances v
GROUP BY v.facility_id, v.cpt_code, v.procedure_name, v.specialty_code
ORDER BY SUM(v.potential_total_savings) DESC;

-- 5. Multi-Tenant Row Level Security (RLS)
ALTER TABLE public.surgeon_implant_variances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surgeon_vendor_loyalty_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_surgeon_implant_variances_facility ON public.surgeon_implant_variances
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
    WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

CREATE POLICY rls_surgeon_vendor_loyalty_metrics_facility ON public.surgeon_vendor_loyalty_metrics
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
    WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);
