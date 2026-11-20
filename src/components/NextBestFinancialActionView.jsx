/**
 * ==============================================================================
 * Phase D0: Next Best Financial Action View
 * Module 13: Decision Intelligence
 * Displays daily ranked financial actions, deterministic multi-parameter scoring,
 * interactive 1-click execution workflows, assignment, and dismissal governance.
 * Maestro Clinical Design System: Emerald, Amber, Crimson, Sky, Slate, Neutral
 * Strictly Zero Prohibited Accent Tokens
 * ==============================================================================
 */

import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  DollarSign,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Filter,
  Search,
  UserCheck,
  XCircle,
  ArrowRight,
  ShieldAlert,
  Sparkles,
  RefreshCw,
  FileText,
  Building2,
  Calendar,
  Layers,
  Award
} from 'lucide-react';
import {
  ACTION_CATEGORIES,
  ACTION_CATEGORY_LABELS,
  PRIORITY_TIERS,
  ACTION_STATUSES,
  DISMISSAL_REASONS,
  getNextBestFinancialActions,
  getActionById,
  executeActionTransition,
  dismissAction,
  assignAction,
  getNBFATelemetry,
  calculatePriorityScore
} from '../services/nextBestActionService';
import './NextBestFinancialActionView.css';

export default function NextBestFinancialActionView({ activeFacility }) {
  const facilityId = activeFacility?.id || 'fac-naples-01';
  const facilityName = activeFacility?.name || 'Naples Surgery Center';

  // Filters state
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedPriority, setSelectedPriority] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('queue'); // 'queue' | 'calculator' | 'history'

  // Modals state
  const [selectedAction, setSelectedAction] = useState(null);
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isDismissModalOpen, setIsDismissModalOpen] = useState(false);
  const [assignUser, setAssignUser] = useState('usr_sarah_rcm');
  const [assignRole, setAssignRole] = useState('billing_specialist');
  const [dismissReason, setDismissReason] = useState('INELIGIBLE_PAYER_CLAUSE');
  const [dismissNotes, setDismissNotes] = useState('');
  const [toastMessage, setToastMessage] = useState(null);

  // Custom Simulator / Calculator state
  const [calcValue, setCalcValue] = useState(8500);
  const [calcUrgency, setCalcUrgency] = useState(80);
  const [calcRecoverability, setCalcRecoverability] = useState(85);
  const [calcConfidence, setCalcConfidence] = useState(90);
  const [calcEffort, setCalcEffort] = useState(25);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Telemetry KPIs
  const telemetry = useMemo(() => {
    return getNBFATelemetry(facilityId);
  }, [facilityId, toastMessage]);

  // Actions list filtered
  const actionsList = useMemo(() => {
    return getNextBestFinancialActions(facilityId, {
      category: selectedCategory,
      priorityTier: selectedPriority,
      status: selectedStatus,
      searchTerm: searchQuery
    });
  }, [facilityId, selectedCategory, selectedPriority, selectedStatus, searchQuery, toastMessage]);

  // Custom Calculator Score
  const simulatedScore = useMemo(() => {
    return calculatePriorityScore({
      expectedFinancialValue: calcValue,
      urgencyScore: calcUrgency,
      recoverabilityScore: calcRecoverability,
      confidenceScore: calcConfidence,
      effortScore: calcEffort
    });
  }, [calcValue, calcUrgency, calcRecoverability, calcConfidence, calcEffort]);

  // Modal Handlers
  const handleOpenResolve = (action) => {
    setSelectedAction(action);
    setIsResolveModalOpen(true);
  };

  const handleOpenAssign = (action) => {
    setSelectedAction(action);
    setAssignUser(action.assignedTo || 'usr_sarah_rcm');
    setAssignRole(action.assignedRole || 'billing_specialist');
    setIsAssignModalOpen(true);
  };

  const handleOpenDismiss = (action) => {
    setSelectedAction(action);
    setDismissReason('INELIGIBLE_PAYER_CLAUSE');
    setDismissNotes('');
    setIsDismissModalOpen(true);
  };

  const handleConfirmResolve = () => {
    if (!selectedAction) return;
    try {
      executeActionTransition(selectedAction.id, ACTION_STATUSES.COMPLETED, {
        userId: 'usr_sarah_rcm',
        notes: 'Action executed and verified via 1-click execution workflow.'
      });
      showToast(`Action ${selectedAction.actionCode} successfully completed!`);
      setIsResolveModalOpen(false);
      setSelectedAction(null);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleConfirmAssign = () => {
    if (!selectedAction) return;
    try {
      assignAction(selectedAction.id, assignUser, assignRole, {
        userId: 'usr_current_lead'
      });
      showToast(`Action ${selectedAction.actionCode} assigned to ${assignUser}`);
      setIsAssignModalOpen(false);
      setSelectedAction(null);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleConfirmDismiss = () => {
    if (!selectedAction) return;
    try {
      dismissAction(selectedAction.id, dismissReason, dismissNotes, {
        userId: 'usr_financial_controller'
      });
      showToast(`Action ${selectedAction.actionCode} dismissed.`);
      setIsDismissModalOpen(false);
      setSelectedAction(null);
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="nbfa-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="nbfa-toast">
          <CheckCircle2 size={16} className="text-emerald" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="nbfa-header">
        <div className="nbfa-header-left">
          <div className="nbfa-title-row">
            <h1 className="nbfa-title">Next Best Financial Action Engine</h1>
            <span className="nbfa-facility-pill">
              <Building2 size={12} />
              {facilityName}
            </span>
            <span className="nbfa-ver-badge">v1.0 Production</span>
          </div>
          <p className="nbfa-subtitle">
            Daily ranked financial recommendations, deterministic priority scoring, and auditable action resolution.
          </p>
        </div>
        <div className="nbfa-header-right">
          <button className="nbfa-btn-secondary" onClick={() => showToast('Refreshed daily priority queue.')}>
            <RefreshCw size={14} /> Refresh Feed
          </button>
        </div>
      </div>

      {/* 5-Card Executive Telemetry Ribbon */}
      <div className="nbfa-ribbon-grid">
        <div className="nbfa-ribbon-card">
          <div className="card-top">
            <span className="card-label">Active Queue</span>
            <div className="icon-wrapper blue">
              <Layers size={18} />
            </div>
          </div>
          <div className="card-metric">{telemetry.activeActionsCount}</div>
          <div className="card-footer-info">
            <span className="pill-blue">Daily Feed</span>
            <span>of {telemetry.totalActionsCount} Total Actions</span>
          </div>
        </div>

        <div className="nbfa-ribbon-card">
          <div className="card-top">
            <span className="card-label">Recoverable Pipeline</span>
            <div className="icon-wrapper emerald">
              <DollarSign size={18} />
            </div>
          </div>
          <div className="card-metric">${telemetry.totalPipelineRecoveryValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          <div className="card-footer-info">
            <span className="pill-success">Deterministic</span>
            <span>Zero generative drift</span>
          </div>
        </div>

        <div className="nbfa-ribbon-card">
          <div className="card-top">
            <span className="card-label">Critical P0 Actions</span>
            <div className="icon-wrapper crimson">
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className="card-metric">{telemetry.urgentP0Count}</div>
          <div className="card-footer-info">
            <span className="pill-danger">Urgent SLA</span>
            <span>&lt; 48h expiration</span>
          </div>
        </div>

        <div className="nbfa-ribbon-card">
          <div className="card-top">
            <span className="card-label">Avg Recoverability</span>
            <div className="icon-wrapper amber">
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="card-metric">{telemetry.avgRecoverabilityPct}%</div>
          <div className="card-footer-info">
            <span className="pill-warn">Payer Odds</span>
            <span>Historic win rate</span>
          </div>
        </div>

        <div className="nbfa-ribbon-card">
          <div className="card-top">
            <span className="card-label">Mean Action Velocity</span>
            <div className="icon-wrapper blue">
              <Clock size={18} />
            </div>
          </div>
          <div className="card-metric">{telemetry.avgResolutionVelocityHours}h</div>
          <div className="card-footer-info">
            <span className="pill-blue">Turnaround</span>
            <span>{telemetry.completedActionsCount} completed MTD</span>
          </div>
        </div>
      </div>

      {/* Main Tab Bar */}
      <div className="nbfa-nav-tabs">
        <button
          className={`tab-btn ${activeTab === 'queue' ? 'active' : ''}`}
          onClick={() => setActiveTab('queue')}
        >
          <TrendingUp size={14} /> Ranked Action Queue ({actionsList.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'calculator' ? 'active' : ''}`}
          onClick={() => setActiveTab('calculator')}
        >
          <Award size={14} /> Priority Score Simulator
        </button>
      </div>

      {activeTab === 'queue' && (
        <div className="nbfa-workspace">
          {/* Filter Bar */}
          <div className="nbfa-filter-bar">
            {/* Domain Pills */}
            <div className="domain-pills">
              <button
                className={`pill-btn ${selectedCategory === 'ALL' ? 'active' : ''}`}
                onClick={() => setSelectedCategory('ALL')}
              >
                All Domains
              </button>
              <button
                className={`pill-btn ${selectedCategory === ACTION_CATEGORIES.DENIAL_APPEAL_URGENT ? 'active' : ''}`}
                onClick={() => setSelectedCategory(ACTION_CATEGORIES.DENIAL_APPEAL_URGENT)}
              >
                Denials
              </button>
              <button
                className={`pill-btn ${selectedCategory === ACTION_CATEGORIES.OR_BLOCK_RELEASE ? 'active' : ''}`}
                onClick={() => setSelectedCategory(ACTION_CATEGORIES.OR_BLOCK_RELEASE)}
              >
                OR Blocks
              </button>
              <button
                className={`pill-btn ${selectedCategory === ACTION_CATEGORIES.UNBILLED_CASE_EXPEDITE ? 'active' : ''}`}
                onClick={() => setSelectedCategory(ACTION_CATEGORIES.UNBILLED_CASE_EXPEDITE)}
              >
                Unbilled Cases
              </button>
              <button
                className={`pill-btn ${selectedCategory === ACTION_CATEGORIES.UNDERPAYMENT_RECOVERY ? 'active' : ''}`}
                onClick={() => setSelectedCategory(ACTION_CATEGORIES.UNDERPAYMENT_RECOVERY)}
              >
                Underpayments
              </button>
              <button
                className={`pill-btn ${selectedCategory === ACTION_CATEGORIES.IMPLANT_CARVEOUT_CLAIM ? 'active' : ''}`}
                onClick={() => setSelectedCategory(ACTION_CATEGORIES.IMPLANT_CARVEOUT_CLAIM)}
              >
                Implants
              </button>
              <button
                className={`pill-btn ${selectedCategory === ACTION_CATEGORIES.PRE_SERVICE_DEPOSIT_COLLECTION ? 'active' : ''}`}
                onClick={() => setSelectedCategory(ACTION_CATEGORIES.PRE_SERVICE_DEPOSIT_COLLECTION)}
              >
                Patient AR
              </button>
            </div>

            {/* Dropdowns and Search */}
            <div className="filter-controls">
              <div className="search-box">
                <Search size={14} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search code, claim, case..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <select
                className="filter-select"
                value={selectedPriority}
                onChange={(e) => setSelectedPriority(e.target.value)}
              >
                <option value="ALL">All Priorities</option>
                <option value={PRIORITY_TIERS.P0_CRITICAL}>P0 - Critical</option>
                <option value={PRIORITY_TIERS.P1_HIGH}>P1 - High</option>
                <option value={PRIORITY_TIERS.P2_MEDIUM}>P2 - Medium</option>
                <option value={PRIORITY_TIERS.P3_ROUTINE}>P3 - Routine</option>
              </select>

              <select
                className="filter-select"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
              >
                <option value="ALL">All Statuses</option>
                <option value={ACTION_STATUSES.PENDING}>Pending</option>
                <option value={ACTION_STATUSES.ASSIGNED}>Assigned</option>
                <option value={ACTION_STATUSES.COMPLETED}>Completed</option>
                <option value={ACTION_STATUSES.DISMISSED}>Dismissed</option>
              </select>
            </div>
          </div>

          {/* Action Cards Grid */}
          <div className="nbfa-actions-list">
            {actionsList.length === 0 ? (
              <div className="nbfa-empty-state">
                <CheckCircle2 size={36} className="text-emerald" />
                <h3>No Actions Found</h3>
                <p>All items matching your current filters have been resolved or dismissed.</p>
              </div>
            ) : (
              actionsList.map((action, idx) => {
                const isP0 = action.priorityTier === PRIORITY_TIERS.P0_CRITICAL;
                const isP1 = action.priorityTier === PRIORITY_TIERS.P1_HIGH;
                const isCompleted = action.status === ACTION_STATUSES.COMPLETED;
                const isDismissed = action.status === ACTION_STATUSES.DISMISSED;

                return (
                  <div key={action.id} className={`action-card ${isP0 ? 'border-crimson' : isP1 ? 'border-amber' : ''}`}>
                    <div className="action-card-header">
                      <div className="rank-and-code">
                        <span className="rank-badge">#{idx + 1}</span>
                        <code className="action-code">{action.actionCode}</code>
                        <span className={`priority-badge ${isP0 ? 'p0' : isP1 ? 'p1' : 'p2'}`}>
                          {action.priorityTier.replace('_', ' ')}
                        </span>
                        <span className="category-pill">
                          {ACTION_CATEGORY_LABELS[action.category] || action.category}
                        </span>
                      </div>
                      <div className="financial-tag">
                        <span className="value-label">Recoverable Value:</span>
                        <span className="value-amount">${action.expectedFinancialValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>

                    <div className="action-card-body">
                      <h3 className="action-title">{action.title}</h3>
                      <p className="action-desc">{action.description}</p>

                      {/* Evidence Pill Tags */}
                      <div className="evidence-tags">
                        {action.evidenceSummary.map((ev, i) => (
                          <span key={i} className="evidence-pill" title={ev.label}>
                            <FileText size={11} /> {ev.code}
                          </span>
                        ))}
                      </div>

                      {/* Multi-parameter Scores Ribbon */}
                      <div className="score-parameters-bar">
                        <div className="param-item">
                          <span className="param-label">Composite Rank:</span>
                          <span className="param-val highlight">{action.compositePriorityRank}</span>
                        </div>
                        <div className="param-item">
                          <span className="param-label">Urgency:</span>
                          <span className="param-val">{action.urgencyScore}%</span>
                        </div>
                        <div className="param-item">
                          <span className="param-label">Recoverability:</span>
                          <span className="param-val">{action.recoverabilityScore}%</span>
                        </div>
                        <div className="param-item">
                          <span className="param-label">Confidence:</span>
                          <span className="param-val">{action.confidenceScore}%</span>
                        </div>
                        <div className="param-item">
                          <span className="param-label">Status:</span>
                          <span className={`status-pill ${action.status.toLowerCase()}`}>{action.status}</span>
                        </div>
                      </div>
                    </div>

                    <div className="action-card-footer">
                      <div className="assignee-info">
                        <UserCheck size={14} className="text-slate" />
                        <span>{action.assignedTo ? `${action.assignedTo} (${action.assignedRole})` : 'Unassigned'}</span>
                      </div>

                      <div className="action-buttons">
                        {!isCompleted && !isDismissed && (
                          <>
                            <button
                              className="btn-assign"
                              onClick={() => handleOpenAssign(action)}
                            >
                              Assign
                            </button>
                            <button
                              className="btn-dismiss"
                              onClick={() => handleOpenDismiss(action)}
                            >
                              Dismiss
                            </button>
                            <button
                              className="btn-resolve"
                              onClick={() => handleOpenResolve(action)}
                            >
                              Execute Action <ArrowRight size={14} />
                            </button>
                          </>
                        )}
                        {isCompleted && (
                          <span className="completed-badge">
                            <CheckCircle2 size={14} /> Completed
                          </span>
                        )}
                        {isDismissed && (
                          <span className="dismissed-badge">
                            <XCircle size={14} /> Dismissed: {action.dismissalReason}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Priority Score Simulator Tab */}
      {activeTab === 'calculator' && (
        <div className="nbfa-calculator-panel">
          <div className="calc-card">
            <h2 className="calc-heading">Deterministic Multi-Parameter Scoring Engine</h2>
            <p className="calc-desc">
              Test how financial recovery value, urgency deadlines, payer recoverability odds, data confidence,
              and staff effort dynamically calculate the action priority score and assign priority tiers.
            </p>

            <div className="calc-grid">
              <div className="calc-controls">
                <div className="slider-group">
                  <div className="slider-label">
                    <span>Expected Recovery Value ($)</span>
                    <span className="slider-val">${calcValue.toLocaleString()}</span>
                  </div>
                  <input
                    type="range"
                    min="500"
                    max="25000"
                    step="250"
                    value={calcValue}
                    onChange={(e) => setCalcValue(Number(e.target.value))}
                  />
                  <span className="weight-note">Weight: 35% of total score (max cap: $25,000)</span>
                </div>

                <div className="slider-group">
                  <div className="slider-label">
                    <span>Urgency & Deadline Risk</span>
                    <span className="slider-val">{calcUrgency}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={calcUrgency}
                    onChange={(e) => setCalcUrgency(Number(e.target.value))}
                  />
                  <span className="weight-note">Weight: 25% (filing limits, auto-release cutoffs)</span>
                </div>

                <div className="slider-group">
                  <div className="slider-label">
                    <span>Payer Recoverability Probability</span>
                    <span className="slider-val">{calcRecoverability}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={calcRecoverability}
                    onChange={(e) => setCalcRecoverability(Number(e.target.value))}
                  />
                  <span className="weight-note">Weight: 20% (historical appeal win rates)</span>
                </div>

                <div className="slider-group">
                  <div className="slider-label">
                    <span>Data Confidence & Evidence Completeness</span>
                    <span className="slider-val">{calcConfidence}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={calcConfidence}
                    onChange={(e) => setCalcConfidence(Number(e.target.value))}
                  />
                  <span className="weight-note">Weight: 10% (verified source records)</span>
                </div>

                <div className="slider-group">
                  <div className="slider-label">
                    <span>Operational Effort (Inverse)</span>
                    <span className="slider-val">{calcEffort}%</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    value={calcEffort}
                    onChange={(e) => setCalcEffort(Number(e.target.value))}
                  />
                  <span className="weight-note">Weight: 10% inverse (lower effort = higher rank)</span>
                </div>
              </div>

              {/* Calculator Output Display */}
              <div className="calc-result-box">
                <span className="result-tag">Composite Priority Result</span>
                <div className="result-score">{simulatedScore.compositeScore}</div>
                <div className={`result-tier ${simulatedScore.priorityTier.toLowerCase()}`}>
                  {simulatedScore.priorityTier.replace('_', ' ')}
                </div>

                <div className="breakdown-list">
                  <div className="breakdown-row">
                    <span>Financial Value Component:</span>
                    <span className="font-bold">{simulatedScore.breakdown.valueComponent} / 35.0</span>
                  </div>
                  <div className="breakdown-row">
                    <span>Urgency Component:</span>
                    <span className="font-bold">{simulatedScore.breakdown.urgencyComponent} / 25.0</span>
                  </div>
                  <div className="breakdown-row">
                    <span>Recoverability Component:</span>
                    <span className="font-bold">{simulatedScore.breakdown.recoverabilityComponent} / 20.0</span>
                  </div>
                  <div className="breakdown-row">
                    <span>Confidence Component:</span>
                    <span className="font-bold">{simulatedScore.breakdown.confidenceComponent} / 10.0</span>
                  </div>
                  <div className="breakdown-row">
                    <span>Effort Factor (Inverse):</span>
                    <span className="font-bold">{simulatedScore.breakdown.effortComponent} / 10.0</span>
                  </div>
                </div>

                <div className="calc-formula-footer">
                  <code>Score = (Value*35%) + (Urg*25%) + (Rec*20%) + (Conf*10%) + ((100-Eff)*10%)</code>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Resolve / Execute Modal */}
      {isResolveModalOpen && selectedAction && (
        <div className="nbfa-modal-overlay">
          <div className="nbfa-modal-card">
            <div className="modal-header">
              <h3>Execute Financial Action: {selectedAction.actionCode}</h3>
              <button className="close-btn" onClick={() => setIsResolveModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="modal-section">
                <span className="section-label">Action Title</span>
                <p className="font-bold">{selectedAction.title}</p>
              </div>
              <div className="modal-section">
                <span className="section-label">Source Record Reference</span>
                <div className="source-box">
                  <span>Type: <strong>{selectedAction.sourceEntityType}</strong></span>
                  <span>Identifier: <strong>{selectedAction.sourceEntityId}</strong></span>
                  <span>Target Value: <strong>${selectedAction.expectedFinancialValue.toLocaleString()}</strong></span>
                </div>
              </div>
              <div className="modal-section">
                <span className="section-label">Verification Evidence</span>
                <ul className="evidence-list">
                  {selectedAction.evidenceSummary.map((ev, i) => (
                    <li key={i}><strong>{ev.code}</strong> — {ev.label}</li>
                  ))}
                </ul>
              </div>
              <div className="modal-section">
                <span className="section-label">Resolution Checklist</span>
                <div className="checklist">
                  <label><input type="checkbox" defaultChecked /> Verify payer contract multiplier & carveout terms</label>
                  <label><input type="checkbox" defaultChecked /> Reconcile invoice acquisition cost with EHR log</label>
                  <label><input type="checkbox" defaultChecked /> Attach claim adjustment trace & export 837 package</label>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setIsResolveModalOpen(false)}>Cancel</button>
              <button className="btn-confirm-resolve" onClick={handleConfirmResolve}>
                <CheckCircle2 size={14} /> Confirm & Mark Completed
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {isAssignModalOpen && selectedAction && (
        <div className="nbfa-modal-overlay">
          <div className="nbfa-modal-card">
            <div className="modal-header">
              <h3>Assign Action: {selectedAction.actionCode}</h3>
              <button className="close-btn" onClick={() => setIsAssignModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="modal-field">
                <label>Assign To User</label>
                <select value={assignUser} onChange={(e) => setAssignUser(e.target.value)}>
                  <option value="usr_sarah_rcm">Sarah Jenkins (Senior RCM Specialist)</option>
                  <option value="usr_marcus_vance">Dr. Marcus Vance (Attending Surgeon)</option>
                  <option value="usr_elena_or">Elena Rostova (OR Clinical Director)</option>
                  <option value="usr_david_mat">David Kroll (Materials & Supply Lead)</option>
                  <option value="usr_claire_front">Claire Bennett (Patient Access Counselor)</option>
                </select>
              </div>
              <div className="modal-field">
                <label>Operational Role</label>
                <select value={assignRole} onChange={(e) => setAssignRole(e.target.value)}>
                  <option value="billing_specialist">Billing Specialist / RCM</option>
                  <option value="clinical_admin">Clinical Administrator</option>
                  <option value="or_director">Operating Room Director</option>
                  <option value="materials_manager">Materials Manager</option>
                  <option value="front_desk">Front Desk / Financial Counselor</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setIsAssignModalOpen(false)}>Cancel</button>
              <button className="btn-confirm-assign" onClick={handleConfirmAssign}>
                <UserCheck size={14} /> Confirm Assignment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dismiss Modal */}
      {isDismissModalOpen && selectedAction && (
        <div className="nbfa-modal-overlay">
          <div className="nbfa-modal-card">
            <div className="modal-header danger">
              <h3>Dismiss Action: {selectedAction.actionCode}</h3>
              <button className="close-btn" onClick={() => setIsDismissModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <p className="dismiss-warning">
                Dismissing an action removes it from the daily prioritization queue. A mandatory canonical
                reason code and auditor rationale must be documented.
              </p>
              <div className="modal-field">
                <label>Canonical Dismissal Reason</label>
                <select value={dismissReason} onChange={(e) => setDismissReason(e.target.value)}>
                  {Object.entries(DISMISSAL_REASONS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="modal-field">
                <label>Auditor Notes & Justification (Mandatory)</label>
                <textarea
                  rows={3}
                  placeholder="Detail the clinical or contractual justification for dismissing this opportunity..."
                  value={dismissNotes}
                  onChange={(e) => setDismissNotes(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setIsDismissModalOpen(false)}>Cancel</button>
              <button className="btn-confirm-dismiss" onClick={handleConfirmDismiss}>
                <XCircle size={14} /> Confirm Dismissal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
