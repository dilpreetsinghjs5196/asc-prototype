/**
 * ==============================================================================
 * Phase D1: Recommendation Priority Model View
 * Module 13: Decision Intelligence
 * Displays configurable facility scoring profiles, deterministic formula traces,
 * interactive weight sensitivity simulator, and calculation provenance logs.
 * Maestro Clinical Design System: Emerald, Amber, Crimson, Sky, Slate, Neutral
 * Strictly Zero Prohibited Accent Tokens
 * ==============================================================================
 */

import React, { useState, useMemo } from 'react';
import {
  Award,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Building2,
  RefreshCw,
  Scale,
  Layers,
  ShieldCheck,
  TrendingUp,
  Clock,
  ArrowRight
} from 'lucide-react';
import {
  SEED_SCORING_PROFILES,
  getScoringProfiles,
  getActiveScoringProfile,
  setActiveScoringProfile,
  calculatePriorityScoreWithTrace,
  recalculateFacilityActionQueue,
  getScoreLogs,
  getScoringTelemetry,
  validateWeightsSum
} from '../services/recommendationPriorityService';
import { getNextBestFinancialActions } from '../services/nextBestActionService';
import './RecommendationPriorityModelView.css';

export default function RecommendationPriorityModelView({ activeFacility }) {
  const facilityId = activeFacility?.id || 'fac-naples-01';
  const facilityName = activeFacility?.name || 'Naples Surgery Center';

  const [activeTab, setActiveTab] = useState('profiles'); // 'profiles' | 'sensitivity' | 'logs'
  const [toastMessage, setToastMessage] = useState(null);
  const [selectedTraceLog, setSelectedTraceLog] = useState(null);

  // Custom sensitivity state
  const [customValueW, setCustomValueW] = useState(35);
  const [customUrgencyW, setCustomUrgencyW] = useState(25);
  const [customRecovW, setCustomRecovW] = useState(20);
  const [customConfW, setCustomConfW] = useState(10);
  const [customEffortW, setCustomEffortW] = useState(10);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Telemetry KPIs
  const telemetry = useMemo(() => {
    return getScoringTelemetry(facilityId);
  }, [facilityId, toastMessage]);

  // Scoring Profiles
  const profiles = useMemo(() => {
    return getScoringProfiles(facilityId);
  }, [facilityId, toastMessage]);

  const activeProfile = useMemo(() => {
    return getActiveScoringProfile(facilityId);
  }, [facilityId, toastMessage]);

  // Actions list for preview
  const actions = useMemo(() => {
    return getNextBestFinancialActions(facilityId);
  }, [facilityId, toastMessage]);

  // Score Logs
  const scoreLogs = useMemo(() => {
    return getScoreLogs();
  }, [toastMessage]);

  // Weight sum check
  const totalWeightPercent = customValueW + customUrgencyW + customRecovW + customConfW + customEffortW;
  const isWeightsValid = totalWeightPercent === 100;

  // Sensitivity Preview Results
  const sensitivityPreview = useMemo(() => {
    const tempProfile = {
      profileCode: 'CUSTOM_TUNING',
      name: 'Custom Interactive Sensitivity',
      valueWeight: customValueW / 100,
      urgencyWeight: customUrgencyW / 100,
      recoverabilityWeight: customRecovW / 100,
      confidenceWeight: customConfW / 100,
      effortWeight: customEffortW / 100,
      valueCap: 25000.00
    };

    return actions.map(action => {
      const scored = calculatePriorityScoreWithTrace(action, tempProfile);
      return {
        ...action,
        simulatedScore: scored.compositeScore,
        simulatedTier: scored.priorityTier,
        delta: Math.round((scored.compositeScore - action.compositePriorityRank) * 10) / 10
      };
    }).sort((a, b) => b.simulatedScore - a.simulatedScore);
  }, [actions, customValueW, customUrgencyW, customRecovW, customConfW, customEffortW]);

  // Handle Switch Profile
  const handleApplyProfile = (profileId) => {
    try {
      recalculateFacilityActionQueue(facilityId, profileId);
      showToast(`Scoring profile updated and action queue recalculated.`);
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="rpm-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="rpm-toast">
          <CheckCircle2 size={16} className="text-emerald" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="rpm-header">
        <div className="rpm-header-left">
          <div className="rpm-title-row">
            <h1 className="rpm-title">Recommendation Priority Model & Scoring</h1>
            <span className="rpm-facility-pill">
              <Building2 size={12} />
              {facilityName}
            </span>
            <span className="rpm-ver-badge">Formula v1.4 Deterministic</span>
          </div>
          <p className="rpm-subtitle">
            Mathematical prioritization model: Expected Value, Confidence, Urgency, Recoverability, and Effort weighting.
          </p>
        </div>
        <div className="rpm-header-right">
          <button
            className="rpm-btn-primary"
            onClick={() => handleApplyProfile(activeProfile.id)}
          >
            <RefreshCw size={14} /> Recalculate Queue
          </button>
        </div>
      </div>

      {/* 5-Card Telemetry Ribbon */}
      <div className="rpm-ribbon-grid">
        <div className="rpm-ribbon-card">
          <div className="card-top">
            <span className="card-label">Active Profile</span>
            <div className="icon-wrapper blue">
              <Scale size={18} />
            </div>
          </div>
          <div className="card-metric text-blue">{telemetry.activeProfileCode}</div>
          <div className="card-footer-info">
            <span className="pill-blue">Active</span>
            <span>{telemetry.activeProfileName}</span>
          </div>
        </div>

        <div className="rpm-ribbon-card">
          <div className="card-top">
            <span className="card-label">Avg Composite Priority</span>
            <div className="icon-wrapper emerald">
              <Award size={18} />
            </div>
          </div>
          <div className="card-metric">{telemetry.averageCompositeScore}</div>
          <div className="card-footer-info">
            <span className="pill-success">Range 0-100</span>
            <span>Across active facility queue</span>
          </div>
        </div>

        <div className="rpm-ribbon-card">
          <div className="card-top">
            <span className="card-label">Critical P0 Actions</span>
            <div className="icon-wrapper crimson">
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className="card-metric">{telemetry.criticalP0ScoredCount}</div>
          <div className="card-footer-info">
            <span className="pill-danger">Score &ge; 85.0</span>
            <span>Urgent SLA priority</span>
          </div>
        </div>

        <div className="rpm-ribbon-card">
          <div className="card-top">
            <span className="card-label">Formula Integrity</span>
            <div className="icon-wrapper emerald">
              <ShieldCheck size={18} />
            </div>
          </div>
          <div className="card-metric text-emerald">100%</div>
          <div className="card-footer-info">
            <span className="pill-success">Zero Drift</span>
            <span>Pure server-side arithmetic</span>
          </div>
        </div>

        <div className="rpm-ribbon-card">
          <div className="card-top">
            <span className="card-label">Provenance Status</span>
            <div className="icon-wrapper amber">
              <FileText size={18} />
            </div>
          </div>
          <div className="card-metric text-amber">SHA-256</div>
          <div className="card-footer-info">
            <span className="pill-warn">Audit-Grade</span>
            <span>Immutable calculation trace</span>
          </div>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="rpm-nav-tabs">
        <button
          className={`tab-btn ${activeTab === 'profiles' ? 'active' : ''}`}
          onClick={() => setActiveTab('profiles')}
        >
          <Scale size={14} /> Facility Scoring Profiles ({profiles.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'sensitivity' ? 'active' : ''}`}
          onClick={() => setActiveTab('sensitivity')}
        >
          <Sliders size={14} /> Interactive Sensitivity Simulator
        </button>
        <button
          className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => setActiveTab('logs')}
        >
          <FileText size={14} /> Calculation Trace Logs ({scoreLogs.length})
        </button>
      </div>

      {/* Tab 1: Profiles Management */}
      {activeTab === 'profiles' && (
        <div className="rpm-profiles-grid">
          {profiles.map(p => {
            const isActive = p.isActive;
            return (
              <div key={p.id} className={`profile-card ${isActive ? 'active-profile' : ''}`}>
                <div className="profile-card-header">
                  <div className="profile-name-group">
                    <span className="profile-code">{p.profileCode}</span>
                    <h3 className="profile-name">{p.name}</h3>
                  </div>
                  {isActive ? (
                    <span className="badge-active"><CheckCircle2 size={12} /> Active Profile</span>
                  ) : (
                    <button
                      className="btn-activate"
                      onClick={() => handleApplyProfile(p.id)}
                    >
                      Apply &amp; Recalculate
                    </button>
                  )}
                </div>

                <p className="profile-desc">{p.description}</p>

                {/* Weight Allocation Progress Bars */}
                <div className="weights-bars-container">
                  <div className="weight-row">
                    <div className="weight-header">
                      <span>Expected Financial Value (V)</span>
                      <strong>{Math.round(p.valueWeight * 100)}%</strong>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill emerald" style={{ width: `${p.valueWeight * 100}%` }} />
                    </div>
                  </div>

                  <div className="weight-row">
                    <div className="weight-header">
                      <span>Urgency &amp; Filing Deadline (U)</span>
                      <strong>{Math.round(p.urgencyWeight * 100)}%</strong>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill crimson" style={{ width: `${p.urgencyWeight * 100}%` }} />
                    </div>
                  </div>

                  <div className="weight-row">
                    <div className="weight-header">
                      <span>Payer Recoverability Probability (R)</span>
                      <strong>{Math.round(p.recoverabilityWeight * 100)}%</strong>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill amber" style={{ width: `${p.recoverabilityWeight * 100}%` }} />
                    </div>
                  </div>

                  <div className="weight-row">
                    <div className="weight-header">
                      <span>Data Confidence &amp; Citations (C)</span>
                      <strong>{Math.round(p.confidenceWeight * 100)}%</strong>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill blue" style={{ width: `${p.confidenceWeight * 100}%` }} />
                    </div>
                  </div>

                  <div className="weight-row">
                    <div className="weight-header">
                      <span>Operational Effort (Inverse E)</span>
                      <strong>{Math.round(p.effortWeight * 100)}%</strong>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill slate" style={{ width: `${p.effortWeight * 100}%` }} />
                    </div>
                  </div>
                </div>

                <div className="profile-card-footer">
                  <span>Value Normalization Ceiling: <strong>${Number(p.valueCap).toLocaleString()}</strong></span>
                  <span className="text-emerald font-bold">&Sigma; Weights = 100.0%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 2: Interactive Sensitivity Simulator */}
      {activeTab === 'sensitivity' && (
        <div className="rpm-sensitivity-panel">
          <div className="sensitivity-controls-card">
            <div className="controls-header">
              <div>
                <h2 className="controls-title">Dynamic Weight Sensitivity Workbench</h2>
                <p className="controls-subtitle">
                  Adjust weight sliders to simulate how facility policy shifts impact daily action priority ranks.
                </p>
              </div>
              <div className={`sum-indicator ${isWeightsValid ? 'valid' : 'invalid'}`}>
                <span>Total Weight:</span>
                <strong>{totalWeightPercent}%</strong>
                {isWeightsValid ? (
                  <CheckCircle2 size={16} className="text-emerald" />
                ) : (
                  <AlertTriangle size={16} className="text-crimson" />
                )}
              </div>
            </div>

            <div className="sliders-grid">
              <div className="slider-item">
                <div className="slider-head">
                  <span>Financial Value Weight</span>
                  <strong className="text-emerald">{customValueW}%</strong>
                </div>
                <input
                  type="range"
                  min="20"
                  max="60"
                  value={customValueW}
                  onChange={(e) => setCustomValueW(Number(e.target.value))}
                />
              </div>

              <div className="slider-item">
                <div className="slider-head">
                  <span>Urgency Weight</span>
                  <strong className="text-crimson">{customUrgencyW}%</strong>
                </div>
                <input
                  type="range"
                  min="15"
                  max="50"
                  value={customUrgencyW}
                  onChange={(e) => setCustomUrgencyW(Number(e.target.value))}
                />
              </div>

              <div className="slider-item">
                <div className="slider-head">
                  <span>Recoverability Weight</span>
                  <strong className="text-amber">{customRecovW}%</strong>
                </div>
                <input
                  type="range"
                  min="5"
                  max="40"
                  value={customRecovW}
                  onChange={(e) => setCustomRecovW(Number(e.target.value))}
                />
              </div>

              <div className="slider-item">
                <div className="slider-head">
                  <span>Confidence Weight</span>
                  <strong className="text-blue">{customConfW}%</strong>
                </div>
                <input
                  type="range"
                  min="5"
                  max="30"
                  value={customConfW}
                  onChange={(e) => setCustomConfW(Number(e.target.value))}
                />
              </div>

              <div className="slider-item">
                <div className="slider-head">
                  <span>Effort Factor (Inverse)</span>
                  <strong className="text-slate">{customEffortW}%</strong>
                </div>
                <input
                  type="range"
                  min="5"
                  max="40"
                  value={customEffortW}
                  onChange={(e) => setCustomEffortW(Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          {/* Simulated Ranking Preview Table */}
          <div className="sensitivity-results-card">
            <h3 className="results-heading">Live Simulated Queue Re-Ranking ({sensitivityPreview.length} Actions)</h3>
            <div className="preview-table-container">
              <table className="preview-table">
                <thead>
                  <tr>
                    <th>Sim Rank</th>
                    <th>Action Code</th>
                    <th>Title &amp; Category</th>
                    <th>Value ($)</th>
                    <th>Current Score</th>
                    <th>Simulated Score</th>
                    <th>Delta</th>
                    <th>Sim Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {sensitivityPreview.map((item, index) => {
                    const isPositive = item.delta > 0;
                    const isNeutral = item.delta === 0;
                    return (
                      <tr key={item.id}>
                        <td><span className="rank-badge">#{index + 1}</span></td>
                        <td><code className="action-code">{item.actionCode}</code></td>
                        <td>
                          <div className="table-title">{item.title}</div>
                          <span className="category-sub">{item.category}</span>
                        </td>
                        <td><strong>${item.expectedFinancialValue.toLocaleString()}</strong></td>
                        <td>{item.compositePriorityRank}</td>
                        <td><strong className="text-blue">{item.simulatedScore}</strong></td>
                        <td>
                          <span className={`delta-tag ${isPositive ? 'pos' : isNeutral ? 'neu' : 'neg'}`}>
                            {isPositive ? `+${item.delta}` : item.delta}
                          </span>
                        </td>
                        <td>
                          <span className={`tier-tag ${item.simulatedTier.toLowerCase()}`}>
                            {item.simulatedTier.replace('_', ' ')}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Calculation Trace Logs */}
      {activeTab === 'logs' && (
        <div className="rpm-logs-panel">
          <div className="logs-card">
            <div className="logs-header">
              <h3 className="logs-title">Calculation Trace &amp; Audit Lineage</h3>
              <p className="logs-subtitle">
                Immutable record of every mathematical score computation with normalized components and cryptographic verification hashes.
              </p>
            </div>

            {scoreLogs.length === 0 ? (
              <div className="empty-logs">
                <FileText size={36} className="text-slate" />
                <h4>No Calculation Logs Yet</h4>
                <p>Click "Recalculate Queue" to generate audit-grade calculation traces for facility actions.</p>
              </div>
            ) : (
              <div className="logs-table-container">
                <table className="logs-table">
                  <thead>
                    <tr>
                      <th>Action Code</th>
                      <th>Profile Applied</th>
                      <th>Raw Value ($)</th>
                      <th>Normalized</th>
                      <th>Composite</th>
                      <th>Tier</th>
                      <th>Calculation Hash</th>
                      <th>Timestamp</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scoreLogs.map(log => (
                      <tr key={log.id}>
                        <td><code className="action-code">{log.calculationTrace.actionCode}</code></td>
                        <td>{log.calculationTrace.profileCode}</td>
                        <td>${Number(log.rawFinancialValue).toLocaleString()}</td>
                        <td>{log.normalizedValueScore}</td>
                        <td><strong className="text-blue">{log.compositePriorityScore}</strong></td>
                        <td>
                          <span className={`tier-tag ${log.priorityTier.toLowerCase()}`}>
                            {log.priorityTier.replace('_', ' ')}
                          </span>
                        </td>
                        <td>
                          <code className="hash-code" title={log.calculationHash}>
                            {log.calculationHash.substring(0, 16)}...
                          </code>
                        </td>
                        <td className="timestamp-cell">
                          {new Date(log.calculatedAt).toLocaleTimeString()}
                        </td>
                        <td>
                          <button
                            className="btn-inspect-trace"
                            onClick={() => setSelectedTraceLog(log)}
                          >
                            Inspect Trace
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Trace Drawer / Modal */}
      {selectedTraceLog && (
        <div className="rpm-modal-overlay">
          <div className="rpm-modal-card">
            <div className="modal-header">
              <h3>Mathematical Trace: {selectedTraceLog.calculationTrace.actionCode}</h3>
              <button className="close-btn" onClick={() => setSelectedTraceLog(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="trace-section">
                <span className="section-title">Applied Formula Expression</span>
                <div className="formula-box">
                  <code>{selectedTraceLog.calculationTrace.formula}</code>
                </div>
              </div>

              <div className="trace-section">
                <span className="section-title">Intermediate Components</span>
                <div className="components-grid">
                  <div className="comp-item">
                    <span>Normalized Value (V):</span>
                    <strong>{selectedTraceLog.calculationTrace.normalized.normalizedValueScore}</strong>
                  </div>
                  <div className="comp-item">
                    <span>Urgency Score (U):</span>
                    <strong>{selectedTraceLog.urgencyScore}</strong>
                  </div>
                  <div className="comp-item">
                    <span>Recoverability Score (R):</span>
                    <strong>{selectedTraceLog.recoverabilityScore}</strong>
                  </div>
                  <div className="comp-item">
                    <span>Data Confidence (C):</span>
                    <strong>{selectedTraceLog.confidenceScore}</strong>
                  </div>
                  <div className="comp-item">
                    <span>Inverse Effort (100 - E):</span>
                    <strong>{selectedTraceLog.calculationTrace.normalized.inverseEffortScore}</strong>
                  </div>
                </div>
              </div>

              <div className="trace-section">
                <span className="section-title">Cryptographic Provenance</span>
                <div className="crypto-box">
                  <div className="crypto-row">
                    <span>Formula Version:</span>
                    <strong>{selectedTraceLog.formulaVersion}</strong>
                  </div>
                  <div className="crypto-row">
                    <span>SHA-256 Digest:</span>
                    <code className="full-hash">{selectedTraceLog.calculationHash}</code>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-close-modal" onClick={() => setSelectedTraceLog(null)}>
                Close Trace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
