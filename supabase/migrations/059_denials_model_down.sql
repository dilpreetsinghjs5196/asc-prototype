-- ==============================================================================
-- ROLLBACK MIGRATION: 059_denials_model_down.sql
-- DESCRIPTION: Clean teardown of Phase 85 Denials tables, views, and policies in reverse dependency order.
-- ==============================================================================

SET search_path = public, pg_temp;

DROP VIEW IF EXISTS public.vw_rcm_denials_by_root_cause_kpi CASCADE;
DROP VIEW IF EXISTS public.vw_rcm_denials_aging_and_deadlines CASCADE;

DROP TABLE IF EXISTS public.rcm_denial_events CASCADE;
DROP TABLE IF EXISTS public.rcm_denials CASCADE;
