import React, { useState, useMemo } from 'react';
import {
  Target,
  Layers,
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
  TrendingUp,
  Activity,
  FileSpreadsheet,
  PieChart,
  HelpCircle,
  BarChart3,
  RefreshCw
} from 'lucide-react';
import {
  getBreakEvenAnalysis,
  getBreakEvenTelemetry,
  simulateBreakEvenSensitivity,
  approveAndFreezeBreakEvenModel,
  MODEL_STATUSES
} from '../services/breakEvenService';
import './BreakEvenView.css';

export default function BreakEvenView({ activeFacility = 'fac-naples-01' }) {
  const facilityId = typeof activeFacility === 'object' && activeFacility !== null
    ? (activeFacility.id || 'fac-naples-01')
    : (activeFacility || 'fac-naples-01');

  const [modelCode, setModelCode] = useState('BE2026_M10_BASE');
  const [showDrawer, setShowDrawer] = useState(false);
  const [freezeNotice, setFreezeNotice] = useState(null);

  // Sensitivity simulation state
  const [targetEbitda, setTargetEbitda] = useState(240000);
  const [supplyInflationPercent, setSupplyInflationPercent] = useState(0);
  const [reimbursementChangePercent, setReimbursementChangePercent] = useState(0);
  const [fixedCostShift, setFixedCostShift] = useState(0);

  // Analysis & Telemetry
  const analysis = useMemo(() => {
    return getBreakEvenAnalysis(facilityId, modelCode);
  }, [facilityId, modelCode]);

  const telemetry = useMemo(() => {
    return getBreakEvenTelemetry(facilityId, modelCode);
  }, [facilityId, modelCode]);

  // Simulation result
  const simulation = useMemo(() => {
    if (!analysis || !analysis.model) return null;
    return simulateBreakEvenSensitivity(analysis.model, {
      targetEbitda,
      supplyInflationPercent,
      reimbursementChangePercent,
      fixedCostShift
    });
  }, [analysis, targetEbitda, supplyInflationPercent, reimbursementChangePercent, fixedCostShift]);

  const handleApproveAndFreeze = () => {
    try {
      const res = approveAndFreezeBreakEvenModel(modelCode, '00000000-0000-0000-0000-000000000001');
      setFreezeNotice(`Cryptographically sealed break-even model with SHA-256: ${res.frozenHash.slice(0, 16)}...`);
      setTimeout(() => setFreezeNotice(null), 6000);
    } catch (err) {
      console.error('Freeze error:', err);
    }
  };

  const handleResetSimulation = () => {
    setTargetEbitda(240000);
    setSupplyInflationPercent(0);
    setReimbursementChangePercent(0);
    setFixedCostShift(0);
  };

  const formatCurrency = (val, maxDecimals = 0) => {
    if (val === undefined || val === null || isNaN(val)) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: maxDecimals
    }).format(val);
  };

  const formatPercent = (val) => {
    if (val === undefined || val === null || isNaN(val)) return '0.0%';
    return `${Number(val).toFixed(1)}%`;
  };

  if (!analysis || !telemetry) {
    return (
      <div className="be-container">
        <div className="be-loading">Loading Break-Even Analysis Engine...</div>
      </div>
    );
  }

  const { model, specialties } = analysis;

  return (
    <div className="be-container">
      {/* Freeze Alert Banner */}
      {freezeNotice && (
        <div className="be-freeze-banner">
          <CheckCircle size={18} className="text-emerald" />
          <span>{freezeNotice}</span>
          <button className="be-btn-banner-close" onClick={() => setFreezeNotice(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Header Card */}
      <div className="be-header-card">
        <div className="be-header-left">
          <div className="be-header-badges">
            <span className="be-badge-facility">Naples Surgery Center</span>
            <span className="be-badge-phase">Phase E4 - Module 14</span>
            <span className="be-badge-status">
              <Lock size={12} /> {telemetry.status}
            </span>
            <span className="be-badge-period">
              Baseline: {model?.baselinePeriodCode || '2026-M10'} (October Close)
            </span>
          </div>
          <h2 className="be-header-title">Break-Even Analysis & Cost-Volume-Profit (CVP) Engine</h2>
          <p className="be-header-subtitle">
            Deterministic CVP modeling segregating fixed operating overhead from variable surgical procedural costs,
            with specialty contribution margins, margin of safety (MOS), and target profit simulations.
          </p>
        </div>

        <div className="be-header-actions">
          <button className="be-btn-secondary" onClick={() => setShowDrawer(true)}>
            <Sliders size={16} />
            <span>Overhead & Parameters</span>
          </button>
          <button className="be-btn-primary" onClick={handleApproveAndFreeze}>
            <ShieldCheck size={16} />
            <span>Approve & Freeze Seal</span>
          </button>
        </div>
      </div>

      {/* Executive CVP Ribbon */}
      <div className="be-ribbon-grid">
        {/* Card 1: Break-Even Volume */}
        <div className="be-ribbon-card">
          <div className="be-card-top">
            <span className="be-card-label">MONTHLY BREAK-EVEN VOLUME</span>
            <Target size={16} className="text-sky" />
          </div>
          <div className="be-card-value font-mono">
            {telemetry.breakEvenCases} <span className="be-card-unit">cases</span>
          </div>
          <div className="be-card-meta">
            <span className="be-meta-pill neutral">Daily Run: {telemetry.dailyBreakEvenCases} cases</span>
            <span className="be-meta-sub">21 operating days / 4 ORs</span>
          </div>
        </div>

        {/* Card 2: Break-Even Revenue */}
        <div className="be-ribbon-card">
          <div className="be-card-top">
            <span className="be-card-label">BREAK-EVEN REVENUE</span>
            <DollarSign size={16} className="text-amber" />
          </div>
          <div className="be-card-value font-mono">
            {formatCurrency(telemetry.breakEvenRevenue)}
          </div>
          <div className="be-card-meta">
            <span className="be-meta-pill neutral">CMR: {formatPercent(telemetry.contributionMarginRatio * 100)}</span>
            <span className="be-meta-sub">Fixed Cost / CM Ratio</span>
          </div>
        </div>

        {/* Card 3: Unit Contribution Margin */}
        <div className="be-ribbon-card">
          <div className="be-card-top">
            <span className="be-card-label">AVG CONTRIBUTION MARGIN</span>
            <TrendingUp size={16} className="text-emerald" />
          </div>
          <div className="be-card-value font-mono text-emerald">
            {formatCurrency(telemetry.unitContributionMargin)} <span className="be-card-unit">/ case</span>
          </div>
          <div className="be-card-meta">
            <span className="be-meta-pill favorable">41.7% of NPR</span>
            <span className="be-meta-sub">Rev: {formatCurrency(telemetry.averageRevenuePerCase)} - VC: {formatCurrency(telemetry.averageVariableCostPerCase)}</span>
          </div>
        </div>

        {/* Card 4: Margin of Safety */}
        <div className="be-ribbon-card">
          <div className="be-card-top">
            <span className="be-card-label">MARGIN OF SAFETY (MOS)</span>
            <ShieldCheck size={16} className="text-emerald" />
          </div>
          <div className="be-card-value font-mono text-emerald">
            {telemetry.marginOfSafetyCases} <span className="be-card-unit">cases ({formatPercent(telemetry.marginOfSafetyPercent)})</span>
          </div>
          <div className="be-card-meta">
            <span className="be-meta-pill favorable">50.0% Buffer</span>
            <span className="be-meta-sub">Actual: {telemetry.actualCases} cases</span>
          </div>
        </div>

        {/* Card 5: Operating Leverage */}
        <div className="be-ribbon-card">
          <div className="be-card-top">
            <span className="be-card-label">OPERATING LEVERAGE (DOL)</span>
            <Activity size={16} className="text-sky" />
          </div>
          <div className="be-card-value font-mono">
            {telemetry.degreeOfOperatingLeverage.toFixed(2)}x
          </div>
          <div className="be-card-meta">
            <span className="be-meta-pill neutral">Moderate Leverage</span>
            <span className="be-meta-sub">Total CM ($480k) / EBITDA ($240k)</span>
          </div>
        </div>
      </div>

      {/* Main Grid: CVP Visual Chart & Sensitivity Simulator */}
      <div className="be-analytics-grid">
        {/* Visual CVP Break-Even Graph */}
        <div className="be-card be-chart-card">
          <div className="be-card-header">
            <div>
              <h3 className="be-section-title">Cost-Volume-Profit (CVP) Break-Even Curve</h3>
              <p className="be-section-sub">
                Linear crossover of Total Net Patient Revenue against Fixed ($240k) and Variable ($2,792/case) costs
              </p>
            </div>
            <div className="be-chart-legend">
              <span className="be-legend-item"><span className="be-legend-dot blue"></span> Revenue</span>
              <span className="be-legend-item"><span className="be-legend-dot red"></span> Total Costs</span>
              <span className="be-legend-item"><span className="be-legend-dot dashed"></span> Fixed Costs ($240k)</span>
            </div>
          </div>

          <div className="be-cvp-graph-container">
            <svg viewBox="0 0 700 320" className="be-cvp-svg" preserveAspectRatio="none">
              <defs>
                <linearGradient id="profitZoneGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.03" />
                </linearGradient>
                <linearGradient id="lossZoneGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity="0.20" />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity="0.03" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line x1="80" y1="40" x2="660" y2="40" stroke="#334155" strokeDasharray="3,3" opacity="0.3" />
              <line x1="80" y1="100" x2="660" y2="100" stroke="#334155" strokeDasharray="3,3" opacity="0.3" />
              <line x1="80" y1="160" x2="660" y2="160" stroke="#334155" strokeDasharray="3,3" opacity="0.3" />
              <line x1="80" y1="220" x2="660" y2="220" stroke="#334155" strokeDasharray="3,3" opacity="0.3" />
              <line x1="80" y1="280" x2="660" y2="280" stroke="#64748b" strokeWidth="1.5" />
              <line x1="80" y1="30" x2="80" y2="280" stroke="#64748b" strokeWidth="1.5" />

              {/* Y Axis Labels */}
              <text x="70" y="45" className="be-svg-axis-label" textAnchor="end">$1.2M</text>
              <text x="70" y="105" className="be-svg-axis-label" textAnchor="end">$900k</text>
              <text x="70" y="165" className="be-svg-axis-label" textAnchor="end">$600k</text>
              <text x="70" y="225" className="be-svg-axis-label" textAnchor="end">$300k</text>
              <text x="70" y="284" className="be-svg-axis-label" textAnchor="end">$0</text>

              {/* X Axis Labels */}
              <text x="80" y="300" className="be-svg-axis-label" textAnchor="middle">0</text>
              <text x="225" y="300" className="be-svg-axis-label" textAnchor="middle">60 cases</text>
              <text x="370" y="300" className="be-svg-axis-label" textAnchor="middle">120 (Break-Even)</text>
              <text x="515" y="300" className="be-svg-axis-label" textAnchor="middle">180 cases</text>
              <text x="660" y="300" className="be-svg-axis-label" textAnchor="middle">240 (Actual)</text>

              {/* Loss Area Polygon (0 to 120 cases): from Total Cost line to Revenue line */}
              {/* x=80: TotalCost=232, Rev=280; x=370: BE point y=165 */}
              <polygon points="80,232 370,165 80,280" fill="url(#lossZoneGradient)" />
              <text x="180" y="240" className="be-svg-zone-loss">OPERATING LOSS ZONE</text>

              {/* Profit Area Polygon (120 to 240 cases): from Revenue line to Total Cost line */}
              {/* x=370: BE point y=165; x=660: Rev=50, TotalCost=98 */}
              <polygon points="370,165 660,50 660,98" fill="url(#profitZoneGradient)" />
              <text x="520" y="80" className="be-svg-zone-profit">OPERATING PROFIT ZONE</text>

              {/* Fixed Cost Line ($240k = y: 232) */}
              <line x1="80" y1="232" x2="660" y2="232" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4,4" />
              <text x="662" y="228" className="be-svg-line-label text-amber" textAnchor="end">Fixed Overhead: $240k</text>

              {/* Total Cost Line: (0, $240k) -> (240, $910k) -> (80, 232) -> (660, 98) */}
              <line x1="80" y1="232" x2="660" y2="98" stroke="#ef4444" strokeWidth="2.5" />

              {/* Revenue Line: (0, $0) -> (240, $1.15M) -> (80, 280) -> (660, 50) */}
              <line x1="80" y1="280" x2="660" y2="50" stroke="#0284c7" strokeWidth="2.5" />

              {/* Break-Even Intersection Point (x: 370, y: 165) */}
              <line x1="370" y1="165" x2="370" y2="280" stroke="#0f766e" strokeWidth="1.5" strokeDasharray="3,3" />
              <circle cx="370" cy="165" r="6" fill="#0d9488" stroke="#ffffff" strokeWidth="2" />
              <text x="370" y="150" className="be-svg-point-label" textAnchor="middle">Break-Even: 120 Cases ($575k)</text>

              {/* Operating Point: Actual MTD (x: 660, y: 50 for Rev, 98 for Cost) */}
              <line x1="660" y1="50" x2="660" y2="280" stroke="#10b981" strokeWidth="1.5" strokeDasharray="3,3" />
              <circle cx="660" cy="50" r="5" fill="#0284c7" stroke="#ffffff" strokeWidth="2" />
              <circle cx="660" cy="98" r="5" fill="#ef4444" stroke="#ffffff" strokeWidth="2" />

              {/* Margin of Safety Bracket (370 to 660 on bottom) */}
              <line x1="370" y1="265" x2="660" y2="265" stroke="#10b981" strokeWidth="2" />
              <line x1="370" y1="260" x2="370" y2="270" stroke="#10b981" strokeWidth="2" />
              <line x1="660" y1="260" x2="660" y2="270" stroke="#10b981" strokeWidth="2" />
              <text x="515" y="258" className="be-svg-mos-label" textAnchor="middle">Margin of Safety: 120 Cases (50%)</text>
            </svg>
          </div>

          <div className="be-graph-footer">
            <div className="be-footer-stat">
              <span className="be-fstat-label">Actual Volume:</span>
              <span className="be-fstat-val">240 Cases</span>
            </div>
            <div className="be-footer-stat">
              <span className="be-fstat-label">Net Patient Revenue:</span>
              <span className="be-fstat-val">$1,150,000</span>
            </div>
            <div className="be-footer-stat">
              <span className="be-fstat-label">Total Variable Cost:</span>
              <span className="be-fstat-val">$670,000</span>
            </div>
            <div className="be-footer-stat">
              <span className="be-fstat-label">Fixed Overhead:</span>
              <span className="be-fstat-val">$240,000</span>
            </div>
            <div className="be-footer-stat highlight">
              <span className="be-fstat-label">Operating EBITDA:</span>
              <span className="be-fstat-val text-emerald">$240,000</span>
            </div>
          </div>
        </div>

        {/* Target Profit & Sensitivity Simulator */}
        <div className="be-card be-sim-card">
          <div className="be-card-header">
            <div>
              <h3 className="be-section-title">Target Profit & Sensitivity Simulator</h3>
              <p className="be-section-sub">Simulate required volume for EBITDA goals and stress-test cost inflation</p>
            </div>
            <button className="be-btn-reset" onClick={handleResetSimulation} title="Reset to Baseline">
              <RefreshCw size={14} />
              <span>Reset</span>
            </button>
          </div>

          <div className="be-sliders-container">
            {/* Slider 1: Target EBITDA */}
            <div className="be-slider-group">
              <div className="be-slider-header">
                <span className="be-slabel">Target Monthly EBITDA:</span>
                <span className="be-sval font-mono text-emerald">{formatCurrency(targetEbitda)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="500000"
                step="10000"
                value={targetEbitda}
                onChange={(e) => setTargetEbitda(Number(e.target.value))}
                className="be-slider"
              />
              <div className="be-slider-ticks">
                <span>$0</span>
                <span>$240k (Actual)</span>
                <span>$500k</span>
              </div>
            </div>

            {/* Slider 2: Supply & Implant Inflation */}
            <div className="be-slider-group">
              <div className="be-slider-header">
                <span className="be-slabel">Supply / Implant Inflation:</span>
                <span className={`be-sval font-mono ${supplyInflationPercent > 0 ? 'text-amber' : 'text-slate'}`}>
                  {supplyInflationPercent > 0 ? `+${supplyInflationPercent}%` : `${supplyInflationPercent}%`}
                </span>
              </div>
              <input
                type="range"
                min="-10"
                max="25"
                step="1"
                value={supplyInflationPercent}
                onChange={(e) => setSupplyInflationPercent(Number(e.target.value))}
                className="be-slider"
              />
              <div className="be-slider-ticks">
                <span>-10%</span>
                <span>0% (Baseline)</span>
                <span>+25%</span>
              </div>
            </div>

            {/* Slider 3: Reimbursement Compression */}
            <div className="be-slider-group">
              <div className="be-slider-header">
                <span className="be-slabel">Payer Contract Yield Shift:</span>
                <span className={`be-sval font-mono ${reimbursementChangePercent >= 0 ? 'text-emerald' : 'text-crimson'}`}>
                  {reimbursementChangePercent > 0 ? `+${reimbursementChangePercent}%` : `${reimbursementChangePercent}%`}
                </span>
              </div>
              <input
                type="range"
                min="-15"
                max="15"
                step="1"
                value={reimbursementChangePercent}
                onChange={(e) => setReimbursementChangePercent(Number(e.target.value))}
                className="be-slider"
              />
              <div className="be-slider-ticks">
                <span>-15%</span>
                <span>0% (Baseline)</span>
                <span>+15%</span>
              </div>
            </div>
          </div>

          {/* Simulation Output Cards */}
          {simulation && (
            <div className="be-sim-results">
              <div className="be-sim-result-box">
                <span className="be-sim-box-label">REQUIRED CASES FOR TARGET</span>
                <span className="be-sim-box-val font-mono text-emerald">
                  {simulation.targetCases} <span className="be-card-unit">cases</span>
                </span>
                <span className="be-sim-box-sub">
                  {(simulation.targetCases / 21).toFixed(1)} cases / day
                </span>
              </div>

              <div className="be-sim-result-box">
                <span className="be-sim-box-label">ADJUSTED BREAK-EVEN</span>
                <span className="be-sim-box-val font-mono">
                  {simulation.breakEvenCases} <span className="be-card-unit">cases</span>
                </span>
                <span className="be-sim-box-sub">
                  Rev: {formatCurrency(simulation.breakEvenRevenue)}
                </span>
              </div>

              <div className="be-sim-result-box">
                <span className="be-sim-box-label">ADJUSTED UNIT CM</span>
                <span className="be-sim-box-val font-mono text-sky">
                  {formatCurrency(simulation.adjustedUnitCm)}
                </span>
                <span className="be-sim-box-sub">
                  CMR: {formatPercent(simulation.adjustedCmr * 100)}
                </span>
              </div>

              <div className="be-sim-result-box">
                <span className="be-sim-box-label">PROJECTED MOS BUFFER</span>
                <span className={`be-sim-box-val font-mono ${simulation.marginOfSafetyCases >= 0 ? 'text-emerald' : 'text-crimson'}`}>
                  {simulation.marginOfSafetyCases} <span className="be-card-unit">cases</span>
                </span>
                <span className="be-sim-box-sub">
                  {formatPercent(simulation.marginOfSafetyPercent)} cushion
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Specialty CVP Economics Table */}
      <div className="be-card be-specialties-card">
        <div className="be-card-header">
          <div>
            <h3 className="be-section-title">Specialty-Level Contribution Margins & Break-Even Economics</h3>
            <p className="be-section-sub">
              Procedural unit economics segregating direct implants, supplies, and surgical labor from allocated fixed overhead
            </p>
          </div>
          <div className="be-table-badge">
            5 Active Specialties
          </div>
        </div>

        <div className="be-table-container">
          <table className="be-table">
            <thead>
              <tr>
                <th className="be-th text-left">Specialty Name</th>
                <th className="be-th text-right">Actual Cases</th>
                <th className="be-th text-right">Avg Dur (min)</th>
                <th className="be-th text-right">Revenue / Case</th>
                <th className="be-th text-right">Variable Cost</th>
                <th className="be-th text-right">Unit CM</th>
                <th className="be-th text-right">CM Ratio</th>
                <th className="be-th text-right">Allocated Fixed</th>
                <th className="be-th text-right">Break-Even</th>
                <th className="be-th text-right">Margin of Safety</th>
              </tr>
            </thead>
            <tbody>
              {specialties.map(spec => (
                <tr key={spec.specialtyCode} className="be-tr">
                  <td className="be-td text-left">
                    <div className="be-specialty-name font-medium">{spec.specialtyName}</div>
                    <div className="be-specialty-code font-mono">{spec.specialtyCode}</div>
                  </td>
                  <td className="be-td text-right font-mono">{spec.actualMonthlyCases}</td>
                  <td className="be-td text-right font-mono">{spec.averageCaseDurationMinutes}m</td>
                  <td className="be-td text-right font-mono">{formatCurrency(spec.revenuePerCase)}</td>
                  <td className="be-td text-right font-mono text-slate-400">
                    {formatCurrency(spec.variableCostPerCase)}
                    <span className="be-cost-sub">
                      (Imp: {formatCurrency(spec.implantCostPerCase)} | Sup: {formatCurrency(spec.supplyCostPerCase)})
                    </span>
                  </td>
                  <td className="be-td text-right font-mono font-bold text-emerald">
                    {formatCurrency(spec.unitContributionMargin)}
                  </td>
                  <td className="be-td text-right font-mono">
                    {formatPercent(spec.contributionMarginRatio * 100)}
                  </td>
                  <td className="be-td text-right font-mono text-amber">
                    {formatCurrency(spec.allocatedFixedCost)}
                  </td>
                  <td className="be-td text-right font-mono font-semibold">
                    {spec.specialtyBreakEvenCases} cases
                  </td>
                  <td className="be-td text-right font-mono">
                    <span className={`be-table-pill ${spec.marginOfSafetyCases > 10 ? 'favorable' : 'neutral'}`}>
                      +{spec.marginOfSafetyCases} ({formatPercent(spec.marginOfSafetyPercent)})
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="be-tfoot-tr font-bold">
                <td className="be-td text-left">ASC Total / Weighted Average</td>
                <td className="be-td text-right font-mono">240 cases</td>
                <td className="be-td text-right font-mono">76m</td>
                <td className="be-td text-right font-mono">{formatCurrency(telemetry.averageRevenuePerCase)}</td>
                <td className="be-td text-right font-mono">{formatCurrency(telemetry.averageVariableCostPerCase)}</td>
                <td className="be-td text-right font-mono text-emerald">{formatCurrency(telemetry.unitContributionMargin)}</td>
                <td className="be-td text-right font-mono">{formatPercent(telemetry.contributionMarginRatio * 100)}</td>
                <td className="be-td text-right font-mono text-amber">{formatCurrency(telemetry.fixedOverheadCosts)}</td>
                <td className="be-td text-right font-mono">{telemetry.breakEvenCases} cases</td>
                <td className="be-td text-right font-mono">
                  <span className="be-table-pill favorable">
                    +{telemetry.marginOfSafetyCases} ({formatPercent(telemetry.marginOfSafetyPercent)})
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Side Drawer: Overhead Parameters & Cryptographic Seal */}
      {showDrawer && (
        <div className="be-drawer-backdrop" onClick={() => setShowDrawer(false)}>
          <div className="be-drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div className="be-drawer-header">
              <div className="be-dheader-title">
                <Sliders size={18} className="text-sky" />
                <h3>Fixed Overhead & Model Governance</h3>
              </div>
              <button className="be-btn-drawer-close" onClick={() => setShowDrawer(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="be-drawer-content">
              {/* Fixed Cost Decomposition */}
              <div className="be-drawer-section">
                <h4 className="be-dsection-title">Monthly Fixed Overhead Breakdown ($240,000)</h4>
                <p className="be-dsection-desc">
                  Committed facility expenses segregated from surgical procedure volume:
                </p>

                <div className="be-breakdown-list">
                  <div className="be-breakdown-row">
                    <span className="be-brow-label">Facility & OR Space Lease:</span>
                    <span className="be-brow-val font-mono">$110,000.00 (45.8%)</span>
                  </div>
                  <div className="be-breakdown-row">
                    <span className="be-brow-label">Clinical Equipment Depreciation:</span>
                    <span className="be-brow-val font-mono">$55,000.00 (22.9%)</span>
                  </div>
                  <div className="be-breakdown-row">
                    <span className="be-brow-label">Administrative, RCM & IT Overhead:</span>
                    <span className="be-brow-val font-mono">$45,000.00 (18.8%)</span>
                  </div>
                  <div className="be-breakdown-row">
                    <span className="be-brow-label">Utilities, Insurance & Licenses:</span>
                    <span className="be-brow-val font-mono">$30,000.00 (12.5%)</span>
                  </div>
                  <div className="be-breakdown-row total font-bold">
                    <span className="be-brow-label">Total Monthly Fixed Costs:</span>
                    <span className="be-brow-val font-mono text-amber">$240,000.00 (100.0%)</span>
                  </div>
                </div>
              </div>

              {/* Model Provenance & Cryptographic Seal */}
              <div className="be-drawer-section">
                <h4 className="be-dsection-title">Cryptographic Seal & Immutability</h4>
                <div className="be-provenance-box">
                  <div className="be-prow">
                    <span className="be-plabel">Model Code:</span>
                    <span className="be-pval font-mono">{model.modelCode}</span>
                  </div>
                  <div className="be-prow">
                    <span className="be-plabel">Status:</span>
                    <span className="be-pval font-mono text-emerald">{model.status}</span>
                  </div>
                  <div className="be-prow">
                    <span className="be-plabel">Baseline Close:</span>
                    <span className="be-pval font-mono">{model?.baselinePeriodCode || '2026-M10'}</span>
                  </div>
                  <div className="be-prow">
                    <span className="be-plabel">Approved At:</span>
                    <span className="be-pval font-mono">{model.approvedAt ? new Date(model.approvedAt).toLocaleDateString() : 'Pending'}</span>
                  </div>
                  <div className="be-prow">
                    <span className="be-plabel">SHA-256 Audit Seal:</span>
                    <span className="be-pval-hash font-mono">{model.frozenHash}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="be-drawer-footer">
              <button className="be-btn-drawer-action" onClick={() => setShowDrawer(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
