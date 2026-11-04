-- ==============================================================================
-- MIGRATION: 053_financial_calculation_versioning_down.sql
-- PHASE: 77 — Financial Calculation Versioning & Freeze Engine Reversion
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Drop Views
DROP VIEW IF EXISTS public.vw_calculation_version_inventory CASCADE;
DROP VIEW IF EXISTS public.vw_accounting_period_freeze_status CASCADE;

-- 2. Drop Policies and Tables
DROP POLICY IF EXISTS recalc_runs_insert_policy ON public.financial_recalculation_runs;
DROP POLICY IF EXISTS recalc_runs_select_policy ON public.financial_recalculation_runs;
DROP TABLE IF EXISTS public.financial_recalculation_runs CASCADE;

DROP POLICY IF EXISTS period_freezes_insert_policy ON public.accounting_period_freezes;
DROP POLICY IF EXISTS period_freezes_select_policy ON public.accounting_period_freezes;
DROP TABLE IF EXISTS public.accounting_period_freezes CASCADE;

DROP POLICY IF EXISTS calc_versions_insert_policy ON public.financial_calculation_versions;
DROP POLICY IF EXISTS calc_versions_select_policy ON public.financial_calculation_versions;
DROP TABLE IF EXISTS public.financial_calculation_versions CASCADE;

