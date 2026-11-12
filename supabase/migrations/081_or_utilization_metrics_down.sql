-- ==============================================================================
-- Migration Rollback: 081_or_utilization_metrics_down.sql
-- Phase A4: OR Utilization Metrics & Benchmarking Engine
-- Module: Module 10: OR Scheduling & Utilization Optimization
-- Description: Clean, idempotent drop of all views, policies, indexes, and tables
--              associated with Phase A4 utilization metrics.
-- ==============================================================================

-- 1. Drop Analytical Views
DROP VIEW IF EXISTS public.vw_or_surgeon_block_compliance CASCADE;
DROP VIEW IF EXISTS public.vw_or_utilization_facility_summary CASCADE;

-- 2. Drop RLS Policies
DROP POLICY IF EXISTS rls_or_surgeon_block_utilization_facility ON public.or_surgeon_block_utilization_snapshots;
DROP POLICY IF EXISTS rls_or_utilization_daily_snapshots_facility ON public.or_utilization_daily_snapshots;

-- 3. Drop Indexes
DROP INDEX IF EXISTS public.idx_osbus_surgeon_period;
DROP INDEX IF EXISTS public.idx_osbus_facility_block;
DROP INDEX IF EXISTS public.idx_ouds_facility_date;
DROP INDEX IF EXISTS public.idx_ouds_facility_room_date;

-- 4. Drop Tables (CASCADE removes any dependent constraints)
DROP TABLE IF EXISTS public.or_surgeon_block_utilization_snapshots CASCADE;
DROP TABLE IF EXISTS public.or_utilization_daily_snapshots CASCADE;
