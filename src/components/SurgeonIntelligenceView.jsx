import React, { useState, useMemo } from 'react';
import {
  Users,
  Activity,
  Award,
  AlertTriangle,
  AlertCircle,
  TrendingUp,
  DollarSign,
  Clock,
  Calendar,
  CheckCircle2,
  Search,
  Filter,
  RefreshCw,
  ChevronRight,
  X,
  FileCheck,
  ShieldCheck,
  Sliders,
  Sparkles,
  BarChart2,
  Package,
  Layers,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import {
  PERFORMANCE_TIERS,
  ALERT_TYPES,
  SEED_SURGEON_INTELLIGENCE_PROFILES,
  calculateFacilitySurgeonKpis,
  detectSurgeonAlerts
} from '../services/surgeonIntelligenceService';
import './SurgeonIntelligenceView.css';

export default function SurgeonIntelligenceView() {
  const [activeTab, setActiveTab] = useState('grid'); // 'grid', 'radar', 'alerts'
  const [profiles, setProfiles] = useState(SEED_SURGEON_INTELLIGENCE_PROFILES);
  const [selectedTier, setSelectedTier] = useState('ALL');
  const [selectedSpecialty, setSelectedSpecialty] = useState('ALL');
  const [timeHorizon, setTimeHorizon] = useState('90D'); // '30D', '90D', '180D', '365D', 'YTD'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSurgeon, setSelectedSurgeon] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Derive unique specialties
  const specialties = useMemo(() => {
    const list = profiles.map(p => p.specialty).filter(Boolean);
    return ['ALL', ...Array.from(new Set(list))];
  }, [profiles]);

  // All active alerts across surgeons
  const allAlerts = useMemo(() => {
    const alerts = [];
    profiles.forEach(p => {
      const pAlerts = detectSurgeonAlerts(p);
      alerts.push(...pAlerts);
    });
    return alerts;
  }, [profiles]);

  // Filter profiles
  const filteredProfiles = useMemo(() => {
    return profiles.filter(p => {
      const matchesTier = selectedTier === 'ALL' || p.tier === selectedTier;
      const matchesSpecialty = selectedSpecialty === 'ALL' || p.specialty === selectedSpecialty;
      const matchesSearch =
        searchQuery.trim() === '' ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.specialty.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.npi.includes(searchQuery);

      return matchesTier && matchesSpecialty && matchesSearch;
    });
  }, [profiles, selectedTier, selectedSpecialty, searchQuery]);

  // Aggregate facility KPIs
  const facilityKpis = useMemo(() => {
    return calculateFacilitySurgeonKpis(profiles);
  }, [profiles]);

  const handleResolveAlert = (alertId) => {
    showToast(`Alert ${alertId} marked as Resolved. Intervention noted in audit ledger.`);
  };

  return (
    <div className="si-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="si-toast" role="alert">
          <CheckCircle2 className="si-toast-icon" size={18} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="si-header-banner">
        <div className="si-header-main">
          <div className="si-header-title-row">
            <h1 className="si-title">Surgeon Operational & Financial Intelligence</h1>
            <span className="si-badge-pill si-badge-blue">Module 11 • Phase B0</span>
            <span className="si-badge-pill si-badge-emerald">Live Telemetry Active</span>
          </div>
          <p className="si-subtitle">
            Authoritative multi-dimensional intelligence synthesis combining contribution margins per OR-hour, P80 incision duration variance, on-time starts, block fidelity, and supply waste.
          </p>
        </div>
        <div className="si-header-actions">
          <button
            className="si-btn si-btn-outline"
            onClick={() => showToast('Surgeon Intelligence model synchronized with live EHR and financial ledger.')}
          >
            <RefreshCw size={15} />
            <span>Sync Telemetry</span>
          </button>
        </div>
      </div>

      {/* 5-Card Operational Ribbon */}
      <div className="si-kpi-ribbon">
        <div className="si-kpi-card">
          <div className="si-kpi-header">
            <span className="si-kpi-label">Active Surgeons</span>
            <Users className="si-kpi-icon si-icon-blue" size={18} />
          </div>
          <div className="si-kpi-value">{facilityKpis.totalSurgeons}</div>
          <div className="si-kpi-meta">100% credentialed attendings</div>
        </div>

        <div className="si-kpi-card">
          <div className="si-kpi-header">
            <span className="si-kpi-label">Avg Composite Score</span>
            <Award className="si-kpi-icon si-icon-emerald" size={18} />
          </div>
          <div className="si-kpi-value">{facilityKpis.avgCompositeScore} <span className="si-unit">/ 100</span></div>
          <div className="si-kpi-meta">5-pillar weighted benchmark</div>
        </div>

        <div className="si-kpi-card">
          <div className="si-kpi-header">
            <span className="si-kpi-label">Top Performer Margin</span>
            <TrendingUp className="si-kpi-icon si-icon-blue" size={18} />
          </div>
          <div className="si-kpi-value">${facilityKpis.topPerformerMargin.toLocaleString()} <span className="si-unit">/ OR-hr</span></div>
          <div className="si-kpi-meta">Dr. Marcus Vance (Ortho)</div>
        </div>

        <div className="si-kpi-card">
          <div className="si-kpi-header">
            <span className="si-kpi-label">At-Risk Churn Alerts</span>
            <AlertTriangle className="si-kpi-icon si-icon-crimson" size={18} />
          </div>
          <div className="si-kpi-value si-val-crimson">{facilityKpis.atRiskCount}</div>
          <div className="si-kpi-meta">Volume & block drop &gt; 20%</div>
        </div>

        <div className="si-kpi-card">
          <div className="si-kpi-header">
            <span className="si-kpi-label">FC On-Time Start Rate</span>
            <Clock className="si-kpi-icon si-icon-amber" size={18} />
          </div>
          <div className="si-kpi-value">{facilityKpis.avgOnTimeStartPct}%</div>
          <div className="si-kpi-meta">Facility baseline: 85% target</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="si-filter-card">
        <div className="si-filter-row">
          <div className="si-search-box">
            <Search className="si-search-icon" size={16} />
            <input
              type="text"
              className="si-search-input"
              placeholder="Search surgeon by name, specialty, NPI..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="si-filter-group">
            <span className="si-filter-label">Specialty:</span>
            <select
              className="si-select"
              value={selectedSpecialty}
              onChange={(e) => setSelectedSpecialty(e.target.value)}
            >
              {specialties.map(spec => (
                <option key={spec} value={spec}>{spec === 'ALL' ? 'All Specialties' : spec}</option>
              ))}
            </select>
          </div>

          <div className="si-filter-group">
            <span className="si-filter-label">Performance Tier:</span>
            <select
              className="si-select"
              value={selectedTier}
              onChange={(e) => setSelectedTier(e.target.value)}
            >
              <option value="ALL">All Tiers</option>
              <option value="PINNACLE">Pinnacle (90+)</option>
              <option value="CORE_PERFORMER">Core Performer (75-89)</option>
              <option value="OPPORTUNITY">Opportunity (60-74)</option>
              <option value="AT_RISK">At Risk (&lt;60)</option>
            </select>
          </div>

          <div className="si-filter-group">
            <span className="si-filter-label">Horizon:</span>
            <div className="si-time-pills">
              {['30D', '90D', '180D', '365D', 'YTD'].map(h => (
                <button
                  key={h}
                  className={`si-time-pill ${timeHorizon === h ? 'active' : ''}`}
                  onClick={() => setTimeHorizon(h)}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="si-tabs-nav">
        <button
          className={`si-tab-btn ${activeTab === 'grid' ? 'active' : ''}`}
          onClick={() => setActiveTab('grid')}
        >
          <Users size={16} />
          <span>Surgeon Master Intelligence Grid</span>
          <span className="si-tab-counter">{filteredProfiles.length}</span>
        </button>

        <button
          className={`si-tab-btn ${activeTab === 'radar' ? 'active' : ''}`}
          onClick={() => setActiveTab('radar')}
        >
          <BarChart2 size={16} />
          <span>5-Pillar Radar & Benchmarks</span>
        </button>

        <button
          className={`si-tab-btn ${activeTab === 'alerts' ? 'active' : ''}`}
          onClick={() => setActiveTab('alerts')}
        >
          <AlertCircle size={16} />
          <span>Anomaly Alerts & Interventions</span>
          {allAlerts.length > 0 && (
            <span className="si-tab-counter si-counter-crimson">{allAlerts.length}</span>
          )}
        </button>
      </div>

      {/* Tab 1: Master Intelligence Grid */}
      {activeTab === 'grid' && (
        <div className="si-card">
          <div className="si-card-header">
            <div>
              <h3 className="si-card-title">Attending Surgeon Performance Ledger</h3>
              <p className="si-card-subtitle">
                Comprehensive 5-pillar evaluations with normalized composite scoring, financial yields, and punctuality benchmarks.
              </p>
            </div>
            <div className="si-card-header-badge">
              <span>Showing {filteredProfiles.length} of {profiles.length} Surgeons</span>
            </div>
          </div>

          <div className="si-table-responsive">
            <table className="si-table">
              <thead>
                <tr>
                  <th>Surgeon & Specialty</th>
                  <th>Tier & Composite</th>
                  <th>Financial Yield</th>
                  <th>Operational Efficiency</th>
                  <th>Block Fidelity</th>
                  <th>Quality / Cancel</th>
                  <th>Supply Variance</th>
                  <th>Margin / OR-Hr</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProfiles.map(p => {
                  const tierConfig = PERFORMANCE_TIERS[p.tier] || PERFORMANCE_TIERS.CORE_PERFORMER;
                  return (
                    <tr key={p.id}>
                      <td>
                        <div className="si-surgeon-cell">
                          <span className="si-surgeon-name">{p.name}</span>
                          <span className="si-surgeon-sub">{p.specialty} • NPI {p.npi}</span>
                        </div>
                      </td>
                      <td>
                        <div className="si-tier-cell">
                          <span
                            className="si-tier-badge"
                            style={{
                              backgroundColor: tierConfig.badgeBg,
                              borderColor: tierConfig.badgeBorder,
                              color: tierConfig.badgeText
                            }}
                          >
                            {tierConfig.label}
                          </span>
                          <span className="si-composite-score">{p.compositeScore}</span>
                        </div>
                      </td>
                      <td>
                        <div className="si-pillar-chip">
                          <span className="si-chip-val">{p.financialScore}</span>
                          <span className="si-chip-label">${(p.contributionMargin / 1000).toFixed(0)}k CM</span>
                        </div>
                      </td>
                      <td>
                        <div className="si-pillar-chip">
                          <span className="si-chip-val">{p.operationalScore}</span>
                          <span className="si-chip-label">{p.firstCaseOnTimePct}% OTSR</span>
                        </div>
                      </td>
                      <td>
                        <div className="si-pillar-chip">
                          <span className="si-chip-val">{p.blockScore}</span>
                          <span className="si-chip-label">{p.blockUtilizationPct}% Util</span>
                        </div>
                      </td>
                      <td>
                        <div className="si-pillar-chip">
                          <span className="si-chip-val">{p.qualityScore}</span>
                          <span className="si-chip-label">{p.lateCancellationRate}% Cancel</span>
                        </div>
                      </td>
                      <td>
                        <div className="si-pillar-chip">
                          <span className="si-chip-val">{p.supplyScore}</span>
                          <span className="si-chip-label">+{p.supplyCostVariancePct}% Peer</span>
                        </div>
                      </td>
                      <td>
                        <div className="si-margin-cell">
                          <span className="si-margin-primary">${p.marginPerOrHour.toLocaleString()}</span>
                          <span className="si-margin-sub">{p.totalCases} cases</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="si-btn-sm si-btn-outline"
                          onClick={() => setSelectedSurgeon(p)}
                        >
                          <span>Inspect</span>
                          <ChevronRight size={13} />
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

      {/* Tab 2: 5-Pillar Radar & Benchmarks */}
      {activeTab === 'radar' && (
        <div className="si-radar-grid">
          <div className="si-card">
            <div className="si-card-header">
              <div>
                <h3 className="si-card-title">Pillar 1: Financial Margin & Economic Yield</h3>
                <p className="si-card-subtitle">Contribution margin per OR-hour, realization rate, and payer mix (Weight: 30%)</p>
              </div>
              <span className="si-badge-pill si-badge-blue">Target: $1,800/hr</span>
            </div>
            <div className="si-pillar-body">
              <div className="si-pillar-stat-row">
                <span className="si-pstat-label">Facility Median Margin Yield:</span>
                <span className="si-pstat-val">$1,817 / OR-hr</span>
              </div>
              <div className="si-pillar-stat-row">
                <span className="si-pstat-label">Pinnacle Tier Range:</span>
                <span className="si-pstat-val">$2,183 – $2,244 / OR-hr</span>
              </div>
              <div className="si-pillar-stat-row">
                <span className="si-pstat-label">Commercial Payer Concentration:</span>
                <span className="si-pstat-val">68.4% Facility Average</span>
              </div>
              <div className="si-pillar-desc">
                High-yield surgeons cluster in Orthopedic total joints and multi-level ophthalmic interventions, maintaining net collections realization &gt; 72%.
              </div>
            </div>
          </div>

          <div className="si-card">
            <div className="si-card-header">
              <div>
                <h3 className="si-card-title">Pillar 2: OR Operational Efficiency</h3>
                <p className="si-card-subtitle">First-case on-time starts, incision variance vs P80, turnover (Weight: 25%)</p>
              </div>
              <span className="si-badge-pill si-badge-emerald">Target: 85% OTSR</span>
            </div>
            <div className="si-pillar-body">
              <div className="si-pillar-stat-row">
                <span className="si-pstat-label">Average On-Time Start Rate:</span>
                <span className="si-pstat-val">{facilityKpis.avgOnTimeStartPct}%</span>
              </div>
              <div className="si-pillar-stat-row">
                <span className="si-pstat-label">Avg Same-Surgeon Turnover:</span>
                <span className="si-pstat-val">24.6 mins (Benchmark: 25m)</span>
              </div>
              <div className="si-pillar-stat-row">
                <span className="si-pstat-label">P80 Duration Variance:</span>
                <span className="si-pstat-val">± 7.2 mins center-wide</span>
              </div>
              <div className="si-pillar-desc">
                Surgeons with &gt; 90% on-time starts reduce daily nursing shift end delays by an average of 38 minutes per surgical suite.
              </div>
            </div>
          </div>

          <div className="si-card">
            <div className="si-card-header">
              <div>
                <h3 className="si-card-title">Pillar 3: Block Utilization & Reliability</h3>
                <p className="si-card-subtitle">Block hour utilization, release lead-time, and add-on uptake (Weight: 20%)</p>
              </div>
              <span className="si-badge-pill si-badge-blue">Target: 75% Util</span>
            </div>
            <div className="si-pillar-body">
              <div className="si-pillar-stat-row">
                <span className="si-pstat-label">Center Block Utilization:</span>
                <span className="si-pstat-val">79.2% Allocated Hours</span>
              </div>
              <div className="si-pillar-stat-row">
                <span className="si-pstat-label">Average Surrender Lead-Time:</span>
                <span className="si-pstat-val">62.8 hours prior to case</span>
              </div>
              <div className="si-pillar-stat-row">
                <span className="si-pstat-label">Open-Pool Add-On Rate:</span>
                <span className="si-pstat-val">18.4% of Total Cases</span>
              </div>
              <div className="si-pillar-desc">
                Surgeons surrendering unused blocks &gt; 72h enable high-margin backlog backfill via the Phase AA Next Best Case engine.
              </div>
            </div>
          </div>

          <div className="si-card">
            <div className="si-card-header">
              <div>
                <h3 className="si-card-title">Pillar 4: Clinical Quality & Schedule Integrity</h3>
                <p className="si-card-subtitle">Late cancellation rates, pre-op documentation completeness (Weight: 15%)</p>
              </div>
              <span className="si-badge-pill si-badge-emerald">Target: &lt; 3% Cancel</span>
            </div>
            <div className="si-pillar-body">
              <div className="si-pillar-stat-row">
                <span className="si-pstat-label">Facility Late Cancel Rate:</span>
                <span className="si-pstat-val">4.2% (&lt; 24h notice)</span>
              </div>
              <div className="si-pillar-stat-row">
                <span className="si-pstat-label">H&P / Consent Readiness:</span>
                <span className="si-pstat-val">93.1% 24h prior to surgery</span>
              </div>
              <div className="si-pillar-stat-row">
                <span className="si-pstat-label">Unplanned Hospital Transfers:</span>
                <span className="si-pstat-val">0 Incidents (Past 180 days)</span>
              </div>
              <div className="si-pillar-desc">
                High-scoring quality attendings maintain active surgical consent protocols and zero same-day medical clearance disqualifications.
              </div>
            </div>
          </div>

          <div className="si-card">
            <div className="si-card-header">
              <div>
                <h3 className="si-card-title">Pillar 5: Supply Chain & Waste Discipline</h3>
                <p className="si-card-subtitle">Supply/implant cost variance vs peer median, unused item waste (Weight: 10%)</p>
              </div>
              <span className="si-badge-pill si-badge-amber">Target: ± 5% Variance</span>
            </div>
            <div className="si-pillar-body">
              <div className="si-pillar-stat-row">
                <span className="si-pstat-label">Center Supply Cost Variance:</span>
                <span className="si-pstat-val">+8.6% vs Peer Median</span>
              </div>
              <div className="si-pillar-stat-row">
                <span className="si-pstat-label">Unused Sterile Waste Rate:</span>
                <span className="si-pstat-val">1.9% Opened Packages</span>
              </div>
              <div className="si-pillar-stat-row">
                <span className="si-pstat-label">Preference Card Currency:</span>
                <span className="si-pstat-val">84% Reviewed in &lt; 180 Days</span>
              </div>
              <div className="si-pillar-desc">
                Preference card standardization on generic screws and standardized anchors saves an estimated $410 per orthopedic shoulder arthroscopy.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Strategic Anomaly Alerts & Interventions */}
      {activeTab === 'alerts' && (
        <div className="si-card">
          <div className="si-card-header">
            <div>
              <h3 className="si-card-title">Operational Anomaly & Retention Interventions</h3>
              <p className="si-card-subtitle">
                Automated detection of volume churn risks, start delays, supply cost outliers, and block underutilization.
              </p>
            </div>
            <span className="si-badge-pill si-badge-crimson">{allAlerts.length} Active Alerts</span>
          </div>

          <div className="si-alerts-list">
            {allAlerts.map(alert => {
              const alertConfig = ALERT_TYPES[alert.alertType] || ALERT_TYPES.VOLUME_CHURN_RISK;
              return (
                <div key={alert.id} className="si-alert-item">
                  <div className="si-alert-left">
                    <div className="si-alert-icon-box">
                      {alert.severity === 'CRITICAL' ? (
                        <AlertCircle className="si-icon-crimson" size={20} />
                      ) : (
                        <AlertTriangle className="si-icon-amber" size={20} />
                      )}
                    </div>
                    <div className="si-alert-details">
                      <div className="si-alert-title-row">
                        <span className="si-alert-surgeon">{alert.surgeonName}</span>
                        <span className={`si-alert-sev-badge ${alert.severity === 'CRITICAL' ? 'sev-crit' : 'sev-warn'}`}>
                          {alert.severity} • {alertConfig.label}
                        </span>
                      </div>
                      <p className="si-alert-msg">{alert.message}</p>
                      <div className="si-alert-rec">
                        <span className="si-rec-label">Recommended Action:</span>
                        <span className="si-rec-text">{alert.recommendedAction}</span>
                      </div>
                    </div>
                  </div>
                  <div className="si-alert-right">
                    <button
                      className="si-btn-sm si-btn-emerald"
                      onClick={() => handleResolveAlert(alert.id)}
                    >
                      <CheckCircle2 size={13} />
                      <span>Resolve Alert</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pinned Strategic Action Modal */}
      {selectedSurgeon && (
        <div className="si-modal-overlay" onClick={() => setSelectedSurgeon(null)}>
          <div className="si-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="si-modal-header">
              <div>
                <h3 className="si-modal-title">{selectedSurgeon.name} — Strategic Intelligence Profile</h3>
                <span className="si-modal-sub">{selectedSurgeon.specialty} • NPI {selectedSurgeon.npi}</span>
              </div>
              <button className="si-modal-close" onClick={() => setSelectedSurgeon(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="si-modal-body">
              <div className="si-modal-score-banner">
                <div className="si-mscore-item">
                  <span className="si-mscore-label">Performance Tier</span>
                  <span className="si-mscore-tier">{selectedSurgeon.tier}</span>
                </div>
                <div className="si-mscore-item">
                  <span className="si-mscore-label">Composite Score</span>
                  <span className="si-mscore-val">{selectedSurgeon.compositeScore}</span>
                </div>
                <div className="si-mscore-item">
                  <span className="si-mscore-label">Margin / OR-Hour</span>
                  <span className="si-mscore-val">${selectedSurgeon.marginPerOrHour.toLocaleString()}</span>
                </div>
                <div className="si-mscore-item">
                  <span className="si-mscore-label">Total Cases</span>
                  <span className="si-mscore-val">{selectedSurgeon.totalCases}</span>
                </div>
              </div>

              <div className="si-modal-pillars-grid">
                <div className="si-mpillar-card">
                  <span className="si-mp-title">Pillar 1: Financial Margin</span>
                  <div className="si-mp-score">{selectedSurgeon.financialScore} / 100</div>
                  <div className="si-mp-detail">Total Contribution: ${selectedSurgeon.contributionMargin?.toLocaleString()}</div>
                  <div className="si-mp-detail">Total Revenue: ${selectedSurgeon.totalRevenue?.toLocaleString()}</div>
                </div>

                <div className="si-mpillar-card">
                  <span className="si-mp-title">Pillar 2: Operational Efficiency</span>
                  <div className="si-mp-score">{selectedSurgeon.operationalScore} / 100</div>
                  <div className="si-mp-detail">FC On-Time Starts: {selectedSurgeon.firstCaseOnTimePct}%</div>
                  <div className="si-mp-detail">Avg Turnover: {selectedSurgeon.avgTurnoverMinutes}m</div>
                </div>

                <div className="si-mpillar-card">
                  <span className="si-mp-title">Pillar 3: Block Fidelity</span>
                  <div className="si-mp-score">{selectedSurgeon.blockScore} / 100</div>
                  <div className="si-mp-detail">Block Utilization: {selectedSurgeon.blockUtilizationPct}%</div>
                  <div className="si-mp-detail">Surrender Lead: {selectedSurgeon.releaseNoticeHours}h</div>
                </div>

                <div className="si-mpillar-card">
                  <span className="si-mp-title">Pillar 4: Quality & Integrity</span>
                  <div className="si-mp-score">{selectedSurgeon.qualityScore} / 100</div>
                  <div className="si-mp-detail">Late Cancel Rate: {selectedSurgeon.lateCancellationRate}%</div>
                  <div className="si-mp-detail">Documentation: {selectedSurgeon.docCompletenessPct}%</div>
                </div>

                <div className="si-mpillar-card">
                  <span className="si-mp-title">Pillar 5: Supply Discipline</span>
                  <div className="si-mp-score">{selectedSurgeon.supplyScore} / 100</div>
                  <div className="si-mp-detail">Supply Variance: +{selectedSurgeon.supplyCostVariancePct}%</div>
                  <div className="si-mp-detail">Avg Supply Cost: ${selectedSurgeon.avgSupplyCostPerCase?.toLocaleString()}</div>
                </div>
              </div>

              <div className="si-modal-rec-box">
                <span className="si-mrec-title">Strategic Action Recommendation:</span>
                <p className="si-mrec-desc">
                  {selectedSurgeon.tier === 'PINNACLE'
                    ? 'Eligible for recurring block schedule expansion in OR 1 / OR 2. Prioritize capital equipment requests for specialized instrumentation.'
                    : selectedSurgeon.tier === 'CORE_PERFORMER'
                    ? 'Maintain standard recurring block allocation. Review preference card supply open-vs-hold items to capture an additional 4% in supply savings.'
                    : selectedSurgeon.tier === 'OPPORTUNITY'
                    ? 'Initiate pre-op arrival workflow audit with surgeon office to raise on-time start rate from 68% to 85%.'
                    : 'Issue 90-day probationary review regarding chronic late start delays and block underutilization. Reallocate 50% of block hours to open pool.'}
                </p>
              </div>
            </div>

            <div className="si-modal-footer">
              <button className="si-btn si-btn-outline" onClick={() => setSelectedSurgeon(null)}>
                Close
              </button>
              <button
                className="si-btn si-btn-blue"
                onClick={() => {
                  showToast(`Executive briefing exported for ${selectedSurgeon.name}.`);
                  setSelectedSurgeon(null);
                }}
              >
                <span>Export Executive Briefing</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
