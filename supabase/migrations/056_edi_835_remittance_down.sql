-- ==============================================================================
-- MIGRATION DOWN: 056_edi_835_remittance_down.sql
-- PHASE: 82 — EDI 835 Remittance Rollback
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Drop Rollup Views
DROP VIEW IF EXISTS public.vw_edi_835_exceptions_queue CASCADE;
DROP VIEW IF EXISTS public.vw_edi_835_batch_summary CASCADE;

-- 2. Drop Tables in Reverse Dependency Order
DROP TABLE IF EXISTS public.edi_835_remittance_exceptions CASCADE;
DROP TABLE IF EXISTS public.edi_835_line_adjudications CASCADE;
DROP TABLE IF EXISTS public.edi_835_claim_payments CASCADE;
DROP TABLE IF EXISTS public.edi_835_remittance_batches CASCADE;

