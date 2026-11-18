-- ==============================================================================
-- Migration 105: AI Voice Architecture, Ephemeral Credentials & Role Boundaries
-- Phase C7: Module 12 AI & Intelligence
-- ==============================================================================

-- 1. Voice Sessions Table
CREATE TABLE IF NOT EXISTS public.ai_voice_sessions (
    id VARCHAR(64) PRIMARY KEY,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL,
    user_role VARCHAR(64) NOT NULL,
    voice_mode VARCHAR(40) NOT NULL CHECK (voice_mode IN ('SURGEON_STERILE', 'OR_CIRCULATOR', 'CLINICAL_ADMIN', 'EXECUTIVE_AUDIT')),
    session_status VARCHAR(32) NOT NULL DEFAULT 'INITIALIZING' CHECK (session_status IN ('INITIALIZING', 'ACTIVE', 'PAUSED', 'TERMINATED', 'EXPIRED')),
    ephemeral_token_hash VARCHAR(64) NOT NULL,
    token_issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    token_expires_at TIMESTAMPTZ NOT NULL,
    ambient_noise_profile VARCHAR(32) NOT NULL DEFAULT 'OR_STANDARD',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_voice_sessions_facility ON public.ai_voice_sessions(facility_id, session_status);
CREATE INDEX IF NOT EXISTS idx_ai_voice_sessions_user ON public.ai_voice_sessions(user_id, token_expires_at);

-- 2. Voice Transcripts Table (Streaming turns with Safe Harbor PHI scrubbing)
CREATE TABLE IF NOT EXISTS public.ai_voice_transcripts (
    id VARCHAR(64) PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL REFERENCES public.ai_voice_sessions(id) ON DELETE CASCADE,
    speaker_type VARCHAR(20) NOT NULL CHECK (speaker_type IN ('USER', 'ASSISTANT')),
    raw_transcript_redacted TEXT NOT NULL,
    stt_confidence NUMERIC(4, 3) NOT NULL CHECK (stt_confidence BETWEEN 0.0 AND 1.0),
    audio_duration_ms INTEGER NOT NULL DEFAULT 0,
    phi_redacted BOOLEAN NOT NULL DEFAULT FALSE,
    redaction_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_voice_transcripts_session ON public.ai_voice_transcripts(session_id, created_at);

-- 3. Voice Tool Invocations Table (Spoken queries routed to deterministic C3 schemas)
CREATE TABLE IF NOT EXISTS public.ai_voice_tool_invocations (
    id VARCHAR(64) PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL REFERENCES public.ai_voice_sessions(id) ON DELETE CASCADE,
    tool_schema_id VARCHAR(64) NOT NULL,
    spoken_intent VARCHAR(128) NOT NULL,
    extracted_parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    rbac_cleared BOOLEAN NOT NULL DEFAULT TRUE,
    execution_latency_ms NUMERIC(8, 2) NOT NULL DEFAULT 0.0,
    response_summary TEXT NOT NULL,
    verification_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_voice_invocations_session ON public.ai_voice_tool_invocations(session_id, tool_schema_id);

-- 4. Facility Telemetry Aggregation View
CREATE OR REPLACE VIEW public.vw_ai_voice_session_telemetry AS
SELECT
    s.facility_id,
    COUNT(DISTINCT s.id) AS total_sessions_count,
    COUNT(DISTINCT CASE WHEN s.session_status = 'ACTIVE' THEN s.id END) AS active_sessions_count,
    COUNT(DISTINCT t.id) AS total_transcripts_count,
    COUNT(DISTINCT CASE WHEN t.phi_redacted = TRUE THEN t.id END) AS phi_redacted_transcripts_count,
    COALESCE(ROUND(AVG(t.stt_confidence) * 100, 1), 0.0) AS avg_stt_confidence_pct,
    COUNT(DISTINCT i.id) AS total_voice_tool_invocations,
    COALESCE(ROUND(AVG(i.execution_latency_ms), 1), 0.0) AS avg_tool_latency_ms
FROM public.ai_voice_sessions s
LEFT JOIN public.ai_voice_transcripts t ON s.id = t.session_id
LEFT JOIN public.ai_voice_tool_invocations i ON s.id = i.session_id
GROUP BY s.facility_id;

-- 5. Row-Level Security (Multi-Tenancy Isolation)
ALTER TABLE public.ai_voice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_voice_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_voice_tool_invocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_voice_sessions_facility_isolation
ON public.ai_voice_sessions
FOR ALL
USING (
    facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
)
WITH CHECK (
    facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
);

CREATE POLICY ai_voice_transcripts_facility_isolation
ON public.ai_voice_transcripts
FOR ALL
USING (
    session_id IN (
        SELECT id FROM public.ai_voice_sessions
        WHERE facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
    )
);

CREATE POLICY ai_voice_tool_invocations_facility_isolation
ON public.ai_voice_tool_invocations
FOR ALL
USING (
    session_id IN (
        SELECT id FROM public.ai_voice_sessions
        WHERE facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
    )
);
