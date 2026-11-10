/**
 * RECOVERY EVIDENCE AND TIMELINE VIEW
 * Phase 93B — Revenue Cycle Management
 * 
 * Interactive clinical command center for managing auditable recovery cases,
 * multi-source evidence packages, chronological audit timelines, submission tracking,
 * payer response logging, and incremental verified cash reconciliation.
 * 
 * Maestro Clinical Design System Compliant: ZERO PROHIBITED COLOR PALETTES
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Send,
  History,
  Sparkles,
  RefreshCw,
  Download,
  Lock,
  DollarSign,
  Search,
  FileCheck,
  Check,
  X,
  FileSpreadsheet
} from 'lucide-react';
import recoveryEvidenceService, {
  RECOVERY_CASE_STATUSES,
  EVIDENCE_TYPES,
  SUBMISSION_CHANNELS,
  PAYER_RESPONSE_TYPES,
  OUTCOME_TYPES,
  calculateRecoveryProgress
} from '../lib/recoveryEvidenceService';
import './RecoveryEvidenceTimelineView.css';

export default function RecoveryEvidenceTimelineView() {
  const [cases, setCases] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const [activeTab, setActiveTab] = useState('worklist'); // 'worklist' | 'timeline' | 'evidence' | 'responses'
  
  // Filters & Search
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [payerFilter, setPayerFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [submissionModalOpen, setSubmissionModalOpen] = useState(false);
  const [responseModalOpen, setResponseModalOpen] = useState(false);
  const [reconcileModalOpen, setReconcileModalOpen] = useState(false);
  const [narrativeModalOpen, setNarrativeModalOpen] = useState(false);

  // Form states for modals
  const [approvalNotes, setApprovalNotes] = useState('');
  const [selectedChannel, setSelectedChannel] = useState('WAYSTAR');
  const [submissionRef, setSubmissionRef] = useState('');
  const [submissionNotes, setSubmissionNotes] = useState('');
  
  const [responseType, setResponseType] = useState('ACKNOWLEDGMENT');
  const [responseDate, setResponseDate] = useState(new Date().toISOString().split('T')[0]);
  const [responseAmount, setResponseAmount] = useState('');
  const [responseReasonCode, setResponseReasonCode] = useState('');
  const [responseNotes, setResponseNotes] = useState('');

  const [reconcileAmount, setReconcileAmount] = useState('');
  const [reconcileSource, setReconcileSource] = useState('ERA_835_REMITTANCE');
  const [reconcileRecordId, setReconcileRecordId] = useState('');
  const [excludePatientPaid, setExcludePatientPaid] = useState('0.00');
  const [excludeSecondaryPaid, setExcludeSecondaryPaid] = useState('0.00');

  const [aiNarrativeText, setAiNarrativeText] = useState('');

  // Notification / Alert message banner
  const [actionNotice, setActionNotice] = useState(null);

  // Load cases from service
  const refreshData = () => {
    const data = recoveryEvidenceService.getAll();
    setCases(data);
    if (!selectedCaseId && data.length > 0) {
      setSelectedCaseId(data[0].id);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const metrics = useMemo(() => {
    return recoveryEvidenceService.getMetrics();
  }, [cases]);

  const selectedCase = useMemo(() => {
    return cases.find(c => c.id === selectedCaseId) || cases[0] || null;
  }, [cases, selectedCaseId]);

  // Filtered cases list
  const filteredCases = useMemo(() => {
    return cases.filter(item => {
      const matchStatus = statusFilter === 'ALL' || item.status === statusFilter;
      const matchPayer = payerFilter === 'ALL' || item.payer_id === payerFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchQuery = !q ||
        item.claim_number.toLowerCase().includes(q) ||
        item.patient_name.toLowerCase().includes(q) ||
        item.payer_name.toLowerCase().includes(q) ||
        item.cpt_code.toLowerCase().includes(q);
      return matchStatus && matchPayer && matchQuery;
    });
  }, [cases, statusFilter, payerFilter, searchQuery]);

  // Unique payers for filter dropdown
  const uniquePayers = useMemo(() => {
    const map = new Map();
    cases.forEach(c => map.set(c.payer_id, c.payer_name));
    return Array.from(map.entries());
  }, [cases]);

  // Quick Action: Handle Human Approval (P0 Safeguard)
  const handleApproveCase = (e) => {
    e.preventDefault();
    try {
      recoveryEvidenceService.approve_recovery_case(
        selectedCase.id,
        'usr-supervisor-1',
        null,
        approvalNotes || 'Human supervisor verified clinical evidence and approved external submission.'
      );
      refreshData();
      setApprovalModalOpen(false);
      setApprovalNotes('');
      setActionNotice({
        type: 'success',
        text: `Recovery case ${selectedCase.claim_number} successfully APPROVED. Cryptographic package hash recorded.`
      });
    } catch (err) {
      setActionNotice({ type: 'error', text: err.message });
    }
  };

  // Quick Action: Handle External Submission
  const handleSubmitCase = (e) => {
    e.preventDefault();
    try {
      recoveryEvidenceService.record_recovery_submission(
        selectedCase.id,
        selectedChannel,
        'usr-supervisor-1',
        submissionRef || null,
        submissionNotes || 'Dispatched via configured channel.'
      );
      refreshData();
      setSubmissionModalOpen(false);
      setSubmissionRef('');
      setSubmissionNotes('');
      setActionNotice({
        type: 'success',
        text: `Dispute package for ${selectedCase.claim_number} dispatched via ${selectedChannel}. Status set to SUBMITTED.`
      });
    } catch (err) {
      setActionNotice({ type: 'error', text: err.message });
    }
  };

  // Quick Action: Handle Payer Response
  const handleRecordResponse = (e) => {
    e.preventDefault();
    try {
      recoveryEvidenceService.record_payer_response(
        selectedCase.id,
        responseType,
        responseDate,
        responseAmount ? parseFloat(responseAmount) : null,
        responseReasonCode,
        responseNotes
      );
      refreshData();
      setResponseModalOpen(false);
      setResponseAmount('');
      setResponseReasonCode('');
      setResponseNotes('');
      setActionNotice({
        type: 'success',
        text: `Payer response ${responseType} logged for case ${selectedCase.claim_number}.`
      });
    } catch (err) {
      setActionNotice({ type: 'error', text: err.message });
    }
  };

  // Quick Action: Handle Incremental Cash Reconciliation
  const handleReconcileCash = (e) => {
    e.preventDefault();
    const amount = parseFloat(reconcileAmount);
    if (!amount || amount <= 0) {
      setActionNotice({ type: 'error', text: 'Please enter a valid positive incremental payment amount.' });
      return;
    }

    try {
      recoveryEvidenceService.reconcile_recovery_payment(selectedCase.id, {
        incrementalPayment: amount,
        verificationSource: reconcileSource,
        verificationRecordId: reconcileRecordId || `EFT-MANUAL-${Date.now()}`,
        patientResponsibility: parseFloat(excludePatientPaid) || 0,
        secondaryPayment: parseFloat(excludeSecondaryPaid) || 0
      });
      refreshData();
      setReconcileModalOpen(false);
      setReconcileAmount('');
      setReconcileRecordId('');
      setActionNotice({
        type: 'success',
        text: `Successfully reconciled $${amount.toFixed(2)} incremental cash for case ${selectedCase.claim_number}.`
      });
    } catch (err) {
      setActionNotice({ type: 'error', text: err.message });
    }
  };

  // Quick Action: Open AI Narrative Drafter
  const handleOpenAiNarrative = () => {
    if (!selectedCase) return;
    const narrative = recoveryEvidenceService.generateReconsiderationNarrative(selectedCase.id);
    setAiNarrativeText(narrative);
    setNarrativeModalOpen(true);
  };

  // Quick Action: Export Recovery Cases to CSV
  const handleExportCsv = () => {
    const headers = ['Case ID', 'Claim #', 'Patient', 'Payer', 'CPT Code', 'Potential Recovery', 'Recovered Amount', 'Status', 'Filing Deadline', 'Approved By'];
    const rows = cases.map(c => [
      c.id,
      c.claim_number,
      c.patient_name,
      c.payer_name,
      c.cpt_code,
      c.potential_recovery.toFixed(2),
      c.recovered_amount.toFixed(2),
      c.status,
      c.filing_deadline || 'N/A',
      c.approved_by || 'UNAPPROVED'
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `recovery_cases_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="recovery-view-container">
      {/* 1. Header Bar */}
      <div className="recovery-header-bar">
        <div className="recovery-header-left">
          <div className="recovery-phase-badge">Phase 93B • Recovery Evidence</div>
          <div>
            <h1 className="recovery-header-title">Recovery Evidence, Submission & Response Timeline</h1>
            <p className="recovery-header-subtitle">
              Deterministic evidence packages, human approval governance, multi-channel dispatch & verified cash reconciliation
            </p>
          </div>
        </div>
        <div className="recovery-header-actions">
          <button className="recovery-btn recovery-btn-secondary" onClick={refreshData}>
            <RefreshCw size={15} /> Sync State
          </button>
          <button className="recovery-btn recovery-btn-secondary" onClick={handleExportCsv}>
            <Download size={15} /> Export CSV
          </button>
          {selectedCase && (
            <button className="recovery-btn recovery-btn-primary" onClick={handleOpenAiNarrative}>
              <Sparkles size={15} /> Draft Reconsideration
            </button>
          )}
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionNotice && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          backgroundColor: actionNotice.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
          border: `1px solid ${actionNotice.type === 'error' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
          color: actionNotice.type === 'error' ? '#fca5a5' : '#86efac',
          fontSize: '0.85rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>{actionNotice.text}</span>
          <button
            onClick={() => setActionNotice(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* 2. 5-Card Financial & Operational KPI Ribbon */}
      <div className="recovery-kpi-grid">
        <div className="recovery-kpi-card kpi-accent-blue">
          <div className="recovery-kpi-header">
            <span>Total Recovery Cases</span>
            <FileSpreadsheet size={16} color="#0284c7" />
          </div>
          <p className="recovery-kpi-value">{metrics.totalCases}</p>
          <p className="recovery-kpi-subtext">{metrics.activeCases} active recovery workflows</p>
        </div>

        <div className="recovery-kpi-card kpi-accent-amber">
          <div className="recovery-kpi-header">
            <span>Disputed Potential</span>
            <DollarSign size={16} color="#f59e0b" />
          </div>
          <p className="recovery-kpi-value">${metrics.totalValidated.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          <p className="recovery-kpi-subtext">Contractually validated variance</p>
        </div>

        <div className="recovery-kpi-card kpi-accent-cyan">
          <div className="recovery-kpi-header">
            <span>Approved Pipeline</span>
            <Send size={16} color="#06b6d4" />
          </div>
          <p className="recovery-kpi-value">${metrics.approvedInFlight.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          <p className="recovery-kpi-subtext">Signed off and submitted in-flight</p>
        </div>

        <div className="recovery-kpi-card kpi-accent-emerald">
          <div className="recovery-kpi-header">
            <span>Realized Recovered Cash</span>
            <ShieldCheck size={16} color="#10b981" />
          </div>
          <p className="recovery-kpi-value">${metrics.totalRecovered.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          <p className="recovery-kpi-subtext">Verified post-submission remittances</p>
        </div>

        <div className="recovery-kpi-card kpi-accent-slate">
          <div className="recovery-kpi-header">
            <span>Realization & Cycle Time</span>
            <Clock size={16} color="#94a3b8" />
          </div>
          <p className="recovery-kpi-value">{metrics.realizationRate}%</p>
          <p className="recovery-kpi-subtext">Avg {metrics.avgResolutionDays} days resolution time</p>
        </div>
      </div>

      {/* 3. Tab Navigation Bar */}
      <div className="recovery-tabs-bar">
        <button
          className={`recovery-tab-btn ${activeTab === 'worklist' ? 'active' : ''}`}
          onClick={() => setActiveTab('worklist')}
        >
          <FileText size={15} /> Recovery Cases Worklist ({filteredCases.length})
        </button>
        <button
          className={`recovery-tab-btn ${activeTab === 'timeline' ? 'active' : ''}`}
          onClick={() => setActiveTab('timeline')}
        >
          <History size={15} /> Case Audit Timeline {selectedCase ? `(${selectedCase.claim_number})` : ''}
        </button>
        <button
          className={`recovery-tab-btn ${activeTab === 'evidence' ? 'active' : ''}`}
          onClick={() => setActiveTab('evidence')}
        >
          <FileCheck size={15} /> Evidence Package Inspector {selectedCase ? `(${selectedCase.evidence.length} docs)` : ''}
        </button>
        <button
          className={`recovery-tab-btn ${activeTab === 'responses' ? 'active' : ''}`}
          onClick={() => setActiveTab('responses')}
        >
          <ShieldCheck size={15} /> Payer Responses & Cash Reconciliation
        </button>
      </div>

      {/* 4. Tab 1: Worklist Workbench */}
      {activeTab === 'worklist' && (
        <div className="recovery-panel">
          <div className="recovery-panel-header">
            <h2 className="recovery-panel-title">
              <FileSpreadsheet size={18} color="#0284c7" /> Contractual Recovery Cases Queue
            </h2>
            <div className="recovery-filter-bar">
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="recovery-search-input"
                  placeholder="Search claim, patient, CPT..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <select
                className="recovery-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">All Statuses ({cases.length})</option>
                {Object.keys(RECOVERY_CASE_STATUSES).map(st => (
                  <option key={st} value={st}>{RECOVERY_CASE_STATUSES[st].label}</option>
                ))}
              </select>

              <select
                className="recovery-select"
                value={payerFilter}
                onChange={(e) => setPayerFilter(e.target.value)}
              >
                <option value="ALL">All Payers</option>
                {uniquePayers.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="recovery-table-container">
            <table className="recovery-table">
              <thead>
                <tr>
                  <th>Claim / Patient</th>
                  <th>Payer / Plan</th>
                  <th>Procedure (CPT)</th>
                  <th>Disputed ($)</th>
                  <th>Recovered ($)</th>
                  <th>Status</th>
                  <th>Approval</th>
                  <th>Filing Deadline</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCases.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>
                      No recovery cases match the selected filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredCases.map(item => {
                    const statusConfig = RECOVERY_CASE_STATUSES[item.status] || { label: item.status, badgeColor: '#64748b' };
                    const isSelected = selectedCase && selectedCase.id === item.id;
                    return (
                      <tr
                        key={item.id}
                        className={isSelected ? 'selected' : ''}
                        onClick={() => setSelectedCaseId(item.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <div style={{ fontWeight: 600, color: '#ffffff' }}>{item.claim_number}</div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{item.patient_name} (Case #{item.case_id})</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: '#f8fafc' }}>{item.payer_name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{item.plan_name}</div>
                        </td>
                        <td>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#38bdf8' }}>{item.cpt_code}</span>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.procedure_name}
                          </div>
                        </td>
                        <td style={{ fontWeight: 700, color: '#f59e0b' }}>
                          ${item.validated_recovery_amount.toFixed(2)}
                        </td>
                        <td style={{ fontWeight: 700, color: item.recovered_amount > 0 ? '#10b981' : '#64748b' }}>
                          ${item.recovered_amount.toFixed(2)}
                        </td>
                        <td>
                          <span
                            className="recovery-status-pill"
                            style={{
                              backgroundColor: `${statusConfig.badgeColor}20`,
                              color: statusConfig.badgeColor,
                              border: `1px solid ${statusConfig.badgeColor}50`
                            }}
                          >
                            {statusConfig.label}
                          </span>
                        </td>
                        <td>
                          {item.approved_by ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#10b981' }}>
                              <CheckCircle2 size={13} /> Approved
                            </span>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#f59e0b' }}>
                              <AlertTriangle size={13} /> Unapproved
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                          {item.filing_deadline || 'Open'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                            {!item.approved_by && item.status !== 'EXPIRED' && (
                              <button
                                className="recovery-btn recovery-btn-primary"
                                style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                onClick={() => { setSelectedCaseId(item.id); setApprovalModalOpen(true); }}
                                title="Approve Recovery Case"
                              >
                                Approve
                              </button>
                            )}
                            {item.status === 'APPROVED' && (
                              <button
                                className="recovery-btn recovery-btn-primary"
                                style={{ padding: '4px 8px', fontSize: '0.75rem', backgroundColor: '#0284c7' }}
                                onClick={() => { setSelectedCaseId(item.id); setSubmissionModalOpen(true); }}
                                title="Submit Recovery Packet"
                              >
                                <Send size={12} /> Submit
                              </button>
                            )}
                            {['SUBMITTED', 'ACKNOWLEDGED', 'UNDER_PAYER_REVIEW', 'PAYER_INFO_REQUESTED', 'REPROCESSING'].includes(item.status) && (
                              <button
                                className="recovery-btn recovery-btn-secondary"
                                style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                onClick={() => { setSelectedCaseId(item.id); setResponseModalOpen(true); }}
                                title="Record Payer Response"
                              >
                                Response
                              </button>
                            )}
                            <button
                              className="recovery-btn recovery-btn-success"
                              style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                              onClick={() => { setSelectedCaseId(item.id); setReconcileModalOpen(true); }}
                              title="Reconcile Incremental Cash"
                            >
                              <DollarSign size={12} /> Reconcile
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Tab 2: Chronological Recovery Timeline */}
      {activeTab === 'timeline' && selectedCase && (
        <div className="recovery-panel">
          <div className="recovery-panel-header">
            <div>
              <h2 className="recovery-panel-title">
                <History size={18} color="#0284c7" /> Audit Timeline: Claim #{selectedCase.claim_number}
              </h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                Immutable event stream with timestamps, actors, external references, and status transitions
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="recovery-btn recovery-btn-secondary"
                onClick={() => setResponseModalOpen(true)}
              >
                Log Event / Response
              </button>
            </div>
          </div>

          <div className="recovery-timeline-list">
            {selectedCase.events.map((evt, idx) => (
              <div key={evt.id || idx} className="recovery-timeline-item">
                <div className="recovery-timeline-dot" />
                <div className="recovery-timeline-header">
                  <span className="recovery-timeline-action">{evt.event_type.replace(/_/g, ' ')}</span>
                  <span>{new Date(evt.event_at).toLocaleString()}</span>
                </div>
                <div className="recovery-timeline-notes">{evt.notes}</div>
                <div className="recovery-timeline-meta">
                  <span><strong>Actor:</strong> {evt.actor_name || 'System'}</span>
                  <span><strong>System:</strong> {evt.source_system || 'ASCANALYST'}</span>
                  {evt.external_reference && <span><strong>Ref:</strong> {evt.external_reference}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. Tab 3: Evidence Package Inspector */}
      {activeTab === 'evidence' && selectedCase && (
        <div className="recovery-panel">
          <div className="recovery-panel-header">
            <div>
              <h2 className="recovery-panel-title">
                <FileCheck size={18} color="#10b981" /> Evidence Package: {selectedCase.claim_number}
              </h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                13-source clinical and contractual evidence compilation. Required documents must be present before supervisor sign-off.
              </p>
            </div>
            <div>
              {selectedCase.package_hash ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '6px', color: '#34d399', fontSize: '0.8rem' }}>
                  <Lock size={14} /> Hash: {selectedCase.package_hash}
                </div>
              ) : (
                <button
                  className="recovery-btn recovery-btn-primary"
                  onClick={() => {
                    recoveryEvidenceService.validate_recovery_package(selectedCase.id);
                    refreshData();
                  }}
                >
                  Compile & Verify Package
                </button>
              )}
            </div>
          </div>

          <div className="recovery-evidence-grid">
            {selectedCase.evidence.map(ev => (
              <div
                key={ev.id}
                className={`recovery-evidence-card ${ev.is_present ? 'present' : 'missing'}`}
              >
                <div className="recovery-evidence-top">
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: ev.is_present ? '#10b981' : '#f59e0b' }}>
                    {ev.evidence_type}
                  </span>
                  {ev.is_present ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: '#10b981' }}>
                      <Check size={12} /> Present
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: '#f59e0b' }}>
                      <AlertTriangle size={12} /> Required Missing
                    </span>
                  )}
                </div>
                <h4 className="recovery-evidence-title">{ev.title}</h4>
                {ev.document_uri && (
                  <div style={{ fontSize: '0.75rem', color: '#38bdf8' }}>
                    URI: {ev.document_uri}
                  </div>
                )}
                {ev.content_hash && (
                  <div className="recovery-evidence-hash">
                    {ev.content_hash}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid #334155', fontSize: '0.75rem', color: '#94a3b8' }}>
                  <span>{ev.is_required ? 'Required Document' : 'Optional Exhibit'}</span>
                  {!ev.is_present && (
                    <button
                      className="recovery-btn recovery-btn-secondary"
                      style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                      onClick={() => {
                        ev.is_present = true;
                        ev.document_uri = `/vault/uploads/${ev.evidence_type.toLowerCase()}_attached.pdf`;
                        ev.content_hash = `sha256-man-${Date.now().toString(16)}`;
                        recoveryEvidenceService.validate_recovery_package(selectedCase.id);
                        refreshData();
                      }}
                    >
                      Attach Document
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 7. Tab 4: Payer Responses & Cash Reconciliation */}
      {activeTab === 'responses' && selectedCase && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* Payer Responses Log */}
          <div className="recovery-panel">
            <div className="recovery-panel-header">
              <h2 className="recovery-panel-title">
                <ShieldCheck size={18} color="#0284c7" /> Payer Responses Log
              </h2>
              <button
                className="recovery-btn recovery-btn-primary"
                onClick={() => setResponseModalOpen(true)}
              >
                Log Response
              </button>
            </div>

            {selectedCase.payer_responses.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '0.85rem' }}>No responses logged from {selectedCase.payer_name} yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {selectedCase.payer_responses.map((pr, idx) => (
                  <div
                    key={pr.id || idx}
                    style={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      padding: '12px 14px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 700, color: '#ffffff', fontSize: '0.85rem' }}>
                        {pr.response_type.replace(/_/g, ' ')}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{pr.response_date}</span>
                    </div>
                    {pr.amount !== null && (
                      <div style={{ fontWeight: 700, color: '#10b981', fontSize: '0.9rem', marginBottom: '4px' }}>
                        Approved Amount: ${pr.amount.toFixed(2)}
                      </div>
                    )}
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#cbd5e1' }}>{pr.notes}</p>
                    {pr.reason_code && (
                      <span style={{ display: 'inline-block', marginTop: '6px', fontSize: '0.7rem', padding: '2px 6px', background: '#0f172a', borderRadius: '4px', color: '#94a3b8' }}>
                        Reason Code: {pr.reason_code}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Incremental Cash Reconciliation Panel */}
          <div className="recovery-panel">
            <div className="recovery-panel-header">
              <h2 className="recovery-panel-title">
                <DollarSign size={18} color="#10b981" /> Verified Incremental Cash
              </h2>
              <button
                className="recovery-btn recovery-btn-success"
                onClick={() => setReconcileModalOpen(true)}
              >
                Reconcile Cash
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ padding: '16px', background: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Validated Target Underpayment:</span>
                  <span style={{ fontWeight: 700, color: '#ffffff' }}>${selectedCase.validated_recovery_amount.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Total Cash Verified to Date:</span>
                  <span style={{ fontWeight: 700, color: '#10b981' }}>${selectedCase.recovered_amount.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid #334155' }}>
                  <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Remaining Disputed Balance:</span>
                  <span style={{ fontWeight: 700, color: '#f59e0b' }}>
                    ${Math.max(0, selectedCase.validated_recovery_amount - selectedCase.recovered_amount).toFixed(2)}
                  </span>
                </div>
              </div>

              {selectedCase.outcome && (
                <div style={{ padding: '14px', background: 'rgba(16, 185, 129, 0.08)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                  <div style={{ fontWeight: 700, color: '#34d399', fontSize: '0.85rem', marginBottom: '4px' }}>
                    Outcome Record: {selectedCase.outcome.outcome_type}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>
                    Verified Source: {selectedCase.outcome.verification_source} | Ref: {selectedCase.outcome.verification_record_id}
                  </div>
                </div>
              )}

              <div style={{ padding: '12px', background: 'rgba(2, 132, 199, 0.08)', borderRadius: '8px', border: '1px solid rgba(2, 132, 199, 0.2)', fontSize: '0.75rem', color: '#94a3b8' }}>
                <strong style={{ color: '#38bdf8' }}>Accounting Guardrail (Rule 3):</strong> Realized recovery only counts true incremental remittance amounts above baseline allowed. Patient responsibility and secondary COB payments are excluded automatically.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* 8. MODALS                                                                      */}
      {/* ============================================================================== */}

      {/* Modal 1: Human Approval (Rule 2 Safeguard) */}
      {approvalModalOpen && selectedCase && (
        <div className="recovery-modal-overlay">
          <div className="recovery-modal-content">
            <div className="recovery-modal-header">
              <h3 className="recovery-modal-title">Human Supervisor Sign-Off & Approval</h3>
              <button
                onClick={() => setApprovalModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleApproveCase}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ padding: '12px', background: '#1e293b', borderRadius: '8px', fontSize: '0.8rem', color: '#cbd5e1' }}>
                  <div><strong>Claim:</strong> {selectedCase.claim_number} | <strong>Payer:</strong> {selectedCase.payer_name}</div>
                  <div><strong>Disputed Amount:</strong> ${selectedCase.validated_recovery_amount.toFixed(2)}</div>
                  <div><strong>Evidence Items:</strong> {selectedCase.evidence.filter(e => e.is_present).length} of {selectedCase.evidence.length} present</div>
                </div>

                <div className="recovery-form-group">
                  <label className="recovery-form-label">Supervisor Sign-Off Notes / Justification</label>
                  <textarea
                    className="recovery-form-textarea"
                    placeholder="Enter audit verification notes confirming contract rate validity..."
                    value={approvalNotes}
                    onChange={(e) => setApprovalNotes(e.target.value)}
                    required
                  />
                </div>

                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  By approving, an immutable SHA-256 evidence package hash will be generated and signed by your user account.
                </div>
              </div>
              <div className="recovery-modal-actions">
                <button
                  type="button"
                  className="recovery-btn recovery-btn-secondary"
                  onClick={() => setApprovalModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="recovery-btn recovery-btn-primary">
                  Sign & Authorize Submission
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Submission Dispatch */}
      {submissionModalOpen && selectedCase && (
        <div className="recovery-modal-overlay">
          <div className="recovery-modal-content">
            <div className="recovery-modal-header">
              <h3 className="recovery-modal-title">Dispatch Recovery Packet to Payer</h3>
              <button
                onClick={() => setSubmissionModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmitCase}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="recovery-form-group">
                  <label className="recovery-form-label">Submission Channel (8 Supported)</label>
                  <select
                    className="recovery-select"
                    value={selectedChannel}
                    onChange={(e) => setSelectedChannel(e.target.value)}
                  >
                    {Object.keys(SUBMISSION_CHANNELS).map(ch => (
                      <option key={ch} value={ch}>{SUBMISSION_CHANNELS[ch].label} — {SUBMISSION_CHANNELS[ch].mode}</option>
                    ))}
                  </select>
                </div>

                <div className="recovery-form-group">
                  <label className="recovery-form-label">External Tracking Reference (Optional)</label>
                  <input
                    type="text"
                    className="recovery-form-input"
                    placeholder="e.g. WAYSTAR-DISP-99120, Portal Batch ID, Certified Mail #..."
                    value={submissionRef}
                    onChange={(e) => setSubmissionRef(e.target.value)}
                  />
                </div>

                <div className="recovery-form-group">
                  <label className="recovery-form-label">Transmission Notes</label>
                  <textarea
                    className="recovery-form-textarea"
                    placeholder="Enter dispatch notes..."
                    value={submissionNotes}
                    onChange={(e) => setSubmissionNotes(e.target.value)}
                  />
                </div>
              </div>
              <div className="recovery-modal-actions">
                <button
                  type="button"
                  className="recovery-btn recovery-btn-secondary"
                  onClick={() => setSubmissionModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="recovery-btn recovery-btn-primary">
                  <Send size={14} /> Dispatch Packet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Payer Response Logger */}
      {responseModalOpen && selectedCase && (
        <div className="recovery-modal-overlay">
          <div className="recovery-modal-content">
            <div className="recovery-modal-header">
              <h3 className="recovery-modal-title">Record Payer Adjudication Response</h3>
              <button
                onClick={() => setResponseModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleRecordResponse}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="recovery-form-group">
                  <label className="recovery-form-label">Response Type</label>
                  <select
                    className="recovery-select"
                    value={responseType}
                    onChange={(e) => setResponseType(e.target.value)}
                  >
                    {Object.keys(PAYER_RESPONSE_TYPES).map(rt => (
                      <option key={rt} value={rt}>{rt.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="recovery-form-group">
                    <label className="recovery-form-label">Response Date</label>
                    <input
                      type="date"
                      className="recovery-form-input"
                      value={responseDate}
                      onChange={(e) => setResponseDate(e.target.value)}
                      required
                    />
                  </div>

                  <div className="recovery-form-group">
                    <label className="recovery-form-label">Approved Amount ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="recovery-form-input"
                      placeholder="Optional supplemental $"
                      value={responseAmount}
                      onChange={(e) => setResponseAmount(e.target.value)}
                    />
                  </div>
                </div>

                <div className="recovery-form-group">
                  <label className="recovery-form-label">Reason / Disposition Code</label>
                  <input
                    type="text"
                    className="recovery-form-input"
                    placeholder="e.g. OVERTURN-01, ADR-OP-NOTE, CARC-45..."
                    value={responseReasonCode}
                    onChange={(e) => setResponseReasonCode(e.target.value)}
                  />
                </div>

                <div className="recovery-form-group">
                  <label className="recovery-form-label">Response Narrative & Details</label>
                  <textarea
                    className="recovery-form-textarea"
                    placeholder="Payer explanation or stipulations..."
                    value={responseNotes}
                    onChange={(e) => setResponseNotes(e.target.value)}
                  />
                </div>
              </div>
              <div className="recovery-modal-actions">
                <button
                  type="button"
                  className="recovery-btn recovery-btn-secondary"
                  onClick={() => setResponseModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="recovery-btn recovery-btn-primary">
                  Save Response
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 4: Incremental Cash Reconciliation */}
      {reconcileModalOpen && selectedCase && (
        <div className="recovery-modal-overlay">
          <div className="recovery-modal-content">
            <div className="recovery-modal-header">
              <h3 className="recovery-modal-title">Reconcile Verified Incremental Cash</h3>
              <button
                onClick={() => setReconcileModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleReconcileCash}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ padding: '12px', background: 'rgba(2, 132, 199, 0.08)', borderRadius: '8px', border: '1px solid rgba(2, 132, 199, 0.2)', fontSize: '0.8rem', color: '#cbd5e1' }}>
                  Target Underpayment: <strong>${selectedCase.validated_recovery_amount.toFixed(2)}</strong> | Previously Recovered: <strong>${selectedCase.recovered_amount.toFixed(2)}</strong>
                </div>

                <div className="recovery-form-group">
                  <label className="recovery-form-label">Incremental Cash Received ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="recovery-form-input"
                    placeholder="0.00"
                    value={reconcileAmount}
                    onChange={(e) => setReconcileAmount(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="recovery-form-group">
                    <label className="recovery-form-label">Verification Source</label>
                    <select
                      className="recovery-select"
                      value={reconcileSource}
                      onChange={(e) => setReconcileSource(e.target.value)}
                    >
                      <option value="ERA_835_REMITTANCE">835 Electronic Remittance</option>
                      <option value="BANK_DEPOSIT_MATCH">Bank Deposit Match</option>
                      <option value="LOCKBOX_STATEMENT">Lockbox Voucher</option>
                      <option value="TREASURY_LEDGER">Treasury General Ledger</option>
                    </select>
                  </div>

                  <div className="recovery-form-group">
                    <label className="recovery-form-label">Check / EFT Reference ID</label>
                    <input
                      type="text"
                      className="recovery-form-input"
                      placeholder="e.g. EFT-9912048"
                      value={reconcileRecordId}
                      onChange={(e) => setReconcileRecordId(e.target.value)}
                    />
                  </div>
                </div>

                {/* Exclusions for Strict Accounting (Rule 3) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="recovery-form-group">
                    <label className="recovery-form-label">Patient Paid Portion (Excluded)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="recovery-form-input"
                      value={excludePatientPaid}
                      onChange={(e) => setExcludePatientPaid(e.target.value)}
                    />
                  </div>
                  <div className="recovery-form-group">
                    <label className="recovery-form-label">Secondary Paid Portion (Excluded)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="recovery-form-input"
                      value={excludeSecondaryPaid}
                      onChange={(e) => setExcludeSecondaryPaid(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="recovery-modal-actions">
                <button
                  type="button"
                  className="recovery-btn recovery-btn-secondary"
                  onClick={() => setReconcileModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="recovery-btn recovery-btn-success">
                  Confirm Cash Receipt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 5: AI Reconsideration Drafter */}
      {narrativeModalOpen && selectedCase && (
        <div className="recovery-modal-overlay">
          <div className="recovery-modal-content" style={{ maxWidth: '720px' }}>
            <div className="recovery-modal-header">
              <h3 className="recovery-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={18} color="#0284c7" /> AI Reconsideration & Dispute Narrative Drafter
              </h3>
              <button
                onClick={() => setNarrativeModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', padding: '8px 12px', background: '#1e293b', borderRadius: '6px' }}>
                <strong style={{ color: '#38bdf8' }}>AI Boundary Notice:</strong> AI generates this draft narrative citing governing contract sections and evidence exhibits. Human approval is mandatory prior to external submission.
              </div>
              <textarea
                className="recovery-form-textarea"
                style={{ minHeight: '300px', fontFamily: 'monospace', fontSize: '0.8rem', lineHeight: '1.5' }}
                value={aiNarrativeText}
                onChange={(e) => setAiNarrativeText(e.target.value)}
              />
            </div>
            <div className="recovery-modal-actions">
              <button
                type="button"
                className="recovery-btn recovery-btn-secondary"
                onClick={() => {
                  navigator.clipboard.writeText(aiNarrativeText);
                  setActionNotice({ type: 'success', text: 'Dispute narrative copied to clipboard!' });
                  setNarrativeModalOpen(false);
                }}
              >
                Copy to Clipboard
              </button>
              <button
                type="button"
                className="recovery-btn recovery-btn-primary"
                onClick={() => setNarrativeModalOpen(false)}
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
