-- ==============================================================================
-- Migration 007 Down: Revert Surgeons Default Facility & Relocation Trigger
-- ==============================================================================

-- 1. Remove default facility_id
ALTER TABLE public.surgeons 
  ALTER COLUMN facility_id DROP DEFAULT;

-- 2. Restore strict prevent_facility_relocation() trigger function
CREATE OR REPLACE FUNCTION public.prevent_facility_relocation()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.facility_id IS DISTINCT FROM OLD.facility_id THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.facility_memberships fm
            WHERE fm.user_id = auth.uid()
              AND fm.facility_id = OLD.facility_id
              AND fm.role IN ('super_admin', 'org_admin')
              AND fm.is_active = TRUE
        ) THEN
            RAISE EXCEPTION 'Cross-facility relocation of records is forbidden. facility_id is immutable for non-enterprise administrators.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Refresh PostgREST API schema cache
NOTIFY pgrst, 'reload schema';
