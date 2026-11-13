-- ==============================================================================
-- Migration Rollback: 084_turnover_metrics_down.sql
-- Phase A7: Turnover Metrics & Benchmark Engine
-- Module: Module 10: OR Scheduling & Utilization Optimization
-- Description: Clean, idempotent drop of all views, policies, indexes, and tables
--              associated with Phase A7 turnover metrics.
-- ==============================================================================

-- 1. Drop Analytical Views
DROP VIEW IF EXISTS public.vw_or_turnover_delay_attribution CASCADE;
DROP VIEW IF EXISTS public.vw_or_turnover_facility_summary CASCADE;

-- 2. Drop RLS Policies
DROP POLICY IF EXISTS rls_or_turnover_benchmarks_facility ON public.or_turnover_benchmarks;
DROP POLICY IF EXISTS rls_or_turnover_events_facility ON public.or_turnover_events;

-- 3. Drop Indexes
DROP INDEX IF EXISTS public.idx_otb_facility_specialty;
DROP INDEX IF EXISTS public.idx_ote_facility_delay_code;
DROP INDEX IF EXISTS public.idx_ote_facility_status;
DROP INDEX IF EXISTS public.idx_ote_facility_room;
DROP INDEX IF EXISTS public.idx_ote_facility_date;

-- 4. Drop Tables (CASCADE removes foreign key constraints)
DROP TABLE IF EXISTS public.or_turnover_benchmarks CASCADE;
DROP TABLE IF EXISTS public.or_turnover_events CASCADE;

