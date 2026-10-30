-- ==============================================================================
-- Migration: 040_multiple_procedure_payment_rules_down.sql
-- Description: Reversible rollback for Phase 64 Multiple Procedure Payment Rules
-- ==============================================================================

BEGIN;

-- 1. Drop Stored Procedures
DROP FUNCTION IF EXISTS public.fn_calculate_mppr_reimbursement(UUID, UUID, DATE, JSONB, BOOLEAN, BIGINT);
DROP FUNCTION IF EXISTS public.fn_resolve_mppr_rules(UUID, UUID, DATE);

-- 2. Drop Immutability Triggers and Functions
DROP TRIGGER IF EXISTS trg_block_mppr_lines_modification ON public.mppr_calculation_lines;
DROP TRIGGER IF EXISTS trg_block_mppr_snapshot_modification ON public.mppr_calculation_snapshots;
DROP FUNCTION IF EXISTS public.fn_block_mppr_snapshot_modification();

-- 3. Drop Tables in Reverse Dependency Order
DROP TABLE IF EXISTS public.mppr_calculation_lines CASCADE;
DROP TABLE IF EXISTS public.mppr_calculation_snapshots CASCADE;
DROP TABLE IF EXISTS public.cms_endoscopy_families CASCADE;
DROP TABLE IF EXISTS public.multiple_procedure_rules CASCADE;
DROP TABLE IF EXISTS public.multiple_procedure_rule_sets CASCADE;

COMMIT;
