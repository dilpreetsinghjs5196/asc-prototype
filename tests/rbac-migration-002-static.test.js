import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const UP_MIGRATION_PATH = path.resolve(process.cwd(), 'supabase/migrations/002_rbac_roles_and_permissions.sql');
const DOWN_MIGRATION_PATH = path.resolve(process.cwd(), 'supabase/migrations/002_rbac_roles_and_permissions_down.sql');

test('Migration 002 (RBAC & Granular Permissions) Verification', async (t) => {
  const upSql = fs.readFileSync(UP_MIGRATION_PATH, 'utf8');
  const downSql = fs.readFileSync(DOWN_MIGRATION_PATH, 'utf8');

  await t.test('Req 1: Granular permissions table created with RLS enabled and anon revoked', () => {
    assert.match(upSql, /CREATE TABLE IF NOT EXISTS public\.permissions/i);
    assert.match(upSql, /ALTER TABLE public\.permissions ENABLE ROW LEVEL SECURITY/i);
    assert.match(upSql, /REVOKE ALL ON public\.permissions FROM anon/i);
    assert.match(upSql, /GRANT SELECT ON public\.permissions TO authenticated/i);
    assert.match(upSql, /CREATE POLICY "Auth Users Can View Permissions Catalog"/i);
    assert.match(upSql, /CREATE POLICY "Super Admin Can Manage Permissions"/i);
  });

  await t.test('Req 2: Roles table created with 3 partial unique indexes handling NULL scopes', () => {
    assert.match(upSql, /CREATE TABLE IF NOT EXISTS public\.roles/i);
    assert.match(upSql, /ALTER TABLE public\.roles ENABLE ROW LEVEL SECURITY/i);
    assert.match(upSql, /REVOKE ALL ON public\.roles FROM anon/i);
    assert.match(upSql, /uq_roles_system_slug/i);
    assert.match(upSql, /WHERE facility_id IS NULL AND organization_id IS NULL/i);
    assert.match(upSql, /uq_roles_org_slug/i);
    assert.match(upSql, /WHERE facility_id IS NULL AND organization_id IS NOT NULL/i);
    assert.match(upSql, /uq_roles_facility_slug/i);
    assert.match(upSql, /WHERE facility_id IS NOT NULL/i);
  });

  await t.test('Req 3: Seeds all 10 canonical built-in roles with deterministic UUIDs', () => {
    const roles = [
      'super_admin', 'org_admin', 'facility_admin', 'cfo',
      'clinical_manager', 'scheduler', 'biller', 'coder', 'surgeon', 'viewer'
    ];
    for (const r of roles) {
      assert.match(upSql, new RegExp(`'${r}'`, 'i'), `Missing canonical role seed: ${r}`);
    }
    assert.match(upSql, /is_system = true/i);
  });

  await t.test('Req 4: Role-permissions junction table created with RLS and restrictive admin policies', () => {
    assert.match(upSql, /CREATE TABLE IF NOT EXISTS public\.role_permissions/i);
    assert.match(upSql, /ALTER TABLE public\.role_permissions ENABLE ROW LEVEL SECURITY/i);
    assert.match(upSql, /REVOKE ALL ON public\.role_permissions FROM anon/i);
    assert.match(upSql, /CREATE POLICY "Auth Users Can View Role Permissions"/i);
    assert.match(upSql, /CREATE POLICY "Authorized Admins Can Manage Custom Role Permissions"/i);
    // Built-in system roles protected from modification
    assert.match(upSql, /NOT r\.is_system/i);
  });

  await t.test('Req 5: Links facility_memberships to roles table and backfills legacy role strings', () => {
    assert.match(upSql, /ALTER TABLE public\.facility_memberships\s+ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES public\.roles\(id\)/i);
    assert.match(upSql, /idx_memberships_role_id/i);
    assert.match(upSql, /UPDATE public\.facility_memberships fm\s+SET role_id =/i);
    assert.match(upSql, /WHEN 'clinical_director' THEN 'clinical_manager'/i);
    assert.match(upSql, /WHEN 'billing_rcm' THEN 'biller'/i);
    assert.match(upSql, /WHEN 'finance' THEN 'cfo'/i);
    assert.match(upSql, /WHEN 'read_only' THEN 'viewer'/i);
  });

  await t.test('Req 6: Implements dual-resolution has_permission security definer function', () => {
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.has_permission\(/i);
    assert.match(upSql, /SECURITY DEFINER/i);
    assert.match(upSql, /SET search_path = public/i);
    // Checks relational role_id first
    assert.match(upSql, /rp\.role_id = v_role_id/i);
    // Fallback checks legacy string role mapped to system role
    assert.match(upSql, /r\.slug = CASE v_legacy_role/i);
  });

  await t.test('Req 7: Enforces true database-tier surgeon case isolation on surgeries table', () => {
    assert.match(upSql, /CREATE POLICY "Tenant Scoped Surgeries Read"/i);
    assert.match(upSql, /NOT user_has_facility_role\(facility_id, ARRAY\['surgeon'\]\)/i);
    assert.match(upSql, /surgeon_id IN/i);
    assert.match(upSql, /SELECT s\.id FROM public\.surgeons s/i);
  });

  await t.test('Req 8: Disallows biller and billing_rcm from inserting surgery cases', () => {
    assert.match(upSql, /CREATE POLICY "Tenant Scoped Surgeries Insert"/i);
    assert.match(upSql, /has_permission\(facility_id, 'surgeries\.schedule'\)/i);
    // Must NOT contain biller or billing_rcm in the insert role array
    const insertPolicyChunk = upSql.split('CREATE POLICY "Tenant Scoped Surgeries Insert"')[1]?.split(';')[0] || '';
    assert.doesNotMatch(insertPolicyChunk, /'biller'/i, 'Biller role must not be permitted in Surgeries Insert policy');
    assert.doesNotMatch(insertPolicyChunk, /'billing_rcm'/i, 'Billing RCM must not be permitted in Surgeries Insert policy');
  });

  await t.test('Req 9: Synchronizes handle_new_facility_user trigger to populate role_id', () => {
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.handle_new_facility_user\(\)/i);
    assert.match(upSql, /SELECT id INTO v_admin_role_id FROM public\.roles WHERE slug = 'facility_admin'/i);
    assert.match(upSql, /SELECT id INTO v_surgeon_role_id FROM public\.roles WHERE slug = 'surgeon'/i);
    assert.match(upSql, /role_id = v_admin_role_id/i);
    assert.match(upSql, /role_id = v_surgeon_role_id/i);
  });

  await t.test('Req 10: Enforces anti-self-escalation and Last Administrator protection triggers', () => {
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.prevent_self_role_escalation\(\)/i);
    assert.match(upSql, /CREATE TRIGGER trg_prevent_self_escalation/i);
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.protect_last_facility_admin\(\)/i);
    assert.match(upSql, /CREATE TRIGGER trg_protect_last_facility_admin/i);
  });

  await t.test('Req 11: Rollback down migration safely reverts without restoring open anonymous access', () => {
    assert.doesNotMatch(downSql, /TO anon/i, 'Rollback must never grant access to anon');
    assert.doesNotMatch(downSql, /FOR ALL TO authenticated USING \(true\)/i, 'Rollback must never restore wide-open authenticated policies');
    assert.match(downSql, /DROP TABLE IF EXISTS public\.role_permissions CASCADE/i);
    assert.match(downSql, /DROP TABLE IF EXISTS public\.roles CASCADE/i);
    assert.match(downSql, /DROP TABLE IF EXISTS public\.permissions CASCADE/i);
    assert.match(downSql, /DROP FUNCTION IF EXISTS public\.has_permission/i);
    assert.match(downSql, /ALTER TABLE public\.facility_memberships DROP COLUMN IF EXISTS role_id CASCADE/i);
  });
});
