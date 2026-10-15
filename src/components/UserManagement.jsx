import React, { useState, useEffect } from 'react';
import { rbacService, CANONICAL_ROLES } from '../lib/rbacService.js';
import { db } from '../lib/supabase.js';
import { 
  Users, UserPlus, Shield, CheckCircle2, XCircle, 
  Search, Filter, Edit3, UserX, AlertTriangle, Building2, Mail
} from 'lucide-react';
import Swal from 'sweetalert2';

export default function UserManagement({ activeFacility, theme = 'light' }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('all');
  
  // Modals
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedMembership, setSelectedMembership] = useState(null);

  // Invite Form
  const [inviteForm, setInviteForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    department: 'Operating Room',
    title: 'Staff Member',
    role: 'scheduler'
  });

  const session = db.getSession();
  const currentRole = rbacService.normalizeRole(session?.role);
  const isSuperOrOrgAdmin = ['super_admin', 'org_admin'].includes(currentRole);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const list = await rbacService.listUsers(activeFacility?.id);
      if (list && list.length > 0) {
        setUsers(list);
      } else {
        // Seed default preview users for the active facility if none exist yet
        setUsers([
          {
            id: 'mem-admin-01',
            user_id: session?.id || 'usr-admin-01',
            name: session?.name || 'ASC Administrator',
            email: session?.email || 'admin@asc.com',
            role: 'facility_admin',
            department: 'Administration',
            title: 'Executive Director',
            is_active: true,
            created_at: new Date().toISOString()
          },
          {
            id: 'mem-surg-01',
            user_id: 'usr-surg-01',
            name: 'Dr. Robert Chen',
            email: 'chen.surgery@asc.com',
            role: 'surgeon',
            department: 'Orthopedic Surgery',
            title: 'Attending Surgeon',
            is_active: true,
            created_at: new Date(Date.now() - 86400000 * 30).toISOString()
          },
          {
            id: 'mem-sched-01',
            user_id: 'usr-sched-01',
            name: 'Sarah Jenkins',
            email: 'sjenkins@asc.com',
            role: 'scheduler',
            department: 'OR Scheduling',
            title: 'Lead OR Coordinator',
            is_active: true,
            created_at: new Date(Date.now() - 86400000 * 14).toISOString()
          },
          {
            id: 'mem-bill-01',
            user_id: 'usr-bill-01',
            name: 'Michael Torres',
            email: 'mtorres@asc.com',
            role: 'biller',
            department: 'Revenue Cycle',
            title: 'Senior Billing Specialist',
            is_active: true,
            created_at: new Date(Date.now() - 86400000 * 7).toISOString()
          }
        ]);
      }
    } catch (err) {
      console.warn('Could not load user memberships:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [activeFacility]);

  const handleInviteSubmit = async (e) => {
    e.preventDefault();
    if (!inviteForm.email || !inviteForm.email.includes('@')) {
      Swal.fire('Invalid Email', 'Please enter a valid email address.', 'error');
      return;
    }

    try {
      const newMem = {
        id: `mem-${Date.now()}`,
        user_id: `usr-${Date.now()}`,
        name: `${inviteForm.firstName.trim()} ${inviteForm.lastName.trim()}`.trim() || inviteForm.email.split('@')[0],
        email: inviteForm.email.trim().toLowerCase(),
        role: inviteForm.role,
        department: inviteForm.department,
        title: inviteForm.title,
        is_active: true,
        created_at: new Date().toISOString()
      };

      await rbacService.inviteUser({
        email: inviteForm.email,
        name: newMem.name,
        role: inviteForm.role,
        department: inviteForm.department,
        title: inviteForm.title,
        facilityId: activeFacility?.id
      }).catch(() => {});

      setUsers(prev => [newMem, ...prev]);
      setIsInviteOpen(false);
      setInviteForm({
        firstName: '',
        lastName: '',
        email: '',
        department: 'Operating Room',
        title: 'Staff Member',
        role: 'scheduler'
      });

      Swal.fire({
        title: 'User Provisioned',
        text: `Invitation successfully created for ${newMem.email} as ${newMem.role}.`,
        icon: 'success',
        timer: 2000,
        showConfirmButton: false
      });
    } catch (err) {
      Swal.fire('Error', err.message || 'Failed to invite user.', 'error');
    }
  };

  const handleToggleActive = async (user) => {
    // Last Admin Protection Check
    if (user.role === 'facility_admin' && user.is_active) {
      const activeAdmins = users.filter(u => u.role === 'facility_admin' && u.is_active);
      if (activeAdmins.length <= 1) {
        Swal.fire({
          title: 'Action Prohibited',
          text: 'Administrative Safeguard: You cannot deactivate the sole remaining Facility Administrator for this facility.',
          icon: 'warning',
          background: 'var(--bg-card)',
          color: 'var(--text-primary)'
        });
        return;
      }
    }

    const actionText = user.is_active ? 'deactivate' : 'reactivate';
    const confirm = await Swal.fire({
      title: `${actionText === 'deactivate' ? 'Deactivate' : 'Reactivate'} User?`,
      text: `Are you sure you want to ${actionText} access for ${user.email}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: `Yes, ${actionText}`,
      confirmButtonColor: user.is_active ? '#ef4444' : '#10b981',
      background: 'var(--bg-card)',
      color: 'var(--text-primary)'
    });

    if (confirm.isConfirmed) {
      try {
        await rbacService.updateMembership(user.id, { is_active: !user.is_active }).catch(() => {});
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: !u.is_active } : u));
        Swal.fire('Updated', `User account status has been changed.`, 'success');
      } catch (err) {
        Swal.fire('Error', err.message || 'Failed to update user status.', 'error');
      }
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = 
      (u.name && u.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (u.email && u.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (u.department && u.department.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesRole = selectedRoleFilter === 'all' || rbacService.normalizeRole(u.role) === selectedRoleFilter;
    return matchesSearch && matchesRole;
  });

  const getRoleBadgeColor = (roleStr) => {
    const r = rbacService.normalizeRole(roleStr);
    switch (r) {
      case 'super_admin':
      case 'org_admin': return { bg: 'rgba(168, 85, 247, 0.15)', text: '#a855f7', border: 'rgba(168, 85, 247, 0.3)' };
      case 'facility_admin': return { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)' };
      case 'cfo': return { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', border: 'rgba(16, 185, 129, 0.3)' };
      case 'clinical_manager': return { bg: 'rgba(14, 165, 233, 0.15)', text: '#0ea5e9', border: 'rgba(14, 165, 233, 0.3)' };
      case 'scheduler': return { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b', border: 'rgba(245, 158, 11, 0.3)' };
      case 'biller':
      case 'coder': return { bg: 'rgba(234, 88, 12, 0.15)', text: '#ea580c', border: 'rgba(234, 88, 12, 0.3)' };
      case 'surgeon': return { bg: 'rgba(99, 102, 241, 0.15)', text: '#6366f1', border: 'rgba(99, 102, 241, 0.3)' };
      default: return { bg: 'rgba(100, 116, 139, 0.15)', text: '#64748b', border: 'rgba(100, 116, 139, 0.3)' };
    }
  };

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        backgroundColor: 'var(--bg-card)',
        padding: '20px 24px',
        borderRadius: '16px',
        border: '1px solid var(--border-color)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            backgroundColor: 'rgba(59, 130, 246, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-blue, #3b82f6)'
          }}>
            <Users size={24} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>
              User Accounts & Facility Memberships
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <Building2 size={14} />
              <span>{activeFacility?.name || 'Naples Surgery Center'}</span>
              <span>•</span>
              <span>{users.length} registered accounts</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => setIsInviteOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
            color: '#fff',
            border: 'none',
            fontWeight: '600',
            fontSize: '0.9rem',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
            transition: 'all 0.2s'
          }}
        >
          <UserPlus size={16} />
          <span>Invite / Provision User</span>
        </button>
      </div>

      {/* Filter and Search Row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ position: 'relative', width: '320px', maxWidth: '100%' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search by name, email, department..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 12px 9px 38px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              fontSize: '0.88rem',
              outline: 'none'
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Filter size={15} style={{ color: 'var(--text-muted)' }} />
          <select
            value={selectedRoleFilter}
            onChange={(e) => setSelectedRoleFilter(e.target.value)}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="all">All Roles</option>
            {CANONICAL_ROLES.map(r => (
              <option key={r.slug} value={r.slug}>{r.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* User Directory Table */}
      <div style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: '16px',
        border: '1px solid var(--border-color)',
        overflow: 'hidden',
        boxShadow: '0 4px 12px rgba(0,0,0,0.02)'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{
                backgroundColor: 'rgba(0,0,0,0.02)',
                borderBottom: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                fontWeight: '600',
                textTransform: 'uppercase',
                fontSize: '0.75rem',
                letterSpacing: '0.5px'
              }}>
                <th style={{ padding: '14px 20px' }}>User / Identity</th>
                <th style={{ padding: '14px 16px' }}>Assigned Role</th>
                <th style={{ padding: '14px 16px' }}>Department</th>
                <th style={{ padding: '14px 16px' }}>Status</th>
                <th style={{ padding: '14px 20px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user, idx) => {
                const badge = getRoleBadgeColor(user.role);
                const canonicalObj = CANONICAL_ROLES.find(r => r.slug === rbacService.normalizeRole(user.role));
                return (
                  <tr
                    key={user.id || idx}
                    style={{
                      borderBottom: '1px solid var(--border-light)',
                      transition: 'background 0.15s'
                    }}
                  >
                    <td style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          backgroundColor: 'rgba(59, 130, 246, 0.15)',
                          color: 'var(--color-blue, #3b82f6)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: '700',
                          fontSize: '0.85rem'
                        }}>
                          {user.name ? user.name.slice(0, 2).toUpperCase() : 'US'}
                        </div>
                        <div>
                          <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{user.name || 'User Account'}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{user.email}</div>
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 10px',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        backgroundColor: badge.bg,
                        color: badge.text,
                        border: `1px solid ${badge.border}`
                      }}>
                        <Shield size={12} />
                        {canonicalObj?.name || user.role}
                      </span>
                    </td>

                    <td style={{ padding: '14px 16px', color: 'var(--text-primary)' }}>
                      <div>{user.department || 'Clinical Operations'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{user.title || 'Staff'}</div>
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      {user.is_active ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#10b981', fontWeight: '600', fontSize: '0.8rem' }}>
                          <CheckCircle2 size={14} /> Active
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#ef4444', fontWeight: '600', fontSize: '0.8rem' }}>
                          <XCircle size={14} /> Suspended
                        </span>
                      )}
                    </td>

                    <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          onClick={() => handleToggleActive(user)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color)',
                            backgroundColor: user.is_active ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                            color: user.is_active ? '#ef4444' : '#10b981',
                            fontSize: '0.78rem',
                            fontWeight: '600',
                            cursor: 'pointer'
                          }}
                        >
                          {user.is_active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Modal */}
      {isInviteOpen && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card)',
            borderRadius: '16px',
            width: '480px',
            maxWidth: '100%',
            padding: '24px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            border: '1px solid var(--border-color)'
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', color: 'var(--text-primary)' }}>
              Invite / Provision Staff Member
            </h3>

            <form onSubmit={handleInviteSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>First Name</label>
                  <input
                    type="text"
                    required
                    value={inviteForm.firstName}
                    onChange={(e) => setInviteForm({ ...inviteForm, firstName: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-toggle)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>Last Name</label>
                  <input
                    type="text"
                    required
                    value={inviteForm.lastName}
                    onChange={(e) => setInviteForm({ ...inviteForm, lastName: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-toggle)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>Email Address</label>
                <input
                  type="email"
                  required
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-toggle)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>Facility Role</label>
                <select
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-toggle)', color: 'var(--text-primary)' }}
                >
                  {CANONICAL_ROLES.filter(r => !['super_admin'].includes(r.slug)).map(r => (
                    <option key={r.slug} value={r.slug}>{r.name} (Tier {r.tier})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>Department</label>
                  <input
                    type="text"
                    value={inviteForm.department}
                    onChange={(e) => setInviteForm({ ...inviteForm, department: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-toggle)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>Job Title</label>
                  <input
                    type="text"
                    value={inviteForm.title}
                    onChange={(e) => setInviteForm({ ...inviteForm, title: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-toggle)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setIsInviteOpen(false)}
                  style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: '600', cursor: 'pointer' }}
                >
                  Send Invitation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
