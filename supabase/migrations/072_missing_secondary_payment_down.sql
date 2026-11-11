-- ==============================================================================
-- DOWN MIGRATION: 072_missing_secondary_payment_down.sql
-- PHASE: 95 — Missing Secondary Payment (Revenue Cycle Management)
-- DESCRIPTION: Clean rollback dropping views, RLS policies, and tables.
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Drop Row Level Security Policies
DROP POLICY IF EXISTS missing_secondary_payments_isolation ON public.missing_secondary_payments;
DROP POLICY IF EXISTS secondary_cob_rules_isolation ON public.secondary_cob_rules;

-- 2. Drop Analytical Views
DROP VIEW IF EXISTS public.vw_missing_secondary_summary CASCADE;
DROP VIEW IF EXISTS public.vw_missing_secondary_active CASCADE;

-- 3. Drop Tables
DROP TABLE IF EXISTS public.secondary_cob_rules CASCADE;
DROP TABLE IF EXISTS public.missing_secondary_payments CASCADE;
