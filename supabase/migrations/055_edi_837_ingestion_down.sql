-- ==============================================================================
-- MIGRATION DOWN: 055_edi_837_ingestion_down.sql
-- PHASE: 81 — EDI 837 Ingestion Rollback
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Drop Rollup Views
DROP VIEW IF EXISTS public.vw_edi_837_exceptions_queue CASCADE;
DROP VIEW IF EXISTS public.vw_edi_837_batch_summary CASCADE;

-- 2. Drop Tables in Reverse Dependency Order
DROP TABLE IF EXISTS public.edi_837_ingestion_exceptions CASCADE;
DROP TABLE IF EXISTS public.edi_837_staged_claims CASCADE;
DROP TABLE IF EXISTS public.edi_837_ingestion_batches CASCADE;

