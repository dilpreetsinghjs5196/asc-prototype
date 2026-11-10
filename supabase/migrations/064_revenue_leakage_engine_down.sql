-- ==============================================================================
-- ROLLBACK MIGRATION: 064_revenue_leakage_engine_down.sql
-- PHASE: 90 — Revenue Leakage Engine (Revenue Cycle Management)
-- DESCRIPTION: Clean teardown of all Phase 90 views, policies, and tables.
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Drop Analytical Views
DROP VIEW IF EXISTS public.vw_rcm_leakage_surgeon_scorecard CASCADE;
DROP VIEW IF EXISTS public.vw_rcm_leakage_opportunities_summary CASCADE;

-- 2. Drop RLS Policies
DROP POLICY IF EXISTS rcm_leakage_evidence_facility_isolation ON public.rcm_leakage_evidence;
DROP POLICY IF EXISTS rcm_leakage_opportunities_facility_isolation ON public.rcm_leakage_opportunities;
DROP POLICY IF EXISTS rcm_leakage_rules_facility_isolation ON public.rcm_leakage_rules;

-- 3. Drop Tables in Reverse Dependency Order
DROP TABLE IF EXISTS public.rcm_leakage_evidence CASCADE;
DROP TABLE IF EXISTS public.rcm_leakage_opportunities CASCADE;
DROP TABLE IF EXISTS public.rcm_leakage_rules CASCADE;

