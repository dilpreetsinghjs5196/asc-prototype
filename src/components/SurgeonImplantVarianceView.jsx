import React, { useState, useMemo } from 'react';
import {
  Package,
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
  Award,
  Sparkles,
  BarChart2,
  Trash2,
  FileCheck
} from 'lucide-react';
import {
  VARIANCE_STATUSES,
  IMPLANT_STANDARDS,
  SEED_SURGEON_IMPLANT_VARIANCES,
  calculateFacilityImplantKpis
} from '../services/surgeonImplantVarianceService';
import './SurgeonImplantVarianceView.css';

export default function SurgeonImplantVarianceView() {
  const [activeTab, setActiveTab] = useState('matrix'); // 'matrix', 'savings', 'waste'
  const [variances, setVariances] = useState(SEED_SURGEON_IMPLANT_VARIANCES);
  const [selectedSpecialty, setSelectedSpecialty] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [timeHorizon, setTimeHorizon] = useState('90D');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVariance, setSelectedVariance] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Derive unique specialties
  const specialties = useMemo(() => {
    const list = variances.map(v => v.specialty).filter(Boolean);
    return ['ALL', ...Array.from(new Set(list))];
  }, [variances]);

  // Filter variances
  const filteredVariances = useMemo(() => {
    return variances.filter(v => {
      const matchesSpecialty = selectedSpecialty === 'ALL' || v.specialty === selectedSpecialty;
      const matchesStatus = selectedStatus === 'ALL' || v.varianceStatus === selectedStatus;
      const matchesSearch =
        searchQuery.trim() === '' ||
        v.surgeonName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.procedureName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.cptCode.includes(searchQuery) ||
        v.primaryVendorName.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesSpecialty && matchesStatus && matchesSearch;
    });
  }, [variances, selectedSpecialty, selectedStatus, searchQuery]);

  // Facility KPIs
  const facilityKpis = useMemo(() => {
    return calculateFacilityImplantKpis(variances);
  }, [variances]);

  // Savings opportunities (sorted by total savings descending)
  const savingsOpportunities = useMemo(() => {
    return [...variances].sort((a, b) => b.potentialTotalSavings - a.potentialTotalSavings);
  }, [variances]);

  // Waste audit items (sorted by waste rate descending)
  const wasteAuditItems = useMemo(() => {
    return [...variances].sort((a, b) => b.wasteRatePct - a.wasteRatePct);
  }, [variances]);

  const handleHarmonize = (v) => {
    showToast(`Preference card for ${v.surgeonName} (${v.cptCode}) submitted for standardization to ${v.recommendedSubstitute}.`);
    if (selectedVariance) setSelectedVariance(null);
  };

  return (
    <div className="siv-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="siv-toast" role="alert">
          <CheckCircle2 className="siv-toast-icon" size={18} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="siv-header-banner">
        <div className="siv-header-main">
          <div className="siv-header-title-row">
            <h1 className="siv-title">Surgeon Implant Variance & Sourcing Optimization</h1>
            <span className="siv-badge-pill siv-badge-blue">Module 11 • Phase B2</span>
            <span className="siv-badge-pill siv-badge-emerald">GPO Formulary Verified</span>
          </div>
          <p className="siv-subtitle">
            Procedural device cost variance modeling across identical CPT codes, peer median benchmarks, construct standardization savings, and preference card hold-item waste audits.
          </p>
        </div>
        <div className="siv-header-actions">
          <button
            className="siv-btn siv-btn-outline"
            onClick={() => showToast('Vendor pricing and preference card catalogs synchronized with materials management.')}
          >
            <RefreshCw size={15} />
            <span>Sync Sourcing Matrix</span>
          </button>
        </div>
      </div>

      {/* 5-Card Operational Ribbon */}
      <div className="siv-kpi-ribbon">
        <div className="siv-kpi-card">
          <div className="siv-kpi-header">
            <span className="siv-kpi-label">Evaluated Procedures</span>
            <Package className="siv-kpi-icon siv-icon-blue" size={18} />
          </div>
          <div className="siv-kpi-value">{facilityKpis.totalProcedures}</div>
          <div className="siv-kpi-meta">High-volume device CPTs</div>
        </div>

        <div className="siv-kpi-card">
          <div className="siv-kpi-header">
            <span className="siv-kpi-label">Total Implant Spend</span>
            <DollarSign className="siv-kpi-icon siv-icon-emerald" size={18} />
          </div>
          <div className="siv-kpi-value">${(facilityKpis.totalImplantSpend / 1000).toFixed(1)}k</div>
          <div className="siv-kpi-meta">Acquisition invoice total</div>
        </div>

        <div className="siv-kpi-card">
          <div className="siv-kpi-header">
            <span className="siv-kpi-label">Excess Spend Over Peer</span>
            <AlertTriangle className="siv-kpi-icon siv-icon-crimson" size={18} />
          </div>
          <div className="siv-kpi-value siv-val-crimson">${facilityKpis.totalExcessSpend.toLocaleString()}</div>
          <div className="siv-kpi-meta">{facilityKpis.outliersCount} high variance outliers</div>
        </div>

        <div className="siv-kpi-card">
          <div className="siv-kpi-header">
            <span className="siv-kpi-label">Realizable Savings</span>
            <TrendingUp className="siv-kpi-icon siv-icon-blue" size={18} />
          </div>
          <div className="siv-kpi-value">${(facilityKpis.totalRealizableSavings / 1000).toFixed(1)}k</div>
          <div className="siv-kpi-meta">Contracted Tier-1 substitution</div>
        </div>

        <div className="siv-kpi-card">
          <div className="siv-kpi-header">
            <span className="siv-kpi-label">Avg Sterile Waste Rate</span>
            <Trash2 className="siv-kpi-icon siv-icon-amber" size={18} />
          </div>
          <div className="siv-kpi-value">{facilityKpis.avgSterileWastePct}%</div>
          <div className="siv-kpi-meta">Benchmark: &lt; 3.0% opened unused</div>
        </div>
      </div>

      {/* Filter Card */}
      <div className="siv-filter-card">
        <div className="siv-filter-row">
          <div className="siv-search-box">
            <Search className="siv-search-icon" size={16} />
            <input
              type="text"
              className="siv-search-input"
              placeholder="Search surgeon, procedure, CPT, vendor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="siv-filter-group">
            <span className="siv-filter-label">Specialty:</span>
            <select
              className="siv-select"
              value={selectedSpecialty}
              onChange={(e) => setSelectedSpecialty(e.target.value)}
            >
              {specialties.map(spec => (
                <option key={spec} value={spec}>{spec === 'ALL' ? 'All Specialties' : spec}</option>
              ))}
            </select>
          </div>

          <div className="siv-filter-group">
            <span className="siv-filter-label">Status:</span>
            <select
              className="siv-select"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="ALL">All Statuses</option>
              <option value="EFFICIENT">Efficient (≤ 5%)</option>
              <option value="MODERATE_VARIANCE">Moderate (5% - 20%)</option>
              <option value="HIGH_VARIANCE_OUTLIER">High Outlier (&gt; 20%)</option>
            </select>
          </div>

          <div className="siv-filter-group">
            <span className="siv-filter-label">Horizon:</span>
            <div className="siv-time-pills">
              {['30D', '90D', '180D', '365D', 'YTD'].map(h => (
                <button
                  key={h}
                  className={`siv-time-pill ${timeHorizon === h ? 'active' : ''}`}
                  onClick={() => setTimeHorizon(h)}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="siv-tabs-nav">
        <button
          className={`siv-tab-btn ${activeTab === 'matrix' ? 'active' : ''}`}
          onClick={() => setActiveTab('matrix')}
        >
          <Layers size={16} />
          <span>Surgeon Procedure Variance Matrix</span>
          <span className="siv-tab-counter">{filteredVariances.length}</span>
        </button>

        <button
          className={`siv-tab-btn ${activeTab === 'savings' ? 'active' : ''}`}
          onClick={() => setActiveTab('savings')}
        >
          <TrendingUp size={16} />
          <span>Construct Standardization & Savings</span>
          <span className="siv-tab-counter">{savingsOpportunities.length}</span>
        </button>

        <button
          className={`siv-tab-btn ${activeTab === 'waste' ? 'active' : ''}`}
          onClick={() => setActiveTab('waste')}
        >
          <Trash2 size={16} />
          <span>Sterile Waste & Staging Audit</span>
          {facilityKpis.outliersCount > 0 && (
            <span className="siv-tab-counter siv-counter-crimson">{facilityKpis.outliersCount}</span>
          )}
        </button>
      </div>

      {/* Tab 1: Variance Matrix */}
      {activeTab === 'matrix' && (
        <div className="siv-card">
          <div className="siv-card-header">
            <div>
              <h3 className="siv-card-title">Procedure-Level Implant Expenditure Ledger</h3>
              <p className="siv-card-subtitle">
                Comparing individual surgeon construct costs against specialty peer medians and contracted baseline targets.
              </p>
            </div>
            <span className="siv-card-header-badge">Showing {filteredVariances.length} Procedures</span>
          </div>

          <div className="siv-table-responsive">
            <table className="siv-table">
              <thead>
                <tr>
                  <th>Surgeon & Specialty</th>
                  <th>CPT & Procedure</th>
                  <th>Cases</th>
                  <th>Surgeon Cost</th>
                  <th>Peer Median</th>
                  <th>Contract Baseline</th>
                  <th>Variance ($ / %)</th>
                  <th>Excess Spend</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredVariances.map(v => {
                  const statusConfig = VARIANCE_STATUSES[v.varianceStatus] || VARIANCE_STATUSES.EFFICIENT;
                  return (
                    <tr key={v.id}>
                      <td>
                        <div className="siv-surgeon-cell">
                          <span className="siv-surgeon-name">{v.surgeonName}</span>
                          <span className="siv-surgeon-sub">{v.specialty}</span>
                        </div>
                      </td>
                      <td>
                        <div className="siv-cpt-cell">
                          <span className="siv-cpt-code">CPT {v.cptCode}</span>
                          <span className="siv-cpt-name">{v.procedureName}</span>
                        </div>
                      </td>
                      <td>
                        <span className="siv-val-bold">{v.caseCount}</span>
                      </td>
                      <td>
                        <span className="siv-val-bold">${v.surgeonAvgImplantCost.toLocaleString()}</span>
                      </td>
                      <td>
                        <span className="siv-sub-muted">${v.peerMedianImplantCost.toLocaleString()}</span>
                      </td>
                      <td>
                        <span className="siv-sub-emerald">${v.contractBaselineCost.toLocaleString()}</span>
                      </td>
                      <td>
                        <div className="siv-variance-cell">
                          <span className={`siv-var-val ${v.unitCostVariance > 0 ? 'siv-text-crimson' : 'siv-text-emerald'}`}>
                            {v.unitCostVariance > 0 ? `+` : ''}${v.unitCostVariance.toLocaleString()}
                          </span>
                          <span className="siv-var-pct">({v.variancePct > 0 ? `+` : ''}{v.variancePct}%)</span>
                        </div>
                      </td>
                      <td>
                        <span className={`siv-val-bold ${v.totalExcessSpend > 0 ? 'siv-text-crimson' : 'siv-text-emerald'}`}>
                          ${v.totalExcessSpend.toLocaleString()}
                        </span>
                      </td>
                      <td>
                        <span
                          className="siv-status-badge"
                          style={{
                            backgroundColor: statusConfig.badgeBg,
                            borderColor: statusConfig.badgeBorder,
                            color: statusConfig.badgeText
                          }}
                        >
                          {statusConfig.label}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="siv-btn-sm siv-btn-outline"
                          onClick={() => setSelectedVariance(v)}
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

      {/* Tab 2: Construct Standardization & Savings */}
      {activeTab === 'savings' && (
        <div className="siv-card">
          <div className="siv-card-header">
            <div>
              <h3 className="siv-card-title">Contracted Construct Substitution & Annualized Savings</h3>
              <p className="siv-card-subtitle">
                Identified physician-level opportunities to standardize high-cost off-contract constructs to contracted Tier-1 equivalents.
              </p>
            </div>
            <span className="siv-badge-pill siv-badge-emerald">${facilityKpis.totalRealizableSavings.toLocaleString()} Total Opportunity</span>
          </div>

          <div className="siv-savings-grid">
            {savingsOpportunities.map(v => (
              <div key={v.id} className="siv-savings-card">
                <div className="siv-scard-header">
                  <div>
                    <h4 className="siv-scard-title">{v.surgeonName} — CPT {v.cptCode}</h4>
                    <span className="siv-scard-sub">{v.procedureName} • {v.caseCount} Cases</span>
                  </div>
                  <span className="siv-badge-pill siv-badge-emerald">
                    ${v.potentialTotalSavings.toLocaleString()} Potential Savings
                  </span>
                </div>

                <div className="siv-construct-compare">
                  <div className="siv-construct-box siv-construct-current">
                    <span className="siv-cbox-label">Current Construct:</span>
                    <span className="siv-cbox-vendor">{v.primaryVendorName}</span>
                    <p className="siv-cbox-desc">{v.primaryConstructName}</p>
                    <div className="siv-cbox-price">
                      <span className="siv-cprice-label">Current Avg Cost:</span>
                      <span className="siv-cprice-val">${v.surgeonAvgImplantCost.toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="siv-compare-arrow">
                    <ArrowRight size={20} />
                  </div>

                  <div className="siv-construct-box siv-construct-target">
                    <span className="siv-cbox-label">Contracted Substitute:</span>
                    <span className="siv-cbox-vendor">Contracted Formulary</span>
                    <p className="siv-cbox-desc">{v.recommendedSubstitute}</p>
                    <div className="siv-cbox-price">
                      <span className="siv-cprice-label">Target Unit Cost:</span>
                      <span className="siv-cprice-val siv-text-emerald">${v.contractBaselineCost.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="siv-scard-footer">
                  <div className="siv-unit-savings-meta">
                    <span className="siv-us-val">${v.potentialUnitSavings.toLocaleString()}</span>
                    <span className="siv-us-label">savings per case</span>
                  </div>
                  <button
                    className="siv-btn siv-btn-blue"
                    onClick={() => handleHarmonize(v)}
                  >
                    <FileCheck size={14} />
                    <span>Harmonize Preference Card</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Sterile Waste & Staging Audit */}
      {activeTab === 'waste' && (
        <div className="siv-card">
          <div className="siv-card-header">
            <div>
              <h3 className="siv-card-title">Preference Card Sterile Waste & "OPEN" vs "HOLD" Staging Audit</h3>
              <p className="siv-card-subtitle">
                Quantifying opened-but-unused implants staged on surgical preference cards that result in unrecoverable facility expense.
              </p>
            </div>
            <span className="siv-badge-pill siv-badge-amber">Threshold: &le; 3.0% Waste</span>
          </div>

          <div className="siv-table-responsive">
            <table className="siv-table">
              <thead>
                <tr>
                  <th>Surgeon</th>
                  <th>CPT & Procedure</th>
                  <th>Primary Construct</th>
                  <th>Waste Rate %</th>
                  <th>Total Waste Loss</th>
                  <th>Clinical Staging Recommendation</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {wasteAuditItems.map(v => (
                  <tr key={v.id}>
                    <td>
                      <div className="siv-surgeon-cell">
                        <span className="siv-surgeon-name">{v.surgeonName}</span>
                        <span className="siv-surgeon-sub">{v.specialty}</span>
                      </div>
                    </td>
                    <td>
                      <div className="siv-cpt-cell">
                        <span className="siv-cpt-code">CPT {v.cptCode}</span>
                        <span className="siv-cpt-name">{v.procedureName}</span>
                      </div>
                    </td>
                    <td>
                      <span className="siv-sub-muted">{v.primaryVendorName} ({v.primaryConstructName})</span>
                    </td>
                    <td>
                      <span className={`siv-badge-pill ${v.wasteRatePct > IMPLANT_STANDARDS.MAX_STERILE_WASTE_PCT ? 'siv-badge-crimson' : 'siv-badge-emerald'}`}>
                        {v.wasteRatePct}% Waste
                      </span>
                    </td>
                    <td>
                      <span className={`siv-val-bold ${v.wasteCostTotal > 500 ? 'siv-text-crimson' : 'siv-text-emerald'}`}>
                        ${v.wasteCostTotal.toLocaleString()}
                      </span>
                    </td>
                    <td>
                      <span className="siv-waste-rec">
                        {v.wasteRatePct > IMPLANT_STANDARDS.MAX_STERILE_WASTE_PCT
                          ? 'Reclassify secondary backup anchors/screws from "OPEN" to "HOLD" on card'
                          : 'Preference card staging aligns with clinical consumption standards'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="siv-btn-sm siv-btn-outline"
                        onClick={() => handleHarmonize(v)}
                      >
                        <span>Update Card</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pinned Construct Drill-down Modal */}
      {selectedVariance && (
        <div className="siv-modal-overlay" onClick={() => setSelectedVariance(null)}>
          <div className="siv-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="siv-modal-header">
              <div>
                <h3 className="siv-modal-title">{selectedVariance.surgeonName} — CPT {selectedVariance.cptCode} Construct Variance</h3>
                <span className="siv-modal-sub">{selectedVariance.procedureName} • {selectedVariance.specialty}</span>
              </div>
              <button className="siv-modal-close" onClick={() => setSelectedVariance(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="siv-modal-body">
              <div className="siv-modal-kpi-grid">
                <div className="siv-mkpi-card">
                  <span className="siv-mkpi-label">Surgeon Avg Cost</span>
                  <span className="siv-mkpi-val">${selectedVariance.surgeonAvgImplantCost.toLocaleString()}</span>
                </div>
                <div className="siv-mkpi-card">
                  <span className="siv-mkpi-label">Peer Median</span>
                  <span className="siv-mkpi-val">${selectedVariance.peerMedianImplantCost.toLocaleString()}</span>
                </div>
                <div className="siv-mkpi-card">
                  <span className="siv-mkpi-label">Unit Variance</span>
                  <span className={`siv-mkpi-val ${selectedVariance.unitCostVariance > 0 ? 'siv-text-crimson' : 'siv-text-emerald'}`}>
                    {selectedVariance.unitCostVariance > 0 ? '+' : ''}${selectedVariance.unitCostVariance.toLocaleString()} ({selectedVariance.variancePct}%)
                  </span>
                </div>
                <div className="siv-mkpi-card">
                  <span className="siv-mkpi-label">Total Excess Spend</span>
                  <span className="siv-mkpi-val siv-text-crimson">${selectedVariance.totalExcessSpend.toLocaleString()}</span>
                </div>
              </div>

              <div className="siv-modal-section">
                <h4 className="siv-msec-title">Construct Sourcing Comparison</h4>
                <div className="siv-mcompare-box">
                  <div className="siv-mcomp-col">
                    <span className="siv-mcomp-header">Current Primary Construct</span>
                    <div className="siv-mcomp-vendor">{selectedVariance.primaryVendorName}</div>
                    <div className="siv-mcomp-name">{selectedVariance.primaryConstructName}</div>
                    <div className="siv-mcomp-cost">Surgeon Cost: ${selectedVariance.surgeonAvgImplantCost.toLocaleString()}</div>
                  </div>
                  <div className="siv-mcomp-col siv-mcomp-rec">
                    <span className="siv-mcomp-header">Recommended Contracted Formulation</span>
                    <div className="siv-mcomp-vendor">Contracted Formulary</div>
                    <div className="siv-mcomp-name">{selectedVariance.recommendedSubstitute}</div>
                    <div className="siv-mcomp-cost siv-text-emerald">Contract Target: ${selectedVariance.contractBaselineCost.toLocaleString()}</div>
                  </div>
                </div>
              </div>

              <div className="siv-modal-section">
                <h4 className="siv-msec-title">Clinical Supply Chain Action Plan</h4>
                <div className="siv-action-plan-box">
                  <p className="siv-aplan-text">
                    By standardizing CPT {selectedVariance.cptCode} from {selectedVariance.primaryConstructName} to {selectedVariance.recommendedSubstitute}, the facility realizes <strong>${selectedVariance.potentialUnitSavings.toLocaleString()}</strong> per case in direct implant cost reduction. Over {selectedVariance.caseCount} annual surgical cases, this generates <strong>${selectedVariance.potentialTotalSavings.toLocaleString()}</strong> in net facility contribution margin improvement with zero degradation in clinical outcomes.
                  </p>
                </div>
              </div>
            </div>

            <div className="siv-modal-footer">
              <button className="siv-btn siv-btn-outline" onClick={() => setSelectedVariance(null)}>
                Close
              </button>
              <button
                className="siv-btn siv-btn-blue"
                onClick={() => handleHarmonize(selectedVariance)}
              >
                <span>Harmonize Preference Card</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
