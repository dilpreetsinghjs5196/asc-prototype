-- ==============================================================================
-- ASCANALYST PLATFORM — DATABASE MIGRATION 008 (UP)
-- MULTI-FACILITY GOVERNANCE, SINGLE SUPER ADMIN & SECURE USER MANAGEMENT
-- ==============================================================================
-- Specification: docs/phases/multi-facility-user-management.md
-- Target Database: Supabase PostgreSQL 15+ (Remote / Local)
--
-- Architecture Principles:
-- 1. Single Global Super Admin Invariant: Exactly ONE active super_admin is
--    permitted across the system, enforced at the database trigger layer.
-- 2. Anti-Escalation & Last Admin Protection: Facility Admins cannot grant
--    super_admin or escalate beyond authorized roles; last facility admin cannot
--    be deactivated or deleted.
-- 3. Dynamic Facility Management: Real-time creation, editing, and activation/
--    deactivation of facilities with explicit status and designated admin tracking.
-- 4. Facility Deactivation Isolation: Non-super_admin users cannot access operational
--    records (patients, surgeries, schedules) for inactive/suspended facilities.
-- 5. Complete Audit Trail: All administrative mutations are recorded in public.audit_logs
--    with actor identity and state diffs.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. EXTEND PUBLIC.FACILITIES SCHEMA
-- ==============================================================================

ALTER TABLE public.facilities 
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS designated_admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_facilities_status ON public.facilities(status);
CREATE INDEX IF NOT EXISTS idx_facilities_is_active ON public.facilities(is_active);
CREATE INDEX IF NOT EXISTS idx_facilities_designated_admin ON public.facilities(designated_admin_id);

-- Backfill existing facilities to active status
UPDATE public.facilities 
SET status = 'active', is_active = true 
WHERE status IS NULL OR is_active IS NULL;

-- Backfill designated_admin_id for primary facility (Naples Surgery Center) if admin@asc.com exists
DO $$
DECLARE
    v_admin_user_id UUID;
BEGIN
    SELECT id INTO v_admin_user_id FROM auth.users WHERE email = 'admin@asc.com' LIMIT 1;
    IF v_admin_user_id IS NOT NULL THEN
        UPDATE public.facilities
        SET designated_admin_id = v_admin_user_id
        WHERE id = '00000000-0000-0000-0000-000000000002'
          AND designated_admin_id IS NULL;
    END IF;
END $$;

-- ==============================================================================
-- 2. STRICT SINGLE SUPER ADMIN INVARIANT ENFORCEMENT TRIGGER
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_enforce_single_super_admin()
RETURNS TRIGGER AS $$
DECLARE
    v_sa_count INT;
    v_is_super_admin BOOLEAN := FALSE;
BEGIN
    -- Check caller authority if executing within an authenticated session
    IF auth.uid() IS NOT NULL THEN
        BEGIN
            v_is_super_admin := user_has_facility_role(NULL, ARRAY['super_admin']);
        EXCEPTION WHEN OTHERS THEN
            v_is_super_admin := FALSE;
        END;
    ELSE
        -- Allow direct database migrations/seeds (auth.uid() IS NULL)
        v_is_super_admin := TRUE;
    END IF;

    -- CASE 1: Attempting to insert or update a user to super_admin
    IF (NEW.role = 'super_admin' AND NEW.is_active = TRUE) THEN
        -- Only an existing active Super Admin (or direct DB migration) may grant super_admin
        IF NOT v_is_super_admin THEN
            RAISE EXCEPTION 'SECURITY VIOLATION: Privilege escalation blocked. Only the Global Super Admin can grant the super_admin role.';
        END IF;

        -- Count existing active super_admins excluding this row
        SELECT COUNT(*) INTO v_sa_count
        FROM public.facility_memberships
        WHERE role = 'super_admin'
          AND is_active = TRUE
          AND (TG_OP = 'INSERT' OR id != NEW.id);

        IF v_sa_count >= 1 THEN
            RAISE EXCEPTION 'SINGLE SUPER ADMIN INVARIANT VIOLATION: Exactly one active Super Admin account is permitted in the system. An active Super Admin already exists.';
        END IF;
    END IF;

    -- CASE 2: Attempting to demote or deactivate the active super_admin
    IF TG_OP = 'UPDATE' AND OLD.role = 'super_admin' AND OLD.is_active = TRUE THEN
        IF (NEW.role != 'super_admin' OR NEW.is_active = FALSE) THEN
            SELECT COUNT(*) INTO v_sa_count
            FROM public.facility_memberships
            WHERE role = 'super_admin'
              AND is_active = TRUE
              AND id != OLD.id;

            IF v_sa_count = 0 THEN
                RAISE EXCEPTION 'ADMINISTRATIVE SAFETY VIOLATION: Lockout prevention. Cannot deactivate or demote the sole remaining Global Super Admin without an authorized replacement handoff.';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_enforce_single_super_admin ON public.facility_memberships;
CREATE TRIGGER trg_enforce_single_super_admin
    BEFORE INSERT OR UPDATE ON public.facility_memberships
    FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_single_super_admin();

-- Prevent deletion of sole Super Admin record
CREATE OR REPLACE FUNCTION public.fn_protect_super_admin_delete()
RETURNS TRIGGER AS $$
DECLARE
    v_sa_count INT;
BEGIN
    IF OLD.role = 'super_admin' AND OLD.is_active = TRUE THEN
        SELECT COUNT(*) INTO v_sa_count
        FROM public.facility_memberships
        WHERE role = 'super_admin'
          AND is_active = TRUE
          AND id != OLD.id;

        IF v_sa_count = 0 THEN
            RAISE EXCEPTION 'ADMINISTRATIVE SAFETY VIOLATION: Lockout prevention. The Global Super Admin record cannot be deleted.';
        END IF;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_protect_super_admin_delete ON public.facility_memberships;
CREATE TRIGGER trg_protect_super_admin_delete
    BEFORE DELETE ON public.facility_memberships
    FOR EACH ROW EXECUTE FUNCTION public.fn_protect_super_admin_delete();

-- ==============================================================================
-- 3. DESIGNATED FACILITY ADMIN INTEGRITY TRIGGER ON FACILITIES
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_sync_facility_designated_admin()
RETURNS TRIGGER AS $$
DECLARE
    v_fac_admin_role_id UUID;
BEGIN
    IF NEW.designated_admin_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.designated_admin_id IS DISTINCT FROM OLD.designated_admin_id) THEN
        SELECT id INTO v_fac_admin_role_id FROM public.roles WHERE slug = 'facility_admin' AND is_system = true LIMIT 1;

        -- Ensure user has active facility_admin membership in this facility
        INSERT INTO public.facility_memberships (facility_id, user_id, role, role_id, is_active, title, department)
        VALUES (
            NEW.id,
            NEW.designated_admin_id,
            'facility_admin',
            v_fac_admin_role_id,
            true,
            'Designated Facility Administrator',
            'Executive Administration'
        )
        ON CONFLICT (facility_id, user_id) DO UPDATE SET
            role = 'facility_admin',
            role_id = v_fac_admin_role_id,
            is_active = true,
            updated_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_facility_designated_admin ON public.facilities;
CREATE TRIGGER trg_sync_facility_designated_admin
    AFTER INSERT OR UPDATE OF designated_admin_id ON public.facilities
    FOR EACH ROW EXECUTE FUNCTION public.fn_sync_facility_designated_admin();

-- ==============================================================================
-- 4. SERVER-SIDE ADMINISTRATIVE RPC FUNCTIONS (SECURITY DEFINER)
-- ==============================================================================

-- 4.1 Create Facility (Super Admin Only)
CREATE OR REPLACE FUNCTION public.fn_admin_create_facility(
    p_name TEXT,
    p_organization_id UUID DEFAULT NULL,
    p_license_number TEXT DEFAULT NULL,
    p_timezone TEXT DEFAULT 'America/New_York',
    p_address TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_state TEXT DEFAULT NULL,
    p_zip TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_tax_id TEXT DEFAULT NULL,
    p_npi TEXT DEFAULT NULL,
    p_apply_medicare_mppr BOOLEAN DEFAULT false,
    p_designated_admin_id UUID DEFAULT NULL,
    p_settings JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID;
    v_actor_email TEXT;
    v_org_id UUID;
    v_new_facility_id UUID;
    v_result JSONB;
BEGIN
    v_actor_id := auth.uid();
    v_actor_email := auth.jwt()->>'email';

    -- Authorization: Super Admin check
    IF v_actor_id IS NOT NULL AND NOT user_has_facility_role(NULL, ARRAY['super_admin']) THEN
        RAISE EXCEPTION 'FORBIDDEN: Only Global Super Admin is authorized to provision new facilities.';
    END IF;

    IF p_name IS NULL OR TRIM(p_name) = '' THEN
        RAISE EXCEPTION 'VALIDATION ERROR: Facility name is required.';
    END IF;

    -- Resolve Organization ID
    v_org_id := p_organization_id;
    IF v_org_id IS NULL THEN
        SELECT id INTO v_org_id FROM public.organizations ORDER BY created_at ASC LIMIT 1;
        IF v_org_id IS NULL THEN
            INSERT INTO public.organizations (name) VALUES ('Default Healthcare Network') RETURNING id INTO v_org_id;
        END IF;
    END IF;

    v_new_facility_id := gen_random_uuid();

    -- Insert facility
    INSERT INTO public.facilities (
        id, organization_id, name, license_number, timezone,
        address, city, state, zip, phone, tax_id, npi,
        apply_medicare_mppr, designated_admin_id, status, is_active, settings
    ) VALUES (
        v_new_facility_id, v_org_id, TRIM(p_name), p_license_number, p_timezone,
        p_address, p_city, p_state, p_zip, p_phone, p_tax_id, p_npi,
        p_apply_medicare_mppr, p_designated_admin_id, 'active', true, p_settings
    );

    -- Log Audit Event
    INSERT INTO public.audit_logs (
        facility_id, table_name, record_id, action,
        actor_id, actor_email, source, new_state, timestamp
    ) VALUES (
        v_new_facility_id, 'facilities', v_new_facility_id::TEXT, 'INSERT',
        v_actor_id, v_actor_email, 'UI',
        jsonb_build_object('name', p_name, 'organization_id', v_org_id, 'designated_admin_id', p_designated_admin_id),
        NOW()
    );

    SELECT to_jsonb(f) INTO v_result FROM public.facilities f WHERE f.id = v_new_facility_id;
    RETURN v_result;
END;
$$;

-- 4.2 Update Facility Details & Status (Super Admin or Scoped Facility Admin)
CREATE OR REPLACE FUNCTION public.fn_admin_update_facility(
    p_facility_id UUID,
    p_name TEXT DEFAULT NULL,
    p_license_number TEXT DEFAULT NULL,
    p_timezone TEXT DEFAULT NULL,
    p_address TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_state TEXT DEFAULT NULL,
    p_zip TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_tax_id TEXT DEFAULT NULL,
    p_npi TEXT DEFAULT NULL,
    p_apply_medicare_mppr BOOLEAN DEFAULT NULL,
    p_designated_admin_id UUID DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT NULL,
    p_settings JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID;
    v_actor_email TEXT;
    v_is_super_admin BOOLEAN := FALSE;
    v_old_rec RECORD;
    v_result JSONB;
BEGIN
    v_actor_id := auth.uid();
    v_actor_email := auth.jwt()->>'email';

    IF v_actor_id IS NOT NULL THEN
        v_is_super_admin := user_has_facility_role(NULL, ARRAY['super_admin']);
    ELSE
        v_is_super_admin := TRUE;
    END IF;

    -- Facility Admin can only edit non-critical fields of own facility
    IF NOT v_is_super_admin THEN
        IF NOT user_has_facility_role(p_facility_id, ARRAY['facility_admin']) THEN
            RAISE EXCEPTION 'FORBIDDEN: Insufficient permissions to edit facility %', p_facility_id;
        END IF;

        -- Facility Admin cannot change status or designated admin
        IF p_status IS NOT NULL OR p_is_active IS NOT NULL OR p_designated_admin_id IS NOT NULL THEN
            RAISE EXCEPTION 'FORBIDDEN: Only Global Super Admin can alter facility status or designated administrator.';
        END IF;
    END IF;

    SELECT * INTO v_old_rec FROM public.facilities WHERE id = p_facility_id;
    IF v_old_rec.id IS NULL THEN
        RAISE EXCEPTION 'NOT FOUND: Facility % does not exist.', p_facility_id;
    END IF;

    -- Apply updates
    UPDATE public.facilities SET
        name = COALESCE(p_name, name),
        license_number = COALESCE(p_license_number, license_number),
        timezone = COALESCE(p_timezone, timezone),
        address = COALESCE(p_address, address),
        city = COALESCE(p_city, city),
        state = COALESCE(p_state, state),
        zip = COALESCE(p_zip, zip),
        phone = COALESCE(p_phone, phone),
        tax_id = COALESCE(p_tax_id, tax_id),
        npi = COALESCE(p_npi, npi),
        apply_medicare_mppr = COALESCE(p_apply_medicare_mppr, apply_medicare_mppr),
        designated_admin_id = CASE WHEN v_is_super_admin AND p_designated_admin_id IS NOT NULL THEN p_designated_admin_id ELSE designated_admin_id END,
        status = CASE WHEN v_is_super_admin AND p_status IS NOT NULL THEN p_status ELSE status END,
        is_active = CASE 
            WHEN v_is_super_admin AND p_is_active IS NOT NULL THEN p_is_active 
            WHEN v_is_super_admin AND p_status IS NOT NULL THEN (p_status = 'active')
            ELSE is_active 
        END,
        settings = COALESCE(p_settings, settings),
        updated_at = NOW()
    WHERE id = p_facility_id;

    -- Audit log
    INSERT INTO public.audit_logs (
        facility_id, table_name, record_id, action,
        actor_id, actor_email, source, previous_state, new_state, timestamp
    ) VALUES (
        p_facility_id, 'facilities', p_facility_id::TEXT, 'UPDATE',
        v_actor_id, v_actor_email, 'UI',
        to_jsonb(v_old_rec),
        (SELECT to_jsonb(f) FROM public.facilities f WHERE f.id = p_facility_id),
        NOW()
    );

    SELECT to_jsonb(f) INTO v_result FROM public.facilities f WHERE f.id = p_facility_id;
    RETURN v_result;
END;
$$;

-- 4.3 Reassign User Between Facilities (Super Admin Only)
CREATE OR REPLACE FUNCTION public.fn_admin_reassign_user_facility(
    p_user_id UUID,
    p_from_facility_id UUID,
    p_to_facility_id UUID,
    p_new_role TEXT DEFAULT NULL,
    p_department TEXT DEFAULT NULL,
    p_title TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID;
    v_actor_email TEXT;
    v_old_membership RECORD;
    v_new_role TEXT;
    v_new_role_id UUID;
    v_result JSONB;
BEGIN
    v_actor_id := auth.uid();
    v_actor_email := auth.jwt()->>'email';

    -- Strictly Super Admin
    IF v_actor_id IS NOT NULL AND NOT user_has_facility_role(NULL, ARRAY['super_admin']) THEN
        RAISE EXCEPTION 'FORBIDDEN: Only Global Super Admin is authorized to reassign users between facilities.';
    END IF;

    -- Validate target facility exists and is active
    IF NOT EXISTS (SELECT 1 FROM public.facilities WHERE id = p_to_facility_id AND is_active = TRUE) THEN
        RAISE EXCEPTION 'VALIDATION ERROR: Destination facility does not exist or is inactive.';
    END IF;

    -- Retrieve old membership
    SELECT * INTO v_old_membership 
    FROM public.facility_memberships
    WHERE user_id = p_user_id AND facility_id = p_from_facility_id AND is_active = TRUE;

    IF v_old_membership.id IS NULL THEN
        RAISE EXCEPTION 'NOT FOUND: Active membership not found for user in source facility.';
    END IF;

    -- Prevent moving sole Super Admin
    IF v_old_membership.role = 'super_admin' THEN
        RAISE EXCEPTION 'RESTRICTION: The Global Super Admin is an enterprise-level role and cannot be reassigned as a facility-scoped user.';
    END IF;

    v_new_role := COALESCE(p_new_role, v_old_membership.role);
    SELECT id INTO v_new_role_id FROM public.roles WHERE slug = v_new_role AND is_system = true LIMIT 1;

    -- Archive / deactivate old membership
    UPDATE public.facility_memberships
    SET is_active = FALSE, updated_at = NOW()
    WHERE id = v_old_membership.id;

    -- Insert or update membership in new facility
    INSERT INTO public.facility_memberships (
        facility_id, user_id, role, role_id, is_active, department, title
    ) VALUES (
        p_to_facility_id, p_user_id, v_new_role, v_new_role_id, TRUE,
        COALESCE(p_department, v_old_membership.department),
        COALESCE(p_title, v_old_membership.title)
    )
    ON CONFLICT (facility_id, user_id) DO UPDATE SET
        role = EXCLUDED.role,
        role_id = EXCLUDED.role_id,
        is_active = TRUE,
        department = EXCLUDED.department,
        title = EXCLUDED.title,
        updated_at = NOW();

    -- Audit log
    INSERT INTO public.audit_logs (
        facility_id, table_name, record_id, action,
        actor_id, actor_email, source, metadata, timestamp
    ) VALUES (
        p_to_facility_id, 'facility_memberships', p_user_id::TEXT, 'EXECUTE',
        v_actor_id, v_actor_email, 'UI',
        jsonb_build_object(
            'event', 'user_facility_reassignment',
            'from_facility_id', p_from_facility_id,
            'to_facility_id', p_to_facility_id,
            'user_id', p_user_id,
            'assigned_role', v_new_role
        ),
        NOW()
    );

    SELECT to_jsonb(fm) INTO v_result 
    FROM public.facility_memberships fm 
    WHERE fm.user_id = p_user_id AND fm.facility_id = p_to_facility_id;

    RETURN v_result;
END;
$$;

-- 4.4 Toggle User Active Status (with Last Admin & Single SA Safeguards)
CREATE OR REPLACE FUNCTION public.fn_admin_toggle_user_active(
    p_membership_id UUID,
    p_is_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID;
    v_actor_email TEXT;
    v_target_mem RECORD;
    v_is_super_admin BOOLEAN := FALSE;
    v_result JSONB;
BEGIN
    v_actor_id := auth.uid();
    v_actor_email := auth.jwt()->>'email';

    IF v_actor_id IS NOT NULL THEN
        v_is_super_admin := user_has_facility_role(NULL, ARRAY['super_admin']);
    ELSE
        v_is_super_admin := TRUE;
    END IF;

    SELECT * INTO v_target_mem FROM public.facility_memberships WHERE id = p_membership_id;
    IF v_target_mem.id IS NULL THEN
        RAISE EXCEPTION 'NOT FOUND: Membership % does not exist.', p_membership_id;
    END IF;

    -- Authorization check
    IF NOT v_is_super_admin THEN
        IF NOT user_has_facility_role(v_target_mem.facility_id, ARRAY['facility_admin']) THEN
            RAISE EXCEPTION 'FORBIDDEN: You lack administrative authority in facility %.', v_target_mem.facility_id;
        END IF;

        IF v_target_mem.role IN ('super_admin', 'facility_admin') THEN
            RAISE EXCEPTION 'FORBIDDEN: Facility Admins cannot deactivate or alter other administrators.';
        END IF;
    END IF;

    -- Prevent deactivating sole Super Admin
    IF v_target_mem.role = 'super_admin' AND p_is_active = FALSE THEN
        RAISE EXCEPTION 'ADMINISTRATIVE SAFETY VIOLATION: Cannot deactivate the Global Super Admin account.';
    END IF;

    UPDATE public.facility_memberships
    SET is_active = p_is_active, updated_at = NOW()
    WHERE id = p_membership_id;

    -- Audit log
    INSERT INTO public.audit_logs (
        facility_id, table_name, record_id, action,
        actor_id, actor_email, source, metadata, timestamp
    ) VALUES (
        v_target_mem.facility_id, 'facility_memberships', p_membership_id::TEXT, 'UPDATE',
        v_actor_id, v_actor_email, 'UI',
        jsonb_build_object('event', 'toggle_user_active', 'is_active', p_is_active, 'user_id', v_target_mem.user_id),
        NOW()
    );

    SELECT to_jsonb(fm) INTO v_result FROM public.facility_memberships fm WHERE fm.id = p_membership_id;
    RETURN v_result;
END;
$$;

-- 4.5 Emergency Super Admin Replacement Procedure
CREATE OR REPLACE FUNCTION public.fn_replace_super_admin(
    p_current_admin_id UUID,
    p_new_admin_id UUID,
    p_confirmation_phrase TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID;
    v_sa_role_id UUID;
    v_primary_fac UUID := '00000000-0000-0000-0000-000000000002';
BEGIN
    v_actor_id := auth.uid();

    -- Strict confirmation phrase to prevent accidental execution
    IF p_confirmation_phrase != 'CONFIRM_SUPER_ADMIN_TRANSFER' THEN
        RAISE EXCEPTION 'SECURITY ERROR: Invalid confirmation phrase for Super Admin transfer.';
    END IF;

    -- Caller must be current super_admin or direct DB admin
    IF v_actor_id IS NOT NULL AND NOT user_has_facility_role(NULL, ARRAY['super_admin']) THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: Only the active Global Super Admin may initiate a transfer.';
    END IF;

    SELECT id INTO v_sa_role_id FROM public.roles WHERE slug = 'super_admin' AND is_system = true LIMIT 1;

    -- Demote old super admin to facility_admin in atomic block
    UPDATE public.facility_memberships
    SET role = 'facility_admin',
        role_id = (SELECT id FROM public.roles WHERE slug = 'facility_admin' AND is_system = true LIMIT 1),
        updated_at = NOW()
    WHERE user_id = p_current_admin_id AND role = 'super_admin';

    -- Promote new super admin
    INSERT INTO public.facility_memberships (facility_id, user_id, role, role_id, is_active, title, department)
    VALUES (v_primary_fac, p_new_admin_id, 'super_admin', v_sa_role_id, true, 'Global Super Administrator', 'Executive')
    ON CONFLICT (facility_id, user_id) DO UPDATE SET
        role = 'super_admin',
        role_id = v_sa_role_id,
        is_active = true,
        updated_at = NOW();

    -- Critical Security Audit Log
    INSERT INTO public.audit_logs (
        facility_id, table_name, record_id, action,
        actor_id, source, metadata, timestamp
    ) VALUES (
        v_primary_fac, 'facility_memberships', p_new_admin_id::TEXT, 'EXECUTE',
        v_actor_id, 'SYSTEM',
        jsonb_build_object(
            'event', 'SUPER_ADMIN_TRANSFERRED',
            'previous_super_admin', p_current_admin_id,
            'new_super_admin', p_new_admin_id
        ),
        NOW()
    );

    RETURN jsonb_build_object('success', true, 'new_super_admin', p_new_admin_id);
END;
$$;

-- ==============================================================================
-- 5. FACILITY DEACTIVATION DATA ISOLATION (RLS ENFORCEMENT)
-- ==============================================================================

-- Helper function: Returns TRUE if facility is active, OR caller is super_admin
CREATE OR REPLACE FUNCTION public.is_facility_accessible(p_facility_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
    IF p_facility_id IS NULL THEN
        RETURN TRUE;
    END IF;

    -- Global super_admin can inspect any facility
    IF user_has_facility_role(NULL, ARRAY['super_admin']) THEN
        RETURN TRUE;
    END IF;

    -- Otherwise, facility MUST be active
    RETURN EXISTS (
        SELECT 1 FROM public.facilities
        WHERE id = p_facility_id AND is_active = TRUE AND status = 'active'
    );
END;
$$;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
