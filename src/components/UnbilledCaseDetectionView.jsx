import React, { useState, useMemo } from 'react';
import {
  Clock,
  AlertTriangle,
  DollarSign,
  Search,
  Filter,
  CheckCircle2,
  Send,
  FileText,
  RefreshCw,
  Download,
  X,
  ShieldAlert,
  Layers,
  Activity,
  FileCheck,
  UserCheck
} from 'lucide-react';
import unbilledCaseService, {
  HOLD_REASONS,
  UNBILLED_STATUSES,
  TIMELY_FILING_RISK_TIERS,
  getUnbilledSummaryMetrics,
  getAgingBucketSummary,
  getHoldReasonBreakdown
} from '../lib/unbilledCaseService';
import './UnbilledCaseDetectionView.css';

export default function UnbilledCaseDetectionView() {
  const [activeTab, setActiveTab] = useState('worklist'); // 'worklist' | 'aging' | 'diagnostics' | 'scorecard'
  const [cases, setCases] = useState(() => unbilledCaseService.getCases());

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [holdFilter, setHoldFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [riskFilter, setRiskFilter] = useState('ALL');

  // Modal State
  const [selectedCase, setSelectedCase] = useState(null);
  const [modalMode, setModalMode] = useState('resolve'); // 'resolve' | 'release' | 'writeoff'
  const [actionNotes, setActionNotes] = useState('');
  const [resolutionReason, setResolutionReason] = useState('READY_TO_RELEASE');
  const [claimControlNumber, setClaimControlNumber] = useState('');
  const [writeOffJustification, setWriteOffJustification] = useState('EXPIRED_TFL');

  // Derived filtered case list
  const filteredCases = useMemo(() => {
    return cases.filter(c => {
      const matchHold = holdFilter === 'ALL' || c.hold_reason === holdFilter;
      const matchStatus = statusFilter === 'ALL' || c.unbilled_status === statusFilter;
      const matchRisk = riskFilter === 'ALL' || c.timely_filing_risk_tier === riskFilter;
      const q = searchTerm.toLowerCase();
      const matchSearch = !searchTerm ||
        c.case_number.toLowerCase().includes(q) ||
        c.patient_name.toLowerCase().includes(q) ||
        c.surgeon_name.toLowerCase().includes(q) ||
        c.procedure_name.toLowerCase().includes(q) ||
        c.primary_cpt.toLowerCase().includes(q);

      return matchHold && matchStatus && matchRisk && matchSearch;
    });
  }, [cases, holdFilter, statusFilter, riskFilter, searchTerm]);

  // Executive Metrics
  const summaryMetrics = useMemo(() => {
    return getUnbilledSummaryMetrics(cases);
  }, [cases]);

  // Aging Bucket Summary
  const agingBuckets = useMemo(() => {
    return getAgingBucketSummary(cases);
  }, [cases]);

  // Hold Reason Diagnostics
  const holdBreakdown = useMemo(() => {
    return getHoldReasonBreakdown(cases);
  }, [cases]);

  // Surgeon Scorecards
  const surgeonScorecards = useMemo(() => {
    const sMap = {};
    cases.forEach(c => {
      if (c.unbilled_status === 'CLAIM_RELEASED' || c.unbilled_status === 'WRITTEN_OFF_TIMELY_FILING') return;
      const name = c.surgeon_name || 'Unassigned';
      if (!sMap[name]) {
        sMap[name] = {
          name,
          specialty: c.specialty,
          count: 0,
          totalCharges: 0.00,
          expectedRevenue: 0.00,
          criticalCount: 0
        };
      }
      sMap[name].count += 1;
      sMap[name].totalCharges += Number(c.total_charges) || 0.00;
      sMap[name].expectedRevenue += Number(c.expected_reimbursement) || 0.00;
      if (c.timely_filing_risk_tier === 'CRITICAL' || c.timely_filing_risk_tier === 'URGENT') {
        sMap[name].criticalCount += 1;
      }
    });

    return Object.values(sMap).sort((a, b) => b.expectedRevenue - a.expectedRevenue);
  }, [cases]);

  // Refresh data handler
  const handleRefresh = () => {
    setCases([...unbilledCaseService.getCases()]);
  };

  // Open Modal
  const openModal = (c, mode = 'resolve') => {
    setSelectedCase(c);
    setModalMode(mode);
    setActionNotes('');
    setResolutionReason('READY_TO_RELEASE');
    setClaimControlNumber('');
    setWriteOffJustification('EXPIRED_TFL');
  };

  const closeModal = () => {
    setSelectedCase(null);
  };

  // Execute Action
  const handleExecuteAction = (e) => {
    e.preventDefault();
    if (!selectedCase) return;

    try {
      if (modalMode === 'resolve') {
        unbilledCaseService.resolveHold(selectedCase.id, {
          resolutionReason,
          notes: actionNotes
        });
      } else if (modalMode === 'release') {
        unbilledCaseService.releaseClaim(selectedCase.id, {
          claimControlNumber: claimControlNumber || 'CCN-837-' + Math.floor(100000 + Math.random() * 900000),
          notes: actionNotes
        });
      } else if (modalMode === 'writeoff') {
        unbilledCaseService.writeOffExpired(selectedCase.id, {
          justification: writeOffJustification,
          notes: actionNotes
        });
      }

      setCases([...unbilledCaseService.getCases()]);
      closeModal();
    } catch (err) {
      alert(`Action failed: ${err.message}`);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['Case Number', 'Patient Name', 'Surgeon', 'Specialty', 'Procedure', 'Primary CPT', 'Payer', 'DOS', 'Days Unbilled', 'Hold Reason', 'Status', 'Charges', 'Expected Revenue', 'Filing Deadline', 'Risk Tier', 'Priority Score'];
    const rows = filteredCases.map(c => [
      c.case_number,
      c.patient_name,
      c.surgeon_name,
      c.specialty,
      `"${c.procedure_name}"`,
      c.primary_cpt,
      c.payer_name,
      c.date_of_service,
      c.days_unbilled,
      c.hold_reason,
      c.unbilled_status,
      c.total_charges,
      c.expected_reimbursement,
      c.filing_deadline,
      c.timely_filing_risk_tier,
      c.priority_score
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `unbilled_cases_audit_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="unbilled-case-container" style={{ backgroundColor: '#0b1120' }}>
      {/* 1. Executive Topbar */}
      <div className="unbilled-case-topbar">
        <div className="unbilled-case-title-section">
          <div className="unbilled-case-badge-group">
            <span className="phase-pill-unbilled">Phase 91 • RCM</span>
            <span className="facility-pill-unbilled">Facility Tenancy Active</span>
          </div>
          <h1 className="unbilled-case-heading" style={{ color: '#ffffff', fontWeight: 700 }}>
            Unbilled Case Detection Engine
          </h1>
          <p className="unbilled-case-subheading">
            Completed/coded surgical encounter audit, hold diagnosis, aging buckets, and timely filing risk mitigation
          </p>
        </div>

        <div className="unbilled-case-topbar-actions">
          <button className="btn-secondary-unbilled" onClick={handleExportCSV}>
            <Download size={15} />
            Export Unbilled Backlog
          </button>
          <button className="btn-primary-unbilled" onClick={handleRefresh}>
            <RefreshCw size={15} />
            Run Detection Audit
          </button>
        </div>
      </div>

      {/* 2. Executive KPI Ribbon */}
      <div className="unbilled-case-kpi-ribbon">
        <div className="unbilled-kpi-card kpi-rose">
          <div className="unbilled-kpi-header">
            <span>Total Unbilled Encounters</span>
            <Clock size={16} className="text-rose-400" />
          </div>
          <div className="unbilled-kpi-value">{summaryMetrics.totalCases} cases</div>
          <div className="unbilled-kpi-subtext">Completed OR surgeries unreleased</div>
        </div>

        <div className="unbilled-kpi-card kpi-amber">
          <div className="unbilled-kpi-header">
            <span>Unbilled Gross Charges</span>
            <AlertTriangle size={16} className="text-amber-400" />
          </div>
          <div className="unbilled-kpi-value">
            ${summaryMetrics.totalGrossCharges.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="unbilled-kpi-subtext">Total unreleased fee schedule charges</div>
        </div>

        <div className="unbilled-kpi-card kpi-emerald">
          <div className="unbilled-kpi-header">
            <span>Expected Collectible Cash</span>
            <DollarSign size={16} className="text-emerald-400" />
          </div>
          <div className="unbilled-kpi-value">
            ${summaryMetrics.totalExpectedRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="unbilled-kpi-subtext">Contractually expected net allowable</div>
        </div>

        <div className="unbilled-kpi-card kpi-rose">
          <div className="unbilled-kpi-header">
            <span>Critical Timely Filing Risk</span>
            <ShieldAlert size={16} className="text-rose-400" />
          </div>
          <div className="unbilled-kpi-value" style={{ color: '#f43f5e' }}>
            ${summaryMetrics.criticalExposureDollars.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="unbilled-kpi-subtext">Expiring within 30 days</div>
        </div>

        <div className="unbilled-kpi-card kpi-sky">
          <div className="unbilled-kpi-header">
            <span>Average Days Unbilled</span>
            <Activity size={16} className="text-sky-400" />
          </div>
          <div className="unbilled-kpi-value">{summaryMetrics.avgDaysUnbilled} days</div>
          <div className="unbilled-kpi-subtext">From surgery encounter to today</div>
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <div className="unbilled-case-tabs">
        <button
          className={`unbilled-tab-btn ${activeTab === 'worklist' ? 'active' : ''}`}
          onClick={() => setActiveTab('worklist')}
        >
          <Layers size={16} />
          Active Unbilled Worklist
          <span className="unbilled-tab-badge">{filteredCases.length}</span>
        </button>

        <button
          className={`unbilled-tab-btn ${activeTab === 'aging' ? 'active' : ''}`}
          onClick={() => setActiveTab('aging')}
        >
          <Clock size={16} />
          Aging Buckets & Timely Filing
          <span className="unbilled-tab-badge">4 Buckets</span>
        </button>

        <button
          className={`unbilled-tab-btn ${activeTab === 'diagnostics' ? 'active' : ''}`}
          onClick={() => setActiveTab('diagnostics')}
        >
          <AlertTriangle size={16} />
          Hold Reason Diagnostics
        </button>

        <button
          className={`unbilled-tab-btn ${activeTab === 'scorecard' ? 'active' : ''}`}
          onClick={() => setActiveTab('scorecard')}
        >
          <UserCheck size={16} />
          Surgeon Hold Scorecards
          <span className="unbilled-tab-badge">{surgeonScorecards.length}</span>
        </button>
      </div>

      {/* 4. Tab Canvases */}

      {/* TAB 1: ACTIVE UNBILLED WORKLIST */}
      {activeTab === 'worklist' && (
        <div className="unbilled-tab-canvas">
          {/* Filter Bar */}
          <div className="unbilled-filter-toolbar">
            <div className="unbilled-search-box">
              <Search size={16} className="text-slate-400" />
              <input
                type="text"
                placeholder="Search patient, CPT, surgeon, case #..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="unbilled-filter-group">
              <Filter size={15} className="text-slate-400" />
              <select
                className="unbilled-filter-select"
                value={holdFilter}
                onChange={(e) => setHoldFilter(e.target.value)}
              >
                <option value="ALL">All Hold Reasons</option>
                {Object.values(HOLD_REASONS).map(h => (
                  <option key={h.id} value={h.id}>{h.label}</option>
                ))}
              </select>

              <select
                className="unbilled-filter-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">All Lifecycle Statuses</option>
                {Object.values(UNBILLED_STATUSES).map(s => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>

              <select
                className="unbilled-filter-select"
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value)}
              >
                <option value="ALL">All Risk Tiers</option>
                {Object.values(TIMELY_FILING_RISK_TIERS).map(r => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="unbilled-table-responsive">
            <table className="unbilled-clinical-table">
              <thead>
                <tr>
                  <th>Priority</th>
                  <th>Case #</th>
                  <th>Days Unbilled</th>
                  <th>Hold Reason</th>
                  <th>Patient & Procedure</th>
                  <th>Surgeon & Specialty</th>
                  <th>Charges ($)</th>
                  <th>Expected ($)</th>
                  <th>Status</th>
                  <th>Filing Deadline</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCases.length === 0 ? (
                  <tr>
                    <td colSpan="11" style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                      No unbilled surgical cases match the selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredCases.map(c => {
                    const holdMeta = HOLD_REASONS[c.hold_reason] || {};
                    const statusMeta = UNBILLED_STATUSES[c.unbilled_status] || {};
                    const riskMeta = TIMELY_FILING_RISK_TIERS[c.timely_filing_risk_tier] || {};
                    const priorityClass = c.priority_score >= 80 ? 'priority-high-unbilled' : c.priority_score >= 60 ? 'priority-med-unbilled' : 'priority-low-unbilled';

                    return (
                      <tr key={c.id}>
                        <td>
                          <span className={`unbilled-priority-pill ${priorityClass}`}>
                            {c.priority_score.toFixed(1)}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600, color: '#38bdf8' }}>
                          {c.case_number}
                        </td>
                        <td>
                          <span style={{ fontWeight: 700, color: c.days_unbilled >= 60 ? '#f43f5e' : c.days_unbilled >= 30 ? '#f59e0b' : '#e2e8f0' }}>
                            {c.days_unbilled}d
                          </span>
                        </td>
                        <td>
                          <span className={`unbilled-status-pill ${holdMeta.badgeClass}`}>
                            {holdMeta.label}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: '#ffffff' }}>{c.patient_name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            {c.procedure_name} (CPT {c.primary_cpt})
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: '#f8fafc' }}>{c.surgeon_name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{c.specialty}</div>
                        </td>
                        <td style={{ fontWeight: 700, color: '#ffffff' }}>
                          ${c.total_charges.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ fontWeight: 700, color: '#10b981' }}>
                          ${c.expected_reimbursement.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td>
                          <span className={`unbilled-status-pill ${statusMeta.badgeClass}`}>
                            {statusMeta.label}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontSize: '0.8rem', color: c.days_remaining <= 30 ? '#f43f5e' : '#cbd5e1' }}>
                            {c.filing_deadline}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: c.days_remaining <= 15 ? '#f43f5e' : '#94a3b8' }}>
                            {c.days_remaining}d remaining ({riskMeta.label})
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.35rem' }}>
                            {c.unbilled_status === 'HELD' || c.unbilled_status === 'UNDER_INVESTIGATION' ? (
                              <button
                                className="btn-unbilled-action"
                                onClick={() => openModal(c, 'resolve')}
                              >
                                Resolve Hold
                              </button>
                            ) : null}

                            {c.unbilled_status === 'HOLD_RESOLVED' ? (
                              <button
                                className="btn-unbilled-action"
                                style={{ backgroundColor: '#0284c7', color: '#ffffff', borderColor: '#38bdf8' }}
                                onClick={() => openModal(c, 'release')}
                              >
                                Release
                              </button>
                            ) : null}

                            {c.unbilled_status !== 'CLAIM_RELEASED' && c.unbilled_status !== 'WRITTEN_OFF_TIMELY_FILING' ? (
                              <button
                                className="btn-unbilled-action"
                                style={{ color: '#94a3b8' }}
                                onClick={() => openModal(c, 'writeoff')}
                              >
                                Write-Off
                              </button>
                            ) : null}
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

      {/* TAB 2: AGING BUCKETS & TIMELY FILING */}
      {activeTab === 'aging' && (
        <div className="unbilled-tab-canvas">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff', margin: 0 }}>
              Unbilled Aging Schedule & Timely Filing Distribution
            </h2>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              Stratified by Days Elapsed from Surgery
            </span>
          </div>

          <div className="aging-bucket-grid">
            {agingBuckets.map(b => (
              <div key={b.key} className="aging-bucket-card">
                <div className="aging-bucket-card-header">
                  <h3 className="aging-bucket-title">{b.label}</h3>
                  <span className="unbilled-tab-badge">{b.count} cases</span>
                </div>

                <div className="aging-bucket-metric">
                  ${b.expectedRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Gross Charges: ${b.grossCharges.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>

                {b.criticalCount > 0 && (
                  <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#f43f5e', fontSize: '0.75rem', fontWeight: 600 }}>
                    <ShieldAlert size={14} />
                    {b.criticalCount} cases at critical timely filing risk
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: HOLD REASON DIAGNOSTICS */}
      {activeTab === 'diagnostics' && (
        <div className="unbilled-tab-canvas">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff', margin: 0 }}>
              Root-Cause Hold Reason Breakdown
            </h2>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              Where Unbilled Dollars are Blocked
            </span>
          </div>

          <div className="hold-reason-grid">
            {holdBreakdown.map(h => (
              <div key={h.id} className="hold-reason-card">
                <div className="hold-reason-header">
                  <span style={{ fontWeight: 600, color: '#ffffff' }}>{h.label}</span>
                  <span className="unbilled-tab-badge">{h.count} cases</span>
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#38bdf8' }}>
                  ${h.expectedRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  {HOLD_REASONS[h.id]?.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: SURGEON HOLD SCORECARD */}
      {activeTab === 'scorecard' && (
        <div className="unbilled-tab-canvas">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff', margin: 0 }}>
              Surgeon Unbilled Documentation & Hold Scorecards
            </h2>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              Attributing Unreleased Revenue by Operating Surgeon
            </span>
          </div>

          <div className="aging-bucket-grid">
            {surgeonScorecards.map(s => (
              <div key={s.name} className="aging-bucket-card">
                <div className="aging-bucket-card-header">
                  <h3 className="aging-bucket-title">{s.name}</h3>
                  <span className="facility-pill-unbilled">{s.specialty}</span>
                </div>

                <div className="aging-bucket-metric" style={{ color: '#10b981' }}>
                  ${s.expectedRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  {s.count} unbilled cases | Gross: ${s.totalCharges.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>

                {s.criticalCount > 0 && (
                  <div style={{ color: '#f43f5e', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <ShieldAlert size={14} />
                    {s.criticalCount} cases approaching payer cutoff
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Action Modal */}
      {selectedCase && (
        <div className="unbilled-modal-overlay" onClick={closeModal}>
          <div className="unbilled-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="unbilled-modal-header">
              <h3 className="unbilled-modal-title">
                {modalMode === 'resolve' && `Resolve Hold: ${selectedCase.case_number}`}
                {modalMode === 'release' && `Release Claim to Clearinghouse: ${selectedCase.case_number}`}
                {modalMode === 'writeoff' && `Authorize Timely Filing Write-Off: ${selectedCase.case_number}`}
              </h3>
              <button className="unbilled-modal-close-btn" onClick={closeModal}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleExecuteAction}>
              <div className="unbilled-modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', backgroundColor: '#0b1120', padding: '0.75rem', borderRadius: '0.4rem', border: '1px solid #1e293b' }}>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: '#64748b' }}>PATIENT</span>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ffffff' }}>{selectedCase.patient_name}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: '#64748b' }}>PROCEDURE</span>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ffffff' }}>{selectedCase.procedure_name}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: '#64748b' }}>SURGEON</span>
                    <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>{selectedCase.surgeon_name}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: '#64748b' }}>PAYER</span>
                    <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>{selectedCase.payer_name}</div>
                  </div>
                </div>

                {modalMode === 'resolve' && (
                  <div className="unbilled-form-field">
                    <label className="unbilled-form-label">Resolution Status</label>
                    <select
                      className="unbilled-form-select"
                      value={resolutionReason}
                      onChange={(e) => setResolutionReason(e.target.value)}
                    >
                      <option value="READY_TO_RELEASE">Ready to Release (Hold Cleared)</option>
                      <option value="BILLING_SCRUB_ERROR">Re-Queue for Clearinghouse Scrub</option>
                    </select>
                  </div>
                )}

                {modalMode === 'release' && (
                  <div className="unbilled-form-field">
                    <label className="unbilled-form-label">Electronic Claim Control Number (CCN)</label>
                    <input
                      type="text"
                      className="unbilled-form-input"
                      placeholder="e.g. CCN-837-992140"
                      value={claimControlNumber}
                      onChange={(e) => setClaimControlNumber(e.target.value)}
                    />
                  </div>
                )}

                {modalMode === 'writeoff' && (
                  <div className="unbilled-form-field">
                    <label className="unbilled-form-label">Write-Off Justification</label>
                    <select
                      className="unbilled-form-select"
                      value={writeOffJustification}
                      onChange={(e) => setWriteOffJustification(e.target.value)}
                    >
                      <option value="EXPIRED_TFL">Statutory Timely Filing Expired</option>
                      <option value="UNOBTAINABLE_RETRO_AUTH">Commercial Retro-Auth Denied</option>
                      <option value="PATIENT_DECEASED_NO_ESTATE">Patient Deceased / Uncollectable</option>
                    </select>
                  </div>
                )}

                <div className="unbilled-form-field">
                  <label className="unbilled-form-label">Resolution Notes & Audit Provenance</label>
                  <textarea
                    rows="3"
                    className="unbilled-form-textarea"
                    placeholder="Document supplier invoice verification, query response, or clearinghouse batch details..."
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="unbilled-modal-footer">
                <button type="button" className="btn-secondary-unbilled" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary-unbilled">
                  {modalMode === 'resolve' && 'Confirm Hold Resolution'}
                  {modalMode === 'release' && 'Release Claim to Clearinghouse'}
                  {modalMode === 'writeoff' && 'Confirm Authorized Write-Off'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

