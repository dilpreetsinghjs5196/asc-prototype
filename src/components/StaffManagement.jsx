import React, { useState, useEffect, useMemo } from 'react';
import { supabase, db } from '../lib/supabase';
import {
  Users,
  Search,
  Download,
  Plus,
  Edit,
  Trash2,
  X,
  ShieldCheck,
  Calendar,
  Clock,
  Award,
  AlertTriangle,
  FileText,
  Activity,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import Swal from 'sweetalert2';
import './StaffManagement.css';

const DEPARTMENT_CATEGORIES = [
  'Executive/Management',
  'Pre-Op/PACU',
  'Operating Room RN',
  'Scrub Tech',
  'Sterile Technician',
  'Front Office',
  'Anesthesia',
  'Other'
];

const STAFF_TYPES = [
  { value: 'Registered_Nurse', label: 'Registered Nurse (RN)' },
  { value: 'Surgical_Technologist', label: 'Surgical Technologist (CST)' },
  { value: 'Physician_Anesthesiologist', label: 'Physician Anesthesiologist (MD/DO)' },
  { value: 'CRNA', label: 'Certified Registered Nurse Anesthetist (CRNA)' },
  { value: 'Sterile_Processing_Tech', label: 'Sterile Processing Technician (CRCST)' },
  { value: 'Nurse_Practitioner', label: 'Nurse Practitioner (ARNP)' },
  { value: 'Administrative', label: 'Administrative / Leadership' },
  { value: 'Other', label: 'Other Staff' }
];

const CREDENTIAL_TYPES = [
  { value: 'State_Nursing_License', label: 'State Nursing License (RN)' },
  { value: 'State_Medical_License', label: 'State Medical License (MD/DO)' },
  { value: 'CRNA_NBCRNA_Certification', label: 'CRNA NBCRNA Certification' },
  { value: 'CST_NBSTSA_Certification', label: 'Certified Surgical Tech (CST)' },
  { value: 'BLS_American_Heart', label: 'Basic Life Support (BLS - AHA)' },
  { value: 'ACLS_American_Heart', label: 'Advanced Cardiac Life Support (ACLS)' },
  { value: 'PALS_American_Heart', label: 'Pediatric Life Support (PALS)' },
  { value: 'DEA_Registration', label: 'Federal DEA Registration' },
  { value: 'State_Controlled_Substance', label: 'State Controlled Substance' },
  { value: 'C_Arm_Fluoroscopy_Permit', label: 'C-Arm Fluoroscopy Permit' },
  { value: 'Laser_Safety_Certificate', label: 'Laser Safety Officer Certificate' }
];

const EMPLOYMENT_TYPES = [
  { value: 'Full_Time', label: 'Full Time (W2)' },
  { value: 'Part_Time', label: 'Part Time (W2)' },
  { value: 'PRN', label: 'Per Diem / PRN' },
  { value: 'Contract_Agency', label: 'Contract / Agency' },
  { value: 'Temporary', label: 'Temporary' }
];

export const formatCredentials = (creds, fallback = 'RN') => {
  if (!creds) return fallback;
  if (typeof creds === 'string') return creds;
  if (Array.isArray(creds)) {
    return creds.map(c => (typeof c === 'string' ? c : (c.credential_number || c.credential_type || ''))).filter(Boolean).join(', ') || fallback;
  }
  if (typeof creds === 'object') {
    const val = creds.credential_number || creds.credential_type;
    return val ? String(val).replace(/_/g, ' ') : fallback;
  }
  return String(creds);
};

const StaffManagement = ({ activeFacility, facilities = [], isSuperAdmin: propIsSuperAdmin }) => {
  // Navigation View Tabs: 'directory' | 'credentials' | 'time_off' | 'anesthesia'
  const [activeTab, setActiveTab] = useState('directory');

  // Core Data Lists
  const [staffList, setStaffList] = useState([]);
  const [credentialsList, setCredentialsList] = useState([]);
  const [timeOffList, setTimeOffList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [facilitiesList, setFacilitiesList] = useState(facilities || []);

  // Staff Modal State
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);

  // Credential Modal State
  const [isCredModalOpen, setIsCredModalOpen] = useState(false);
  const [credFormData, setCredFormData] = useState({
    staff_id: '',
    credential_type: 'State_Nursing_License',
    credential_number: '',
    issuing_jurisdiction: 'FL',
    expiration_date: '',
    facility_id: ''
  });

  // Time-Off Modal State
  const [isTimeOffModalOpen, setIsTimeOffModalOpen] = useState(false);
  const [timeOffFormData, setTimeOffFormData] = useState({
    staff_id: '',
    time_off_type: 'Vacation',
    start_date: '',
    end_date: '',
    reason: '',
    facility_id: ''
  });

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

  // Form Data for Staff Add / Edit
  const [formData, setFormData] = useState({
    firstname: '',
    lastname: '',
    department: 'Operating Room RN',
    role: '',
    specialty: '',
    staff_type: 'Registered_Nurse',
    credentials: 'RN, BSN',
    employment_type: 'Full_Time',
    license_id: '',
    phone: '',
    email: '',
    hourly_rate: '',
    monthly_salary: '',
    benefits: '',
    facility_id: ''
  });

  // Fetch all staff data
  const fetchAllData = async () => {
    setLoading(true);
    try {
      const targetFac = activeFacility?.id || db.getActiveFacility()?.id;
      
      // 1. Fetch Staff (using enterprise affiliations helper with fallback)
      const staffData = await db.getStaffWithAffiliations(targetFac);
      setStaffList(staffData || []);

      // 2. Fetch Credentials
      const credsData = await db.getStaffCredentials(null, targetFac);
      setCredentialsList(credsData || []);

      // 3. Fetch Time Off
      const timeOffData = await db.getStaffTimeOff(targetFac);
      setTimeOffList(timeOffData || []);
    } catch (err) {
      console.error('Error fetching staff workforce data:', err);
      Swal.fire('Error', `Failed to load staff workforce data: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, [activeFacility?.id]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const openStaffModal = (staff = null) => {
    if (staff) {
      setEditingStaff(staff);
      setFormData({
        firstname: staff.firstname || '',
        lastname: staff.lastname || '',
        department: staff.department || 'Operating Room RN',
        role: staff.role || '',
        specialty: staff.specialty || '',
        staff_type: staff.staff_type || (staff.department === 'Operating Room RN' ? 'Registered_Nurse' : 'Other'),
        credentials: formatCredentials(staff.credentials, staff.department === 'Operating Room RN' ? 'RN, BSN' : ''),
        employment_type: staff.affiliations?.[0]?.employment_type || (staff.lastname?.includes('(PT)') ? 'Part_Time' : 'Full_Time'),
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
        staff_type: 'Registered_Nurse',
        credentials: 'RN, BSN',
        employment_type: 'Full_Time',
        license_id: '',
        phone: '',
        email: '',
        hourly_rate: '',
        monthly_salary: '',
        benefits: '',
        facility_id: activeFacility?.id || (facilitiesList[0]?.id || '')
      });
    }
    setIsStaffModalOpen(true);
  };

  const saveStaff = async () => {
    if (!formData.firstname || !formData.lastname) {
      Swal.fire('Validation Error', 'First and Last name are required.', 'warning');
      return;
    }

    const targetFac = formData.facility_id || activeFacility?.id || db.getActiveFacility()?.id;
    const payload = {
      firstname: formData.firstname.trim(),
      lastname: formData.lastname.trim(),
      department: formData.department,
      role: formData.role,
      specialty: formData.specialty,
      staff_type: formData.staff_type,
      credentials: formData.credentials,
      license_id: formData.license_id,
      phone: formData.phone,
      email: formData.email,
      facility_id: targetFac,
      hourly_rate: formData.hourly_rate ? parseFloat(formData.hourly_rate) : null,
      monthly_salary: formData.monthly_salary ? parseFloat(formData.monthly_salary) : null,
      benefits: formData.benefits ? parseFloat(formData.benefits) : null,
    };

    try {
      let savedRecord = null;
      if (editingStaff) {
        savedRecord = await db.updateStaff(editingStaff.id, payload);
        Swal.fire('Success', 'Staff member updated successfully!', 'success');
      } else {
        savedRecord = await db.addStaff(payload);
        Swal.fire('Success', 'Staff member added successfully!', 'success');
      }

      // Sync 1NF staff_facility_affiliations in non-blocking fashion
      if (savedRecord && savedRecord.id && targetFac) {
        try {
          const deptMap = {
            'Operating Room RN': 'Operating_Room',
            'Pre-Op/PACU': 'PACU',
            'Scrub Tech': 'Operating_Room',
            'Sterile Technician': 'Sterile_Processing',
            'Executive/Management': 'Executive_Management',
            'Front Office': 'Front_Office',
            'Anesthesia': 'Anesthesia'
          };
          await db.addStaffAffiliation({
            staff_id: savedRecord.id,
            facility_id: targetFac,
            employment_type: formData.employment_type || 'Full_Time',
            primary_department: deptMap[formData.department] || 'Operating_Room',
            clinical_role: formData.role || 'Staff_Member',
            hourly_rate: payload.hourly_rate,
            monthly_salary: payload.monthly_salary,
            is_active: true
          });
        } catch {
          // Affiliation table may already have it or pending migration
        }
      }

      setIsStaffModalOpen(false);
      fetchAllData();
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
        fetchAllData();
      } catch (err) {
        console.error('Error deleting staff:', err);
        Swal.fire('Error', 'Failed to delete staff member: ' + (err.message || ''), 'error');
      }
    }
  };

  // Credential Actions
  const openAddCredModal = (staffId = '') => {
    setCredFormData({
      staff_id: staffId || (staffList[0]?.id || ''),
      credential_type: 'State_Nursing_License',
      credential_number: '',
      issuing_jurisdiction: 'FL',
      expiration_date: '',
      facility_id: activeFacility?.id || (facilitiesList[0]?.id || '')
    });
    setIsCredModalOpen(true);
  };

  const saveCredential = async () => {
    if (!credFormData.staff_id || !credFormData.credential_number || !credFormData.expiration_date) {
      Swal.fire('Validation Error', 'Staff member, credential number, and expiration date are required.', 'warning');
      return;
    }

    try {
      await db.addStaffCredential({
        ...credFormData,
        staff_id: parseInt(credFormData.staff_id, 10),
        facility_id: credFormData.facility_id || activeFacility?.id || db.getActiveFacility()?.id
      });
      Swal.fire('Success', 'Credential verified and logged!', 'success');
      setIsCredModalOpen(false);
      fetchAllData();
    } catch (err) {
      console.error('Error saving credential:', err);
      Swal.fire('Error', 'Failed to log credential: ' + (err.message || ''), 'error');
    }
  };

  const deleteCredential = async (id) => {
    const res = await Swal.fire({
      title: 'Revoke / Remove Credential?',
      text: 'This will remove the active credential verification record.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444'
    });
    if (res.isConfirmed) {
      try {
        await db.deleteStaffCredential(id);
        Swal.fire('Removed', 'Credential record deleted.', 'success');
        fetchAllData();
      } catch (err) {
        Swal.fire('Error', err.message, 'error');
      }
    }
  };

  // Time-Off Actions
  const openAddTimeOffModal = (staffId = '') => {
    setTimeOffFormData({
      staff_id: staffId || (staffList[0]?.id || ''),
      time_off_type: 'Vacation',
      start_date: '',
      end_date: '',
      reason: '',
      facility_id: activeFacility?.id || (facilitiesList[0]?.id || '')
    });
    setIsTimeOffModalOpen(true);
  };

  const saveTimeOff = async () => {
    if (!timeOffFormData.staff_id || !timeOffFormData.start_date || !timeOffFormData.end_date) {
      Swal.fire('Validation Error', 'Staff member, start date, and end date are required.', 'warning');
      return;
    }

    try {
      await db.addStaffTimeOff({
        ...timeOffFormData,
        staff_id: parseInt(timeOffFormData.staff_id, 10),
        facility_id: timeOffFormData.facility_id || activeFacility?.id || db.getActiveFacility()?.id
      });
      Swal.fire('Success', 'Time-off record logged successfully!', 'success');
      setIsTimeOffModalOpen(false);
      fetchAllData();
    } catch (err) {
      console.error('Error saving time off:', err);
      Swal.fire('Error', 'Failed to log time off: ' + (err.message || ''), 'error');
    }
  };

  const deleteTimeOff = async (id) => {
    const res = await Swal.fire({
      title: 'Cancel / Delete Time Off?',
      text: 'This will remove the scheduled leave entry.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444'
    });
    if (res.isConfirmed) {
      try {
        await db.deleteStaffTimeOff(id);
        Swal.fire('Cancelled', 'Time-off record removed.', 'success');
        fetchAllData();
      } catch (err) {
        Swal.fire('Error', err.message, 'error');
      }
    }
  };

  // CSV Export with Audit Log
  const handleExportStaff = () => {
    if (!staffList || staffList.length === 0) return;

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

    const headers = ['Department', 'Staff Type', 'First Name', 'Last Name', 'Role', 'Credentials', 'Specialty', 'License / ID', 'Phone', 'Email', 'Hourly Rate', 'Monthly Salary', 'Benefits'];

    const csvContent = [
      headers.join(','),
      ...staffList.map(s => [
        `"${s.department || ''}"`,
        `"${s.staff_type || ''}"`,
        `"${s.firstname || ''}"`,
        `"${s.lastname || ''}"`,
        `"${s.role || ''}"`,
        `"${formatCredentials(s.credentials, '')}"`,
        `"${s.specialty || ''}"`,
        `"${s.license_id || ''}"`,
        `"${s.phone || ''}"`,
        `"${s.email || ''}"`,
        `"${s.hourly_rate || ''}"`,
        `"${s.monthly_salary || ''}"`,
        `"${s.benefits || ''}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `staff_directory_${activeTab}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatCurrency = (value) => {
    if (!value) return '-';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  // Filtered staff list
  const filteredStaff = useMemo(() => {
    const search = searchQuery.toLowerCase();
    return staffList.filter(s => {
      const matchesSearch = (
        s.firstname?.toLowerCase().includes(search) ||
        s.lastname?.toLowerCase().includes(search) ||
        s.role?.toLowerCase().includes(search) ||
        s.department?.toLowerCase().includes(search) ||
        s.specialty?.toLowerCase().includes(search) ||
        s.license_id?.toLowerCase().includes(search) ||
        formatCredentials(s.credentials, '').toLowerCase().includes(search)
      );
      const matchesDept = (deptFilter === 'ALL' || s.department === deptFilter);
      return matchesSearch && matchesDept;
    });
  }, [staffList, searchQuery, deptFilter]);

  // Group filtered staff by Department Category
  const groupedFilteredStaff = useMemo(() => {
    const acc = DEPARTMENT_CATEGORIES.reduce((map, dept) => {
      map[dept] = filteredStaff.filter(s => s.department === dept);
      return map;
    }, {});
    const otherStaff = filteredStaff.filter(s => !DEPARTMENT_CATEGORIES.includes(s.department));
    if (otherStaff.length > 0) {
      if (!acc['Other']) acc['Other'] = [];
      acc['Other'] = [...acc['Other'], ...otherStaff];
    }
    return acc;
  }, [filteredStaff]);

  // Anesthesia-specific roster
  const anesthesiaStaff = useMemo(() => {
    return staffList.filter(s =>
      s.staff_type === 'Physician_Anesthesiologist' ||
      s.staff_type === 'CRNA' ||
      s.department === 'Anesthesia' ||
      (s.role && s.role.toLowerCase().includes('anesthes')) ||
      (s.role && s.role.toLowerCase().includes('crna'))
    );
  }, [staffList]);

  // Check credential expiration alerts (e.g. within 60 days)
  const expiringCredentialsCount = useMemo(() => {
    const now = new Date();
    const sixtyDaysLater = new Date();
    sixtyDaysLater.setDate(now.getDate() + 60);

    return credentialsList.filter(c => {
      if (!c.expiration_date) return false;
      const exp = new Date(c.expiration_date);
      return exp <= sixtyDaysLater;
    }).length;
  }, [credentialsList]);

  return (
    <div className="dashboard-card staff-management-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div className="card-header" style={{ marginBottom: '4px', flexWrap: 'wrap', gap: '12px' }}>
        <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase' }}>
          <Users size={18} style={{ color: 'var(--color-blue)' }} />
          Nurses & Clinical Workforce Management
        </h3>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search staff, role, license..."
              className="date-range-selector"
              style={{ paddingLeft: '30px', width: '220px' }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {searchQuery && (
            <button className="btn-header" onClick={() => setSearchQuery('')} style={{ minWidth: 'fit-content' }}>
              Clear
            </button>
          )}

          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="date-range-selector"
            style={{ width: '160px', fontWeight: '500' }}
          >
            <option value="ALL">All Departments</option>
            {DEPARTMENT_CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          <button
            className="btn-header"
            onClick={handleExportStaff}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 'fit-content' }}
          >
            <Download size={14} /> Export CSV
          </button>

          <button
            className="btn-header btn-primary"
            onClick={() => openStaffModal()}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 'fit-content' }}
          >
            <Plus size={14} /> Add Staff Member
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div style={{
        display: 'flex',
        gap: '8px',
        borderBottom: '1px solid var(--border-color)',
        paddingBottom: '8px'
      }}>
        <button
          onClick={() => setActiveTab('directory')}
          className="btn-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: activeTab === 'directory' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
            color: activeTab === 'directory' ? 'var(--color-blue)' : 'var(--text-muted)',
            fontWeight: activeTab === 'directory' ? '700' : '500',
            borderColor: activeTab === 'directory' ? 'var(--color-blue)' : 'var(--border-color)'
          }}
        >
          <Users size={14} />
          Workforce Directory ({staffList.length})
        </button>

        <button
          onClick={() => setActiveTab('credentials')}
          className="btn-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: activeTab === 'credentials' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
            color: activeTab === 'credentials' ? 'var(--color-blue)' : 'var(--text-muted)',
            fontWeight: activeTab === 'credentials' ? '700' : '500',
            borderColor: activeTab === 'credentials' ? 'var(--color-blue)' : 'var(--border-color)'
          }}
        >
          <ShieldCheck size={14} />
          Licensing & Credentials ({credentialsList.length})
          {expiringCredentialsCount > 0 && (
            <span style={{
              background: '#ef4444',
              color: '#ffffff',
              fontSize: '0.65rem',
              padding: '2px 6px',
              borderRadius: '10px',
              fontWeight: 'bold'
            }}>
              {expiringCredentialsCount} alert{expiringCredentialsCount > 1 ? 's' : ''}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('time_off')}
          className="btn-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: activeTab === 'time_off' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
            color: activeTab === 'time_off' ? 'var(--color-blue)' : 'var(--text-muted)',
            fontWeight: activeTab === 'time_off' ? '700' : '500',
            borderColor: activeTab === 'time_off' ? 'var(--color-blue)' : 'var(--border-color)'
          }}
        >
          <Calendar size={14} />
          Availability & Time-Off ({timeOffList.length})
        </button>

        <button
          onClick={() => setActiveTab('anesthesia')}
          className="btn-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: activeTab === 'anesthesia' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
            color: activeTab === 'anesthesia' ? 'var(--color-blue)' : 'var(--text-muted)',
            fontWeight: activeTab === 'anesthesia' ? '700' : '500',
            borderColor: activeTab === 'anesthesia' ? 'var(--color-blue)' : 'var(--border-color)'
          }}
        >
          <Activity size={14} />
          Anesthesia Providers ({anesthesiaStaff.length})
        </button>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading workforce and credentialing records...
        </div>
      ) : activeTab === 'directory' ? (
        /* TAB 1: WORKFORCE DIRECTORY */
        staffList.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            No staff members found. Add a staff member to get started.
          </div>
        ) : (
          <div className="custom-table-container" style={{ overflowX: 'auto' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>DEPARTMENT</th>
                  <th>STAFF NAME</th>
                  <th>ROLE</th>
                  <th>TYPE & CREDENTIALS</th>
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
                          <td
                            rowSpan={staffMembers.length}
                            style={{
                              verticalAlign: 'middle',
                              fontWeight: 'bold',
                              color: 'var(--color-blue)',
                              backgroundColor: 'var(--bg-card)'
                            }}
                          >
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
                            <div>
                              <div>{staff.firstname} {staff.lastname}</div>
                              {staff.email && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: '400' }}>
                                  {staff.email}
                                </div>
                              )}
                            </div>
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
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                              {formatCredentials(staff.credentials, 'RN')}
                            </span>
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                              {staff.staff_type ? staff.staff_type.replace(/_/g, ' ') : 'Registered Nurse'}
                            </span>
                          </div>
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
                              title="Add Credential"
                              style={{ padding: '6px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'transparent', color: 'var(--color-green, #10b981)', cursor: 'pointer' }}
                              onClick={(e) => { e.stopPropagation(); openAddCredModal(staff.id); }}
                            >
                              <ShieldCheck size={14} />
                            </button>
                            <button
                              className="btn-icon"
                              title="Edit Staff Member"
                              style={{ padding: '6px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'transparent', color: 'var(--color-blue)', cursor: 'pointer' }}
                              onClick={(e) => { e.stopPropagation(); openStaffModal(staff); }}
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              className="btn-icon"
                              title="Delete Staff Member"
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
                    <td colSpan="9" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                      No staff members match your search criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )
      ) : activeTab === 'credentials' ? (
        /* TAB 2: LICENSING & CREDENTIALS */
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Monitoring professional state licenses, BLS, ACLS, CST certifications, and expiration alert interlocks.
            </span>
            <button className="btn-header btn-primary" onClick={() => openAddCredModal()}>
              <Plus size={14} /> Add Staff Credential
            </button>
          </div>

          {credentialsList.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No credentials logged yet. Click "Add Staff Credential" to register state nursing licenses, BLS, or ACLS.
            </div>
          ) : (
            <div className="custom-table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>STAFF MEMBER</th>
                    <th>CREDENTIAL TYPE</th>
                    <th>LICENSE / CERT #</th>
                    <th>JURISDICTION</th>
                    <th>EXPIRATION DATE</th>
                    <th>STATUS ALERT</th>
                    <th style={{ textAlign: 'center' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {credentialsList.map(c => {
                    const now = new Date();
                    const exp = c.expiration_date ? new Date(c.expiration_date) : null;
                    const diffDays = exp ? Math.ceil((exp - now) / (1000 * 60 * 60 * 24)) : 999;
                    const isExpired = diffDays <= 0;
                    const isWarning = diffDays > 0 && diffDays <= 60;

                    return (
                      <tr key={c.id}>
                        <td style={{ fontWeight: '600' }}>
                          {c.staff ? `${c.staff.firstname} ${c.staff.lastname}` : `Staff #${c.staff_id}`}
                        </td>
                        <td>
                          <span style={{ fontWeight: '500' }}>
                            {c.credential_type.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'monospace', fontWeight: '600' }}>
                          {c.credential_number}
                        </td>
                        <td>{c.issuing_jurisdiction || 'FL'}</td>
                        <td>{c.expiration_date || 'No Date'}</td>
                        <td>
                          {isExpired ? (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 8px',
                              borderRadius: '12px',
                              fontSize: '0.7rem',
                              fontWeight: '700',
                              backgroundColor: 'rgba(239, 68, 68, 0.15)',
                              color: '#ef4444',
                              border: '1px solid rgba(239, 68, 68, 0.3)'
                            }}>
                              <AlertCircle size={12} /> EXPIRED
                            </span>
                          ) : isWarning ? (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 8px',
                              borderRadius: '12px',
                              fontSize: '0.7rem',
                              fontWeight: '700',
                              backgroundColor: 'rgba(245, 158, 11, 0.15)',
                              color: '#f59e0b',
                              border: '1px solid rgba(245, 158, 11, 0.3)'
                            }}>
                              <AlertTriangle size={12} /> EXPIRING ({diffDays}d)
                            </span>
                          ) : (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 8px',
                              borderRadius: '12px',
                              fontSize: '0.7rem',
                              fontWeight: '700',
                              backgroundColor: 'rgba(16, 185, 129, 0.15)',
                              color: '#10b981',
                              border: '1px solid rgba(16, 185, 129, 0.3)'
                            }}>
                              <CheckCircle2 size={12} /> ACTIVE
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            className="btn-icon"
                            style={{ color: 'var(--color-red)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                            onClick={() => deleteCredential(c.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : activeTab === 'time_off' ? (
        /* TAB 3: AVAILABILITY & TIME-OFF */
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Tracks vacation, FMLA, sick days, and prevents double-booking nurses on approved leave during surgery scheduling.
            </span>
            <button className="btn-header btn-primary" onClick={() => openAddTimeOffModal()}>
              <Plus size={14} /> Log Staff Leave / Time-Off
            </button>
          </div>

          {timeOffList.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No time-off or blackout requests logged. All staff are currently available for scheduling.
            </div>
          ) : (
            <div className="custom-table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>STAFF MEMBER</th>
                    <th>TYPE</th>
                    <th>START DATE</th>
                    <th>END DATE</th>
                    <th>STATUS</th>
                    <th>REASON / NOTES</th>
                    <th style={{ textAlign: 'center' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {timeOffList.map(t => (
                    <tr key={t.id}>
                      <td style={{ fontWeight: '600' }}>
                        {t.staff ? `${t.staff.firstname} ${t.staff.lastname}` : `Staff #${t.staff_id}`}
                      </td>
                      <td>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '10px',
                          fontSize: '0.72rem',
                          fontWeight: '600',
                          backgroundColor: 'rgba(59, 130, 246, 0.1)',
                          color: 'var(--color-blue)'
                        }}>
                          {t.time_off_type}
                        </span>
                      </td>
                      <td style={{ fontWeight: '500' }}>{t.start_date}</td>
                      <td style={{ fontWeight: '500' }}>{t.end_date}</td>
                      <td>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '10px',
                          fontSize: '0.72rem',
                          fontWeight: '700',
                          backgroundColor: 'rgba(16, 185, 129, 0.15)',
                          color: '#10b981'
                        }}>
                          {t.approval_status || 'Approved'}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t.reason || '-'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="btn-icon"
                          style={{ color: 'var(--color-red)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                          onClick={() => deleteTimeOff(t.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* TAB 4: ANESTHESIA ROSTER */
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Dedicated roster of Physician Anesthesiologists (MD/DO) and Certified Registered Nurse Anesthetists (CRNA).
            </span>
            <button
              className="btn-header btn-primary"
              onClick={() => {
                setEditingStaff(null);
                setFormData({
                  firstname: '',
                  lastname: '',
                  department: 'Anesthesia',
                  role: 'Staff Anesthesiologist',
                  specialty: 'General / Regional Anesthesia',
                  staff_type: 'Physician_Anesthesiologist',
                  credentials: 'MD',
                  employment_type: 'Contract_Agency',
                  license_id: '',
                  phone: '',
                  email: '',
                  hourly_rate: '',
                  monthly_salary: '',
                  benefits: '',
                  facility_id: activeFacility?.id || (facilitiesList[0]?.id || '')
                });
                setIsStaffModalOpen(true);
              }}
            >
              <Plus size={14} /> Add Anesthesia Provider
            </button>
          </div>

          {anesthesiaStaff.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No anesthesia providers registered yet. Click "Add Anesthesia Provider" to add Anesthesiologists or CRNAs.
            </div>
          ) : (
            <div className="custom-table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>PROVIDER NAME</th>
                    <th>PROVIDER TYPE</th>
                    <th>CREDENTIALS</th>
                    <th>ROLE / TITLE</th>
                    <th>LICENSE / ID</th>
                    <th>HOURLY / FLAT RATE</th>
                    <th style={{ textAlign: 'center' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {anesthesiaStaff.map(s => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Activity size={14} style={{ color: 'var(--color-blue)' }} />
                          {s.firstname} {s.lastname}
                        </div>
                      </td>
                      <td>
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '12px',
                          fontSize: '0.72rem',
                          fontWeight: '600',
                          backgroundColor: s.staff_type === 'Physician_Anesthesiologist' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                          color: s.staff_type === 'Physician_Anesthesiologist' ? 'var(--color-blue)' : '#10b981'
                        }}>
                          {s.staff_type ? s.staff_type.replace(/_/g, ' ') : 'Anesthesia Provider'}
                        </span>
                      </td>
                      <td style={{ fontWeight: '600' }}>{formatCredentials(s.credentials, 'MD')}</td>
                      <td>{s.role || 'Staff Anesthesiologist'}</td>
                      <td style={{ fontFamily: 'monospace' }}>{s.license_id || '-'}</td>
                      <td style={{ fontWeight: '500' }}>
                        {s.hourly_rate ? `${formatCurrency(s.hourly_rate)}/hr` : '-'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button
                            className="btn-icon"
                            style={{ color: 'var(--color-blue)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                            onClick={() => openStaffModal(s)}
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            className="btn-icon"
                            style={{ color: 'var(--color-red)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                            onClick={() => deleteStaff(s.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: ADD / EDIT STAFF MEMBER */}
      {isStaffModalOpen && (
        <div className="staff-modal-overlay">
          <div className="staff-modal-content" style={{ maxWidth: '640px' }}>
            <div className="staff-modal-header">
              <h3>{editingStaff ? 'Edit Staff Member' : 'Add Staff Member'}</h3>
              <button className="staff-modal-close" onClick={() => setIsStaffModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="staff-modal-body">
              <div className="staff-form-grid">
                {isSuperAdmin && (
                  <div className="staff-form-group full-width" style={{ padding: '12px 14px', background: 'rgba(59, 130, 246, 0.06)', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)', marginBottom: '4px' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: '700', color: 'var(--color-blue)', display: 'block', marginBottom: '6px' }}>
                      Assign Primary Facility <span style={{ color: '#ef4444' }}>*</span>
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
                  <label>First Name <span style={{ color: '#ef4444' }}>*</span></label>
                  <input type="text" name="firstname" value={formData.firstname} onChange={handleInputChange} placeholder="First Name" required />
                </div>
                <div className="staff-form-group">
                  <label>Last Name <span style={{ color: '#ef4444' }}>*</span></label>
                  <input type="text" name="lastname" value={formData.lastname} onChange={handleInputChange} placeholder="Last Name" required />
                </div>

                <div className="staff-form-group">
                  <label>Department Category</label>
                  <select name="department" value={formData.department} onChange={handleInputChange}>
                    {DEPARTMENT_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div className="staff-form-group">
                  <label>Staff Classification</label>
                  <select name="staff_type" value={formData.staff_type} onChange={handleInputChange}>
                    {STAFF_TYPES.map(st => (
                      <option key={st.value} value={st.value}>{st.label}</option>
                    ))}
                  </select>
                </div>

                <div className="staff-form-group">
                  <label>Clinical Role / Title</label>
                  <input type="text" name="role" value={formData.role} onChange={handleInputChange} placeholder="e.g., Circulating Nurse, Scrub Tech" />
                </div>

                <div className="staff-form-group">
                  <label>Post-Nominal Credentials</label>
                  <input type="text" name="credentials" value={formData.credentials} onChange={handleInputChange} placeholder="e.g., RN, BSN, CNOR, CST, MD" />
                </div>

                <div className="staff-form-group">
                  <label>Employment Type</label>
                  <select name="employment_type" value={formData.employment_type} onChange={handleInputChange}>
                    {EMPLOYMENT_TYPES.map(et => (
                      <option key={et.value} value={et.value}>{et.label}</option>
                    ))}
                  </select>
                </div>

                <div className="staff-form-group">
                  <label>Specialty / Sub-position</label>
                  <input type="text" name="specialty" value={formData.specialty} onChange={handleInputChange} placeholder="e.g., Ortho, Eyes, PACU" />
                </div>

                <div className="staff-form-group">
                  <label>License / Employee ID #</label>
                  <input type="text" name="license_id" value={formData.license_id} onChange={handleInputChange} placeholder="e.g., RN948201 or Badge #" />
                </div>

                <div className="staff-form-group">
                  <label>Phone Number</label>
                  <input type="text" name="phone" value={formData.phone} onChange={handleInputChange} placeholder="(555) 000-0000" />
                </div>

                <div className="staff-form-group full-width">
                  <label>Work Email</label>
                  <input type="email" name="email" value={formData.email} onChange={handleInputChange} placeholder="staff.name@surgerycenter.com" />
                </div>

                <div className="staff-form-group">
                  <label>Hourly Wage Rate ($)</label>
                  <input type="number" step="0.01" name="hourly_rate" value={formData.hourly_rate} onChange={handleInputChange} placeholder="e.g., 45.00" />
                </div>

                <div className="staff-form-group">
                  <label>Monthly Salary ($)</label>
                  <input type="number" step="0.01" name="monthly_salary" value={formData.monthly_salary} onChange={handleInputChange} placeholder="e.g., 6500.00" />
                </div>

                <div className="staff-form-group full-width">
                  <label>Monthly Employer Benefits Cost ($)</label>
                  <input type="number" step="0.01" name="benefits" value={formData.benefits} onChange={handleInputChange} placeholder="Monthly benefits cost" />
                </div>
              </div>
            </div>
            <div className="staff-modal-footer">
              <button className="btn-secondary" onClick={() => setIsStaffModalOpen(false)}>Cancel</button>
              <button className="btn-primary" onClick={saveStaff}>
                Save Staff Member
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD CREDENTIAL */}
      {isCredModalOpen && (
        <div className="staff-modal-overlay">
          <div className="staff-modal-content" style={{ maxWidth: '500px' }}>
            <div className="staff-modal-header">
              <h3>Add Staff Credential / License</h3>
              <button className="staff-modal-close" onClick={() => setIsCredModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="staff-modal-body">
              <div className="staff-form-grid">
                <div className="staff-form-group full-width">
                  <label>Staff Member <span style={{ color: '#ef4444' }}>*</span></label>
                  <select
                    value={credFormData.staff_id}
                    onChange={(e) => setCredFormData({ ...credFormData, staff_id: e.target.value })}
                    required
                  >
                    <option value="">Select Staff Member...</option>
                    {staffList.map(s => (
                      <option key={s.id} value={s.id}>{s.firstname} {s.lastname} ({s.department})</option>
                    ))}
                  </select>
                </div>

                <div className="staff-form-group full-width">
                  <label>Credential Type <span style={{ color: '#ef4444' }}>*</span></label>
                  <select
                    value={credFormData.credential_type}
                    onChange={(e) => setCredFormData({ ...credFormData, credential_type: e.target.value })}
                  >
                    {CREDENTIAL_TYPES.map(ct => (
                      <option key={ct.value} value={ct.value}>{ct.label}</option>
                    ))}
                  </select>
                </div>

                <div className="staff-form-group">
                  <label>License / Certificate # <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    type="text"
                    value={credFormData.credential_number}
                    onChange={(e) => setCredFormData({ ...credFormData, credential_number: e.target.value })}
                    placeholder="e.g., RN9382012"
                    required
                  />
                </div>

                <div className="staff-form-group">
                  <label>Issuing Jurisdiction</label>
                  <input
                    type="text"
                    value={credFormData.issuing_jurisdiction}
                    onChange={(e) => setCredFormData({ ...credFormData, issuing_jurisdiction: e.target.value })}
                    placeholder="FL"
                  />
                </div>

                <div className="staff-form-group full-width">
                  <label>Expiration Date <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    type="date"
                    value={credFormData.expiration_date}
                    onChange={(e) => setCredFormData({ ...credFormData, expiration_date: e.target.value })}
                    required
                  />
                </div>
              </div>
            </div>
            <div className="staff-modal-footer">
              <button className="btn-secondary" onClick={() => setIsCredModalOpen(false)}>Cancel</button>
              <button className="btn-primary" onClick={saveCredential}>Log Credential</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: LOG TIME OFF */}
      {isTimeOffModalOpen && (
        <div className="staff-modal-overlay">
          <div className="staff-modal-content" style={{ maxWidth: '500px' }}>
            <div className="staff-modal-header">
              <h3>Log Staff Time-Off / Leave</h3>
              <button className="staff-modal-close" onClick={() => setIsTimeOffModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="staff-modal-body">
              <div className="staff-form-grid">
                <div className="staff-form-group full-width">
                  <label>Staff Member <span style={{ color: '#ef4444' }}>*</span></label>
                  <select
                    value={timeOffFormData.staff_id}
                    onChange={(e) => setTimeOffFormData({ ...timeOffFormData, staff_id: e.target.value })}
                    required
                  >
                    <option value="">Select Staff Member...</option>
                    {staffList.map(s => (
                      <option key={s.id} value={s.id}>{s.firstname} {s.lastname} ({s.department})</option>
                    ))}
                  </select>
                </div>

                <div className="staff-form-group full-width">
                  <label>Leave Type</label>
                  <select
                    value={timeOffFormData.time_off_type}
                    onChange={(e) => setTimeOffFormData({ ...timeOffFormData, time_off_type: e.target.value })}
                  >
                    <option value="Vacation">Vacation / PTO</option>
                    <option value="Sick">Sick Leave</option>
                    <option value="FMLA">FMLA / Medical Leave</option>
                    <option value="Bereavement">Bereavement</option>
                    <option value="CME">CME / Educational</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="staff-form-group">
                  <label>Start Date <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    type="date"
                    value={timeOffFormData.start_date}
                    onChange={(e) => setTimeOffFormData({ ...timeOffFormData, start_date: e.target.value })}
                    required
                  />
                </div>

                <div className="staff-form-group">
                  <label>End Date <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    type="date"
                    value={timeOffFormData.end_date}
                    onChange={(e) => setTimeOffFormData({ ...timeOffFormData, end_date: e.target.value })}
                    required
                  />
                </div>

                <div className="staff-form-group full-width">
                  <label>Reason / Notes</label>
                  <textarea
                    rows={2}
                    value={timeOffFormData.reason}
                    onChange={(e) => setTimeOffFormData({ ...timeOffFormData, reason: e.target.value })}
                    placeholder="Optional coverage notes or reason..."
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>
            </div>
            <div className="staff-modal-footer">
              <button className="btn-secondary" onClick={() => setIsTimeOffModalOpen(false)}>Cancel</button>
              <button className="btn-primary" onClick={saveTimeOff}>Record Leave</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffManagement;
