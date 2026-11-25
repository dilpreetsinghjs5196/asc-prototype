-- ==============================================================================
-- Migration 122 Down: Rollback Integration Framework Engine
-- Phase F0: Module 15 Enterprise Healthcare Integrations
-- ==============================================================================

DROP VIEW IF EXISTS public.vw_integration_framework_telemetry CASCADE;
DROP TABLE IF EXISTS public.integration_provenance_records CASCADE;
DROP TABLE IF EXISTS public.integration_mappings CASCADE;
DROP TABLE IF EXISTS public.integration_batches CASCADE;
DROP TABLE IF EXISTS public.integration_connectors CASCADE;
