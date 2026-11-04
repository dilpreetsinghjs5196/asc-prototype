-- ==============================================================================
-- MIGRATION DOWN: 057_rcm_payments_adjustments_down.sql
-- PHASE: 83 — Payments & Adjustments Rollback
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Drop Rollup Views
DROP VIEW IF EXISTS public.vw_rcm_unapplied_cash_ledger CASCADE;
DROP VIEW IF EXISTS public.vw_rcm_cash_posting_summary CASCADE;

-- 2. Drop Tables in Reverse Dependency Order
DROP TABLE IF EXISTS public.rcm_refund_recoupment_ledger CASCADE;
DROP TABLE IF EXISTS public.rcm_payment_transactions CASCADE;
DROP TABLE IF EXISTS public.rcm_payment_batches CASCADE;
