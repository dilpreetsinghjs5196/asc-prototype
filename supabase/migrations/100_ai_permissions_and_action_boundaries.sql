-- ==============================================================================
-- Migration: 100_ai_permissions_and_action_boundaries.sql
-- Phase C2: AI Permissions & Action Boundaries Tier
-- Module: Module 12: AI & Intelligence
-- Description: Establishes AI action boundary definitions, Human-in-the-Loop
--              (HITL) proposed mutations queue, permission audit logging, analytical
--              queue views, indexes, and multi-tenant RLS policies.
-- ==============================================================================

-- 1. AI Action Boundaries Registry
CREATE TABLE IF NOT EXISTS public.ai_action_boundaries (
    action_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description TEXT NOT NULL,
    domain VARCHAR(32) NOT NULL, -- 'CLINICAL', 'FINANCIAL', 'RCM', 'SUPPLY_CHAIN', 'GOVERNANCE'
    risk_tier VARCHAR(32) NOT NULL DEFAULT 'READ_ONLY_ANALYTICS', -- 'READ_ONLY_ANALYTICS', 'EXPORT_SYNTHESIS', 'PROPOSED_MUTATION', 'RESTRICTED_SYSTEM_ACTION'
    requires_approval BOOLEAN NOT NULL DEFAULT false,
    allowed_requester_roles TEXT[] NOT NULL DEFAULT ARRAY['analyst', 'clinical_director', 'facility_admin'],
    allowed_approver_roles TEXT[] NOT NULL DEFAULT ARRAY['clinical_director', 'facility_admin'],
    auto_expire_hours INTEGER NOT NULL DEFAULT 24,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Human-in-the-Loop (HITL) Proposed Actions Queue
CREATE TABLE IF NOT EXISTS public.ai_proposed_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    action_id VARCHAR(64) NOT NULL REFERENCES public.ai_action_boundaries(action_id) ON DELETE CASCADE,
    requester_id VARCHAR(64) NOT NULL,
    requester_role VARCHAR(32) NOT NULL,
    title VARCHAR(256) NOT NULL,
    rationale TEXT NOT NULL,
    proposed_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    projected_impact JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING_APPROVAL', -- 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXECUTED', 'EXPIRED'
    approver_id VARCHAR(64),
    approver_role VARCHAR(32),
    decision_notes TEXT,
    decided_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    execution_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. AI Permission Audit Ledger
CREATE TABLE IF NOT EXISTS public.ai_permission_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL,
    user_role VARCHAR(32) NOT NULL,
    requested_permission VARCHAR(64) NOT NULL,
    target_resource VARCHAR(128) NOT NULL,
    decision VARCHAR(16) NOT NULL, -- 'GRANTED', 'DENIED'
    denial_reason TEXT,
    provenance_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Analytical Views for Governance & HITL Queue
CREATE OR REPLACE VIEW public.vw_ai_pending_action_queue AS
SELECT
    pa.id,
    pa.facility_id,
    pa.action_id,
    ab.name AS action_name,
    ab.domain,
    ab.risk_tier,
    pa.requester_id,
    pa.requester_role,
    pa.title,
    pa.rationale,
    pa.proposed_payload,
    pa.projected_impact,
    pa.status,
    pa.expires_at,
    pa.created_at
FROM public.ai_proposed_actions pa
JOIN public.ai_action_boundaries ab ON pa.action_id = ab.action_id
WHERE pa.status = 'PENDING_APPROVAL' AND pa.expires_at > NOW();

CREATE OR REPLACE VIEW public.vw_ai_permission_compliance_summary AS
SELECT
    facility_id,
    COUNT(*) AS total_evaluations,
    COUNT(*) FILTER (WHERE decision = 'GRANTED') AS total_granted,
    COUNT(*) FILTER (WHERE decision = 'DENIED') AS total_denied,
    ROUND((COUNT(*) FILTER (WHERE decision = 'GRANTED')::NUMERIC / NULLIF(COUNT(*), 0)::NUMERIC) * 100, 2) AS grant_rate_pct
FROM public.ai_permission_audit_logs
GROUP BY facility_id;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_ai_proposed_facility_status ON public.ai_proposed_actions(facility_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_proposed_expires ON public.ai_proposed_actions(expires_at);
CREATE INDEX IF NOT EXISTS idx_ai_permission_audit_facility ON public.ai_permission_audit_logs(facility_id, created_at DESC);

-- 6. Row-Level Security
ALTER TABLE public.ai_action_boundaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_proposed_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_permission_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_ai_action_boundaries_read ON public.ai_action_boundaries
    FOR SELECT TO authenticated USING (true);

CREATE POLICY p_ai_proposed_actions_tenant ON public.ai_proposed_actions
    FOR ALL TO authenticated
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
    WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

CREATE POLICY p_ai_permission_audit_tenant ON public.ai_permission_audit_logs
    FOR ALL TO authenticated
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
    WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);
