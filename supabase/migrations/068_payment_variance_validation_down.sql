-- ==============================================================================
-- ROLLBACK MIGRATION: 068_payment_variance_validation_down.sql
-- PHASE: 93A — Payment Variance Validation (Revenue Cycle Management)
-- DESCRIPTION: Clean teardown of all Phase 93A views, policies, and tables.
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Drop Analytical Views
DROP VIEW IF EXISTS public.vw_payment_variance_validation_summary CASCADE;
DROP VIEW IF EXISTS public.vw_payment_variances_active CASCADE;

-- 2. Drop RLS Policies
DROP POLICY IF EXISTS payment_variance_rule_evaluations_facility_isolation ON public.payment_variance_rule_evaluations;
DROP POLICY IF EXISTS payment_variance_lines_facility_isolation ON public.payment_variance_lines;
DROP POLICY IF EXISTS payment_variances_facility_isolation ON public.payment_variances;

-- 3. Drop Tables in Reverse Dependency Order
DROP TABLE IF EXISTS public.payment_variance_rule_evaluations CASCADE;
DROP TABLE IF EXISTS public.payment_variance_lines CASCADE;
DROP TABLE IF EXISTS public.payment_variances CASCADE;
