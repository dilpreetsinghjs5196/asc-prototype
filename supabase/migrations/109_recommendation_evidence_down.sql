-- ==============================================================================
-- Migration 109 Down: Rollback Recommendation Evidence Model & Provenance Chain
-- Phase D2: Module 13 Decision Intelligence
-- ==============================================================================

DROP POLICY IF EXISTS recommendation_evidence_audits_facility_isolation ON public.recommendation_evidence_audits;
DROP POLICY IF EXISTS recommendation_evidence_items_facility_isolation ON public.recommendation_evidence_items;

DROP VIEW IF EXISTS public.vw_recommendation_evidence_summary;

DROP TABLE IF EXISTS public.recommendation_evidence_audits;
DROP TABLE IF EXISTS public.recommendation_evidence_items;
