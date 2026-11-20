-- ==============================================================================
-- Migration 110: Recommendation Human Approval Workflow & Quorum Governance
-- Phase D3: Module 13 Decision Intelligence
-- Description: Establishes multi-tier human authorization, dual-key signoffs,
--              rejection tracking, and cryptographic signature ledgers.
-- ==============================================================================

-- 1. Recommendation Approvals Table
CREATE TABLE IF NOT EXISTS public.recommendation_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_id UUID NOT NULL REFERENCES public.next_best_financial_actions(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    approval_tier VARCHAR(32) NOT NULL CHECK (approval_tier IN (
        'TIER_1_SINGLE_SIGN',
        'TIER_2_DUAL_KEY',
        'TIER_3_EXECUTIVE_QUORUM'
    )),
    status VARCHAR(24) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
        'PENDING',
        'APPROVED',
        'REJECTED',
        'ESCALATED',
        'EXPIRED',
        'EXECUTED'
    )),
    requested_by_user_id VARCHAR(64) NOT NULL,
    requested_by_name VARCHAR(128) NOT NULL,
    required_role VARCHAR(64) NOT NULL,
    required_signatures_count INT NOT NULL DEFAULT 1 CHECK (required_signatures_count >= 1 AND required_signatures_count <= 3),
    collected_signatures_count INT NOT NULL DEFAULT 0 CHECK (collected_signatures_count >= 0),
    financial_impact_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    timeout_at TIMESTAMPTZ,
    execution_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    cryptographic_decision_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rec_approvals_action ON public.recommendation_approvals(action_id);
CREATE INDEX IF NOT EXISTS idx_rec_approvals_facility ON public.recommendation_approvals(facility_id, status);
CREATE INDEX IF NOT EXISTS idx_rec_approvals_tier ON public.recommendation_approvals(approval_tier);

-- 2. Recommendation Approval Actions (Immutable Ledger of Votes & Signatures)
CREATE TABLE IF NOT EXISTS public.recommendation_approval_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    approval_id UUID NOT NULL REFERENCES public.recommendation_approvals(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    action_id UUID NOT NULL REFERENCES public.next_best_financial_actions(id) ON DELETE CASCADE,
    action_type VARCHAR(24) NOT NULL CHECK (action_type IN (
        'APPROVE',
        'REJECT',
        'REQUEST_INFO',
        'ESCALATE',
        'EXECUTE'
    )),
    reviewer_user_id VARCHAR(64) NOT NULL,
    reviewer_name VARCHAR(128) NOT NULL,
    reviewer_role VARCHAR(64) NOT NULL,
    decision_comments TEXT NOT NULL,
    signature_token VARCHAR(128) NOT NULL,
    signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rec_approval_actions_approval ON public.recommendation_approval_actions(approval_id, signed_at DESC);
CREATE INDEX IF NOT EXISTS idx_rec_approval_actions_facility ON public.recommendation_approval_actions(facility_id, signed_at DESC);

-- 3. Telemetry Aggregation View
CREATE OR REPLACE VIEW public.vw_recommendation_approval_telemetry AS
SELECT
    facility_id,
    COUNT(id) AS total_approval_requests,
    COUNT(id) FILTER (WHERE status = 'PENDING') AS pending_requests_count,
    COUNT(id) FILTER (WHERE status = 'APPROVED') AS approved_requests_count,
    COUNT(id) FILTER (WHERE status = 'EXECUTED') AS executed_requests_count,
    COUNT(id) FILTER (WHERE status = 'REJECTED') AS rejected_requests_count,
    COUNT(id) FILTER (WHERE approval_tier = 'TIER_2_DUAL_KEY') AS dual_key_requests_count,
    COUNT(id) FILTER (WHERE approval_tier = 'TIER_3_EXECUTIVE_QUORUM') AS executive_quorum_requests_count,
    COALESCE(ROUND(AVG(financial_impact_amount), 2), 0.00) AS avg_financial_impact,
    MAX(updated_at) AS latest_approval_activity_at
FROM public.recommendation_approvals
GROUP BY facility_id;

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.recommendation_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendation_approval_actions ENABLE ROW LEVEL SECURITY;

-- 5. Tenancy Isolation Policies (Idempotent)
DROP POLICY IF EXISTS recommendation_approvals_facility_isolation ON public.recommendation_approvals;
CREATE POLICY recommendation_approvals_facility_isolation ON public.recommendation_approvals
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID
        OR current_setting('app.current_user_role', true) IN ('super_admin', 'org_admin')
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID
        OR current_setting('app.current_user_role', true) IN ('super_admin', 'org_admin')
    );

DROP POLICY IF EXISTS recommendation_approval_actions_facility_isolation ON public.recommendation_approval_actions;
CREATE POLICY recommendation_approval_actions_facility_isolation ON public.recommendation_approval_actions
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID
        OR current_setting('app.current_user_role', true) IN ('super_admin', 'org_admin')
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID
        OR current_setting('app.current_user_role', true) IN ('super_admin', 'org_admin')
    );
