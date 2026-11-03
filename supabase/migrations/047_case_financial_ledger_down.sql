-- ==============================================================================
-- ROLLBACK MIGRATION: 047_case_financial_ledger_down.sql
-- PHASE: 71 — Case Financial Ledger & Contribution Margin Engine
-- ==============================================================================

SET search_path = public, pg_temp;

DROP VIEW IF EXISTS public.vw_case_financial_summaries CASCADE;
DROP TRIGGER IF EXISTS trg_case_ledger_immutability ON public.case_financial_ledger_entries CASCADE;
DROP FUNCTION IF EXISTS public.fn_enforce_case_ledger_immutability() CASCADE;
DROP TABLE IF EXISTS public.case_financial_ledger_entries CASCADE;

