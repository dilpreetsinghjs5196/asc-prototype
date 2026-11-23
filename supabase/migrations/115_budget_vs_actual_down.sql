-- ==============================================================================
-- Migration 115 Down: Budget vs. Actual & Variance Reporting
-- Phase E1: Module 14 CFO Dashboard & Financial Accounting
-- ==============================================================================

DROP VIEW IF EXISTS public.vw_budget_vs_actual_telemetry CASCADE;

DROP POLICY IF EXISTS tenant_isolation_bva_analyses ON public.budget_variance_analyses;
DROP POLICY IF EXISTS tenant_isolation_budget_lines ON public.budget_line_items;
DROP POLICY IF EXISTS tenant_isolation_budgets ON public.facility_budgets;

DROP TABLE IF EXISTS public.budget_variance_analyses CASCADE;
DROP TABLE IF EXISTS public.budget_line_items CASCADE;
DROP TABLE IF EXISTS public.facility_budgets CASCADE;
