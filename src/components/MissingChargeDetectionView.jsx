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
  PlusCircle,
  Edit3,
  Stethoscope,
  Sparkles
} from 'lucide-react';
import missingChargeService, {
  CHARGE_CATEGORIES,
  MISSING_CHARGE_STATUSES,
  EVIDENCE_SOURCES,
  getMissingChargeSummaryMetrics,
  getCategoryBreakdown,
  calculateEstimatedNetRecovery
} from '../lib/missingChargeService';
import './MissingChargeDetectionView.css';

export default function MissingChargeDetectionView() {
  const [activeTab, setActiveTab] = useState('worklist'); // 'worklist' | 'categories' | 'evidence' | 'scorecards'
  const [charges, setCharges] = useState(() => missingChargeService.getCharges());

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal State
  const [selectedCharge, setSelectedCharge] = useState(null);
  const [modalMode, setModalMode] = useState('confirm'); // 'confirm' | 'amend' | 'dismiss'
  const [modalNotes, setModalNotes] = useState('');
  const [adjustedAmount, setAdjustedAmount] = useState('');
  const [replacementCCN, setReplacementCCN] = useState('');
  const [dismissReason, setDismissReason] = useState('CMS_PACKAGED');
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  // Filtered charges
  const filteredCharges = useMemo(() => {
    return charges.filter(c => {
      const matchCat = categoryFilter === 'ALL' || c.charge_category === categoryFilter;
      const matchStat = statusFilter === 'ALL' || c.status === statusFilter;
      const q = searchTerm.toLowerCase();
      const matchSearch = !searchTerm ||
        c.charge_alert_number.toLowerCase().includes(q) ||
        c.patient_name.toLowerCase().includes(q) ||
        c.surgeon_name.toLowerCase().includes(q) ||
        c.item_code.toLowerCase().includes(q) ||
        c.item_description.toLowerCase().includes(q) ||
        c.procedure_name.toLowerCase().includes(q);

      return matchCat && matchStat && matchSearch;
    });
  }, [charges, categoryFilter, statusFilter, searchTerm]);

  // Executive Metrics
  const summaryMetrics = useMemo(() => {
    return getMissingChargeSummaryMetrics(charges);
  }, [charges]);

  // Category Breakdown
  const categoryBreakdown = useMemo(() => {
    return getCategoryBreakdown(charges);
  }, [charges]);

  // Surgeon Scorecards
  const surgeonScorecards = useMemo(() => {
    const sMap = {};
    charges.forEach(c => {
      const name = c.surgeon_name || 'Unassigned';
      if (!sMap[name]) {
        sMap[name] = {
          name,
          specialty: c.specialty,
          count: 0,
          totalLostCharges: 0.00,
          estimatedNetRecovery: 0.00,
          highValueCount: 0
        };
      }
      const lost = Number(c.estimated_lost_charge) || 0.00;
      const net = calculateEstimatedNetRecovery(lost, c.expected_reimbursement_rate);
      sMap[name].count += 1;
      sMap[name].totalLostCharges += lost;
      sMap[name].estimatedNetRecovery += net;
      if (lost >= 1500) {
        sMap[name].highValueCount += 1;
      }
    });

    return Object.values(sMap).sort((a, b) => b.estimatedNetRecovery - a.estimatedNetRecovery);
  }, [charges]);

  // Actions
  const handleOpenModal = (charge, mode) => {
    setSelectedCharge(charge);
    setModalMode(mode);
    setModalNotes('');
    setAdjustedAmount(charge.estimated_lost_charge);
    setReplacementCCN(`CCN-837-${Math.floor(1000 + Math.random() * 9000)}`);
    setDismissReason('CMS_PACKAGED');
  };

  const handleCloseModal = () => {
    setSelectedCharge(null);
  };

  const handleModalSubmit = (e) => {
    e.preventDefault();
    if (!selectedCharge) return;

    try {
      if (modalMode === 'confirm') {
        missingChargeService.confirmCharge(selectedCharge.id, {
          adjustedAmount: adjustedAmount ? parseFloat(adjustedAmount) : selectedCharge.estimated_lost_charge,
          notes: modalNotes
        });
        showToast(`Charge Alert ${selectedCharge.charge_alert_number} confirmed for rebilling.`);
      } else if (modalMode === 'amend') {
        missingChargeService.amendClaim(selectedCharge.id, {
          replacementClaimControlNumber: replacementCCN,
          notes: modalNotes
        });
        showToast(`Replacement claim generated for ${selectedCharge.charge_alert_number} [${replacementCCN}].`);
      } else if (modalMode === 'dismiss') {
        missingChargeService.dismissCharge(selectedCharge.id, {
          reason: dismissReason,
          notes: modalNotes
        });
        showToast(`Alert ${selectedCharge.charge_alert_number} dismissed (${dismissReason}).`);
      }

      setCharges(missingChargeService.getCharges());
      handleCloseModal();
    } catch (err) {
      alert(`Action error: ${err.message}`);
    }
  };

  const handleRefresh = () => {
    setCharges(missingChargeService.getCharges());
    showToast('Cross-system missing charge audit scan completed. Data synchronized.');
  };

  const handleExport = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(charges, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `missing_charges_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Missing charge audit report exported successfully.');
  };

  return (
    <div className="missing-charge-container">
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
      <div className="missing-charge-topbar">
        <div className="missing-charge-title-section">
          <div className="missing-charge-badge-group">
            <span className="phase-pill-missing-charge">Phase 92 • RCM AUDIT</span>
            <span className="facility-pill-missing-charge">ASC Main Facility</span>
          </div>
          <h1 className="missing-charge-heading">Missing Charge Detection Engine</h1>
          <p className="missing-charge-subheading">
            Algorithmic operative note, implant log, and MAR cross-audits to capture unbilled surgical revenue.
          </p>
        </div>
        <div className="missing-charge-topbar-actions">
          <button
            type="button"
            className="btn-secondary-missing-charge"
            onClick={handleExport}
            title="Export full missing charge audit dataset"
          >
            <Download size={15} />
            <span>Export Charge Alerts</span>
          </button>
          <button
            type="button"
            className="btn-primary-missing-charge"
            onClick={handleRefresh}
            title="Trigger automated clinical documentation scan"
          >
            <RefreshCw size={15} />
            <span>Run Charge Scan</span>
          </button>
        </div>
      </div>

      {/* KPI Ribbon */}
      <div className="missing-charge-kpi-ribbon">
        <div className="missing-charge-kpi-card kpi-amber">
          <div className="missing-charge-kpi-header">
            <span>Missing Charge Alerts</span>
            <AlertTriangle size={16} className="text-amber-400" />
          </div>
          <div className="missing-charge-kpi-value">{summaryMetrics.totalAlerts}</div>
          <div className="missing-charge-kpi-subtext">Active algorithmic triggers</div>
        </div>

        <div className="missing-charge-kpi-card kpi-rose">
          <div className="missing-charge-kpi-header">
            <span>Potential Lost Charges</span>
            <DollarSign size={16} className="text-rose-400" />
          </div>
          <div className="missing-charge-kpi-value">
            ${summaryMetrics.totalLostCharges.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="missing-charge-kpi-subtext">Gross omitted billed fees</div>
        </div>

        <div className="missing-charge-kpi-card kpi-emerald">
          <div className="missing-charge-kpi-header">
            <span>Est. Net Recoverable Cash</span>
            <Activity size={16} className="text-emerald-400" />
          </div>
          <div className="missing-charge-kpi-value">
            ${summaryMetrics.estimatedNetRecovery.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="missing-charge-kpi-subtext">Contracted allowable yield</div>
        </div>

        <div className="missing-charge-kpi-card kpi-sky">
          <div className="missing-charge-kpi-header">
            <span>Confirmed Pipeline</span>
            <CheckCircle2 size={16} className="text-sky-400" />
          </div>
          <div className="missing-charge-kpi-value">
            ${summaryMetrics.confirmedPipeline.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="missing-charge-kpi-subtext">Clinically verified & ready</div>
        </div>

        <div className="missing-charge-kpi-card kpi-teal">
          <div className="missing-charge-kpi-header">
            <span>Realized Amended Recovery</span>
            <ShieldAlert size={16} className="text-teal-400" />
          </div>
          <div className="missing-charge-kpi-value">
            ${summaryMetrics.realizedAmendedRecovery.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="missing-charge-kpi-subtext">Transmitted replacement 837s</div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="missing-charge-tabs">
        <button
          type="button"
          className={`missing-charge-tab-btn ${activeTab === 'worklist' ? 'active' : ''}`}
          onClick={() => setActiveTab('worklist')}
        >
          <FileText size={15} />
          <span>Audit Worklist</span>
          <span className="missing-charge-tab-badge">{filteredCharges.length}</span>
        </button>

        <button
          type="button"
          className={`missing-charge-tab-btn ${activeTab === 'categories' ? 'active' : ''}`}
          onClick={() => setActiveTab('categories')}
        >
          <Layers size={15} />
          <span>Charge Categories</span>
          <span className="missing-charge-tab-badge">6</span>
        </button>

        <button
          type="button"
          className={`missing-charge-tab-btn ${activeTab === 'evidence' ? 'active' : ''}`}
          onClick={() => setActiveTab('evidence')}
        >
          <Sparkles size={15} />
          <span>Clinical Evidence Cross-Check</span>
        </button>

        <button
          type="button"
          className={`missing-charge-tab-btn ${activeTab === 'scorecards' ? 'active' : ''}`}
          onClick={() => setActiveTab('scorecards')}
        >
          <Stethoscope size={15} />
          <span>Surgeon Charge Scorecard</span>
        </button>
      </div>

      {/* Main Tab Canvas */}
      <div className="missing-charge-tab-canvas">
        {/* WORKLIST TAB */}
        {activeTab === 'worklist' && (
          <>
            {/* Filter Toolbar */}
            <div className="missing-charge-filter-toolbar">
              <div className="missing-charge-search-box">
                <Search size={15} className="text-slate-400" />
                <input
                  type="text"
                  placeholder="Search alert #, patient, surgeon, CPT/HCPCS code..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="missing-charge-filter-group">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Filter size={13} className="text-slate-400" />
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Category:</span>
                </div>
                <select
                  className="missing-charge-filter-select"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="ALL">All Categories ({charges.length})</option>
                  {Object.keys(CHARGE_CATEGORIES).map(k => (
                    <option key={k} value={k}>{CHARGE_CATEGORIES[k].label}</option>
                  ))}
                </select>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Status:</span>
                </div>
                <select
                  className="missing-charge-filter-select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="ALL">All Statuses</option>
                  {Object.keys(MISSING_CHARGE_STATUSES).map(k => (
                    <option key={k} value={k}>{MISSING_CHARGE_STATUSES[k].label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="missing-charge-table-responsive">
              <table className="missing-charge-clinical-table">
                <thead>
                  <tr>
                    <th>Priority</th>
                    <th>Alert #</th>
                    <th>Category</th>
                    <th>Omitted Item</th>
                    <th>Patient / DOS</th>
                    <th>Surgeon / Procedure</th>
                    <th>Lost Charge</th>
                    <th>Est. Net</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCharges.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                        No missing charge alerts match the current filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredCharges.map(c => {
                      const catInfo = CHARGE_CATEGORIES[c.charge_category] || { label: c.charge_category, colorToken: 'slate' };
                      const statInfo = MISSING_CHARGE_STATUSES[c.status] || { label: c.status, colorToken: 'slate' };
                      
                      let priClass = 'priority-low-missing-charge';
                      if (c.priority_score >= 70) priClass = 'priority-high-missing-charge';
                      else if (c.priority_score >= 40) priClass = 'priority-med-missing-charge';

                      return (
                        <tr key={c.id}>
                          <td>
                            <span className={`missing-charge-priority-pill ${priClass}`}>
                              {c.priority_score.toFixed(1)}
                            </span>
                          </td>
                          <td style={{ fontWeight: 600, color: '#f8fafc' }}>
                            {c.charge_alert_number}
                          </td>
                          <td>
                            <span style={{
                              fontSize: '0.725rem',
                              fontWeight: 600,
                              padding: '0.2rem 0.5rem',
                              borderRadius: '0.35rem',
                              backgroundColor: '#1e293b',
                              color: '#cbd5e1',
                              border: '1px solid #334155'
                            }}>
                              {catInfo.label}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                              <span style={{ fontWeight: 700, color: '#38bdf8' }}>{c.item_code}</span>
                              <span style={{ fontSize: '0.75rem', color: '#94a3b8', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.item_description}>
                                {c.item_description}
                              </span>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                              <span style={{ fontWeight: 600 }}>{c.patient_name}</span>
                              <span style={{ fontSize: '0.725rem', color: '#64748b' }}>DOS: {c.date_of_service}</span>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                              <span style={{ fontWeight: 600 }}>{c.surgeon_name}</span>
                              <span style={{ fontSize: '0.725rem', color: '#94a3b8' }}>{c.procedure_name}</span>
                            </div>
                          </td>
                          <td style={{ fontWeight: 600, color: '#f43f5e' }}>
                            ${c.estimated_lost_charge.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ fontWeight: 700, color: '#10b981' }}>
                            ${c.estimated_net_recovery.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                              {c.status !== 'CLAIM_AMENDED' && c.status !== 'DISMISSED_NOT_BILLABLE' && (
                                <>
                                  <button
                                    type="button"
                                    className="btn-missing-charge-action"
                                    onClick={() => handleOpenModal(c, 'confirm')}
                                    title="Confirm missing charge and verify for rebill"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-missing-charge-action"
                                    onClick={() => handleOpenModal(c, 'amend')}
                                    title="Create replacement 837 claim (frequency code 7)"
                                    style={{ borderColor: '#0ea5e9', color: '#38bdf8' }}
                                  >
                                    Amend
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-missing-charge-action"
                                    onClick={() => handleOpenModal(c, 'dismiss')}
                                    title="Dismiss as non-billable or bundled"
                                    style={{ color: '#94a3b8' }}
                                  >
                                    Dismiss
                                  </button>
                                </>
                              )}
                              {(c.status === 'CLAIM_AMENDED' || c.status === 'DISMISSED_NOT_BILLABLE') && (
                                <button
                                  type="button"
                                  className="btn-missing-charge-action"
                                  onClick={() => handleOpenModal(c, 'confirm')}
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

        {/* CATEGORIES TAB */}
        {activeTab === 'categories' && (
          <div className="charge-category-grid">
            {categoryBreakdown.map(cat => {
              const info = CHARGE_CATEGORIES[cat.id];
              return (
                <div key={cat.id} className="charge-category-card">
                  <div className="charge-category-card-header">
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
                  <h3 className="charge-category-title">{cat.label}</h3>
                  <p style={{ fontSize: '0.775rem', color: '#94a3b8', margin: 0, minHeight: '36px' }}>
                    {info ? info.description : ''}
                  </p>
                  <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Omitted Gross</div>
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: '#f43f5e' }}>
                        ${cat.totalLostCharges.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Est. Net Cash</div>
                      <div className="charge-category-metric">
                        ${cat.estimatedNetRecovery.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* EVIDENCE TAB */}
        {activeTab === 'evidence' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff', margin: 0 }}>
                Intraoperative Documentation Cross-Audits
              </h2>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                Reconciling Dictations, Nursing Sheets & MAR Pharmacy Records
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1rem' }}>
              {charges.map(c => (
                <div
                  key={c.id}
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
                      <span style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.9rem' }}>
                        {c.charge_alert_number}
                      </span>
                      <span style={{
                        fontSize: '0.7rem',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '0.25rem',
                        backgroundColor: '#1e293b',
                        color: '#38bdf8'
                      }}>
                        {c.item_code}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>
                      {c.detection_confidence}% Algorithm Match
                    </span>
                  </div>

                  <div style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                    <strong>Encounter:</strong> {c.patient_name} • {c.procedure_name} ({c.date_of_service})
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                      Evidence Source: {EVIDENCE_SOURCES[c.clinical_evidence_source] || c.clinical_evidence_source}
                    </span>
                    <div className="evidence-box">
                      "{c.evidence_text}"
                    </div>
                  </div>

                  {c.resolution_notes && (
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic', borderTop: '1px solid #1e293b', paddingTop: '0.5rem' }}>
                      <strong>Audit Trail:</strong> {c.resolution_notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SCORECARDS TAB */}
        {activeTab === 'scorecards' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff', margin: 0 }}>
                Surgeon Charge Accuracy & Omission Scorecard
              </h2>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                Documentation and charge-capture variance by surgical provider
              </span>
            </div>

            <div className="missing-charge-table-responsive">
              <table className="missing-charge-clinical-table">
                <thead>
                  <tr>
                    <th>Surgeon Name</th>
                    <th>Specialty</th>
                    <th>Missing Charge Alerts</th>
                    <th>High-Value Items (≥$1,500)</th>
                    <th>Total Omitted Charges</th>
                    <th>Est. Net Recoverable Cash</th>
                    <th>CDI Status</th>
                  </tr>
                </thead>
                <tbody>
                  {surgeonScorecards.map(s => (
                    <tr key={s.name}>
                      <td style={{ fontWeight: 700, color: '#ffffff' }}>{s.name}</td>
                      <td>
                        <span style={{
                          fontSize: '0.725rem',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '0.35rem',
                          backgroundColor: '#1e293b',
                          color: '#cbd5e1'
                        }}>
                          {s.specialty}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{s.count} alerts</td>
                      <td>
                        {s.highValueCount > 0 ? (
                          <span style={{ color: '#f43f5e', fontWeight: 700 }}>
                            {s.highValueCount} high-cost
                          </span>
                        ) : (
                          <span style={{ color: '#64748b' }}>None</span>
                        )}
                      </td>
                      <td style={{ color: '#f43f5e', fontWeight: 600 }}>
                        ${s.totalLostCharges.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ color: '#10b981', fontWeight: 700 }}>
                        ${s.estimatedNetRecovery.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td>
                        <span style={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          padding: '0.2rem 0.5rem',
                          borderRadius: '9999px',
                          backgroundColor: s.count >= 2 ? 'rgba(244, 63, 94, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                          color: s.count >= 2 ? '#f43f5e' : '#34d399',
                          border: '1px solid ' + (s.count >= 2 ? 'rgba(244, 63, 94, 0.4)' : 'rgba(16, 185, 129, 0.4)')
                        }}>
                          {s.count >= 2 ? 'Target for CDI Education' : 'Low Omission Rate'}
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
      {selectedCharge && (
        <div className="missing-charge-modal-overlay">
          <div className="missing-charge-modal-card">
            <div className="missing-charge-modal-header">
              <h3 className="missing-charge-modal-title">
                {modalMode === 'confirm' && `Confirm Missing Charge: ${selectedCharge.charge_alert_number}`}
                {modalMode === 'amend' && `Amend Claim: ${selectedCharge.charge_alert_number}`}
                {modalMode === 'dismiss' && `Dismiss Charge Alert: ${selectedCharge.charge_alert_number}`}
              </h3>
              <button
                type="button"
                className="missing-charge-modal-close-btn"
                onClick={handleCloseModal}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleModalSubmit}>
              <div className="missing-charge-modal-body">
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
                    <span style={{ color: '#94a3b8' }}>Patient: <strong>{selectedCharge.patient_name}</strong></span>
                    <span style={{ color: '#94a3b8' }}>DOS: <strong>{selectedCharge.date_of_service}</strong></span>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8' }}>Omitted Item: </span>
                    <strong style={{ color: '#38bdf8' }}>{selectedCharge.item_code}</strong> - {selectedCharge.item_description}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem' }}>
                    <span style={{ color: '#f43f5e' }}>Omitted Fee: ${selectedCharge.estimated_lost_charge.toFixed(2)}</span>
                    <span style={{ color: '#10b981' }}>Est. Net: ${selectedCharge.estimated_net_recovery.toFixed(2)}</span>
                  </div>
                </div>

                {/* Specific form fields */}
                {modalMode === 'confirm' && (
                  <>
                    <div className="missing-charge-form-field">
                      <label className="missing-charge-form-label">Verified Charge Amount ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="missing-charge-form-input"
                        value={adjustedAmount}
                        onChange={(e) => setAdjustedAmount(e.target.value)}
                        required
                      />
                    </div>
                    <div className="missing-charge-form-field">
                      <label className="missing-charge-form-label">Coding / Clinical Audit Notes</label>
                      <textarea
                        className="missing-charge-form-textarea"
                        rows={3}
                        placeholder="Document verified operative note snippet, modifier logic (e.g. modifier -59), or supply serial #..."
                        value={modalNotes}
                        onChange={(e) => setModalNotes(e.target.value)}
                      />
                    </div>
                  </>
                )}

                {modalMode === 'amend' && (
                  <>
                    <div className="missing-charge-form-field">
                      <label className="missing-charge-form-label">Replacement Claim Control Number (CCN)</label>
                      <input
                        type="text"
                        className="missing-charge-form-input"
                        value={replacementCCN}
                        onChange={(e) => setReplacementCCN(e.target.value)}
                        required
                      />
                    </div>
                    <div className="missing-charge-form-field">
                      <label className="missing-charge-form-label">Transmission / Clearinghouse Notes</label>
                      <textarea
                        className="missing-charge-form-textarea"
                        rows={3}
                        placeholder="EDI 837 claim submission details or payer contact reference..."
                        value={modalNotes}
                        onChange={(e) => setModalNotes(e.target.value)}
                      />
                    </div>
                  </>
                )}

                {modalMode === 'dismiss' && (
                  <>
                    <div className="missing-charge-form-field">
                      <label className="missing-charge-form-label">Dismissal Reason</label>
                      <select
                        className="missing-charge-form-select"
                        value={dismissReason}
                        onChange={(e) => setDismissReason(e.target.value)}
                      >
                        <option value="CMS_PACKAGED">Bundled / CMS Packaged Under Composite OPPS</option>
                        <option value="COMMERCIAL_CONTRACT_INCLUSIVE">Inclusive Under Commercial Carve-Out Floor</option>
                        <option value="NON_BILLABLE_SUPPLY">Standard Routine Floor Supply (Non-Chargeable)</option>
                        <option value="DOCUMENTATION_INSUFFICIENT">Operative Note Lacks Compelling Clinical Specificity</option>
                        <option value="ALREADY_BILLED_PREVIOUSLY">Charge Appended on Prior Claim Iteration</option>
                      </select>
                    </div>
                    <div className="missing-charge-form-field">
                      <label className="missing-charge-form-label">Clinical Audit Justification</label>
                      <textarea
                        className="missing-charge-form-textarea"
                        rows={3}
                        placeholder="Explain payer policy or rationale why charge cannot be appended..."
                        value={modalNotes}
                        onChange={(e) => setModalNotes(e.target.value)}
                        required
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="missing-charge-modal-footer">
                <button
                  type="button"
                  className="btn-secondary-missing-charge"
                  onClick={handleCloseModal}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary-missing-charge"
                >
                  {modalMode === 'confirm' && 'Confirm & Queue for Rebill'}
                  {modalMode === 'amend' && 'Record Replacement Claim'}
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
