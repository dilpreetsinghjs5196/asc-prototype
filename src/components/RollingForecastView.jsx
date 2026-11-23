import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  Calendar,
  Layers,
  Sliders,
  Download,
  CheckCircle,
  AlertCircle,
  Lock,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  X,
  Clock,
  Activity,
  FileSpreadsheet,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import {
  getRollingForecastMatrix,
  getRollingForecastTelemetry,
  approveAndFreezeRollingForecast,
  FORECAST_METHODS,
  SCENARIOS,
  HORIZON_TYPES,
  FACILITY_CAPACITY_CONSTRAINTS
} from '../services/rollingForecastService';
import './RollingForecastView.css';

export default function RollingForecastView({ activeFacility = 'fac-naples-01' }) {
  const [activeScenario, setActiveScenario] = useState(SCENARIOS.BASELINE);
  const [activeHorizon, setActiveHorizon] = useState(HORIZON_TYPES.TWELVE_MONTH);
  const [activeMethod, setActiveMethod] = useState(FORECAST_METHODS.BLENDED_COMPOSITE);
  const [showDrawer, setShowDrawer] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState({});
  const [freezeNotice, setFreezeNotice] = useState(null);

  // Load telemetry and matrix
  const telemetry = useMemo(() => {
    return getRollingForecastTelemetry(activeFacility, 'RF2026_12M_BASE', activeScenario);
  }, [activeFacility, activeScenario]);

  const matrix = useMemo(() => {
    return getRollingForecastMatrix(activeFacility, 'RF2026_12M_BASE', activeScenario, activeHorizon);
  }, [activeFacility, activeScenario, activeHorizon]);

  const toggleSection = (sectionKey) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  const handleApproveAndFreeze = () => {
    try {
      const res = approveAndFreezeRollingForecast('RF2026_12M_BASE', '00000000-0000-0000-0000-000000000001');
      setFreezeNotice(`Cryptographically sealed active projection with SHA-256: ${res.frozenHash.slice(0, 16)}...`);
      setTimeout(() => setFreezeNotice(null), 6000);
    } catch (err) {
      console.error('Freeze error:', err);
    }
  };

  const formatCurrency = (val) => {
    if (val === undefined || val === null) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(val);
  };

  const formatNumber = (val) => {
    if (val === undefined || val === null) return '0';
    return new Intl.NumberFormat('en-US').format(val);
  };

  // Financial row grouping for statement display
  const categorizedRows = useMemo(() => {
    if (!matrix || !matrix.rows) return {};
    return {
      volume: matrix.rows.filter(r => r.accountCategory === 'VOLUME'),
      revenue: matrix.rows.filter(r => ['GROSS_REVENUE', 'CONTRACTUAL_DEDUCTION', 'NET_REVENUE'].includes(r.accountCategory)),
      directCosts: matrix.rows.filter(r => ['DIRECT_COST', 'MARGIN'].includes(r.accountCategory) && r.lineCode !== 'EBITDA' && r.lineCode !== 'NOI'),
      overhead: matrix.rows.filter(r => ['VARIABLE_COST', 'FIXED_OVERHEAD'].includes(r.accountCategory) && r.lineCode !== 'EXP_DEP_AMORT'),
      profitability: matrix.rows.filter(r => ['EBITDA', 'EXP_DEP_AMORT', 'NOI'].includes(r.lineCode))
    };
  }, [matrix]);

  if (!matrix || !telemetry) {
    return (
      <div className="rf-container">
        <div className="rf-loading">Loading 12-Month Rolling Forecast Engine...</div>
      </div>
    );
  }

  return (
    <div className="rf-container">
      {/* Freeze Success Notice */}
      {freezeNotice && (
        <div className="rf-freeze-banner">
          <CheckCircle size={18} className="text-emerald" />
          <span>{freezeNotice}</span>
          <button className="rf-btn-banner-close" onClick={() => setFreezeNotice(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="rf-header-card">
        <div className="rf-header-left">
          <div className="rf-header-badges">
            <span className="rf-badge-facility">Naples Surgery Center</span>
            <span className="rf-badge-phase">Phase E2 - Module 14</span>
            <span className="rf-badge-status">
              <Lock size={12} /> ACTIVE_PROJECTION
            </span>
            <span className="rf-badge-method">
              Method: {activeMethod.replace(/_/g, ' ')}
            </span>
          </div>
          <h2 className="rf-header-title">12-Month Rolling Forecast & Continuous Projections</h2>
          <p className="rf-header-subtitle">
            Dynamic 12-month forward-looking trajectory bridging historical accounting actuals (October 2026) with
            multi-method surgical projections, OR capacity bounds, and CFO sensitivity analysis.
          </p>
        </div>

        <div className="rf-header-actions">
          <button className="rf-btn-secondary" onClick={() => setShowDrawer(true)}>
            <Sliders size={16} />
            <span>Sensitivity & Tuning</span>
          </button>
          <button className="rf-btn-primary" onClick={handleApproveAndFreeze}>
            <ShieldCheck size={16} />
            <span>Approve & Freeze Seal</span>
          </button>
        </div>
      </div>

      {/* Executive Horizon Telemetry Ribbon */}
      <div className="rf-ribbon-grid">
        {/* Card 1: 12-Month Projected NPR */}
        <div className="rf-ribbon-card">
          <div className="rf-card-top">
            <span className="rf-card-label">12-MONTH PROJECTED NPR</span>
            <TrendingUp size={16} className="text-emerald" />
          </div>
          <div className="rf-card-value font-mono">
            {formatCurrency(telemetry.projected12mNpr)}
          </div>
          <div className="rf-card-meta">
            <span className={`rf-meta-pill ${telemetry.isNprFavorable ? 'favorable' : 'unfavorable'}`}>
              {telemetry.isNprFavorable ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              {formatCurrency(Math.abs(telemetry.nprVarianceVsBudget))} vs Budget
            </span>
            <span className="rf-meta-sub">Annual target: $14.16M</span>
          </div>
        </div>

        {/* Card 2: 12-Month Projected EBITDA */}
        <div className="rf-ribbon-card">
          <div className="rf-card-top">
            <span className="rf-card-label">12-MONTH PROJECTED EBITDA</span>
            <Activity size={16} className="text-sky" />
          </div>
          <div className="rf-card-value font-mono">
            {formatCurrency(telemetry.projected12mEbitda)}
          </div>
          <div className="rf-card-meta">
            <span className="rf-meta-pill favorable">
              {telemetry.ebitdaMarginPercent}% EBITDA Margin
            </span>
            <span className="rf-meta-sub">Direct Margin: {formatCurrency(telemetry.projected12mClinicalMargin)}</span>
          </div>
        </div>

        {/* Card 3: Projected Surgical Cases */}
        <div className="rf-ribbon-card">
          <div className="rf-card-top">
            <span className="rf-card-label">PROJECTED SURGICAL CASES</span>
            <Layers size={16} className="text-sky" />
          </div>
          <div className="rf-card-value font-mono">
            {formatNumber(telemetry.projected12mCases)} <span className="rf-card-unit">cases</span>
          </div>
          <div className="rf-card-meta">
            <span className="rf-meta-sub">
              Avg Run-Rate: ~{Math.round(telemetry.projected12mCases / 12)} cases/mo
            </span>
            <span className="rf-meta-pill neutral">12 Forward Periods</span>
          </div>
        </div>

        {/* Card 4: OR Capacity Headroom */}
        <div className="rf-ribbon-card">
          <div className="rf-card-top">
            <span className="rf-card-label">OR CAPACITY HEADROOM</span>
            <Clock size={16} className="text-amber" />
          </div>
          <div className="rf-card-value font-mono">
            {telemetry.capacityHeadroomPercent}% <span className="rf-card-unit">free</span>
          </div>
          <div className="rf-card-meta">
            <span className="rf-meta-pill neutral">
              {formatNumber(telemetry.capacityHeadroomMinutes)} mins unbooked
            </span>
            <span className="rf-meta-sub">Target Utilization: 78.0%</span>
          </div>
        </div>

        {/* Card 5: Forecast Reliability Index */}
        <div className="rf-ribbon-card">
          <div className="rf-card-top">
            <span className="rf-card-label">FORECAST RELIABILITY</span>
            <CheckCircle size={16} className="text-emerald" />
          </div>
          <div className="rf-card-value font-mono">
            {(telemetry.avgConfidenceScore * 100).toFixed(1)}%
          </div>
          <div className="rf-card-meta">
            <span className="rf-meta-pill favorable">High Confidence</span>
            <span className="rf-meta-sub">Near-term: 98% / T+12: 75%</span>
          </div>
        </div>
      </div>

      {/* Interactive Controls & Scenario Switcher */}
      <div className="rf-toolbar-card">
        {/* Horizon Range */}
        <div className="rf-toolbar-group">
          <span className="rf-toolbar-label">Horizon:</span>
          <div className="rf-pill-toggle">
            <button
              className={`rf-toggle-btn ${activeHorizon === HORIZON_TYPES.TWELVE_MONTH ? 'active' : ''}`}
              onClick={() => setActiveHorizon(HORIZON_TYPES.TWELVE_MONTH)}
            >
              12 Months (Full)
            </button>
            <button
              className={`rf-toggle-btn ${activeHorizon === HORIZON_TYPES.SIX_MONTH ? 'active' : ''}`}
              onClick={() => setActiveHorizon(HORIZON_TYPES.SIX_MONTH)}
            >
              Next 6 Months
            </button>
            <button
              className={`rf-toggle-btn ${activeHorizon === HORIZON_TYPES.THREE_MONTH ? 'active' : ''}`}
              onClick={() => setActiveHorizon(HORIZON_TYPES.THREE_MONTH)}
            >
              Next Quarter (Q4)
            </button>
          </div>
        </div>

        {/* Scenario Toggle */}
        <div className="rf-toolbar-group">
          <span className="rf-toolbar-label">Scenario Model:</span>
          <div className="rf-pill-toggle">
            <button
              className={`rf-toggle-btn ${activeScenario === SCENARIOS.BASELINE ? 'active' : ''}`}
              onClick={() => setActiveScenario(SCENARIOS.BASELINE)}
            >
              Baseline (1.00x)
            </button>
            <button
              className={`rf-toggle-btn bull ${activeScenario === SCENARIOS.OPTIMISTIC ? 'active' : ''}`}
              onClick={() => setActiveScenario(SCENARIOS.OPTIMISTIC)}
            >
              Bull Case (+8% Vol)
            </button>
            <button
              className={`rf-toggle-btn bear ${activeScenario === SCENARIOS.CONSERVATIVE ? 'active' : ''}`}
              onClick={() => setActiveScenario(SCENARIOS.CONSERVATIVE)}
            >
              Bear Case (-10% Vol)
            </button>
          </div>
        </div>

        {/* Method Selector */}
        <div className="rf-toolbar-group">
          <span className="rf-toolbar-label">Methodology:</span>
          <select
            className="rf-select"
            value={activeMethod}
            onChange={(e) => setActiveMethod(e.target.value)}
          >
            <option value={FORECAST_METHODS.BLENDED_COMPOSITE}>Blended Composite (40/35/25)</option>
            <option value={FORECAST_METHODS.SEASONAL_INDEX}>Empirical ASC Seasonal Index</option>
            <option value={FORECAST_METHODS.T3M_RUN_RATE}>Trailing 3-Month Run-Rate (T3M)</option>
            <option value={FORECAST_METHODS.CAPACITY_PIPELINE}>OR Capacity-Constrained Pipeline</option>
          </select>
        </div>
      </div>

      {/* Monthly Horizon Trajectory Overview Strip */}
      <div className="rf-trajectory-card">
        <div className="rf-trajectory-header">
          <div className="rf-traj-title-group">
            <h3 className="rf-section-title">Forward Monthly Trajectory & Horizon Milestones</h3>
            <span className="rf-section-sub">
              Projected volume progression, seasonality indices, and confidence decay across the 12-month horizon
            </span>
          </div>
          <div className="rf-legend-group">
            <span className="rf-legend-item"><span className="rf-dot green"></span> Peak Seasonal Volume</span>
            <span className="rf-legend-item"><span className="rf-dot blue"></span> Stable Elective Run</span>
            <span className="rf-legend-item"><span className="rf-dot amber"></span> Q1 Deductible Reset</span>
          </div>
        </div>

        <div className="rf-trajectory-scroll">
          <div className="rf-trajectory-grid">
            {matrix.periods.map((p) => {
              const cases = p.plannedCases;
              const npr = cases * 4750;
              const ebitda = Math.round(npr * 0.268);
              const isPeak = p.seasonalityIndex >= 1.08;
              const isDip = p.seasonalityIndex < 0.95;

              return (
                <div key={p.periodCode} className={`rf-month-card ${isPeak ? 'peak' : isDip ? 'dip' : 'steady'}`}>
                  <div className="rf-month-top">
                    <span className="rf-month-name">{p.periodName.split(' ')[0]}</span>
                    <span className="rf-month-year">{p.periodName.split(' ')[1]}</span>
                  </div>
                  <div className="rf-month-badge-row">
                    <span className="rf-quarter-tag">{p.quarterCode}</span>
                    <span className="rf-season-tag">{(p.seasonalityIndex * 100).toFixed(0)}% S</span>
                  </div>
                  <div className="rf-month-metrics">
                    <div className="rf-metric-row">
                      <span className="label">Cases:</span>
                      <span className="val font-mono">{cases}</span>
                    </div>
                    <div className="rf-metric-row">
                      <span className="label">NPR:</span>
                      <span className="val font-mono">{formatCurrency(npr)}</span>
                    </div>
                    <div className="rf-metric-row">
                      <span className="label">EBITDA:</span>
                      <span className="val font-mono text-emerald">{formatCurrency(ebitda)}</span>
                    </div>
                  </div>
                  <div className="rf-confidence-bar-bg">
                    <div
                      className="rf-confidence-bar-fill"
                      style={{ width: `${p.confidenceScore * 100}%` }}
                      title={`Confidence: ${(p.confidenceScore * 100).toFixed(0)}%`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Multi-Period Statement Table */}
      <div className="rf-statement-card">
        <div className="rf-statement-header">
          <div className="rf-stmt-title-group">
            <h3 className="rf-section-title">12-Month Continuous Rolling Forecast Statement</h3>
            <span className="rf-section-sub">
              GAAP-aligned managerial accounting matrix with monthly projections, quarterly rollups, and EBITDA bridges
            </span>
          </div>
          <div className="rf-stmt-actions">
            <span className="rf-scenario-indicator">
              Viewing: <strong>{activeScenario}</strong>
            </span>
          </div>
        </div>

        <div className="rf-table-wrapper">
          <table className="rf-table">
            <thead>
              <tr>
                <th className="rf-th-line sticky-col">STATEMENT LINE ITEM</th>
                {matrix.periods.map(p => (
                  <th key={p.periodCode} className="rf-th-month">
                    <span className="rf-th-mname">{p.periodCode}</span>
                    <span className="rf-th-qcode">{p.quarterCode}</span>
                  </th>
                ))}
                <th className="rf-th-total">12-MO TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {/* SECTION 1: SURGICAL VOLUME */}
              <tr className="rf-section-header-row" onClick={() => toggleSection('volume')}>
                <td colSpan={matrix.periods.length + 2}>
                  <div className="rf-section-header-content">
                    {collapsedSections.volume ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    <span>1. SURGICAL CASE VOLUME & OPERATING ROOM UTILIZATION</span>
                  </div>
                </td>
              </tr>
              {!collapsedSections.volume && categorizedRows.volume?.map(r => (
                <tr key={r.lineCode} className="rf-data-row">
                  <td className="sticky-col rf-td-label">
                    <span className="rf-line-name">{r.lineName}</span>
                    <span className="rf-line-code font-mono">{r.lineCode}</span>
                  </td>
                  {matrix.periods.map(p => (
                    <td key={p.periodCode} className="rf-td-val font-mono">
                      {formatNumber(r.periodValues[p.periodCode])}
                    </td>
                  ))}
                  <td className="rf-td-total font-mono font-bold">
                    {formatNumber(r.totalAmount)}
                  </td>
                </tr>
              ))}

              {/* SECTION 2: GROSS-TO-NET REVENUE */}
              <tr className="rf-section-header-row" onClick={() => toggleSection('revenue')}>
                <td colSpan={matrix.periods.length + 2}>
                  <div className="rf-section-header-content">
                    {collapsedSections.revenue ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    <span>2. GROSS CHARGES, DEDUCTIONS & NET PATIENT REVENUE (NPR)</span>
                  </div>
                </td>
              </tr>
              {!collapsedSections.revenue && categorizedRows.revenue?.map(r => {
                const isNpr = r.lineCode === 'NPR';
                return (
                  <tr key={r.lineCode} className={`rf-data-row ${isNpr ? 'rf-highlight-npr' : ''}`}>
                    <td className="sticky-col rf-td-label">
                      <span className="rf-line-name">{r.lineName}</span>
                      <span className="rf-line-code font-mono">{r.lineCode}</span>
                    </td>
                    {matrix.periods.map(p => (
                      <td key={p.periodCode} className="rf-td-val font-mono">
                        {formatCurrency(r.periodValues[p.periodCode])}
                      </td>
                    ))}
                    <td className="rf-td-total font-mono font-bold">
                      {formatCurrency(r.totalAmount)}
                    </td>
                  </tr>
                );
              })}

              {/* SECTION 3: DIRECT CLINICAL COSTS */}
              <tr className="rf-section-header-row" onClick={() => toggleSection('directCosts')}>
                <td colSpan={matrix.periods.length + 2}>
                  <div className="rf-section-header-content">
                    {collapsedSections.directCosts ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    <span>3. DIRECT PROCEDURAL COSTS & CLINICAL MARGIN</span>
                  </div>
                </td>
              </tr>
              {!collapsedSections.directCosts && categorizedRows.directCosts?.map(r => {
                const isMargin = r.lineCode === 'CLINICAL_MARGIN';
                return (
                  <tr key={r.lineCode} className={`rf-data-row ${isMargin ? 'rf-highlight-margin' : ''}`}>
                    <td className="sticky-col rf-td-label">
                      <span className="rf-line-name">{r.lineName}</span>
                      <span className="rf-line-code font-mono">{r.lineCode}</span>
                    </td>
                    {matrix.periods.map(p => (
                      <td key={p.periodCode} className="rf-td-val font-mono">
                        {formatCurrency(r.periodValues[p.periodCode])}
                      </td>
                    ))}
                    <td className="rf-td-total font-mono font-bold">
                      {formatCurrency(r.totalAmount)}
                    </td>
                  </tr>
                );
              })}

              {/* SECTION 4: FACILITY OVERHEAD */}
              <tr className="rf-section-header-row" onClick={() => toggleSection('overhead')}>
                <td colSpan={matrix.periods.length + 2}>
                  <div className="rf-section-header-content">
                    {collapsedSections.overhead ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    <span>4. VARIABLE FACILITY COSTS & FIXED OVERHEAD (OPEX)</span>
                  </div>
                </td>
              </tr>
              {!collapsedSections.overhead && categorizedRows.overhead?.map(r => (
                <tr key={r.lineCode} className="rf-data-row">
                  <td className="sticky-col rf-td-label">
                    <span className="rf-line-name">{r.lineName}</span>
                    <span className="rf-line-code font-mono">{r.lineCode}</span>
                  </td>
                  {matrix.periods.map(p => (
                    <td key={p.periodCode} className="rf-td-val font-mono">
                      {formatCurrency(r.periodValues[p.periodCode])}
                    </td>
                  ))}
                  <td className="rf-td-total font-mono font-bold">
                    {formatCurrency(r.totalAmount)}
                  </td>
                </tr>
              ))}

              {/* SECTION 5: OPERATING PROFITABILITY (EBITDA & NOI) */}
              <tr className="rf-section-header-row highlight-final" onClick={() => toggleSection('profitability')}>
                <td colSpan={matrix.periods.length + 2}>
                  <div className="rf-section-header-content">
                    {collapsedSections.profitability ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    <span>5. OPERATING PROFITABILITY (EBITDA & NET OPERATING INCOME)</span>
                  </div>
                </td>
              </tr>
              {!collapsedSections.profitability && categorizedRows.profitability?.map(r => {
                const isEbitda = r.lineCode === 'EBITDA';
                return (
                  <tr key={r.lineCode} className={`rf-data-row ${isEbitda ? 'rf-highlight-ebitda' : ''}`}>
                    <td className="sticky-col rf-td-label">
                      <span className="rf-line-name font-bold">{r.lineName}</span>
                      <span className="rf-line-code font-mono">{r.lineCode}</span>
                    </td>
                    {matrix.periods.map(p => (
                      <td key={p.periodCode} className="rf-td-val font-mono font-bold">
                        {formatCurrency(r.periodValues[p.periodCode])}
                      </td>
                    ))}
                    <td className="rf-td-total font-mono font-extrabold text-emerald">
                      {formatCurrency(r.totalAmount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slide-Out Sensitivity Tuning Drawer */}
      {showDrawer && (
        <div className="rf-drawer-overlay" onClick={() => setShowDrawer(false)}>
          <div className="rf-drawer-container" onClick={(e) => e.stopPropagation()}>
            <div className="rf-drawer-header">
              <div className="rf-drawer-title-group">
                <h3 className="rf-drawer-title">Methodology & Sensitivity Configuration</h3>
                <div className="rf-drawer-badges-row">
                  <span className="rf-code-pill font-mono">RF2026_12M_BASE</span>
                  <span className="rf-category-pill">Naples Surgery Center</span>
                </div>
              </div>
              <button className="rf-btn-close" onClick={() => setShowDrawer(false)} title="Close Drawer">
                <X size={18} />
              </button>
            </div>

            <div className="rf-drawer-body">
              {/* Method Parameters Card */}
              <div className="rf-drawer-section">
                <h4>Primary Projection Methodology</h4>
                <div className="rf-drawer-stat-grid">
                  <div className="rf-drawer-stat-box">
                    <span className="stat-label">ALGORITHM</span>
                    <span className="stat-val text-sky">Blended Composite</span>
                  </div>
                  <div className="rf-drawer-stat-box">
                    <span className="stat-label">WEIGHTING ENSEMBLE</span>
                    <span className="stat-val font-mono">40% B / 35% S / 25% R</span>
                  </div>
                </div>
              </div>

              {/* Physical OR Capacity */}
              <div className="rf-drawer-section">
                <h4>Physical OR Facility Constraints</h4>
                <div className="rf-drawer-stat-grid">
                  <div className="rf-drawer-stat-box">
                    <span className="stat-label">OR ROOMS</span>
                    <span className="stat-val font-mono">{FACILITY_CAPACITY_CONSTRAINTS.OR_ROOMS} Rooms</span>
                  </div>
                  <div className="rf-drawer-stat-box">
                    <span className="stat-label">STAFFED HOURS / DAY</span>
                    <span className="stat-val font-mono">{FACILITY_CAPACITY_CONSTRAINTS.STAFFED_HOURS_PER_DAY} Hours</span>
                  </div>
                  <div className="rf-drawer-stat-box">
                    <span className="stat-label">MAX MONTHLY CAPACITY</span>
                    <span className="stat-val font-mono">{FACILITY_CAPACITY_CONSTRAINTS.MAXIMUM_MONTHLY_CASE_CAPACITY} Cases</span>
                  </div>
                  <div className="rf-drawer-stat-box">
                    <span className="stat-label">AVG DURATION / CASE</span>
                    <span className="stat-val font-mono">{FACILITY_CAPACITY_CONSTRAINTS.AVERAGE_CASE_DURATION_MINUTES} Minutes</span>
                  </div>
                </div>
              </div>

              {/* Seasonality Indices */}
              <div className="rf-drawer-section">
                <h4>Empirical Seasonality Curve (ASCs)</h4>
                <div className="rf-season-mini-grid">
                  {matrix.periods.map(p => (
                    <div key={p.periodCode} className="rf-season-cell">
                      <span className="month">{p.periodCode.split('-')[1]}</span>
                      <span className="factor font-mono">{(p.seasonalityIndex * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cryptographic Seal */}
              <div className="rf-drawer-section">
                <h4>Cryptographic Provenance Seal</h4>
                <div className="rf-seal-box font-mono">
                  <span className="seal-label">SHA-256 HASH:</span>
                  <span className="seal-val">{telemetry.frozenHash || 'Draft Version — Unsealed'}</span>
                </div>
              </div>
            </div>

            <div className="rf-drawer-footer">
              <button className="rf-btn-secondary" onClick={() => setShowDrawer(false)}>
                Close
              </button>
              <button className="rf-btn-primary" onClick={() => { setShowDrawer(false); handleApproveAndFreeze(); }}>
                Save & Seal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
