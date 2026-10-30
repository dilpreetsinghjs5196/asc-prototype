-- ==============================================================================
-- Migration: 040_multiple_procedure_payment_rules.sql
-- Description: Phase 64 Multiple Procedure Payment Rules (MPPR) Engine
-- Authoritative Standards: 42 CFR § 416.171-172, CMS Pub 100-04 Ch. 14 § 40.5
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. MULTIPLE PROCEDURE RULE SETS TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.multiple_procedure_rule_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE, -- NULL = Global Reference Rule Set
    payer_id UUID REFERENCES public.payers(id) ON DELETE CASCADE,       -- NULL = Default for Payment System
    rule_set_code VARCHAR(30) NOT NULL,                                  -- e.g. 'MEDICARE_ASC_416_172', 'COM_STD_CASCADE'
    name VARCHAR(150) NOT NULL,
    payment_system VARCHAR(30) NOT NULL CHECK (payment_system IN ('Medicare_ASC', 'Commercial', 'Medicaid', 'WorkerComp')),
    ranking_metric VARCHAR(30) NOT NULL DEFAULT 'ALLOWABLE_DESC' CHECK (ranking_metric IN ('ALLOWABLE_DESC', 'GROSS_CHARGE_DESC', 'RVU_DESC')),
    protect_device_offset BOOLEAN NOT NULL DEFAULT true,                -- Statutory J8 protection
    exempt_add_on_codes BOOLEAN NOT NULL DEFAULT true,                  -- + codes exempt from discount
    exempt_ancillary_codes BOOLEAN NOT NULL DEFAULT true,               -- Z2, K2 exempt from discount
    effective_start_date DATE NOT NULL DEFAULT '2024-01-01',
    effective_end_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_rule_set_code_facility UNIQUE (rule_set_code, facility_id, effective_start_date)
);

CREATE INDEX IF NOT EXISTS idx_mppr_rule_sets_lookup 
    ON public.multiple_procedure_rule_sets(payment_system, payer_id, is_active);

-- ==============================================================================
-- 2. TIERED MULTIPLE PROCEDURE REDUCTION RULES TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.multiple_procedure_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_set_id UUID NOT NULL REFERENCES public.multiple_procedure_rule_sets(id) ON DELETE CASCADE,
    tier_rank INTEGER NOT NULL CHECK (tier_rank >= 1),                  -- 1 = Primary, 2 = Secondary, 3 = Tertiary, etc.
    multiplier_percentage NUMERIC(5, 4) NOT NULL CHECK (multiplier_percentage BETWEEN 0.0000 AND 2.0000), -- 1.0000 = 100%, 0.5000 = 50%
    subsequent_units_multiplier NUMERIC(5, 4) NOT NULL DEFAULT 0.5000,  -- Multiplier for additional units on same line
    applies_to_device BOOLEAN NOT NULL DEFAULT false,                    -- Never true for Medicare ASC
    description VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_rule_set_tier UNIQUE (rule_set_id, tier_rank)
);

CREATE INDEX IF NOT EXISTS idx_mppr_rules_tier 
    ON public.multiple_procedure_rules(rule_set_id, tier_rank);

-- ==============================================================================
-- 3. CMS ENDOSCOPY FAMILIES (BASE-CODE DIFFERENCE LOOKUP TABLE)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.cms_endoscopy_families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id INTEGER NOT NULL,                                         -- e.g. Family 15 (Colonoscopy)
    family_name VARCHAR(150) NOT NULL,                                  -- e.g. 'Lower GI Endoscopy'
    member_cpt_code VARCHAR(5) NOT NULL,                                -- e.g. '45380', '45381'
    base_cpt_code VARCHAR(5) NOT NULL,                                  -- e.g. '45378'
    effective_year INTEGER NOT NULL DEFAULT 2026,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_endoscopy_member_year UNIQUE (member_cpt_code, effective_year)
);

CREATE INDEX IF NOT EXISTS idx_endoscopy_member 
    ON public.cms_endoscopy_families(member_cpt_code, effective_year);

-- ==============================================================================
-- 4. MPPR CALCULATION SNAPSHOTS (ENCOUNTER-LEVEL FINANCIAL AUDIT TRAIL)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.mppr_calculation_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE CASCADE,
    payer_id UUID REFERENCES public.payers(id) ON DELETE SET NULL,
    rule_set_id UUID NOT NULL REFERENCES public.multiple_procedure_rule_sets(id) ON DELETE RESTRICT,
    calculation_version VARCHAR(20) NOT NULL DEFAULT 'CY2026_V1',
    total_procedure_lines INTEGER NOT NULL,
    total_gross_charges NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_unreduced_allowable NUMERIC(12, 2) NOT NULL,
    total_mppr_savings NUMERIC(12, 2) NOT NULL,
    total_final_allowable NUMERIC(12, 2) NOT NULL,
    is_ascqr_compliant BOOLEAN NOT NULL DEFAULT true,
    calculation_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_mppr_snapshot_surgery 
    ON public.mppr_calculation_snapshots(surgery_id, created_at DESC);

-- ==============================================================================
-- 5. MPPR CALCULATION LINES (LINE-ITEM FINANCIAL AUDIT LEDGER)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.mppr_calculation_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id UUID NOT NULL REFERENCES public.mppr_calculation_snapshots(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL,
    cpt_code VARCHAR(5) NOT NULL,
    modifiers VARCHAR(10)[] NOT NULL DEFAULT '{}',
    payment_indicator VARCHAR(2) NOT NULL,
    units INTEGER NOT NULL DEFAULT 1,
    initial_unadjusted_rate NUMERIC(10, 2) NOT NULL,
    device_offset_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    wage_adjusted_service_share NUMERIC(10, 2) NOT NULL,
    rank_order INTEGER NOT NULL,                                         -- 1 = Primary, 2 = Secondary, etc.
    reduction_multiplier NUMERIC(5, 4) NOT NULL,                        -- 1.0000, 0.5000, 0.2500, 0.0000
    reduced_service_share NUMERIC(10, 2) NOT NULL,
    final_line_allowable NUMERIC(10, 2) NOT NULL,
    reduction_discount_amount NUMERIC(10, 2) NOT NULL,
    reduction_rationale TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_snapshot_line UNIQUE (snapshot_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_mppr_lines_snapshot 
    ON public.mppr_calculation_lines(snapshot_id, rank_order);

-- ==============================================================================
-- 6. IMMUTABILITY STATEMENT-LEVEL TRIGGERS ON FINANCIAL LEDGERS
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_block_mppr_snapshot_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'SECURITY_VIOLATION: mppr_calculation_snapshots and mppr_calculation_lines are immutable financial audit ledgers. UPDATE and DELETE operations are strictly prohibited.'
        USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_block_mppr_snapshot_modification ON public.mppr_calculation_snapshots;
CREATE TRIGGER trg_block_mppr_snapshot_modification
    BEFORE UPDATE OR DELETE ON public.mppr_calculation_snapshots
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.fn_block_mppr_snapshot_modification();

DROP TRIGGER IF EXISTS trg_block_mppr_lines_modification ON public.mppr_calculation_lines;
CREATE TRIGGER trg_block_mppr_lines_modification
    BEFORE UPDATE OR DELETE ON public.mppr_calculation_lines
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.fn_block_mppr_snapshot_modification();

-- ==============================================================================
-- 7. STORED PROCEDURES & RPC ENGINE
-- ==============================================================================

-- 7.1 Resolve Applicable MPPR Rule Set
DROP FUNCTION IF EXISTS public.fn_resolve_mppr_rules(UUID, UUID, DATE);

CREATE OR REPLACE FUNCTION public.fn_resolve_mppr_rules(
    p_facility_id UUID,
    p_payer_id UUID,
    p_dos DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    rule_set_id UUID,
    rule_set_code VARCHAR,
    name VARCHAR,
    payment_system VARCHAR,
    ranking_metric VARCHAR,
    protect_device_offset BOOLEAN,
    exempt_add_on_codes BOOLEAN,
    exempt_ancillary_codes BOOLEAN
) 
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Priority 1: Payer and Facility Specific Rule Set
    RETURN QUERY
    SELECT 
        rs.id,
        rs.rule_set_code,
        rs.name,
        rs.payment_system,
        rs.ranking_metric,
        rs.protect_device_offset,
        rs.exempt_add_on_codes,
        rs.exempt_ancillary_codes
    FROM public.multiple_procedure_rule_sets rs
    WHERE rs.is_active = true
      AND (rs.facility_id = p_facility_id OR rs.facility_id IS NULL)
      AND (rs.payer_id = p_payer_id OR rs.payer_id IS NULL)
      AND p_dos >= rs.effective_start_date
      AND (rs.effective_end_date IS NULL OR p_dos <= rs.effective_end_date)
    ORDER BY 
        CASE WHEN rs.facility_id IS NOT NULL AND rs.payer_id IS NOT NULL THEN 1
             WHEN rs.payer_id IS NOT NULL THEN 2
             WHEN rs.facility_id IS NOT NULL THEN 3
             ELSE 4 END
    LIMIT 1;
END;
$$;

-- 7.2 Authoritative Server-Side Multi-Line MPPR Calculator
DROP FUNCTION IF EXISTS public.fn_calculate_mppr_reimbursement(UUID, UUID, DATE, JSONB, BOOLEAN, BIGINT);

CREATE OR REPLACE FUNCTION public.fn_calculate_mppr_reimbursement(
    p_facility_id UUID,
    p_payer_id UUID,
    p_dos DATE,
    p_lines JSONB,                 -- Array of { cpt_code, units, modifiers, gross_charge }
    p_persist_snapshot BOOLEAN DEFAULT false,
    p_surgery_id BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rule_set RECORD;
    v_wage_index NUMERIC(6, 4) := 1.0000;
    v_ascqr_compliant BOOLEAN := true;
    v_ascqr_factor NUMERIC(5, 4) := 1.0000;
    v_total_lines INTEGER := 0;
    v_total_gross NUMERIC(12, 2) := 0.00;
    v_total_unreduced NUMERIC(12, 2) := 0.00;
    v_total_mppr_savings NUMERIC(12, 2) := 0.00;
    v_total_final NUMERIC(12, 2) := 0.00;
    v_snapshot_id UUID;
    v_ranked_lines JSONB := '[]'::jsonb;
    v_final_lines JSONB := '[]'::jsonb;
    v_line RECORD;
    v_rate_info RECORD;
    v_rank INTEGER := 1;
    v_is_primary BOOLEAN := true;
    v_multiplier NUMERIC(5, 4) := 1.0000;
    v_reduced_service NUMERIC(10, 2) := 0.00;
    v_final_allowable NUMERIC(10, 2) := 0.00;
    v_savings NUMERIC(10, 2) := 0.00;
    v_rationale TEXT;
    v_temp_lines JSONB := '[]'::jsonb;
BEGIN
    -- 1. Resolve Rule Set
    SELECT * INTO v_rule_set 
    FROM public.fn_resolve_mppr_rules(p_facility_id, p_payer_id, p_dos);

    IF v_rule_set.rule_set_id IS NULL THEN
        -- Default to statutory Medicare ASC rules
        SELECT 
            gen_random_uuid() AS rule_set_id,
            'MEDICARE_ASC_416_172'::VARCHAR AS rule_set_code,
            'Statutory Medicare ASC (42 CFR 416.172)'::VARCHAR AS name,
            'Medicare_ASC'::VARCHAR AS payment_system,
            'ALLOWABLE_DESC'::VARCHAR AS ranking_metric,
            true AS protect_device_offset,
            true AS exempt_add_on_codes,
            true AS exempt_ancillary_codes
        INTO v_rule_set;
    END IF;

    -- 2. Resolve Facility Wage Index and ASCQR status
    SELECT 
        COALESCE(s.wage_index_override, w.wage_index, 1.0000),
        COALESCE(s.quality_reporting_compliant, true)
    INTO v_wage_index, v_ascqr_compliant
    FROM public.facility_medicare_settings s
    LEFT JOIN public.medicare_wage_indices w 
        ON w.cbsa_code = s.cbsa_code 
       AND w.effective_year = EXTRACT(YEAR FROM p_dos)::INTEGER
    WHERE s.facility_id = p_facility_id;

    IF NOT FOUND THEN
        v_wage_index := 1.0000;
        v_ascqr_compliant := true;
    END IF;

    v_ascqr_factor := CASE WHEN v_ascqr_compliant THEN 1.0000 ELSE 0.9800 END;

    -- 3. Parse and Normalize Lines
    FOR v_line IN 
        SELECT 
            (elem->>'line_number')::INTEGER AS line_number,
            UPPER(TRIM(elem->>'cpt_code')) AS cpt_code,
            COALESCE((elem->>'units')::INTEGER, 1) AS units,
            COALESCE(ARRAY(SELECT jsonb_array_elements_text(elem->'modifiers')), '{}'::VARCHAR[]) AS modifiers,
            COALESCE((elem->>'gross_charge')::NUMERIC, 0.00) AS gross_charge
        FROM jsonb_array_elements(p_lines) AS elem
    LOOP
        v_total_lines := v_total_lines + 1;
        v_total_gross := v_total_gross + v_line.gross_charge;

        -- Resolve base rate for line
        SELECT * INTO v_rate_info 
        FROM public.fn_resolve_medicare_base_rate(p_dos, v_line.cpt_code, p_facility_id, v_wage_index);

        IF NOT FOUND THEN
            -- Unlisted or non-covered code
            v_rate_info.payment_indicator := 'NA';
            v_rate_info.national_unadjusted_rate := 0.00;
            v_rate_info.device_offset_amount := 0.00;
            v_rate_info.service_portion_adjusted := 0.00;
            v_rate_info.allowable_rate := 0.00;
        END IF;

        -- Check Bilateral Modifier 50
        IF '50' = ANY(v_line.modifiers) THEN
            v_rate_info.allowable_rate := ROUND(v_rate_info.allowable_rate * 1.50, 2);
            v_rate_info.service_portion_adjusted := ROUND(v_rate_info.service_portion_adjusted * 1.50, 2);
        END IF;

        -- Add to temp array
        v_temp_lines := v_temp_lines || jsonb_build_object(
            'line_number', COALESCE(v_line.line_number, v_total_lines),
            'cpt_code', v_line.cpt_code,
            'modifiers', to_jsonb(v_line.modifiers),
            'units', v_line.units,
            'gross_charge', v_line.gross_charge,
            'payment_indicator', COALESCE(v_rate_info.payment_indicator, 'A2'),
            'national_unadjusted_rate', COALESCE(v_rate_info.national_unadjusted_rate, 0.00),
            'device_offset_amount', COALESCE(v_rate_info.device_offset_amount, 0.00),
            'wage_adjusted_service_share', COALESCE(v_rate_info.service_portion_adjusted, 0.00),
            'single_unit_allowable', COALESCE(v_rate_info.allowable_rate, 0.00)
        );
    END LOOP;

    -- 4. Sort Lines for MPPR Ranking (Allowable DESC)
    SELECT jsonb_agg(item ORDER BY (item->>'single_unit_allowable')::NUMERIC DESC, item->>'cpt_code' ASC)
    INTO v_ranked_lines
    FROM jsonb_array_elements(v_temp_lines) AS item;

    -- 5. Calculate Reductions Line by Line
    v_rank := 1;
    FOR v_line IN
        SELECT 
            (elem->>'line_number')::INTEGER AS line_number,
            elem->>'cpt_code' AS cpt_code,
            (elem->>'units')::INTEGER AS units,
            COALESCE(ARRAY(SELECT jsonb_array_elements_text(elem->'modifiers')), '{}'::VARCHAR[]) AS modifiers,
            (elem->>'gross_charge')::NUMERIC AS gross_charge,
            elem->>'payment_indicator' AS payment_indicator,
            (elem->>'national_unadjusted_rate')::NUMERIC AS national_unadjusted_rate,
            (elem->>'device_offset_amount')::NUMERIC AS device_offset_amount,
            (elem->>'wage_adjusted_service_share')::NUMERIC AS wage_adjusted_service_share,
            (elem->>'single_unit_allowable')::NUMERIC AS single_unit_allowable
        FROM jsonb_array_elements(v_ranked_lines) AS elem
    LOOP
        -- Check if Packaged (N1)
        IF v_line.payment_indicator = 'N1' OR v_line.cpt_code ~ '^C[0-9]{4}$' THEN
            v_multiplier := 0.0000;
            v_reduced_service := 0.00;
            v_final_allowable := 0.00;
            v_savings := 0.00;
            v_rationale := 'Packaged Item (N1): Bundled into primary surgical APC ($0.00 separate allowable).';
        -- Check if Add-On Code (+)
        ELSIF v_line.cpt_code ~ '^\+' THEN
            v_multiplier := 1.0000;
            v_reduced_service := v_line.wage_adjusted_service_share;
            v_final_allowable := v_line.single_unit_allowable * v_line.units;
            v_savings := 0.00;
            v_rationale := 'Add-On Code (+): Statutorily exempt from MPPR reduction (100% allowable).';
        -- Check if Covered Ancillary (Z2, K2)
        ELSIF v_line.payment_indicator IN ('Z2', 'K2') THEN
            v_multiplier := 1.0000;
            v_reduced_service := v_line.wage_adjusted_service_share;
            v_final_allowable := v_line.single_unit_allowable * v_line.units;
            v_savings := 0.00;
            v_rationale := 'Covered Ancillary (' || v_line.payment_indicator || '): Exempt from surgical MPPR.';
        -- Primary Surgical Line (Rank 1)
        ELSIF v_rank = 1 THEN
            v_multiplier := 1.0000;
            v_reduced_service := v_line.wage_adjusted_service_share;
            IF v_line.units = 1 THEN
                v_final_allowable := v_line.single_unit_allowable;
                v_savings := 0.00;
                v_rationale := 'Primary Surgical Procedure (Rank 1): Paid at 100% allowable.';
            ELSE
                -- Subsequent units of primary line get 50%
                v_final_allowable := v_line.single_unit_allowable + (ROUND(v_line.single_unit_allowable * 0.50, 2) * (v_line.units - 1));
                v_savings := (v_line.single_unit_allowable * v_line.units) - v_final_allowable;
                v_rationale := format('Primary Procedure: Unit 1 paid at 100%%, remaining %s units paid at 50%%.', v_line.units - 1);
            END IF;
            v_rank := v_rank + 1;
        -- Secondary Surgical Line (Rank 2+)
        ELSE
            v_multiplier := 0.5000;
            -- Device-Intensive (J8) Carve-Out Protection
            IF v_line.payment_indicator = 'J8' AND v_line.device_offset_amount > 0 THEN
                v_reduced_service := ROUND(v_line.wage_adjusted_service_share * 0.50, 2);
                v_final_allowable := (v_line.device_offset_amount + v_reduced_service) * v_line.units;
                v_savings := (v_line.single_unit_allowable * v_line.units) - v_final_allowable;
                v_rationale := format('Secondary J8 (Rank %s): Protected Device Offset ($%s) at 100%% + Service Share at 50%%.', v_rank, v_line.device_offset_amount);
            ELSE
                -- Standard Surgical 50% Cut
                v_reduced_service := ROUND(v_line.wage_adjusted_service_share * 0.50, 2);
                v_final_allowable := ROUND(v_line.single_unit_allowable * 0.50, 2) * v_line.units;
                v_savings := (v_line.single_unit_allowable * v_line.units) - v_final_allowable;
                v_rationale := format('Secondary Surgical Procedure (Rank %s): Standard 50%% MPPR reduction.', v_rank);
            END IF;
            v_rank := v_rank + 1;
        END IF;

        v_total_unreduced := v_total_unreduced + (v_line.single_unit_allowable * v_line.units);
        v_total_final := v_total_final + v_final_allowable;
        v_total_mppr_savings := v_total_mppr_savings + v_savings;

        v_final_lines := v_final_lines || jsonb_build_object(
            'line_number', v_line.line_number,
            'cpt_code', v_line.cpt_code,
            'modifiers', to_jsonb(v_line.modifiers),
            'units', v_line.units,
            'payment_indicator', v_line.payment_indicator,
            'initial_unadjusted_rate', v_line.national_unadjusted_rate,
            'device_offset_amount', v_line.device_offset_amount,
            'wage_adjusted_service_share', v_line.wage_adjusted_service_share,
            'rank_order', CASE WHEN v_multiplier = 0.0000 THEN 0 ELSE (v_rank - 1) END,
            'reduction_multiplier', v_multiplier,
            'reduced_service_share', v_reduced_service,
            'final_line_allowable', v_final_allowable,
            'reduction_discount_amount', v_savings,
            'reduction_rationale', v_rationale
        );
    END LOOP;

    -- 6. Persist Financial Audit Snapshot if requested
    IF p_persist_snapshot AND p_surgery_id IS NOT NULL THEN
        INSERT INTO public.mppr_calculation_snapshots (
            facility_id, surgery_id, payer_id, rule_set_id,
            calculation_version, total_procedure_lines, total_gross_charges,
            total_unreduced_allowable, total_mppr_savings, total_final_allowable,
            is_ascqr_compliant, calculation_metadata
        ) VALUES (
            p_facility_id, p_surgery_id, p_payer_id, v_rule_set.rule_set_id,
            'CY2026_V1', v_total_lines, v_total_gross,
            v_total_unreduced, v_total_mppr_savings, v_total_final,
            v_ascqr_compliant, jsonb_build_object('wage_index', v_wage_index, 'dos', p_dos)
        ) RETURNING id INTO v_snapshot_id;

        -- Insert Line-Item Ledgers
        FOR v_line IN SELECT * FROM jsonb_to_recordset(v_final_lines) AS x(
            line_number INTEGER, cpt_code VARCHAR, modifiers VARCHAR[], payment_indicator VARCHAR,
            units INTEGER, initial_unadjusted_rate NUMERIC, device_offset_amount NUMERIC,
            wage_adjusted_service_share NUMERIC, rank_order INTEGER, reduction_multiplier NUMERIC,
            reduced_service_share NUMERIC, final_line_allowable NUMERIC, reduction_discount_amount NUMERIC,
            reduction_rationale TEXT
        ) LOOP
            INSERT INTO public.mppr_calculation_lines (
                snapshot_id, line_number, cpt_code, modifiers, payment_indicator,
                units, initial_unadjusted_rate, device_offset_amount, wage_adjusted_service_share,
                rank_order, reduction_multiplier, reduced_service_share, final_line_allowable,
                reduction_discount_amount, reduction_rationale
            ) VALUES (
                v_snapshot_id, v_line.line_number, v_line.cpt_code, v_line.modifiers, v_line.payment_indicator,
                v_line.units, v_line.initial_unadjusted_rate, v_line.device_offset_amount, v_line.wage_adjusted_service_share,
                v_line.rank_order, v_line.reduction_multiplier, v_line.reduced_service_share, v_line.final_line_allowable,
                v_line.reduction_discount_amount, v_line.reduction_rationale
            );
        END LOOP;
    END IF;

    -- Return JSONB payload
    RETURN jsonb_build_object(
        'rule_set_code', v_rule_set.rule_set_code,
        'rule_set_name', v_rule_set.name,
        'facility_id', p_facility_id,
        'payer_id', p_payer_id,
        'date_of_service', p_dos,
        'wage_index', v_wage_index,
        'is_ascqr_compliant', v_ascqr_compliant,
        'total_procedure_lines', v_total_lines,
        'total_gross_charges', v_total_gross,
        'total_unreduced_allowable', v_total_unreduced,
        'total_mppr_savings', v_total_mppr_savings,
        'total_final_allowable', v_total_final,
        'lines', v_final_lines
    );
END;
$$;

-- ==============================================================================
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.multiple_procedure_rule_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.multiple_procedure_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_endoscopy_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mppr_calculation_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mppr_calculation_lines ENABLE ROW LEVEL SECURITY;

-- Global Read for CMS Endoscopy Families & Baseline Rules
DROP POLICY IF EXISTS rls_endoscopy_families_read ON public.cms_endoscopy_families;
CREATE POLICY rls_endoscopy_families_read
    ON public.cms_endoscopy_families FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS rls_mppr_rule_sets_read ON public.multiple_procedure_rule_sets;
CREATE POLICY rls_mppr_rule_sets_read
    ON public.multiple_procedure_rule_sets FOR SELECT
    TO authenticated
    USING (
        facility_id IS NULL 
        OR public.is_facility_accessible(facility_id)
        OR public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'biller', 'coder'])
    );

DROP POLICY IF EXISTS rls_mppr_rules_read ON public.multiple_procedure_rules;
CREATE POLICY rls_mppr_rules_read
    ON public.multiple_procedure_rules FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.multiple_procedure_rule_sets rs
            WHERE rs.id = multiple_procedure_rules.rule_set_id
              AND (
                  rs.facility_id IS NULL
                  OR public.is_facility_accessible(rs.facility_id)
                  OR public.user_has_facility_role(rs.facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'biller', 'coder'])
              )
        )
    );

DROP POLICY IF EXISTS rls_mppr_snapshots_access ON public.mppr_calculation_snapshots;
CREATE POLICY rls_mppr_snapshots_access
    ON public.mppr_calculation_snapshots FOR ALL
    TO authenticated
    USING (
        public.is_facility_accessible(facility_id)
        OR public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'biller', 'coder'])
    )
    WITH CHECK (
        public.is_facility_accessible(facility_id)
        OR public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'biller', 'coder'])
    );

DROP POLICY IF EXISTS rls_mppr_lines_access ON public.mppr_calculation_lines;
CREATE POLICY rls_mppr_lines_access
    ON public.mppr_calculation_lines FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.mppr_calculation_snapshots s
            WHERE s.id = mppr_calculation_lines.snapshot_id
              AND (
                  public.is_facility_accessible(s.facility_id)
                  OR public.user_has_facility_role(s.facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'biller', 'coder'])
              )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.mppr_calculation_snapshots s
            WHERE s.id = mppr_calculation_lines.snapshot_id
              AND (
                  public.is_facility_accessible(s.facility_id)
                  OR public.user_has_facility_role(s.facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'biller', 'coder'])
              )
        )
    );

-- ==============================================================================
-- 9. SEED DATA (STATUTORY MEDICARE ASC & COMMERCIAL CASCADES)
-- ==============================================================================

-- 9.1 Seed Rule Sets
INSERT INTO public.multiple_procedure_rule_sets 
    (id, facility_id, payer_id, rule_set_code, name, payment_system, ranking_metric, protect_device_offset, exempt_add_on_codes, exempt_ancillary_codes, effective_start_date)
VALUES
    ('30000000-0000-0000-0000-000000000001', NULL, NULL, 'MEDICARE_ASC_416_172', 'Medicare ASC Statutory Reduction (42 CFR § 416.172)', 'Medicare_ASC', 'ALLOWABLE_DESC', true, true, true, '2024-01-01'),
    ('30000000-0000-0000-0000-000000000002', NULL, NULL, 'COM_STD_CASCADE', 'Commercial Standard 100/50/25/0 Cascade', 'Commercial', 'ALLOWABLE_DESC', false, true, true, '2024-01-01'),
    ('30000000-0000-0000-0000-000000000003', NULL, NULL, 'COM_SYM_50', 'Commercial Symmetric 100/50/50/50 Cascade', 'Commercial', 'ALLOWABLE_DESC', false, true, true, '2024-01-01')
ON CONFLICT (rule_set_code, facility_id, effective_start_date) DO UPDATE SET
    name = EXCLUDED.name,
    protect_device_offset = EXCLUDED.protect_device_offset;

-- 9.2 Seed Rules per Tier Rank
-- Medicare ASC: Tier 1 = 100%, Tier 2+ = 50%
INSERT INTO public.multiple_procedure_rules (rule_set_id, tier_rank, multiplier_percentage, subsequent_units_multiplier, applies_to_device, description)
VALUES
    ('30000000-0000-0000-0000-000000000001', 1, 1.0000, 0.5000, false, 'Primary procedure paid at 100%; unit 2+ paid at 50%'),
    ('30000000-0000-0000-0000-000000000001', 2, 0.5000, 0.5000, false, 'Secondary surgical procedure paid at 50% service portion')
ON CONFLICT (rule_set_id, tier_rank) DO UPDATE SET
    multiplier_percentage = EXCLUDED.multiplier_percentage;

-- Commercial Standard Cascade: 100/50/25/0
INSERT INTO public.multiple_procedure_rules (rule_set_id, tier_rank, multiplier_percentage, subsequent_units_multiplier, applies_to_device, description)
VALUES
    ('30000000-0000-0000-0000-000000000002', 1, 1.0000, 0.5000, false, 'Rank 1 paid at 100% allowable'),
    ('30000000-0000-0000-0000-000000000002', 2, 0.5000, 0.5000, false, 'Rank 2 paid at 50% allowable'),
    ('30000000-0000-0000-0000-000000000002', 3, 0.2500, 0.2500, false, 'Rank 3 paid at 25% allowable'),
    ('30000000-0000-0000-0000-000000000002', 4, 0.0000, 0.0000, false, 'Rank 4+ bundled / $0.00 allowable')
ON CONFLICT (rule_set_id, tier_rank) DO UPDATE SET
    multiplier_percentage = EXCLUDED.multiplier_percentage;

-- 9.3 Seed CMS Endoscopy Families (CY 2026 CMS-1823-FC)
INSERT INTO public.cms_endoscopy_families (family_id, family_name, member_cpt_code, base_cpt_code, effective_year)
VALUES
    (15, 'Lower GI Endoscopy (Colonoscopy)', '45378', '45378', 2026),
    (15, 'Lower GI Endoscopy (Colonoscopy)', '45380', '45378', 2026),
    (15, 'Lower GI Endoscopy (Colonoscopy)', '45381', '45378', 2026),
    (15, 'Lower GI Endoscopy (Colonoscopy)', '45384', '45378', 2026),
    (15, 'Lower GI Endoscopy (Colonoscopy)', '45385', '45378', 2026),
    (14, 'Upper GI Endoscopy (EGD)', '43235', '43235', 2026),
    (14, 'Upper GI Endoscopy (EGD)', '43239', '43235', 2026),
    (14, 'Upper GI Endoscopy (EGD)', '43248', '43235', 2026),
    (1,  'Bronchoscopy', '31622', '31622', 2026),
    (1,  'Bronchoscopy', '31623', '31622', 2026),
    (1,  'Bronchoscopy', '31624', '31622', 2026)
ON CONFLICT (member_cpt_code, effective_year) DO UPDATE SET
    family_id = EXCLUDED.family_id,
    base_cpt_code = EXCLUDED.base_cpt_code;

COMMIT;

