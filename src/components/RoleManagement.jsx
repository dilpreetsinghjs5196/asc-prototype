import React, { useState, useEffect } from 'react';
import { rbacService, CANONICAL_ROLES, PERMISSIONS_CATALOG } from '../lib/rbacService.js';
import { db } from '../lib/supabase.js';
import {
  Shield, Lock, Plus, Search, Grid, List, Check, X,
  Building2, Info
} from 'lucide-react';
import Swal from 'sweetalert2';

export default function RoleManagement({ activeFacility, facilities = [], isSuperAdmin: propIsSuperAdmin, theme: _theme = 'light' }) {
  const [roles, setRoles] = useState(CANONICAL_ROLES);
  const [_loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'matrix'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoleForDetail, setSelectedRoleForDetail] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const session = db.getSession();
  const currentRole = rbacService.normalizeRole(session?.role);
  const isSuperAdmin = propIsSuperAdmin !== undefined ? propIsSuperAdmin : (currentRole === 'super_admin');
  const [facilitiesList, setFacilitiesList] = useState(facilities || []);

  useEffect(() => {
    if (facilities && facilities.length > 0) {
      setFacilitiesList(facilities);
    } else {
      db.getFacilities().then(res => {
        if (res && res.length > 0) setFacilitiesList(res);
      }).catch(console.error);
    }
  }, [facilities]);

  // Custom Role Form
  const [roleForm, setRoleForm] = useState({
    name: '',
    description: '',
    selectedPermissions: [],
    facilityId: activeFacility?.id || ''
  });

  const canManageRoles = ['super_admin', 'org_admin', 'facility_admin'].includes(currentRole);

  const loadRoles = async () => {
    setLoading(true);
    try {
      const data = await rbacService.listRoles(activeFacility?.id);
      if (data && data.length > 0) {
        setRoles(data);
      } else {
        setRoles(CANONICAL_ROLES);
      }
    } catch (err) {
      console.warn('Could not fetch roles:', err);
      setRoles(CANONICAL_ROLES);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoles();
  }, [activeFacility]);

  // Group permissions by 13 functional domains
  const permissionsByDomain = PERMISSIONS_CATALOG.reduce((acc, p) => {
    if (!acc[p.category]) acc[p.category] = [];
    acc[p.category].push(p);
    return acc;
  }, {});

  const domainLabels = {
    patients: 'Patient Demographics & Medical Records',
    surgeons: 'Surgeon Credentials & Preference Cards',
    surgeries: 'Surgical Cases & Clinical Documentation',
    or_scheduling: 'OR Block Allocations & Room Booking',
    cpt_codes: 'CPT Catalog & Fee Schedules',
    finance: 'Financial Performance & Profit Margins',
    billing: 'Billing, RCM & Medicare MPPR',
    reports: 'Reporting & Analytics Exports',
    ai: 'AI Operations & Scheduling Simulation',
    users: 'User Accounts & Provisioning',
    roles: 'Roles & Access Control Security',
    tenancy: 'Multi-Tenancy & Facility Configuration',
    audit: 'Compliance Audit Logs & PHI Access'
  };

  // Helper to determine if a role has a given permission
  const checkRoleHasPermission = (roleSlug, permCode) => {
    const r = rbacService.normalizeRole(roleSlug);
    if (r === 'super_admin') return true;
    if (r === 'org_admin') return permCode !== 'ai.edit_instructions';
    if (r === 'facility_admin') return !['tenancy.provision_facility', 'ai.edit_instructions'].includes(permCode);

    // Use default permission mappings from rbacService
    const roleObj = CANONICAL_ROLES.find(c => c.slug === r);
    if (!roleObj) return false;

    if (r === 'cfo') {
      return [
        'patients.view', 'surgeons.view', 'surgeons.edit',
        'surgeries.view', 'or.view', 'cpt.view', 'cpt.create', 'cpt.edit',
        'finance.view_margins', 'finance.manage_overtime', 'finance.approve_budgets',
        'billing.view_yield', 'billing.apply_mppr', 'billing.freeze_monthly',
        'reports.export_volume', 'reports.export_margins',
        'ai.run_insights', 'roles.view', 'tenancy.toggle_mppr',
        'audit.view_clinical', 'audit.view_financial'
      ].includes(permCode);
    }
    if (r === 'clinical_manager') {
      return [
        'patients.view', 'patients.view_phi', 'patients.create', 'patients.edit',
        'surgeons.view', 'surgeons.create', 'surgeons.edit',
        'surgeries.view', 'surgeries.schedule', 'surgeries.edit', 'surgeries.delete', 'surgeries.approve',
        'or.view', 'or.reserve_blocks', 'or.edit_allocations', 'or.release_blocks', 'or.approve_schedule',
        'cpt.view', 'finance.view_margins', 'reports.export_volume',
        'ai.run_insights', 'ai.run_simulation', 'ai.auto_schedule',
        'users.view', 'roles.view', 'audit.view_clinical'
      ].includes(permCode);
    }
    if (r === 'scheduler') {
      return [
        'patients.view', 'patients.view_phi', 'patients.create', 'patients.edit',
        'surgeons.view',
        'surgeries.view', 'surgeries.schedule', 'surgeries.edit', 'surgeries.delete',
        'or.view', 'or.reserve_blocks', 'or.edit_allocations', 'or.release_blocks',
        'cpt.view', 'reports.export_volume',
        'ai.run_insights', 'ai.run_simulation', 'ai.auto_schedule'
      ].includes(permCode);
    }
    if (r === 'biller') {
      return [
        'patients.view', 'patients.view_phi', 'patients.edit',
        'surgeons.view', 'surgeries.view', 'surgeries.edit',
        'or.view', 'cpt.view', 'cpt.create', 'cpt.edit', 'cpt.delete',
        'finance.view_margins', 'finance.manage_overtime',
        'billing.view_yield', 'billing.apply_mppr', 'billing.freeze_monthly',
        'reports.export_volume', 'reports.export_margins',
        'ai.run_insights', 'audit.view_financial'
      ].includes(permCode);
    }
    if (r === 'coder') {
      return [
        'patients.view', 'patients.view_phi',
        'surgeons.view', 'surgeries.view', 'surgeries.edit',
        'cpt.view', 'cpt.create',
        'reports.export_volume', 'ai.run_insights'
      ].includes(permCode);
    }
    if (r === 'surgeon') {
      return [
        'patients.view', 'patients.view_phi', 'patients.create', 'patients.edit',
        'surgeons.view', 'surgeons.edit',
        'surgeries.view', 'surgeries.schedule', 'surgeries.edit',
        'or.view', 'cpt.view',
        'finance.view_margins',
        'reports.export_volume',
        'ai.run_insights', 'ai.run_simulation', 'ai.auto_schedule'
      ].includes(permCode);
    }
    // Default viewer
    return ['surgeries.view', 'or.view', 'cpt.view', 'ai.run_insights'].includes(permCode);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!roleForm.name.trim()) {
      Swal.fire('Required', 'Role name cannot be empty.', 'error');
      return;
    }

    try {
      const targetFacId = roleForm.facilityId || activeFacility?.id;
      const created = await rbacService.createCustomRole({
        name: roleForm.name,
        description: roleForm.description,
        facilityId: targetFacId,
        permissionCodes: roleForm.selectedPermissions
      });

      const newRoleObj = {
        id: created?.id || `role-${Date.now()}`,
        slug: created?.slug || roleForm.name.toLowerCase().replace(/\s+/g, '_'),
        name: roleForm.name.trim(),
        description: roleForm.description.trim(),
        is_system: false,
        tier: 6,
        facility_id: targetFacId
      };

      setRoles(prev => [...prev, newRoleObj]);
      setIsCreateOpen(false);
      setRoleForm({ name: '', description: '', selectedPermissions: [], facilityId: activeFacility?.id || (facilitiesList[0]?.id || '') });

      Swal.fire({
        title: 'Custom Role Provisioned',
        text: `Custom role "${newRoleObj.name}" created with ${roleForm.selectedPermissions.length} permissions.`,
        icon: 'success',
        timer: 2200,
        showConfirmButton: false
      });
    } catch (err) {
      Swal.fire('Error', err.message || 'Failed to create custom role.', 'error');
    }
  };

  const togglePermission = (code) => {
    setRoleForm(prev => {
      const exists = prev.selectedPermissions.includes(code);
      return {
        ...prev,
        selectedPermissions: exists
          ? prev.selectedPermissions.filter(c => c !== code)
          : [...prev.selectedPermissions, code]
      };
    });
  };

  const toggleCategoryPermissions = (category) => {
    const catCodes = permissionsByDomain[category].map(p => p.code);
    const allSelected = catCodes.every(c => roleForm.selectedPermissions.includes(c));

    setRoleForm(prev => ({
      ...prev,
      selectedPermissions: allSelected
        ? prev.selectedPermissions.filter(c => !catCodes.includes(c))
        : Array.from(new Set([...prev.selectedPermissions, ...catCodes]))
    }));
  };

  const filteredRoles = roles.filter(r =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (r.description && r.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

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
            backgroundColor: 'rgba(99, 102, 241, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#6366f1'
          }}>
            <Shield size={24} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>
              Roles & Permissions Architecture
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <Building2 size={14} />
              <span>{activeFacility?.name || 'Naples Surgery Center'}</span>
              <span>•</span>
              <span>{roles.length} Active Roles</span>
              <span>•</span>
              <span>38 Granular Permissions across 13 Functional Domains</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* View Mode Toggle */}
          <div style={{
            display: 'flex',
            backgroundColor: 'var(--bg-toggle, rgba(0,0,0,0.04))',
            borderRadius: '10px',
            padding: '4px',
            border: '1px solid var(--border-color)'
          }}>
            <button
              onClick={() => setViewMode('cards')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: viewMode === 'cards' ? 'var(--bg-card)' : 'transparent',
                color: viewMode === 'cards' ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: viewMode === 'cards' ? '600' : '400',
                cursor: 'pointer',
                boxShadow: viewMode === 'cards' ? '0 2px 4px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              <Grid size={15} />
              <span style={{ fontSize: '0.82rem' }}>Role Profiles</span>
            </button>
            <button
              onClick={() => setViewMode('matrix')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: viewMode === 'matrix' ? 'var(--bg-card)' : 'transparent',
                color: viewMode === 'matrix' ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: viewMode === 'matrix' ? '600' : '400',
                cursor: 'pointer',
                boxShadow: viewMode === 'matrix' ? '0 2px 4px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              <List size={15} />
              <span style={{ fontSize: '0.82rem' }}>Permission Matrix</span>
            </button>
          </div>

          {canManageRoles && (
            <button
              onClick={() => setIsCreateOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                color: '#fff',
                border: 'none',
                fontWeight: '600',
                fontSize: '0.88rem',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(79, 70, 229, 0.25)',
                transition: 'all 0.2s'
              }}
            >
              <Plus size={16} />
              <span>Create Custom Role</span>
            </button>
          )}
        </div>
      </div>

      {/* Search & Notice Bar */}
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
            placeholder="Search roles by title or slug..."
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

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
          backgroundColor: 'rgba(59, 130, 246, 0.08)',
          padding: '6px 14px',
          borderRadius: '8px',
          border: '1px solid rgba(59, 130, 246, 0.2)'
        }}>
          <Info size={14} style={{ color: '#3b82f6' }} />
          <span>Built-in system roles are cryptographically immutable to prevent facility lockouts.</span>
        </div>
      </div>

      {/* VIEW MODE 1: ROLE PROFILES (CARDS) */}
      {viewMode === 'cards' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: '16px'
        }}>
          {filteredRoles.map(role => {
            const isSystem = role.is_system !== false;
            const grantedCount = PERMISSIONS_CATALOG.filter(p => checkRoleHasPermission(role.slug, p.code)).length;

            return (
              <div
                key={role.slug || role.id}
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderRadius: '14px',
                  border: '1px solid var(--border-color)',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                  transition: 'transform 0.15s, box-shadow 0.15s'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                        {role.name}
                      </h3>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '2px' }}>
                        slug: {role.slug}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      {isSystem ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 8px',
                          borderRadius: '8px',
                          fontSize: '0.7rem',
                          fontWeight: '700',
                          backgroundColor: 'rgba(100, 116, 139, 0.15)',
                          color: 'var(--text-secondary)',
                          border: '1px solid rgba(100, 116, 139, 0.25)'
                        }}>
                          <Lock size={10} /> System Built-In
                        </span>
                      ) : (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 8px',
                          borderRadius: '8px',
                          fontSize: '0.7rem',
                          fontWeight: '700',
                          backgroundColor: 'rgba(99, 102, 241, 0.15)',
                          color: '#6366f1',
                          border: '1px solid rgba(99, 102, 241, 0.3)'
                        }}>
                          Facility Custom
                        </span>
                      )}
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Hierarchy Tier {role.tier || 5}
                      </span>
                    </div>
                  </div>

                  <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: '8px 0 16px 0', lineHeight: '1.4' }}>
                    {role.description || 'Custom organizational security role.'}
                  </p>
                </div>

                <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>{grantedCount}</strong> of 38 permissions active
                  </div>

                  <button
                    onClick={() => setSelectedRoleForDetail(role)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'transparent',
                      color: 'var(--color-blue, #3b82f6)',
                      fontSize: '0.78rem',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    Inspect Permissions
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* VIEW MODE 2: ENTERPRISE 13-DOMAIN PERMISSION MATRIX */}
      {viewMode === 'matrix' && (
        <div style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          overflow: 'hidden',
          boxShadow: '0 4px 12px rgba(0,0,0,0.02)'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{
                  backgroundColor: 'rgba(0,0,0,0.02)',
                  borderBottom: '2px solid var(--border-color)'
                }}>
                  <th style={{ padding: '14px 20px', minWidth: '280px', color: 'var(--text-secondary)' }}>
                    Functional Domain & Permission Code
                  </th>
                  {roles.slice(0, 10).map(r => (
                    <th key={r.slug} style={{ padding: '12px 10px', textAlign: 'center', minWidth: '90px' }}>
                      <div style={{ fontWeight: '700', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{r.name}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{r.slug}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(permissionsByDomain).map(([category, perms]) => (
                  <React.Fragment key={category}>
                    {/* Category Header Row */}
                    <tr style={{
                      backgroundColor: 'rgba(59, 130, 246, 0.04)',
                      borderTop: '1px solid var(--border-color)',
                      borderBottom: '1px solid var(--border-color)'
                    }}>
                      <td
                        colSpan={roles.slice(0, 10).length + 1}
                        style={{
                          padding: '8px 20px',
                          fontWeight: '700',
                          fontSize: '0.78rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          color: '#3b82f6'
                        }}
                      >
                        {domainLabels[category] || category}
                      </td>
                    </tr>

                    {/* Permission Rows */}
                    {perms.map(p => {
                      const riskBadge = p.risk_level === 'critical'
                        ? { bg: 'rgba(239, 68, 68, 0.1)', text: '#ef4444' }
                        : p.risk_level === 'sensitive'
                          ? { bg: 'rgba(245, 158, 11, 0.1)', text: '#f59e0b' }
                          : { bg: 'rgba(100, 116, 139, 0.1)', text: '#64748b' };

                      return (
                        <tr
                          key={p.code}
                          style={{
                            borderBottom: '1px solid var(--border-light)'
                          }}
                        >
                          <td style={{ padding: '10px 20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{p.name}</span>
                              <span style={{
                                padding: '1px 6px',
                                borderRadius: '6px',
                                fontSize: '0.68rem',
                                fontWeight: '700',
                                backgroundColor: riskBadge.bg,
                                color: riskBadge.text
                              }}>
                                {p.risk_level}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '2px' }}>
                              {p.code}
                            </div>
                          </td>

                          {roles.slice(0, 10).map(r => {
                            const hasPerm = checkRoleHasPermission(r.slug, p.code);
                            return (
                              <td key={r.slug} style={{ padding: '10px', textAlign: 'center' }}>
                                {hasPerm ? (
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '24px',
                                    height: '24px',
                                    borderRadius: '50%',
                                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                                    color: '#10b981'
                                  }}>
                                    <Check size={14} />
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DETAIL DRAWER / MODAL FOR SINGLE ROLE INSPECTION */}
      {selectedRoleForDetail && (
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
            width: '640px',
            maxWidth: '100%',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
            border: '1px solid var(--border-color)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)' }}>
                  {selectedRoleForDetail.name}
                </h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  slug: <code>{selectedRoleForDetail.slug}</code> • Tier {selectedRoleForDetail.tier}
                </div>
              </div>
              <button
                onClick={() => setSelectedRoleForDetail(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ backgroundColor: 'rgba(0,0,0,0.02)', padding: '12px 16px', borderRadius: '10px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {selectedRoleForDetail.description}
              </div>

              <div style={{ fontWeight: '700', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                Active Capabilities ({PERMISSIONS_CATALOG.filter(p => checkRoleHasPermission(selectedRoleForDetail.slug, p.code)).length} granted):
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {Object.entries(permissionsByDomain).map(([category, perms]) => {
                  const activeInCat = perms.filter(p => checkRoleHasPermission(selectedRoleForDetail.slug, p.code));
                  if (activeInCat.length === 0) return null;

                  return (
                    <div key={category} style={{ border: '1px solid var(--border-light)', borderRadius: '10px', padding: '12px 14px' }}>
                      <div style={{ fontWeight: '600', fontSize: '0.82rem', color: '#3b82f6', marginBottom: '8px' }}>
                        {domainLabels[category] || category} ({activeInCat.length}/{perms.length})
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {activeInCat.map(p => (
                          <span
                            key={p.code}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              backgroundColor: 'rgba(16, 185, 129, 0.1)',
                              color: '#10b981',
                              fontSize: '0.75rem',
                              fontWeight: '600'
                            }}
                          >
                            ✓ {p.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSelectedRoleForDetail(null)}
                style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: '600', cursor: 'pointer' }}
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE CUSTOM ROLE MODAL */}
      {isCreateOpen && (
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
            width: '680px',
            maxWidth: '100%',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
            border: '1px solid var(--border-color)',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)' }}>
                  Create Facility Custom Role
                </h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Define custom job roles tailored to {activeFacility?.name || 'this facility'}.
                </div>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {isSuperAdmin && (
                  <div style={{
                    padding: '12px 14px',
                    background: 'rgba(59, 130, 246, 0.06)',
                    borderRadius: '8px',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}>
                    <label style={{
                      fontSize: '0.78rem',
                      fontWeight: '700',
                      color: 'var(--color-blue, #3b82f6)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <Building2 size={14} /> Assign Facility (Super Admin)
                    </label>
                    <select
                      value={roleForm.facilityId || activeFacility?.id || ''}
                      onChange={(e) => setRoleForm({ ...roleForm, facilityId: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-card, #1e293b)',
                        color: 'var(--text-primary, #fff)',
                        fontWeight: '600',
                        fontSize: '0.88rem'
                      }}
                    >
                      <option value="">Select Facility...</option>
                      {facilitiesList.map(f => (
                        <option key={f.id} value={f.id}>{f.name} ({f.location || f.code})</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Role Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Lead Sterile Processing Tech, Surgical Materials Lead"
                    value={roleForm.name}
                    onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-toggle)', color: 'var(--text-primary)', fontSize: '0.88rem' }}
                  />
                  {roleForm.name && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', fontFamily: 'monospace' }}>
                      Generated slug: {roleForm.name.toLowerCase().replace(/[^a-z0-9_]/g, '_')}
                    </div>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Role Description
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Summary of responsibilities and clinical/operational scope..."
                    value={roleForm.description}
                    onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-toggle)', color: 'var(--text-primary)', fontSize: '0.88rem', resize: 'vertical' }}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                      Assigned Capabilities ({roleForm.selectedPermissions.length} selected)
                    </label>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Toggle by domain or individual codes
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {Object.entries(permissionsByDomain).map(([category, perms]) => {
                      const allCatSelected = perms.every(p => roleForm.selectedPermissions.includes(p.code));

                      return (
                        <div key={category} style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px', backgroundColor: 'rgba(0,0,0,0.01)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ fontWeight: '600', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                              {domainLabels[category] || category}
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleCategoryPermissions(category)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#3b82f6',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                cursor: 'pointer'
                              }}
                            >
                              {allCatSelected ? 'Deselect Domain' : 'Select All'}
                            </button>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                            {perms.map(p => {
                              const checked = roleForm.selectedPermissions.includes(p.code);
                              return (
                                <label
                                  key={p.code}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    fontSize: '0.78rem',
                                    color: checked ? 'var(--text-primary)' : 'var(--text-secondary)',
                                    cursor: 'pointer',
                                    padding: '4px 6px',
                                    borderRadius: '6px',
                                    backgroundColor: checked ? 'rgba(59, 130, 246, 0.08)' : 'transparent'
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => togglePermission(p.code)}
                                  />
                                  <span>{p.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', background: '#6366f1', color: '#fff', fontWeight: '600', cursor: 'pointer' }}
                >
                  Save Custom Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
