/**
 * ==============================================================================
 * Phase 77: Financial Calculation Versioning & Freeze Engine Test Suite
 * ==============================================================================
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  calculationVersioningService,
  VERSION_STATUSES,
  VERSION_STATUS_CONFIG,
  FREEZE_STATUSES,
  FREEZE_STATUS_CONFIG,
  roundToTwo
} from '../src/lib/calculationVersioningService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 77 — Financial Calculation Versioning & Freeze Engine Verification Suite', () => {

  describe('1. Version & Freeze Status Enums and Metadata', () => {
    test('Exports all 5 canonical version statuses', () => {
      const expectedStatuses = [
        'DRAFT',
        'ACTIVE',
        'FROZEN',
        'SUPERSEDED',
        'DEPRECATED'
      ];

      expectedStatuses.forEach(s => {
        assert.ok(VERSION_STATUSES[s], `Status ${s} must be exported`);
        assert.strictEqual(VERSION_STATUSES[s], s);
      });
    });

    test('Every version status has valid Maestro color tokens and configuration metadata', () => {
      const validColorTokens = ['emerald', 'sky', 'slate', 'amber', 'rose'];

      Object.keys(VERSION_STATUSES).forEach(statusKey => {
        const config = VERSION_STATUS_CONFIG[statusKey];
        assert.ok(config, `Config must exist for ${statusKey}`);
        assert.ok(config.label, `Label must exist for ${statusKey}`);
        assert.ok(config.shortLabel, `Short label must exist for ${statusKey}`);
        assert.ok(config.badgeClass, `Badge class must exist for ${statusKey}`);
        assert.ok(config.description, `Description must exist for ${statusKey}`);
        assert.ok(validColorTokens.includes(config.colorToken), `Color token ${config.colorToken} must be within Maestro palette`);
      });
    });

    test('Exports all 4 canonical accounting period freeze statuses', () => {
      const expectedFreezeStatuses = [
        'OPEN',
        'PENDING_APPROVAL',
        'FROZEN',
        'REOPENED_AUDIT'
      ];

      expectedFreezeStatuses.forEach(s => {
        assert.ok(FREEZE_STATUSES[s], `Freeze status ${s} must be exported`);
        assert.strictEqual(FREEZE_STATUSES[s], s);
      });
    });

    test('Every freeze status has valid Maestro color tokens and configuration metadata', () => {
      const validColorTokens = ['emerald', 'sky', 'slate', 'amber', 'rose'];

      Object.keys(FREEZE_STATUSES).forEach(statusKey => {
        const config = FREEZE_STATUS_CONFIG[statusKey];
        assert.ok(config, `Config must exist for ${statusKey}`);
        assert.ok(config.label, `Label must exist for ${statusKey}`);
        assert.ok(config.shortLabel, `Short label must exist for ${statusKey}`);
        assert.ok(config.badgeClass, `Badge class must exist for ${statusKey}`);
        assert.ok(config.description, `Description must exist for ${statusKey}`);
        assert.ok(validColorTokens.includes(config.colorToken), `Color token ${config.colorToken} must be within Maestro palette`);
      });
    });
  });

  describe('2. Deterministic Math & Simulation Variance Calculations', () => {
    test('calculateSimulationVariance computes exact dollar delta and percentage variance', () => {
      // Baseline = 10,000, Recalculated = 10,500 (+500, +5.00%)
      const res = calculationVersioningService.calculateSimulationVariance(10000.00, 10500.00);

      assert.strictEqual(res.baselineMargin, 10000.00);
      assert.strictEqual(res.recalculatedMargin, 10500.00);
      assert.strictEqual(res.variance, 500.00);
      assert.strictEqual(res.variancePct, 5.00);
      assert.strictEqual(res.isFavorable, true);
    });

    test('calculateSimulationVariance handles unfavorable negative variance', () => {
      // Baseline = 5,000, Recalculated = 4,750 (-250, -5.00%)
      const res = calculationVersioningService.calculateSimulationVariance(5000.00, 4750.00);

      assert.strictEqual(res.variance, -250.00);
      assert.strictEqual(res.variancePct, -5.00);
      assert.strictEqual(res.isFavorable, false);
    });

    test('validatePreFreezeGate allows freeze when all cases meet threshold >= 90', () => {
      const perfectCases = [
        { id: 101, patient: 'Patient A', overallScore: 95.00 },
        { id: 102, patient: 'Patient B', overallScore: 100.00 },
        { id: 103, patient: 'Patient C', overallScore: 92.50 }
      ];

      const gate = calculationVersioningService.validatePreFreezeGate(perfectCases, 90.00);

      assert.strictEqual(gate.canFreeze, true);
      assert.strictEqual(gate.blockedCount, 0);
      assert.strictEqual(gate.passRatePct, 100.00);
    });

    test('validatePreFreezeGate blocks period freeze when any case has score < 90', () => {
      const mixedCases = [
        { id: 201, patient: 'Patient A', overallScore: 95.00 },
        { id: 202, patient: 'Patient B', overallScore: 78.00 }, // Incomplete
        { id: 203, patient: 'Patient C', overallScore: 49.00 }  // Critical
      ];

      const gate = calculationVersioningService.validatePreFreezeGate(mixedCases, 90.00);

      assert.strictEqual(gate.canFreeze, false);
      assert.strictEqual(gate.blockedCount, 2);
      assert.strictEqual(gate.blockedCases.length, 2);
      assert.ok(gate.passRatePct < 50.00);
    });

    test('runSimulationDryRun computes non-mutating comparison across case portfolio', () => {
      const sourceVer = { versionCode: '2026.1' };
      const targetVer = { versionCode: '2026.2', marginMultiplier: 1.10 };
      const testCases = [
        { id: 1, patient: 'P1', procedure: 'Cataract', cpt_codes: '66984', surgeonName: 'Dr. T', specialty: 'Ophth', expectedContributionMargin: 1000.00 },
        { id: 2, patient: 'P2', procedure: 'Knee', cpt_codes: '29881', surgeonName: 'Dr. L', specialty: 'Ortho', expectedContributionMargin: 2000.00 }
      ];

      const sim = calculationVersioningService.runSimulationDryRun(sourceVer, targetVer, testCases);

      assert.strictEqual(sim.casesEvaluated, 2);
      assert.strictEqual(sim.overallVariance.baselineMargin, 3000.00);
      assert.strictEqual(sim.overallVariance.recalculatedMargin, 3300.00);
      assert.strictEqual(sim.overallVariance.variance, 300.00);
      assert.strictEqual(sim.overallVariance.variancePct, 10.00);
      assert.strictEqual(sim.caseDetails.length, 2);
    });
  });

  describe('3. Multi-Level Baseline Sample Data', () => {
    const data = calculationVersioningService.getBaselineSampleData();

    test('getBaselineSampleData returns versions, periods, audit history, and sample cases', () => {
      assert.ok(data.versions && data.versions.length >= 4);
      assert.ok(data.periods && data.periods.length >= 4);
      assert.ok(data.auditHistory && data.auditHistory.length >= 3);
      assert.ok(data.sampleCases && data.sampleCases.length >= 7);
    });

    test('Baseline versions contain active production version and locked baseline', () => {
      const active = data.versions.find(v => v.status === VERSION_STATUSES.ACTIVE);
      assert.ok(active, 'Must have active production version');
      assert.ok(active.orMinuteRate > 0);
      assert.ok(active.laborBurdenMultiplier >= 1.0);

      const locked = data.versions.find(v => v.isLocked === true);
      assert.ok(locked, 'Must have at least one locked version');
    });

    test('Baseline periods contain frozen closed periods and open period', () => {
      const frozenPeriods = data.periods.filter(p => p.freezeStatus === FREEZE_STATUSES.FROZEN);
      assert.ok(frozenPeriods.length >= 2, 'Must have at least 2 frozen periods');

      const openPeriod = data.periods.find(p => p.freezeStatus === FREEZE_STATUSES.OPEN);
      assert.ok(openPeriod, 'Must have open period');
    });
  });

  describe('4. Database Migration & Schema Integrity (053_financial_calculation_versioning.sql)', () => {
    const migrationPath = path.join(rootDir, 'supabase', 'migrations', '053_financial_calculation_versioning.sql');
    const downMigrationPath = path.join(rootDir, 'supabase', 'migrations', '053_financial_calculation_versioning_down.sql');

    test('Migration 053 forward and down files exist and are substantive', () => {
      assert.ok(fs.existsSync(migrationPath), 'Migration 053 forward file must exist');
      assert.ok(fs.existsSync(downMigrationPath), 'Migration 053 down file must exist');

      const forwardSql = fs.readFileSync(migrationPath, 'utf8');
      const downSql = fs.readFileSync(downMigrationPath, 'utf8');

      assert.ok(forwardSql.length > 1000, 'Forward SQL must contain complete schema');
      assert.ok(downSql.length > 200, 'Down SQL must contain teardown script');
    });

    test('Migration 053 creates all 3 versioning and freeze tables with constraints', () => {
      const forwardSql = fs.readFileSync(migrationPath, 'utf8');

      assert.ok(forwardSql.includes('CREATE TABLE IF NOT EXISTS public.financial_calculation_versions'));
      assert.ok(forwardSql.includes('CREATE TABLE IF NOT EXISTS public.accounting_period_freezes'));
      assert.ok(forwardSql.includes('CREATE TABLE IF NOT EXISTS public.financial_recalculation_runs'));
      assert.ok(forwardSql.includes('facility_id UUID NOT NULL'));
      assert.ok(forwardSql.includes('version_code VARCHAR(32) NOT NULL'));
      assert.ok(forwardSql.includes('freeze_status VARCHAR(32) NOT NULL'));
    });

    test('Migration 053 creates rollup views for freeze status and version inventory', () => {
      const forwardSql = fs.readFileSync(migrationPath, 'utf8');

      assert.ok(forwardSql.includes('CREATE OR REPLACE VIEW public.vw_accounting_period_freeze_status'));
      assert.ok(forwardSql.includes('CREATE OR REPLACE VIEW public.vw_calculation_version_inventory'));
    });

    test('Migration 053 enables RLS and defines tenant policies on all tables', () => {
      const forwardSql = fs.readFileSync(migrationPath, 'utf8');

      assert.ok(forwardSql.includes('ALTER TABLE public.financial_calculation_versions ENABLE ROW LEVEL SECURITY;'));
      assert.ok(forwardSql.includes('ALTER TABLE public.accounting_period_freezes ENABLE ROW LEVEL SECURITY;'));
      assert.ok(forwardSql.includes('ALTER TABLE public.financial_recalculation_runs ENABLE ROW LEVEL SECURITY;'));
      assert.ok(forwardSql.includes('public.is_facility_accessible(facility_id)'));
    });

    test('Down migration 053 drops all created objects safely in reverse order', () => {
      const downSql = fs.readFileSync(downMigrationPath, 'utf8');

      assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_calculation_version_inventory CASCADE;'));
      assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_accounting_period_freeze_status CASCADE;'));
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.financial_recalculation_runs CASCADE;'));
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.accounting_period_freezes CASCADE;'));
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.financial_calculation_versions CASCADE;'));
    });
  });

  describe('5. Maestro Design System & Application Wiring', () => {
    test('CalculationVersioningView.jsx and CSS obey strict Color Governance (Zero disallowed tokens)', () => {
      const jsxPath = path.join(rootDir, 'src', 'components', 'CalculationVersioningView.jsx');
      const cssPath = path.join(rootDir, 'src', 'components', 'CalculationVersioningView.css');

      assert.ok(fs.existsSync(jsxPath), 'JSX file must exist');
      assert.ok(fs.existsSync(cssPath), 'CSS file must exist');

      const jsx = fs.readFileSync(jsxPath, 'utf8');
      const cssLines = fs.readFileSync(cssPath, 'utf8').split('\n');

      const banned = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];

      banned.forEach(token => {
        assert.ok(!jsx.toLowerCase().includes(token), `JSX must not contain ${token}`);
      });

      cssLines.forEach((line, idx) => {
        if (line.includes('/*') || line.includes('*') || line.includes('//')) return;
        banned.forEach(token => {
          assert.ok(!line.toLowerCase().includes(token), `CSS line ${idx + 1} must not contain ${token}`);
        });
      });
    });

    test('CalculationVersioningView includes responsive table wrapper with min-width 1100px', () => {
      const jsx = fs.readFileSync(path.join(rootDir, 'src', 'components', 'CalculationVersioningView.jsx'), 'utf8');
      const css = fs.readFileSync(path.join(rootDir, 'src', 'components', 'CalculationVersioningView.css'), 'utf8');

      assert.ok(jsx.includes('className="table-responsive"'), 'JSX must include table-responsive wrapper');
      assert.ok(css.includes('min-width: 1100px'), 'CSS must specify min-width: 1100px on table');
    });

    test('App.jsx integrates CalculationVersioningView into sidebar navigation and routing', () => {
      const appJsx = fs.readFileSync(path.join(rootDir, 'src', 'App.jsx'), 'utf8');

      assert.ok(appJsx.includes("import CalculationVersioningView from './components/CalculationVersioningView'"), 'App.jsx must import component');
      assert.ok(appJsx.includes("activeTab === 'calculation_versioning'"), 'App.jsx must have tab active state');
      assert.ok(appJsx.includes('<CalculationVersioningView />'), 'App.jsx must render component');
      assert.ok(appJsx.includes('Calculation Versioning & Freeze'), 'App.jsx must have menu item text');
    });
  });
});
