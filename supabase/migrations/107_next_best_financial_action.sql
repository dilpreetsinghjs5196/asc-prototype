-- ==============================================================================
-- Migration 107: Next Best Financial Action Engine
-- Phase D0: Module 13 Decision Intelligence
-- ==============================================================================

-- 1. Next Best Financial Actions Table
CREATE TABLE IF NOT EXISTS public.next_best_financial_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    action_code VARCHAR(32) NOT NULL UNIQUE,
    category VARCHAR(32) NOT NULL CHECK (category IN (
        'DENIAL_APPEAL_URGENT',
        'UNDERPAYMENT_RECOVERY',
        'UNBILLED_CASE_EXPEDITE',
        'OR_BLOCK_RELEASE',
        'IMPLANT_CARVEOUT_CLAIM',
        'SECONDARY_CROSSOVER_SUBMISSION',
        'PRE_SERVICE_DEPOSIT_COLLECTION'
    )),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    source_entity_type VARCHAR(64) NOT NULL,
    source_entity_id VARCHAR(64) NOT NULL,
    expected_financial_value NUMERIC(12, 2) NOT NULL CHECK (expected_financial_value >= 0.00),
    confidence_score NUMERIC(5, 2) NOT NULL CHECK (confidence_score >= 0.0 AND confidence_score <= 100.0),
    urgency_score NUMERIC(5, 2) NOT NULL CHECK (urgency_score >= 0.0 AND urgency_score <= 100.0),
    recoverability_score NUMERIC(5, 2) NOT NULL CHECK (recoverability_score >= 0.0 AND recoverability_score <= 100.0),
    effort_score NUMERIC(5, 2) NOT NULL CHECK (effort_score >= 0.0 AND effort_score <= 100.0),
    composite_priority_rank NUMERIC(5, 2) NOT NULL,
    priority_tier VARCHAR(16) NOT NULL CHECK (priority_tier IN ('P0_CRITICAL', 'P1_HIGH', 'P2_MEDIUM', 'P3_ROUTINE')),
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
        'PENDING', 'ASSIGNED', 'IN_PROGRESS', 'ACCEPTED', 'DISMISSED', 'COMPLETED', 'EXPIRED'
    )),
    assigned_to VARCHAR(64),
    assigned_role VARCHAR(64),
    dismissal_reason VARCHAR(128),
    dismissal_notes TEXT,
    evidence_summary JSONB NOT NULL DEFAULT '[]'::jsonb,
    due_date TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nbfa_facility_status ON public.next_best_financial_actions(facility_id, status);
CREATE INDEX IF NOT EXISTS idx_nbfa_category ON public.next_best_financial_actions(facility_id, category);
CREATE INDEX IF NOT EXISTS idx_nbfa_priority ON public.next_best_financial_actions(facility_id, composite_priority_rank DESC);

-- 2. NBFA Action Lifecycle Events (Audit & Decision Trail)
CREATE TABLE IF NOT EXISTS public.nbfa_action_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_id UUID NOT NULL REFERENCES public.next_best_financial_actions(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    event_type VARCHAR(32) NOT NULL CHECK (event_type IN ('CREATED', 'ASSIGNED', 'STATUS_CHANGE', 'DISMISSED', 'COMPLETED', 'ESCALATED')),
    previous_status VARCHAR(32),
    new_status VARCHAR(32) NOT NULL,
    performed_by VARCHAR(64) NOT NULL,
    notes TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nbfa_events_action ON public.nbfa_action_events(action_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nbfa_events_facility ON public.nbfa_action_events(facility_id, created_at DESC);

-- 3. Telemetry Aggregation View
CREATE OR REPLACE VIEW public.vw_nbfa_facility_telemetry AS
SELECT
    a.facility_id,
    COUNT(*) AS total_actions_count,
    COUNT(*) FILTER (WHERE a.status IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS')) AS active_actions_count,
    COUNT(*) FILTER (WHERE a.priority_tier = 'P0_CRITICAL' AND a.status IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS')) AS urgent_p0_count,
    COALESCE(SUM(a.expected_financial_value) FILTER (WHERE a.status IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS')), 0.00) AS total_pipeline_recovery_value,
    COUNT(*) FILTER (WHERE a.status = 'COMPLETED') AS completed_actions_count,
    COALESCE(ROUND(AVG(a.recoverability_score) FILTER (WHERE a.status IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS')), 1), 0.0) AS avg_recoverability_pct,
    COALESCE(ROUND(AVG(a.confidence_score), 1), 0.0) AS avg_confidence_pct
FROM public.next_best_financial_actions a
GROUP BY a.facility_id;

-- 4. Row-Level Security Policies (Multi-Tenancy Isolation)
ALTER TABLE public.next_best_financial_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nbfa_action_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nbfa_facility_isolation ON public.next_best_financial_actions;
CREATE POLICY nbfa_facility_isolation
ON public.next_best_financial_actions
FOR ALL
USING (
    facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
)
WITH CHECK (
    facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
);

DROP POLICY IF EXISTS nbfa_events_facility_isolation ON public.nbfa_action_events;
CREATE POLICY nbfa_events_facility_isolation
ON public.nbfa_action_events
FOR ALL
USING (
    facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
)
WITH CHECK (
    facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
);
