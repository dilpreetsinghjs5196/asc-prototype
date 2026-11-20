-- ==============================================================================
-- Migration 108: Recommendation Priority Model & Configurable Scoring Profiles
-- Phase D1: Module 13 Decision Intelligence
-- ==============================================================================

-- 1. Recommendation Scoring Profiles Table
CREATE TABLE IF NOT EXISTS public.recommendation_scoring_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    profile_code VARCHAR(32) NOT NULL,
    name VARCHAR(128) NOT NULL,
    description TEXT NOT NULL,
    value_weight NUMERIC(4, 3) NOT NULL DEFAULT 0.350 CHECK (value_weight >= 0.200 AND value_weight <= 0.600),
    urgency_weight NUMERIC(4, 3) NOT NULL DEFAULT 0.250 CHECK (urgency_weight >= 0.150 AND urgency_weight <= 0.500),
    recoverability_weight NUMERIC(4, 3) NOT NULL DEFAULT 0.200 CHECK (recoverability_weight >= 0.050 AND recoverability_weight <= 0.400),
    confidence_weight NUMERIC(4, 3) NOT NULL DEFAULT 0.100 CHECK (confidence_weight >= 0.050 AND confidence_weight <= 0.300),
    effort_weight NUMERIC(4, 3) NOT NULL DEFAULT 0.100 CHECK (effort_weight >= 0.050 AND effort_weight <= 0.400),
    value_cap NUMERIC(12, 2) NOT NULL DEFAULT 25000.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_profile_weights_sum CHECK (ROUND(value_weight + urgency_weight + recoverability_weight + confidence_weight + effort_weight, 3) = 1.000),
    CONSTRAINT uq_facility_profile_code UNIQUE(facility_id, profile_code)
);

CREATE INDEX IF NOT EXISTS idx_scoring_profiles_facility ON public.recommendation_scoring_profiles(facility_id, is_active);

-- 2. Recommendation Score Logs Table (Immutable Calculation Trace Ledger)
CREATE TABLE IF NOT EXISTS public.recommendation_score_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_id UUID NOT NULL REFERENCES public.next_best_financial_actions(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.recommendation_scoring_profiles(id) ON DELETE CASCADE,
    raw_financial_value NUMERIC(12, 2) NOT NULL,
    normalized_value_score NUMERIC(5, 2) NOT NULL,
    urgency_score NUMERIC(5, 2) NOT NULL,
    recoverability_score NUMERIC(5, 2) NOT NULL,
    confidence_score NUMERIC(5, 2) NOT NULL,
    effort_score NUMERIC(5, 2) NOT NULL,
    composite_priority_score NUMERIC(5, 2) NOT NULL,
    priority_tier VARCHAR(16) NOT NULL CHECK (priority_tier IN ('P0_CRITICAL', 'P1_HIGH', 'P2_MEDIUM', 'P3_ROUTINE')),
    calculation_trace JSONB NOT NULL DEFAULT '{}'::jsonb,
    formula_version VARCHAR(32) NOT NULL DEFAULT 'v1.4',
    calculation_hash VARCHAR(64) NOT NULL,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_score_logs_action ON public.recommendation_score_logs(action_id, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_score_logs_facility ON public.recommendation_score_logs(facility_id, calculated_at DESC);

-- 3. Telemetry Aggregation View
CREATE OR REPLACE VIEW public.vw_recommendation_scoring_telemetry AS
SELECT
    p.facility_id,
    p.id AS active_profile_id,
    p.profile_code AS active_profile_code,
    p.name AS active_profile_name,
    COUNT(DISTINCT l.id) AS total_score_calculations,
    COALESCE(ROUND(AVG(l.composite_priority_score), 1), 0.0) AS avg_priority_score,
    COUNT(DISTINCT l.action_id) FILTER (WHERE l.priority_tier = 'P0_CRITICAL') AS critical_p0_scored_count,
    MAX(l.calculated_at) AS last_calculated_at
FROM public.recommendation_scoring_profiles p
LEFT JOIN public.recommendation_score_logs l ON l.profile_id = p.id
WHERE p.is_active = TRUE
GROUP BY p.facility_id, p.id, p.profile_code, p.name;

-- 4. Row-Level Security Policies (Multi-Tenancy Isolation)
ALTER TABLE public.recommendation_scoring_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendation_score_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scoring_profiles_facility_isolation ON public.recommendation_scoring_profiles;
CREATE POLICY scoring_profiles_facility_isolation
ON public.recommendation_scoring_profiles
FOR ALL
USING (
    facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
)
WITH CHECK (
    facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
);

DROP POLICY IF EXISTS score_logs_facility_isolation ON public.recommendation_score_logs;
CREATE POLICY score_logs_facility_isolation
ON public.recommendation_score_logs
FOR ALL
USING (
    facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
)
WITH CHECK (
    facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
);
