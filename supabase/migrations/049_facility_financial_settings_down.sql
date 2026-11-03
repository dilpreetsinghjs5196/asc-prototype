-- ==============================================================================
-- ROLLBACK MIGRATION: 049_facility_financial_settings_down.sql
-- PHASE: 73 — Facility Financial Settings & Cost Assumptions Governance
-- ==============================================================================

SET search_path = public, pg_temp;

DROP VIEW IF EXISTS public.vw_active_facility_financial_settings CASCADE;
DROP TABLE IF EXISTS public.facility_role_wage_rates CASCADE;
DROP TABLE IF EXISTS public.facility_financial_settings CASCADE;

