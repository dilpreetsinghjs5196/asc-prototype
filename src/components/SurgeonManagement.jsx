import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/supabase';
import {
  UserCheck,
  Search,
  Download,
  Plus,
  Edit,
  Trash2,
  X,
  Building2,
  Award
} from 'lucide-react';
import Swal from 'sweetalert2';

const CREDENTIAL_OPTIONS = ['MD', 'DO', 'DPM', 'DDS', 'DMD', 'MBBS'];

const SURGICAL_SPECIALTIES = [
  'Orthopedic Surgery',
  'Ophthalmology',
  'General Surgery',
  'Otolaryngology (ENT)',
  'Pain Management',
  'Gastroenterology',
  'Urology',
  'Plastic & Reconstructive',
  'Podiatry',
  'Neurosurgery / Spine',
  'Oral & Maxillofacial'
];

export default function SurgeonManagement({ activeFacility, facilities: _facilities = [], isSuperAdmin: propIsSuperAdmin }) {
  const [surgeonsList, setSurgeonsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [specialtyFilter, setSpecialtyFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'INACTIVE'
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState('profile'); // 'profile' | 'affiliations' | 'privileges'
  const [editingSurgeon, setEditingSurgeon] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    firstname: '',
    lastname: '',
    credentials: 'MD',
    specialty: 'Orthopedic Surgery',
    subspecialties: '',
    npi: '',
    license_number: '',
    phone: '',
    email: '',
    is_active: true,
    facility_id: ''
  });

  // Affiliations and Privileges for editing surgeon
  const [affiliations, setAffiliations] = useState([]);
  const [privileges, setPrivileges] = useState([]);

  const session = db.getSession();
  const _isSuperAdmin = propIsSuperAdmin !== undefined ? propIsSuperAdmin : (session?.role === 'super_admin');

  // Load surgeons
  const loadSurgeons = async () => {
    setLoading(true);
    try {
      const targetFac = activeFacility?.id || db.getActiveFacility()?.id;
      const data = await db.getSurgeonsWithAffiliations(targetFac);
      setSurgeonsList(data || []);
    } catch (err) {
      console.error('Failed to load surgeons:', err);
      Swal.fire({
        title: 'Error Loading Directory',
        text: err.message || 'Could not fetch surgeon records from database.',
        icon: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSurgeons();
  }, [activeFacility?.id]);

  // Load affiliations and privileges when editing
  const loadSurgeonDetails = async (surgeonId) => {
    if (!surgeonId) return;
    try {
      const [affData, privData] = await Promise.all([
        db.getSurgeonAffiliations(surgeonId),
        db.getSurgeonPrivileges(surgeonId, activeFacility?.id)
      ]);
      setAffiliations(affData || []);
      setPrivileges(privData || []);
    } catch (err) {
      console.warn('Could not load detailed affiliations/privileges:', err);
    }
  };

  // Open Add / Edit Modal
  const handleOpenAdd = () => {
    setEditingSurgeon(null);
    setFormData({
      firstname: '',
      lastname: '',
      credentials: 'MD',
      specialty: 'Orthopedic Surgery',
      subspecialties: '',
      npi: '',
      license_number: '',
      phone: '',
      email: '',
      is_active: true,
      facility_id: activeFacility?.id || db.getActiveFacility()?.id || ''
    });
    setAffiliations([]);
    setPrivileges([]);
    setModalTab('profile');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (surgeon) => {
    setEditingSurgeon(surgeon);
    const subspecStr = Array.isArray(surgeon.subspecialties)
      ? surgeon.subspecialties.join(', ')
      : (surgeon.subspecialties || '');

    setFormData({
      firstname: surgeon.firstname || '',
      lastname: surgeon.lastname || '',
      credentials: surgeon.credentials || 'MD',
      specialty: surgeon.specialty || 'General Surgery',
      subspecialties: subspecStr,
      npi: surgeon.npi || '',
      license_number: surgeon.license_number || '',
      phone: surgeon.phone || '',
      email: surgeon.email || '',
      is_active: surgeon.is_active !== false,
      facility_id: surgeon.facility_id || activeFacility?.id || ''
    });
    setModalTab('profile');
    setIsModalOpen(true);
    loadSurgeonDetails(surgeon.id);
  };

  // Save Surgeon (Fail-Closed, zero synthetic fallback)
  const handleSaveSurgeon = async (e) => {
    e.preventDefault();

    const first = (formData.firstname || '').trim();
    const last = (formData.lastname || '').trim();
    const spec = (formData.specialty || '').trim();
    const creds = (formData.credentials || 'MD').trim();
    const lic = (formData.license_number || '').trim();
    const npiClean = (formData.npi || '').trim();
    const email = (formData.email || '').trim();
    const phone = (formData.phone || '').trim();

    if (!first) {
      Swal.fire('Validation Error', 'First Name is required.', 'warning');
      return;
    }
    if (!last) {
      Swal.fire('Validation Error', 'Last Name is required.', 'warning');
      return;
    }
    if (!spec) {
      Swal.fire('Validation Error', 'Primary Specialty is required.', 'warning');
      return;
    }
    if (!lic) {
      Swal.fire('Validation Error', 'State Medical License Number is required.', 'warning');
      return;
    }

    if (npiClean && !/^[0-9]{10}$/.test(npiClean)) {
      Swal.fire('Validation Error', 'National Provider Identifier (NPI) must be exactly 10 numeric digits.', 'warning');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && !emailRegex.test(email)) {
      Swal.fire('Validation Error', 'Please enter a valid email address.', 'warning');
      return;
    }

    const subspecArray = formData.subspecialties
      ? formData.subspecialties.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    const payload = {
      firstname: first,
      lastname: last,
      credentials: creds,
      specialty: spec,
      subspecialties: subspecArray,
      license_number: lic,
      npi: npiClean || null,
      phone: phone,
      email: email,
      is_active: Boolean(formData.is_active),
      facility_id: formData.facility_id || activeFacility?.id || db.getActiveFacility()?.id
    };

    setSubmitting(true);
    try {
      if (editingSurgeon) {
        await db.updateSurgeon(editingSurgeon.id, payload);
        Swal.fire({
          title: 'Surgeon Updated',
          text: `Dr. ${last} (${creds}) record has been updated successfully.`,
          icon: 'success',
          timer: 2000,
          showConfirmButton: false
        });
      } else {
        await db.addSurgeon(payload);
        Swal.fire({
          title: 'Surgeon Appointed',
          text: `Dr. ${last} (${creds}) has been added to the master directory.`,
          icon: 'success',
          timer: 2000,
          showConfirmButton: false
        });
      }
      setIsModalOpen(false);
      await loadSurgeons();
    } catch (err) {
      console.error('Surgeon save error:', err);
      Swal.fire({
        title: 'Database Error',
        text: `Operation failed: ${err.message || 'Database rejected the modification.'}`,
        icon: 'error'
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Delete / Deactivate Surgeon (Fail-Closed)
  const handleDeleteSurgeon = async (surgeon) => {
    const displayName = `Dr. ${(surgeon.lastname || '').trim()} ${(surgeon.firstname || '').trim()}`.trim() || surgeon.name;

    const result = await Swal.fire({
      title: 'Delete Surgeon Record?',
      html: `Are you sure you want to delete <b>${displayName}</b>?<br/><br/><small style="color: var(--text-muted)">Note: Surgeons with scheduled or completed surgical cases cannot be deleted to preserve billing and audit compliance. Deactivate the record instead.</small>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#f43f5e',
      cancelButtonColor: '#475569',
      confirmButtonText: 'Yes, Delete Record'
    });

    if (!result.isConfirmed) return;

    try {
      await db.deleteSurgeon(surgeon.id);
      Swal.fire('Deleted', `${displayName} has been removed from directory.`, 'success');
      await loadSurgeons();
    } catch (err) {
      console.error('Surgeon delete failed:', err);
      const isFK = err.message?.includes('violates foreign key constraint') ||
                   err.code === '23503' ||
                   err.message?.includes('surgeries');

      if (isFK) {
        const deact = await Swal.fire({
          title: 'Cannot Delete Linked Record',
          text: `${displayName} is linked to surgical cases, block schedules, or procedural logs. Would you like to deactivate this surgeon profile instead?`,
          icon: 'info',
          showCancelButton: true,
          confirmButtonText: 'Deactivate Surgeon',
          cancelButtonText: 'Cancel'
        });

        if (deact.isConfirmed) {
          try {
            await db.updateSurgeon(surgeon.id, { is_active: false });
            Swal.fire('Deactivated', `${displayName} is now marked inactive.`, 'success');
            await loadSurgeons();
          } catch (deactErr) {
            Swal.fire('Error', `Deactivation failed: ${deactErr.message}`, 'error');
          }
        }
      } else {
        Swal.fire('Delete Failed', err.message || 'Database error occurred.', 'error');
      }
    }
  };

  // Export Surgeons Directory CSV
  const handleExportSurgeons = async () => {
    try {
      if (filteredSurgeons.length === 0) {
        Swal.fire('Export Notice', 'No surgeon records match the current view to export.', 'info');
        return;
      }

      const headers = ['Surgeon ID', 'UUID', 'NPI', 'License Number', 'Last Name', 'First Name', 'Credentials', 'Specialty', 'Email', 'Phone', 'Active'];
      const rows = filteredSurgeons.map(s => [
        s.id,
        s.surgeon_uuid || '',
        s.npi || '',
        s.license_number || '',
        `"${(s.lastname || '').replace(/"/g, '""')}"`,
        `"${(s.firstname || '').replace(/"/g, '""')}"`,
        s.credentials || 'MD',
        `"${(s.specialty || '').replace(/"/g, '""')}"`,
        s.email || '',
        s.phone || '',
        s.is_active !== false ? 'Active' : 'Inactive'
      ]);

      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `surgeons_directory_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Audit telemetry log
      if (typeof db.logExportAuditEvent === 'function') {
        await db.logExportAuditEvent({
          export_type: 'SURGEON_DIRECTORY_EXPORT',
          record_count: filteredSurgeons.length,
          facility_id: activeFacility?.id || db.getActiveFacility()?.id
        });
      }
    } catch (err) {
      console.error('Export error:', err);
      Swal.fire('Export Failed', err.message, 'error');
    }
  };

  // Sorting
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Filtered & Sorted Surgeons
  const filteredSurgeons = useMemo(() => {
    return surgeonsList.filter(s => {
      const q = searchQuery.toLowerCase().trim();
      const name = `${s.firstname || ''} ${s.lastname || ''}`.toLowerCase();
      const npi = (s.npi || '').toLowerCase();
      const lic = (s.license_number || '').toLowerCase();
      const spec = (s.specialty || '').toLowerCase();
      const email = (s.email || '').toLowerCase();

      const matchesSearch = !q || name.includes(q) || npi.includes(q) || lic.includes(q) || spec.includes(q) || email.includes(q);
      const matchesSpec = specialtyFilter === 'ALL' || s.specialty === specialtyFilter;
      const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? s.is_active !== false : s.is_active === false);

      return matchesSearch && matchesSpec && matchesStatus;
    }).sort((a, b) => {
      let valA = '';
      let valB = '';

      if (sortField === 'name') {
        valA = `${a.lastname || ''} ${a.firstname || ''}`.toLowerCase();
        valB = `${b.lastname || ''} ${b.firstname || ''}`.toLowerCase();
      } else if (sortField === 'npi') {
        valA = (a.npi || a.license_number || '').toLowerCase();
        valB = (b.npi || b.license_number || '').toLowerCase();
      } else if (sortField === 'specialty') {
        valA = (a.specialty || '').toLowerCase();
        valB = (b.specialty || '').toLowerCase();
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [surgeonsList, searchQuery, specialtyFilter, statusFilter, sortField, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(filteredSurgeons.length / pageSize) || 1;
  const paginatedSurgeons = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredSurgeons.slice(start, start + pageSize);
  }, [filteredSurgeons, page, pageSize]);

  return (
    <div className="dashboard-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header & Controls */}
      <div className="card-header" style={{ marginBottom: '4px', flexWrap: 'wrap', gap: '12px' }}>
        <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <UserCheck size={18} style={{ color: 'var(--color-blue)' }} />
          <span>ASC Surgeon Directory & Credentialing</span>
          <span style={{
            fontSize: '0.72rem',
            padding: '2px 8px',
            borderRadius: '12px',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            color: 'var(--color-blue)',
            fontWeight: '600'
          }}>
            Phase 35 Model
          </span>
        </h3>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Showing {filteredSurgeons.length} of {surgeonsList.length} surgeons
          </span>

          {/* Search Bar */}
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search by name, NPI, license, specialty..."
              className="date-range-selector"
              style={{ paddingLeft: '30px', width: '250px' }}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
            />
          </div>

          {/* Specialty Filter */}
          <select
            className="date-range-selector"
            style={{ width: '160px' }}
            value={specialtyFilter}
            onChange={(e) => {
              setSpecialtyFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="ALL">All Specialties</option>
            {SURGICAL_SPECIALTIES.map(spec => (
              <option key={spec} value={spec}>{spec}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            className="date-range-selector"
            style={{ width: '130px' }}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Inactive Only</option>
          </select>

          {searchQuery && (
            <button
              className="btn-header"
              onClick={() => { setSearchQuery(''); setPage(1); }}
              style={{ minWidth: 'fit-content' }}
            >
              Clear
            </button>
          )}

          <button
            className="btn-header"
            onClick={handleExportSurgeons}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 'fit-content' }}
          >
            <Download size={14} /> Download CSV
          </button>

          <button
            className="btn-header btn-primary"
            onClick={handleOpenAdd}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 'fit-content' }}
          >
            <Plus size={14} /> Add Surgeon
          </button>
        </div>
      </div>

      {/* Directory Table */}
      <div className="custom-table-container" style={{ overflowX: 'auto' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('npi')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                NPI / License {sortField === 'npi' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSort('name')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                Surgeon Name {sortField === 'name' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSort('specialty')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                Specialty & Subspecialties {sortField === 'specialty' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th>Email</th>
              <th>Phone</th>
              <th style={{ textAlign: 'center' }}>Status</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                  Loading surgeon records...
                </td>
              </tr>
            ) : paginatedSurgeons.length > 0 ? (
              paginatedSurgeons.map(surgeon => {
                const fullName = `Dr. ${(surgeon.lastname || '').trim()} ${(surgeon.firstname || '').trim()}`.trim();
                const initial = surgeon.lastname ? surgeon.lastname.trim().charAt(0) : (surgeon.firstname ? surgeon.firstname.trim().charAt(0) : '?');
                const subspecStr = Array.isArray(surgeon.subspecialties) && surgeon.subspecialties.length > 0
                  ? surgeon.subspecialties.join(', ')
                  : null;

                return (
                  <tr key={surgeon.id} className="clickable-row">
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontWeight: '600', fontFamily: 'monospace', color: 'var(--color-blue)', letterSpacing: '0.5px' }}>
                          {surgeon.npi ? `NPI: ${surgeon.npi}` : surgeon.license_number}
                        </span>
                        {surgeon.npi && surgeon.license_number && (
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            Lic: {surgeon.license_number}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          backgroundColor: 'rgba(59, 130, 246, 0.12)',
                          color: 'var(--color-blue)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.85rem',
                          fontWeight: '700',
                          border: '1px solid rgba(59, 130, 246, 0.25)'
                        }}>
                          {initial}
                        </div>
                        <div>
                          <div>{fullName} {surgeon.credentials && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({typeof surgeon.credentials === 'string' ? surgeon.credentials : (surgeon.credentials?.credential_type || 'MD')})</span>}</div>
                          {surgeon.surgeon_uuid && (
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                              UUID: {surgeon.surgeon_uuid.slice(0, 8)}...
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: '500' }}>{surgeon.specialty}</span>
                        {subspecStr && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {subspecStr}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ fontSize: '0.82rem' }}>{surgeon.email || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>{surgeon.phone || '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`case-badge ${surgeon.is_active !== false ? 'case-badge-completed' : 'case-badge-cancelled'}`}>
                        {surgeon.is_active !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button
                          onClick={() => handleOpenEdit(surgeon)}
                          className="btn-header"
                          style={{ padding: '4px 8px', minWidth: 'auto', display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid rgba(59, 130, 246, 0.3)', color: 'var(--color-blue)' }}
                          title="Edit Surgeon & View Privileges"
                        >
                          <Edit size={13} />
                        </button>
                        <button
                          onClick={() => handleDeleteSurgeon(surgeon)}
                          className="btn-header"
                          style={{ padding: '4px 8px', minWidth: 'auto', display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid rgba(244, 63, 94, 0.3)', color: 'var(--color-red)' }}
                          title="Delete / Deactivate Surgeon"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
                  <UserCheck size={36} style={{ opacity: 0.2, marginBottom: '12px' }} />
                  <div style={{ fontSize: '0.95rem', fontWeight: '600' }}>No surgeons found</div>
                  <div style={{ fontSize: '0.78rem', marginTop: '4px' }}>Try clearing your search query or filters</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="table-footer" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        borderTop: '1px solid var(--border-color)',
        fontSize: '0.82rem',
        color: 'var(--text-secondary)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span>Page {page} of {totalPages}</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="date-range-selector"
            style={{ padding: '2px 8px', fontSize: '0.78rem' }}
          >
            <option value={10}>10 per page</option>
            <option value={15}>15 per page</option>
            <option value={25}>25 per page</option>
            <option value={50}>50 per page</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            className="btn-header"
            onClick={() => setPage(prev => Math.max(1, prev - 1))}
            disabled={page === 1}
            style={{ opacity: page === 1 ? 0.5 : 1, cursor: page === 1 ? 'not-allowed' : 'pointer' }}
          >
            Previous
          </button>
          <button
            className="btn-header"
            onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
            disabled={page >= totalPages}
            style={{ opacity: page >= totalPages ? 0.5 : 1, cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}
          >
            Next
          </button>
        </div>
      </div>

      {/* Surgeon Modal (Profile, Affiliations, Privileges) */}
      {isModalOpen && (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content" style={{ width: '680px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserCheck size={18} style={{ color: 'var(--color-blue)' }} />
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600' }}>
                  {editingSurgeon ? `Edit Profile: Dr. ${editingSurgeon.lastname}` : 'Appoint New Surgeon'}
                </h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            {/* Modal Tabs if editing existing surgeon */}
            {editingSurgeon && (
              <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', padding: '12px 0' }}>
                <button
                  type="button"
                  className={`btn-header ${modalTab === 'profile' ? 'btn-primary' : ''}`}
                  onClick={() => setModalTab('profile')}
                >
                  General Profile
                </button>
                <button
                  type="button"
                  className={`btn-header ${modalTab === 'affiliations' ? 'btn-primary' : ''}`}
                  onClick={() => setModalTab('affiliations')}
                >
                  <Building2 size={13} style={{ marginRight: '4px' }} />
                  Facility Affiliations ({affiliations.length})
                </button>
                <button
                  type="button"
                  className={`btn-header ${modalTab === 'privileges' ? 'btn-primary' : ''}`}
                  onClick={() => setModalTab('privileges')}
                >
                  <Award size={13} style={{ marginRight: '4px' }} />
                  CPT Privileges ({privileges.length})
                </button>
              </div>
            )}

            {modalTab === 'profile' && (
              <form onSubmit={handleSaveSurgeon} style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-secondary)' }}>First Name *</label>
                    <input
                      type="text"
                      className="date-range-selector"
                      style={{ width: '100%', marginTop: '4px' }}
                      value={formData.firstname}
                      onChange={(e) => setFormData({ ...formData, firstname: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Last Name *</label>
                    <input
                      type="text"
                      className="date-range-selector"
                      style={{ width: '100%', marginTop: '4px' }}
                      value={formData.lastname}
                      onChange={(e) => setFormData({ ...formData, lastname: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Credentials *</label>
                    <select
                      className="date-range-selector"
                      style={{ width: '100%', marginTop: '4px' }}
                      value={formData.credentials}
                      onChange={(e) => setFormData({ ...formData, credentials: e.target.value })}
                    >
                      {CREDENTIAL_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Primary Specialty *</label>
                    <select
                      className="date-range-selector"
                      style={{ width: '100%', marginTop: '4px' }}
                      value={formData.specialty}
                      onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                    >
                      {SURGICAL_SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
                    Subspecialties (comma-separated)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Total Joint Reconstruction, Sports Medicine, Arthroscopy"
                    className="date-range-selector"
                    style={{ width: '100%', marginTop: '4px' }}
                    value={formData.subspecialties}
                    onChange={(e) => setFormData({ ...formData, subspecialties: e.target.value })}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
                      10-Digit NPI Number
                    </label>
                    <input
                      type="text"
                      maxLength={10}
                      placeholder="10-digit NPI"
                      className="date-range-selector"
                      style={{ width: '100%', marginTop: '4px' }}
                      value={formData.npi}
                      onChange={(e) => setFormData({ ...formData, npi: e.target.value.replace(/\D/g, '') })}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
                      State Medical License *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. MD-99021"
                      className="date-range-selector"
                      style={{ width: '100%', marginTop: '4px' }}
                      value={formData.license_number}
                      onChange={(e) => setFormData({ ...formData, license_number: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Email</label>
                    <input
                      type="email"
                      placeholder="surgeon@practice.com"
                      className="date-range-selector"
                      style={{ width: '100%', marginTop: '4px' }}
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Phone</label>
                    <input
                      type="tel"
                      placeholder="(239) 555-0199"
                      className="date-range-selector"
                      style={{ width: '100%', marginTop: '4px' }}
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                  <input
                    type="checkbox"
                    id="is_active_checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    style={{ cursor: 'pointer' }}
                  />
                  <label htmlFor="is_active_checkbox" style={{ fontSize: '0.82rem', fontWeight: '500', cursor: 'pointer' }}>
                    Active Status (Eligible for case scheduling and block reservations)
                  </label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
                  <button
                    type="button"
                    className="btn-header"
                    onClick={() => setIsModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-header btn-primary"
                    disabled={submitting}
                  >
                    {submitting ? 'Saving...' : (editingSurgeon ? 'Update Surgeon' : 'Create Surgeon')}
                  </button>
                </div>
              </form>
            )}

            {modalTab === 'affiliations' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>
                    Multi-Center Hospital & ASC Appointments
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Managed in Migration 013 (1NF Affiliations)
                  </span>
                </div>

                {affiliations.length > 0 ? (
                  <div className="custom-table-container">
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Facility</th>
                          <th>Appointment</th>
                          <th>Privileges Effective</th>
                          <th>Privileges Expiry</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {affiliations.map(aff => (
                          <tr key={aff.id}>
                            <td style={{ fontWeight: '600' }}>{aff.facilities?.name || aff.facility_id}</td>
                            <td>{aff.appointment_type || 'Active'}</td>
                            <td>{aff.privileges_effective_date || aff.appointment_start_date || '—'}</td>
                            <td>{aff.privileges_expiry_date || 'No Expiry'}</td>
                            <td>
                              <span className={`case-badge ${aff.is_active ? 'case-badge-completed' : 'case-badge-cancelled'}`}>
                                {aff.is_active ? 'Active' : 'Expired'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ padding: '32px 16px', textAlign: 'center', backgroundColor: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px' }}>
                    <Building2 size={28} style={{ opacity: 0.3, marginBottom: '8px' }} />
                    <div style={{ fontSize: '0.88rem', fontWeight: '600' }}>No Secondary Affiliations Found</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      This surgeon is currently assigned to primary facility #{editingSurgeon?.facility_id}.
                    </div>
                  </div>
                )}
              </div>
            )}

            {modalTab === 'privileges' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>
                    Procedural CPT Privileges & Authorizations
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Scoped to Facility Privileges Committee
                  </span>
                </div>

                {privileges.length > 0 ? (
                  <div className="custom-table-container">
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>CPT Code</th>
                          <th>Description</th>
                          <th>Level</th>
                          <th>Expiration Date</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {privileges.map(priv => (
                          <tr key={priv.id}>
                            <td style={{ fontWeight: '600', fontFamily: 'monospace' }}>
                              {priv.cpt_codes?.code || priv.cpt_code_id}
                            </td>
                            <td>{priv.cpt_codes?.description || 'Procedural Privilege'}</td>
                            <td>{priv.privilege_level || 'Full'}</td>
                            <td>{priv.expiration_date || 'Indefinite'}</td>
                            <td>
                              <span className={`case-badge ${priv.is_active ? 'case-badge-completed' : 'case-badge-cancelled'}`}>
                                {priv.is_active ? 'Authorized' : 'Suspended'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ padding: '32px 16px', textAlign: 'center', backgroundColor: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px' }}>
                    <Award size={28} style={{ opacity: 0.3, marginBottom: '8px' }} />
                    <div style={{ fontSize: '0.88rem', fontWeight: '600' }}>No Specific CPT Privileges Logged</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Surgeon operates under broad specialty privileges for {editingSurgeon?.specialty}.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
