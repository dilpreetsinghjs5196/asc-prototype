import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Scale,
  FileText,
  Building,
  RefreshCw,
  Calculator,
  ShieldCheck,
  AlertOctagon,
  CheckCircle2,
  ArrowRight
} from 'lucide-react';
import { medicareRateService, DEFAULT_CBSA } from '../lib/medicareRateService';
import { geographicWageService, CBSA_VERIFICATION_SOURCES, DEFAULT_FACILITY_CBSA } from '../lib/geographicWageService';
import './MedicareRateExplorer.css';

export default function MedicareRateExplorer({ activeFacility }) {
  const [activeTab, setActiveTab] = useState('addenda');
  const [cbsaSettings, setCbsaSettings] = useState(DEFAULT_CBSA);
  const [wageIndices, setWageIndices] = useState([]);
  const [releases, setReleases] = useState([]);

  // Catalog State for CPT/HCPCS codes
  const [rates, setRates] = useState([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [piFilter, setPiFilter] = useState('All');
  const [versionFilter, setVersionFilter] = useState('active'); // 'active' (4,335 codes), 'historical', or 'all'
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Calculator State
  const [calcCode, setCalcCode] = useState('29881');
  const [calcResult, setCalcResult] = useState(null);
  const [calcLoading, setCalcLoading] = useState(false);

  // Phase 61: Payment Indicators & Claim Rules State
  const [indicatorDefs, setIndicatorDefs] = useState([]);
  const [claimRules, setClaimRules] = useState([]);
  const [testPiCode, setTestPiCode] = useState('29881');
  const [testPiResult, setTestPiResult] = useState(null);
  const [testPiLoading, setTestPiLoading] = useState(false);

  // Phase 62: Geographic Wage Adjustment State
  const [geoHistory, setGeoHistory] = useState([]);
  const [cbsaSearch, setCbsaSearch] = useState('');
  const [cbsaStateFilter, setCbsaStateFilter] = useState('All');
  const [cbsaPage, setCbsaPage] = useState(1);
  const [cbsaPageSize] = useState(10);
  const [selectedCbsa, setSelectedCbsa] = useState(null);
  const [selectedCounties, setSelectedCounties] = useState([]);
  const [countySearch, setCountySearch] = useState('');
  const [countySearchResults, setCountySearchResults] = useState([]);
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentFeedback, setAssignmentFeedback] = useState(null);
  const [assignmentForm, setAssignmentForm] = useState({
    cbsa_code: '34940',
    cbsa_name: 'Naples-Immokalee-Marco Island, FL',
    state_code: 'FL',
    medicare_provider_number: '10-ASC02',
    effective_start_date: new Date().toISOString().split('T')[0],
    verification_source: 'CMS_PROVIDER_ENROLLMENT_855A',
    verification_document_url: 'https://medicare.gov/provider/tie-in.pdf',
    ascqr_compliant: true
  });

  // Geographic Wage Simulator State
  const [simCpt, setSimCpt] = useState('29881');
  const [simCbsa, setSimCbsa] = useState('34940');
  const [simNatRate, setSimNatRate] = useState(1650.00);
  const [simIsDev, setSimIsDev] = useState(false);
  const [simDevPct, setSimDevPct] = useState(0.35);
  const [simAscqr, setSimAscqr] = useState(true);
  const [simResult, setSimResult] = useState(null);

  // Load facility settings, CBSA indices, and CMS releases
  const loadMetadata = useCallback(async () => {
    try {
      const facId = activeFacility?.id || '00000000-0000-0000-0000-000000000002';
      const [facSettings, indices, rels, defs, rules] = await Promise.all([
        medicareRateService.getFacilityMedicareSettings(facId),
        medicareRateService.getWageIndices(2026),
        medicareRateService.getReleases(),
        medicareRateService.getIndicatorDefinitions(2026),
        medicareRateService.getIndicatorClaimRules()
      ]);

      setCbsaSettings(facSettings || DEFAULT_CBSA);
      setWageIndices(indices || []);
      setReleases(rels || []);
      setIndicatorDefs(defs || []);
      setClaimRules(rules || []);
    } catch (err) {
      console.error('Error loading Medicare metadata:', err);
    }
  }, [activeFacility]);

  // Fetch Addenda catalog rows with pagination, search, and version status
  const fetchRates = useCallback(async (searchQuery, targetPage, targetPageSize, targetPi, targetVersion) => {
    setRatesLoading(true);
    try {
      const res = await medicareRateService.getAddendaCatalog({
        search: searchQuery,
        page: targetPage,
        limit: targetPageSize,
        paymentIndicator: targetPi,
        status: targetVersion
      });
      setRates(res.items || []);
      setTotalCount(res.totalCount || 0);
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      console.error('Error fetching addenda catalog:', err);
    } finally {
      setRatesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMetadata();
  }, [loadMetadata]);

  // Trigger rate query with 250ms debounce on search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchRates(searchTerm, page, pageSize, piFilter, versionFilter);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm, page, pageSize, piFilter, versionFilter, fetchRates]);

  const handleTestIndicator = async (e) => {
    e?.preventDefault();
    if (!testPiCode.trim()) return;
    setTestPiLoading(true);
    try {
      const res = await medicareRateService.interpretIndicator(testPiCode.trim());
      setTestPiResult(res);
    } catch (err) {
      console.error('Error interpreting payment indicator:', err);
    } finally {
      setTestPiLoading(false);
    }
  };

  const handleRunCalculation = async (e) => {
    e?.preventDefault();
    setCalcLoading(true);
    try {
      const wageIdx = cbsaSettings?.wage_index || DEFAULT_CBSA.wageIndex;
      const res = await medicareRateService.resolveBaseRate({
        dos: new Date().toISOString().split('T')[0],
        code: calcCode.trim(),
        facilityId: activeFacility?.id,
        wageIndexOverride: wageIdx
      });
      setCalcResult(res);
    } catch (err) {
      console.error('Error running rate calculation:', err);
    } finally {
      setCalcLoading(false);
    }
  };

  const renderBadge = (pi) => {
    if (pi === 'J8') return <span className="pi-badge pi-badge-device">J8 Device</span>;
    if (pi === 'N1') return <span className="pi-badge pi-badge-packaged">N1 Packaged</span>;
    if (pi === 'Z2' || pi === 'K2') return <span className="pi-badge pi-badge-ancillary">{pi} Ancillary</span>;
    if (pi === 'N/A') return <span className="pi-badge pi-badge-unresolved">Non-Covered</span>;
    return <span className="pi-badge pi-badge-standard">{pi} Standard</span>;
  };

  // Helper for live wage adjustment calculation
  const computeAdjusted = (unadjusted, pi, isDev, devPct) => {
    if (pi === 'N1') return 0;
    const wage = cbsaSettings?.wage_index || DEFAULT_CBSA.wageIndex;
    if (isDev && devPct > 0) {
      const dev = unadjusted * devPct;
      const srv = unadjusted - dev;
      return dev + (srv * 0.50 * wage) + (srv * 0.50);
    }
    return (unadjusted * 0.50 * wage) + (unadjusted * 0.50);
  };

  return (
    <div className="medicare-explorer-container">
      {/* Header */}
      <div className="medicare-header">
        <div>
          <h2>
            <Scale size={24} color="#2563eb" />
            Medicare ASC Base Rate Engine & Addenda
          </h2>
          <p className="medicare-subtitle">
            Statutory 42 CFR § 416.171 Rate Resolution, Geographic Wage Adjustment & Addenda Explorer
          </p>
        </div>
        <div className="medicare-facility-chip">
          <Building size={16} color="#475569" />
          <span>{activeFacility?.name || 'Naples Surgery Center'}</span>
          <span style={{ color: '#059669', marginLeft: '4px' }}>
            (CBSA: {cbsaSettings.cbsa_code || DEFAULT_CBSA.code} • Wage Index: {cbsaSettings.wage_index || DEFAULT_CBSA.wageIndex})
          </span>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="medicare-stats-grid">
        <div className="medicare-stat-card">
          <span className="medicare-stat-label">Active CMS Release</span>
          <span className="medicare-stat-value">CY 2026 Q1</span>
          <span className="medicare-stat-sub">Rule: CMS-1830-FC Final</span>
        </div>
        <div className="medicare-stat-card">
          <span className="medicare-stat-label">ASC Conversion Factor</span>
          <span className="medicare-stat-value">$53.5140</span>
          <span className="medicare-stat-sub">+2.9% Statutory Update</span>
        </div>
        <div className="medicare-stat-card">
          <span className="medicare-stat-label">Labor / Non-Labor Share</span>
          <span className="medicare-stat-value">50% / 50%</span>
          <span className="medicare-stat-sub">Statutory Constant (42 CFR 416.172)</span>
        </div>
        <div className="medicare-stat-card">
          <span className="medicare-stat-label">ASCQR Quality Status</span>
          <span className="medicare-stat-value" style={{ color: '#059669' }}>Compliant</span>
          <span className="medicare-stat-sub">Full Rate Update (No 2% Penalty)</span>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="medicare-tabs">
        <button
          className={`medicare-tab-btn ${activeTab === 'addenda' ? 'active' : ''}`}
          onClick={() => setActiveTab('addenda')}
        >
          <FileText size={16} />
          Addenda AA & BB Catalog
        </button>
        <button
          className={`medicare-tab-btn ${activeTab === 'calculator' ? 'active' : ''}`}
          onClick={() => setActiveTab('calculator')}
        >
          <Calculator size={16} />
          Rate Resolver & Explainability
        </button>
        <button
          className={`medicare-tab-btn ${activeTab === 'cbsa' ? 'active' : ''}`}
          onClick={() => setActiveTab('cbsa')}
        >
          <Building size={16} />
          CBSA Wage Indices
        </button>
        <button
          className={`medicare-tab-btn ${activeTab === 'releases' ? 'active' : ''}`}
          onClick={() => setActiveTab('releases')}
        >
          <RefreshCw size={16} />
          CMS Releases & Transmittals
        </button>
        <button
          className={`medicare-tab-btn ${activeTab === 'indicators' ? 'active' : ''}`}
          onClick={() => setActiveTab('indicators')}
        >
          <ShieldCheck size={16} />
          Payment Indicators & Rules
        </button>
      </div>

      {/* Tab 1: Addenda Catalog */}
      {activeTab === 'addenda' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Controls Bar */}
          <div className="medicare-controls-bar">
            <div className="medicare-search-bar" style={{ flex: 1, minWidth: '260px' }}>
              <Search size={18} color="#64748b" />
              <input
                type="text"
                placeholder="Search CPT/HCPCS codes by code or description (e.g. 0101T, 29881, Cataract)..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                className="medicare-search-input"
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Version / Batch Filter */}
              <select
                value={versionFilter}
                onChange={(e) => {
                  setVersionFilter(e.target.value);
                  setPage(1);
                }}
                className="medicare-select"
                title="Select Catalog Version"
                style={{ fontWeight: 600, borderColor: versionFilter === 'active' ? '#059669' : '#cbd5e1' }}
              >
                <option value="active">Active Version (4,335 codes)</option>
                <option value="historical">Historical Version (4,656 codes)</option>
                <option value="all">All Versions (8,991 records)</option>
              </select>

              {/* Payment Indicator Filter */}
              <select
                value={piFilter}
                onChange={(e) => {
                  setPiFilter(e.target.value);
                  setPage(1);
                }}
                className="medicare-select"
                title="Filter by Payment Indicator"
              >
                <option value="All">All Payment Indicators</option>
                <option value="A2">A2 - Standard Surgical</option>
                <option value="J8">J8 - Device-Intensive</option>
                <option value="N1">N1 - Packaged ($0)</option>
                <option value="Z2">Z2 - Radiology Ancillary</option>
                <option value="K2">K2 - Drugs & Biologicals</option>
              </select>

              {/* Rows Per Page */}
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="medicare-select"
                title="Rows per page"
              >
                <option value={25}>25 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
              </select>

              {/* Total Active Badge */}
              <div className="medicare-total-pill">
                <strong>{totalCount.toLocaleString()}</strong>
                <span>
                  {versionFilter === 'active' ? 'Active Codes' : versionFilter === 'historical' ? 'Historical Codes' : 'Total Records'}
                </span>
              </div>
            </div>
          </div>

          <div className="medicare-table-container">
            <table className="medicare-table">
              <thead>
                <tr>
                  <th>CPT / HCPCS</th>
                  <th>Description</th>
                  <th>Payment Indicator</th>
                  <th>Version Status</th>
                  <th style={{ textAlign: 'right' }}>National Unadj Rate</th>
                  <th style={{ textAlign: 'right' }}>Wage-Adjusted Baseline</th>
                  <th>Methodology Notes</th>
                </tr>
              </thead>
              <tbody>
                {ratesLoading ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                      <RefreshCw size={18} className="animate-spin" style={{ display: 'inline-block', marginRight: '8px', verticalAlign: 'middle' }} />
                      Loading Medicare rate catalog...
                    </td>
                  </tr>
                ) : rates.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                      No CPT codes match the search or filter criteria.
                    </td>
                  </tr>
                ) : (
                  rates.map((r, idx) => {
                    const adjusted = computeAdjusted(
                      r.national_unadjusted_rate,
                      r.payment_indicator,
                      r.is_device_intensive,
                      r.device_offset_percentage || 0
                    );
                    const isTerminated = Boolean(r.termination_date);
                    return (
                      <tr key={`${r.code}_${r.effective_date || ''}_${idx}`}>
                        <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>
                          <span
                            style={{ cursor: 'pointer', color: '#2563eb', textDecoration: 'underline' }}
                            onClick={() => {
                              setCalcCode(r.code);
                              setActiveTab('calculator');
                            }}
                            title="Click to resolve and explain rate"
                          >
                            {r.code}
                          </span>
                        </td>
                        <td>{r.description}</td>
                        <td>{renderBadge(r.payment_indicator)}</td>
                        <td>
                          {isTerminated ? (
                            <span className="pi-badge pi-badge-packaged" title={`Terminated on ${r.termination_date}`}>
                              Superseded
                            </span>
                          ) : (
                            <span className="pi-badge pi-badge-device" title={`Effective from ${r.effective_date || '2026-05-01'}`}>
                              Active
                            </span>
                          )}
                        </td>
                        <td className="currency-cell unadjusted-rate">
                          ${r.national_unadjusted_rate.toFixed(2)}
                        </td>
                        <td className="currency-cell adjusted-rate">
                          ${adjusted.toFixed(2)}
                        </td>
                        <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                          {isTerminated ? (
                            <span style={{ color: '#94a3b8' }}>Terminated ({r.termination_date})</span>
                          ) : r.is_device_intensive ? (
                            <span>{(r.device_offset_percentage * 100).toFixed(0)}% Device Protected from Wage Index</span>
                          ) : r.payment_indicator === 'N1' ? (
                            <span>Bundled into Primary Procedure APC</span>
                          ) : (
                            <span>50% Labor Adjusted at {cbsaSettings?.wage_index || DEFAULT_CBSA.wageIndex}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalCount > 0 && (
            <div className="medicare-pagination">
              <span className="medicare-pagination-info">
                Showing <strong>{((page - 1) * pageSize) + 1}</strong> – <strong>{Math.min(page * pageSize, totalCount)}</strong> of <strong>{totalCount.toLocaleString()}</strong> codes
                {versionFilter === 'active' && <span style={{ color: '#059669', marginLeft: '6px' }}>(CY 2026 Active Catalog)</span>}
              </span>
              <div className="medicare-pagination-btns">
                <button
                  type="button"
                  className="medicare-page-btn"
                  disabled={page <= 1 || ratesLoading}
                  onClick={() => setPage(1)}
                  title="First Page"
                >
                  &laquo; First
                </button>
                <button
                  type="button"
                  className="medicare-page-btn"
                  disabled={page <= 1 || ratesLoading}
                  onClick={() => setPage(prev => Math.max(1, prev - 1))}
                  title="Previous Page"
                >
                  &lsaquo; Prev
                </button>
                <span className="medicare-page-current">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  className="medicare-page-btn"
                  disabled={page >= totalPages || ratesLoading}
                  onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                  title="Next Page"
                >
                  Next &rsaquo;
                </button>
                <button
                  type="button"
                  className="medicare-page-btn"
                  disabled={page >= totalPages || ratesLoading}
                  onClick={() => setPage(totalPages)}
                  title="Last Page"
                >
                  Last &raquo;
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Rate Calculator & Explainability */}
      {activeTab === 'calculator' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          <div className="medicare-calc-card">
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
              Deterministic Rate Resolver
            </h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
              Resolves statutory payment breakdown for any CPT code using authoritative 42 CFR 416 formulas.
            </p>
            <form onSubmit={handleRunCalculation} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <input
                type="text"
                value={calcCode}
                onChange={(e) => setCalcCode(e.target.value)}
                placeholder="Enter CPT Code (e.g. 28465)"
                style={{
                  flex: 1,
                  padding: '0.5rem 0.75rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                  fontWeight: 700
                }}
              />
              <button
                type="submit"
                disabled={calcLoading}
                style={{
                  backgroundColor: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.5rem 1rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {calcLoading ? 'Calculating...' : 'Resolve Rate'}
              </button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Quick Presets:</div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {['29881', '28465', '66984', '0101T', '12001', '73721'].map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { setCalcCode(p); }}
                    style={{
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px',
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.75rem',
                      fontFamily: 'monospace',
                      cursor: 'pointer'
                    }}
                  >
                    CPT {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {calcResult && (
            <div className="medicare-calc-card">
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                Mathematical Explainability Breakdown
              </h3>
              <div className="medicare-calc-row">
                <span>CPT / HCPCS Code:</span>
                <strong>{calcResult.code}</strong>
              </div>
              <div className="medicare-calc-row">
                <span>Payment Indicator (PI):</span>
                <span>{renderBadge(calcResult.payment_indicator)}</span>
              </div>
              <div className="medicare-calc-row">
                <span>National Unadjusted Rate:</span>
                <span className="currency-cell">${(calcResult.national_unadjusted_rate || 0).toFixed(2)}</span>
              </div>
              {calcResult.is_device_intensive && (
                <>
                  <div className="medicare-calc-row" style={{ color: '#059669' }}>
                    <span>Device Portion (100% Protected):</span>
                    <span className="currency-cell">${(calcResult.device_offset_amount || 0).toFixed(2)}</span>
                  </div>
                  <div className="medicare-calc-row">
                    <span>Non-Device Service Portion:</span>
                    <span className="currency-cell">${(calcResult.service_portion_unadjusted || 0).toFixed(2)}</span>
                  </div>
                </>
              )}
              <div className="medicare-calc-row">
                <span>Geographic Wage Index (CBSA {calcResult.cbsa_code}):</span>
                <span>{(calcResult.wage_index_applied || DEFAULT_CBSA.wageIndex).toFixed(4)}</span>
              </div>
              <div className="medicare-calc-row">
                <span>Labor Adjustment Formula:</span>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  (Rate × 50% × {calcResult.wage_index_applied}) + (Rate × 50%)
                </span>
              </div>
              <div className="medicare-calc-row medicare-calc-total">
                <span>Authoritative Base Rate:</span>
                <span>${(calcResult.wage_adjusted_rate || 0).toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: CBSA Wage Indices & Geographic Model (Phase 62) */}
      {activeTab === 'cbsa' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Active Facility Assignment Card */}
          <div className="geo-facility-card">
            <div className="geo-facility-header">
              <div>
                <h3 className="geo-title">
                  <MapPin size={20} color="#2563eb" />
                  Facility Medicare Geographic Assignment
                </h3>
                <p className="geo-desc">
                  Authoritative effective-dated CBSA configuration for {activeFacility?.name || 'Naples Surgery Center'} under 42 CFR § 416.171(b).
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  type="button"
                  className="geo-btn-primary"
                  onClick={() => {
                    setAssignmentForm({
                      cbsa_code: activeGeo.cbsa_code || '34940',
                      cbsa_name: activeGeo.cbsa_name || 'Naples-Immokalee-Marco Island, FL',
                      state_code: activeGeo.state_code || 'FL',
                      medicare_provider_number: activeGeo.medicare_provider_number || '10-ASC02',
                      effective_start_date: new Date().toISOString().split('T')[0],
                      verification_source: 'CMS_PROVIDER_ENROLLMENT_855A',
                      verification_document_url: activeGeo.verification_document_url || '',
                      ascqr_compliant: activeGeo.ascqr_compliant !== false
                    });
                    setIsAssignmentModalOpen(true);
                  }}
                >
                  <PlusCircle size={15} />
                  Update Assignment
                </button>
              </div>
            </div>

            {assignmentFeedback && (
              <div style={{
                padding: '0.75rem 1rem',
                borderRadius: '6px',
                fontSize: '0.85rem',
                fontWeight: 600,
                background: assignmentFeedback.type === 'success' ? '#ecfdf5' : '#fff1f2',
                color: assignmentFeedback.type === 'success' ? '#059669' : '#dc2626',
                border: `1px solid ${assignmentFeedback.type === 'success' ? '#a7f3d0' : '#fecdd3'}`
              }}>
                {assignmentFeedback.message}
              </div>
            )}

            <div className="geo-grid-2">
              <div className="geo-card">
                <h4 className="geo-card-title">
                  <Building size={16} color="#2563eb" />
                  Active CBSA & Provider Profile
                </h4>
                <div className="geo-key-value-list">
                  <div className="geo-kv-row">
                    <span className="geo-kv-label">Assigned CBSA:</span>
                    <span className="geo-kv-val" style={{ fontFamily: 'monospace' }}>
                      {activeGeo.cbsa_code} — {activeGeo.cbsa_name}
                    </span>
                  </div>
                  <div className="geo-kv-row">
                    <span className="geo-kv-label">Medicare Provider Number (CCN):</span>
                    <span className="geo-kv-val" style={{ fontFamily: 'monospace' }}>{activeGeo.medicare_provider_number}</span>
                  </div>
                  <div className="geo-kv-row">
                    <span className="geo-kv-label">Effective Date:</span>
                    <span className="geo-kv-val">{activeGeo.effective_start_date} to {activeGeo.effective_end_date || 'Present (Active)'}</span>
                  </div>
                  <div className="geo-kv-row">
                    <span className="geo-kv-label">ASC Quality Reporting (ASCQR):</span>
                    <span>
                      {activeGeo.ascqr_compliant !== false ? (
                        <span className="geo-badge-verified"><ShieldCheck size={12} /> Compliant (100% Rate)</span>
                      ) : (
                        <span className="geo-badge-unverified"><AlertOctagon size={12} /> Non-Compliant (-2% Penalty)</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <div className="geo-card">
                <h4 className="geo-card-title">
                  <ShieldCheck size={16} color="#059669" />
                  Verification & Audit Provenance
                </h4>
                <div className="geo-key-value-list">
                  <div className="geo-kv-row">
                    <span className="geo-kv-label">Verification Status:</span>
                    <span>
                      {activeGeo.is_verified ? (
                        <span className="geo-badge-verified"><CheckCircle2 size={12} /> Verified Authoritative</span>
                      ) : (
                        <span className="geo-badge-unverified"><AlertTriangle size={12} /> Pending Document Review</span>
                      )}
                    </span>
                  </div>
                  <div className="geo-kv-row">
                    <span className="geo-kv-label">Verification Source:</span>
                    <span className="geo-kv-val">{activeGeo.verification_source || 'CMS_PROVIDER_ENROLLMENT_855A'}</span>
                  </div>
                  <div className="geo-kv-row">
                    <span className="geo-kv-label">Applied Wage Index:</span>
                    <span className="geo-kv-val" style={{ color: '#2563eb', fontWeight: 700 }}>
                      {parseFloat(activeGeo.wage_index || 0.9412).toFixed(4)}
                    </span>
                  </div>
                  <div className="geo-kv-row">
                    <span className="geo-kv-label">Document Reference:</span>
                    <span>
                      {activeGeo.verification_document_url ? (
                        <a href={activeGeo.verification_document_url} target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', fontWeight: 600 }}>
                          Tie-In Notice <ExternalLink size={12} />
                        </a>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>None attached</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Historical Assignments Timeline */}
            {geoHistory.length > 1 && (
              <div style={{ marginTop: '0.5rem' }}>
                <h5 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Effective-Dated Assignment History
                </h5>
                <div className="medicare-table-container">
                  <table className="medicare-table">
                    <thead>
                      <tr>
                        <th>Effective Start</th>
                        <th>Effective End</th>
                        <th>CBSA Code & Title</th>
                        <th>Provider CCN</th>
                        <th>Verification</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {geoHistory.map(h => (
                        <tr key={h.id || h.effective_start_date}>
                          <td style={{ fontWeight: 600 }}>{h.effective_start_date}</td>
                          <td>{h.effective_end_date || 'Current'}</td>
                          <td>{h.cbsa_code} — {h.cbsa_name}</td>
                          <td style={{ fontFamily: 'monospace' }}>{h.medicare_provider_number}</td>
                          <td>
                            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{h.verification_source}</span>
                          </td>
                          <td>
                            {h.is_active ? (
                              <span className="pi-badge pi-badge-device">Active</span>
                            ) : (
                              <span className="pi-badge pi-badge-packaged">Superseded</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Interactive 50/50 Geographic Calculation Simulator */}
          <div className="medicare-calc-card" style={{ background: '#ffffff', borderColor: '#cbd5e1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.15rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Calculator size={18} color="#2563eb" />
                  Statutory 50/50 ASC Wage Adjustment Simulator (42 CFR § 416.171)
                </h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                  Simulates statutory Medicare ASC wage adjustment with device offset carve-out and quality penalty factors.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              <div className="geo-form-group">
                <label className="geo-form-label">Procedure Code (CPT/HCPCS):</label>
                <select
                  className="geo-form-select"
                  value={simCpt}
                  onChange={(e) => {
                    const code = e.target.value;
                    setSimCpt(code);
                    if (code === '29881') {
                      setSimNatRate(1650.00);
                      setSimIsDev(false);
                      setSimDevPct(0);
                    } else if (code === '28465') {
                      setSimNatRate(4671.46);
                      setSimIsDev(true);
                      setSimDevPct(0.35);
                    } else if (code === '45378') {
                      setSimNatRate(435.50);
                      setSimIsDev(false);
                      setSimDevPct(0);
                    } else if (code === 'K2_ASP') {
                      setSimNatRate(500.00);
                      setSimIsDev(false);
                      setSimDevPct(0);
                    } else if (code === 'N1_PKG') {
                      setSimNatRate(0.00);
                      setSimIsDev(false);
                      setSimDevPct(0);
                    }
                  }}
                >
                  <option value="29881">29881 — Knee Arthroscopy ($1,650.00)</option>
                  <option value="28465">28465 — Tarsal Fracture Repair ($4,671.46 - J8 Device)</option>
                  <option value="45378">45378 — Diagnostic Colonoscopy ($435.50)</option>
                  <option value="K2_ASP">J0135 — Adalimumab Injection (K2 Drug - $500.00)</option>
                  <option value="N1_PKG">11042 — Packaged Sub-procedure (N1 - $0.00)</option>
                </select>
              </div>

              <div className="geo-form-group">
                <label className="geo-form-label">Target CBSA Wage Index:</label>
                <select
                  className="geo-form-select"
                  value={simCbsa}
                  onChange={(e) => setSimCbsa(e.target.value)}
                >
                  {wageIndices.slice(0, 30).map(w => (
                    <option key={w.cbsa_code} value={w.cbsa_code}>
                      {w.cbsa_code} — {w.cbsa_name.split(',')[0]} ({parseFloat(w.wage_index).toFixed(4)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="geo-form-group">
                <label className="geo-form-label">National Unadjusted Rate ($):</label>
                <input
                  type="number"
                  step="0.01"
                  className="geo-form-input"
                  value={simNatRate}
                  onChange={(e) => setSimNatRate(parseFloat(e.target.value) || 0)}
                />
              </div>

              <div className="geo-form-group">
                <label className="geo-form-label">ASCQR Compliance:</label>
                <select
                  className="geo-form-select"
                  value={simAscqr ? 'compliant' : 'non_compliant'}
                  onChange={(e) => setSimAscqr(e.target.value === 'compliant')}
                >
                  <option value="compliant">Compliant (Full Statutory Rate)</option>
                  <option value="non_compliant">Non-Compliant (-2.0% Reduction Factor)</option>
                </select>
              </div>
            </div>

            {/* Live Calculation Step-by-Step Display */}
            {simResult && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                <div className="geo-step-box">
                  <span className="geo-step-title">1. National Base</span>
                  <span className="geo-step-value">${simResult.nationalUnadjustedRate.toFixed(2)}</span>
                  <span className="geo-step-note">Unadjusted Baseline</span>
                </div>
                <div className="geo-step-box">
                  <span className="geo-step-title">2. Device Offset</span>
                  <span className="geo-step-value" style={{ color: simResult.deviceOffsetAmount > 0 ? '#d97706' : '#64748b' }}>
                    ${simResult.deviceOffsetAmount.toFixed(2)}
                  </span>
                  <span className="geo-step-note">{simResult.isDeviceIntensive ? '100% Wage Protected' : 'No implant offset'}</span>
                </div>
                <div className="geo-step-box">
                  <span className="geo-step-title">3. Net Service Share</span>
                  <span className="geo-step-value">${simResult.servicePortionUnadjusted.toFixed(2)}</span>
                  <span className="geo-step-note">Subject to 50/50 Math</span>
                </div>
                <div className="geo-step-box">
                  <span className="geo-step-title">4. Adjusted Service</span>
                  <span className="geo-step-value" style={{ color: '#2563eb' }}>${simResult.servicePortionAdjusted.toFixed(2)}</span>
                  <span className="geo-step-note">Labor + Non-Labor</span>
                </div>
                <div className="geo-step-box" style={{ background: '#f8fafc', borderColor: '#2563eb' }}>
                  <span className="geo-step-title" style={{ color: '#2563eb' }}>Final Facility Rate</span>
                  <span className="geo-step-value" style={{ color: '#059669', fontSize: '1.35rem' }}>
                    ${simResult.allowableRate.toFixed(2)}
                  </span>
                  <span className="geo-step-note" style={{ color: simResult.dollarVariance >= 0 ? '#059669' : '#dc2626', fontWeight: 600 }}>
                    {simResult.dollarVariance >= 0 ? `+$${simResult.dollarVariance.toFixed(2)}` : `-$${Math.abs(simResult.dollarVariance).toFixed(2)}`} ({simResult.percentageVariance}%)
                  </span>
                </div>
              </div>
            )}

            {simResult && (
              <div style={{ fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic', background: '#f8fafc', padding: '0.5rem 0.75rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                <strong>Statutory Trace:</strong> {simResult.formulaDescription}
              </div>
            )}
          </div>

          {/* National CBSA Wage Index Table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', color: '#0f172a' }}>
                  National CBSA Wage Index Catalog (CY 2026)
                </h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                  Official CMS-1823-FC wage indices across all Core Based Statistical Areas.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <div style={{ position: 'relative', minWidth: '220px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
                  <input
                    type="text"
                    className="geo-form-input"
                    style={{ paddingLeft: '32px' }}
                    placeholder="Search code, city, state..."
                    value={cbsaSearch}
                    onChange={(e) => {
                      setCbsaSearch(e.target.value);
                      setCbsaPage(1);
                    }}
                  />
                </div>

                <select
                  className="geo-form-select"
                  value={cbsaStateFilter}
                  onChange={(e) => {
                    setCbsaStateFilter(e.target.value);
                    setCbsaPage(1);
                  }}
                >
                  <option value="All">All States</option>
                  <option value="FL">Florida (FL)</option>
                  <option value="CA">California (CA)</option>
                  <option value="NY">New York (NY)</option>
                  <option value="TX">Texas (TX)</option>
                  <option value="IL">Illinois (IL)</option>
                  <option value="GA">Georgia (GA)</option>
                </select>
              </div>
            </div>

            <div className="medicare-table-container">
              <table className="medicare-table">
                <thead>
                  <tr>
                    <th>CBSA Code</th>
                    <th>Core Based Statistical Area Name</th>
                    <th>State</th>
                    <th style={{ textAlign: 'right' }}>Wage Index</th>
                    <th>Pre-Floor</th>
                    <th>Rural Floor</th>
                    <th>Reclassified</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedCBSAs.map((w) => (
                    <tr key={w.cbsa_code}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{w.cbsa_code}</td>
                      <td>{w.cbsa_name}</td>
                      <td>{w.state_code}</td>
                      <td className="currency-cell" style={{ fontWeight: 700, color: '#2563eb' }}>
                        {parseFloat(w.wage_index).toFixed(4)}
                      </td>
                      <td style={{ fontSize: '0.82rem', color: '#64748b' }}>
                        {parseFloat(w.pre_floor_wage_index || w.wage_index).toFixed(4)}
                      </td>
                      <td>
                        {w.is_rural_floor ? (
                          <span className="pi-badge pi-badge-device">Rural Floor</span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>No</span>
                        )}
                      </td>
                      <td>
                        {w.is_reclassified ? (
                          <span className="pi-badge pi-badge-ancillary">Reclassified</span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Standard</span>
                        )}
                      </td>
                      <td>
                        {w.cbsa_code === activeGeo.cbsa_code ? (
                          <span className="pi-badge pi-badge-device">Active Facility CBSA</span>
                        ) : (
                          <span className="pi-badge pi-badge-standard">Reference</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <button
                            type="button"
                            className="geo-btn-secondary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                            onClick={() => handleSelectCbsa(w)}
                          >
                            <Eye size={12} /> Counties
                          </button>
                          <button
                            type="button"
                            className="geo-btn-secondary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: '#2563eb', borderColor: '#bfdbfe' }}
                            onClick={() => {
                              setSimCbsa(w.cbsa_code);
                              window.scrollTo({ top: 400, behavior: 'smooth' });
                            }}
                          >
                            Simulate
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* CBSA Pagination Bar */}
            <div className="medicare-pagination">
              <span className="medicare-pagination-info">
                Showing <strong>{(cbsaPage - 1) * cbsaPageSize + 1}</strong> to <strong>{Math.min(cbsaPage * cbsaPageSize, filteredCBSAs.length)}</strong> of <strong>{filteredCBSAs.length}</strong> CBSAs
              </span>
              <div className="medicare-pagination-btns">
                <button
                  type="button"
                  className="medicare-page-btn"
                  disabled={cbsaPage <= 1}
                  onClick={() => setCbsaPage(prev => Math.max(1, prev - 1))}
                >
                  Previous
                </button>
                <span className="medicare-page-current">Page {cbsaPage} of {totalCbsaPages}</span>
                <button
                  type="button"
                  className="medicare-page-btn"
                  disabled={cbsaPage >= totalCbsaPages}
                  onClick={() => setCbsaPage(prev => Math.min(totalCbsaPages, prev + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          {/* OMB Bulletin 23-01 County Crosswalk Quick Lookup */}
          <div className="geo-card" style={{ background: '#ffffff', borderColor: '#cbd5e1' }}>
            <h4 className="geo-card-title">
              <Search size={16} color="#2563eb" />
              OMB County-to-CBSA Crosswalk Lookup (OMB Bulletin No. 23-01)
            </h4>
            <p className="geo-desc">
              Search any US county or 5-digit FIPS code to verify official Medicare Core Based Statistical Area assignment.
            </p>
            <div style={{ maxWidth: '400px' }}>
              <input
                type="text"
                className="geo-form-input"
                style={{ width: '100%' }}
                placeholder="Type county name or FIPS (e.g. Collier, 12021, Miami-Dade)..."
                value={countySearch}
                onChange={(e) => handleCountySearch(e.target.value)}
              />
            </div>

            {countySearchResults.length > 0 && (
              <div className="medicare-table-container">
                <table className="medicare-table">
                  <thead>
                    <tr>
                      <th>County FIPS</th>
                      <th>County Name</th>
                      <th>State</th>
                      <th>Resolved CBSA Code</th>
                      <th>CBSA Metropolitan Title</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {countySearchResults.map((c) => (
                      <tr key={c.fips_county_code}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{c.fips_county_code}</td>
                        <td style={{ fontWeight: 600 }}>{c.county_name}</td>
                        <td>{c.state_code}</td>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2563eb' }}>{c.cbsa_code}</td>
                        <td>{c.cbsa_title}</td>
                        <td>
                          <button
                            type="button"
                            className="geo-btn-secondary"
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                            onClick={() => {
                              setSimCbsa(c.cbsa_code);
                              window.scrollTo({ top: 400, behavior: 'smooth' });
                            }}
                          >
                            Use in Simulator
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Selected CBSA Counties Drill-Down Drawer */}
            {selectedCbsa && (
              <div style={{ marginTop: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <h5 style={{ margin: 0, fontSize: '0.9rem', color: '#0f172a' }}>
                    Counties delineated in CBSA {selectedCbsa.cbsa_code} ({selectedCbsa.cbsa_name})
                  </h5>
                  <button
                    type="button"
                    className="geo-modal-close"
                    onClick={() => setSelectedCbsa(null)}
                  >
                    <X size={16} />
                  </button>
                </div>
                {selectedCounties.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {selectedCounties.map(cty => (
                      <span
                        key={cty.fips_county_code}
                        style={{
                          background: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          padding: '0.35rem 0.65rem',
                          fontSize: '0.8rem',
                          color: '#334155'
                        }}
                      >
                        <strong>{cty.county_name}</strong> ({cty.fips_county_code}) — {cty.metropolitan_flag}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                    Standard OMB single-county delineation for {selectedCbsa.cbsa_name}.
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Update Assignment Modal */}
          {isAssignmentModalOpen && (
            <div className="geo-modal-backdrop">
              <div className="geo-modal-container">
                <div className="geo-modal-header">
                  <h3>
                    <MapPin size={20} color="#2563eb" />
                    Update Facility Medicare Geographic Assignment
                  </h3>
                  <button
                    type="button"
                    className="geo-modal-close"
                    onClick={() => setIsAssignmentModalOpen(false)}
                  >
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={handleSaveAssignment} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div className="geo-form-group">
                    <label className="geo-form-label">Core Based Statistical Area (CBSA):</label>
                    <select
                      className="geo-form-select"
                      value={assignmentForm.cbsa_code}
                      onChange={(e) => {
                        const code = e.target.value;
                        const match = wageIndices.find(w => w.cbsa_code === code);
                        setAssignmentForm(prev => ({
                          ...prev,
                          cbsa_code: code,
                          cbsa_name: match ? match.cbsa_name : prev.cbsa_name,
                          state_code: match ? match.state_code : prev.state_code
                        }));
                      }}
                      required
                    >
                      {wageIndices.map(w => (
                        <option key={w.cbsa_code} value={w.cbsa_code}>
                          {w.cbsa_code} — {w.cbsa_name} ({parseFloat(w.wage_index).toFixed(4)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="geo-form-group">
                    <label className="geo-form-label">CMS Certification Number (CCN / Provider Number):</label>
                    <input
                      type="text"
                      className="geo-form-input"
                      value={assignmentForm.medicare_provider_number}
                      onChange={(e) => setAssignmentForm(prev => ({ ...prev, medicare_provider_number: e.target.value }))}
                      required
                      placeholder="e.g. 10-ASC02"
                    />
                  </div>

                  <div className="geo-form-group">
                    <label className="geo-form-label">Effective Start Date:</label>
                    <input
                      type="date"
                      className="geo-form-input"
                      value={assignmentForm.effective_start_date}
                      onChange={(e) => setAssignmentForm(prev => ({ ...prev, effective_start_date: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="geo-form-group">
                    <label className="geo-form-label">Verification Documentation Source:</label>
                    <select
                      className="geo-form-select"
                      value={assignmentForm.verification_source}
                      onChange={(e) => setAssignmentForm(prev => ({ ...prev, verification_source: e.target.value }))}
                    >
                      {CBSA_VERIFICATION_SOURCES.map(src => (
                        <option key={src.id} value={src.id}>{src.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="geo-form-group">
                    <label className="geo-form-label">Verification Document URL / Link:</label>
                    <input
                      type="url"
                      className="geo-form-input"
                      value={assignmentForm.verification_document_url}
                      onChange={(e) => setAssignmentForm(prev => ({ ...prev, verification_document_url: e.target.value }))}
                      placeholder="https://medicare.gov/provider/10-ASC02-tie-in.pdf"
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <input
                      type="checkbox"
                      id="geo_ascqr"
                      checked={assignmentForm.ascqr_compliant}
                      onChange={(e) => setAssignmentForm(prev => ({ ...prev, ascqr_compliant: e.target.checked }))}
                    />
                    <label htmlFor="geo_ascqr" style={{ fontSize: '0.85rem', color: '#0f172a', fontWeight: 600 }}>
                      Facility is ASCQR Quality Compliant (No 2.0% statutory rate penalty)
                    </label>
                  </div>

                  <div className="geo-form-actions">
                    <button
                      type="button"
                      className="geo-btn-secondary"
                      onClick={() => setIsAssignmentModalOpen(false)}
                      disabled={assignmentSaving}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="geo-btn-primary"
                      disabled={assignmentSaving}
                    >
                      {assignmentSaving ? 'Auditing & Saving...' : 'Save & Enforce CBSA Assignment'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Releases */}
      {activeTab === 'releases' && (
        <div className="medicare-table-container">
          <table className="medicare-table">
            <thead>
              <tr>
                <th>Release Year</th>
                <th>Quarter</th>
                <th>Rule Type</th>
                <th>Conversion Factor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {releases.map((rel) => (
                <tr key={rel.id || rel.release_year}>
                  <td style={{ fontWeight: 700 }}>CY {rel.release_year}</td>
                  <td>{rel.release_quarter}</td>
                  <td>{rel.rule_type}</td>
                  <td className="currency-cell">${parseFloat(rel.conversion_factor || 53.514).toFixed(4)}</td>
                  <td>
                    {rel.is_active ? (
                      <span className="pi-badge pi-badge-device">Published & Active</span>
                    ) : (
                      <span className="pi-badge pi-badge-packaged">Superseded</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 5: Payment Indicators & Claim Rules (Phase 61) */}
      {activeTab === 'indicators' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Hero Indicator KPI Summary */}
          <div className="medicare-stats-grid">
            <div className="medicare-stat-card">
              <span className="medicare-stat-label">Statutory Indicators</span>
              <strong className="medicare-stat-value" style={{ color: '#2563eb' }}>
                {indicatorDefs.length || 12} Indicators
              </strong>
              <span className="medicare-stat-sub">Addenda AA, BB & EE (CY 2026)</span>
            </div>
            <div className="medicare-stat-card">
              <span className="medicare-stat-label">Pre-Bill Claim Rules</span>
              <strong className="medicare-stat-value" style={{ color: '#059669' }}>
                {claimRules.length || 5} Active Rules
              </strong>
              <span className="medicare-stat-sub">SCRUB-20 to SCRUB-24 Active</span>
            </div>
            <div className="medicare-stat-card">
              <span className="medicare-stat-label">Inpatient-Only (IPO) Rule</span>
              <strong className="medicare-stat-value" style={{ color: '#dc2626' }}>
                Indicator C Hard Block
              </strong>
              <span className="medicare-stat-sub">42 CFR § 416.166 Fail-Closed</span>
            </div>
            <div className="medicare-stat-card">
              <span className="medicare-stat-label">Device Offset Protection</span>
              <strong className="medicare-stat-value" style={{ color: '#d97706' }}>
                Indicator J8 Protected
              </strong>
              <span className="medicare-stat-sub">Implant portion exempt from wage index</span>
            </div>
          </div>

          {/* Interactive Live Indicator Interpreter Workbench */}
          <div className="medicare-calc-card" style={{ background: '#ffffff', borderColor: '#cbd5e1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h3 style={{ margin: '0 0 0.25rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.15rem' }}>
                  <ShieldCheck size={20} color="#2563eb" />
                  Live Payment Indicator & Scrub Rule Interpreter
                </h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                  Queries authoritative RPC <code>fn_interpret_cms_indicator</code> in real time with fail-closed safety.
                </p>
              </div>
              {/* Quick Code Test Chips */}
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="medicare-tab-btn"
                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem', background: '#f1f5f9', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  onClick={() => { setTestPiCode('29881'); }}
                >
                  29881 (A2)
                </button>
                <button
                  type="button"
                  className="medicare-tab-btn"
                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem', background: '#f1f5f9', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  onClick={() => { setTestPiCode('28465'); }}
                >
                  28465 (J8)
                </button>
                <button
                  type="button"
                  className="medicare-tab-btn"
                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem', background: '#f1f5f9', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  onClick={() => { setTestPiCode('12001'); }}
                >
                  12001 (N1)
                </button>
                <button
                  type="button"
                  className="medicare-tab-btn"
                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem', background: '#fee2e2', color: '#991b1b', borderRadius: '4px', border: '1px solid #fecaca' }}
                  onClick={() => { setTestPiCode('99999'); }}
                >
                  99999 (Unlisted)
                </button>
              </div>
            </div>

            <form onSubmit={handleTestIndicator} style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Enter CPT/HCPCS code (e.g. 29881, 28465, 0101T, 99999)..."
                value={testPiCode}
                onChange={(e) => setTestPiCode(e.target.value.toUpperCase())}
                className="medicare-calc-input"
                style={{ flex: 1, minWidth: '220px' }}
              />
              <button type="submit" disabled={testPiLoading} className="medicare-calc-btn">
                {testPiLoading ? 'Interpreting...' : 'Interpret Indicator (Live RPC)'}
              </button>
            </form>

            {testPiResult && (
              <div style={{ marginTop: '1rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>CPT / HCPCS Code</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>{testPiResult.code}</div>
                    <div style={{ fontSize: '0.8rem', color: '#475569' }}>{testPiResult.short_name}</div>
                  </div>

                  <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Payment Indicator</div>
                    <div style={{ marginTop: '0.25rem' }}>{renderBadge(testPiResult.indicator_code)}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Addendum: {testPiResult.addendum_source || 'AA'}</div>
                  </div>

                  <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Coverage & Methodology</div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: testPiResult.is_covered ? '#059669' : '#dc2626' }}>
                      {testPiResult.coverage_category}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{testPiResult.payment_methodology}</div>
                  </div>

                  <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Pre-Bill Claim Action</div>
                    <div style={{ marginTop: '0.25rem' }}>
                      {testPiResult.claim_scrub_action === 'BLOCK_FATAL' ? (
                        <span className="pi-badge pi-badge-unresolved" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                          <AlertOctagon size={12} /> FATAL CLAIM BLOCK
                        </span>
                      ) : testPiResult.claim_scrub_action === 'CHECK_DEVICE' ? (
                        <span className="pi-badge pi-badge-device" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                          <CheckCircle2 size={12} /> CHECK DEVICE C-CODE
                        </span>
                      ) : testPiResult.claim_scrub_action === 'BUNDLE_APC' ? (
                        <span className="pi-badge pi-badge-packaged" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                          PACKAGED APC
                        </span>
                      ) : (
                        <span className="pi-badge pi-badge-standard" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                          <CheckCircle2 size={12} /> ALLOW CLAIM LINE
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Rule: {testPiResult.scrub_rule_code}</div>
                  </div>
                </div>

                <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: '#f1f5f9', borderRadius: '4px', fontSize: '0.78rem', color: '#475569', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span><strong>Statutory Citation:</strong> {testPiResult.statutory_citation || '42 CFR 416.166'} • <strong>Release:</strong> {testPiResult.release_label}</span>
                  {testPiResult.is_covered && (
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                      onClick={() => {
                        setCalcCode(testPiResult.code);
                        setActiveTab('calculator');
                      }}
                    >
                      Open in Rate Resolver <ArrowRight size={14} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Statutory Indicator Directory Table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>CMS Payment Indicator Reference Catalog</h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
              Statutory ASC payment methodology rules established under 42 CFR § 416.166 and Addenda AA, BB & EE.
            </p>
            <div className="medicare-table-container">
              <table className="medicare-table">
                <thead>
                  <tr>
                    <th>Indicator</th>
                    <th>Short Description</th>
                    <th>Addendum</th>
                    <th>Coverage Category</th>
                    <th>Payment Methodology</th>
                    <th>MPPR</th>
                    <th>Device Intensive</th>
                    <th>Catalog Action</th>
                  </tr>
                </thead>
                <tbody>
                  {indicatorDefs.map((d) => (
                    <tr key={d.indicator_code}>
                      <td>{renderBadge(d.indicator_code)}</td>
                      <td style={{ fontWeight: 600 }}>{d.short_name}</td>
                      <td>Addendum {d.addendum_source}</td>
                      <td>
                        <span style={{ color: d.coverage_category === 'Covered_Surgical' ? '#059669' : d.coverage_category === 'Inpatient_Only' ? '#dc2626' : '#475569', fontWeight: 600 }}>
                          {d.coverage_category}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>{d.payment_methodology}</td>
                      <td>{d.is_mppr_eligible ? 'Yes (50%)' : 'Exempt'}</td>
                      <td>{d.is_device_intensive ? 'Yes (Offset Protected)' : 'No'}</td>
                      <td>
                        <button
                          type="button"
                          className="medicare-tab-btn"
                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '4px' }}
                          onClick={() => {
                            setPiFilter(d.indicator_code);
                            setActiveTab('addenda');
                          }}
                        >
                          Filter Catalog
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pre-Bill Claim Scrubbing Rules Engine Table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>Pre-Bill Claim Scrubbing Rules Engine</h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
              Automated compliance validators deployed in Migration 037 enforcing statutory CMS billing constraints.
            </p>
            <div className="medicare-table-container">
              <table className="medicare-table">
                <thead>
                  <tr>
                    <th>Rule ID</th>
                    <th>Indicator</th>
                    <th>Severity</th>
                    <th>Rule Description</th>
                    <th>Remediation Guidance</th>
                  </tr>
                </thead>
                <tbody>
                  {claimRules.map((cr) => (
                    <tr key={cr.rule_identifier}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2563eb' }}>{cr.rule_identifier}</td>
                      <td>{renderBadge(cr.indicator_code)}</td>
                      <td>
                        <span className={cr.severity === 'FATAL' ? 'pi-badge pi-badge-unresolved' : 'pi-badge pi-badge-ancillary'}>
                          {cr.severity}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.85rem', fontWeight: 600 }}>{cr.rule_description}</td>
                      <td style={{ fontSize: '0.82rem', color: '#475569' }}>{cr.remediation_guidance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
