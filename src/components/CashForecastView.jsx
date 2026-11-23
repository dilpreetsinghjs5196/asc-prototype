import React, { useState, useMemo } from 'react';
import {
  DollarSign,
  Calendar,
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
  Landmark,
  CreditCard,
  Building2,
  FileSpreadsheet
} from 'lucide-react';
import {
  getCashForecastMatrix,
  getCashForecastTelemetry,
  approveAndFreezeCashForecast,
  CASH_SCENARIOS,
  COVENANT_SEVERITY
} from '../services/cashForecastService';
import './CashForecastView.css';

export default function CashForecastView({ activeFacility = 'fac-naples-01' }) {
  const [activeScenario, setActiveScenario] = useState(CASH_SCENARIOS.BASELINE);
  const [showDrawer, setShowDrawer] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState({});
  const [freezeNotice, setFreezeNotice] = useState(null);

  // Load telemetry and matrix
  const telemetry = useMemo(() => {
    return getCashForecastTelemetry(activeFacility, 'CF2026_Q4_13W', activeScenario);
  }, [activeFacility, activeScenario]);

  const matrix = useMemo(() => {
    return getCashForecastMatrix(activeFacility, 'CF2026_Q4_13W', activeScenario);
  }, [activeFacility, activeScenario]);

  const toggleSection = (sectionKey) => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  const handleApproveAndFreeze = () => {
    try {
      const res = approveAndFreezeCashForecast('CF2026_Q4_13W', '00000000-0000-0000-0000-000000000001');
      setFreezeNotice(`Cryptographically sealed cash forecast with SHA-256: ${res.frozenHash.slice(0, 16)}...`);
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

  if (!matrix || !telemetry) {
    return (
      <div className="cf-container">
        <div className="cf-loading">Loading 13-Week Cash Forecast Engine...</div>
      </div>
    );
  }

  return (
    <div className="cf-container">
      {/* Freeze Alert Banner */}
      {freezeNotice && (
        <div className="cf-freeze-banner">
          <CheckCircle size={18} className="text-emerald" />
          <span>{freezeNotice}</span>
          <button className="cf-btn-banner-close" onClick={() => setFreezeNotice(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="cf-header-card">
        <div className="cf-header-left">
          <div className="cf-header-badges">
            <span className="cf-badge-facility">Naples Surgery Center</span>
            <span className="cf-badge-phase">Phase E3 - Module 14</span>
            <span className="cf-badge-status">
              <Lock size={12} /> ACTIVE_FORECAST
            </span>
            <span className="cf-badge-covenant">
              Covenant: {formatCurrency(telemetry.minimumCashCovenant)} Min Floor
            </span>
          </div>
          <h2 className="cf-header-title">13-Week Cash Forecast & Liquidity Management</h2>
          <p className="cf-header-subtitle">
            Direct weekly cash flow model tracking receipts aging, bi-weekly clinical payroll timing, vendor AP terms,
            and covenant liquidity runway for Q4 2026 (Nov 2026 – Jan 2027).
          </p>
        </div>

        <div className="cf-header-actions">
          <button className="cf-btn-secondary" onClick={() => setShowDrawer(true)}>
            <Sliders size={16} />
            <span>Liquidity & Covenant Tuning</span>
          </button>
          <button className="cf-btn-primary" onClick={handleApproveAndFreeze}>
            <ShieldCheck size={16} />
            <span>Approve & Freeze Seal</span>
          </button>
        </div>
      </div>

      {/* Executive Liquidity Ribbon */}
      <div className="cf-ribbon-grid">
        {/* Card 1: Starting Operating Cash */}
        <div className="cf-ribbon-card">
          <div className="cf-card-top">
            <span className="cf-card-label">STARTING OPERATING CASH</span>
            <Landmark size={16} className="text-sky" />
          </div>
          <div className="cf-card-value font-mono">
            {formatCurrency(telemetry.startingCashBalance)}
          </div>
          <div className="cf-card-meta">
            <span className="cf-meta-pill neutral">Verified Bank Balance</span>
            <span className="cf-meta-sub">Week 1 (Nov 02, 2026)</span>
          </div>
        </div>

        {/* Card 2: 13-Week Ending Cash */}
        <div className="cf-ribbon-card">
          <div className="cf-card-top">
            <span className="cf-card-label">13-WEEK ENDING CASH</span>
            <DollarSign size={16} className="text-emerald" />
          </div>
          <div className="cf-card-value font-mono text-emerald">
            {formatCurrency(telemetry.projectedEndingCash)}
          </div>
          <div className="cf-card-meta">
            <span className="cf-meta-pill favorable">
              <ArrowUpRight size={12} /> {formatCurrency(Math.abs(telemetry.net13wCashFlow))} Build
            </span>
            <span className="cf-meta-sub">Week 13 (Jan 31, 2027)</span>
          </div>
        </div>

        {/* Card 3: Total Cash Receipts */}
        <div className="cf-ribbon-card">
          <div className="cf-card-top">
            <span className="cf-card-label">13-WEEK TOTAL RECEIPTS</span>
            <CreditCard size={16} className="text-emerald" />
          </div>
          <div className="cf-card-value font-mono">
            {formatCurrency(telemetry.total13wReceipts)}
          </div>
          <div className="cf-card-meta">
            <span className="cf-meta-sub">
              Disbursements: {formatCurrency(telemetry.total13wDisbursements)}
            </span>
            <span className="cf-meta-pill favorable">DSO: 32 Days</span>
          </div>
        </div>

        {/* Card 4: Minimum Covenant Headroom */}
        <div className="cf-ribbon-card">
          <div className="cf-card-top">
            <span className="cf-card-label">COVENANT HEADROOM</span>
            <ShieldCheck size={16} className="text-emerald" />
          </div>
          <div className="cf-card-value font-mono text-emerald">
            +{formatCurrency(telemetry.minimumCovenantHeadroom)}
          </div>
          <div className="cf-card-meta">
            <span className="cf-meta-pill favorable">Surplus Cushion</span>
            <span className="cf-meta-sub">Above $400k debt covenant</span>
          </div>
        </div>

        {/* Card 5: Lowest Projected Cash Week */}
        <div className="cf-ribbon-card">
          <div className="cf-card-top">
            <span className="cf-card-label">LOWEST CASH WEEK</span>
            <Clock size={16} className="text-amber" />
          </div>
          <div className="cf-card-value font-mono">
            {telemetry.lowestProjectedCashWeek} <span className="cf-card-unit">({formatCurrency(telemetry.lowestProjectedCash)})</span>
          </div>
          <div className="cf-card-meta">
            <span className="cf-meta-pill neutral">Payroll Trough</span>
            <span className="cf-meta-sub">Revolver headroom: $1.0M</span>
          </div>
        </div>
      </div>

      {/* Scenario Switcher Toolbar */}
      <div className="cf-toolbar-card">
        <div className="cf-toolbar-group">
          <span className="cf-toolbar-label">Scenario Model:</span>
          <div className="cf-pill-toggle">
            <button
              className={`cf-toggle-btn ${activeScenario === CASH_SCENARIOS.BASELINE ? 'active' : ''}`}
              onClick={() => setActiveScenario(CASH_SCENARIOS.BASELINE)}
            >
              Baseline (32-Day DSO)
            </button>
            <button
              className={`cf-toggle-btn prompt ${activeScenario === CASH_SCENARIOS.PROMPT_PAY ? 'active' : ''}`}
              onClick={() => setActiveScenario(CASH_SCENARIOS.PROMPT_PAY)}
            >
              Prompt Pay Acceleration (-5 Days)
            </button>
            <button
              className={`cf-toggle-btn slow ${activeScenario === CASH_SCENARIOS.SLOW_COLLECTIONS ? 'active' : ''}`}
              onClick={() => setActiveScenario(CASH_SCENARIOS.SLOW_COLLECTIONS)}
            >
              Slow Collections (+7 Days DSO)
            </button>
          </div>
        </div>

        <div className="cf-toolbar-group ml-auto">
          <span className="cf-toolbar-label">Revolving Line of Credit:</span>
          <span className="cf-loc-badge">
            $0 / $1,000,000 Drawn (100% Available)
          </span>
        </div>
      </div>

      {/* Weekly Cash Runway Strip */}
      <div className="cf-trajectory-card">
        <div className="cf-trajectory-header">
          <div className="cf-traj-title-group">
            <h3 className="cf-section-title">Weekly Cash Balance & Runway Trajectory</h3>
            <span className="cf-section-sub">
              13-week progression showing starting cash roll-forward, receipts vs disbursements, and covenant safety buffer
            </span>
          </div>
          <div className="cf-legend-group">
            <span className="cf-legend-item"><span className="cf-dot green"></span> Net Build</span>
            <span className="cf-legend-item"><span className="cf-dot red"></span> Payroll Week Burn</span>
            <span className="cf-legend-item"><span className="cf-dot blue"></span> Rent Week</span>
          </div>
        </div>

        <div className="cf-trajectory-scroll">
          <div className="cf-trajectory-grid">
            {matrix.weeks.map(w => {
              const isBuild = w.netOperatingCashFlow >= 0;
              return (
                <div key={w.weekCode} className={`cf-week-card ${w.isPayrollWeek ? 'payroll' : w.isRentWeek ? 'rent' : 'regular'}`}>
                  <div className="cf-week-top">
                    <span className="cf-week-code">{w.weekCode}</span>
                    <span className="cf-week-dates">{w.startDate.split('-')[1]}/{w.startDate.split('-')[2]}</span>
                  </div>

                  <div className="cf-week-badge-row">
                    {w.isPayrollWeek && <span className="cf-tag payroll">Payroll</span>}
                    {w.isRentWeek && <span className="cf-tag rent">Rent</span>}
                    {w.isDebtServiceWeek && <span className="cf-tag debt">Debt</span>}
                  </div>

                  <div className="cf-week-metrics">
                    <div className="cf-metric-row">
                      <span className="label">In:</span>
                      <span className="val font-mono text-emerald">{formatCurrency(w.totalReceipts)}</span>
                    </div>
                    <div className="cf-metric-row">
                      <span className="label">Out:</span>
                      <span className="val font-mono text-crimson">{formatCurrency(w.totalDisbursements)}</span>
                    </div>
                    <div className="cf-metric-row">
                      <span className="label">Net:</span>
                      <span className={`val font-mono font-bold ${isBuild ? 'text-emerald' : 'text-crimson'}`}>
                        {isBuild ? '+' : ''}{formatCurrency(w.netOperatingCashFlow)}
                      </span>
                    </div>
                    <div className="cf-metric-divider"></div>
                    <div className="cf-metric-row highlight">
                      <span className="label">End Cash:</span>
                      <span className="val font-mono font-extrabold">{formatCurrency(w.endingCash)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 13-Week Direct Statement Table */}
      <div className="cf-statement-card">
        <div className="cf-statement-header">
          <div className="cf-stmt-title-group">
            <h3 className="cf-section-title">13-Week Direct Cash Receipts & Disbursements Statement</h3>
            <span className="cf-section-sub">
              Treasury-aligned direct cash matrix verifying continuous roll-forward and debt covenant headroom
            </span>
          </div>
          <div className="cf-stmt-actions">
            <span className="cf-scenario-indicator">
              Viewing: <strong>{activeScenario}</strong>
            </span>
          </div>
        </div>

        <div className="cf-table-wrapper">
          <table className="cf-table">
            <thead>
              <tr>
                <th className="cf-th-line sticky-col">CASH FLOW LINE ITEM</th>
                {matrix.weeks.map(w => (
                  <th key={w.weekCode} className={`cf-th-week ${w.isPayrollWeek ? 'th-payroll' : ''}`}>
                    <span className="cf-th-wname">{w.weekCode}</span>
                    <span className="cf-th-wdates">{w.startDate.split('-')[1]}/{w.startDate.split('-')[2]}</span>
                  </th>
                ))}
                <th className="cf-th-total">13-WK TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {/* SECTION 1: BEGINNING CASH */}
              <tr className="cf-row-beginning">
                <td className="sticky-col cf-td-label font-bold">
                  <span>BEGINNING OPERATING CASH</span>
                  <span className="cf-sublabel">Opening Bank Balance</span>
                </td>
                {matrix.weeks.map(w => (
                  <td key={w.weekCode} className="cf-td-val font-mono font-bold">
                    {formatCurrency(w.beginningCash)}
                  </td>
                ))}
                <td className="cf-td-total font-mono font-bold">
                  {formatCurrency(matrix.totals.startingCash)}
                </td>
              </tr>

              {/* SECTION 2: OPERATING CASH RECEIPTS */}
              <tr className="cf-section-header-row" onClick={() => toggleSection('receipts')}>
                <td colSpan={matrix.weeks.length + 2}>
                  <div className="cf-section-header-content">
                    {collapsedSections.receipts ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    <span>1. OPERATING CASH RECEIPTS (COLLECTIONS)</span>
                  </div>
                </td>
              </tr>
              {!collapsedSections.receipts && (
                <>
                  <tr className="cf-data-row">
                    <td className="sticky-col cf-td-label">
                      <span>Commercial Payer Collections (835 ERA)</span>
                      <span className="cf-line-code font-mono">REC_COMMERCIAL_835</span>
                    </td>
                    {matrix.weeks.map(w => (
                      <td key={w.weekCode} className="cf-td-val font-mono">{formatCurrency(w.commercial)}</td>
                    ))}
                    <td className="cf-td-total font-mono font-bold">{formatCurrency(matrix.totals.totalCommercial)}</td>
                  </tr>
                  <tr className="cf-data-row">
                    <td className="sticky-col cf-td-label">
                      <span>Medicare & Medicaid Clean Claim EFT</span>
                      <span className="cf-line-code font-mono">REC_MEDICARE_EFT</span>
                    </td>
                    {matrix.weeks.map(w => (
                      <td key={w.weekCode} className="cf-td-val font-mono">{formatCurrency(w.medicare)}</td>
                    ))}
                    <td className="cf-td-total font-mono font-bold">{formatCurrency(matrix.totals.totalMedicare)}</td>
                  </tr>
                  <tr className="cf-data-row">
                    <td className="sticky-col cf-td-label">
                      <span>Point-of-Service (POS) Copays & Deductibles</span>
                      <span className="cf-line-code font-mono">REC_POS_PATIENT</span>
                    </td>
                    {matrix.weeks.map(w => (
                      <td key={w.weekCode} className="cf-td-val font-mono">{formatCurrency(w.pos)}</td>
                    ))}
                    <td className="cf-td-total font-mono font-bold">{formatCurrency(matrix.totals.totalPos)}</td>
                  </tr>
                  <tr className="cf-data-row">
                    <td className="sticky-col cf-td-label">
                      <span>Patient AR Portal & Secondary Payments</span>
                      <span className="cf-line-code font-mono">REC_PATIENT_AR</span>
                    </td>
                    {matrix.weeks.map(w => (
                      <td key={w.weekCode} className="cf-td-val font-mono">{formatCurrency(w.patientAr)}</td>
                    ))}
                    <td className="cf-td-total font-mono font-bold">{formatCurrency(matrix.totals.totalPatientAr)}</td>
                  </tr>
                </>
              )}
              <tr className="cf-row-subtotal green">
                <td className="sticky-col cf-td-label font-bold">TOTAL OPERATING RECEIPTS</td>
                {matrix.weeks.map(w => (
                  <td key={w.weekCode} className="cf-td-val font-mono font-bold text-emerald">
                    {formatCurrency(w.totalReceipts)}
                  </td>
                ))}
                <td className="cf-td-total font-mono font-extrabold text-emerald">
                  {formatCurrency(matrix.totals.totalReceipts)}
                </td>
              </tr>

              {/* SECTION 3: OPERATING CASH DISBURSEMENTS */}
              <tr className="cf-section-header-row" onClick={() => toggleSection('disbursements')}>
                <td colSpan={matrix.weeks.length + 2}>
                  <div className="cf-section-header-content">
                    {collapsedSections.disbursements ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    <span>2. OPERATING CASH DISBURSEMENTS (PAYMENTS)</span>
                  </div>
                </td>
              </tr>
              {!collapsedSections.disbursements && (
                <>
                  <tr className="cf-data-row">
                    <td className="sticky-col cf-td-label">
                      <span className="font-bold">Bi-Weekly Clinical & Staff Payroll</span>
                      <span className="cf-line-code font-mono">DISB_CLINICAL_PAYROLL</span>
                    </td>
                    {matrix.weeks.map(w => (
                      <td key={w.weekCode} className={`cf-td-val font-mono ${w.isPayrollWeek ? 'text-crimson font-bold' : ''}`}>
                        {formatCurrency(w.payroll)}
                      </td>
                    ))}
                    <td className="cf-td-total font-mono font-bold">{formatCurrency(matrix.totals.totalPayroll)}</td>
                  </tr>
                  <tr className="cf-data-row">
                    <td className="sticky-col cf-td-label">
                      <span>Surgical Implants & Hardware Vendor AP</span>
                      <span className="cf-line-code font-mono">DISB_IMPLANT_AP</span>
                    </td>
                    {matrix.weeks.map(w => (
                      <td key={w.weekCode} className="cf-td-val font-mono">{formatCurrency(w.implants)}</td>
                    ))}
                    <td className="cf-td-total font-mono font-bold">{formatCurrency(matrix.totals.totalImplants)}</td>
                  </tr>
                  <tr className="cf-data-row">
                    <td className="sticky-col cf-td-label">
                      <span>Sterile Supplies & Biologics Vendor AP</span>
                      <span className="cf-line-code font-mono">DISB_SUPPLIES_AP</span>
                    </td>
                    {matrix.weeks.map(w => (
                      <td key={w.weekCode} className="cf-td-val font-mono">{formatCurrency(w.supplies)}</td>
                    ))}
                    <td className="cf-td-total font-mono font-bold">{formatCurrency(matrix.totals.totalSupplies)}</td>
                  </tr>
                  <tr className="cf-data-row">
                    <td className="sticky-col cf-td-label">
                      <span>Facility Operating Lease / Rent (1st of month)</span>
                      <span className="cf-line-code font-mono">DISB_FACILITY_RENT</span>
                    </td>
                    {matrix.weeks.map(w => (
                      <td key={w.weekCode} className={`cf-td-val font-mono ${w.isRentWeek ? 'font-bold' : ''}`}>
                        {formatCurrency(w.rent)}
                      </td>
                    ))}
                    <td className="cf-td-total font-mono font-bold">{formatCurrency(matrix.totals.totalRent)}</td>
                  </tr>
                  <tr className="cf-data-row">
                    <td className="sticky-col cf-td-label">
                      <span>Equipment Leases & IT/EHR Subscriptions</span>
                      <span className="cf-line-code font-mono">DISB_EQUIP_IT</span>
                    </td>
                    {matrix.weeks.map(w => (
                      <td key={w.weekCode} className="cf-td-val font-mono">{formatCurrency(w.equipIt)}</td>
                    ))}
                    <td className="cf-td-total font-mono font-bold">{formatCurrency(matrix.totals.totalEquipIt)}</td>
                  </tr>
                  <tr className="cf-data-row">
                    <td className="sticky-col cf-td-label">
                      <span>Debt Service Amortization (Principal & Interest)</span>
                      <span className="cf-line-code font-mono">DISB_DEBT_SERVICE</span>
                    </td>
                    {matrix.weeks.map(w => (
                      <td key={w.weekCode} className="cf-td-val font-mono">{formatCurrency(w.debtService)}</td>
                    ))}
                    <td className="cf-td-total font-mono font-bold">{formatCurrency(matrix.totals.totalDebtService)}</td>
                  </tr>
                </>
              )}
              <tr className="cf-row-subtotal red">
                <td className="sticky-col cf-td-label font-bold">TOTAL OPERATING DISBURSEMENTS</td>
                {matrix.weeks.map(w => (
                  <td key={w.weekCode} className="cf-td-val font-mono font-bold text-crimson">
                    {formatCurrency(w.totalDisbursements)}
                  </td>
                ))}
                <td className="cf-td-total font-mono font-extrabold text-crimson">
                  {formatCurrency(matrix.totals.totalDisbursements)}
                </td>
              </tr>

              {/* SECTION 4: NET CASH FLOW */}
              <tr className="cf-row-netflow">
                <td className="sticky-col cf-td-label font-bold">
                  <span>NET OPERATING CASH FLOW (BURN / BUILD)</span>
                </td>
                {matrix.weeks.map(w => {
                  const isBuild = w.netOperatingCashFlow >= 0;
                  return (
                    <td key={w.weekCode} className={`cf-td-val font-mono font-bold ${isBuild ? 'text-emerald' : 'text-crimson'}`}>
                      {isBuild ? '+' : ''}{formatCurrency(w.netOperatingCashFlow)}
                    </td>
                  );
                })}
                <td className="cf-td-total font-mono font-extrabold text-emerald">
                  +{formatCurrency(matrix.totals.netCashFlow)}
                </td>
              </tr>

              {/* SECTION 5: ENDING CASH BALANCE */}
              <tr className="cf-row-ending">
                <td className="sticky-col cf-td-label font-extrabold">
                  <span>ENDING OPERATING CASH BALANCE</span>
                  <span className="cf-sublabel">Closing Weekly Liquidity</span>
                </td>
                {matrix.weeks.map(w => (
                  <td key={w.weekCode} className="cf-td-val font-mono font-extrabold text-emerald">
                    {formatCurrency(w.endingCash)}
                  </td>
                ))}
                <td className="cf-td-total font-mono font-black text-emerald">
                  {formatCurrency(matrix.totals.endingCash)}
                </td>
              </tr>

              {/* SECTION 6: COVENANT HEADROOM */}
              <tr className="cf-row-covenant">
                <td className="sticky-col cf-td-label">
                  <span className="font-bold">Minimum Debt Covenant Headroom</span>
                  <span className="cf-sublabel">Above $400k Required Reserve</span>
                </td>
                {matrix.weeks.map(w => (
                  <td key={w.weekCode} className="cf-td-val font-mono">
                    <span className="cf-headroom-pill favorable">
                      +{formatCurrency(w.headroom)}
                    </span>
                  </td>
                ))}
                <td className="cf-td-total font-mono font-bold text-emerald">
                  +{formatCurrency(matrix.totals.minimumHeadroom)} (Trough)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Slide-Out Liquidity & Covenant Tuning Drawer */}
      {showDrawer && (
        <div className="cf-drawer-overlay" onClick={() => setShowDrawer(false)}>
          <div className="cf-drawer-container" onClick={(e) => e.stopPropagation()}>
            <div className="cf-drawer-header">
              <div className="cf-drawer-title-group">
                <h3 className="cf-drawer-title">Treasury Liquidity & Covenant Tuning</h3>
                <div className="cf-drawer-badges-row">
                  <span className="cf-code-pill font-mono">CF2026_Q4_13W</span>
                  <span className="cf-category-pill">Naples Surgery Center</span>
                </div>
              </div>
              <button className="cf-btn-close" onClick={() => setShowDrawer(false)} title="Close Drawer">
                <X size={18} />
              </button>
            </div>

            <div className="cf-drawer-body">
              {/* Bank Facility Information */}
              <div className="cf-drawer-section">
                <h4>Primary Operating Facility & Accounts</h4>
                <div className="cf-drawer-stat-grid">
                  <div className="cf-drawer-stat-box">
                    <span className="stat-label">PRIMARY BANK</span>
                    <span className="stat-val text-sky">First Florida Healthcare Bank</span>
                  </div>
                  <div className="cf-drawer-stat-box">
                    <span className="stat-label">ACCOUNT TYPE</span>
                    <span className="stat-val">Operating Checking + Auto-Sweep</span>
                  </div>
                  <div className="cf-drawer-stat-box">
                    <span className="stat-label">STARTING BALANCE</span>
                    <span className="stat-val font-mono">{formatCurrency(telemetry.startingCashBalance)}</span>
                  </div>
                  <div className="cf-drawer-stat-box">
                    <span className="stat-label">MINIMUM COVENANT</span>
                    <span className="stat-val font-mono text-amber">{formatCurrency(telemetry.minimumCashCovenant)}</span>
                  </div>
                </div>
              </div>

              {/* Revolving Line of Credit */}
              <div className="cf-drawer-section">
                <h4>Revolving Line of Credit (LOC)</h4>
                <div className="cf-drawer-stat-grid">
                  <div className="cf-drawer-stat-box">
                    <span className="stat-label">TOTAL FACILITY LIMIT</span>
                    <span className="stat-val font-mono">{formatCurrency(telemetry.lineOfCreditLimit)}</span>
                  </div>
                  <div className="cf-drawer-stat-box">
                    <span className="stat-label">AMOUNT DRAWN</span>
                    <span className="stat-val font-mono text-emerald">$0.00 (Undrawn)</span>
                  </div>
                  <div className="cf-drawer-stat-box">
                    <span className="stat-label">AVAILABLE LIQUIDITY</span>
                    <span className="stat-val font-mono text-sky">{formatCurrency(telemetry.availableLocLiquidity)}</span>
                  </div>
                  <div className="cf-drawer-stat-box">
                    <span className="stat-label">INTEREST RATE</span>
                    <span className="stat-val font-mono">SOFR + 2.25%</span>
                  </div>
                </div>
              </div>

              {/* Receipts Timing Assumptions */}
              <div className="cf-drawer-section">
                <h4>Collections Aging Decay Distribution (ASCs)</h4>
                <div className="cf-aging-grid">
                  <div className="cf-aging-box">
                    <span className="timing">Week 0 (POS)</span>
                    <span className="pct font-mono">15%</span>
                  </div>
                  <div className="cf-aging-box">
                    <span className="timing">Week +2 (Medicare)</span>
                    <span className="pct font-mono">45%</span>
                  </div>
                  <div className="cf-aging-box">
                    <span className="timing">Week +4 (Commercial)</span>
                    <span className="pct font-mono">25%</span>
                  </div>
                  <div className="cf-aging-box">
                    <span className="timing">Week +6–8 (Secondary)</span>
                    <span className="pct font-mono">15%</span>
                  </div>
                </div>
              </div>

              {/* Cryptographic Provenance */}
              <div className="cf-drawer-section">
                <h4>Cryptographic Provenance Seal</h4>
                <div className="cf-seal-box font-mono">
                  <span className="seal-label">SHA-256 HASH:</span>
                  <span className="seal-val">{telemetry.frozenHash || 'Draft Version — Unsealed'}</span>
                </div>
              </div>
            </div>

            <div className="cf-drawer-footer">
              <button className="cf-btn-secondary" onClick={() => setShowDrawer(false)}>
                Close
              </button>
              <button className="cf-btn-primary" onClick={() => { setShowDrawer(false); handleApproveAndFreeze(); }}>
                Save & Seal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
