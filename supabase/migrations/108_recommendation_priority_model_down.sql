-- ==============================================================================
-- Migration 108 DOWN: Teardown Recommendation Priority Model
-- Phase D1: Module 13 Decision Intelligence
-- ==============================================================================

DROP POLICY IF EXISTS score_logs_facility_isolation ON public.recommendation_score_logs;
DROP POLICY IF EXISTS scoring_profiles_facility_isolation ON public.recommendation_scoring_profiles;

DROP VIEW IF EXISTS public.vw_recommendation_scoring_telemetry CASCADE;
DROP TABLE IF EXISTS public.recommendation_score_logs CASCADE;
DROP TABLE IF EXISTS public.recommendation_scoring_profiles CASCADE;
