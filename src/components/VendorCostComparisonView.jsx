import React, { useState, useMemo } from 'react';
import {
  DollarSign,
  TrendingDown,
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
  Package,
  ShoppingCart,
  Users,
  FileText
} from 'lucide-react';
import {
  VENDOR_VALUE_GRADES,
  COMPARISON_BENCHMARKS,
  SEED_VENDOR_COST_COMPARISONS,
  SEED_VENDOR_SKU_PRICING,
  SEED_SURGEON_VENDOR_PREFERENCES,
  calculateFacilityVendorKpis
} from '../services/vendorCostComparisonService';
import './VendorCostComparisonView.css';

export default function VendorCostComparisonView() {
  const [activeTab, setActiveTab] = useState('construct_matrix'); // 'construct_matrix', 'surgeon_sourcing', 'sku_audit'
  const [comparisonList, setComparisonList] = useState(SEED_VENDOR_COST_COMPARISONS);
  const [skuList, setSkuList] = useState(SEED_VENDOR_SKU_PRICING);
  const [surgeonPrefs, setSurgeonPrefs] = useState(SEED_SURGEON_VENDOR_PREFERENCES);
  const [selectedSpecialty, setSelectedSpecialty] = useState('ALL');
  const [selectedGrade, setSelectedGrade] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Facility-wide KPI aggregations
  const facilityKpis = useMemo(() => {
    return calculateFacilityVendorKpis(comparisonList);
  }, [comparisonList]);

  // Unique specialties for filter
  const specialties = useMemo(() => {
    const set = new Set(comparisonList.map(c => c.specialty));
    return ['ALL', ...Array.from(set)];
  }, [comparisonList]);

  // Filtered construct comparisons for Tab 1
  const filteredComparisons = useMemo(() => {
    return comparisonList.filter(item => {
      const matchSpecialty = selectedSpecialty === 'ALL' || item.specialty === selectedSpecialty;
      const matchGrade = selectedGrade === 'ALL' || item.valueGrade === selectedGrade;
      const query = searchQuery.toLowerCase().trim();
      const matchSearch =
        !query ||
        item.cptCode.toLowerCase().includes(query) ||
        item.procedureName.toLowerCase().includes(query) ||
        item.vendorName.toLowerCase().includes(query) ||
        item.constructCategory.toLowerCase().includes(query) ||
        item.specialty.toLowerCase().includes(query);
      return matchSpecialty && matchGrade && matchSearch;
    });
  }, [comparisonList, selectedSpecialty, selectedGrade, searchQuery]);

  const handleExportNegotiation = (cptCode, vendorName) => {
    showToast(`RFP price negotiation packet generated for ${vendorName} (CPT ${cptCode})`);
  };

  const handleHarmonizePreference = (surgeonName, cptCode) => {
    showToast(`Harmonized preference card draft prepared for ${surgeonName} (CPT ${cptCode})`);
  };

  return (
    <div className="vcc-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="vcc-toast">
          <CheckCircle2 size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 5-Card Top Executive Metric Ribbon */}
      <div className="vcc-ribbon">
        {/* Card 1: Total Implant Spend */}
        <div className="vcc-card">
          <div className="vcc-card-header">
            <span className="vcc-card-title">TOTAL IMPLANT SPEND</span>
            <div className="vcc-card-icon vcc-icon-blue">
              <ShoppingCart size={18} />
            </div>
          </div>
          <div className="vcc-card-value">
            ${facilityKpis.totalImplantSpend.toLocaleString()}
          </div>
          <div className="vcc-card-footer">
            <span className="vcc-badge vcc-badge-blue">
              Annualized Procurement
            </span>
            <span className="vcc-card-subtext">
              {facilityKpis.evaluatedVendorsCount} Active Vendors
            </span>
          </div>
        </div>

        {/* Card 2: Potential Standardization Savings */}
        <div className="vcc-card">
          <div className="vcc-card-header">
            <span className="vcc-card-title">STANDARDIZATION SAVINGS</span>
            <div className="vcc-card-icon vcc-icon-emerald">
              <TrendingDown size={18} />
            </div>
          </div>
          <div className="vcc-card-value">
            ${facilityKpis.totalPotentialSavings.toLocaleString()}
          </div>
          <div className="vcc-card-footer">
            <span className="vcc-badge vcc-badge-emerald">
              Realizable Opportunity
            </span>
            <span className="vcc-card-subtext">
              Via Tier 1 Price Matching
            </span>
          </div>
        </div>

        {/* Card 3: Max Cross-Vendor Price Spread */}
        <div className="vcc-card">
          <div className="vcc-card-header">
            <span className="vcc-card-title">MAX PRICE SPREAD</span>
            <div className="vcc-card-icon vcc-icon-amber">
              <Scale size={18} />
            </div>
          </div>
          <div className="vcc-card-value">
            {facilityKpis.maxPriceSpreadPct}%
          </div>
          <div className="vcc-card-footer">
            <span
              className={`vcc-badge ${
                facilityKpis.maxPriceSpreadPct <= COMPARISON_BENCHMARKS.MAX_ACCEPTABLE_PRICE_VARIANCE_PCT
                  ? 'vcc-badge-emerald'
                  : 'vcc-badge-amber'
              }`}
            >
              Cross-Vendor Discrepancy
            </span>
            <span className="vcc-card-subtext">Benchmark: ≤ 10.0%</span>
          </div>
        </div>

        {/* Card 4: Off-Contract Spend Leakage */}
        <div className="vcc-card">
          <div className="vcc-card-header">
            <span className="vcc-card-title">OFF-CONTRACT LEAKAGE</span>
            <div className="vcc-card-icon vcc-icon-crimson">
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className="vcc-card-value">
            ${facilityKpis.offContractSpendDollars.toLocaleString()}
          </div>
          <div className="vcc-card-footer">
            <span
              className={`vcc-badge ${
                facilityKpis.offContractSpendDollars > 0
                  ? 'vcc-badge-crimson'
                  : 'vcc-badge-emerald'
              }`}
            >
              Non-Formulary Spend
            </span>
            <span className="vcc-card-subtext">Target: $0 Rogue Spend</span>
          </div>
        </div>

        {/* Card 5: Evaluated Constructs & Formularies */}
        <div className="vcc-card">
          <div className="vcc-card-header">
            <span className="vcc-card-title">EVALUATED CONSTRUCTS</span>
            <div className="vcc-card-icon vcc-icon-sky">
              <Package size={18} />
            </div>
          </div>
          <div className="vcc-card-value">
            {facilityKpis.evaluatedConstructsCount}{' '}
            <span className="vcc-card-unit">Categories</span>
          </div>
          <div className="vcc-card-footer">
            <span className="vcc-badge vcc-badge-emerald">
              {facilityKpis.gradeDistribution.TIER_1_PREFERRED} Tier 1 Preferred
            </span>
            <span className="vcc-card-subtext">
              {comparisonList.length} Head-to-Head Quotes
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="vcc-tabs-nav">
        <button
          className={`vcc-tab-btn ${activeTab === 'construct_matrix' ? 'active' : ''}`}
          onClick={() => setActiveTab('construct_matrix')}
        >
          <BarChart2 size={16} />
          <span>Construct & CPT Cross-Vendor Pricing Matrix</span>
        </button>
        <button
          className={`vcc-tab-btn ${activeTab === 'surgeon_sourcing' ? 'active' : ''}`}
          onClick={() => setActiveTab('surgeon_sourcing')}
        >
          <Users size={16} />
          <span>Surgeon Sourcing & Loyalty Comparison</span>
        </button>
        <button
          className={`vcc-tab-btn ${activeTab === 'sku_audit' ? 'active' : ''}`}
          onClick={() => setActiveTab('sku_audit')}
        >
          <FileCheck size={16} />
          <span>SKU Catalog & Contract Price Audit</span>
        </button>
      </div>

      {/* TAB 1: Construct & CPT Cross-Vendor Pricing Matrix */}
      {activeTab === 'construct_matrix' && (
        <div className="vcc-tab-content">
          {/* Controls Bar */}
          <div className="vcc-controls-bar">
            <div className="vcc-search-box">
              <Search size={16} className="vcc-search-icon" />
              <input
                type="text"
                placeholder="Search CPT code, procedure, vendor, or construct category..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="vcc-search-input"
              />
              {searchQuery && (
                <button
                  className="vcc-search-clear"
                  onClick={() => setSearchQuery('')}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="vcc-filters-group">
              <div className="vcc-filter-item">
                <span className="vcc-filter-label">Specialty:</span>
                <select
                  value={selectedSpecialty}
                  onChange={e => setSelectedSpecialty(e.target.value)}
                  className="vcc-select"
                >
                  {specialties.map(spec => (
                    <option key={spec} value={spec}>
                      {spec === 'ALL' ? 'All Specialties' : spec}
                    </option>
                  ))}
                </select>
              </div>

              <div className="vcc-filter-item">
                <span className="vcc-filter-label">Value Grade:</span>
                <select
                  value={selectedGrade}
                  onChange={e => setSelectedGrade(e.target.value)}
                  className="vcc-select"
                >
                  <option value="ALL">All Value Grades</option>
                  {Object.values(VENDOR_VALUE_GRADES).map(grade => (
                    <option key={grade.key} value={grade.key}>
                      {grade.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                className="vcc-refresh-btn"
                onClick={() => {
                  setComparisonList([...SEED_VENDOR_COST_COMPARISONS]);
                  showToast('Vendor pricing benchmarks refreshed');
                }}
              >
                <RefreshCw size={14} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Pricing Matrix Table */}
          <div className="vcc-table-card">
            <div className="vcc-table-wrapper">
              <table className="vcc-table">
                <thead>
                  <tr>
                    <th>Construct & Procedure</th>
                    <th>Specialty</th>
                    <th>Vendor System</th>
                    <th>Annual Cases</th>
                    <th>Construct Cost</th>
                    <th>Facility Benchmark</th>
                    <th>Price Delta</th>
                    <th>Annual Spend</th>
                    <th>Potential Savings</th>
                    <th>Compliance</th>
                    <th>Value Grade</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredComparisons.length === 0 ? (
                    <tr>
                      <td colSpan="12" className="vcc-empty-state">
                        <AlertCircle size={28} className="vcc-empty-icon" />
                        <div>No vendor constructs matching the current filters</div>
                      </td>
                    </tr>
                  ) : (
                    filteredComparisons.map((item, idx) => {
                      const grade =
                        VENDOR_VALUE_GRADES[item.valueGrade] ||
                        VENDOR_VALUE_GRADES.COMPETITIVE_STANDARD;
                      return (
                        <tr
                          key={`${item.cptCode}-${item.vendorCode}-${idx}`}
                          onClick={() => setSelectedItem(item)}
                          className="vcc-clickable-row"
                        >
                          <td>
                            <div className="vcc-code-cell">
                              <span className="vcc-code-badge">
                                {item.cptCode}
                              </span>
                              <div>
                                <div className="vcc-code-name">
                                  {item.procedureName}
                                </div>
                                <div className="vcc-subtext-cat">
                                  {item.constructCategory.replace('_', ' ')}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="vcc-specialty-tag">
                              {item.specialty}
                            </span>
                          </td>
                          <td>
                            <div className="vcc-vendor-name-box">
                              <span className="vcc-vendor-title">
                                {item.vendorName}
                              </span>
                              {!item.isContracted && (
                                <span className="vcc-off-contract-tag">
                                  Off-Contract
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="vcc-num-cell">
                            {item.annualCaseVolume}
                          </td>
                          <td className="vcc-num-cell vcc-bold-cell">
                            ${item.avgConstructCost.toLocaleString()}
                          </td>
                          <td className="vcc-num-cell vcc-text-slate">
                            ${item.facilityBenchmarkCost.toLocaleString()}
                          </td>
                          <td className="vcc-num-cell">
                            <span
                              className={`vcc-metric-cell ${
                                item.costVarianceDollars === 0
                                  ? 'vcc-text-emerald'
                                  : item.costVarianceDollars > 500
                                  ? 'vcc-text-crimson'
                                  : 'vcc-text-amber'
                              }`}
                            >
                              {item.costVarianceDollars === 0
                                ? '$0 (Benchmark)'
                                : `+$${item.costVarianceDollars.toLocaleString()} (+${item.costVariancePct}%)`}
                            </span>
                          </td>
                          <td className="vcc-num-cell">
                            ${item.annualSpendDollars.toLocaleString()}
                          </td>
                          <td className="vcc-num-cell">
                            <span
                              className={
                                item.potentialSavingsDollars > 0
                                  ? 'vcc-text-emerald vcc-bold-cell'
                                  : 'vcc-text-slate'
                              }
                            >
                              ${item.potentialSavingsDollars.toLocaleString()}
                            </span>
                          </td>
                          <td className="vcc-num-cell">
                            <span
                              className={
                                item.contractComplianceRatePct >= 95
                                  ? 'vcc-text-emerald'
                                  : item.contractComplianceRatePct >= 85
                                  ? 'vcc-text-blue'
                                  : 'vcc-text-crimson'
                              }
                            >
                              {item.contractComplianceRatePct}%
                            </span>
                          </td>
                          <td>
                            <span
                              className="vcc-grade-badge"
                              style={{
                                color: grade.color,
                                backgroundColor: grade.badgeBg,
                                borderColor: grade.badgeBorder
                              }}
                            >
                              {grade.label}
                            </span>
                          </td>
                          <td>
                            <button
                              className="vcc-dossier-btn"
                              onClick={e => {
                                e.stopPropagation();
                                setSelectedItem(item);
                              }}
                            >
                              <span>Compare</span>
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

      {/* TAB 2: Surgeon Sourcing & Loyalty Comparison */}
      {activeTab === 'surgeon_sourcing' && (
        <div className="vcc-tab-content">
          <div className="vcc-tab-header-box">
            <div className="vcc-tab-header-title">
              <Users size={20} className="vcc-icon-blue" />
              <span>Physician Vendor Allocation, Brand Loyalty, & Construct Harmonization</span>
            </div>
            <div className="vcc-tab-header-desc">
              Audit physician-level vendor preferences, brand volume concentration, excess spend per encounter against facility Tier 1 contracts, and realizable preference card harmonization savings.
            </div>
          </div>

          <div className="vcc-table-card">
            <div className="vcc-table-wrapper">
              <table className="vcc-table">
                <thead>
                  <tr>
                    <th>Attending Surgeon</th>
                    <th>CPT Procedure</th>
                    <th>Primary Vendor</th>
                    <th>Brand Loyalty %</th>
                    <th>Surgeon Construct Cost</th>
                    <th>Facility Tier 1 Cost</th>
                    <th>Excess Spend / Case</th>
                    <th>Annual Savings Potential</th>
                    <th>Harmonization Opportunity</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {surgeonPrefs.map((pref, idx) => (
                    <tr key={`${pref.surgeonId}-${pref.cptCode}-${idx}`}>
                      <td>
                        <div className="vcc-surgeon-name-box">
                          <span className="vcc-surgeon-title">
                            {pref.surgeonName}
                          </span>
                          <span className="vcc-surgeon-id">
                            ID: #{pref.surgeonId}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="vcc-code-badge">
                          {pref.cptCode}
                        </span>
                      </td>
                      <td>
                        <span className="vcc-vendor-title">
                          {pref.primaryVendorName}
                        </span>
                      </td>
                      <td className="vcc-num-cell">
                        <span className="vcc-badge vcc-badge-blue">
                          {pref.vendorVolumeSharePct}% Sourced
                        </span>
                      </td>
                      <td className="vcc-num-cell vcc-bold-cell">
                        ${pref.avgSurgeonConstructCost.toLocaleString()}
                      </td>
                      <td className="vcc-num-cell vcc-text-emerald">
                        ${pref.facilityTier1Cost.toLocaleString()}
                      </td>
                      <td className="vcc-num-cell">
                        <span
                          className={
                            pref.excessSpendPerCase === 0
                              ? 'vcc-text-emerald'
                              : 'vcc-text-crimson'
                          }
                        >
                          {pref.excessSpendPerCase === 0
                            ? '$0 (Compliant)'
                            : `+$${pref.excessSpendPerCase.toLocaleString()}`}
                        </span>
                      </td>
                      <td className="vcc-num-cell">
                        <span
                          className={
                            pref.potentialAnnualSavings > 0
                              ? 'vcc-text-emerald vcc-bold-cell'
                              : 'vcc-text-slate'
                          }
                        >
                          ${pref.potentialAnnualSavings.toLocaleString()}
                        </span>
                      </td>
                      <td className="vcc-desc-cell">
                        {pref.notes}
                      </td>
                      <td>
                        {pref.potentialAnnualSavings > 0 ? (
                          <button
                            className="vcc-harmonize-btn"
                            onClick={() =>
                              handleHarmonizePreference(
                                pref.surgeonName,
                                pref.cptCode
                              )
                            }
                          >
                            <Zap size={13} />
                            <span>Harmonize Card</span>
                          </button>
                        ) : (
                          <span className="vcc-badge vcc-badge-emerald">
                            <CheckCircle2 size={12} />
                            <span>Formulary Aligned</span>
                          </span>
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

      {/* TAB 3: SKU Catalog & Contract Price Audit */}
      {activeTab === 'sku_audit' && (
        <div className="vcc-tab-content">
          <div className="vcc-tab-header-box">
            <div className="vcc-tab-header-title">
              <FileCheck size={20} className="vcc-icon-sky" />
              <span>Itemized SKU Price Audit & Invoice Discrepancy Workqueue</span>
            </div>
            <div className="vcc-tab-header-desc">
              Compare contracted purchase discount tiers against paid invoice amounts to detect off-contract invoice price creep and unapplied volume discounts.
            </div>
          </div>

          <div className="vcc-table-card">
            <div className="vcc-table-wrapper">
              <table className="vcc-table">
                <thead>
                  <tr>
                    <th>SKU Code</th>
                    <th>Product Name & Description</th>
                    <th>Construct Category</th>
                    <th>Vendor</th>
                    <th>List Price</th>
                    <th>Contract Tier Price</th>
                    <th>Actual Invoice Price</th>
                    <th>Invoice Variance</th>
                    <th>Annual Units</th>
                    <th>Consignment</th>
                    <th>Audit Status</th>
                  </tr>
                </thead>
                <tbody>
                  {skuList.map((sku, idx) => {
                    const isCreep = sku.invoiceVarianceDollars > 0;
                    return (
                      <tr key={`${sku.skuCode}-${idx}`}>
                        <td>
                          <span className="vcc-code-badge">
                            {sku.skuCode}
                          </span>
                        </td>
                        <td>
                          <span className="vcc-code-name">
                            {sku.productName}
                          </span>
                        </td>
                        <td>
                          <span className="vcc-specialty-tag">
                            {sku.constructCategory.replace('_', ' ')}
                          </span>
                        </td>
                        <td>
                          <span className="vcc-vendor-title">
                            {sku.vendorName}
                          </span>
                        </td>
                        <td className="vcc-num-cell vcc-text-slate">
                          ${sku.listPrice.toLocaleString()}
                        </td>
                        <td className="vcc-num-cell vcc-text-emerald">
                          ${sku.contractedTierPrice.toLocaleString()}
                        </td>
                        <td className="vcc-num-cell vcc-bold-cell">
                          ${sku.actualInvoicePrice.toLocaleString()}
                        </td>
                        <td className="vcc-num-cell">
                          <span
                            className={
                              isCreep ? 'vcc-text-crimson' : 'vcc-text-emerald'
                            }
                          >
                            {isCreep
                              ? `+$${sku.invoiceVarianceDollars.toLocaleString()}`
                              : '$0 (Matches Contract)'}
                          </span>
                        </td>
                        <td className="vcc-num-cell">
                          {sku.annualUnitsUsed}
                        </td>
                        <td>
                          {sku.isConsignment ? (
                            <span className="vcc-badge vcc-badge-blue">
                              Consignment
                            </span>
                          ) : (
                            <span className="vcc-badge vcc-badge-slate">
                              Purchased Owned
                            </span>
                          )}
                        </td>
                        <td>
                          {isCreep ? (
                            <span className="vcc-badge vcc-badge-crimson">
                              Price Creep Detected
                            </span>
                          ) : (
                            <span className="vcc-badge vcc-badge-emerald">
                              Price Verified
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

      {/* Pinned Vendor Cost Dossier Modal */}
      {selectedItem && (
        <div
          className="vcc-modal-overlay"
          onClick={() => setSelectedItem(null)}
        >
          <div
            className="vcc-modal"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="vcc-modal-header">
              <div className="vcc-modal-title-group">
                <div className="vcc-modal-badge-row">
                  <span className="vcc-code-badge-lg">
                    {selectedItem.cptCode}
                  </span>
                  <span className="vcc-specialty-tag">
                    {selectedItem.specialty}
                  </span>
                  {(() => {
                    const grade =
                      VENDOR_VALUE_GRADES[selectedItem.valueGrade] ||
                      VENDOR_VALUE_GRADES.COMPETITIVE_STANDARD;
                    return (
                      <span
                        className="vcc-grade-badge"
                        style={{
                          color: grade.color,
                          backgroundColor: grade.badgeBg,
                          borderColor: grade.badgeBorder
                        }}
                      >
                        {grade.label}
                      </span>
                    );
                  })()}
                </div>
                <h2 className="vcc-modal-title">
                  {selectedItem.procedureName} — {selectedItem.constructCategory.replace('_', ' ')}
                </h2>
              </div>
              <button
                className="vcc-modal-close"
                onClick={() => setSelectedItem(null)}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="vcc-modal-body">
              {/* Executive Metrics Bar */}
              <div className="vcc-modal-kpi-bar">
                <div className="vcc-modal-kpi">
                  <span className="vcc-modal-kpi-label">EVALUATED VENDOR</span>
                  <span className="vcc-modal-kpi-value">
                    {selectedItem.vendorName}
                  </span>
                </div>
                <div className="vcc-modal-kpi">
                  <span className="vcc-modal-kpi-label">CONSTRUCT COST</span>
                  <span className="vcc-modal-kpi-value vcc-bold-cell">
                    ${selectedItem.avgConstructCost.toLocaleString()}
                  </span>
                </div>
                <div className="vcc-modal-kpi">
                  <span className="vcc-modal-kpi-label">BENCHMARK COST</span>
                  <span className="vcc-modal-kpi-value vcc-text-emerald">
                    ${selectedItem.facilityBenchmarkCost.toLocaleString()}
                  </span>
                </div>
                <div className="vcc-modal-kpi">
                  <span className="vcc-modal-kpi-label">VARIANCE DELTA</span>
                  <span
                    className={`vcc-modal-kpi-value ${
                      selectedItem.costVarianceDollars === 0
                        ? 'vcc-text-emerald'
                        : 'vcc-text-crimson'
                    }`}
                  >
                    +${selectedItem.costVarianceDollars.toLocaleString()} (+{selectedItem.costVariancePct}%)
                  </span>
                </div>
                <div className="vcc-modal-kpi">
                  <span className="vcc-modal-kpi-label">ANNUAL SPEND</span>
                  <span className="vcc-modal-kpi-value">
                    ${selectedItem.annualSpendDollars.toLocaleString()}
                  </span>
                </div>
                <div className="vcc-modal-kpi">
                  <span className="vcc-modal-kpi-label">REALIZABLE SAVINGS</span>
                  <span className="vcc-modal-kpi-value vcc-text-emerald">
                    ${selectedItem.potentialSavingsDollars.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Head-to-Head Competing Vendor Pricing Quotes */}
              <div className="vcc-modal-card">
                <div className="vcc-modal-card-title">
                  <Scale size={18} className="vcc-icon-blue" />
                  <span>Cross-Vendor Market Quote Comparison (Identical Clinical Construct)</span>
                </div>
                <div className="vcc-benchmark-banner">
                  <div>
                    <div className="vcc-banner-title">
                      Facility Benchmark Construct: ${selectedItem.facilityBenchmarkCost.toLocaleString()}
                    </div>
                    <div className="vcc-banner-subtext">
                      Established under contracted Tier 1 commitment pricing. Any procurement above this benchmark creates unrecoverable supply expense.
                    </div>
                  </div>
                </div>

                {selectedItem.competingQuotes && (
                  <div className="vcc-modal-subtable-box">
                    <table className="vcc-subtable">
                      <thead>
                        <tr>
                          <th>Medical Device Manufacturer</th>
                          <th>Construct Acquisition Cost</th>
                          <th>Variance vs Benchmark</th>
                          <th>Contracting Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedItem.competingQuotes.map((quote, qIdx) => (
                          <tr key={qIdx}>
                            <td className="vcc-bold-cell">{quote.vendorName}</td>
                            <td>${quote.constructCost.toLocaleString()}</td>
                            <td>
                              <span
                                className={
                                  quote.varianceVsBenchmark === 0
                                    ? 'vcc-text-emerald'
                                    : 'vcc-text-crimson'
                                }
                              >
                                {quote.varianceVsBenchmark === 0
                                  ? '$0 (Benchmark)'
                                  : `+$${quote.varianceVsBenchmark.toLocaleString()}`}
                              </span>
                            </td>
                            <td>
                              <span
                                className={`vcc-badge ${
                                  quote.contractTier.includes('Tier 1')
                                    ? 'vcc-badge-emerald'
                                    : quote.contractTier.includes('Off-Contract')
                                    ? 'vcc-badge-crimson'
                                    : 'vcc-badge-blue'
                                }`}
                              >
                                {quote.contractTier}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="vcc-modal-footer">
              <button
                className="vcc-export-btn"
                onClick={() =>
                  handleExportNegotiation(
                    selectedItem.cptCode,
                    selectedItem.vendorName
                  )
                }
              >
                <FileText size={15} />
                <span>Export Price Negotiation Dossier</span>
              </button>
              <button
                className="vcc-close-btn"
                onClick={() => setSelectedItem(null)}
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
