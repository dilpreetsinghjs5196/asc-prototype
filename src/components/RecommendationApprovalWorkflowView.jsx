/**
 * ==============================================================================
 * Phase D3: Recommendation Approval Workflow View
 * Module 13: Decision Intelligence
 * Maestro Clinical Design System: Emerald, Amber, Crimson, Sky, Slate, Neutral
 * Strictly Zero Prohibited Accent Tokens
 * ==============================================================================
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  DollarSign,
  UserCheck,
  Users,
  Search,
  Filter,
  RefreshCw,
  Send,
  Zap,
  ArrowRight,
  History,
  Lock,
  ChevronDown,
  ExternalLink,
  Scale
} from 'lucide-react';

import {
  APPROVAL_TIERS,
  APPROVAL_STATUSES,
  REVIEW_ACTION_TYPES,
  getApprovalQueue,
  getApprovalById,
  reviewApproval,
  executeApprovedAction,
  getApprovalAuditActions,
  getApprovalTelemetry
} from '../services/recommendationApprovalService.js';

import './RecommendationApprovalWorkflowView.css';

export default function RecommendationApprovalWorkflowView({ activeFacility }) {
  const rawFacId = activeFacility?.id || (typeof activeFacility === 'string' ? activeFacility : null) || 'fac-naples-01';
  const facilityId = (rawFacId === '00000000-0000-0000-0000-000000000002') ? 'fac-naples-01' : rawFacId;
  const facilityName = activeFacility?.name || 'Naples Surgery Center';

  // Filters & State
  const [queue, setQueue] = useState([]);
  const [telemetry, setTelemetry] = useState(null);
  const [tierFilter, setTierFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState(null);

  // Modals state
  const [approveModalItem, setApproveModalItem] = useState(null);
  const [approveComments, setApproveComments] = useState('');
  const [reviewerRole, setReviewerRole] = useState('billing_specialist');

  const [rejectModalItem, setRejectModalItem] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');

  const [auditModalItem, setAuditModalItem] = useState(null);
  const [auditActions, setAuditActions] = useState([]);

  const refreshData = () => {
    const list = getApprovalQueue(facilityId, {
      tier: tierFilter,
      status: statusFilter,
      searchQuery
    });
    setQueue(list);
    const telem = getApprovalTelemetry(facilityId);
    setTelemetry(telem);
  };

  useEffect(() => {
    refreshData();
  }, [facilityId, tierFilter, statusFilter, searchQuery]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Handle Approve Submission
  const handleApproveSubmit = (e) => {
    e.preventDefault();
    if (!approveModalItem) return;

    try {
      const result = reviewApproval(approveModalItem.id, {
        actionType: REVIEW_ACTION_TYPES.APPROVE,
        reviewerUserId: `usr_${reviewerRole}_reviewer`,
        reviewerName: reviewerRole === 'cfo' ? 'Marcus Bell, CPA (CFO)' : 'Audit Reviewer',
        reviewerRole,
        comments: approveComments || 'Approved in accordance with facility financial guidelines.'
      });

      setApproveModalItem(null);
      setApproveComments('');
      showToast(
        result.approval.status === APPROVAL_STATUSES.APPROVED
          ? 'Quorum reached! Recommendation APPROVED and unlocked for execution.'
          : 'Signature recorded. Additional signature required for dual-key authorization.'
      );
      refreshData();
    } catch (err) {
      showToast(`Error: ${err.message}`);
    }
  };

  // Handle Reject Submission
  const handleRejectSubmit = (e) => {
    e.preventDefault();
    if (!rejectReason || rejectReason.trim().length < 10) {
      setRejectError('Mandatory business rationale (min 10 characters) is required.');
      return;
    }

    try {
      reviewApproval(rejectModalItem.id, {
        actionType: REVIEW_ACTION_TYPES.REJECT,
        reviewerUserId: 'usr_compliance_lead',
        reviewerName: 'Clinical & Financial Compliance Officer',
        reviewerRole: 'compliance_officer',
        comments: rejectReason.trim()
      });

      setRejectModalItem(null);
      setRejectReason('');
      setRejectError('');
      showToast('Recommendation REJECTED and execution halted with audit trail.');
      refreshData();
    } catch (err) {
      setRejectError(err.message);
    }
  };

  // Handle Execute Action
  const handleExecute = (item) => {
    try {
      executeApprovedAction(item.id, {
        userId: 'usr_exec_system',
        userName: 'Authoritative Billing Dispatcher',
        userRole: 'admin'
      });
      showToast(`Action ${item.actionCode} EXECUTED and dispatched to clearinghouse.`);
      refreshData();
    } catch (err) {
      showToast(err.message);
    }
  };

  // Open Audit Modal
  const openAuditModal = (item) => {
    setAuditModalItem(item);
    const actions = getApprovalAuditActions(item.id);
    setAuditActions(actions);
  };

  return (
    <div className="raw-container">
      {/* Toast */}
      {toastMessage && (
        <div className="raw-toast">
          <CheckCircle2 size={16} className="raw-toast-icon" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="raw-header">
        <div>
          <div className="raw-title-row">
            <h2 className="raw-title">Recommendation Human Approval Workflow</h2>
            <span className="raw-facility-pill">
              <ShieldCheck size={14} />
              {facilityName}
            </span>
            <span className="raw-ver-badge">Phase D3 - Module 13</span>
          </div>
          <p className="raw-subtitle">
            Role-based authorization, multi-tier dual-key signoffs, anti-self-approval enforcement, and execution gating
          </p>
        </div>
        <div className="raw-header-actions">
          <button className="raw-btn-secondary" onClick={refreshData}>
            <RefreshCw size={14} /> Refresh Queue
          </button>
        </div>
      </div>

      {/* 5-Card Telemetry Ribbon */}
      <div className="raw-ribbon-grid">
        <div className="raw-ribbon-card">
          <div className="raw-ribbon-label">
            <Clock size={14} className="raw-ico-amber" />
            Pending Authorizations
          </div>
          <div className="raw-ribbon-val">{telemetry?.pendingAuthorizationsCount ?? 2}</div>
          <div className="raw-ribbon-sub">Awaiting required signatures</div>
        </div>

        <div className="raw-ribbon-card">
          <div className="raw-ribbon-label">
            <UserCheck size={14} className="raw-ico-emerald" />
            Quorum Completion Rate
          </div>
          <div className="raw-ribbon-val">{telemetry?.quorumCompletionRatePct ?? 80.0}%</div>
          <div className="raw-ribbon-sub">
            {telemetry?.approvedCount ?? 1} approved, {telemetry?.executedCount ?? 1} executed
          </div>
        </div>

        <div className="raw-ribbon-card">
          <div className="raw-ribbon-label">
            <Users size={14} className="raw-ico-sky" />
            Dual-Key Requests
          </div>
          <div className="raw-ribbon-val">{telemetry?.dualKeyCount ?? 2}</div>
          <div className="raw-ribbon-sub">2 distinct signoffs required</div>
        </div>

        <div className="raw-ribbon-card">
          <div className="raw-ribbon-label">
            <DollarSign size={14} className="raw-ico-emerald" />
            Total Impact Under Review
          </div>
          <div className="raw-ribbon-val">
            ${telemetry?.totalFinancialImpactUnderReview?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '34,749.50'}
          </div>
          <div className="raw-ribbon-sub">Across active approval requests</div>
        </div>

        <div className="raw-ribbon-card">
          <div className="raw-ribbon-label">
            <Lock size={14} className="raw-ico-slate" />
            Governance Integrity
          </div>
          <div className="raw-ribbon-val raw-chip-emerald">Dual-Key Quorum</div>
          <div className="raw-ribbon-sub">Anti-self-approval enforced</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="raw-filter-bar">
        <div className="raw-search-box">
          <Search size={14} className="raw-search-icon" />
          <input
            type="text"
            placeholder="Search by action code, title, requester..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="raw-search-input"
          />
        </div>

        <div className="raw-filter-group">
          <span className="raw-filter-label">
            <Filter size={13} /> Tier:
          </span>
          <select
            className="raw-select"
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
          >
            <option value="ALL">All Approval Tiers</option>
            <option value={APPROVAL_TIERS.TIER_1_SINGLE_SIGN}>Tier 1: Single Signoff (&lt; $2.5k)</option>
            <option value={APPROVAL_TIERS.TIER_2_DUAL_KEY}>Tier 2: Dual-Key ($2.5k - $10k)</option>
            <option value={APPROVAL_TIERS.TIER_3_EXECUTIVE_QUORUM}>Tier 3: Executive Quorum (&gt; $10k)</option>
          </select>
        </div>

        <div className="raw-filter-group">
          <span className="raw-filter-label">Status:</span>
          <select
            className="raw-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            <option value={APPROVAL_STATUSES.PENDING}>Pending Only</option>
            <option value={APPROVAL_STATUSES.APPROVED}>Approved (Ready to Execute)</option>
            <option value={APPROVAL_STATUSES.EXECUTED}>Executed</option>
            <option value={APPROVAL_STATUSES.REJECTED}>Rejected</option>
          </select>
        </div>

        <div className="raw-queue-count">
          Showing <strong>{queue.length}</strong> authorization requests
        </div>
      </div>

      {/* Approval Queue Grid */}
      <div className="raw-grid">
        {queue.length === 0 ? (
          <div className="raw-empty-state">
            <CheckCircle2 size={40} className="raw-empty-icon" />
            <h3>No Approval Requests Found</h3>
            <p>All financial recommendations for this facility have been reviewed or match no filter.</p>
          </div>
        ) : (
          queue.map((item) => {
            const isDual = item.approvalTier === APPROVAL_TIERS.TIER_2_DUAL_KEY;
            const isQuorum = item.approvalTier === APPROVAL_TIERS.TIER_3_EXECUTIVE_QUORUM;
            const isPending = item.status === APPROVAL_STATUSES.PENDING;
            const isApproved = item.status === APPROVAL_STATUSES.APPROVED;
            const isExecuted = item.status === APPROVAL_STATUSES.EXECUTED;
            const isRejected = item.status === APPROVAL_STATUSES.REJECTED;

            return (
              <div key={item.id} className={`raw-card status-${item.status?.toLowerCase()}`}>
                {/* Card Header */}
                <div className="raw-card-top">
                  <div className="raw-card-badge-row">
                    <span className="raw-code-pill">{item.actionCode}</span>
                    <span className={`raw-tier-badge tier-${item.approvalTier?.toLowerCase()}`}>
                      {item.approvalTier?.replace(/_/g, ' ')}
                    </span>
                    <span className={`raw-status-pill status-${item.status?.toLowerCase()}`}>
                      {isApproved && <CheckCircle2 size={12} />}
                      {isPending && <Clock size={12} />}
                      {isRejected && <XCircle size={12} />}
                      {isExecuted && <Zap size={12} />}
                      {item.status}
                    </span>
                  </div>
                  <div className="raw-impact-chip">
                    ${item.financialImpactAmount?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                {/* Card Title & Info */}
                <h3 className="raw-card-title">{item.title}</h3>
                <div className="raw-card-meta">
                  <span>
                    <strong>Requested By:</strong> {item.requestedByName}
                  </span>
                  <span>
                    <strong>Required Role:</strong> {item.requiredRole?.toUpperCase()}
                  </span>
                </div>

                {/* Quorum Progress Tracker */}
                <div className="raw-quorum-box">
                  <div className="raw-quorum-header">
                    <span>Signatures Collected</span>
                    <strong>
                      {item.collectedSignaturesCount} of {item.requiredSignaturesCount} Required
                    </strong>
                  </div>
                  <div className="raw-quorum-bar">
                    <div
                      className={`raw-quorum-fill ${
                        item.collectedSignaturesCount >= item.requiredSignaturesCount
                          ? 'fill-emerald'
                          : 'fill-amber'
                      }`}
                      style={{
                        width: `${Math.min(
                          100,
                          (item.collectedSignaturesCount / item.requiredSignaturesCount) * 100
                        )}%`
                      }}
                    />
                  </div>

                  {/* Signers Pill List */}
                  {item.signaturesCollected && item.signaturesCollected.length > 0 && (
                    <div className="raw-signers-list">
                      {item.signaturesCollected.map((sig, idx) => (
                        <div key={idx} className="raw-signer-pill">
                          <CheckCircle2 size={12} className="raw-ico-emerald" />
                          <span>
                            <strong>{sig.name}</strong> ({sig.role})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Rejection Note */}
                  {isRejected && item.rejectionReason && (
                    <div className="raw-rejection-box">
                      <strong>Rejection Rationale:</strong> {item.rejectionReason}
                    </div>
                  )}
                </div>

                {/* Card Actions Footer */}
                <div className="raw-card-actions">
                  <button
                    className="raw-btn-audit"
                    onClick={() => openAuditModal(item)}
                  >
                    <History size={13} /> Audit Ledger
                  </button>

                  <div className="raw-btn-group-right">
                    {isPending && (
                      <>
                        <button
                          className="raw-btn-reject"
                          onClick={() => {
                            setRejectModalItem(item);
                            setRejectReason('');
                            setRejectError('');
                          }}
                        >
                          <XCircle size={13} /> Reject
                        </button>
                        <button
                          className="raw-btn-approve"
                          onClick={() => {
                            setApproveModalItem(item);
                            setApproveComments('');
                          }}
                        >
                          <CheckCircle2 size={13} /> Approve
                        </button>
                      </>
                    )}

                    {isApproved && (
                      <button
                        className="raw-btn-execute"
                        onClick={() => handleExecute(item)}
                      >
                        <Zap size={14} /> Execute Authorized Action
                      </button>
                    )}

                    {isExecuted && (
                      <span className="raw-executed-badge">
                        <CheckCircle2 size={13} /> Action Executed
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Approve Modal */}
      {approveModalItem && (
        <div className="raw-modal-backdrop">
          <div className="raw-modal-content">
            <div className="raw-modal-header">
              <div className="raw-modal-title-row">
                <CheckCircle2 size={18} className="raw-ico-emerald" />
                <h3 className="raw-modal-title">Authorize Financial Recommendation</h3>
              </div>
              <button
                className="raw-modal-close"
                onClick={() => setApproveModalItem(null)}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleApproveSubmit}>
              <div className="raw-modal-body">
                <div className="raw-modal-item-summary">
                  <div className="raw-summary-code">{approveModalItem.actionCode}</div>
                  <div className="raw-summary-title">{approveModalItem.title}</div>
                  <div className="raw-summary-val">
                    Financial Impact: ${approveModalItem.financialImpactAmount?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div className="raw-form-group">
                  <label className="raw-label">
                    Reviewer Authorized Role <span className="raw-required">*</span>
                  </label>
                  <select
                    className="raw-select full-width"
                    value={reviewerRole}
                    onChange={(e) => setReviewerRole(e.target.value)}
                  >
                    <option value="billing_specialist">Billing Specialist / Lead</option>
                    <option value="cfo">Chief Financial Officer (CFO)</option>
                    <option value="clinical_director">Clinical Director</option>
                    <option value="financial_controller">Financial Controller</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>

                <div className="raw-form-group">
                  <label className="raw-label">Approval Signoff Comments (Optional)</label>
                  <textarea
                    rows={3}
                    className="raw-textarea"
                    placeholder="Enter approval verification details or contract confirmation..."
                    value={approveComments}
                    onChange={(e) => setApproveComments(e.target.value)}
                  />
                </div>

                <div className="raw-anti-self-note">
                  <Lock size={12} />
                  <span>
                    Anti-self-approval rule enforced: Requester (
                    <strong>{approveModalItem.requestedByName}</strong>) cannot cast an approval vote.
                  </span>
                </div>
              </div>

              <div className="raw-modal-footer">
                <button
                  type="button"
                  className="raw-btn-secondary"
                  onClick={() => setApproveModalItem(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="raw-btn-approve">
                  <CheckCircle2 size={14} /> Confirm & Sign Approval
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModalItem && (
        <div className="raw-modal-backdrop">
          <div className="raw-modal-content">
            <div className="raw-modal-header">
              <div className="raw-modal-title-row">
                <XCircle size={18} className="raw-ico-crimson" />
                <h3 className="raw-modal-title">Reject Recommendation</h3>
              </div>
              <button
                className="raw-modal-close"
                onClick={() => setRejectModalItem(null)}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleRejectSubmit}>
              <div className="raw-modal-body">
                <p className="raw-modal-desc">
                  Rejecting this recommendation halts automated execution and records your business rationale in the immutable compliance audit ledger.
                </p>

                <div className="raw-modal-item-summary">
                  <strong>Action:</strong> {rejectModalItem.actionCode} - {rejectModalItem.title}
                </div>

                <div className="raw-form-group">
                  <label className="raw-label">
                    Mandatory Business Rationale <span className="raw-required">*</span>
                  </label>
                  <textarea
                    rows={4}
                    className="raw-textarea"
                    placeholder="Provide specific reason for rejection (min 10 characters, e.g. payer contract carveout inapplicable or surgeon dispute)..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                  {rejectError && <div className="raw-error-msg">{rejectError}</div>}
                </div>
              </div>

              <div className="raw-modal-footer">
                <button
                  type="button"
                  className="raw-btn-secondary"
                  onClick={() => setRejectModalItem(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="raw-btn-danger">
                  Confirm Rejection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Audit History Modal */}
      {auditModalItem && (
        <div className="raw-modal-backdrop">
          <div className="raw-modal-content raw-modal-wide">
            <div className="raw-modal-header">
              <div className="raw-modal-title-row">
                <History size={18} className="raw-ico-sky" />
                <h3 className="raw-modal-title">Approval Action Audit Ledger</h3>
              </div>
              <button
                className="raw-modal-close"
                onClick={() => setAuditModalItem(null)}
              >
                &times;
              </button>
            </div>

            <div className="raw-modal-body">
              <div className="raw-modal-item-summary">
                <div className="raw-summary-code">{auditModalItem.actionCode}</div>
                <div className="raw-summary-title">{auditModalItem.title}</div>
                <div className="raw-summary-hash">
                  <strong>Decision Hash:</strong> <code>{auditModalItem.cryptographicDecisionHash}</code>
                </div>
              </div>

              <div className="raw-audit-timeline">
                {auditActions.length === 0 ? (
                  <p className="raw-text-secondary">No audit events recorded yet for this request.</p>
                ) : (
                  auditActions.map((act) => (
                    <div key={act.id} className="raw-audit-entry">
                      <div className="raw-audit-top">
                        <span className={`raw-act-badge act-${act.actionType?.toLowerCase()}`}>
                          {act.actionType}
                        </span>
                        <span className="raw-audit-time">{act.signedAt}</span>
                      </div>
                      <div className="raw-audit-reviewer">
                        <strong>{act.reviewerName}</strong> ({act.reviewerRole})
                      </div>
                      <div className="raw-audit-comments">"{act.decisionComments}"</div>
                      <div className="raw-audit-sig">
                        <strong>Signature Token:</strong> <code>{act.signatureToken}</code>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="raw-modal-footer">
              <button
                type="button"
                className="raw-btn-primary"
                onClick={() => setAuditModalItem(null)}
              >
                Close Audit Ledger
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
