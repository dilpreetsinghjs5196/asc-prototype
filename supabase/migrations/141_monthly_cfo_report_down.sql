-- ==============================================================================
-- Rollback Migration: 141_monthly_cfo_report_down.sql
-- Module 17: Enterprise Reporting & Executive Packages (Phase H3)
-- Description: Cleanly tears down Phase H3 Monthly CFO Report telemetry view,
--              indexes, and tables in reverse FK dependency order.
-- ==============================================================================

DROP VIEW IF EXISTS public.vw_mcr_telemetry;

DROP TABLE IF EXISTS public.mcr_dispatch_logs CASCADE;
DROP TABLE IF EXISTS public.mcr_signoffs CASCADE;
DROP TABLE IF EXISTS public.mcr_variance_commentary CASCADE;
DROP TABLE IF EXISTS public.mcr_cash_ar_bridges CASCADE;
DROP TABLE IF EXISTS public.mcr_pnl_bridge CASCADE;
DROP TABLE IF EXISTS public.mcr_monthly_editions CASCADE;
DROP TABLE IF EXISTS public.mcr_configs CASCADE;
