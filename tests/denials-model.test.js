import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import denialsService, {
  DENIAL_CATEGORIES,
  DENIAL_STATUSES,
  ASSIGNED_TEAMS,
  URGENCY_TIERS,
  calculateDaysToDeadline,
  getUrgencyTier,
  calculateExpectedRecovery,
  calculateDenialKpis,
  getBaselineDenials
} from '../src/lib/denialsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 85 — Denials Model & Management Engine Suite', () => {

  describe('1. Denial Taxonomy, State Machine & Teams', () => {
    test('should define canonical root-cause denial categories with default probability and teams', () => {
      const keys = Object.keys(DENIAL_CATEGORIES);
      assert.ok(keys.length >= 10, 'Must define at least 10 canonical denial categories');
      assert.ok(keys.includes('PRE_AUTH_ABSENT_EXPIRED'), 'Must include PRE_AUTH_ABSENT_EXPIRED');
      assert.ok(keys.includes('MEDICAL_NECESSITY_LCD'), 'Must include MEDICAL_NECESSITY_LCD');
      assert.ok(keys.includes('CODING_MODIFIER_UNBUNDLED'), 'Must include CODING_MODIFIER_UNBUNDLED');
      assert.ok(keys.includes('TIMELY_FILING_EXCEEDED'), 'Must include TIMELY_FILING_EXCEEDED');
      assert.ok(keys.includes('ELIGIBILITY_TERMINATED'), 'Must include ELIGIBILITY_TERMINATED');
      assert.ok(keys.includes('COB_PRIMARY_EOB_MISSING'), 'Must include COB_PRIMARY_EOB_MISSING');

      // Verify structure
      const preAuth = DENIAL_CATEGORIES.PRE_AUTH_ABSENT_EXPIRED;
      assert.strictEqual(preAuth.type, 'CLINICAL');
      assert.strictEqual(preAuth.defaultTeam, 'CLINICAL_APPEALS');
      assert.strictEqual(preAuth.defaultProbability, 70.0);
    });

    test('should define all 10 stages of the denial lifecycle state machine', () => {
      const statuses = Object.keys(DENIAL_STATUSES);
      assert.ok(statuses.length >= 10, 'Must define 10 state machine statuses');
      assert.ok(statuses.includes('IDENTIFIED'));
      assert.ok(statuses.includes('TRIAGED'));
      assert.ok(statuses.includes('IN_PROGRESS'));
      assert.ok(statuses.includes('APPEALED_LEVEL_1'));
      assert.ok(statuses.includes('APPEALED_LEVEL_2'));
      assert.ok(statuses.includes('REBILLED'));
      assert.ok(statuses.includes('OVERTURNED_PAID'));
      assert.ok(statuses.includes('WRITTEN_OFF'));
    });

    test('should define all 4 specialized functional team queues', () => {
      const teams = Object.keys(ASSIGNED_TEAMS);
      assert.strictEqual(teams.length, 4, 'Must define 4 specialized functional teams');
      assert.ok(teams.includes('CLINICAL_APPEALS'));
      assert.ok(teams.includes('BILLING_AND_CODING'));
      assert.ok(teams.includes('PATIENT_ACCESS'));
      assert.ok(teams.includes('MANAGED_CARE_CONTRACTING'));
    });
  });

  describe('2. Deterministic Financial & Recovery Computations', () => {
    test('should accurately compute probability-weighted expected recovery dollars', () => {
      // 1850.00 * 70% = 1295.00
      const rec1 = calculateExpectedRecovery(1850.00, 70.00);
      assert.strictEqual(rec1, 1295.00, 'Expected $1,295.00 recovery on $1,850 @ 70%');

      // 920.00 * 85% = 782.00
      const rec2 = calculateExpectedRecovery(920.00, 85.00);
      assert.strictEqual(rec2, 782.00, 'Expected $782.00 recovery on $920 @ 85%');

      // 1450.00 * 15% = 217.50
      const rec3 = calculateExpectedRecovery(1450.00, 15.00);
      assert.strictEqual(rec3, 217.50, 'Expected $217.50 recovery on $1,450 @ 15%');
    });

    test('should handle edge cases without throwing or NaN', () => {
      assert.strictEqual(calculateExpectedRecovery(0, 50), 0.00);
      assert.strictEqual(calculateExpectedRecovery(1000, 0), 0.00);
      assert.strictEqual(calculateExpectedRecovery(1000, 100), 1000.00);
      assert.strictEqual(calculateExpectedRecovery(null, 50), 0.00);
      assert.strictEqual(calculateExpectedRecovery(1000, undefined), 0.00);
    });
  });

  describe('3. Deadline Urgency Classification & Date Math', () => {
    test('should compute days to deadline accurately across calendar dates', () => {
      const today = new Date('2026-11-05T00:00:00Z');
      const target15Days = '2026-11-20';
      const daysRemaining = calculateDaysToDeadline(target15Days, today);
      assert.strictEqual(daysRemaining, 15, 'Should calculate exactly 15 days');

      const pastDate = '2026-11-01';
      const overdueDays = calculateDaysToDeadline(pastDate, today);
      assert.strictEqual(overdueDays, -4, 'Should calculate -4 days overdue');
    });

    test('should classify urgency tiers deterministically', () => {
      assert.strictEqual(getUrgencyTier(-1).id, 'CRITICAL_OVERDUE');
      assert.strictEqual(getUrgencyTier(0).id, 'URGENT_UNDER_15_DAYS');
      assert.strictEqual(getUrgencyTier(14).id, 'URGENT_UNDER_15_DAYS');
      assert.strictEqual(getUrgencyTier(15).id, 'APPROACHING_30_DAYS');
      assert.strictEqual(getUrgencyTier(30).id, 'APPROACHING_30_DAYS');
      assert.strictEqual(getUrgencyTier(31).id, 'ON_TRACK');
      assert.strictEqual(getUrgencyTier(90).id, 'ON_TRACK');
    });
  });

  describe('4. Executive KPI Aggregation', () => {
    test('should aggregate baseline denials dataset KPIs accurately', () => {
      const sample = getBaselineDenials();
      assert.ok(sample.length >= 6, 'Should provide at least 6 baseline denial records');

      const kpis = calculateDenialKpis(sample);
      assert.ok(kpis.totalDenialExposure > 0, 'Total denial exposure must be positive');
      assert.ok(kpis.expectedRecoverableOpportunity > 0, 'Expected recoverable opportunity must be positive');
      assert.ok(kpis.expectedRecoverableOpportunity <= kpis.totalDenialExposure, 'Recoverable opportunity cannot exceed total exposure');
      assert.ok(kpis.criticalDeadlinesCount >= 1, 'Baseline should include critical deadline items');
      assert.strictEqual(typeof kpis.netOverturnRate, 'number', 'Net overturn rate must be numeric');
    });
  });

  describe('5. Database Migration SQL Verification (059_denials_model.sql)', () => {
    test('should exist on disk and define required schema tables, views, and indexes', () => {
      const sqlPath = path.join(rootDir, 'supabase', 'migrations', '059_denials_model.sql');
      assert.ok(fs.existsSync(sqlPath), '059_denials_model.sql migration must exist');

      const sqlContent = fs.readFileSync(sqlPath, 'utf8');
      assert.ok(sqlContent.includes('CREATE TABLE IF NOT EXISTS public.rcm_denials'), 'Must create rcm_denials table');
      assert.ok(sqlContent.includes('CREATE TABLE IF NOT EXISTS public.rcm_denial_events'), 'Must create rcm_denial_events table');
      assert.ok(sqlContent.includes('CREATE OR REPLACE VIEW public.vw_rcm_denials_aging_and_deadlines'), 'Must create aging view');
      assert.ok(sqlContent.includes('CREATE OR REPLACE VIEW public.vw_rcm_denials_by_root_cause_kpi'), 'Must create root cause view');
      assert.ok(sqlContent.includes('expected_recovery_amount NUMERIC(14,2) GENERATED ALWAYS AS'), 'Must define expected_recovery_amount generated column');
    });

    test('should enforce idempotent DROP POLICY IF EXISTS before CREATE POLICY to prevent error 42710', () => {
      const sqlPath = path.join(rootDir, 'supabase', 'migrations', '059_denials_model.sql');
      const sqlContent = fs.readFileSync(sqlPath, 'utf8');

      const dropMatches = sqlContent.match(/DROP POLICY IF EXISTS/g) || [];
      const createMatches = sqlContent.match(/CREATE POLICY/g) || [];

      assert.strictEqual(dropMatches.length, createMatches.length, 'Every CREATE POLICY must have a matching DROP POLICY IF EXISTS');
      assert.ok(sqlContent.includes('public.get_auth_user_facilities()'), 'Must enforce facility isolation via get_auth_user_facilities()');
    });

    test('should include safe rollback down migration', () => {
      const downPath = path.join(rootDir, 'supabase', 'migrations', '059_denials_model_down.sql');
      assert.ok(fs.existsSync(downPath), '059_denials_model_down.sql must exist');

      const content = fs.readFileSync(downPath, 'utf8');
      assert.ok(content.includes('DROP VIEW IF EXISTS public.vw_rcm_denials_aging_and_deadlines'), 'Must drop aging view');
      assert.ok(content.includes('DROP TABLE IF EXISTS public.rcm_denials'), 'Must drop denials table');
      assert.ok(content.includes('DROP TABLE IF EXISTS public.rcm_denial_events'), 'Must drop events table');
    });
  });

  describe('6. Maestro Clinical Design System Token Governance', () => {
    test('should enforce ZERO purple/violet/indigo/magenta/fuchsia tokens in DenialsModelView.css', () => {
      const cssPath = path.join(rootDir, 'src', 'components', 'DenialsModelView.css');
      assert.ok(fs.existsSync(cssPath), 'DenialsModelView.css must exist');

      const cssContent = fs.readFileSync(cssPath, 'utf8');
      const cleanCss = cssContent.replace(/\/\*[\s\S]*?\*\//g, '');
      const purpleRegex = /\b(purple|violet|indigo|magenta|fuchsia)\b/i;

      assert.strictEqual(purpleRegex.test(cleanCss), false, 'DenialsModelView.css must contain zero banned color tokens');
    });

    test('should enforce responsive table with min-width: 1100px and table-layout: fixed in DenialsModelView.css', () => {
      const cssPath = path.join(rootDir, 'src', 'components', 'DenialsModelView.css');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      assert.ok(cssContent.includes('.table-responsive'), 'Must define .table-responsive');
      assert.ok(cssContent.includes('overflow-x: auto'), 'Must set overflow-x: auto');
      assert.ok(cssContent.includes('min-width: 1100px'), 'Table must have minimum width 1100px');
      assert.ok(cssContent.includes('table-layout: fixed'), 'Must enforce table-layout: fixed');
    });

    test('should enforce ZERO purple/violet/indigo/magenta/fuchsia tokens in DenialsModelView.jsx', () => {
      const jsxPath = path.join(rootDir, 'src', 'components', 'DenialsModelView.jsx');
      assert.ok(fs.existsSync(jsxPath), 'DenialsModelView.jsx must exist');

      const jsxContent = fs.readFileSync(jsxPath, 'utf8');
      const cleanJsx = jsxContent.replace(/\/\*[\s\S]*?\*\//g, '');
      const purpleRegex = /\b(purple|violet|indigo|magenta|fuchsia)\b/i;

      assert.strictEqual(purpleRegex.test(cleanJsx), false, 'DenialsModelView.jsx must contain zero banned color tokens');
    });
  });

  describe('7. Application Wiring & UI Routing Integration', () => {
    test('should register DenialsModelView in src/App.jsx', () => {
      const appPath = path.join(rootDir, 'src', 'App.jsx');
      const content = fs.readFileSync(appPath, 'utf8');

      assert.ok(content.includes("import DenialsModelView from './components/DenialsModelView';"), 'Must import DenialsModelView');
      assert.ok(content.includes("activeTab === 'denials_model'"), 'Must bind denials_model activeTab');
      assert.ok(content.includes('<DenialsModelView />'), 'Must render DenialsModelView component');
      assert.ok(content.includes('Denials Management & Appeals Workflow'), 'Must have header title');
    });
  });

  describe('8. Master Specifications Directory Integrity', () => {
    test('should maintain populated 85_DENIALS_MODEL.md specification', () => {
      const specPath = 'E:\\medicalAI\\ASCANALYST_All_Modules\\ASCANALYST_MD_SPECS\\Phase_08_RCM\\85_DENIALS_MODEL.md';
      assert.ok(fs.existsSync(specPath), 'Specification file must exist');

      const content = fs.readFileSync(specPath, 'utf8');
      assert.ok(content.includes('# 85 DENIALS MODEL'), 'Must have title');
      assert.ok(content.includes('## Purpose'), 'Must have Purpose section');
      assert.ok(content.includes('## Scope'), 'Must have Scope section');
      assert.ok(content.includes('## Current State'), 'Must have Current State section');
      assert.ok(content.includes('## Target State'), 'Must have Target State section');
      assert.ok(content.includes('## Data Model / Schema'), 'Must have Data Model section');
      assert.ok(content.includes('## Business Rules'), 'Must have Business Rules section');
      assert.ok(content.includes('## Acceptance Criteria'), 'Must have Acceptance Criteria section');
      assert.ok(content.length > 5000, 'Specification must be fully written and not a stub');
    });
  });
});

