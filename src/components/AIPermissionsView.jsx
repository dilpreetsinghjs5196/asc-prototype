import React, { useState, useMemo } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Search,
  Filter,
  RefreshCw,
  FileCheck,
  X,
  Layers,
  Zap,
  Clock,
  ChevronRight,
  TrendingUp,
  DollarSign,
  Activity,
  Sliders,
  Scale,
  Award,
  Hash,
  UserCheck
} from 'lucide-react';
import {
  AI_PERMISSIONS,
  RISK_TIERS,
  PROPOSAL_STATUSES,
  ROLE_PERMISSION_MATRIX,
  ACTION_BOUNDARIES_REGISTRY,
  SEED_PROPOSED_ACTIONS,
  calculatePermissionsTelemetry,
  decideActionProposal,
  hasAiPermission
} from '../services/aiPermissionsService';
import './AIPermissionsView.css';

export default function AIPermissionsView() {
  const [activeTab, setActiveTab] = useState('queue'); // 'queue', 'matrix', 'audit'
  const [proposals, setProposals] = useState(SEED_PROPOSED_ACTIONS);
  const [statusFilter, setStatusFilter] = useState('PENDING_APPROVAL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProposal, setSelectedProposal] = useState(null); // Detail / Confirmation Modal
  const [decisionNotes, setDecisionNotes] = useState('');
  const [activeDecisionType, setActiveDecisionType] = useState('APPROVE');
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Telemetry KPIs
  const telemetry = useMemo(() => {
    return calculatePermissionsTelemetry(proposals);
  }, [proposals]);

  // Filtered Proposals
  const filteredProposals = useMemo(() => {
    return proposals.filter(p => {
      const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        p.title.toLowerCase().includes(q) ||
        p.actionName.toLowerCase().includes(q) ||
        p.rationale.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [proposals, statusFilter, searchQuery]);

  // Action boundaries list
  const boundariesList = useMemo(() => {
    return Object.values(ACTION_BOUNDARIES_REGISTRY);
  }, []);

  // Handle Human-in-the-Loop Decision
  const handleConfirmDecision = () => {
    if (!selectedProposal) return;
    try {
      const result = decideActionProposal(
        selectedProposal,
        activeDecisionType,
        {
          userId: 'usr_clinical_director',
          role: 'clinical_director',
          facilityId: selectedProposal.facilityId
        },
        decisionNotes
      );

      // Update state
      setProposals(prev => prev.map(p => p.id === selectedProposal.id ? result.proposal : p));
      showToast(`Action ${selectedProposal.id} marked as ${result.status} with provenance hash ${result.decisionHash.slice(0, 12)}...`);
      setSelectedProposal(null);
      setDecisionNotes('');
    } catch (err) {
      showToast(`Error: ${err.message}`);
    }
  };

  const getRiskBadge = (tier) => {
    switch (tier) {
      case RISK_TIERS.PROPOSED_MUTATION:
        return <span className="risk-badge tier-high"><AlertTriangle size={12} /> Dual-Key Mutation</span>;
      case RISK_TIERS.EXPORT_SYNTHESIS:
        return <span className="risk-badge tier-medium"><FileCheck size={12} /> Export Synthesis</span>;
      case RISK_TIERS.RESTRICTED_SYSTEM_ACTION:
        return <span className="risk-badge tier-blocked"><Lock size={12} /> Restricted / Blocked</span>;
      default:
        return <span className="risk-badge tier-low"><CheckCircle2 size={12} /> Read-Only Analytics</span>;
    }
  };

  const getDomainBadge = (domain) => {
    switch (domain) {
      case 'CLINICAL':
        return <span className="perm-domain-badge clinical">Clinical</span>;
      case 'FINANCIAL':
        return <span className="perm-domain-badge financial">Financial</span>;
      case 'RCM':
        return <span className="perm-domain-badge rcm">RCM / Billing</span>;
      case 'SUPPLY_CHAIN':
        return <span className="perm-domain-badge supply">Supply Chain</span>;
      default:
        return <span className="perm-domain-badge governance">Governance</span>;
    }
  };

  return (
    <div className="aip-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="aip-toast">
          <CheckCircle2 size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top 5-Card Executive Metric Ribbon */}
      <div className="aip-ribbon">
        <div className="aip-ribbon-card primary">
          <div className="card-top">
            <span className="card-label">Granular AI Permissions</span>
            <div className="icon-wrapper blue"><ShieldCheck size={16} /></div>
          </div>
          <div className="card-metric">{telemetry.totalPermissionsDefined} <span className="metric-unit">Scopes</span></div>
          <div className="card-footer-info">
            <span>Server-Authoritative</span>
            <span className="status-pill pill-success">RBAC Bound</span>
          </div>
        </div>

        <div className="aip-ribbon-card">
          <div className="card-top">
            <span className="card-label">Active Role Grants</span>
            <div className="icon-wrapper emerald"><UserCheck size={16} /></div>
          </div>
          <div className="card-metric">{telemetry.activeRolesMapped} <span className="metric-unit">Roles</span></div>
          <div className="card-footer-info">
            <span>Least-Privilege Baseline</span>
            <span className="rate-badge">8 Canonical</span>
          </div>
        </div>

        <div className="aip-ribbon-card">
          <div className="card-top">
            <span className="card-label">Pending HITL Approvals</span>
            <div className="icon-wrapper amber"><Clock size={16} /></div>
          </div>
          <div className="card-metric">{telemetry.pendingHitlApprovalsCount} <span className="metric-unit">Actions</span></div>
          <div className="card-footer-info">
            <span>Dual-Key Signoff Queue</span>
            <span className="status-pill pill-warn">Action Required</span>
          </div>
        </div>

        <div className="aip-ribbon-card">
          <div className="card-top">
            <span className="card-label">High-Risk Boundaries</span>
            <div className="icon-wrapper crimson"><Lock size={16} /></div>
          </div>
          <div className="card-metric">{telemetry.highRiskBoundariesCount} <span className="metric-unit">Guarded</span></div>
          <div className="card-footer-info">
            <span>Mutations Intercepted</span>
            <span className="rate-badge">Dual-Key</span>
          </div>
        </div>

        <div className="aip-ribbon-card">
          <div className="card-top">
            <span className="card-label">Dual-Key Enforcement</span>
            <div className="icon-wrapper emerald"><ShieldCheck size={16} /></div>
          </div>
          <div className="card-metric">{telemetry.dualKeyEnforcementRatePct}%</div>
          <div className="card-footer-info">
            <span>Zero Autonomous Drift</span>
            <span className="status-pill pill-success">100% Gated</span>
          </div>
        </div>
      </div>

      {/* Tab Navigation Row */}
      <div className="aip-tabs-row">
        <div className="tab-buttons">
          <button
            className={`tab-btn ${activeTab === 'queue' ? 'active' : ''}`}
            onClick={() => setActiveTab('queue')}
          >
            <Clock size={15} />
            HITL Action Approval Queue ({telemetry.pendingHitlApprovalsCount})
          </button>
          <button
            className={`tab-btn ${activeTab === 'matrix' ? 'active' : ''}`}
            onClick={() => setActiveTab('matrix')}
          >
            <Layers size={15} />
            Role-Permission Matrix & Boundaries
          </button>
          <button
            className={`tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit')}
          >
            <FileCheck size={15} />
            Security & Permission Ledger
          </button>
        </div>
        <div className="quick-actions">
          <button className="action-btn" onClick={() => showToast('Refreshed facility AI permissions and action queue')}>
            <RefreshCw size={14} />
            Sync Policies
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="aip-filters-bar">
        <div className="search-box">
          <Search size={15} className="search-icon" />
          <input
            type="text"
            placeholder={activeTab === 'queue' ? "Search proposed actions, rationales, or entities..." : "Search roles, action boundaries, or permissions..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="clear-search" onClick={() => setSearchQuery('')}>
              <X size={14} />
            </button>
          )}
        </div>

        {activeTab === 'queue' && (
          <div className="filter-group">
            <Filter size={14} />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="ALL">All Statuses</option>
              <option value={PROPOSAL_STATUSES.PENDING_APPROVAL}>Pending Signoff</option>
              <option value={PROPOSAL_STATUSES.APPROVED}>Approved</option>
              <option value={PROPOSAL_STATUSES.REJECTED}>Rejected</option>
            </select>
          </div>
        )}

        <div className="results-count">
          Showing {activeTab === 'queue' ? filteredProposals.length : boundariesList.length} items
        </div>
      </div>

      {/* TAB 1: Human-in-the-Loop Action Approval Queue */}
      {activeTab === 'queue' && (
        <div className="aip-queue-container">
          {filteredProposals.length === 0 ? (
            <div className="aip-empty-card">
              <CheckCircle2 size={36} color="#059669" />
              <h3>Approval Queue Clear</h3>
              <p>No AI-proposed actions currently pending executive signoff for this facility.</p>
            </div>
          ) : (
            filteredProposals.map(proposal => {
              const isPending = proposal.status === PROPOSAL_STATUSES.PENDING_APPROVAL;
              const isApproved = proposal.status === PROPOSAL_STATUSES.APPROVED;
              return (
                <div key={proposal.id} className={`aip-proposal-card ${isPending ? 'pending' : isApproved ? 'approved' : 'rejected'}`}>
                  <div className="proposal-top">
                    <div className="proposal-title-block">
                      <div className="badges-row">
                        {getDomainBadge(proposal.domain)}
                        {getRiskBadge(proposal.riskTier)}
                        <span className="prop-id">ID: {proposal.id}</span>
                      </div>
                      <h3 className="proposal-title">{proposal.title}</h3>
                      <div className="proposal-meta">
                        <span>Proposed by: <strong>{proposal.requesterId}</strong> ({proposal.requesterRole})</span>
                        <span>•</span>
                        <span>Expires in: <strong>{Math.max(1, Math.round((new Date(proposal.expiresAt) - new Date()) / 3600000))}h</strong></span>
                      </div>
                    </div>
                    <div className="proposal-status-badge">
                      {isPending && <span className="status-pill pill-warn"><Clock size={12} /> Pending Signoff</span>}
                      {isApproved && <span className="status-pill pill-success"><CheckCircle2 size={12} /> Approved & Executed</span>}
                      {proposal.status === PROPOSAL_STATUSES.REJECTED && <span className="status-pill pill-danger"><X size={12} /> Rejected</span>}
                    </div>
                  </div>

                  <div className="proposal-body">
                    <div className="rationale-box">
                      <span className="section-label">AI Diagnostic Rationale & Evidence:</span>
                      <p>{proposal.rationale}</p>
                    </div>

                    <div className="impact-grid">
                      {Object.entries(proposal.projectedImpact || {}).map(([k, v]) => (
                        <div key={k} className="impact-item">
                          <span className="impact-label">{k.replace(/([A-Z])/g, ' $1').toUpperCase()}:</span>
                          <span className="impact-value">{typeof v === 'number' ? `$${v.toLocaleString()}` : String(v)}</span>
                        </div>
                      ))}
                    </div>

                    <div className="payload-diff-box">
                      <span className="section-label">Proposed Action Payload (State Diff):</span>
                      <pre className="payload-json">{JSON.stringify(proposal.proposedPayload, null, 2)}</pre>
                    </div>
                  </div>

                  {isPending && (
                    <div className="proposal-actions-row">
                      <div className="provenance-hash-text">
                        <Hash size={12} />
                        <code>{proposal.executionHash.slice(0, 24)}...</code>
                      </div>
                      <div className="decision-buttons">
                        <button
                          className="btn-reject"
                          onClick={() => {
                            setSelectedProposal(proposal);
                            setActiveDecisionType('REJECT');
                          }}
                        >
                          <X size={14} />
                          Reject Proposal
                        </button>
                        <button
                          className="btn-approve"
                          onClick={() => {
                            setSelectedProposal(proposal);
                            setActiveDecisionType('APPROVE');
                          }}
                        >
                          <CheckCircle2 size={14} />
                          Approve & Execute (Dual-Key)
                        </button>
                      </div>
                    </div>
                  )}

                  {!isPending && proposal.decidedAt && (
                    <div className="decision-summary-bar">
                      <span>Decided by <strong>{proposal.approverId}</strong> ({proposal.approverRole}) on {new Date(proposal.decidedAt).toLocaleString()}</span>
                      <span className="notes-text">Notes: {proposal.decisionNotes}</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: Role-Permission Matrix & Action Boundaries */}
      {activeTab === 'matrix' && (
        <div className="aip-matrix-container">
          {/* Role-Permission Grid Card */}
          <div className="aip-table-card">
            <div className="aip-card-header">
              <div>
                <h3>Canonical Role to AI Permission Privilege Matrix</h3>
                <p>Enforces least-privilege boundary rules across natural language query domains and data scopes.</p>
              </div>
            </div>
            <div className="aip-table-responsive">
              <table className="aip-table">
                <thead>
                  <tr>
                    <th>Canonical Role</th>
                    <th>ai:chat</th>
                    <th>ai:view_clinical</th>
                    <th>ai:view_financial</th>
                    <th>ai:view_phi</th>
                    <th>ai:tool_execute</th>
                    <th>ai:propose_action</th>
                    <th>ai:approve_action</th>
                    <th>ai:admin</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(ROLE_PERMISSION_MATRIX).map(([role, perms]) => (
                    <tr key={role}>
                      <td>
                        <span className="role-name-cell">{role}</span>
                      </td>
                      {Object.values(AI_PERMISSIONS).map(perm => {
                        const hasPerm = perms.includes(perm);
                        return (
                          <td key={perm} className="text-center">
                            {hasPerm ? (
                              <span className="perm-check granted" title={`Granted: ${perm}`}>
                                <CheckCircle2 size={14} />
                              </span>
                            ) : (
                              <span className="perm-check denied" title={`Denied: ${perm}`}>
                                <Lock size={12} />
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action Boundaries Definition Table */}
          <div className="aip-table-card">
            <div className="aip-card-header">
              <div>
                <h3>Action Boundaries Registry & Dual-Key Guardrails</h3>
                <p>Categorization of operations by risk tier, separating automated read synthesis from human-approved mutations.</p>
              </div>
            </div>
            <div className="aip-table-responsive">
              <table className="aip-table">
                <thead>
                  <tr>
                    <th>Action Identifier & Name</th>
                    <th>Domain</th>
                    <th>Risk Tier</th>
                    <th>Requires Signoff</th>
                    <th>Allowed Requesters</th>
                    <th>Allowed Approvers</th>
                    <th>TTL Window</th>
                  </tr>
                </thead>
                <tbody>
                  {boundariesList.map(boundary => (
                    <tr key={boundary.actionId}>
                      <td>
                        <div className="action-id-cell">
                          <span className="action-name">{boundary.name}</span>
                          <code>{boundary.actionId}</code>
                        </div>
                      </td>
                      <td>{getDomainBadge(boundary.domain)}</td>
                      <td>{getRiskBadge(boundary.riskTier)}</td>
                      <td>
                        {boundary.requiresApproval ? (
                          <span className="status-pill pill-alert">Dual-Key Required</span>
                        ) : (
                          <span className="status-pill pill-success">Auto-Approved</span>
                        )}
                      </td>
                      <td>
                        <div className="roles-chips">
                          {boundary.allowedRequesterRoles.length === 0 ? (
                            <span className="role-chip none">Blocked</span>
                          ) : (
                            boundary.allowedRequesterRoles.map(r => (
                              <span key={r} className="role-chip">{r}</span>
                            ))
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="roles-chips">
                          {boundary.allowedApproverRoles.length === 0 ? (
                            <span className="role-chip none">None</span>
                          ) : (
                            boundary.allowedApproverRoles.map(r => (
                              <span key={r} className="role-chip approver">{r}</span>
                            ))
                          )}
                        </div>
                      </td>
                      <td><strong>{boundary.autoExpireHours}h</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Security & Permission Ledger */}
      {activeTab === 'audit' && (
        <div className="aip-table-card">
          <div className="aip-card-header">
            <div>
              <h3>AI Permission & Authorization Audit Ledger</h3>
              <p>Cryptographic trail of all privilege evaluations, dual-key signoffs, and security policy intercepts.</p>
            </div>
          </div>
          <div className="aip-table-responsive">
            <table className="aip-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor ID & Role</th>
                  <th>Requested Permission / Action</th>
                  <th>Target Resource</th>
                  <th>Policy Decision</th>
                  <th>Provenance Hash</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>10:22:15</code></td>
                  <td><strong>usr-clin-03</strong> (clinical_manager)</td>
                  <td><code>ai:propose_action</code></td>
                  <td>construct_substitution_policy</td>
                  <td><span className="status-pill pill-success">GRANTED</span></td>
                  <td><code className="hash-code">f1e2d3c4b5a67890abcdef...</code></td>
                </tr>
                <tr>
                  <td><code>10:15:40</code></td>
                  <td><strong>usr-analyst-02</strong> (analyst)</td>
                  <td><code>ai:approve_action</code></td>
                  <td>mutate_or_block_release</td>
                  <td><span className="status-pill pill-danger">DENIED</span></td>
                  <td><code className="hash-code">a1b2c3d4e5f67890abcdef...</code></td>
                </tr>
                <tr>
                  <td><code>09:55:10</code></td>
                  <td><strong>usr-biller-04</strong> (biller)</td>
                  <td><code>ai:view_financial</code></td>
                  <td>payer_contract_performance</td>
                  <td><span className="status-pill pill-success">GRANTED</span></td>
                  <td><code className="hash-code">c2d3e4f5a6b78901abcdef...</code></td>
                </tr>
                <tr>
                  <td><code>09:30:00</code></td>
                  <td><strong>usr-surgeon-07</strong> (surgeon)</td>
                  <td><code>ai:view_phi</code></td>
                  <td>patient_master_index</td>
                  <td><span className="status-pill pill-danger">DENIED</span></td>
                  <td><code className="hash-code">d3e4f5a6b7c89012abcdef...</code></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Decision Confirmation Modal */}
      {selectedProposal && (
        <div className="aip-modal-overlay" onClick={() => setSelectedProposal(null)}>
          <div className="aip-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className={`aip-modal-header ${activeDecisionType === 'APPROVE' ? 'approve' : 'reject'}`}>
              <div>
                <h3>Confirm Dual-Key {activeDecisionType === 'APPROVE' ? 'Approval' : 'Rejection'}</h3>
                <code>Proposal ID: {selectedProposal.id}</code>
              </div>
              <button className="btn-modal-close" onClick={() => setSelectedProposal(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="aip-modal-body">
              <p>
                You are about to <strong>{activeDecisionType === 'APPROVE' ? 'AUTHORIZE AND EXECUTE' : 'REJECT'}</strong> the following AI-proposed operational mutation:
              </p>
              <div className="modal-proposal-summary">
                <strong>{selectedProposal.title}</strong>
                <p>{selectedProposal.rationale}</p>
              </div>

              <div className="modal-field">
                <label>Executive Decision Notes & Justification:</label>
                <textarea
                  rows={3}
                  value={decisionNotes}
                  onChange={(e) => setDecisionNotes(e.target.value)}
                  placeholder="Enter audit notes or clinical justification for this decision..."
                />
              </div>

              <div className="dual-key-notice">
                <ShieldCheck size={16} />
                <span>
                  This decision will be cryptographically signed with your authenticated credentials (<strong>usr_clinical_director</strong>) and immutably recorded to the facility ledger.
                </span>
              </div>
            </div>
            <div className="aip-modal-footer">
              <button className="btn-cancel" onClick={() => setSelectedProposal(null)}>
                Cancel
              </button>
              <button
                className={`btn-confirm ${activeDecisionType === 'APPROVE' ? 'approve' : 'reject'}`}
                onClick={handleConfirmDecision}
              >
                {activeDecisionType === 'APPROVE' ? 'Sign & Execute Action' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
