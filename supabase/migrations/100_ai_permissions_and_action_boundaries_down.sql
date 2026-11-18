-- ==============================================================================
-- Migration: 100_ai_permissions_and_action_boundaries_down.sql
-- Phase C2: AI Permissions & Action Boundaries Tier Rollback
-- Module: Module 12: AI & Intelligence
-- Description: Cleanly drops all views, policies, indexes, and tables established
--              in migration 100_ai_permissions_and_action_boundaries.sql.
-- ==============================================================================

-- 1. Drop Policies
DROP POLICY IF EXISTS p_ai_permission_audit_tenant ON public.ai_permission_audit_logs;
DROP POLICY IF EXISTS p_ai_proposed_actions_tenant ON public.ai_proposed_actions;
DROP POLICY IF EXISTS p_ai_action_boundaries_read ON public.ai_action_boundaries;

-- 2. Drop Analytical Views
DROP VIEW IF EXISTS public.vw_ai_permission_compliance_summary CASCADE;
DROP VIEW IF EXISTS public.vw_ai_pending_action_queue CASCADE;

-- 3. Drop Indexes
DROP INDEX IF EXISTS public.idx_ai_permission_audit_facility;
DROP INDEX IF EXISTS public.idx_ai_proposed_expires;
DROP INDEX IF EXISTS public.idx_ai_proposed_facility_status;

-- 4. Drop Tables (in reverse dependency order)
DROP TABLE IF EXISTS public.ai_permission_audit_logs CASCADE;
DROP TABLE IF EXISTS public.ai_proposed_actions CASCADE;
DROP TABLE IF EXISTS public.ai_action_boundaries CASCADE;
