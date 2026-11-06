-- ==============================================================================
-- DOWN MIGRATION: 061_patient_balances_down.sql
-- PHASE: 87 — Patient Responsibility, Collections & Aging (Revenue Cycle Management)
-- DESCRIPTION: Safe rollback for patient balances ledger, audit events, and aging views.
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Drop RLS Policies
DROP POLICY IF EXISTS rls_rcm_patient_balance_events_tenant ON public.rcm_patient_balance_events;
DROP POLICY IF EXISTS rls_rcm_patient_balances_tenant ON public.rcm_patient_balances;

-- 2. Drop Analytical Views
DROP VIEW IF EXISTS public.vw_rcm_patient_collections_worklist;
DROP VIEW IF EXISTS public.vw_rcm_patient_balances_aging;

-- 3. Drop Tables in Reverse Dependency Order
DROP TABLE IF EXISTS public.rcm_patient_balance_events CASCADE;
DROP TABLE IF EXISTS public.rcm_patient_balances CASCADE;
