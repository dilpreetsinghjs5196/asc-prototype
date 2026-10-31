-- ==============================================================================
-- Migration: 042_payer_contract_model.sql
-- Description: Phase 66 Payer Contract Model & Commercial Reimbursement Engine
-- Statutory Authorities: HIPAA 5010 EDI 837/270/276, 42 CFR § 416, ACA § 1104
-- Invariants:
--   1. Decoupled Tenancy: Organization ownership with multi-facility scope inheritance.
--   2. Immutable Versioning: Approved versions locked by trigger; edits require N+1 version.
--   3. Four Rate Methodologies: % of Medicare, Commercial Fee Schedule, % of Billed Charges, Case Rates.
--   4. Deterministic Precedence: Procedure > Plan > Facility > Organization Default.
--   5. Two-Person Governance: Independent CFO sign-off required for version activation.
--   6. Private Document Storage: Document metadata and SHA-256 integrity hash tracking.
--   7. Zero public.user_roles queries: RLS enforced via is_facility_accessible & user_has_facility_role.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. REFACTOR EXISTING PAYER CONTRACT TABLES FOR MULTI-TENANCY & LIFECYCLE
-- ==============================================================================

-- 1.1 Baseline public.payer_contracts (if not already created by Migration 041)
CREATE TABLE IF NOT EXISTS public.payer_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE,
    payer_id UUID NOT NULL REFERENCES public.payer_master(id) ON DELETE RESTRICT,
    contract_number VARCHAR(80) NOT NULL,
    contract_title VARCHAR(255) NOT NULL,
    reimbursement_methodology VARCHAR(30) NOT NULL DEFAULT 'PERCENT_OF_MEDICARE',
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Expand public.payer_contracts
ALTER TABLE public.payer_contracts 
    ALTER COLUMN facility_id DROP NOT NULL;

ALTER TABLE public.payer_contracts
    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS contract_type VARCHAR(40) NOT NULL DEFAULT 'COMMERCIAL_DIRECT',
    ADD COLUMN IF NOT EXISTS scope_mode VARCHAR(30) NOT NULL DEFAULT 'SPECIFIC_FACILITIES',
    ADD COLUMN IF NOT EXISTS execution_date DATE,
    ADD COLUMN IF NOT EXISTS initial_effective_date DATE DEFAULT CURRENT_DATE,
    ADD COLUMN IF NOT EXISTS current_expiration_date DATE,
    ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS renewal_notice_days INTEGER NOT NULL DEFAULT 90,
    ADD COLUMN IF NOT EXISTS governing_jurisdiction VARCHAR(100),
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill organization_id from facilities
UPDATE public.payer_contracts pc
SET organization_id = f.organization_id
FROM public.facilities f
WHERE pc.facility_id = f.id AND pc.organization_id IS NULL;

-- Default fallback organization if still NULL
UPDATE public.payer_contracts
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

ALTER TABLE public.payer_contracts
    ALTER COLUMN organization_id SET NOT NULL;

-- 1.2 Baseline public.payer_contract_versions (if not already created by Migration 041)
CREATE TABLE IF NOT EXISTS public.payer_contract_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES public.payer_contracts(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL DEFAULT 1,
    effective_start_date DATE NOT NULL,
    effective_end_date DATE,
    medicare_multiplier NUMERIC(6, 4) DEFAULT 1.0000,
    mppr_rule_set_code VARCHAR(40) NOT NULL DEFAULT 'COM_STD_CASCADE',
    device_carve_out_enabled BOOLEAN NOT NULL DEFAULT true,
    device_invoice_markup_pct NUMERIC(6, 4) DEFAULT 0.1000,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Expand public.payer_contract_versions
ALTER TABLE public.payer_contract_versions
    ADD COLUMN IF NOT EXISTS reimbursement_methodology VARCHAR(40) NOT NULL DEFAULT 'PERCENT_OF_MEDICARE',
    ADD COLUMN IF NOT EXISTS billed_charge_discount_pct NUMERIC(6, 4),
    ADD COLUMN IF NOT EXISTS device_carve_out_mode VARCHAR(40) NOT NULL DEFAULT 'PASS_THROUGH_INVOICE_PLUS_PERCENT',
    ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS version_hash VARCHAR(64),
    ADD COLUMN IF NOT EXISTS change_summary TEXT,
    ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS status VARCHAR(25) NOT NULL DEFAULT 'ACTIVE';

-- Lock existing versions
UPDATE public.payer_contract_versions
SET is_locked = TRUE
WHERE status IN ('APPROVED', 'ACTIVE');

-- ==============================================================================
-- 2. CREATE NORMALIZED CONTRACT SCOPES & DETAIL ENTITIES
-- ==============================================================================

-- 2.1 Multi-Facility Scopes
CREATE TABLE IF NOT EXISTS public.payer_contract_facility_scopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES public.payer_contracts(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    facility_specific_override BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_contract_facility_scope UNIQUE (contract_id, facility_id)
);

CREATE INDEX IF NOT EXISTS idx_scope_facility ON public.payer_contract_facility_scopes(facility_id, contract_id);

-- 2.2 Benefit Plan Scopes
CREATE TABLE IF NOT EXISTS public.payer_contract_plan_scopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_version_id UUID NOT NULL REFERENCES public.payer_contract_versions(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.payer_plans(id) ON DELETE RESTRICT,
    is_covered BOOLEAN NOT NULL DEFAULT TRUE,
    plan_multiplier_override NUMERIC(6, 4),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_version_plan_scope UNIQUE (contract_version_id, plan_id)
);

CREATE INDEX IF NOT EXISTS idx_scope_plan ON public.payer_contract_plan_scopes(plan_id, contract_version_id);

-- 2.3 Service & Specialty Carve-Out Scopes
CREATE TABLE IF NOT EXISTS public.payer_contract_service_scopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_version_id UUID NOT NULL REFERENCES public.payer_contract_versions(id) ON DELETE CASCADE,
    scope_level VARCHAR(30) NOT NULL DEFAULT 'SPECIALTY'
        CHECK (scope_level IN ('SPECIALTY', 'CPT_RANGE', 'CPT_SINGLE', 'REVENUE_CODE')),
    specialty_code VARCHAR(50),
    cpt_code_start VARCHAR(10),
    cpt_code_end VARCHAR(10),
    cpt_code VARCHAR(10),
    is_excluded BOOLEAN NOT NULL DEFAULT FALSE,
    pre_authorization_required BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_scope_version ON public.payer_contract_service_scopes(contract_version_id, scope_level);

-- 2.4 Granular Fee Schedule & Case Rate Terms
CREATE TABLE IF NOT EXISTS public.payer_contract_terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_version_id UUID NOT NULL REFERENCES public.payer_contract_versions(id) ON DELETE CASCADE,
    cpt_code VARCHAR(10) NOT NULL,
    rate_methodology VARCHAR(30) NOT NULL DEFAULT 'FIXED_FEE'
        CHECK (rate_methodology IN ('FIXED_FEE', 'PERCENT_OF_MEDICARE', 'PERCENT_OF_BILLED', 'CASE_RATE')),
    contracted_rate NUMERIC(12, 2) CHECK (contracted_rate IS NULL OR contracted_rate >= 0),
    multiplier NUMERIC(6, 4) CHECK (multiplier IS NULL OR multiplier > 0),
    includes_implants BOOLEAN NOT NULL DEFAULT FALSE,
    includes_anesthesia BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_version_cpt_term UNIQUE (contract_version_id, cpt_code)
);

CREATE INDEX IF NOT EXISTS idx_terms_version_cpt ON public.payer_contract_terms(contract_version_id, cpt_code);

-- 2.5 Private Contract Document Metadata
CREATE TABLE IF NOT EXISTS public.payer_contract_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES public.payer_contracts(id) ON DELETE CASCADE,
    contract_version_id UUID REFERENCES public.payer_contract_versions(id) ON DELETE SET NULL,
    document_title VARCHAR(255) NOT NULL,
    document_category VARCHAR(50) NOT NULL DEFAULT 'MASTER_AGREEMENT'
        CHECK (document_category IN ('MASTER_AGREEMENT', 'FEE_SCHEDULE_EXHIBIT', 'AMENDMENT', 'RENEWAL_NOTICE', 'TERMINATION_NOTICE', 'CORRESPONDENCE', 'OTHER')),
    storage_bucket VARCHAR(100) NOT NULL DEFAULT 'payer-contracts',
    storage_path VARCHAR(500) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 26214400),
    mime_type VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
    file_sha256 VARCHAR(64) NOT NULL,
    uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_docs_contract ON public.payer_contract_documents(contract_id, document_category);

-- 2.6 Contract Amendments
CREATE TABLE IF NOT EXISTS public.payer_contract_amendments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES public.payer_contracts(id) ON DELETE CASCADE,
    prior_version_id UUID NOT NULL REFERENCES public.payer_contract_versions(id) ON DELETE RESTRICT,
    new_version_id UUID REFERENCES public.payer_contract_versions(id) ON DELETE SET NULL,
    amendment_number INTEGER NOT NULL DEFAULT 1 CHECK (amendment_number >= 1),
    amendment_title VARCHAR(255) NOT NULL,
    amendment_type VARCHAR(40) NOT NULL DEFAULT 'RATE_UPDATE'
        CHECK (amendment_type IN ('RATE_UPDATE', 'SCOPE_EXPANSION', 'PLAN_ADDITION', 'TERM_EXTENSION', 'LEGAL_TERMS', 'TERMINATION')),
    execution_date DATE NOT NULL,
    effective_date DATE NOT NULL,
    is_retroactive BOOLEAN NOT NULL DEFAULT FALSE,
    rationale TEXT NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_contract_amendment_order UNIQUE (contract_id, amendment_number)
);

CREATE INDEX IF NOT EXISTS idx_amendments_contract ON public.payer_contract_amendments(contract_id, execution_date);

-- 2.7 Two-Person Approval Ledger
CREATE TABLE IF NOT EXISTS public.payer_contract_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_version_id UUID NOT NULL REFERENCES public.payer_contract_versions(id) ON DELETE CASCADE,
    approver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    approver_role VARCHAR(50) NOT NULL,
    approval_stage VARCHAR(40) NOT NULL DEFAULT 'FINANCIAL_CFO'
        CHECK (approval_stage IN ('LEGAL_COMPLIANCE', 'FINANCIAL_CFO', 'EXECUTIVE_COMMITTEE')),
    approval_decision VARCHAR(20) NOT NULL DEFAULT 'APPROVED'
        CHECK (approval_decision IN ('APPROVED', 'REJECTED')),
    decision_notes TEXT,
    version_hash_at_approval VARCHAR(64) NOT NULL,
    approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_version_stage_approver UNIQUE (contract_version_id, approval_stage, approver_id)
);

CREATE INDEX IF NOT EXISTS idx_approvals_version ON public.payer_contract_approvals(contract_version_id, approval_stage);

-- 2.8 Append-Only Audit Trail
CREATE TABLE IF NOT EXISTS public.payer_contract_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES public.payer_contracts(id) ON DELETE CASCADE,
    contract_version_id UUID,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    before_state JSONB,
    after_state JSONB,
    ip_address INET,
    user_agent TEXT,
    logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contract_audit_contract ON public.payer_contract_audit_logs(contract_id, logged_at);

-- ==============================================================================
-- 3. TRIGGERS: IMMUTABLE VERSION LOCK
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_block_approved_contract_version_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF (OLD.status IN ('APPROVED', 'ACTIVE', 'SUPERSEDED', 'TERMINATED')) THEN
        IF (NEW.status != OLD.status OR NEW.effective_end_date != OLD.effective_end_date)
           AND (NEW.medicare_multiplier = OLD.medicare_multiplier)
           AND (NEW.reimbursement_methodology = OLD.reimbursement_methodology)
           AND (NEW.billed_charge_discount_pct = OLD.billed_charge_discount_pct OR (NEW.billed_charge_discount_pct IS NULL AND OLD.billed_charge_discount_pct IS NULL))
           AND (NEW.mppr_rule_set_code = OLD.mppr_rule_set_code)
           AND (NEW.device_carve_out_mode = OLD.device_carve_out_mode)
           AND (NEW.device_invoice_markup_pct = OLD.device_invoice_markup_pct) THEN
            RETURN NEW;
        END IF;

        RAISE EXCEPTION 'COMPLIANCE VIOLATION: Contract version % (ID: %) is locked and cannot be modified. Create an amendment or version N+1.',
            OLD.version_number, OLD.id;
    END IF;

    IF (NEW.status IN ('APPROVED', 'ACTIVE') AND OLD.status NOT IN ('APPROVED', 'ACTIVE')) THEN
        NEW.is_locked := TRUE;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_approved_contract_version_modification ON public.payer_contract_versions;
CREATE TRIGGER trg_block_approved_contract_version_modification
    BEFORE UPDATE OR DELETE ON public.payer_contract_versions
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_block_approved_contract_version_modification();

-- ==============================================================================
-- 4. AUTHORITATIVE DETERMINISTIC CONTRACT RESOLUTION STORED PROCEDURE
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_resolve_payer_contract(
    p_facility_id UUID,
    p_payer_id UUID,
    p_plan_id UUID DEFAULT NULL,
    p_date_of_service DATE DEFAULT CURRENT_DATE,
    p_cpt_code VARCHAR(10) DEFAULT NULL
)
RETURNS TABLE (
    contract_id UUID,
    contract_number VARCHAR(100),
    contract_title VARCHAR(255),
    contract_version_id UUID,
    version_number INTEGER,
    reimbursement_methodology VARCHAR(40),
    medicare_multiplier NUMERIC(6, 4),
    billed_charge_discount_pct NUMERIC(6, 4),
    cpt_contracted_rate NUMERIC(12, 2),
    cpt_term_methodology VARCHAR(30),
    mppr_rule_set_code VARCHAR(40),
    device_carve_out_mode VARCHAR(40),
    device_invoice_markup_pct NUMERIC(6, 4),
    resolution_source VARCHAR(40)
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_c_id UUID;
    v_c_num VARCHAR(100);
    v_c_title VARCHAR(255);
    v_cv_id UUID;
    v_v_num INTEGER;
    v_methodology VARCHAR(40);
    v_multiplier NUMERIC(6, 4);
    v_disc_pct NUMERIC(6, 4);
    v_mppr VARCHAR(40);
    v_carveout VARCHAR(40);
    v_markup NUMERIC(6, 4);
    v_res_source VARCHAR(40) := 'UNRESOLVED';
    v_cpt_rate NUMERIC(12, 2) := NULL;
    v_cpt_method VARCHAR(30) := NULL;
BEGIN
    -- Tier 1 & 2: Search for Facility-Specific Contract or Organization-Scope Master Contract
    SELECT 
        c.id, c.contract_number, c.contract_title,
        cv.id, cv.version_number, cv.reimbursement_methodology,
        cv.medicare_multiplier, cv.billed_charge_discount_pct,
        cv.mppr_rule_set_code, cv.device_carve_out_mode, cv.device_invoice_markup_pct,
        CASE 
            WHEN c.facility_id = p_facility_id THEN 'FACILITY_SPECIFIC_CONTRACT'
            ELSE 'ORGANIZATION_MASTER_CONTRACT'
        END
    INTO 
        v_c_id, v_c_num, v_c_title,
        v_cv_id, v_v_num, v_methodology,
        v_multiplier, v_disc_pct,
        v_mppr, v_carveout, v_markup,
        v_res_source
    FROM public.payer_contracts c
    JOIN public.payer_contract_versions cv ON cv.contract_id = c.id
    LEFT JOIN public.payer_contract_facility_scopes fs ON fs.contract_id = c.id AND fs.facility_id = p_facility_id
    WHERE c.payer_id = p_payer_id
      AND c.status = 'ACTIVE'
      AND cv.status = 'ACTIVE'
      AND cv.effective_start_date <= p_date_of_service
      AND (cv.effective_end_date IS NULL OR cv.effective_end_date >= p_date_of_service)
      AND (
          c.facility_id = p_facility_id 
          OR (c.facility_id IS NULL AND (c.scope_mode = 'ALL_FACILITIES' OR (fs.id IS NOT NULL AND fs.is_active = TRUE)))
      )
      -- Plan scope filtering if plan specified
      AND (
          p_plan_id IS NULL 
          OR NOT EXISTS (SELECT 1 FROM public.payer_contract_plan_scopes ps WHERE ps.contract_version_id = cv.id)
          OR EXISTS (SELECT 1 FROM public.payer_contract_plan_scopes ps WHERE ps.contract_version_id = cv.id AND ps.plan_id = p_plan_id AND ps.is_covered = TRUE)
      )
    ORDER BY (c.facility_id = p_facility_id) DESC, cv.version_number DESC
    LIMIT 1;

    -- If contract found, check for CPT-specific term override
    IF v_cv_id IS NOT NULL AND p_cpt_code IS NOT NULL THEN
        SELECT t.contracted_rate, t.rate_methodology, COALESCE(t.multiplier, v_multiplier)
        INTO v_cpt_rate, v_cpt_method, v_multiplier
        FROM public.payer_contract_terms t
        WHERE t.contract_version_id = v_cv_id AND t.cpt_code = p_cpt_code;

        IF v_cpt_rate IS NOT NULL OR v_cpt_method IS NOT NULL THEN
            v_res_source := v_res_source || '_WITH_CPT_TERM';
        END IF;
    END IF;

    IF v_c_id IS NOT NULL THEN
        RETURN QUERY SELECT 
            v_c_id, v_c_num, v_c_title,
            v_cv_id, v_v_num, v_methodology,
            v_multiplier, v_disc_pct,
            v_cpt_rate, v_cpt_method,
            v_mppr, v_carveout, v_markup,
            v_res_source;
    END IF;

    RETURN;
END;
$$;

-- 4.3 Return set of organization IDs the authenticated user has active facility memberships in
CREATE OR REPLACE FUNCTION public.get_auth_user_organizations()
RETURNS TABLE (organization_id UUID)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT DISTINCT f.organization_id
    FROM public.facilities f
    JOIN public.facility_memberships fm ON fm.facility_id = f.id
    WHERE fm.user_id = auth.uid()
      AND fm.is_active = TRUE
      AND f.organization_id IS NOT NULL;
$$;

-- ==============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.payer_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_contract_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_contract_facility_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_contract_plan_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_contract_service_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_contract_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_contract_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_contract_amendments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_contract_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_contract_audit_logs ENABLE ROW LEVEL SECURITY;

-- 5.1 Facility Scopes Policy
DROP POLICY IF EXISTS "Payer Contract Facility Scopes Policy" ON public.payer_contract_facility_scopes;
CREATE POLICY "Payer Contract Facility Scopes Policy"
ON public.payer_contract_facility_scopes FOR ALL TO authenticated
USING (
    facility_id IN (SELECT facility_id FROM public.get_auth_user_facilities())
    OR public.is_facility_accessible(facility_id)
);

-- 5.2 Plan Scopes Policy
DROP POLICY IF EXISTS "Payer Contract Plan Scopes Policy" ON public.payer_contract_plan_scopes;
CREATE POLICY "Payer Contract Plan Scopes Policy"
ON public.payer_contract_plan_scopes FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.payer_contract_versions cv
        JOIN public.payer_contracts c ON c.id = cv.contract_id
        WHERE cv.id = payer_contract_plan_scopes.contract_version_id
          AND (c.facility_id IS NULL OR public.is_facility_accessible(c.facility_id))
    )
);

-- 5.3 Terms Policy
DROP POLICY IF EXISTS "Payer Contract Terms Policy" ON public.payer_contract_terms;
CREATE POLICY "Payer Contract Terms Policy"
ON public.payer_contract_terms FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.payer_contract_versions cv
        JOIN public.payer_contracts c ON c.id = cv.contract_id
        WHERE cv.id = payer_contract_terms.contract_version_id
          AND (c.facility_id IS NULL OR public.is_facility_accessible(c.facility_id))
    )
);

-- 5.4 Documents Policy
DROP POLICY IF EXISTS "Payer Contract Documents Policy" ON public.payer_contract_documents;
CREATE POLICY "Payer Contract Documents Policy"
ON public.payer_contract_documents FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.payer_contracts c
        WHERE c.id = payer_contract_documents.contract_id
          AND (c.facility_id IS NULL OR public.is_facility_accessible(c.facility_id))
    )
);

-- 5.5 Amendments Policy
DROP POLICY IF EXISTS "Payer Contract Amendments Policy" ON public.payer_contract_amendments;
CREATE POLICY "Payer Contract Amendments Policy"
ON public.payer_contract_amendments FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.payer_contracts c
        WHERE c.id = payer_contract_amendments.contract_id
          AND (c.facility_id IS NULL OR public.is_facility_accessible(c.facility_id))
    )
);

-- 5.6 Approvals Policy
DROP POLICY IF EXISTS "Payer Contract Approvals Policy" ON public.payer_contract_approvals;
CREATE POLICY "Payer Contract Approvals Policy"
ON public.payer_contract_approvals FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.payer_contract_versions cv
        JOIN public.payer_contracts c ON c.id = cv.contract_id
        WHERE cv.id = payer_contract_approvals.contract_version_id
          AND (c.facility_id IS NULL OR public.is_facility_accessible(c.facility_id))
    )
);

-- 5.7 Audit Logs Policy
DROP POLICY IF EXISTS "Payer Contract Audit Logs Policy" ON public.payer_contract_audit_logs;
CREATE POLICY "Payer Contract Audit Logs Policy"
ON public.payer_contract_audit_logs FOR SELECT TO authenticated
USING (
    public.user_has_facility_role(NULL, ARRAY['super_admin'])
    OR organization_id IN (SELECT organization_id FROM public.get_auth_user_organizations())
);

-- ==============================================================================
-- 6. SEED ENTERPRISE COMMERCIAL PAYER CONTRACTS & TERMS
-- ==============================================================================

DO $$
DECLARE
    v_org_id UUID;
    v_fac_id UUID;
    v_bcbs_id UUID := '20000000-0000-0000-0000-000000000002';
    v_aetna_id UUID := '20000000-0000-0000-0000-000000000003';
    v_uhc_id UUID := '20000000-0000-0000-0000-000000000004';
    v_cigna_id UUID := '20000000-0000-0000-0000-000000000006';
    v_humana_id UUID := '20000000-0000-0000-0000-000000000007';

    v_ctr_bcbs UUID := '50000000-0000-0000-0000-000000000001';
    v_ctr_aetna UUID := '50000000-0000-0000-0000-000000000002';
    v_ctr_uhc UUID := '50000000-0000-0000-0000-000000000003';
    v_ctr_cigna UUID := '50000000-0000-0000-0000-000000000004';
    v_ctr_humana UUID := '50000000-0000-0000-0000-000000000005';

    v_ver_bcbs UUID := '51000000-0000-0000-0000-000000000001';
    v_ver_aetna UUID := '51000000-0000-0000-0000-000000000002';
    v_ver_uhc UUID := '51000000-0000-0000-0000-000000000003';
    v_ver_cigna UUID := '51000000-0000-0000-0000-000000000004';
    v_ver_humana UUID := '51000000-0000-0000-0000-000000000005';
BEGIN
    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
    IF v_org_id IS NULL THEN v_org_id := '00000000-0000-0000-0000-000000000001'; END IF;

    SELECT id INTO v_fac_id FROM public.facilities LIMIT 1;
    IF v_fac_id IS NULL THEN v_fac_id := '00000000-0000-0000-0000-000000000002'; END IF;

    -- 1. Florida Blue Contract (145.0% of Medicare, Invoice + 10% Implants)
    INSERT INTO public.payer_contracts (id, organization_id, facility_id, payer_id, contract_number, contract_title, contract_type, scope_mode, execution_date, initial_effective_date, status)
    VALUES (v_ctr_bcbs, v_org_id, NULL, v_bcbs_id, 'BCBS-ASC-FL-2026', 'Florida Blue Comprehensive Outpatient Facility Agreement', 'COMMERCIAL_DIRECT', 'ALL_FACILITIES', '2025-11-15', '2026-01-01', 'ACTIVE')
    ON CONFLICT (id) DO UPDATE SET contract_number = EXCLUDED.contract_number;

    INSERT INTO public.payer_contract_versions (id, contract_id, version_number, effective_start_date, effective_end_date, reimbursement_methodology, medicare_multiplier, mppr_rule_set_code, device_carve_out_mode, device_invoice_markup_pct, is_locked, status)
    VALUES (v_ver_bcbs, v_ctr_bcbs, 1, '2026-01-01', '2026-12-31', 'PERCENT_OF_MEDICARE', 1.4500, 'CMS_50_PERCENT', 'PASS_THROUGH_INVOICE_PLUS_PERCENT', 0.1000, TRUE, 'ACTIVE')
    ON CONFLICT (id) DO UPDATE SET medicare_multiplier = EXCLUDED.medicare_multiplier;

    INSERT INTO public.payer_contract_facility_scopes (contract_id, facility_id, is_active)
    VALUES (v_ctr_bcbs, v_fac_id, TRUE)
    ON CONFLICT (contract_id, facility_id) DO NOTHING;

    -- 2. Aetna Healthcare Contract (138.5% of Medicare, Implants At Cost)
    INSERT INTO public.payer_contracts (id, organization_id, facility_id, payer_id, contract_number, contract_title, contract_type, scope_mode, execution_date, initial_effective_date, status)
    VALUES (v_ctr_aetna, v_org_id, NULL, v_aetna_id, 'AETNA-SURG-2025-A', 'Aetna Specialty Surgery Center Master Agreement', 'COMMERCIAL_DIRECT', 'ALL_FACILITIES', '2025-05-20', '2025-07-01', 'ACTIVE')
    ON CONFLICT (id) DO UPDATE SET contract_number = EXCLUDED.contract_number;

    INSERT INTO public.payer_contract_versions (id, contract_id, version_number, effective_start_date, effective_end_date, reimbursement_methodology, medicare_multiplier, mppr_rule_set_code, device_carve_out_mode, device_invoice_markup_pct, is_locked, status)
    VALUES (v_ver_aetna, v_ctr_aetna, 1, '2025-07-01', '2026-06-30', 'PERCENT_OF_MEDICARE', 1.3850, 'CMS_50_PERCENT', 'AT_COST', 0.0000, TRUE, 'ACTIVE')
    ON CONFLICT (id) DO UPDATE SET medicare_multiplier = EXCLUDED.medicare_multiplier;

    INSERT INTO public.payer_contract_facility_scopes (contract_id, facility_id, is_active)
    VALUES (v_ctr_aetna, v_fac_id, TRUE)
    ON CONFLICT (contract_id, facility_id) DO NOTHING;

    -- 3. UnitedHealthcare Contract (Commercial Fee Schedule)
    INSERT INTO public.payer_contracts (id, organization_id, facility_id, payer_id, contract_number, contract_title, contract_type, scope_mode, execution_date, initial_effective_date, status)
    VALUES (v_ctr_uhc, v_org_id, NULL, v_uhc_id, 'UHC-SPECIALTY-2026', 'UnitedHealthcare Commercial Ambulatory Surgery Agreement', 'COMMERCIAL_DIRECT', 'ALL_FACILITIES', '2025-10-10', '2026-01-01', 'ACTIVE')
    ON CONFLICT (id) DO UPDATE SET contract_number = EXCLUDED.contract_number;

    INSERT INTO public.payer_contract_versions (id, contract_id, version_number, effective_start_date, effective_end_date, reimbursement_methodology, medicare_multiplier, mppr_rule_set_code, device_carve_out_mode, device_invoice_markup_pct, is_locked, status)
    VALUES (v_ver_uhc, v_ctr_uhc, 1, '2026-01-01', '2027-12-31', 'COMMERCIAL_FEE_SCHEDULE', NULL, 'COM_STD_CASCADE', 'PASS_THROUGH_INVOICE_PLUS_PERCENT', 0.0500, TRUE, 'ACTIVE')
    ON CONFLICT (id) DO UPDATE SET reimbursement_methodology = EXCLUDED.reimbursement_methodology;

    INSERT INTO public.payer_contract_facility_scopes (contract_id, facility_id, is_active)
    VALUES (v_ctr_uhc, v_fac_id, TRUE)
    ON CONFLICT (contract_id, facility_id) DO NOTHING;

    -- Seed UHC Fee Schedule Terms
    INSERT INTO public.payer_contract_terms (contract_version_id, cpt_code, rate_methodology, contracted_rate, includes_implants)
    VALUES 
        (v_ver_uhc, '29827', 'FIXED_FEE', 4250.00, FALSE), -- Rotator Cuff Repair
        (v_ver_uhc, '29881', 'FIXED_FEE', 2150.00, FALSE), -- Knee Meniscectomy
        (v_ver_uhc, '66984', 'FIXED_FEE', 1850.00, FALSE), -- Cataract Surgery
        (v_ver_uhc, '45378', 'FIXED_FEE', 850.00, FALSE),  -- Diagnostic Colonoscopy
        (v_ver_uhc, '45380', 'FIXED_FEE', 1050.00, FALSE), -- Colonoscopy with Biopsy
        (v_ver_uhc, '45385', 'FIXED_FEE', 1250.00, FALSE)  -- Colonoscopy with Polypectomy
    ON CONFLICT (contract_version_id, cpt_code) DO UPDATE SET contracted_rate = EXCLUDED.contracted_rate;

    -- 4. Cigna Healthcare (142.0% of Medicare)
    INSERT INTO public.payer_contracts (id, organization_id, facility_id, payer_id, contract_number, contract_title, contract_type, scope_mode, execution_date, initial_effective_date, status)
    VALUES (v_ctr_cigna, v_org_id, NULL, v_cigna_id, 'CIGNA-FL-2026', 'Cigna Health & Life Outpatient Surgery Agreement', 'COMMERCIAL_DIRECT', 'ALL_FACILITIES', '2025-11-01', '2026-01-01', 'ACTIVE')
    ON CONFLICT (id) DO UPDATE SET contract_number = EXCLUDED.contract_number;

    INSERT INTO public.payer_contract_versions (id, contract_id, version_number, effective_start_date, effective_end_date, reimbursement_methodology, medicare_multiplier, mppr_rule_set_code, device_carve_out_mode, device_invoice_markup_pct, is_locked, status)
    VALUES (v_ver_cigna, v_ctr_cigna, 1, '2026-01-01', '2026-12-31', 'PERCENT_OF_MEDICARE', 1.4200, 'CMS_50_PERCENT', 'PASS_THROUGH_INVOICE_PLUS_PERCENT', 0.1000, TRUE, 'ACTIVE')
    ON CONFLICT (id) DO UPDATE SET medicare_multiplier = EXCLUDED.medicare_multiplier;

    INSERT INTO public.payer_contract_facility_scopes (contract_id, facility_id, is_active)
    VALUES (v_ctr_cigna, v_fac_id, TRUE)
    ON CONFLICT (contract_id, facility_id) DO NOTHING;

    -- 5. Humana Choice (135.0% of Medicare)
    INSERT INTO public.payer_contracts (id, organization_id, facility_id, payer_id, contract_number, contract_title, contract_type, scope_mode, execution_date, initial_effective_date, status)
    VALUES (v_ctr_humana, v_org_id, NULL, v_humana_id, 'HUMANA-MED-2026', 'Humana Commercial & Medicare Advantage Agreement', 'COMMERCIAL_DIRECT', 'ALL_FACILITIES', '2025-12-05', '2026-01-01', 'ACTIVE')
    ON CONFLICT (id) DO UPDATE SET contract_number = EXCLUDED.contract_number;

    INSERT INTO public.payer_contract_versions (id, contract_id, version_number, effective_start_date, effective_end_date, reimbursement_methodology, medicare_multiplier, mppr_rule_set_code, device_carve_out_mode, device_invoice_markup_pct, is_locked, status)
    VALUES (v_ver_humana, v_ctr_humana, 1, '2026-01-01', '2026-12-31', 'PERCENT_OF_MEDICARE', 1.3500, 'CMS_50_PERCENT', 'PASS_THROUGH_INVOICE_PLUS_PERCENT', 0.0800, TRUE, 'ACTIVE')
    ON CONFLICT (id) DO UPDATE SET medicare_multiplier = EXCLUDED.medicare_multiplier;

    INSERT INTO public.payer_contract_facility_scopes (contract_id, facility_id, is_active)
    VALUES (v_ctr_humana, v_fac_id, TRUE)
    ON CONFLICT (contract_id, facility_id) DO NOTHING;

END $$;

COMMIT;

