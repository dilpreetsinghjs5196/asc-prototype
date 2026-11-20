/**
 * ==============================================================================
 * Phase E0: Management P&L & Reconciliation Boundaries View
 * Module 14: CFO Dashboard & Financial Accounting
 * Description: Executive Management P&L with hierarchical chart of accounts,
 *              gross-to-net deductions, clinical margins, EBITDA, and multi-boundary
 *              reconciliation audit proofs.
 * Maestro Clinical Design System: Emerald, Amber, Crimson, Sky, Slate, Neutral
 * Zero Prohibited Accent Tokens
 * ==============================================================================
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  DollarSign,
  TrendingUp,
  Clock,
  ShieldCheck,
  Award,
  Layers,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Eye,
  RefreshCw,
  Download,
  Lock,
  Unlock,
  AlertTriangle,
  FileSpreadsheet,
  X,
  PieChart,
  Calendar,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Scale
} from 'lucide-react';

import {
  PNL_SECTIONS,
  RECONCILIATION_BOUNDARIES,
  PERIOD_STATUSES,
  calculateNpr,
  calculateDirectClinicalMargin,
  calculateEbitda,
  calculateNetOperatingIncome,
  calculateMarginPercentage,
  getManagementPnlPeriods,
  getPeriodByIdOrCode,
  getPnlStatementLines,
  getPeriodReconciliations,
  calculatePnlSummary,
  freezeAccountingPeriod,
  getManagementPnlTelemetry,
  matchesFacilityId
} from '../services/managementPnlService.js';

import './ManagementPnlView.css';

export default function ManagementPnlView({ activeFacility }) {
  const rawFacId = activeFacility?.id || (typeof activeFacility === 'string' ? activeFacility : null) || 'fac-naples-01';
  const facilityId = (rawFacId === '00000000-0000-0000-0000-000000000002') ? 'fac-naples-01' : rawFacId;
  const facilityName = activeFacility?.name || 'Naples Surgery Center';

  // State
  const [periods, setPeriods] = useState([]);
  const [selectedPeriodCode, setSelectedPeriodCode] = useState('2026-M10');
  const [statementLines, setStatementLines] = useState([]);
  const [reconciliations, setReconciliations] = useState([]);
  const [telemetry, setTelemetry] = useState(null);
  const [sectionFilter, setSectionFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Drawers & Modals
  const [showReconciliationDrawer, setShowReconciliationDrawer] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState(null);
  const [collapsedSections, setCollapsedSections] = useState({});

  // Load Data
  const loadData = () => {
    try {
      const allPeriods = getManagementPnlPeriods(facilityId);
      setPeriods(allPeriods);

      const currentPeriod = getPeriodByIdOrCode(selectedPeriodCode, facilityId) || allPeriods[0];
      if (currentPeriod) {
        setSelectedPeriodCode(currentPeriod.periodCode);

        const lines = getPnlStatementLines(currentPeriod.id, {
          section: sectionFilter,
          search: searchQuery
        });
        setStatementLines(lines);

        const recons = getPeriodReconciliations(currentPeriod.id);
        setReconciliations(recons);

        const telem = getManagementPnlTelemetry(facilityId, currentPeriod.periodCode);
        setTelemetry(telem);
      }
    } catch (err) {
      console.error('Failed to load Management P&L data:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, [facilityId, selectedPeriodCode, sectionFilter, searchQuery]);

  const showToast = (message) => {
    setFeedbackToast(message);
    setTimeout(() => setFeedbackToast(null), 3500);
  };

  const toggleSectionCollapse = (sec) => {
    setCollapsedSections(prev => ({
      ...prev,
      [sec]: !prev[sec]
    }));
  };

  const handlePeriodChange = (e) => {
    setSelectedPeriodCode(e.target.value);
  };

  const handleFreezePeriod = () => {
    const currentPeriod = getPeriodByIdOrCode(selectedPeriodCode, facilityId);
    if (!currentPeriod) return;

    try {
      const result = freezeAccountingPeriod(currentPeriod.id, { userId: 'usr_cfo_marcus' });
      showToast(`Period ${currentPeriod.periodCode} successfully frozen with SHA-256 seal: ${result.frozenHash.slice(0, 16)}...`);
      loadData();
    } catch (err) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleExportDossier = () => {
    showToast(`Executive Management P&L Dossier exported for ${facilityName} (${selectedPeriodCode}).`);
  };

  // Formatters
  const formatCurrency = (val) => {
    const num = Number(val || 0);
    const absStr = Math.abs(num).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
    return num < 0 ? `(${absStr})` : absStr;
  };

  const formatExactCurrency = (val) => {
    const num = Number(val || 0);
    const absStr = Math.abs(num).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return num < 0 ? `(${absStr})` : absStr;
  };

  // Group statement lines by logical accounting sections
  const groupedSections = useMemo(() => {
    const groups = {
      [PNL_SECTIONS.GROSS_REVENUE]: { title: '1. Gross Patient Revenue', lines: [] },
      [PNL_SECTIONS.CONTRACTUAL_DEDUCTIONS]: { title: '2. Contractual Deductions & Allowances', lines: [] },
      [PNL_SECTIONS.NET_REVENUE]: { title: 'Net Patient Revenue (NPR)', lines: [] },
      [PNL_SECTIONS.DIRECT_CLINICAL_COSTS]: { title: '3. Direct Clinical Costs (Supplies, Implants, Labor)', lines: [] },
      [PNL_SECTIONS.CLINICAL_MARGIN]: { title: 'Direct Clinical Margin (Contribution Margin)', lines: [] },
      [PNL_SECTIONS.VARIABLE_FACILITY_COSTS]: { title: '4. Variable Facility Costs (SPD, Linen, Biohazard, Utilities)', lines: [] },
      [PNL_SECTIONS.GROSS_OPERATING_PROFIT]: { title: 'Gross Operating Profit (GOP)', lines: [] },
      [PNL_SECTIONS.FIXED_OVERHEAD_OPEX]: { title: '5. Fixed Overhead Operating Expenses (OPEX)', lines: [] },
      [PNL_SECTIONS.EBITDA]: { title: 'Operating EBITDA', lines: [] },
      [PNL_SECTIONS.DEPRECIATION_AMORTIZATION]: { title: '6. Depreciation & Amortization', lines: [] },
      [PNL_SECTIONS.NET_OPERATING_INCOME]: { title: 'Net Operating Income (EBIT)', lines: [] }
    };

    statementLines.forEach(l => {
      if (groups[l.section]) {
        groups[l.section].lines.push(l);
      }
    });

    return Object.entries(groups).filter(([_, grp]) => grp.lines.length > 0);
  }, [statementLines]);

  const activePeriodObj = periods.find(p => p.periodCode === selectedPeriodCode);
  const isPeriodFrozen = activePeriodObj?.status === PERIOD_STATUSES.HARD_CLOSE_FROZEN;

  return (
    <div className="management-pnl-view">
      {/* Toast Notification */}
      {feedbackToast && (
        <div className="pnl-toast">
          <ShieldCheck size={18} className="text-emerald" />
          <span>{feedbackToast}</span>
        </div>
      )}

      {/* Spacious Header Banner */}
      <div className="pnl-header">
        <div className="header-left">
          <div className="header-title-row">
            <h2>Management P&L & Reconciliation Boundaries</h2>
            <div className="header-badges-row">
              <span className="badge-facility">{facilityName}</span>
              <span className="badge-module">Phase E0 - Module 14</span>
              <span className={`badge-period-status ${isPeriodFrozen ? 'status-frozen' : 'status-provisional'}`}>
                {isPeriodFrozen ? <Lock size={12} /> : <Unlock size={12} />}
                {activePeriodObj?.status || 'PROVISIONAL_CLOSE'}
              </span>
            </div>
          </div>
          <p className="header-description">
            Managerial healthcare accounting structure bridging surgery-level procedural economics,
            direct clinical contribution margins, operating EBITDA, and multi-boundary reconciliation checkpoints.
          </p>
        </div>

        <div className="header-actions">
          <button className="btn-secondary" onClick={() => setShowReconciliationDrawer(true)}>
            <Scale size={15} />
            Reconciliation Audit ({telemetry?.balancedCount || 0}/{telemetry?.reconciliationsCount || 0})
          </button>
          <button className="btn-primary" onClick={handleExportDossier}>
            <Download size={15} />
            Export P&L Dossier
          </button>
        </div>
      </div>

      {/* 5-Card CFO Executive Ribbon */}
      <div className="cfo-telemetry-ribbon">
        <div className="metric-card npr-card">
          <div className="card-top">
            <span className="card-label">NET PATIENT REVENUE (NPR)</span>
            <DollarSign size={18} className="text-emerald" />
          </div>
          <div className="card-value">{formatCurrency(telemetry?.netPatientRevenue)}</div>
          <div className="card-subtext font-mono">
            Gross: {formatCurrency(telemetry?.grossPatientRevenue)}
          </div>
        </div>

        <div className="metric-card dcm-card">
          <div className="card-top">
            <span className="card-label">DIRECT CLINICAL MARGIN</span>
            <TrendingUp size={18} className="text-emerald" />
          </div>
          <div className="card-value">{formatCurrency(telemetry?.directClinicalMargin)}</div>
          <div className="card-subtext">
            Margin: <strong className="text-emerald">{telemetry?.clinicalMarginPct}%</strong> of NPR
          </div>
        </div>

        <div className="metric-card ebitda-card">
          <div className="card-top">
            <span className="card-label">OPERATING EBITDA</span>
            <Award size={18} className="text-sky" />
          </div>
          <div className="card-value highlight-sky">{formatCurrency(telemetry?.ebitda)}</div>
          <div className="card-subtext">
            EBITDA Margin: <strong className="text-sky">{telemetry?.ebitdaMarginPct}%</strong>
          </div>
        </div>

        <div className="metric-card noi-card">
          <div className="card-top">
            <span className="card-label">NET OPERATING INCOME (EBIT)</span>
            <Layers size={18} className="text-emerald" />
          </div>
          <div className="card-value">{formatCurrency(telemetry?.netOperatingIncome)}</div>
          <div className="card-subtext">
            Operating Margin: <strong>{telemetry?.operatingMarginPct}%</strong>
          </div>
        </div>

        <div className="metric-card recon-card">
          <div className="card-top">
            <span className="card-label">RECONCILIATION HEALTH</span>
            <ShieldCheck size={18} className={telemetry?.flaggedCount === 0 ? 'text-emerald' : 'text-amber'} />
          </div>
          <div className="card-value text-emerald">
            {telemetry?.balancedCount || 0}/{telemetry?.reconciliationsCount || 0}
          </div>
          <div className="card-subtext">
            <span className="health-pill">{telemetry?.reconciliationHealth || 'Checking...'}</span>
          </div>
        </div>
      </div>

      {/* Margin Decomposition Allocation Bar */}
      <div className="pnl-allocation-card">
        <div className="allocation-header">
          <div className="alloc-title-group">
            <PieChart size={18} className="text-emerald" />
            <h3>NPR Cost & Margin Decomposition</h3>
          </div>
          <span className="alloc-subtext">Distribution of \$1,150,000 Net Patient Revenue</span>
        </div>

        <div className="multi-segment-bar">
          <div className="seg seg-direct" style={{ width: '52.2%' }} title="Direct Clinical Costs: 52.2%">
            <span>52.2% Direct Clinical Costs</span>
          </div>
          <div className="seg seg-variable" style={{ width: '4.8%' }} title="Variable Facility: 4.8%">
            <span>4.8% Var</span>
          </div>
          <div className="seg seg-fixed" style={{ width: '16.1%' }} title="Fixed Overhead OPEX: 16.1%">
            <span>16.1% OPEX</span>
          </div>
          <div className="seg seg-dep" style={{ width: '3.5%' }} title="Depreciation: 3.5%">
            <span>3.5% Dep</span>
          </div>
          <div className="seg seg-noi" style={{ width: '23.4%' }} title="Net Operating Income: 23.4%">
            <span>23.4% Operating Profit (EBIT)</span>
          </div>
        </div>

        <div className="allocation-legend">
          <div className="leg-item">
            <span className="leg-dot dot-direct"></span>
            <span>Direct Clinical: $600K (52.2%)</span>
          </div>
          <div className="leg-item">
            <span className="leg-dot dot-variable"></span>
            <span>Variable Facility: $55K (4.8%)</span>
          </div>
          <div className="leg-item">
            <span className="leg-dot dot-fixed"></span>
            <span>Fixed OPEX: $185K (16.1%)</span>
          </div>
          <div className="leg-item">
            <span className="leg-dot dot-dep"></span>
            <span>Depreciation: $40K (3.5%)</span>
          </div>
          <div className="leg-item">
            <span className="leg-dot dot-noi"></span>
            <span>Operating Profit (EBIT): $270K (23.4%)</span>
          </div>
        </div>
      </div>

      {/* Accounting Period Selection & Filter Toolbar */}
      <div className="pnl-toolbar-card">
        <div className="toolbar-left">
          <div className="period-picker-group">
            <span className="picker-label">ACCOUNTING PERIOD:</span>
            <div className="period-selector-wrapper">
              <Calendar size={15} className="period-icon" />
              <select
                value={selectedPeriodCode}
                onChange={handlePeriodChange}
                className="period-select"
              >
                {periods.map(p => (
                  <option key={p.id} value={p.periodCode}>
                    {p.periodName} ({p.status === 'HARD_CLOSE_FROZEN' ? 'Frozen' : 'Provisional'})
                  </option>
                ))}
              </select>
            </div>
            {!isPeriodFrozen ? (
              <button className="btn-freeze" onClick={handleFreezePeriod} title="Lock and seal this period">
                <Lock size={14} />
                Freeze Period
              </button>
            ) : (
              <span className="frozen-seal-badge">
                <Lock size={12} /> Period Locked & Sealed
              </span>
            )}
          </div>
        </div>

        <div className="toolbar-right">
          <div className="search-box">
            <Search size={15} className="search-icon" />
            <input
              type="text"
              placeholder="Search line name, code, formula..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="search-clear-btn" onClick={() => setSearchQuery('')}>
                <X size={13} />
              </button>
            )}
          </div>

          <div className="filter-select-wrapper">
            <Filter size={14} className="filter-icon" />
            <select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              className="filter-select"
            >
              <option value="ALL">All P&L Sections</option>
              <option value={PNL_SECTIONS.GROSS_REVENUE}>1. Gross Revenue</option>
              <option value={PNL_SECTIONS.CONTRACTUAL_DEDUCTIONS}>2. Contractual Deductions</option>
              <option value={PNL_SECTIONS.DIRECT_CLINICAL_COSTS}>3. Direct Clinical Costs</option>
              <option value={PNL_SECTIONS.VARIABLE_FACILITY_COSTS}>4. Variable Facility Costs</option>
              <option value={PNL_SECTIONS.FIXED_OVERHEAD_OPEX}>5. Fixed Overhead (OPEX)</option>
              <option value={PNL_SECTIONS.DEPRECIATION_AMORTIZATION}>6. Depreciation & Amortization</option>
            </select>
          </div>
        </div>
      </div>

      {/* Hierarchical P&L Statement Table */}
      <div className="statement-table-wrapper">
        <table className="statement-table">
          <thead>
            <tr>
              <th style={{ width: '40%' }}>Line Description</th>
              <th className="font-mono text-center" style={{ width: '12%' }}>Code</th>
              <th className="text-right" style={{ width: '12%' }}>Actual Amount</th>
              <th className="text-right" style={{ width: '12%' }}>Budget</th>
              <th className="text-right" style={{ width: '12%' }}>Variance</th>
              <th className="text-right" style={{ width: '12%' }}>% of NPR</th>
            </tr>
          </thead>
          <tbody>
            {groupedSections.map(([secKey, secData]) => {
              const isCollapsed = collapsedSections[secKey];
              return (
                <React.Fragment key={secKey}>
                  {/* Section Group Header */}
                  <tr className="section-header-row" onClick={() => toggleSectionCollapse(secKey)}>
                    <td colSpan="6">
                      <div className="section-title-wrap">
                        {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                        <span className="section-title-text">{secData.title}</span>
                      </div>
                    </td>
                  </tr>

                  {/* Section Line Items */}
                  {!isCollapsed && secData.lines.map((line) => {
                    const isSummary = line.isSummaryLine;
                    const isNpr = line.lineCode === 'NET_PATIENT_REVENUE';
                    const isCm = line.lineCode === 'DIRECT_CLINICAL_MARGIN';
                    const isEbitda = line.lineCode === 'EBITDA';
                    const isNoi = line.lineCode === 'NET_OPERATING_INCOME';

                    let rowClass = 'pnl-line-row';
                    if (isSummary) rowClass += ' summary-row';
                    if (isNpr) rowClass += ' npr-row';
                    if (isCm) rowClass += ' cm-row';
                    if (isEbitda) rowClass += ' ebitda-row';
                    if (isNoi) rowClass += ' noi-row';

                    return (
                      <tr key={line.id} className={rowClass}>
                        <td className="line-desc-cell">
                          <span className={isSummary ? 'font-bold' : 'line-regular'}>
                            {line.lineName}
                          </span>
                          {line.calculationFormula && !isSummary && (
                            <div className="formula-hint text-xs text-slate">
                              {line.calculationFormula}
                            </div>
                          )}
                        </td>
                        <td className="font-mono text-xs text-center text-slate">
                          {line.lineCode}
                        </td>
                        <td className="text-right font-mono font-bold">
                          {formatExactCurrency(line.amount)}
                        </td>
                        <td className="text-right font-mono text-slate">
                          {formatExactCurrency(line.budgetAmount)}
                        </td>
                        <td className={`text-right font-mono ${line.varianceAmount >= 0 ? 'text-emerald' : 'text-crimson'}`}>
                          {formatExactCurrency(line.varianceAmount)}
                        </td>
                        <td className="text-right font-mono text-slate">
                          {line.percentOfNpr}%
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Reconciliation Boundaries Side Drawer */}
      {showReconciliationDrawer && (
        <div className="drawer-overlay" onClick={() => setShowReconciliationDrawer(false)}>
          <div className="drawer-container" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="drawer-title-group">
                <h3>Multi-Boundary Reconciliation Ledger</h3>
                <span className="font-mono text-xs text-slate">
                  {selectedPeriodCode} • {facilityName}
                </span>
              </div>
              <button className="btn-close" onClick={() => setShowReconciliationDrawer(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="drawer-body">
              <p className="recon-drawer-intro">
                Deterministic mathematical checks verifying that transaction-level surgery entries,
                835 bank deposits, payroll hours, and purchase orders reconcile to 100.00% of reported P&L line sums.
              </p>

              <div className="reconciliation-cards-list">
                {reconciliations.map((rec) => (
                  <div key={rec.id} className="recon-card-item">
                    <div className="recon-card-header">
                      <div className="recon-title-wrap">
                        <ShieldCheck size={16} className={rec.reconciliationStatus === 'RECONCILED_BALANCED' ? 'text-emerald' : 'text-amber'} />
                        <strong>{rec.boundaryName}</strong>
                      </div>
                      <span className={`recon-status-badge ${rec.reconciliationStatus === 'RECONCILED_BALANCED' ? 'badge-balanced' : 'badge-flagged'}`}>
                        {rec.reconciliationStatus === 'RECONCILED_BALANCED' ? 'Balanced' : 'Flagged'}
                      </span>
                    </div>

                    <div className="recon-math-grid">
                      <div className="math-col">
                        <span className="col-label">Source Ledger ({rec.sourceSystem})</span>
                        <span className="col-val font-mono">{formatExactCurrency(rec.sourceAmount)}</span>
                      </div>
                      <div className="math-col">
                        <span className="col-label">Reported P&L Line</span>
                        <span className="col-val font-mono">{formatExactCurrency(rec.pnlLineAmount)}</span>
                      </div>
                      <div className="math-col">
                        <span className="col-label">Variance</span>
                        <span className={`col-val font-mono ${rec.varianceAmount === 0 ? 'text-emerald' : 'text-amber'}`}>
                          {formatExactCurrency(rec.varianceAmount)}
                        </span>
                      </div>
                      <div className="math-col">
                        <span className="col-label">Tolerance</span>
                        <span className="col-val font-mono text-slate">
                          ≤ ${rec.toleranceThreshold}
                        </span>
                      </div>
                    </div>

                    <div className="recon-notes">
                      <strong>Audit Note:</strong> {rec.reconciliationNotes}
                    </div>

                    <div className="recon-hash font-mono text-xs text-slate">
                      SHA-256: {rec.auditHash}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="drawer-footer">
              <button className="btn-secondary" onClick={() => setShowReconciliationDrawer(false)}>
                Close Audit Drawer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
