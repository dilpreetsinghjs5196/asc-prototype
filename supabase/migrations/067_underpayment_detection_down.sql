-- ==============================================================================
-- ROLLBACK MIGRATION: 067_underpayment_detection_down.sql
-- PHASE: 93 — Underpayment Detection Engine (Revenue Cycle Management)
-- DESCRIPTION: Clean teardown of all Phase 93 views, policies, and tables.
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Drop Analytical Views
DROP VIEW IF EXISTS public.vw_rcm_underpayments_summary CASCADE;
DROP VIEW IF EXISTS public.vw_rcm_underpayments_active CASCADE;

-- 2. Drop RLS Policies
DROP POLICY IF EXISTS rcm_underpayment_actions_facility_isolation ON public.rcm_underpayment_actions;
DROP POLICY IF EXISTS rcm_underpayments_facility_isolation ON public.rcm_underpayments;
DROP POLICY IF EXISTS rcm_underpayment_rules_facility_isolation ON public.rcm_underpayment_rules;

-- 3. Drop Tables in Reverse Dependency Order
DROP TABLE IF EXISTS public.rcm_underpayment_actions CASCADE;
DROP TABLE IF EXISTS public.rcm_underpayments CASCADE;
DROP TABLE IF EXISTS public.rcm_underpayment_rules CASCADE;

