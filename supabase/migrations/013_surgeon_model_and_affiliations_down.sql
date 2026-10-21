-- ==============================================================================
-- MIGRATION 013 DOWN: REVERT SURGEON MODEL NORMALIZATION & AFFILIATIONS
-- ==============================================================================

BEGIN;

-- 1. Drop Views & Triggers
DROP VIEW IF EXISTS public.v_surgeon_performance_summary;
DROP TRIGGER IF EXISTS trg_audit_surgeon_affiliations ON public.surgeon_facility_affiliations;
DROP TRIGGER IF EXISTS trg_audit_surgeon_privileges ON public.surgeon_privileges;

-- 2. Drop Stored Procedures
DROP FUNCTION IF EXISTS public.fn_validate_surgeon_scheduling_conflict(UUID, BIGINT, UUID, DATE, TIME, INTEGER, BIGINT);

-- 3. Drop New Relational Tables
DROP TABLE IF EXISTS public.surgeon_time_off CASCADE;
DROP TABLE IF EXISTS public.case_surgeons CASCADE;
DROP TABLE IF EXISTS public.surgeon_privileges CASCADE;
DROP TABLE IF EXISTS public.surgeon_facility_affiliations CASCADE;

-- 4. Revert Columns on or_block_schedule
ALTER TABLE public.or_block_schedule
    DROP COLUMN IF EXISTS operating_room_id,
    DROP COLUMN IF EXISTS surgeon_id,
    DROP COLUMN IF EXISTS effective_start_date,
    DROP COLUMN IF EXISTS effective_end_date,
    DROP COLUMN IF EXISTS recurrence_pattern,
    DROP COLUMN IF EXISTS release_lead_days,
    DROP COLUMN IF EXISTS is_released,
    DROP COLUMN IF EXISTS released_at,
    DROP COLUMN IF EXISTS released_by;

-- 5. Revert Columns on surgeons
ALTER TABLE public.surgeons
    DROP CONSTRAINT IF EXISTS uq_surgeons_npi,
    DROP CONSTRAINT IF EXISTS chk_surgeons_npi_format,
    DROP CONSTRAINT IF EXISTS uq_surgeons_surgeon_uuid;

ALTER TABLE public.surgeons
    DROP COLUMN IF EXISTS surgeon_uuid,
    DROP COLUMN IF EXISTS user_id,
    DROP COLUMN IF EXISTS npi,
    DROP COLUMN IF EXISTS credentials,
    DROP COLUMN IF EXISTS subspecialties,
    DROP COLUMN IF EXISTS is_active,
    DROP COLUMN IF EXISTS deleted_at,
    DROP COLUMN IF EXISTS record_version;

-- Revert license number for Surgeon 21 if rolled back
UPDATE public.surgeons
SET license_number = 'MD-99014'
WHERE id = 21 AND license_number = 'MD-99021';

NOTIFY pgrst, 'reload schema';

COMMIT;
