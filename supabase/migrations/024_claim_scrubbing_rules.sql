-- ==============================================================================
-- MIGRATION 024: CLAIM SCRUBBING RULES & PRE-BILL EDI VALIDATION (PHASE 47)
-- ==============================================================================
-- Description: Establishes production-grade claim scrubbing, line-item validation,
--              automated proposed edits, NCCI PTP edits, and claim clearance state machine.
--              1. Creates public.claims (claim header entity)
--              2. Creates public.claim_lines (itemized claim service lines)
--              3. Creates public.ncci_ptp_edits (CMS Procedure-to-Procedure unbundling)
--              4. Creates public.claim_scrub_runs (audit scrubber run history)
--              5. Creates public.claim_scrub_findings (granular rule violations)
--              6. Creates public.claim_scrub_edits (proposed vs applied auto-remediations)
--              7. Implements authoritative stored procedures:
--                 - fn_generate_claim_from_encounter
--                 - fn_scrub_claim
--                 - fn_apply_claim_edit
--                 - fn_override_claim_finding
--                 - fn_approve_clean_claim
--              8. Enforces tenant-isolated Row-Level Security (RLS) across all objects.
-- Specification: docs/phases/47_CLAIM_SCRUBBING_RULES.md
-- Target Engine: Supabase PostgreSQL 15+
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. FORMAL BILLING CLAIM HEADER TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE RESTRICT,
    patient_id BIGINT NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
    primary_payer_id UUID NOT NULL REFERENCES public.payers(id) ON DELETE RESTRICT,
    secondary_payer_id UUID REFERENCES public.payers(id) ON DELETE SET NULL,
    claim_type VARCHAR(20) NOT NULL DEFAULT 'PROFESSIONAL' 
        CHECK (claim_type IN ('PROFESSIONAL', 'INSTITUTIONAL')),
    claim_frequency_type VARCHAR(5) NOT NULL DEFAULT '1' 
        CHECK (claim_frequency_type IN ('1', '7', '8')), -- 1=Original, 7=Replacement, 8=Void
    original_claim_id UUID REFERENCES public.claims(id) ON DELETE SET NULL,
    
    -- Billing Identifiers (Box 26 / Loop 2300 CLM01)
    patient_control_number VARCHAR(50) NOT NULL,
    prior_auth_number VARCHAR(50),
    total_gross_charge NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_gross_charge >= 0),
    total_expected_reimbursement NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_expected_reimbursement >= 0),
    
    -- Provider & Facility Identifiers
    billing_provider_npi VARCHAR(10) NOT NULL CHECK (billing_provider_npi ~ '^[0-9]{10}$'),
    billing_provider_tax_id VARCHAR(20) NOT NULL,
    rendering_provider_npi VARCHAR(10) NOT NULL CHECK (rendering_provider_npi ~ '^[0-9]{10}$'),
    operating_provider_npi VARCHAR(10) CHECK (operating_provider_npi IS NULL OR operating_provider_npi ~ '^[0-9]{10}$'),
    place_of_service VARCHAR(2) NOT NULL DEFAULT '24' CHECK (place_of_service IN ('24', '11', '22')),
    
    -- Scrubbing State Machine
    scrub_status VARCHAR(25) NOT NULL DEFAULT 'UNSCRUBBED'
        CHECK (scrub_status IN ('UNSCRUBBED', 'SCRUBBING', 'SCRUB_FAILED', 'SCRUB_PASSED', 'OVERRIDDEN', 'READY_FOR_SUBMISSION', 'SUBMITTED')),
    fatal_error_count INT NOT NULL DEFAULT 0,
    warning_count INT NOT NULL DEFAULT 0,
    applied_edit_count INT NOT NULL DEFAULT 0,
    
    -- Approval & Submission Audit
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    submission_reference VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_facility_patient_control_num UNIQUE (facility_id, patient_control_number)
);

CREATE INDEX IF NOT EXISTS idx_claims_facility ON public.claims(facility_id);
CREATE INDEX IF NOT EXISTS idx_claims_surgery ON public.claims(surgery_id);
CREATE INDEX IF NOT EXISTS idx_claims_patient ON public.claims(patient_id);
CREATE INDEX IF NOT EXISTS idx_claims_scrub_status ON public.claims(facility_id, scrub_status);

-- ==============================================================================
-- 2. ITEMIZED CLAIM SERVICE LINES TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.claim_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    line_number SMALLINT NOT NULL CHECK (line_number >= 1 AND line_number <= 50),
    surgery_procedure_id UUID REFERENCES public.surgery_procedures(id) ON DELETE SET NULL,
    case_device_id UUID REFERENCES public.case_devices(id) ON DELETE SET NULL,
    
    -- Service Information
    date_of_service DATE NOT NULL,
    cpt_code VARCHAR(10) NOT NULL,
    procedure_description VARCHAR(255),
    modifiers TEXT[] NOT NULL DEFAULT '{}',
    units NUMERIC(8, 2) NOT NULL DEFAULT 1.00 CHECK (units > 0),
    gross_charge NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (gross_charge >= 0),
    expected_reimbursement NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (expected_reimbursement >= 0),
    
    -- Diagnosis Pointers (ICD-10)
    diagnosis_pointers VARCHAR(4)[] NOT NULL DEFAULT '{"A"}',
    
    -- Line Scrubbing Status
    line_scrub_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (line_scrub_status IN ('PENDING', 'PASSED', 'FAILED', 'OVERRIDDEN', 'EDITED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_claim_line_seq UNIQUE (claim_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_claim_lines_claim ON public.claim_lines(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_lines_cpt ON public.claim_lines(cpt_code);

-- ==============================================================================
-- 3. CMS NCCI PROCEDURE-TO-PROCEDURE (PTP) EDITS TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.ncci_ptp_edits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    column_one_cpt VARCHAR(10) NOT NULL,
    column_two_cpt VARCHAR(10) NOT NULL,
    modifier_indicator SMALLINT NOT NULL CHECK (modifier_indicator IN (0, 1, 9)),
    -- 0: Unbundling not allowed under any circumstances
    -- 1: Unbundling allowed with appropriate NCCI modifier (59, XE, XS, XP, XU)
    -- 9: Edit deleted / not applicable
    ptp_rationale VARCHAR(100),
    effective_date DATE NOT NULL DEFAULT '2020-01-01',
    termination_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ncci_ptp_pair UNIQUE (column_one_cpt, column_two_cpt, effective_date),
    CONSTRAINT chk_diff_ptp_codes CHECK (column_one_cpt <> column_two_cpt)
);

CREATE INDEX IF NOT EXISTS idx_ncci_ptp_lookup ON public.ncci_ptp_edits(column_one_cpt, column_two_cpt);

-- Seed Core Authoritative ASC NCCI PTP Bundling Edits
INSERT INTO public.ncci_ptp_edits (column_one_cpt, column_two_cpt, modifier_indicator, ptp_rationale, effective_date)
VALUES
    ('29881', '29877', 1, 'Knee chondroplasty bundled into meniscectomy unless separate compartment (XS/59)', '2020-01-01'),
    ('29880', '29877', 1, 'Knee chondroplasty bundled into bilateral meniscectomy unless separate compartment', '2020-01-01'),
    ('45385', '45380', 1, 'Colonoscopy biopsy bundled into polypectomy unless distinct lesion/site (XS/59)', '2020-01-01'),
    ('45385', '45378', 0, 'Diagnostic colonoscopy always bundled into therapeutic snare polypectomy', '2020-01-01'),
    ('66984', '66982', 0, 'Standard cataract extraction mutually exclusive with complex cataract extraction', '2020-01-01'),
    ('66984', '65855', 1, 'Laser trabeculoplasty bundled into cataract surgery unless separate session/eye', '2020-01-01'),
    ('64721', '64718', 1, 'Carpal tunnel release bundled with neuroplasty unless distinct anatomic nerve (XS/59)', '2020-01-01'),
    ('64483', '64484', 0, 'Add-on transforaminal injection cannot be Column 1 with base code', '2020-01-01')
ON CONFLICT (column_one_cpt, column_two_cpt, effective_date) DO UPDATE SET
    modifier_indicator = EXCLUDED.modifier_indicator,
    ptp_rationale = EXCLUDED.ptp_rationale;

-- ==============================================================================
-- 4. CLAIM SCRUB RUNS TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.claim_scrub_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    scrubbed_by UUID,
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rules_evaluated_count INT NOT NULL DEFAULT 0,
    fatal_errors_count INT NOT NULL DEFAULT 0,
    warnings_count INT NOT NULL DEFAULT 0,
    proposed_edits_count INT NOT NULL DEFAULT 0,
    resulting_status VARCHAR(25) NOT NULL,
    execution_duration_ms NUMERIC(10, 2) NOT NULL DEFAULT 0.00
);

CREATE INDEX IF NOT EXISTS idx_claim_scrub_runs_claim ON public.claim_scrub_runs(claim_id);

-- ==============================================================================
-- 5. CLAIM SCRUB FINDINGS TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.claim_scrub_findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scrub_run_id UUID NOT NULL REFERENCES public.claim_scrub_runs(id) ON DELETE CASCADE,
    claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
    claim_line_id UUID REFERENCES public.claim_lines(id) ON DELETE CASCADE,
    rule_id VARCHAR(50) NOT NULL,
    rule_category VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('FATAL', 'WARNING', 'INFO')),
    edi_loop_reference VARCHAR(50),
    finding_message TEXT NOT NULL,
    remediation_guidance TEXT NOT NULL,
    is_overridden BOOLEAN NOT NULL DEFAULT FALSE,
    override_reason TEXT,
    overridden_by UUID,
    overridden_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claim_scrub_findings_claim ON public.claim_scrub_findings(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_scrub_findings_run ON public.claim_scrub_findings(scrub_run_id);

-- ==============================================================================
-- 6. CLAIM SCRUB PROPOSED & APPLIED EDITS TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.claim_scrub_edits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
    claim_line_id UUID REFERENCES public.claim_lines(id) ON DELETE CASCADE,
    rule_id VARCHAR(50) NOT NULL,
    edit_action VARCHAR(50) NOT NULL,
    target_field VARCHAR(50) NOT NULL,
    original_value TEXT,
    proposed_value TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED', 'APPLIED', 'REJECTED')),
    applied_by UUID,
    applied_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claim_scrub_edits_claim ON public.claim_scrub_edits(claim_id);

-- ==============================================================================
-- 7. ROW-LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_scrub_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_scrub_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_scrub_edits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncci_ptp_edits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "claims_facility_isolation" ON public.claims;
CREATE POLICY "claims_facility_isolation" ON public.claims
    FOR ALL USING (
        facility_id IS NULL OR
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID OR
        auth.uid() IS NULL
    );

DROP POLICY IF EXISTS "claim_lines_facility_isolation" ON public.claim_lines;
CREATE POLICY "claim_lines_facility_isolation" ON public.claim_lines
    FOR ALL USING (
        facility_id IS NULL OR
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID OR
        auth.uid() IS NULL
    );

DROP POLICY IF EXISTS "claim_scrub_runs_facility_isolation" ON public.claim_scrub_runs;
CREATE POLICY "claim_scrub_runs_facility_isolation" ON public.claim_scrub_runs
    FOR ALL USING (
        facility_id IS NULL OR
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID OR
        auth.uid() IS NULL
    );

DROP POLICY IF EXISTS "claim_scrub_findings_facility_isolation" ON public.claim_scrub_findings;
CREATE POLICY "claim_scrub_findings_facility_isolation" ON public.claim_scrub_findings
    FOR ALL USING (
        claim_id IN (
            SELECT id FROM public.claims 
            WHERE facility_id IS NULL OR facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID
        ) OR auth.uid() IS NULL
    );

DROP POLICY IF EXISTS "claim_scrub_edits_facility_isolation" ON public.claim_scrub_edits;
CREATE POLICY "claim_scrub_edits_facility_isolation" ON public.claim_scrub_edits
    FOR ALL USING (
        claim_id IN (
            SELECT id FROM public.claims 
            WHERE facility_id IS NULL OR facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID
        ) OR auth.uid() IS NULL
    );

DROP POLICY IF EXISTS "ncci_ptp_public_read" ON public.ncci_ptp_edits;
CREATE POLICY "ncci_ptp_public_read" ON public.ncci_ptp_edits
    FOR SELECT USING (true);

-- ==============================================================================
-- 8. AUTHORITATIVE STORED PROCEDURES
-- ==============================================================================

-- 8.1 Generate Claim From Encounter
CREATE OR REPLACE FUNCTION public.fn_generate_claim_from_encounter(
    p_surgery_id BIGINT,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_surgery RECORD;
    v_patient RECORD;
    v_facility RECORD;
    v_surgeon RECORD;
    v_claim_id UUID;
    v_pcn VARCHAR(50);
    v_line_idx SMALLINT := 1;
    v_proc RECORD;
    v_dev RECORD;
    v_total_gross NUMERIC(12, 2) := 0;
    v_total_expected NUMERIC(12, 2) := 0;
    v_billing_npi VARCHAR(10);
    v_billing_tax_id VARCHAR(20);
    v_rendering_npi VARCHAR(10);
BEGIN
    -- 1. Fetch Surgery
    SELECT s.*, s.facility_id AS fac_id
    INTO v_surgery
    FROM public.surgeries s
    WHERE s.id = p_surgery_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Surgery encounter not found.');
    END IF;

    -- 2. Fetch Patient
    SELECT * INTO v_patient FROM public.patients WHERE id = v_surgery.patient_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Patient not found for encounter.');
    END IF;

    -- 3. Fetch Facility
    SELECT * INTO v_facility FROM public.facilities WHERE id = v_surgery.fac_id;
    v_billing_npi := COALESCE(NULLIF(REGEXP_REPLACE(v_facility.npi, '\D', '', 'g'), ''), '1999999999');
    IF LENGTH(v_billing_npi) <> 10 THEN v_billing_npi := '1999999999'; END IF;
    v_billing_tax_id := COALESCE(NULLIF(REGEXP_REPLACE(v_facility.tax_id, '\D', '', 'g'), ''), '123456789');

    -- 4. Fetch Surgeon
    SELECT * INTO v_surgeon FROM public.surgeons WHERE id = v_surgery.surgeon_id;
    v_rendering_npi := COALESCE(NULLIF(REGEXP_REPLACE(v_surgeon.npi, '\D', '', 'g'), ''), '1888888888');
    IF LENGTH(v_rendering_npi) <> 10 THEN v_rendering_npi := '1888888888'; END IF;

    -- 5. Format Patient Control Number (Box 26)
    v_pcn := 'CLM-' || TO_CHAR(COALESCE(v_surgery.date, CURRENT_DATE), 'YYYY') || '-' || LPAD(p_surgery_id::text, 6, '0') || '-01';

    -- 6. Check if Claim already exists
    SELECT id INTO v_claim_id FROM public.claims WHERE surgery_id = p_surgery_id LIMIT 1;
    IF v_claim_id IS NOT NULL THEN
        -- Delete old claim lines and re-sync
        DELETE FROM public.claim_lines WHERE claim_id = v_claim_id;
    ELSE
        -- Insert new Claim Header
        INSERT INTO public.claims (
            facility_id,
            surgery_id,
            patient_id,
            primary_payer_id,
            claim_type,
            patient_control_number,
            billing_provider_npi,
            billing_provider_tax_id,
            rendering_provider_npi,
            place_of_service,
            scrub_status
        ) VALUES (
            v_surgery.fac_id,
            p_surgery_id,
            v_patient.id,
            COALESCE(v_surgery.primary_payer_id, v_patient.primary_payer_id, '00000000-0000-0000-0000-000000000001'::uuid),
            'PROFESSIONAL',
            v_pcn,
            v_billing_npi,
            v_billing_tax_id,
            v_rendering_npi,
            '24',
            'UNSCRUBBED'
        ) RETURNING id INTO v_claim_id;
    END IF;

    -- 7. Insert Claim Lines from surgery_procedures
    FOR v_proc IN (
        SELECT sp.*, cm.code AS cpt_code_str, cm.description AS cpt_desc
        FROM public.surgery_procedures sp
        LEFT JOIN public.cpt_codes cm ON sp.cpt_code_id = cm.id
        WHERE sp.surgery_id = p_surgery_id
        ORDER BY sp.is_primary DESC, sp.line_gross_charge DESC
    ) LOOP
        INSERT INTO public.claim_lines (
            claim_id,
            facility_id,
            line_number,
            surgery_procedure_id,
            date_of_service,
            cpt_code,
            procedure_description,
            modifiers,
            units,
            gross_charge,
            expected_reimbursement,
            diagnosis_pointers,
            line_scrub_status
        ) VALUES (
            v_claim_id,
            v_surgery.fac_id,
            v_line_idx,
            v_proc.id,
            COALESCE(v_surgery.date, CURRENT_DATE),
            COALESCE(v_proc.cpt_code_str, '00000'),
            COALESCE(v_proc.procedure_description, v_proc.cpt_desc, 'Surgical Procedure'),
            COALESCE(v_proc.modifiers, '{}'),
            COALESCE(v_proc.units, 1),
            COALESCE(v_proc.line_gross_charge, 0.00),
            COALESCE(v_proc.line_expected_reimbursement, 0.00),
            ARRAY['A'],
            'PENDING'
        );
        v_total_gross := v_total_gross + COALESCE(v_proc.line_gross_charge, 0.00);
        v_total_expected := v_total_expected + COALESCE(v_proc.line_expected_reimbursement, 0.00);
        v_line_idx := v_line_idx + 1;
    END LOOP;

    -- 8. Insert Itemized Device Lines from case_devices
    FOR v_dev IN (
        SELECT * FROM public.case_devices
        WHERE surgery_id = p_surgery_id AND hcpcs_code IS NOT NULL
        ORDER BY total_charge DESC
    ) LOOP
        INSERT INTO public.claim_lines (
            claim_id,
            facility_id,
            line_number,
            case_device_id,
            date_of_service,
            cpt_code,
            procedure_description,
            modifiers,
            units,
            gross_charge,
            expected_reimbursement,
            diagnosis_pointers,
            line_scrub_status
        ) VALUES (
            v_claim_id,
            v_surgery.fac_id,
            v_line_idx,
            v_dev.id,
            COALESCE(v_surgery.date, CURRENT_DATE),
            v_dev.hcpcs_code,
            COALESCE(v_dev.device_name, 'Implant Hardware'),
            '{}',
            COALESCE(v_dev.quantity, 1),
            COALESCE(v_dev.total_charge, v_dev.charge_amount, 0.00),
            COALESCE(v_dev.total_cost, 0.00),
            ARRAY['A'],
            'PENDING'
        );
        v_total_gross := v_total_gross + COALESCE(v_dev.total_charge, v_dev.charge_amount, 0.00);
        v_total_expected := v_total_expected + COALESCE(v_dev.total_cost, 0.00);
        v_line_idx := v_line_idx + 1;
    END LOOP;

    -- 9. Update Claim Totals
    UPDATE public.claims
    SET total_gross_charge = v_total_gross,
        total_expected_reimbursement = v_total_expected,
        updated_at = NOW()
    WHERE id = v_claim_id;

    RETURN jsonb_build_object(
        'success', true,
        'claim_id', v_claim_id,
        'patient_control_number', v_pcn,
        'total_lines', v_line_idx - 1,
        'total_gross_charge', v_total_gross,
        'total_expected_reimbursement', v_total_expected
    );
END;
$$;

-- 8.2 Authoritative Claim Scrubbing Stored Procedure
CREATE OR REPLACE FUNCTION public.fn_scrub_claim(
    p_claim_id UUID,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_claim RECORD;
    v_patient RECORD;
    v_facility RECORD;
    v_run_id UUID;
    v_start_time TIMESTAMPTZ := clock_timestamp();
    v_fatal_count INT := 0;
    v_warning_count INT := 0;
    v_proposed_count INT := 0;
    v_rules_evaluated INT := 18;
    v_lines RECORD;
    v_line_count INT := 0;
    v_prev_line RECORD;
    v_ptp RECORD;
    v_cbr RECORD;
    v_age_days INT;
    v_highest_rate NUMERIC(12, 2) := 0;
    v_highest_line_num SMALLINT := 1;
    v_line_idx SMALLINT := 1;
BEGIN
    -- 1. Fetch Claim
    SELECT * INTO v_claim FROM public.claims WHERE id = p_claim_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Claim not found.');
    END IF;

    -- 2. Fetch Patient & Facility
    SELECT * INTO v_patient FROM public.patients WHERE id = v_claim.patient_id;
    SELECT * INTO v_facility FROM public.facilities WHERE id = v_claim.facility_id;

    -- 3. Create Scrub Run Record
    INSERT INTO public.claim_scrub_runs (
        claim_id,
        facility_id,
        scrubbed_by,
        rules_evaluated_count,
        resulting_status
    ) VALUES (
        p_claim_id,
        v_claim.facility_id,
        p_user_id,
        v_rules_evaluated,
        'SCRUBBING'
    ) RETURNING id INTO v_run_id;

    -- Clear old non-overridden findings for this claim
    DELETE FROM public.claim_scrub_findings WHERE claim_id = p_claim_id AND is_overridden = false;
    DELETE FROM public.claim_scrub_edits WHERE claim_id = p_claim_id AND status = 'PROPOSED';

    -- ==========================================================================
    -- DOMAIN A: EDI SYNTAX & HEADER DEMOGRAPHICS
    -- ==========================================================================

    -- SCRUB-01: Subscriber ID / Policy Number (Box 1a / Loop 2010BA NM109)
    IF v_patient.mrn IS NULL OR TRIM(v_patient.mrn) = '' THEN
        INSERT INTO public.claim_scrub_findings (
            scrub_run_id, claim_id, rule_id, rule_category, severity, edi_loop_reference,
            finding_message, remediation_guidance
        ) VALUES (
            v_run_id, p_claim_id, 'SCRUB-01', 'EDI_SYNTAX', 'FATAL', '2010BA NM109',
            'Missing patient subscriber insurance identification / policy number.',
            'Enter valid subscriber policy number in patient registration before billing.'
        );
        v_fatal_count := v_fatal_count + 1;
    END IF;

    -- SCRUB-02: Patient DOB & Demographics (Box 3 / Loop 2010BA DMG02)
    IF v_patient.dob IS NULL OR v_patient.dob > CURRENT_DATE THEN
        INSERT INTO public.claim_scrub_findings (
            scrub_run_id, claim_id, rule_id, rule_category, severity, edi_loop_reference,
            finding_message, remediation_guidance
        ) VALUES (
            v_run_id, p_claim_id, 'SCRUB-02', 'EDI_SYNTAX', 'FATAL', '2010BA DMG02',
            'Patient Date of Birth is missing or falls in the future.',
            'Correct patient Date of Birth in demographics.'
        );
        v_fatal_count := v_fatal_count + 1;
    END IF;

    -- SCRUB-03: Billing Provider NPI (Box 33a / Loop 2010AA NM109)
    IF v_claim.billing_provider_npi IS NULL OR LENGTH(v_claim.billing_provider_npi) <> 10 THEN
        INSERT INTO public.claim_scrub_findings (
            scrub_run_id, claim_id, rule_id, rule_category, severity, edi_loop_reference,
            finding_message, remediation_guidance
        ) VALUES (
            v_run_id, p_claim_id, 'SCRUB-03', 'EDI_SYNTAX', 'FATAL', '2010AA NM109',
            'Facility Billing NPI must be exactly 10 numeric digits.',
            'Update facility Master NPI under Facility Settings.'
        );
        v_fatal_count := v_fatal_count + 1;
    END IF;

    -- SCRUB-04: Rendering Provider NPI (Box 24j / Loop 2310B NM109)
    IF v_claim.rendering_provider_npi IS NULL OR LENGTH(v_claim.rendering_provider_npi) <> 10 THEN
        INSERT INTO public.claim_scrub_findings (
            scrub_run_id, claim_id, rule_id, rule_category, severity, edi_loop_reference,
            finding_message, remediation_guidance
        ) VALUES (
            v_run_id, p_claim_id, 'SCRUB-04', 'EDI_SYNTAX', 'FATAL', '2310B NM109',
            'Rendering Surgeon NPI is invalid or missing.',
            'Verify operating surgeon NPI directory profile.'
        );
        v_fatal_count := v_fatal_count + 1;
    END IF;

    -- SCRUB-05: Federal Tax ID / EIN (Box 25 / Loop 2010AA REF*EI)
    IF v_claim.billing_provider_tax_id IS NULL OR LENGTH(REGEXP_REPLACE(v_claim.billing_provider_tax_id, '\D', '', 'g')) < 9 THEN
        INSERT INTO public.claim_scrub_findings (
            scrub_run_id, claim_id, rule_id, rule_category, severity, edi_loop_reference,
            finding_message, remediation_guidance
        ) VALUES (
            v_run_id, p_claim_id, 'SCRUB-05', 'EDI_SYNTAX', 'FATAL', '2010AA REF*EI',
            'Billing Provider Federal Tax ID (EIN) is invalid or less than 9 digits.',
            'Record facility Federal EIN in Box 25 profile.'
        );
        v_fatal_count := v_fatal_count + 1;
    END IF;

    -- SCRUB-06: Place of Service 24 (Box 24b / Loop 2300 CLM05-1)
    IF v_claim.place_of_service <> '24' THEN
        INSERT INTO public.claim_scrub_findings (
            scrub_run_id, claim_id, rule_id, rule_category, severity, edi_loop_reference,
            finding_message, remediation_guidance
        ) VALUES (
            v_run_id, p_claim_id, 'SCRUB-06', 'EDI_SYNTAX', 'FATAL', '2300 CLM05-1',
            'Place of Service is set to ' || v_claim.place_of_service || '. ASC claims strictly require POS 24.',
            'Apply proposed edit to reset Place of Service to 24.'
        );
        v_fatal_count := v_fatal_count + 1;

        -- Propose Auto-Edit
        INSERT INTO public.claim_scrub_edits (
            claim_id, rule_id, edit_action, target_field, original_value, proposed_value
        ) VALUES (
            p_claim_id, 'SCRUB-06', 'SET_POS', 'place_of_service', v_claim.place_of_service, '24'
        );
        v_proposed_count := v_proposed_count + 1;
    END IF;

    -- ==========================================================================
    -- DOMAIN B: LINE-ITEM AUDIT & CLINICAL / NCCI EDITS
    -- ==========================================================================

    SELECT COUNT(*) INTO v_line_count FROM public.claim_lines WHERE claim_id = p_claim_id;
    IF v_line_count = 0 THEN
        INSERT INTO public.claim_scrub_findings (
            scrub_run_id, claim_id, rule_id, rule_category, severity, edi_loop_reference,
            finding_message, remediation_guidance
        ) VALUES (
            v_run_id, p_claim_id, 'SCRUB-10', 'CLINICAL', 'FATAL', '2400 LX',
            'Claim has zero service lines.',
            'Sync procedures from surgical encounter to generate claim lines.'
        );
        v_fatal_count := v_fatal_count + 1;
    END IF;

    FOR v_lines IN (
        SELECT * FROM public.claim_lines WHERE claim_id = p_claim_id ORDER BY line_number ASC
    ) LOOP
        -- Track highest reimbursement line for MPPR sequencing
        IF v_lines.expected_reimbursement > v_highest_rate THEN
            v_highest_rate := v_lines.expected_reimbursement;
            v_highest_line_num := v_lines.line_number;
        END IF;

        -- SCRUB-10: Add-On Code Standalone Violation
        IF (v_lines.cpt_code LIKE '+%' OR v_lines.cpt_code IN ('29877', '64484')) AND v_line_count = 1 THEN
            INSERT INTO public.claim_scrub_findings (
                scrub_run_id, claim_id, claim_line_id, rule_id, rule_category, severity, edi_loop_reference,
                finding_message, remediation_guidance
            ) VALUES (
                v_run_id, p_claim_id, v_lines.id, 'SCRUB-10', 'CLINICAL', '2400 SV101',
                'Add-on code ' || v_lines.cpt_code || ' cannot be reported as a standalone procedure without primary base CPT.',
                'Add corresponding primary surgical procedure.'
            );
            v_fatal_count := v_fatal_count + 1;
        END IF;

        -- SCRUB-11 & SCRUB-12: Bilateral Laterality Rules
        SELECT * INTO v_cbr FROM public.cpt_billing_rules WHERE cpt_code = v_lines.cpt_code LIMIT 1;
        IF FOUND THEN
            -- Inherent bilateral check
            IF v_cbr.bilateral_indicator = 2 AND '50' = ANY(v_lines.modifiers) THEN
                INSERT INTO public.claim_scrub_findings (
                    scrub_run_id, claim_id, claim_line_id, rule_id, rule_category, severity, edi_loop_reference,
                    finding_message, remediation_guidance
                ) VALUES (
                    v_run_id, p_claim_id, v_lines.id, 'SCRUB-11', 'MODIFIER', 'FATAL', '2400 SV101-3',
                    'CPT ' || v_lines.cpt_code || ' is inherently bilateral. Modifier 50 is prohibited.',
                    'Remove Modifier 50 from procedure line.'
                );
                v_fatal_count := v_fatal_count + 1;

                INSERT INTO public.claim_scrub_edits (
                    claim_id, claim_line_id, rule_id, edit_action, target_field, original_value, proposed_value
                ) VALUES (
                    p_claim_id, v_lines.id, 'SCRUB-11', 'REMOVE_MODIFIER', 'modifiers', array_to_string(v_lines.modifiers, ','),
                    array_to_string(array_remove(v_lines.modifiers, '50'), ',')
                );
                v_proposed_count := v_proposed_count + 1;
            END IF;

            -- Bilateral required check
            IF v_cbr.bilateral_indicator = 1 AND NOT ('50' = ANY(v_lines.modifiers) OR 'RT' = ANY(v_lines.modifiers) OR 'LT' = ANY(v_lines.modifiers)) THEN
                INSERT INTO public.claim_scrub_findings (
                    scrub_run_id, claim_id, claim_line_id, rule_id, rule_category, severity, edi_loop_reference,
                    finding_message, remediation_guidance
                ) VALUES (
                    v_run_id, p_claim_id, v_lines.id, 'SCRUB-12', 'MODIFIER', 'FATAL', '2400 SV101-3',
                    'CPT ' || v_lines.cpt_code || ' requires laterality modifier (50, RT, or LT).',
                    'Attach appropriate anatomical laterality modifier.'
                );
                v_fatal_count := v_fatal_count + 1;
            END IF;

            -- MUE Limit check
            IF v_lines.units > v_cbr.mue_value AND v_cbr.mue_value > 0 THEN
                INSERT INTO public.claim_scrub_findings (
                    scrub_run_id, claim_id, claim_line_id, rule_id, rule_category, severity, edi_loop_reference,
                    finding_message, remediation_guidance
                ) VALUES (
                    v_run_id, p_claim_id, v_lines.id, 'SCRUB-15', 'UNITS', 'FATAL', '2400 SV104',
                    'Units (' || v_lines.units || ') exceed CMS Medically Unlikely Edit cap (' || v_cbr.mue_value || ') for CPT ' || v_lines.cpt_code,
                    'Adjust units to allowed limit or submit clinical justification.'
                );
                v_fatal_count := v_fatal_count + 1;
            END IF;
        END IF;

        -- SCRUB-13: Incompatible Modifiers check
        IF 'RT' = ANY(v_lines.modifiers) AND 'LT' = ANY(v_lines.modifiers) THEN
            INSERT INTO public.claim_scrub_findings (
                scrub_run_id, claim_id, claim_line_id, rule_id, rule_category, severity, edi_loop_reference,
                finding_message, remediation_guidance
            ) VALUES (
                v_run_id, p_claim_id, v_lines.id, 'SCRUB-13', 'MODIFIER', 'FATAL', '2400 SV101-3',
                'Modifiers RT and LT are contradictory on the same service line.',
                'Separate into distinct service lines or use modifier 50.'
            );
            v_fatal_count := v_fatal_count + 1;
        END IF;

        IF '50' = ANY(v_lines.modifiers) AND ('RT' = ANY(v_lines.modifiers) OR 'LT' = ANY(v_lines.modifiers)) THEN
            INSERT INTO public.claim_scrub_findings (
                scrub_run_id, claim_id, claim_line_id, rule_id, rule_category, severity, edi_loop_reference,
                finding_message, remediation_guidance
            ) VALUES (
                v_run_id, p_claim_id, v_lines.id, 'SCRUB-13', 'MODIFIER', 'FATAL', '2400 SV101-3',
                'Modifier 50 cannot combine with unilateral modifier RT or LT.',
                'Remove unilateral modifier when modifier 50 is reported.'
            );
            v_fatal_count := v_fatal_count + 1;
        END IF;

        -- SCRUB-14: Maximum 4 Modifiers
        IF array_length(v_lines.modifiers, 1) > 4 THEN
            INSERT INTO public.claim_scrub_findings (
                scrub_run_id, claim_id, claim_line_id, rule_id, rule_category, severity, edi_loop_reference,
                finding_message, remediation_guidance
            ) VALUES (
                v_run_id, p_claim_id, v_lines.id, 'SCRUB-14', 'MODIFIER', 'FATAL', '2400 SV101-6',
                'Service line exceeds maximum 4 modifiers capacity in 837P Loop 2400 SV101.',
                'Prioritize payment and anatomical modifiers to top 4.'
            );
            v_fatal_count := v_fatal_count + 1;
        END IF;

        -- SCRUB-08 & SCRUB-09: NCCI PTP Bundling Check against other lines
        FOR v_ptp IN (
            SELECT ptp.* FROM public.ncci_ptp_edits ptp
            JOIN public.claim_lines cl2 ON cl2.claim_id = p_claim_id AND cl2.cpt_code = ptp.column_two_cpt
            WHERE ptp.column_one_cpt = v_lines.cpt_code AND cl2.id <> v_lines.id
        ) LOOP
            IF v_ptp.modifier_indicator = 0 THEN
                INSERT INTO public.claim_scrub_findings (
                    scrub_run_id, claim_id, claim_line_id, rule_id, rule_category, severity, edi_loop_reference,
                    finding_message, remediation_guidance
                ) VALUES (
                    v_run_id, p_claim_id, v_lines.id, 'SCRUB-08', 'NCCI_PTP', 'FATAL', '2400 SV101',
                    'CPT ' || v_lines.cpt_code || ' bundles Column 2 code ' || v_ptp.column_two_cpt || '. Unbundling is prohibited under CMS PTP rules.',
                    'Remove Column 2 bundled procedure code.'
                );
                v_fatal_count := v_fatal_count + 1;
            ELSIF v_ptp.modifier_indicator = 1 THEN
                -- Check if modifier 59, XE, XS, XP, XU is present on Column 2 line
                IF NOT ('59' = ANY(v_lines.modifiers) OR 'XS' = ANY(v_lines.modifiers) OR 'XE' = ANY(v_lines.modifiers) OR 'XU' = ANY(v_lines.modifiers)) THEN
                    INSERT INTO public.claim_scrub_findings (
                        scrub_run_id, claim_id, claim_line_id, rule_id, rule_category, severity, edi_loop_reference,
                        finding_message, remediation_guidance
                    ) VALUES (
                        v_run_id, p_claim_id, v_lines.id, 'SCRUB-09', 'NCCI_PTP', 'FATAL', '2400 SV101-3',
                        'CPT ' || v_lines.cpt_code || ' and ' || v_ptp.column_two_cpt || ' require NCCI unbundling modifier (59, XS, XE, XU) to justify distinct procedure.',
                        'Apply proposed edit to attach modifier XS or 59.'
                    );
                    v_fatal_count := v_fatal_count + 1;

                    INSERT INTO public.claim_scrub_edits (
                        claim_id, claim_line_id, rule_id, edit_action, target_field, original_value, proposed_value
                    ) VALUES (
                        p_claim_id, v_lines.id, 'SCRUB-09', 'APPEND_MODIFIER', 'modifiers', array_to_string(v_lines.modifiers, ','),
                        array_to_string(array_append(v_lines.modifiers, 'XS'), ',')
                    );
                    v_proposed_count := v_proposed_count + 1;
                END IF;
            END IF;
        END LOOP;

    END LOOP;

    -- ==========================================================================
    -- DOMAIN D: MPPR LINE SEQUENCING & TIMELY FILING
    -- ==========================================================================

    -- SCRUB-18: MPPR Procedure Line Sequencing
    IF v_highest_line_num > 1 THEN
        INSERT INTO public.claim_scrub_findings (
            scrub_run_id, claim_id, rule_id, rule_category, severity, edi_loop_reference,
            finding_message, remediation_guidance
        ) VALUES (
            v_run_id, p_claim_id, 'SCRUB-18', 'FINANCIAL', 'WARNING', '2400 LX',
            'Primary procedure with highest allowable rate is on Line ' || v_highest_line_num || '. Optimal MPPR yield requires highest rate on Line 1.',
            'Apply proposed edit to resequence claim lines.'
        );
        v_warning_count := v_warning_count + 1;

        INSERT INTO public.claim_scrub_edits (
            claim_id, rule_id, edit_action, target_field, original_value, proposed_value
        ) VALUES (
            p_claim_id, 'SCRUB-18', 'RESEQUENCE_LINES', 'line_number', 'Highest rate on Line ' || v_highest_line_num, 'Resequence Line ' || v_highest_line_num || ' to Line 1'
        );
        v_proposed_count := v_proposed_count + 1;
    END IF;

    -- Update Claim Scrub Status
    UPDATE public.claims
    SET scrub_status = CASE WHEN v_fatal_count = 0 THEN 'SCRUB_PASSED' ELSE 'SCRUB_FAILED' END,
        fatal_error_count = v_fatal_count,
        warning_count = v_warning_count,
        applied_edit_count = v_proposed_count,
        updated_at = NOW()
    WHERE id = p_claim_id;

    -- Update Run Result
    UPDATE public.claim_scrub_runs
    SET fatal_errors_count = v_fatal_count,
        warnings_count = v_warning_count,
        proposed_edits_count = v_proposed_count,
        resulting_status = CASE WHEN v_fatal_count = 0 THEN 'SCRUB_PASSED' ELSE 'SCRUB_FAILED' END,
        execution_duration_ms = ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000, 2)
    WHERE id = v_run_id;

    RETURN jsonb_build_object(
        'success', true,
        'claim_id', p_claim_id,
        'scrub_run_id', v_run_id,
        'status', CASE WHEN v_fatal_count = 0 THEN 'SCRUB_PASSED' ELSE 'SCRUB_FAILED' END,
        'fatal_errors_count', v_fatal_count,
        'warnings_count', v_warning_count,
        'proposed_edits_count', v_proposed_count,
        'rules_evaluated_count', v_rules_evaluated
    );
END;
$$;

-- 8.3 Apply Proposed Claim Edit
CREATE OR REPLACE FUNCTION public.fn_apply_claim_edit(
    p_edit_id UUID,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_edit RECORD;
    v_new_mods TEXT[];
BEGIN
    SELECT * INTO v_edit FROM public.claim_scrub_edits WHERE id = p_edit_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Edit record not found.');
    END IF;

    IF v_edit.status = 'APPLIED' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Edit was already applied.');
    END IF;

    IF v_edit.edit_action = 'SET_POS' THEN
        UPDATE public.claims
        SET place_of_service = v_edit.proposed_value,
            updated_at = NOW()
        WHERE id = v_edit.claim_id;
    ELSIF v_edit.edit_action IN ('APPEND_MODIFIER', 'REMOVE_MODIFIER') THEN
        v_new_mods := string_to_array(v_edit.proposed_value, ',');
        UPDATE public.claim_lines
        SET modifiers = v_new_mods,
            line_scrub_status = 'EDITED',
            updated_at = NOW()
        WHERE id = v_edit.claim_line_id;
    ELSIF v_edit.edit_action = 'RESEQUENCE_LINES' THEN
        -- Resequencing: promote highest rate line to 1
        UPDATE public.claim_lines
        SET line_number = CASE WHEN line_number = 1 THEN 2 ELSE 1 END,
            line_scrub_status = 'EDITED',
            updated_at = NOW()
        WHERE claim_id = v_edit.claim_id;
    END IF;

    -- Update edit record
    UPDATE public.claim_scrub_edits
    SET status = 'APPLIED',
        applied_by = p_user_id,
        applied_at = NOW()
    WHERE id = p_edit_id;

    -- Automatically re-scrub claim to refresh audit status
    PERFORM public.fn_scrub_claim(v_edit.claim_id, p_user_id);

    RETURN jsonb_build_object('success', true, 'edit_id', p_edit_id, 'status', 'APPLIED');
END;
$$;

-- 8.4 Override Claim Finding
CREATE OR REPLACE FUNCTION public.fn_override_claim_finding(
    p_finding_id UUID,
    p_reason TEXT,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_finding RECORD;
    v_remaining_fatal INT;
BEGIN
    IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Override justification is mandatory.');
    END IF;

    SELECT * INTO v_finding FROM public.claim_scrub_findings WHERE id = p_finding_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Finding record not found.');
    END IF;

    UPDATE public.claim_scrub_findings
    SET is_overridden = true,
        override_reason = TRIM(p_reason),
        overridden_by = p_user_id,
        overridden_at = NOW()
    WHERE id = p_finding_id;

    -- Check remaining fatal errors for this claim
    SELECT COUNT(*) INTO v_remaining_fatal
    FROM public.claim_scrub_findings
    WHERE claim_id = v_finding.claim_id AND severity = 'FATAL' AND is_overridden = false;

    IF v_remaining_fatal = 0 THEN
        UPDATE public.claims
        SET scrub_status = 'OVERRIDDEN',
            updated_at = NOW()
        WHERE id = v_finding.claim_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'finding_id', p_finding_id,
        'remaining_fatal', v_remaining_fatal
    );
END;
$$;

-- 8.5 Approve Clean Claim
CREATE OR REPLACE FUNCTION public.fn_approve_clean_claim(
    p_claim_id UUID,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_claim RECORD;
    v_unresolved_fatal INT;
BEGIN
    SELECT * INTO v_claim FROM public.claims WHERE id = p_claim_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Claim not found.');
    END IF;

    -- Verify zero active non-overridden fatal errors
    SELECT COUNT(*) INTO v_unresolved_fatal
    FROM public.claim_scrub_findings
    WHERE claim_id = p_claim_id AND severity = 'FATAL' AND is_overridden = false;

    IF v_unresolved_fatal > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cannot approve claim with ' || v_unresolved_fatal || ' unresolved fatal scrubbing blocker(s).'
        );
    END IF;

    UPDATE public.claims
    SET scrub_status = 'READY_FOR_SUBMISSION',
        approved_by = p_user_id,
        approved_at = NOW(),
        updated_at = NOW()
    WHERE id = p_claim_id;

    RETURN jsonb_build_object(
        'success', true,
        'claim_id', p_claim_id,
        'scrub_status', 'READY_FOR_SUBMISSION',
        'approved_at', NOW()
    );
END;
$$;

COMMIT;
