-- =====================================================================
-- Migration: 043_payer_contract_rate_rules_down.sql
-- Description: Reversible Rollback for Phase 67 Rate Rules & Exhibits
-- =====================================================================

BEGIN;

-- Drop Triggers
DROP TRIGGER IF EXISTS trg_lock_cpt_rates ON public.payer_contract_cpt_rates;
DROP TRIGGER IF EXISTS trg_lock_case_rates ON public.payer_contract_case_rates;
DROP TRIGGER IF EXISTS trg_lock_carve_outs ON public.payer_contract_carve_outs;
DROP FUNCTION IF EXISTS public.trg_lock_contract_rates_on_approval();

-- Drop Stored Procedures
DROP FUNCTION IF EXISTS public.fn_commit_rate_schedule_version;
DROP FUNCTION IF EXISTS public.fn_stage_rate_schedule_import;
DROP FUNCTION IF EXISTS public.fn_calculate_commercial_reimbursement;
DROP FUNCTION IF EXISTS public.fn_resolve_contract_rate;

-- Drop Tables in reverse dependency order
DROP TABLE IF EXISTS public.payer_contract_rate_import_staging CASCADE;
DROP TABLE IF EXISTS public.payer_contract_rate_import_batches CASCADE;
DROP TABLE IF EXISTS public.payer_contract_rate_calculation_lines CASCADE;
DROP TABLE IF EXISTS public.payer_contract_rate_calculations CASCADE;
DROP TABLE IF EXISTS public.payer_contract_rate_exceptions CASCADE;
DROP TABLE IF EXISTS public.payer_contract_carve_outs CASCADE;
DROP TABLE IF EXISTS public.payer_contract_case_rate_inclusions CASCADE;
DROP TABLE IF EXISTS public.payer_contract_case_rates CASCADE;
DROP TABLE IF EXISTS public.payer_contract_cpt_rates CASCADE;
DROP TABLE IF EXISTS public.payer_contract_rate_schedules CASCADE;

COMMIT;

