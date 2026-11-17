-- ==============================================================================
-- Migration Rollback: 093_payer_contract_performance_down.sql
-- Phase B4: Payer Contract Performance Subsystem
-- Module: Module 11: Surgeon & Clinical Intelligence / Executive Intelligence
-- Description: Clean, idempotent drop of all views, policies, indexes, and tables
--              associated with Phase B4 Payer Contract Performance.
-- ==============================================================================

-- 1. Drop Analytical Views
DROP VIEW IF EXISTS public.vw_contract_renegotiation_pipeline CASCADE;
DROP VIEW IF EXISTS public.vw_payer_contract_performance_summary CASCADE;

-- 2. Drop RLS Policies
DROP POLICY IF EXISTS rls_payer_contract_cpt_yields_facility ON public.payer_contract_cpt_yields;
DROP POLICY IF EXISTS rls_payer_contract_performance_facility ON public.payer_contract_performance_metrics;

-- 3. Drop Indexes
DROP INDEX IF EXISTS public.idx_pccy_contract_perf;
DROP INDEX IF EXISTS public.idx_pcpm_status;
DROP INDEX IF EXISTS public.idx_pcpm_contract_number;
DROP INDEX IF EXISTS public.idx_pcpm_facility;

-- 4. Drop Tables (CASCADE removes foreign keys)
DROP TABLE IF EXISTS public.payer_contract_cpt_yields CASCADE;
DROP TABLE IF EXISTS public.payer_contract_performance_metrics CASCADE;
