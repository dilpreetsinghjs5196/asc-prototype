import React, { useState, useMemo } from 'react';
import {
  ShieldCheck,
  Clock,
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
  FileCheck,
  X,
  Zap,
  BarChart3
} from 'lucide-react';
import {
  ACCURACY_STATUSES,
  SCHEDULING_TENDENCIES,
  CALIBRATION_ACTIONS,
  DEFAULT_TOLERANCE_MINUTES,
  DEFAULT_OVERTIME_HOURLY_RATE,
  calculateDurationVariance,
  classifyAccuracyStatus,
  calculateMeanDurationBias,
  determineSchedulingTendency,
  calculateOverrunLaborCost,
  calculateFacilityAccuracyKpis,
  filterBookingAccuracyLogs,
  SEED_BOOKING_ACCURACY_LOGS,
  SEED_SURGEON_BOOKING_PROFILES,
  SEED_CPT_CALIBRATION_BENCHMARKS
} from '../services/bookingAccuracyService';
import './BookingAccuracyView.css';

export default function BookingAccuracyView() {
  const [activeSubTab, setActiveSubTab] = useState('ledger'); // 'ledger', 'tendency', 'benchmarks'
  const [caseLogs, setCaseLogs] = useState(SEED_BOOKING_ACCURACY_LOGS);
  const [surgeonProfiles, setSurgeonProfiles] = useState(SEED_SURGEON_BOOKING_PROFILES);
  const [cptBenchmarks, setCptBenchmarks] = useState(SEED_CPT_CALIBRATION_BENCHMARKS);
  const [toastMessage, setToastMessage] = useState(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [specialtyFilter, setSpecialtyFilter] = useState('ALL');
  const [surgeonFilter, setSurgeonFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal State: Calibration Review
  const [showCalibrationModal, setShowCalibrationModal] = useState(false);
  const [selectedSurgeonProfile, setSelectedSurgeonProfile] = useState(null);
  const [modalFormData, setModalFormData] = useState({
    calibrationAction: 'MANDATORY_CPT_MEDIAN',
    clinicalJustification: ''
  });

  const showToast = (text) => {
    setToastMessage(text);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Facility-wide aggregated KPIs
  const kpis = useMemo(() => {
    return calculateFacilityAccuracyKpis(caseLogs, surgeonProfiles);
  }, [caseLogs, surgeonProfiles]);

  // Unique lists for filter dropdowns
  const availableSpecialties = useMemo(() => {
    const set = new Set(caseLogs.map(l => l.specialtyCode));
    return Array.from(set).sort();
  }, [caseLogs]);

  const availableSurgeons = useMemo(() => {
    const set = new Set(caseLogs.map(l => l.surgeonName));
    return Array.from(set).sort();
  }, [caseLogs]);

  // Filtered Case Logs
  const filteredCaseLogs = useMemo(() => {
    return filterBookingAccuracyLogs(caseLogs, {
      searchQuery: searchTerm,
      specialty: specialtyFilter,
      surgeon: surgeonFilter,
      accuracyStatus: statusFilter
    });
  }, [caseLogs, searchTerm, specialtyFilter, surgeonFilter, statusFilter]);

  // Handle open calibration modal
  const handleOpenCalibrationModal = (profile) => {
    setSelectedSurgeonProfile(profile);
    setModalFormData({
      calibrationAction: profile.calibrationAction || 'MANDATORY_CPT_MEDIAN',
      clinicalJustification: profile.clinicalJustification || ''
    });
    setShowCalibrationModal(true);
  };

  // Handle save calibration profile
  const handleSaveCalibration = (e) => {
    e.preventDefault();
    if (!selectedSurgeonProfile) return;

    setSurgeonProfiles(prev =>
      prev.map(p => {
        if (p.id === selectedSurgeonProfile.id) {
          return {
            ...p,
            calibrationAction: modalFormData.calibrationAction,
            clinicalJustification: modalFormData.clinicalJustification,
            lastReviewedAt: new Date().toISOString()
          };
        }
        return p;
      })
    );

    showToast(`Successfully updated calibration profile for ${selectedSurgeonProfile.surgeonName}`);
    setShowCalibrationModal(false);
    setSelectedSurgeonProfile(null);
  };

  // Quick apply CPT template benchmark calibration
  const handleApplyCptCalibration = (cptItem) => {
    showToast(`CPT ${cptItem.cptCode} duration template updated to ${cptItem.historical20CaseMedianMinutes}m (${cptItem.recommendation})`);
  };

  return (
    <div className="bacc-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="bacc-toast">
          <CheckCircle2 size={18} className="bacc-toast-icon" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bacc-header-banner">
        <div className="bacc-header-main">
          <div className="bacc-header-title-row">
            <h1 className="bacc-title">Case Booking Accuracy & Duration Calibration</h1>
            <span className="bacc-badge bacc-badge-neutral">Phase A6 • Module 10</span>
          </div>
          <p className="bacc-subtitle">
            Deterministic booked vs actual duration analytics, surgeon duration bias classification, cascading downstream delay mitigation, and historical 20-case CPT median calibration.
          </p>
        </div>
        <div className="bacc-header-actions">
          <button 
            type="button" 
            className="bacc-btn bacc-btn-secondary"
            onClick={() => {
              setCaseLogs(SEED_BOOKING_ACCURACY_LOGS);
              setSurgeonProfiles(SEED_SURGEON_BOOKING_PROFILES);
              showToast('Data reset to baseline clinical seeds.');
            }}
          >
            <RefreshCw size={14} />
            <span>Reset Baseline</span>
          </button>
        </div>
      </div>

      {/* 5-Card Operational Ribbon */}
      <div className="bacc-kpi-grid">
        <div className="bacc-kpi-card">
          <div className="bacc-kpi-header">
            <span className="bacc-kpi-label">Overall Booking Accuracy</span>
            <span className="bacc-kpi-icon-wrap bg-blue-light">
              <CheckCircle2 size={16} className="text-blue" />
            </span>
          </div>
          <div className="bacc-kpi-value-row">
            <span className="bacc-kpi-value">{kpis.overallAccuracyRatePct}%</span>
            <span className={`bacc-pill ${kpis.overallAccuracyRatePct >= 75 ? 'bacc-pill-emerald' : 'bacc-pill-amber'}`}>
              Target &ge; 75%
            </span>
          </div>
          <div className="bacc-kpi-footer">
            <span>{kpis.accurateCases} of {kpis.totalCases} cases within &plusmn;15 min tolerance</span>
          </div>
        </div>

        <div className="bacc-kpi-card">
          <div className="bacc-kpi-header">
            <span className="bacc-kpi-label">Mean Duration Bias (MDB)</span>
            <span className="bacc-kpi-icon-wrap bg-amber-light">
              <TrendingUp size={16} className="text-amber" />
            </span>
          </div>
          <div className="bacc-kpi-value-row">
            <span className="bacc-kpi-value">
              {kpis.meanDurationBiasMinutes > 0 ? `+${kpis.meanDurationBiasMinutes}` : kpis.meanDurationBiasMinutes} m
            </span>
            <span className={`bacc-pill ${Math.abs(kpis.meanDurationBiasMinutes) <= 10 ? 'bacc-pill-emerald' : 'bacc-pill-crimson'}`}>
              {kpis.meanDurationBiasMinutes > 10 ? 'Optimism Bias' : kpis.meanDurationBiasMinutes < -10 ? 'Padding Bias' : 'Calibrated'}
            </span>
          </div>
          <div className="bacc-kpi-footer">
            <span>Facility average (Actual &minus; Scheduled duration)</span>
          </div>
        </div>

        <div className="bacc-kpi-card">
          <div className="bacc-kpi-header">
            <span className="bacc-kpi-label">Downstream Schedule Delays</span>
            <span className="bacc-kpi-icon-wrap bg-crimson-light">
              <Clock size={16} className="text-crimson" />
            </span>
          </div>
          <div className="bacc-kpi-value-row">
            <span className="bacc-kpi-value">{kpis.totalDownstreamDelayMinutes} m</span>
            <span className="bacc-pill bacc-pill-crimson">
              {kpis.underEstimatedCases} overrun cases
            </span>
          </div>
          <div className="bacc-kpi-footer">
            <span>Cascading delay forced onto following patients & suites</span>
          </div>
        </div>

        <div className="bacc-kpi-card">
          <div className="bacc-kpi-header">
            <span className="bacc-kpi-label">Defensive Padding Wastage</span>
            <span className="bacc-kpi-icon-wrap bg-amber-light">
              <Layers size={16} className="text-amber" />
            </span>
          </div>
          <div className="bacc-kpi-value-row">
            <span className="bacc-kpi-value">{kpis.totalIdleGapHours} hrs</span>
            <span className="bacc-pill bacc-pill-amber">
              {kpis.overEstimatedCases} underrun cases
            </span>
          </div>
          <div className="bacc-kpi-footer">
            <span>Unusable prime-time OR capacity stranded by padding</span>
          </div>
        </div>

        <div className="bacc-kpi-card">
          <div className="bacc-kpi-header">
            <span className="bacc-kpi-label">Overtime Labor Impact</span>
            <span className="bacc-kpi-icon-wrap bg-emerald-light">
              <DollarSign size={16} className="text-emerald" />
            </span>
          </div>
          <div className="bacc-kpi-value-row">
            <span className="bacc-kpi-value">${kpis.totalOvertimeLaborCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            <span className="bacc-pill bacc-pill-neutral">@ $450/hr</span>
          </div>
          <div className="bacc-kpi-footer">
            <span>{kpis.totalOvertimeMinutes} overtime minutes past staffed windows</span>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="bacc-subtabs-bar">
        <button
          type="button"
          className={`bacc-subtab-btn ${activeSubTab === 'ledger' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('ledger')}
        >
          <BarChart3 size={15} />
          <span>Case Booking Accuracy Ledger</span>
          <span className="bacc-subtab-badge">{caseLogs.length}</span>
        </button>

        <button
          type="button"
          className={`bacc-subtab-btn ${activeSubTab === 'tendency' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('tendency')}
        >
          <UserCheck size={15} />
          <span>Surgeon Booking Tendency Matrix</span>
          <span className="bacc-subtab-badge">{surgeonProfiles.length}</span>
        </button>

        <button
          type="button"
          className={`bacc-subtab-btn ${activeSubTab === 'benchmarks' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('benchmarks')}
        >
          <Award size={15} />
          <span>CPT Duration Calibration Benchmarks</span>
          <span className="bacc-subtab-badge">{cptBenchmarks.length}</span>
        </button>
      </div>

      {/* SUB-VIEW 1: CASE BOOKING ACCURACY LEDGER */}
      {activeSubTab === 'ledger' && (
        <div className="bacc-view-section">
          {/* Filter Bar */}
          <div className="bacc-filter-bar">
            <div className="bacc-search-box">
              <Search size={15} className="bacc-search-icon" />
              <input
                type="text"
                placeholder="Search case ID, surgeon, CPT code, procedure..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bacc-search-input"
              />
              {searchTerm && (
                <button type="button" onClick={() => setSearchTerm('')} className="bacc-clear-search">
                  <X size={13} />
                </button>
              )}
            </div>

            <div className="bacc-filter-group">
              <label className="bacc-filter-label">Specialty:</label>
              <select
                value={specialtyFilter}
                onChange={(e) => setSpecialtyFilter(e.target.value)}
                className="bacc-select"
              >
                <option value="ALL">All Specialties</option>
                {availableSpecialties.map(spec => (
                  <option key={spec} value={spec}>{spec.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>

            <div className="bacc-filter-group">
              <label className="bacc-filter-label">Surgeon:</label>
              <select
                value={surgeonFilter}
                onChange={(e) => setSurgeonFilter(e.target.value)}
                className="bacc-select"
              >
                <option value="ALL">All Surgeons</option>
                {availableSurgeons.map(surg => (
                  <option key={surg} value={surg}>{surg}</option>
                ))}
              </select>
            </div>

            <div className="bacc-filter-group">
              <label className="bacc-filter-label">Accuracy Status:</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bacc-select"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACCURATE">Accurate (&plusmn;15m)</option>
                <option value="UNDER_ESTIMATED">Under-Estimated (Overrun)</option>
                <option value="OVER_ESTIMATED">Over-Estimated (Underrun)</option>
              </select>
            </div>

            {(searchTerm || specialtyFilter !== 'ALL' || surgeonFilter !== 'ALL' || statusFilter !== 'ALL') && (
              <button
                type="button"
                className="bacc-btn bacc-btn-ghost"
                onClick={() => {
                  setSearchTerm('');
                  setSpecialtyFilter('ALL');
                  setSurgeonFilter('ALL');
                  setStatusFilter('ALL');
                }}
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* Ledger Table */}
          <div className="bacc-card bacc-table-card">
            <div className="bacc-card-header">
              <div className="bacc-card-title-group">
                <h3 className="bacc-card-title">Case Duration Variance Ledger</h3>
                <span className="bacc-card-hint">
                  Detailed comparison of scheduled vs actual surgical durations. Tolerance window: &plusmn;15 minutes.
                </span>
              </div>
              <span className="bacc-table-count">Showing {filteredCaseLogs.length} cases</span>
            </div>

            <div className="bacc-table-responsive">
              <table className="bacc-table">
                <thead>
                  <tr>
                    <th>Case ID / Date</th>
                    <th>Operating Room</th>
                    <th>Surgeon &amp; Specialty</th>
                    <th>CPT &amp; Procedure</th>
                    <th className="text-right">Scheduled</th>
                    <th className="text-right">Actual</th>
                    <th className="text-center">Variance (&Delta;D)</th>
                    <th className="text-center">Accuracy Status</th>
                    <th className="text-right">Delay Generated</th>
                    <th className="text-right">Overtime Labor</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCaseLogs.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="bacc-empty-cell">
                        <AlertCircle size={24} className="text-muted" />
                        <p>No surgical cases match the selected filter criteria.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredCaseLogs.map((log) => {
                      const statusDef = ACCURACY_STATUSES[log.accuracyStatus] || ACCURACY_STATUSES.ACCURATE;
                      const isOverrun = log.durationVarianceMinutes > 15;
                      const isUnderrun = log.durationVarianceMinutes < -15;

                      return (
                        <tr key={log.id} className="bacc-table-row">
                          <td>
                            <div className="bacc-cell-strong">{log.caseId}</div>
                            <div className="bacc-cell-sub">{log.surgeryDate}</div>
                          </td>
                          <td>
                            <div className="bacc-room-badge">{log.roomName}</div>
                          </td>
                          <td>
                            <div className="bacc-cell-strong">{log.surgeonName}</div>
                            <div className="bacc-cell-sub">{log.specialtyCode.replace(/_/g, ' ')}</div>
                          </td>
                          <td>
                            <div className="bacc-cpt-pill">CPT {log.primaryCptCode}</div>
                            <div className="bacc-cell-proc" title={log.procedureName}>{log.procedureName}</div>
                          </td>
                          <td className="text-right font-mono">
                            {log.scheduledDurationMinutes} m
                          </td>
                          <td className="text-right font-mono font-bold">
                            {log.actualInRoomMinutes} m
                          </td>
                          <td className="text-center font-mono">
                            <span className={`bacc-variance-tag ${isOverrun ? 'tag-crimson' : isUnderrun ? 'tag-amber' : 'tag-emerald'}`}>
                              {log.durationVarianceMinutes > 0 ? `+${log.durationVarianceMinutes}` : log.durationVarianceMinutes} m
                              <span className="bacc-variance-pct">({log.variancePct > 0 ? `+${log.variancePct}` : log.variancePct}%)</span>
                            </span>
                          </td>
                          <td className="text-center">
                            <span className={`bacc-badge ${statusDef.badgeClass}`}>
                              {statusDef.label}
                            </span>
                          </td>
                          <td className="text-right font-mono">
                            {log.downstreamDelayMinutes > 0 ? (
                              <span className="text-crimson font-bold">+{log.downstreamDelayMinutes} m</span>
                            ) : (
                              <span className="text-muted">0 m</span>
                            )}
                          </td>
                          <td className="text-right font-mono">
                            {log.financialLaborImpact > 0 ? (
                              <span className="text-crimson font-bold">
                                ${log.financialLaborImpact.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-muted">$0.00</span>
                            )}
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

      {/* SUB-VIEW 2: SURGEON BOOKING TENDENCY MATRIX */}
      {activeSubTab === 'tendency' && (
        <div className="bacc-view-section">
          {/* Methodological Context Box */}
          <div className="bacc-alert-info">
            <Info size={18} className="bacc-alert-icon" />
            <div className="bacc-alert-content">
              <strong>Mean Duration Bias (MDB) &amp; Scheduling Tendency Index</strong>
              <p>
                MDB is calculated as the average duration variance (Actual In-Room Minutes &minus; Scheduled Minutes) over evaluated cases.
                Surgeons with MDB &gt; +10.0m exhibit optimism bias (Chronic Under-Bookers), leading to cascading delays. Surgeons with MDB &lt; &minus;10.0m exhibit defensive padding (Chronic Padders), stranding OR capacity.
              </p>
            </div>
          </div>

          <div className="bacc-card bacc-table-card">
            <div className="bacc-card-header">
              <div className="bacc-card-title-group">
                <h3 className="bacc-card-title">Surgeon Scheduling Tendency &amp; Calibration Leaderboard</h3>
                <span className="bacc-card-hint">
                  Identifies behavioral duration patterns, total schedule overrun impact, and recommended template calibration actions.
                </span>
              </div>
              <span className="bacc-table-count">{surgeonProfiles.length} Surgeons Profiled</span>
            </div>

            <div className="bacc-table-responsive">
              <table className="bacc-table">
                <thead>
                  <tr>
                    <th>Surgeon Name</th>
                    <th>Specialty</th>
                    <th className="text-right">Cases Evaluated</th>
                    <th className="text-right">Accuracy Rate</th>
                    <th className="text-center">Mean Duration Bias (MDB)</th>
                    <th className="text-center">Scheduling Tendency</th>
                    <th className="text-right">Total Overrun</th>
                    <th className="text-right">Stranded Idle Gap</th>
                    <th className="text-right">Net Financial Impact</th>
                    <th>Recommended Calibration</th>
                    <th className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {surgeonProfiles.map((profile) => {
                    const tendencyDef = SCHEDULING_TENDENCIES[profile.schedulingTendency] || SCHEDULING_TENDENCIES.CALIBRATED;
                    const actionDef = CALIBRATION_ACTIONS[profile.calibrationAction] || CALIBRATION_ACTIONS.MAINTAIN;

                    return (
                      <tr key={profile.id} className="bacc-table-row">
                        <td>
                          <div className="bacc-cell-strong">{profile.surgeonName}</div>
                          <div className="bacc-cell-sub">
                            {profile.lastReviewedAt ? `Reviewed ${profile.lastReviewedAt.slice(0, 10)}` : 'Not yet calibrated'}
                          </div>
                        </td>
                        <td>
                          <span className="bacc-tag-subtle">{profile.specialtyCode.replace(/_/g, ' ')}</span>
                        </td>
                        <td className="text-right font-mono">
                          {profile.evaluatedCasesCount}
                        </td>
                        <td className="text-right font-mono font-bold">
                          <span className={profile.overallAccuracyRatePct >= 75 ? 'text-emerald' : 'text-crimson'}>
                            {profile.overallAccuracyRatePct}%
                          </span>
                        </td>
                        <td className="text-center font-mono">
                          <span className={`bacc-pill ${Math.abs(profile.meanDurationBiasMinutes) <= 10 ? 'bacc-pill-emerald' : profile.meanDurationBiasMinutes > 10 ? 'bacc-pill-crimson' : 'bacc-pill-amber'}`}>
                            {profile.meanDurationBiasMinutes > 0 ? `+${profile.meanDurationBiasMinutes}` : profile.meanDurationBiasMinutes} m
                          </span>
                        </td>
                        <td className="text-center">
                          <span className={`bacc-badge ${tendencyDef.badgeClass}`}>
                            {tendencyDef.label}
                          </span>
                        </td>
                        <td className="text-right font-mono">
                          {profile.totalOverrunMinutes > 0 ? (
                            <span className="text-crimson font-bold">+{profile.totalOverrunMinutes} m</span>
                          ) : (
                            <span className="text-muted">0 m</span>
                          )}
                        </td>
                        <td className="text-right font-mono">
                          {profile.totalIdleGapMinutes > 0 ? (
                            <span className="text-amber font-bold">{profile.totalIdleGapMinutes} m</span>
                          ) : (
                            <span className="text-muted">0 m</span>
                          )}
                        </td>
                        <td className="text-right font-mono font-bold">
                          ${profile.netFinancialDelayImpact.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td>
                          <span className={`bacc-action-tag ${actionDef.badgeClass}`}>
                            {actionDef.label}
                          </span>
                        </td>
                        <td className="text-center">
                          <button
                            type="button"
                            className="bacc-btn bacc-btn-primary bacc-btn-xs"
                            onClick={() => handleOpenCalibrationModal(profile)}
                          >
                            <Sliders size={12} />
                            <span>Calibrate</span>
                          </button>
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

      {/* SUB-VIEW 3: CPT DURATION CALIBRATION BENCHMARKS */}
      {activeSubTab === 'benchmarks' && (
        <div className="bacc-view-section">
          {/* Methodological Context Box */}
          <div className="bacc-alert-info">
            <Award size={18} className="bacc-alert-icon" />
            <div className="bacc-alert-content">
              <strong>Historical 20-Case CPT Duration Benchmark Rule</strong>
              <p>
                Rule 4: Recommended booking duration equals the median of the surgeon's last 20 actual in-room durations for each specific CPT code.
                If scheduled minutes deviate by &gt; 20 minutes from the 20-case median, an automated intake calibration warning is triggered.
              </p>
            </div>
          </div>

          <div className="bacc-card bacc-table-card">
            <div className="bacc-card-header">
              <div className="bacc-card-title-group">
                <h3 className="bacc-card-title">CPT Procedure Duration Benchmarks vs Scheduled Templates</h3>
                <span className="bacc-card-hint">
                  Procedure-level variance between current scheduling intake duration and historical 20-case median actuals.
                </span>
              </div>
              <span className="bacc-table-count">{cptBenchmarks.length} CPT Procedures Analyzed</span>
            </div>

            <div className="bacc-table-responsive">
              <table className="bacc-table">
                <thead>
                  <tr>
                    <th>CPT Code</th>
                    <th>Procedure Description</th>
                    <th>Specialty</th>
                    <th className="text-right">Standard Booked</th>
                    <th className="text-right">Historical 20-Case Median</th>
                    <th className="text-center">Discrepancy (&Delta;)</th>
                    <th className="text-center">Benchmark Status</th>
                    <th>Intake Recommendation</th>
                    <th className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {cptBenchmarks.map((cpt) => {
                    const hasWarning = cpt.warningStatus === 'DURATION_DISCREPANCY_WARNING';

                    return (
                      <tr key={cpt.cptCode} className="bacc-table-row">
                        <td>
                          <span className="bacc-cpt-pill font-mono font-bold">{cpt.cptCode}</span>
                        </td>
                        <td>
                          <div className="bacc-cell-strong">{cpt.procedureName}</div>
                        </td>
                        <td>
                          <span className="bacc-tag-subtle">{cpt.specialtyCode.replace(/_/g, ' ')}</span>
                        </td>
                        <td className="text-right font-mono">
                          {cpt.standardBookedMinutes} m
                        </td>
                        <td className="text-right font-mono font-bold">
                          {cpt.historical20CaseMedianMinutes} m
                        </td>
                        <td className="text-center font-mono">
                          <span className={`bacc-variance-tag ${cpt.discrepancyMinutes > 15 ? 'tag-crimson' : cpt.discrepancyMinutes < -15 ? 'tag-amber' : 'tag-emerald'}`}>
                            {cpt.discrepancyMinutes > 0 ? `+${cpt.discrepancyMinutes}` : cpt.discrepancyMinutes} m
                          </span>
                        </td>
                        <td className="text-center">
                          {hasWarning ? (
                            <span className="bacc-badge badge-crimson">
                              Discrepancy Warning (&gt;20m)
                            </span>
                          ) : (
                            <span className="bacc-badge badge-emerald">
                              Calibrated (&le;20m)
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="bacc-rec-text">{cpt.recommendation}</div>
                        </td>
                        <td className="text-center">
                          <button
                            type="button"
                            className="bacc-btn bacc-btn-secondary bacc-btn-xs"
                            onClick={() => handleApplyCptCalibration(cpt)}
                          >
                            <FileCheck size={12} />
                            <span>Apply Rule</span>
                          </button>
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

      {/* CALIBRATION REVIEW MODAL */}
      {showCalibrationModal && selectedSurgeonProfile && (
        <div className="bacc-modal-overlay" onClick={() => setShowCalibrationModal(false)}>
          <div className="bacc-modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="bacc-modal-header">
              <div className="bacc-modal-title-row">
                <Sliders size={20} className="text-blue" />
                <h2 className="bacc-modal-title">Surgeon Duration Calibration Review</h2>
              </div>
              <button
                type="button"
                className="bacc-modal-close-btn"
                onClick={() => setShowCalibrationModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCalibration} className="bacc-modal-form">
              <div className="bacc-modal-body">
                {/* Profile Overview Card */}
                <div className="bacc-modal-summary-card">
                  <div className="bacc-summary-row">
                    <span className="bacc-summary-label">Surgeon:</span>
                    <strong className="bacc-summary-val">{selectedSurgeonProfile.surgeonName}</strong>
                  </div>
                  <div className="bacc-summary-row">
                    <span className="bacc-summary-label">Specialty:</span>
                    <span className="bacc-summary-val">{selectedSurgeonProfile.specialtyCode.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="bacc-summary-row">
                    <span className="bacc-summary-label">Accuracy Rate:</span>
                    <strong className={`bacc-summary-val ${selectedSurgeonProfile.overallAccuracyRatePct >= 75 ? 'text-emerald' : 'text-crimson'}`}>
                      {selectedSurgeonProfile.overallAccuracyRatePct}%
                    </strong>
                  </div>
                  <div className="bacc-summary-row">
                    <span className="bacc-summary-label">Mean Duration Bias (MDB):</span>
                    <strong className="bacc-summary-val">
                      {selectedSurgeonProfile.meanDurationBiasMinutes > 0 ? `+${selectedSurgeonProfile.meanDurationBiasMinutes}` : selectedSurgeonProfile.meanDurationBiasMinutes} min
                    </strong>
                  </div>
                  <div className="bacc-summary-row">
                    <span className="bacc-summary-label">Scheduling Tendency:</span>
                    <span className="bacc-summary-val">
                      {SCHEDULING_TENDENCIES[selectedSurgeonProfile.schedulingTendency]?.label}
                    </span>
                  </div>
                </div>

                {/* Calibration Action Selector */}
                <div className="bacc-form-group">
                  <label className="bacc-form-label">
                    Calibration Governance Action <span className="text-crimson">*</span>
                  </label>
                  <select
                    className="bacc-form-select"
                    value={modalFormData.calibrationAction}
                    onChange={(e) => setModalFormData({ ...modalFormData, calibrationAction: e.target.value })}
                  >
                    <option value="MANDATORY_CPT_MEDIAN">Enforce Historical CPT Median (Mandatory Baseline)</option>
                    <option value="EXTEND_DEFAULT_TEMPLATE">Extend Default Template (+15 minutes)</option>
                    <option value="SHRINK_DEFAULT_TEMPLATE">Shrink Default Template (-15 minutes)</option>
                    <option value="MAINTAIN">Maintain Current Booking Profile</option>
                  </select>
                  <span className="bacc-form-hint">
                    {CALIBRATION_ACTIONS[modalFormData.calibrationAction]?.description}
                  </span>
                </div>

                {/* Clinical Justification */}
                <div className="bacc-form-group">
                  <label className="bacc-form-label">
                    Executive / Clinical Governance Justification <span className="text-crimson">*</span>
                  </label>
                  <textarea
                    rows={4}
                    className="bacc-form-textarea"
                    placeholder="Document clinical rationale, e.g., Surgeon arthroscopy cases consistently overrun scheduled times by 20m, causing cascading room delays. Enforcing 20-case median actuals will protect prime-time turnover."
                    value={modalFormData.clinicalJustification}
                    onChange={(e) => setModalFormData({ ...modalFormData, clinicalJustification: e.target.value })}
                    required
                  />
                </div>
              </div>

              {/* Pinned Modal Footer */}
              <div className="bacc-modal-footer">
                <button
                  type="button"
                  className="bacc-btn bacc-btn-secondary"
                  onClick={() => setShowCalibrationModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bacc-btn bacc-btn-primary"
                >
                  <CheckCircle2 size={15} />
                  <span>Save Calibration Profile</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

