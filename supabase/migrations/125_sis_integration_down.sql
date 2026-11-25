-- ==============================================================================
-- Migration: 125_sis_integration_down.sql
-- Description: Rollback Phase F3 Surgical Information Systems (SIS) EHR/PMS Gateway
-- ==============================================================================

-- Drop Telemetry View
DROP VIEW IF EXISTS public.vw_sis_integration_telemetry;

-- Drop RLS Policies
DROP POLICY IF EXISTS rls_sis_provenance_ledger_facility ON public.sis_provenance_ledger;
DROP POLICY IF EXISTS rls_sis_charge_items_facility ON public.sis_charge_items;
DROP POLICY IF EXISTS rls_sis_milestone_events_facility ON public.sis_milestone_events;
DROP POLICY IF EXISTS rls_sis_case_mappings_facility ON public.sis_case_mappings;
DROP POLICY IF EXISTS rls_sis_sync_batches_facility ON public.sis_sync_batches;
DROP POLICY IF EXISTS rls_sis_connector_configs_facility ON public.sis_connector_configs;

-- Drop Tables in reverse dependency order
DROP TABLE IF EXISTS public.sis_provenance_ledger CASCADE;
DROP TABLE IF EXISTS public.sis_charge_items CASCADE;
DROP TABLE IF EXISTS public.sis_milestone_events CASCADE;
DROP TABLE IF EXISTS public.sis_case_mappings CASCADE;
DROP TABLE IF EXISTS public.sis_sync_batches CASCADE;
DROP TABLE IF EXISTS public.sis_connector_configs CASCADE;
