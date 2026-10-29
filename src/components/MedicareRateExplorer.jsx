import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Scale,
  FileText,
  Building,
  RefreshCw,
  Calculator
} from 'lucide-react';
import { medicareRateService, DEFAULT_CBSA } from '../lib/medicareRateService';
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

  // Load facility settings, CBSA indices, and CMS releases
  const loadMetadata = useCallback(async () => {
    try {
      const facId = activeFacility?.id || '00000000-0000-0000-0000-000000000002';
      const [facSettings, indices, rels] = await Promise.all([
        medicareRateService.getFacilityMedicareSettings(facId),
        medicareRateService.getWageIndices(2026),
        medicareRateService.getReleases()
      ]);

      setCbsaSettings(facSettings || DEFAULT_CBSA);
      setWageIndices(indices || []);
      setReleases(rels || []);
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

      {/* Tab 3: CBSA Wage Indices */}
      {activeTab === 'cbsa' && (
        <div className="medicare-table-container">
          <table className="medicare-table">
            <thead>
              <tr>
                <th>CBSA Code</th>
                <th>Core Based Statistical Area Name</th>
                <th>State</th>
                <th style={{ textAlign: 'right' }}>Wage Index</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {wageIndices.map((w) => (
                <tr key={w.cbsa_code}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{w.cbsa_code}</td>
                  <td>{w.cbsa_name}</td>
                  <td>{w.state_code}</td>
                  <td className="currency-cell" style={{ fontWeight: 700, color: '#2563eb' }}>
                    {parseFloat(w.wage_index).toFixed(4)}
                  </td>
                  <td>
                    {w.cbsa_code === DEFAULT_CBSA.code ? (
                      <span className="pi-badge pi-badge-device">Active Facility CBSA</span>
                    ) : (
                      <span className="pi-badge pi-badge-standard">Reference</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
    </div>
  );
}
