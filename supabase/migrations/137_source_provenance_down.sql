-- ==============================================================================
-- Rollback Migration: 137_source_provenance_down.sql
-- Module 16: Enterprise Data Quality Governance (Phase G5)
-- Description: Cleanly tears down Phase G5 Source Provenance telemetry view,
--              indexes, and tables in reverse foreign-key dependency order.
-- ==============================================================================

DROP VIEW IF EXISTS public.vw_spr_telemetry;

DROP TABLE IF EXISTS public.spr_verification_runs CASCADE;
DROP TABLE IF EXISTS public.spr_audit_chain CASCADE;
DROP TABLE IF EXISTS public.spr_record_lineage CASCADE;
DROP TABLE IF EXISTS public.spr_ingestion_batches CASCADE;
DROP TABLE IF EXISTS public.spr_mapping_versions CASCADE;
DROP TABLE IF EXISTS public.spr_source_systems CASCADE;
DROP TABLE IF EXISTS public.spr_configs CASCADE;
