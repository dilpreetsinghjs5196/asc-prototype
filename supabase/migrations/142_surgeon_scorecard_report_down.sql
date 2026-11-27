-- ==============================================================================
-- Rollback Migration: 142_surgeon_scorecard_report_down.sql
-- Module 17: Enterprise Reporting & Executive Packages (Phase H4)
-- Description: Cleanly tears down Phase H4 Surgeon Scorecard telemetry view,
--              indexes, and tables in reverse FK dependency order.
-- ==============================================================================

DROP VIEW IF EXISTS public.vw_ssr_telemetry;

DROP TABLE IF EXISTS public.ssr_dispatch_logs CASCADE;
DROP TABLE IF EXISTS public.ssr_peer_reviews CASCADE;
DROP TABLE IF EXISTS public.ssr_cpt_mix_details CASCADE;
DROP TABLE IF EXISTS public.ssr_surgeon_scorecards CASCADE;
DROP TABLE IF EXISTS public.ssr_report_editions CASCADE;
DROP TABLE IF EXISTS public.ssr_specialty_benchmarks CASCADE;
DROP TABLE IF EXISTS public.ssr_configs CASCADE;
