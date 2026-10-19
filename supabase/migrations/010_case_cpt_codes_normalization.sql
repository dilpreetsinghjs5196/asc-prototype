-- ==============================================================================
-- MIGRATION 010: CASE CPT CODES NORMALIZATION, UNITS, MODIFIERS & CODING LIFECYCLE
-- ==============================================================================
-- Description: Establishes production-grade 1NF normalized Case CPT line items:
--              1. Expands public.surgery_procedures with units, modifiers[], laterality,
--                 primary flag, coding status, and audit provenance.
--              2. Idempotent backfill of procedures from legacy surgeries.cpt_codes.
--              3. Updates server-authoritative financial RPC to support units & bilateral 50.
--              4. Hardens RLS policies on public.surgery_procedures.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. EXPAND PUBLIC.SURGERY_PROCEDURES SCHEMA
-- ==============================================================================

ALTER TABLE public.surgery_procedures
    ADD COLUMN IF NOT EXISTS units INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS modifiers TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS laterality TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
    ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS procedure_description TEXT,
    ADD COLUMN IF NOT EXISTS coding_status TEXT NOT NULL DEFAULT 'Coded',
    ADD COLUMN IF NOT EXISTS source_system TEXT NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN IF NOT EXISTS source_line_id TEXT,
    ADD COLUMN IF NOT EXISTS fee_schedule_id UUID REFERENCES public.payer_fee_schedules(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS line_gross_charge NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS line_expected_reimbursement NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS coded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS coded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Check Constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_surgery_proc_units' AND conrelid = 'public.surgery_procedures'::regclass
    ) THEN
        ALTER TABLE public.surgery_procedures
            ADD CONSTRAINT chk_surgery_proc_units CHECK (units >= 1 AND units <= 99);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_surgery_proc_laterality' AND conrelid = 'public.surgery_procedures'::regclass
    ) THEN
        ALTER TABLE public.surgery_procedures
            ADD CONSTRAINT chk_surgery_proc_laterality CHECK (
                laterality IN ('LEFT', 'RIGHT', 'BILATERAL', 'NOT_APPLICABLE', 'UNSPECIFIED')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_surgery_proc_coding_status' AND conrelid = 'public.surgery_procedures'::regclass
    ) THEN
        ALTER TABLE public.surgery_procedures
            ADD CONSTRAINT chk_surgery_proc_coding_status CHECK (
                coding_status IN ('Draft', 'Pending_Review', 'Coded', 'Approved', 'Rejected')
            );
    END IF;
END $$;

-- Populate primary flag based on rank
UPDATE public.surgery_procedures
SET is_primary = true
WHERE sequence_rank = 1 AND is_primary = false;

-- Synchronize line gross charges and line expected reimbursements if zero
UPDATE public.surgery_procedures
SET line_gross_charge = baseline_charge * units
WHERE line_gross_charge = 0.00 AND baseline_charge > 0.00;

UPDATE public.surgery_procedures
SET line_expected_reimbursement = final_expected_reimbursement * units
WHERE line_expected_reimbursement = 0.00 AND final_expected_reimbursement > 0.00;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_surgery_proc_status ON public.surgery_procedures(facility_id, coding_status);
CREATE INDEX IF NOT EXISTS idx_surgery_proc_fee_sched ON public.surgery_procedures(fee_schedule_id);
CREATE INDEX IF NOT EXISTS idx_surgery_proc_primary ON public.surgery_procedures(surgery_id, is_primary);

-- ==============================================================================
-- 2. IDEMPOTENT BACKFILL: SURGERIES CPT_CODES -> SURGERY_PROCEDURES
-- ==============================================================================

DO $$
DECLARE
    r_surg RECORD;
    v_cpt_text TEXT;
    v_cpt_rec RECORD;
    v_rank INTEGER;
    v_cpt_array TEXT[];
    v_clean_code TEXT;
BEGIN
    FOR r_surg IN 
        SELECT s.id, s.facility_id, s.cpt_codes
        FROM public.surgeries s
        WHERE s.cpt_codes IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM public.surgery_procedures sp WHERE sp.surgery_id = s.id
          )
    LOOP
        -- Parse array or comma-separated string
        IF pg_typeof(r_surg.cpt_codes)::text = 'text[]' THEN
            v_cpt_array := r_surg.cpt_codes::text[];
        ELSE
            -- Clean brackets and quotes if stored as JSON string
            v_cpt_text := replace(replace(replace(r_surg.cpt_codes::text, '[', ''), ']', ''), '"', '');
            v_cpt_array := string_to_array(v_cpt_text, ',');
        END IF;

        v_rank := 1;
        IF v_cpt_array IS NOT NULL THEN
            FOREACH v_cpt_text IN ARRAY v_cpt_array LOOP
                v_clean_code := TRIM(v_cpt_text);
                IF v_clean_code <> '' THEN
                    SELECT id, gross_charge, reimbursement, description
                    INTO v_cpt_rec
                    FROM public.cpt_codes
                    WHERE code = v_clean_code
                    ORDER BY id DESC
                    LIMIT 1;

                    IF FOUND THEN
                        INSERT INTO public.surgery_procedures (
                            facility_id,
                            surgery_id,
                            cpt_code_id,
                            sequence_rank,
                            is_primary,
                            units,
                            modifiers,
                            laterality,
                            procedure_description,
                            coding_status,
                            baseline_charge,
                            contracted_reimbursement,
                            mppr_applied,
                            mppr_discount_pct,
                            final_expected_reimbursement,
                            line_gross_charge,
                            line_expected_reimbursement,
                            source_system
                        ) VALUES (
                            r_surg.facility_id,
                            r_surg.id,
                            v_cpt_rec.id,
                            v_rank,
                            (v_rank = 1),
                            1,
                            '{}',
                            'NOT_APPLICABLE',
                            v_cpt_rec.description,
                            'Coded',
                            COALESCE(v_cpt_rec.gross_charge, 0.00),
                            COALESCE(v_cpt_rec.reimbursement, 0.00),
                            (v_rank > 1),
                            (CASE WHEN v_rank > 1 THEN 50.00 ELSE 0.00 END),
                            (CASE WHEN v_rank > 1 THEN ROUND(COALESCE(v_cpt_rec.reimbursement, 0.00) * 0.50, 2) ELSE COALESCE(v_cpt_rec.reimbursement, 0.00) END),
                            COALESCE(v_cpt_rec.gross_charge, 0.00),
                            (CASE WHEN v_rank > 1 THEN ROUND(COALESCE(v_cpt_rec.reimbursement, 0.00) * 0.50, 2) ELSE COALESCE(v_cpt_rec.reimbursement, 0.00) END),
                            'MIGRATION_BACKFILL'
                        )
                        ON CONFLICT (surgery_id, sequence_rank) DO NOTHING;

                        v_rank := v_rank + 1;
                    END IF;
                END IF;
            END LOOP;
        END IF;
    END LOOP;
END $$;

-- ==============================================================================
-- 3. UPDATE SERVER FINANCIAL RPC: UNITS & BILATERAL MODIFIER 50 AWARENESS
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
    v_units INTEGER := 1;
    v_is_bilateral BOOLEAN := false;
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
                v_units := COALESCE(v_proc.units, 1);
                v_is_bilateral := ('50' = ANY(COALESCE(v_proc.modifiers, '{}')) OR v_proc.laterality = 'BILATERAL');

                -- Bilateral modifier adjustment (150% standard allowable)
                IF v_is_bilateral THEN
                    v_proc_rate := v_proc_rate * 1.50;
                END IF;

                IF NOT v_is_mppr_enabled THEN
                    v_total_revenue := v_total_revenue + (v_proc_rate * v_units);
                ELSE
                    -- Add-on codes (+) exempt from reduction
                    IF v_proc.cpt_code_str LIKE '+%' THEN
                        v_total_revenue := v_total_revenue + (v_proc_rate * v_units);
                    ELSIF v_eligible_rank = 1 THEN
                        -- First unit receives 100%, additional units receive 50%
                        v_total_revenue := v_total_revenue + v_proc_rate + (v_proc_rate * 0.50 * (v_units - 1));
                        v_eligible_rank := v_eligible_rank + 1;
                    ELSE
                        v_total_revenue := v_total_revenue + (v_proc_rate * 0.50 * v_units);
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
            'v1.1-cms2026-cpt',
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
        'calculation_version', 'v1.1-cms2026-cpt'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ==============================================================================
-- 4. HARDENED ROW LEVEL SECURITY (RLS) POLICIES ON PUBLIC.SURGERY_PROCEDURES
-- ==============================================================================

ALTER TABLE public.surgery_procedures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant Scoped Surgery Procedures Access" ON public.surgery_procedures;
DROP POLICY IF EXISTS "Tenant Scoped Surgery Procedures Read" ON public.surgery_procedures;
DROP POLICY IF EXISTS "Tenant Scoped Surgery Procedures Write" ON public.surgery_procedures;

-- Read policy: tenant users with surgeries read access
CREATE POLICY "Tenant Scoped Surgery Procedures Read"
ON public.surgery_procedures FOR SELECT TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
);

-- Write policy: prevent modifying procedures for completed/billed cases unless enterprise administrator
CREATE POLICY "Tenant Scoped Surgery Procedures Write"
ON public.surgery_procedures FOR ALL TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
    AND (
        surgery_id IN (
            SELECT s.id FROM public.surgeries s 
            WHERE s.facility_id = surgery_procedures.facility_id
              AND (
                  s.status NOT IN ('Completed', 'Billed', 'Void')
                  OR user_has_facility_role(surgery_procedures.facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin'])
              )
        )
    )
    AND (
        NOT user_has_facility_role(facility_id, ARRAY['surgeon'])
        OR surgery_id IN (
            SELECT s.id FROM public.surgeries s 
            WHERE s.facility_id = surgery_procedures.facility_id
              AND s.surgeon_id IN (
                  SELECT surg.id FROM public.surgeons surg 
                  WHERE LOWER(TRIM(surg.email)) = LOWER(TRIM(COALESCE(auth.jwt()->>'email', '')))
              )
        )
    )
)
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
    AND (
        surgery_id IN (
            SELECT s.id FROM public.surgeries s 
            WHERE s.facility_id = surgery_procedures.facility_id
              AND (
                  s.status NOT IN ('Completed', 'Billed', 'Void')
                  OR user_has_facility_role(surgery_procedures.facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin'])
              )
        )
    )
    AND (
        NOT user_has_facility_role(facility_id, ARRAY['surgeon'])
        OR surgery_id IN (
            SELECT s.id FROM public.surgeries s 
            WHERE s.facility_id = surgery_procedures.facility_id
              AND s.surgeon_id IN (
                  SELECT surg.id FROM public.surgeons surg 
                  WHERE LOWER(TRIM(surg.email)) = LOWER(TRIM(COALESCE(auth.jwt()->>'email', '')))
              )
        )
    )
);

-- Notify PostgREST API schema reload
NOTIFY pgrst, 'reload schema';

COMMIT;
