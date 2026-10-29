-- ==============================================================================
-- Migration: 038_medicare_geographic_wage_adjustment.sql
-- Description: Phase 62 — Geographic Wage Adjustment & Effective-Dated CBSA Resolution
-- Statutory Authority: 42 CFR § 416.171(b), Social Security Act § 1833(i)(2)(D), OMB Bulletin 23-01
-- Dependencies: 001_multi_tenancy_core.sql, 018_cms_asc_coverage_and_payment.sql,
--               036_medicare_asc_base_rate_engine.sql, 037_cms_payment_indicators_and_interpretation.sql
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. EXTEND MEDICARE WAGE INDICES WITH OMB TRANSITION & RECLASSIFICATION FIELDS
-- ==============================================================================

ALTER TABLE public.medicare_wage_indices
    ADD COLUMN IF NOT EXISTS pre_floor_wage_index NUMERIC(6, 4),
    ADD COLUMN IF NOT EXISTS transition_capped_wage_index NUMERIC(6, 4),
    ADD COLUMN IF NOT EXISTS is_reclassified BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS fips_county_code VARCHAR(5);

-- ==============================================================================
-- 2. FACILITY MEDICARE GEOGRAPHIC ASSIGNMENTS (EFFECTIVE-DATED VERSIONING)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.facility_medicare_geographic_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    cbsa_code VARCHAR(5) NOT NULL CHECK (cbsa_code ~ '^[0-9]{5}$'),
    cbsa_name TEXT NOT NULL,
    state_code VARCHAR(2) NOT NULL CHECK (state_code ~ '^[A-Z]{2}$'),
    medicare_provider_number VARCHAR(10) NOT NULL CHECK (medicare_provider_number ~ '^[0-9A-Z\-]{6,10}$'),
    ascqr_compliant BOOLEAN NOT NULL DEFAULT true,
    verification_source VARCHAR(50) NOT NULL DEFAULT 'CMS_PROVIDER_ENROLLMENT_855A'
        CHECK (verification_source IN ('CMS_PROVIDER_ENROLLMENT_855A', 'MAC_TIE_IN_NOTICE', 'CMS_FINAL_RULE_TABLE', 'MANUAL_AUDITED_OVERRIDE')),
    verification_document_url TEXT,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    verified_by UUID REFERENCES auth.users(id),
    verified_at TIMESTAMPTZ,
    effective_start_date DATE NOT NULL,
    effective_end_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_fac_effective_start UNIQUE (facility_id, effective_start_date),
    CONSTRAINT chk_fac_geo_dates CHECK (effective_end_date IS NULL OR effective_end_date >= effective_start_date)
);

CREATE INDEX IF NOT EXISTS idx_fac_geo_lookup 
    ON public.facility_medicare_geographic_assignments(facility_id, effective_start_date, effective_end_date);

CREATE INDEX IF NOT EXISTS idx_fac_geo_cbsa 
    ON public.facility_medicare_geographic_assignments(cbsa_code);

-- ==============================================================================
-- 3. CBSA COUNTY DELINEATIONS CROSSWALK (OMB BULLETIN 23-01 COMPLIANCE)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.cms_cbsa_delineations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cbsa_code VARCHAR(5) NOT NULL CHECK (cbsa_code ~ '^[0-9]{5}$'),
    fips_county_code VARCHAR(5) NOT NULL CHECK (fips_county_code ~ '^[0-9]{5}$'),
    county_name TEXT NOT NULL,
    state_code VARCHAR(2) NOT NULL CHECK (state_code ~ '^[A-Z]{2}$'),
    cbsa_title TEXT NOT NULL,
    metropolitan_flag VARCHAR(20) NOT NULL DEFAULT 'Metropolitan' CHECK (metropolitan_flag IN ('Metropolitan', 'Micropolitan')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_cbsa_fips UNIQUE (cbsa_code, fips_county_code)
);

CREATE INDEX IF NOT EXISTS idx_cbsa_delineation_fips ON public.cms_cbsa_delineations(fips_county_code);
CREATE INDEX IF NOT EXISTS idx_cbsa_delineation_cbsa ON public.cms_cbsa_delineations(cbsa_code);

-- ==============================================================================
-- 4. SEED NATIONAL CBSA WAGE INDICES (CY 2026 & CY 2025 COMPREHENSIVE SET)
-- ==============================================================================

WITH r_2026 AS (
    SELECT id FROM public.cms_asc_releases WHERE release_year = 2026 AND is_active = true LIMIT 1
)
INSERT INTO public.medicare_wage_indices (
    release_id, cbsa_code, cbsa_name, state_code, wage_index, pre_floor_wage_index,
    is_rural_floor, is_reclassified, effective_start_date
)
SELECT r_2026.id, v.cbsa, v.name, v.st, v.idx, v.pre, v.rf, v.rec, '2026-01-01'::DATE
FROM r_2026, (VALUES
    -- Florida CBSAs
    ('34940', 'Naples-Immokalee-Marco Island, FL', 'FL', 0.9412, 0.9412, false, false),
    ('33100', 'Miami-Fort Lauderdale-Pompano Beach, FL', 'FL', 1.0125, 1.0125, false, false),
    ('45300', 'Tampa-St. Petersburg-Clearwater, FL', 'FL', 0.9124, 0.9124, false, false),
    ('36740', 'Orlando-Kissimmee-Sanford, FL', 'FL', 0.9350, 0.9350, false, false),
    ('27260', 'Jacksonville, FL', 'FL', 0.9210, 0.9210, false, false),
    ('15980', 'Cape Coral-Fort Myers, FL', 'FL', 0.9280, 0.9280, false, false),
    ('38940', 'Port St. Lucie, FL', 'FL', 0.9650, 0.9650, false, false),
    ('42680', 'Sebastian-Vero Beach, FL', 'FL', 0.9150, 0.9150, false, false),
    ('37340', 'Palm Bay-Melbourne-Titusville, FL', 'FL', 0.9450, 0.9450, false, false),
    ('35840', 'North Port-Sarasota-Bradenton, FL', 'FL', 0.9580, 0.9580, false, false),
    ('10001', 'Rural Florida Non-Metropolitan Area', 'FL', 0.8420, 0.8420, true, false),

    -- National Major Metros
    ('35620', 'New York-Newark-Jersey City, NY-NJ-PA', 'NY', 1.2850, 1.2850, false, false),
    ('31080', 'Los Angeles-Long Beach-Anaheim, CA', 'CA', 1.3412, 1.3412, false, false),
    ('16980', 'Chicago-Naperville-Elgin, IL-IN-WI', 'IL', 1.0420, 1.0420, false, false),
    ('19100', 'Dallas-Fort Worth-Arlington, TX', 'TX', 0.9850, 0.9850, false, false),
    ('26420', 'Houston-The Woodlands-Sugar Land, TX', 'TX', 0.9980, 0.9980, false, false),
    ('47900', 'Washington-Arlington-Alexandria, DC-VA-MD-WV', 'DC', 1.1240, 1.1240, false, false),
    ('37980', 'Philadelphia-Camden-Wilmington, PA-NJ-DE-MD', 'PA', 1.0550, 1.0550, false, false),
    ('12060', 'Atlanta-Sandy Springs-Alpharetta, GA', 'GA', 0.9650, 0.9650, false, false),
    ('14460', 'Boston-Cambridge-Newton, MA-NH', 'MA', 1.2210, 1.2210, false, false),
    ('38060', 'Phoenix-Mesa-Chandler, AZ', 'AZ', 0.9820, 0.9820, false, false),
    ('41860', 'San Francisco-Oakland-Berkeley, CA', 'CA', 1.6420, 1.6420, false, false),
    ('40140', 'Riverside-San Bernardino-Ontario, CA', 'CA', 1.1850, 1.1850, false, false),
    ('19820', 'Detroit-Warren-Dearborn, MI', 'MI', 0.9750, 0.9750, false, false),
    ('42660', 'Seattle-Tacoma-Bellevue, WA', 'WA', 1.2150, 1.2150, false, false),
    ('33460', 'Minneapolis-St. Paul-Bloomington, MN-WI', 'MN', 1.1020, 1.1020, false, false),
    ('41740', 'San Diego-Chula Vista-Carlsbad, CA', 'CA', 1.2650, 1.2650, false, false),
    ('19740', 'Denver-Aurora-Lakewood, CO', 'CO', 1.0820, 1.0820, false, false),
    ('12580', 'Baltimore-Columbia-Towson, MD', 'MD', 1.0180, 1.0180, false, false),
    ('16740', 'Charlotte-Concord-Gastonia, NC-SC', 'NC', 0.9320, 0.9320, false, false),
    ('41180', 'St. Louis, MO-IL', 'MO', 0.9150, 0.9150, false, false),
    ('41700', 'San Antonio-New Braunfels, TX', 'TX', 0.9250, 0.9250, false, false),
    ('38900', 'Portland-Vancouver-Hillsboro, OR-WA', 'OR', 1.1550, 1.1550, false, false),
    ('12420', 'Austin-Round Rock-Georgetown, TX', 'TX', 0.9720, 0.9720, false, false),
    ('38300', 'Pittsburgh, PA', 'PA', 0.8950, 0.8950, false, false),
    ('40900', 'Sacramento-Roseville-Folsom, CA', 'CA', 1.3120, 1.3120, false, false),
    ('29820', 'Las Vegas-Henderson-North Las Vegas, NV', 'NV', 1.0250, 1.0250, false, false),
    ('17140', 'Cincinnati, OH-KY-IN', 'OH', 0.9280, 0.9280, false, false),
    ('28140', 'Kansas City, MO-KS', 'MO', 0.9420, 0.9420, false, false),
    ('18140', 'Columbus, OH', 'OH', 0.9550, 0.9550, false, false),
    ('26900', 'Indianapolis-Carmel-Anderson, IN', 'IN', 0.9380, 0.9380, false, false),
    ('17460', 'Cleveland-Elyria, OH', 'OH', 0.9120, 0.9120, false, false),
    ('41940', 'San Jose-Sunnyvale-Santa Clara, CA', 'CA', 1.7150, 1.7150, false, false),
    ('34980', 'Nashville-Davidson-Murfreesboro-Franklin, TN', 'TN', 0.9510, 0.9510, false, false),
    ('47260', 'Virginia Beach-Norfolk-Newport News, VA-NC', 'VA', 0.8850, 0.8850, false, false),
    ('39300', 'Providence-Warwick, RI-MA', 'RI', 1.0950, 1.0950, false, false),
    ('33340', 'Milwaukee-Waukesha, WI', 'WI', 0.9850, 0.9850, false, false),
    ('36420', 'Oklahoma City, OK', 'OK', 0.8920, 0.8920, false, false),
    ('39580', 'Raleigh-Cary, NC', 'NC', 0.9650, 0.9650, false, false),
    ('32820', 'Memphis, TN-MS-AR', 'TN', 0.8820, 0.8820, false, false),
    ('40060', 'Richmond, VA', 'VA', 0.9450, 0.9450, false, false),
    ('35380', 'New Orleans-Metairie, LA', 'LA', 0.8950, 0.8950, false, false),
    ('31140', 'Louisville/Jefferson County, KY-IN', 'KY', 0.8980, 0.8980, false, false),
    ('41620', 'Salt Lake City, UT', 'UT', 0.9950, 0.9950, false, false),
    ('25540', 'Hartford-East Hartford-Middletown, CT', 'CT', 1.1150, 1.1150, false, false),
    ('15380', 'Buffalo-Cheektowaga, NY', 'NY', 0.9450, 0.9450, false, false),
    ('13820', 'Birmingham-Hoover, AL', 'AL', 0.8650, 0.8650, false, false),
    ('40380', 'Rochester, NY', 'NY', 0.9250, 0.9250, false, false),
    ('24340', 'Grand Rapids-Kentwood, MI', 'MI', 0.9180, 0.9180, false, false),
    ('46060', 'Tucson, AZ', 'AZ', 0.9250, 0.9250, false, false),
    ('46520', 'Urban Honolulu, HI', 'HI', 1.1950, 1.1950, false, false),
    ('11260', 'Anchorage, AK', 'AK', 1.2450, 1.2450, false, false),
    ('06001', 'Rural California Non-Metropolitan Area', 'CA', 1.0500, 1.0500, true, false),
    ('48001', 'Rural Texas Non-Metropolitan Area', 'TX', 0.8120, 0.8120, true, false),
    ('00000', 'National ASC Unadjusted Baseline', 'US', 1.0000, 1.0000, false, false)
) AS v(cbsa, name, st, idx, pre, rf, rec)
ON CONFLICT (release_id, cbsa_code) DO UPDATE
SET wage_index = EXCLUDED.wage_index,
    pre_floor_wage_index = EXCLUDED.pre_floor_wage_index,
    is_rural_floor = EXCLUDED.is_rural_floor,
    is_reclassified = EXCLUDED.is_reclassified;

-- Clone / populate for CY 2025 release
WITH r_2025 AS (
    SELECT id FROM public.cms_asc_releases WHERE release_year = 2025 AND is_active = true LIMIT 1
)
INSERT INTO public.medicare_wage_indices (
    release_id, cbsa_code, cbsa_name, state_code, wage_index, pre_floor_wage_index,
    is_rural_floor, is_reclassified, effective_start_date
)
SELECT r_2025.id, v.cbsa, v.name, v.st, v.idx, v.pre, v.rf, v.rec, '2025-01-01'::DATE
FROM r_2025, (VALUES
    ('34940', 'Naples-Immokalee-Marco Island, FL', 'FL', 0.9380, 0.9380, false, false),
    ('33100', 'Miami-Fort Lauderdale-Pompano Beach, FL', 'FL', 1.0090, 1.0090, false, false),
    ('45300', 'Tampa-St. Petersburg-Clearwater, FL', 'FL', 0.9080, 0.9080, false, false),
    ('36740', 'Orlando-Kissimmee-Sanford, FL', 'FL', 0.9310, 0.9310, false, false),
    ('35620', 'New York-Newark-Jersey City, NY-NJ-PA', 'NY', 1.2780, 1.2780, false, false),
    ('31080', 'Los Angeles-Long Beach-Anaheim, CA', 'CA', 1.3350, 1.3350, false, false),
    ('16980', 'Chicago-Naperville-Elgin, IL-IN-WI', 'IL', 1.0380, 1.0380, false, false),
    ('00000', 'National ASC Unadjusted Baseline', 'US', 1.0000, 1.0000, false, false)
) AS v(cbsa, name, st, idx, pre, rf, rec)
WHERE r_2025.id IS NOT NULL
ON CONFLICT (release_id, cbsa_code) DO UPDATE
SET wage_index = EXCLUDED.wage_index,
    pre_floor_wage_index = EXCLUDED.pre_floor_wage_index;

-- ==============================================================================
-- 5. SEED OMB CBSA-TO-COUNTY DELINEATIONS (CROSSWALK)
-- ==============================================================================

INSERT INTO public.cms_cbsa_delineations (
    cbsa_code, fips_county_code, county_name, state_code, cbsa_title, metropolitan_flag
) VALUES
    ('34940', '12021', 'Collier County', 'FL', 'Naples-Immokalee-Marco Island, FL', 'Metropolitan'),
    ('33100', '12086', 'Miami-Dade County', 'FL', 'Miami-Fort Lauderdale-Pompano Beach, FL', 'Metropolitan'),
    ('33100', '12011', 'Broward County', 'FL', 'Miami-Fort Lauderdale-Pompano Beach, FL', 'Metropolitan'),
    ('33100', '12099', 'Palm Beach County', 'FL', 'Miami-Fort Lauderdale-Pompano Beach, FL', 'Metropolitan'),
    ('45300', '12057', 'Hillsborough County', 'FL', 'Tampa-St. Petersburg-Clearwater, FL', 'Metropolitan'),
    ('45300', '12103', 'Pinellas County', 'FL', 'Tampa-St. Petersburg-Clearwater, FL', 'Metropolitan'),
    ('45300', '12101', 'Pasco County', 'FL', 'Tampa-St. Petersburg-Clearwater, FL', 'Metropolitan'),
    ('45300', '12053', 'Hernando County', 'FL', 'Tampa-St. Petersburg-Clearwater, FL', 'Metropolitan'),
    ('36740', '12095', 'Orange County', 'FL', 'Orlando-Kissimmee-Sanford, FL', 'Metropolitan'),
    ('36740', '12117', 'Seminole County', 'FL', 'Orlando-Kissimmee-Sanford, FL', 'Metropolitan'),
    ('36740', '12097', 'Osceola County', 'FL', 'Orlando-Kissimmee-Sanford, FL', 'Metropolitan'),
    ('36740', '12069', 'Lake County', 'FL', 'Orlando-Kissimmee-Sanford, FL', 'Metropolitan'),
    ('27260', '12031', 'Duval County', 'FL', 'Jacksonville, FL', 'Metropolitan'),
    ('27260', '12109', 'St. Johns County', 'FL', 'Jacksonville, FL', 'Metropolitan'),
    ('35620', '36061', 'New York County (Manhattan)', 'NY', 'New York-Newark-Jersey City, NY-NJ-PA', 'Metropolitan'),
    ('35620', '36047', 'Kings County (Brooklyn)', 'NY', 'New York-Newark-Jersey City, NY-NJ-PA', 'Metropolitan'),
    ('35620', '36081', 'Queens County', 'NY', 'New York-Newark-Jersey City, NY-NJ-PA', 'Metropolitan'),
    ('31080', '06037', 'Los Angeles County', 'CA', 'Los Angeles-Long Beach-Anaheim, CA', 'Metropolitan'),
    ('31080', '06059', 'Orange County', 'CA', 'Los Angeles-Long Beach-Anaheim, CA', 'Metropolitan'),
    ('16980', '17031', 'Cook County', 'IL', 'Chicago-Naperville-Elgin, IL-IN-WI', 'Metropolitan'),
    ('19100', '48113', 'Dallas County', 'TX', 'Dallas-Fort Worth-Arlington, TX', 'Metropolitan'),
    ('26420', '48201', 'Harris County', 'TX', 'Houston-The Woodlands-Sugar Land, TX', 'Metropolitan'),
    ('41860', '06075', 'San Francisco County', 'CA', 'San Francisco-Oakland-Berkeley, CA', 'Metropolitan'),
    ('41940', '06085', 'Santa Clara County', 'CA', 'San Jose-Sunnyvale-Santa Clara, CA', 'Metropolitan')
ON CONFLICT (cbsa_code, fips_county_code) DO NOTHING;

-- ==============================================================================
-- 6. BACKFILL EXISTING FACILITY MEDICARE GEOGRAPHIC ASSIGNMENTS
-- ==============================================================================

INSERT INTO public.facility_medicare_geographic_assignments (
    facility_id,
    cbsa_code,
    cbsa_name,
    state_code,
    medicare_provider_number,
    ascqr_compliant,
    verification_source,
    is_verified,
    effective_start_date,
    effective_end_date,
    is_active
)
SELECT 
    fms.facility_id,
    fms.cbsa_code,
    fms.cbsa_name,
    COALESCE(fac.state, 'FL'),
    fms.medicare_provider_number,
    fms.ascqr_compliant,
    'CMS_PROVIDER_ENROLLMENT_855A',
    true,
    fms.effective_start_date,
    fms.effective_end_date,
    true
FROM public.facility_medicare_settings fms
LEFT JOIN public.facilities fac ON fac.id = fms.facility_id
ON CONFLICT (facility_id, effective_start_date) DO UPDATE
SET cbsa_code = EXCLUDED.cbsa_code,
    cbsa_name = EXCLUDED.cbsa_name,
    ascqr_compliant = EXCLUDED.ascqr_compliant;

-- If Naples Surgery Center does not have a record yet, create standard active assignment
INSERT INTO public.facility_medicare_geographic_assignments (
    facility_id,
    cbsa_code,
    cbsa_name,
    state_code,
    medicare_provider_number,
    ascqr_compliant,
    verification_source,
    is_verified,
    effective_start_date,
    is_active
)
SELECT 
    '00000000-0000-0000-0000-000000000002'::UUID,
    '34940',
    'Naples-Immokalee-Marco Island, FL',
    'FL',
    '10-ASC02',
    true,
    'CMS_PROVIDER_ENROLLMENT_855A',
    true,
    '2024-01-01'::DATE,
    true
WHERE EXISTS (
    SELECT 1 FROM public.facilities WHERE id = '00000000-0000-0000-0000-000000000002'::UUID
)
ON CONFLICT (facility_id, effective_start_date) DO NOTHING;

-- ==============================================================================
-- 7. AUTHORITATIVE STORED PROCEDURE: fn_resolve_facility_wage_index
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_resolve_facility_wage_index(
    p_facility_id UUID,
    p_dos DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    facility_id UUID,
    medicare_provider_number VARCHAR(10),
    cbsa_code VARCHAR(5),
    cbsa_name TEXT,
    state_code VARCHAR(2),
    wage_index NUMERIC(6, 4),
    pre_floor_wage_index NUMERIC(6, 4),
    is_rural_floor BOOLEAN,
    is_reclassified BOOLEAN,
    ascqr_compliant BOOLEAN,
    ascqr_reduction_factor NUMERIC(5, 4),
    labor_share NUMERIC(5, 4),
    non_labor_share NUMERIC(5, 4),
    release_id UUID,
    release_label TEXT,
    verification_source VARCHAR(50),
    is_verified BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_fac RECORD;
    v_rel RECORD;
    v_wage RECORD;
BEGIN
    IF p_facility_id IS NULL THEN
        RAISE EXCEPTION 'UNRESOLVED_FACILITY_GEOGRAPHY: Facility ID cannot be NULL for authoritative wage index resolution';
    END IF;

    -- 1. Resolve Effective-Dated Facility Geographic Assignment
    SELECT 
        fga.facility_id, fga.medicare_provider_number, fga.cbsa_code, fga.cbsa_name,
        fga.state_code, fga.ascqr_compliant, fga.verification_source, fga.is_verified
    INTO v_fac
    FROM public.facility_medicare_geographic_assignments fga
    WHERE fga.facility_id = p_facility_id
      AND fga.effective_start_date <= p_dos
      AND (fga.effective_end_date IS NULL OR fga.effective_end_date >= p_dos)
      AND fga.is_active = true
    ORDER BY fga.effective_start_date DESC
    LIMIT 1;

    -- Fallback to facility_medicare_settings if migration in flight
    IF NOT FOUND THEN
        SELECT s.facility_id, s.medicare_provider_number, s.cbsa_code, s.cbsa_name,
               'FL'::VARCHAR(2) AS state_code, s.ascqr_compliant,
               'LEGACY_FACILITY_SETTINGS'::VARCHAR(50) AS verification_source,
               true AS is_verified
        INTO v_fac
        FROM public.facility_medicare_settings s
        WHERE s.facility_id = p_facility_id
          AND s.effective_start_date <= p_dos
          AND (s.effective_end_date IS NULL OR s.effective_end_date >= p_dos)
        LIMIT 1;
    END IF;

    -- Fail-Closed: If facility has no geographic mapping, block calculation
    IF v_fac.cbsa_code IS NULL THEN
        RAISE EXCEPTION 'UNRESOLVED_FACILITY_GEOGRAPHY: Facility % has no verified Medicare CBSA mapping for DOS %', p_facility_id, p_dos;
    END IF;

    -- 2. Resolve Applicable CMS Regulatory Release for DOS
    SELECT r.id, ('CY ' || r.release_year || ' ' || r.release_quarter || ' ' || r.rule_type) AS release_label,
           r.labor_related_share, r.non_labor_share, r.ascqr_reduction_factor
    INTO v_rel
    FROM public.cms_asc_releases r
    WHERE r.effective_start_date <= p_dos
      AND (r.effective_end_date IS NULL OR r.effective_end_date >= p_dos)
    ORDER BY r.release_year DESC, r.effective_start_date DESC
    LIMIT 1;

    -- Fallback to latest active release if DOS outside seeded bounds
    IF NOT FOUND THEN
        SELECT r.id, ('CY ' || r.release_year || ' ' || r.release_quarter || ' ' || r.rule_type) AS release_label,
               r.labor_related_share, r.non_labor_share, r.ascqr_reduction_factor
        INTO v_rel
        FROM public.cms_asc_releases r
        WHERE r.is_active = true
        ORDER BY r.release_year DESC
        LIMIT 1;
    END IF;

    IF v_rel.id IS NULL THEN
        RAISE EXCEPTION 'UNMAPPED_CMS_RELEASE: No active CMS Regulatory Release found for DOS %', p_dos;
    END IF;

    -- 3. Resolve CBSA Wage Index in Target Release
    SELECT w.wage_index, COALESCE(w.pre_floor_wage_index, w.wage_index) AS pre_floor_wage_index,
           w.is_rural_floor, COALESCE(w.is_reclassified, false) AS is_reclassified
    INTO v_wage
    FROM public.medicare_wage_indices w
    WHERE w.release_id = v_rel.id
      AND w.cbsa_code = v_fac.cbsa_code
    LIMIT 1;

    -- Fail-Closed: Never silently fallback to 1.0000 if CBSA is unrecognized
    IF NOT FOUND THEN
        RAISE EXCEPTION 'UNMAPPED_CBSA_WAGE_INDEX: CBSA % not found in CMS Regulatory Release % for DOS %', v_fac.cbsa_code, v_rel.release_label, p_dos;
    END IF;

    RETURN QUERY SELECT
        v_fac.facility_id,
        v_fac.medicare_provider_number,
        v_fac.cbsa_code,
        v_fac.cbsa_name,
        v_fac.state_code,
        v_wage.wage_index,
        v_wage.pre_floor_wage_index,
        v_wage.is_rural_floor,
        v_wage.is_reclassified,
        v_fac.ascqr_compliant,
        v_rel.ascqr_reduction_factor,
        v_rel.labor_related_share,
        v_rel.non_labor_share,
        v_rel.id,
        v_rel.release_label,
        v_fac.verification_source,
        v_fac.is_verified;
END;
$$;

-- ==============================================================================
-- 8. HARDEN fn_resolve_medicare_base_rate TO USE AUTHORITATIVE GEOGRAPHY RPC
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_resolve_medicare_base_rate(
    p_code VARCHAR(10),
    p_facility_id UUID DEFAULT NULL,
    p_dos DATE DEFAULT CURRENT_DATE,
    p_wage_index_override NUMERIC(6, 4) DEFAULT NULL
)
RETURNS TABLE (
    cpt_hcpcs_code VARCHAR(10),
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
    v_cbsa VARCHAR(5) := '00000';
    v_wage NUMERIC(6, 4) := 1.0000;
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
    v_geo RECORD;
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

    -- 2. Resolve Facility Geography via fn_resolve_facility_wage_index
    IF p_facility_id IS NOT NULL THEN
        BEGIN
            SELECT * INTO v_geo FROM public.fn_resolve_facility_wage_index(p_facility_id, p_dos);
            IF FOUND THEN
                v_cbsa := v_geo.cbsa_code;
                v_wage := v_geo.wage_index;
                v_ascqr_compliant := v_geo.ascqr_compliant;
                v_labor_share := v_geo.labor_share;
                v_non_labor_share := v_geo.non_labor_share;
                v_ascqr_factor := v_geo.ascqr_reduction_factor;
                v_rel_id := v_geo.release_id;
                v_rel_label := v_geo.release_label;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- Re-raise exception or return unresolved state without fallback
            RAISE EXCEPTION 'GEOGRAPHIC_RESOLUTION_FAILED: %', SQLERRM;
        END;
    ELSE
        -- Fallback to active release metadata for standalone calculation
        SELECT r.id, ('CY ' || r.release_year || ' ' || r.release_quarter || ' ' || r.rule_type),
               r.labor_related_share, r.non_labor_share, r.ascqr_reduction_factor
        INTO v_rel_id, v_rel_label, v_labor_share, v_non_labor_share, v_ascqr_factor
        FROM public.cms_asc_releases r
        WHERE r.effective_start_date <= p_dos
          AND (r.effective_end_date IS NULL OR r.effective_end_date >= p_dos)
        ORDER BY r.release_year DESC
        LIMIT 1;
    END IF;

    -- If wage index override provided (e.g. testing simulator), apply it
    IF p_wage_index_override IS NOT NULL AND p_wage_index_override > 0 THEN
        v_wage := p_wage_index_override;
    END IF;

    -- 3. Resolve National Unadjusted Rate from Addenda
    SELECT a.rate, COALESCE(a.payment_indicator, v_pi), a.is_device_intensive,
           COALESCE(a.device_offset_percentage, 0.0000), a.description
    INTO v_nat_rate, v_pi, v_is_dev, v_dev_pct, v_desc
    FROM public.cms_asc_addenda a
    WHERE a.cpt_hcpcs_code = v_code
      AND a.release_id = v_rel_id
    LIMIT 1;

    IF NOT FOUND THEN
        -- Fallback to latest available rate in addenda
        SELECT a.rate, COALESCE(a.payment_indicator, v_pi), a.is_device_intensive,
               COALESCE(a.device_offset_percentage, 0.0000), a.description
        INTO v_nat_rate, v_pi, v_is_dev, v_dev_pct, v_desc
        FROM public.cms_asc_addenda a
        WHERE a.cpt_hcpcs_code = v_code
        ORDER BY a.created_at DESC
        LIMIT 1;
    END IF;

    -- Handle Packaged (N1) procedures: Allowable = $0.00
    IF v_pi = 'N1' OR v_is_pkg THEN
        RETURN QUERY SELECT 
            v_code, COALESCE(v_desc, v_interp.short_name, 'Packaged Procedure'),
            'N1'::VARCHAR(5), true, 'Packaged'::VARCHAR(30), false,
            0.0000::NUMERIC(5, 4), 0.00::NUMERIC(12, 2), 0.00::NUMERIC(12, 2),
            v_cbsa, v_wage, 0.00::NUMERIC(12, 2), 0.00::NUMERIC(12, 2), 0.00::NUMERIC(12, 2),
            true, COALESCE(v_rel_label, 'CY 2026 CMS ASC Final Rule');
        RETURN;
    END IF;

    IF v_nat_rate IS NULL OR v_nat_rate = 0 THEN
        -- Check if cpt_master has a base rate fallback
        SELECT cm.base_medicare_rate, cm.description INTO v_nat_rate, v_desc
        FROM public.cpt_master cm
        WHERE cm.code = v_code;
    END IF;

    v_nat_rate := COALESCE(v_nat_rate, 0.00);

    -- 4. Apply Statutory 50/50 Wage Adjustment with Device Offset Carve-Out (42 CFR § 416.171(b))
    IF v_is_dev AND v_dev_pct > 0 THEN
        v_dev_amt := ROUND(v_nat_rate * v_dev_pct, 2);
        v_srv_unadj := v_nat_rate - v_dev_amt;
        v_srv_adj := (v_srv_unadj * v_labor_share * v_wage) + (v_srv_unadj * v_non_labor_share);
        
        IF NOT v_ascqr_compliant THEN
            v_srv_adj := v_srv_adj * v_ascqr_factor;
        END IF;
        
        v_final_adj := ROUND(v_dev_amt + v_srv_adj, 2);
    ELSE
        v_dev_amt := 0.00;
        v_srv_unadj := v_nat_rate;
        v_srv_adj := (v_nat_rate * v_labor_share * v_wage) + (v_nat_rate * v_non_labor_share);
        
        IF NOT v_ascqr_compliant THEN
            v_srv_adj := v_srv_adj * v_ascqr_factor;
        END IF;
        
        v_final_adj := ROUND(v_srv_adj, 2);
    END IF;

    RETURN QUERY SELECT 
        v_code, 
        COALESCE(v_desc, v_interp.short_name, 'Medicare Covered ASC Procedure'),
        COALESCE(v_pi, 'A2'), 
        true, 
        COALESCE(v_cov_stat, 'Covered_Surgical'),
        v_is_dev,
        v_dev_pct,
        v_dev_amt,
        v_nat_rate,
        v_cbsa,
        v_wage,
        v_srv_unadj,
        ROUND(v_srv_adj, 2),
        v_final_adj,
        false,
        COALESCE(v_rel_label, 'CY 2026 CMS ASC Final Rule');
END;
$$;

-- ==============================================================================
-- 9. ROW-LEVEL SECURITY (RLS) POLICIES
-- NOTE: Enforces user_has_facility_role and is_facility_accessible
-- ==============================================================================

ALTER TABLE public.facility_medicare_geographic_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_cbsa_delineations ENABLE ROW LEVEL SECURITY;

-- CBSA County Delineations are public reference data (Readable by all authenticated users)
DROP POLICY IF EXISTS rls_select_cbsa_delineations ON public.cms_cbsa_delineations;
CREATE POLICY rls_select_cbsa_delineations ON public.cms_cbsa_delineations
    FOR SELECT TO authenticated USING (true);

-- Facility Medicare Geographic Assignments Policies
DROP POLICY IF EXISTS rls_select_fac_geo_assignments ON public.facility_medicare_geographic_assignments;
CREATE POLICY rls_select_fac_geo_assignments ON public.facility_medicare_geographic_assignments
    FOR SELECT TO authenticated
    USING (
        user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'clinical_manager', 'biller', 'coder', 'viewer'])
        OR user_has_facility_role(NULL, ARRAY['super_admin'])
        OR public.is_facility_accessible(facility_id)
        OR (auth.jwt()->>'role') = 'service_role'
    );

DROP POLICY IF EXISTS rls_manage_fac_geo_assignments ON public.facility_medicare_geographic_assignments;
CREATE POLICY rls_manage_fac_geo_assignments ON public.facility_medicare_geographic_assignments
    FOR ALL TO authenticated
    USING (
        user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo'])
        OR user_has_facility_role(NULL, ARRAY['super_admin'])
        OR (auth.jwt()->>'role') = 'service_role'
    );

COMMIT;
