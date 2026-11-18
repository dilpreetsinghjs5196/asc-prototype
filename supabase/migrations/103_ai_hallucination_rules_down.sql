-- ==============================================================================
-- Phase C5 Migration Rollback: AI Hallucination Rules
-- ==============================================================================

DROP VIEW IF EXISTS public.vw_ai_guardrail_health;
DROP VIEW IF EXISTS public.vw_ai_hallucination_intercept_metrics;

DROP POLICY IF EXISTS p_ai_intercepts_tenant ON public.ai_hallucination_intercept_logs;
DROP POLICY IF EXISTS p_ai_unknown_templates_all ON public.ai_unknown_handling_templates;
DROP POLICY IF EXISTS p_ai_guardrails_all ON public.ai_hallucination_guardrails;

DROP TABLE IF EXISTS public.ai_unknown_handling_templates;
DROP TABLE IF EXISTS public.ai_hallucination_intercept_logs;
DROP TABLE IF EXISTS public.ai_hallucination_guardrails;
