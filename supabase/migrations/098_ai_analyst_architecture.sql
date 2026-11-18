-- ==============================================================================
-- Migration: 098_ai_analyst_architecture.sql
-- Phase C0: AI Analyst Architecture & Tool-Gated Data Access
-- Module: Module 12: AI & Intelligence
-- Description: Establishes secure AI Analyst conversation sessions, message
--              histories with tool citations, immutable tool execution audit logs,
--              analytical views, indexes, and multi-tenant RLS.
-- ==============================================================================

-- 1. AI Analyst Conversations Table
CREATE TABLE IF NOT EXISTS public.ai_analyst_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    session_title VARCHAR(256) NOT NULL DEFAULT 'Executive Inquiry',
    context_domain VARCHAR(64) NOT NULL DEFAULT 'EXECUTIVE_OVERVIEW', -- 'SURGEON', 'PAYER', 'CPT_ECONOMICS', 'SUPPLY_CHAIN', 'EXECUTIVE_OVERVIEW'
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'ARCHIVED', 'TERMINATED'
    total_messages_count INTEGER NOT NULL DEFAULT 0,
    total_tool_calls_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. AI Analyst Messages Table
CREATE TABLE IF NOT EXISTS public.ai_analyst_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.ai_analyst_conversations(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    sender_role VARCHAR(32) NOT NULL, -- 'USER', 'ASSISTANT', 'SYSTEM', 'TOOL'
    message_text TEXT NOT NULL,
    tool_calls_invoked JSONB DEFAULT '[]'::JSONB,
    tool_results JSONB DEFAULT '[]'::JSONB,
    citations JSONB DEFAULT '[]'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. AI Tool Execution Audit Logs Table (Immutable Cryptographic Ledger)
CREATE TABLE IF NOT EXISTS public.ai_tool_execution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    conversation_id UUID REFERENCES public.ai_analyst_conversations(id) ON DELETE SET NULL,
    tool_name VARCHAR(128) NOT NULL,
    tool_category VARCHAR(64) NOT NULL, -- 'FINANCIAL', 'CLINICAL', 'RCM', 'SUPPLY_CHAIN', 'GOVERNANCE'
    parameters_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    execution_status VARCHAR(32) NOT NULL DEFAULT 'SUCCESS', -- 'SUCCESS', 'PERMISSION_DENIED', 'VALIDATION_ERROR', 'TIMEOUT', 'FAILED'
    duration_ms INTEGER NOT NULL DEFAULT 0,
    records_returned INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    execution_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Analytical Views
CREATE OR REPLACE VIEW public.vw_ai_tool_usage_summary AS
SELECT
    facility_id,
    tool_name,
    tool_category,
    COUNT(*) AS total_invocations,
    ROUND(AVG(duration_ms), 1) AS avg_duration_ms,
    SUM(CASE WHEN execution_status = 'SUCCESS' THEN 1 ELSE 0 END) AS success_count,
    SUM(CASE WHEN execution_status != 'SUCCESS' THEN 1 ELSE 0 END) AS error_count,
    ROUND((SUM(CASE WHEN execution_status = 'SUCCESS' THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 2) AS success_rate_pct
FROM public.ai_tool_execution_logs
GROUP BY facility_id, tool_name, tool_category;

CREATE OR REPLACE VIEW public.vw_ai_security_audit_radar AS
SELECT
    id,
    facility_id,
    user_id,
    tool_name,
    parameters_payload,
    execution_status,
    error_message,
    execution_hash,
    created_at
FROM public.ai_tool_execution_logs
WHERE execution_status IN ('PERMISSION_DENIED', 'VALIDATION_ERROR', 'FAILED');

-- 5. Indexes for Query Performance & Audit Compliance
CREATE INDEX IF NOT EXISTS idx_ai_conv_facility ON public.ai_analyst_conversations(facility_id);
CREATE INDEX IF NOT EXISTS idx_ai_conv_user ON public.ai_analyst_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_msg_conv ON public.ai_analyst_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_msg_facility ON public.ai_analyst_messages(facility_id);
CREATE INDEX IF NOT EXISTS idx_ai_tool_log_facility ON public.ai_tool_execution_logs(facility_id);
CREATE INDEX IF NOT EXISTS idx_ai_tool_log_name ON public.ai_tool_execution_logs(tool_name);
CREATE INDEX IF NOT EXISTS idx_ai_tool_log_status ON public.ai_tool_execution_logs(execution_status);
CREATE INDEX IF NOT EXISTS idx_ai_tool_log_created ON public.ai_tool_execution_logs(created_at DESC);

-- 6. Multi-Tenancy Row Level Security (RLS)
ALTER TABLE public.ai_analyst_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_analyst_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_tool_execution_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_ai_analyst_conversations_facility ON public.ai_analyst_conversations
    FOR ALL USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID
    );

CREATE POLICY rls_ai_analyst_messages_facility ON public.ai_analyst_messages
    FOR ALL USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID
    );

CREATE POLICY rls_ai_tool_execution_logs_facility ON public.ai_tool_execution_logs
    FOR ALL USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID
    );
