-- ==============================================================================
-- Rollback Migration: 139_daily_admin_brief_down.sql
-- Module 17: Enterprise Reporting & Executive Packages (Phase H1)
-- Description: Cleanly tears down Phase H1 Daily Admin Brief telemetry view,
--              indexes, and tables in reverse foreign-key dependency order.
-- ==============================================================================

DROP VIEW IF EXISTS public.vw_dab_telemetry;

DROP TABLE IF EXISTS public.dab_dispatch_logs CASCADE;
DROP TABLE IF EXISTS public.dab_acknowledgments CASCADE;
DROP TABLE IF EXISTS public.dab_surgeon_day_roster CASCADE;
DROP TABLE IF EXISTS public.dab_or_suite_pulse CASCADE;
DROP TABLE IF EXISTS public.dab_action_items CASCADE;
DROP TABLE IF EXISTS public.dab_daily_snapshots CASCADE;
DROP TABLE IF EXISTS public.dab_configs CASCADE;
