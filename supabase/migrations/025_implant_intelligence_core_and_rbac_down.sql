-- ==============================================================================
-- MIGRATION 025 DOWN: ROLLBACK IMPLANT INTELLIGENCE CORE & RBAC
-- ==============================================================================

BEGIN;

-- 1. Drop Stored Procedure
DROP FUNCTION IF EXISTS public.fn_reconcile_case_device_totals(BIGINT);

-- 2. Drop Triggers
DROP TRIGGER IF EXISTS trg_prevent_facility_relocation_case_devices ON public.case_devices;
DROP TRIGGER IF EXISTS trg_audit_case_devices ON public.case_devices;

-- 3. Drop Indexes
DROP INDEX IF EXISTS public.idx_cd_invoice;
DROP INDEX IF EXISTS public.idx_cd_usage_status;
DROP INDEX IF EXISTS public.idx_cd_duration;
DROP INDEX IF EXISTS public.idx_cd_hcpcs_c_code;

-- 4. Drop Added Columns from case_devices
ALTER TABLE public.case_devices
    DROP COLUMN IF EXISTS contract_id,
    DROP COLUMN IF EXISTS vendor_id,
    DROP COLUMN IF EXISTS sku_id,
    DROP COLUMN IF EXISTS cost_hierarchy_tier,
    DROP COLUMN IF EXISTS usage_status,
    DROP COLUMN IF EXISTS duration_classification,
    DROP COLUMN IF EXISTS udi,
    DROP COLUMN IF EXISTS expiration_date,
    DROP COLUMN IF EXISTS invoice_line_cost,
    DROP COLUMN IF EXISTS invoice_number,
    DROP COLUMN IF EXISTS total_charge,
    DROP COLUMN IF EXISTS total_cost,
    DROP COLUMN IF EXISTS hcpcs_c_code;

-- 5. Clean seeded role_permissions and permissions
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'role_permissions') THEN
        DELETE FROM public.role_permissions
        WHERE permission_id IN (
            SELECT id FROM public.permissions WHERE code LIKE 'implants.%'
        );
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'permissions') THEN
        DELETE FROM public.permissions
        WHERE code LIKE 'implants.%';
    END IF;
END $$;

COMMIT;
