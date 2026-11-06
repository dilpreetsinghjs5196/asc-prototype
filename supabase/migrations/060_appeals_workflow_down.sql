-- ==============================================================================
-- DOWN MIGRATION: 060_appeals_workflow_down.sql
-- PHASE: 86 — Appeals Workflow & Dispute Management (Revenue Cycle Management)
-- DESCRIPTION: Safe rollback for appeals workflow, evidence exhibits, audit ledger, and views.
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Drop RLS Policies
DROP POLICY IF EXISTS rls_rcm_appeal_events_tenant ON public.rcm_appeal_events;
DROP POLICY IF EXISTS rls_rcm_appeal_evidence_tenant ON public.rcm_appeal_evidence;
DROP POLICY IF EXISTS rls_rcm_appeals_tenant ON public.rcm_appeals;

-- 2. Drop Analytical Views
DROP VIEW IF EXISTS public.vw_rcm_appeals_settlement_analytics;
DROP VIEW IF EXISTS public.vw_rcm_active_appeals_queue;

-- 3. Drop Tables in Reverse Dependency Order
DROP TABLE IF EXISTS public.rcm_appeal_events CASCADE;
DROP TABLE IF EXISTS public.rcm_appeal_evidence CASCADE;
DROP TABLE IF EXISTS public.rcm_appeals CASCADE;

