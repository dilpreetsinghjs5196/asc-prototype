-- ==============================================================================
-- ASCANALYST PLATFORM — DATABASE MIGRATION 002 (DOWN / ROLLBACK)
-- REVERT RBAC ROLES & GRANULAR PERMISSIONS SAFELY WITHOUT OPENING POLICIES
-- ==============================================================================
-- Target Database: Supabase PostgreSQL 15+ (Remote / Local)
-- 
-- Rollback Invariants:
-- 1. Never restores anonymous access or wide-open authenticated policies.
-- 2. Restores Migration 001 policies and triggers safely.
-- 3. Drops role_permissions, roles, permissions, and functions cleanly.
-- ==============================================================================

BEGIN;

-- 1. Drop Administrative Safeguard Triggers
DROP TRIGGER IF EXISTS trg_protect_last_facility_admin ON public.facility_memberships;
DROP FUNCTION IF EXISTS public.protect_last_facility_admin();

DROP TRIGGER IF EXISTS trg_prevent_self_escalation ON public.facility_memberships;
DROP FUNCTION IF EXISTS public.prevent_self_role_escalation();

-- 2. Revert handle_new_facility_user Trigger to Migration 001 Definition
CREATE OR REPLACE FUNCTION public.handle_new_facility_user()
RETURNS TRIGGER AS $$
DECLARE
    v_surgeon_record RECORD;
BEGIN
    IF NEW.email = 'admin@asc.com' THEN
        INSERT INTO public.facility_memberships (facility_id, user_id, role, is_active)
        VALUES ('00000000-0000-0000-0000-000000000002'::UUID, NEW.id, 'facility_admin', true)
        ON CONFLICT (facility_id, user_id) DO UPDATE SET is_active = true, role = 'facility_admin';
    END IF;

    FOR v_surgeon_record IN
        SELECT DISTINCT facility_id 
        FROM public.surgeons 
        WHERE LOWER(email) = LOWER(NEW.email)
          AND facility_id IS NOT NULL
    LOOP
        INSERT INTO public.facility_memberships (facility_id, user_id, role, is_active)
        VALUES (v_surgeon_record.facility_id, NEW.id, 'surgeon', true)
        ON CONFLICT (facility_id, user_id) DO UPDATE SET is_active = true, role = 'surgeon';
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Revert Surgeries Policies to Migration 001 Baseline (Preserving Tenancy RLS)
DROP POLICY IF EXISTS "Tenant Scoped Surgeries Read" ON public.surgeries;
CREATE POLICY "Tenant Scoped Surgeries Read"
ON public.surgeries
FOR SELECT
TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
);

DROP POLICY IF EXISTS "Tenant Scoped Surgeries Insert" ON public.surgeries;
CREATE POLICY "Tenant Scoped Surgeries Insert"
ON public.surgeries
FOR INSERT
TO authenticated
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'clinical_director', 'scheduler', 'surgeon', 'biller', 'billing_rcm'])
);

-- 4. Drop Permission Evaluation Functions & Performance Indexes
DROP INDEX IF EXISTS public.idx_surgeons_lower_email;
DROP FUNCTION IF EXISTS public.get_auth_user_permissions(UUID);
DROP FUNCTION IF EXISTS public.has_permission(UUID, TEXT);

-- 5. Remove role_id from facility_memberships (Existing role TEXT preserved)
DROP INDEX IF EXISTS public.idx_memberships_role_id;
ALTER TABLE public.facility_memberships DROP COLUMN IF EXISTS role_id CASCADE;

-- 6. Drop Relational RBAC Tables in Dependency Order
DROP TABLE IF EXISTS public.role_permissions CASCADE;
DROP TABLE IF EXISTS public.roles CASCADE;
DROP TABLE IF EXISTS public.permissions CASCADE;

COMMIT;
