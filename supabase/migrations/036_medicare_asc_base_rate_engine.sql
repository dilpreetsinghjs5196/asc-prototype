-- ==============================================================================
-- MIGRATION 036: MEDICARE ASC BASE RATE ENGINE & GEOGRAPHIC WAGE INDEX (PHASE 60)
-- ==============================================================================
-- Description: Establishes statutory Medicare ASC baseline rate resolution:
--              1. Extends cms_asc_releases with conversion factors & 50/50 labor share.
--              2. Creates public.facility_medicare_settings (CBSA & ASCQR mapping).
--              3. Creates public.medicare_wage_indices (CBSA wage index by release).
--              4. Creates public.medicare_base_rate_calculations (immutable audit ledger).
--              5. Creates public.medicare_base_rate_calc_lines (itemized explainability).
--              6. Creates public.medicare_rate_import_batches & staging pipeline.
--              7. Deploys authoritative fn_resolve_medicare_base_rate & fn_calculate_case_medicare_baseline.
--              8. Hardens is_facility_accessible with active facility membership check.
--              9. Configures Row Level Security (RLS) & immutability triggers.
-- Specification: docs/phases/60_MEDICARE_ASC_BASE_RATE_ENGINE.md
-- Target Engine: Supabase PostgreSQL 15+
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. EXTEND CMS REGULATORY RELEASES WITH CONVERSION FACTORS & SHARES
-- ==============================================================================

ALTER TABLE public.cms_asc_releases
    ADD COLUMN IF NOT EXISTS conversion_factor NUMERIC(10, 4) NOT NULL DEFAULT 53.5140,
    ADD COLUMN IF NOT EXISTS labor_related_share NUMERIC(5, 4) NOT NULL DEFAULT 0.5000 CHECK (labor_related_share BETWEEN 0.0000 AND 1.0000),
    ADD COLUMN IF NOT EXISTS non_labor_share NUMERIC(5, 4) NOT NULL DEFAULT 0.5000 CHECK (non_labor_share BETWEEN 0.0000 AND 1.0000),
    ADD COLUMN IF NOT EXISTS ascqr_reduction_factor NUMERIC(5, 4) NOT NULL DEFAULT 0.9800 CHECK (ascqr_reduction_factor BETWEEN 0.8000 AND 1.0000);

-- Update seed releases with verified statutory conversion factors
UPDATE public.cms_asc_releases
SET 
    conversion_factor = 50.2610,
    labor_related_share = 0.5000,
    non_labor_share = 0.5000,
    ascqr_reduction_factor = 0.9800
WHERE release_year = 2024;

UPDATE public.cms_asc_releases
SET 
    conversion_factor = 51.9830,
    labor_related_share = 0.5000,
    non_labor_share = 0.5000,
    ascqr_reduction_factor = 0.9800
WHERE release_year = 2025;

UPDATE public.cms_asc_releases
SET 
    conversion_factor = 53.5140,
    labor_related_share = 0.5000,
    non_labor_share = 0.5000,
    ascqr_reduction_factor = 0.9800
WHERE release_year = 2026;

-- ==============================================================================
-- 2. MEDICARE WAGE INDICES CATALOG (CBSA LEVEL)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.medicare_wage_indices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    release_id UUID NOT NULL REFERENCES public.cms_asc_releases(id) ON DELETE RESTRICT,
    cbsa_code VARCHAR(5) NOT NULL,
    cbsa_name TEXT NOT NULL,
    state_code VARCHAR(2) NOT NULL,
    wage_index NUMERIC(6, 4) NOT NULL CHECK (wage_index > 0.0000),
    is_rural_floor BOOLEAN NOT NULL DEFAULT false,
    effective_start_date DATE NOT NULL,
    effective_end_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_cbsa_release UNIQUE (release_id, cbsa_code),
    CONSTRAINT chk_wage_index_dates CHECK (effective_end_date IS NULL OR effective_end_date >= effective_start_date)
);

CREATE INDEX IF NOT EXISTS idx_wage_indices_release ON public.medicare_wage_indices(release_id);
CREATE INDEX IF NOT EXISTS idx_wage_indices_cbsa ON public.medicare_wage_indices(cbsa_code);

-- Seed Baseline CBSA Wage Indices for CY 2026 (release 10000000-0000-0000-0000-000000002026)
INSERT INTO public.medicare_wage_indices (
    release_id, cbsa_code, cbsa_name, state_code, wage_index, effective_start_date, effective_end_date
) VALUES
(
    '10000000-0000-0000-0000-000000002026',
    '34940', 'Naples-Immokalee-Marco Island', 'FL', 0.9412, '2026-01-01', NULL
),
(
    '10000000-0000-0000-0000-000000002026',
    '33100', 'Miami-Fort Lauderdale-Pompano Beach', 'FL', 0.9785, '2026-01-01', NULL
),
(
    '10000000-0000-0000-0000-000000002026',
    '45300', 'Tampa-St. Petersburg-Clearwater', 'FL', 0.9124, '2026-01-01', NULL
),
(
    '10000000-0000-0000-0000-000000002026',
    '36740', 'Orlando-Kissimmee-Sanford', 'FL', 0.9250, '2026-01-01', NULL
),
(
    '10000000-0000-0000-0000-000000002026',
    '00000', 'National ASC Baseline (Unadjusted 1.0000)', 'US', 1.0000, '2026-01-01', NULL
)
ON CONFLICT (release_id, cbsa_code) DO UPDATE
SET wage_index = EXCLUDED.wage_index;

-- Seed Baseline CBSA Wage Indices for CY 2025 (release 10000000-0000-0000-0000-000000002025)
INSERT INTO public.medicare_wage_indices (
    release_id, cbsa_code, cbsa_name, state_code, wage_index, effective_start_date, effective_end_date
) VALUES
(
    '10000000-0000-0000-0000-000000002025',
    '34940', 'Naples-Immokalee-Marco Island', 'FL', 0.9405, '2025-01-01', '2025-12-31'
),
(
    '10000000-0000-0000-0000-000000002025',
    '00000', 'National ASC Baseline (Unadjusted 1.0000)', 'US', 1.0000, '2025-01-01', '2025-12-31'
)
ON CONFLICT (release_id, cbsa_code) DO UPDATE
SET wage_index = EXCLUDED.wage_index;

-- ==============================================================================
-- 3. FACILITY MEDICARE SETTINGS (CBSA & ASCQR TENANCY)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.facility_medicare_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL UNIQUE REFERENCES public.facilities(id) ON DELETE CASCADE,
    medicare_provider_number VARCHAR(10) NOT NULL DEFAULT '10-0001',
    cbsa_code VARCHAR(5) NOT NULL DEFAULT '34940',
    cbsa_name TEXT NOT NULL DEFAULT 'Naples-Immokalee-Marco Island, FL',
    ascqr_compliant BOOLEAN NOT NULL DEFAULT true,
    effective_start_date DATE NOT NULL DEFAULT '2024-01-01',
    effective_end_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_fac_medicare_dates CHECK (effective_end_date IS NULL OR effective_end_date >= effective_start_date)
);

CREATE INDEX IF NOT EXISTS idx_fac_medicare_settings ON public.facility_medicare_settings(facility_id);

-- Seed Naples Surgery Center Medicare Provider Configuration
INSERT INTO public.facility_medicare_settings (
    facility_id, medicare_provider_number, cbsa_code, cbsa_name, ascqr_compliant, effective_start_date
) VALUES (
    '00000000-0000-0000-0000-000000000002',
    '10-ASC02',
    '34940',
    'Naples-Immokalee-Marco Island, FL',
    true,
    '2024-01-01'
)
ON CONFLICT (facility_id) DO UPDATE SET
    cbsa_code = EXCLUDED.cbsa_code,
    ascqr_compliant = EXCLUDED.ascqr_compliant,
    updated_at = NOW();

-- Backfill other existing facilities with Default Baseline settings
INSERT INTO public.facility_medicare_settings (facility_id, medicare_provider_number, cbsa_code, cbsa_name, ascqr_compliant)
SELECT f.id, '10-' || SUBSTRING(f.id::text FROM 1 FOR 6), '34940', 'Naples-Immokalee-Marco Island, FL', true
FROM public.facilities f
WHERE f.id <> '00000000-0000-0000-0000-000000000002'
ON CONFLICT (facility_id) DO NOTHING;

-- ==============================================================================
-- 4. MEDICARE BASE RATE CALCULATIONS & AUDIT LEDGER
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.medicare_base_rate_calculations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    surgery_id BIGINT REFERENCES public.surgeries(id) ON DELETE SET NULL,
    date_of_service DATE NOT NULL,
    release_id UUID NOT NULL REFERENCES public.cms_asc_releases(id),
    cbsa_code VARCHAR(5) NOT NULL,
    wage_index_applied NUMERIC(6, 4) NOT NULL,
    ascqr_penalty_applied BOOLEAN NOT NULL DEFAULT false,
    total_unadjusted_baseline NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_wage_adjusted_baseline NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    line_item_count INTEGER NOT NULL DEFAULT 0,
    calculated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    calculation_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medicare_calc_fac ON public.medicare_base_rate_calculations(facility_id);
CREATE INDEX IF NOT EXISTS idx_medicare_calc_surg ON public.medicare_base_rate_calculations(surgery_id);
CREATE INDEX IF NOT EXISTS idx_medicare_calc_dos ON public.medicare_base_rate_calculations(date_of_service);

CREATE TABLE IF NOT EXISTS public.medicare_base_rate_calc_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calculation_id UUID NOT NULL REFERENCES public.medicare_base_rate_calculations(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL,
    cpt_code VARCHAR(10) NOT NULL,
    units INTEGER NOT NULL DEFAULT 1 CHECK (units >= 1),
    payment_indicator VARCHAR(5) NOT NULL,
    coverage_status VARCHAR(30) NOT NULL,
    relative_weight NUMERIC(10, 4),
    national_unadjusted_rate NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    is_device_intensive BOOLEAN NOT NULL DEFAULT false,
    device_offset_percentage NUMERIC(5, 4) DEFAULT 0.0000,
    device_offset_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    service_portion_unadjusted NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    service_portion_wage_adjusted NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    final_unit_base_rate NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    line_total_base_rate NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    CONSTRAINT uq_medicare_calc_line UNIQUE (calculation_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_medicare_calc_lines_calc ON public.medicare_base_rate_calc_lines(calculation_id);
CREATE INDEX IF NOT EXISTS idx_medicare_calc_lines_code ON public.medicare_base_rate_calc_lines(cpt_code);

-- ==============================================================================
-- 5. MEDICARE REGULATORY IMPORT STAGING & BATCHES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.medicare_rate_import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    release_year INTEGER NOT NULL,
    release_quarter VARCHAR(2) NOT NULL DEFAULT 'Q1',
    rule_type VARCHAR(20) NOT NULL DEFAULT 'Final',
    source_filename TEXT NOT NULL,
    file_checksum_sha256 VARCHAR(64) NOT NULL,
    total_rows_detected INTEGER NOT NULL DEFAULT 0,
    valid_rows_count INTEGER NOT NULL DEFAULT 0,
    error_rows_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Discovered'
        CHECK (status IN ('Discovered', 'Staged', 'Validated', 'Reviewed', 'Approved', 'Published', 'Rejected')),
    imported_by UUID REFERENCES auth.users(id),
    approved_by UUID REFERENCES auth.users(id),
    validated_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    error_summary JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.medicare_rate_import_staging (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES public.medicare_rate_import_batches(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    cpt_code VARCHAR(10) NOT NULL,
    short_descriptor TEXT,
    addendum_source VARCHAR(2) NOT NULL DEFAULT 'AA',
    payment_indicator VARCHAR(5) NOT NULL,
    relative_weight NUMERIC(10, 4),
    national_unadjusted_rate NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    is_device_intensive BOOLEAN NOT NULL DEFAULT false,
    device_offset_percentage NUMERIC(5, 4) DEFAULT 0.0000,
    validation_status TEXT NOT NULL DEFAULT 'Pending'
        CHECK (validation_status IN ('Pending', 'Valid', 'Duplicate_In_Batch', 'Invalid_Indicator', 'Invalid_Rate')),
    validation_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medicare_staging_batch ON public.medicare_rate_import_staging(batch_id, validation_status);

-- ==============================================================================
-- 6. IMMUTABILITY & SAFETY TRIGGERS
-- ==============================================================================

-- Trigger: Prevent deletion of audited Medicare calculations
CREATE OR REPLACE FUNCTION public.fn_prevent_medicare_calc_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'FORBIDDEN: Medicare base rate calculation audit ledger records cannot be deleted. Traceability invariant.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_medicare_calc_delete ON public.medicare_base_rate_calculations;
CREATE TRIGGER trg_prevent_medicare_calc_delete
BEFORE DELETE ON public.medicare_base_rate_calculations
FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_medicare_calc_delete();

-- Trigger: Cross-facility relocation prevention on facility_medicare_settings
DROP TRIGGER IF EXISTS trg_prevent_facility_relocation_medicare ON public.facility_medicare_settings;
CREATE TRIGGER trg_prevent_facility_relocation_medicare
BEFORE UPDATE ON public.facility_medicare_settings
FOR EACH ROW EXECUTE FUNCTION public.prevent_facility_relocation();

-- ==============================================================================
-- 7. AUTHORITATIVE MEDICARE BASE RATE RESOLUTION FUNCTION
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_resolve_medicare_base_rate(
    p_dos DATE,
    p_code VARCHAR(10),
    p_facility_id UUID DEFAULT NULL,
    p_wage_index_override NUMERIC DEFAULT NULL
)
RETURNS TABLE (
    code VARCHAR(10),
    description TEXT,
    payment_indicator VARCHAR(5),
    is_covered BOOLEAN,
    coverage_status VARCHAR(30),
    is_device_intensive BOOLEAN,
    device_offset_percentage NUMERIC(5, 4),
    device_offset_amount NUMERIC(12, 2),
    national_unadjusted_rate NUMERIC(12, 2),
    cbsa_code VARCHAR(5),
    wage_index_applied NUMERIC(6, 4),
    service_portion_unadjusted NUMERIC(12, 2),
    service_portion_adjusted NUMERIC(12, 2),
    wage_adjusted_rate NUMERIC(12, 2),
    is_packaged BOOLEAN,
    provenance_release TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_code VARCHAR(10) := UPPER(TRIM(p_code));
    v_rel_id UUID;
    v_rel_label TEXT;
    v_cbsa VARCHAR(5) := '00000';
    v_wage NUMERIC(6, 4) := 1.0000;
    v_ascqr_compliant BOOLEAN := true;
    v_labor_share NUMERIC(5, 4) := 0.5000;
    v_non_labor_share NUMERIC(5, 4) := 0.5000;
    v_ascqr_factor NUMERIC(5, 4) := 0.9800;
    
    v_desc TEXT := 'Unresolved Code';
    v_pi VARCHAR(5) := 'N/A';
    v_nat_rate NUMERIC(12, 2) := 0.00;
    v_cov_stat VARCHAR(30) := 'Non_Covered';
    v_is_dev BOOLEAN := false;
    v_dev_pct NUMERIC(5, 4) := 0.0000;
    v_dev_amt NUMERIC(12, 2) := 0.00;
    v_srv_unadj NUMERIC(12, 2) := 0.00;
    v_srv_adj NUMERIC(12, 2) := 0.00;
    v_final_adj NUMERIC(12, 2) := 0.00;
    v_is_pkg BOOLEAN := false;
BEGIN
    -- 1. Identify active CMS Release for Date of Service
    SELECT r.id, (r.release_year::text || ' ' || r.release_quarter || ' ' || r.rule_type),
           r.labor_related_share, r.non_labor_share, r.ascqr_reduction_factor
    INTO v_rel_id, v_rel_label, v_labor_share, v_non_labor_share, v_ascqr_factor
    FROM public.cms_asc_releases r
    WHERE r.is_active = true
      AND r.effective_start_date <= p_dos
      AND (r.effective_end_date IS NULL OR r.effective_end_date >= p_dos)
    ORDER BY r.effective_start_date DESC
    LIMIT 1;

    -- Fallback: Use latest active release if DOS falls slightly outside bound
    IF v_rel_id IS NULL THEN
        SELECT r.id, (r.release_year::text || ' ' || r.release_quarter || ' ' || r.rule_type),
               r.labor_related_share, r.non_labor_share, r.ascqr_reduction_factor
        INTO v_rel_id, v_rel_label, v_labor_share, v_non_labor_share, v_ascqr_factor
        FROM public.cms_asc_releases r
        WHERE r.is_active = true
        ORDER BY r.release_year DESC, r.effective_start_date DESC
        LIMIT 1;
    END IF;

    -- 2. Resolve Facility Geographic CBSA & ASCQR settings
    IF p_facility_id IS NOT NULL THEN
        SELECT s.cbsa_code, s.ascqr_compliant
        INTO v_cbsa, v_ascqr_compliant
        FROM public.facility_medicare_settings s
        WHERE s.facility_id = p_facility_id
          AND s.effective_start_date <= p_dos
          AND (s.effective_end_date IS NULL OR s.effective_end_date >= p_dos)
        LIMIT 1;
    END IF;

    -- 3. Resolve CBSA Wage Index
    IF p_wage_index_override IS NOT NULL AND p_wage_index_override > 0 THEN
        v_wage := p_wage_index_override;
    ELSIF v_rel_id IS NOT NULL AND v_cbsa IS NOT NULL THEN
        SELECT w.wage_index INTO v_wage
        FROM public.medicare_wage_indices w
        WHERE w.release_id = v_rel_id AND w.cbsa_code = v_cbsa
        LIMIT 1;

        -- Fallback to national average wage index 1.0000 if CBSA not in release table
        IF v_wage IS NULL THEN
            v_wage := 1.0000;
        END IF;
    END IF;

    -- 4. Query CMS ASC Addenda (AA, BB, EE)
    IF v_rel_id IS NOT NULL THEN
        SELECT a.short_descriptor, a.payment_indicator, a.national_unadjusted_rate,
               a.coverage_status, a.is_device_intensive, a.device_offset_percentage,
               a.device_offset_amount
        INTO v_desc, v_pi, v_nat_rate, v_cov_stat, v_is_dev, v_dev_pct, v_dev_amt
        FROM public.cms_asc_addenda a
        WHERE a.release_id = v_rel_id AND a.code = v_code
        LIMIT 1;
    END IF;

    -- If not found in cms_asc_addenda, check global cpt_code_versions
    IF v_pi = 'N/A' OR v_pi IS NULL THEN
        SELECT SUBSTRING(COALESCE(m.short_descriptor, m.description, v_code) FROM 1 FOR 255),
               COALESCE(v.payment_indicator, 'A2'),
               COALESCE(v.reimbursement, 0.00),
               COALESCE(v.coverage_status, 'Covered_Surgical'),
               COALESCE(v.is_device_intensive, false),
               COALESCE(v.device_offset_percentage, 0.0000),
               COALESCE(v.device_offset_amount, 0.00)
        INTO v_desc, v_pi, v_nat_rate, v_cov_stat, v_is_dev, v_dev_pct, v_dev_amt
        FROM public.cpt_code_versions v
        JOIN public.cpt_master m ON v.cpt_master_id = m.id
        WHERE m.code = v_code
          AND v.facility_id IS NULL
          AND v.effective_date <= p_dos
          AND (v.termination_date IS NULL OR v.termination_date >= p_dos)
        ORDER BY v.effective_date DESC
        LIMIT 1;
    END IF;

    -- 5. Fail-Closed Check for Non-Covered / Unresolved
    IF v_pi = 'N/A' OR v_pi IS NULL OR v_cov_stat IN ('Inpatient_Only', 'Non_Covered') THEN
        RETURN QUERY SELECT 
            v_code, COALESCE(v_desc, 'Unresolved / Non-Covered Procedure'),
            COALESCE(v_pi, 'N/A'), false, COALESCE(v_cov_stat, 'Non_Covered'),
            false, 0.0000::NUMERIC(5, 4), 0.00::NUMERIC(12, 2), 0.00::NUMERIC(12, 2),
            v_cbsa, v_wage, 0.00::NUMERIC(12, 2), 0.00::NUMERIC(12, 2), 0.00::NUMERIC(12, 2),
            false, COALESCE(v_rel_label, 'CMS Regulatory Release');
        RETURN;
    END IF;

    -- 6. Evaluate Packaged Codes (N1)
    IF v_pi = 'N1' THEN
        v_is_pkg := true;
        RETURN QUERY SELECT 
            v_code, v_desc, v_pi, true, 'Packaged'::VARCHAR(30),
            false, 0.0000::NUMERIC(5, 4), 0.00::NUMERIC(12, 2), 0.00::NUMERIC(12, 2),
            v_cbsa, v_wage, 0.00::NUMERIC(12, 2), 0.00::NUMERIC(12, 2), 0.00::NUMERIC(12, 2),
            true, COALESCE(v_rel_label, 'CMS Regulatory Release');
        RETURN;
    END IF;

    -- 7. Mathematical Geographic Wage Adjustment (50% Labor, 50% Non-Labor)
    IF v_is_dev AND v_dev_amt > 0 AND v_dev_amt < v_nat_rate THEN
        -- Device-Intensive: Device portion is exempt from wage index
        v_srv_unadj := v_nat_rate - v_dev_amt;
        v_srv_adj := (v_srv_unadj * v_labor_share * v_wage) + (v_srv_unadj * v_non_labor_share);
        
        -- Apply ASCQR penalty to service portion if non-compliant
        IF NOT v_ascqr_compliant THEN
            v_srv_adj := v_srv_adj * v_ascqr_factor;
        END IF;

        v_final_adj := ROUND(v_dev_amt + v_srv_adj, 2);
    ELSE
        -- Standard Surgical / Ancillary procedure
        v_srv_unadj := v_nat_rate;
        v_srv_adj := (v_nat_rate * v_labor_share * v_wage) + (v_nat_rate * v_non_labor_share);

        IF NOT v_ascqr_compliant THEN
            v_srv_adj := v_srv_adj * v_ascqr_factor;
        END IF;

        v_final_adj := ROUND(v_srv_adj, 2);
        v_dev_amt := 0.00;
        v_dev_pct := 0.0000;
    END IF;

    RETURN QUERY SELECT 
        v_code, v_desc, v_pi, true, v_cov_stat,
        v_is_dev, v_dev_pct, v_dev_amt,
        v_nat_rate, v_cbsa, v_wage,
        v_srv_unadj, ROUND(v_srv_adj, 2), v_final_adj,
        false, COALESCE(v_rel_label, 'CMS Regulatory Release');
END;
$$;

-- ==============================================================================
-- 8. AUTHORITATIVE SERVER-SIDE CASE MEDICARE BASELINE PROCEDURE
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_calculate_case_medicare_baseline(p_surgery_id BIGINT)
RETURNS TABLE (
    calculation_id UUID,
    surgery_id BIGINT,
    date_of_service DATE,
    cbsa_code VARCHAR(5),
    wage_index_applied NUMERIC(6, 4),
    ascqr_penalty_applied BOOLEAN,
    total_unadjusted_baseline NUMERIC(12, 2),
    total_wage_adjusted_baseline NUMERIC(12, 2),
    line_item_count INTEGER,
    calculation_hash VARCHAR(64)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_surg_date DATE;
    v_fac_id UUID;
    v_status TEXT;
    v_calc_id UUID;
    v_rel_id UUID;
    v_cbsa VARCHAR(5) := '34940';
    v_wage NUMERIC(6, 4) := 0.9412;
    v_ascqr_compliant BOOLEAN := true;
    v_tot_unadj NUMERIC(12, 2) := 0.00;
    v_tot_adj NUMERIC(12, 2) := 0.00;
    v_count INTEGER := 0;
    v_hash TEXT;
    v_line RECORD;
BEGIN
    SELECT s.date, s.facility_id, s.status
    INTO v_surg_date, v_fac_id, v_status
    FROM public.surgeries s
    WHERE s.id = p_surgery_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Surgery case % not found', p_surgery_id;
    END IF;

    -- Freeze Policy: Do not overwrite completed/billed cases unless explicitly permitted
    -- (Complies with User Decision A1)
    SELECT id INTO v_calc_id
    FROM public.medicare_base_rate_calculations
    WHERE surgery_id = p_surgery_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_calc_id IS NOT NULL AND v_status IN ('Completed', 'Billed') THEN
        RETURN QUERY SELECT 
            c.id, c.surgery_id, c.date_of_service, c.cbsa_code, c.wage_index_applied,
            c.ascqr_penalty_applied, c.total_unadjusted_baseline, c.total_wage_adjusted_baseline,
            c.line_item_count, c.calculation_hash
        FROM public.medicare_base_rate_calculations c
        WHERE c.id = v_calc_id;
        RETURN;
    END IF;

    -- Get release
    SELECT r.id INTO v_rel_id
    FROM public.cms_asc_releases r
    WHERE r.is_active = true
    ORDER BY r.release_year DESC
    LIMIT 1;

    -- Get facility CBSA
    SELECT s.cbsa_code, s.ascqr_compliant INTO v_cbsa, v_ascqr_compliant
    FROM public.facility_medicare_settings s
    WHERE s.facility_id = v_fac_id
    LIMIT 1;

    IF v_cbsa IS NULL THEN
        v_cbsa := '34940';
    END IF;

    -- Get Wage Index
    SELECT w.wage_index INTO v_wage
    FROM public.medicare_wage_indices w
    WHERE w.release_id = v_rel_id AND w.cbsa_code = v_cbsa
    LIMIT 1;

    IF v_wage IS NULL THEN
        v_wage := 0.9412;
    END IF;

    v_calc_id := gen_random_uuid();
    v_hash := encode(digest(p_surgery_id::text || ':' || v_surg_date::text || ':' || v_fac_id::text || ':' || clock_timestamp()::text, 'sha256'), 'hex');

    -- Insert calculation header
    INSERT INTO public.medicare_base_rate_calculations (
        id, facility_id, surgery_id, date_of_service, release_id,
        cbsa_code, wage_index_applied, ascqr_penalty_applied,
        total_unadjusted_baseline, total_wage_adjusted_baseline,
        line_item_count, calculated_by, calculation_hash
    ) VALUES (
        v_calc_id, v_fac_id, p_surgery_id, COALESCE(v_surg_date, CURRENT_DATE), v_rel_id,
        v_cbsa, v_wage, NOT v_ascqr_compliant,
        0.00, 0.00, 0, auth.uid(), v_hash
    );

    -- Calculate line items
    FOR v_line IN (
        SELECT 
            sp.sequence_rank,
            COALESCE(c.code, '') AS cpt_code,
            sp.units,
            r.*
        FROM public.surgery_procedures sp
        LEFT JOIN public.cpt_codes c ON sp.cpt_code_id = c.id
        CROSS JOIN LATERAL public.fn_resolve_medicare_base_rate(
            COALESCE(v_surg_date, CURRENT_DATE),
            COALESCE(c.code, ''),
            v_fac_id,
            v_wage
        ) r
        WHERE sp.surgery_id = p_surgery_id
        ORDER BY sp.sequence_rank ASC
    ) LOOP
        v_count := v_count + 1;
        v_tot_unadj := v_tot_unadj + (v_line.national_unadjusted_rate * v_line.units);
        v_tot_adj := v_tot_adj + (v_line.wage_adjusted_rate * v_line.units);

        INSERT INTO public.medicare_base_rate_calc_lines (
            calculation_id, line_number, cpt_code, units, payment_indicator,
            coverage_status, relative_weight, national_unadjusted_rate,
            is_device_intensive, device_offset_percentage, device_offset_amount,
            service_portion_unadjusted, service_portion_wage_adjusted,
            final_unit_base_rate, line_total_base_rate
        ) VALUES (
            v_calc_id, v_count, v_line.cpt_code, v_line.units, v_line.payment_indicator,
            v_line.coverage_status, 1.0000, v_line.national_unadjusted_rate,
            v_line.is_device_intensive, v_line.device_offset_percentage, v_line.device_offset_amount,
            v_line.service_portion_unadjusted, v_line.service_portion_adjusted,
            v_line.wage_adjusted_rate, (v_line.wage_adjusted_rate * v_line.units)
        );
    END LOOP;

    -- Update header totals
    UPDATE public.medicare_base_rate_calculations
    SET total_unadjusted_baseline = v_tot_unadj,
        total_wage_adjusted_baseline = v_tot_adj,
        line_item_count = v_count
    WHERE id = v_calc_id;

    RETURN QUERY SELECT 
        v_calc_id, p_surgery_id, COALESCE(v_surg_date, CURRENT_DATE), v_cbsa, v_wage,
        NOT v_ascqr_compliant, v_tot_unadj, v_tot_adj, v_count, v_hash;
END;
$$;

-- ==============================================================================
-- 9. HARDEN IS_FACILITY_ACCESSIBLE WITH MEMBERSHIP VALIDATION
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.is_facility_accessible(p_facility_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
    IF p_facility_id IS NULL THEN
        RETURN TRUE;
    END IF;

    -- Global super_admin can inspect any facility
    IF user_has_facility_role(NULL, ARRAY['super_admin']) THEN
        RETURN TRUE;
    END IF;

    -- Calling user must have active facility membership
    RETURN EXISTS (
        SELECT 1 FROM public.facility_memberships fm
        JOIN public.facilities f ON fm.facility_id = f.id
        WHERE fm.facility_id = p_facility_id
          AND fm.user_id = auth.uid()
          AND fm.is_active = TRUE
          AND f.is_active = TRUE
    );
END;
$$;

-- ==============================================================================
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.facility_medicare_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicare_wage_indices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicare_base_rate_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicare_base_rate_calc_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicare_rate_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicare_rate_import_staging ENABLE ROW LEVEL SECURITY;

-- 10.1 Wage Indices (Global reference data readable by all authenticated users)
CREATE POLICY rls_wage_indices_select ON public.medicare_wage_indices
    FOR SELECT TO authenticated USING (true);

CREATE POLICY rls_wage_indices_modify ON public.medicare_wage_indices
    FOR ALL TO authenticated USING (
        user_has_facility_role(NULL, ARRAY['super_admin']) OR (auth.jwt()->>'role') = 'service_role'
    );

-- 10.2 Facility Medicare Settings
CREATE POLICY rls_fac_medicare_select ON public.facility_medicare_settings
    FOR SELECT TO authenticated USING (
        user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'biller', 'coder', 'viewer'])
        OR user_has_facility_role(NULL, ARRAY['super_admin'])
    );

CREATE POLICY rls_fac_medicare_modify ON public.facility_medicare_settings
    FOR ALL TO authenticated USING (
        user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo'])
        OR user_has_facility_role(NULL, ARRAY['super_admin'])
        OR (auth.jwt()->>'role') = 'service_role'
    );

-- 10.3 Medicare Calculations Ledger
CREATE POLICY rls_medicare_calc_select ON public.medicare_base_rate_calculations
    FOR SELECT TO authenticated USING (
        user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'biller', 'coder'])
        OR user_has_facility_role(NULL, ARRAY['super_admin'])
    );

CREATE POLICY rls_medicare_calc_insert ON public.medicare_base_rate_calculations
    FOR INSERT TO authenticated WITH CHECK (
        user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'biller', 'coder'])
        OR user_has_facility_role(NULL, ARRAY['super_admin'])
        OR (auth.jwt()->>'role') = 'service_role'
    );

-- 10.4 Medicare Calculation Lines
CREATE POLICY rls_medicare_lines_select ON public.medicare_base_rate_calc_lines
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.medicare_base_rate_calculations c
            WHERE c.id = calculation_id AND (
                user_has_facility_role(c.facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'biller', 'coder'])
                OR user_has_facility_role(NULL, ARRAY['super_admin'])
            )
        )
    );

-- 10.5 Import Batches & Staging
CREATE POLICY rls_medicare_batches_select ON public.medicare_rate_import_batches
    FOR SELECT TO authenticated USING (true);

CREATE POLICY rls_medicare_batches_modify ON public.medicare_rate_import_batches
    FOR ALL TO authenticated USING (
        user_has_facility_role(NULL, ARRAY['super_admin'])
        OR EXISTS (
            SELECT 1 FROM public.facility_memberships fm
            WHERE fm.user_id = auth.uid() AND fm.role IN ('super_admin', 'org_admin', 'facility_admin', 'cfo', 'biller', 'coder')
        )
        OR (auth.jwt()->>'role') = 'service_role'
    );

CREATE POLICY rls_medicare_staging_select ON public.medicare_rate_import_staging
    FOR SELECT TO authenticated USING (true);

CREATE POLICY rls_medicare_staging_modify ON public.medicare_rate_import_staging
    FOR ALL TO authenticated USING (
        user_has_facility_role(NULL, ARRAY['super_admin'])
        OR EXISTS (
            SELECT 1 FROM public.facility_memberships fm
            WHERE fm.user_id = auth.uid() AND fm.role IN ('super_admin', 'org_admin', 'facility_admin', 'cfo', 'biller', 'coder')
        )
        OR (auth.jwt()->>'role') = 'service_role'
    );

COMMIT;

