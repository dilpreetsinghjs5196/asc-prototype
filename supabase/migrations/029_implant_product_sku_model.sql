-- ==============================================================================
-- MIGRATION: 029_implant_product_sku_model.sql
-- DESCRIPTION: Phase 54 Implant Product SKU Model, Product Families,
--              Master Catalog Items, UDI-DI, and Distributor Cross-References.
-- PLATFORM: Supabase PostgreSQL 15+
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. TABLE: public.implant_product_families
-- Brand lines and product family constructs (e.g. Triathlon Knee, Polaris Spine)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.implant_product_families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE, -- NULL = Global Network Baseline, Set = Facility Custom
    vendor_id UUID NOT NULL REFERENCES public.implant_vendors(id) ON DELETE RESTRICT,
    family_code VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    specialty VARCHAR(50) NOT NULL,
    description TEXT,
    fda_clearance_pma_number VARCHAR(50),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_family_code_format CHECK (family_code ~ '^[A-Z0-9_\-]+$'),
    CONSTRAINT chk_family_name_not_empty CHECK (TRIM(name) != '')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_family_code 
    ON public.implant_product_families (vendor_id, facility_id, (UPPER(TRIM(family_code)))) 
    NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_ipf_vendor ON public.implant_product_families(vendor_id);
CREATE INDEX IF NOT EXISTS idx_ipf_specialty ON public.implant_product_families(specialty);
CREATE INDEX IF NOT EXISTS idx_ipf_facility ON public.implant_product_families(facility_id);
CREATE INDEX IF NOT EXISTS idx_ipf_active ON public.implant_product_families(is_active) WHERE is_active = TRUE;

-- ==============================================================================
-- 2. TABLE: public.implant_product_skus
-- Master catalog table for granular physical implant items & UDI-DI specifications
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.implant_product_skus (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE, -- NULL = Global Master, Set = Facility Custom
    vendor_id UUID NOT NULL REFERENCES public.implant_vendors(id) ON DELETE RESTRICT,
    family_id UUID REFERENCES public.implant_product_families(id) ON DELETE RESTRICT,
    component_id UUID NOT NULL REFERENCES public.implant_components(id) ON DELETE RESTRICT,
    
    -- Identification Numbers
    catalog_number VARCHAR(100) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    internal_sku VARCHAR(100),
    description TEXT,
    
    -- Regulatory & Coding Attributes
    udi_di VARCHAR(100), -- FDA UDI Device Identifier (GS1 GTIN-14 / HIBCC)
    fda_gudid_listing_id VARCHAR(100),
    hcpcs_c_code VARCHAR(10), -- CMS Device Pass-Through Code (e.g. C1776, C1713)
    secondary_hcpcs_code VARCHAR(10),
    
    -- Clinical & Physical Specifications
    sterile_packaging VARCHAR(30) NOT NULL DEFAULT 'STERILE_PACKAGED'
        CHECK (sterile_packaging IN ('STERILE_PACKAGED', 'NON_STERILE_TRAY_REUSABLE', 'LOOSE_STERILIZED')),
    laterality VARCHAR(20) NOT NULL DEFAULT 'NOT_APPLICABLE'
        CHECK (laterality IN ('LEFT', 'RIGHT', 'BILATERAL', 'NOT_APPLICABLE')),
    material_composition VARCHAR(50) NOT NULL DEFAULT 'TITANIUM'
        CHECK (material_composition IN (
            'TITANIUM', 'TITANIUM_ALLOY', 'COBALT_CHROME', 'STAINLESS_STEEL',
            'CERAMIC', 'PEEK', 'UHMWPE', 'HYDROPHILIC_ACRYLIC', 'HYDROPHOBIC_ACRYLIC',
            'SILICONE', 'BIOLOGIC_ALLOGRAFT', 'TISSUE_COLLAGEN', 'RESORBABLE_POLYMER', 'OTHER'
        )),
    size_dimension VARCHAR(100),
    duration_classification VARCHAR(30) NOT NULL DEFAULT 'PERMANENT'
        CHECK (duration_classification IN ('PERMANENT', 'TEMPORARY', 'EXCHANGEABLE', 'ABSORBABLE', 'REMOVABLE')),
    mri_safety_status VARCHAR(50) NOT NULL DEFAULT 'MR_CONDITIONAL'
        CHECK (mri_safety_status IN ('MR_SAFE', 'MR_CONDITIONAL', 'MR_UNSAFE', 'NOT_EVALUATED')),
    latex_free BOOLEAN NOT NULL DEFAULT TRUE,
    biological_tissue BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Tracking Requirements
    requires_lot_tracking BOOLEAN NOT NULL DEFAULT TRUE,
    requires_serial_tracking BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Financial Baseline
    list_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (list_price >= 0.00),
    unit_of_measure VARCHAR(20) NOT NULL DEFAULT 'EA' CHECK (unit_of_measure IN ('EA', 'KIT', 'BOX', 'SET', 'PAIR')),
    
    -- Lifecycle Governance
    status VARCHAR(30) NOT NULL DEFAULT 'active'
        CHECK (status IN ('draft', 'pending_verification', 'active', 'inactive', 'discontinued', 'recalled')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Recall Governance
    recall_class VARCHAR(20) DEFAULT NULL CHECK (recall_class IN (NULL, 'CLASS_I', 'CLASS_II', 'CLASS_III')),
    recall_date DATE DEFAULT NULL,
    recall_reason TEXT DEFAULT NULL,
    
    -- Provenance & Auditing
    source_system VARCHAR(50) NOT NULL DEFAULT 'manual_entry'
        CHECK (source_system IN ('fda_gudid', 'manufacturer_catalog', 'ghx_edi', 'manual_entry', 'legacy_import')),
    verification_status VARCHAR(30) NOT NULL DEFAULT 'verified'
        CHECK (verification_status IN ('draft', 'pending_review', 'verified', 'disputed')),
    import_batch_id UUID DEFAULT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Invariants
    CONSTRAINT chk_catalog_number_not_empty CHECK (TRIM(catalog_number) != ''),
    CONSTRAINT chk_product_name_not_empty CHECK (TRIM(product_name) != ''),
    CONSTRAINT chk_sku_active_sync CHECK (is_active = (status = 'active')),
    CONSTRAINT chk_sku_recall_metadata CHECK (
        (status = 'recalled' AND recall_class IS NOT NULL AND recall_date IS NOT NULL) OR
        (status != 'recalled' AND recall_class IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sku_vendor_catalog 
    ON public.implant_product_skus (vendor_id, facility_id, (UPPER(TRIM(catalog_number)))) 
    NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_ips_vendor ON public.implant_product_skus(vendor_id);
CREATE INDEX IF NOT EXISTS idx_ips_component ON public.implant_product_skus(component_id);
CREATE INDEX IF NOT EXISTS idx_ips_family ON public.implant_product_skus(family_id);
CREATE INDEX IF NOT EXISTS idx_ips_facility ON public.implant_product_skus(facility_id);
CREATE INDEX IF NOT EXISTS idx_ips_catalog ON public.implant_product_skus(catalog_number);
CREATE INDEX IF NOT EXISTS idx_ips_udi ON public.implant_product_skus(udi_di);
CREATE INDEX IF NOT EXISTS idx_ips_hcpcs ON public.implant_product_skus(hcpcs_c_code);
CREATE INDEX IF NOT EXISTS idx_ips_status ON public.implant_product_skus(status);
CREATE INDEX IF NOT EXISTS idx_ips_active ON public.implant_product_skus(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_ips_name_trgm ON public.implant_product_skus USING gin (LOWER(product_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_ips_catalog_trgm ON public.implant_product_skus USING gin (LOWER(catalog_number) gin_trgm_ops);

-- ==============================================================================
-- 3. TABLE: public.implant_sku_distributor_mappings
-- Cross-references 3rd-party logistics distributor item numbers to OEM SKUs
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.implant_sku_distributor_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE,
    sku_id UUID NOT NULL REFERENCES public.implant_product_skus(id) ON DELETE RESTRICT,
    distributor_id UUID NOT NULL REFERENCES public.implant_vendors(id) ON DELETE RESTRICT,
    distributor_item_number VARCHAR(100) NOT NULL,
    package_unit VARCHAR(30) NOT NULL DEFAULT 'EA' CHECK (package_unit IN ('EA', 'BOX_1', 'BOX_5', 'BOX_10', 'CASE')),
    units_per_package INTEGER NOT NULL DEFAULT 1 CHECK (units_per_package >= 1),
    is_preferred_distributor BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'deprecated')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_distributor_item_not_empty CHECK (TRIM(distributor_item_number) != '')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_distributor_sku_mapping 
    ON public.implant_sku_distributor_mappings (distributor_id, facility_id, (UPPER(TRIM(distributor_item_number)))) 
    NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_isdm_sku ON public.implant_sku_distributor_mappings(sku_id);
CREATE INDEX IF NOT EXISTS idx_isdm_distributor ON public.implant_sku_distributor_mappings(distributor_id);
CREATE INDEX IF NOT EXISTS idx_isdm_item_no ON public.implant_sku_distributor_mappings(distributor_item_number);

-- ==============================================================================
-- 4. LINK FOREIGN KEY CONSTRAINT FROM case_devices TO implant_product_skus
-- ==============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'case_devices' AND column_name = 'sku_id'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_schema = 'public' AND constraint_name = 'fk_case_devices_sku_id'
        ) THEN
            ALTER TABLE public.case_devices
                ADD CONSTRAINT fk_case_devices_sku_id
                FOREIGN KEY (sku_id) REFERENCES public.implant_product_skus(id) ON DELETE RESTRICT;
        END IF;
    END IF;
END $$;

-- ==============================================================================
-- 5. TRIGGERS & PROCEDURAL GUARDS
-- ==============================================================================

-- 5.1 Updated_at triggers
DROP TRIGGER IF EXISTS trg_touch_implant_product_families ON public.implant_product_families;
CREATE TRIGGER trg_touch_implant_product_families
    BEFORE UPDATE ON public.implant_product_families
    FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_implant_product_skus ON public.implant_product_skus;
CREATE TRIGGER trg_touch_implant_product_skus
    BEFORE UPDATE ON public.implant_product_skus
    FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_implant_sku_distributor_mappings ON public.implant_sku_distributor_mappings;
CREATE TRIGGER trg_touch_implant_sku_distributor_mappings
    BEFORE UPDATE ON public.implant_sku_distributor_mappings
    FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

-- 5.2 Prevent active SKU hard delete
CREATE OR REPLACE FUNCTION public.fn_prevent_active_sku_hard_delete()
RETURNS TRIGGER AS $$
DECLARE
    v_usage_count INTEGER := 0;
BEGIN
    IF OLD.is_active = TRUE THEN
        RAISE EXCEPTION 'Cannot hard delete active product SKU (ID: %, Catalog: %). Set status to inactive or discontinued instead.', OLD.id, OLD.catalog_number;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'case_devices') THEN
        SELECT COUNT(*) INTO v_usage_count
        FROM public.case_devices
        WHERE sku_id = OLD.id;

        IF v_usage_count > 0 THEN
            RAISE EXCEPTION 'Cannot delete product SKU referenced by % surgical case device records.', v_usage_count;
        END IF;
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_active_sku_delete ON public.implant_product_skus;
CREATE TRIGGER trg_prevent_active_sku_delete
    BEFORE DELETE ON public.implant_product_skus
    FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_active_sku_hard_delete();

-- 5.3 Prevent Cross-Facility Relocation
CREATE OR REPLACE FUNCTION public.fn_prevent_facility_relocation_implant_skus()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.facility_id IS DISTINCT FROM OLD.facility_id THEN
        IF auth.uid() IS NOT NULL AND NOT public.user_has_facility_role(NULL, ARRAY['super_admin', 'org_admin']) THEN
            RAISE EXCEPTION 'Cross-facility relocation of product SKU records is forbidden. facility_id is immutable for non-enterprise administrators.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_facility_relocation_implant_skus ON public.implant_product_skus;
CREATE TRIGGER trg_prevent_facility_relocation_implant_skus
    BEFORE UPDATE ON public.implant_product_skus
    FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_facility_relocation_implant_skus();

-- ==============================================================================
-- 6. AUTHORITATIVE STORED PROCEDURES (RPCs)
-- ==============================================================================

-- 6.1 Create or Update SKU
CREATE OR REPLACE FUNCTION public.fn_create_or_update_sku(
    p_sku_id UUID DEFAULT NULL,
    p_facility_id UUID DEFAULT NULL,
    p_vendor_id UUID DEFAULT NULL,
    p_family_id UUID DEFAULT NULL,
    p_component_id UUID DEFAULT NULL,
    p_catalog_number VARCHAR(100) DEFAULT NULL,
    p_product_name VARCHAR(255) DEFAULT NULL,
    p_internal_sku VARCHAR(100) DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_udi_di VARCHAR(100) DEFAULT NULL,
    p_hcpcs_c_code VARCHAR(10) DEFAULT NULL,
    p_secondary_hcpcs_code VARCHAR(10) DEFAULT NULL,
    p_sterile_packaging VARCHAR(30) DEFAULT 'STERILE_PACKAGED',
    p_laterality VARCHAR(20) DEFAULT 'NOT_APPLICABLE',
    p_material_composition VARCHAR(50) DEFAULT 'TITANIUM',
    p_size_dimension VARCHAR(100) DEFAULT NULL,
    p_duration_classification VARCHAR(30) DEFAULT 'PERMANENT',
    p_mri_safety_status VARCHAR(50) DEFAULT 'MR_CONDITIONAL',
    p_latex_free BOOLEAN DEFAULT TRUE,
    p_list_price NUMERIC(12, 2) DEFAULT 0.00,
    p_unit_of_measure VARCHAR(20) DEFAULT 'EA'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID;
    v_result_id UUID;
    v_conflict_count INTEGER;
BEGIN
    v_actor_id := auth.uid();

    IF p_vendor_id IS NULL THEN
        RAISE EXCEPTION 'VALIDATION ERROR: Manufacturer vendor_id is required.';
    END IF;

    IF p_component_id IS NULL THEN
        RAISE EXCEPTION 'VALIDATION ERROR: Clinical component_id is required.';
    END IF;

    IF p_catalog_number IS NULL OR TRIM(p_catalog_number) = '' THEN
        RAISE EXCEPTION 'VALIDATION ERROR: Manufacturer catalog number is required.';
    END IF;

    IF p_product_name IS NULL OR TRIM(p_product_name) = '' THEN
        RAISE EXCEPTION 'VALIDATION ERROR: Product name is required.';
    END IF;

    -- Check for duplicate catalog number under same vendor in this scope
    SELECT COUNT(*) INTO v_conflict_count
    FROM public.implant_product_skus
    WHERE vendor_id = p_vendor_id
      AND UPPER(TRIM(catalog_number)) = UPPER(TRIM(p_catalog_number))
      AND (
          (p_facility_id IS NULL AND facility_id IS NULL)
          OR (p_facility_id IS NOT NULL AND facility_id = p_facility_id)
      )
      AND (p_sku_id IS NULL OR id != p_sku_id);

    IF v_conflict_count > 0 THEN
        RAISE EXCEPTION 'CONFLICT: Catalog number "%" already exists for this manufacturer.', p_catalog_number;
    END IF;

    IF p_sku_id IS NULL THEN
        INSERT INTO public.implant_product_skus (
            facility_id, vendor_id, family_id, component_id,
            catalog_number, product_name, internal_sku, description,
            udi_di, hcpcs_c_code, secondary_hcpcs_code,
            sterile_packaging, laterality, material_composition,
            size_dimension, duration_classification, mri_safety_status,
            latex_free, list_price, unit_of_measure,
            status, is_active, created_by, updated_by
        ) VALUES (
            p_facility_id, p_vendor_id, p_family_id, p_component_id,
            TRIM(p_catalog_number), TRIM(p_product_name), TRIM(p_internal_sku), TRIM(p_description),
            TRIM(p_udi_di), UPPER(TRIM(p_hcpcs_c_code)), UPPER(TRIM(p_secondary_hcpcs_code)),
            p_sterile_packaging, p_laterality, p_material_composition,
            TRIM(p_size_dimension), p_duration_classification, p_mri_safety_status,
            p_latex_free, COALESCE(p_list_price, 0.00), p_unit_of_measure,
            'active', TRUE, v_actor_id, v_actor_id
        ) RETURNING id INTO v_result_id;
    ELSE
        UPDATE public.implant_product_skus SET
            family_id = p_family_id,
            component_id = p_component_id,
            catalog_number = TRIM(p_catalog_number),
            product_name = TRIM(p_product_name),
            internal_sku = TRIM(p_internal_sku),
            description = TRIM(p_description),
            udi_di = TRIM(p_udi_di),
            hcpcs_c_code = UPPER(TRIM(p_hcpcs_c_code)),
            secondary_hcpcs_code = UPPER(TRIM(p_secondary_hcpcs_code)),
            sterile_packaging = p_sterile_packaging,
            laterality = p_laterality,
            material_composition = p_material_composition,
            size_dimension = TRIM(p_size_dimension),
            duration_classification = p_duration_classification,
            mri_safety_status = p_mri_safety_status,
            latex_free = p_latex_free,
            list_price = COALESCE(p_list_price, 0.00),
            unit_of_measure = p_unit_of_measure,
            updated_by = v_actor_id,
            updated_at = NOW()
        WHERE id = p_sku_id
        RETURNING id INTO v_result_id;
    END IF;

    RETURN jsonb_build_object('success', TRUE, 'sku_id', v_result_id);
END;
$$;

-- 6.2 Flag Safety Recall
CREATE OR REPLACE FUNCTION public.fn_flag_sku_recall(
    p_sku_id UUID,
    p_recall_class VARCHAR(20),
    p_recall_date DATE,
    p_recall_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID;
    v_impacted_cases INTEGER := 0;
BEGIN
    v_actor_id := auth.uid();

    IF NOT EXISTS (SELECT 1 FROM public.implant_product_skus WHERE id = p_sku_id) THEN
        RAISE EXCEPTION 'NOT FOUND: Product SKU does not exist.';
    END IF;

    IF p_recall_class NOT IN ('CLASS_I', 'CLASS_II', 'CLASS_III') THEN
        RAISE EXCEPTION 'VALIDATION ERROR: Recall class must be CLASS_I, CLASS_II, or CLASS_III.';
    END IF;

    IF p_recall_date IS NULL THEN
        RAISE EXCEPTION 'VALIDATION ERROR: Official recall date is required.';
    END IF;

    IF p_recall_reason IS NULL OR TRIM(p_recall_reason) = '' THEN
        RAISE EXCEPTION 'VALIDATION ERROR: Recall regulatory reason is required.';
    END IF;

    -- Count impacted cases
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'case_devices') THEN
        SELECT COUNT(DISTINCT surgery_id) INTO v_impacted_cases
        FROM public.case_devices
        WHERE sku_id = p_sku_id;
    END IF;

    UPDATE public.implant_product_skus
    SET status = 'recalled',
        is_active = FALSE,
        recall_class = p_recall_class,
        recall_date = p_recall_date,
        recall_reason = TRIM(p_recall_reason),
        updated_by = v_actor_id,
        updated_at = NOW()
    WHERE id = p_sku_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'sku_id', p_sku_id,
        'status', 'recalled',
        'impacted_cases_count', v_impacted_cases
    );
END;
$$;

-- 6.3 Deactivate SKU
CREATE OR REPLACE FUNCTION public.fn_deactivate_implant_sku(
    p_sku_id UUID,
    p_rationale TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID;
BEGIN
    v_actor_id := auth.uid();

    IF NOT EXISTS (SELECT 1 FROM public.implant_product_skus WHERE id = p_sku_id) THEN
        RAISE EXCEPTION 'NOT FOUND: Product SKU does not exist.';
    END IF;

    IF p_rationale IS NULL OR TRIM(p_rationale) = '' THEN
        RAISE EXCEPTION 'VALIDATION ERROR: Deactivation rationale is required.';
    END IF;

    UPDATE public.implant_product_skus
    SET status = 'inactive',
        is_active = FALSE,
        description = COALESCE(description || E'\n', '') || 'Deactivation Rationale (' || NOW()::DATE || '): ' || TRIM(p_rationale),
        updated_by = v_actor_id,
        updated_at = NOW()
    WHERE id = p_sku_id;

    RETURN jsonb_build_object('success', TRUE, 'sku_id', p_sku_id, 'status', 'inactive');
END;
$$;

-- 6.4 Reactivate SKU
CREATE OR REPLACE FUNCTION public.fn_reactivate_implant_sku(
    p_sku_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID;
BEGIN
    v_actor_id := auth.uid();

    IF NOT EXISTS (SELECT 1 FROM public.implant_product_skus WHERE id = p_sku_id) THEN
        RAISE EXCEPTION 'NOT FOUND: Product SKU does not exist.';
    END IF;

    UPDATE public.implant_product_skus
    SET status = 'active',
        is_active = TRUE,
        recall_class = NULL,
        recall_date = NULL,
        recall_reason = NULL,
        updated_by = v_actor_id,
        updated_at = NOW()
    WHERE id = p_sku_id;

    RETURN jsonb_build_object('success', TRUE, 'sku_id', p_sku_id, 'status', 'active');
END;
$$;

-- Grant execution permissions on authoritative stored procedures
GRANT EXECUTE ON FUNCTION public.fn_create_or_update_sku(UUID, UUID, UUID, UUID, UUID, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, BOOLEAN, NUMERIC, VARCHAR) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.fn_flag_sku_recall(UUID, VARCHAR, DATE, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.fn_deactivate_implant_sku(UUID, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.fn_reactivate_implant_sku(UUID) TO authenticated, anon;

-- ==============================================================================
-- 7. ROW-LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.implant_product_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.implant_product_skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.implant_sku_distributor_mappings ENABLE ROW LEVEL SECURITY;

-- 7.1 implant_product_families policies
DROP POLICY IF EXISTS "implant_product_families_select" ON public.implant_product_families;
CREATE POLICY "implant_product_families_select" ON public.implant_product_families
    FOR SELECT TO authenticated, anon
    USING (
        facility_id IS NULL OR
        facility_id IN (SELECT public.get_auth_user_facilities()) OR
        auth.uid() IS NULL
    );

DROP POLICY IF EXISTS "implant_product_families_modify" ON public.implant_product_families;
CREATE POLICY "implant_product_families_modify" ON public.implant_product_families
    FOR ALL TO authenticated, anon
    USING (
        auth.uid() IS NULL OR
        (facility_id IS NULL AND public.user_has_facility_role(NULL, ARRAY['super_admin'])) OR
        (
            facility_id IS NOT NULL AND
            facility_id IN (SELECT public.get_auth_user_facilities()) AND
            public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo'])
        )
    );

-- 7.2 implant_product_skus policies
DROP POLICY IF EXISTS "implant_product_skus_select" ON public.implant_product_skus;
CREATE POLICY "implant_product_skus_select" ON public.implant_product_skus
    FOR SELECT TO authenticated, anon
    USING (
        facility_id IS NULL OR
        facility_id IN (SELECT public.get_auth_user_facilities()) OR
        auth.uid() IS NULL
    );

DROP POLICY IF EXISTS "implant_product_skus_modify" ON public.implant_product_skus;
CREATE POLICY "implant_product_skus_modify" ON public.implant_product_skus
    FOR ALL TO authenticated, anon
    USING (
        auth.uid() IS NULL OR
        (facility_id IS NULL AND public.user_has_facility_role(NULL, ARRAY['super_admin'])) OR
        (
            facility_id IS NOT NULL AND
            facility_id IN (SELECT public.get_auth_user_facilities()) AND
            public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'clinical_director'])
        )
    );

-- 7.3 implant_sku_distributor_mappings policies
DROP POLICY IF EXISTS "implant_sku_distributor_mappings_select" ON public.implant_sku_distributor_mappings;
CREATE POLICY "implant_sku_distributor_mappings_select" ON public.implant_sku_distributor_mappings
    FOR SELECT TO authenticated, anon
    USING (
        facility_id IS NULL OR
        facility_id IN (SELECT public.get_auth_user_facilities()) OR
        auth.uid() IS NULL
    );

DROP POLICY IF EXISTS "implant_sku_distributor_mappings_modify" ON public.implant_sku_distributor_mappings;
CREATE POLICY "implant_sku_distributor_mappings_modify" ON public.implant_sku_distributor_mappings
    FOR ALL TO authenticated, anon
    USING (
        auth.uid() IS NULL OR
        (facility_id IS NULL AND public.user_has_facility_role(NULL, ARRAY['super_admin'])) OR
        (
            facility_id IS NOT NULL AND
            facility_id IN (SELECT public.get_auth_user_facilities()) AND
            public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo'])
        )
    );

-- ==============================================================================
-- 8. SEED GLOBAL MASTER CATALOG ITEMS (OEM SKUs & DISTRIBUTOR MAPPINGS)
-- ==============================================================================

-- 8.1 Seed Product Families
INSERT INTO public.implant_product_families (
    id, facility_id, vendor_id, family_code, name, specialty, description, is_active
)
SELECT 
    '00000000-0000-0000-0054-000000000001'::UUID, NULL, v.id, 'TRIATHLON_KNEE', 'Triathlon Total Knee System', 'Orthopedics', 'Single-radius total knee arthroplasty platform', TRUE
FROM public.implant_vendors v WHERE v.vendor_code = 'STRYKER' AND v.facility_id IS NULL
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.implant_product_families (
    id, facility_id, vendor_id, family_code, name, specialty, description, is_active
)
SELECT 
    '00000000-0000-0000-0054-000000000002'::UUID, NULL, v.id, 'PERSONA_KNEE', 'Persona The Personalized Knee', 'Orthopedics', 'Anatomically contoured total knee reconstruction system', TRUE
FROM public.implant_vendors v WHERE v.vendor_code = 'ZIMMER_BIOMET' AND v.facility_id IS NULL
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.implant_product_families (
    id, facility_id, vendor_id, family_code, name, specialty, description, is_active
)
SELECT 
    '00000000-0000-0000-0054-000000000003'::UUID, NULL, v.id, 'POLARIS_SPINE', 'Polaris 5.5 Spinal System', 'Spine', 'Universal pedicle screw fixation for thoracolumbar spine', TRUE
FROM public.implant_vendors v WHERE v.vendor_code = 'MEDTRONIC' AND v.facility_id IS NULL
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.implant_product_families (
    id, facility_id, vendor_id, family_code, name, specialty, description, is_active
)
SELECT 
    '00000000-0000-0000-0054-000000000004'::UUID, NULL, v.id, 'ACRYSOF_IQ', 'AcrySof IQ IOL Platform', 'Ophthalmology', 'Aspheric hydrophobic acrylic intraocular lens platform', TRUE
FROM public.implant_vendors v WHERE v.vendor_code = 'ALCON' AND v.facility_id IS NULL
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- 8.2 Seed Granular Product SKUs
-- Item 1: Stryker Triathlon Femoral #4 Left
INSERT INTO public.implant_product_skus (
    id, facility_id, vendor_id, family_id, component_id,
    catalog_number, product_name, internal_sku, description,
    udi_di, hcpcs_c_code, sterile_packaging, laterality, material_composition,
    size_dimension, duration_classification, mri_safety_status, list_price, status, is_active
)
SELECT 
    '00000000-0000-0000-0054-000000000101'::UUID, NULL, v.id, 
    '00000000-0000-0000-0054-000000000001'::UUID, c.id,
    '5520-F-401', 'Triathlon CoCr Femoral Component Size 4 Left', 'SKU-STR-TRI-F4L',
    'Single-radius primary total knee femoral resurfacing component',
    '00888888123451', 'C1776', 'STERILE_PACKAGED', 'LEFT', 'COBALT_CHROME',
    'Size 4', 'PERMANENT', 'MR_CONDITIONAL', 2450.00, 'active', TRUE
FROM public.implant_vendors v, public.implant_components c
WHERE v.vendor_code = 'STRYKER' AND v.facility_id IS NULL
  AND c.code = 'KNEE_FEMORAL' AND c.facility_id IS NULL
ON CONFLICT (id) DO UPDATE SET
    product_name = EXCLUDED.product_name, list_price = EXCLUDED.list_price;

-- Item 2: Stryker Triathlon Femoral #4 Right
INSERT INTO public.implant_product_skus (
    id, facility_id, vendor_id, family_id, component_id,
    catalog_number, product_name, internal_sku, description,
    udi_di, hcpcs_c_code, sterile_packaging, laterality, material_composition,
    size_dimension, duration_classification, mri_safety_status, list_price, status, is_active
)
SELECT 
    '00000000-0000-0000-0054-000000000102'::UUID, NULL, v.id, 
    '00000000-0000-0000-0054-000000000001'::UUID, c.id,
    '5520-F-402', 'Triathlon CoCr Femoral Component Size 4 Right', 'SKU-STR-TRI-F4R',
    'Single-radius primary total knee femoral resurfacing component',
    '00888888123468', 'C1776', 'STERILE_PACKAGED', 'RIGHT', 'COBALT_CHROME',
    'Size 4', 'PERMANENT', 'MR_CONDITIONAL', 2450.00, 'active', TRUE
FROM public.implant_vendors v, public.implant_components c
WHERE v.vendor_code = 'STRYKER' AND v.facility_id IS NULL
  AND c.code = 'KNEE_FEMORAL' AND c.facility_id IS NULL
ON CONFLICT (id) DO UPDATE SET
    product_name = EXCLUDED.product_name, list_price = EXCLUDED.list_price;

-- Item 3: Zimmer Biomet Persona Tibial Tray Size E
INSERT INTO public.implant_product_skus (
    id, facility_id, vendor_id, family_id, component_id,
    catalog_number, product_name, internal_sku, description,
    udi_di, hcpcs_c_code, sterile_packaging, laterality, material_composition,
    size_dimension, duration_classification, mri_safety_status, list_price, status, is_active
)
SELECT 
    '00000000-0000-0000-0054-000000000103'::UUID, NULL, v.id, 
    '00000000-0000-0000-0054-000000000002'::UUID, c.id,
    '42-5200-005-01', 'Persona Anatomical Tibial Baseplate Size E Cemented', 'SKU-ZB-PER-TE',
    'Titanium alloy asymmetric anatomical cemented tibial tray',
    '00777777234562', 'C1776', 'STERILE_PACKAGED', 'BILATERAL', 'TITANIUM_ALLOY',
    'Size E', 'PERMANENT', 'MR_CONDITIONAL', 1890.00, 'active', TRUE
FROM public.implant_vendors v, public.implant_components c
WHERE v.vendor_code = 'ZIMMER_BIOMET' AND v.facility_id IS NULL
  AND c.code = 'KNEE_TIBIAL_TRAY' AND c.facility_id IS NULL
ON CONFLICT (id) DO UPDATE SET
    product_name = EXCLUDED.product_name, list_price = EXCLUDED.list_price;

-- Item 4: Medtronic Polaris 5.5 Pedicle Screw 6.5x45mm
INSERT INTO public.implant_product_skus (
    id, facility_id, vendor_id, family_id, component_id,
    catalog_number, product_name, internal_sku, description,
    udi_di, hcpcs_c_code, sterile_packaging, laterality, material_composition,
    size_dimension, duration_classification, mri_safety_status, list_price, status, is_active
)
SELECT 
    '00000000-0000-0000-0054-000000000104'::UUID, NULL, v.id, 
    '00000000-0000-0000-0054-000000000003'::UUID, c.id,
    '0600-65-045', 'Polaris 5.5 Polyaxial Pedicle Screw 6.5mm x 45mm', 'SKU-MDT-POL-6545',
    'Self-tapping titanium polyaxial pedicle screw for posterior lumbar fixation',
    '00666666345673', 'C1713', 'STERILE_PACKAGED', 'NOT_APPLICABLE', 'TITANIUM_ALLOY',
    '6.5mm x 45mm', 'PERMANENT', 'MR_CONDITIONAL', 1150.00, 'active', TRUE
FROM public.implant_vendors v, public.implant_components c
WHERE v.vendor_code = 'MEDTRONIC' AND v.facility_id IS NULL
  AND c.code = 'SPINE_ACDF_SCREW' AND c.facility_id IS NULL
ON CONFLICT (id) DO UPDATE SET
    product_name = EXCLUDED.product_name, list_price = EXCLUDED.list_price;

-- Item 5: Alcon AcrySof IQ Monofocal IOL +21.0D
INSERT INTO public.implant_product_skus (
    id, facility_id, vendor_id, family_id, component_id,
    catalog_number, product_name, internal_sku, description,
    udi_di, hcpcs_c_code, sterile_packaging, laterality, material_composition,
    size_dimension, duration_classification, mri_safety_status, list_price, status, is_active
)
SELECT 
    '00000000-0000-0000-0054-000000000105'::UUID, NULL, v.id, 
    '00000000-0000-0000-0054-000000000004'::UUID, c.id,
    'SN60WF-210', 'AcrySof IQ Aspheric UV Monofocal Intraocular Lens +21.0D', 'SKU-ALC-SN6-210',
    'Hydrophobic acrylic aspheric single-piece foldable posterior chamber IOL',
    '00555555456784', 'L8699', 'STERILE_PACKAGED', 'NOT_APPLICABLE', 'HYDROPHOBIC_ACRYLIC',
    '+21.0 Diopter', 'PERMANENT', 'MR_SAFE', 285.00, 'active', TRUE
FROM public.implant_vendors v, public.implant_components c
WHERE v.vendor_code = 'ALCON' AND v.facility_id IS NULL
  AND c.code = 'IOL_MONOFOCAL' AND c.facility_id IS NULL
ON CONFLICT (id) DO UPDATE SET
    product_name = EXCLUDED.product_name, list_price = EXCLUDED.list_price;

-- 8.3 Seed Distributor Cross-Reference Mappings
-- Map Stryker 5520-F-401 to Cardinal Health item #CH-9411-401
INSERT INTO public.implant_sku_distributor_mappings (
    facility_id, sku_id, distributor_id, distributor_item_number, package_unit, units_per_package, is_preferred_distributor, status
)
SELECT 
    NULL, s.id, d.id, 'CH-9411-401', 'EA', 1, TRUE, 'active'
FROM public.implant_product_skus s, public.implant_vendors d
WHERE s.catalog_number = '5520-F-401' AND d.vendor_code = 'CARDINAL_HEALTH' AND d.facility_id IS NULL
ON CONFLICT DO NOTHING;

-- Map Stryker 5520-F-401 to Medline item #MDL-88310
INSERT INTO public.implant_sku_distributor_mappings (
    facility_id, sku_id, distributor_id, distributor_item_number, package_unit, units_per_package, is_preferred_distributor, status
)
SELECT 
    NULL, s.id, d.id, 'MDL-88310', 'EA', 1, FALSE, 'active'
FROM public.implant_product_skus s, public.implant_vendors d
WHERE s.catalog_number = '5520-F-401' AND d.vendor_code = 'MEDLINE' AND d.facility_id IS NULL
ON CONFLICT DO NOTHING;

-- Map Zimmer Biomet 42-5200-005-01 to Owens & Minor item #OM-77201
INSERT INTO public.implant_sku_distributor_mappings (
    facility_id, sku_id, distributor_id, distributor_item_number, package_unit, units_per_package, is_preferred_distributor, status
)
SELECT 
    NULL, s.id, d.id, 'OM-77201', 'EA', 1, TRUE, 'active'
FROM public.implant_product_skus s, public.implant_vendors d
WHERE s.catalog_number = '42-5200-005-01' AND d.vendor_code = 'OWENS_MINOR' AND d.facility_id IS NULL
ON CONFLICT DO NOTHING;

COMMIT;
