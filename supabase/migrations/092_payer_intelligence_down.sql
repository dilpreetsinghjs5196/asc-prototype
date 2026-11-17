-- ==============================================================================
-- Migration Rollback: 092_payer_intelligence_down.sql
-- Phase B3: Payer Intelligence Subsystem
-- Module: Module 11: Surgeon & Clinical Intelligence / Executive Intelligence
-- Description: Clean, idempotent drop of all views, policies, indexes, and tables
--              associated with Phase B3 Payer Intelligence.
-- ==============================================================================

-- 1. Drop Analytical Views
DROP VIEW IF EXISTS public.vw_facility_payer_risk_overview CASCADE;
DROP VIEW IF EXISTS public.vw_payer_intelligence_summary CASCADE;

-- 2. Drop RLS Policies
DROP POLICY IF EXISTS rls_payer_denial_reason_summaries_facility ON public.payer_denial_reason_summaries;
DROP POLICY IF EXISTS rls_payer_intelligence_metrics_facility ON public.payer_intelligence_metrics;

-- 3. Drop Indexes
DROP INDEX IF EXISTS public.idx_pdrs_facility_payer;
DROP INDEX IF EXISTS public.idx_pim_grade;
DROP INDEX IF EXISTS public.idx_pim_category;
DROP INDEX IF EXISTS public.idx_pim_facility_payer;

-- 4. Drop Tables (CASCADE removes foreign keys)
DROP TABLE IF EXISTS public.payer_denial_reason_summaries CASCADE;
DROP TABLE IF EXISTS public.payer_intelligence_metrics CASCADE;
