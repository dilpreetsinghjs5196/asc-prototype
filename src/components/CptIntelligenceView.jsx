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
  Zap,
  Activity,
  Users,
  Briefcase
} from 'lucide-react';
import {
  CPT_SPECIALTIES,
  CPT_PERFORMANCE_TIERS,
  CPT_BENCHMARKS,
  SEED_CPT_INTELLIGENCE,
  calculateFacilityCptKpis
} from '../services/cptIntelligenceService';
import './CptIntelligenceView.css';

export default function CptIntelligenceView() {
  const [activeTab, setActiveTab] = useState('matrix'); // 'matrix', 'surgeon_variance', 'payer_spread'
  const [cptList, setCptList] = useState(SEED_CPT_INTELLIGENCE);
  const [selectedSpecialty, setSelectedSpecialty] = useState('ALL');
  const [selectedTier, setSelectedTier] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCpt, setSelectedCpt] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Facility-wide KPI aggregations
  const facilityKpis = useMemo(() => {
    return calculateFacilityCptKpis(cptList);
  }, [cptList]);

  // Filtered CPT list
  const filteredCpts = useMemo(() => {
    return cptList.filter(c => {
      const matchesSpecialty = selectedSpecialty === 'ALL' || c.specialty === selectedSpecialty;
      const matchesTier = selectedTier === 'ALL' || c.performanceTier === selectedTier;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        c.cptCode.toLowerCase().includes(q) ||
        c.procedureName.toLowerCase().includes(q) ||
        c.anatomicCategory.toLowerCase().includes(q) ||
        (c.primaryOpportunity && c.primaryOpportunity.toLowerCase().includes(q));

      return matchesSpecialty && matchesTier && matchesSearch;
    });
  }, [cptList, selectedSpecialty, selectedTier, searchQuery]);

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
    <div className="cpti-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="cpti-toast">
          <CheckCircle2 size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top 5-Card Executive Metric Ribbon */}
      <div className="cpti-ribbon">
        {/* Card 1: Total Evaluated CPT Codes */}
        <div className="cpti-ribbon-card primary">
          <div className="card-top">
            <span className="card-label">Evaluated Procedures</span>
            <div className="icon-wrapper blue">
              <Activity size={18} />
            </div>
          </div>
          <div className="card-metric">{facilityKpis.totalEvaluatedCpts} <span className="metric-unit">CPT codes</span></div>
          <div className="card-footer-info">
            <span>Annual Case Volume</span>
            <span className="rate-badge">{formatNumber(facilityKpis.totalAnnualVolume)} cases</span>
          </div>
        </div>

        {/* Card 2: Average Contribution Margin per OR-Hour */}
        <div className="cpti-ribbon-card">
          <div className="card-top">
            <span className="card-label">OR-Hour Margin Yield</span>
            <div className="icon-wrapper emerald">
              <DollarSign size={18} />
            </div>
          </div>
          <div className="card-metric">{formatCurrency(facilityKpis.avgMarginPerOrHour)} <span className="metric-unit">/ hr</span></div>
          <div className="card-footer-info">
            <span>Suite velocity index</span>
            <span className={`status-pill ${facilityKpis.avgMarginPerOrHour >= CPT_BENCHMARKS.TARGET_MARGIN_PER_OR_HOUR ? 'pill-good' : 'pill-warn'}`}>
              {facilityKpis.avgMarginPerOrHour >= CPT_BENCHMARKS.TARGET_MARGIN_PER_OR_HOUR ? 'Target Met' : 'Sub-Optimal'}
            </span>
          </div>
        </div>

        {/* Card 3: Portfolio Medicare Parity */}
        <div className="cpti-ribbon-card">
          <div className="card-top">
            <span className="card-label">Medicare Parity Spread</span>
            <div className="icon-wrapper blue">
              <Scale size={18} />
            </div>
          </div>
          <div className="card-metric">{facilityKpis.portfolioMedicareParityPct}%</div>
          <div className="card-footer-info">
            <span>Commercial vs Base Addenda</span>
            <span className="status-pill pill-good">Benchmark: ≥175%</span>
          </div>
        </div>

        {/* Card 4: First-Pass Procedural Denial Rate */}
        <div className="cpti-ribbon-card">
          <div className="card-top">
            <span className="card-label">Procedural Denial Rate</span>
            <div className="icon-wrapper crimson">
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className="card-metric text-warn">{facilityKpis.avgFirstPassDenialRatePct}%</div>
          <div className="card-footer-info">
            <span>First-pass rejections</span>
            <span className={`status-pill ${facilityKpis.avgFirstPassDenialRatePct <= CPT_BENCHMARKS.MAX_ACCEPTABLE_DENIAL_RATE_PCT ? 'pill-good' : 'pill-alert'}`}>
              {facilityKpis.avgFirstPassDenialRatePct <= CPT_BENCHMARKS.MAX_ACCEPTABLE_DENIAL_RATE_PCT ? 'Controlled' : 'Elevated'}
            </span>
          </div>
        </div>

        {/* Card 5: High-Friction / Diluter Procedures */}
        <div className="cpti-ribbon-card">
          <div className="card-top">
            <span className="card-label">Friction Action Radar</span>
            <div className="icon-wrapper amber">
              <Clock size={18} />
            </div>
          </div>
          <div className="card-metric">{facilityKpis.highFrictionCount} <span className="metric-unit">codes</span></div>
          <div className="card-footer-info">
            <span>Denial or margin alerts</span>
            <span className="status-pill pill-warn">Action Required</span>
          </div>
        </div>
      </div>

      {/* Main Tab Navigation & Controls */}
      <div className="cpti-tabs-row">
        <div className="tab-buttons">
          <button
            className={`tab-btn ${activeTab === 'matrix' ? 'active' : ''}`}
            onClick={() => setActiveTab('matrix')}
          >
            <BarChart2 size={16} />
            <span>CPT Portfolio Economics &amp; Yield Matrix</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'surgeon_variance' ? 'active' : ''}`}
            onClick={() => setActiveTab('surgeon_variance')}
          >
            <Users size={16} />
            <span>Surgeon Technique &amp; Duration Variance</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'payer_spread' ? 'active' : ''}`}
            onClick={() => setActiveTab('payer_spread')}
          >
            <ShieldAlert size={16} />
            <span>Denial Friction &amp; Payer Spread</span>
          </button>
        </div>

        <div className="quick-actions">
          <button
            className="action-btn secondary"
            onClick={() => showToast('Procedural cost matrix reconciled with active preference cards and claims.')}
          >
            <RefreshCw size={14} />
            <span>Reconcile Procedural Ledger</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="cpti-filters-bar">
        <div className="search-box">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search CPT code, procedure name, or anatomy..."
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
          <label><Filter size={14} /> Specialty:</label>
          <select
            value={selectedSpecialty}
            onChange={(e) => setSelectedSpecialty(e.target.value)}
          >
            <option value="ALL">All Specialties</option>
            {Object.values(CPT_SPECIALTIES).map(s => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label><Sliders size={14} /> Performance Tier:</label>
          <select
            value={selectedTier}
            onChange={(e) => setSelectedTier(e.target.value)}
          >
            <option value="ALL">All Tiers</option>
            {Object.values(CPT_PERFORMANCE_TIERS).map(t => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="results-count">
          Showing <strong>{filteredCpts.length}</strong> of {cptList.length} procedures
        </div>
      </div>

      {/* TAB 1: CPT Portfolio Economics & Yield Matrix */}
      {activeTab === 'matrix' && (
        <div className="cpti-table-card">
          <div className="cpti-table-header">
            <div>
              <h3>Procedural Economic Productivity &amp; OR-Hour Velocity</h3>
              <p>Evaluating CPT line items by skin-to-skin operative duration, net collection realization, margin per suite-hour, and billing friction</p>
            </div>
          </div>

          <div className="cpti-table-responsive">
            <table className="cpti-table">
              <thead>
                <tr>
                  <th>CPT Code &amp; Procedure</th>
                  <th>Specialty</th>
                  <th>Annual Volume</th>
                  <th>Operative Time</th>
                  <th>Net Collections</th>
                  <th>Contribution Margin</th>
                  <th>Margin / OR-Hour</th>
                  <th>Medicare Parity</th>
                  <th>Denial Rate</th>
                  <th>Tier</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredCpts.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="empty-row">
                      <AlertCircle size={20} />
                      <span>No procedural records match the selected filter criteria.</span>
                    </td>
                  </tr>
                ) : (
                  filteredCpts.map(cpt => {
                    const tierConfig = CPT_PERFORMANCE_TIERS[cpt.performanceTier] || CPT_PERFORMANCE_TIERS.TIER_2_EFFICIENT_VOLUME;
                    const isYieldHigh = cpt.marginPerOrHour >= CPT_BENCHMARKS.TARGET_MARGIN_PER_OR_HOUR;
                    const isDenialHigh = cpt.firstPassDenialRatePct >= CPT_BENCHMARKS.MAX_ACCEPTABLE_DENIAL_RATE_PCT;

                    return (
                      <tr key={cpt.id} className={cpt.performanceTier === 'TIER_4_HIGH_FRICTION' ? 'highlight-alert' : ''}>
                        <td>
                          <div className="cpt-identity">
                            <span className="cpt-title">{cpt.procedureName}</span>
                            <div className="identity-tags">
                              <span className="code-badge">{cpt.cptCode}</span>
                              <span className="anatomy-tag">{cpt.anatomicCategory}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="specialty-pill">{CPT_SPECIALTIES[cpt.specialty]?.label || cpt.specialty}</span>
                        </td>
                        <td>
                          <strong>{cpt.annualCaseVolume}</strong> <span className="sub-metric">cases</span>
                        </td>
                        <td>
                          <div className="duration-cell">
                            <strong>{cpt.avgActualOrMinutes}m</strong>
                            <span className="sub-metric">P80: {cpt.p80DurationMinutes}m</span>
                          </div>
                        </td>
                        <td>{formatCurrency(cpt.netCollections)}</td>
                        <td>
                          <strong>{formatCurrency(cpt.contributionMargin)}</strong>
                          <div className="sub-metric">{formatCurrency(cpt.marginPerCase)} / case</div>
                        </td>
                        <td>
                          <div className="yield-cell">
                            <span className={isYieldHigh ? 'text-good' : 'text-warn'}>
                              <strong>{formatCurrency(cpt.marginPerOrHour)}</strong> / hr
                            </span>
                            <div className="progress-bar-bg">
                              <div
                                className="progress-bar-fill"
                                style={{
                                  width: `${Math.min(100, (cpt.marginPerOrHour / 3000) * 100)}%`,
                                  backgroundColor: isYieldHigh ? 'var(--color-emerald, #059669)' : 'var(--color-amber, #d97706)'
                                }}
                              />
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`parity-badge ${cpt.medicareParityPct >= CPT_BENCHMARKS.MIN_MEDICARE_PARITY_PCT ? 'text-good' : 'text-warn'}`}>
                            {cpt.medicareParityPct}%
                          </span>
                        </td>
                        <td>
                          <span className={isDenialHigh ? 'text-alert' : 'text-good'}>
                            {cpt.firstPassDenialRatePct}%
                          </span>
                        </td>
                        <td>
                          <span
                            className="status-badge"
                            style={{
                              color: tierConfig.color,
                              backgroundColor: tierConfig.badgeBg,
                              borderColor: tierConfig.badgeBorder
                            }}
                          >
                            {tierConfig.label}
                          </span>
                        </td>
                        <td>
                          <button
                            className="drilldown-btn"
                            onClick={() => setSelectedCpt(cpt)}
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

      {/* TAB 2: Surgeon Technique & Duration Variance */}
      {activeTab === 'surgeon_variance' && (
        <div className="cpti-grid">
          {/* Comparative Procedure Cards */}
          <div className="cpti-dashboard-card full-width">
            <div className="cpti-card-header">
              <h3 className="cpti-card-title">
                <Users size={18} />
                Cross-Surgeon Operative Technique &amp; Cost Variance
              </h3>
              <span className="cpti-card-sub">Analyzing skin-to-skin time and surgical supply/implant expenditure across credentialed surgeons for identical CPT procedures</span>
            </div>

            <div className="variance-container">
              {filteredCpts.map(cpt => (
                <div key={cpt.id} className="variance-card">
                  <div className="variance-card-header">
                    <div>
                      <span className="v-cpt-title">{cpt.procedureName}</span>
                      <div className="v-tags">
                        <span className="code-badge">{cpt.cptCode}</span>
                        <span className="specialty-pill">{CPT_SPECIALTIES[cpt.specialty]?.label || cpt.specialty}</span>
                        <span className="sub-metric">Facility Avg: {cpt.avgActualOrMinutes}m | {formatCurrency(cpt.marginPerOrHour)}/hr</span>
                      </div>
                    </div>
                    <button
                      className="drilldown-btn"
                      onClick={() => setSelectedCpt(cpt)}
                    >
                      Audit Details
                    </button>
                  </div>

                  {cpt.surgeonBreakdown && cpt.surgeonBreakdown.length > 0 ? (
                    <div className="surgeon-variance-table-box">
                      <table className="cpti-table small">
                        <thead>
                          <tr>
                            <th>Surgeon</th>
                            <th>Case Volume</th>
                            <th>Skin-to-Skin</th>
                            <th>P80 Duration</th>
                            <th>Avg Supply Cost</th>
                            <th>Avg Implant Cost</th>
                            <th>Contribution Margin</th>
                            <th>Margin / OR-Hour</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cpt.surgeonBreakdown.map(s => {
                            const isTimeLower = s.avgSkinToSkinMinutes < cpt.avgActualOrMinutes;
                            const isMarginHigher = s.marginPerOrHour >= cpt.marginPerOrHour;

                            return (
                              <tr key={s.surgeonId}>
                                <td><strong>{s.surgeonName}</strong></td>
                                <td>{s.caseCount} cases</td>
                                <td>
                                  <span className={isTimeLower ? 'text-good' : 'text-warn'}>
                                    <strong>{s.avgSkinToSkinMinutes}m</strong>
                                  </span>
                                </td>
                                <td>{s.p80DurationMinutes}m</td>
                                <td>{formatCurrency(s.avgSupplyCost)}</td>
                                <td>{formatCurrency(s.avgImplantCost)}</td>
                                <td>{formatCurrency(s.avgContributionMargin)}</td>
                                <td>
                                  <span className={isMarginHigher ? 'text-good' : 'text-warn'}>
                                    <strong>{formatCurrency(s.marginPerOrHour)}</strong>
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="no-breakdown-text">No cross-surgeon variance breakdown recorded.</div>
                  )}

                  <div className="v-footer">
                    <Sparkles size={14} className="sparkle-icon" />
                    <span><strong>Optimization Signal:</strong> {cpt.primaryOpportunity}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Denial Friction & Payer Reimbursement Spread */}
      {activeTab === 'payer_spread' && (
        <div className="cpti-grid">
          {/* Payer Spread & Denial Root Cause */}
          <div className="cpti-dashboard-card full-width">
            <div className="cpti-card-header">
              <h3 className="cpti-card-title">
                <ShieldAlert size={18} />
                Payer Reimbursement Spread &amp; CARC Denial Friction
              </h3>
              <span className="cpti-card-sub">Adjudication velocity, commercial vs Medicare ASC parity spread, and primary CARC rejection codes</span>
            </div>

            <div className="variance-container">
              {filteredCpts.map(cpt => (
                <div key={cpt.id} className="variance-card">
                  <div className="variance-card-header">
                    <div>
                      <span className="v-cpt-title">{cpt.procedureName} ({cpt.cptCode})</span>
                      <div className="v-tags">
                        <span className="stat-item">Medicare Base: <strong>{formatCurrency(cpt.medicareAscBaseRate)}</strong></span>
                        <span className="stat-item">Commercial Avg: <strong>{formatCurrency(cpt.commercialAvgAllowed)}</strong></span>
                        <span className="stat-item">Parity: <strong className="text-good">{cpt.medicareParityPct}%</strong></span>
                        <span className="stat-item">Friction Index: <strong className={cpt.proceduralFrictionIndex >= 30 ? 'text-warn' : 'text-good'}>{cpt.proceduralFrictionIndex} / 100</strong></span>
                      </div>
                    </div>
                    <button
                      className="drilldown-btn"
                      onClick={() => setSelectedCpt(cpt)}
                    >
                      Payer Trace
                    </button>
                  </div>

                  {cpt.payerSpread && cpt.payerSpread.length > 0 ? (
                    <div className="surgeon-variance-table-box">
                      <table className="cpti-table small">
                        <thead>
                          <tr>
                            <th>Health Plan / Payer</th>
                            <th>Claims Count</th>
                            <th>Contract Rate</th>
                            <th>Actual Allowed</th>
                            <th>Medicare Parity %</th>
                            <th>First-Pass Denial %</th>
                            <th>Primary CARC Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cpt.payerSpread.map(p => (
                            <tr key={p.payerCode}>
                              <td><strong>{p.payerName}</strong></td>
                              <td>{p.claimsCount} claims</td>
                              <td>{formatCurrency(p.contractRate)}</td>
                              <td><strong>{formatCurrency(p.actualAvgAllowed)}</strong></td>
                              <td>
                                <span className={`parity-badge ${p.medicareParityPct >= 175 ? 'text-good' : 'text-warn'}`}>
                                  {p.medicareParityPct}%
                                </span>
                              </td>
                              <td>
                                <span className={p.firstPassDenialRatePct >= 8.0 ? 'text-alert' : 'text-good'}>
                                  {p.firstPassDenialRatePct}%
                                </span>
                              </td>
                              <td>
                                <span className="carc-reason-pill">{p.primaryDenialReason}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="no-breakdown-text">No payer spread records recorded.</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Pinned CPT Drilldown Modal */}
      {selectedCpt && (
        <div className="cpti-modal-backdrop" onClick={() => setSelectedCpt(null)}>
          <div className="cpti-modal-container" onClick={(e) => e.stopPropagation()}>
            {/* Pinned Header */}
            <div className="cpti-modal-header">
              <div className="modal-title-group">
                <span className="modal-eyebrow">Procedural Intelligence Dossier</span>
                <h2>{selectedCpt.procedureName} (CPT {selectedCpt.cptCode})</h2>
                <div className="modal-badges">
                  <span className="specialty-pill">{CPT_SPECIALTIES[selectedCpt.specialty]?.label || selectedCpt.specialty}</span>
                  <span className="code-badge">{selectedCpt.anatomicCategory}</span>
                  <span
                    className="status-badge"
                    style={{
                      color: CPT_PERFORMANCE_TIERS[selectedCpt.performanceTier]?.color,
                      backgroundColor: CPT_PERFORMANCE_TIERS[selectedCpt.performanceTier]?.badgeBg,
                      borderColor: CPT_PERFORMANCE_TIERS[selectedCpt.performanceTier]?.badgeBorder
                    }}
                  >
                    {CPT_PERFORMANCE_TIERS[selectedCpt.performanceTier]?.label}
                  </span>
                  <span className="rate-badge">Friction Index: {selectedCpt.proceduralFrictionIndex} / 100</span>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setSelectedCpt(null)}>
                <X size={20} />
              </button>
            </div>

            {/* Scrollable Modal Body */}
            <div className="cpti-modal-body">
              {/* Financial Waterfall Summary */}
              <div className="modal-section">
                <h3>Procedural Financial Waterfall</h3>
                <div className="waterfall-grid">
                  <div className="waterfall-item">
                    <span className="wf-label">Total Billed Charges</span>
                    <span className="wf-val">{formatCurrency(selectedCpt.totalBilledCharges)}</span>
                    <span className="wf-sub">{selectedCpt.annualCaseVolume} cases evaluated</span>
                  </div>
                  <div className="waterfall-item highlighted">
                    <span className="wf-label">Net Collections</span>
                    <span className="wf-val text-good">{formatCurrency(selectedCpt.netCollections)}</span>
                    <span className="wf-sub">Realized revenue</span>
                  </div>
                  <div className="waterfall-item">
                    <span className="wf-label">Direct Cost (Variable)</span>
                    <span className="wf-val text-warn">{formatCurrency(selectedCpt.totalDirectCost)}</span>
                    <span className="wf-sub">Implants + Supplies + Labor</span>
                  </div>
                  <div className="waterfall-item highlighted">
                    <span className="wf-label">Contribution Margin</span>
                    <span className="wf-val text-good">{formatCurrency(selectedCpt.contributionMargin)}</span>
                    <span className="wf-sub">{formatCurrency(selectedCpt.marginPerCase)} / case</span>
                  </div>
                </div>
              </div>

              {/* Direct Cost Breakdown Triad */}
              <div className="modal-section">
                <h3>Direct Variable Cost Component Breakdown</h3>
                <div className="metrics-triad">
                  <div className="triad-card">
                    <span className="triad-label">Implant Hardware Cost</span>
                    <span className="triad-val">{formatCurrency(selectedCpt.implantCost)}</span>
                    <span className="triad-sub">{selectedCpt.implantCost > 0 ? `${formatCurrency(selectedCpt.implantCost / selectedCpt.annualCaseVolume)} / case` : 'No Implants'}</span>
                  </div>
                  <div className="triad-card">
                    <span className="triad-label">Specialized Sterile Supplies</span>
                    <span className="triad-val">{formatCurrency(selectedCpt.supplyCost)}</span>
                    <span className="triad-sub">{formatCurrency(selectedCpt.supplyCost / selectedCpt.annualCaseVolume)} / case</span>
                  </div>
                  <div className="triad-card">
                    <span className="triad-label">OR Nursing Labor Cost</span>
                    <span className="triad-val">{formatCurrency(selectedCpt.laborCost)}</span>
                    <span className="triad-sub">Time-driven suite allocation</span>
                  </div>
                </div>
              </div>

              {/* Operative Velocity & OR Suite Productivity */}
              <div className="modal-section">
                <h3>Operative Velocity &amp; Productivity Metrics</h3>
                <div className="metrics-triad">
                  <div className="triad-card">
                    <span className="triad-label">Skin-to-Skin Duration</span>
                    <span className="triad-val">{selectedCpt.avgActualOrMinutes}m</span>
                    <span className="triad-sub">Calibrated P80: {selectedCpt.p80DurationMinutes}m</span>
                  </div>
                  <div className="triad-card">
                    <span className="triad-label">Room Turnover Time</span>
                    <span className="triad-val text-good">{selectedCpt.avgTurnoverMinutes}m</span>
                    <span className="triad-sub">Same-room wheels-out to in</span>
                  </div>
                  <div className="triad-card">
                    <span className="triad-label">Contribution / OR-Hour</span>
                    <span className="triad-val text-good">{formatCurrency(selectedCpt.marginPerOrHour)}</span>
                    <span className="triad-sub">Suite hourly profitability</span>
                  </div>
                </div>
              </div>

              {/* Surgeon Technique Leaderboard for this CPT */}
              {selectedCpt.surgeonBreakdown && selectedCpt.surgeonBreakdown.length > 0 && (
                <div className="modal-section">
                  <h3>Credentialed Surgeon Technique Comparison</h3>
                  <div className="exhibit-table-box">
                    <table className="cpti-table small">
                      <thead>
                        <tr>
                          <th>Surgeon Name</th>
                          <th>Cases</th>
                          <th>Skin-to-Skin Time</th>
                          <th>Supply Cost</th>
                          <th>Implant Cost</th>
                          <th>Contribution / Case</th>
                          <th>Margin / OR-Hour</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedCpt.surgeonBreakdown.map(s => (
                          <tr key={s.surgeonId}>
                            <td><strong>{s.surgeonName}</strong></td>
                            <td>{s.caseCount}</td>
                            <td><strong>{s.avgSkinToSkinMinutes}m</strong></td>
                            <td>{formatCurrency(s.avgSupplyCost)}</td>
                            <td>{formatCurrency(s.avgImplantCost)}</td>
                            <td>{formatCurrency(s.avgContributionMargin)}</td>
                            <td>
                              <span className="text-good">
                                <strong>{formatCurrency(s.marginPerOrHour)}</strong>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Strategic Procedural Optimization Playbook */}
              <div className="modal-section">
                <h3>Strategic Procedural Optimization Playbook</h3>
                <div className="strategy-box">
                  <Sparkles size={18} className="strategy-icon" />
                  <div>
                    <strong>Actionable Clinical Recommendation:</strong>
                    <p>{selectedCpt.primaryOpportunity}</p>
                    <ul className="strategy-points">
                      <li>Medicare ASC statutory base rate: <strong>{formatCurrency(selectedCpt.medicareAscBaseRate)}</strong> vs commercial average allowed: <strong>{formatCurrency(selectedCpt.commercialAvgAllowed)}</strong> ({selectedCpt.medicareParityPct}% parity).</li>
                      <li>First-pass denial rate: <strong>{selectedCpt.firstPassDenialRatePct}%</strong> ({selectedCpt.denialOverturnRatePct}% overturn resolution). Adjudication velocity: <strong>{selectedCpt.avgDaysToPay} days</strong>.</li>
                      <li>Operative report documentation lag: <strong>{selectedCpt.avgDocumentationLagDays} days</strong> from surgery to billable sign-off.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Pinned Footer */}
            <div className="cpti-modal-footer">
              <button
                className="modal-action-btn secondary"
                onClick={() => {
                  showToast(`Procedural intelligence dossier for CPT ${selectedCpt.cptCode} exported to PDF/Excel.`);
                  setSelectedCpt(null);
                }}
              >
                <FileText size={16} />
                <span>Export CPT Dossier</span>
              </button>
              <button
                className="modal-action-btn primary"
                onClick={() => {
                  showToast(`CPT ${selectedCpt.cptCode} flagged for preference card standardization & scheduling priority.`);
                  setSelectedCpt(null);
                }}
              >
                <FileCheck size={16} />
                <span>Flag for Standardization</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
