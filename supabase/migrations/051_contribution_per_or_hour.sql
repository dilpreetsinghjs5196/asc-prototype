-- ==============================================================================
-- MIGRATION: 051_contribution_per_or_hour.sql
-- PHASE: 75 — Contribution Per OR Hour & Financial Yield Engine
-- STATUS: STAGED / AUTHORIZATION PENDING (Read-Only Safety Preserved)
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Case OR Financial Yield Metrics Table
CREATE TABLE IF NOT EXISTS public.case_or_yield_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE RESTRICT,
    operating_room_id UUID REFERENCES public.operating_rooms(id) ON DELETE SET NULL,
    or_room_name VARCHAR(64) NOT NULL DEFAULT 'OR 1',
    surgeon_id BIGINT REFERENCES public.surgeons(id) ON DELETE SET NULL,
    doctor_name VARCHAR(128),
    specialty VARCHAR(128) NOT NULL DEFAULT 'General Surgery',
    cpt_codes TEXT,
    or_minutes NUMERIC(8,2) NOT NULL DEFAULT 60.00 CHECK (or_minutes > 0.00),
    turnover_minutes NUMERIC(8,2) NOT NULL DEFAULT 20.00 CHECK (turnover_minutes >= 0.00),
    total_room_minutes NUMERIC(8,2) NOT NULL DEFAULT 80.00 CHECK (total_room_minutes > 0.00),
    expected_contribution_margin NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    actual_contribution_margin NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    cm_per_or_minute NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    cm_per_or_hour NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    actual_cm_per_or_hour NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    target_hourly_hurdle NUMERIC(10,2) NOT NULL DEFAULT 1500.00 CHECK (target_hourly_hurdle >= 0.00),
    yield_variance_hourly NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    yield_index NUMERIC(6,3) NOT NULL DEFAULT 1.000,
    yield_tier VARCHAR(24) NOT NULL DEFAULT 'TARGET_MET' CHECK (
        yield_tier IN ('PRIME_YIELD', 'ABOVE_TARGET', 'TARGET_MET', 'SUB_TARGET', 'DILUTIVE')
    ),
    turnover_drag_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    is_provisional BOOLEAN NOT NULL DEFAULT FALSE,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    calculated_by UUID REFERENCES auth.users(id),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_or_yield_surgery ON public.case_or_yield_metrics(surgery_id, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_or_yield_facility ON public.case_or_yield_metrics(facility_id, yield_tier);
CREATE INDEX IF NOT EXISTS idx_or_yield_room ON public.case_or_yield_metrics(facility_id, operating_room_id);
CREATE INDEX IF NOT EXISTS idx_or_yield_surgeon ON public.case_or_yield_metrics(facility_id, surgeon_id);
CREATE INDEX IF NOT EXISTS idx_or_yield_specialty ON public.case_or_yield_metrics(facility_id, specialty);

-- 2. Deterministic Calculation Trigger
CREATE OR REPLACE FUNCTION public.fn_calculate_case_or_yield()
RETURNS TRIGGER AS $$
DECLARE
    v_or_mins NUMERIC(8,2);
    v_turn_mins NUMERIC(8,2);
    v_target_hurdle NUMERIC(10,2);
    v_cm NUMERIC(12,2);
    v_act_cm NUMERIC(12,2);
    v_cm_hr NUMERIC(10,2);
BEGIN
    v_or_mins := GREATEST(COALESCE(NEW.or_minutes, 60.00), 1.00);
    v_turn_mins := GREATEST(COALESCE(NEW.turnover_minutes, 0.00), 0.00);
    v_target_hurdle := GREATEST(COALESCE(NEW.target_hourly_hurdle, 1500.00), 0.01);
    v_cm := COALESCE(NEW.expected_contribution_margin, 0.00);
    v_act_cm := COALESCE(NEW.actual_contribution_margin, 0.00);

    NEW.total_room_minutes := ROUND(v_or_mins + v_turn_mins, 2);
    NEW.cm_per_or_minute := ROUND(v_cm / v_or_mins, 2);
    v_cm_hr := ROUND((v_cm / v_or_mins) * 60.00, 2);
    NEW.cm_per_or_hour := v_cm_hr;
    NEW.actual_cm_per_or_hour := ROUND((v_act_cm / v_or_mins) * 60.00, 2);
    NEW.yield_variance_hourly := ROUND(v_cm_hr - v_target_hurdle, 2);
    NEW.yield_index := ROUND(v_cm_hr / v_target_hurdle, 3);

    -- Turnover drag cost: Excess turnover minutes above 20 benchmark mins evaluated at $15/min facility rate
    IF v_turn_mins > 20.00 THEN
        NEW.turnover_drag_cost := ROUND((v_turn_mins - 20.00) * 15.00, 2);
    ELSE
        NEW.turnover_drag_cost := 0.00;
    END IF;

    -- Tier assignment
    IF v_cm < 0.00 THEN
        NEW.yield_tier := 'DILUTIVE';
    ELSIF v_cm_hr >= (v_target_hurdle * 1.50) THEN
        NEW.yield_tier := 'PRIME_YIELD';
    ELSIF v_cm_hr >= (v_target_hurdle * 1.10) THEN
        NEW.yield_tier := 'ABOVE_TARGET';
    ELSIF v_cm_hr >= (v_target_hurdle * 0.90) THEN
        NEW.yield_tier := 'TARGET_MET';
    ELSE
        NEW.yield_tier := 'SUB_TARGET';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calculate_case_or_yield ON public.case_or_yield_metrics;
CREATE TRIGGER trg_calculate_case_or_yield
    BEFORE INSERT OR UPDATE ON public.case_or_yield_metrics
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_calculate_case_or_yield();

-- 3. Rollup View: Operating Room Suite Financial Yield
CREATE OR REPLACE VIEW public.vw_operating_room_yield_summary AS
SELECT
    m.facility_id,
    m.operating_room_id,
    COALESCE(m.or_room_name, 'OR 1') AS or_room_name,
    COUNT(m.id) AS total_cases_evaluated,
    ROUND(SUM(m.or_minutes) / 60.00, 2) AS total_utilized_or_hours,
    ROUND(SUM(m.turnover_minutes) / 60.00, 2) AS total_turnover_hours,
    ROUND(SUM(m.total_room_minutes) / 60.00, 2) AS total_occupancy_hours,
    SUM(m.expected_contribution_margin) AS total_expected_contribution_margin,
    SUM(m.actual_contribution_margin) AS total_actual_margin,
    CASE WHEN SUM(m.or_minutes) > 0 
        THEN ROUND((SUM(m.expected_contribution_margin) / SUM(m.or_minutes)) * 60.00, 2)
        ELSE 0.00 
    END AS avg_cm_per_utilized_or_hour,
    CASE WHEN SUM(m.total_room_minutes) > 0 
        THEN ROUND((SUM(m.expected_contribution_margin) / SUM(m.total_room_minutes)) * 60.00, 2)
        ELSE 0.00 
    END AS avg_cm_per_room_occupancy_hour,
    ROUND(
        (COUNT(CASE WHEN m.yield_tier = 'PRIME_YIELD' THEN 1 END)::NUMERIC / NULLIF(COUNT(m.id), 0)) * 100.00,
        1
    ) AS prime_yield_case_pct,
    SUM(m.turnover_drag_cost) AS total_turnover_drag_cost
FROM public.case_or_yield_metrics m
GROUP BY
    m.facility_id,
    m.operating_room_id,
    m.or_room_name;

-- 4. Rollup View: Surgeon OR Yield Benchmarks
CREATE OR REPLACE VIEW public.vw_surgeon_or_yield_benchmarks AS
SELECT
    m.facility_id,
    m.surgeon_id,
    COALESCE(NULLIF(TRIM(COALESCE(su.firstname, '') || ' ' || COALESCE(su.lastname, '')), ''), m.doctor_name, 'Unassigned Surgeon') AS surgeon_name,
    COALESCE(m.specialty, su.specialty, 'General Surgery') AS specialty,
    COUNT(m.id) AS total_cases,
    ROUND(SUM(m.or_minutes) / 60.00, 2) AS total_or_hours,
    SUM(m.expected_contribution_margin) AS total_contribution_margin,
    CASE WHEN SUM(m.or_minutes) > 0 
        THEN ROUND((SUM(m.expected_contribution_margin) / SUM(m.or_minutes)) * 60.00, 2)
        ELSE 0.00 
    END AS avg_cm_per_or_hour,
    ROUND(
        (COUNT(CASE WHEN m.yield_tier IN ('PRIME_YIELD', 'ABOVE_TARGET', 'TARGET_MET') THEN 1 END)::NUMERIC / NULLIF(COUNT(m.id), 0)) * 100.00,
        1
    ) AS target_hurdle_compliance_pct,
    COUNT(CASE WHEN m.yield_tier = 'PRIME_YIELD' THEN 1 END) AS prime_yield_cases,
    COUNT(CASE WHEN m.yield_tier = 'DILUTIVE' THEN 1 END) AS dilutive_cases
FROM public.case_or_yield_metrics m
LEFT JOIN public.surgeons su ON su.id = m.surgeon_id
GROUP BY
    m.facility_id,
    m.surgeon_id,
    su.firstname,
    su.lastname,
    m.doctor_name,
    m.specialty,
    su.specialty;

-- 5. Rollup View: Specialty OR Yield Matrix
CREATE OR REPLACE VIEW public.vw_specialty_or_yield_matrix AS
SELECT
    m.facility_id,
    m.specialty,
    COUNT(m.id) AS total_cases,
    ROUND(SUM(m.or_minutes) / 60.00, 2) AS total_or_hours,
    ROUND(AVG(m.or_minutes), 1) AS avg_case_minutes,
    ROUND(AVG(m.turnover_minutes), 1) AS avg_turnover_minutes,
    SUM(m.expected_contribution_margin) AS total_contribution_margin,
    CASE WHEN SUM(m.or_minutes) > 0 
        THEN ROUND((SUM(m.expected_contribution_margin) / SUM(m.or_minutes)) * 60.00, 2)
        ELSE 0.00 
    END AS avg_cm_per_or_hour,
    ROUND(
        (COUNT(CASE WHEN m.yield_tier IN ('PRIME_YIELD', 'ABOVE_TARGET') THEN 1 END)::NUMERIC / NULLIF(COUNT(m.id), 0)) * 100.00,
        1
    ) AS high_yield_case_pct
FROM public.case_or_yield_metrics m
GROUP BY
    m.facility_id,
    m.specialty;

-- 6. Row-Level Security (RLS)
ALTER TABLE public.case_or_yield_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY or_yield_metrics_select_policy ON public.case_or_yield_metrics
    FOR SELECT TO authenticated
    USING (public.is_facility_accessible(facility_id));

CREATE POLICY or_yield_metrics_insert_policy ON public.case_or_yield_metrics
    FOR INSERT TO authenticated
    WITH CHECK (public.is_facility_accessible(facility_id));

