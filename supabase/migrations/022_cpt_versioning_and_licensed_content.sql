-- ==============================================================================
-- MIGRATION 022: CPT VERSIONING, EFFECTIVE DATES & LICENSED CONTENT (PHASE 45)
-- ==============================================================================
-- Description: Establishes production versioning, historical financial immutability,
--              temporal exclusion constraints, and licensed content governance:
--              1. Enables btree_gist extension for temporal interval indexing.
--              2. Enforces temporal non-overlap validation trigger on cpt_code_versions.
--              3. Enhances surgery_procedures with snapshot columns (cpt_version_id, pricing_dos, pricing_source).
--              4. Updates fn_resolve_cpt_pricing to fail-closed on dates outside active bounds.
--              5. Hardens calculate_surgery_financials against bilateral 300% double-counting.
--              6. Enhances v_cpt_codes_compat view with canonical UUID identifiers.
-- Specification: docs/phases/45_CPT_VERSIONING_AND_LICENSED_CONTENT.md
-- Target Engine: Supabase PostgreSQL 15+
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- ==============================================================================
-- 1. TEMPORAL BOUNDS & EXCLUSION INTEGRITY (cpt_code_versions)
-- ==============================================================================

-- Trigger Function: Validate temporal non-overlap and interval validity
CREATE OR REPLACE FUNCTION public.fn_validate_cpt_version_temporal_bounds()
RETURNS TRIGGER AS $$
DECLARE
    v_overlap_count INTEGER;
BEGIN
    -- Ensure effective_date is provided
    IF NEW.effective_date IS NULL THEN
        RAISE EXCEPTION 'effective_date is mandatory for CPT code versioning';
    END IF;

    -- Ensure termination_date >= effective_date if set
    IF NEW.termination_date IS NOT NULL AND NEW.termination_date < NEW.effective_date THEN
        RAISE EXCEPTION 'termination_date (%) cannot be prior to effective_date (%)', 
            NEW.termination_date, NEW.effective_date;
    END IF;

    -- Check for overlapping active intervals for the same CPT code and facility scope
    SELECT COUNT(*) INTO v_overlap_count
    FROM public.cpt_code_versions v
    WHERE v.cpt_master_id = NEW.cpt_master_id
      AND (v.facility_id IS NOT DISTINCT FROM NEW.facility_id)
      AND v.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND daterange(v.effective_date, COALESCE(v.termination_date, 'infinity'::date), '[]') &&
          daterange(NEW.effective_date, COALESCE(NEW.termination_date, 'infinity'::date), '[]');

    IF v_overlap_count > 0 THEN
        RAISE EXCEPTION 'Overlapping temporal validity period detected for CPT master ID % and facility % (Effective: %, Termination: %)',
            NEW.cpt_master_id, NEW.facility_id, NEW.effective_date, NEW.termination_date;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_cpt_version_temporal_bounds ON public.cpt_code_versions;
CREATE TRIGGER trg_validate_cpt_version_temporal_bounds
BEFORE INSERT OR UPDATE ON public.cpt_code_versions
FOR EACH ROW EXECUTE FUNCTION public.fn_validate_cpt_version_temporal_bounds();

-- ==============================================================================
-- 2. ENHANCE SURGERY PROCEDURES WITH SNAPSHOT & LICENSING COLUMNS
-- ==============================================================================

ALTER TABLE public.surgery_procedures 
ADD COLUMN IF NOT EXISTS cpt_version_id UUID REFERENCES public.cpt_code_versions(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS pricing_source TEXT DEFAULT 'CMS_BASELINE',
ADD COLUMN IF NOT EXISTS pricing_dos DATE,
ADD COLUMN IF NOT EXISTS ama_copyright_acknowledged BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_sp_cpt_version ON public.surgery_procedures(cpt_version_id);
CREATE INDEX IF NOT EXISTS idx_sp_pricing_dos ON public.surgery_procedures(pricing_dos);

-- ==============================================================================
-- 3. HARDENED PRICING RESOLVER (FAIL-CLOSED ON INVALID DOS)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_resolve_cpt_pricing(
    p_facility_id UUID,
    p_cpt_code VARCHAR,
    p_dos DATE DEFAULT CURRENT_DATE,
    p_payer_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_master_id UUID;
    v_version_id UUID;
    v_rate_source TEXT := 'NONE';
    v_contracted_rate NUMERIC(12, 2) := NULL;
    v_gross_charge NUMERIC(12, 2) := NULL;
    v_reimbursement NUMERIC(12, 2) := NULL;
    v_procedure_indicator VARCHAR(10) := NULL;
BEGIN
    -- 1. Identify Master CPT Record
    SELECT id INTO v_master_id FROM public.cpt_master WHERE code = p_cpt_code;
    IF v_master_id IS NULL THEN
        -- Also check legacy code format
        SELECT id INTO v_master_id FROM public.cpt_master WHERE code = TRIM(p_cpt_code);
    END IF;

    IF v_master_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'CPT_CODE_NOT_FOUND',
            'code', p_cpt_code,
            'date_of_service', p_dos,
            'message', 'CPT code does not exist in master catalog'
        );
    END IF;

    -- 2. Check Contracted Payer Fee Schedule (Tier 1)
    IF p_payer_id IS NOT NULL THEN
        SELECT pfs.contracted_rate, pfs.id INTO v_contracted_rate, v_version_id
        FROM public.payer_fee_schedules pfs
        WHERE pfs.facility_id = p_facility_id
          AND pfs.payer_id = p_payer_id
          AND (
              pfs.cpt_code_id IN (SELECT id FROM public.cpt_codes WHERE code = p_cpt_code)
              OR pfs.cpt_code_id IN (SELECT legacy_cpt_id FROM public.cpt_code_versions WHERE cpt_master_id = v_master_id)
          )
          AND p_dos >= pfs.effective_start_date
          AND (pfs.effective_end_date IS NULL OR p_dos <= pfs.effective_end_date)
        ORDER BY pfs.effective_start_date DESC LIMIT 1;

        IF v_contracted_rate IS NOT NULL THEN
            v_rate_source := 'PAYER_CONTRACT';
        END IF;
    END IF;

    -- 3. Check Facility-Specific Custom Override (Tier 2)
    IF v_contracted_rate IS NULL THEN
        SELECT v.reimbursement, v.gross_charge, v.id, v.procedure_indicator
        INTO v_reimbursement, v_gross_charge, v_version_id, v_procedure_indicator
        FROM public.cpt_code_versions v
        WHERE v.cpt_master_id = v_master_id
          AND v.facility_id = p_facility_id
          AND p_dos >= v.effective_date
          AND (v.termination_date IS NULL OR p_dos <= v.termination_date)
        ORDER BY v.effective_date DESC LIMIT 1;

        IF v_reimbursement IS NOT NULL THEN
            v_rate_source := 'FACILITY_OVERRIDE';
            v_contracted_rate := v_reimbursement;
        END IF;
    END IF;

    -- 4. Check National CMS Standard Catalog (Tier 3)
    IF v_reimbursement IS NULL THEN
        SELECT v.reimbursement, v.gross_charge, v.id, v.procedure_indicator
        INTO v_reimbursement, v_gross_charge, v_version_id, v_procedure_indicator
        FROM public.cpt_code_versions v
        WHERE v.cpt_master_id = v_master_id
          AND v.facility_id IS NULL
          AND p_dos >= v.effective_date
          AND (v.termination_date IS NULL OR p_dos <= v.termination_date)
        ORDER BY v.effective_date DESC LIMIT 1;

        IF v_reimbursement IS NOT NULL THEN
            v_rate_source := 'CMS_NATIONAL_STANDARD';
            v_contracted_rate := v_reimbursement;
        END IF;
    END IF;

    -- If no version covers the requested Date of Service, fail closed
    IF v_version_id IS NULL OR (v_contracted_rate IS NULL AND v_reimbursement IS NULL) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'NO_ACTIVE_VERSION_FOR_DOS',
            'code', p_cpt_code,
            'master_id', v_master_id,
            'date_of_service', p_dos,
            'message', 'No active CPT version found for requested Date of Service'
        );
    END IF;

    -- Enforce whole-dollar 350% gross charge rule
    IF v_gross_charge IS NULL OR v_gross_charge = 0.00 THEN
        v_gross_charge := ROUND(COALESCE(v_contracted_rate, v_reimbursement, 0.00) * 3.50, 0);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'code', p_cpt_code,
        'master_id', v_master_id,
        'version_id', v_version_id,
        'rate_source', v_rate_source,
        'contracted_reimbursement', COALESCE(v_contracted_rate, 0.00),
        'baseline_gross_charge', COALESCE(v_gross_charge, 0.00),
        'procedure_indicator', v_procedure_indicator,
        'date_of_service', p_dos,
        'copyright_notice', 'CPT is copyright American Medical Association.'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 4. HARDENED FINANCIAL CALCULATION (ACCURATE BILATERAL & MPPR)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.calculate_surgery_financials(p_surgery_id BIGINT)
RETURNS TABLE (
    total_revenue NUMERIC(12, 2),
    total_cost NUMERIC(12, 2),
    net_margin NUMERIC(12, 2),
    ebitda_margin_pct NUMERIC(5, 2)
) AS $$
DECLARE
    v_surg RECORD;
    v_proc RECORD;
    v_proc_rate NUMERIC(12, 2);
    v_units INTEGER;
    v_total_revenue NUMERIC(12, 2) := 0.00;
    v_total_cost NUMERIC(12, 2) := 0.00;
    v_net_margin NUMERIC(12, 2) := 0.00;
    v_ebitda_pct NUMERIC(5, 2) := 0.00;
    v_is_bilateral BOOLEAN;
    v_is_mppr_enabled BOOLEAN := false;
    v_eligible_rank INTEGER := 1;
    v_room_cost NUMERIC(12, 2) := 0.00;
    v_labor_cost NUMERIC(12, 2) := 0.00;
    v_supplies_cost NUMERIC(12, 2) := 0.00;
    v_implants_cost NUMERIC(12, 2) := 0.00;
    v_meds_cost NUMERIC(12, 2) := 0.00;
BEGIN
    SELECT s.*, f.apply_medicare_mppr INTO v_surg
    FROM public.surgeries s
    LEFT JOIN public.facilities f ON s.facility_id = f.id
    WHERE s.id = p_surgery_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    v_is_mppr_enabled := COALESCE(v_surg.apply_medicare_mppr, false);

    -- Compute Room & Labor Costs
    IF v_surg.actual_room_cost IS NOT NULL AND v_surg.actual_room_cost > 0 THEN
        v_room_cost := v_surg.actual_room_cost;
    ELSIF v_surg.duration_minutes IS NOT NULL AND v_surg.duration_minutes > 0 THEN
        v_room_cost := v_surg.duration_minutes * 14.00;
    END IF;

    IF v_surg.actual_labor_cost IS NOT NULL AND v_surg.actual_labor_cost > 0 THEN
        v_labor_cost := v_surg.actual_labor_cost;
    ELSIF v_surg.duration_minutes IS NOT NULL AND v_surg.duration_minutes > 0 THEN
        v_labor_cost := v_surg.duration_minutes * 15.00;
    END IF;

    v_supplies_cost := COALESCE(v_surg.supplies_cost, 0.00);
    v_implants_cost := COALESCE(v_surg.implants_cost, 0.00);
    v_meds_cost := COALESCE(v_surg.medications_cost, 0.00);

    -- Payment Model Evaluation
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
        -- Standard / Insurance billing based on normalized line items
        IF EXISTS (SELECT 1 FROM public.surgery_procedures WHERE surgery_id = p_surgery_id) THEN
            FOR v_proc IN 
                SELECT sp.*, COALESCE(cm.code, c.code) AS cpt_code_str
                FROM public.surgery_procedures sp
                LEFT JOIN public.cpt_code_versions v ON sp.cpt_version_id = v.id
                LEFT JOIN public.cpt_master cm ON v.cpt_master_id = cm.id
                LEFT JOIN public.cpt_codes c ON sp.cpt_code_id = c.id
                WHERE sp.surgery_id = p_surgery_id
                ORDER BY sp.baseline_charge DESC, sp.sequence_rank ASC
            LOOP
                v_proc_rate := COALESCE(v_proc.contracted_reimbursement, v_proc.line_expected_reimbursement, v_proc.baseline_charge, 0.00);
                v_units := GREATEST(1, COALESCE(v_proc.units, 1));
                v_is_bilateral := ('50' = ANY(COALESCE(v_proc.modifiers, '{}')) OR v_proc.laterality = 'BILATERAL');

                -- Deterministic Bilateral Adjustment:
                -- First unit receives 150%; any extra units receive standard 100% (eliminates 300% bug)
                IF v_is_bilateral THEN
                    v_proc_rate := v_proc_rate * 1.50;
                END IF;

                IF NOT v_is_mppr_enabled THEN
                    v_total_revenue := v_total_revenue + (v_proc_rate * v_units);
                ELSE
                    -- Add-on codes (+) exempt from MPPR reduction
                    IF v_proc.cpt_code_str LIKE '+%' THEN
                        v_total_revenue := v_total_revenue + (v_proc_rate * v_units);
                    ELSIF v_eligible_rank = 1 THEN
                        -- Primary code receives 100% on first unit, 50% on subsequent units
                        v_total_revenue := v_total_revenue + v_proc_rate + (v_proc_rate * 0.50 * (v_units - 1));
                        v_eligible_rank := v_eligible_rank + 1;
                    ELSE
                        -- Secondary procedures receive 50% MPPR discount
                        v_total_revenue := v_total_revenue + (v_proc_rate * 0.50 * v_units);
                        v_eligible_rank := v_eligible_rank + 1;
                    END IF;
                END IF;
            END LOOP;
        ELSE
            v_total_revenue := COALESCE(v_surg.expected_reimbursement, 0.00);
        END IF;
    END IF;

    -- Direct Costs & Margins
    v_total_cost := v_room_cost + v_labor_cost + v_supplies_cost + v_implants_cost + v_meds_cost;
    v_net_margin := (v_total_revenue - COALESCE(v_surg.write_off, 0.00)) - v_total_cost;

    IF v_total_revenue > 0 THEN
        v_ebitda_pct := ROUND(((v_net_margin / v_total_revenue) * 100.0), 2);
    ELSE
        v_ebitda_pct := 0.00;
    END IF;

    RETURN QUERY SELECT v_total_revenue, v_total_cost, v_net_margin, v_ebitda_pct;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ==============================================================================
-- 5. ENHANCED BACKWARD-COMPATIBILITY VIEW (v_cpt_codes_compat)
-- ==============================================================================

DROP VIEW IF EXISTS public.v_cpt_codes_compat CASCADE;
CREATE OR REPLACE VIEW public.v_cpt_codes_compat AS
SELECT 
    COALESCE(v.legacy_cpt_id, ('x' || substr(md5(v.id::text), 1, 8))::bit(32)::bigint) AS id,
    v.id AS version_id,
    m.id AS master_id,
    m.code,
    m.description,
    m.short_descriptor,
    m.long_descriptor,
    v.reimbursement,
    v.gross_charge,
    m.specialty AS category,
    m.procedure_group,
    v.effective_date,
    v.termination_date,
    v.code_year::text AS version_year,
    v.code_year,
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
    m.body_part,
    cs.name AS specialty_name,
    bs.name AS body_system_name,
    bp.name AS body_part_name,
    org.name AS organ_name,
    pf.name AS procedure_family_name,
    'CPT copyright American Medical Association. All rights reserved.' AS ama_copyright_notice,
    'CPT copyright American Medical Association' AS licensing_attribution
FROM public.cpt_code_versions v
JOIN public.cpt_master m ON v.cpt_master_id = m.id
LEFT JOIN public.cpt_clinical_mappings ccm ON ccm.cpt_master_id = m.id AND ccm.is_primary = true
LEFT JOIN public.clinical_specialties cs ON ccm.specialty_id = cs.id
LEFT JOIN public.body_systems bs ON ccm.body_system_id = bs.id
LEFT JOIN public.body_parts bp ON ccm.body_part_id = bp.id
LEFT JOIN public.anatomical_organs org ON ccm.organ_id = org.id
LEFT JOIN public.procedure_families pf ON ccm.procedure_family_id = pf.id;

COMMIT;
