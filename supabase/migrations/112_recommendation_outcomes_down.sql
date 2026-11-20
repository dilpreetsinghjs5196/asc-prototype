-- ==============================================================================
-- Migration 112 Down: Rollback Recommendation Outcome Tracking & Attribution
-- Phase D5: Module 13 Decision Intelligence
-- ==============================================================================

DROP POLICY IF EXISTS recommendation_attribution_touchpoints_facility_isolation ON public.recommendation_attribution_touchpoints;
DROP POLICY IF EXISTS recommendation_outcomes_facility_isolation ON public.recommendation_outcomes;

DROP VIEW IF EXISTS public.vw_recommendation_outcome_telemetry;

DROP TABLE IF EXISTS public.recommendation_attribution_touchpoints;
DROP TABLE IF EXISTS public.recommendation_outcomes;
