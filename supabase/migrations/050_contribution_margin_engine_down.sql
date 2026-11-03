-- ==============================================================================
-- ROLLBACK MIGRATION: 050_contribution_margin_engine_down.sql
-- PHASE: 74 — Contribution Margin Engine & Deterministic Profitability Analytics
-- ==============================================================================

SET search_path = public, pg_temp;

DROP VIEW IF EXISTS public.vw_case_profitability_matrix CASCADE;
DROP TABLE IF EXISTS public.case_contribution_margin_snapshots CASCADE;

