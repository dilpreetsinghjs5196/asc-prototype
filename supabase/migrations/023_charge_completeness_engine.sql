-- ==============================================================================
-- MIGRATION 023: CHARGE COMPLETENESS ENGINE & PRE-BILL GOVERNANCE (PHASE 46)
-- ==============================================================================
-- Description: Establishes production-grade pre-bill charge completeness rules:
--              1. Creates public.case_devices for line-item implant/device charges.
--              2. Creates public.charge_completeness_runs for pre-bill audit runs.
--              3. Creates public.charge_completeness_findings for granular issue tracking.
--              4. Upgrades fn_validate_case_procedures to block zero-procedure cases.
--              5. Deploys authoritative fn_evaluate_charge_completeness stored procedure.
--              6. Enforces tenant-isolated Row-Level Security (RLS) across all objects.
-- Specification: docs/phases/46_CHARGE_COMPLETENESS_ENGINE.md
-- Target Engine: Supabase PostgreSQL 15+
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. CASE DEVICES & IMPLANTS LINE-ITEM TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.case_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE CASCADE,
    procedure_id UUID REFERENCES public.surgery_procedures(id) ON DELETE SET NULL,
    device_name VARCHAR(150) NOT NULL,
    hcpcs_code VARCHAR(10), -- e.g. C1785, C1767, L8699
    manufacturer VARCHAR(100),
    model_number VARCHAR(50),
    serial_number VARCHAR(50),
    lot_number VARCHAR(50),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
    unit_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (unit_cost >= 0.00),
    charge_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (charge_amount >= 0.00),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cd_surgery ON public.case_devices(surgery_id);
CREATE INDEX IF NOT EXISTS idx_cd_facility ON public.case_devices(facility_id);
CREATE INDEX IF NOT EXISTS idx_cd_hcpcs ON public.case_devices(hcpcs_code);

-- ==============================================================================
-- 2. CHARGE COMPLETENESS RUNS LEDGER
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.charge_completeness_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE CASCADE,
    run_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    executed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    rule_version VARCHAR(20) NOT NULL DEFAULT '2026.1',
    overall_status VARCHAR(20) NOT NULL CHECK (overall_status IN ('clean', 'warnings', 'blocked', 'overridden')),
    total_findings INTEGER NOT NULL DEFAULT 0,
    blocker_count INTEGER NOT NULL DEFAULT 0,
    warning_count INTEGER NOT NULL DEFAULT 0,
    is_cleared BOOLEAN NOT NULL DEFAULT false,
    cleared_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    cleared_at TIMESTAMPTZ,
    clearance_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ccr_surgery ON public.charge_completeness_runs(surgery_id);
CREATE INDEX IF NOT EXISTS idx_ccr_facility_status ON public.charge_completeness_runs(facility_id, overall_status);

-- ==============================================================================
-- 3. CHARGE COMPLETENESS FINDINGS LEDGER
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.charge_completeness_findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES public.charge_completeness_runs(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE CASCADE,
    procedure_line_id UUID REFERENCES public.surgery_procedures(id) ON DELETE CASCADE,
    rule_id VARCHAR(30) NOT NULL,
    rule_category VARCHAR(30) NOT NULL CHECK (rule_category IN ('procedure', 'modifier', 'units', 'device', 'pricing', 'documentation')),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('BLOCKER', 'ERROR', 'WARNING', 'INFO')),
    finding_message TEXT NOT NULL,
    resolution_guidance TEXT,
    is_overridden BOOLEAN NOT NULL DEFAULT false,
    override_reason TEXT,
    override_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    override_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ccf_run ON public.charge_completeness_findings(run_id);
CREATE INDEX IF NOT EXISTS idx_ccf_surgery ON public.charge_completeness_findings(surgery_id);
CREATE INDEX IF NOT EXISTS idx_ccf_severity ON public.charge_completeness_findings(severity);

-- ==============================================================================
-- 4. REPAIR FN_VALIDATE_CASE_PROCEDURES (BLOCK ZERO-PROCEDURE ENCOUNTERS)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_validate_case_procedures(
    p_surgery_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_surg RECORD;
    v_proc RECORD;
    v_val JSONB;
    v_total_lines INTEGER := 0;
    v_valid_lines INTEGER := 0;
    v_warning_lines INTEGER := 0;
    v_error_lines INTEGER := 0;
    v_primary_count INTEGER := 0;
BEGIN
    SELECT * INTO v_surg FROM public.surgeries WHERE id = p_surgery_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'total_lines', 0,
            'valid_lines', 0,
            'warning_lines', 0,
            'error_lines', 1,
            'can_approve', false,
            'message', 'Encounter not found'
        );
    END IF;

    -- Iterate procedure lines
    FOR v_proc IN 
        SELECT 
            sp.id, 
            sp.units, 
            sp.modifiers, 
            sp.laterality, 
            sp.is_primary,
            COALESCE(m.code, cc.code) AS cpt_code
        FROM public.surgery_procedures sp
        LEFT JOIN public.cpt_code_versions v ON sp.cpt_version_id = v.id
        LEFT JOIN public.cpt_master m ON v.cpt_master_id = m.id
        LEFT JOIN public.cpt_codes cc ON sp.cpt_code_id = cc.id
        WHERE sp.surgery_id = p_surgery_id
    LOOP
        v_total_lines := v_total_lines + 1;
        IF v_proc.is_primary = true THEN
            v_primary_count := v_primary_count + 1;
        END IF;
        
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

    -- Zero-procedure line enforcement: Non-cancelled cases must have >= 1 CPT code
    IF v_total_lines = 0 AND COALESCE(v_surg.status, '') != 'Cancelled' THEN
        RETURN jsonb_build_object(
            'total_lines', 0,
            'valid_lines', 0,
            'warning_lines', 0,
            'error_lines', 1,
            'can_approve', false,
            'message', 'Encounter has zero procedure lines. Non-cancelled cases require at least one CPT code.'
        );
    END IF;

    -- Primary procedure flag check
    IF v_total_lines > 0 AND v_primary_count = 0 THEN
        v_error_lines := v_error_lines + 1;
    END IF;

    RETURN jsonb_build_object(
        'total_lines', v_total_lines,
        'valid_lines', v_valid_lines,
        'warning_lines', v_warning_lines,
        'error_lines', v_error_lines,
        'primary_count', v_primary_count,
        'can_approve', (v_total_lines > 0 AND v_error_lines = 0 AND v_primary_count = 1)
    );
END;
$$;

-- ==============================================================================
-- 5. AUTHORITATIVE CHARGE COMPLETENESS ENGINE (fn_evaluate_charge_completeness)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_evaluate_charge_completeness(
    p_surgery_id BIGINT,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_surg RECORD;
    v_proc RECORD;
    v_dev RECORD;
    v_run_id UUID;
    v_facility_id UUID;
    v_dos DATE;
    v_total_lines INTEGER := 0;
    v_primary_count INTEGER := 0;
    v_device_count INTEGER := 0;
    v_has_device_intensive_cpt BOOLEAN := false;
    v_device_intensive_codes TEXT[] := '{}';
    v_blockers INTEGER := 0;
    v_warnings INTEGER := 0;
    v_overall_status VARCHAR(20) := 'clean';
    v_is_cleared BOOLEAN := true;
BEGIN
    -- 1. Fetch Surgery Record
    SELECT * INTO v_surg FROM public.surgeries WHERE id = p_surgery_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'CASE_NOT_FOUND',
            'message', 'Encounter not found'
        );
    END IF;

    v_facility_id := v_surg.facility_id;
    v_dos := COALESCE(v_surg.date::DATE, CURRENT_DATE);

    -- 2. Create New Run Record
    v_run_id := gen_random_uuid();
    INSERT INTO public.charge_completeness_runs (
        id, facility_id, surgery_id, run_timestamp, executed_by, rule_version, overall_status
    ) VALUES (
        v_run_id, v_facility_id, p_surgery_id, NOW(), p_user_id, '2026.1', 'clean'
    );

    -- ==========================================================================
    -- RULE EVALUATION
    -- ==========================================================================

    -- 3. Procedure Line Level Checks
    FOR v_proc IN 
        SELECT 
            sp.id, 
            sp.units, 
            sp.modifiers, 
            sp.laterality, 
            sp.is_primary,
            sp.line_expected_reimbursement,
            sp.cpt_version_id,
            COALESCE(m.code, cc.code) AS cpt_code,
            COALESCE(v.is_device_intensive, false) AS is_device_intensive,
            bp.laterality_applicable
        FROM public.surgery_procedures sp
        LEFT JOIN public.cpt_code_versions v ON sp.cpt_version_id = v.id
        LEFT JOIN public.cpt_master m ON v.cpt_master_id = m.id
        LEFT JOIN public.cpt_codes cc ON sp.cpt_code_id = cc.id
        LEFT JOIN public.cpt_clinical_mappings ccm ON ccm.cpt_master_id = m.id AND ccm.is_primary = true
        LEFT JOIN public.body_parts bp ON bp.id = ccm.body_part_id
        WHERE sp.surgery_id = p_surgery_id
    LOOP
        v_total_lines := v_total_lines + 1;
        
        IF v_proc.is_primary = true THEN
            v_primary_count := v_primary_count + 1;
        END IF;

        IF v_proc.is_device_intensive = true THEN
            v_has_device_intensive_cpt := true;
            v_device_intensive_codes := array_append(v_device_intensive_codes, v_proc.cpt_code);
        END IF;

        -- UNIT-001: Invalid unit value
        IF v_proc.units IS NULL OR v_proc.units <= 0 THEN
            INSERT INTO public.charge_completeness_findings (
                run_id, facility_id, surgery_id, procedure_line_id, rule_id, rule_category, severity, finding_message, resolution_guidance
            ) VALUES (
                v_run_id, v_facility_id, p_surgery_id, v_proc.id, 'UNIT-001', 'units', 'BLOCKER',
                format('CPT %s has invalid units of service (%s). Units must be >= 1.', v_proc.cpt_code, v_proc.units),
                'Correct procedure units to a positive integer before claim generation.'
            );
            v_blockers := v_blockers + 1;
        END IF;

        -- MOD-001: Mutual exclusion modifier check
        IF 'RT' = ANY(v_proc.modifiers) AND 'LT' = ANY(v_proc.modifiers) THEN
            INSERT INTO public.charge_completeness_findings (
                run_id, facility_id, surgery_id, procedure_line_id, rule_id, rule_category, severity, finding_message, resolution_guidance
            ) VALUES (
                v_run_id, v_facility_id, p_surgery_id, v_proc.id, 'MOD-001', 'modifier', 'BLOCKER',
                format('CPT %s contains mutually exclusive modifiers RT and LT on the same line.', v_proc.cpt_code),
                'Remove either RT or LT or submit as bilateral modifier 50 if applicable.'
            );
            v_blockers := v_blockers + 1;
        END IF;

        -- MOD-002: Paired anatomical structure missing laterality modifier
        IF v_proc.laterality_applicable = true AND NOT ('RT' = ANY(v_proc.modifiers) OR 'LT' = ANY(v_proc.modifiers) OR '50' = ANY(v_proc.modifiers)) THEN
            INSERT INTO public.charge_completeness_findings (
                run_id, facility_id, surgery_id, procedure_line_id, rule_id, rule_category, severity, finding_message, resolution_guidance
            ) VALUES (
                v_run_id, v_facility_id, p_surgery_id, v_proc.id, 'MOD-002', 'modifier', 'BLOCKER',
                format('CPT %s represents a paired anatomical structure but is missing a laterality modifier (RT, LT, or 50).', v_proc.cpt_code),
                'Append modifier RT, LT, or 50 based on operative report findings.'
            );
            v_blockers := v_blockers + 1;
        END IF;

        -- PRIC-001: Zero reimbursement on non-charity care
        IF COALESCE(v_surg.is_probono, false) = false AND (v_proc.line_expected_reimbursement IS NULL OR v_proc.line_expected_reimbursement <= 0) THEN
            INSERT INTO public.charge_completeness_findings (
                run_id, facility_id, surgery_id, procedure_line_id, rule_id, rule_category, severity, finding_message, resolution_guidance
            ) VALUES (
                v_run_id, v_facility_id, p_surgery_id, v_proc.id, 'PRIC-001', 'pricing', 'BLOCKER',
                format('CPT %s has $0.00 expected reimbursement on a non-pro-bono encounter.', v_proc.cpt_code),
                'Verify contracted payer fee schedule or facility baseline pricing.'
            );
            v_blockers := v_blockers + 1;
        END IF;
    END LOOP;

    -- PROC-001: Zero procedure lines on non-cancelled encounter
    IF v_total_lines = 0 AND COALESCE(v_surg.status, '') != 'Cancelled' THEN
        INSERT INTO public.charge_completeness_findings (
            run_id, facility_id, surgery_id, procedure_line_id, rule_id, rule_category, severity, finding_message, resolution_guidance
        ) VALUES (
            v_run_id, v_facility_id, p_surgery_id, NULL, 'PROC-001', 'procedure', 'BLOCKER',
            'Encounter contains zero procedure lines. Non-cancelled surgical encounters require at least one CPT code.',
            'Assign appropriate CPT codes from the operative report before submitting for pre-bill review.'
        );
        v_blockers := v_blockers + 1;
    END IF;

    -- PROC-002: Missing Primary Procedure Designation
    IF v_total_lines > 0 AND v_primary_count = 0 THEN
        INSERT INTO public.charge_completeness_findings (
            run_id, facility_id, surgery_id, procedure_line_id, rule_id, rule_category, severity, finding_message, resolution_guidance
        ) VALUES (
            v_run_id, v_facility_id, p_surgery_id, NULL, 'PROC-002', 'procedure', 'BLOCKER',
            'No procedure line is designated as the primary procedure (is_primary = true).',
            'Designate exactly one primary procedure rank to govern allowable reimbursement sequencing.'
        );
        v_blockers := v_blockers + 1;
    END IF;

    -- PROC-003: Multiple Primary Procedures
    IF v_total_lines > 1 AND v_primary_count > 1 THEN
        INSERT INTO public.charge_completeness_findings (
            run_id, facility_id, surgery_id, procedure_line_id, rule_id, rule_category, severity, finding_message, resolution_guidance
        ) VALUES (
            v_run_id, v_facility_id, p_surgery_id, NULL, 'PROC-003', 'procedure', 'ERROR',
            format('Encounter has %s procedures marked as primary. Only one primary procedure is allowed.', v_primary_count),
            'Designate a single highest-valued primary procedure and mark secondary procedures accordingly.'
        );
        v_blockers := v_blockers + 1;
    END IF;

    -- 4. Device and Implant Completeness Checks
    SELECT COUNT(*) INTO v_device_count FROM public.case_devices WHERE surgery_id = p_surgery_id;

    -- DEV-001: Missing Device on Device-Intensive Procedure
    IF v_has_device_intensive_cpt = true AND v_device_count = 0 AND COALESCE(v_surg.implants_cost, 0) = 0 THEN
        INSERT INTO public.charge_completeness_findings (
            run_id, facility_id, surgery_id, procedure_line_id, rule_id, rule_category, severity, finding_message, resolution_guidance
        ) VALUES (
            v_run_id, v_facility_id, p_surgery_id, NULL, 'DEV-001', 'device', 'BLOCKER',
            format('Encounter includes device-intensive CPT (%s), but zero implant/device line items or costs are recorded.', array_to_string(v_device_intensive_codes, ', ')),
            'Record the implanted device item, manufacturer, model/serial, and HCPCS C-code.'
        );
        v_blockers := v_blockers + 1;
    END IF;

    -- DEV-002: Implant Cost Recorded Without Device Line Item
    IF COALESCE(v_surg.implants_cost, 0) > 0 AND v_device_count = 0 THEN
        INSERT INTO public.charge_completeness_findings (
            run_id, facility_id, surgery_id, procedure_line_id, rule_id, rule_category, severity, finding_message, resolution_guidance
        ) VALUES (
            v_run_id, v_facility_id, p_surgery_id, NULL, 'DEV-002', 'device', 'WARNING',
            format('Surgery records implants_cost ($%s), but no itemized device line items exist in case_devices.', v_surg.implants_cost),
            'Itemize implanted items in case_devices to ensure accurate clearinghouse device attribution.'
        );
        v_warnings := v_warnings + 1;
    END IF;

    -- 5. Documentation Checks
    IF v_surg.status = 'Completed' AND (v_surg.post_op_diagnosis IS NULL OR LENGTH(TRIM(v_surg.post_op_diagnosis)) = 0) THEN
        INSERT INTO public.charge_completeness_findings (
            run_id, facility_id, surgery_id, procedure_line_id, rule_id, rule_category, severity, finding_message, resolution_guidance
        ) VALUES (
            v_run_id, v_facility_id, p_surgery_id, NULL, 'DOC-001', 'documentation', 'BLOCKER',
            'Completed surgical encounter is missing a recorded post-operative diagnosis.',
            'Document post-operative diagnosis before releasing case to pre-bill.'
        );
        v_blockers := v_blockers + 1;
    END IF;

    -- 6. Update Run Record Status
    IF v_blockers > 0 THEN
        v_overall_status := 'blocked';
        v_is_cleared := false;
    ELSIF v_warnings > 0 THEN
        v_overall_status := 'warnings';
        v_is_cleared := true;
    ELSE
        v_overall_status := 'clean';
        v_is_cleared := true;
    END IF;

    UPDATE public.charge_completeness_runs
    SET overall_status = v_overall_status,
        total_findings = (v_blockers + v_warnings),
        blocker_count = v_blockers,
        warning_count = v_warnings,
        is_cleared = v_is_cleared,
        cleared_at = CASE WHEN v_is_cleared THEN NOW() ELSE NULL END
    WHERE id = v_run_id;

    RETURN jsonb_build_object(
        'success', true,
        'run_id', v_run_id,
        'surgery_id', p_surgery_id,
        'overall_status', v_overall_status,
        'total_findings', (v_blockers + v_warnings),
        'blocker_count', v_blockers,
        'warning_count', v_warnings,
        'is_cleared', v_is_cleared
    );
END;
$$;

-- ==============================================================================
-- 6. ROW-LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.case_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charge_completeness_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charge_completeness_findings ENABLE ROW LEVEL SECURITY;

-- case_devices RLS
CREATE POLICY "case_devices_facility_isolation" ON public.case_devices
    FOR ALL
    TO authenticated
    USING (
        facility_id = COALESCE(
            NULLIF(current_setting('app.current_facility_id', true), '')::UUID,
            '00000000-0000-0000-0000-000000000002'::UUID
        )
    )
    WITH CHECK (
        facility_id = COALESCE(
            NULLIF(current_setting('app.current_facility_id', true), '')::UUID,
            '00000000-0000-0000-0000-000000000002'::UUID
        )
    );

-- charge_completeness_runs RLS
CREATE POLICY "charge_completeness_runs_facility_isolation" ON public.charge_completeness_runs
    FOR ALL
    TO authenticated
    USING (
        facility_id = COALESCE(
            NULLIF(current_setting('app.current_facility_id', true), '')::UUID,
            '00000000-0000-0000-0000-000000000002'::UUID
        )
    )
    WITH CHECK (
        facility_id = COALESCE(
            NULLIF(current_setting('app.current_facility_id', true), '')::UUID,
            '00000000-0000-0000-0000-000000000002'::UUID
        )
    );

-- charge_completeness_findings RLS
CREATE POLICY "charge_completeness_findings_facility_isolation" ON public.charge_completeness_findings
    FOR ALL
    TO authenticated
    USING (
        facility_id = COALESCE(
            NULLIF(current_setting('app.current_facility_id', true), '')::UUID,
            '00000000-0000-0000-0000-000000000002'::UUID
        )
    )
    WITH CHECK (
        facility_id = COALESCE(
            NULLIF(current_setting('app.current_facility_id', true), '')::UUID,
            '00000000-0000-0000-0000-000000000002'::UUID
        )
    );

COMMIT;
