-- ==============================================================================
-- MIGRATION 022 DOWN: REVERT CPT VERSIONING & LICENSED CONTENT
-- ==============================================================================

BEGIN;

-- 1. Drop trigger and validation function
DROP TRIGGER IF EXISTS trg_validate_cpt_version_temporal_bounds ON public.cpt_code_versions;
DROP FUNCTION IF EXISTS public.fn_validate_cpt_version_temporal_bounds();

-- 2. Drop added columns on surgery_procedures
DROP INDEX IF EXISTS public.idx_sp_cpt_version;
DROP INDEX IF EXISTS public.idx_sp_pricing_dos;
ALTER TABLE public.surgery_procedures
DROP COLUMN IF EXISTS cpt_version_id,
DROP COLUMN IF EXISTS pricing_source,
DROP COLUMN IF EXISTS pricing_dos,
DROP COLUMN IF EXISTS ama_copyright_acknowledged;

-- 3. Restore Migration 017 version of fn_resolve_cpt_pricing
CREATE OR REPLACE FUNCTION public.fn_resolve_cpt_pricing(
    p_facility_id UUID,
    p_cpt_code VARCHAR,
    p_dos DATE DEFAULT CURRENT_DATE,
    p_payer_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_master_id UUID;
    v_version_id UUID;
    v_rate_source TEXT := 'NONE';
    v_contracted_rate NUMERIC(12, 2) := NULL;
    v_gross_charge NUMERIC(12, 2) := NULL;
    v_reimbursement NUMERIC(12, 2) := NULL;
    v_procedure_indicator VARCHAR(10) := NULL;
BEGIN
    SELECT id INTO v_master_id FROM public.cpt_master WHERE code = p_cpt_code;
    IF v_master_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'CPT_NOT_FOUND', 'code', p_cpt_code);
    END IF;

    IF p_payer_id IS NOT NULL THEN
        SELECT pfs.contracted_rate, pfs.id INTO v_contracted_rate, v_version_id
        FROM public.payer_fee_schedules pfs
        WHERE pfs.facility_id = p_facility_id
          AND pfs.payer_id = p_payer_id
          AND pfs.cpt_code_id IN (SELECT id FROM public.cpt_codes WHERE code = p_cpt_code)
          AND p_dos >= pfs.effective_start_date
          AND (pfs.effective_end_date IS NULL OR p_dos <= pfs.effective_end_date)
        ORDER BY pfs.effective_start_date DESC LIMIT 1;

        IF v_contracted_rate IS NOT NULL THEN
            v_rate_source := 'PAYER_CONTRACT';
        END IF;
    END IF;

    IF v_contracted_rate IS NULL THEN
        SELECT v.reimbursement, v.gross_charge, v.id, v.procedure_indicator
        INTO v_reimbursement, v_gross_charge, v_version_id, v_procedure_indicator
        FROM public.cpt_code_versions v
        WHERE v.cpt_master_id = v_master_id
          AND v.facility_id = p_facility_id
          AND p_dos >= v.effective_date
          AND (v.termination_date IS NULL OR p_dos <= v.termination_date)
        ORDER BY v.effective_date DESC LIMIT 1;

        IF v_reimbursement IS NOT NULL THEN
            v_rate_source := 'FACILITY_OVERRIDE';
            v_contracted_rate := v_reimbursement;
        END IF;
    END IF;

    IF v_reimbursement IS NULL THEN
        SELECT v.reimbursement, v.gross_charge, v.id, v.procedure_indicator
        INTO v_reimbursement, v_gross_charge, v_version_id, v_procedure_indicator
        FROM public.cpt_code_versions v
        WHERE v.cpt_master_id = v_master_id
          AND v.facility_id IS NULL
          AND p_dos >= v.effective_date
          AND (v.termination_date IS NULL OR p_dos <= v.termination_date)
        ORDER BY v.effective_date DESC LIMIT 1;

        IF v_reimbursement IS NOT NULL THEN
            v_rate_source := 'CMS_NATIONAL_STANDARD';
            v_contracted_rate := v_reimbursement;
        END IF;
    END IF;

    IF v_gross_charge IS NULL AND v_reimbursement IS NOT NULL THEN
        v_gross_charge := ROUND(v_reimbursement * 3.50, 0);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'code', p_cpt_code,
        'master_id', v_master_id,
        'version_id', v_version_id,
        'rate_source', v_rate_source,
        'contracted_reimbursement', COALESCE(v_contracted_rate, 0.00),
        'baseline_gross_charge', COALESCE(v_gross_charge, 0.00),
        'procedure_indicator', v_procedure_indicator,
        'date_of_service', p_dos
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Restore Migration 019 definition of v_cpt_codes_compat view
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
    m.body_part,
    cs.name AS specialty_name,
    bs.name AS body_system_name,
    bp.name AS body_part_name,
    org.name AS organ_name,
    pf.name AS procedure_family_name
FROM public.cpt_code_versions v
JOIN public.cpt_master m ON v.cpt_master_id = m.id
LEFT JOIN public.cpt_clinical_mappings ccm ON ccm.cpt_master_id = m.id AND ccm.is_primary = true
LEFT JOIN public.clinical_specialties cs ON ccm.specialty_id = cs.id
LEFT JOIN public.body_systems bs ON ccm.body_system_id = bs.id
LEFT JOIN public.body_parts bp ON ccm.body_part_id = bp.id
LEFT JOIN public.anatomical_organs org ON ccm.organ_id = org.id
LEFT JOIN public.procedure_families pf ON ccm.procedure_family_id = pf.id;

COMMIT;
