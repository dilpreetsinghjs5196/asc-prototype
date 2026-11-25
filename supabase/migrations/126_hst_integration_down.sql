-- ==============================================================================
-- Migration: 126_hst_integration_down.sql
-- Description: Rollback Phase F4 HST Pathways EHR/PMS Gateway
-- ==============================================================================

-- Drop Telemetry View
DROP VIEW IF EXISTS public.vw_hst_integration_telemetry;

-- Drop RLS Policies
DROP POLICY IF EXISTS rls_hst_provenance_ledger_facility ON public.hst_provenance_ledger;
DROP POLICY IF EXISTS rls_hst_charge_items_facility ON public.hst_charge_items;
DROP POLICY IF EXISTS rls_hst_milestone_events_facility ON public.hst_milestone_events;
DROP POLICY IF EXISTS rls_hst_case_mappings_facility ON public.hst_case_mappings;
DROP POLICY IF EXISTS rls_hst_sync_batches_facility ON public.hst_sync_batches;
DROP POLICY IF EXISTS rls_hst_connector_configs_facility ON public.hst_connector_configs;

-- Drop Tables in reverse dependency order
DROP TABLE IF EXISTS public.hst_provenance_ledger CASCADE;
DROP TABLE IF EXISTS public.hst_charge_items CASCADE;
DROP TABLE IF EXISTS public.hst_milestone_events CASCADE;
DROP TABLE IF EXISTS public.hst_case_mappings CASCADE;
DROP TABLE IF EXISTS public.hst_sync_batches CASCADE;
DROP TABLE IF EXISTS public.hst_connector_configs CASCADE;
