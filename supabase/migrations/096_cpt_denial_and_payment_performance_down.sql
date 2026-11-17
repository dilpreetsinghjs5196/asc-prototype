-- ==============================================================================
-- Migration Rollback: 096_cpt_denial_and_payment_performance_down.sql
-- Phase B7: CPT Denial Patterns, Payment Speed, Underpayment, and Payer Variation
-- Module: Module 11: Surgeon & Clinical Intelligence / Executive Intelligence
-- Description: Clean idempotent rollback for Phase B7 tables, views, and policies.
-- ==============================================================================

-- 1. Drop RLS Policies
DROP POLICY IF EXISTS rls_cpt_payer_payment_velocity_facility ON public.cpt_payer_payment_velocity;
DROP POLICY IF EXISTS rls_cpt_carc_denial_reasons_facility ON public.cpt_carc_denial_reasons;
DROP POLICY IF EXISTS rls_cpt_denial_payment_metrics_facility ON public.cpt_denial_payment_metrics;

-- 2. Drop Views
DROP VIEW IF EXISTS public.vw_cpt_underpayment_leakage_radar CASCADE;
DROP VIEW IF EXISTS public.vw_cpt_denial_velocity_summary CASCADE;

-- 3. Drop Indexes
DROP INDEX IF EXISTS public.idx_cpt_payer_velocity_code;
DROP INDEX IF EXISTS public.idx_cpt_carc_code;
DROP INDEX IF EXISTS public.idx_cpt_denial_specialty;
DROP INDEX IF EXISTS public.idx_cpt_denial_tier;
DROP INDEX IF EXISTS public.idx_cpt_denial_code;
DROP INDEX IF EXISTS public.idx_cpt_denial_facility;

-- 4. Drop Tables
DROP TABLE IF EXISTS public.cpt_payer_payment_velocity CASCADE;
DROP TABLE IF EXISTS public.cpt_carc_denial_reasons CASCADE;
DROP TABLE IF EXISTS public.cpt_denial_payment_metrics CASCADE;
