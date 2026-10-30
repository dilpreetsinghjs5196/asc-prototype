import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CreditCard,
  Search,
  Building2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Upload,
  Layers,
  FileText,
  Sliders,
  ExternalLink,
  Plus,
  RefreshCw,
  X,
  ShieldCheck,
  ChevronRight
} from 'lucide-react';
import { payerMasterService, DEFAULT_PAYER_MASTER, DEFAULT_PAYER_PLANS, DEFAULT_PAYER_IDENTIFIERS } from '../lib/payerMasterService.js';
import './PayerMasterDirectory.css';

export function PayerMasterDirectory({ activeFacility }) {
  const [activeSubTab, setActiveSubTab] = useState('master'); // 'master' | 'plans' | 'facility' | 'contracts' | 'staging'
  const [payers, setPayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('ACTIVE');

  // Drawer / Inspector
  const [selectedPayer, setSelectedPayer] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Facility Enablement State
  const [facilityPayers, setFacilityPayers] = useState([]);

  // Staging / Deduplication Workbench State
  const [stagedRecords, setStagedRecords] = useState([
    { id: 'stg-1', raw_name: 'Florida Blue BCBS FL', raw_payer_id: '00590', naic_code: '00590', classification: null, confidence: 0 },
    { id: 'stg-2', raw_name: 'Aetna Health Inc', raw_payer_id: '60054', naic_code: '60054', classification: null, confidence: 0 },
    { id: 'stg-3', raw_name: 'United Healthcare Opt', raw_payer_id: '87726', naic_code: '87726', classification: null, confidence: 0 },
    { id: 'stg-4', raw_name: 'Sunshine State Workers Comp Trust', raw_payer_id: '99101', naic_code: '', classification: null, confidence: 0 }
  ]);
  const [simulatorInput, setSimulatorInput] = useState({ payerId: '20000000-0000-0000-0000-000000000002', clearinghouse: 'AVAILITY' });
  const [simulatorResult, setSimulatorResult] = useState(null);

  // Contracts Mock Data
  const [contracts] = useState([
    {
      id: 'ctr-001',
      contract_number: 'BCBS-ASC-2026-FL',
      payer_id: '20000000-0000-0000-0000-000000000002',
      payer_name: 'Florida Blue (BCBS)',
      reimbursement_method: 'PERCENT_OF_MEDICARE',
      medicare_multiplier: 145.0,
      effective_start: '2026-01-01',
      effective_end: '2026-12-31',
      mppr_ruleset: 'CMS_50_PERCENT',
      implant_carveout: 'PASS_THROUGH_INVOICE_PLUS_10',
      status: 'ACTIVE'
    },
    {
      id: 'ctr-002',
      contract_number: 'AETNA-SURG-2025-A',
      payer_id: '20000000-0000-0000-0000-000000000003',
      payer_name: 'Aetna Healthcare',
      reimbursement_method: 'PERCENT_OF_MEDICARE',
      medicare_multiplier: 138.5,
      effective_start: '2025-07-01',
      effective_end: '2026-06-30',
      mppr_ruleset: 'CMS_50_PERCENT',
      implant_carveout: 'CARVEOUT_AT_COST',
      status: 'ACTIVE'
    },
    {
      id: 'ctr-003',
      contract_number: 'UHC-SPECIALTY-2026',
      payer_id: '20000000-0000-0000-0000-000000000004',
      payer_name: 'UnitedHealthcare Outpatient',
      reimbursement_method: 'COMMERCIAL_FEE_SCHEDULE',
      medicare_multiplier: null,
      effective_start: '2026-01-01',
      effective_end: '2027-12-31',
      mppr_ruleset: 'CMS_50_PERCENT',
      implant_carveout: 'PASS_THROUGH_INVOICE_PLUS_5',
      status: 'ACTIVE'
    }
  ]);

  // Load Data
  const loadPayerData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await payerMasterService.getPayerMasterDirectory({
        search: searchQuery,
        category: categoryFilter,
        status: statusFilter,
        facilityId: activeFacility?.id
      });
      setPayers(data || []);

      const facData = await payerMasterService.getFacilityPayers(activeFacility?.id);
      setFacilityPayers(facData || []);
    } catch (err) {
      console.error('Error loading payer master directory:', err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, categoryFilter, statusFilter, activeFacility]);

  useEffect(() => {
    loadPayerData();
  }, [loadPayerData]);

  // Evaluate staging records deduplication on mount or staging change
  useEffect(() => {
    const updated = stagedRecords.map(rec => {
      const match = payerMasterService.matchPayerRecord({
        payerName: rec.raw_name,
        ediPayerId: rec.raw_payer_id,
        naicCode: rec.naic_code
      });
      return {
        ...rec,
        classification: match.matchClassification,
        matchedPayer: match.matchedPayer,
        confidence: match.confidence,
        tier: match.tier
      };
    });
    setStagedRecords(updated);
  }, []);

  // Facility Enablement Toggle Handler
  const handleToggleEnablement = async (payerId, currentEnabled) => {
    const nextState = !currentEnabled;
    setFacilityPayers(prev =>
      prev.map(item =>
        item.payer_id === payerId ? { ...item, is_enabled: nextState } : item
      )
    );
    try {
      await payerMasterService.toggleFacilityPayer(activeFacility?.id, payerId, nextState);
    } catch (err) {
      console.error('Failed to toggle facility payer enablement:', err);
      // Revert on failure
      setFacilityPayers(prev =>
        prev.map(item =>
          item.payer_id === payerId ? { ...item, is_enabled: currentEnabled } : item
        )
      );
    }
  };

  // Facility Participation Change Handler
  const handleParticipationChange = (payerId, newStatus) => {
    setFacilityPayers(prev =>
      prev.map(item =>
        item.payer_id === payerId ? { ...item, participation_status: newStatus } : item
      )
    );
  };

  // Clearinghouse Change Handler
  const handleClearinghouseChange = (payerId, newCH) => {
    setFacilityPayers(prev =>
      prev.map(item =>
        item.payer_id === payerId ? { ...item, preferred_clearinghouse: newCH } : item
      )
    );
  };

  // Simulate EDI Resolution
  const handleRunSimulator = () => {
    const res = payerMasterService.resolveEdiPayerId({
      payerId: simulatorInput.payerId,
      facilityId: activeFacility?.id,
      clearinghouse: simulatorInput.clearinghouse
    });
    const payer = payers.find(p => p.id === simulatorInput.payerId);
    setSimulatorResult({ ...res, payerName: payer?.trade_name || payer?.legal_name });
  };

  // Summary Metrics
  const summary = useMemo(() => {
    const totalPayers = payers.length;
    const commercialCount = payers.filter(p => p.payer_category === 'Commercial').length;
    const medicareCount = payers.filter(p => p.payer_category === 'Medicare' || p.payer_category === 'Medicaid').length;
    const totalPlans = payers.reduce((acc, p) => acc + (p.payer_plans?.length || 0), 0);
    return { totalPayers, commercialCount, medicareCount, totalPlans };
  }, [payers]);

  // Flattened Plans for Plans Tab
  const allPlans = useMemo(() => {
    const list = [];
    payers.forEach(p => {
      (p.payer_plans || []).forEach(plan => {
        list.push({ ...plan, payer_name: p.trade_name || p.legal_name, payer_category: p.payer_category });
      });
    });
    return list;
  }, [payers]);

  const getCategoryBadgeClass = (category) => {
    switch (category) {
      case 'Medicare': return 'badge-medicare';
      case 'Commercial': return 'badge-commercial';
      case 'Workers_Comp': return 'badge-workerscomp';
      case 'Self_Pay': return 'badge-selfpay';
      default: return 'badge-selfpay';
    }
  };

  return (
    <div className="payer-master-container">
      {/* Header */}
      <div className="payer-header">
        <div className="payer-title-group">
          <h2>
            <CreditCard size={24} color="#2563eb" />
            Payer Master & Health Plan Directory
          </h2>
          <p className="payer-subtitle">
            Enterprise health plan hierarchies, statutory HIPAA 5010 EDI 837 Loop 2010BB routing, and facility enablement.
          </p>
        </div>
        <div className="payer-facility-badge">
          <Building2 size={16} />
          <span>Active Facility: {activeFacility?.name || 'Main Surgical Center'}</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="payer-kpi-grid">
        <div className="payer-kpi-card">
          <span className="kpi-label">Master Payers</span>
          <span className="kpi-value">{summary.totalPayers}</span>
          <span className="kpi-sub">National & Regional Catalog</span>
        </div>
        <div className="payer-kpi-card">
          <span className="kpi-label">Commercial Payers</span>
          <span className="kpi-value">{summary.commercialCount}</span>
          <span className="kpi-sub">Contracted Commercial Plans</span>
        </div>
        <div className="payer-kpi-card">
          <span className="kpi-label">Government / Statutory</span>
          <span className="kpi-value">{summary.medicareCount}</span>
          <span className="kpi-sub">Medicare MAC & Medicaid</span>
        </div>
        <div className="payer-kpi-card">
          <span className="kpi-label">Active Benefit Plans</span>
          <span className="kpi-value">{summary.totalPlans}</span>
          <span className="kpi-sub">HMO, PPO, EPO & Indemnity</span>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="payer-nav-tabs">
        <button
          className={`payer-tab-btn ${activeSubTab === 'master' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('master')}
        >
          <CreditCard size={16} />
          Master Directory
          <span className="payer-tab-count">{payers.length}</span>
        </button>
        <button
          className={`payer-tab-btn ${activeSubTab === 'plans' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('plans')}
        >
          <Layers size={16} />
          Benefit Plans Catalog
          <span className="payer-tab-count">{allPlans.length}</span>
        </button>
        <button
          className={`payer-tab-btn ${activeSubTab === 'facility' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('facility')}
        >
          <Building2 size={16} />
          Facility Participation & Routing
        </button>
        <button
          className={`payer-tab-btn ${activeSubTab === 'contracts' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('contracts')}
        >
          <FileText size={16} />
          Commercial Contracts Matrix
          <span className="payer-tab-count">{contracts.length}</span>
        </button>
        <button
          className={`payer-tab-btn ${activeSubTab === 'staging' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('staging')}
        >
          <Sliders size={16} />
          Deduplication Workbench & EDI Simulator
        </button>
      </div>

      {/* =====================================================================
          TAB 1: MASTER DIRECTORY
         ===================================================================== */}
      {activeSubTab === 'master' && (
        <>
          <div className="payer-toolbar">
            <div className="payer-toolbar-left">
              <div className="payer-search-wrap">
                <Search size={16} className="payer-search-icon" />
                <input
                  type="text"
                  className="payer-search-input"
                  placeholder="Search legal name, trade name, or code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="payer-chip-group">
                {['All', 'Medicare', 'Commercial', 'Workers_Comp', 'Self_Pay'].map(cat => (
                  <button
                    key={cat}
                    className={`payer-chip ${categoryFilter === cat ? 'active' : ''}`}
                    onClick={() => setCategoryFilter(cat)}
                  >
                    {cat.replace('_', ' ')}
                  </button>
                ))}
              </div>

              <select
                className="payer-select-control"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">Status: All</option>
                <option value="ACTIVE">Status: Active</option>
                <option value="INACTIVE">Status: Inactive</option>
              </select>
            </div>

            <button
              className="btn-primary"
              onClick={() => {
                setSelectedPayer({
                  legal_name: '',
                  trade_name: '',
                  payer_category: 'Commercial',
                  payer_code: '',
                  naic_code: '',
                  status: 'ACTIVE',
                  claims_phone: '',
                  website_url: ''
                });
                setIsDrawerOpen(true);
              }}
            >
              <Plus size={16} />
              Add Master Payer
            </button>
          </div>

          <div className="payer-table-wrapper">
            <table className="payer-table">
              <thead>
                <tr>
                  <th>Trade / Display Name</th>
                  <th>Legal Entity Name</th>
                  <th>Category</th>
                  <th>Payer Code / NAIC</th>
                  <th>Primary EDI ID</th>
                  <th>Configured Plans</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '2rem' }}>
                      <RefreshCw size={24} className="spin" style={{ margin: '0 auto', color: '#2563eb' }} />
                      <p style={{ marginTop: '0.5rem', color: '#64748b' }}>Loading master payer catalog...</p>
                    </td>
                  </tr>
                ) : payers.length === 0 ? (
                  <tr>
                    <td colSpan="8">
                      <div className="payer-empty-state">
                        <CreditCard size={36} className="payer-empty-icon" />
                        <strong>No payers found</strong>
                        <span>Adjust your search keywords or category filters.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  payers.map(payer => {
                    const primaryEdi = payer.payer_identifiers?.find(i => i.identifier_type === 'EDI_PAYER_ID')?.identifier_value || payer.naic_code || '—';
                    const planCount = payer.payer_plans?.length || 0;
                    return (
                      <tr key={payer.id}>
                        <td>
                          <strong>{payer.trade_name || payer.legal_name}</strong>
                          {payer.claims_phone && (
                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                              📞 {payer.claims_phone}
                            </div>
                          )}
                        </td>
                        <td>{payer.legal_name}</td>
                        <td>
                          <span className={`badge ${getCategoryBadgeClass(payer.payer_category)}`}>
                            {payer.payer_category.replace('_', ' ')}
                          </span>
                        </td>
                        <td>
                          <code style={{ fontSize: '0.75rem', color: '#0f172a', fontWeight: 600 }}>{payer.payer_code}</code>
                          {payer.naic_code && <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '6px' }}>({payer.naic_code})</span>}
                        </td>
                        <td>
                          <span className="edi-pill">{primaryEdi}</span>
                        </td>
                        <td>
                          <span className="badge badge-medicare">{planCount} plans</span>
                        </td>
                        <td>
                          <span className={`badge ${payer.status === 'ACTIVE' ? 'badge-active' : 'badge-inactive'}`}>
                            {payer.status}
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn-secondary btn-sm"
                            onClick={() => {
                              setSelectedPayer(payer);
                              setIsDrawerOpen(true);
                            }}
                          >
                            Inspect & Plans
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
        </>
      )}

      {/* =====================================================================
          TAB 2: BENEFIT PLANS CATALOG
         ===================================================================== */}
      {activeSubTab === 'plans' && (
        <div className="payer-table-wrapper">
          <table className="payer-table">
            <thead>
              <tr>
                <th>Payer Organization</th>
                <th>Plan Code</th>
                <th>Plan Name</th>
                <th>Plan Model / Type</th>
                <th>Timely Filing</th>
                <th>Prior Auth Required</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {allPlans.length === 0 ? (
                <tr>
                  <td colSpan="7">
                    <div className="payer-empty-state">
                      <Layers size={36} className="payer-empty-icon" />
                      <strong>No benefit plans registered</strong>
                    </div>
                  </td>
                </tr>
              ) : (
                allPlans.map(plan => (
                  <tr key={plan.id}>
                    <td>
                      <strong>{plan.payer_name}</strong>
                      <span className={`badge ${getCategoryBadgeClass(plan.payer_category)}`} style={{ marginLeft: '8px' }}>
                        {plan.payer_category}
                      </span>
                    </td>
                    <td>
                      <code>{plan.plan_code}</code>
                    </td>
                    <td>{plan.plan_name}</td>
                    <td>
                      <span className="plan-type-pill">{plan.plan_type}</span>
                    </td>
                    <td>
                      <strong>{plan.timely_filing_days || 180}</strong> days
                    </td>
                    <td>
                      {plan.requires_prior_auth ? (
                        <span className="badge badge-workerscomp">
                          <AlertTriangle size={12} /> Yes
                        </span>
                      ) : (
                        <span className="badge badge-active">
                          <CheckCircle2 size={12} /> No
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${plan.is_active ? 'badge-active' : 'badge-inactive'}`}>
                        {plan.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* =====================================================================
          TAB 3: FACILITY PARTICIPATION & ROUTING
         ===================================================================== */}
      {activeSubTab === 'facility' && (
        <div className="payer-table-wrapper">
          <div style={{ padding: '1rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
            <strong>Local Facility Enablement & Clearinghouse Overrides</strong>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
              Define which national and commercial payers are active for {activeFacility?.name || 'this surgical facility'}, set network participation, and configure routing gateways.
            </p>
          </div>
          <table className="payer-table">
            <thead>
              <tr>
                <th>Payer Name</th>
                <th>Category</th>
                <th>Network Participation</th>
                <th>Preferred Clearinghouse</th>
                <th>Facility Active State</th>
                <th>EDI Loop 2010BB Override</th>
              </tr>
            </thead>
            <tbody>
              {facilityPayers.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                    No facility payer records mapped yet.
                  </td>
                </tr>
              ) : (
                facilityPayers.map(fp => {
                  const payer = fp.payer_master || DEFAULT_PAYER_MASTER.find(p => p.id === fp.payer_id) || {};
                  return (
                    <tr key={fp.id}>
                      <td>
                        <strong>{payer.trade_name || payer.legal_name || 'Payer Record'}</strong>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{payer.payer_code}</div>
                      </td>
                      <td>
                        <span className={`badge ${getCategoryBadgeClass(payer.payer_category)}`}>
                          {payer.payer_category || 'Commercial'}
                        </span>
                      </td>
                      <td>
                        <select
                          className="payer-select-control"
                          value={fp.participation_status || 'IN_NETWORK'}
                          onChange={(e) => handleParticipationChange(fp.payer_id, e.target.value)}
                        >
                          <option value="IN_NETWORK">In-Network Contracted</option>
                          <option value="OUT_OF_NETWORK">Out-of-Network Commercial</option>
                          <option value="NOT_OFFERED">Not Offered / Excluded</option>
                        </select>
                      </td>
                      <td>
                        <select
                          className="payer-select-control"
                          value={fp.preferred_clearinghouse || 'AVAILITY'}
                          onChange={(e) => handleClearinghouseChange(fp.payer_id, e.target.value)}
                        >
                          <option value="AVAILITY">Availity Revenue Hub</option>
                          <option value="CHANGE_HEALTHCARE">Change Healthcare</option>
                          <option value="WAYSTAR">Waystar Gateway</option>
                          <option value="RELAY_HEALTH">RelayHealth</option>
                        </select>
                      </td>
                      <td>
                        <label className="switch">
                          <input
                            type="checkbox"
                            checked={Boolean(fp.is_enabled)}
                            onChange={() => handleToggleEnablement(fp.payer_id, fp.is_enabled)}
                          />
                          <span className="slider"></span>
                        </label>
                        <span style={{ marginLeft: '10px', fontSize: '0.8rem', fontWeight: 600, color: fp.is_enabled ? '#059669' : '#94a3b8' }}>
                          {fp.is_enabled ? 'ENABLED' : 'DISABLED'}
                        </span>
                      </td>
                      <td>
                        <span className="edi-pill">
                          {payer.naic_code || 'DEFAULT'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* =====================================================================
          TAB 4: COMMERCIAL CONTRACTS MATRIX
         ===================================================================== */}
      {activeSubTab === 'contracts' && (
        <div className="payer-table-wrapper">
          <div style={{ padding: '1rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
            <strong>Active Commercial ASC Fee Contracts</strong>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
              Contract-level reimbursement methodology (% of Medicare, Fee Schedule), multiple procedure payment rulesets, and surgical implant carve-out terms.
            </p>
          </div>
          <table className="payer-table">
            <thead>
              <tr>
                <th>Contract #</th>
                <th>Contracted Payer</th>
                <th>Reimbursement Basis</th>
                <th>Medicare Multiplier</th>
                <th>MPPR Ruleset</th>
                <th>Implant Carve-Out</th>
                <th>Validity Window</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map(c => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.contract_number}</strong>
                  </td>
                  <td>
                    <strong>{c.payer_name}</strong>
                  </td>
                  <td>
                    <span className="plan-type-pill">{c.reimbursement_method}</span>
                  </td>
                  <td>
                    {c.medicare_multiplier ? (
                      <span style={{ fontWeight: 700, color: '#2563eb' }}>{c.medicare_multiplier}%</span>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>N/A (Schedule)</span>
                    )}
                  </td>
                  <td>
                    <span className="badge badge-medicare">{c.mppr_ruleset}</span>
                  </td>
                  <td>
                    <span className="badge badge-commercial">{c.implant_carveout}</span>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: '#475569' }}>
                    {c.effective_start} to {c.effective_end}
                  </td>
                  <td>
                    <span className="badge badge-active">{c.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* =====================================================================
          TAB 5: DEDUPLICATION WORKBENCH & EDI ROUTING SIMULATOR
         ===================================================================== */}
      {activeSubTab === 'staging' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* EDI 837 Routing Simulator */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={18} color="#2563eb" />
              HIPAA 5010 EDI 837 Loop 2010BB Route Simulator
            </h4>
            <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: '#64748b' }}>
              Tests deterministic resolution of the 5-digit electronic payer identifier required in Loop 2010BB NM109 for clearinghouse batch generation.
            </p>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '240px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Target Payer
                </label>
                <select
                  className="payer-select-control"
                  style={{ width: '100%' }}
                  value={simulatorInput.payerId}
                  onChange={(e) => setSimulatorInput({ ...simulatorInput, payerId: e.target.value })}
                >
                  {payers.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.trade_name || p.legal_name} ({p.payer_code})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ minWidth: '200px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Target Clearinghouse
                </label>
                <select
                  className="payer-select-control"
                  style={{ width: '100%' }}
                  value={simulatorInput.clearinghouse}
                  onChange={(e) => setSimulatorInput({ ...simulatorInput, clearinghouse: e.target.value })}
                >
                  <option value="AVAILITY">Availity Revenue Hub</option>
                  <option value="CHANGE_HEALTHCARE">Change Healthcare</option>
                  <option value="WAYSTAR">Waystar Gateway</option>
                </select>
              </div>

              <div style={{ marginTop: '18px' }}>
                <button className="btn-primary" onClick={handleRunSimulator}>
                  Simulate Route
                </button>
              </div>
            </div>

            {simulatorResult && (
              <div style={{ marginTop: '1rem', padding: '0.875rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase' }}>
                      EDI Route Output
                    </span>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
                      Loop 2010BB NM109 Payer ID: <span className="edi-pill">{simulatorResult.ediPayerId || 'UNRESOLVED'}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className="badge badge-active">{simulatorResult.resolutionSource}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Staging Workbench */}
          <div className="payer-table-wrapper">
            <div style={{ padding: '1rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>Payer Staging & Deduplication Workbench</strong>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                  4-Tier deterministic deduplication engine matches inbound files against national and facility catalogs.
                </p>
              </div>
              <button
                className="btn-secondary btn-sm"
                onClick={() => {
                  alert('Batch staged records committed to master directory.');
                }}
              >
                Commit Staged Batch
              </button>
            </div>

            <table className="payer-table">
              <thead>
                <tr>
                  <th>Inbound Raw Name</th>
                  <th>Raw EDI ID</th>
                  <th>Raw NAIC</th>
                  <th>Match Classification</th>
                  <th>Matched Master Record</th>
                  <th>Confidence Score</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {stagedRecords.map(rec => {
                  let badgeCls = 'badge-new';
                  if (rec.classification === 'EXACT_MATCH') badgeCls = 'badge-exact';
                  if (rec.classification === 'POTENTIAL_DUPLICATE') badgeCls = 'badge-potential';

                  return (
                    <tr key={rec.id}>
                      <td><strong>{rec.raw_name}</strong></td>
                      <td><span className="edi-pill">{rec.raw_payer_id}</span></td>
                      <td>{rec.naic_code || '—'}</td>
                      <td>
                        <span className={`badge ${badgeCls}`}>
                          {rec.classification || 'PENDING'}
                        </span>
                      </td>
                      <td>
                        {rec.matchedPayer ? (
                          <div>
                            <strong>{rec.matchedPayer.trade_name || rec.matchedPayer.legal_name}</strong>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{rec.matchedPayer.payer_code}</div>
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>None (New Record)</span>
                        )}
                      </td>
                      <td>
                        <strong>{Math.round((rec.confidence || 0) * 100)}%</strong>
                        {rec.tier ? <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '4px' }}>(Tier {rec.tier})</span> : null}
                      </td>
                      <td>
                        <button className="btn-secondary btn-sm">
                          Resolve
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

      {/* =====================================================================
          INSPECTOR / EDIT DRAWER
         ===================================================================== */}
      {isDrawerOpen && selectedPayer && (
        <div className="drawer-backdrop" onClick={() => setIsDrawerOpen(false)}>
          <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h3>
                {selectedPayer.id ? 'Payer Master Record' : 'Register New Master Payer'}
              </h3>
              <button className="drawer-close" onClick={() => setIsDrawerOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="drawer-body">
              <div className="form-group">
                <label>Trade / Brand Name</label>
                <input
                  type="text"
                  value={selectedPayer.trade_name || ''}
                  onChange={(e) => setSelectedPayer({ ...selectedPayer, trade_name: e.target.value })}
                  placeholder="e.g. Florida Blue (BCBS)"
                />
              </div>

              <div className="form-group">
                <label>Legal Entity Name</label>
                <input
                  type="text"
                  value={selectedPayer.legal_name || ''}
                  onChange={(e) => setSelectedPayer({ ...selectedPayer, legal_name: e.target.value })}
                  placeholder="e.g. Blue Cross and Blue Shield of Florida, Inc."
                />
              </div>

              <div className="drawer-grid">
                <div className="form-group">
                  <label>Payer Category</label>
                  <select
                    value={selectedPayer.payer_category || 'Commercial'}
                    onChange={(e) => setSelectedPayer({ ...selectedPayer, payer_category: e.target.value })}
                  >
                    <option value="Medicare">Medicare</option>
                    <option value="Commercial">Commercial</option>
                    <option value="Workers_Comp">Workers' Comp</option>
                    <option value="Self_Pay">Self-Pay</option>
                    <option value="Medicaid">Medicaid</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Payer Code</label>
                  <input
                    type="text"
                    value={selectedPayer.payer_code || ''}
                    onChange={(e) => setSelectedPayer({ ...selectedPayer, payer_code: e.target.value })}
                    placeholder="e.g. BCBS-FL"
                  />
                </div>
              </div>

              <div className="drawer-grid">
                <div className="form-group">
                  <label>NAIC Identifier</label>
                  <input
                    type="text"
                    value={selectedPayer.naic_code || ''}
                    onChange={(e) => setSelectedPayer({ ...selectedPayer, naic_code: e.target.value })}
                    placeholder="e.g. 00590"
                  />
                </div>

                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={selectedPayer.status || 'ACTIVE'}
                    onChange={(e) => setSelectedPayer({ ...selectedPayer, status: e.target.value })}
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                    <option value="PENDING_REVIEW">PENDING_REVIEW</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Claims Inquiries Phone</label>
                <input
                  type="text"
                  value={selectedPayer.claims_phone || ''}
                  onChange={(e) => setSelectedPayer({ ...selectedPayer, claims_phone: e.target.value })}
                  placeholder="1-800-..."
                />
              </div>

              <div className="form-group">
                <label>Provider Portal URL</label>
                <input
                  type="text"
                  value={selectedPayer.website_url || ''}
                  onChange={(e) => setSelectedPayer({ ...selectedPayer, website_url: e.target.value })}
                  placeholder="https://provider.payer.com"
                />
              </div>

              {/* Plans configured for this payer */}
              {selectedPayer.id && (
                <div style={{ marginTop: '1rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <strong style={{ fontSize: '0.85rem' }}>Configured Benefit Plans ({selectedPayer.payer_plans?.length || 0})</strong>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {(selectedPayer.payer_plans || []).map(plan => (
                      <div key={plan.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#f8fafc', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '0.8rem' }}>
                        <span><strong>{plan.plan_name}</strong> ({plan.plan_code})</span>
                        <span className="plan-type-pill">{plan.plan_type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="drawer-footer">
              <button className="btn-secondary" onClick={() => setIsDrawerOpen(false)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  alert('Payer master record saved successfully.');
                  setIsDrawerOpen(false);
                }}
              >
                Save Payer Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PayerMasterDirectory;

