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
  TrendingDown,
  Building2,
  FileCheck
} from 'lucide-react';
import underpaymentService, {
  UNDERPAYMENT_CATEGORIES,
  UNDERPAYMENT_STATUSES,
  getUnderpaymentSummaryMetrics,
  getPayerUnderpaymentBreakdown,
  getCategoryUnderpaymentBreakdown,
  calculateUnderpaymentVariance,
  calculateUnderpaymentPercentage
} from '../lib/underpaymentService';
import './UnderpaymentDetectionView.css';

export default function UnderpaymentDetectionView() {
  const [activeTab, setActiveTab] = useState('worklist'); // 'worklist' | 'payers' | 'categories' | 'contract_rules'
  const [items, setItems] = useState(() => underpaymentService.getUnderpayments());

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [payerFilter, setPayerFilter] = useState('ALL');

  // Modal State
  const [selectedItem, setSelectedItem] = useState(null);
  const [modalMode, setModalMode] = useState('confirm'); // 'confirm' | 'dispute' | 'recover' | 'dismiss'
  const [modalNotes, setModalNotes] = useState('');
  const [disputeRef, setDisputeRef] = useState('');
  const [recoveryAmount, setRecoveryAmount] = useState('');
  const [dismissReason, setDismissReason] = useState('CONTRACTUAL_AMENDMENT');
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter(u => {
      const matchCat = categoryFilter === 'ALL' || u.underpayment_category === categoryFilter;
      const matchStat = statusFilter === 'ALL' || u.status === statusFilter;
      const matchPayer = payerFilter === 'ALL' || u.payer_name === payerFilter;
      const q = searchTerm.toLowerCase();
      const matchSearch = !searchTerm ||
        u.underpayment_alert_number.toLowerCase().includes(q) ||
        u.patient_name.toLowerCase().includes(q) ||
        u.surgeon_name.toLowerCase().includes(q) ||
        u.payer_name.toLowerCase().includes(q) ||
        u.cpt_code.toLowerCase().includes(q) ||
        u.procedure_name.toLowerCase().includes(q);

      return matchCat && matchStat && matchPayer && matchSearch;
    });
  }, [items, categoryFilter, statusFilter, payerFilter, searchTerm]);

  // Executive Metrics
  const summaryMetrics = useMemo(() => {
    return getUnderpaymentSummaryMetrics(items);
  }, [items]);

  // Payer Breakdown
  const payerBreakdown = useMemo(() => {
    return getPayerUnderpaymentBreakdown(items);
  }, [items]);

  // Category Breakdown
  const categoryBreakdown = useMemo(() => {
    return getCategoryUnderpaymentBreakdown(items);
  }, [items]);

  // Unique payers for filter dropdown
  const uniquePayers = useMemo(() => {
    const set = new Set();
    items.forEach(u => set.add(u.payer_name));
    return Array.from(set).sort();
  }, [items]);

  // Actions
  const handleOpenModal = (item, mode) => {
    setSelectedItem(item);
    setModalMode(mode);
    setModalNotes('');
    setDisputeRef(`DSP-${item.payer_name.slice(0, 3).toUpperCase()}-2026-${Math.floor(1000 + Math.random() * 9000)}`);
    setRecoveryAmount(item.variance_amount);
    setDismissReason('CONTRACTUAL_AMENDMENT');
  };

  const handleCloseModal = () => {
    setSelectedItem(null);
  };

  const handleModalSubmit = (e) => {
    e.preventDefault();
    if (!selectedItem) return;

    try {
      if (modalMode === 'confirm') {
        underpaymentService.confirmUnderpayment(selectedItem.id, { notes: modalNotes });
        showToast(`Underpayment Alert ${selectedItem.underpayment_alert_number} verified against contract.`);
      } else if (modalMode === 'dispute') {
        underpaymentService.submitDispute(selectedItem.id, {
          disputeReference: disputeRef,
          notes: modalNotes
        });
        showToast(`Dispute letter ${disputeRef} logged for ${selectedItem.underpayment_alert_number}.`);
      } else if (modalMode === 'recover') {
        underpaymentService.recordRecovery(selectedItem.id, {
          recoveredAmount: recoveryAmount ? parseFloat(recoveryAmount) : selectedItem.variance_amount,
          notes: modalNotes
        });
        showToast(`Recovery of $${parseFloat(recoveryAmount).toFixed(2)} recorded for ${selectedItem.underpayment_alert_number}.`);
      } else if (modalMode === 'dismiss') {
        underpaymentService.dismissUnderpayment(selectedItem.id, {
          reason: dismissReason,
          notes: modalNotes
        });
        showToast(`Alert ${selectedItem.underpayment_alert_number} dismissed (${dismissReason}).`);
      }

      setItems(underpaymentService.getUnderpayments());
      handleCloseModal();
    } catch (err) {
      alert(`Action error: ${err.message}`);
    }
  };

  const handleRefresh = () => {
    setItems(underpaymentService.getUnderpayments());
    showToast('Contract fee schedule audit completed. 835 remittance variances synchronized.');
  };

  const handleExport = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(items, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `underpayment_ledger_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Underpayment audit variance ledger exported successfully.');
  };

  return (
    <div className="underpayment-container">
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
      <div className="underpayment-topbar">
        <div className="underpayment-title-section">
          <div className="underpayment-badge-group">
            <span className="phase-pill-underpayment">Phase 93 • RCM AUDIT</span>
            <span className="facility-pill-underpayment">ASC Main Facility</span>
          </div>
          <h1 className="underpayment-heading">Underpayment Detection Engine</h1>
          <p className="underpayment-subheading">
            Algorithmic 835 remittance cross-audits against contractual fee schedules, implant carve-outs, and MPPR terms.
          </p>
        </div>
        <div className="underpayment-topbar-actions">
          <button
            type="button"
            className="btn-secondary-underpayment"
            onClick={handleExport}
            title="Export full underpayment variance ledger"
          >
            <Download size={15} />
            <span>Export Variance Ledger</span>
          </button>
          <button
            type="button"
            className="btn-primary-underpayment"
            onClick={handleRefresh}
            title="Trigger automated fee schedule compliance audit"
          >
            <RefreshCw size={15} />
            <span>Run Underpayment Audit</span>
          </button>
        </div>
      </div>

      {/* KPI Ribbon */}
      <div className="underpayment-kpi-ribbon">
        <div className="underpayment-kpi-card kpi-amber">
          <div className="underpayment-kpi-header">
            <span>Underpayment Alerts</span>
            <AlertTriangle size={16} className="text-amber-400" />
          </div>
          <div className="underpayment-kpi-value">{summaryMetrics.totalAlerts}</div>
          <div className="underpayment-kpi-subtext">Active fee schedule discrepancies</div>
        </div>

        <div className="underpayment-kpi-card kpi-rose">
          <div className="underpayment-kpi-header">
            <span>Total Variance Exposure</span>
            <DollarSign size={16} className="text-rose-400" />
          </div>
          <div className="underpayment-kpi-value">
            ${summaryMetrics.totalVarianceExposure.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="underpayment-kpi-subtext">Cumulative short-paid allowed balance</div>
        </div>

        <div className="underpayment-kpi-card kpi-sky">
          <div className="underpayment-kpi-header">
            <span>Confirmed Pipeline</span>
            <Activity size={16} className="text-sky-400" />
          </div>
          <div className="underpayment-kpi-value">
            ${summaryMetrics.confirmedPipeline.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="underpayment-kpi-subtext">Audited & queued for dispute</div>
        </div>

        <div className="underpayment-kpi-card kpi-emerald">
          <div className="underpayment-kpi-header">
            <span>Realized Disputed Cash</span>
            <CheckCircle2 size={16} className="text-emerald-400" />
          </div>
          <div className="underpayment-kpi-value">
            ${summaryMetrics.realizedDisputedCash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="underpayment-kpi-subtext">Collected via supplemental ERAs</div>
        </div>

        <div className="underpayment-kpi-card kpi-slate">
          <div className="underpayment-kpi-header">
            <span>Dismissed Adjustments</span>
            <ShieldAlert size={16} className="text-slate-400" />
          </div>
          <div className="underpayment-kpi-value">
            ${summaryMetrics.dismissedValidAdjustments.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="underpayment-kpi-subtext">Verified legitimate policy terms</div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="underpayment-tabs">
        <button
          type="button"
          className={`underpayment-tab-btn ${activeTab === 'worklist' ? 'active' : ''}`}
          onClick={() => setActiveTab('worklist')}
        >
          <FileText size={15} />
          <span>Underpayment Worklist</span>
          <span className="underpayment-tab-badge">{filteredItems.length}</span>
        </button>

        <button
          type="button"
          className={`underpayment-tab-btn ${activeTab === 'payers' ? 'active' : ''}`}
          onClick={() => setActiveTab('payers')}
        >
          <Building2 size={15} />
          <span>Payer Variance Scorecard</span>
          <span className="underpayment-tab-badge">{payerBreakdown.length}</span>
        </button>

        <button
          type="button"
          className={`underpayment-tab-btn ${activeTab === 'categories' ? 'active' : ''}`}
          onClick={() => setActiveTab('categories')}
        >
          <Layers size={15} />
          <span>Variance Categories</span>
          <span className="underpayment-tab-badge">6</span>
        </button>

        <button
          type="button"
          className={`underpayment-tab-btn ${activeTab === 'contract_rules' ? 'active' : ''}`}
          onClick={() => setActiveTab('contract_rules')}
        >
          <FileCheck size={15} />
          <span>Contract Rule Verification</span>
        </button>
      </div>

      {/* Main Tab Canvas */}
      <div className="underpayment-tab-canvas">
        {/* WORKLIST TAB */}
        {activeTab === 'worklist' && (
          <>
            {/* Filter Toolbar */}
            <div className="underpayment-filter-toolbar">
              <div className="underpayment-search-box">
                <Search size={15} className="text-slate-400" />
                <input
                  type="text"
                  placeholder="Search alert #, patient, surgeon, payer, CPT..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="underpayment-filter-group">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Filter size={13} className="text-slate-400" />
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Payer:</span>
                </div>
                <select
                  className="underpayment-filter-select"
                  value={payerFilter}
                  onChange={(e) => setPayerFilter(e.target.value)}
                >
                  <option value="ALL">All Payers</option>
                  {uniquePayers.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Category:</span>
                </div>
                <select
                  className="underpayment-filter-select"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="ALL">All Categories</option>
                  {Object.keys(UNDERPAYMENT_CATEGORIES).map(k => (
                    <option key={k} value={k}>{UNDERPAYMENT_CATEGORIES[k].label}</option>
                  ))}
                </select>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Status:</span>
                </div>
                <select
                  className="underpayment-filter-select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="ALL">All Statuses</option>
                  {Object.keys(UNDERPAYMENT_STATUSES).map(k => (
                    <option key={k} value={k}>{UNDERPAYMENT_STATUSES[k].label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="underpayment-table-responsive">
              <table className="underpayment-clinical-table">
                <thead>
                  <tr>
                    <th>Priority</th>
                    <th>Alert #</th>
                    <th>Payer</th>
                    <th>Procedure / CPT</th>
                    <th>Patient / DOS</th>
                    <th>Expected Allowed</th>
                    <th>Actual Allowed</th>
                    <th>Variance ($)</th>
                    <th>Variance (%)</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={11} style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                        No underpayment alerts match the current filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map(u => {
                      const statInfo = UNDERPAYMENT_STATUSES[u.status] || { label: u.status, colorToken: 'slate' };
                      
                      let priClass = 'priority-low-underpayment';
                      if (u.priority_score >= 70) priClass = 'priority-high-underpayment';
                      else if (u.priority_score >= 40) priClass = 'priority-med-underpayment';

                      return (
                        <tr key={u.id}>
                          <td>
                            <span className={`underpayment-priority-pill ${priClass}`}>
                              {u.priority_score.toFixed(1)}
                            </span>
                          </td>
                          <td style={{ fontWeight: 600, color: '#f8fafc' }}>
                            {u.underpayment_alert_number}
                          </td>
                          <td>
                            <span style={{ fontWeight: 600, color: '#38bdf8' }}>{u.payer_name}</span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                              <span style={{ fontWeight: 600 }}>{u.cpt_code}</span>
                              <span style={{ fontSize: '0.725rem', color: '#94a3b8', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={u.procedure_name}>
                                {u.procedure_name}
                              </span>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                              <span style={{ fontWeight: 600 }}>{u.patient_name}</span>
                              <span style={{ fontSize: '0.725rem', color: '#64748b' }}>DOS: {u.date_of_service}</span>
                            </div>
                          </td>
                          <td style={{ fontWeight: 600, color: '#34d399' }}>
                            ${u.expected_allowed_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ fontWeight: 600, color: '#cbd5e1' }}>
                            ${u.actual_allowed_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ fontWeight: 700, color: '#f43f5e' }}>
                            -${u.variance_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ fontWeight: 700, color: '#fbbf24' }}>
                            {u.variance_percentage.toFixed(1)}%
                          </td>
                          <td>
                            <span style={{
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              padding: '0.2rem 0.5rem',
                              borderRadius: '9999px',
                              backgroundColor: statInfo.colorToken === 'emerald' ? 'rgba(16, 185, 129, 0.2)' :
                                statInfo.colorToken === 'amber' ? 'rgba(245, 158, 11, 0.2)' :
                                statInfo.colorToken === 'sky' ? 'rgba(14, 165, 233, 0.2)' : 'rgba(51, 65, 85, 0.5)',
                              color: statInfo.colorToken === 'emerald' ? '#34d399' :
                                statInfo.colorToken === 'amber' ? '#fbbf24' :
                                statInfo.colorToken === 'sky' ? '#38bdf8' : '#94a3b8',
                              border: '1px solid ' + (
                                statInfo.colorToken === 'emerald' ? 'rgba(16, 185, 129, 0.4)' :
                                statInfo.colorToken === 'amber' ? 'rgba(245, 158, 11, 0.4)' :
                                statInfo.colorToken === 'sky' ? 'rgba(14, 165, 233, 0.4)' : 'rgba(51, 65, 85, 0.8)'
                              )
                            }}>
                              {statInfo.label}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              {u.status !== 'RECOVERED' && u.status !== 'DISMISSED_VALID_ADJUSTMENT' && (
                                <>
                                  <button
                                    type="button"
                                    className="btn-underpayment-action"
                                    onClick={() => handleOpenModal(u, 'confirm')}
                                    title="Confirm contractual underpayment"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-underpayment-action"
                                    onClick={() => handleOpenModal(u, 'dispute')}
                                    title="Submit formal underpayment dispute letter"
                                    style={{ borderColor: '#0ea5e9', color: '#38bdf8' }}
                                  >
                                    Dispute
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-underpayment-action"
                                    onClick={() => handleOpenModal(u, 'recover')}
                                    title="Record recovered payment"
                                    style={{ borderColor: '#10b981', color: '#34d399' }}
                                  >
                                    Recover
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-underpayment-action"
                                    onClick={() => handleOpenModal(u, 'dismiss')}
                                    title="Dismiss as contractually valid"
                                    style={{ color: '#94a3b8' }}
                                  >
                                    Dismiss
                                  </button>
                                </>
                              )}
                              {(u.status === 'RECOVERED' || u.status === 'DISMISSED_VALID_ADJUSTMENT') && (
                                <button
                                  type="button"
                                  className="btn-underpayment-action"
                                  onClick={() => handleOpenModal(u, 'confirm')}
                                  title="View audit details"
                                >
                                  Details
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

        {/* PAYERS TAB */}
        {activeTab === 'payers' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff', margin: 0 }}>
                Payer Contract Compliance & Underpayment Scorecard
              </h2>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                Variance exposure and dispute yield ranked by health plan
              </span>
            </div>

            <div className="underpayment-table-responsive">
              <table className="underpayment-clinical-table">
                <thead>
                  <tr>
                    <th>Payer Name</th>
                    <th>Underpayment Alerts</th>
                    <th>Disputed / In Pipeline</th>
                    <th>Total Variance Exposure</th>
                    <th>Recovered Supplemental Cash</th>
                    <th>Compliance Risk Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {payerBreakdown.map(p => (
                    <tr key={p.payer_name}>
                      <td style={{ fontWeight: 700, color: '#38bdf8' }}>{p.payer_name}</td>
                      <td style={{ fontWeight: 600 }}>{p.alert_count} alerts</td>
                      <td>
                        <span style={{ color: '#fbbf24', fontWeight: 600 }}>
                          {p.disputed_count} in dispute
                        </span>
                      </td>
                      <td style={{ color: '#f43f5e', fontWeight: 700 }}>
                        -${p.total_variance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ color: '#10b981', fontWeight: 700 }}>
                        ${p.recovered_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td>
                        <span style={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          padding: '0.2rem 0.5rem',
                          borderRadius: '9999px',
                          backgroundColor: p.total_variance >= 2000 ? 'rgba(244, 63, 94, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                          color: p.total_variance >= 2000 ? '#f43f5e' : '#fbbf24',
                          border: '1px solid ' + (p.total_variance >= 2000 ? 'rgba(244, 63, 94, 0.4)' : 'rgba(245, 158, 11, 0.4)')
                        }}>
                          {p.total_variance >= 2000 ? 'High Contract Variance Risk' : 'Moderate Discrepancy'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CATEGORIES TAB */}
        {activeTab === 'categories' && (
          <div className="underpayment-category-grid">
            {categoryBreakdown.map(cat => {
              const info = UNDERPAYMENT_CATEGORIES[cat.id];
              return (
                <div key={cat.id} className="underpayment-category-card">
                  <div className="underpayment-category-card-header">
                    <span style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '0.35rem',
                      backgroundColor: '#1e293b',
                      color: '#38bdf8'
                    }}>
                      {cat.id}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      {cat.count} alerts
                    </span>
                  </div>
                  <h3 className="underpayment-category-title">{cat.label}</h3>
                  <p style={{ fontSize: '0.775rem', color: '#94a3b8', margin: 0, minHeight: '36px' }}>
                    {info ? info.description : ''}
                  </p>
                  <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Total Short-Paid</div>
                      <div className="underpayment-category-metric">
                        -${cat.total_variance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Recovered Cash</div>
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: '#10b981' }}>
                        ${cat.recovered_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* CONTRACT RULES TAB */}
        {activeTab === 'contract_rules' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff', margin: 0 }}>
                Active Payer Contract Baseline Fee Schedules
              </h2>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                Legal agreements governing allowable rates and surgical carve-outs
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1rem' }}>
              {items.map(u => (
                <div
                  key={u.id}
                  style={{
                    backgroundColor: '#0b1120',
                    border: '1px solid #1e293b',
                    borderRadius: '0.65rem',
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 700, color: '#38bdf8', fontSize: '0.9rem' }}>
                        {u.payer_name}
                      </span>
                      <span style={{
                        fontSize: '0.7rem',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '0.25rem',
                        backgroundColor: '#1e293b',
                        color: '#cbd5e1'
                      }}>
                        CPT {u.cpt_code}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#f43f5e', fontWeight: 700 }}>
                      Variance: -${u.variance_amount.toFixed(2)}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                    <strong>Procedure:</strong> {u.procedure_name} (DOS: {u.date_of_service})
                  </div>

                  <div style={{
                    backgroundColor: '#0f172a',
                    border: '1px dashed #334155',
                    borderRadius: '0.4rem',
                    padding: '0.65rem 0.85rem',
                    fontSize: '0.775rem',
                    color: '#94a3b8',
                    lineHeight: 1.45
                  }}>
                    "{u.resolution_notes}"
                  </div>

                  {u.dispute_letter_reference && (
                    <div style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 600 }}>
                      Dispute Tracking: {u.dispute_letter_reference}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action Modal */}
      {selectedItem && (
        <div className="underpayment-modal-overlay">
          <div className="underpayment-modal-card">
            <div className="underpayment-modal-header">
              <h3 className="underpayment-modal-title">
                {modalMode === 'confirm' && `Confirm Contract Underpayment: ${selectedItem.underpayment_alert_number}`}
                {modalMode === 'dispute' && `Submit Payer Dispute Letter: ${selectedItem.underpayment_alert_number}`}
                {modalMode === 'recover' && `Record Supplemental Recovery: ${selectedItem.underpayment_alert_number}`}
                {modalMode === 'dismiss' && `Dismiss Underpayment Alert: ${selectedItem.underpayment_alert_number}`}
              </h3>
              <button
                type="button"
                className="underpayment-modal-close-btn"
                onClick={handleCloseModal}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleModalSubmit}>
              <div className="underpayment-modal-body">
                {/* Summary of alert */}
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
                    <span style={{ color: '#94a3b8' }}>Payer: <strong style={{ color: '#38bdf8' }}>{selectedItem.payer_name}</strong></span>
                    <span style={{ color: '#94a3b8' }}>CPT: <strong>{selectedItem.cpt_code}</strong></span>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8' }}>Encounter: </span>
                    <strong>{selectedItem.patient_name}</strong> — {selectedItem.procedure_name}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem' }}>
                    <span style={{ color: '#34d399' }}>Expected Allowed: ${selectedItem.expected_allowed_amount.toFixed(2)}</span>
                    <span style={{ color: '#f43f5e' }}>Short-Paid Variance: -${selectedItem.variance_amount.toFixed(2)}</span>
                  </div>
                </div>

                {/* Specific form fields */}
                {modalMode === 'confirm' && (
                  <div className="underpayment-form-field">
                    <label className="underpayment-form-label">Contract Audit Notes</label>
                    <textarea
                      className="underpayment-form-textarea"
                      rows={3}
                      placeholder="Document verified fee schedule section, contract amendment date, or implant invoice pricing..."
                      value={modalNotes}
                      onChange={(e) => setModalNotes(e.target.value)}
                    />
                  </div>
                )}

                {modalMode === 'dispute' && (
                  <>
                    <div className="underpayment-form-field">
                      <label className="underpayment-form-label">Dispute Tracking Reference Number</label>
                      <input
                        type="text"
                        className="underpayment-form-input"
                        value={disputeRef}
                        onChange={(e) => setDisputeRef(e.target.value)}
                        required
                      />
                    </div>
                    <div className="underpayment-form-field">
                      <label className="underpayment-form-label">Payer Dispute Submission Notes</label>
                      <textarea
                        className="underpayment-form-textarea"
                        rows={3}
                        placeholder="Document transmission method (portal, fax, certified mail), payer dispute form ID, or contract exhibit attachments..."
                        value={modalNotes}
                        onChange={(e) => setModalNotes(e.target.value)}
                      />
                    </div>
                  </>
                )}

                {modalMode === 'recover' && (
                  <>
                    <div className="underpayment-form-field">
                      <label className="underpayment-form-label">Recovered Supplemental Payment Amount ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="underpayment-form-input"
                        value={recoveryAmount}
                        onChange={(e) => setRecoveryAmount(e.target.value)}
                        required
                      />
                    </div>
                    <div className="underpayment-form-field">
                      <label className="underpayment-form-label">Remittance / Supplemental ERA Reference</label>
                      <textarea
                        className="underpayment-form-textarea"
                        rows={3}
                        placeholder="Enter supplemental 835 ERA check/EFT number, posting batch ID, or settlement notes..."
                        value={modalNotes}
                        onChange={(e) => setModalNotes(e.target.value)}
                      />
                    </div>
                  </>
                )}

                {modalMode === 'dismiss' && (
                  <>
                    <div className="underpayment-form-field">
                      <label className="underpayment-form-label">Dismissal Justification</label>
                      <select
                        className="underpayment-form-select"
                        value={dismissReason}
                        onChange={(e) => setDismissReason(e.target.value)}
                      >
                        <option value="CONTRACTUAL_AMENDMENT">Contractual Policy Amendment Limits Reimbursement</option>
                        <option value="BILATERAL_RATE_CAP">Bilateral Rate Cap Specified in Health Plan Exhibit</option>
                        <option value="IMPLANT_INVOICE_MISSING">Facility Failed to Submit Invoice Within 30-Day Window</option>
                        <option value="COB_PRIMARY_APPLIED">Primary Payer Payment Exceeded Contract Allowable</option>
                        <option value="VALID_TIMELY_FILING_REDUCTION">Late Submission Penalty Applied Per Agreement</option>
                      </select>
                    </div>
                    <div className="underpayment-form-field">
                      <label className="underpayment-form-label">Clinical / Billing Audit Justification</label>
                      <textarea
                        className="underpayment-form-textarea"
                        rows={3}
                        placeholder="Explain contract clause or legal rationale why underpayment cannot be disputed..."
                        value={modalNotes}
                        onChange={(e) => setModalNotes(e.target.value)}
                        required
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="underpayment-modal-footer">
                <button
                  type="button"
                  className="btn-secondary-underpayment"
                  onClick={handleCloseModal}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary-underpayment"
                >
                  {modalMode === 'confirm' && 'Confirm & Queue for Dispute'}
                  {modalMode === 'dispute' && 'Record Dispute Transmission'}
                  {modalMode === 'recover' && 'Record Recovery Cash'}
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

