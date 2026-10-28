-- ==============================================================================
-- DOWN MIGRATION: 031_facility_vendor_contracts_down.sql
-- DESCRIPTION: Safely roll back Phase 56 Facility Vendor Contracts.
-- PLATFORM: Supabase PostgreSQL 15+
-- ==============================================================================

BEGIN;

-- 1. Drop Stored Procedures
DROP FUNCTION IF EXISTS public.fn_validate_contract_eligibility(UUID, UUID, UUID, UUID, DATE);
DROP FUNCTION IF EXISTS public.fn_create_contract_amendment(UUID, TEXT);
DROP FUNCTION IF EXISTS public.fn_review_facility_vendor_contract(UUID, VARCHAR, TEXT);
DROP FUNCTION IF EXISTS public.fn_upsert_facility_vendor_contract(UUID, UUID, UUID, VARCHAR, VARCHAR, VARCHAR, DATE, DATE, BOOLEAN, INTEGER, VARCHAR, INTEGER, NUMERIC, INTEGER, VARCHAR, VARCHAR, BOOLEAN, VARCHAR, NUMERIC, BOOLEAN, VARCHAR, NUMERIC, TEXT);

-- 2. Drop Foreign Key on case_devices if attached
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' AND constraint_name = 'fk_case_devices_contract_id'
    ) THEN
        ALTER TABLE public.case_devices DROP CONSTRAINT fk_case_devices_contract_id;
    END IF;
END $$;

-- 3. Drop Triggers & Trigger Functions
DROP TRIGGER IF EXISTS trg_audit_facility_vendor_contract_documents ON public.facility_vendor_contract_documents;
DROP TRIGGER IF EXISTS trg_audit_facility_vendor_contract_scopes ON public.facility_vendor_contract_scopes;
DROP TRIGGER IF EXISTS trg_audit_facility_vendor_contracts ON public.facility_vendor_contracts;

DROP TRIGGER IF EXISTS trg_enforce_contract_approval_separation ON public.facility_vendor_contracts;
DROP FUNCTION IF EXISTS public.fn_enforce_contract_approval_separation();

DROP TRIGGER IF EXISTS trg_prevent_facility_relocation_contracts ON public.facility_vendor_contracts;
DROP FUNCTION IF EXISTS public.fn_prevent_facility_relocation_contracts();

DROP TRIGGER IF EXISTS trg_prevent_active_contract_delete ON public.facility_vendor_contracts;
DROP FUNCTION IF EXISTS public.fn_prevent_active_contract_delete();

DROP TRIGGER IF EXISTS trg_touch_facility_vendor_contract_documents ON public.facility_vendor_contract_documents;
DROP TRIGGER IF EXISTS trg_touch_facility_vendor_contract_scopes ON public.facility_vendor_contract_scopes;
DROP TRIGGER IF EXISTS trg_touch_facility_vendor_contracts ON public.facility_vendor_contracts;

-- 4. Drop Tables in Reverse Dependency Order
DROP TABLE IF EXISTS public.facility_vendor_contract_documents CASCADE;
DROP TABLE IF EXISTS public.facility_vendor_contract_scopes CASCADE;
DROP TABLE IF EXISTS public.facility_vendor_contracts CASCADE;

COMMIT;
