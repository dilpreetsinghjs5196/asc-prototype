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
  PAYMENT_PERFORMANCE_TIERS,
  DENIAL_BENCHMARKS,
  SEED_CPT_DENIAL_PAYMENT,
  calculateFacilityDenialPaymentKpis
} from '../services/cptDenialPaymentService';
import './CptDenialPaymentView.css';

export default function CptDenialPaymentView() {
  const [activeTab, setActiveTab] = useState('matrix'); // 'matrix', 'carc_radar', 'payer_variation'
  const [cptList, setCptList] = useState(SEED_CPT_DENIAL_PAYMENT);
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
    return calculateFacilityDenialPaymentKpis(cptList);
  }, [cptList]);

  // Unique specialties for filter
  const specialties = useMemo(() => {
    const set = new Set(cptList.map(c => c.specialty));
    return ['ALL', ...Array.from(set)];
  }, [cptList]);

  // Filtered CPT list for Tab 1
  const filteredCpts = useMemo(() => {
    return cptList.filter(item => {
      const matchSpecialty = selectedSpecialty === 'ALL' || item.specialty === selectedSpecialty;
      const matchTier = selectedTier === 'ALL' || item.performanceTier === selectedTier;
      const query = searchQuery.toLowerCase().trim();
      const matchSearch =
        !query ||
        item.cptCode.toLowerCase().includes(query) ||
        item.procedureName.toLowerCase().includes(query) ||
        item.specialty.toLowerCase().includes(query) ||
        (item.primaryCarcCode && item.primaryCarcCode.toLowerCase().includes(query));
      return matchSpecialty && matchTier && matchSearch;
    });
  }, [cptList, selectedSpecialty, selectedTier, searchQuery]);

  // Flattened CARC breakdown list for Tab 2
  const allCarcRecords = useMemo(() => {
    const list = [];
    cptList.forEach(cpt => {
      if (cpt.carcBreakdown) {
        cpt.carcBreakdown.forEach(carc => {
          list.push({
            ...carc,
            cptCode: cpt.cptCode,
            procedureName: cpt.procedureName,
            specialty: cpt.specialty,
            performanceTier: cpt.performanceTier
          });
        });
      }
    });
    return list;
  }, [cptList]);

  // Flattened Payer Variation records for Tab 3
  const allPayerVariations = useMemo(() => {
    const list = [];
    cptList.forEach(cpt => {
      if (cpt.payerVariation) {
        cpt.payerVariation.forEach(pv => {
          list.push({
            ...pv,
            cptCode: cpt.cptCode,
            procedureName: cpt.procedureName,
            specialty: cpt.specialty,
            overallDaysToPay: cpt.avgDaysToPay,
            overallDenialRate: cpt.firstPassDenialRate
          });
        });
      }
    });
    return list;
  }, [cptList]);

  const handleDeployScrubber = (ruleName, cptCode) => {
    showToast(`Pre-bill scrubber rule "${ruleName}" successfully queued for CPT ${cptCode}`);
  };

  const handleExportAppeal = (cptCode) => {
    showToast(`Batch appeal dossier & documentation packet exported for CPT ${cptCode}`);
  };

  return (
    <div className="cptdp-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="cptdp-toast">
          <CheckCircle2 size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 5-Card Top Executive Metric Ribbon */}
      <div className="cptdp-ribbon">
        {/* Card 1: Total Billed Claims & Clean Claim Rate */}
        <div className="cptdp-card">
          <div className="cptdp-card-header">
            <span className="cptdp-card-title">TOTAL BILLED CLAIMS</span>
            <div className="cptdp-card-icon cptdp-icon-blue">
              <FileCheck size={18} />
            </div>
          </div>
          <div className="cptdp-card-value">
            {facilityKpis.totalBilledClaims.toLocaleString()}
          </div>
          <div className="cptdp-card-footer">
            <span className="cptdp-badge cptdp-badge-emerald">
              {facilityKpis.cleanClaimRate}% Clean Rate
            </span>
            <span className="cptdp-card-subtext">
              Target: ≥ {DENIAL_BENCHMARKS.TARGET_CLEAN_CLAIM_RATE}%
            </span>
          </div>
        </div>

        {/* Card 2: First-Pass Denial Rate */}
        <div className="cptdp-card">
          <div className="cptdp-card-header">
            <span className="cptdp-card-title">FIRST-PASS DENIAL RATE</span>
            <div className="cptdp-card-icon cptdp-icon-amber">
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className="cptdp-card-value">
            {facilityKpis.firstPassDenialRate}%
          </div>
          <div className="cptdp-card-footer">
            <span
              className={`cptdp-badge ${
                facilityKpis.firstPassDenialRate <= DENIAL_BENCHMARKS.MAX_ACCEPTABLE_DENIAL_RATE
                  ? 'cptdp-badge-emerald'
                  : 'cptdp-badge-crimson'
              }`}
            >
              {facilityKpis.firstPassDeniedClaims} Denied Claims
            </span>
            <span className="cptdp-card-subtext">
              Max Target: ≤ {DENIAL_BENCHMARKS.MAX_ACCEPTABLE_DENIAL_RATE}%
            </span>
          </div>
        </div>

        {/* Card 3: Adjudication Velocity (Days to Pay) */}
        <div className="cptdp-card">
          <div className="cptdp-card-header">
            <span className="cptdp-card-title">ADJUDICATION VELOCITY</span>
            <div className="cptdp-card-icon cptdp-icon-sky">
              <Clock size={18} />
            </div>
          </div>
          <div className="cptdp-card-value">
            {facilityKpis.avgDaysToPay}{' '}
            <span className="cptdp-card-unit">days</span>
          </div>
          <div className="cptdp-card-footer">
            <span
              className={`cptdp-badge ${
                facilityKpis.avgDaysToPay <= DENIAL_BENCHMARKS.MAX_ACCEPTABLE_DAYS_TO_PAY
                  ? 'cptdp-badge-emerald'
                  : 'cptdp-badge-amber'
              }`}
            >
              {facilityKpis.avgDaysToPay <= DENIAL_BENCHMARKS.MAX_ACCEPTABLE_DAYS_TO_PAY
                ? 'Within Benchmark'
                : 'Turnaround Lag'}
            </span>
            <span className="cptdp-card-subtext">Benchmark: ≤ 30.0d</span>
          </div>
        </div>

        {/* Card 4: Contractual Underpayment Variance */}
        <div className="cptdp-card">
          <div className="cptdp-card-header">
            <span className="cptdp-card-title">UNDERPAYMENT LEAKAGE</span>
            <div className="cptdp-card-icon cptdp-icon-crimson">
              <DollarSign size={18} />
            </div>
          </div>
          <div className="cptdp-card-value">
            ${facilityKpis.totalUnderpaymentVariance.toLocaleString()}
          </div>
          <div className="cptdp-card-footer">
            <span className="cptdp-badge cptdp-badge-crimson">
              Fee Schedule Delta
            </span>
            <span className="cptdp-card-subtext">
              ${facilityKpis.totalOverturnedDollars.toLocaleString()} Appealed Recovered
            </span>
          </div>
        </div>

        {/* Card 5: Chronic Denial Sink Procedures */}
        <div className="cptdp-card">
          <div className="cptdp-card-header">
            <span className="cptdp-card-title">CHRONIC SINK CODES</span>
            <div className="cptdp-card-icon cptdp-icon-rose">
              <ShieldAlert size={18} />
            </div>
          </div>
          <div className="cptdp-card-value">
            {facilityKpis.chronicSinkCount}{' '}
            <span className="cptdp-card-unit">CPTs</span>
          </div>
          <div className="cptdp-card-footer">
            <span
              className={`cptdp-badge ${
                facilityKpis.chronicSinkCount > 0
                  ? 'cptdp-badge-crimson'
                  : 'cptdp-badge-emerald'
              }`}
            >
              {facilityKpis.frictionAtRiskCount} At-Risk
            </span>
            <span className="cptdp-card-subtext">
              {facilityKpis.overturnRatePct}% Overall Overturn
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="cptdp-tabs-nav">
        <button
          className={`cptdp-tab-btn ${activeTab === 'matrix' ? 'active' : ''}`}
          onClick={() => setActiveTab('matrix')}
        >
          <BarChart2 size={16} />
          <span>CPT Denial & Payment Velocity Matrix</span>
        </button>
        <button
          className={`cptdp-tab-btn ${activeTab === 'carc_radar' ? 'active' : ''}`}
          onClick={() => setActiveTab('carc_radar')}
        >
          <ShieldCheck size={16} />
          <span>CARC Root-Cause & Scrubbing Radar</span>
        </button>
        <button
          className={`cptdp-tab-btn ${activeTab === 'payer_variation' ? 'active' : ''}`}
          onClick={() => setActiveTab('payer_variation')}
        >
          <Activity size={16} />
          <span>Payer Adjudication Variation & Overturn Audit</span>
        </button>
      </div>

      {/* TAB 1: CPT Denial & Payment Velocity Matrix */}
      {activeTab === 'matrix' && (
        <div className="cptdp-tab-content">
          {/* Controls Bar */}
          <div className="cptdp-controls-bar">
            <div className="cptdp-search-box">
              <Search size={16} className="cptdp-search-icon" />
              <input
                type="text"
                placeholder="Search CPT code, procedure name, specialty, or CARC..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="cptdp-search-input"
              />
              {searchQuery && (
                <button
                  className="cptdp-search-clear"
                  onClick={() => setSearchQuery('')}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="cptdp-filters-group">
              <div className="cptdp-filter-item">
                <span className="cptdp-filter-label">Specialty:</span>
                <select
                  value={selectedSpecialty}
                  onChange={e => setSelectedSpecialty(e.target.value)}
                  className="cptdp-select"
                >
                  {specialties.map(spec => (
                    <option key={spec} value={spec}>
                      {spec === 'ALL' ? 'All Specialties' : spec}
                    </option>
                  ))}
                </select>
              </div>

              <div className="cptdp-filter-item">
                <span className="cptdp-filter-label">Flow Tier:</span>
                <select
                  value={selectedTier}
                  onChange={e => setSelectedTier(e.target.value)}
                  className="cptdp-select"
                >
                  <option value="ALL">All Performance Tiers</option>
                  {Object.values(PAYMENT_PERFORMANCE_TIERS).map(tier => (
                    <option key={tier.key} value={tier.key}>
                      {tier.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                className="cptdp-refresh-btn"
                onClick={() => {
                  setCptList([...SEED_CPT_DENIAL_PAYMENT]);
                  showToast('CPT denial and payment benchmarks refreshed');
                }}
              >
                <RefreshCw size={14} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Procedural Table */}
          <div className="cptdp-table-card">
            <div className="cptdp-table-wrapper">
              <table className="cptdp-table">
                <thead>
                  <tr>
                    <th>CPT Code & Description</th>
                    <th>Specialty</th>
                    <th>Total Claims</th>
                    <th>Clean Claim %</th>
                    <th>Denial Rate %</th>
                    <th>Days to Pay</th>
                    <th>Underpayment $</th>
                    <th>PVI Score</th>
                    <th>Flow Tier</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCpts.length === 0 ? (
                    <tr>
                      <td colSpan="10" className="cptdp-empty-state">
                        <AlertCircle size={28} className="cptdp-empty-icon" />
                        <div>No procedure matching the current filters</div>
                      </td>
                    </tr>
                  ) : (
                    filteredCpts.map(cpt => {
                      const tier =
                        PAYMENT_PERFORMANCE_TIERS[cpt.performanceTier] ||
                        PAYMENT_PERFORMANCE_TIERS.ACCEPTABLE_FLOW;
                      return (
                        <tr
                          key={cpt.cptCode}
                          onClick={() => setSelectedCpt(cpt)}
                          className="cptdp-clickable-row"
                        >
                          <td>
                            <div className="cptdp-code-cell">
                              <span className="cptdp-code-badge">
                                {cpt.cptCode}
                              </span>
                              <div className="cptdp-code-name">
                                {cpt.procedureName}
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="cptdp-specialty-tag">
                              {cpt.specialty}
                            </span>
                          </td>
                          <td className="cptdp-num-cell">
                            {cpt.totalBilledClaims}
                          </td>
                          <td className="cptdp-num-cell">
                            <span
                              className={`cptdp-metric-cell ${
                                cpt.cleanClaimRate >= 95
                                  ? 'cptdp-text-emerald'
                                  : cpt.cleanClaimRate >= 88
                                  ? 'cptdp-text-blue'
                                  : 'cptdp-text-amber'
                              }`}
                            >
                              {cpt.cleanClaimRate}%
                            </span>
                          </td>
                          <td className="cptdp-num-cell">
                            <span
                              className={`cptdp-metric-cell ${
                                cpt.firstPassDenialRate <= 4
                                  ? 'cptdp-text-emerald'
                                  : cpt.firstPassDenialRate <= 8
                                  ? 'cptdp-text-blue'
                                  : cpt.firstPassDenialRate <= 14
                                  ? 'cptdp-text-amber'
                                  : 'cptdp-text-crimson'
                              }`}
                            >
                              {cpt.firstPassDenialRate}%
                            </span>
                          </td>
                          <td className="cptdp-num-cell">
                            <span
                              className={`cptdp-metric-cell ${
                                cpt.avgDaysToPay <= 21
                                  ? 'cptdp-text-emerald'
                                  : cpt.avgDaysToPay <= 30
                                  ? 'cptdp-text-blue'
                                  : 'cptdp-text-amber'
                              }`}
                            >
                              {cpt.avgDaysToPay}d
                            </span>
                          </td>
                          <td className="cptdp-num-cell">
                            <span
                              className={
                                cpt.underpaymentVarianceDollars > 20000
                                  ? 'cptdp-text-crimson'
                                  : cpt.underpaymentVarianceDollars > 5000
                                  ? 'cptdp-text-amber'
                                  : 'cptdp-text-emerald'
                              }
                            >
                              ${cpt.underpaymentVarianceDollars.toLocaleString()}
                            </span>
                          </td>
                          <td className="cptdp-num-cell">
                            <div className="cptdp-pvi-badge">
                              {cpt.paymentVelocityIndex}
                            </div>
                          </td>
                          <td>
                            <span
                              className="cptdp-tier-badge"
                              style={{
                                color: tier.color,
                                backgroundColor: tier.badgeBg,
                                borderColor: tier.badgeBorder
                              }}
                            >
                              {tier.label}
                            </span>
                          </td>
                          <td>
                            <button
                              className="cptdp-dossier-btn"
                              onClick={e => {
                                e.stopPropagation();
                                setSelectedCpt(cpt);
                              }}
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
        </div>
      )}

      {/* TAB 2: CARC Root-Cause & Scrubbing Radar */}
      {activeTab === 'carc_radar' && (
        <div className="cptdp-tab-content">
          <div className="cptdp-tab-header-box">
            <div className="cptdp-tab-header-title">
              <ShieldCheck size={20} className="cptdp-icon-blue" />
              <span>Claim Adjustment Reason Code (CARC) Denial Root Causes & Scrubber Solutions</span>
            </div>
            <div className="cptdp-tab-header-desc">
              Cross-procedure analysis of recurring claim rejections, preventable billing errors, and automated scrubber rules to eliminate pre-submission rejections.
            </div>
          </div>

          <div className="cptdp-table-card">
            <div className="cptdp-table-wrapper">
              <table className="cptdp-table">
                <thead>
                  <tr>
                    <th>CARC Code & Category</th>
                    <th>CPT Procedure</th>
                    <th>Root-Cause Clinical Description</th>
                    <th>Occurrences</th>
                    <th>Denied Amount</th>
                    <th>Scrubber Preventable</th>
                    <th>Recommended Pre-Bill Scrubber Rule</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {allCarcRecords.map((carc, idx) => (
                    <tr key={`${carc.cptCode}-${carc.carcCode}-${idx}`}>
                      <td>
                        <div className="cptdp-carc-badge-group">
                          <span className="cptdp-carc-code-tag">
                            {carc.carcCode}
                          </span>
                          <span className="cptdp-carc-cat-tag">
                            {carc.category.replace('_', ' ')}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="cptdp-code-cell">
                          <span className="cptdp-code-badge">
                            {carc.cptCode}
                          </span>
                          <span className="cptdp-code-name">
                            {carc.procedureName}
                          </span>
                        </div>
                      </td>
                      <td className="cptdp-desc-cell">
                        {carc.description}
                      </td>
                      <td className="cptdp-num-cell">
                        {carc.occurrenceCount}
                      </td>
                      <td className="cptdp-num-cell cptdp-text-crimson">
                        ${carc.deniedAmount.toLocaleString()}
                      </td>
                      <td>
                        {carc.preventableByScrubber ? (
                          <span className="cptdp-badge cptdp-badge-emerald">
                            <CheckCircle2 size={12} />
                            <span>Preventable (100%)</span>
                          </span>
                        ) : (
                          <span className="cptdp-badge cptdp-badge-amber">
                            <span>Clinical Review</span>
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="cptdp-scrubber-name">
                          {carc.recommendedScrubberRule}
                        </div>
                      </td>
                      <td>
                        {carc.preventableByScrubber && (
                          <button
                            className="cptdp-deploy-rule-btn"
                            onClick={() =>
                              handleDeployScrubber(
                                carc.recommendedScrubberRule,
                                carc.cptCode
                              )
                            }
                          >
                            <Zap size={13} />
                            <span>Deploy Rule</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Payer Adjudication Variation & Overturn Audit */}
      {activeTab === 'payer_variation' && (
        <div className="cptdp-tab-content">
          <div className="cptdp-tab-header-box">
            <div className="cptdp-tab-header-title">
              <Activity size={20} className="cptdp-icon-sky" />
              <span>Cross-Payer Payment Velocity & Appeal Overturn Audit</span>
            </div>
            <div className="cptdp-tab-header-desc">
              Compare commercial plans vs Medicare Part B across reimbursement lag (days to pay), first-pass denial friction, contractual underpayment leakage, and successful appeal recovery.
            </div>
          </div>

          <div className="cptdp-table-card">
            <div className="cptdp-table-wrapper">
              <table className="cptdp-table">
                <thead>
                  <tr>
                    <th>Payer Name</th>
                    <th>CPT Code</th>
                    <th>Procedure</th>
                    <th>Adjudicated Claims</th>
                    <th>Denial Rate %</th>
                    <th>Days to Pay</th>
                    <th>Underpayment Variance</th>
                    <th>Appeal Overturn %</th>
                    <th>Payer Performance</th>
                  </tr>
                </thead>
                <tbody>
                  {allPayerVariations.map((pv, idx) => {
                    const isFrictionPayer =
                      pv.denialRatePct > 12 || pv.avgDaysToPay > 40;
                    return (
                      <tr key={`${pv.cptCode}-${pv.payerCode}-${idx}`}>
                        <td>
                          <div className="cptdp-payer-name-box">
                            <span className="cptdp-payer-title">
                              {pv.payerName}
                            </span>
                            <span className="cptdp-payer-code">
                              {pv.payerCode}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className="cptdp-code-badge">
                            {pv.cptCode}
                          </span>
                        </td>
                        <td>
                          <span className="cptdp-code-name">
                            {pv.procedureName}
                          </span>
                        </td>
                        <td className="cptdp-num-cell">
                          {pv.claimsCount}
                        </td>
                        <td className="cptdp-num-cell">
                          <span
                            className={
                              pv.denialRatePct <= 4
                                ? 'cptdp-text-emerald'
                                : pv.denialRatePct <= 8
                                ? 'cptdp-text-blue'
                                : 'cptdp-text-crimson'
                            }
                          >
                            {pv.denialRatePct}%
                          </span>
                        </td>
                        <td className="cptdp-num-cell">
                          <span
                            className={
                              pv.avgDaysToPay <= 21
                                ? 'cptdp-text-emerald'
                                : pv.avgDaysToPay <= 30
                                ? 'cptdp-text-blue'
                                : 'cptdp-text-amber'
                            }
                          >
                            {pv.avgDaysToPay}d
                          </span>
                        </td>
                        <td className="cptdp-num-cell">
                          <span
                            className={
                              pv.underpaymentVariance > 10000
                                ? 'cptdp-text-crimson'
                                : 'cptdp-text-emerald'
                            }
                          >
                            ${pv.underpaymentVariance.toLocaleString()}
                          </span>
                        </td>
                        <td className="cptdp-num-cell">
                          <span
                            className={
                              pv.overturnRatePct >= 80
                                ? 'cptdp-text-emerald'
                                : 'cptdp-text-amber'
                            }
                          >
                            {pv.overturnRatePct}%
                          </span>
                        </td>
                        <td>
                          {isFrictionPayer ? (
                            <span className="cptdp-badge cptdp-badge-crimson">
                              High Adjudication Lag
                            </span>
                          ) : pv.denialRatePct <= 4 ? (
                            <span className="cptdp-badge cptdp-badge-emerald">
                              Fast Track Payer
                            </span>
                          ) : (
                            <span className="cptdp-badge cptdp-badge-blue">
                              Standard Flow
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Pinned Procedural Denial & Payment Dossier Modal */}
      {selectedCpt && (
        <div
          className="cptdp-modal-overlay"
          onClick={() => setSelectedCpt(null)}
        >
          <div
            className="cptdp-modal"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="cptdp-modal-header">
              <div className="cptdp-modal-title-group">
                <div className="cptdp-modal-badge-row">
                  <span className="cptdp-code-badge-lg">
                    {selectedCpt.cptCode}
                  </span>
                  <span className="cptdp-specialty-tag">
                    {selectedCpt.specialty}
                  </span>
                  {(() => {
                    const tier =
                      PAYMENT_PERFORMANCE_TIERS[selectedCpt.performanceTier] ||
                      PAYMENT_PERFORMANCE_TIERS.ACCEPTABLE_FLOW;
                    return (
                      <span
                        className="cptdp-tier-badge"
                        style={{
                          color: tier.color,
                          backgroundColor: tier.badgeBg,
                          borderColor: tier.badgeBorder
                        }}
                      >
                        {tier.label}
                      </span>
                    );
                  })()}
                </div>
                <h2 className="cptdp-modal-title">
                  {selectedCpt.procedureName}
                </h2>
              </div>
              <button
                className="cptdp-modal-close"
                onClick={() => setSelectedCpt(null)}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="cptdp-modal-body">
              {/* Executive Metrics Bar */}
              <div className="cptdp-modal-kpi-bar">
                <div className="cptdp-modal-kpi">
                  <span className="cptdp-modal-kpi-label">TOTAL BILLED</span>
                  <span className="cptdp-modal-kpi-value">
                    {selectedCpt.totalBilledClaims} claims
                  </span>
                </div>
                <div className="cptdp-modal-kpi">
                  <span className="cptdp-modal-kpi-label">CLEAN CLAIM RATE</span>
                  <span className="cptdp-modal-kpi-value cptdp-text-emerald">
                    {selectedCpt.cleanClaimRate}%
                  </span>
                </div>
                <div className="cptdp-modal-kpi">
                  <span className="cptdp-modal-kpi-label">DENIAL RATE</span>
                  <span className="cptdp-modal-kpi-value cptdp-text-crimson">
                    {selectedCpt.firstPassDenialRate}%
                  </span>
                </div>
                <div className="cptdp-modal-kpi">
                  <span className="cptdp-modal-kpi-label">DAYS TO PAY</span>
                  <span className="cptdp-modal-kpi-value cptdp-text-sky">
                    {selectedCpt.avgDaysToPay} days
                  </span>
                </div>
                <div className="cptdp-modal-kpi">
                  <span className="cptdp-modal-kpi-label">OVERTURN RATE</span>
                  <span className="cptdp-modal-kpi-value cptdp-text-emerald">
                    {selectedCpt.overturnRatePct}%
                  </span>
                </div>
                <div className="cptdp-modal-kpi">
                  <span className="cptdp-modal-kpi-label">UNDERPAYMENT</span>
                  <span className="cptdp-modal-kpi-value cptdp-text-crimson">
                    ${selectedCpt.underpaymentVarianceDollars.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Primary CARC Root-Cause Highlight */}
              <div className="cptdp-modal-card">
                <div className="cptdp-modal-card-title">
                  <AlertTriangle size={18} className="cptdp-icon-amber" />
                  <span>Primary Rejection Driver & CARC Breakdown</span>
                </div>
                <div className="cptdp-primary-carc-banner">
                  <div className="cptdp-carc-tag-bold">
                    {selectedCpt.primaryCarcCode}
                  </div>
                  <div>
                    <div className="cptdp-carc-desc-bold">
                      {selectedCpt.primaryCarcDescription}
                    </div>
                    <div className="cptdp-carc-subtext">
                      Highest frequency rejection code across all evaluated commercial and Medicare claims for this procedure.
                    </div>
                  </div>
                </div>

                {/* Granular CARC Table */}
                {selectedCpt.carcBreakdown && selectedCpt.carcBreakdown.length > 0 && (
                  <div className="cptdp-modal-subtable-box">
                    <table className="cptdp-subtable">
                      <thead>
                        <tr>
                          <th>CARC Code</th>
                          <th>Category</th>
                          <th>Clinical Root Cause</th>
                          <th>Count</th>
                          <th>Denied $</th>
                          <th>Preventable</th>
                          <th>Recommended Pre-Bill Scrubber Rule</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedCpt.carcBreakdown.map((carc, idx) => (
                          <tr key={idx}>
                            <td>
                              <span className="cptdp-carc-code-tag">
                                {carc.carcCode}
                              </span>
                            </td>
                            <td>
                              <span className="cptdp-carc-cat-tag">
                                {carc.category}
                              </span>
                            </td>
                            <td className="cptdp-desc-cell">
                              {carc.description}
                            </td>
                            <td>{carc.occurrenceCount}</td>
                            <td className="cptdp-text-crimson">
                              ${carc.deniedAmount.toLocaleString()}
                            </td>
                            <td>
                              {carc.preventableByScrubber ? (
                                <span className="cptdp-badge cptdp-badge-emerald">
                                  Yes (Scrubber)
                                </span>
                              ) : (
                                <span className="cptdp-badge cptdp-badge-amber">
                                  No (Manual)
                                </span>
                              )}
                            </td>
                            <td>
                              <div className="cptdp-scrubber-name">
                                {carc.recommendedScrubberRule}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Cross-Payer Variation Table */}
              {selectedCpt.payerVariation && selectedCpt.payerVariation.length > 0 && (
                <div className="cptdp-modal-card">
                  <div className="cptdp-modal-card-title">
                    <Activity size={18} className="cptdp-icon-sky" />
                    <span>Payer Adjudication Speed & Underpayment Variation</span>
                  </div>
                  <div className="cptdp-modal-subtable-box">
                    <table className="cptdp-subtable">
                      <thead>
                        <tr>
                          <th>Payer</th>
                          <th>Claims</th>
                          <th>Denial Rate %</th>
                          <th>Days to Pay</th>
                          <th>Underpayment Variance</th>
                          <th>Appeal Overturn %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedCpt.payerVariation.map((pv, idx) => (
                          <tr key={idx}>
                            <td className="cptdp-bold-cell">{pv.payerName}</td>
                            <td>{pv.claimsCount}</td>
                            <td>
                              <span
                                className={
                                  pv.denialRatePct <= 4
                                    ? 'cptdp-text-emerald'
                                    : pv.denialRatePct <= 8
                                    ? 'cptdp-text-blue'
                                    : 'cptdp-text-crimson'
                                }
                              >
                                {pv.denialRatePct}%
                              </span>
                            </td>
                            <td>
                              <span
                                className={
                                  pv.avgDaysToPay <= 21
                                    ? 'cptdp-text-emerald'
                                    : pv.avgDaysToPay <= 30
                                    ? 'cptdp-text-blue'
                                    : 'cptdp-text-amber'
                                }
                              >
                                {pv.avgDaysToPay}d
                              </span>
                            </td>
                            <td className="cptdp-text-crimson">
                              ${pv.underpaymentVariance.toLocaleString()}
                            </td>
                            <td>
                              <span
                                className={
                                  pv.overturnRatePct >= 80
                                    ? 'cptdp-text-emerald'
                                    : 'cptdp-text-amber'
                                }
                              >
                                {pv.overturnRatePct}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="cptdp-modal-footer">
              <button
                className="cptdp-export-btn"
                onClick={() => handleExportAppeal(selectedCpt.cptCode)}
              >
                <FileText size={15} />
                <span>Export Denial & Appeal Dossier</span>
              </button>
              <button
                className="cptdp-close-btn"
                onClick={() => setSelectedCpt(null)}
              >
                Close Dossier
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
