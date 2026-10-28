-- ==============================================================================
-- MIGRATION: 034_surgeon_preference_cards.sql
-- DESCRIPTION: Phase 58 Surgeon Preference Cards: Procedural Bills of Materials,
--              OPEN vs HOLD Staging Governance, Pre-Op Case Readiness Snapshots,
--              Clinical Substitutions, and Post-Op Consumption Reconciliation.
-- PLATFORM: Supabase PostgreSQL 15+
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. TABLE: public.surgeon_preference_cards
-- Master header linking an attending surgeon to procedural preferences at a facility
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.surgeon_preference_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE, -- NULL = Enterprise Network Template
    surgeon_id BIGINT NOT NULL REFERENCES public.surgeons(id) ON DELETE RESTRICT,
    
    -- Identification & Procedural Keying
    card_code VARCHAR(50) NOT NULL,
    card_name VARCHAR(150) NOT NULL,
    specialty VARCHAR(50) NOT NULL,
    primary_cpt VARCHAR(10) NOT NULL,
    description TEXT,
    
    -- Operational Parameters
    estimated_duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (estimated_duration_minutes > 0),
    turnover_time_minutes INTEGER NOT NULL DEFAULT 25 CHECK (turnover_time_minutes >= 0),
    laterality_applicable BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Status & Governance
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_house_card BOOLEAN NOT NULL DEFAULT FALSE, -- Default facility card if surgeon has no custom card
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_card_code_format CHECK (card_code ~ '^[A-Z0-9_\-]+$'),
    CONSTRAINT chk_card_name_not_empty CHECK (TRIM(card_name) != '')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pref_card_code 
    ON public.surgeon_preference_cards (facility_id, (UPPER(TRIM(card_code)))) 
    NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_spc_surgeon ON public.surgeon_preference_cards(surgeon_id);
CREATE INDEX IF NOT EXISTS idx_spc_cpt ON public.surgeon_preference_cards(primary_cpt);
CREATE INDEX IF NOT EXISTS idx_spc_facility ON public.surgeon_preference_cards(facility_id);
CREATE INDEX IF NOT EXISTS idx_spc_active ON public.surgeon_preference_cards(is_active) WHERE is_active = TRUE;

-- ==============================================================================
-- 2. TABLE: public.surgeon_preference_card_revisions
-- Versioned immutable snapshots enabling historical reconstruction and audit
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.surgeon_preference_card_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID NOT NULL REFERENCES public.surgeon_preference_cards(id) ON DELETE CASCADE,
    facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE,
    
    -- Versioning Governance
    revision_number INTEGER NOT NULL DEFAULT 1 CHECK (revision_number >= 1),
    status VARCHAR(30) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'pending_approval', 'approved', 'active', 'superseded', 'retired')),
    
    -- Temporal Boundaries
    effective_from DATE NOT NULL,
    effective_to DATE,
    change_summary TEXT,
    
    -- Approval Provenance (Two-Person Separation of Duties)
    submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    submitted_at TIMESTAMPTZ,
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_card_revision UNIQUE (card_id, revision_number),
    CONSTRAINT chk_revision_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT chk_revision_approval CHECK (
        (status IN ('approved', 'active') AND approved_at IS NOT NULL) OR
        (status NOT IN ('approved', 'active'))
    )
);

CREATE INDEX IF NOT EXISTS idx_spcr_card_status ON public.surgeon_preference_card_revisions(card_id, status);
CREATE INDEX IF NOT EXISTS idx_spcr_dates ON public.surgeon_preference_card_revisions(effective_from, effective_to);

-- ==============================================================================
-- 3. TABLE: public.preference_card_procedures
-- Co-billed and secondary CPT codes covered under the card revision
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.preference_card_procedures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    revision_id UUID NOT NULL REFERENCES public.surgeon_preference_card_revisions(id) ON DELETE CASCADE,
    cpt_code VARCHAR(10) NOT NULL,
    procedure_name VARCHAR(150),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    clinical_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_revision_cpt UNIQUE (revision_id, cpt_code)
);

CREATE INDEX IF NOT EXISTS idx_pcp_cpt ON public.preference_card_procedures(cpt_code);

-- ==============================================================================
-- 4. TABLE: public.preference_card_items
-- Itemized Bill of Materials (BOM) with OPEN vs HOLD staging protocol
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.preference_card_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    revision_id UUID NOT NULL REFERENCES public.surgeon_preference_card_revisions(id) ON DELETE CASCADE,
    
    -- Classification
    item_category VARCHAR(30) NOT NULL
        CHECK (item_category IN (
            'IMPLANT',
            'STERILE_DISPOSABLE',
            'INSTRUMENT_TRAY',
            'CAPITAL_EQUIPMENT',
            'SUTURE',
            'MEDICATION_BIOLOGIC'
        )),
    
    -- Catalog Links
    component_id UUID REFERENCES public.implant_components(id) ON DELETE RESTRICT,
    sku_id UUID REFERENCES public.implant_product_skus(id) ON DELETE RESTRICT,
    custom_item_name VARCHAR(150) NOT NULL,
    manufacturer VARCHAR(100),
    catalog_number VARCHAR(100),
    
    -- Staging & Quantities
    staging_behavior VARCHAR(20) NOT NULL DEFAULT 'OPEN'
        CHECK (staging_behavior IN ('OPEN', 'HOLD')),
    planned_quantity INTEGER NOT NULL DEFAULT 1 CHECK (planned_quantity >= 1),
    unit_of_measure VARCHAR(20) NOT NULL DEFAULT 'EA'
        CHECK (unit_of_measure IN ('EA', 'BOX', 'PACK', 'KIT', 'SET', 'VIAL', 'TRAY', 'BOTTLE')),
    
    -- Operational Logic
    is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
    laterality_modifier VARCHAR(20) DEFAULT 'STANDARD'
        CHECK (laterality_modifier IN ('STANDARD', 'LEFT_ONLY', 'RIGHT_ONLY', 'BILATERAL_DOUBLE')),
    open_trigger_stage VARCHAR(50) DEFAULT 'PRE_INCISION',
    prep_instructions TEXT,
    sequence_order INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pci_revision ON public.preference_card_items(revision_id);
CREATE INDEX IF NOT EXISTS idx_pci_category ON public.preference_card_items(item_category);
CREATE INDEX IF NOT EXISTS idx_pci_sku ON public.preference_card_items(sku_id);
CREATE INDEX IF NOT EXISTS idx_pci_component ON public.preference_card_items(component_id);

-- ==============================================================================
-- 5. TABLE: public.preference_card_substitutions
-- Pre-authorized clinical substitutions for inventory resilience
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.preference_card_substitutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    preference_card_item_id UUID NOT NULL REFERENCES public.preference_card_items(id) ON DELETE CASCADE,
    
    -- Substitute Reference
    substitute_sku_id UUID REFERENCES public.implant_product_skus(id) ON DELETE RESTRICT,
    substitute_component_id UUID REFERENCES public.implant_components(id) ON DELETE RESTRICT,
    substitute_item_name VARCHAR(150) NOT NULL,
    substitute_catalog_number VARCHAR(100),
    substitute_vendor_id UUID REFERENCES public.implant_vendors(id) ON DELETE RESTRICT,
    
    -- Substitution Governance
    substitution_tier VARCHAR(30) NOT NULL DEFAULT 'TIER_1_OEM_EQUIVALENT'
        CHECK (substitution_tier IN (
            'TIER_1_OEM_EQUIVALENT',
            'TIER_2_CONTRACT_FORMULARY',
            'TIER_3_EMERGENCY_SUBSTITUTE'
        )),
    is_auto_substitute_allowed BOOLEAN NOT NULL DEFAULT TRUE,
    clinical_justification TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pcs_item ON public.preference_card_substitutions(preference_card_item_id);

-- ==============================================================================
-- 6. TABLE: public.case_preference_snapshots
-- Immutable pre-op case snapshot capturing exact card state when case was staged
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.case_preference_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE CASCADE,
    revision_id UUID NOT NULL REFERENCES public.surgeon_preference_card_revisions(id) ON DELETE RESTRICT,
    
    -- Snapshot Metadata
    case_date DATE NOT NULL,
    surgeon_id BIGINT NOT NULL REFERENCES public.surgeons(id) ON DELETE RESTRICT,
    primary_cpt VARCHAR(10) NOT NULL,
    case_laterality VARCHAR(20) DEFAULT 'NONE',
    
    -- Pre-Op Readiness Gate
    readiness_status VARCHAR(30) NOT NULL DEFAULT 'PENDING_PREP'
        CHECK (readiness_status IN (
            'PENDING_PREP',
            'ITEMS_PULLED',
            'CASE_READY',
            'SUPPLY_BREACH',
            'VERIFIED_BY_SCRUB'
        )),
    verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    frozen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    snapshot_payload JSONB NOT NULL,

    CONSTRAINT uq_case_preference_snapshot UNIQUE (surgery_id)
);

CREATE INDEX IF NOT EXISTS idx_cps_surgery ON public.case_preference_snapshots(surgery_id);
CREATE INDEX IF NOT EXISTS idx_cps_facility_date ON public.case_preference_snapshots(facility_id, case_date);
CREATE INDEX IF NOT EXISTS idx_cps_readiness ON public.case_preference_snapshots(facility_id, readiness_status);

-- ==============================================================================
-- 7. TABLE: public.case_preference_reconciliations
-- Post-operative itemized variance reconciliation comparing planned to actual
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.case_preference_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    snapshot_id UUID NOT NULL REFERENCES public.case_preference_snapshots(id) ON DELETE CASCADE,
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE CASCADE,
    
    -- Item Linking
    preference_card_item_id UUID REFERENCES public.preference_card_items(id) ON DELETE SET NULL,
    case_device_id UUID REFERENCES public.case_devices(id) ON DELETE SET NULL,
    item_description VARCHAR(150) NOT NULL,
    item_category VARCHAR(30) NOT NULL,
    
    -- Variance Quantities
    planned_staging VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    planned_quantity INTEGER NOT NULL DEFAULT 0,
    actual_quantity_opened INTEGER NOT NULL DEFAULT 0,
    actual_quantity_implanted INTEGER NOT NULL DEFAULT 0,
    actual_quantity_wasted INTEGER NOT NULL DEFAULT 0,
    actual_quantity_returned INTEGER NOT NULL DEFAULT 0,
    
    -- Clinical Disposition
    disposition_code VARCHAR(40) NOT NULL
        CHECK (disposition_code IN (
            'EXACT_MATCH',
            'HOLD_RETURNED_CLEAN',
            'OPENED_CONTAMINATED_WASTE',
            'SUBSTITUTED_EQUIVALENT',
            'UNPLANNED_ADDITION',
            'MISSING_OMITTED'
        )),
    variance_reason TEXT,
    waste_estimated_cost NUMERIC(10, 2) DEFAULT 0.00,
    reconciled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reconciled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cpr_snapshot ON public.case_preference_reconciliations(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_cpr_surgery ON public.case_preference_reconciliations(surgery_id);
CREATE INDEX IF NOT EXISTS idx_cpr_disposition ON public.case_preference_reconciliations(facility_id, disposition_code);

-- ==============================================================================
-- 8. EXTEND EXISTING TABLES WITH FOREIGN KEYS
-- ==============================================================================

-- Alter surgeries to link active preference card revision
ALTER TABLE public.surgeries
    ADD COLUMN IF NOT EXISTS preference_card_id UUID REFERENCES public.surgeon_preference_cards(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS preference_card_revision_id UUID REFERENCES public.surgeon_preference_card_revisions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS preference_readiness_status VARCHAR(30) DEFAULT 'PENDING_PREP';

-- Alter case_devices to link back to planned preference card items
ALTER TABLE public.case_devices
    ADD COLUMN IF NOT EXISTS preference_card_item_id UUID REFERENCES public.preference_card_items(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS preference_snapshot_id UUID REFERENCES public.case_preference_snapshots(id) ON DELETE SET NULL;

-- ==============================================================================
-- 9. AUTHORITATIVE STORED PROCEDURES
-- ==============================================================================

-- Procedure 9.1: Deterministic Case Preference Card Resolution
CREATE OR REPLACE FUNCTION public.fn_resolve_case_preference_card(
    p_facility_id UUID,
    p_surgeon_id BIGINT,
    p_cpt_code VARCHAR(10),
    p_surgery_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    card_id UUID,
    revision_id UUID,
    card_code VARCHAR(50),
    card_name VARCHAR(150),
    revision_number INTEGER,
    resolution_tier VARCHAR(40),
    total_items_count BIGINT
) AS $$
DECLARE
    v_rec RECORD;
BEGIN
    -- Tier 1: Active Surgeon-Specific Card at this Facility
    SELECT c.id AS c_id, r.id AS r_id, c.card_code AS c_code, c.card_name AS c_name, r.revision_number AS r_num
    INTO v_rec
    FROM public.surgeon_preference_cards c
    JOIN public.surgeon_preference_card_revisions r ON c.id = r.card_id
    WHERE c.surgeon_id = p_surgeon_id
      AND c.facility_id = p_facility_id
      AND c.primary_cpt = p_cpt_code
      AND c.is_active = TRUE
      AND r.status = 'active'
      AND p_surgery_date >= r.effective_from
      AND (r.effective_to IS NULL OR p_surgery_date <= r.effective_to)
    LIMIT 1;

    IF FOUND THEN
        RETURN QUERY 
        SELECT v_rec.c_id, v_rec.r_id, v_rec.c_code, v_rec.c_name, v_rec.r_num,
               'TIER_1_SURGEON_FACILITY'::VARCHAR(40),
               (SELECT COUNT(*) FROM public.preference_card_items WHERE revision_id = v_rec.r_id);
        RETURN;
    END IF;

    -- Tier 2: Enterprise Surgeon Template Card (facility_id IS NULL)
    SELECT c.id AS c_id, r.id AS r_id, c.card_code AS c_code, c.card_name AS c_name, r.revision_number AS r_num
    INTO v_rec
    FROM public.surgeon_preference_cards c
    JOIN public.surgeon_preference_card_revisions r ON c.id = r.card_id
    WHERE c.surgeon_id = p_surgeon_id
      AND c.facility_id IS NULL
      AND c.primary_cpt = p_cpt_code
      AND c.is_active = TRUE
      AND r.status = 'active'
      AND p_surgery_date >= r.effective_from
      AND (r.effective_to IS NULL OR p_surgery_date <= r.effective_to)
    LIMIT 1;

    IF FOUND THEN
        RETURN QUERY 
        SELECT v_rec.c_id, v_rec.r_id, v_rec.c_code, v_rec.c_name, v_rec.r_num,
               'TIER_2_ENTERPRISE_SURGEON'::VARCHAR(40),
               (SELECT COUNT(*) FROM public.preference_card_items WHERE revision_id = v_rec.r_id);
        RETURN;
    END IF;

    -- Tier 3: Facility House Specialty Card
    SELECT c.id AS c_id, r.id AS r_id, c.card_code AS c_code, c.card_name AS c_name, r.revision_number AS r_num
    INTO v_rec
    FROM public.surgeon_preference_cards c
    JOIN public.surgeon_preference_card_revisions r ON c.id = r.card_id
    WHERE c.facility_id = p_facility_id
      AND c.is_house_card = TRUE
      AND c.primary_cpt = p_cpt_code
      AND c.is_active = TRUE
      AND r.status = 'active'
      AND p_surgery_date >= r.effective_from
      AND (r.effective_to IS NULL OR p_surgery_date <= r.effective_to)
    LIMIT 1;

    IF FOUND THEN
        RETURN QUERY 
        SELECT v_rec.c_id, v_rec.r_id, v_rec.c_code, v_rec.c_name, v_rec.r_num,
               'TIER_3_FACILITY_HOUSE'::VARCHAR(40),
               (SELECT COUNT(*) FROM public.preference_card_items WHERE revision_id = v_rec.r_id);
        RETURN;
    END IF;

    -- Fallback: Not Found
    RETURN;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- ==============================================================================
-- 10. ROW-LEVEL SECURITY POLICIES
-- ==============================================================================

ALTER TABLE public.surgeon_preference_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surgeon_preference_card_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preference_card_procedures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preference_card_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preference_card_substitutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_preference_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_preference_reconciliations ENABLE ROW LEVEL SECURITY;

-- Preference Cards Policies
CREATE POLICY "spc_select" ON public.surgeon_preference_cards
    FOR SELECT TO authenticated
    USING (facility_id IS NULL OR facility_id IN (SELECT public.get_auth_user_facilities()));

CREATE POLICY "spc_modify" ON public.surgeon_preference_cards
    FOR ALL TO authenticated
    USING (facility_id IN (SELECT public.get_auth_user_facilities()))
    WITH CHECK (facility_id IN (SELECT public.get_auth_user_facilities()));

-- Revisions Policies
CREATE POLICY "spcr_select" ON public.surgeon_preference_card_revisions
    FOR SELECT TO authenticated
    USING (facility_id IS NULL OR facility_id IN (SELECT public.get_auth_user_facilities()));

CREATE POLICY "spcr_modify" ON public.surgeon_preference_card_revisions
    FOR ALL TO authenticated
    USING (facility_id IN (SELECT public.get_auth_user_facilities()))
    WITH CHECK (facility_id IN (SELECT public.get_auth_user_facilities()));

-- Items Policies
CREATE POLICY "pci_select" ON public.preference_card_items
    FOR SELECT TO authenticated
    USING (TRUE);

CREATE POLICY "pci_modify" ON public.preference_card_items
    FOR ALL TO authenticated
    USING (TRUE)
    WITH CHECK (TRUE);

-- Substitutions Policies
CREATE POLICY "pcs_select" ON public.preference_card_substitutions
    FOR SELECT TO authenticated
    USING (TRUE);

CREATE POLICY "pcs_modify" ON public.preference_card_substitutions
    FOR ALL TO authenticated
    USING (TRUE)
    WITH CHECK (TRUE);

-- Procedures Policies
CREATE POLICY "pcp_select" ON public.preference_card_procedures
    FOR SELECT TO authenticated
    USING (TRUE);

CREATE POLICY "pcp_modify" ON public.preference_card_procedures
    FOR ALL TO authenticated
    USING (TRUE)
    WITH CHECK (TRUE);

-- Snapshots Policies
CREATE POLICY "cps_select" ON public.case_preference_snapshots
    FOR SELECT TO authenticated
    USING (facility_id IN (SELECT public.get_auth_user_facilities()));

CREATE POLICY "cps_modify" ON public.case_preference_snapshots
    FOR ALL TO authenticated
    USING (facility_id IN (SELECT public.get_auth_user_facilities()))
    WITH CHECK (facility_id IN (SELECT public.get_auth_user_facilities()));

-- Reconciliations Policies
CREATE POLICY "cpr_select" ON public.case_preference_reconciliations
    FOR SELECT TO authenticated
    USING (facility_id IN (SELECT public.get_auth_user_facilities()));

CREATE POLICY "cpr_modify" ON public.case_preference_reconciliations
    FOR ALL TO authenticated
    USING (facility_id IN (SELECT public.get_auth_user_facilities()))
    WITH CHECK (facility_id IN (SELECT public.get_auth_user_facilities()));

-- ==============================================================================
-- 11. SEED BASELINE DATA (Naples Surgery Center: 00000000-0000-0000-0000-000000000002)
-- ==============================================================================

DO $$
DECLARE
    v_fac_id UUID := '00000000-0000-0000-0000-000000000002';
    v_surgeon_id BIGINT;
    v_user_id UUID;
    v_femoral_sku UUID := '00000000-0000-0000-0054-000000000101';
    v_tibial_sku UUID := '00000000-0000-0000-0054-000000000103';
    v_iol_sku UUID := '00000000-0000-0000-0054-000000000105';
    v_knee_comp UUID;
    v_card_1 UUID := '00000000-0000-0000-0058-000000000001';
    v_rev_1 UUID := '00000000-0000-0000-0058-000000000101';
    v_card_2 UUID := '00000000-0000-0000-0058-000000000002';
    v_rev_2 UUID := '00000000-0000-0000-0058-000000000102';
BEGIN
    -- Dynamically resolve user ID from auth.users (NULL if no user, completely avoiding error 23503)
    SELECT id INTO v_user_id FROM auth.users ORDER BY created_at ASC LIMIT 1;
    
    -- Dynamically resolve first surgeon
    SELECT id INTO v_surgeon_id FROM public.surgeons ORDER BY id ASC LIMIT 1;
    
    -- Component reference
    SELECT id INTO v_knee_comp FROM public.implant_components WHERE code = 'KNEE_FEMORAL' LIMIT 1;

    IF v_surgeon_id IS NOT NULL THEN
        -- Card 1: Total Knee Arthroplasty (CPT 27447)
        INSERT INTO public.surgeon_preference_cards (
            id, facility_id, surgeon_id, card_code, card_name, specialty, primary_cpt,
            description, estimated_duration_minutes, turnover_time_minutes, laterality_applicable,
            is_active, is_house_card
        ) VALUES (
            v_card_1, v_fac_id, v_surgeon_id, 'PREF-ORTHO-TKA-01',
            'Primary Total Knee Reconstruction (Stryker Triathlon)', 'Orthopedics', '27447',
            'Standard cementless total knee arthroplasty setup with cruciate retaining protocol',
            75, 20, TRUE, TRUE, FALSE
        ) ON CONFLICT (id) DO NOTHING;

        -- Revision 1 for Card 1
        INSERT INTO public.surgeon_preference_card_revisions (
            id, card_id, facility_id, revision_number, status,
            effective_from, effective_to, change_summary,
            approved_by, approved_at, created_by
        ) VALUES (
            v_rev_1, v_card_1, v_fac_id, 1, 'active',
            '2026-01-01', NULL, 'Baseline 2026 clinical protocol approval',
            v_user_id, NOW(), v_user_id
        ) ON CONFLICT (id) DO NOTHING;

        -- Items for Card 1
        -- Item 1: Triathlon Femoral Component Size 4 Left (HOLD - unopened until sized)
        INSERT INTO public.preference_card_items (
            id, revision_id, item_category, sku_id, component_id, custom_item_name,
            manufacturer, catalog_number, staging_behavior, planned_quantity, unit_of_measure,
            is_mandatory, laterality_modifier, sequence_order
        ) VALUES (
            '00000000-0000-0000-0058-000000001001', v_rev_1, 'IMPLANT', v_femoral_sku, v_knee_comp,
            'Triathlon CR Femoral Component Size 4 Left', 'Stryker', '5520-F-401',
            'HOLD', 1, 'EA', TRUE, 'LEFT_ONLY', 1
        ) ON CONFLICT DO NOTHING;

        -- Item 2: Major Joint Knee Drape Pack (OPEN - sterile table prep)
        INSERT INTO public.preference_card_items (
            id, revision_id, item_category, custom_item_name,
            manufacturer, catalog_number, staging_behavior, planned_quantity, unit_of_measure,
            is_mandatory, laterality_modifier, sequence_order
        ) VALUES (
            '00000000-0000-0000-0058-000000001002', v_rev_1, 'STERILE_DISPOSABLE',
            'Custom Orthopedic Knee Drape Pack with Fluid Pouch', 'Cardinal Health', 'CH-99412',
            'OPEN', 1, 'PACK', TRUE, 'STANDARD', 2
        ) ON CONFLICT DO NOTHING;

        -- Item 3: Total Knee Instrument Tray Set (OPEN)
        INSERT INTO public.preference_card_items (
            id, revision_id, item_category, custom_item_name,
            manufacturer, catalog_number, staging_behavior, planned_quantity, unit_of_measure,
            is_mandatory, laterality_modifier, sequence_order
        ) VALUES (
            '00000000-0000-0000-0058-000000001003', v_rev_1, 'INSTRUMENT_TRAY',
            'Primary Total Knee Instrument Set & Trials Tray', 'Stryker Orthopaedics', 'SET-TRI-01',
            'OPEN', 1, 'SET', TRUE, 'STANDARD', 3
        ) ON CONFLICT DO NOTHING;

        -- Item 4: Orthopedic Tourniquet System (CAPITAL_EQUIPMENT)
        INSERT INTO public.preference_card_items (
            id, revision_id, item_category, custom_item_name,
            manufacturer, catalog_number, staging_behavior, planned_quantity, unit_of_measure,
            is_mandatory, laterality_modifier, sequence_order
        ) VALUES (
            '00000000-0000-0000-0058-000000001004', v_rev_1, 'CAPITAL_EQUIPMENT',
            'Zimmer ATS 4000 Automatic Tourniquet System', 'Zimmer Biomet', 'ATS-4000',
            'HOLD', 1, 'EA', TRUE, 'STANDARD', 4
        ) ON CONFLICT DO NOTHING;

        -- Pre-approved Substitution for Femoral Component
        INSERT INTO public.preference_card_substitutions (
            id, preference_card_item_id, substitute_sku_id, substitute_item_name,
            substitute_catalog_number, substitution_tier, is_auto_substitute_allowed, clinical_justification
        ) VALUES (
            '00000000-0000-0000-0058-000000002001', '00000000-0000-0000-0058-000000001001', v_tibial_sku,
            'Persona Anatomical Tibial Baseplate Size E', '42-5200-005-01',
            'TIER_2_CONTRACT_FORMULARY', TRUE, 'Phase 55 Preferred secondary cross-OEM contracted alternative'
        ) ON CONFLICT DO NOTHING;

        -- Card 2: Cataract Extraction with IOL Insertion (CPT 66984 - House Card)
        INSERT INTO public.surgeon_preference_cards (
            id, facility_id, surgeon_id, card_code, card_name, specialty, primary_cpt,
            description, estimated_duration_minutes, turnover_time_minutes, laterality_applicable,
            is_active, is_house_card
        ) VALUES (
            v_card_2, v_fac_id, v_surgeon_id, 'PREF-OPHTH-CAT-02',
            'Standard Phacoemulsification with Posterior Chamber IOL', 'Ophthalmology', '66984',
            'Standard Naples ASC cataract extraction and monofocal lens staging protocol',
            20, 10, TRUE, TRUE, TRUE
        ) ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.surgeon_preference_card_revisions (
            id, card_id, facility_id, revision_number, status,
            effective_from, effective_to, change_summary,
            approved_by, approved_at, created_by
        ) VALUES (
            v_rev_2, v_card_2, v_fac_id, 1, 'active',
            '2026-01-01', NULL, 'Naples ASC Standard House Card Approved',
            v_user_id, NOW(), v_user_id
        ) ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.preference_card_items (
            id, revision_id, item_category, sku_id, custom_item_name,
            manufacturer, catalog_number, staging_behavior, planned_quantity, unit_of_measure,
            is_mandatory, laterality_modifier, sequence_order
        ) VALUES (
            '00000000-0000-0000-0058-000000001005', v_rev_2, 'IMPLANT', v_iol_sku,
            'AcrySof IQ Monofocal Intraocular Lens +21.0D', 'Alcon', 'SN60WF-210',
            'HOLD', 1, 'EA', TRUE, 'STANDARD', 1
        ) ON CONFLICT DO NOTHING;
    END IF;
END $$;

COMMIT;
