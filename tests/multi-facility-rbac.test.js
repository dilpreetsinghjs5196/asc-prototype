import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const UP_MIGRATION_PATH = path.join(rootDir, 'supabase/migrations/008_multi_facility_and_single_super_admin.sql');
const DOWN_MIGRATION_PATH = path.join(rootDir, 'supabase/migrations/008_multi_facility_and_single_super_admin_down.sql');

test('Phase 27 — Multi-Facility, Single Super Admin & User Management Test Suite', async (t) => {
  const upSql = fs.readFileSync(UP_MIGRATION_PATH, 'utf8');
  const downSql = fs.readFileSync(DOWN_MIGRATION_PATH, 'utf8');

  // ============================================================================
  // 1. MIGRATION 008 DDL & SCHEMA AUDIT
  // ============================================================================
  await t.test('1.1: Migration 008 extends public.facilities with status, is_active, and designated_admin_id', () => {
    assert.match(upSql, /ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'/i);
    assert.match(upSql, /CHECK \(status IN \('active', 'inactive', 'suspended'\)\)/i);
    assert.match(upSql, /ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true/i);
    assert.match(upSql, /ADD COLUMN IF NOT EXISTS designated_admin_id UUID REFERENCES auth\.users\(id\)/i);
  });

  await t.test('1.2: Migration 008 implements strict Single Super Admin enforcement trigger', () => {
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_enforce_single_super_admin\(\)/i);
    assert.match(upSql, /trg_enforce_single_super_admin/i);
    assert.match(upSql, /role = 'super_admin'/i);
    assert.match(upSql, /is_active = TRUE/i);
    assert.match(upSql, /v_sa_count >= 1/i);
    assert.match(upSql, /SINGLE SUPER ADMIN INVARIANT VIOLATION/i);
  });

  await t.test('1.3: Migration 008 enforces lockout prevention for the Global Super Admin', () => {
    assert.match(upSql, /ADMINISTRATIVE SAFETY VIOLATION/i);
    assert.match(upSql, /Cannot deactivate or demote the sole remaining Global Super Admin/i);
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_protect_super_admin_delete\(\)/i);
    assert.match(upSql, /trg_protect_super_admin_delete/i);
  });

  await t.test('1.4: Migration 008 deploys secure server-side administrative RPCs with audit logging', () => {
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_admin_create_facility\(/i);
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_admin_update_facility\(/i);
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_admin_reassign_user_facility\(/i);
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_admin_toggle_user_active\(/i);
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_replace_super_admin\(/i);
    assert.match(upSql, /INSERT INTO public\.audit_logs/i);
  });

  await t.test('1.5: Down migration 008 cleanly reverts triggers, functions, and columns', () => {
    assert.match(downSql, /DROP TRIGGER IF EXISTS trg_enforce_single_super_admin/i);
    assert.match(downSql, /DROP FUNCTION IF EXISTS public\.fn_enforce_single_super_admin/i);
    assert.match(downSql, /DROP FUNCTION IF EXISTS public\.fn_admin_create_facility/i);
    assert.match(downSql, /DROP COLUMN IF EXISTS status/i);
    assert.match(downSql, /DROP COLUMN IF EXISTS designated_admin_id/i);
  });

  // ============================================================================
  // 2. ZERO-SECRET & CREDENTIAL PURGE CONTRACT
  // ============================================================================
  await t.test('2.1: UserManagement.jsx eliminates all plaintext password generation and display', () => {
    const userMgmtSrc = fs.readFileSync(path.join(rootDir, 'src/components/UserManagement.jsx'), 'utf8');
    assert.ok(!userMgmtSrc.includes('revealedPasswords'), 'Must not track revealed password state');
    assert.ok(!userMgmtSrc.includes('generateRandomPassword'), 'Must not generate cleartext passwords in frontend UI');
    assert.ok(!userMgmtSrc.includes("password: 'admin123'"), 'Must not hardcode or render admin123 credentials');
    assert.ok(!userMgmtSrc.includes("password: 'asc2026!Staff'"), 'Must not hardcode or render staff credentials');
    assert.ok(!userMgmtSrc.includes('showInvitePassword'), 'Must not contain password reveal checkboxes');
  });

  await t.test('2.2: rbacService.js eliminates cleartext passwords from user invitations', () => {
    const rbacSrc = fs.readFileSync(path.join(rootDir, 'src/lib/rbacService.js'), 'utf8');
    assert.ok(!rbacSrc.includes('assignedPassword'), 'Must not store cleartext assignedPassword');
    assert.ok(!rbacSrc.includes("password: 'admin123'"), 'Must not contain plaintext fallback passwords');
  });

  // ============================================================================
  // 3. ROLE HIERARCHY & ANTI-ESCALATION LOGIC
  // ============================================================================
  await t.test('3.1: rbacService.getAssignableRoles strictly limits role assignment by actor tier', async () => {
    const { rbacService } = await import('../src/lib/rbacService.js');
    
    // Facility Admin cannot assign super_admin, org_admin, or facility_admin
    const facAdminAssignable = rbacService.getAssignableRoles('facility_admin');
    const facAdminSlugs = facAdminAssignable.map(r => r.slug);
    assert.ok(!facAdminSlugs.includes('super_admin'), 'Facility Admin must NOT assign super_admin');
    assert.ok(!facAdminSlugs.includes('org_admin'), 'Facility Admin must NOT assign org_admin');
    assert.ok(!facAdminSlugs.includes('facility_admin'), 'Facility Admin must NOT assign facility_admin');
    assert.ok(facAdminSlugs.includes('scheduler'), 'Facility Admin can assign scheduler');
    assert.ok(facAdminSlugs.includes('surgeon'), 'Facility Admin can assign surgeon');

    // Super Admin cannot create a second super_admin via standard dropdown
    const superAdminAssignable = rbacService.getAssignableRoles('super_admin');
    const superAdminSlugs = superAdminAssignable.map(r => r.slug);
    assert.ok(!superAdminSlugs.includes('super_admin'), 'Super Admin cannot assign second super_admin via standard edit');
    assert.ok(superAdminSlugs.includes('facility_admin'), 'Super Admin can assign facility_admin');

    // Ordinary roles have no assignable roles
    const viewerAssignable = rbacService.getAssignableRoles('viewer');
    assert.equal(viewerAssignable.length, 0, 'Viewer must have 0 assignable roles');
  });

  // ============================================================================
  // 4. UI INTEGRATION & NAVIGATION CONTRACTS
  // ============================================================================
  await t.test('4.1: FacilityManagement.jsx exists and supports List, Create, Edit, and Status Toggles', () => {
    const facMgmtSrc = fs.readFileSync(path.join(rootDir, 'src/components/FacilityManagement.jsx'), 'utf8');
    assert.ok(facMgmtSrc.includes('Enterprise Facility Management'), 'Must render enterprise facility title');
    assert.ok(facMgmtSrc.includes('Provision New Ambulatory Surgery Center'), 'Must contain create facility modal');
    assert.ok(facMgmtSrc.includes('handleToggleStatus'), 'Must implement facility deactivation handler');
    assert.ok(facMgmtSrc.includes('handleCopyId'), 'Must support copying facility UUID');
  });

  await t.test('4.2: UserManagement.jsx maintains Last Admin Safeguard and role filtering', () => {
    const userMgmtSrc = fs.readFileSync(path.join(rootDir, 'src/components/UserManagement.jsx'), 'utf8');
    assert.ok(userMgmtSrc.includes('Administrative Safeguard'), 'UserManagement must alert on Last Admin deactivation');
    assert.ok(userMgmtSrc.includes('activeAdmins.length <= 1'), 'UserManagement must guard against deactivating sole facility admin');
    assert.ok(userMgmtSrc.includes('CANONICAL_ROLES'), 'UserManagement must reference canonical roles');
    assert.ok(userMgmtSrc.includes('openChangeRoleModal'), 'UserManagement must implement role change dialog');
    assert.ok(userMgmtSrc.includes('openReassignModal'), 'UserManagement must implement facility reassignment dialog');
  });

  await t.test('4.3: App.jsx wires FacilityManagement under RoleGate with tenancy permissions', () => {
    const appSrc = fs.readFileSync(path.join(rootDir, 'src/App.jsx'), 'utf8');
    assert.ok(appSrc.includes('<FacilityManagement'), 'App.jsx must render FacilityManagement component');
    assert.ok(appSrc.includes("activeTab === 'facility_management'"), 'App.jsx must support facility_management tab');
    assert.ok(appSrc.includes('tenancy.edit_facility_config'), 'App.jsx must check tenancy permission for Facility Management');
  });
});
