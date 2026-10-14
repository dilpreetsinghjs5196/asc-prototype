-- ==============================================================================
-- MIGRATION: 002_clinical_normalization.sql
-- DESCRIPTION: Phase 2 Database Normalization
--              - Operating Rooms table with hourly rates
--              - Payers & Payer Fee Schedules
--              - 1NF Surgery Procedures line items (deprecates comma-delimited cpt_codes)
--              - Relational foreign keys on surgeries and or_block_schedule
--              - Data backfill routine for legacy comma-delimited cpt_codes
--              - Tenant-scoped RLS policies on all new tables
-- AUTHOR: ASCANALYST Architecture Team
-- DATE: 2026-10-14
-- ==============================================================================

BEGIN;

-- 1. Ensure required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. OPERATING ROOMS TABLE & SEEDING
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.operating_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    room_number INTEGER NOT NULL,
    hourly_cost_rate NUMERIC(10, 2) NOT NULL DEFAULT 1500.00,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_facility_room_number UNIQUE (facility_id, room_number)
);

CREATE INDEX IF NOT EXISTS idx_operating_rooms_facility ON public.operating_rooms(facility_id);
CREATE INDEX IF NOT EXISTS idx_operating_rooms_active ON public.operating_rooms(facility_id, is_active);

-- Seed Default Operating Rooms for Primary Facility (Naples Surgery Center: ...002)
INSERT INTO public.operating_rooms (id, facility_id, name, room_number, hourly_cost_rate)
VALUES 
    ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'OR 1', 1, 1500.00),
    ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'OR 2', 2, 1500.00),
    ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 'OR 3', 3, 1500.00),
    ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', 'OR 4', 4, 1500.00)
ON CONFLICT (facility_id, room_number) DO UPDATE SET
    name = EXCLUDED.name,
    hourly_cost_rate = EXCLUDED.hourly_cost_rate,
    updated_at = NOW();

-- Seed Default Operating Rooms for Secondary Facility (South Florida Outpatient Pavilion: ...003)
INSERT INTO public.operating_rooms (id, facility_id, name, room_number, hourly_cost_rate)
VALUES 
    ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000003', 'Suite A', 1, 1650.00),
    ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000003', 'Suite B', 2, 1650.00)
ON CONFLICT (facility_id, room_number) DO UPDATE SET
    name = EXCLUDED.name,
    hourly_cost_rate = EXCLUDED.hourly_cost_rate,
    updated_at = NOW();

-- ==============================================================================
-- 3. LINK SURGERIES TO NORMALIZED OPERATING ROOMS
-- ==============================================================================

ALTER TABLE public.surgeries
ADD COLUMN IF NOT EXISTS operating_room_id UUID REFERENCES public.operating_rooms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_surgeries_room_id ON public.surgeries(operating_room_id);

-- Backfill surgeries.operating_room_id based on room name or number if present
UPDATE public.surgeries s
SET operating_room_id = o.id
FROM public.operating_rooms o
WHERE s.facility_id = o.facility_id
  AND (
    (s.operating_room_name IS NOT NULL AND LOWER(TRIM(s.operating_room_name)) = LOWER(TRIM(o.name)))
    OR (s.operating_room_name IS NOT NULL AND s.operating_room_name ~ '^[0-9]+$' AND s.operating_room_name::int = o.room_number)
  )
  AND s.operating_room_id IS NULL;

-- Default fallback: map any remaining surgeries without room to OR 1 for that facility
UPDATE public.surgeries s
SET operating_room_id = (
    SELECT o.id FROM public.operating_rooms o 
    WHERE o.facility_id = s.facility_id 
    ORDER BY o.room_number ASC LIMIT 1
)
WHERE s.operating_room_id IS NULL;

-- ==============================================================================
-- 4. PAYERS & PAYER FEE SCHEDULES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.payers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    payer_type TEXT NOT NULL CHECK (payer_type IN ('Medicare', 'Medicaid', 'Commercial', 'WorkerComp', 'Self-Pay')),
    payer_code TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_facility_payer_code UNIQUE (facility_id, payer_code)
);

CREATE INDEX IF NOT EXISTS idx_payers_facility ON public.payers(facility_id);

-- Seed baseline payers for Primary Facility
INSERT INTO public.payers (id, facility_id, name, payer_type, payer_code)
VALUES
    ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Medicare Florida (First Coast)', 'Medicare', 'CMS-FL'),
    ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'Florida Blue (BCBS)', 'Commercial', 'BCBS-FL'),
    ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 'Aetna Healthcare', 'Commercial', 'AETNA'),
    ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', 'UnitedHealthcare Outpatient', 'Commercial', 'UHC-OPT'),
    ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000002', 'Self-Pay / Non-Insured', 'Self-Pay', 'SELFPAY')
ON CONFLICT (facility_id, payer_code) DO UPDATE SET
    name = EXCLUDED.name,
    payer_type = EXCLUDED.payer_type,
    updated_at = NOW();

-- Contracted Payer Fee Schedules
CREATE TABLE IF NOT EXISTS public.payer_fee_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    payer_id UUID NOT NULL REFERENCES public.payers(id) ON DELETE CASCADE,
    cpt_code_id BIGINT NOT NULL REFERENCES public.cpt_codes(id) ON DELETE CASCADE,
    contracted_rate NUMERIC(12, 2) NOT NULL,
    effective_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_end_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_payer_cpt_effective UNIQUE (payer_id, cpt_code_id, effective_start_date)
);

CREATE INDEX IF NOT EXISTS idx_fee_schedules_payer_cpt ON public.payer_fee_schedules(payer_id, cpt_code_id);
CREATE INDEX IF NOT EXISTS idx_fee_schedules_facility ON public.payer_fee_schedules(facility_id);

-- ==============================================================================
-- 5. 1NF NORMALIZED SURGERY PROCEDURES TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.surgery_procedures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE CASCADE,
    cpt_code_id BIGINT NOT NULL REFERENCES public.cpt_codes(id) ON DELETE RESTRICT,
    sequence_rank INTEGER NOT NULL DEFAULT 1,
    modifier_code TEXT,
    baseline_charge NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    contracted_reimbursement NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    mppr_applied BOOLEAN NOT NULL DEFAULT false,
    mppr_discount_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    final_expected_reimbursement NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_surgery_cpt_rank UNIQUE (surgery_id, sequence_rank)
);

CREATE INDEX IF NOT EXISTS idx_surgery_proc_surgery ON public.surgery_procedures(surgery_id);
CREATE INDEX IF NOT EXISTS idx_surgery_proc_cpt ON public.surgery_procedures(cpt_code_id);
CREATE INDEX IF NOT EXISTS idx_surgery_proc_facility ON public.surgery_procedures(facility_id);
CREATE INDEX IF NOT EXISTS idx_surgery_proc_rank ON public.surgery_procedures(surgery_id, sequence_rank);

-- ==============================================================================
-- 6. DATA MIGRATION: BACKFILL LEGACY COMMA-DELIMITED CPT CODES
-- ==============================================================================

DO $$
DECLARE
    r_surg RECORD;
    v_cpt_text TEXT;
    v_cpt_code_rec RECORD;
    v_rank INTEGER;
    v_cpt_array TEXT[];
    v_clean_code TEXT;
BEGIN
    FOR r_surg IN 
        SELECT s.id, s.facility_id, s.cpt_codes, s.estimated_reimbursement, s.facility_fee
        FROM public.surgeries s
        WHERE s.cpt_codes IS NOT NULL 
          AND TRIM(s.cpt_codes) <> ''
          AND NOT EXISTS (
              SELECT 1 FROM public.surgery_procedures sp WHERE sp.surgery_id = s.id
          )
    LOOP
        -- Split comma-separated string into array of trimmed code strings
        v_cpt_array := string_to_array(regexp_replace(r_surg.cpt_codes, '\s+', '', 'g'), ',');
        v_rank := 1;

        FOREACH v_cpt_text IN ARRAY v_cpt_array LOOP
            v_clean_code := TRIM(v_cpt_text);
            IF v_clean_code <> '' THEN
                -- Find matching CPT code from cpt_codes directory
                SELECT id, gross_charge, reimbursement
                INTO v_cpt_code_rec
                FROM public.cpt_codes
                WHERE code = v_clean_code
                ORDER BY id ASC
                LIMIT 1;

                IF FOUND THEN
                    INSERT INTO public.surgery_procedures (
                        facility_id,
                        surgery_id,
                        cpt_code_id,
                        sequence_rank,
                        baseline_charge,
                        contracted_reimbursement,
                        mppr_applied,
                        mppr_discount_pct,
                        final_expected_reimbursement
                    ) VALUES (
                        r_surg.facility_id,
                        r_surg.id,
                        v_cpt_code_rec.id,
                        v_rank,
                        COALESCE(v_cpt_code_rec.gross_charge, 0.00),
                        COALESCE(v_cpt_code_rec.reimbursement, 0.00),
                        (v_rank > 1),
                        (CASE WHEN v_rank > 1 THEN 50.00 ELSE 0.00 END),
                        (CASE WHEN v_rank > 1 THEN ROUND(COALESCE(v_cpt_code_rec.reimbursement, 0.00) * 0.50, 2) ELSE COALESCE(v_cpt_code_rec.reimbursement, 0.00) END)
                    )
                    ON CONFLICT (surgery_id, sequence_rank) DO NOTHING;

                    v_rank := v_rank + 1;
                END IF;
            END IF;
        END LOOP;
    END LOOP;
END;
$$;

-- ==============================================================================
-- 7. NORMALIZE OR_BLOCK_SCHEDULE WITH FOREIGN KEYS
-- ==============================================================================

ALTER TABLE public.or_block_schedule
ADD COLUMN IF NOT EXISTS operating_room_id UUID REFERENCES public.operating_rooms(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS surgeon_id BIGINT REFERENCES public.surgeons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_or_block_room ON public.or_block_schedule(operating_room_id);
CREATE INDEX IF NOT EXISTS idx_or_block_surgeon ON public.or_block_schedule(surgeon_id);

-- Backfill room foreign key where room_name matches operating_rooms.name
UPDATE public.or_block_schedule b
SET operating_room_id = o.id
FROM public.operating_rooms o
WHERE b.facility_id = o.facility_id
  AND (
    LOWER(TRIM(b.room_name)) = LOWER(TRIM(o.name))
    OR (b.room_name ~ '^[0-9]+$' AND b.room_name::int = o.room_number)
  )
  AND b.operating_room_id IS NULL;

-- Backfill surgeon foreign key where provider_name matches surgeons name
UPDATE public.or_block_schedule b
SET surgeon_id = s.id
FROM public.surgeons s
WHERE b.facility_id = s.facility_id
  AND LOWER(TRIM(b.provider_name)) = LOWER(TRIM(s.name))
  AND b.surgeon_id IS NULL;

-- ==============================================================================
-- 8. TENANT-SCOPED ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- 8.1 Operating Rooms RLS
ALTER TABLE public.operating_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant Scoped Operating Rooms Access" ON public.operating_rooms;
CREATE POLICY "Tenant Scoped Operating Rooms Access"
ON public.operating_rooms
FOR ALL
TO authenticated
USING (
    facility_id IN (SELECT facility_id FROM public.get_auth_user_facilities())
)
WITH CHECK (
    facility_id IN (SELECT facility_id FROM public.get_auth_user_facilities())
    AND public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_director'])
);

-- 8.2 Payers RLS
ALTER TABLE public.payers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant Scoped Payers Access" ON public.payers;
CREATE POLICY "Tenant Scoped Payers Access"
ON public.payers
FOR ALL
TO authenticated
USING (
    facility_id IN (SELECT facility_id FROM public.get_auth_user_facilities())
)
WITH CHECK (
    facility_id IN (SELECT facility_id FROM public.get_auth_user_facilities())
    AND public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'biller'])
);

-- 8.3 Payer Fee Schedules RLS
ALTER TABLE public.payer_fee_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant Scoped Payer Fee Schedules Access" ON public.payer_fee_schedules;
CREATE POLICY "Tenant Scoped Payer Fee Schedules Access"
ON public.payer_fee_schedules
FOR ALL
TO authenticated
USING (
    facility_id IN (SELECT facility_id FROM public.get_auth_user_facilities())
)
WITH CHECK (
    facility_id IN (SELECT facility_id FROM public.get_auth_user_facilities())
    AND public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'biller'])
);

-- 8.4 Surgery Procedures RLS
ALTER TABLE public.surgery_procedures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant Scoped Surgery Procedures Access" ON public.surgery_procedures;
CREATE POLICY "Tenant Scoped Surgery Procedures Access"
ON public.surgery_procedures
FOR ALL
TO authenticated
USING (
    facility_id IN (SELECT facility_id FROM public.get_auth_user_facilities())
)
WITH CHECK (
    facility_id IN (SELECT facility_id FROM public.get_auth_user_facilities())
    AND public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_director', 'biller', 'surgeon'])
);

COMMIT;
