import React, { useState, useMemo } from 'react';
import {
  Activity,
  Clock,
  Building2,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
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
  Percent,
  FileText
} from 'lucide-react';
import {
  BENCHMARK_TIERS,
  DEFAULT_BENCHMARK_TARGET_PCT,
  calculateRawUtilizationPct,
  calculateTurnoverInclusivePct,
  calculatePrimeTimeUtilizationPct,
  calculateBlockUtilization,
  determineUtilizationTier,
  calculateFinancialYieldMetrics,
  calculateFacilityUtilizationKpis,
  filterRoomUtilization,
  filterSurgeonBlockUtilization,
  SEED_DAILY_ROOM_UTILIZATION,
  SEED_SURGEON_BLOCK_UTILIZATION
} from '../services/orUtilizationMetricsService';
import './OrUtilizationMetricsView.css';

export default function OrUtilizationMetricsView() {
  const [activeSubTab, setActiveSubTab] = useState('rooms'); // 'rooms', 'surgeons', 'financial'
  const [roomSnapshots, setRoomSnapshots] = useState(SEED_DAILY_ROOM_UTILIZATION);
  const [surgeonSnapshots, setSurgeonSnapshots] = useState(SEED_SURGEON_BLOCK_UTILIZATION);
  const [toastMessage, setToastMessage] = useState(null);

  // Filters for Room View
  const [roomSearch, setRoomSearch] = useState('');
  const [roomFilter, setRoomFilter] = useState('ALL');
  const [minUtilFilter, setMinUtilFilter] = useState('ALL');

  // Filters for Surgeon View
  const [surgeonSearch, setSurgeonSearch] = useState('');
  const [specialtyFilter, setSpecialtyFilter] = useState('ALL');
  const [tierFilter, setTierFilter] = useState('ALL');

  // Modal State: Rightsizing Review
  const [showRightsizingModal, setShowRightsizingModal] = useState(false);
  const [selectedSurgeonBlock, setSelectedSurgeonBlock] = useState(null);
  const [selectedAction, setSelectedAction] = useState('MAINTAIN_BLOCK');
  const [actionNotes, setActionNotes] = useState('');

  const showToast = (text) => {
    setToastMessage(text);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Facility Rollup KPIs
  const kpis = useMemo(() => {
    return calculateFacilityUtilizationKpis(roomSnapshots, surgeonSnapshots);
  }, [roomSnapshots, surgeonSnapshots]);

  // Filtered Room Snapshots
  const filteredRooms = useMemo(() => {
    return filterRoomUtilization(roomSnapshots, {
      search: roomSearch,
      operatingRoomId: roomFilter,
      minUtilPct: minUtilFilter
    });
  }, [roomSnapshots, roomSearch, roomFilter, minUtilFilter]);

  // Filtered Surgeon Snapshots
  const filteredSurgeons = useMemo(() => {
    return filterSurgeonBlockUtilization(surgeonSnapshots, {
      search: surgeonSearch,
      specialtyCode: specialtyFilter,
      utilizationTier: tierFilter
    });
  }, [surgeonSnapshots, surgeonSearch, specialtyFilter, tierFilter]);

  // Open Rightsizing Review Modal
  const handleOpenRightsizingModal = (block) => {
    setSelectedSurgeonBlock(block);
    setSelectedAction(block.rightsizing_recommendation || 'MAINTAIN_BLOCK');
    setActionNotes(`Quarterly governance review based on ${block.block_utilization_pct}% 90-day block utilization.`);
    setShowRightsizingModal(true);
  };

  // Save Rightsizing Decision
  const handleSaveRightsizing = (e) => {
    e.preventDefault();
    if (!selectedSurgeonBlock) return;

    setSurgeonSnapshots(prev => prev.map(s => {
      if (s.id !== selectedSurgeonBlock.id) return s;
      return {
        ...s,
        rightsizing_recommendation: selectedAction,
        governance_action: `Executive Decision: ${selectedAction.replace(/_/g, ' ')} (${new Date().toLocaleDateString()})`
      };
    }));

    setShowRightsizingModal(false);
    showToast(`Governance action logged: ${selectedAction.replace(/_/g, ' ')} for ${selectedSurgeonBlock.surgeon_name}.`);
  };

  // Reset to Baseline
  const handleResetBaseline = () => {
    if (window.confirm('Reset all utilization snapshots and governance actions to facility baseline?')) {
      setRoomSnapshots([...SEED_DAILY_ROOM_UTILIZATION]);
      setSurgeonSnapshots([...SEED_SURGEON_BLOCK_UTILIZATION]);
      showToast('Facility utilization metrics reset to baseline.');
    }
  };

  return (
    <div className="or-util-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="or-util-toast">
          <CheckCircle2 size={16} className="text-emerald" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="or-util-header">
        <div className="header-titles">
          <div className="badge-ribbon">
            <span className="clinical-badge badge-teal">MODULE 10: OR SCHEDULING</span>
            <span className="clinical-badge badge-blue">PHASE A4 SPECIFICATION</span>
            <span className="clinical-badge badge-emerald">DETERMINISTIC BENCHMARKING ENGINE</span>
          </div>
          <h1>Operating Room Utilization Metrics & Governance</h1>
          <p className="subtitle">
            Deterministic gross staffed, prime-time, and turnover-inclusive room occupancy paired with surgeon block rightsizing governance and financial yield per OR hour.
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
            <span className="metric-title">Gross Staffed Util</span>
            <Activity size={18} className="text-blue" />
          </div>
          <div className="metric-value">{kpis.grossStaffedUtilPct}%</div>
          <div className="metric-footer">
            {kpis.totalInRoomHours}h in-room of {kpis.totalStaffedHours}h staffed
          </div>
        </div>

        <div className="metric-card card-accent-emerald">
          <div className="metric-header">
            <span className="metric-title">Prime-Time Util</span>
            <Clock size={18} className="text-emerald" />
          </div>
          <div className="metric-value">{kpis.primeTimeUtilPct}%</div>
          <div className="metric-footer">
            Within 07:00–15:00 core shift window
          </div>
        </div>

        <div className="metric-card card-accent-teal">
          <div className="metric-header">
            <span className="metric-title">Turnover Occupancy</span>
            <Layers size={18} className="text-teal" />
          </div>
          <div className="metric-value">{kpis.turnoverInclusivePct}%</div>
          <div className="metric-footer">
            Includes {kpis.totalTurnoverHours}h capped changeover time
          </div>
        </div>

        <div className="metric-card card-accent-amber">
          <div className="metric-header">
            <span className="metric-title">Block Compliance</span>
            <ShieldCheck size={18} className="text-amber" />
          </div>
          <div className="metric-value">{kpis.blockComplianceRatePct}%</div>
          <div className="metric-footer">
            Surgeons meeting ≥75.0% target benchmark
          </div>
        </div>

        <div className="metric-card card-accent-slate">
          <div className="metric-header">
            <span className="metric-title">Margin / Staffed Hour</span>
            <DollarSign size={18} className="text-slate" />
          </div>
          <div className="metric-value">${kpis.marginPerStaffedHour.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          <div className="metric-footer">
            Total Margin: ${kpis.totalMargin.toLocaleString()}
          </div>
        </div>
      </div>

      {/* View Switcher Tabs */}
      <div className="or-util-tabs">
        <button
          type="button"
          className={`tab-btn ${activeSubTab === 'rooms' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('rooms')}
        >
          <Building2 size={16} />
          <span>Operating Suite Utilization Matrix</span>
        </button>
        <button
          type="button"
          className={`tab-btn ${activeSubTab === 'surgeons' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('surgeons')}
        >
          <UserCheck size={16} />
          <span>Surgeon Block Governance & Rightsizing</span>
        </button>
        <button
          type="button"
          className={`tab-btn ${activeSubTab === 'financial' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('financial')}
        >
          <DollarSign size={16} />
          <span>Financial Yield & Contribution per OR Hour</span>
        </button>
      </div>

      {/* VIEW 1: OPERATING SUITE UTILIZATION MATRIX */}
      {activeSubTab === 'rooms' && (
        <div className="util-tab-content">
          {/* Filter Bar */}
          <div className="util-filter-bar">
            <div className="search-box">
              <Search size={16} className="text-slate" />
              <input
                type="text"
                placeholder="Search operating suites by number or specialty..."
                value={roomSearch}
                onChange={(e) => setRoomSearch(e.target.value)}
              />
            </div>
            <div className="filters-group">
              <select value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)}>
                <option value="ALL">All Operating Rooms</option>
                {roomSnapshots.map(r => (
                  <option key={r.id} value={r.operating_room_id}>{r.room_number} — {r.room_name}</option>
                ))}
              </select>

              <select value={minUtilFilter} onChange={(e) => setMinUtilFilter(e.target.value)}>
                <option value="ALL">All Utilization Levels</option>
                <option value="80">≥ 80% Utilization</option>
                <option value="70">≥ 70% Utilization</option>
                <option value="60">≥ 60% Utilization</option>
              </select>
            </div>
          </div>

          {/* Room Matrix Table */}
          <div className="table-card">
            <div className="table-header-info">
              <Calendar size={18} className="text-teal" />
              <h3>Operating Suite Daily Utilization Matrix (Active Shift)</h3>
              <span className="table-hint">Deterministic wheels-in to wheels-out case time mapped against Phase A1 staffed shift denominators.</span>
            </div>

            <div className="table-responsive">
              <table className="or-util-table">
                <thead>
                  <tr>
                    <th>Operating Suite</th>
                    <th>Staffed Shift</th>
                    <th>In-Room Case Time</th>
                    <th>Turnover Time</th>
                    <th>Idle Staffed Time</th>
                    <th>Raw Util %</th>
                    <th>Turnover-Inclusive %</th>
                    <th>Prime-Time Util %</th>
                    <th>Cases</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRooms.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="empty-table-cell">
                        No operating suites match the selected filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredRooms.map(r => {
                      const staffedHrs = (r.staffed_minutes / 60).toFixed(1);
                      const inRoomHrs = (r.in_room_case_minutes / 60).toFixed(1);
                      const turnoverHrs = (r.turnover_minutes / 60).toFixed(1);
                      const idleHrs = (r.unutilized_staffed_minutes / 60).toFixed(1);

                      return (
                        <tr key={r.id}>
                          <td>
                            <div className="room-cell-box">
                              <span className="badge-room">{r.room_number}</span>
                              <span className="room-subname">{r.room_name}</span>
                            </div>
                          </td>
                          <td>
                            <div className="numeric-cell">
                              <strong>{staffedHrs} hrs</strong>
                              <span className="cell-subtext">{r.staffed_minutes} mins</span>
                            </div>
                          </td>
                          <td>
                            <div className="numeric-cell">
                              <strong className="text-blue">{inRoomHrs} hrs</strong>
                              <span className="cell-subtext">{r.in_room_case_minutes} mins</span>
                            </div>
                          </td>
                          <td>
                            <div className="numeric-cell">
                              <span>{turnoverHrs} hrs</span>
                              <span className="cell-subtext">{r.turnover_minutes} mins</span>
                            </div>
                          </td>
                          <td>
                            <div className="numeric-cell">
                              <span className={r.unutilized_staffed_minutes > 120 ? 'text-amber font-bold' : 'text-slate'}>
                                {idleHrs} hrs
                              </span>
                              <span className="cell-subtext">{r.unutilized_staffed_minutes} mins</span>
                            </div>
                          </td>
                          <td>
                            <div className="progress-cell-group">
                              <div className="progress-value-row">
                                <span className="font-bold">{r.raw_utilization_pct}%</span>
                              </div>
                              <div className="util-progress-bar">
                                <div
                                  className={`util-progress-fill ${r.raw_utilization_pct >= 80 ? 'fill-emerald' : r.raw_utilization_pct >= 65 ? 'fill-blue' : 'fill-amber'}`}
                                  style={{ width: `${Math.min(100, r.raw_utilization_pct)}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="turnover-pill">{r.turnover_inclusive_utilization_pct}%</span>
                          </td>
                          <td>
                            <span className={`prime-pill ${r.prime_time_utilization_pct >= 80 ? 'pill-emerald' : r.prime_time_utilization_pct >= 70 ? 'pill-blue' : 'pill-amber'}`}>
                              {r.prime_time_utilization_pct}%
                            </span>
                          </td>
                          <td>
                            <div className="case-count-cell">
                              <strong>{r.case_count}</strong>
                              {r.overtime_minutes > 0 && (
                                <span className="overtime-badge">+{r.overtime_minutes}m OT</span>
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
          </div>
        </div>
      )}

      {/* VIEW 2: SURGEON BLOCK COMPLIANCE & RIGHTSIZING */}
      {activeSubTab === 'surgeons' && (
        <div className="util-tab-content">
          {/* Filter Bar */}
          <div className="util-filter-bar">
            <div className="search-box">
              <Search size={16} className="text-slate" />
              <input
                type="text"
                placeholder="Search by surgeon name or block title..."
                value={surgeonSearch}
                onChange={(e) => setSurgeonSearch(e.target.value)}
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

              <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value)}>
                <option value="ALL">All Benchmark Tiers</option>
                {Object.values(BENCHMARK_TIERS).map(t => (
                  <option key={t.code} value={t.code}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Surgeon Block Table */}
          <div className="table-card">
            <div className="table-header-info">
              <ShieldCheck size={18} className="text-teal" />
              <h3>90-Day Surgeon Block Utilization & Rightsizing Scorecards</h3>
              <span className="table-hint">
                Statutory denominator rule: On-time surrenders deduct from allocated time ($\Delta M = M_{alloc} - M_{rel}$); late releases remain in denominator.
              </span>
            </div>

            <div className="table-responsive">
              <table className="or-util-table">
                <thead>
                  <tr>
                    <th>Surgeon / Block Owner</th>
                    <th>Assigned Block & Room</th>
                    <th>Allocated vs On-Time Released</th>
                    <th>Net Denominator</th>
                    <th>Utilized In-Block</th>
                    <th>Block Util %</th>
                    <th>Benchmark Status</th>
                    <th>Rightsizing Action</th>
                    <th className="actions-col">Review</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSurgeons.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="empty-table-cell">
                        No surgeon block scorecards match the selected filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredSurgeons.map(s => {
                      const tierMeta = BENCHMARK_TIERS[s.utilization_tier] || BENCHMARK_TIERS.MEETS_BENCHMARK;
                      const allocHrs = (s.allocated_block_minutes / 60).toFixed(1);
                      const onTimeRelHrs = (s.on_time_released_minutes / 60).toFixed(1);
                      const netDenomHrs = (s.net_adjusted_denominator_minutes / 60).toFixed(1);
                      const utilHrs = (s.utilized_in_block_minutes / 60).toFixed(1);

                      return (
                        <tr key={s.id}>
                          <td>
                            <div className="surgeon-info-cell">
                              <strong>{s.surgeon_name}</strong>
                              <span className="cell-subtext">{s.specialty_code}</span>
                            </div>
                          </td>
                          <td>
                            <div className="block-room-cell">
                              <strong>{s.block_name}</strong>
                              <span className="badge-room">{s.room_number}</span>
                            </div>
                          </td>
                          <td>
                            <div className="numeric-cell">
                              <span>{allocHrs} hrs allocated</span>
                              {s.on_time_released_minutes > 0 ? (
                                <span className="text-emerald font-small">-{onTimeRelHrs}h on-time surrender</span>
                              ) : (
                                <span className="text-slate font-small">0h on-time releases</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="numeric-cell">
                              <strong className="text-teal">{netDenomHrs} hrs</strong>
                              <span className="cell-subtext">{s.net_adjusted_denominator_minutes} mins</span>
                            </div>
                          </td>
                          <td>
                            <div className="numeric-cell">
                              <strong>{utilHrs} hrs</strong>
                              <span className="cell-subtext">{s.total_cases_performed} cases completed</span>
                            </div>
                          </td>
                          <td>
                            <div className="progress-cell-group">
                              <span className="font-bold">{s.block_utilization_pct}%</span>
                              <div className="util-progress-bar">
                                <div
                                  className={`util-progress-fill ${s.block_utilization_pct >= s.target_utilization_pct ? 'fill-emerald' : s.block_utilization_pct >= 60 ? 'fill-amber' : 'fill-crimson'}`}
                                  style={{ width: `${Math.min(100, s.block_utilization_pct)}%` }}
                                />
                              </div>
                              <span className="target-subtext">Target: {s.target_utilization_pct}%</span>
                            </div>
                          </td>
                          <td>
                            <span className={`clinical-badge ${tierMeta.badgeClass}`}>
                              {tierMeta.label.split(' ')[0]}
                            </span>
                          </td>
                          <td>
                            <span className="governance-action-text">{s.governance_action}</span>
                          </td>
                          <td className="actions-col">
                            <button
                              type="button"
                              className="btn-action-primary"
                              onClick={() => handleOpenRightsizingModal(s)}
                            >
                              <Sliders size={13} />
                              <span>Review</span>
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

      {/* VIEW 3: FINANCIAL YIELD & CONTRIBUTION PER OR HOUR */}
      {activeSubTab === 'financial' && (
        <div className="util-tab-content">
          <div className="table-card">
            <div className="table-header-info">
              <DollarSign size={18} className="text-emerald" />
              <h3>Operating Room Financial Yield & Contribution per Hour</h3>
              <span className="table-hint">Authoritative pairing of surgical case revenue and contribution margin against utilized and staffed OR hours.</span>
            </div>

            <div className="table-responsive">
              <table className="or-util-table">
                <thead>
                  <tr>
                    <th>Surgeon & Specialty</th>
                    <th>Block Allocation</th>
                    <th>Net Revenue Generated</th>
                    <th>Contribution Margin</th>
                    <th>Utilized Hours</th>
                    <th>Margin / Utilized Hour</th>
                    <th>Margin / Staffed Block Hour</th>
                    <th>Financial Efficiency</th>
                  </tr>
                </thead>
                <tbody>
                  {surgeonSnapshots.map(s => {
                    const yieldData = calculateFinancialYieldMetrics(
                      s.net_revenue_generated,
                      s.contribution_margin_generated,
                      s.utilized_in_block_minutes,
                      s.net_adjusted_denominator_minutes
                    );

                    return (
                      <tr key={s.id}>
                        <td>
                          <div className="surgeon-info-cell">
                            <strong>{s.surgeon_name}</strong>
                            <span className="cell-subtext">{s.specialty_code}</span>
                          </div>
                        </td>
                        <td>
                          <div className="block-room-cell">
                            <span>{s.block_name}</span>
                            <span className="badge-room">{s.room_number}</span>
                          </div>
                        </td>
                        <td>
                          <strong>${Number(s.net_revenue_generated).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                        </td>
                        <td>
                          <strong className="text-emerald">
                            ${Number(s.contribution_margin_generated).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </strong>
                        </td>
                        <td>
                          <span>{yieldData.utilizedHours} hrs</span>
                        </td>
                        <td>
                          <strong className="text-blue">
                            ${yieldData.marginPerUtilizedHour.toLocaleString(undefined, { minimumFractionDigits: 2 })}/hr
                          </strong>
                        </td>
                        <td>
                          <strong className="text-teal">
                            ${yieldData.marginPerStaffedHour.toLocaleString(undefined, { minimumFractionDigits: 2 })}/hr
                          </strong>
                        </td>
                        <td>
                          {yieldData.marginPerStaffedHour >= 2500 ? (
                            <span className="savings-badge">Top Quartile Yield</span>
                          ) : yieldData.marginPerStaffedHour >= 1500 ? (
                            <span className="clinical-badge badge-blue">Above Benchmark</span>
                          ) : (
                            <span className="clinical-badge badge-amber">Standard Yield</span>
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

      {/* Modal: Surgeon Block Rightsizing Governance */}
      {showRightsizingModal && selectedSurgeonBlock && (
        <div className="or-util-modal-backdrop">
          <div className="or-util-modal-container">
            <div className="or-util-modal-header">
              <div className="or-util-modal-title-group">
                <Sliders size={18} className="text-teal" />
                <h3 className="or-util-modal-title">Executive Block Rightsizing Review</h3>
              </div>
              <button
                type="button"
                className="or-util-modal-close-btn"
                onClick={() => setShowRightsizingModal(false)}
              >
                ✕
              </button>
            </div>

            <form className="or-util-modal-form" onSubmit={handleSaveRightsizing}>
              <div className="or-util-modal-body">
                <div className="summary-spec-box">
                  <div><strong>Surgeon:</strong> {selectedSurgeonBlock.surgeon_name} ({selectedSurgeonBlock.specialty_code})</div>
                  <div><strong>Assigned Block:</strong> {selectedSurgeonBlock.block_name} in {selectedSurgeonBlock.room_number}</div>
                  <div><strong>Reporting Period:</strong> {selectedSurgeonBlock.reporting_period}</div>
                  <div>
                    <strong>90-Day Block Utilization:</strong>{' '}
                    <span className={selectedSurgeonBlock.block_utilization_pct >= selectedSurgeonBlock.target_utilization_pct ? 'text-emerald font-bold' : 'text-crimson font-bold'}>
                      {selectedSurgeonBlock.block_utilization_pct}%
                    </span>{' '}
                    (Target: {selectedSurgeonBlock.target_utilization_pct}%)
                  </div>
                </div>

                <div className="denominator-rule-banner">
                  <Info size={16} className="inline-icon text-blue" />
                  <div>
                    <strong>Statutory Denominator Governance:</strong>
                    <p>
                      Allocated: {(selectedSurgeonBlock.allocated_block_minutes / 60).toFixed(1)} hrs.
                      On-time surrenders: {(selectedSurgeonBlock.on_time_released_minutes / 60).toFixed(1)} hrs deducted.
                      Net evaluated denominator: <strong>{(selectedSurgeonBlock.net_adjusted_denominator_minutes / 60).toFixed(1)} hrs</strong>.
                    </p>
                  </div>
                </div>

                <div className="util-form-group">
                  <label>Executive Governance Decision <span className="text-crimson">*</span></label>
                  <select
                    value={selectedAction}
                    onChange={(e) => setSelectedAction(e.target.value)}
                    className="util-form-control"
                  >
                    <option value="EXPAND_BLOCK">Expand Block Allocation (Promote to Prime Time)</option>
                    <option value="MAINTAIN_BLOCK">Maintain Current Block Allocation (Meets Target)</option>
                    <option value="UTILIZATION_WARNING">Issue Formal 60-Day Utilization Notice</option>
                    <option value="REDUCE_OR_FORFEIT">Rightsize: Reduce Frequency (Every-Other-Week) or Partial Forfeiture</option>
                  </select>
                </div>

                <div className="util-form-group">
                  <label>Documentation & Executive Notes</label>
                  <textarea
                    rows={3}
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    className="util-form-control"
                  />
                </div>
              </div>

              <div className="or-util-modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowRightsizingModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Governance Action
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
