import React, { useState, useMemo } from 'react';
import {
  FileText,
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
  FileCheck,
  Scale,
  Calendar,
  Percent,
  Zap
} from 'lucide-react';
import {
  REIMBURSEMENT_METHODOLOGIES,
  RENEGOTIATION_STATUSES,
  NEGOTIATION_PRIORITIES,
  CONTRACT_BENCHMARKS,
  SEED_PAYER_CONTRACT_PERFORMANCE,
  calculateFacilityContractKpis
} from '../services/payerContractPerformanceService';
import './PayerContractPerformanceView.css';

export default function PayerContractPerformanceView() {
  const [activeTab, setActiveTab] = useState('matrix'); // 'matrix', 'renewal_radar', 'cpt_carveout'
  const [contracts, setContracts] = useState(SEED_PAYER_CONTRACT_PERFORMANCE);
  const [selectedMethodology, setSelectedMethodology] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContract, setSelectedContract] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Facility-wide KPI aggregations
  const facilityKpis = useMemo(() => {
    return calculateFacilityContractKpis(contracts);
  }, [contracts]);

  // Filtered contracts list
  const filteredContracts = useMemo(() => {
    return contracts.filter(c => {
      const matchesMethodology = selectedMethodology === 'ALL' || c.reimbursementMethodology === selectedMethodology;
      const matchesStatus = selectedStatus === 'ALL' || c.renegotiationStatus === selectedStatus;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        c.contractName.toLowerCase().includes(q) ||
        c.contractNumber.toLowerCase().includes(q) ||
        c.payerName.toLowerCase().includes(q) ||
        c.primaryNegotiationTarget.toLowerCase().includes(q);

      return matchesMethodology && matchesStatus && matchesSearch;
    });
  }, [contracts, selectedMethodology, selectedStatus, searchQuery]);

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
    <div className="pcp-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="pcp-toast">
          <CheckCircle2 size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top 5-Card Executive Metric Ribbon */}
      <div className="pcp-ribbon">
        {/* Card 1: Expected Contract Allowed */}
        <div className="pcp-ribbon-card primary">
          <div className="card-top">
            <span className="card-label">Contract Expected</span>
            <div className="icon-wrapper blue">
              <Scale size={18} />
            </div>
          </div>
          <div className="card-metric">{formatCurrency(facilityKpis.totalExpectedAllowed)}</div>
          <div className="card-footer-info">
            <span>Portfolio entitlement</span>
            <span className="rate-badge">8 active contracts</span>
          </div>
        </div>

        {/* Card 2: Actual Allowed Realized */}
        <div className="pcp-ribbon-card">
          <div className="card-top">
            <span className="card-label">Actual Allowed Realized</span>
            <div className="icon-wrapper emerald">
              <DollarSign size={18} />
            </div>
          </div>
          <div className="card-metric">{formatCurrency(facilityKpis.totalActualAllowed)}</div>
          <div className="card-footer-info">
            <span>Overall Yield: <strong>{facilityKpis.overallYieldPct}%</strong></span>
            <span className={`status-pill ${facilityKpis.overallYieldPct >= CONTRACT_BENCHMARKS.MIN_ACCEPTABLE_YIELD_PCT ? 'pill-good' : 'pill-warn'}`}>
              {facilityKpis.overallYieldPct >= CONTRACT_BENCHMARKS.MIN_ACCEPTABLE_YIELD_PCT ? 'Target Met' : 'Underperforming'}
            </span>
          </div>
        </div>

        {/* Card 3: Total Contract Leakage Variance */}
        <div className="pcp-ribbon-card">
          <div className="card-top">
            <span className="card-label">Contract Leakage</span>
            <div className="icon-wrapper crimson">
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className="card-metric text-warn">{formatCurrency(facilityKpis.totalLeakage)}</div>
          <div className="card-footer-info">
            <span>Identified fee deficit</span>
            <span className="status-pill pill-alert">Recoverable</span>
          </div>
        </div>

        {/* Card 4: Renegotiation Notice Alerts */}
        <div className="pcp-ribbon-card">
          <div className="card-top">
            <span className="card-label">Renewal Radar</span>
            <div className="icon-wrapper amber">
              <Clock size={18} />
            </div>
          </div>
          <div className="card-metric">{facilityKpis.activeRenewalAlertsCount} <span className="metric-unit">contracts</span></div>
          <div className="card-footer-info">
            <span>Notice cutoff ≤ 120d</span>
            <span className="status-pill pill-warn">Action Required</span>
          </div>
        </div>

        {/* Card 5: Potential Annual Uplift */}
        <div className="pcp-ribbon-card">
          <div className="card-top">
            <span className="card-label">Negotiation Uplift</span>
            <div className="icon-wrapper blue">
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="card-metric">{formatCurrency(facilityKpis.totalPotentialAnnualUplift)}</div>
          <div className="card-footer-info">
            <span>Target rate increases</span>
            <span className="rate-badge">Annualized</span>
          </div>
        </div>
      </div>

      {/* Main Tab Navigation & Controls */}
      <div className="pcp-tabs-row">
        <div className="tab-buttons">
          <button
            className={`tab-btn ${activeTab === 'matrix' ? 'active' : ''}`}
            onClick={() => setActiveTab('matrix')}
          >
            <BarChart2 size={16} />
            <span>Contract Performance Matrix</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'renewal_radar' ? 'active' : ''}`}
            onClick={() => setActiveTab('renewal_radar')}
          >
            <Clock size={16} />
            <span>Negotiation Strategy &amp; Renewal Radar</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'cpt_carveout' ? 'active' : ''}`}
            onClick={() => setActiveTab('cpt_carveout')}
          >
            <ShieldAlert size={16} />
            <span>CPT &amp; Carve-Out Yield Audit</span>
          </button>
        </div>

        <div className="quick-actions">
          <button
            className="action-btn secondary"
            onClick={() => showToast('Payer contracts reconciled with latest 835 remittance data.')}
          >
            <RefreshCw size={14} />
            <span>Reconcile Contracts</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="pcp-filters-bar">
        <div className="search-box">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search contract name, number, or payer..."
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
          <label><Filter size={14} /> Methodology:</label>
          <select
            value={selectedMethodology}
            onChange={(e) => setSelectedMethodology(e.target.value)}
          >
            <option value="ALL">All Methodologies</option>
            {Object.values(REIMBURSEMENT_METHODOLOGIES).map(m => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label><Sliders size={14} /> Renewal Status:</label>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            {Object.values(RENEGOTIATION_STATUSES).map(s => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>

        <div className="results-count">
          Showing <strong>{filteredContracts.length}</strong> of {contracts.length} contracts
        </div>
      </div>

      {/* TAB 1: Contract Performance Matrix */}
      {activeTab === 'matrix' && (
        <div className="pcp-table-card">
          <div className="pcp-table-header">
            <div>
              <h3>Payer Contract Reconciliation &amp; Yield Scorecard</h3>
              <p>Reconciling expected contracted allowables against actual 835 remittances, leakage variance, and renewal deadlines</p>
            </div>
          </div>

          <div className="pcp-table-responsive">
            <table className="pcp-table">
              <thead>
                <tr>
                  <th>Contract &amp; Payer</th>
                  <th>Methodology</th>
                  <th>Expiration Date</th>
                  <th>Notice Cutoff</th>
                  <th>Renegotiation Status</th>
                  <th>Expected Allowed</th>
                  <th>Actual Allowed</th>
                  <th>Yield %</th>
                  <th>Leakage ($)</th>
                  <th>Priority</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredContracts.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="empty-row">
                      <AlertCircle size={20} />
                      <span>No contract records match the selected filter criteria.</span>
                    </td>
                  </tr>
                ) : (
                  filteredContracts.map(c => {
                    const statusConfig = RENEGOTIATION_STATUSES[c.renegotiationStatus] || RENEGOTIATION_STATUSES.MONITORING;
                    const priorityConfig = NEGOTIATION_PRIORITIES[c.negotiationPriority] || NEGOTIATION_PRIORITIES.MEDIUM;
                    const isYieldLow = c.contractComplianceYieldPct < CONTRACT_BENCHMARKS.MIN_ACCEPTABLE_YIELD_PCT;

                    return (
                      <tr key={c.id} className={c.renegotiationStatus === 'CRITICAL_RENEWAL_ALERT' ? 'highlight-alert' : ''}>
                        <td>
                          <div className="contract-identity">
                            <span className="contract-title">{c.contractName}</span>
                            <div className="identity-tags">
                              <span className="code-badge">{c.contractNumber}</span>
                              <span className="payer-tag">{c.payerName}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="methodology-pill">{REIMBURSEMENT_METHODOLOGIES[c.reimbursementMethodology]?.label || c.reimbursementMethodology}</span>
                        </td>
                        <td>
                          <span className="date-cell">{c.expirationDate}</span>
                        </td>
                        <td>
                          <div className="countdown-cell">
                            <strong className={c.daysUntilNoticeCutoff <= 60 ? 'text-alert' : c.daysUntilNoticeCutoff <= 120 ? 'text-warn' : ''}>
                              {c.daysUntilNoticeCutoff} days
                            </strong>
                            <span className="sub-metric">Deadline: {c.renewalNoticeDeadline}</span>
                          </div>
                        </td>
                        <td>
                          <span
                            className="status-badge"
                            style={{
                              color: statusConfig.color,
                              backgroundColor: statusConfig.badgeBg,
                              borderColor: statusConfig.badgeBorder
                            }}
                          >
                            {statusConfig.label}
                          </span>
                        </td>
                        <td>{formatCurrency(c.contractExpectedAllowed)}</td>
                        <td>
                          <strong>{formatCurrency(c.actualAllowedAmount)}</strong>
                        </td>
                        <td>
                          <div className="yield-cell">
                            <span className={isYieldLow ? 'text-warn' : 'text-good'}>
                              {c.contractComplianceYieldPct}%
                            </span>
                            <div className="progress-bar-bg">
                              <div
                                className="progress-bar-fill"
                                style={{
                                  width: `${Math.min(100, c.contractComplianceYieldPct)}%`,
                                  backgroundColor: isYieldLow ? 'var(--color-amber, #d97706)' : 'var(--color-emerald, #059669)'
                                }}
                              />
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={c.contractLeakageVariance > 50000 ? 'text-alert' : c.contractLeakageVariance > 20000 ? 'text-warn' : ''}>
                            {formatCurrency(c.contractLeakageVariance)}
                          </span>
                        </td>
                        <td>
                          <span
                            className="priority-pill"
                            style={{ color: priorityConfig.color }}
                          >
                            {c.negotiationPriority}
                          </span>
                        </td>
                        <td>
                          <button
                            className="drilldown-btn"
                            onClick={() => setSelectedContract(c)}
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

      {/* TAB 2: Negotiation Strategy & Renewal Radar */}
      {activeTab === 'renewal_radar' && (
        <div className="pcp-grid">
          {/* Active Negotiation Pipeline */}
          <div className="pcp-dashboard-card">
            <div className="pcp-card-header">
              <h3 className="pcp-card-title">
                <Clock size={18} />
                Contract Renewal Radar &amp; Notice Timeline
              </h3>
              <span className="pcp-card-sub">Expiring contracts requiring formal notice to prevent evergreen auto-renewal</span>
            </div>

            <div className="pipeline-list">
              {filteredContracts.map(c => (
                <div key={c.id} className="pipeline-item">
                  <div className="item-header">
                    <div>
                      <span className="item-title">{c.contractName}</span>
                      <span className="item-sub">{c.payerName} ({c.contractNumber})</span>
                    </div>
                    <div className="countdown-box">
                      <span className="countdown-days">{c.daysUntilNoticeCutoff}d</span>
                      <span className="countdown-lbl">Until Notice Cutoff</span>
                    </div>
                  </div>

                  <div className="item-details">
                    <div className="detail-col">
                      <span className="detail-lbl">Current Yield</span>
                      <span className={`detail-val ${c.contractComplianceYieldPct < 95 ? 'text-warn' : 'text-good'}`}>
                        {c.contractComplianceYieldPct}%
                      </span>
                    </div>
                    <div className="detail-col">
                      <span className="detail-lbl">Leverage Score</span>
                      <span className="detail-val">{c.negotiationLeverageScore} / 100</span>
                    </div>
                    <div className="detail-col">
                      <span className="detail-lbl">Proposed Uplift</span>
                      <span className="detail-val text-good">+{c.proposedRateAdjustmentPct}% ({formatCurrency(c.potentialAnnualUplift)})</span>
                    </div>
                  </div>

                  <div className="item-target">
                    <strong>Primary Ask:</strong> {c.primaryNegotiationTarget}
                  </div>

                  <div className="item-actions">
                    <button
                      className="inline-btn primary"
                      onClick={() => {
                        setSelectedContract(c);
                      }}
                    >
                      Prepare Term Sheet
                    </button>
                    <button
                      className="inline-btn secondary"
                      onClick={() => {
                        showToast(`Notice calendar alert created for ${c.contractName} (Deadline: ${c.renewalNoticeDeadline})`);
                      }}
                    >
                      Set Notice Alert
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Negotiation Strategy Principles */}
          <div className="pcp-dashboard-card">
            <div className="pcp-card-header">
              <h3 className="pcp-card-title">
                <Sparkles size={18} />
                Data-Driven Negotiation Term Sheet Strategy
              </h3>
              <span className="pcp-card-sub">Core leverage drivers to maximize surgical reimbursement</span>
            </div>

            <div className="strategy-guidance">
              <div className="guidance-block">
                <h4>1. Eliminating Multiple Procedure Over-Discounting (MPPR)</h4>
                <p>Ensure commercial contracts apply MPPR only to secondary surgical codes within the same anatomic family, rather than cross-specialty procedures or primary bilateral cases.</p>
              </div>

              <div className="guidance-block">
                <h4>2. Transitioning High-Cost Implants to Carve-Outs</h4>
                <p>Replace bundled implant case rates on complex arthroplasty (27447, 27130) and spine with acquisition invoice cost + 12% to 15% markup on Revenue Code 0278.</p>
              </div>

              <div className="guidance-block">
                <h4>3. Statutory Prompt-Pay Enforcement</h4>
                <p>Incorporate binding 30-day electronic clean claim payment SLAs with automatic statutory interest penalties for chronic payment velocity laggards.</p>
              </div>

              <div className="guidance-block">
                <h4>4. Market Benchmark Parity</h4>
                <p>Benchmark CPT line items against regional Medicare ASC base rate equivalents, targeting a minimum conversion factor of 210% of Medicare for orthopedics and ENT.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: CPT & Carve-Out Yield Audit */}
      {activeTab === 'cpt_carveout' && (
        <div className="pcp-table-card">
          <div className="pcp-table-header">
            <div>
              <h3>High-Cost Implant Carve-Out &amp; CPT Exhibit Performance</h3>
              <p>Auditing device acquisition cost recovery and procedural yield against contracted fee schedule exhibits</p>
            </div>
          </div>

          <div className="pcp-table-responsive">
            <table className="pcp-table">
              <thead>
                <tr>
                  <th>Contract &amp; Payer</th>
                  <th>Implant Invoiced ($)</th>
                  <th>Implant Recovered ($)</th>
                  <th>Carve-Out Recovery %</th>
                  <th>Primary Underpayment Vulnerability</th>
                  <th>Sample CPT Rate Yields</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredContracts.map(c => {
                  const isCarveoutLow = c.implantCarveoutRecoveryPct < CONTRACT_BENCHMARKS.TARGET_IMPLANT_RECOVERY_PCT;
                  return (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.contractName}</strong>
                        <div className="sub-metric">{c.payerName}</div>
                      </td>
                      <td>{formatCurrency(c.implantCarveoutSpend)}</td>
                      <td><strong>{formatCurrency(c.implantCarveoutRecovered)}</strong></td>
                      <td>
                        <span className={`status-pill ${isCarveoutLow ? 'pill-alert' : 'pill-good'}`}>
                          {c.implantCarveoutRecoveryPct}%
                        </span>
                      </td>
                      <td>
                        <span className="vulnerability-text">{c.primaryNegotiationTarget}</span>
                      </td>
                      <td>
                        <div className="exhibit-mini-list">
                          {c.contractExhibits && c.contractExhibits.map(ex => (
                            <div key={ex.cptCode} className="exhibit-mini-item">
                              <span className="ex-cpt">{ex.cptCode}:</span>
                              <span className="ex-rates">{formatCurrency(ex.actualAllowed)} / {formatCurrency(ex.contractRate)}</span>
                              <span className={`ex-yield ${ex.yieldPct < 95 ? 'text-warn' : 'text-good'}`}>({ex.yieldPct}%)</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td>
                        <button
                          className="drilldown-btn"
                          onClick={() => setSelectedContract(c)}
                        >
                          Audit
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

      {/* Pinned Contract Drilldown Modal */}
      {selectedContract && (
        <div className="pcp-modal-backdrop" onClick={() => setSelectedContract(null)}>
          <div className="pcp-modal-container" onClick={(e) => e.stopPropagation()}>
            {/* Pinned Header */}
            <div className="pcp-modal-header">
              <div className="modal-title-group">
                <span className="modal-eyebrow">Payer Contract Performance Dossier</span>
                <h2>{selectedContract.contractName} ({selectedContract.contractNumber})</h2>
                <div className="modal-badges">
                  <span className="methodology-pill">{REIMBURSEMENT_METHODOLOGIES[selectedContract.reimbursementMethodology]?.label || selectedContract.reimbursementMethodology}</span>
                  <span
                    className="status-badge"
                    style={{
                      color: RENEGOTIATION_STATUSES[selectedContract.renegotiationStatus]?.color,
                      backgroundColor: RENEGOTIATION_STATUSES[selectedContract.renegotiationStatus]?.badgeBg,
                      borderColor: RENEGOTIATION_STATUSES[selectedContract.renegotiationStatus]?.badgeBorder
                    }}
                  >
                    {RENEGOTIATION_STATUSES[selectedContract.renegotiationStatus]?.label}
                  </span>
                  <span className="leverage-badge">Leverage Score: {selectedContract.negotiationLeverageScore} / 100</span>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setSelectedContract(null)}>
                <X size={20} />
              </button>
            </div>

            {/* Scrollable Modal Body */}
            <div className="pcp-modal-body">
              {/* Financial Reconciliation Summary */}
              <div className="modal-section">
                <h3>Contract Reconciliation Summary</h3>
                <div className="waterfall-grid">
                  <div className="waterfall-item">
                    <span className="wf-label">Contract Expected Allowed</span>
                    <span className="wf-val">{formatCurrency(selectedContract.contractExpectedAllowed)}</span>
                    <span className="wf-sub">{selectedContract.totalCasesVolume} cases evaluated</span>
                  </div>
                  <div className="waterfall-item highlighted">
                    <span className="wf-label">Actual Allowed Realized</span>
                    <span className="wf-val text-good">{formatCurrency(selectedContract.actualAllowedAmount)}</span>
                    <span className="wf-sub">{selectedContract.contractComplianceYieldPct}% Contract Yield</span>
                  </div>
                  <div className="waterfall-item">
                    <span className="wf-label">Contractual Leakage Deficit</span>
                    <span className="wf-val text-warn">{formatCurrency(selectedContract.contractLeakageVariance)}</span>
                    <span className="wf-sub">Underpayment variance</span>
                  </div>
                  <div className="waterfall-item">
                    <span className="wf-label">Projected Annual Uplift</span>
                    <span className="wf-val text-good">+{formatCurrency(selectedContract.potentialAnnualUplift)}</span>
                    <span className="wf-sub">At +{selectedContract.proposedRateAdjustmentPct}% rate increase</span>
                  </div>
                </div>
              </div>

              {/* Renewal Notice Countdown */}
              <div className="modal-section">
                <h3>Term &amp; Renewal Notice Window</h3>
                <div className="metrics-triad">
                  <div className="triad-card">
                    <span className="triad-label">Current Expiration Date</span>
                    <span className="triad-val">{selectedContract.expirationDate}</span>
                    <span className="triad-sub">Effective: {selectedContract.effectiveDate}</span>
                  </div>
                  <div className="triad-card">
                    <span className="triad-label">Written Notice Deadline</span>
                    <span className="triad-val text-warn">{selectedContract.renewalNoticeDeadline}</span>
                    <span className="triad-sub">Mandatory written notice</span>
                  </div>
                  <div className="triad-card">
                    <span className="triad-label">Days to Notice Cutoff</span>
                    <span className={`triad-val ${selectedContract.daysUntilNoticeCutoff <= 60 ? 'text-alert' : 'text-good'}`}>
                      {selectedContract.daysUntilNoticeCutoff} days
                    </span>
                    <span className="triad-sub">Countdown to auto-renewal</span>
                  </div>
                </div>
              </div>

              {/* CPT Rate Exhibits Breakdown */}
              <div className="modal-section">
                <h3>Key CPT Rate Exhibits &amp; Adjudication Trace</h3>
                <div className="exhibit-table-box">
                  <table className="pcp-table small">
                    <thead>
                      <tr>
                        <th>CPT Code</th>
                        <th>Procedure Description</th>
                        <th>Contract Rate</th>
                        <th>Actual Allowed</th>
                        <th>Yield %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedContract.contractExhibits && selectedContract.contractExhibits.map(ex => (
                        <tr key={ex.cptCode}>
                          <td><strong>{ex.cptCode}</strong></td>
                          <td>{ex.name}</td>
                          <td>{formatCurrency(ex.contractRate)}</td>
                          <td><strong>{formatCurrency(ex.actualAllowed)}</strong></td>
                          <td>
                            <span className={`status-pill ${ex.yieldPct >= 95 ? 'pill-good' : 'pill-warn'}`}>
                              {ex.yieldPct}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Negotiation Action Plan */}
              <div className="modal-section">
                <h3>Strategic Negotiation Term Sheet Plan</h3>
                <div className="strategy-box">
                  <Sparkles size={18} className="strategy-icon" />
                  <div>
                    <strong>Actionable Playbook:</strong>
                    <p>{selectedContract.primaryNegotiationTarget}</p>
                    <ul className="strategy-points">
                      <li>Target a <strong>+{selectedContract.proposedRateAdjustmentPct}%</strong> rate increase across surgical exhibits to capture <strong>{formatCurrency(selectedContract.potentialAnnualUplift)}</strong> in annual uplift.</li>
                      <li>Current implant carveout recovery is <strong>{selectedContract.implantCarveoutRecoveryPct}%</strong> ({formatCurrency(selectedContract.implantCarveoutRecovered)} of {formatCurrency(selectedContract.implantCarveoutSpend)}). Add strict invoice + 12% language.</li>
                      <li>Serve formal notice before <strong>{selectedContract.renewalNoticeDeadline}</strong> to preserve full bargaining leverage.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Pinned Footer */}
            <div className="pcp-modal-footer">
              <button
                className="modal-action-btn secondary"
                onClick={() => {
                  showToast(`Negotiation term sheet for ${selectedContract.contractName} exported to PDF/Excel.`);
                  setSelectedContract(null);
                }}
              >
                <FileText size={16} />
                <span>Export Negotiation Term Sheet</span>
              </button>
              <button
                className="modal-action-btn primary"
                onClick={() => {
                  showToast(`Contract ${selectedContract.contractNumber} marked as 'In Active Bargaining'.`);
                  setSelectedContract(null);
                }}
              >
                <FileCheck size={16} />
                <span>Mark in Active Bargaining</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
