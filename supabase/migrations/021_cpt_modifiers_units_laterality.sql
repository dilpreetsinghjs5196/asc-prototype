-- ==============================================================================
-- MIGRATION 021: CPT MODIFIERS, UNITS OF SERVICE & LATERALITY DETERMINISTIC RULES (PHASE 44)
-- ==============================================================================
-- Description: Establishes production-grade billing validation and modifier governance:
--              1. Creates public.cpt_modifier_master catalog.
--              2. Creates public.cpt_modifier_conflicts pairwise incompatibility matrix.
--              3. Creates public.cpt_billing_rules (BSI, MUE, MAI, and allowed modifiers).
--              4. Expands public.surgery_procedures with validation tracking & override columns.
--              5. Deploys authoritative fn_validate_procedure_line and fn_validate_case_procedures.
--              6. Repairs calculate_surgery_financials to eliminate 300% bilateral doubling defect.
--              7. Enforces RLS policies across all new reference tables.
-- Author: Antigravity Agentic Platform
-- Date: 2026-10-22
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. CANONICAL CPT MODIFIER MASTER CATALOG
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.cpt_modifier_master (
    code VARCHAR(5) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(30) NOT NULL CHECK (category IN ('anatomical', 'bilateral', 'distinct_service', 'discontinued', 'repeat', 'staged', 'informational')),
    description TEXT,
    is_anatomical BOOLEAN NOT NULL DEFAULT false,
    is_payment_affecting BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cmm_cat ON public.cpt_modifier_master(category);
CREATE INDEX IF NOT EXISTS idx_cmm_active ON public.cpt_modifier_master(is_active);

-- Seed Canonical ASC Modifiers
INSERT INTO public.cpt_modifier_master (code, name, category, description, is_anatomical, is_payment_affecting)
VALUES
    ('50', 'Bilateral Procedure', 'bilateral', 'Bilateral procedure performed in same operative session (150% allowable)', false, true),
    ('RT', 'Right Side', 'anatomical', 'Right hand, foot, eye, ear, or paired musculoskeletal structure', true, false),
    ('LT', 'Left Side', 'anatomical', 'Left hand, foot, eye, ear, or paired musculoskeletal structure', true, false),
    ('59', 'Distinct Procedural Service', 'distinct_service', 'Procedure independent from other services performed on same day', false, true),
    ('XE', 'Separate Encounter', 'distinct_service', 'Service performed during a distinct operative encounter on same day', false, true),
    ('XS', 'Separate Structure', 'distinct_service', 'Service performed on a separate organ, incision, or joint structure', false, true),
    ('XP', 'Separate Practitioner', 'distinct_service', 'Service performed by a different performing physician', false, false),
    ('XU', 'Unusual Non-Overlapping Service', 'distinct_service', 'Service that does not overlap usual components of main service', false, true),
    ('51', 'Multiple Procedures', 'informational', 'Multiple procedures performed; informational in Medicare ASC', false, false),
    ('52', 'Reduced Services', 'discontinued', 'Procedural service reduced or eliminated at physicians discretion', false, true),
    ('58', 'Staged Procedure', 'staged', 'Staged or related procedure during postoperative period', false, true),
    ('73', 'Discontinued Prior to Anesthesia', 'discontinued', 'Discontinued prior to anesthesia administration (50% facility fee)', false, true),
    ('74', 'Discontinued After Anesthesia', 'discontinued', 'Discontinued after anesthesia administration (100% facility fee)', false, true),
    ('76', 'Repeat Procedure by Same Physician', 'repeat', 'Repeat procedure on same day by same performing provider', false, true),
    ('77', 'Repeat Procedure by Another Physician', 'repeat', 'Repeat procedure on same day by different performing provider', false, true),
    ('78', 'Unplanned Return to OR', 'staged', 'Unplanned return to OR for related procedure during post-op period', false, true),
    ('79', 'Unrelated Procedure Post-Op', 'staged', 'Unrelated procedure by same physician during post-op period', false, true)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    is_anatomical = EXCLUDED.is_anatomical,
    is_payment_affecting = EXCLUDED.is_payment_affecting,
    is_active = EXCLUDED.is_active;

-- ==============================================================================
-- 2. PAIRWISE INCOMPATIBLE MODIFIER CONFLICTS MATRIX
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.cpt_modifier_conflicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    modifier_a VARCHAR(5) NOT NULL REFERENCES public.cpt_modifier_master(code) ON DELETE CASCADE,
    modifier_b VARCHAR(5) NOT NULL REFERENCES public.cpt_modifier_master(code) ON DELETE CASCADE,
    conflict_type VARCHAR(30) NOT NULL CHECK (conflict_type IN ('mutually_exclusive', 'redundant', 'contradictory')),
    conflict_message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_modifier_conflict_pair UNIQUE (modifier_a, modifier_b),
    CONSTRAINT chk_diff_modifiers CHECK (modifier_a <> modifier_b)
);

CREATE INDEX IF NOT EXISTS idx_cmc_pair ON public.cpt_modifier_conflicts(modifier_a, modifier_b);

-- Seed Incompatible Modifier Pairs
INSERT INTO public.cpt_modifier_conflicts (modifier_a, modifier_b, conflict_type, conflict_message)
VALUES
    ('RT', 'LT', 'mutually_exclusive', 'Modifiers RT and LT cannot appear on the same procedure line.'),
    ('50', 'RT', 'contradictory', 'Modifier 50 represents bilateral service and cannot combine with unilateral modifier RT.'),
    ('50', 'LT', 'contradictory', 'Modifier 50 represents bilateral service and cannot combine with unilateral modifier LT.'),
    ('73', '74', 'mutually_exclusive', 'Modifiers 73 and 74 are mutually exclusive. A procedure cannot be discontinued both prior to (73) and after (74) anesthesia.'),
    ('73', '50', 'contradictory', 'Modifier 73 cannot be billed with bilateral modifier 50.'),
    ('76', '77', 'mutually_exclusive', 'Modifiers 76 and 77 are mutually exclusive. Repeat procedure cannot be reported simultaneously by same (76) and other (77) physician.'),
    ('59', 'XE', 'redundant', 'Modifier 59 is redundant and prohibited when specific subset XE is reported.'),
    ('59', 'XS', 'redundant', 'Modifier 59 is redundant and prohibited when specific subset XS is reported.'),
    ('59', 'XP', 'redundant', 'Modifier 59 is redundant and prohibited when specific subset XP is reported.'),
    ('59', 'XU', 'redundant', 'Modifier 59 is redundant and prohibited when specific subset XU is reported.')
ON CONFLICT (modifier_a, modifier_b) DO UPDATE SET
    conflict_type = EXCLUDED.conflict_type,
    conflict_message = EXCLUDED.conflict_message;

-- ==============================================================================
-- 3. CPT BILLING RULES (BSI, MUE, MAI, MPPR)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.cpt_billing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cpt_master_id UUID REFERENCES public.cpt_master(id) ON DELETE CASCADE,
    cpt_code VARCHAR(10) NOT NULL,
    bilateral_indicator SMALLINT NOT NULL DEFAULT 0 
        CHECK (bilateral_indicator IN (0, 1, 2, 3, 9)),
    mue_value INTEGER NOT NULL DEFAULT 1 
        CHECK (mue_value >= 1 AND mue_value <= 99),
    mue_adjudication_indicator SMALLINT NOT NULL DEFAULT 1 
        CHECK (mue_adjudication_indicator IN (1, 2, 3)), -- 1: Line, 2: Absolute DOS, 3: Clinical DOS
    is_mppr_exempt BOOLEAN NOT NULL DEFAULT false,
    allowed_modifiers TEXT[] NOT NULL DEFAULT '{}',
    effective_date DATE NOT NULL DEFAULT '2020-01-01',
    termination_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_cpt_billing_rule_version UNIQUE (cpt_code, effective_date),
    CONSTRAINT chk_billing_rule_dates CHECK (termination_date IS NULL OR termination_date >= effective_date)
);

CREATE INDEX IF NOT EXISTS idx_cbr_code ON public.cpt_billing_rules(cpt_code);
CREATE INDEX IF NOT EXISTS idx_cbr_dates ON public.cpt_billing_rules(effective_date, termination_date);
CREATE INDEX IF NOT EXISTS idx_cbr_bsi ON public.cpt_billing_rules(bilateral_indicator);

-- Seed Authoritative Billing Rules for Core ASC Procedures
INSERT INTO public.cpt_billing_rules (cpt_code, bilateral_indicator, mue_value, mue_adjudication_indicator, is_mppr_exempt, allowed_modifiers)
VALUES
    ('29881', 1, 1, 3, false, ARRAY['50', 'RT', 'LT', '59', 'XS', '76', '78']),
    ('29877', 1, 1, 3, false, ARRAY['50', 'RT', 'LT', '59', 'XS', '76', '78']),
    ('66984', 1, 1, 2, false, ARRAY['50', 'RT', 'LT', '73', '74', '76']),
    ('45378', 0, 1, 2, false, ARRAY['52', '59', '73', '74']),
    ('45380', 0, 1, 2, false, ARRAY['52', '59', '73', '74']),
    ('58940', 2, 1, 2, false, ARRAY['52', '58', '73', '74']),
    ('64721', 1, 1, 3, false, ARRAY['50', 'RT', 'LT', '59', 'XS', '76']),
    ('64415', 1, 1, 3, true,  ARRAY['50', 'RT', 'LT', '59', 'XS'])
ON CONFLICT (cpt_code, effective_date) DO UPDATE SET
    bilateral_indicator = EXCLUDED.bilateral_indicator,
    mue_value = EXCLUDED.mue_value,
    mue_adjudication_indicator = EXCLUDED.mue_adjudication_indicator,
    is_mppr_exempt = EXCLUDED.is_mppr_exempt,
    allowed_modifiers = EXCLUDED.allowed_modifiers,
    updated_at = NOW();

-- Backfill CPT Master ID references
UPDATE public.cpt_billing_rules r
SET cpt_master_id = m.id
FROM public.cpt_master m
WHERE m.code = r.cpt_code AND r.cpt_master_id IS NULL;

-- Backfill default billing rules for all remaining cpt_master entries
INSERT INTO public.cpt_billing_rules (cpt_master_id, cpt_code, bilateral_indicator, mue_value, mue_adjudication_indicator, is_mppr_exempt, allowed_modifiers)
SELECT 
    m.id,
    m.code,
    CASE WHEN bp.laterality_applicable = true THEN 1 ELSE 0 END,
    1,
    1,
    false,
    CASE WHEN bp.laterality_applicable = true THEN ARRAY['50', 'RT', 'LT', '59'] ELSE ARRAY['59'] END
FROM public.cpt_master m
LEFT JOIN public.cpt_clinical_mappings ccm ON ccm.cpt_master_id = m.id AND ccm.is_primary = true
LEFT JOIN public.body_parts bp ON bp.id = ccm.body_part_id
WHERE NOT EXISTS (
    SELECT 1 FROM public.cpt_billing_rules r WHERE r.cpt_code = m.code
)
ON CONFLICT (cpt_code, effective_date) DO NOTHING;

-- ==============================================================================
-- 4. EXPAND PUBLIC.SURGERY_PROCEDURES SCHEMA
-- ==============================================================================

ALTER TABLE public.surgery_procedures
    ADD COLUMN IF NOT EXISTS validation_status VARCHAR(20) NOT NULL DEFAULT 'unvalidated',
    ADD COLUMN IF NOT EXISTS validation_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS validation_timestamp TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS override_reason TEXT,
    ADD COLUMN IF NOT EXISTS override_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS override_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_surgery_proc_val_status' AND conrelid = 'public.surgery_procedures'::regclass
    ) THEN
        ALTER TABLE public.surgery_procedures
            ADD CONSTRAINT chk_surgery_proc_val_status CHECK (
                validation_status IN ('unvalidated', 'valid', 'warning', 'error')
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_surgery_proc_validation ON public.surgery_procedures(facility_id, validation_status);

-- ==============================================================================
-- 5. AUTHORITATIVE PROCEDURE LINE VALIDATION STORED PROCEDURE
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_validate_procedure_line(
    p_surgery_id BIGINT,
    p_cpt_code VARCHAR(10),
    p_units INTEGER,
    p_modifiers TEXT[],
    p_laterality VARCHAR(20),
    p_line_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_surg RECORD;
    v_dos DATE;
    v_body_part RECORD;
    v_billing_rule RECORD;
    v_errors JSONB := '[]'::jsonb;
    v_warnings JSONB := '[]'::jsonb;
    v_conflict RECORD;
    v_dup_count INTEGER;
BEGIN
    -- 1. Resolve Surgery and DOS
    SELECT * INTO v_surg FROM public.surgeries WHERE id = p_surgery_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'is_valid', false,
            'status', 'error',
            'errors', jsonb_build_array(jsonb_build_object('code', 'CASE-404', 'severity', 'error', 'message', 'Encounter not found')),
            'warnings', '[]'::jsonb
        );
    END IF;
    v_dos := COALESCE(v_surg.date::DATE, CURRENT_DATE);

    -- 2. Resolve Anatomical Laterality Rules via cpt_clinical_mappings
    SELECT bp.code, bp.name, bp.laterality_applicable
    INTO v_body_part
    FROM public.cpt_master cm
    JOIN public.cpt_clinical_mappings ccm ON ccm.cpt_master_id = cm.id
    JOIN public.body_parts bp ON bp.id = ccm.body_part_id
    WHERE cm.code = p_cpt_code
      AND ccm.is_primary = true
    LIMIT 1;

    IF FOUND THEN
        -- LAT-001: Midline structure marked with laterality
        IF v_body_part.laterality_applicable = false AND p_laterality IN ('LEFT', 'RIGHT', 'BILATERAL') THEN
            v_errors := v_errors || jsonb_build_object(
                'code', 'LAT-001',
                'severity', 'error',
                'message', format('Laterality is not applicable to anatomical region "%s". Must be NOT_APPLICABLE.', v_body_part.name)
            );
        END IF;

        -- LAT-002: Paired structure marked NOT_APPLICABLE
        IF v_body_part.laterality_applicable = true AND p_laterality = 'NOT_APPLICABLE' THEN
            v_errors := v_errors || jsonb_build_object(
                'code', 'LAT-002',
                'severity', 'error',
                'message', format('Paired anatomical region "%s" requires laterality (LEFT, RIGHT, or BILATERAL).', v_body_part.name)
            );
        END IF;
    END IF;

    -- Laterality vs Modifier alignment
    IF 'RT' = ANY(p_modifiers) AND p_laterality IN ('LEFT', 'BILATERAL') THEN
        v_errors := v_errors || jsonb_build_object('code', 'LAT-004', 'severity', 'error', 'message', 'Modifier RT contradicts assigned laterality.');
    END IF;
    IF 'LT' = ANY(p_modifiers) AND p_laterality IN ('RIGHT', 'BILATERAL') THEN
        v_errors := v_errors || jsonb_build_object('code', 'LAT-005', 'severity', 'error', 'message', 'Modifier LT contradicts assigned laterality.');
    END IF;
    IF '50' = ANY(p_modifiers) AND p_laterality != 'BILATERAL' THEN
        v_errors := v_errors || jsonb_build_object('code', 'LAT-006', 'severity', 'error', 'message', 'Modifier 50 requires laterality to be BILATERAL.');
    END IF;

    -- 3. Resolve CPT Billing Rules (BSI & MUE)
    SELECT * INTO v_billing_rule
    FROM public.cpt_billing_rules
    WHERE cpt_code = p_cpt_code
      AND effective_date <= v_dos
      AND (termination_date IS NULL OR termination_date >= v_dos)
    ORDER BY effective_date DESC
    LIMIT 1;

    IF FOUND THEN
        -- BILAT-001: Doubled units with modifier 50
        IF '50' = ANY(p_modifiers) AND p_units > 1 THEN
            v_errors := v_errors || jsonb_build_object(
                'code', 'BILAT-001',
                'severity', 'error',
                'message', 'Modifier 50 requires units = 1. Doubled units with modifier 50 cause improper 300% billing inflation.'
            );
        END IF;

        -- BILAT-002: Inherently bilateral code with modifier 50
        IF v_billing_rule.bilateral_indicator = 2 AND '50' = ANY(p_modifiers) THEN
            v_errors := v_errors || jsonb_build_object(
                'code', 'BILAT-002',
                'severity', 'error',
                'message', format('CPT code %s is inherently bilateral. Modifier 50 is prohibited.', p_cpt_code)
            );
        END IF;

        -- BILAT-003: Non-bilateral code with modifier 50
        IF v_billing_rule.bilateral_indicator IN (0, 9) AND '50' = ANY(p_modifiers) THEN
            v_errors := v_errors || jsonb_build_object(
                'code', 'BILAT-003',
                'severity', 'error',
                'message', format('Bilateral concept does not apply to CPT code %s. Modifier 50 is invalid.', p_cpt_code)
            );
        END IF;

        -- MUE Checks
        IF p_units > v_billing_rule.mue_value THEN
            IF v_billing_rule.mue_adjudication_indicator = 2 THEN
                -- Absolute policy limit
                v_errors := v_errors || jsonb_build_object(
                    'code', 'MUE-001',
                    'severity', 'error',
                    'message', format('Units (%s) exceed absolute CMS policy cap (%s) for CPT %s.', p_units, v_billing_rule.mue_value, p_cpt_code)
                );
            ELSE
                -- Clinical review warning
                v_warnings := v_warnings || jsonb_build_object(
                    'code', 'MUE-002',
                    'severity', 'warning',
                    'message', format('Units (%s) exceed standard MUE threshold (%s) for CPT %s. Requires clinical documentation.', p_units, v_billing_rule.mue_value, p_cpt_code)
                );
            END IF;
        END IF;
    END IF;

    -- 4. Evaluate Modifier Conflicts
    IF array_length(p_modifiers, 1) > 4 THEN
        v_errors := v_errors || jsonb_build_object('code', 'MOD-006', 'severity', 'error', 'message', 'Exceeds maximum of 4 modifiers per procedure line.');
    END IF;

    IF array_length(p_modifiers, 1) > 1 THEN
        FOR v_conflict IN 
            SELECT * FROM public.cpt_modifier_conflicts
            WHERE modifier_a = ANY(p_modifiers) AND modifier_b = ANY(p_modifiers)
        LOOP
            v_errors := v_errors || jsonb_build_object(
                'code', 'MOD-CONFLICT',
                'severity', 'error',
                'message', v_conflict.conflict_message
            );
        END LOOP;
    END IF;

    -- 5. Duplicate Procedure Line Check
    SELECT COUNT(*) INTO v_dup_count
    FROM public.surgery_procedures sp
    JOIN public.cpt_codes cc ON cc.id = sp.cpt_code_id
    WHERE sp.surgery_id = p_surgery_id
      AND cc.code = p_cpt_code
      AND (p_line_id IS NULL OR sp.id != p_line_id);

    IF v_dup_count > 0 AND NOT ('76' = ANY(p_modifiers) OR '77' = ANY(p_modifiers) OR 'RT' = ANY(p_modifiers) OR 'LT' = ANY(p_modifiers)) THEN
        v_errors := v_errors || jsonb_build_object(
            'code', 'DUP-001',
            'severity', 'error',
            'message', format('Duplicate CPT code %s on same encounter requires repeat modifier (76/77) or distinct laterality (RT/LT).', p_cpt_code)
        );
    END IF;

    -- Return JSONB summary
    IF jsonb_array_length(v_errors) > 0 THEN
        RETURN jsonb_build_object(
            'is_valid', false,
            'status', 'error',
            'errors', v_errors,
            'warnings', v_warnings
        );
    ELSIF jsonb_array_length(v_warnings) > 0 THEN
        RETURN jsonb_build_object(
            'is_valid', true,
            'status', 'warning',
            'errors', '[]'::jsonb,
            'warnings', v_warnings
        );
    ELSE
        RETURN jsonb_build_object(
            'is_valid', true,
            'status', 'valid',
            'errors', '[]'::jsonb,
            'warnings', '[]'::jsonb
        );
    END IF;
END;
$$;

-- ==============================================================================
-- 6. ENCOUNTER PROCEDURE LINES BATCH VALIDATION STORED PROCEDURE
-- ==============================================================================

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

-- ==============================================================================
-- 7. REPAIR CALCULATE_SURGERY_FINANCIALS (ANTI-INFLATION 150% BILATERAL RULE)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.calculate_surgery_financials(
    p_surgery_id BIGINT,
    p_freeze BOOLEAN DEFAULT false
)
RETURNS JSONB AS $$
DECLARE
    v_surg RECORD;
    v_proc RECORD;
    v_fac RECORD;
    v_total_revenue NUMERIC(12, 2) := 0.00;
    v_duration INTEGER := 60;
    v_turnover INTEGER := 15;
    v_total_minutes INTEGER := 75;
    v_room_cost NUMERIC(12, 2) := 0.00;
    v_labor_cost NUMERIC(12, 2) := 0.00;
    v_supplies_cost NUMERIC(12, 2) := 0.00;
    v_implants_cost NUMERIC(12, 2) := 0.00;
    v_meds_cost NUMERIC(12, 2) := 0.00;
    v_total_cost NUMERIC(12, 2) := 0.00;
    v_net_margin NUMERIC(12, 2) := 0.00;
    v_margin_per_min NUMERIC(12, 2) := 0.00;
    v_eligible_rank INTEGER := 1;
    v_proc_rate NUMERIC(12, 2);
    v_units INTEGER := 1;
    v_is_bilateral BOOLEAN := false;
    v_is_mppr_enabled BOOLEAN := false;
BEGIN
    SELECT * INTO v_surg FROM public.surgeries WHERE id = p_surgery_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Surgery case % not found', p_surgery_id;
    END IF;

    SELECT * INTO v_fac FROM public.facilities WHERE id = v_surg.facility_id;
    v_is_mppr_enabled := COALESCE(v_fac.apply_medicare_mppr, false);

    -- Duration and turnover resolution
    v_duration := COALESCE(v_surg.actual_duration_minutes, v_surg.duration_minutes, v_surg.scheduled_duration_minutes, 60);
    v_turnover := COALESCE(v_surg.turnover_time, v_surg.scheduled_turnover_minutes, 15);
    v_total_minutes := v_duration + v_turnover;

    -- Piecewise OR Room Cost Curve
    IF v_total_minutes <= 30 THEN
        v_room_cost := 300.00;
    ELSIF v_total_minutes <= 60 THEN
        v_room_cost := 300.00 + ((v_total_minutes - 30) * 8.50);
    ELSIF v_total_minutes <= 120 THEN
        v_room_cost := 555.00 + ((v_total_minutes - 60) * 7.00);
    ELSE
        v_room_cost := 975.00 + ((v_total_minutes - 120) * 5.50);
    END IF;

    -- Piecewise Labor Cost Curve
    IF v_duration <= 30 THEN
        v_labor_cost := 400.00;
    ELSIF v_duration <= 60 THEN
        v_labor_cost := 400.00 + ((v_duration - 30) * 12.00);
    ELSIF v_duration <= 120 THEN
        v_labor_cost := 760.00 + ((v_duration - 60) * 10.00);
    ELSE
        v_labor_cost := 1360.00 + ((v_duration - 120) * 8.00);
    END IF;

    -- Supply costs
    v_supplies_cost := COALESCE(v_surg.supplies_cost, 0.00);
    v_implants_cost := COALESCE(v_surg.implants_cost, 0.00);
    v_meds_cost := COALESCE(v_surg.medications_cost, 0.00);

    -- Payment Model Revenue Calculation
    IF v_surg.payment_model = 'Pro_Bono' THEN
        v_total_revenue := 0.00;
        v_room_cost := 0.00;
        v_labor_cost := 0.00;
        v_supplies_cost := 0.00;
        v_implants_cost := 0.00;
        v_meds_cost := 0.00;
    ELSIF v_surg.payment_model = 'Cosmetic_Fixed' THEN
        v_total_revenue := COALESCE(v_surg.cosmetic_facility_fee, 0.00) + COALESCE(v_surg.cosmetic_anesthesia_fee, 0.00);
    ELSE
        -- Insurance / Standard: Iterate over normalized procedures if present
        IF EXISTS (SELECT 1 FROM public.surgery_procedures WHERE surgery_id = p_surgery_id) THEN
            FOR v_proc IN 
                SELECT sp.*, c.code AS cpt_code_str
                FROM public.surgery_procedures sp
                LEFT JOIN public.cpt_codes c ON sp.cpt_code_id = c.id
                WHERE sp.surgery_id = p_surgery_id
                ORDER BY sp.baseline_charge DESC, sp.sequence_rank ASC
            LOOP
                v_proc_rate := COALESCE(v_proc.contracted_reimbursement, v_proc.baseline_charge, 0.00);
                v_units := COALESCE(v_proc.units, 1);
                v_is_bilateral := ('50' = ANY(COALESCE(v_proc.modifiers, '{}')) OR v_proc.laterality = 'BILATERAL');

                -- Bilateral single-line 150% rule: applies strictly to 1 unit to prevent 300% billing inflation
                IF v_is_bilateral THEN
                    v_proc_rate := v_proc_rate * 1.50;
                    IF v_units > 1 THEN
                        v_units := 1; -- Enforce statutory single-line clamp on bilateral calculation
                    END IF;
                END IF;

                IF NOT v_is_mppr_enabled THEN
                    v_total_revenue := v_total_revenue + (v_proc_rate * v_units);
                ELSE
                    -- Add-on codes (+) exempt from reduction
                    IF v_proc.cpt_code_str LIKE '+%' THEN
                        v_total_revenue := v_total_revenue + (v_proc_rate * v_units);
                    ELSIF v_eligible_rank = 1 THEN
                        -- First unit receives 100%, additional units receive 50%
                        v_total_revenue := v_total_revenue + v_proc_rate + (v_proc_rate * 0.50 * (v_units - 1));
                        v_eligible_rank := v_eligible_rank + 1;
                    ELSE
                        v_total_revenue := v_total_revenue + (v_proc_rate * 0.50 * v_units);
                        v_eligible_rank := v_eligible_rank + 1;
                    END IF;
                END IF;
            END LOOP;
        ELSE
            v_total_revenue := COALESCE(v_surg.expected_reimbursement, 0.00);
        END IF;
    END IF;

    -- Net Margin & Cost Totals
    v_total_cost := v_room_cost + v_labor_cost + v_supplies_cost + v_implants_cost + v_meds_cost;
    v_net_margin := (v_total_revenue - COALESCE(v_surg.write_off, 0.00)) - v_total_cost;
    
    IF v_duration > 0 THEN
        v_margin_per_min := ROUND((v_net_margin / v_duration)::NUMERIC, 2);
    ELSE
        v_margin_per_min := 0.00;
    END IF;

    -- Freeze snapshot if requested or case is Completed/Billed
    IF p_freeze = true OR v_surg.status IN ('Completed', 'Billed') THEN
        INSERT INTO public.surgery_financial_snapshots (
            surgery_id,
            facility_id,
            gross_revenue,
            expected_reimbursement,
            room_cost,
            labor_cost,
            supplies_cost,
            implants_cost,
            medications_cost,
            total_cost,
            net_margin,
            margin_per_minute,
            snapshot_reason,
            frozen_by
        ) VALUES (
            p_surgery_id,
            v_surg.facility_id,
            v_total_revenue,
            v_total_revenue,
            v_room_cost,
            v_labor_cost,
            v_supplies_cost,
            v_implants_cost,
            v_meds_cost,
            v_total_cost,
            v_net_margin,
            v_margin_per_min,
            CASE WHEN p_freeze = true THEN 'MANUAL_FREEZE' ELSE 'AUTO_STATUS_CHANGE' END,
            auth.uid()
        )
        ON CONFLICT (surgery_id) DO UPDATE SET
            gross_revenue = EXCLUDED.gross_revenue,
            expected_reimbursement = EXCLUDED.expected_reimbursement,
            total_cost = EXCLUDED.total_cost,
            net_margin = EXCLUDED.net_margin,
            margin_per_minute = EXCLUDED.margin_per_minute,
            created_at = NOW();
    END IF;

    RETURN jsonb_build_object(
        'surgery_id', p_surgery_id,
        'total_revenue', v_total_revenue,
        'total_cost', v_total_cost,
        'net_margin', v_net_margin,
        'margin_per_minute', v_margin_per_min,
        'is_mppr_applied', v_is_mppr_enabled
    );
END;
$$;

-- ==============================================================================
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.cpt_modifier_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpt_modifier_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpt_billing_rules ENABLE ROW LEVEL SECURITY;

-- Read policies for authenticated and anon users
CREATE POLICY rls_cmm_select ON public.cpt_modifier_master
    FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY rls_cmc_select ON public.cpt_modifier_conflicts
    FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY rls_cbr_select ON public.cpt_billing_rules
    FOR SELECT TO authenticated, anon USING (true);

-- Super admin write policies
CREATE POLICY rls_cmm_all ON public.cpt_modifier_master
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.facility_memberships fm
            WHERE fm.user_id = auth.uid() AND fm.role = 'super_admin' AND fm.is_active = true
        ) OR (auth.jwt()->>'role') = 'service_role'
    );

CREATE POLICY rls_cmc_all ON public.cpt_modifier_conflicts
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.facility_memberships fm
            WHERE fm.user_id = auth.uid() AND fm.role = 'super_admin' AND fm.is_active = true
        ) OR (auth.jwt()->>'role') = 'service_role'
    );

CREATE POLICY rls_cbr_all ON public.cpt_billing_rules
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.facility_memberships fm
            WHERE fm.user_id = auth.uid() AND fm.role IN ('super_admin', 'org_admin') AND fm.is_active = true
        ) OR (auth.jwt()->>'role') = 'service_role'
    );

COMMIT;
