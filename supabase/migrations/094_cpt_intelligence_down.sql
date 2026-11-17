-- ==============================================================================
-- Migration Rollback: 094_cpt_intelligence_down.sql
-- Phase B5: CPT Intelligence Subsystem
-- Module: Module 11: Surgeon & Clinical Intelligence / Executive Intelligence
-- Description: Clean, idempotent drop of all views, policies, indexes, and tables
--              associated with Phase B5 CPT Intelligence.
-- ==============================================================================

-- 1. Drop Analytical Views
DROP VIEW IF EXISTS public.vw_cpt_margin_friction_radar CASCADE;
DROP VIEW IF EXISTS public.vw_cpt_intelligence_summary CASCADE;

-- 2. Drop RLS Policies
DROP POLICY IF EXISTS rls_cpt_payer_reimbursement_facility ON public.cpt_payer_reimbursement_spread;
DROP POLICY IF EXISTS rls_cpt_surgeon_performance_facility ON public.cpt_surgeon_performance_breakdown;
DROP POLICY IF EXISTS rls_cpt_intelligence_metrics_facility ON public.cpt_intelligence_metrics;

-- 3. Drop Indexes
DROP INDEX IF EXISTS public.idx_cpt_payer_cpt;
DROP INDEX IF EXISTS public.idx_cpt_surg_cpt;
DROP INDEX IF EXISTS public.idx_cpt_intel_specialty;
DROP INDEX IF EXISTS public.idx_cpt_intel_tier;
DROP INDEX IF EXISTS public.idx_cpt_intel_code;
DROP INDEX IF EXISTS public.idx_cpt_intel_facility;

-- 4. Drop Tables (CASCADE removes foreign keys)
DROP TABLE IF EXISTS public.cpt_payer_reimbursement_spread CASCADE;
DROP TABLE IF EXISTS public.cpt_surgeon_performance_breakdown CASCADE;
DROP TABLE IF EXISTS public.cpt_intelligence_metrics CASCADE;
