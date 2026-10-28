import React, { useState, useEffect, useCallback } from 'react';
import {
  Layers, Search, Plus,
  Edit, Ban, RotateCcw, X, Star, Grid, List,
  ArrowUpDown
} from 'lucide-react';
import { vendorComponentService } from '../lib/vendorComponentService';
import { vendorService } from '../lib/vendorService';
import { implantService } from '../lib/implantService';
import './VendorComponentMappingMatrix.css';

export default function VendorComponentMappingMatrix({
  activeFacility = null,
  userPermissions = []
}) {
  const canManage = userPermissions.includes('admin') ||
    userPermissions.includes('implants.manage_catalog') ||
    userPermissions.includes('implants.manage_contracts') ||
    userPermissions.includes('super_admin');

  // View Mode: 'matrix' (2D Grid) or 'table' (Ledger)
  const [viewMode, setViewMode] = useState('matrix');

  // Data State
  const [mappings, setMappings] = useState([]);
  const [metrics, setMetrics] = useState({
    total: 0,
    activeCount: 0,
    preferredCount: 0,
    restrictedCount: 0,
    oemVendorsMapped: 0,
    filteredCount: 0
  });
  const [loading, setLoading] = useState(true);

  // Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpecialty, setSelectedSpecialty] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [selectedTier, setSelectedTier] = useState('');
  const [selectedScope, setSelectedScope] = useState('all'); // 'all', 'facility', 'global'

  // Options for Dropdowns
  const [vendorsList, setVendorsList] = useState([]);
  const [componentsList, setComponentsList] = useState([]);
  const [distributorsList, setDistributorsList] = useState([]);

  // Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isTierModalOpen, setIsTierModalOpen] = useState(false);
  const [isTerminateModalOpen, setIsTerminateModalOpen] = useState(false);

  const [selectedMapping, setSelectedMapping] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    id: null,
    vendor_id: '',
    component_id: '',
    preference_tier: 'STANDARD',
    sourcing_model: 'DIRECT_OEM',
    authorized_distributor_id: '',
    contract_reference_number: '',
    lead_time_days: 3,
    consignment_stock_maintained: false,
    effective_date: new Date().toISOString().split('T')[0],
    termination_date: '',
    clinical_notes: '',
    governance_rationale: '',
    isFacilityCustom: false
  });

  // Quick Tier Change Form
  const [tierChangeData, setTierChangeData] = useState({
    tier: 'PREFERRED',
    rationale: ''
  });

  // Terminate Form
  const [terminateRationale, setTerminateRationale] = useState('');

  // 1. Initial Data Fetch
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const facilityId = activeFacility?.id || null;

      // 1. Fetch Mappings
      const res = await vendorComponentService.getMappings({
        facilityId: selectedScope === 'global' ? null : facilityId,
        specialty: selectedSpecialty || null,
        vendorId: selectedVendorId || null,
        preferenceTier: selectedTier || null,
        search: searchQuery
      });
      setMappings(res.mappings);
      setMetrics(res.metrics);

      // 2. Fetch Vendors
      const vRes = await vendorService.getVendors();
      setVendorsList(vRes.vendors.filter(v => v.vendor_type === 'MANUFACTURER' || v.vendor_type === 'TISSUE_BANK'));
      setDistributorsList(vRes.vendors.filter(v => v.vendor_type === 'DISTRIBUTOR'));

      // 3. Fetch Components
      const cRes = await implantService.getComponents();
      setComponentsList(cRes.components || []);
    } catch (err) {
      console.error('Failed to load vendor-component mappings:', err);
    } finally {
      setLoading(false);
    }
  }, [activeFacility, selectedScope, selectedSpecialty, selectedVendorId, selectedTier, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Edit / Create Modal Open
  const handleOpenEditModal = (mapping = null, defaultVendorId = null, defaultComponentId = null) => {
    if (mapping) {
      setSelectedMapping(mapping);
      setFormData({
        id: mapping.id,
        vendor_id: mapping.vendor_id,
        component_id: mapping.component_id,
        preference_tier: mapping.preference_tier,
        sourcing_model: mapping.sourcing_model,
        authorized_distributor_id: mapping.authorized_distributor_id || '',
        contract_reference_number: mapping.contract_reference_number || '',
        lead_time_days: mapping.lead_time_days || 3,
        consignment_stock_maintained: Boolean(mapping.consignment_stock_maintained),
        effective_date: mapping.effective_date || new Date().toISOString().split('T')[0],
        termination_date: mapping.termination_date || '',
        clinical_notes: mapping.clinical_notes || '',
        governance_rationale: mapping.governance_rationale || '',
        isFacilityCustom: mapping.facility_id !== null
      });
    } else {
      setSelectedMapping(null);
      setFormData({
        id: null,
        vendor_id: defaultVendorId || (vendorsList[0]?.id || ''),
        component_id: defaultComponentId || (componentsList[0]?.id || ''),
        preference_tier: 'STANDARD',
        sourcing_model: 'DIRECT_OEM',
        authorized_distributor_id: '',
        contract_reference_number: '',
        lead_time_days: 3,
        consignment_stock_maintained: false,
        effective_date: new Date().toISOString().split('T')[0],
        termination_date: '',
        clinical_notes: '',
        governance_rationale: '',
        isFacilityCustom: Boolean(activeFacility?.id)
      });
    }
    setIsEditModalOpen(true);
  };

  // Handle Save Mapping
  const handleSaveMapping = async (e) => {
    e.preventDefault();
    try {
      const facilityId = formData.isFacilityCustom ? (activeFacility?.id || null) : null;
      await vendorComponentService.saveMapping({
        ...formData,
        facility_id: facilityId
      });
      setIsEditModalOpen(false);
      await loadData();
    } catch (err) {
      alert(`Save failed: ${err.message}`);
    }
  };

  // Handle Quick Tier Modal
  const handleOpenTierModal = (mapping) => {
    setSelectedMapping(mapping);
    setTierChangeData({
      tier: mapping.preference_tier,
      rationale: mapping.governance_rationale || ''
    });
    setIsTierModalOpen(true);
  };

  const handleSaveTier = async (e) => {
    e.preventDefault();
    if (!selectedMapping) return;
    try {
      await vendorComponentService.updatePreferenceTier(
        selectedMapping.id,
        tierChangeData.tier,
        tierChangeData.rationale
      );
      setIsTierModalOpen(false);
      await loadData();
    } catch (err) {
      alert(`Tier update failed: ${err.message}`);
    }
  };

  // Handle Terminate Modal
  const handleOpenTerminateModal = (mapping) => {
    setSelectedMapping(mapping);
    setTerminateRationale('');
    setIsTerminateModalOpen(true);
  };

  const handleConfirmTerminate = async (e) => {
    e.preventDefault();
    if (!selectedMapping) return;
    try {
      await vendorComponentService.terminateMapping(selectedMapping.id, terminateRationale);
      setIsTerminateModalOpen(false);
      await loadData();
    } catch (err) {
      alert(`Termination failed: ${err.message}`);
    }
  };

  // Handle Reactivate
  const handleReactivate = async (mapping) => {
    if (!confirm(`Reactivate sourcing mapping for ${mapping.vendor?.display_name} - ${mapping.component?.name}?`)) {
      return;
    }
    try {
      await vendorComponentService.reactivateMapping(mapping.id);
      await loadData();
    } catch (err) {
      alert(`Reactivation failed: ${err.message}`);
    }
  };

  // Unique specialties for filter
  const specialties = Array.from(new Set(componentsList.map(c => c.specialty || c.category?.specialty).filter(Boolean)));

  // Matrix Grid Data Prep
  const matrixComponents = componentsList.filter(c => {
    if (!selectedSpecialty) return true;
    return (c.specialty || c.category?.specialty) === selectedSpecialty;
  });

  const matrixVendors = vendorsList.filter(v => {
    if (!selectedVendorId) return true;
    return v.id === selectedVendorId;
  });

  return (
    <div className="matrix-container">
      {/* Header */}
      <div className="matrix-header-row">
        <div className="matrix-header-title">
          <h1>
            <Layers size={26} color="#38bdf8" />
            Vendor-to-Component Sourcing Matrix
          </h1>
          <p>
            Commercial-to-clinical capability mappings, facility preference tiers, and logistics consignment governance.
          </p>
        </div>
        <div className="matrix-actions-group">
          {loading && <span style={{ color: '#94a3b8', fontSize: '0.8rem', marginRight: '0.5rem' }}>Loading...</span>}
          {canManage && (
            <button
              className="btn-primary-matrix"
              onClick={() => handleOpenEditModal(null)}
            >
              <Plus size={16} />
              + Add Sourcing Mapping
            </button>
          )}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="matrix-metrics-grid">
        <div className="matrix-metric-card">
          <span className="matrix-metric-label">Total Mappings</span>
          <span className="matrix-metric-value">{metrics.total}</span>
          <span className="matrix-metric-sub">Commercial Capabilities</span>
        </div>
        <div className="matrix-metric-card">
          <span className="matrix-metric-label">Active Sources</span>
          <span className="matrix-metric-value" style={{ color: '#34d399' }}>{metrics.activeCount}</span>
          <span className="matrix-metric-sub">Clinically Available</span>
        </div>
        <div className="matrix-metric-card">
          <span className="matrix-metric-label">Preferred Tier</span>
          <span className="matrix-metric-value" style={{ color: '#60a5fa' }}>{metrics.preferredCount}</span>
          <span className="matrix-metric-sub">Primary Choice Items</span>
        </div>
        <div className="matrix-metric-card">
          <span className="matrix-metric-label">Restricted / Banned</span>
          <span className="matrix-metric-value" style={{ color: '#f87171' }}>{metrics.restrictedCount}</span>
          <span className="matrix-metric-sub">Barred at Facility</span>
        </div>
        <div className="matrix-metric-card">
          <span className="matrix-metric-label">Mapped OEMs</span>
          <span className="matrix-metric-value">{metrics.oemVendorsMapped}</span>
          <span className="matrix-metric-sub">Approved Manufacturers</span>
        </div>
      </div>

      {/* Filter Card */}
      <div className="matrix-filter-card">
        <div className="matrix-filter-row">
          <div className="matrix-search-box">
            <Search size={16} className="matrix-search-icon" />
            <input
              type="text"
              className="matrix-search-input"
              placeholder="Search vendor, component, or contract #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <select
            className="matrix-select"
            value={selectedSpecialty}
            onChange={(e) => setSelectedSpecialty(e.target.value)}
          >
            <option value="">All Specialties</option>
            {specialties.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select
            className="matrix-select"
            value={selectedVendorId}
            onChange={(e) => setSelectedVendorId(e.target.value)}
          >
            <option value="">All Vendors</option>
            {vendorsList.map(v => (
              <option key={v.id} value={v.id}>{v.display_name} ({v.vendor_code})</option>
            ))}
          </select>

          <select
            className="matrix-select"
            value={selectedTier}
            onChange={(e) => setSelectedTier(e.target.value)}
          >
            <option value="">All Preference Tiers</option>
            <option value="PREFERRED">Preferred ⭐</option>
            <option value="STANDARD">Standard</option>
            <option value="SECONDARY">Secondary</option>
            <option value="NON_PREFERRED">Non-Preferred</option>
            <option value="RESTRICTED">Restricted 🚫</option>
          </select>

          <select
            className="matrix-select"
            value={selectedScope}
            onChange={(e) => setSelectedScope(e.target.value)}
          >
            <option value="all">All Scopes</option>
            <option value="facility">Facility Specific</option>
            <option value="global">Global Only</option>
          </select>

          <div className="matrix-view-toggle">
            <button
              className={`matrix-toggle-btn ${viewMode === 'matrix' ? 'active' : ''}`}
              onClick={() => setViewMode('matrix')}
              title="2D Matrix View"
            >
              <Grid size={15} /> Matrix
            </button>
            <button
              className={`matrix-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Tabular Ledger View"
            >
              <List size={15} /> Ledger
            </button>
          </div>
        </div>
      </div>

      {/* Main Content: 2D Matrix View or Tabular Ledger */}
      {viewMode === 'matrix' ? (
        <div className="matrix-grid-card">
          <table className="matrix-grid-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left', minWidth: '220px' }}>Clinical Component</th>
                {matrixVendors.map(vendor => (
                  <th key={vendor.id} className="vendor-col-header">
                    <div>{vendor.display_name}</div>
                    <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 400 }}>{vendor.vendor_code}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrixComponents.length === 0 ? (
                <tr>
                  <td colSpan={matrixVendors.length + 1} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                    No components match the selected filter criteria.
                  </td>
                </tr>
              ) : (
                matrixComponents.map(component => (
                  <tr key={component.id}>
                    <td className="component-header-cell">
                      <div>{component.name}</div>
                      <span className="component-spec-tag">
                        {component.code} • {component.specialty || component.category?.specialty || 'General'}
                      </span>
                    </td>
                    {matrixVendors.map(vendor => {
                      const match = mappings.find(m => m.component_id === component.id && m.vendor_id === vendor.id);
                      return (
                        <td key={vendor.id}>
                          <div className="matrix-cell-content">
                            {match ? (
                              <button
                                className={`cell-tier-badge tier-${match.preference_tier.toLowerCase()}`}
                                onClick={() => handleOpenTierModal(match)}
                                title={`Click to change tier: ${match.preference_tier}`}
                              >
                                {match.preference_tier === 'PREFERRED' && <Star size={11} fill="#34d399" />}
                                {match.preference_tier === 'RESTRICTED' && <Ban size={11} />}
                                {match.preference_tier}
                              </button>
                            ) : (
                              canManage && (
                                <button
                                  className="cell-tier-badge tier-unmapped"
                                  onClick={() => handleOpenEditModal(null, vendor.id, component.id)}
                                  title="Establish Sourcing Mapping"
                                >
                                  + Map
                                </button>
                              )
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="matrix-table-card">
          <table className="matrix-table">
            <thead>
              <tr>
                <th style={{ minWidth: '180px' }}>Clinical Component</th>
                <th style={{ minWidth: '150px' }}>Manufacturer Vendor</th>
                <th style={{ minWidth: '120px' }}>Preference Tier</th>
                <th style={{ minWidth: '115px' }}>Sourcing Model</th>
                <th style={{ minWidth: '135px' }}>Contract / Lead</th>
                <th style={{ minWidth: '130px', whiteSpace: 'nowrap' }}>Effective Range</th>
                <th style={{ minWidth: '110px' }}>Scope</th>
                <th style={{ minWidth: '100px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {mappings.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                    No sourcing mappings found matching criteria.
                  </td>
                </tr>
              ) : (
                mappings.map(m => (
                  <tr key={m.id}>
                    <td>
                      <div className="mapping-name-primary">{m.component?.name}</div>
                      <div className="mapping-subtext">{m.component?.code} • {m.component?.specialty || 'General'}</div>
                    </td>
                    <td>
                      <div className="mapping-name-primary">{m.vendor?.display_name}</div>
                      <div className="mapping-subtext">{m.vendor?.vendor_code}</div>
                    </td>
                    <td>
                      <span className={`cell-tier-badge tier-${m.preference_tier.toLowerCase()}`}>
                        {m.preference_tier === 'PREFERRED' && <Star size={11} fill="#34d399" />}
                        {m.preference_tier === 'RESTRICTED' && <Ban size={11} />}
                        {m.preference_tier}
                      </span>
                    </td>
                    <td>
                      <span className="badge-sourcing" style={{ whiteSpace: 'nowrap' }}>{m.sourcing_model.replace('_', ' ')}</span>
                      {m.authorized_distributor && (
                        <div className="mapping-subtext">via {m.authorized_distributor.display_name}</div>
                      )}
                    </td>
                    <td>
                      <div style={{ whiteSpace: 'nowrap' }}>{m.contract_reference_number || 'Direct Order'}</div>
                      <div className="mapping-subtext">{m.lead_time_days} days lead</div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div>From: {m.effective_date}</div>
                      <div className="mapping-subtext">{m.termination_date ? `To: ${m.termination_date}` : 'Ongoing'}</div>
                    </td>
                    <td>
                      <span className="badge-scope" style={{ whiteSpace: 'nowrap' }}>
                        {m.facility_id ? 'Facility Custom' : 'Global Baseline'}
                      </span>
                    </td>
                    <td>
                      <div className="matrix-actions-cell" style={{ justifyContent: 'center' }}>
                        {canManage && (
                          <>
                            <button
                              className="matrix-icon-btn"
                              onClick={() => handleOpenEditModal(m)}
                              title="Edit Mapping Details"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              className="matrix-icon-btn"
                              onClick={() => handleOpenTierModal(m)}
                              title="Change Preference Tier"
                            >
                              <ArrowUpDown size={14} />
                            </button>
                            {m.is_active ? (
                              <button
                                className="matrix-icon-btn danger-btn"
                                onClick={() => handleOpenTerminateModal(m)}
                                title="Terminate Mapping"
                              >
                                <Ban size={14} />
                              </button>
                            ) : (
                              <button
                                className="matrix-icon-btn reactivate-btn"
                                onClick={() => handleReactivate(m)}
                                title="Reactivate Mapping"
                              >
                                <RotateCcw size={14} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit / Create Mapping Modal */}
      {isEditModalOpen && (
        <div className="matrix-modal-overlay">
          <div className="matrix-modal-card">
            <div className="matrix-modal-header">
              <h2>{formData.id ? 'Edit Sourcing Mapping' : 'Establish Sourcing Mapping'}</h2>
              <button className="matrix-close-btn" onClick={() => setIsEditModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveMapping}>
              <div className="matrix-modal-body">
                <div className="matrix-form-grid">
                  <div>
                    <label className="matrix-form-label">Manufacturer OEM *</label>
                    <select
                      className="matrix-form-select"
                      value={formData.vendor_id}
                      onChange={(e) => setFormData({ ...formData, vendor_id: e.target.value })}
                      required
                    >
                      {vendorsList.map(v => (
                        <option key={v.id} value={v.id}>{v.display_name} ({v.vendor_code})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="matrix-form-label">Clinical Component *</label>
                    <select
                      className="matrix-form-select"
                      value={formData.component_id}
                      onChange={(e) => setFormData({ ...formData, component_id: e.target.value })}
                      required
                    >
                      {componentsList.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="matrix-form-label">Preference Tier</label>
                    <select
                      className="matrix-form-select"
                      value={formData.preference_tier}
                      onChange={(e) => setFormData({ ...formData, preference_tier: e.target.value })}
                    >
                      <option value="PREFERRED">PREFERRED (Primary choice)</option>
                      <option value="STANDARD">STANDARD</option>
                      <option value="SECONDARY">SECONDARY (Backup source)</option>
                      <option value="NON_PREFERRED">NON_PREFERRED</option>
                      <option value="RESTRICTED">RESTRICTED (Banned at Facility)</option>
                    </select>
                  </div>

                  <div>
                    <label className="matrix-form-label">Sourcing Model</label>
                    <select
                      className="matrix-form-select"
                      value={formData.sourcing_model}
                      onChange={(e) => setFormData({ ...formData, sourcing_model: e.target.value })}
                    >
                      <option value="DIRECT_OEM">Direct OEM Purchase</option>
                      <option value="DISTRIBUTOR_CONSIGNMENT">Distributor Consignment</option>
                      <option value="BILL_ONLY">Bill Only</option>
                      <option value="LOANER_SET">Loaner Instrumentation Set</option>
                    </select>
                  </div>

                  {formData.sourcing_model === 'DISTRIBUTOR_CONSIGNMENT' && (
                    <div className="form-full-width">
                      <label className="matrix-form-label">Authorized 3PL Distributor *</label>
                      <select
                        className="matrix-form-select"
                        value={formData.authorized_distributor_id}
                        onChange={(e) => setFormData({ ...formData, authorized_distributor_id: e.target.value })}
                        required
                      >
                        <option value="">Select Logistics Distributor...</option>
                        {distributorsList.map(d => (
                          <option key={d.id} value={d.id}>{d.display_name} ({d.vendor_code})</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="matrix-form-label">Contract Reference #</label>
                    <input
                      type="text"
                      className="matrix-form-input"
                      placeholder="e.g. STR-KNEE-2026"
                      value={formData.contract_reference_number}
                      onChange={(e) => setFormData({ ...formData, contract_reference_number: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="matrix-form-label">Lead Time (Days)</label>
                    <input
                      type="number"
                      className="matrix-form-input"
                      min="0"
                      value={formData.lead_time_days}
                      onChange={(e) => setFormData({ ...formData, lead_time_days: parseInt(e.target.value, 10) })}
                    />
                  </div>

                  <div>
                    <label className="matrix-form-label">Effective Date</label>
                    <input
                      type="date"
                      className="matrix-form-input"
                      value={formData.effective_date}
                      onChange={(e) => setFormData({ ...formData, effective_date: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="matrix-form-label">Termination Date (Optional)</label>
                    <input
                      type="date"
                      className="matrix-form-input"
                      value={formData.termination_date}
                      onChange={(e) => setFormData({ ...formData, termination_date: e.target.value })}
                    />
                  </div>

                  <div className="form-full-width">
                    <label className="matrix-form-label">Governance Rationale</label>
                    <input
                      type="text"
                      className="matrix-form-input"
                      placeholder="Mandatory for Preferred or Restricted tiers..."
                      value={formData.governance_rationale}
                      onChange={(e) => setFormData({ ...formData, governance_rationale: e.target.value })}
                    />
                  </div>

                  <div className="form-full-width matrix-checkbox-row">
                    <input
                      type="checkbox"
                      id="consignmentStock"
                      checked={formData.consignment_stock_maintained}
                      onChange={(e) => setFormData({ ...formData, consignment_stock_maintained: e.target.checked })}
                    />
                    <label htmlFor="consignmentStock">Consignment on-site inventory maintained in sterile core</label>
                  </div>

                  {activeFacility?.id && (
                    <div className="form-full-width matrix-checkbox-row">
                      <input
                        type="checkbox"
                        id="facilityCustom"
                        checked={formData.isFacilityCustom}
                        onChange={(e) => setFormData({ ...formData, isFacilityCustom: e.target.checked })}
                      />
                      <label htmlFor="facilityCustom">Save as facility-specific contractual override ({activeFacility.name})</label>
                    </div>
                  )}
                </div>
              </div>
              <div className="matrix-modal-footer">
                <button type="button" className="btn-secondary-matrix" onClick={() => setIsEditModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary-matrix">
                  Save Sourcing Mapping
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Tier Change Modal */}
      {isTierModalOpen && selectedMapping && (
        <div className="matrix-modal-overlay">
          <div className="matrix-modal-card" style={{ maxWidth: '480px' }}>
            <div className="matrix-modal-header">
              <h2>Change Preference Tier</h2>
              <button className="matrix-close-btn" onClick={() => setIsTierModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveTier}>
              <div className="matrix-modal-body">
                <div>
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
                    Mapping: <strong style={{ color: '#fff' }}>{selectedMapping.vendor?.display_name}</strong> → <strong style={{ color: '#fff' }}>{selectedMapping.component?.name}</strong>
                  </div>
                </div>
                <div>
                  <label className="matrix-form-label">New Preference Tier *</label>
                  <select
                    className="matrix-form-select"
                    value={tierChangeData.tier}
                    onChange={(e) => setTierChangeData({ ...tierChangeData, tier: e.target.value })}
                  >
                    <option value="PREFERRED">PREFERRED ⭐ (Primary)</option>
                    <option value="STANDARD">STANDARD</option>
                    <option value="SECONDARY">SECONDARY (Backup)</option>
                    <option value="NON_PREFERRED">NON_PREFERRED</option>
                    <option value="RESTRICTED">RESTRICTED 🚫 (Barred)</option>
                  </select>
                </div>
                <div>
                  <label className="matrix-form-label">Governance Rationale *</label>
                  <textarea
                    className="matrix-form-input"
                    rows="3"
                    placeholder="Reason for tier promotion, demotion, or restriction..."
                    value={tierChangeData.rationale}
                    onChange={(e) => setTierChangeData({ ...tierChangeData, rationale: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="matrix-modal-footer">
                <button type="button" className="btn-secondary-matrix" onClick={() => setIsTierModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary-matrix">
                  Update Preference Tier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Terminate Modal */}
      {isTerminateModalOpen && selectedMapping && (
        <div className="matrix-modal-overlay">
          <div className="matrix-modal-card" style={{ maxWidth: '480px' }}>
            <div className="matrix-modal-header" style={{ backgroundColor: '#450a0a', borderBottomColor: '#991b1b' }}>
              <h2 style={{ color: '#fecaca', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Ban size={18} /> Terminate Sourcing Mapping
              </h2>
              <button className="matrix-close-btn" onClick={() => setIsTerminateModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleConfirmTerminate}>
              <div className="matrix-modal-body">
                <div style={{ fontSize: '0.85rem', color: '#fca5a5' }}>
                  Terminating commercial sourcing for <strong>{selectedMapping.vendor?.display_name}</strong> - <strong>{selectedMapping.component?.name}</strong> will prevent preference card inclusion and future case selection.
                </div>
                <div>
                  <label className="matrix-form-label">Termination Rationale *</label>
                  <textarea
                    className="matrix-form-input"
                    rows="3"
                    placeholder="e.g., Facility contract expired; vendor consolidation initiative..."
                    value={terminateRationale}
                    onChange={(e) => setTerminateRationale(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="matrix-modal-footer">
                <button type="button" className="btn-secondary-matrix" onClick={() => setIsTerminateModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary-matrix" style={{ backgroundColor: '#dc2626', borderColor: '#b91c1c' }}>
                  Confirm Termination
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
