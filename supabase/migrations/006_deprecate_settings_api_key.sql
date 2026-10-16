-- ==============================================================================
-- MIGRATION 006: DEPRECATE SETTINGS API KEY & TIGHTEN SETTINGS ACCESS
-- ==============================================================================
-- Author: ASCANALYST Architecture & Security Engineering Team
-- Date: 2026-10-16
-- Specification: Phase 26 Security Test Plan & Risk Remediation
-- Description:
--   1. Eliminates public.settings.gemini_api_key to prevent browser/REST key harvesting.
--   2. AI queries are transitioned to server-side Edge Function (gemini-proxy).
--   3. Tightens RLS policies on public.settings to prevent unauthorized reads/writes.
-- ==============================================================================

BEGIN;

-- 1. Remove plaintext third-party AI credentials from queryable settings table
ALTER TABLE public.settings DROP COLUMN IF EXISTS gemini_api_key;

-- 2. Clean and harden RLS policies on public.settings
DROP POLICY IF EXISTS "Tenant Scoped Settings Read" ON public.settings;
DROP POLICY IF EXISTS "Tenant Scoped Settings Access" ON public.settings;
DROP POLICY IF EXISTS "Tenant Scoped Settings Manage" ON public.settings;
DROP POLICY IF EXISTS "Facility Admin Can Update Facility Settings" ON public.settings;

-- 3. Read Policy: Authenticated users assigned to the facility may view facility metadata (facility_name, address, MPPR setting)
CREATE POLICY "Tenant Scoped Settings Read"
ON public.settings
FOR SELECT
TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
);

-- 4. Write Policy: Mutation strictly restricted to administrative roles
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

-- 5. Comments & Audit Annotation
COMMENT ON TABLE public.settings IS 'Facility-level configuration and metadata. Third-party AI secrets are managed server-side via Supabase Edge Function environment secrets, not in queryable tables.';

COMMIT;
