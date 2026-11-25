-- ==============================================================================
-- Migration: 123_import_validation_pipeline_down.sql
-- Description: Rollback Phase F1 Import Validation Pipeline
-- ==============================================================================

-- Drop Telemetry View
DROP VIEW IF EXISTS public.vw_import_pipeline_telemetry CASCADE;

-- Drop RLS Policies
DROP POLICY IF EXISTS tenant_isolation_provenance_audit ON public.import_provenance_audit;
DROP POLICY IF EXISTS tenant_isolation_import_exceptions ON public.import_exceptions;
DROP POLICY IF EXISTS public_read_validation_rules ON public.import_validation_rules;
DROP POLICY IF EXISTS tenant_isolation_staged_records ON public.import_staged_records;
DROP POLICY IF EXISTS tenant_isolation_pipeline_batches ON public.import_pipeline_batches;

-- Drop Tables in Reverse Dependency Order
DROP TABLE IF EXISTS public.import_provenance_audit CASCADE;
DROP TABLE IF EXISTS public.import_exceptions CASCADE;
DROP TABLE IF EXISTS public.import_validation_rules CASCADE;
DROP TABLE IF EXISTS public.import_staged_records CASCADE;
DROP TABLE IF EXISTS public.import_pipeline_batches CASCADE;
