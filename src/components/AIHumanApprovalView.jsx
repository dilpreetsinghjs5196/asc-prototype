/**
 * ==============================================================================
 * Phase C6: AI Human Approval & Consequential Action Governance Console
 * Module 12: AI & Intelligence
 * Maestro Clinical Design System: Emerald, Amber, Crimson, Sky, Slate, Neutral
 * Strictly Zero Prohibited Accent Tokens
 * Full Light & Dark Theme Support ([data-theme="dark"])
 * ==============================================================================
 */

import React, { useState, useMemo } from 'react';
import {
  UserCheck,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Activity,
  Shield,
  History,
  Play,
  Search,
  Filter,
  Check,
  X,
  AlertTriangle,
  ArrowRight,
  Code2,
  FileText,
  Key,
  Users,
  Sliders,
  DollarSign
} from 'lucide-react';
import {
  GOVERNANCE_TIERS,
  ACTION_TYPES,
  APPROVAL_STATUSES,
  KEY_POSITIONS,
  SIGNATURE_DECISIONS,
  getApprovalQueue,
  getApprovalDetail,
  submitDigitalSignature,
  executeApprovedAction,
  rollbackConsequentialAction,
  getHumanApprovalTelemetry
} from '../services/aiHumanApprovalService.js';
import './AIHumanApprovalView.css';

export default function AIHumanApprovalView({ activeFacility = 'fac-naples-01' }) {
  const [activeTab, setActiveTab] = useState('queue'); // 'queue', 'executions', 'matrix', 'sandbox'
  const [tierFilter, setTierFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProposal, setSelectedProposal] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Signing Modal State
  const [isSigningModalOpen, setIsSigningModalOpen] = useState(false);
  const [activeProposalToSign, setActiveProposalToSign] = useState(null);
  const [signerRole, setSignerRole] = useState('facility_admin');
  const [signerName, setSignerName] = useState('Administrator Marcus');
  const [signerId, setSignerId] = useState('usr_fac_admin_99');
  const [attestationText, setAttestationText] = useState('I affirmatively verify that this operational modification adheres to clinical guidelines and executive governance.');

  // Sandbox Step Simulation State
  const [sandboxStep, setSandboxStep] = useState(1); // 1: Proposed, 2: Key 1 Signed, 3: Key 2 Approved, 4: Executed, 5: Rolled Back

  const telemetry = useMemo(() => {
    return getHumanApprovalTelemetry(activeFacility);
  }, [activeFacility, toastMessage, sandboxStep]);

  const approvalRequests = useMemo(() => {
    return getApprovalQueue(activeFacility, {
      tier: tierFilter,
      status: statusFilter,
      searchQuery
    });
  }, [activeFacility, tierFilter, statusFilter, searchQuery, toastMessage]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleOpenSignModal = (proposal, e) => {
    if (e) e.stopPropagation();
    setActiveProposalToSign(proposal);
    setIsSigningModalOpen(true);
  };

  const handleSign = (decision) => {
    if (!activeProposalToSign) return;
    try {
      const res = submitDigitalSignature(activeProposalToSign.id, {
        signerId,
        signerName,
        signerRole,
        decision,
        attestationStatement: attestationText
      });
      setIsSigningModalOpen(false);
      showToast(res.message);
    } catch (err) {
      showToast(`Signature Error: ${err.message}`);
    }
  };

  const handleExecute = (proposalId, e) => {
    if (e) e.stopPropagation();
    try {
      const res = executeApprovedAction(proposalId, { executorId: signerId });
      showToast(res.message);
    } catch (err) {
      showToast(`Execution Error: ${err.message}`);
    }
  };

  const handleRollback = (proposalId, e) => {
    if (e) e.stopPropagation();
    try {
      const res = rollbackConsequentialAction(proposalId, {
        rolledBackBy: signerId,
        reason: 'Administrative rollback requested via governance console.'
      });
      showToast(res.message);
    } catch (err) {
      showToast(`Rollback Error: ${err.message}`);
    }
  };

  return (
    <div className="aiha-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="aiha-toast">
          <CheckCircle2 size={16} className="text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 5-Card Top Metric Ribbon (Maestro Clinical) */}
      <div className="aiha-ribbon">
        <div className="aiha-ribbon-card primary">
          <div className="card-top">
            <span className="card-label">Pending Dual-Key Signoffs</span>
            <div className="icon-wrapper amber"><Clock size={16} /></div>
          </div>
          <div className="card-metric">{telemetry.pendingSignoffs} <span className="metric-unit">Proposals</span></div>
          <div className="card-footer-info">
            <span>Human-In-The-Loop Gated</span>
            <span className="status-pill pill-warn">Action Required</span>
          </div>
        </div>

        <div className="aiha-ribbon-card">
          <div className="card-top">
            <span className="card-label">Approved & Executed</span>
            <div className="icon-wrapper emerald"><CheckCircle2 size={16} /></div>
          </div>
          <div className="card-metric">{telemetry.approvedExecutions} <span className="metric-unit">Approved</span></div>
          <div className="card-footer-info">
            <span>Cryptographic State Seal</span>
            <span className="status-pill pill-success">Dual Verified</span>
          </div>
        </div>

        <div className="aiha-ribbon-card">
          <div className="card-top">
            <span className="card-label">Vetoed / Rejected</span>
            <div className="icon-wrapper crimson"><XCircle size={16} /></div>
          </div>
          <div className="card-metric">{telemetry.rejectedProposals} <span className="metric-unit">Vetoed</span></div>
          <div className="card-footer-info">
            <span>Executive Veto Gated</span>
            <span className="status-pill pill-blue">Zero Drift</span>
          </div>
        </div>

        <div className="aiha-ribbon-card">
          <div className="card-top">
            <span className="card-label">Avg Signoff Latency</span>
            <div className="icon-wrapper blue"><Activity size={16} /></div>
          </div>
          <div className="card-metric">{telemetry.avgSignoffHours} <span className="metric-unit">Hours</span></div>
          <div className="card-footer-info">
            <span>72h Auto-Expiry Window</span>
            <span className="rate-badge">Fast Governance</span>
          </div>
        </div>

        <div className="aiha-ribbon-card">
          <div className="card-top">
            <span className="card-label">Rollback Readiness</span>
            <div className="icon-wrapper emerald"><RefreshCw size={16} /></div>
          </div>
          <div className="card-metric">{telemetry.rollbackReadinessPct}% <span className="metric-unit">Guaranteed</span></div>
          <div className="card-footer-info">
            <span>1-Click Reversible Safeties</span>
            <span className="status-pill pill-success">Protected</span>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="aiha-tabs-row">
        <div className="tab-buttons">
          <button
            className={`tab-btn ${activeTab === 'queue' ? 'active' : ''}`}
            onClick={() => setActiveTab('queue')}
          >
            <UserCheck size={16} />
            <span>Dual-Key Approval Queue ({telemetry.pendingSignoffs})</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'executions' ? 'active' : ''}`}
            onClick={() => setActiveTab('executions')}
          >
            <History size={16} />
            <span>Executed Actions & Rollback ({telemetry.executedCount})</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'matrix' ? 'active' : ''}`}
            onClick={() => setActiveTab('matrix')}
          >
            <Shield size={16} />
            <span>Governance Tiers & Separation of Duties</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'sandbox' ? 'active' : ''}`}
            onClick={() => setActiveTab('sandbox')}
          >
            <Play size={16} />
            <span>Interactive HITL Simulator</span>
          </button>
        </div>
      </div>

      {/* TAB 1: PENDING DUAL-KEY QUEUE */}
      {activeTab === 'queue' && (
        <div className="tab-pane">
          <div className="queue-filter-bar">
            <div className="tier-pills">
              {['ALL', 'TIER_1_STANDARD', 'TIER_2_DUAL_KEY', 'TIER_3_QUORUM'].map(t => (
                <button
                  key={t}
                  className={`tier-pill ${tierFilter === t ? 'active' : ''}`}
                  onClick={() => setTierFilter(t)}
                >
                  {t === 'ALL' ? 'ALL TIERS' : GOVERNANCE_TIERS[t]?.name.split(':')[0] || t}
                </button>
              ))}
            </div>

            <div className="search-box">
              <Search size={15} className="search-icon" />
              <input
                type="text"
                placeholder="Search code, title, rationale, action..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="proposals-grid">
            {approvalRequests.filter(r => r.status !== APPROVAL_STATUSES.EXECUTED && r.status !== APPROVAL_STATUSES.ROLLED_BACK).map((req) => {
              const isPartiallyApproved = req.status === APPROVAL_STATUSES.PARTIALLY_APPROVED;
              const isFullyApproved = req.status === APPROVAL_STATUSES.APPROVED;
              const isRejected = req.status === APPROVAL_STATUSES.REJECTED;

              return (
                <div
                  key={req.id}
                  className={`proposal-card ${isFullyApproved ? 'card-approved' : ''}`}
                  onClick={() => setSelectedProposal(req)}
                >
                  <div className="proposal-top">
                    <div className="badge-cluster">
                      <span className={`action-badge badge-${req.actionType.toLowerCase()}`}>
                        {req.actionType.replace(/_/g, ' ')}
                      </span>
                      <code className="request-code font-mono">{req.requestCode}</code>
                    </div>
                    <span className={`status-pill ${isFullyApproved ? 'pill-success' : isPartiallyApproved ? 'pill-blue' : isRejected ? 'pill-danger' : 'pill-warn'}`}>
                      {req.status.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <h3 className="proposal-title">{req.title}</h3>
                  <p className="proposal-rationale">{req.rationale}</p>

                  {/* Blast Radius Meta Grid */}
                  <div className="blast-radius-grid">
                    <div className="blast-item">
                      <span className="b-lbl">Financial Exposure</span>
                      <span className="b-val text-blue">
                        ${req.financialExposureUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="blast-item">
                      <span className="b-lbl">Cases Impacted</span>
                      <span className="b-val">{req.affectedCasesCount} Surgical</span>
                    </div>
                    <div className="blast-item">
                      <span className="b-lbl">Physicians</span>
                      <span className="b-val">{req.affectedPhysiciansCount} Surgeons</span>
                    </div>
                    <div className="blast-item">
                      <span className="b-lbl">Signatures</span>
                      <span className="b-val text-emerald">
                        {req.currentSignaturesCount} of {req.requiredSignaturesCount} Signed
                      </span>
                    </div>
                  </div>

                  {/* Signatures Progress Chain */}
                  <div className="signatures-chain">
                    <div className="chain-label">Signoff Chain:</div>
                    <div className="chain-keys">
                      <span className={`key-badge ${req.signatures.length >= 1 ? 'signed' : 'pending'}`}>
                        <Key size={12} />
                        <span>Key 1: {req.signatures[0]?.signerName || 'Pending Review'}</span>
                      </span>
                      {req.requiredSignaturesCount > 1 && (
                        <span className={`key-badge ${req.signatures.length >= 2 ? 'signed' : 'pending'}`}>
                          <Key size={12} />
                          <span>Key 2: {req.signatures[1]?.signerName || 'Pending Executive'}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="proposal-footer-actions">
                    <button
                      className="btn-review-sign"
                      onClick={(e) => handleOpenSignModal(req, e)}
                    >
                      <UserCheck size={14} />
                      <span>Review & Sign</span>
                    </button>
                    {isFullyApproved && (
                      <button
                        className="btn-execute-mutation"
                        onClick={(e) => handleExecute(req.id, e)}
                      >
                        <Play size={14} />
                        <span>Dispatch Execution</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: EXECUTED ACTIONS & 1-CLICK ROLLBACK */}
      {activeTab === 'executions' && (
        <div className="tab-pane">
          <div className="executions-table-card">
            <div className="table-header-box">
              <History size={20} className="text-sky-400" />
              <div>
                <h3>Consequential Mutation History & Rollback Console</h3>
                <p>Every executed operational mutation preserves an immutable pre-state JSON inversion payload enabling guaranteed 1-click rollback within 72 hours.</p>
              </div>
            </div>

            <table className="executions-table">
              <thead>
                <tr>
                  <th>Request Code</th>
                  <th>Action Category</th>
                  <th>Executed Title</th>
                  <th>Executed By</th>
                  <th>Execution Timestamp</th>
                  <th>Reversible Window</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {approvalRequests.filter(r => r.status === APPROVAL_STATUSES.EXECUTED || r.status === APPROVAL_STATUSES.ROLLED_BACK).map((req) => {
                  const exec = req.executionRecord;
                  const isRolledBack = req.status === APPROVAL_STATUSES.ROLLED_BACK;

                  return (
                    <tr key={req.id}>
                      <td><code className="font-mono text-sky">{req.requestCode}</code></td>
                      <td>
                        <span className={`action-badge badge-${req.actionType.toLowerCase()}`}>
                          {req.actionType.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td><strong>{req.title}</strong></td>
                      <td><span className="font-mono text-xs">{exec?.executedBy}</span></td>
                      <td>{new Date(exec?.executedAt).toLocaleString()}</td>
                      <td>
                        <span className="font-mono text-xs text-muted">
                          {isRolledBack ? 'Inverted' : '72h Active'}
                        </span>
                      </td>
                      <td>
                        <span className={`status-pill ${isRolledBack ? 'pill-blue' : 'pill-success'}`}>
                          {req.status}
                        </span>
                      </td>
                      <td>
                        {!isRolledBack ? (
                          <button
                            className="btn-rollback-action"
                            onClick={(e) => handleRollback(req.id, e)}
                          >
                            <RefreshCw size={12} />
                            <span>1-Click Rollback</span>
                          </button>
                        ) : (
                          <span className="text-muted text-xs">Rolled Back</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: GOVERNANCE TIERS & MATRIX */}
      {activeTab === 'matrix' && (
        <div className="tab-pane">
          <div className="matrix-cards-grid">
            {Object.values(GOVERNANCE_TIERS).map((tier) => (
              <div key={tier.id} className="tier-card">
                <div className="tier-top">
                  <span className="tier-code font-mono">{tier.id}</span>
                  <span className="status-pill pill-blue">
                    {tier.requiredSignatures} Signature{tier.requiredSignatures > 1 ? 's' : ''}
                  </span>
                </div>
                <h3>{tier.name}</h3>
                <p className="tier-desc">{tier.description}</p>

                <div className="tier-rules-box">
                  <div className="rule-row">
                    <span className="r-lbl">Financial Ceiling:</span>
                    <span className="r-val">{tier.ceilingUsd === Infinity ? 'Uncapped (> $25,000)' : `Up to $${tier.ceilingUsd.toLocaleString()}`}</span>
                  </div>
                  <div className="rule-row">
                    <span className="r-lbl">Authorized Approvers:</span>
                    <span className="r-val">Clinical Director, CFO, Facility Admin</span>
                  </div>
                  <div className="rule-row">
                    <span className="r-lbl">Separation of Duties:</span>
                    <span className="r-val text-emerald">Strictly Enforced (No Self-Approval)</span>
                  </div>
                  <div className="rule-row">
                    <span className="r-lbl">Rollback Grace Window:</span>
                    <span className="r-val">72 Hours Guaranteed Inversion</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: INTERACTIVE HITL SIMULATOR SANDBOX */}
      {activeTab === 'sandbox' && (
        <div className="tab-pane">
          <div className="sandbox-stepper-card">
            <div className="stepper-header">
              <Play size={22} className="text-sky-400" />
              <div>
                <h2>Interactive Dual-Key HITL Simulation Walkthrough</h2>
                <p>Experience the complete lifecycle of consequential AI governance: AI Proposal, Key 1 Operational Review, Key 2 Executive Signoff, Execution Dispatch, and 1-Click Rollback.</p>
              </div>
            </div>

            {/* Stepper Progress Bar */}
            <div className="stepper-progress">
              <div className={`step-node ${sandboxStep >= 1 ? 'completed' : ''}`}>1. AI Proposal</div>
              <ArrowRight size={16} className="text-slate-400" />
              <div className={`step-node ${sandboxStep >= 2 ? 'completed' : ''}`}>2. Key 1 (Clinical Director)</div>
              <ArrowRight size={16} className="text-slate-400" />
              <div className={`step-node ${sandboxStep >= 3 ? 'completed' : ''}`}>3. Key 2 (Facility Admin)</div>
              <ArrowRight size={16} className="text-slate-400" />
              <div className={`step-node ${sandboxStep >= 4 ? 'completed' : ''}`}>4. Execution Dispatch</div>
              <ArrowRight size={16} className="text-slate-400" />
              <div className={`step-node ${sandboxStep === 5 ? 'completed' : ''}`}>5. 1-Click Rollback</div>
            </div>

            {/* Step Content Card */}
            <div className="sim-step-box">
              {sandboxStep === 1 && (
                <div className="sim-content">
                  <h4>Stage 1: AI Recommendation Generated</h4>
                  <p>AI Analyst recommends transferring 4 monthly block hours from General Surgery (Room 3) to Orthopaedics (Room 2) for Dr. Marcus Vance. Projected financial lift: <strong>+$14,200.00/mo</strong>.</p>
                  <div className="sim-actions">
                    <button className="btn-sim-next" onClick={() => setSandboxStep(2)}>
                      Sign Key 1 as Clinical Director (Dr. Lin)
                    </button>
                  </div>
                </div>
              )}

              {sandboxStep === 2 && (
                <div className="sim-content">
                  <h4>Stage 2: Key 1 Digitally Signed</h4>
                  <p>Dr. Sarah Lin (Clinical Director) submitted digital signature hash <code>e5b7a12849...</code>. Status: <strong>PARTIALLY APPROVED</strong>. Awaiting independent Key 2 executive signoff.</p>
                  <div className="sim-actions">
                    <button className="btn-sim-next" onClick={() => setSandboxStep(3)}>
                      Sign Key 2 as Facility Administrator
                    </button>
                  </div>
                </div>
              )}

              {sandboxStep === 3 && (
                <div className="sim-content">
                  <h4>Stage 3: Dual-Key Fulfilled (APPROVED)</h4>
                  <p>Both required executive credentials verified with separation of duties. Cryptographic state seal finalized. The action is now ready for production dispatch.</p>
                  <div className="sim-actions">
                    <button className="btn-sim-next" onClick={() => setSandboxStep(4)}>
                      Dispatch Execution to Production
                    </button>
                  </div>
                </div>
              )}

              {sandboxStep === 4 && (
                <div className="sim-content">
                  <h4>Stage 4: Mutation Executed in Production</h4>
                  <p>Block schedule updated in OR Master. 72-hour reversible window is active. Rollback payload is securely persisted.</p>
                  <div className="sim-actions">
                    <button className="btn-sim-rollback" onClick={() => setSandboxStep(5)}>
                      Test 1-Click Rollback
                    </button>
                  </div>
                </div>
              )}

              {sandboxStep === 5 && (
                <div className="sim-content">
                  <h4>Stage 5: Consequential Mutation Rolled Back</h4>
                  <p>Mutation inverted successfully! All block schedules restored to pre-execution baseline state with complete audit trail.</p>
                  <div className="sim-actions">
                    <button className="btn-sim-reset" onClick={() => setSandboxStep(1)}>
                      Restart Walkthrough
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DIGITAL SIGNING MODAL */}
      {isSigningModalOpen && activeProposalToSign && (
        <div className="aiha-modal-backdrop" onClick={() => setIsSigningModalOpen(false)}>
          <div className="aiha-signing-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-info">
                <span className="font-mono text-xs text-sky">{activeProposalToSign.requestCode}</span>
                <h3>Digital Dual-Key Signoff</h3>
              </div>
              <button className="modal-close-btn" onClick={() => setIsSigningModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="proposal-summary-box">
                <h4 className="m-title">{activeProposalToSign.title}</h4>
                <p className="m-desc">{activeProposalToSign.rationale}</p>
                <div className="m-exposure">
                  <span>Financial Exposure:</span>
                  <strong>${activeProposalToSign.financialExposureUsd.toLocaleString()}</strong>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Signer Role:</label>
                <select
                  className="form-select"
                  value={signerRole}
                  onChange={(e) => setSignerRole(e.target.value)}
                >
                  <option value="facility_admin">Facility Administrator</option>
                  <option value="clinical_director">Clinical Director</option>
                  <option value="cfo">Chief Financial Officer</option>
                  <option value="medical_director">Medical Director</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Signer Executive Name:</label>
                <input
                  type="text"
                  className="form-input"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Executive Attestation Statement:</label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  value={attestationText}
                  onChange={(e) => setAttestationText(e.target.value)}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-reject" onClick={() => handleSign(SIGNATURE_DECISIONS.REJECTED)}>
                <XCircle size={14} />
                <span>Veto / Reject</span>
              </button>
              <button className="btn-approve" onClick={() => handleSign(SIGNATURE_DECISIONS.APPROVED)}>
                <CheckCircle2 size={14} />
                <span>Sign Affirmative Digital Key</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
