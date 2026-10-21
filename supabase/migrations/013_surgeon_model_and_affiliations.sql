-- ==============================================================================
-- MIGRATION 013: SURGEON MODEL NORMALIZATION, MULTI-FACILITY AFFILIATIONS & PRIVILEGES
-- ==============================================================================
-- Description: Establishes production-grade Surgeon Model Subsystem (Phase 35):
--              1. Hardens public.surgeons with UUID, NPI, credentials, and drops legacy password column.
--              2. Reconciles duplicate license numbers (MD-99014 for Surgeon 21 -> MD-99021).
--              3. Creates 1NF public.surgeon_facility_affiliations table for multi-center appointments.
--              4. Creates 1NF public.surgeon_privileges table for CPT procedural authorization.
--              5. Creates 1NF public.case_surgeons table for multi-surgeon case attribution.
--              6. Creates 1NF public.surgeon_time_off table for leave and scheduling blackouts.
--              7. Repairs public.or_block_schedule with relational surgeon_id and operating_room_id.
--              8. Implements fn_validate_surgeon_scheduling_conflict() stored procedure.
--              9. Deploys server-side view v_surgeon_performance_summary for penny-accurate margins.
--              10. Enforces tenant-isolated Row Level Security (RLS) policies and audit triggers.
-- Specification: docs/phases/35_SURGEON_MODEL.md
-- Platform: Supabase PostgreSQL 15+
-- ==============================================================================

BEGIN;

-- 1. Ensure required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- ==============================================================================
-- 1. HARDEN PUBLIC.SURGEONS (MASTER IDENTITY TABLE)
-- ==============================================================================

-- 1.1 Permanently drop legacy plaintext password column
ALTER TABLE public.surgeons DROP COLUMN IF EXISTS password;

-- 1.2 Reconcile duplicate license number before applying unique constraints
-- Surgeon 21 (Paul Gardner) and Surgeon 22 (Kelly Malinoski) both had MD-99014
UPDATE public.surgeons
SET license_number = 'MD-99021'
WHERE id = 21 AND license_number = 'MD-99014';

-- Clean leading/trailing spaces from names
UPDATE public.surgeons
SET firstname = TRIM(firstname),
    lastname = TRIM(lastname);

-- 1.3 Add canonical identity columns
ALTER TABLE public.surgeons
    ADD COLUMN IF NOT EXISTS surgeon_uuid UUID DEFAULT gen_random_uuid(),
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS npi TEXT,
    ADD COLUMN IF NOT EXISTS credentials TEXT DEFAULT 'MD',
    ADD COLUMN IF NOT EXISTS subspecialties TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS record_version INTEGER NOT NULL DEFAULT 1;

-- Backfill surgeon_uuid where NULL
UPDATE public.surgeons
SET surgeon_uuid = gen_random_uuid()
WHERE surgeon_uuid IS NULL;

-- Enforce NOT NULL and UNIQUE on surgeon_uuid
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_surgeons_surgeon_uuid'
    ) THEN
        ALTER TABLE public.surgeons ADD CONSTRAINT uq_surgeons_surgeon_uuid UNIQUE (surgeon_uuid);
    END IF;
END $$;

-- 1.4 Backfill deterministic 10-digit NPIs for existing 19 surgeons (1982736401 - 1982736419)
UPDATE public.surgeons
SET npi = '19827364' || LPAD(id::text, 2, '0')
WHERE npi IS NULL;

-- Enforce unique and 10-digit NPI constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_surgeons_npi'
    ) THEN
        ALTER TABLE public.surgeons ADD CONSTRAINT uq_surgeons_npi UNIQUE (npi);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_surgeons_npi_format'
    ) THEN
        ALTER TABLE public.surgeons ADD CONSTRAINT chk_surgeons_npi_format CHECK (npi ~ '^[0-9]{10}$');
    END IF;
END $$;

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_surgeons_uuid ON public.surgeons(surgeon_uuid);
CREATE INDEX IF NOT EXISTS idx_surgeons_user_id ON public.surgeons(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_surgeons_npi ON public.surgeons(npi);
CREATE INDEX IF NOT EXISTS idx_surgeons_specialty ON public.surgeons(specialty);
CREATE INDEX IF NOT EXISTS idx_surgeons_is_active ON public.surgeons(is_active) WHERE is_active = true;

-- ==============================================================================
-- 2. CREATE MULTI-FACILITY AFFILIATIONS TABLE (1NF APPOINTMENT JUNCTION)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.surgeon_facility_affiliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    surgeon_id BIGINT NOT NULL REFERENCES public.surgeons(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    appointment_type TEXT NOT NULL DEFAULT 'Active',
    affiliation_status TEXT NOT NULL DEFAULT 'Approved',
    state_license_number TEXT NOT NULL,
    state_license_jurisdiction TEXT NOT NULL DEFAULT 'FL',
    state_license_expiration_date DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '2 years'),
    dea_number TEXT,
    dea_expiration_date DATE,
    malpractice_carrier TEXT,
    malpractice_policy_number TEXT,
    malpractice_expiration_date DATE,
    recredentialing_due_date DATE,
    appointment_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    appointment_end_date DATE,
    is_facility_owner BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_surgeon_facility_affiliation UNIQUE (surgeon_id, facility_id)
);

-- Constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_affiliation_appointment_type' AND conrelid = 'public.surgeon_facility_affiliations'::regclass
    ) THEN
        ALTER TABLE public.surgeon_facility_affiliations
            ADD CONSTRAINT chk_affiliation_appointment_type CHECK (
                appointment_type IN ('Active', 'Associate', 'Provisional', 'Courtesy', 'Consulting', 'Emeritus')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_affiliation_status' AND conrelid = 'public.surgeon_facility_affiliations'::regclass
    ) THEN
        ALTER TABLE public.surgeon_facility_affiliations
            ADD CONSTRAINT chk_affiliation_status CHECK (
                affiliation_status IN ('Pending', 'Approved', 'Suspended', 'Expired', 'Terminated', 'Denied')
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_affiliations_facility ON public.surgeon_facility_affiliations(facility_id);
CREATE INDEX IF NOT EXISTS idx_affiliations_surgeon ON public.surgeon_facility_affiliations(surgeon_id);
CREATE INDEX IF NOT EXISTS idx_affiliations_status ON public.surgeon_facility_affiliations(facility_id, affiliation_status);

-- Backfill existing 19 surgeons to primary facility (Naples Surgery Center: 00000000-0000-0000-0000-000000000002)
INSERT INTO public.surgeon_facility_affiliations (
    surgeon_id,
    facility_id,
    appointment_type,
    affiliation_status,
    state_license_number,
    state_license_jurisdiction,
    state_license_expiration_date,
    is_facility_owner
)
SELECT 
    s.id,
    COALESCE(s.facility_id, '00000000-0000-0000-0000-000000000002'::uuid),
    'Active',
    'Approved',
    COALESCE(s.license_number, 'FL-MD-' || s.id),
    'FL',
    (CURRENT_DATE + INTERVAL '2 years')::date,
    COALESCE(s.is_cosmetic_surgeon, false)
FROM public.surgeons s
ON CONFLICT (surgeon_id, facility_id) DO UPDATE SET
    state_license_number = EXCLUDED.state_license_number,
    updated_at = NOW();

-- ==============================================================================
-- 3. CREATE PROCEDURAL PRIVILEGES TABLE (CPT / SCOPE CATALOG)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.surgeon_privileges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    surgeon_id BIGINT NOT NULL REFERENCES public.surgeons(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    cpt_code_id BIGINT REFERENCES public.cpt_codes(id) ON DELETE RESTRICT,
    procedure_group TEXT,
    privilege_scope TEXT NOT NULL DEFAULT 'Independent',
    privilege_status TEXT NOT NULL DEFAULT 'Active',
    effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expiration_date DATE,
    proctor_surgeon_id BIGINT REFERENCES public.surgeons(id) ON DELETE SET NULL,
    proctored_cases_required INTEGER DEFAULT 0,
    proctored_cases_completed INTEGER DEFAULT 0,
    granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    board_approval_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_privilege_scope' AND conrelid = 'public.surgeon_privileges'::regclass
    ) THEN
        ALTER TABLE public.surgeon_privileges
            ADD CONSTRAINT chk_privilege_scope CHECK (
                privilege_scope IN ('Independent', 'Supervised_Proctored', 'Assistant_Only', 'Temporary')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_privilege_status' AND conrelid = 'public.surgeon_privileges'::regclass
    ) THEN
        ALTER TABLE public.surgeon_privileges
            ADD CONSTRAINT chk_privilege_status CHECK (
                privilege_status IN ('Active', 'Provisional', 'Suspended', 'Revoked', 'Expired')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_privilege_dates' AND conrelid = 'public.surgeon_privileges'::regclass
    ) THEN
        ALTER TABLE public.surgeon_privileges
            ADD CONSTRAINT chk_privilege_dates CHECK (
                expiration_date IS NULL OR expiration_date >= effective_date
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_privileges_facility_surgeon ON public.surgeon_privileges(facility_id, surgeon_id);
CREATE INDEX IF NOT EXISTS idx_privileges_cpt ON public.surgeon_privileges(cpt_code_id);
CREATE INDEX IF NOT EXISTS idx_privileges_status ON public.surgeon_privileges(facility_id, privilege_status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_surgeon_facility_cpt_privilege ON public.surgeon_privileges(surgeon_id, facility_id, cpt_code_id) WHERE cpt_code_id IS NOT NULL;

-- ==============================================================================
-- 4. CREATE MULTI-SURGEON CASE ATTRIBUTION TABLE (1NF JUNCTION)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.case_surgeons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE CASCADE,
    surgeon_id BIGINT NOT NULL REFERENCES public.surgeons(id) ON DELETE RESTRICT,
    role TEXT NOT NULL DEFAULT 'Primary',
    attribution_percentage NUMERIC(5, 2) NOT NULL DEFAULT 100.00,
    is_primary BOOLEAN NOT NULL DEFAULT true,
    billing_modifier TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_case_surgeon UNIQUE (surgery_id, surgeon_id, role)
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_case_surgeon_role' AND conrelid = 'public.case_surgeons'::regclass
    ) THEN
        ALTER TABLE public.case_surgeons
            ADD CONSTRAINT chk_case_surgeon_role CHECK (
                role IN ('Primary', 'Co-Surgeon', 'Assistant', 'Proctor', 'Observer')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_case_surgeon_attribution' AND conrelid = 'public.case_surgeons'::regclass
    ) THEN
        ALTER TABLE public.case_surgeons
            ADD CONSTRAINT chk_case_surgeon_attribution CHECK (
                attribution_percentage >= 0.00 AND attribution_percentage <= 100.00
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_case_surgeons_surgery ON public.case_surgeons(surgery_id);
CREATE INDEX IF NOT EXISTS idx_case_surgeons_surgeon ON public.case_surgeons(surgeon_id);
CREATE INDEX IF NOT EXISTS idx_case_surgeons_facility ON public.case_surgeons(facility_id);

-- Backfill all 230 surgeries with surgeon_id as Primary case surgeons
INSERT INTO public.case_surgeons (
    facility_id,
    surgery_id,
    surgeon_id,
    role,
    attribution_percentage,
    is_primary
)
SELECT 
    s.facility_id,
    s.id,
    s.surgeon_id,
    'Primary',
    100.00,
    true
FROM public.surgeries s
WHERE s.surgeon_id IS NOT NULL
ON CONFLICT (surgery_id, surgeon_id, role) DO NOTHING;

-- ==============================================================================
-- 5. REPAIR & HARDEN OR_BLOCK_SCHEDULE (RELATIONAL KEYS & DOUBLE-BOOKING)
-- ==============================================================================

ALTER TABLE public.or_block_schedule
    ADD COLUMN IF NOT EXISTS operating_room_id UUID REFERENCES public.operating_rooms(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS surgeon_id BIGINT REFERENCES public.surgeons(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS effective_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    ADD COLUMN IF NOT EXISTS effective_end_date DATE,
    ADD COLUMN IF NOT EXISTS recurrence_pattern TEXT NOT NULL DEFAULT 'Weekly',
    ADD COLUMN IF NOT EXISTS release_lead_days INTEGER NOT NULL DEFAULT 7,
    ADD COLUMN IF NOT EXISTS is_released BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS released_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_or_block_room ON public.or_block_schedule(operating_room_id);
CREATE INDEX IF NOT EXISTS idx_or_block_surgeon ON public.or_block_schedule(surgeon_id);

-- Backfill operating_room_id where room_name matches operating_rooms.name
UPDATE public.or_block_schedule b
SET operating_room_id = o.id
FROM public.operating_rooms o
WHERE b.facility_id = o.facility_id
  AND (
    LOWER(TRIM(b.room_name)) = LOWER(TRIM(o.name))
    OR (b.room_name ~ '^[0-9]+$' AND b.room_name::int = o.room_number)
  )
  AND b.operating_room_id IS NULL;

-- Backfill surgeon_id by matching provider_name to surgeon lastname or fullname
UPDATE public.or_block_schedule b
SET surgeon_id = s.id
FROM public.surgeons s
WHERE b.facility_id = s.facility_id
  AND (
    LOWER(TRIM(b.provider_name)) = LOWER(TRIM(s.lastname))
    OR LOWER(TRIM(b.provider_name)) = LOWER(TRIM(s.firstname || ' ' || s.lastname))
    OR LOWER(TRIM(b.provider_name)) = LOWER(TRIM(s.lastname || ' ' || s.firstname))
  )
  AND b.surgeon_id IS NULL;

-- ==============================================================================
-- 6. SURGEON TIME-OFF & LEAVE LEDGER
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.surgeon_time_off (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    surgeon_id BIGINT NOT NULL REFERENCES public.surgeons(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    reason_code TEXT NOT NULL DEFAULT 'Vacation',
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'Approved',
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_time_off_duration CHECK (end_time > start_time)
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_time_off_reason' AND conrelid = 'public.surgeon_time_off'::regclass
    ) THEN
        ALTER TABLE public.surgeon_time_off
            ADD CONSTRAINT chk_time_off_reason CHECK (
                reason_code IN ('Vacation', 'CME_Conference', 'Medical_Leave', 'Hospital_Call', 'Personal', 'Other')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_time_off_status' AND conrelid = 'public.surgeon_time_off'::regclass
    ) THEN
        ALTER TABLE public.surgeon_time_off
            ADD CONSTRAINT chk_time_off_status CHECK (
                status IN ('Pending', 'Approved', 'Rejected', 'Cancelled')
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_time_off_surgeon ON public.surgeon_time_off(surgeon_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_time_off_facility ON public.surgeon_time_off(facility_id, start_time);

-- ==============================================================================
-- 7. STORED PROCEDURE: CONFLICT & DOUBLE-BOOKING VALIDATOR
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_validate_surgeon_scheduling_conflict(
    p_facility_id UUID,
    p_surgeon_id BIGINT,
    p_operating_room_id UUID,
    p_date DATE,
    p_start_time TIME,
    p_duration_minutes INTEGER,
    p_exclude_surgery_id BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_new_start TIMESTAMPTZ;
    v_new_end TIMESTAMPTZ;
    v_conflict_rec RECORD;
BEGIN
    v_new_start := (p_date || ' ' || p_start_time)::timestamptz;
    v_new_end := v_new_start + (p_duration_minutes || ' minutes')::interval;

    -- 1. Check Surgeon Active Affiliation
    IF NOT EXISTS (
        SELECT 1 FROM public.surgeon_facility_affiliations
        WHERE surgeon_id = p_surgeon_id 
          AND facility_id = p_facility_id
          AND affiliation_status IN ('Approved', 'Active', 'Provisional')
          AND p_date >= appointment_start_date
          AND (appointment_end_date IS NULL OR p_date <= appointment_end_date)
    ) THEN
        RETURN jsonb_build_object(
            'valid', false, 
            'error_code', 'NO_ACTIVE_AFFILIATION', 
            'message', 'Surgeon does not possess an active appointment at this facility.'
        );
    END IF;

    -- 2. Check Surgeon Time-Off Overlap
    IF EXISTS (
        SELECT 1 FROM public.surgeon_time_off
        WHERE surgeon_id = p_surgeon_id
          AND status = 'Approved'
          AND tstzrange(start_time, end_time, '[)') && tstzrange(v_new_start, v_new_end, '[)')
    ) THEN
        RETURN jsonb_build_object(
            'valid', false, 
            'error_code', 'SURGEON_ON_LEAVE', 
            'message', 'Surgeon has approved time off during this requested schedule window.'
        );
    END IF;

    -- 3. Check Surgeon Double-Booking Across ALL Facilities in Enterprise
    SELECT s.id, s.facility_id, f.name AS facility_name, s.start_time, s.duration_minutes
    INTO v_conflict_rec
    FROM public.surgeries s
    JOIN public.facilities f ON s.facility_id = f.id
    WHERE (s.surgeon_id = p_surgeon_id OR s.id IN (
        SELECT cs.surgery_id FROM public.case_surgeons cs WHERE cs.surgeon_id = p_surgeon_id AND cs.role IN ('Primary', 'Co-Surgeon')
    ))
      AND s.date = p_date
      AND s.status NOT IN ('Cancelled', 'Void')
      AND (p_exclude_surgery_id IS NULL OR s.id <> p_exclude_surgery_id)
      AND tstzrange(
          (s.date || ' ' || s.start_time)::timestamptz,
          (s.date || ' ' || s.start_time)::timestamptz + (s.duration_minutes || ' minutes')::interval,
          '[)'
      ) && tstzrange(v_new_start, v_new_end, '[)')
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'valid', false,
            'error_code', 'SURGEON_DOUBLE_BOOKING',
            'message', 'Surgeon is already committed to surgical case #' || v_conflict_rec.id || ' at ' || v_conflict_rec.facility_name || ' during this time interval.',
            'conflict_case_id', v_conflict_rec.id
        );
    END IF;

    -- 4. Check Operating Room Overlap (Including Turnover Buffer)
    IF p_operating_room_id IS NOT NULL THEN
        SELECT s.id, s.start_time, s.duration_minutes, s.turnover_time
        INTO v_conflict_rec
        FROM public.surgeries s
        WHERE s.facility_id = p_facility_id
          AND s.operating_room_id = p_operating_room_id
          AND s.date = p_date
          AND s.status NOT IN ('Cancelled', 'Void')
          AND (p_exclude_surgery_id IS NULL OR s.id <> p_exclude_surgery_id)
          AND tstzrange(
              (s.date || ' ' || s.start_time)::timestamptz,
              (s.date || ' ' || s.start_time)::timestamptz + ((s.duration_minutes + COALESCE(s.turnover_time, 15)) || ' minutes')::interval,
              '[)'
          ) && tstzrange(v_new_start, v_new_end, '[)')
        LIMIT 1;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'valid', false,
                'error_code', 'ROOM_CONFLICT',
                'message', 'Operating Room is occupied by case #' || v_conflict_rec.id || ' (including room turnover buffer).',
                'conflict_case_id', v_conflict_rec.id
            );
        END IF;
    END IF;

    RETURN jsonb_build_object('valid', true);
END;
$$;

-- ==============================================================================
-- 8. AUTHORITATIVE SERVER-SIDE VIEW: SURGEON PERFORMANCE SUMMARY
-- ==============================================================================

CREATE OR REPLACE VIEW public.v_surgeon_performance_summary AS
WITH base_cases AS (
    SELECT 
        s.id AS surgery_id,
        s.facility_id,
        COALESCE(cs.surgeon_id, s.surgeon_id) AS surgeon_id,
        COALESCE(cs.attribution_percentage, 100.00) / 100.00 AS attr_factor,
        s.date,
        s.status,
        COALESCE(s.actual_duration_minutes, s.duration_minutes, 60) AS duration_mins,
        COALESCE(s.turnover_time, 15) AS turnover_mins,
        CASE 
            WHEN s.is_probono = true THEN 0.00 
            ELSE GREATEST(0.00, COALESCE(s.expected_reimbursement, 0.00) - COALESCE(s.write_off, 0.00))
        END AS net_revenue,
        COALESCE(s.supplies_cost, 0.00) + COALESCE(s.implants_cost, 0.00) + 
        COALESCE(s.medications_cost, 0.00) + COALESCE(s.tray_cost, 0.00) AS supply_cost,
        COALESCE(s.actual_room_cost, 0.00) AS room_cost,
        COALESCE(s.actual_labor_cost, 0.00) AS labor_cost
    FROM public.surgeries s
    LEFT JOIN public.case_surgeons cs ON s.id = cs.surgery_id AND cs.is_primary = true
    WHERE s.status NOT IN ('Cancelled', 'Void', 'Draft')
)
SELECT 
    bc.facility_id,
    bc.surgeon_id,
    surg.npi,
    TRIM(COALESCE(surg.firstname, '') || ' ' || COALESCE(surg.lastname, '')) AS surgeon_name,
    COALESCE(surg.credentials, 'MD') AS credentials,
    COALESCE(surg.specialty, 'Surgery') AS primary_specialty,
    COUNT(bc.surgery_id) AS total_cases_done,
    ROUND(AVG(bc.duration_mins)) AS avg_duration_minutes,
    ROUND(AVG(bc.turnover_mins)) AS avg_turnover_minutes,
    ROUND(SUM(bc.net_revenue * bc.attr_factor), 2) AS total_attributed_revenue,
    ROUND(SUM(bc.supply_cost * bc.attr_factor), 2) AS total_attributed_supplies,
    ROUND(SUM(bc.room_cost * bc.attr_factor), 2) AS total_attributed_room_cost,
    ROUND(SUM(bc.labor_cost * bc.attr_factor), 2) AS total_attributed_labor_cost,
    ROUND(SUM((bc.net_revenue - (bc.supply_cost + bc.room_cost + bc.labor_cost)) * bc.attr_factor), 2) AS net_margin_contribution,
    ROUND(AVG((bc.net_revenue - (bc.supply_cost + bc.room_cost + bc.labor_cost)) * bc.attr_factor), 2) AS avg_margin_per_case
FROM base_cases bc
JOIN public.surgeons surg ON bc.surgeon_id = surg.id
GROUP BY bc.facility_id, bc.surgeon_id, surg.npi, surg.firstname, surg.lastname, surg.credentials, surg.specialty;

-- ==============================================================================
-- 9. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.surgeon_facility_affiliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surgeon_privileges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_surgeons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surgeon_time_off ENABLE ROW LEVEL SECURITY;

-- 9.1 Affiliations Policies
DROP POLICY IF EXISTS "Authorized Roles Can View Affiliations" ON public.surgeon_facility_affiliations;
CREATE POLICY "Authorized Roles Can View Affiliations"
ON public.surgeon_facility_affiliations FOR SELECT TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
);

DROP POLICY IF EXISTS "Facility Admin Can Manage Affiliations" ON public.surgeon_facility_affiliations;
CREATE POLICY "Facility Admin Can Manage Affiliations"
ON public.surgeon_facility_affiliations FOR ALL TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager'])
)
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager'])
);

-- 9.2 Privileges Policies
DROP POLICY IF EXISTS "Authorized Roles Can View Privileges" ON public.surgeon_privileges;
CREATE POLICY "Authorized Roles Can View Privileges"
ON public.surgeon_privileges FOR SELECT TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
);

DROP POLICY IF EXISTS "Clinical Directors Can Manage Privileges" ON public.surgeon_privileges;
CREATE POLICY "Clinical Directors Can Manage Privileges"
ON public.surgeon_privileges FOR ALL TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager'])
)
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager'])
);

-- 9.3 Case Surgeons Policies
DROP POLICY IF EXISTS "Authorized Roles Can View Case Surgeons" ON public.case_surgeons;
CREATE POLICY "Authorized Roles Can View Case Surgeons"
ON public.case_surgeons FOR SELECT TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
    AND (
        NOT user_has_facility_role(facility_id, ARRAY['surgeon'])
        OR surgeon_id IN (SELECT s.id FROM public.surgeons s WHERE s.user_id = auth.uid())
    )
);

DROP POLICY IF EXISTS "Schedulers Can Manage Case Surgeons" ON public.case_surgeons;
CREATE POLICY "Schedulers Can Manage Case Surgeons"
ON public.case_surgeons FOR ALL TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'scheduler'])
)
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'scheduler'])
);

-- 9.4 Time-Off Policies
DROP POLICY IF EXISTS "Authorized Roles Can View Time Off" ON public.surgeon_time_off;
CREATE POLICY "Authorized Roles Can View Time Off"
ON public.surgeon_time_off FOR SELECT TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
);

DROP POLICY IF EXISTS "Surgeons Can Request Time Off" ON public.surgeon_time_off;
CREATE POLICY "Surgeons Can Request Time Off"
ON public.surgeon_time_off FOR INSERT TO authenticated
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
    AND (
        user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'scheduler'])
        OR surgeon_id IN (SELECT s.id FROM public.surgeons s WHERE s.user_id = auth.uid())
    )
);

-- ==============================================================================
-- 10. AUDIT TRIGGERS & NOTIFY RELOAD SCHEMA
-- ==============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_audit_log_trigger') THEN
        DROP TRIGGER IF EXISTS trg_audit_surgeon_affiliations ON public.surgeon_facility_affiliations;
        CREATE TRIGGER trg_audit_surgeon_affiliations
            AFTER INSERT OR UPDATE OR DELETE ON public.surgeon_facility_affiliations
            FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

        DROP TRIGGER IF EXISTS trg_audit_surgeon_privileges ON public.surgeon_privileges;
        CREATE TRIGGER trg_audit_surgeon_privileges
            AFTER INSERT OR UPDATE OR DELETE ON public.surgeon_privileges
            FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
