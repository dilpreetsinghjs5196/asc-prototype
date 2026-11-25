-- ==============================================================================
-- Migration: 129_payroll_integration_down.sql
-- Module 15: Enterprise Healthcare Integrations (Phase F7)
-- Description: Rollback script for Phase F7 Payroll & Labor Gateway.
-- ==============================================================================

-- Drop Telemetry View
DROP VIEW IF EXISTS public.vw_payroll_integration_telemetry CASCADE;

-- Drop Tables in reverse dependency order
DROP TABLE IF EXISTS public.payroll_provenance_ledger CASCADE;
DROP TABLE IF EXISTS public.payroll_exception_logs CASCADE;
DROP TABLE IF EXISTS public.payroll_case_labor_allocations CASCADE;
DROP TABLE IF EXISTS public.payroll_shift_entries CASCADE;
DROP TABLE IF EXISTS public.payroll_timecard_batches CASCADE;
DROP TABLE IF EXISTS public.payroll_employee_mappings CASCADE;
DROP TABLE IF EXISTS public.payroll_connector_configs CASCADE;
