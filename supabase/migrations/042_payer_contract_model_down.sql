-- ==============================================================================
-- Migration Rollback: 042_payer_contract_model_down.sql
-- Description: Reverses Phase 66 Payer Contract Model & Schema Extensions
-- ==============================================================================

BEGIN;

-- 1. Drop trigger & stored procedures
DROP TRIGGER IF EXISTS trg_block_approved_contract_version_modification ON public.payer_contract_versions;
DROP FUNCTION IF EXISTS public.fn_block_approved_contract_version_modification();
DROP FUNCTION IF EXISTS public.fn_resolve_payer_contract(UUID, UUID, UUID, DATE, VARCHAR);

-- 2. Drop new normalized tables in reverse dependency order
DROP TABLE IF EXISTS public.payer_contract_audit_logs CASCADE;
DROP TABLE IF EXISTS public.payer_contract_approvals CASCADE;
DROP TABLE IF EXISTS public.payer_contract_amendments CASCADE;
DROP TABLE IF EXISTS public.payer_contract_documents CASCADE;
DROP TABLE IF EXISTS public.payer_contract_terms CASCADE;
DROP TABLE IF EXISTS public.payer_contract_service_scopes CASCADE;
DROP TABLE IF EXISTS public.payer_contract_plan_scopes CASCADE;
DROP TABLE IF EXISTS public.payer_contract_facility_scopes CASCADE;

-- 3. Revert columns on public.payer_contract_versions
ALTER TABLE public.payer_contract_versions
    DROP COLUMN IF EXISTS reimbursement_methodology,
    DROP COLUMN IF EXISTS billed_charge_discount_pct,
    DROP COLUMN IF EXISTS device_carve_out_mode,
    DROP COLUMN IF EXISTS is_locked,
    DROP COLUMN IF EXISTS version_hash,
    DROP COLUMN IF EXISTS change_summary,
    DROP COLUMN IF EXISTS approved_by,
    DROP COLUMN IF EXISTS approved_at,
    DROP COLUMN IF EXISTS status;

-- 4. Revert columns on public.payer_contracts
ALTER TABLE public.payer_contracts
    DROP COLUMN IF EXISTS organization_id,
    DROP COLUMN IF EXISTS contract_type,
    DROP COLUMN IF EXISTS scope_mode,
    DROP COLUMN IF EXISTS execution_date,
    DROP COLUMN IF EXISTS initial_effective_date,
    DROP COLUMN IF EXISTS current_expiration_date,
    DROP COLUMN IF EXISTS auto_renew,
    DROP COLUMN IF EXISTS renewal_notice_days,
    DROP COLUMN IF EXISTS governing_jurisdiction,
    DROP COLUMN IF EXISTS created_by;

COMMIT;

