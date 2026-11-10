import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  AlertTriangle,
  DollarSign,
  CheckCircle2,
  Download,
  RefreshCw,
  X,
  ShieldAlert,
  Layers,
  Activity,
  FileText,
  Clock,
  ArrowRightCircle,
  GitBranch,
  Building2,
  FileCheck
} from 'lucide-react';
import paymentVarianceValidationService, {
  VALIDATION_STATUSES,
  CONFIDENCE_LEVELS,
  getValidationSummaryMetrics,
  getOutcomeDistribution,
  calculateVarianceAmount,
  calculateVariancePercentage
} from '../lib/paymentVarianceValidationService';
import './PaymentVarianceValidationView.css';

export default function PaymentVarianceValidationView() {
  const [activeTab, setActiveTab] = useState('worklist'); // 'worklist' | 'claim_lines' | 'outcomes' | 'lineage'
  const [variances, setVariances] = useState(() => paymentVarianceValidationService.getVariances());

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [confidenceFilter, setConfidenceFilter] = useState('ALL');
  const [payerFilter, setPayerFilter] = useState('ALL');
  const [recoveryOnlyFilter, setRecoveryOnlyFilter] = useState(false);

  // Modal State
  const [selectedVariance, setSelectedVariance] = useState(null);
  const [modalMode, setModalMode] = useState('validate'); // 'validate' | 'advance' | 'flag_review' | 'dismiss'
  const [modalNotes, setModalNotes] = useState('');
  const [reviewReason, setReviewReason] = useState('RULE_AMBIGUITY');
  const [dismissReason, setDismissReason] = useState('CONTRACTUAL_ALLOWANCE');
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  // Filtered variances
  const filteredVariances = useMemo(() => {
    return variances.filter(pv => {
      const matchStat = statusFilter === 'ALL' || pv.validation_status === statusFilter;
      const matchConf = confidenceFilter === 'ALL' || pv.confidence_level === confidenceFilter;
      const matchPayer = payerFilter === 'ALL' || pv.payer_name === payerFilter;
      const matchRec = !recoveryOnlyFilter || (VALIDATION_STATUSES[pv.validation_status] && VALIDATION_STATUSES[pv.validation_status].isRecoveryEligible);
      const q = searchTerm.toLowerCase();
      const matchSearch = !searchTerm ||
        pv.id.toLowerCase().includes(q) ||
        pv.claim_id.toLowerCase().includes(q) ||
        pv.patient_name.toLowerCase().includes(q) ||
        pv.payer_name.toLowerCase().includes(q) ||
        pv.cpt_code.toLowerCase().includes(q) ||
        pv.procedure_name.toLowerCase().includes(q);

      return matchStat && matchConf && matchPayer && matchRec && matchSearch;
    });
  }, [variances, statusFilter, confidenceFilter, payerFilter, recoveryOnlyFilter, searchTerm]);

  // Executive Metrics
  const summaryMetrics = useMemo(() => {
    return getValidationSummaryMetrics(variances);
  }, [variances]);

  // Outcome Distribution
  const outcomeDistribution = useMemo(() => {
    return getOutcomeDistribution(variances);
  }, [variances]);

  // Unique Payers for Filter
  const uniquePayers = useMemo(() => {
    const set = new Set();
    variances.forEach(pv => set.add(pv.payer_name));
    return Array.from(set).sort();
  }, [variances]);

  // Actions
  const handleOpenModal = (pv, mode) => {
    setSelectedVariance(pv);
    setModalMode(mode);
    setModalNotes('');
    setReviewReason('RULE_AMBIGUITY');
    setDismissReason('CONTRACTUAL_ALLOWANCE');
  };

  const handleCloseModal = () => {
    setSelectedVariance(null);
  };

  const handleModalSubmit = (e) => {
    e.preventDefault();
    if (!selectedVariance) return;

    try {
      if (modalMode === 'validate') {
        paymentVarianceValidationService.validateVariance(selectedVariance.id, { notes: modalNotes });
        showToast(`Variance ${selectedVariance.id.slice(0, 8)} validated. Status and rule lineage updated.`);
      } else if (modalMode === 'advance') {
        paymentVarianceValidationService.advanceToRecovery(selectedVariance.id, { notes: modalNotes });
        showToast(`Variance ${selectedVariance.id.slice(0, 8)} advanced to recovery evidence worklist.`);
      } else if (modalMode === 'flag_review') {
        paymentVarianceValidationService.flagManualReview(selectedVariance.id, {
          reason: reviewReason,
          notes: modalNotes
        });
        showToast(`Variance ${selectedVariance.id.slice(0, 8)} flagged for supervisor review (${reviewReason}).`);
      } else if (modalMode === 'dismiss') {
        paymentVarianceValidationService.dismissVariance(selectedVariance.id, {
          reason: dismissReason,
          notes: modalNotes
        });
        showToast(`Variance ${selectedVariance.id.slice(0, 8)} dismissed (${dismissReason}).`);
      }

      setVariances(paymentVarianceValidationService.getVariances());
      handleCloseModal();
    } catch (err) {
      alert(`Action error: ${err.message}`);
    }
  };

  const handleRefresh = () => {
    setVariances(paymentVarianceValidationService.getVariances());
    showToast('Payment variance validation audit scan completed. Authoritative rules synchronized.');
  };

  const handleExport = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(variances, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `payment_variance_validation_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Payment variance validation report exported successfully.');
  };

  return (
    <div className="variance-validation-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '1.5rem',
          right: '1.5rem',
          zIndex: 10000,
          backgroundColor: '#0f172a',
          color: '#38bdf8',
          border: '1px solid #0284c7',
          padding: '0.85rem 1.25rem',
          borderRadius: '0.5rem',
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          fontSize: '0.85rem',
          fontWeight: 600
        }}>
          <CheckCircle2 size={18} className="text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Topbar */}
      <div className="variance-validation-topbar">
        <div className="variance-validation-title-section">
          <div className="variance-validation-badge-group">
            <span className="phase-pill-variance-validation">Phase 93A • VARIANCE VALIDATION</span>
            <span className="facility-pill-variance-validation">ASC Main Facility</span>
          </div>
          <h1 className="variance-validation-heading">Payment Variance Validation Engine</h1>
          <p className="variance-validation-subheading">
            Detection is not proof. Deterministic contract lineage, adjudication context, and 12-state root cause validation before recovery.
          </p>
        </div>
        <div className="variance-validation-topbar-actions">
          <button
            type="button"
            className="btn-secondary-variance-validation"
            onClick={handleExport}
            title="Export full payment variance validation log"
          >
            <Download size={15} />
            <span>Export Validated Log</span>
          </button>
          <button
            type="button"
            className="btn-primary-variance-validation"
            onClick={handleRefresh}
            title="Trigger automated contract variance validation"
          >
            <RefreshCw size={15} />
            <span>Run Validation Engine</span>
          </button>
        </div>
      </div>

      {/* KPI Ribbon */}
      <div className="variance-validation-kpi-ribbon">
        <div className="variance-validation-kpi-card kpi-amber">
          <div className="variance-validation-kpi-header">
            <span>Total Variances Audited</span>
            <AlertTriangle size={16} className="text-amber-400" />
          </div>
          <div className="variance-validation-kpi-value">{summaryMetrics.totalVariances}</div>
          <div className="variance-validation-kpi-subtext">Active remittance discrepancies</div>
        </div>

        <div className="variance-validation-kpi-card kpi-rose">
          <div className="variance-validation-kpi-header">
            <span>Valid Underpayments</span>
            <DollarSign size={16} className="text-rose-400" />
          </div>
          <div className="variance-validation-kpi-value">
            ${summaryMetrics.validUnderpaymentAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="variance-validation-kpi-subtext">Verified actionable short-pays</div>
        </div>

        <div className="variance-validation-kpi-card kpi-slate">
          <div className="variance-validation-kpi-header">
            <span>Contractual Allowances</span>
            <FileCheck size={16} className="text-slate-400" />
          </div>
          <div className="variance-validation-kpi-value">
            ${summaryMetrics.contractualAllowanceAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="variance-validation-kpi-subtext">Verified agreed fee discounts & MPPR</div>
        </div>

        <div className="variance-validation-kpi-card kpi-emerald">
          <div className="variance-validation-kpi-header">
            <span>Patient Liability (PR)</span>
            <Building2 size={16} className="text-emerald-400" />
          </div>
          <div className="variance-validation-kpi-value">
            ${summaryMetrics.patientLiabilityAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="variance-validation-kpi-subtext">Deductible, co-pay & co-insurance</div>
        </div>

        <div className="variance-validation-kpi-card kpi-sky">
          <div className="variance-validation-kpi-header">
            <span>Pending Review / Ambiguous</span>
            <Clock size={16} className="text-sky-400" />
          </div>
          <div className="variance-validation-kpi-value">
            ${summaryMetrics.pendingReviewAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="variance-validation-kpi-subtext">Secondary pending or coder query</div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="variance-validation-tabs">
        <button
          type="button"
          className={`variance-validation-tab-btn ${activeTab === 'worklist' ? 'active' : ''}`}
          onClick={() => setActiveTab('worklist')}
        >
          <FileText size={15} />
          <span>Validation Worklist</span>
          <span className="variance-validation-tab-badge">{filteredVariances.length}</span>
        </button>

        <button
          type="button"
          className={`variance-validation-tab-btn ${activeTab === 'claim_lines' ? 'active' : ''}`}
          onClick={() => setActiveTab('claim_lines')}
        >
          <Activity size={15} />
          <span>Claim-Line Adjudication Trace</span>
        </button>

        <button
          type="button"
          className={`variance-validation-tab-btn ${activeTab === 'outcomes' ? 'active' : ''}`}
          onClick={() => setActiveTab('outcomes')}
        >
          <Layers size={15} />
          <span>12-State Outcome Distribution</span>
          <span className="variance-validation-tab-badge">12</span>
        </button>

        <button
          type="button"
          className={`variance-validation-tab-btn ${activeTab === 'lineage' ? 'active' : ''}`}
          onClick={() => setActiveTab('lineage')}
        >
          <GitBranch size={15} />
          <span>Contract Lineage & Rule Snapshot</span>
        </button>
      </div>

      {/* Main Tab Canvas */}
      <div className="variance-validation-tab-canvas">
        {/* WORKLIST TAB */}
        {activeTab === 'worklist' && (
          <>
            {/* Filter Toolbar */}
            <div className="variance-validation-filter-toolbar">
              <div className="variance-validation-search-box">
                <Search size={15} className="text-slate-400" />
                <input
                  type="text"
                  placeholder="Search claim, patient, payer, CPT, procedure..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="variance-validation-filter-group">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Filter size={13} className="text-slate-400" />
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Payer:</span>
                </div>
                <select
                  className="variance-validation-filter-select"
                  value={payerFilter}
                  onChange={(e) => setPayerFilter(e.target.value)}
                >
                  <option value="ALL">All Payers</option>
                  {uniquePayers.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Confidence:</span>
                </div>
                <select
                  className="variance-validation-filter-select"
                  value={confidenceFilter}
                  onChange={(e) => setConfidenceFilter(e.target.value)}
                >
                  <option value="ALL">All Levels</option>
                  {Object.keys(CONFIDENCE_LEVELS).map(k => (
                    <option key={k} value={k}>{CONFIDENCE_LEVELS[k].label}</option>
                  ))}
                </select>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Outcome:</span>
                </div>
                <select
                  className="variance-validation-filter-select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="ALL">All 12 Outcomes</option>
                  {Object.keys(VALIDATION_STATUSES).map(k => (
                    <option key={k} value={k}>{VALIDATION_STATUSES[k].label}</option>
                  ))}
                </select>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.775rem', color: '#f8fafc', marginLeft: '0.75rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={recoveryOnlyFilter}
                    onChange={(e) => setRecoveryOnlyFilter(e.target.checked)}
                  />
                  <span>Recovery Eligible Only</span>
                </label>
              </div>
            </div>

            {/* Table */}
            <div className="variance-validation-table-responsive">
              <table className="variance-validation-clinical-table">
                <thead>
                  <tr>
                    <th>Confidence</th>
                    <th>Claim / Case</th>
                    <th>Payer</th>
                    <th>Procedure / CPT</th>
                    <th>Patient / DOS</th>
                    <th>Expected Allowed</th>
                    <th>Actual Allowed</th>
                    <th>Variance ($)</th>
                    <th>Validated Outcome</th>
                    <th>Completeness</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVariances.length === 0 ? (
                    <tr>
                      <td colSpan={11} style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                        No payment variance records match the current filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredVariances.map(pv => {
                      const statInfo = VALIDATION_STATUSES[pv.validation_status] || { label: pv.validation_status, colorToken: 'slate' };
                      const confInfo = CONFIDENCE_LEVELS[pv.confidence_level] || { label: pv.confidence_level };

                      return (
                        <tr key={pv.id}>
                          <td>
                            <span style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              padding: '0.2rem 0.5rem',
                              borderRadius: '0.35rem',
                              backgroundColor: pv.confidence_level === 'HIGH' ? 'rgba(16, 185, 129, 0.2)' :
                                pv.confidence_level === 'MEDIUM' ? 'rgba(14, 165, 233, 0.2)' :
                                pv.confidence_level === 'LOW' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(51, 65, 85, 0.5)',
                              color: pv.confidence_level === 'HIGH' ? '#34d399' :
                                pv.confidence_level === 'MEDIUM' ? '#38bdf8' :
                                pv.confidence_level === 'LOW' ? '#fbbf24' : '#94a3b8',
                              border: '1px solid ' + (
                                pv.confidence_level === 'HIGH' ? 'rgba(16, 185, 129, 0.4)' :
                                pv.confidence_level === 'MEDIUM' ? 'rgba(14, 165, 233, 0.4)' :
                                pv.confidence_level === 'LOW' ? 'rgba(245, 158, 11, 0.4)' : 'rgba(51, 65, 85, 0.8)'
                              )
                            }}>
                              {confInfo.label}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                              <span style={{ fontWeight: 600, color: '#f8fafc' }}>{pv.claim_id.slice(0, 8)}...</span>
                              <span style={{ fontSize: '0.725rem', color: '#64748b' }}>Case: #{pv.case_id}</span>
                            </div>
                          </td>
                          <td>
                            <span style={{ fontWeight: 600, color: '#38bdf8' }}>{pv.payer_name}</span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                              <span style={{ fontWeight: 600 }}>CPT {pv.cpt_code}</span>
                              <span style={{ fontSize: '0.725rem', color: '#94a3b8', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={pv.procedure_name}>
                                {pv.procedure_name}
                              </span>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                              <span style={{ fontWeight: 600 }}>{pv.patient_name}</span>
                              <span style={{ fontSize: '0.725rem', color: '#64748b' }}>DOS: {pv.date_of_service}</span>
                            </div>
                          </td>
                          <td style={{ fontWeight: 600, color: '#34d399' }}>
                            ${pv.expected_allowed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ fontWeight: 600, color: '#cbd5e1' }}>
                            ${(pv.actual_allowed || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ fontWeight: 700, color: pv.variance_amount > 0 ? '#f43f5e' : '#34d399' }}>
                            ${pv.variance_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td>
                            <span style={{
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              padding: '0.2rem 0.5rem',
                              borderRadius: '9999px',
                              backgroundColor: statInfo.colorToken === 'rose' ? 'rgba(244, 63, 94, 0.2)' :
                                statInfo.colorToken === 'amber' ? 'rgba(245, 158, 11, 0.2)' :
                                statInfo.colorToken === 'sky' ? 'rgba(14, 165, 233, 0.2)' : 'rgba(51, 65, 85, 0.5)',
                              color: statInfo.colorToken === 'rose' ? '#f43f5e' :
                                statInfo.colorToken === 'amber' ? '#fbbf24' :
                                statInfo.colorToken === 'sky' ? '#38bdf8' : '#94a3b8',
                              border: '1px solid ' + (
                                statInfo.colorToken === 'rose' ? 'rgba(244, 63, 94, 0.4)' :
                                statInfo.colorToken === 'amber' ? 'rgba(245, 158, 11, 0.4)' :
                                statInfo.colorToken === 'sky' ? 'rgba(14, 165, 233, 0.4)' : 'rgba(51, 65, 85, 0.8)'
                              )
                            }}>
                              {statInfo.label}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: pv.data_completeness_score >= 90 ? '#34d399' : '#fbbf24' }}>
                                {pv.data_completeness_score || 0}%
                              </span>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <button
                                type="button"
                                className="btn-variance-validation-action"
                                onClick={() => handleOpenModal(pv, 'validate')}
                                title="Re-evaluate 10-step validation engine"
                              >
                                Validate
                              </button>
                              {statInfo.isRecoveryEligible && (
                                <button
                                  type="button"
                                  className="btn-variance-validation-action"
                                  onClick={() => handleOpenModal(pv, 'advance')}
                                  title="Advance to Phase 93 recovery workflow"
                                  style={{ borderColor: '#10b981', color: '#34d399' }}
                                >
                                  Advance
                                </button>
                              )}
                              {!statInfo.isRecoveryEligible && (
                                <button
                                  type="button"
                                  className="btn-variance-validation-action"
                                  onClick={() => handleOpenModal(pv, 'flag_review')}
                                  title="Flag for manual review"
                                  style={{ color: '#94a3b8' }}
                                >
                                  Review
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
          </>
        )}

        {/* CLAIM LINES TAB */}
        {activeTab === 'claim_lines' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff', margin: 0 }}>
                Claim-Line Adjudication Evidence Trace
              </h2>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                Linking expected contract fee calculation to exact 835 line adjudication
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: '1rem' }}>
              {variances.map(pv => (
                <div key={pv.id} className="claim-line-evidence-card">
                  <div className="claim-line-evidence-header">
                    <div>
                      <span style={{ fontWeight: 700, color: '#38bdf8', fontSize: '0.9rem' }}>
                        {pv.payer_name}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '0.5rem' }}>
                        Claim #{pv.claim_id.slice(0, 8)} • Case #{pv.case_id}
                      </span>
                    </div>
                    <span style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '0.15rem 0.45rem',
                      borderRadius: '0.25rem',
                      backgroundColor: '#1e293b',
                      color: pv.variance_amount > 0 ? '#f43f5e' : '#34d399'
                    }}>
                      Variance: ${pv.variance_amount.toFixed(2)}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.775rem', color: '#cbd5e1' }}>
                    <strong>Procedure:</strong> {pv.procedure_name} (DOS: {pv.date_of_service})
                  </div>

                  {/* Line breakdown */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                      Adjudicated Lines:
                    </span>
                    {(pv.lines || []).map(line => (
                      <div key={line.id} className="claim-line-detail-row">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontWeight: 700, color: '#38bdf8' }}>{line.cpt_hcpcs_code}</span>
                          {(line.modifiers || []).map(m => (
                            <span key={m} style={{ fontSize: '0.7rem', padding: '0.1rem 0.35rem', borderRadius: '0.2rem', backgroundColor: '#1e293b', color: '#cbd5e1' }}>
                              -{m}
                            </span>
                          ))}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <span style={{ color: '#34d399' }}>Exp: ${line.expected_allowed.toFixed(2)}</span>
                          <span style={{ color: '#cbd5e1' }}>Act: ${line.actual_allowed.toFixed(2)}</span>
                          <span style={{ fontWeight: 700, color: line.line_variance > 0 ? '#f43f5e' : '#34d399' }}>
                            Var: ${line.line_variance.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic', borderTop: '1px solid #1e293b', paddingTop: '0.5rem' }}>
                    <strong>Audit Trace:</strong> {pv.resolution_notes}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* OUTCOMES TAB */}
        {activeTab === 'outcomes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff', margin: 0 }}>
                Deterministic 12-State Validation Taxonomy
              </h2>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                Only recovery-eligible verified states advance to Phase 93 dispute work queues
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              {outcomeDistribution.map(d => (
                <div
                  key={d.id}
                  style={{
                    backgroundColor: '#0b1120',
                    border: '1px solid #1e293b',
                    borderRadius: '0.65rem',
                    padding: '1.15rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '0.2rem 0.5rem',
                      borderRadius: '0.35rem',
                      backgroundColor: d.isRecoveryEligible ? 'rgba(244, 63, 94, 0.2)' : 'rgba(51, 65, 85, 0.5)',
                      color: d.isRecoveryEligible ? '#f43f5e' : '#94a3b8',
                      border: '1px solid ' + (d.isRecoveryEligible ? 'rgba(244, 63, 94, 0.4)' : 'rgba(51, 65, 85, 0.8)')
                    }}>
                      {d.isRecoveryEligible ? 'Recovery Eligible' : 'Non-Actionable / Review'}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      {d.count} variances
                    </span>
                  </div>

                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#ffffff', margin: 0 }}>
                    {d.label}
                  </h3>
                  <p style={{ fontSize: '0.775rem', color: '#94a3b8', margin: 0, minHeight: '36px' }}>
                    {d.description}
                  </p>

                  <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Total Variance:</span>
                    <span style={{ fontSize: '1.1rem', fontWeight: 700, color: d.isRecoveryEligible ? '#f43f5e' : '#38bdf8' }}>
                      ${d.total_variance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* LINEAGE TAB */}
        {activeTab === 'lineage' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff', margin: 0 }}>
                Contract Lineage & Calculation Version Provenance
              </h2>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                Immutable snapshots tying every variance to governing contract versions and 835 transactions
              </span>
            </div>

            <div className="variance-validation-table-responsive">
              <table className="variance-validation-clinical-table">
                <thead>
                  <tr>
                    <th>Claim / Case</th>
                    <th>Payer / Plan</th>
                    <th>Contract Version ID</th>
                    <th>Calculation Version</th>
                    <th>Source 835 ERA</th>
                    <th>Root Cause Code</th>
                    <th>Filing Deadline</th>
                  </tr>
                </thead>
                <tbody>
                  {variances.map(pv => (
                    <tr key={pv.id}>
                      <td style={{ fontWeight: 600, color: '#ffffff' }}>
                        #{pv.claim_id.slice(0, 8)} (Case #{pv.case_id})
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                          <span style={{ fontWeight: 600, color: '#38bdf8' }}>{pv.payer_name}</span>
                          <span style={{ fontSize: '0.725rem', color: '#64748b' }}>Plan: {pv.plan_id || 'N/A'}</span>
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: pv.contract_version_id ? '#34d399' : '#f43f5e' }}>
                          {pv.contract_version_id || 'UNINDEXED'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#cbd5e1' }}>
                          {pv.calculation_version_id || 'NONE'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.75rem', color: '#38bdf8' }}>
                          {pv.source_835_id || 'UNMATCHED'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.725rem', color: '#fbbf24', fontWeight: 600 }}>
                          {pv.root_cause_code || 'UNCLASSIFIED'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.75rem', color: pv.days_until_deadline !== null && pv.days_until_deadline <= 30 ? '#f43f5e' : '#cbd5e1', fontWeight: 600 }}>
                          {pv.filing_deadline || 'N/A'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Action Modal */}
      {selectedVariance && (
        <div className="variance-validation-modal-overlay">
          <div className="variance-validation-modal-card">
            <div className="variance-validation-modal-header">
              <h3 className="variance-validation-modal-title">
                {modalMode === 'validate' && `Re-Evaluate Validation Engine: #${selectedVariance.claim_id.slice(0, 8)}`}
                {modalMode === 'advance' && `Advance to Recovery Queue: #${selectedVariance.claim_id.slice(0, 8)}`}
                {modalMode === 'flag_review' && `Flag for Supervisor Review: #${selectedVariance.claim_id.slice(0, 8)}`}
                {modalMode === 'dismiss' && `Dismiss Variance: #${selectedVariance.claim_id.slice(0, 8)}`}
              </h3>
              <button
                type="button"
                className="variance-validation-modal-close-btn"
                onClick={handleCloseModal}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleModalSubmit}>
              <div className="variance-validation-modal-body">
                {/* Variance Context Card */}
                <div style={{
                  backgroundColor: '#0b1120',
                  border: '1px solid #1e293b',
                  borderRadius: '0.5rem',
                  padding: '0.85rem 1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem',
                  fontSize: '0.8rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>Payer: <strong style={{ color: '#38bdf8' }}>{selectedVariance.payer_name}</strong></span>
                    <span style={{ color: '#94a3b8' }}>DOS: <strong>{selectedVariance.date_of_service}</strong></span>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8' }}>Encounter: </span>
                    <strong>{selectedVariance.patient_name}</strong> — {selectedVariance.procedure_name} (CPT {selectedVariance.cpt_code})
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem' }}>
                    <span style={{ color: '#34d399' }}>Expected: ${selectedVariance.expected_allowed.toFixed(2)}</span>
                    <span style={{ color: '#f43f5e' }}>Variance: ${selectedVariance.variance_amount.toFixed(2)} ({selectedVariance.variance_percent}%)</span>
                  </div>
                </div>

                {/* Specific form fields */}
                {modalMode === 'validate' && (
                  <div className="variance-validation-form-field">
                    <label className="variance-validation-form-label">Audit Notes & Contract Verification</label>
                    <textarea
                      className="variance-validation-form-textarea"
                      rows={3}
                      placeholder="Enter verification notes for contract amendment, 835 line matching, or MPPR calculations..."
                      value={modalNotes}
                      onChange={(e) => setModalNotes(e.target.value)}
                    />
                  </div>
                )}

                {modalMode === 'advance' && (
                  <div className="variance-validation-form-field">
                    <label className="variance-validation-form-label">Recovery Workflow Routing Notes</label>
                    <textarea
                      className="variance-validation-form-textarea"
                      rows={3}
                      placeholder="Document verified contract allowable violation. Queued for Phase 93 dispute letter submission..."
                      value={modalNotes}
                      onChange={(e) => setModalNotes(e.target.value)}
                      required
                    />
                  </div>
                )}

                {modalMode === 'flag_review' && (
                  <>
                    <div className="variance-validation-form-field">
                      <label className="variance-validation-form-label">Review Request Reason</label>
                      <select
                        className="variance-validation-form-select"
                        value={reviewReason}
                        onChange={(e) => setReviewReason(e.target.value)}
                      >
                        <option value="RULE_AMBIGUITY">Conflicting Fee Schedule Rules</option>
                        <option value="CODER_QUERY">Modifier -59 / Distinct Service Coding Query</option>
                        <option value="IMPLANT_INVOICE_MISSING">Distributor Invoice Missing from Electronic Record</option>
                        <option value="COB_PRIMARY_UNRESOLVED">Secondary Insurer Crossover Status Ambiguous</option>
                        <option value="CONTRACT_AMENDMENT_QUERY">Payer Applied Superseded Prior-Year Rates</option>
                      </select>
                    </div>
                    <div className="variance-validation-form-field">
                      <label className="variance-validation-form-label">Review Instructions</label>
                      <textarea
                        className="variance-validation-form-textarea"
                        rows={3}
                        placeholder="Provide detailed instructions for coder, billing supervisor, or contract specialist..."
                        value={modalNotes}
                        onChange={(e) => setModalNotes(e.target.value)}
                        required
                      />
                    </div>
                  </>
                )}

                {modalMode === 'dismiss' && (
                  <>
                    <div className="variance-validation-form-field">
                      <label className="variance-validation-form-label">Dismissal Justification</label>
                      <select
                        className="variance-validation-form-select"
                        value={dismissReason}
                        onChange={(e) => setDismissReason(e.target.value)}
                      >
                        <option value="CONTRACTUAL_ALLOWANCE">Verified Legitimate Contractual Write-Off</option>
                        <option value="MPPR_STATUTORY_REDUCTION">Verified Statutory 50% MPPR Discount</option>
                        <option value="PRIMARY_CASE_RATE_PACKAGED">Verified Packaged into Primary Case Rate</option>
                        <option value="PATIENT_RESPONSIBILITY_CONFIRMED">Variance is 100% Patient Deductible / Co-Insurance</option>
                        <option value="SECONDARY_PAYER_BILLED">Balance Forwarded to Secondary Payer</option>
                      </select>
                    </div>
                    <div className="variance-validation-form-field">
                      <label className="variance-validation-form-label">Mandatory Clinical / Billing Rationale</label>
                      <textarea
                        className="variance-validation-form-textarea"
                        rows={3}
                        placeholder="Explain exact contract clause or adjudication proof why this variance is not an underpayment..."
                        value={modalNotes}
                        onChange={(e) => setModalNotes(e.target.value)}
                        required
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="variance-validation-modal-footer">
                <button
                  type="button"
                  className="btn-secondary-variance-validation"
                  onClick={handleCloseModal}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary-variance-validation"
                >
                  {modalMode === 'validate' && 'Re-Evaluate & Update Lineage'}
                  {modalMode === 'advance' && 'Confirm & Advance to Recovery'}
                  {modalMode === 'flag_review' && 'Submit Review Request'}
                  {modalMode === 'dismiss' && 'Confirm Dismissal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
