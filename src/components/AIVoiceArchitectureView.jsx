/**
 * ==============================================================================
 * Phase C7: AI Voice Architecture & Ephemeral Credential Governance Console
 * Module 12: AI & Intelligence
 * Maestro Clinical Design System: Emerald, Amber, Crimson, Sky, Slate, Neutral
 * Strictly Zero Prohibited Accent Tokens
 * Full Light & Dark Theme Support ([data-theme="dark"])
 * ==============================================================================
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Shield,
  Key,
  ShieldCheck,
  Zap,
  Activity,
  Lock,
  Unlock,
  Volume2,
  VolumeX,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  User,
  Users,
  Search,
  Filter,
  FileText,
  Radio,
  Sliders,
  Sparkles,
  RefreshCw,
  Send
} from 'lucide-react';
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
  getVoiceArchitectureTelemetry
} from '../services/aiVoiceService.js';
import './AIVoiceArchitectureView.css';

export default function AIVoiceArchitectureView({ activeFacility = 'fac-naples-01' }) {
  const [activeTab, setActiveTab] = useState('console'); // 'console', 'tokens', 'boundaries', 'simulator'
  const [selectedSessionId, setSelectedSessionId] = useState('vses-101');
  const [isMicrophoneActive, setIsMicrophoneActive] = useState(true);
  const [isSterileHandsFree, setIsSterileHandsFree] = useState(true);
  const [activeNoiseProfile, setActiveNoiseProfile] = useState('LAMINAR_FLOW_HIGH');
  
  // Simulator State
  const [simQuery, setSimQuery] = useState('Hey Maestro, check my remaining block schedule hours for this Thursday.');
  const [simResult, setSimResult] = useState(null);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);

  // PHI Scrubber Test Bench State
  const [phiInput, setPhiInput] = useState('Verify preference card for patient Johnathan Doe born on 04/12/1972 MRN: 948124.');
  const [phiOutput, setPhiOutput] = useState(null);

  // New Token Form State
  const [newTokenRole, setNewTokenRole] = useState('surgeon');
  const [newTokenMode, setNewTokenMode] = useState('SURGEON_STERILE');
  const [newTokenTtl, setNewTokenTtl] = useState(15);
  const [toastMessage, setToastMessage] = useState(null);

  // Refresh Trigger
  const [refreshKey, setRefreshKey] = useState(0);

  // Load telemetry and queue
  const telemetry = useMemo(() => {
    return getVoiceArchitectureTelemetry(activeFacility);
  }, [activeFacility, refreshKey]);

  const sessions = useMemo(() => {
    return getVoiceSessionQueue(activeFacility);
  }, [activeFacility, refreshKey]);

  const activeTranscripts = useMemo(() => {
    if (!selectedSessionId) return [];
    return getVoiceTranscripts(selectedSessionId);
  }, [selectedSessionId, refreshKey]);

  const selectedSession = useMemo(() => {
    if (!selectedSessionId) return null;
    try {
      return getVoiceSessionDetail(selectedSessionId);
    } catch {
      return null;
    }
  }, [selectedSessionId, refreshKey]);

  // Toast auto-dismiss
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const showToast = (msg) => {
    setToastMessage(msg);
  };

  const handleIssueToken = (e) => {
    e.preventDefault();
    const result = createEphemeralVoiceToken({
      facilityId: activeFacility,
      userId: `usr_${newTokenRole}_${Math.floor(100 + Math.random() * 900)}`,
      userName: newTokenRole === 'surgeon' ? 'Dr. Provider, MD' : 'Clinical Officer',
      userRole: newTokenRole,
      voiceMode: newTokenMode,
      ttlMinutes: parseInt(newTokenTtl, 10)
    });
    setRefreshKey(prev => prev + 1);
    setSelectedSessionId(result.sessionId);
    showToast(`Ephemeral Voice Token Generated: ${result.ephemeralToken} (Valid ${newTokenTtl}m)`);
  };

  const handleRevokeSession = (sessionId) => {
    revokeVoiceSession(sessionId);
    setRefreshKey(prev => prev + 1);
    showToast(`Session ${sessionId} revoked and disconnected.`);
  };

  const handleSimulateVoiceQuery = () => {
    if (!simQuery.trim()) return;
    setIsProcessingVoice(true);
    setTimeout(() => {
      try {
        const res = routeVoiceIntent(selectedSessionId || 'vses-101', simQuery, {
          surgeonId: 'SURG-012'
        });
        setSimResult(res);
        setRefreshKey(prev => prev + 1);
        if (res.actionBlocked) {
          showToast('Prohibited voice mutation intercepted: Re-routed to C6 Dual-Key Queue.');
        } else {
          showToast(`Voice query executed via schema: ${res.toolSchemaId}`);
        }
      } catch (err) {
        showToast(`Voice Error: ${err.message}`);
      } finally {
        setIsProcessingVoice(false);
      }
    }, 450);
  };

  const handleTestPhiScrubber = () => {
    const res = scrubAudioTranscriptPHI(phiInput);
    setPhiOutput(res);
  };

  return (
    <div className="aiv-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="aiv-toast">
          <Sparkles size={16} className="text-emerald" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 5-Card Top KPI Ribbon */}
      <div className="aiv-ribbon">
        <div className="aiv-ribbon-card primary">
          <div className="card-top">
            <span className="card-label">Active Voice Sessions</span>
            <div className="icon-wrapper blue">
              <Radio size={16} />
            </div>
          </div>
          <div className="card-metric">
            {telemetry.activeSessionsCount}
            <span className="metric-unit">/ {telemetry.totalSessionsCount}</span>
          </div>
          <div className="card-footer-info">
            <span>WebRTC Audio Streams</span>
            <span className="status-pill pill-blue">Active Live</span>
          </div>
        </div>

        <div className="aiv-ribbon-card">
          <div className="card-top">
            <span className="card-label">Ephemeral Token Security</span>
            <div className="icon-wrapper emerald">
              <Key size={16} />
            </div>
          </div>
          <div className="card-metric">
            {telemetry.tokenSecurityScorePct}%
            <span className="metric-unit">Zero Permanent Keys</span>
          </div>
          <div className="card-footer-info">
            <span>15-30m Dynamic TTL</span>
            <span className="status-pill pill-success">Enforced</span>
          </div>
        </div>

        <div className="aiv-ribbon-card">
          <div className="card-top">
            <span className="card-label">Audio PHI Redaction</span>
            <div className="icon-wrapper amber">
              <ShieldCheck size={16} />
            </div>
          </div>
          <div className="card-metric">
            {telemetry.phiRedactionRatePct}%
            <span className="metric-unit">Safe Harbor Compliant</span>
          </div>
          <div className="card-footer-info">
            <span>In-Memory Pre-Scrubbing</span>
            <span className="rate-badge">18-Identifier</span>
          </div>
        </div>

        <div className="aiv-ribbon-card">
          <div className="card-top">
            <span className="card-label">Speech-To-Tool Latency</span>
            <div className="icon-wrapper blue">
              <Zap size={16} />
            </div>
          </div>
          <div className="card-metric">
            {telemetry.avgSpeechLatencyMs}
            <span className="metric-unit">ms</span>
          </div>
          <div className="card-footer-info">
            <span>Deterministic Execution</span>
            <span className="rate-badge">&lt; 150ms Barge-in</span>
          </div>
        </div>

        <div className="aiv-ribbon-card">
          <div className="card-top">
            <span className="card-label">Ambient Noise Rejection</span>
            <div className="icon-wrapper emerald">
              <Volume2 size={16} />
            </div>
          </div>
          <div className="card-metric">
            {telemetry.ambientSnrRejectionDb}
            <span className="metric-unit">dB</span>
          </div>
          <div className="card-footer-info">
            <span>Laminar OR Airflow</span>
            <span className="status-pill pill-success">VAD Filtered</span>
          </div>
        </div>
      </div>

      {/* Tabs Row */}
      <div className="aiv-tabs-row">
        <div className="tab-buttons">
          <button
            className={`tab-btn ${activeTab === 'console' ? 'active' : ''}`}
            onClick={() => setActiveTab('console')}
          >
            <Mic size={15} />
            <span>Live Voice Console ({activeTranscripts.length})</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'tokens' ? 'active' : ''}`}
            onClick={() => setActiveTab('tokens')}
          >
            <Key size={15} />
            <span>Ephemeral Credentials ({sessions.length})</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'boundaries' ? 'active' : ''}`}
            onClick={() => setActiveTab('boundaries')}
          >
            <Shield size={15} />
            <span>Role Voice Boundaries</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'simulator' ? 'active' : ''}`}
            onClick={() => setActiveTab('simulator')}
          >
            <Sliders size={15} />
            <span>Voice Command & PHI Simulator</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="btn-sync-refresh"
            onClick={() => {
              setRefreshKey(prev => prev + 1);
              showToast('Voice session telemetry refreshed.');
            }}
          >
            <RefreshCw size={13} />
            <span>Refresh Audio State</span>
          </button>
        </div>
      </div>

      {/* TAB 1: LIVE VOICE CONSOLE */}
      {activeTab === 'console' && (
        <div className="console-layout">
          {/* Audio Waveform & Control Pod */}
          <div className="audio-control-card">
            <div className="card-header-line">
              <div className="flex items-center gap-2">
                <Radio size={16} className="text-emerald" />
                <h2>Real-Time Sterile Voice Pod</h2>
              </div>
              <span className={`status-pill ${selectedSession?.sessionStatus === 'ACTIVE' ? 'pill-success' : 'pill-warn'}`}>
                {selectedSession?.sessionStatus || 'ACTIVE'}
              </span>
            </div>

            {/* Waveform Visualizer */}
            <div className="waveform-box">
              <div className="waveform-bars">
                {[45, 75, 30, 90, 60, 20, 85, 40, 95, 70, 35, 80, 50, 100, 65, 30, 85, 55, 40, 75].map((h, i) => (
                  <span
                    key={i}
                    className={`bar ${isMicrophoneActive ? 'animated' : 'idle'}`}
                    style={{ height: isMicrophoneActive ? `${h}%` : '8%' }}
                  />
                ))}
              </div>
              <div className="waveform-meta">
                <span>Audio Stream: 16kHz PCM 16-bit Mono</span>
                <span>Active Model: Gemini 2.5 Live Multimodal</span>
              </div>
            </div>

            {/* Interactive Hardware Controls */}
            <div className="controls-grid">
              <button
                className={`btn-control ${isMicrophoneActive ? 'active-green' : 'inactive'}`}
                onClick={() => {
                  setIsMicrophoneActive(!isMicrophoneActive);
                  showToast(isMicrophoneActive ? 'Microphone muted.' : 'Microphone active - listening.');
                }}
              >
                {isMicrophoneActive ? <Mic size={16} /> : <MicOff size={16} />}
                <span>{isMicrophoneActive ? 'Microphone On' : 'Microphone Muted'}</span>
              </button>

              <button
                className={`btn-control ${isSterileHandsFree ? 'active-blue' : 'inactive'}`}
                onClick={() => {
                  setIsSterileHandsFree(!isSterileHandsFree);
                  showToast(isSterileHandsFree ? 'Sterile lockout disabled.' : 'Sterile Hands-Free Lockout Engaged.');
                }}
              >
                {isSterileHandsFree ? <Lock size={16} /> : <Unlock size={16} />}
                <span>{isSterileHandsFree ? 'Sterile Field Locked' : 'Touch Screen Enabled'}</span>
              </button>
            </div>

            {/* Session Context Drawer */}
            <div className="session-context-box">
              <div className="ctx-row">
                <span className="ctx-lbl">Active Session</span>
                <span className="ctx-val font-mono text-sky">{selectedSessionId}</span>
              </div>
              <div className="ctx-row">
                <span className="ctx-lbl">Clinician</span>
                <span className="ctx-val">{selectedSession?.userName || 'Dr. Marcus Vance, MD'}</span>
              </div>
              <div className="ctx-row">
                <span className="ctx-lbl">Voice Mode</span>
                <span className="status-pill pill-blue">{selectedSession?.voiceMode || 'SURGEON_STERILE'}</span>
              </div>
              <div className="ctx-row">
                <span className="ctx-lbl">Noise Profile</span>
                <span className="ctx-val">{NOISE_PROFILES[activeNoiseProfile]?.label || 'Laminar High'}</span>
              </div>
              <div className="ctx-row">
                <span className="ctx-lbl">Ephemeral Token</span>
                <span className="ctx-val font-mono text-xs">
                  {selectedSession?.ephemeralTokenHash ? `${selectedSession.ephemeralTokenHash.substring(0, 16)}...` : 'ept_8a1f2b3c...'}
                </span>
              </div>
            </div>
          </div>

          {/* Real-Time Transcript Stream */}
          <div className="transcript-card">
            <div className="card-header-line">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-sky" />
                <h2>Live Transcripts & Deterministic Intent Feed</h2>
              </div>
              <span className="count-tag">{activeTranscripts.length} Turns Recorded</span>
            </div>

            <div className="transcript-feed">
              {activeTranscripts.map((t) => (
                <div
                  key={t.id}
                  className={`transcript-bubble ${t.speakerType === SPEAKER_TYPES.USER ? 'user-turn' : 'assistant-turn'}`}
                >
                  <div className="bubble-header">
                    <span className="speaker-tag">
                      {t.speakerType === SPEAKER_TYPES.USER ? 'Clinician Spoken' : 'Maestro Clinical Voice'}
                    </span>
                    <span className="time-tag">{new Date(t.createdAt).toLocaleTimeString()}</span>
                  </div>

                  <p className="bubble-text">{t.rawTranscriptRedacted}</p>

                  <div className="bubble-footer">
                    <span className="meta-info">
                      Confidence: {Math.round(t.sttConfidence * 100)}% | Duration: {t.audioDurationMs}ms
                    </span>
                    {t.phiRedacted && (
                      <span className="phi-tag">
                        <ShieldCheck size={11} />
                        <span>PHI Redacted ({t.redactionCount})</span>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Quick Hands-Free Spoken Input Simulator */}
            <div className="transcript-input-bar">
              <input
                type="text"
                placeholder='Say: "Hey Maestro, check my remaining block schedule hours for this Thursday..."'
                value={simQuery}
                onChange={(e) => setSimQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSimulateVoiceQuery()}
              />
              <button
                className="btn-send-voice"
                onClick={handleSimulateVoiceQuery}
                disabled={isProcessingVoice}
              >
                {isProcessingVoice ? <Activity size={14} className="spin" /> : <Mic size={14} />}
                <span>Speak</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: EPHEMERAL CREDENTIALS MANAGER */}
      {activeTab === 'tokens' && (
        <div className="tokens-layout">
          {/* Issue New Ephemeral Token Pod */}
          <div className="issue-token-card">
            <div className="card-header-line">
              <div className="flex items-center gap-2">
                <Key size={16} className="text-emerald" />
                <h2>Issue Ephemeral Voice Token</h2>
              </div>
            </div>
            <p className="panel-desc">
              Generate a short-lived cryptographic HMAC token. Master Google AI Studio and WebRTC API keys are never exposed in browser runtime.
            </p>

            <form onSubmit={handleIssueToken} className="token-form">
              <div className="form-group">
                <label className="form-label">Clinical Role</label>
                <select
                  className="form-select"
                  value={newTokenRole}
                  onChange={(e) => setNewTokenRole(e.target.value)}
                >
                  <option value="surgeon">Surgeon (Attending / Chief)</option>
                  <option value="circulating_nurse">Circulating Nurse (OR Suite)</option>
                  <option value="clinical_director">Clinical Administrator / Director</option>
                  <option value="executive">Medical Director / CFO</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Voice Operational Mode</label>
                <select
                  className="form-select"
                  value={newTokenMode}
                  onChange={(e) => setNewTokenMode(e.target.value)}
                >
                  <option value="SURGEON_STERILE">SURGEON_STERILE (Hands-Free Field Lockout)</option>
                  <option value="OR_CIRCULATOR">OR_CIRCULATOR (Turnover & Supplies)</option>
                  <option value="CLINICAL_ADMIN">CLINICAL_ADMIN (Operational Analytics)</option>
                  <option value="EXECUTIVE_AUDIT">EXECUTIVE_AUDIT (Read-Only Financial Spreads)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Token Expiration Window (TTL)</label>
                <select
                  className="form-select"
                  value={newTokenTtl}
                  onChange={(e) => setNewTokenTtl(e.target.value)}
                >
                  <option value="15">15 Minutes (Recommended for OR Sterile Case)</option>
                  <option value="30">30 Minutes (Standard Clinical Shift Block)</option>
                  <option value="60">60 Minutes (Administrative Audit Session)</option>
                </select>
              </div>

              <button type="submit" className="btn-generate-token">
                <Key size={14} />
                <span>Issue Signed Ephemeral Token</span>
              </button>
            </form>

            <div className="security-notice-box">
              <ShieldCheck size={18} className="text-emerald" />
              <div>
                <strong>Zero Persistent Browser Keys:</strong> Ephemeral tokens are cryptographically bound to the authenticated facility session and auto-expire upon surgery completion.
              </div>
            </div>
          </div>

          {/* Active Voice Sessions & Token Table */}
          <div className="sessions-table-card">
            <div className="card-header-line">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-sky" />
                <h2>Active Facility Voice Sessions ({sessions.length})</h2>
              </div>
            </div>

            <div className="table-responsive">
              <table className="aiv-table">
                <thead>
                  <tr>
                    <th>Session ID</th>
                    <th>Clinician & Role</th>
                    <th>Voice Mode</th>
                    <th>Status</th>
                    <th>Expires At</th>
                    <th>Turns</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id} className={s.id === selectedSessionId ? 'selected-row' : ''}>
                      <td>
                        <button
                          className="btn-link-mono"
                          onClick={() => {
                            setSelectedSessionId(s.id);
                            setActiveTab('console');
                          }}
                        >
                          {s.id}
                        </button>
                      </td>
                      <td>
                        <div className="font-semibold">{s.userName}</div>
                        <div className="text-xs text-muted font-mono">{s.userRole}</div>
                      </td>
                      <td>
                        <span className="status-pill pill-blue">{s.voiceMode}</span>
                      </td>
                      <td>
                        <span className={`status-pill ${s.sessionStatus === 'ACTIVE' ? 'pill-success' : s.sessionStatus === 'PAUSED' ? 'pill-warn' : 'pill-red'}`}>
                          {s.sessionStatus}
                        </span>
                      </td>
                      <td>
                        <div className="text-xs">
                          {new Date(s.tokenExpiresAt).toLocaleTimeString()}
                        </div>
                      </td>
                      <td>
                        <span className="font-mono text-xs">{s.transcriptsCount} turns</span>
                      </td>
                      <td>
                        {s.sessionStatus === 'ACTIVE' && (
                          <button
                            className="btn-revoke-action"
                            onClick={() => handleRevokeSession(s.id)}
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ROLE-AWARE VOICE COMMAND BOUNDARIES */}
      {activeTab === 'boundaries' && (
        <div className="boundaries-layout">
          <div className="boundaries-header-card">
            <h2>Role-Aware Interaction & Action Boundaries</h2>
            <p>
              In healthcare operating environments, accidental voice activation must never trigger financial write-offs, fee overrides, or block schedule releases without explicit visual dual-key signoff.
            </p>
          </div>

          <div className="modes-grid">
            {Object.values(VOICE_MODES).map((mode) => (
              <div key={mode.id} className="mode-card">
                <div className="mode-header">
                  <h3>{mode.label}</h3>
                  <code className="mode-tag">{mode.id}</code>
                </div>
                <p className="mode-desc">{mode.description}</p>

                <div className="mode-rules-box">
                  <div className="rule-row">
                    <span className="r-lbl">Hands-Free Hotword</span>
                    <span className="r-val font-mono text-sky">"{mode.hotword}"</span>
                  </div>
                  <div className="rule-row">
                    <span className="r-lbl">Touchscreen Lockout</span>
                    <span className="r-val">{mode.touchLockout ? 'Engaged (Sterile)' : 'Disabled'}</span>
                  </div>
                  <div className="rule-row">
                    <span className="r-lbl">Permitted Query Domains</span>
                    <div className="flex gap-1 flex-wrap">
                      {mode.allowedDomains.map(d => (
                        <span key={d} className="domain-chip">{d}</span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mutation-blocker-box">
                  <XCircle size={14} className="text-crimson" />
                  <span>Consequential Mutations Blocked (Requires C6 Dual-Key)</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: INTERACTIVE VOICE & PHI SIMULATOR */}
      {activeTab === 'simulator' && (
        <div className="simulator-layout">
          {/* Audio PHI Scrubber Test Bench */}
          <div className="sim-panel-card">
            <div className="card-header-line">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald" />
                <h2>Safe Harbor Audio PHI Scrubber Test Bench</h2>
              </div>
            </div>
            <p className="panel-desc">
              Test real-time speech token sanitization. Transcribed audio is scrubbed of all 18 HIPAA Safe Harbor identifiers prior to persistence or LLM synthesis.
            </p>

            <div className="form-group">
              <label className="form-label">Spoken Audio Input Transcript (Contains Sample PHI)</label>
              <textarea
                className="form-textarea"
                rows={3}
                value={phiInput}
                onChange={(e) => setPhiInput(e.target.value)}
              />
            </div>

            <button className="btn-scrub-test" onClick={handleTestPhiScrubber}>
              <ShieldCheck size={14} />
              <span>Scrub Audio Transcript</span>
            </button>

            {phiOutput && (
              <div className="scrubber-results-box">
                <div className="result-header">
                  <span className="font-semibold text-emerald">Sanitized Safe Harbor Transcript:</span>
                  <span className="status-pill pill-success">
                    {phiOutput.redactionCount} PHI Identifiers Redacted
                  </span>
                </div>
                <div className="sanitized-box font-mono">{phiOutput.sanitizedText}</div>
                <div className="redacted-tags flex gap-1 mt-2">
                  {phiOutput.redactedTypes.map((t, idx) => (
                    <span key={idx} className="status-pill pill-warn">{t}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Voice Command & Intent Dispatch Simulator */}
          <div className="sim-panel-card">
            <div className="card-header-line">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-sky" />
                <h2>Spoken Command Intent & Deterministic Router</h2>
              </div>
            </div>
            <p className="panel-desc">
              Test verbal queries against the deterministic C3 tool contracts and verify that mutation attempts are safely intercepted.
            </p>

            <div className="sample-prompts">
              <span className="text-xs font-semibold text-muted">Try Clinical Queries:</span>
              <div className="prompt-chips">
                <button
                  className="chip-btn"
                  onClick={() => setSimQuery('Hey Maestro, check my remaining block schedule hours for this Thursday.')}
                >
                  Block Schedule Query
                </button>
                <button
                  className="chip-btn"
                  onClick={() => setSimQuery('Confirm sterile preference card shaver blade SKU for patient Johnathan Doe.')}
                >
                  Preference Card Shaver SKU
                </button>
                <button
                  className="chip-btn"
                  onClick={() => setSimQuery('Hey Maestro, release 4 unutilized block hours in OR-2 for next Monday.')}
                >
                  Mutation Attempt (Prohibited)
                </button>
              </div>
            </div>

            <div className="form-group mt-3">
              <label className="form-label">Verbal Command Input</label>
              <input
                type="text"
                className="form-input"
                value={simQuery}
                onChange={(e) => setSimQuery(e.target.value)}
              />
            </div>

            <button
              className="btn-execute-voice"
              onClick={handleSimulateVoiceQuery}
              disabled={isProcessingVoice}
            >
              {isProcessingVoice ? <Activity size={14} className="spin" /> : <Play size={14} />}
              <span>Execute Verbal Intent</span>
            </button>

            {simResult && (
              <div className="execution-result-card">
                <div className="result-top">
                  <span className="font-semibold">
                    {simResult.actionBlocked ? 'MUTATION INTERCEPTED' : 'DETERMINISTIC TOOL EXECUTED'}
                  </span>
                  <span className={`status-pill ${simResult.actionBlocked ? 'pill-red' : 'pill-success'}`}>
                    {simResult.toolSchemaId}
                  </span>
                </div>

                <div className="result-spoken-response">
                  <Volume2 size={16} className={simResult.actionBlocked ? 'text-crimson' : 'text-emerald'} />
                  <p>"{simResult.spokenResponse}"</p>
                </div>

                {simResult.verificationHash && (
                  <div className="verification-hash font-mono text-xs">
                    Provenance SHA-256: {simResult.verificationHash}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
