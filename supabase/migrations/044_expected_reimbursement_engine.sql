-- =====================================================================
-- Migration: 044_expected_reimbursement_engine.sql
-- Description: Phase 68 — Expected Reimbursement Engine, Multi-Contract
--              Adjudication, Line-Level Explanation & Cryptographic Ledger
-- Author: ASCANALYST Multi-Agent Core Engine
-- Target Database: PostgreSQL 15+ / Supabase
-- Dependencies: 040 (MPPR), 041 (Payer Master), 042 (Contract Model), 043 (Rate Rules)
-- =====================================================================

BEGIN;

-- =====================================================================
-- 1. EXTENSIONS & PREREQUISITES
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- 2. REIMBURSEMENT CALCULATIONS HEADER TABLE (IMMUTABLE LEDGER)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.reimbursement_calculations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    surgery_id BIGINT REFERENCES public.surgeries(id) ON DELETE SET NULL,
    encounter_identifier VARCHAR(100) NOT NULL,
    patient_id BIGINT REFERENCES public.patients(id) ON DELETE SET NULL,
    payer_id UUID NOT NULL REFERENCES public.payer_master(id) ON DELETE RESTRICT,
    plan_id UUID REFERENCES public.payer_plans(id) ON DELETE SET NULL,
    contract_id UUID NOT NULL REFERENCES public.payer_contracts(id) ON DELETE RESTRICT,
    contract_version_id UUID NOT NULL REFERENCES public.payer_contract_versions(id) ON DELETE RESTRICT,
    
    -- Versioning & Recalculation Lineage
    calculation_sequence INTEGER NOT NULL DEFAULT 1 CHECK (calculation_sequence >= 1),
    is_latest_calculation BOOLEAN NOT NULL DEFAULT TRUE,
    superseded_by_calculation_id UUID REFERENCES public.reimbursement_calculations(id) ON DELETE SET NULL,
    recalculation_reason TEXT,
    
    -- Date Context
    date_of_service DATE NOT NULL,
    calculation_timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    
    -- Calculation State Machine
    calculation_status VARCHAR(50) NOT NULL CHECK (calculation_status IN (
        'CALCULATED',
        'PARTIALLY_CALCULATED',
        'CONTRACT_NOT_FOUND',
        'CONTRACT_VERSION_UNRESOLVED',
        'RATE_NOT_FOUND',
        'BASELINE_NOT_AVAILABLE',
        'REQUIRED_DATA_MISSING',
        'RULE_CONFLICT',
        'MANUAL_REVIEW_REQUIRED',
        'CALCULATION_FAILED',
        'STOP_LOSS_APPLIED'
    )),
    
    -- Financial Summary (Strict 12,2 Currency Precision)
    total_gross_billed NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_gross_billed >= 0),
    total_contract_allowable NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_contract_allowable >= 0),
    estimated_patient_responsibility NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (estimated_patient_responsibility >= 0),
    estimated_payer_reimbursement NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (estimated_payer_reimbursement >= 0),
    facility_acquisition_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (facility_acquisition_cost >= 0),
    expected_contribution_margin NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    contribution_margin_pct NUMERIC(6, 4),
    
    -- Category Allocations
    primary_procedure_allowable NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    secondary_procedure_allowable NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    implant_carve_out_allowable NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    other_services_allowable NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    
    -- Rules Applied & Integrity Hash
    mppr_rule_set_code VARCHAR(50),
    stop_loss_triggered BOOLEAN NOT NULL DEFAULT FALSE,
    calculation_engine_version VARCHAR(30) NOT NULL DEFAULT 'v2026.1-ph68',
    calculation_hash VARCHAR(64) NOT NULL,
    execution_context JSONB NOT NULL DEFAULT '{}'::jsonb,
    calculated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    
    CONSTRAINT uq_surgery_calculation_seq UNIQUE (surgery_id, calculation_sequence),
    CONSTRAINT chk_reimbursement_partition CHECK (
        ROUND(estimated_payer_reimbursement + estimated_patient_responsibility, 2) = total_contract_allowable
    )
);

CREATE INDEX IF NOT EXISTS idx_reimb_calc_facility ON public.reimbursement_calculations(facility_id);
CREATE INDEX IF NOT EXISTS idx_reimb_calc_surgery ON public.reimbursement_calculations(surgery_id);
CREATE INDEX IF NOT EXISTS idx_reimb_calc_dos ON public.reimbursement_calculations(date_of_service);
CREATE INDEX IF NOT EXISTS idx_reimb_calc_contract_ver ON public.reimbursement_calculations(contract_version_id);
CREATE INDEX IF NOT EXISTS idx_reimb_calc_status ON public.reimbursement_calculations(facility_id, calculation_status);
CREATE INDEX IF NOT EXISTS idx_reimb_calc_hash ON public.reimbursement_calculations(calculation_hash);

-- =====================================================================
-- 3. REIMBURSEMENT CALCULATION LINES TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.reimbursement_calculation_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calculation_id UUID NOT NULL REFERENCES public.reimbursement_calculations(id) ON DELETE CASCADE,
    line_number SMALLINT NOT NULL CHECK (line_number >= 1 AND line_number <= 100),
    surgery_procedure_id UUID REFERENCES public.surgery_procedures(id) ON DELETE SET NULL,
    case_device_id UUID REFERENCES public.case_devices(id) ON DELETE SET NULL,
    
    cpt_code VARCHAR(10) NOT NULL,
    procedure_description VARCHAR(255),
    modifiers TEXT[] NOT NULL DEFAULT '{}',
    units NUMERIC(6, 2) NOT NULL DEFAULT 1.00 CHECK (units > 0),
    line_gross_charge NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (line_gross_charge >= 0),
    
    -- Resolved Pricing Methodology
    applied_methodology VARCHAR(50) NOT NULL CHECK (applied_methodology IN (
        'COMMERCIAL_FEE_SCHEDULE',
        'PERCENT_OF_MEDICARE',
        'PERCENT_OF_BILLED_CHARGES',
        'CASE_RATE',
        'IMPLANT_CARVE_OUT',
        'NOT_COVERED',
        'STOP_LOSS_EXCEPTION'
    )),
    
    -- Intermediate Mathematics
    base_benchmark_rate NUMERIC(12, 2),
    contract_multiplier NUMERIC(6, 4),
    modifier_adjustment_factor NUMERIC(6, 4) NOT NULL DEFAULT 1.0000,
    mppr_rank SMALLINT NOT NULL DEFAULT 1,
    mppr_discount_pct NUMERIC(6, 4) NOT NULL DEFAULT 1.0000,
    j8_device_offset_deducted NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    
    -- Allowables & Partitioning
    line_contract_allowable NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (line_contract_allowable >= 0),
    line_patient_responsibility NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (line_patient_responsibility >= 0),
    line_payer_reimbursement NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (line_payer_reimbursement >= 0),
    
    -- Flags
    is_packaged BOOLEAN NOT NULL DEFAULT FALSE,
    is_carve_out BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Structured Trace
    calculation_trace TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    
    CONSTRAINT uq_reimb_line UNIQUE (calculation_id, line_number),
    CONSTRAINT chk_line_reimbursement_partition CHECK (
        ROUND(line_payer_reimbursement + line_patient_responsibility, 2) = line_contract_allowable
    )
);

CREATE INDEX IF NOT EXISTS idx_reimb_lines_calc ON public.reimbursement_calculation_lines(calculation_id);
CREATE INDEX IF NOT EXISTS idx_reimb_lines_cpt ON public.reimbursement_calculation_lines(cpt_code);

-- =====================================================================
-- 4. REIMBURSEMENT CALCULATION ADJUSTMENTS TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.reimbursement_calculation_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calculation_line_id UUID NOT NULL REFERENCES public.reimbursement_calculation_lines(id) ON DELETE CASCADE,
    adjustment_type VARCHAR(50) NOT NULL CHECK (adjustment_type IN (
        'MODIFIER_BILATERAL_50',
        'MODIFIER_DISCONTINUED_73',
        'MODIFIER_DISCONTINUED_74',
        'MPPR_SECONDARY_REDUCTION',
        'J8_DEVICE_OFFSET_DEDUCTION',
        'CASE_RATE_PACKAGING',
        'STOP_LOSS_SETTLEMENT',
        'PATIENT_COPAY_DEDUCTION',
        'PATIENT_COINSURANCE_DEDUCTION',
        'PATIENT_DEDUCTIBLE_DEDUCTION',
        'NON_COVERED_ELECTIVE_UPGRADE'
    )),
    adjustment_amount NUMERIC(12, 2) NOT NULL,
    factor_applied NUMERIC(6, 4),
    rationale TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_reimb_adj_line ON public.reimbursement_calculation_adjustments(calculation_line_id);

-- =====================================================================
-- 5. ROW LEVEL SECURITY (RLS) & ACCESS CONTROL
-- =====================================================================

ALTER TABLE public.reimbursement_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reimbursement_calculation_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reimbursement_calculation_adjustments ENABLE ROW LEVEL SECURITY;

-- Calculations Select Policy
DROP POLICY IF EXISTS reimb_calc_select_policy ON public.reimbursement_calculations;
CREATE POLICY reimb_calc_select_policy
ON public.reimbursement_calculations
FOR SELECT
TO authenticated
USING (
    public.is_facility_accessible(facility_id)
);

-- Calculations Insert Policy
DROP POLICY IF EXISTS reimb_calc_insert_policy ON public.reimbursement_calculations;
CREATE POLICY reimb_calc_insert_policy
ON public.reimbursement_calculations
FOR INSERT
TO authenticated
WITH CHECK (
    public.is_facility_accessible(facility_id)
);

-- Calculation Lines Select Policy
DROP POLICY IF EXISTS reimb_calc_lines_select_policy ON public.reimbursement_calculation_lines;
CREATE POLICY reimb_calc_lines_select_policy
ON public.reimbursement_calculation_lines
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.reimbursement_calculations calc
        WHERE calc.id = reimbursement_calculation_lines.calculation_id
          AND public.is_facility_accessible(calc.facility_id)
    )
);

-- Calculation Lines Insert Policy
DROP POLICY IF EXISTS reimb_calc_lines_insert_policy ON public.reimbursement_calculation_lines;
CREATE POLICY reimb_calc_lines_insert_policy
ON public.reimbursement_calculation_lines
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.reimbursement_calculations calc
        WHERE calc.id = reimbursement_calculation_lines.calculation_id
          AND public.is_facility_accessible(calc.facility_id)
    )
);

-- Calculation Adjustments Select Policy
DROP POLICY IF EXISTS reimb_calc_adj_select_policy ON public.reimbursement_calculation_adjustments;
CREATE POLICY reimb_calc_adj_select_policy
ON public.reimbursement_calculation_adjustments
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.reimbursement_calculation_lines l
        JOIN public.reimbursement_calculations calc ON calc.id = l.calculation_id
        WHERE l.id = reimbursement_calculation_adjustments.calculation_line_id
          AND public.is_facility_accessible(calc.facility_id)
    )
);

-- Calculation Adjustments Insert Policy
DROP POLICY IF EXISTS reimb_calc_adj_insert_policy ON public.reimbursement_calculation_adjustments;
CREATE POLICY reimb_calc_adj_insert_policy
ON public.reimbursement_calculation_adjustments
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.reimbursement_calculation_lines l
        JOIN public.reimbursement_calculations calc ON calc.id = l.calculation_id
        WHERE l.id = reimbursement_calculation_adjustments.calculation_line_id
          AND public.is_facility_accessible(calc.facility_id)
    )
);

-- Defense-in-depth: Revoke anon, restrict mutations
REVOKE ALL ON public.reimbursement_calculations FROM anon;
REVOKE ALL ON public.reimbursement_calculation_lines FROM anon;
REVOKE ALL ON public.reimbursement_calculation_adjustments FROM anon;

GRANT SELECT, INSERT ON public.reimbursement_calculations TO authenticated;
GRANT SELECT, INSERT ON public.reimbursement_calculation_lines TO authenticated;
GRANT SELECT, INSERT ON public.reimbursement_calculation_adjustments TO authenticated;

-- =====================================================================
-- 6. AUTHORITATIVE STORED PROCEDURES
-- =====================================================================

-- 6.1 fn_calculate_expected_reimbursement (Main Adjudication Engine)
CREATE OR REPLACE FUNCTION public.fn_calculate_expected_reimbursement(
    p_surgery_id BIGINT,
    p_contract_version_id UUID DEFAULT NULL,
    p_date_of_service DATE DEFAULT NULL,
    p_payer_id UUID DEFAULT NULL,
    p_dry_run BOOLEAN DEFAULT FALSE,
    p_recalculation_reason TEXT DEFAULT NULL,
    p_patient_copay NUMERIC(12, 2) DEFAULT NULL,
    p_patient_coinsurance_pct NUMERIC(6, 4) DEFAULT NULL,
    p_patient_deductible NUMERIC(12, 2) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_surgery RECORD;
    v_facility_id UUID;
    v_org_id UUID;
    v_patient_id BIGINT;
    v_payer_id UUID;
    v_dos DATE;
    v_contract_id UUID;
    v_contract_version_id UUID;
    v_contract_title VARCHAR(255);
    v_calc_id UUID := gen_random_uuid();
    v_next_seq INTEGER := 1;
    v_last_calc_id UUID;
    
    v_proc RECORD;
    v_line_idx SMALLINT := 0;
    v_line_gross NUMERIC(12, 2) := 0.00;
    v_total_gross NUMERIC(12, 2) := 0.00;
    v_total_allowable NUMERIC(12, 2) := 0.00;
    v_primary_allowable NUMERIC(12, 2) := 0.00;
    v_secondary_allowable NUMERIC(12, 2) := 0.00;
    v_implant_allowable NUMERIC(12, 2) := 0.00;
    v_other_allowable NUMERIC(12, 2) := 0.00;
    
    v_est_patient_resp NUMERIC(12, 2) := 0.00;
    v_est_payer_reimb NUMERIC(12, 2) := 0.00;
    v_facility_cost NUMERIC(12, 2) := 0.00;
    v_net_margin NUMERIC(12, 2) := 0.00;
    v_margin_pct NUMERIC(6, 4) := 0.0000;
    
    v_stop_loss RECORD;
    v_stop_loss_triggered BOOLEAN := FALSE;
    v_calc_status VARCHAR(50) := 'CALCULATED';
    v_mppr_code VARCHAR(50) := 'COM_STD_CASCADE';
    v_calc_hash VARCHAR(64);
    
    v_res_cpt RECORD;
    v_mod_1 VARCHAR(4);
    v_mod_2 VARCHAR(4);
    v_units NUMERIC(6, 2);
    v_line_rate NUMERIC(12, 2);
    v_mppr_rank SMALLINT := 1;
    v_mppr_mult NUMERIC(6, 4) := 1.0000;
    v_trace TEXT;
    
    v_lines_json JSONB := '[]'::jsonb;
BEGIN
    -- 1. Load Surgery Encounter Context
    SELECT s.*, s.facility_id, COALESCE(p_date_of_service, s.date, CURRENT_DATE) AS resolved_dos,
           f.organization_id, s.patient_id, s.primary_payer_id
    INTO v_surgery
    FROM public.surgeries s
    LEFT JOIN public.facilities f ON f.id = s.facility_id
    WHERE s.id = p_surgery_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'status', 'CALCULATION_FAILED',
            'error', 'ENCOUNTER_NOT_FOUND',
            'message', 'Surgery encounter ' || COALESCE(p_surgery_id::text, 'NULL') || ' not found.'
        );
    END IF;

    v_facility_id := v_surgery.facility_id;
    v_org_id := v_surgery.organization_id;
    v_patient_id := v_surgery.patient_id;
    v_dos := v_surgery.resolved_dos;
    v_payer_id := COALESCE(p_payer_id, v_surgery.primary_payer_id);

    -- Enforce Tenancy
    IF v_facility_id IS NOT NULL AND NOT public.is_facility_accessible(v_facility_id) THEN
        RAISE EXCEPTION 'Access Denied: Facility % is not accessible to current user.', v_facility_id;
    END IF;

    -- 2. Resolve Contract Version
    IF p_contract_version_id IS NOT NULL THEN
        v_contract_version_id := p_contract_version_id;
        SELECT contract_id INTO v_contract_id FROM public.payer_contract_versions WHERE id = v_contract_version_id;
        SELECT contract_title INTO v_contract_title FROM public.payer_contracts WHERE id = v_contract_id;
    ELSIF v_payer_id IS NOT NULL THEN
        SELECT contract_version_id, contract_id, contract_title
        INTO v_contract_version_id, v_contract_id, v_contract_title
        FROM public.fn_resolve_payer_contract(v_facility_id, v_payer_id, v_dos);
    END IF;

    -- Fail-closed: Never default to gross charges or arbitrary values if contract is missing
    IF v_contract_version_id IS NULL THEN
        v_calc_status := 'CONTRACT_NOT_FOUND';
        RETURN jsonb_build_object(
            'success', FALSE,
            'status', 'CONTRACT_NOT_FOUND',
            'surgery_id', p_surgery_id,
            'facility_id', v_facility_id,
            'payer_id', v_payer_id,
            'date_of_service', v_dos,
            'message', 'No active, approved commercial contract found for facility, payer, and DOS.'
        );
    END IF;

    -- Load contract version MPPR code
    SELECT COALESCE(mppr_rule_set_code, 'COM_STD_CASCADE') INTO v_mppr_code
    FROM public.payer_contract_versions WHERE id = v_contract_version_id;

    -- 3. Calculate Total Billed Charges
    SELECT COALESCE(SUM(line_gross_charge), 0.00) INTO v_total_gross
    FROM public.surgery_procedures WHERE surgery_id = p_surgery_id;

    -- Check Catastrophic Stop-Loss Exception
    SELECT * INTO v_stop_loss
    FROM public.payer_contract_rate_exceptions
    WHERE contract_version_id = v_contract_version_id
      AND exception_type = 'STOP_LOSS'
      AND is_active = TRUE
      AND v_total_gross >= trigger_threshold
    LIMIT 1;

    IF FOUND THEN
        v_stop_loss_triggered := TRUE;
        v_calc_status := 'STOP_LOSS_APPLIED';
        v_total_allowable := ROUND(v_total_gross * v_stop_loss.reimbursement_pct_of_billed, 2);
    END IF;

    -- 4. Process Line Items (if not stop-loss converted)
    IF NOT v_stop_loss_triggered THEN
        FOR v_proc IN (
            SELECT sp.*, COALESCE(cm.code, c.code, '00000') AS cpt_code_str,
                   COALESCE(sp.procedure_description, cm.description, c.description, 'Surgical Procedure') AS proc_desc
            FROM public.surgery_procedures sp
            LEFT JOIN public.cpt_code_versions v ON sp.cpt_version_id = v.id
            LEFT JOIN public.cpt_master cm ON v.cpt_master_id = cm.id
            LEFT JOIN public.cpt_codes c ON sp.cpt_code_id = c.id
            WHERE sp.surgery_id = p_surgery_id
            ORDER BY sp.is_primary DESC, sp.line_gross_charge DESC, sp.sequence_rank ASC
        ) LOOP
            v_line_idx := v_line_idx + 1;
            v_mod_1 := CASE WHEN array_length(v_proc.modifiers, 1) >= 1 THEN v_proc.modifiers[1] ELSE NULL END;
            v_mod_2 := CASE WHEN array_length(v_proc.modifiers, 1) >= 2 THEN v_proc.modifiers[2] ELSE NULL END;
            v_units := GREATEST(1.00, COALESCE(v_proc.units, 1.00));
            v_line_gross := COALESCE(v_proc.line_gross_charge, 0.00);

            -- Resolve Line Rate
            SELECT * INTO v_res_cpt
            FROM public.fn_resolve_contract_rate(
                v_contract_version_id,
                v_proc.cpt_code_str,
                v_facility_id,
                v_dos,
                v_mod_1,
                v_mod_2
            );

            IF v_res_cpt.reimbursement_methodology = 'NOT_COVERED' THEN
                v_calc_status := 'PARTIALLY_CALCULATED';
                v_line_rate := 0.00;
                v_trace := 'CPT not covered in contracted schedule ($0.00 allowable)';
            ELSE
                v_line_rate := COALESCE(v_res_cpt.negotiated_rate, 0.00);
                
                -- Modifier Factor
                IF v_res_cpt.modifier_adjustment_factor <> 1.0000 THEN
                    v_line_rate := ROUND(v_line_rate * v_res_cpt.modifier_adjustment_factor, 2);
                END IF;

                -- MPPR Reduction Cascade
                IF v_line_idx = 1 THEN
                    v_mppr_rank := 1;
                    v_mppr_mult := 1.0000;
                ELSE
                    v_mppr_rank := v_line_idx;
                    v_mppr_mult := 0.5000; -- Standard secondary reduction
                    v_line_rate := ROUND(v_line_rate * v_mppr_mult, 2);
                END IF;

                v_line_rate := v_line_rate * v_units;
                v_trace := 'Resolved via ' || v_res_cpt.reimbursement_methodology || ' at $' || v_line_rate::text;
            END IF;

            IF v_line_idx = 1 THEN
                v_primary_allowable := v_line_rate;
            ELSE
                v_secondary_allowable := v_secondary_allowable + v_line_rate;
            END IF;

            v_total_allowable := v_total_allowable + v_line_rate;

            v_lines_json := v_lines_json || jsonb_build_object(
                'line_number', v_line_idx,
                'cpt_code', v_proc.cpt_code_str,
                'description', v_proc.proc_desc,
                'modifiers', v_proc.modifiers,
                'units', v_units,
                'line_gross_charge', v_line_gross,
                'applied_methodology', v_res_cpt.reimbursement_methodology,
                'base_benchmark_rate', v_res_cpt.base_benchmark_rate,
                'contract_multiplier', v_res_cpt.contract_multiplier,
                'mppr_rank', v_mppr_rank,
                'mppr_discount_pct', v_mppr_mult,
                'j8_device_offset_deducted', v_res_cpt.j8_device_offset_amount,
                'line_contract_allowable', v_line_rate,
                'calculation_trace', v_trace
            );
        END LOOP;
    END IF;

    -- 5. Calculate Direct Costs & Contribution Margin
    IF v_surgery.actual_room_cost IS NOT NULL AND v_surgery.actual_room_cost > 0 THEN
        v_facility_cost := v_facility_cost + v_surgery.actual_room_cost;
    ELSIF v_surgery.duration_minutes IS NOT NULL AND v_surgery.duration_minutes > 0 THEN
        v_facility_cost := v_facility_cost + (v_surgery.duration_minutes * 14.00);
    END IF;

    IF v_surgery.actual_labor_cost IS NOT NULL AND v_surgery.actual_labor_cost > 0 THEN
        v_facility_cost := v_facility_cost + v_surgery.actual_labor_cost;
    ELSIF v_surgery.duration_minutes IS NOT NULL AND v_surgery.duration_minutes > 0 THEN
        v_facility_cost := v_facility_cost + (v_surgery.duration_minutes * 15.00);
    END IF;

    v_facility_cost := v_facility_cost + COALESCE(v_surgery.supplies_cost, 0.00)
                                      + COALESCE(v_surgery.implants_cost, 0.00)
                                      + COALESCE(v_surgery.medications_cost, 0.00);

    v_net_margin := v_total_allowable - v_facility_cost;
    IF v_total_allowable > 0 THEN
        v_margin_pct := ROUND(v_net_margin / v_total_allowable, 4);
    END IF;

    -- 6. Partition Patient Responsibility vs Net Payer Reimbursement
    -- Evaluate copay / coinsurance / deductible overrides if provided
    IF p_patient_copay IS NOT NULL THEN
        v_est_patient_resp := v_est_patient_resp + LEAST(v_total_allowable, p_patient_copay);
    END IF;

    IF p_patient_deductible IS NOT NULL AND p_patient_deductible > 0 THEN
        v_est_patient_resp := v_est_patient_resp + LEAST(v_total_allowable - v_est_patient_resp, p_patient_deductible);
    END IF;

    IF p_patient_coinsurance_pct IS NOT NULL AND p_patient_coinsurance_pct > 0 THEN
        v_est_patient_resp := v_est_patient_resp + ROUND((v_total_allowable - v_est_patient_resp) * p_patient_coinsurance_pct, 2);
    END IF;

    v_est_patient_resp := LEAST(v_total_allowable, v_est_patient_resp);
    v_est_payer_reimb := v_total_allowable - v_est_patient_resp;

    -- 7. Compute Canonical SHA-256 Hash
    v_calc_hash := encode(digest(
        CONCAT_WS('|',
            v_facility_id::text,
            p_surgery_id::text,
            v_payer_id::text,
            v_contract_version_id::text,
            v_dos::text,
            v_total_gross::text,
            v_total_allowable::text,
            v_est_patient_resp::text,
            v_est_payer_reimb::text,
            v_mppr_code
        ), 'sha256'), 'hex');

    -- 8. Commit to Database if not dry run
    IF NOT p_dry_run THEN
        -- Resolve next sequence
        SELECT id, calculation_sequence INTO v_last_calc_id, v_next_seq
        FROM public.reimbursement_calculations
        WHERE surgery_id = p_surgery_id AND is_latest_calculation = TRUE
        LIMIT 1;

        IF v_last_calc_id IS NOT NULL THEN
            UPDATE public.reimbursement_calculations
            SET is_latest_calculation = FALSE,
                superseded_by_calculation_id = v_calc_id
            WHERE id = v_last_calc_id;

            v_next_seq := v_next_seq + 1;
        ELSE
            v_next_seq := 1;
        END IF;

        INSERT INTO public.reimbursement_calculations (
            id, facility_id, organization_id, surgery_id, encounter_identifier,
            patient_id, payer_id, plan_id, contract_id, contract_version_id,
            calculation_sequence, is_latest_calculation, recalculation_reason,
            date_of_service, calculation_status, total_gross_billed,
            total_contract_allowable, estimated_patient_responsibility,
            estimated_payer_reimbursement, facility_acquisition_cost,
            expected_contribution_margin, contribution_margin_pct,
            primary_procedure_allowable, secondary_procedure_allowable,
            implant_carve_out_allowable, other_services_allowable,
            mppr_rule_set_code, stop_loss_triggered, calculation_hash,
            execution_context, calculated_by
        ) VALUES (
            v_calc_id, v_facility_id, v_org_id, p_surgery_id, 'SURG-' || p_surgery_id::text,
            v_patient_id, v_payer_id, NULL, v_contract_id, v_contract_version_id,
            v_next_seq, TRUE, p_recalculation_reason,
            v_dos, v_calc_status, v_total_gross,
            v_total_allowable, v_est_patient_resp,
            v_est_payer_reimb, v_facility_cost,
            v_net_margin, v_margin_pct,
            v_primary_allowable, v_secondary_allowable,
            v_implant_allowable, v_other_allowable,
            v_mppr_code, v_stop_loss_triggered, v_calc_hash,
            jsonb_build_object('contract_title', v_contract_title, 'dos', v_dos),
            auth.uid()
        );

        -- Insert line items
        INSERT INTO public.reimbursement_calculation_lines (
            calculation_id, line_number, cpt_code, procedure_description,
            units, line_gross_charge, applied_methodology, base_benchmark_rate,
            contract_multiplier, mppr_rank, mppr_discount_pct,
            j8_device_offset_deducted, line_contract_allowable,
            line_patient_responsibility, line_payer_reimbursement,
            calculation_trace
        )
        SELECT
            v_calc_id,
            (elem->>'line_number')::SMALLINT,
            elem->>'cpt_code',
            elem->>'description',
            (elem->>'units')::NUMERIC,
            (elem->>'line_gross_charge')::NUMERIC,
            elem->>'applied_methodology',
            (elem->>'base_benchmark_rate')::NUMERIC,
            (elem->>'contract_multiplier')::NUMERIC,
            (elem->>'mppr_rank')::SMALLINT,
            (elem->>'mppr_discount_pct')::NUMERIC,
            (elem->>'j8_device_offset_deducted')::NUMERIC,
            (elem->>'line_contract_allowable')::NUMERIC,
            0.00,
            (elem->>'line_contract_allowable')::NUMERIC,
            elem->>'calculation_trace'
        FROM jsonb_array_elements(v_lines_json) AS elem;
    END IF;

    -- Return Consolidated Payload
    RETURN jsonb_build_object(
        'success', TRUE,
        'calculation_id', v_calc_id,
        'surgery_id', p_surgery_id,
        'facility_id', v_facility_id,
        'contract_id', v_contract_id,
        'contract_version_id', v_contract_version_id,
        'contract_title', v_contract_title,
        'date_of_service', v_dos,
        'calculation_sequence', v_next_seq,
        'calculation_status', v_calc_status,
        'total_gross_billed', v_total_gross,
        'total_contract_allowable', v_total_allowable,
        'estimated_patient_responsibility', v_est_patient_resp,
        'estimated_payer_reimbursement', v_est_payer_reimb,
        'facility_acquisition_cost', v_facility_cost,
        'expected_contribution_margin', v_net_margin,
        'contribution_margin_pct', v_margin_pct,
        'stop_loss_triggered', v_stop_loss_triggered,
        'mppr_rule_set_code', v_mppr_code,
        'calculation_hash', v_calc_hash,
        'lines', v_lines_json
    );
END;
$$;

-- Overload for text case_id
CREATE OR REPLACE FUNCTION public.fn_calculate_expected_reimbursement(
    p_case_id TEXT,
    p_contract_version_id UUID DEFAULT NULL,
    p_dry_run BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN public.fn_calculate_expected_reimbursement(
        p_surgery_id => CASE WHEN p_case_id ~ '^[0-9]+$' THEN p_case_id::BIGINT ELSE NULL END,
        p_contract_version_id => p_contract_version_id,
        p_dry_run => p_dry_run
    );
END;
$$;

-- 6.2 fn_verify_reimbursement_calculation_integrity
CREATE OR REPLACE FUNCTION public.fn_verify_reimbursement_calculation_integrity(
    p_calculation_id UUID
)
RETURNS TABLE (
    is_valid BOOLEAN,
    recorded_hash VARCHAR(64),
    computed_hash VARCHAR(64),
    verification_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_calc RECORD;
    v_recomputed_hash VARCHAR(64);
BEGIN
    SELECT * INTO v_calc FROM public.reimbursement_calculations WHERE id = p_calculation_id;
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::VARCHAR(64), NULL::VARCHAR(64), 'Calculation record not found.'::TEXT;
        RETURN;
    END IF;

    v_recomputed_hash := encode(digest(
        CONCAT_WS('|',
            v_calc.facility_id::text,
            v_calc.surgery_id::text,
            v_calc.payer_id::text,
            v_calc.contract_version_id::text,
            v_calc.date_of_service::text,
            v_calc.total_gross_billed::text,
            v_calc.total_contract_allowable::text,
            v_calc.estimated_patient_responsibility::text,
            v_calc.estimated_payer_reimbursement::text,
            v_calc.mppr_rule_set_code
        ), 'sha256'), 'hex');

    IF v_recomputed_hash = v_calc.calculation_hash THEN
        RETURN QUERY SELECT TRUE, v_calc.calculation_hash, v_recomputed_hash, 'Ledger verified: Cryptographic hash matches canonical state.'::TEXT;
    ELSE
        RETURN QUERY SELECT FALSE, v_calc.calculation_hash, v_recomputed_hash, 'INTEGRITY ALERT: Computed hash does not match recorded ledger hash.'::TEXT;
    END IF;
END;
$$;

-- 6.3 Refactor legacy calculate_surgery_financials to eliminate gross charge leakage
CREATE OR REPLACE FUNCTION public.calculate_surgery_financials(p_surgery_id BIGINT)
RETURNS TABLE (
    total_revenue NUMERIC(12, 2),
    total_cost NUMERIC(12, 2),
    net_margin NUMERIC(12, 2),
    ebitda_margin_pct NUMERIC(5, 2)
) AS $$
DECLARE
    v_calc JSONB;
BEGIN
    v_calc := public.fn_calculate_expected_reimbursement(
        p_surgery_id => p_surgery_id,
        p_dry_run => TRUE
    );

    IF (v_calc->>'success')::BOOLEAN THEN
        RETURN QUERY SELECT
            (v_calc->>'total_contract_allowable')::NUMERIC(12, 2),
            (v_calc->>'facility_acquisition_cost')::NUMERIC(12, 2),
            (v_calc->>'expected_contribution_margin')::NUMERIC(12, 2),
            ROUND(((v_calc->>'contribution_margin_pct')::NUMERIC * 100), 2)::NUMERIC(5, 2);
    ELSE
        -- Return honest zeros rather than defaulting to gross chargemaster
        RETURN QUERY SELECT 0.00::NUMERIC(12, 2), 0.00::NUMERIC(12, 2), 0.00::NUMERIC(12, 2), 0.00::NUMERIC(5, 2);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- =====================================================================
-- 7. SEED BASELINE HISTORICAL CALCULATIONS (IDEMPOTENT)
-- =====================================================================

DO $$
DECLARE
    v_fac UUID;
    v_org UUID;
    v_surg_1 BIGINT;
    v_surg_2 BIGINT;
    v_ver UUID;
    v_payer UUID;
    v_calc_1 UUID := '55000000-0000-0000-0000-000000000001'::UUID;
    v_calc_2 UUID := '55000000-0000-0000-0000-000000000002'::UUID;
BEGIN
    SELECT id, organization_id INTO v_fac, v_org FROM public.facilities LIMIT 1;
    SELECT id INTO v_surg_1 FROM public.surgeries ORDER BY id ASC LIMIT 1;
    SELECT id INTO v_surg_2 FROM public.surgeries ORDER BY id ASC OFFSET 1 LIMIT 1;
    SELECT id INTO v_payer FROM public.payer_master ORDER BY created_at LIMIT 1;
    SELECT id INTO v_ver FROM public.payer_contract_versions WHERE status = 'ACTIVE' LIMIT 1;

    IF v_fac IS NOT NULL AND v_ver IS NOT NULL AND v_surg_1 IS NOT NULL THEN
        INSERT INTO public.reimbursement_calculations (
            id, facility_id, organization_id, surgery_id, encounter_identifier,
            patient_id, payer_id, plan_id, contract_id, contract_version_id,
            calculation_sequence, is_latest_calculation,
            date_of_service, calculation_status, total_gross_billed,
            total_contract_allowable, estimated_patient_responsibility,
            estimated_payer_reimbursement, facility_acquisition_cost,
            expected_contribution_margin, contribution_margin_pct,
            primary_procedure_allowable, secondary_procedure_allowable,
            implant_carve_out_allowable, other_services_allowable,
            mppr_rule_set_code, stop_loss_triggered, calculation_hash,
            execution_context
        ) VALUES (
            v_calc_1, v_fac, v_org, v_surg_1, 'SURG-' || v_surg_1::text,
            (SELECT patient_id FROM public.surgeries WHERE id = v_surg_1),
            v_payer, NULL,
            (SELECT contract_id FROM public.payer_contract_versions WHERE id = v_ver),
            v_ver, 1, TRUE, CURRENT_DATE, 'CALCULATED', 11700.00,
            4100.00, 250.00, 3850.00, 1850.00,
            2250.00, 0.5488, 3200.00, 900.00, 0.00, 0.00,
            'COM_STD_CASCADE', FALSE,
            encode(digest(v_fac::text || v_surg_1::text || '4100.00', 'sha256'), 'hex'),
            '{"seed": true}'::jsonb
        ) ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.reimbursement_calculation_lines (
            calculation_id, line_number, cpt_code, procedure_description,
            units, line_gross_charge, applied_methodology, base_benchmark_rate,
            contract_multiplier, mppr_rank, mppr_discount_pct,
            line_contract_allowable, line_patient_responsibility, line_payer_reimbursement,
            calculation_trace
        ) VALUES
            (v_calc_1, 1, '29881', 'Knee arthroscopy meniscectomy', 1.0, 7500.00, 'COMMERCIAL_FEE_SCHEDULE', 3200.00, 1.0000, 1, 1.0000, 3200.00, 250.00, 2950.00, 'Rank 1 Primary at 100% fee schedule'),
            (v_calc_1, 2, '29877', 'Knee arthroscopy chondroplasty', 1.0, 4200.00, 'COMMERCIAL_FEE_SCHEDULE', 1800.00, 1.0000, 2, 0.5000, 900.00, 0.00, 900.00, 'Rank 2 Secondary at 50% MPPR')
        ON CONFLICT (calculation_id, line_number) DO NOTHING;
    END IF;
END $$;

-- =====================================================================
-- 8. IMMUTABILITY TRIGGERS (ATTACHED AFTER SEEDING)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.trg_block_reimbursement_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Financial Ledger Violation: Calculation snapshot records (ID %) are permanently immutable and cannot be modified or deleted. To recalculate, execute a new calculation sequence.',
        OLD.id;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reimb_calc_immutable ON public.reimbursement_calculations;
CREATE TRIGGER trg_reimb_calc_immutable
    BEFORE UPDATE OR DELETE ON public.reimbursement_calculations
    FOR EACH ROW EXECUTE FUNCTION public.trg_block_reimbursement_mutation();

DROP TRIGGER IF EXISTS trg_reimb_calc_lines_immutable ON public.reimbursement_calculation_lines;
CREATE TRIGGER trg_reimb_calc_lines_immutable
    BEFORE UPDATE OR DELETE ON public.reimbursement_calculation_lines
    FOR EACH ROW EXECUTE FUNCTION public.trg_block_reimbursement_mutation();

COMMIT;
