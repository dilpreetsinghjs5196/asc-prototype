import React, { useState, useEffect } from 'react';
import { db } from '../lib/supabase';
import { rbacService } from '../lib/rbacService';
import {
  Building2, Plus, Search, Filter, CheckCircle2, XCircle,
  Edit, Users, Shield, Copy, Check, Phone,
  MapPin, Clock, ArrowUpDown, RefreshCw, X
} from 'lucide-react';
import Swal from 'sweetalert2';
import './FacilityManagement.css';

export default function FacilityManagement({ onSelectFacility, onNavigateToUsers }) {
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [copiedId, setCopiedId] = useState(null);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedFacility, setSelectedFacility] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form State
  const initialFormState = {
    name: '',
    license_number: '',
    timezone: 'America/New_York',
    address: '',
    city: '',
    state: 'FL',
    zip: '',
    phone: '',
    tax_id: '',
    npi: '',
    apply_medicare_mppr: false,
    designated_admin_email: '',
    designated_admin_name: ''
  };

  const [formData, setFormData] = useState(initialFormState);

  const session = db.getSession();
  const currentRole = rbacService.normalizeRole(session?.role);
  const isSuperAdmin = currentRole === 'super_admin';

  const loadFacilities = async () => {
    setLoading(true);
    try {
      const data = await db.getFacilitiesWithStats();
      setFacilities(data || []);
    } catch (err) {
      console.error('Failed to load facilities:', err);
      Swal.fire('Error', 'Unable to retrieve facility directory.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const fetchInitialData = async () => {
      try {
        const data = await db.getFacilitiesWithStats();
        if (isMounted) {
          setFacilities(data || []);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to load facilities:', err);
        if (isMounted) {
          Swal.fire('Error', 'Unable to retrieve facility directory.', 'error');
          setLoading(false);
        }
      }
    };
    fetchInitialData();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleCopyId = (id) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openCreateModal = () => {
    setFormData(initialFormState);
    setIsCreateOpen(true);
  };

  const openEditModal = (fac) => {
    setSelectedFacility(fac);
    setFormData({
      name: fac.name || '',
      license_number: fac.license_number || '',
      timezone: fac.timezone || 'America/New_York',
      address: fac.address || '',
      city: fac.city || '',
      state: fac.state || 'FL',
      zip: fac.zip || '',
      phone: fac.phone || '',
      tax_id: fac.tax_id || '',
      npi: fac.npi || '',
      apply_medicare_mppr: Boolean(fac.apply_medicare_mppr),
      status: fac.status || (fac.is_active ? 'active' : 'inactive'),
      designated_admin_id: fac.designated_admin_id || ''
    });
    setIsEditOpen(true);
  };

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Submit Create Facility
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      Swal.fire('Required Field', 'Please provide a valid facility name.', 'warning');
      return;
    }

    setSaving(true);
    try {
      await db.createFacility({
        name: formData.name.trim(),
        license_number: formData.license_number.trim(),
        timezone: formData.timezone,
        address: formData.address.trim(),
        city: formData.city.trim(),
        state: formData.state.trim().toUpperCase(),
        zip: formData.zip.trim(),
        phone: formData.phone.trim(),
        tax_id: formData.tax_id.trim(),
        npi: formData.npi.trim(),
        apply_medicare_mppr: formData.apply_medicare_mppr
      });

      setIsCreateOpen(false);
      Swal.fire({
        icon: 'success',
        title: 'Facility Provisioned',
        text: `Facility "${formData.name}" has been successfully added to the system.`,
        timer: 2000,
        showConfirmButton: false
      });
      await loadFacilities();
    } catch (err) {
      console.error('Create facility error:', err);
      Swal.fire('Error', err.message || 'Failed to create facility.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Submit Edit Facility
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      Swal.fire('Required Field', 'Facility name cannot be empty.', 'warning');
      return;
    }

    setSaving(true);
    try {
      await db.updateFacility(selectedFacility.id, {
        name: formData.name.trim(),
        license_number: formData.license_number.trim(),
        timezone: formData.timezone,
        address: formData.address.trim(),
        city: formData.city.trim(),
        state: formData.state.trim().toUpperCase(),
        zip: formData.zip.trim(),
        phone: formData.phone.trim(),
        tax_id: formData.tax_id.trim(),
        npi: formData.npi.trim(),
        apply_medicare_mppr: formData.apply_medicare_mppr
      });

      setIsEditOpen(false);
      Swal.fire({
        icon: 'success',
        title: 'Facility Updated',
        text: 'Facility details have been saved successfully.',
        timer: 1800,
        showConfirmButton: false
      });
      await loadFacilities();
    } catch (err) {
      console.error('Update facility error:', err);
      Swal.fire('Error', err.message || 'Failed to update facility.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Toggle Facility Status (Activate / Deactivate)
  const handleToggleStatus = async (fac) => {
    const isCurrentlyActive = fac.status === 'active' && fac.is_active !== false;
    const nextStatus = isCurrentlyActive ? 'inactive' : 'active';

    const result = await Swal.fire({
      title: isCurrentlyActive ? `Deactivate "${fac.name}"?` : `Reactivate "${fac.name}"?`,
      html: isCurrentlyActive
        ? `<div style="text-align: left; font-size: 0.9rem; color: #475569;">
             <p><b>Access Policy Enforcement:</b></p>
             <ul style="margin: 8px 0; padding-left: 20px;">
               <li>Non-Super Admin users from this facility will be locked from operational clinical data.</li>
               <li>All historical patient records, case logs, and audit trails remain completely preserved.</li>
               <li>The facility can be reactivated by a Super Admin at any time.</li>
             </ul>
           </div>`
        : `<p style="font-size: 0.9rem; color: #475569;">Reactivating will immediately restore full operational access for authorized facility users.</p>`,
      icon: isCurrentlyActive ? 'warning' : 'question',
      showCancelButton: true,
      confirmButtonColor: isCurrentlyActive ? '#dc2626' : '#2563eb',
      cancelButtonColor: '#64748b',
      confirmButtonText: isCurrentlyActive ? 'Confirm Deactivation' : 'Reactivate Facility'
    });

    if (result.isConfirmed) {
      try {
        await db.updateFacility(fac.id, {
          status: nextStatus,
          is_active: !isCurrentlyActive
        });

        Swal.fire({
          icon: 'success',
          title: isCurrentlyActive ? 'Facility Deactivated' : 'Facility Reactivated',
          text: `Status for ${fac.name} set to ${nextStatus}.`,
          timer: 1800,
          showConfirmButton: false
        });
        await loadFacilities();
      } catch (err) {
        console.error('Toggle facility status error:', err);
        Swal.fire('Operation Blocked', err.message || 'Could not update facility status.', 'error');
      }
    }
  };

  // Filter & Sort Logic
  const filteredFacilities = facilities
    .filter(fac => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = (
        (fac.name || '').toLowerCase().includes(q) ||
        (fac.city || '').toLowerCase().includes(q) ||
        (fac.state || '').toLowerCase().includes(q) ||
        (fac.license_number || '').toLowerCase().includes(q) ||
        (fac.npi || '').toLowerCase().includes(q) ||
        (fac.id || '').toLowerCase().includes(q)
      );

      const isActive = fac.status === 'active' && fac.is_active !== false;
      const matchesStatus = (
        statusFilter === 'all' ||
        (statusFilter === 'active' && isActive) ||
        (statusFilter === 'inactive' && !isActive)
      );

      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'users') return (b.userCount || 0) - (a.userCount || 0);
      if (sortBy === 'status') return (a.status || '').localeCompare(b.status || '');
      return 0;
    });

  // Aggregated KPIs
  const totalFacilities = facilities.length;
  const activeCount = facilities.filter(f => f.status === 'active' && f.is_active !== false).length;
  const totalUsers = facilities.reduce((sum, f) => sum + (f.userCount || 0), 0);

  return (
    <div className="facility-mgmt-container">
      {/* Header Banner */}
      <div className="facility-mgmt-header">
        <div className="facility-mgmt-titles">
          <h2>
            <Building2 size={26} style={{ color: '#2563eb' }} />
            Enterprise Facility Management
          </h2>
          <p>
            Centralized control plane for ambulatory surgery centers, physical campuses, and designated administrators.
          </p>
        </div>

        <div className="facility-mgmt-actions">
          <button className="btn-secondary" onClick={loadFacilities} title="Refresh Facility Directory">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>

          {isSuperAdmin && (
            <button className="btn-primary" onClick={openCreateModal}>
              <Plus size={16} />
              Provision New Facility
            </button>
          )}
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="facility-stats-grid">
        <div className="facility-stat-card">
          <div className="stat-icon-wrapper stat-icon-blue">
            <Building2 size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{totalFacilities}</span>
            <span className="stat-label">Total Facilities</span>
          </div>
        </div>

        <div className="facility-stat-card">
          <div className="stat-icon-wrapper stat-icon-green">
            <CheckCircle2 size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{activeCount}</span>
            <span className="stat-label">Active Surgery Centers</span>
          </div>
        </div>

        <div className="facility-stat-card">
          <div className="stat-icon-wrapper stat-icon-purple">
            <Users size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{totalUsers}</span>
            <span className="stat-label">Associated Staff</span>
          </div>
        </div>

        <div className="facility-stat-card">
          <div className="stat-icon-wrapper stat-icon-amber">
            <Shield size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-value">100%</span>
            <span className="stat-label">Tenant Isolation</span>
          </div>
        </div>
      </div>

      {/* Controls Bar: Search & Filters */}
      <div className="facility-controls-card">
        <div className="facility-search-wrapper">
          <Search size={16} className="facility-search-icon" />
          <input
            type="text"
            className="facility-search-input"
            placeholder="Search by facility name, city, NPI, license, or UUID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="facility-filters-group">
          <Filter size={15} style={{ color: '#94a3b8' }} />
          <select
            className="facility-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Facilities Only</option>
            <option value="inactive">Inactive Facilities Only</option>
          </select>

          <ArrowUpDown size={15} style={{ color: '#94a3b8', marginLeft: '6px' }} />
          <select
            className="facility-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="name">Sort by Name</option>
            <option value="users">Sort by User Count</option>
            <option value="status">Sort by Status</option>
          </select>
        </div>
      </div>

      {/* Facility Cards Grid */}
      {loading ? (
        <div style={{ padding: '64px', textAlign: 'center', color: '#64748b' }}>
          <RefreshCw size={32} className="animate-spin" style={{ margin: '0 auto 16px', display: 'block', color: '#3b82f6' }} />
          Loading surgical facilities...
        </div>
      ) : filteredFacilities.length === 0 ? (
        <div className="facility-empty-state">
          <Building2 size={48} style={{ color: '#cbd5e1' }} />
          <h4>No Facilities Found</h4>
          <p>No surgical centers matched your active search query and filter criteria.</p>
          {isSuperAdmin && (
            <button className="btn-primary" onClick={openCreateModal} style={{ marginTop: '12px' }}>
              <Plus size={15} />
              Add First Facility
            </button>
          )}
        </div>
      ) : (
        <div className="facility-cards-grid">
          {filteredFacilities.map(fac => {
            const isActive = fac.status === 'active' && fac.is_active !== false;
            return (
              <div
                key={fac.id}
                className={`facility-item-card ${isActive ? 'is-active-card' : 'is-inactive-card'}`}
              >
                {/* Header */}
                <div className="facility-card-header">
                  <div className="facility-title-box">
                    <h3>
                      <Building2 size={18} style={{ color: isActive ? '#2563eb' : '#94a3b8' }} />
                      {fac.name}
                    </h3>
                    <div
                      className="facility-id-tag"
                      onClick={() => handleCopyId(fac.id)}
                      title="Click to copy unique UUID"
                    >
                      <span>ID: {fac.id.slice(0, 8)}...</span>
                      {copiedId === fac.id ? <Check size={11} style={{ color: '#10b981' }} /> : <Copy size={11} />}
                    </div>
                  </div>

                  <span className={`facility-badge ${isActive ? 'badge-active' : 'badge-inactive'}`}>
                    {isActive ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                    {isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {/* Body Details */}
                <div className="facility-card-body">
                  {/* Location & Contact */}
                  <div className="facility-meta-row">
                    <MapPin size={14} />
                    <span>{fac.address || 'Address not registered'}</span>
                  </div>

                  {fac.phone && (
                    <div className="facility-meta-row">
                      <Phone size={14} />
                      <span>{fac.phone}</span>
                    </div>
                  )}

                  {/* Designated Facility Administrator */}
                  <div className="facility-admin-box">
                    <div className="admin-avatar-small">
                      <Shield size={16} />
                    </div>
                    <div className="admin-details">
                      <span className="admin-title-label">Designated Facility Admin</span>
                      <span className="admin-name">
                        {fac.facilityAdminCount > 0
                          ? `${fac.facilityAdminCount} Authorized Administrator(s)`
                          : 'No Designated Admin Assigned'}
                      </span>
                    </div>
                  </div>

                  {/* Metadata Chips */}
                  <div className="facility-tags-row">
                    {fac.license_number && (
                      <span className="info-chip">Lic: {fac.license_number}</span>
                    )}
                    {fac.npi && (
                      <span className="info-chip">NPI: {fac.npi}</span>
                    )}
                    <span className="info-chip">
                      <Clock size={11} style={{ marginRight: '4px', verticalAlign: '-1px' }} />
                      {fac.timezone || 'America/New_York'}
                    </span>
                    {fac.apply_medicare_mppr && (
                      <span className="info-chip info-chip-blue">Medicare MPPR</span>
                    )}
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="facility-card-footer">
                  <div className="footer-left">
                    <Users size={14} />
                    <span>{fac.userCount || 0} Staff Members</span>
                  </div>

                  <div className="footer-actions">
                    {onSelectFacility && (
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => onSelectFacility(fac)}
                        title="Set as active working facility"
                      >
                        <Building2 size={13} />
                        Select
                      </button>
                    )}

                    {onNavigateToUsers && (
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => onNavigateToUsers(fac.id)}
                        title="Manage users for this facility"
                      >
                        <Users size={13} />
                        Users
                      </button>
                    )}

                    {isSuperAdmin && (
                      <>
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => openEditModal(fac)}
                          title="Edit facility configuration"
                        >
                          <Edit size={13} />
                          Edit
                        </button>

                        <button
                          className={`btn-secondary btn-sm ${isActive ? 'btn-danger-outline' : ''}`}
                          onClick={() => handleToggleStatus(fac)}
                          title={isActive ? 'Deactivate facility' : 'Reactivate facility'}
                        >
                          {isActive ? <XCircle size={13} /> : <CheckCircle2 size={13} />}
                          {isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE FACILITY MODAL */}
      {isCreateOpen && (
        <div className="facility-modal-backdrop" onClick={() => setIsCreateOpen(false)}>
          <div className="facility-modal-card" onClick={e => e.stopPropagation()}>
            <div className="facility-modal-header">
              <h3>
                <Building2 size={20} style={{ color: '#2563eb' }} />
                Provision New Ambulatory Surgery Center
              </h3>
              <button className="modal-close-btn" onClick={() => setIsCreateOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit}>
              <div className="facility-modal-body">
                <div className="form-group">
                  <label>
                    Facility Legal Name <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    className="form-control"
                    placeholder="e.g. Palm Beach Surgical Pavilion"
                    value={formData.name}
                    onChange={handleFormChange}
                  />
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>State Operating License #</label>
                    <input
                      type="text"
                      name="license_number"
                      className="form-control"
                      placeholder="e.g. ASC-FL-90412"
                      value={formData.license_number}
                      onChange={handleFormChange}
                    />
                  </div>

                  <div className="form-group">
                    <label>Facility 10-Digit NPI</label>
                    <input
                      type="text"
                      name="npi"
                      maxLength={10}
                      className="form-control"
                      placeholder="e.g. 1982736450"
                      value={formData.npi}
                      onChange={handleFormChange}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Physical Address</label>
                  <input
                    type="text"
                    name="address"
                    className="form-control"
                    placeholder="123 Medical Blvd, Suite 100"
                    value={formData.address}
                    onChange={handleFormChange}
                  />
                </div>

                <div className="form-grid-3">
                  <div className="form-group">
                    <label>City</label>
                    <input
                      type="text"
                      name="city"
                      className="form-control"
                      placeholder="Naples"
                      value={formData.city}
                      onChange={handleFormChange}
                    />
                  </div>

                  <div className="form-group">
                    <label>State</label>
                    <input
                      type="text"
                      name="state"
                      maxLength={2}
                      className="form-control"
                      placeholder="FL"
                      value={formData.state}
                      onChange={handleFormChange}
                    />
                  </div>

                  <div className="form-group">
                    <label>ZIP Code</label>
                    <input
                      type="text"
                      name="zip"
                      maxLength={10}
                      className="form-control"
                      placeholder="34102"
                      value={formData.zip}
                      onChange={handleFormChange}
                    />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Primary Phone</label>
                    <input
                      type="tel"
                      name="phone"
                      className="form-control"
                      placeholder="(555) 123-4567"
                      value={formData.phone}
                      onChange={handleFormChange}
                    />
                  </div>

                  <div className="form-group">
                    <label>Federal Tax ID (EIN)</label>
                    <input
                      type="text"
                      name="tax_id"
                      className="form-control"
                      placeholder="59-1234567"
                      value={formData.tax_id}
                      onChange={handleFormChange}
                    />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Operational Timezone</label>
                    <select
                      name="timezone"
                      className="form-control"
                      value={formData.timezone}
                      onChange={handleFormChange}
                    >
                      <option value="America/New_York">Eastern Time (ET)</option>
                      <option value="America/Chicago">Central Time (CT)</option>
                      <option value="America/Denver">Mountain Time (MT)</option>
                      <option value="America/Los_Angeles">Pacific Time (PT)</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ justifyContent: 'center' }}>
                    <label className="form-checkbox-label" style={{ marginTop: '22px' }}>
                      <input
                        type="checkbox"
                        name="apply_medicare_mppr"
                        checked={formData.apply_medicare_mppr}
                        onChange={handleFormChange}
                      />
                      Apply Medicare MPPR Reduction
                    </label>
                  </div>
                </div>
              </div>

              <div className="facility-modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsCreateOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={saving}
                >
                  {saving ? 'Provisioning...' : 'Provision Center'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT FACILITY MODAL */}
      {isEditOpen && selectedFacility && (
        <div className="facility-modal-backdrop" onClick={() => setIsEditOpen(false)}>
          <div className="facility-modal-card" onClick={e => e.stopPropagation()}>
            <div className="facility-modal-header">
              <h3>
                <Edit size={20} style={{ color: '#2563eb' }} />
                Edit Facility: {selectedFacility.name}
              </h3>
              <button className="modal-close-btn" onClick={() => setIsEditOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit}>
              <div className="facility-modal-body">
                <div className="form-group">
                  <label>
                    Facility Legal Name <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    className="form-control"
                    value={formData.name}
                    onChange={handleFormChange}
                  />
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>State Operating License #</label>
                    <input
                      type="text"
                      name="license_number"
                      className="form-control"
                      value={formData.license_number}
                      onChange={handleFormChange}
                    />
                  </div>

                  <div className="form-group">
                    <label>Facility 10-Digit NPI</label>
                    <input
                      type="text"
                      name="npi"
                      maxLength={10}
                      className="form-control"
                      value={formData.npi}
                      onChange={handleFormChange}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Physical Address</label>
                  <input
                    type="text"
                    name="address"
                    className="form-control"
                    value={formData.address}
                    onChange={handleFormChange}
                  />
                </div>

                <div className="form-grid-3">
                  <div className="form-group">
                    <label>City</label>
                    <input
                      type="text"
                      name="city"
                      className="form-control"
                      value={formData.city}
                      onChange={handleFormChange}
                    />
                  </div>

                  <div className="form-group">
                    <label>State</label>
                    <input
                      type="text"
                      name="state"
                      maxLength={2}
                      className="form-control"
                      value={formData.state}
                      onChange={handleFormChange}
                    />
                  </div>

                  <div className="form-group">
                    <label>ZIP Code</label>
                    <input
                      type="text"
                      name="zip"
                      className="form-control"
                      value={formData.zip}
                      onChange={handleFormChange}
                    />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Primary Phone</label>
                    <input
                      type="tel"
                      name="phone"
                      className="form-control"
                      value={formData.phone}
                      onChange={handleFormChange}
                    />
                  </div>

                  <div className="form-group">
                    <label>Federal Tax ID (EIN)</label>
                    <input
                      type="text"
                      name="tax_id"
                      className="form-control"
                      value={formData.tax_id}
                      onChange={handleFormChange}
                    />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Operational Timezone</label>
                    <select
                      name="timezone"
                      className="form-control"
                      value={formData.timezone}
                      onChange={handleFormChange}
                    >
                      <option value="America/New_York">Eastern Time (ET)</option>
                      <option value="America/Chicago">Central Time (CT)</option>
                      <option value="America/Denver">Mountain Time (MT)</option>
                      <option value="America/Los_Angeles">Pacific Time (PT)</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ justifyContent: 'center' }}>
                    <label className="form-checkbox-label" style={{ marginTop: '22px' }}>
                      <input
                        type="checkbox"
                        name="apply_medicare_mppr"
                        checked={formData.apply_medicare_mppr}
                        onChange={handleFormChange}
                      />
                      Apply Medicare MPPR Reduction
                    </label>
                  </div>
                </div>
              </div>

              <div className="facility-modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsEditOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
