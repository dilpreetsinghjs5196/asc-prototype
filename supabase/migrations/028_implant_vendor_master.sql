-- ==============================================================================
-- MIGRATION: 028_implant_vendor_master.sql
-- DESCRIPTION: Phase 53 — Implant Vendor Master, Manufacturer Taxonomy & Sourcing Governance
--              - Normalized master table: public.implant_vendors
--              - Relationship junction: public.implant_vendor_relationships
--              - Hybrid tenancy: global network baselines (facility_id IS NULL) + tenant extensions
--              - Deterministic code formatting and normalized legal name uniqueness
--              - Referential integrity: prevents hard delete of active/referenced vendors
--              - Tenant relocation prevention triggers
--              - Authoritative stored procedures: fn_create_or_update_vendor, fn_deactivate_implant_vendor
--              - PostgreSQL Row-Level Security (RLS) policies for hybrid baseline and tenant isolation
--              - Audit triggers via public.fn_audit_log_trigger()
--              - Global baseline seed taxonomy: 12 multinational OEMs + 3 national distributors
-- PLATFORM: Supabase PostgreSQL 15+ (ASCANALYST Enterprise)
-- DATE: 2026-10-27
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

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
-- 2. TABLE: public.implant_vendors
-- Master directory of medical device manufacturers, commercial distributors,
-- local sales agencies, and tissue banks.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.implant_vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE, -- NULL = Global Baseline, Set = Facility Custom
    
    -- Canonical Identification
    vendor_code VARCHAR(50) NOT NULL, -- e.g. 'STRYKER', 'ZIMMER_BIOMET', 'MEDLINE' (Uppercase)
    legal_name VARCHAR(200) NOT NULL, -- Official legal name: 'Howmedica Osteonics Corp.'
    display_name VARCHAR(150) NOT NULL, -- Commercial trade name: 'Stryker Orthopaedics'
    
    -- Classification & Clinical Domain
    vendor_type VARCHAR(50) NOT NULL DEFAULT 'MANUFACTURER'
        CHECK (vendor_type IN (
            'MANUFACTURER',       -- Original Device Manufacturer / 510(k) holder
            'DISTRIBUTOR',        -- Broadline or specialty medical-surgical distributor
            'GPO_CONGLOMERATE',   -- Group Purchasing Organization contracting entity
            'SALES_AGENCY',       -- Local independent sales rep group / 1099 distributor
            'TISSUE_BANK'         -- AATB accredited human tissue establishment / HCT/P
        )),
    specialties TEXT[] NOT NULL DEFAULT '{}', -- e.g. ARRAY['Orthopedics', 'Spine', 'Ophthalmology']
    
    -- Status & Lifecycle
    status VARCHAR(30) NOT NULL DEFAULT 'active'
        CHECK (status IN (
            'active',               -- Fully approved for contracting and case utilization
            'inactive',             -- Blocked from new contracts/orders; historical references valid
            'archived',             -- Permanently retired vendor
            'pending_verification'  -- Staged import or newly entered vendor awaiting compliance review
        )),
    is_active BOOLEAN NOT NULL DEFAULT TRUE, -- High-speed operational filter
    
    -- Corporate & Billing Metadata
    tax_id_ein VARCHAR(20), -- Federal EIN: 'XX-XXXXXXX' (Optional, AP 1099 tracking)
    duns_number VARCHAR(20), -- Dun & Bradstreet 9-digit corporate identifier
    fda_establishment_identifier VARCHAR(50), -- FDA FEI / Registration Number (Manufacturers & Tissue Banks)
    
    -- Business Communications (Strictly professional, non-PII)
    business_email VARCHAR(150), -- General order / customer service email
    business_phone VARCHAR(50), -- Main business switchboard
    website VARCHAR(255), -- Corporate website URL
    
    -- Physical / Remittance Address
    address_line1 VARCHAR(150),
    address_line2 VARCHAR(150),
    city VARCHAR(100),
    state VARCHAR(50),
    postal_code VARCHAR(20),
    country VARCHAR(50) NOT NULL DEFAULT 'USA',
    
    -- Primary Professional Representative / Account Manager
    rep_name VARCHAR(150), -- Designated territory account executive
    rep_email VARCHAR(150),
    rep_phone VARCHAR(50),
    
    -- Provenance & Sourcing Integrity
    source_system VARCHAR(50) NOT NULL DEFAULT 'manual_entry'
        CHECK (source_system IN (
            'manual_entry',       -- Created manually via UI by authorized admin
            'fda_gudid',          -- Ingested from FDA AccessGUDID master database
            'erp_import',         -- Synchronized from external accounting/ERP system
            'gpo_roster',         -- Imported from GPO national supplier list
            'csv_batch'           -- Uploaded via administrator bulk CSV import
        )),
    source_reference VARCHAR(100), -- External ID in ERP or GPO system
    import_batch_id UUID, -- Correlation UUID for batch traceability
    verification_status VARCHAR(30) NOT NULL DEFAULT 'verified'
        CHECK (verification_status IN ('unverified', 'verified', 'disputed')),
    notes TEXT,
    
    -- Actor Auditing & Timestamps
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Invariants & Constraints
    -- 1. Unique vendor code per scope (global vs facility)
    CONSTRAINT uq_implant_vendor_code 
        UNIQUE NULLS NOT DISTINCT (facility_id, vendor_code),

    -- 2. Inactive boolean must match status enum
    CONSTRAINT chk_vendor_active_sync 
        CHECK ((status = 'active' AND is_active = TRUE) OR (status != 'active' AND is_active = FALSE)),

    -- 3. Vendor code format: Uppercase alphanumeric, underscores, hyphens only
    CONSTRAINT chk_vendor_code_format 
        CHECK (vendor_code ~ '^[A-Z0-9_\-]+$')
);

-- Unique normalized legal name per scope (case-insensitive duplicate blocker)
CREATE UNIQUE INDEX IF NOT EXISTS uq_implant_vendor_legal_name 
    ON public.implant_vendors (facility_id, (LOWER(TRIM(legal_name)))) 
    NULLS NOT DISTINCT;

-- Indexes for Query Performance & Lookups
CREATE INDEX IF NOT EXISTS idx_iv_vendor_code ON public.implant_vendors(vendor_code);
CREATE INDEX IF NOT EXISTS idx_iv_vendor_type ON public.implant_vendors(vendor_type);
CREATE INDEX IF NOT EXISTS idx_iv_status ON public.implant_vendors(status) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_iv_facility ON public.implant_vendors(facility_id);
CREATE INDEX IF NOT EXISTS idx_iv_specialties ON public.implant_vendors USING gin (specialties);

-- Trigram indexes for fuzzy search and duplicate detection
CREATE INDEX IF NOT EXISTS idx_iv_legal_name_trgm ON public.implant_vendors USING gin (LOWER(legal_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_iv_display_name_trgm ON public.implant_vendors USING gin (LOWER(display_name) gin_trgm_ops);

-- ==============================================================================
-- 3. TABLE: public.implant_vendor_relationships
-- Junction table modeling authorized distributors, sales rep agencies,
-- and parent-subsidiary corporate relationships.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.implant_vendor_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE, -- NULL = Global, Set = Facility Contract Scope
    
    -- Relationship Entities
    distributor_id UUID NOT NULL REFERENCES public.implant_vendors(id) ON DELETE RESTRICT,
    manufacturer_id UUID NOT NULL REFERENCES public.implant_vendors(id) ON DELETE RESTRICT,
    
    -- Relationship Nature
    relationship_type VARCHAR(50) NOT NULL DEFAULT 'AUTHORIZED_DISTRIBUTOR'
        CHECK (relationship_type IN (
            'AUTHORIZED_DISTRIBUTOR',  -- Officially licensed third-party distributor
            'EXCLUSIVE_DISTRIBUTOR',   -- Sole authorized distributor for territory
            'LOCAL_REP_AGENCY',        -- Regional 1099 sales and consignment rep
            'GPO_CONTRACT_DISTRIBUTOR',-- Distributor fulfilling national GPO award
            'PARENT_SUBSIDIARY'        -- Corporate hierarchy (e.g. J&J -> DePuy Synthes)
        )),
    
    territory_scope VARCHAR(150) DEFAULT 'National', -- e.g. 'National', 'Florida West Coast', 'Southeast'
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    
    -- Actor Auditing & Timestamps
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Invariants & Constraints
    -- 1. A vendor cannot have a relationship with itself
    CONSTRAINT chk_no_self_vendor_relationship 
        CHECK (distributor_id != manufacturer_id),

    -- 2. Unique relationship per scope, distributor, manufacturer, and type
    CONSTRAINT uq_vendor_relationship 
        UNIQUE NULLS NOT DISTINCT (distributor_id, manufacturer_id, facility_id, relationship_type)
);

-- Indexes for Relationship Traversal
CREATE INDEX IF NOT EXISTS idx_ivr_distributor ON public.implant_vendor_relationships(distributor_id);
CREATE INDEX IF NOT EXISTS idx_ivr_manufacturer ON public.implant_vendor_relationships(manufacturer_id);
CREATE INDEX IF NOT EXISTS idx_ivr_facility ON public.implant_vendor_relationships(facility_id);
CREATE INDEX IF NOT EXISTS idx_ivr_active ON public.implant_vendor_relationships(is_active) WHERE is_active = TRUE;

-- ==============================================================================
-- 4. TRIGGERS & INTEGRITY ENFORCEMENT
-- ==============================================================================

-- 4.1 Touch updated_at triggers
DROP TRIGGER IF EXISTS trg_touch_implant_vendors ON public.implant_vendors;
CREATE TRIGGER trg_touch_implant_vendors
    BEFORE UPDATE ON public.implant_vendors
    FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_implant_vendor_relationships ON public.implant_vendor_relationships;
CREATE TRIGGER trg_touch_implant_vendor_relationships
    BEFORE UPDATE ON public.implant_vendor_relationships
    FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

-- 4.2 Prevent active vendor hard delete
CREATE OR REPLACE FUNCTION public.fn_prevent_active_vendor_hard_delete()
RETURNS TRIGGER AS $$
DECLARE
    v_usage_count INTEGER := 0;
BEGIN
    -- Check if vendor is active
    IF OLD.is_active = TRUE THEN
        RAISE EXCEPTION 'Cannot hard delete active vendor (ID: %, Code: %). Deactivate the vendor via soft-delete instead.', OLD.id, OLD.vendor_code;
    END IF;

    -- Check if referenced in case_devices
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'case_devices') THEN
        SELECT COUNT(*) INTO v_usage_count
        FROM public.case_devices
        WHERE vendor_id = OLD.id;

        IF v_usage_count > 0 THEN
            RAISE EXCEPTION 'Cannot delete vendor referenced by % surgical case device records.', v_usage_count;
        END IF;
    END IF;

    -- Check if referenced in facility_vendor_contracts
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'facility_vendor_contracts') THEN
        SELECT COUNT(*) INTO v_usage_count
        FROM public.facility_vendor_contracts
        WHERE vendor_id = OLD.id;

        IF v_usage_count > 0 THEN
            RAISE EXCEPTION 'Cannot delete vendor referenced by % facility vendor contract records.', v_usage_count;
        END IF;
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_active_vendor_delete ON public.implant_vendors;
CREATE TRIGGER trg_prevent_active_vendor_delete
    BEFORE DELETE ON public.implant_vendors
    FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_active_vendor_hard_delete();

-- 4.3 Cross-Facility Relocation Prevention Triggers
CREATE OR REPLACE FUNCTION public.fn_prevent_facility_relocation_implant_vendors()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.facility_id IS DISTINCT FROM OLD.facility_id THEN
        IF auth.uid() IS NOT NULL AND NOT public.user_has_facility_role(NULL, ARRAY['super_admin', 'org_admin']) THEN
            RAISE EXCEPTION 'Cross-facility relocation of vendor records is forbidden. facility_id is immutable for non-enterprise administrators.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_facility_relocation_implant_vendors ON public.implant_vendors;
CREATE TRIGGER trg_prevent_facility_relocation_implant_vendors
    BEFORE UPDATE ON public.implant_vendors
    FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_facility_relocation_implant_vendors();

DROP TRIGGER IF EXISTS trg_prevent_facility_relocation_vendor_relationships ON public.implant_vendor_relationships;
CREATE TRIGGER trg_prevent_facility_relocation_vendor_relationships
    BEFORE UPDATE ON public.implant_vendor_relationships
    FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_facility_relocation_implant_vendors();

-- 4.4 Audit Trigger Attachments (if fn_audit_log_trigger exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_audit_log_trigger') THEN
        DROP TRIGGER IF EXISTS trg_audit_implant_vendors ON public.implant_vendors;
        CREATE TRIGGER trg_audit_implant_vendors
            AFTER INSERT OR UPDATE OR DELETE ON public.implant_vendors
            FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

        DROP TRIGGER IF EXISTS trg_audit_implant_vendor_relationships ON public.implant_vendor_relationships;
        CREATE TRIGGER trg_audit_implant_vendor_relationships
            AFTER INSERT OR UPDATE OR DELETE ON public.implant_vendor_relationships
            FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();
    END IF;
END $$;

-- ==============================================================================
-- 5. AUTHORITATIVE STORED PROCEDURES
-- ==============================================================================

-- 5.1 Create or Update Vendor with Normalization & Conflict Checks
CREATE OR REPLACE FUNCTION public.fn_create_or_update_vendor(
    p_vendor_id UUID DEFAULT NULL,
    p_facility_id UUID DEFAULT NULL,
    p_vendor_code VARCHAR(50) DEFAULT NULL,
    p_legal_name VARCHAR(200) DEFAULT NULL,
    p_display_name VARCHAR(150) DEFAULT NULL,
    p_vendor_type VARCHAR(50) DEFAULT 'MANUFACTURER',
    p_specialties TEXT[] DEFAULT '{}',
    p_tax_id_ein VARCHAR(20) DEFAULT NULL,
    p_duns_number VARCHAR(20) DEFAULT NULL,
    p_fda_fei VARCHAR(50) DEFAULT NULL,
    p_business_email VARCHAR(150) DEFAULT NULL,
    p_business_phone VARCHAR(50) DEFAULT NULL,
    p_website VARCHAR(255) DEFAULT NULL,
    p_rep_name VARCHAR(150) DEFAULT NULL,
    p_rep_email VARCHAR(150) DEFAULT NULL,
    p_rep_phone VARCHAR(50) DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID;
    v_norm_code VARCHAR(50);
    v_result_id UUID;
    v_conflict_count INTEGER;
BEGIN
    v_actor_id := auth.uid();

    -- Normalize Vendor Code
    v_norm_code := UPPER(TRIM(p_vendor_code));
    IF v_norm_code IS NULL OR v_norm_code !~ '^[A-Z0-9_\-]+$' THEN
        RAISE EXCEPTION 'VALIDATION ERROR: Vendor code must contain only uppercase alphanumeric characters, dashes, and underscores.';
    END IF;

    IF p_legal_name IS NULL OR TRIM(p_legal_name) = '' THEN
        RAISE EXCEPTION 'VALIDATION ERROR: Legal name is required.';
    END IF;

    -- Check for duplicate legal name in same scope
    SELECT COUNT(*) INTO v_conflict_count
    FROM public.implant_vendors
    WHERE LOWER(TRIM(legal_name)) = LOWER(TRIM(p_legal_name))
      AND (
          (p_facility_id IS NULL AND facility_id IS NULL)
          OR (p_facility_id IS NOT NULL AND facility_id = p_facility_id)
      )
      AND (p_vendor_id IS NULL OR id != p_vendor_id);

    IF v_conflict_count > 0 THEN
        RAISE EXCEPTION 'CONFLICT: A vendor with legal name "%" already exists in this scope.', p_legal_name;
    END IF;

    -- Insert or Update
    IF p_vendor_id IS NULL THEN
        INSERT INTO public.implant_vendors (
            facility_id, vendor_code, legal_name, display_name,
            vendor_type, specialties, tax_id_ein, duns_number,
            fda_establishment_identifier, business_email, business_phone,
            website, rep_name, rep_email, rep_phone, notes,
            created_by, updated_by
        ) VALUES (
            p_facility_id, v_norm_code, TRIM(p_legal_name),
            COALESCE(NULLIF(TRIM(p_display_name), ''), TRIM(p_legal_name)),
            p_vendor_type, p_specialties, p_tax_id_ein, p_duns_number,
            p_fda_fei, p_business_email, p_business_phone,
            p_website, p_rep_name, p_rep_email, p_rep_phone, p_notes,
            v_actor_id, v_actor_id
        ) RETURNING id INTO v_result_id;
    ELSE
        UPDATE public.implant_vendors SET
            legal_name = TRIM(p_legal_name),
            display_name = COALESCE(NULLIF(TRIM(p_display_name), ''), TRIM(p_legal_name)),
            vendor_type = p_vendor_type,
            specialties = p_specialties,
            tax_id_ein = p_tax_id_ein,
            duns_number = p_duns_number,
            fda_establishment_identifier = p_fda_fei,
            business_email = p_business_email,
            business_phone = p_business_phone,
            website = p_website,
            rep_name = p_rep_name,
            rep_email = p_rep_email,
            rep_phone = p_rep_phone,
            notes = p_notes,
            updated_by = v_actor_id,
            updated_at = NOW()
        WHERE id = p_vendor_id
        RETURNING id INTO v_result_id;
    END IF;

    RETURN jsonb_build_object('success', TRUE, 'vendor_id', v_result_id);
END;
$$;

-- 5.2 Deactivate Vendor with Rationale & Warning
CREATE OR REPLACE FUNCTION public.fn_deactivate_implant_vendor(
    p_vendor_id UUID,
    p_rationale TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID;
    v_active_contracts INTEGER := 0;
BEGIN
    v_actor_id := auth.uid();

    IF NOT EXISTS (SELECT 1 FROM public.implant_vendors WHERE id = p_vendor_id) THEN
        RAISE EXCEPTION 'NOT FOUND: Vendor does not exist.';
    END IF;

    IF p_rationale IS NULL OR TRIM(p_rationale) = '' THEN
        RAISE EXCEPTION 'VALIDATION ERROR: Deactivation rationale is required.';
    END IF;

    -- Count active contracts if table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'facility_vendor_contracts') THEN
        SELECT COUNT(*) INTO v_active_contracts
        FROM public.facility_vendor_contracts
        WHERE vendor_id = p_vendor_id AND contract_status = 'ACTIVE';
    END IF;

    UPDATE public.implant_vendors
    SET status = 'inactive',
        is_active = FALSE,
        notes = COALESCE(notes || E'\n', '') || 'Deactivation Rationale (' || NOW()::DATE || '): ' || TRIM(p_rationale),
        updated_by = v_actor_id,
        updated_at = NOW()
    WHERE id = p_vendor_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'vendor_id', p_vendor_id,
        'status', 'inactive',
        'active_contracts_warning', v_active_contracts
    );
END;
$$;

-- 5.3 Reactivate Vendor
CREATE OR REPLACE FUNCTION public.fn_reactivate_implant_vendor(
    p_vendor_id UUID
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

    IF NOT EXISTS (SELECT 1 FROM public.implant_vendors WHERE id = p_vendor_id) THEN
        RAISE EXCEPTION 'NOT FOUND: Vendor does not exist.';
    END IF;

    UPDATE public.implant_vendors
    SET status = 'active',
        is_active = TRUE,
        notes = COALESCE(notes || E'\n', '') || 'Reactivated (' || NOW()::DATE || ')',
        updated_by = v_actor_id,
        updated_at = NOW()
    WHERE id = p_vendor_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'vendor_id', p_vendor_id,
        'status', 'active'
    );
END;
$$;

-- Grant execution permissions on authoritative stored procedures
GRANT EXECUTE ON FUNCTION public.fn_create_or_update_vendor(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT[], VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.fn_deactivate_implant_vendor(UUID, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.fn_reactivate_implant_vendor(UUID) TO authenticated, anon;

-- ==============================================================================
-- 6. ROW-LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.implant_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.implant_vendor_relationships ENABLE ROW LEVEL SECURITY;

-- 6.1 implant_vendors policies
DROP POLICY IF EXISTS "implant_vendors_select_policy" ON public.implant_vendors;
CREATE POLICY "implant_vendors_select_policy" ON public.implant_vendors
    FOR SELECT TO authenticated, anon
    USING (
        facility_id IS NULL OR
        facility_id IN (SELECT public.get_auth_user_facilities()) OR
        auth.uid() IS NULL
    );

DROP POLICY IF EXISTS "implant_vendors_insert_policy" ON public.implant_vendors;
CREATE POLICY "implant_vendors_insert_policy" ON public.implant_vendors
    FOR INSERT TO authenticated, anon
    WITH CHECK (
        auth.uid() IS NULL OR
        (facility_id IS NULL AND public.user_has_facility_role(NULL, ARRAY['super_admin'])) OR
        (
            facility_id IS NOT NULL AND
            facility_id IN (SELECT public.get_auth_user_facilities()) AND
            public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo'])
        )
    );

DROP POLICY IF EXISTS "implant_vendors_update_policy" ON public.implant_vendors;
CREATE POLICY "implant_vendors_update_policy" ON public.implant_vendors
    FOR UPDATE TO authenticated, anon
    USING (
        auth.uid() IS NULL OR
        (facility_id IS NULL AND public.user_has_facility_role(NULL, ARRAY['super_admin'])) OR
        (
            facility_id IS NOT NULL AND
            facility_id IN (SELECT public.get_auth_user_facilities()) AND
            public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo'])
        )
    )
    WITH CHECK (
        auth.uid() IS NULL OR
        (facility_id IS NULL AND public.user_has_facility_role(NULL, ARRAY['super_admin'])) OR
        (
            facility_id IS NOT NULL AND
            facility_id IN (SELECT public.get_auth_user_facilities()) AND
            public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo'])
        )
    );

DROP POLICY IF EXISTS "implant_vendors_delete_policy" ON public.implant_vendors;
CREATE POLICY "implant_vendors_delete_policy" ON public.implant_vendors
    FOR DELETE TO authenticated, anon
    USING (
        auth.uid() IS NULL OR
        (
            public.user_has_facility_role(NULL, ARRAY['super_admin']) AND
            status = 'pending_verification'
        )
    );

-- 6.2 implant_vendor_relationships policies
DROP POLICY IF EXISTS "implant_vendor_relationships_select" ON public.implant_vendor_relationships;
CREATE POLICY "implant_vendor_relationships_select" ON public.implant_vendor_relationships
    FOR SELECT TO authenticated, anon
    USING (
        facility_id IS NULL OR
        facility_id IN (SELECT public.get_auth_user_facilities()) OR
        auth.uid() IS NULL
    );

DROP POLICY IF EXISTS "implant_vendor_relationships_modify" ON public.implant_vendor_relationships;
CREATE POLICY "implant_vendor_relationships_modify" ON public.implant_vendor_relationships
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
-- 7. SEED GLOBAL BASELINE VENDORS & RELATIONSHIPS
-- ==============================================================================

-- 7.1 Seed Top Global Medical Device Manufacturers (12 OEMs)
INSERT INTO public.implant_vendors (
    facility_id, vendor_code, legal_name, display_name, vendor_type,
    specialties, tax_id_ein, fda_establishment_identifier, website, source_system, status, is_active
) VALUES
    (NULL, 'STRYKER', 'Howmedica Osteonics Corp.', 'Stryker Orthopaedics', 'MANUFACTURER',
     ARRAY['Orthopedics', 'Spine', 'ENT'], '22-1234567', 'FEI-1029384', 'https://www.stryker.com', 'manual_entry', 'active', TRUE),
    
    (NULL, 'ZIMMER_BIOMET', 'Zimmer US, Inc.', 'Zimmer Biomet', 'MANUFACTURER',
     ARRAY['Orthopedics', 'Spine', 'Dental', 'ENT'], '35-9876543', 'FEI-2039485', 'https://www.zimmerbiomet.com', 'manual_entry', 'active', TRUE),
    
    (NULL, 'DEPUY_SYNTHES', 'DePuy Synthes Sales, Inc.', 'DePuy Synthes', 'MANUFACTURER',
     ARRAY['Orthopedics', 'Spine', 'Trauma', 'Craniomaxillofacial'], '31-4567890', 'FEI-3049586', 'https://www.jnjmedtech.com', 'manual_entry', 'active', TRUE),
    
    (NULL, 'MEDTRONIC', 'Medtronic, Inc.', 'Medtronic Spine & Biologics', 'MANUFACTURER',
     ARRAY['Spine', 'Pain Management', 'Cardiovascular', 'ENT'], '41-5678901', 'FEI-4059687', 'https://www.medtronic.com', 'manual_entry', 'active', TRUE),
    
    (NULL, 'SMITH_NEPHEW', 'Smith & Nephew, Inc.', 'Smith & Nephew', 'MANUFACTURER',
     ARRAY['Orthopedics', 'Sports Medicine', 'Trauma'], '62-6789012', 'FEI-5069788', 'https://www.smith-nephew.com', 'manual_entry', 'active', TRUE),
    
    (NULL, 'ALCON', 'Alcon Laboratories, Inc.', 'Alcon Surgical', 'MANUFACTURER',
     ARRAY['Ophthalmology'], '75-7890123', 'FEI-6079889', 'https://www.alcon.com', 'manual_entry', 'active', TRUE),
    
    (NULL, 'BAUSCH_LOMB', 'Bausch & Lomb Americas Inc.', 'Bausch + Lomb', 'MANUFACTURER',
     ARRAY['Ophthalmology'], '16-8901234', 'FEI-7089990', 'https://www.bausch.com', 'manual_entry', 'active', TRUE),
    
    (NULL, 'ARTHREX', 'Arthrex, Inc.', 'Arthrex Orthobiologics', 'MANUFACTURER',
     ARRAY['Orthopedics', 'Sports Medicine', 'Podiatry'], '59-9012345', 'FEI-8090101', 'https://www.arthrex.com', 'manual_entry', 'active', TRUE),
    
    (NULL, 'INTEGRA', 'Integra LifeSciences Corp.', 'Integra LifeSciences', 'MANUFACTURER',
     ARRAY['Neurosurgery', 'Plastic Surgery', 'Reconstructive', 'ENT'], '22-0123456', 'FEI-9101212', 'https://www.integralife.com', 'manual_entry', 'active', TRUE),
    
    (NULL, 'ABBOTT', 'Abbott Laboratories', 'Abbott Neuromodulation', 'MANUFACTURER',
     ARRAY['Pain Management', 'Cardiovascular'], '36-1234560', 'FEI-1122334', 'https://www.abbott.com', 'manual_entry', 'active', TRUE),
    
    (NULL, 'GLOBUS', 'Globus Medical, Inc.', 'Globus Medical', 'MANUFACTURER',
     ARRAY['Spine', 'Orthopedics', 'Trauma'], '20-2345671', 'FEI-2233445', 'https://www.globusmedical.com', 'manual_entry', 'active', TRUE),
    
    (NULL, 'MTF_BIOLOGICS', 'Musculoskeletal Transplant Foundation', 'MTF Biologics', 'TISSUE_BANK',
     ARRAY['Orthopedics', 'Spine', 'Plastic Surgery'], '22-3456782', 'FEI-3344556', 'https://www.mtfbiologics.org', 'manual_entry', 'active', TRUE)
ON CONFLICT (facility_id, vendor_code) DO UPDATE SET
    legal_name = EXCLUDED.legal_name,
    display_name = EXCLUDED.display_name,
    vendor_type = EXCLUDED.vendor_type,
    specialties = EXCLUDED.specialties,
    status = EXCLUDED.status,
    is_active = EXCLUDED.is_active;

-- 7.2 Seed Top National Distributors (3 Distributors)
INSERT INTO public.implant_vendors (
    facility_id, vendor_code, legal_name, display_name, vendor_type,
    specialties, tax_id_ein, website, source_system, status, is_active
) VALUES
    (NULL, 'CARDINAL_HEALTH', 'Cardinal Health 200, LLC', 'Cardinal Health', 'DISTRIBUTOR',
     ARRAY['Orthopedics', 'Spine', 'Ophthalmology', 'Pain Management', 'General'], '31-4561234', 'https://www.cardinalhealth.com', 'manual_entry', 'active', TRUE),
    
    (NULL, 'MEDLINE', 'Medline Industries, LP', 'Medline Industries', 'DISTRIBUTOR',
     ARRAY['Orthopedics', 'Spine', 'Ophthalmology', 'Pain Management', 'General'], '36-2678901', 'https://www.medline.com', 'manual_entry', 'active', TRUE),
    
    (NULL, 'OWENS_MINOR', 'Owens & Minor Distribution, Inc.', 'Owens & Minor', 'DISTRIBUTOR',
     ARRAY['Orthopedics', 'Spine', 'Cardiovascular', 'General'], '54-0129876', 'https://www.owens-minor.com', 'manual_entry', 'active', TRUE)
ON CONFLICT (facility_id, vendor_code) DO UPDATE SET
    legal_name = EXCLUDED.legal_name,
    display_name = EXCLUDED.display_name,
    vendor_type = EXCLUDED.vendor_type,
    specialties = EXCLUDED.specialties,
    status = EXCLUDED.status,
    is_active = EXCLUDED.is_active;

-- 7.3 Seed Global Authorized Distributor Relationships
-- Cardinal Health distributes Stryker, Zimmer Biomet, DePuy Synthes, Smith & Nephew
INSERT INTO public.implant_vendor_relationships (facility_id, distributor_id, manufacturer_id, relationship_type, territory_scope)
SELECT NULL, d.id, m.id, 'AUTHORIZED_DISTRIBUTOR', 'National'
FROM public.implant_vendors d, public.implant_vendors m
WHERE d.facility_id IS NULL AND d.vendor_code = 'CARDINAL_HEALTH'
  AND m.facility_id IS NULL AND m.vendor_code IN ('STRYKER', 'ZIMMER_BIOMET', 'DEPUY_SYNTHES', 'SMITH_NEPHEW')
ON CONFLICT (distributor_id, manufacturer_id, facility_id, relationship_type) DO NOTHING;

-- Medline distributes Arthrex, Integra LifeSciences, MTF Biologics
INSERT INTO public.implant_vendor_relationships (facility_id, distributor_id, manufacturer_id, relationship_type, territory_scope)
SELECT NULL, d.id, m.id, 'AUTHORIZED_DISTRIBUTOR', 'National'
FROM public.implant_vendors d, public.implant_vendors m
WHERE d.facility_id IS NULL AND d.vendor_code = 'MEDLINE'
  AND m.facility_id IS NULL AND m.vendor_code IN ('ARTHREX', 'INTEGRA', 'MTF_BIOLOGICS')
ON CONFLICT (distributor_id, manufacturer_id, facility_id, relationship_type) DO NOTHING;

-- Owens & Minor distributes Medtronic, Abbott, Globus Medical
INSERT INTO public.implant_vendor_relationships (facility_id, distributor_id, manufacturer_id, relationship_type, territory_scope)
SELECT NULL, d.id, m.id, 'AUTHORIZED_DISTRIBUTOR', 'National'
FROM public.implant_vendors d, public.implant_vendors m
WHERE d.facility_id IS NULL AND d.vendor_code = 'OWENS_MINOR'
  AND m.facility_id IS NULL AND m.vendor_code IN ('MEDTRONIC', 'ABBOTT', 'GLOBUS')
ON CONFLICT (distributor_id, manufacturer_id, facility_id, relationship_type) DO NOTHING;

COMMIT;
