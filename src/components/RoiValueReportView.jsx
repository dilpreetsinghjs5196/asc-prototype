import React, { useState, useMemo } from 'react';
import {
  Award,
  ShieldCheck,
  CheckCircle,
  AlertCircle,
  Calendar,
  DollarSign,
  TrendingUp,
  Activity,
  Layers,
  Clock,
  Printer,
  Lock,
  X,
  FileText,
  Search,
  Filter,
  Check,
  ExternalLink,
  Percent,
  Sliders,
  AlertTriangle
} from 'lucide-react';
import {
  getRoiReportByIdOrCode,
  getRoiValueLineItems,
  getRoiReportTelemetry,
  publishAndFreezeRoiReport,
  generateRoiDossier,
  ROI_REPORT_STATUSES,
  VALUE_PILLARS
} from '../services/roiValueReportService';
import './RoiValueReportView.css';

export default function RoiValueReportView({ activeFacility = 'fac-naples-01' }) {
  const facilityId = typeof activeFacility === 'object' && activeFacility !== null
    ? (activeFacility.id || 'fac-naples-01')
    : (activeFacility || 'fac-naples-01');

  const [reportCode] = useState('VAL_ROI_2026_YTD');
  const [selectedPillarFilter, setSelectedPillarFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [showGovernanceDrawer, setShowGovernanceDrawer] = useState(false);
  const [freezeNotice, setFreezeNotice] = useState(null);

  const telemetry = useMemo(() => {
    return getRoiReportTelemetry(facilityId, reportCode);
  }, [facilityId, reportCode, freezeNotice]);

  const lineItems = useMemo(() => {
    return getRoiValueLineItems(reportCode);
  }, [reportCode]);

  const filteredLineItems = useMemo(() => {
    return lineItems.filter(item => {
      const matchesPillar = selectedPillarFilter === 'ALL' || item.pillarCode === selectedPillarFilter;
      const matchesSearch = !searchQuery ||
        item.itemDescription.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.sourceReferenceId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.categoryName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.validationSource.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesPillar && matchesSearch;
    });
  }, [lineItems, selectedPillarFilter, searchQuery]);

  const dossier = useMemo(() => {
    return generateRoiDossier(reportCode, facilityId);
  }, [reportCode, facilityId, freezeNotice]);

  const handlePublish = () => {
    try {
      const res = publishAndFreezeRoiReport(reportCode);
      setFreezeNotice({
        type: 'success',
        message: `ROI Report ${res.reportCode} hard-frozen with SHA-256 seal: ${res.frozenHash.slice(0, 16)}...`
      });
      setShowGovernanceDrawer(true);
    } catch (err) {
      setFreezeNotice({
        type: 'error',
        message: err.message || 'Failed to publish ROI report'
      });
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className={`roi-container ${isPresentationMode ? 'presentation-mode' : ''}`}>
      {/* Freeze Alert Banner */}
      {freezeNotice && (
        <div className={`roi-banner ${freezeNotice.type === 'error' ? 'roi-banner-error' : 'roi-banner-success'}`}>
          <div className="roi-banner-content">
            {freezeNotice.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
            <span>{freezeNotice.message}</span>
          </div>
          <button
            type="button"
            className="roi-banner-close"
            onClick={() => setFreezeNotice(null)}
            title="Dismiss notice"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Header Card */}
      <div className="roi-header-card">
        <div className="roi-header-left">
          <div className="roi-header-badges">
            <span className="roi-badge roi-badge-facility">Naples Surgery Center</span>
            <span className="roi-badge roi-badge-phase">Phase E7 - Module 14 CFO</span>
            <span className={`roi-badge roi-badge-status ${telemetry.status.toLowerCase()}`}>
              {telemetry.status === ROI_REPORT_STATUSES.PUBLISHED_AUDITED ? (
                <>
                  <ShieldCheck size={12} className="inline-icon" />
                  PUBLISHED_AUDITED
                </>
              ) : (
                telemetry.status
              )}
            </span>
            <span className="roi-badge roi-badge-period">
              <Calendar size={12} className="inline-icon" />
              {telemetry.periodCode} Close
            </span>
          </div>
          <h1 className="roi-title">{telemetry.reportTitle}</h1>
          <p className="roi-subtitle">
            Auditable executive software ROI accounting synthesizing platform investment fees against 4-pillar
            validated recoveries, net margin impact, capital payback horizon, and cost of inaction.
          </p>
        </div>

        <div className="roi-header-actions">
          <button
            type="button"
            className={`roi-btn ${isPresentationMode ? 'roi-btn-primary' : 'roi-btn-secondary'}`}
            onClick={() => setIsPresentationMode(!isPresentationMode)}
            title="Toggle Clean Boardroom Dossier View"
          >
            <FileText size={16} />
            <span>{isPresentationMode ? 'Standard View' : 'Dossier View'}</span>
          </button>

          <button
            type="button"
            className="roi-btn roi-btn-secondary"
            onClick={() => setShowGovernanceDrawer(true)}
            title="Inspect SHA-256 Audit Seal"
          >
            <Lock size={16} />
            <span>Audit Seal</span>
          </button>

          <button
            type="button"
            className="roi-btn roi-btn-primary"
            onClick={handlePrint}
            title="Export or Print ROI Report"
          >
            <Printer size={16} />
            <span>Export Dossier</span>
          </button>
        </div>
      </div>

      {/* Executive ROI Scorecard (6 Cards) */}
      <div className="roi-scorecard-grid">
        {/* KPI 1: Net Platform ROI % */}
        <div className="roi-kpi-card highlight">
          <div className="roi-kpi-header">
            <span className="roi-kpi-label">NET SOFTWARE ROI</span>
            <Percent size={16} className="roi-kpi-icon emerald" />
          </div>
          <div className="roi-kpi-value text-emerald">+{telemetry.netRoiPercent}%</div>
          <div className="roi-kpi-subtext">
            <span>Net Return on Investment</span>
            <span className="roi-delta-positive">{telemetry.roiMultiplier}x Multiple</span>
          </div>
        </div>

        {/* KPI 2: ROI Multiplier */}
        <div className="roi-kpi-card">
          <div className="roi-kpi-header">
            <span className="roi-kpi-label">CASH-ON-CASH MULTIPLE</span>
            <TrendingUp size={16} className="roi-kpi-icon emerald" />
          </div>
          <div className="roi-kpi-value">{telemetry.roiMultiplier}x</div>
          <div className="roi-kpi-subtext">
            <span>Per $1.00 Software Spend</span>
            <span className="roi-delta-positive">${telemetry.roiMultiplier} Net Yield</span>
          </div>
        </div>

        {/* KPI 3: Net Realized Economic Value */}
        <div className="roi-kpi-card">
          <div className="roi-kpi-header">
            <span className="roi-kpi-label">NET REALIZED VALUE</span>
            <DollarSign size={16} className="roi-kpi-icon emerald" />
          </div>
          <div className="roi-kpi-value">${(telemetry.netValidatedValue).toLocaleString()}</div>
          <div className="roi-kpi-subtext">
            <span>Gross: ${(telemetry.grossValidatedValue).toLocaleString()}</span>
            <span className="roi-delta-neutral">Labor: -${(telemetry.staffLaborCost).toLocaleString()}</span>
          </div>
        </div>

        {/* KPI 4: Total Platform Investment (TCO) */}
        <div className="roi-kpi-card">
          <div className="roi-kpi-header">
            <span className="roi-kpi-label">PLATFORM INVESTMENT (TCO)</span>
            <Layers size={16} className="roi-kpi-icon sky" />
          </div>
          <div className="roi-kpi-value">${(telemetry.totalPlatformInvestment).toLocaleString()}</div>
          <div className="roi-kpi-subtext">
            <span>License: $30k | Setup: $12k</span>
            <span className="roi-delta-neutral">10 Months YTD</span>
          </div>
        </div>

        {/* KPI 5: Capital Payback Period */}
        <div className="roi-kpi-card">
          <div className="roi-kpi-header">
            <span className="roi-kpi-label">PAYBACK HORIZON</span>
            <Clock size={16} className="roi-kpi-icon sky" />
          </div>
          <div className="roi-kpi-value">{telemetry.paybackPeriodMonths} mos</div>
          <div className="roi-kpi-subtext">
            <span>Full Capital Recoupment</span>
            <span className="roi-delta-positive">31 Calendar Days</span>
          </div>
        </div>

        {/* KPI 6: Cost of Inaction (COI) */}
        <div className="roi-kpi-card">
          <div className="roi-kpi-header">
            <span className="roi-kpi-label">COST OF INACTION (COI)</span>
            <AlertTriangle size={16} className="roi-kpi-icon amber" />
          </div>
          <div className="roi-kpi-value text-amber">${(telemetry.costOfInaction).toLocaleString()}</div>
          <div className="roi-kpi-subtext">
            <span>Addressable Pipeline</span>
            <span className="roi-delta-negative">Remaining Leakage</span>
          </div>
        </div>
      </div>

      {/* Executive Summary Banner */}
      <div className="roi-summary-card">
        <div className="roi-summary-header">
          <div className="roi-summary-title-row">
            <Award size={18} className="roi-summary-icon" />
            <h2 className="roi-summary-title">Executive ROI Statement & Auditor Attestation</h2>
          </div>
          <div className="roi-summary-meta">
            <span>Author: {telemetry.metadata?.author || 'Chief Financial Officer'}</span>
            <span className="roi-separator">•</span>
            <span>Audience: {telemetry.metadata?.distribution || 'Board of Managers'}</span>
            <span className="roi-separator">•</span>
            <span>Verified Period: 10 Months YTD</span>
          </div>
        </div>
        <p className="roi-summary-text">{telemetry.executiveNarrative}</p>
      </div>

      {/* 4-Pillar Value Decomposition */}
      <div className="roi-pillars-card">
        <div className="roi-pillars-header">
          <h3 className="roi-pillars-title">4-Pillar Validated Economic Value Decomposition</h3>
          <span className="roi-pillars-total">
            Total Gross Economic Impact: <strong>${(telemetry.grossValidatedValue).toLocaleString()}</strong>
          </span>
        </div>

        {/* Progress Decomposition Bar */}
        <div className="roi-progress-track">
          <div
            className="roi-progress-segment revenue"
            style={{ width: `${(telemetry.recoveredRevenue / telemetry.grossValidatedValue) * 100}%` }}
            title={`Recovered Revenue: $${telemetry.recoveredRevenue.toLocaleString()} (35.2%)`}
          />
          <div
            className="roi-progress-segment savings"
            style={{ width: `${(telemetry.directSavings / telemetry.grossValidatedValue) * 100}%` }}
            title={`Direct Savings: $${telemetry.directSavings.toLocaleString()} (22.8%)`}
          />
          <div
            className="roi-progress-segment capacity"
            style={{ width: `${(telemetry.capacityValue / telemetry.grossValidatedValue) * 100}%` }}
            title={`Capacity Monetization: $${telemetry.capacityValue.toLocaleString()} (31.3%)`}
          />
          <div
            className="roi-progress-segment avoided"
            style={{ width: `${(telemetry.avoidedCosts / telemetry.grossValidatedValue) * 100}%` }}
            title={`Avoided Costs: $${telemetry.avoidedCosts.toLocaleString()} (10.7%)`}
          />
        </div>

        {/* Pillar Metric Cards */}
        <div className="roi-pillar-grid">
          {/* Pillar 1: Recovered Revenue */}
          <div className="roi-pillar-box revenue">
            <div className="roi-pillar-top">
              <span className="roi-pillar-tag">PILLAR 1</span>
              <span className="roi-pillar-share">35.2% of Gross</span>
            </div>
            <h4 className="roi-pillar-name">Recovered Revenue</h4>
            <div className="roi-pillar-amount">${(telemetry.recoveredRevenue).toLocaleString()}</div>
            <p className="roi-pillar-desc">
              Payer underpayments, secondary claim recoupments & surgical implant carve-out reconciliation.
            </p>
          </div>

          {/* Pillar 2: Direct Savings */}
          <div className="roi-pillar-box savings">
            <div className="roi-pillar-top">
              <span className="roi-pillar-tag">PILLAR 2</span>
              <span className="roi-pillar-share">22.8% of Gross</span>
            </div>
            <h4 className="roi-pillar-name">Direct Non-Labor Savings</h4>
            <div className="roi-pillar-amount">${(telemetry.directSavings).toLocaleString()}</div>
            <p className="roi-pillar-desc">
              Implant vendor contract renegotiation, custom pack standardization & waste elimination.
            </p>
          </div>

          {/* Pillar 3: Capacity Monetization */}
          <div className="roi-pillar-box capacity">
            <div className="roi-pillar-top">
              <span className="roi-pillar-tag">PILLAR 3</span>
              <span className="roi-pillar-share">31.3% of Gross</span>
            </div>
            <h4 className="roi-pillar-name">Capacity Monetization</h4>
            <div className="roi-pillar-amount">${(telemetry.capacityValue).toLocaleString()}</div>
            <p className="roi-pillar-desc">
              67.0 reclaimed OR block hours monetized at $1,975/hr CM via automated release lead times.
            </p>
          </div>

          {/* Pillar 4: Avoided Costs */}
          <div className="roi-pillar-box avoided">
            <div className="roi-pillar-top">
              <span className="roi-pillar-tag">PILLAR 4</span>
              <span className="roi-pillar-share">10.7% of Gross</span>
            </div>
            <h4 className="roi-pillar-name">Avoided Costs & Penalties</h4>
            <div className="roi-pillar-amount">${(telemetry.avoidedCosts).toLocaleString()}</div>
            <p className="roi-pillar-desc">
              Timely filing denial prevention rules and Friday clinical nursing overtime mitigation.
            </p>
          </div>
        </div>
      </div>

      {/* Granular Line-Item Transaction Provenance Table */}
      <div className="roi-table-card">
        <div className="roi-table-toolbar">
          <div className="roi-table-title-group">
            <FileText size={18} className="roi-table-icon" />
            <h3 className="roi-table-title">Line-Item Value Attribution & Provenance Ledger</h3>
            <span className="roi-table-count">({filteredLineItems.length} items verified)</span>
          </div>

          <div className="roi-table-controls">
            {/* Search Input */}
            <div className="roi-search-box">
              <Search size={14} className="roi-search-icon" />
              <input
                type="text"
                placeholder="Search description, reference, source..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="roi-search-input"
              />
            </div>

            {/* Pillar Filter Pills */}
            <div className="roi-filter-pills">
              {['ALL', VALUE_PILLARS.RECOVERED_REVENUE, VALUE_PILLARS.DIRECT_SAVINGS, VALUE_PILLARS.CAPACITY_VALUE, VALUE_PILLARS.AVOIDED_COST].map(p => (
                <button
                  key={p}
                  type="button"
                  className={`roi-filter-pill ${selectedPillarFilter === p ? 'active' : ''}`}
                  onClick={() => setSelectedPillarFilter(p)}
                >
                  {p === 'ALL' ? 'All Pillars' : p.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table View */}
        <div className="roi-table-wrapper">
          <table className="roi-table">
            <thead>
              <tr>
                <th>REF ID</th>
                <th>PILLAR / CATEGORY</th>
                <th>VALUE DESCRIPTION</th>
                <th>VERIFICATION SOURCE</th>
                <th className="text-right">GROSS AMOUNT</th>
                <th className="text-right">LABOR OFFSET</th>
                <th className="text-right">NET VALIDATED</th>
              </tr>
            </thead>
            <tbody>
              {filteredLineItems.map(item => (
                <tr key={item.id} className="roi-table-row">
                  <td className="roi-cell-ref">
                    <code>{item.sourceReferenceId}</code>
                  </td>
                  <td>
                    <span className={`roi-pillar-badge ${item.pillarCode.toLowerCase()}`}>
                      {item.categoryName}
                    </span>
                  </td>
                  <td className="roi-cell-desc">{item.itemDescription}</td>
                  <td className="roi-cell-source">
                    <CheckCircle size={13} className="text-emerald inline-icon" />
                    <span>{item.validationSource}</span>
                  </td>
                  <td className="roi-cell-num">${item.grossAmount.toLocaleString()}</td>
                  <td className="roi-cell-num text-muted">
                    {item.laborOffset > 0 ? `-$${item.laborOffset.toLocaleString()}` : '$0'}
                  </td>
                  <td className="roi-cell-num text-bold text-emerald">
                    ${item.netAmount.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slide-out Governance & Audit Drawer */}
      {showGovernanceDrawer && (
        <div className="roi-drawer-overlay" onClick={() => setShowGovernanceDrawer(false)}>
          <div className="roi-drawer-panel" onClick={e => e.stopPropagation()}>
            <div className="roi-drawer-header">
              <div className="roi-drawer-title-group">
                <Lock size={18} className="roi-drawer-icon" />
                <h3 className="roi-drawer-title">ROI Audit Governance & Cryptographic Seal</h3>
              </div>
              <button
                type="button"
                className="roi-drawer-close"
                onClick={() => setShowGovernanceDrawer(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="roi-drawer-content">
              <div className="roi-drawer-section">
                <h4 className="roi-drawer-heading">SHA-256 Audit Seal</h4>
                <div className="roi-hash-box">
                  <code>{telemetry.frozenHash || 'PENDING_FINAL_SEAL'}</code>
                </div>
                <p className="roi-drawer-hint">
                  This cryptographic SHA-256 digest binds the 2026 YTD Software ROI Report, all 4 value pillars,
                  and line-item transaction evidence against retrospective modification.
                </p>
              </div>

              <div className="roi-drawer-section">
                <h4 className="roi-drawer-heading">Report Provenance Metadata</h4>
                <div className="roi-meta-table">
                  <div className="roi-meta-row">
                    <span className="roi-meta-key">Report Code</span>
                    <span className="roi-meta-val">{telemetry.reportCode}</span>
                  </div>
                  <div className="roi-meta-row">
                    <span className="roi-meta-key">Period Code</span>
                    <span className="roi-meta-val">{telemetry.periodCode}</span>
                  </div>
                  <div className="roi-meta-row">
                    <span className="roi-meta-key">Evaluation Date</span>
                    <span className="roi-meta-val">{telemetry.evaluationDate}</span>
                  </div>
                  <div className="roi-meta-row">
                    <span className="roi-meta-key">Status</span>
                    <span className="roi-meta-val">{telemetry.status}</span>
                  </div>
                  <div className="roi-meta-row">
                    <span className="roi-meta-key">Verified Items</span>
                    <span className="roi-meta-val">{telemetry.lineItemCount} Source Transactions</span>
                  </div>
                  <div className="roi-meta-row">
                    <span className="roi-meta-key">Active Platform Users</span>
                    <span className="roi-meta-val">{telemetry.metadata?.activeUsers || 8} Staff Members</span>
                  </div>
                </div>
              </div>

              <div className="roi-drawer-actions">
                <button
                  type="button"
                  className="roi-btn roi-btn-primary full-width"
                  onClick={handlePublish}
                >
                  <ShieldCheck size={16} />
                  <span>Re-Compute & Re-Freeze ROI Seal</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
