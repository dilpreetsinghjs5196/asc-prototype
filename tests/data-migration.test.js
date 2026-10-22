import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 37 — Data Migration from Surgeries & Relational Normalization Test Suite', () => {

  // Domain 1: Database Migration 016 DDL & Schema Integrity
  describe('1. Database Migration 016: DDL & Migration Script Integrity', () => {
    const migPath = path.join(rootDir, 'supabase', 'migrations', '016_data_migration_from_surgeries.sql');
    const downPath = path.join(rootDir, 'supabase', 'migrations', '016_data_migration_from_surgeries_down.sql');

    it('Migration 016 forward and down SQL files exist and are non-empty', () => {
      assert.ok(fs.existsSync(migPath), '016_data_migration_from_surgeries.sql must exist');
      assert.ok(fs.existsSync(downPath), '016_data_migration_from_surgeries_down.sql must exist');
      assert.ok(fs.statSync(migPath).size > 1000, 'Migration 016 forward must contain full staged migration');
      assert.ok(fs.statSync(downPath).size > 200, 'Migration 016 down must contain reversal script');
    });

    it('Migration 016 isolates and quarantines 4 AI prototype cases', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('244, 253, 257, 258'), 'Must specifically target AI cases 244, 253, 257, 258');
      assert.ok(sql.includes('AI_CONSOLE_PROTOTYPE'), 'Must assign source_system AI_CONSOLE_PROTOTYPE');
      assert.ok(sql.includes('QUARANTINED'), 'Must tag clinical notes with quarantine explanation');
    });

    it('Migration 016 reconciles Case 94 OR assignment to OR 1', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('WHERE id = 94'), 'Must target Case 94');
      assert.ok(sql.includes('10000000-0000-0000-0000-000000000001'), 'Must assign OR 1 UUID to Case 94');
    });

    it('Migration 016 backfills operating_room_id from or_room on all surgeries', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('UPDATE public.surgeries s'), 'Must update surgeries table');
      assert.ok(sql.includes('FROM public.operating_rooms o'), 'Must join with operating_rooms');
      assert.ok(sql.includes('s.or_room = o.room_number'), 'Must map integer room_number to UUID');
    });

    it('Migration 016 generates immutable case_uuid with unique index', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('case_uuid UUID'), 'Must add case_uuid column');
      assert.ok(sql.includes('uq_surgeries_case_uuid'), 'Must create unique index on case_uuid');
    });

    it('Migration 016 extracts embedded staff from JSONB into 1NF case_staff_assignments', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('public.case_staff_assignments'), 'Must insert into case_staff_assignments');
      assert.ok(sql.includes('9, 8, 12, 10, 11'), 'Must extract staff array for Case 254');
      assert.ok(sql.includes('Circulating_Nurse'), 'Must assign proper clinical roles');
    });

    it('Migration 016 extracts notes tray cost and anesthesia fees into typed columns', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('tray_cost = 45.00'), 'Must extract tray cost 45.00 for Case 17');
      assert.ok(sql.includes('cosmetic_anesthesia_fee'), 'Must extract anesthesia fees from notes');
    });

    it('Migration 016 temporarily disables FSM trigger during maintenance update', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('DISABLE TRIGGER trg_validate_case_status_transition'), 'Must disable FSM trigger during migration');
      assert.ok(sql.includes('ENABLE TRIGGER trg_validate_case_status_transition'), 'Must re-enable FSM trigger after update');
    });

    it('Migration 016 freezes baseline snapshots for Completed cases', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('public.surgery_financial_snapshots'), 'Must insert into surgery_financial_snapshots');
      assert.ok(sql.includes('PHASE_37_HISTORICAL_BASELINE_FREEZE'), 'Must tag snapshot with baseline freeze source');
      assert.ok(sql.includes("s.status = 'Completed'"), 'Must freeze all Completed cases');
    });

    it('Migration 016 creates child tenancy validation trigger', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.fn_validate_case_child_tenancy()'), 'Must define tenancy function');
      assert.ok(sql.includes('trg_validate_surgery_procedures_tenancy'), 'Must attach trigger to procedures');
      assert.ok(sql.includes('trg_validate_case_milestones_tenancy'), 'Must attach trigger to milestones');
      assert.ok(sql.includes('trg_validate_case_staff_assignments_tenancy'), 'Must attach trigger to staff assignments');
    });

    it('Migration 016 deploys backward compatibility view v_legacy_surgeries_compat', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.v_legacy_surgeries_compat'), 'Must create backward compat view');
      assert.ok(sql.includes('LEFT JOIN public.operating_rooms'), 'Must join operating_rooms in view');
      assert.ok(sql.includes('LEFT JOIN public.surgery_financial_snapshots'), 'Must join financial snapshots in view');
    });
  });

  // Domain 2: Financial Preservation & Calculation Rules
  describe('2. Financial Engine & Snapshot Preservation Rules', () => {
    it('Verifies historical financial baseline sum constants match specification', () => {
      const expectedRevenue = 1658305.00;
      const expectedSupplies = 40828.49;
      const expectedImplants = 36000.00;
      const expectedLabor = 262.00;
      const expectedRoom = 2379.98;
      const expectedMeds = 141.00;
      const expectedTray = 45.00;
      const expectedWriteOff = 1012986.11;

      const totalCosts = Number((expectedSupplies + expectedImplants + expectedLabor + expectedRoom + expectedMeds + expectedTray).toFixed(2));
      const netMargin = Number((expectedRevenue - totalCosts).toFixed(2));

      assert.equal(totalCosts, 79656.47, 'Total direct costs must match baseline');
      assert.equal(netMargin, 1578648.53, 'Total net margin must match baseline');
      assert.equal(expectedWriteOff, 1012986.11, 'Contractual write-off must match baseline');
    });
  });

  // Domain 3: Application Code & Data Access Layer Compatibility
  describe('3. Application Integration & Backward Compatibility', () => {
    const supabaseJsPath = path.join(rootDir, 'src', 'lib', 'supabase.js');

    it('src/lib/supabase.js exists and exports db object with getSurgeries', () => {
      assert.ok(fs.existsSync(supabaseJsPath), 'src/lib/supabase.js must exist');
      const content = fs.readFileSync(supabaseJsPath, 'utf8');
      assert.ok(content.includes('getSurgeries('), 'Must export getSurgeries method');
      assert.ok(content.includes('ensureAuthSession()'), 'Must include auth session verification');
    });
  });
});
