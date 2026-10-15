import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const UP_MIGRATION_PATH = path.resolve('supabase/migrations/001_multi_tenancy_core.sql');
const DOWN_MIGRATION_PATH = path.resolve('supabase/migrations/001_multi_tenancy_core_down.sql');

describe('Migration 001 Hardened Production-Readiness Verification', () => {
  const upSql = fs.readFileSync(UP_MIGRATION_PATH, 'utf-8');
  const downSql = fs.readFileSync(DOWN_MIGRATION_PATH, 'utf-8');

  it('Requirement 1: Explicitly enables RLS on EVERY operational domain table and agent tables', () => {
    const requiredTables = [
      'organizations',
      'facilities',
      'facility_memberships',
      'surgeries',
      'patients',
      'surgeons',
      'cpt_codes',
      'or_block_schedule',
      'ot_extra_cost',
      'staff',
      'chatbot_questions',
      'settings',
      'users'
    ];

    for (const table of requiredTables) {
      const pattern = new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY;`, 'i');
      assert.match(upSql, pattern, `Expected RLS to be explicitly enabled on table public.${table}`);
    }

    // Verify conditional check for agent tables
    assert.match(upSql, /agent_runs/);
    assert.match(upSql, /agent_tasks/);
    assert.match(upSql, /agent_events/);
    assert.match(upSql, /agent_context/);
    assert.match(upSql, /agent_approvals/);
    assert.match(upSql, /ALTER TABLE public\.agent_runs ENABLE ROW LEVEL SECURITY;/);
  });

  it('Requirement 2: Eliminates plaintext password exposure and secures public.users', () => {
    // Must NOT have open select policy to anon
    assert.doesNotMatch(upSql, /CREATE POLICY.*ON public\.users.*TO authenticated, anon.*USING \(true\)/i);
    assert.doesNotMatch(upSql, /GRANT ALL.*ON public\.users.*TO anon/i);
    assert.doesNotMatch(upSql, /GRANT SELECT.*password.*ON public\.users/i);

    // Must revoke all from anon and authenticated
    assert.match(upSql, /REVOKE ALL ON public\.users FROM anon, authenticated;/);

    // Must grant column-level select excluding password to authenticated
    assert.match(
      upSql,
      /GRANT SELECT \(id, name, email, role, avatar, created_at, updated_at\) ON public\.users TO authenticated;/
    );

    // Must create policy only for authenticated users
    assert.match(upSql, /CREATE POLICY "Auth Users Can View User Profiles"\s+ON public\.users\s+FOR SELECT\s+TO authenticated/);
  });

  it('Requirement 3: Replaces blanket FOR ALL policies with role-aware CRUD policies', () => {
    // patients must have discrete read, insert, update, delete (no FOR ALL)
    assert.doesNotMatch(upSql, /CREATE POLICY "Tenant Scoped Patients Access"\s+ON public\.patients\s+FOR ALL/i);
    assert.match(upSql, /CREATE POLICY "Tenant Scoped Patients Read"\s+ON public\.patients\s+FOR SELECT/);
    assert.match(upSql, /CREATE POLICY "Tenant Scoped Patients Insert"\s+ON public\.patients\s+FOR INSERT/);
    assert.match(upSql, /CREATE POLICY "Tenant Scoped Patients Update"\s+ON public\.patients\s+FOR UPDATE/);
    assert.match(upSql, /CREATE POLICY "Tenant Scoped Patients Delete"\s+ON public\.patients\s+FOR DELETE/);

    // surgeries delete must be admin restricted
    assert.match(upSql, /CREATE POLICY "Tenant Scoped Surgeries Delete"\s+ON public\.surgeries\s+FOR DELETE\s+TO authenticated\s+USING \(\s*facility_id IN \(SELECT get_auth_user_facilities\(\)\)\s*AND user_has_facility_role\(facility_id, ARRAY\['super_admin', 'org_admin', 'facility_admin'\]\)\s*\);/);

    // surgeons must have discrete CRUD
    assert.match(upSql, /CREATE POLICY "Tenant Scoped Surgeons Read"\s+ON public\.surgeons\s+FOR SELECT/);
    assert.match(upSql, /CREATE POLICY "Tenant Scoped Surgeons Delete"\s+ON public\.surgeons\s+FOR DELETE/);

    // staff, settings, extra cost must restrict mutations
    assert.match(upSql, /CREATE POLICY "Tenant Scoped Settings Manage"\s+ON public\.settings\s+FOR ALL\s+TO authenticated\s+USING \(\s*facility_id IN \(SELECT get_auth_user_facilities\(\)\)\s*AND user_has_facility_role\(facility_id, ARRAY\['super_admin', 'org_admin', 'facility_admin'\]\)/);
  });

  it('Requirement 4: Prevents cross-facility relocation via BEFORE UPDATE trigger', () => {
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.prevent_facility_relocation\(\)/);
    assert.match(upSql, /IF NEW\.facility_id IS DISTINCT FROM OLD\.facility_id THEN/);
    assert.match(upSql, /trg_prevent_facility_relocation_surgeries/);
    assert.match(upSql, /trg_prevent_facility_relocation_patients/);
    assert.match(upSql, /trg_prevent_facility_relocation_surgeons/);
    assert.match(upSql, /trg_prevent_facility_relocation_or_block/);
    assert.match(upSql, /trg_prevent_facility_relocation_ot_extra_cost/);
    assert.match(upSql, /trg_prevent_facility_relocation_staff/);
    assert.match(upSql, /trg_prevent_facility_relocation_settings/);
  });

  it('Requirement 5: Handles surgeon onboarding dynamically from verified surgeon records', () => {
    // Must NOT hardcode Naples facility for all surgeons in handle_new_facility_user
    assert.doesNotMatch(
      upSql,
      /ELSIF EXISTS \(SELECT 1 FROM public\.surgeons.*VALUES \('00000000-0000-0000-0000-000000000002'::UUID, NEW\.id, 'surgeon'/s
    );

    // Must iterate over matching surgeon records
    assert.match(upSql, /FOR v_surgeon_record IN\s+SELECT DISTINCT facility_id\s+FROM public\.surgeons/);

    // Must include safe idempotent backfill for pre-existing GoTrue surgeons
    assert.match(upSql, /INSERT INTO public\.facility_memberships \(facility_id, user_id, role, is_active\)\s+SELECT DISTINCT s\.facility_id, u\.id, 'surgeon', true/);
  });

  it('Requirement 6: Grants admin@asc.com access ONLY to approved primary facility by default', () => {
    // In seed membership, admin@asc.com must only be inserted for primary facility (00000000-0000-0000-0000-000000000002)
    assert.match(upSql, /'00000000-0000-0000-0000-000000000002'::UUID,\s*u\.id,\s*'facility_admin',\s*true\s*FROM auth\.users u\s*WHERE u\.email = 'admin@asc\.com'/);

    // Must NOT have a second INSERT into South Florida facility for admin@asc.com
    assert.doesNotMatch(
      upSql,
      /'00000000-0000-0000-0000-000000000003'::UUID,\s*u\.id,\s*'facility_admin',\s*true\s*FROM auth\.users u\s*WHERE u\.email = 'admin@asc\.com'/
    );
  });

  it('Requirement 7: Aligns role constraint with all 10 planned specification roles', () => {
    const plannedRoles = [
      'super_admin',
      'org_admin',
      'facility_admin',
      'cfo',
      'finance',
      'clinical_manager',
      'clinical_director',
      'scheduler',
      'biller',
      'billing_rcm',
      'coder',
      'surgeon',
      'viewer',
      'read_only'
    ];

    for (const role of plannedRoles) {
      assert.ok(upSql.includes(`'${role}'`), `Expected role '${role}' to be in facility_memberships constraint`);
    }
  });

  it('Requirement 8: Scopes agent telemetry and workflow tables appropriately', () => {
    assert.match(upSql, /"Tenant Scoped Agent Runs Read"/);
    assert.match(upSql, /"Tenant Scoped Agent Tasks Read"/);
    assert.match(upSql, /"Tenant Scoped Agent Events Read"/);
    assert.match(upSql, /"Tenant Scoped Agent Context Read"/);
    assert.match(upSql, /"Tenant Scoped Agent Approvals Read"/);
  });

  it('Requirement 9: Safe idempotent policy management with DROP POLICY IF EXISTS', () => {
    // Check that CREATE POLICY statements are preceded by DROP POLICY IF EXISTS
    const policies = [
      'Auth Users Can View Their Organizations',
      'Auth Users Can View Their Facilities',
      'Tenant Scoped Surgeries Read',
      'Tenant Scoped Patients Read',
      'Tenant Scoped Surgeons Read',
      'Shared And Tenant Scoped CPT Codes Read',
      'Tenant Scoped Block Schedule Read',
      'Tenant Scoped Extra Costs Read',
      'Tenant Scoped Staff Read',
      'Shared And Tenant Scoped Chatbot Questions Read',
      'Tenant Scoped Settings Read',
      'Auth Users Can View User Profiles'
    ];

    for (const policy of policies) {
      const dropPattern = new RegExp(`DROP POLICY IF EXISTS "${policy}"`, 'i');
      assert.match(upSql, dropPattern, `Expected DROP POLICY IF EXISTS for "${policy}"`);
    }
  });

  it('Requirement 10: Down migration NEVER restores open anonymous access', () => {
    // Must NOT have any policy granting access to anon
    assert.doesNotMatch(downSql, /TO anon/i);
    assert.doesNotMatch(downSql, /Allow anon all on/i);

    // Must restore authenticated-only baseline
    assert.match(downSql, /CREATE POLICY "Authenticated users baseline surgeries access" ON public\.surgeries FOR ALL TO authenticated/);
    assert.match(downSql, /CREATE POLICY "Authenticated users baseline patients access" ON public\.patients FOR ALL TO authenticated/);

    // Must contain destructive warning
    assert.match(downSql, /DESTRUCTIVE ROLLBACK WARNING/);
  });
});
