-- ==============================================================================
-- Migration: 095_cpt_economics.sql
-- Phase B6: CPT Economics Subsystem
-- Module: Module 11: Surgeon & Clinical Intelligence / Executive Intelligence
-- Description: Establishes CPT procedural economics metrics, activity-based
--              cost decompositions, payer economic yields, analytical views,
--              indexes, and multi-tenant RLS.
-- ==============================================================================

-- 1. CPT Economics Metrics Table
CREATE TABLE IF NOT EXISTS public.cpt_economics_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    cpt_code VARCHAR(16) NOT NULL,
    procedure_name VARCHAR(256) NOT NULL,
    specialty VARCHAR(64) NOT NULL,
    annual_case_volume INTEGER NOT NULL DEFAULT 0,
    avg_operative_minutes NUMERIC(6, 1) NOT NULL DEFAULT 0.0,
    avg_billed_charges NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    avg_net_collections NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    collection_realization_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    implant_cost_per_case NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    sterile_supply_cost_per_case NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    labor_cost_per_case NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    anesthesia_meds_cost_per_case NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    total_direct_cost_per_case NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    allocated_overhead_per_case NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    total_loaded_cost_per_case NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    contribution_margin_per_case NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    contribution_margin_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    net_margin_per_case NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    net_margin_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    margin_per_or_minute NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    margin_per_or_hour NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    loaded_margin_per_or_hour NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    breakeven_annual_cases INTEGER NOT NULL DEFAULT 0,
    opportunity_cost_per_case NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    economic_quadrant VARCHAR(32) NOT NULL DEFAULT 'VOLUME_PROFIT_BUILDER', -- 'PRIME_YIELD_ANCHOR', 'VOLUME_PROFIT_BUILDER', 'MARGIN_SQUEEZE_AT_RISK', 'ECONOMIC_DEFICIT'
    primary_economic_lever VARCHAR(256),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_cpt_economics_facility UNIQUE (facility_id, cpt_code)
);

-- 2. CPT Cost Component Breakdown Table
CREATE TABLE IF NOT EXISTS public.cpt_cost_component_breakdown (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    cpt_code VARCHAR(16) NOT NULL,
    cost_category VARCHAR(64) NOT NULL, -- 'IMPLANTS', 'STERILE_SUPPLIES', 'NURSING_LABOR', 'ANESTHESIA_PHARMACY', 'FACILITY_OVERHEAD'
    cost_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    cost_percentage_of_total NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    is_variable_cost BOOLEAN NOT NULL DEFAULT true,
    vendor_or_contract_reference VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. CPT Economic Payer Yields Table
CREATE TABLE IF NOT EXISTS public.cpt_economic_payer_yields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    cpt_code VARCHAR(16) NOT NULL,
    payer_code VARCHAR(64) NOT NULL,
    payer_name VARCHAR(256) NOT NULL,
    cases_count INTEGER NOT NULL DEFAULT 0,
    avg_allowed_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    avg_net_collections NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    contribution_margin_per_case NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    margin_per_or_hour NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Analytical Views
CREATE OR REPLACE VIEW public.vw_cpt_economics_summary AS
SELECT
    facility_id,
    specialty,
    COUNT(DISTINCT cpt_code) AS procedure_count,
    SUM(annual_case_volume) AS total_annual_cases,
    ROUND(SUM(annual_case_volume * avg_net_collections), 2) AS total_revenue,
    ROUND(SUM(annual_case_volume * total_direct_cost_per_case), 2) AS total_direct_costs,
    ROUND(SUM(annual_case_volume * contribution_margin_per_case), 2) AS total_contribution_margin,
    ROUND(AVG(contribution_margin_pct), 2) AS avg_contribution_margin_pct,
    ROUND(AVG(margin_per_or_hour), 2) AS avg_margin_per_or_hour,
    ROUND(AVG(loaded_margin_per_or_hour), 2) AS avg_loaded_margin_per_or_hour
FROM public.cpt_economics_metrics
GROUP BY facility_id, specialty;

CREATE OR REPLACE VIEW public.vw_cpt_breakeven_and_yield_matrix AS
SELECT
    id,
    facility_id,
    cpt_code,
    procedure_name,
    specialty,
    annual_case_volume,
    breakeven_annual_cases,
    CASE
        WHEN annual_case_volume >= breakeven_annual_cases THEN 'PROFITABLE_ABSORPTION'
        ELSE 'BELOW_BREAKEVEN_DEFICIT'
    END AS absorption_status,
    margin_per_or_hour,
    opportunity_cost_per_case,
    economic_quadrant,
    primary_economic_lever
FROM public.cpt_economics_metrics;

-- 5. Indexes for Query Performance
CREATE INDEX IF NOT EXISTS idx_cpt_econ_facility ON public.cpt_economics_metrics(facility_id);
CREATE INDEX IF NOT EXISTS idx_cpt_econ_code ON public.cpt_economics_metrics(cpt_code);
CREATE INDEX IF NOT EXISTS idx_cpt_econ_quadrant ON public.cpt_economics_metrics(economic_quadrant);
CREATE INDEX IF NOT EXISTS idx_cpt_econ_specialty ON public.cpt_economics_metrics(specialty);
CREATE INDEX IF NOT EXISTS idx_cpt_cost_comp_code ON public.cpt_cost_component_breakdown(cpt_code, cost_category);
CREATE INDEX IF NOT EXISTS idx_cpt_econ_payer ON public.cpt_economic_payer_yields(cpt_code, payer_code);

-- 6. Multi-Tenancy Row Level Security (RLS)
ALTER TABLE public.cpt_economics_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpt_cost_component_breakdown ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpt_economic_payer_yields ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_cpt_economics_metrics_facility ON public.cpt_economics_metrics
    FOR ALL USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID
    );

CREATE POLICY rls_cpt_cost_component_breakdown_facility ON public.cpt_cost_component_breakdown
    FOR ALL USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID
    );

CREATE POLICY rls_cpt_economic_payer_yields_facility ON public.cpt_economic_payer_yields
    FOR ALL USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID
    );
