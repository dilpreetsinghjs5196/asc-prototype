-- ==============================================================================
-- Migration 007: Surgeons Tenancy Backfill, Default Facility & Relocation Trigger Hardening
-- ==============================================================================

-- 1. Set default facility_id for public.surgeons to primary facility (Naples Surgery Center)
ALTER TABLE public.surgeons 
  ALTER COLUMN facility_id SET DEFAULT '00000000-0000-0000-0000-000000000002';

-- 2. Backfill existing surgeons whose facility_id is NULL
UPDATE public.surgeons
SET facility_id = '00000000-0000-0000-0000-000000000002'
WHERE facility_id IS NULL;

-- 3. Update prevent_facility_relocation() trigger function
-- Allows direct database administrator / SQL Editor executions (auth.uid() IS NULL)
-- and initial NULL assignment/backfills (OLD.facility_id IS NULL)
CREATE OR REPLACE FUNCTION public.prevent_facility_relocation()
RETURNS TRIGGER AS $$
BEGIN
    -- Allow direct database administrator / SQL Editor or initial NULL assignment
    IF auth.uid() IS NULL OR OLD.facility_id IS NULL THEN
        RETURN NEW;
    END IF;

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

-- 4. Ensure foreign key relationship from surgeries to surgeons exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'surgeries_surgeon_id_fkey'
  ) THEN
    ALTER TABLE public.surgeries
      ADD CONSTRAINT surgeries_surgeon_id_fkey
      FOREIGN KEY (surgeon_id) REFERENCES public.surgeons(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5. Refresh PostgREST API schema cache
NOTIFY pgrst, 'reload schema';
