import React, { useState, useEffect } from 'react';
import {
  Package, Search, Plus, Filter, AlertTriangle, CheckCircle,
  Truck, Edit, Ban, RotateCcw, X, Layers, Tag, ExternalLink, ShieldAlert
} from 'lucide-react';
import {
  skuService,
  STERILE_PACKAGING_TYPES,
  LATERALITY_TYPES,
  MATERIAL_TYPES,
  DURATION_CLASSIFICATIONS,
  MRI_SAFETY_STATUSES,
  SKU_STATUSES,
  RECALL_CLASSES,
  GLOBAL_BASELINE_FAMILIES
} from '../lib/skuService';
import { vendorService } from '../lib/vendorService';
import { implantService } from '../lib/implantService';
import './ImplantProductSkuMaster.css';

export default function ImplantProductSkuMaster({
  activeFacility = null,
  userPermissions = []
}) {
  const canManage = userPermissions.includes('admin') ||
    userPermissions.includes('implants.manage_catalog') ||
    userPermissions.includes('super_admin');

  // Data State
  const [skus, setSkus] = useState([]);
  const [metrics, setMetrics] = useState({
    total: 0,
    activeCount: 0,
    recalledCount: 0,
    activeOemCount: 0,
    filteredCount: 0
  });
  const [pagination, setPagination] = useState({ page: 1, limit: 50, totalPages: 1, totalItems: 0 });
  const [loading, setLoading] = useState(true);

  // Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [selectedComponentId, setSelectedComponentId] = useState('');
  const [selectedLaterality, setSelectedLaterality] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Dropdown options
  const [vendorsList, setVendorsList] = useState([]);
  const [componentsList, setComponentsList] = useState([]);

  // Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDistributorModalOpen, setIsDistributorModalOpen] = useState(false);
  const [isRecallModalOpen, setIsRecallModalOpen] = useState(false);
  const [isDeactivateModalOpen, setIsDeactivateModalOpen] = useState(false);

  const [selectedSku, setSelectedSku] = useState(null);
  const [distributorMappings, setDistributorMappings] = useState([]);

  // Form State
  const [formData, setFormData] = useState({
    id: null,
    vendor_id: '',
    family_id: '',
    component_id: '',
    catalog_number: '',
    product_name: '',
    internal_sku: '',
    description: '',
    udi_di: '',
    hcpcs_c_code: '',
    secondary_hcpcs_code: '',
    sterile_packaging: 'STERILE_PACKAGED',
    laterality: 'NOT_APPLICABLE',
    material_composition: 'TITANIUM',
    size_dimension: '',
    duration_classification: 'PERMANENT',
    mri_safety_status: 'MR_CONDITIONAL',
    latex_free: true,
    list_price: 0.00,
    unit_of_measure: 'EA',
    isFacilityCustom: false
  });

  // Recall Form
  const [recallData, setRecallData] = useState({
    recallClass: 'CLASS_II',
    recallDate: new Date().toISOString().split('T')[0],
    recallReason: ''
  });

  // Deactivate Rationale
  const [deactivateRationale, setDeactivateRationale] = useState('');

  // New Distributor Mapping Form
  const [newDistMapping, setNewDistMapping] = useState({
    distributor_id: '',
    distributor_item_number: '',
    package_unit: 'EA',
    is_preferred_distributor: false
  });

  // Initial Data Load
  useEffect(() => {
    loadFilterOptions();
  }, [activeFacility]);

  useEffect(() => {
    loadSkus();
  }, [
    activeFacility,
    searchQuery,
    selectedVendorId,
    selectedComponentId,
    selectedLaterality,
    selectedStatus,
    pagination.page
  ]);

  const loadFilterOptions = async () => {
    try {
      const vRes = await vendorService.getVendors({ limit: 100 });
      setVendorsList(vRes.vendors || []);

      const cRes = await implantService.getComponents();
      setComponentsList(cRes || []);
    } catch (err) {
      // Non-blocking fallback
    }
  };

  const loadSkus = async () => {
    setLoading(true);
    try {
      const res = await skuService.getSkus({
        search: searchQuery,
        vendorId: selectedVendorId || null,
        componentId: selectedComponentId || null,
        laterality: selectedLaterality || null,
        status: selectedStatus || null,
        facilityId: activeFacility?.id || null,
        page: pagination.page,
        limit: pagination.limit,
        includeInactive: true
      });

      setSkus(res.skus || []);
      setMetrics(res.metrics || {});
      setPagination(res.pagination || { page: 1, limit: 50, totalPages: 1, totalItems: 0 });
    } catch (err) {
      alert(err.message || 'Failed to load implant product SKUs');
    } finally {
      setLoading(false);
    }
  };

  // Open Add SKU Modal
  const handleOpenAddModal = () => {
    setSelectedSku(null);
    setFormData({
      id: null,
      vendor_id: vendorsList[0]?.id || '',
      family_id: '',
      component_id: componentsList[0]?.id || '',
      catalog_number: '',
      product_name: '',
      internal_sku: '',
      description: '',
      udi_di: '',
      hcpcs_c_code: 'C1776',
      secondary_hcpcs_code: '',
      sterile_packaging: 'STERILE_PACKAGED',
      laterality: 'NOT_APPLICABLE',
      material_composition: 'TITANIUM',
      size_dimension: '',
      duration_classification: 'PERMANENT',
      mri_safety_status: 'MR_CONDITIONAL',
      latex_free: true,
      list_price: 0.00,
      unit_of_measure: 'EA',
      isFacilityCustom: false
    });
    setIsEditModalOpen(true);
  };

  // Open Edit SKU Modal
  const handleOpenEditModal = (sku) => {
    setSelectedSku(sku);
    setFormData({
      id: sku.id,
      vendor_id: sku.vendor_id,
      family_id: sku.family_id || '',
      component_id: sku.component_id,
      catalog_number: sku.catalog_number,
      product_name: sku.product_name,
      internal_sku: sku.internal_sku || '',
      description: sku.description || '',
      udi_di: sku.udi_di || '',
      hcpcs_c_code: sku.hcpcs_c_code || '',
      secondary_hcpcs_code: sku.secondary_hcpcs_code || '',
      sterile_packaging: sku.sterile_packaging || 'STERILE_PACKAGED',
      laterality: sku.laterality || 'NOT_APPLICABLE',
      material_composition: sku.material_composition || 'TITANIUM',
      size_dimension: sku.size_dimension || '',
      duration_classification: sku.duration_classification || 'PERMANENT',
      mri_safety_status: sku.mri_safety_status || 'MR_CONDITIONAL',
      latex_free: Boolean(sku.latex_free),
      list_price: sku.list_price || 0.00,
      unit_of_measure: sku.unit_of_measure || 'EA',
      isFacilityCustom: Boolean(sku.facility_id)
    });
    setIsEditModalOpen(true);
  };

  // Save SKU
  const handleSaveSku = async (e) => {
    e.preventDefault();
    try {
      await skuService.saveSku({
        ...formData,
        facility_id: formData.isFacilityCustom ? activeFacility?.id : null
      });
      setIsEditModalOpen(false);
      loadSkus();
    } catch (err) {
      alert(err.message || 'Failed to save product SKU');
    }
  };

  // Open Distributor Mapping Drawer
  const handleOpenDistributorModal = async (sku) => {
    setSelectedSku(sku);
    try {
      const maps = await skuService.getDistributorMappings(sku.id);
      setDistributorMappings(maps);
      setNewDistMapping({
        distributor_id: vendorsList.find(v => v.vendor_type === 'DISTRIBUTOR')?.id || '',
        distributor_item_number: '',
        package_unit: 'EA',
        is_preferred_distributor: false
      });
      setIsDistributorModalOpen(true);
    } catch (err) {
      alert('Failed to load distributor mappings');
    }
  };

  // Add Distributor Mapping
  const handleAddDistributorMapping = async (e) => {
    e.preventDefault();
    if (!newDistMapping.distributor_item_number.trim()) {
      alert('Please enter distributor item number');
      return;
    }

    try {
      await skuService.saveDistributorMapping({
        sku_id: selectedSku.id,
        distributor_id: newDistMapping.distributor_id,
        distributor_item_number: newDistMapping.distributor_item_number,
        package_unit: newDistMapping.package_unit,
        is_preferred_distributor: newDistMapping.is_preferred_distributor
      });
      const maps = await skuService.getDistributorMappings(selectedSku.id);
      setDistributorMappings(maps);
      setNewDistMapping(prev => ({ ...prev, distributor_item_number: '' }));
    } catch (err) {
      alert(err.message || 'Failed to save distributor mapping');
    }
  };

  // Safety Recall Modal
  const handleOpenRecallModal = (sku) => {
    setSelectedSku(sku);
    setRecallData({
      recallClass: 'CLASS_II',
      recallDate: new Date().toISOString().split('T')[0],
      recallReason: ''
    });
    setIsRecallModalOpen(true);
  };

  const handleConfirmRecall = async () => {
    if (!recallData.recallReason.trim()) {
      alert('Regulatory recall reason is required');
      return;
    }

    try {
      const res = await skuService.flagSkuRecall(selectedSku.id, recallData);
      alert(`SAFETY ALERT: SKU marked as RECALLED. ${res.impacted_cases_count || 0} surgical cases historically linked.`);
      setIsRecallModalOpen(false);
      loadSkus();
    } catch (err) {
      alert(err.message || 'Failed to flag recall');
    }
  };

  // Deactivate
  const handleOpenDeactivateModal = (sku) => {
    setSelectedSku(sku);
    setDeactivateRationale('');
    setIsDeactivateModalOpen(true);
  };

  const handleConfirmDeactivate = async () => {
    if (!deactivateRationale.trim()) {
      alert('Please enter a mandatory deactivation rationale.');
      return;
    }

    try {
      await skuService.deactivateSku(selectedSku.id, deactivateRationale);
      setIsDeactivateModalOpen(false);
      loadSkus();
    } catch (err) {
      alert(err.message || 'Failed to deactivate SKU');
    }
  };

  // Reactivate
  const handleReactivateSku = async (sku) => {
    if (window.confirm(`Reactivate SKU ${sku.catalog_number} (${sku.product_name})? It will be unlocked for surgical scheduling and preference cards.`)) {
      try {
        await skuService.reactivateSku(sku.id, sku.catalog_number);
        loadSkus();
      } catch (err) {
        alert(err.message || 'Failed to reactivate SKU');
      }
    }
  };

  return (
    <div className="sku-master-container">
      {/* 1. Header Row */}
      <div className="sku-header-row">
        <div className="sku-header-title">
          <h1><Package size={24} className="icon-blue" /> Implant Product SKU Master</h1>
          <p>Phase 54 — Authoritative catalog numbers, FDA UDI-DI specifications, and distributor cross-references</p>
        </div>
        <div className="sku-actions-group">
          {canManage && (
            <button className="btn-primary-sku" onClick={handleOpenAddModal}>
              <Plus size={16} /> Add Product SKU
            </button>
          )}
        </div>
      </div>

      {/* 2. Stat Cards */}
      <div className="sku-metrics-grid">
        <div className="sku-metric-card">
          <div className="sku-metric-icon"><Package size={20} className="icon-blue" /></div>
          <div className="sku-metric-content">
            <span className="sku-metric-val">{metrics.total || 0}</span>
            <span className="sku-metric-lbl">Total Catalog SKUs</span>
          </div>
        </div>
        <div className="sku-metric-card">
          <div className="sku-metric-icon"><CheckCircle size={20} className="icon-emerald" /></div>
          <div className="sku-metric-content">
            <span className="sku-metric-val">{metrics.activeCount || 0}</span>
            <span className="sku-metric-lbl">Active Clinical SKUs</span>
          </div>
        </div>
        <div className="sku-metric-card">
          <div className="sku-metric-icon"><ShieldAlert size={20} className="icon-red" /></div>
          <div className="sku-metric-content">
            <span className="sku-metric-val">{metrics.recalledCount || 0}</span>
            <span className="sku-metric-lbl">Safety Recalled</span>
          </div>
        </div>
        <div className="sku-metric-card">
          <div className="sku-metric-icon"><Layers size={20} className="icon-amber" /></div>
          <div className="sku-metric-content">
            <span className="sku-metric-val">{metrics.activeOemCount || 0}</span>
            <span className="sku-metric-lbl">Multinational OEMs</span>
          </div>
        </div>
      </div>

      {/* 3. Filter Toolbar */}
      <div className="sku-toolbar-card">
        <div className="sku-search-row">
          <div className="sku-search-wrap">
            <Search size={16} className="sku-search-icon" />
            <input
              type="text"
              className="sku-search-input"
              placeholder="Search catalog #, product name, UDI-DI, C-code, internal SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <select
            className="sku-filter-select"
            value={selectedVendorId}
            onChange={(e) => setSelectedVendorId(e.target.value)}
          >
            <option value="">All OEM Manufacturers</option>
            {vendorsList.filter(v => v.vendor_type === 'MANUFACTURER' || v.vendor_type === 'TISSUE_BANK').map(v => (
              <option key={v.id} value={v.id}>{v.display_name} ({v.vendor_code})</option>
            ))}
          </select>

          <select
            className="sku-filter-select"
            value={selectedComponentId}
            onChange={(e) => setSelectedComponentId(e.target.value)}
          >
            <option value="">All Clinical Components</option>
            {componentsList.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
            ))}
          </select>

          <select
            className="sku-filter-select"
            value={selectedLaterality}
            onChange={(e) => setSelectedLaterality(e.target.value)}
          >
            <option value="">All Lateralities</option>
            <option value="LEFT">Left</option>
            <option value="RIGHT">Right</option>
            <option value="BILATERAL">Bilateral</option>
            <option value="NOT_APPLICABLE">Not Applicable</option>
          </select>

          <select
            className="sku-filter-select"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="recalled">Recalled</option>
          </select>
        </div>
      </div>

      {/* 4. SKU Table */}
      <div className="sku-table-card">
        <div className="sku-table-wrap">
          <table className="sku-table">
            <thead>
              <tr>
                <th>Catalog #</th>
                <th>Product Description & Family</th>
                <th>Manufacturer OEM</th>
                <th>Clinical Component</th>
                <th>Laterality</th>
                <th>UDI-DI</th>
                <th>C-Code / Price</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                    Loading master implant product SKUs...
                  </td>
                </tr>
              ) : skus.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                    No implant product SKUs found matching filters.
                  </td>
                </tr>
              ) : (
                skus.map(sku => (
                  <tr key={sku.id}>
                    <td>
                      <span className="badge-code">{sku.catalog_number}</span>
                      {sku.internal_sku && (
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
                          {sku.internal_sku}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: '600', color: '#f8fafc' }}>{sku.product_name}</div>
                      {sku.family?.name && (
                        <div style={{ fontSize: '0.75rem', color: '#38bdf8' }}>
                          Family: {sku.family.name}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="badge-oem">{sku.vendor?.display_name || 'OEM'}</span>
                    </td>
                    <td>
                      <span className="badge-comp">{sku.component?.name || sku.component?.code || 'Component'}</span>
                      {sku.size_dimension && (
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                          {sku.size_dimension}
                        </div>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                        {sku.laterality}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#94a3b8' }}>
                        {sku.udi_di || '—'}
                      </span>
                    </td>
                    <td>
                      <div>
                        {sku.hcpcs_c_code ? (
                          <span style={{ fontWeight: '600', color: '#34d399', fontSize: '0.8rem' }}>{sku.hcpcs_c_code}</span>
                        ) : (
                          <span style={{ color: '#64748b', fontSize: '0.8rem' }}>—</span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        ${Number(sku.list_price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                    </td>
                    <td>
                      <span className={`badge-status status-${sku.status}`}>
                        {sku.status === 'recalled' && <AlertTriangle size={12} />}
                        {sku.status}
                      </span>
                    </td>
                    <td>
                      <div className="sku-actions-cell">
                        {canManage && (
                          <button
                            className="sku-icon-btn"
                            title="Edit Product SKU"
                            onClick={() => handleOpenEditModal(sku)}
                          >
                            <Edit size={14} />
                          </button>
                        )}

                        <button
                          className="sku-icon-btn"
                          title="View Distributor Mappings"
                          onClick={() => handleOpenDistributorModal(sku)}
                        >
                          <Truck size={14} />
                        </button>

                        {canManage && sku.status !== 'recalled' && (
                          <button
                            className="sku-icon-btn recall-btn"
                            title="Trigger Safety Recall"
                            onClick={() => handleOpenRecallModal(sku)}
                          >
                            <ShieldAlert size={14} />
                          </button>
                        )}

                        {canManage && sku.is_active && (
                          <button
                            className="sku-icon-btn danger-btn"
                            title="Deactivate SKU"
                            onClick={() => handleOpenDeactivateModal(sku)}
                          >
                            <Ban size={14} />
                          </button>
                        )}

                        {canManage && !sku.is_active && (
                          <button
                            className="sku-icon-btn reactivate-btn"
                            title="Reactivate SKU"
                            onClick={() => handleReactivateSku(sku)}
                          >
                            <RotateCcw size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 5. Pagination */}
        <div className="sku-pagination-row">
          <div>
            Showing {skus.length} of {metrics.filteredCount || 0} product SKUs
          </div>
          <div className="sku-page-controls">
            <button
              className="btn-secondary-sku"
              disabled={pagination.page <= 1}
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
            >
              Previous
            </button>
            <span>Page {pagination.page} of {pagination.totalPages || 1}</span>
            <button
              className="btn-secondary-sku"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* MODAL 1: ADD / EDIT SKU */}
      {isEditModalOpen && (
        <div className="sku-modal-overlay">
          <div className="sku-modal-card">
            <div className="sku-modal-header">
              <h2>{formData.id ? 'Edit Product SKU' : 'Add New Product SKU'}</h2>
              <button className="sku-close-btn" onClick={() => setIsEditModalOpen(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveSku}>
              <div className="sku-modal-body">
                <div className="sku-form-grid">
                  <div>
                    <label className="sku-form-label">Manufacturer OEM *</label>
                    <select
                      className="sku-form-select"
                      value={formData.vendor_id}
                      onChange={(e) => setFormData({ ...formData, vendor_id: e.target.value })}
                      required
                    >
                      <option value="">Select Manufacturer</option>
                      {vendorsList.filter(v => v.vendor_type === 'MANUFACTURER' || v.vendor_type === 'TISSUE_BANK').map(v => (
                        <option key={v.id} value={v.id}>{v.display_name} ({v.vendor_code})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="sku-form-label">Clinical Component *</label>
                    <select
                      className="sku-form-select"
                      value={formData.component_id}
                      onChange={(e) => setFormData({ ...formData, component_id: e.target.value })}
                      required
                    >
                      <option value="">Select Component</option>
                      {componentsList.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="sku-form-label">Manufacturer Catalog # *</label>
                    <input
                      type="text"
                      className="sku-form-input"
                      placeholder="e.g. 5520-F-401"
                      value={formData.catalog_number}
                      onChange={(e) => setFormData({ ...formData, catalog_number: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <label className="sku-form-label">Product Name / Description *</label>
                    <input
                      type="text"
                      className="sku-form-input"
                      placeholder="e.g. Triathlon CoCr Femoral Component Size 4 Left"
                      value={formData.product_name}
                      onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <label className="sku-form-label">FDA UDI-DI (GTIN-14)</label>
                    <input
                      type="text"
                      className="sku-form-input"
                      placeholder="14-digit numeric GTIN"
                      value={formData.udi_di}
                      onChange={(e) => setFormData({ ...formData, udi_di: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="sku-form-label">CMS Pass-Through C-Code</label>
                    <input
                      type="text"
                      className="sku-form-input"
                      placeholder="e.g. C1776, C1713"
                      value={formData.hcpcs_c_code}
                      onChange={(e) => setFormData({ ...formData, hcpcs_c_code: e.target.value.toUpperCase() })}
                    />
                  </div>

                  <div>
                    <label className="sku-form-label">Laterality</label>
                    <select
                      className="sku-form-select"
                      value={formData.laterality}
                      onChange={(e) => setFormData({ ...formData, laterality: e.target.value })}
                    >
                      {Object.values(LATERALITY_TYPES).map(lat => (
                        <option key={lat} value={lat}>{lat}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="sku-form-label">Material Composition</label>
                    <select
                      className="sku-form-select"
                      value={formData.material_composition}
                      onChange={(e) => setFormData({ ...formData, material_composition: e.target.value })}
                    >
                      {Object.values(MATERIAL_TYPES).map(mat => (
                        <option key={mat} value={mat}>{mat}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="sku-form-label">Sterile Packaging</label>
                    <select
                      className="sku-form-select"
                      value={formData.sterile_packaging}
                      onChange={(e) => setFormData({ ...formData, sterile_packaging: e.target.value })}
                    >
                      {Object.values(STERILE_PACKAGING_TYPES).map(st => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="sku-form-label">Catalog List Price ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="sku-form-input"
                      value={formData.list_price}
                      onChange={(e) => setFormData({ ...formData, list_price: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              </div>
              <div className="sku-modal-footer">
                <button type="button" className="btn-secondary-sku" onClick={() => setIsEditModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary-sku">
                  Save Product SKU
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: DISTRIBUTOR MAPPINGS DRAWER */}
      {isDistributorModalOpen && selectedSku && (
        <div className="sku-modal-overlay">
          <div className="sku-modal-card">
            <div className="sku-modal-header">
              <h2>Distributor Cross-References: {selectedSku.catalog_number}</h2>
              <button className="sku-close-btn" onClick={() => setIsDistributorModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="sku-modal-body">
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
                Maps 3rd-party logistics distributor ordering numbers to this OEM SKU without duplicating the master item.
              </p>

              <div className="dist-mappings-list">
                {distributorMappings.length === 0 ? (
                  <div style={{ color: '#64748b', fontSize: '0.85rem', fontStyle: 'italic' }}>
                    No distributor item numbers currently mapped for this SKU.
                  </div>
                ) : (
                  distributorMappings.map(dm => (
                    <div key={dm.id} className="dist-mapping-item">
                      <div>
                        <span style={{ fontWeight: '600', color: '#f8fafc' }}>{dm.distributor_name || 'Distributor'}</span>
                        <span className="badge-code" style={{ marginLeft: '0.6rem' }}>{dm.distributor_item_number}</span>
                      </div>
                      <div>
                        {dm.is_preferred_distributor && (
                          <span style={{ fontSize: '0.7rem', color: '#34d399', fontWeight: '700', textTransform: 'uppercase' }}>
                            Preferred
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {canManage && (
                <form onSubmit={handleAddDistributorMapping} style={{ marginTop: '1rem', borderTop: '1px solid #334155', paddingTop: '1rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#cbd5e1', display: 'block', marginBottom: '0.6rem' }}>
                    Link New Distributor Item Number
                  </span>
                  <div className="sku-form-grid">
                    <div>
                      <label className="sku-form-label">Distributor *</label>
                      <select
                        className="sku-form-select"
                        value={newDistMapping.distributor_id}
                        onChange={(e) => setNewDistMapping({ ...newDistMapping, distributor_id: e.target.value })}
                        required
                      >
                        <option value="">Select Distributor</option>
                        {vendorsList.filter(v => v.vendor_type === 'DISTRIBUTOR' || v.vendor_type === 'SALES_AGENCY').map(v => (
                          <option key={v.id} value={v.id}>{v.display_name} ({v.vendor_code})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="sku-form-label">Distributor Item # *</label>
                      <input
                        type="text"
                        className="sku-form-input"
                        placeholder="e.g. CH-9411-401"
                        value={newDistMapping.distributor_item_number}
                        onChange={(e) => setNewDistMapping({ ...newDistMapping, distributor_item_number: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="submit" className="btn-primary-sku">
                      Add Distributor Mapping
                    </button>
                  </div>
                </form>
              )}
            </div>
            <div className="sku-modal-footer">
              <button className="btn-secondary-sku" onClick={() => setIsDistributorModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: SAFETY RECALL TRIGGER */}
      {isRecallModalOpen && selectedSku && (
        <div className="sku-modal-overlay">
          <div className="sku-modal-card">
            <div className="sku-modal-header recall-header">
              <h2><ShieldAlert size={20} /> Initiate Medical Device Safety Recall</h2>
              <button className="sku-close-btn" onClick={() => setIsRecallModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="sku-modal-body">
              <div className="recall-warning-box">
                <strong>CRITICAL REGULATORY SAFETY ACTION:</strong> Triggering a safety recall locks this SKU against any future surgical case usage and flags historical patient charts for medical director inspection.
              </div>

              <div className="sku-form-grid">
                <div>
                  <label className="sku-form-label">Recall Severity Class *</label>
                  <select
                    className="sku-form-select"
                    value={recallData.recallClass}
                    onChange={(e) => setRecallData({ ...recallData, recallClass: e.target.value })}
                  >
                    <option value="CLASS_I">Class I — Reasonable probability of serious adverse health consequences or death</option>
                    <option value="CLASS_II">Class II — May cause temporary or medically reversible adverse health consequences</option>
                    <option value="CLASS_III">Class III — Not likely to cause adverse health consequences</option>
                  </select>
                </div>
                <div>
                  <label className="sku-form-label">Official Recall Date *</label>
                  <input
                    type="date"
                    className="sku-form-input"
                    value={recallData.recallDate}
                    onChange={(e) => setRecallData({ ...recallData, recallDate: e.target.value })}
                    required
                  />
                </div>
                <div className="form-col-full">
                  <label className="sku-form-label">Regulatory Narrative / Reason *</label>
                  <textarea
                    rows="3"
                    className="sku-form-input"
                    placeholder="Enter official FDA/manufacturer recall justification and instructions..."
                    value={recallData.recallReason}
                    onChange={(e) => setRecallData({ ...recallData, recallReason: e.target.value })}
                    required
                  />
                </div>
              </div>
            </div>
            <div className="sku-modal-footer">
              <button className="btn-secondary-sku" onClick={() => setIsRecallModalOpen(false)}>
                Cancel
              </button>
              <button
                className="btn-primary-sku"
                style={{ backgroundColor: '#dc2626', borderColor: '#b91c1c' }}
                onClick={handleConfirmRecall}
              >
                Execute Safety Recall
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: DEACTIVATE WITH RATIONALE */}
      {isDeactivateModalOpen && selectedSku && (
        <div className="sku-modal-overlay">
          <div className="sku-modal-card">
            <div className="sku-modal-header">
              <h2>Deactivate Product SKU: {selectedSku.catalog_number}</h2>
              <button className="sku-close-btn" onClick={() => setIsDeactivateModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="sku-modal-body">
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#cbd5e1' }}>
                Deactivating halts new scheduling and preference card selections. Historical case records will be preserved.
              </p>
              <div>
                <label className="sku-form-label">Audit Deactivation Rationale *</label>
                <textarea
                  rows="3"
                  className="sku-form-input"
                  placeholder="e.g. Manufacturer discontinued model in favor of next-generation platform..."
                  value={deactivateRationale}
                  onChange={(e) => setDeactivateRationale(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="sku-modal-footer">
              <button className="btn-secondary-sku" onClick={() => setIsDeactivateModalOpen(false)}>
                Cancel
              </button>
              <button
                className="btn-primary-sku"
                style={{ backgroundColor: '#dc2626', borderColor: '#b91c1c' }}
                onClick={handleConfirmDeactivate}
              >
                Confirm Deactivation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
