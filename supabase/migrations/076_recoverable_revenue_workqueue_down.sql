-- ==============================================================================
-- Rollback Migration: 076_recoverable_revenue_workqueue_down.sql
-- Phase 99: Recoverable Revenue Workqueue & Execution Workbench
-- ==============================================================================

-- Drop Policies
DROP POLICY IF EXISTS rls_rrw_audit_facility ON public.recoverable_revenue_audit_log;
DROP POLICY IF EXISTS rls_rrw_items_facility ON public.recoverable_revenue_work_items;
DROP POLICY IF EXISTS rls_rrw_queues_facility ON public.revenue_recovery_workqueues;

-- Drop Views
DROP VIEW IF EXISTS public.vw_specialist_workload_summary CASCADE;
DROP VIEW IF EXISTS public.vw_recoverable_revenue_workqueue_metrics CASCADE;
DROP VIEW IF EXISTS public.vw_recoverable_revenue_workqueue_active CASCADE;

-- Drop Tables (in reverse dependency order)
DROP TABLE IF EXISTS public.recoverable_revenue_audit_log CASCADE;
DROP TABLE IF EXISTS public.recoverable_revenue_work_items CASCADE;
DROP TABLE IF EXISTS public.revenue_recovery_workqueues CASCADE;
