-- ==============================================================================
-- MIGRATION: 026_implant_category_and_component_model.sql
-- DESCRIPTION: Phase 51 — Foundational Implant Category and Component Model
--              - Normalized 2-tier master taxonomy: public.implant_categories and public.implant_components
--              - Hybrid tenancy: global network baselines (facility_id IS NULL) + tenant extensions
--              - Decoupled duration governance (FDA 21 CFR § 812.3 / ISO 10993: permanent, temporary, resorbable, bioabsorbable, exchangeable)
--              - Cycle prevention trigger fn_prevent_circular_category_hierarchy (max depth 10)
--              - Restrict deactivation trigger fn_restrict_active_category_deactivation (blocks parent deactivation when child items active)
--              - Biologic consistency check constraint (requires bioabsorbable duration and tissue tracking)
--              - PostgreSQL Row-Level Security (RLS) policies for tenant isolation and global read
--              - Audit triggers via public.fn_audit_log_trigger()
--              - Global baseline seed taxonomy covering Orthopedics, Spine, Ophthalmology, Pain Management, Plastics, Podiatry
-- PLATFORM: Supabase PostgreSQL 15+
-- AUTHOR: ASCANALYST Architecture & Engineering Team
-- DATE: 2026-10-26
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. UTILITY: UPDATED_AT TRIGGER FUNCTION
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 2. TABLE: public.implant_categories
-- Master taxonomy table for surgical implant categories and anatomy
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.implant_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE, -- NULL = Global Network Baseline
    parent_category_id UUID REFERENCES public.implant_categories(id) ON DELETE RESTRICT, -- Hierarchical Anatomy Sub-Categories
    code VARCHAR(50) NOT NULL, -- e.g., 'ORTHO_HIP', 'SPINE_LUMBAR', 'OPHTH_CATARACT'
    name VARCHAR(150) NOT NULL, -- e.g., 'Hip Joint Arthroplasty', 'Lumbar Interbody Spine'
    specialty VARCHAR(50) NOT NULL, -- e.g., 'Orthopedics', 'Spine', 'Ophthalmology', 'Pain Management', 'Plastic Surgery', 'Podiatry'
    description TEXT,
    anatomy_region VARCHAR(100), -- e.g., 'Lower Extremity', 'Cervical Spine', 'Anterior Segment Eye'
    sort_order INTEGER NOT NULL DEFAULT 100,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Invariant: Unique category code per scope (global vs facility)
    CONSTRAINT uq_implant_category_code UNIQUE NULLS NOT DISTINCT (facility_id, code),

    -- Invariant: Self-referential loop prevention (immediate cycle)
    CONSTRAINT chk_category_no_self_parent CHECK (id != parent_category_id)
);

-- Indexes for performance and tree traversal
CREATE INDEX IF NOT EXISTS idx_ic_specialty ON public.implant_categories(specialty);
CREATE INDEX IF NOT EXISTS idx_ic_facility ON public.implant_categories(facility_id);
CREATE INDEX IF NOT EXISTS idx_ic_parent ON public.implant_categories(parent_category_id);
CREATE INDEX IF NOT EXISTS idx_ic_active ON public.implant_categories(is_active) WHERE is_active = TRUE;

-- ==============================================================================
-- 3. HIERARCHY INTEGRITY & DEACTIVATION TRIGGERS FOR implant_categories
-- ==============================================================================

-- 3.1 Deep Hierarchy Cycle Prevention Trigger
CREATE OR REPLACE FUNCTION public.fn_prevent_circular_category_hierarchy()
RETURNS TRIGGER AS $$
DECLARE
    v_current_parent UUID;
    v_depth INTEGER := 0;
BEGIN
    IF NEW.parent_category_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.parent_category_id = NEW.id THEN
        RAISE EXCEPTION 'Category cannot be its own parent.';
    END IF;

    v_current_parent := NEW.parent_category_id;
    WHILE v_current_parent IS NOT NULL LOOP
        v_depth := v_depth + 1;
        IF v_depth > 10 THEN
            RAISE EXCEPTION 'Category hierarchy exceeds maximum depth limit of 10 levels.';
        END IF;

        IF v_current_parent = NEW.id THEN
            RAISE EXCEPTION 'Circular parent-child relationship detected in implant category hierarchy.';
        END IF;

        SELECT parent_category_id INTO v_current_parent
        FROM public.implant_categories
        WHERE id = v_current_parent;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_prevent_circular_category_hierarchy ON public.implant_categories;
CREATE TRIGGER trg_prevent_circular_category_hierarchy
    BEFORE INSERT OR UPDATE OF parent_category_id ON public.implant_categories
    FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_circular_category_hierarchy();

-- 3.2 Restrict Active Category Deactivation Trigger (Architectural Requirement A2)
-- Requires child components and sub-categories to be explicitly deactivated first
CREATE OR REPLACE FUNCTION public.fn_restrict_active_category_deactivation()
RETURNS TRIGGER AS $$
DECLARE
    v_active_subcategories INTEGER;
    v_active_components INTEGER;
BEGIN
    IF OLD.is_active = TRUE AND NEW.is_active = FALSE THEN
        -- Check for active child categories
        SELECT COUNT(*) INTO v_active_subcategories
        FROM public.implant_categories
        WHERE parent_category_id = OLD.id AND is_active = TRUE;

        IF v_active_subcategories > 0 THEN
            RAISE EXCEPTION 'Cannot deactivate category "%" because it contains % active sub-categories. Deactivate sub-categories first.', OLD.name, v_active_subcategories;
        END IF;

        -- Check for active child components
        SELECT COUNT(*) INTO v_active_components
        FROM public.implant_components
        WHERE category_id = OLD.id AND is_active = TRUE;

        IF v_active_components > 0 THEN
            RAISE EXCEPTION 'Cannot deactivate category "%" because it contains % active components. Deactivate components first.', OLD.name, v_active_components;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_restrict_active_category_deactivation ON public.implant_categories;
CREATE TRIGGER trg_restrict_active_category_deactivation
    BEFORE UPDATE OF is_active ON public.implant_categories
    FOR EACH ROW EXECUTE FUNCTION public.fn_restrict_active_category_deactivation();

-- 3.3 Updated_at trigger for implant_categories
DROP TRIGGER IF EXISTS trg_touch_implant_categories ON public.implant_categories;
CREATE TRIGGER trg_touch_implant_categories
    BEFORE UPDATE ON public.implant_categories
    FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

-- ==============================================================================
-- 4. TABLE: public.implant_components
-- Standard clinical component types belonging to an implant category
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.implant_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES public.implant_categories(id) ON DELETE RESTRICT,
    facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE, -- NULL = Inherited Global Baseline, Set = Facility Custom Extension
    code VARCHAR(50) NOT NULL, -- e.g., 'HIP_CUP', 'HIP_STEM', 'SPINE_CAGE', 'IOL_MONOFOCAL'
    name VARCHAR(150) NOT NULL, -- e.g., 'Acetabular Shell / Cup', 'Femoral Hip Stem'
    component_type VARCHAR(50) NOT NULL, -- Check constraint: structural, bearing, fixation, spacer, biologic, device_system, accessory
    default_duration VARCHAR(30) NOT NULL DEFAULT 'permanent', -- permanent, temporary, resorbable, bioabsorbable, exchangeable
    description TEXT,
    requires_serial_tracking BOOLEAN NOT NULL DEFAULT FALSE,
    requires_lot_tracking BOOLEAN NOT NULL DEFAULT TRUE,
    allows_biological_tissue BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 100,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Invariant: Unique component code per category and tenant scope
    CONSTRAINT uq_implant_component_code UNIQUE NULLS NOT DISTINCT (category_id, facility_id, code),

    -- Invariant: Component type clinical taxonomy
    CONSTRAINT chk_component_type CHECK (
        component_type IN ('structural', 'bearing', 'fixation', 'spacer', 'biologic', 'device_system', 'accessory')
    ),

    -- Invariant: Duration classification validation (FDA 21 CFR § 812.3 & ISO 10993)
    CONSTRAINT chk_component_duration CHECK (
        default_duration IN ('permanent', 'temporary', 'resorbable', 'bioabsorbable', 'exchangeable')
    ),

    -- Invariant: Biologics must permit tissue tracking and cannot be permanent synthetic metal
    CONSTRAINT chk_biologic_consistency CHECK (
        (component_type = 'biologic' AND allows_biological_tissue = TRUE AND default_duration = 'bioabsorbable')
        OR (component_type != 'biologic')
    )
);

-- Indexes for performance and foreign key resolution
CREATE INDEX IF NOT EXISTS idx_comp_category ON public.implant_components(category_id);
CREATE INDEX IF NOT EXISTS idx_comp_facility ON public.implant_components(facility_id);
CREATE INDEX IF NOT EXISTS idx_comp_type ON public.implant_components(component_type);
CREATE INDEX IF NOT EXISTS idx_comp_duration ON public.implant_components(default_duration);
CREATE INDEX IF NOT EXISTS idx_comp_active ON public.implant_components(is_active) WHERE is_active = TRUE;

-- 4.1 Updated_at trigger for implant_components
DROP TRIGGER IF EXISTS trg_touch_implant_components ON public.implant_components;
CREATE TRIGGER trg_touch_implant_components
    BEFORE UPDATE ON public.implant_components
    FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

-- ==============================================================================
-- 5. ATTACH AUDIT LOG TRIGGERS
-- ==============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p 
        JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE n.nspname = 'public' AND p.proname = 'fn_audit_log_trigger'
    ) THEN
        DROP TRIGGER IF EXISTS trg_audit_implant_categories ON public.implant_categories;
        CREATE TRIGGER trg_audit_implant_categories
            AFTER INSERT OR UPDATE OR DELETE ON public.implant_categories
            FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

        DROP TRIGGER IF EXISTS trg_audit_implant_components ON public.implant_components;
        CREATE TRIGGER trg_audit_implant_components
            AFTER INSERT OR UPDATE OR DELETE ON public.implant_components
            FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();
    END IF;
END $$;

-- ==============================================================================
-- 6. ROW-LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.implant_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.implant_components ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "implant_categories_facility_isolation" ON public.implant_categories;
CREATE POLICY "implant_categories_facility_isolation" ON public.implant_categories
    FOR ALL USING (
        facility_id IS NULL OR
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID OR
        auth.uid() IS NULL
    );

DROP POLICY IF EXISTS "implant_components_facility_isolation" ON public.implant_components;
CREATE POLICY "implant_components_facility_isolation" ON public.implant_components
    FOR ALL USING (
        facility_id IS NULL OR
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID OR
        auth.uid() IS NULL
    );

-- ==============================================================================
-- 7. GLOBAL BASELINE SEED TAXONOMY (SPECIALTIES, CATEGORIES & COMPONENTS)
-- ==============================================================================

-- 7.1 Seed Categories
INSERT INTO public.implant_categories (code, name, specialty, description, anatomy_region, sort_order, facility_id, is_active)
VALUES
    ('ORTHO_HIP', 'Hip Joint Reconstruction', 'Orthopedics', 'Primary and revision hip joint arthroplasty components and fixation', 'Lower Extremity', 10, NULL, TRUE),
    ('ORTHO_KNEE', 'Knee Joint Reconstruction', 'Orthopedics', 'Primary and revision total and unicondylar knee arthroplasty systems', 'Lower Extremity', 20, NULL, TRUE),
    ('ORTHO_SHOULDER', 'Shoulder Joint Reconstruction', 'Orthopedics', 'Anatomic and reverse total shoulder arthroplasty systems', 'Upper Extremity', 30, NULL, TRUE),
    ('SPINE_ACDF', 'Anterior Cervical Discectomy & Fusion', 'Spine', 'Anterior cervical interbody cages, fixation plates, screws, and biologics', 'Cervical Spine', 40, NULL, TRUE),
    ('SPINE_LUMBAR', 'Lumbar Interbody Fusion', 'Spine', 'TLIF, PLIF, and lateral interbody spacers with pedicle screw fixation rods', 'Lumbar Spine', 50, NULL, TRUE),
    ('OPHTH_CATARACT', 'Cataract & Lens Replacement', 'Ophthalmology', 'Intraocular lenses (monofocal, toric, presbyopia-correcting) and adjunct devices', 'Anterior Segment Eye', 60, NULL, TRUE),
    ('OPHTH_GLAUCOMA', 'Glaucoma Surgical Management', 'Ophthalmology', 'Micro-invasive glaucoma surgical (MIGS) stents and aqueous shunts', 'Anterior Segment Eye', 70, NULL, TRUE),
    ('PAIN_SCS', 'Spinal Cord Neurostimulation', 'Pain Management', 'Implantable pulse generators, percutaneous and paddle leads, and anchors', 'Spinal Cord & Epidural', 80, NULL, TRUE),
    ('PLASTICS_BREAST', 'Breast Reconstruction & Augmentation', 'Plastic Surgery', 'Silicone and saline prosthetic implants, tissue expanders, and ADM tissue grafts', 'Chest & Torso', 90, NULL, TRUE),
    ('PODIATRY_FOREFOOT', 'Podiatric Forefoot Reconstruction', 'Podiatry', 'Metatarsal osteotomy plates, compression screws, and fixation pins', 'Foot & Ankle', 100, NULL, TRUE)
ON CONFLICT (facility_id, code) DO UPDATE SET
    name = EXCLUDED.name,
    specialty = EXCLUDED.specialty,
    description = EXCLUDED.description,
    anatomy_region = EXCLUDED.anatomy_region,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active;

-- 7.2 Seed Components: Orthopedics - Hip Joint Reconstruction (ORTHO_HIP)
INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'HIP_CUP', 'Acetabular Shell / Cup', 'structural', 'permanent', 'Porous metal or titanium acetabular press-fit shell', TRUE, TRUE, FALSE, 10, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'ORTHO_HIP'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET
    name = EXCLUDED.name, component_type = EXCLUDED.component_type, default_duration = EXCLUDED.default_duration, requires_serial_tracking = EXCLUDED.requires_serial_tracking;

INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'HIP_LINER', 'Acetabular Modular Liner', 'bearing', 'permanent', 'Highly cross-linked polyethylene or ceramic articulating cup liner', FALSE, TRUE, FALSE, 20, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'ORTHO_HIP'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET
    name = EXCLUDED.name, component_type = EXCLUDED.component_type, default_duration = EXCLUDED.default_duration;

INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'HIP_HEAD', 'Femoral Modular Head', 'bearing', 'permanent', 'Cobalt-chrome or ceramic modular femoral articulating head ball', FALSE, TRUE, FALSE, 30, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'ORTHO_HIP'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET
    name = EXCLUDED.name, component_type = EXCLUDED.component_type, default_duration = EXCLUDED.default_duration;

INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'HIP_STEM', 'Femoral Hip Stem', 'structural', 'permanent', 'Tapered wedge titanium femoral press-fit or cemented stem', TRUE, TRUE, FALSE, 40, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'ORTHO_HIP'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET
    name = EXCLUDED.name, component_type = EXCLUDED.component_type, default_duration = EXCLUDED.default_duration, requires_serial_tracking = EXCLUDED.requires_serial_tracking;

INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'HIP_SCREW', 'Acetabular Cancellous Screw', 'fixation', 'permanent', 'Self-tapping cancellous bone screw for supplemental cup fixation', FALSE, TRUE, FALSE, 50, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'ORTHO_HIP'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET
    name = EXCLUDED.name, component_type = EXCLUDED.component_type, default_duration = EXCLUDED.default_duration;

-- 7.3 Seed Components: Orthopedics - Knee Joint Reconstruction (ORTHO_KNEE)
INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'KNEE_FEMORAL', 'Femoral Knee Component', 'structural', 'permanent', 'Cobalt-chrome femoral condylar resurfacing component', TRUE, TRUE, FALSE, 10, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'ORTHO_KNEE'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'KNEE_TIBIAL_TRAY', 'Tibial Baseplate / Tray', 'structural', 'permanent', 'Titanium or cobalt-chrome modular tibial tray', TRUE, TRUE, FALSE, 20, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'ORTHO_KNEE'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'KNEE_TIBIAL_INSERT', 'Tibial Polyethylene Insert', 'bearing', 'permanent', 'Modular UHMWPE articulating tibial bearing insert', FALSE, TRUE, FALSE, 30, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'ORTHO_KNEE'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'KNEE_PATELLA', 'Patellar Resurfacing Button', 'bearing', 'permanent', 'Polyethylene all-poly domed patellar button', FALSE, TRUE, FALSE, 40, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'ORTHO_KNEE'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

-- 7.4 Seed Components: Orthopedics - Shoulder Joint Reconstruction (ORTHO_SHOULDER)
INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'SHLDR_GLENOID', 'Glenoid Resurfacing Component', 'bearing', 'permanent', 'All-polyethylene pegged or keeled glenoid component', FALSE, TRUE, FALSE, 10, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'ORTHO_SHOULDER'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'SHLDR_HUMERAL_STEM', 'Humeral Shoulder Stem', 'structural', 'permanent', 'Press-fit or cemented humeral canal fixation stem', TRUE, TRUE, FALSE, 20, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'ORTHO_SHOULDER'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'SHLDR_HUMERAL_HEAD', 'Humeral Articulating Head', 'bearing', 'permanent', 'Modular cobalt-chrome humeral head ball', FALSE, TRUE, FALSE, 30, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'ORTHO_SHOULDER'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

-- 7.5 Seed Components: Spine - Anterior Cervical Discectomy & Fusion (SPINE_ACDF)
INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'SPINE_ACDF_CAGE', 'Cervical Interbody Spacer / Cage', 'spacer', 'permanent', 'PEEK or 3D-printed porous titanium interbody cervical cage', FALSE, TRUE, FALSE, 10, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'SPINE_ACDF'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'SPINE_ACDF_PLATE', 'Anterior Cervical Fixation Plate', 'structural', 'permanent', 'Low-profile anterior cervical locking plate', FALSE, TRUE, FALSE, 20, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'SPINE_ACDF'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'SPINE_ACDF_SCREW', 'Cervical Bone Fixation Screw', 'fixation', 'permanent', 'Self-drilling locking or variable angle cervical screw', FALSE, TRUE, FALSE, 30, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'SPINE_ACDF'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'SPINE_DBM_GRAFT', 'Demineralized Bone Matrix Biologic', 'biologic', 'bioabsorbable', 'Allograft DBM putty/paste with osteoinductive carrier', FALSE, TRUE, TRUE, 40, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'SPINE_ACDF'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

-- 7.6 Seed Components: Spine - Lumbar Interbody Fusion (SPINE_LUMBAR)
INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'SPINE_LUMBAR_CAGE', 'Lumbar Interbody Spacer', 'spacer', 'permanent', 'Static or expandable PEEK/Titanium interbody lumbar spacer', FALSE, TRUE, FALSE, 10, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'SPINE_LUMBAR'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'SPINE_PEDICLE_SCREW', 'Pedicle Fixation Screw', 'fixation', 'permanent', 'Polyaxial cannulated or solid titanium pedicle screw', FALSE, TRUE, FALSE, 20, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'SPINE_LUMBAR'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'SPINE_ROD', 'Spinal Fixation Rod', 'structural', 'permanent', '5.5mm or 6.0mm titanium/cobalt-chrome spinal rod', FALSE, TRUE, FALSE, 30, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'SPINE_LUMBAR'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'SPINE_SET_SCREW', 'Pedicle Locking Cap / Set Screw', 'fixation', 'permanent', 'Internal locking cap set screw for pedicle screw housing', FALSE, TRUE, FALSE, 40, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'SPINE_LUMBAR'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

-- 7.7 Seed Components: Ophthalmology - Cataract (OPHTH_CATARACT)
INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'IOL_MONOFOCAL', 'Monofocal Intraocular Lens', 'device_system', 'permanent', 'Single focal point foldable acrylic posterior chamber IOL', TRUE, TRUE, FALSE, 10, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'OPHTH_CATARACT'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'IOL_TORIC', 'Astigmatism Toric Intraocular Lens', 'device_system', 'permanent', 'Astigmatism-correcting toric foldable acrylic IOL', TRUE, TRUE, FALSE, 20, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'OPHTH_CATARACT'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'IOL_MULTIFOCAL', 'Presbyopia Multifocal/EDOF Lens', 'device_system', 'permanent', 'Extended depth of focus or trifocal premium IOL', TRUE, TRUE, FALSE, 30, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'OPHTH_CATARACT'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'OPHTH_CTR', 'Capsular Tension Ring', 'fixation', 'permanent', 'PMMA ring for capsular bag stabilization during cataract surgery', FALSE, TRUE, FALSE, 40, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'OPHTH_CATARACT'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'OPHTH_VISCOELASTIC', 'Ophthalmic Viscosurgical Device (OVD)', 'accessory', 'temporary', 'Sodium hyaluronate cohesive or dispersive viscoelastic syringe', FALSE, TRUE, FALSE, 50, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'OPHTH_CATARACT'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

-- 7.8 Seed Components: Ophthalmology - Glaucoma (OPHTH_GLAUCOMA)
INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'GLAUCOMA_STENT', 'MIGS Trabecular Micro-Bypass Stent', 'device_system', 'permanent', 'Micro-invasive glaucoma titanium trabecular bypass stent (e.g. iStent/Hydrus)', TRUE, TRUE, FALSE, 10, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'OPHTH_GLAUCOMA'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'GLAUCOMA_SHUNT', 'Aqueous Drainage Valve / Shunt', 'device_system', 'permanent', 'Glaucoma drainage implant with reservoir plate and silicone tube (e.g. Ahmed/Baerveldt)', TRUE, TRUE, FALSE, 20, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'OPHTH_GLAUCOMA'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

-- 7.9 Seed Components: Pain Management - SCS (PAIN_SCS)
INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'SCS_PULSE_GEN', 'Implantable Pulse Generator (IPG)', 'device_system', 'permanent', 'Rechargeable or primary cell neurostimulator generator', TRUE, TRUE, FALSE, 10, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'PAIN_SCS'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'SCS_PERC_LEAD', 'Percutaneous Stimulation Lead', 'fixation', 'permanent', '8-contact or 16-contact percutaneous epidural stimulation lead', TRUE, TRUE, FALSE, 20, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'PAIN_SCS'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'SCS_PADDLE_LEAD', 'Surgical Paddle Lead', 'fixation', 'permanent', 'Multi-column surgical paddle lead for laminotomy placement', TRUE, TRUE, FALSE, 30, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'PAIN_SCS'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'SCS_ANCHOR', 'Lead Fixation Anchor', 'fixation', 'permanent', 'Silicone suture sleeve anchor for fascia lead fixation', FALSE, TRUE, FALSE, 40, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'PAIN_SCS'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

-- 7.10 Seed Components: Plastic Surgery - Breast (PLASTICS_BREAST)
INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'BREAST_IMPLANT_SILICONE', 'Silicone Gel Breast Implant', 'device_system', 'permanent', 'Cohesive silicone gel filled round or shaped breast prosthesis', TRUE, TRUE, FALSE, 10, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'PLASTICS_BREAST'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'BREAST_IMPLANT_SALINE', 'Saline Breast Implant', 'device_system', 'permanent', 'Inflatable saline-filled smooth or textured breast prosthesis', TRUE, TRUE, FALSE, 20, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'PLASTICS_BREAST'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'BREAST_TISSUE_EXPANDER', 'Breast Tissue Expander', 'device_system', 'temporary', 'Temporary expander with magnetic injection port for staged reconstruction', TRUE, TRUE, FALSE, 30, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'PLASTICS_BREAST'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'BREAST_ADM_GRAFT', 'Acellular Dermal Matrix (ADM) Sheet', 'biologic', 'bioabsorbable', 'Decellularized human or fetal bovine regenerative tissue matrix sheet', FALSE, TRUE, TRUE, 40, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'PLASTICS_BREAST'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'BREAST_SIZER', 'Intra-operative Sizing Shell', 'accessory', 'temporary', 'Transient intra-operative sizing template shell', FALSE, TRUE, FALSE, 50, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'PLASTICS_BREAST'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

-- 7.11 Seed Components: Podiatry & Extremities - Forefoot (PODIATRY_FOREFOOT)
INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'POD_BUNION_PLATE', 'Metatarsal Osteotomy Plate', 'structural', 'permanent', 'Low-profile titanium locking bunion correction plate', FALSE, TRUE, FALSE, 10, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'PODIATRY_FOREFOOT'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'POD_CANNULATED_SCREW', 'Cannulated Compression Screw', 'fixation', 'permanent', 'Headless cannulated bone screw for osteotomy fusion', FALSE, TRUE, FALSE, 20, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'PODIATRY_FOREFOOT'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'POD_K_WIRE', 'Smooth Kirschner Wire (K-Wire)', 'fixation', 'temporary', 'Temporary transfixation pin for digital stabilization (<=30 days)', FALSE, TRUE, FALSE, 30, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'PODIATRY_FOREFOOT'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.implant_components (category_id, facility_id, code, name, component_type, default_duration, description, requires_serial_tracking, requires_lot_tracking, allows_biological_tissue, sort_order, is_active)
SELECT id, NULL, 'POD_BIO_SCREW', 'Resorbable Bio-Compression Screw', 'fixation', 'resorbable', 'Synthetic PLLA/PGA self-reinforced bioabsorbable screw', FALSE, TRUE, FALSE, 40, TRUE
FROM public.implant_categories WHERE facility_id IS NULL AND code = 'PODIATRY_FOREFOOT'
ON CONFLICT (category_id, facility_id, code) DO UPDATE SET name = EXCLUDED.name;

COMMIT;
