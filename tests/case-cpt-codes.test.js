import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateMedicareRevenue } from '../src/utils/hospitalUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 32 — Case CPT Codes, Modifiers & Coding Lifecycle Verification Suite', () => {

  // Domain 1: Database Migration 010 DDL & Schema Normalization
  describe('1. Database Migration 010: DDL & Schema Integrity', () => {
    const migPath = path.join(rootDir, 'supabase', 'migrations', '010_case_cpt_codes_normalization.sql');
    const downPath = path.join(rootDir, 'supabase', 'migrations', '010_case_cpt_codes_normalization_down.sql');

    it('Migration 010 forward and down SQL files exist', () => {
      assert.ok(fs.existsSync(migPath), '010_case_cpt_codes_normalization.sql must exist');
      assert.ok(fs.existsSync(downPath), '010_case_cpt_codes_normalization_down.sql must exist');
    });

    it('Migration 010 expands public.surgery_procedures with canonical 1NF columns', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      const requiredColumns = [
        'units',
        'modifiers',
        'laterality',
        'is_primary',
        'procedure_description',
        'coding_status',
        'fee_schedule_id',
        'line_gross_charge',
        'line_expected_reimbursement',
        'source_system',
        'source_line_id',
        'coded_by',
        'coded_at',
        'verified_by',
        'verified_at',
        'version'
      ];

      for (const col of requiredColumns) {
        assert.ok(sql.includes(col), `Migration 010 must include column "${col}"`);
      }
    });

    it('Migration 010 enforces constraints on units, laterality, and coding_status', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('chk_surgery_proc_units'), 'Must enforce chk_surgery_proc_units');
      assert.ok(sql.includes('chk_surgery_proc_laterality'), 'Must enforce chk_surgery_proc_laterality');
      assert.ok(sql.includes('chk_surgery_proc_coding_status'), 'Must enforce chk_surgery_proc_coding_status');
    });

    it('Migration 010 includes idempotent backfill from legacy surgeries.cpt_codes', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('public.surgeries s'), 'Must iterate through legacy surgeries');
      assert.ok(sql.includes('public.surgery_procedures'), 'Must insert into surgery_procedures');
    });

    it('Migration 010 updates calculate_surgery_financials RPC for units and bilateral 50', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('calculate_surgery_financials'), 'Must update calculate_surgery_financials RPC');
      assert.ok(sql.includes('v_proc.units') || sql.includes('sp.units'), 'Must account for procedure units in RPC');
      assert.ok(sql.includes('1.50'), 'Must include 150% bilateral multiplier in RPC');
    });

    it('Migration 010 down SQL cleanly rolls back all added schema and constraints', () => {
      const downSql = fs.readFileSync(downPath, 'utf8');
      assert.ok(downSql.includes('DROP CONSTRAINT IF EXISTS chk_surgery_proc_units'), 'Must drop units constraint');
      assert.ok(downSql.includes('DROP CONSTRAINT IF EXISTS chk_surgery_proc_laterality'), 'Must drop laterality constraint');
      assert.ok(downSql.includes('DROP CONSTRAINT IF EXISTS chk_surgery_proc_coding_status'), 'Must drop coding status constraint');
      assert.ok(downSql.includes('DROP COLUMN IF EXISTS units'), 'Must drop units column');
      assert.ok(downSql.includes('DROP COLUMN IF EXISTS modifiers'), 'Must drop modifiers column');
    });
  });

  // Domain 2: Calculation Engine (hospitalUtils.js)
  describe('2. Financial Calculation Engine: Units & Modifiers Normalization', () => {
    const mockCptCatalog = [
      { code: '29881', description: 'Knee arthroscopy/meniscectomy', gross_charge: 11200, reimbursement: 3200 },
      { code: '29877', description: 'Knee debridement/chondroplasty', gross_charge: 6300, reimbursement: 1800 },
      { code: '64415', description: 'Brachial plexus block', gross_charge: 2100, reimbursement: 600 }
    ];

    it('Calculates single procedure revenue correctly with default units = 1', () => {
      const lines = [{ code: '29881', units: 1, modifiers: [], laterality: 'NOT_APPLICABLE' }];
      const total = calculateMedicareRevenue(lines, mockCptCatalog, false);
      assert.strictEqual(total, 3200);
    });

    it('Applies units multiplier correctly across procedure lines', () => {
      const lines = [{ code: '29881', units: 3, modifiers: [], laterality: 'NOT_APPLICABLE' }];
      const total = calculateMedicareRevenue(lines, mockCptCatalog, false);
      assert.strictEqual(total, 3200 * 3);
    });

    it('Applies 150% reimbursement for bilateral Modifier 50', () => {
      const lines = [{ code: '29881', units: 1, modifiers: ['50'], laterality: 'NOT_APPLICABLE' }];
      const total = calculateMedicareRevenue(lines, mockCptCatalog, false);
      assert.strictEqual(total, 3200 * 1.50);
    });

    it('Applies 150% reimbursement when laterality is BILATERAL', () => {
      const lines = [{ code: '29881', units: 1, modifiers: [], laterality: 'BILATERAL' }];
      const total = calculateMedicareRevenue(lines, mockCptCatalog, false);
      assert.strictEqual(total, 3200 * 1.50);
    });

    it('Calculates multi-unit bilateral procedures accurately', () => {
      const lines = [{ code: '29881', units: 2, modifiers: ['50'], laterality: 'BILATERAL' }];
      const total = calculateMedicareRevenue(lines, mockCptCatalog, false);
      assert.strictEqual(total, 3200 * 1.50 * 2);
    });

    it('Maintains 100% backward compatibility when input is array of plain strings', () => {
      const legacyCodes = ['29881', '64415'];
      const total = calculateMedicareRevenue(legacyCodes, mockCptCatalog, false);
      assert.strictEqual(total, 3200 + 600);
    });

    it('Applies MPPR rules correctly to multi-procedure normalized lines', () => {
      const lines = [
        { code: '29881', units: 1, modifiers: [], laterality: 'NOT_APPLICABLE' }, // Highest ($3200) -> 100% = $3200
        { code: '29877', units: 1, modifiers: [], laterality: 'NOT_APPLICABLE' }  // Secondary ($1800) -> 50% = $900
      ];
      const mpprTotal = calculateMedicareRevenue(lines, mockCptCatalog, true);
      assert.strictEqual(mpprTotal, 3200 + (1800 * 0.5));
    });
  });

  // Domain 3: Client Service & Database Synchronization
  describe('3. Database Client & SurgeryScheduler Integration Contract', () => {
    it('supabase.js exports syncSurgeryProcedures and updateProcedureCodingStatus', () => {
      const supabaseJs = fs.readFileSync(path.join(rootDir, 'src', 'lib', 'supabase.js'), 'utf8');
      assert.ok(supabaseJs.includes('syncSurgeryProcedures'), 'supabase.js must define syncSurgeryProcedures');
      assert.ok(supabaseJs.includes('updateProcedureCodingStatus'), 'supabase.js must define updateProcedureCodingStatus');
      assert.ok(supabaseJs.includes('getSurgeryProcedures'), 'supabase.js must define getSurgeryProcedures');
    });

    it('SurgeryScheduler.jsx initializes and synchronizes procedureLines', () => {
      const schedulerJsx = fs.readFileSync(path.join(rootDir, 'src', 'components', 'SurgeryScheduler.jsx'), 'utf8');
      assert.ok(schedulerJsx.includes('procedureLines: []'), 'SurgeryScheduler must declare procedureLines state');
      assert.ok(schedulerJsx.includes('handleProcedureLineChange'), 'SurgeryScheduler must have line item change handler');
      assert.ok(schedulerJsx.includes('handleToggleModifier'), 'SurgeryScheduler must have modifier toggle handler');
      assert.ok(schedulerJsx.includes('handleMoveProcedureRank'), 'SurgeryScheduler must have sequence rank reordering handler');
      assert.ok(schedulerJsx.includes('handleRemoveProcedureLine'), 'SurgeryScheduler must have line removal handler');
    });

    it('SurgeryScheduler.jsx renders Case CPT Procedure Line Items UI', () => {
      const schedulerJsx = fs.readFileSync(path.join(rootDir, 'src', 'components', 'SurgeryScheduler.jsx'), 'utf8');
      assert.ok(schedulerJsx.includes('Case CPT Procedure Line Items (1NF)'), 'UI must render procedure lines header');
      assert.ok(schedulerJsx.includes('availableModifiers = [\'50\', \'51\', \'59\', \'RT\', \'LT\', \'76\', \'78\']'), 'UI must offer standard ASC modifiers');
      assert.ok(schedulerJsx.includes('150% Bilateral'), 'UI must visually indicate 150% bilateral calculation');
    });

    it('SurgeryScheduler.jsx performs dual-write sync in handleSubmit', () => {
      const schedulerJsx = fs.readFileSync(path.join(rootDir, 'src', 'components', 'SurgeryScheduler.jsx'), 'utf8');
      assert.ok(schedulerJsx.includes('db.syncSurgeryProcedures'), 'handleSubmit must sync procedure lines to database');
      assert.ok(schedulerJsx.includes('cpt_codes: formData.selectedCptCodes'), 'handleSubmit must preserve legacy cpt_codes');
    });

    it('App.jsx onSchedule and onUpdate return saved surgery record', () => {
      const appJsx = fs.readFileSync(path.join(rootDir, 'src', 'App.jsx'), 'utf8');
      assert.ok(appJsx.includes('return newSurg;'), 'handleScheduleSurgery must return the created surgery');
      assert.ok(appJsx.includes('return updated;'), 'handleUpdateSurgery must return the updated surgery');
    });
  });

  // Domain 4: Phase 32 Specification Document
  describe('4. Phase 32 Specification Compliance', () => {
    it('32_CASE_CPT_CODES_SPEC.md exists with all required sections', () => {
      const specPath = path.join(rootDir, 'docs', 'phases', '32_CASE_CPT_CODES_SPEC.md');
      assert.ok(fs.existsSync(specPath), '32_CASE_CPT_CODES_SPEC.md must exist in docs/phases');
      const specContent = fs.readFileSync(specPath, 'utf8');
      assert.ok(specContent.includes('# 32 CASE CPT CODES SPEC'), 'Spec must contain title');
      assert.ok(specContent.includes('## Purpose'), 'Spec must contain Purpose section');
      assert.ok(specContent.includes('## Data Model / Schema'), 'Spec must contain Schema section');
      assert.ok(specContent.includes('## Business Rules'), 'Spec must contain Business Rules section');
      assert.ok(specContent.includes('## Migration / Rollback Plan'), 'Spec must contain Migration plan');
      assert.ok(specContent.includes('Bilateral Procedure 50'), 'Spec must describe Bilateral 50 rule');
    });
  });
});
