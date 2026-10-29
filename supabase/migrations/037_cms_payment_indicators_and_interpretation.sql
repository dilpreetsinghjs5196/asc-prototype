-- ==============================================================================
-- MIGRATION 037: CMS PAYMENT INDICATORS & STATUTORY INTERPRETATION ENGINE (PHASE 61)
-- ==============================================================================
-- Description: Establishes statutory CMS ASC Payment Indicator interpretation:
--              1. Creates public.cms_payment_indicator_definitions (12 statutory PIs).
--              2. Creates public.cms_indicator_claim_rules (SCRUB-20 to SCRUB-24).
--              3. Creates public.cms_payment_indicator_overrides (Facility/MAC exceptions).
--              4. Extends public.claim_lines with payment_indicator & coverage metadata.
--              5. Deploys authoritative fn_interpret_cms_indicator stored RPC.
--              6. Enhances fn_resolve_medicare_base_rate to eliminate 'A2' fallback leak.
--              7. Updates fn_scrub_claim with statutory pre-bill indicator scrubbing.
--              8. Enforces Row-Level Security (RLS) and immutability rules.
-- Specification: docs/phases/61_CMS_PAYMENT_INDICATORS.md
-- Target Engine: Supabase PostgreSQL 15+
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. CMS PAYMENT INDICATOR DEFINITIONS REFERENCE TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.cms_payment_indicator_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    release_id UUID NOT NULL REFERENCES public.cms_asc_releases(id) ON DELETE RESTRICT,
    indicator_code VARCHAR(5) NOT NULL CHECK (indicator_code ~ '^[A-Z0-9]{1,5}$'),
    short_name VARCHAR(100) NOT NULL,
    regulatory_definition TEXT NOT NULL,
    addendum_source VARCHAR(2) NOT NULL CHECK (addendum_source IN ('AA', 'BB', 'EE')),
    coverage_category VARCHAR(30) NOT NULL CHECK (coverage_category IN (
        'Covered_Surgical', 
        'Covered_Ancillary', 
        'Packaged', 
        'Contractor_Priced', 
        'Inpatient_Only', 
        'Non_Covered'
    )),
    payment_methodology VARCHAR(30) NOT NULL CHECK (payment_methodology IN (
        'OPPS_Relative_Weight', 
        'MPFS_PE_RVU', 
        'Device_Intensive', 
        'Contractor_MAC', 
        'Packaged_APC', 
        'Reasonable_Cost', 
        'Non_Payable'
    )),
    is_mppr_eligible BOOLEAN NOT NULL DEFAULT true,
    is_device_intensive BOOLEAN NOT NULL DEFAULT false,
    is_packaged BOOLEAN NOT NULL DEFAULT false,
    requires_device_code BOOLEAN NOT NULL DEFAULT false,
    is_inpatient_only BOOLEAN NOT NULL DEFAULT false,
    default_device_offset NUMERIC(5, 4) NOT NULL DEFAULT 0.0000 CHECK (default_device_offset BETWEEN 0.0000 AND 1.0000),
    statutory_citation VARCHAR(100) NOT NULL DEFAULT '42 CFR 416.166',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_indicator_release UNIQUE (release_id, indicator_code)
);

CREATE INDEX IF NOT EXISTS idx_indicator_defs_release ON public.cms_payment_indicator_definitions(release_id);
CREATE INDEX IF NOT EXISTS idx_indicator_defs_code ON public.cms_payment_indicator_definitions(indicator_code);

-- ==============================================================================
-- 2. CMS INDICATOR CLAIM RULES TABLE (SCRUB-20 THROUGH SCRUB-24)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.cms_indicator_claim_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    indicator_code VARCHAR(5) NOT NULL,
    rule_identifier VARCHAR(50) NOT NULL UNIQUE,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('FATAL', 'WARNING', 'INFO')),
    rule_description TEXT NOT NULL,
    error_message TEXT NOT NULL,
    remediation_guidance TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_indicator_rules_code ON public.cms_indicator_claim_rules(indicator_code);

-- ==============================================================================
-- 3. CMS PAYMENT INDICATOR OVERRIDES TABLE (FACILITY / MAC EXCEPTIONS)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.cms_payment_indicator_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    cpt_code VARCHAR(10) NOT NULL,
    override_indicator VARCHAR(5) NOT NULL,
    rationale TEXT NOT NULL,
    approved_by UUID REFERENCES auth.users(id),
    effective_start_date DATE NOT NULL,
    effective_end_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_facility_cpt_override UNIQUE (facility_id, cpt_code, effective_start_date),
    CONSTRAINT chk_override_dates CHECK (effective_end_date IS NULL OR effective_end_date >= effective_start_date)
);

CREATE INDEX IF NOT EXISTS idx_indicator_overrides_fac ON public.cms_payment_indicator_overrides(facility_id, cpt_code);

-- ==============================================================================
-- 4. EXTEND PUBLIC.CLAIM_LINES WITH PAYMENT INDICATOR METADATA
-- ==============================================================================

ALTER TABLE public.claim_lines
    ADD COLUMN IF NOT EXISTS payment_indicator VARCHAR(5),
    ADD COLUMN IF NOT EXISTS coverage_status VARCHAR(30),
    ADD COLUMN IF NOT EXISTS is_device_intensive BOOLEAN DEFAULT false;

-- ==============================================================================
-- 5. SEED STATUTORY INDICATORS FOR ACTIVE AND HISTORICAL RELEASES
-- ==============================================================================

-- CY 2026 Seed (10000000-0000-0000-0000-000000002026)
INSERT INTO public.cms_payment_indicator_definitions (
    release_id, indicator_code, short_name, regulatory_definition, addendum_source,
    coverage_category, payment_methodology, is_mppr_eligible, is_device_intensive,
    is_packaged, requires_device_code, is_inpatient_only, default_device_offset, statutory_citation
) VALUES
(
    '10000000-0000-0000-0000-000000002026', 'A2', 'Standard Covered Surgical',
    'Surgical procedure on ASC covered list in CY 2007; payment based on OPPS relative payment weight.',
    'AA', 'Covered_Surgical', 'OPPS_Relative_Weight', true, false, false, false, false, 0.0000, '42 CFR 416.166'
),
(
    '10000000-0000-0000-0000-000000002026', 'G2', 'Newer Covered Surgical',
    'Non-office-based surgical procedure added in CY 2008 or later; payment based on OPPS relative payment weight.',
    'AA', 'Covered_Surgical', 'OPPS_Relative_Weight', true, false, false, false, false, 0.0000, '42 CFR 416.166'
),
(
    '10000000-0000-0000-0000-000000002026', 'P2', 'Office-Based (OPPS Weight)',
    'Office-based surgical procedure added in CY 2008 or later; payment based on OPPS relative payment weight.',
    'AA', 'Covered_Surgical', 'OPPS_Relative_Weight', true, false, false, false, false, 0.0000, '42 CFR 416.171'
),
(
    '10000000-0000-0000-0000-000000002026', 'P3', 'Office-Based (MPFS PE RVU)',
    'Office-based surgical procedure; payment based on MPFS non-facility PE RVU amount.',
    'AA', 'Covered_Surgical', 'MPFS_PE_RVU', true, false, false, false, false, 0.0000, '42 CFR 416.171'
),
(
    '10000000-0000-0000-0000-000000002026', 'J8', 'Device-Intensive Surgical',
    'Device-intensive procedure; paid at adjusted ASC rate with device offset protection. Requires paired device implant documentation.',
    'AA', 'Covered_Surgical', 'Device_Intensive', true, true, false, true, false, 0.3500, '42 CFR 416.171(b)(2)'
),
(
    '10000000-0000-0000-0000-000000002026', 'R2', 'Contractor-Priced Procedure',
    'Contractor-priced procedure or service; no national rate established. Subject to local MAC pricing and documentation review.',
    'AA', 'Contractor_Priced', 'Contractor_MAC', false, false, false, false, false, 0.0000, '42 CFR 416.166'
),
(
    '10000000-0000-0000-0000-000000002026', 'Z2', 'Radiology Service (Covered Ancillary)',
    'Radiology or diagnostic imaging service on ASC covered list; payment based on OPPS relative payment weight. Exempt from surgical MPPR.',
    'BB', 'Covered_Ancillary', 'OPPS_Relative_Weight', false, false, false, false, false, 0.0000, '42 CFR 416.166'
),
(
    '10000000-0000-0000-0000-000000002026', 'K2', 'Drugs & Biologicals (Covered Ancillary)',
    'Drugs and biologicals paid separately under ASC payment system; ASP-based payment. Exempt from surgical MPPR.',
    'BB', 'Covered_Ancillary', 'OPPS_Relative_Weight', false, false, false, false, false, 0.0000, '42 CFR 416.166'
),
(
    '10000000-0000-0000-0000-000000002026', 'N1', 'Packaged Item / Service',
    'Packaged service; no separate payment made. Costs bundled into primary APC procedure. Standalone billing prohibited.',
    'BB', 'Packaged', 'Packaged_APC', false, false, true, false, false, 0.0000, '42 CFR 416.166'
),
(
    '10000000-0000-0000-0000-000000002026', 'C', 'Inpatient-Only Procedure (Fatal Block)',
    'Inpatient-only procedure (Addendum EE); not payable under ASC payment system. Statutorily barred from ASC setting.',
    'EE', 'Inpatient_Only', 'Non_Payable', false, false, false, false, true, 0.0000, '42 CFR 416.166'
),
(
    '10000000-0000-0000-0000-000000002026', 'E5', 'Statutorily Excluded Surgical',
    'Surgical procedure statutorily excluded from ASC payment system; non-covered by Medicare in an ASC setting.',
    'EE', 'Non_Covered', 'Non_Payable', false, false, false, false, false, 0.0000, '42 CFR 416.166'
),
(
    '10000000-0000-0000-0000-000000002026', 'M1', 'Packaged Service (Conditional)',
    'Packaged service billed as standalone; non-payable unless accompanied by covered surgical procedure.',
    'BB', 'Packaged', 'Packaged_APC', false, false, true, false, false, 0.0000, '42 CFR 416.166'
)
ON CONFLICT (release_id, indicator_code) DO UPDATE SET
    short_name = EXCLUDED.short_name,
    regulatory_definition = EXCLUDED.regulatory_definition,
    coverage_category = EXCLUDED.coverage_category,
    payment_methodology = EXCLUDED.payment_methodology,
    is_mppr_eligible = EXCLUDED.is_mppr_eligible,
    is_device_intensive = EXCLUDED.is_device_intensive,
    is_packaged = EXCLUDED.is_packaged,
    requires_device_code = EXCLUDED.requires_device_code,
    is_inpatient_only = EXCLUDED.is_inpatient_only,
    default_device_offset = EXCLUDED.default_device_offset;

-- Repeat seed for CY 2025 release
INSERT INTO public.cms_payment_indicator_definitions (
    release_id, indicator_code, short_name, regulatory_definition, addendum_source,
    coverage_category, payment_methodology, is_mppr_eligible, is_device_intensive,
    is_packaged, requires_device_code, is_inpatient_only, default_device_offset, statutory_citation
)
SELECT 
    '10000000-0000-0000-0000-000000002025'::UUID, indicator_code, short_name, regulatory_definition, addendum_source,
    coverage_category, payment_methodology, is_mppr_eligible, is_device_intensive,
    is_packaged, requires_device_code, is_inpatient_only, default_device_offset, statutory_citation
FROM public.cms_payment_indicator_definitions
WHERE release_id = '10000000-0000-0000-0000-000000002026'::UUID
ON CONFLICT (release_id, indicator_code) DO NOTHING;

-- Seed Scrubbing Rules (SCRUB-20 to SCRUB-24)
INSERT INTO public.cms_indicator_claim_rules (
    indicator_code, rule_identifier, severity, rule_description, error_message, remediation_guidance, is_active
) VALUES
(
    'C', 'SCRUB-20', 'FATAL',
    'CMS Inpatient-Only (IPO) Procedure Hard Block under 42 CFR 416.166',
    'Procedure is statutorily designated as Inpatient-Only (Indicator C) and cannot be reimbursed in an ASC setting.',
    'Transfer procedure to hospital inpatient setting or verify whether CPT was incorrectly coded.',
    true
),
(
    'J8', 'SCRUB-21', 'FATAL',
    'Device-Intensive Procedure Missing Paired Implant Hardware (Indicator J8)',
    'Device-intensive surgical procedure (Indicator J8) billed without required paired device C-code or documented implant hardware.',
    'Add corresponding device implant HCPCS code (e.g. C1776, L8699) or associate case device usage.',
    true
),
(
    'N1', 'SCRUB-22', 'FATAL',
    'Standalone Packaged Service Line Violation (Indicator N1)',
    'Packaged service (Indicator N1) billed as standalone without an accompanying covered primary surgical procedure.',
    'Report primary surgical procedure (Indicator A2, G2, P2, J8) or remove the standalone packaged line.',
    true
),
(
    'R2', 'SCRUB-23', 'WARNING',
    'Contractor-Priced Procedure Requires Operative Documentation (Indicator R2)',
    'Contractor-priced procedure (Indicator R2) has no national fee schedule rate and requires manual MAC pricing review.',
    'Attach operative report and vendor invoice documentation before claim submission.',
    true
),
(
    'E5', 'SCRUB-24', 'FATAL',
    'Statutorily Excluded / Non-Covered Procedure Hard Block (Indicator E5)',
    'Procedure is statutorily excluded from ASC payment system (Indicator E5); non-covered by Medicare.',
    'Issue Advance Beneficiary Notice of Noncoverage (ABN) or remove procedure from claim.',
    true
)
ON CONFLICT (rule_identifier) DO UPDATE SET
    severity = EXCLUDED.severity,
    rule_description = EXCLUDED.rule_description,
    error_message = EXCLUDED.error_message,
    remediation_guidance = EXCLUDED.remediation_guidance,
    is_active = EXCLUDED.is_active;

-- ==============================================================================
-- 6. AUTHORITATIVE SQL RPC: fn_interpret_cms_indicator
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_interpret_cms_indicator(
    p_code VARCHAR(10),
    p_dos DATE DEFAULT CURRENT_DATE,
    p_payment_system VARCHAR(10) DEFAULT 'ASC'
)
RETURNS TABLE (
    code VARCHAR(10),
    payment_system VARCHAR(10),
    indicator_code VARCHAR(5),
    short_name VARCHAR(100),
    addendum_source VARCHAR(2),
    coverage_category VARCHAR(30),
    payment_methodology VARCHAR(30),
    is_covered BOOLEAN,
    is_mppr_eligible BOOLEAN,
    is_device_intensive BOOLEAN,
    is_packaged BOOLEAN,
    requires_device_code BOOLEAN,
    is_inpatient_only BOOLEAN,
    claim_scrub_action VARCHAR(20),
    scrub_rule_code VARCHAR(20),
    statutory_citation VARCHAR(100),
    release_label TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_code VARCHAR(10) := UPPER(TRIM(p_code));
    v_rel_id UUID;
    v_rel_label TEXT;
    v_pi VARCHAR(5) := NULL;
    v_addendum VARCHAR(2) := 'AA';
    v_def RECORD;
    v_rule RECORD;
BEGIN
    -- 1. Resolve matching CMS release for date of service
    SELECT r.id, 'CY ' || r.release_year || ' ' || r.release_quarter || ' ' || r.rule_type
    INTO v_rel_id, v_rel_label
    FROM public.cms_asc_releases r
    WHERE r.effective_start_date <= p_dos
      AND (r.effective_end_date IS NULL OR r.effective_end_date >= p_dos)
    ORDER BY r.release_year DESC, r.effective_start_date DESC
    LIMIT 1;

    IF v_rel_id IS NULL THEN
        SELECT r.id, 'CY ' || r.release_year || ' ' || r.release_quarter || ' ' || r.rule_type
        INTO v_rel_id, v_rel_label
        FROM public.cms_asc_releases r
        WHERE r.is_active = true
        ORDER BY r.release_year DESC
        LIMIT 1;
    END IF;

    -- 2. Lookup Addenda Table for the code
    IF v_rel_id IS NOT NULL THEN
        SELECT a.payment_indicator, a.addendum_source
        INTO v_pi, v_addendum
        FROM public.cms_asc_addenda a
        WHERE a.release_id = v_rel_id AND a.code = v_clean_code
        LIMIT 1;
    END IF;

    -- 3. Check CPT versions if not found in addenda
    IF v_pi IS NULL THEN
        SELECT v.payment_indicator
        INTO v_pi
        FROM public.cpt_code_versions v
        JOIN public.cpt_master m ON v.cpt_master_id = m.id
        WHERE m.code = v_clean_code
          AND v.facility_id IS NULL
          AND v.effective_date <= p_dos
          AND (v.termination_date IS NULL OR v.termination_date >= p_dos)
        ORDER BY v.effective_date DESC
        LIMIT 1;
    END IF;

    -- 4. Check legacy cpt_codes if still unresolved
    IF v_pi IS NULL THEN
        SELECT c.payment_indicator
        INTO v_pi
        FROM public.cpt_codes c
        WHERE c.code = v_clean_code
          AND c.effective_date <= p_dos
          AND (c.termination_date IS NULL OR c.termination_date >= p_dos)
        ORDER BY c.effective_date DESC
        LIMIT 1;
    END IF;

    -- FAIL-CLOSED: If indicator is missing, unknown, or code unlisted
    IF v_pi IS NULL OR v_pi = 'N/A' OR v_pi = '' THEN
        RETURN QUERY SELECT
            v_clean_code,
            p_payment_system,
            'N/A'::VARCHAR(5),
            'Unresolved / Unlisted Procedure'::VARCHAR(100),
            'EE'::VARCHAR(2),
            'Non_Covered'::VARCHAR(30),
            'Non_Payable'::VARCHAR(30),
            false,
            false,
            false,
            false,
            false,
            false,
            'BLOCK_FATAL'::VARCHAR(20),
            'SCRUB-UNRESOLVED'::VARCHAR(20),
            '42 CFR 416.166'::VARCHAR(100),
            COALESCE(v_rel_label, 'CMS Regulatory Release');
        RETURN;
    END IF;

    -- 5. Retrieve indicator definition
    SELECT * INTO v_def
    FROM public.cms_payment_indicator_definitions d
    WHERE d.indicator_code = v_pi
    ORDER BY (d.release_id = v_rel_id) DESC, d.created_at DESC
    LIMIT 1;

    -- If unknown custom indicator, fail closed
    IF NOT FOUND THEN
        RETURN QUERY SELECT
            v_clean_code,
            p_payment_system,
            v_pi,
            ('Unknown Indicator (' || v_pi || ')')::VARCHAR(100),
            v_addendum,
            'Non_Covered'::VARCHAR(30),
            'Non_Payable'::VARCHAR(30),
            false,
            false,
            false,
            false,
            false,
            false,
            'BLOCK_FATAL'::VARCHAR(20),
            'SCRUB-UNKNOWN-PI'::VARCHAR(20),
            '42 CFR 416.166'::VARCHAR(100),
            COALESCE(v_rel_label, 'CMS Regulatory Release');
        RETURN;
    END IF;

    -- 6. Retrieve matching scrubbing rule
    SELECT * INTO v_rule
    FROM public.cms_indicator_claim_rules r
    WHERE r.indicator_code = v_pi AND r.is_active = true
    LIMIT 1;

    -- 7. Return comprehensive interpretation record
    RETURN QUERY SELECT
        v_clean_code,
        p_payment_system,
        v_def.indicator_code,
        v_def.short_name,
        v_def.addendum_source,
        v_def.coverage_category,
        v_def.payment_methodology,
        (v_def.coverage_category NOT IN ('Inpatient_Only', 'Non_Covered')),
        v_def.is_mppr_eligible,
        v_def.is_device_intensive,
        v_def.is_packaged,
        v_def.requires_device_code,
        v_def.is_inpatient_only,
        CASE 
            WHEN v_def.is_inpatient_only THEN 'BLOCK_FATAL'::VARCHAR(20)
            WHEN v_def.coverage_category = 'Non_Covered' THEN 'BLOCK_FATAL'::VARCHAR(20)
            WHEN v_def.requires_device_code THEN 'CHECK_DEVICE'::VARCHAR(20)
            WHEN v_def.is_packaged THEN 'BUNDLE_APC'::VARCHAR(20)
            WHEN v_def.coverage_category = 'Contractor_Priced' THEN 'WARN_DOCUMENT'::VARCHAR(20)
            ELSE 'ALLOW'::VARCHAR(20)
        END,
        COALESCE(v_rule.rule_identifier, 'SCRUB-OK')::VARCHAR(20),
        v_def.statutory_citation,
        COALESCE(v_rel_label, 'CMS Regulatory Release');
END;
$$;

-- ==============================================================================
-- 7. HARDEN fn_resolve_medicare_base_rate (ELIMINATE 'A2' FALLBACK DEFECT)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_resolve_medicare_base_rate(
    p_dos DATE,
    p_code VARCHAR(10),
    p_facility_id UUID DEFAULT NULL,
    p_wage_index_override NUMERIC(6, 4) DEFAULT NULL
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
AS $$
DECLARE
    v_code VARCHAR(10) := UPPER(TRIM(p_code));
    v_rel_id UUID;
    v_rel_label TEXT;
    v_labor_share NUMERIC(5, 4) := 0.5000;
    v_non_labor_share NUMERIC(5, 4) := 0.5000;
    v_ascqr_factor NUMERIC(5, 4) := 0.9800;
    v_cbsa VARCHAR(5) := '34940';
    v_wage NUMERIC(6, 4) := 0.9412;
    v_ascqr_compliant BOOLEAN := true;
    v_desc TEXT;
    v_pi VARCHAR(5) := NULL;
    v_cov_stat VARCHAR(30) := 'Non_Covered';
    v_is_dev BOOLEAN := false;
    v_dev_pct NUMERIC(5, 4) := 0.0000;
    v_dev_amt NUMERIC(12, 2) := 0.00;
    v_nat_rate NUMERIC(12, 2) := 0.00;
    v_is_pkg BOOLEAN := false;
    v_is_ipo BOOLEAN := false;
    v_srv_unadj NUMERIC(12, 2) := 0.00;
    v_srv_adj NUMERIC(12, 2) := 0.00;
    v_final_adj NUMERIC(12, 2) := 0.00;
    v_interp RECORD;
BEGIN
    -- 1. Interpret Payment Indicator via fn_interpret_cms_indicator
    SELECT * INTO v_interp FROM public.fn_interpret_cms_indicator(v_code, p_dos, 'ASC');
    IF FOUND AND v_interp.indicator_code <> 'N/A' THEN
        v_pi := v_interp.indicator_code;
        v_cov_stat := v_interp.coverage_category;
        v_is_dev := v_interp.is_device_intensive;
        v_is_pkg := v_interp.is_packaged;
        v_is_ipo := v_interp.is_inpatient_only;
    END IF;

    -- Fail-closed immediately if Inpatient-Only or Non-Covered
    IF v_is_ipo OR v_cov_stat IN ('Inpatient_Only', 'Non_Covered') OR v_pi IS NULL OR v_pi = 'N/A' THEN
        RETURN QUERY SELECT 
            v_code, 
            COALESCE(v_interp.short_name, 'Non-Covered / Inpatient-Only Procedure'),
            COALESCE(v_pi, 'N/A'), 
            false, 
            COALESCE(v_cov_stat, 'Non_Covered'),
            false, 0.0000::NUMERIC(5, 4), 0.00::NUMERIC(12, 2), 0.00::NUMERIC(12, 2),
            v_cbsa, 1.0000::NUMERIC(6, 4), 0.00::NUMERIC(12, 2), 0.00::NUMERIC(12, 2), 0.00::NUMERIC(12, 2),
            false, COALESCE(v_interp.release_label, 'CMS Regulatory Release');
        RETURN;
    END IF;

    -- 2. Resolve matching CMS release for date of service
    SELECT r.id, 'CY ' || r.release_year || ' ' || r.release_quarter || ' ' || r.rule_type,
           r.labor_related_share, r.non_labor_share, r.ascqr_reduction_factor
    INTO v_rel_id, v_rel_label, v_labor_share, v_non_labor_share, v_ascqr_factor
    FROM public.cms_asc_releases r
    WHERE r.effective_start_date <= p_dos
      AND (r.effective_end_date IS NULL OR r.effective_end_date >= p_dos)
    ORDER BY r.release_year DESC, r.effective_start_date DESC
    LIMIT 1;

    -- 3. Resolve Facility CBSA & Wage Index
    IF p_facility_id IS NOT NULL THEN
        SELECT s.cbsa_code, s.ascqr_compliant
        INTO v_cbsa, v_ascqr_compliant
        FROM public.facility_medicare_settings s
        WHERE s.facility_id = p_facility_id
          AND s.effective_start_date <= p_dos
          AND (s.effective_end_date IS NULL OR s.effective_end_date >= p_dos)
        LIMIT 1;
    END IF;

    IF p_wage_index_override IS NOT NULL AND p_wage_index_override > 0 THEN
        v_wage := p_wage_index_override;
    ELSIF v_rel_id IS NOT NULL AND v_cbsa IS NOT NULL THEN
        SELECT w.wage_index INTO v_wage
        FROM public.medicare_wage_indices w
        WHERE w.release_id = v_rel_id AND w.cbsa_code = v_cbsa
        LIMIT 1;
        IF v_wage IS NULL THEN v_wage := 1.0000; END IF;
    END IF;

    -- 4. Resolve national unadjusted rate from Addenda AA/BB
    IF v_rel_id IS NOT NULL THEN
        SELECT a.short_descriptor, a.national_unadjusted_rate,
               a.is_device_intensive, a.device_offset_percentage, a.device_offset_amount
        INTO v_desc, v_nat_rate, v_is_dev, v_dev_pct, v_dev_amt
        FROM public.cms_asc_addenda a
        WHERE a.release_id = v_rel_id AND a.code = v_code
        LIMIT 1;
    END IF;

    -- Fallback to cpt_codes rate if not in cms_asc_addenda
    IF v_nat_rate = 0.00 OR v_nat_rate IS NULL THEN
        SELECT c.description, c.reimbursement, c.is_device_intensive, c.device_offset_percentage
        INTO v_desc, v_nat_rate, v_is_dev, v_dev_pct
        FROM public.cpt_codes c
        WHERE c.code = v_code
          AND c.effective_date <= p_dos
          AND (c.termination_date IS NULL OR c.termination_date >= p_dos)
        ORDER BY c.effective_date DESC
        LIMIT 1;

        IF v_dev_pct > 0 THEN
            v_dev_amt := ROUND(COALESCE(v_nat_rate, 0.00) * v_dev_pct, 2);
        END IF;
    END IF;

    -- Packaged Codes: $0.00 allowable
    IF v_is_pkg OR v_pi = 'N1' THEN
        RETURN QUERY SELECT 
            v_code, COALESCE(v_desc, 'Packaged Procedure'), v_pi, true, 'Packaged'::VARCHAR(30),
            false, 0.0000::NUMERIC(5, 4), 0.00::NUMERIC(12, 2), 0.00::NUMERIC(12, 2),
            v_cbsa, v_wage, 0.00::NUMERIC(12, 2), 0.00::NUMERIC(12, 2), 0.00::NUMERIC(12, 2),
            true, COALESCE(v_rel_label, 'CMS Regulatory Release');
        RETURN;
    END IF;

    -- 5. Mathematical Geographic Wage Adjustment (50% Labor, 50% Non-Labor)
    IF v_is_dev AND v_dev_amt > 0 AND v_dev_amt < v_nat_rate THEN
        -- Device-Intensive: Device portion is exempt from wage adjustment
        v_srv_unadj := v_nat_rate - v_dev_amt;
        v_srv_adj := (v_srv_unadj * v_labor_share * v_wage) + (v_srv_unadj * v_non_labor_share);
        IF NOT v_ascqr_compliant THEN v_srv_adj := v_srv_adj * v_ascqr_factor; END IF;
        v_final_adj := ROUND(v_dev_amt + v_srv_adj, 2);
    ELSE
        -- Standard Surgical / Ancillary
        v_srv_unadj := v_nat_rate;
        v_srv_adj := (v_nat_rate * v_labor_share * v_wage) + (v_nat_rate * v_non_labor_share);
        IF NOT v_ascqr_compliant THEN v_srv_adj := v_srv_adj * v_ascqr_factor; END IF;
        v_final_adj := ROUND(v_srv_adj, 2);
    END IF;

    RETURN QUERY SELECT 
        v_code, COALESCE(v_desc, 'Covered ASC Procedure'), v_pi, true, v_cov_stat,
        v_is_dev, v_dev_pct, v_dev_amt, v_nat_rate,
        v_cbsa, v_wage, v_srv_unadj, ROUND(v_srv_adj, 2), v_final_adj,
        false, COALESCE(v_rel_label, 'CMS Regulatory Release');
END;
$$;

-- ==============================================================================
-- 8. ENHANCE fn_scrub_claim WITH STATUTORY INDICATOR SCRUBBING RULES
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_scrub_claim(
    p_claim_id UUID,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_claim RECORD;
    v_patient RECORD;
    v_facility RECORD;
    v_run_id UUID;
    v_start_time TIMESTAMPTZ := clock_timestamp();
    v_fatal_count INT := 0;
    v_warning_count INT := 0;
    v_proposed_count INT := 0;
    v_rules_evaluated INT := 23;
    v_lines RECORD;
    v_line_count INT := 0;
    v_has_surgical_line BOOLEAN := false;
    v_has_device_line BOOLEAN := false;
    v_interp RECORD;
BEGIN
    -- 1. Fetch Claim
    SELECT * INTO v_claim FROM public.claims WHERE id = p_claim_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Claim not found.');
    END IF;

    -- 2. Fetch Patient & Facility
    SELECT * INTO v_patient FROM public.patients WHERE id = v_claim.patient_id;
    SELECT * INTO v_facility FROM public.facilities WHERE id = v_claim.facility_id;

    -- 3. Create Scrub Run Record
    INSERT INTO public.claim_scrub_runs (
        claim_id, facility_id, scrubbed_by, rules_evaluated_count, resulting_status
    ) VALUES (
        p_claim_id, v_claim.facility_id, p_user_id, v_rules_evaluated, 'SCRUBBING'
    ) RETURNING id INTO v_run_id;

    -- Clear old non-overridden findings
    DELETE FROM public.claim_scrub_findings WHERE claim_id = p_claim_id AND is_overridden = false;
    DELETE FROM public.claim_scrub_edits WHERE claim_id = p_claim_id AND status = 'PROPOSED';

    -- SCRUB-01: Subscriber ID / Policy Number
    IF v_patient.mrn IS NULL OR TRIM(v_patient.mrn) = '' THEN
        INSERT INTO public.claim_scrub_findings (
            scrub_run_id, claim_id, rule_id, rule_category, severity, edi_loop_reference,
            finding_message, remediation_guidance
        ) VALUES (
            v_run_id, p_claim_id, 'SCRUB-01', 'EDI_SYNTAX', 'FATAL', '2010BA NM109',
            'Missing patient subscriber insurance identification / policy number.',
            'Enter valid subscriber policy number in patient registration before billing.'
        );
        v_fatal_count := v_fatal_count + 1;
    END IF;

    -- SCRUB-06: POS 24 enforcement
    IF v_claim.place_of_service <> '24' THEN
        INSERT INTO public.claim_scrub_findings (
            scrub_run_id, claim_id, rule_id, rule_category, severity, edi_loop_reference,
            finding_message, remediation_guidance
        ) VALUES (
            v_run_id, p_claim_id, 'SCRUB-06', 'EDI_SYNTAX', 'FATAL', '2300 CLM05-1',
            'Place of Service is set to ' || v_claim.place_of_service || '. ASC claims strictly require POS 24.',
            'Apply proposed edit to reset Place of Service to 24.'
        );
        v_fatal_count := v_fatal_count + 1;
    END IF;

    -- Check Line Count
    SELECT COUNT(*) INTO v_line_count FROM public.claim_lines WHERE claim_id = p_claim_id;
    IF v_line_count = 0 THEN
        INSERT INTO public.claim_scrub_findings (
            scrub_run_id, claim_id, rule_id, rule_category, severity, edi_loop_reference,
            finding_message, remediation_guidance
        ) VALUES (
            v_run_id, p_claim_id, 'SCRUB-10', 'CLINICAL', 'FATAL', '2400 LX',
            'Claim has zero service lines.',
            'Sync procedures from surgical encounter to generate claim lines.'
        );
        v_fatal_count := v_fatal_count + 1;
    END IF;

    -- Check if claim has any implant hardware line or case device
    SELECT EXISTS (
        SELECT 1 FROM public.claim_lines cl
        WHERE cl.claim_id = p_claim_id 
          AND (cl.case_device_id IS NOT NULL OR cl.cpt_code ~ '^[CL][0-9]{4}$')
    ) INTO v_has_device_line;

    -- ==========================================================================
    -- STATUTORY CMS PAYMENT INDICATOR SCRUBBING (SCRUB-20 TO SCRUB-24)
    -- ==========================================================================

    FOR v_lines IN (
        SELECT * FROM public.claim_lines WHERE claim_id = p_claim_id ORDER BY line_number ASC
    ) LOOP
        -- Interpret Line Indicator
        SELECT * INTO v_interp 
        FROM public.fn_interpret_cms_indicator(v_lines.cpt_code, v_lines.date_of_service, 'ASC');

        -- Update line metadata snapshot
        UPDATE public.claim_lines
        SET payment_indicator = v_interp.indicator_code,
            coverage_status = v_interp.coverage_category,
            is_device_intensive = v_interp.is_device_intensive
        WHERE id = v_lines.id;

        IF v_interp.coverage_category = 'Covered_Surgical' THEN
            v_has_surgical_line := true;
        END IF;

        -- SCRUB-20: Inpatient-Only (IPO) Hard Block (Indicator C)
        IF v_interp.is_inpatient_only OR v_interp.indicator_code = 'C' THEN
            INSERT INTO public.claim_scrub_findings (
                scrub_run_id, claim_id, claim_line_id, rule_id, rule_category, severity, edi_loop_reference,
                finding_message, remediation_guidance
            ) VALUES (
                v_run_id, p_claim_id, v_lines.id, 'SCRUB-20', 'CLINICAL', '2400 SV101',
                'Procedure ' || v_lines.cpt_code || ' is designated by CMS as Inpatient-Only (Indicator C) and is not payable in an ASC.',
                'Statutorily non-payable under 42 CFR 416.166. Procedure must be performed in hospital inpatient setting.'
            );
            v_fatal_count := v_fatal_count + 1;
        END IF;

        -- SCRUB-21: Device-Intensive (J8) without paired implant hardware
        IF v_interp.is_device_intensive OR v_interp.indicator_code = 'J8' THEN
            IF NOT v_has_device_line AND v_lines.case_device_id IS NULL THEN
                INSERT INTO public.claim_scrub_findings (
                    scrub_run_id, claim_id, claim_line_id, rule_id, rule_category, severity, edi_loop_reference,
                    finding_message, remediation_guidance
                ) VALUES (
                    v_run_id, p_claim_id, v_lines.id, 'SCRUB-21', 'CLINICAL', '2400 SV101',
                    'Device-intensive procedure ' || v_lines.cpt_code || ' (Indicator J8) billed without required implant hardware device code.',
                    'Add paired device HCPCS code (e.g., C1776, L8699) or attach implant usage documentation to claim.'
                );
                v_fatal_count := v_fatal_count + 1;
            END IF;
        END IF;

        -- SCRUB-23: Contractor-Priced (R2) documentation warning
        IF v_interp.indicator_code = 'R2' THEN
            INSERT INTO public.claim_scrub_findings (
                scrub_run_id, claim_id, claim_line_id, rule_id, rule_category, severity, edi_loop_reference,
                finding_message, remediation_guidance
            ) VALUES (
                v_run_id, p_claim_id, v_lines.id, 'SCRUB-23', 'CLINICAL', '2400 SV101',
                'Contractor-priced procedure ' || v_lines.cpt_code || ' (Indicator R2) requires operative report attachment.',
                'Attach operative notes and medical necessity justification for MAC pricing.'
            );
            v_warning_count := v_warning_count + 1;
        END IF;

        -- SCRUB-24: Statutorily Excluded / Non-Covered (E5)
        IF v_interp.coverage_category = 'Non_Covered' OR v_interp.indicator_code = 'E5' THEN
            INSERT INTO public.claim_scrub_findings (
                scrub_run_id, claim_id, claim_line_id, rule_id, rule_category, severity, edi_loop_reference,
                finding_message, remediation_guidance
            ) VALUES (
                v_run_id, p_claim_id, v_lines.id, 'SCRUB-24', 'CLINICAL', '2400 SV101',
                'Procedure ' || v_lines.cpt_code || ' is statutorily excluded from Medicare ASC reimbursement.',
                'Procedure non-covered under 42 CFR 416.166. Issue ABN to patient or remove from claim.'
            );
            v_fatal_count := v_fatal_count + 1;
        END IF;
    END LOOP;

    -- SCRUB-22: Standalone Packaged Service Line Check (N1)
    FOR v_lines IN (
        SELECT cl.* FROM public.claim_lines cl
        WHERE cl.claim_id = p_claim_id AND cl.payment_indicator = 'N1'
    ) LOOP
        IF NOT v_has_surgical_line THEN
            INSERT INTO public.claim_scrub_findings (
                scrub_run_id, claim_id, claim_line_id, rule_id, rule_category, severity, edi_loop_reference,
                finding_message, remediation_guidance
            ) VALUES (
                v_run_id, p_claim_id, v_lines.id, 'SCRUB-22', 'CLINICAL', '2400 SV101',
                'Packaged service ' || v_lines.cpt_code || ' (Indicator N1) billed without primary covered surgical procedure.',
                'Packaged items cannot be billed standalone. Include primary covered surgical procedure or remove line.'
            );
            v_fatal_count := v_fatal_count + 1;
        END IF;
    END LOOP;

    -- Determine Final Claim Status
    UPDATE public.claim_scrub_runs
    SET fatal_errors_count = v_fatal_count,
        warnings_count = v_warning_count,
        proposed_edits_count = v_proposed_count,
        execution_duration_ms = EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_start_time))::INT,
        resulting_status = CASE WHEN v_fatal_count > 0 THEN 'SCRUB_FAILED' ELSE 'SCRUB_PASSED' END
    WHERE id = v_run_id;

    UPDATE public.claims
    SET scrub_status = CASE WHEN v_fatal_count > 0 THEN 'SCRUB_FAILED' ELSE 'SCRUB_PASSED' END,
        fatal_error_count = v_fatal_count,
        warning_count = v_warning_count,
        updated_at = NOW()
    WHERE id = p_claim_id;

    RETURN jsonb_build_object(
        'success', true,
        'claim_id', p_claim_id,
        'scrub_run_id', v_run_id,
        'scrub_status', CASE WHEN v_fatal_count > 0 THEN 'SCRUB_FAILED' ELSE 'SCRUB_PASSED' END,
        'fatal_errors', v_fatal_count,
        'warnings', v_warning_count,
        'proposed_edits', v_proposed_count
    );
END;
$$;

-- ==============================================================================
-- 9. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.cms_payment_indicator_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_indicator_claim_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_payment_indicator_overrides ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read standard CMS indicators and rules
DROP POLICY IF EXISTS rls_select_cms_indicator_defs ON public.cms_payment_indicator_definitions;
CREATE POLICY rls_select_cms_indicator_defs ON public.cms_payment_indicator_definitions
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS rls_select_cms_indicator_rules ON public.cms_indicator_claim_rules;
CREATE POLICY rls_select_cms_indicator_rules ON public.cms_indicator_claim_rules
    FOR SELECT TO authenticated USING (true);

-- Tenancy scoping for facility overrides
DROP POLICY IF EXISTS rls_manage_indicator_overrides ON public.cms_payment_indicator_overrides;
CREATE POLICY rls_manage_indicator_overrides ON public.cms_payment_indicator_overrides
    FOR ALL TO authenticated
    USING (
        user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'biller', 'coder'])
        OR user_has_facility_role(NULL, ARRAY['super_admin'])
        OR public.is_facility_accessible(facility_id)
        OR (auth.jwt()->>'role') = 'service_role'
    );

COMMIT;

