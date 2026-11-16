-- ==============================================================================
-- Migration Rollback: 088_scheduling_optimizer_cp_sat_down.sql
-- Phase AB / A11: Scheduling Optimizer CP-SAT Engine
-- Module: Module 10: OR Scheduling & Utilization Optimization
-- Description: Clean, idempotent drop of all views, policies, indexes, and tables
--              associated with Phase AB/A11 CP-SAT scheduling optimization.
-- ==============================================================================

-- 1. Drop Analytical Views
DROP VIEW IF EXISTS public.vw_or_cp_sat_daily_room_schedules CASCADE;
DROP VIEW IF EXISTS public.vw_or_cp_sat_run_summary CASCADE;

-- 2. Drop RLS Policies
DROP POLICY IF EXISTS rls_or_cp_sat_solver_constraints_facility ON public.or_cp_sat_solver_constraints;
DROP POLICY IF EXISTS rls_or_cp_sat_scheduled_cases_facility ON public.or_cp_sat_scheduled_cases;
DROP POLICY IF EXISTS rls_or_cp_sat_optimizer_runs_facility ON public.or_cp_sat_optimizer_runs;

-- 3. Drop Indexes
DROP INDEX IF EXISTS public.idx_ocps_cases_room_date;
DROP INDEX IF EXISTS public.idx_ocps_cases_surgeon_date;
DROP INDEX IF EXISTS public.idx_ocps_cases_run_room;
DROP INDEX IF EXISTS public.idx_ocps_runs_facility_date;

-- 4. Drop Tables (CASCADE removes foreign keys)
DROP TABLE IF EXISTS public.or_cp_sat_solver_constraints CASCADE;
DROP TABLE IF EXISTS public.or_cp_sat_scheduled_cases CASCADE;
DROP TABLE IF EXISTS public.or_cp_sat_optimizer_runs CASCADE;
