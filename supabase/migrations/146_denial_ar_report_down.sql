-- ==============================================================================
-- Migration: 146_denial_ar_report_down.sql
-- Module 17: Enterprise Reporting & Executive Packages (Phase H8 Rollback)
-- ==============================================================================

DROP VIEW IF EXISTS public.vw_dar_telemetry CASCADE;
DROP TABLE IF EXISTS public.dar_dispatch_logs CASCADE;
DROP TABLE IF EXISTS public.dar_appeal_resolutions CASCADE;
DROP TABLE IF EXISTS public.dar_carc_root_causes CASCADE;
DROP TABLE IF EXISTS public.dar_denial_workqueue CASCADE;
DROP TABLE IF EXISTS public.dar_aging_snapshots CASCADE;
DROP TABLE IF EXISTS public.dar_report_editions CASCADE;
DROP TABLE IF EXISTS public.dar_configs CASCADE;
