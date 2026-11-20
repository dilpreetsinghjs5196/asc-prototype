-- ==============================================================================
-- Migration 111: Recommendation Decision Ledger & Realized Value History
-- Phase D4: Module 13 Decision Intelligence
-- Description: Immutable, event-sourced decision ledger tracking recommendations,
--              approvals, executions, 835 remittances, and realized financial value.
-- ==============================================================================

-- 1. Decision Ledger Entries Table (Block Chained Records)
CREATE TABLE IF NOT EXISTS public.decision_ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ledger_sequence_number BIGSERIAL,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    action_id UUID NOT NULL REFERENCES public.next_best_financial_actions(id) ON DELETE CASCADE,
    approval_id UUID REFERENCES public.recommendation_approvals(id) ON DELETE SET NULL,
    action_code VARCHAR(32) NOT NULL,
    category VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    expected_financial_value NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    realized_financial_value NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    variance_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    realization_percentage NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    realization_status VARCHAR(32) NOT NULL DEFAULT 'PENDING_REALIZATION' CHECK (realization_status IN (
        'PENDING_REALIZATION',
        'PARTIALLY_REALIZED',
        'FULLY_REALIZED',
        'OVER_REALIZED',
        'UNREALIZED_DEFICIT',
        'ABANDONED'
    )),
    adjudication_source VARCHAR(64),
    adjudication_reference VARCHAR(128),
    adjudicated_at TIMESTAMPTZ,
    time_to_realization_days NUMERIC(6, 1),
    execution_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approver_signatures_count INT NOT NULL DEFAULT 1,
    evidence_completeness_score NUMERIC(5, 2) NOT NULL DEFAULT 100.00,
    previous_block_hash VARCHAR(64) NOT NULL,
    merkle_root_hash VARCHAR(64) NOT NULL,
    current_block_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ledger_action UNIQUE (action_id)
);

CREATE INDEX IF NOT EXISTS idx_decision_ledger_facility ON public.decision_ledger_entries(facility_id, realization_status);
CREATE INDEX IF NOT EXISTS idx_decision_ledger_seq ON public.decision_ledger_entries(facility_id, ledger_sequence_number ASC);
CREATE INDEX IF NOT EXISTS idx_decision_ledger_action ON public.decision_ledger_entries(action_id);
CREATE INDEX IF NOT EXISTS idx_decision_ledger_hash ON public.decision_ledger_entries(current_block_hash);

-- 2. Decision Ledger Events Table (Granular Lifecycle Audit)
CREATE TABLE IF NOT EXISTS public.decision_ledger_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ledger_entry_id UUID NOT NULL REFERENCES public.decision_ledger_entries(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    event_type VARCHAR(32) NOT NULL CHECK (event_type IN (
        'RECOMMENDATION_REGISTERED',
        'APPROVAL_GRANTED',
        'ACTION_DISPATCHED',
        'ADJUDICATION_MATCHED',
        'VALUE_REALIZED',
        'VARIANCE_CONTESTED',
        'AUDIT_SEALED'
    )),
    event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    recorded_by_user_id VARCHAR(64) NOT NULL,
    recorded_by_name VARCHAR(128) NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_hash VARCHAR(64) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_decision_ledger_events_entry ON public.decision_ledger_events(ledger_entry_id, recorded_at ASC);
CREATE INDEX IF NOT EXISTS idx_decision_ledger_events_facility ON public.decision_ledger_events(facility_id, recorded_at ASC);

-- 3. Telemetry View
CREATE OR REPLACE VIEW public.vw_decision_ledger_telemetry AS
SELECT
    facility_id,
    COUNT(id) AS total_ledger_entries_count,
    COALESCE(SUM(expected_financial_value), 0.00) AS total_expected_financial_value,
    COALESCE(SUM(realized_financial_value), 0.00) AS total_realized_financial_value,
    COALESCE(SUM(variance_amount), 0.00) AS net_realization_variance_amount,
    CASE 
        WHEN COALESCE(SUM(expected_financial_value), 0.00) > 0 
        THEN ROUND((COALESCE(SUM(realized_financial_value), 0.00) / SUM(expected_financial_value)) * 100.0, 1)
        ELSE 100.0
    END AS cumulative_realization_rate_pct,
    COALESCE(ROUND(AVG(time_to_realization_days) FILTER (WHERE time_to_realization_days IS NOT NULL), 1), 0.0) AS avg_time_to_realization_days,
    COUNT(id) FILTER (WHERE realization_status = 'FULLY_REALIZED') AS fully_realized_count,
    COUNT(id) FILTER (WHERE realization_status = 'OVER_REALIZED') AS over_realized_count,
    COUNT(id) FILTER (WHERE realization_status = 'PARTIALLY_REALIZED') AS partially_realized_count,
    COUNT(id) FILTER (WHERE realization_status = 'PENDING_REALIZATION') AS pending_realization_count,
    COUNT(id) FILTER (WHERE realization_status = 'UNREALIZED_DEFICIT') AS unrealized_deficit_count,
    MAX(updated_at) AS latest_ledger_activity_at
FROM public.decision_ledger_entries
GROUP BY facility_id;

-- 4. Enable Row-Level Security
ALTER TABLE public.decision_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_ledger_events ENABLE ROW LEVEL SECURITY;

-- 5. Row-Level Security Policies (with idempotent DROP POLICY IF EXISTS)
DROP POLICY IF EXISTS decision_ledger_entries_facility_isolation ON public.decision_ledger_entries;
CREATE POLICY decision_ledger_entries_facility_isolation ON public.decision_ledger_entries
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    );

DROP POLICY IF EXISTS decision_ledger_events_facility_isolation ON public.decision_ledger_events;
CREATE POLICY decision_ledger_events_facility_isolation ON public.decision_ledger_events
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    );
