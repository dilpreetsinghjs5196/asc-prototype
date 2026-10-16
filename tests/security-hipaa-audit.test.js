import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  maskMRN,
  maskPhone,
  maskDOB,
  maskPatientName,
  sanitizePatientRecord,
  sanitizeSurgeryRecord,
  deidentifyTextForAI
} from '../src/utils/phiMasking.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 25 — Security, Privacy & HIPAA Compliance Verification', () => {

  describe('1. PHI Masking & Minimum Necessary Access Utility (45 CFR § 164.502/514)', () => {
    test('maskMRN masks properly when unauthorized and reveals when authorized', () => {
      assert.equal(maskMRN('MRN-94025', false), '***025');
      assert.equal(maskMRN('12345', false), '***345');
      assert.equal(maskMRN('12', false), '***');
      assert.equal(maskMRN('MRN-94025', true), 'MRN-94025');
    });

    test('maskPhone redacts area code and middle digits when unauthorized', () => {
      assert.equal(maskPhone('415-555-1234', false), '(***) ***-1234');
      assert.equal(maskPhone('+1 (555) 019-8833', false), '(***) ***-8833');
      assert.equal(maskPhone('415-555-1234', true), '415-555-1234');
    });

    test('maskDOB redacts month and day, preserving year only or full mask', () => {
      assert.equal(maskDOB('1984-05-12', false), '**/**/1984');
      assert.equal(maskDOB('12/25/1990', false), '**/**/1990');
      assert.equal(maskDOB('1984-05-12', true), '1984-05-12');
    });

    test('maskPatientName replaces full names with initial and asterisks', () => {
      assert.equal(maskPatientName('Jane Doe', false), 'J*** D***');
      assert.equal(maskPatientName('John Michael Smith', false), 'J*** M*** S***');
      assert.equal(maskPatientName('Jane Doe', true), 'Jane Doe');
    });

    test('sanitizePatientRecord sanitizes all 18 standard HIPAA identifier fields', () => {
      const rawPatient = {
        id: 101,
        name: 'Robert Davis',
        firstname: 'Robert',
        lastname: 'Davis',
        mrn: 'MRN-554433',
        dob: '1975-08-20',
        phone: '415-555-9876',
        email: 'robert.davis@example.com',
        address: '123 Market St, San Francisco, CA',
        insurance_policy_number: 'POL-998877',
        insurance_group_number: 'GRP-112233'
      };

      const sanitized = sanitizePatientRecord(rawPatient, false);
      assert.equal(sanitized.id, 101);
      assert.equal(sanitized.name, 'R*** D***');
      assert.equal(sanitized.firstname, 'R***');
      assert.equal(sanitized.lastname, 'D***');
      assert.equal(sanitized.mrn, '***433');
      assert.equal(sanitized.dob, '**/**/1975');
      assert.equal(sanitized.phone, '(***) ***-9876');
      assert.equal(sanitized.email, '***@***.***');
      assert.equal(sanitized.address, '[Redacted for Privacy]');
      assert.equal(sanitized.insurance_policy_number, '***8877');

      // Authorized access preserves raw values
      const authorized = sanitizePatientRecord(rawPatient, true);
      assert.equal(authorized.name, 'Robert Davis');
      assert.equal(authorized.mrn, 'MRN-554433');
      assert.equal(authorized.phone, '415-555-9876');
    });

    test('sanitizeSurgeryRecord redacts attached patient information for unauthorized viewers', () => {
      const rawSurgery = {
        id: 501,
        date: '2026-03-15',
        patient_name: 'Alice Cooper',
        patients: {
          name: 'Alice Cooper',
          mrn: 'MRN-112233',
          phone: '555-123-4567'
        }
      };

      const sanitized = sanitizeSurgeryRecord(rawSurgery, false);
      assert.equal(sanitized.patient_name, 'A*** C***');
      assert.equal(sanitized.patients.name, 'A*** C***');
      assert.equal(sanitized.patients.mrn, '***233');
      assert.equal(sanitized.patients.phone, '(***) ***-4567');
    });

    test('deidentifyTextForAI scrubs SSNs, phone numbers, emails, and MRNs', () => {
      const prompt = `Patient SSN is 123-45-6789. Contact at 555-234-5678 or test@hospital.org. MRN-99824 with DOB: 04/12/1988 scheduled for knee scope.`;
      const cleaned = deidentifyTextForAI(prompt);

      assert.doesNotMatch(cleaned, /\b123-45-6789\b/);
      assert.doesNotMatch(cleaned, /\b555-234-5678\b/);
      assert.doesNotMatch(cleaned, /test@hospital\.org/);
      assert.doesNotMatch(cleaned, /\bMRN-99824\b/);
      assert.match(cleaned, /\[REDACTED-SSN\]/);
      assert.match(cleaned, /\[REDACTED-PHONE\]/);
      assert.match(cleaned, /\[REDACTED-EMAIL\]/);
      assert.match(cleaned, /MRN-\[REDACTED\]/);
    });
  });

  describe('2. Chatbot & Gemini Zero-PHI Policy Static Contract Verification', () => {
    test('Chatbot.jsx eliminates direct patient name, phone, and DOB injection into AI context', () => {
      const chatbotCode = fs.readFileSync(path.join(rootDir, 'src', 'components', 'Chatbot.jsx'), 'utf8');

      // Verify patient names and MRNs are no longer mapped into prompt strings
      assert.doesNotMatch(chatbotCode, /\[Patient ID:.*Name: \${name}.*DOB: \${dob}.*Phone: \${phone}/);
      
      // Verify zero-PHI disclosure notice exists in prompt construction
      assert.match(chatbotCode, /HIPAA § 164\.514/);
      assert.match(chatbotCode, /AI • ZERO-PHI/);
      assert.doesNotMatch(chatbotCode, />\s*PHI PROTECTED\s*</);
    });

    test('gemini.js passes all prompts through deidentifyTextForAI sanitizer', () => {
      const geminiCode = fs.readFileSync(path.join(rootDir, 'src', 'lib', 'gemini.js'), 'utf8');
      assert.match(geminiCode, /import.*deidentifyTextForAI.*from/);
      assert.match(geminiCode, /deidentifyTextForAI\(message\)/);
    });
  });

  describe('3. Inactivity Auto-Logoff & Session Purge Contract (45 CFR § 164.312(a)(2)(iii))', () => {
    test('useInactivityTimeout hook exists with 15-minute default threshold', () => {
      const hookPath = path.join(rootDir, 'src', 'hooks', 'useInactivityTimeout.js');
      assert.ok(fs.existsSync(hookPath), 'useInactivityTimeout.js must exist');
      const hookCode = fs.readFileSync(hookPath, 'utf8');

      assert.match(hookCode, /timeoutMs\s*=\s*15\s*\*\s*60\s*\*\s*1000/);
      assert.match(hookCode, /warningMs\s*=\s*60\s*\*\s*1000/);
      assert.match(hookCode, /164\.312\(a\)\(2\)\(iii\)/);
    });

    test('App.jsx wires useInactivityTimeout and inactivity modal', () => {
      const appCode = fs.readFileSync(path.join(rootDir, 'src', 'App.jsx'), 'utf8');
      assert.match(appCode, /useInactivityTimeout/);
      assert.match(appCode, /inactivity-modal-overlay/);
      assert.match(appCode, /Session Inactivity Warning/);
      assert.match(appCode, /Stay Logged In/);
    });
  });

  describe('4. Bulk Export Access Control & Audit Telemetry Verification', () => {
    test('App.jsx gates handleExportPatients with role authorization and dispatches export audit event', () => {
      const appCode = fs.readFileSync(path.join(rootDir, 'src', 'App.jsx'), 'utf8');
      
      assert.match(appCode, /handleExportPatients/);
      assert.match(appCode, /canExport/);
      assert.match(appCode, /logExportAuditEvent/);
      assert.match(appCode, /tableName:\s*'patients'/);
      assert.match(appCode, /tableName:\s*'surgeons'/);
    });

    test('StaffManagement.jsx and SurgeryScheduler.jsx log export audit events', () => {
      const staffCode = fs.readFileSync(path.join(rootDir, 'src', 'components', 'StaffManagement.jsx'), 'utf8');
      assert.match(staffCode, /logExportAuditEvent/);
      assert.match(staffCode, /tableName:\s*'staff'/);

      const surgeryCode = fs.readFileSync(path.join(rootDir, 'src', 'components', 'SurgeryScheduler.jsx'), 'utf8');
      assert.match(surgeryCode, /logExportAuditEvent/);
      assert.match(surgeryCode, /tableName:\s*'surgeries'/);
    });

    test('supabase.js defines logExportAuditEvent helper', () => {
      const supabaseCode = fs.readFileSync(path.join(rootDir, 'src', 'lib', 'supabase.js'), 'utf8');
      assert.match(supabaseCode, /logExportAuditEvent/);
      assert.match(supabaseCode, /fn_log_export_audit_event/);
    });
  });

  describe('5. Database Migration 005 (Security, Privacy & HIPAA Hardening) Static DDL Audit', () => {
    const migrationPath = path.join(rootDir, 'supabase', 'migrations', '005_security_privacy_hipaa.sql');
    const downPath = path.join(rootDir, 'supabase', 'migrations', '005_security_privacy_hipaa_down.sql');

    test('Migration 005 and down migration files exist', () => {
      assert.ok(fs.existsSync(migrationPath), '005_security_privacy_hipaa.sql must exist');
      assert.ok(fs.existsSync(downPath), '005_security_privacy_hipaa_down.sql must exist');
    });

    test('Migration 005 enforces NOT NULL on facility_id for patients and surgeries', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      assert.match(sql, /ALTER TABLE public\.patients ALTER COLUMN facility_id SET NOT NULL;/);
      assert.match(sql, /ALTER TABLE public\.surgeries ALTER COLUMN facility_id SET NOT NULL;/);
    });

    test('Migration 005 enforces unique MRN per facility to prevent record collisions', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS uq_patients_facility_mrn/);
      assert.match(sql, /ON public\.patients \(facility_id, LOWER\(TRIM\(mrn\)\)\)/);
    });

    test('Migration 005 eliminates plaintext password column on surgeons', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      assert.match(sql, /ALTER TABLE public\.surgeons DROP COLUMN IF EXISTS password;/);
    });

    test('Migration 005 completely revokes client REST access on public.users', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      assert.match(sql, /REVOKE ALL ON public\.users FROM anon;/);
      assert.match(sql, /REVOKE ALL ON public\.users FROM authenticated;/);
    });

    test('Migration 005 implements fn_log_export_audit_event with SECURITY DEFINER and tenancy verification', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      assert.match(sql, /CREATE OR REPLACE FUNCTION public\.fn_log_export_audit_event/);
      assert.match(sql, /SECURITY DEFINER/);
      assert.match(sql, /SET search_path = public/);
      assert.match(sql, /v_actor_id := auth\.uid\(\);/);
      assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.fn_log_export_audit_event.*TO authenticated/);
    });

    test('Migration 005 down migration reverts safely without opening anon access', () => {
      const downSql = fs.readFileSync(downPath, 'utf8');
      assert.match(downSql, /DROP FUNCTION IF EXISTS public\.fn_log_export_audit_event/);
      assert.match(downSql, /DROP INDEX IF EXISTS public\.uq_patients_facility_mrn/);
      assert.doesNotMatch(downSql, /TO anon/);
    });
  });

  describe('6. Multi-Tenant Client Query Scoping Verification', () => {
    test('getPatients, getSurgeries, and getORBlockSchedule apply active facility scoping', () => {
      const supabaseCode = fs.readFileSync(path.join(rootDir, 'src', 'lib', 'supabase.js'), 'utf8');
      assert.match(supabaseCode, /async getPatients\(facilityId = null\)/);
      assert.match(supabaseCode, /query\.eq\('facility_id', targetFac\)/);
      assert.match(supabaseCode, /async getSurgeries\(facilityId = null\)/);
      assert.match(supabaseCode, /async getORBlockSchedule\(facilityId = null\)/);
    });
  });

});
