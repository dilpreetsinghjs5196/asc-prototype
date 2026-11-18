/**
 * ==============================================================================
 * Phase C7 Test Suite: AI Voice Architecture & Ephemeral Credential Governance
 * Module 12: AI & Intelligence
 * Tests: Ephemeral token generation, TTL enforcement, session lifecycle,
 *        Safe Harbor audio PHI scrubbing, role-aware intent routing,
 *        mutation blocking, migration 105 SQL integrity, and zero-purple compliance.
 * ==============================================================================
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  VOICE_MODES,
  SESSION_STATUSES,
  SPEAKER_TYPES,
  NOISE_PROFILES,
  getVoiceSessionQueue,
  getVoiceSessionDetail,
  createEphemeralVoiceToken,
  revokeVoiceSession,
  getVoiceTranscripts,
  routeVoiceIntent,
  scrubAudioTranscriptPHI,
  getVoiceArchitectureTelemetry,
  resetVoiceStore,
  computeHash
} from '../src/services/aiVoiceService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase C7: AI Voice Architecture & Ephemeral Credential Governance', () => {

  beforeEach(() => {
    resetVoiceStore();
  });

  test('1. Voice Architecture Telemetry returns accurate facility KPIs', () => {
    const telemetry = getVoiceArchitectureTelemetry('fac-naples-01');
    assert.ok(telemetry.activeSessionsCount >= 0, 'Active sessions should be non-negative');
    assert.strictEqual(telemetry.tokenSecurityScorePct, 100.0, 'Token security score must be 100% (zero persistent keys)');
    assert.strictEqual(telemetry.phiRedactionRatePct, 100.0, 'PHI redaction rate must be 100%');
    assert.ok(telemetry.avgSpeechLatencyMs > 0, 'Speech latency should be positive');
    assert.ok(telemetry.ambientSnrRejectionDb > 0, 'Ambient SNR rejection should be positive');
  });

  test('2. Ephemeral Voice Token generation creates valid session and 15m expiration', () => {
    const result = createEphemeralVoiceToken({
      facilityId: 'fac-naples-01',
      userId: 'usr_surg_test',
      userName: 'Dr. Test Provider',
      userRole: 'surgeon',
      voiceMode: 'SURGEON_STERILE',
      ttlMinutes: 15
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.sessionId.startsWith('vses-'), 'Session ID must start with vses-');
    assert.ok(result.ephemeralToken.startsWith('ept_'), 'Token should have ept_ prefix');
    assert.strictEqual(result.tokenHash.length, 64, 'Token hash must be 64-char SHA-256');

    const expiresAt = new Date(result.tokenExpiresAt);
    const now = new Date();
    const diffMins = (expiresAt.getTime() - now.getTime()) / (1000 * 60);
    assert.ok(diffMins >= 14.0 && diffMins <= 16.0, 'Expiration must be ~15 minutes');

    const session = getVoiceSessionDetail(result.sessionId);
    assert.strictEqual(session.sessionStatus, SESSION_STATUSES.ACTIVE);
    assert.strictEqual(session.voiceMode, 'SURGEON_STERILE');
  });

  test('3. Voice Session Queue retrieves sessions and auto-expires elapsed tokens', () => {
    const queue = getVoiceSessionQueue('fac-naples-01');
    assert.ok(Array.isArray(queue), 'Queue must return an array');
    assert.ok(queue.length >= 3, 'Must contain seeded sessions');

    // Create a pre-expired session
    const expiredRes = createEphemeralVoiceToken({
      facilityId: 'fac-naples-01',
      userId: 'usr_expired',
      ttlMinutes: -5 // expired 5 minutes ago
    });

    const refreshedQueue = getVoiceSessionQueue('fac-naples-01');
    const expiredSession = refreshedQueue.find(s => s.id === expiredRes.sessionId);
    assert.strictEqual(expiredSession.sessionStatus, SESSION_STATUSES.EXPIRED, 'Elapsed session must auto-expire');
  });

  test('4. Revoking a voice session transitions status to TERMINATED', () => {
    const tokenRes = createEphemeralVoiceToken({
      facilityId: 'fac-naples-01',
      userId: 'usr_to_revoke'
    });

    const revokeRes = revokeVoiceSession(tokenRes.sessionId);
    assert.strictEqual(revokeRes.success, true);
    assert.strictEqual(revokeRes.status, SESSION_STATUSES.TERMINATED);

    const session = getVoiceSessionDetail(tokenRes.sessionId);
    assert.strictEqual(session.sessionStatus, SESSION_STATUSES.TERMINATED);
  });

  test('5. Safe Harbor Audio PHI Scrubber: redacts MRN, SSN, Phone, DOB, and Names', () => {
    const rawSpeech = 'Check operative notes for patient Jonathan Doe born on 04/12/1980 with MRN: 948123 and phone 555-123-4567, SSN 123-45-6789.';
    const result = scrubAudioTranscriptPHI(rawSpeech);

    assert.strictEqual(result.wasRedacted, true);
    assert.strictEqual(result.redactionCount, 5);
    assert.ok(result.sanitizedText.includes('[REDACTED_PATIENT]'), 'Should redact patient name');
    assert.ok(result.sanitizedText.includes('[REDACTED_DOB]'), 'Should redact DOB');
    assert.ok(result.sanitizedText.includes('[REDACTED_MRN]'), 'Should redact MRN');
    assert.ok(result.sanitizedText.includes('[REDACTED_PHONE]'), 'Should redact phone');
    assert.ok(result.sanitizedText.includes('[REDACTED_SSN]'), 'Should redact SSN');
  });

  test('6. Route Voice Intent matches clinical queries to deterministic C3 tool contracts', () => {
    // 1. Shaver blade preference card query
    const res1 = routeVoiceIntent('vses-101', 'Confirm sterile preference card shaver blade SKU for meniscectomy.');
    assert.strictEqual(res1.success, true);
    assert.strictEqual(res1.toolSchemaId, 'case_cost_composition');
    assert.ok(res1.spokenResponse.includes('Stryker 4.0mm Aggressive'), 'Response should cite exact SKU');
    assert.strictEqual(res1.verificationHash.length, 64, 'Must generate SHA-256 provenance hash');

    // 2. Block schedule query
    const res2 = routeVoiceIntent('vses-101', 'Hey Maestro, check my remaining block schedule hours for this Thursday.');
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.toolSchemaId, 'surgeon_block_schedule_query');
    assert.ok(res2.spokenResponse.includes('88.2% block utilization'), 'Response should report block utilization');

    // 3. Surgeon scorecard query
    const res3 = routeVoiceIntent('vses-101', 'Show my surgeon scorecard and contribution margin per OR hour.');
    assert.strictEqual(res3.success, true);
    assert.strictEqual(res3.toolSchemaId, 'surgeon_scorecard_query');
    assert.ok(res3.spokenResponse.includes('$2,840'), 'Response should cite margin per OR hour');
  });

  test('7. Prohibited Voice Mutations: block releases and price overrides are strictly intercepted', () => {
    const mutationAttempt = routeVoiceIntent('vses-101', 'Hey Maestro, release 4 unutilized block hours in OR-2 for next Monday.');

    assert.strictEqual(mutationAttempt.success, false);
    assert.strictEqual(mutationAttempt.actionBlocked, true);
    assert.strictEqual(mutationAttempt.intentMatched, 'PROHIBITED_VOICE_MUTATION');
    assert.ok(mutationAttempt.spokenResponse.includes('Dual-Key Human Approval'), 'Voice must state dual-key requirement');
  });

  test('8. Route Voice Intent throws error when ephemeral token is expired', () => {
    const expiredRes = createEphemeralVoiceToken({
      facilityId: 'fac-naples-01',
      userId: 'usr_exp_intent',
      ttlMinutes: -10
    });

    assert.throws(() => {
      routeVoiceIntent(expiredRes.sessionId, 'Check room status.');
    }, /TOKEN_EXPIRED_ERROR/);
  });

  test('9. Route Voice Intent throws error when voice session is inactive/paused', () => {
    assert.throws(() => {
      routeVoiceIntent('vses-103', 'Check room status.'); // vses-103 is PAUSED
    }, /VOICE_SESSION_INACTIVE/);
  });

  test('10. Voice Modes specification accurately defines sterile lockout and hotwords', () => {
    assert.strictEqual(VOICE_MODES.SURGEON_STERILE.touchLockout, true, 'Surgeon sterile mode must lock touch');
    assert.strictEqual(VOICE_MODES.SURGEON_STERILE.requiresHotword, true);
    assert.strictEqual(VOICE_MODES.SURGEON_STERILE.hotword, 'Hey Maestro');

    assert.strictEqual(VOICE_MODES.OR_CIRCULATOR.touchLockout, false);
    assert.strictEqual(VOICE_MODES.CLINICAL_ADMIN.touchLockout, false);
  });

  test('11. Database Migration 105 SQL UP and DOWN integrity', () => {
    const upSqlPath = path.resolve(__dirname, '../supabase/migrations/105_ai_voice_architecture.sql');
    const downSqlPath = path.resolve(__dirname, '../supabase/migrations/105_ai_voice_architecture_down.sql');

    assert.ok(fs.existsSync(upSqlPath), '105 UP migration file must exist');
    assert.ok(fs.existsSync(downSqlPath), '105 DOWN migration file must exist');

    const upSql = fs.readFileSync(upSqlPath, 'utf8');
    const downSql = fs.readFileSync(downSqlPath, 'utf8');

    assert.ok(upSql.includes('ai_voice_sessions'), 'UP migration must create ai_voice_sessions');
    assert.ok(upSql.includes('ai_voice_transcripts'), 'UP migration must create ai_voice_transcripts');
    assert.ok(upSql.includes('ai_voice_tool_invocations'), 'UP migration must create ai_voice_tool_invocations');
    assert.ok(upSql.includes('vw_ai_voice_session_telemetry'), 'UP migration must create telemetry view');
    assert.ok(upSql.includes('ENABLE ROW LEVEL SECURITY'), 'UP migration must enable RLS');

    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.ai_voice_sessions CASCADE'), 'DOWN migration must drop ai_voice_sessions');
    assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_ai_voice_session_telemetry'), 'DOWN migration must drop view');
  });

  test('12. Zero-purple design system compliance in C7 components and styles', () => {
    const jsxPath = path.resolve(__dirname, '../src/components/AIVoiceArchitectureView.jsx');
    const cssPath = path.resolve(__dirname, '../src/components/AIVoiceArchitectureView.css');
    const srvPath = path.resolve(__dirname, '../src/services/aiVoiceService.js');

    const jsxContent = fs.readFileSync(jsxPath, 'utf8');
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    const srvContent = fs.readFileSync(srvPath, 'utf8');

    const prohibitedTokens = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];

    prohibitedTokens.forEach(token => {
      const regex = new RegExp(`\\b${token}\\b`, 'i');
      assert.strictEqual(regex.test(jsxContent), false, `AIVoiceArchitectureView.jsx contains prohibited token "${token}"`);
      assert.strictEqual(regex.test(cssContent), false, `AIVoiceArchitectureView.css contains prohibited token "${token}"`);
      assert.strictEqual(regex.test(srvContent), false, `aiVoiceService.js contains prohibited token "${token}"`);
    });
  });

  test('13. App Shell Navigation & Wiring verification for C7', () => {
    const appPath = path.resolve(__dirname, '../src/App.jsx');
    const appContent = fs.readFileSync(appPath, 'utf8');

    assert.ok(appContent.includes("import AIVoiceArchitectureView from './components/AIVoiceArchitectureView';"), 'App.jsx must import AIVoiceArchitectureView');
    assert.ok(appContent.includes("activeTab === 'ai_voice_architecture'"), 'App.jsx must handle ai_voice_architecture activeTab');
    assert.ok(appContent.includes("<AIVoiceArchitectureView activeFacility={activeFacility} />"), 'App.jsx must render AIVoiceArchitectureView');
    assert.ok(appContent.includes("'ai_voice_architecture'"), 'App.jsx must exclude ai_voice_architecture from generic date filters');
  });

});
