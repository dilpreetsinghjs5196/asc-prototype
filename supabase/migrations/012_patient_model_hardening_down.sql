-- ==============================================================================
-- MIGRATION 012 DOWN: ROLLBACK PATIENT MODEL HARDENING
-- ==============================================================================

BEGIN;

-- 1. Drop RLS policies on patient_external_identifiers
DROP POLICY IF EXISTS "Authorized Roles Can Delete Patient External Identifiers" ON public.patient_external_identifiers;
DROP POLICY IF EXISTS "Authorized Roles Can Update Patient External Identifiers" ON public.patient_external_identifiers;
DROP POLICY IF EXISTS "Authorized Roles Can Insert Patient External Identifiers" ON public.patient_external_identifiers;
DROP POLICY IF EXISTS "Authorized Roles Can View Patient External Identifiers" ON public.patient_external_identifiers;

-- 2. Drop triggers and functions
DROP TRIGGER IF EXISTS trg_protect_patient_deletion ON public.patients;
DROP FUNCTION IF EXISTS public.fn_protect_patient_deletion();

DROP TRIGGER IF EXISTS trg_patients_record_version ON public.patients;
DROP FUNCTION IF EXISTS public.fn_patients_before_update();

-- 3. Drop view
DROP VIEW IF EXISTS public.v_patients_minimum_necessary;

-- 4. Drop table patient_external_identifiers
DROP TABLE IF EXISTS public.patient_external_identifiers;

-- 5. Drop foreign key constraint on surgeries
ALTER TABLE public.surgeries DROP CONSTRAINT IF EXISTS fk_surgeries_patient;

-- 6. Drop indexes and columns on patients
DROP INDEX IF EXISTS public.idx_patients_is_active;
DROP INDEX IF EXISTS public.idx_patients_primary_payer;
DROP INDEX IF EXISTS public.idx_patients_patient_uuid;

ALTER TABLE public.patients
    DROP CONSTRAINT IF EXISTS uq_patients_patient_uuid,
    DROP COLUMN IF EXISTS record_version,
    DROP COLUMN IF EXISTS deleted_at,
    DROP COLUMN IF EXISTS is_active,
    DROP COLUMN IF EXISTS primary_payer_id,
    DROP COLUMN IF EXISTS patient_uuid;

COMMIT;
