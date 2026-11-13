-- ==============================================================================
-- Migration: 087_next_best_case.sql
-- Phase AA / A10: Next Best Case Matching & Capacity Allocation Engine
-- Module: Module 10: OR Scheduling & Utilization Optimization
-- Description: Creates backlog registry, ranking execution runs, scored recommendations,
--              scoring weights, analytical views, and multi-tenant RLS policies.
-- ==============================================================================

-- 1. Surgical Waitlist Backlog Master Table
CREATE TABLE IF NOT EXISTS public.or_next_best_case_backlog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    patient_name VARCHAR(128) NOT NULL,
    patient_mrn VARCHAR(64) NOT NULL,
    surgeon_id UUID REFERENCES public.surgeons(id) ON DELETE SET NULL,
    surgeon_name VARCHAR(128) NOT NULL,
    specialty_code VARCHAR(64) NOT NULL,
    procedure_name VARCHAR(256) NOT NULL,
    primary_cpt_code VARCHAR(16) NOT NULL,
    predicted_duration_minutes INTEGER NOT NULL DEFAULT 60,
    projected_contribution_margin NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    prior_auth_status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- 'APPROVED', 'PENDING', 'DENIED', 'EXPIRED'
    hp_cleared BOOLEAN NOT NULL DEFAULT FALSE,
    labs_cleared BOOLEAN NOT NULL DEFAULT FALSE,
    consent_signed BOOLEAN NOT NULL DEFAULT FALSE,
    patient_available BOOLEAN NOT NULL DEFAULT TRUE,
    requires_implant BOOLEAN NOT NULL DEFAULT FALSE,
    implant_delivery_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    backlog_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE_WAITLIST', -- 'ACTIVE_WAITLIST', 'OFFER_PENDING', 'SCHEDULED', 'REMOVED'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Ranking Execution Audit Runs Table
CREATE TABLE IF NOT EXISTS public.or_next_best_case_ranking_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    target_slot_id UUID REFERENCES public.or_recoverable_capacity_slots(id) ON DELETE SET NULL,
    operating_room_id UUID REFERENCES public.operating_rooms(id) ON DELETE SET NULL,
    slot_date DATE NOT NULL,
    slot_duration_minutes INTEGER NOT NULL,
    candidates_evaluated_count INTEGER NOT NULL DEFAULT 0,
    qualified_candidates_count INTEGER NOT NULL DEFAULT 0,
    executed_by_user_id UUID,
    run_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Scored Recommendations Table
CREATE TABLE IF NOT EXISTS public.or_next_best_case_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    run_id UUID NOT NULL REFERENCES public.or_next_best_case_ranking_runs(id) ON DELETE CASCADE,
    backlog_case_id UUID NOT NULL REFERENCES public.or_next_best_case_backlog(id) ON DELETE CASCADE,
    rank_position INTEGER NOT NULL,
    composite_fit_score NUMERIC(5, 2) NOT NULL,
    readiness_score NUMERIC(5, 2) NOT NULL,
    probability_score NUMERIC(5, 2) NOT NULL,
    financial_score NUMERIC(5, 2) NOT NULL,
    time_fit_score NUMERIC(5, 2) NOT NULL,
    duration_utilization_pct NUMERIC(5, 2) NOT NULL,
    is_disqualified BOOLEAN NOT NULL DEFAULT FALSE,
    disqualification_reason VARCHAR(64),
    recommendation_status VARCHAR(32) NOT NULL DEFAULT 'RANKED', -- 'RANKED', 'OFFERED_TO_SURGEON', 'ACCEPTED', 'BOOKED_IN_OR', 'DECLINED', 'EXPIRED'
    decision_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Facility Scoring Weight Settings
CREATE TABLE IF NOT EXISTS public.or_nbc_scoring_weights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    weight_readiness NUMERIC(4, 2) NOT NULL DEFAULT 0.30,
    weight_probability NUMERIC(4, 2) NOT NULL DEFAULT 0.25,
    weight_financial NUMERIC(4, 2) NOT NULL DEFAULT 0.25,
    weight_time_fit NUMERIC(4, 2) NOT NULL DEFAULT 0.20,
    target_benchmark_margin NUMERIC(10, 2) NOT NULL DEFAULT 2500.00,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_nbc_facility_weights UNIQUE (facility_id)
);

-- 5. Indexes for Performance & Query Acceleration
CREATE INDEX IF NOT EXISTS idx_onbc_facility_status ON public.or_next_best_case_backlog (facility_id, backlog_status);
CREATE INDEX IF NOT EXISTS idx_onbc_facility_specialty ON public.or_next_best_case_backlog (facility_id, specialty_code);
CREATE INDEX IF NOT EXISTS idx_onbc_runs_facility_date ON public.or_next_best_case_ranking_runs (facility_id, slot_date);
CREATE INDEX IF NOT EXISTS idx_onbc_recs_run_rank ON public.or_next_best_case_recommendations (run_id, rank_position);
CREATE INDEX IF NOT EXISTS idx_onbc_recs_facility_score ON public.or_next_best_case_recommendations (facility_id, composite_fit_score DESC);

-- 6. Analytical Views
CREATE OR REPLACE VIEW public.vw_or_next_best_case_top_rankings AS
SELECT
    r.id AS recommendation_id,
    r.facility_id,
    r.run_id,
    run.target_slot_id,
    run.slot_date,
    run.slot_duration_minutes,
    r.rank_position,
    r.composite_fit_score,
    r.readiness_score,
    r.probability_score,
    r.financial_score,
    r.time_fit_score,
    r.duration_utilization_pct,
    r.is_disqualified,
    r.disqualification_reason,
    r.recommendation_status,
    b.patient_name,
    b.patient_mrn,
    b.surgeon_name,
    b.specialty_code,
    b.procedure_name,
    b.primary_cpt_code,
    b.predicted_duration_minutes,
    b.projected_contribution_margin,
    b.prior_auth_status,
    b.hp_cleared,
    b.labs_cleared,
    b.consent_signed
FROM public.or_next_best_case_recommendations r
JOIN public.or_next_best_case_ranking_runs run ON r.run_id = run.id
JOIN public.or_next_best_case_backlog b ON r.backlog_case_id = b.id;

CREATE OR REPLACE VIEW public.vw_or_nbc_backlog_readiness_summary AS
SELECT
    facility_id,
    COUNT(*) AS total_backlog_cases,
    COUNT(*) FILTER (WHERE prior_auth_status = 'APPROVED') AS auth_approved_count,
    COUNT(*) FILTER (WHERE hp_cleared = TRUE AND labs_cleared = TRUE AND consent_signed = TRUE) AS clinically_cleared_count,
    COUNT(*) FILTER (WHERE prior_auth_status = 'APPROVED' AND hp_cleared = TRUE AND labs_cleared = TRUE AND consent_signed = TRUE) AS fully_ready_count,
    ROUND(AVG(projected_contribution_margin), 2) AS avg_contribution_margin,
    SUM(projected_contribution_margin) AS total_backlog_potential_margin
FROM public.or_next_best_case_backlog
WHERE backlog_status = 'ACTIVE_WAITLIST'
GROUP BY facility_id;

-- 7. Multi-Tenant Row Level Security (RLS)
ALTER TABLE public.or_next_best_case_backlog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.or_next_best_case_ranking_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.or_next_best_case_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.or_nbc_scoring_weights ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_or_next_best_case_backlog_facility ON public.or_next_best_case_backlog
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
    WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

CREATE POLICY rls_or_next_best_case_ranking_runs_facility ON public.or_next_best_case_ranking_runs
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
    WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

CREATE POLICY rls_or_next_best_case_recommendations_facility ON public.or_next_best_case_recommendations
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
    WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

CREATE POLICY rls_or_nbc_scoring_weights_facility ON public.or_nbc_scoring_weights
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
    WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);
