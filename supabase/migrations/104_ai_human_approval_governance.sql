-- ==============================================================================
-- Phase C6 Migration: AI Human Approval & Consequential Action Governance
-- Tables: ai_human_approvals, ai_approval_signatures, ai_consequential_executions
-- Views: vw_ai_approval_queue_summary, vw_ai_consequential_execution_history
-- Tenancy: PostgreSQL Row-Level Security (RLS) via app.current_facility_id
-- ==============================================================================

-- 1. AI Human Approval Requests Ledger
CREATE TABLE IF NOT EXISTS public.ai_human_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    request_code VARCHAR(32) NOT NULL, -- e.g. 'REQ-HITL-1042'
    action_type VARCHAR(64) NOT NULL, -- 'OR_BLOCK_REALLOCATION', 'CONSTRUCT_STANDARDIZATION', 'FINANCIAL_WRITE_OFF', 'CONTRACT_RATE_AMENDMENT', 'CLAIM_SCRUBBER_OVERRIDE', 'STAFFING_WINDOW_MODIFICATION'
    governance_tier VARCHAR(32) NOT NULL DEFAULT 'TIER_2_DUAL_KEY', -- 'TIER_1_STANDARD', 'TIER_2_DUAL_KEY', 'TIER_3_QUORUM'
    title VARCHAR(256) NOT NULL,
    rationale TEXT NOT NULL,
    requester_id VARCHAR(64) NOT NULL,
    requester_role VARCHAR(32) NOT NULL,
    proposed_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    rollback_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    financial_exposure_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    affected_cases_count INTEGER NOT NULL DEFAULT 0,
    affected_physicians_count INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING_APPROVAL', -- 'PENDING_APPROVAL', 'PARTIALLY_APPROVED', 'APPROVED', 'REJECTED', 'EXECUTED', 'ROLLED_BACK', 'EXPIRED'
    required_signatures_count INTEGER NOT NULL DEFAULT 2,
    current_signatures_count INTEGER NOT NULL DEFAULT 0,
    provenance_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '72 hours'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. AI Approval Signatures Ledger (Dual-Key Digital Signatures)
CREATE TABLE IF NOT EXISTS public.ai_approval_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    approval_id UUID NOT NULL REFERENCES public.ai_human_approvals(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    signer_id VARCHAR(64) NOT NULL,
    signer_name VARCHAR(128) NOT NULL,
    signer_role VARCHAR(32) NOT NULL,
    key_position VARCHAR(16) NOT NULL, -- 'KEY_1', 'KEY_2', 'QUORUM_VOTE'
    decision VARCHAR(16) NOT NULL, -- 'APPROVED', 'REJECTED'
    attestation_statement TEXT NOT NULL,
    signature_hash VARCHAR(64) NOT NULL,
    signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. AI Consequential Executions & Rollback History
CREATE TABLE IF NOT EXISTS public.ai_consequential_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    approval_id UUID NOT NULL REFERENCES public.ai_human_approvals(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    action_type VARCHAR(64) NOT NULL,
    executed_by VARCHAR(64) NOT NULL,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reversible_until TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '72 hours'),
    execution_status VARCHAR(32) NOT NULL DEFAULT 'EXECUTED', -- 'EXECUTED', 'ROLLED_BACK', 'IRREVERSIBLE'
    rollback_reason TEXT,
    rolled_back_by VARCHAR(64),
    rolled_back_at TIMESTAMPTZ,
    execution_hash VARCHAR(64) NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_approvals_facility_status ON public.ai_human_approvals(facility_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_approvals_expires ON public.ai_human_approvals(expires_at);
CREATE INDEX IF NOT EXISTS idx_ai_signatures_approval ON public.ai_approval_signatures(approval_id);
CREATE INDEX IF NOT EXISTS idx_ai_executions_facility ON public.ai_consequential_executions(facility_id);
CREATE INDEX IF NOT EXISTS idx_ai_executions_reversible ON public.ai_consequential_executions(reversible_until);

-- Analytical Views
CREATE OR REPLACE VIEW public.vw_ai_approval_queue_summary AS
SELECT 
    facility_id,
    COUNT(*) AS total_proposals,
    COUNT(*) FILTER (WHERE status = 'PENDING_APPROVAL' OR status = 'PARTIALLY_APPROVED') AS pending_signoffs_count,
    COUNT(*) FILTER (WHERE status = 'APPROVED' OR status = 'EXECUTED') AS approved_count,
    COUNT(*) FILTER (WHERE status = 'REJECTED') AS rejected_count,
    COUNT(*) FILTER (WHERE status = 'ROLLED_BACK') AS rolled_back_count,
    SUM(financial_exposure_usd) FILTER (WHERE status = 'PENDING_APPROVAL' OR status = 'PARTIALLY_APPROVED') AS pending_exposure_usd
FROM public.ai_human_approvals
GROUP BY facility_id;

CREATE OR REPLACE VIEW public.vw_ai_consequential_execution_history AS
SELECT 
    e.id AS execution_id,
    e.facility_id,
    a.request_code,
    e.action_type,
    a.title,
    e.executed_by,
    e.executed_at,
    e.reversible_until,
    e.execution_status,
    e.rolled_back_at,
    e.rolled_back_by,
    a.financial_exposure_usd
FROM public.ai_consequential_executions e
JOIN public.ai_human_approvals a ON e.approval_id = a.id;

-- Row-Level Security
ALTER TABLE public.ai_human_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_approval_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_consequential_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_ai_approvals_tenant ON public.ai_human_approvals;
CREATE POLICY p_ai_approvals_tenant ON public.ai_human_approvals
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
    WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_ai_signatures_tenant ON public.ai_approval_signatures;
CREATE POLICY p_ai_signatures_tenant ON public.ai_approval_signatures
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
    WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_ai_executions_tenant ON public.ai_consequential_executions;
CREATE POLICY p_ai_executions_tenant ON public.ai_consequential_executions
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
    WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);
