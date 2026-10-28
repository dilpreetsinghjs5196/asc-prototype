-- ==============================================================================
-- CONSOLIDATED MIGRATION: 033_consolidated_implant_phases_54_to_57.sql
-- DESCRIPTION: All-in-one consolidated migration script for Supabase SQL Editor.
--              Installs in exact dependency order:
--                1. Phase 54: Implant Product Families & SKUs (Migration 029)
--                2. Phase 56: Facility Vendor Contracts & Commercial Scopes (Migration 031)
--                3. Phase 57: Facility Implant Pricing, Schedules & Invoices (Migration 032)
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
-- ==============================================================================
-- MIGRATION: 031_facility_vendor_contracts.sql
-- DESCRIPTION: Phase 56 Facility Vendor Contracts, Commercial Terms,
--              Scope Line-Items, Document Attachments, and Lifecycle Governance.
-- PLATFORM: Supabase PostgreSQL 15+
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. TABLE: public.facility_vendor_contracts
-- Master facility-level vendor contract header and commercial terms
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.facility_vendor_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES public.implant_vendors(id) ON DELETE RESTRICT,
    
    -- Identification & Classification
    contract_number VARCHAR(100) NOT NULL,
    contract_name VARCHAR(255) NOT NULL,
    contract_type VARCHAR(50) NOT NULL DEFAULT 'DIRECT_OEM'
        CHECK (contract_type IN (
            'DIRECT_OEM',              -- Direct contract with manufacturer
            'DISTRIBUTOR_CONSIGNMENT', -- Consignment inventory managed via 3PL distributor
            'GPO_TIERED',              -- Tiered pricing agreement via national GPO
            'CUSTOM_LOCAL',            -- Facility-negotiated local custom pricing agreement
            'TRIAL_EVALUATION',        -- Clinical trial / consignment evaluation period
            'CAPITATED_PROCEDURAL'     -- Single-fee comprehensive procedural package
        )),
    
    -- Contract Lifecycle & State Machine
    status VARCHAR(30) NOT NULL DEFAULT 'draft'
        CHECK (status IN (
            'draft',             -- Initial contract formulation by materials manager
            'pending_approval',  -- Submitted for executive / CFO review
            'approved',          -- Formally signed off; waiting for effective_from
            'active',            -- Currently valid and authorizing sourcing & pricing
            'suspended',         -- Temporarily frozen (credit hold, recall, dispute)
            'expired',           -- Passed effective_to without renewal
            'terminated',        -- Cancelled prior to effective_to
            'rejected',          -- Rejected during approval workflow
            'renewed'            -- Replaced by forward renewal contract
        )),
    is_active BOOLEAN NOT NULL DEFAULT FALSE, -- High-speed operational filter (true ONLY when status = 'active')

    -- Temporal Boundaries & Renewal Governance
    effective_from DATE NOT NULL,
    effective_to DATE NOT NULL,
    auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
    renewal_notice_days INTEGER NOT NULL DEFAULT 60 CHECK (renewal_notice_days >= 0),
    auto_renew_term_months INTEGER DEFAULT 12 CHECK (auto_renew_term_months IS NULL OR auto_renew_term_months > 0),
    next_review_date DATE,
    terminated_at TIMESTAMPTZ,
    termination_reason TEXT,
    
    -- GPO & Network Procurement Affiliation
    gpo_affiliation VARCHAR(100), -- e.g. 'Vizient', 'Premier', 'HealthTrust', 'Direct'
    gpo_tier_level VARCHAR(50),   -- e.g. 'Tier 1 Baseline', 'Tier 4 Commitment'
    gpo_contract_reference VARCHAR(100),
    
    -- Commercial Terms & Logistics
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    payment_terms_days INTEGER NOT NULL DEFAULT 30 CHECK (payment_terms_days >= 0),
    prompt_pay_discount_percent NUMERIC(5, 2) DEFAULT 0.00 CHECK (prompt_pay_discount_percent >= 0.00 AND prompt_pay_discount_percent <= 100.00),
    prompt_pay_days INTEGER DEFAULT 10 CHECK (prompt_pay_days IS NULL OR prompt_pay_days >= 0),
    fob_point VARCHAR(30) NOT NULL DEFAULT 'DESTINATION'
        CHECK (fob_point IN ('DESTINATION', 'ORIGIN')),
    freight_terms VARCHAR(30) NOT NULL DEFAULT 'PREPAID'
        CHECK (freight_terms IN ('PREPAID', 'COLLECT', 'ADD_TO_INVOICE', 'THIRD_PARTY')),
    emergency_courier_covered BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Consignment & Logistics Governance
    is_consignment BOOLEAN NOT NULL DEFAULT FALSE,
    consignment_reconciliation_frequency VARCHAR(30) DEFAULT 'MONTHLY'
        CHECK (consignment_reconciliation_frequency IN ('MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'NOT_APPLICABLE')),
    consignment_audit_required BOOLEAN NOT NULL DEFAULT TRUE,
    loaner_set_lead_time_days INTEGER DEFAULT 2 CHECK (loaner_set_lead_time_days IS NULL OR loaner_set_lead_time_days >= 0),
    restocking_fee_percent NUMERIC(5, 2) DEFAULT 0.00 CHECK (restocking_fee_percent >= 0.00 AND restocking_fee_percent <= 100.00),

    -- Financial Commitments & Rebates (Confidential)
    annual_volume_commitment_amount NUMERIC(14, 2) DEFAULT 0.00 CHECK (annual_volume_commitment_amount >= 0.00),
    has_rebate_terms BOOLEAN NOT NULL DEFAULT FALSE,
    rebate_structure_type VARCHAR(50) DEFAULT 'NONE'
        CHECK (rebate_structure_type IN ('NONE', 'FLAT_PERCENT', 'VOLUME_TIERED', 'GROWTH_BASED', 'STANDARDIZATION_REBATE')),
    rebate_percentage NUMERIC(5, 2) DEFAULT 0.00 CHECK (rebate_percentage >= 0.00 AND rebate_percentage <= 100.00),
    rebate_settlement_frequency VARCHAR(30) DEFAULT 'ANNUAL'
        CHECK (rebate_settlement_frequency IN ('MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL')),
    rebate_terms_description TEXT,

    -- Versioning, Amendments & Historical Lineage
    amendment_number INTEGER NOT NULL DEFAULT 0 CHECK (amendment_number >= 0), -- 0 = Base Contract, 1+ = Amendment
    is_current_version BOOLEAN NOT NULL DEFAULT TRUE,
    parent_contract_id UUID REFERENCES public.facility_vendor_contracts(id) ON DELETE SET NULL,
    superseded_by_id UUID REFERENCES public.facility_vendor_contracts(id) ON DELETE SET NULL,
    superseded_at TIMESTAMPTZ,
    amendment_rationale TEXT,

    -- Two-Person Approval Governance (Phase 24 Standards)
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    submitted_at TIMESTAMPTZ,
    rejection_reason TEXT,

    -- Primary Contacts & Representatives
    contract_owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Internal Materials / CFO Lead
    vendor_signatory_name VARCHAR(150),
    vendor_signatory_title VARCHAR(100),
    vendor_rep_name VARCHAR(150),
    vendor_rep_phone VARCHAR(50),
    vendor_rep_email VARCHAR(150),
    
    -- Provenance & Metadata
    source_system VARCHAR(50) NOT NULL DEFAULT 'manual_entry'
        CHECK (source_system IN ('manual_entry', 'ghx_edi', 'erp_sync', 'contract_import', 'legacy_import')),
    notes TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT chk_contract_dates CHECK (effective_to >= effective_from),
    CONSTRAINT chk_contract_active_sync CHECK (is_active = (status = 'active')),
    CONSTRAINT chk_contract_approval_integrity CHECK (
        (status IN ('approved', 'active') AND approved_by IS NOT NULL AND approved_at IS NOT NULL) OR
        (status NOT IN ('approved', 'active'))
    )
);

-- ==============================================================================
-- 2. TABLE: public.facility_vendor_contract_scopes
-- Relational line-item scopes: specialties, components, families, SKUs, carve-outs
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.facility_vendor_contract_scopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES public.facility_vendor_contracts(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    
    -- Scope Type & Target Binding
    scope_type VARCHAR(30) NOT NULL DEFAULT 'ALL_VENDOR_PRODUCTS'
        CHECK (scope_type IN (
            'ALL_VENDOR_PRODUCTS',    -- Covers entire vendor catalog
            'SPECIALTY',              -- Covers an entire clinical specialty (e.g. 'Orthopedics')
            'COMPONENT',              -- Covers all SKUs belonging to a clinical component
            'PRODUCT_FAMILY',         -- Covers a specific product line family
            'SKU_LINE_ITEM'           -- Covers a single itemized product SKU
        )),
    
    -- Foreign Key Target Bindings (Nullability governed by scope_type check)
    specialty VARCHAR(50),
    component_id UUID REFERENCES public.implant_components(id) ON DELETE RESTRICT,
    family_id UUID REFERENCES public.implant_product_families(id) ON DELETE RESTRICT,
    sku_id UUID REFERENCES public.implant_product_skus(id) ON DELETE RESTRICT,
    
    -- Authorized Sourcing Logistics
    authorized_distributor_id UUID REFERENCES public.implant_vendors(id) ON DELETE RESTRICT,
    is_consignment_covered BOOLEAN NOT NULL DEFAULT FALSE,

    -- Inclusion vs. Exclusion Carve-Out
    is_excluded BOOLEAN NOT NULL DEFAULT FALSE, -- TRUE = Carve-out exclusion from parent scope
    exclusion_reason TEXT,

    -- Scope-Level Commercial Terms
    tier_discount_percent NUMERIC(5, 2) DEFAULT 0.00 CHECK (tier_discount_percent >= 0.00 AND tier_discount_percent <= 100.00),
    fixed_procedural_cap_rate NUMERIC(12, 2) DEFAULT NULL CHECK (fixed_procedural_cap_rate IS NULL OR fixed_procedural_cap_rate >= 0.00),
    
    -- Status & Auditing
    status VARCHAR(30) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'suspended', 'terminated')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Structural Integrity Constraints
    CONSTRAINT chk_scope_target_consistency CHECK (
        (scope_type = 'ALL_VENDOR_PRODUCTS' AND specialty IS NULL AND component_id IS NULL AND family_id IS NULL AND sku_id IS NULL) OR
        (scope_type = 'SPECIALTY' AND specialty IS NOT NULL AND component_id IS NULL AND family_id IS NULL AND sku_id IS NULL) OR
        (scope_type = 'COMPONENT' AND component_id IS NOT NULL AND sku_id IS NULL) OR
        (scope_type = 'PRODUCT_FAMILY' AND family_id IS NOT NULL AND sku_id IS NULL) OR
        (scope_type = 'SKU_LINE_ITEM' AND sku_id IS NOT NULL)
    ),
    CONSTRAINT chk_scope_active_sync CHECK (is_active = (status = 'active'))
);

-- ==============================================================================
-- 3. TABLE: public.facility_vendor_contract_documents
-- Contract PDF attachments, BAA agreements, exhibits, and SHA-256 verification
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.facility_vendor_contract_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES public.facility_vendor_contracts(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    
    document_name VARCHAR(255) NOT NULL,
    document_type VARCHAR(50) NOT NULL DEFAULT 'MASTER_AGREEMENT'
        CHECK (document_type IN (
            'MASTER_AGREEMENT',          -- Primary signed bilateral agreement
            'PRICING_SCHEDULE',          -- Exhibit A / Line item acquisition price schedule
            'AMENDMENT',                 -- Formal legal contract modification
            'BAA_AGREEMENT',             -- Business Associate Agreement (HIPAA compliance)
            'CERTIFICATE_OF_INSURANCE',  -- Vendor liability insurance certificate
            'CONSIGNMENT_AGREEMENT',     -- Consignment terms and bailment schedule
            'REBATE_SCHEDULE',           -- Confidential rebate and growth tier agreement
            'TERMINATION_LETTER',        -- Formal contract cancellation notice
            'OTHER'
        )),
    
    -- Supabase Storage Metadata
    storage_bucket VARCHAR(100) NOT NULL DEFAULT 'contract-documents',
    storage_path VARCHAR(500) NOT NULL,
    file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0),
    mime_type VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
    file_sha256 VARCHAR(64) NOT NULL, -- SHA-256 hash for document integrity and provenance
    
    -- Security & Access Classification
    is_confidential BOOLEAN NOT NULL DEFAULT TRUE, -- Restricted to CFO, Admin, Materials Director
    
    -- Effective Dates of Document
    effective_date DATE,
    expiration_date DATE,
    
    uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_document_dates CHECK (expiration_date IS NULL OR expiration_date >= effective_date)
);

-- ==============================================================================
-- 4. LINK FOREIGN KEY FROM case_devices TO facility_vendor_contracts
-- Closes the relational loop from surgical case consumption to master contract
-- ==============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'case_devices' AND column_name = 'contract_id'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_schema = 'public' AND constraint_name = 'fk_case_devices_contract_id'
        ) THEN
            ALTER TABLE public.case_devices
                ADD CONSTRAINT fk_case_devices_contract_id
                FOREIGN KEY (contract_id) REFERENCES public.facility_vendor_contracts(id) ON DELETE RESTRICT;
        END IF;
    END IF;
END $$;

-- ==============================================================================
-- 5. UNIQUE CONSTRAINTS & PERFORMANCE INDEXES
-- ==============================================================================

-- 5.1 Unique contract number and amendment version per facility
CREATE UNIQUE INDEX IF NOT EXISTS uq_facility_contract_version
    ON public.facility_vendor_contracts (facility_id, (UPPER(TRIM(contract_number))), amendment_number);

-- 5.2 Only one current version per contract number at a facility
CREATE UNIQUE INDEX IF NOT EXISTS uq_facility_contract_current_version
    ON public.facility_vendor_contracts (facility_id, (UPPER(TRIM(contract_number))))
    WHERE is_current_version = TRUE;

-- 5.3 Performance & Filtering Indexes
CREATE INDEX IF NOT EXISTS idx_fvc_facility ON public.facility_vendor_contracts(facility_id);
CREATE INDEX IF NOT EXISTS idx_fvc_vendor ON public.facility_vendor_contracts(vendor_id);
CREATE INDEX IF NOT EXISTS idx_fvc_status ON public.facility_vendor_contracts(status);
CREATE INDEX IF NOT EXISTS idx_fvc_active ON public.facility_vendor_contracts(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_fvc_dates ON public.facility_vendor_contracts(effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_fvc_type ON public.facility_vendor_contracts(contract_type);
CREATE INDEX IF NOT EXISTS idx_fvc_parent ON public.facility_vendor_contracts(parent_contract_id);
CREATE INDEX IF NOT EXISTS idx_fvc_owner ON public.facility_vendor_contracts(contract_owner_user_id);

-- Scope Table Indexes
CREATE INDEX IF NOT EXISTS idx_fvcs_contract ON public.facility_vendor_contract_scopes(contract_id);
CREATE INDEX IF NOT EXISTS idx_fvcs_facility ON public.facility_vendor_contract_scopes(facility_id);
CREATE INDEX IF NOT EXISTS idx_fvcs_type ON public.facility_vendor_contract_scopes(scope_type);
CREATE INDEX IF NOT EXISTS idx_fvcs_component ON public.facility_vendor_contract_scopes(component_id) WHERE component_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fvcs_family ON public.facility_vendor_contract_scopes(family_id) WHERE family_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fvcs_sku ON public.facility_vendor_contract_scopes(sku_id) WHERE sku_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fvcs_specialty ON public.facility_vendor_contract_scopes(specialty) WHERE specialty IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fvcs_distributor ON public.facility_vendor_contract_scopes(authorized_distributor_id) WHERE authorized_distributor_id IS NOT NULL;

-- Document Table Indexes
CREATE INDEX IF NOT EXISTS idx_fvcd_contract ON public.facility_vendor_contract_documents(contract_id);
CREATE INDEX IF NOT EXISTS idx_fvcd_facility ON public.facility_vendor_contract_documents(facility_id);
CREATE INDEX IF NOT EXISTS idx_fvcd_type ON public.facility_vendor_contract_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_fvcd_sha ON public.facility_vendor_contract_documents(file_sha256);

-- ==============================================================================
-- 6. TRIGGERS & PROCEDURAL INTEGRITY GUARDS
-- ==============================================================================

-- 6.1 Touch updated_at Triggers
DROP TRIGGER IF EXISTS trg_touch_facility_vendor_contracts ON public.facility_vendor_contracts;
CREATE TRIGGER trg_touch_facility_vendor_contracts
    BEFORE UPDATE ON public.facility_vendor_contracts
    FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_facility_vendor_contract_scopes ON public.facility_vendor_contract_scopes;
CREATE TRIGGER trg_touch_facility_vendor_contract_scopes
    BEFORE UPDATE ON public.facility_vendor_contract_scopes
    FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_facility_vendor_contract_documents ON public.facility_vendor_contract_documents;
CREATE TRIGGER trg_touch_facility_vendor_contract_documents
    BEFORE UPDATE ON public.facility_vendor_contract_documents
    FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

-- 6.2 Hard-Delete Protection Trigger
CREATE OR REPLACE FUNCTION public.fn_prevent_active_contract_delete()
RETURNS TRIGGER AS $$
DECLARE
    v_usage_count INTEGER;
BEGIN
    IF OLD.status IN ('active', 'approved', 'suspended') THEN
        RAISE EXCEPTION 'Cannot hard delete contract % in state %. Mark contract as terminated or expired instead.', OLD.contract_number, OLD.status;
    END IF;

    -- Check if referenced by historical surgical cases in case_devices
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'case_devices') THEN
        SELECT COUNT(*) INTO v_usage_count
        FROM public.case_devices
        WHERE contract_id = OLD.id;

        IF v_usage_count > 0 THEN
            RAISE EXCEPTION 'Cannot hard delete contract % (ID: %): Referenced by % surgical case device records. Historical retention required.',
                OLD.contract_number, OLD.id, v_usage_count;
        END IF;
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_prevent_active_contract_delete ON public.facility_vendor_contracts;
CREATE TRIGGER trg_prevent_active_contract_delete
    BEFORE DELETE ON public.facility_vendor_contracts
    FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_active_contract_delete();

-- 6.3 Cross-Facility Relocation Prevention Trigger
CREATE OR REPLACE FUNCTION public.fn_prevent_facility_relocation_contracts()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.facility_id IS DISTINCT FROM NEW.facility_id THEN
        RAISE EXCEPTION 'Immutable facility context: cannot move contract (ID: %) from facility % to %.',
            OLD.id, OLD.facility_id, NEW.facility_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_prevent_facility_relocation_contracts ON public.facility_vendor_contracts;
CREATE TRIGGER trg_prevent_facility_relocation_contracts
    BEFORE UPDATE OF facility_id ON public.facility_vendor_contracts
    FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_facility_relocation_contracts();

-- 6.4 Prevent Self-Approval & Enforce Separation of Duties
CREATE OR REPLACE FUNCTION public.fn_enforce_contract_approval_separation()
RETURNS TRIGGER AS $$
DECLARE
    v_is_super_admin BOOLEAN := FALSE;
BEGIN
    -- Only evaluate on transition into 'approved' or 'active'
    IF (NEW.status IN ('approved', 'active') AND OLD.status NOT IN ('approved', 'active')) THEN
        IF NEW.approved_by IS NULL THEN
            RAISE EXCEPTION 'Approval violation: Contract % cannot be activated without an explicit approved_by actor UUID.', NEW.contract_number;
        END IF;

        -- Check if approver is identical to creator or submitter
        IF (NEW.approved_by = NEW.created_by OR NEW.approved_by = NEW.submitted_by) THEN
            -- Allow bypass ONLY for super_admin or org_admin when staffing is constrained
            BEGIN
                SELECT public.user_has_facility_role(NULL, ARRAY['super_admin']) INTO v_is_super_admin;
            EXCEPTION WHEN OTHERS THEN
                v_is_super_admin := FALSE;
            END;

            IF NOT v_is_super_admin THEN
                RAISE EXCEPTION 'Separation of duties violation: Creator or submitter (User %) cannot approve their own vendor contract (%). A second authorized administrative approver is required.',
                    NEW.approved_by, NEW.contract_number;
            END IF;
        END IF;

        -- Record approval timestamp if not set
        IF NEW.approved_at IS NULL THEN
            NEW.approved_at := NOW();
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_enforce_contract_approval_separation ON public.facility_vendor_contracts;
CREATE TRIGGER trg_enforce_contract_approval_separation
    BEFORE UPDATE OF status, approved_by ON public.facility_vendor_contracts
    FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_contract_approval_separation();

-- 6.5 Attach Audit Logging Trigger (Phase 24 Standards)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'fn_audit_log_trigger'
    ) THEN
        DROP TRIGGER IF EXISTS trg_audit_facility_vendor_contracts ON public.facility_vendor_contracts;
        CREATE TRIGGER trg_audit_facility_vendor_contracts
            AFTER INSERT OR UPDATE OR DELETE ON public.facility_vendor_contracts
            FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

        DROP TRIGGER IF EXISTS trg_audit_facility_vendor_contract_scopes ON public.facility_vendor_contract_scopes;
        CREATE TRIGGER trg_audit_facility_vendor_contract_scopes
            AFTER INSERT OR UPDATE OR DELETE ON public.facility_vendor_contract_scopes
            FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

        DROP TRIGGER IF EXISTS trg_audit_facility_vendor_contract_documents ON public.facility_vendor_contract_documents;
        CREATE TRIGGER trg_audit_facility_vendor_contract_documents
            AFTER INSERT OR UPDATE OR DELETE ON public.facility_vendor_contract_documents
            FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();
    END IF;
END $$;

-- ==============================================================================
-- 7. AUTHORITATIVE STORED PROCEDURES
-- ==============================================================================

-- 7.1 Upsert Contract Draft
CREATE OR REPLACE FUNCTION public.fn_upsert_facility_vendor_contract(
    p_contract_id UUID,
    p_facility_id UUID,
    p_vendor_id UUID,
    p_contract_number VARCHAR,
    p_contract_name VARCHAR,
    p_contract_type VARCHAR,
    p_effective_from DATE,
    p_effective_to DATE,
    p_auto_renew BOOLEAN,
    p_renewal_notice_days INTEGER,
    p_gpo_affiliation VARCHAR,
    p_payment_terms_days INTEGER,
    p_prompt_pay_discount_percent NUMERIC,
    p_prompt_pay_days INTEGER,
    p_fob_point VARCHAR,
    p_freight_terms VARCHAR,
    p_is_consignment BOOLEAN,
    p_consignment_reconciliation_frequency VARCHAR,
    p_annual_volume_commitment_amount NUMERIC,
    p_has_rebate_terms BOOLEAN,
    p_rebate_structure_type VARCHAR,
    p_rebate_percentage NUMERIC,
    p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_id UUID;
    v_resolved_id UUID;
    v_existing_status VARCHAR;
BEGIN
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to modify vendor contracts.';
    END IF;

    -- Verify Tenant Authorization
    IF NOT public.user_has_facility_role(p_facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'materials_manager']) THEN
        RAISE EXCEPTION 'Permission denied: Caller does not possess contract management authority for facility %.', p_facility_id;
    END IF;

    -- Verify Vendor Exists and is Active
    IF NOT EXISTS (SELECT 1 FROM public.implant_vendors WHERE id = p_vendor_id AND is_active = TRUE) THEN
        RAISE EXCEPTION 'Referenced vendor ID % does not exist or is inactive in master directory.', p_vendor_id;
    END IF;

    -- Date Validation
    IF p_effective_to < p_effective_from THEN
        RAISE EXCEPTION 'Invalid date boundaries: effective_to (%) cannot precede effective_from (%).', p_effective_to, p_effective_from;
    END IF;

    -- If updating, verify contract is in editable state (draft or rejected)
    IF p_contract_id IS NOT NULL THEN
        SELECT status INTO v_existing_status
        FROM public.facility_vendor_contracts
        WHERE id = p_contract_id AND facility_id = p_facility_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Contract ID % not found for facility %.', p_contract_id, p_facility_id;
        END IF;

        IF v_existing_status NOT IN ('draft', 'rejected', 'pending_approval') THEN
            RAISE EXCEPTION 'Contract % is currently % and cannot be modified directly. An amendment must be created.',
                p_contract_number, v_existing_status;
        END IF;
    END IF;

    -- Execute Upsert
    INSERT INTO public.facility_vendor_contracts (
        id, facility_id, vendor_id, contract_number, contract_name, contract_type,
        status, is_active, effective_from, effective_to, auto_renew, renewal_notice_days,
        gpo_affiliation, payment_terms_days, prompt_pay_discount_percent, prompt_pay_days,
        fob_point, freight_terms, is_consignment, consignment_reconciliation_frequency,
        annual_volume_commitment_amount, has_rebate_terms, rebate_structure_type, rebate_percentage,
        notes, created_by, updated_by
    ) VALUES (
        COALESCE(p_contract_id, gen_random_uuid()),
        p_facility_id, p_vendor_id, TRIM(p_contract_number), TRIM(p_contract_name),
        COALESCE(p_contract_type, 'DIRECT_OEM'),
        'draft', FALSE, p_effective_from, p_effective_to,
        COALESCE(p_auto_renew, FALSE), COALESCE(p_renewal_notice_days, 60),
        TRIM(p_gpo_affiliation), COALESCE(p_payment_terms_days, 30),
        COALESCE(p_prompt_pay_discount_percent, 0.00), p_prompt_pay_days,
        COALESCE(p_fob_point, 'DESTINATION'), COALESCE(p_freight_terms, 'PREPAID'),
        COALESCE(p_is_consignment, FALSE), COALESCE(p_consignment_reconciliation_frequency, 'MONTHLY'),
        COALESCE(p_annual_volume_commitment_amount, 0.00), COALESCE(p_has_rebate_terms, FALSE),
        COALESCE(p_rebate_structure_type, 'NONE'), COALESCE(p_rebate_percentage, 0.00),
        TRIM(p_notes), v_actor_id, v_actor_id
    )
    ON CONFLICT (id) DO UPDATE SET
        contract_name = EXCLUDED.contract_name,
        contract_type = EXCLUDED.contract_type,
        effective_from = EXCLUDED.effective_from,
        effective_to = EXCLUDED.effective_to,
        auto_renew = EXCLUDED.auto_renew,
        renewal_notice_days = EXCLUDED.renewal_notice_days,
        gpo_affiliation = EXCLUDED.gpo_affiliation,
        payment_terms_days = EXCLUDED.payment_terms_days,
        prompt_pay_discount_percent = EXCLUDED.prompt_pay_discount_percent,
        prompt_pay_days = EXCLUDED.prompt_pay_days,
        fob_point = EXCLUDED.fob_point,
        freight_terms = EXCLUDED.freight_terms,
        is_consignment = EXCLUDED.is_consignment,
        consignment_reconciliation_frequency = EXCLUDED.consignment_reconciliation_frequency,
        annual_volume_commitment_amount = EXCLUDED.annual_volume_commitment_amount,
        has_rebate_terms = EXCLUDED.has_rebate_terms,
        rebate_structure_type = EXCLUDED.rebate_structure_type,
        rebate_percentage = EXCLUDED.rebate_percentage,
        notes = EXCLUDED.notes,
        updated_by = v_actor_id,
        updated_at = NOW()
    RETURNING id INTO v_resolved_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'contract_id', v_resolved_id,
        'message', 'Contract draft saved successfully.'
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_upsert_facility_vendor_contract TO authenticated;

-- 7.2 Review Contract Approval / Rejection
CREATE OR REPLACE FUNCTION public.fn_review_facility_vendor_contract(
    p_contract_id UUID,
    p_action VARCHAR, -- 'approve' or 'reject'
    p_rationale TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_id UUID;
    v_contract RECORD;
    v_is_super_admin BOOLEAN := FALSE;
    v_new_status VARCHAR;
    v_is_active BOOLEAN;
BEGIN
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT * INTO v_contract
    FROM public.facility_vendor_contracts
    WHERE id = p_contract_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Contract ID % does not exist.', p_contract_id;
    END IF;

    IF v_contract.status != 'pending_approval' THEN
        RAISE EXCEPTION 'Contract % cannot be reviewed; status is %, not pending_approval.',
            v_contract.contract_number, v_contract.status;
    END IF;

    -- Verify Approver Authority (CFO, Facility Admin, Super Admin)
    IF NOT public.user_has_facility_role(v_contract.facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo']) THEN
        RAISE EXCEPTION 'Permission denied: Only CFO or Facility Administrators can approve or reject vendor contracts.';
    END IF;

    -- Enforce Separation of Duties
    IF (v_actor_id = v_contract.created_by OR v_actor_id = v_contract.submitted_by) THEN
        BEGIN
            SELECT public.user_has_facility_role(NULL, ARRAY['super_admin']) INTO v_is_super_admin;
        EXCEPTION WHEN OTHERS THEN
            v_is_super_admin := FALSE;
        END;

        IF NOT v_is_super_admin THEN
            RAISE EXCEPTION 'Separation of duties violation: Creator or submitter cannot approve their own vendor contract. Second-person approval required.';
        END IF;
    END IF;

    IF p_action = 'approve' THEN
        -- Evaluate whether contract becomes immediately active or scheduled approved
        IF CURRENT_DATE >= v_contract.effective_from THEN
            v_new_status := 'active';
            v_is_active := TRUE;
        ELSE
            v_new_status := 'approved';
            v_is_active := FALSE;
        END IF;

        UPDATE public.facility_vendor_contracts SET
            status = v_new_status,
            is_active = v_is_active,
            approved_by = v_actor_id,
            approved_at = NOW(),
            rejection_reason = NULL,
            updated_by = v_actor_id,
            updated_at = NOW()
        WHERE id = p_contract_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'contract_id', p_contract_id,
            'status', v_new_status,
            'message', 'Contract successfully approved and activated.'
        );

    ELSIF p_action = 'reject' THEN
        IF TRIM(p_rationale) IS NULL OR LENGTH(TRIM(p_rationale)) < 5 THEN
            RAISE EXCEPTION 'Mandatory rejection rationale must be provided (minimum 5 characters).';
        END IF;

        UPDATE public.facility_vendor_contracts SET
            status = 'rejected',
            is_active = FALSE,
            rejection_reason = TRIM(p_rationale),
            updated_by = v_actor_id,
            updated_at = NOW()
        WHERE id = p_contract_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'contract_id', p_contract_id,
            'status', 'rejected',
            'message', 'Contract submission rejected.'
        );
    ELSE
        RAISE EXCEPTION 'Invalid review action: %. Permitted: approve, reject.', p_action;
    END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_review_facility_vendor_contract TO authenticated;

-- 7.3 Create Contract Amendment
CREATE OR REPLACE FUNCTION public.fn_create_contract_amendment(
    p_parent_contract_id UUID,
    p_amendment_rationale TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_id UUID;
    v_parent RECORD;
    v_new_contract_id UUID := gen_random_uuid();
    v_new_amendment_no INTEGER;
BEGIN
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT * INTO v_parent
    FROM public.facility_vendor_contracts
    WHERE id = p_parent_contract_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Parent contract ID % does not exist.', p_parent_contract_id;
    END IF;

    IF v_parent.status NOT IN ('active', 'expired') THEN
        RAISE EXCEPTION 'Amendments can only be created from active or expired contracts. Got: %.', v_parent.status;
    END IF;

    IF TRIM(p_amendment_rationale) IS NULL OR LENGTH(TRIM(p_amendment_rationale)) < 10 THEN
        RAISE EXCEPTION 'Detailed amendment rationale is required (minimum 10 characters).';
    END IF;

    v_new_amendment_no := v_parent.amendment_number + 1;

    -- Clone Header
    INSERT INTO public.facility_vendor_contracts (
        id, facility_id, vendor_id, contract_number, contract_name, contract_type,
        status, is_active, effective_from, effective_to, auto_renew, renewal_notice_days,
        gpo_affiliation, gpo_tier_level, gpo_contract_reference, payment_terms_days,
        prompt_pay_discount_percent, prompt_pay_days, fob_point, freight_terms,
        is_consignment, consignment_reconciliation_frequency, consignment_audit_required,
        annual_volume_commitment_amount, has_rebate_terms, rebate_structure_type, rebate_percentage,
        amendment_number, is_current_version, parent_contract_id, amendment_rationale,
        notes, created_by, updated_by
    ) VALUES (
        v_new_contract_id, v_parent.facility_id, v_parent.vendor_id, v_parent.contract_number,
        v_parent.contract_name || ' (Amendment ' || v_new_amendment_no || ')', v_parent.contract_type,
        'draft', FALSE, v_parent.effective_from, v_parent.effective_to, v_parent.auto_renew, v_parent.renewal_notice_days,
        v_parent.gpo_affiliation, v_parent.gpo_tier_level, v_parent.gpo_contract_reference, v_parent.payment_terms_days,
        v_parent.prompt_pay_discount_percent, v_parent.prompt_pay_days, v_parent.fob_point, v_parent.freight_terms,
        v_parent.is_consignment, v_parent.consignment_reconciliation_frequency, v_parent.consignment_audit_required,
        v_parent.annual_volume_commitment_amount, v_parent.has_rebate_terms, v_parent.rebate_structure_type, v_parent.rebate_percentage,
        v_new_amendment_no, FALSE, v_parent.id, TRIM(p_amendment_rationale),
        v_parent.notes, v_actor_id, v_actor_id
    );

    -- Clone Existing Scopes
    INSERT INTO public.facility_vendor_contract_scopes (
        contract_id, facility_id, scope_type, specialty, component_id, family_id, sku_id,
        authorized_distributor_id, is_consignment_covered, is_excluded, exclusion_reason,
        tier_discount_percent, fixed_procedural_cap_rate, status, is_active, notes
    )
    SELECT
        v_new_contract_id, facility_id, scope_type, specialty, component_id, family_id, sku_id,
        authorized_distributor_id, is_consignment_covered, is_excluded, exclusion_reason,
        tier_discount_percent, fixed_procedural_cap_rate, 'active', TRUE, notes
    FROM public.facility_vendor_contract_scopes
    WHERE contract_id = p_parent_contract_id AND is_active = TRUE;

    RETURN jsonb_build_object(
        'success', TRUE,
        'parent_contract_id', p_parent_contract_id,
        'amendment_contract_id', v_new_contract_id,
        'amendment_number', v_new_amendment_no,
        'message', 'Contract amendment draft successfully cloned and staged.'
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_create_contract_amendment TO authenticated;

-- 7.4 Sourcing Contract Eligibility Resolution
CREATE OR REPLACE FUNCTION public.fn_validate_contract_eligibility(
    p_facility_id UUID,
    p_vendor_id UUID,
    p_component_id UUID,
    p_sku_id UUID,
    p_procedure_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_contract RECORD;
    v_scope RECORD;
    v_is_excluded BOOLEAN := FALSE;
    v_has_coverage BOOLEAN := FALSE;
BEGIN
    -- Query active contracts on procedure date
    SELECT * INTO v_contract
    FROM public.facility_vendor_contracts
    WHERE facility_id = p_facility_id
      AND vendor_id = p_vendor_id
      AND status = 'active'
      AND is_active = TRUE
      AND p_procedure_date >= effective_from
      AND p_procedure_date <= effective_to
    ORDER BY amendment_number DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'is_authorized', FALSE,
            'reason_code', 'NO_ACTIVE_CONTRACT',
            'message', 'No active vendor contract exists for this facility on the specified date.'
        );
    END IF;

    -- Check Scope Exclusions
    SELECT EXISTS (
        SELECT 1 FROM public.facility_vendor_contract_scopes
        WHERE contract_id = v_contract.id
          AND is_active = TRUE
          AND is_excluded = TRUE
          AND (
            (scope_type = 'SKU_LINE_ITEM' AND sku_id = p_sku_id) OR
            (scope_type = 'COMPONENT' AND component_id = p_component_id)
          )
    ) INTO v_is_excluded;

    IF v_is_excluded THEN
        RETURN jsonb_build_object(
            'is_authorized', FALSE,
            'contract_id', v_contract.id,
            'contract_number', v_contract.contract_number,
            'reason_code', 'SCOPE_EXCLUDED',
            'message', 'The requested component or SKU is explicitly carved out from this contract.'
        );
    END IF;

    -- Check Scope Inclusions
    SELECT EXISTS (
        SELECT 1 FROM public.facility_vendor_contract_scopes
        WHERE contract_id = v_contract.id
          AND is_active = TRUE
          AND is_excluded = FALSE
          AND (
            scope_type = 'ALL_VENDOR_PRODUCTS' OR
            (scope_type = 'COMPONENT' AND component_id = p_component_id) OR
            (scope_type = 'SKU_LINE_ITEM' AND sku_id = p_sku_id)
          )
    ) INTO v_has_coverage;

    IF v_has_coverage THEN
        RETURN jsonb_build_object(
            'is_authorized', TRUE,
            'contract_id', v_contract.id,
            'contract_number', v_contract.contract_number,
            'contract_type', v_contract.contract_type,
            'payment_terms_days', v_contract.payment_terms_days,
            'is_consignment', v_contract.is_consignment,
            'reason_code', 'CONTRACT_AUTHORIZED',
            'message', 'Vendor item is authorized under active commercial contract.'
        );
    ELSE
        RETURN jsonb_build_object(
            'is_authorized', FALSE,
            'contract_id', v_contract.id,
            'contract_number', v_contract.contract_number,
            'reason_code', 'NOT_IN_CONTRACT_SCOPE',
            'message', 'Item is not included within the covered scopes of this contract.'
        );
    END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_validate_contract_eligibility TO authenticated;

-- ==============================================================================
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.facility_vendor_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_vendor_contract_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_vendor_contract_documents ENABLE ROW LEVEL SECURITY;

-- 8.1 facility_vendor_contracts Policies
DROP POLICY IF EXISTS "fvc_select_tenant_members" ON public.facility_vendor_contracts;
CREATE POLICY "fvc_select_tenant_members" ON public.facility_vendor_contracts
    FOR SELECT TO authenticated
    USING (
        facility_id IN (SELECT public.get_auth_user_facilities()) OR
        public.user_has_facility_role(NULL, ARRAY['super_admin'])
    );

DROP POLICY IF EXISTS "fvc_insert_procurement_roles" ON public.facility_vendor_contracts;
CREATE POLICY "fvc_insert_procurement_roles" ON public.facility_vendor_contracts
    FOR INSERT TO authenticated
    WITH CHECK (
        (facility_id IN (SELECT public.get_auth_user_facilities()) AND
         public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'materials_manager'])) OR
        public.user_has_facility_role(NULL, ARRAY['super_admin'])
    );

DROP POLICY IF EXISTS "fvc_update_procurement_roles" ON public.facility_vendor_contracts;
CREATE POLICY "fvc_update_procurement_roles" ON public.facility_vendor_contracts
    FOR UPDATE TO authenticated
    USING (
        (facility_id IN (SELECT public.get_auth_user_facilities()) AND
         public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'materials_manager'])) OR
        public.user_has_facility_role(NULL, ARRAY['super_admin'])
    )
    WITH CHECK (
        (facility_id IN (SELECT public.get_auth_user_facilities()) AND
         public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'materials_manager'])) OR
        public.user_has_facility_role(NULL, ARRAY['super_admin'])
    );

DROP POLICY IF EXISTS "fvc_delete_admin_drafts_only" ON public.facility_vendor_contracts;
CREATE POLICY "fvc_delete_admin_drafts_only" ON public.facility_vendor_contracts
    FOR DELETE TO authenticated
    USING (
        status IN ('draft', 'rejected') AND
        ((facility_id IN (SELECT public.get_auth_user_facilities()) AND
          public.user_has_facility_role(facility_id, ARRAY['super_admin', 'facility_admin'])) OR
         public.user_has_facility_role(NULL, ARRAY['super_admin']))
    );

-- 8.2 facility_vendor_contract_scopes Policies
DROP POLICY IF EXISTS "fvcs_select_tenant_members" ON public.facility_vendor_contract_scopes;
CREATE POLICY "fvcs_select_tenant_members" ON public.facility_vendor_contract_scopes
    FOR SELECT TO authenticated
    USING (
        facility_id IN (SELECT public.get_auth_user_facilities()) OR
        public.user_has_facility_role(NULL, ARRAY['super_admin'])
    );

DROP POLICY IF EXISTS "fvcs_insert_procurement_roles" ON public.facility_vendor_contract_scopes;
CREATE POLICY "fvcs_insert_procurement_roles" ON public.facility_vendor_contract_scopes
    FOR INSERT TO authenticated
    WITH CHECK (
        (facility_id IN (SELECT public.get_auth_user_facilities()) AND
         public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'materials_manager'])) OR
        public.user_has_facility_role(NULL, ARRAY['super_admin'])
    );

DROP POLICY IF EXISTS "fvcs_update_procurement_roles" ON public.facility_vendor_contract_scopes;
CREATE POLICY "fvcs_update_procurement_roles" ON public.facility_vendor_contract_scopes
    FOR UPDATE TO authenticated
    USING (
        (facility_id IN (SELECT public.get_auth_user_facilities()) AND
         public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'materials_manager'])) OR
        public.user_has_facility_role(NULL, ARRAY['super_admin'])
    )
    WITH CHECK (
        (facility_id IN (SELECT public.get_auth_user_facilities()) AND
         public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'materials_manager'])) OR
        public.user_has_facility_role(NULL, ARRAY['super_admin'])
    );

DROP POLICY IF EXISTS "fvcs_delete_procurement_roles" ON public.facility_vendor_contract_scopes;
CREATE POLICY "fvcs_delete_procurement_roles" ON public.facility_vendor_contract_scopes
    FOR DELETE TO authenticated
    USING (
        (facility_id IN (SELECT public.get_auth_user_facilities()) AND
         public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'materials_manager'])) OR
        public.user_has_facility_role(NULL, ARRAY['super_admin'])
    );

-- 8.3 facility_vendor_contract_documents Policies
DROP POLICY IF EXISTS "fvcd_select_document_security" ON public.facility_vendor_contract_documents;
CREATE POLICY "fvcd_select_document_security" ON public.facility_vendor_contract_documents
    FOR SELECT TO authenticated
    USING (
        (facility_id IN (SELECT public.get_auth_user_facilities()) AND
         (is_confidential = FALSE OR
          public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'materials_manager']))) OR
        public.user_has_facility_role(NULL, ARRAY['super_admin'])
    );

DROP POLICY IF EXISTS "fvcd_insert_document_roles" ON public.facility_vendor_contract_documents;
CREATE POLICY "fvcd_insert_document_roles" ON public.facility_vendor_contract_documents
    FOR INSERT TO authenticated
    WITH CHECK (
        (facility_id IN (SELECT public.get_auth_user_facilities()) AND
         public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'materials_manager'])) OR
        public.user_has_facility_role(NULL, ARRAY['super_admin'])
    );

DROP POLICY IF EXISTS "fvcd_delete_admin_only" ON public.facility_vendor_contract_documents;
CREATE POLICY "fvcd_delete_admin_only" ON public.facility_vendor_contract_documents
    FOR DELETE TO authenticated
    USING (
        (facility_id IN (SELECT public.get_auth_user_facilities()) AND
         public.user_has_facility_role(facility_id, ARRAY['super_admin', 'facility_admin', 'cfo'])) OR
        public.user_has_facility_role(NULL, ARRAY['super_admin'])
    );

-- ==============================================================================
-- 9. SEED BASELINE FACILITY VENDOR CONTRACTS (Naples Surgery Center)
-- ==============================================================================

DO $$
DECLARE
    v_fac_id UUID := '00000000-0000-0000-0000-000000000002';
    v_stryker_id UUID;
    v_zimmer_id UUID;
    v_depuy_id UUID;
    v_contract_1 UUID := '00000000-0000-0000-0056-000000000001';
    v_contract_2 UUID := '00000000-0000-0000-0056-000000000002';
    v_contract_3 UUID := '00000000-0000-0000-0056-000000000003';
    v_admin_id UUID := '00000000-0000-0000-0001-000000000001';
    v_cfo_id UUID := '00000000-0000-0000-0001-000000000004';
    v_knee_comp UUID;
    v_hip_comp UUID;
BEGIN
    SELECT id INTO v_stryker_id FROM public.implant_vendors WHERE vendor_code = 'STRYKER' LIMIT 1;
    SELECT id INTO v_zimmer_id FROM public.implant_vendors WHERE vendor_code = 'ZIMMER_BIOMET' LIMIT 1;
    SELECT id INTO v_depuy_id FROM public.implant_vendors WHERE vendor_code = 'DEPUY_SYNTHES' LIMIT 1;
    SELECT id INTO v_knee_comp FROM public.implant_components WHERE code = 'KNEE_FEMORAL' LIMIT 1;
    SELECT id INTO v_hip_comp FROM public.implant_components WHERE code = 'HIP_STEM' LIMIT 1;

    IF v_stryker_id IS NOT NULL THEN
        -- Contract 1: Stryker Orthopaedics Master Agreement
        INSERT INTO public.facility_vendor_contracts (
            id, facility_id, vendor_id, contract_number, contract_name, contract_type,
            status, is_active, effective_from, effective_to, auto_renew, renewal_notice_days,
            gpo_affiliation, payment_terms_days, prompt_pay_discount_percent, prompt_pay_days,
            fob_point, freight_terms, is_consignment, consignment_reconciliation_frequency,
            annual_volume_commitment_amount, has_rebate_terms, rebate_structure_type, rebate_percentage,
            approved_by, approved_at, created_by, updated_by
        ) VALUES (
            v_contract_1, v_fac_id, v_stryker_id, 'CTR-2026-STR-01', 'Stryker Orthopaedics Master Total Joint Agreement', 'DIRECT_OEM',
            'active', TRUE, '2026-01-01', '2026-12-31', TRUE, 60,
            'Vizient', 30, 2.00, 10,
            'DESTINATION', 'PREPAID', TRUE, 'MONTHLY',
            500000.00, TRUE, 'VOLUME_TIERED', 4.50,
            v_cfo_id, NOW() - INTERVAL '60 days', v_admin_id, v_admin_id
        ) ON CONFLICT (id) DO NOTHING;

        -- Scopes for Contract 1
        IF v_knee_comp IS NOT NULL THEN
            INSERT INTO public.facility_vendor_contract_scopes (
                contract_id, facility_id, scope_type, component_id, is_consignment_covered, is_excluded, tier_discount_percent
            ) VALUES (
                v_contract_1, v_fac_id, 'COMPONENT', v_knee_comp, TRUE, FALSE, 12.50
            ) ON CONFLICT DO NOTHING;
        END IF;

        IF v_hip_comp IS NOT NULL THEN
            INSERT INTO public.facility_vendor_contract_scopes (
                contract_id, facility_id, scope_type, component_id, is_consignment_covered, is_excluded, tier_discount_percent
            ) VALUES (
                v_contract_1, v_fac_id, 'COMPONENT', v_hip_comp, TRUE, FALSE, 10.00
            ) ON CONFLICT DO NOTHING;
        END IF;
    END IF;

    IF v_zimmer_id IS NOT NULL THEN
        -- Contract 2: Zimmer Biomet GPO Consignment Agreement
        INSERT INTO public.facility_vendor_contracts (
            id, facility_id, vendor_id, contract_number, contract_name, contract_type,
            status, is_active, effective_from, effective_to, auto_renew, renewal_notice_days,
            gpo_affiliation, payment_terms_days, prompt_pay_discount_percent, prompt_pay_days,
            fob_point, freight_terms, is_consignment, consignment_reconciliation_frequency,
            annual_volume_commitment_amount, has_rebate_terms, rebate_structure_type, rebate_percentage,
            approved_by, approved_at, created_by, updated_by
        ) VALUES (
            v_contract_2, v_fac_id, v_zimmer_id, 'CTR-2026-ZIM-02', 'Zimmer Biomet National GPO Pricing Schedule', 'GPO_TIERED',
            'active', TRUE, '2026-03-01', '2027-02-28', FALSE, 45,
            'Premier', 45, 1.50, 15,
            'DESTINATION', 'PREPAID', TRUE, 'QUARTERLY',
            250000.00, FALSE, 'NONE', 0.00,
            v_cfo_id, NOW() - INTERVAL '30 days', v_admin_id, v_admin_id
        ) ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.facility_vendor_contract_scopes (
            contract_id, facility_id, scope_type, is_consignment_covered, is_excluded
        ) VALUES (
            v_contract_2, v_fac_id, 'ALL_VENDOR_PRODUCTS', TRUE, FALSE
        ) ON CONFLICT DO NOTHING;
    END IF;

    IF v_depuy_id IS NOT NULL THEN
        -- Contract 3: DePuy Synthes Pending Evaluation Contract
        INSERT INTO public.facility_vendor_contracts (
            id, facility_id, vendor_id, contract_number, contract_name, contract_type,
            status, is_active, effective_from, effective_to, auto_renew, renewal_notice_days,
            gpo_affiliation, payment_terms_days, prompt_pay_discount_percent, prompt_pay_days,
            fob_point, freight_terms, is_consignment, consignment_reconciliation_frequency,
            annual_volume_commitment_amount, has_rebate_terms, rebate_structure_type, rebate_percentage,
            submitted_by, submitted_at, created_by, updated_by
        ) VALUES (
            v_contract_3, v_fac_id, v_depuy_id, 'CTR-2026-DEP-03', 'DePuy Synthes Spine & Sports Medicine Agreement', 'CUSTOM_LOCAL',
            'pending_approval', FALSE, '2026-06-01', '2027-05-31', TRUE, 60,
            'Direct', 30, 0.00, NULL,
            'DESTINATION', 'PREPAID', FALSE, 'NOT_APPLICABLE',
            150000.00, TRUE, 'FLAT_PERCENT', 3.00,
            v_admin_id, NOW() - INTERVAL '2 days', v_admin_id, v_admin_id
        ) ON CONFLICT (id) DO NOTHING;
    END IF;
END $$;

COMMIT;
-- ==============================================================================
-- MIGRATION: 032_facility_implant_pricing.sql
-- DESCRIPTION: Phase 57 Facility Implant Pricing: Contract Schedules,
--              Itemized SKU Prices, Supplier Invoices, 3-Way Reconciliation,
--              Case Cost Allocations, and Benchmark Intelligence.
-- PLATFORM: Supabase PostgreSQL 15+
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. TABLE: public.facility_implant_price_schedules
-- Groups itemized SKU pricing agreements under a master contract or local schedule
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.facility_implant_price_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES public.implant_vendors(id) ON DELETE RESTRICT,
    contract_id UUID REFERENCES public.facility_vendor_contracts(id) ON DELETE CASCADE,
    
    -- Identification & Description
    schedule_code VARCHAR(50) NOT NULL,
    schedule_name VARCHAR(150) NOT NULL,
    description TEXT,
    
    -- Commercial Framework
    pricing_model VARCHAR(30) NOT NULL DEFAULT 'FIXED_FEE_SCHEDULE'
        CHECK (pricing_model IN (
            'FIXED_FEE_SCHEDULE',       -- Fixed unit price per catalog SKU
            'LIST_LESS_DISCOUNT',       -- MSRP minus contract discount percent
            'COST_PLUS_PERCENT',        -- Distributor acquisition plus margin
            'CAPITATED_PROCEDURE_RATE',  -- Flat fee per procedural construct
            'CONSIGNMENT_TIERED'        -- Volume-bracketed consignment schedule
        )),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
    
    -- Temporal Boundaries
    effective_from DATE NOT NULL,
    effective_to DATE NOT NULL,
    
    -- Lifecycle Governance
    status VARCHAR(30) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'pending_approval', 'approved', 'active', 'superseded', 'terminated')),
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Approval Provenance (Two-Person Separation of Duties)
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT chk_price_schedule_dates CHECK (effective_to >= effective_from),
    CONSTRAINT chk_price_schedule_active_sync CHECK (is_active = (status = 'active')),
    CONSTRAINT chk_price_schedule_approval_integrity CHECK (
        (status IN ('approved', 'active') AND approved_by IS NOT NULL AND approved_at IS NOT NULL) OR
        (status NOT IN ('approved', 'active'))
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_facility_price_schedule_code 
    ON public.facility_implant_price_schedules (facility_id, UPPER(TRIM(schedule_code)));

CREATE INDEX IF NOT EXISTS idx_fips_vendor ON public.facility_implant_price_schedules(vendor_id);
CREATE INDEX IF NOT EXISTS idx_fips_contract ON public.facility_implant_price_schedules(contract_id);
CREATE INDEX IF NOT EXISTS idx_fips_facility_dates ON public.facility_implant_price_schedules(facility_id, effective_from, effective_to);

-- ==============================================================================
-- 2. TABLE: public.facility_implant_sku_prices
-- Itemized unit price per physical SKU under a price schedule
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.facility_implant_sku_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    price_schedule_id UUID NOT NULL REFERENCES public.facility_implant_price_schedules(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    sku_id UUID NOT NULL REFERENCES public.implant_product_skus(id) ON DELETE RESTRICT,
    vendor_id UUID NOT NULL REFERENCES public.implant_vendors(id) ON DELETE RESTRICT,
    
    -- Monetary Specifications (4 decimal places for unit precision)
    contract_unit_price NUMERIC(12, 4) NOT NULL CHECK (contract_unit_price >= 0.0000),
    list_price_at_signing NUMERIC(12, 4) CHECK (list_price_at_signing IS NULL OR list_price_at_signing >= 0.0000),
    discount_off_list_percent NUMERIC(5, 2) GENERATED ALWAYS AS (
        CASE 
            WHEN list_price_at_signing > 0 AND contract_unit_price <= list_price_at_signing 
            THEN ROUND(((list_price_at_signing - contract_unit_price) / list_price_at_signing) * 100.0, 2)
            ELSE 0.00 
        END
    ) STORED,

    -- Packaging & Unit Conversion
    unit_of_measure VARCHAR(20) NOT NULL DEFAULT 'EA' CHECK (unit_of_measure IN ('EA', 'KIT', 'BOX', 'SET', 'PAIR')),
    package_quantity INTEGER NOT NULL DEFAULT 1 CHECK (package_quantity >= 1),
    package_unit_price NUMERIC(12, 4) GENERATED ALWAYS AS (contract_unit_price * package_quantity) STORED,

    -- Volume Commitments & Tiers
    minimum_order_quantity INTEGER NOT NULL DEFAULT 1 CHECK (minimum_order_quantity >= 1),
    pricing_tier VARCHAR(30) NOT NULL DEFAULT 'STANDARD'
        CHECK (pricing_tier IN ('STANDARD', 'TIER_1_VOLUME', 'TIER_2_VOLUME', 'PREFERRED_FACILITY', 'PROMOTIONAL')),
    
    -- Temporal Window
    effective_from DATE NOT NULL,
    effective_to DATE NOT NULL,
    
    -- Status & Audit
    status VARCHAR(30) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'suspended', 'superseded', 'terminated')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_sku_price_dates CHECK (effective_to >= effective_from)
);

-- Partial unique index: Exactly one active price per SKU per schedule
CREATE UNIQUE INDEX IF NOT EXISTS uq_facility_sku_price_active 
    ON public.facility_implant_sku_prices (facility_id, sku_id, price_schedule_id)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_fisp_sku ON public.facility_implant_sku_prices(sku_id);
CREATE INDEX IF NOT EXISTS idx_fisp_facility_sku_active ON public.facility_implant_sku_prices(facility_id, sku_id, is_active);

-- ==============================================================================
-- 3. TABLE: public.implant_supplier_invoices
-- Invoiced commercial accounts payable records received from medical device suppliers
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.implant_supplier_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES public.implant_vendors(id) ON DELETE RESTRICT,
    contract_id UUID REFERENCES public.facility_vendor_contracts(id) ON DELETE SET NULL,
    
    -- Supplier Invoice Identification
    invoice_number VARCHAR(100) NOT NULL,
    vendor_invoice_reference VARCHAR(150),
    invoice_date DATE NOT NULL,
    due_date DATE,
    received_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Financial Totals
    currency VARCHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
    subtotal_amount NUMERIC(12, 2) NOT NULL CHECK (subtotal_amount >= 0.00),
    freight_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (freight_amount >= 0.00),
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0.00),
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0.00),
    total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0.00),
    
    -- Payment Terms Snapshots
    payment_terms_days INTEGER NOT NULL DEFAULT 30 CHECK (payment_terms_days >= 0),
    prompt_pay_discount_percent NUMERIC(5, 2) DEFAULT 0.00 CHECK (prompt_pay_discount_percent >= 0.00),
    
    -- 3-Way Reconciliation Status
    reconciliation_status VARCHAR(30) NOT NULL DEFAULT 'unreconciled'
        CHECK (reconciliation_status IN (
            'unreconciled',             -- Newly ingested, pending item matching
            'fully_matched',            -- 100% lines matched clean to PO/Cases
            'partially_matched',        -- Some lines matched, others in variance
            'variance_flagged',         -- Price breach or quantity discrepancy
            'approved_for_payment',     -- Finance/CFO approved for AP payout
            'rejected',                 -- Returned to vendor for credit memo
            'disputed'                  -- Formal commercial dispute logged
        )),
    
    -- Auditing & Sign-off
    reconciled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reconciled_at TIMESTAMPTZ,
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Mathematical balance check
    CONSTRAINT chk_invoice_balance CHECK (
        total_amount = (subtotal_amount + freight_amount + tax_amount - discount_amount)
    )
);

-- Idempotency: Prevent duplicate ingestion of same vendor invoice
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_invoice_vendor_number 
    ON public.implant_supplier_invoices (facility_id, vendor_id, UPPER(TRIM(invoice_number)));

CREATE INDEX IF NOT EXISTS idx_isi_facility_status ON public.implant_supplier_invoices(facility_id, reconciliation_status);
CREATE INDEX IF NOT EXISTS idx_isi_vendor ON public.implant_supplier_invoices(vendor_id);

-- ==============================================================================
-- 4. TABLE: public.implant_supplier_invoice_lines
-- Line items within supplier invoices linked to catalog SKUs and PO/surgical cases
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.implant_supplier_invoice_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.implant_supplier_invoices(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL CHECK (line_number >= 1),
    
    -- Physical Catalog Matching
    sku_id UUID REFERENCES public.implant_product_skus(id) ON DELETE RESTRICT,
    vendor_catalog_number VARCHAR(100) NOT NULL,
    vendor_description TEXT,
    
    -- Regulatory Traceability
    lot_number VARCHAR(50),
    serial_number VARCHAR(50),
    expiration_date DATE,
    udi VARCHAR(150),
    
    -- Quantity & Pricing Billed
    billed_quantity INTEGER NOT NULL CHECK (billed_quantity >= 1),
    billed_unit_of_measure VARCHAR(20) NOT NULL DEFAULT 'EA',
    packaging_multiplier INTEGER NOT NULL DEFAULT 1 CHECK (packaging_multiplier >= 1),
    billed_unit_cost NUMERIC(12, 4) NOT NULL CHECK (billed_unit_cost >= 0.0000),
    extended_cost NUMERIC(12, 2) NOT NULL CHECK (extended_cost >= 0.00),
    
    -- Contract Comparison & Variance Analysis
    contract_sku_price_id UUID REFERENCES public.facility_implant_sku_prices(id) ON DELETE SET NULL,
    contract_unit_price NUMERIC(12, 4),
    price_variance_unit NUMERIC(12, 4) GENERATED ALWAYS AS (
        CASE 
            WHEN contract_unit_price IS NOT NULL 
            THEN billed_unit_cost - contract_unit_price 
            ELSE 0.0000 
        END
    ) STORED,
    price_variance_extended NUMERIC(12, 2) GENERATED ALWAYS AS (
        CASE 
            WHEN contract_unit_price IS NOT NULL 
            THEN (billed_unit_cost - contract_unit_price) * billed_quantity 
            ELSE 0.00 
        END
    ) STORED,

    -- Line Reconciliation Lifecycle
    match_status VARCHAR(30) NOT NULL DEFAULT 'UNMATCHED'
        CHECK (match_status IN (
            'UNMATCHED',                -- Ingested, unmapped to SKU or Case
            'MATCHED_CLEAN',            -- Matched to contract & PO within tolerance
            'PRICE_VARIANCE_BREACH',    -- Billed rate exceeds contract rate
            'QUANTITY_MISMATCH',        -- Invoiced quantity exceeds surgical usage
            'OFF_CONTRACT_UNAUTHORIZED', -- Vendor SKU not covered under contract
            'MANUALLY_APPROVED',        -- Variance explicitly approved by CFO
            'DISPUTED_LINE'             -- Line credited or disputed with vendor
        )),
    variance_reason TEXT,
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_invoice_line_number UNIQUE (invoice_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_isil_sku ON public.implant_supplier_invoice_lines(sku_id);
CREATE INDEX IF NOT EXISTS idx_isil_match_status ON public.implant_supplier_invoice_lines(facility_id, match_status);

-- ==============================================================================
-- 5. TABLE: public.case_device_cost_allocations
-- Authoritative junction assigning verified actual acquisition cost to case_devices
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.case_device_cost_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    case_device_id UUID NOT NULL REFERENCES public.case_devices(id) ON DELETE CASCADE,
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE CASCADE,
    
    -- Hierarchy Tier Assigned
    cost_hierarchy_tier VARCHAR(40) NOT NULL
        CHECK (cost_hierarchy_tier IN (
            'TIER_1_RECONCILED_INVOICE',     -- Highest certainty: Exact reconciled invoice line
            'TIER_2_ACCRUED_CONTRACT',       -- High certainty: Active approved contract schedule
            'TIER_3_HISTORICAL_MOVING_AVG',  -- Medium: Trailing facility 90-day moving average
            'TIER_4_MANUAL_FINANCE_OVERRIDE', -- Low: Explicitly approved finance override
            'TIER_5_MISSING_UNVERIFIED'      -- Critical blocker: Zero verifiable cost source
        )),

    -- Cost Evidence References
    invoice_line_id UUID REFERENCES public.implant_supplier_invoice_lines(id) ON DELETE SET NULL,
    contract_sku_price_id UUID REFERENCES public.facility_implant_sku_prices(id) ON DELETE SET NULL,
    
    -- Financial Values
    allocated_unit_acquisition_cost NUMERIC(12, 4) NOT NULL CHECK (allocated_unit_acquisition_cost >= 0.0000),
    allocated_quantity INTEGER NOT NULL DEFAULT 1 CHECK (allocated_quantity >= 1),
    allocated_extended_acquisition_cost NUMERIC(12, 2) GENERATED ALWAYS AS (
        allocated_unit_acquisition_cost * allocated_quantity
    ) STORED,

    -- Net Adjustments Applied
    prompt_pay_discount_applied NUMERIC(12, 4) DEFAULT 0.0000,
    freight_allocated NUMERIC(12, 4) DEFAULT 0.0000,
    volume_rebate_accrued NUMERIC(12, 4) DEFAULT 0.0000,

    -- Verification & Immutability Lock
    is_locked_for_billing BOOLEAN NOT NULL DEFAULT FALSE,
    locked_at TIMESTAMPTZ,
    allocated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    allocation_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_case_device_cost UNIQUE (case_device_id)
);

CREATE INDEX IF NOT EXISTS idx_cdca_surgery ON public.case_device_cost_allocations(surgery_id);
CREATE INDEX IF NOT EXISTS idx_cdca_facility_tier ON public.case_device_cost_allocations(facility_id, cost_hierarchy_tier);

-- ==============================================================================
-- 6. TABLE: public.implant_benchmark_prices
-- Regional, national, and GPO benchmark distributions for renegotiation analytics
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.implant_benchmark_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE, -- NULL = National / GPO baseline
    component_id UUID REFERENCES public.implant_components(id) ON DELETE CASCADE,
    sku_id UUID REFERENCES public.implant_product_skus(id) ON DELETE CASCADE,
    
    -- Benchmark Authority
    source_name VARCHAR(100) NOT NULL,
    benchmark_type VARCHAR(30) NOT NULL DEFAULT 'GPO_MEDIAN'
        CHECK (benchmark_type IN ('GPO_MEDIAN', 'REGIONAL_ASC_COHORT', 'CMS_OPPS_MEDIAN', 'INTERNAL_NETWORK_BEST')),
    specialty VARCHAR(50) NOT NULL,
    
    -- Statistical Distribution Values
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    percentile_25_unit_cost NUMERIC(12, 2) NOT NULL CHECK (percentile_25_unit_cost >= 0.00),
    median_unit_cost NUMERIC(12, 2) NOT NULL CHECK (median_unit_cost >= 0.00),
    percentile_75_unit_cost NUMERIC(12, 2) NOT NULL CHECK (percentile_75_unit_cost >= 0.00),
    sample_size_cases INTEGER NOT NULL DEFAULT 100 CHECK (sample_size_cases >= 1),
    
    -- Temporal Validity
    benchmark_year_quarter VARCHAR(10) NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_benchmark_percentiles CHECK (
        percentile_75_unit_cost >= median_unit_cost AND median_unit_cost >= percentile_25_unit_cost
    ),
    CONSTRAINT chk_benchmark_dates CHECK (effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_ibp_component ON public.implant_benchmark_prices(component_id);
CREATE INDEX IF NOT EXISTS idx_ibp_sku ON public.implant_benchmark_prices(sku_id);

-- ==============================================================================
-- 7. TABLE: public.facility_implant_price_audits
-- Immutable ledger tracking before/after mutations to price schedules and costs
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.facility_implant_price_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    entity_name VARCHAR(50) NOT NULL,
    record_id UUID NOT NULL,
    action_type VARCHAR(20) NOT NULL CHECK (action_type IN ('INSERT', 'UPDATE', 'DELETE', 'OVERRIDE', 'RECONCILE')),
    old_values JSONB,
    new_values JSONB,
    performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    rationale TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fipa_record ON public.facility_implant_price_audits(entity_name, record_id);
CREATE INDEX IF NOT EXISTS idx_fipa_facility_date ON public.facility_implant_price_audits(facility_id, created_at DESC);

-- ==============================================================================
-- 8. INTEGRITY TRIGGERS & PROCEDURES
-- ==============================================================================

-- Trigger 8.1: Prevent modification of locked case cost allocations
CREATE OR REPLACE FUNCTION public.fn_prevent_locked_case_cost_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.is_locked_for_billing = TRUE THEN
        RAISE EXCEPTION 'COMPLIANCE VIOLATION: Case cost allocation % is locked for billing and cannot be mutated or deleted.', OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lock_case_cost ON public.case_device_cost_allocations;
CREATE TRIGGER trg_lock_case_cost
    BEFORE UPDATE OR DELETE ON public.case_device_cost_allocations
    FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_locked_case_cost_mutation();

-- Trigger 8.2: Sync surgeries.implants_cost from case_devices
CREATE OR REPLACE FUNCTION public.fn_sync_surgery_implants_cost()
RETURNS TRIGGER AS $$
DECLARE
    v_surgery_id BIGINT;
    v_total NUMERIC(12, 2);
BEGIN
    v_surgery_id := COALESCE(NEW.surgery_id, OLD.surgery_id);
    
    SELECT COALESCE(SUM(total_cost), 0.00)
    INTO v_total
    FROM public.case_devices
    WHERE surgery_id = v_surgery_id AND usage_status = 'IMPLANTED';
    
    UPDATE public.surgeries
    SET implants_cost = v_total,
        updated_at = NOW()
    WHERE id = v_surgery_id;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_surgery_implants_cost ON public.case_devices;
CREATE TRIGGER trg_sync_surgery_implants_cost
    AFTER INSERT OR UPDATE OR DELETE ON public.case_devices
    FOR EACH ROW EXECUTE FUNCTION public.fn_sync_surgery_implants_cost();

-- Procedure 8.3: Deterministic Price Hierarchy Resolution
CREATE OR REPLACE FUNCTION public.fn_resolve_sku_price_hierarchy(
    p_facility_id UUID,
    p_sku_id UUID,
    p_surgery_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    resolved_unit_cost NUMERIC(12, 4),
    hierarchy_tier VARCHAR(40),
    source_reference VARCHAR(150),
    discount_off_list NUMERIC(5, 2),
    currency VARCHAR(3),
    is_authorized BOOLEAN
) AS $$
DECLARE
    v_sku RECORD;
    v_contract_price RECORD;
    v_scope RECORD;
BEGIN
    -- 1. Fetch SKU baseline
    SELECT s.id, s.vendor_id, s.component_id, s.list_price
    INTO v_sku
    FROM public.implant_product_skus s
    WHERE s.id = p_sku_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 0.0000, 'TIER_5_MISSING_UNVERIFIED'::VARCHAR(40), 'SKU Not Found'::VARCHAR(150), 0.00::NUMERIC(5, 2), 'USD'::VARCHAR(3), FALSE;
        RETURN;
    END IF;

    -- Step 1: Active itemized contract price schedule
    SELECT p.contract_unit_price, p.discount_off_list_percent, ps.schedule_code, ps.currency
    INTO v_contract_price
    FROM public.facility_implant_sku_prices p
    JOIN public.facility_implant_price_schedules ps ON p.price_schedule_id = ps.id
    WHERE p.facility_id = p_facility_id
      AND p.sku_id = p_sku_id
      AND p.is_active = TRUE
      AND ps.is_active = TRUE
      AND p_surgery_date >= p.effective_from
      AND p_surgery_date <= p.effective_to
    LIMIT 1;

    IF FOUND THEN
        RETURN QUERY SELECT 
            v_contract_price.contract_unit_price,
            'TIER_1_CONTRACT_SCHEDULE'::VARCHAR(40),
            format('Schedule %s', v_contract_price.schedule_code)::VARCHAR(150),
            v_contract_price.discount_off_list_percent,
            v_contract_price.currency,
            TRUE;
        RETURN;
    END IF;

    -- Step 2: Contract Scope Discount applied to list_price
    SELECT cs.tier_discount_percent, c.contract_number
    INTO v_scope
    FROM public.facility_vendor_contract_scopes cs
    JOIN public.facility_vendor_contracts c ON cs.contract_id = c.id
    WHERE c.facility_id = p_facility_id
      AND c.vendor_id = v_sku.vendor_id
      AND c.is_active = TRUE
      AND cs.is_active = TRUE
      AND cs.is_excluded = FALSE
      AND p_surgery_date >= c.effective_from
      AND p_surgery_date <= c.effective_to
      AND (
          cs.scope_type = 'ALL_VENDOR_PRODUCTS' OR
          (cs.scope_type = 'COMPONENT' AND cs.component_id = v_sku.component_id) OR
          (cs.scope_type = 'SKU_LINE_ITEM' AND cs.sku_id = p_sku_id)
      )
    ORDER BY 
        CASE cs.scope_type
            WHEN 'SKU_LINE_ITEM' THEN 1
            WHEN 'COMPONENT' THEN 2
            WHEN 'ALL_VENDOR_PRODUCTS' THEN 3
            ELSE 4
        END
    LIMIT 1;

    IF FOUND AND v_scope.tier_discount_percent > 0 THEN
        RETURN QUERY SELECT 
            ROUND(v_sku.list_price * (1 - (v_scope.tier_discount_percent / 100.0)), 4),
            'TIER_2_CONTRACT_SCOPE_DISCOUNT'::VARCHAR(40),
            format('Contract %s (Scope %s%%)', v_scope.contract_number, v_scope.tier_discount_percent)::VARCHAR(150),
            v_scope.tier_discount_percent,
            'USD'::VARCHAR(3),
            TRUE;
        RETURN;
    END IF;

    -- Step 3: Off-Contract Fallback
    RETURN QUERY SELECT 
        v_sku.list_price,
        'TIER_5_LIST_PRICE_UNVERIFIED'::VARCHAR(40),
        'Catalog List Price (Off-Contract)'::VARCHAR(150),
        0.00::NUMERIC(5, 2),
        'USD'::VARCHAR(3),
        FALSE;
    RETURN;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- ==============================================================================
-- 9. ROW-LEVEL SECURITY POLICIES
-- ==============================================================================

ALTER TABLE public.facility_implant_price_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_implant_sku_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.implant_supplier_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.implant_supplier_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_device_cost_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.implant_benchmark_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_implant_price_audits ENABLE ROW LEVEL SECURITY;

-- Price Schedules
CREATE POLICY "facility_implant_price_schedules_select" ON public.facility_implant_price_schedules
    FOR SELECT TO authenticated
    USING (
        facility_id IN (SELECT public.get_auth_user_facilities())
    );

CREATE POLICY "facility_implant_price_schedules_modify" ON public.facility_implant_price_schedules
    FOR ALL TO authenticated
    USING (
        facility_id IN (SELECT public.get_auth_user_facilities())
    )
    WITH CHECK (
        facility_id IN (SELECT public.get_auth_user_facilities())
    );

-- SKU Prices
CREATE POLICY "facility_implant_sku_prices_select" ON public.facility_implant_sku_prices
    FOR SELECT TO authenticated
    USING (
        facility_id IN (SELECT public.get_auth_user_facilities())
    );

CREATE POLICY "facility_implant_sku_prices_modify" ON public.facility_implant_sku_prices
    FOR ALL TO authenticated
    USING (
        facility_id IN (SELECT public.get_auth_user_facilities())
    )
    WITH CHECK (
        facility_id IN (SELECT public.get_auth_user_facilities())
    );

-- Supplier Invoices
CREATE POLICY "implant_supplier_invoices_select" ON public.implant_supplier_invoices
    FOR SELECT TO authenticated
    USING (
        facility_id IN (SELECT public.get_auth_user_facilities())
    );

CREATE POLICY "implant_supplier_invoices_modify" ON public.implant_supplier_invoices
    FOR ALL TO authenticated
    USING (
        facility_id IN (SELECT public.get_auth_user_facilities())
    )
    WITH CHECK (
        facility_id IN (SELECT public.get_auth_user_facilities())
    );

-- Invoice Lines
CREATE POLICY "implant_supplier_invoice_lines_select" ON public.implant_supplier_invoice_lines
    FOR SELECT TO authenticated
    USING (
        facility_id IN (SELECT public.get_auth_user_facilities())
    );

CREATE POLICY "implant_supplier_invoice_lines_modify" ON public.implant_supplier_invoice_lines
    FOR ALL TO authenticated
    USING (
        facility_id IN (SELECT public.get_auth_user_facilities())
    )
    WITH CHECK (
        facility_id IN (SELECT public.get_auth_user_facilities())
    );

-- Cost Allocations
CREATE POLICY "case_device_cost_allocations_select" ON public.case_device_cost_allocations
    FOR SELECT TO authenticated
    USING (
        facility_id IN (SELECT public.get_auth_user_facilities())
    );

CREATE POLICY "case_device_cost_allocations_modify" ON public.case_device_cost_allocations
    FOR ALL TO authenticated
    USING (
        facility_id IN (SELECT public.get_auth_user_facilities())
    )
    WITH CHECK (
        facility_id IN (SELECT public.get_auth_user_facilities())
    );

-- Benchmark Prices (Accessible globally or by facility)
CREATE POLICY "implant_benchmark_prices_select" ON public.implant_benchmark_prices
    FOR SELECT TO authenticated
    USING (
        (facility_id IS NULL OR facility_id IN (SELECT public.get_auth_user_facilities()))
    );

-- Price Audits
CREATE POLICY "facility_implant_price_audits_select" ON public.facility_implant_price_audits
    FOR SELECT TO authenticated
    USING (
        facility_id IN (SELECT public.get_auth_user_facilities())
    );

-- ==============================================================================
-- 10. SEED BASELINE DATA (Naples Surgery Center: 00000000-0000-0000-0000-000000000002)
-- ==============================================================================

DO $$
DECLARE
    v_fac_id UUID := '00000000-0000-0000-0000-000000000002';
    v_stryker_id UUID := '00000000-0000-0000-0053-000000000001';
    v_zim_id UUID := '00000000-0000-0000-0053-000000000002';
    v_admin_id UUID := '00000000-0000-0000-0001-000000000001';
    v_cfo_id UUID := '00000000-0000-0000-0001-000000000002';
    v_contract_id UUID;
    v_schedule_id UUID;
    v_invoice_id UUID;
    v_femoral_sku UUID := '00000000-0000-0000-0054-000000000001';
    v_tibial_sku UUID := '00000000-0000-0000-0054-000000000002';
    v_insert_sku UUID := '00000000-0000-0000-0054-000000000003';
    v_patella_sku UUID := '00000000-0000-0000-0054-000000000004';
BEGIN
    -- Check if vendor and SKUs exist
    IF EXISTS (SELECT 1 FROM public.implant_vendors WHERE id = v_stryker_id) AND
       EXISTS (SELECT 1 FROM public.implant_product_skus WHERE id = v_femoral_sku) THEN

        -- Find Stryker contract
        SELECT id INTO v_contract_id
        FROM public.facility_vendor_contracts
        WHERE facility_id = v_fac_id AND vendor_id = v_stryker_id
        LIMIT 1;

        -- 1. Create Price Schedule
        INSERT INTO public.facility_implant_price_schedules (
            id, facility_id, vendor_id, contract_id, schedule_code, schedule_name,
            description, pricing_model, currency, effective_from, effective_to,
            status, is_active, approved_by, approved_at, created_by
        ) VALUES (
            '00000000-0000-0000-0057-000000000001',
            v_fac_id, v_stryker_id, v_contract_id, 'SCH-STR-2026-01',
            'Stryker Orthopaedics Master Joint Fee Schedule 2026',
            'Authoritative contracted unit prices for Triathlon Knee & Accolade Hip items',
            'FIXED_FEE_SCHEDULE', 'USD', '2026-01-01', '2026-12-31',
            'active', TRUE, v_cfo_id, NOW(), v_admin_id
        ) ON CONFLICT (id) DO NOTHING;

        -- 2. Itemized SKU Prices
        INSERT INTO public.facility_implant_sku_prices (
            id, price_schedule_id, facility_id, sku_id, vendor_id,
            contract_unit_price, list_price_at_signing, unit_of_measure, package_quantity,
            effective_from, effective_to, status, is_active
        ) VALUES
        (
            '00000000-0000-0000-0057-skuprice-0001',
            '00000000-0000-0000-0057-000000000001', v_fac_id, v_femoral_sku, v_stryker_id,
            1450.0000, 2850.0000, 'EA', 1, '2026-01-01', '2026-12-31', 'active', TRUE
        ),
        (
            '00000000-0000-0000-0057-skuprice-0002',
            '00000000-0000-0000-0057-000000000001', v_fac_id, v_tibial_sku, v_stryker_id,
            980.0000, 1950.0000, 'EA', 1, '2026-01-01', '2026-12-31', 'active', TRUE
        ),
        (
            '00000000-0000-0000-0057-skuprice-0003',
            '00000000-0000-0000-0057-000000000001', v_fac_id, v_insert_sku, v_stryker_id,
            550.0000, 1200.0000, 'EA', 1, '2026-01-01', '2026-12-31', 'active', TRUE
        ),
        (
            '00000000-0000-0000-0057-skuprice-0004',
            '00000000-0000-0000-0057-000000000001', v_fac_id, v_patella_sku, v_stryker_id,
            320.0000, 650.0000, 'EA', 1, '2026-01-01', '2026-12-31', 'active', TRUE
        )
        ON CONFLICT DO NOTHING;

        -- 3. Supplier Invoice Example
        INSERT INTO public.implant_supplier_invoices (
            id, facility_id, vendor_id, contract_id, invoice_number,
            invoice_date, due_date, subtotal_amount, freight_amount, tax_amount,
            discount_amount, total_amount, reconciliation_status, approved_by, approved_at
        ) VALUES (
            '00000000-0000-0000-0057-invoice-0001',
            v_fac_id, v_stryker_id, v_contract_id, 'INV-STR-2026-8901',
            '2026-02-15', '2026-03-17', 3300.00, 0.00, 0.00, 66.00, 3234.00,
            'fully_matched', v_cfo_id, NOW()
        ) ON CONFLICT (id) DO NOTHING;

        -- 4. Supplier Invoice Lines
        INSERT INTO public.implant_supplier_invoice_lines (
            id, invoice_id, facility_id, line_number, sku_id,
            vendor_catalog_number, vendor_description, billed_quantity,
            billed_unit_cost, extended_cost, contract_sku_price_id, contract_unit_price,
            match_status
        ) VALUES
        (
            '00000000-0000-0000-0057-invline-0001',
            '00000000-0000-0000-0057-invoice-0001', v_fac_id, 1, v_femoral_sku,
            '5510-F-401', 'Triathlon CR Femoral Component Size 4', 1,
            1450.0000, 1450.00, '00000000-0000-0000-0057-skuprice-0001', 1450.0000,
            'MATCHED_CLEAN'
        ),
        (
            '00000000-0000-0000-0057-invline-0002',
            '00000000-0000-0000-0057-invoice-0001', v_fac_id, 2, v_tibial_sku,
            '5520-B-400', 'Triathlon Primary Tibial Baseplate Size 4', 1,
            980.0000, 980.00, '00000000-0000-0000-0057-skuprice-0002', 980.0000,
            'MATCHED_CLEAN'
        )
        ON CONFLICT DO NOTHING;

        -- 5. Benchmark Data
        INSERT INTO public.implant_benchmark_prices (
            id, facility_id, sku_id, source_name, benchmark_type, specialty,
            percentile_25_unit_cost, median_unit_cost, percentile_75_unit_cost,
            sample_size_cases, benchmark_year_quarter, effective_from, effective_to
        ) VALUES
        (
            '00000000-0000-0000-0057-bench-0001',
            v_fac_id, v_femoral_sku, 'Vizient Regional ASC Cohort', 'REGIONAL_ASC_COHORT', 'Orthopedics',
            1320.00, 1460.00, 1680.00, 240, '2026-Q1', '2026-01-01', '2026-12-31'
        ),
        (
            '00000000-0000-0000-0057-bench-0002',
            v_fac_id, v_tibial_sku, 'Vizient Regional ASC Cohort', 'REGIONAL_ASC_COHORT', 'Orthopedics',
            890.00, 995.00, 1150.00, 240, '2026-Q1', '2026-01-01', '2026-12-31'
        )
        ON CONFLICT DO NOTHING;

    END IF;
END $$;

COMMIT;
