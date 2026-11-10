-- ==============================================================================
-- DOWN MIGRATION: 071_denial_recovery_prioritization_down.sql
-- PHASE: 94 — Denial Recovery Prioritization (Revenue Cycle Management)
-- DESCRIPTION: Clean rollback dropping views, RLS policies, and priority tables.
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Drop Row Level Security Policies
DROP POLICY IF EXISTS denial_recovery_priorities_isolation ON public.denial_recovery_priorities;
DROP POLICY IF EXISTS denial_prioritization_rules_isolation ON public.denial_prioritization_rules;

-- 2. Drop Analytical Views
DROP VIEW IF EXISTS public.vw_denial_recovery_priorities_summary CASCADE;
DROP VIEW IF EXISTS public.vw_denial_recovery_priorities_active CASCADE;

-- 3. Drop Prioritization Tables
DROP TABLE IF EXISTS public.denial_prioritization_rules CASCADE;
DROP TABLE IF EXISTS public.denial_recovery_priorities CASCADE;
