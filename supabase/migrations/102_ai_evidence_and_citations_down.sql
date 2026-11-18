-- ==============================================================================
-- Phase C4 Migration Rollback: AI Evidence, Citations & Explainability Architecture
-- ==============================================================================

DROP VIEW IF EXISTS public.vw_ai_unverified_citations;
DROP VIEW IF EXISTS public.vw_ai_citation_summary;

DROP POLICY IF EXISTS p_ai_explainability_traces_tenant ON public.ai_explainability_traces;
DROP POLICY IF EXISTS p_ai_evidence_citations_tenant ON public.ai_evidence_citations;
DROP POLICY IF EXISTS p_ai_evidence_sources_all ON public.ai_evidence_sources;

DROP TABLE IF EXISTS public.ai_explainability_traces;
DROP TABLE IF EXISTS public.ai_evidence_citations;
DROP TABLE IF EXISTS public.ai_evidence_sources;
