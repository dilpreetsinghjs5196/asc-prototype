-- ==============================================================================
-- Phase C6 Migration Rollback: AI Human Approval & Consequential Action Governance
-- ==============================================================================

DROP VIEW IF EXISTS public.vw_ai_consequential_execution_history;
DROP VIEW IF EXISTS public.vw_ai_approval_queue_summary;

DROP POLICY IF EXISTS p_ai_executions_tenant ON public.ai_consequential_executions;
DROP POLICY IF EXISTS p_ai_signatures_tenant ON public.ai_approval_signatures;
DROP POLICY IF EXISTS p_ai_approvals_tenant ON public.ai_human_approvals;

DROP TABLE IF EXISTS public.ai_consequential_executions;
DROP TABLE IF EXISTS public.ai_approval_signatures;
DROP TABLE IF EXISTS public.ai_human_approvals;
