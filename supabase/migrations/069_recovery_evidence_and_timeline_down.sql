-- ==============================================================================
-- DOWN MIGRATION: 069_recovery_evidence_and_timeline_down.sql
-- PHASE: 93B — Recovery Evidence and Timeline (Revenue Cycle Management)
-- DESCRIPTION: Clean teardown of recovery cases, evidence, timelines, submissions,
--              payer responses, outcomes, analytical views, and RLS policies.
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Drop Analytical Views
DROP VIEW IF EXISTS public.vw_recovery_cases_summary CASCADE;
DROP VIEW IF EXISTS public.vw_recovery_cases_active CASCADE;

-- 2. Drop Row Level Security Policies
DROP POLICY IF EXISTS recovery_outcomes_isolation ON public.recovery_outcomes;
DROP POLICY IF EXISTS payer_responses_isolation ON public.payer_responses;
DROP POLICY IF EXISTS recovery_submissions_isolation ON public.recovery_submissions;
DROP POLICY IF EXISTS recovery_evidence_isolation ON public.recovery_evidence;
DROP POLICY IF EXISTS recovery_case_events_isolation ON public.recovery_case_events;
DROP POLICY IF EXISTS recovery_cases_facility_isolation ON public.recovery_cases;

-- 3. Drop Core Tables in Reverse Dependency Order
DROP TABLE IF EXISTS public.recovery_outcomes CASCADE;
DROP TABLE IF EXISTS public.payer_responses CASCADE;
DROP TABLE IF EXISTS public.recovery_submissions CASCADE;
DROP TABLE IF EXISTS public.recovery_evidence CASCADE;
DROP TABLE IF EXISTS public.recovery_case_events CASCADE;
DROP TABLE IF EXISTS public.recovery_cases CASCADE;
