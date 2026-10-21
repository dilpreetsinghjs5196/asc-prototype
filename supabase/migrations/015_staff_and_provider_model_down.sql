-- ==============================================================================
-- MIGRATION 015 ROLLBACK: STAFF AND PROVIDER MODEL, ANESTHESIA & CASE ASSIGNMENTS
-- ==============================================================================
-- Description: Reverts Migration 015 safely in reverse dependency order.
-- Platform: Supabase PostgreSQL 15+
-- ==============================================================================

BEGIN;

-- 1. Drop analytics views
DROP VIEW IF EXISTS public.v_case_labor_cost_summary CASCADE;

-- 2. Drop stored procedures and validation functions
DROP FUNCTION IF EXISTS public.fn_validate_case_staff_scheduling_conflict(
    BIGINT,
    UUID,
    DATE,
    TIME,
    TIME,
    TEXT,
    UUID
) CASCADE;

-- 3. Drop relational 1NF staffing tables in reverse dependency order
DROP TABLE IF EXISTS public.staff_time_off CASCADE;
DROP TABLE IF EXISTS public.staff_shifts CASCADE;
DROP TABLE IF EXISTS public.anesthesia_records CASCADE;
DROP TABLE IF EXISTS public.case_staff_assignments CASCADE;
DROP TABLE IF EXISTS public.staff_credentials CASCADE;
DROP TABLE IF EXISTS public.staff_facility_affiliations CASCADE;

-- 4. Revert added columns and constraints on public.staff
ALTER TABLE public.staff
    DROP CONSTRAINT IF EXISTS uq_staff_staff_uuid,
    DROP COLUMN IF EXISTS staff_uuid CASCADE,
    DROP COLUMN IF EXISTS user_id CASCADE,
    DROP COLUMN IF EXISTS credentials CASCADE,
    DROP COLUMN IF EXISTS staff_type CASCADE,
    DROP COLUMN IF EXISTS photo_url CASCADE,
    DROP COLUMN IF EXISTS deleted_at CASCADE,
    DROP COLUMN IF EXISTS record_version CASCADE;

-- 5. Drop added indexes if still lingering
DROP INDEX IF EXISTS public.idx_staff_staff_uuid;
DROP INDEX IF EXISTS public.idx_staff_user_id;
DROP INDEX IF EXISTS public.idx_staff_type;
DROP INDEX IF EXISTS public.idx_staff_active;

COMMIT;
