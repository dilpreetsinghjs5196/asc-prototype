-- ==============================================================================
-- Migration 118: Break-Even Analysis & Cost-Volume-Profit (CVP) Engine
-- Phase E4: Module 14 CFO Dashboard & Financial Accounting
-- Description: Establishes facility break-even models, fixed vs. variable cost
--              segregation, specialty contribution margin benchmarks, break-even
--              volume/revenue formulas, margin of safety, operating leverage,
--              RLS policies, and seed data for Naples Surgery Center.
-- ==============================================================================

-- 1. Facility Break-Even Models Master Table
CREATE TABLE IF NOT EXISTS public.facility_break_even_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    model_code VARCHAR(32) NOT NULL,
    model_name VARCHAR(128) NOT NULL,
    period_type VARCHAR(16) NOT NULL DEFAULT 'MONTHLY' CHECK (period_type IN ('MONTHLY', 'QUARTERLY', 'ANNUAL')),
    baseline_period_code VARCHAR(16) NOT NULL,
    version_number INT NOT NULL DEFAULT 1,
    status VARCHAR(24) NOT NULL DEFAULT 'DRAFT' CHECK (
        status IN ('DRAFT', 'UNDER_REVIEW', 'ACTIVE_BENCHMARK', 'SUPERSEDED', 'ARCHIVED')
    ),
    fixed_overhead_costs NUMERIC(14, 2) NOT NULL DEFAULT 240000.00,
    average_revenue_per_case NUMERIC(14, 2) NOT NULL DEFAULT 4791.67,
    average_variable_cost_per_case NUMERIC(14, 2) NOT NULL DEFAULT 2791.67,
    unit_contribution_margin NUMERIC(14, 2) NOT NULL DEFAULT 2000.00,
    contribution_margin_ratio NUMERIC(6, 4) NOT NULL DEFAULT 0.4174,
    break_even_cases INT NOT NULL DEFAULT 120,
    break_even_revenue NUMERIC(14, 2) NOT NULL DEFAULT 575000.00,
    operating_days_per_period INT NOT NULL DEFAULT 21,
    daily_break_even_cases NUMERIC(6, 2) NOT NULL DEFAULT 5.71,
    actual_cases INT NOT NULL DEFAULT 240,
    margin_of_safety_cases INT NOT NULL DEFAULT 120,
    margin_of_safety_percent NUMERIC(6, 2) NOT NULL DEFAULT 50.00,
    degree_of_operating_leverage NUMERIC(6, 2) NOT NULL DEFAULT 2.00,
    is_active BOOLEAN NOT NULL DEFAULT false,
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES auth.users(id),
    frozen_hash VARCHAR(64),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_be_model_code UNIQUE (facility_id, model_code)
);

CREATE INDEX IF NOT EXISTS idx_facility_be_models ON public.facility_break_even_models(facility_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_be_models_status ON public.facility_break_even_models(status);

-- 2. Break-Even Specialty Benchmarks Table
CREATE TABLE IF NOT EXISTS public.break_even_specialty_benchmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID NOT NULL REFERENCES public.facility_break_even_models(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    specialty_code VARCHAR(32) NOT NULL,
    specialty_name VARCHAR(64) NOT NULL,
    actual_monthly_cases INT NOT NULL DEFAULT 0,
    average_case_duration_minutes INT NOT NULL DEFAULT 75,
    revenue_per_case NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    implant_cost_per_case NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    supply_cost_per_case NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    labor_cost_per_case NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    variable_cost_per_case NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    unit_contribution_margin NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    contribution_margin_ratio NUMERIC(6, 4) NOT NULL DEFAULT 0.0000,
    allocated_fixed_cost NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    specialty_break_even_cases INT NOT NULL DEFAULT 0,
    margin_of_safety_cases INT NOT NULL DEFAULT 0,
    margin_of_safety_percent NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_be_model_specialty UNIQUE (model_id, specialty_code)
);

CREATE INDEX IF NOT EXISTS idx_be_specialty_model ON public.break_even_specialty_benchmarks(model_id);

-- 3. Executive Telemetry View
CREATE OR REPLACE VIEW public.vw_break_even_telemetry AS
SELECT
    m.facility_id,
    m.id AS model_id,
    m.model_code,
    m.model_name,
    m.status,
    m.is_active,
    m.fixed_overhead_costs,
    m.average_revenue_per_case,
    m.average_variable_cost_per_case,
    m.unit_contribution_margin,
    m.contribution_margin_ratio,
    m.break_even_cases,
    m.break_even_revenue,
    m.actual_cases,
    m.margin_of_safety_cases,
    m.margin_of_safety_percent,
    m.degree_of_operating_leverage,
    m.daily_break_even_cases,
    COUNT(s.id) AS specialty_count,
    COALESCE(SUM(s.actual_monthly_cases), 0) AS total_specialty_cases
FROM public.facility_break_even_models m
LEFT JOIN public.break_even_specialty_benchmarks s ON s.model_id = m.id
GROUP BY m.facility_id, m.id, m.model_code, m.model_name, m.status, m.is_active, m.fixed_overhead_costs, m.average_revenue_per_case, m.average_variable_cost_per_case, m.unit_contribution_margin, m.contribution_margin_ratio, m.break_even_cases, m.break_even_revenue, m.actual_cases, m.margin_of_safety_cases, m.margin_of_safety_percent, m.degree_of_operating_leverage, m.daily_break_even_cases;

-- 4. Row Level Security Policies
ALTER TABLE public.facility_break_even_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.break_even_specialty_benchmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_be_models ON public.facility_break_even_models;
CREATE POLICY tenant_isolation_be_models ON public.facility_break_even_models
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    );

DROP POLICY IF EXISTS tenant_isolation_be_specialties ON public.break_even_specialty_benchmarks;
CREATE POLICY tenant_isolation_be_specialties ON public.break_even_specialty_benchmarks
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    );

-- 5. Seed Data: Naples Surgery Center Break-Even Benchmark Model
DO $$
DECLARE
    v_facility_id UUID := '00000000-0000-0000-0000-000000000002'; -- Naples Surgery Center
    v_model_id UUID := '00000000-0000-0000-0000-000000000050';
BEGIN
    IF EXISTS (SELECT 1 FROM public.facilities WHERE id = v_facility_id) THEN

        INSERT INTO public.facility_break_even_models (
            id, facility_id, model_code, model_name, period_type,
            baseline_period_code, version_number, status, fixed_overhead_costs,
            average_revenue_per_case, average_variable_cost_per_case, unit_contribution_margin,
            contribution_margin_ratio, break_even_cases, break_even_revenue,
            operating_days_per_period, daily_break_even_cases, actual_cases,
            margin_of_safety_cases, margin_of_safety_percent, degree_of_operating_leverage,
            is_active, metadata
        ) VALUES (
            v_model_id, v_facility_id, 'BE2026_M10_BASE',
            'October 2026 Baseline Break-Even Model', 'MONTHLY',
            '2026-M10', 1, 'ACTIVE_BENCHMARK', 240000.00,
            4791.67, 2791.67, 2000.00,
            0.4174, 120, 575000.00,
            21, 5.71, 240,
            120, 50.00, 2.00,
            true, '{"author": "CFO Office", "method": "Linear CVP"}'::jsonb
        ) ON CONFLICT (facility_id, model_code) DO NOTHING;

    END IF;
END $$;
