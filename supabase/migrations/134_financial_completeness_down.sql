-- ==============================================================================
-- Migration: 134_financial_completeness_down.sql
-- Module 16: Enterprise Data Quality Governance (Phase G2)
-- Description: Rollback script for Phase G2 Financial Completeness.
-- ==============================================================================

DROP VIEW IF EXISTS public.vw_financial_completeness_telemetry CASCADE;

DROP TABLE IF EXISTS public.fin_completeness_provenance_ledger CASCADE;
DROP TABLE IF EXISTS public.fin_trust_gate_audit_runs CASCADE;
DROP TABLE IF EXISTS public.fin_completeness_exceptions CASCADE;
DROP TABLE IF EXISTS public.fin_case_margin_readiness CASCADE;
DROP TABLE IF EXISTS public.fin_period_trust_assessments CASCADE;
DROP TABLE IF EXISTS public.fin_completeness_pillars CASCADE;
DROP TABLE IF EXISTS public.fin_completeness_configs CASCADE;
