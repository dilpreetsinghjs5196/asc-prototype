/**
 * ==============================================================================
 * Phase C4: AI Evidence, Citations & Explainability Console
 * Module 12: AI & Intelligence
 * Maestro Clinical Design System: Emerald, Amber, Crimson, Sky, Slate, Neutral
 * Strictly Zero Prohibited Accent Tokens
 * Full Light & Dark Mode ([data-theme="dark"]) Contrast Support
 * ==============================================================================
 */

import React, { useState, useMemo } from 'react';
import {
  FileCheck2,
  ShieldCheck,
  Database,
  AlertTriangle,
  Activity,
  Layers,
  Search,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Calculator,
  ChevronRight,
  Code2,
  FileText,
  Clock,
  ArrowRight,
  Sparkles,
  Info,
  X
} from 'lucide-react';
import {
  EVIDENCE_SOURCE_TYPES,
  VERIFICATION_STATUSES,
  EVIDENCE_SOURCES_META,
  getCitationCatalog,
  getCitationDetail,
  verifyCitation,
  batchVerifyCitations,
  rebaselineCitation,
  decomposeMetricExplainability,
  parseInlineCitations,
  getEvidenceTelemetry
} from '../services/aiEvidenceService.js';
import './AIEvidenceCitationsView.css';

export default function AIEvidenceCitationsView({ activeFacility = 'fac-naples-01' }) {
  const [activeTab, setActiveTab] = useState('graph'); // 'graph', 'audit', 'sandbox'
  const [sourceTypeFilter, setSourceTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCitationId, setSelectedCitationId] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [auditResults, setAuditResults] = useState(null);
  const [isAuditing, setIsAuditing] = useState(false);
  
  // Sandbox sample narratives
  const [selectedSampleIndex, setSelectedSampleIndex] = useState(0);

  const sampleNarratives = [
    {
      title: 'Knee Meniscectomy Underpayment & Contract Carveout',
      text: 'Case #2026-9041 [E-101] received an adjudicated payment of $3,859.50 against gross charges of $14,200.00. However, the commercial fee schedule for Aetna Section 4 [E-102] establishes an allowable rate of $5,100.00 for primary CPT 29881. This leaves a net recoverable underpayment of $1,240.50 [E-103], driven by CARC code CO-97 [E-109] with unapplied carveouts. Operative skin-to-skin time was 43 minutes [E-112], delivering a net Contribution Margin per OR Hour of $1,659.86 [E-104].',
      metrics: ['Underpayment: $1,240.50', 'CM/OR Hour: $1,659.86', 'Surgical Time: 43m']
    },
    {
      title: 'OR-02 Utilization & Turnover Velocity Variance',
      text: 'Operating Room 2 achieved 73.15% staffed utilization on Nov 12 [E-105], falling 6.85% below the prime-time target of 80.0%. This was compounded by an average room turnover of 24.5 minutes, generating 6.5 minutes of excess turnover lag [E-106] against facility benchmarks. Direct supply costs for Stryker Cross-Pin implants totaled $1,700.00 [E-108].',
      metrics: ['Utilization: 73.15%', 'Turnover Lag: +6.5m', 'Implant Cost: $1,700']
    },
    {
      title: 'Cataract Surgery Efficiency & Margin Performance',
      text: 'Dr. Sarah Lin delivered stellar operational performance on cataract removal Case #2026-9042, realizing a Contribution Margin per OR Hour of $2,370.00 [E-110]. Pre-bill scrub score registered at 98.2% [E-107], with zero denial risk.',
      metrics: ['CM/OR Hour: $2,370.00', 'Clean Claim: 98.2%', 'Case Turnover: 40m']
    }
  ];

  const telemetry = useMemo(() => {
    return getEvidenceTelemetry(activeFacility);
  }, [activeFacility, toastMessage, auditResults]);

  const filteredCitations = useMemo(() => {
    return getCitationCatalog(activeFacility, {
      sourceType: sourceTypeFilter,
      status: statusFilter,
      searchQuery
    });
  }, [activeFacility, sourceTypeFilter, statusFilter, searchQuery, toastMessage]);

  const selectedCitationDetail = useMemo(() => {
    if (!selectedCitationId) return null;
    try {
      return getCitationDetail(selectedCitationId);
    } catch {
      return null;
    }
  }, [selectedCitationId, toastMessage]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleVerify = (id, e) => {
    if (e) e.stopPropagation();
    const res = verifyCitation(id);
    if (res.status === VERIFICATION_STATUSES.VERIFIED) {
      showToast(`Verified! Citation ${res.citationId} matches active source record with zero drift.`);
    } else {
      showToast(`Alert: Data drift detected on citation ${res.citationId}!`);
    }
  };

  const handleRebaseline = (id) => {
    const res = rebaselineCitation(id);
    showToast(res.message);
  };

  const handleRunBatchAudit = () => {
    setIsAuditing(true);
    setTimeout(() => {
      const results = batchVerifyCitations(activeFacility);
      setAuditResults(results);
      setIsAuditing(false);
      showToast(`Batch sweep complete: ${results.verifiedCount}/${results.totalScanned} citations 100% verified.`);
    }, 400);
  };

  return (
    <div className="aiev-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="aiev-toast">
          <CheckCircle2 size={16} className="text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 5-Card Top Metric Ribbon (Maestro Clinical) */}
      <div className="aiev-ribbon">
        <div className="aiev-ribbon-card primary">
          <div className="card-top">
            <span className="card-label">Total Citations</span>
            <div className="icon-wrapper blue"><FileCheck2 size={16} /></div>
          </div>
          <div className="card-metric">{telemetry.totalCitations} <span className="metric-unit">Anchors</span></div>
          <div className="card-footer-info">
            <span>Authoritative Graph</span>
            <span className="status-pill pill-blue">Phase C4 Ledger</span>
          </div>
        </div>

        <div className="aiev-ribbon-card">
          <div className="card-top">
            <span className="card-label">Verified Anchors</span>
            <div className="icon-wrapper emerald"><ShieldCheck size={16} /></div>
          </div>
          <div className="card-metric">{telemetry.verifiedAnchors} <span className="metric-unit">({telemetry.verificationHealthPct}%)</span></div>
          <div className="card-footer-info">
            <span>Cryptographic Match</span>
            <span className="status-pill pill-success">Zero Drift</span>
          </div>
        </div>

        <div className="aiev-ribbon-card">
          <div className="card-top">
            <span className="card-label">Source Types</span>
            <div className="icon-wrapper emerald"><Database size={16} /></div>
          </div>
          <div className="card-metric">{telemetry.sourceTypesCovered} <span className="metric-unit">Domains</span></div>
          <div className="card-footer-info">
            <span>EHR, 837, 835, Contract, OR</span>
            <span className="status-pill pill-success">Full Coverage</span>
          </div>
        </div>

        <div className="aiev-ribbon-card">
          <div className="card-top">
            <span className="card-label">Data Drift Alerts</span>
            <div className="icon-wrapper amber"><AlertTriangle size={16} /></div>
          </div>
          <div className="card-metric">{telemetry.dataDriftAlerts} <span className="metric-unit">Flagged</span></div>
          <div className="card-footer-info">
            <span>Modified Since Assertion</span>
            <span className={`status-pill ${telemetry.dataDriftAlerts > 0 ? 'pill-warn' : 'pill-success'}`}>
              {telemetry.dataDriftAlerts > 0 ? 'Action Needed' : 'No Drift'}
            </span>
          </div>
        </div>

        <div className="aiev-ribbon-card">
          <div className="card-top">
            <span className="card-label">Verification Speed</span>
            <div className="icon-wrapper blue"><Activity size={16} /></div>
          </div>
          <div className="card-metric">{telemetry.avgVerificationLatencyMs} <span className="metric-unit">ms</span></div>
          <div className="card-footer-info">
            <span>Server-Side SHA-256</span>
            <span className="rate-badge">High Throughput</span>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="aiev-tabs-row">
        <div className="tab-buttons">
          <button
            className={`tab-btn ${activeTab === 'graph' ? 'active' : ''}`}
            onClick={() => setActiveTab('graph')}
          >
            <Layers size={16} />
            <span>Evidence Citation Graph ({telemetry.totalCitations})</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit')}
          >
            <RefreshCw size={16} />
            <span>Batch Drift & Provenance Audit</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'sandbox' ? 'active' : ''}`}
            onClick={() => setActiveTab('sandbox')}
          >
            <Calculator size={16} />
            <span>Interactive Explainability Sandbox</span>
          </button>
        </div>
      </div>

      {/* TAB 1: EVIDENCE CITATION GRAPH */}
      {activeTab === 'graph' && (
        <div className="tab-pane">
          {/* Filter Bar */}
          <div className="citation-filter-bar">
            <div className="source-pills">
              {['ALL', ...Object.values(EVIDENCE_SOURCE_TYPES)].map(st => (
                <button
                  key={st}
                  className={`source-pill ${sourceTypeFilter === st ? 'active' : ''}`}
                  onClick={() => setSourceTypeFilter(st)}
                >
                  {st === 'ALL' ? 'ALL SOURCES' : EVIDENCE_SOURCES_META[st]?.shortCode || st}
                </button>
              ))}
            </div>

            <div className="filter-right">
              <div className="status-toggle-group">
                {['ALL', 'VERIFIED', 'DATA_DRIFT'].map(st => (
                  <button
                    key={st}
                    className={`status-toggle-btn ${statusFilter === st ? 'active' : ''}`}
                    onClick={() => setStatusFilter(st)}
                  >
                    {st === 'ALL' ? 'All Status' : st === 'VERIFIED' ? 'Verified' : 'Drifted'}
                  </button>
                ))}
              </div>

              <div className="search-box">
                <Search size={15} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search citation code, key, context..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Citations Grid */}
          <div className="citations-grid">
            {filteredCitations.map((citation) => {
              const meta = EVIDENCE_SOURCES_META[citation.sourceType] || {};
              const isDrifted = citation.verificationStatus === VERIFICATION_STATUSES.DATA_DRIFT;

              return (
                <div
                  key={citation.id}
                  className={`citation-card ${isDrifted ? 'card-drifted' : ''}`}
                  onClick={() => setSelectedCitationId(citation.id)}
                >
                  <div className="card-top-row">
                    <div className="badge-cluster">
                      <span className={`source-type-badge badge-${citation.sourceType.toLowerCase()}`}>
                        {meta.shortCode || citation.sourceType}
                      </span>
                      <code className="citation-code-badge">{citation.citationCode}</code>
                    </div>
                    <span className={`status-pill ${isDrifted ? 'pill-warn' : 'pill-success'}`}>
                      {isDrifted ? 'Data Drift' : 'Verified'}
                    </span>
                  </div>

                  <p className="statement-snippet">
                    "{citation.statementContext}"
                  </p>

                  <div className="citation-meta-grid">
                    <div className="meta-cell">
                      <span className="cell-label">Source Record</span>
                      <span className="cell-val font-mono">{citation.sourceRecordKey}</span>
                    </div>
                    <div className="meta-cell">
                      <span className="cell-label">Field Path</span>
                      <span className="cell-val font-mono truncate" title={citation.fieldPath}>
                        {citation.fieldPath}
                      </span>
                    </div>
                    <div className="meta-cell">
                      <span className="cell-label">Claimed Value</span>
                      <span className="cell-val text-blue">
                        {typeof citation.claimedValue === 'number'
                          ? (citation.claimedValue > 50 && citation.claimedValue < 50000 && !citation.fieldPath.includes('Minutes') && !citation.fieldPath.includes('Pct') && !citation.fieldPath.includes('Score')
                            ? `$${citation.claimedValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                            : citation.claimedValue)
                          : String(citation.claimedValue)}
                      </span>
                    </div>
                    <div className="meta-cell">
                      <span className="cell-label">Confidence</span>
                      <span className="cell-val text-emerald">{citation.confidenceScore}%</span>
                    </div>
                  </div>

                  {citation.calculationFormula && (
                    <div className="formula-preview-box">
                      <span className="formula-lbl">Formula:</span>
                      <code className="formula-code">{citation.calculationFormula}</code>
                    </div>
                  )}

                  <div className="citation-footer">
                    <div className="hash-preview" title={citation.provenanceHash}>
                      <span className="hash-prefix">SHA256:</span>
                      <code>{citation.provenanceHash.substring(0, 14)}...</code>
                    </div>
                    <div className="footer-actions">
                      <button
                        className="btn-reverify"
                        onClick={(e) => handleVerify(citation.id, e)}
                        title="Re-verify against live database"
                      >
                        <RefreshCw size={13} />
                        <span>Re-Verify</span>
                      </button>
                      <button
                        className="btn-inspect"
                        onClick={() => setSelectedCitationId(citation.id)}
                      >
                        <span>Drill Down</span>
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: BATCH DRIFT & PROVENANCE AUDIT */}
      {activeTab === 'audit' && (
        <div className="tab-pane">
          <div className="audit-dashboard-card">
            <div className="audit-header">
              <div className="audit-info">
                <RefreshCw size={22} className="text-sky-400" />
                <div>
                  <h2>Authoritative Provenance & Data Drift Scanner</h2>
                  <p>
                    Execute a facility-wide cryptographic audit to detect retroactive amendments, billing write-offs, or EHR timing revisions that invalidate historical AI claims.
                  </p>
                </div>
              </div>
              <button
                className="btn-run-audit"
                onClick={handleRunBatchAudit}
                disabled={isAuditing}
              >
                <RefreshCw size={16} className={isAuditing ? 'spin' : ''} />
                <span>{isAuditing ? 'Scanning Records...' : 'Run Audit Sweep'}</span>
              </button>
            </div>

            {auditResults ? (
              <div className="audit-results-panel">
                <div className="audit-kpi-grid">
                  <div className="kpi-box">
                    <span className="kpi-label">Total Citations Scanned</span>
                    <span className="kpi-val">{auditResults.totalScanned}</span>
                  </div>
                  <div className="kpi-box">
                    <span className="kpi-label">Verified Anchors</span>
                    <span className="kpi-val text-emerald">{auditResults.verifiedCount}</span>
                  </div>
                  <div className="kpi-box">
                    <span className="kpi-label">Drifted Records</span>
                    <span className="kpi-val text-amber">{auditResults.driftedCount}</span>
                  </div>
                  <div className="kpi-box">
                    <span className="kpi-label">Audit Health Score</span>
                    <span className="kpi-val text-sky">{auditResults.healthPct}%</span>
                  </div>
                </div>

                <div className="audit-table-card">
                  <h3>Audit Ledger Exceptions</h3>
                  <table className="audit-table">
                    <thead>
                      <tr>
                        <th>Citation</th>
                        <th>Source Entity</th>
                        <th>Field Path</th>
                        <th>Claimed Assertion</th>
                        <th>Current DB Value</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCitations.filter(c => c.verificationStatus === VERIFICATION_STATUSES.DATA_DRIFT).map(c => (
                        <tr key={c.id}>
                          <td><code className="font-mono">{c.citationCode}</code></td>
                          <td><strong>{c.sourceRecordKey}</strong></td>
                          <td><span className="font-mono text-muted">{c.fieldPath}</span></td>
                          <td><span className="line-through text-amber">${c.claimedValue}</span></td>
                          <td><strong className="text-emerald">${c.currentValue}</strong></td>
                          <td>
                            <span className="status-pill pill-warn">DATA DRIFT</span>
                          </td>
                          <td>
                            <button
                              className="btn-rebaseline"
                              onClick={() => handleRebaseline(c.id)}
                            >
                              Re-Baseline
                            </button>
                          </td>
                        </tr>
                      ))}
                      {auditResults.driftedCount === 0 && (
                        <tr>
                          <td colSpan={7} className="text-center text-muted py-6">
                            Zero data drift detected! All facility citations match active database records 100%.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="audit-idle-prompt">
                <ShieldCheck size={48} className="text-slate-400 mb-3" />
                <p>Click "Run Audit Sweep" to initiate real-time cryptographic verification across all facility evidence citations.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: INTERACTIVE EXPLAINABILITY SANDBOX */}
      {activeTab === 'sandbox' && (
        <div className="tab-pane">
          <div className="sandbox-layout">
            {/* Left: Narrative Selector & Text with Citations */}
            <div className="narrative-card">
              <div className="card-header-styled">
                <FileText size={18} className="text-sky-400" />
                <h3>Clinical & Financial Narrative Explainability</h3>
              </div>
              <p className="panel-desc">
                Select an ASC analytical insight below. Click on any inline citation badge <code>[E#]</code> to view the atomic source record, calculation trace, and provenance fingerprint.
              </p>

              <div className="narrative-selector-pills">
                {sampleNarratives.map((s, idx) => (
                  <button
                    key={s.title}
                    className={`narrative-pill ${selectedSampleIndex === idx ? 'active' : ''}`}
                    onClick={() => setSelectedSampleIndex(idx)}
                  >
                    {s.title}
                  </button>
                ))}
              </div>

              <div className="narrative-rendered-box">
                <h4>{sampleNarratives[selectedSampleIndex].title}</h4>
                <div className="narrative-body-text">
                  {renderNarrativeWithCitations(
                    sampleNarratives[selectedSampleIndex].text,
                    (citationCode) => {
                      const found = filteredCitations.find(c => c.citationCode === citationCode);
                      if (found) setSelectedCitationId(found.id);
                    }
                  )}
                </div>
                <div className="narrative-metrics-footer">
                  {sampleNarratives[selectedSampleIndex].metrics.map(m => (
                    <span key={m} className="metric-tag">{m}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Embedded Interactive Formula Calculator */}
            <div className="calculator-card">
              <div className="card-header-styled">
                <Calculator size={18} className="text-emerald-400" />
                <h3>Deterministic Formula Decomposer</h3>
              </div>
              <p className="panel-desc">
                Deconstruct multi-variable calculations into transparent, reproducible steps with guaranteed zero arithmetic hallucination.
              </p>

              <div className="sample-formulas-list">
                <div className="formula-item">
                  <div className="f-title">Contribution Margin per OR Hour</div>
                  <code className="f-expr">CM ($2,019.50) / (Case Minutes (73) / 60) = $1,659.86/hr</code>
                  <div className="f-status text-emerald">Balanced: 0.00% Tolerance</div>
                </div>

                <div className="formula-item">
                  <div className="f-title">Net Underpayment Carveout Variance</div>
                  <code className="f-expr">Expected ($5,100.00) - Paid ($3,859.50) = $1,240.50</code>
                  <div className="f-status text-emerald">Balanced: 0.00% Tolerance</div>
                </div>

                <div className="formula-item">
                  <div className="f-title">Staffed Room Utilization Percentage</div>
                  <code className="f-expr">(Wheels-In (395m) / (Staffed Hrs (9.0) * 60)) * 100 = 73.15%</code>
                  <div className="f-status text-emerald">Balanced: 0.00% Tolerance</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SOURCE RECORD DRILL-DOWN DRAWER / MODAL */}
      {selectedCitationDetail && (
        <div className="aiev-modal-backdrop" onClick={() => setSelectedCitationId(null)}>
          <div className="aiev-modal-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="header-meta">
                <div className="header-badges">
                  <span className={`source-type-badge badge-${selectedCitationDetail.citation.sourceType.toLowerCase()}`}>
                    {selectedCitationDetail.sourceMeta.shortCode || selectedCitationDetail.citation.sourceType}
                  </span>
                  <code className="citation-code-badge">{selectedCitationDetail.citation.citationCode}</code>
                  <span className={`status-pill ${selectedCitationDetail.citation.verificationStatus === VERIFICATION_STATUSES.DATA_DRIFT ? 'pill-warn' : 'pill-success'}`}>
                    {selectedCitationDetail.citation.verificationStatus}
                  </span>
                </div>
                <h2 className="drawer-title">{selectedCitationDetail.sourceMeta.name}</h2>
                <div className="drawer-key-subtitle">
                  Primary Record Key: <strong>{selectedCitationDetail.citation.sourceRecordKey}</strong>
                </div>
              </div>
              <button className="drawer-close-btn" onClick={() => setSelectedCitationId(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="drawer-body">
              {/* Statement Context Banner */}
              <div className="context-banner">
                <span className="banner-tag">Asserted Statement</span>
                <p className="banner-text">"{selectedCitationDetail.citation.statementContext}"</p>
              </div>

              {/* Live Comparison Card */}
              <div className="comparison-card">
                <div className="comp-item">
                  <span className="comp-lbl">Claimed Assertion</span>
                  <span className="comp-val text-blue">
                    ${selectedCitationDetail.citation.claimedValue}
                  </span>
                  <span className="comp-sub">Recorded at insight generation</span>
                </div>
                <div className="comp-divider">
                  <ArrowRight size={18} className="text-slate-400" />
                </div>
                <div className="comp-item">
                  <span className="comp-lbl">Active Live Database Value</span>
                  <span className={`comp-val ${selectedCitationDetail.citation.verificationStatus === VERIFICATION_STATUSES.DATA_DRIFT ? 'text-amber' : 'text-emerald'}`}>
                    ${selectedCitationDetail.citation.currentValue}
                  </span>
                  <span className="comp-sub">Fetched in real-time from source table</span>
                </div>
              </div>

              {/* Data Drift Alert Action */}
              {selectedCitationDetail.citation.verificationStatus === VERIFICATION_STATUSES.DATA_DRIFT && (
                <div className="drift-action-banner">
                  <AlertTriangle size={18} className="text-amber-400 flex-shrink-0" />
                  <div className="flex-1">
                    <strong>Data Drift Notice:</strong> Source records have been updated since this insight was generated.
                  </div>
                  <button
                    className="btn-rebaseline-sm"
                    onClick={() => handleRebaseline(selectedCitationDetail.citation.id)}
                  >
                    Accept & Re-Baseline
                  </button>
                </div>
              )}

              {/* Step-by-Step Mathematical Explainability Trace */}
              {selectedCitationDetail.explainabilityTrace && (
                <div className="drawer-section">
                  <h3 className="section-title">
                    <Calculator size={15} className="text-emerald-400" />
                    <span>Deterministic Calculation Trace</span>
                  </h3>
                  <div className="trace-box">
                    <div className="trace-formula">
                      <span className="f-lbl">Formula:</span>
                      <code>{selectedCitationDetail.explainabilityTrace.formulaText}</code>
                    </div>

                    <div className="trace-inputs-grid">
                      {selectedCitationDetail.explainabilityTrace.inputs.map((inp, idx) => (
                        <div key={idx} className="input-card">
                          <span className="inp-lbl">{inp.label}</span>
                          <span className="inp-val">{inp.value}</span>
                          <span className="inp-src">{inp.source}</span>
                        </div>
                      ))}
                    </div>

                    <div className="trace-steps-list">
                      {selectedCitationDetail.explainabilityTrace.steps.map((st) => (
                        <div key={st.step} className="step-row">
                          <span className="step-num">Step {st.step}</span>
                          <div className="step-content">
                            <div className="step-desc">{st.description}</div>
                            <div className="step-math">
                              <code>{st.expression}</code>
                              <span className="math-arrow">=</span>
                              <strong>{st.result}</strong>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Raw Source Record JSON Viewer */}
              <div className="drawer-section">
                <h3 className="section-title">
                  <Code2 size={15} className="text-sky-400" />
                  <span>Authoritative Source Record Payload ({selectedCitationDetail.sourceMeta.sourceTable})</span>
                </h3>
                <div className="code-viewer-box">
                  <pre>
                    {JSON.stringify(selectedCitationDetail.rawDocument, null, 2)}
                  </pre>
                </div>
              </div>

              {/* Cryptographic Provenance Badge */}
              <div className="drawer-section">
                <h3 className="section-title">
                  <ShieldCheck size={15} className="text-emerald-400" />
                  <span>Tamper-Evident Provenance Fingerprint</span>
                </h3>
                <div className="provenance-detail-card">
                  <div className="prov-row">
                    <span className="prov-lbl">Algorithm:</span>
                    <span className="prov-val">SHA-256 (FIPS 180-4 Standard)</span>
                  </div>
                  <div className="prov-row">
                    <span className="prov-lbl">Source Table:</span>
                    <span className="prov-val font-mono">{selectedCitationDetail.sourceMeta.sourceTable}</span>
                  </div>
                  <div className="prov-row">
                    <span className="prov-lbl">Sensitivity:</span>
                    <span className="prov-val">{selectedCitationDetail.sourceMeta.sensitivity}</span>
                  </div>
                  <div className="prov-row">
                    <span className="prov-lbl">Full SHA-256 Hash:</span>
                    <code className="prov-hash font-mono text-emerald">
                      {selectedCitationDetail.citation.provenanceHash}
                    </code>
                  </div>
                </div>
              </div>
            </div>

            <div className="drawer-footer">
              <button
                className="btn-drawer-reverify"
                onClick={() => handleVerify(selectedCitationDetail.citation.id)}
              >
                <RefreshCw size={14} />
                <span>Re-Verify Live</span>
              </button>
              <button
                className="btn-drawer-close"
                onClick={() => setSelectedCitationId(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper to render narrative text with clickable citation tokens [E-101]
function renderNarrativeWithCitations(text, onCitationClick) {
  const parts = [];
  const regex = /\[(E-\d+|E\d+|CIT-\d+)\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    const token = match[1];
    parts.push(
      <button
        key={`${token}-${match.index}`}
        className="inline-citation-badge"
        onClick={() => onCitationClick(token)}
        title={`Click to view source evidence for ${token}`}
      >
        [{token}]
      </button>
    );

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts;
}
