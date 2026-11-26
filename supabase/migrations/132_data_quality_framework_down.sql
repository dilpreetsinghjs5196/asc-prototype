-- ==============================================================================
-- Migration: 132_data_quality_framework_down.sql
-- Module 16: Enterprise Data Quality Governance (Phase G0)
-- Description: Rollback script for Phase G0 Data Quality Framework.
-- ==============================================================================

-- Drop Telemetry View
DROP VIEW IF EXISTS public.vw_data_quality_telemetry CASCADE;

-- Drop Tables in reverse dependency order
DROP TABLE IF EXISTS public.dq_provenance_ledger CASCADE;
DROP TABLE IF EXISTS public.dq_exception_logs CASCADE;
DROP TABLE IF EXISTS public.dq_domain_scores CASCADE;
DROP TABLE IF EXISTS public.dq_assessment_runs CASCADE;
DROP TABLE IF EXISTS public.dq_rule_definitions CASCADE;
DROP TABLE IF EXISTS public.dq_dimension_weights CASCADE;
DROP TABLE IF EXISTS public.dq_framework_configs CASCADE;
