-- ==============================================================================
-- Rollback Migration: 140_weekly_revenue_leakage_report_down.sql
-- Module 17: Enterprise Reporting & Executive Packages (Phase H2)
-- Description: Cleanly tears down Phase H2 Weekly Revenue Leakage telemetry
--              view, indexes, and tables in reverse FK dependency order.
-- ==============================================================================

DROP VIEW IF EXISTS public.vw_wlr_telemetry;

DROP TABLE IF EXISTS public.wlr_dispatch_logs CASCADE;
DROP TABLE IF EXISTS public.wlr_weekly_actions CASCADE;
DROP TABLE IF EXISTS public.wlr_payer_leakage_summary CASCADE;
DROP TABLE IF EXISTS public.wlr_category_breakdown CASCADE;
DROP TABLE IF EXISTS public.wlr_priority_opportunities CASCADE;
DROP TABLE IF EXISTS public.wlr_weekly_editions CASCADE;
DROP TABLE IF EXISTS public.wlr_configs CASCADE;
