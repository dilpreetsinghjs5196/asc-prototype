-- ==============================================================================
-- Migration: 144_cpt_economics_report_down.sql
-- Module 17: Enterprise Reporting & Executive Packages (Phase H6 Rollback)
-- ==============================================================================

DROP VIEW IF EXISTS public.vw_cer_telemetry CASCADE;
DROP TABLE IF EXISTS public.cer_dispatch_logs CASCADE;
DROP TABLE IF EXISTS public.cer_cost_optimization_reviews CASCADE;
DROP TABLE IF EXISTS public.cer_payer_rate_matrix CASCADE;
DROP TABLE IF EXISTS public.cer_cpt_scorecards CASCADE;
DROP TABLE IF EXISTS public.cer_report_editions CASCADE;
DROP TABLE IF EXISTS public.cer_specialty_benchmarks CASCADE;
DROP TABLE IF EXISTS public.cer_configs CASCADE;
