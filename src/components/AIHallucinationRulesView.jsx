/**
 * ==============================================================================
 * Phase C5: AI Hallucination Rules, Deterministic Number Governance Console
 * Module 12: AI & Intelligence
 * Maestro Clinical Design System: Emerald, Amber, Crimson, Sky, Slate, Neutral
 * Strictly Zero Prohibited Accent Tokens
 * Full Light & Dark Theme Support ([data-theme="dark"])
 * ==============================================================================
 */

import React, { useState, useMemo } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  Activity,
  Shield,
  FileWarning,
  HelpCircle,
  Play,
  Search,
  Filter,
  Check,
  X,
  Code2,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  Sliders,
  FileText
} from 'lucide-react';
import {
  GUARDRAILS_CATALOG,
  INTERCEPT_TYPES,
  ACTIONS_TAKEN,
  UNKNOWN_TEMPLATES,
  getGuardrailCatalog,
  getInterceptLogs,
  getHallucinationTelemetry,
  validateAiResponse,
  generateStructuredUnknown
} from '../services/aiHallucinationRulesService.js';
import './AIHallucinationRulesView.css';

export default function AIHallucinationRulesView({ activeFacility = 'fac-naples-01' }) {
  const [activeTab, setActiveTab] = useState('policies'); // 'policies', 'intercepts', 'unknown', 'sandbox'
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [interceptTypeFilter, setInterceptTypeFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Sandbox State
  const [sandboxPrompt, setSandboxPrompt] = useState('What was our total allowable reimbursement and underpayment on Case #2026-9041?');
  const [sandboxCandidateText, setSandboxCandidateText] = useState('According to our estimation, total allowable reimbursement on Case #2026-9041 was approximately $4,500.00 from Aetna, leaving an underpayment of $1,240.50.');
  const [sandboxGroundTruth, setSandboxGroundTruth] = useState('5100.00, 3859.50, 1240.50, 14200.00');
  const [sandboxResult, setSandboxResult] = useState(null);

  const telemetry = useMemo(() => {
    return getHallucinationTelemetry(activeFacility);
  }, [activeFacility, toastMessage]);

  const guardrails = useMemo(() => {
    return getGuardrailCatalog().filter(r => {
      if (categoryFilter !== 'ALL' && r.category !== categoryFilter) return false;
      return true;
    });
  }, [categoryFilter]);

  const interceptLogs = useMemo(() => {
    return getInterceptLogs(activeFacility, {
      type: interceptTypeFilter,
      searchQuery
    });
  }, [activeFacility, interceptTypeFilter, searchQuery, toastMessage]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleTestSandbox = (preset) => {
    let candText = sandboxCandidateText;
    let truthNums = sandboxGroundTruth.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));

    if (preset === 'clean') {
      candText = 'Under contract CTR-AETNA-SEC4 [E-102], contracted allowable on Case #2026-9041 is $5,100.00, adjudicated payment is $3,859.50 [E-101], leaving a verified underpayment of $1,240.50.';
      truthNums = [5100.00, 3859.50, 1240.50];
      setSandboxCandidateText(candText);
      setSandboxGroundTruth('5100.00, 3859.50, 1240.50');
    } else if (preset === 'cpt') {
      candText = 'We recommend submitting unlisted surgical meniscus code 99999 with modifier 59 to capture maximum reimbursement.';
      setSandboxCandidateText(candText);
    } else if (preset === 'directive') {
      candText = 'For severe post-op pain, administer 10mg IV Ketorolac immediately and apply ice to the joint.';
      setSandboxCandidateText(candText);
    } else if (preset === 'ungrounded') {
      candText = 'Total allowable reimbursement on Case #2026-9041 was estimated at $4,500.00 from Aetna.';
      truthNums = [5100.00, 3859.50, 1240.50];
      setSandboxCandidateText(candText);
      setSandboxGroundTruth('5100.00, 3859.50, 1240.50');
    }

    const result = validateAiResponse(candText, {
      numbers: truthNums,
      rawPrompt: sandboxPrompt,
      fallbackText: 'Response intercepted: The stated numbers did not match authoritative contract records.'
    });

    setSandboxResult(result);
  };

  return (
    <div className="aihr-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="aihr-toast">
          <CheckCircle2 size={16} className="text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 5-Card Top Metric Ribbon (Maestro Clinical) */}
      <div className="aihr-ribbon">
        <div className="aihr-ribbon-card primary">
          <div className="card-top">
            <span className="card-label">Active Guardrails</span>
            <div className="icon-wrapper blue"><ShieldAlert size={16} /></div>
          </div>
          <div className="card-metric">{telemetry.activeGuardrails} <span className="metric-unit">Policies</span></div>
          <div className="card-footer-info">
            <span>Server-Authoritative</span>
            <span className="status-pill pill-blue">Zero Drift</span>
          </div>
        </div>

        <div className="aihr-ribbon-card">
          <div className="card-top">
            <span className="card-label">Blocked Fabrications</span>
            <div className="icon-wrapper amber"><AlertTriangle size={16} /></div>
          </div>
          <div className="card-metric">{telemetry.totalIntercepted} <span className="metric-unit">Intercepts</span></div>
          <div className="card-footer-info">
            <span>Audit Trail Preserved</span>
            <span className="status-pill pill-warn">Protected</span>
          </div>
        </div>

        <div className="aihr-ribbon-card">
          <div className="card-top">
            <span className="card-label">Intercept Efficacy</span>
            <div className="icon-wrapper emerald"><ShieldCheck size={16} /></div>
          </div>
          <div className="card-metric">{telemetry.interceptEfficacyPct}% <span className="metric-unit">Success</span></div>
          <div className="card-footer-info">
            <span>Zero Hallucination Leak</span>
            <span className="status-pill pill-success">100% Gated</span>
          </div>
        </div>

        <div className="aihr-ribbon-card">
          <div className="card-top">
            <span className="card-label">Number Scrubber</span>
            <div className="icon-wrapper emerald"><CheckCircle2 size={16} /></div>
          </div>
          <div className="card-metric">{telemetry.numberScrubberHealthPct}% <span className="metric-unit">Verified</span></div>
          <div className="card-footer-info">
            <span>Phase C4 Citation Grounding</span>
            <span className="status-pill pill-success">Strict Math</span>
          </div>
        </div>

        <div className="aihr-ribbon-card">
          <div className="card-top">
            <span className="card-label">Scrubber Latency</span>
            <div className="icon-wrapper blue"><Activity size={16} /></div>
          </div>
          <div className="card-metric">{telemetry.avgScrubberLatencyMs} <span className="metric-unit">ms</span></div>
          <div className="card-footer-info">
            <span>AST Token Evaluation</span>
            <span className="rate-badge">Real-Time</span>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="aihr-tabs-row">
        <div className="tab-buttons">
          <button
            className={`tab-btn ${activeTab === 'policies' ? 'active' : ''}`}
            onClick={() => setActiveTab('policies')}
          >
            <Shield size={16} />
            <span>Active Guardrail Policies ({telemetry.activeGuardrails})</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'intercepts' ? 'active' : ''}`}
            onClick={() => setActiveTab('intercepts')}
          >
            <FileWarning size={16} />
            <span>Intercept Audit Logs ({telemetry.totalIntercepted})</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'unknown' ? 'active' : ''}`}
            onClick={() => setActiveTab('unknown')}
          >
            <HelpCircle size={16} />
            <span>Unknown Handling Protocol</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'sandbox' ? 'active' : ''}`}
            onClick={() => setActiveTab('sandbox')}
          >
            <Play size={16} />
            <span>Anti-Fabrication Validator Sandbox</span>
          </button>
        </div>
      </div>

      {/* TAB 1: GUARDRAIL POLICIES */}
      {activeTab === 'policies' && (
        <div className="tab-pane">
          {/* Category Filter Pills */}
          <div className="policy-filter-bar">
            <div className="category-pills">
              {['ALL', 'ARITHMETIC', 'EVIDENCE_GROUNDING', 'UNKNOWN_HANDLING', 'TERMINOLOGY', 'SAFETY'].map(cat => (
                <button
                  key={cat}
                  className={`cat-pill ${categoryFilter === cat ? 'active' : ''}`}
                  onClick={() => setCategoryFilter(cat)}
                >
                  {cat === 'ALL' ? 'ALL POLICIES' : cat.replace('_', ' ')}
                </button>
              ))}
            </div>
            <div className="policy-badge-info">
              <span>All 10 Server-Side Guardrails Active</span>
            </div>
          </div>

          {/* Policies Grid */}
          <div className="policies-grid">
            {guardrails.map((rule) => (
              <div key={rule.id} className="policy-card">
                <div className="policy-top">
                  <span className={`cat-tag cat-${rule.category.toLowerCase()}`}>
                    {rule.category.replace('_', ' ')}
                  </span>
                  <span className="severity-badge-block">
                    {rule.severity}
                  </span>
                </div>

                <h3 className="policy-name">{rule.name}</h3>
                <code className="policy-id font-mono">{rule.id}</code>
                <p className="policy-desc">{rule.description}</p>

                <div className="policy-meta-grid">
                  <div className="meta-item">
                    <span className="meta-lbl">Confidence Gate</span>
                    <span className="meta-val text-emerald">{rule.confidenceThreshold}% Min</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-lbl">Enforcement</span>
                    <span className="meta-val text-sky">Server Pre-Dispatch</span>
                  </div>
                </div>

                <div className="policy-footer">
                  <span className="status-indicator">
                    <span className="status-dot green"></span>
                    <span>Active & Enforcing</span>
                  </span>
                  <button
                    className="btn-test-rule"
                    onClick={() => {
                      setActiveTab('sandbox');
                      if (rule.id === 'RULE-CPT-VALIDATION') handleTestSandbox('cpt');
                      else if (rule.id === 'RULE-NON-CLINICAL-DIRECTIVE') handleTestSandbox('directive');
                      else handleTestSandbox('ungrounded');
                    }}
                  >
                    Test Rule
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: INTERCEPT AUDIT LOGS */}
      {activeTab === 'intercepts' && (
        <div className="tab-pane">
          <div className="intercept-filter-bar">
            <div className="type-pills">
              {['ALL', ...Object.values(INTERCEPT_TYPES)].map(t => (
                <button
                  key={t}
                  className={`type-pill ${interceptTypeFilter === t ? 'active' : ''}`}
                  onClick={() => setInterceptTypeFilter(t)}
                >
                  {t === 'ALL' ? 'ALL INTERCEPTS' : t.replace(/_/g, ' ')}
                </button>
              ))}
            </div>

            <div className="search-box">
              <Search size={15} className="search-icon" />
              <input
                type="text"
                placeholder="Search raw prompt, tokens, session..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="intercepts-table-card">
            <table className="intercepts-table">
              <thead>
                <tr>
                  <th>Session / Timestamp</th>
                  <th>Triggered Guardrail</th>
                  <th>Intercept Type</th>
                  <th>Flagged Hallucinated Token</th>
                  <th>Action Taken</th>
                  <th>Inspect</th>
                </tr>
              </thead>
              <tbody>
                {interceptLogs.map((log) => (
                  <tr key={log.id} onClick={() => setSelectedIncident(log)}>
                    <td>
                      <div className="session-col">
                        <code className="font-mono text-sky">{log.sessionId}</code>
                        <span className="text-muted text-xs">
                          {new Date(log.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="rule-col">
                        <strong>{log.ruleId}</strong>
                      </div>
                    </td>
                    <td>
                      <span className={`type-badge type-${log.interceptType.toLowerCase()}`}>
                        {log.interceptType.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>
                      <div className="tokens-cell">
                        {log.flaggedTokens.map((ft, idx) => (
                          <span key={idx} className="flagged-token-tag">
                            {ft.token}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span className="status-pill pill-warn">
                        {log.actionTaken.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn-inspect-incident"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedIncident(log);
                        }}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: UNKNOWN HANDLING PROTOCOL */}
      {activeTab === 'unknown' && (
        <div className="tab-pane">
          <div className="unknown-protocol-card">
            <div className="unknown-header">
              <HelpCircle size={22} className="text-sky-400" />
              <div>
                <h2>Strict Unknown Handling Protocol ("I Do Not Know")</h2>
                <p>
                  When asked about records, uncontracted commercial payers, or unestablished clinical parameters, the AI Analyst is prohibited from fabricating speculative figures. It must strictly adhere to the structured response templates below.
                </p>
              </div>
            </div>

            <div className="templates-grid">
              {Object.entries(UNKNOWN_TEMPLATES).map(([key, tpl]) => {
                const sampleOutput = tpl.buildResponse('Case #2026-99999');
                return (
                  <div key={key} className="template-card">
                    <div className="template-top">
                      <span className="tpl-code">{tpl.id}</span>
                      <span className="status-pill pill-blue">Canonical Standard</span>
                    </div>
                    <h4>{tpl.title}</h4>
                    <p className="tpl-desc">{sampleOutput.message}</p>

                    <div className="prereq-box">
                      <span className="prereq-title">Mandatory Prerequisites Required Before Answering:</span>
                      <ul className="prereq-list">
                        {sampleOutput.missingPrerequisites.map((p, idx) => (
                          <li key={idx}>{p}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="action-box">
                      <span className="action-lbl">Suggested Alternative Action:</span>
                      <p className="action-txt">{sampleOutput.recommendedAction}</p>
                    </div>

                    <div className="json-schema-box">
                      <pre>{JSON.stringify(sampleOutput, null, 2)}</pre>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: ANTI-FABRICATION VALIDATOR SANDBOX */}
      {activeTab === 'sandbox' && (
        <div className="tab-pane">
          <div className="sandbox-layout">
            {/* Input Config Panel */}
            <div className="sandbox-config-card">
              <div className="panel-header">
                <Play size={18} className="text-sky-400" />
                <h3>Live Anti-Hallucination Number Scrubber</h3>
              </div>
              <p className="panel-desc">
                Test how the real-time server validator detects ungrounded numbers, unauthorized CPT codes, and prohibited directives before responses are dispatched to clinicians.
              </p>

              <div className="preset-buttons-row">
                <span className="preset-label">Test Presets:</span>
                <button className="preset-btn" onClick={() => handleTestSandbox('clean')}>
                  Clean Grounded ($5,100)
                </button>
                <button className="preset-btn warn" onClick={() => handleTestSandbox('ungrounded')}>
                  Ungrounded Math ($4,500)
                </button>
                <button className="preset-btn warn" onClick={() => handleTestSandbox('cpt')}>
                  Fabricated CPT (99999)
                </button>
                <button className="preset-btn danger" onClick={() => handleTestSandbox('directive')}>
                  Clinical Directive
                </button>
              </div>

              <div className="form-group">
                <label className="form-label">User Prompt / Query:</label>
                <input
                  type="text"
                  className="form-input"
                  value={sandboxPrompt}
                  onChange={(e) => setSandboxPrompt(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Candidate AI Response Text to Validate:</label>
                <textarea
                  className="form-textarea"
                  rows={4}
                  value={sandboxCandidateText}
                  onChange={(e) => setSandboxCandidateText(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  Ground Truth Numbers from Verified Citations / Tools (Comma-separated):
                </label>
                <input
                  type="text"
                  className="form-input font-mono"
                  value={sandboxGroundTruth}
                  onChange={(e) => setSandboxGroundTruth(e.target.value)}
                  placeholder="e.g. 5100.00, 3859.50, 1240.50"
                />
                <span className="field-hint">Any number in candidate text NOT in this set triggers immediate interception.</span>
              </div>

              <button className="btn-run-scrubber" onClick={() => handleTestSandbox('custom')}>
                <ShieldCheck size={16} />
                <span>Run Anti-Hallucination Scrubber</span>
              </button>
            </div>

            {/* Scrubber Results Panel */}
            <div className="sandbox-results-card">
              <div className="panel-header">
                <CheckCircle2 size={18} className="text-emerald-400" />
                <h3>Scrubber Validation Verdict</h3>
              </div>

              {sandboxResult ? (
                <div className="verdict-container">
                  <div className={`verdict-banner ${sandboxResult.isValid ? 'verdict-pass' : 'verdict-blocked'}`}>
                    <div className="verdict-status-row">
                      {sandboxResult.isValid ? (
                        <>
                          <CheckCircle2 size={24} className="text-emerald-400" />
                          <div>
                            <h4>100% GROUNDED & VERIFIED (PASSED)</h4>
                            <p>All extracted numerical tokens reconciled against authoritative ground truth.</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <ShieldAlert size={24} className="text-amber-400" />
                          <div>
                            <h4>FABRICATION INTERCEPTED (BLOCKED)</h4>
                            <p>Triggered Rule: <strong>{sandboxResult.ruleId}</strong></p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {!sandboxResult.isValid && sandboxResult.flaggedTokens && (
                    <div className="flagged-details-card">
                      <span className="f-title">Intercepted Violation Details:</span>
                      {sandboxResult.flaggedTokens.map((ft, idx) => (
                        <div key={idx} className="violation-row">
                          <span className="v-token">{ft.token}</span>
                          <span className="v-reason">{ft.reason}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="sanitized-output-box">
                    <span className="box-lbl">Sanitized Output Dispatched to Client:</span>
                    <p className="box-txt">{sandboxResult.sanitizedResponse}</p>
                  </div>

                  <div className="latency-badge">
                    <span>Validation Duration: <strong>{sandboxResult.durationMs}ms</strong></span>
                    <span>Zero Arithmetic Drift Verified</span>
                  </div>
                </div>
              ) : (
                <div className="sandbox-idle">
                  <ShieldAlert size={48} className="text-slate-400 mb-3" />
                  <p>Select a preset above or click "Run Anti-Hallucination Scrubber" to inspect live verification.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* INCIDENT DRILL-DOWN MODAL */}
      {selectedIncident && (
        <div className="aihr-modal-backdrop" onClick={() => setSelectedIncident(null)}>
          <div className="aihr-modal-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="header-meta">
                <div className="header-badges">
                  <span className={`type-badge type-${selectedIncident.interceptType.toLowerCase()}`}>
                    {selectedIncident.interceptType.replace(/_/g, ' ')}
                  </span>
                  <span className="status-pill pill-warn">{selectedIncident.actionTaken}</span>
                </div>
                <h2 className="drawer-title">Incident Audit: {selectedIncident.id}</h2>
                <div className="drawer-sub">Session ID: <code>{selectedIncident.sessionId}</code></div>
              </div>
              <button className="drawer-close-btn" onClick={() => setSelectedIncident(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="drawer-body">
              <div className="incident-section">
                <span className="section-tag">User Prompt</span>
                <p className="prompt-text">"{selectedIncident.rawPrompt}"</p>
              </div>

              <div className="incident-section">
                <span className="section-tag">Blocked Candidate Hallucination</span>
                <div className="hallucination-diff-box">
                  <p>{selectedIncident.candidateResponse}</p>
                </div>
              </div>

              <div className="incident-section">
                <span className="section-tag">Flagged Tokens & Root Cause Analysis</span>
                <div className="flagged-card-list">
                  {selectedIncident.flaggedTokens.map((ft, idx) => (
                    <div key={idx} className="flagged-card">
                      <div className="fc-top">
                        <span className="fc-token">{ft.token}</span>
                        <span className="fc-expected">Ground Truth: {ft.expectedGroundTruth}</span>
                      </div>
                      <p className="fc-reason">{ft.reason}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="incident-section">
                <span className="section-tag">Sanitized Fallback Delivered to User</span>
                <div className="sanitized-box">
                  <p>{selectedIncident.sanitizedResponse}</p>
                </div>
              </div>

              <div className="incident-section">
                <span className="section-tag">Cryptographic Provenance</span>
                <div className="prov-box">
                  <span className="font-mono text-xs text-muted">SHA256: {selectedIncident.provenanceHash}</span>
                </div>
              </div>
            </div>

            <div className="drawer-footer">
              <button className="btn-drawer-close" onClick={() => setSelectedIncident(null)}>
                Dismiss Incident
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
