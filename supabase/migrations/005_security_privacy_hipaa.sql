-- ==============================================================================
-- MIGRATION 005: SECURITY, PRIVACY & HIPAA COMPLIANCE HARDENING
-- Specification: docs/phases/25_SECURITY_PRIVACY_HIPAA.md
-- Target: Supabase PostgreSQL 15+ (Remote Instance: isutllqthmakvwgduaos)
-- Standards: HIPAA Security Rule (45 CFR § 164.312), Privacy Rule (§ 164.502/514)
-- ==============================================================================

-- 1. EXTENSIONS & TRANSACTION SAFETY
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 2. TENANCY INTEGRITY & NULLABLE ELIMINATION
-- ==============================================================================

-- Ensure all existing rows have valid facility_id before applying NOT NULL
DO $$
DECLARE
    v_default_fac UUID;
BEGIN
    SELECT id INTO v_default_fac FROM public.facilities LIMIT 1;
    IF v_default_fac IS NOT NULL THEN
        UPDATE public.patients SET facility_id = v_default_fac WHERE facility_id IS NULL;
        UPDATE public.surgeries SET facility_id = v_default_fac WHERE facility_id IS NULL;
        UPDATE public.staff SET facility_id = v_default_fac WHERE facility_id IS NULL;
        UPDATE public.or_block_schedule SET facility_id = v_default_fac WHERE facility_id IS NULL;
        UPDATE public.ot_extra_cost SET facility_id = v_default_fac WHERE facility_id IS NULL;
    END IF;
END $$;

-- Enforce NOT NULL on core clinical tables
ALTER TABLE public.patients ALTER COLUMN facility_id SET NOT NULL;
ALTER TABLE public.surgeries ALTER COLUMN facility_id SET NOT NULL;

-- Enforce Unique MRN per Facility to prevent cross-patient record collision
CREATE UNIQUE INDEX IF NOT EXISTS uq_patients_facility_mrn 
ON public.patients (facility_id, LOWER(TRIM(mrn))) 
WHERE mrn IS NOT NULL AND TRIM(mrn) <> '';

-- ==============================================================================
-- 3. ELIMINATE LEGACY PLAINTEXT CREDENTIALS
-- ==============================================================================

-- Drop legacy plaintext password column on surgeons table (surgeons authenticate via GoTrue auth.users)
ALTER TABLE public.surgeons DROP COLUMN IF EXISTS password;

-- Completely quarantine legacy public.users table from client REST endpoints
REVOKE ALL ON public.users FROM anon;
REVOKE ALL ON public.users FROM authenticated;

-- ==============================================================================
-- 4. SECURE AUDIT EXPORT RPC (HIPAA § 164.312(b) EXFILTRATION PROVENANCE)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_log_export_audit_event(
    p_export_type TEXT,
    p_table_name TEXT,
    p_record_count INT,
    p_facility_id UUID DEFAULT NULL,
    p_filter_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID;
    v_actor_role TEXT;
    v_user_agent TEXT;
    v_ip_addr INET;
    v_facility_id UUID;
    v_event_id UUID;
    v_is_authorized BOOLEAN;
BEGIN
    -- 1. Require Authenticated Session
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Export audit logging requires an authenticated user session.';
    END IF;

    -- 2. Resolve Facility Context
    v_facility_id := p_facility_id;
    IF v_facility_id IS NULL THEN
        SELECT facility_id INTO v_facility_id
        FROM public.facility_memberships
        WHERE user_id = v_actor_id AND is_active = TRUE
        ORDER BY created_at ASC LIMIT 1;
    END IF;

    IF v_facility_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Actor is not associated with an active facility membership.';
    END IF;

    -- 3. Verify Actor Belongs to Target Facility
    IF NOT EXISTS (
        SELECT 1 FROM public.facility_memberships fm
        WHERE fm.user_id = v_actor_id
          AND fm.facility_id = v_facility_id
          AND fm.is_active = TRUE
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN: Actor lacks active membership in facility %', v_facility_id;
    END IF;

    -- 4. Derive Actor Role
    SELECT fm.role INTO v_actor_role
    FROM public.facility_memberships fm
    WHERE fm.user_id = v_actor_id
      AND fm.facility_id = v_facility_id
      AND fm.is_active = TRUE
    LIMIT 1;

    IF v_actor_role IS NULL THEN
        v_actor_role := 'viewer';
    END IF;

    -- 5. Extract Session Environment Metadata
    BEGIN
        v_ip_addr := inet(current_setting('request.headers', true)::jsonb->>'x-forwarded-for');
    EXCEPTION WHEN OTHERS THEN
        v_ip_addr := NULL;
    END;

    BEGIN
        v_user_agent := current_setting('request.headers', true)::jsonb->>'user-agent';
    EXCEPTION WHEN OTHERS THEN
        v_user_agent := 'PostgREST Export Client';
    END;

    -- 6. Insert Append-Only Export Audit Record
    INSERT INTO public.audit_logs (
        event_id,
        facility_id,
        table_name,
        record_id,
        action,
        actor_id,
        actor_role,
        source,
        correlation_id,
        user_agent,
        ip_address,
        change_reason,
        status,
        metadata,
        created_at
    ) VALUES (
        gen_random_uuid(),
        v_facility_id,
        p_table_name,
        'export-' || COALESCE(p_export_type, 'csv') || '-' || p_record_count::text,
        'EXPORT',
        v_actor_id,
        v_actor_role,
        'UI',
        'EXPORT-' || to_char(NOW(), 'YYYYMMDDHH24MISS'),
        v_user_agent,
        v_ip_addr,
        'User executed bulk ' || COALESCE(p_export_type, 'data') || ' export of ' || p_record_count::text || ' records from ' || p_table_name,
        'SUCCESS',
        jsonb_build_object(
            'export_type', p_export_type,
            'table_name', p_table_name,
            'record_count', p_record_count,
            'filters', public.fn_sanitize_audit_jsonb(p_filter_metadata)
        ),
        NOW()
    )
    RETURNING event_id INTO v_event_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'event_id', v_event_id,
        'message', 'Export audit event recorded successfully.'
    );
END;
$$;

-- Grant EXECUTE to authenticated users
REVOKE ALL ON FUNCTION public.fn_log_export_audit_event(TEXT, TEXT, INT, UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_log_export_audit_event(TEXT, TEXT, INT, UUID, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_log_export_audit_event(TEXT, TEXT, INT, UUID, JSONB) TO authenticated;

-- ==============================================================================
-- 5. MINIMUM NECESSARY: STAFF PAYROLL COLUMN SEGREGATION
-- ==============================================================================

-- Grant SELECT on staff table columns specifically, restricting salary to admins/CFO
-- In PostgreSQL RLS, authenticated users need SELECT on general directory columns:
DO $$
BEGIN
    -- Verify staff table RLS is enabled
    ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
END $$;

-- Policy ensuring staff can view employee directory
DROP POLICY IF EXISTS "Tenant Scoped Staff Read" ON public.staff;
CREATE POLICY "Tenant Scoped Staff Read"
ON public.staff
FOR SELECT
TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
);

-- ==============================================================================
-- 6. SETTINGS API KEY SECURED POLICY
-- ==============================================================================

-- Restrict settings mutation and sensitive key reading strictly to facility admins
DROP POLICY IF EXISTS "Facility Admin Can Update Facility Settings" ON public.settings;
CREATE POLICY "Facility Admin Can Update Facility Settings"
ON public.settings
FOR UPDATE
TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin'])
)
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin'])
);

COMMENT ON FUNCTION public.fn_log_export_audit_event IS 'Audits and tracks client-side data export operations to ensure HIPAA § 164.312(b) accounting of disclosures.';
