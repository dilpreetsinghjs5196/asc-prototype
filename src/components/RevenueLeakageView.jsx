import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  DollarSign,
  TrendingUp,
  Search,
  Filter,
  FileText,
  RefreshCw,
  Download,
  X,
  CheckCircle2,
  ArrowRight,
  Clock,
  ShieldAlert,
  Layers,
  Send,
  UserCheck
} from 'lucide-react';
import revenueLeakageService, {
  LEAKAGE_CATEGORIES,
  OPPORTUNITY_STATUSES,
  calculateExpectedRecovery,
  calculateRecoveryYield,
  calculateOpportunityPriority,
  getLeakageSummaryMetrics,
  getSurgeonScorecards
} from '../lib/revenueLeakageService';
import './RevenueLeakageView.css';

export default function RevenueLeakageView() {
  const [activeTab, setActiveTab] = useState('pipeline'); // 'pipeline' | 'rules' | 'scorecard' | 'lifecycle'
  const [opportunities, setOpportunities] = useState(() => revenueLeakageService.getOpportunities());
  const [rules, setRules] = useState(() => revenueLeakageService.getRules());

  // Search & Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal State
  const [selectedOpp, setSelectedOpp] = useState(null);
  const [modalMode, setModalMode] = useState('validate'); // 'validate' | 'rebill' | 'recover' | 'dismiss'
  const [actionNotes, setActionNotes] = useState('');
  const [adjustedPotential, setAdjustedPotential] = useState('');
  const [adjustedProbability, setAdjustedProbability] = useState('');
  const [claimControlNumber, setClaimControlNumber] = useState('');
  const [realizedCashInput, setRealizedCashInput] = useState('');

  // Derived Filtered List
  const filteredOpportunities = useMemo(() => {
    return opportunities.filter(opp => {
      const matchCat = categoryFilter === 'ALL' || opp.category === categoryFilter;
      const matchStatus = statusFilter === 'ALL' || opp.status === statusFilter;
      const q = searchTerm.toLowerCase();
      const matchSearch = !searchTerm ||
        opp.opportunity_number.toLowerCase().includes(q) ||
        opp.patient_name.toLowerCase().includes(q) ||
        opp.procedure_name.toLowerCase().includes(q) ||
        opp.surgeon_name.toLowerCase().includes(q);
      return matchCat && matchStatus && matchSearch;
    });
  }, [opportunities, categoryFilter, statusFilter, searchTerm]);

  // Executive Metrics
  const summaryMetrics = useMemo(() => {
    return getLeakageSummaryMetrics(opportunities);
  }, [opportunities]);

  // Surgeon Scorecards
  const surgeonScorecards = useMemo(() => {
    return getSurgeonScorecards(opportunities);
  }, [opportunities]);

  // Refresh data handler
  const handleRefresh = () => {
    setOpportunities([...revenueLeakageService.getOpportunities()]);
    setRules([...revenueLeakageService.getRules()]);
  };

  // Open Action Modal
  const openActionModal = (opp, mode = 'validate') => {
    setSelectedOpp(opp);
    setModalMode(mode);
    setActionNotes('');
    setAdjustedPotential(opp.potential_recovery_amount.toString());
    setAdjustedProbability(opp.recovery_probability.toString());
    setClaimControlNumber('');
    setRealizedCashInput(opp.potential_recovery_amount.toString());
  };

  const closeModal = () => {
    setSelectedOpp(null);
  };

  // Execute Modal Action
  const handleExecuteAction = (e) => {
    e.preventDefault();
    if (!selectedOpp) return;

    try {
      if (modalMode === 'validate') {
        revenueLeakageService.validateOpportunity(selectedOpp.id, {
          adjustedPotential: parseFloat(adjustedPotential),
          probability: parseFloat(adjustedProbability),
          notes: actionNotes
        });
      } else if (modalMode === 'rebill') {
        revenueLeakageService.submitRebill(selectedOpp.id, {
          rebillType: '837I_FREQ_7',
          claimControlNumber: claimControlNumber || 'CCN-' + Math.floor(100000 + Math.random() * 900000),
          notes: actionNotes
        });
      } else if (modalMode === 'recover') {
        revenueLeakageService.markRecovered(selectedOpp.id, {
          realizedAmount: parseFloat(realizedCashInput) || selectedOpp.potential_recovery_amount,
          notes: actionNotes
        });
      } else if (modalMode === 'dismiss') {
        revenueLeakageService.dismissOpportunity(selectedOpp.id, {
          reason: 'VALID_ADJUSTMENT',
          notes: actionNotes
        });
      }

      setOpportunities([...revenueLeakageService.getOpportunities()]);
      closeModal();
    } catch (err) {
      alert(`Action failed: ${err.message}`);
    }
  };

  // Toggle Rule Active
  const handleToggleRule = (ruleId) => {
    revenueLeakageService.toggleRuleActive(ruleId);
    setRules([...revenueLeakageService.getRules()]);
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['Opportunity Number', 'Category', 'Patient', 'Surgeon', 'Procedure', 'Status', 'Potential Amount', 'Probability %', 'Expected Amount', 'Realized Cash', 'Deadline'];
    const rows = filteredOpportunities.map(o => [
      o.opportunity_number,
      o.category,
      o.patient_name,
      o.surgeon_name,
      `"${o.procedure_name}"`,
      o.status,
      o.potential_recovery_amount,
      o.recovery_probability,
      calculateExpectedRecovery(o.potential_recovery_amount, o.recovery_probability),
      o.realized_recovered_amount,
      o.filing_deadline || 'N/A'
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `revenue_leakage_audit_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="revenue-leakage-container" style={{ backgroundColor: '#0b1120' }}>
      {/* 1. Executive Topbar */}
      <div className="revenue-leakage-topbar">
        <div className="revenue-leakage-title-section">
          <div className="revenue-leakage-badge-group">
            <span className="phase-pill">Phase 90 • RCM</span>
            <span className="facility-pill">Facility Tenancy Active</span>
          </div>
          <h1 className="revenue-leakage-heading" style={{ color: '#ffffff', fontWeight: 700 }}>
            Master Revenue Leakage Engine
          </h1>
          <p className="revenue-leakage-subheading">
            Algorithmic unbilled detection, implant carve-outs, modifier omission audits, and recovery pipeline
          </p>
        </div>

        <div className="revenue-leakage-topbar-actions">
          <button className="btn-secondary" onClick={handleExportCSV}>
            <Download size={15} />
            Export Audit Ledger
          </button>
          <button className="btn-primary" onClick={handleRefresh}>
            <RefreshCw size={15} />
            Run Leakage Audit Scan
          </button>
        </div>
      </div>

      {/* 2. Executive KPI Ribbon */}
      <div className="revenue-leakage-kpi-ribbon">
        <div className="kpi-card kpi-rose">
          <div className="kpi-header">
            <span>Total Detected Leakage</span>
            <AlertTriangle size={16} className="text-rose-400" />
          </div>
          <div className="kpi-value">${summaryMetrics.totalDetectedLeakage.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          <div className="kpi-subtext">{summaryMetrics.totalCases} identified case opportunities</div>
        </div>

        <div className="kpi-card kpi-amber">
          <div className="kpi-header">
            <span>Validated Recovery Pipeline</span>
            <ShieldAlert size={16} className="text-amber-400" />
          </div>
          <div className="kpi-value">${summaryMetrics.validatedPipeline.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          <div className="kpi-subtext">Probability-weighted expected cash</div>
        </div>

        <div className="kpi-card kpi-emerald">
          <div className="kpi-header">
            <span>Realized Recovered Cash</span>
            <DollarSign size={16} className="text-emerald-400" />
          </div>
          <div className="kpi-value">${summaryMetrics.realizedRecovered.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          <div className="kpi-subtext">Remittance posted & balanced</div>
        </div>

        <div className="kpi-card kpi-sky">
          <div className="kpi-header">
            <span>Active Rebill Submissions</span>
            <Send size={16} className="text-sky-400" />
          </div>
          <div className="kpi-value">${summaryMetrics.activeRebills.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          <div className="kpi-subtext">Corrected 837 claims in adjudication</div>
        </div>

        <div className="kpi-card kpi-teal">
          <div className="kpi-header">
            <span>Recovery Yield Rate</span>
            <TrendingUp size={16} className="text-teal-400" />
          </div>
          <div className="kpi-value">{summaryMetrics.recoveryYieldPct}%</div>
          <div className="kpi-subtext">Realized vs. total potential</div>
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <div className="revenue-leakage-tabs">
        <button
          className={`tab-btn ${activeTab === 'pipeline' ? 'active' : ''}`}
          onClick={() => setActiveTab('pipeline')}
        >
          <Layers size={16} />
          Opportunities Pipeline Matrix
          <span className="tab-badge">{filteredOpportunities.length}</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'rules' ? 'active' : ''}`}
          onClick={() => setActiveTab('rules')}
        >
          <ShieldAlert size={16} />
          Leakage Rule Catalog
          <span className="tab-badge">{rules.length}</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'scorecard' ? 'active' : ''}`}
          onClick={() => setActiveTab('scorecard')}
        >
          <UserCheck size={16} />
          Surgeon & Specialty Scorecards
          <span className="tab-badge">{surgeonScorecards.length}</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'lifecycle' ? 'active' : ''}`}
          onClick={() => setActiveTab('lifecycle')}
        >
          <Clock size={16} />
          Recovery Lifecycle & Rebill Tracker
        </button>
      </div>

      {/* 4. Tab Canvases */}

      {/* TAB 1: OPPORTUNITIES PIPELINE MATRIX */}
      {activeTab === 'pipeline' && (
        <div className="tab-canvas">
          {/* Filter Toolbar */}
          <div className="filter-toolbar">
            <div className="search-box">
              <Search size={16} className="text-slate-400" />
              <input
                type="text"
                placeholder="Search patient, CPT, surgeon, opp #..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="filter-group">
              <Filter size={15} className="text-slate-400" />
              <select
                className="filter-select"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="ALL">All Risk Categories</option>
                {Object.values(LEAKAGE_CATEGORIES).map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.label}</option>
                ))}
              </select>

              <select
                className="filter-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">All Lifecycle Statuses</option>
                {Object.values(OPPORTUNITY_STATUSES).map(st => (
                  <option key={st.id} value={st.id}>{st.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Data Table */}
          <div className="table-responsive">
            <table className="clinical-data-table">
              <thead>
                <tr>
                  <th>Priority</th>
                  <th>Opp #</th>
                  <th>Risk Category</th>
                  <th>Patient & Procedure</th>
                  <th>Surgeon & Specialty</th>
                  <th>Potential ($)</th>
                  <th>Prob %</th>
                  <th>Expected ($)</th>
                  <th>Status</th>
                  <th>Filing Deadline</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOpportunities.length === 0 ? (
                  <tr>
                    <td colSpan="11" style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                      No revenue leakage opportunities match the selected criteria.
                    </td>
                  </tr>
                ) : (
                  filteredOpportunities.map(opp => {
                    const catMeta = LEAKAGE_CATEGORIES[opp.category] || {};
                    const statusMeta = OPPORTUNITY_STATUSES[opp.status] || {};
                    const exp = calculateExpectedRecovery(opp.potential_recovery_amount, opp.recovery_probability);
                    const priorityClass = opp.priority_score >= 80 ? 'priority-high' : opp.priority_score >= 60 ? 'priority-med' : 'priority-low';

                    return (
                      <tr key={opp.id}>
                        <td>
                          <span className={`priority-pill ${priorityClass}`}>
                            {opp.priority_score.toFixed(1)}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600, color: '#38bdf8' }}>
                          {opp.opportunity_number}
                        </td>
                        <td>
                          <span className={`status-pill ${catMeta.badgeClass}`}>
                            {catMeta.label}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: '#ffffff' }}>{opp.patient_name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{opp.procedure_name}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: '#f8fafc' }}>{opp.surgeon_name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{opp.specialty}</div>
                        </td>
                        <td style={{ fontWeight: 700, color: '#ffffff' }}>
                          ${opp.potential_recovery_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ color: '#cbd5e1' }}>
                          {opp.recovery_probability}%
                        </td>
                        <td style={{ fontWeight: 700, color: '#38bdf8' }}>
                          ${exp.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td>
                          <span className={`status-pill ${statusMeta.badgeClass}`}>
                            {statusMeta.label}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.75rem', color: opp.status === 'UNDER_REVIEW' && opp.filing_deadline && opp.filing_deadline < '2026-12-01' ? '#f43f5e' : '#94a3b8' }}>
                          {opp.filing_deadline || 'N/A'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.35rem' }}>
                            {opp.status === 'DETECTED' || opp.status === 'UNDER_REVIEW' ? (
                              <button
                                className="btn-action-small"
                                onClick={() => openActionModal(opp, 'validate')}
                              >
                                Validate
                              </button>
                            ) : null}

                            {opp.status === 'VALIDATED_OPPORTUNITY' ? (
                              <button
                                className="btn-action-small"
                                style={{ backgroundColor: '#0284c7', color: '#ffffff', borderColor: '#38bdf8' }}
                                onClick={() => openActionModal(opp, 'rebill')}
                              >
                                Rebill
                              </button>
                            ) : null}

                            {opp.status === 'REBILL_SUBMITTED' ? (
                              <button
                                className="btn-action-small"
                                style={{ backgroundColor: '#065f46', color: '#34d399', borderColor: '#059669' }}
                                onClick={() => openActionModal(opp, 'recover')}
                              >
                                Settle
                              </button>
                            ) : null}

                            {opp.status !== 'RECOVERED' && opp.status !== 'DISMISSED_VALID_ADJ' ? (
                              <button
                                className="btn-action-small"
                                style={{ color: '#94a3b8' }}
                                onClick={() => openActionModal(opp, 'dismiss')}
                              >
                                Dismiss
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

      {/* TAB 2: LEAKAGE RULE CATALOG */}
      {activeTab === 'rules' && (
        <div className="tab-canvas">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff', margin: 0 }}>
              Master Revenue Leakage Detection Rules
            </h2>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              6 Authoritative Surgical ASC Auditing Rules
            </span>
          </div>

          <div className="rules-grid">
            {rules.map(rule => {
              const catMeta = LEAKAGE_CATEGORIES[rule.category] || {};
              const sevClass = rule.severity === 'CRITICAL' ? 'priority-high' : rule.severity === 'HIGH' ? 'priority-med' : 'priority-low';

              return (
                <div key={rule.id} className="rule-card">
                  <div className="rule-card-header">
                    <span className="rule-code-badge">{rule.rule_code}</span>
                    <span className={`priority-pill ${sevClass}`}>{rule.severity}</span>
                  </div>

                  <h3 className="rule-title">{rule.title}</h3>
                  <p className="rule-description">{rule.description}</p>

                  <div className="rule-logic-box">
                    <span>{rule.detection_logic}</span>
                  </div>

                  <div className="rule-meta-bar">
                    <span>Threshold: ${rule.threshold_amount.toFixed(2)}</span>
                    <span>Default Prob: {rule.default_recovery_probability}%</span>
                    <button
                      className="btn-action-small"
                      style={{
                        backgroundColor: rule.is_active ? '#065f46' : '#1e293b',
                        color: rule.is_active ? '#34d399' : '#64748b',
                        borderColor: rule.is_active ? '#059669' : '#334155'
                      }}
                      onClick={() => handleToggleRule(rule.id)}
                    >
                      {rule.is_active ? 'Active' : 'Disabled'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: SURGEON & SPECIALTY SCORECARDS */}
      {activeTab === 'scorecard' && (
        <div className="tab-canvas">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff', margin: 0 }}>
              Surgeon Leakage & Clinical Documentation Scorecards
            </h2>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              Root-Cause Variance by Surgeon & Procedure
            </span>
          </div>

          <div className="scorecard-summary-ribbon">
            {surgeonScorecards.map(sc => (
              <div key={sc.surgeon_name} className="scorecard-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="scorecard-surgeon-name">{sc.surgeon_name}</div>
                  <span className="facility-pill">{sc.specialty}</span>
                </div>

                <div className="scorecard-metrics-row">
                  <span>Total Opportunities Flagged:</span>
                  <span style={{ fontWeight: 700, color: '#ffffff' }}>{sc.total_opportunities} cases</span>
                </div>

                <div className="scorecard-metrics-row">
                  <span>Potential Revenue Leakage:</span>
                  <span style={{ fontWeight: 700, color: '#f43f5e' }}>
                    ${sc.total_potential_leakage.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="scorecard-metrics-row">
                  <span>Realized Recovered Cash:</span>
                  <span style={{ fontWeight: 700, color: '#10b981' }}>
                    ${sc.total_realized_recovery.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div style={{ borderTop: '1px solid #1e293b', paddingTop: '0.5rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {sc.unbilled_implant_cases > 0 && (
                    <span className="status-pill bg-rose-950/40 text-rose-300 border-rose-800">
                      {sc.unbilled_implant_cases} Implants Missed
                    </span>
                  )}
                  {sc.unbilled_procedure_cases > 0 && (
                    <span className="status-pill bg-amber-950/40 text-amber-300 border-amber-800">
                      {sc.unbilled_procedure_cases} Secondary CPT
                    </span>
                  )}
                  {sc.modifier_omission_cases > 0 && (
                    <span className="status-pill bg-sky-950/40 text-sky-300 border-sky-800">
                      {sc.modifier_omission_cases} Modifiers
                    </span>
                  )}
                  {sc.doc_deficiency_cases > 0 && (
                    <span className="status-pill bg-slate-800 text-slate-300 border-slate-700">
                      {sc.doc_deficiency_cases} Missing Dictation
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: RECOVERY LIFECYCLE & REBILL TRACKER */}
      {activeTab === 'lifecycle' && (
        <div className="tab-canvas">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff', margin: 0 }}>
              End-to-End Recovery Lifecycle State Machine
            </h2>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              Deterministic 7-State Transition Model
            </span>
          </div>

          <div className="lifecycle-tracker-steps">
            <div className="lifecycle-step active">
              <span className="step-number">Stage 1</span>
              <span className="step-label">Detected</span>
              <span className="step-count">
                {opportunities.filter(o => o.status === 'DETECTED').length}
              </span>
            </div>

            <div className="lifecycle-step active">
              <span className="step-number">Stage 2</span>
              <span className="step-label">Under Audit</span>
              <span className="step-count">
                {opportunities.filter(o => o.status === 'UNDER_REVIEW').length}
              </span>
            </div>

            <div className="lifecycle-step active">
              <span className="step-number">Stage 3</span>
              <span className="step-label">Validated</span>
              <span className="step-count">
                {opportunities.filter(o => o.status === 'VALIDATED_OPPORTUNITY').length}
              </span>
            </div>

            <div className="lifecycle-step active">
              <span className="step-number">Stage 4</span>
              <span className="step-label">Rebill Sent</span>
              <span className="step-count">
                {opportunities.filter(o => o.status === 'REBILL_SUBMITTED').length}
              </span>
            </div>

            <div className="lifecycle-step active" style={{ borderColor: '#10b981' }}>
              <span className="step-number" style={{ color: '#10b981' }}>Stage 5</span>
              <span className="step-label">Recovered</span>
              <span className="step-count" style={{ color: '#10b981' }}>
                {opportunities.filter(o => o.status === 'RECOVERED').length}
              </span>
            </div>

            <div className="lifecycle-step">
              <span className="step-number" style={{ color: '#64748b' }}>Exit A</span>
              <span className="step-label">Dismissed</span>
              <span className="step-count" style={{ color: '#94a3b8' }}>
                {opportunities.filter(o => o.status === 'DISMISSED_VALID_ADJ').length}
              </span>
            </div>

            <div className="lifecycle-step">
              <span className="step-number" style={{ color: '#f43f5e' }}>Exit B</span>
              <span className="step-label">Expired</span>
              <span className="step-count" style={{ color: '#f43f5e' }}>
                {opportunities.filter(o => o.status === 'EXPIRED_TIMELY_FILING').length}
              </span>
            </div>
          </div>

          <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#0b1120', borderRadius: '0.5rem', border: '1px solid #1e293b' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f8fafc', marginBottom: '0.5rem' }}>
              Audit Trail & Operational Notes
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {opportunities.map(opp => (
                <div key={opp.id} style={{ fontSize: '0.8rem', color: '#94a3b8', borderBottom: '1px solid #1e293b', paddingBottom: '0.5rem' }}>
                  <span style={{ color: '#38bdf8', fontWeight: 600 }}>{opp.opportunity_number}</span> ({opp.patient_name} - {opp.surgeon_name}):{' '}
                  <span style={{ color: '#e2e8f0' }}>{opp.action_notes || 'Detected by automated rules; pending review.'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 5. Action Modal */}
      {selectedOpp && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {modalMode === 'validate' && `Validate Opportunity: ${selectedOpp.opportunity_number}`}
                {modalMode === 'rebill' && `Submit Rebill: ${selectedOpp.opportunity_number}`}
                {modalMode === 'recover' && `Record Cash Recovery: ${selectedOpp.opportunity_number}`}
                {modalMode === 'dismiss' && `Dismiss Opportunity: ${selectedOpp.opportunity_number}`}
              </h3>
              <button className="modal-close-btn" onClick={closeModal}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleExecuteAction}>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', backgroundColor: '#0b1120', padding: '0.75rem', borderRadius: '0.4rem', border: '1px solid #1e293b' }}>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: '#64748b' }}>PATIENT</span>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ffffff' }}>{selectedOpp.patient_name}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: '#64748b' }}>PROCEDURE</span>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ffffff' }}>{selectedOpp.procedure_name}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: '#64748b' }}>SURGEON</span>
                    <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>{selectedOpp.surgeon_name}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: '#64748b' }}>PAYER</span>
                    <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>{selectedOpp.payer_name}</div>
                  </div>
                </div>

                {modalMode === 'validate' && (
                  <>
                    <div className="form-field">
                      <label className="form-label">Adjusted Potential Recovery ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="form-input"
                        value={adjustedPotential}
                        onChange={(e) => setAdjustedPotential(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Recovery Probability (%)</label>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        max="100"
                        className="form-input"
                        value={adjustedProbability}
                        onChange={(e) => setAdjustedProbability(e.target.value)}
                        required
                      />
                    </div>
                  </>
                )}

                {modalMode === 'rebill' && (
                  <div className="form-field">
                    <label className="form-label">Replacement Claim Control Number (CCN)</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. CCN-984210"
                      value={claimControlNumber}
                      onChange={(e) => setClaimControlNumber(e.target.value)}
                    />
                  </div>
                )}

                {modalMode === 'recover' && (
                  <div className="form-field">
                    <label className="form-label">Realized Cash Recovered ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input"
                      value={realizedCashInput}
                      onChange={(e) => setRealizedCashInput(e.target.value)}
                      required
                    />
                  </div>
                )}

                <div className="form-field">
                  <label className="form-label">Action Rationale & Operational Notes</label>
                  <textarea
                    rows="3"
                    className="form-textarea"
                    placeholder="Enter clinical audit findings, invoice confirmation, or justification..."
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {modalMode === 'validate' && 'Confirm Opportunity Validation'}
                  {modalMode === 'rebill' && 'Submit Rebill to Payer'}
                  {modalMode === 'recover' && 'Record Cash Settlement'}
                  {modalMode === 'dismiss' && 'Confirm Non-Recovery Dismissal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

