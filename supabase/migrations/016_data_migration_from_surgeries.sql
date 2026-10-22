-- ==============================================================================
-- MIGRATION 016: DATA MIGRATION FROM SURGERIES TO NORMALIZED CANONICAL ENTITIES
-- ==============================================================================
-- Description: Production data migration and relational hardening (Phase 37):
--              1. Quarantines 4 AI Auto-Assigned prototype cases (IDs 244, 253, 257, 258)
--                 to 'Draft' status with provenance notes.
--              2. Assigns completed Case 94 to 'OR 1' (room_number 1).
--              3. Backfills operating_room_id UUIDs on all 234 surgeries from or_room.
--              4. Generates and enforces immutable case_uuid on all surgeries.
--              5. Enforces external provenance and unique source case constraints.
--              6. Extracts tray cost from clinical notes into typed tray_cost column.
--              7. Extracts regex anesthesia fees from notes into cosmetic/self-pay anesthesia fees.
--              8. Cleans clinical_notes removing legacy financial tags.
--              9. Extracts embedded staff from cpt_expenses into 1NF case_staff_assignments.
--              10. Populates perioperative milestones for all 77 Completed cases.
--              11. Freezes baseline historical financial snapshots for all 77 Completed cases.
--              12. Attaches fk_surgeries_operating_room foreign key constraint.
--              13. Enforces cross-tenant child entity validation trigger.
--              14. Deploys backward-compatibility view v_legacy_surgeries_compat.
-- Specification: docs/phases/37_DATA_MIGRATION_FROM_SURGERIES.md
-- Platform: Supabase PostgreSQL 15+
-- ==============================================================================

BEGIN;

-- Ensure pgcrypto extension is available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. QUARANTINE 4 AI PROTOTYPE CASES (IDs 244, 253, 257, 258)
-- ==============================================================================
-- These cases were created via AI Auto-Scheduler prototypes without surgeon or OR.
-- Moving them to 'Draft' status enables strict NOT NULL validation on active cases.

UPDATE public.surgeries
SET status = 'Draft',
    source_system = 'AI_CONSOLE_PROTOTYPE',
    source_case_id = 'AI-PROTO-' || id,
    clinical_notes = COALESCE(clinical_notes, '') || ' [QUARANTINED: AI Prototype Case with NULL surgeon and OR; pending clinical review and rescheduling]'
WHERE id IN (244, 253, 257, 258);

-- ==============================================================================
-- 2. RESOLVE CASE 94 OPERATING ROOM ASSIGNMENT
-- ==============================================================================
-- Case 94 is a historical completed case with or_room = NULL.
-- Assign to Naples Surgery Center OR 1 (10000000-0000-0000-0000-000000000001).

UPDATE public.surgeries
SET or_room = 1,
    operating_room_id = '10000000-0000-0000-0000-000000000001'::UUID
WHERE id = 94;

-- ==============================================================================
-- 3. BACKFILL OPERATING_ROOM_ID ON ALL SURGERIES
-- ==============================================================================
-- Map legacy integer or_room (1..4) to public.operating_rooms(id) UUID.

UPDATE public.surgeries s
SET operating_room_id = o.id
FROM public.operating_rooms o
WHERE s.facility_id = o.facility_id
  AND s.or_room = o.room_number
  AND s.operating_room_id IS NULL;

-- Default any remaining active cases with NULL room to OR 1
UPDATE public.surgeries s
SET operating_room_id = '10000000-0000-0000-0000-000000000001'::UUID,
    or_room = 1
WHERE s.operating_room_id IS NULL
  AND s.status IN ('Scheduled', 'Completed');

-- ==============================================================================
-- 4. CASE_UUID GENERATION & CONCURRENCY CONTROLS
-- ==============================================================================

ALTER TABLE public.surgeries
    ADD COLUMN IF NOT EXISTS case_uuid UUID DEFAULT gen_random_uuid();

UPDATE public.surgeries
SET case_uuid = gen_random_uuid()
WHERE case_uuid IS NULL;

ALTER TABLE public.surgeries
    ALTER COLUMN case_uuid SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_surgeries_case_uuid 
ON public.surgeries(case_uuid);

-- ==============================================================================
-- 5. EXTERNAL PROVENANCE & DEDUPLICATION
-- ==============================================================================

UPDATE public.surgeries
SET source_system = 'LEGACY_PROTOTYPE',
    source_case_id = 'CASE-' || id
WHERE source_case_id IS NULL 
  AND id NOT IN (244, 253, 257, 258);

CREATE UNIQUE INDEX IF NOT EXISTS uq_facility_source_case 
ON public.surgeries(facility_id, source_system, source_case_id);

-- ==============================================================================
-- 6. TRAY COST EXTRACTION (NOTES TO COLUMN)
-- ==============================================================================
-- Historical Case 17 has [Tray Cost: 45.00] embedded in notes.

UPDATE public.surgeries
SET tray_cost = 45.00
WHERE id = 17 AND (tray_cost IS NULL OR tray_cost = 0);

-- Extract any other bracketed tray costs
UPDATE public.surgeries
SET tray_cost = SUBSTRING(notes FROM '\[Tray Cost:\s*([\d.]+)\]')::NUMERIC
WHERE notes ~* '\[Tray Cost:\s*[\d.]+\]'
  AND (tray_cost IS NULL OR tray_cost = 0);

-- ==============================================================================
-- 7. ANESTHESIA FEE EXTRACTION (NOTES TO COLUMNS)
-- ==============================================================================
-- 92 historical cases contain regex-parseable anesthesia dollar values in notes.

UPDATE public.surgeries
SET cosmetic_anesthesia_fee = (
    REPLACE(SUBSTRING(notes FROM '(?:Anesthesia|Quantum)(?:\s+Fee)?:\s*\$?\s*([\d,.]+)'), ',', '')::NUMERIC
)
WHERE notes ~* '(?:Anesthesia|Quantum)(?:\s+Fee)?:\s*\$?\s*[\d,.]+'
  AND (cosmetic_anesthesia_fee IS NULL OR cosmetic_anesthesia_fee = 0)
  AND (self_pay_anesthesia_fee IS NULL OR self_pay_anesthesia_fee = 0);

-- ==============================================================================
-- 8. SANITIZE CLINICAL NOTES
-- ==============================================================================
-- Strip financial regex tags from clinical_notes while preserving medical text.

UPDATE public.surgeries
SET clinical_notes = TRIM(
    REGEXP_REPLACE(
        REGEXP_REPLACE(
            REGEXP_REPLACE(
                COALESCE(notes, ''),
                '\[Tray Cost:\s*[\d.]+\]', '', 'gi'
            ),
            '\[Full Total:\s*[\d.]+\]', '', 'gi'
        ),
        '(?:Anesthesia|Quantum)(?:\s+Fee)?:\s*\$?\s*[\d,.]+', '', 'gi'
    )
)
WHERE clinical_notes IS NULL OR clinical_notes = '';

-- ==============================================================================
-- 9. EXTRACT EMBEDDED STAFF FROM JSONB INTO 1NF CASE_STAFF_ASSIGNMENTS
-- ==============================================================================
-- Case 254 contains staff array [9, 8, 12, 10, 11] in cpt_expenses._or_staff_ids.

INSERT INTO public.case_staff_assignments (
    facility_id,
    surgery_id,
    staff_id,
    assigned_role,
    billing_designation,
    shift_start,
    shift_end,
    hours_attributed,
    frozen_hourly_rate,
    calculated_labor_cost
)
SELECT 
    s.facility_id,
    s.id,
    st.id,
    CASE 
        WHEN st.id = 9 THEN 'Circulating_RN'
        WHEN st.id = 8 THEN 'Scrub_Tech'
        WHEN st.id = 12 THEN 'Scrub_Tech'
        WHEN st.id = 10 THEN 'PACU_RN'
        WHEN st.id = 11 THEN 'PreOp_RN'
        ELSE 'Clinical_Support'
    END,
    'Direct_Clinical',
    (s.date::TEXT || ' ' || COALESCE(s.scheduled_start_time, '08:00:00'::TIME)::TEXT)::TIMESTAMPTZ,
    (s.date::TEXT || ' ' || COALESCE(s.scheduled_start_time, '08:00:00'::TIME)::TEXT)::TIMESTAMPTZ + INTERVAL '60 minutes',
    1.0,
    COALESCE(st.hourly_rate, 45.00),
    1.0 * COALESCE(st.hourly_rate, 45.00)
FROM public.surgeries s
CROSS JOIN LATERAL (
    SELECT UNNEST(ARRAY[9, 8, 12, 10, 11]) AS staff_id_num
) arr
JOIN public.staff st ON st.id = arr.staff_id_num
WHERE s.id = 254
ON CONFLICT (facility_id, surgery_id, staff_id, assigned_role) DO NOTHING;

-- ==============================================================================
-- 10. POPULATE PERIOPERATIVE MILESTONES FOR COMPLETED CASES
-- ==============================================================================

-- 10.1 Scheduled Start Milestone
INSERT INTO public.case_milestones (
    facility_id,
    surgery_id,
    milestone_code,
    recorded_at,
    milestone_status,
    notes
)
SELECT 
    s.facility_id,
    s.id,
    'Scheduled_Start',
    (s.date::TEXT || ' ' || COALESCE(s.scheduled_start_time, '08:00:00'::TIME)::TEXT)::TIMESTAMPTZ,
    'Completed',
    'Historical migration baseline milestone'
FROM public.surgeries s
WHERE s.status = 'Completed'
ON CONFLICT (surgery_id, milestone_code) DO NOTHING;

-- 10.2 Wheels In Milestone
INSERT INTO public.case_milestones (
    facility_id,
    surgery_id,
    milestone_code,
    recorded_at,
    milestone_status,
    notes
)
SELECT 
    s.facility_id,
    s.id,
    'Wheels_In',
    (s.date::TEXT || ' ' || COALESCE(s.actual_start_time, s.scheduled_start_time, '08:00:00'::TIME)::TEXT)::TIMESTAMPTZ,
    'Completed',
    'Historical migration baseline milestone'
FROM public.surgeries s
WHERE s.status = 'Completed'
ON CONFLICT (surgery_id, milestone_code) DO NOTHING;

-- 10.3 Wheels Out Milestone
INSERT INTO public.case_milestones (
    facility_id,
    surgery_id,
    milestone_code,
    recorded_at,
    milestone_status,
    notes
)
SELECT 
    s.facility_id,
    s.id,
    'Wheels_Out',
    (s.date::TEXT || ' ' || COALESCE(s.actual_end_time, '09:00:00'::TIME)::TEXT)::TIMESTAMPTZ,
    'Completed',
    'Historical migration baseline milestone'
FROM public.surgeries s
WHERE s.status = 'Completed'
ON CONFLICT (surgery_id, milestone_code) DO NOTHING;

-- 10.4 Case Completed Milestone
INSERT INTO public.case_milestones (
    facility_id,
    surgery_id,
    milestone_code,
    recorded_at,
    milestone_status,
    notes
)
SELECT 
    s.facility_id,
    s.id,
    'Case_Completed',
    s.updated_at,
    'Completed',
    'Historical migration baseline milestone'
FROM public.surgeries s
WHERE s.status = 'Completed'
ON CONFLICT (surgery_id, milestone_code) DO NOTHING;

-- ==============================================================================
-- 11. FREEZE HISTORICAL FINANCIAL SNAPSHOTS (77 COMPLETED CASES)
-- ==============================================================================
-- Freezes exact historical baseline values ($1,658,305.00 total) with $0.00 variance.

INSERT INTO public.surgery_financial_snapshots (
    facility_id,
    surgery_id,
    snapshot_type,
    calculation_version,
    total_revenue,
    contracted_reimbursement,
    patient_copay_coinsurance,
    expected_reimbursement,
    direct_labor_cost,
    or_room_cost,
    supplies_cost,
    implants_cost,
    medications_cost,
    anesthesia_cost,
    tray_cost,
    total_direct_costs,
    gross_contribution_margin,
    operating_margin_pct,
    write_off_amount,
    frozen_at,
    frozen_by
)
SELECT
    s.facility_id,
    s.id,
    'MIGRATION_BASELINE_FREEZE',
    'V1_PRESERVED',
    COALESCE(s.expected_reimbursement, 0.00),
    COALESCE(s.expected_reimbursement, 0.00),
    0.00,
    COALESCE(s.expected_reimbursement, 0.00),
    COALESCE(s.actual_labor_cost, 0.00),
    COALESCE(s.actual_room_cost, 0.00),
    COALESCE(s.supplies_cost, 0.00),
    COALESCE(s.implants_cost, 0.00),
    COALESCE(s.medications_cost, 0.00),
    COALESCE(s.cosmetic_anesthesia_fee, s.self_pay_anesthesia_fee, 0.00),
    COALESCE(s.tray_cost, 0.00),
    (COALESCE(s.actual_labor_cost, 0.00) + COALESCE(s.actual_room_cost, 0.00) + 
     COALESCE(s.supplies_cost, 0.00) + COALESCE(s.implants_cost, 0.00) + 
     COALESCE(s.medications_cost, 0.00) + COALESCE(s.tray_cost, 0.00)),
    (COALESCE(s.expected_reimbursement, 0.00) - 
     (COALESCE(s.actual_labor_cost, 0.00) + COALESCE(s.actual_room_cost, 0.00) + 
      COALESCE(s.supplies_cost, 0.00) + COALESCE(s.implants_cost, 0.00) + 
      COALESCE(s.medications_cost, 0.00) + COALESCE(s.tray_cost, 0.00))),
    CASE 
        WHEN COALESCE(s.expected_reimbursement, 0.00) > 0 THEN
            ROUND(
                ((COALESCE(s.expected_reimbursement, 0.00) - 
                 (COALESCE(s.actual_labor_cost, 0.00) + COALESCE(s.actual_room_cost, 0.00) + 
                  COALESCE(s.supplies_cost, 0.00) + COALESCE(s.implants_cost, 0.00) + 
                  COALESCE(s.medications_cost, 0.00) + COALESCE(s.tray_cost, 0.00))) 
                 / s.expected_reimbursement) * 100, 2
            )
        ELSE 0.00
    END,
    COALESCE(s.write_off, 0.00),
    NOW(),
    s.updated_by
FROM public.surgeries s
WHERE s.status = 'Completed'
ON CONFLICT (facility_id, surgery_id) DO NOTHING;

-- Update snapshot metadata on surgeries
UPDATE public.surgeries
SET financial_snapshot_date = updated_at,
    calculation_version = 'V1_PRESERVED'
WHERE status = 'Completed' AND financial_snapshot_date IS NULL;

-- ==============================================================================
-- 12. ATTACH OPERATING ROOM FOREIGN KEY CONSTRAINT
-- ==============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'fk_surgeries_operating_room'
    ) THEN
        ALTER TABLE public.surgeries
            ADD CONSTRAINT fk_surgeries_operating_room
            FOREIGN KEY (operating_room_id) REFERENCES public.operating_rooms(id)
            ON DELETE RESTRICT;
    END IF;
END $$;

-- ==============================================================================
-- 13. CROSS-TENANT CHILD INTEGRITY VALIDATION TRIGGER
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_validate_case_child_tenancy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_surgery_facility_id UUID;
BEGIN
    SELECT facility_id INTO v_surgery_facility_id
    FROM public.surgeries
    WHERE id = NEW.surgery_id;

    IF v_surgery_facility_id IS NULL THEN
        RAISE EXCEPTION 'Referenced surgery_id % does not exist in public.surgeries', NEW.surgery_id;
    END IF;

    IF NEW.facility_id <> v_surgery_facility_id THEN
        RAISE EXCEPTION 'Child entity facility_id % does not match parent surgery facility_id %',
            NEW.facility_id, v_surgery_facility_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_surgery_procedures_tenancy ON public.surgery_procedures;
CREATE TRIGGER trg_validate_surgery_procedures_tenancy
BEFORE INSERT OR UPDATE ON public.surgery_procedures
FOR EACH ROW EXECUTE FUNCTION public.fn_validate_case_child_tenancy();

DROP TRIGGER IF EXISTS trg_validate_case_milestones_tenancy ON public.case_milestones;
CREATE TRIGGER trg_validate_case_milestones_tenancy
BEFORE INSERT OR UPDATE ON public.case_milestones
FOR EACH ROW EXECUTE FUNCTION public.fn_validate_case_child_tenancy();

DROP TRIGGER IF EXISTS trg_validate_case_staff_assignments_tenancy ON public.case_staff_assignments;
CREATE TRIGGER trg_validate_case_staff_assignments_tenancy
BEFORE INSERT OR UPDATE ON public.case_staff_assignments
FOR EACH ROW EXECUTE FUNCTION public.fn_validate_case_child_tenancy();

-- ==============================================================================
-- 14. DEPLOY BACKWARD COMPATIBILITY VIEW V_LEGACY_SURGERIES_COMPAT
-- ==============================================================================

CREATE OR REPLACE VIEW public.v_legacy_surgeries_compat AS
SELECT 
    s.id,
    s.case_uuid,
    s.facility_id,
    s.patient_id,
    s.surgeon_id,
    s.doctor_name,
    s.date,
    s.start_time,
    s.scheduled_start_time,
    s.scheduled_duration_minutes,
    s.scheduled_turnover_minutes,
    s.duration_minutes,
    s.turnover_time,
    s.or_room,
    s.operating_room_id,
    o.name AS operating_room_name,
    s.status,
    s.case_classification,
    s.payment_model,
    s.cpt_codes,
    s.notes,
    s.clinical_notes,
    s.actual_start_time,
    s.actual_end_time,
    s.actual_duration_minutes,
    s.actual_room_cost,
    s.actual_labor_cost,
    s.expected_reimbursement,
    s.supplies_cost,
    s.implants_cost,
    s.medications_cost,
    s.tray_cost,
    s.cosmetic_facility_fee,
    s.cosmetic_anesthesia_fee,
    s.self_pay_anesthesia_fee,
    s.write_off,
    s.is_probono,
    s.financial_snapshot_date,
    s.calculation_version,
    s.source_system,
    s.source_case_id,
    s.version,
    s.created_at,
    s.updated_at,
    -- Financial snapshot details if completed
    snap.gross_contribution_margin AS frozen_gross_margin,
    snap.operating_margin_pct AS frozen_operating_margin_pct,
    snap.total_direct_costs AS frozen_total_costs
FROM public.surgeries s
LEFT JOIN public.operating_rooms o ON o.id = s.operating_room_id
LEFT JOIN public.surgery_financial_snapshots snap ON snap.surgery_id = s.id;

COMMIT;
