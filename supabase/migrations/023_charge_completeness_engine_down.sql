-- ==============================================================================
-- MIGRATION 023 DOWN: REVERT CHARGE COMPLETENESS ENGINE (PHASE 46)
-- ==============================================================================

BEGIN;

-- 1. Drop Stored Functions
DROP FUNCTION IF EXISTS public.fn_evaluate_charge_completeness(BIGINT, UUID);

-- 2. Restore Migration 021 version of fn_validate_case_procedures
CREATE OR REPLACE FUNCTION public.fn_validate_case_procedures(
    p_surgery_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_proc RECORD;
    v_val JSONB;
    v_total_lines INTEGER := 0;
    v_valid_lines INTEGER := 0;
    v_warning_lines INTEGER := 0;
    v_error_lines INTEGER := 0;
BEGIN
    FOR v_proc IN 
        SELECT sp.id, sp.units, sp.modifiers, sp.laterality, cc.code AS cpt_code
        FROM public.surgery_procedures sp
        JOIN public.cpt_codes cc ON cc.id = sp.cpt_code_id
        WHERE sp.surgery_id = p_surgery_id
    LOOP
        v_total_lines := v_total_lines + 1;
        
        v_val := public.fn_validate_procedure_line(
            p_surgery_id,
            v_proc.cpt_code,
            v_proc.units,
            v_proc.modifiers,
            v_proc.laterality,
            v_proc.id
        );

        IF v_val->>'status' = 'error' THEN
            v_error_lines := v_error_lines + 1;
        ELSIF v_val->>'status' = 'warning' THEN
            v_warning_lines := v_warning_lines + 1;
        ELSE
            v_valid_lines := v_valid_lines + 1;
        END IF;

        UPDATE public.surgery_procedures
        SET validation_status = (v_val->>'status'),
            validation_flags = (v_val->'errors') || (v_val->'warnings'),
            validation_timestamp = NOW()
        WHERE id = v_proc.id;
    END LOOP;

    RETURN jsonb_build_object(
        'total_lines', v_total_lines,
        'valid_lines', v_valid_lines,
        'warning_lines', v_warning_lines,
        'error_lines', v_error_lines,
        'can_approve', (v_error_lines = 0)
    );
END;
$$;

-- 3. Drop Tables in Reverse Dependency Order
DROP TABLE IF EXISTS public.charge_completeness_findings CASCADE;
DROP TABLE IF EXISTS public.charge_completeness_runs CASCADE;
DROP TABLE IF EXISTS public.case_devices CASCADE;

COMMIT;
