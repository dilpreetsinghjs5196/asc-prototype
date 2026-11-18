# C7 AI VOICE ARCHITECTURE

## Purpose
Voice architecture, secure ephemeral credentials, role-aware interaction boundaries, and HIPAA-compliant audio processing for ambulatory surgical centers.

## Scope
- Define production requirements for real-time bidirectional voice interaction in clinical and surgical environments.
- Provide secure ephemeral credential gating to eliminate persistent client-side API keys.
- Enforce strict role-aware command authorization (Hands-Free Surgeon Sterile Mode vs OR Circulator vs Clinical Executive).
- Guarantee zero audio-driven consequential mutations without explicit graphical dual-key human approval.
- Enforce Safe Harbor 18-identifier PHI redaction on all speech transcripts before storage or downstream synthesis.
- Maintain full compatibility with ASCANALYST multi-tenancy isolation via facility tenancy and PostgreSQL RLS.

## Current State
Prior to Phase C7:
- `src/lib/geminiLive.js`: Prototype bidirectional audio streamer connecting directly to Google AI Studio via WebSocket. Transmits client-stored API keys in WebSocket query parameters (`?key=${apiKey}`), creating a severe credential leak vulnerability. Lacks role awareness, database persistence, and PHI scrubbing.
  - **Classification:** **REFACTOR** into a secure, server-brokered gateway client.
- Client API Key Exposure: Persistent API keys stored in browser `localStorage`.
  - **Classification:** **REPLACE** with server-issued ephemeral session tokens (15–30 minute TTL) and HMAC authentication.
- Voice Database Schema & Audit Logging:
  - **Classification:** **MISSING**. No relational tables exist to track voice sessions, speech transcripts, confidence scores, or voice-triggered tool calls.
- Role-Aware Hands-Free OR Voice Mode:
  - **Classification:** **MISSING**. No guardrails distinguish casual speech from authoritative tool queries, risking inadvertent mutation triggers.

## Target State
Phase C7 establishes an enterprise-grade, HIPAA-compliant voice architecture:
1. **Ephemeral Token Voice Gateway:**
   - Client applications never receive or store master LLM or speech service API keys.
   - The backend issues short-lived, signed session tokens (15-minute TTL) scoped to specific user IDs, facilities, and clinical roles.
2. **Role-Aware Command Boundaries:**
   - **Surgeon Sterile Mode:** Hands-free read-only queries for preference cards, operative times, and room scheduling. Mutations are strictly prohibited over voice.
   - **OR Circulator Mode:** Inventory check, room turnover tracking, and staffing status.
   - **Clinical Admin Mode:** Financial run-rates, case scheduling, and CPT volume queries.
   - **Consequential Intercept:** Voice requests that propose mutations (such as block releases or price overrides) are drafted into the C6 Human Approval Queue but never executed by voice alone.
3. **Real-Time Audio PHI Scrubber:**
   - In-memory streaming transcripts are scrubbed of all Safe Harbor 18-identifier PHI (patient names, MRNs, dates of birth, phone numbers) before audit logging.
4. **Acoustic Noise Rejection & Barge-In:**
   - Ambient surgical suite noise (suction, monitors, laminar airflow) is filtered via Web Audio API bandpass filters and Voice Activity Detection (VAD).
   - Sub-150ms barge-in latency immediately halts Text-to-Speech (TTS) audio playback when a clinician begins speaking.

## Data Model / Schema
PostgreSQL Migration `105_ai_voice_architecture.sql`:
1. `public.ai_voice_sessions`:
   - `id VARCHAR(64) PRIMARY KEY`
   - `facility_id VARCHAR(64) NOT NULL REFERENCES public.facilities(id)`
   - `user_id VARCHAR(64) NOT NULL`
   - `user_role VARCHAR(64) NOT NULL`
   - `voice_mode VARCHAR(40) NOT NULL CHECK (voice_mode IN ('SURGEON_STERILE', 'OR_CIRCULATOR', 'CLINICAL_ADMIN', 'EXECUTIVE_AUDIT'))`
   - `session_status VARCHAR(32) NOT NULL CHECK (session_status IN ('INITIALIZING', 'ACTIVE', 'PAUSED', 'TERMINATED', 'EXPIRED'))`
   - `ephemeral_token_hash VARCHAR(64) NOT NULL`
   - `token_issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `token_expires_at TIMESTAMPTZ NOT NULL`
   - `ambient_noise_profile VARCHAR(32) DEFAULT 'OR_STANDARD'`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
2. `public.ai_voice_transcripts`:
   - `id VARCHAR(64) PRIMARY KEY`
   - `session_id VARCHAR(64) NOT NULL REFERENCES public.ai_voice_sessions(id) ON DELETE CASCADE`
   - `speaker_type VARCHAR(20) NOT NULL CHECK (speaker_type IN ('USER', 'ASSISTANT'))`
   - `raw_transcript_redacted TEXT NOT NULL`
   - `stt_confidence NUMERIC(4, 3) NOT NULL CHECK (stt_confidence BETWEEN 0.0 AND 1.0)`
   - `audio_duration_ms INTEGER NOT NULL DEFAULT 0`
   - `phi_redacted BOOLEAN NOT NULL DEFAULT FALSE`
   - `redaction_count INTEGER NOT NULL DEFAULT 0`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
3. `public.ai_voice_tool_invocations`:
   - `id VARCHAR(64) PRIMARY KEY`
   - `session_id VARCHAR(64) NOT NULL REFERENCES public.ai_voice_sessions(id) ON DELETE CASCADE`
   - `tool_schema_id VARCHAR(64) NOT NULL`
   - `spoken_intent VARCHAR(128) NOT NULL`
   - `extracted_parameters JSONB NOT NULL DEFAULT '{}'::jsonb`
   - `rbac_cleared BOOLEAN NOT NULL DEFAULT TRUE`
   - `execution_latency_ms NUMERIC(8, 2) NOT NULL DEFAULT 0.0`
   - `response_summary TEXT NOT NULL`
   - `verification_hash VARCHAR(64) NOT NULL`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
4. Telemetry View:
   - `public.vw_ai_voice_session_telemetry`: Real-time session counts, token health, latency metrics, and PHI redaction rates aggregated by facility.

## Business Rules
1. **Deterministic Voice Gateways:** Voice transcripts are mapped directly to registered C3 tool schemas. The voice assistant is forbidden from performing mental math or generative financial estimates.
2. **Ephemeral Token Lifecycle:**
   - Maximum token validity is 30 minutes.
   - Tokens are cryptographically bound to `(user_id, facility_id, user_role, issued_at)`.
   - Expired tokens reject any incoming WebSocket audio stream with close code `4401 (Session Expired)`.
3. **Sterile Hands-Free Locking:**
   - In `SURGEON_STERILE` mode, all graphical touch interactions are disabled on the active tablet/monitor to prevent sterile field contamination.
   - Activation hotwords: `"Hey Maestro"`, `"Maestro Status"`, `"Maestro Next"`.
4. **No Ambient Voice Mutations:**
   - Spoken commands attempting to release blocks, alter pricing, or reallocate rooms receive a spoken response: *"This consequential action requires dual-key approval and has been queued in your approval dashboard. It cannot be executed by voice."*
5. **HIPAA Safe Harbor Audio Scrubbing:**
   - All transcribed audio is scanned by the regex-driven Safe Harbor engine before being written to persistent storage or sent to language models.

## Permissions / Security
- `ai.voice_session_start`: Permission required to initialize an ephemeral voice session.
- `ai.voice_surgeon_mode`: Permission for sterile hands-free query execution.
- `ai.voice_admin_mode`: Permission for operational administrative voice navigation.
- All database queries and tool executions run under the authenticated user's existing RBAC privileges.

## API / Service Requirements
- `createEphemeralVoiceToken(facilityId, userContext)`: Issues a 15-minute cryptographically signed session token.
- `getVoiceSessionQueue(facilityId)`: Retrieves active and past voice sessions with telemetry.
- `scrubAudioTranscriptPHI(transcript)`: Real-time redaction of patient names, MRNs, dates, and phone numbers.
- `routeVoiceIntentToTool(sessionContext, spokenText)`: Maps spoken clinician questions to deterministic C3 tools with parameter extraction.
- `getVoiceArchitectureTelemetry(facilityId)`: Computes active sessions, token security status, PHI redaction rate, and average latency.

## UI / Workflow Requirements
- **Top Ribbon KPI Ribbon (5 Cards):** Active Voice Sessions, Ephemeral Token Security, Audio PHI Redaction Rate, Speech-to-Tool Latency, Ambient Noise Rejection (SNR).
- **Tab 1: Live Voice Session Console:**
   - Real-time Web Audio API waveform visualizer.
   - Sterile Hands-Free OR toggle with ambient noise filtering switch.
   - Live speech transcript feed with color-coded speaker turns and confidence scores.
- **Tab 2: Ephemeral Token Security Manager:**
   - Token issuance console with live countdown timer and instant revocation button.
   - Token payload inspector verifying absence of permanent API keys.
- **Tab 3: Role-Aware Voice Command Boundary Matrix:**
   - Interactive permission matrix mapping clinical roles to permitted speech intents.
   - Clear indicators showing blocked mutation pathways.
- **Tab 4: Interactive Voice Command Simulator:**
   - Spoken audio test bench with clinical sample intents (`"Check Dr. Marcus Vance block utilization"`, `"Lookup preference card for shaver blade"`).
   - Real-time PHI scrubber test input demonstrating instant Safe Harbor token replacement.

## Audit / Provenance
- All voice-triggered tool calls record the `session_id`, `speaker_type`, raw redacted transcript, latency, and a SHA-256 provenance hash.
- Unredacted audio waveforms are never written to disk or persistent general storage.

## QA / Test Cases
1. Ephemeral token issuance generates valid 64-char HMAC hashes and enforces 15-minute TTL.
2. Expired tokens throw `TOKEN_EXPIRED_ERROR`.
3. Safe Harbor PHI scrubber redacts patient names, MRNs, DOBs, and SSNs.
4. Role boundary rejects mutation commands in `SURGEON_STERILE` mode.
5. Deterministic tool routing accurately extracts parameters for C3 schemas.
6. SQL migration 105 UP creates all tables, constraints, views, and RLS policies.
7. SQL migration 105 DOWN cleanly removes all tables and views without residual locks.
8. Zero-purple design compliance verified across JSX, CSS, and service files.

## Acceptance Criteria
- Build passes cleanly with zero errors.
- All 13+ voice architecture automated tests pass.
- Full regression suite passes with 100% success rate.
- Zero client-side API key exposure in live voice WebSocket connections.

## Dependencies
- Phase C1 (AI Tool Gateway & Dispatcher)
- Phase C2 (AI Permissions & Action Boundaries)
- Phase C3 (AI Tool Definitions & Schemas)
- Phase C6 (AI Human Approval Governance)

## Definition of Done
Complete when data model, migration 105, service layer, UI console with waveform visualizer, comprehensive test suite, App.jsx wiring, and documentation are all implemented and verified.

## Implementation Notes
- Migration: `supabase/migrations/105_ai_voice_architecture.sql` and `105_ai_voice_architecture_down.sql`
- Service: `src/services/aiVoiceService.js` and `src/lib/aiVoiceService.js`
- UI: `src/components/AIVoiceArchitectureView.jsx` and `src/components/AIVoiceArchitectureView.css`
- Tests: `tests/ai-voice-architecture.test.js`
