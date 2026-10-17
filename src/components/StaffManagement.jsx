import React, { useState, useEffect } from 'react';
import { supabase, db } from '../lib/supabase';
import { Edit, Trash2, Plus, X, Users, Search, Download } from 'lucide-react';
import Swal from 'sweetalert2';
import './StaffManagement.css';

const DEPARTMENT_CATEGORIES = [
  'Executive/Management',
  'Pre-Op/PACU',
  'Operating Room RN',
  'Scrub Tech',
  'Sterile Technician',
  'Front Office',
  'Other'
];

const StaffManagement = ({ activeFacility, facilities = [], isSuperAdmin: propIsSuperAdmin }) => {
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [facilitiesList, setFacilitiesList] = useState(facilities || []);

  const session = db.getSession();
  const isSuperAdmin = propIsSuperAdmin !== undefined ? propIsSuperAdmin : (session?.role === 'super_admin');

  useEffect(() => {
    if (facilities && facilities.length > 0) {
      setFacilitiesList(facilities);
    } else {
      db.getFacilities().then(res => {
        if (res && res.length > 0) setFacilitiesList(res);
      }).catch(console.error);
    }
  }, [facilities]);

  const [formData, setFormData] = useState({
    firstname: '',
    lastname: '',
    department: 'Operating Room RN',
    role: '',
    specialty: '',
    license_id: '',
    phone: '',
    email: '',
    hourly_rate: '',
    monthly_salary: '',
    benefits: '',
    facility_id: ''
  });

  const fetchStaff = async () => {
    setLoading(true);
    try {
      const targetFac = activeFacility?.id || db.getActiveFacility()?.id;
      const data = await db.getStaff(targetFac);
      setStaffList(data || []);
    } catch (err) {
      console.error('Error fetching staff:', err);
      Swal.fire('Error', `Failed to load staff list: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, [activeFacility?.id]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const openModal = (staff = null) => {
    if (staff) {
      setEditingStaff(staff);
      setFormData({
        firstname: staff.firstname || '',
        lastname: staff.lastname || '',
        department: staff.department || 'Operating Room RN',
        role: staff.role || '',
        specialty: staff.specialty || '',
        license_id: staff.license_id || '',
        phone: staff.phone || '',
        email: staff.email || '',
        hourly_rate: staff.hourly_rate || '',
        monthly_salary: staff.monthly_salary || '',
        benefits: staff.benefits || '',
        facility_id: staff.facility_id || activeFacility?.id || (facilitiesList[0]?.id || '')
      });
    } else {
      setEditingStaff(null);
      setFormData({
        firstname: '',
        lastname: '',
        department: 'Operating Room RN',
        role: '',
        specialty: '',
        license_id: '',
        phone: '',
        email: '',
        hourly_rate: '',
        monthly_salary: '',
        benefits: '',
        facility_id: activeFacility?.id || (facilitiesList[0]?.id || '')
      });
    }
    setIsModalOpen(true);
  };

  const saveStaff = async () => {
    if (!formData.firstname || !formData.lastname) {
      Swal.fire('Validation Error', 'First and Last name are required.', 'warning');
      return;
    }

    const targetFac = activeFacility?.id || db.getActiveFacility()?.id;
    const payload = {
      ...formData,
      facility_id: formData.facility_id || editingStaff?.facility_id || targetFac,
      hourly_rate: formData.hourly_rate ? parseFloat(formData.hourly_rate) : null,
      monthly_salary: formData.monthly_salary ? parseFloat(formData.monthly_salary) : null,
      benefits: formData.benefits ? parseFloat(formData.benefits) : null,
    };

    try {
      if (editingStaff) {
        await db.updateStaff(editingStaff.id, payload);
        Swal.fire('Success', 'Staff member updated!', 'success');
      } else {
        await db.addStaff(payload);
        Swal.fire('Success', 'Staff member added!', 'success');
      }
      setIsModalOpen(false);
      fetchStaff();
    } catch (err) {
      console.error('Error saving staff:', err);
      Swal.fire('Error', 'Failed to save staff member: ' + (err.message || ''), 'error');
    }
  };

  const deleteStaff = async (id) => {
    const result = await Swal.fire({
      title: 'Are you sure?',
      text: "You won't be able to revert this!",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, delete it!'
    });

    if (result.isConfirmed) {
      try {
        await db.deleteStaff(id);
        Swal.fire('Deleted!', 'Staff member has been removed.', 'success');
        fetchStaff();
      } catch (err) {
        console.error('Error deleting staff:', err);
        Swal.fire('Error', 'Failed to delete staff member: ' + (err.message || ''), 'error');
      }
    }
  };

  const handleExportStaff = () => {
    if (!staffList || staffList.length === 0) return;
    
    // Phase 25: HIPAA § 164.312(b) Audit Exfiltration Tracking
    try {
      db.logExportAuditEvent({
        exportType: 'CSV',
        tableName: 'staff',
        recordCount: staffList.length,
        filterMetadata: {
          staff_count: staffList.length,
          departments_included: DEPARTMENT_CATEGORIES
        }
      });
    } catch {
      // Non-blocking telemetry
    }

    const headers = ['Department', 'First Name', 'Last Name', 'Role', 'Specialty / Position', 'License / ID', 'Phone', 'Email', 'Hourly Rate', 'Monthly Salary', 'Benefits'];
    
    const csvContent = [
      headers.join(','),
      ...staffList.map(s => {
        return [
          `"${s.department || ''}"`,
          `"${s.firstname || ''}"`,
          `"${s.lastname || ''}"`,
          `"${s.role || ''}"`,
          `"${s.specialty || ''}"`,
          `"${s.license_id || ''}"`,
          `"${s.phone || ''}"`,
          `"${s.email || ''}"`,
          `"${s.hourly_rate || ''}"`,
          `"${s.monthly_salary || ''}"`,
          `"${s.benefits || ''}"`
        ].join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'staff_directory.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Group staff by department
  const groupedStaff = DEPARTMENT_CATEGORIES.reduce((acc, dept) => {
    acc[dept] = staffList.filter(s => s.department === dept);
    return acc;
  }, {});
  
  // Also collect any staff that have unmapped or empty departments
  const otherStaff = staffList.filter(s => !DEPARTMENT_CATEGORIES.includes(s.department));
  if (otherStaff.length > 0) {
    if (!groupedStaff['Other']) groupedStaff['Other'] = [];
    groupedStaff['Other'] = [...groupedStaff['Other'], ...otherStaff];
  }

  const formatCurrency = (value) => {
    if (!value) return '-';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  const filteredStaff = staffList.filter(s => {
    const search = searchQuery.toLowerCase();
    return (
      s.firstname?.toLowerCase().includes(search) ||
      s.lastname?.toLowerCase().includes(search) ||
      s.role?.toLowerCase().includes(search) ||
      s.department?.toLowerCase().includes(search) ||
      s.specialty?.toLowerCase().includes(search) ||
      s.license_id?.toLowerCase().includes(search)
    );
  });

  const groupedFilteredStaff = DEPARTMENT_CATEGORIES.reduce((acc, dept) => {
    acc[dept] = filteredStaff.filter(s => s.department === dept);
    return acc;
  }, {});
  
  const otherFilteredStaff = filteredStaff.filter(s => !DEPARTMENT_CATEGORIES.includes(s.department));
  if (otherFilteredStaff.length > 0) {
    if (!groupedFilteredStaff['Other']) groupedFilteredStaff['Other'] = [];
    groupedFilteredStaff['Other'] = [...groupedFilteredStaff['Other'], ...otherFilteredStaff];
  }

  return (
    <div className="dashboard-card staff-management-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="card-header" style={{ marginBottom: '4px' }}>
        <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase' }}>
          <Users size={16} style={{ color: 'var(--color-blue)' }} />
          Nurses & Staff Management
        </h3>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Showing {filteredStaff.length} of {staffList.length} records
          </span>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search name, role, department..."
              className="date-range-selector"
              style={{ paddingLeft: '30px', width: '260px' }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {searchQuery && (
            <button
              className="btn-header"
              onClick={() => setSearchQuery('')}
              style={{ minWidth: 'fit-content' }}
            >
              Clear
            </button>
          )}
          <button
            className="btn-header"
            onClick={handleExportStaff}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 'fit-content' }}
          >
            <Download size={14} /> Download
          </button>
          <button
            className="btn-header btn-primary"
            onClick={() => openModal()}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 'fit-content' }}
          >
            <Plus size={14} /> Add Staff Member
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading staff data...</div>
      ) : staffList.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>No staff members found. Add a staff member to get started.</div>
      ) : (
        <div className="custom-table-container" style={{ overflowX: 'hidden' }}>
          <table className="custom-table">
            <thead>
              <tr>
                <th>DEPARTMENT</th>
                <th>STAFF NAME</th>
                <th>ROLE</th>
                <th>SPECIALTY / POSITION</th>
                <th>LICENSE / ID</th>
                <th>PAY RATE</th>
                <th>BENEFITS</th>
                <th style={{ textAlign: 'center' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredStaff.length > 0 ? (
                Object.entries(groupedFilteredStaff).map(([department, staffMembers]) => {
                  if (staffMembers.length === 0) return null;
                  return staffMembers.map((staff, index) => (
                    <tr key={staff.id} className="clickable-row">
                      {index === 0 ? (
                        <td rowSpan={staffMembers.length} style={{ verticalAlign: 'middle', fontWeight: 'bold', color: 'var(--color-blue)', backgroundColor: 'var(--bg-card)' }}>
                          {department}
                        </td>
                      ) : null}
                      <td style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            backgroundColor: 'rgba(59, 130, 246, 0.12)',
                            color: 'var(--color-blue)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.8rem',
                            fontWeight: '700',
                            border: '1px solid rgba(59, 130, 246, 0.2)'
                          }}>
                            {staff.firstname ? staff.firstname.charAt(0).toUpperCase() : '?'}
                          </div>
                          {staff.firstname} {staff.lastname}
                        </div>
                      </td>
                      <td>
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '12px',
                          fontSize: '0.7rem',
                          fontWeight: '600',
                          backgroundColor: 'rgba(59, 130, 246, 0.12)',
                          color: 'var(--color-blue)',
                          border: '1px solid rgba(59, 130, 246, 0.15)'
                        }}>
                          {staff.role || '-'}
                        </span>
                      </td>
                      <td style={{ fontWeight: '500' }}>{staff.specialty || '-'}</td>
                      <td style={{ fontWeight: '500', fontFamily: 'monospace' }}>{staff.license_id || '-'}</td>
                      <td style={{ fontWeight: '500' }}>
                        {staff.hourly_rate ? `${formatCurrency(staff.hourly_rate)}/hr` : 
                         staff.monthly_salary ? `${formatCurrency(staff.monthly_salary)}/mo` : '-'}
                      </td>
                      <td style={{ fontWeight: '500' }}>{staff.benefits ? formatCurrency(staff.benefits) : '-'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button 
                            className="btn-icon" 
                            style={{ padding: '6px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'transparent', color: 'var(--color-blue)', cursor: 'pointer' }}
                            onClick={(e) => { e.stopPropagation(); openModal(staff); }}
                          >
                            <Edit size={14} />
                          </button>
                          <button 
                            className="btn-icon"
                            style={{ padding: '6px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'transparent', color: 'var(--color-red)', cursor: 'pointer' }}
                            onClick={(e) => { e.stopPropagation(); deleteStaff(staff.id); }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ));
                })
              ) : (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                    No staff members match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="staff-modal-overlay">
          <div className="staff-modal-content">
            <div className="staff-modal-header">
              <h3>{editingStaff ? 'Edit Staff Member' : 'Add Staff Member'}</h3>
              <button className="staff-modal-close" onClick={() => setIsModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="staff-modal-body">
              <div className="staff-form-grid">
                {isSuperAdmin && (
                  <div className="staff-form-group full-width" style={{ padding: '12px 14px', background: 'rgba(59, 130, 246, 0.06)', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)', marginBottom: '4px' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: '700', color: 'var(--color-blue)', display: 'block', marginBottom: '6px' }}>
                      Assign Facility <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <select
                      name="facility_id"
                      value={formData.facility_id || activeFacility?.id || ''}
                      onChange={handleInputChange}
                      className="staff-form-input"
                      style={{ width: '100%', height: '38px', background: 'var(--bg-card)', color: 'var(--text-primary)', fontWeight: '600', padding: '0 10px', borderRadius: '6px' }}
                      required
                    >
                      {facilitiesList.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="staff-form-group">
                  <label>First Name</label>
                  <input type="text" name="firstname" value={formData.firstname} onChange={handleInputChange} placeholder="First Name" />
                </div>
                <div className="staff-form-group">
                  <label>Last Name</label>
                  <input type="text" name="lastname" value={formData.lastname} onChange={handleInputChange} placeholder="Last Name" />
                </div>
                <div className="staff-form-group full-width">
                  <label>Department Category</label>
                  <select name="department" value={formData.department} onChange={handleInputChange}>
                    {DEPARTMENT_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div className="staff-form-group">
                  <label>Role</label>
                  <input type="text" name="role" value={formData.role} onChange={handleInputChange} placeholder="e.g., RN, Admin, Technician" />
                </div>
                <div className="staff-form-group">
                  <label>Specialty / Sub-position</label>
                  <input type="text" name="specialty" value={formData.specialty} onChange={handleInputChange} placeholder="e.g., PACU, Scrub" />
                </div>
                <div className="staff-form-group">
                  <label>License / ID</label>
                  <input type="text" name="license_id" value={formData.license_id} onChange={handleInputChange} placeholder="License or ID #" />
                </div>
                <div className="staff-form-group">
                  <label>Phone</label>
                  <input type="text" name="phone" value={formData.phone} onChange={handleInputChange} placeholder="Phone Number" />
                </div>
                <div className="staff-form-group full-width">
                  <label>Email</label>
                  <input type="email" name="email" value={formData.email} onChange={handleInputChange} placeholder="Email Address" />
                </div>
                <div className="staff-form-group">
                  <label>Hourly Rate ($)</label>
                  <input type="number" step="0.01" name="hourly_rate" value={formData.hourly_rate} onChange={handleInputChange} placeholder="e.g., 40.00" />
                </div>
                <div className="staff-form-group">
                  <label>Monthly Salary ($)</label>
                  <input type="number" step="0.01" name="monthly_salary" value={formData.monthly_salary} onChange={handleInputChange} placeholder="e.g., 5000.00" />
                </div>
                <div className="staff-form-group full-width">
                  <label>Employer Portion of Benefits ($)</label>
                  <input type="number" step="0.01" name="benefits" value={formData.benefits} onChange={handleInputChange} placeholder="Monthly benefits cost" />
                </div>
              </div>
            </div>
            <div className="staff-modal-footer">
              <button className="btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
              <button className="btn-primary" onClick={saveStaff}>
                Save Staff Member
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffManagement;
