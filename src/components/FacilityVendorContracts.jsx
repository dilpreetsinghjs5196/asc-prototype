import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText, Plus, Search, CheckCircle2, AlertTriangle, Clock,
  Ban, ShieldCheck, Trash2, Edit3, Layers, AlertCircle, X,
  FileCheck, Check
} from 'lucide-react';
import {
  contractService,
  CONTRACT_TYPES,
  CONTRACT_STATUSES,
  SCOPE_TYPES
} from '../lib/contractService';
import { vendorService } from '../lib/vendorService';
import { implantService } from '../lib/implantService';
import './FacilityVendorContracts.css';

export default function FacilityVendorContracts({
  activeFacility = null,
  userPermissions = []
}) {
  const facilityId = activeFacility?.id || '00000000-0000-0000-0000-000000000002';
  
  const canManage = userPermissions.includes('admin') ||
    userPermissions.includes('implants.manage_contracts') ||
    userPermissions.includes('super_admin');

  const canViewCosts = userPermissions.includes('admin') ||
    userPermissions.includes('implants.view_costs') ||
    userPermissions.includes('cfo') ||
    userPermissions.includes('super_admin');

  // Primary Data State
  const [contracts, setContracts] = useState([]);
  const [metrics, setMetrics] = useState({
    totalCount: 0,
    activeCount: 0,
    pendingApprovalCount: 0,
    expiringWithin60DaysCount: 0,
    totalVolumeCommitment: 0
  });
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState(null);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [expiringSoonOnly, setExpiringSoonOnly] = useState(false);

  // Reference Dropdowns
  const [vendorsList, setVendorsList] = useState([]);
  const [componentsList, setComponentsList] = useState([]);

  // Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [isScopeModalOpen, setIsScopeModalOpen] = useState(false);
  const [isAmendmentModalOpen, setIsAmendmentModalOpen] = useState(false);
  const [isSimulatorModalOpen, setIsSimulatorModalOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState(null);

  // Form State: Contract Draft
  const [formData, setFormData] = useState({
    contract_number: '',
    contract_name: '',
    vendor_id: '',
    contract_type: 'DIRECT_OEM',
    effective_from: new Date().toISOString().split('T')[0],
    effective_to: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
    auto_renew: true,
    renewal_notice_days: 60,
    gpo_affiliation: 'Vizient',
    payment_terms_days: 30,
    prompt_pay_discount_percent: 2.00,
    prompt_pay_days: 10,
    fob_point: 'DESTINATION',
    freight_terms: 'PREPAID',
    is_consignment: true,
    consignment_reconciliation_frequency: 'MONTHLY',
    annual_volume_commitment_amount: 250000,
    has_rebate_terms: false,
    rebate_structure_type: 'NONE',
    rebate_percentage: 0,
    notes: ''
  });

  // Form State: Review / Approval
  const [reviewRationale, setReviewRationale] = useState('');
  const [reviewError, setReviewError] = useState('');

  // Form State: Amendment
  const [amendmentRationale, setAmendmentRationale] = useState('');

  // Form State: Scope Builder
  const [newScope, setNewScope] = useState({
    scope_type: 'COMPONENT',
    component_id: '',
    specialty: 'Orthopedics',
    is_consignment_covered: true,
    is_excluded: false,
    exclusion_reason: '',
    tier_discount_percent: 10.00
  });

  // Form State: Simulator
  const [simVendorId, setSimVendorId] = useState('');
  const [simComponentId, setSimComponentId] = useState('');
  const [simDate, setSimDate] = useState(new Date().toISOString().split('T')[0]);
  const [simResult, setSimResult] = useState(null);

  // Load Reference Data
  useEffect(() => {
    async function loadReferenceData() {
      let vLoaded = [];
      let cLoaded = [];
      try {
        if (vendorService?.getVendors) {
          const vRes = await vendorService.getVendors({ limit: 100 });
          const vList = vRes?.vendors || vRes?.items || (Array.isArray(vRes) ? vRes : []);
          if (vList.length > 0) vLoaded = vList;
        }
        if (implantService?.getComponents) {
          const cRes = await implantService.getComponents();
          const cList = cRes?.components || cRes?.items || (Array.isArray(cRes) ? cRes : []);
          if (cList.length > 0) cLoaded = cList;
        }
      } catch {
        // Fallback default mock lists if service unavailable
      }

      if (vLoaded.length === 0) {
        vLoaded = [
          { id: '00000000-0000-0000-0053-000000000001', vendor_code: 'STRYKER', display_name: 'Stryker Orthopaedics' },
          { id: '00000000-0000-0000-0053-000000000002', vendor_code: 'ZIMMER_BIOMET', display_name: 'Zimmer Biomet' },
          { id: '00000000-0000-0000-0053-000000000003', vendor_code: 'DEPUY_SYNTHES', display_name: 'DePuy Synthes' }
        ];
      }
      if (cLoaded.length === 0) {
        cLoaded = [
          { id: '00000000-0000-0000-0051-000000000010', code: 'KNEE_FEMORAL', name: 'Femoral Knee Component' },
          { id: '00000000-0000-0000-0051-000000000011', code: 'KNEE_TIBIAL', name: 'Tibial Knee Component' },
          { id: '00000000-0000-0000-0051-000000000020', code: 'HIP_STEM', name: 'Femoral Hip Stem' }
        ];
      }

      setVendorsList(vLoaded);
      setComponentsList(cLoaded);
      setFormData((prev) => ({ ...prev, vendor_id: prev.vendor_id || vLoaded[0]?.id || '' }));
      setSimVendorId((prev) => prev || vLoaded[0]?.id || '');
      setSimComponentId((prev) => prev || cLoaded[0]?.id || '');
    }
    loadReferenceData();
  }, []);

  // Load Contracts
  const fetchContracts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await contractService.getContracts({
        facilityId,
        vendorId: selectedVendorId || null,
        status: selectedStatus || null,
        contractType: selectedType || null,
        isExpiringSoon: expiringSoonOnly,
        search: searchQuery
      });
      setContracts(res.items || []);
      setMetrics(res.metrics || {});
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }, [facilityId, selectedVendorId, selectedStatus, selectedType, expiringSoonOnly, searchQuery]);

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  // Open Edit/Create Modal
  const handleOpenCreate = () => {
    setFormData({
      contract_number: '',
      contract_name: '',
      vendor_id: vendorsList[0]?.id || '',
      contract_type: 'DIRECT_OEM',
      effective_from: new Date().toISOString().split('T')[0],
      effective_to: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
      auto_renew: true,
      renewal_notice_days: 60,
      gpo_affiliation: 'Vizient',
      payment_terms_days: 30,
      prompt_pay_discount_percent: 2.00,
      prompt_pay_days: 10,
      fob_point: 'DESTINATION',
      freight_terms: 'PREPAID',
      is_consignment: true,
      consignment_reconciliation_frequency: 'MONTHLY',
      annual_volume_commitment_amount: 250000,
      has_rebate_terms: false,
      rebate_structure_type: 'NONE',
      rebate_percentage: 0,
      notes: ''
    });
    setSelectedContract(null);
    setIsEditModalOpen(true);
  };

  const handleOpenEdit = (contract) => {
    setSelectedContract(contract);
    setFormData({
      id: contract.id,
      contract_number: contract.contract_number,
      contract_name: contract.contract_name,
      vendor_id: contract.vendor_id,
      contract_type: contract.contract_type || 'DIRECT_OEM',
      effective_from: contract.effective_from,
      effective_to: contract.effective_to,
      auto_renew: contract.auto_renew ?? true,
      renewal_notice_days: contract.renewal_notice_days || 60,
      gpo_affiliation: contract.gpo_affiliation || '',
      payment_terms_days: contract.payment_terms_days || 30,
      prompt_pay_discount_percent: contract.prompt_pay_discount_percent || 0,
      prompt_pay_days: contract.prompt_pay_days || 10,
      fob_point: contract.fob_point || 'DESTINATION',
      freight_terms: contract.freight_terms || 'PREPAID',
      is_consignment: contract.is_consignment ?? true,
      consignment_reconciliation_frequency: contract.consignment_reconciliation_frequency || 'MONTHLY',
      annual_volume_commitment_amount: contract.annual_volume_commitment_amount || 0,
      has_rebate_terms: contract.has_rebate_terms ?? false,
      rebate_structure_type: contract.rebate_structure_type || 'NONE',
      rebate_percentage: contract.rebate_percentage || 0,
      notes: contract.notes || ''
    });
    setIsEditModalOpen(true);
  };

  // Save Contract Draft
  const handleSaveContract = async (e) => {
    e.preventDefault();
    try {
      await contractService.saveContractDraft({
        ...formData,
        facility_id: facilityId
      });
      setActionMessage({ type: 'success', text: 'Contract draft saved successfully.' });
      setIsEditModalOpen(false);
      fetchContracts();
    } catch (err) {
      alert(`Error saving contract: ${err.message}`);
    }
  };

  // Submit for Approval
  const handleSubmitForApproval = async (contract) => {
    if (!window.confirm(`Submit contract ${contract.contract_number} for administrative CFO approval?`)) return;
    try {
      await contractService.submitForApproval(contract.id);
      setActionMessage({ type: 'success', text: `Contract ${contract.contract_number} submitted for approval.` });
      fetchContracts();
    } catch (err) {
      alert(`Submission error: ${err.message}`);
    }
  };

  // Open Approval Review Modal
  const handleOpenReview = (contract) => {
    setSelectedContract(contract);
    setReviewRationale('');
    setReviewError('');
    setIsApprovalModalOpen(true);
  };

  // Execute Review (Approve or Reject)
  const handleExecuteReview = async (action) => {
    setReviewError('');
    try {
      await contractService.reviewContract(selectedContract.id, {
        action,
        rationale: reviewRationale,
        reviewerUserId: '00000000-0000-0000-0001-000000000004' // CFO role
      });
      setActionMessage({
        type: 'success',
        text: `Contract ${selectedContract.contract_number} successfully ${action === 'approve' ? 'approved' : 'rejected'}.`
      });
      setIsApprovalModalOpen(false);
      fetchContracts();
    } catch (err) {
      setReviewError(err.message);
    }
  };

  // Open Amendment Modal
  const handleOpenAmendment = (contract) => {
    setSelectedContract(contract);
    setAmendmentRationale('');
    setIsAmendmentModalOpen(true);
  };

  const handleCreateAmendment = async () => {
    try {
      await contractService.createAmendment(selectedContract.id, {
        amendmentRationale
      });
      setActionMessage({ type: 'success', text: `Amendment draft created for contract ${selectedContract.contract_number}.` });
      setIsAmendmentModalOpen(false);
      fetchContracts();
    } catch (err) {
      alert(`Amendment error: ${err.message}`);
    }
  };

  // Suspend Contract
  const handleSuspend = async (contract) => {
    const reason = window.prompt(`Enter reason for suspending contract ${contract.contract_number}:`);
    if (!reason) return;
    try {
      await contractService.suspendContract(contract.id, { reason });
      setActionMessage({ type: 'success', text: `Contract ${contract.contract_number} suspended.` });
      fetchContracts();
    } catch (err) {
      alert(`Suspension error: ${err.message}`);
    }
  };

  // Scopes Management
  const handleOpenScopes = (contract) => {
    setSelectedContract(contract);
    setNewScope({
      scope_type: 'COMPONENT',
      component_id: componentsList[0]?.id || '',
      specialty: 'Orthopedics',
      is_consignment_covered: true,
      is_excluded: false,
      exclusion_reason: '',
      tier_discount_percent: 10.00
    });
    setIsScopeModalOpen(true);
  };

  const handleAddScope = async () => {
    try {
      await contractService.addContractScope(selectedContract.id, newScope);
      const updated = await contractService.getContractById(selectedContract.id);
      setSelectedContract(updated);
      fetchContracts();
    } catch (err) {
      alert(`Error adding scope: ${err.message}`);
    }
  };

  const handleDeleteScope = async (scopeId) => {
    try {
      await contractService.deleteContractScope(selectedContract.id, scopeId);
      const updated = await contractService.getContractById(selectedContract.id);
      setSelectedContract(updated);
      fetchContracts();
    } catch (err) {
      alert(`Error deleting scope: ${err.message}`);
    }
  };

  // Sourcing Simulation
  const handleRunSimulation = async () => {
    if (!simVendorId) {
      alert('Select a vendor to evaluate.');
      return;
    }
    const res = await contractService.validateContractCoverage({
      facilityId,
      vendorId: simVendorId,
      componentId: simComponentId || null,
      procedureDate: simDate
    });
    setSimResult(res);
  };

  return (
    <div className="contracts-container">
      {/* Top Header */}
      <div className="contracts-header">
        <div className="contracts-title-group">
          <h2>
            <FileText size={24} color="#34d399" />
            Facility Vendor Contracts & Sourcing Terms
          </h2>
          <p>
            Governing binding commercial agreements, GPO affiliations, payment terms, and sourcing authorization for Naples Surgery Center.
          </p>
        </div>
        <div className="contracts-actions">
          <button
            type="button"
            className="btn-secondary-contract"
            onClick={() => {
              setSimResult(null);
              setSimVendorId(vendorsList[0]?.id || '');
              setSimComponentId(componentsList[0]?.id || '');
              setIsSimulatorModalOpen(true);
            }}
          >
            <ShieldCheck size={16} />
            Test Sourcing Eligibility
          </button>
          {canManage && (
            <button
              type="button"
              className="btn-primary-contract"
              onClick={handleOpenCreate}
            >
              <Plus size={16} />
              New Contract Draft
            </button>
          )}
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionMessage && (
        <div className={`alert-box ${actionMessage.type === 'error' ? 'alert-danger' : 'alert-info'}`}>
          <AlertCircle size={18} />
          <span>{actionMessage.text}</span>
          <button
            type="button"
            className="btn-close-modal"
            style={{ marginLeft: 'auto' }}
            onClick={() => setActionMessage(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Metric Cards KPI Grid */}
      <div className="contracts-metrics-grid">
        <div className="contract-metric-card card-active">
          <span className="metric-card-label">Active Contracts</span>
          <span className="metric-card-value">{metrics.activeCount}</span>
          <span className="metric-card-subtitle">Authorizing procurement today</span>
        </div>
        <div className="contract-metric-card card-expiring">
          <span className="metric-card-label">Expiring in 60 Days</span>
          <span className="metric-card-value">{metrics.expiringWithin60DaysCount}</span>
          <span className="metric-card-subtitle">Require renewal or amendment</span>
        </div>
        <div className="contract-metric-card card-pending">
          <span className="metric-card-label">Pending Approval</span>
          <span className="metric-card-value">{metrics.pendingApprovalCount}</span>
          <span className="metric-card-subtitle">Awaiting CFO/Admin sign-off</span>
        </div>
        <div className="contract-metric-card card-spend">
          <span className="metric-card-label">Active Volume Commitment</span>
          <span className="metric-card-value">
            {canViewCosts
              ? `$${(metrics.totalVolumeCommitment || 0).toLocaleString()}`
              : '[CONFIDENTIAL]'}
          </span>
          <span className="metric-card-subtitle">Annual spend obligation</span>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="contracts-filter-bar">
        <div className="search-input-wrapper">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search by contract #, vendor, or GPO..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <select
          className="filter-select"
          value={selectedVendorId}
          onChange={(e) => setSelectedVendorId(e.target.value)}
        >
          <option value="">All Vendors</option>
          {vendorsList.map((v) => (
            <option key={v.id} value={v.id}>{v.display_name || v.vendor_code}</option>
          ))}
        </select>

        <select
          className="filter-select"
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
        >
          <option value="">All Statuses</option>
          {CONTRACT_STATUSES.map((st) => (
            <option key={st} value={st}>{st.toUpperCase()}</option>
          ))}
        </select>

        <select
          className="filter-select"
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
        >
          <option value="">All Types</option>
          {CONTRACT_TYPES.map((t) => (
            <option key={t} value={t}>{t.replace('_', ' ')}</option>
          ))}
        </select>

        <button
          type="button"
          className={`filter-pill ${expiringSoonOnly ? 'active' : ''}`}
          onClick={() => setExpiringSoonOnly(!expiringSoonOnly)}
        >
          <Clock size={14} />
          Expiring Soon (60d)
        </button>
      </div>

      {/* Contracts Data Table */}
      <div className="contracts-table-wrapper">
        <table className="contracts-table">
          <thead>
            <tr>
              <th>Contract Number</th>
              <th>Vendor & Classification</th>
              <th>Type</th>
              <th>Effective Window</th>
              <th>Status</th>
              <th>Scopes</th>
              <th>Commercial Terms</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: '2rem' }}>
                  Loading facility contracts...
                </td>
              </tr>
            ) : contracts.length === 0 ? (
              <tr>
                <td colSpan="8">
                  <div className="contracts-empty-state">
                    <div className="empty-icon-wrap">
                      <FileText size={28} />
                    </div>
                    <h4>No contracts matching criteria</h4>
                    <p>Adjust your search filters or author a new facility vendor contract agreement.</p>
                  </div>
                </td>
              </tr>
            ) : (
              contracts.map((contract) => {
                const isExpiringSoon = contract.effective_to && (() => {
                  const today = new Date();
                  const exp = new Date(contract.effective_to);
                  const diff = (exp - today) / (1000 * 60 * 60 * 24);
                  return diff >= 0 && diff <= 60;
                })();

                return (
                  <tr key={contract.id}>
                    <td>
                      <div className="contract-code-badge">{contract.contract_number}</div>
                      <div className="contract-name-title">{contract.contract_name}</div>
                      {contract.amendment_number > 0 && (
                        <span style={{ fontSize: '0.6875rem', color: '#93c5fd' }}>
                          Amendment #{contract.amendment_number}
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{contract.vendor?.display_name || 'Vendor'}</div>
                      <div className="contract-vendor-text">{contract.vendor?.vendor_code}</div>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.8125rem', color: '#cbd5e1' }}>
                        {contract.contract_type?.replace(/_/g, ' ')}
                      </span>
                      {contract.gpo_affiliation && (
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          GPO: {contract.gpo_affiliation}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontSize: '0.8125rem' }}>
                        {contract.effective_from} → {contract.effective_to}
                      </div>
                      {isExpiringSoon && contract.status === 'active' && (
                        <div style={{ fontSize: '0.6875rem', color: '#f59e0b', fontWeight: 600 }}>
                          ⚠ Expiring within 60 days
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`badge-status badge-${contract.status}`}>
                        {contract.status}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="count-pill"
                        title="View covered component and product scopes"
                        onClick={() => handleOpenScopes(contract)}
                      >
                        <Layers size={12} />
                        {(contract.scopes || []).length} Scopes
                      </button>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>
                        Net {contract.payment_terms_days} days | {contract.fob_point}
                      </div>
                      {contract.is_consignment && (
                        <div style={{ fontSize: '0.6875rem', color: '#34d399' }}>
                          ✓ Consignment ({contract.consignment_reconciliation_frequency})
                        </div>
                      )}
                      {canViewCosts && contract.has_rebate_terms && (
                        <div style={{ fontSize: '0.6875rem', color: '#38bdf8' }}>
                          ★ Rebate: {contract.rebate_percentage}% ({contract.rebate_structure_type})
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="action-buttons-group">
                        {canManage && contract.status === 'draft' && (
                          <>
                            <button
                              type="button"
                              className="btn-icon-action"
                              title="Edit Draft"
                              onClick={() => handleOpenEdit(contract)}
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              type="button"
                              className="btn-icon-action approve-btn"
                              title="Submit for Approval"
                              onClick={() => handleSubmitForApproval(contract)}
                            >
                              <CheckCircle2 size={14} />
                            </button>
                          </>
                        )}

                        {canManage && contract.status === 'pending_approval' && (
                          <button
                            type="button"
                            className="btn-icon-action approve-btn"
                            title="Review Approval"
                            onClick={() => handleOpenReview(contract)}
                          >
                            <ShieldCheck size={14} />
                          </button>
                        )}

                        {canManage && contract.status === 'active' && (
                          <>
                            <button
                              type="button"
                              className="btn-icon-action"
                              title="Create Versioned Amendment"
                              onClick={() => handleOpenAmendment(contract)}
                            >
                              <FileCheck size={14} />
                            </button>
                            <button
                              type="button"
                              className="btn-icon-action"
                              title="Suspend Contract"
                              onClick={() => handleSuspend(contract)}
                            >
                              <Ban size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL 1: Create / Edit Contract Draft */}
      {isEditModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content-card">
            <div className="modal-header">
              <h3>{selectedContract ? 'Edit Contract Draft' : 'New Facility Vendor Contract'}</h3>
              <button type="button" className="btn-close-modal" onClick={() => setIsEditModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form className="modal-form" onSubmit={handleSaveContract}>
              <div className="modal-body">
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Contract Number *</label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      placeholder="e.g. CTR-2026-STR-01"
                      value={formData.contract_number}
                      onChange={(e) => setFormData({ ...formData, contract_number: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Vendor *</label>
                    <select
                      className="form-control"
                      required
                      value={formData.vendor_id}
                      onChange={(e) => setFormData({ ...formData, vendor_id: e.target.value })}
                    >
                      <option value="">Select Vendor...</option>
                      {vendorsList.map((v) => (
                        <option key={v.id} value={v.id}>{v.display_name || v.vendor_code}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Contract Title / Description *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    placeholder="e.g. Stryker Orthopaedics Master Total Joint Agreement"
                    value={formData.contract_name}
                    onChange={(e) => setFormData({ ...formData, contract_name: e.target.value })}
                  />
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Contract Type</label>
                    <select
                      className="form-control"
                      value={formData.contract_type}
                      onChange={(e) => setFormData({ ...formData, contract_type: e.target.value })}
                    >
                      {CONTRACT_TYPES.map((t) => (
                        <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>GPO Affiliation</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Vizient, Premier, Direct"
                      value={formData.gpo_affiliation}
                      onChange={(e) => setFormData({ ...formData, gpo_affiliation: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Effective From *</label>
                    <input
                      type="date"
                      className="form-control"
                      required
                      value={formData.effective_from}
                      onChange={(e) => setFormData({ ...formData, effective_from: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Effective To *</label>
                    <input
                      type="date"
                      className="form-control"
                      required
                      value={formData.effective_to}
                      onChange={(e) => setFormData({ ...formData, effective_to: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Payment Terms (Net Days)</label>
                    <input
                      type="number"
                      className="form-control"
                      min="0"
                      value={formData.payment_terms_days}
                      onChange={(e) => setFormData({ ...formData, payment_terms_days: Number(e.target.value) })}
                    />
                  </div>
                  <div className="form-group">
                    <label>FOB Point / Freight</label>
                    <select
                      className="form-control"
                      value={formData.fob_point}
                      onChange={(e) => setFormData({ ...formData, fob_point: e.target.value })}
                    >
                      <option value="DESTINATION">DESTINATION (Vendor Pays)</option>
                      <option value="ORIGIN">ORIGIN (Facility Pays)</option>
                    </select>
                  </div>
                </div>

                <div className="form-checkbox-row">
                  <input
                    type="checkbox"
                    id="is_consignment"
                    checked={formData.is_consignment}
                    onChange={(e) => setFormData({ ...formData, is_consignment: e.target.checked })}
                  />
                  <label htmlFor="is_consignment">Consignment Stock Maintained on Site</label>
                </div>

                {canViewCosts && (
                  <div className="alert-box alert-info" style={{ flexDirection: 'column', gap: '0.5rem' }}>
                    <strong>Confidential Financial Terms (Restricted to Finance Roles)</strong>
                    <div className="form-grid-2" style={{ width: '100%' }}>
                      <div className="form-group">
                        <label>Annual Volume Spend Commitment ($)</label>
                        <input
                          type="number"
                          className="form-control"
                          value={formData.annual_volume_commitment_amount}
                          onChange={(e) => setFormData({ ...formData, annual_volume_commitment_amount: Number(e.target.value) })}
                        />
                      </div>
                      <div className="form-group">
                        <label>Rebate Percentage (%)</label>
                        <input
                          type="number"
                          step="0.01"
                          className="form-control"
                          value={formData.rebate_percentage}
                          onChange={(e) => setFormData({ ...formData, rebate_percentage: Number(e.target.value) })}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary-contract" onClick={() => setIsEditModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary-contract">
                  Save Contract Draft
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Two-Person Approval Review Modal */}
      {isApprovalModalOpen && selectedContract && (
        <div className="modal-overlay">
          <div className="modal-content-card">
            <div className="modal-header">
              <h3>Two-Person Contract Review & Approval</h3>
              <button type="button" className="btn-close-modal" onClick={() => setIsApprovalModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="alert-box alert-warning">
                <AlertTriangle size={18} />
                <div>
                  <strong>Separation of Duties Policy:</strong> Under Phase 24 Audit Standards and ASC policy, the creator cannot approve their own contract. Approval officially activates commercial sourcing terms.
                </div>
              </div>

              <div style={{ background: '#0f172a', padding: '1rem', borderRadius: '0.375rem', border: '1px solid #334155' }}>
                <p><strong>Contract:</strong> {selectedContract.contract_number} — {selectedContract.contract_name}</p>
                <p><strong>Vendor:</strong> {selectedContract.vendor?.display_name}</p>
                <p><strong>Effective Window:</strong> {selectedContract.effective_from} to {selectedContract.effective_to}</p>
                <p><strong>Payment Terms:</strong> Net {selectedContract.payment_terms_days} days | Consignment: {selectedContract.is_consignment ? 'Yes' : 'No'}</p>
              </div>

              {reviewError && (
                <div className="alert-box alert-danger">
                  <AlertCircle size={16} />
                  <span>{reviewError}</span>
                </div>
              )}

              <div className="form-group">
                <label>Review Rationale / Rejection Reason</label>
                <textarea
                  className="form-control form-textarea"
                  placeholder="Mandatory if rejecting. Optional approval sign-off note..."
                  value={reviewRationale}
                  onChange={(e) => setReviewRationale(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary-contract"
                style={{ borderColor: '#e11d48', color: '#fda4af' }}
                onClick={() => handleExecuteReview('reject')}
              >
                Reject Submission
              </button>
              <button
                type="button"
                className="btn-primary-contract"
                onClick={() => handleExecuteReview('approve')}
              >
                <Check size={16} />
                Approve & Activate Contract
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Scopes Builder Modal */}
      {isScopeModalOpen && selectedContract && (
        <div className="modal-overlay">
          <div className="modal-content-card" style={{ maxWidth: '780px' }}>
            <div className="modal-header">
              <h3>Covered Scopes: {selectedContract.contract_number}</h3>
              <button type="button" className="btn-close-modal" onClick={() => setIsScopeModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.875rem', color: '#94a3b8', margin: 0 }}>
                Relational scope line-items defining included and carved-out products for {selectedContract.vendor?.display_name}.
              </p>

              {/* Scopes List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {(selectedContract.scopes || []).length === 0 ? (
                  <p style={{ color: '#64748b', fontSize: '0.875rem' }}>No explicit scopes defined. Contract defaults to unmapped scope.</p>
                ) : (
                  selectedContract.scopes.map((s) => (
                    <div key={s.id} className="scope-item-row">
                      <div>
                        <span className={`scope-badge-tag ${s.is_excluded ? 'tag-excluded' : 'tag-included'}`}>
                          {s.is_excluded ? 'EXCLUDED CARVE-OUT' : 'INCLUDED'}
                        </span>
                        <strong style={{ marginLeft: '0.5rem', color: '#f8fafc' }}>
                          {s.scope_type === 'ALL_VENDOR_PRODUCTS' ? 'Entire Vendor Catalog' : s.component_name || s.scope_type}
                        </strong>
                        {s.tier_discount_percent > 0 && (
                          <span style={{ fontSize: '0.75rem', color: '#38bdf8', marginLeft: '0.75rem' }}>
                            ({s.tier_discount_percent}% Discount)
                          </span>
                        )}
                      </div>
                      {canManage && (
                        <button
                          type="button"
                          className="btn-icon-action"
                          style={{ borderColor: '#e11d48', color: '#fda4af' }}
                          title="Delete Scope"
                          onClick={() => handleDeleteScope(s.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Add New Scope Form */}
              {canManage && (
                <div style={{ background: '#0f172a', padding: '1rem', borderRadius: '0.375rem', border: '1px solid #334155', marginTop: '0.5rem' }}>
                  <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', color: '#f8fafc' }}>Add Line-Item Scope</h4>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>Scope Type</label>
                      <select
                        className="form-control"
                        value={newScope.scope_type}
                        onChange={(e) => setNewScope({ ...newScope, scope_type: e.target.value })}
                      >
                        {SCOPE_TYPES.map((st) => (
                          <option key={st} value={st}>{st.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
                    </div>
                    {newScope.scope_type === 'COMPONENT' && (
                      <div className="form-group">
                        <label>Clinical Component</label>
                        <select
                          className="form-control"
                          value={newScope.component_id}
                          onChange={(e) => setNewScope({ ...newScope, component_id: e.target.value })}
                        >
                          <option value="">Select Component...</option>
                          {componentsList.map((c) => (
                            <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="form-checkbox-row">
                    <input
                      type="checkbox"
                      id="is_excluded_scope"
                      checked={newScope.is_excluded}
                      onChange={(e) => setNewScope({ ...newScope, is_excluded: e.target.checked })}
                    />
                    <label htmlFor="is_excluded_scope">Carve-Out Exclusion (Bar item from this contract)</label>
                  </div>

                  <div style={{ marginTop: '0.75rem', textAlign: 'right' }}>
                    <button type="button" className="btn-primary-contract" onClick={handleAddScope}>
                      <Plus size={14} /> Add Scope to Contract
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary-contract" onClick={() => setIsScopeModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Amendment Creator Modal */}
      {isAmendmentModalOpen && selectedContract && (
        <div className="modal-overlay">
          <div className="modal-content-card">
            <div className="modal-header">
              <h3>Create Contract Amendment</h3>
              <button type="button" className="btn-close-modal" onClick={() => setIsAmendmentModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="alert-box alert-info">
                <FileCheck size={18} />
                <div>
                  <strong>Version Lineage Invariant:</strong> Creating an amendment clones contract #{selectedContract.contract_number} into a new draft amendment (Amendment #{selectedContract.amendment_number + 1}). The parent contract remains active for historical surgical cases.
                </div>
              </div>
              <div className="form-group">
                <label>Amendment Rationale / Justification * (Min 10 characters)</label>
                <textarea
                  className="form-control form-textarea"
                  placeholder="Describe commercial, pricing, or scope modifications requiring this amendment..."
                  value={amendmentRationale}
                  onChange={(e) => setAmendmentRationale(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary-contract" onClick={() => setIsAmendmentModalOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn-primary-contract" onClick={handleCreateAmendment}>
                Generate Amendment Draft
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: Sourcing Eligibility Simulator */}
      {isSimulatorModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content-card">
            <div className="modal-header">
              <h3>Sourcing Authorization Simulator</h3>
              <button type="button" className="btn-close-modal" onClick={() => setIsSimulatorModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.875rem', color: '#94a3b8', margin: 0 }}>
                Test whether an implant component is contractually authorized at Naples Surgery Center for an upcoming scheduled surgery date.
              </p>

              <div className="form-group">
                <label>Target Vendor</label>
                <select
                  className="form-control"
                  value={simVendorId}
                  onChange={(e) => setSimVendorId(e.target.value)}
                >
                  <option value="">Select Target Vendor...</option>
                  {vendorsList.map((v) => (
                    <option key={v.id} value={v.id}>{v.display_name || v.vendor_code}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Clinical Component</label>
                <select
                  className="form-control"
                  value={simComponentId}
                  onChange={(e) => setSimComponentId(e.target.value)}
                >
                  <option value="">Any Vendor Component</option>
                  {componentsList.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Procedure Encounter Date</label>
                <input
                  type="date"
                  className="form-control"
                  value={simDate}
                  onChange={(e) => setSimDate(e.target.value)}
                />
              </div>

              <button type="button" className="btn-primary-contract" style={{ width: '100%' }} onClick={handleRunSimulation}>
                Execute Sourcing Audit
              </button>

              {simResult && (
                <div
                  className={`alert-box ${simResult.isAuthorized ? 'alert-info' : 'alert-danger'}`}
                  style={{ flexDirection: 'column', gap: '0.375rem', marginTop: '0.75rem' }}
                >
                  <strong>{simResult.isAuthorized ? '✓ SOURCING AUTHORIZED' : '✕ UNAUTHORIZED / PRICE BREACH'}</strong>
                  <div>Status: {simResult.reasonCode}</div>
                  <div>Details: {simResult.message}</div>
                  {simResult.contractNumber && <div>Contract Applied: #{simResult.contractNumber}</div>}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary-contract" onClick={() => setIsSimulatorModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
