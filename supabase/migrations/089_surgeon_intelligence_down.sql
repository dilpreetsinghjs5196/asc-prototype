-- ==============================================================================
-- Migration Rollback: 089_surgeon_intelligence_down.sql
-- Phase B0: Surgeon Intelligence Framework
-- Module: Module 11: Surgeon & Clinical Intelligence
-- Description: Clean, idempotent drop of all views, policies, indexes, and tables
--              associated with Phase B0 Surgeon Intelligence.
-- ==============================================================================

-- 1. Drop Analytical Views
DROP VIEW IF EXISTS public.vw_surgeon_intelligence_active_alerts CASCADE;
DROP VIEW IF EXISTS public.vw_surgeon_intelligence_summary CASCADE;

-- 2. Drop RLS Policies
DROP POLICY IF EXISTS rls_surgeon_intelligence_benchmarks_facility ON public.surgeon_intelligence_benchmarks;
DROP POLICY IF EXISTS rls_surgeon_intelligence_alerts_facility ON public.surgeon_intelligence_alerts;
DROP POLICY IF EXISTS rls_surgeon_intelligence_profiles_facility ON public.surgeon_intelligence_profiles;

-- 3. Drop Indexes
DROP INDEX IF EXISTS public.idx_sia_surgeon;
DROP INDEX IF EXISTS public.idx_sia_facility_status;
DROP INDEX IF EXISTS public.idx_sip_tier;
DROP INDEX IF EXISTS public.idx_sip_facility_surgeon;

-- 4. Drop Tables (CASCADE removes foreign keys)
DROP TABLE IF EXISTS public.surgeon_intelligence_benchmarks CASCADE;
DROP TABLE IF EXISTS public.surgeon_intelligence_alerts CASCADE;
DROP TABLE IF EXISTS public.surgeon_intelligence_profiles CASCADE;
