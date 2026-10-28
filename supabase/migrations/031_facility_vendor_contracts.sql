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
