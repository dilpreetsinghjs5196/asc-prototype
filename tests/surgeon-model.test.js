import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 35 — Surgeon Model & Multi-Facility Affiliations Test Suite', () => {

  // Domain 1: Database Migration 013 DDL & Schema Integrity
  describe('1. Database Migration 013: DDL & Schema Integrity', () => {
    const migPath = path.join(rootDir, 'supabase', 'migrations', '013_surgeon_model_and_affiliations.sql');
    const downPath = path.join(rootDir, 'supabase', 'migrations', '013_surgeon_model_and_affiliations_down.sql');

    it('Migration 013 forward and down SQL files exist', () => {
      assert.ok(fs.existsSync(migPath), '013_surgeon_model_and_affiliations.sql must exist');
      assert.ok(fs.existsSync(downPath), '013_surgeon_model_and_affiliations_down.sql must exist');
    });

    it('Migration 013 permanently drops legacy plaintext password column on public.surgeons', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('ALTER TABLE public.surgeons DROP COLUMN IF EXISTS password;'), 'Must drop password column from public.surgeons');
    });

    it('Migration 013 reconciles license collision for Surgeon 21 to MD-99021', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes("SET license_number = 'MD-99021'"), 'Must update Surgeon 21 license number to MD-99021');
      assert.ok(sql.includes('WHERE id = 21'), 'Must target Surgeon ID 21');
    });

    it('Migration 013 extends public.surgeons with canonical identity columns', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      const requiredColumns = [
        'surgeon_uuid',
        'npi',
        'credentials',
        'subspecialties',
        'is_active',
        'deleted_at',
        'record_version'
      ];

      for (const col of requiredColumns) {
        assert.ok(sql.includes(col), `Migration 013 must add column "${col}" to public.surgeons`);
      }
    });

    it('Migration 013 enforces 10-digit NPI format check constraint', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('chk_surgeons_npi_format'), 'Must name NPI constraint chk_surgeons_npi_format');
      assert.ok(sql.includes("CHECK (npi ~ '^[0-9]{10}$')"), 'Must require exact 10 numeric digits for NPI');
    });

    it('Migration 013 creates public.surgeon_facility_affiliations table with check constraints', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.surgeon_facility_affiliations'), 'Must create surgeon_facility_affiliations table');
      assert.ok(sql.includes('chk_affiliation_appointment_type'), 'Must define appointment_type check constraint');
      assert.ok(sql.includes('uq_surgeon_facility_affiliation'), 'Must define unique constraint per surgeon-facility');
    });

    it('Migration 013 creates public.surgeon_privileges table with CPT authorization tracking', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.surgeon_privileges'), 'Must create surgeon_privileges table');
      assert.ok(sql.includes('chk_privilege_scope'), 'Must enforce privilege level check');
      assert.ok(sql.includes('uq_surgeon_facility_cpt_privilege'), 'Must enforce unique privilege per surgeon, facility, and CPT');
    });

    it('Migration 013 creates public.case_surgeons table for multi-surgeon case attribution', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.case_surgeons'), 'Must create case_surgeons table');
      assert.ok(sql.includes('chk_case_surgeon_role'), 'Must enforce role constraint (primary, co-surgeon, assistant, proctor, fellow)');
      assert.ok(sql.includes('chk_case_surgeon_attribution'), 'Must enforce attribution percentage check');
    });

    it('Migration 013 creates public.surgeon_time_off table for scheduling blackouts', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.surgeon_time_off'), 'Must create surgeon_time_off table');
      assert.ok(sql.includes('chk_time_off_reason'), 'Must define time off type check constraint');
      assert.ok(sql.includes('chk_time_off_duration'), 'Must ensure end_time is after start_time');
    });

    it('Migration 013 repairs public.or_block_schedule with relational columns', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS surgeon_id BIGINT REFERENCES public.surgeons(id)'), 'Must add surgeon_id FK');
      assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS operating_room_id UUID REFERENCES public.operating_rooms(id)'), 'Must add operating_room_id FK');
    });

    it('Migration 013 implements fn_validate_surgeon_scheduling_conflict stored procedure', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.fn_validate_surgeon_scheduling_conflict'), 'Must create conflict validation function');
      assert.ok(sql.includes('SURGEON_DOUBLE_BOOKING'), 'Function must check SURGEON_DOUBLE_BOOKING');
      assert.ok(sql.includes('SURGEON_ON_LEAVE'), 'Function must check SURGEON_ON_LEAVE');
      assert.ok(sql.includes('ROOM_CONFLICT'), 'Function must check ROOM_CONFLICT');
    });

    it('Migration 013 deploys server-side view v_surgeon_performance_summary', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.v_surgeon_performance_summary'), 'Must create v_surgeon_performance_summary view');
      assert.ok(sql.includes('net_margin_contribution'), 'View must compute net_margin_contribution');
      assert.ok(sql.includes('avg_margin_per_case'), 'View must compute avg_margin_per_case');
    });

    it('Migration 013 enforces RLS on all new tables', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('ALTER TABLE public.surgeon_facility_affiliations ENABLE ROW LEVEL SECURITY;'), 'Must enable RLS on affiliations');
      assert.ok(sql.includes('ALTER TABLE public.surgeon_privileges ENABLE ROW LEVEL SECURITY;'), 'Must enable RLS on privileges');
      assert.ok(sql.includes('ALTER TABLE public.case_surgeons ENABLE ROW LEVEL SECURITY;'), 'Must enable RLS on case_surgeons');
      assert.ok(sql.includes('ALTER TABLE public.surgeon_time_off ENABLE ROW LEVEL SECURITY;'), 'Must enable RLS on surgeon_time_off');
    });

    it('Migration 013 down script safely rolls back all new components without leaving dangling objects', () => {
      const downSql = fs.readFileSync(downPath, 'utf8');
      assert.ok(downSql.includes('DROP VIEW IF EXISTS public.v_surgeon_performance_summary'), 'Down script must drop view');
      assert.ok(downSql.includes('DROP FUNCTION IF EXISTS public.fn_validate_surgeon_scheduling_conflict'), 'Down script must drop procedure');
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.surgeon_time_off'), 'Down script must drop time off table');
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.case_surgeons'), 'Down script must drop case surgeons table');
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.surgeon_privileges'), 'Down script must drop privileges table');
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.surgeon_facility_affiliations'), 'Down script must drop affiliations table');
    });
  });

  // Domain 2: Client Service Layer & Security Hardening (supabase.js)
  describe('2. Client Service Layer & Security Hardening (src/lib/supabase.js)', () => {
    const supabasePath = path.join(rootDir, 'src', 'lib', 'supabase.js');
    const content = fs.readFileSync(supabasePath, 'utf8');

    it('Does not contain duplicate getPayers methods', () => {
      const matches = content.match(/async\s+getPayers\s*\(/g) || [];
      assert.equal(matches.length, 1, 'src/lib/supabase.js must define getPayers exactly once');
    });

    it('Defines getSurgeonsWithAffiliations helper method', () => {
      assert.ok(content.includes('async getSurgeonsWithAffiliations('), 'Must define getSurgeonsWithAffiliations');
    });

    it('Defines getSurgeonAffiliations and addSurgeonAffiliation helper methods', () => {
      assert.ok(content.includes('async getSurgeonAffiliations('), 'Must define getSurgeonAffiliations');
      assert.ok(content.includes('async addSurgeonAffiliation('), 'Must define addSurgeonAffiliation');
    });

    it('Defines getSurgeonPrivileges and addSurgeonPrivilege helper methods', () => {
      assert.ok(content.includes('async getSurgeonPrivileges('), 'Must define getSurgeonPrivileges');
      assert.ok(content.includes('async addSurgeonPrivilege('), 'Must define addSurgeonPrivilege');
    });

    it('Defines getCaseSurgeons and addCaseSurgeon helper methods', () => {
      assert.ok(content.includes('async getCaseSurgeons('), 'Must define getCaseSurgeons');
      assert.ok(content.includes('async addCaseSurgeon('), 'Must define addCaseSurgeon');
    });

    it('Defines validateSurgeonSchedulingConflict helper method', () => {
      assert.ok(content.includes('async validateSurgeonSchedulingConflict('), 'Must define validateSurgeonSchedulingConflict');
    });

    it('Defines getSurgeonPerformanceSummary helper method', () => {
      assert.ok(content.includes('async getSurgeonPerformanceSummary('), 'Must define getSurgeonPerformanceSummary');
    });

    it('Hardens surgeon login to forbid empty/missing password bypass', () => {
      assert.ok(content.includes('!trimmedPassword'), 'Must check for empty or missing password');
      assert.ok(content.includes("throw new Error('Password is required.');"), 'Must throw error if password missing');
    });

    it('Surgeon fallback login never elevates to admin@asc.com or admin role', () => {
      // Find the surgeon fallback block
      const surgeonAuthBlock = content.slice(content.indexOf('// 2b. Fallback Surgeon Authentication'));
      const endBlock = surgeonAuthBlock.slice(0, surgeonAuthBlock.indexOf('throw new Error(\'Invalid credentials or account role.\');'));
      assert.ok(!endBlock.includes("email: 'admin@asc.com'"), 'Surgeon auth must never log in as admin@asc.com');
      assert.ok(!endBlock.includes("role: 'admin'"), 'Surgeon auth must never assign admin role');
    });
  });

  // Domain 3: Zero-Mock Tolerance & Standalone Component Extraction
  describe('3. Component Architecture & Zero-Mock Policy Verification', () => {
    const mgmtPath = path.join(rootDir, 'src', 'components', 'SurgeonManagement.jsx');
    const appPath = path.join(rootDir, 'src', 'App.jsx');
    const portalPath = path.join(rootDir, 'src', 'components', 'SurgeonPortal.jsx');

    it('Standalone SurgeonManagement.jsx component exists', () => {
      assert.ok(fs.existsSync(mgmtPath), 'SurgeonManagement.jsx must exist');
    });

    it('SurgeonManagement.jsx implements fail-closed error handling without silent local mock creation', () => {
      const code = fs.readFileSync(mgmtPath, 'utf8');
      assert.ok(!code.includes('id: Date.now()'), 'SurgeonManagement.jsx must not create fake records with Date.now() on DB failure');
      assert.ok(code.includes('Swal.fire'), 'Must notify user with alert modal on DB failure');
    });

    it('App.jsx imports and mounts SurgeonManagement component for surgeons_manage tab', () => {
      const appCode = fs.readFileSync(appPath, 'utf8');
      assert.ok(appCode.includes("import SurgeonManagement from './components/SurgeonManagement';"), 'Must import SurgeonManagement in App.jsx');
      assert.ok(appCode.includes('<SurgeonManagement'), 'Must render SurgeonManagement in App.jsx');
    });

    it('App.jsx dynamicSurgeonTableData groups by canonical surgeon_id and excludes void cases', () => {
      const appCode = fs.readFileSync(appPath, 'utf8');
      assert.ok(appCode.includes("statusLower === 'cancelled' || statusLower === 'void'"), 'Must exclude void and cancelled cases');
      assert.ok(appCode.includes('s.surgeon_id'), 'Must utilize surgeon_id for canonical grouping');
    });

    it('SurgeonPortal.jsx purges hardcoded mock metrics fallbacks (cases: 18, $142,500)', () => {
      const portalCode = fs.readFileSync(portalPath, 'utf8');
      assert.ok(!portalCode.includes('cases: totalCases || 18'), 'Must not default cases to 18');
      assert.ok(!portalCode.includes('142500'), 'Must not default netMargin to 142500');
    });

    it('SurgeonPortal.jsx eliminates hardcoded fake preference card rows', () => {
      const portalCode = fs.readFileSync(portalPath, 'utf8');
      assert.ok(!portalCode.includes('Specialty Surgical Pack & Drapes'), 'Must not contain static mock pack row');
      assert.ok(!portalCode.includes('Custom Cannula & Blade Set'), 'Must not contain static mock blade set row');
    });
  });

  // Domain 4: Scheduling Conflict Deterministic Validation Logic
  describe('4. Scheduling Conflict Deterministic Validation Logic', () => {
    // Pure algorithmic test simulating interval overlap logic
    const checkIntervalConflict = (startA, endA, startB, endB) => {
      const tStartA = new Date(startA).getTime();
      const tEndA = new Date(endA).getTime();
      const tStartB = new Date(startB).getTime();
      const tEndB = new Date(endB).getTime();

      return tStartA < tEndB && tEndA > tStartB;
    };

    it('Detects overlapping surgical cases for the same surgeon', () => {
      const case1Start = '2026-10-21T08:00:00Z';
      const case1End = '2026-10-21T10:00:00Z';

      const conflictCaseStart = '2026-10-21T09:30:00Z';
      const conflictCaseEnd = '2026-10-21T11:00:00Z';

      assert.equal(checkIntervalConflict(case1Start, case1End, conflictCaseStart, conflictCaseEnd), true);
    });

    it('Allows adjacent non-overlapping cases', () => {
      const case1Start = '2026-10-21T08:00:00Z';
      const case1End = '2026-10-21T09:30:00Z';

      const case2Start = '2026-10-21T09:30:00Z';
      const case2End = '2026-10-21T11:00:00Z';

      assert.equal(checkIntervalConflict(case1Start, case1End, case2Start, case2End), false);
    });

    it('Allows completely separate surgical sessions', () => {
      const case1Start = '2026-10-21T08:00:00Z';
      const case1End = '2026-10-21T10:00:00Z';

      const case2Start = '2026-10-21T14:00:00Z';
      const case2End = '2026-10-21T16:00:00Z';

      assert.equal(checkIntervalConflict(case1Start, case1End, case2Start, case2End), false);
    });
  });

});
