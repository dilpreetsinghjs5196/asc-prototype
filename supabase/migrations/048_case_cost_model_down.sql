-- ==============================================================================
-- ROLLBACK MIGRATION: 048_case_cost_model_down.sql
-- PHASE: 72 — Case Cost Model & Activity-Based Procedural Cost Accounting
-- ==============================================================================

SET search_path = public, pg_temp;

DROP VIEW IF EXISTS public.vw_case_cost_breakdowns CASCADE;
DROP TABLE IF EXISTS public.case_direct_cost_items CASCADE;
DROP TABLE IF EXISTS public.instrument_tray_cost_catalog CASCADE;
DROP TABLE IF EXISTS public.facility_cost_rate_schedules CASCADE;

