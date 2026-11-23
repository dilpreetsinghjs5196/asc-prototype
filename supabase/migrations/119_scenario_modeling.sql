-- ==============================================================================
-- Migration 119: Scenario Modeling & What-If Stress Testing Engine
-- Phase E5: Module 14 CFO Dashboard & Financial Accounting
-- Description: Establishes multi-variable operational scenario simulation models,
--              parameter levers (Volume, Payer Rate, Implants, Supplies, Labor, Fixed Overhead),
--              specialty procedural impact projections, OR capacity constraint verification,
--              RLS policies, and seed data for Naples Surgery Center.
-- ==============================================================================

-- 1. Facility Scenarios Master Table
CREATE TABLE IF NOT EXISTS public.facility_scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    scenario_code VARCHAR(32) NOT NULL,
    scenario_name VARCHAR(128) NOT NULL,
    scenario_type VARCHAR(32) NOT NULL DEFAULT 'WHAT_IF' CHECK (
        scenario_type IN ('BASELINE', 'EXPANSION', 'PAYER_RENEGOTIATION', 'COST_INFLATION', 'RECESSION_STRESS', 'WHAT_IF')
    ),
    status VARCHAR(24) NOT NULL DEFAULT 'DRAFT' CHECK (
        status IN ('DRAFT', 'SIMULATED', 'BOARD_REVIEW', 'APPROVED_STRATEGY', 'SUPERSEDED', 'ARCHIVED')
    ),
    baseline_period_code VARCHAR(16) NOT NULL DEFAULT '2026-M10',
    version_number INT NOT NULL DEFAULT 1,

    -- Parameter Levers
    case_volume_delta_percent NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    reimbursement_rate_delta_percent NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    implant_cost_inflation_percent NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    supply_cost_inflation_percent NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    labor_wage_inflation_percent NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    fixed_overhead_delta NUMERIC(14, 2) NOT NULL DEFAULT 0.00,

    -- Calculated Projections
    projected_cases INT NOT NULL DEFAULT 240,
    projected_npr NUMERIC(14, 2) NOT NULL DEFAULT 1150000.00,
    projected_direct_costs NUMERIC(14, 2) NOT NULL DEFAULT 670000.00,
    projected_contribution_margin NUMERIC(14, 2) NOT NULL DEFAULT 480000.00,
    projected_fixed_overhead NUMERIC(14, 2) NOT NULL DEFAULT 240000.00,
    projected_ebitda NUMERIC(14, 2) NOT NULL DEFAULT 240000.00,
    projected_ebitda_margin_percent NUMERIC(6, 2) NOT NULL DEFAULT 20.87,
    projected_break_even_cases INT NOT NULL DEFAULT 120,
    projected_margin_of_safety_cases INT NOT NULL DEFAULT 120,
    or_minutes_utilized INT NOT NULL DEFAULT 18240,
    or_capacity_utilization_percent NUMERIC(6, 2) NOT NULL DEFAULT 45.24,

    is_active BOOLEAN NOT NULL DEFAULT true,
    is_approved BOOLEAN NOT NULL DEFAULT false,
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES auth.users(id),
    frozen_hash VARCHAR(64),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_scenario_code UNIQUE (facility_id, scenario_code)
);

CREATE INDEX IF NOT EXISTS idx_facility_scenarios ON public.facility_scenarios(facility_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scenarios_status ON public.facility_scenarios(status);

-- 2. Scenario Specialty Impacts Breakdown Table
CREATE TABLE IF NOT EXISTS public.scenario_specialty_impacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario_id UUID NOT NULL REFERENCES public.facility_scenarios(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    specialty_code VARCHAR(32) NOT NULL,
    specialty_name VARCHAR(64) NOT NULL,
    baseline_cases INT NOT NULL DEFAULT 0,
    scenario_cases INT NOT NULL DEFAULT 0,
    baseline_revenue_per_case NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    scenario_revenue_per_case NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    baseline_variable_cost_per_case NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    scenario_variable_cost_per_case NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    projected_contribution_margin NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    projected_or_minutes INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_scenario_specialty_code UNIQUE (scenario_id, specialty_code)
);

CREATE INDEX IF NOT EXISTS idx_scenario_specialty_id ON public.scenario_specialty_impacts(scenario_id);

-- 3. Executive Telemetry View
CREATE OR REPLACE VIEW public.vw_scenario_telemetry AS
SELECT
    s.facility_id,
    s.id AS scenario_id,
    s.scenario_code,
    s.scenario_name,
    s.scenario_type,
    s.status,
    s.is_active,
    s.is_approved,
    s.case_volume_delta_percent,
    s.reimbursement_rate_delta_percent,
    s.implant_cost_inflation_percent,
    s.supply_cost_inflation_percent,
    s.labor_wage_inflation_percent,
    s.projected_cases,
    s.projected_npr,
    s.projected_direct_costs,
    s.projected_contribution_margin,
    s.projected_fixed_overhead,
    s.projected_ebitda,
    s.projected_ebitda_margin_percent,
    s.projected_break_even_cases,
    s.projected_margin_of_safety_cases,
    s.or_minutes_utilized,
    s.or_capacity_utilization_percent,
    s.frozen_hash,
    s.approved_at,
    COUNT(spec.id) AS specialty_impact_count
FROM public.facility_scenarios s
LEFT JOIN public.scenario_specialty_impacts spec ON spec.scenario_id = s.id
GROUP BY
    s.facility_id, s.id, s.scenario_code, s.scenario_name, s.scenario_type, s.status,
    s.is_active, s.is_approved, s.case_volume_delta_percent, s.reimbursement_rate_delta_percent,
    s.implant_cost_inflation_percent, s.supply_cost_inflation_percent, s.labor_wage_inflation_percent,
    s.projected_cases, s.projected_npr, s.projected_direct_costs, s.projected_contribution_margin,
    s.projected_fixed_overhead, s.projected_ebitda, s.projected_ebitda_margin_percent,
    s.projected_break_even_cases, s.projected_margin_of_safety_cases, s.or_minutes_utilized,
    s.or_capacity_utilization_percent, s.frozen_hash, s.approved_at;

-- 4. Row Level Security Policies
ALTER TABLE public.facility_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenario_specialty_impacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_facility_scenarios ON public.facility_scenarios;
CREATE POLICY tenant_isolation_facility_scenarios ON public.facility_scenarios
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    );

DROP POLICY IF EXISTS tenant_isolation_scenario_specialties ON public.scenario_specialty_impacts;
CREATE POLICY tenant_isolation_scenario_specialties ON public.scenario_specialty_impacts
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    );

-- 5. Seed Data: Naples Surgery Center Scenarios
DO $$
DECLARE
    v_facility_id UUID := '00000000-0000-0000-0000-000000000002'; -- Naples Surgery Center
    v_scen_base_id UUID := '00000000-0000-0000-0000-000000000060';
    v_scen_ortho_id UUID := '00000000-0000-0000-0000-000000000061';
    v_scen_payer_id UUID := '00000000-0000-0000-0000-000000000062';
    v_scen_infl_id UUID := '00000000-0000-0000-0000-000000000063';
    v_scen_stress_id UUID := '00000000-0000-0000-0000-000000000064';
BEGIN
    IF EXISTS (SELECT 1 FROM public.facilities WHERE id = v_facility_id) THEN

        -- Scenario 1: Baseline Operating Model
        INSERT INTO public.facility_scenarios (
            id, facility_id, scenario_code, scenario_name, scenario_type, status,
            baseline_period_code, version_number,
            case_volume_delta_percent, reimbursement_rate_delta_percent,
            implant_cost_inflation_percent, supply_cost_inflation_percent, labor_wage_inflation_percent,
            fixed_overhead_delta, projected_cases, projected_npr, projected_direct_costs,
            projected_contribution_margin, projected_fixed_overhead, projected_ebitda,
            projected_ebitda_margin_percent, projected_break_even_cases, projected_margin_of_safety_cases,
            or_minutes_utilized, or_capacity_utilization_percent, is_active, is_approved,
            frozen_hash, metadata
        ) VALUES (
            v_scen_base_id, v_facility_id, 'SCEN_BASE_2026', 'Baseline Operating Model (Oct 2026)', 'BASELINE', 'APPROVED_STRATEGY',
            '2026-M10', 1,
            0.00, 0.00, 0.00, 0.00, 0.00,
            0.00, 240, 1150000.00, 670000.00,
            480000.00, 240000.00, 240000.00,
            20.87, 120, 120,
            18240, 45.24, true, true,
            'c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2',
            '{"author": "CFO Strategic Planning", "strategicNote": "Verified closed-period operating baseline"}'::jsonb
        ) ON CONFLICT (facility_id, scenario_code) DO NOTHING;

        -- Scenario 2: Orthopedic & Spine Expansion
        INSERT INTO public.facility_scenarios (
            id, facility_id, scenario_code, scenario_name, scenario_type, status,
            baseline_period_code, version_number,
            case_volume_delta_percent, reimbursement_rate_delta_percent,
            implant_cost_inflation_percent, supply_cost_inflation_percent, labor_wage_inflation_percent,
            fixed_overhead_delta, projected_cases, projected_npr, projected_direct_costs,
            projected_contribution_margin, projected_fixed_overhead, projected_ebitda,
            projected_ebitda_margin_percent, projected_break_even_cases, projected_margin_of_safety_cases,
            or_minutes_utilized, or_capacity_utilization_percent, is_active, is_approved,
            frozen_hash, metadata
        ) VALUES (
            v_scen_ortho_id, v_facility_id, 'SCEN_ORTHO_EXP', 'Total Joint & Spine Surgical Expansion', 'EXPANSION', 'BOARD_REVIEW',
            '2026-M10', 1,
            12.50, 0.00, 0.00, 0.00, 0.00,
            0.00, 270, 1412000.00, 821000.00,
            591000.00, 240000.00, 351000.00,
            24.86, 110, 160,
            21390, 53.05, true, false,
            NULL,
            '{"author": "Chief of Surgery", "strategicNote": "Recruiting 2 orthopedic joint surgeons adding 30 cases"}'::jsonb
        ) ON CONFLICT (facility_id, scenario_code) DO NOTHING;

        -- Scenario 3: Commercial Payer Rate Compression
        INSERT INTO public.facility_scenarios (
            id, facility_id, scenario_code, scenario_name, scenario_type, status,
            baseline_period_code, version_number,
            case_volume_delta_percent, reimbursement_rate_delta_percent,
            implant_cost_inflation_percent, supply_cost_inflation_percent, labor_wage_inflation_percent,
            fixed_overhead_delta, projected_cases, projected_npr, projected_direct_costs,
            projected_contribution_margin, projected_fixed_overhead, projected_ebitda,
            projected_ebitda_margin_percent, projected_break_even_cases, projected_margin_of_safety_cases,
            or_minutes_utilized, or_capacity_utilization_percent, is_active, is_approved,
            frozen_hash, metadata
        ) VALUES (
            v_scen_payer_id, v_facility_id, 'SCEN_PAYER_CUT', 'Commercial Payer Fee Schedule Compression (-4%)', 'PAYER_RENEGOTIATION', 'SIMULATED',
            '2026-M10', 1,
            0.00, -4.00, 0.00, 0.00, 0.00,
            0.00, 240, 1104000.00, 670000.00,
            434000.00, 240000.00, 194000.00,
            17.57, 133, 107,
            18240, 45.24, true, false,
            NULL,
            '{"author": "Managed Care Contracting", "strategicNote": "Anticipated 4% allowable rate compression in commercial renewals"}'::jsonb
        ) ON CONFLICT (facility_id, scenario_code) DO NOTHING;

        -- Scenario 4: Supply Chain & Implant Inflation
        INSERT INTO public.facility_scenarios (
            id, facility_id, scenario_code, scenario_name, scenario_type, status,
            baseline_period_code, version_number,
            case_volume_delta_percent, reimbursement_rate_delta_percent,
            implant_cost_inflation_percent, supply_cost_inflation_percent, labor_wage_inflation_percent,
            fixed_overhead_delta, projected_cases, projected_npr, projected_direct_costs,
            projected_contribution_margin, projected_fixed_overhead, projected_ebitda,
            projected_ebitda_margin_percent, projected_break_even_cases, projected_margin_of_safety_cases,
            or_minutes_utilized, or_capacity_utilization_percent, is_active, is_approved,
            frozen_hash, metadata
        ) VALUES (
            v_scen_infl_id, v_facility_id, 'SCEN_INFLATION', 'Supply Chain & Implant Price Escalation', 'COST_INFLATION', 'SIMULATED',
            '2026-M10', 1,
            0.00, 0.00, 7.00, 5.00, 0.00,
            0.00, 240, 1150000.00, 701900.00,
            448100.00, 240000.00, 208100.00,
            18.10, 129, 111,
            18240, 45.24, true, false,
            NULL,
            '{"author": "Materials Management", "strategicNote": "Vendor price increases: 7% implants, 5% surgical packs"}'::jsonb
        ) ON CONFLICT (facility_id, scenario_code) DO NOTHING;

        -- Scenario 5: Multi-Factor Conservative Stress Test
        INSERT INTO public.facility_scenarios (
            id, facility_id, scenario_code, scenario_name, scenario_type, status,
            baseline_period_code, version_number,
            case_volume_delta_percent, reimbursement_rate_delta_percent,
            implant_cost_inflation_percent, supply_cost_inflation_percent, labor_wage_inflation_percent,
            fixed_overhead_delta, projected_cases, projected_npr, projected_direct_costs,
            projected_contribution_margin, projected_fixed_overhead, projected_ebitda,
            projected_ebitda_margin_percent, projected_break_even_cases, projected_margin_of_safety_cases,
            or_minutes_utilized, or_capacity_utilization_percent, is_active, is_approved,
            frozen_hash, metadata
        ) VALUES (
            v_scen_stress_id, v_facility_id, 'SCEN_STRESS_TEST', 'Multi-Factor Conservative Stress Test', 'RECESSION_STRESS', 'SIMULATED',
            '2026-M10', 1,
            -10.00, -2.50, 6.00, 6.00, 4.00,
            0.00, 216, 1009125.00, 650600.00,
            358525.00, 240000.00, 118525.00,
            11.75, 145, 71,
            16416, 40.71, true, false,
            NULL,
            '{"author": "Risk & Audit Committee", "strategicNote": "Compound stress test: -10% volume, -2.5% rate, +6% supplies, +4% labor"}'::jsonb
        ) ON CONFLICT (facility_id, scenario_code) DO NOTHING;

    END IF;
END $$;
