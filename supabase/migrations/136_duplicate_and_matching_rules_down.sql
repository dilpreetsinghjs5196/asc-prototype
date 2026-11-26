-- ==============================================================================
-- Rollback Migration: 136_duplicate_and_matching_rules_down.sql
-- Module 16: Enterprise Data Quality Governance (Phase G4)
-- Description: Cleanly tears down Phase G4 Duplicate & Matching telemetry view,
--              indexes, and tables in reverse foreign-key dependency order.
-- ==============================================================================

DROP VIEW IF EXISTS public.vw_dmr_telemetry;

DROP TABLE IF EXISTS public.dmr_match_runs CASCADE;
DROP TABLE IF EXISTS public.dmr_merge_history CASCADE;
DROP TABLE IF EXISTS public.dmr_candidate_pairs CASCADE;
DROP TABLE IF EXISTS public.dmr_golden_records CASCADE;
DROP TABLE IF EXISTS public.dmr_survivorship_policies CASCADE;
DROP TABLE IF EXISTS public.dmr_matching_rules CASCADE;
DROP TABLE IF EXISTS public.dmr_configs CASCADE;
