import React, { useState, useEffect } from 'react';
import { rbacService, CANONICAL_ROLES } from '../lib/rbacService.js';
import { db } from '../lib/supabase.js';
import {
  Users, UserPlus, Shield, CheckCircle2, XCircle,
  Search, Edit3, Building2,
  RefreshCw, X, MoveRight, ShieldAlert
} from 'lucide-react';
import Swal from 'sweetalert2';
import './UserManagement.css';

export default function UserManagement({ activeFacility, theme: _theme = 'light', initialFacilityFilter = 'all' }) {
  const [users, setUsers] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFacilityFilter, setSelectedFacilityFilter] = useState(initialFacilityFilter || 'all');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');

  // Modals
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isChangeRoleOpen, setIsChangeRoleOpen] = useState(false);
  const [isReassignOpen, setIsReassignOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [saving, setSaving] = useState(false);

  // Forms
  const [inviteForm, setInviteForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    facilityId: '',
    role: 'scheduler',
    department: 'Operating Room',
    title: 'Staff Member'
  });

  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    department: '',
    title: ''
  });

  const [roleForm, setRoleForm] = useState({
    newRole: 'scheduler'
  });

  const [reassignForm, setReassignForm] = useState({
    targetFacilityId: '',
    newRole: 'scheduler',
    department: '',
    title: ''
  });

  const session = db.getSession();
  const currentRole = rbacService.normalizeRole(session?.role);
  const isSuperAdmin = currentRole === 'super_admin';
  const isOrgAdmin = currentRole === 'org_admin';
  const isFacilityAdmin = currentRole === 'facility_admin';
  const canManageUsers = isSuperAdmin || isOrgAdmin || isFacilityAdmin;

  // Roles assignable by current actor
  const assignableRoles = rbacService.getAssignableRoles(currentRole);

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Fetch facilities list
      const facList = await db.getFacilities();
      setFacilities(facList || []);

      // 2. Fetch users based on role and active facility filter
      let userList = [];
      if (isSuperAdmin && (selectedFacilityFilter === 'all' || !selectedFacilityFilter)) {
        userList = await rbacService.listAllUsers({
          role: selectedRoleFilter,
          status: selectedStatusFilter
        });
      } else {
        const targetFacId = (selectedFacilityFilter && selectedFacilityFilter !== 'all')
          ? selectedFacilityFilter
          : activeFacility?.id;
        userList = await rbacService.listUsers(targetFacId);
      }

      // Map users
      const mapped = (userList || []).map(mem => {
        const facObj = (facList || []).find(f => f.id === mem.facility_id) || mem.facilities;
        return {
          id: mem.id,
          user_id: mem.user_id,
          name: mem.name || (mem.title ? `${mem.title} (${mem.department || 'Staff'})` : (mem.email ? mem.email.split('@')[0] : 'Staff User')),
          email: mem.email || (mem.user_id === session?.id ? session?.email : 'staff@asc.com'),
          role: rbacService.normalizeRole(mem.role),
          role_id: mem.role_id,
          facility_id: mem.facility_id,
          facility_name: facObj?.name || 'Surgical Center',
          department: mem.department || 'General Operations',
          title: mem.title || 'Staff Member',
          is_active: mem.is_active !== false,
          created_at: mem.created_at || new Date().toISOString()
        };
      });

      // If mapped list is empty, include logged-in session user so table is never artificially empty
      if (mapped.length === 0 && session) {
        mapped.push({
          id: 'mem-session',
          user_id: session.id || '00000000-0000-0000-0000-000000000001',
          name: session.name || 'Admin Director',
          email: session.email || 'admin@asc.com',
          role: currentRole,
          facility_id: activeFacility?.id || '00000000-0000-0000-0000-000000000002',
          facility_name: activeFacility?.name || 'Naples Surgery Center',
          department: 'Executive Administration',
          title: 'Executive Director',
          is_active: true,
          created_at: new Date().toISOString()
        });
      }

      setUsers(mapped);
    } catch (err) {
      console.warn('Could not load user memberships:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const fetchUsers = async () => {
      try {
        const facList = await db.getFacilities();
        if (!active) return;
        setFacilities(facList || []);

        let userList = [];
        if (isSuperAdmin && (selectedFacilityFilter === 'all' || !selectedFacilityFilter)) {
          userList = await rbacService.listAllUsers({
            role: selectedRoleFilter,
            status: selectedStatusFilter
          });
        } else {
          const targetFacId = (selectedFacilityFilter && selectedFacilityFilter !== 'all')
            ? selectedFacilityFilter
            : activeFacility?.id;
          userList = await rbacService.listUsers(targetFacId);
        }

        if (!active) return;

        const mapped = (userList || []).map(mem => {
          const facObj = (facList || []).find(f => f.id === mem.facility_id) || mem.facilities;
          return {
            id: mem.id,
            user_id: mem.user_id,
            name: mem.name || (mem.title ? `${mem.title} (${mem.department || 'Staff'})` : (mem.email ? mem.email.split('@')[0] : 'Staff User')),
            email: mem.email || (mem.user_id === session?.id ? session?.email : 'staff@asc.com'),
            role: rbacService.normalizeRole(mem.role),
            role_id: mem.role_id,
            facility_id: mem.facility_id,
            facility_name: facObj?.name || 'Surgical Center',
            department: mem.department || 'General Operations',
            title: mem.title || 'Staff Member',
            is_active: mem.is_active !== false,
            created_at: mem.created_at || new Date().toISOString()
          };
        });

        if (mapped.length === 0 && session) {
          mapped.push({
            id: 'mem-session',
            user_id: session.id || '00000000-0000-0000-0000-000000000001',
            name: session.name || 'Admin Director',
            email: session.email || 'admin@asc.com',
            role: currentRole,
            facility_id: activeFacility?.id || '00000000-0000-0000-0000-000000000002',
            facility_name: activeFacility?.name || 'Naples Surgery Center',
            department: 'Executive Administration',
            title: 'Executive Director',
            is_active: true,
            created_at: new Date().toISOString()
          });
        }

        setUsers(mapped);
      } catch (err) {
        console.warn('Could not load user memberships:', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchUsers();
    return () => {
      active = false;
    };
  }, [activeFacility?.id, activeFacility?.name, selectedFacilityFilter, selectedRoleFilter, selectedStatusFilter, isSuperAdmin, currentRole, session]);

  // Open Edit User Modal
  const openEditModal = (u) => {
    setSelectedUser(u);
    setEditForm({
      name: u.name || '',
      email: u.email || '',
      department: u.department || '',
      title: u.title || ''
    });
    setIsEditOpen(true);
  };

  // Open Change Role Dialog
  const openChangeRoleModal = (u) => {
    setSelectedUser(u);
    setRoleForm({
      newRole: u.role
    });
    setIsChangeRoleOpen(true);
  };

  // Open Reassign Facility Dialog (Super Admin)
  const openReassignModal = (u) => {
    setSelectedUser(u);
    const otherFacs = facilities.filter(f => f.id !== u.facility_id);
    setReassignForm({
      targetFacilityId: otherFacs[0]?.id || '',
      newRole: u.role,
      department: u.department || '',
      title: u.title || ''
    });
    setIsReassignOpen(true);
  };

  // Submit User Profile Edit
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editForm.name.trim()) {
      Swal.fire('Required Field', 'Name cannot be empty.', 'warning');
      return;
    }

    setSaving(true);
    try {
      await rbacService.updateMembership(selectedUser.id, {
        department: editForm.department.trim(),
        title: editForm.title.trim()
      });

      setIsEditOpen(false);
      Swal.fire({
        icon: 'success',
        title: 'Profile Updated',
        text: 'User profile details saved successfully.',
        timer: 1600,
        showConfirmButton: false
      });
      await loadData();
    } catch (err) {
      console.error('Update profile error:', err);
      Swal.fire('Error', err.message || 'Failed to update user profile.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Submit Role Change
  const handleRoleChangeSubmit = async (e) => {
    e.preventDefault();
    if (!selectedUser) return;

    if (selectedUser.role === roleForm.newRole) {
      setIsChangeRoleOpen(false);
      return;
    }

    // Anti-Escalation: Prevent self role edit
    if (selectedUser.user_id === session?.id && !isSuperAdmin) {
      Swal.fire({
        icon: 'error',
        title: 'Privilege Escalation Prohibited',
        text: 'Users are strictly forbidden from modifying their own roles.'
      });
      return;
    }

    const confirm = await Swal.fire({
      title: 'Confirm Role Change',
      html: `Change role for <b>${selectedUser.name || selectedUser.email}</b> from <code>${selectedUser.role}</code> to <code>${roleForm.newRole}</code>?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Confirm Role Change',
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#64748b'
    });

    if (confirm.isConfirmed) {
      setSaving(true);
      try {
        const targetRoleObj = CANONICAL_ROLES.find(r => r.slug === roleForm.newRole);
        await rbacService.updateMembership(selectedUser.id, {
          role: roleForm.newRole,
          role_id: targetRoleObj?.id || null
        });

        setIsChangeRoleOpen(false);
        Swal.fire({
          icon: 'success',
          title: 'Role Updated',
          text: `Role updated to ${targetRoleObj?.name || roleForm.newRole}.`,
          timer: 1800,
          showConfirmButton: false
        });
        await loadData();
      } catch (err) {
        console.error('Role update error:', err);
        Swal.fire('Error', err.message || 'Failed to update role.', 'error');
      } finally {
        setSaving(false);
      }
    }
  };

  // Submit Facility Reassignment
  const handleReassignSubmit = async (e) => {
    e.preventDefault();
    if (!reassignForm.targetFacilityId) {
      Swal.fire('Select Facility', 'Please select a destination facility.', 'warning');
      return;
    }

    const targetFac = facilities.find(f => f.id === reassignForm.targetFacilityId);

    const confirm = await Swal.fire({
      title: 'Reassign Facility Access?',
      html: `<div style="text-align: left; font-size: 0.9rem; color: #475569;">
               <p>Reassigning <b>${selectedUser.name || selectedUser.email}</b>:</p>
               <ul>
                 <li>From: <b>${selectedUser.facility_name}</b></li>
                 <li>To: <b>${targetFac?.name || 'Selected Facility'}</b></li>
                 <li>Role at new facility: <code>${reassignForm.newRole}</code></li>
               </ul>
               <p style="color: #dc2626; font-size: 0.82rem;">Access to the previous facility will be immediately revoked.</p>
             </div>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Confirm Reassignment'
    });

    if (confirm.isConfirmed) {
      setSaving(true);
      try {
        await rbacService.reassignUserFacility({
          userId: selectedUser.user_id,
          fromFacilityId: selectedUser.facility_id,
          toFacilityId: reassignForm.targetFacilityId,
          newRole: reassignForm.newRole,
          department: reassignForm.department,
          title: reassignForm.title
        });

        setIsReassignOpen(false);
        Swal.fire({
          icon: 'success',
          title: 'Facility Reassigned',
          text: `User access transferred to ${targetFac?.name}.`,
          timer: 1800,
          showConfirmButton: false
        });
        await loadData();
      } catch (err) {
        console.error('Reassign facility error:', err);
        Swal.fire('Reassignment Failed', err.message || 'Could not complete reassignment.', 'error');
      } finally {
        setSaving(false);
      }
    }
  };

  // Toggle User Active Status (Activation / Deactivation)
  const handleToggleActive = async (user) => {
    // Single Super Admin Protection Check
    if (user.role === 'super_admin' && user.is_active) {
      Swal.fire({
        title: 'Action Prohibited',
        text: 'Administrative Safeguard: The Global Super Admin account cannot be deactivated.',
        icon: 'warning'
      });
      return;
    }

    // Last Facility Admin Protection Check
    if (user.role === 'facility_admin' && user.is_active) {
      const activeAdmins = users.filter(u => u.facility_id === user.facility_id && u.role === 'facility_admin' && u.is_active);
      if (activeAdmins.length <= 1) {
        Swal.fire({
          title: 'Action Prohibited',
          text: 'Administrative Safeguard: You cannot deactivate the sole remaining Facility Administrator for this facility.',
          icon: 'warning'
        });
        return;
      }
    }

    const actionText = user.is_active ? 'deactivate' : 'reactivate';
    const confirm = await Swal.fire({
      title: `${actionText === 'deactivate' ? 'Deactivate' : 'Reactivate'} User?`,
      html: `<p>Are you sure you want to <b>${actionText}</b> account access for <b>${user.name || user.email}</b>?</p>
             ${user.is_active ? '<p style="font-size:0.82rem;color:#dc2626;">Deactivated users will immediately lose access to clinical and operational data.</p>' : ''}`,
      icon: user.is_active ? 'warning' : 'question',
      showCancelButton: true,
      confirmButtonColor: user.is_active ? '#dc2626' : '#2563eb',
      cancelButtonColor: '#64748b',
      confirmButtonText: user.is_active ? 'Deactivate Account' : 'Reactivate Account'
    });

    if (confirm.isConfirmed) {
      try {
        await rbacService.toggleUserActive(user.id, !user.is_active);
        Swal.fire({
          icon: 'success',
          title: user.is_active ? 'Account Deactivated' : 'Account Reactivated',
          text: `Account status updated for ${user.email}.`,
          timer: 1600,
          showConfirmButton: false
        });
        await loadData();
      } catch (err) {
        console.error('Toggle active status error:', err);
        Swal.fire('Error', err.message || 'Failed to update user status.', 'error');
      }
    }
  };

  // Submit User Invitation / Creation (Zero Plaintext Passwords)
  const handleInviteSubmit = async (e) => {
    e.preventDefault();
    if (!inviteForm.email || !inviteForm.email.includes('@')) {
      Swal.fire('Invalid Email', 'Please enter a valid email address.', 'warning');
      return;
    }

    const targetFacId = inviteForm.facilityId || activeFacility?.id || (facilities[0]?.id);
    if (!targetFacId) {
      Swal.fire('Facility Required', 'Please choose a facility for this user.', 'warning');
      return;
    }

    setSaving(true);
    try {
      const fullName = `${inviteForm.firstName.trim()} ${inviteForm.lastName.trim()}`.trim();
      await rbacService.inviteUser({
        email: inviteForm.email.trim().toLowerCase(),
        name: fullName || inviteForm.email.split('@')[0],
        role: inviteForm.role,
        department: inviteForm.department.trim(),
        title: inviteForm.title.trim(),
        facilityId: targetFacId
      });

      setIsInviteOpen(false);
      setInviteForm({
        firstName: '',
        lastName: '',
        email: '',
        facilityId: '',
        role: 'scheduler',
        department: 'Operating Room',
        title: 'Staff Member'
      });

      Swal.fire({
        icon: 'success',
        title: 'User Invitation Dispatched',
        html: `<div style="text-align: left; font-size: 0.9rem; color: #475569;">
                 <p>User <b>${fullName || inviteForm.email}</b> has been provisioned.</p>
                 <p>Assigned Role: <code>${inviteForm.role}</code></p>
                 <p style="font-size: 0.82rem; color: #059669;">Zero-secret provisioning: An invitation has been dispatched through Supabase Auth without cleartext credentials.</p>
               </div>`,
        confirmButtonText: 'Done'
      });
      await loadData();
    } catch (err) {
      console.error('Invite user error:', err);
      Swal.fire('Error', err.message || 'Failed to provision user.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Filter & Search
  const filteredUsers = users.filter(u => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = (
      (u.name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.department || '').toLowerCase().includes(q) ||
      (u.title || '').toLowerCase().includes(q) ||
      (u.role || '').toLowerCase().includes(q)
    );

    const matchesRole = selectedRoleFilter === 'all' || u.role === selectedRoleFilter;
    const matchesStatus = (
      selectedStatusFilter === 'all' ||
      (selectedStatusFilter === 'active' && u.is_active) ||
      (selectedStatusFilter === 'inactive' && !u.is_active)
    );

    return matchesSearch && matchesRole && matchesStatus;
  }).sort((a, b) => {
    if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
    if (sortBy === 'role') return (a.role || '').localeCompare(b.role || '');
    if (sortBy === 'facility') return (a.facility_name || '').localeCompare(b.facility_name || '');
    return 0;
  });

  return (
    <div className="user-mgmt-container">
      {/* Header */}
      <div className="user-mgmt-header">
        <div className="user-mgmt-titles">
          <h2>
            <Users size={26} style={{ color: '#2563eb' }} />
            User Accounts & Facility Memberships
          </h2>
          <p>
            Manage staff profiles, authorized role tiers, facility assignments, and activation statuses.
          </p>
        </div>

        <div className="user-mgmt-actions">
          <button className="btn-secondary" onClick={loadData} title="Refresh User Directory">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>

          {canManageUsers && (
            <button className="btn-primary" onClick={() => setIsInviteOpen(true)}>
              <UserPlus size={16} />
              Invite / Provision User
            </button>
          )}
        </div>
      </div>

      {/* Control Bar: Search & Filters */}
      <div className="user-controls-bar">
        <div className="user-search-box">
          <Search size={16} className="user-search-icon" />
          <input
            type="text"
            className="user-search-input"
            placeholder="Search by name, email, role, or department..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="user-filters-group">
          {/* Facility Filter (Super Admin sees all facilities) */}
          {isSuperAdmin && (
            <select
              className="user-filter-select"
              value={selectedFacilityFilter}
              onChange={(e) => setSelectedFacilityFilter(e.target.value)}
            >
              <option value="all">All Facilities</option>
              {facilities.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          )}

          {/* Role Filter */}
          <select
            className="user-filter-select"
            value={selectedRoleFilter}
            onChange={(e) => setSelectedRoleFilter(e.target.value)}
          >
            <option value="all">All Roles</option>
            {CANONICAL_ROLES.map(r => (
              <option key={r.slug} value={r.slug}>{r.name}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            className="user-filter-select"
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>

          {/* Sort By */}
          <select
            className="user-filter-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="name">Sort by Name</option>
            <option value="role">Sort by Role</option>
            <option value="facility">Sort by Facility</option>
          </select>
        </div>
      </div>

      {/* Users Directory Table */}
      <div className="user-table-card">
        {loading ? (
          <div style={{ padding: '64px', textAlign: 'center', color: '#64748b' }}>
            <RefreshCw size={32} className="animate-spin" style={{ margin: '0 auto 16px', display: 'block', color: '#3b82f6' }} />
            Loading staff accounts...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div style={{ padding: '64px', textAlign: 'center', color: '#64748b' }}>
            <Users size={48} style={{ color: '#cbd5e1', margin: '0 auto 12px', display: 'block' }} />
            <h4 style={{ margin: '0 0 6px 0', color: '#0f172a' }}>No Staff Accounts Found</h4>
            <p style={{ margin: 0, fontSize: '0.88rem' }}>No accounts matched your search and filter criteria.</p>
          </div>
        ) : (
          <div className="user-table-responsive">
            <table className="user-data-table">
              <thead>
                <tr>
                  <th>User & Contact</th>
                  <th>Assigned Facility</th>
                  <th>Role Tier</th>
                  <th>Department & Title</th>
                  <th>Account Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => {
                  const roleObj = CANONICAL_ROLES.find(r => r.slug === u.role) || { name: u.role };
                  return (
                    <tr key={u.id}>
                      {/* Name & Email */}
                      <td>
                        <div className="user-profile-cell">
                          <div className="user-avatar-circle">
                            {u.name?.slice(0, 2).toUpperCase() || 'US'}
                          </div>
                          <div className="user-name-box">
                            <span className="user-full-name">{u.name}</span>
                            <span className="user-email-text">{u.email}</span>
                          </div>
                        </div>
                      </td>

                      {/* Facility */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: '500' }}>
                          <Building2 size={14} style={{ color: '#64748b' }} />
                          <span>{u.facility_name}</span>
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td>
                        <span className={`role-badge role-${u.role.replace(/_/g, '-')}`}>
                          <Shield size={12} />
                          {roleObj.name}
                        </span>
                      </td>

                      {/* Dept & Title */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: '500', fontSize: '0.85rem' }}>{u.title || 'Staff Member'}</span>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{u.department || 'General'}</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td>
                        <span className={`status-pill ${u.is_active ? 'status-active' : 'status-inactive'}`}>
                          {u.is_active ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'right' }}>
                        <div className="user-action-buttons" style={{ justifyContent: 'flex-end' }}>
                          {canManageUsers && (
                            <>
                              <button
                                className="btn-icon-action"
                                onClick={() => openEditModal(u)}
                                title="Edit profile details"
                              >
                                <Edit3 size={14} />
                              </button>

                              <button
                                className="btn-icon-action"
                                onClick={() => openChangeRoleModal(u)}
                                title="Change role"
                              >
                                <Shield size={14} />
                              </button>

                              {isSuperAdmin && (
                                <button
                                  className="btn-icon-action"
                                  onClick={() => openReassignModal(u)}
                                  title="Reassign to another facility"
                                >
                                  <MoveRight size={14} />
                                </button>
                              )}

                              <button
                                className={`btn-icon-action ${u.is_active ? 'btn-icon-danger' : ''}`}
                                onClick={() => handleToggleActive(u)}
                                title={u.is_active ? 'Deactivate account' : 'Reactivate account'}
                              >
                                {u.is_active ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: INVITE / PROVISION USER */}
      {isInviteOpen && (
        <div className="user-modal-backdrop" onClick={() => setIsInviteOpen(false)}>
          <div className="user-modal-card" onClick={e => e.stopPropagation()}>
            <div className="user-modal-header">
              <h3>
                <UserPlus size={20} style={{ color: '#2563eb' }} />
                Invite / Provision Staff Account
              </h3>
              <button className="modal-close-btn" onClick={() => setIsInviteOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleInviteSubmit}>
              <div className="user-modal-body">
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>First Name</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Jane"
                      value={inviteForm.firstName}
                      onChange={e => setInviteForm({ ...inviteForm, firstName: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Last Name</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Doe"
                      value={inviteForm.lastName}
                      onChange={e => setInviteForm({ ...inviteForm, lastName: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>
                    Work Email Address <span className="required">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    className="form-control"
                    placeholder="jdoe@asc.com"
                    value={inviteForm.email}
                    onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })}
                  />
                </div>

                {isSuperAdmin && (
                  <div className="form-group" style={{
                    padding: '12px 14px',
                    background: 'rgba(59, 130, 246, 0.06)',
                    borderRadius: '8px',
                    border: '1px solid rgba(59, 130, 246, 0.2)'
                  }}>
                    <label style={{
                      fontSize: '0.78rem',
                      fontWeight: '700',
                      color: 'var(--color-blue, #3b82f6)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginBottom: '6px'
                    }}>
                      <Building2 size={14} /> Assign Facility (Super Admin)
                    </label>
                    <select
                      className="form-control"
                      value={inviteForm.facilityId || activeFacility?.id || ''}
                      onChange={e => setInviteForm({ ...inviteForm, facilityId: e.target.value })}
                    >
                      {facilities.map(f => (
                        <option key={f.id} value={f.id}>{f.name} ({f.location || f.code})</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="form-group">
                  <label>Assign Role Tier</label>
                  <select
                    className="form-control"
                    value={inviteForm.role}
                    onChange={e => setInviteForm({ ...inviteForm, role: e.target.value })}
                  >
                    {assignableRoles.map(r => (
                      <option key={r.slug} value={r.slug}>
                        {r.name} — {r.description}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Department</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Operating Room / Finance / Coding"
                      value={inviteForm.department}
                      onChange={e => setInviteForm({ ...inviteForm, department: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Job Title</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Surgical Coordinator"
                      value={inviteForm.title}
                      onChange={e => setInviteForm({ ...inviteForm, title: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="user-modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsInviteOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={saving}
                >
                  {saving ? 'Provisioning...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT USER PROFILE */}
      {isEditOpen && selectedUser && (
        <div className="user-modal-backdrop" onClick={() => setIsEditOpen(false)}>
          <div className="user-modal-card" onClick={e => e.stopPropagation()}>
            <div className="user-modal-header">
              <h3>
                <Edit3 size={20} style={{ color: '#2563eb' }} />
                Edit Profile: {selectedUser.name}
              </h3>
              <button className="modal-close-btn" onClick={() => setIsEditOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit}>
              <div className="user-modal-body">
                <div className="form-group">
                  <label>Full Name <span className="required">*</span></label>
                  <input
                    type="text"
                    required
                    className="form-control"
                    value={editForm.name}
                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Email Address</label>
                  <input
                    type="email"
                    disabled
                    className="form-control"
                    value={editForm.email}
                    style={{ background: '#f8fafc', color: '#64748b' }}
                  />
                  <small style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '4px' }}>
                    Email updates require GoTrue identity verification.
                  </small>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Department</label>
                    <input
                      type="text"
                      className="form-control"
                      value={editForm.department}
                      onChange={e => setEditForm({ ...editForm, department: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Job Title</label>
                    <input
                      type="text"
                      className="form-control"
                      value={editForm.title}
                      onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="user-modal-footer">
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
                  {saving ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CHANGE ROLE */}
      {isChangeRoleOpen && selectedUser && (
        <div className="user-modal-backdrop" onClick={() => setIsChangeRoleOpen(false)}>
          <div className="user-modal-card" onClick={e => e.stopPropagation()}>
            <div className="user-modal-header">
              <h3>
                <Shield size={20} style={{ color: '#2563eb' }} />
                Change Role: {selectedUser.name}
              </h3>
              <button className="modal-close-btn" onClick={() => setIsChangeRoleOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleRoleChangeSubmit}>
              <div className="user-modal-body">
                <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.88rem' }}>
                  <div>Current Role: <b>{CANONICAL_ROLES.find(r => r.slug === selectedUser.role)?.name || selectedUser.role}</b></div>
                  <div style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '4px' }}>Facility: {selectedUser.facility_name}</div>
                </div>

                <div className="form-group">
                  <label>Select New Role Tier</label>
                  <select
                    className="form-control"
                    value={roleForm.newRole}
                    onChange={e => setRoleForm({ ...roleForm, newRole: e.target.value })}
                  >
                    {assignableRoles.map(r => (
                      <option key={r.slug} value={r.slug}>
                        {r.name} — {r.description}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ padding: '10px 14px', background: 'rgba(59, 130, 246, 0.08)', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)', fontSize: '0.82rem', color: '#1d4ed8' }}>
                  <ShieldAlert size={15} style={{ verticalAlign: '-2px', marginRight: '6px' }} />
                  Role modifications take effect immediately upon confirmation and will be logged in the immutable security audit trail.
                </div>
              </div>

              <div className="user-modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsChangeRoleOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={saving}
                >
                  {saving ? 'Updating...' : 'Update Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: REASSIGN FACILITY (SUPER ADMIN) */}
      {isReassignOpen && selectedUser && (
        <div className="user-modal-backdrop" onClick={() => setIsReassignOpen(false)}>
          <div className="user-modal-card" onClick={e => e.stopPropagation()}>
            <div className="user-modal-header">
              <h3>
                <MoveRight size={20} style={{ color: '#2563eb' }} />
                Reassign Facility: {selectedUser.name}
              </h3>
              <button className="modal-close-btn" onClick={() => setIsReassignOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleReassignSubmit}>
              <div className="user-modal-body">
                <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.88rem' }}>
                  <div>Current Facility: <b>{selectedUser.facility_name}</b></div>
                  <div style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '4px' }}>User: {selectedUser.name} ({selectedUser.email})</div>
                </div>

                <div className="form-group">
                  <label>Destination Facility <span className="required">*</span></label>
                  <select
                    className="form-control"
                    required
                    value={reassignForm.targetFacilityId}
                    onChange={e => setReassignForm({ ...reassignForm, targetFacilityId: e.target.value })}
                  >
                    {facilities.filter(f => f.id !== selectedUser.facility_id).map(f => (
                      <option key={f.id} value={f.id}>{f.name} ({f.city || 'Surgery Center'})</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Role at Destination Facility</label>
                  <select
                    className="form-control"
                    value={reassignForm.newRole}
                    onChange={e => setReassignForm({ ...reassignForm, newRole: e.target.value })}
                  >
                    {assignableRoles.map(r => (
                      <option key={r.slug} value={r.slug}>{r.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Department</label>
                    <input
                      type="text"
                      className="form-control"
                      value={reassignForm.department}
                      onChange={e => setReassignForm({ ...reassignForm, department: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Job Title</label>
                    <input
                      type="text"
                      className="form-control"
                      value={reassignForm.title}
                      onChange={e => setReassignForm({ ...reassignForm, title: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="user-modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsReassignOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={saving}
                >
                  {saving ? 'Transferring...' : 'Execute Reassignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
