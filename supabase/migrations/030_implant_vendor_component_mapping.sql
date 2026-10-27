-- ==============================================================================
-- MIGRATION: 030_implant_vendor_component_mapping.sql
-- DESCRIPTION: Phase 55 Vendor-to-Implant Component Mapping, Sourcing
--              Governance, Preference Tiering, and Multi-Facility Matrix.
-- PLATFORM: Supabase PostgreSQL 15+
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. TABLE: public.implant_vendor_component_mappings
-- Master commercial-to-clinical capability and facility governance matrix
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.implant_vendor_component_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE, -- NULL = Global Baseline, Set = Facility Custom / Override
    vendor_id UUID NOT NULL REFERENCES public.implant_vendors(id) ON DELETE RESTRICT,
    component_id UUID NOT NULL REFERENCES public.implant_components(id) ON DELETE RESTRICT,
    
    -- Sourcing Governance & Preference
    preference_tier VARCHAR(30) NOT NULL DEFAULT 'STANDARD'
        CHECK (preference_tier IN ('PREFERRED', 'STANDARD', 'SECONDARY', 'NON_PREFERRED', 'RESTRICTED')),
    sourcing_model VARCHAR(30) NOT NULL DEFAULT 'DIRECT_OEM'
        CHECK (sourcing_model IN ('DIRECT_OEM', 'DISTRIBUTOR_CONSIGNMENT', 'BILL_ONLY', 'LOANER_SET')),
    authorized_distributor_id UUID REFERENCES public.implant_vendors(id) ON DELETE RESTRICT,
    
    -- Contract Reference & Logistics
    contract_reference_number VARCHAR(100),
    lead_time_days INTEGER DEFAULT 3 CHECK (lead_time_days >= 0),
    consignment_stock_maintained BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Temporal Boundaries
    effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
    termination_date DATE DEFAULT NULL,
    
    -- Status & Lifecycle Governance
    status VARCHAR(30) NOT NULL DEFAULT 'active'
        CHECK (status IN ('draft', 'pending_approval', 'active', 'suspended', 'terminated', 'rejected')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Approval Governance (Two-Person Rule / Administrative Override)
    approval_status VARCHAR(30) NOT NULL DEFAULT 'approved'
        CHECK (approval_status IN ('draft', 'submitted', 'approved', 'rejected')),
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ DEFAULT NULL,
    rejection_reason TEXT DEFAULT NULL,
    
    -- Clinical Notes & Rationale
    clinical_notes TEXT,
    governance_rationale TEXT,
    
    -- Provenance & Metadata
    source_system VARCHAR(50) NOT NULL DEFAULT 'manual_entry'
        CHECK (source_system IN ('manufacturer_catalog', 'ghx_edi', 'contract_management', 'manual_entry', 'legacy_import')),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Table Constraints
    CONSTRAINT chk_mapping_dates CHECK (termination_date IS NULL OR termination_date >= effective_date),
    CONSTRAINT chk_mapping_active_sync CHECK (is_active = (status = 'active')),
    CONSTRAINT chk_mapping_distributor_role CHECK (
        authorized_distributor_id IS NULL OR sourcing_model = 'DISTRIBUTOR_CONSIGNMENT'
    )
);

-- ==============================================================================
-- 2. UNIQUE CONSTRAINTS & PERFORMANCE INDEXES
-- PostgreSQL 15+ NULLS NOT DISTINCT guarantees exactly one mapping record
-- per (vendor_id, component_id, facility_id) regardless of NULL facility scope.
-- ==============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_component_facility_mapping
    ON public.implant_vendor_component_mappings (vendor_id, component_id, facility_id)
    NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_ivcm_vendor ON public.implant_vendor_component_mappings(vendor_id);
CREATE INDEX IF NOT EXISTS idx_ivcm_component ON public.implant_vendor_component_mappings(component_id);
CREATE INDEX IF NOT EXISTS idx_ivcm_facility ON public.implant_vendor_component_mappings(facility_id);
CREATE INDEX IF NOT EXISTS idx_ivcm_status ON public.implant_vendor_component_mappings(status);
CREATE INDEX IF NOT EXISTS idx_ivcm_active ON public.implant_vendor_component_mappings(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_ivcm_tier ON public.implant_vendor_component_mappings(preference_tier);
CREATE INDEX IF NOT EXISTS idx_ivcm_dates ON public.implant_vendor_component_mappings(effective_date, termination_date);

-- ==============================================================================
-- 3. PROCEDURAL TRIGGERS & INTEGRITY GUARDS
-- ==============================================================================

-- 3.1 Touch updated_at
DROP TRIGGER IF EXISTS trg_touch_implant_vendor_component_mappings ON public.implant_vendor_component_mappings;
CREATE TRIGGER trg_touch_implant_vendor_component_mappings
    BEFORE UPDATE ON public.implant_vendor_component_mappings
    FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

-- 3.2 Hard-Delete Protection Trigger
CREATE OR REPLACE FUNCTION public.fn_prevent_active_mapping_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.is_active = TRUE THEN
        RAISE EXCEPTION 'Cannot hard delete active vendor-component mapping (ID: %). Set status to terminated instead.', OLD.id;
    END IF;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_active_mapping_delete ON public.implant_vendor_component_mappings;
CREATE TRIGGER trg_prevent_active_mapping_delete
    BEFORE DELETE ON public.implant_vendor_component_mappings
    FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_active_mapping_hard_delete();

-- 3.3 Prevent Cross-Facility Relocation Trigger
CREATE OR REPLACE FUNCTION public.fn_prevent_facility_relocation_implant_mappings()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.facility_id IS DISTINCT FROM NEW.facility_id THEN
        RAISE EXCEPTION 'Immutable facility context: cannot move mapping (ID: %) from facility % to %.',
            OLD.id, OLD.facility_id, NEW.facility_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_facility_relocation_implant_mappings ON public.implant_vendor_component_mappings;
CREATE TRIGGER trg_prevent_facility_relocation_implant_mappings
    BEFORE UPDATE OF facility_id ON public.implant_vendor_component_mappings
    FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_facility_relocation_implant_mappings();

-- 3.4 Audit Ledger Trigger (Phase 24 Standards)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'fn_audit_log_trigger'
    ) THEN
        DROP TRIGGER IF EXISTS trg_audit_implant_vendor_component_mappings ON public.implant_vendor_component_mappings;
        CREATE TRIGGER trg_audit_implant_vendor_component_mappings
            AFTER INSERT OR UPDATE OR DELETE ON public.implant_vendor_component_mappings
            FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();
    END IF;
END $$;

-- ==============================================================================
-- 4. AUTHORITATIVE STORED PROCEDURES
-- ==============================================================================

-- 4.1 Upsert Vendor-to-Component Mapping
CREATE OR REPLACE FUNCTION public.fn_upsert_vendor_component_mapping(
    p_mapping_id UUID,
    p_facility_id UUID,
    p_vendor_id UUID,
    p_component_id UUID,
    p_preference_tier VARCHAR,
    p_sourcing_model VARCHAR,
    p_authorized_distributor_id UUID,
    p_contract_reference_number VARCHAR,
    p_lead_time_days INTEGER,
    p_consignment_stock_maintained BOOLEAN,
    p_effective_date DATE,
    p_termination_date DATE,
    p_clinical_notes TEXT,
    p_governance_rationale TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_id UUID;
    v_resolved_mapping_id UUID;
    v_vendor_type VARCHAR;
    v_vendor_active BOOLEAN;
    v_component_active BOOLEAN;
BEGIN
    v_actor_id := auth.uid();

    -- Verify Tenant Authorization
    IF p_facility_id IS NOT NULL THEN
        IF v_actor_id IS NOT NULL AND NOT public.user_has_facility_role(p_facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'clinical_director']) THEN
            RAISE EXCEPTION 'Permission denied: Caller does not possess catalog governance authority for facility %.', p_facility_id;
        END IF;
    ELSE
        IF v_actor_id IS NOT NULL AND NOT public.user_has_facility_role(NULL, ARRAY['super_admin']) THEN
            RAISE EXCEPTION 'Permission denied: Only super administrators can author global baseline mappings.';
        END IF;
    END IF;

    -- Validate Upstream Vendor
    SELECT vendor_type, is_active INTO v_vendor_type, v_vendor_active
    FROM public.implant_vendors WHERE id = p_vendor_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Referenced vendor ID % does not exist in master directory.', p_vendor_id;
    END IF;
    IF v_vendor_active = FALSE THEN
        RAISE EXCEPTION 'Cannot create mapping for inactive vendor (ID: %).', p_vendor_id;
    END IF;
    IF v_vendor_type NOT IN ('MANUFACTURER', 'TISSUE_BANK') THEN
        RAISE EXCEPTION 'Only MANUFACTURER and TISSUE_BANK vendors can be mapped directly to clinical components. Got %.', v_vendor_type;
    END IF;

    -- Validate Upstream Component
    SELECT is_active INTO v_component_active
    FROM public.implant_components WHERE id = p_component_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Referenced clinical component ID % does not exist.', p_component_id;
    END IF;

    -- Validate Distributor Linkage if Consignment
    IF p_sourcing_model = 'DISTRIBUTOR_CONSIGNMENT' AND p_authorized_distributor_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.implant_vendors
            WHERE id = p_authorized_distributor_id AND vendor_type = 'DISTRIBUTOR' AND is_active = TRUE
        ) THEN
            RAISE EXCEPTION 'Referenced distributor ID % is not an active distributor.', p_authorized_distributor_id;
        END IF;
    END IF;

    -- Execute Upsert
    INSERT INTO public.implant_vendor_component_mappings (
        id, facility_id, vendor_id, component_id,
        preference_tier, sourcing_model, authorized_distributor_id,
        contract_reference_number, lead_time_days, consignment_stock_maintained,
        effective_date, termination_date, clinical_notes, governance_rationale,
        status, is_active, approval_status, created_by, updated_by
    ) VALUES (
        COALESCE(p_mapping_id, gen_random_uuid()),
        p_facility_id, p_vendor_id, p_component_id,
        COALESCE(p_preference_tier, 'STANDARD'),
        COALESCE(p_sourcing_model, 'DIRECT_OEM'),
        p_authorized_distributor_id,
        TRIM(p_contract_reference_number),
        COALESCE(p_lead_time_days, 3),
        COALESCE(p_consignment_stock_maintained, FALSE),
        COALESCE(p_effective_date, CURRENT_DATE),
        p_termination_date,
        TRIM(p_clinical_notes),
        TRIM(p_governance_rationale),
        'active', TRUE, 'approved', v_actor_id, v_actor_id
    )
    ON CONFLICT (vendor_id, component_id, facility_id) NULLS NOT DISTINCT
    DO UPDATE SET
        preference_tier = EXCLUDED.preference_tier,
        sourcing_model = EXCLUDED.sourcing_model,
        authorized_distributor_id = EXCLUDED.authorized_distributor_id,
        contract_reference_number = EXCLUDED.contract_reference_number,
        lead_time_days = EXCLUDED.lead_time_days,
        consignment_stock_maintained = EXCLUDED.consignment_stock_maintained,
        effective_date = EXCLUDED.effective_date,
        termination_date = EXCLUDED.termination_date,
        clinical_notes = EXCLUDED.clinical_notes,
        governance_rationale = EXCLUDED.governance_rationale,
        status = 'active',
        is_active = TRUE,
        updated_by = v_actor_id,
        updated_at = NOW()
    RETURNING id INTO v_resolved_mapping_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'mapping_id', v_resolved_mapping_id,
        'message', 'Vendor-component mapping successfully established.'
    );
END;
$$;

-- 4.2 Deactivate / Terminate Mapping
CREATE OR REPLACE FUNCTION public.fn_deactivate_vendor_component_mapping(
    p_mapping_id UUID,
    p_rationale TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_id UUID;
    v_facility_id UUID;
BEGIN
    v_actor_id := auth.uid();
    
    SELECT facility_id INTO v_facility_id
    FROM public.implant_vendor_component_mappings WHERE id = p_mapping_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Vendor-component mapping not found with ID: %', p_mapping_id;
    END IF;

    IF v_facility_id IS NOT NULL THEN
        IF v_actor_id IS NOT NULL AND NOT public.user_has_facility_role(v_facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'clinical_director']) THEN
            RAISE EXCEPTION 'Permission denied for facility %.', v_facility_id;
        END IF;
    ELSE
        IF v_actor_id IS NOT NULL AND NOT public.user_has_facility_role(NULL, ARRAY['super_admin']) THEN
            RAISE EXCEPTION 'Permission denied: Only super administrators can terminate global mappings.';
        END IF;
    END IF;

    IF p_rationale IS NULL OR TRIM(p_rationale) = '' THEN
        RAISE EXCEPTION 'Deactivation rationale is required.';
    END IF;

    UPDATE public.implant_vendor_component_mappings
    SET status = 'terminated',
        is_active = FALSE,
        termination_date = COALESCE(termination_date, CURRENT_DATE),
        governance_rationale = TRIM(p_rationale),
        updated_by = v_actor_id,
        updated_at = NOW()
    WHERE id = p_mapping_id;

    RETURN jsonb_build_object('success', TRUE, 'mapping_id', p_mapping_id, 'status', 'terminated');
END;
$$;

-- 4.3 Reactivate Terminated Mapping
CREATE OR REPLACE FUNCTION public.fn_reactivate_vendor_component_mapping(
    p_mapping_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_id UUID;
    v_facility_id UUID;
BEGIN
    v_actor_id := auth.uid();
    
    SELECT facility_id INTO v_facility_id
    FROM public.implant_vendor_component_mappings WHERE id = p_mapping_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Vendor-component mapping not found with ID: %', p_mapping_id;
    END IF;

    IF v_facility_id IS NOT NULL THEN
        IF v_actor_id IS NOT NULL AND NOT public.user_has_facility_role(v_facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo']) THEN
            RAISE EXCEPTION 'Permission denied for facility %.', v_facility_id;
        END IF;
    ELSE
        IF v_actor_id IS NOT NULL AND NOT public.user_has_facility_role(NULL, ARRAY['super_admin']) THEN
            RAISE EXCEPTION 'Permission denied: Only super administrators can reactivate global mappings.';
        END IF;
    END IF;

    UPDATE public.implant_vendor_component_mappings
    SET status = 'active',
        is_active = TRUE,
        termination_date = NULL,
        updated_by = v_actor_id,
        updated_at = NOW()
    WHERE id = p_mapping_id;

    RETURN jsonb_build_object('success', TRUE, 'mapping_id', p_mapping_id, 'status', 'active');
END;
$$;

-- 4.4 Change Preference Tier
CREATE OR REPLACE FUNCTION public.fn_change_mapping_preference_tier(
    p_mapping_id UUID,
    p_new_tier VARCHAR,
    p_rationale TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_id UUID;
    v_facility_id UUID;
BEGIN
    v_actor_id := auth.uid();
    
    IF p_new_tier NOT IN ('PREFERRED', 'STANDARD', 'SECONDARY', 'NON_PREFERRED', 'RESTRICTED') THEN
        RAISE EXCEPTION 'Invalid preference tier: %', p_new_tier;
    END IF;

    SELECT facility_id INTO v_facility_id
    FROM public.implant_vendor_component_mappings WHERE id = p_mapping_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Vendor-component mapping not found with ID: %', p_mapping_id;
    END IF;

    IF v_facility_id IS NOT NULL THEN
        IF v_actor_id IS NOT NULL AND NOT public.user_has_facility_role(v_facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'clinical_director']) THEN
            RAISE EXCEPTION 'Permission denied for facility %.', v_facility_id;
        END IF;
    ELSE
        IF v_actor_id IS NOT NULL AND NOT public.user_has_facility_role(NULL, ARRAY['super_admin']) THEN
            RAISE EXCEPTION 'Permission denied: Only super administrators can change global mapping tiers.';
        END IF;
    END IF;

    UPDATE public.implant_vendor_component_mappings
    SET preference_tier = p_new_tier,
        governance_rationale = COALESCE(TRIM(p_rationale), governance_rationale),
        updated_by = v_actor_id,
        updated_at = NOW()
    WHERE id = p_mapping_id;

    RETURN jsonb_build_object('success', TRUE, 'mapping_id', p_mapping_id, 'preference_tier', p_new_tier);
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.fn_upsert_vendor_component_mapping TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.fn_deactivate_vendor_component_mapping TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.fn_reactivate_vendor_component_mapping TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.fn_change_mapping_preference_tier TO authenticated, anon;

-- ==============================================================================
-- 5. ROW-LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.implant_vendor_component_mappings ENABLE ROW LEVEL SECURITY;

-- 5.1 SELECT Policy: Global baselines visible to all; facility records visible to members
DROP POLICY IF EXISTS "ivcm_select_policy" ON public.implant_vendor_component_mappings;
CREATE POLICY "ivcm_select_policy" ON public.implant_vendor_component_mappings
    FOR SELECT TO authenticated, anon
    USING (
        facility_id IS NULL OR
        facility_id IN (SELECT public.get_auth_user_facilities()) OR
        auth.uid() IS NULL
    );

-- 5.2 INSERT Policy
DROP POLICY IF EXISTS "ivcm_insert_policy" ON public.implant_vendor_component_mappings;
CREATE POLICY "ivcm_insert_policy" ON public.implant_vendor_component_mappings
    FOR INSERT TO authenticated, anon
    WITH CHECK (
        auth.uid() IS NULL OR
        (facility_id IS NULL AND public.user_has_facility_role(NULL, ARRAY['super_admin'])) OR
        (
            facility_id IS NOT NULL AND
            facility_id IN (SELECT public.get_auth_user_facilities()) AND
            public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'clinical_director'])
        )
    );

-- 5.3 UPDATE Policy
DROP POLICY IF EXISTS "ivcm_update_policy" ON public.implant_vendor_component_mappings;
CREATE POLICY "ivcm_update_policy" ON public.implant_vendor_component_mappings
    FOR UPDATE TO authenticated, anon
    USING (
        auth.uid() IS NULL OR
        (facility_id IS NULL AND public.user_has_facility_role(NULL, ARRAY['super_admin'])) OR
        (
            facility_id IS NOT NULL AND
            facility_id IN (SELECT public.get_auth_user_facilities()) AND
            public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'clinical_director'])
        )
    )
    WITH CHECK (
        auth.uid() IS NULL OR
        (facility_id IS NULL AND public.user_has_facility_role(NULL, ARRAY['super_admin'])) OR
        (
            facility_id IS NOT NULL AND
            facility_id IN (SELECT public.get_auth_user_facilities()) AND
            public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'clinical_director'])
        )
    );

-- 5.4 DELETE Policy
DROP POLICY IF EXISTS "ivcm_delete_policy" ON public.implant_vendor_component_mappings;
CREATE POLICY "ivcm_delete_policy" ON public.implant_vendor_component_mappings
    FOR DELETE TO authenticated, anon
    USING (
        auth.uid() IS NULL OR
        (
            is_active = FALSE AND
            (
                (facility_id IS NULL AND public.user_has_facility_role(NULL, ARRAY['super_admin'])) OR
                (
                    facility_id IS NOT NULL AND
                    facility_id IN (SELECT public.get_auth_user_facilities()) AND
                    public.user_has_facility_role(facility_id, ARRAY['super_admin', 'facility_admin'])
                )
            )
        )
    );

-- ==============================================================================
-- 6. SEED GLOBAL BASELINE CAPABILITIES (OEMs & COMPONENTS)
-- ==============================================================================

-- 6.1 Stryker Orthopaedics (Knee & Hip Components)
INSERT INTO public.implant_vendor_component_mappings (
    id, facility_id, vendor_id, component_id, preference_tier, sourcing_model,
    lead_time_days, consignment_stock_maintained, effective_date, status, is_active,
    clinical_notes, governance_rationale, source_system
)
SELECT 
    '00000000-0000-0000-0055-000000000001'::UUID, NULL, v.id, c.id,
    'PREFERRED', 'DIRECT_OEM', 2, TRUE, '2026-01-01', 'active', TRUE,
    'Triathlon Single-Radius Knee platform primary sourcing', 'Primary contracted total knee vendor', 'manufacturer_catalog'
FROM public.implant_vendors v, public.implant_components c
WHERE v.vendor_code = 'STRYKER' AND v.facility_id IS NULL
  AND c.code = 'KNEE_FEMORAL' AND c.facility_id IS NULL
ON CONFLICT (vendor_id, component_id, facility_id) NULLS NOT DISTINCT DO NOTHING;

INSERT INTO public.implant_vendor_component_mappings (
    id, facility_id, vendor_id, component_id, preference_tier, sourcing_model,
    lead_time_days, consignment_stock_maintained, effective_date, status, is_active,
    clinical_notes, governance_rationale, source_system
)
SELECT 
    '00000000-0000-0000-0055-000000000002'::UUID, NULL, v.id, c.id,
    'PREFERRED', 'DIRECT_OEM', 2, TRUE, '2026-01-01', 'active', TRUE,
    'Triathlon Universal Tibial Tray and Baseplate', 'Primary contracted total knee vendor', 'manufacturer_catalog'
FROM public.implant_vendors v, public.implant_components c
WHERE v.vendor_code = 'STRYKER' AND v.facility_id IS NULL
  AND c.code = 'KNEE_TIBIAL_TRAY' AND c.facility_id IS NULL
ON CONFLICT (vendor_id, component_id, facility_id) NULLS NOT DISTINCT DO NOTHING;

INSERT INTO public.implant_vendor_component_mappings (
    id, facility_id, vendor_id, component_id, preference_tier, sourcing_model,
    lead_time_days, consignment_stock_maintained, effective_date, status, is_active,
    clinical_notes, governance_rationale, source_system
)
SELECT 
    '00000000-0000-0000-0055-000000000003'::UUID, NULL, v.id, c.id,
    'PREFERRED', 'DIRECT_OEM', 2, TRUE, '2026-01-01', 'active', TRUE,
    'Accolade II / Secur-Fit Advanced Femoral Hip Stem', 'Primary primary hip stem contracted source', 'manufacturer_catalog'
FROM public.implant_vendors v, public.implant_components c
WHERE v.vendor_code = 'STRYKER' AND v.facility_id IS NULL
  AND c.code = 'HIP_STEM' AND c.facility_id IS NULL
ON CONFLICT (vendor_id, component_id, facility_id) NULLS NOT DISTINCT DO NOTHING;

INSERT INTO public.implant_vendor_component_mappings (
    id, facility_id, vendor_id, component_id, preference_tier, sourcing_model,
    lead_time_days, consignment_stock_maintained, effective_date, status, is_active,
    clinical_notes, governance_rationale, source_system
)
SELECT 
    '00000000-0000-0000-0055-000000000004'::UUID, NULL, v.id, c.id,
    'PREFERRED', 'DIRECT_OEM', 2, TRUE, '2026-01-01', 'active', TRUE,
    'Trident II Tritanium Acetabular Cup System', 'Primary hemispherical acetabular shell platform', 'manufacturer_catalog'
FROM public.implant_vendors v, public.implant_components c
WHERE v.vendor_code = 'STRYKER' AND v.facility_id IS NULL
  AND c.code = 'HIP_CUP' AND c.facility_id IS NULL
ON CONFLICT (vendor_id, component_id, facility_id) NULLS NOT DISTINCT DO NOTHING;

-- 6.2 Zimmer Biomet (Knee & Hip Components)
INSERT INTO public.implant_vendor_component_mappings (
    id, facility_id, vendor_id, component_id, preference_tier, sourcing_model,
    lead_time_days, consignment_stock_maintained, effective_date, status, is_active,
    clinical_notes, governance_rationale, source_system
)
SELECT 
    '00000000-0000-0000-0055-000000000005'::UUID, NULL, v.id, c.id,
    'SECONDARY', 'DIRECT_OEM', 3, TRUE, '2026-01-01', 'active', TRUE,
    'Persona Personalized Knee System femoral component', 'Secondary contracted total knee platform', 'manufacturer_catalog'
FROM public.implant_vendors v, public.implant_components c
WHERE v.vendor_code = 'ZIMMER_BIOMET' AND v.facility_id IS NULL
  AND c.code = 'KNEE_FEMORAL' AND c.facility_id IS NULL
ON CONFLICT (vendor_id, component_id, facility_id) NULLS NOT DISTINCT DO NOTHING;

INSERT INTO public.implant_vendor_component_mappings (
    id, facility_id, vendor_id, component_id, preference_tier, sourcing_model,
    lead_time_days, consignment_stock_maintained, effective_date, status, is_active,
    clinical_notes, governance_rationale, source_system
)
SELECT 
    '00000000-0000-0000-0055-000000000006'::UUID, NULL, v.id, c.id,
    'SECONDARY', 'DIRECT_OEM', 3, TRUE, '2026-01-01', 'active', TRUE,
    'Persona Anatomical Tibial Baseplate System', 'Secondary contracted total knee platform', 'manufacturer_catalog'
FROM public.implant_vendors v, public.implant_components c
WHERE v.vendor_code = 'ZIMMER_BIOMET' AND v.facility_id IS NULL
  AND c.code = 'KNEE_TIBIAL_TRAY' AND c.facility_id IS NULL
ON CONFLICT (vendor_id, component_id, facility_id) NULLS NOT DISTINCT DO NOTHING;

-- 6.3 Medtronic Spine & Biologics
INSERT INTO public.implant_vendor_component_mappings (
    id, facility_id, vendor_id, component_id, preference_tier, sourcing_model,
    lead_time_days, consignment_stock_maintained, effective_date, status, is_active,
    clinical_notes, governance_rationale, source_system
)
SELECT 
    '00000000-0000-0000-0055-000000000007'::UUID, NULL, v.id, c.id,
    'PREFERRED', 'DIRECT_OEM', 2, TRUE, '2026-01-01', 'active', TRUE,
    'Polaris 5.5 Polyaxial & TSRH 3D Pedicle Fixation Screws', 'Standard posterior spinal instrumentation', 'manufacturer_catalog'
FROM public.implant_vendors v, public.implant_components c
WHERE v.vendor_code = 'MEDTRONIC' AND v.facility_id IS NULL
  AND c.code = 'SPINE_ACDF_SCREW' AND c.facility_id IS NULL
ON CONFLICT (vendor_id, component_id, facility_id) NULLS NOT DISTINCT DO NOTHING;

INSERT INTO public.implant_vendor_component_mappings (
    id, facility_id, vendor_id, component_id, preference_tier, sourcing_model,
    lead_time_days, consignment_stock_maintained, effective_date, status, is_active,
    clinical_notes, governance_rationale, source_system
)
SELECT 
    '00000000-0000-0000-0055-000000000008'::UUID, NULL, v.id, c.id,
    'PREFERRED', 'DIRECT_OEM', 2, TRUE, '2026-01-01', 'active', TRUE,
    'Clydesdale & Divergence Anterior Lumbar / Cervical PEEK Cages', 'Primary interbody fusion device supplier', 'manufacturer_catalog'
FROM public.implant_vendors v, public.implant_components c
WHERE v.vendor_code = 'MEDTRONIC' AND v.facility_id IS NULL
  AND c.code = 'SPINE_INTERBODY_CAGE' AND c.facility_id IS NULL
ON CONFLICT (vendor_id, component_id, facility_id) NULLS NOT DISTINCT DO NOTHING;

-- 6.4 Alcon (Ophthalmic Intraocular Lenses)
INSERT INTO public.implant_vendor_component_mappings (
    id, facility_id, vendor_id, component_id, preference_tier, sourcing_model,
    lead_time_days, consignment_stock_maintained, effective_date, status, is_active,
    clinical_notes, governance_rationale, source_system
)
SELECT 
    '00000000-0000-0000-0055-000000000009'::UUID, NULL, v.id, c.id,
    'PREFERRED', 'DIRECT_OEM', 1, TRUE, '2026-01-01', 'active', TRUE,
    'AcrySof IQ & Clareon Monofocal Aspheric IOL platform', 'Primary cataract monofocal lens supplier', 'manufacturer_catalog'
FROM public.implant_vendors v, public.implant_components c
WHERE v.vendor_code = 'ALCON' AND v.facility_id IS NULL
  AND c.code = 'IOL_MONOFOCAL' AND c.facility_id IS NULL
ON CONFLICT (vendor_id, component_id, facility_id) NULLS NOT DISTINCT DO NOTHING;

INSERT INTO public.implant_vendor_component_mappings (
    id, facility_id, vendor_id, component_id, preference_tier, sourcing_model,
    lead_time_days, consignment_stock_maintained, effective_date, status, is_active,
    clinical_notes, governance_rationale, source_system
)
SELECT 
    '00000000-0000-0000-0055-000000000010'::UUID, NULL, v.id, c.id,
    'PREFERRED', 'DIRECT_OEM', 1, TRUE, '2026-01-01', 'active', TRUE,
    'AcrySof IQ Toric & Clareon Toric Astigmatism IOLs', 'Primary premium toric cataract lens platform', 'manufacturer_catalog'
FROM public.implant_vendors v, public.implant_components c
WHERE v.vendor_code = 'ALCON' AND v.facility_id IS NULL
  AND c.code = 'IOL_TORIC' AND c.facility_id IS NULL
ON CONFLICT (vendor_id, component_id, facility_id) NULLS NOT DISTINCT DO NOTHING;

-- 6.5 Arthrex (Sports Medicine & Anchors)
INSERT INTO public.implant_vendor_component_mappings (
    id, facility_id, vendor_id, component_id, preference_tier, sourcing_model,
    lead_time_days, consignment_stock_maintained, effective_date, status, is_active,
    clinical_notes, governance_rationale, source_system
)
SELECT 
    '00000000-0000-0000-0055-000000000011'::UUID, NULL, v.id, c.id,
    'PREFERRED', 'DIRECT_OEM', 2, TRUE, '2026-01-01', 'active', TRUE,
    'SwiveLock & BioComposite SutureTak Rotator Cuff Suture Anchors', 'Standard sports medicine shoulder anchor construct', 'manufacturer_catalog'
FROM public.implant_vendors v, public.implant_components c
WHERE v.vendor_code = 'ARTHREX' AND v.facility_id IS NULL
  AND c.code = 'SHOULDER_ROTATOR_ANCHOR' AND c.facility_id IS NULL
ON CONFLICT (vendor_id, component_id, facility_id) NULLS NOT DISTINCT DO NOTHING;

COMMIT;
