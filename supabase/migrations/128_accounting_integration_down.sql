-- ==============================================================================
-- Rollback Migration: 128_accounting_integration_down.sql
-- Module 15: Enterprise Healthcare Integrations (Phase F6)
-- Description: Reverts Accounting integration tables, view, and policies.
-- ==============================================================================

-- Drop Telemetry View
DROP VIEW IF EXISTS public.vw_accounting_integration_telemetry;

-- Drop Tables in reverse dependency order
DROP TABLE IF EXISTS public.accounting_provenance_ledger;
DROP TABLE IF EXISTS public.accounting_exception_logs;
DROP TABLE IF EXISTS public.accounting_reconciliation_records;
DROP TABLE IF EXISTS public.accounting_journal_lines;
DROP TABLE IF EXISTS public.accounting_journal_batches;
DROP TABLE IF EXISTS public.accounting_chart_of_accounts;
DROP TABLE IF EXISTS public.accounting_connector_configs;
