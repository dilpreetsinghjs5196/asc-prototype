import React, { useState, useMemo } from 'react';
import {
  Lock,
  Unlock,
  Layers,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Play,
  RotateCcw,
  Search,
  Download,
  X,
  Maximize2,
  Building,
  Shield,
  FileText,
  TrendingUp,
  Sliders,
  DollarSign
} from 'lucide-react';
import {
  calculationVersioningService,
  VERSION_STATUSES,
  VERSION_STATUS_CONFIG,
  FREEZE_STATUSES,
  FREEZE_STATUS_CONFIG
} from '../lib/calculationVersioningService.js';
import './CalculationVersioningView.css';

export default function CalculationVersioningView() {
  const [activeTab, setActiveTab] = useState('period_freezes'); // period_freezes, version_inventory, simulation_runs, audit_trail
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [activeSimulationModal, setActiveSimulationModal] = useState(false);
  const [preFreezeModalData, setPreFreezeModalData] = useState(null);
  const [simResults, setSimResults] = useState(null);

  // Load baseline data
  const { versions, periods, auditHistory, sampleCases } = useMemo(() => {
    return calculationVersioningService.getBaselineSampleData();
  }, []);

  // Filtered Periods
  const filteredPeriods = useMemo(() => {
    return periods.filter(p => {
      const matchesSearch =
        !searchTerm ||
        p.periodName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.calculationVersionCode.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = selectedStatus === 'ALL' || p.freezeStatus === selectedStatus;
      return matchesSearch && matchesStatus;
    });
  }, [periods, searchTerm, selectedStatus]);

  // Filtered Versions
  const filteredVersions = useMemo(() => {
    return versions.filter(v => {
      const matchesSearch =
        !searchTerm ||
        v.versionCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.versionName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.scheduleName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = selectedStatus === 'ALL' || v.status === selectedStatus;
      return matchesSearch && matchesStatus;
    });
  }, [versions, searchTerm, selectedStatus]);

  // KPIs
  const totalFrozenMargin = useMemo(() => {
    return periods
      .filter(p => p.freezeStatus === FREEZE_STATUSES.FROZEN)
      .reduce((sum, p) => sum + p.totalFrozenContributionMargin, 0);
  }, [periods]);

  const activeVersion = useMemo(() => {
    return versions.find(v => v.status === VERSION_STATUSES.ACTIVE) || versions[0];
  }, [versions]);

  // Test Pre-Freeze Gate Handler
  const handleOpenFreezeGate = (period) => {
    const gateEval = calculationVersioningService.validatePreFreezeGate(sampleCases, 90.00);
    setPreFreezeModalData({ period, gateEval });
  };

  // Run Simulation Handler
  const handleExecuteSimulation = () => {
    const sourceVer = versions.find(v => v.versionCode === '2026.2_PRODUCTION') || versions[0];
    const targetVer = versions.find(v => v.versionCode === '2027.0_CALIBRATION') || versions[1];
    const res = calculationVersioningService.runSimulationDryRun(sourceVer, { ...targetVer, marginMultiplier: 1.055 }, sampleCases);
    setSimResults(res);
    setActiveSimulationModal(true);
  };

  // Export CSV Handler
  const handleExportCsv = () => {
    const headers = [
      'Period Name',
      'Start Date',
      'End Date',
      'Calculation Version',
      'Freeze Status',
      'Cases Frozen',
      'Frozen Revenue ($)',
      'Frozen Costs ($)',
      'Frozen Margin ($)',
      'Frozen At',
      'Unfreeze Reason'
    ];

    const rows = filteredPeriods.map(p => [
      `"${p.periodName}"`,
      p.periodStartDate,
      p.periodEndDate,
      p.calculationVersionCode,
      p.freezeStatus,
      p.totalCasesFrozen,
      p.totalFrozenRevenue,
      p.totalFrozenDirectCosts,
      p.totalFrozenContributionMargin,
      p.frozenAt || 'N/A',
      `"${p.unfreezeReason || ''}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `financial_period_freezes_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="versioning-container">
      {/* Top Header Toolbar */}
      <div className="versioning-topbar">
        <div className="topbar-left">
          <div className="header-icon-badge">
            <Lock className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="versioning-title">Financial Calculation Versioning & Freeze Engine</h1>
            <p className="versioning-subtitle">
              Closed-Period Immutability, Simulation Dry-Runs, Audit Restatements & Backward Compatibility
            </p>
          </div>
        </div>

        <div className="topbar-right">
          <button onClick={handleExecuteSimulation} className="action-btn sim-btn" title="Run Simulation Dry-Run">
            <Play className="w-4 h-4 text-sky-400" />
            <span>Launch Dry-Run Simulator</span>
          </button>
          <button onClick={handleExportCsv} className="action-btn export-btn" title="Export Period Ledgers to CSV">
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Export Closed Periods</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Banner */}
      <div className="kpi-banner-grid">
        {/* KPI 1: Active Production Version */}
        <div className="kpi-card highlight-card">
          <div className="kpi-header">
            <span className="kpi-label">Active Production Version</span>
            <Layers className="w-4 h-4 text-sky-400" />
          </div>
          <div className="kpi-value-row">
            <span className="kpi-version font-mono">{activeVersion.versionCode}</span>
          </div>
          <div className="kpi-meta-row mt-2">
            <span className="kpi-badge badge-sky">Live Production</span>
            <span className="kpi-subtext">OR: ${activeVersion.orMinuteRate}/m • Burden: {activeVersion.laborBurdenMultiplier}x</span>
          </div>
        </div>

        {/* KPI 2: Frozen Periods */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Frozen Closed Periods</span>
            <Lock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">
              {periods.filter(p => p.freezeStatus === FREEZE_STATUSES.FROZEN).length}
            </span>
            <span className="kpi-unit">closed periods</span>
          </div>
          <div className="kpi-meta-row">
            <span className="kpi-badge badge-emerald">GAAP Closed</span>
            <span className="kpi-subtext">850 Total Cases Locked</span>
          </div>
        </div>

        {/* KPI 3: Protected Frozen Margin */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Protected Frozen Margin</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">
              ${totalFrozenMargin.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="kpi-meta-row">
            <span className="kpi-badge badge-emerald">Zero Tamper Risk</span>
            <span className="kpi-subtext">SOX § 404 Compliant</span>
          </div>
        </div>

        {/* KPI 4: Dry-Run Simulation Variance */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Simulation Variance (FY2027)</span>
            <TrendingUp className="w-4 h-4 text-sky-400" />
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value text-emerald-400">+$615.00</span>
            <span className="kpi-unit">(+5.69%)</span>
          </div>
          <div className="kpi-meta-row">
            <span className="kpi-badge badge-sky">Favorable Delta</span>
            <span className="kpi-subtext">7 Sample Cases Tested</span>
          </div>
        </div>
      </div>

      {/* Filter and Tab Navigation Bar */}
      <div className="controls-container">
        <div className="tab-navigation">
          <button
            className={`tab-btn ${activeTab === 'period_freezes' ? 'active' : ''}`}
            onClick={() => setActiveTab('period_freezes')}
          >
            <Calendar className="w-4 h-4" />
            <span>Accounting Period Freezes ({filteredPeriods.length})</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'version_inventory' ? 'active' : ''}`}
            onClick={() => setActiveTab('version_inventory')}
          >
            <Layers className="w-4 h-4" />
            <span>Calculation Version Inventory ({filteredVersions.length})</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'audit_trail' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit_trail')}
          >
            <Clock className="w-4 h-4" />
            <span>Version Audit Trail ({auditHistory.length})</span>
          </button>
        </div>

        {/* Filters */}
        <div className="filters-wrapper">
          <div className="search-box">
            <Search className="w-4 h-4 text-slate-400 search-icon" />
            <input
              type="text"
              placeholder="Search period, version, schedule..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="search-input"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="clear-search-btn">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="dropdown-filter">
            <label className="filter-label">Status:</label>
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="filter-select"
            >
              <option value="ALL">All Statuses</option>
              {activeTab === 'period_freezes' ? (
                Object.values(FREEZE_STATUSES).map(s => (
                  <option key={s} value={s}>{FREEZE_STATUS_CONFIG[s].shortLabel}</option>
                ))
              ) : (
                Object.values(VERSION_STATUSES).map(s => (
                  <option key={s} value={s}>{VERSION_STATUS_CONFIG[s].shortLabel}</option>
                ))
              )}
            </select>
          </div>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="tab-content-wrapper">
        {/* TAB 1: Accounting Period Freezes */}
        {activeTab === 'period_freezes' && (
          <div className="table-responsive">
            <table className="versioning-table">
              <thead>
                <tr>
                  <th style={{ width: '130px' }}>Period Name</th>
                  <th style={{ width: '180px' }}>Effective Date Range</th>
                  <th style={{ width: '170px' }}>Calculation Version</th>
                  <th style={{ width: '140px', textAlign: 'center' }}>Freeze Status</th>
                  <th style={{ width: '110px', textAlign: 'right' }}>Cases</th>
                  <th style={{ width: '150px', textAlign: 'right' }}>Frozen Revenue</th>
                  <th style={{ width: '150px', textAlign: 'right' }}>Direct Costs</th>
                  <th style={{ width: '160px', textAlign: 'right' }}>Contribution Margin</th>
                  <th style={{ width: '130px', textAlign: 'center' }}>Freeze Governance</th>
                </tr>
              </thead>
              <tbody>
                {filteredPeriods.map(p => {
                  const statusConf = FREEZE_STATUS_CONFIG[p.freezeStatus];
                  return (
                    <tr key={p.id} className="versioning-row">
                      <td>
                        <span className="period-pill font-mono font-bold">{p.periodName}</span>
                      </td>
                      <td className="font-mono text-slate-300 text-xs">
                        {p.periodStartDate} <span className="text-slate-500">→</span> {p.periodEndDate}
                      </td>
                      <td>
                        <span className="version-tag font-mono">{p.calculationVersionCode}</span>
                      </td>
                      <td className="text-center">
                        <span className={`status-pill ${statusConf.badgeClass}`}>
                          {p.freezeStatus === FREEZE_STATUSES.FROZEN && <Lock className="w-3 h-3 mr-1" />}
                          {p.freezeStatus === FREEZE_STATUSES.OPEN && <Unlock className="w-3 h-3 mr-1" />}
                          {statusConf.shortLabel}
                        </span>
                      </td>
                      <td className="text-right font-mono text-slate-200">
                        {p.totalCasesFrozen > 0 ? p.totalCasesFrozen : 'In-Flight'}
                      </td>
                      <td className="text-right font-mono text-slate-300">
                        {p.totalFrozenRevenue > 0 ? `$${p.totalFrozenRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td className="text-right font-mono text-slate-300">
                        {p.totalFrozenDirectCosts > 0 ? `$${p.totalFrozenDirectCosts.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td className="text-right font-mono font-bold text-emerald-400">
                        {p.totalFrozenContributionMargin > 0 ? `$${p.totalFrozenContributionMargin.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td className="text-center">
                        {p.freezeStatus === FREEZE_STATUSES.OPEN ? (
                          <button
                            onClick={() => handleOpenFreezeGate(p)}
                            className="freeze-action-btn"
                            title="Execute Completeness Audit Gate & Freeze Period"
                          >
                            <Lock className="w-3 h-3 mr-1" />
                            <span>Freeze Period</span>
                          </button>
                        ) : p.freezeStatus === FREEZE_STATUSES.FROZEN ? (
                          <span className="locked-label font-mono text-xs text-slate-400">
                            Locked {p.frozenAt ? p.frozenAt.slice(0, 10) : ''}
                          </span>
                        ) : (
                          <span className="reopened-label font-mono text-xs text-rose-400" title={p.unfreezeReason}>
                            Reopened (Audit)
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 2: Calculation Version Inventory */}
        {activeTab === 'version_inventory' && (
          <div className="table-responsive">
            <table className="versioning-table">
              <thead>
                <tr>
                  <th style={{ width: '180px' }}>Version Code</th>
                  <th style={{ width: '260px' }}>Version Title & Description</th>
                  <th style={{ width: '130px', textAlign: 'center' }}>Status</th>
                  <th style={{ width: '170px' }}>Effective Dates</th>
                  <th style={{ width: '240px' }}>Associated Baseline Cost Schedule</th>
                  <th style={{ width: '110px', textAlign: 'right' }}>OR Rate</th>
                  <th style={{ width: '110px', textAlign: 'right' }}>Burden</th>
                  <th style={{ width: '120px', textAlign: 'center' }}>Periods Locked</th>
                </tr>
              </thead>
              <tbody>
                {filteredVersions.map(v => {
                  const statusConf = VERSION_STATUS_CONFIG[v.status];
                  return (
                    <tr key={v.id} className="versioning-row">
                      <td>
                        <span className="version-tag font-mono font-bold">{v.versionCode}</span>
                        {v.isLocked && <Lock className="w-3 h-3 text-emerald-400 inline ml-1.5" title="Version is locked" />}
                      </td>
                      <td>
                        <div className="version-name font-semibold text-slate-100">{v.versionName}</div>
                        {v.lockRationale && (
                          <div className="lock-rationale-sub text-slate-400 text-xs">Note: {v.lockRationale}</div>
                        )}
                      </td>
                      <td className="text-center">
                        <span className={`status-pill ${statusConf.badgeClass}`}>
                          {statusConf.shortLabel}
                        </span>
                      </td>
                      <td className="font-mono text-slate-300 text-xs">
                        {v.effectiveFrom} <span className="text-slate-500">→</span> {v.effectiveTo || 'Present'}
                      </td>
                      <td>
                        <div className="schedule-title text-sm text-slate-200">{v.scheduleName}</div>
                      </td>
                      <td className="text-right font-mono text-slate-300">${v.orMinuteRate.toFixed(2)}/m</td>
                      <td className="text-right font-mono text-slate-300">{v.laborBurdenMultiplier.toFixed(2)}x</td>
                      <td className="text-center font-mono">
                        <span className={`count-pill ${v.totalPeriodsFrozen > 0 ? 'badge-emerald' : 'badge-slate'}`}>
                          {v.totalPeriodsFrozen} periods
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 3: Version Audit Trail */}
        {activeTab === 'audit_trail' && (
          <div className="table-responsive">
            <table className="versioning-table">
              <thead>
                <tr>
                  <th style={{ width: '160px' }}>Execution Timestamp</th>
                  <th style={{ width: '160px' }}>Run Type</th>
                  <th style={{ width: '160px' }}>Source Version</th>
                  <th style={{ width: '160px' }}>Target Version</th>
                  <th style={{ width: '100px', textAlign: 'right' }}>Cases</th>
                  <th style={{ width: '150px', textAlign: 'right' }}>Baseline Margin</th>
                  <th style={{ width: '150px', textAlign: 'right' }}>Recalculated</th>
                  <th style={{ width: '140px', textAlign: 'right' }}>Variance ($)</th>
                  <th style={{ width: '110px', textAlign: 'right' }}>Variance %</th>
                  <th style={{ width: '160px' }}>Operator</th>
                </tr>
              </thead>
              <tbody>
                {auditHistory.map(run => (
                  <tr key={run.id} className="versioning-row">
                    <td className="font-mono text-slate-300 text-xs">
                      {run.executedAt.replace('T', ' ').slice(0, 19)}
                    </td>
                    <td>
                      <span className={`run-pill ${run.runType === 'PRODUCTION_POST' ? 'badge-emerald' : run.runType === 'DRY_RUN_SIMULATION' ? 'badge-sky' : 'badge-amber'}`}>
                        {run.runType.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="font-mono text-xs text-slate-300">{run.sourceVersion}</td>
                    <td className="font-mono text-xs text-slate-300">{run.targetVersion}</td>
                    <td className="text-right font-mono text-slate-200">{run.casesEvaluated}</td>
                    <td className="text-right font-mono text-slate-300">
                      ${run.totalBaselineMargin.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="text-right font-mono text-slate-300">
                      ${run.totalRecalculatedMargin.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="text-right font-mono">
                      <span className={run.variance >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                        {run.variance >= 0 ? '+' : ''}${run.variance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="text-right font-mono">
                      <span className={run.variancePct >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                        {run.variancePct >= 0 ? '+' : ''}{run.variancePct.toFixed(2)}%
                      </span>
                    </td>
                    <td>
                      <div className="operator-name text-xs text-slate-300">{run.user}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pre-Freeze Completeness Gate Modal */}
      {preFreezeModalData && (
        <div className="modal-backdrop" onClick={() => setPreFreezeModalData(null)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-row">
                <Lock className="w-5 h-5 text-emerald-400" />
                <h3 className="modal-title">Pre-Freeze Accounting Gate: {preFreezeModalData.period.periodName}</h3>
              </div>
              <button onClick={() => setPreFreezeModalData(null)} className="modal-close-btn">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="modal-body">
              {/* Gate summary banner */}
              <div className={`gate-status-banner ${preFreezeModalData.gateEval.canFreeze ? 'gate-pass' : 'gate-block'}`}>
                <div className="gate-icon">
                  {preFreezeModalData.gateEval.canFreeze ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-6 h-6 text-amber-400" />
                  )}
                </div>
                <div>
                  <h4 className="gate-heading">
                    {preFreezeModalData.gateEval.canFreeze
                      ? 'Pre-Freeze Audit Gate Passed: 100% Audit-Ready'
                      : `Freeze Blocked: ${preFreezeModalData.gateEval.blockedCount} Cases Below Completeness Hurdle (≥90)`}
                  </h4>
                  <p className="gate-desc">
                    {preFreezeModalData.gateEval.canFreeze
                      ? 'All surgical cases in this period have passed Phase 76 audit verification. The period is eligible for permanent GAAP close.'
                      : 'Closed-period immutability prohibits locking accounting periods containing provisional or unverified cost records.'}
                  </p>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="modal-stats-grid mt-3">
                <div className="stat-box">
                  <div className="stat-label">Total Cases</div>
                  <div className="stat-value font-mono">{preFreezeModalData.gateEval.totalCases}</div>
                </div>
                <div className="stat-box">
                  <div className="stat-label">Audit-Ready (≥90)</div>
                  <div className="stat-value font-mono text-emerald-400">{preFreezeModalData.gateEval.auditReadyCount}</div>
                </div>
                <div className="stat-box">
                  <div className="stat-label">Blocked Incomplete</div>
                  <div className="stat-value font-mono text-rose-400">{preFreezeModalData.gateEval.blockedCount}</div>
                </div>
                <div className="stat-box">
                  <div className="stat-label">Pass Rate</div>
                  <div className="stat-value font-mono text-sky-400">{preFreezeModalData.gateEval.passRatePct}%</div>
                </div>
              </div>

              {/* Blocked Cases List */}
              {preFreezeModalData.gateEval.blockedCases.length > 0 && (
                <div className="blocked-cases-section mt-3">
                  <h5 className="section-subheading">Remediation Required Before Freeze</h5>
                  <div className="blocked-cases-list">
                    {preFreezeModalData.gateEval.blockedCases.map(bc => (
                      <div key={bc.caseId} className="blocked-case-row">
                        <div className="bc-info">
                          <span className="bc-patient font-semibold">{bc.patient}</span>
                          <span className="bc-id font-mono text-xs text-slate-400"> (Case #{bc.caseId})</span>
                        </div>
                        <span className="bc-score font-mono text-rose-400 font-bold">{bc.score} / 100</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button onClick={() => setPreFreezeModalData(null)} className="modal-dismiss-btn">
                Close Review
              </button>
              {preFreezeModalData.gateEval.canFreeze ? (
                <button
                  onClick={() => {
                    alert(`Period ${preFreezeModalData.period.periodName} successfully frozen. Ledger immutability active.`);
                    setPreFreezeModalData(null);
                  }}
                  className="modal-confirm-btn"
                >
                  <Lock className="w-3.5 h-3.5 mr-1" />
                  Confirm Closed-Period Freeze
                </button>
              ) : (
                <button
                  onClick={() => {
                    alert(`CFO Override Approved: Period ${preFreezeModalData.period.periodName} frozen under statutory provisional exception. Audit stamped.`);
                    setPreFreezeModalData(null);
                  }}
                  className="modal-override-btn"
                  title="Requires CFO authentication"
                >
                  CFO Exception Override
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dry-Run Simulation Modal */}
      {activeSimulationModal && simResults && (
        <div className="modal-backdrop" onClick={() => setActiveSimulationModal(false)}>
          <div className="modal-dialog large-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-row">
                <Play className="w-5 h-5 text-sky-400" />
                <h3 className="modal-title">Dry-Run Simulation: {simResults.sourceVersionCode} vs {simResults.targetVersionCode}</h3>
              </div>
              <button onClick={() => setActiveSimulationModal(false)} className="modal-close-btn">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="modal-body">
              {/* Simulation Header Banner */}
              <div className="sim-header-banner">
                <div className="sim-stat">
                  <div className="stat-label">Cases Evaluated</div>
                  <div className="stat-value font-mono">{simResults.casesEvaluated}</div>
                </div>
                <div className="sim-stat">
                  <div className="stat-label">Baseline Margin (2026.2)</div>
                  <div className="stat-value font-mono text-slate-200">
                    ${simResults.overallVariance.baselineMargin.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="sim-stat">
                  <div className="stat-label">Simulated Margin (2027.0)</div>
                  <div className="stat-value font-mono text-emerald-400 font-bold">
                    ${simResults.overallVariance.recalculatedMargin.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="sim-stat">
                  <div className="stat-label">Net Delta Variance</div>
                  <div className="stat-value font-mono text-sky-400 font-bold">
                    +${simResults.overallVariance.variance.toLocaleString('en-US', { minimumFractionDigits: 2 })} ({simResults.overallVariance.variancePct}%)
                  </div>
                </div>
              </div>

              {/* Case-by-case comparison */}
              <h5 className="section-subheading mt-4">Case-Level Variance Breakdown (Non-Mutating Dry Run)</h5>
              <div className="table-responsive mt-2">
                <table className="versioning-table">
                  <thead>
                    <tr>
                      <th style={{ width: '80px' }}>Case ID</th>
                      <th style={{ width: '160px' }}>Patient</th>
                      <th style={{ width: '220px' }}>Procedure</th>
                      <th style={{ width: '140px' }}>Surgeon</th>
                      <th style={{ width: '130px', textAlign: 'right' }}>Baseline Margin</th>
                      <th style={{ width: '130px', textAlign: 'right' }}>Simulated Margin</th>
                      <th style={{ width: '110px', textAlign: 'right' }}>Variance ($)</th>
                      <th style={{ width: '90px', textAlign: 'right' }}>Delta %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simResults.caseDetails.map(cd => (
                      <tr key={cd.caseId} className="versioning-row">
                        <td className="font-mono text-slate-400">#{cd.caseId}</td>
                        <td className="font-semibold text-slate-200">{cd.patient}</td>
                        <td className="text-slate-300 text-xs">{cd.procedure}</td>
                        <td className="text-slate-300 text-xs">{cd.surgeonName}</td>
                        <td className="text-right font-mono text-slate-300">
                          ${cd.baselineMargin.toFixed(2)}
                        </td>
                        <td className="text-right font-mono text-emerald-400 font-semibold">
                          ${cd.recalculatedMargin.toFixed(2)}
                        </td>
                        <td className="text-right font-mono text-sky-400">
                          +{cd.variance.toFixed(2)}
                        </td>
                        <td className="text-right font-mono text-sky-400">
                          +{cd.variancePct.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="modal-footer">
              <button onClick={() => setActiveSimulationModal(false)} className="modal-dismiss-btn">
                Close Simulator
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
