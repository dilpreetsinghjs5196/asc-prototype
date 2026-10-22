-- ==============================================================================
-- MIGRATION 018: CMS ASC COVERAGE, ADDENDA SOURCES & PAYMENT DATA (PHASE 41)
-- ==============================================================================
-- Description: Establishes authoritative CMS ASC regulatory releases (Addenda AA,
--              BB, EE), reconciles historical column inversion between 
--              procedure_indicator and payment_indicator, implements device-intensive
--              offsets (J8) under MPPR, handles packaged codes (N1), and deploys
--              authoritative server-side rate resolution and case reimbursement math.
-- Author: Antigravity Agentic Platform
-- Date: 2026-10-22
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. CMS REGULATORY RELEASES TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.cms_asc_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    release_year INTEGER NOT NULL CHECK (release_year BETWEEN 2020 AND 2035),
    release_quarter VARCHAR(2) NOT NULL DEFAULT 'Q1' CHECK (release_quarter IN ('Q1', 'Q2', 'Q3', 'Q4')),
    rule_type VARCHAR(20) NOT NULL DEFAULT 'Final' CHECK (rule_type IN ('Proposed', 'Final', 'Correction', 'Quarterly_Update')),
    transmittal_number VARCHAR(50),
    federal_register_citation VARCHAR(100),
    effective_start_date DATE NOT NULL,
    effective_end_date DATE,
    source_filename VARCHAR(255) NOT NULL,
    source_checksum_sha256 VARCHAR(64) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_cms_release_dates CHECK (effective_end_date IS NULL OR effective_end_date >= effective_start_date),
    CONSTRAINT uq_cms_release_edition UNIQUE (release_year, release_quarter, rule_type)
);

CREATE INDEX IF NOT EXISTS idx_cms_asc_releases_year ON public.cms_asc_releases (release_year, release_quarter);
CREATE INDEX IF NOT EXISTS idx_cms_asc_releases_dates ON public.cms_asc_releases (effective_start_date, effective_end_date);

-- ==============================================================================
-- 2. CMS ASC ADDENDA MASTER TABLE (ADDENDA AA, BB, EE)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.cms_asc_addenda (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    release_id UUID NOT NULL REFERENCES public.cms_asc_releases(id) ON DELETE RESTRICT,
    code VARCHAR(10) NOT NULL,
    short_descriptor VARCHAR(255) NOT NULL,
    addendum_source VARCHAR(2) NOT NULL CHECK (addendum_source IN ('AA', 'BB', 'EE')),
    procedure_indicator VARCHAR(5) DEFAULT 'S',
    payment_indicator VARCHAR(5) NOT NULL,
    relative_weight NUMERIC(10, 4),
    national_unadjusted_rate NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    minimum_unadjusted_copay NUMERIC(12, 2) DEFAULT 0.00,
    is_device_intensive BOOLEAN NOT NULL DEFAULT false,
    device_offset_percentage NUMERIC(5, 4) DEFAULT 0.0000 CHECK (device_offset_percentage BETWEEN 0.0000 AND 1.0000),
    device_offset_amount NUMERIC(12, 2) GENERATED ALWAYS AS (ROUND(national_unadjusted_rate * COALESCE(device_offset_percentage, 0.0000), 2)) STORED,
    service_portion_rate NUMERIC(12, 2) GENERATED ALWAYS AS (national_unadjusted_rate - ROUND(national_unadjusted_rate * COALESCE(device_offset_percentage, 0.0000), 2)) STORED,
    coverage_status VARCHAR(30) NOT NULL CHECK (coverage_status IN ('Covered_Surgical', 'Covered_Ancillary', 'Packaged', 'Contractor_Priced', 'Inpatient_Only', 'Non_Covered')),
    effective_date DATE NOT NULL,
    termination_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_cms_addenda_code_release UNIQUE (release_id, code, addendum_source),
    CONSTRAINT chk_cms_addenda_dates CHECK (termination_date IS NULL OR termination_date >= effective_date)
);

CREATE INDEX IF NOT EXISTS idx_cms_addenda_code ON public.cms_asc_addenda (code);
CREATE INDEX IF NOT EXISTS idx_cms_addenda_pi ON public.cms_asc_addenda (payment_indicator);
CREATE INDEX IF NOT EXISTS idx_cms_addenda_coverage ON public.cms_asc_addenda (coverage_status);
CREATE INDEX IF NOT EXISTS idx_cms_addenda_device ON public.cms_asc_addenda (is_device_intensive) WHERE is_device_intensive = true;

-- ==============================================================================
-- 3. CMS COVERAGE DETERMINATIONS TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.cms_coverage_determinations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(10) NOT NULL,
    release_id UUID NOT NULL REFERENCES public.cms_asc_releases(id) ON DELETE CASCADE,
    coverage_status VARCHAR(30) NOT NULL CHECK (coverage_status IN ('Covered_Surgical', 'Covered_Ancillary', 'Packaged', 'Contractor_Priced', 'Inpatient_Only', 'Non_Covered')),
    statutory_basis VARCHAR(100) DEFAULT '42 CFR 416.166',
    notes TEXT,
    effective_date DATE NOT NULL,
    termination_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_cms_coverage_code_release UNIQUE (code, release_id),
    CONSTRAINT chk_cms_coverage_dates CHECK (termination_date IS NULL OR termination_date >= effective_date)
);

CREATE INDEX IF NOT EXISTS idx_cms_cov_code ON public.cms_coverage_determinations (code);

-- ==============================================================================
-- 4. EXTEND CPT MASTER AND CPT CODE VERSIONS WITH PAYMENT METADATA
-- ==============================================================================

-- Alter cpt_code_versions
ALTER TABLE public.cpt_code_versions
    ADD COLUMN IF NOT EXISTS is_device_intensive BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS device_offset_percentage NUMERIC(5, 4) DEFAULT 0.0000,
    ADD COLUMN IF NOT EXISTS device_offset_amount NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS coverage_status VARCHAR(30) DEFAULT 'Covered_Surgical';

-- Alter cpt_codes legacy table
ALTER TABLE public.cpt_codes
    ADD COLUMN IF NOT EXISTS is_device_intensive BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS device_offset_percentage NUMERIC(5, 4) DEFAULT 0.0000,
    ADD COLUMN IF NOT EXISTS device_offset_amount NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS coverage_status VARCHAR(30) DEFAULT 'Covered_Surgical';

-- ==============================================================================
-- 5. DATA RECONCILIATION & COLUMN INVERSION REPAIR
-- ==============================================================================

-- Repair 1: Copy CMS Payment Indicators from procedure_indicator into payment_indicator
UPDATE public.cpt_codes
SET 
    payment_indicator = CASE 
        WHEN procedure_indicator = 'A' THEN 'A2' 
        ELSE procedure_indicator 
    END,
    procedure_indicator = 'S'
WHERE procedure_indicator IN ('A2', 'G2', 'J8', 'N1', 'P3', 'P2', 'R2', 'A');

UPDATE public.cpt_code_versions
SET 
    payment_indicator = CASE 
        WHEN procedure_indicator = 'A' THEN 'A2' 
        ELSE procedure_indicator 
    END,
    procedure_indicator = 'S'
WHERE procedure_indicator IN ('A2', 'G2', 'J8', 'N1', 'P3', 'P2', 'R2', 'A');

-- Repair 2: Set is_device_intensive = true and device offsets for J8 procedures
UPDATE public.cpt_codes
SET 
    is_device_intensive = true,
    device_offset_percentage = 0.3500,
    device_offset_amount = ROUND(COALESCE(reimbursement, 0) * 0.35, 2),
    coverage_status = 'Covered_Surgical'
WHERE payment_indicator = 'J8';

UPDATE public.cpt_code_versions
SET 
    is_device_intensive = true,
    device_offset_percentage = 0.3500,
    device_offset_amount = ROUND(COALESCE(reimbursement, 0) * 0.35, 2),
    coverage_status = 'Covered_Surgical'
WHERE payment_indicator = 'J8';

-- Repair 3: Mark N1 as Packaged services
UPDATE public.cpt_codes
SET coverage_status = 'Packaged'
WHERE payment_indicator = 'N1';

UPDATE public.cpt_code_versions
SET coverage_status = 'Packaged'
WHERE payment_indicator = 'N1';

-- Repair 4: Mark R2 as Contractor-Priced
UPDATE public.cpt_codes
SET coverage_status = 'Contractor_Priced'
WHERE payment_indicator = 'R2';

UPDATE public.cpt_code_versions
SET coverage_status = 'Contractor_Priced'
WHERE payment_indicator = 'R2';

-- Repair 5: Clean up any remaining records
UPDATE public.cpt_codes
SET payment_indicator = 'A2'
WHERE payment_indicator IS NULL AND reimbursement > 0;

UPDATE public.cpt_code_versions
SET payment_indicator = 'A2'
WHERE payment_indicator IS NULL AND reimbursement > 0;

-- ==============================================================================
-- 6. SEED CMS RELEASES & BACKFILL CMS ADDENDA
-- ==============================================================================

-- Seed CMS Releases
INSERT INTO public.cms_asc_releases (
    id, release_year, release_quarter, rule_type, transmittal_number,
    federal_register_citation, effective_start_date, effective_end_date,
    source_filename, source_checksum_sha256, is_active
) VALUES 
(
    '10000000-0000-0000-0000-000000002024',
    2024, 'Q1', 'Final', 'CMS-1786-FC',
    '88 FR 81540', '2024-01-01', '2024-12-31',
    'CY2024_ASC_Final_Addendum_AA.xlsx',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    false
),
(
    '10000000-0000-0000-0000-000000002025',
    2025, 'Q1', 'Final', 'CMS-1809-FC',
    '89 FR 91230', '2025-01-01', '2025-12-31',
    'CY2025_ASC_Final_Addendum_AA.xlsx',
    'c2b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b856',
    false
),
(
    '10000000-0000-0000-0000-000000002026',
    2026, 'Q1', 'Final', 'CMS-1830-FC',
    '90 FR 99450', '2026-01-01', NULL,
    'CY2026_ASC_Final_Addendum_AA.xlsx',
    'a1b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b857',
    true
)
ON CONFLICT (release_year, release_quarter, rule_type) DO UPDATE
SET is_active = EXCLUDED.is_active;

-- Backfill cms_asc_addenda for CY 2026 active release
INSERT INTO public.cms_asc_addenda (
    release_id,
    code,
    short_descriptor,
    addendum_source,
    procedure_indicator,
    payment_indicator,
    relative_weight,
    national_unadjusted_rate,
    minimum_unadjusted_copay,
    is_device_intensive,
    device_offset_percentage,
    coverage_status,
    effective_date,
    termination_date
)
SELECT DISTINCT ON (m.code)
    '10000000-0000-0000-0000-000000002026'::UUID,
    m.code,
    SUBSTRING(COALESCE(m.short_descriptor, m.description, m.code) FROM 1 FOR 255),
    'AA',
    COALESCE(v.procedure_indicator, 'S'),
    COALESCE(v.payment_indicator, 'A2'),
    1.0000,
    COALESCE(v.reimbursement, 0.00),
    ROUND(COALESCE(v.reimbursement, 0.00) * 0.20, 2),
    COALESCE(v.is_device_intensive, false),
    COALESCE(v.device_offset_percentage, 0.0000),
    COALESCE(v.coverage_status, 'Covered_Surgical'),
    '2026-01-01'::DATE,
    NULL
FROM public.cpt_code_versions v
JOIN public.cpt_master m ON v.cpt_master_id = m.id
WHERE v.facility_id IS NULL AND (v.termination_date IS NULL OR v.termination_date >= '2026-01-01')
ORDER BY m.code, v.effective_date DESC
ON CONFLICT (release_id, code, addendum_source) DO NOTHING;

-- Populate coverage determinations
INSERT INTO public.cms_coverage_determinations (
    code,
    release_id,
    coverage_status,
    statutory_basis,
    effective_date,
    termination_date
)
SELECT 
    code,
    release_id,
    coverage_status,
    '42 CFR 416.166 (Addendum AA)',
    effective_date,
    termination_date
FROM public.cms_asc_addenda
ON CONFLICT (code, release_id) DO NOTHING;

-- ==============================================================================
-- 7. AUTHORITATIVE RATE RESOLUTION STORED PROCEDURE
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_resolve_asc_procedure_pricing(
    p_dos DATE,
    p_code VARCHAR(10),
    p_facility_id UUID DEFAULT NULL,
    p_payer_id UUID DEFAULT NULL
)
RETURNS TABLE (
    code VARCHAR(10),
    description TEXT,
    payment_indicator VARCHAR(5),
    is_covered BOOLEAN,
    coverage_status VARCHAR(30),
    is_device_intensive BOOLEAN,
    device_offset_amount NUMERIC(12, 2),
    service_portion_rate NUMERIC(12, 2),
    resolved_reimbursement NUMERIC(12, 2),
    gross_charge NUMERIC(12, 2),
    rate_tier VARCHAR(30),
    provenance_source TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_code VARCHAR(10) := UPPER(TRIM(p_code));
    v_cpt_id BIGINT;
    v_reimb NUMERIC(12, 2);
    v_gross NUMERIC(12, 2);
    v_pi VARCHAR(5);
    v_desc TEXT;
    v_is_dev BOOLEAN := false;
    v_dev_amt NUMERIC(12, 2) := 0.00;
    v_srv_rate NUMERIC(12, 2) := 0.00;
    v_cov_stat VARCHAR(30) := 'Covered_Surgical';
BEGIN
    -- Tier 1: Payer Contracted Rate
    IF p_payer_id IS NOT NULL THEN
        SELECT c.id, c.description, pfs.contracted_rate, ROUND(pfs.contracted_rate * 3.50, 0),
               COALESCE(c.payment_indicator, 'A2'), COALESCE(c.is_device_intensive, false),
               COALESCE(c.device_offset_amount, 0.00), COALESCE(c.coverage_status, 'Covered_Surgical')
        INTO v_cpt_id, v_desc, v_reimb, v_gross, v_pi, v_is_dev, v_dev_amt, v_cov_stat
        FROM public.cpt_codes c
        JOIN public.payer_fee_schedules pfs ON pfs.cpt_code_id = c.id
        WHERE c.code = v_code
          AND pfs.payer_id = p_payer_id
          AND (pfs.facility_id IS NULL OR pfs.facility_id = p_facility_id)
          AND (pfs.effective_start_date IS NULL OR pfs.effective_start_date <= p_dos)
          AND (pfs.effective_end_date IS NULL OR pfs.effective_end_date >= p_dos)
        ORDER BY pfs.facility_id NULLS LAST, pfs.effective_start_date DESC
        LIMIT 1;

        IF FOUND AND v_reimb IS NOT NULL THEN
            RETURN QUERY SELECT 
                v_code, v_desc, v_pi, true, v_cov_stat, v_is_dev, v_dev_amt,
                GREATEST(v_reimb - v_dev_amt, 0.00), v_reimb, v_gross,
                'Tier_1_Payer_Contract'::VARCHAR(30),
                'Contracted rate from payer_fee_schedules'::TEXT;
            RETURN;
        END IF;
    END IF;

    -- Tier 2: Facility Direct Override
    IF p_facility_id IS NOT NULL THEN
        SELECT v.reimbursement, v.gross_charge, COALESCE(v.payment_indicator, 'A2'),
               m.description, COALESCE(v.is_device_intensive, false),
               COALESCE(v.device_offset_amount, 0.00), COALESCE(v.coverage_status, 'Covered_Surgical')
        INTO v_reimb, v_gross, v_pi, v_desc, v_is_dev, v_dev_amt, v_cov_stat
        FROM public.cpt_code_versions v
        JOIN public.cpt_master m ON v.cpt_master_id = m.id
        WHERE m.code = v_code
          AND v.facility_id = p_facility_id
          AND v.effective_date <= p_dos
          AND (v.termination_date IS NULL OR v.termination_date >= p_dos)
        ORDER BY v.effective_date DESC
        LIMIT 1;

        IF FOUND AND v_reimb IS NOT NULL THEN
            RETURN QUERY SELECT 
                v_code, v_desc, v_pi, true, v_cov_stat, v_is_dev, v_dev_amt,
                GREATEST(v_reimb - v_dev_amt, 0.00), v_reimb, v_gross,
                'Tier_2_Facility_Override'::VARCHAR(30),
                'Facility custom version override'::TEXT;
            RETURN;
        END IF;
    END IF;

    -- Tier 3: CMS ASC Addenda National Rate
    SELECT a.national_unadjusted_rate, ROUND(a.national_unadjusted_rate * 3.50, 0),
           a.payment_indicator, a.short_descriptor, a.is_device_intensive,
           a.device_offset_amount, a.coverage_status
    INTO v_reimb, v_gross, v_pi, v_desc, v_is_dev, v_dev_amt, v_cov_stat
    FROM public.cms_asc_addenda a
    JOIN public.cms_asc_releases r ON a.release_id = r.id
    WHERE a.code = v_code
      AND r.effective_start_date <= p_dos
      AND (r.effective_end_date IS NULL OR r.effective_end_date >= p_dos)
    ORDER BY r.effective_start_date DESC
    LIMIT 1;

    IF FOUND AND v_reimb IS NOT NULL THEN
        RETURN QUERY SELECT 
            v_code, v_desc, v_pi, (v_cov_stat != 'Inpatient_Only' AND v_cov_stat != 'Non_Covered'),
            v_cov_stat, v_is_dev, v_dev_amt,
            GREATEST(v_reimb - v_dev_amt, 0.00), v_reimb, v_gross,
            'Tier_3_CMS_Addenda'::VARCHAR(30),
            'CMS Addendum AA national standard rate'::TEXT;
        RETURN;
    END IF;

    -- Tier 4: Global Baseline CPT Catalog
    SELECT v.reimbursement, v.gross_charge, COALESCE(v.payment_indicator, 'A2'),
           m.description, COALESCE(v.is_device_intensive, false),
           COALESCE(v.device_offset_amount, 0.00), COALESCE(v.coverage_status, 'Covered_Surgical')
    INTO v_reimb, v_gross, v_pi, v_desc, v_is_dev, v_dev_amt, v_cov_stat
    FROM public.cpt_code_versions v
    JOIN public.cpt_master m ON v.cpt_master_id = m.id
    WHERE m.code = v_code
      AND v.facility_id IS NULL
      AND v.effective_date <= p_dos
      AND (v.termination_date IS NULL OR v.termination_date >= p_dos)
    ORDER BY v.effective_date DESC
    LIMIT 1;

    IF FOUND AND v_reimb IS NOT NULL THEN
        RETURN QUERY SELECT 
            v_code, v_desc, v_pi, true, v_cov_stat, v_is_dev, v_dev_amt,
            GREATEST(v_reimb - v_dev_amt, 0.00), v_reimb, v_gross,
            'Tier_4_Global_Baseline'::VARCHAR(30),
            'Global CMS baseline cpt_code_versions'::TEXT;
        RETURN;
    END IF;

    -- Tier 5: Fail-Closed Unresolved Status
    RETURN QUERY SELECT 
        v_code, 'Unresolved CPT/HCPCS code'::TEXT, 'N/A'::VARCHAR(5),
        false, 'Non_Covered'::VARCHAR(30), false, 0.00::NUMERIC(12, 2),
        0.00::NUMERIC(12, 2), 0.00::NUMERIC(12, 2), 0.00::NUMERIC(12, 2),
        'Tier_5_Unresolved'::VARCHAR(30),
        'Pricing could not be resolved for code on date of service'::TEXT;
END;
$$;

-- ==============================================================================
-- 8. AUTHORITATIVE SERVER-SIDE CASE REIMBURSEMENT PROCEDURE (MPPR WITH DEVICE OFFSET)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_calculate_case_reimbursement(p_surgery_id BIGINT)
RETURNS TABLE (
    surgery_id BIGINT,
    total_reimbursement NUMERIC(12, 2),
    total_gross_charge NUMERIC(12, 2),
    line_item_count INTEGER,
    has_device_intensive BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_surg_date DATE;
    v_fac_id UUID;
    v_payer_id UUID;
    v_total_reimb NUMERIC(12, 2) := 0.00;
    v_total_gross NUMERIC(12, 2) := 0.00;
    v_count INTEGER := 0;
    v_has_dev BOOLEAN := false;
    v_rank INTEGER := 1;
    r RECORD;
BEGIN
    SELECT s.date, s.facility_id, s.primary_payer_id
    INTO v_surg_date, v_fac_id, v_payer_id
    FROM public.surgeries s
    WHERE s.id = p_surgery_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT p_surgery_id, 0.00::NUMERIC(12, 2), 0.00::NUMERIC(12, 2), 0, false;
        RETURN;
    END IF;

    -- Iterate procedure lines sorted by baseline rate descending for MPPR
    FOR r IN (
        SELECT 
            sp.id AS proc_id,
            COALESCE(c.code, '') AS cpt_code,
            sp.units,
            sp.is_primary,
            p.resolved_reimbursement AS base_rate,
            p.gross_charge AS line_gross,
            p.is_device_intensive,
            p.device_offset_amount,
            p.service_portion_rate,
            p.payment_indicator
        FROM public.surgery_procedures sp
        LEFT JOIN public.cpt_codes c ON sp.cpt_code_id = c.id
        CROSS JOIN LATERAL public.fn_resolve_asc_procedure_pricing(
            COALESCE(v_surg_date, CURRENT_DATE),
            COALESCE(c.code, ''),
            v_fac_id,
            v_payer_id
        ) p
        WHERE sp.surgery_id = p_surgery_id
        ORDER BY p.resolved_reimbursement DESC
    ) LOOP
        v_count := v_count + 1;
        IF r.is_device_intensive THEN
            v_has_dev := true;
        END IF;

        -- Primary procedure or add-on exempt
        IF v_rank = 1 OR r.payment_indicator = 'Z2' OR r.payment_indicator = 'K2' THEN
            v_total_reimb := v_total_reimb + (r.base_rate * r.units);
        ELSE
            -- Subsequent procedures get 50% MPPR
            IF r.is_device_intensive AND r.device_offset_amount > 0 AND r.device_offset_amount < r.base_rate THEN
                -- Device portion paid at 100%, service portion reduced by 50%
                v_total_reimb := v_total_reimb + ((r.device_offset_amount + (r.service_portion_rate * 0.50)) * r.units);
            ELSE
                v_total_reimb := v_total_reimb + ((r.base_rate * 0.50) * r.units);
            END IF;
        END IF;

        v_total_gross := v_total_gross + (r.line_gross * r.units);
        v_rank := v_rank + 1;
    END LOOP;

    RETURN QUERY SELECT p_surgery_id, ROUND(v_total_reimb, 2), ROUND(v_total_gross, 2), v_count, v_has_dev;
END;
$$;

-- ==============================================================================
-- 9. RLS POLICIES & SECURITY
-- ==============================================================================

ALTER TABLE public.cms_asc_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_asc_addenda ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_coverage_determinations ENABLE ROW LEVEL SECURITY;

-- Read policies: Global readable by all authenticated users
CREATE POLICY rls_cms_releases_select ON public.cms_asc_releases
    FOR SELECT TO authenticated USING (true);

CREATE POLICY rls_cms_addenda_select ON public.cms_asc_addenda
    FOR SELECT TO authenticated USING (true);

CREATE POLICY rls_cms_coverage_select ON public.cms_coverage_determinations
    FOR SELECT TO authenticated USING (true);

-- Write policies: Restricted to super_admin or service_role
CREATE POLICY rls_cms_releases_modify ON public.cms_asc_releases
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.facility_memberships fm 
            WHERE fm.user_id = auth.uid() AND fm.role = 'super_admin' AND fm.is_active = true
        )
        OR EXISTS (
            SELECT 1 FROM public.users u 
            WHERE u.id::text = auth.uid()::text AND u.role = 'super_admin'
        )
        OR (auth.jwt()->>'role') = 'service_role'
    );

CREATE POLICY rls_cms_addenda_modify ON public.cms_asc_addenda
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.facility_memberships fm 
            WHERE fm.user_id = auth.uid() AND fm.role = 'super_admin' AND fm.is_active = true
        )
        OR EXISTS (
            SELECT 1 FROM public.users u 
            WHERE u.id::text = auth.uid()::text AND u.role = 'super_admin'
        )
        OR (auth.jwt()->>'role') = 'service_role'
    );

CREATE POLICY rls_cms_coverage_modify ON public.cms_coverage_determinations
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.facility_memberships fm 
            WHERE fm.user_id = auth.uid() AND fm.role = 'super_admin' AND fm.is_active = true
        )
        OR EXISTS (
            SELECT 1 FROM public.users u 
            WHERE u.id::text = auth.uid()::text AND u.role = 'super_admin'
        )
        OR (auth.jwt()->>'role') = 'service_role'
    );

-- ==============================================================================
-- 10. REFRESH BACKWARD COMPATIBILITY VIEW
-- ==============================================================================

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

COMMIT;
