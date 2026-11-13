-- ==============================================================================
-- Migration Rollback: 087_next_best_case_down.sql
-- Phase AA / A10: Next Best Case Matching & Capacity Allocation Engine
-- Module: Module 10: OR Scheduling & Utilization Optimization
-- Description: Clean, idempotent drop of all views, policies, indexes, and tables
--              associated with Phase AA/A10 next best case matching.
-- ==============================================================================

-- 1. Drop Analytical Views
DROP VIEW IF EXISTS public.vw_or_nbc_backlog_readiness_summary CASCADE;
DROP VIEW IF EXISTS public.vw_or_next_best_case_top_rankings CASCADE;

-- 2. Drop RLS Policies
DROP POLICY IF EXISTS rls_or_nbc_scoring_weights_facility ON public.or_nbc_scoring_weights;
DROP POLICY IF EXISTS rls_or_next_best_case_recommendations_facility ON public.or_next_best_case_recommendations;
DROP POLICY IF EXISTS rls_or_next_best_case_ranking_runs_facility ON public.or_next_best_case_ranking_runs;
DROP POLICY IF EXISTS rls_or_next_best_case_backlog_facility ON public.or_next_best_case_backlog;

-- 3. Drop Indexes
DROP INDEX IF EXISTS public.idx_onbc_recs_facility_score;
DROP INDEX IF EXISTS public.idx_onbc_recs_run_rank;
DROP INDEX IF EXISTS public.idx_onbc_runs_facility_date;
DROP INDEX IF EXISTS public.idx_onbc_facility_specialty;
DROP INDEX IF EXISTS public.idx_onbc_facility_status;

-- 4. Drop Tables (CASCADE removes foreign keys)
DROP TABLE IF EXISTS public.or_nbc_scoring_weights CASCADE;
DROP TABLE IF EXISTS public.or_next_best_case_recommendations CASCADE;
DROP TABLE IF EXISTS public.or_next_best_case_ranking_runs CASCADE;
DROP TABLE IF EXISTS public.or_next_best_case_backlog CASCADE;
