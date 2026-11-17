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
  PieChart,
  Briefcase
} from 'lucide-react';
import {
  ECONOMIC_QUADRANTS,
  ECONOMIC_BENCHMARKS,
  SEED_CPT_ECONOMICS,
  calculateFacilityEconomicsKpis
} from '../services/cptEconomicsService';
import './CptEconomicsView.css';

export default function CptEconomicsView() {
  const [activeTab, setActiveTab] = useState('matrix'); // 'matrix', 'cost_breakdown', 'breakeven_radar'
  const [cptList, setCptList] = useState(SEED_CPT_ECONOMICS);
  const [selectedSpecialty, setSelectedSpecialty] = useState('ALL');
  const [selectedQuadrant, setSelectedQuadrant] = useState('ALL');
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
    return calculateFacilityEconomicsKpis(cptList);
  }, [cptList]);

  // Extract unique specialties from list
  const specialties = useMemo(() => {
    return ['ALL', ...new Set(cptList.map(c => c.specialty))];
  }, [cptList]);

  // Filtered CPT list
  const filteredCpts = useMemo(() => {
    return cptList.filter(c => {
      const matchesSpecialty = selectedSpecialty === 'ALL' || c.specialty === selectedSpecialty;
      const matchesQuadrant = selectedQuadrant === 'ALL' || c.economicQuadrant === selectedQuadrant;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        c.cptCode.toLowerCase().includes(q) ||
        c.procedureName.toLowerCase().includes(q) ||
        c.specialty.toLowerCase().includes(q) ||
        (c.primaryEconomicLever && c.primaryEconomicLever.toLowerCase().includes(q));

      return matchesSpecialty && matchesQuadrant && matchesSearch;
    });
  }, [cptList, selectedSpecialty, selectedQuadrant, searchQuery]);

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
    <div className="cpte-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="cpte-toast">
          <CheckCircle2 size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top 5-Card Executive Metric Ribbon */}
      <div className="cpte-ribbon">
        {/* Card 1: Total Procedural Net Collections */}
        <div className="cpte-ribbon-card primary">
          <div className="card-top">
            <span className="card-label">Procedural Revenue</span>
            <div className="icon-wrapper blue">
              <DollarSign size={18} />
            </div>
          </div>
          <div className="card-metric">{formatCurrency(facilityKpis.totalNetCollections)}</div>
          <div className="card-footer-info">
            <span>Portfolio Collections</span>
            <span className="rate-badge">{formatNumber(facilityKpis.totalAnnualVolume)} cases</span>
          </div>
        </div>

        {/* Card 2: Total Direct Contribution Margin */}
        <div className="cpte-ribbon-card">
          <div className="card-top">
            <span className="card-label">Contribution Margin</span>
            <div className="icon-wrapper emerald">
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="card-metric">{formatCurrency(facilityKpis.totalContributionMargin)}</div>
          <div className="card-footer-info">
            <span>Margin Realization</span>
            <span className="status-pill pill-good">{facilityKpis.portfolioContributionMarginPct}% Margin</span>
          </div>
        </div>

        {/* Card 3: Average Margin per OR-Hour */}
        <div className="cpte-ribbon-card">
          <div className="card-top">
            <span className="card-label">OR-Hour Margin Yield</span>
            <div className="icon-wrapper blue">
              <Clock size={18} />
            </div>
          </div>
          <div className="card-metric">{formatCurrency(facilityKpis.avgMarginPerOrHour)} <span className="metric-unit">/ hr</span></div>
          <div className="card-footer-info">
            <span>Suite velocity yield</span>
            <span className={`status-pill ${facilityKpis.avgMarginPerOrHour >= ECONOMIC_BENCHMARKS.TARGET_MARGIN_PER_OR_HOUR ? 'pill-good' : 'pill-warn'}`}>
              {facilityKpis.avgMarginPerOrHour >= ECONOMIC_BENCHMARKS.TARGET_MARGIN_PER_OR_HOUR ? 'Target Met' : 'Sub-Optimal'}
            </span>
          </div>
        </div>

        {/* Card 4: Fully Loaded Operating Margin % */}
        <div className="cpte-ribbon-card">
          <div className="card-top">
            <span className="card-label">Operating Margin</span>
            <div className="icon-wrapper emerald">
              <Scale size={18} />
            </div>
          </div>
          <div className="card-metric">{facilityKpis.portfolioFullyLoadedMarginPct}%</div>
          <div className="card-footer-info">
            <span>After fixed overhead</span>
            <span className="status-pill pill-good">Benchmark: ≥30%</span>
          </div>
        </div>

        {/* Card 5: Prime Yield Anchor Count */}
        <div className="cpte-ribbon-card">
          <div className="card-top">
            <span className="card-label">Economic Anchors</span>
            <div className="icon-wrapper amber">
              <Award size={18} />
            </div>
          </div>
          <div className="card-metric">{facilityKpis.primeYieldAnchorCount} <span className="metric-unit">anchors</span></div>
          <div className="card-footer-info">
            <span>High-yield procedures</span>
            <span className="rate-badge">≥$2,200/hr</span>
          </div>
        </div>
      </div>

      {/* Main Tab Navigation & Controls */}
      <div className="cpte-tabs-row">
        <div className="tab-buttons">
          <button
            className={`tab-btn ${activeTab === 'matrix' ? 'active' : ''}`}
            onClick={() => setActiveTab('matrix')}
          >
            <BarChart2 size={16} />
            <span>CPT Profitability &amp; OR-Hour Yield Matrix</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'cost_breakdown' ? 'active' : ''}`}
            onClick={() => setActiveTab('cost_breakdown')}
          >
            <PieChart size={16} />
            <span>Activity-Based Cost Breakdown</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'breakeven_radar' ? 'active' : ''}`}
            onClick={() => setActiveTab('breakeven_radar')}
          >
            <ShieldAlert size={16} />
            <span>Breakeven &amp; Opportunity Cost Radar</span>
          </button>
        </div>

        <div className="quick-actions">
          <button
            className="action-btn secondary"
            onClick={() => showToast('Activity-based costing matrix reconciled with latest invoice ledger.')}
          >
            <RefreshCw size={14} />
            <span>Reconcile Economic Ledger</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="cpte-filters-bar">
        <div className="search-box">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search CPT code, procedure name, or economic lever..."
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
            {specialties.map(s => (
              <option key={s} value={s}>{s === 'ALL' ? 'All Specialties' : s}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label><Sliders size={14} /> Economic Quadrant:</label>
          <select
            value={selectedQuadrant}
            onChange={(e) => setSelectedQuadrant(e.target.value)}
          >
            <option value="ALL">All Quadrants</option>
            {Object.values(ECONOMIC_QUADRANTS).map(q => (
              <option key={q.key} value={q.key}>{q.label}</option>
            ))}
          </select>
        </div>

        <div className="results-count">
          Showing <strong>{filteredCpts.length}</strong> of {cptList.length} procedures
        </div>
      </div>

      {/* TAB 1: CPT Profitability & OR-Hour Yield Matrix */}
      {activeTab === 'matrix' && (
        <div className="cpte-table-card">
          <div className="cpte-table-header">
            <div>
              <h3>Procedural Micro-Economics &amp; Suite Productivity Matrix</h3>
              <p>Reconciling gross collections, direct variable costs, contribution margin %, margin per suite-hour, and fully loaded net operating income</p>
            </div>
          </div>

          <div className="cpte-table-responsive">
            <table className="cpte-table">
              <thead>
                <tr>
                  <th>CPT Code &amp; Procedure</th>
                  <th>Specialty</th>
                  <th>Annual Cases</th>
                  <th>Operative Time</th>
                  <th>Net Revenue / Case</th>
                  <th>Direct Cost / Case</th>
                  <th>Contribution Margin</th>
                  <th>Margin %</th>
                  <th>Margin / OR-Hour</th>
                  <th>Net Income / Case</th>
                  <th>Economic Quadrant</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredCpts.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="empty-row">
                      <AlertCircle size={20} />
                      <span>No procedural records match the selected filter criteria.</span>
                    </td>
                  </tr>
                ) : (
                  filteredCpts.map(cpt => {
                    const quadConfig = ECONOMIC_QUADRANTS[cpt.economicQuadrant] || ECONOMIC_QUADRANTS.VOLUME_PROFIT_BUILDER;
                    const isYieldHigh = cpt.marginPerOrHour >= ECONOMIC_BENCHMARKS.TARGET_MARGIN_PER_OR_HOUR;

                    return (
                      <tr key={cpt.id} className={cpt.economicQuadrant === 'ECONOMIC_DEFICIT' ? 'highlight-alert' : ''}>
                        <td>
                          <div className="cpt-identity">
                            <span className="cpt-title">{cpt.procedureName}</span>
                            <div className="identity-tags">
                              <span className="code-badge">{cpt.cptCode}</span>
                              <span className="realization-tag">{cpt.collectionRealizationPct}% Realization</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="specialty-pill">{cpt.specialty}</span>
                        </td>
                        <td>
                          <strong>{cpt.annualCaseVolume}</strong> <span className="sub-metric">cases</span>
                        </td>
                        <td>
                          <strong>{cpt.avgOperativeMinutes}m</strong>
                        </td>
                        <td>{formatCurrency(cpt.avgNetCollections)}</td>
                        <td>{formatCurrency(cpt.totalDirectCostPerCase)}</td>
                        <td>
                          <strong>{formatCurrency(cpt.contributionMarginPerCase)}</strong>
                        </td>
                        <td>
                          <span className={cpt.contributionMarginPct >= ECONOMIC_BENCHMARKS.MIN_CONTRIBUTION_MARGIN_PCT ? 'text-good' : 'text-warn'}>
                            <strong>{cpt.contributionMarginPct}%</strong>
                          </span>
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
                                  width: `${Math.min(100, (cpt.marginPerOrHour / 2800) * 100)}%`,
                                  backgroundColor: isYieldHigh ? 'var(--color-emerald, #059669)' : 'var(--color-amber, #d97706)'
                                }}
                              />
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={cpt.netMarginPerCase >= 0 ? 'text-good' : 'text-alert'}>
                            <strong>{formatCurrency(cpt.netMarginPerCase)}</strong>
                            <div className="sub-metric">{cpt.netMarginPct}% Net</div>
                          </span>
                        </td>
                        <td>
                          <span
                            className="status-badge"
                            style={{
                              color: quadConfig.color,
                              backgroundColor: quadConfig.badgeBg,
                              borderColor: quadConfig.badgeBorder
                            }}
                          >
                            {quadConfig.label}
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

      {/* TAB 2: Activity-Based Cost Breakdown */}
      {activeTab === 'cost_breakdown' && (
        <div className="cpte-grid">
          <div className="cpte-dashboard-card full-width">
            <div className="cpte-card-header">
              <h3 className="cpte-card-title">
                <PieChart size={18} />
                Activity-Based Cost Component Breakdown
              </h3>
              <span className="cpte-card-sub">Decomposing procedural costs across Implants, Sterile Supplies, Time-Driven Labor, Anesthesia/Drugs, and Allocated Overhead</span>
            </div>

            <div className="cost-breakdown-container">
              {filteredCpts.map(cpt => (
                <div key={cpt.id} className="cost-card">
                  <div className="cost-card-header">
                    <div>
                      <span className="c-cpt-title">{cpt.procedureName} ({cpt.cptCode})</span>
                      <div className="c-tags">
                        <span className="stat-item">Net Collections: <strong>{formatCurrency(cpt.avgNetCollections)}</strong></span>
                        <span className="stat-item">Direct Costs: <strong>{formatCurrency(cpt.totalDirectCostPerCase)}</strong></span>
                        <span className="stat-item">Allocated Overhead: <strong>{formatCurrency(cpt.allocatedOverheadPerCase)}</strong></span>
                        <span className="stat-item">Total Loaded Cost: <strong>{formatCurrency(cpt.totalLoadedCostPerCase)}</strong></span>
                      </div>
                    </div>
                    <button
                      className="drilldown-btn"
                      onClick={() => setSelectedCpt(cpt)}
                    >
                      Cost Audit
                    </button>
                  </div>

                  {/* Visual Cost Allocation Bar */}
                  <div className="stacked-cost-bar">
                    {cpt.costComponents && cpt.costComponents.map((comp, idx) => (
                      <div
                        key={idx}
                        className="cost-bar-segment"
                        style={{
                          width: `${comp.pctOfTotal}%`,
                          backgroundColor:
                            comp.category.includes('Implant') ? '#dc2626' :
                            comp.category.includes('Sterile') ? '#0284c7' :
                            comp.category.includes('Labor') ? '#d97706' :
                            comp.category.includes('Overhead') ? '#64748b' : '#059669'
                        }}
                        title={`${comp.category}: ${formatCurrency(comp.amount)} (${comp.pctOfTotal}%)`}
                      />
                    ))}
                  </div>

                  {/* Component Table */}
                  <div className="cost-table-box">
                    <table className="cpte-table small">
                      <thead>
                        <tr>
                          <th>Cost Category</th>
                          <th>Cost / Case</th>
                          <th>% of Total Cost</th>
                          <th>Variable / Fixed</th>
                          <th>Vendor / Cost Pool</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cpt.costComponents && cpt.costComponents.map((comp, idx) => (
                          <tr key={idx}>
                            <td><strong>{comp.category}</strong></td>
                            <td>{formatCurrency(comp.amount)}</td>
                            <td>{comp.pctOfTotal}%</td>
                            <td>
                              <span className={`status-pill ${comp.isVariable ? 'pill-good' : 'pill-warn'}`}>
                                {comp.isVariable ? 'Variable' : 'Fixed Overhead'}
                              </span>
                            </td>
                            <td>{comp.vendor}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="c-footer">
                    <Sparkles size={14} className="sparkle-icon" />
                    <span><strong>Optimization Signal:</strong> {cpt.primaryEconomicLever}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Breakeven & OR Opportunity Cost Radar */}
      {activeTab === 'breakeven_radar' && (
        <div className="cpte-grid">
          <div className="cpte-dashboard-card full-width">
            <div className="cpte-card-header">
              <h3 className="cpte-card-title">
                <ShieldAlert size={18} />
                Breakeven Fixed Overhead Absorption &amp; Suite Opportunity Cost
              </h3>
              <span className="cpte-card-sub">Assessing required annual procedural volume to absorb fixed overhead, alongside suite block opportunity cost deficits</span>
            </div>

            <div className="cost-breakdown-container">
              {filteredCpts.map(cpt => {
                const isBreakevenMet = cpt.annualCaseVolume >= cpt.breakevenAnnualCases;
                const hasOpportunityDeficit = cpt.opportunityCostPerCase > 0;

                return (
                  <div key={cpt.id} className="cost-card">
                    <div className="cost-card-header">
                      <div>
                        <span className="c-cpt-title">{cpt.procedureName} ({cpt.cptCode})</span>
                        <div className="c-tags">
                          <span className="stat-item">Specialty: <strong>{cpt.specialty}</strong></span>
                          <span className="stat-item">Operative Time: <strong>{cpt.avgOperativeMinutes}m</strong></span>
                          <span className="stat-item">Margin / OR-Hour: <strong className="text-good">{formatCurrency(cpt.marginPerOrHour)}</strong></span>
                        </div>
                      </div>
                      <span className={`status-pill ${isBreakevenMet ? 'pill-good' : 'pill-alert'}`}>
                        {isBreakevenMet ? 'Overhead Absorbed' : 'Below Breakeven'}
                      </span>
                    </div>

                    <div className="breakeven-grid">
                      <div className="bg-item">
                        <span className="bg-label">Annual Actual Volume</span>
                        <span className="bg-val">{cpt.annualCaseVolume} cases</span>
                        <span className="bg-sub">Evaluated encounters</span>
                      </div>
                      <div className="bg-item">
                        <span className="bg-label">Breakeven Volume</span>
                        <span className="bg-val">{cpt.breakevenAnnualCases} cases</span>
                        <span className="bg-sub">To absorb fixed overhead</span>
                      </div>
                      <div className="bg-item">
                        <span className="bg-label">Contribution / Case</span>
                        <span className="bg-val text-good">{formatCurrency(cpt.contributionMarginPerCase)}</span>
                        <span className="bg-sub">{cpt.contributionMarginPct}% Margin</span>
                      </div>
                      <div className="bg-item">
                        <span className="bg-label">Block Opportunity Cost / Case</span>
                        <span className={`bg-val ${hasOpportunityDeficit ? 'text-warn' : 'text-good'}`}>
                          {formatCurrency(cpt.opportunityCostPerCase)}
                        </span>
                        <span className="bg-sub">{hasOpportunityDeficit ? 'Vs $2,000/hr facility benchmark' : 'Exceeds Benchmark'}</span>
                      </div>
                    </div>

                    <div className="c-footer">
                      <Sparkles size={14} className="sparkle-icon" />
                      <span><strong>Strategic Playbook:</strong> {cpt.primaryEconomicLever}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Pinned CPT Economic Drilldown Modal */}
      {selectedCpt && (
        <div className="cpte-modal-backdrop" onClick={() => setSelectedCpt(null)}>
          <div className="cpte-modal-container" onClick={(e) => e.stopPropagation()}>
            {/* Pinned Header */}
            <div className="cpte-modal-header">
              <div className="modal-title-group">
                <span className="modal-eyebrow">Procedural Micro-Economics Dossier</span>
                <h2>{selectedCpt.procedureName} (CPT {selectedCpt.cptCode})</h2>
                <div className="modal-badges">
                  <span className="specialty-pill">{selectedCpt.specialty}</span>
                  <span
                    className="status-badge"
                    style={{
                      color: ECONOMIC_QUADRANTS[selectedCpt.economicQuadrant]?.color,
                      backgroundColor: ECONOMIC_QUADRANTS[selectedCpt.economicQuadrant]?.badgeBg,
                      borderColor: ECONOMIC_QUADRANTS[selectedCpt.economicQuadrant]?.badgeBorder
                    }}
                  >
                    {ECONOMIC_QUADRANTS[selectedCpt.economicQuadrant]?.label}
                  </span>
                  <span className="rate-badge">Net Realization: {selectedCpt.collectionRealizationPct}%</span>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setSelectedCpt(null)}>
                <X size={20} />
              </button>
            </div>

            {/* Scrollable Modal Body */}
            <div className="cpte-modal-body">
              {/* Financial Waterfall Summary */}
              <div className="modal-section">
                <h3>Procedural Financial Waterfall</h3>
                <div className="waterfall-grid">
                  <div className="waterfall-item">
                    <span className="wf-label">Avg Billed Charges</span>
                    <span className="wf-val">{formatCurrency(selectedCpt.avgBilledCharges)}</span>
                    <span className="wf-sub">Gross chargemaster rate</span>
                  </div>
                  <div className="waterfall-item highlighted">
                    <span className="wf-label">Net Collections Realized</span>
                    <span className="wf-val text-good">{formatCurrency(selectedCpt.avgNetCollections)}</span>
                    <span className="wf-sub">{selectedCpt.collectionRealizationPct}% Realization</span>
                  </div>
                  <div className="waterfall-item">
                    <span className="wf-label">Total Direct Costs</span>
                    <span className="wf-val text-warn">{formatCurrency(selectedCpt.totalDirectCostPerCase)}</span>
                    <span className="wf-sub">Variable operational spend</span>
                  </div>
                  <div className="waterfall-item highlighted">
                    <span className="wf-label">Contribution Margin</span>
                    <span className="wf-val text-good">{formatCurrency(selectedCpt.contributionMarginPerCase)}</span>
                    <span className="wf-sub">{selectedCpt.contributionMarginPct}% Contribution</span>
                  </div>
                </div>
              </div>

              {/* Direct Cost Decomposition Triad */}
              <div className="modal-section">
                <h3>Activity-Based Direct Cost Decomposition</h3>
                <div className="metrics-triad">
                  <div className="triad-card">
                    <span className="triad-label">Implant &amp; Prosthetic Hardware</span>
                    <span className="triad-val">{formatCurrency(selectedCpt.implantCostPerCase)}</span>
                    <span className="triad-sub">{selectedCpt.implantCostPerCase > 0 ? 'Vendor invoice acquisition' : 'No implants required'}</span>
                  </div>
                  <div className="triad-card">
                    <span className="triad-label">Sterile Supplies &amp; Processing</span>
                    <span className="triad-val">{formatCurrency(selectedCpt.sterileSupplyCostPerCase)}</span>
                    <span className="triad-sub">Drapes, tubing, and surgical packs</span>
                  </div>
                  <div className="triad-card">
                    <span className="triad-label">Time-Driven Staff Labor</span>
                    <span className="triad-val">{formatCurrency(selectedCpt.laborCostPerCase)}</span>
                    <span className="triad-sub">{selectedCpt.avgOperativeMinutes}m room minutes</span>
                  </div>
                </div>
              </div>

              {/* Overhead & Suite Velocity Metrics */}
              <div className="modal-section">
                <h3>Overhead Absorption &amp; Suite Velocity</h3>
                <div className="metrics-triad">
                  <div className="triad-card">
                    <span className="triad-label">Allocated Facility Overhead</span>
                    <span className="triad-val">{formatCurrency(selectedCpt.allocatedOverheadPerCase)}</span>
                    <span className="triad-sub">Fixed suite absorption ($450/hr)</span>
                  </div>
                  <div className="triad-card">
                    <span className="triad-label">Fully Loaded Net Income</span>
                    <span className={`triad-val ${selectedCpt.netMarginPerCase >= 0 ? 'text-good' : 'text-alert'}`}>
                      {formatCurrency(selectedCpt.netMarginPerCase)}
                    </span>
                    <span className="triad-sub">{selectedCpt.netMarginPct}% Net Operating Margin</span>
                  </div>
                  <div className="triad-card">
                    <span className="triad-label">Margin / OR-Hour Yield</span>
                    <span className="triad-val text-good">{formatCurrency(selectedCpt.marginPerOrHour)}</span>
                    <span className="triad-sub">{formatCurrency(selectedCpt.marginPerOrMinute)} / minute</span>
                  </div>
                </div>
              </div>

              {/* Payer Yield Matrix for this CPT */}
              {selectedCpt.payerYields && selectedCpt.payerYields.length > 0 && (
                <div className="modal-section">
                  <h3>Payer Reimbursement &amp; Margin Distribution</h3>
                  <div className="exhibit-table-box">
                    <table className="cpte-table small">
                      <thead>
                        <tr>
                          <th>Payer Name</th>
                          <th>Cases</th>
                          <th>Allowed Amount</th>
                          <th>Net Collections</th>
                          <th>Contribution Margin</th>
                          <th>Margin / OR-Hour</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedCpt.payerYields.map(p => (
                          <tr key={p.payerCode}>
                            <td><strong>{p.payerName}</strong></td>
                            <td>{p.casesCount}</td>
                            <td>{formatCurrency(p.avgAllowedAmount)}</td>
                            <td>{formatCurrency(p.avgNetCollections)}</td>
                            <td>
                              <span className={p.contributionMarginPerCase >= 0 ? 'text-good' : 'text-alert'}>
                                <strong>{formatCurrency(p.contributionMarginPerCase)}</strong>
                              </span>
                            </td>
                            <td>
                              <span className={p.marginPerOrHour >= 0 ? 'text-good' : 'text-alert'}>
                                <strong>{formatCurrency(p.marginPerOrHour)}</strong>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Strategic Economics Playbook */}
              <div className="modal-section">
                <h3>Strategic Economics Optimization Playbook</h3>
                <div className="strategy-box">
                  <Sparkles size={18} className="strategy-icon" />
                  <div>
                    <strong>Actionable Financial Playbook:</strong>
                    <p>{selectedCpt.primaryEconomicLever}</p>
                    <ul className="strategy-points">
                      <li>Annual case volume: <strong>{selectedCpt.annualCaseVolume} cases</strong> vs breakeven volume: <strong>{selectedCpt.breakevenAnnualCases} cases</strong> ({selectedCpt.annualCaseVolume >= selectedCpt.breakevenAnnualCases ? 'Fixed overhead fully absorbed' : 'Below breakeven absorption threshold'}).</li>
                      <li>Suite opportunity cost: <strong>{formatCurrency(selectedCpt.opportunityCostPerCase)} / case</strong> relative to the facility target benchmark of $2,000/OR-hour.</li>
                      <li>Total loaded cost: <strong>{formatCurrency(selectedCpt.totalLoadedCostPerCase)}</strong> yielding <strong>{formatCurrency(selectedCpt.netMarginPerCase)}</strong> in net operating profit per case.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Pinned Footer */}
            <div className="cpte-modal-footer">
              <button
                className="modal-action-btn secondary"
                onClick={() => {
                  showToast(`Economic dossier for CPT ${selectedCpt.cptCode} exported to PDF/Excel.`);
                  setSelectedCpt(null);
                }}
              >
                <FileText size={16} />
                <span>Export Economic Dossier</span>
              </button>
              <button
                className="modal-action-btn primary"
                onClick={() => {
                  showToast(`CPT ${selectedCpt.cptCode} flagged for cost containment review.`);
                  setSelectedCpt(null);
                }}
              >
                <FileCheck size={16} />
                <span>Flag for Cost Review</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
