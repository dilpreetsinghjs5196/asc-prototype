-- ==============================================================================
-- MIGRATION 006 DOWN: ROLLBACK DEPRECATE SETTINGS API KEY
-- ==============================================================================
-- Reverts Migration 006 by re-adding the gemini_api_key column to public.settings.
-- Does NOT grant anonymous access.
-- ==============================================================================

BEGIN;

ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS gemini_api_key TEXT;

DROP POLICY IF EXISTS "Tenant Scoped Settings Read" ON public.settings;
DROP POLICY IF EXISTS "Facility Admin Can Update Facility Settings" ON public.settings;

CREATE POLICY "Tenant Scoped Settings Read"
ON public.settings
FOR SELECT
TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
);

CREATE POLICY "Tenant Scoped Settings Manage"
ON public.settings
FOR ALL
TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin'])
)
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin'])
);

COMMIT;
