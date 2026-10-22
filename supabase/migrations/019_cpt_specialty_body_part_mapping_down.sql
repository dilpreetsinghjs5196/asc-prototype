-- ==============================================================================
-- MIGRATION 019 DOWN: ROLLBACK CPT CLINICAL TAXONOMY & MAPPING (PHASE 42)
-- ==============================================================================

BEGIN;

-- Drop functions
DROP FUNCTION IF EXISTS public.fn_resolve_cpt_clinical_taxonomy(VARCHAR, UUID);

-- Re-establish Migration 018 view
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
    v.is_device_intensive,
    v.device_offset_percentage,
    v.device_offset_amount,
    v.coverage_status,
    v.is_active,
    v.facility_id,
    m.average_duration_minutes AS average_duration,
    m.typical_turnover_minutes AS turnover_time,
    m.body_part
FROM public.cpt_code_versions v
JOIN public.cpt_master m ON v.cpt_master_id = m.id;

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS public.cpt_mapping_reviews CASCADE;
DROP TABLE IF EXISTS public.cpt_clinical_mappings CASCADE;
DROP TABLE IF EXISTS public.procedure_families CASCADE;
DROP TABLE IF EXISTS public.anatomical_organs CASCADE;
DROP TABLE IF EXISTS public.body_parts CASCADE;
DROP TABLE IF EXISTS public.body_systems CASCADE;
DROP TABLE IF EXISTS public.clinical_specialties CASCADE;

COMMIT;
