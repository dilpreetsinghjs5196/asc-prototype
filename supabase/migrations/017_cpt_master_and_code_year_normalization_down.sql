-- ==============================================================================
-- MIGRATION 017 DOWN: ROLLBACK CPT MASTER & CODE-YEAR NORMALIZATION
-- ==============================================================================

BEGIN;

DROP VIEW IF EXISTS public.v_cpt_codes_compat CASCADE;
DROP FUNCTION IF EXISTS public.fn_commit_cpt_import_batch(UUID);
DROP FUNCTION IF EXISTS public.fn_resolve_cpt_pricing(UUID, VARCHAR, DATE, UUID);
DROP TRIGGER IF EXISTS trg_cpt_version_gross_charge ON public.cpt_code_versions;
DROP FUNCTION IF EXISTS public.fn_enforce_cpt_gross_charge();

DROP TABLE IF EXISTS public.cpt_import_staging CASCADE;
DROP TABLE IF EXISTS public.cpt_import_batches CASCADE;
DROP TABLE IF EXISTS public.cpt_code_versions CASCADE;
DROP TABLE IF EXISTS public.cpt_master CASCADE;
DROP TABLE IF EXISTS public.cpt_release_years CASCADE;

-- Revert 151-day gap backfill and Naples facility assignment if required
UPDATE public.cpt_codes
SET effective_date = '2026-09-29'
WHERE effective_date = '2026-05-01';

UPDATE public.cpt_codes
SET facility_id = '00000000-0000-0000-0000-000000000002'
WHERE facility_id IS NULL;

COMMIT;
