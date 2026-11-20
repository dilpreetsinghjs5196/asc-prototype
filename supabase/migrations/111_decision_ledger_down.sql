-- ==============================================================================
-- Migration 111 Down: Rollback Recommendation Decision Ledger & Realized Value
-- Phase D4: Module 13 Decision Intelligence
-- ==============================================================================

DROP POLICY IF EXISTS decision_ledger_events_facility_isolation ON public.decision_ledger_events;
DROP POLICY IF EXISTS decision_ledger_entries_facility_isolation ON public.decision_ledger_entries;

DROP VIEW IF EXISTS public.vw_decision_ledger_telemetry;

DROP TABLE IF EXISTS public.decision_ledger_events;
DROP TABLE IF EXISTS public.decision_ledger_entries;
