-- ==============================================================================
-- MIGRATION 009: CASE MASTER NORMALIZATION, LIFECYCLE FSM & PERIOPERATIVE MILESTONES
-- ==============================================================================
-- Description: Establishes production-grade canonical Case Master schema for ASCANALYST:
--              1. Canonical surgeries table column expansions & data type hardening
--              2. Backward-compatible extraction of regex-packed notes into typed columns
--              3. Case lifecycle finite state machine (FSM) validation trigger
--              4. 1NF normalized public.case_milestones tracking table
--              5. External source system provenance & unique constraints
--              6. Server-authoritative calculation and snapshot freezing RPC
--              7. Hardened Row Level Security (RLS) policies for surgeries & milestones
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. NORMALIZE EXISTING SURGERY STATUS STRINGS PRIOR TO ENUM/CHECK CONSTRAINTS
-- ==============================================================================

UPDATE public.surgeries
SET status = 'Scheduled'
WHERE status IS NULL OR LOWER(TRIM(status)) IN ('scheduled', 'rescheduled');

UPDATE public.surgeries
SET status = 'Completed'
WHERE LOWER(TRIM(status)) = 'completed';

UPDATE public.surgeries
SET status = 'Cancelled'
WHERE LOWER(TRIM(status)) IN ('cancelled', 'canceled');

UPDATE public.surgeries
SET status = 'In-OR'
WHERE LOWER(TRIM(status)) IN ('in progress', 'in-progress', 'inor', 'in_or');

UPDATE public.surgeries
SET status = 'Draft'
WHERE LOWER(TRIM(status)) = 'draft';

-- ==============================================================================
-- 2. EXPAND AND HARDEN PUBLIC.SURGERIES COLUMNS
-- ==============================================================================

-- 2.1 External Provenance & Source IDs
ALTER TABLE public.surgeries
    ADD COLUMN IF NOT EXISTS source_system TEXT NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN IF NOT EXISTS source_case_id TEXT,
    ADD COLUMN IF NOT EXISTS import_batch_id UUID;

-- 2.2 Relational Foreign Keys
ALTER TABLE public.surgeries
    ADD COLUMN IF NOT EXISTS primary_payer_id UUID REFERENCES public.payers(id) ON DELETE SET NULL;

-- 2.3 Temporal & Scheduling Columns
ALTER TABLE public.surgeries
    ADD COLUMN IF NOT EXISTS scheduled_start_time TIME NOT NULL DEFAULT '08:00:00',
    ADD COLUMN IF NOT EXISTS scheduled_duration_minutes INTEGER NOT NULL DEFAULT 60,
    ADD COLUMN IF NOT EXISTS scheduled_turnover_minutes INTEGER NOT NULL DEFAULT 15;

-- 2.4 Clinical Classification & Payment Models
ALTER TABLE public.surgeries
    ADD COLUMN IF NOT EXISTS case_classification TEXT NOT NULL DEFAULT 'Elective',
    ADD COLUMN IF NOT EXISTS payment_model TEXT NOT NULL DEFAULT 'Insurance';

-- 2.5 Structured Cancellation Metadata (Eliminates regex packing in notes)
ALTER TABLE public.surgeries
    ADD COLUMN IF NOT EXISTS cancellation_reason_code TEXT,
    ADD COLUMN IF NOT EXISTS cancellation_reason_text TEXT,
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2.6 Structured Fixed Cosmetic & Overrides (Eliminates regex parsing in hospitalUtils)
ALTER TABLE public.surgeries
    ADD COLUMN IF NOT EXISTS cosmetic_facility_fee NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS cosmetic_anesthesia_fee NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS self_pay_anesthesia_fee NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS tray_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00;

-- 2.7 Structured Clinical Documentation
ALTER TABLE public.surgeries
    ADD COLUMN IF NOT EXISTS pre_op_diagnosis TEXT,
    ADD COLUMN IF NOT EXISTS post_op_diagnosis TEXT,
    ADD COLUMN IF NOT EXISTS operative_findings TEXT,
    ADD COLUMN IF NOT EXISTS clinical_notes TEXT,
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2.8 Apply Check Constraints Safely
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_surgeries_status' AND conrelid = 'public.surgeries'::regclass
    ) THEN
        ALTER TABLE public.surgeries
            ADD CONSTRAINT chk_surgeries_status CHECK (
                status IN ('Draft', 'Scheduled', 'Pre-Op', 'In-OR', 'Closing', 'PACU', 'Completed', 'Billed', 'Cancelled', 'Void')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_surgeries_classification' AND conrelid = 'public.surgeries'::regclass
    ) THEN
        ALTER TABLE public.surgeries
            ADD CONSTRAINT chk_surgeries_classification CHECK (
                case_classification IN ('Elective', 'Urgent', 'Emergency', 'Add-On')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_surgeries_payment_model' AND conrelid = 'public.surgeries'::regclass
    ) THEN
        ALTER TABLE public.surgeries
            ADD CONSTRAINT chk_surgeries_payment_model CHECK (
                payment_model IN ('Insurance', 'Cosmetic_Fixed', 'Self_Pay', 'Pro_Bono', 'Workers_Comp')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_surgeries_cancellation_reason' AND conrelid = 'public.surgeries'::regclass
    ) THEN
        ALTER TABLE public.surgeries
            ADD CONSTRAINT chk_surgeries_cancellation_reason CHECK (
                cancellation_reason_code IS NULL OR cancellation_reason_code IN (
                    'PATIENT_ACUTE_ILLNESS', 'NPO_VIOLATION', 'TRANSPORTATION_FAILURE', 'PREOP_CLEARANCE_LACKING',
                    'SURGEON_EMERGENCY', 'EQUIPMENT_UNAVAILABLE', 'PRIOR_AUTH_DENIED', 'PATIENT_REFUSAL', 'SCHEDULING_ERROR'
                )
            );
    END IF;
END $$;

-- ==============================================================================
-- 3. DATA MIGRATION: BACKFILL REGEX NOTES INTO STRUCTURED COLUMNS
-- ==============================================================================

DO $$
DECLARE
    r RECORD;
    v_fac_fee NUMERIC(12, 2);
    v_anes_fee NUMERIC(12, 2);
    v_tray NUMERIC(10, 2);
    v_match TEXT[];
BEGIN
    FOR r IN SELECT id, notes, is_probono, status FROM public.surgeries WHERE notes IS NOT NULL OR is_probono = true LOOP
        -- Pro bono payment model backfill
        IF r.is_probono = true THEN
            UPDATE public.surgeries SET payment_model = 'Pro_Bono' WHERE id = r.id;
        END IF;

        IF r.notes IS NOT NULL THEN
            -- Tray cost extraction: [Tray Cost: 150.00]
            v_match := regexp_matches(r.notes, '\[Tray Cost:\s*([\d.]+)\]', 'i');
            IF v_match IS NOT NULL AND array_length(v_match, 1) > 0 THEN
                v_tray := v_match[1]::NUMERIC;
                UPDATE public.surgeries SET tray_cost = v_tray WHERE id = r.id;
            END IF;

            -- Fixed cosmetic facility fee: Facility: $2,500
            v_match := regexp_matches(r.notes, '(?:Facility|Cosmetic|CSC|Faculty)(?:\s+Fee)?:\s*\$?\s*([\d,.]+)', 'i');
            IF v_match IS NOT NULL AND array_length(v_match, 1) > 0 THEN
                v_fac_fee := replace(v_match[1], ',', '')::NUMERIC;
                UPDATE public.surgeries 
                SET cosmetic_facility_fee = v_fac_fee, payment_model = 'Cosmetic_Fixed' 
                WHERE id = r.id;
            END IF;

            -- Fixed cosmetic anesthesia fee: Anesthesia: $800
            v_match := regexp_matches(r.notes, '(?:Anesthesia|Quantum)(?:\s+Fee)?:\s*\$?\s*([\d,.]+)', 'i');
            IF v_match IS NOT NULL AND array_length(v_match, 1) > 0 THEN
                v_anes_fee := replace(v_match[1], ',', '')::NUMERIC;
                UPDATE public.surgeries 
                SET cosmetic_anesthesia_fee = v_anes_fee, payment_model = 'Cosmetic_Fixed' 
                WHERE id = r.id;
            END IF;

            -- Self-Pay Anesthesia: Self-Pay Anesthesia ... $500
            v_match := regexp_matches(r.notes, 'Self-Pay Anesthesia(?:\s\([^)]+\))?:?\s*\$?\s*([\d,]+)', 'i');
            IF v_match IS NOT NULL AND array_length(v_match, 1) > 0 THEN
                UPDATE public.surgeries 
                SET self_pay_anesthesia_fee = replace(v_match[1], ',', '')::NUMERIC 
                WHERE id = r.id;
            END IF;

            -- Cancellation extraction: Cancelled: <reason>
            IF r.status = 'Cancelled' AND r.notes ~* '^Cancelled:\s*' THEN
                UPDATE public.surgeries
                SET cancellation_reason_text = regexp_replace(r.notes, '^Cancelled:\s*', '', 'i'),
                    cancellation_reason_code = 'SCHEDULING_ERROR'
                WHERE id = r.id AND cancellation_reason_code IS NULL;
            END IF;
        END IF;
    END LOOP;
END $$;

-- ==============================================================================
-- 4. UNIQUE CONSTRAINTS & PERFORMANCE INDEXES
-- ==============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_facility_source_case 
ON public.surgeries (facility_id, source_system, source_case_id) 
WHERE source_case_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_surgeries_facility_status ON public.surgeries (facility_id, status);
CREATE INDEX IF NOT EXISTS idx_surgeries_room_date ON public.surgeries (operating_room_id, date);
CREATE INDEX IF NOT EXISTS idx_surgeries_surgeon_date ON public.surgeries (surgeon_id, date);
CREATE INDEX IF NOT EXISTS idx_surgeries_patient ON public.surgeries (patient_id);
CREATE INDEX IF NOT EXISTS idx_surgeries_primary_payer ON public.surgeries (primary_payer_id);

-- ==============================================================================
-- 5. CASE LIFECYCLE FINITE STATE MACHINE (FSM) TRIGGER
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_validate_case_status_transition()
RETURNS TRIGGER AS $$
DECLARE
    v_old_status TEXT;
    v_new_status TEXT;
    v_is_valid BOOLEAN := false;
BEGIN
    v_old_status := OLD.status;
    v_new_status := NEW.status;

    -- If status did not change, allow update
    IF v_old_status = v_new_status THEN
        RETURN NEW;
    END IF;

    -- State Machine Transition Matrix
    CASE v_old_status
        WHEN 'Draft' THEN
            v_is_valid := v_new_status IN ('Scheduled', 'Cancelled');
        WHEN 'Scheduled' THEN
            v_is_valid := v_new_status IN ('Pre-Op', 'Cancelled');
        WHEN 'Pre-Op' THEN
            v_is_valid := v_new_status IN ('In-OR', 'Cancelled');
        WHEN 'In-OR' THEN
            v_is_valid := v_new_status IN ('Closing', 'PACU');
        WHEN 'Closing' THEN
            v_is_valid := v_new_status IN ('PACU');
        WHEN 'PACU' THEN
            v_is_valid := v_new_status IN ('Completed');
        WHEN 'Completed' THEN
            v_is_valid := v_new_status IN ('Billed', 'Void');
        WHEN 'Billed' THEN
            v_is_valid := v_new_status IN ('Void');
        WHEN 'Cancelled' THEN
            -- Once cancelled, cannot transition to other active states
            v_is_valid := false;
        WHEN 'Void' THEN
            -- Terminal void state
            v_is_valid := false;
        ELSE
            v_is_valid := false;
    END CASE;

    -- Super Admin Override: Super admins can bypass transition matrix for emergency audit corrections
    IF NOT v_is_valid THEN
        IF EXISTS (
            SELECT 1 FROM public.facility_memberships fm
            WHERE fm.user_id = auth.uid()
              AND fm.facility_id = NEW.facility_id
              AND fm.role = 'super_admin'
              AND fm.is_active = true
        ) THEN
            v_is_valid := true;
        END IF;
    END IF;

    IF NOT v_is_valid THEN
        RAISE EXCEPTION 'Invalid case status transition from % to % for surgical case %', 
            v_old_status, v_new_status, NEW.id;
    END IF;

    -- Automatically populate cancellation metadata if transitioning to Cancelled
    IF v_new_status = 'Cancelled' AND NEW.cancelled_at IS NULL THEN
        NEW.cancelled_at := NOW();
        NEW.cancelled_by := auth.uid();
    END IF;

    -- Increment internal concurrency version
    NEW.version := COALESCE(OLD.version, 1) + 1;
    NEW.updated_by := auth.uid();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_validate_case_status_transition ON public.surgeries;
CREATE TRIGGER trg_validate_case_status_transition
    BEFORE UPDATE OF status ON public.surgeries
    FOR EACH ROW EXECUTE FUNCTION public.fn_validate_case_status_transition();

-- ==============================================================================
-- 6. 1NF NORMALIZED CASE MILESTONES TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.case_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE CASCADE,
    milestone_code TEXT NOT NULL CHECK (milestone_code IN (
        'PATIENT_ARRIVED',
        'PRE_OP_INTAKE_START',
        'PRE_OP_READY',
        'WHEELS_IN_OR',
        'ANESTHESIA_START',
        'SURGICAL_TIMEOUT',
        'SURGICAL_INCISION',
        'SURGICAL_CLOSING',
        'ANESTHESIA_STOP',
        'WHEELS_OUT_OR',
        'PACU_ADMIT',
        'PACU_DISCHARGE'
    )),
    milestone_timestamp TIMESTAMPTZ NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    verification_notes TEXT,
    CONSTRAINT uq_surgery_milestone UNIQUE (surgery_id, milestone_code)
);

CREATE INDEX IF NOT EXISTS idx_milestones_surgery ON public.case_milestones (surgery_id);
CREATE INDEX IF NOT EXISTS idx_milestones_facility ON public.case_milestones (facility_id);
CREATE INDEX IF NOT EXISTS idx_milestones_facility_timestamp ON public.case_milestones (facility_id, milestone_timestamp);

-- Audit Trigger on Case Milestones
DROP TRIGGER IF EXISTS trg_audit_case_milestones ON public.case_milestones;
CREATE TRIGGER trg_audit_case_milestones
    AFTER INSERT OR UPDATE OR DELETE ON public.case_milestones
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

-- ==============================================================================
-- 7. SERVER-AUTHORITATIVE CASE FINANCIAL CALCULATION & FREEZE RPC
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.calculate_surgery_financials(
    p_surgery_id BIGINT,
    p_freeze BOOLEAN DEFAULT false
)
RETURNS JSONB AS $$
DECLARE
    v_surg RECORD;
    v_proc RECORD;
    v_fac RECORD;
    v_total_revenue NUMERIC(12, 2) := 0.00;
    v_duration INTEGER := 60;
    v_turnover INTEGER := 15;
    v_total_minutes INTEGER := 75;
    v_room_cost NUMERIC(12, 2) := 0.00;
    v_labor_cost NUMERIC(12, 2) := 0.00;
    v_supplies_cost NUMERIC(12, 2) := 0.00;
    v_implants_cost NUMERIC(12, 2) := 0.00;
    v_meds_cost NUMERIC(12, 2) := 0.00;
    v_total_cost NUMERIC(12, 2) := 0.00;
    v_net_margin NUMERIC(12, 2) := 0.00;
    v_margin_per_min NUMERIC(12, 2) := 0.00;
    v_eligible_rank INTEGER := 1;
    v_proc_rate NUMERIC(12, 2);
    v_is_mppr_enabled BOOLEAN := false;
BEGIN
    SELECT * INTO v_surg FROM public.surgeries WHERE id = p_surgery_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Surgery case % not found', p_surgery_id;
    END IF;

    SELECT * INTO v_fac FROM public.facilities WHERE id = v_surg.facility_id;
    v_is_mppr_enabled := COALESCE(v_fac.apply_medicare_mppr, false);

    -- Duration and turnover resolution
    v_duration := COALESCE(v_surg.actual_duration_minutes, v_surg.duration_minutes, v_surg.scheduled_duration_minutes, 60);
    v_turnover := COALESCE(v_surg.turnover_time, v_surg.scheduled_turnover_minutes, 15);
    v_total_minutes := v_duration + v_turnover;

    -- Piecewise OR Room Cost Curve
    IF v_total_minutes <= 30 THEN
        v_room_cost := 300.00;
    ELSIF v_total_minutes <= 60 THEN
        v_room_cost := 300.00 + ((v_total_minutes - 30) * 8.50);
    ELSIF v_total_minutes <= 120 THEN
        v_room_cost := 555.00 + ((v_total_minutes - 60) * 7.00);
    ELSE
        v_room_cost := 975.00 + ((v_total_minutes - 120) * 5.50);
    END IF;

    -- Piecewise Labor Cost Curve
    IF v_duration <= 30 THEN
        v_labor_cost := 400.00;
    ELSIF v_duration <= 60 THEN
        v_labor_cost := 400.00 + ((v_duration - 30) * 12.00);
    ELSIF v_duration <= 120 THEN
        v_labor_cost := 760.00 + ((v_duration - 60) * 10.00);
    ELSE
        v_labor_cost := 1360.00 + ((v_duration - 120) * 8.00);
    END IF;

    -- Supply costs
    v_supplies_cost := COALESCE(v_surg.supplies_cost, 0.00);
    v_implants_cost := COALESCE(v_surg.implants_cost, 0.00);
    v_meds_cost := COALESCE(v_surg.medications_cost, 0.00);

    -- Payment Model Revenue Calculation
    IF v_surg.payment_model = 'Pro_Bono' THEN
        v_total_revenue := 0.00;
        v_room_cost := 0.00;
        v_labor_cost := 0.00;
        v_supplies_cost := 0.00;
        v_implants_cost := 0.00;
        v_meds_cost := 0.00;
    ELSIF v_surg.payment_model = 'Cosmetic_Fixed' THEN
        v_total_revenue := COALESCE(v_surg.cosmetic_facility_fee, 0.00) + COALESCE(v_surg.cosmetic_anesthesia_fee, 0.00);
    ELSE
        -- Insurance / Standard: Iterate over normalized procedures if present, fallback to expected_reimbursement
        IF EXISTS (SELECT 1 FROM public.surgery_procedures WHERE surgery_id = p_surgery_id) THEN
            FOR v_proc IN 
                SELECT sp.*, c.code AS cpt_code_str
                FROM public.surgery_procedures sp
                LEFT JOIN public.cpt_codes c ON sp.cpt_code_id = c.id
                WHERE sp.surgery_id = p_surgery_id
                ORDER BY sp.baseline_charge DESC, sp.sequence_rank ASC
            LOOP
                v_proc_rate := COALESCE(v_proc.contracted_reimbursement, v_proc.baseline_charge, 0.00);

                IF NOT v_is_mppr_enabled THEN
                    v_total_revenue := v_total_revenue + v_proc_rate;
                ELSE
                    -- Add-on codes (+) exempt from reduction
                    IF v_proc.cpt_code_str LIKE '+%' THEN
                        v_total_revenue := v_total_revenue + v_proc_rate;
                    ELSIF v_eligible_rank = 1 THEN
                        v_total_revenue := v_total_revenue + v_proc_rate;
                        v_eligible_rank := v_eligible_rank + 1;
                    ELSE
                        v_total_revenue := v_total_revenue + (v_proc_rate * 0.50);
                        v_eligible_rank := v_eligible_rank + 1;
                    END IF;
                END IF;
            END LOOP;
        ELSE
            v_total_revenue := COALESCE(v_surg.expected_reimbursement, 0.00);
        END IF;
    END IF;

    -- Net Margin & Cost Totals
    v_total_cost := v_room_cost + v_labor_cost + v_supplies_cost + v_implants_cost + v_meds_cost;
    v_net_margin := (v_total_revenue - COALESCE(v_surg.write_off, 0.00)) - v_total_cost;
    
    IF v_duration > 0 THEN
        v_margin_per_min := ROUND((v_net_margin / v_duration)::NUMERIC, 2);
    ELSE
        v_margin_per_min := 0.00;
    END IF;

    -- Freeze snapshot if requested or case is Completed/Billed
    IF p_freeze = true OR v_surg.status IN ('Completed', 'Billed') THEN
        INSERT INTO public.surgery_financial_snapshots (
            surgery_id,
            facility_id,
            gross_revenue,
            expected_reimbursement,
            room_cost,
            labor_cost,
            supplies_cost,
            implants_cost,
            medications_cost,
            total_cost,
            net_margin,
            margin_per_or_minute,
            calculation_version,
            snapshot_data,
            frozen_at,
            frozen_by
        )
        VALUES (
            p_surgery_id,
            v_surg.facility_id,
            v_total_revenue,
            v_total_revenue,
            v_room_cost,
            v_labor_cost,
            v_supplies_cost,
            v_implants_cost,
            v_meds_cost,
            v_total_cost,
            v_net_margin,
            v_margin_per_min,
            'v1.0-cms2026',
            jsonb_build_object(
                'case_id', p_surgery_id,
                'status', v_surg.status,
                'payment_model', v_surg.payment_model,
                'total_minutes', v_total_minutes,
                'mppr_applied', v_is_mppr_enabled
            ),
            NOW(),
            auth.uid()
        )
        ON CONFLICT (surgery_id) DO UPDATE SET
            gross_revenue = EXCLUDED.gross_revenue,
            expected_reimbursement = EXCLUDED.expected_reimbursement,
            room_cost = EXCLUDED.room_cost,
            labor_cost = EXCLUDED.labor_cost,
            supplies_cost = EXCLUDED.supplies_cost,
            implants_cost = EXCLUDED.implants_cost,
            medications_cost = EXCLUDED.medications_cost,
            total_cost = EXCLUDED.total_cost,
            net_margin = EXCLUDED.net_margin,
            margin_per_or_minute = EXCLUDED.margin_per_or_minute,
            frozen_at = NOW(),
            frozen_by = auth.uid();
    END IF;

    RETURN jsonb_build_object(
        'surgery_id', p_surgery_id,
        'gross_revenue', v_total_revenue,
        'expected_reimbursement', v_total_revenue,
        'room_cost', v_room_cost,
        'labor_cost', v_labor_cost,
        'supplies_cost', v_supplies_cost,
        'implants_cost', v_implants_cost,
        'medications_cost', v_meds_cost,
        'total_cost', v_total_cost,
        'net_margin', v_net_margin,
        'margin_per_or_minute', v_margin_per_min,
        'calculation_version', 'v1.0-cms2026'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ==============================================================================
-- 8. ROW LEVEL SECURITY (RLS) POLICIES ON CASE MILESTONES & HARDENED SURGERIES UPDATE
-- ==============================================================================

-- 8.1 Case Milestones RLS
ALTER TABLE public.case_milestones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant Scoped Case Milestones Read" ON public.case_milestones;
CREATE POLICY "Tenant Scoped Case Milestones Read"
ON public.case_milestones FOR SELECT TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
    AND (
        NOT user_has_facility_role(facility_id, ARRAY['surgeon'])
        OR surgery_id IN (
            SELECT s.id FROM public.surgeries s 
            WHERE s.facility_id = case_milestones.facility_id
              AND s.surgeon_id IN (
                  SELECT surg.id FROM public.surgeons surg
                  WHERE LOWER(TRIM(surg.email)) = LOWER(TRIM(COALESCE(auth.jwt()->>'email', '')))
              )
        )
    )
);

DROP POLICY IF EXISTS "Tenant Scoped Case Milestones Insert" ON public.case_milestones;
CREATE POLICY "Tenant Scoped Case Milestones Insert"
ON public.case_milestones FOR INSERT TO authenticated
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
    AND (
        has_permission(facility_id, 'surgeries.edit') OR
        user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'clinical_director', 'scheduler', 'surgeon'])
    )
);

-- 8.2 Hardened Surgeries UPDATE Policy: Restrict Attending Surgeons Strictly to Personal Cases & Lock Completed Cases
DROP POLICY IF EXISTS "Tenant Scoped Surgeries Update" ON public.surgeries;
CREATE POLICY "Tenant Scoped Surgeries Update"
ON public.surgeries FOR UPDATE TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
    AND (
        -- Completed/Billed cases are locked against modification except by enterprise administrators
        (status NOT IN ('Completed', 'Billed', 'Void'))
        OR user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin'])
    )
    AND (
        -- If user is a surgeon, they can update only their own surgical records
        NOT user_has_facility_role(facility_id, ARRAY['surgeon'])
        OR surgeon_id IN (
            SELECT s.id FROM public.surgeons s 
            WHERE LOWER(TRIM(s.email)) = LOWER(TRIM(COALESCE(auth.jwt()->>'email', '')))
        )
    )
)
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
    AND (
        (status NOT IN ('Completed', 'Billed', 'Void'))
        OR user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin'])
    )
    AND (
        NOT user_has_facility_role(facility_id, ARRAY['surgeon'])
        OR surgeon_id IN (
            SELECT s.id FROM public.surgeons s 
            WHERE LOWER(TRIM(s.email)) = LOWER(TRIM(COALESCE(auth.jwt()->>'email', '')))
        )
    )
);

-- Refresh PostgREST API schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
