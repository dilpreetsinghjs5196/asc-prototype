-- ==============================================================================
-- Rollback Migration 105: AI Voice Architecture
-- ==============================================================================

DROP VIEW IF EXISTS public.vw_ai_voice_session_telemetry;

DROP POLICY IF EXISTS ai_voice_tool_invocations_facility_isolation ON public.ai_voice_tool_invocations;
DROP POLICY IF EXISTS ai_voice_transcripts_facility_isolation ON public.ai_voice_transcripts;
DROP POLICY IF EXISTS ai_voice_sessions_facility_isolation ON public.ai_voice_sessions;

DROP TABLE IF EXISTS public.ai_voice_tool_invocations CASCADE;
DROP TABLE IF EXISTS public.ai_voice_transcripts CASCADE;
DROP TABLE IF EXISTS public.ai_voice_sessions CASCADE;
