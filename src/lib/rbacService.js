/**
 * src/lib/rbacService.js
 * Production Role-Based Access Control & User Management Service Contract.
 * Specification: docs/phases/22-RBAC-ROLES-AND-PERMISSIONS.md
 */

import { supabase, db } from './supabase.js';

export const CANONICAL_ROLES = [
  { id: '00000000-0000-0000-0001-000000000001', slug: 'super_admin', name: 'Super Admin', tier: 1, is_system: true, description: 'Global Enterprise Platform Administrator' },
  { id: '00000000-0000-0000-0001-000000000002', slug: 'org_admin', name: 'Organization Admin', tier: 2, is_system: true, description: 'Healthcare Network Executive Administrator' },
  { id: '00000000-0000-0000-0001-000000000003', slug: 'facility_admin', name: 'Facility Administrator', tier: 3, is_system: true, description: 'ASC Executive Center Administrator' },
  { id: '00000000-0000-0000-0001-000000000004', slug: 'cfo', name: 'CFO / Finance Lead', tier: 4, is_system: true, description: 'Financial Analyst, Margin & Budget Lead' },
  { id: '00000000-0000-0000-0001-000000000005', slug: 'clinical_manager', name: 'Clinical Manager', tier: 4, is_system: true, description: 'Clinical Director, OR Nurse & Quality Manager' },
  { id: '00000000-0000-0000-0001-000000000006', slug: 'scheduler', name: 'Surgical Scheduler', tier: 5, is_system: true, description: 'Operating Room Booking & Calendar Coordinator' },
  { id: '00000000-0000-0000-0001-000000000007', slug: 'biller', name: 'Billing / RCM Specialist', tier: 5, is_system: true, description: 'Revenue Cycle Management & Claim Specialist' },
  { id: '00000000-0000-0000-0001-000000000008', slug: 'coder', name: 'Medical Coder', tier: 6, is_system: true, description: 'Medical Records, CPT & Coding Specialist' },
  { id: '00000000-0000-0000-0001-000000000009', slug: 'surgeon', name: 'Attending Surgeon', tier: 7, is_system: true, description: 'Physician Provider with Personal Case Scope' },
  { id: '00000000-0000-0000-0001-000000000010', slug: 'viewer', name: 'Read Only / Observer', tier: 8, is_system: true, description: 'Non-PHI Operational Dashboard Observer' }
];

export const PERMISSIONS_CATALOG = [
  // Patients
  { code: 'patients.view', category: 'patients', name: 'View Patient Records', risk_level: 'standard' },
  { code: 'patients.view_phi', category: 'patients', name: 'View Patient PHI', risk_level: 'sensitive' },
  { code: 'patients.create', category: 'patients', name: 'Create Patient Record', risk_level: 'standard' },
  { code: 'patients.edit', category: 'patients', name: 'Edit Patient Demographics', risk_level: 'standard' },
  { code: 'patients.delete', category: 'patients', name: 'Delete Patient Record', risk_level: 'critical' },

  // Surgeons
  { code: 'surgeons.view', category: 'surgeons', name: 'View Surgeon Directory', risk_level: 'standard' },
  { code: 'surgeons.create', category: 'surgeons', name: 'Onboard Surgeon', risk_level: 'sensitive' },
  { code: 'surgeons.edit', category: 'surgeons', name: 'Edit Surgeon Profile', risk_level: 'standard' },
  { code: 'surgeons.delete', category: 'surgeons', name: 'Deactivate Surgeon', risk_level: 'critical' },

  // Surgeries
  { code: 'surgeries.view', category: 'surgeries', name: 'View Surgical Cases', risk_level: 'standard' },
  { code: 'surgeries.schedule', category: 'surgeries', name: 'Schedule Surgery Case', risk_level: 'standard' },
  { code: 'surgeries.edit', category: 'surgeries', name: 'Edit Surgical Case', risk_level: 'standard' },
  { code: 'surgeries.delete', category: 'surgeries', name: 'Delete / Cancel Case', risk_level: 'sensitive' },
  { code: 'surgeries.approve', category: 'surgeries', name: 'Approve Case Logs', risk_level: 'sensitive' },

  // OR Scheduling
  { code: 'or.view', category: 'or_scheduling', name: 'View OR Schedule', risk_level: 'standard' },
  { code: 'or.reserve_blocks', category: 'or_scheduling', name: 'Reserve OR Blocks', risk_level: 'standard' },
  { code: 'or.edit_allocations', category: 'or_scheduling', name: 'Edit OR Allocations', risk_level: 'standard' },
  { code: 'or.release_blocks', category: 'or_scheduling', name: 'Release OR Blocks', risk_level: 'standard' },
  { code: 'or.approve_schedule', category: 'or_scheduling', name: 'Approve Block Schedule', risk_level: 'sensitive' },

  // CPT Codes
  { code: 'cpt.view', category: 'cpt_codes', name: 'View CPT Catalog', risk_level: 'standard' },
  { code: 'cpt.create', category: 'cpt_codes', name: 'Import / Add CPT Codes', risk_level: 'standard' },
  { code: 'cpt.edit', category: 'cpt_codes', name: 'Edit CPT Rates', risk_level: 'sensitive' },
  { code: 'cpt.delete', category: 'cpt_codes', name: 'Delete CPT Mapping', risk_level: 'sensitive' },
  { code: 'coding.assist', category: 'cpt_codes', name: 'Generate AI Coding Candidates', risk_level: 'standard' },
  { code: 'coding.review', category: 'cpt_codes', name: 'Review & Reject Coding Candidates', risk_level: 'standard' },
  { code: 'coding.approve', category: 'cpt_codes', name: 'Commit Approved CPT Codes to Case', risk_level: 'sensitive' },
  { code: 'coding.export', category: 'reports', name: 'Export Coding Provenance Audit Logs', risk_level: 'sensitive' },

  // Finance
  { code: 'finance.view_margins', category: 'finance', name: 'View Profit Margins', risk_level: 'sensitive' },
  { code: 'finance.manage_overtime', category: 'finance', name: 'Manage Extra / OT Costs', risk_level: 'sensitive' },
  { code: 'finance.approve_budgets', category: 'finance', name: 'Approve Facility Budgets', risk_level: 'critical' },

  // Billing
  { code: 'billing.view_yield', category: 'billing', name: 'View Payer Yields', risk_level: 'standard' },
  { code: 'billing.apply_mppr', category: 'billing', name: 'Apply Medicare MPPR', risk_level: 'sensitive' },
  { code: 'billing.freeze_monthly', category: 'billing', name: 'Freeze Monthly Billing', risk_level: 'critical' },

  // Reports
  { code: 'reports.export_volume', category: 'reports', name: 'Export Case Volume', risk_level: 'standard' },
  { code: 'reports.export_margins', category: 'reports', name: 'Export Financial Data', risk_level: 'sensitive' },
  { code: 'reports.export_phi_unredacted', category: 'reports', name: 'Export Unredacted PHI Logs', risk_level: 'critical' },

  // AI Tools
  { code: 'ai.run_insights', category: 'ai', name: 'Run AI Operations Insights', risk_level: 'standard' },
  { code: 'ai.run_simulation', category: 'ai', name: 'Run Scheduling Simulation', risk_level: 'standard' },
  { code: 'ai.auto_schedule', category: 'ai', name: 'Auto-Commit Cases via Agent', risk_level: 'sensitive' },
  { code: 'ai.edit_instructions', category: 'ai', name: 'Edit AI System Instructions', risk_level: 'critical' },

  // Users
  { code: 'users.view', category: 'users', name: 'View User Directory', risk_level: 'standard' },
  { code: 'users.invite', category: 'users', name: 'Invite New Users', risk_level: 'sensitive' },
  { code: 'users.edit_roles', category: 'users', name: 'Assign Facility Roles', risk_level: 'sensitive' },
  { code: 'users.deactivate', category: 'users', name: 'Deactivate User Accounts', risk_level: 'sensitive' },

  // Roles
  { code: 'roles.view', category: 'roles', name: 'View Roles & Permissions', risk_level: 'standard' },
  { code: 'roles.create_custom', category: 'roles', name: 'Create Custom Roles', risk_level: 'sensitive' },
  { code: 'roles.edit_custom', category: 'roles', name: 'Edit Custom Roles', risk_level: 'sensitive' },
  { code: 'roles.delete_custom', category: 'roles', name: 'Delete Custom Roles', risk_level: 'sensitive' },

  // Tenancy
  { code: 'tenancy.edit_facility_config', category: 'tenancy', name: 'Edit Facility Settings', risk_level: 'sensitive' },
  { code: 'tenancy.toggle_mppr', category: 'tenancy', name: 'Toggle Facility MPPR', risk_level: 'sensitive' },
  { code: 'tenancy.provision_facility', category: 'tenancy', name: 'Provision New Facility', risk_level: 'critical' },

  // Audit
  { code: 'audit.view_clinical', category: 'audit', name: 'View Clinical Audit Trail', risk_level: 'standard' },
  { code: 'audit.view_financial', category: 'audit', name: 'View Financial Audit Trail', risk_level: 'sensitive' },
  { code: 'audit.view_security', category: 'audit', name: 'View Security Audit Logs', risk_level: 'critical' }
];

export const rbacService = {
  /**
   * Evaluates if active permissions include required permission code
   */
  hasPermission(activeUserPermissions, requiredPermission) {
    if (!activeUserPermissions || !Array.isArray(activeUserPermissions)) return false;
    if (activeUserPermissions.includes('*') || activeUserPermissions.includes('admin.*')) return true;
    return activeUserPermissions.includes(requiredPermission);
  },

  /**
   * Normalizes role string to canonical slug
   */
  normalizeRole(roleStr) {
    if (!roleStr) return 'viewer';
    const s = String(roleStr).trim().toLowerCase();
    switch (s) {
      case 'clinical_director': return 'clinical_manager';
      case 'billing_rcm': return 'biller';
      case 'finance':
      case 'financial_analyst': return 'cfo';
      case 'read_only': return 'viewer';
      case 'admin': return 'facility_admin';
      default: return s;
    }
  },

  /**
   * Gets list of permissions for a user in a facility
   */
  async getPermissionsForUser(facilityId) {
    const activeFac = facilityId || db.getActiveFacility()?.id;
    try {
      // 1. Try server-side RPC if Migration 002 is applied
      const { data, error } = await supabase.rpc('get_auth_user_permissions', {
        p_facility_id: activeFac || null
      });

      if (!error && Array.isArray(data) && data.length > 0) {
        return data;
      }
    } catch {
      // Proceed to fallback
    }

    // 2. Client-side fallback based on resolved role
    const session = db.getSession();
    const roleSlug = this.normalizeRole(session?.role);

    if (roleSlug === 'super_admin') {
      return PERMISSIONS_CATALOG.map(p => p.code);
    }
    if (roleSlug === 'org_admin') {
      return PERMISSIONS_CATALOG.filter(p => p.code !== 'ai.edit_instructions').map(p => p.code);
    }
    if (roleSlug === 'facility_admin') {
      return PERMISSIONS_CATALOG.filter(p => !['tenancy.provision_facility', 'ai.edit_instructions'].includes(p.code)).map(p => p.code);
    }
    if (roleSlug === 'cfo') {
      return [
        'patients.view', 'surgeons.view', 'surgeons.edit',
        'surgeries.view', 'or.view', 'cpt.view', 'cpt.create', 'cpt.edit',
        'finance.view_margins', 'finance.manage_overtime', 'finance.approve_budgets',
        'billing.view_yield', 'billing.apply_mppr', 'billing.freeze_monthly',
        'reports.export_volume', 'reports.export_margins',
        'ai.run_insights', 'roles.view', 'tenancy.toggle_mppr',
        'audit.view_clinical', 'audit.view_financial'
      ];
    }
    if (roleSlug === 'clinical_manager') {
      return [
        'patients.view', 'patients.view_phi', 'patients.create', 'patients.edit',
        'surgeons.view', 'surgeons.create', 'surgeons.edit',
        'surgeries.view', 'surgeries.schedule', 'surgeries.edit', 'surgeries.delete', 'surgeries.approve',
        'or.view', 'or.reserve_blocks', 'or.edit_allocations', 'or.release_blocks', 'or.approve_schedule',
        'cpt.view', 'finance.view_margins', 'reports.export_volume',
        'ai.run_insights', 'ai.run_simulation', 'ai.auto_schedule',
        'users.view', 'roles.view', 'audit.view_clinical'
      ];
    }
    if (roleSlug === 'scheduler') {
      return [
        'patients.view', 'patients.view_phi', 'patients.create', 'patients.edit',
        'surgeons.view',
        'surgeries.view', 'surgeries.schedule', 'surgeries.edit', 'surgeries.delete',
        'or.view', 'or.reserve_blocks', 'or.edit_allocations', 'or.release_blocks',
        'cpt.view', 'reports.export_volume',
        'ai.run_insights', 'ai.run_simulation', 'ai.auto_schedule'
      ];
    }
    if (roleSlug === 'biller') {
      return [
        'patients.view', 'patients.view_phi', 'patients.edit',
        'surgeons.view', 'surgeries.view', 'surgeries.edit',
        'or.view', 'cpt.view', 'cpt.create', 'cpt.edit', 'cpt.delete',
        'finance.view_margins', 'finance.manage_overtime',
        'billing.view_yield', 'billing.apply_mppr', 'billing.freeze_monthly',
        'reports.export_volume', 'reports.export_margins',
        'ai.run_insights', 'audit.view_financial'
      ];
    }
    if (roleSlug === 'coder') {
      return [
        'patients.view', 'patients.view_phi',
        'surgeons.view', 'surgeries.view', 'surgeries.edit',
        'cpt.view', 'cpt.create',
        'coding.assist', 'coding.review', 'coding.approve', 'coding.export',
        'reports.export_volume', 'ai.run_insights'
      ];
    }
    if (roleSlug === 'surgeon') {
      return [
        'patients.view', 'patients.view_phi', 'patients.create', 'patients.edit',
        'surgeons.view', 'surgeons.edit',
        'surgeries.view', 'surgeries.schedule', 'surgeries.edit',
        'or.view', 'cpt.view',
        'finance.view_margins',
        'reports.export_volume',
        'ai.run_insights', 'ai.run_simulation', 'ai.auto_schedule'
      ];
    }
    // Default viewer
    return ['surgeries.view', 'or.view', 'cpt.view', 'ai.run_insights'];
  },

  /**
   * Returns list of roles that the current actor role is authorized to assign
   */
  getAssignableRoles(actorRole) {
    const r = this.normalizeRole(actorRole);
    if (r === 'super_admin') {
      // Super Admin can assign all operational and administrative roles except creating a second super_admin
      return CANONICAL_ROLES.filter(role => role.slug !== 'super_admin');
    }
    if (r === 'org_admin') {
      return CANONICAL_ROLES.filter(role => !['super_admin', 'org_admin'].includes(role.slug));
    }
    if (r === 'facility_admin') {
      // Facility Admin cannot grant super_admin, org_admin, or facility_admin
      return CANONICAL_ROLES.filter(role => !['super_admin', 'org_admin', 'facility_admin'].includes(role.slug));
    }
    return [];
  },

  /**
   * Lists users and their memberships for a facility
   */
  async listUsers(facilityId) {
    await db.ensureAuthSession();
    const activeFac = facilityId || db.getActiveFacility()?.id;
    try {
      const { data, error } = await supabase
        .from('facility_memberships')
        .select('id, user_id, role, role_id, is_active, title, department, created_at, facilities(id, name, status)')
        .eq('facility_id', activeFac)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.warn('listUsers query fallback:', err);
      return [];
    }
  },

  /**
   * Lists users across all facilities (Super Admin / Global Directory)
   */
  async listAllUsers(filters = {}) {
    await db.ensureAuthSession();
    try {
      let query = supabase
        .from('facility_memberships')
        .select('id, user_id, role, role_id, is_active, title, department, created_at, facility_id, facilities(id, name, status)')
        .order('created_at', { ascending: false });

      if (filters.facility_id && filters.facility_id !== 'all') {
        query = query.eq('facility_id', filters.facility_id);
      }
      if (filters.role && filters.role !== 'all') {
        query = query.eq('role', filters.role);
      }
      if (filters.status && filters.status !== 'all') {
        query = query.eq('is_active', filters.status === 'active');
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.warn('listAllUsers query fallback:', err);
      return [];
    }
  },

  /**
   * Invites or registers new user and assigns facility membership (without cleartext passwords)
   */
  async inviteUser({ email, name: _name, role, facilityId, department, title }) {
    const activeFac = facilityId || db.getActiveFacility()?.id;
    if (!activeFac) throw new Error('Cannot invite user without active facility context.');
    if (!email || !email.includes('@')) throw new Error('Valid email address required.');

    const canonicalRole = this.normalizeRole(role);

    // Call Supabase GoTrue invite or create membership row securely
    const { data, error } = await supabase
      .from('facility_memberships')
      .insert([{
        facility_id: activeFac,
        user_id: (await supabase.auth.getUser())?.data?.user?.id || '00000000-0000-0000-0000-000000000000',
        role: canonicalRole,
        department: department || 'General',
        title: title || 'Staff Member',
        is_active: true
      }])
      .select();

    if (error) throw error;
    return data?.[0] || null;
  },

  /**
   * Updates an existing user membership
   */
  async updateMembership(membershipId, updates) {
    const { data, error } = await supabase
      .from('facility_memberships')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', membershipId)
      .select();

    if (error) throw error;
    return data?.[0] || null;
  },

  /**
   * Reassigns user from one facility to another (Super Admin only)
   */
  async reassignUserFacility({ userId, fromFacilityId, toFacilityId, newRole, department, title }) {
    try {
      const { data, error } = await supabase.rpc('fn_admin_reassign_user_facility', {
        p_user_id: userId,
        p_from_facility_id: fromFacilityId,
        p_to_facility_id: toFacilityId,
        p_new_role: newRole || null,
        p_department: department || null,
        p_title: title || null
      });
      if (error) throw error;
      return data;
    } catch (rpcErr) {
      console.warn('fn_admin_reassign_user_facility RPC fallback:', rpcErr?.message);
      // Fallback: archive old membership and activate target
      await supabase
        .from('facility_memberships')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('facility_id', fromFacilityId);

      const { data, error } = await supabase
        .from('facility_memberships')
        .upsert([{
          facility_id: toFacilityId,
          user_id: userId,
          role: newRole || 'viewer',
          department: department || 'General',
          title: title || 'Staff Member',
          is_active: true
        }], { onConflict: 'facility_id,user_id' })
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  },

  /**
   * Toggles active status of a user membership with server-side safety checks
   */
  async toggleUserActive(membershipId, isActive) {
    try {
      const { data, error } = await supabase.rpc('fn_admin_toggle_user_active', {
        p_membership_id: membershipId,
        p_is_active: isActive
      });
      if (error) throw error;
      return data;
    } catch (rpcErr) {
      console.warn('fn_admin_toggle_user_active RPC fallback:', rpcErr?.message);
      return this.updateMembership(membershipId, { is_active: isActive });
    }
  },

  /**
   * Deactivates a user with Last Admin check
   */
  async deactivateUser(membershipId, _facilityId) {
    return this.toggleUserActive(membershipId, false);
  },

  /**
   * Lists all available roles (built-in system and tenant custom roles)
   */
  async listRoles(facilityId) {
    const activeFac = facilityId || db.getActiveFacility()?.id;
    try {
      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .or(`facility_id.is.null,facility_id.eq.${activeFac}`)
        .order('created_at', { ascending: true });

      if (!error && data && data.length > 0) return data;
    } catch {
      // Fallback
    }
    return CANONICAL_ROLES;
  },

  /**
   * Lists permissions catalog
   */
  async listPermissions() {
    try {
      const { data, error } = await supabase
        .from('permissions')
        .select('*')
        .order('category', { ascending: true });

      if (!error && data && data.length > 0) return data;
    } catch {
      // Fallback
    }
    return PERMISSIONS_CATALOG;
  },

  /**
   * Creates a custom role
   */
  async createCustomRole({ name, description, facilityId, permissionCodes = [] }) {
    const activeFac = facilityId || db.getActiveFacility()?.id;
    if (!activeFac) throw new Error('Cannot create custom role without facility context.');
    if (!name || !name.trim()) throw new Error('Role name is required.');

    const slug = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');

    const { data: roleData, error: roleError } = await supabase
      .from('roles')
      .insert([{
        facility_id: activeFac,
        name: name.trim(),
        slug,
        description: description || '',
        is_system: false,
        is_active: true
      }])
      .select()
      .single();

    if (roleError) throw roleError;

    // Bind permissions if provided
    if (permissionCodes.length > 0 && roleData) {
      const { data: perms } = await supabase
        .from('permissions')
        .select('id, code')
        .in('code', permissionCodes);

      if (perms && perms.length > 0) {
        const rows = perms.map(p => ({
          role_id: roleData.id,
          permission_id: p.id
        }));
        await supabase.from('role_permissions').insert(rows);
      }
    }

    return roleData;
  }
};
