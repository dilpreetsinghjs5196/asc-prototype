/**
 * ==============================================================================
 * Phase 72: Case Cost Model & Activity-Based Cost Accounting Test Suite
 * ==============================================================================
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  caseCostModelService,
  COST_CATEGORIES,
  COST_CATEGORY_CONFIG,
  STERILIZATION_METHODS,
  DEFAULT_FACILITY_RATES,
  roundToTwo
} from '../src/lib/caseCostModelService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 72 — Case Cost Model Verification Suite', () => {

  describe('1. Cost Categories Schema & Configurations', () => {
    test('Exports all 8 canonical direct cost categories', () => {
      const expectedCategories = [
        'IMPLANT_COST',
        'SUPPLY_COST',
        'PHARMACY_COST',
        'LABOR_COST',
        'OR_TIME_COST',
        'PACU_TIME_COST',
        'REPROCESSING_COST',
        'EQUIPMENT_COST'
      ];

      expectedCategories.forEach(cat => {
        assert.ok(COST_CATEGORIES[cat], `Cost category ${cat} must be exported`);
        assert.strictEqual(COST_CATEGORIES[cat], cat);
      });
    });

    test('Every cost category has valid configuration metadata and Maestro color tokens', () => {
      const validColorTokens = ['slate', 'emerald', 'sky', 'amber', 'rose'];

      Object.keys(COST_CATEGORIES).forEach(catKey => {
        const config = COST_CATEGORY_CONFIG[catKey];
        assert.ok(config, `Config must exist for ${catKey}`);
        assert.ok(config.label, `Label must exist for ${catKey}`);
        assert.ok(config.shortLabel, `Short label must exist for ${catKey}`);
        assert.ok(config.description, `Description must exist for ${catKey}`);
        assert.ok(config.badgeClass, `Badge class must exist for ${catKey}`);
        assert.ok(config.defaultSourceModule, `Default source module must exist for ${catKey}`);
        assert.ok(validColorTokens.includes(config.colorToken), `Color token ${config.colorToken} must be within Maestro palette`);
      });
    });

    test('Exports sterilization methods and standard facility rates', () => {
      assert.strictEqual(STERILIZATION_METHODS.STEAM_AUTOCLAVE, 'STEAM_AUTOCLAVE');
      assert.strictEqual(STERILIZATION_METHODS.STERRAD_GAS_PLASMA, 'STERRAD_GAS_PLASMA');
      assert.strictEqual(DEFAULT_FACILITY_RATES.orMinuteRate, 10.00);
      assert.strictEqual(DEFAULT_FACILITY_RATES.pacuMinuteRate, 3.50);
      assert.strictEqual(DEFAULT_FACILITY_RATES.laborBurdenMultiplier, 1.2500);
    });
  });

  describe('2. Deterministic Activity-Based Cost Calculations', () => {
    test('calculateDirectLaborCost applies minutes, hourly wage, and payroll burden accurately', () => {
      // 60 minutes @ $52.00/hr base wage with 1.25x burden:
      // (60 / 60) * 52 * 1.25 = 65.00
      const rnCost = caseCostModelService.calculateDirectLaborCost(60, 52.00, 1.25);
      assert.strictEqual(rnCost, 65.00);

      // 90 minutes @ $36.00/hr base wage with 1.25x burden:
      // (90 / 60) * 36 * 1.25 = 1.5 * 45 = 67.50
      const techCost = caseCostModelService.calculateDirectLaborCost(90, 36.00, 1.25);
      assert.strictEqual(techCost, 67.50);

      // Edge cases: zero or negative input returns 0.00
      assert.strictEqual(caseCostModelService.calculateDirectLaborCost(0, 52.00), 0.00);
      assert.strictEqual(caseCostModelService.calculateDirectLaborCost(60, 0), 0.00);
    });

    test('calculateOrMinuteCost computes operating room suite minute expense deterministically', () => {
      // 60 minutes @ $10.00/min baseline = $600.00
      const cost60 = caseCostModelService.calculateOrMinuteCost(60, 10.00);
      assert.strictEqual(cost60, 600.00);

      // 45 minutes @ $10.00/min baseline = $450.00
      const cost45 = caseCostModelService.calculateOrMinuteCost(45, 10.00);
      assert.strictEqual(cost45, 450.00);

      // Edge cases
      assert.strictEqual(caseCostModelService.calculateOrMinuteCost(0), 0.00);
    });

    test('calculatePacuCost computes recovery care expense deterministically', () => {
      // 45 minutes @ $3.50/min baseline = $157.50
      const cost45 = caseCostModelService.calculatePacuCost(45, 3.50);
      assert.strictEqual(cost45, 157.50);

      // 60 minutes @ $3.50/min baseline = $210.00
      const cost60 = caseCostModelService.calculatePacuCost(60, 3.50);
      assert.strictEqual(cost60, 210.00);
    });

    test('roundToTwo rounds half-up to exact two decimal places without floating drift', () => {
      assert.strictEqual(roundToTwo(10.004), 10.00);
      assert.strictEqual(roundToTwo(10.005), 10.01);
      assert.strictEqual(roundToTwo(10.0055), 10.01);
      assert.strictEqual(roundToTwo(null), 0.00);
      assert.strictEqual(roundToTwo(undefined), 0.00);
    });
  });

  describe('3. Case Breakdown & Itemized Cost Line Items', () => {
    test('Retrieves sample Case #101 with all 8 direct cost categories populated', () => {
      const breakdown = caseCostModelService.getCaseCostBreakdown(101);
      assert.ok(breakdown, 'Breakdown must exist');
      assert.strictEqual(breakdown.surgeryId, 101);
      assert.ok(breakdown.totalDirectCost > 0, 'Total direct cost must be greater than zero');
      assert.strictEqual(breakdown.totalItemCount, 8);

      // Check category totals for Case 101:
      // Implant: 1120.00, Supply: 380.00, Pharmacy: 95.00, Labor: 110.00,
      // OR Time: 600.00, PACU: 157.50, Reprocessing: 100.00, Equipment: 150.00
      // Sum = 2712.50
      assert.strictEqual(breakdown.categoryBreakdown[COST_CATEGORIES.IMPLANT_COST], 1120.00);
      assert.strictEqual(breakdown.categoryBreakdown[COST_CATEGORIES.SUPPLY_COST], 380.00);
      assert.strictEqual(breakdown.categoryBreakdown[COST_CATEGORIES.PHARMACY_COST], 95.00);
      assert.strictEqual(breakdown.categoryBreakdown[COST_CATEGORIES.LABOR_COST], 110.00);
      assert.strictEqual(breakdown.categoryBreakdown[COST_CATEGORIES.OR_TIME_COST], 600.00);
      assert.strictEqual(breakdown.categoryBreakdown[COST_CATEGORIES.PACU_TIME_COST], 157.50);
      assert.strictEqual(breakdown.categoryBreakdown[COST_CATEGORIES.REPROCESSING_COST], 100.00);
      assert.strictEqual(breakdown.categoryBreakdown[COST_CATEGORIES.EQUIPMENT_COST], 150.00);
      assert.strictEqual(breakdown.totalDirectCost, 2712.50);

      // Percentage contributions must sum to 100%
      const totalPct = Object.values(breakdown.categoryPercentages).reduce((acc, p) => acc + p, 0);
      assert.ok(Math.abs(totalPct - 100.0) < 0.2, `Percentages should sum to approximately 100%, got ${totalPct}`);
    });

    test('Adding a new cost item appends to case items and recalculates total cost', () => {
      const surgeryId = 991;
      const initialBreakdown = caseCostModelService.getCaseCostBreakdown(surgeryId);
      const initialTotal = initialBreakdown.totalDirectCost;

      const newItem = caseCostModelService.addCostItem({
        surgeryId,
        costCategory: COST_CATEGORIES.SUPPLY_COST,
        itemCode: 'TEST-SUTURE-01',
        itemDescription: 'Ethicon 2-0 Vicryl Suture Pack (Dozen)',
        quantity: 2,
        unitCost: 45.00,
        completenessFlag: 'VERIFIED'
      });

      assert.ok(newItem.id, 'New item must have an ID');
      assert.strictEqual(newItem.total_cost, 90.00);

      const updatedBreakdown = caseCostModelService.getCaseCostBreakdown(surgeryId);
      assert.strictEqual(updatedBreakdown.totalDirectCost, roundToTwo(initialTotal + 90.00));
      assert.ok(updatedBreakdown.categoryBreakdown[COST_CATEGORIES.SUPPLY_COST] >= 90.00);
    });

    test('Zero-substitution ban: missing cases or un-reconciled items flag correct status', () => {
      // Empty surgery case (zero items)
      const emptyBreakdown = caseCostModelService.getCaseCostBreakdown(9999);
      assert.strictEqual(emptyBreakdown.completenessStatus, 'MISSING_SOURCE_DATA');
      assert.strictEqual(emptyBreakdown.allowsAggregation, false);

      // Adding provisional item flags PARTIALLY_COMPLETE
      caseCostModelService.addCostItem({
        surgeryId: 9999,
        costCategory: COST_CATEGORIES.IMPLANT_COST,
        itemDescription: 'Provisional hardware screw without vendor invoice',
        quantity: 1,
        unitCost: 500.00,
        completenessFlag: 'PROVISIONAL'
      });

      const provisionalBreakdown = caseCostModelService.getCaseCostBreakdown(9999);
      assert.strictEqual(provisionalBreakdown.completenessStatus, 'PARTIALLY_COMPLETE');
      assert.strictEqual(provisionalBreakdown.allowsAggregation, false);
    });
  });

  describe('4. Migration 048 Schema DDL & Rollback Verification', () => {
    test('Forward migration 048_case_cost_model.sql contains all required tables, views, and RLS', () => {
      const migPath = path.join(rootDir, 'supabase', 'migrations', '048_case_cost_model.sql');
      assert.ok(fs.existsSync(migPath), 'Migration 048 file must exist');

      const content = fs.readFileSync(migPath, 'utf8');
      assert.ok(content.includes('CREATE TABLE IF NOT EXISTS public.facility_cost_rate_schedules'), 'Must create facility_cost_rate_schedules');
      assert.ok(content.includes('CREATE TABLE IF NOT EXISTS public.instrument_tray_cost_catalog'), 'Must create instrument_tray_cost_catalog');
      assert.ok(content.includes('CREATE TABLE IF NOT EXISTS public.case_direct_cost_items'), 'Must create case_direct_cost_items');
      assert.ok(content.includes('CREATE OR REPLACE VIEW public.vw_case_cost_breakdowns'), 'Must create vw_case_cost_breakdowns');
      assert.ok(content.includes('ENABLE ROW LEVEL SECURITY'), 'Must enable RLS');
      assert.ok(content.includes('is_facility_accessible(facility_id)'), 'Must enforce facility multi-tenancy');
    });

    test('Rollback migration 048_case_cost_model_down.sql drops all tables and views cleanly', () => {
      const downPath = path.join(rootDir, 'supabase', 'migrations', '048_case_cost_model_down.sql');
      assert.ok(fs.existsSync(downPath), 'Down migration 048 file must exist');

      const content = fs.readFileSync(downPath, 'utf8');
      assert.ok(content.includes('DROP VIEW IF EXISTS public.vw_case_cost_breakdowns'), 'Must drop view');
      assert.ok(content.includes('DROP TABLE IF EXISTS public.case_direct_cost_items'), 'Must drop cost items table');
      assert.ok(content.includes('DROP TABLE IF EXISTS public.instrument_tray_cost_catalog'), 'Must drop tray catalog table');
      assert.ok(content.includes('DROP TABLE IF EXISTS public.facility_cost_rate_schedules'), 'Must drop facility rate schedules table');
    });
  });

  describe('5. UI Components & Maestro Purple Ban Static Audit', () => {
    test('CaseCostModelView and its CSS have zero banned purple/violet/indigo tokens', () => {
      const jsxPath = path.join(rootDir, 'src', 'components', 'CaseCostModelView.jsx');
      const cssPath = path.join(rootDir, 'src', 'components', 'CaseCostModelView.css');

      assert.ok(fs.existsSync(jsxPath), 'CaseCostModelView.jsx must exist');
      assert.ok(fs.existsSync(cssPath), 'CaseCostModelView.css must exist');

      const jsxContent = fs.readFileSync(jsxPath, 'utf8');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      // Filter out comments from CSS before scanning
      const cleanCss = cssContent.replace(/\/\*[\s\S]*?\*\//g, '');

      const purpleRegex = /\b(purple|violet|indigo)\b/i;
      assert.strictEqual(purpleRegex.test(jsxContent), false, 'CaseCostModelView.jsx must not contain purple/violet/indigo tokens');
      assert.strictEqual(purpleRegex.test(cleanCss), false, 'CaseCostModelView.css must not contain purple/violet/indigo tokens');
    });

    test('CaseCostModelView CSS defines table-responsive with overflow-x auto and custom scrollbars', () => {
      const cssPath = path.join(rootDir, 'src', 'components', 'CaseCostModelView.css');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      assert.ok(cssContent.includes('.table-responsive'), 'Must define .table-responsive');
      assert.ok(cssContent.includes('overflow-x: auto'), 'Must set overflow-x: auto');
      assert.ok(cssContent.includes('.table-responsive::-webkit-scrollbar'), 'Must style scrollbars');
      assert.ok(cssContent.includes('min-width: 1100px'), 'Table must have minimum width to prevent field clipping');
    });
  });

  describe('6. Application Wiring & Navigation Integration', () => {
    test('App.jsx integrates CaseCostModelView with sidebar item, headers, and active tab', () => {
      const appPath = path.join(rootDir, 'src', 'App.jsx');
      const content = fs.readFileSync(appPath, 'utf8');

      assert.ok(content.includes("import CaseCostModelView from './components/CaseCostModelView';"), 'Must import CaseCostModelView');
      assert.ok(content.includes("activeTab === 'case_cost_model'"), 'Must bind case_cost_model tab');
      assert.ok(content.includes("<CaseCostModelView />"), 'Must render CaseCostModelView');
      assert.ok(content.includes("Activity-Based Case Cost Model"), 'Must have proper header title');
    });
  });

  describe('7. Master Specifications Directory Integrity', () => {
    test('Master directory Phase_07_Financials contains strictly 8 files (70 through 77)', () => {
      const specsDir = 'E:\\medicalAI\\ASCANALYST_All_Modules\\ASCANALYST_MD_SPECS\\Phase_07_Financials';
      if (fs.existsSync(specsDir)) {
        const files = fs.readdirSync(specsDir).filter(f => f.endsWith('.md'));
        assert.strictEqual(files.length, 8, `Phase_07_Financials must contain strictly 8 files, found: ${files.join(', ')}`);
        assert.ok(files.includes('72_CASE_COST_MODEL.md'), 'Must contain 72_CASE_COST_MODEL.md');
      }
    });
  });

});
