import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  TrendingUp,
  Clock,
  DollarSign,
  CheckCircle2,
  Users,
  Scale,
  FileText,
  Layers,
  Bot,
  Download,
  RefreshCw,
  Search,
  Filter,
  ArrowUpRight,
  ShieldAlert,
  Send,
  UserCheck,
  XCircle,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import {
  denialPrioritizationService,
  PRIORITY_TIERS,
  EFFORT_LEVELS,
  QUEUE_STATUSES,
  DENIAL_CATEGORIES
} from '../lib/denialPrioritizationService';
import './DenialRecoveryPrioritizationView.css';

export default function DenialRecoveryPrioritizationView() {
  const [activeTab, setActiveTab] = useState('queue'); // 'queue', 'inspector', 'teams', 'matrix'
  const [searchTerm, setSearchTerm] = useState('');
  const [tierFilter, setTierFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [selectedFacility, setSelectedFacility] = useState('fac-surgical-01');
  const [selectedId, setSelectedId] = useState('drp-001');

  // Modals state
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [writeOffModalOpen, setWriteOffModalOpen] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [selectedSpecialist, setSelectedSpecialist] = useState('Sarah Jenkins, CPC');
  const [writeOffReason, setWriteOffReason] = useState('');
  const [supervisorName, setSupervisorName] = useState('Dr. Marcus Welby, MD (Medical Director)');

  // Refresh trigger
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch prioritized list and metrics
  const priorities = useMemo(() => {
    return denialPrioritizationService.getAllPriorities(selectedFacility, {
      tier: tierFilter,
      status: statusFilter,
      category: categoryFilter,
      search: searchTerm
    });
  }, [selectedFacility, tierFilter, statusFilter, categoryFilter, searchTerm, refreshKey]);

  const metrics = useMemo(() => {
    return denialPrioritizationService.getMetrics(selectedFacility);
  }, [selectedFacility, refreshKey]);

  const selectedDenial = useMemo(() => {
    return denialPrioritizationService.getPriorityById(selectedId) || priorities[0] || null;
  }, [selectedId, priorities]);

  const aiStrategy = useMemo(() => {
    if (!selectedDenial) return null;
    return denialPrioritizationService.generateAppealStrategySummary(selectedDenial.id);
  }, [selectedDenial]);

  // Actions
  const handleAssign = () => {
    if (!selectedDenial) return;
    denialPrioritizationService.assignDenialToSpecialist(
      selectedDenial.id,
      'usr-spec-custom',
      selectedSpecialist
    );
    setAssignModalOpen(false);
    setRefreshKey(prev => prev + 1);
  };

  const handleStartAppeal = (id) => {
    try {
      denialPrioritizationService.startAppeal(id, 'Initiated via Prioritization Workbench');
      setRefreshKey(prev => prev + 1);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleWriteOff = () => {
    if (!selectedDenial) return;
    try {
      denialPrioritizationService.dismissDenialAsWriteOff(
        selectedDenial.id,
        'usr-sup-01',
        supervisorName,
        writeOffReason
      );
      setWriteOffModalOpen(false);
      setWriteOffReason('');
      setRefreshKey(prev => prev + 1);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'ClaimNumber',
      'Patient',
      'Payer',
      'CPT',
      'CARC',
      'DeniedAmount',
      'OverturnProbPct',
      'ExpectedRecovery',
      'DaysLeft',
      'EffortLevel',
      'YieldPerHour',
      'PriorityScore',
      'PriorityTier',
      'QueueStatus'
    ];
    const rows = priorities.map(p => [
      p.claim_number,
      `"${p.patient_name}"`,
      `"${p.payer_name}"`,
      p.cpt_code,
      p.carc_code,
      p.denied_amount,
      p.overturn_probability_pct,
      p.expected_recovery_amount,
      p.days_until_deadline,
      p.effort_level,
      p.yield_per_hour,
      p.priority_score,
      p.priority_tier,
      p.queue_status
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `denial_recovery_priorities_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="drp-container">
      {/* 1. Header Banner */}
      <div className="drp-header">
        <div>
          <div className="drp-header-title-row">
            <span className="drp-badge-phase">Phase 94</span>
            <h1 className="drp-title">Denial Recovery Prioritization & Yield Queue</h1>
          </div>
          <p className="drp-subtitle">
            Authoritative multi-factor ranking by recoverable yield, overturn probability, filing deadline urgency, and staff effort.
          </p>
        </div>

        <div className="drp-header-actions">
          <select
            className="drp-filter-select"
            value={selectedFacility}
            onChange={e => setSelectedFacility(e.target.value)}
          >
            <option value="fac-surgical-01">St. Jude Ambulatory Surgery Center</option>
            <option value="fac-surgical-02">Pacific Coast Outpatient Pavilion</option>
          </select>

          <button className="drp-btn drp-btn-secondary" onClick={() => setRefreshKey(k => k + 1)}>
            <RefreshCw size={14} /> Sync Scores
          </button>

          <button className="drp-btn drp-btn-secondary" onClick={handleExportCsv}>
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* 2. 5-Card KPI Ribbon */}
      <div className="drp-kpi-grid">
        <div className="drp-kpi-card">
          <div className="drp-kpi-header">
            <span>Active Denial Inventory</span>
            <AlertTriangle size={16} color="#0284c7" />
          </div>
          <div className="drp-kpi-value">{metrics.totalActive}</div>
          <div className="drp-kpi-subtext">Actionable surgical claim disputes</div>
        </div>

        <div className="drp-kpi-card">
          <div className="drp-kpi-header">
            <span>Total Disputed Balance</span>
            <DollarSign size={16} color="#64748b" />
          </div>
          <div className="drp-kpi-value">${metrics.totalDeniedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          <div className="drp-kpi-subtext">Gross unpaid claim charges</div>
        </div>

        <div className="drp-kpi-card">
          <div className="drp-kpi-header">
            <span>Expected Recovery Yield</span>
            <TrendingUp size={16} color="#10b981" />
          </div>
          <div className="drp-kpi-value" style={{ color: '#10b981' }}>
            ${metrics.totalExpectedRecovery.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="drp-kpi-subtext">Probabilistic recoverable net cash</div>
        </div>

        <div className="drp-kpi-card">
          <div className="drp-kpi-header">
            <span>Critical & High Pipeline</span>
            <Scale size={16} color="#f97316" />
          </div>
          <div className="drp-kpi-value" style={{ color: '#f97316' }}>
            ${metrics.criticalHighPipeline.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="drp-kpi-subtext">Top tier recovery targets</div>
        </div>

        <div className="drp-kpi-card">
          <div className="drp-kpi-header">
            <span>Average Recovery Yield / Hr</span>
            <Clock size={16} color="#38bdf8" />
          </div>
          <div className="drp-kpi-value" style={{ color: '#38bdf8' }}>
            ${metrics.avgYieldPerHour.toLocaleString(undefined, { minimumFractionDigits: 2 })}<span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>/hr</span>
          </div>
          <div className="drp-kpi-subtext">Operational recovery velocity</div>
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <div className="drp-tabs-bar">
        <button
          className={`drp-tab-btn ${activeTab === 'queue' ? 'active' : ''}`}
          onClick={() => setActiveTab('queue')}
        >
          <Layers size={16} /> Prioritized Denial Queue ({priorities.length})
        </button>
        <button
          className={`drp-tab-btn ${activeTab === 'inspector' ? 'active' : ''}`}
          onClick={() => setActiveTab('inspector')}
        >
          <Scale size={16} /> Scoring Inspector & Root Cause
        </button>
        <button
          className={`drp-tab-btn ${activeTab === 'teams' ? 'active' : ''}`}
          onClick={() => setActiveTab('teams')}
        >
          <Users size={16} /> Specialist Routing Queues
        </button>
        <button
          className={`drp-tab-btn ${activeTab === 'matrix' ? 'active' : ''}`}
          onClick={() => setActiveTab('matrix')}
        >
          <TrendingUp size={16} /> 2x2 Yield Matrix
        </button>
      </div>

      {/* 4. Tab Content */}

      {/* TAB 1: PRIORITIZED QUEUE */}
      {activeTab === 'queue' && (
        <div>
          <div className="drp-toolbar">
            <div className="drp-search-box">
              <Search size={14} color="#94a3b8" />
              <input
                type="text"
                className="drp-search-input"
                placeholder="Search claim, patient, payer, CPT, CARC..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <select
                className="drp-filter-select"
                value={tierFilter}
                onChange={e => setTierFilter(e.target.value)}
              >
                <option value="ALL">All Priority Tiers</option>
                <option value="CRITICAL_URGENT">Critical Urgent (80-100)</option>
                <option value="HIGH_PRIORITY">High Priority (65-79.99)</option>
                <option value="MEDIUM_PRIORITY">Medium Priority (45-64.99)</option>
                <option value="LOW_PRIORITY">Low Priority (25-44.99)</option>
                <option value="UNRECOVERABLE_HOLD">Unrecoverable Hold (&lt;25)</option>
              </select>

              <select
                className="drp-filter-select"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                <option value="ALL">All Queue Statuses</option>
                <option value="QUEUED">Queued for Review</option>
                <option value="ASSIGNED">Assigned to Specialist</option>
                <option value="IN_APPEAL">In Appeal Workflow</option>
                <option value="RECOVERED">Cash Recovered</option>
                <option value="DISMISSED_WRITE_OFF">Dismissed Write-Off</option>
                <option value="EXPIRED">Filing Limit Expired</option>
              </select>

              <select
                className="drp-filter-select"
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
              >
                <option value="ALL">All Routing Categories</option>
                <option value="CLINICAL_APPEALS">Clinical Appeals</option>
                <option value="BILLING_AND_CODING">Billing & Coding</option>
                <option value="PATIENT_ACCESS">Patient Access</option>
                <option value="CONTRACTING">Managed Care Contracting</option>
              </select>
            </div>
          </div>

          <div className="drp-table-card">
            <div className="drp-table-wrapper">
              <table className="drp-table">
                <thead>
                  <tr>
                    <th>Tier / Priority</th>
                    <th>Claim # / Patient</th>
                    <th>Procedure / CPT</th>
                    <th>Payer & CARC</th>
                    <th>Denied Amount</th>
                    <th>Overturn %</th>
                    <th>Exp. Recovery</th>
                    <th>Yield / Hr</th>
                    <th>Filing Limit</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {priorities.map(item => {
                    const isSelected = selectedDenial && selectedDenial.id === item.id;
                    const isExpired = item.days_until_deadline < 0;
                    return (
                      <tr
                        key={item.id}
                        className={isSelected ? 'selected' : ''}
                        onClick={() => setSelectedId(item.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <div className={`drp-tier-pill drp-tier-${item.priority_tier}`}>
                            {PRIORITY_TIERS[item.priority_tier]?.label || item.priority_tier}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                            Score: <strong>{item.priority_score.toFixed(1)}</strong>/100
                          </div>
                        </td>

                        <td>
                          <div style={{ fontWeight: 600, color: '#ffffff' }}>{item.claim_number}</div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            {item.patient_name} ({item.patient_mrn})
                          </div>
                        </td>

                        <td>
                          <div style={{ fontWeight: 600 }}>CPT {item.cpt_code}</div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8', maxWidth: '180px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.procedure_name}
                          </div>
                        </td>

                        <td>
                          <div style={{ fontWeight: 600 }}>{item.payer_name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>
                            CARC {item.carc_code} {item.rarc_code ? `(${item.rarc_code})` : ''}
                          </div>
                        </td>

                        <td style={{ fontWeight: 700, color: '#f8fafc' }}>
                          ${item.denied_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>

                        <td style={{ fontWeight: 600, color: '#38bdf8' }}>
                          {item.overturn_probability_pct.toFixed(0)}%
                        </td>

                        <td style={{ fontWeight: 700, color: '#10b981' }}>
                          ${item.expected_recovery_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>

                        <td style={{ fontWeight: 700, color: '#38bdf8' }}>
                          ${item.yield_per_hour.toLocaleString(undefined, { minimumFractionDigits: 0 })}/hr
                        </td>

                        <td>
                          {isExpired ? (
                            <span className="drp-deadline-pill drp-deadline-expired">
                              Expired ({Math.abs(item.days_until_deadline)}d ago)
                            </span>
                          ) : item.days_until_deadline <= 7 ? (
                            <span className="drp-deadline-pill drp-deadline-critical">
                              <Clock size={12} /> {item.days_until_deadline}d left (Cliff)
                            </span>
                          ) : item.days_until_deadline <= 14 ? (
                            <span className="drp-deadline-pill drp-deadline-warning">
                              <Clock size={12} /> {item.days_until_deadline}d left
                            </span>
                          ) : (
                            <span className="drp-deadline-pill drp-deadline-safe">
                              {item.days_until_deadline}d left
                            </span>
                          )}
                        </td>

                        <td>
                          <span style={{
                            display: 'inline-block',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '0.25rem',
                            fontSize: '0.725rem',
                            fontWeight: 600,
                            backgroundColor: `${QUEUE_STATUSES[item.queue_status]?.color}22`,
                            color: QUEUE_STATUSES[item.queue_status]?.color || '#cbd5e1',
                            border: `1px solid ${QUEUE_STATUSES[item.queue_status]?.color || '#475569'}`
                          }}>
                            {QUEUE_STATUSES[item.queue_status]?.label || item.queue_status}
                          </span>
                        </td>

                        <td>
                          <div style={{ display: 'flex', gap: '0.35rem' }}>
                            {!isExpired && item.queue_status !== 'IN_APPEAL' && item.queue_status !== 'RECOVERED' && (
                              <button
                                className="drp-btn drp-btn-primary"
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.725rem' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStartAppeal(item.id);
                                }}
                                title="Start formal appeal workflow"
                              >
                                <Send size={12} /> Appeal
                              </button>
                            )}

                            <button
                              className="drp-btn drp-btn-secondary"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.725rem' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedId(item.id);
                                setAssignModalOpen(true);
                              }}
                              title="Assign specialist"
                            >
                              <UserCheck size={12} />
                            </button>

                            <button
                              className="drp-btn drp-btn-secondary"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.725rem' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedId(item.id);
                                setAiModalOpen(true);
                              }}
                              title="AI Dispute Strategy"
                            >
                              <Bot size={12} color="#38bdf8" />
                            </button>

                            {item.queue_status !== 'DISMISSED_WRITE_OFF' && (
                              <button
                                className="drp-btn drp-btn-danger"
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.725rem' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedId(item.id);
                                  setWriteOffModalOpen(true);
                                }}
                                title="Dismiss as Write-Off"
                              >
                                <XCircle size={12} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SCORING INSPECTOR */}
      {activeTab === 'inspector' && selectedDenial && (
        <div className="drp-inspector-grid">
          {/* Card 1: 4-Factor Breakdown */}
          <div className="drp-card">
            <h3 className="drp-card-title">
              <Scale size={18} color="#0284c7" /> Deterministic 4-Factor Scoring Breakdown
            </h3>
            <p style={{ fontSize: '0.825rem', color: '#94a3b8', marginBottom: '1.25rem' }}>
              Claim: <strong>{selectedDenial.claim_number}</strong> | Patient: <strong>{selectedDenial.patient_name}</strong>
            </p>

            {/* Factor 1: Value Score */}
            <div className="drp-subscore-bar-group">
              <div className="drp-subscore-meta">
                <span>Value Score (Weight: 35%)</span>
                <strong>{selectedDenial.value_score.toFixed(1)} / 100.0</strong>
              </div>
              <div className="drp-progress-track">
                <div
                  className="drp-progress-fill"
                  style={{ width: `${selectedDenial.value_score}%`, backgroundColor: '#0284c7' }}
                />
              </div>
              <div style={{ fontSize: '0.725rem', color: '#64748b', marginTop: '0.25rem' }}>
                Normalized against facility benchmark ($5,000.00). Denied amount: ${selectedDenial.denied_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>

            {/* Factor 2: Probability Score */}
            <div className="drp-subscore-bar-group">
              <div className="drp-subscore-meta">
                <span>Probability Score (Weight: 30%)</span>
                <strong>{selectedDenial.probability_score.toFixed(1)} / 100.0</strong>
              </div>
              <div className="drp-progress-track">
                <div
                  className="drp-progress-fill"
                  style={{ width: `${selectedDenial.probability_score}%`, backgroundColor: '#10b981' }}
                />
              </div>
              <div style={{ fontSize: '0.725rem', color: '#64748b', marginTop: '0.25rem' }}>
                Historical overturn likelihood based on CARC {selectedDenial.carc_code} and payer adjudication history.
              </div>
            </div>

            {/* Factor 3: Urgency Score */}
            <div className="drp-subscore-bar-group">
              <div className="drp-subscore-meta">
                <span>Urgency Score (Weight: 20%)</span>
                <strong>{selectedDenial.urgency_score.toFixed(1)} / 100.0</strong>
              </div>
              <div className="drp-progress-track">
                <div
                  className="drp-progress-fill"
                  style={{
                    width: `${selectedDenial.urgency_score}%`,
                    backgroundColor: selectedDenial.days_until_deadline <= 7 ? '#ef4444' : '#f59e0b'
                  }}
                />
              </div>
              <div style={{ fontSize: '0.725rem', color: '#64748b', marginTop: '0.25rem' }}>
                {selectedDenial.days_until_deadline < 0
                  ? 'Expired filing limit: Urgency forced to 0.00 points.'
                  : `${selectedDenial.days_until_deadline} calendar days remaining until timely filing deadline.`}
              </div>
            </div>

            {/* Factor 4: Effort Score */}
            <div className="drp-subscore-bar-group">
              <div className="drp-subscore-meta">
                <span>Administrative Effort Score (Weight: 15%)</span>
                <strong>{selectedDenial.effort_score.toFixed(1)} / 100.0</strong>
              </div>
              <div className="drp-progress-track">
                <div
                  className="drp-progress-fill"
                  style={{ width: `${selectedDenial.effort_score}%`, backgroundColor: '#38bdf8' }}
                />
              </div>
              <div style={{ fontSize: '0.725rem', color: '#64748b', marginTop: '0.25rem' }}>
                Friction: {EFFORT_LEVELS[selectedDenial.effort_level]?.label} (~{selectedDenial.estimated_effort_hours}h required).
              </div>
            </div>

            {/* Total Priority Score Formula Box */}
            <div style={{
              backgroundColor: '#1e293b',
              padding: '1rem',
              borderRadius: '0.375rem',
              marginTop: '1.25rem',
              border: '1px solid #334155'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Composite Priority Score</div>
                  <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#ffffff' }}>
                    {selectedDenial.priority_score.toFixed(2)} <span style={{ fontSize: '1rem', color: '#94a3b8' }}>/ 100.00</span>
                  </div>
                </div>
                <div className={`drp-tier-pill drp-tier-${selectedDenial.priority_tier}`} style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}>
                  {PRIORITY_TIERS[selectedDenial.priority_tier]?.label}
                </div>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '0.5rem', fontFamily: 'monospace' }}>
                ({selectedDenial.value_score}×0.35) + ({selectedDenial.probability_score}×0.30) + ({selectedDenial.urgency_score}×0.20) + ({selectedDenial.effort_score}×0.15)
              </div>
            </div>
          </div>

          {/* Card 2: Effort-to-Yield & CARC Disposition */}
          <div className="drp-card">
            <h3 className="drp-card-title">
              <TrendingUp size={18} color="#10b981" /> Effort-to-Yield Velocity & Root Cause
            </h3>

            {/* Yield / Hr Metric */}
            <div style={{
              backgroundColor: '#1e293b',
              padding: '1rem',
              borderRadius: '0.375rem',
              marginBottom: '1.25rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Expected Financial Velocity</div>
                <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#38bdf8' }}>
                  ${selectedDenial.yield_per_hour.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}> / staff hr</span>
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: '0.8rem', color: '#cbd5e1' }}>
                <div>Exp. Cash: <strong>${selectedDenial.expected_recovery_amount.toFixed(2)}</strong></div>
                <div>Est. Staff Time: <strong>{selectedDenial.estimated_effort_hours} hrs</strong></div>
              </div>
            </div>

            {/* CARC & RARC Breakdown */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                Claim Adjustment Reason Code (CARC)
              </div>
              <div style={{ backgroundColor: '#1e293b', padding: '0.75rem', borderRadius: '0.375rem', border: '1px solid #334155' }}>
                <span style={{ fontWeight: 700, color: '#38bdf8' }}>CARC {selectedDenial.carc_code}:</span> {selectedDenial.carc_description}
              </div>
            </div>

            {selectedDenial.rarc_code && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                  Remittance Advice Remark Code (RARC)
                </div>
                <div style={{ backgroundColor: '#1e293b', padding: '0.75rem', borderRadius: '0.375rem', border: '1px solid #334155' }}>
                  <span style={{ fontWeight: 700, color: '#f59e0b' }}>RARC {selectedDenial.rarc_code}:</span> {selectedDenial.rarc_description}
                </div>
              </div>
            )}

            {/* Team Specialization Routing */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                Automated Team Routing
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#cbd5e1', fontSize: '0.85rem' }}>
                <Users size={16} color="#0284c7" />
                <strong>{DENIAL_CATEGORIES[selectedDenial.denial_category]?.label}</strong>
                <span style={{ color: '#64748b' }}>({DENIAL_CATEGORIES[selectedDenial.denial_category]?.team})</span>
              </div>
            </div>

            {/* Actions for this denial */}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button
                className="drp-btn drp-btn-primary"
                onClick={() => setAiModalOpen(true)}
              >
                <Bot size={14} /> AI Dispute Package Drafter
              </button>
              <button
                className="drp-btn drp-btn-secondary"
                onClick={() => setAssignModalOpen(true)}
              >
                <UserCheck size={14} /> Reassign Specialist
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SPECIALIST ROUTING QUEUES */}
      {activeTab === 'teams' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          {Object.values(DENIAL_CATEGORIES).map(cat => {
            const teamItems = priorities.filter(p => p.denial_category === cat.code);
            const teamCash = teamItems.reduce((acc, c) => acc + c.expected_recovery_amount, 0);

            return (
              <div key={cat.code} className="drp-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <h4 style={{ margin: 0, color: '#ffffff', fontSize: '0.95rem' }}>{cat.label}</h4>
                  <span style={{
                    backgroundColor: '#1e293b',
                    color: '#38bdf8',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '0.25rem',
                    fontSize: '0.75rem',
                    fontWeight: 700
                  }}>
                    {teamItems.length} claims
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.75rem' }}>
                  {cat.team}
                </div>

                <div style={{
                  backgroundColor: '#1e293b',
                  padding: '0.75rem',
                  borderRadius: '0.375rem',
                  marginBottom: '1rem'
                }}>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>Expected Recovery</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#10b981' }}>
                    ${teamCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                  {teamItems.slice(0, 4).map(item => (
                    <div
                      key={item.id}
                      onClick={() => { setSelectedId(item.id); setActiveTab('inspector'); }}
                      style={{
                        padding: '0.5rem',
                        borderBottom: '1px solid #1e293b',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.8rem'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, color: '#ffffff' }}>{item.claim_number}</div>
                        <div style={{ color: '#94a3b8', fontSize: '0.725rem' }}>{item.patient_name} (CPT {item.cpt_code})</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 600, color: '#38bdf8' }}>${item.yield_per_hour}/hr</div>
                        <div style={{ fontSize: '0.725rem', color: item.days_until_deadline <= 7 ? '#ef4444' : '#cbd5e1' }}>
                          {item.days_until_deadline}d left
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 4: 2x2 QUADRANT MATRIX */}
      {activeTab === 'matrix' && (
        <div>
          <div className="drp-quadrant-grid">
            {/* Quadrant 1: High Yield + High Urgency */}
            <div className="drp-quadrant-card" style={{ borderLeft: '4px solid #ef4444' }}>
              <div className="drp-quadrant-title" style={{ color: '#ef4444' }}>
                <span>QUADRANT 1: IMMEDIATE ACTION (Cliff &amp; High Yield)</span>
                <span>🔥 High Urgency / High Yield</span>
              </div>
              <p style={{ fontSize: '0.775rem', color: '#94a3b8' }}>
                Filing deadline imminent (&le; 14 days) and expected recovery &gt; $1,000/hr. Highest cash recovery priority.
              </p>
              {priorities
                .filter(p => p.days_until_deadline <= 14 && p.days_until_deadline >= 0 && p.yield_per_hour >= 1000)
                .map(p => (
                  <div key={p.id} style={{ padding: '0.4rem 0', borderBottom: '1px solid #1e293b', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span><strong>{p.claim_number}</strong> ({p.patient_name})</span>
                    <span style={{ color: '#ef4444', fontWeight: 700 }}>${p.yield_per_hour}/hr | {p.days_until_deadline}d left</span>
                  </div>
                ))}
            </div>

            {/* Quadrant 2: High Yield + Low Urgency */}
            <div className="drp-quadrant-card" style={{ borderLeft: '4px solid #0284c7' }}>
              <div className="drp-quadrant-title" style={{ color: '#38bdf8' }}>
                <span>QUADRANT 2: STRATEGIC RECOVERY</span>
                <span>💎 Low Urgency / High Yield</span>
              </div>
              <p style={{ fontSize: '0.775rem', color: '#94a3b8' }}>
                Comfortable filing window (&gt; 14 days) but substantial dollar value. Scheduled for comprehensive clinical dossier prep.
              </p>
              {priorities
                .filter(p => p.days_until_deadline > 14 && p.yield_per_hour >= 1000)
                .map(p => (
                  <div key={p.id} style={{ padding: '0.4rem 0', borderBottom: '1px solid #1e293b', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span><strong>{p.claim_number}</strong> ({p.patient_name})</span>
                    <span style={{ color: '#38bdf8', fontWeight: 700 }}>${p.yield_per_hour}/hr | {p.days_until_deadline}d left</span>
                  </div>
                ))}
            </div>

            {/* Quadrant 3: Low Yield + High Urgency */}
            <div className="drp-quadrant-card" style={{ borderLeft: '4px solid #f59e0b' }}>
              <div className="drp-quadrant-title" style={{ color: '#f59e0b' }}>
                <span>QUADRANT 3: QUICK WINS / BATCH RESUBMISSION</span>
                <span>⚡ High Urgency / Moderate Yield</span>
              </div>
              <p style={{ fontSize: '0.775rem', color: '#94a3b8' }}>
                Filing window closing (&le; 14 days) but lower dollar amount. Worked via automated electronic scrub correction.
              </p>
              {priorities
                .filter(p => p.days_until_deadline <= 14 && p.days_until_deadline >= 0 && p.yield_per_hour < 1000)
                .map(p => (
                  <div key={p.id} style={{ padding: '0.4rem 0', borderBottom: '1px solid #1e293b', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span><strong>{p.claim_number}</strong> ({p.patient_name})</span>
                    <span style={{ color: '#f59e0b', fontWeight: 700 }}>${p.yield_per_hour}/hr | {p.days_until_deadline}d left</span>
                  </div>
                ))}
            </div>

            {/* Quadrant 4: Low Yield + Low Urgency */}
            <div className="drp-quadrant-card" style={{ borderLeft: '4px solid #64748b' }}>
              <div className="drp-quadrant-title" style={{ color: '#cbd5e1' }}>
                <span>QUADRANT 4: MARGINAL / SUPERVISOR WRITE-OFF AUDIT</span>
                <span>💤 Low Urgency / Low Yield</span>
              </div>
              <p style={{ fontSize: '0.775rem', color: '#94a3b8' }}>
                Low expected yield or expired statutory filing limits. Candidates for automated dismissal or bulk write-off.
              </p>
              {priorities
                .filter(p => p.days_until_deadline < 0 || (p.days_until_deadline > 14 && p.yield_per_hour < 1000))
                .map(p => (
                  <div key={p.id} style={{ padding: '0.4rem 0', borderBottom: '1px solid #1e293b', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span><strong>{p.claim_number}</strong> ({p.patient_name})</span>
                    <span style={{ color: '#94a3b8', fontWeight: 600 }}>${p.yield_per_hour}/hr | {p.days_until_deadline}d left</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* 5. MODALS */}

      {/* MODAL 1: ASSIGN SPECIALIST */}
      {assignModalOpen && selectedDenial && (
        <div className="drp-modal-overlay" onClick={() => setAssignModalOpen(false)}>
          <div className="drp-modal-content" onClick={e => e.stopPropagation()}>
            <div className="drp-modal-header">
              <h3 style={{ margin: 0, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <UserCheck size={18} color="#0284c7" /> Assign Denial Specialist
              </h3>
              <button
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                onClick={() => setAssignModalOpen(false)}
              >
                &times;
              </button>
            </div>

            <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '1rem' }}>
              Claim: <strong>{selectedDenial.claim_number}</strong> (${selectedDenial.denied_amount.toFixed(2)})
              <br />
              Routing Category: <strong>{DENIAL_CATEGORIES[selectedDenial.denial_category]?.label}</strong>
            </div>

            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
              Select Certified Revenue Specialist:
            </label>
            <select
              className="drp-filter-select"
              style={{ width: '100%', marginBottom: '1rem' }}
              value={selectedSpecialist}
              onChange={e => setSelectedSpecialist(e.target.value)}
            >
              <option value="Sarah Jenkins, CPC (Lead Appeals Coordinator)">Sarah Jenkins, CPC (Lead Appeals Coordinator)</option>
              <option value="Michael Torres, RHIA (Coding & Modifier Specialist)">Michael Torres, RHIA (Coding &amp; Modifier Specialist)</option>
              <option value="Emily Chen, CRCR (Patient Financial Counselor)">Emily Chen, CRCR (Patient Financial Counselor)</option>
              <option value="David Miller (Managed Care Contract Analyst)">David Miller (Managed Care Contract Analyst)</option>
            </select>

            <div className="drp-modal-footer">
              <button className="drp-btn drp-btn-secondary" onClick={() => setAssignModalOpen(false)}>
                Cancel
              </button>
              <button className="drp-btn drp-btn-primary" onClick={handleAssign}>
                Confirm Assignment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: WRITE-OFF JUSTIFICATION */}
      {writeOffModalOpen && selectedDenial && (
        <div className="drp-modal-overlay" onClick={() => setWriteOffModalOpen(false)}>
          <div className="drp-modal-content" onClick={e => e.stopPropagation()}>
            <div className="drp-modal-header">
              <h3 style={{ margin: 0, color: '#f87171', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldAlert size={18} color="#ef4444" /> Supervisor Write-Off Authorization
              </h3>
              <button
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                onClick={() => setWriteOffModalOpen(false)}
              >
                &times;
              </button>
            </div>

            <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '1rem' }}>
              Authorizing contractual non-recoverable write-off for:
              <br />
              Claim: <strong>{selectedDenial.claim_number}</strong> | Balance: <strong>${selectedDenial.denied_amount.toFixed(2)}</strong>
            </div>

            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
              Authorizing Supervisor / Medical Director:
            </label>
            <input
              type="text"
              className="drp-search-input"
              style={{
                width: '100%',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                padding: '0.5rem',
                borderRadius: '0.375rem',
                marginBottom: '1rem',
                boxSizing: 'border-box'
              }}
              value={supervisorName}
              onChange={e => setSupervisorName(e.target.value)}
            />

            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
              Mandatory Contractual Justification Reason:
            </label>
            <textarea
              rows={3}
              style={{
                width: '100%',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                color: '#ffffff',
                padding: '0.5rem',
                borderRadius: '0.375rem',
                fontSize: '0.825rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
              placeholder="Cite contractual clause, expired timely filing limit, or lack of clinical authorization..."
              value={writeOffReason}
              onChange={e => setWriteOffReason(e.target.value)}
            />

            <div className="drp-modal-footer">
              <button className="drp-btn drp-btn-secondary" onClick={() => setWriteOffModalOpen(false)}>
                Cancel
              </button>
              <button className="drp-btn drp-btn-danger" onClick={handleWriteOff}>
                Execute Write-Off
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: AI DISPUTE STRATEGY DRAFTER */}
      {aiModalOpen && selectedDenial && aiStrategy && (
        <div className="drp-modal-overlay" onClick={() => setAiModalOpen(false)}>
          <div className="drp-modal-content" style={{ maxWidth: '640px' }} onClick={e => e.stopPropagation()}>
            <div className="drp-modal-header">
              <h3 style={{ margin: 0, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Bot size={18} color="#38bdf8" /> AI Denial Appeal Strategy Drafter
              </h3>
              <button
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                onClick={() => setAiModalOpen(false)}
              >
                &times;
              </button>
            </div>

            <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
              <div style={{
                backgroundColor: '#1e293b',
                padding: '0.75rem 1rem',
                borderRadius: '0.375rem',
                marginBottom: '1rem',
                fontSize: '0.825rem'
              }}>
                <div>Claim: <strong>{aiStrategy.claimNumber}</strong> | Patient: <strong>{aiStrategy.patientName}</strong></div>
                <div>Payer: <strong>{aiStrategy.payerName}</strong> | CPT: <strong>{aiStrategy.cptCode}</strong></div>
                <div style={{ color: '#f59e0b', marginTop: '0.25rem' }}>
                  <strong>Urgency Assessment:</strong> {aiStrategy.urgencyAssessment}
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#38bdf8', marginBottom: '0.35rem' }}>
                  Recommended Appeal &amp; Rebuttal Strategy:
                </div>
                <div style={{ backgroundColor: '#0b1120', padding: '0.75rem', borderRadius: '0.375rem', border: '1px solid #1e293b', fontSize: '0.825rem', color: '#e2e8f0' }}>
                  {aiStrategy.recommendedStrategy}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#10b981', marginBottom: '0.35rem' }}>
                  Required Evidentiary Exhibits Checklist:
                </div>
                <div style={{ backgroundColor: '#0b1120', padding: '0.75rem', borderRadius: '0.375rem', border: '1px solid #1e293b' }}>
                  {aiStrategy.requiredExhibits.map((ex, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#cbd5e1', padding: '0.25rem 0' }}>
                      <CheckCircle2 size={14} color="#10b981" />
                      <span>{ex}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="drp-modal-footer">
              <button className="drp-btn drp-btn-secondary" onClick={() => setAiModalOpen(false)}>
                Close
              </button>
              <button
                className="drp-btn drp-btn-primary"
                onClick={() => {
                  handleStartAppeal(selectedDenial.id);
                  setAiModalOpen(false);
                }}
              >
                <Send size={14} /> Launch Official Appeal Case
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
