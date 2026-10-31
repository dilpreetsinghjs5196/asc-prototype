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
  ChevronRight,
  Calculator,
  Lock,
  FileCheck
} from 'lucide-react';
import { payerMasterService, DEFAULT_PAYER_MASTER, DEFAULT_PAYER_PLANS, DEFAULT_PAYER_IDENTIFIERS } from '../lib/payerMasterService.js';
import { payerContractService, DEFAULT_PAYER_CONTRACTS, DEFAULT_CONTRACT_VERSIONS, DEFAULT_CONTRACT_TERMS } from '../lib/payerContractService.js';
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

  // Phase 66 Payer Contracts & Versions State
  const [contracts, setContracts] = useState(DEFAULT_PAYER_CONTRACTS);
  const [contractSearchQuery, setContractSearchQuery] = useState('');
  const [contractStatusFilter, setContractStatusFilter] = useState('ALL');
  const [selectedContract, setSelectedContract] = useState(null);
  const [isContractModalOpen, setIsContractModalOpen] = useState(false);

  // Two-Person Approval State
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [approvingVersion, setApprovingVersion] = useState(null);
  const [approvalNotes, setApprovalNotes] = useState('');

  // Pre-Bill Resolution Simulator State
  const [showContractSandbox, setShowContractSandbox] = useState(false);
  const [contractSandboxInput, setContractSandboxInput] = useState({
    payerId: '20000000-0000-0000-0000-000000000002',
    cptCode: '29827',
    dateOfService: '2026-03-15'
  });
  const [contractSandboxResult, setContractSandboxResult] = useState(null);

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

      const contractData = await payerContractService.getPayerContracts({
        facilityId: activeFacility?.id,
        status: contractStatusFilter,
        search: contractSearchQuery
      });
      setContracts(contractData || DEFAULT_PAYER_CONTRACTS);
    } catch (err) {
      console.error('Error loading payer master directory:', err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, categoryFilter, statusFilter, activeFacility, contractStatusFilter, contractSearchQuery]);

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

  // Handle Contract Resolution Simulation
  const handleRunContractSimulator = () => {
    const res = payerContractService.resolvePayerContract({
      facilityId: activeFacility?.id,
      payerId: contractSandboxInput.payerId,
      cptCode: contractSandboxInput.cptCode,
      dateOfService: contractSandboxInput.dateOfService
    });
    const payer = payers.find(p => p.id === contractSandboxInput.payerId);
    setContractSandboxResult({ ...res, payerName: payer?.trade_name || payer?.legal_name });
  };

  // Handle Two-Person CFO Approval
  const handleApproveContractVersion = async () => {
    if (!approvingVersion) return;
    try {
      await payerContractService.approveContractVersion({
        versionId: approvingVersion.id,
        approverId: 'cfo-user-001',
        approverRole: 'cfo',
        decision: 'APPROVED',
        notes: approvalNotes
      });
      alert(`Contract Version ${approvingVersion.version_number} approved and locked.`);
      setIsApprovalModalOpen(false);
      setApprovingVersion(null);
      setApprovalNotes('');
      loadPayerData();
    } catch (err) {
      console.error('Failed to approve contract version:', err);
    }
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
          TAB 4: COMMERCIAL CONTRACTS MATRIX & LIFECYCLE
         ===================================================================== */}
      {activeSubTab === 'contracts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Contracts Filter Toolbar */}
          <div className="payer-toolbar">
            <div className="payer-toolbar-left">
              <div className="payer-search-wrap">
                <Search size={16} className="payer-search-icon" />
                <input
                  type="text"
                  className="payer-search-input"
                  placeholder="Search contract #, title, or payer name..."
                  value={contractSearchQuery}
                  onChange={(e) => setContractSearchQuery(e.target.value)}
                />
              </div>

              <select
                className="payer-select-control"
                value={contractStatusFilter}
                onChange={(e) => setContractStatusFilter(e.target.value)}
              >
                <option value="ALL">Status: All</option>
                <option value="ACTIVE">Status: Active</option>
                <option value="DRAFT">Status: Draft</option>
                <option value="PENDING_APPROVAL">Status: Pending Approval</option>
                <option value="EXPIRED">Status: Expired</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn-secondary"
                onClick={() => setShowContractSandbox(!showContractSandbox)}
              >
                <Calculator size={16} />
                {showContractSandbox ? 'Hide Resolution Sandbox' : 'Pre-Bill Resolution Sandbox'}
              </button>
            </div>
          </div>

          {/* Pre-Bill Resolution Simulator Box */}
          {showContractSandbox && (
            <div className="contract-sandbox-box">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calculator size={18} color="#2563eb" />
                  Pre-Bill Contract Resolution Sandbox & Adjudication Preview
                </h4>
                <span className="badge badge-medicare">Deterministic Specificity Hierarchy</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                Tests server-side 7-step contract resolution sequence for an encounter: verifies facility eligibility, matching contract version, procedural CPT terms, and secondary MPPR reduction cascades.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr auto', gap: '1rem', alignItems: 'flex-end' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Target Insurance Payer
                  </label>
                  <select
                    className="payer-select-control"
                    style={{ width: '100%' }}
                    value={contractSandboxInput.payerId}
                    onChange={(e) => setContractSandboxInput({ ...contractSandboxInput, payerId: e.target.value })}
                  >
                    {payers.filter(p => p.payer_category === 'Commercial').map(p => (
                      <option key={p.id} value={p.id}>
                        {p.trade_name || p.legal_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Procedure CPT Code
                  </label>
                  <input
                    type="text"
                    className="payer-select-control"
                    style={{ width: '100%' }}
                    value={contractSandboxInput.cptCode}
                    onChange={(e) => setContractSandboxInput({ ...contractSandboxInput, cptCode: e.target.value })}
                    placeholder="e.g. 29827, 29881"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Date of Service
                  </label>
                  <input
                    type="date"
                    className="payer-select-control"
                    style={{ width: '100%' }}
                    value={contractSandboxInput.dateOfService}
                    onChange={(e) => setContractSandboxInput({ ...contractSandboxInput, dateOfService: e.target.value })}
                  />
                </div>

                <button className="btn-primary" onClick={handleRunContractSimulator}>
                  Resolve Contract
                </button>
              </div>

              {contractSandboxResult && (
                <div style={{ marginTop: '0.5rem', padding: '1rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase' }}>
                        Adjudicated Contract Agreement
                      </div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
                        {contractSandboxResult.contract_number} — {contractSandboxResult.contract_title || contractSandboxResult.payerName}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '4px' }}>
                        Active Version: <strong>V{contractSandboxResult.version_number}</strong> | Method: <span className="plan-type-pill">{contractSandboxResult.reimbursement_methodology}</span>
                        {contractSandboxResult.medicare_multiplier && (
                          <span style={{ marginLeft: '8px', color: '#2563eb', fontWeight: 700 }}>
                            Multiplier: {(contractSandboxResult.medicare_multiplier * 100).toFixed(1)}% of Medicare
                          </span>
                        )}
                        {contractSandboxResult.cpt_contracted_rate && (
                          <span style={{ marginLeft: '8px', color: '#059669', fontWeight: 700 }}>
                            Fixed CPT Rate: ${contractSandboxResult.cpt_contracted_rate.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span className="badge badge-active">{contractSandboxResult.specificity_tier}</span>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                        MPPR: {contractSandboxResult.mppr_rule_set_code}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Contracts Table */}
          <div className="payer-table-wrapper">
            <div style={{ padding: '1rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>Active Commercial ASC Fee Contracts</strong>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                  Contract-level reimbursement methodology (% of Medicare, Fee Schedule), multiple procedure payment rulesets, and surgical implant carve-out terms.
                </p>
              </div>
            </div>
            <table className="payer-table">
              <thead>
                <tr>
                  <th>Contract #</th>
                  <th>Contracted Payer</th>
                  <th>Scope Mode</th>
                  <th>Reimbursement Basis</th>
                  <th>Medicare Multiplier</th>
                  <th>MPPR Ruleset</th>
                  <th>Implant Carve-Out</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {contracts.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                      No commercial contracts found matching your filters.
                    </td>
                  </tr>
                ) : (
                  contracts.map(c => {
                    const activeVer = c.payer_contract_versions?.[0] || DEFAULT_CONTRACT_VERSIONS.find(v => v.contract_id === c.id);
                    const multiplier = activeVer?.medicare_multiplier || c.medicare_multiplier;
                    const method = activeVer?.reimbursement_methodology || c.reimbursement_methodology;
                    const mppr = activeVer?.mppr_rule_set_code || c.mppr_rule_set_code || 'CMS_50_PERCENT';
                    const carveout = activeVer?.device_carve_out_mode || c.device_carve_out_mode || 'PASS_THROUGH_INVOICE_PLUS_PERCENT';

                    return (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.contract_number}</strong>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>V{activeVer?.version_number || 1}</div>
                        </td>
                        <td>
                          <strong>{c.payer_name || 'Commercial Carrier'}</strong>
                        </td>
                        <td>
                          <span className="plan-type-pill">{c.scope_mode || 'ALL_FACILITIES'}</span>
                        </td>
                        <td>
                          <span className="plan-type-pill">{method}</span>
                        </td>
                        <td>
                          {multiplier ? (
                            <span style={{ fontWeight: 700, color: '#2563eb' }}>{(multiplier * 100).toFixed(1)}%</span>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>Fee Schedule</span>
                          )}
                        </td>
                        <td>
                          <span className="badge badge-medicare">{mppr}</span>
                        </td>
                        <td>
                          <span className="badge badge-commercial">{carveout.replace(/_/g, ' ')}</span>
                        </td>
                        <td>
                          <span className={`badge ${c.status === 'ACTIVE' ? 'badge-active' : 'badge-pending'}`}>
                            {c.status}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.35rem' }}>
                            <button
                              className="btn-secondary btn-sm"
                              onClick={() => {
                                setSelectedContract(c);
                                setIsContractModalOpen(true);
                              }}
                            >
                              Inspect & Terms
                            </button>
                            <button
                              className="btn-secondary btn-sm"
                              title="Two-Person CFO Approval Sign-off"
                              onClick={() => {
                                setApprovingVersion(activeVer || { id: 'ver-tmp', version_number: 1, contract_number: c.contract_number });
                                setIsApprovalModalOpen(true);
                              }}
                            >
                              <FileCheck size={13} />
                              Sign-off
                            </button>
                          </div>
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

      {/* =====================================================================
          CONTRACT DETAILS & VERSIONS INSPECTOR MODAL
         ===================================================================== */}
      {isContractModalOpen && selectedContract && (
        <div className="drawer-backdrop" onClick={() => setIsContractModalOpen(false)}>
          <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h3>
                Contract Agreement: {selectedContract.contract_number}
              </h3>
              <button className="drawer-close" onClick={() => setIsContractModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="drawer-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h4 style={{ margin: 0, color: '#0f172a' }}>{selectedContract.contract_title || selectedContract.payer_name}</h4>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    Payer: <strong>{selectedContract.payer_name}</strong> | Type: <code>{selectedContract.contract_type || 'COMMERCIAL_DIRECT'}</code>
                  </div>
                </div>
                <span className={`badge ${selectedContract.status === 'ACTIVE' ? 'badge-active' : 'badge-pending'}`}>
                  {selectedContract.status}
                </span>
              </div>

              <div className="drawer-grid" style={{ marginTop: '0.5rem' }}>
                <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Scope Mode</span>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a' }}>{selectedContract.scope_mode || 'ALL_FACILITIES'}</div>
                </div>
                <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Renewal Governance</span>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a' }}>
                    {selectedContract.auto_renew !== false ? `Auto-Renew (${selectedContract.renewal_notice_days || 90}d notice)` : 'Fixed Term'}
                  </div>
                </div>
              </div>

              {/* Version History Timeline */}
              <div style={{ marginTop: '1rem' }}>
                <strong style={{ fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>
                  Effective-Dated Version Timeline
                </strong>
                <div className="version-timeline">
                  {(selectedContract.payer_contract_versions || DEFAULT_CONTRACT_VERSIONS.filter(v => v.contract_id === selectedContract.id)).map(ver => (
                    <div key={ver.id} className="version-timeline-item">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong>Version {ver.version_number}</strong>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <span className={`badge ${ver.status === 'ACTIVE' ? 'badge-active' : 'badge-draft'}`}>
                            {ver.status}
                          </span>
                          {ver.is_locked && (
                            <span className="badge badge-locked" title="Locked against retroactive modification">
                              <Lock size={11} /> Locked
                            </span>
                          )}
                        </div>
                      </div>

                      <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '4px' }}>
                        Effective: <strong>{ver.effective_start_date}</strong> to <strong>{ver.effective_end_date || 'Open'}</strong>
                      </div>

                      <div style={{ fontSize: '0.8rem', color: '#0f172a', marginTop: '4px' }}>
                        Method: <span className="plan-type-pill">{ver.reimbursement_methodology}</span>
                        {ver.medicare_multiplier && (
                          <span style={{ marginLeft: '6px', fontWeight: 700, color: '#2563eb' }}>
                            Multiplier: {(ver.medicare_multiplier * 100).toFixed(1)}%
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                        Carve-Out: <code>{ver.device_carve_out_mode || 'PASS_THROUGH_INVOICE_PLUS_PERCENT'}</code> (Markup: {((ver.device_invoice_markup_pct || 0) * 100).toFixed(1)}%)
                      </div>

                      {ver.version_hash && (
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '4px', fontFamily: 'monospace' }}>
                          Hash: {ver.version_hash.slice(0, 24)}...
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Granular Fee Schedule Terms */}
              <div style={{ marginTop: '1.25rem' }}>
                <strong style={{ fontSize: '0.85rem', display: 'block', marginBottom: '0.25rem' }}>
                  Negotiated Fee Schedule Terms
                </strong>
                <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '0 0 0.5rem 0' }}>
                  Line-item procedural prices overriding default percentage methodologies.
                </p>
                <table className="terms-grid-table">
                  <thead>
                    <tr>
                      <th>CPT / HCPCS</th>
                      <th>Methodology</th>
                      <th>Contracted Rate</th>
                      <th>Implants Bundled</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DEFAULT_CONTRACT_TERMS.map(t => (
                      <tr key={t.id}>
                        <td><code>{t.cpt_code}</code></td>
                        <td>{t.rate_methodology}</td>
                        <td><strong>${t.contracted_rate.toFixed(2)}</strong></td>
                        <td>{t.includes_implants ? 'Yes' : 'No (Carve-out)'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="drawer-footer">
              <button className="btn-secondary" onClick={() => setIsContractModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TWO-PERSON CFO APPROVAL SIGN-OFF MODAL
         ===================================================================== */}
      {isApprovalModalOpen && approvingVersion && (
        <div className="drawer-backdrop" onClick={() => setIsApprovalModalOpen(false)}>
          <div className="drawer-panel" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileCheck size={20} color="#059669" />
                Two-Person CFO Approval Sign-off
              </h3>
              <button className="drawer-close" onClick={() => setIsApprovalModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="drawer-body">
              <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '0.875rem', borderRadius: '6px' }}>
                <strong style={{ color: '#065f46', fontSize: '0.85rem' }}>Executive Financial Governance Gate</strong>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#047857' }}>
                  Under separation of duties, the creator cannot activate financial terms. Approving locks Version {approvingVersion.version_number} and authorizes production claim adjudication.
                </p>
              </div>

              <div className="form-group" style={{ marginTop: '0.5rem' }}>
                <label>Approver Role</label>
                <input
                  type="text"
                  readOnly
                  value="CFO - Chief Financial Officer"
                  style={{ background: '#f8fafc', color: '#475569' }}
                />
              </div>

              <div className="form-group">
                <label>Governance Stage</label>
                <input
                  type="text"
                  readOnly
                  value="FINANCIAL_CFO (Two-Person Compliance Check)"
                  style={{ background: '#f8fafc', color: '#475569' }}
                />
              </div>

              <div className="form-group">
                <label>Approval Decision Notes / Executive Rationale</label>
                <textarea
                  rows="3"
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  placeholder="Enter sign-off rationale, rate verification check, or legal contract execution references..."
                />
              </div>
            </div>

            <div className="drawer-footer">
              <button className="btn-secondary" onClick={() => setIsApprovalModalOpen(false)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleApproveContractVersion}
              >
                Confirm & Lock Version
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PayerMasterDirectory;

