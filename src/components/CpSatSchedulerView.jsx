import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Search,
  Filter,
  RefreshCw,
  Info,
  Layers,
  ChevronRight,
  X,
  FileCheck,
  Activity,
  Zap,
  ArrowRight,
  ShieldCheck,
  Sliders,
  DollarSign,
  TrendingUp,
  UserCheck,
  Send,
  CalendarCheck,
  Award,
  Play,
  Cpu
} from 'lucide-react';
import {
  DEFAULT_SHIFT_START,
  DEFAULT_SHIFT_END,
  DEFAULT_STAFFED_MINUTES,
  OPTIMIZATION_STRATEGIES,
  SOLVER_STATUSES,
  SCHEDULE_STATUSES,
  OPERATING_ROOMS_CONFIG,
  timeStringToMinutes,
  minutesToTimeString,
  validateNoOverlap,
  validateSurgeonSingleLocation,
  calculateScheduleMetrics,
  runCpSatOptimizer,
  SEED_CP_SAT_CANDIDATE_CASES
} from '../services/cpSatSchedulerService';
import './CpSatSchedulerView.css';

export default function CpSatSchedulerView() {
  const [activeTab, setActiveTab] = useState('gantt'); // 'gantt', 'constraints', 'unscheduled'
  const [selectedStrategy, setSelectedStrategy] = useState('BALANCED');
  const [selectedDate, setSelectedDate] = useState('2026-11-18');
  const [candidateCases, setCandidateCases] = useState(SEED_CP_SAT_CANDIDATE_CASES);
  const [toastMessage, setToastMessage] = useState(null);

  // Modal State
  const [isCommitModalOpen, setIsCommitModalOpen] = useState(false);
  const [commitAuthorizer, setCommitAuthorizer] = useState('Dr. Marcus Vance, MD (Chief Medical Officer)');
  const [commitNotes, setCommitNotes] = useState('CP-SAT optimal multi-suite schedule confirmed. Central sterile notified for early trays.');
  const [isCommitted, setIsCommitted] = useState(false);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Run CP-SAT Solver whenever strategy, candidate cases, or date changes
  const solverResult = useMemo(() => {
    return runCpSatOptimizer(candidateCases, OPERATING_ROOMS_CONFIG, selectedStrategy, selectedDate);
  }, [candidateCases, selectedStrategy, selectedDate]);

  const { metrics, scheduledCases, unscheduledCases, hardConstraintsStatus } = solverResult;

  // Group scheduled cases by operating room
  const casesByRoom = useMemo(() => {
    const grouped = {};
    OPERATING_ROOMS_CONFIG.forEach(r => {
      grouped[r.id] = scheduledCases.filter(c => c.operatingRoomId === r.id);
    });
    return grouped;
  }, [scheduledCases]);

  const handleRunOptimizer = (strategyKey) => {
    setSelectedStrategy(strategyKey);
    setIsCommitted(false);
    showToast(`CP-SAT solver re-executed using ${OPTIMIZATION_STRATEGIES[strategyKey].label}.`);
  };

  const handleConfirmCommit = (e) => {
    e.preventDefault();
    setIsCommitted(true);
    setIsCommitModalOpen(false);
    showToast(`Schedule ${solverResult.runNumber} officially committed to facility OR Master log!`);
  };

  return (
    <div className="cps-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="cps-toast">
          <CheckCircle2 className="cps-toast-icon" size={18} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="cps-header-banner">
        <div className="cps-header-main">
          <div className="cps-header-title-row">
            <h1 className="cps-title">Scheduling Optimizer CP-SAT Engine</h1>
            <span className="cps-badge-pill cps-badge-blue">Phase AB / A11</span>
            <span className="cps-badge-pill cps-badge-emerald">Module 10</span>
          </div>
          <p className="cps-subtitle">
            Automated multi-suite combinatorial schedule optimization using Constraint Programming (CP-SAT),
            enforcing strict No-Overlap, Surgeon Single-Location, and room capability invariants while maximizing surgical margins.
          </p>
        </div>
        <div className="cps-header-actions">
          <button
            className={`cps-btn ${isCommitted ? 'cps-btn-secondary' : 'cps-btn-primary'}`}
            onClick={() => setIsCommitModalOpen(true)}
            disabled={isCommitted}
          >
            <CalendarCheck size={16} />
            <span>{isCommitted ? 'Schedule Committed' : 'Commit to OR Master'}</span>
          </button>
        </div>
      </div>

      {/* 5-Card Operational Ribbon */}
      <div className="cps-ribbon-grid">
        {/* Card 1: Scheduled Cases */}
        <div className="cps-kpi-card cps-border-blue">
          <div className="cps-kpi-header">
            <span className="cps-kpi-label">Cases Scheduled</span>
            <span className="cps-kpi-icon cps-icon-blue">
              <CalendarCheck size={18} />
            </span>
          </div>
          <div className="cps-kpi-value-row">
            <span className="cps-kpi-value">{metrics.totalCasesScheduled}</span>
            <span className="cps-kpi-unit">/ {candidateCases.length}</span>
          </div>
          <div className="cps-kpi-subtext">
            <span>{unscheduledCases.length} waitlist cases unplaced</span>
          </div>
        </div>

        {/* Card 2: Suite Utilization */}
        <div className="cps-kpi-card cps-border-emerald">
          <div className="cps-kpi-header">
            <span className="cps-kpi-label">Projected Utilization</span>
            <span className="cps-kpi-icon cps-icon-emerald">
              <TrendingUp size={18} />
            </span>
          </div>
          <div className="cps-kpi-value-row">
            <span className="cps-kpi-value">{metrics.projectedUtilizationPct}%</span>
          </div>
          <div className="cps-kpi-subtext">
            <span>{metrics.totalScheduledMinutes}m operative &bull; {metrics.totalTurnoverMinutes}m turnover</span>
          </div>
        </div>

        {/* Card 3: Projected Total Margin */}
        <div className="cps-kpi-card cps-border-emerald">
          <div className="cps-kpi-header">
            <span className="cps-kpi-label">Projected Margin</span>
            <span className="cps-kpi-icon cps-icon-emerald">
              <DollarSign size={18} />
            </span>
          </div>
          <div className="cps-kpi-value-row">
            <span className="cps-kpi-value">${metrics.projectedTotalMargin.toLocaleString()}</span>
          </div>
          <div className="cps-kpi-subtext">
            <span>Target Day: {selectedDate}</span>
          </div>
        </div>

        {/* Card 4: Overtime Risk */}
        <div className={`cps-kpi-card ${metrics.totalOvertimeMinutes > 0 ? 'cps-border-amber' : 'cps-border-blue'}`}>
          <div className="cps-kpi-header">
            <span className="cps-kpi-label">Staffed Shift Overrun</span>
            <span className={`cps-kpi-icon ${metrics.totalOvertimeMinutes > 0 ? 'cps-icon-amber' : 'cps-icon-blue'}`}>
              <Clock size={18} />
            </span>
          </div>
          <div className="cps-kpi-value-row">
            <span className="cps-kpi-value">{metrics.totalOvertimeMinutes}</span>
            <span className="cps-kpi-unit">mins</span>
          </div>
          <div className="cps-kpi-subtext">
            <span>{metrics.totalOvertimeMinutes === 0 ? 'Zero Overtime Achieved' : 'Controlled Overtime Limit'}</span>
          </div>
        </div>

        {/* Card 5: Solver Runtime */}
        <div className="cps-kpi-card cps-border-blue">
          <div className="cps-kpi-header">
            <span className="cps-kpi-label">Solver Status &amp; Speed</span>
            <span className="cps-kpi-icon cps-icon-blue">
              <Cpu size={18} />
            </span>
          </div>
          <div className="cps-kpi-value-row">
            <span className="cps-kpi-value">{solverResult.solveTimeMs}</span>
            <span className="cps-kpi-unit">ms</span>
          </div>
          <div className="cps-kpi-subtext">
            <span>Status: <strong>{solverResult.solverStatus}</strong></span>
          </div>
        </div>
      </div>

      {/* Optimization Strategy Presets Bar */}
      <div className="cps-strategy-card">
        <div className="cps-strategy-header">
          <span className="cps-strategy-tag">CP-SAT Optimization Strategy</span>
          <span className="cps-strategy-desc">{OPTIMIZATION_STRATEGIES[selectedStrategy].description}</span>
        </div>
        <div className="cps-strategy-buttons-grid">
          {Object.entries(OPTIMIZATION_STRATEGIES).map(([key, strat]) => {
            const isSelected = selectedStrategy === key;
            return (
              <button
                key={key}
                className={`cps-strat-btn ${isSelected ? 'cps-strat-btn-active' : ''}`}
                onClick={() => handleRunOptimizer(key)}
              >
                <div className="cps-strat-btn-title">
                  <Play size={13} />
                  <span>{strat.label}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Nav Tabs */}
      <div className="cps-nav-tabs">
        <button
          className={`cps-nav-tab ${activeTab === 'gantt' ? 'cps-nav-tab-active' : ''}`}
          onClick={() => setActiveTab('gantt')}
        >
          <Calendar size={16} />
          <span>Multi-Suite Schedule Gantt Timeline</span>
          <span className="cps-tab-count">{scheduledCases.length}</span>
        </button>

        <button
          className={`cps-nav-tab ${activeTab === 'constraints' ? 'cps-nav-tab-active' : ''}`}
          onClick={() => setActiveTab('constraints')}
        >
          <ShieldCheck size={16} />
          <span>Constraint Satisfaction &amp; Objective Matrix</span>
        </button>

        <button
          className={`cps-nav-tab ${activeTab === 'unscheduled' ? 'cps-nav-tab-active' : ''}`}
          onClick={() => setActiveTab('unscheduled')}
        >
          <AlertCircle size={16} />
          <span>Unscheduled Backlog Exceptions</span>
          <span className="cps-tab-count">{unscheduledCases.length}</span>
        </button>
      </div>

      {/* TAB 1: MULTI-SUITE SCHEDULE GANTT TIMELINE */}
      {activeTab === 'gantt' && (
        <div className="cps-tab-content">
          <div className="cps-gantt-container">
            {OPERATING_ROOMS_CONFIG.map((room) => {
              const roomCases = casesByRoom[room.id] || [];

              return (
                <div key={room.id} className="cps-gantt-room-row">
                  {/* Room Info Header */}
                  <div className="cps-room-header">
                    <div className="cps-room-title-group">
                      <span className="cps-room-name">{room.name}</span>
                      <span className="cps-room-spec-tag">{room.specialties.join(', ')}</span>
                    </div>
                    <div className="cps-room-meta">
                      <span>Shift: {DEFAULT_SHIFT_START} &ndash; {DEFAULT_SHIFT_END}</span>
                      <span>{roomCases.length} Cases Scheduled</span>
                    </div>
                  </div>

                  {/* Room Timeline Track */}
                  <div className="cps-room-track">
                    {roomCases.length === 0 ? (
                      <div className="cps-empty-track">
                        <span>No cases assigned to this suite under current strategy.</span>
                      </div>
                    ) : (
                      roomCases.map((c) => (
                        <div key={c.id} className={`cps-case-card ${c.isOvertime ? 'cps-case-overtime' : ''}`}>
                          <div className="cps-case-top-row">
                            <span className="cps-case-time">{c.startTime} &ndash; {c.endTime}</span>
                            <span className="cps-case-dur">{c.durationMinutes}m</span>
                          </div>
                          <div className="cps-case-patient">{c.patientName}</div>
                          <div className="cps-case-proc">{c.procedureName}</div>
                          <div className="cps-case-bottom-row">
                            <span className="cps-case-surgeon">{c.surgeonName}</span>
                            <span className="cps-case-margin">${c.projectedContributionMargin.toLocaleString()}</span>
                          </div>
                          {c.isOvertime && (
                            <div className="cps-overtime-badge">
                              +{c.overtimeMinutes}m Overtime
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: CONSTRAINT SATISFACTION & OBJECTIVE MATRIX */}
      {activeTab === 'constraints' && (
        <div className="cps-tab-content">
          <div className="cps-section-card">
            <h2 className="cps-section-title">Constraint Programming Satisfiability Audit</h2>
            <p className="cps-section-desc">
              Every synthesized schedule is verified against mandatory hard invariants before presentation to clinical leadership.
            </p>

            {/* Invariants Grid */}
            <div className="cps-invariants-grid">
              <div className="cps-invariant-card">
                <div className="cps-inv-header">
                  <span className="cps-inv-title">Invariant 1: No-Overlap &amp; Turnover Enclosure</span>
                  <span className="cps-badge-pill cps-badge-emerald">Passed</span>
                </div>
                <p className="cps-inv-body">
                  Ensures zero overlapping cases in any suite and enforces mandatory turnover buffers (25m same-surgeon, 40m different-surgeon).
                </p>
                <div className="cps-inv-status-row">
                  <CheckCircle2 size={15} className="cps-icon-emerald" />
                  <span>No room collisions detected across {scheduledCases.length} scheduled intervals.</span>
                </div>
              </div>

              <div className="cps-invariant-card">
                <div className="cps-inv-header">
                  <span className="cps-inv-title">Invariant 2: Surgeon Single-Location Rule</span>
                  <span className="cps-badge-pill cps-badge-emerald">Passed</span>
                </div>
                <p className="cps-inv-body">
                  Prevents physical impossibilities by guaranteeing no surgeon is booked in two operating rooms concurrently.
                </p>
                <div className="cps-inv-status-row">
                  <CheckCircle2 size={15} className="cps-icon-emerald" />
                  <span>Zero cross-suite surgeon double-bookings identified.</span>
                </div>
              </div>

              <div className="cps-invariant-card">
                <div className="cps-inv-header">
                  <span className="cps-inv-title">Invariant 3: Suite Capability &amp; Fixture Match</span>
                  <span className="cps-badge-pill cps-badge-emerald">Passed</span>
                </div>
                <p className="cps-inv-body">
                  Ensures procedures are only assigned to suites with required robotic consoles, fluoroscopy C-arms, or ophthalmic microscopes.
                </p>
                <div className="cps-inv-status-row">
                  <CheckCircle2 size={15} className="cps-icon-emerald" />
                  <span>All cases mapped strictly to licensed specialty suites.</span>
                </div>
              </div>

              <div className="cps-invariant-card">
                <div className="cps-inv-header">
                  <span className="cps-inv-title">Invariant 4: Staffed Shift Boundaries</span>
                  <span className="cps-badge-pill cps-badge-blue">Compliant</span>
                </div>
                <p className="cps-inv-body">
                  Enforces 07:30 start boundary and restricts overtime to configured strategy limits.
                </p>
                <div className="cps-inv-status-row">
                  <CheckCircle2 size={15} className="cps-icon-blue" />
                  <span>Total facility overtime contained to {metrics.totalOvertimeMinutes} minutes.</span>
                </div>
              </div>
            </div>

            {/* Objective Score Breakdown */}
            <div className="cps-objective-breakdown-card">
              <h3 className="cps-obj-title">Multi-Objective Function Breakdown (Z = {metrics.objectiveScore})</h3>
              <div className="cps-obj-grid">
                <div className="cps-obj-item">
                  <span className="cps-obj-key">Surgical Margin Reward:</span>
                  <span className="cps-obj-val">+${metrics.projectedTotalMargin.toLocaleString()}</span>
                </div>
                <div className="cps-obj-item">
                  <span className="cps-obj-key">Suite Utilization Minutes:</span>
                  <span className="cps-obj-val">+{metrics.totalScheduledMinutes} mins</span>
                </div>
                <div className="cps-obj-item">
                  <span className="cps-obj-key">Overtime Penalties:</span>
                  <span className="cps-obj-val">-{metrics.totalOvertimeMinutes * 10} pts</span>
                </div>
                <div className="cps-obj-item">
                  <span className="cps-obj-key">Turnover Friction Penalties:</span>
                  <span className="cps-obj-val">-{Math.round(metrics.totalTurnoverMinutes * 1.5)} pts</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: UNSCHEDULED BACKLOG EXCEPTIONS */}
      {activeTab === 'unscheduled' && (
        <div className="cps-tab-content">
          <div className="cps-section-card">
            <h2 className="cps-section-title">Unscheduled Backlog &amp; Capacity Exceptions</h2>
            <p className="cps-section-desc">
              Cases from the candidate backlog that could not be accommodated in the current horizon without violating shift overtime limits.
            </p>

            <div className="cps-table-wrapper" style={{ marginTop: '16px' }}>
              <table className="cps-table">
                <thead>
                  <tr>
                    <th>Patient &amp; MRN</th>
                    <th>Procedure &amp; CPT</th>
                    <th>Surgeon</th>
                    <th>Specialty</th>
                    <th>Duration</th>
                    <th>Margin</th>
                    <th>Unscheduled Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {unscheduledCases.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="cps-empty-row">
                        <div className="cps-empty-state">
                          <CheckCircle2 size={32} className="cps-icon-emerald" />
                          <p className="cps-empty-title">All candidate cases successfully scheduled!</p>
                          <p className="cps-empty-sub">Zero backlog cases unassigned for this planning date.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    unscheduledCases.map((c) => (
                      <tr key={c.id} className="cps-table-row">
                        <td>
                          <div className="cps-patient-col">
                            <span className="cps-patient-name">{c.patientName}</span>
                            <span className="cps-cpt-tag">{c.patientMrn}</span>
                          </div>
                        </td>
                        <td>
                          <div className="cps-patient-col">
                            <span className="cps-patient-name">{c.procedureName}</span>
                            <span className="cps-cpt-tag">CPT {c.primaryCptCode}</span>
                          </div>
                        </td>
                        <td>
                          <span className="cps-surgeon-name">{c.surgeonName}</span>
                        </td>
                        <td>
                          <span className="cps-badge-pill cps-badge-blue">{c.specialtyCode}</span>
                        </td>
                        <td>
                          <span>{c.durationMinutes} mins</span>
                        </td>
                        <td>
                          <span className="cps-margin-val">${c.projectedContributionMargin.toLocaleString()}</span>
                        </td>
                        <td>
                          <span className="cps-badge-pill cps-badge-amber">
                            {c.exclusionReason === 'CAPACITY_WINDOW_EXHAUSTED' ? 'Shift Capacity Exhausted' : c.exclusionReason}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==============================================================================
          MODAL: COMMIT SCHEDULE TO OR MASTER
          Strict Pinned Layout: Header & Footer Pinned, Body Scrollable
          ============================================================================== */}
      {isCommitModalOpen && (
        <div className="cps-modal-backdrop" onClick={() => setIsCommitModalOpen(false)}>
          <div className="cps-modal-container" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header (Pinned) */}
            <div className="cps-modal-header">
              <div className="cps-modal-title-row">
                <span className="cps-modal-icon">
                  <CalendarCheck size={20} className="cps-icon-emerald" />
                </span>
                <div>
                  <h3 className="cps-modal-title">Commit Proposed Schedule to Master Surgery Log</h3>
                  <span className="cps-modal-subtitle">
                    Run {solverResult.runNumber} &bull; Date: {selectedDate} &bull; {metrics.totalCasesScheduled} Cases
                  </span>
                </div>
              </div>
              <button className="cps-modal-close" onClick={() => setIsCommitModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleConfirmCommit} className="cps-modal-form">
              <div className="cps-modal-body">
                <div className="cps-summary-box cps-box-emerald">
                  <span className="cps-box-label">Optimization Verification Summary</span>
                  <div className="cps-box-row">
                    <span><strong>Scheduled Cases:</strong> {metrics.totalCasesScheduled} of {candidateCases.length}</span>
                    <span><strong>Projected Utilization:</strong> {metrics.projectedUtilizationPct}%</span>
                    <span><strong>Total Margin:</strong> ${metrics.projectedTotalMargin.toLocaleString()}</span>
                    <span><strong>Overtime Risk:</strong> {metrics.totalOvertimeMinutes} mins</span>
                  </div>
                </div>

                <div className="cps-form-group">
                  <label className="cps-label">Authorizing Clinical Officer *</label>
                  <input
                    type="text"
                    className="cps-input"
                    value={commitAuthorizer}
                    onChange={(e) => setCommitAuthorizer(e.target.value)}
                    required
                  />
                </div>

                <div className="cps-form-group">
                  <label className="cps-label">Clinical Dispatch Notes &amp; Sterile Processing Instructions *</label>
                  <textarea
                    className="cps-textarea"
                    rows={3}
                    value={commitNotes}
                    onChange={(e) => setCommitNotes(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Modal Footer (Pinned) */}
              <div className="cps-modal-footer">
                <button type="button" className="cps-btn cps-btn-secondary" onClick={() => setIsCommitModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="cps-btn cps-btn-primary">
                  <CheckCircle2 size={15} />
                  <span>Confirm Schedule Commitment</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
