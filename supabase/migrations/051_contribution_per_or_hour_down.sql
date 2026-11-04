-- ==============================================================================
-- MIGRATION: 051_contribution_per_or_hour_down.sql
-- PHASE: 75 — Contribution Per OR Hour & Financial Yield Engine Reversion
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Drop Views
DROP VIEW IF EXISTS public.vw_specialty_or_yield_matrix CASCADE;
DROP VIEW IF EXISTS public.vw_surgeon_or_yield_benchmarks CASCADE;
DROP VIEW IF EXISTS public.vw_operating_room_yield_summary CASCADE;

-- 2. Drop Trigger and Function
DROP TRIGGER IF EXISTS trg_calculate_case_or_yield ON public.case_or_yield_metrics;
DROP FUNCTION IF EXISTS public.fn_calculate_case_or_yield();

-- 3. Drop Policies and Table
DROP POLICY IF EXISTS or_yield_metrics_insert_policy ON public.case_or_yield_metrics;
DROP POLICY IF EXISTS or_yield_metrics_select_policy ON public.case_or_yield_metrics;
DROP TABLE IF EXISTS public.case_or_yield_metrics CASCADE;

