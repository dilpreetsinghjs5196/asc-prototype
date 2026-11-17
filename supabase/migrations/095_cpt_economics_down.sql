-- ==============================================================================
-- Migration Rollback: 095_cpt_economics_down.sql
-- Phase B6: CPT Economics Subsystem
-- Module: Module 11: Surgeon & Clinical Intelligence / Executive Intelligence
-- Description: Clean, idempotent drop of all views, policies, indexes, and tables
--              associated with Phase B6 CPT Economics.
-- ==============================================================================

-- 1. Drop Analytical Views
DROP VIEW IF EXISTS public.vw_cpt_breakeven_and_yield_matrix CASCADE;
DROP VIEW IF EXISTS public.vw_cpt_economics_summary CASCADE;

-- 2. Drop RLS Policies
DROP POLICY IF EXISTS rls_cpt_economic_payer_yields_facility ON public.cpt_economic_payer_yields;
DROP POLICY IF EXISTS rls_cpt_cost_component_breakdown_facility ON public.cpt_cost_component_breakdown;
DROP POLICY IF EXISTS rls_cpt_economics_metrics_facility ON public.cpt_economics_metrics;

-- 3. Drop Indexes
DROP INDEX IF EXISTS public.idx_cpt_econ_payer;
DROP INDEX IF EXISTS public.idx_cpt_cost_comp_code;
DROP INDEX IF EXISTS public.idx_cpt_econ_specialty;
DROP INDEX IF EXISTS public.idx_cpt_econ_quadrant;
DROP INDEX IF EXISTS public.idx_cpt_econ_code;
DROP INDEX IF EXISTS public.idx_cpt_econ_facility;

-- 4. Drop Tables (CASCADE removes foreign keys)
DROP TABLE IF EXISTS public.cpt_economic_payer_yields CASCADE;
DROP TABLE IF EXISTS public.cpt_cost_component_breakdown CASCADE;
DROP TABLE IF EXISTS public.cpt_economics_metrics CASCADE;
