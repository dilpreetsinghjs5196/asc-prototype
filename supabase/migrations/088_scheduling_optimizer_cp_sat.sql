-- ==============================================================================
-- Migration: 088_scheduling_optimizer_cp_sat.sql
-- Phase AB / A11: Scheduling Optimizer CP-SAT Engine
-- Module: Module 10: OR Scheduling & Utilization Optimization
-- Description: Creates CP-SAT optimizer runs, scheduled case assignments,
--              solver constraint parameters, analytical views, and multi-tenant RLS.
-- ==============================================================================

-- 1. Optimizer Solver Runs Table
CREATE TABLE IF NOT EXISTS public.or_cp_sat_optimizer_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    run_number VARCHAR(64) NOT NULL,
    planning_horizon_start DATE NOT NULL,
    planning_horizon_end DATE NOT NULL,
    optimization_strategy VARCHAR(32) NOT NULL DEFAULT 'BALANCED', -- 'MAX_MARGIN', 'BALANCED', 'MIN_OVERTIME', 'MIN_TURNOVER'
    solver_status VARCHAR(32) NOT NULL DEFAULT 'OPTIMAL', -- 'OPTIMAL', 'FEASIBLE', 'INFEASIBLE', 'TIMEOUT'
    solve_time_ms INTEGER NOT NULL DEFAULT 0,
    objective_value NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_cases_evaluated INTEGER NOT NULL DEFAULT 0,
    total_cases_scheduled INTEGER NOT NULL DEFAULT 0,
    total_scheduled_minutes INTEGER NOT NULL DEFAULT 0,
    projected_utilization_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    projected_overtime_minutes INTEGER NOT NULL DEFAULT 0,
    projected_total_margin NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    parameters_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    executed_by_user_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Optimizer Scheduled Cases Table
CREATE TABLE IF NOT EXISTS public.or_cp_sat_scheduled_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    run_id UUID NOT NULL REFERENCES public.or_cp_sat_optimizer_runs(id) ON DELETE CASCADE,
    case_id UUID NOT NULL,
    patient_name VARCHAR(128) NOT NULL,
    patient_mrn VARCHAR(64) NOT NULL,
    surgeon_id BIGINT REFERENCES public.surgeons(id) ON DELETE SET NULL, -- Note: BIGINT matching public.surgeons(id)
    surgeon_name VARCHAR(128) NOT NULL,
    specialty_code VARCHAR(64) NOT NULL,
    procedure_name VARCHAR(256) NOT NULL,
    primary_cpt_code VARCHAR(16) NOT NULL,
    operating_room_id UUID NOT NULL REFERENCES public.operating_rooms(id) ON DELETE CASCADE,
    room_name VARCHAR(128) NOT NULL,
    scheduled_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    duration_minutes INTEGER NOT NULL,
    turnover_minutes INTEGER NOT NULL DEFAULT 25,
    sequence_order INTEGER NOT NULL,
    is_overtime BOOLEAN NOT NULL DEFAULT FALSE,
    overtime_minutes INTEGER NOT NULL DEFAULT 0,
    projected_contribution_margin NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    schedule_status VARCHAR(32) NOT NULL DEFAULT 'PROPOSED', -- 'PROPOSED', 'COMMITTED', 'DISCARDED'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. CP-SAT Solver Constraints & Penalties Table
CREATE TABLE IF NOT EXISTS public.or_cp_sat_solver_constraints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    weight_margin NUMERIC(6, 2) NOT NULL DEFAULT 1.00,
    weight_utilization NUMERIC(6, 2) NOT NULL DEFAULT 2.00,
    weight_overtime_penalty NUMERIC(6, 2) NOT NULL DEFAULT 10.00,
    weight_turnover_penalty NUMERIC(6, 2) NOT NULL DEFAULT 1.50,
    weight_surgeon_hopping_penalty NUMERIC(6, 2) NOT NULL DEFAULT 50.00,
    max_overtime_minutes_per_room INTEGER NOT NULL DEFAULT 60,
    same_surgeon_turnover_minutes INTEGER NOT NULL DEFAULT 25,
    diff_surgeon_turnover_minutes INTEGER NOT NULL DEFAULT 40,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_cp_sat_facility_constraints UNIQUE (facility_id)
);

-- 4. Indexes for Performance & Query Acceleration
CREATE INDEX IF NOT EXISTS idx_ocps_runs_facility_date ON public.or_cp_sat_optimizer_runs (facility_id, planning_horizon_start);
CREATE INDEX IF NOT EXISTS idx_ocps_cases_run_room ON public.or_cp_sat_scheduled_cases (run_id, operating_room_id);
CREATE INDEX IF NOT EXISTS idx_ocps_cases_surgeon_date ON public.or_cp_sat_scheduled_cases (facility_id, surgeon_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_ocps_cases_room_date ON public.or_cp_sat_scheduled_cases (facility_id, operating_room_id, scheduled_date);

-- 5. Analytical Views
CREATE OR REPLACE VIEW public.vw_or_cp_sat_run_summary AS
SELECT
    r.id AS run_id,
    r.facility_id,
    r.run_number,
    r.planning_horizon_start,
    r.planning_horizon_end,
    r.optimization_strategy,
    r.solver_status,
    r.solve_time_ms,
    r.objective_value,
    r.total_cases_evaluated,
    r.total_cases_scheduled,
    r.total_scheduled_minutes,
    r.projected_utilization_pct,
    r.projected_overtime_minutes,
    r.projected_total_margin,
    r.created_at
FROM public.or_cp_sat_optimizer_runs r;

CREATE OR REPLACE VIEW public.vw_or_cp_sat_daily_room_schedules AS
SELECT
    sc.id AS scheduled_case_id,
    sc.facility_id,
    sc.run_id,
    sc.operating_room_id,
    sc.room_name,
    sc.scheduled_date,
    sc.sequence_order,
    sc.start_time,
    sc.end_time,
    sc.duration_minutes,
    sc.turnover_minutes,
    sc.is_overtime,
    sc.overtime_minutes,
    sc.projected_contribution_margin,
    sc.schedule_status,
    sc.patient_name,
    sc.patient_mrn,
    sc.surgeon_id,
    sc.surgeon_name,
    sc.specialty_code,
    sc.procedure_name,
    sc.primary_cpt_code
FROM public.or_cp_sat_scheduled_cases sc
ORDER BY sc.scheduled_date, sc.operating_room_id, sc.sequence_order;

-- 6. Multi-Tenant Row Level Security (RLS)
ALTER TABLE public.or_cp_sat_optimizer_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.or_cp_sat_scheduled_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.or_cp_sat_solver_constraints ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_or_cp_sat_optimizer_runs_facility ON public.or_cp_sat_optimizer_runs
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
    WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

CREATE POLICY rls_or_cp_sat_scheduled_cases_facility ON public.or_cp_sat_scheduled_cases
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
    WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

CREATE POLICY rls_or_cp_sat_solver_constraints_facility ON public.or_cp_sat_solver_constraints
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
    WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);
