import React, { useState, useMemo } from 'react';
import {
  ShieldCheck,
  Clock,
  Building2,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Search,
  Filter,
  DollarSign,
  TrendingDown,
  RefreshCw,
  Info,
  Calendar,
  UserCheck,
  Sliders,
  ChevronRight,
  Layers,
  ArrowRightLeft,
  Award,
  AlertCircle,
  FileCheck
} from 'lucide-react';
import {
  RIGHTSIZING_ACTIONS,
  DEFAULT_HOURLY_CONTRIBUTION_MARGIN,
  calculateAdjustedBlockUtilization,
  calculateRawBlockUtilization,
  calculateUnusedBlockMinutes,
  calculateOpportunityCost,
  calculateReleaseCompliance,
  calculateSbpiScore,
  determineRightsizingRecommendation,
  calculateFacilityBlockSummaryKpis,
  filterBlockLedgers,
  SEED_BLOCK_UTILIZATION_LEDGERS,
  SEED_BLOCK_GOVERNANCE_ACTIONS
} from '../services/blockUtilizationMetricsService';
import './BlockUtilizationMetricsView.css';

export default function BlockUtilizationMetricsView() {
  const [activeSubTab, setActiveSubTab] = useState('performance'); // 'performance', 'wastage', 'governance'
  const [ledgers, setLedgers] = useState(SEED_BLOCK_UTILIZATION_LEDGERS);
  const [governanceActions, setGovernanceActions] = useState(SEED_BLOCK_GOVERNANCE_ACTIONS);
  const [toastMessage, setToastMessage] = useState(null);

  // Filters for Performance View
  const [searchTerm, setSearchTerm] = useState('');
  const [specialtyFilter, setSpecialtyFilter] = useState('ALL');
  const [actionFilter, setActionFilter] = useState('ALL');

  // Modal State: Rightsizing Action
  const [showActionModal, setShowActionModal] = useState(false);
  const [selectedLedger, setSelectedLedger] = useState(null);
  const [actionFormData, setActionFormData] = useState({
    action_type: 'RIGHTSIZE_DOWNGRADE',
    proposed_hours: 4.0,
    effective_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    executive_rationale: ''
  });

  const showToast = (text) => {
    setToastMessage(text);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Facility Aggregate KPIs
  const kpis = useMemo(() => {
    return calculateFacilityBlockSummaryKpis(ledgers);
  }, [ledgers]);

  // Filtered Ledgers
  const filteredLedgers = useMemo(() => {
    return filterBlockLedgers(ledgers, {
      search: searchTerm,
      specialtyCode: specialtyFilter,
      rightsizingAction: actionFilter
    });
  }, [ledgers, searchTerm, specialtyFilter, actionFilter]);

  // Wastage Leaderboard (sorted descending by opportunity cost)
  const wastageLeaderboard = useMemo(() => {
    return [...ledgers].sort((a, b) => b.wastage_opportunity_cost - a.wastage_opportunity_cost);
  }, [ledgers]);

  // Open Governance Review Modal
  const handleOpenActionModal = (ledger) => {
    setSelectedLedger(ledger);
    const recommended = ledger.rightsizing_action || 'MAINTAIN';
    const currentHours = ledger.allocated_minutes / 60;
    const proposed = recommended === 'RIGHTSIZE_DOWNGRADE' ? Math.max(2, currentHours / 2) : currentHours + 2;

    setActionFormData({
      action_type: recommended,
      proposed_hours: proposed,
      effective_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      executive_rationale: `Quarterly MEC review: ${ledger.surgeon_name} recorded ${ledger.adjusted_utilization_pct}% adjusted block utilization and SBPI score of ${ledger.sbpi_score}.`
    });
    setShowActionModal(true);
  };

  // Submit Governance Action
  const handleSaveAction = (e) => {
    e.preventDefault();
    if (!selectedLedger) return;

    const newAction = {
      id: `bga-${Date.now()}`,
      facility_id: selectedLedger.facility_id,
      block_definition_id: selectedLedger.block_definition_id,
      block_name: selectedLedger.block_name,
      surgeon_name: selectedLedger.surgeon_name,
      action_type: actionFormData.action_type,
      action_status: 'APPROVED_EXECUTED',
      effective_date: actionFormData.effective_date,
      previous_allocation_minutes: selectedLedger.allocated_minutes,
      proposed_allocation_minutes: Math.round(Number(actionFormData.proposed_hours) * 60),
      executive_rationale: actionFormData.executive_rationale,
      approved_by: 'Medical Executive Committee (MEC Authorized)'
    };

    setGovernanceActions(prev => [newAction, ...prev]);

    // Update ledger action status in state
    setLedgers(prev => prev.map(l => {
      if (l.id !== selectedLedger.id) return l;
      return {
        ...l,
        rightsizing_action: actionFormData.action_type,
        recommendation_notes: `MEC Action Logged: ${actionFormData.action_type.replace(/_/g, ' ')} (${actionFormData.proposed_hours}h effective ${actionFormData.effective_date})`
      };
    }));

    setShowActionModal(false);
    showToast(`Governance action authorized for ${selectedLedger.surgeon_name}.`);
  };

  // Reset to Baseline
  const handleResetBaseline = () => {
    if (window.confirm('Reset all block utilization ledgers and committee actions to baseline?')) {
      setLedgers([...SEED_BLOCK_UTILIZATION_LEDGERS]);
      setGovernanceActions([...SEED_BLOCK_GOVERNANCE_ACTIONS]);
      showToast('Block utilization metrics reset to baseline.');
    }
  };

  return (
    <div className="or-blockutil-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="or-blockutil-toast">
          <CheckCircle2 size={16} className="text-emerald" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="or-blockutil-header">
        <div className="header-titles">
          <div className="badge-ribbon">
            <span className="clinical-badge badge-teal">MODULE 10: OR SCHEDULING</span>
            <span className="clinical-badge badge-blue">PHASE A5 SPECIFICATION</span>
            <span className="clinical-badge badge-emerald">BLOCK ECONOMICS & SBPI ENGINE</span>
          </div>
          <h1>Block Utilization Metrics, Wastage & Rightsizing</h1>
          <p className="subtitle">
            Deterministic block utilization modeling, idle block wastage tracking, surgeon block performance index (SBPI), and automated Medical Executive Committee rightsizing actions.
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn-secondary" onClick={handleResetBaseline}>
            <RefreshCw size={14} />
            <span>Reset Baseline</span>
          </button>
        </div>
      </div>

      {/* 5-Card Operational Ribbon */}
      <div className="metrics-ribbon">
        <div className="metric-card card-accent-blue">
          <div className="metric-header">
            <span className="metric-title">Avg Adjusted Block Util</span>
            <ShieldCheck size={18} className="text-blue" />
          </div>
          <div className="metric-value">{kpis.avgAdjustedUtilPct}%</div>
          <div className="metric-footer">
            Across {ledgers.length} active master blocks
          </div>
        </div>

        <div className="metric-card card-accent-emerald">
          <div className="metric-header">
            <span className="metric-title">Release Compliance</span>
            <CheckCircle2 size={18} className="text-emerald" />
          </div>
          <div className="metric-value">{kpis.avgReleaseCompliancePct}%</div>
          <div className="metric-footer">
            On-time surrenders (≥120h advance notice)
          </div>
        </div>

        <div className="metric-card card-accent-amber">
          <div className="metric-header">
            <span className="metric-title">Abandoned Block Wastage</span>
            <Clock size={18} className="text-amber" />
          </div>
          <div className="metric-value">{kpis.totalWastedHours} hrs</div>
          <div className="metric-footer">
            Unutilized and unreleased prime time
          </div>
        </div>

        <div className="metric-card card-accent-crimson">
          <div className="metric-header">
            <span className="metric-title">Hoarding Opportunity Cost</span>
            <DollarSign size={18} className="text-crimson" />
          </div>
          <div className="metric-value">${kpis.totalOpportunityCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          <div className="metric-footer">
            Valued at $1,250.00/hr facility margin
          </div>
        </div>

        <div className="metric-card card-accent-slate">
          <div className="metric-header">
            <span className="metric-title">MEC Rightsizing Queue</span>
            <Sliders size={18} className="text-slate" />
          </div>
          <div className="metric-value">{kpis.probationaryCount + kpis.expandCandidateCount} Blocks</div>
          <div className="metric-footer">
            {kpis.expandCandidateCount} expansion / {kpis.probationaryCount} probation
          </div>
        </div>
      </div>

      {/* View Switcher Tabs */}
      <div className="or-blockutil-tabs">
        <button
          type="button"
          className={`tab-btn ${activeSubTab === 'performance' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('performance')}
        >
          <Award size={16} />
          <span>Block Performance & SBPI Scorecards</span>
        </button>
        <button
          type="button"
          className={`tab-btn ${activeSubTab === 'wastage' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('wastage')}
        >
          <TrendingDown size={16} />
          <span>Block Wastage & Opportunity Cost Rankings</span>
        </button>
        <button
          type="button"
          className={`tab-btn ${activeSubTab === 'governance' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('governance')}
        >
          <FileCheck size={16} />
          <span>MEC Rightsizing Committee Log</span>
        </button>
      </div>

      {/* VIEW 1: BLOCK PERFORMANCE & SBPI SCORECARDS */}
      {activeSubTab === 'performance' && (
        <div className="blockutil-tab-content">
          {/* Filter Bar */}
          <div className="blockutil-filter-bar">
            <div className="search-box">
              <Search size={16} className="text-slate" />
              <input
                type="text"
                placeholder="Search block ledgers by surgeon or block name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="filters-group">
              <select value={specialtyFilter} onChange={(e) => setSpecialtyFilter(e.target.value)}>
                <option value="ALL">All Clinical Specialties</option>
                <option value="ORTHOPEDICS">Orthopedic Surgery</option>
                <option value="SPINE">Spine Surgery</option>
                <option value="CARDIOVASCULAR">Cardiovascular & Thoracic</option>
                <option value="GENERAL_SURGERY">General Surgery & Laparoscopy</option>
              </select>

              <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
                <option value="ALL">All Rightsizing Actions</option>
                {Object.values(RIGHTSIZING_ACTIONS).map(a => (
                  <option key={a.code} value={a.code}>{a.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Table Card */}
          <div className="table-card">
            <div className="table-header-info">
              <Award size={18} className="text-teal" />
              <h3>Quarterly Surgeon Block Performance & Rightsizing Ledgers</h3>
              <span className="table-hint">
                SBPI Formula: 50% Adjusted Utilization + 30% Release Compliance + 20% Out-of-Block Absorption Ratio.
              </span>
            </div>

            <div className="table-responsive">
              <table className="or-blockutil-table">
                <thead>
                  <tr>
                    <th>Surgeon & Block</th>
                    <th>Operating Suite</th>
                    <th>Allocated vs Utilized</th>
                    <th>On-Time Releases</th>
                    <th>Adjusted Util %</th>
                    <th>Release Compliance</th>
                    <th>SBPI Score</th>
                    <th>Rightsizing Recommendation</th>
                    <th className="actions-col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLedgers.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="empty-table-cell">
                        No block performance ledgers match the selected filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredLedgers.map(l => {
                      const actionMeta = RIGHTSIZING_ACTIONS[l.rightsizing_action] || RIGHTSIZING_ACTIONS.MAINTAIN;
                      const allocHrs = (l.allocated_minutes / 60).toFixed(1);
                      const utilHrs = (l.utilized_minutes / 60).toFixed(1);
                      const onTimeHrs = (l.on_time_released_minutes / 60).toFixed(1);

                      return (
                        <tr key={l.id}>
                          <td>
                            <div className="surgeon-info-cell">
                              <strong>{l.surgeon_name}</strong>
                              <span className="block-subname">{l.block_name}</span>
                            </div>
                          </td>
                          <td>
                            <span className="badge-room">{l.room_number}</span>
                          </td>
                          <td>
                            <div className="numeric-cell">
                              <strong>{utilHrs} / {allocHrs} hrs</strong>
                              <span className="cell-subtext">{l.raw_utilization_pct}% raw util</span>
                            </div>
                          </td>
                          <td>
                            <div className="numeric-cell">
                              <span className={l.on_time_released_minutes > 0 ? 'text-emerald font-bold' : 'text-slate'}>
                                {onTimeHrs} hrs
                              </span>
                              <span className="cell-subtext">Deducted from denom</span>
                            </div>
                          </td>
                          <td>
                            <div className="progress-cell-group">
                              <span className="font-bold">{l.adjusted_utilization_pct}%</span>
                              <div className="util-progress-bar">
                                <div
                                  className={`util-progress-fill ${l.adjusted_utilization_pct >= 85 ? 'fill-emerald' : l.adjusted_utilization_pct >= 75 ? 'fill-blue' : l.adjusted_utilization_pct >= 60 ? 'fill-amber' : 'fill-crimson'}`}
                                  style={{ width: `${Math.min(100, l.adjusted_utilization_pct)}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`compliance-pill ${l.release_compliance_pct >= 80 ? 'pill-emerald' : l.release_compliance_pct >= 50 ? 'pill-amber' : 'pill-crimson'}`}>
                              {l.release_compliance_pct}%
                            </span>
                          </td>
                          <td>
                            <div className="sbpi-cell-box">
                              <span className="sbpi-score-badge">{l.sbpi_score}</span>
                              <span className="cell-subtext">Index 0-100</span>
                            </div>
                          </td>
                          <td>
                            <span className={`clinical-badge ${actionMeta.badgeClass}`}>
                              {actionMeta.label.split(' ')[0]}
                            </span>
                          </td>
                          <td className="actions-col">
                            <button
                              type="button"
                              className="btn-action-primary"
                              onClick={() => handleOpenActionModal(l)}
                            >
                              <Sliders size={13} />
                              <span>MEC Review</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: BLOCK WASTAGE & OPPORTUNITY COST RANKINGS */}
      {activeSubTab === 'wastage' && (
        <div className="blockutil-tab-content">
          <div className="table-card">
            <div className="table-header-info">
              <TrendingDown size={18} className="text-crimson" />
              <h3>Block Wastage & Opportunity Cost Financial Leaderboard</h3>
              <span className="table-hint">
                Calculates realized financial margin forfeiture: Unused Abandoned Hours × $1,250.00/hr facility contribution margin.
              </span>
            </div>

            <div className="table-responsive">
              <table className="or-blockutil-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Surgeon / Block Owner</th>
                    <th>Specialty</th>
                    <th>Allocated Hours</th>
                    <th>Abandoned Unused Hours</th>
                    <th>Hoarding Opportunity Cost</th>
                    <th>Release Discipline</th>
                    <th>Governance Risk Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {wastageLeaderboard.map((w, idx) => {
                    const wastedHrs = (w.unused_abandoned_minutes / 60).toFixed(1);
                    const allocHrs = (w.allocated_minutes / 60).toFixed(1);

                    return (
                      <tr key={w.id}>
                        <td>
                          <span className={`rank-badge ${idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : 'rank-std'}`}>
                            #{idx + 1}
                          </span>
                        </td>
                        <td>
                          <div className="surgeon-info-cell">
                            <strong>{w.surgeon_name}</strong>
                            <span className="block-subname">{w.block_name}</span>
                          </div>
                        </td>
                        <td>
                          <span className="specialty-text">{w.specialty_code}</span>
                        </td>
                        <td>
                          <span>{allocHrs} hrs</span>
                        </td>
                        <td>
                          <strong className={w.unused_abandoned_minutes > 1000 ? 'text-crimson' : 'text-amber'}>
                            {wastedHrs} hrs
                          </strong>
                        </td>
                        <td>
                          <strong className="text-crimson font-large">
                            ${w.wastage_opportunity_cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </strong>
                        </td>
                        <td>
                          <span className="compliance-pill pill-slate">
                            {w.release_compliance_pct}% On-Time
                          </span>
                        </td>
                        <td>
                          {w.wastage_opportunity_cost > 30000 ? (
                            <span className="clinical-badge badge-crimson">Severe Margin Leakage</span>
                          ) : w.wastage_opportunity_cost > 15000 ? (
                            <span className="clinical-badge badge-amber">Moderate Risk</span>
                          ) : (
                            <span className="clinical-badge badge-emerald">Controlled Risk</span>
                          )}
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

      {/* VIEW 3: MEC GOVERNANCE ACTIONS LOG */}
      {activeSubTab === 'governance' && (
        <div className="blockutil-tab-content">
          <div className="table-card">
            <div className="table-header-info">
              <FileCheck size={18} className="text-teal" />
              <h3>Medical Executive Committee (MEC) Block Rightsizing Decisions</h3>
              <span className="table-hint">
                Formal committee governance log authorizing block expansions, remediations, and alternate-week downgrades.
              </span>
            </div>

            <div className="table-responsive">
              <table className="or-blockutil-table">
                <thead>
                  <tr>
                    <th>Effective Date</th>
                    <th>Surgeon / Specialty</th>
                    <th>Block Definition</th>
                    <th>Action Taken</th>
                    <th>Capacity Adjustment</th>
                    <th>Status</th>
                    <th>Executive Rationale</th>
                    <th>Approved By</th>
                  </tr>
                </thead>
                <tbody>
                  {governanceActions.map(g => (
                    <tr key={g.id}>
                      <td>
                        <strong>{g.effective_date}</strong>
                      </td>
                      <td>
                        <strong>{g.surgeon_name}</strong>
                      </td>
                      <td>
                        <span>{g.block_name}</span>
                      </td>
                      <td>
                        <span className={`clinical-badge ${g.action_type === 'EXPAND_ALLOCATION' ? 'badge-emerald' : g.action_type === 'RIGHTSIZE_DOWNGRADE' ? 'badge-crimson' : 'badge-amber'}`}>
                          {g.action_type.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        <div className="numeric-cell">
                          <span>{(g.previous_allocation_minutes / 60).toFixed(1)}h → <strong>{(g.proposed_allocation_minutes / 60).toFixed(1)}h</strong></span>
                        </div>
                      </td>
                      <td>
                        <span className={`status-pill ${g.action_status === 'APPROVED_EXECUTED' ? 'pill-emerald' : 'pill-amber'}`}>
                          {g.action_status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        <span className="rationale-text">{g.executive_rationale}</span>
                      </td>
                      <td>
                        <span className="approver-text">{g.approved_by}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal: MEC Rightsizing Committee Review */}
      {showActionModal && selectedLedger && (
        <div className="or-blockutil-modal-backdrop">
          <div className="or-blockutil-modal-container">
            <div className="or-blockutil-modal-header">
              <div className="or-blockutil-modal-title-group">
                <Sliders size={18} className="text-teal" />
                <h3 className="or-blockutil-modal-title">MEC Rightsizing Committee Review</h3>
              </div>
              <button
                type="button"
                className="or-blockutil-modal-close-btn"
                onClick={() => setShowActionModal(false)}
              >
                ✕
              </button>
            </div>

            <form className="or-blockutil-modal-form" onSubmit={handleSaveAction}>
              <div className="or-blockutil-modal-body">
                <div className="summary-spec-box">
                  <div><strong>Surgeon:</strong> {selectedLedger.surgeon_name} ({selectedLedger.specialty_code})</div>
                  <div><strong>Block Name:</strong> {selectedLedger.block_name} in {selectedLedger.room_number}</div>
                  <div>
                    <strong>Adjusted Utilization:</strong>{' '}
                    <span className={selectedLedger.adjusted_utilization_pct >= 75 ? 'text-emerald font-bold' : 'text-crimson font-bold'}>
                      {selectedLedger.adjusted_utilization_pct}%
                    </span>{' '}
                    | <strong>SBPI Score:</strong> {selectedLedger.sbpi_score} / 100
                  </div>
                  <div>
                    <strong>Unused Abandoned Time:</strong> {(selectedLedger.unused_abandoned_minutes / 60).toFixed(1)} hrs
                    (${selectedLedger.wastage_opportunity_cost.toLocaleString()} opportunity cost)
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="blockutil-form-group">
                    <label>Committee Action Type <span className="text-crimson">*</span></label>
                    <select
                      value={actionFormData.action_type}
                      onChange={(e) => setActionFormData({ ...actionFormData, action_type: e.target.value })}
                      className="blockutil-form-control"
                    >
                      <option value="EXPAND_ALLOCATION">Expand Allocation (+2h / Prime Promotion)</option>
                      <option value="MAINTAIN">Maintain Current Block Schedule</option>
                      <option value="PROBATIONARY_NOTICE">Issue Formal 60-Day Utilization Notice</option>
                      <option value="RIGHTSIZE_DOWNGRADE">Rightsize: Downgrade to Alternate Weeks (EOW)</option>
                    </select>
                  </div>

                  <div className="blockutil-form-group">
                    <label>Proposed Weekly / Cycle Hours <span className="text-crimson">*</span></label>
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      required
                      value={actionFormData.proposed_hours}
                      onChange={(e) => setActionFormData({ ...actionFormData, proposed_hours: Number(e.target.value) })}
                      className="blockutil-form-control"
                    />
                  </div>
                </div>

                <div className="blockutil-form-group">
                  <label>Effective Implementation Date <span className="text-crimson">*</span></label>
                  <input
                    type="date"
                    required
                    value={actionFormData.effective_date}
                    onChange={(e) => setActionFormData({ ...actionFormData, effective_date: e.target.value })}
                    className="blockutil-form-control"
                  />
                </div>

                <div className="blockutil-form-group">
                  <label>Executive Rationale & Committee Notes <span className="text-crimson">*</span></label>
                  <textarea
                    rows={3}
                    required
                    value={actionFormData.executive_rationale}
                    onChange={(e) => setActionFormData({ ...actionFormData, executive_rationale: e.target.value })}
                    className="blockutil-form-control"
                  />
                </div>
              </div>

              <div className="or-blockutil-modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowActionModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Authorize Rightsizing Action
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

