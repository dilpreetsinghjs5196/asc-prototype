-- ==============================================================================
-- Migration: 147_board_package_report_down.sql
-- Module 17: Enterprise Reporting & Executive Packages (Phase H9 Rollback)
-- ==============================================================================

DROP VIEW IF EXISTS public.vw_bpk_telemetry CASCADE;
DROP TABLE IF EXISTS public.bpk_dispatch_logs CASCADE;
DROP TABLE IF EXISTS public.bpk_signoff_audit CASCADE;
DROP TABLE IF EXISTS public.bpk_strategic_resolutions CASCADE;
DROP TABLE IF EXISTS public.bpk_executive_sections CASCADE;
DROP TABLE IF EXISTS public.bpk_covenants CASCADE;
DROP TABLE IF EXISTS public.bpk_packages CASCADE;
DROP TABLE IF EXISTS public.bpk_configs CASCADE;
