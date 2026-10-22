-- ==============================================================================
-- MIGRATION 019: CPT SPECIALTY, BODY SYSTEM, BODY PART & ORGAN MAPPING (PHASE 42)
-- ==============================================================================
-- Description: Establishes normalized clinical taxonomy tables:
--              1. clinical_specialties
--              2. body_systems
--              3. body_parts
--              4. anatomical_organs
--              5. procedure_families
--              6. cpt_clinical_mappings (multi-structure, multi-specialty junction)
--              7. cpt_mapping_reviews (audit provenance)
--              Backfills existing CPT master rows, deploys resolution stored
--              procedure fn_resolve_cpt_clinical_taxonomy, and enables RLS.
-- Author: Antigravity Agentic Platform
-- Date: 2026-10-22
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. CLINICAL SPECIALTIES MASTER
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.clinical_specialties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spec_code ON public.clinical_specialties(code);
CREATE INDEX IF NOT EXISTS idx_spec_active ON public.clinical_specialties(is_active);

-- ==============================================================================
-- 2. ANATOMICAL TAXONOMY: BODY SYSTEMS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.body_systems (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bs_code ON public.body_systems(code);

-- ==============================================================================
-- 3. ANATOMICAL TAXONOMY: BODY PARTS / REGIONS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.body_parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    body_system_id UUID NOT NULL REFERENCES public.body_systems(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    laterality_applicable BOOLEAN NOT NULL DEFAULT false,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bp_system ON public.body_parts(body_system_id);
CREATE INDEX IF NOT EXISTS idx_bp_code ON public.body_parts(code);

-- ==============================================================================
-- 4. ANATOMICAL TAXONOMY: ORGANS & FOCAL STRUCTURES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.anatomical_organs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    body_part_id UUID NOT NULL REFERENCES public.body_parts(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    snomed_ct_id VARCHAR(50),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_part ON public.anatomical_organs(body_part_id);
CREATE INDEX IF NOT EXISTS idx_org_code ON public.anatomical_organs(code);

-- ==============================================================================
-- 5. PROCEDURAL TAXONOMY: PROCEDURE FAMILIES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.procedure_families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    surgical_approach VARCHAR(50), -- e.g., Open, Arthroscopic, Endoscopic, Percutaneous
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pf_code ON public.procedure_families(code);

-- ==============================================================================
-- 6. MULTI-CARDINALITY JUNCTION: CPT CLINICAL MAPPINGS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.cpt_clinical_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cpt_master_id UUID NOT NULL REFERENCES public.cpt_master(id) ON DELETE RESTRICT,
    specialty_id UUID NOT NULL REFERENCES public.clinical_specialties(id) ON DELETE RESTRICT,
    body_system_id UUID NOT NULL REFERENCES public.body_systems(id) ON DELETE RESTRICT,
    body_part_id UUID NOT NULL REFERENCES public.body_parts(id) ON DELETE RESTRICT,
    organ_id UUID REFERENCES public.anatomical_organs(id) ON DELETE SET NULL, -- Explicit NULL for general/multi-organ cavity
    procedure_family_id UUID REFERENCES public.procedure_families(id) ON DELETE SET NULL,
    is_primary BOOLEAN NOT NULL DEFAULT true,
    review_status VARCHAR(20) NOT NULL DEFAULT 'verified' 
        CHECK (review_status IN ('pending', 'verified', 'rejected', 'needs_review')),
    confidence_score NUMERIC(3, 2) NOT NULL DEFAULT 1.00 
        CHECK (confidence_score >= 0.00 AND confidence_score <= 1.00),
    mapping_source VARCHAR(30) NOT NULL DEFAULT 'authoritative' 
        CHECK (mapping_source IN ('authoritative', 'manual', 'ai_suggested', 'legacy_import')),
    facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE, -- NULL = National Standard
    effective_date DATE NOT NULL DEFAULT '2020-01-01',
    termination_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_mapping_dates CHECK (termination_date IS NULL OR termination_date >= effective_date)
);

CREATE INDEX IF NOT EXISTS idx_ccm_cpt ON public.cpt_clinical_mappings(cpt_master_id);
CREATE INDEX IF NOT EXISTS idx_ccm_spec ON public.cpt_clinical_mappings(specialty_id);
CREATE INDEX IF NOT EXISTS idx_ccm_bp ON public.cpt_clinical_mappings(body_part_id);
CREATE INDEX IF NOT EXISTS idx_ccm_fac ON public.cpt_clinical_mappings(facility_id);
CREATE INDEX IF NOT EXISTS idx_ccm_status ON public.cpt_clinical_mappings(review_status);

-- ==============================================================================
-- 7. AUDIT PROVENANCE: CPT MAPPING REVIEWS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.cpt_mapping_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mapping_id UUID NOT NULL REFERENCES public.cpt_clinical_mappings(id) ON DELETE CASCADE,
    reviewer_id UUID,
    decision VARCHAR(20) NOT NULL CHECK (decision IN ('verified', 'rejected', 'modified')),
    rationale TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cmr_mapping ON public.cpt_mapping_reviews(mapping_id);

-- ==============================================================================
-- 8. SEED STANDARD CLINICAL & ANATOMICAL TAXONOMY
-- ==============================================================================

-- 8.1 Seed Clinical Specialties
INSERT INTO public.clinical_specialties (id, code, name, description, display_order)
VALUES
    ('10000000-0000-0000-0000-000000000001', 'ORTHO', 'Orthopedics', 'Musculoskeletal, joint reconstruction, sports medicine, trauma', 1),
    ('10000000-0000-0000-0000-000000000002', 'OPHTH', 'Ophthalmology', 'Cataract, glaucoma, cornea, retina, ocular surgery', 2),
    ('10000000-0000-0000-0000-000000000003', 'GI', 'Gastroenterology', 'Endoscopy, colonoscopy, digestive tract diagnostics and surgery', 3),
    ('10000000-0000-0000-0000-000000000004', 'ENT', 'Otolaryngology (ENT)', 'Ear, nose, throat, head and neck surgery', 4),
    ('10000000-0000-0000-0000-000000000005', 'PLASTIC', 'Plastic / Cosmetic', 'Cosmetic, reconstructive, hand, skin procedures', 5),
    ('10000000-0000-0000-0000-000000000006', 'PODIATRY', 'Podiatry', 'Foot and ankle surgical interventions', 6),
    ('10000000-0000-0000-0000-000000000007', 'UROLOGY', 'Urology', 'Urinary tract, cystoscopy, kidney, prostate surgery', 7),
    ('10000000-0000-0000-0000-000000000008', 'PAIN', 'Pain Management', 'Epidural, facet injections, radiofrequency ablation', 8),
    ('10000000-0000-0000-0000-000000000009', 'CARDIO', 'Cardiology', 'Vascular, pacing, cardiac diagnostic catheterization', 9),
    ('10000000-0000-0000-0000-000000000010', 'GENERAL', 'General Surgery', 'Abdominal, hernia, soft tissue, biopsy', 10),
    ('10000000-0000-0000-0000-000000000011', 'NEURO', 'Neurology / Neurosurgery', 'Peripheral nerve, carpal tunnel, spine surgery', 11),
    ('10000000-0000-0000-0000-000000000012', 'GYN', 'Gynecology', 'Female reproductive tract ambulatory procedures', 12)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    display_order = EXCLUDED.display_order,
    updated_at = NOW();

-- 8.2 Seed Body Systems
INSERT INTO public.body_systems (id, code, name, description, display_order)
VALUES
    ('20000000-0000-0000-0000-000000000001', 'SYS_MUSC', 'Musculoskeletal System', 'Bones, joints, muscles, tendons, ligaments', 1),
    ('20000000-0000-0000-0000-000000000002', 'SYS_EYE', 'Eye and Ocular Adnexa', 'Eyeball, cornea, lens, retina, extraocular muscles', 2),
    ('20000000-0000-0000-0000-000000000003', 'SYS_DIGEST', 'Digestive System', 'Mouth, esophagus, stomach, intestines, colon, rectum, liver', 3),
    ('20000000-0000-0000-0000-000000000004', 'SYS_RESP_ENT', 'Respiratory & Auditory (ENT)', 'Nose, sinuses, larynx, pharynx, ear', 4),
    ('20000000-0000-0000-0000-000000000005', 'SYS_INTEG', 'Integumentary System', 'Skin, subcutaneous tissue, breast, nails', 5),
    ('20000000-0000-0000-0000-000000000006', 'SYS_CARDIO', 'Cardiovascular System', 'Heart, arteries, veins, peripheral vascular', 6),
    ('20000000-0000-0000-0000-000000000007', 'SYS_NERV', 'Nervous System', 'Spine, peripheral nerves, cranial nerves', 7),
    ('20000000-0000-0000-0000-000000000008', 'SYS_URINARY', 'Urinary System', 'Kidney, ureter, bladder, urethra', 8),
    ('20000000-0000-0000-0000-000000000009', 'SYS_GENERAL', 'General / Multiple Systems', 'Cross-system, unclassified or multi-cavity procedures', 9)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    display_order = EXCLUDED.display_order,
    updated_at = NOW();

-- 8.3 Seed Body Parts (Linked to Systems)
INSERT INTO public.body_parts (id, body_system_id, code, name, laterality_applicable, display_order)
VALUES
    -- Musculoskeletal
    ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'BP_SHOULDER', 'Shoulder', true, 1),
    ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'BP_ELBOW', 'Elbow', true, 2),
    ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'BP_WRIST', 'Wrist', true, 3),
    ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 'BP_HAND', 'Hand / Fingers', true, 4),
    ('30000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', 'BP_HIP', 'Hip', true, 5),
    ('30000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000001', 'BP_KNEE', 'Knee', true, 6),
    ('30000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000001', 'BP_ANKLE', 'Ankle', true, 7),
    ('30000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000001', 'BP_FOOT', 'Foot / Toes', true, 8),
    ('30000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000001', 'BP_SPINE', 'Spine / Back', false, 9),
    -- Eye
    ('30000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000002', 'BP_EYE', 'Eye / Ocular Adnexa', true, 10),
    -- Digestive
    ('30000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000003', 'BP_UPPER_GI', 'Upper GI (Esophagus / Stomach)', false, 11),
    ('30000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000003', 'BP_LOWER_GI', 'Lower GI (Colon / Rectum / Anus)', false, 12),
    ('30000000-0000-0000-0000-000000000013', '20000000-0000-0000-0000-000000000003', 'BP_BILIARY', 'Gallbladder / Biliary', false, 13),
    -- ENT / Respiratory
    ('30000000-0000-0000-0000-000000000014', '20000000-0000-0000-0000-000000000004', 'BP_NOSE', 'Nose / Sinuses', false, 14),
    ('30000000-0000-0000-0000-000000000015', '20000000-0000-0000-0000-000000000004', 'BP_THROAT', 'Throat / Pharynx / Larynx', false, 15),
    ('30000000-0000-0000-0000-000000000016', '20000000-0000-0000-0000-000000000004', 'BP_EAR', 'Ear', true, 16),
    -- Integumentary
    ('30000000-0000-0000-0000-000000000017', '20000000-0000-0000-0000-000000000005', 'BP_SKIN_SOFT', 'Skin / Soft Tissue', false, 17),
    ('30000000-0000-0000-0000-000000000018', '20000000-0000-0000-0000-000000000005', 'BP_BREAST', 'Breast', true, 18),
    -- General
    ('30000000-0000-0000-0000-000000000019', '20000000-0000-0000-0000-000000000009', 'BP_GENERAL', 'General Body', false, 19)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    laterality_applicable = EXCLUDED.laterality_applicable,
    display_order = EXCLUDED.display_order,
    updated_at = NOW();

-- 8.4 Seed Anatomical Organs / Focal Structures
INSERT INTO public.anatomical_organs (id, body_part_id, code, name, description, snomed_ct_id)
VALUES
    ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000006', 'ORG_MENISCUS', 'Meniscus (Knee)', 'Medial or lateral meniscus of knee joint', '72696002'),
    ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000006', 'ORG_ACL_PCL', 'Cruciate Ligaments (ACL/PCL)', 'Anterior or posterior cruciate ligament', '54752002'),
    ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'ORG_ROTATOR_CUFF', 'Rotator Cuff', 'Supraspinatus, infraspinatus, subscapularis tendons', '71616004'),
    ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000010', 'ORG_LENS', 'Crystalline Lens (Eye)', 'Natural lens of the eye', '65171008'),
    ('40000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000010', 'ORG_CORNEA', 'Cornea', 'Transparent front layer of the eye', '28726007'),
    ('40000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000010', 'ORG_RETINA', 'Retina', 'Light-sensitive nervous tissue layer of eye', '5665002'),
    ('40000000-0000-0000-0000-000000000007', '30000000-0000-0000-0000-000000000012', 'ORG_COLON', 'Colon / Large Intestine', 'Ascending, transverse, descending, sigmoid colon', '71854001'),
    ('40000000-0000-0000-0000-000000000008', '30000000-0000-0000-0000-000000000013', 'ORG_GALLBLADDER', 'Gallbladder', 'Biliary reservoir for bile storage', '28231008'),
    ('40000000-0000-0000-0000-000000000009', '30000000-0000-0000-0000-000000000015', 'ORG_TONSILS', 'Tonsils / Adenoids', 'Palatine tonsils, pharyngeal lymphoid tissue', '75570004'),
    ('40000000-0000-0000-0000-000000000010', '30000000-0000-0000-0000-000000000004', 'ORG_CARPAL_TUNNEL', 'Median Nerve / Carpal Tunnel', 'Transverse carpal ligament and median nerve', '414736005')
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    snomed_ct_id = EXCLUDED.snomed_ct_id,
    updated_at = NOW();

-- 8.5 Seed Procedure Families
INSERT INTO public.procedure_families (id, code, name, surgical_approach, description)
VALUES
    ('50000000-0000-0000-0000-000000000001', 'FAM_ARTHROSCOPY', 'Arthroscopy', 'Minimally Invasive / Endoscopic', 'Diagnostic and operative joint arthroscopy'),
    ('50000000-0000-0000-0000-000000000002', 'FAM_ENDOSCOPY', 'Endoscopy', 'Natural Orifice Luminal', 'Upper and lower gastrointestinal endoscopy'),
    ('50000000-0000-0000-0000-000000000003', 'FAM_EXCISION', 'Excision / Resection', 'Open / Direct', 'Surgical removal of mass, lesion, or organ'),
    ('50000000-0000-0000-0000-000000000004', 'FAM_REPAIR', 'Repair / Reconstruction', 'Open / Minimally Invasive', 'Tendon, ligament, hernia, or structural repair'),
    ('50000000-0000-0000-0000-000000000005', 'FAM_ARTHROPLASTY', 'Arthroplasty / Joint Replacement', 'Open', 'Total or partial joint replacement or revision'),
    ('50000000-0000-0000-0000-000000000006', 'FAM_INJECTION', 'Injection / Nerve Block', 'Percutaneous', 'Therapeutic and diagnostic joint or spinal injections'),
    ('50000000-0000-0000-0000-000000000007', 'FAM_BIOPSY', 'Biopsy', 'Percutaneous / Open', 'Tissue sampling for pathological examination')
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    surgical_approach = EXCLUDED.surgical_approach,
    description = EXCLUDED.description,
    updated_at = NOW();

-- ==============================================================================
-- 9. INITIAL BACKFILL: MAP EXISTING CPT MASTER TO CLINICAL TAXONOMY
-- ==============================================================================

INSERT INTO public.cpt_clinical_mappings (
    cpt_master_id,
    specialty_id,
    body_system_id,
    body_part_id,
    organ_id,
    procedure_family_id,
    is_primary,
    review_status,
    confidence_score,
    mapping_source
)
SELECT DISTINCT ON (m.id)
    m.id AS cpt_master_id,
    COALESCE(spec.id, '10000000-0000-0000-0000-000000000010'::UUID) AS specialty_id,
    COALESCE(bs.id, '20000000-0000-0000-0000-000000000009'::UUID) AS body_system_id,
    COALESCE(bp.id, '30000000-0000-0000-0000-000000000019'::UUID) AS body_part_id,
    NULL::UUID AS organ_id,
    NULL::UUID AS procedure_family_id,
    true AS is_primary,
    'verified' AS review_status,
    1.00 AS confidence_score,
    'legacy_import' AS mapping_source
FROM public.cpt_master m
LEFT JOIN public.clinical_specialties spec ON 
    (m.specialty ILIKE '%' || spec.name || '%' OR spec.name ILIKE '%' || m.specialty || '%')
LEFT JOIN public.body_parts bp ON 
    (m.body_part ILIKE '%' || bp.name || '%' OR bp.name ILIKE '%' || m.body_part || '%')
LEFT JOIN public.body_systems bs ON bp.body_system_id = bs.id
WHERE m.is_active = true
ON CONFLICT DO NOTHING;

-- ==============================================================================
-- 10. AUTHORITATIVE CLINICAL RESOLUTION STORED PROCEDURE
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_resolve_cpt_clinical_taxonomy(
    p_code VARCHAR(10),
    p_facility_id UUID DEFAULT NULL
)
RETURNS TABLE (
    cpt_code VARCHAR(10),
    description TEXT,
    specialty_code VARCHAR(50),
    specialty_name VARCHAR(100),
    body_system_code VARCHAR(50),
    body_system_name VARCHAR(100),
    body_part_code VARCHAR(50),
    body_part_name VARCHAR(100),
    organ_code VARCHAR(50),
    organ_name VARCHAR(100),
    laterality_applicable BOOLEAN,
    procedure_family_name VARCHAR(100),
    review_status VARCHAR(20),
    confidence_score NUMERIC(3, 2),
    mapping_source VARCHAR(30),
    is_facility_override BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_code VARCHAR(10) := UPPER(TRIM(p_code));
BEGIN
    RETURN QUERY
    SELECT 
        m.code,
        m.description,
        s.code AS specialty_code,
        s.name AS specialty_name,
        bs.code AS body_system_code,
        bs.name AS body_system_name,
        bp.code AS body_part_code,
        bp.name AS body_part_name,
        org.code AS organ_code,
        org.name AS organ_name,
        bp.laterality_applicable,
        pf.name AS procedure_family_name,
        map.review_status,
        map.confidence_score,
        map.mapping_source,
        (map.facility_id IS NOT NULL) AS is_facility_override
    FROM public.cpt_master m
    JOIN public.cpt_clinical_mappings map ON map.cpt_master_id = m.id
    JOIN public.clinical_specialties s ON map.specialty_id = s.id
    JOIN public.body_systems bs ON map.body_system_id = bs.id
    JOIN public.body_parts bp ON map.body_part_id = bp.id
    LEFT JOIN public.anatomical_organs org ON map.organ_id = org.id
    LEFT JOIN public.procedure_families pf ON map.procedure_family_id = pf.id
    WHERE m.code = v_code
      AND (p_facility_id IS NULL OR map.facility_id IS NULL OR map.facility_id = p_facility_id)
      AND (map.termination_date IS NULL OR map.termination_date >= CURRENT_DATE)
    ORDER BY map.facility_id NULLS LAST, map.is_primary DESC, map.confidence_score DESC
    LIMIT 1;
END;
$$;

-- ==============================================================================
-- 11. RLS POLICIES & SECURITY
-- ==============================================================================

ALTER TABLE public.clinical_specialties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.body_systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.body_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anatomical_organs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procedure_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpt_clinical_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpt_mapping_reviews ENABLE ROW LEVEL SECURITY;

-- Read policies: Global readable by all authenticated users
CREATE POLICY rls_spec_select ON public.clinical_specialties FOR SELECT TO authenticated USING (true);
CREATE POLICY rls_bs_select ON public.body_systems FOR SELECT TO authenticated USING (true);
CREATE POLICY rls_bp_select ON public.body_parts FOR SELECT TO authenticated USING (true);
CREATE POLICY rls_org_select ON public.anatomical_organs FOR SELECT TO authenticated USING (true);
CREATE POLICY rls_pf_select ON public.procedure_families FOR SELECT TO authenticated USING (true);
CREATE POLICY rls_cm_select ON public.cpt_clinical_mappings FOR SELECT TO authenticated USING (true);
CREATE POLICY rls_cmr_select ON public.cpt_mapping_reviews FOR SELECT TO authenticated USING (true);

-- Write policies: Restricted to super_admin, facility_admin, or service_role
CREATE POLICY rls_cm_modify ON public.cpt_clinical_mappings
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.facility_memberships fm 
            WHERE fm.user_id = auth.uid() AND fm.role IN ('super_admin', 'facility_admin') AND fm.is_active = true
        )
        OR EXISTS (
            SELECT 1 FROM public.users u 
            WHERE u.id::text = auth.uid()::text AND u.role IN ('super_admin', 'admin')
        )
        OR (auth.jwt()->>'role') = 'service_role'
    );

CREATE POLICY rls_cmr_modify ON public.cpt_mapping_reviews
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.facility_memberships fm 
            WHERE fm.user_id = auth.uid() AND fm.role IN ('super_admin', 'facility_admin') AND fm.is_active = true
        )
        OR EXISTS (
            SELECT 1 FROM public.users u 
            WHERE u.id::text = auth.uid()::text AND u.role IN ('super_admin', 'admin')
        )
        OR (auth.jwt()->>'role') = 'service_role'
    );

-- ==============================================================================
-- 12. REFRESH BACKWARD COMPATIBILITY VIEW
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
    m.body_part,
    cs.name AS specialty_name,
    bs.name AS body_system_name,
    bp.name AS body_part_name,
    org.name AS organ_name,
    pf.name AS procedure_family_name
FROM public.cpt_code_versions v
JOIN public.cpt_master m ON v.cpt_master_id = m.id
LEFT JOIN public.cpt_clinical_mappings ccm ON ccm.cpt_master_id = m.id AND ccm.is_primary = true
LEFT JOIN public.clinical_specialties cs ON ccm.specialty_id = cs.id
LEFT JOIN public.body_systems bs ON ccm.body_system_id = bs.id
LEFT JOIN public.body_parts bp ON ccm.body_part_id = bp.id
LEFT JOIN public.anatomical_organs org ON ccm.organ_id = org.id
LEFT JOIN public.procedure_families pf ON ccm.procedure_family_id = pf.id;

COMMIT;
