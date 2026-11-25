-- ==============================================================================
-- Rollback Migration: 127_clearinghouse_integration_down.sql
-- Module 15: Enterprise Healthcare Integrations (Phase F5)
-- Description: Reverts Clearinghouse integration tables, view, and policies.
-- ==============================================================================

-- Drop Telemetry View
DROP VIEW IF EXISTS public.vw_clearinghouse_integration_telemetry;

-- Drop Tables in reverse dependency order
DROP TABLE IF EXISTS public.clearinghouse_provenance_ledger;
DROP TABLE IF EXISTS public.clearinghouse_exception_logs;
DROP TABLE IF EXISTS public.clearinghouse_remit_adjudications;
DROP TABLE IF EXISTS public.clearinghouse_claim_records;
DROP TABLE IF EXISTS public.clearinghouse_transmission_batches;
DROP TABLE IF EXISTS public.clearinghouse_connector_configs;
