-- ==============================================================================
-- MIGRATION: 052_financial_completeness_score_down.sql
-- PHASE: 76 — Financial Completeness Score Reversion
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Drop Views
DROP VIEW IF EXISTS public.vw_surgeon_documentation_completeness CASCADE;
DROP VIEW IF EXISTS public.vw_payer_completeness_summary CASCADE;
DROP VIEW IF EXISTS public.vw_facility_completeness_scorecard CASCADE;

-- 2. Drop Trigger and Function
DROP TRIGGER IF EXISTS trg_calculate_case_completeness ON public.case_financial_completeness;
DROP FUNCTION IF EXISTS public.fn_calculate_case_completeness();

-- 3. Drop Policies and Table
DROP POLICY IF EXISTS case_completeness_insert_policy ON public.case_financial_completeness;
DROP POLICY IF EXISTS case_completeness_select_policy ON public.case_financial_completeness;
DROP TABLE IF EXISTS public.case_financial_completeness CASCADE;
