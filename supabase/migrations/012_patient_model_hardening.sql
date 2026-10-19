-- ==============================================================================
-- MIGRATION 012: PATIENT MODEL HARDENING & REFERENTIAL INTEGRITY
-- ==============================================================================
-- Description: Establishes production-grade Patient Model Subsystem:
--              1. Extends public.patients with UUID, primary_payer_id FK, soft-delete, and versioning.
--              2. Attaches relational foreign key constraint fk_surgeries_patient on surgeries(patient_id).
--              3. Creates 1NF normalized public.patient_external_identifiers table for EMR/MPI tracking.
--              4. Implements server-side minimum-necessary view v_patients_minimum_necessary.
--              5. Enforces soft-delete referential integrity trigger preventing orphan surgeries.
--              6. Attaches automatic record_version and updated_at trigger on patients.
--              7. Configures tenant-isolated Row Level Security (RLS) policies.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. EXTEND PUBLIC.PATIENTS WITH PRODUCTION CANONICAL COLUMNS
-- ==============================================================================

ALTER TABLE public.patients
    ADD COLUMN IF NOT EXISTS patient_uuid UUID DEFAULT gen_random_uuid(),
    ADD COLUMN IF NOT EXISTS primary_payer_id UUID REFERENCES public.payers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS record_version INTEGER NOT NULL DEFAULT 1;

-- Backfill patient_uuid for all existing rows where it is NULL
UPDATE public.patients
SET patient_uuid = gen_random_uuid()
WHERE patient_uuid IS NULL;

-- Enforce NOT NULL and UNIQUE on patient_uuid
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_patients_patient_uuid'
    ) THEN
        ALTER TABLE public.patients ADD CONSTRAINT uq_patients_patient_uuid UNIQUE (patient_uuid);
    END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_patients_patient_uuid ON public.patients(patient_uuid);
CREATE INDEX IF NOT EXISTS idx_patients_primary_payer ON public.patients(primary_payer_id);
CREATE INDEX IF NOT EXISTS idx_patients_is_active ON public.patients(facility_id, is_active);

-- ==============================================================================
-- 2. ATTACH REFERENTIAL INTEGRITY CONSTRAINT ON SURGERIES
-- ==============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_surgeries_patient'
    ) THEN
        ALTER TABLE public.surgeries
            ADD CONSTRAINT fk_surgeries_patient
            FOREIGN KEY (patient_id) REFERENCES public.patients(id)
            ON DELETE RESTRICT;
    END IF;
END $$;

-- Index for surgery-to-patient joins
CREATE INDEX IF NOT EXISTS idx_surgeries_patient_id ON public.surgeries(patient_id);

-- ==============================================================================
-- 3. CREATE NORMALIZED EXTERNAL IDENTIFIERS TABLE (EMR / MPI)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.patient_external_identifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id BIGINT NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
    source_system TEXT NOT NULL,
    identifier_type TEXT NOT NULL,
    external_id TEXT NOT NULL,
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_patient_ext_source_system' AND conrelid = 'public.patient_external_identifiers'::regclass
    ) THEN
        ALTER TABLE public.patient_external_identifiers
            ADD CONSTRAINT chk_patient_ext_source_system CHECK (
                source_system IN ('EPIC', 'ATHENA', 'CERNER', 'MEDITECH', 'ALLSCRIPTS', 'EXTERNAL_EHR', 'CUSTOM_IMPORT', 'MANUAL')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_patient_ext_identifier_type' AND conrelid = 'public.patient_external_identifiers'::regclass
    ) THEN
        ALTER TABLE public.patient_external_identifiers
            ADD CONSTRAINT chk_patient_ext_identifier_type CHECK (
                identifier_type IN ('MRN', 'MPI', 'ACCOUNT', 'FHIR_ID', 'BILLING_ID', 'NATIONAL_ID')
            );
    END IF;
END $$;

-- Compound Unique Index to prevent duplicate external identifier collisions within facility
CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_ext_identifier
ON public.patient_external_identifiers (facility_id, source_system, identifier_type, LOWER(TRIM(external_id)));

-- Foreign key & timeline indexes
CREATE INDEX IF NOT EXISTS idx_patient_ext_patient_id ON public.patient_external_identifiers(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_ext_facility ON public.patient_external_identifiers(facility_id);

-- ==============================================================================
-- 4. SERVER-SIDE MINIMUM-NECESSARY PRIVACY PROJECTION VIEW
-- ==============================================================================

CREATE OR REPLACE VIEW public.v_patients_minimum_necessary
WITH (security_invoker = true) AS
SELECT 
    p.id,
    p.patient_uuid,
    p.facility_id,
    CASE 
        WHEN public.user_has_facility_role(p.facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'scheduler', 'biller', 'billing_rcm'])
        THEN p.name
        ELSE CONCAT(LEFT(TRIM(COALESCE(p.name, 'Patient')), 1), '***')
    END AS name,
    CASE 
        WHEN public.user_has_facility_role(p.facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'scheduler', 'biller', 'billing_rcm'])
        THEN p.mrn
        ELSE CONCAT('***', RIGHT(TRIM(COALESCE(p.mrn, '000')), 3))
    END AS mrn,
    CASE 
        WHEN public.user_has_facility_role(p.facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'scheduler', 'biller', 'billing_rcm'])
        THEN p.dob
        ELSE '**/**/' || COALESCE(SUBSTRING(p.dob FROM '\d{4}'), '****')
    END AS dob,
    p.gender,
    CASE 
        WHEN public.user_has_facility_role(p.facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'scheduler', 'biller', 'billing_rcm'])
        THEN p.phone
        ELSE '(***) ***-' || RIGHT(REGEXP_REPLACE(COALESCE(p.phone, '0000'), '\D', '', 'g'), 4)
    END AS phone,
    CASE 
        WHEN public.user_has_facility_role(p.facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'scheduler', 'biller', 'billing_rcm'])
        THEN p.email
        ELSE '***@***.***'
    END AS email,
    p.insurance_provider,
    p.primary_payer_id,
    p.is_active,
    p.record_version,
    p.created_at,
    p.updated_at
FROM public.patients p
WHERE p.is_active = true;

-- ==============================================================================
-- 5. AUTOMATIC RECORD VERSION & TIMESTAMP TRIGGER
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_patients_before_update()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    NEW.record_version := OLD.record_version + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_patients_record_version ON public.patients;
CREATE TRIGGER trg_patients_record_version
    BEFORE UPDATE ON public.patients
    FOR EACH ROW EXECUTE FUNCTION public.fn_patients_before_update();

-- ==============================================================================
-- 6. SOFT-DELETE & ORPHAN-PREVENTION TRIGGER
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_protect_patient_deletion()
RETURNS TRIGGER AS $$
DECLARE
    v_active_surgeries_count INT;
BEGIN
    -- Check if patient has any associated surgical cases
    SELECT COUNT(*) INTO v_active_surgeries_count
    FROM public.surgeries
    WHERE patient_id = OLD.id;

    IF v_active_surgeries_count > 0 THEN
        RAISE EXCEPTION 'CANNOT_DELETE_PATIENT_WITH_SURGERIES: Patient ID % has % associated surgical records. Please cancel or reassign surgeries first, or use soft-deactivation (is_active = false).', OLD.id, v_active_surgeries_count;
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_patient_deletion ON public.patients;
CREATE TRIGGER trg_protect_patient_deletion
    BEFORE DELETE ON public.patients
    FOR EACH ROW EXECUTE FUNCTION public.fn_protect_patient_deletion();

-- ==============================================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES FOR PATIENT EXTERNAL IDENTIFIERS
-- ==============================================================================

ALTER TABLE public.patient_external_identifiers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.patient_external_identifiers FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_external_identifiers TO authenticated;

DROP POLICY IF EXISTS "Authorized Roles Can View Patient External Identifiers" ON public.patient_external_identifiers;
CREATE POLICY "Authorized Roles Can View Patient External Identifiers"
ON public.patient_external_identifiers
FOR SELECT
TO authenticated
USING (
    facility_id IN (SELECT facility_id FROM public.get_auth_user_facilities())
    OR EXISTS (
        SELECT 1 FROM public.facility_memberships fm
        WHERE fm.user_id = auth.uid() AND fm.role = 'super_admin' AND fm.is_active = true
    )
);

DROP POLICY IF EXISTS "Authorized Roles Can Insert Patient External Identifiers" ON public.patient_external_identifiers;
CREATE POLICY "Authorized Roles Can Insert Patient External Identifiers"
ON public.patient_external_identifiers
FOR INSERT
TO authenticated
WITH CHECK (
    facility_id IN (SELECT facility_id FROM public.get_auth_user_facilities())
    AND public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'scheduler'])
);

DROP POLICY IF EXISTS "Authorized Roles Can Update Patient External Identifiers" ON public.patient_external_identifiers;
CREATE POLICY "Authorized Roles Can Update Patient External Identifiers"
ON public.patient_external_identifiers
FOR UPDATE
TO authenticated
USING (
    facility_id IN (SELECT facility_id FROM public.get_auth_user_facilities())
    AND public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'scheduler'])
)
WITH CHECK (
    facility_id IN (SELECT facility_id FROM public.get_auth_user_facilities())
    AND public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'scheduler'])
);

DROP POLICY IF EXISTS "Authorized Roles Can Delete Patient External Identifiers" ON public.patient_external_identifiers;
CREATE POLICY "Authorized Roles Can Delete Patient External Identifiers"
ON public.patient_external_identifiers
FOR DELETE
TO authenticated
USING (
    facility_id IN (SELECT facility_id FROM public.get_auth_user_facilities())
    AND public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin'])
);

COMMIT;
