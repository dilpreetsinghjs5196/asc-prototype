import React, { useState, useMemo, useEffect } from 'react';
import {
  ClipboardList,
  Clock,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  UserCheck,
  Send,
  Filter,
  Search,
  Users,
  History,
  TrendingUp,
  FileText,
  ChevronRight,
  ShieldAlert,
  ArrowUpDown,
  Download,
  XCircle,
  RefreshCw
} from 'lucide-react';
import {
  recoverableRevenueWorkqueueService,
  WORKQUEUE_CODES,
  RECOVERY_LIFECYCLE_STATUSES,
  SLA_STATUSES,
  RECOVERY_SPECIALISTS,
  DISMISSAL_REASONS
} from '../services/recoverableRevenueWorkqueueService';
import './RecoverableRevenueWorkqueueView.css';

export default function RecoverableRevenueWorkqueueView() {
  const [items, setItems] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [specialistsWorkload, setSpecialistsWorkload] = useState([]);
  const [selectedQueue, setSelectedQueue] = useState('ALL');
  const [selectedSpecialist, setSelectedSpecialist] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedSlaStatus, setSelectedSlaStatus] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState(null);

  // Modals & Drawers
  const [activeItem, setActiveItem] = useState(null);
  const [showWorkModal, setShowWorkModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [showDismissModal, setShowDismissModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [showCapacityModal, setShowCapacityModal] = useState(false);
  const [auditLogList, setAuditLogList] = useState([]);

  // Form states
  const [targetSpecialistId, setTargetSpecialistId] = useState('');
  const [assignNotesInput, setAssignNotesInput] = useState('');
  const [workStatusInput, setWorkStatusInput] = useState('IN_PROGRESS');
  const [workNotesInput, setWorkNotesInput] = useState('');
  const [recoveryCashInput, setRecoveryCashInput] = useState('');
  const [remittanceRefInput, setRemittanceRefInput] = useState('');
  const [dismissReasonInput, setDismissReasonInput] = useState('CONTRACTUAL_WRITE_OFF');
  const [dismissNotesInput, setDismissNotesInput] = useState('');

  const refreshData = () => {
    const data = recoverableRevenueWorkqueueService.getWorkqueueItems({
      queueId: selectedQueue,
      specialistId: selectedSpecialist,
      status: selectedStatus,
      slaStatus: selectedSlaStatus,
      search: searchQuery
    });
    setItems(data);
    setMetrics(recoverableRevenueWorkqueueService.getQueueMetrics());
    setSpecialistsWorkload(recoverableRevenueWorkqueueService.getSpecialistWorkload());
  };

  useEffect(() => {
    refreshData();
  }, [selectedQueue, selectedSpecialist, selectedStatus, selectedSlaStatus, searchQuery]);

  const showToast = (msg, isError = false) => {
    setToastMessage({ text: msg, isError });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Handlers
  const handleOpenWorkModal = (item) => {
    setActiveItem(item);
    setWorkStatusInput(item.lifecycle_status === 'UNASSIGNED' ? 'IN_PROGRESS' : item.lifecycle_status);
    setWorkNotesInput('');
    setShowWorkModal(true);
  };

  const handleSaveWorkAction = (e) => {
    e.preventDefault();
    if (!activeItem) return;
    try {
      recoverableRevenueWorkqueueService.transitionLifecycleStatus(
        activeItem.id,
        workStatusInput,
        workNotesInput,
        'Sarah Jenkins, CPC',
        { actionType: 'WORKBENCH_UPDATE' }
      );
      showToast(`Work item updated: ${activeItem.claim_number} transitioned to ${RECOVERY_LIFECYCLE_STATUSES[workStatusInput]?.label}`);
      setShowWorkModal(false);
      refreshData();
    } catch (err) {
      showToast(err.message, true);
    }
  };

  const handleOpenAssignModal = (item) => {
    setActiveItem(item);
    setTargetSpecialistId(item.assigned_specialist_id || RECOVERY_SPECIALISTS[0].id);
    setAssignNotesInput('');
    setShowAssignModal(true);
  };

  const handleSaveAssign = (e) => {
    e.preventDefault();
    if (!activeItem) return;
    const specialist = RECOVERY_SPECIALISTS.find(s => s.id === targetSpecialistId);
    if (!specialist) return;

    try {
      recoverableRevenueWorkqueueService.assignWorkItem(
        activeItem.id,
        specialist.id,
        specialist.name,
        'Amanda Price (Supervisor)',
        assignNotesInput
      );
      showToast(`Assigned ${activeItem.claim_number} to ${specialist.name}`);
      setShowAssignModal(false);
      refreshData();
    } catch (err) {
      showToast(err.message, true);
    }
  };

  const handleOpenRecoveryModal = (item) => {
    setActiveItem(item);
    setRecoveryCashInput(item.expected_realizable_yield.toFixed(2));
    setRemittanceRefInput('');
    setShowRecoveryModal(true);
  };

  const handleSaveRecovery = (e) => {
    e.preventDefault();
    if (!activeItem) return;
    try {
      recoverableRevenueWorkqueueService.reconcileRecovery(
        activeItem.id,
        recoveryCashInput,
        remittanceRefInput,
        'Amanda Price (Supervisor)'
      );
      showToast(`Successfully reconciled cash recovery of $${Number(recoveryCashInput).toLocaleString()} for ${activeItem.claim_number}`);
      setShowRecoveryModal(false);
      refreshData();
    } catch (err) {
      showToast(err.message, true);
    }
  };

  const handleOpenDismissModal = (item) => {
    setActiveItem(item);
    setDismissReasonInput('CONTRACTUAL_WRITE_OFF');
    setDismissNotesInput('');
    setShowDismissModal(true);
  };

  const handleSaveDismiss = (e) => {
    e.preventDefault();
    if (!activeItem) return;
    try {
      recoverableRevenueWorkqueueService.dismissWorkItem(
        activeItem.id,
        dismissReasonInput,
        dismissNotesInput,
        'Amanda Price (Supervisor)'
      );
      showToast(`Claim ${activeItem.claim_number} closed: ${dismissReasonInput}`);
      setShowDismissModal(false);
      refreshData();
    } catch (err) {
      showToast(err.message, true);
    }
  };

  const handleOpenAuditModal = (item) => {
    setActiveItem(item);
    const logs = recoverableRevenueWorkqueueService.getAuditLog(item.id);
    setAuditLogList(logs);
    setShowAuditModal(true);
  };

  const formatHoursLeft = (deadlineStr) => {
    const diffHours = Math.round((new Date(deadlineStr) - new Date()) / (1000 * 3600));
    if (diffHours < 0) {
      return `Breached (${Math.abs(diffHours)}h ago)`;
    }
    if (diffHours <= 24) {
      return `Due in ${diffHours}h`;
    }
    const days = Math.floor(diffHours / 24);
    return `Due in ${days}d ${diffHours % 24}h`;
  };

  return (
    <div className="rrw-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`rrw-toast ${toastMessage.isError ? 'toast-error' : 'toast-success'}`}>
          {toastMessage.isError ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header Bar */}
      <header className="rrw-header">
        <div className="header-titles">
          <div className="badge-ribbon">
            <span className="clinical-badge badge-teal">PHASE 99 REVENUE WORKQUEUE</span>
            <span className="clinical-badge badge-blue">DYNAMIC SLA ENGINE</span>
            <span className="clinical-badge badge-slate">CAPACITY MANAGEMENT</span>
          </div>
          <h1>Recoverable Revenue Workqueue</h1>
          <p className="subtitle">
            Authoritative execution workbench, specialist ownership, statutory filing countdowns & immutable recovery provenance.
          </p>
        </div>
        <div className="header-actions">
          <button 
            type="button" 
            className="btn-secondary" 
            onClick={() => setShowCapacityModal(true)}
            title="Inspect Specialist Workload & Capacity"
          >
            <Users size={16} />
            <span>Specialist Capacity</span>
          </button>
          <button 
            type="button" 
            className="btn-primary" 
            onClick={() => {
              showToast('Exporting active workqueue to CSV format...');
            }}
          >
            <Download size={16} />
            <span>Export Queue</span>
          </button>
        </div>
      </header>

      {/* 5-Card Top KPI Ribbon */}
      {metrics && (
        <section className="rrw-kpi-ribbon">
          <div className="kpi-card">
            <div className="kpi-icon-row">
              <span className="kpi-label">Active Queue Inventory</span>
              <ClipboardList size={18} className="text-blue" />
            </div>
            <div className="kpi-value">${metrics.totalActiveGross.toLocaleString()}</div>
            <div className="kpi-subtext">{metrics.activeCases} active recovery claims</div>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon-row">
              <span className="kpi-label">Expected Realizable Yield</span>
              <TrendingUp size={18} className="text-teal" />
            </div>
            <div className="kpi-value text-teal">${metrics.totalActiveExpected.toLocaleString()}</div>
            <div className="kpi-subtext">Probability & cost-adjusted</div>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon-row">
              <span className="kpi-label">Realized Cash Recovered</span>
              <DollarSign size={18} className="text-emerald" />
            </div>
            <div className="kpi-value text-emerald">${metrics.totalCashRecovered.toLocaleString()}</div>
            <div className="kpi-subtext">Reconciled to surgical bank account</div>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon-row">
              <span className="kpi-label">SLA Compliance Rate</span>
              <CheckCircle2 size={18} className="text-sky" />
            </div>
            <div className="kpi-value text-sky">{metrics.complianceRate}%</div>
            <div className="kpi-subtext">Avg cycle: {metrics.averageCycleDays} days</div>
          </div>

          <div className={`kpi-card ${metrics.breachedCount > 0 ? 'kpi-card-danger' : ''}`}>
            <div className="kpi-icon-row">
              <span className="kpi-label">Active SLA Breaches</span>
              <ShieldAlert size={18} className={metrics.breachedCount > 0 ? 'text-crimson' : 'text-slate'} />
            </div>
            <div className={`kpi-value ${metrics.breachedCount > 0 ? 'text-crimson' : ''}`}>
              {metrics.breachedCount}
            </div>
            <div className="kpi-subtext">
              {metrics.atRiskCount} additional claims expiring in &lt; 24h
            </div>
          </div>
        </section>
      )}

      {/* Queue Navigation Tabs */}
      <nav className="queue-tabs-nav">
        <button
          className={`queue-tab-btn ${selectedQueue === 'ALL' ? 'active' : ''}`}
          onClick={() => setSelectedQueue('ALL')}
        >
          All Active Queues
        </button>
        {Object.values(WORKQUEUE_CODES).map((q) => (
          <button
            key={q.code}
            className={`queue-tab-btn ${selectedQueue === q.code ? 'active' : ''}`}
            onClick={() => setSelectedQueue(q.code)}
          >
            {q.name}
          </button>
        ))}
      </nav>

      {/* Filter and Search Bar */}
      <div className="rrw-controls-card">
        <div className="search-box">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search by claim #, patient, payer, or procedure..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <div className="select-wrapper">
            <label>Specialist:</label>
            <select
              value={selectedSpecialist}
              onChange={(e) => setSelectedSpecialist(e.target.value)}
            >
              <option value="ALL">All Specialists</option>
              <option value="UNASSIGNED">Unassigned Only</option>
              {RECOVERY_SPECIALISTS.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="select-wrapper">
            <label>Status:</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="ALL">All Statuses</option>
              {Object.values(RECOVERY_LIFECYCLE_STATUSES).map(st => (
                <option key={st.code} value={st.code}>{st.label}</option>
              ))}
            </select>
          </div>

          <div className="select-wrapper">
            <label>SLA:</label>
            <select
              value={selectedSlaStatus}
              onChange={(e) => setSelectedSlaStatus(e.target.value)}
            >
              <option value="ALL">All SLA States</option>
              {Object.values(SLA_STATUSES).map(sla => (
                <option key={sla.code} value={sla.code}>{sla.label}</option>
              ))}
            </select>
          </div>

          {(selectedQueue !== 'ALL' || selectedSpecialist !== 'ALL' || selectedStatus !== 'ALL' || selectedSlaStatus !== 'ALL' || searchQuery) && (
            <button
              className="btn-reset"
              onClick={() => {
                setSelectedQueue('ALL');
                setSelectedSpecialist('ALL');
                setSelectedStatus('ALL');
                setSelectedSlaStatus('ALL');
                setSearchQuery('');
              }}
            >
              <RefreshCw size={14} />
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Workqueue Data Grid */}
      <div className="rrw-table-wrapper">
        <table className="rrw-table">
          <thead>
            <tr>
              <th>Priority / ROPS</th>
              <th>Claim & Patient</th>
              <th>Procedure & Specialty</th>
              <th>Recoverable Yield</th>
              <th>Assigned Specialist</th>
              <th>Lifecycle Status</th>
              <th>SLA Countdown</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan="8" className="empty-table-cell">
                  <div className="empty-state">
                    <ClipboardList size={32} className="text-slate" />
                    <p className="empty-title">No claims found in current workqueue</p>
                    <p className="empty-desc">Try clearing search filters or selecting another queue tab.</p>
                  </div>
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const isTerminal = RECOVERY_LIFECYCLE_STATUSES[item.lifecycle_status]?.terminal;
                return (
                  <tr key={item.id} className={item.sla_status === 'SLA_BREACHED' && !isTerminal ? 'row-breached' : ''}>
                    {/* Priority & ROPS */}
                    <td>
                      <div className="priority-badge-cell">
                        <span className={`tier-badge tier-${item.priority_tier.toLowerCase().replace(/_/g, '-')}`}>
                          {item.priority_tier.replace('TIER_', 'T').split('_')[0]}
                        </span>
                        <div className="rops-score-label">
                          <strong>{item.rops_priority_score.toFixed(1)}</strong>
                          <span className="source-domain-tag">{item.source_module.replace('_', ' ')}</span>
                        </div>
                      </div>
                    </td>

                    {/* Claim & Patient */}
                    <td>
                      <div className="claim-patient-cell">
                        <span className="claim-number">{item.claim_number}</span>
                        <span className="patient-name">{item.patient_name}</span>
                        <span className="payer-subtext">{item.payer_name}</span>
                      </div>
                    </td>

                    {/* Procedure */}
                    <td>
                      <div className="procedure-cell" title={item.procedure_name}>
                        <span className="procedure-name">{item.procedure_name}</span>
                        {item.notes && <span className="item-note-snippet">{item.notes}</span>}
                      </div>
                    </td>

                    {/* Yield */}
                    <td>
                      <div className="yield-cell">
                        <div className="gross-val">${item.gross_recoverable_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                        <div className="expected-val text-emerald">
                          Yield: ${item.expected_realizable_yield.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                    </td>

                    {/* Assigned Specialist */}
                    <td>
                      {item.assigned_specialist_name ? (
                        <div className="specialist-cell">
                          <span className="specialist-name">{item.assigned_specialist_name}</span>
                          <span className="touch-badge">{item.touch_count} touches</span>
                        </div>
                      ) : (
                        <span className="unassigned-badge">Unassigned</span>
                      )}
                    </td>

                    {/* Lifecycle Status */}
                    <td>
                      <span className={`status-pill status-${item.lifecycle_status.toLowerCase()}`}>
                        {RECOVERY_LIFECYCLE_STATUSES[item.lifecycle_status]?.label || item.lifecycle_status}
                      </span>
                    </td>

                    {/* SLA Countdown */}
                    <td>
                      {isTerminal ? (
                        <span className="sla-pill sla-resolved">
                          <CheckCircle2 size={13} />
                          Resolved
                        </span>
                      ) : (
                        <span className={`sla-pill ${SLA_STATUSES[item.sla_status]?.badgeClass || 'sla-on-schedule'}`}>
                          <Clock size={13} />
                          {formatHoursLeft(item.sla_deadline)}
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="text-right">
                      <div className="action-buttons-cell">
                        {!isTerminal && (
                          <button
                            type="button"
                            className="btn-action-primary"
                            onClick={() => handleOpenWorkModal(item)}
                            title="Work Claim & Update Status"
                          >
                            Work
                          </button>
                        )}

                        <button
                          type="button"
                          className="btn-action-secondary"
                          onClick={() => handleOpenAssignModal(item)}
                          title="Assign or Reassign Specialist"
                        >
                          <UserCheck size={14} />
                        </button>

                        {!isTerminal && (
                          <button
                            type="button"
                            className="btn-action-emerald"
                            onClick={() => handleOpenRecoveryModal(item)}
                            title="Record Cash Remittance"
                          >
                            <DollarSign size={14} />
                          </button>
                        )}

                        <button
                          type="button"
                          className="btn-action-slate"
                          onClick={() => handleOpenAuditModal(item)}
                          title="View Chronological Audit Trail"
                        >
                          <History size={14} />
                        </button>

                        {!isTerminal && (
                          <button
                            type="button"
                            className="btn-action-danger"
                            onClick={() => handleOpenDismissModal(item)}
                            title="Dismiss / Write Off Claim"
                          >
                            <XCircle size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: WORKBENCH CLAIM ACTION */}
      {/* ========================================================================= */}
      {showWorkModal && activeItem && (
        <div className="rrw-modal-backdrop">
          <div className="rrw-modal-container">
            <div className="rrw-modal-header">
              <div className="rrw-modal-title-group">
                <ClipboardList size={18} className="text-blue" />
                <h3 className="rrw-modal-title">Work Recovery Claim</h3>
              </div>
              <button className="rrw-modal-close-btn" onClick={() => setShowWorkModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveWorkAction}>
              <div className="rrw-modal-body">
                <div className="summary-spec-card">
                  <div><strong>Claim:</strong> {activeItem.claim_number} • <strong>Patient:</strong> {activeItem.patient_name}</div>
                  <div><strong>Procedure:</strong> {activeItem.procedure_name}</div>
                  <div><strong>Expected Yield:</strong> <span className="text-emerald font-bold">${activeItem.expected_realizable_yield.toFixed(2)}</span> (ROPS: {activeItem.rops_priority_score.toFixed(1)})</div>
                  <div><strong>SLA Deadline:</strong> {formatHoursLeft(activeItem.sla_deadline)}</div>
                </div>

                <div className="form-group">
                  <label>Update Lifecycle Status <span className="text-crimson">*</span></label>
                  <select
                    className="rrw-form-control"
                    value={workStatusInput}
                    onChange={(e) => setWorkStatusInput(e.target.value)}
                    required
                  >
                    <option value="IN_PROGRESS">Active in Workbench</option>
                    <option value="PENDING_DOCS">Pending Documentation (e.g. Invoice / Op Note)</option>
                    <option value="DISPUTE_SUBMITTED">Dispute / Letter Submitted to Payer</option>
                    <option value="APPEAL_PENDING">Formal Payer Appeal Pending</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Action & Clinical Notes <span className="text-crimson">*</span></label>
                  <textarea
                    rows={4}
                    required
                    className="rrw-form-control"
                    placeholder="Document phone inquiry, reference number, clinical justifications, or required attachments..."
                    value={workNotesInput}
                    onChange={(e) => setWorkNotesInput(e.target.value)}
                  />
                </div>
              </div>
              <div className="rrw-modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowWorkModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Update Claim</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: SPECIALIST ASSIGNMENT & CAPACITY */}
      {/* ========================================================================= */}
      {showAssignModal && activeItem && (
        <div className="rrw-modal-backdrop">
          <div className="rrw-modal-container">
            <div className="rrw-modal-header">
              <div className="rrw-modal-title-group">
                <UserCheck size={18} className="text-teal" />
                <h3 className="rrw-modal-title">Assign Recovery Specialist</h3>
              </div>
              <button className="rrw-modal-close-btn" onClick={() => setShowAssignModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveAssign}>
              <div className="rrw-modal-body">
                <div className="summary-spec-card">
                  <div><strong>Claim:</strong> {activeItem.claim_number} ({activeItem.patient_name})</div>
                  <div><strong>Current Specialist:</strong> {activeItem.assigned_specialist_name || 'Unassigned'}</div>
                  <div><strong>Gross Recoverable:</strong> ${activeItem.gross_recoverable_amount.toFixed(2)}</div>
                </div>

                <div className="form-group">
                  <label>Select Specialist <span className="text-crimson">*</span></label>
                  <select
                    className="rrw-form-control"
                    value={targetSpecialistId}
                    onChange={(e) => setTargetSpecialistId(e.target.value)}
                    required
                  >
                    {specialistsWorkload.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} — {s.activeCases}/{s.capacity} claims ({s.capacityPct}%)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Routing & Assignment Notes</label>
                  <textarea
                    rows={3}
                    className="rrw-form-control"
                    placeholder="Special instructions or contractual focus for the assigned specialist..."
                    value={assignNotesInput}
                    onChange={(e) => setAssignNotesInput(e.target.value)}
                  />
                </div>
              </div>
              <div className="rrw-modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowAssignModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Confirm Assignment</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: RECORD CASH RECOVERY */}
      {/* ========================================================================= */}
      {showRecoveryModal && activeItem && (
        <div className="rrw-modal-backdrop">
          <div className="rrw-modal-container">
            <div className="rrw-modal-header">
              <div className="rrw-modal-title-group">
                <DollarSign size={18} className="text-emerald" />
                <h3 className="rrw-modal-title">Record Realized Cash Recovery</h3>
              </div>
              <button className="rrw-modal-close-btn" onClick={() => setShowRecoveryModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveRecovery}>
              <div className="rrw-modal-body">
                <div className="summary-spec-card">
                  <div><strong>Claim:</strong> {activeItem.claim_number} ({activeItem.payer_name})</div>
                  <div><strong>Procedure:</strong> {activeItem.procedure_name}</div>
                  <div><strong>Gross Recoverable:</strong> ${activeItem.gross_recoverable_amount.toFixed(2)}</div>
                </div>

                <div className="form-group">
                  <label>Actual Cash Collected ($) <span className="text-crimson">*</span></label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    className="rrw-form-control"
                    value={recoveryCashInput}
                    onChange={(e) => setRecoveryCashInput(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Remittance Check / ERA # / Adjustment Code <span className="text-crimson">*</span></label>
                  <input
                    type="text"
                    required
                    className="rrw-form-control"
                    placeholder="e.g. 835 Remittance ERA-2026-BCBS-912"
                    value={remittanceRefInput}
                    onChange={(e) => setRemittanceRefInput(e.target.value)}
                  />
                </div>
              </div>
              <div className="rrw-modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowRecoveryModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Confirm & Reconcile</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: DISMISS CLAIM / WRITE-OFF */}
      {/* ========================================================================= */}
      {showDismissModal && activeItem && (
        <div className="rrw-modal-backdrop">
          <div className="rrw-modal-container">
            <div className="rrw-modal-header">
              <div className="rrw-modal-title-group">
                <XCircle size={18} className="text-crimson" />
                <h3 className="rrw-modal-title">Dismiss / Write Off Claim</h3>
              </div>
              <button className="rrw-modal-close-btn" onClick={() => setShowDismissModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveDismiss}>
              <div className="rrw-modal-body">
                <div className="summary-spec-card">
                  <div><strong>Claim:</strong> {activeItem.claim_number} ({activeItem.patient_name})</div>
                  <div><strong>Gross Balance:</strong> ${activeItem.gross_recoverable_amount.toFixed(2)}</div>
                  <div className="text-crimson font-bold">This will remove the claim from active recovery work.</div>
                </div>

                <div className="form-group">
                  <label>Dismissal Reason <span className="text-crimson">*</span></label>
                  <select
                    className="rrw-form-control"
                    value={dismissReasonInput}
                    onChange={(e) => setDismissReasonInput(e.target.value)}
                    required
                  >
                    {DISMISSAL_REASONS.map(r => (
                      <option key={r.code} value={r.code}>{r.label}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Supervisor Justification Notes <span className="text-crimson">*</span></label>
                  <textarea
                    rows={3}
                    required
                    className="rrw-form-control"
                    placeholder="Provide mandatory contractual or audit justification for closing this balance..."
                    value={dismissNotesInput}
                    onChange={(e) => setDismissNotesInput(e.target.value)}
                  />
                </div>
              </div>
              <div className="rrw-modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowDismissModal(false)}>Cancel</button>
                <button type="submit" className="btn-danger">Confirm Dismissal</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: SPECIALIST CAPACITY DASHBOARD */}
      {/* ========================================================================= */}
      {showCapacityModal && (
        <div className="rrw-modal-backdrop">
          <div className="rrw-modal-container rrw-modal-lg">
            <div className="rrw-modal-header">
              <div className="rrw-modal-title-group">
                <Users size={18} className="text-sky" />
                <h3 className="rrw-modal-title">Specialist Workload & Capacity Management</h3>
              </div>
              <button className="rrw-modal-close-btn" onClick={() => setShowCapacityModal(false)}>✕</button>
            </div>
            <div className="rrw-modal-body">
              <div className="config-info-box">
                <Clock size={16} className="text-sky inline-icon" />
                <span>Specialists are capped at 35 active claims to maintain high recovery touch rates and prevent SLA breaches.</span>
              </div>

              <div className="specialists-grid">
                {specialistsWorkload.map(spec => (
                  <div key={spec.id} className="specialist-card">
                    <div className="spec-card-header">
                      <div>
                        <strong>{spec.name}</strong>
                        <div className="spec-role-sub">{spec.role}</div>
                      </div>
                      <span className={`capacity-badge ${spec.capacityPct >= 80 ? 'badge-warning' : 'badge-normal'}`}>
                        {spec.activeCases} / {spec.capacity}
                      </span>
                    </div>

                    <div className="capacity-bar-track">
                      <div 
                        className={`capacity-bar-fill ${spec.capacityPct >= 80 ? 'bar-warning' : 'bar-normal'}`} 
                        style={{ width: `${Math.min(100, spec.capacityPct)}%` }}
                      />
                    </div>

                    <div className="spec-metrics-row">
                      <span>Assigned Yield: <strong>${spec.totalExpectedYield.toLocaleString()}</strong></span>
                      <span>Breaches: <strong className={spec.breachesCount > 0 ? 'text-crimson' : ''}>{spec.breachesCount}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rrw-modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setShowCapacityModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 6: IMMUTABLE AUDIT TIMELINE */}
      {/* ========================================================================= */}
      {showAuditModal && activeItem && (
        <div className="rrw-modal-backdrop">
          <div className="rrw-modal-container rrw-modal-lg">
            <div className="rrw-modal-header">
              <div className="rrw-modal-title-group">
                <History size={18} className="text-teal" />
                <h3 className="rrw-modal-title">Audit Provenance & Touch History</h3>
              </div>
              <button className="rrw-modal-close-btn" onClick={() => setShowAuditModal(false)}>✕</button>
            </div>
            <div className="rrw-modal-body">
              <div className="summary-spec-card">
                <div><strong>Claim:</strong> {activeItem.claim_number} ({activeItem.patient_name})</div>
                <div><strong>Procedure:</strong> {activeItem.procedure_name}</div>
                <div><strong>Total Touches:</strong> {activeItem.touch_count} logged interactions</div>
              </div>

              <div className="timeline-container">
                {auditLogList.length === 0 ? (
                  <p className="empty-desc text-center">No audit records logged for this claim yet.</p>
                ) : (
                  auditLogList.map((entry, idx) => (
                    <div key={entry.id || idx} className="timeline-item">
                      <div className="timeline-marker" />
                      <div className="timeline-content">
                        <div className="timeline-header">
                          <span className="timeline-action">{entry.action_type}</span>
                          <span className="timeline-date">{new Date(entry.created_at).toLocaleString()}</span>
                        </div>
                        <div className="timeline-actor">Performed by: <strong>{entry.performed_by_name}</strong></div>
                        <p className="timeline-notes">{entry.action_notes}</p>
                        {entry.previous_status && entry.new_status && (
                          <div className="timeline-status-transition">
                            <span>{entry.previous_status}</span>
                            <ChevronRight size={12} />
                            <strong>{entry.new_status}</strong>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="rrw-modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setShowAuditModal(false)}>Close Timeline</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

