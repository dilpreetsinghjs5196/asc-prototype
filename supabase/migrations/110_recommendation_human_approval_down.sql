-- ==============================================================================
-- Migration 110 Down: Rollback Recommendation Human Approval Workflow
-- Phase D3: Module 13 Decision Intelligence
-- ==============================================================================

DROP POLICY IF EXISTS recommendation_approval_actions_facility_isolation ON public.recommendation_approval_actions;
DROP POLICY IF EXISTS recommendation_approvals_facility_isolation ON public.recommendation_approvals;

DROP VIEW IF EXISTS public.vw_recommendation_approval_telemetry;

DROP TABLE IF EXISTS public.recommendation_approval_actions;
DROP TABLE IF EXISTS public.recommendation_approvals;
