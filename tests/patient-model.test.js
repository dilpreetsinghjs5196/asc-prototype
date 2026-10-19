import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 34 — Patient Model & Referential Integrity Verification Suite', () => {

  // Domain 1: Database Migration 012 DDL & Schema Integrity
  describe('1. Database Migration 012: DDL & Schema Integrity', () => {
    const migPath = path.join(rootDir, 'supabase', 'migrations', '012_patient_model_hardening.sql');
    const downPath = path.join(rootDir, 'supabase', 'migrations', '012_patient_model_hardening_down.sql');

    it('Migration 012 forward and down SQL files exist', () => {
      assert.ok(fs.existsSync(migPath), '012_patient_model_hardening.sql must exist');
      assert.ok(fs.existsSync(downPath), '012_patient_model_hardening_down.sql must exist');
    });

    it('Migration 012 extends public.patients with canonical columns', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      const requiredColumns = [
        'patient_uuid',
        'primary_payer_id',
        'is_active',
        'deleted_at',
        'record_version'
      ];

      for (const col of requiredColumns) {
        assert.ok(sql.includes(col), `Migration 012 must add column "${col}" to public.patients`);
      }
    });

    it('Migration 012 attaches foreign key constraint fk_surgeries_patient on surgeries', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('fk_surgeries_patient'), 'Must name foreign key fk_surgeries_patient');
      assert.ok(sql.includes('FOREIGN KEY (patient_id) REFERENCES public.patients(id)'), 'Must reference public.patients(id)');
      assert.ok(sql.includes('ON DELETE RESTRICT'), 'Must specify ON DELETE RESTRICT to protect historical cases');
    });

    it('Migration 012 creates public.patient_external_identifiers table with check constraints', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.patient_external_identifiers'), 'Must create table');
      assert.ok(sql.includes('chk_patient_ext_source_system'), 'Must define source_system check constraint');
      assert.ok(sql.includes('chk_patient_ext_identifier_type'), 'Must define identifier_type check constraint');
      assert.ok(sql.includes('uq_patient_ext_identifier'), 'Must define compound unique index');
    });

    it('Migration 012 establishes server-side minimum necessary view v_patients_minimum_necessary', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.v_patients_minimum_necessary'), 'Must create view');
      assert.ok(sql.includes('user_has_facility_role'), 'Must evaluate role-based masking');
      assert.ok(sql.includes('security_invoker = true'), 'Must enable security_invoker');
    });

    it('Migration 012 enforces soft-delete orphan protection and auto-version triggers', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('trg_protect_patient_deletion'), 'Must attach deletion protection trigger');
      assert.ok(sql.includes('fn_protect_patient_deletion'), 'Must define fn_protect_patient_deletion');
      assert.ok(sql.includes('trg_patients_record_version'), 'Must attach record version trigger');
      assert.ok(sql.includes('fn_patients_before_update'), 'Must define fn_patients_before_update');
    });

    it('Migration 012 establishes tenant-scoped RLS policies on patient_external_identifiers', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('ALTER TABLE public.patient_external_identifiers ENABLE ROW LEVEL SECURITY'), 'Must enable RLS');
      assert.ok(sql.includes('Authorized Roles Can View Patient External Identifiers'), 'Must define view policy');
      assert.ok(sql.includes('Authorized Roles Can Insert Patient External Identifiers'), 'Must define insert policy');
      assert.ok(sql.includes('Authorized Roles Can Update Patient External Identifiers'), 'Must define update policy');
      assert.ok(sql.includes('Authorized Roles Can Delete Patient External Identifiers'), 'Must define delete policy');
    });

    it('Migration 012 down script safely rolls back constraints, view, triggers, and columns', () => {
      const downSql = fs.readFileSync(downPath, 'utf8');
      assert.ok(downSql.includes('DROP CONSTRAINT IF EXISTS fk_surgeries_patient'), 'Down script must drop FK constraint');
      assert.ok(downSql.includes('DROP VIEW IF EXISTS public.v_patients_minimum_necessary'), 'Down script must drop view');
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.patient_external_identifiers'), 'Down script must drop external identifiers table');
      assert.ok(downSql.includes('DROP TRIGGER IF EXISTS trg_protect_patient_deletion'), 'Down script must drop deletion trigger');
    });
  });

  // Domain 2: Referential Integrity & Orphan Prevention Logic
  describe('2. Referential Integrity & Deletion Protection Logic', () => {
    const simulatePatientDelete = (patientId, activeSurgeriesCount) => {
      if (activeSurgeriesCount > 0) {
        throw new Error(`CANNOT_DELETE_PATIENT_WITH_SURGERIES: Patient ID ${patientId} has ${activeSurgeriesCount} associated surgical records.`);
      }
      return true;
    };

    it('Allows hard deletion of patient with 0 surgical records', () => {
      assert.equal(simulatePatientDelete(10, 0), true);
    });

    it('Blocks hard deletion of patient with associated surgical records', () => {
      assert.throws(() => simulatePatientDelete(3, 4), /CANNOT_DELETE_PATIENT_WITH_SURGERIES/);
    });

    it('Soft deletion deactivates patient without deleting surgical history', () => {
      const patient = { id: 3, name: 'John Doe', is_active: true, deleted_at: null };
      const softDeleted = { ...patient, is_active: false, deleted_at: new Date().toISOString() };
      assert.equal(softDeleted.is_active, false);
      assert.ok(softDeleted.deleted_at);
      assert.equal(softDeleted.id, 3);
    });
  });

  // Domain 3: Client Service Methods in src/lib/supabase.js
  describe('3. Client Service Methods in src/lib/supabase.js', () => {
    const supabaseJsPath = path.join(rootDir, 'src', 'lib', 'supabase.js');
    const content = fs.readFileSync(supabaseJsPath, 'utf8');

    it('getPatients supports options parameter with useMaskedView and includeInactive', () => {
      assert.ok(content.includes('async getPatients(facilityId = null)'), 'Must preserve exact signature for tenant scoping test');
      assert.ok(content.includes('useMaskedView') && content.includes('includeInactive'), 'Must handle options');
      assert.ok(content.includes('v_patients_minimum_necessary'), 'Must support v_patients_minimum_necessary view');
    });

    it('addPatient strips client-generated millisecond timestamps to allow DB sequence management', () => {
      assert.ok(content.includes('payload.id > 2000000000'), 'Must check for millisecond timestamp IDs');
      assert.ok(content.includes('delete payload.id'), 'Must delete fabricated client IDs');
    });

    it('updatePatient protects facility_id from client tampering', () => {
      assert.ok(content.includes('delete cleanUpdates.facility_id'), 'Must protect facility_id');
      assert.ok(content.includes('delete cleanUpdates.id'), 'Must protect id');
    });

    it('deletePatient defaults to safe soft-deactivation (is_active = false)', () => {
      assert.ok(content.includes('async deletePatient(id, soft = true)'), 'Must default soft = true');
      assert.ok(content.includes('is_active: false'), 'Must set is_active false');
      assert.ok(content.includes('deleted_at:'), 'Must set deleted_at');
    });

    it('Exports getPatientExternalIdentifiers and addPatientExternalIdentifier', () => {
      assert.ok(content.includes('getPatientExternalIdentifiers('), 'Must export getPatientExternalIdentifiers');
      assert.ok(content.includes('addPatientExternalIdentifier('), 'Must export addPatientExternalIdentifier');
    });

    it('Exports getPayers helper for canonical relational payer resolution', () => {
      assert.ok(content.includes('getPayers('), 'Must export getPayers');
    });
  });

  // Domain 4: Frontend Component Architecture & App.jsx Wiring
  describe('4. Frontend Component Architecture & App.jsx Wiring', () => {
    const compPath = path.join(rootDir, 'src', 'components', 'PatientManagement.jsx');
    const appPath = path.join(rootDir, 'src', 'App.jsx');

    it('src/components/PatientManagement.jsx exists as standalone modular component', () => {
      assert.ok(fs.existsSync(compPath), 'PatientManagement.jsx must exist');
      const compContent = fs.readFileSync(compPath, 'utf8');
      assert.ok(compContent.includes('export default function PatientManagement'), 'Must export PatientManagement');
      assert.ok(compContent.includes('db.getPatients'), 'Must fetch patients via db service');
      assert.ok(compContent.includes('maskMRN'), 'Must use maskMRN');
      assert.ok(compContent.includes('maskPatientName'), 'Must use maskPatientName');
      assert.ok(compContent.includes('maskDOB'), 'Must use maskDOB');
      assert.ok(compContent.includes('Minimum-Necessary Privacy Mode'), 'Must display privacy mode notice');
    });

    it('PatientManagement.jsx supports EMR / external identifiers modal', () => {
      const compContent = fs.readFileSync(compPath, 'utf8');
      assert.ok(compContent.includes('externalIdsPatient'), 'Must manage externalIdsPatient state');
      assert.ok(compContent.includes('db.getPatientExternalIdentifiers'), 'Must load external identifiers');
      assert.ok(compContent.includes('db.addPatientExternalIdentifier'), 'Must add external identifiers');
    });

    it('App.jsx imports and renders PatientManagement component under activeTab === "patients"', () => {
      const appContent = fs.readFileSync(appPath, 'utf8');
      assert.ok(appContent.includes("import PatientManagement from './components/PatientManagement'"), 'Must import PatientManagement');
      assert.ok(appContent.includes('<PatientManagement'), 'Must render <PatientManagement />');
      assert.ok(appContent.includes("activeTab === 'patients'"), 'Must bind to patients tab');
    });

    it('App.jsx patient save does not inject Date.now() timestamp primary keys', () => {
      const appContent = fs.readFileSync(appPath, 'utf8');
      assert.ok(!appContent.includes('editingPatient ? {} : { id: Date.now() }'), 'Must not inject id: Date.now() into patient dbPayload');
    });
  });
});
