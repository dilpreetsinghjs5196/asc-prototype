-- ==============================================================================
-- MIGRATION 016 DOWN: REVERSAL OF DATA MIGRATION FROM SURGERIES
-- ==============================================================================

BEGIN;

-- 1. Drop backward compatibility view
DROP VIEW IF EXISTS public.v_legacy_surgeries_compat;

-- 2. Drop child tenancy triggers
DROP TRIGGER IF EXISTS trg_validate_surgery_procedures_tenancy ON public.surgery_procedures;
DROP TRIGGER IF EXISTS trg_validate_case_milestones_tenancy ON public.case_milestones;
DROP TRIGGER IF EXISTS trg_validate_case_staff_assignments_tenancy ON public.case_staff_assignments;
DROP FUNCTION IF EXISTS public.fn_validate_case_child_tenancy();

-- 3. Drop operating room foreign key constraint
ALTER TABLE public.surgeries
    DROP CONSTRAINT IF EXISTS fk_surgeries_operating_room;

-- 4. Delete migration baseline financial snapshots
DELETE FROM public.surgery_financial_snapshots
WHERE snapshot_type = 'MIGRATION_BASELINE_FREEZE';

-- 5. Delete migration perioperative milestones
DELETE FROM public.case_milestones
WHERE notes = 'Historical migration baseline milestone';

-- 6. Delete Case 254 extracted staff assignments
DELETE FROM public.case_staff_assignments
WHERE surgery_id = 254;

-- 7. Drop unique indexes
DROP INDEX IF EXISTS public.uq_facility_source_case;
DROP INDEX IF EXISTS public.uq_surgeries_case_uuid;

-- 8. Restore quarantined AI prototype cases to Scheduled
UPDATE public.surgeries
SET status = 'Scheduled',
    source_system = 'MANUAL',
    source_case_id = NULL
WHERE id IN (244, 253, 257, 258);

COMMIT;
