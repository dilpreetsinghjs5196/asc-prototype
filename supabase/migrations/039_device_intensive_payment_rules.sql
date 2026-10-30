-- ==============================================================================
-- Migration: 039_device_intensive_payment_rules.sql
-- Description: Phase 63 — Device-Intensive Payment Rules, Packaging Logic & C-Code Crosswalk
-- Statutory Authority: 
--   - 42 CFR § 416.171(b)(2) (Device-Intensive Implant Offset Exemption)
--   - 42 CFR § 416.171(a)(2) (ASCQR 2.0% Reduction Factor on Service Portion)
--   - 42 CFR § 416.172 (Multiple Procedure Payment Reduction Carve-Out)
--   - Social Security Act § 1833(i)(2)(D)
-- Dependencies: 001_multi_tenancy_core.sql, 018_cms_asc_coverage_and_payment.sql,
--               036_medicare_asc_base_rate_engine.sql, 037_cms_payment_indicators_and_interpretation.sql,
--               038_medicare_geographic_wage_adjustment.sql
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. CMS MASTER DEVICE CATEGORIES (HCPCS LEVEL II C-CODES)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.cms_device_categories (
    category_code VARCHAR(10) PRIMARY KEY,
    category_title TEXT NOT NULL,
    clinical_construct VARCHAR(50) NOT NULL,
    implant_category_id UUID REFERENCES public.implant_categories(id) ON DELETE SET NULL,
    is_packaged BOOLEAN NOT NULL DEFAULT true,
    effective_start_date DATE NOT NULL DEFAULT '2024-01-01',
    effective_end_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_cms_device_cat_construct 
    ON public.cms_device_categories(clinical_construct);

-- ==============================================================================
-- 2. CMS DEVICE-INTENSIVE PROCEDURES (EMPIRICAL DEVICE OFFSETS > 30.00%)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.cms_device_intensive_procedures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    release_id UUID NOT NULL REFERENCES public.cms_asc_releases(id) ON DELETE RESTRICT,
    cpt_code VARCHAR(5) NOT NULL CHECK (cpt_code ~ '^[0-9A-Z]{5}$'),
    payment_indicator VARCHAR(2) NOT NULL DEFAULT 'J8' CHECK (payment_indicator IN ('J8', 'G2', 'P3')),
    device_offset_percentage NUMERIC(5, 4) NOT NULL CHECK (device_offset_percentage >= 0.3000 AND device_offset_percentage <= 0.9999),
    national_unadjusted_rate NUMERIC(10, 2) NOT NULL CHECK (national_unadjusted_rate > 0),
    device_offset_amount NUMERIC(10, 2) NOT NULL CHECK (device_offset_amount = ROUND(national_unadjusted_rate * device_offset_percentage, 2)),
    service_portion_unadjusted NUMERIC(10, 2) NOT NULL CHECK (service_portion_unadjusted = national_unadjusted_rate - device_offset_amount),
    apc_code VARCHAR(5),
    effective_start_date DATE NOT NULL DEFAULT '2026-01-01',
    effective_end_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_cms_device_cpt_release UNIQUE (release_id, cpt_code, effective_start_date)
);

CREATE INDEX IF NOT EXISTS idx_cms_dev_proc_cpt 
    ON public.cms_device_intensive_procedures(cpt_code, effective_start_date);

CREATE INDEX IF NOT EXISTS idx_cms_dev_proc_offset 
    ON public.cms_device_intensive_procedures(device_offset_percentage DESC);

-- ==============================================================================
-- 3. CPT-TO-DEVICE CATEGORY CROSSWALK (CMS DEVICE-TO-PROCEDURE EDITS)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.cpt_device_category_crosswalk (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cpt_code VARCHAR(5) NOT NULL CHECK (cpt_code ~ '^[0-9A-Z]{5}$'),
    device_category_code VARCHAR(10) NOT NULL REFERENCES public.cms_device_categories(category_code) ON DELETE RESTRICT,
    is_mandatory BOOLEAN NOT NULL DEFAULT true,
    minimum_quantity INTEGER NOT NULL DEFAULT 1 CHECK (minimum_quantity >= 1),
    effective_start_date DATE NOT NULL DEFAULT '2024-01-01',
    effective_end_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_cpt_device_crosswalk UNIQUE (cpt_code, device_category_code, effective_start_date)
);

CREATE INDEX IF NOT EXISTS idx_cpt_device_crosswalk_lookup 
    ON public.cpt_device_category_crosswalk(cpt_code, is_mandatory);

-- ==============================================================================
-- 4. MEDICARE DEVICE CALCULATION LEDGERS (AUDIT & COST RECONCILIATION)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.medicare_device_calculation_ledgers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE CASCADE,
    calc_line_id UUID NOT NULL REFERENCES public.medicare_base_rate_calc_lines(id) ON DELETE CASCADE,
    cpt_code VARCHAR(5) NOT NULL,
    payment_indicator VARCHAR(2) NOT NULL,
    is_device_intensive BOOLEAN NOT NULL,
    device_offset_percentage NUMERIC(5, 4) NOT NULL,
    device_offset_allowance NUMERIC(10, 2) NOT NULL,
    wage_adjusted_service_allowance NUMERIC(10, 2) NOT NULL,
    actual_device_acquisition_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    device_net_margin NUMERIC(10, 2) NOT NULL,
    calculation_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_device_calc_line UNIQUE (calc_line_id)
);

CREATE INDEX IF NOT EXISTS idx_dev_calc_ledger_surgery 
    ON public.medicare_device_calculation_ledgers(surgery_id);

-- ==============================================================================
-- 5. IMMUTABILITY TRIGGER ON CALCULATION LEDGERS
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_block_device_ledger_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'SECURITY_VIOLATION: medicare_device_calculation_ledgers is an immutable financial audit ledger. UPDATE and DELETE operations are prohibited.'
        USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_block_device_ledger_modification ON public.medicare_device_calculation_ledgers;
CREATE TRIGGER trg_block_device_ledger_modification
    BEFORE UPDATE OR DELETE ON public.medicare_device_calculation_ledgers
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_block_device_ledger_modification();

-- ==============================================================================
-- 6. AUTHORITATIVE STORED PROCEDURES & RPC CONTRACTS
-- ==============================================================================

-- 6.1 Resolve Device-Intensive Offset & C-Code Requirements
CREATE OR REPLACE FUNCTION public.fn_resolve_device_intensive_offset(
    p_cpt_code VARCHAR,
    p_dos DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB AS $$
DECLARE
    v_cpt VARCHAR(5) := UPPER(TRIM(p_cpt_code));
    v_rec RECORD;
    v_c_codes JSONB;
BEGIN
    -- Query official device-intensive procedure record
    SELECT 
        dip.cpt_code,
        dip.payment_indicator,
        dip.device_offset_percentage,
        dip.national_unadjusted_rate,
        dip.device_offset_amount,
        dip.service_portion_unadjusted,
        dip.apc_code,
        r.release_year,
        r.rule_type
    INTO v_rec
    FROM public.cms_device_intensive_procedures dip
    JOIN public.cms_asc_releases r ON r.id = dip.release_id
    WHERE dip.cpt_code = v_cpt
      AND dip.effective_start_date <= p_dos
      AND (dip.effective_end_date IS NULL OR dip.effective_end_date >= p_dos)
      AND r.is_active = true
    ORDER BY dip.effective_start_date DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'is_device_intensive', false,
            'payment_indicator', 'A2',
            'device_offset_percentage', 0.0000,
            'device_offset_amount', 0.00,
            'service_portion_unadjusted', 0.00,
            'required_c_codes', '[]'::jsonb
        );
    END IF;

    -- Query required C-codes from crosswalk
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'device_category_code', x.device_category_code,
        'category_title', c.category_title,
        'is_mandatory', x.is_mandatory,
        'minimum_quantity', x.minimum_quantity
    )), '[]'::jsonb)
    INTO v_c_codes
    FROM public.cpt_device_category_crosswalk x
    JOIN public.cms_device_categories c ON c.category_code = x.device_category_code
    WHERE x.cpt_code = v_cpt
      AND x.effective_start_date <= p_dos
      AND (x.effective_end_date IS NULL OR x.effective_end_date >= p_dos);

    RETURN jsonb_build_object(
        'is_device_intensive', true,
        'cpt_code', v_rec.cpt_code,
        'payment_indicator', v_rec.payment_indicator,
        'device_offset_percentage', v_rec.device_offset_percentage,
        'national_unadjusted_rate', v_rec.national_unadjusted_rate,
        'device_offset_amount', v_rec.device_offset_amount,
        'service_portion_unadjusted', v_rec.service_portion_unadjusted,
        'apc_code', v_rec.apc_code,
        'release_year', v_rec.release_year,
        'required_c_codes', v_c_codes
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 6.2 Hardened Medicare Rate Resolver with Dynamic Device-Intensive Offset Lookup
CREATE OR REPLACE FUNCTION public.fn_resolve_medicare_base_rate(
    p_dos DATE,
    p_cpt_code VARCHAR,
    p_facility_id UUID DEFAULT NULL,
    p_wage_index_override NUMERIC DEFAULT NULL
)
RETURNS TABLE (
    cpt_code VARCHAR,
    payment_indicator VARCHAR,
    is_device_intensive BOOLEAN,
    device_offset_percentage NUMERIC,
    device_offset_amount NUMERIC,
    national_unadjusted_rate NUMERIC,
    cbsa_code VARCHAR,
    wage_index_applied NUMERIC,
    service_portion_unadjusted NUMERIC,
    service_portion_adjusted NUMERIC,
    wage_adjusted_rate NUMERIC,
    is_packaged BOOLEAN,
    provenance_release VARCHAR
) AS $$
DECLARE
    v_cpt VARCHAR(5) := UPPER(TRIM(p_cpt_code));
    v_fac_id UUID := p_facility_id;
    v_target_year INT := EXTRACT(YEAR FROM p_dos);
    v_wage_idx NUMERIC(6, 4);
    v_cbsa VARCHAR(5) := '34940';
    v_ascqr_compliant BOOLEAN := true;
    v_release_rec RECORD;
    v_addendum_rec RECORD;
    v_device_info JSONB;
    v_is_device BOOLEAN := false;
    v_dev_pct NUMERIC(5, 4) := 0.0000;
    v_dev_amt NUMERIC(10, 2) := 0.00;
    v_nat_rate NUMERIC(10, 2) := 0.00;
    v_srv_unadj NUMERIC(10, 2) := 0.00;
    v_srv_adj NUMERIC(10, 2) := 0.00;
    v_final_rate NUMERIC(10, 2) := 0.00;
    v_pi VARCHAR(2);
    v_is_pkg BOOLEAN := false;
BEGIN
    -- 1. Resolve Active Release
    SELECT id, release_year, rule_type, is_active
    INTO v_release_rec
    FROM public.cms_asc_releases
    WHERE release_year = v_target_year AND is_active = true
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        SELECT id, release_year, rule_type, is_active
        INTO v_release_rec
        FROM public.cms_asc_releases
        ORDER BY release_year DESC, created_at DESC
        LIMIT 1;
    END IF;

    -- 2. Resolve Geographic Wage Index
    IF p_wage_index_override IS NOT NULL THEN
        v_wage_idx := p_wage_index_override;
    ELSIF v_fac_id IS NOT NULL THEN
        -- Query effective-dated facility geographic assignment
        SELECT ga.wage_index, ga.cbsa_code, ga.ascqr_compliant
        INTO v_wage_idx, v_cbsa, v_ascqr_compliant
        FROM public.fn_resolve_facility_wage_index(v_fac_id, p_dos) ga;
        
        IF v_wage_idx IS NULL THEN
            v_wage_idx := 0.9412;
            v_cbsa := '34940';
            v_ascqr_compliant := true;
        END IF;
    ELSE
        v_wage_idx := 0.9412;
        v_cbsa := '34940';
        v_ascqr_compliant := true;
    END IF;

    -- 3. Resolve Procedure Addendum Record
    SELECT a.*
    INTO v_addendum_rec
    FROM public.cms_asc_addenda a
    WHERE a.cpt_code = v_cpt
      AND a.release_id = v_release_rec.id
      AND a.effective_date <= p_dos
      AND (a.termination_date IS NULL OR a.termination_date >= p_dos)
    LIMIT 1;

    -- Fallback to cpt_code_versions if missing in addenda
    IF NOT FOUND THEN
        SELECT 
            v_cpt AS cpt_code,
            COALESCE(c.reimbursement, 0.00) AS national_unadjusted_rate,
            COALESCE(c.payment_indicator, 'A2') AS payment_indicator,
            COALESCE(c.is_device_intensive, false) AS is_device_intensive,
            COALESCE(c.device_offset_percentage, 0.0000) AS device_offset_percentage
        INTO v_addendum_rec
        FROM public.cpt_code_versions c
        WHERE c.code = v_cpt
          AND c.effective_date <= p_dos
          AND (c.termination_date IS NULL OR c.termination_date >= p_dos)
        ORDER BY c.effective_date DESC
        LIMIT 1;
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UNRESOLVED_PROCEDURE_RATE: CPT code % is not registered in Medicare addenda or CPT versions for DOS %', v_cpt, p_dos
            USING ERRCODE = 'P0002';
    END IF;

    v_pi := COALESCE(v_addendum_rec.payment_indicator, 'A2');
    v_nat_rate := COALESCE(v_addendum_rec.national_unadjusted_rate, 0.00);

    -- 4. Packaged Procedures (N1) -> $0.00 Allowable
    IF v_pi = 'N1' THEN
        RETURN QUERY SELECT
            v_cpt, v_pi, false, 0.0000::NUMERIC, 0.00::NUMERIC, 0.00::NUMERIC,
            v_cbsa, v_wage_idx, 0.00::NUMERIC, 0.00::NUMERIC, 0.00::NUMERIC,
            true, COALESCE(v_release_rec.rule_type, 'CY 2026 CMS-1823-FC')::VARCHAR;
        RETURN;
    END IF;

    -- 5. Query Authoritative Device-Intensive Offset Table (Phase 63)
    v_device_info := public.fn_resolve_device_intensive_offset(v_cpt, p_dos);
    IF (v_device_info->>'is_device_intensive')::BOOLEAN = true THEN
        v_is_device := true;
        v_dev_pct := (v_device_info->>'device_offset_percentage')::NUMERIC;
        v_dev_amt := ROUND(v_nat_rate * v_dev_pct, 2);
        v_srv_unadj := v_nat_rate - v_dev_amt;
        
        -- Statutory 50/50 Wage Adjustment strictly on Non-Device Service Portion (42 CFR § 416.171(b)(2))
        v_srv_adj := (v_srv_unadj * 0.50 * v_wage_idx) + (v_srv_unadj * 0.50);
        
        -- Apply ASCQR 2% reduction on service share only (42 CFR § 416.171(a)(2))
        IF NOT v_ascqr_compliant THEN
            v_srv_adj := v_srv_adj * 0.9800;
        END IF;
        
        v_final_rate := ROUND(v_dev_amt + v_srv_adj, 2);
    ELSE
        v_is_device := false;
        v_dev_pct := 0.0000;
        v_dev_amt := 0.00;
        v_srv_unadj := v_nat_rate;
        
        -- Standard 50/50 Wage Adjustment
        v_srv_adj := (v_nat_rate * 0.50 * v_wage_idx) + (v_nat_rate * 0.50);
        
        IF NOT v_ascqr_compliant THEN
            v_srv_adj := v_srv_adj * 0.9800;
        END IF;
        
        v_final_rate := ROUND(v_srv_adj, 2);
    END IF;

    RETURN QUERY SELECT
        v_cpt,
        v_pi,
        v_is_device,
        v_dev_pct,
        v_dev_amt,
        v_nat_rate,
        v_cbsa,
        v_wage_idx,
        v_srv_unadj,
        ROUND(v_srv_adj, 2),
        v_final_rate,
        false,
        COALESCE(v_release_rec.rule_type, 'CY 2026 CMS-1823-FC')::VARCHAR;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 6.3 Upgrade Pre-Bill Claim Scrubbing Rule SCRUB-21 with Category-Specific C-Code Validation
CREATE OR REPLACE FUNCTION public.fn_scrub_claim_lines(
    p_surgery_id BIGINT
)
RETURNS TABLE (
    rule_code VARCHAR,
    severity VARCHAR,
    cpt_code VARCHAR,
    status VARCHAR,
    rule_description TEXT,
    remediation_guidance TEXT
) AS $$
DECLARE
    v_line RECORD;
    v_has_device BOOLEAN;
    v_req_device RECORD;
    v_matched_c_code BOOLEAN;
BEGIN
    -- Loop through all surgical lines for this surgery
    FOR v_line IN
        SELECT 
            s.id AS surgery_id,
            s.cpt AS primary_cpt,
            s.dos,
            s.total_implant_cost,
            COALESCE(a.payment_indicator, 'A2') AS payment_indicator
        FROM public.surgeries s
        LEFT JOIN public.cms_asc_addenda a ON a.cpt_code = s.cpt
        WHERE s.id = p_surgery_id
    LOOP
        -- SCRUB-20: Inpatient-Only Procedure Fatal Block (Indicator C)
        IF v_line.payment_indicator = 'C' THEN
            RETURN QUERY SELECT
                'SCRUB-20'::VARCHAR,
                'FATAL'::VARCHAR,
                v_line.primary_cpt::VARCHAR,
                'REJECTED'::VARCHAR,
                'Inpatient-Only (IPO) procedure is strictly prohibited in Ambulatory Surgery Centers under 42 CFR § 416.166'::TEXT,
                'Remove CPT ' || v_line.primary_cpt || ' from ASC claim. Transfer procedure to hospital inpatient setting.'::TEXT;
        END IF;

        -- SCRUB-21: Device-Intensive (J8) Mandatory Category C-Code Matching
        IF v_line.payment_indicator = 'J8' THEN
            -- Check each mandatory C-code in crosswalk
            FOR v_req_device IN
                SELECT x.device_category_code, c.category_title, x.minimum_quantity
                FROM public.cpt_device_category_crosswalk x
                JOIN public.cms_device_categories c ON c.category_code = x.device_category_code
                WHERE x.cpt_code = v_line.primary_cpt
                  AND x.is_mandatory = true
            LOOP
                -- Inspect attached case devices or device lines
                SELECT EXISTS (
                    SELECT 1
                    FROM public.case_devices cd
                    WHERE cd.surgery_id = p_surgery_id
                      AND (cd.hcpcs_c_code = v_req_device.device_category_code 
                           OR cd.device_category = v_req_device.device_category_code)
                ) INTO v_matched_c_code;

                IF NOT v_matched_c_code THEN
                    RETURN QUERY SELECT
                        'SCRUB-21'::VARCHAR,
                        'FATAL'::VARCHAR,
                        v_line.primary_cpt::VARCHAR,
                        'REJECTED'::VARCHAR,
                        'Device-intensive procedure ' || v_line.primary_cpt || ' missing mandatory CMS device category ' || v_req_device.device_category_code || ' (' || v_req_device.category_title || ')'::TEXT,
                        'Attach implant usage record with HCPCS ' || v_req_device.device_category_code || ' before generating Medicare 837P claim.'::TEXT;
                END IF;
            END LOOP;
        END IF;

        -- SCRUB-22: Packaged Procedure Separate Billing Prohibition (Indicator N1)
        IF v_line.payment_indicator = 'N1' THEN
            RETURN QUERY SELECT
                'SCRUB-22'::VARCHAR,
                'WARNING'::VARCHAR,
                v_line.primary_cpt::VARCHAR,
                'PACKAGED'::VARCHAR,
                'Packaged service (N1) receives $0.00 separate allowable and is bundled into primary surgical APC'::TEXT,
                'Retain on claim for clinical record but ensure zero expected separate Medicare reimbursement.'::TEXT;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 6.4 Reconcile Case Device Offset Allowance vs Actual Invoice Cost
CREATE OR REPLACE FUNCTION public.fn_reconcile_device_margin(
    p_surgery_id BIGINT
)
RETURNS TABLE (
    surgery_id BIGINT,
    cpt_code VARCHAR,
    payment_indicator VARCHAR,
    device_offset_allowance NUMERIC,
    actual_acquisition_cost NUMERIC,
    net_margin NUMERIC,
    margin_percentage NUMERIC,
    reconciliation_status VARCHAR
) AS $$
DECLARE
    v_surg RECORD;
    v_rate_info RECORD;
    v_actual_cost NUMERIC(10, 2) := 0.00;
    v_offset_allowance NUMERIC(10, 2) := 0.00;
    v_margin NUMERIC(10, 2) := 0.00;
    v_pct NUMERIC(6, 2) := 0.00;
    v_status VARCHAR(20) := 'BALANCED';
BEGIN
    SELECT s.id, s.cpt, s.dos, s.facility_id
    INTO v_surg
    FROM public.surgeries s
    WHERE s.id = p_surgery_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'SURGERY_NOT_FOUND: Surgery ID % does not exist', p_surgery_id;
    END IF;

    -- Calculate Medicare Rate & Protected Offset
    SELECT * INTO v_rate_info
    FROM public.fn_resolve_medicare_base_rate(v_surg.dos, v_surg.cpt, v_surg.facility_id);

    v_offset_allowance := COALESCE(v_rate_info.device_offset_amount, 0.00);

    -- Calculate actual extended acquisition invoice cost from case_device_cost_allocations
    SELECT COALESCE(SUM(ca.allocated_extended_acquisition_cost), 0.00)
    INTO v_actual_cost
    FROM public.case_device_cost_allocations ca
    WHERE ca.surgery_id = p_surgery_id;

    -- Fallback to case_devices or surgeries total_implant_cost if allocations missing
    IF v_actual_cost = 0.00 THEN
        SELECT COALESCE(SUM(cd.acquisition_cost * cd.quantity_used), 0.00)
        INTO v_actual_cost
        FROM public.case_devices cd
        WHERE cd.surgery_id = p_surgery_id;
    END IF;

    v_margin := v_offset_allowance - v_actual_cost;
    IF v_offset_allowance > 0 THEN
        v_pct := ROUND((v_margin / v_offset_allowance) * 100, 2);
    END IF;

    IF v_margin > 0 THEN
        v_status := 'SURPLUS';
    ELSIF v_margin < 0 THEN
        v_status := 'DEFICIT';
    ELSE
        v_status := 'BALANCED';
    END IF;

    RETURN QUERY SELECT
        v_surg.id,
        v_surg.cpt::VARCHAR,
        v_rate_info.payment_indicator::VARCHAR,
        v_offset_allowance,
        v_actual_cost,
        v_margin,
        v_pct,
        v_status;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ==============================================================================
-- 7. ROW-LEVEL SECURITY (RLS) POLICIES — STRICT MULTI-TENANCY
-- ==============================================================================

ALTER TABLE public.cms_device_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_device_intensive_procedures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpt_device_category_crosswalk ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicare_device_calculation_ledgers ENABLE ROW LEVEL SECURITY;

-- 7.1 Master Reference Tables: Global Read Access for Authenticated Users
DROP POLICY IF EXISTS rls_read_cms_device_categories ON public.cms_device_categories;
CREATE POLICY rls_read_cms_device_categories
    ON public.cms_device_categories FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS rls_read_cms_device_intensive_procedures ON public.cms_device_intensive_procedures;
CREATE POLICY rls_read_cms_device_intensive_procedures
    ON public.cms_device_intensive_procedures FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS rls_read_cpt_device_category_crosswalk ON public.cpt_device_category_crosswalk;
CREATE POLICY rls_read_cpt_device_category_crosswalk
    ON public.cpt_device_category_crosswalk FOR SELECT
    TO authenticated
    USING (true);

-- 7.2 Multi-Tenant Calculation Ledger: Strict Tenancy via Surgery -> Facility
-- CRITICAL: Multi-tenant policies use is_facility_accessible / user_has_facility_role helper functions
DROP POLICY IF EXISTS rls_device_calculation_ledgers ON public.medicare_device_calculation_ledgers;
CREATE POLICY rls_device_calculation_ledgers
    ON public.medicare_device_calculation_ledgers FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.surgeries s
            WHERE s.id = medicare_device_calculation_ledgers.surgery_id
              AND (
                  public.is_facility_accessible(s.facility_id)
                  OR public.user_has_facility_role(s.facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'biller', 'coder', 'materials_manager'])
              )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.surgeries s
            WHERE s.id = medicare_device_calculation_ledgers.surgery_id
              AND (
                  public.is_facility_accessible(s.facility_id)
                  OR public.user_has_facility_role(s.facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'biller', 'coder', 'materials_manager'])
              )
        )
    );

-- ==============================================================================
-- 8. CMS STATUTORY SEED DATA (CY 2026 CMS-1823-FC)
-- ==============================================================================

-- 8.1 Seed Statutory HCPCS Level II Device Categories (C-Codes)
INSERT INTO public.cms_device_categories 
    (category_code, category_title, clinical_construct, is_packaged, effective_start_date)
VALUES
    ('C1776', 'Joint device (implantable)', 'ARTHROPLASTY_JOINT', true, '2024-01-01'),
    ('C1785', 'Pacemaker, dual chamber (implantable)', 'CARDIAC_RHYTHM_DUAL', true, '2024-01-01'),
    ('C1786', 'Pacemaker, single chamber (implantable)', 'CARDIAC_RHYTHM_SINGLE', true, '2024-01-01'),
    ('C1767', 'Generator, neurostimulator (implantable)', 'NEUROSTIM_GENERATOR', true, '2024-01-01'),
    ('C1778', 'Lead, neurostimulator (implantable)', 'NEUROSTIM_LEAD', true, '2024-01-01'),
    ('C1882', 'Cardioverter-defibrillator, other (implantable)', 'CARDIAC_DEFIB_ICD', true, '2024-01-01'),
    ('C2617', 'Stent, non-coronary, temporary w/o delivery', 'VASCULAR_PERIPHERAL', true, '2024-01-01'),
    ('C1781', 'Mesh (implantable)', 'SOFT_TISSUE_HERNIA', true, '2024-01-01'),
    ('C1713', 'Anchor/screw for bone/bone or tissue/bone', 'ORTHOPEDIC_FIXATION', true, '2024-01-01'),
    ('C1830', 'Powered bone marrow biopsy needle', 'BIOPSY_ASPIRATION', true, '2024-01-01'),
    ('L8699', 'Prosthetic implant, not otherwise specified', 'PROSTHETIC_CUSTOM', true, '2024-01-01')
ON CONFLICT (category_code) DO UPDATE SET
    category_title = EXCLUDED.category_title,
    clinical_construct = EXCLUDED.clinical_construct,
    is_packaged = EXCLUDED.is_packaged;

-- 8.2 Seed Official CY 2026 CMS Device-Intensive Procedures
DO $$
DECLARE
    v_rel_id UUID;
BEGIN
    SELECT id INTO v_rel_id
    FROM public.cms_asc_releases
    WHERE release_year = 2026 AND is_active = true
    LIMIT 1;

    IF v_rel_id IS NULL THEN
        SELECT id INTO v_rel_id
        FROM public.cms_asc_releases
        ORDER BY release_year DESC
        LIMIT 1;
    END IF;

    IF v_rel_id IS NOT NULL THEN
        -- 27447: Total Knee Arthroplasty (Offset 33.15%)
        INSERT INTO public.cms_device_intensive_procedures 
            (release_id, cpt_code, payment_indicator, device_offset_percentage, national_unadjusted_rate, device_offset_amount, service_portion_unadjusted, apc_code, effective_start_date)
        VALUES 
            (v_rel_id, '27447', 'J8', 0.3315, 10500.00, 3480.75, 7019.25, '5115', '2026-01-01')
        ON CONFLICT (release_id, cpt_code, effective_start_date) DO UPDATE SET
            device_offset_percentage = EXCLUDED.device_offset_percentage,
            national_unadjusted_rate = EXCLUDED.national_unadjusted_rate,
            device_offset_amount = EXCLUDED.device_offset_amount,
            service_portion_unadjusted = EXCLUDED.service_portion_unadjusted;

        -- 27130: Total Hip Arthroplasty (Offset 34.20%)
        INSERT INTO public.cms_device_intensive_procedures 
            (release_id, cpt_code, payment_indicator, device_offset_percentage, national_unadjusted_rate, device_offset_amount, service_portion_unadjusted, apc_code, effective_start_date)
        VALUES 
            (v_rel_id, '27130', 'J8', 0.3420, 11200.00, 3830.40, 7369.60, '5115', '2026-01-01')
        ON CONFLICT (release_id, cpt_code, effective_start_date) DO UPDATE SET
            device_offset_percentage = EXCLUDED.device_offset_percentage,
            national_unadjusted_rate = EXCLUDED.national_unadjusted_rate,
            device_offset_amount = EXCLUDED.device_offset_amount,
            service_portion_unadjusted = EXCLUDED.service_portion_unadjusted;

        -- 29888: Arthroscopically Aided ACL Reconstruction (Offset 31.50%)
        INSERT INTO public.cms_device_intensive_procedures 
            (release_id, cpt_code, payment_indicator, device_offset_percentage, national_unadjusted_rate, device_offset_amount, service_portion_unadjusted, apc_code, effective_start_date)
        VALUES 
            (v_rel_id, '29888', 'J8', 0.3150, 4850.00, 1527.75, 3322.25, '5114', '2026-01-01')
        ON CONFLICT (release_id, cpt_code, effective_start_date) DO UPDATE SET
            device_offset_percentage = EXCLUDED.device_offset_percentage,
            national_unadjusted_rate = EXCLUDED.national_unadjusted_rate,
            device_offset_amount = EXCLUDED.device_offset_amount,
            service_portion_unadjusted = EXCLUDED.service_portion_unadjusted;

        -- 28465: Open Treatment of Tarsal Bone Fracture (Offset 35.00%)
        INSERT INTO public.cms_device_intensive_procedures 
            (release_id, cpt_code, payment_indicator, device_offset_percentage, national_unadjusted_rate, device_offset_amount, service_portion_unadjusted, apc_code, effective_start_date)
        VALUES 
            (v_rel_id, '28465', 'J8', 0.3500, 4671.46, 1635.01, 3036.45, '5114', '2026-01-01')
        ON CONFLICT (release_id, cpt_code, effective_start_date) DO UPDATE SET
            device_offset_percentage = EXCLUDED.device_offset_percentage,
            national_unadjusted_rate = EXCLUDED.national_unadjusted_rate,
            device_offset_amount = EXCLUDED.device_offset_amount,
            service_portion_unadjusted = EXCLUDED.service_portion_unadjusted;

        -- 63685: Insertion of Spinal Neurostimulator Pulse Generator (Offset 82.45%)
        INSERT INTO public.cms_device_intensive_procedures 
            (release_id, cpt_code, payment_indicator, device_offset_percentage, national_unadjusted_rate, device_offset_amount, service_portion_unadjusted, apc_code, effective_start_date)
        VALUES 
            (v_rel_id, '63685', 'J8', 0.8245, 28000.00, 23086.00, 4914.00, '5465', '2026-01-01')
        ON CONFLICT (release_id, cpt_code, effective_start_date) DO UPDATE SET
            device_offset_percentage = EXCLUDED.device_offset_percentage,
            national_unadjusted_rate = EXCLUDED.national_unadjusted_rate,
            device_offset_amount = EXCLUDED.device_offset_amount,
            service_portion_unadjusted = EXCLUDED.service_portion_unadjusted;

        -- 63650: Percutaneous Implantation of Neurostimulator Array (Offset 52.10%)
        INSERT INTO public.cms_device_intensive_procedures 
            (release_id, cpt_code, payment_indicator, device_offset_percentage, national_unadjusted_rate, device_offset_amount, service_portion_unadjusted, apc_code, effective_start_date)
        VALUES 
            (v_rel_id, '63650', 'J8', 0.5210, 5400.00, 2813.40, 2586.60, '5464', '2026-01-01')
        ON CONFLICT (release_id, cpt_code, effective_start_date) DO UPDATE SET
            device_offset_percentage = EXCLUDED.device_offset_percentage,
            national_unadjusted_rate = EXCLUDED.national_unadjusted_rate,
            device_offset_amount = EXCLUDED.device_offset_amount,
            service_portion_unadjusted = EXCLUDED.service_portion_unadjusted;

        -- 33208: Insertion of New or Replacement Pacemaker (Offset 68.30%)
        INSERT INTO public.cms_device_intensive_procedures 
            (release_id, cpt_code, payment_indicator, device_offset_percentage, national_unadjusted_rate, device_offset_amount, service_portion_unadjusted, apc_code, effective_start_date)
        VALUES 
            (v_rel_id, '33208', 'J8', 0.6830, 9800.00, 6693.40, 3106.60, '5223', '2026-01-01')
        ON CONFLICT (release_id, cpt_code, effective_start_date) DO UPDATE SET
            device_offset_percentage = EXCLUDED.device_offset_percentage,
            national_unadjusted_rate = EXCLUDED.national_unadjusted_rate,
            device_offset_amount = EXCLUDED.device_offset_amount,
            service_portion_unadjusted = EXCLUDED.service_portion_unadjusted;

        -- 33249: Insertion of ICD Generator (Offset 74.20%)
        INSERT INTO public.cms_device_intensive_procedures 
            (release_id, cpt_code, payment_indicator, device_offset_percentage, national_unadjusted_rate, device_offset_amount, service_portion_unadjusted, apc_code, effective_start_date)
        VALUES 
            (v_rel_id, '33249', 'J8', 0.7420, 32500.00, 24115.00, 8385.00, '5232', '2026-01-01')
        ON CONFLICT (release_id, cpt_code, effective_start_date) DO UPDATE SET
            device_offset_percentage = EXCLUDED.device_offset_percentage,
            national_unadjusted_rate = EXCLUDED.national_unadjusted_rate,
            device_offset_amount = EXCLUDED.device_offset_amount,
            service_portion_unadjusted = EXCLUDED.service_portion_unadjusted;

        -- 0101T: Extracorporeal Shock Wave Musculoskeletal (Offset 38.50%)
        INSERT INTO public.cms_device_intensive_procedures 
            (release_id, cpt_code, payment_indicator, device_offset_percentage, national_unadjusted_rate, device_offset_amount, service_portion_unadjusted, apc_code, effective_start_date)
        VALUES 
            (v_rel_id, '0101T', 'J8', 0.3850, 3200.00, 1232.00, 1968.00, '5112', '2026-01-01')
        ON CONFLICT (release_id, cpt_code, effective_start_date) DO UPDATE SET
            device_offset_percentage = EXCLUDED.device_offset_percentage,
            national_unadjusted_rate = EXCLUDED.national_unadjusted_rate,
            device_offset_amount = EXCLUDED.device_offset_amount,
            service_portion_unadjusted = EXCLUDED.service_portion_unadjusted;

        -- 23472: Total Shoulder Arthroplasty (Offset 36.80%)
        INSERT INTO public.cms_device_intensive_procedures 
            (release_id, cpt_code, payment_indicator, device_offset_percentage, national_unadjusted_rate, device_offset_amount, service_portion_unadjusted, apc_code, effective_start_date)
        VALUES 
            (v_rel_id, '23472', 'J8', 0.3680, 11800.00, 4342.40, 7457.60, '5115', '2026-01-01')
        ON CONFLICT (release_id, cpt_code, effective_start_date) DO UPDATE SET
            device_offset_percentage = EXCLUDED.device_offset_percentage,
            national_unadjusted_rate = EXCLUDED.national_unadjusted_rate,
            device_offset_amount = EXCLUDED.device_offset_amount,
            service_portion_unadjusted = EXCLUDED.service_portion_unadjusted;
    END IF;
END;
$$;

-- 8.3 Seed CMS Device-to-Procedure Edits Crosswalk
INSERT INTO public.cpt_device_category_crosswalk 
    (cpt_code, device_category_code, is_mandatory, minimum_quantity, effective_start_date)
VALUES
    ('27447', 'C1776', true, 1, '2024-01-01'),
    ('27130', 'C1776', true, 1, '2024-01-01'),
    ('29888', 'C1713', true, 1, '2024-01-01'),
    ('28465', 'C1713', true, 1, '2024-01-01'),
    ('63685', 'C1767', true, 1, '2024-01-01'),
    ('63650', 'C1778', true, 1, '2024-01-01'),
    ('33208', 'C1785', true, 1, '2024-01-01'),
    ('33249', 'C1882', true, 1, '2024-01-01'),
    ('23472', 'C1776', true, 1, '2024-01-01')
ON CONFLICT (cpt_code, device_category_code, effective_start_date) DO UPDATE SET
    is_mandatory = EXCLUDED.is_mandatory,
    minimum_quantity = EXCLUDED.minimum_quantity;

COMMIT;
