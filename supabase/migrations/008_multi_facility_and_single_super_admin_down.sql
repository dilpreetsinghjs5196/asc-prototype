-- ==============================================================================
-- ASCANALYST PLATFORM — DATABASE MIGRATION 008 (DOWN)
-- REVERT MULTI-FACILITY GOVERNANCE, SINGLE SUPER ADMIN & SECURE RPCs
-- ==============================================================================

BEGIN;

-- 1. Drop Triggers and Functions
DROP TRIGGER IF EXISTS trg_enforce_single_super_admin ON public.facility_memberships;
DROP FUNCTION IF EXISTS public.fn_enforce_single_super_admin();

DROP TRIGGER IF EXISTS trg_protect_super_admin_delete ON public.facility_memberships;
DROP FUNCTION IF EXISTS public.fn_protect_super_admin_delete();

DROP TRIGGER IF EXISTS trg_sync_facility_designated_admin ON public.facilities;
DROP FUNCTION IF EXISTS public.fn_sync_facility_designated_admin();

DROP FUNCTION IF EXISTS public.fn_admin_create_facility(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID, JSONB);
DROP FUNCTION IF EXISTS public.fn_admin_update_facility(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID, TEXT, BOOLEAN, JSONB);
DROP FUNCTION IF EXISTS public.fn_admin_reassign_user_facility(UUID, UUID, UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.fn_admin_toggle_user_active(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS public.fn_replace_super_admin(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.is_facility_accessible(UUID);

-- 2. Drop Indexes
DROP INDEX IF EXISTS public.idx_facilities_status;
DROP INDEX IF EXISTS public.idx_facilities_is_active;
DROP INDEX IF EXISTS public.idx_facilities_designated_admin;

-- 3. Drop Columns
ALTER TABLE public.facilities 
    DROP COLUMN IF EXISTS status,
    DROP COLUMN IF EXISTS is_active,
    DROP COLUMN IF EXISTS designated_admin_id;

-- 4. Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
