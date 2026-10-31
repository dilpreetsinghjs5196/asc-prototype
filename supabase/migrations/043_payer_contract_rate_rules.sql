-- =====================================================================
-- Migration: 043_payer_contract_rate_rules.sql
-- Description: Phase 67 — Payer Contract Rate Rules, Exhibits, Case Rates,
--              Implant Carve-Outs, Stop-Loss Exceptions & Adjudication Snapshots
-- Author: ASCANALYST Multi-Agent Core Engine
-- Target Database: PostgreSQL 15+ / Supabase
-- Dependencies: 040 (MPPR), 041 (Payer Master), 042 (Payer Contract Model)
-- =====================================================================

BEGIN;

-- =====================================================================
-- 1. EXTENSIONS & PREREQUISITES
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- 2. RATE EXHIBITS & SCHEDULE HEADERS
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.payer_contract_rate_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_version_id UUID NOT NULL REFERENCES public.payer_contract_versions(id) ON DELETE CASCADE,
    schedule_code VARCHAR(50) NOT NULL,
    schedule_name VARCHAR(150) NOT NULL,
    schedule_type VARCHAR(50) NOT NULL CHECK (schedule_type IN (
        'FEE_SCHEDULE',
        'CASE_RATE_SET',
        'PERCENT_OF_MEDICARE_OVERRIDE',
        'SPECIALTY_TIER_SCHEDULE'
    )),
    effective_start_date DATE NOT NULL,
    effective_end_date DATE,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    total_line_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_contract_version_schedule_code UNIQUE (contract_version_id, schedule_code),
    CONSTRAINT chk_schedule_dates CHECK (effective_end_date IS NULL OR effective_end_date >= effective_start_date)
);

CREATE INDEX IF NOT EXISTS idx_rate_schedules_version ON public.payer_contract_rate_schedules(contract_version_id);
CREATE INDEX IF NOT EXISTS idx_rate_schedules_dates ON public.payer_contract_rate_schedules(effective_start_date, effective_end_date);

-- =====================================================================
-- 3. LINE-ITEM CPT / HCPCS RATES
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.payer_contract_cpt_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_schedule_id UUID NOT NULL REFERENCES public.payer_contract_rate_schedules(id) ON DELETE CASCADE,
    contract_version_id UUID NOT NULL REFERENCES public.payer_contract_versions(id) ON DELETE CASCADE,
    cpt_code VARCHAR(10) NOT NULL,
    description VARCHAR(255),
    reimbursement_methodology VARCHAR(50) NOT NULL CHECK (reimbursement_methodology IN (
        'COMMERCIAL_FEE_SCHEDULE',
        'PERCENT_OF_MEDICARE',
        'PERCENT_OF_BILLED_CHARGES',
        'CASE_RATE',
        'NOT_COVERED'
    )),
    negotiated_rate NUMERIC(12, 2) CHECK (negotiated_rate IS NULL OR negotiated_rate >= 0),
    medicare_multiplier NUMERIC(6, 4) CHECK (medicare_multiplier IS NULL OR medicare_multiplier > 0),
    billed_charge_discount_pct NUMERIC(6, 4) CHECK (billed_charge_discount_pct IS NULL OR (billed_charge_discount_pct >= 0 AND billed_charge_discount_pct <= 1.0000)),
    bilateral_reimbursement_pct NUMERIC(6, 4) NOT NULL DEFAULT 1.5000 CHECK (bilateral_reimbursement_pct >= 1.0000 AND bilateral_reimbursement_pct <= 2.0000),
    allow_mppr_reduction BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_rate_schedule_cpt UNIQUE (rate_schedule_id, cpt_code),
    CONSTRAINT chk_methodology_payload CHECK (
        (reimbursement_methodology = 'COMMERCIAL_FEE_SCHEDULE' AND negotiated_rate IS NOT NULL) OR
        (reimbursement_methodology = 'PERCENT_OF_MEDICARE' AND medicare_multiplier IS NOT NULL) OR
        (reimbursement_methodology = 'PERCENT_OF_BILLED_CHARGES' AND billed_charge_discount_pct IS NOT NULL) OR
        (reimbursement_methodology = 'CASE_RATE') OR
        (reimbursement_methodology = 'NOT_COVERED')
    )
);

CREATE INDEX IF NOT EXISTS idx_cpt_rates_schedule ON public.payer_contract_cpt_rates(rate_schedule_id);
CREATE INDEX IF NOT EXISTS idx_cpt_rates_cpt ON public.payer_contract_cpt_rates(cpt_code);
CREATE INDEX IF NOT EXISTS idx_cpt_rates_version_cpt ON public.payer_contract_cpt_rates(contract_version_id, cpt_code);

-- =====================================================================
-- 4. BUNDLED CASE RATES & INCLUSIONS
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.payer_contract_case_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_schedule_id UUID NOT NULL REFERENCES public.payer_contract_rate_schedules(id) ON DELETE CASCADE,
    contract_version_id UUID NOT NULL REFERENCES public.payer_contract_versions(id) ON DELETE CASCADE,
    package_code VARCHAR(50) NOT NULL,
    package_name VARCHAR(150) NOT NULL,
    primary_cpt_code VARCHAR(10) NOT NULL,
    bundled_rate NUMERIC(12, 2) NOT NULL CHECK (bundled_rate > 0),
    includes_anesthesia BOOLEAN NOT NULL DEFAULT FALSE,
    includes_facility_fee BOOLEAN NOT NULL DEFAULT TRUE,
    includes_standard_implants BOOLEAN NOT NULL DEFAULT FALSE,
    max_or_hours NUMERIC(4, 2) DEFAULT 3.00,
    hourly_overage_rate NUMERIC(10, 2) DEFAULT 0.00,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_case_rate_version_package UNIQUE (contract_version_id, package_code)
);

CREATE INDEX IF NOT EXISTS idx_case_rates_version ON public.payer_contract_case_rates(contract_version_id);
CREATE INDEX IF NOT EXISTS idx_case_rates_cpt ON public.payer_contract_case_rates(primary_cpt_code);

CREATE TABLE IF NOT EXISTS public.payer_contract_case_rate_inclusions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_rate_id UUID NOT NULL REFERENCES public.payer_contract_case_rates(id) ON DELETE CASCADE,
    included_code VARCHAR(10) NOT NULL,
    code_type VARCHAR(20) NOT NULL CHECK (code_type IN ('CPT', 'HCPCS', 'REVENUE_CODE')),
    description VARCHAR(255),
    is_bundled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_case_rate_inclusion UNIQUE (case_rate_id, included_code)
);

CREATE INDEX IF NOT EXISTS idx_case_rate_inclusions_rate ON public.payer_contract_case_rate_inclusions(case_rate_id);
CREATE INDEX IF NOT EXISTS idx_case_rate_inclusions_code ON public.payer_contract_case_rate_inclusions(included_code);

-- =====================================================================
-- 5. SURGICAL IMPLANT & DEVICE CARVE-OUT RULES
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.payer_contract_carve_outs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_version_id UUID NOT NULL REFERENCES public.payer_contract_versions(id) ON DELETE CASCADE,
    carve_out_code VARCHAR(50) NOT NULL,
    carve_out_name VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN (
        'IMPLANT',
        'BIOLOGIC',
        'HIGH_COST_DRUG',
        'SPECIALTY_DEVICE'
    )),
    reimbursement_model VARCHAR(50) NOT NULL CHECK (reimbursement_model IN (
        'PASS_THROUGH_AT_COST',
        'INVOICE_PLUS_PERCENT',
        'INVOICE_PLUS_FIXED_FEE',
        'FEE_SCHEDULE_FIXED'
    )),
    markup_percentage NUMERIC(6, 4) CHECK (markup_percentage IS NULL OR markup_percentage >= 0),
    fixed_fee_amount NUMERIC(10, 2) CHECK (fixed_fee_amount IS NULL OR fixed_fee_amount >= 0),
    min_invoice_threshold_per_item NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    min_encounter_threshold NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    max_reimbursement_cap NUMERIC(10, 2),
    requires_invoice_attachment BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_version_carve_out_code UNIQUE (contract_version_id, carve_out_code),
    CONSTRAINT chk_carve_out_payload CHECK (
        (reimbursement_model = 'PASS_THROUGH_AT_COST') OR
        (reimbursement_model = 'INVOICE_PLUS_PERCENT' AND markup_percentage IS NOT NULL) OR
        (reimbursement_model = 'INVOICE_PLUS_FIXED_FEE' AND fixed_fee_amount IS NOT NULL) OR
        (reimbursement_model = 'FEE_SCHEDULE_FIXED')
    )
);

CREATE INDEX IF NOT EXISTS idx_carve_outs_version ON public.payer_contract_carve_outs(contract_version_id);

-- =====================================================================
-- 6. CONTRACTUAL EXCEPTIONS & STOP-LOSS PROVISIONS
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.payer_contract_rate_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_version_id UUID NOT NULL REFERENCES public.payer_contract_versions(id) ON DELETE CASCADE,
    exception_code VARCHAR(50) NOT NULL,
    exception_name VARCHAR(150) NOT NULL,
    exception_type VARCHAR(50) NOT NULL CHECK (exception_type IN (
        'STOP_LOSS',
        'MINIMUM_ALLOWABLE_PER_CASE',
        'EXCLUDED_CPT',
        'UNLISTED_PROCEDURE_OVERRIDE',
        'CUSTOM_MODIFIER_RULE'
    )),
    trigger_threshold NUMERIC(12, 2),
    reimbursement_pct_of_billed NUMERIC(6, 4) CHECK (reimbursement_pct_of_billed IS NULL OR (reimbursement_pct_of_billed >= 0 AND reimbursement_pct_of_billed <= 1.0000)),
    fixed_exception_amount NUMERIC(12, 2),
    applies_to_cpt VARCHAR(10),
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_version_exception_code UNIQUE (contract_version_id, exception_code)
);

CREATE INDEX IF NOT EXISTS idx_exceptions_version ON public.payer_contract_rate_exceptions(contract_version_id);

-- =====================================================================
-- 7. IMMUTABLE CALCULATION SNAPSHOT LEDGER
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.payer_contract_rate_calculations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    surgery_id BIGINT REFERENCES public.surgeries(id) ON DELETE SET NULL,
    case_id TEXT,
    payer_id UUID NOT NULL REFERENCES public.payer_master(id) ON DELETE RESTRICT,
    plan_id UUID REFERENCES public.payer_plans(id) ON DELETE SET NULL,
    contract_id UUID NOT NULL REFERENCES public.payer_contracts(id) ON DELETE RESTRICT,
    contract_version_id UUID NOT NULL REFERENCES public.payer_contract_versions(id) ON DELETE RESTRICT,
    calculation_date TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    date_of_service DATE NOT NULL,
    calculation_status VARCHAR(50) NOT NULL CHECK (calculation_status IN (
        'CALCULATED',
        'UNCONTRACTED_ERROR',
        'MISSING_RATE_ERROR',
        'STOP_LOSS_APPLIED',
        'MANUAL_OVERRIDE'
    )),
    total_billed_charges NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_contract_allowable NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_primary_procedure_allowable NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_secondary_procedure_allowable NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_implant_allowable NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_other_allowable NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    mppr_rule_set_code VARCHAR(50),
    stop_loss_triggered BOOLEAN NOT NULL DEFAULT FALSE,
    calculation_hash VARCHAR(64) NOT NULL,
    calculation_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    calculated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_calculations_facility ON public.payer_contract_rate_calculations(facility_id);
CREATE INDEX IF NOT EXISTS idx_calculations_surgery ON public.payer_contract_rate_calculations(surgery_id);
CREATE INDEX IF NOT EXISTS idx_calculations_case ON public.payer_contract_rate_calculations(case_id);
CREATE INDEX IF NOT EXISTS idx_calculations_contract_version ON public.payer_contract_rate_calculations(contract_version_id);
CREATE INDEX IF NOT EXISTS idx_calculations_dos ON public.payer_contract_rate_calculations(date_of_service);
CREATE INDEX IF NOT EXISTS idx_calculations_hash ON public.payer_contract_rate_calculations(calculation_hash);

CREATE TABLE IF NOT EXISTS public.payer_contract_rate_calculation_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calculation_id UUID NOT NULL REFERENCES public.payer_contract_rate_calculations(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL,
    cpt_code VARCHAR(10) NOT NULL,
    modifier_1 VARCHAR(4),
    modifier_2 VARCHAR(4),
    units NUMERIC(6, 2) NOT NULL DEFAULT 1.00,
    service_description VARCHAR(255),
    line_billed_charge NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    applied_methodology VARCHAR(50) NOT NULL,
    base_benchmark_rate NUMERIC(12, 2),
    contract_multiplier NUMERIC(6, 4),
    negotiated_fee_rate NUMERIC(12, 2),
    modifier_adjustment_factor NUMERIC(6, 4) NOT NULL DEFAULT 1.0000,
    mppr_rank INTEGER NOT NULL DEFAULT 1,
    mppr_discount_pct NUMERIC(6, 4) NOT NULL DEFAULT 1.0000,
    j8_device_offset_deducted NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    final_line_allowable NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    is_packaged BOOLEAN NOT NULL DEFAULT FALSE,
    is_carve_out BOOLEAN NOT NULL DEFAULT FALSE,
    calculation_trace TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_calculation_line UNIQUE (calculation_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_calc_lines_calc_id ON public.payer_contract_rate_calculation_lines(calculation_id);
CREATE INDEX IF NOT EXISTS idx_calc_lines_cpt ON public.payer_contract_rate_calculation_lines(cpt_code);

-- =====================================================================
-- 8. BATCH IMPORT & STAGING TABLES
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.payer_contract_rate_import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_version_id UUID NOT NULL REFERENCES public.payer_contract_versions(id) ON DELETE CASCADE,
    rate_schedule_id UUID REFERENCES public.payer_contract_rate_schedules(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    storage_path TEXT NOT NULL,
    file_hash_sha256 VARCHAR(64) NOT NULL,
    total_rows INTEGER NOT NULL DEFAULT 0,
    valid_rows INTEGER NOT NULL DEFAULT 0,
    error_rows INTEGER NOT NULL DEFAULT 0,
    import_status VARCHAR(50) NOT NULL CHECK (import_status IN (
        'PENDING',
        'VALIDATING',
        'VALIDATED_WITH_ERRORS',
        'STAGED',
        'COMMITTED',
        'FAILED'
    )),
    uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    error_summary JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    committed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.payer_contract_rate_import_staging (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_batch_id UUID NOT NULL REFERENCES public.payer_contract_rate_import_batches(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    raw_cpt_code VARCHAR(50),
    raw_description TEXT,
    raw_methodology VARCHAR(50),
    raw_rate VARCHAR(50),
    raw_multiplier VARCHAR(50),
    raw_discount_pct VARCHAR(50),
    validation_status VARCHAR(20) NOT NULL CHECK (validation_status IN ('VALID', 'WARNING', 'ERROR')),
    validation_message TEXT,
    parsed_cpt_code VARCHAR(10),
    parsed_methodology VARCHAR(50),
    parsed_rate NUMERIC(12, 2),
    parsed_multiplier NUMERIC(6, 4),
    parsed_discount_pct NUMERIC(6, 4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_import_staging_batch ON public.payer_contract_rate_import_staging(import_batch_id);

-- =====================================================================
-- 9. TRIGGERS: LOCK RATES ON APPROVED / ACTIVE VERSIONS
-- =====================================================================

CREATE OR REPLACE FUNCTION public.trg_lock_contract_rates_on_approval()
RETURNS TRIGGER AS $$
DECLARE
    v_status VARCHAR(50);
BEGIN
    SELECT status INTO v_status
    FROM public.payer_contract_versions
    WHERE id = COALESCE(NEW.contract_version_id, OLD.contract_version_id);

    IF v_status IN ('ACTIVE', 'APPROVED', 'SUPERSEDED', 'TERMINATED') THEN
        RAISE EXCEPTION 'Financial Data Integrity Violation: Rates attached to contract version % in status % cannot be modified or deleted. Create a new contract version.',
            COALESCE(NEW.contract_version_id, OLD.contract_version_id), v_status;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lock_cpt_rates ON public.payer_contract_cpt_rates;
CREATE TRIGGER trg_lock_cpt_rates
    BEFORE INSERT OR UPDATE OR DELETE ON public.payer_contract_cpt_rates
    FOR EACH ROW EXECUTE FUNCTION public.trg_lock_contract_rates_on_approval();

DROP TRIGGER IF EXISTS trg_lock_case_rates ON public.payer_contract_case_rates;
CREATE TRIGGER trg_lock_case_rates
    BEFORE INSERT OR UPDATE OR DELETE ON public.payer_contract_case_rates
    FOR EACH ROW EXECUTE FUNCTION public.trg_lock_contract_rates_on_approval();

DROP TRIGGER IF EXISTS trg_lock_carve_outs ON public.payer_contract_carve_outs;
CREATE TRIGGER trg_lock_carve_outs
    BEFORE INSERT OR UPDATE OR DELETE ON public.payer_contract_carve_outs
    FOR EACH ROW EXECUTE FUNCTION public.trg_lock_contract_rates_on_approval();

-- =====================================================================
-- 10. AUTHORITATIVE STORED PROCEDURES
-- =====================================================================

-- 10.1 fn_resolve_contract_rate
CREATE OR REPLACE FUNCTION public.fn_resolve_contract_rate(
    p_contract_version_id UUID,
    p_cpt_code VARCHAR(10),
    p_facility_id UUID,
    p_date_of_service DATE,
    p_modifier_1 VARCHAR(4) DEFAULT NULL,
    p_modifier_2 VARCHAR(4) DEFAULT NULL
)
RETURNS TABLE (
    cpt_code VARCHAR(10),
    reimbursement_methodology VARCHAR(50),
    base_benchmark_rate NUMERIC(12, 2),
    contract_multiplier NUMERIC(6, 4),
    negotiated_rate NUMERIC(12, 2),
    modifier_adjustment_factor NUMERIC(6, 4),
    j8_device_offset_amount NUMERIC(12, 2),
    is_carve_out_eligible BOOLEAN,
    resolution_source VARCHAR(50),
    rule_notes TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cpt_record RECORD;
    v_contract_version RECORD;
    v_medicare_rate RECORD;
    v_mod_factor NUMERIC(6, 4) := 1.0000;
BEGIN
    -- Verify Facility Access
    IF p_facility_id IS NOT NULL AND NOT public.is_facility_accessible(p_facility_id) THEN
        RAISE EXCEPTION 'Access Denied: Facility % is not accessible to current user.', p_facility_id;
    END IF;

    -- Fetch Contract Version
    SELECT * INTO v_contract_version
    FROM public.payer_contract_versions
    WHERE id = p_contract_version_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Contract Version % not found.', p_contract_version_id;
    END IF;

    -- Check for Specific CPT Line Rate
    SELECT cr.* INTO v_cpt_record
    FROM public.payer_contract_cpt_rates cr
    JOIN public.payer_contract_rate_schedules rs ON rs.id = cr.rate_schedule_id
    WHERE cr.contract_version_id = p_contract_version_id
      AND cr.cpt_code = p_cpt_code
      AND rs.is_active = TRUE
      AND p_date_of_service >= rs.effective_start_date
      AND (rs.effective_end_date IS NULL OR p_date_of_service <= rs.effective_end_date)
    LIMIT 1;

    IF FOUND THEN
        IF p_modifier_1 = '50' OR p_modifier_2 = '50' THEN
            v_mod_factor := v_cpt_record.bilateral_reimbursement_pct;
        ELSIF p_modifier_1 = '73' OR p_modifier_2 = '73' THEN
            v_mod_factor := 0.5000;
        ELSIF p_modifier_1 = '74' OR p_modifier_2 = '74' THEN
            v_mod_factor := 1.0000;
        END IF;

        RETURN QUERY SELECT
            p_cpt_code,
            v_cpt_record.reimbursement_methodology,
            NULL::NUMERIC(12, 2),
            v_cpt_record.medicare_multiplier,
            v_cpt_record.negotiated_rate,
            v_mod_factor,
            0.00::NUMERIC(12, 2),
            FALSE,
            'SPECIFIC_CPT_FEE_SCHEDULE'::VARCHAR(50),
            v_cpt_record.notes;
        RETURN;
    END IF;

    -- Fallback to Percent of Medicare
    IF v_contract_version.default_methodology = 'PERCENT_OF_MEDICARE' THEN
        SELECT * INTO v_medicare_rate
        FROM public.fn_resolve_medicare_base_rate(p_date_of_service, p_cpt_code, p_facility_id);

        IF p_modifier_1 = '50' OR p_modifier_2 = '50' THEN
            v_mod_factor := 1.5000;
        END IF;

        RETURN QUERY SELECT
            p_cpt_code,
            'PERCENT_OF_MEDICARE'::VARCHAR(50),
            v_medicare_rate.base_rate,
            v_contract_version.medicare_multiplier,
            (v_medicare_rate.base_rate * v_contract_version.medicare_multiplier)::NUMERIC(12, 2),
            v_mod_factor,
            COALESCE(v_medicare_rate.device_offset_amount, 0.00),
            (v_medicare_rate.payment_indicator = 'J8'),
            'CONTRACT_MEDICARE_BASELINE'::VARCHAR(50),
            'Resolved from Phase 60 statutory ASC engine'::TEXT;
        RETURN;
    END IF;

    -- Uncontracted Fallback
    RETURN QUERY SELECT
        p_cpt_code,
        'NOT_COVERED'::VARCHAR(50),
        0.00::NUMERIC(12, 2),
        0.0000::NUMERIC(6, 4),
        0.00::NUMERIC(12, 2),
        1.0000::NUMERIC(6, 4),
        0.00::NUMERIC(12, 2),
        FALSE,
        'UNCONTRACTED_FALLBACK'::VARCHAR(50),
        'CPT missing from contracted schedules'::TEXT;
END;
$$;

-- 10.2 fn_calculate_commercial_reimbursement
CREATE OR REPLACE FUNCTION public.fn_calculate_commercial_reimbursement(
    p_surgery_id BIGINT DEFAULT NULL,
    p_contract_version_id UUID DEFAULT NULL,
    p_dry_run BOOLEAN DEFAULT FALSE,
    p_case_id TEXT DEFAULT NULL
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
    v_payer_id UUID;
    v_dos DATE;
    v_contract_version_id UUID;
    v_total_billed NUMERIC(12, 2) := 0.00;
    v_total_allowable NUMERIC(12, 2) := 0.00;
    v_stop_loss RECORD;
BEGIN
    IF p_surgery_id IS NOT NULL THEN
        SELECT s.*, s.facility_id, COALESCE(s.date, CURRENT_DATE) AS dos, f.organization_id INTO v_surgery
        FROM public.surgeries s
        LEFT JOIN public.facilities f ON f.id = s.facility_id
        WHERE s.id = p_surgery_id;

        IF FOUND THEN
            v_facility_id := v_surgery.facility_id;
            v_org_id := v_surgery.organization_id;
            v_dos := v_surgery.dos;
            v_payer_id := v_surgery.primary_payer_id;

            SELECT COALESCE(SUM(line_gross_charge), 0.00) INTO v_total_billed
            FROM public.surgery_procedures WHERE surgery_id = p_surgery_id;
        END IF;
    END IF;

    -- If facility/org not resolved from surgery, fallback to active context
    IF v_facility_id IS NULL THEN
        SELECT id, organization_id INTO v_facility_id, v_org_id FROM public.facilities LIMIT 1;
        v_dos := CURRENT_DATE;
    END IF;

    IF v_payer_id IS NULL THEN
        SELECT id INTO v_payer_id FROM public.payer_master ORDER BY created_at LIMIT 1;
    END IF;

    -- Verify facility access if resolved
    IF v_facility_id IS NOT NULL AND NOT public.is_facility_accessible(v_facility_id) THEN
        RAISE EXCEPTION 'Access Denied: User cannot access facility %.', v_facility_id;
    END IF;

    IF p_contract_version_id IS NULL THEN
        SELECT contract_version_id INTO v_contract_version_id
        FROM public.fn_resolve_payer_contract(v_facility_id, v_payer_id, v_dos);
    ELSE
        v_contract_version_id := p_contract_version_id;
    END IF;

    IF v_contract_version_id IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'UNCONTRACTED_ERROR',
            'message', 'No active, approved commercial contract found for encounter.'
        );
    END IF;

    -- Check Stop-Loss
    SELECT * INTO v_stop_loss
    FROM public.payer_contract_rate_exceptions
    WHERE contract_version_id = v_contract_version_id
      AND exception_type = 'STOP_LOSS'
      AND is_active = TRUE
      AND v_total_billed >= trigger_threshold
    LIMIT 1;

    IF FOUND THEN
        v_total_allowable := ROUND(v_total_billed * v_stop_loss.reimbursement_pct_of_billed, 2);

        IF NOT p_dry_run THEN
            INSERT INTO public.payer_contract_rate_calculations (
                facility_id, organization_id, surgery_id, case_id, payer_id, contract_id,
                contract_version_id, date_of_service, calculation_status,
                total_billed_charges, total_contract_allowable, stop_loss_triggered,
                calculation_hash, calculation_metadata, calculated_by
            ) VALUES (
                v_facility_id, v_org_id, p_surgery_id, COALESCE(p_case_id, p_surgery_id::text), v_payer_id,
                (SELECT contract_id FROM public.payer_contract_versions WHERE id = v_contract_version_id),
                v_contract_version_id, v_dos, 'STOP_LOSS_APPLIED',
                v_total_billed, v_total_allowable, TRUE,
                encode(digest(COALESCE(p_surgery_id::text, '0') || v_total_allowable::text, 'sha256'), 'hex'),
                jsonb_build_object('stop_loss_trigger', v_stop_loss.trigger_threshold, 'stop_loss_pct', v_stop_loss.reimbursement_pct_of_billed),
                auth.uid()
            );
        END IF;

        RETURN jsonb_build_object(
            'status', 'STOP_LOSS_APPLIED',
            'total_billed_charges', v_total_billed,
            'total_contract_allowable', v_total_allowable,
            'stop_loss_threshold', v_stop_loss.trigger_threshold,
            'stop_loss_percentage', v_stop_loss.reimbursement_pct_of_billed
        );
    END IF;

    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'contract_version_id', v_contract_version_id,
        'total_billed_charges', v_total_billed,
        'total_contract_allowable', v_total_allowable
    );
END;
$$;

-- Overload for text/UUID case identifier
CREATE OR REPLACE FUNCTION public.fn_calculate_commercial_reimbursement(
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
    RETURN public.fn_calculate_commercial_reimbursement(
        p_surgery_id => CASE WHEN p_case_id ~ '^[0-9]+$' THEN p_case_id::BIGINT ELSE NULL END,
        p_contract_version_id => p_contract_version_id,
        p_dry_run => p_dry_run,
        p_case_id => p_case_id
    );
END;
$$;

-- 10.3 fn_stage_rate_schedule_import
CREATE OR REPLACE FUNCTION public.fn_stage_rate_schedule_import(
    p_batch_id UUID,
    p_raw_rows JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_row JSONB;
    v_row_num INTEGER := 0;
    v_valid_count INTEGER := 0;
    v_error_count INTEGER := 0;
    v_cpt VARCHAR(10);
    v_rate NUMERIC(12, 2);
    v_mult NUMERIC(6, 4);
    v_status VARCHAR(20);
    v_msg TEXT;
BEGIN
    FOR v_row IN SELECT * FROM jsonb_array_elements(p_raw_rows)
    LOOP
        v_row_num := v_row_num + 1;
        v_cpt := TRIM(v_row->>'cpt_code');
        v_rate := (v_row->>'rate')::NUMERIC;
        v_mult := (v_row->>'multiplier')::NUMERIC;
        v_msg := NULL;

        IF v_cpt IS NULL OR length(v_cpt) < 5 THEN
            v_status := 'ERROR';
            v_msg := 'Invalid CPT/HCPCS code format.';
            v_error_count := v_error_count + 1;
        ELSE
            v_status := 'VALID';
            v_valid_count := v_valid_count + 1;
        END IF;

        INSERT INTO public.payer_contract_rate_import_staging (
            import_batch_id, row_number, raw_cpt_code, raw_description,
            raw_methodology, raw_rate, raw_multiplier, validation_status,
            validation_message, parsed_cpt_code, parsed_rate, parsed_multiplier
        ) VALUES (
            p_batch_id, v_row_num, v_cpt, v_row->>'description',
            v_row->>'methodology', v_row->>'rate', v_row->>'multiplier',
            v_status, v_msg, v_cpt, v_rate, v_mult
        );
    END LOOP;

    UPDATE public.payer_contract_rate_import_batches
    SET total_rows = v_row_num,
        valid_rows = v_valid_count,
        error_rows = v_error_count,
        import_status = CASE WHEN v_error_count > 0 THEN 'VALIDATED_WITH_ERRORS' ELSE 'STAGED' END
    WHERE id = p_batch_id;

    RETURN jsonb_build_object(
        'batch_id', p_batch_id,
        'total_rows', v_row_num,
        'valid_rows', v_valid_count,
        'error_rows', v_error_count
    );
END;
$$;

-- 10.4 fn_commit_rate_schedule_version
CREATE OR REPLACE FUNCTION public.fn_commit_rate_schedule_version(
    p_batch_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_batch RECORD;
    v_committed_count INTEGER := 0;
BEGIN
    SELECT * INTO v_batch
    FROM public.payer_contract_rate_import_batches
    WHERE id = p_batch_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Import Batch % not found.', p_batch_id;
    END IF;

    IF v_batch.import_status NOT IN ('STAGED', 'VALIDATED_WITH_ERRORS') THEN
        RAISE EXCEPTION 'Batch % is in status %, cannot commit.', p_batch_id, v_batch.import_status;
    END IF;

    INSERT INTO public.payer_contract_cpt_rates (
        rate_schedule_id, contract_version_id, cpt_code, description,
        reimbursement_methodology, negotiated_rate, medicare_multiplier
    )
    SELECT
        v_batch.rate_schedule_id,
        v_batch.contract_version_id,
        parsed_cpt_code,
        raw_description,
        COALESCE(raw_methodology, 'COMMERCIAL_FEE_SCHEDULE'),
        parsed_rate,
        parsed_multiplier
    FROM public.payer_contract_rate_import_staging
    WHERE import_batch_id = p_batch_id AND validation_status = 'VALID'
    ON CONFLICT (rate_schedule_id, cpt_code) DO UPDATE SET
        negotiated_rate = EXCLUDED.negotiated_rate,
        medicare_multiplier = EXCLUDED.medicare_multiplier,
        updated_at = timezone('utc', now());

    GET DIAGNOSTICS v_committed_count = ROW_COUNT;

    UPDATE public.payer_contract_rate_import_batches
    SET import_status = 'COMMITTED',
        committed_at = timezone('utc', now())
    WHERE id = p_batch_id;

    RETURN jsonb_build_object(
        'batch_id', p_batch_id,
        'committed_rows', v_committed_count,
        'status', 'COMMITTED'
    );
END;
$$;

-- =====================================================================
-- 11. ROW-LEVEL SECURITY POLICIES
-- =====================================================================

ALTER TABLE public.payer_contract_rate_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_contract_cpt_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_contract_case_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_contract_case_rate_inclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_contract_carve_outs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_contract_rate_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_contract_rate_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_contract_rate_calculation_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_contract_rate_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_contract_rate_import_staging ENABLE ROW LEVEL SECURITY;

-- Rate Schedules Policy
DROP POLICY IF EXISTS rate_schedules_select_policy ON public.payer_contract_rate_schedules;
CREATE POLICY rate_schedules_select_policy
ON public.payer_contract_rate_schedules
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.payer_contract_versions v
        JOIN public.payer_contracts c ON c.id = v.contract_id
        WHERE v.id = payer_contract_rate_schedules.contract_version_id
          AND (c.facility_id IS NULL OR public.is_facility_accessible(c.facility_id))
    )
);

-- CPT Rates Policy
DROP POLICY IF EXISTS cpt_rates_select_policy ON public.payer_contract_cpt_rates;
CREATE POLICY cpt_rates_select_policy
ON public.payer_contract_cpt_rates
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.payer_contract_versions v
        JOIN public.payer_contracts c ON c.id = v.contract_id
        WHERE v.id = payer_contract_cpt_rates.contract_version_id
          AND (c.facility_id IS NULL OR public.is_facility_accessible(c.facility_id))
    )
);

-- Case Rates Policy
DROP POLICY IF EXISTS case_rates_select_policy ON public.payer_contract_case_rates;
CREATE POLICY case_rates_select_policy
ON public.payer_contract_case_rates
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.payer_contract_versions v
        JOIN public.payer_contracts c ON c.id = v.contract_id
        WHERE v.id = payer_contract_case_rates.contract_version_id
          AND (c.facility_id IS NULL OR public.is_facility_accessible(c.facility_id))
    )
);

-- Carve-Outs Policy
DROP POLICY IF EXISTS carve_outs_select_policy ON public.payer_contract_carve_outs;
CREATE POLICY carve_outs_select_policy
ON public.payer_contract_carve_outs
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.payer_contract_versions v
        JOIN public.payer_contracts c ON c.id = v.contract_id
        WHERE v.id = payer_contract_carve_outs.contract_version_id
          AND (c.facility_id IS NULL OR public.is_facility_accessible(c.facility_id))
    )
);

-- Rate Exceptions Policy
DROP POLICY IF EXISTS exceptions_select_policy ON public.payer_contract_rate_exceptions;
CREATE POLICY exceptions_select_policy
ON public.payer_contract_rate_exceptions
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.payer_contract_versions v
        JOIN public.payer_contracts c ON c.id = v.contract_id
        WHERE v.id = payer_contract_rate_exceptions.contract_version_id
          AND (c.facility_id IS NULL OR public.is_facility_accessible(c.facility_id))
    )
);

-- Calculation Snapshots Policy
DROP POLICY IF EXISTS calculations_select_policy ON public.payer_contract_rate_calculations;
CREATE POLICY calculations_select_policy
ON public.payer_contract_rate_calculations
FOR SELECT
TO authenticated
USING (
    public.is_facility_accessible(facility_id)
);

DROP POLICY IF EXISTS calculations_insert_policy ON public.payer_contract_rate_calculations;
CREATE POLICY calculations_insert_policy
ON public.payer_contract_rate_calculations
FOR INSERT
TO authenticated
WITH CHECK (
    public.is_facility_accessible(facility_id)
);

-- Calculation Lines Policy
DROP POLICY IF EXISTS calc_lines_select_policy ON public.payer_contract_rate_calculation_lines;
CREATE POLICY calc_lines_select_policy
ON public.payer_contract_rate_calculation_lines
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.payer_contract_rate_calculations calc
        WHERE calc.id = payer_contract_rate_calculation_lines.calculation_id
          AND public.is_facility_accessible(calc.facility_id)
    )
);

-- =====================================================================
-- 12. SEED BASELINE RATE EXHIBITS & RULES
-- =====================================================================

DO $$
DECLARE
    v_ver_humana UUID;
    v_ver_anthem UUID;
    v_ver_uhc UUID;
    v_sch_humana UUID := '40000000-0000-0000-0000-000000000001'::UUID;
    v_sch_anthem UUID := '40000000-0000-0000-0000-000000000002'::UUID;
    v_sch_uhc UUID    := '40000000-0000-0000-0000-000000000003'::UUID;
    v_case_cataract UUID := '41000000-0000-0000-0000-000000000001'::UUID;
BEGIN
    SELECT id INTO v_ver_humana FROM public.payer_contract_versions WHERE version_number = 1 ORDER BY created_at LIMIT 1;
    SELECT id INTO v_ver_anthem FROM public.payer_contract_versions WHERE version_number = 1 ORDER BY created_at OFFSET 1 LIMIT 1;
    SELECT id INTO v_ver_uhc FROM public.payer_contract_versions WHERE version_number = 1 ORDER BY created_at OFFSET 2 LIMIT 1;

    IF v_ver_humana IS NOT NULL THEN
        -- Schedule 1: Humana Ortho Fee Schedule
        INSERT INTO public.payer_contract_rate_schedules (
            id, contract_version_id, schedule_code, schedule_name, schedule_type,
            effective_start_date, description, is_active
        ) VALUES (
            v_sch_humana, v_ver_humana, 'EXHIBIT_A_ORTHO_2024', 'Exhibit A - Orthopedic Master Fee Schedule',
            'FEE_SCHEDULE', '2024-01-01', 'Contracted CPT line rates for high-volume musculoskeletal cases', TRUE
        ) ON CONFLICT (id) DO UPDATE SET updated_at = timezone('utc', now());

        -- CPT Rates for Humana
        INSERT INTO public.payer_contract_cpt_rates (
            rate_schedule_id, contract_version_id, cpt_code, description,
            reimbursement_methodology, negotiated_rate, bilateral_reimbursement_pct
        ) VALUES
            (v_sch_humana, v_ver_humana, '29881', 'Knee arthroscopy with meniscectomy', 'COMMERCIAL_FEE_SCHEDULE', 3200.00, 1.5000),
            (v_sch_humana, v_ver_humana, '29877', 'Knee arthroscopy chondroplasty', 'COMMERCIAL_FEE_SCHEDULE', 1800.00, 1.5000),
            (v_sch_humana, v_ver_humana, '64721', 'Carpal tunnel neuroplasty open', 'COMMERCIAL_FEE_SCHEDULE', 1600.00, 2.0000)
        ON CONFLICT (rate_schedule_id, cpt_code) DO UPDATE SET negotiated_rate = EXCLUDED.negotiated_rate;

        -- Carve-Out: Implants Invoice + 10%
        INSERT INTO public.payer_contract_carve_outs (
            contract_version_id, carve_out_code, carve_out_name, category,
            reimbursement_model, markup_percentage, min_invoice_threshold_per_item
        ) VALUES (
            v_ver_humana, 'IMPLANT_CARVEOUT_10', 'High-Cost Orthopedic Implant Carve-Out',
            'IMPLANT', 'INVOICE_PLUS_PERCENT', 0.1000, 250.00
        ) ON CONFLICT (contract_version_id, carve_out_code) DO NOTHING;

        -- Stop-Loss Exception: 65% over $75,000
        INSERT INTO public.payer_contract_rate_exceptions (
            contract_version_id, exception_code, exception_name, exception_type,
            trigger_threshold, reimbursement_pct_of_billed, description
        ) VALUES (
            v_ver_humana, 'STOP_LOSS_75K', 'Catastrophic Case Stop-Loss at $75,000',
            'STOP_LOSS', 75000.00, 0.6500, 'Reimburses 65% of total gross charges when charges exceed $75,000'
        ) ON CONFLICT (contract_version_id, exception_code) DO NOTHING;
    END IF;

    IF v_ver_anthem IS NOT NULL THEN
        -- Schedule 2: Cataract Case Rate
        INSERT INTO public.payer_contract_rate_schedules (
            id, contract_version_id, schedule_code, schedule_name, schedule_type,
            effective_start_date, description, is_active
        ) VALUES (
            v_sch_anthem, v_ver_anthem, 'EXHIBIT_B_EYE_CASERATES', 'Exhibit B - Ophthalmology Bundled Packages',
            'CASE_RATE_SET', '2024-01-01', 'Bundled case rates covering cataract surgery and standard IOL', TRUE
        ) ON CONFLICT (id) DO UPDATE SET updated_at = timezone('utc', now());

        INSERT INTO public.payer_contract_case_rates (
            id, rate_schedule_id, contract_version_id, package_code, package_name,
            primary_cpt_code, bundled_rate, includes_anesthesia, includes_facility_fee, includes_standard_implants
        ) VALUES (
            v_case_cataract, v_sch_anthem, v_ver_anthem, 'CATARACT_STD_IOL', 'Cataract Extraction with Standard Monofocal IOL',
            '66984', 2250.00, FALSE, TRUE, TRUE
        ) ON CONFLICT (id) DO UPDATE SET bundled_rate = EXCLUDED.bundled_rate;

        INSERT INTO public.payer_contract_case_rate_inclusions (
            case_rate_id, included_code, code_type, description, is_bundled
        ) VALUES
            (v_case_cataract, 'V2632', 'HCPCS', 'Posterior chamber intraocular lens', TRUE),
            (v_case_cataract, 'C1713', 'HCPCS', 'Intraocular lens prosthesis', TRUE)
        ON CONFLICT (case_rate_id, included_code) DO NOTHING;
    END IF;
END $$;

COMMIT;

