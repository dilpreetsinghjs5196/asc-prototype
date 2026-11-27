-- ==============================================================================
-- Migration: 143_payer_scorecard_report_down.sql
-- Module 17: Enterprise Reporting & Executive Packages (Phase H5 Rollback)
-- ==============================================================================

DROP VIEW IF EXISTS public.vw_psr_telemetry CASCADE;
DROP TABLE IF EXISTS public.psr_dispatch_logs CASCADE;
DROP TABLE IF EXISTS public.psr_negotiation_actions CASCADE;
DROP TABLE IF EXISTS public.psr_contract_variance_details CASCADE;
DROP TABLE IF EXISTS public.psr_payer_scorecards CASCADE;
DROP TABLE IF EXISTS public.psr_report_editions CASCADE;
DROP TABLE IF EXISTS public.psr_category_benchmarks CASCADE;
DROP TABLE IF EXISTS public.psr_configs CASCADE;
