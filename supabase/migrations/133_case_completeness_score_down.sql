-- ==============================================================================
-- Migration: 133_case_completeness_score_down.sql
-- Module 16: Enterprise Data Quality Governance (Phase G1)
-- Description: Rollback script for Phase G1 Case Completeness Score.
-- ==============================================================================

DROP VIEW IF EXISTS public.vw_case_completeness_telemetry CASCADE;

DROP TABLE IF EXISTS public.case_completeness_provenance_ledger CASCADE;
DROP TABLE IF EXISTS public.case_completeness_audit_runs CASCADE;
DROP TABLE IF EXISTS public.case_completeness_specialty_benchmarks CASCADE;
DROP TABLE IF EXISTS public.case_completeness_field_gaps CASCADE;
DROP TABLE IF EXISTS public.case_completeness_scores CASCADE;
DROP TABLE IF EXISTS public.case_completeness_rubrics CASCADE;
DROP TABLE IF EXISTS public.case_completeness_configs CASCADE;
