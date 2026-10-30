-- ==============================================================================
-- MIGRATION 041 DOWN: REVERT PAYER MASTER & PAYER PLAN MASTER SUBSYSTEM
-- ==============================================================================

BEGIN;

DROP TRIGGER IF EXISTS trg_block_payer_master_delete ON public.payer_master;
DROP FUNCTION IF EXISTS public.fn_block_payer_master_delete();

DROP TRIGGER IF EXISTS trg_block_payer_audit_modification ON public.payer_audit_logs;
DROP FUNCTION IF EXISTS public.fn_block_payer_audit_modification();

DROP FUNCTION IF EXISTS public.fn_resolve_edi_payer_id(UUID, UUID, VARCHAR, VARCHAR);

DROP TABLE IF EXISTS public.payer_audit_logs CASCADE;
DROP TABLE IF EXISTS public.payer_import_staging CASCADE;
DROP TABLE IF EXISTS public.payer_import_batches CASCADE;
DROP TABLE IF EXISTS public.payer_contract_versions CASCADE;
DROP TABLE IF EXISTS public.payer_contracts CASCADE;
DROP TABLE IF EXISTS public.patient_insurance_coverages CASCADE;
DROP TABLE IF EXISTS public.facility_payer_plans CASCADE;
DROP TABLE IF EXISTS public.facility_payers CASCADE;
DROP TABLE IF EXISTS public.payer_identifiers CASCADE;
DROP TABLE IF EXISTS public.payer_plans CASCADE;
DROP TABLE IF EXISTS public.payer_master CASCADE;

COMMIT;

