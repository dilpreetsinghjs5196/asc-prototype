-- ==============================================================================
-- MIGRATION 018 DOWN: ROLLBACK CMS ASC COVERAGE, ADDENDA & PAYMENT (PHASE 41)
-- ==============================================================================

BEGIN;

-- Drop views
DROP VIEW IF EXISTS public.v_cms_asc_addenda_summary CASCADE;

-- Drop procedures
DROP FUNCTION IF EXISTS public.fn_calculate_case_reimbursement(BIGINT);
DROP FUNCTION IF EXISTS public.fn_resolve_asc_procedure_pricing(DATE, VARCHAR, UUID, UUID);

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS public.cms_coverage_determinations CASCADE;
DROP TABLE IF EXISTS public.cms_asc_addenda CASCADE;
DROP TABLE IF EXISTS public.cms_asc_releases CASCADE;

-- Revert columns on cpt_code_versions and cpt_codes
ALTER TABLE public.cpt_code_versions
    DROP COLUMN IF EXISTS is_device_intensive,
    DROP COLUMN IF EXISTS device_offset_percentage,
    DROP COLUMN IF EXISTS device_offset_amount,
    DROP COLUMN IF EXISTS coverage_status;

ALTER TABLE public.cpt_codes
    DROP COLUMN IF EXISTS is_device_intensive,
    DROP COLUMN IF EXISTS device_offset_percentage,
    DROP COLUMN IF EXISTS device_offset_amount,
    DROP COLUMN IF EXISTS coverage_status;

-- Re-establish Migration 017 compatibility view
DROP VIEW IF EXISTS public.v_cpt_codes_compat CASCADE;
CREATE VIEW public.v_cpt_codes_compat AS
SELECT 
    v.legacy_cpt_id AS id,
    m.code,
    m.description,
    v.reimbursement,
    v.gross_charge,
    m.specialty AS category,
    m.procedure_group,
    v.effective_date,
    v.termination_date,
    v.code_year::text AS version_year,
    v.procedure_indicator,
    v.payment_indicator,
    v.is_active,
    v.facility_id,
    m.average_duration_minutes AS average_duration,
    m.typical_turnover_minutes AS turnover_time,
    m.body_part
FROM public.cpt_code_versions v
JOIN public.cpt_master m ON v.cpt_master_id = m.id;

COMMIT;
