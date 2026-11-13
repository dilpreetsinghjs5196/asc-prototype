import React, { useState, useMemo } from 'react';
import {
  DollarSign,
  Clock,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Search,
  Filter,
  RefreshCw,
  Info,
  Calendar,
  Layers,
  ChevronRight,
  X,
  FileCheck,
  Activity,
  Zap,
  ArrowRight,
  ShieldCheck,
  Sliders,
  UserCheck,
  UserX,
  Briefcase
} from 'lucide-react';
import {
  ACTIONABILITY_TIERS,
  RECOVERY_PATHWAYS,
  RECOVERY_STATUSES,
  DEFAULT_CONTRIBUTION_MARGIN_RATE,
  DEFAULT_DOWNSTAFFING_HOURLY_RATE,
  classifySlotActionability,
  calculateRecoverableValue,
  calculateActionabilityRatio,
  calculateFacilityCapacityKpis,
  filterCapacitySlots,
  SEED_CAPACITY_SLOTS,
  SEED_ACTIONABILITY_THRESHOLDS
} from '../services/recoverableCapacityService';
import './RecoverableCapacityView.css';

export default function RecoverableCapacityView() {
  const [activeTab, setActiveTab] = useState('slots'); // 'slots', 'decomposition', 'thresholds'
  const [slots, setSlots] = useState(SEED_CAPACITY_SLOTS);
  const [thresholds, setThresholds] = useState(SEED_ACTIONABILITY_THRESHOLDS);
  const [toastMessage, setToastMessage] = useState(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [roomFilter, setRoomFilter] = useState('ALL');
  const [actionabilityFilter, setActionabilityFilter] = useState('ALL');
  const [pathwayFilter, setPathwayFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Rate Simulator State
  const [customMarginRate, setCustomMarginRate] = useState(DEFAULT_CONTRIBUTION_MARGIN_RATE);
  const [customDownstaffRate, setCustomDownstaffRate] = useState(DEFAULT_DOWNSTAFFING_HOURLY_RATE);

  // Action Modals State
  const [modalType, setModalType] = useState(null); // 'BACKFILL', 'DOWNSTAFF', 'DETAILS'
  const [activeSlot, setActiveSlot] = useState(null);

  // Backfill Form State
  const [backfillSurgeon, setBackfillSurgeon] = useState('');
  const [backfillPatient, setBackfillPatient] = useState('');
  const [backfillCaseId, setBackfillCaseId] = useState('');
  const [backfillProcedure, setBackfillProcedure] = useState('');
  const [backfillDurationMins, setBackfillDurationMins] = useState(120);

  // Downstaff Form State
  const [downstaffShift, setDownstaffShift] = useState('Afternoon OR Crew (RN, CST, Circulator)');
  const [downstaffApprover, setDownstaffApprover] = useState('Nurse Manager / Perioperative Director');
  const [downstaffReason, setDownstaffReason] = useState('Unbooked slot exceeds 48h SLA with no surgeon backlog.');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Recalculate KPIs dynamically
  const kpis = useMemo(() => {
    return calculateFacilityCapacityKpis(slots);
  }, [slots]);

  // Filtered Slots
  const filteredSlots = useMemo(() => {
    return filterCapacitySlots(slots, {
      room: roomFilter,
      actionability: actionabilityFilter,
      pathway: pathwayFilter,
      status: statusFilter,
      searchQuery: searchTerm
    });
  }, [slots, roomFilter, actionabilityFilter, pathwayFilter, statusFilter, searchTerm]);

  // Open Modal Helpers
  const handleOpenBackfill = (slot) => {
    setActiveSlot(slot);
    setBackfillSurgeon(slot.assignedSpecialtyCode === 'ORTHOPEDICS' ? 'Dr. Marcus Vance, MD' : 'Dr. Sarah Jenkins, MD');
    setBackfillPatient('James Henderson');
    setBackfillCaseId(`CASE-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
    setBackfillProcedure(slot.assignedSpecialtyCode === 'ORTHOPEDICS' ? 'Right Knee Arthroscopic Chondroplasty' : 'Laparoscopic Inguinal Hernia Repair');
    setBackfillDurationMins(Math.min(slot.slotDurationMinutes, 120));
    setModalType('BACKFILL');
  };

  const handleOpenDownstaff = (slot) => {
    setActiveSlot(slot);
    setDownstaffShift('Full Surgical Crew (1 Circulator RN, 1 CST, 1 Tech)');
    setDownstaffApprover('Director of Perioperative Services');
    setDownstaffReason(`Proactive release of unbooked ${slot.slotDurationMinutes}m slot at ${slot.leadTimeHours}h lead-time.`);
    setModalType('DOWNSTAFF');
  };

  const handleOpenDetails = (slot) => {
    setActiveSlot(slot);
    setModalType('DETAILS');
  };

  const handleCloseModal = () => {
    setModalType(null);
    setActiveSlot(null);
  };

  // Submit Actions
  const handleConfirmBackfill = (e) => {
    e.preventDefault();
    if (!activeSlot) return;

    setSlots(prev => prev.map(s => {
      if (s.id === activeSlot.id) {
        return {
          ...s,
          recoveryPathway: 'CASE_BACKFILL',
          recoveryStatus: 'BACKFILL_PROPOSED',
          assignedCaseId: backfillCaseId,
          actionNotes: `Backfill Proposed: ${backfillProcedure} by ${backfillSurgeon} (Patient: ${backfillPatient})`
        };
      }
      return s;
    }));

    showToast(`Case backfill proposed for ${activeSlot.roomName} (${backfillCaseId})`);
    handleCloseModal();
  };

  const handleConfirmDownstaff = (e) => {
    e.preventDefault();
    if (!activeSlot) return;

    setSlots(prev => prev.map(s => {
      if (s.id === activeSlot.id) {
        return {
          ...s,
          recoveryPathway: 'LABOR_DOWNSTAFFING',
          recoveryStatus: 'DOWNSTAFFING_INITIATED',
          actionNotes: `Downstaffing Initiated by ${downstaffApprover}: ${downstaffReason}`
        };
      }
      return s;
    }));

    showToast(`Clinical crew downstaffing initiated for ${activeSlot.roomName} ($${activeSlot.avoidedLaborCost.toFixed(2)} savings)`);
    handleCloseModal();
  };

  const handleResetSeed = () => {
    setSlots(SEED_CAPACITY_SLOTS);
    setCustomMarginRate(DEFAULT_CONTRIBUTION_MARGIN_RATE);
    setCustomDownstaffRate(DEFAULT_DOWNSTAFFING_HOURLY_RATE);
    showToast('Simulation dataset reset to baseline state.');
  };

  return (
    <div className="rc-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="rc-toast">
          <CheckCircle2 className="rc-toast-icon" size={18} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Area */}
      <div className="rc-header-banner">
        <div className="rc-header-main">
          <div className="rc-header-title-row">
            <h1 className="rc-title">Recoverable Capacity &amp; Opportunity Value Engine</h1>
            <span className="rc-badge-pill rc-badge-blue">Phase A9</span>
            <span className="rc-badge-pill rc-badge-emerald">Module 10</span>
          </div>
          <p className="rc-subtitle">
            Decompose gross unused operating room hours into actionable booking capacity vs. stranded friction gaps,
            and quantify recoverable financial value through surgical backfilling and clinical crew downstaffing.
          </p>
        </div>
        <div className="rc-header-actions">
          <button className="rc-btn rc-btn-secondary" onClick={handleResetSeed}>
            <RefreshCw size={15} />
            <span>Reset Demo Data</span>
          </button>
        </div>
      </div>

      {/* 5-Card Operational Ribbon */}
      <div className="rc-ribbon-grid">
        {/* Card 1: Actionable Capacity */}
        <div className="rc-kpi-card rc-border-emerald">
          <div className="rc-kpi-header">
            <span className="rc-kpi-label">Actionable Recoverable Capacity</span>
            <span className="rc-kpi-icon rc-icon-emerald">
              <Zap size={18} />
            </span>
          </div>
          <div className="rc-kpi-value-row">
            <span className="rc-kpi-value">{kpis.actionableHours}</span>
            <span className="rc-kpi-unit">hrs</span>
          </div>
          <div className="rc-kpi-subtext">
            <span>{kpis.actionableSlotsCount} actionable slot opportunities identified</span>
          </div>
        </div>

        {/* Card 2: Actionability Ratio */}
        <div className="rc-kpi-card rc-border-blue">
          <div className="rc-kpi-header">
            <span className="rc-kpi-label">Capacity Actionability Ratio</span>
            <span className="rc-kpi-icon rc-icon-blue">
              <TrendingUp size={18} />
            </span>
          </div>
          <div className="rc-kpi-value-row">
            <span className="rc-kpi-value">{kpis.actionabilityRatioPct}%</span>
          </div>
          <div className="rc-kpi-subtext">
            <span>Target &ge; 65.0% &bull; {kpis.actionabilityRatioPct >= 65 ? 'High Efficiency' : 'Excess Friction'}</span>
          </div>
        </div>

        {/* Card 3: Potential Backfill Value */}
        <div className="rc-kpi-card rc-border-emerald">
          <div className="rc-kpi-header">
            <span className="rc-kpi-label">Potential Case Backfill Margin</span>
            <span className="rc-kpi-icon rc-icon-emerald">
              <DollarSign size={18} />
            </span>
          </div>
          <div className="rc-kpi-value-row">
            <span className="rc-kpi-value">${kpis.totalPotentialBackfillMargin.toLocaleString()}</span>
          </div>
          <div className="rc-kpi-subtext">
            <span>Modeled at $1,250/hr average surgical margin</span>
          </div>
        </div>

        {/* Card 4: Avoidable Labor Expense */}
        <div className="rc-kpi-card rc-border-amber">
          <div className="rc-kpi-header">
            <span className="rc-kpi-label">Avoidable Crew Labor Expense</span>
            <span className="rc-kpi-icon rc-icon-amber">
              <Activity size={18} />
            </span>
          </div>
          <div className="rc-kpi-value-row">
            <span className="rc-kpi-value">${kpis.totalPotentialLaborSavings.toLocaleString()}</span>
          </div>
          <div className="rc-kpi-subtext">
            <span>Modeled at $175/hr clinical shift rate (&gt;48h notice)</span>
          </div>
        </div>

        {/* Card 5: Stranded Wastage */}
        <div className="rc-kpi-card rc-border-crimson">
          <div className="rc-kpi-header">
            <span className="rc-kpi-label">Stranded Friction Wastage</span>
            <span className="rc-kpi-icon rc-icon-crimson">
              <AlertTriangle size={18} />
            </span>
          </div>
          <div className="rc-kpi-value-row">
            <span className="rc-kpi-value">{kpis.fragmentedWastageHours}</span>
            <span className="rc-kpi-unit">hrs</span>
          </div>
          <div className="rc-kpi-subtext">
            <span>Unbookable gaps (&lt;60m or &lt;24h lead-time)</span>
          </div>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="rc-nav-tabs">
        <button
          className={`rc-nav-tab ${activeTab === 'slots' ? 'rc-nav-tab-active' : ''}`}
          onClick={() => setActiveTab('slots')}
        >
          <Layers size={16} />
          <span>Actionable Capacity Slots Ledger</span>
          <span className="rc-tab-count">{slots.length}</span>
        </button>

        <button
          className={`rc-nav-tab ${activeTab === 'decomposition' ? 'rc-nav-tab-active' : ''}`}
          onClick={() => setActiveTab('decomposition')}
        >
          <TrendingUp size={16} />
          <span>Capacity Decomposition &amp; Horizon Distribution</span>
        </button>

        <button
          className={`rc-nav-tab ${activeTab === 'thresholds' ? 'rc-nav-tab-active' : ''}`}
          onClick={() => setActiveTab('thresholds')}
        >
          <Sliders size={16} />
          <span>Specialty Viability Thresholds &amp; Rates</span>
          <span className="rc-tab-count">{thresholds.length}</span>
        </button>
      </div>

      {/* TAB 1: ACTIONABLE CAPACITY SLOTS LEDGER */}
      {activeTab === 'slots' && (
        <div className="rc-tab-content">
          {/* Filter Bar */}
          <div className="rc-filter-bar">
            <div className="rc-search-wrapper">
              <Search className="rc-search-icon" size={16} />
              <input
                type="text"
                className="rc-search-input"
                placeholder="Search room, specialty code, or notes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button className="rc-search-clear" onClick={() => setSearchTerm('')}>
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="rc-filter-controls">
              <div className="rc-filter-group">
                <label className="rc-filter-label">Operating Room:</label>
                <select
                  className="rc-select"
                  value={roomFilter}
                  onChange={(e) => setRoomFilter(e.target.value)}
                >
                  <option value="ALL">All Suites</option>
                  <option value="or-1">OR 1 - Orthopedic</option>
                  <option value="or-2">OR 2 - Robotic &amp; MIS</option>
                  <option value="or-3">OR 3 - Ophthalmology</option>
                  <option value="or-4">OR 4 - Spine &amp; Pain</option>
                </select>
              </div>

              <div className="rc-filter-group">
                <label className="rc-filter-label">Actionability:</label>
                <select
                  className="rc-select"
                  value={actionabilityFilter}
                  onChange={(e) => setActionabilityFilter(e.target.value)}
                >
                  <option value="ALL">All Slots</option>
                  <option value="ACTIONABLE">Actionable Only (&ge;60m)</option>
                  <option value="NON_ACTIONABLE">Stranded Gaps Only (&lt;60m)</option>
                </select>
              </div>

              <div className="rc-filter-group">
                <label className="rc-filter-label">Recovery Pathway:</label>
                <select
                  className="rc-select"
                  value={pathwayFilter}
                  onChange={(e) => setPathwayFilter(e.target.value)}
                >
                  <option value="ALL">All Pathways</option>
                  <option value="CASE_BACKFILL">Case Backfill</option>
                  <option value="LABOR_DOWNSTAFFING">Labor Downstaffing</option>
                  <option value="UNRECOVERABLE_FRAGMENT">Unrecoverable Friction</option>
                </select>
              </div>

              <div className="rc-filter-group">
                <label className="rc-filter-label">Status:</label>
                <select
                  className="rc-select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="IDENTIFIED">Identified Opportunity</option>
                  <option value="BACKFILL_PROPOSED">Backfill Proposed</option>
                  <option value="DOWNSTAFFING_INITIATED">Downstaffing Initiated</option>
                  <option value="RECOVERED">Recovered</option>
                  <option value="EXPIRED_UNACTIONED">Expired Unactioned</option>
                </select>
              </div>
            </div>
          </div>

          {/* Slots Table */}
          <div className="rc-table-wrapper">
            <table className="rc-table">
              <thead>
                <tr>
                  <th>Slot Window</th>
                  <th>Surgical Suite &amp; Specialty</th>
                  <th>Duration</th>
                  <th>Lead Time</th>
                  <th>Actionability Tier</th>
                  <th>Recommended Pathway</th>
                  <th>Recovery Valuation</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSlots.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="rc-empty-row">
                      <div className="rc-empty-state">
                        <AlertCircle size={32} className="rc-empty-icon" />
                        <p className="rc-empty-title">No matching capacity slots found</p>
                        <p className="rc-empty-sub">Adjust your filter criteria or reset filters to view all capacity slots.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredSlots.map((slot) => {
                    const tierMeta = ACTIONABILITY_TIERS[slot.actionabilityTier] || ACTIONABILITY_TIERS.FRAGMENTED_STRANDED;
                    const pathwayMeta = RECOVERY_PATHWAYS[slot.recoveryPathway] || RECOVERY_PATHWAYS.UNRECOVERABLE_FRAGMENT;
                    const statusMeta = RECOVERY_STATUSES[slot.recoveryStatus] || RECOVERY_STATUSES.IDENTIFIED;

                    return (
                      <tr key={slot.id} className="rc-table-row">
                        <td>
                          <div className="rc-slot-time-col">
                            <span className="rc-slot-date">{slot.slotDate}</span>
                            <span className="rc-slot-hours">{slot.startTime} &ndash; {slot.endTime}</span>
                          </div>
                        </td>
                        <td>
                          <div className="rc-room-col">
                            <span className="rc-room-title">{slot.roomName}</span>
                            <span className="rc-specialty-tag">{slot.assignedSpecialtyCode}</span>
                          </div>
                        </td>
                        <td>
                          <div className="rc-dur-badge">
                            <Clock size={13} />
                            <span>{(slot.slotDurationMinutes / 60).toFixed(1)}h ({slot.slotDurationMinutes}m)</span>
                          </div>
                        </td>
                        <td>
                          <div className="rc-lead-col">
                            <span className="rc-lead-days">{slot.leadTimeDays.toFixed(1)} days</span>
                            <span className="rc-lead-hours">({slot.leadTimeHours}h notice)</span>
                          </div>
                        </td>
                        <td>
                          <span className={`rc-status-pill rc-${tierMeta.badgeClass}`}>
                            {slot.actionabilityTier === 'PRIME_ACTIONABLE_BLOCK' && 'Prime Block (≥90m)'}
                            {slot.actionabilityTier === 'MARGINAL_SLOT' && 'Marginal Slot (60–89m)'}
                            {slot.actionabilityTier === 'FRAGMENTED_STRANDED' && 'Stranded Gap (<60m)'}
                          </span>
                        </td>
                        <td>
                          <span className={`rc-status-pill rc-${pathwayMeta.badgeClass}`}>
                            {pathwayMeta.label}
                          </span>
                        </td>
                        <td>
                          <div className="rc-valuation-col">
                            {slot.isActionable ? (
                              <>
                                <span className="rc-val-primary">
                                  ${slot.potentialContributionMargin.toLocaleString()}
                                </span>
                                <span className="rc-val-secondary">
                                  or ${slot.avoidedLaborCost.toLocaleString()} labor
                                </span>
                              </>
                            ) : (
                              <span className="rc-val-zero">$0.00 (Friction Gap)</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={`rc-status-pill rc-${statusMeta.badgeClass}`}>
                            {statusMeta.label}
                          </span>
                        </td>
                        <td>
                          <div className="rc-row-actions">
                            {slot.isActionable && slot.recoveryStatus === 'IDENTIFIED' && (
                              <>
                                <button
                                  className="rc-action-btn rc-action-emerald"
                                  title="Backfill Surgical Case"
                                  onClick={() => handleOpenBackfill(slot)}
                                >
                                  <UserCheck size={14} />
                                  <span>Backfill</span>
                                </button>
                                <button
                                  className="rc-action-btn rc-action-amber"
                                  title="Downstaff Clinical Crew Shift"
                                  onClick={() => handleOpenDownstaff(slot)}
                                >
                                  <UserX size={14} />
                                  <span>Downstaff</span>
                                </button>
                              </>
                            )}
                            <button
                              className="rc-action-btn rc-action-neutral"
                              title="View Details"
                              onClick={() => handleOpenDetails(slot)}
                            >
                              <Info size={14} />
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

      {/* TAB 2: CAPACITY DECOMPOSITION & HORIZON DISTRIBUTION */}
      {activeTab === 'decomposition' && (
        <div className="rc-tab-content">
          <div className="rc-section-card">
            <h2 className="rc-section-title">Gross Unused Capacity Decomposition Architecture</h2>
            <p className="rc-section-desc">
              Unused operating room time is not homogeneous. ASC Analyst decomposes raw downtime into high-yield
              actionable blocks vs stranded friction gaps, preventing false assumptions about bookable surgical suite capacity.
            </p>

            {/* Decomposition Visual Grid */}
            <div className="rc-decomp-visual-grid">
              <div className="rc-decomp-main-card">
                <span className="rc-decomp-card-tag">Total Gross Unused Time</span>
                <h3 className="rc-decomp-stat">{kpis.totalUnusedHours} Hours</h3>
                <p className="rc-decomp-note">Gross unbooked operating room time across all 4 licensed suites.</p>

                <div className="rc-decomp-progress-bar">
                  <div
                    className="rc-decomp-bar-actionable"
                    style={{ width: `${kpis.actionabilityRatioPct}%` }}
                    title={`Actionable: ${kpis.actionableHours} hrs (${kpis.actionabilityRatioPct}%)`}
                  />
                  <div
                    className="rc-decomp-bar-friction"
                    style={{ width: `${(100 - kpis.actionabilityRatioPct).toFixed(1)}%` }}
                    title={`Friction: ${kpis.fragmentedWastageHours} hrs (${(100 - kpis.actionabilityRatioPct).toFixed(1)}%)`}
                  />
                </div>

                <div className="rc-decomp-legend">
                  <div className="rc-legend-item">
                    <span className="rc-legend-dot rc-dot-emerald" />
                    <span>Actionable Capacity: {kpis.actionableHours} hrs ({kpis.actionabilityRatioPct}%)</span>
                  </div>
                  <div className="rc-legend-item">
                    <span className="rc-legend-dot rc-dot-crimson" />
                    <span>Stranded Friction: {kpis.fragmentedWastageHours} hrs ({(100 - kpis.actionabilityRatioPct).toFixed(1)}%)</span>
                  </div>
                </div>
              </div>

              {/* Conversion Pathways Comparison */}
              <div className="rc-decomp-path-card rc-border-emerald">
                <div className="rc-path-header">
                  <span className="rc-path-title">Pathway 1: Surgical Case Backfilling</span>
                  <span className="rc-badge-pill rc-badge-emerald">High Margin</span>
                </div>
                <p className="rc-path-body">
                  Prime blocks (&ge; 90m duration with &ge; 48h lead-time) are paired with facility surgical waitlists.
                  Generates incremental top-line surgical revenue and facility contribution margin.
                </p>
                <div className="rc-path-metric-row">
                  <div className="rc-path-metric">
                    <span className="rc-path-num">${customMarginRate.toFixed(2)}/hr</span>
                    <span className="rc-path-sub">Average Contribution Margin</span>
                  </div>
                  <div className="rc-path-metric">
                    <span className="rc-path-num">${kpis.totalPotentialBackfillMargin.toLocaleString()}</span>
                    <span className="rc-path-sub">Gross Opportunity Yield</span>
                  </div>
                </div>
              </div>

              <div className="rc-decomp-path-card rc-border-amber">
                <div className="rc-path-header">
                  <span className="rc-path-title">Pathway 2: Clinical Crew Downstaffing</span>
                  <span className="rc-badge-pill rc-badge-amber">Labor Avoidance</span>
                </div>
                <p className="rc-path-body">
                  When backfill is unachievable or lead-time is &ge; 48h, facility leadership issues advance shift
                  cancellations to release clinical staffing overhead and avoid idle payroll waste.
                </p>
                <div className="rc-path-metric-row">
                  <div className="rc-path-metric">
                    <span className="rc-path-num">${customDownstaffRate.toFixed(2)}/hr</span>
                    <span className="rc-path-sub">Avoidable Clinical Crew Labor</span>
                  </div>
                  <div className="rc-path-metric">
                    <span className="rc-path-num">${kpis.totalPotentialLaborSavings.toLocaleString()}</span>
                    <span className="rc-path-sub">Direct Payroll Avoidance</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Lead Time Horizon Tiers */}
            <div className="rc-horizon-section">
              <h3 className="rc-horizon-title">Advance Lead Time Horizon Governance</h3>
              <p className="rc-horizon-desc">
                Recovery feasibility depends critically on advance notification. Actionability decays exponentially as the date of surgery approaches.
              </p>

              <div className="rc-horizon-grid">
                <div className="rc-horizon-card">
                  <div className="rc-horizon-header">
                    <span className="rc-horizon-tag rc-badge-emerald">&gt; 72 Hours Out</span>
                    <span className="rc-horizon-feasibility">Strategic Window</span>
                  </div>
                  <p className="rc-horizon-text">
                    Optimal horizon for high-complexity case intake. Full pre-op workup, anesthesia pre-clearance, and implant sterilization feasible.
                  </p>
                  <div className="rc-horizon-footer">
                    <span className="rc-horizon-rec">Target: Surgical Case Backfill</span>
                  </div>
                </div>

                <div className="rc-horizon-card">
                  <div className="rc-horizon-header">
                    <span className="rc-horizon-tag rc-badge-blue">48 &ndash; 72 Hours Out</span>
                    <span className="rc-horizon-feasibility">Operational Window</span>
                  </div>
                  <p className="rc-horizon-text">
                    Contractual nurse downstaffing notification SLA. Can downstaff clinical crew without penalty or fill with expedited outpatient cases.
                  </p>
                  <div className="rc-horizon-footer">
                    <span className="rc-horizon-rec">Target: Downstaffing or Fast-Track Backfill</span>
                  </div>
                </div>

                <div className="rc-horizon-card">
                  <div className="rc-horizon-header">
                    <span className="rc-horizon-tag rc-badge-amber">24 &ndash; 48 Hours Out</span>
                    <span className="rc-horizon-feasibility">Tactical Window</span>
                  </div>
                  <p className="rc-horizon-text">
                    Tight window for elective cases; viable for urgent add-ons, pain injections, or local cataract cases already pre-screened.
                  </p>
                  <div className="rc-horizon-footer">
                    <span className="rc-horizon-rec">Target: Marginal Add-On or Partial Shift Cut</span>
                  </div>
                </div>

                <div className="rc-horizon-card">
                  <div className="rc-horizon-header">
                    <span className="rc-horizon-tag rc-badge-crimson">&lt; 24 Hours Out</span>
                    <span className="rc-horizon-feasibility">Critical Lock</span>
                  </div>
                  <p className="rc-horizon-text">
                    Zero notice unbooked time. Cannot downstaff nursing crew without call pay penalty. High probability of complete stranded loss.
                  </p>
                  <div className="rc-horizon-footer">
                    <span className="rc-horizon-rec">Status: Unrecoverable Friction Wastage</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SPECIALTY VIABILITY THRESHOLDS & RATES */}
      {activeTab === 'thresholds' && (
        <div className="rc-tab-content">
          <div className="rc-section-card">
            <div className="rc-threshold-header-row">
              <div>
                <h2 className="rc-section-title">Specialty Viability Thresholds &amp; Economic Models</h2>
                <p className="rc-section-desc">
                  Deterministic parameters defining minimum viable duration, advance lead-time SLAs, and financial yield rates by surgical discipline.
                </p>
              </div>
            </div>

            {/* Thresholds Table */}
            <div className="rc-table-wrapper" style={{ marginTop: '16px' }}>
              <table className="rc-table">
                <thead>
                  <tr>
                    <th>Specialty Discipline</th>
                    <th>Min Viable Case Duration</th>
                    <th>Minimum Lead-Time SLA</th>
                    <th>Hourly Contribution Margin</th>
                    <th>Avoided Downstaffing Rate</th>
                    <th>Clinical Rationale</th>
                  </tr>
                </thead>
                <tbody>
                  {thresholds.map((t) => (
                    <tr key={t.id} className="rc-table-row">
                      <td>
                        <div className="rc-thresh-name-col">
                          <span className="rc-thresh-name">{t.specialtyName}</span>
                          <span className="rc-thresh-code">{t.specialtyCode}</span>
                        </div>
                      </td>
                      <td>
                        <span className="rc-dur-badge">
                          <Clock size={13} />
                          <span>{t.minViableCaseDurationMinutes} minutes</span>
                        </span>
                      </td>
                      <td>
                        <span className="rc-lead-col">
                          <span className="rc-lead-days">{t.minLeadTimeHours} hours</span>
                          <span className="rc-lead-hours">({(t.minLeadTimeHours / 24).toFixed(1)} days SLA)</span>
                        </span>
                      </td>
                      <td>
                        <span className="rc-val-primary">${t.hourlyContributionMargin.toFixed(2)}/hr</span>
                      </td>
                      <td>
                        <span className="rc-val-secondary">${t.hourlyDownstaffingRate.toFixed(2)}/hr</span>
                      </td>
                      <td>
                        <span className="rc-rationale-text">{t.clinicalRationale}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Economic Sensitivity Simulator */}
            <div className="rc-simulator-card">
              <h3 className="rc-sim-title">Deterministic Economic Rate Sensitivity</h3>
              <p className="rc-sim-desc">
                Adjust facility financial baseline benchmarks to project real-time recoverable capacity value.
              </p>
              <div className="rc-sim-controls">
                <div className="rc-sim-field">
                  <label className="rc-sim-label">Average Surgical Contribution Margin ($/hr):</label>
                  <input
                    type="number"
                    className="rc-sim-input"
                    value={customMarginRate}
                    onChange={(e) => setCustomMarginRate(Number(e.target.value) || 0)}
                    step="50"
                  />
                </div>
                <div className="rc-sim-field">
                  <label className="rc-sim-label">Clinical Crew Downstaffing Rate ($/hr):</label>
                  <input
                    type="number"
                    className="rc-sim-input"
                    value={customDownstaffRate}
                    onChange={(e) => setCustomDownstaffRate(Number(e.target.value) || 0)}
                    step="25"
                  />
                </div>
                <div className="rc-sim-summary">
                  <span className="rc-sim-summary-label">Recalculated 30-Day Potential Value:</span>
                  <span className="rc-sim-summary-val">
                    ${(kpis.actionableHours * customMarginRate).toLocaleString()} Backfill | ${(kpis.actionableHours * customDownstaffRate).toLocaleString()} Labor
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==============================================================================
          MODAL: CASE BACKFILL / DOWNSTAFFING / DETAILS
          Strict Pinned Layout: Header & Footer Pinned, Body Scrollable
          ============================================================================== */}
      {modalType && activeSlot && (
        <div className="rc-modal-backdrop" onClick={handleCloseModal}>
          <div className="rc-modal-container" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header (Pinned) */}
            <div className="rc-modal-header">
              <div className="rc-modal-title-row">
                <span className="rc-modal-icon">
                  {modalType === 'BACKFILL' && <UserCheck size={20} className="rc-icon-emerald" />}
                  {modalType === 'DOWNSTAFF' && <UserX size={20} className="rc-icon-amber" />}
                  {modalType === 'DETAILS' && <Info size={20} className="rc-icon-blue" />}
                </span>
                <div>
                  <h3 className="rc-modal-title">
                    {modalType === 'BACKFILL' && 'Propose Surgical Case Backfill'}
                    {modalType === 'DOWNSTAFF' && 'Initiate Clinical Crew Downstaffing'}
                    {modalType === 'DETAILS' && 'Capacity Slot Audit & Provenance'}
                  </h3>
                  <span className="rc-modal-subtitle">
                    {activeSlot.roomName} &bull; {activeSlot.slotDate} ({activeSlot.startTime} &ndash; {activeSlot.endTime})
                  </span>
                </div>
              </div>
              <button className="rc-modal-close" onClick={handleCloseModal}>
                <X size={18} />
              </button>
            </div>

            {/* Modal Form / Body */}
            {modalType === 'BACKFILL' && (
              <form onSubmit={handleConfirmBackfill} className="rc-modal-form">
                <div className="rc-modal-body">
                  <div className="rc-slot-summary-box rc-box-emerald">
                    <span className="rc-box-label">Target Slot Capacity</span>
                    <div className="rc-box-row">
                      <span><strong>Duration:</strong> {activeSlot.slotDurationMinutes} minutes ({(activeSlot.slotDurationMinutes / 60).toFixed(1)} hrs)</span>
                      <span><strong>Advance Notice:</strong> {activeSlot.leadTimeDays.toFixed(1)} days ({activeSlot.leadTimeHours}h)</span>
                      <span><strong>Est. Margin:</strong> ${activeSlot.potentialContributionMargin.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="rc-form-group">
                    <label className="rc-label">Recipient Surgeon Name *</label>
                    <input
                      type="text"
                      className="rc-input"
                      value={backfillSurgeon}
                      onChange={(e) => setBackfillSurgeon(e.target.value)}
                      required
                    />
                  </div>

                  <div className="rc-form-row">
                    <div className="rc-form-group">
                      <label className="rc-label">Patient Name *</label>
                      <input
                        type="text"
                        className="rc-input"
                        value={backfillPatient}
                        onChange={(e) => setBackfillPatient(e.target.value)}
                        required
                      />
                    </div>
                    <div className="rc-form-group">
                      <label className="rc-label">Booking / Case ID *</label>
                      <input
                        type="text"
                        className="rc-input"
                        value={backfillCaseId}
                        onChange={(e) => setBackfillCaseId(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="rc-form-group">
                    <label className="rc-label">Procedure Name *</label>
                    <input
                      type="text"
                      className="rc-input"
                      value={backfillProcedure}
                      onChange={(e) => setBackfillProcedure(e.target.value)}
                      required
                    />
                  </div>

                  <div className="rc-form-row">
                    <div className="rc-form-group">
                      <label className="rc-label">Planned Case Duration (Mins) *</label>
                      <input
                        type="number"
                        className="rc-input"
                        value={backfillDurationMins}
                        onChange={(e) => setBackfillDurationMins(Number(e.target.value) || 0)}
                        max={activeSlot.slotDurationMinutes}
                        min={30}
                        required
                      />
                      <span className="rc-help-text">Max available contiguous slot: {activeSlot.slotDurationMinutes} mins.</span>
                    </div>
                    <div className="rc-form-group">
                      <label className="rc-label">Projected Contribution Margin ($)</label>
                      <input
                        type="text"
                        className="rc-input"
                        value={`$${((backfillDurationMins / 60) * customMarginRate).toFixed(2)}`}
                        disabled
                      />
                      <span className="rc-help-text">Calculated at ${customMarginRate}/hr surgical yield.</span>
                    </div>
                  </div>
                </div>

                {/* Modal Footer (Pinned) */}
                <div className="rc-modal-footer">
                  <button type="button" className="rc-btn rc-btn-secondary" onClick={handleCloseModal}>
                    Cancel
                  </button>
                  <button type="submit" className="rc-btn rc-btn-primary">
                    <CheckCircle2 size={16} />
                    <span>Confirm Case Backfill</span>
                  </button>
                </div>
              </form>
            )}

            {modalType === 'DOWNSTAFF' && (
              <form onSubmit={handleConfirmDownstaff} className="rc-modal-form">
                <div className="rc-modal-body">
                  <div className="rc-slot-summary-box rc-box-amber">
                    <span className="rc-box-label">Clinical Staff Downstaffing Opportunity</span>
                    <div className="rc-box-row">
                      <span><strong>Duration:</strong> {activeSlot.slotDurationMinutes} mins ({(activeSlot.slotDurationMinutes / 60).toFixed(1)} hrs)</span>
                      <span><strong>Advance SLA:</strong> {activeSlot.leadTimeHours}h notice ({activeSlot.leadTimeHours >= 48 ? 'Compliant with 48h SLA' : 'Penalty Risk'})</span>
                      <span><strong>Avoidable Payroll:</strong> ${activeSlot.avoidedLaborCost.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="rc-form-group">
                    <label className="rc-label">Clinical Crew Shift to Release *</label>
                    <input
                      type="text"
                      className="rc-input"
                      value={downstaffShift}
                      onChange={(e) => setDownstaffShift(e.target.value)}
                      required
                    />
                  </div>

                  <div className="rc-form-group">
                    <label className="rc-label">Authorizing Clinical Leader *</label>
                    <input
                      type="text"
                      className="rc-input"
                      value={downstaffApprover}
                      onChange={(e) => setDownstaffApprover(e.target.value)}
                      required
                    />
                  </div>

                  <div className="rc-form-group">
                    <label className="rc-label">Downstaffing Justification &amp; Rationale *</label>
                    <textarea
                      className="rc-textarea"
                      rows={3}
                      value={downstaffReason}
                      onChange={(e) => setDownstaffReason(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Modal Footer (Pinned) */}
                <div className="rc-modal-footer">
                  <button type="button" className="rc-btn rc-btn-secondary" onClick={handleCloseModal}>
                    Cancel
                  </button>
                  <button type="submit" className="rc-btn rc-btn-warning">
                    <AlertTriangle size={16} />
                    <span>Authorize Downstaffing Release</span>
                  </button>
                </div>
              </form>
            )}

            {modalType === 'DETAILS' && (
              <div className="rc-modal-form">
                <div className="rc-modal-body">
                  <div className="rc-details-grid">
                    <div className="rc-details-item">
                      <span className="rc-details-label">Slot Identifier:</span>
                      <span className="rc-details-value">{activeSlot.id}</span>
                    </div>
                    <div className="rc-details-item">
                      <span className="rc-details-label">Facility Tenancy:</span>
                      <span className="rc-details-value">{activeSlot.facilityId}</span>
                    </div>
                    <div className="rc-details-item">
                      <span className="rc-details-label">Operating Suite:</span>
                      <span className="rc-details-value">{activeSlot.roomName}</span>
                    </div>
                    <div className="rc-details-item">
                      <span className="rc-details-label">Date &amp; Hours:</span>
                      <span className="rc-details-value">{activeSlot.slotDate} ({activeSlot.startTime} &ndash; {activeSlot.endTime})</span>
                    </div>
                    <div className="rc-details-item">
                      <span className="rc-details-label">Contiguous Duration:</span>
                      <span className="rc-details-value">{activeSlot.slotDurationMinutes} mins ({(activeSlot.slotDurationMinutes / 60).toFixed(1)} hrs)</span>
                    </div>
                    <div className="rc-details-item">
                      <span className="rc-details-label">Advance Lead-Time:</span>
                      <span className="rc-details-value">{activeSlot.leadTimeDays.toFixed(1)} days ({activeSlot.leadTimeHours} hrs)</span>
                    </div>
                    <div className="rc-details-item">
                      <span className="rc-details-label">Actionability Classification:</span>
                      <span className="rc-details-value">{activeSlot.actionabilityTier}</span>
                    </div>
                    <div className="rc-details-item">
                      <span className="rc-details-label">Recommended Pathway:</span>
                      <span className="rc-details-value">{activeSlot.recoveryPathway}</span>
                    </div>
                    <div className="rc-details-item">
                      <span className="rc-details-label">Backfill Margin Potential:</span>
                      <span className="rc-details-value">${activeSlot.potentialContributionMargin.toFixed(2)}</span>
                    </div>
                    <div className="rc-details-item">
                      <span className="rc-details-label">Avoided Crew Labor Cost:</span>
                      <span className="rc-details-value">${activeSlot.avoidedLaborCost.toFixed(2)}</span>
                    </div>
                    <div className="rc-details-item" style={{ gridColumn: 'span 2' }}>
                      <span className="rc-details-label">Clinical Action Notes / Provenance:</span>
                      <span className="rc-details-value">{activeSlot.actionNotes || 'None recorded.'}</span>
                    </div>
                  </div>
                </div>

                <div className="rc-modal-footer">
                  <button type="button" className="rc-btn rc-btn-secondary" onClick={handleCloseModal}>
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

