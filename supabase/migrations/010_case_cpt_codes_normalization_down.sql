-- ==============================================================================
-- ROLLBACK SCRIPT: MIGRATION 010 (CASE CPT CODES NORMALIZATION)
-- ==============================================================================

BEGIN;

-- Drop RLS policies
DROP POLICY IF EXISTS "Tenant Scoped Surgery Procedures Read" ON public.surgery_procedures;
DROP POLICY IF EXISTS "Tenant Scoped Surgery Procedures Write" ON public.surgery_procedures;

-- Recreate baseline policy
CREATE POLICY "Tenant Scoped Surgery Procedures Access"
ON public.surgery_procedures FOR ALL TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
)
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_director', 'biller', 'surgeon'])
);

-- Drop indexes
DROP INDEX IF EXISTS public.idx_surgery_proc_status;
DROP INDEX IF EXISTS public.idx_surgery_proc_fee_sched;
DROP INDEX IF EXISTS public.idx_surgery_proc_primary;

-- Drop constraints
ALTER TABLE public.surgery_procedures DROP CONSTRAINT IF EXISTS chk_surgery_proc_units;
ALTER TABLE public.surgery_procedures DROP CONSTRAINT IF EXISTS chk_surgery_proc_laterality;
ALTER TABLE public.surgery_procedures DROP CONSTRAINT IF EXISTS chk_surgery_proc_coding_status;

-- Drop columns
ALTER TABLE public.surgery_procedures
    DROP COLUMN IF EXISTS units,
    DROP COLUMN IF EXISTS modifiers,
    DROP COLUMN IF EXISTS laterality,
    DROP COLUMN IF EXISTS is_primary,
    DROP COLUMN IF EXISTS procedure_description,
    DROP COLUMN IF EXISTS coding_status,
    DROP COLUMN IF EXISTS source_system,
    DROP COLUMN IF EXISTS source_line_id,
    DROP COLUMN IF EXISTS fee_schedule_id,
    DROP COLUMN IF EXISTS line_gross_charge,
    DROP COLUMN IF EXISTS line_expected_reimbursement,
    DROP COLUMN IF EXISTS coded_by,
    DROP COLUMN IF EXISTS coded_at,
    DROP COLUMN IF EXISTS verified_by,
    DROP COLUMN IF EXISTS verified_at,
    DROP COLUMN IF EXISTS version;

NOTIFY pgrst, 'reload schema';

COMMIT;
