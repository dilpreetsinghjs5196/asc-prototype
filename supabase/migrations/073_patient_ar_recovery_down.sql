-- ==============================================================================
-- DOWN MIGRATION: 073_patient_ar_recovery_down.sql
-- PHASE: 96 — Patient AR Recovery (Revenue Cycle Management)
-- DESCRIPTION: Clean rollback dropping views, RLS policies, and tables.
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Drop Row Level Security Policies
DROP POLICY IF EXISTS patient_ar_recovery_cases_isolation ON public.patient_ar_recovery_cases;
DROP POLICY IF EXISTS patient_payment_plans_isolation ON public.patient_payment_plans;

-- 2. Drop Analytical Views
DROP VIEW IF EXISTS public.vw_patient_ar_summary CASCADE;
DROP VIEW IF EXISTS public.vw_patient_ar_active CASCADE;

-- 3. Drop Tables
DROP TABLE IF EXISTS public.patient_payment_plans CASCADE;
DROP TABLE IF EXISTS public.patient_ar_recovery_cases CASCADE;
