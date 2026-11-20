-- ==============================================================================
-- Migration 107 DOWN: Teardown Next Best Financial Action Engine
-- Phase D0: Module 13 Decision Intelligence
-- ==============================================================================

DROP POLICY IF EXISTS nbfa_events_facility_isolation ON public.nbfa_action_events;
DROP POLICY IF EXISTS nbfa_facility_isolation ON public.next_best_financial_actions;

DROP VIEW IF EXISTS public.vw_nbfa_facility_telemetry CASCADE;
DROP TABLE IF EXISTS public.nbfa_action_events CASCADE;
DROP TABLE IF EXISTS public.next_best_financial_actions CASCADE;
