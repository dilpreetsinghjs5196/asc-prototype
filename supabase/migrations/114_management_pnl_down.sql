-- ==============================================================================
-- Rollback Migration 114: Management P&L & Reconciliation Boundaries
-- Phase E0: Module 14 CFO Dashboard & Financial Accounting
-- ==============================================================================

DROP VIEW IF EXISTS public.vw_management_pnl_telemetry CASCADE;

DROP TABLE IF EXISTS public.management_pnl_reconciliations CASCADE;
DROP TABLE IF EXISTS public.management_pnl_statement_lines CASCADE;
DROP TABLE IF EXISTS public.management_pnl_periods CASCADE;
