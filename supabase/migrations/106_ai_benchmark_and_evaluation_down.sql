-- ==============================================================================
-- Rollback Migration 106: AI Benchmark & Evaluation Framework
-- ==============================================================================

DROP VIEW IF EXISTS public.vw_ai_benchmark_suite_telemetry;

DROP POLICY IF EXISTS ai_benchmark_results_facility_isolation ON public.ai_benchmark_results;
DROP POLICY IF EXISTS ai_benchmark_runs_facility_isolation ON public.ai_benchmark_runs;
DROP POLICY IF EXISTS ai_benchmark_questions_facility_isolation ON public.ai_benchmark_questions;
DROP POLICY IF EXISTS ai_benchmark_suites_facility_isolation ON public.ai_benchmark_suites;

DROP TABLE IF EXISTS public.ai_benchmark_results CASCADE;
DROP TABLE IF EXISTS public.ai_benchmark_runs CASCADE;
DROP TABLE IF EXISTS public.ai_benchmark_questions CASCADE;
DROP TABLE IF EXISTS public.ai_benchmark_suites CASCADE;
