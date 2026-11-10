-- ==============================================================================
-- ROLLBACK MIGRATION: 066_missing_charge_detection_down.sql
-- PHASE: 92 — Missing Charge Detection Engine (Revenue Cycle Management)
-- DESCRIPTION: Clean teardown of all Phase 92 views, policies, and tables.
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Drop Analytical Views
DROP VIEW IF EXISTS public.vw_rcm_missing_charges_summary CASCADE;
DROP VIEW IF EXISTS public.vw_rcm_missing_charges_active CASCADE;

-- 2. Drop RLS Policies
DROP POLICY IF EXISTS rcm_missing_charge_actions_facility_isolation ON public.rcm_missing_charge_actions;
DROP POLICY IF EXISTS rcm_missing_charges_facility_isolation ON public.rcm_missing_charges;
DROP POLICY IF EXISTS rcm_missing_charge_rules_facility_isolation ON public.rcm_missing_charge_rules;

-- 3. Drop Tables in Reverse Dependency Order
DROP TABLE IF EXISTS public.rcm_missing_charge_actions CASCADE;
DROP TABLE IF EXISTS public.rcm_missing_charges CASCADE;
DROP TABLE IF EXISTS public.rcm_missing_charge_rules CASCADE;

