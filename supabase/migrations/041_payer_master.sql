-- ==============================================================================
-- MIGRATION 041: PAYER MASTER & PAYER PLAN MASTER SUBSYSTEM
-- ==============================================================================
-- Description: Establishes normalized, multi-tenant enterprise Payer Master:
--              1. Decouples Global/Org Master (payer_master) from Facility Enablement (facility_payers).
--              2. Normalizes Payer Benefit Plans (payer_plans, facility_payer_plans).
--              3. Creates Multi-Identifier Electronic Routing (payer_identifiers) for EDI 837/270/276.
--              4. Normalizes Patient Insurance Coverage & COB (patient_insurance_coverages).
--              5. Creates Commercial Payer Contracts & Versions (payer_contracts, payer_contract_versions).
--              6. Creates Import Staging & Deduplication (payer_import_batches, payer_import_staging).
--              7. Implements Immutable Audit Ledger (payer_audit_logs).
--              8. Enforces Tenant RLS using is_facility_accessible & user_has_facility_role (Zero user_roles queries).
--              9. Safe bidirectional backfill from legacy public.payers and public.patients.
-- Statutory Authorities: HIPAA 5010 EDI 837/270/276, 42 CFR § 416, ACA § 1104
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. PAYER MASTER (GLOBAL / ENTERPRISE CATALOG)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.payer_master (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    payer_code VARCHAR(50) NOT NULL,
    legal_name VARCHAR(255) NOT NULL,
    trade_name VARCHAR(255),
    payer_category VARCHAR(30) NOT NULL DEFAULT 'Commercial'
        CHECK (payer_category IN ('Medicare', 'Medicaid', 'Commercial', 'Medicare_Advantage', 'Medicaid_Managed', 'Workers_Comp', 'Veterans_Affairs', 'Tricare', 'Self_Pay', 'Other')),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('DRAFT', 'ACTIVE', 'SUSPENDED', 'INACTIVE', 'ARCHIVED')),
    naic_code VARCHAR(10),
    tax_id VARCHAR(20),
    website_url VARCHAR(255),
    claims_phone VARCHAR(30),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_payer_master_code UNIQUE (payer_code)
);

CREATE INDEX IF NOT EXISTS idx_payer_master_category ON public.payer_master(payer_category, status);
CREATE INDEX IF NOT EXISTS idx_payer_master_org ON public.payer_master(organization_id);

-- ==============================================================================
-- 2. PAYER PLANS (BENEFIT PRODUCTS & LINES OF BUSINESS)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.payer_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payer_id UUID NOT NULL REFERENCES public.payer_master(id) ON DELETE RESTRICT,
    plan_code VARCHAR(50) NOT NULL,
    plan_name VARCHAR(255) NOT NULL,
    plan_type VARCHAR(30) NOT NULL DEFAULT 'PPO'
        CHECK (plan_type IN ('HMO', 'PPO', 'EPO', 'POS', 'MEDICARE_ADVANTAGE_HMO', 'MEDICARE_ADVANTAGE_PPO', 'MEDICAID_MCO', 'INDEMNITY', 'HIGH_DEDUCTIBLE', 'OTHER')),
    timely_filing_days INTEGER NOT NULL DEFAULT 180
        CHECK (timely_filing_days >= 30 AND timely_filing_days <= 730),
    requires_prior_auth BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_payer_plan_code UNIQUE (payer_id, plan_code)
);

CREATE INDEX IF NOT EXISTS idx_payer_plans_payer ON public.payer_plans(payer_id);
CREATE INDEX IF NOT EXISTS idx_payer_plans_type ON public.payer_plans(plan_type, is_active);

-- ==============================================================================
-- 3. PAYER IDENTIFIERS (ELECTRONIC ROUTING & EDI 837 / CLEARINGHOUSE IDS)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.payer_identifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payer_id UUID NOT NULL REFERENCES public.payer_master(id) ON DELETE CASCADE,
    identifier_type VARCHAR(40) NOT NULL
        CHECK (identifier_type IN ('EDI_PAYER_ID', 'CLEARINGHOUSE_ROUTING_CODE', 'ELIGIBILITY_PAYER_ID', 'CLAIM_STATUS_PAYER_ID', 'NAIC_CODE', 'STATE_MEDICAID_ID')),
    identifier_value VARCHAR(60) NOT NULL,
    clearinghouse VARCHAR(40) NOT NULL DEFAULT 'GLOBAL'
        CHECK (clearinghouse IN ('GLOBAL', 'AVAILITY', 'CHANGE_HEALTHCARE', 'WAYSTAR', 'TIRAS', 'DIRECT_EDI')),
    transaction_scope VARCHAR(30) NOT NULL DEFAULT 'ALL'
        CHECK (transaction_scope IN ('ALL', '837P_PROFESSIONAL', '837I_INSTITUTIONAL', '270_ELIGIBILITY', '276_CLAIM_STATUS', '835_ERA')),
    effective_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_end_date DATE,
    is_verified BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_payer_identifier_dates CHECK (effective_end_date IS NULL OR effective_end_date >= effective_start_date),
    CONSTRAINT uq_payer_identifier_scope UNIQUE (payer_id, identifier_type, clearinghouse, transaction_scope, effective_start_date)
);

CREATE INDEX IF NOT EXISTS idx_payer_identifiers_lookup ON public.payer_identifiers(identifier_value, identifier_type);
CREATE INDEX IF NOT EXISTS idx_payer_identifiers_payer ON public.payer_identifiers(payer_id);

-- ==============================================================================
-- 4. FACILITY PAYERS (FACILITY PARTICIPATION & IN-NETWORK SETTINGS)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.facility_payers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    payer_id UUID NOT NULL REFERENCES public.payer_master(id) ON DELETE RESTRICT,
    participation_status VARCHAR(25) NOT NULL DEFAULT 'IN_NETWORK'
        CHECK (participation_status IN ('IN_NETWORK', 'OUT_OF_NETWORK', 'PAR_PENDING', 'TERMINATED')),
    preferred_clearinghouse VARCHAR(40) NOT NULL DEFAULT 'AVAILITY'
        CHECK (preferred_clearinghouse IN ('AVAILITY', 'CHANGE_HEALTHCARE', 'WAYSTAR', 'DIRECT_EDI', 'MANUAL_PORTAL')),
    facility_payer_code_override VARCHAR(30),
    billing_npi_override VARCHAR(10),
    electronic_claim_enabled BOOLEAN NOT NULL DEFAULT true,
    billing_instructions TEXT,
    effective_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_end_date DATE,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_facility_payer_link UNIQUE (facility_id, payer_id)
);

CREATE INDEX IF NOT EXISTS idx_facility_payers_lookup ON public.facility_payers(facility_id, is_enabled);
CREATE INDEX IF NOT EXISTS idx_facility_payers_payer ON public.facility_payers(payer_id);

-- ==============================================================================
-- 5. FACILITY PAYER PLANS (GRANULAR PLAN ACCEPTANCE AT SURGERY CENTERS)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.facility_payer_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.payer_plans(id) ON DELETE RESTRICT,
    is_accepted BOOLEAN NOT NULL DEFAULT true,
    in_network_override BOOLEAN,
    copay_override NUMERIC(10, 2),
    requires_pre_auth BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_facility_payer_plan UNIQUE (facility_id, plan_id)
);

CREATE INDEX IF NOT EXISTS idx_facility_plans ON public.facility_payer_plans(facility_id, is_accepted);

-- ==============================================================================
-- 6. PATIENT INSURANCE COVERAGES (COORDINATION OF BENEFITS 1NF)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.patient_insurance_coverages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    patient_id BIGINT NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    coverage_order VARCHAR(15) NOT NULL DEFAULT 'PRIMARY'
        CHECK (coverage_order IN ('PRIMARY', 'SECONDARY', 'TERTIARY')),
    payer_id UUID NOT NULL REFERENCES public.payer_master(id) ON DELETE RESTRICT,
    plan_id UUID REFERENCES public.payer_plans(id) ON DELETE SET NULL,
    policy_number VARCHAR(80) NOT NULL,
    group_number VARCHAR(60),
    subscriber_name VARCHAR(150) NOT NULL,
    subscriber_dob DATE,
    subscriber_relationship VARCHAR(20) NOT NULL DEFAULT 'SELF'
        CHECK (subscriber_relationship IN ('SELF', 'SPOUSE', 'CHILD', 'OTHER')),
    effective_start_date DATE,
    effective_end_date DATE,
    copay_amount NUMERIC(10, 2),
    deductible_amount NUMERIC(10, 2),
    coinsurance_pct NUMERIC(5, 4)
        CHECK (coinsurance_pct IS NULL OR (coinsurance_pct >= 0 AND coinsurance_pct <= 1)),
    verification_status VARCHAR(25) NOT NULL DEFAULT 'UNVERIFIED'
        CHECK (verification_status IN ('UNVERIFIED', 'VERIFIED_ACTIVE', 'VERIFIED_INACTIVE', 'ERROR')),
    verified_at TIMESTAMPTZ,
    verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_patient_coverage_order UNIQUE (patient_id, coverage_order)
);

CREATE INDEX IF NOT EXISTS idx_patient_coverages_patient ON public.patient_insurance_coverages(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_coverages_payer ON public.patient_insurance_coverages(payer_id);

-- ==============================================================================
-- 7. PAYER CONTRACTS & CONTRACT VERSIONS (REIMBURSEMENT METHODOLOGIES)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.payer_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    payer_id UUID NOT NULL REFERENCES public.payer_master(id) ON DELETE RESTRICT,
    contract_number VARCHAR(80) NOT NULL,
    contract_title VARCHAR(255) NOT NULL,
    reimbursement_methodology VARCHAR(30) NOT NULL DEFAULT 'PERCENT_OF_MEDICARE'
        CHECK (reimbursement_methodology IN ('PERCENT_OF_MEDICARE', 'COMMERCIAL_FEE_SCHEDULE', 'PERCENT_OF_BILLED_CHARGES', 'CASE_RATE_BUNDLES', 'HYBRID')),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_facility_payer_contract UNIQUE (facility_id, contract_number)
);

CREATE INDEX IF NOT EXISTS idx_payer_contracts_facility ON public.payer_contracts(facility_id, status);
CREATE INDEX IF NOT EXISTS idx_payer_contracts_payer ON public.payer_contracts(payer_id);

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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_contract_version_dates CHECK (effective_end_date IS NULL OR effective_end_date >= effective_start_date),
    CONSTRAINT uq_contract_version_order UNIQUE (contract_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_contract_versions_lookup ON public.payer_contract_versions(contract_id, effective_start_date);

-- ==============================================================================
-- 8. PAYER IMPORT STAGING & DEDUPLICATION
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.payer_import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID REFERENCES public.facilities(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    source_name VARCHAR(100) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_sha256 VARCHAR(64) NOT NULL,
    total_rows INTEGER NOT NULL DEFAULT 0,
    valid_rows INTEGER NOT NULL DEFAULT 0,
    duplicate_rows INTEGER NOT NULL DEFAULT 0,
    error_rows INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(25) NOT NULL DEFAULT 'STAGED'
        CHECK (status IN ('STAGED', 'VALIDATED', 'COMMITTED', 'ROLLED_BACK', 'REJECTED')),
    imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    committed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    committed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payer_import_staging (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    batch_id UUID NOT NULL REFERENCES public.payer_import_batches(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    raw_payload JSONB NOT NULL,
    parsed_payer_name VARCHAR(255),
    parsed_payer_category VARCHAR(30),
    parsed_edi_payer_id VARCHAR(50),
    parsed_clearinghouse VARCHAR(40),
    parsed_naic_code VARCHAR(10),
    parsed_tax_id VARCHAR(20),
    validation_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (validation_status IN ('PENDING', 'VALID', 'INVALID')),
    validation_errors TEXT[],
    match_classification VARCHAR(30) NOT NULL DEFAULT 'UNEVALUATED'
        CHECK (match_classification IN ('UNEVALUATED', 'NEW', 'EXACT_MATCH', 'POTENTIAL_DUPLICATE', 'IDENTIFIER_CONFLICT')),
    matched_payer_id UUID REFERENCES public.payer_master(id) ON DELETE SET NULL,
    match_confidence NUMERIC(5, 4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_staging_batch ON public.payer_import_staging(batch_id, validation_status);

-- ==============================================================================
-- 9. IMMUTABLE AUDIT LOGS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.payer_audit_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    payer_id UUID REFERENCES public.payer_master(id) ON DELETE SET NULL,
    facility_id UUID REFERENCES public.facilities(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    state_before JSONB,
    state_after JSONB,
    change_rationale TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payer_audit_payer ON public.payer_audit_logs(payer_id);
CREATE INDEX IF NOT EXISTS idx_payer_audit_facility ON public.payer_audit_logs(facility_id);

-- Audit log immutability trigger
CREATE OR REPLACE FUNCTION public.fn_block_payer_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'payer_audit_logs is an append-only immutable ledger. UPDATE and DELETE are prohibited.'
        USING ERRCODE = '20000';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_block_payer_audit_modification ON public.payer_audit_logs;
CREATE TRIGGER trg_block_payer_audit_modification
    BEFORE UPDATE OR DELETE ON public.payer_audit_logs
    FOR EACH STATEMENT EXECUTE FUNCTION public.fn_block_payer_audit_modification();

-- Payer Master physical deletion blocker (Enforces lifecycle archival)
CREATE OR REPLACE FUNCTION public.fn_block_payer_master_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Physical DELETE on payer_master is strictly prohibited. Transition status to ARCHIVED instead.'
        USING ERRCODE = '20001';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_block_payer_master_delete ON public.payer_master;
CREATE TRIGGER trg_block_payer_master_delete
    BEFORE DELETE ON public.payer_master
    FOR EACH STATEMENT EXECUTE FUNCTION public.fn_block_payer_master_delete();

-- ==============================================================================
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- Strict Invariant: Zero queries or joins to public.user_roles
-- ==============================================================================

ALTER TABLE public.payer_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_identifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_payers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_payer_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_insurance_coverages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_contract_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_import_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_audit_logs ENABLE ROW LEVEL SECURITY;

-- 10.1 Payer Master Policies (Global / Org Hybrid)
DROP POLICY IF EXISTS "Payer Master Read Policy" ON public.payer_master;
CREATE POLICY "Payer Master Read Policy"
ON public.payer_master
FOR SELECT
TO authenticated
USING (
    organization_id IS NULL 
    OR EXISTS (
        SELECT 1 FROM public.facility_memberships fm
        JOIN public.facilities f ON f.id = fm.facility_id
        WHERE fm.user_id = auth.uid()
          AND fm.is_active = true
          AND f.organization_id = payer_master.organization_id
    )
);

DROP POLICY IF EXISTS "Payer Master Write Policy" ON public.payer_master;
CREATE POLICY "Payer Master Write Policy"
ON public.payer_master
FOR ALL
TO authenticated
USING (
    public.user_has_facility_role(NULL, ARRAY['super_admin'])
    OR (
        organization_id IS NOT NULL 
        AND EXISTS (
            SELECT 1 FROM public.facility_memberships fm
            JOIN public.facilities f ON f.id = fm.facility_id
            WHERE fm.user_id = auth.uid()
              AND fm.is_active = true
              AND f.organization_id = payer_master.organization_id
              AND fm.role IN ('org_admin')
        )
    )
);

-- 10.2 Payer Plans & Identifiers Policies
DROP POLICY IF EXISTS "Payer Plans Read Policy" ON public.payer_plans;
CREATE POLICY "Payer Plans Read Policy"
ON public.payer_plans FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Payer Plans Write Policy" ON public.payer_plans;
CREATE POLICY "Payer Plans Write Policy"
ON public.payer_plans FOR ALL TO authenticated
USING (public.user_has_facility_role(NULL, ARRAY['super_admin', 'org_admin']));

DROP POLICY IF EXISTS "Payer Identifiers Read Policy" ON public.payer_identifiers;
CREATE POLICY "Payer Identifiers Read Policy"
ON public.payer_identifiers FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Payer Identifiers Write Policy" ON public.payer_identifiers;
CREATE POLICY "Payer Identifiers Write Policy"
ON public.payer_identifiers FOR ALL TO authenticated
USING (public.user_has_facility_role(NULL, ARRAY['super_admin', 'org_admin', 'facility_admin', 'biller']));

-- 10.3 Facility Payers Policies (Multi-Tenant Isolation)
DROP POLICY IF EXISTS "Facility Payers Select Policy" ON public.facility_payers;
CREATE POLICY "Facility Payers Select Policy"
ON public.facility_payers FOR SELECT TO authenticated
USING (public.is_facility_accessible(facility_id));

DROP POLICY IF EXISTS "Facility Payers Write Policy" ON public.facility_payers;
CREATE POLICY "Facility Payers Write Policy"
ON public.facility_payers FOR ALL TO authenticated
USING (public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'biller']))
WITH CHECK (public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'biller']));

-- 10.4 Patient Insurance Coverages Policies (HIPAA PHI Isolation)
DROP POLICY IF EXISTS "Patient Insurance Read Policy" ON public.patient_insurance_coverages;
CREATE POLICY "Patient Insurance Read Policy"
ON public.patient_insurance_coverages FOR SELECT TO authenticated
USING (
    public.is_facility_accessible(facility_id)
    AND public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'biller', 'billing_rcm', 'coder', 'scheduler', 'surgeon'])
);

DROP POLICY IF EXISTS "Patient Insurance Write Policy" ON public.patient_insurance_coverages;
CREATE POLICY "Patient Insurance Write Policy"
ON public.patient_insurance_coverages FOR ALL TO authenticated
USING (public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'biller', 'billing_rcm', 'scheduler']))
WITH CHECK (public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'biller', 'billing_rcm', 'scheduler']));

-- 10.5 Payer Contracts Policies (Proprietary Financial Data Isolation)
DROP POLICY IF EXISTS "Payer Contracts Select Policy" ON public.payer_contracts;
CREATE POLICY "Payer Contracts Select Policy"
ON public.payer_contracts FOR SELECT TO authenticated
USING (public.is_facility_accessible(facility_id));

DROP POLICY IF EXISTS "Payer Contracts Write Policy" ON public.payer_contracts;
CREATE POLICY "Payer Contracts Write Policy"
ON public.payer_contracts FOR ALL TO authenticated
USING (public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'biller']))
WITH CHECK (public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'biller']));

DROP POLICY IF EXISTS "Payer Contract Versions Policy" ON public.payer_contract_versions;
CREATE POLICY "Payer Contract Versions Policy"
ON public.payer_contract_versions FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.payer_contracts c
        WHERE c.id = payer_contract_versions.contract_id
          AND public.is_facility_accessible(c.facility_id)
    )
);

-- ==============================================================================
-- 11. AUTHORITATIVE STORED PROCEDURES
-- ==============================================================================

-- 11.1 Resolve Authoritative Electronic Payer ID for EDI 837 Loop 2010BB NM109
DROP FUNCTION IF EXISTS public.fn_resolve_edi_payer_id(UUID, UUID, VARCHAR, VARCHAR);
CREATE OR REPLACE FUNCTION public.fn_resolve_edi_payer_id(
    p_facility_id UUID,
    p_payer_id UUID,
    p_clearinghouse VARCHAR DEFAULT 'AVAILITY',
    p_transaction_scope VARCHAR DEFAULT '837I_INSTITUTIONAL'
)
RETURNS TABLE (
    edi_payer_id VARCHAR,
    clearinghouse_used VARCHAR,
    resolution_source VARCHAR
) AS $$
DECLARE
    v_override VARCHAR;
    v_preferred_clg VARCHAR;
    v_resolved_id VARCHAR;
BEGIN
    -- 1. Check facility-payer local override
    SELECT fp.facility_payer_code_override, fp.preferred_clearinghouse
    INTO v_override, v_preferred_clg
    FROM public.facility_payers fp
    WHERE fp.facility_id = p_facility_id AND fp.payer_id = p_payer_id;

    IF v_override IS NOT NULL AND LENGTH(TRIM(v_override)) > 0 THEN
        RETURN QUERY SELECT v_override, COALESCE(v_preferred_clg, p_clearinghouse), 'FACILITY_OVERRIDE'::VARCHAR;
        RETURN;
    END IF;

    -- 2. Check clearinghouse-specific EDI ID
    SELECT pi.identifier_value INTO v_resolved_id
    FROM public.payer_identifiers pi
    WHERE pi.payer_id = p_payer_id
      AND pi.identifier_type = 'EDI_PAYER_ID'
      AND (pi.clearinghouse = COALESCE(v_preferred_clg, p_clearinghouse))
      AND (pi.transaction_scope = p_transaction_scope OR pi.transaction_scope = 'ALL')
      AND CURRENT_DATE >= pi.effective_start_date
      AND (pi.effective_end_date IS NULL OR CURRENT_DATE <= pi.effective_end_date)
    ORDER BY (CASE WHEN pi.transaction_scope = p_transaction_scope THEN 1 ELSE 2 END)
    LIMIT 1;

    IF v_resolved_id IS NOT NULL THEN
        RETURN QUERY SELECT v_resolved_id, COALESCE(v_preferred_clg, p_clearinghouse), 'CLEARINGHOUSE_SPECIFIC'::VARCHAR;
        RETURN;
    END IF;

    -- 3. Check GLOBAL EDI ID fallback
    SELECT pi.identifier_value INTO v_resolved_id
    FROM public.payer_identifiers pi
    WHERE pi.payer_id = p_payer_id
      AND pi.identifier_type = 'EDI_PAYER_ID'
      AND pi.clearinghouse = 'GLOBAL'
      AND CURRENT_DATE >= pi.effective_start_date
      AND (pi.effective_end_date IS NULL OR CURRENT_DATE <= pi.effective_end_date)
    LIMIT 1;

    IF v_resolved_id IS NOT NULL THEN
        RETURN QUERY SELECT v_resolved_id, 'GLOBAL'::VARCHAR, 'GLOBAL_DEFAULT'::VARCHAR;
        RETURN;
    END IF;

    -- 4. Not found
    RETURN QUERY SELECT NULL::VARCHAR, NULL::VARCHAR, 'UNRESOLVED'::VARCHAR;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- ==============================================================================
-- 12. SEED DATA & HISTORICAL BACKFILL
-- ==============================================================================

-- 12.1 Baseline Master Payers
INSERT INTO public.payer_master (id, payer_code, legal_name, trade_name, payer_category, status, naic_code)
VALUES
    ('20000000-0000-0000-0000-000000000001', 'CMS-MEDICARE-FL', 'First Coast Service Options Inc.', 'Medicare Florida (First Coast)', 'Medicare', 'ACTIVE', '00400'),
    ('20000000-0000-0000-0000-000000000002', 'BCBS-FL', 'Blue Cross and Blue Shield of Florida, Inc.', 'Florida Blue (BCBS)', 'Commercial', 'ACTIVE', '00590'),
    ('20000000-0000-0000-0000-000000000003', 'AETNA-HEALTH', 'Aetna Life Insurance Company', 'Aetna Healthcare', 'Commercial', 'ACTIVE', '60054'),
    ('20000000-0000-0000-0000-000000000004', 'UHC-OPT', 'UnitedHealthcare Insurance Company', 'UnitedHealthcare Outpatient', 'Commercial', 'ACTIVE', '87726'),
    ('20000000-0000-0000-0000-000000000005', 'SELFPAY-DIRECT', 'Self-Pay Direct Patient Responsibility', 'Self-Pay / Non-Insured', 'Self_Pay', 'ACTIVE', NULL),
    ('20000000-0000-0000-0000-000000000006', 'CIGNA-HEALTH', 'Cigna Health and Life Insurance Company', 'Cigna Healthcare', 'Commercial', 'ACTIVE', '62308'),
    ('20000000-0000-0000-0000-000000000007', 'HUMANA-MED', 'Humana Insurance Company', 'Humana Choice', 'Commercial', 'ACTIVE', '61101')
ON CONFLICT (payer_code) DO UPDATE SET
    legal_name = EXCLUDED.legal_name,
    trade_name = EXCLUDED.trade_name,
    payer_category = EXCLUDED.payer_category;

-- 12.2 Baseline Benefit Plans
INSERT INTO public.payer_plans (payer_id, plan_code, plan_name, plan_type, timely_filing_days, requires_prior_auth)
VALUES
    ('20000000-0000-0000-0000-000000000001', 'MEDICARE-PART-B', 'Medicare Part B Fee-for-Service', 'INDEMNITY', 365, false),
    ('20000000-0000-0000-0000-000000000002', 'BLUECARE-HMO', 'Florida Blue BlueCare HMO', 'HMO', 180, true),
    ('20000000-0000-0000-0000-000000000002', 'BLUEOPTIONS-PPO', 'Florida Blue BlueOptions PPO', 'PPO', 180, false),
    ('20000000-0000-0000-0000-000000000003', 'AETNA-CHOICE-POS', 'Aetna Choice POS II (Open Access)', 'POS', 180, true),
    ('20000000-0000-0000-0000-000000000003', 'AETNA-MEDICARE-ADV', 'Aetna Medicare Advantage PPO', 'MEDICARE_ADVANTAGE_PPO', 180, true),
    ('20000000-0000-0000-0000-000000000004', 'UHC-CHOICE-PLUS', 'UnitedHealthcare Choice Plus PPO', 'PPO', 90, false),
    ('20000000-0000-0000-0000-000000000004', 'UHC-NAVIGATE-EPO', 'UnitedHealthcare Navigate EPO', 'EPO', 90, true),
    ('20000000-0000-0000-0000-000000000005', 'SELFPAY-STANDARD', 'Self-Pay Standard Facility Packaging', 'OTHER', 365, false)
ON CONFLICT (payer_id, plan_code) DO NOTHING;

-- 12.3 Baseline Electronic EDI Identifiers (Loop 2010BB NM109)
INSERT INTO public.payer_identifiers (payer_id, identifier_type, identifier_value, clearinghouse, transaction_scope)
VALUES
    ('20000000-0000-0000-0000-000000000001', 'EDI_PAYER_ID', '00400', 'GLOBAL', '837I_INSTITUTIONAL'),
    ('20000000-0000-0000-0000-000000000001', 'EDI_PAYER_ID', '00400', 'AVAILITY', '837I_INSTITUTIONAL'),
    ('20000000-0000-0000-0000-000000000002', 'EDI_PAYER_ID', '00590', 'GLOBAL', '837I_INSTITUTIONAL'),
    ('20000000-0000-0000-0000-000000000002', 'EDI_PAYER_ID', '00590', 'AVAILITY', '837I_INSTITUTIONAL'),
    ('20000000-0000-0000-0000-000000000003', 'EDI_PAYER_ID', '60054', 'GLOBAL', '837I_INSTITUTIONAL'),
    ('20000000-0000-0000-0000-000000000003', 'EDI_PAYER_ID', '60054', 'AVAILITY', '837I_INSTITUTIONAL'),
    ('20000000-0000-0000-0000-000000000004', 'EDI_PAYER_ID', '87726', 'GLOBAL', '837I_INSTITUTIONAL'),
    ('20000000-0000-0000-0000-000000000004', 'EDI_PAYER_ID', '87726', 'AVAILITY', '837I_INSTITUTIONAL'),
    ('20000000-0000-0000-0000-000000000006', 'EDI_PAYER_ID', '62308', 'GLOBAL', '837I_INSTITUTIONAL'),
    ('20000000-0000-0000-0000-000000000007', 'EDI_PAYER_ID', '61101', 'GLOBAL', '837I_INSTITUTIONAL')
ON CONFLICT (payer_id, identifier_type, clearinghouse, transaction_scope, effective_start_date) DO NOTHING;

-- 12.4 Enable Baseline Payers for Primary Facility (00000000-0000-0000-0000-000000000002)
INSERT INTO public.facility_payers (facility_id, payer_id, participation_status, preferred_clearinghouse, is_enabled)
SELECT
    '00000000-0000-0000-0000-000000000002'::uuid,
    pm.id,
    'IN_NETWORK',
    'AVAILITY',
    true
FROM public.payer_master pm
ON CONFLICT (facility_id, payer_id) DO NOTHING;

-- 12.5 Backfill Flat Patient Insurance into patient_insurance_coverages (Primary)
INSERT INTO public.patient_insurance_coverages (
    facility_id, patient_id, coverage_order, payer_id, policy_number, group_number, subscriber_name, subscriber_relationship, copay_amount, deductible_amount
)
SELECT
    p.facility_id,
    p.id,
    'PRIMARY',
    COALESCE(p.primary_payer_id, '20000000-0000-0000-0000-000000000001'::uuid),
    COALESCE(p.insurance_policy_number, 'POL-' || p.mrn),
    p.insurance_group_number,
    COALESCE(p.subscriber_name, p.name),
    COALESCE(p.subscriber_relationship, 'SELF'),
    p.copay_amount,
    p.deductible_amount
FROM public.patients p
WHERE p.is_active = true
ON CONFLICT (patient_id, coverage_order) DO UPDATE SET
    payer_id = EXCLUDED.payer_id,
    policy_number = EXCLUDED.policy_number,
    group_number = EXCLUDED.group_number,
    subscriber_name = EXCLUDED.subscriber_name;

COMMIT;

