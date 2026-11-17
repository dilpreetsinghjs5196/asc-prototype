-- ==============================================================================
-- Migration Rollback: 091_surgeon_implant_variance_down.sql
-- Phase B2: Surgeon Implant Variance & Savings Optimization
-- Module: Module 11: Surgeon & Clinical Intelligence
-- Description: Clean, idempotent drop of all views, policies, indexes, and tables
--              associated with Phase B2 Surgeon Implant Variance.
-- ==============================================================================

-- 1. Drop Analytical Views
DROP VIEW IF EXISTS public.vw_facility_implant_savings_opportunities CASCADE;
DROP VIEW IF EXISTS public.vw_surgeon_implant_variance_summary CASCADE;

-- 2. Drop RLS Policies
DROP POLICY IF EXISTS rls_surgeon_vendor_loyalty_metrics_facility ON public.surgeon_vendor_loyalty_metrics;
DROP POLICY IF EXISTS rls_surgeon_implant_variances_facility ON public.surgeon_implant_variances;

-- 3. Drop Indexes
DROP INDEX IF EXISTS public.idx_svlm_surgeon_vendor;
DROP INDEX IF EXISTS public.idx_siv_status;
DROP INDEX IF EXISTS public.idx_siv_cpt;
DROP INDEX IF EXISTS public.idx_siv_facility_surgeon;

-- 4. Drop Tables (CASCADE removes foreign keys)
DROP TABLE IF EXISTS public.surgeon_vendor_loyalty_metrics CASCADE;
DROP TABLE IF EXISTS public.surgeon_implant_variances CASCADE;
