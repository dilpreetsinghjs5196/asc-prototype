import React, { useState, useMemo } from 'react';
import {
  CreditCard,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  AlertCircle,
  Search,
  Filter,
  RefreshCw,
  ChevronRight,
  X,
  CheckCircle2,
  Sliders,
  Layers,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  Award,
  Sparkles,
  BarChart2,
  Clock,
  FileText,
  FileCheck,
  Scale
} from 'lucide-react';
import {
  PAYER_CATEGORIES,
  PERFORMANCE_GRADES,
  PAYER_BENCHMARKS,
  SEED_PAYER_INTELLIGENCE_METRICS,
  calculateFacilityPayerKpis
} from '../services/payerIntelligenceService';
import './PayerIntelligenceView.css';

export default function PayerIntelligenceView() {
  const [activeTab, setActiveTab] = useState('scorecard'); // 'scorecard', 'denials_underpayments', 'ar_aging'
  const [payers, setPayers] = useState(SEED_PAYER_INTELLIGENCE_METRICS);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedGrade, setSelectedGrade] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPayer, setSelectedPayer] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Facility-wide KPI aggregations
  const facilityKpis = useMemo(() => {
    return calculateFacilityPayerKpis(payers);
  }, [payers]);

  // Filtered payers list
  const filteredPayers = useMemo(() => {
    return payers.filter(p => {
      const matchesCategory = selectedCategory === 'ALL' || p.payerCategory === selectedCategory;
      const matchesGrade = selectedGrade === 'ALL' || p.performanceGrade === selectedGrade;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        p.payerName.toLowerCase().includes(q) ||
        p.payerCode.toLowerCase().includes(q) ||
        (p.topDenialCarc && p.topDenialCarc.toLowerCase().includes(q));

      return matchesCategory && matchesGrade && matchesSearch;
    });
  }, [payers, selectedCategory, selectedGrade, searchQuery]);

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(val || 0);
  };

  const formatNumber = (val) => {
    return new Intl.NumberFormat('en-US').format(val || 0);
  };

  return (
    <div className="payer-intel-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="payer-intel-toast">
          <CheckCircle2 size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top 5-Card Executive Metric Ribbon */}
      <div className="payer-intel-ribbon">
        {/* Card 1: Total Portfolio Billed & Collections */}
        <div className="payer-ribbon-card primary">
          <div className="card-top">
            <span className="card-label">Total Billed Charges</span>
            <div className="icon-wrapper blue">
              <DollarSign size={18} />
            </div>
          </div>
          <div className="card-metric">{formatCurrency(facilityKpis.totalBilled)}</div>
          <div className="card-footer-info">
            <span>Net Collections: <strong>{formatCurrency(facilityKpis.totalCollections)}</strong></span>
            <span className="rate-badge">
              {facilityKpis.portfolioRealizationRate}% Realization
            </span>
          </div>
        </div>

        {/* Card 2: Average Days to Pay */}
        <div className="payer-ribbon-card">
          <div className="card-top">
            <span className="card-label">Adjudication Velocity</span>
            <div className="icon-wrapper emerald">
              <Clock size={18} />
            </div>
          </div>
          <div className="card-metric">{facilityKpis.avgDaysToPay} <span className="metric-unit">days</span></div>
          <div className="card-footer-info">
            <span>Benchmark: ≤ {PAYER_BENCHMARKS.MAX_DAYS_TO_PAY} days</span>
            <span className={`status-pill ${facilityKpis.avgDaysToPay <= PAYER_BENCHMARKS.MAX_DAYS_TO_PAY ? 'pill-good' : 'pill-warn'}`}>
              {facilityKpis.avgDaysToPay <= PAYER_BENCHMARKS.MAX_DAYS_TO_PAY ? 'On Target' : 'Lagging'}
            </span>
          </div>
        </div>

        {/* Card 3: First-Pass Denial Rate */}
        <div className="payer-ribbon-card">
          <div className="card-top">
            <span className="card-label">First-Pass Denial Rate</span>
            <div className="icon-wrapper amber">
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className="card-metric">{facilityKpis.avgDenialRate}%</div>
          <div className="card-footer-info">
            <span>Benchmark: ≤ {PAYER_BENCHMARKS.MAX_DENIAL_RATE_PCT}%</span>
            <span className={`status-pill ${facilityKpis.avgDenialRate <= PAYER_BENCHMARKS.MAX_DENIAL_RATE_PCT ? 'pill-good' : 'pill-warn'}`}>
              Portfolio Overturn: 68.4%
            </span>
          </div>
        </div>

        {/* Card 4: Contractual Underpayment Exposure */}
        <div className="payer-ribbon-card">
          <div className="card-top">
            <span className="card-label">Underpayment Variance</span>
            <div className="icon-wrapper crimson">
              <ShieldAlert size={18} />
            </div>
          </div>
          <div className="card-metric">{formatCurrency(facilityKpis.totalUnderpayment)}</div>
          <div className="card-footer-info">
            <span>Contractual fee leakage</span>
            <span className="status-pill pill-warn">Actionable</span>
          </div>
        </div>

        {/* Card 5: Aged AR > 90 Days */}
        <div className="payer-ribbon-card">
          <div className="card-top">
            <span className="card-label">Aged AR &gt; 90 Days</span>
            <div className="icon-wrapper slate">
              <AlertCircle size={18} />
            </div>
          </div>
          <div className="card-metric">{formatCurrency(facilityKpis.totalAgedArOver90)}</div>
          <div className="card-footer-info">
            <span>Total AR: {formatCurrency(facilityKpis.totalAr)}</span>
            <span className={`status-pill ${facilityKpis.agedArOver90Pct <= PAYER_BENCHMARKS.MAX_AGED_AR_OVER_90_PCT ? 'pill-good' : 'pill-alert'}`}>
              {facilityKpis.agedArOver90Pct}% Exposure
            </span>
          </div>
        </div>
      </div>

      {/* Main Tab Navigation & Controls */}
      <div className="payer-intel-tabs-row">
        <div className="tab-buttons">
          <button
            className={`tab-btn ${activeTab === 'scorecard' ? 'active' : ''}`}
            onClick={() => setActiveTab('scorecard')}
          >
            <BarChart2 size={16} />
            <span>Payer Scorecard &amp; Economics Matrix</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'denials_underpayments' ? 'active' : ''}`}
            onClick={() => setActiveTab('denials_underpayments')}
          >
            <ShieldAlert size={16} />
            <span>Denial &amp; Underpayment Breakdown</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'ar_aging' ? 'active' : ''}`}
            onClick={() => setActiveTab('ar_aging')}
          >
            <Clock size={16} />
            <span>AR Aging &amp; Exposure Distribution</span>
          </button>
        </div>

        <div className="quick-actions">
          <button
            className="action-btn secondary"
            onClick={() => showToast('Payer metrics recalculated and synchronized.')}
          >
            <RefreshCw size={14} />
            <span>Refresh Metrics</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="payer-intel-filters-bar">
        <div className="search-box">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search payer name, code, or denial CARC..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="clear-search" onClick={() => setSearchQuery('')}>
              <X size={14} />
            </button>
          )}
        </div>

        <div className="filter-group">
          <label><Filter size={14} /> Category:</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="ALL">All Categories ({payers.length})</option>
            {Object.values(PAYER_CATEGORIES).map(cat => (
              <option key={cat.key} value={cat.key}>{cat.label}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label><Sliders size={14} /> Performance Grade:</label>
          <select
            value={selectedGrade}
            onChange={(e) => setSelectedGrade(e.target.value)}
          >
            <option value="ALL">All Grades</option>
            {Object.values(PERFORMANCE_GRADES).map(grade => (
              <option key={grade.key} value={grade.key}>{grade.label}</option>
            ))}
          </select>
        </div>

        <div className="results-count">
          Showing <strong>{filteredPayers.length}</strong> of {payers.length} payers
        </div>
      </div>

      {/* TAB 1: Payer Scorecard & Economics Matrix */}
      {activeTab === 'scorecard' && (
        <div className="payer-intel-table-card">
          <div className="table-header">
            <div>
              <h3>Payer Portfolio Economics &amp; Friction Scorecard</h3>
              <p>Comparative analysis of billed charges, cash realization rate, days to pay, denial rate, and friction index</p>
            </div>
          </div>

          <div className="table-responsive">
            <table className="payer-table">
              <thead>
                <tr>
                  <th>Payer Entity &amp; Code</th>
                  <th>Category</th>
                  <th>Claims Volume</th>
                  <th>Billed Charges</th>
                  <th>Net Collections</th>
                  <th>Realization %</th>
                  <th>Days to Pay</th>
                  <th>First-Pass Denial</th>
                  <th>Underpayment Var</th>
                  <th>Friction Index (PFI)</th>
                  <th>Grade</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayers.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="empty-row">
                      <AlertCircle size={20} />
                      <span>No payer records match the selected filter criteria.</span>
                    </td>
                  </tr>
                ) : (
                  filteredPayers.map(payer => {
                    const gradeConfig = PERFORMANCE_GRADES[payer.performanceGrade] || PERFORMANCE_GRADES.B;
                    const isOverturnHigh = payer.firstPassDenialRatePct > PAYER_BENCHMARKS.MAX_DENIAL_RATE_PCT;
                    const isDaysHigh = payer.avgDaysToPay > PAYER_BENCHMARKS.MAX_DAYS_TO_PAY;

                    return (
                      <tr key={payer.id} className={payer.performanceGrade === 'C' || payer.performanceGrade === 'D' ? 'highlight-friction' : ''}>
                        <td>
                          <div className="payer-identity">
                            <span className="payer-title">{payer.payerName}</span>
                            <span className="payer-code-badge">{payer.payerCode}</span>
                          </div>
                        </td>
                        <td>
                          <span className="category-pill">{payer.payerCategory}</span>
                        </td>
                        <td>
                          <div className="volume-cell">
                            <strong>{formatNumber(payer.claimsCount)}</strong>
                            <span className="sub-metric">{payer.cleanClaimsCount} clean ({((payer.cleanClaimsCount / payer.claimsCount) * 100).toFixed(0)}%)</span>
                          </div>
                        </td>
                        <td>{formatCurrency(payer.totalBilledAmount)}</td>
                        <td>
                          <strong>{formatCurrency(payer.totalNetCollections)}</strong>
                        </td>
                        <td>
                          <div className="progress-cell">
                            <div className="progress-bar-bg">
                              <div
                                className="progress-bar-fill"
                                style={{
                                  width: `${Math.min(100, payer.realizationRatePct)}%`,
                                  backgroundColor: payer.realizationRatePct >= 70 ? 'var(--color-emerald, #059669)' : 'var(--color-amber, #d97706)'
                                }}
                              />
                            </div>
                            <span className="progress-val">{payer.realizationRatePct}%</span>
                          </div>
                        </td>
                        <td>
                          <span className={`turnaround-pill ${isDaysHigh ? 'pill-slow' : 'pill-fast'}`}>
                            {payer.avgDaysToPay}d
                          </span>
                        </td>
                        <td>
                          <div className="denial-cell">
                            <span className={isOverturnHigh ? 'text-warn' : 'text-good'}>
                              {payer.firstPassDenialRatePct}%
                            </span>
                            <span className="sub-metric">({payer.firstPassDenialCount} claims)</span>
                          </div>
                        </td>
                        <td>
                          <span className={payer.totalUnderpaymentVariance > 30000 ? 'text-warn' : 'text-neutral'}>
                            {formatCurrency(payer.totalUnderpaymentVariance)}
                          </span>
                        </td>
                        <td>
                          <span className="pfi-metric">{payer.payerFrictionIndex}</span>
                        </td>
                        <td>
                          <span
                            className="grade-badge"
                            style={{
                              color: gradeConfig.color,
                              backgroundColor: gradeConfig.badgeBg,
                              borderColor: gradeConfig.badgeBorder
                            }}
                          >
                            {payer.performanceGrade}
                          </span>
                        </td>
                        <td>
                          <button
                            className="drilldown-btn"
                            onClick={() => setSelectedPayer(payer)}
                          >
                            <span>Dossier</span>
                            <ChevronRight size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Denial & Underpayment Breakdown */}
      {activeTab === 'denials_underpayments' && (
        <div className="payer-intel-grid">
          {/* Denial Reasons & Root Causes */}
          <div className="dashboard-card">
            <div className="card-header">
              <h3 className="card-title">
                <ShieldAlert size={18} />
                Payer Denial Profiles &amp; Primary CARC Codes
              </h3>
              <span className="card-sub">Top operational friction drivers impacting first-pass cash realization</span>
            </div>

            <div className="denial-reasons-list">
              {filteredPayers.map(payer => (
                <div key={payer.id} className="denial-payer-row">
                  <div className="row-left">
                    <span className="payer-name-tag">{payer.payerName}</span>
                    <span className="carc-tag">{payer.topDenialCarc}</span>
                  </div>
                  <div className="row-metrics">
                    <div className="metric-col">
                      <span className="col-label">Denial Rate</span>
                      <span className="col-val text-warn">{payer.firstPassDenialRatePct}%</span>
                    </div>
                    <div className="metric-col">
                      <span className="col-label">Overturn Rate</span>
                      <span className="col-val text-good">{payer.denialOverturnRatePct}%</span>
                    </div>
                    <div className="metric-col">
                      <span className="col-label">Unrecovered</span>
                      <span className="col-val">{formatCurrency(payer.unrecoveredDeniedAmount)}</span>
                    </div>
                  </div>
                  <div className="row-action">
                    <button
                      className="inline-btn"
                      onClick={() => {
                        setSelectedPayer(payer);
                      }}
                    >
                      Audit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Underpayment Opportunities */}
          <div className="dashboard-card">
            <div className="card-header">
              <h3 className="card-title">
                <Scale size={18} />
                Contractual Underpayment &amp; Fee Leakage Analysis
              </h3>
              <span className="card-sub">Systemic underpayments vs. negotiated fee schedules</span>
            </div>

            <div className="underpayment-summary-table">
              <table className="payer-table small">
                <thead>
                  <tr>
                    <th>Payer</th>
                    <th>Underpaid Claims</th>
                    <th>Variance ($)</th>
                    <th>Primary Dispute Opportunity</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayers.map(payer => (
                    <tr key={payer.id}>
                      <td><strong>{payer.payerName}</strong></td>
                      <td>{payer.underpaymentClaimsCount} ({payer.underpaymentRatePct}%)</td>
                      <td className="text-warn"><strong>{formatCurrency(payer.totalUnderpaymentVariance)}</strong></td>
                      <td><span className="dispute-text">{payer.disputeOpportunity}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: AR Aging & Exposure Distribution */}
      {activeTab === 'ar_aging' && (
        <div className="payer-intel-table-card">
          <div className="table-header">
            <div>
              <h3>Accounts Receivable (AR) Aging Distribution by Payer</h3>
              <p>Chronological distribution across 0-30, 31-60, 61-90, 91-120, and &gt;120 day aging buckets</p>
            </div>
          </div>

          <div className="table-responsive">
            <table className="payer-table">
              <thead>
                <tr>
                  <th>Payer Entity</th>
                  <th>Current (0-30d)</th>
                  <th>31-60 Days</th>
                  <th>61-90 Days</th>
                  <th>91-120 Days</th>
                  <th>&gt;120 Days</th>
                  <th>Total AR</th>
                  <th>Aged &gt;90d %</th>
                  <th>Timely Filing Urgency</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayers.map(payer => {
                  const isHighExposure = payer.agedArOver90Pct > PAYER_BENCHMARKS.MAX_AGED_AR_OVER_90_PCT;
                  return (
                    <tr key={payer.id} className={isHighExposure ? 'highlight-friction' : ''}>
                      <td>
                        <strong>{payer.payerName}</strong>
                        <div className="sub-metric">{payer.payerCategory}</div>
                      </td>
                      <td>{formatCurrency(payer.arCurrent30)}</td>
                      <td>{formatCurrency(payer.ar31To60)}</td>
                      <td>{formatCurrency(payer.ar61To90)}</td>
                      <td>{formatCurrency(payer.ar91To120)}</td>
                      <td className={payer.arOver120 > 5000 ? 'text-warn' : ''}>
                        {formatCurrency(payer.arOver120)}
                      </td>
                      <td>
                        <strong>{formatCurrency(payer.totalArBalance)}</strong>
                      </td>
                      <td>
                        <span className={`status-pill ${isHighExposure ? 'pill-alert' : 'pill-good'}`}>
                          {payer.agedArOver90Pct}%
                        </span>
                      </td>
                      <td>
                        {payer.agedArOver90Pct > 20 ? (
                          <span className="urgency-pill high">Critical (90d Alert)</span>
                        ) : payer.agedArOver90Pct > 10 ? (
                          <span className="urgency-pill med">Elevated Aging</span>
                        ) : (
                          <span className="urgency-pill low">Standard</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="drilldown-btn"
                          onClick={() => setSelectedPayer(payer)}
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pinned Payer Drilldown Modal */}
      {selectedPayer && (
        <div className="payer-modal-backdrop" onClick={() => setSelectedPayer(null)}>
          <div className="payer-modal-container" onClick={(e) => e.stopPropagation()}>
            {/* Pinned Header */}
            <div className="payer-modal-header">
              <div className="modal-title-group">
                <span className="modal-eyebrow">Payer Intelligence Dossier</span>
                <h2>{selectedPayer.payerName} ({selectedPayer.payerCode})</h2>
                <div className="modal-badges">
                  <span className="category-pill">{selectedPayer.payerCategory}</span>
                  <span
                    className="grade-badge"
                    style={{
                      color: PERFORMANCE_GRADES[selectedPayer.performanceGrade]?.color,
                      backgroundColor: PERFORMANCE_GRADES[selectedPayer.performanceGrade]?.badgeBg,
                      borderColor: PERFORMANCE_GRADES[selectedPayer.performanceGrade]?.badgeBorder
                    }}
                  >
                    Grade {selectedPayer.performanceGrade}
                  </span>
                  <span className="pfi-badge">Payer Friction Index: {selectedPayer.payerFrictionIndex}</span>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setSelectedPayer(null)}>
                <X size={20} />
              </button>
            </div>

            {/* Scrollable Modal Body */}
            <div className="payer-modal-body">
              {/* Financial Waterfall */}
              <div className="modal-section">
                <h3>Revenue Cycle &amp; Economic Waterfall</h3>
                <div className="waterfall-grid">
                  <div className="waterfall-item">
                    <span className="wf-label">Gross Billed Charges</span>
                    <span className="wf-val">{formatCurrency(selectedPayer.totalBilledAmount)}</span>
                    <span className="wf-sub">{selectedPayer.claimsCount} claims submitted</span>
                  </div>
                  <div className="waterfall-item">
                    <span className="wf-label">Contractual Write-offs</span>
                    <span className="wf-val text-neutral">-{formatCurrency(selectedPayer.totalContractualAdjustments)}</span>
                    <span className="wf-sub">Negotiated discounts</span>
                  </div>
                  <div className="waterfall-item highlighted">
                    <span className="wf-label">Net Collections Realized</span>
                    <span className="wf-val text-good">{formatCurrency(selectedPayer.totalNetCollections)}</span>
                    <span className="wf-sub">{selectedPayer.realizationRatePct}% Realization Rate</span>
                  </div>
                  <div className="waterfall-item">
                    <span className="wf-label">Underpayment Variance</span>
                    <span className="wf-val text-warn">{formatCurrency(selectedPayer.totalUnderpaymentVariance)}</span>
                    <span className="wf-sub">{selectedPayer.underpaymentClaimsCount} underpaid claims</span>
                  </div>
                </div>
              </div>

              {/* Turnaround & Operational Velocity */}
              <div className="modal-section">
                <h3>Operational Adjudication Velocity &amp; Timeliness</h3>
                <div className="metrics-triad">
                  <div className="triad-card">
                    <span className="triad-label">Avg Days to Pay</span>
                    <span className="triad-val">{selectedPayer.avgDaysToPay} days</span>
                    <span className="triad-sub">From 837 claim to 835 remittance</span>
                  </div>
                  <div className="triad-card">
                    <span className="triad-label">ERA Adoption Rate</span>
                    <span className="triad-val">{selectedPayer.eraAdoptionPct}%</span>
                    <span className="triad-sub">Electronic vs. Paper EOBs</span>
                  </div>
                  <div className="triad-card">
                    <span className="triad-label">Prompt Pay Compliance</span>
                    <span className="triad-val">{selectedPayer.promptPayCompliancePct}%</span>
                    <span className="triad-sub">Paid within 30 statutory days</span>
                  </div>
                </div>
              </div>

              {/* Denial Profile & Top CARC */}
              <div className="modal-section">
                <h3>Denial Profile &amp; Appeal Performance</h3>
                <div className="denial-audit-card">
                  <div className="denial-audit-header">
                    <div>
                      <strong>Primary Denial CARC: {selectedPayer.topDenialCarc}</strong>
                      <p>First-pass denial frequency: {selectedPayer.firstPassDenialRatePct}% ({selectedPayer.firstPassDenialCount} encounters)</p>
                    </div>
                    <div className="overturn-stat">
                      <span className="overturn-pct">{selectedPayer.denialOverturnRatePct}%</span>
                      <span className="overturn-lbl">Appeal Overturn Rate</span>
                    </div>
                  </div>
                  <div className="denial-financials">
                    <span>Total Denied Charges: <strong>{formatCurrency(selectedPayer.totalDeniedAmount)}</strong></span>
                    <span>Unrecovered Dollars: <strong className="text-warn">{formatCurrency(selectedPayer.unrecoveredDeniedAmount)}</strong></span>
                  </div>
                </div>
              </div>

              {/* Negotiation & Actionable Recommendations */}
              <div className="modal-section">
                <h3>Contract Renegotiation &amp; Dispute Strategy</h3>
                <div className="strategy-box">
                  <Sparkles size={18} className="strategy-icon" />
                  <div>
                    <strong>Actionable Intelligence:</strong>
                    <p>{selectedPayer.disputeOpportunity}</p>
                    <ul className="strategy-points">
                      <li>Enforce clean claim 30-day statutory prompt-pay interest penalty on delinquent accounts.</li>
                      <li>Review fee schedule tables for modifier -50 and unlisted arthroscopy carveout non-payment.</li>
                      <li>Automate clearinghouse pre-bill authorization check to eliminate CARC-197 first-pass denials.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Pinned Footer */}
            <div className="payer-modal-footer">
              <button
                className="modal-action-btn secondary"
                onClick={() => {
                  showToast(`Payer dossier for ${selectedPayer.payerName} exported to PDF/CSV.`);
                  setSelectedPayer(null);
                }}
              >
                <FileText size={16} />
                <span>Export Payer Dossier</span>
              </button>
              <button
                className="modal-action-btn primary"
                onClick={() => {
                  showToast(`Batch underpayment dispute package generated for ${selectedPayer.payerName} (${formatCurrency(selectedPayer.totalUnderpaymentVariance)}).`);
                  setSelectedPayer(null);
                }}
              >
                <FileCheck size={16} />
                <span>Generate Batch Dispute Package</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
