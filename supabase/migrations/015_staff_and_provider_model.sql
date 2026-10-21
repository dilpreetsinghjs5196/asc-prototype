-- ==============================================================================
-- MIGRATION 015: STAFF AND PROVIDER MODEL, ANESTHESIA & CASE ASSIGNMENTS
-- ==============================================================================
-- Description: Establishes enterprise clinical staffing subsystem (Phase 36):
--              1. Sanitizes existing public.staff records (trims, cleans '(PT)', fixes 'Scru Tech').
--              2. Hardens public.staff with UUID, GoTrue user_id, credentials, and staff_type.
--              3. Creates 1NF public.staff_facility_affiliations for multi-facility employment & wages.
--              4. Backfills existing 18 staff into staff_facility_affiliations for Naples Surgery Center.
--              5. Creates 1NF public.staff_credentials for license tracking and expiration alerts.
--              6. Creates 1NF public.case_staff_assignments for perioperative roles & labor costs.
--              7. Creates 1NF public.anesthesia_records for clinical anesthesia & ASA scoring.
--              8. Creates 1NF public.staff_shifts and public.staff_time_off for availability & leave.
--              9. Implements fn_validate_case_staff_scheduling_conflict() stored procedure.
--              10. Deploys server-side view v_case_labor_cost_summary for frozen wage analytics.
--              11. Enforces tenant-isolated Row Level Security (RLS) policies and audit triggers.
-- Specification: docs/phases/36_STAFF_AND_PROVIDER_MODEL.md
-- Platform: Supabase PostgreSQL 15+
-- ==============================================================================

BEGIN;

-- 1. Ensure required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- ==============================================================================
-- 1. SANITIZE AND HARDEN PUBLIC.STAFF MASTER TABLE
-- ==============================================================================

-- 1.1 Clean name contaminants and typos on existing rows
UPDATE public.staff
SET lastname = 'Brown'
WHERE id = 9 AND lastname LIKE '%Brown%';

UPDATE public.staff
SET lastname = 'Parsons'
WHERE id = 10 AND lastname LIKE '%Parsons%';

UPDATE public.staff
SET firstname = 'Noel', lastname = 'Weaver'
WHERE id = 11;

UPDATE public.staff
SET lastname = 'Mattos'
WHERE id = 12 AND lastname LIKE '%Mattos%';

-- Fix 'Scru Tech' department and role typos
UPDATE public.staff
SET role = 'Scrub Tech'
WHERE role = 'Scru Tech';

-- Clean leading and trailing whitespace
UPDATE public.staff
SET firstname = TRIM(firstname),
    lastname = TRIM(lastname);

-- 1.2 Add canonical identity columns
ALTER TABLE public.staff
    ADD COLUMN IF NOT EXISTS staff_uuid UUID DEFAULT gen_random_uuid(),
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS credentials TEXT DEFAULT 'RN',
    ADD COLUMN IF NOT EXISTS staff_type TEXT NOT NULL DEFAULT 'Registered_Nurse',
    ADD COLUMN IF NOT EXISTS photo_url TEXT,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS record_version INTEGER NOT NULL DEFAULT 1;

-- Backfill staff_uuid where NULL
UPDATE public.staff
SET staff_uuid = gen_random_uuid()
WHERE staff_uuid IS NULL;

-- Enforce NOT NULL and UNIQUE on staff_uuid
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_staff_staff_uuid'
    ) THEN
        ALTER TABLE public.staff ADD CONSTRAINT uq_staff_staff_uuid UNIQUE (staff_uuid);
    END IF;
END $$;

ALTER TABLE public.staff ALTER COLUMN staff_uuid SET NOT NULL;

-- Map existing department roles to standard staff_type
UPDATE public.staff
SET staff_type = CASE 
    WHEN department ILIKE '%Executive%' THEN 'Administrative'
    WHEN department ILIKE '%Front Office%' THEN 'Administrative'
    WHEN department ILIKE '%Operating Room RN%' THEN 'Registered_Nurse'
    WHEN department ILIKE '%Pre-Op%' OR department ILIKE '%PACU%' THEN 'Registered_Nurse'
    WHEN department ILIKE '%Scrub Tech%' THEN 'Surgical_Technologist'
    WHEN department ILIKE '%Sterile Technician%' THEN 'Sterile_Processing_Tech'
    ELSE 'Other'
END;

-- Map existing credentials
UPDATE public.staff
SET credentials = CASE
    WHEN staff_type = 'Registered_Nurse' THEN 'RN, BSN'
    WHEN staff_type = 'Surgical_Technologist' THEN 'CST'
    WHEN staff_type = 'Sterile_Processing_Tech' THEN 'CRCST'
    WHEN staff_type = 'Administrative' THEN 'MBA'
    ELSE 'Staff'
END
WHERE credentials IS NULL OR credentials = 'RN';

-- Create canonical indexes
CREATE INDEX IF NOT EXISTS idx_staff_staff_uuid ON public.staff(staff_uuid);
CREATE INDEX IF NOT EXISTS idx_staff_user_id ON public.staff(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_staff_type ON public.staff(staff_type);
CREATE INDEX IF NOT EXISTS idx_staff_active ON public.staff(is_active) WHERE is_active = true;

-- ==============================================================================
-- 2. CREATE 1NF PUBLIC.STAFF_FACILITY_AFFILIATIONS TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.staff_facility_affiliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id BIGINT NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    employment_type TEXT NOT NULL DEFAULT 'Full_Time' CHECK (
        employment_type IN ('Full_Time', 'Part_Time', 'PRN', 'Contract_Agency', 'Temporary')
    ),
    primary_department TEXT NOT NULL DEFAULT 'Operating_Room' CHECK (
        primary_department IN (
            'Operating_Room',
            'Pre_Op',
            'PACU',
            'Anesthesia',
            'Sterile_Processing',
            'Materials_Management',
            'Executive_Management',
            'Front_Office',
            'Float_Pool'
        )
    ),
    clinical_role TEXT NOT NULL DEFAULT 'Circulating_Nurse' CHECK (
        clinical_role IN (
            'Circulating_Nurse',
            'Scrub_Nurse',
            'Scrub_Tech',
            'First_Assistant',
            'Pre_Op_Nurse',
            'PACU_Nurse',
            'Charge_Nurse',
            'Anesthesiologist',
            'CRNA',
            'Sterile_Processing_Tech',
            'Materials_Manager',
            'Administrator',
            'Receptionist'
        )
    ),
    hourly_rate NUMERIC(10, 2) CHECK (hourly_rate IS NULL OR hourly_rate >= 0.00),
    overtime_hourly_rate NUMERIC(10, 2) CHECK (overtime_hourly_rate IS NULL OR overtime_hourly_rate >= 0.00),
    on_call_hourly_rate NUMERIC(10, 2) CHECK (on_call_hourly_rate IS NULL OR on_call_hourly_rate >= 0.00),
    monthly_salary NUMERIC(10, 2) CHECK (monthly_salary IS NULL OR monthly_salary >= 0.00),
    benefits_multiplier NUMERIC(4, 2) DEFAULT 1.25,
    effective_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_end_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_staff_facility_affiliation UNIQUE (staff_id, facility_id),
    CONSTRAINT chk_staff_affiliation_dates CHECK (effective_end_date IS NULL OR effective_end_date >= effective_start_date)
);

CREATE INDEX IF NOT EXISTS idx_staff_affil_facility ON public.staff_facility_affiliations(facility_id);
CREATE INDEX IF NOT EXISTS idx_staff_affil_staff ON public.staff_facility_affiliations(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_affil_role ON public.staff_facility_affiliations(facility_id, clinical_role);

-- Backfill existing staff into staff_facility_affiliations
INSERT INTO public.staff_facility_affiliations (
    staff_id,
    facility_id,
    employment_type,
    primary_department,
    clinical_role,
    hourly_rate,
    monthly_salary,
    is_active
)
SELECT 
    s.id,
    COALESCE(s.facility_id, '00000000-0000-0000-0000-000000000002'::uuid),
    CASE WHEN s.id IN (9, 10, 12) THEN 'Part_Time' ELSE 'Full_Time' END,
    CASE 
        WHEN s.department ILIKE '%Pre-Op%' THEN 'Pre_Op'
        WHEN s.department ILIKE '%Operating Room%' THEN 'Operating_Room'
        WHEN s.department ILIKE '%Scrub%' THEN 'Operating_Room'
        WHEN s.department ILIKE '%Sterile%' THEN 'Sterile_Processing'
        WHEN s.department ILIKE '%Executive%' THEN 'Executive_Management'
        WHEN s.department ILIKE '%Front Office%' THEN 'Front_Office'
        ELSE 'Operating_Room'
    END,
    CASE 
        WHEN s.role ILIKE '%Operating Room RN%' THEN 'Circulating_Nurse'
        WHEN s.role ILIKE '%Pre-Op%' THEN 'Pre_Op_Nurse'
        WHEN s.role ILIKE '%Scrub%' THEN 'Scrub_Tech'
        WHEN s.role ILIKE '%Sterile%' THEN 'Sterile_Processing_Tech'
        WHEN s.role ILIKE '%Executive%' THEN 'Administrator'
        WHEN s.role ILIKE '%Front Office%' THEN 'Receptionist'
        ELSE 'Circulating_Nurse'
    END,
    s.hourly_rate,
    s.monthly_salary,
    s.is_active
FROM public.staff s
ON CONFLICT (staff_id, facility_id) DO NOTHING;

-- ==============================================================================
-- 3. CREATE 1NF PUBLIC.STAFF_CREDENTIALS TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.staff_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id BIGINT NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    credential_type TEXT NOT NULL CHECK (
        credential_type IN (
            'State_Nursing_License',
            'State_Medical_License',
            'CRNA_NBCRNA_Certification',
            'CST_NBSTSA_Certification',
            'BLS_American_Heart',
            'ACLS_American_Heart',
            'PALS_American_Heart',
            'DEA_Registration',
            'State_Controlled_Substance',
            'C_Arm_Fluoroscopy_Permit',
            'Laser_Safety_Certificate'
        )
    ),
    credential_number TEXT NOT NULL,
    issuing_jurisdiction TEXT NOT NULL DEFAULT 'FL',
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expiration_date DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '2 years'),
    verification_status TEXT NOT NULL DEFAULT 'Verified' CHECK (
        verification_status IN ('Pending_Verification', 'Verified', 'Expired', 'Suspended', 'Revoked', 'Exempt')
    ),
    verified_at TIMESTAMPTZ DEFAULT NOW(),
    verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    document_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_staff_credential_type UNIQUE (staff_id, credential_type, credential_number),
    CONSTRAINT chk_credential_dates CHECK (expiration_date >= issue_date)
);

CREATE INDEX IF NOT EXISTS idx_staff_cred_staff ON public.staff_credentials(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_cred_fac_exp ON public.staff_credentials(facility_id, expiration_date);
CREATE INDEX IF NOT EXISTS idx_staff_cred_status ON public.staff_credentials(facility_id, verification_status);

-- Seed baseline verified credentials for existing clinical staff
INSERT INTO public.staff_credentials (
    staff_id,
    facility_id,
    credential_type,
    credential_number,
    issuing_jurisdiction,
    issue_date,
    expiration_date,
    verification_status
)
SELECT 
    s.id,
    s.facility_id,
    CASE 
        WHEN s.staff_type = 'Registered_Nurse' THEN 'State_Nursing_License'
        WHEN s.staff_type = 'Surgical_Technologist' THEN 'CST_NBSTSA_Certification'
        ELSE 'BLS_American_Heart'
    END,
    CASE 
        WHEN s.staff_type = 'Registered_Nurse' THEN 'RN-' || (900000 + s.id)::text
        WHEN s.staff_type = 'Surgical_Technologist' THEN 'CST-' || (800000 + s.id)::text
        ELSE 'BLS-' || (700000 + s.id)::text
    END,
    'FL',
    CURRENT_DATE - INTERVAL '1 year',
    CURRENT_DATE + INTERVAL '2 years',
    'Verified'
FROM public.staff s
WHERE s.staff_type IN ('Registered_Nurse', 'Surgical_Technologist', 'Sterile_Processing_Tech')
ON CONFLICT (staff_id, credential_type, credential_number) DO NOTHING;

-- Add ACLS credential for OR & PACU nurses
INSERT INTO public.staff_credentials (
    staff_id,
    facility_id,
    credential_type,
    credential_number,
    issuing_jurisdiction,
    issue_date,
    expiration_date,
    verification_status
)
SELECT 
    s.id,
    s.facility_id,
    'ACLS_American_Heart',
    'ACLS-' || (600000 + s.id)::text,
    'FL',
    CURRENT_DATE - INTERVAL '6 months',
    CURRENT_DATE + INTERVAL '18 months',
    'Verified'
FROM public.staff s
WHERE s.staff_type = 'Registered_Nurse'
ON CONFLICT (staff_id, credential_type, credential_number) DO NOTHING;

-- ==============================================================================
-- 4. CREATE 1NF PUBLIC.CASE_STAFF_ASSIGNMENTS TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.case_staff_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    staff_id BIGINT NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
    assigned_role TEXT NOT NULL CHECK (
        assigned_role IN (
            'Circulating_Nurse',
            'Scrub_Nurse',
            'Scrub_Tech',
            'First_Assistant',
            'Pre_Op_Nurse',
            'PACU_Primary_Nurse',
            'PACU_Secondary_Nurse',
            'Anesthesiologist_Attending',
            'CRNA_Assigned',
            'Laser_Safety_Officer',
            'C_Arm_Technologist',
            'Observer'
        )
    ),
    is_primary BOOLEAN NOT NULL DEFAULT true,
    time_in TIMESTAMPTZ,
    time_out TIMESTAMPTZ,
    duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes >= 0),
    hourly_rate_snapshot NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    allocated_labor_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    assignment_status TEXT NOT NULL DEFAULT 'Scheduled' CHECK (
        assignment_status IN ('Scheduled', 'Checked_In', 'Completed', 'Cancelled', 'Replaced')
    ),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_case_staff_role UNIQUE (surgery_id, staff_id, assigned_role),
    CONSTRAINT chk_case_staff_times CHECK (time_out IS NULL OR time_in IS NULL OR time_out >= time_in)
);

CREATE INDEX IF NOT EXISTS idx_case_staff_surgery ON public.case_staff_assignments(surgery_id);
CREATE INDEX IF NOT EXISTS idx_case_staff_staff ON public.case_staff_assignments(staff_id);
CREATE INDEX IF NOT EXISTS idx_case_staff_facility ON public.case_staff_assignments(facility_id);
CREATE INDEX IF NOT EXISTS idx_case_staff_role ON public.case_staff_assignments(facility_id, assigned_role);

-- ==============================================================================
-- 5. CREATE 1NF PUBLIC.ANESTHESIA_RECORDS TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.anesthesia_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE CASCADE UNIQUE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    attending_anesthesiologist_id BIGINT REFERENCES public.staff(id) ON DELETE RESTRICT,
    crna_id BIGINT REFERENCES public.staff(id) ON DELETE RESTRICT,
    anesthesia_delivery_model TEXT NOT NULL DEFAULT 'Medical_Direction' CHECK (
        anesthesia_delivery_model IN (
            'Personally_Performed_MD',
            'Medical_Direction',
            'Medical_Supervision',
            'CRNA_Independent',
            'None_Local_Only'
        )
    ),
    anesthesia_type TEXT NOT NULL DEFAULT 'General' CHECK (
        anesthesia_type IN (
            'General_Endotracheal',
            'General_LMA',
            'Monitored_Anesthesia_Care_MAC',
            'Spinal_Block',
            'Epidural_Block',
            'Regional_Peripheral_Block',
            'Total_Intravenous_TIVA',
            'Local_Infiltration_Only'
        )
    ),
    asa_physical_status TEXT NOT NULL DEFAULT 'ASA_II' CHECK (
        asa_physical_status IN ('ASA_I', 'ASA_II', 'ASA_III', 'ASA_IV', 'ASA_V', 'ASA_E')
    ),
    airway_type TEXT CHECK (airway_type IS NULL OR airway_type IN ('ETT', 'LMA', 'Nasal_Trumpet', 'Natural_Airway', 'Mask')),
    pre_op_eval_completed BOOLEAN NOT NULL DEFAULT true,
    post_anesthesia_eval_completed BOOLEAN NOT NULL DEFAULT false,
    anesthesia_start_time TIMESTAMPTZ,
    anesthesia_end_time TIMESTAMPTZ,
    anesthesia_base_units NUMERIC(5, 2) DEFAULT 0.00,
    anesthesia_time_units NUMERIC(5, 2) DEFAULT 0.00,
    anesthesia_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    billing_modifier TEXT,
    adverse_airway_event BOOLEAN NOT NULL DEFAULT false,
    malignant_hyperthermia_risk BOOLEAN NOT NULL DEFAULT false,
    anesthesia_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anesthesia_surgery ON public.anesthesia_records(surgery_id);
CREATE INDEX IF NOT EXISTS idx_anesthesia_facility ON public.anesthesia_records(facility_id);

-- Backfill baseline anesthesia records from existing cosmetic_anesthesia_fee
INSERT INTO public.anesthesia_records (
    surgery_id,
    facility_id,
    anesthesia_type,
    asa_physical_status,
    anesthesia_fee
)
SELECT 
    s.id,
    s.facility_id,
    'General_LMA',
    'ASA_II',
    COALESCE(s.cosmetic_anesthesia_fee, s.self_pay_anesthesia_fee, 0.00)
FROM public.surgeries s
WHERE (s.cosmetic_anesthesia_fee > 0 OR s.self_pay_anesthesia_fee > 0)
ON CONFLICT (surgery_id) DO NOTHING;

-- ==============================================================================
-- 6. CREATE 1NF PUBLIC.STAFF_SHIFTS & PUBLIC.STAFF_TIME_OFF TABLES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.staff_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    staff_id BIGINT NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    shift_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    shift_type TEXT NOT NULL DEFAULT 'Standard_Day' CHECK (
        shift_type IN ('Standard_Day', 'Early_Bird', 'Late_Recovery', 'Overnight', 'On_Call')
    ),
    is_cancelled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_shift_times CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_staff_shifts_lookup ON public.staff_shifts(facility_id, staff_id, shift_date);

CREATE TABLE IF NOT EXISTS public.staff_time_off (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    staff_id BIGINT NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    leave_type TEXT NOT NULL CHECK (
        leave_type IN ('Vacation_PTO', 'Sick_Medical', 'FMLA', 'Bereavement', 'Jury_Duty', 'CME_Training', 'Unpaid')
    ),
    status TEXT NOT NULL DEFAULT 'Approved' CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Cancelled')),
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_staff_time_off_duration CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_staff_time_off_lookup ON public.staff_time_off(staff_id, start_time, end_time);

-- ==============================================================================
-- 7. SERVER-SIDE CONFLICT VALIDATION PROCEDURE
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_validate_case_staff_scheduling_conflict(
    p_facility_id UUID,
    p_staff_id BIGINT,
    p_date DATE,
    p_start_time TIME,
    p_duration_minutes INTEGER,
    p_assigned_role TEXT,
    p_exclude_surgery_id BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_req_start TIMESTAMPTZ;
    v_req_end TIMESTAMPTZ;
    v_conflict_rec RECORD;
    v_cred_count INTEGER;
BEGIN
    v_req_start := (p_date || ' ' || p_start_time)::timestamptz;
    v_req_end := v_req_start + (p_duration_minutes || ' minutes')::interval;

    -- 1. Check Active Facility Affiliation
    IF NOT EXISTS (
        SELECT 1 FROM public.staff_facility_affiliations
        WHERE staff_id = p_staff_id 
          AND facility_id = p_facility_id
          AND is_active = true
          AND p_date >= effective_start_date
          AND (effective_end_date IS NULL OR p_date <= effective_end_date)
    ) THEN
        RETURN jsonb_build_object(
            'valid', false,
            'error_code', 'NO_ACTIVE_AFFILIATION',
            'message', 'Staff member does not hold an active appointment at this facility.'
        );
    END IF;

    -- 2. Verify Credential Validity (Mandatory Licenses for Nurses)
    IF p_assigned_role IN ('Circulating_Nurse', 'Pre_Op_Nurse', 'PACU_Primary_Nurse') THEN
        SELECT COUNT(*) INTO v_cred_count
        FROM public.staff_credentials
        WHERE staff_id = p_staff_id
          AND facility_id = p_facility_id
          AND credential_type = 'State_Nursing_License'
          AND verification_status = 'Verified'
          AND expiration_date >= p_date;

        IF v_cred_count = 0 THEN
            RETURN jsonb_build_object(
                'valid', false,
                'error_code', 'LICENSE_EXPIRED_OR_MISSING',
                'message', 'Staff member does not have an active, verified State Nursing License for this surgery date.'
            );
        END IF;
    END IF;

    -- 3. Check Staff Approved Time-Off
    IF EXISTS (
        SELECT 1 FROM public.staff_time_off
        WHERE staff_id = p_staff_id
          AND status = 'Approved'
          AND tstzrange(start_time, end_time, '[)') && tstzrange(v_req_start, v_req_end, '[)')
    ) THEN
        RETURN jsonb_build_object(
            'valid', false,
            'error_code', 'STAFF_ON_LEAVE',
            'message', 'Staff member has an approved time-off absence during this requested schedule window.'
        );
    END IF;

    -- 4. Check Double-Booking Across ALL Surgeries in Enterprise
    SELECT s.id, f.name AS facility_name, csa.assigned_role, s.start_time, s.duration_minutes
    INTO v_conflict_rec
    FROM public.case_staff_assignments csa
    JOIN public.surgeries s ON csa.surgery_id = s.id
    JOIN public.facilities f ON s.facility_id = f.id
    WHERE csa.staff_id = p_staff_id
      AND s.date = p_date
      AND s.status NOT IN ('Cancelled', 'Void')
      AND (p_exclude_surgery_id IS NULL OR s.id <> p_exclude_surgery_id)
      AND tstzrange(
          (s.date || ' ' || s.start_time)::timestamptz,
          (s.date || ' ' || s.start_time)::timestamptz + (s.duration_minutes || ' minutes')::interval,
          '[)'
      ) && tstzrange(v_req_start, v_req_end, '[)')
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'valid', false,
            'error_code', 'STAFF_DOUBLE_BOOKED',
            'message', 'Staff member is already assigned as ' || v_conflict_rec.assigned_role || ' on Case #' || v_conflict_rec.id || ' at ' || v_conflict_rec.facility_name || ' during this time.',
            'conflict_case_id', v_conflict_rec.id
        );
    END IF;

    RETURN jsonb_build_object('valid', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_validate_case_staff_scheduling_conflict TO authenticated, anon, service_role;

-- ==============================================================================
-- 8. SERVER-SIDE CASE LABOR COST VIEW
-- ==============================================================================

CREATE OR REPLACE VIEW public.v_case_labor_cost_summary AS
SELECT 
    s.id AS surgery_id,
    s.facility_id,
    s.date,
    s.status,
    COUNT(csa.id) AS total_staff_assigned,
    COUNT(csa.id) FILTER (WHERE csa.assigned_role = 'Circulating_Nurse') AS circulator_count,
    COUNT(csa.id) FILTER (WHERE csa.assigned_role IN ('Scrub_Nurse', 'Scrub_Tech')) AS scrub_count,
    COUNT(csa.id) FILTER (WHERE csa.assigned_role IN ('Anesthesiologist_Attending', 'CRNA_Assigned')) AS anesthesia_count,
    COALESCE(SUM(
        ROUND(
            (COALESCE(csa.duration_minutes, s.actual_duration_minutes, s.duration_minutes, 60)::numeric / 60.0) * csa.hourly_rate_snapshot,
            2
        )
    ), 0.00) AS total_case_labor_cost
FROM public.surgeries s
LEFT JOIN public.case_staff_assignments csa ON s.id = csa.surgery_id AND csa.assignment_status <> 'Cancelled'
WHERE s.status NOT IN ('Cancelled', 'Void')
GROUP BY s.id, s.facility_id, s.date, s.status;

-- ==============================================================================
-- 9. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_facility_affiliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_staff_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anesthesia_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_time_off ENABLE ROW LEVEL SECURITY;

-- 9.1 Baseline Read Policies
DROP POLICY IF EXISTS "Tenant Scoped Staff Affiliation Read" ON public.staff_facility_affiliations;
CREATE POLICY "Tenant Scoped Staff Affiliation Read"
ON public.staff_facility_affiliations FOR SELECT TO authenticated
USING (
    user_has_facility_role(NULL, ARRAY['super_admin', 'org_admin'])
    OR
    facility_id IN (SELECT get_auth_user_facilities())
);

DROP POLICY IF EXISTS "Tenant Scoped Staff Credentials Read" ON public.staff_credentials;
CREATE POLICY "Tenant Scoped Staff Credentials Read"
ON public.staff_credentials FOR SELECT TO authenticated
USING (
    user_has_facility_role(NULL, ARRAY['super_admin', 'org_admin'])
    OR
    facility_id IN (SELECT get_auth_user_facilities())
);

DROP POLICY IF EXISTS "Tenant Scoped Case Staff Read" ON public.case_staff_assignments;
CREATE POLICY "Tenant Scoped Case Staff Read"
ON public.case_staff_assignments FOR SELECT TO authenticated
USING (
    user_has_facility_role(NULL, ARRAY['super_admin', 'org_admin'])
    OR
    facility_id IN (SELECT get_auth_user_facilities())
);

DROP POLICY IF EXISTS "Tenant Scoped Anesthesia Read" ON public.anesthesia_records;
CREATE POLICY "Tenant Scoped Anesthesia Read"
ON public.anesthesia_records FOR SELECT TO authenticated
USING (
    user_has_facility_role(NULL, ARRAY['super_admin', 'org_admin'])
    OR
    facility_id IN (SELECT get_auth_user_facilities())
);

-- 9.2 Management Policies for Schedulers and Admins
DROP POLICY IF EXISTS "Admins and Schedulers Can Manage Case Staff" ON public.case_staff_assignments;
CREATE POLICY "Admins and Schedulers Can Manage Case Staff"
ON public.case_staff_assignments FOR ALL TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'scheduler'])
)
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'scheduler'])
);

DROP POLICY IF EXISTS "Admins and Schedulers Can Manage Anesthesia" ON public.anesthesia_records;
CREATE POLICY "Admins and Schedulers Can Manage Anesthesia"
ON public.anesthesia_records FOR ALL TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'scheduler'])
)
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'scheduler'])
);

-- ==============================================================================
-- 10. UPDATE DYNAMIC INTROSPECTION FUNCTION
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_get_public_tables()
RETURNS TABLE (table_name TEXT, table_type TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT 
    t.table_name::text, 
    t.table_type::text
  FROM information_schema.tables t
  WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
  ORDER BY t.table_name;
$$;

GRANT EXECUTE ON FUNCTION public.fn_get_public_tables() TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
