-- ==============================================================================
-- ROLLBACK MIGRATION: 046_financial_data_dictionary_down.sql
-- PHASE: 70 — Financial Data Dictionary
-- ==============================================================================

SET search_path = public, pg_temp;

DROP FUNCTION IF EXISTS public.fn_get_financial_metric_definition(VARCHAR);
DROP TABLE IF EXISTS public.case_financial_reconciliations CASCADE;
DROP TABLE IF EXISTS public.financial_formula_registry CASCADE;
DROP TABLE IF EXISTS public.financial_metric_definitions CASCADE;
