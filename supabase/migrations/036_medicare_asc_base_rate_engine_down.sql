-- ==============================================================================
-- MIGRATION DOWN: 036_medicare_asc_base_rate_engine_down.sql
-- ==============================================================================

BEGIN;

DROP TRIGGER IF EXISTS trg_prevent_medicare_calc_delete ON public.medicare_base_rate_calculations CASCADE;
DROP FUNCTION IF EXISTS public.fn_prevent_medicare_calc_delete CASCADE;

DROP TRIGGER IF EXISTS trg_prevent_facility_relocation_medicare ON public.facility_medicare_settings CASCADE;

DROP FUNCTION IF EXISTS public.fn_calculate_case_medicare_baseline(BIGINT) CASCADE;
DROP FUNCTION IF EXISTS public.fn_resolve_medicare_base_rate(DATE, VARCHAR, UUID, NUMERIC) CASCADE;

DROP TABLE IF EXISTS public.medicare_rate_import_staging CASCADE;
DROP TABLE IF EXISTS public.medicare_rate_import_batches CASCADE;
DROP TABLE IF EXISTS public.medicare_base_rate_calc_lines CASCADE;
DROP TABLE IF EXISTS public.medicare_base_rate_calculations CASCADE;
DROP TABLE IF EXISTS public.facility_medicare_settings CASCADE;
DROP TABLE IF EXISTS public.medicare_wage_indices CASCADE;

ALTER TABLE public.cms_asc_releases
    DROP COLUMN IF EXISTS conversion_factor,
    DROP COLUMN IF EXISTS labor_related_share,
    DROP COLUMN IF EXISTS non_labor_share,
    DROP COLUMN IF EXISTS ascqr_reduction_factor;

COMMIT;

