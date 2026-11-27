-- ==============================================================================
-- Migration: 145_or_block_report_down.sql
-- Module 17: Enterprise Reporting & Executive Packages (Phase H7 Rollback)
-- ==============================================================================

DROP VIEW IF EXISTS public.vw_obr_telemetry CASCADE;
DROP TABLE IF EXISTS public.obr_dispatch_logs CASCADE;
DROP TABLE IF EXISTS public.obr_mec_governance_actions CASCADE;
DROP TABLE IF EXISTS public.obr_release_events CASCADE;
DROP TABLE IF EXISTS public.obr_block_scorecards CASCADE;
DROP TABLE IF EXISTS public.obr_report_editions CASCADE;
DROP TABLE IF EXISTS public.obr_suite_benchmarks CASCADE;
DROP TABLE IF EXISTS public.obr_configs CASCADE;
