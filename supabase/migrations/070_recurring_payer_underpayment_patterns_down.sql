-- ==============================================================================
-- DOWN MIGRATION: 070_recurring_payer_underpayment_patterns_down.sql
-- PHASE: 93C — Recurring Payer Underpayment Patterns (Revenue Cycle Management)
-- DESCRIPTION: Clean teardown of recurring patterns, pattern claims,
--              batch recovery opportunities, analytical views, and RLS policies.
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Drop Analytical Views
DROP VIEW IF EXISTS public.vw_payer_patterns_summary CASCADE;
DROP VIEW IF EXISTS public.vw_payer_patterns_active CASCADE;

-- 2. Drop Row Level Security Policies
DROP POLICY IF EXISTS batch_recovery_opportunities_isolation ON public.batch_recovery_opportunities;
DROP POLICY IF EXISTS payer_pattern_claims_isolation ON public.payer_underpayment_pattern_claims;
DROP POLICY IF EXISTS payer_underpayment_patterns_isolation ON public.payer_underpayment_patterns;

-- 3. Drop Core Tables in Reverse Dependency Order
DROP TABLE IF EXISTS public.batch_recovery_opportunities CASCADE;
DROP TABLE IF EXISTS public.payer_underpayment_pattern_claims CASCADE;
DROP TABLE IF EXISTS public.payer_underpayment_patterns CASCADE;
