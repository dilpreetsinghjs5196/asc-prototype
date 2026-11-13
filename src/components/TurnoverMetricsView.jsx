import React, { useState, useMemo } from 'react';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Search,
  Filter,
  RefreshCw,
  Info,
  Calendar,
  DollarSign,
  TrendingUp,
  Sliders,
  ChevronRight,
  Layers,
  ArrowRightLeft,
  X,
  FileCheck,
  Building2,
  Users,
  Activity,
  BarChart3,
  PieChart
} from 'lucide-react';
import {
  TURNOVER_TYPES,
  TURNOVER_STATUSES,
  DELAY_REASONS,
  DEFAULT_HOURLY_RUN_RATE,
  calculateTurnoverDuration,
  determineTurnoverType,
  calculateTurnoverVariance,
  classifyTurnoverStatus,
  calculateTurnoverFinancialImpact,
  calculateFacilityTurnoverKpis,
  calculateDelayReasonPareto,
  filterTurnoverEvents,
  SEED_TURNOVER_EVENTS,
  SEED_TURNOVER_BENCHMARKS
} from '../services/turnoverMetricsService';
import './TurnoverMetricsView.css';

export default function TurnoverMetricsView() {
  const [activeSubTab, setActiveSubTab] = useState('ledger'); // 'ledger', 'pareto', 'benchmarks'
  const [turnoverEvents, setTurnoverEvents] = useState(SEED_TURNOVER_EVENTS);
  const [benchmarks, setBenchmarks] = useState(SEED_TURNOVER_BENCHMARKS);
  const [toastMessage, setToastMessage] = useState(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [roomFilter, setRoomFilter] = useState('ALL');
  const [specialtyFilter, setSpecialtyFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [delayFilter, setDelayFilter] = useState('ALL');

  // Modal State: Delay Attribution Review
  const [showDelayModal, setShowDelayModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [delayFormData, setDelayFormData] = useState({
    delayReasonCode: 'EVS_CLEANING_DELAY',
    delayDescription: ''
  });

  const showToast = (text) => {
    setToastMessage(text);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Facility-wide aggregated KPIs
  const kpis = useMemo(() => {
    return calculateFacilityTurnoverKpis(turnoverEvents);
  }, [turnoverEvents]);

  // Delay Reason Pareto
  const paretoData = useMemo(() => {
    return calculateDelayReasonPareto(turnoverEvents);
  }, [turnoverEvents]);

  // Unique lists for filter dropdowns
  const availableRooms = useMemo(() => {
    const map = new Map();
    turnoverEvents.forEach(e => {
      if (e.operatingRoomId && !map.has(e.operatingRoomId)) {
        map.set(e.operatingRoomId, e.roomName);
      }
    });
    return Array.from(map.entries());
  }, [turnoverEvents]);

  const availableSpecialties = useMemo(() => {
    const set = new Set();
    turnoverEvents.forEach(e => {
      if (e.priorSpecialtyCode) set.add(e.priorSpecialtyCode);
      if (e.nextSpecialtyCode) set.add(e.nextSpecialtyCode);
    });
    return Array.from(set).sort();
  }, [turnoverEvents]);

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return filterTurnoverEvents(turnoverEvents, {
      room: roomFilter,
      specialty: specialtyFilter,
      turnoverType: typeFilter,
      turnoverStatus: statusFilter,
      delayReason: delayFilter,
      searchQuery: searchTerm
    });
  }, [turnoverEvents, roomFilter, specialtyFilter, typeFilter, statusFilter, delayFilter, searchTerm]);

  // Open Delay Attribution Modal
  const handleOpenDelayModal = (event) => {
    setSelectedEvent(event);
    setDelayFormData({
      delayReasonCode: event.delayReasonCode || 'EVS_CLEANING_DELAY',
      delayDescription: event.delayDescription || ''
    });
    setShowDelayModal(true);
  };

  // Save Delay Attribution
  const handleSaveDelayAttribution = (e) => {
    e.preventDefault();
    if (!selectedEvent) return;

    setTurnoverEvents(prev =>
      prev.map(ev => {
        if (ev.id === selectedEvent.id) {
          return {
            ...ev,
            delayReasonCode: delayFormData.delayReasonCode,
            delayDescription: delayFormData.delayDescription
          };
        }
        return ev;
      })
    );

    showToast(`Delay attribution updated for transition to ${selectedEvent.nextCaseId}`);
    setShowDelayModal(false);
    setSelectedEvent(null);
  };

  return (
    <div className="to-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="to-toast">
          <CheckCircle2 size={18} className="to-toast-icon" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="to-header-banner">
        <div className="to-header-main">
          <div className="to-header-title-row">
            <h1 className="to-title">Operating Room Turnover Metrics &amp; Benchmarks</h1>
            <span className="to-badge to-badge-neutral">Phase A7 • Module 10</span>
          </div>
          <p className="to-subtitle">
            Deterministic Wheels Out to Wheels In turnover tracking, same-surgeon vs different-surgeon benchmark standard calibration, root-cause delay attribution, and idle room run-rate impact ($650/hr).
          </p>
        </div>
        <div className="to-header-actions">
          <button
            type="button"
            className="to-btn to-btn-secondary"
            onClick={() => {
              setTurnoverEvents(SEED_TURNOVER_EVENTS);
              setBenchmarks(SEED_TURNOVER_BENCHMARKS);
              showToast('Data reset to baseline clinical seeds.');
            }}
          >
            <RefreshCw size={14} />
            <span>Reset Baseline</span>
          </button>
        </div>
      </div>

      {/* 5-Card Operational Ribbon */}
      <div className="to-kpi-grid">
        <div className="to-kpi-card">
          <div className="to-kpi-header">
            <span className="to-kpi-label">Facility Avg Turnover</span>
            <span className="to-kpi-icon-wrap bg-blue-light">
              <Clock size={16} className="text-blue" />
            </span>
          </div>
          <div className="to-kpi-value-row">
            <span className="to-kpi-value">{kpis.avgTurnoverMinutes} m</span>
            <span className={`to-pill ${kpis.complianceRatePct >= 50 ? 'to-pill-emerald' : 'to-pill-amber'}`}>
              {kpis.complianceRatePct}% Compliant
            </span>
          </div>
          <div className="to-kpi-footer">
            <span>{kpis.compliantCount} of {kpis.totalTurnovers} turnovers on target</span>
          </div>
        </div>

        <div className="to-kpi-card">
          <div className="to-kpi-header">
            <span className="to-kpi-label">Same-Surgeon Avg</span>
            <span className="to-kpi-icon-wrap bg-emerald-light">
              <Users size={16} className="text-emerald" />
            </span>
          </div>
          <div className="to-kpi-value-row">
            <span className="to-kpi-value">{kpis.avgSameSurgeonMinutes} m</span>
            <span className="to-pill to-pill-neutral">Target: 20m</span>
          </div>
          <div className="to-kpi-footer">
            <span>{kpis.sameSurgeonCount} consecutive same-surgeon transitions</span>
          </div>
        </div>

        <div className="to-kpi-card">
          <div className="to-kpi-header">
            <span className="to-kpi-label">Different-Surgeon Avg</span>
            <span className="to-kpi-icon-wrap bg-amber-light">
              <ArrowRightLeft size={16} className="text-amber" />
            </span>
          </div>
          <div className="to-kpi-value-row">
            <span className="to-kpi-value">{kpis.avgDifferentSurgeonMinutes} m</span>
            <span className="to-pill to-pill-amber">Target: 35m</span>
          </div>
          <div className="to-kpi-footer">
            <span>{kpis.differentSurgeonCount} cross-surgeon room restagings</span>
          </div>
        </div>

        <div className="to-kpi-card">
          <div className="to-kpi-header">
            <span className="to-kpi-label">Prolonged Turnover Rate</span>
            <span className="to-kpi-icon-wrap bg-crimson-light">
              <AlertTriangle size={16} className="text-crimson" />
            </span>
          </div>
          <div className="to-kpi-value-row">
            <span className="to-kpi-value">{kpis.prolongedRatePct}%</span>
            <span className="to-pill to-pill-crimson">
              {kpis.prolongedCount} cases &gt; 10m delay
            </span>
          </div>
          <div className="to-kpi-footer">
            <span>{kpis.totalDelayMinutes} total minutes lost to turnover delays</span>
          </div>
        </div>

        <div className="to-kpi-card">
          <div className="to-kpi-header">
            <span className="to-kpi-label">Excess Idle Labor Cost</span>
            <span className="to-kpi-icon-wrap bg-emerald-light">
              <DollarSign size={16} className="text-emerald" />
            </span>
          </div>
          <div className="to-kpi-value-row">
            <span className="to-kpi-value">${kpis.totalExcessCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            <span className="to-pill to-pill-neutral">@ $650/hr</span>
          </div>
          <div className="to-kpi-footer">
            <span>Cost of preventable idle downtime past benchmarks</span>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="to-subtabs-bar">
        <button
          type="button"
          className={`to-subtab-btn ${activeSubTab === 'ledger' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('ledger')}
        >
          <BarChart3 size={15} />
          <span>Turnover Events Ledger</span>
          <span className="to-subtab-badge">{turnoverEvents.length}</span>
        </button>

        <button
          type="button"
          className={`to-subtab-btn ${activeSubTab === 'pareto' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('pareto')}
        >
          <PieChart size={15} />
          <span>Delay Root-Cause Pareto Analysis</span>
          <span className="to-subtab-badge">{paretoData.length}</span>
        </button>

        <button
          type="button"
          className={`to-subtab-btn ${activeSubTab === 'benchmarks' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('benchmarks')}
        >
          <Sliders size={15} />
          <span>Specialty Benchmark Standards</span>
          <span className="to-subtab-badge">{benchmarks.length}</span>
        </button>
      </div>

      {/* SUB-VIEW 1: TURNOVER EVENTS LEDGER */}
      {activeSubTab === 'ledger' && (
        <div className="to-view-section">
          {/* Filter Bar */}
          <div className="to-filter-bar">
            <div className="to-search-box">
              <Search size={15} className="to-search-icon" />
              <input
                type="text"
                placeholder="Search case ID, surgeon, procedure, or delay reason..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="to-search-input"
              />
              {searchTerm && (
                <button type="button" onClick={() => setSearchTerm('')} className="to-clear-search">
                  <X size={13} />
                </button>
              )}
            </div>

            <div className="to-filter-group">
              <label className="to-filter-label">Suite:</label>
              <select
                value={roomFilter}
                onChange={(e) => setRoomFilter(e.target.value)}
                className="to-select"
              >
                <option value="ALL">All Suites</option>
                {availableRooms.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>

            <div className="to-filter-group">
              <label className="to-filter-label">Turnover Type:</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="to-select"
              >
                <option value="ALL">All Types</option>
                <option value="SAME_SURGEON">Same Surgeon (20m Target)</option>
                <option value="DIFFERENT_SURGEON">Different Surgeon (35m Target)</option>
              </select>
            </div>

            <div className="to-filter-group">
              <label className="to-filter-label">Status:</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="to-select"
              >
                <option value="ALL">All Statuses</option>
                <option value="COMPLIANT">Compliant (&le; Target)</option>
                <option value="MINOR_DELAY">Minor Delay (1–10m)</option>
                <option value="PROLONGED_TURNOVER">Prolonged Turnover (&gt;10m)</option>
              </select>
            </div>

            {(searchTerm || roomFilter !== 'ALL' || specialtyFilter !== 'ALL' || typeFilter !== 'ALL' || statusFilter !== 'ALL' || delayFilter !== 'ALL') && (
              <button
                type="button"
                className="to-btn to-btn-ghost"
                onClick={() => {
                  setSearchTerm('');
                  setRoomFilter('ALL');
                  setSpecialtyFilter('ALL');
                  setTypeFilter('ALL');
                  setStatusFilter('ALL');
                  setDelayFilter('ALL');
                }}
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* Ledger Table */}
          <div className="to-card to-table-card">
            <div className="to-card-header">
              <div className="to-card-title-group">
                <h3 className="to-card-title">Surgical Suite Turnover Event Ledger</h3>
                <span className="to-card-hint">
                  Turnover interval from Prior Case Wheels Out to Next Case Wheels In. Same-Surgeon target 20m; Different-Surgeon target 35m.
                </span>
              </div>
              <span className="to-table-count">Showing {filteredEvents.length} transition events</span>
            </div>

            <div className="to-table-responsive">
              <table className="to-table">
                <thead>
                  <tr>
                    <th>Date / Suite</th>
                    <th>Prior Case (Wheels Out)</th>
                    <th>Next Case (Wheels In)</th>
                    <th className="text-center">Turnover Type</th>
                    <th className="text-right">Actual Duration</th>
                    <th className="text-right">Benchmark</th>
                    <th className="text-center">Variance (&Delta;T)</th>
                    <th className="text-center">Compliance Status</th>
                    <th>Delay Root Cause</th>
                    <th className="text-right">Excess Cost</th>
                    <th className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="to-empty-cell">
                        <AlertCircle size={24} className="text-muted" />
                        <p>No turnover events match the selected filters.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredEvents.map((ev) => {
                      const statusDef = TURNOVER_STATUSES[ev.turnoverStatus] || TURNOVER_STATUSES.COMPLIANT;
                      const typeDef = TURNOVER_TYPES[ev.turnoverType] || TURNOVER_TYPES.SAME_SURGEON;
                      const delayDef = ev.delayReasonCode ? DELAY_REASONS[ev.delayReasonCode] : null;

                      return (
                        <tr key={ev.id} className="to-table-row">
                          <td>
                            <div className="to-cell-strong">{ev.surgeryDate}</div>
                            <div className="to-room-badge">{ev.roomName}</div>
                          </td>
                          <td>
                            <div className="to-cell-strong">{ev.priorCaseId}</div>
                            <div className="to-cell-sub">{ev.priorSurgeonName}</div>
                            <div className="to-cell-proc" title={ev.priorProcedureName}>{ev.priorProcedureName}</div>
                          </td>
                          <td>
                            <div className="to-cell-strong">{ev.nextCaseId}</div>
                            <div className="to-cell-sub">{ev.nextSurgeonName}</div>
                            <div className="to-cell-proc" title={ev.nextProcedureName}>{ev.nextProcedureName}</div>
                          </td>
                          <td className="text-center">
                            <span className={`to-badge ${typeDef.badgeClass}`}>
                              {typeDef.label}
                            </span>
                          </td>
                          <td className="text-right font-mono font-bold">
                            {ev.actualTurnoverMinutes} m
                          </td>
                          <td className="text-right font-mono text-muted">
                            {ev.benchmarkTargetMinutes} m
                          </td>
                          <td className="text-center font-mono">
                            <span className={`to-variance-tag ${ev.turnoverVarianceMinutes > 10 ? 'tag-crimson' : ev.turnoverVarianceMinutes > 0 ? 'tag-amber' : 'tag-emerald'}`}>
                              {ev.turnoverVarianceMinutes > 0 ? `+${ev.turnoverVarianceMinutes}` : ev.turnoverVarianceMinutes} m
                            </span>
                          </td>
                          <td className="text-center">
                            <span className={`to-badge ${statusDef.badgeClass}`}>
                              {statusDef.label}
                            </span>
                          </td>
                          <td>
                            {delayDef ? (
                              <div className="to-delay-wrap">
                                <span className={`to-delay-badge ${delayDef.badgeClass}`}>{delayDef.label}</span>
                                <span className="to-delay-desc" title={ev.delayDescription}>{ev.delayDescription}</span>
                              </div>
                            ) : (
                              <span className="text-muted text-xs">On Target</span>
                            )}
                          </td>
                          <td className="text-right font-mono">
                            {ev.excessDelayCost > 0 ? (
                              <span className="text-crimson font-bold">${ev.excessDelayCost.toFixed(2)}</span>
                            ) : (
                              <span className="text-muted">$0.00</span>
                            )}
                          </td>
                          <td className="text-center">
                            <button
                              type="button"
                              className="to-btn to-btn-secondary to-btn-xs"
                              onClick={() => handleOpenDelayModal(ev)}
                              title="Review or log delay root-cause reason"
                            >
                              <FileCheck size={12} />
                              <span>Attribution</span>
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

      {/* SUB-VIEW 2: DELAY ROOT-CAUSE PARETO ANALYSIS */}
      {activeSubTab === 'pareto' && (
        <div className="to-view-section">
          {/* Methodological Context Box */}
          <div className="to-alert-info">
            <Info size={18} className="to-alert-icon" />
            <div className="to-alert-content">
              <strong>Turnover Delay Attribution &amp; Root-Cause Pareto Methodology</strong>
              <p>
                Prolonged turnovers are classified by clinical root-cause (EVS cleaning, sterile processing instrument trays, surgeon unavailability, anesthesia pre-op delays, or equipment positioning). Eliminating the top two friction points typically reclaims 65% of stranded room capacity.
              </p>
            </div>
          </div>

          <div className="to-card to-table-card">
            <div className="to-card-header">
              <div className="to-card-title-group">
                <h3 className="to-card-title">Turnover Delay Root-Cause Pareto Distribution</h3>
                <span className="to-card-hint">
                  Aggregated delay minutes and financial idle run-rate cost ($650/hr) grouped by root cause category.
                </span>
              </div>
              <span className="to-table-count">{paretoData.length} Delay Categories Identified</span>
            </div>

            <div className="to-table-responsive">
              <table className="to-table">
                <thead>
                  <tr>
                    <th>Delay Root Cause Category</th>
                    <th className="text-right">Incident Frequency</th>
                    <th className="text-right">Total Lost Minutes</th>
                    <th className="text-center">Share of Total Delay</th>
                    <th className="text-right">Total Excess Labor Cost</th>
                    <th className="text-center">Pareto Cumulative Impact</th>
                  </tr>
                </thead>
                <tbody>
                  {paretoData.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="to-empty-cell">
                        <CheckCircle2 size={24} className="text-emerald" />
                        <p>No operational turnover delays reported across active sessions.</p>
                      </td>
                    </tr>
                  ) : (
                    paretoData.map((item, idx) => {
                      return (
                        <tr key={item.code} className="to-table-row">
                          <td>
                            <div className="to-cell-strong">{item.label}</div>
                            <div className="to-cell-sub">{DELAY_REASONS[item.code]?.description}</div>
                          </td>
                          <td className="text-right font-mono font-bold">
                            {item.count} turnovers
                          </td>
                          <td className="text-right font-mono text-crimson font-bold">
                            +{item.totalDelayMinutes} m
                          </td>
                          <td className="text-center font-mono">
                            <span className="to-pill to-pill-amber">
                              {item.pctOfTotalDelay}%
                            </span>
                          </td>
                          <td className="text-right font-mono font-bold">
                            ${item.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="text-center">
                            <div className="to-progress-bar-wrap">
                              <div
                                className="to-progress-bar-fill"
                                style={{ width: `${Math.min(100, item.pctOfTotalDelay * 2)}%` }}
                              />
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

      {/* SUB-VIEW 3: SPECIALTY BENCHMARK CALIBRATION */}
      {activeSubTab === 'benchmarks' && (
        <div className="to-view-section">
          {/* Methodological Context Box */}
          <div className="to-alert-info">
            <Sliders size={18} className="to-alert-icon" />
            <div className="to-alert-content">
              <strong>Specialty-Specific Turnover Benchmark Standards</strong>
              <p>
                Turnover duration varies substantially by clinical specialty complexity. High-volume Ophthalmology suites operate on 15m rapid turnovers, whereas Orthopedics (25m) and Spine (30m) require extended sterile instrumentation and traction setup.
              </p>
            </div>
          </div>

          <div className="to-card to-table-card">
            <div className="to-card-header">
              <div className="to-card-title-group">
                <h3 className="to-card-title">Turnover Benchmark Targets by Clinical Specialty</h3>
                <span className="to-card-hint">
                  Authoritative facility benchmark minutes for same-surgeon and cross-specialty transitions.
                </span>
              </div>
              <span className="to-table-count">{benchmarks.length} Specialties Configured</span>
            </div>

            <div className="to-table-responsive">
              <table className="to-table">
                <thead>
                  <tr>
                    <th>Specialty</th>
                    <th className="text-right">Same-Surgeon Target</th>
                    <th className="text-right">Different-Surgeon Target</th>
                    <th className="text-center">Warning Threshold</th>
                    <th className="text-right">Hourly Run-Rate</th>
                    <th>Clinical Rationale</th>
                    <th className="text-center">Standard</th>
                  </tr>
                </thead>
                <tbody>
                  {benchmarks.map((bench) => (
                    <tr key={bench.id} className="to-table-row">
                      <td>
                        <div className="to-cell-strong">{bench.specialtyName}</div>
                        <div className="to-cell-sub font-mono">{bench.specialtyCode}</div>
                      </td>
                      <td className="text-right font-mono font-bold text-blue">
                        {bench.sameSurgeonBenchmarkMinutes} m
                      </td>
                      <td className="text-right font-mono font-bold text-amber">
                        {bench.differentSurgeonBenchmarkMinutes} m
                      </td>
                      <td className="text-center font-mono">
                        <span className="to-pill to-pill-neutral">&plusmn;{bench.warningThresholdMinutes} m</span>
                      </td>
                      <td className="text-right font-mono font-bold">
                        ${bench.hourlyRunRateCost.toFixed(2)}/hr
                      </td>
                      <td>
                        <span className="to-rec-text">{bench.clinicalRationale}</span>
                      </td>
                      <td className="text-center">
                        <span className="to-badge badge-emerald">Active Benchmark</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* DELAY ATTRIBUTION MODAL (Bulletproof Pinned Header/Footer Layout) */}
      {showDelayModal && selectedEvent && (
        <div className="to-modal-overlay" onClick={() => setShowDelayModal(false)}>
          <div className="to-modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="to-modal-header">
              <div className="to-modal-title-row">
                <Clock size={20} className="text-blue" />
                <h2 className="to-modal-title">Turnover Delay Root-Cause Attribution</h2>
              </div>
              <button
                type="button"
                className="to-modal-close-btn"
                onClick={() => setShowDelayModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveDelayAttribution} className="to-modal-form">
              <div className="to-modal-body">
                {/* Event Summary Box */}
                <div className="to-modal-summary-card">
                  <div className="to-summary-row">
                    <span className="to-summary-label">Suite:</span>
                    <strong className="to-summary-val">{selectedEvent.roomName}</strong>
                  </div>
                  <div className="to-summary-row">
                    <span className="to-summary-label">Prior Case:</span>
                    <span className="to-summary-val">{selectedEvent.priorCaseId} ({selectedEvent.priorSurgeonName})</span>
                  </div>
                  <div className="to-summary-row">
                    <span className="to-summary-label">Next Case:</span>
                    <span className="to-summary-val">{selectedEvent.nextCaseId} ({selectedEvent.nextSurgeonName})</span>
                  </div>
                  <div className="to-summary-row">
                    <span className="to-summary-label">Actual vs Benchmark:</span>
                    <strong className="to-summary-val">
                      {selectedEvent.actualTurnoverMinutes}m (Benchmark: {selectedEvent.benchmarkTargetMinutes}m) &rarr; Variance: {selectedEvent.turnoverVarianceMinutes > 0 ? `+${selectedEvent.turnoverVarianceMinutes}m` : `${selectedEvent.turnoverVarianceMinutes}m`}
                    </strong>
                  </div>
                </div>

                {/* Delay Category Selector */}
                <div className="to-form-group">
                  <label className="to-form-label">
                    Delay Root-Cause Category <span className="text-crimson">*</span>
                  </label>
                  <select
                    className="to-form-select"
                    value={delayFormData.delayReasonCode}
                    onChange={(e) => setDelayFormData({ ...delayFormData, delayReasonCode: e.target.value })}
                  >
                    {Object.values(DELAY_REASONS).map(reason => (
                      <option key={reason.code} value={reason.code}>
                        {reason.label}
                      </option>
                    ))}
                  </select>
                  <span className="to-form-hint">
                    {DELAY_REASONS[delayFormData.delayReasonCode]?.description}
                  </span>
                </div>

                {/* Delay Description */}
                <div className="to-form-group">
                  <label className="to-form-label">
                    Clinical &amp; Operational Notes <span className="text-crimson">*</span>
                  </label>
                  <textarea
                    rows={4}
                    className="to-form-textarea"
                    placeholder="Document specific circumstances (e.g., Decontamination spill on table, SPD backlog for ortho power tools, surgeon rounding in PACU)..."
                    value={delayFormData.delayDescription}
                    onChange={(e) => setDelayFormData({ ...delayFormData, delayDescription: e.target.value })}
                    required
                  />
                </div>
              </div>

              {/* Pinned Modal Footer */}
              <div className="to-modal-footer">
                <button
                  type="button"
                  className="to-btn to-btn-secondary"
                  onClick={() => setShowDelayModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="to-btn to-btn-primary"
                >
                  <CheckCircle2 size={15} />
                  <span>Save Attribution</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

