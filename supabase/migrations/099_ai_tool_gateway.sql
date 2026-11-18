-- ==============================================================================
-- Migration: 099_ai_tool_gateway.sql
-- Phase C1: AI Tool Gateway Tier
-- Module: Module 12: AI & Intelligence
-- Description: Creates typed tool definitions registry, execution telemetry ledger,
--              circuit breaker state tracking, analytical telemetry views, indexes,
--              and multi-tenant RLS policies.
-- ==============================================================================

-- 1. AI Tool Definitions & Contracts Registry
CREATE TABLE IF NOT EXISTS public.ai_tool_definitions (
    id VARCHAR(64) PRIMARY KEY,
    domain VARCHAR(32) NOT NULL, -- 'CLINICAL', 'FINANCIAL', 'RCM', 'SUPPLY_CHAIN', 'GOVERNANCE'
    name VARCHAR(128) NOT NULL,
    description TEXT NOT NULL,
    parameter_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
    required_role VARCHAR(32) NOT NULL DEFAULT 'analyst',
    rate_limit_rpm INTEGER NOT NULL DEFAULT 60,
    max_result_rows INTEGER NOT NULL DEFAULT 50,
    is_active BOOLEAN NOT NULL DEFAULT true,
    version VARCHAR(16) NOT NULL DEFAULT '1.0.0',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. AI Tool Execution Ledger (Provenance & Audit)
CREATE TABLE IF NOT EXISTS public.ai_tool_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL,
    user_role VARCHAR(32) NOT NULL,
    tool_id VARCHAR(64) NOT NULL REFERENCES public.ai_tool_definitions(id) ON DELETE CASCADE,
    parameters_hash VARCHAR(64) NOT NULL,
    parameters_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    result_summary JSONB,
    records_returned INTEGER NOT NULL DEFAULT 0,
    execution_status VARCHAR(32) NOT NULL, -- 'SUCCESS', 'PERMISSION_DENIED', 'VALIDATION_ERROR', 'CIRCUIT_OPEN', 'RATE_LIMITED', 'FAILED'
    error_message TEXT,
    latency_ms NUMERIC(10, 2) NOT NULL DEFAULT 0.0,
    provenance_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. AI Tool Circuit Breaker State Tracking
CREATE TABLE IF NOT EXISTS public.ai_tool_circuit_breakers (
    tool_id VARCHAR(64) NOT NULL REFERENCES public.ai_tool_definitions(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    state VARCHAR(16) NOT NULL DEFAULT 'CLOSED', -- 'CLOSED', 'OPEN', 'HALF_OPEN'
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    last_failure_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    half_open_until TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tool_id, facility_id)
);

-- 4. Analytical Views for Telemetry & Resilience Monitoring
CREATE OR REPLACE VIEW public.vw_ai_tool_gateway_telemetry AS
SELECT
    facility_id,
    tool_id,
    COUNT(*) AS total_calls,
    COUNT(*) FILTER (WHERE execution_status = 'SUCCESS') AS successful_calls,
    COUNT(*) FILTER (WHERE execution_status = 'PERMISSION_DENIED') AS permission_denials,
    COUNT(*) FILTER (WHERE execution_status = 'VALIDATION_ERROR') AS validation_errors,
    COUNT(*) FILTER (WHERE execution_status = 'CIRCUIT_OPEN') AS circuit_breaker_trips,
    COUNT(*) FILTER (WHERE execution_status = 'RATE_LIMITED') AS rate_limit_throttles,
    ROUND(AVG(latency_ms), 2) AS avg_latency_ms,
    ROUND((COUNT(*) FILTER (WHERE execution_status = 'SUCCESS')::NUMERIC / NULLIF(COUNT(*), 0)::NUMERIC) * 100, 2) AS success_rate_pct
FROM public.ai_tool_executions
GROUP BY facility_id, tool_id;

CREATE OR REPLACE VIEW public.vw_ai_circuit_breaker_health AS
SELECT
    cb.facility_id,
    cb.tool_id,
    td.name AS tool_name,
    td.domain,
    cb.state,
    cb.consecutive_failures,
    cb.last_failure_at,
    cb.opened_at,
    cb.half_open_until
FROM public.ai_tool_circuit_breakers cb
JOIN public.ai_tool_definitions td ON cb.tool_id = td.id;

-- 5. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_ai_tool_executions_facility ON public.ai_tool_executions(facility_id);
CREATE INDEX IF NOT EXISTS idx_ai_tool_executions_tool ON public.ai_tool_executions(tool_id);
CREATE INDEX IF NOT EXISTS idx_ai_tool_executions_status ON public.ai_tool_executions(execution_status);
CREATE INDEX IF NOT EXISTS idx_ai_tool_executions_created ON public.ai_tool_executions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_tool_circuit_facility ON public.ai_tool_circuit_breakers(facility_id, state);

-- 6. Row-Level Security
ALTER TABLE public.ai_tool_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_tool_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_tool_circuit_breakers ENABLE ROW LEVEL SECURITY;

-- Read definitions permitted for authenticated users
CREATE POLICY p_ai_tool_definitions_read ON public.ai_tool_definitions
    FOR SELECT TO authenticated USING (true);

-- Executions strictly isolated by facility tenancy
CREATE POLICY p_ai_tool_executions_tenant ON public.ai_tool_executions
    FOR ALL TO authenticated
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
    WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

-- Circuit breaker states isolated by facility tenancy
CREATE POLICY p_ai_tool_circuit_tenant ON public.ai_tool_circuit_breakers
    FOR ALL TO authenticated
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
    WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);
