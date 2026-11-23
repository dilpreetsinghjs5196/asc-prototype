import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  Sliders,
  CheckCircle,
  AlertCircle,
  Lock,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  X,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  Activity,
  Layers,
  FileSpreadsheet,
  Target,
  RefreshCw,
  GitCompare,
  BarChart2
} from 'lucide-react';
import {
  getFacilityScenarios,
  getScenarioByIdOrCode,
  getScenarioTelemetry,
  getScenarioComparativeMatrix,
  calculateScenarioProjections,
  approveAndFreezeScenario,
  SCENARIO_STATUSES,
  SCENARIO_TYPES,
  OR_CAPACITY_CONSTANTS,
  BASELINE_NAPLES_OPERATING_DATA
} from '../services/scenarioModelingService';
import './ScenarioModelingView.css';

export default function ScenarioModelingView({ activeFacility = 'fac-naples-01' }) {
  const [selectedScenarioCode, setSelectedScenarioCode] = useState('SCEN_BASE_2026');
  const [showDrawer, setShowDrawer] = useState(false);
  const [freezeNotice, setFreezeNotice] = useState(null);

  // Custom interactive levers for dynamic what-if simulation
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customLevers, setCustomLevers] = useState({
    caseVolumeDeltaPercent: 0,
    reimbursementRateDeltaPercent: 0,
    implantCostInflationPercent: 0,
    supplyCostInflationPercent: 0,
    laborWageInflationPercent: 0,
    fixedOverheadDelta: 0
  });

  const scenario = useMemo(() => {
    return getScenarioByIdOrCode(selectedScenarioCode, activeFacility);
  }, [selectedScenarioCode, activeFacility]);

  const telemetry = useMemo(() => {
    if (isCustomMode) {
      const proj = calculateScenarioProjections(BASELINE_NAPLES_OPERATING_DATA, customLevers);
      return {
        scenarioId: 'custom',
        scenarioCode: 'SCEN_CUSTOM',
        scenarioName: 'Interactive Custom Simulation',
        scenarioType: SCENARIO_TYPES.WHAT_IF,
        status: SCENARIO_STATUSES.DRAFT,
        isActive: true,
        isApproved: false,
        projectedCases: proj.projectedCases,
        projectedNpr: proj.projectedNpr,
        projectedDirectCosts: proj.projectedDirectCosts,
        projectedContributionMargin: proj.projectedContributionMargin,
        projectedFixedOverhead: proj.projectedFixedOverhead,
        projectedEbitda: proj.projectedEbitda,
        projectedEbitdaMarginPercent: proj.projectedEbitdaMarginPercent,
        projectedBreakEvenCases: proj.projectedBreakEvenCases,
        projectedMarginOfSafetyCases: proj.projectedMarginOfSafetyCases,
        orMinutesUtilized: proj.orMinutesUtilized,
        orCapacityUtilizationPercent: proj.orCapacityUtilizationPercent,
        frozenHash: null,
        approvedAt: null,
        deltaCases: proj.deltaCases,
        deltaNpr: proj.deltaNpr,
        deltaEbitda: proj.deltaEbitda,
        deltaMarginPct: Number((proj.projectedEbitdaMarginPercent - BASELINE_NAPLES_OPERATING_DATA.ebitdaMarginPercent).toFixed(2)),
        deltaOrMinutes: proj.deltaOrMinutes,
        availableOrMinutes: OR_CAPACITY_CONSTANTS.TOTAL_AVAILABLE_OR_MINUTES
      };
    }
    return getScenarioTelemetry(activeFacility, selectedScenarioCode);
  }, [selectedScenarioCode, activeFacility, isCustomMode, customLevers]);

  const comparativeData = useMemo(() => {
    return getScenarioComparativeMatrix(activeFacility);
  }, [activeFacility]);

  const handleSelectPreset = (code) => {
    setSelectedScenarioCode(code);
    setIsCustomMode(false);
    const target = getScenarioByIdOrCode(code, activeFacility);
    if (target) {
      setCustomLevers({
        caseVolumeDeltaPercent: target.caseVolumeDeltaPercent || 0,
        reimbursementRateDeltaPercent: target.reimbursementRateDeltaPercent || 0,
        implantCostInflationPercent: target.implantCostInflationPercent || 0,
        supplyCostInflationPercent: target.supplyCostInflationPercent || 0,
        laborWageInflationPercent: target.laborWageInflationPercent || 0,
        fixedOverheadDelta: target.fixedOverheadDelta || 0
      });
    }
  };

  const handleLeverChange = (field, val) => {
    setIsCustomMode(true);
    setCustomLevers(prev => ({
      ...prev,
      [field]: Number(val)
    }));
  };

  const handleResetLevers = () => {
    handleSelectPreset(selectedScenarioCode);
  };

  const handleApproveAndFreeze = () => {
    try {
      const res = approveAndFreezeScenario(selectedScenarioCode, '00000000-0000-0000-0000-000000000001');
      setFreezeNotice(`Cryptographically sealed scenario '${res.scenarioCode}' with SHA-256: ${res.frozenHash.slice(0, 16)}...`);
      setTimeout(() => setFreezeNotice(null), 6000);
    } catch (err) {
      console.error('Freeze error:', err);
    }
  };

  const formatCurrency = (val) => {
    if (val === undefined || val === null || isNaN(val)) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(val);
  };

  const formatPercent = (val) => {
    if (val === undefined || val === null || isNaN(val)) return '0.0%';
    return `${Number(val).toFixed(1)}%`;
  };

  if (!telemetry || !comparativeData) {
    return (
      <div className="scen-container">
        <div className="scen-loading">Loading Scenario Modeling Engine...</div>
      </div>
    );
  }

  const isFavorableEbitda = telemetry.deltaEbitda >= 0;

  return (
    <div className="scen-container">
      {/* Freeze Alert Banner */}
      {freezeNotice && (
        <div className="scen-freeze-banner">
          <CheckCircle size={18} className="text-emerald" />
          <span>{freezeNotice}</span>
          <button className="scen-btn-banner-close" onClick={() => setFreezeNotice(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Header Card */}
      <div className="scen-header-card">
        <div className="scen-header-left">
          <div className="scen-header-badges">
            <span className="scen-badge-facility">Naples Surgery Center</span>
            <span className="scen-badge-phase">Phase E5 - Module 14</span>
            <span className={`scen-badge-status ${telemetry.isApproved ? 'approved' : 'draft'}`}>
              <Lock size={12} /> {telemetry.status}
            </span>
            <span className="scen-badge-type">
              {telemetry.scenarioType}
            </span>
            <span className="scen-badge-baseline">
              Baseline: 2026-M10 (October Close)
            </span>
          </div>
          <h2 className="scen-header-title">Financial & Operational Scenario Modeling</h2>
          <p className="scen-header-subtitle">
            Deterministic simulation testing volume expansion, commercial payer rate compression, supply chain inflation,
            and multi-factor stress tests against Operating Room capacity limits.
          </p>
        </div>

        <div className="scen-header-actions">
          <button className="scen-btn-secondary" onClick={() => setShowDrawer(true)}>
            <Sliders size={16} />
            <span>Governance & Levers</span>
          </button>
          <button
            className="scen-btn-primary"
            onClick={handleApproveAndFreeze}
            disabled={isCustomMode}
            title={isCustomMode ? 'Save scenario before freezing' : 'Freeze Approved Strategy'}
          >
            <ShieldCheck size={16} />
            <span>Approve Strategy Seal</span>
          </button>
        </div>
      </div>

      {/* Scenario Preset Selector Toolbar */}
      <div className="scen-toolbar-card">
        <div className="scen-toolbar-left">
          <span className="scen-toolbar-label">Scenario Model:</span>
          <div className="scen-pill-toggle">
            <button
              className={`scen-toggle-btn ${selectedScenarioCode === 'SCEN_BASE_2026' && !isCustomMode ? 'active' : ''}`}
              onClick={() => handleSelectPreset('SCEN_BASE_2026')}
            >
              Baseline (Oct 2026)
            </button>
            <button
              className={`scen-toggle-btn expansion ${selectedScenarioCode === 'SCEN_ORTHO_EXP' && !isCustomMode ? 'active' : ''}`}
              onClick={() => handleSelectPreset('SCEN_ORTHO_EXP')}
            >
              Total Joint Expansion (+12.5%)
            </button>
            <button
              className={`scen-toggle-btn payer ${selectedScenarioCode === 'SCEN_PAYER_CUT' && !isCustomMode ? 'active' : ''}`}
              onClick={() => handleSelectPreset('SCEN_PAYER_CUT')}
            >
              Commercial Rate Cut (-4.0%)
            </button>
            <button
              className={`scen-toggle-btn inflation ${selectedScenarioCode === 'SCEN_INFLATION' && !isCustomMode ? 'active' : ''}`}
              onClick={() => handleSelectPreset('SCEN_INFLATION')}
            >
              Implant & Supply Inflation
            </button>
            <button
              className={`scen-toggle-btn stress ${selectedScenarioCode === 'SCEN_STRESS_TEST' && !isCustomMode ? 'active' : ''}`}
              onClick={() => handleSelectPreset('SCEN_STRESS_TEST')}
            >
              Multi-Factor Stress Test
            </button>
          </div>
        </div>

        {isCustomMode && (
          <div className="scen-custom-alert">
            <span className="scen-custom-dot"></span>
            <span>Interactive Custom Mode Active</span>
            <button className="scen-btn-reset-mini" onClick={handleResetLevers}>
              <RefreshCw size={12} /> Reset to Preset
            </button>
          </div>
        )}
      </div>

      {/* Executive Scenario Ribbon */}
      <div className="scen-ribbon-grid">
        {/* Card 1: Projected Volume */}
        <div className="scen-ribbon-card">
          <div className="scen-card-top">
            <span className="scen-card-label">PROJECTED MONTHLY VOLUME</span>
            <Target size={16} className="text-sky" />
          </div>
          <div className="scen-card-value font-mono">
            {telemetry.projectedCases} <span className="scen-card-unit">cases</span>
          </div>
          <div className="scen-card-meta">
            <span className={`scen-meta-pill ${telemetry.deltaCases >= 0 ? 'favorable' : 'unfavorable'}`}>
              {telemetry.deltaCases >= 0 ? `+${telemetry.deltaCases}` : `${telemetry.deltaCases}`} cases vs Base
            </span>
            <span className="scen-meta-sub">{(telemetry.projectedCases / 21).toFixed(1)} cases / day</span>
          </div>
        </div>

        {/* Card 2: Projected Net Revenue */}
        <div className="scen-ribbon-card">
          <div className="scen-card-top">
            <span className="scen-card-label">PROJECTED NET REVENUE</span>
            <DollarSign size={16} className="text-emerald" />
          </div>
          <div className="scen-card-value font-mono">
            {formatCurrency(telemetry.projectedNpr)}
          </div>
          <div className="scen-card-meta">
            <span className={`scen-meta-pill ${telemetry.deltaNpr >= 0 ? 'favorable' : 'unfavorable'}`}>
              {telemetry.deltaNpr >= 0 ? `+${formatCurrency(telemetry.deltaNpr)}` : `-${formatCurrency(Math.abs(telemetry.deltaNpr))}`}
            </span>
            <span className="scen-meta-sub">NPR collections</span>
          </div>
        </div>

        {/* Card 3: Operating EBITDA */}
        <div className="scen-ribbon-card">
          <div className="scen-card-top">
            <span className="scen-card-label">OPERATING EBITDA</span>
            <TrendingUp size={16} className={isFavorableEbitda ? 'text-emerald' : 'text-crimson'} />
          </div>
          <div className={`scen-card-value font-mono ${isFavorableEbitda ? 'text-emerald' : 'text-crimson'}`}>
            {formatCurrency(telemetry.projectedEbitda)}
          </div>
          <div className="scen-card-meta">
            <span className={`scen-meta-pill ${isFavorableEbitda ? 'favorable' : 'unfavorable'}`}>
              {telemetry.deltaEbitda >= 0 ? `+${formatCurrency(telemetry.deltaEbitda)}` : `-${formatCurrency(Math.abs(telemetry.deltaEbitda))}`}
            </span>
            <span className="scen-meta-sub">{formatPercent(telemetry.projectedEbitdaMarginPercent)} EBITDA Margin</span>
          </div>
        </div>

        {/* Card 4: Break-Even & MOS */}
        <div className="scen-ribbon-card">
          <div className="scen-card-top">
            <span className="scen-card-label">BREAK-EVEN & SAFETY (MOS)</span>
            <ShieldCheck size={16} className="text-emerald" />
          </div>
          <div className="scen-card-value font-mono">
            {telemetry.projectedBreakEvenCases} <span className="scen-card-unit">BE / {telemetry.projectedMarginOfSafetyCases} MOS</span>
          </div>
          <div className="scen-card-meta">
            <span className="scen-meta-pill favorable">
              {formatPercent((telemetry.projectedMarginOfSafetyCases / telemetry.projectedCases) * 100)} Buffer
            </span>
            <span className="scen-meta-sub">Cases required: {telemetry.projectedBreakEvenCases}</span>
          </div>
        </div>

        {/* Card 5: OR Capacity Utilization */}
        <div className="scen-ribbon-card">
          <div className="scen-card-top">
            <span className="scen-card-label">OR CAPACITY UTILIZATION</span>
            <Clock size={16} className="text-amber" />
          </div>
          <div className="scen-card-value font-mono">
            {formatPercent(telemetry.orCapacityUtilizationPercent)}
          </div>
          <div className="scen-card-meta">
            <span className={`scen-meta-pill ${telemetry.orCapacityUtilizationPercent > 80 ? 'unfavorable' : 'neutral'}`}>
              {telemetry.orMinutesUtilized.toLocaleString()} / 40,320 mins
            </span>
            <span className="scen-meta-sub">4 OR Suites @ 8 hrs/day</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Interactive Levers & OR Feasibility Meter */}
      <div className="scen-analytics-grid">
        {/* Interactive Levers Card */}
        <div className="scen-card scen-levers-card">
          <div className="scen-card-header">
            <div>
              <h3 className="scen-section-title">Interactive What-If Simulation Levers</h3>
              <p className="scen-section-sub">Adjust volume, reimbursement rates, and expense inflation to model outcomes</p>
            </div>
            <button className="scen-btn-reset" onClick={handleResetLevers} title="Reset to Preset">
              <RefreshCw size={14} />
              <span>Reset</span>
            </button>
          </div>

          <div className="scen-levers-grid">
            {/* Lever 1: Volume */}
            <div className="scen-slider-group">
              <div className="scen-slider-header">
                <span className="scen-slabel">Surgical Case Volume:</span>
                <span className={`scen-sval font-mono ${customLevers.caseVolumeDeltaPercent >= 0 ? 'text-emerald' : 'text-crimson'}`}>
                  {customLevers.caseVolumeDeltaPercent > 0 ? `+${customLevers.caseVolumeDeltaPercent}%` : `${customLevers.caseVolumeDeltaPercent}%`}
                </span>
              </div>
              <input
                type="range"
                min="-30"
                max="40"
                step="1"
                value={customLevers.caseVolumeDeltaPercent}
                onChange={(e) => handleLeverChange('caseVolumeDeltaPercent', e.target.value)}
                className="scen-slider"
              />
              <div className="scen-slider-ticks">
                <span>-30%</span>
                <span>0% (Base)</span>
                <span>+40%</span>
              </div>
            </div>

            {/* Lever 2: Payer Rate */}
            <div className="scen-slider-group">
              <div className="scen-slider-header">
                <span className="scen-slabel">Payer Reimbursement Yield:</span>
                <span className={`scen-sval font-mono ${customLevers.reimbursementRateDeltaPercent >= 0 ? 'text-emerald' : 'text-crimson'}`}>
                  {customLevers.reimbursementRateDeltaPercent > 0 ? `+${customLevers.reimbursementRateDeltaPercent}%` : `${customLevers.reimbursementRateDeltaPercent}%`}
                </span>
              </div>
              <input
                type="range"
                min="-12"
                max="12"
                step="0.5"
                value={customLevers.reimbursementRateDeltaPercent}
                onChange={(e) => handleLeverChange('reimbursementRateDeltaPercent', e.target.value)}
                className="scen-slider"
              />
              <div className="scen-slider-ticks">
                <span>-12%</span>
                <span>0% (Base)</span>
                <span>+12%</span>
              </div>
            </div>

            {/* Lever 3: Implant Inflation */}
            <div className="scen-slider-group">
              <div className="scen-slider-header">
                <span className="scen-slabel">Implant & Hardware Inflation:</span>
                <span className={`scen-sval font-mono ${customLevers.implantCostInflationPercent > 0 ? 'text-amber' : 'text-slate'}`}>
                  {customLevers.implantCostInflationPercent > 0 ? `+${customLevers.implantCostInflationPercent}%` : `${customLevers.implantCostInflationPercent}%`}
                </span>
              </div>
              <input
                type="range"
                min="-5"
                max="20"
                step="1"
                value={customLevers.implantCostInflationPercent}
                onChange={(e) => handleLeverChange('implantCostInflationPercent', e.target.value)}
                className="scen-slider"
              />
              <div className="scen-slider-ticks">
                <span>-5%</span>
                <span>0% (Base)</span>
                <span>+20%</span>
              </div>
            </div>

            {/* Lever 4: Supply Inflation */}
            <div className="scen-slider-group">
              <div className="scen-slider-header">
                <span className="scen-slabel">Sterile Supplies & Biologics:</span>
                <span className={`scen-sval font-mono ${customLevers.supplyCostInflationPercent > 0 ? 'text-amber' : 'text-slate'}`}>
                  {customLevers.supplyCostInflationPercent > 0 ? `+${customLevers.supplyCostInflationPercent}%` : `${customLevers.supplyCostInflationPercent}%`}
                </span>
              </div>
              <input
                type="range"
                min="-5"
                max="20"
                step="1"
                value={customLevers.supplyCostInflationPercent}
                onChange={(e) => handleLeverChange('supplyCostInflationPercent', e.target.value)}
                className="scen-slider"
              />
              <div className="scen-slider-ticks">
                <span>-5%</span>
                <span>0% (Base)</span>
                <span>+20%</span>
              </div>
            </div>

            {/* Lever 5: Labor Wage Inflation */}
            <div className="scen-slider-group">
              <div className="scen-slider-header">
                <span className="scen-slabel">Clinical Nursing Wages:</span>
                <span className={`scen-sval font-mono ${customLevers.laborWageInflationPercent > 0 ? 'text-amber' : 'text-slate'}`}>
                  {customLevers.laborWageInflationPercent > 0 ? `+${customLevers.laborWageInflationPercent}%` : `${customLevers.laborWageInflationPercent}%`}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="15"
                step="1"
                value={customLevers.laborWageInflationPercent}
                onChange={(e) => handleLeverChange('laborWageInflationPercent', e.target.value)}
                className="scen-slider"
              />
              <div className="scen-slider-ticks">
                <span>0% (Base)</span>
                <span>+7.5%</span>
                <span>+15%</span>
              </div>
            </div>

            {/* Lever 6: Fixed Overhead Shift */}
            <div className="scen-slider-group">
              <div className="scen-slider-header">
                <span className="scen-slabel">Fixed Overhead Shift:</span>
                <span className={`scen-sval font-mono ${customLevers.fixedOverheadDelta > 0 ? 'text-amber' : 'text-slate'}`}>
                  {formatCurrency(customLevers.fixedOverheadDelta)}
                </span>
              </div>
              <input
                type="range"
                min="-30000"
                max="50000"
                step="5000"
                value={customLevers.fixedOverheadDelta}
                onChange={(e) => handleLeverChange('fixedOverheadDelta', e.target.value)}
                className="scen-slider"
              />
              <div className="scen-slider-ticks">
                <span>-$30k</span>
                <span>$0 (Base)</span>
                <span>+$50k</span>
              </div>
            </div>
          </div>
        </div>

        {/* Operating Room Capacity & Feasibility Card */}
        <div className="scen-card scen-capacity-card">
          <div className="scen-card-header">
            <div>
              <h3 className="scen-section-title">OR Capacity & Room-Hour Feasibility</h3>
              <p className="scen-section-sub">Validates surgical minutes against available block scheduling ceilings</p>
            </div>
            <span className={`scen-status-pill ${telemetry.orCapacityUtilizationPercent > 80 ? 'warning' : 'optimal'}`}>
              {telemetry.orCapacityUtilizationPercent > 80 ? 'Near Capacity' : 'Optimal Runway'}
            </span>
          </div>

          <div className="scen-capacity-body">
            <div className="scen-meter-container">
              <div className="scen-meter-labels">
                <span>OR Minutes Utilized:</span>
                <span className="font-mono font-bold">{telemetry.orMinutesUtilized.toLocaleString()} / 40,320 mins</span>
              </div>
              <div className="scen-progress-bar-bg">
                <div
                  className={`scen-progress-bar-fill ${telemetry.orCapacityUtilizationPercent > 80 ? 'high' : 'normal'}`}
                  style={{ width: `${Math.min(telemetry.orCapacityUtilizationPercent, 100)}%` }}
                ></div>
              </div>
              <div className="scen-meter-footer">
                <span>0%</span>
                <span>75% (Target Threshold)</span>
                <span>100% (40,320 mins)</span>
              </div>
            </div>

            <div className="scen-capacity-stats">
              <div className="scen-cstat-row">
                <span className="scen-cstat-label">Operating Rooms:</span>
                <span className="scen-cstat-val font-mono">4 Suites</span>
              </div>
              <div className="scen-cstat-row">
                <span className="scen-cstat-label">Operating Days:</span>
                <span className="scen-cstat-val font-mono">21 Days / Month</span>
              </div>
              <div className="scen-cstat-row">
                <span className="scen-cstat-label">Daily Available Capacity:</span>
                <span className="scen-cstat-val font-mono">32.0 OR Hours</span>
              </div>
              <div className="scen-cstat-row">
                <span className="scen-cstat-label">Projected Daily Demand:</span>
                <span className="scen-cstat-val font-mono">{(telemetry.orMinutesUtilized / 21 / 60).toFixed(1)} OR Hours / Day</span>
              </div>
              <div className="scen-cstat-row">
                <span className="scen-cstat-label">Overtime Exposure Risk:</span>
                <span className={`scen-cstat-val font-mono ${telemetry.orCapacityUtilizationPercent > 75 ? 'text-amber' : 'text-emerald'}`}>
                  {telemetry.orCapacityUtilizationPercent > 75 ? 'Elevated' : 'Minimal'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Side-by-Side Comparative Scenario Matrix */}
      <div className="scen-card scen-matrix-card">
        <div className="scen-card-header">
          <div>
            <h3 className="scen-section-title">Side-by-Side Comparative Scenario Decision Matrix</h3>
            <p className="scen-section-sub">Comprehensive cross-scenario financial and operational variance comparison</p>
          </div>
          <div className="scen-matrix-badge">
            <GitCompare size={14} />
            <span>{comparativeData.scenariosCount} Scenarios Benchmarked</span>
          </div>
        </div>

        <div className="scen-table-container">
          <table className="scen-table">
            <thead>
              <tr>
                <th className="scen-th text-left">Scenario Name</th>
                <th className="scen-th text-left">Type</th>
                <th className="scen-th text-right">Projected Cases</th>
                <th className="scen-th text-right">Net Revenue (NPR)</th>
                <th className="scen-th text-right">Direct Costs</th>
                <th className="scen-th text-right">EBITDA</th>
                <th className="scen-th text-right">EBITDA Margin</th>
                <th className="scen-th text-right">EBITDA Delta</th>
                <th className="scen-th text-right">OR Util</th>
                <th className="scen-th text-left">Strategic Notes</th>
              </tr>
            </thead>
            <tbody>
              {comparativeData.matrix.map(row => {
                const isSelected = row.scenarioCode === selectedScenarioCode && !isCustomMode;
                const isPositiveDelta = row.deltaEbitda >= 0;

                return (
                  <tr
                    key={row.scenarioCode}
                    className={`scen-tr ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelectPreset(row.scenarioCode)}
                  >
                    <td className="scen-td text-left">
                      <div className="scen-scen-name font-medium">{row.scenarioName}</div>
                      <div className="scen-scen-code font-mono">{row.scenarioCode}</div>
                    </td>
                    <td className="scen-td text-left">
                      <span className="scen-type-tag">{row.scenarioType}</span>
                    </td>
                    <td className="scen-td text-right font-mono">
                      {row.projectedCases}
                      {row.deltaCases !== 0 && (
                        <span className={`scen-delta-sub ${row.deltaCases > 0 ? 'text-emerald' : 'text-crimson'}`}>
                          ({row.deltaCases > 0 ? `+${row.deltaCases}` : row.deltaCases})
                        </span>
                      )}
                    </td>
                    <td className="scen-td text-right font-mono">{formatCurrency(row.projectedNpr)}</td>
                    <td className="scen-td text-right font-mono text-slate-400">{formatCurrency(row.projectedDirectCosts)}</td>
                    <td className={`scen-td text-right font-mono font-bold ${row.projectedEbitda >= 240000 ? 'text-emerald' : 'text-amber'}`}>
                      {formatCurrency(row.projectedEbitda)}
                    </td>
                    <td className="scen-td text-right font-mono">{formatPercent(row.projectedEbitdaMarginPercent)}</td>
                    <td className={`scen-td text-right font-mono font-semibold ${isPositiveDelta ? 'text-emerald' : 'text-crimson'}`}>
                      {row.deltaEbitda === 0 ? '$0' : (row.deltaEbitda > 0 ? `+${formatCurrency(row.deltaEbitda)}` : `-${formatCurrency(Math.abs(row.deltaEbitda))}`)}
                    </td>
                    <td className="scen-td text-right font-mono">{formatPercent(row.orCapacityUtilizationPercent)}</td>
                    <td className="scen-td text-left scen-note-cell">{row.strategicNote}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Side Drawer: Governance & Levers */}
      {showDrawer && (
        <div className="scen-drawer-backdrop" onClick={() => setShowDrawer(false)}>
          <div className="scen-drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div className="scen-drawer-header">
              <div className="scen-dheader-title">
                <Sliders size={18} className="text-sky" />
                <h3>Scenario Governance & Parameter Audit</h3>
              </div>
              <button className="scen-btn-drawer-close" onClick={() => setShowDrawer(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="scen-drawer-content">
              {/* Active Scenario Overview */}
              <div className="scen-drawer-section">
                <h4 className="scen-dsection-title">Active Model: {scenario.scenarioName}</h4>
                <div className="scen-provenance-box">
                  <div className="scen-prow">
                    <span className="scen-plabel">Scenario Code:</span>
                    <span className="scen-pval font-mono">{scenario.scenarioCode}</span>
                  </div>
                  <div className="scen-prow">
                    <span className="scen-plabel">Lifecycle Status:</span>
                    <span className="scen-pval font-mono text-emerald">{scenario.status}</span>
                  </div>
                  <div className="scen-prow">
                    <span className="scen-plabel">Baseline Period:</span>
                    <span className="scen-pval font-mono">{scenario.baselinePeriodCode}</span>
                  </div>
                  <div className="scen-prow">
                    <span className="scen-plabel">Version:</span>
                    <span className="scen-pval font-mono">v{scenario.versionNumber}</span>
                  </div>
                  <div className="scen-prow">
                    <span className="scen-plabel">Approved At:</span>
                    <span className="scen-pval font-mono">{scenario.approvedAt ? new Date(scenario.approvedAt).toLocaleDateString() : 'Pending'}</span>
                  </div>
                  <div className="scen-prow">
                    <span className="scen-plabel">SHA-256 Audit Seal:</span>
                    <span className="scen-pval-hash font-mono">{scenario.frozenHash || 'Not Sealed'}</span>
                  </div>
                </div>
              </div>

              {/* Parameter Inputs Applied */}
              <div className="scen-drawer-section">
                <h4 className="scen-dsection-title">Applied Simulation Levers</h4>
                <div className="scen-breakdown-list">
                  <div className="scen-breakdown-row">
                    <span className="scen-brow-label">Volume Shift:</span>
                    <span className="scen-brow-val font-mono">{scenario.caseVolumeDeltaPercent}%</span>
                  </div>
                  <div className="scen-breakdown-row">
                    <span className="scen-brow-label">Payer Rate Yield:</span>
                    <span className="scen-brow-val font-mono">{scenario.reimbursementRateDeltaPercent}%</span>
                  </div>
                  <div className="scen-breakdown-row">
                    <span className="scen-brow-label">Implant Inflation:</span>
                    <span className="scen-brow-val font-mono">{scenario.implantCostInflationPercent}%</span>
                  </div>
                  <div className="scen-breakdown-row">
                    <span className="scen-brow-label">Supply Inflation:</span>
                    <span className="scen-brow-val font-mono">{scenario.supplyCostInflationPercent}%</span>
                  </div>
                  <div className="scen-breakdown-row">
                    <span className="scen-brow-label">Labor Inflation:</span>
                    <span className="scen-brow-val font-mono">{scenario.laborWageInflationPercent}%</span>
                  </div>
                  <div className="scen-breakdown-row">
                    <span className="scen-brow-label">Fixed Overhead Shift:</span>
                    <span className="scen-brow-val font-mono">{formatCurrency(scenario.fixedOverheadDelta)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="scen-drawer-footer">
              <button className="scen-btn-drawer-action" onClick={() => setShowDrawer(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
