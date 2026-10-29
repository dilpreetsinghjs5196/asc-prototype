-- ==============================================================================
-- Migration: 038_medicare_geographic_wage_adjustment_down.sql
-- Description: Revert Phase 62 Geographic Wage Adjustment schema and functions
-- ==============================================================================

BEGIN;

-- 1. Drop RLS policies
DROP POLICY IF EXISTS rls_select_cbsa_delineations ON public.cms_cbsa_delineations;
DROP POLICY IF EXISTS rls_select_fac_geo_assignments ON public.facility_medicare_geographic_assignments;
DROP POLICY IF EXISTS rls_manage_fac_geo_assignments ON public.facility_medicare_geographic_assignments;

-- 2. Drop authoritative stored procedure
DROP FUNCTION IF EXISTS public.fn_resolve_facility_wage_index(UUID, DATE);

-- 3. Drop tables
DROP TABLE IF EXISTS public.cms_cbsa_delineations CASCADE;
DROP TABLE IF EXISTS public.facility_medicare_geographic_assignments CASCADE;

-- 4. Remove added columns from medicare_wage_indices
ALTER TABLE public.medicare_wage_indices
    DROP COLUMN IF EXISTS pre_floor_wage_index,
    DROP COLUMN IF EXISTS transition_capped_wage_index,
    DROP COLUMN IF EXISTS is_reclassified,
    DROP COLUMN IF EXISTS fips_county_code;

COMMIT;
