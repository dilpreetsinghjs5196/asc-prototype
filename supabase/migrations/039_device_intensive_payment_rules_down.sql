-- ==============================================================================
-- Migration: 039_device_intensive_payment_rules_down.sql
-- Description: Reversible rollback for Phase 63 Device-Intensive Payment Rules
-- ==============================================================================

BEGIN;

-- 1. Drop Immutability Trigger & Function
DROP TRIGGER IF EXISTS trg_block_device_ledger_modification ON public.medicare_device_calculation_ledgers;
DROP FUNCTION IF EXISTS public.fn_block_device_ledger_modification();

-- 2. Drop Reconcile and Offset Resolution Functions
DROP FUNCTION IF EXISTS public.fn_reconcile_device_margin(BIGINT);
DROP FUNCTION IF EXISTS public.fn_scrub_claim_lines(BIGINT);
DROP FUNCTION IF EXISTS public.fn_resolve_device_intensive_offset(VARCHAR, DATE);

-- 3. Drop Tables in Reverse Dependency Order
DROP TABLE IF EXISTS public.medicare_device_calculation_ledgers CASCADE;
DROP TABLE IF EXISTS public.cpt_device_category_crosswalk CASCADE;
DROP TABLE IF EXISTS public.cms_device_intensive_procedures CASCADE;
DROP TABLE IF EXISTS public.cms_device_categories CASCADE;

COMMIT;

