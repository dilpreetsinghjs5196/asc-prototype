-- ==============================================================================
-- ROLLBACK MIGRATION: 065_unbilled_case_detection_down.sql
-- PHASE: 91 — Unbilled Case Detection Engine (Revenue Cycle Management)
-- DESCRIPTION: Clean teardown of all Phase 91 views, policies, and tables.
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Drop Analytical Views
DROP VIEW IF EXISTS public.vw_rcm_unbilled_aging_summary CASCADE;
DROP VIEW IF EXISTS public.vw_rcm_unbilled_cases_active CASCADE;

-- 2. Drop RLS Policies
DROP POLICY IF EXISTS rcm_unbilled_case_actions_facility_isolation ON public.rcm_unbilled_case_actions;
DROP POLICY IF EXISTS rcm_unbilled_cases_facility_isolation ON public.rcm_unbilled_cases;

-- 3. Drop Tables in Reverse Dependency Order
DROP TABLE IF EXISTS public.rcm_unbilled_case_actions CASCADE;
DROP TABLE IF EXISTS public.rcm_unbilled_cases CASCADE;

