-- ==============================================================================
-- Rollback Migration: 138_reporting_architecture_down.sql
-- Module 17: Enterprise Reporting & Executive Packages (Phase H0)
-- Description: Cleanly tears down Phase H0 Reporting telemetry view,
--              indexes, and tables in reverse foreign-key dependency order.
-- ==============================================================================

DROP VIEW IF EXISTS public.vw_rpt_telemetry;

DROP TABLE IF EXISTS public.rpt_access_audit CASCADE;
DROP TABLE IF EXISTS public.rpt_export_artifacts CASCADE;
DROP TABLE IF EXISTS public.rpt_executions CASCADE;
DROP TABLE IF EXISTS public.rpt_schedules CASCADE;
DROP TABLE IF EXISTS public.rpt_saved_filters CASCADE;
DROP TABLE IF EXISTS public.rpt_definitions CASCADE;
DROP TABLE IF EXISTS public.rpt_configs CASCADE;
