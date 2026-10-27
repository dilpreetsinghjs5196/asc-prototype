import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Building2,
  Search,
  Plus,
  X,
  AlertTriangle,
  CheckCircle2,
  Filter,
  Shield,
  Truck,
  ExternalLink,
  Edit2,
  Ban,
  RefreshCw,
  GitFork,
  FileText,
  RotateCcw
} from 'lucide-react';
import {
  vendorService,
  VENDOR_TYPES,
  VENDOR_STATUSES,
  RELATIONSHIP_TYPES,
  GLOBAL_BASELINE_VENDORS
} from '../lib/vendorService.js';
import './ImplantVendorMaster.css';

const SPECIALTIES_LIST = [
  'All',
  'Orthopedics',
  'Spine',
  'Ophthalmology',
  'Pain Management',
  'Plastic Surgery',
  'Podiatry',
  'Sports Medicine',
  'Cardiovascular',
  'ENT'
];

export default function ImplantVendorMaster({
  activeFacility = null,
  userPermissions = ['implants.view_catalog', 'implants.manage_catalog']
}) {
  const [vendors, setVendors] = useState([]);
  const [metrics, setMetrics] = useState({ total: 0, activeManufacturers: 0, activeDistributors: 0, activeTissueBanks: 0 });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [specialtyFilter, setSpecialtyFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [scopeFilter, setScopeFilter] = useState('ALL'); // ALL, GLOBAL, FACILITY
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isRelModalOpen, setIsRelModalOpen] = useState(false);
  const [isDeactivateModalOpen, setIsDeactivateModalOpen] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState(null);

  // Form State for Add / Edit
  const [formData, setFormData] = useState({
    id: null,
    vendor_code: '',
    legal_name: '',
    display_name: '',
    vendor_type: 'MANUFACTURER',
    specialties: [],
    tax_id_ein: '',
    duns_number: '',
    fda_fei: '',
    business_email: '',
    business_phone: '',
    website: '',
    rep_name: '',
    rep_email: '',
    rep_phone: '',
    notes: '',
    status: 'active',
    isFacilityCustom: false
  });

  // Duplicate candidate warning state
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [confirmNonDuplicate, setConfirmNonDuplicate] = useState(false);

  // Deactivate Form State
  const [deactivateRationale, setDeactivateRationale] = useState('');

  // Relationship Form State
  const [vendorRelationships, setVendorRelationships] = useState([]);
  const [newRelData, setNewRelData] = useState({
    partner_id: '',
    relationship_type: 'AUTHORIZED_DISTRIBUTOR',
    territory_scope: 'National'
  });

  const canManageCatalog = userPermissions.includes('implants.manage_catalog') || userPermissions.includes('admin');

  // Load vendors
  const fetchVendors = useCallback(async () => {
    setLoading(true);
    try {
      const facilityIdParam = scopeFilter === 'FACILITY' ? activeFacility?.id : null;
      const res = await vendorService.getVendors({
        search: searchQuery,
        vendorType: typeFilter === 'ALL' ? null : typeFilter,
        specialty: specialtyFilter === 'All' ? null : specialtyFilter,
        status: statusFilter === 'ALL' ? null : statusFilter,
        facilityId: facilityIdParam,
        page: currentPage,
        limit: 25,
        includeInactive: statusFilter === 'inactive' || statusFilter === 'ALL'
      });

      // Filter by Scope if GLOBAL
      let filteredList = res.vendors;
      if (scopeFilter === 'GLOBAL') {
        filteredList = filteredList.filter(v => v.facility_id === null);
      } else if (scopeFilter === 'FACILITY' && activeFacility?.id) {
        filteredList = filteredList.filter(v => v.facility_id === activeFacility.id);
      }

      setVendors(filteredList);
      setMetrics(res.metrics);
      setTotalPages(res.pagination.totalPages);
    } catch (err) {
      console.warn('Error loading vendors, fallback to baseline:', err);
      setVendors(GLOBAL_BASELINE_VENDORS);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, typeFilter, specialtyFilter, statusFilter, scopeFilter, currentPage, activeFacility]);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  // Handle Form Change with real-time duplicate check
  const handleInputChange = (field, value) => {
    setFormData(prev => {
      const next = { ...prev, [field]: value };
      
      // If changing legal name or vendor code, perform duplicate analysis
      if (field === 'legal_name' || field === 'vendor_code') {
        const testName = field === 'legal_name' ? value : next.legal_name;
        const testCode = field === 'vendor_code' ? value : next.vendor_code;
        
        if (testName && testName.trim().length >= 3) {
          const dupRes = vendorService.checkDuplicateCandidates(
            testName,
            testCode,
            next.isFacilityCustom ? activeFacility?.id : null
          );
          if (dupRes.hasWarningCandidates || dupRes.hasExactCollision) {
            setDuplicateWarning(dupRes);
            setConfirmNonDuplicate(false);
          } else {
            setDuplicateWarning(null);
            setConfirmNonDuplicate(false);
          }
        } else {
          setDuplicateWarning(null);
        }
      }
      return next;
    });
  };

  const handleOpenAddModal = () => {
    setSelectedVendor(null);
    setFormData({
      id: null,
      vendor_code: '',
      legal_name: '',
      display_name: '',
      vendor_type: 'MANUFACTURER',
      specialties: ['Orthopedics'],
      tax_id_ein: '',
      duns_number: '',
      fda_fei: '',
      business_email: '',
      business_phone: '',
      website: '',
      rep_name: '',
      rep_email: '',
      rep_phone: '',
      notes: '',
      isFacilityCustom: false
    });
    setDuplicateWarning(null);
    setConfirmNonDuplicate(false);
    setIsEditModalOpen(true);
  };

  const handleOpenEditModal = (vendor) => {
    setSelectedVendor(vendor);
    setFormData({
      id: vendor.id,
      vendor_code: vendor.vendor_code,
      legal_name: vendor.legal_name,
      display_name: vendor.display_name,
      vendor_type: vendor.vendor_type,
      specialties: Array.isArray(vendor.specialties) ? vendor.specialties : [],
      tax_id_ein: vendor.tax_id_ein || '',
      duns_number: vendor.duns_number || '',
      fda_fei: vendor.fda_establishment_identifier || '',
      business_email: vendor.business_email || '',
      business_phone: vendor.business_phone || '',
      website: vendor.website || '',
      rep_name: vendor.rep_name || '',
      rep_email: vendor.rep_email || '',
      rep_phone: vendor.rep_phone || '',
      notes: vendor.notes || '',
      isFacilityCustom: Boolean(vendor.facility_id)
    });
    setDuplicateWarning(null);
    setConfirmNonDuplicate(false);
    setIsEditModalOpen(true);
  };

  const handleSaveVendor = async (e) => {
    e.preventDefault();

    // Check duplicate warning bypass
    if (duplicateWarning?.hasWarningCandidates && !confirmNonDuplicate) {
      alert('Please review the duplicate candidate warning and check the confirmation box to proceed.');
      return;
    }

    try {
      await vendorService.saveVendor({
        id: formData.id,
        facility_id: formData.isFacilityCustom ? activeFacility?.id : null,
        vendor_code: formData.vendor_code,
        legal_name: formData.legal_name,
        display_name: formData.display_name,
        vendor_type: formData.vendor_type,
        specialties: formData.specialties,
        tax_id_ein: formData.tax_id_ein,
        duns_number: formData.duns_number,
        fda_fei: formData.fda_fei,
        business_email: formData.business_email,
        business_phone: formData.business_phone,
        website: formData.website,
        rep_name: formData.rep_name,
        rep_email: formData.rep_email,
        rep_phone: formData.rep_phone,
        notes: formData.notes
      });

      setIsEditModalOpen(false);
      fetchVendors();
    } catch (err) {
      alert(err.message || 'Failed to save vendor');
    }
  };

  const handleReactivateVendor = async (vendor) => {
    if (window.confirm(`Are you sure you want to reactivate ${vendor.display_name} (${vendor.vendor_code})? This vendor will be unlocked for surgical scheduling and contracts.`)) {
      try {
        await vendorService.reactivateVendor(vendor.id, vendor.vendor_code);
        fetchVendors();
      } catch (err) {
        alert(err.message || 'Failed to reactivate vendor');
      }
    }
  };

  const handleOpenDeactivateModal = (vendor) => {
    setSelectedVendor(vendor);
    setDeactivateRationale('');
    setIsDeactivateModalOpen(true);
  };

  const handleConfirmDeactivate = async () => {
    if (!deactivateRationale.trim()) {
      alert('Please enter a mandatory deactivation rationale.');
      return;
    }

    try {
      await vendorService.deactivateVendor(selectedVendor.id, deactivateRationale);
      setIsDeactivateModalOpen(false);
      fetchVendors();
    } catch (err) {
      alert(err.message || 'Failed to deactivate vendor');
    }
  };

  const handleOpenRelationships = async (vendor) => {
    setSelectedVendor(vendor);
    try {
      const rels = await vendorService.getVendorRelationships(vendor.id);
      setVendorRelationships(rels);
    } catch (err) {
      setVendorRelationships([]);
    }
    setNewRelData({
      partner_id: '',
      relationship_type: 'AUTHORIZED_DISTRIBUTOR',
      territory_scope: 'National'
    });
    setIsRelModalOpen(true);
  };

  const handleAddRelationship = async (e) => {
    e.preventDefault();
    if (!newRelData.partner_id) {
      alert('Please select a partner vendor.');
      return;
    }

    try {
      const isDistributor = selectedVendor.vendor_type === VENDOR_TYPES.DISTRIBUTOR;
      await vendorService.saveRelationship({
        distributor_id: isDistributor ? selectedVendor.id : newRelData.partner_id,
        manufacturer_id: isDistributor ? newRelData.partner_id : selectedVendor.id,
        relationship_type: newRelData.relationship_type,
        territory_scope: newRelData.territory_scope
      });

      const updated = await vendorService.getVendorRelationships(selectedVendor.id);
      setVendorRelationships(updated);
      setNewRelData(prev => ({ ...prev, partner_id: '' }));
    } catch (err) {
      alert(err.message || 'Failed to save relationship');
    }
  };

  const handleDeleteRelationship = async (relId) => {
    if (window.confirm('Are you sure you want to remove this distributor relationship link?')) {
      await vendorService.deleteRelationship(relId);
      const updated = await vendorService.getVendorRelationships(selectedVendor.id);
      setVendorRelationships(updated);
    }
  };

  const availablePartners = useMemo(() => {
    if (!selectedVendor) return [];
    const isDistributor = selectedVendor.vendor_type === VENDOR_TYPES.DISTRIBUTOR;
    return vendors.filter(v => {
      if (v.id === selectedVendor.id) return false;
      return isDistributor ? v.vendor_type === VENDOR_TYPES.MANUFACTURER : v.vendor_type === VENDOR_TYPES.DISTRIBUTOR;
    });
  }, [vendors, selectedVendor]);

  return (
    <div className="vendor-master-container">
      {/* Header Bar */}
      <div className="vendor-header-bar">
        <div className="vendor-title-section">
          <h2>
            <Building2 size={24} style={{ color: '#38bdf8' }} />
            Implant Vendor Master Directory
          </h2>
          <p>Phase 53 — Authoritative Medical Device Manufacturers, Distributors & Sourcing Governance</p>
        </div>
        <div className="vendor-header-actions">
          <button className="btn-secondary-vendor" onClick={fetchVendors} title="Refresh Directory">
            <RefreshCw size={15} />
            Refresh
          </button>
          {canManageCatalog && (
            <button className="btn-primary-vendor" onClick={handleOpenAddModal}>
              <Plus size={16} />
              Add Vendor
            </button>
          )}
        </div>
      </div>

      {/* Summary KPI Metrics */}
      <div className="vendor-metrics-row">
        <div className="vendor-metric-card">
          <span className="metric-label">
            <Building2 size={14} /> Total Suppliers
          </span>
          <span className="metric-value">{metrics.total}</span>
        </div>
        <div className="vendor-metric-card">
          <span className="metric-label">
            <Shield size={14} style={{ color: '#38bdf8' }} /> Active OEMs
          </span>
          <span className="metric-value">{metrics.activeManufacturers}</span>
        </div>
        <div className="vendor-metric-card">
          <span className="metric-label">
            <Truck size={14} style={{ color: '#60a5fa' }} /> Authorized Distributors
          </span>
          <span className="metric-value">{metrics.activeDistributors}</span>
        </div>
        <div className="vendor-metric-card">
          <span className="metric-label">
            <FileText size={14} style={{ color: '#34d399' }} /> Tissue Banks
          </span>
          <span className="metric-value">{metrics.activeTissueBanks}</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="vendor-filter-bar">
        <div className="vendor-search-input-wrapper">
          <Search size={16} />
          <input
            type="text"
            className="vendor-search-input"
            placeholder="Search vendor code, legal entity, trade name, EIN..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <select
          className="vendor-select-filter"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="ALL">All Supplier Types</option>
          <option value={VENDOR_TYPES.MANUFACTURER}>Manufacturers (OEM)</option>
          <option value={VENDOR_TYPES.DISTRIBUTOR}>Distributors</option>
          <option value={VENDOR_TYPES.TISSUE_BANK}>Tissue Banks</option>
          <option value={VENDOR_TYPES.GPO_CONGLOMERATE}>GPO Conglomerates</option>
          <option value={VENDOR_TYPES.SALES_AGENCY}>Sales Agencies</option>
        </select>

        <select
          className="vendor-select-filter"
          value={specialtyFilter}
          onChange={(e) => setSpecialtyFilter(e.target.value)}
        >
          {SPECIALTIES_LIST.map(spec => (
            <option key={spec} value={spec}>{spec} Specialty</option>
          ))}
        </select>

        <select
          className="vendor-select-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="ALL">All Statuses</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
          <option value="pending_verification">Pending Verification</option>
        </select>

        <select
          className="vendor-select-filter"
          value={scopeFilter}
          onChange={(e) => setScopeFilter(e.target.value)}
        >
          <option value="ALL">Global + Facility Scope</option>
          <option value="GLOBAL">Global Baseline Only</option>
          <option value="FACILITY">Facility Custom Only</option>
        </select>
      </div>

      {/* Vendor Master Table */}
      <div className="vendor-table-card">
        <div className="vendor-table-responsive">
          <table className="vendor-data-table">
            <thead>
              <tr>
                <th>Vendor Code</th>
                <th>Display Trade Name</th>
                <th>Legal Entity Name</th>
                <th>Classification</th>
                <th>Specialties</th>
                <th>Status</th>
                <th>Scope</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                    <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px auto', display: 'block' }} />
                    Loading vendor master directory...
                  </td>
                </tr>
              ) : vendors.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                    <Building2 size={32} style={{ margin: '0 auto 12px auto', display: 'block', opacity: 0.5 }} />
                    No vendor suppliers match your search criteria.
                  </td>
                </tr>
              ) : (
                vendors.map((vendor) => {
                  const isGlobal = vendor.facility_id === null;
                  return (
                    <tr key={vendor.id}>
                      <td>
                        <span className="vendor-code-badge">{vendor.vendor_code}</span>
                      </td>
                      <td>
                        <div style={{ fontWeight: '600', color: '#f8fafc' }}>
                          {vendor.display_name}
                        </div>
                        {vendor.website && (
                          <a
                            href={vendor.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: '0.75rem', color: '#38bdf8', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                          >
                            {vendor.website.replace('https://', '').replace('www.', '')}
                            <ExternalLink size={10} />
                          </a>
                        )}
                      </td>
                      <td>
                        <div style={{ color: '#cbd5e1' }}>{vendor.legal_name}</div>
                        {vendor.tax_id_ein && (
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>EIN: {vendor.tax_id_ein}</div>
                        )}
                      </td>
                      <td>
                        <span className={`vendor-type-tag type-${vendor.vendor_type.toLowerCase().replace('_', '-')}`}>
                          {vendor.vendor_type}
                        </span>
                      </td>
                      <td>
                        <div className="vendor-specialties-wrap">
                          {Array.isArray(vendor.specialties) && vendor.specialties.length > 0 ? (
                            vendor.specialties.map(spec => (
                              <span key={spec} className="specialty-pill">{spec}</span>
                            ))
                          ) : (
                            <span style={{ color: '#64748b', fontSize: '0.75rem' }}>All</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`status-badge status-${vendor.status}`}>
                          {vendor.is_active ? <CheckCircle2 size={12} /> : <Ban size={12} />}
                          {vendor.status.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        {isGlobal ? (
                          <span className="scope-badge-global">GLOBAL</span>
                        ) : (
                          <span className="scope-badge-facility">FACILITY</span>
                        )}
                      </td>
                      <td>
                        <div className="vendor-action-btn-group">
                          {canManageCatalog && (
                            <button
                              className="vendor-action-btn"
                              title="Edit Vendor"
                              onClick={() => handleOpenEditModal(vendor)}
                            >
                              <Edit2 size={14} />
                            </button>
                          )}
                          <button
                            className="vendor-action-btn"
                            title="Distributor / Manufacturer Relationships"
                            onClick={() => handleOpenRelationships(vendor)}
                          >
                            <GitFork size={14} />
                          </button>
                          {canManageCatalog && vendor.is_active && (
                            <button
                              className="vendor-action-btn btn-danger"
                              title="Deactivate Vendor"
                              onClick={() => handleOpenDeactivateModal(vendor)}
                            >
                              <Ban size={14} />
                            </button>
                          )}
                          {canManageCatalog && !vendor.is_active && (
                            <button
                              className="vendor-action-btn"
                              style={{ color: '#34d399', borderColor: '#059669' }}
                              title="Reactivate Vendor (Restore to Active)"
                              onClick={() => handleReactivateVendor(vendor)}
                            >
                              <RotateCcw size={14} />
                            </button>
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

        {/* Pagination Footer */}
        <div className="vendor-pagination-footer">
          <span>Showing {vendors.length} vendors (Page {currentPage} of {totalPages})</span>
          <div className="vendor-page-controls">
            <button
              className="btn-secondary-vendor"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              className="btn-secondary-vendor"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Add / Edit Vendor Modal */}
      {isEditModalOpen && (
        <div className="vendor-modal-overlay">
          <div className="vendor-modal-card">
            <div className="vendor-modal-header">
              <h3>{formData.id ? 'Edit Vendor Supplier' : 'Add New Vendor Supplier'}</h3>
              <button
                className="vendor-action-btn"
                onClick={() => setIsEditModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveVendor}>
              <div className="vendor-modal-body">
                {/* Duplicate Warning Banner */}
                {duplicateWarning && duplicateWarning.hasWarningCandidates && (
                  <div className="duplicate-warning-banner">
                    <div className="duplicate-warning-title">
                      <AlertTriangle size={18} />
                      Potential Duplicate Supplier Detected
                    </div>
                    <div>
                      An existing supplier matches with high similarity ($&gt;85\%$). Please verify this is not a duplicate:
                    </div>
                    {duplicateWarning.candidateMatches.map(({ vendor, score }) => (
                      <div key={vendor.id} className="duplicate-candidate-item">
                        <span><strong>{vendor.display_name}</strong> ({vendor.legal_name}) — Code: <code>{vendor.vendor_code}</code></span>
                        <span style={{ color: '#fbbf24', fontWeight: '700' }}>{Math.round(score * 100)}% match</span>
                      </div>
                    ))}
                    <label className="duplicate-confirm-label">
                      <input
                        type="checkbox"
                        checked={confirmNonDuplicate}
                        onChange={(e) => setConfirmNonDuplicate(e.target.checked)}
                      />
                      Confirm this is a distinct, non-duplicate supplier and proceed.
                    </label>
                  </div>
                )}

                <div className="vendor-form-grid">
                  <div>
                    <label className="vendor-form-label">Vendor Code *</label>
                    <input
                      type="text"
                      className="vendor-form-input"
                      placeholder="e.g. STRYKER, ZIMMER"
                      value={formData.vendor_code}
                      onChange={(e) => handleInputChange('vendor_code', e.target.value.toUpperCase())}
                      required
                      disabled={Boolean(formData.id)}
                    />
                  </div>

                  <div>
                    <label className="vendor-form-label">Vendor Classification *</label>
                    <select
                      className="vendor-form-select"
                      value={formData.vendor_type}
                      onChange={(e) => handleInputChange('vendor_type', e.target.value)}
                    >
                      <option value="MANUFACTURER">Manufacturer (OEM)</option>
                      <option value="DISTRIBUTOR">Commercial Distributor</option>
                      <option value="TISSUE_BANK">Tissue Bank (HCT/P)</option>
                      <option value="GPO_CONGLOMERATE">GPO Conglomerate</option>
                      <option value="SALES_AGENCY">Local Sales Agency</option>
                    </select>
                  </div>

                  <div className="form-group-full">
                    <label className="vendor-form-label">Official Legal Entity Name *</label>
                    <input
                      type="text"
                      className="vendor-form-input"
                      placeholder="e.g. Howmedica Osteonics Corp."
                      value={formData.legal_name}
                      onChange={(e) => handleInputChange('legal_name', e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group-full">
                    <label className="vendor-form-label">Display / Trade Name *</label>
                    <input
                      type="text"
                      className="vendor-form-input"
                      placeholder="e.g. Stryker Orthopaedics"
                      value={formData.display_name}
                      onChange={(e) => handleInputChange('display_name', e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="vendor-form-label">Federal EIN / Tax ID</label>
                    <input
                      type="text"
                      className="vendor-form-input"
                      placeholder="XX-XXXXXXX"
                      value={formData.tax_id_ein}
                      onChange={(e) => handleInputChange('tax_id_ein', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="vendor-form-label">FDA Establishment Identifier (FEI)</label>
                    <input
                      type="text"
                      className="vendor-form-input"
                      placeholder="FEI-XXXXXXX"
                      value={formData.fda_fei}
                      onChange={(e) => handleInputChange('fda_fei', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="vendor-form-label">Business Email</label>
                    <input
                      type="email"
                      className="vendor-form-input"
                      placeholder="orders@vendor.com"
                      value={formData.business_email}
                      onChange={(e) => handleInputChange('business_email', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="vendor-form-label">Business Phone</label>
                    <input
                      type="text"
                      className="vendor-form-input"
                      placeholder="(800) 555-0199"
                      value={formData.business_phone}
                      onChange={(e) => handleInputChange('business_phone', e.target.value)}
                    />
                  </div>

                  <div className="form-group-full">
                    <label className="vendor-form-label">Corporate Website URL</label>
                    <input
                      type="url"
                      className="vendor-form-input"
                      placeholder="https://www.vendor.com"
                      value={formData.website}
                      onChange={(e) => handleInputChange('website', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="vendor-form-label">Designated Rep Name</label>
                    <input
                      type="text"
                      className="vendor-form-input"
                      placeholder="Account Manager / Rep"
                      value={formData.rep_name}
                      onChange={(e) => handleInputChange('rep_name', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="vendor-form-label">Rep Contact Email</label>
                    <input
                      type="email"
                      className="vendor-form-input"
                      placeholder="rep@vendor.com"
                      value={formData.rep_email}
                      onChange={(e) => handleInputChange('rep_email', e.target.value)}
                    />
                  </div>

                  <div className="form-group-full">
                    <label className="vendor-form-label">Governance Notes</label>
                    <textarea
                      className="vendor-form-textarea"
                      rows={2}
                      placeholder="Internal materials management notes..."
                      value={formData.notes}
                      onChange={(e) => handleInputChange('notes', e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="vendor-modal-footer">
                <button
                  type="button"
                  className="btn-secondary-vendor"
                  onClick={() => setIsEditModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary-vendor">
                  Save Vendor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Distributor - Manufacturer Relationships Modal */}
      {isRelModalOpen && selectedVendor && (
        <div className="vendor-modal-overlay">
          <div className="vendor-modal-card">
            <div className="vendor-modal-header">
              <h3>
                <GitFork size={18} style={{ color: '#38bdf8' }} />
                Sourcing Relationships: {selectedVendor.display_name}
              </h3>
              <button
                className="vendor-action-btn"
                onClick={() => setIsRelModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="vendor-modal-body">
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#94a3b8' }}>
                {selectedVendor.vendor_type === VENDOR_TYPES.DISTRIBUTOR
                  ? 'This distributor supplies products manufactured by the following OEMs:'
                  : 'This manufacturer is distributed by the following authorized channels:'}
              </p>

              {vendorRelationships.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', backgroundColor: '#0f172a', borderRadius: '8px', color: '#64748b' }}>
                  No active distributor relationships established.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {vendorRelationships.map(rel => {
                    const partner = selectedVendor.vendor_type === VENDOR_TYPES.DISTRIBUTOR
                      ? rel.manufacturer
                      : rel.distributor;
                    return (
                      <div key={rel.id} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        backgroundColor: '#0f172a',
                        padding: '10px 14px',
                        borderRadius: '6px',
                        border: '1px solid #334155'
                      }}>
                        <div>
                          <div style={{ fontWeight: '600', color: '#f8fafc' }}>
                            {partner?.display_name || 'Partner Supplier'}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#38bdf8' }}>
                            {rel.relationship_type.replace(/_/g, ' ')} • Territory: {rel.territory_scope}
                          </div>
                        </div>
                        {canManageCatalog && (
                          <button
                            className="vendor-action-btn btn-danger"
                            title="Remove link"
                            onClick={() => handleDeleteRelationship(rel.id)}
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add New Relationship */}
              {canManageCatalog && (
                <form onSubmit={handleAddRelationship} style={{
                  borderTop: '1px solid #334155',
                  paddingTop: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  <div style={{ fontWeight: '600', fontSize: '0.875rem', color: '#f8fafc' }}>
                    Link New Authorized {selectedVendor.vendor_type === VENDOR_TYPES.DISTRIBUTOR ? 'Manufacturer' : 'Distributor'}
                  </div>
                  <div className="vendor-form-grid">
                    <div>
                      <label className="vendor-form-label">Partner Vendor *</label>
                      <select
                        className="vendor-form-select"
                        value={newRelData.partner_id}
                        onChange={(e) => setNewRelData(prev => ({ ...prev, partner_id: e.target.value }))}
                        required
                      >
                        <option value="">Select supplier...</option>
                        {availablePartners.map(p => (
                          <option key={p.id} value={p.id}>{p.display_name} ({p.vendor_code})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="vendor-form-label">Relationship Type</label>
                      <select
                        className="vendor-form-select"
                        value={newRelData.relationship_type}
                        onChange={(e) => setNewRelData(prev => ({ ...prev, relationship_type: e.target.value }))}
                      >
                        <option value="AUTHORIZED_DISTRIBUTOR">Authorized Distributor</option>
                        <option value="EXCLUSIVE_DISTRIBUTOR">Exclusive Distributor</option>
                        <option value="LOCAL_REP_AGENCY">Local Rep Agency</option>
                        <option value="GPO_CONTRACT_DISTRIBUTOR">GPO Contract Distributor</option>
                      </select>
                    </div>

                    <div className="form-group-full">
                      <label className="vendor-form-label">Territory Scope</label>
                      <input
                        type="text"
                        className="vendor-form-input"
                        placeholder="e.g. National, Florida West Coast, Regional"
                        value={newRelData.territory_scope}
                        onChange={(e) => setNewRelData(prev => ({ ...prev, territory_scope: e.target.value }))}
                      />
                    </div>
                  </div>

                  <button type="submit" className="btn-primary-vendor" style={{ alignSelf: 'flex-start' }}>
                    <Plus size={14} /> Add Sourcing Link
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Deactivation Modal */}
      {isDeactivateModalOpen && selectedVendor && (
        <div className="vendor-modal-overlay">
          <div className="vendor-modal-card" style={{ maxWidth: '500px' }}>
            <div className="vendor-modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f87171' }}>
                <Ban size={20} />
                Confirm Supplier Deactivation
              </h3>
              <button
                className="vendor-action-btn"
                onClick={() => setIsDeactivateModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="vendor-modal-body">
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#e2e8f0' }}>
                You are about to deactivate <strong>{selectedVendor.display_name}</strong> (<code>{selectedVendor.vendor_code}</code>).
              </p>
              <div style={{ backgroundColor: '#450a0a', border: '1px solid #dc2626', padding: '12px', borderRadius: '6px', fontSize: '0.8125rem', color: '#fecaca' }}>
                ⚠️ <strong>Lifecycle Impact:</strong>
                <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                  <li>Existing historical case implant usage and billed claims remain preserved.</li>
                  <li>This vendor will be blocked from being selected on new surgical encounters.</li>
                  <li>New contracts cannot be authored with this supplier.</li>
                </ul>
              </div>

              <div>
                <label className="vendor-form-label">Mandatory Deactivation Rationale *</label>
                <textarea
                  className="vendor-form-textarea"
                  rows={3}
                  placeholder="Explain why this vendor is being deactivated (e.g. Contract terminated, vendor acquired, formulary change)..."
                  value={deactivateRationale}
                  onChange={(e) => setDeactivateRationale(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="vendor-modal-footer">
              <button
                type="button"
                className="btn-secondary-vendor"
                onClick={() => setIsDeactivateModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary-vendor"
                style={{ backgroundColor: '#dc2626' }}
                onClick={handleConfirmDeactivate}
              >
                Deactivate Supplier
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
