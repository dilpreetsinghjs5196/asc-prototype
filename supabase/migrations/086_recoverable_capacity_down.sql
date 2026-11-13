-- ==============================================================================
-- Migration Rollback: 086_recoverable_capacity_down.sql
-- Phase A9: Recoverable Capacity & Opportunity Value Engine
-- Module: Module 10: OR Scheduling & Utilization Optimization
-- Description: Clean, idempotent drop of all views, policies, indexes, and tables
--              associated with Phase A9 recoverable capacity.
-- ==============================================================================

-- 1. Drop Analytical Views
DROP VIEW IF EXISTS public.vw_or_actionable_slots_horizon CASCADE;
DROP VIEW IF EXISTS public.vw_or_recoverable_capacity_facility_summary CASCADE;

-- 2. Drop RLS Policies
DROP POLICY IF EXISTS rls_or_capacity_actionability_thresholds_facility ON public.or_capacity_actionability_thresholds;
DROP POLICY IF EXISTS rls_or_recoverable_capacity_slots_facility ON public.or_recoverable_capacity_slots;

-- 3. Drop Indexes
DROP INDEX IF EXISTS public.idx_ocat_facility_specialty;
DROP INDEX IF EXISTS public.idx_orcs_facility_tier;
DROP INDEX IF EXISTS public.idx_orcs_facility_status;
DROP INDEX IF EXISTS public.idx_orcs_facility_actionable;
DROP INDEX IF EXISTS public.idx_orcs_facility_date;

-- 4. Drop Tables (CASCADE removes foreign key constraints)
DROP TABLE IF EXISTS public.or_capacity_actionability_thresholds CASCADE;
DROP TABLE IF EXISTS public.or_recoverable_capacity_slots CASCADE;
