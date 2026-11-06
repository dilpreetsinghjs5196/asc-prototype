-- ==============================================================================
-- MIGRATION: 062_ar_aging_down.sql
-- PHASE: 88 — AR Aging, Definitions, Calculations & Work Queues (Revenue Cycle Management)
-- DESCRIPTION: Safe rollback for AR aging engine, views, collector queues, and touch ledger.
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Drop RLS Policies
DROP POLICY IF EXISTS rls_rcm_ar_touches_tenant ON public.rcm_ar_touches;
DROP POLICY IF EXISTS rls_rcm_ar_work_items_tenant ON public.rcm_ar_work_items;
DROP POLICY IF EXISTS rls_rcm_ar_work_queues_tenant ON public.rcm_ar_work_queues;

-- 2. Drop Views
DROP VIEW IF EXISTS public.vw_rcm_ar_payer_class_summary CASCADE;
DROP VIEW IF EXISTS public.vw_rcm_ar_aging_summary CASCADE;

-- 3. Drop Tables
DROP TABLE IF EXISTS public.rcm_ar_touches CASCADE;
DROP TABLE IF EXISTS public.rcm_ar_work_items CASCADE;
DROP TABLE IF EXISTS public.rcm_ar_work_queues CASCADE;

