-- =====================================================================
-- Migration: 044_expected_reimbursement_engine_down.sql
-- Description: Revert Phase 68 — Expected Reimbursement Engine
-- =====================================================================

BEGIN;

-- 1. Drop Triggers
DROP TRIGGER IF EXISTS trg_reimb_calc_immutable ON public.reimbursement_calculations;
DROP TRIGGER IF EXISTS trg_reimb_calc_lines_immutable ON public.reimbursement_calculation_lines;
DROP FUNCTION IF EXISTS public.trg_block_reimbursement_mutation();

-- 2. Drop Stored Procedures
DROP FUNCTION IF EXISTS public.fn_verify_reimbursement_calculation_integrity(UUID);
DROP FUNCTION IF EXISTS public.fn_calculate_expected_reimbursement(BIGINT, UUID, DATE, UUID, BOOLEAN, TEXT, NUMERIC, NUMERIC, NUMERIC);
DROP FUNCTION IF EXISTS public.fn_calculate_expected_reimbursement(TEXT, UUID, BOOLEAN);

-- 3. Drop Policies
DROP POLICY IF EXISTS reimb_calc_select_policy ON public.reimbursement_calculations;
DROP POLICY IF EXISTS reimb_calc_insert_policy ON public.reimbursement_calculations;
DROP POLICY IF EXISTS reimb_calc_lines_select_policy ON public.reimbursement_calculation_lines;
DROP POLICY IF EXISTS reimb_calc_lines_insert_policy ON public.reimbursement_calculation_lines;
DROP POLICY IF EXISTS reimb_calc_adj_select_policy ON public.reimbursement_calculation_adjustments;
DROP POLICY IF EXISTS reimb_calc_adj_insert_policy ON public.reimbursement_calculation_adjustments;

-- 4. Drop Tables (in reverse dependency order)
DROP TABLE IF EXISTS public.reimbursement_calculation_adjustments CASCADE;
DROP TABLE IF EXISTS public.reimbursement_calculation_lines CASCADE;
DROP TABLE IF EXISTS public.reimbursement_calculations CASCADE;

COMMIT;
