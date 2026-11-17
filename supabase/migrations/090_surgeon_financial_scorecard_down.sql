-- ==============================================================================
-- Migration Rollback: 090_surgeon_financial_scorecard_down.sql
-- Phase B1: Surgeon Financial Scorecard
-- Module: Module 11: Surgeon & Clinical Intelligence
-- Description: Clean, idempotent drop of all views, policies, indexes, and tables
--              associated with Phase B1 Surgeon Financial Scorecard.
-- ==============================================================================

-- 1. Drop Analytical Views
DROP VIEW IF EXISTS public.vw_surgeon_cpt_profitability_ranking CASCADE;
DROP VIEW IF EXISTS public.vw_surgeon_financial_scorecard_summary CASCADE;

-- 2. Drop RLS Policies
DROP POLICY IF EXISTS rls_surgeon_cpt_financial_performance_facility ON public.surgeon_cpt_financial_performance;
DROP POLICY IF EXISTS rls_surgeon_financial_scorecards_facility ON public.surgeon_financial_scorecards;

-- 3. Drop Indexes
DROP INDEX IF EXISTS public.idx_scfp_surgeon_cpt;
DROP INDEX IF EXISTS public.idx_sfs_period;
DROP INDEX IF EXISTS public.idx_sfs_facility_surgeon;

-- 4. Drop Tables (CASCADE removes foreign keys)
DROP TABLE IF EXISTS public.surgeon_cpt_financial_performance CASCADE;
DROP TABLE IF EXISTS public.surgeon_financial_scorecards CASCADE;
