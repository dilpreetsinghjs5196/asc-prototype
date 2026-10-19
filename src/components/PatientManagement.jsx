import React, { useState, useEffect, useMemo } from 'react';
import Swal from 'sweetalert2';
import {
  Users, Search, Plus, Edit, Trash2, Download, Eye, EyeOff,
  ShieldAlert, Link2, ExternalLink, RefreshCw, X, Check, AlertCircle, FileText
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { db } from '../lib/supabase';
import { maskMRN, maskPatientName, maskDOB, maskPhone } from '../utils/phiMasking';

export default function PatientManagement({
  activeFacility,
  userRole = 'staff',
  canViewPHI: propCanViewPHI,
  onPatientSelect = null
}) {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [includeInactive, setIncludeInactive] = useState(false);

  // Modals state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState(null);
  const [externalIdsPatient, setExternalIdsPatient] = useState(null);
  const [externalIds, setExternalIds] = useState([]);
  const [loadingExtIds, setLoadingExtIds] = useState(false);
  const [newExtIdForm, setNewExtIdForm] = useState({
    source_system: 'EPIC',
    identifier_type: 'MRN',
    external_id: ''
  });

  // Payers for relational dropdown
  const [payers, setPayers] = useState([]);

  const isSuperAdmin = userRole === 'super_admin';
  const isAdminOrManager = ['super_admin', 'org_admin', 'facility_admin', 'clinical_manager'].includes(userRole);
  const canViewPHI = propCanViewPHI !== undefined 
    ? propCanViewPHI 
    : ['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'scheduler', 'surgeon', 'biller', 'coder'].includes(userRole);
  const canModifyPatients = ['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'scheduler'].includes(userRole);
  const canDeletePatients = ['super_admin', 'org_admin', 'facility_admin'].includes(userRole);

  const initialFormState = {
    name: '',
    mrn: '',
    dob: '',
    gender: 'Male',
    phone: '',
    email: '',
    address: '',
    primary_payer_id: '',
    insurance_provider: '',
    insurance_policy_number: '',
    insurance_group_number: '',
    insurance_type: 'Commercial',
    subscriber_name: '',
    subscriber_relationship: 'Self',
    insurance_effective_date: '',
    insurance_expiration_date: '',
    copay_amount: '',
    deductible_amount: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    is_active: true
  };

  const [formData, setFormData] = useState(initialFormState);

  // Load patients and payers
  const loadData = async () => {
    setLoading(true);
    const targetFac = activeFacility?.id || db.getActiveFacility()?.id;
    try {
      const [fetchedPatients, fetchedPayers] = await Promise.all([
        db.getPatients(targetFac, { includeInactive, useMaskedView: !canViewPHI }),
        db.getPayers(targetFac)
      ]);
      setPatients(fetchedPatients || []);
      setPayers(fetchedPayers || []);
    } catch (err) {
      console.error('Failed to load patient directory:', err);
      Swal.fire({
        title: 'Error Loading Patients',
        text: err.message || 'Could not fetch patient records.',
        icon: 'error',
        background: 'var(--bg-card)',
        color: 'var(--text-primary)'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeFacility?.id, includeInactive]);

  // Load external identifiers when modal opens
  useEffect(() => {
    if (!externalIdsPatient?.id) return;
    setLoadingExtIds(true);
    db.getPatientExternalIdentifiers(externalIdsPatient.id)
      .then(res => setExternalIds(res || []))
      .catch(console.error)
      .finally(() => setLoadingExtIds(false));
  }, [externalIdsPatient?.id]);

  // Handle Sort
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Filter & Sort patients
  const filteredPatients = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return patients
      .filter(p => {
        if (!q) return true;
        const nameMatch = (p.name || '').toLowerCase().includes(q);
        const mrnMatch = (p.mrn || '').toLowerCase().includes(q);
        const insMatch = (p.insurance_provider || '').toLowerCase().includes(q);
        const phoneMatch = (p.phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, ''));
        return nameMatch || mrnMatch || insMatch || phoneMatch;
      })
      .sort((a, b) => {
        let valA = a[sortField] || '';
        let valB = b[sortField] || '';
        if (sortField === 'mrn') {
          const numA = parseInt(valA, 10);
          const numB = parseInt(valB, 10);
          if (!isNaN(numA) && !isNaN(numB)) {
            return sortDirection === 'asc' ? numA - numB : numB - numA;
          }
        }
        valA = String(valA).toLowerCase();
        valB = String(valB).toLowerCase();
        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
  }, [patients, searchQuery, sortField, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(filteredPatients.length / pageSize) || 1;
  const paginatedPatients = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPatients.slice(start, start + pageSize);
  }, [filteredPatients, currentPage, pageSize]);

  // Open Add Patient
  const handleOpenAdd = () => {
    setEditingPatient(null);
    setFormData(initialFormState);
    setIsFormOpen(true);
  };

  // Open Edit Patient
  const handleOpenEdit = (patient) => {
    setEditingPatient(patient);
    setFormData({
      name: patient.name || '',
      mrn: patient.mrn || '',
      dob: patient.dob || '',
      gender: patient.gender || 'Male',
      phone: patient.phone || '',
      email: patient.email || '',
      address: patient.address || '',
      primary_payer_id: patient.primary_payer_id || '',
      insurance_provider: patient.insurance_provider || '',
      insurance_policy_number: patient.insurance_policy_number || '',
      insurance_group_number: patient.insurance_group_number || '',
      insurance_type: patient.insurance_type || 'Commercial',
      subscriber_name: patient.subscriber_name || '',
      subscriber_relationship: patient.subscriber_relationship || 'Self',
      insurance_effective_date: patient.insurance_effective_date || '',
      insurance_expiration_date: patient.insurance_expiration_date || '',
      copay_amount: patient.copay_amount !== null && patient.copay_amount !== undefined ? patient.copay_amount : '',
      deductible_amount: patient.deductible_amount !== null && patient.deductible_amount !== undefined ? patient.deductible_amount : '',
      emergency_contact_name: patient.emergency_contact_name || '',
      emergency_contact_phone: patient.emergency_contact_phone || '',
      is_active: patient.is_active !== undefined ? patient.is_active : true
    });
    setIsFormOpen(true);
  };

  // Save Patient
  const handleSavePatient = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      Swal.fire({ title: 'Validation Error', text: 'Patient Name is required.', icon: 'warning' });
      return;
    }
    if (!formData.mrn.trim()) {
      Swal.fire({ title: 'Validation Error', text: 'MRN is required.', icon: 'warning' });
      return;
    }

    if (formData.insurance_effective_date && formData.insurance_expiration_date) {
      if (new Date(formData.insurance_effective_date) >= new Date(formData.insurance_expiration_date)) {
        Swal.fire({ title: 'Validation Error', text: 'Insurance Effective Date must be before Expiration Date.', icon: 'warning' });
        return;
      }
    }

    // Check duplicate MRN within facility if adding new or changing MRN
    const targetFac = activeFacility?.id || db.getActiveFacility()?.id;
    const mrnClean = formData.mrn.trim().toLowerCase();
    const existingWithMRN = patients.find(p => 
      p.facility_id === targetFac && 
      (p.mrn || '').trim().toLowerCase() === mrnClean &&
      (!editingPatient || p.id !== editingPatient.id)
    );

    if (existingWithMRN) {
      Swal.fire({
        title: 'Duplicate MRN Detected',
        text: `A patient with MRN "${formData.mrn}" already exists (${existingWithMRN.name}). Each patient in this facility must have a unique MRN.`,
        icon: 'error'
      });
      return;
    }

    // Resolve payer name if primary_payer_id selected
    let resolvedProviderName = formData.insurance_provider;
    if (formData.primary_payer_id) {
      const matchPayer = payers.find(pyr => pyr.id === formData.primary_payer_id);
      if (matchPayer) resolvedProviderName = matchPayer.name;
    }

    const payload = {
      name: formData.name.trim(),
      mrn: formData.mrn.trim(),
      dob: formData.dob || null,
      gender: formData.gender,
      phone: formData.phone || null,
      email: formData.email || null,
      address: formData.address || null,
      primary_payer_id: formData.primary_payer_id || null,
      insurance_provider: resolvedProviderName || null,
      insurance_policy_number: formData.insurance_policy_number || null,
      insurance_group_number: formData.insurance_group_number || null,
      insurance_type: formData.insurance_type || null,
      subscriber_name: formData.subscriber_name || null,
      subscriber_relationship: formData.subscriber_relationship || null,
      insurance_effective_date: formData.insurance_effective_date || null,
      insurance_expiration_date: formData.insurance_expiration_date || null,
      copay_amount: formData.copay_amount === '' ? null : parseFloat(formData.copay_amount),
      deductible_amount: formData.deductible_amount === '' ? null : parseFloat(formData.deductible_amount),
      emergency_contact_name: formData.emergency_contact_name || null,
      emergency_contact_phone: formData.emergency_contact_phone || null,
      facility_id: targetFac
    };

    try {
      if (editingPatient) {
        const updated = await db.updatePatient(editingPatient.id, payload);
        Swal.fire({
          title: 'Patient Updated',
          text: `Patient ${formData.name} was successfully updated.`,
          icon: 'success',
          timer: 1500,
          showConfirmButton: false
        });
      } else {
        const created = await db.addPatient(payload);
        Swal.fire({
          title: 'Patient Created',
          text: `Patient ${formData.name} was registered successfully.`,
          icon: 'success',
          timer: 1500,
          showConfirmButton: false
        });
      }
      setIsFormOpen(false);
      await loadData();
    } catch (err) {
      console.error('Save patient failed:', err);
      Swal.fire({
        title: 'Save Failed',
        text: err.message || 'Failed to save patient to database.',
        icon: 'error'
      });
    }
  };

  // Delete / Soft-deactivate patient
  const handleDeletePatient = async (patient) => {
    const confirm = await Swal.fire({
      title: 'Deactivate Patient Record?',
      text: `Deactivate ${patient.name} (MRN: ${patient.mrn})? Historical surgeries will be preserved.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: 'Yes, Deactivate',
      background: 'var(--bg-card)',
      color: 'var(--text-primary)'
    });

    if (confirm.isConfirmed) {
      try {
        await db.deletePatient(patient.id, true); // Soft delete
        Swal.fire({
          title: 'Deactivated',
          text: 'Patient record deactivated successfully.',
          icon: 'success',
          timer: 1500,
          showConfirmButton: false
        });
        await loadData();
      } catch (err) {
        console.error('Delete patient failed:', err);
        Swal.fire({
          title: 'Deactivation Blocked',
          text: err.message || 'Could not deactivate patient.',
          icon: 'error'
        });
      }
    }
  };

  // Add External Identifier
  const handleAddExternalId = async (e) => {
    e.preventDefault();
    if (!newExtIdForm.external_id.trim()) {
      Swal.fire({ title: 'Validation Error', text: 'External ID is required.', icon: 'warning' });
      return;
    }
    try {
      await db.addPatientExternalIdentifier({
        patientId: externalIdsPatient.id,
        sourceSystem: newExtIdForm.source_system,
        identifierType: newExtIdForm.identifier_type,
        externalId: newExtIdForm.external_id.trim(),
        facilityId: activeFacility?.id || externalIdsPatient.facility_id
      });
      setNewExtIdForm({ source_system: 'EPIC', identifier_type: 'MRN', external_id: '' });
      const updated = await db.getPatientExternalIdentifiers(externalIdsPatient.id);
      setExternalIds(updated || []);
      Swal.fire({ title: 'Linked', text: 'External identifier linked.', icon: 'success', timer: 1200, showConfirmButton: false });
    } catch (err) {
      console.error('Failed to link external identifier:', err);
      Swal.fire({ title: 'Linking Failed', text: err.message || 'Could not link identifier.', icon: 'error' });
    }
  };

  // Export Patients
  const handleExport = async () => {
    if (!patients || patients.length === 0) return;
    try {
      await db.logExportAuditEvent({
        exportType: 'PATIENT_DIRECTORY_EXPORT',
        tableName: 'patients',
        recordCount: filteredPatients.length,
        facilityId: activeFacility?.id,
        filterMetadata: { query: searchQuery, count: filteredPatients.length }
      });
    } catch (err) {
      console.warn('Export audit logging note:', err);
    }

    const exportRows = filteredPatients.map(p => ({
      MRN: canViewPHI ? p.mrn : maskMRN(p.mrn),
      'Patient Name': canViewPHI ? p.name : maskPatientName(p.name),
      DOB: canViewPHI ? p.dob : maskDOB(p.dob),
      Gender: p.gender || '',
      Phone: canViewPHI ? p.phone : maskPhone(p.phone),
      'Insurance Provider': p.insurance_provider || '',
      'Policy Number': canViewPHI ? p.insurance_policy_number : '***',
      'Group Number': canViewPHI ? p.insurance_group_number : '***',
      'Active Status': p.is_active !== false ? 'Active' : 'Inactive'
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Patients');
    XLSX.writeFile(wb, `ASC_Patients_${activeFacility?.name || 'Export'}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="dashboard-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {/* Privacy Mode Notice */}
      {!canViewPHI && (
        <div style={{
          backgroundColor: 'rgba(234, 179, 8, 0.1)',
          border: '1px solid rgba(234, 179, 8, 0.3)',
          borderRadius: '8px',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '0.8rem',
          color: '#fbbf24'
        }}>
          <EyeOff size={16} />
          <span>
            <strong>Minimum-Necessary Privacy Mode:</strong> You are viewing this patient directory with restricted clinical visibility (HIPAA 45 CFR § 164.502(b)). Patient names, MRNs, DOBs, and phone numbers are redacted.
          </span>
        </div>
      )}

      {/* Header & Controls */}
      <div className="card-header" style={{ marginBottom: '4px', flexWrap: 'wrap', gap: '12px' }}>
        <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Users size={18} style={{ color: 'var(--color-blue, #3b82f6)' }} />
          Patient Master Directory
        </h3>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Showing {filteredPatients.length} of {patients.length} records
          </span>

          {/* Search Box */}
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search name, MRN, insurance..."
              className="date-range-selector"
              style={{ paddingLeft: '30px', width: '240px' }}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          {searchQuery && (
            <button
              className="btn-header"
              onClick={() => {
                setSearchQuery('');
                setCurrentPage(1);
              }}
            >
              Clear
            </button>
          )}

          {/* Refresh Button */}
          <button
            className="btn-header"
            onClick={loadData}
            title="Refresh Directory"
            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
          </button>

          {/* Export Button */}
          <button
            className="btn-header"
            onClick={handleExport}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Download size={14} /> Export
          </button>

          {/* Add Patient Button */}
          {canModifyPatients && (
            <button
              className="btn-header btn-primary"
              onClick={handleOpenAdd}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={14} /> Add Patient
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="custom-table-container" style={{ overflowX: 'auto' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('mrn')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                MRN {sortField === 'mrn' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSort('name')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                Patient Name {sortField === 'name' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th>DOB</th>
              <th>Gender</th>
              <th>Insurance / Payer</th>
              <th>Contact Phone</th>
              <th>Status</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                  <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} />
                  <div>Loading patient directory...</div>
                </td>
              </tr>
            ) : paginatedPatients.length > 0 ? (
              paginatedPatients.map(patient => (
                <tr key={patient.id || patient.patient_uuid} className="clickable-row">
                  <td style={{ fontWeight: '600', fontFamily: 'monospace', color: 'var(--color-blue)', letterSpacing: '0.5px' }}>
                    #{canViewPHI ? patient.mrn : maskMRN(patient.mrn)}
                  </td>
                  <td style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        backgroundColor: patient.gender === 'Female' ? 'rgba(236, 72, 153, 0.12)' : 'rgba(59, 130, 246, 0.12)',
                        color: patient.gender === 'Female' ? 'var(--color-pink)' : 'var(--color-blue)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.8rem',
                        fontWeight: '700',
                        border: `1px solid ${patient.gender === 'Female' ? 'rgba(236, 72, 153, 0.2)' : 'rgba(59, 130, 246, 0.2)'}`
                      }}>
                        {canViewPHI ? (patient.name ? patient.name.trim().charAt(0) : '?') : '*'}
                      </div>
                      <span>
                        {canViewPHI ? (patient.name ? patient.name.trim() : '') : maskPatientName(patient.name)}
                      </span>
                    </div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{canViewPHI ? (patient.dob || '—') : maskDOB(patient.dob)}</td>
                  <td>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '12px',
                      fontSize: '0.7rem',
                      fontWeight: '600',
                      backgroundColor: patient.gender === 'Female' ? 'rgba(236, 72, 153, 0.12)' : 'rgba(59, 130, 246, 0.12)',
                      color: patient.gender === 'Female' ? 'var(--color-pink)' : 'var(--color-blue)'
                    }}>
                      {patient.gender || 'Unknown'}
                    </span>
                  </td>
                  <td style={{ fontWeight: '500' }}>
                    <div>{patient.insurance_provider || 'Self-Pay / None'}</div>
                    {patient.insurance_policy_number && (
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                        Pol: {canViewPHI ? patient.insurance_policy_number : '***' + String(patient.insurance_policy_number).slice(-4)}
                      </div>
                    )}
                  </td>
                  <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                    {canViewPHI ? (patient.phone || '—') : maskPhone(patient.phone)}
                  </td>
                  <td>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '0.65rem',
                      fontWeight: '600',
                      backgroundColor: patient.is_active !== false ? 'rgba(16, 185, 129, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                      color: patient.is_active !== false ? '#10b981' : '#64748b'
                    }}>
                      {patient.is_active !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                      {/* External Identifiers Button */}
                      <button
                        onClick={() => setExternalIdsPatient(patient)}
                        className="btn-header"
                        style={{ padding: '4px 6px', color: '#8b5cf6', borderColor: 'rgba(139, 92, 246, 0.3)' }}
                        title="External EMR Identifiers"
                      >
                        <Link2 size={13} />
                      </button>

                      {/* Edit Button */}
                      {canModifyPatients && (
                        <button
                          onClick={() => handleOpenEdit(patient)}
                          className="btn-header"
                          style={{ padding: '4px 6px', color: 'var(--color-blue)', borderColor: 'rgba(59, 130, 246, 0.3)' }}
                          title="Edit Patient Record"
                        >
                          <Edit size={13} />
                        </button>
                      )}

                      {/* Deactivate Button */}
                      {canDeletePatients && patient.is_active !== false && (
                        <button
                          onClick={() => handleDeletePatient(patient)}
                          className="btn-header"
                          style={{ padding: '4px 6px', color: 'var(--color-red)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                          title="Deactivate Patient"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
                  <Users size={32} style={{ opacity: 0.2, marginBottom: '12px' }} />
                  <div style={{ fontSize: '0.9rem', fontWeight: '600' }}>No patients match search criteria</div>
                  <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>Try adjusting your keyword filter or clear the query</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Page {currentPage} of {totalPages} ({filteredPatients.length} records)
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              className="page-btn"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            >
              Previous
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pageNum = i + 1;
              return (
                <button
                  key={pageNum}
                  className={`page-num ${currentPage === pageNum ? 'active' : ''}`}
                  onClick={() => setCurrentPage(pageNum)}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              className="page-btn"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Add / Edit Patient Modal */}
      {isFormOpen && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(3px)'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card, #1e293b)',
            borderRadius: '12px',
            border: '1px solid var(--border-color, #334155)',
            width: '90%',
            maxWidth: '720px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-color, #334155)'
            }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={18} style={{ color: 'var(--color-blue, #3b82f6)' }} />
                {editingPatient ? `Edit Patient: ${editingPatient.name}` : 'Register New Patient'}
              </h3>
              <button
                onClick={() => setIsFormOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSavePatient} style={{ overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="form-group">
                  <label>Patient Full Name *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. John Doe"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Medical Record Number (MRN) *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. 2045"
                    value={formData.mrn}
                    onChange={(e) => setFormData({ ...formData, mrn: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
                <div className="form-group">
                  <label>Date of Birth</label>
                  <input
                    type="date"
                    className="form-input"
                    value={formData.dob}
                    onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Gender</label>
                  <select
                    className="form-input"
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                    <option value="Unknown">Unknown</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Contact Phone</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. (239) 555-0199"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="form-group">
                  <label>Email Address</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="patient@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Address</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Street, City, State ZIP"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ marginTop: '6px', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: 'var(--color-blue)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Insurance & Payer Coverage
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <label>Canonical Payer (Relational)</label>
                    <select
                      className="form-input"
                      value={formData.primary_payer_id}
                      onChange={(e) => setFormData({ ...formData, primary_payer_id: e.target.value })}
                    >
                      <option value="">-- Select Registered Payer --</option>
                      {payers.map(pyr => (
                        <option key={pyr.id} value={pyr.id}>
                          {pyr.name} ({pyr.payer_type || 'General'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Insurance Provider Name (Text)</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Blue Cross Blue Shield"
                      value={formData.insurance_provider}
                      onChange={(e) => setFormData({ ...formData, insurance_provider: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginTop: '10px' }}>
                  <div className="form-group">
                    <label>Policy Number</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. POL-992341"
                      value={formData.insurance_policy_number}
                      onChange={(e) => setFormData({ ...formData, insurance_policy_number: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Group Number</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. GRP-0012"
                      value={formData.insurance_group_number}
                      onChange={(e) => setFormData({ ...formData, insurance_group_number: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Plan Type</label>
                    <select
                      className="form-input"
                      value={formData.insurance_type}
                      onChange={(e) => setFormData({ ...formData, insurance_type: e.target.value })}
                    >
                      <option value="Commercial">Commercial</option>
                      <option value="Medicare">Medicare</option>
                      <option value="Medicaid">Medicaid</option>
                      <option value="Self-Pay">Self-Pay</option>
                      <option value="Workers_Comp">Workers' Comp</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '10px' }}>
                  <div className="form-group">
                    <label>Effective Date</label>
                    <input
                      type="date"
                      className="form-input"
                      value={formData.insurance_effective_date}
                      onChange={(e) => setFormData({ ...formData, insurance_effective_date: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Expiration Date</label>
                    <input
                      type="date"
                      className="form-input"
                      value={formData.insurance_expiration_date}
                      onChange={(e) => setFormData({ ...formData, insurance_expiration_date: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Modal Actions */}
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
                marginTop: '12px',
                borderTop: '1px solid var(--border-color)',
                paddingTop: '16px'
              }}>
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setIsFormOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-save"
                >
                  {editingPatient ? 'Save Changes' : 'Register Patient'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* External Identifiers Drawer / Modal */}
      {externalIdsPatient && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(3px)'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card, #1e293b)',
            borderRadius: '12px',
            border: '1px solid var(--border-color, #334155)',
            width: '90%',
            maxWidth: '620px',
            padding: '20px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Link2 size={16} style={{ color: '#8b5cf6' }} />
                External EMR / EHR Identifiers: {externalIdsPatient.name}
              </h3>
              <button
                onClick={() => setExternalIdsPatient(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ margin: '0 0 14px 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Linked identifiers from external hospital systems (Epic, Athena, Cerner, Meditech) for cross-system case reconciliation.
            </p>

            {/* List Existing */}
            <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '16px' }}>
              {loadingExtIds ? (
                <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)' }}>Loading linked IDs...</div>
              ) : externalIds.length > 0 ? (
                <table className="custom-table" style={{ fontSize: '0.8rem' }}>
                  <thead>
                    <tr>
                      <th>System</th>
                      <th>Type</th>
                      <th>External ID</th>
                      <th>Linked At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {externalIds.map(ext => (
                      <tr key={ext.id}>
                        <td><span style={{ fontWeight: '600', color: '#c084fc' }}>{ext.source_system}</span></td>
                        <td>{ext.identifier_type}</td>
                        <td style={{ fontFamily: 'monospace' }}>{ext.external_id}</td>
                        <td style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {ext.created_at ? new Date(ext.created_at).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: '6px' }}>
                  No external EMR identifiers linked yet.
                </div>
              )}
            </div>

            {/* Add New Ext ID Form */}
            {canModifyPatients && (
              <form onSubmit={handleAddExternalId} style={{ borderTop: '1px solid var(--border-color)', paddingTop: '14px', display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.7rem', display: 'block', marginBottom: '4px' }}>System</label>
                  <select
                    className="form-input"
                    value={newExtIdForm.source_system}
                    onChange={(e) => setNewExtIdForm({ ...newExtIdForm, source_system: e.target.value })}
                  >
                    <option value="EPIC">EPIC</option>
                    <option value="ATHENA">ATHENA</option>
                    <option value="CERNER">CERNER</option>
                    <option value="MEDITECH">MEDITECH</option>
                    <option value="EXTERNAL_EHR">EXTERNAL_EHR</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.7rem', display: 'block', marginBottom: '4px' }}>Type</label>
                  <select
                    className="form-input"
                    value={newExtIdForm.identifier_type}
                    onChange={(e) => setNewExtIdForm({ ...newExtIdForm, identifier_type: e.target.value })}
                  >
                    <option value="MRN">MRN</option>
                    <option value="MPI">MPI</option>
                    <option value="ACCOUNT">ACCOUNT</option>
                    <option value="FHIR_ID">FHIR_ID</option>
                  </select>
                </div>
                <div style={{ flex: 2 }}>
                  <label style={{ fontSize: '0.7rem', display: 'block', marginBottom: '4px' }}>External Identifier *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. EMR-883921"
                    value={newExtIdForm.external_id}
                    onChange={(e) => setNewExtIdForm({ ...newExtIdForm, external_id: e.target.value })}
                  />
                </div>
                <button type="submit" className="btn-save" style={{ height: '36px', padding: '0 14px' }}>
                  Link
                </button>
              </form>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
