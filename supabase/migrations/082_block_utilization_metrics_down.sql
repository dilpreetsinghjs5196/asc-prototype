-- ==============================================================================
-- Migration Rollback: 082_block_utilization_metrics_down.sql
-- Phase A5: Block Utilization Metrics, Release Efficiency & Rightsizing Engine
-- Module: Module 10: OR Scheduling & Utilization Optimization
-- Description: Clean, idempotent drop of all views, policies, indexes, and tables
--              associated with Phase A5 block utilization metrics.
-- ==============================================================================

-- 1. Drop Analytical Views
DROP VIEW IF EXISTS public.vw_or_block_wastage_leaderboard CASCADE;
DROP VIEW IF EXISTS public.vw_or_block_utilization_summary CASCADE;

-- 2. Drop RLS Policies
DROP POLICY IF EXISTS rls_or_block_governance_actions_facility ON public.or_block_governance_actions;
DROP POLICY IF EXISTS rls_or_block_utilization_period_ledgers_facility ON public.or_block_utilization_period_ledgers;

-- 3. Drop Indexes
DROP INDEX IF EXISTS public.idx_obga_status;
DROP INDEX IF EXISTS public.idx_obga_facility_block;
DROP INDEX IF EXISTS public.idx_obupl_facility_action;
DROP INDEX IF EXISTS public.idx_obupl_facility_surgeon;
DROP INDEX IF EXISTS public.idx_obupl_facility_block_period;

-- 4. Drop Tables (CASCADE removes foreign key constraints)
DROP TABLE IF EXISTS public.or_block_governance_actions CASCADE;
DROP TABLE IF EXISTS public.or_block_utilization_period_ledgers CASCADE;

