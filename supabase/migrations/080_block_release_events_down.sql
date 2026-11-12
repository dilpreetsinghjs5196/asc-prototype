-- ==============================================================================
-- Migration Rollback: 080_block_release_events_down.sql
-- Phase A3: Block Release Events & Open-Pool Reallocation Engine
-- Module: Module 10: OR Scheduling & Utilization Optimization
-- Description: Clean, idempotent drop of all views, policies, indexes, and tables
--              associated with Phase A3 block release events.
-- ==============================================================================

-- 1. Drop Analytical Views
DROP VIEW IF EXISTS public.vw_or_block_release_kpis CASCADE;
DROP VIEW IF EXISTS public.vw_or_block_releases_active CASCADE;

-- 2. Drop RLS Policies
DROP POLICY IF EXISTS rls_or_block_reallocations_facility ON public.or_block_reallocations;
DROP POLICY IF EXISTS rls_or_block_release_events_facility ON public.or_block_release_events;

-- 3. Drop Indexes
DROP INDEX IF EXISTS public.idx_obreal_release_event;
DROP INDEX IF EXISTS public.idx_obre_status;
DROP INDEX IF EXISTS public.idx_obre_block_def;
DROP INDEX IF EXISTS public.idx_obre_facility_date;

-- 4. Drop Tables (CASCADE removes child foreign key dependencies)
DROP TABLE IF EXISTS public.or_block_reallocations CASCADE;
DROP TABLE IF EXISTS public.or_block_release_events CASCADE;
