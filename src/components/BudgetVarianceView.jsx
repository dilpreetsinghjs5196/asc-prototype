/**
 * ==============================================================================
 * Phase E1: Budget vs. Actual & Variance Reporting View
 * Module 14: CFO Dashboard & Financial Accounting
 * Description: Executive Budget vs Actual interface featuring 5-card telemetry ribbon,
 *              3-way variance waterfall bridge (volume, rate, mix), flexible budgeting,
 *              materiality severity tagging, and root cause mitigation drawer.
 * Maestro Clinical Design System: Emerald, Amber, Crimson, Sky, Slate, Neutral
 * Zero Prohibited Accent Tokens
 * ==============================================================================
 */

import React, { useState, useMemo } from 'react';
import {
  DollarSign,
  TrendingUp,
  Clock,
  Layers,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Download,
  Lock,
  Unlock,
  X,
  PieChart,
  Calendar,
  FileSpreadsheet,
  ArrowUpRight,
  ArrowDownRight,
  HelpCircle,
  Sliders,
  Scale
} from 'lucide-react';

import {
  BUDGET_STATUSES,
  ACCOUNT_CATEGORIES,
  SEVERITY_TIERS,
  getFacilityBudgets,
  getBudgetByIdOrCode,
  getBudgetVarianceLineItems,
  getBvaExecutiveTelemetry,
  approveAndFreezeBudget,
  saveVarianceExplanation,
  isExpenseOrCostCategory,
  matchesFacilityId
} from '../services/budgetVarianceService.js';

import './BudgetVarianceView.css';

export default function BudgetVarianceView({ activeFacility }) {
  const rawFacId = activeFacility?.id || (typeof activeFacility === 'string' ? activeFacility : null) || 'fac-naples-01';
  const facilityId = (rawFacId === '00000000-0000-0000-0000-000000000002') ? 'fac-naples-01' : rawFacId;
  const facilityName = activeFacility?.name || 'Naples Surgery Center';

  // State
  const [selectedBudgetCode, setSelectedBudgetCode] = useState('FY2026_ORIGINAL');
  const [selectedPeriodCode, setSelectedPeriodCode] = useState('2026-M10');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [polarityFilter, setPolarityFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Drawers & Modals
  const [selectedLineForDrawer, setSelectedLineForDrawer] = useState(null);
  const [drawerExplanation, setDrawerExplanation] = useState('');
  const [drawerActionPlan, setDrawerActionPlan] = useState('');
  const [feedbackToast, setFeedbackToast] = useState(null);

  // Budgets & Telemetry
  const availableBudgets = useMemo(() => getFacilityBudgets(facilityId), [facilityId]);
  
  const currentBudget = useMemo(() => {
    return getBudgetByIdOrCode(selectedBudgetCode, facilityId) || availableBudgets[0];
  }, [selectedBudgetCode, facilityId, availableBudgets]);

  const telemetry = useMemo(() => {
    return getBvaExecutiveTelemetry(facilityId, selectedPeriodCode, currentBudget?.id);
  }, [facilityId, selectedPeriodCode, currentBudget]);

  const lineItems = useMemo(() => {
    return getBudgetVarianceLineItems(currentBudget?.id, selectedPeriodCode, {
      category: categoryFilter,
      severity: severityFilter,
      favorable: polarityFilter,
      search: searchQuery
    });
  }, [currentBudget?.id, selectedPeriodCode, categoryFilter, severityFilter, polarityFilter, searchQuery]);

  // Handlers
  const showToast = (message) => {
    setFeedbackToast(message);
    setTimeout(() => setFeedbackToast(null), 3500);
  };

  const handleApproveFreeze = () => {
    try {
      const approved = approveAndFreezeBudget(currentBudget.id, 'usr-cfo-001');
      showToast(`Budget ${approved.budgetCode} successfully approved & cryptographically sealed.`);
    } catch (err) {
      showToast(`Approval failed: ${err.message}`);
    }
  };

  const handleOpenDrawer = (line) => {
    setSelectedLineForDrawer(line);
    setDrawerExplanation(line.explanation || '');
    setDrawerActionPlan(line.actionPlan || '');
  };

  const handleSaveDrawer = () => {
    if (!selectedLineForDrawer) return;
    try {
      saveVarianceExplanation(selectedLineForDrawer.id, drawerExplanation, drawerActionPlan, 'usr-cfo-001');
      showToast(`Mitigation plan saved for ${selectedLineForDrawer.lineName}`);
      setSelectedLineForDrawer(null);
    } catch (err) {
      showToast(`Save failed: ${err.message}`);
    }
  };

  const handleExportDossier = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify({
      facility: facilityName,
      budget: currentBudget,
      telemetry,
      lineItems
    }, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `BVA_Dossier_${currentBudget?.budgetCode}_${selectedPeriodCode}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast(`BvA Financial Dossier exported successfully.`);
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(val || 0);
  };

  const formatExactCurrency = (val) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(val || 0);
  };

  return (
    <div className="budget-variance-view">
      {/* Toast Feedback */}
      {feedbackToast && (
        <div className="bva-toast">
          <CheckCircle2 size={16} />
          <span>{feedbackToast}</span>
        </div>
      )}

      {/* Header */}
      <div className="bva-header">
        <div className="header-left">
          <div className="header-title-row">
            <h2>Budget vs. Actual (BvA) & Variance Reporting</h2>
            <div className="header-badges-row">
              <span className="badge-facility">{facilityName}</span>
              <span className="badge-module">Phase E1 - Module 14</span>
              {currentBudget?.isApproved ? (
                <span className="badge-budget-status status-approved">
                  <Lock size={12} />
                  APPROVED_ACTIVE
                </span>
              ) : (
                <span className="badge-budget-status status-draft">
                  <Unlock size={12} />
                  {currentBudget?.status || 'DRAFT'}
                </span>
              )}
            </div>
          </div>
          <p className="header-description">
            Deterministic variance reporting bridging surgical procedural economics to annual budget models. Features 3-way volume/rate/mix variance decomposition, flexible budgeting benchmarks, and CFO mitigation tracking.
          </p>
        </div>

        <div className="header-actions">
          <button className="btn-secondary" onClick={handleExportDossier}>
            <Download size={14} />
            Export BvA Dossier
          </button>
          {!currentBudget?.isApproved && (
            <button className="btn-primary" onClick={handleApproveFreeze}>
              <Lock size={14} />
              Approve & Freeze Budget
            </button>
          )}
        </div>
      </div>

      {/* 5-Card CFO Executive Ribbon */}
      <div className="bva-telemetry-ribbon">
        {/* Card 1: Net Patient Revenue */}
        <div className="metric-card">
          <div className="card-top">
            <span className="card-label">NET PATIENT REVENUE (NPR)</span>
            <DollarSign size={16} className="text-emerald" />
          </div>
          <div className="card-value font-mono">
            {formatCurrency(telemetry?.npr?.actual)}
          </div>
          <div className="card-subtext">
            Budget: <strong className="font-mono">{formatCurrency(telemetry?.npr?.budget)}</strong>
          </div>
          <div className="card-footer-metric">
            <span className={`variance-pill ${telemetry?.npr?.isFavorable ? 'pill-favorable' : 'pill-unfavorable'}`}>
              {telemetry?.npr?.variance >= 0 ? '+' : ''}{formatCurrency(telemetry?.npr?.variance)} ({telemetry?.npr?.percentVariance}%)
            </span>
            <span className="subtext-muted">{telemetry?.npr?.isFavorable ? 'Favorable' : 'Deficit'}</span>
          </div>
        </div>

        {/* Card 2: Direct Clinical Costs */}
        <div className="metric-card">
          <div className="card-top">
            <span className="card-label">DIRECT CLINICAL COSTS</span>
            <Layers size={16} className="text-sky" />
          </div>
          <div className="card-value font-mono highlight-sky">
            {formatCurrency(telemetry?.directCosts?.actual)}
          </div>
          <div className="card-subtext">
            Budget: <strong className="font-mono">{formatCurrency(telemetry?.directCosts?.budget)}</strong>
          </div>
          <div className="card-footer-metric">
            <span className={`variance-pill ${telemetry?.directCosts?.isFavorable ? 'pill-favorable' : 'pill-unfavorable'}`}>
              {telemetry?.directCosts?.variance <= 0 ? '' : '+'}{formatCurrency(telemetry?.directCosts?.variance)} ({telemetry?.directCosts?.percentVariance}%)
            </span>
            <span className="subtext-muted">{telemetry?.directCosts?.isFavorable ? 'Cost Savings' : 'Overrun'}</span>
          </div>
        </div>

        {/* Card 3: Operating EBITDA */}
        <div className="metric-card">
          <div className="card-top">
            <span className="card-label">OPERATING EBITDA</span>
            <TrendingUp size={16} className="text-emerald" />
          </div>
          <div className="card-value font-mono">
            {formatCurrency(telemetry?.ebitda?.actual)}
          </div>
          <div className="card-subtext">
            Target: <strong className="font-mono">{formatCurrency(telemetry?.ebitda?.budget)}</strong>
          </div>
          <div className="card-footer-metric">
            <span className={`variance-pill ${telemetry?.ebitda?.isFavorable ? 'pill-favorable' : 'pill-unfavorable'}`}>
              {telemetry?.ebitda?.variance >= 0 ? '+' : ''}{formatCurrency(telemetry?.ebitda?.variance)} ({telemetry?.ebitda?.percentVariance}%)
            </span>
            <span className="subtext-muted">Cash Yield</span>
          </div>
        </div>

        {/* Card 4: Surgical Case Volume */}
        <div className="metric-card">
          <div className="card-top">
            <span className="card-label">SURGICAL CASE VOLUME</span>
            <Clock size={16} className="text-slate" />
          </div>
          <div className="card-value font-mono">
            {telemetry?.volume?.actual} <span className="text-xs text-slate">cases</span>
          </div>
          <div className="card-subtext">
            Budget Target: <strong className="font-mono">{telemetry?.volume?.budget} cases</strong>
          </div>
          <div className="card-footer-metric">
            <span className={`variance-pill ${telemetry?.volume?.isFavorable ? 'pill-favorable' : 'pill-unfavorable'}`}>
              {telemetry?.volume?.variance >= 0 ? '+' : ''}{telemetry?.volume?.variance} cases ({telemetry?.volume?.percentVariance}%)
            </span>
            <span className="subtext-muted">Throughput</span>
          </div>
        </div>

        {/* Card 5: Variance Health & Critical Alerts */}
        <div className="metric-card">
          <div className="card-top">
            <span className="card-label">MATERIAL ALERTS</span>
            <AlertTriangle size={16} className="text-amber" />
          </div>
          <div className="card-value font-mono">
            {telemetry?.counts?.critical} <span className="text-xs text-slate">material</span>
          </div>
          <div className="card-subtext">
            Line Items: <strong className="font-mono">{telemetry?.counts?.favorable} Favorable / {telemetry?.counts?.unfavorable} Unfavorable</strong>
          </div>
          <div className="card-footer-metric">
            <span className="health-pill">
              {telemetry?.counts?.critical === 0 ? 'Optimal Control' : 'Review Required'}
            </span>
          </div>
        </div>
      </div>

      {/* 3-Way Variance Waterfall Bridge Card */}
      <div className="bva-bridge-card">
        <div className="bridge-header">
          <div className="bridge-title-group">
            <Sliders size={18} className="text-emerald" />
            <div>
              <h3>EBITDA Variance Bridge (Volume vs. Rate vs. Mix Decomposition)</h3>
              <span className="bridge-subtext">
                Decomposes the -$10,000 EBITDA variance between budgeted $320,000 and actual $310,000 into underlying surgical drivers.
              </span>
            </div>
          </div>
          <div className="bridge-metrics-group">
            <span className="metric-tag tag-budget">Budget EBITDA: $320,000</span>
            <span className="metric-tag tag-actual">Actual EBITDA: $310,000</span>
          </div>
        </div>

        <div className="bridge-waterfall-grid">
          <div className="bridge-step-card step-start">
            <span className="step-label">1. Budget EBITDA</span>
            <span className="step-val font-mono">$320,000</span>
            <span className="step-note">Baseline Target</span>
          </div>

          <div className="bridge-step-card step-delta delta-unfavorable">
            <span className="step-label">2. Volume Impact</span>
            <span className="step-val font-mono">-$12,800</span>
            <span className="step-note">-10 cases @ $1,280/case</span>
          </div>

          <div className="bridge-step-card step-delta delta-favorable">
            <span className="step-label">3. Rate / Price Impact</span>
            <span className="step-val font-mono">+$17,200</span>
            <span className="step-note">+$71.67 avg reimbursement/case</span>
          </div>

          <div className="bridge-step-card step-delta delta-unfavorable">
            <span className="step-label">4. Specialty Mix Impact</span>
            <span className="step-val font-mono">-$14,400</span>
            <span className="step-note">Construct shift & acuity</span>
          </div>

          <div className="bridge-step-card step-end">
            <span className="step-label">5. Actual EBITDA</span>
            <span className="step-val font-mono">$310,000</span>
            <span className="step-note">Realized P&L Margin</span>
          </div>
        </div>
      </div>

      {/* Toolbar: Budget Version, Period, Search & Filter Controls */}
      <div className="bva-toolbar-card">
        <div className="toolbar-left">
          {/* Budget Version Selector */}
          <div className="picker-group">
            <span className="picker-label">BUDGET MODEL:</span>
            <div className="picker-select-wrapper">
              <Scale size={14} className="picker-icon" />
              <select
                value={selectedBudgetCode}
                onChange={(e) => setSelectedBudgetCode(e.target.value)}
                className="picker-select"
              >
                {availableBudgets.map((b) => (
                  <option key={b.id} value={b.budgetCode}>
                    {b.budgetName} ({b.budgetCode})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Period Selector */}
          <div className="picker-group">
            <span className="picker-label">PERIOD:</span>
            <div className="picker-select-wrapper">
              <Calendar size={14} className="picker-icon" />
              <select
                value={selectedPeriodCode}
                onChange={(e) => setSelectedPeriodCode(e.target.value)}
                className="picker-select"
              >
                <option value="2026-M10">October 2026 (2026-M10)</option>
                <option value="2026-M09">September 2026 (2026-M09)</option>
                <option value="2026-Q3">Q3 2026 Full Quarter</option>
                <option value="2026-FY">FY 2026 Full Year</option>
              </select>
            </div>
          </div>
        </div>

        <div className="toolbar-right">
          {/* Search Box */}
          <div className="search-box">
            <Search size={15} className="search-icon" />
            <input
              type="text"
              placeholder="Search line name, code, notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="search-clear-btn" onClick={() => setSearchQuery('')}>
                <X size={13} />
              </button>
            )}
          </div>

          {/* Category Filter */}
          <div className="filter-select-wrapper">
            <Filter size={14} className="filter-icon" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="filter-select"
            >
              <option value="ALL">All Categories</option>
              <option value={ACCOUNT_CATEGORIES.VOLUME}>Volume Drivers</option>
              <option value={ACCOUNT_CATEGORIES.GROSS_REVENUE}>Gross Revenue</option>
              <option value={ACCOUNT_CATEGORIES.CONTRACTUAL_DEDUCTION}>Contractual Deductions</option>
              <option value={ACCOUNT_CATEGORIES.NET_REVENUE}>Net Revenue (NPR)</option>
              <option value={ACCOUNT_CATEGORIES.DIRECT_COST}>Direct Clinical Costs</option>
              <option value={ACCOUNT_CATEGORIES.VARIABLE_COST}>Variable Facility Costs</option>
              <option value={ACCOUNT_CATEGORIES.FIXED_OVERHEAD}>Fixed Overhead</option>
              <option value={ACCOUNT_CATEGORIES.MARGIN}>Margins (CM, EBITDA, NOI)</option>
            </select>
          </div>

          {/* Polarity Filter */}
          <div className="filter-select-wrapper">
            <select
              value={polarityFilter}
              onChange={(e) => setPolarityFilter(e.target.value)}
              className="filter-select"
            >
              <option value="ALL">All Outcomes</option>
              <option value="FAVORABLE">Favorable Only</option>
              <option value="UNFAVORABLE">Unfavorable Only</option>
            </select>
          </div>

          {/* Severity Filter */}
          <div className="filter-select-wrapper">
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="filter-select"
            >
              <option value="ALL">All Severities</option>
              <option value={SEVERITY_TIERS.CRITICAL}>Critical Alerts (&gt;10%)</option>
              <option value={SEVERITY_TIERS.ATTENTION}>Attention (3% - 10%)</option>
              <option value={SEVERITY_TIERS.NORMAL}>Normal (0% - 3%)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Statement Table */}
      <div className="bva-table-wrapper">
        <table className="bva-table">
          <thead>
            <tr>
              <th style={{ width: '28%' }}>Line Item Description</th>
              <th className="font-mono text-center" style={{ width: '12%' }}>Code</th>
              <th className="text-right" style={{ width: '11%' }}>Actual</th>
              <th className="text-right" style={{ width: '11%' }}>Budget</th>
              <th className="text-right" style={{ width: '11%' }}>Flexible Budget</th>
              <th className="text-right" style={{ width: '10%' }}>$ Variance</th>
              <th className="text-right" style={{ width: '8%' }}>% Variance</th>
              <th className="text-center" style={{ width: '9%' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((line) => {
              const isCost = isExpenseOrCostCategory(line.accountCategory);
              const isMargin = line.accountCategory === ACCOUNT_CATEGORIES.MARGIN;
              const isNpr = line.lineCode === 'NPR';
              const isVolume = line.accountCategory === ACCOUNT_CATEGORIES.VOLUME;

              let rowClass = 'bva-line-row';
              if (isMargin || isNpr) rowClass += ' highlight-margin-row';

              return (
                <tr key={line.id} className={rowClass} onClick={() => handleOpenDrawer(line)}>
                  <td className="line-desc-cell">
                    <span className={isMargin || isNpr ? 'font-bold' : 'line-regular'}>
                      {line.lineName}
                    </span>
                    {line.explanation && (
                      <div className="explanation-hint text-xs text-slate">
                        Note: {line.explanation}
                      </div>
                    )}
                  </td>
                  <td className="font-mono text-xs text-center text-slate">
                    {line.lineCode}
                  </td>
                  <td className="text-right font-mono font-bold">
                    {isVolume ? `${line.actualAmount} ${line.unitOfMeasure.toLowerCase()}` : formatExactCurrency(line.actualAmount)}
                  </td>
                  <td className="text-right font-mono text-slate">
                    {isVolume ? `${line.budgetAmount} ${line.unitOfMeasure.toLowerCase()}` : formatExactCurrency(line.budgetAmount)}
                  </td>
                  <td className="text-right font-mono text-slate">
                    {isVolume ? '-' : formatExactCurrency(line.flexibleBudgetAmount)}
                  </td>
                  <td className={`text-right font-mono font-bold ${line.isFavorable ? 'text-emerald' : 'text-crimson'}`}>
                    {line.dollarVariance >= 0 ? '+' : ''}{isVolume ? line.dollarVariance : formatExactCurrency(line.dollarVariance)}
                  </td>
                  <td className={`text-right font-mono ${line.isFavorable ? 'text-emerald' : 'text-crimson'}`}>
                    {line.percentVariance >= 0 ? '+' : ''}{line.percentVariance}%
                  </td>
                  <td className="text-center">
                    <span className={`status-pill ${line.isFavorable ? 'pill-favorable' : 'pill-unfavorable'} ${line.severity === 'CRITICAL' ? 'pill-critical' : ''}`}>
                      {line.isFavorable ? 'Favorable' : 'Unfavorable'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Root Cause Mitigation Side Drawer */}
      {selectedLineForDrawer && (
        <div className="drawer-overlay" onClick={() => setSelectedLineForDrawer(null)}>
          <div className="drawer-container" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="drawer-title-group">
                <h3>Root Cause & Mitigation: {selectedLineForDrawer.lineName}</h3>
                <span className="font-mono text-xs text-slate">{selectedLineForDrawer.lineCode} | {selectedLineForDrawer.accountCategory}</span>
              </div>
              <button className="btn-close" onClick={() => setSelectedLineForDrawer(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="drawer-body">
              {/* Financial Metrics Summary */}
              <div className="drawer-card-grid">
                <div className="drawer-stat-box">
                  <span className="stat-label">ACTUAL AMOUNT</span>
                  <span className="stat-val font-mono">{formatExactCurrency(selectedLineForDrawer.actualAmount)}</span>
                </div>
                <div className="drawer-stat-box">
                  <span className="stat-label">BUDGET TARGET</span>
                  <span className="stat-val font-mono">{formatExactCurrency(selectedLineForDrawer.budgetAmount)}</span>
                </div>
                <div className="drawer-stat-box">
                  <span className="stat-label">FLEXIBLE BUDGET</span>
                  <span className="stat-val font-mono">{formatExactCurrency(selectedLineForDrawer.flexibleBudgetAmount)}</span>
                </div>
                <div className="drawer-stat-box">
                  <span className="stat-label">TOTAL VARIANCE</span>
                  <span className={`stat-val font-mono ${selectedLineForDrawer.isFavorable ? 'text-emerald' : 'text-crimson'}`}>
                    {formatExactCurrency(selectedLineForDrawer.dollarVariance)} ({selectedLineForDrawer.percentVariance}%)
                  </span>
                </div>
              </div>

              {/* 3-Way Variance Breakdown */}
              <div className="drawer-section">
                <h4>3-Way Variance Decomposition (Surgical Economics)</h4>
                <div className="decomp-grid">
                  <div className="decomp-col">
                    <span className="decomp-label">Volume Impact:</span>
                    <span className="decomp-val font-mono">{formatExactCurrency(selectedLineForDrawer.volumeImpact)}</span>
                    <span className="decomp-sub">Cases Delta (240 vs 250)</span>
                  </div>
                  <div className="decomp-col">
                    <span className="decomp-label">Rate / Price Impact:</span>
                    <span className="decomp-val font-mono">{formatExactCurrency(selectedLineForDrawer.rateImpact)}</span>
                    <span className="decomp-sub">Contractual reimbursement yield</span>
                  </div>
                  <div className="decomp-col">
                    <span className="decomp-label">Specialty Mix Impact:</span>
                    <span className="decomp-val font-mono">{formatExactCurrency(selectedLineForDrawer.mixImpact)}</span>
                    <span className="decomp-sub">Construct acuity & pack shifts</span>
                  </div>
                </div>
              </div>

              {/* Root Cause Explanation */}
              <div className="drawer-section">
                <h4>CFO Root Cause Analysis</h4>
                <textarea
                  className="drawer-textarea"
                  rows={4}
                  placeholder="Document clinical or operational drivers explaining this variance..."
                  value={drawerExplanation}
                  onChange={(e) => setDrawerExplanation(e.target.value)}
                />
              </div>

              {/* Action Plan */}
              <div className="drawer-section">
                <h4>Mitigation & Recovery Action Plan</h4>
                <textarea
                  className="drawer-textarea"
                  rows={4}
                  placeholder="Define corrective operational actions, physician outreach, or contract negotiations..."
                  value={drawerActionPlan}
                  onChange={(e) => setDrawerActionPlan(e.target.value)}
                />
              </div>
            </div>

            <div className="drawer-footer">
              <button className="btn-secondary" onClick={() => setSelectedLineForDrawer(null)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSaveDrawer}>
                Save Mitigation Plan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
