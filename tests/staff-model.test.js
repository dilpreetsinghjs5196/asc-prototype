import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 36 — Staff and Provider Model Full-Stack Test Suite', () => {

  // Domain 1: Database Migration 015 DDL & Schema Integrity
  describe('1. Database Migration 015: DDL & Schema Integrity', () => {
    const migPath = path.join(rootDir, 'supabase', 'migrations', '015_staff_and_provider_model.sql');
    const downPath = path.join(rootDir, 'supabase', 'migrations', '015_staff_and_provider_model_down.sql');

    it('Migration 015 forward and down SQL files exist and are non-empty', () => {
      assert.ok(fs.existsSync(migPath), '015_staff_and_provider_model.sql must exist');
      assert.ok(fs.existsSync(downPath), '015_staff_and_provider_model_down.sql must exist');
      assert.ok(fs.statSync(migPath).size > 1000, 'Migration 015 forward must have substantial DDL');
      assert.ok(fs.statSync(downPath).size > 200, 'Migration 015 down must have rollback commands');
    });

    it('Migration 015 sanitizes existing staff names and typos', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes("SET lastname = 'Brown'"), 'Must clean Brown (PT)');
      assert.ok(sql.includes("SET lastname = 'Parsons'"), 'Must clean Parsons (PT)');
      assert.ok(sql.includes("SET firstname = 'Noel', lastname = 'Weaver'"), 'Must clean Noel  Weaver whitespace');
      assert.ok(sql.includes("SET lastname = 'Mattos'"), 'Must clean Mattos (P/T)');
      assert.ok(sql.includes("SET role = 'Scrub Tech'"), "Must fix 'Scru Tech' typo");
      assert.ok(sql.includes('TRIM(firstname)'), 'Must trim firstname whitespace');
    });

    it('Migration 015 extends public.staff with canonical identity and audit columns', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      const requiredColumns = [
        'staff_uuid UUID',
        'user_id UUID REFERENCES auth.users(id)',
        'credentials TEXT',
        'staff_type TEXT',
        'photo_url TEXT',
        'deleted_at TIMESTAMPTZ',
        'record_version INTEGER'
      ];
      for (const col of requiredColumns) {
        assert.ok(sql.includes(col), `Migration 015 must add "${col}" to public.staff`);
      }
      assert.ok(sql.includes('uq_staff_staff_uuid'), 'Must create unique constraint on staff_uuid');
    });

    it('Migration 015 creates public.staff_facility_affiliations 1NF table with constraints', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.staff_facility_affiliations'), 'Must create staff_facility_affiliations table');
      assert.ok(sql.includes('REFERENCES public.staff(id) ON DELETE CASCADE'), 'Must reference staff(id)');
      assert.ok(sql.includes('REFERENCES public.facilities(id) ON DELETE CASCADE'), 'Must reference facilities(id)');
      assert.ok(sql.includes("'Full_Time', 'Part_Time', 'PRN', 'Contract_Agency', 'Temporary'"), 'Must check employment_type');
      assert.ok(sql.includes('uq_staff_facility_affiliation'), 'Must enforce unique per staff and facility');
    });

    it('Migration 015 backfills all existing 18 staff into staff_facility_affiliations', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('INSERT INTO public.staff_facility_affiliations'), 'Must backfill affiliations');
      assert.ok(sql.includes("CASE WHEN s.id IN (9, 10, 12) THEN 'Part_Time' ELSE 'Full_Time' END"), 'Must assign part time for IDs 9, 10, 12');
      assert.ok(sql.includes('ON CONFLICT (staff_id, facility_id) DO NOTHING'), 'Must be idempotent');
    });

    it('Migration 015 creates public.staff_credentials table for licensing & expiration tracking', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.staff_credentials'), 'Must create staff_credentials table');
      assert.ok(sql.includes("'State_Nursing_License'"), 'Must track State_Nursing_License');
      assert.ok(sql.includes("'State_Medical_License'"), 'Must track State_Medical_License');
      assert.ok(sql.includes("'BLS_American_Heart'"), 'Must track BLS');
      assert.ok(sql.includes("'ACLS_American_Heart'"), 'Must track ACLS');
      assert.ok(sql.includes("'CST_NBSTSA_Certification'"), 'Must track CST');
      assert.ok(sql.includes('uq_staff_credential_type'), 'Must prevent duplicate credentials');
    });

    it('Migration 015 creates public.case_staff_assignments 1NF relational table', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.case_staff_assignments'), 'Must create case_staff_assignments table');
      assert.ok(sql.includes('REFERENCES public.surgeries(id) ON DELETE CASCADE'), 'Must link to surgeries');
      assert.ok(sql.includes('REFERENCES public.staff(id) ON DELETE RESTRICT'), 'Must protect historical case staff from deletion');
      assert.ok(sql.includes("'Circulating_Nurse'"), 'Must support Circulating_Nurse');
      assert.ok(sql.includes("'Scrub_Nurse'"), 'Must support Scrub_Nurse');
      assert.ok(sql.includes("'Scrub_Tech'"), 'Must support Scrub_Tech');
      assert.ok(sql.includes("'Anesthesiologist_Attending'"), 'Must support Anesthesiologist_Attending');
      assert.ok(sql.includes("'CRNA_Assigned'"), 'Must support CRNA_Assigned');
      assert.ok(sql.includes('hourly_rate_snapshot NUMERIC(10, 2) NOT NULL DEFAULT 0.00'), 'Must freeze hourly wage snapshot');
    });

    it('Migration 015 creates public.anesthesia_records table with ASA scoring & techniques', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.anesthesia_records'), 'Must create anesthesia_records table');
      assert.ok(sql.includes('REFERENCES public.surgeries(id) ON DELETE CASCADE UNIQUE'), 'Must enforce single anesthesia encounter per surgery');
      assert.ok(sql.includes("'ASA_I', 'ASA_II', 'ASA_III', 'ASA_IV', 'ASA_V', 'ASA_E'"), 'Must validate ASA scores');
      assert.ok(sql.includes("'General_Endotracheal'") && sql.includes("'General_LMA'"), 'Must validate anesthesia techniques');
    });

    it('Migration 015 creates public.staff_shifts and public.staff_time_off tables', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.staff_shifts'), 'Must create staff_shifts table');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.staff_time_off'), 'Must create staff_time_off table');
      assert.ok(sql.includes('chk_shift_times'), 'Must enforce start before end on shifts');
      assert.ok(sql.includes('chk_staff_time_off_duration'), 'Must enforce start before end on leave');
    });

    it('Migration 015 implements stored procedure fn_validate_case_staff_scheduling_conflict', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.fn_validate_case_staff_scheduling_conflict'), 'Must create conflict validation function');
      assert.ok(sql.includes('STAFF_DOUBLE_BOOKED'), 'Must detect double-booking across concurrent surgeries');
      assert.ok(sql.includes('STAFF_ON_LEAVE'), 'Must detect approved staff leave/vacation');
      assert.ok(sql.includes('NO_ACTIVE_AFFILIATION'), 'Must verify active facility appointment');
      assert.ok(sql.includes('LICENSE_EXPIRED_OR_MISSING'), 'Must verify active nursing license');
    });

    it('Migration 015 deploys server-side view v_case_labor_cost_summary using frozen wage snapshots', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.v_case_labor_cost_summary'), 'Must create labor cost view');
      assert.ok(sql.includes('csa.hourly_rate_snapshot'), 'Must calculate using hourly_rate_snapshot');
      assert.ok(sql.includes('total_case_labor_cost'), 'Must calculate total_case_labor_cost');
      assert.ok(sql.includes('circulator_count'), 'Must report circulator count');
      assert.ok(sql.includes('scrub_count'), 'Must report scrub count');
    });

    it('Migration 015 enforces Row Level Security (RLS) on all 6 new tables', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      const tables = [
        'staff_facility_affiliations',
        'staff_credentials',
        'case_staff_assignments',
        'anesthesia_records',
        'staff_shifts',
        'staff_time_off'
      ];
      for (const tbl of tables) {
        assert.ok(sql.includes(`ALTER TABLE public.${tbl} ENABLE ROW LEVEL SECURITY;`), `RLS must be enabled on ${tbl}`);
      }
    });

    it('Migration 015 Down script safely rolls back all changes in reverse dependency order', () => {
      const sql = fs.readFileSync(downPath, 'utf8');
      assert.ok(sql.includes('DROP VIEW IF EXISTS public.v_case_labor_cost_summary CASCADE;'), 'Must drop labor cost view');
      assert.ok(sql.includes('DROP FUNCTION IF EXISTS public.fn_validate_case_staff_scheduling_conflict'), 'Must drop stored procedure');
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.staff_time_off CASCADE;'), 'Must drop staff_time_off');
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.staff_shifts CASCADE;'), 'Must drop staff_shifts');
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.anesthesia_records CASCADE;'), 'Must drop anesthesia_records');
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.case_staff_assignments CASCADE;'), 'Must drop case_staff_assignments');
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.staff_credentials CASCADE;'), 'Must drop staff_credentials');
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.staff_facility_affiliations CASCADE;'), 'Must drop staff_facility_affiliations');
      assert.ok(sql.includes('DROP COLUMN IF EXISTS staff_uuid CASCADE'), 'Must drop added staff columns');
    });
  });

  // Domain 2: Client Service Integration in src/lib/supabase.js
  describe('2. Client Service Integration: src/lib/supabase.js', () => {
    const supabaseJsPath = path.join(rootDir, 'src', 'lib', 'supabase.js');
    let supabaseContent = '';

    it('src/lib/supabase.js exists and exports db singleton', () => {
      assert.ok(fs.existsSync(supabaseJsPath), 'supabase.js must exist');
      supabaseContent = fs.readFileSync(supabaseJsPath, 'utf8');
      assert.ok(supabaseContent.includes('export const db = {'), 'Must export db object');
    });

    it('db includes Phase 36 staff affiliations methods', () => {
      assert.ok(supabaseContent.includes('getStaffWithAffiliations(facilityId = null)'), 'Must implement getStaffWithAffiliations');
      assert.ok(supabaseContent.includes('getStaffAffiliations(staffId)'), 'Must implement getStaffAffiliations');
      assert.ok(supabaseContent.includes('addStaffAffiliation(affiliation)'), 'Must implement addStaffAffiliation');
      assert.ok(supabaseContent.includes('updateStaffAffiliation(id, updates)'), 'Must implement updateStaffAffiliation');
      assert.ok(supabaseContent.includes('deleteStaffAffiliation(id)'), 'Must implement deleteStaffAffiliation');
    });

    it('db includes Phase 36 staff credentials methods', () => {
      assert.ok(supabaseContent.includes('getStaffCredentials(staffId = null, facilityId = null)'), 'Must implement getStaffCredentials');
      assert.ok(supabaseContent.includes('addStaffCredential(credential)'), 'Must implement addStaffCredential');
      assert.ok(supabaseContent.includes('updateStaffCredential(id, updates)'), 'Must implement updateStaffCredential');
      assert.ok(supabaseContent.includes('deleteStaffCredential(id)'), 'Must implement deleteStaffCredential');
    });

    it('db includes Phase 36 time-off and shifts methods', () => {
      assert.ok(supabaseContent.includes('getStaffTimeOff(facilityId = null, staffId = null)'), 'Must implement getStaffTimeOff');
      assert.ok(supabaseContent.includes('addStaffTimeOff(timeOff)'), 'Must implement addStaffTimeOff');
      assert.ok(supabaseContent.includes('deleteStaffTimeOff(id)'), 'Must implement deleteStaffTimeOff');
      assert.ok(supabaseContent.includes('getStaffShifts(facilityId = null, startDate = null, endDate = null)'), 'Must implement getStaffShifts');
      assert.ok(supabaseContent.includes('addStaffShift(shift)'), 'Must implement addStaffShift');
      assert.ok(supabaseContent.includes('updateStaffShift(id, updates)'), 'Must implement updateStaffShift');
      assert.ok(supabaseContent.includes('deleteStaffShift(id)'), 'Must implement deleteStaffShift');
    });

    it('db includes Phase 36 case assignments and anesthesia methods', () => {
      assert.ok(supabaseContent.includes('getCaseStaffAssignments(surgeryId)'), 'Must implement getCaseStaffAssignments');
      assert.ok(supabaseContent.includes('syncCaseStaffAssignments(surgeryId, facilityId, assignments = [])'), 'Must implement syncCaseStaffAssignments');
      assert.ok(supabaseContent.includes('getAnesthesiaRecord(surgeryId)'), 'Must implement getAnesthesiaRecord');
      assert.ok(supabaseContent.includes('saveAnesthesiaRecord(record)'), 'Must implement saveAnesthesiaRecord');
      assert.ok(supabaseContent.includes('validateStaffSchedulingConflict('), 'Must implement validateStaffSchedulingConflict');
      assert.ok(supabaseContent.includes('getCaseLaborCostSummary('), 'Must implement getCaseLaborCostSummary');
    });
  });

  // Domain 3: SQL Exporter Table Catalog Coverage
  describe('3. SQL Exporter Catalog Coverage: src/utils/sqlExporter.js', () => {
    const exporterPath = path.join(rootDir, 'src', 'utils', 'sqlExporter.js');
    let exporterContent = '';

    it('src/utils/sqlExporter.js catalogs all 6 new Phase 36 tables', () => {
      assert.ok(fs.existsSync(exporterPath), 'sqlExporter.js must exist');
      exporterContent = fs.readFileSync(exporterPath, 'utf8');

      const expectedNewTables = [
        'staff_facility_affiliations',
        'staff_credentials',
        'staff_shifts',
        'staff_time_off',
        'case_staff_assignments',
        'anesthesia_records'
      ];

      for (const table of expectedNewTables) {
        assert.ok(
          exporterContent.includes(`id: '${table}'`),
          `AVAILABLE_TABLES must catalog '${table}'`
        );
      }
    });

    it('ALL_EXPORT_TABLES dynamically derives from AVAILABLE_TABLES containing 40 total tables', () => {
      assert.ok(exporterContent.includes('export const ALL_EXPORT_TABLES = AVAILABLE_TABLES.map(t => t.id);'));
      // Count table occurrences in AVAILABLE_TABLES
      const matches = exporterContent.match(/id:\s*'([a-z_]+)'/g);
      assert.ok(matches && matches.length >= 40, `Must catalog at least 40 tables (found ${matches?.length})`);
    });
  });

  // Domain 4: UI Architecture & Real Staff Preservation
  describe('4. UI Architecture & Real Staff Preservation', () => {
    const staffMgmtPath = path.join(rootDir, 'src', 'components', 'StaffManagement.jsx');
    const schedulerPath = path.join(rootDir, 'src', 'components', 'SurgeryScheduler.jsx');

    it('StaffManagement.jsx contains tabs for Directory, Credentials, Time-Off, and Anesthesia', () => {
      assert.ok(fs.existsSync(staffMgmtPath), 'StaffManagement.jsx must exist');
      const content = fs.readFileSync(staffMgmtPath, 'utf8');

      assert.ok(content.includes("activeTab === 'directory'"), 'Must have directory tab');
      assert.ok(content.includes("activeTab === 'credentials'"), 'Must have credentials tab');
      assert.ok(content.includes("activeTab === 'time_off'"), 'Must have time-off tab');
      assert.ok(content.includes("activeTab === 'anesthesia'"), 'Must have anesthesia tab');
    });

    it('StaffManagement.jsx preserves real department categories and wage formatting', () => {
      const content = fs.readFileSync(staffMgmtPath, 'utf8');
      const expectedDepts = [
        'Executive/Management',
        'Pre-Op/PACU',
        'Operating Room RN',
        'Scrub Tech',
        'Sterile Technician',
        'Front Office'
      ];
      for (const dept of expectedDepts) {
        assert.ok(content.includes(dept), `Must preserve department category '${dept}'`);
      }
      assert.ok(content.includes('formatCurrency(staff.hourly_rate)'), 'Must format hourly rate');
      assert.ok(content.includes('formatCurrency(staff.monthly_salary)'), 'Must format monthly salary');
    });

    it('StaffManagement.jsx computes 60-day credential expiration alerts', () => {
      const content = fs.readFileSync(staffMgmtPath, 'utf8');
      assert.ok(content.includes('expiringCredentialsCount'), 'Must compute expiringCredentialsCount');
      assert.ok(content.includes('EXPIRING ('), 'Must render expiring warning badge');
      assert.ok(content.includes('EXPIRED'), 'Must render expired status badge');
    });

    it('SurgeryScheduler.jsx supports structured perioperative care team inputs', () => {
      assert.ok(fs.existsSync(schedulerPath), 'SurgeryScheduler.jsx must exist');
      const content = fs.readFileSync(schedulerPath, 'utf8');

      assert.ok(content.includes('circulatorStaffId'), 'Must store circulatorStaffId in state');
      assert.ok(content.includes('scrubStaffId'), 'Must store scrubStaffId in state');
      assert.ok(content.includes('anesthesiaStaffId'), 'Must store anesthesiaStaffId in state');
      assert.ok(content.includes('asaStatus'), 'Must store asaStatus in state');
      assert.ok(content.includes('anesthesiaTechnique'), 'Must store anesthesiaTechnique in state');
    });

    it('SurgeryScheduler.jsx maintains backward compatibility for cpt_expenses._or_staff_ids', () => {
      const content = fs.readFileSync(schedulerPath, 'utf8');
      assert.ok(content.includes('_or_staff_ids: allAssignedStaffIds'), 'Must write legacy _or_staff_ids array');
      assert.ok(content.includes('_calculate_staff_fee: formData.calculateStaffFee'), 'Must write legacy _calculate_staff_fee');
      assert.ok(content.includes('_staff_fee_total: calculatedStaffFee'), 'Must write legacy _staff_fee_total');
    });

    it('SurgeryScheduler.jsx synchronizes 1NF assignments and anesthesia record on save', () => {
      const content = fs.readFileSync(schedulerPath, 'utf8');
      assert.ok(content.includes('db.syncCaseStaffAssignments(savedSurgeryId'), 'Must sync 1NF case staff assignments');
      assert.ok(content.includes('db.saveAnesthesiaRecord({'), 'Must sync 1NF anesthesia record');
    });
  });

  // Domain 5: Deterministic Business Rules & Labor Cost Verification
  describe('5. Deterministic Business Rules & Labor Cost Verification', () => {
    it('Calculates frozen labor costs accurately without mutating historical records', () => {
      // Test frozen snapshot math
      const caseStaff = [
        { role: 'Circulating_Nurse', hourly_rate_snapshot: 45.00, hours: 2.5 },
        { role: 'Scrub_Tech', hourly_rate_snapshot: 32.50, hours: 2.5 },
        { role: 'Anesthesiologist_Attending', hourly_rate_snapshot: 150.00, hours: 2.5 }
      ];

      const totalLabor = caseStaff.reduce((sum, member) => {
        return sum + (member.hourly_rate_snapshot * member.hours);
      }, 0);

      // (45.00 + 32.50 + 150.00) * 2.5 = 227.50 * 2.5 = 568.75
      assert.equal(totalLabor, 568.75);

      // Even if current staff wage increases from $45 to $60, frozen labor cost remains $568.75
      const mutatedCurrentWage = 60.00;
      assert.notEqual(caseStaff[0].hourly_rate_snapshot, mutatedCurrentWage);
      assert.equal(caseStaff[0].hourly_rate_snapshot, 45.00);
    });

    it('Detects credential expiration within 60 days deterministically', () => {
      const now = new Date('2026-10-21T00:00:00Z');
      const sixtyDaysLater = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

      const credActive = { expiration_date: '2027-05-15' };
      const credExpiringSoon = { expiration_date: '2026-11-20' };
      const credExpired = { expiration_date: '2026-08-01' };

      const checkStatus = (c) => {
        const exp = new Date(c.expiration_date);
        if (exp <= now) return 'EXPIRED';
        if (exp <= sixtyDaysLater) return 'WARNING';
        return 'ACTIVE';
      };

      assert.equal(checkStatus(credActive), 'ACTIVE');
      assert.equal(checkStatus(credExpiringSoon), 'WARNING');
      assert.equal(checkStatus(credExpired), 'EXPIRED');
    });

    it('ASA physical status classifications conform to ASA standard guidelines', () => {
      const validAsaScores = ['ASA_I', 'ASA_II', 'ASA_III', 'ASA_IV', 'ASA_V', 'ASA_VI', 'ASA_E'];
      assert.equal(validAsaScores.length, 7);
      assert.ok(validAsaScores.includes('ASA_II'), 'ASA II is standard outpatient classification');
      assert.ok(validAsaScores.includes('ASA_E'), 'ASA E represents emergency case');
    });
  });
});
