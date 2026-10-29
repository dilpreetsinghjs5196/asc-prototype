import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateMedicareRevenue } from '../src/utils/hospitalUtils.js';
import { calculateNetProfit } from '../src/services/aiOperations/FinancialEngine.js';
import { medicareRateService, DEFAULT_CBSA } from '../src/lib/medicareRateService.js';
import { PERMISSIONS_CATALOG } from '../src/lib/rbacService.js';
import { db } from '../src/lib/supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 60 — Medicare ASC Base Rate Engine & Geographic Wage Index Suite', () => {

  // ============================================================================
  // DOMAIN 1: DATABASE MIGRATION 036 DDL & SCHEMA INTEGRITY
  // ============================================================================
  describe('1. Database Migration 036: DDL & Schema Integrity', () => {
    const migPath = path.join(rootDir, 'supabase', 'migrations', '036_medicare_asc_base_rate_engine.sql');
    const downPath = path.join(rootDir, 'supabase', 'migrations', '036_medicare_asc_base_rate_engine_down.sql');

    it('Migration 036 forward and down SQL files exist and are substantive', () => {
      assert.ok(fs.existsSync(migPath), '036_medicare_asc_base_rate_engine.sql must exist');
      assert.ok(fs.existsSync(downPath), '036_medicare_asc_base_rate_engine_down.sql must exist');
      assert.ok(fs.statSync(migPath).size > 1000, 'Forward migration must be substantive');
      assert.ok(fs.statSync(downPath).size > 200, 'Down migration must be substantive');
    });

    it('Extends cms_asc_releases with conversion_factor, labor_related_share, and non_labor_share', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('ALTER TABLE public.cms_asc_releases'), 'Must alter cms_asc_releases');
      assert.ok(sql.includes('conversion_factor NUMERIC(10, 4)'), 'Must add conversion_factor');
      assert.ok(sql.includes('labor_related_share NUMERIC(5, 4)'), 'Must add labor_related_share');
      assert.ok(sql.includes('non_labor_share NUMERIC(5, 4)'), 'Must add non_labor_share');
      assert.ok(sql.includes('ascqr_reduction_factor NUMERIC(5, 4)'), 'Must add ascqr_reduction_factor');
    });

    it('Creates public.medicare_wage_indices table with release edition uniqueness', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.medicare_wage_indices'), 'Must create medicare_wage_indices table');
      assert.ok(sql.includes('cbsa_code VARCHAR(5) NOT NULL'), 'Must store CBSA code');
      assert.ok(sql.includes('wage_index NUMERIC(6, 4) NOT NULL'), 'Must store wage index');
      assert.ok(sql.includes('CONSTRAINT uq_cbsa_release UNIQUE (release_id, cbsa_code)'), 'Must enforce unique CBSA per release');
    });

    it('Creates public.facility_medicare_settings table with facility tenancy', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.facility_medicare_settings'), 'Must create facility_medicare_settings table');
      assert.ok(sql.includes('facility_id UUID NOT NULL UNIQUE REFERENCES public.facilities(id)'), 'Must link to facilities with unique constraint');
      assert.ok(sql.includes('medicare_provider_number VARCHAR(10) NOT NULL'), 'Must track Medicare CCN');
      assert.ok(sql.includes('cbsa_code VARCHAR(5) NOT NULL'), 'Must track facility CBSA');
      assert.ok(sql.includes('ascqr_compliant BOOLEAN NOT NULL DEFAULT true'), 'Must track ASCQR quality compliance');
    });

    it('Creates public.medicare_base_rate_calculations immutable ledger and lines breakdown', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.medicare_base_rate_calculations'), 'Must create calculations table');
      assert.ok(sql.includes('calculation_hash VARCHAR(64) NOT NULL'), 'Must store cryptographic calculation hash');
      assert.ok(sql.includes('total_wage_adjusted_baseline NUMERIC(12, 2)'), 'Must store wage-adjusted total');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.medicare_base_rate_calc_lines'), 'Must create calc_lines table');
      assert.ok(sql.includes('service_portion_wage_adjusted NUMERIC(12, 2)'), 'Must store adjusted service portion');
    });

    it('Deploys calculation immutability trigger blocking DELETE operations', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.fn_prevent_medicare_calc_delete()'), 'Must create delete prevention trigger function');
      assert.ok(sql.includes('trg_prevent_medicare_calc_delete'), 'Must attach trigger to calculations table');
    });

    it('Deploys authoritative fn_resolve_medicare_base_rate stored procedure', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.fn_resolve_medicare_base_rate'), 'Must create fn_resolve_medicare_base_rate');
      assert.ok(sql.includes('p_wage_index_override NUMERIC DEFAULT NULL'), 'Must accept wage index override parameter');
      assert.ok(sql.includes('v_srv_adj :='), 'Must compute statutory labor adjustment');
    });

    it('Deploys authoritative fn_calculate_case_medicare_baseline procedure honoring freeze invariant', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.fn_calculate_case_medicare_baseline'), 'Must create case baseline calculator');
      assert.ok(sql.includes("v_status IN ('Completed', 'Billed')"), 'Must respect freeze invariant for completed/billed cases');
    });

    it('Hardens is_facility_accessible with active facility membership verification', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.is_facility_accessible(p_facility_id UUID)'), 'Must replace is_facility_accessible');
      assert.ok(sql.includes('JOIN public.facilities f ON fm.facility_id = f.id'), 'Must verify facility membership join');
      assert.ok(sql.includes('fm.user_id = auth.uid()'), 'Must verify auth.uid() in facility memberships');
    });

    it('Down migration safely drops objects in reverse dependency order', () => {
      const downSql = fs.readFileSync(downPath, 'utf8');
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.medicare_base_rate_calc_lines CASCADE'), 'Must drop calc lines first');
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.medicare_base_rate_calculations CASCADE'), 'Must drop calculations header');
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.facility_medicare_settings CASCADE'), 'Must drop facility settings');
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.medicare_wage_indices CASCADE'), 'Must drop wage indices');
    });
  });

  // ============================================================================
  // DOMAIN 2: DETERMINISTIC 50/50 GEOGRAPHIC WAGE ADJUSTMENT MATH
  // ============================================================================
  describe('2. Deterministic 50/50 Geographic Wage Adjustment Math', () => {
    it('Applies statutory 50% labor / 50% non-labor adjustment for standard surgical procedure (29881)', async () => {
      // National Unadjusted Rate: $1,650.00
      // Wage Index: 0.9412 (Naples CBSA 34940)
      // Labor Share: 50%, Non-Labor Share: 50%
      // Calculation: 1650 * [(0.50 * 0.9412) + 0.50] = 1650 * [0.4706 + 0.50] = 1650 * 0.9706 = $1,601.49
      const result = await medicareRateService.resolveBaseRate({
        dos: '2026-06-15',
        code: '29881',
        wageIndexOverride: 0.9412
      });

      assert.equal(result.code, '29881');
      assert.equal(result.payment_indicator, 'A2');
      assert.equal(result.national_unadjusted_rate, 1650.00);
      assert.equal(result.wage_index_applied, 0.9412);
      assert.equal(result.wage_adjusted_rate, 1601.49);
    });

    it('Protects device portion from wage index adjustment on Device-Intensive procedure (28465)', async () => {
      // National Unadjusted Rate: $4,671.46
      // Payment Indicator: J8, Device Offset: 35% ($1,635.01)
      // Service Portion: $4,671.46 - $1,635.01 = $3,036.45
      // Service Portion Adjusted (0.9412): $3,036.45 * [(0.50 * 0.9412) + 0.50] = $3,036.45 * 0.9706 = $2,947.18
      // Total Geographically Adjusted Rate: $1,635.01 + $2,947.18 = $4,582.19
      const result = await medicareRateService.resolveBaseRate({
        dos: '2026-06-15',
        code: '28465',
        wageIndexOverride: 0.9412
      });

      assert.equal(result.code, '28465');
      assert.equal(result.payment_indicator, 'J8');
      assert.equal(result.is_device_intensive, true);
      assert.equal(result.device_offset_percentage, 0.35);
      assert.equal(result.device_offset_amount, 1635.01);
      assert.equal(result.service_portion_unadjusted, 3036.45);
      assert.equal(result.service_portion_adjusted, 2947.18);
      assert.equal(result.wage_adjusted_rate, 4582.19);
    });

    it('Evaluates Packaged code (12001, PI N1) to $0.00 baseline without error', async () => {
      const result = await medicareRateService.resolveBaseRate({
        dos: '2026-06-15',
        code: '12001',
        wageIndexOverride: 0.9412
      });

      assert.equal(result.code, '12001');
      assert.equal(result.payment_indicator, 'N1');
      assert.equal(result.is_packaged, true);
      assert.equal(result.national_unadjusted_rate, 0.00);
      assert.equal(result.wage_adjusted_rate, 0.00);
      assert.equal(result.coverage_status, 'Packaged');
    });

    it('Fails closed to $0.00 with Non_Covered status for unlisted CPT code', async () => {
      const result = await medicareRateService.resolveBaseRate({
        dos: '2026-06-15',
        code: '99999_UNLISTED_NON_CMS',
        wageIndexOverride: 0.9412
      });

      assert.equal(result.is_covered, false);
      assert.equal(result.coverage_status, 'Non_Covered');
      assert.equal(result.wage_adjusted_rate, 0.00);
      assert.equal(result.payment_indicator, 'N/A');
    });
  });

  // ============================================================================
  // DOMAIN 3: FINANCIAL CONFLATION DEFECT ELIMINATION (ZERO-MOCK POLICY)
  // ============================================================================
  describe('3. Financial Conflation Defect Elimination (Zero-Mock Policy)', () => {
    it('calculateMedicareRevenue strictly prioritizes allowable reimbursement over 350% gross charge', () => {
      // Procedure record with $1,000 allowable reimbursement and $3,500 billed chargemaster gross charge
      const lines = [
        {
          code: '29881',
          units: 1,
          reimbursement: 1000.00,
          gross_charge: 3500.00 // Billed Chargemaster 350% markup
        }
      ];

      // Must evaluate to $1,000 (allowable reimbursement), NEVER $3,500 (gross charge)
      const revenue = calculateMedicareRevenue(lines, [], false);
      assert.equal(revenue, 1000.00, 'Must use allowable reimbursement ($1,000), not gross chargemaster rate ($3,500)');
    });

    it('calculateMedicareRevenue honors wage_adjusted_rate when provided by the engine', () => {
      const lines = [
        {
          code: '29881',
          units: 1,
          wage_adjusted_rate: 1601.49,
          reimbursement: 1650.00,
          gross_charge: 5775.00
        }
      ];

      const revenue = calculateMedicareRevenue(lines, [], false);
      assert.equal(revenue, 1601.49, 'Must prioritize wage_adjusted_rate over standard unadjusted rate and gross charge');
    });

    it('FinancialEngine.calculateNetProfit fails closed to 0.00 when reimbursement is missing (no gross charge / 3.50 division)', () => {
      const result = calculateNetProfit({
        grossCharge: 7000.00,
        reimbursement: null, // Missing reimbursement
        expectedRevenue: null,
        durationMinutes: 60
      });

      // Must NOT synthesize allowable revenue by dividing 7000 / 3.50 = 2000!
      assert.equal(result.resolvedRevenue, 0, 'Must fail-closed to 0 when reimbursement is missing');
      assert.ok(result.netProfit < 0, 'Net profit must be negative direct case costs when no revenue is resolved');
    });

    it('SurgeryScheduler.jsx does not sum gross_charge into reimbursementSum', () => {
      const schedPath = path.join(rootDir, 'src', 'components', 'SurgeryScheduler.jsx');
      const content = fs.readFileSync(schedPath, 'utf8');

      // Assert that line 860 no longer does `reimbursementSum += parseFloat(cpt.gross_charge || 0)`
      assert.ok(!content.includes('reimbursementSum += parseFloat(cpt.gross_charge || 0)'), 'Must not sum gross_charge into reimbursementSum in SurgeryScheduler.jsx');
      assert.ok(content.includes('reimbursementSum += parseFloat(cpt.wage_adjusted_rate ?? cpt.contracted_reimbursement ?? cpt.reimbursement ?? 0)'), 'Must prioritize allowable reimbursement');
    });
  });

  // ============================================================================
  // DOMAIN 4: CLIENT SERVICE LAYER API CONTRACTS
  // ============================================================================
  describe('4. Client Service Layer API Contracts (medicareRateService.js)', () => {
    it('Exports domain constants and singleton instance', () => {
      assert.ok(medicareRateService, 'medicareRateService must be exported');
      assert.ok(DEFAULT_CBSA.code === '34940', 'DEFAULT_CBSA code must be Naples 34940');
      assert.ok(DEFAULT_CBSA.wageIndex === 0.9412, 'DEFAULT_CBSA wageIndex must be 0.9412');
    });

    it('Wires medicareRateService methods onto db singleton', () => {
      assert.ok(typeof db.resolveMedicareBaseRate === 'function', 'db.resolveMedicareBaseRate must be a function');
      assert.ok(typeof db.calculateCaseMedicareBaseline === 'function', 'db.calculateCaseMedicareBaseline must be a function');
      assert.ok(typeof db.getFacilityMedicareSettings === 'function', 'db.getFacilityMedicareSettings must be a function');
      assert.ok(typeof db.getMedicareWageIndices === 'function', 'db.getMedicareWageIndices must be a function');
    });

    it('getFacilityMedicareSettings returns valid Naples configuration', async () => {
      const settings = await medicareRateService.getFacilityMedicareSettings('00000000-0000-0000-0000-000000000002');
      assert.ok(settings.cbsa_code === '34940', 'Must return CBSA 34940');
      assert.equal(settings.ascqr_compliant, true, 'Must report ascqr_compliant = true');
    });

    it('getWageIndices returns list including Naples and National Baseline', async () => {
      const indices = await medicareRateService.getWageIndices(2026);
      assert.ok(Array.isArray(indices) && indices.length >= 3, 'Must return at least 3 wage index entries');
      const naples = indices.find(i => i.cbsa_code === '34940');
      assert.ok(naples, 'Must contain Naples entry');
      assert.equal(naples.wage_index, 0.9412);
    });
  });

  // ============================================================================
  // DOMAIN 5: RBAC PERMISSIONS & SECURITY CATALOG
  // ============================================================================
  describe('5. RBAC Permissions & Security Catalog', () => {
    it('PERMISSIONS_CATALOG includes all 8 granular medicare_rates.* permissions', () => {
      const required = [
        'medicare_rates.view',
        'medicare_rates.import',
        'medicare_rates.validate',
        'medicare_rates.approve',
        'medicare_rates.publish',
        'medicare_rates.calculate',
        'medicare_rates.export',
        'medicare_rates.audit'
      ];

      required.forEach(perm => {
        const found = PERMISSIONS_CATALOG.find(p => p.code === perm);
        assert.ok(found, `Permission ${perm} must be defined in PERMISSIONS_CATALOG`);
      });
    });

    it('Enforces critical risk level on approve and publish permissions', () => {
      const approve = PERMISSIONS_CATALOG.find(p => p.code === 'medicare_rates.approve');
      const publish = PERMISSIONS_CATALOG.find(p => p.code === 'medicare_rates.publish');

      assert.equal(approve?.risk_level, 'critical', 'medicare_rates.approve must be critical');
      assert.equal(publish?.risk_level, 'critical', 'medicare_rates.publish must be critical');
    });
  });

  // ============================================================================
  // DOMAIN 6: UI COMPONENT INTEGRATION & ZERO-PURPLE COMPLIANCE
  // ============================================================================
  describe('6. UI Component Integration & Zero-Purple Compliance', () => {
    it('MedicareRateExplorer.jsx and CSS exist and are populated', () => {
      const jsxPath = path.join(rootDir, 'src', 'components', 'MedicareRateExplorer.jsx');
      const cssPath = path.join(rootDir, 'src', 'components', 'MedicareRateExplorer.css');

      assert.ok(fs.existsSync(jsxPath), 'MedicareRateExplorer.jsx must exist');
      assert.ok(fs.existsSync(cssPath), 'MedicareRateExplorer.css must exist');
    });

    it('CSS strictly obeys Purple Ban (zero banned purple/violet/magenta/fuchsia tokens)', () => {
      const cssPath = path.join(rootDir, 'src', 'components', 'MedicareRateExplorer.css');
      const css = fs.readFileSync(cssPath, 'utf8').toLowerCase();

      const banned = ['#8b5cf6', '#7c3aed', '#6366f1', '#a855f7', '#9333ea', 'purple', 'violet', 'fuchsia', 'magenta'];
      banned.forEach(token => {
        assert.ok(!css.includes(token), `Banned token "${token}" must not appear in MedicareRateExplorer.css`);
      });
    });

    it('App.jsx integrates MedicareRateExplorer in sidebar, header title, and RoleGate tab render', () => {
      const appPath = path.join(rootDir, 'src', 'App.jsx');
      const appContent = fs.readFileSync(appPath, 'utf8');

      assert.ok(appContent.includes("import MedicareRateExplorer from './components/MedicareRateExplorer'"), 'App.jsx must import MedicareRateExplorer');
      assert.ok(appContent.includes("activeTab === 'medicare_rates'"), 'App.jsx must support medicare_rates tab');
      assert.ok(appContent.includes('<MedicareRateExplorer'), 'App.jsx must render MedicareRateExplorer component');
      assert.ok(appContent.includes('Medicare ASC Base Rate Engine & Addenda'), 'App.jsx must display Medicare header title');
    });
  });
});

