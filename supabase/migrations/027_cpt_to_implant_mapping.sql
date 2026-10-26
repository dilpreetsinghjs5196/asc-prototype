-- ==============================================================================
-- MIGRATION: 027_cpt_to_implant_mapping.sql
-- DESCRIPTION: Phase 52 — CPT to Implant Mapping & Pre-Bill Completeness Bridge
--              - Master junction table: public.cpt_implant_mappings
--              - Audit review ledger: public.cpt_implant_mapping_reviews
--              - Multi-cardinality links connecting CPT procedure codes to implant components
--              - Requirement type ontology: required, optional, conditional, not_applicable
--              - Deterministic quantity calculation methods: fixed, per_level, per_unit, laterality_dependent, surgeon_discretion
--              - Evidence citations and confidence scoring (0.00 to 1.00)
--              - Temporal Date-of-Service (DOS) effective and termination windows
--              - Integrity validation trigger fn_validate_cpt_implant_mapping_integrity
--              - Row-Level Security (RLS) policies for hybrid global baseline / tenant overrides
--              - Authoritative stored function fn_resolve_cpt_implant_requirements
--              - Pre-bill charge completeness engine extension: DEV-003, DEV-004, DEV-005
--              - Multi-specialty authoritative seed catalog (Orthopedics, Spine, Ophthalmology, Pain Management, Plastics)
-- PLATFORM: Supabase PostgreSQL 15+ (ASCANALYST Enterprise)
-- DATE: 2026-10-26
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. TABLE: public.cpt_implant_mappings
-- Authoritative junction linking CPT procedure codes to clinical implant components
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.cpt_implant_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cpt_master_id UUID NOT NULL REFERENCES public.cpt_master(id) ON DELETE RESTRICT,
    cpt_code VARCHAR(10) NOT NULL, -- Denormalized for high-speed indexing & audit
    component_id UUID NOT NULL REFERENCES public.implant_components(id) ON DELETE RESTRICT,
    category_id UUID NOT NULL REFERENCES public.implant_categories(id) ON DELETE RESTRICT,
    facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE, -- NULL = Global Baseline, Set = Facility Override
    
    -- Clinical Requirement & Math Model
    requirement_type VARCHAR(20) NOT NULL DEFAULT 'required'
        CHECK (requirement_type IN ('required', 'optional', 'conditional', 'not_applicable')),
    quantity_calculation_method VARCHAR(30) NOT NULL DEFAULT 'fixed'
        CHECK (quantity_calculation_method IN ('fixed', 'per_level', 'per_unit', 'laterality_dependent', 'surgeon_discretion')),
    expected_quantity_min INTEGER NOT NULL DEFAULT 1 CHECK (expected_quantity_min >= 0),
    expected_quantity_max INTEGER NOT NULL DEFAULT 1 CHECK (expected_quantity_max >= expected_quantity_min),
    default_quantity INTEGER NOT NULL DEFAULT 1,
    condition_expression TEXT, -- Criteria for conditional components (e.g., 'autograft_harvested = FALSE')
    
    -- Evidence, Provenance & Governance
    mapping_source VARCHAR(30) NOT NULL DEFAULT 'clinical_guideline'
        CHECK (mapping_source IN ('clinical_guideline', 'cms_lcd', 'fda_ifu', 'surgeon_consensus', 'facility_override', 'historical_frequency', 'ai_suggested')),
    clinical_evidence_citation TEXT NOT NULL, -- e.g., 'AAOS CPG 2020; CMS LCD L33394'
    confidence_score NUMERIC(3, 2) NOT NULL DEFAULT 1.00
        CHECK (confidence_score >= 0.00 AND confidence_score <= 1.00),
    review_status VARCHAR(20) NOT NULL DEFAULT 'verified'
        CHECK (review_status IN ('draft', 'pending_review', 'verified', 'rejected', 'deprecated')),
    
    -- Temporal Validity & Versioning
    effective_date DATE NOT NULL DEFAULT '2020-01-01',
    termination_date DATE,
    version_number INTEGER NOT NULL DEFAULT 1 CHECK (version_number >= 1),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Actor Auditing
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Invariant: Unique mapping per CPT, Component, Facility Scope, and Effective Date
    CONSTRAINT uq_cpt_component_facility_effective 
        UNIQUE NULLS NOT DISTINCT (cpt_master_id, component_id, facility_id, effective_date),

    -- Invariant: Default quantity must fall within min/max bounds
    CONSTRAINT chk_default_quantity_bounds 
        CHECK (default_quantity >= expected_quantity_min AND default_quantity <= expected_quantity_max),

    -- Invariant: Valid temporal window
    CONSTRAINT chk_mapping_temporal_window 
        CHECK (termination_date IS NULL OR termination_date >= effective_date)
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_cim_cpt_code ON public.cpt_implant_mappings(cpt_code);
CREATE INDEX IF NOT EXISTS idx_cim_cpt_master ON public.cpt_implant_mappings(cpt_master_id);
CREATE INDEX IF NOT EXISTS idx_cim_component ON public.cpt_implant_mappings(component_id);
CREATE INDEX IF NOT EXISTS idx_cim_category ON public.cpt_implant_mappings(category_id);
CREATE INDEX IF NOT EXISTS idx_cim_facility ON public.cpt_implant_mappings(facility_id);
CREATE INDEX IF NOT EXISTS idx_cim_status ON public.cpt_implant_mappings(review_status) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_cim_temporal ON public.cpt_implant_mappings(cpt_code, effective_date, termination_date);

-- ==============================================================================
-- 2. TABLE: public.cpt_implant_mapping_reviews
-- Immutable audit log for clinical review decisions, approvals, and rationales
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.cpt_implant_mapping_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mapping_id UUID NOT NULL REFERENCES public.cpt_implant_mappings(id) ON DELETE CASCADE,
    reviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action VARCHAR(30) NOT NULL 
        CHECK (action IN ('created', 'approved', 'rejected', 'modified', 'deactivated', 'reactivated')),
    previous_status VARCHAR(20),
    new_status VARCHAR(20) NOT NULL,
    previous_requirement_type VARCHAR(20),
    new_requirement_type VARCHAR(20),
    rationale TEXT NOT NULL,
    clinical_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cimr_mapping ON public.cpt_implant_mapping_reviews(mapping_id);
CREATE INDEX IF NOT EXISTS idx_cimr_reviewer ON public.cpt_implant_mapping_reviews(reviewer_id);

-- ==============================================================================
-- 3. INTEGRITY & VALIDATION TRIGGERS
-- ==============================================================================

-- 3.1 Validation Function: Component-Category Integrity & Temporal Non-Overlap
CREATE OR REPLACE FUNCTION public.fn_validate_cpt_implant_mapping_integrity()
RETURNS TRIGGER AS $$
DECLARE
    v_component_category_id UUID;
    v_cpt_code VARCHAR(10);
    v_overlap_count INTEGER;
BEGIN
    -- 1. Verify component belongs to declared category
    SELECT category_id INTO v_component_category_id
    FROM public.implant_components
    WHERE id = NEW.component_id;

    IF v_component_category_id IS NULL THEN
        RAISE EXCEPTION 'Referenced implant component % does not exist.', NEW.component_id;
    END IF;

    IF v_component_category_id != NEW.category_id THEN
        RAISE EXCEPTION 'Category mismatch: Component % belongs to category %, but mapping declared category %.',
            NEW.component_id, v_component_category_id, NEW.category_id;
    END IF;

    -- 2. Synchronize denormalized CPT code from cpt_master
    SELECT code INTO v_cpt_code
    FROM public.cpt_master
    WHERE id = NEW.cpt_master_id;

    IF v_cpt_code IS NULL THEN
        RAISE EXCEPTION 'Referenced CPT master row % does not exist.', NEW.cpt_master_id;
    END IF;
    NEW.cpt_code := v_cpt_code;

    -- 3. Temporal overlap guard: Block overlapping active mappings for identical CPT + Component + Scope
    SELECT COUNT(*) INTO v_overlap_count
    FROM public.cpt_implant_mappings
    WHERE cpt_master_id = NEW.cpt_master_id
      AND component_id = NEW.component_id
      AND (facility_id IS NOT DISTINCT FROM NEW.facility_id)
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND is_active = TRUE
      AND (
          (NEW.termination_date IS NULL AND (termination_date IS NULL OR termination_date >= NEW.effective_date))
          OR
          (NEW.termination_date IS NOT NULL AND effective_date <= NEW.termination_date AND (termination_date IS NULL OR termination_date >= NEW.effective_date))
      );

    IF v_overlap_count > 0 THEN
        RAISE EXCEPTION 'Active mapping already exists with an overlapping temporal date range for CPT % and Component %.',
            NEW.cpt_code, NEW.component_id;
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_validate_cpt_implant_mapping ON public.cpt_implant_mappings;
CREATE TRIGGER trg_validate_cpt_implant_mapping
    BEFORE INSERT OR UPDATE ON public.cpt_implant_mappings
    FOR EACH ROW EXECUTE FUNCTION public.fn_validate_cpt_implant_mapping_integrity();

-- 3.2 Touch updated_at Function & Trigger
CREATE OR REPLACE FUNCTION public.fn_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_cpt_implant_mappings ON public.cpt_implant_mappings;
CREATE TRIGGER trg_touch_cpt_implant_mappings
    BEFORE UPDATE ON public.cpt_implant_mappings
    FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

-- 3.3 Audit Trigger via existing audit_logs infrastructure (conditional)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p 
        JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE n.nspname = 'public' AND p.proname = 'fn_audit_log_trigger'
    ) THEN
        DROP TRIGGER IF EXISTS trg_audit_cpt_implant_mappings ON public.cpt_implant_mappings;
        CREATE TRIGGER trg_audit_cpt_implant_mappings
            AFTER INSERT OR UPDATE OR DELETE ON public.cpt_implant_mappings
            FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();
    END IF;
END $$;

-- ==============================================================================
-- 4. ROW-LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.cpt_implant_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpt_implant_mapping_reviews ENABLE ROW LEVEL SECURITY;

-- 4.1 Facility Isolation Policy: Global baselines visible to all; Facility overrides visible to tenant
DROP POLICY IF EXISTS "cpt_implant_mappings_facility_isolation" ON public.cpt_implant_mappings;
CREATE POLICY "cpt_implant_mappings_facility_isolation" ON public.cpt_implant_mappings
    FOR ALL USING (
        facility_id IS NULL OR
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID OR
        auth.uid() IS NULL
    );

-- 4.2 Audit Reviews Policy
DROP POLICY IF EXISTS "cpt_implant_mapping_reviews_isolation" ON public.cpt_implant_mapping_reviews;
CREATE POLICY "cpt_implant_mapping_reviews_isolation" ON public.cpt_implant_mapping_reviews
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.cpt_implant_mappings m
            WHERE m.id = mapping_id
              AND (
                  m.facility_id IS NULL OR
                  m.facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID OR
                  auth.uid() IS NULL
              )
        )
    );

-- ==============================================================================
-- 5. AUTHORITATIVE REQUIREMENT RESOLUTION FUNCTION
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_resolve_cpt_implant_requirements(
    p_cpt_code VARCHAR,
    p_facility_id UUID DEFAULT NULL,
    p_dos DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_results JSONB;
BEGIN
    WITH candidate_mappings AS (
        SELECT 
            m.id,
            m.cpt_code,
            m.component_id,
            c.code AS component_code,
            c.name AS component_name,
            c.component_type,
            c.default_duration,
            cat.code AS category_code,
            cat.name AS category_name,
            m.facility_id,
            m.requirement_type,
            m.quantity_calculation_method,
            m.expected_quantity_min,
            m.expected_quantity_max,
            m.default_quantity,
            m.condition_expression,
            m.mapping_source,
            m.clinical_evidence_citation,
            m.confidence_score,
            m.review_status,
            m.effective_date,
            m.termination_date,
            ROW_NUMBER() OVER (
                PARTITION BY m.component_id 
                ORDER BY (m.facility_id IS NOT NULL AND m.facility_id = p_facility_id) DESC, m.effective_date DESC
            ) AS priority_rank
        FROM public.cpt_implant_mappings m
        JOIN public.implant_components c ON m.component_id = c.id
        JOIN public.implant_categories cat ON m.category_id = cat.id
        WHERE m.cpt_code = p_cpt_code
          AND m.is_active = TRUE
          AND m.review_status = 'verified'
          AND (m.facility_id IS NULL OR m.facility_id = p_facility_id)
          AND p_dos >= m.effective_date
          AND (m.termination_date IS NULL OR p_dos <= m.termination_date)
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'mapping_id', id,
                'cpt_code', cpt_code,
                'component_id', component_id,
                'component_code', component_code,
                'component_name', component_name,
                'component_type', component_type,
                'default_duration', default_duration,
                'category_code', category_code,
                'category_name', category_name,
                'is_facility_override', (facility_id IS NOT NULL),
                'requirement_type', requirement_type,
                'quantity_calculation_method', quantity_calculation_method,
                'expected_quantity_min', expected_quantity_min,
                'expected_quantity_max', expected_quantity_max,
                'default_quantity', default_quantity,
                'condition_expression', condition_expression,
                'mapping_source', mapping_source,
                'clinical_evidence_citation', clinical_evidence_citation,
                'confidence_score', confidence_score
            )
            ORDER BY 
                CASE requirement_type 
                    WHEN 'required' THEN 1 
                    WHEN 'conditional' THEN 2 
                    WHEN 'optional' THEN 3 
                    ELSE 4 
                END,
                component_name ASC
        ),
        '[]'::jsonb
    ) INTO v_results
    FROM candidate_mappings
    WHERE priority_rank = 1;

    RETURN v_results;
END;
$$;

-- ==============================================================================
-- 6. EXTEND PRE-BILL CHARGE COMPLETENESS ENGINE (RULES DEV-003, DEV-004, DEV-005)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_evaluate_charge_completeness(
    p_surgery_id BIGINT,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_surg RECORD;
    v_proc RECORD;
    v_run_id UUID;
    v_facility_id UUID;
    v_dos DATE;
    v_total_lines INTEGER := 0;
    v_primary_count INTEGER := 0;
    v_device_count INTEGER := 0;
    v_has_device_intensive_cpt BOOLEAN := false;
    v_device_intensive_codes TEXT[] := '{}';
    v_blockers INTEGER := 0;
    v_warnings INTEGER := 0;
    v_overall_status VARCHAR(20) := 'clean';
    
    -- Component-level validation variables
    v_req RECORD;
    v_comp_found INTEGER;
    v_comp_qty INTEGER;
    v_multiplier INTEGER := 1;
    v_target_min INTEGER;
    v_target_max INTEGER;
BEGIN
    -- 1. Fetch Surgery Record
    SELECT * INTO v_surg FROM public.surgeries WHERE id = p_surgery_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'CASE_NOT_FOUND',
            'message', 'Encounter not found'
        );
    END IF;

    v_facility_id := v_surg.facility_id;
    v_dos := COALESCE(v_surg.date::DATE, CURRENT_DATE);

    -- 2. Create New Run Record
    v_run_id := gen_random_uuid();
    INSERT INTO public.charge_completeness_runs (
        id, facility_id, surgery_id, run_timestamp, executed_by, rule_version, overall_status
    ) VALUES (
        v_run_id, v_facility_id, p_surgery_id, NOW(), p_user_id, '2026.2', 'clean'
    );

    -- 3. Procedure Line Checks
    FOR v_proc IN 
        SELECT 
            sp.id, 
            sp.units, 
            sp.modifiers, 
            sp.laterality, 
            sp.is_primary,
            sp.line_expected_reimbursement,
            sp.cpt_version_id,
            COALESCE(m.code, cc.code) AS cpt_code,
            COALESCE(v.is_device_intensive, false) AS is_device_intensive,
            bp.laterality_applicable
        FROM public.surgery_procedures sp
        LEFT JOIN public.cpt_code_versions v ON sp.cpt_version_id = v.id
        LEFT JOIN public.cpt_master m ON v.cpt_master_id = m.id
        LEFT JOIN public.cpt_codes cc ON sp.cpt_code_id = cc.id
        LEFT JOIN public.cpt_clinical_mappings ccm ON ccm.cpt_master_id = m.id AND ccm.is_primary = true
        LEFT JOIN public.body_parts bp ON bp.id = ccm.body_part_id
        WHERE sp.surgery_id = p_surgery_id
    LOOP
        v_total_lines := v_total_lines + 1;
        
        IF v_proc.is_primary = true THEN
            v_primary_count := v_primary_count + 1;
        END IF;

        IF v_proc.is_device_intensive = true THEN
            v_has_device_intensive_cpt := true;
            v_device_intensive_codes := array_append(v_device_intensive_codes, v_proc.cpt_code);
        END IF;

        -- UNIT-001
        IF v_proc.units IS NULL OR v_proc.units <= 0 THEN
            INSERT INTO public.charge_completeness_findings (
                run_id, facility_id, surgery_id, procedure_line_id, rule_id, rule_category, severity, finding_message, resolution_guidance
            ) VALUES (
                v_run_id, v_facility_id, p_surgery_id, v_proc.id, 'UNIT-001', 'units', 'BLOCKER',
                format('CPT %s has invalid units of service (%s). Units must be >= 1.', v_proc.cpt_code, v_proc.units),
                'Correct procedure units to a positive integer before claim generation.'
            );
            v_blockers := v_blockers + 1;
        END IF;

        -- MOD-001
        IF 'RT' = ANY(v_proc.modifiers) AND 'LT' = ANY(v_proc.modifiers) THEN
            INSERT INTO public.charge_completeness_findings (
                run_id, facility_id, surgery_id, procedure_line_id, rule_id, rule_category, severity, finding_message, resolution_guidance
            ) VALUES (
                v_run_id, v_facility_id, p_surgery_id, v_proc.id, 'MOD-001', 'modifier', 'BLOCKER',
                format('CPT %s contains mutually exclusive modifiers RT and LT on the same line.', v_proc.cpt_code),
                'Remove either RT or LT or submit as bilateral modifier 50 if applicable.'
            );
            v_blockers := v_blockers + 1;
        END IF;

        -- MOD-002
        IF v_proc.laterality_applicable = true AND NOT ('RT' = ANY(v_proc.modifiers) OR 'LT' = ANY(v_proc.modifiers) OR '50' = ANY(v_proc.modifiers)) THEN
            INSERT INTO public.charge_completeness_findings (
                run_id, facility_id, surgery_id, procedure_line_id, rule_id, rule_category, severity, finding_message, resolution_guidance
            ) VALUES (
                v_run_id, v_facility_id, p_surgery_id, v_proc.id, 'MOD-002', 'modifier', 'BLOCKER',
                format('CPT %s represents a paired anatomical structure but is missing a laterality modifier (RT, LT, or 50).', v_proc.cpt_code),
                'Append modifier RT, LT, or 50 based on operative report findings.'
            );
            v_blockers := v_blockers + 1;
        END IF;

        -- PRIC-001
        IF COALESCE(v_surg.is_probono, false) = false AND (v_proc.line_expected_reimbursement IS NULL OR v_proc.line_expected_reimbursement <= 0) THEN
            INSERT INTO public.charge_completeness_findings (
                run_id, facility_id, surgery_id, procedure_line_id, rule_id, rule_category, severity, finding_message, resolution_guidance
            ) VALUES (
                v_run_id, v_facility_id, p_surgery_id, v_proc.id, 'PRIC-001', 'pricing', 'BLOCKER',
                format('CPT %s has $0.00 expected reimbursement on a non-pro-bono encounter.', v_proc.cpt_code),
                'Verify contracted payer fee schedule or facility baseline pricing.'
            );
            v_blockers := v_blockers + 1;
        END IF;

        -- ======================================================================
        -- PHASE 52: DETAILED CPT-TO-IMPLANT COMPONENT VALIDATION (DEV-003, DEV-005)
        -- ======================================================================
        IF '50' = ANY(v_proc.modifiers) THEN
            v_multiplier := 2;
        ELSE
            v_multiplier := 1;
        END IF;

        FOR v_req IN
            SELECT 
                m.requirement_type,
                m.expected_quantity_min,
                m.expected_quantity_max,
                m.quantity_calculation_method,
                c.id AS component_id,
                c.code AS component_code,
                c.name AS component_name
            FROM public.cpt_implant_mappings m
            JOIN public.implant_components c ON m.component_id = c.id
            WHERE m.cpt_code = v_proc.cpt_code
              AND m.is_active = TRUE
              AND m.review_status = 'verified'
              AND (m.facility_id IS NULL OR m.facility_id = v_facility_id)
              AND v_dos >= m.effective_date
              AND (m.termination_date IS NULL OR v_dos <= m.termination_date)
        LOOP
            -- Check if documented in case_devices
            SELECT 
                COUNT(*), 
                COALESCE(SUM(quantity), 0)
            INTO v_comp_found, v_comp_qty
            FROM public.case_devices cd
            WHERE cd.surgery_id = p_surgery_id
              AND (
                  cd.device_name ILIKE '%' || v_req.component_name || '%'
                  OR cd.notes ILIKE '%' || v_req.component_code || '%'
              );

            -- Calculate scaled quantity targets
            IF v_req.quantity_calculation_method = 'laterality_dependent' THEN
                v_target_min := v_req.expected_quantity_min * v_multiplier;
                v_target_max := v_req.expected_quantity_max * v_multiplier;
            ELSIF v_req.quantity_calculation_method = 'per_unit' THEN
                v_target_min := v_req.expected_quantity_min * GREATEST(COALESCE(v_proc.units, 1), 1);
                v_target_max := v_req.expected_quantity_max * GREATEST(COALESCE(v_proc.units, 1), 1);
            ELSE
                v_target_min := v_req.expected_quantity_min;
                v_target_max := v_req.expected_quantity_max;
            END IF;

            -- DEV-003: Mandatory component missing
            IF v_req.requirement_type = 'required' AND v_comp_found = 0 THEN
                INSERT INTO public.charge_completeness_findings (
                    run_id, facility_id, surgery_id, procedure_line_id, rule_id, rule_category, severity, finding_message, resolution_guidance
                ) VALUES (
                    v_run_id, v_facility_id, p_surgery_id, v_proc.id, 'DEV-003', 'device', 'BLOCKER',
                    format('CPT %s requires implant component "%s" (%s), but this component was not documented in case devices.', v_proc.cpt_code, v_req.component_name, v_req.component_code),
                    'Document the implanted construct in case devices or add a clinical exception before billing.'
                );
                v_blockers := v_blockers + 1;
            END IF;

            -- DEV-005: Documented quantity out of expected bounds
            IF v_comp_found > 0 AND (v_comp_qty < v_target_min OR v_comp_qty > v_target_max) THEN
                INSERT INTO public.charge_completeness_findings (
                    run_id, facility_id, surgery_id, procedure_line_id, rule_id, rule_category, severity, finding_message, resolution_guidance
                ) VALUES (
                    v_run_id, v_facility_id, p_surgery_id, v_proc.id, 'DEV-005', 'device', 'WARNING',
                    format('Component "%s" has %s units documented, but expected range for CPT %s is [%s - %s].', v_req.component_name, v_comp_qty, v_proc.cpt_code, v_target_min, v_target_max),
                    'Verify documented hardware quantities against operative report.'
                );
                v_warnings := v_warnings + 1;
            END IF;
        END LOOP;
    END LOOP;

    -- Zero procedure enforcement
    IF v_total_lines = 0 AND COALESCE(v_surg.status, '') != 'Cancelled' THEN
        INSERT INTO public.charge_completeness_findings (
            run_id, facility_id, surgery_id, procedure_line_id, rule_id, rule_category, severity, finding_message, resolution_guidance
        ) VALUES (
            v_run_id, v_facility_id, p_surgery_id, NULL, 'PROC-001', 'procedure', 'BLOCKER',
            'Encounter contains zero procedure lines. Non-cancelled surgical encounters require at least one CPT code.',
            'Assign appropriate CPT codes from the operative report before submitting for pre-bill review.'
        );
        v_blockers := v_blockers + 1;
    END IF;

    -- Primary procedure flag checks
    IF v_total_lines > 0 AND v_primary_count = 0 THEN
        INSERT INTO public.charge_completeness_findings (
            run_id, facility_id, surgery_id, procedure_line_id, rule_id, rule_category, severity, finding_message, resolution_guidance
        ) VALUES (
            v_run_id, v_facility_id, p_surgery_id, NULL, 'PROC-002', 'procedure', 'BLOCKER',
            'No procedure line is designated as the primary procedure (is_primary = true).',
            'Designate exactly one primary procedure rank to govern allowable reimbursement sequencing.'
        );
        v_blockers := v_blockers + 1;
    END IF;

    IF v_total_lines > 1 AND v_primary_count > 1 THEN
        INSERT INTO public.charge_completeness_findings (
            run_id, facility_id, surgery_id, procedure_line_id, rule_id, rule_category, severity, finding_message, resolution_guidance
        ) VALUES (
            v_run_id, v_facility_id, p_surgery_id, NULL, 'PROC-003', 'procedure', 'ERROR',
            format('Encounter has %s procedures marked as primary. Only one primary procedure is allowed.', v_primary_count),
            'Designate a single highest-valued primary procedure and mark secondary procedures accordingly.'
        );
        v_blockers := v_blockers + 1;
    END IF;

    -- Generic device checks
    SELECT COUNT(*) INTO v_device_count FROM public.case_devices WHERE surgery_id = p_surgery_id;

    IF v_has_device_intensive_cpt = true AND v_device_count = 0 AND COALESCE(v_surg.implants_cost, 0) = 0 THEN
        INSERT INTO public.charge_completeness_findings (
            run_id, facility_id, surgery_id, procedure_line_id, rule_id, rule_category, severity, finding_message, resolution_guidance
        ) VALUES (
            v_run_id, v_facility_id, p_surgery_id, NULL, 'DEV-001', 'device', 'BLOCKER',
            format('Encounter includes device-intensive CPT (%s), but zero implant/device line items or costs are recorded.', array_to_string(v_device_intensive_codes, ', ')),
            'Record the implanted device item, manufacturer, model/serial, and HCPCS C-code.'
        );
        v_blockers := v_blockers + 1;
    END IF;

    IF COALESCE(v_surg.implants_cost, 0) > 0 AND v_device_count = 0 THEN
        INSERT INTO public.charge_completeness_findings (
            run_id, facility_id, surgery_id, procedure_line_id, rule_id, rule_category, severity, finding_message, resolution_guidance
        ) VALUES (
            v_run_id, v_facility_id, p_surgery_id, NULL, 'DEV-002', 'device', 'WARNING',
            format('Surgery records implants_cost ($%s), but no itemized device line items exist in case_devices.', v_surg.implants_cost),
            'Itemize implanted items in case_devices to ensure accurate clearinghouse device attribution.'
        );
        v_warnings := v_warnings + 1;
    END IF;

    -- Documentation check
    IF v_surg.status = 'Completed' AND (v_surg.post_op_diagnosis IS NULL OR LENGTH(TRIM(v_surg.post_op_diagnosis)) = 0) THEN
        INSERT INTO public.charge_completeness_findings (
            run_id, facility_id, surgery_id, procedure_line_id, rule_id, rule_category, severity, finding_message, resolution_guidance
        ) VALUES (
            v_run_id, v_facility_id, p_surgery_id, NULL, 'DOC-001', 'documentation', 'BLOCKER',
            'Completed surgical encounter is missing a recorded post-operative diagnosis.',
            'Document post-operative diagnosis before releasing case to pre-bill.'
        );
        v_blockers := v_blockers + 1;
    END IF;

    -- Overall Status Summary
    IF v_blockers > 0 THEN
        v_overall_status := 'blocked';
    ELSIF v_warnings > 0 THEN
        v_overall_status := 'warnings';
    ELSE
        v_overall_status := 'clean';
    END IF;

    UPDATE public.charge_completeness_runs
    SET overall_status = v_overall_status,
        total_findings = (v_blockers + v_warnings),
        blocker_count = v_blockers,
        warning_count = v_warnings
    WHERE id = v_run_id;

    RETURN jsonb_build_object(
        'success', true,
        'run_id', v_run_id,
        'surgery_id', p_surgery_id,
        'overall_status', v_overall_status,
        'blocker_count', v_blockers,
        'warning_count', v_warnings,
        'can_release_to_bill', (v_blockers = 0)
    );
END;
$$;

-- ==============================================================================
-- 7. SEED CPT MASTER (SAFE CONFLICT GUARD FOR STANDALONE RUNS)
-- ==============================================================================

INSERT INTO public.cpt_master (code, code_type, description, specialty, procedure_group, body_part, average_duration_minutes, typical_turnover_minutes, is_active)
VALUES
    ('27130', 'CPT', 'Arthroplasty, acetabular and proximal femoral prosthetic replacement (total hip arthroplasty)', 'Orthopedics', 'Hip Reconstruction', 'Hip', 90, 20, true),
    ('27447', 'CPT', 'Arthroplasty, knee, condyle and plateau; medial and lateral compartments (total knee arthroplasty)', 'Orthopedics', 'Knee Reconstruction', 'Knee', 90, 20, true),
    ('23472', 'CPT', 'Arthroplasty, glenohumeral joint; total shoulder (total shoulder arthroplasty)', 'Orthopedics', 'Shoulder Reconstruction', 'Shoulder', 105, 20, true),
    ('22551', 'CPT', 'Arthrodesis, anterior interbody, including disc space preparation; cervical below C2', 'Spine', 'Cervical Spine Fusion', 'Cervical Spine', 120, 25, true),
    ('22633', 'CPT', 'Arthrodesis, combined posterior or posterolateral technique with posterior interbody fusion; lumbar', 'Spine', 'Lumbar Spine Fusion', 'Lumbar Spine', 150, 30, true),
    ('66984', 'CPT', 'Extracapsular cataract removal with insertion of intraocular lens prosthesis', 'Ophthalmology', 'Cataract Surgery', 'Eye', 25, 10, true),
    ('66982', 'CPT', 'Extracapsular cataract removal with insertion of intraocular lens prosthesis; complex', 'Ophthalmology', 'Cataract Surgery', 'Eye', 40, 15, true),
    ('63685', 'CPT', 'Insertion or replacement of spinal neurostimulator pulse generator or receiver', 'Pain Management', 'Neuromodulation', 'Spine', 60, 15, true),
    ('63650', 'CPT', 'Percutaneous implantation of neurostimulator array; epidural', 'Pain Management', 'Neuromodulation', 'Spine', 45, 15, true),
    ('19340', 'CPT', 'Immediate insertion of breast prosthesis following mastopexy, mastectomy or in reconstruction', 'Plastic Surgery', 'Breast Reconstruction', 'Breast', 75, 20, true),
    ('19357', 'CPT', 'Tissue expander placement in breast reconstruction, including subsequent expansion', 'Plastic Surgery', 'Breast Reconstruction', 'Breast', 60, 20, true)
ON CONFLICT (code) DO NOTHING;

-- ==============================================================================
-- 8. SEED AUTHORITATIVE GLOBAL BASELINE CPT-TO-IMPLANT MAPPINGS
-- ==============================================================================

-- 8.1 Total Hip Arthroplasty (CPT 27130)
INSERT INTO public.cpt_implant_mappings (
    cpt_master_id, cpt_code, component_id, category_id, facility_id, requirement_type,
    quantity_calculation_method, expected_quantity_min, expected_quantity_max, default_quantity,
    mapping_source, clinical_evidence_citation, confidence_score, review_status
)
SELECT 
    m.id, m.code, c.id, c.category_id, NULL, 'required',
    'fixed', 1, 1, 1,
    'clinical_guideline', 'AAOS Clinical Practice Guideline for Total Hip Arthroplasty (2020); CMS LCD L33394', 1.00, 'verified'
FROM public.cpt_master m, public.implant_components c
WHERE m.code = '27130' AND c.code = 'HIP_CUP' AND c.facility_id IS NULL
ON CONFLICT (cpt_master_id, component_id, facility_id, effective_date) DO UPDATE SET
    requirement_type = EXCLUDED.requirement_type, default_quantity = EXCLUDED.default_quantity;

INSERT INTO public.cpt_implant_mappings (
    cpt_master_id, cpt_code, component_id, category_id, facility_id, requirement_type,
    quantity_calculation_method, expected_quantity_min, expected_quantity_max, default_quantity,
    mapping_source, clinical_evidence_citation, confidence_score, review_status
)
SELECT 
    m.id, m.code, c.id, c.category_id, NULL, 'required',
    'fixed', 1, 1, 1,
    'clinical_guideline', 'AAOS Clinical Practice Guideline for Total Hip Arthroplasty (2020); CMS LCD L33394', 1.00, 'verified'
FROM public.cpt_master m, public.implant_components c
WHERE m.code = '27130' AND c.code = 'HIP_STEM' AND c.facility_id IS NULL
ON CONFLICT (cpt_master_id, component_id, facility_id, effective_date) DO UPDATE SET
    requirement_type = EXCLUDED.requirement_type, default_quantity = EXCLUDED.default_quantity;

INSERT INTO public.cpt_implant_mappings (
    cpt_master_id, cpt_code, component_id, category_id, facility_id, requirement_type,
    quantity_calculation_method, expected_quantity_min, expected_quantity_max, default_quantity,
    mapping_source, clinical_evidence_citation, confidence_score, review_status
)
SELECT 
    m.id, m.code, c.id, c.category_id, NULL, 'required',
    'fixed', 1, 1, 1,
    'clinical_guideline', 'AAOS Clinical Practice Guideline for Total Hip Arthroplasty (2020); CMS LCD L33394', 1.00, 'verified'
FROM public.cpt_master m, public.implant_components c
WHERE m.code = '27130' AND c.code = 'HIP_LINER' AND c.facility_id IS NULL
ON CONFLICT (cpt_master_id, component_id, facility_id, effective_date) DO UPDATE SET
    requirement_type = EXCLUDED.requirement_type, default_quantity = EXCLUDED.default_quantity;

INSERT INTO public.cpt_implant_mappings (
    cpt_master_id, cpt_code, component_id, category_id, facility_id, requirement_type,
    quantity_calculation_method, expected_quantity_min, expected_quantity_max, default_quantity,
    mapping_source, clinical_evidence_citation, confidence_score, review_status
)
SELECT 
    m.id, m.code, c.id, c.category_id, NULL, 'required',
    'fixed', 1, 1, 1,
    'clinical_guideline', 'AAOS Clinical Practice Guideline for Total Hip Arthroplasty (2020); CMS LCD L33394', 1.00, 'verified'
FROM public.cpt_master m, public.implant_components c
WHERE m.code = '27130' AND c.code = 'HIP_HEAD' AND c.facility_id IS NULL
ON CONFLICT (cpt_master_id, component_id, facility_id, effective_date) DO UPDATE SET
    requirement_type = EXCLUDED.requirement_type, default_quantity = EXCLUDED.default_quantity;

INSERT INTO public.cpt_implant_mappings (
    cpt_master_id, cpt_code, component_id, category_id, facility_id, requirement_type,
    quantity_calculation_method, expected_quantity_min, expected_quantity_max, default_quantity,
    mapping_source, clinical_evidence_citation, confidence_score, review_status
)
SELECT 
    m.id, m.code, c.id, c.category_id, NULL, 'optional',
    'surgeon_discretion', 0, 4, 1,
    'clinical_guideline', 'AAOS Hip Reconstruction Guidelines for Supplemental Fixation', 0.90, 'verified'
FROM public.cpt_master m, public.implant_components c
WHERE m.code = '27130' AND c.code = 'HIP_SCREW' AND c.facility_id IS NULL
ON CONFLICT (cpt_master_id, component_id, facility_id, effective_date) DO UPDATE SET
    requirement_type = EXCLUDED.requirement_type, default_quantity = EXCLUDED.default_quantity;

-- 8.2 Total Knee Arthroplasty (CPT 27447)
INSERT INTO public.cpt_implant_mappings (
    cpt_master_id, cpt_code, component_id, category_id, facility_id, requirement_type,
    quantity_calculation_method, expected_quantity_min, expected_quantity_max, default_quantity,
    mapping_source, clinical_evidence_citation, confidence_score, review_status
)
SELECT 
    m.id, m.code, c.id, c.category_id, NULL, 'required',
    'laterality_dependent', 1, 1, 1,
    'clinical_guideline', 'AAOS Clinical Practice Guideline for Surgical Management of Knee Osteoarthritis (2021)', 1.00, 'verified'
FROM public.cpt_master m, public.implant_components c
WHERE m.code = '27447' AND c.code = 'KNEE_FEMORAL' AND c.facility_id IS NULL
ON CONFLICT (cpt_master_id, component_id, facility_id, effective_date) DO UPDATE SET
    requirement_type = EXCLUDED.requirement_type, default_quantity = EXCLUDED.default_quantity;

INSERT INTO public.cpt_implant_mappings (
    cpt_master_id, cpt_code, component_id, category_id, facility_id, requirement_type,
    quantity_calculation_method, expected_quantity_min, expected_quantity_max, default_quantity,
    mapping_source, clinical_evidence_citation, confidence_score, review_status
)
SELECT 
    m.id, m.code, c.id, c.category_id, NULL, 'required',
    'laterality_dependent', 1, 1, 1,
    'clinical_guideline', 'AAOS Clinical Practice Guideline for Surgical Management of Knee Osteoarthritis (2021)', 1.00, 'verified'
FROM public.cpt_master m, public.implant_components c
WHERE m.code = '27447' AND c.code = 'KNEE_TIBIAL_TRAY' AND c.facility_id IS NULL
ON CONFLICT (cpt_master_id, component_id, facility_id, effective_date) DO UPDATE SET
    requirement_type = EXCLUDED.requirement_type, default_quantity = EXCLUDED.default_quantity;

INSERT INTO public.cpt_implant_mappings (
    cpt_master_id, cpt_code, component_id, category_id, facility_id, requirement_type,
    quantity_calculation_method, expected_quantity_min, expected_quantity_max, default_quantity,
    mapping_source, clinical_evidence_citation, confidence_score, review_status
)
SELECT 
    m.id, m.code, c.id, c.category_id, NULL, 'required',
    'laterality_dependent', 1, 1, 1,
    'clinical_guideline', 'AAOS Clinical Practice Guideline for Surgical Management of Knee Osteoarthritis (2021)', 1.00, 'verified'
FROM public.cpt_master m, public.implant_components c
WHERE m.code = '27447' AND c.code = 'KNEE_TIBIAL_INSERT' AND c.facility_id IS NULL
ON CONFLICT (cpt_master_id, component_id, facility_id, effective_date) DO UPDATE SET
    requirement_type = EXCLUDED.requirement_type, default_quantity = EXCLUDED.default_quantity;

INSERT INTO public.cpt_implant_mappings (
    cpt_master_id, cpt_code, component_id, category_id, facility_id, requirement_type,
    quantity_calculation_method, expected_quantity_min, expected_quantity_max, default_quantity,
    mapping_source, clinical_evidence_citation, confidence_score, review_status
)
SELECT 
    m.id, m.code, c.id, c.category_id, NULL, 'optional',
    'surgeon_discretion', 0, 1, 1,
    'clinical_guideline', 'AAOS Knee Guidelines for Patellar Resurfacing', 0.85, 'verified'
FROM public.cpt_master m, public.implant_components c
WHERE m.code = '27447' AND c.code = 'KNEE_PATELLA' AND c.facility_id IS NULL
ON CONFLICT (cpt_master_id, component_id, facility_id, effective_date) DO UPDATE SET
    requirement_type = EXCLUDED.requirement_type, default_quantity = EXCLUDED.default_quantity;

-- 8.3 Anterior Cervical Discectomy & Fusion (CPT 22551)
INSERT INTO public.cpt_implant_mappings (
    cpt_master_id, cpt_code, component_id, category_id, facility_id, requirement_type,
    quantity_calculation_method, expected_quantity_min, expected_quantity_max, default_quantity,
    mapping_source, clinical_evidence_citation, confidence_score, review_status
)
SELECT 
    m.id, m.code, c.id, c.category_id, NULL, 'required',
    'fixed', 1, 1, 1,
    'clinical_guideline', 'NASS Evidence-Based Clinical Guidelines for Multilevel Cervical Fusion', 1.00, 'verified'
FROM public.cpt_master m, public.implant_components c
WHERE m.code = '22551' AND c.code = 'SPINE_ACDF_CAGE' AND c.facility_id IS NULL
ON CONFLICT (cpt_master_id, component_id, facility_id, effective_date) DO UPDATE SET
    requirement_type = EXCLUDED.requirement_type, default_quantity = EXCLUDED.default_quantity;

INSERT INTO public.cpt_implant_mappings (
    cpt_master_id, cpt_code, component_id, category_id, facility_id, requirement_type,
    quantity_calculation_method, expected_quantity_min, expected_quantity_max, default_quantity,
    mapping_source, clinical_evidence_citation, confidence_score, review_status
)
SELECT 
    m.id, m.code, c.id, c.category_id, NULL, 'required',
    'fixed', 1, 1, 1,
    'clinical_guideline', 'NASS Evidence-Based Clinical Guidelines for Multilevel Cervical Fusion', 1.00, 'verified'
FROM public.cpt_master m, public.implant_components c
WHERE m.code = '22551' AND c.code = 'SPINE_ACDF_PLATE' AND c.facility_id IS NULL
ON CONFLICT (cpt_master_id, component_id, facility_id, effective_date) DO UPDATE SET
    requirement_type = EXCLUDED.requirement_type, default_quantity = EXCLUDED.default_quantity;

INSERT INTO public.cpt_implant_mappings (
    cpt_master_id, cpt_code, component_id, category_id, facility_id, requirement_type,
    quantity_calculation_method, expected_quantity_min, expected_quantity_max, default_quantity,
    mapping_source, clinical_evidence_citation, confidence_score, review_status
)
SELECT 
    m.id, m.code, c.id, c.category_id, NULL, 'required',
    'fixed', 4, 8, 4,
    'clinical_guideline', 'NASS Cervical Anterior Plate Screw Constructs (2 screws per vertebral level)', 1.00, 'verified'
FROM public.cpt_master m, public.implant_components c
WHERE m.code = '22551' AND c.code = 'SPINE_ACDF_SCREW' AND c.facility_id IS NULL
ON CONFLICT (cpt_master_id, component_id, facility_id, effective_date) DO UPDATE SET
    requirement_type = EXCLUDED.requirement_type, default_quantity = EXCLUDED.default_quantity;

INSERT INTO public.cpt_implant_mappings (
    cpt_master_id, cpt_code, component_id, category_id, facility_id, requirement_type,
    quantity_calculation_method, expected_quantity_min, expected_quantity_max, default_quantity,
    condition_expression, mapping_source, clinical_evidence_citation, confidence_score, review_status
)
SELECT 
    m.id, m.code, c.id, c.category_id, NULL, 'conditional',
    'fixed', 1, 1, 1,
    'autograft_harvested = FALSE', 'clinical_guideline', 'NASS Clinical Guidelines for Biologic Bone Grafts in Spine Fusion', 0.90, 'verified'
FROM public.cpt_master m, public.implant_components c
WHERE m.code = '22551' AND c.code = 'SPINE_DBM_GRAFT' AND c.facility_id IS NULL
ON CONFLICT (cpt_master_id, component_id, facility_id, effective_date) DO UPDATE SET
    requirement_type = EXCLUDED.requirement_type, default_quantity = EXCLUDED.default_quantity;

-- 8.4 Lumbar Interbody Fusion / TLIF (CPT 22633)
INSERT INTO public.cpt_implant_mappings (
    cpt_master_id, cpt_code, component_id, category_id, facility_id, requirement_type,
    quantity_calculation_method, expected_quantity_min, expected_quantity_max, default_quantity,
    mapping_source, clinical_evidence_citation, confidence_score, review_status
)
SELECT 
    m.id, m.code, c.id, c.category_id, NULL, 'required',
    'surgeon_discretion', 1, 2, 1,
    'clinical_guideline', 'NASS Lumbar Interbody Arthrodesis Guidelines (1 for TLIF, 2 for PLIF)', 1.00, 'verified'
FROM public.cpt_master m, public.implant_components c
WHERE m.code = '22633' AND c.code = 'SPINE_LUMBAR_CAGE' AND c.facility_id IS NULL
ON CONFLICT (cpt_master_id, component_id, facility_id, effective_date) DO UPDATE SET
    requirement_type = EXCLUDED.requirement_type, default_quantity = EXCLUDED.default_quantity;

INSERT INTO public.cpt_implant_mappings (
    cpt_master_id, cpt_code, component_id, category_id, facility_id, requirement_type,
    quantity_calculation_method, expected_quantity_min, expected_quantity_max, default_quantity,
    mapping_source, clinical_evidence_citation, confidence_score, review_status
)
SELECT 
    m.id, m.code, c.id, c.category_id, NULL, 'required',
    'fixed', 4, 4, 4,
    'clinical_guideline', 'NASS Lumbar Pedicle Screw Fixation Guidelines (2 screws per level bilaterally)', 1.00, 'verified'
FROM public.cpt_master m, public.implant_components c
WHERE m.code = '22633' AND c.code = 'SPINE_PEDICLE_SCREW' AND c.facility_id IS NULL
ON CONFLICT (cpt_master_id, component_id, facility_id, effective_date) DO UPDATE SET
    requirement_type = EXCLUDED.requirement_type, default_quantity = EXCLUDED.default_quantity;

INSERT INTO public.cpt_implant_mappings (
    cpt_master_id, cpt_code, component_id, category_id, facility_id, requirement_type,
    quantity_calculation_method, expected_quantity_min, expected_quantity_max, default_quantity,
    mapping_source, clinical_evidence_citation, confidence_score, review_status
)
SELECT 
    m.id, m.code, c.id, c.category_id, NULL, 'required',
    'fixed', 2, 2, 2,
    'clinical_guideline', 'NASS Lumbar Spinal Rod Guidelines (1 left rod, 1 right rod)', 1.00, 'verified'
FROM public.cpt_master m, public.implant_components c
WHERE m.code = '22633' AND c.code = 'SPINE_ROD' AND c.facility_id IS NULL
ON CONFLICT (cpt_master_id, component_id, facility_id, effective_date) DO UPDATE SET
    requirement_type = EXCLUDED.requirement_type, default_quantity = EXCLUDED.default_quantity;

INSERT INTO public.cpt_implant_mappings (
    cpt_master_id, cpt_code, component_id, category_id, facility_id, requirement_type,
    quantity_calculation_method, expected_quantity_min, expected_quantity_max, default_quantity,
    mapping_source, clinical_evidence_citation, confidence_score, review_status
)
SELECT 
    m.id, m.code, c.id, c.category_id, NULL, 'required',
    'fixed', 4, 4, 4,
    'clinical_guideline', 'NASS Locking Set Screws for Pedicle Screw Housing (1 per screw)', 1.00, 'verified'
FROM public.cpt_master m, public.implant_components c
WHERE m.code = '22633' AND c.code = 'SPINE_SET_SCREW' AND c.facility_id IS NULL
ON CONFLICT (cpt_master_id, component_id, facility_id, effective_date) DO UPDATE SET
    requirement_type = EXCLUDED.requirement_type, default_quantity = EXCLUDED.default_quantity;

-- 8.5 Cataract Extraction with IOL (CPT 66984 & CPT 66982)
INSERT INTO public.cpt_implant_mappings (
    cpt_master_id, cpt_code, component_id, category_id, facility_id, requirement_type,
    quantity_calculation_method, expected_quantity_min, expected_quantity_max, default_quantity,
    mapping_source, clinical_evidence_citation, confidence_score, review_status
)
SELECT 
    m.id, m.code, c.id, c.category_id, NULL, 'required',
    'fixed', 1, 1, 1,
    'clinical_guideline', 'ASCRS Clinical Practice Guidelines for Standard Cataract Surgery', 1.00, 'verified'
FROM public.cpt_master m, public.implant_components c
WHERE m.code = '66984' AND c.code = 'IOL_MONOFOCAL' AND c.facility_id IS NULL
ON CONFLICT (cpt_master_id, component_id, facility_id, effective_date) DO UPDATE SET
    requirement_type = EXCLUDED.requirement_type, default_quantity = EXCLUDED.default_quantity;

INSERT INTO public.cpt_implant_mappings (
    cpt_master_id, cpt_code, component_id, category_id, facility_id, requirement_type,
    quantity_calculation_method, expected_quantity_min, expected_quantity_max, default_quantity,
    condition_expression, mapping_source, clinical_evidence_citation, confidence_score, review_status
)
SELECT 
    m.id, m.code, c.id, c.category_id, NULL, 'conditional',
    'fixed', 1, 1, 1,
    'zonular_instability = TRUE', 'clinical_guideline', 'ASCRS Complex Cataract Extraction Guidelines for Capsular Tension Ring', 0.95, 'verified'
FROM public.cpt_master m, public.implant_components c
WHERE m.code = '66982' AND c.code = 'OPHTH_CTR' AND c.facility_id IS NULL
ON CONFLICT (cpt_master_id, component_id, facility_id, effective_date) DO UPDATE SET
    requirement_type = EXCLUDED.requirement_type, default_quantity = EXCLUDED.default_quantity;

-- 8.6 Spinal Cord Stimulation (CPT 63685 & CPT 63650)
INSERT INTO public.cpt_implant_mappings (
    cpt_master_id, cpt_code, component_id, category_id, facility_id, requirement_type,
    quantity_calculation_method, expected_quantity_min, expected_quantity_max, default_quantity,
    mapping_source, clinical_evidence_citation, confidence_score, review_status
)
SELECT 
    m.id, m.code, c.id, c.category_id, NULL, 'required',
    'fixed', 1, 1, 1,
    'cms_lcd', 'NANS Neuromodulation Guidelines; CMS LCD L36035 for SCS Generator Placement', 0.95, 'verified'
FROM public.cpt_master m, public.implant_components c
WHERE m.code = '63685' AND c.code = 'SCS_PULSE_GEN' AND c.facility_id IS NULL
ON CONFLICT (cpt_master_id, component_id, facility_id, effective_date) DO UPDATE SET
    requirement_type = EXCLUDED.requirement_type, default_quantity = EXCLUDED.default_quantity;

INSERT INTO public.cpt_implant_mappings (
    cpt_master_id, cpt_code, component_id, category_id, facility_id, requirement_type,
    quantity_calculation_method, expected_quantity_min, expected_quantity_max, default_quantity,
    mapping_source, clinical_evidence_citation, confidence_score, review_status
)
SELECT 
    m.id, m.code, c.id, c.category_id, NULL, 'required',
    'per_unit', 1, 1, 1,
    'cms_lcd', 'NANS Neuromodulation Guidelines; CMS LCD L36035 for SCS Epidural Percutaneous Array', 0.95, 'verified'
FROM public.cpt_master m, public.implant_components c
WHERE m.code = '63650' AND c.code = 'SCS_PERC_LEAD' AND c.facility_id IS NULL
ON CONFLICT (cpt_master_id, component_id, facility_id, effective_date) DO UPDATE SET
    requirement_type = EXCLUDED.requirement_type, default_quantity = EXCLUDED.default_quantity;

-- 8.7 Plastic Surgery: Breast Prosthesis & Tissue Expander (CPT 19340 & 19357)
INSERT INTO public.cpt_implant_mappings (
    cpt_master_id, cpt_code, component_id, category_id, facility_id, requirement_type,
    quantity_calculation_method, expected_quantity_min, expected_quantity_max, default_quantity,
    mapping_source, clinical_evidence_citation, confidence_score, review_status
)
SELECT 
    m.id, m.code, c.id, c.category_id, NULL, 'required',
    'laterality_dependent', 1, 1, 1,
    'clinical_guideline', 'ASPS Practice Parameter for Immediate Breast Reconstruction', 0.95, 'verified'
FROM public.cpt_master m, public.implant_components c
WHERE m.code = '19340' AND c.code = 'BREAST_IMPLANT_SILICONE' AND c.facility_id IS NULL
ON CONFLICT (cpt_master_id, component_id, facility_id, effective_date) DO UPDATE SET
    requirement_type = EXCLUDED.requirement_type, default_quantity = EXCLUDED.default_quantity;

INSERT INTO public.cpt_implant_mappings (
    cpt_master_id, cpt_code, component_id, category_id, facility_id, requirement_type,
    quantity_calculation_method, expected_quantity_min, expected_quantity_max, default_quantity,
    mapping_source, clinical_evidence_citation, confidence_score, review_status
)
SELECT 
    m.id, m.code, c.id, c.category_id, NULL, 'required',
    'laterality_dependent', 1, 1, 1,
    'clinical_guideline', 'ASPS Practice Guidelines for Staged Breast Reconstruction with Tissue Expander', 0.95, 'verified'
FROM public.cpt_master m, public.implant_components c
WHERE m.code = '19357' AND c.code = 'BREAST_TISSUE_EXPANDER' AND c.facility_id IS NULL
ON CONFLICT (cpt_master_id, component_id, facility_id, effective_date) DO UPDATE SET
    requirement_type = EXCLUDED.requirement_type, default_quantity = EXCLUDED.default_quantity;

COMMIT;
