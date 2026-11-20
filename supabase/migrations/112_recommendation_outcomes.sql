-- ==============================================================================
-- Migration 112: Recommendation Outcome Tracking & Causal Attribution
-- Phase D5: Module 13 Decision Intelligence
-- Description: Measures realized financial uplift against counterfactual baselines,
--              quantifies machine vs human attribution, and tracks AR cycle time savings.
-- ==============================================================================

-- 1. Recommendation Outcomes Table
CREATE TABLE IF NOT EXISTS public.recommendation_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    action_id UUID NOT NULL REFERENCES public.next_best_financial_actions(id) ON DELETE CASCADE,
    ledger_entry_id UUID REFERENCES public.decision_ledger_entries(id) ON DELETE SET NULL,
    action_code VARCHAR(32) NOT NULL,
    category VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    attribution_model VARCHAR(32) NOT NULL CHECK (attribution_model IN (
        'DIRECT_MACHINE_ATTRIBUTED',
        'COLLABORATIVE_ATTRIBUTED',
        'HUMAN_EXECUTIVE_ATTRIBUTED',
        'ORGANIC_BASELINE_ATTRIBUTED'
    )),
    machine_attribution_pct NUMERIC(5, 2) NOT NULL DEFAULT 100.00 CHECK (machine_attribution_pct >= 0 AND machine_attribution_pct <= 100),
    human_attribution_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (human_attribution_pct >= 0 AND human_attribution_pct <= 100),
    expected_financial_value NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    gross_realized_value NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    baseline_counterfactual_recovery NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    incremental_uplift_value NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    incremental_uplift_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    days_saved_cycle_time NUMERIC(6, 1) NOT NULL DEFAULT 0.0,
    model_calibration_ratio NUMERIC(5, 3) NOT NULL DEFAULT 1.000,
    outcome_confidence_score NUMERIC(5, 2) NOT NULL DEFAULT 95.00,
    attribution_rationale TEXT NOT NULL,
    verified_by_user_id VARCHAR(64) NOT NULL,
    measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_outcome_action UNIQUE (action_id)
);

CREATE INDEX IF NOT EXISTS idx_rec_outcomes_facility ON public.recommendation_outcomes(facility_id, attribution_model);
CREATE INDEX IF NOT EXISTS idx_rec_outcomes_action ON public.recommendation_outcomes(action_id);
CREATE INDEX IF NOT EXISTS idx_rec_outcomes_category ON public.recommendation_outcomes(category);

-- 2. Recommendation Attribution Touchpoints (Granular Multi-Touch Event Ledger)
CREATE TABLE IF NOT EXISTS public.recommendation_attribution_touchpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outcome_id UUID NOT NULL REFERENCES public.recommendation_outcomes(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    touchpoint_stage VARCHAR(32) NOT NULL CHECK (touchpoint_stage IN (
        'DETECTION_NBFA',
        'PRIORITY_RANKING',
        'EVIDENCE_ASSEMBLY',
        'HUMAN_APPROVAL',
        'DISPATCH_EXECUTION',
        'REMITTANCE_ADJUDICATION'
    )),
    actor_entity VARCHAR(64) NOT NULL,
    contribution_weight_pct NUMERIC(5, 2) NOT NULL CHECK (contribution_weight_pct >= 0 AND contribution_weight_pct <= 100),
    touchpoint_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    touchpoint_hash VARCHAR(64) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attribution_touchpoints_outcome ON public.recommendation_attribution_touchpoints(outcome_id);
CREATE INDEX IF NOT EXISTS idx_attribution_touchpoints_facility ON public.recommendation_attribution_touchpoints(facility_id);

-- 3. Recommendation Outcome Telemetry View
CREATE OR REPLACE VIEW public.vw_recommendation_outcome_telemetry AS
SELECT
    facility_id,
    COUNT(id) AS total_tracked_outcomes_count,
    COALESCE(SUM(gross_realized_value), 0.00) AS total_gross_realized_value,
    COALESCE(SUM(baseline_counterfactual_recovery), 0.00) AS total_counterfactual_baseline_value,
    COALESCE(SUM(incremental_uplift_value), 0.00) AS total_incremental_uplift_value,
    CASE 
        WHEN COALESCE(SUM(baseline_counterfactual_recovery), 0.00) > 0 
        THEN ROUND((COALESCE(SUM(incremental_uplift_value), 0.00) / SUM(baseline_counterfactual_recovery)) * 100.0, 1)
        ELSE 100.0
    END AS cumulative_uplift_rate_pct,
    COALESCE(ROUND(AVG(machine_attribution_pct), 1), 0.0) AS avg_machine_attribution_pct,
    COALESCE(ROUND(AVG(human_attribution_pct), 1), 0.0) AS avg_human_attribution_pct,
    COALESCE(ROUND(AVG(days_saved_cycle_time), 1), 0.0) AS avg_days_saved_cycle_time,
    COALESCE(ROUND(AVG(model_calibration_ratio), 3), 1.000) AS avg_model_calibration_ratio,
    COUNT(id) FILTER (WHERE attribution_model = 'DIRECT_MACHINE_ATTRIBUTED') AS direct_machine_count,
    COUNT(id) FILTER (WHERE attribution_model = 'COLLABORATIVE_ATTRIBUTED') AS collaborative_count,
    COUNT(id) FILTER (WHERE attribution_model = 'HUMAN_EXECUTIVE_ATTRIBUTED') AS human_executive_count,
    MAX(updated_at) AS latest_outcome_measured_at
FROM public.recommendation_outcomes
GROUP BY facility_id;

-- 4. Enable Row-Level Security
ALTER TABLE public.recommendation_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendation_attribution_touchpoints ENABLE ROW LEVEL SECURITY;

-- 5. Row-Level Security Policies (with idempotent DROP POLICY IF EXISTS)
DROP POLICY IF EXISTS recommendation_outcomes_facility_isolation ON public.recommendation_outcomes;
CREATE POLICY recommendation_outcomes_facility_isolation ON public.recommendation_outcomes
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    );

DROP POLICY IF EXISTS recommendation_attribution_touchpoints_facility_isolation ON public.recommendation_attribution_touchpoints;
CREATE POLICY recommendation_attribution_touchpoints_facility_isolation ON public.recommendation_attribution_touchpoints
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    );
