-- ==============================================================================
-- Migration 120 Down: Rollback Board Reporting Engine
-- Phase E6: Module 14 CFO Dashboard & Financial Accounting
-- ==============================================================================

DROP VIEW IF EXISTS public.vw_board_package_telemetry CASCADE;
DROP TABLE IF EXISTS public.board_package_sections CASCADE;
DROP TABLE IF EXISTS public.facility_board_packages CASCADE;
