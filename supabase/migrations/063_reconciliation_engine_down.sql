-- ==============================================================================
-- MIGRATION: 063_reconciliation_engine_down.sql
-- PHASE: 89 — Claim/Remittance/Payment Reconciliation Engine (Revenue Cycle Management)
-- DESCRIPTION: Safe rollback for reconciliation header records, discrepancy cases, and views.
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Drop RLS Policies
DROP POLICY IF EXISTS rls_rcm_reconciliation_discrepancies_tenant ON public.rcm_reconciliation_discrepancies;
DROP POLICY IF EXISTS rls_rcm_reconciliation_records_tenant ON public.rcm_reconciliation_records;

-- 2. Drop Views
DROP VIEW IF EXISTS public.vw_rcm_discrepancy_worklist CASCADE;
DROP VIEW IF EXISTS public.vw_rcm_reconciliation_summary CASCADE;

-- 3. Drop Tables
DROP TABLE IF EXISTS public.rcm_reconciliation_discrepancies CASCADE;
DROP TABLE IF EXISTS public.rcm_reconciliation_records CASCADE;

