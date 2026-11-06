import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import patientBalancesService, {
  RESPONSIBILITY_TYPES,
  BALANCE_STATUSES,
  AGING_BUCKETS,
  calculateAgingDays,
  classifyAgingBucket,
  calculateCurrentBalance,
  calculatePromptPayDiscount,
  calculatePatientBalanceKpis,
  getBaselinePatientBalances
} from '../src/lib/patientBalancesService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 87 — Patient Balances, Aging & Collections Engine Suite', () => {

  describe('1. Patient Responsibility Types & CARC Group PR Alignment', () => {
    test('should define all 5 responsibility categories mapped to CARC Group PR codes', () => {
      const types = Object.keys(RESPONSIBILITY_TYPES);
      assert.strictEqual(types.length, 5, 'Must define exactly 5 responsibility types');
      assert.ok(types.includes('DEDUCTIBLE'));
      assert.ok(types.includes('COINSURANCE'));
      assert.ok(types.includes('COPAY'));
      assert.ok(types.includes('NON_COVERED'));
      assert.ok(types.includes('SELF_PAY'));

      assert.strictEqual(RESPONSIBILITY_TYPES.DEDUCTIBLE.code, 'PR-1');
      assert.strictEqual(RESPONSIBILITY_TYPES.COINSURANCE.code, 'PR-2');
      assert.strictEqual(RESPONSIBILITY_TYPES.COPAY.code, 'PR-3');
      assert.strictEqual(RESPONSIBILITY_TYPES.NON_COVERED.code, 'PR-204');
      assert.strictEqual(RESPONSIBILITY_TYPES.SELF_PAY.code, 'SELF-PAY');
    });

    test('should define all 10 patient balance lifecycle states', () => {
      const statuses = Object.keys(BALANCE_STATUSES);
      assert.strictEqual(statuses.length, 10, 'Must define 10 lifecycle statuses');
      assert.ok(statuses.includes('PENDING_INSURANCE'));
      assert.ok(statuses.includes('ADJUDICATED_FINAL'));
      assert.ok(statuses.includes('STATEMENT_SENT'));
      assert.ok(statuses.includes('PAYMENT_PLAN_ACTIVE'));
      assert.ok(statuses.includes('PARTIALLY_PAID'));
      assert.ok(statuses.includes('PAID_IN_FULL'));
      assert.ok(statuses.includes('DELINQUENT_PRE_COLLECTIONS'));
      assert.ok(statuses.includes('EXTERNAL_COLLECTIONS'));
      assert.ok(statuses.includes('BAD_DEBT_WRITEOFF'));
      assert.ok(statuses.includes('CHARITY_CARE_WRITEOFF'));

      // Inactive/Non-collectable states
      assert.strictEqual(BALANCE_STATUSES.PENDING_INSURANCE.isCollectableNow, false);
      assert.strictEqual(BALANCE_STATUSES.PAID_IN_FULL.isCollectableNow, false);
      assert.strictEqual(BALANCE_STATUSES.BAD_DEBT_WRITEOFF.isCollectableNow, false);
      assert.strictEqual(BALANCE_STATUSES.CHARITY_CARE_WRITEOFF.isCollectableNow, false);

      // Collectable states
      assert.strictEqual(BALANCE_STATUSES.ADJUDICATED_FINAL.isCollectableNow, true);
      assert.strictEqual(BALANCE_STATUSES.STATEMENT_SENT.isCollectableNow, true);
      assert.strictEqual(BALANCE_STATUSES.PAYMENT_PLAN_ACTIVE.isCollectableNow, true);
      assert.strictEqual(BALANCE_STATUSES.DELINQUENT_PRE_COLLECTIONS.isCollectableNow, true);
    });
  });

  describe('2. GAAP 5-Tier Aging Schedules & Bucket Classification', () => {
    test('should define the 5 standard GAAP aging buckets', () => {
      const buckets = Object.keys(AGING_BUCKETS);
      assert.strictEqual(buckets.length, 5, 'Must define 5 GAAP aging tiers');
      assert.ok(buckets.includes('CURRENT_0_30'));
      assert.ok(buckets.includes('AGING_31_60'));
      assert.ok(buckets.includes('AGING_61_90'));
      assert.ok(buckets.includes('AGING_91_120'));
      assert.ok(buckets.includes('AGING_120_PLUS'));
    });

    test('should accurately calculate aging days from statement dispatch date', () => {
      const today = '2026-11-06T00:00:00Z';
      assert.strictEqual(calculateAgingDays('2026-11-06T00:00:00Z', today), 0);
      assert.strictEqual(calculateAgingDays('2026-10-22T00:00:00Z', today), 15);
      assert.strictEqual(calculateAgingDays('2026-09-22T00:00:00Z', today), 45);
      assert.strictEqual(calculateAgingDays('2026-08-08T00:00:00Z', today), 90);
      assert.strictEqual(calculateAgingDays('2026-06-01T00:00:00Z', today), 158);
      assert.strictEqual(calculateAgingDays(null), 0);
    });

    test('should classify aging days into correct GAAP bucket', () => {
      assert.strictEqual(classifyAgingBucket(0).id, 'CURRENT_0_30');
      assert.strictEqual(classifyAgingBucket(15).id, 'CURRENT_0_30');
      assert.strictEqual(classifyAgingBucket(30).id, 'CURRENT_0_30');
      assert.strictEqual(classifyAgingBucket(31).id, 'AGING_31_60');
      assert.strictEqual(classifyAgingBucket(60).id, 'AGING_31_60');
      assert.strictEqual(classifyAgingBucket(61).id, 'AGING_61_90');
      assert.strictEqual(classifyAgingBucket(90).id, 'AGING_61_90');
      assert.strictEqual(classifyAgingBucket(91).id, 'AGING_91_120');
      assert.strictEqual(classifyAgingBucket(120).id, 'AGING_91_120');
      assert.strictEqual(classifyAgingBucket(121).id, 'AGING_120_PLUS');
      assert.strictEqual(classifyAgingBucket(365).id, 'AGING_120_PLUS');
    });
  });

  describe('3. Deterministic Financial Invariants & Arithmetic', () => {
    test('should enforce current balance invariant: original - adjustments - paid', () => {
      assert.strictEqual(calculateCurrentBalance(1000.00, 200.00, 300.00), 500.00);
      assert.strictEqual(calculateCurrentBalance(750.50, 0, 750.50), 0.00);
      assert.strictEqual(calculateCurrentBalance(1200.00, 1200.00, 0), 0.00);
      // Floor at zero (no negative balance without explicit refund process)
      assert.strictEqual(calculateCurrentBalance(500.00, 300.00, 300.00), 0.00);
      assert.strictEqual(calculateCurrentBalance(null, undefined, 0), 0.00);
    });

    test('should compute prompt-pay discount incentives deterministically', () => {
      const result = calculatePromptPayDiscount(1000.00, 15.0);
      assert.strictEqual(result.discountPct, 15.0);
      assert.strictEqual(result.discountAmount, 150.00);
      assert.strictEqual(result.settledAmount, 850.00);

      const result20 = calculatePromptPayDiscount(2540.00, 20.0);
      assert.strictEqual(result20.discountAmount, 508.00);
      assert.strictEqual(result20.settledAmount, 2032.00);
    });

    test('should aggregate executive portfolio KPIs accurately', () => {
      const mockBalances = [
        { originalBalanceAmount: 1000.00, adjustmentsAmount: 100.00, paidAmount: 400.00, status: 'PARTIALLY_PAID', isPaymentPlan: false },
        { originalBalanceAmount: 500.00, adjustmentsAmount: 0.00, paidAmount: 500.00, status: 'PAID_IN_FULL', isPaymentPlan: false },
        { originalBalanceAmount: 2000.00, adjustmentsAmount: 200.00, paidAmount: 0.00, status: 'PAYMENT_PLAN_ACTIVE', isPaymentPlan: true },
        { originalBalanceAmount: 800.00, adjustmentsAmount: 0.00, paidAmount: 100.00, status: 'DELINQUENT_PRE_COLLECTIONS', isPaymentPlan: false },
      ];

      const kpis = calculatePatientBalanceKpis(mockBalances);
      assert.strictEqual(kpis.totalOriginalDollars, 4300.00);
      assert.strictEqual(kpis.totalAdjustmentsDollars, 300.00);
      assert.strictEqual(kpis.totalCollectedDollars, 1000.00);
      assert.strictEqual(kpis.totalOutstandingDollars, 3000.00); // (500 + 0 + 1800 + 700)
      assert.strictEqual(kpis.paymentPlanCount, 1);
      assert.strictEqual(kpis.delinquentCount, 1);
      assert.strictEqual(kpis.delinquentDollars, 700.00);
      assert.strictEqual(kpis.paidInFullCount, 1);
      assert.strictEqual(kpis.collectionYieldPct, 23.3); // 1000 / 4300 * 100 = 23.255 -> 23.3
    });
  });

  describe('4. Baseline Dataset Health Check', () => {
    test('should supply valid baseline patient balances records', () => {
      const baseline = getBaselinePatientBalances();
      assert.ok(Array.isArray(baseline), 'Baseline must be an array');
      assert.ok(baseline.length >= 6, 'Baseline must contain at least 6 representative records');

      baseline.forEach(record => {
        assert.ok(record.id, 'Record must have an ID');
        assert.ok(record.facilityId, 'Record must have a facilityId');
        assert.ok(record.patientName, 'Record must have patientName');
        assert.ok(record.responsibilityType, 'Record must have responsibilityType');
        assert.ok(RESPONSIBILITY_TYPES[record.responsibilityType], 'Must be a valid responsibility type');
        assert.ok(record.status, 'Record must have status');
        assert.ok(BALANCE_STATUSES[record.status], 'Must be a valid status');
        assert.ok(typeof record.originalBalanceAmount === 'number', 'originalBalanceAmount must be numeric');
        assert.ok(record.originalBalanceAmount > 0, 'originalBalanceAmount must be positive');
      });
    });
  });

  describe('5. Database Migration Integrity (061_patient_balances.sql)', () => {
    const upMigrationPath = path.join(rootDir, 'supabase', 'migrations', '061_patient_balances.sql');
    const downMigrationPath = path.join(rootDir, 'supabase', 'migrations', '061_patient_balances_down.sql');

    test('should verify 061_patient_balances.sql exists and contains core tables and views', () => {
      assert.ok(fs.existsSync(upMigrationPath), '061_patient_balances.sql must exist');
      const sql = fs.readFileSync(upMigrationPath, 'utf8');

      // Core tables
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.rcm_patient_balances'), 'Must create rcm_patient_balances table');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.rcm_patient_balance_events'), 'Must create rcm_patient_balance_events table');

      // Stored generated column
      assert.ok(
        sql.includes('current_balance_amount NUMERIC(14,2) GENERATED ALWAYS AS (original_balance_amount - adjustments_amount - paid_amount) STORED'),
        'Must enforce current_balance_amount generated stored arithmetic'
      );

      // Views
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_rcm_patient_balances_aging'), 'Must create vw_rcm_patient_balances_aging view');
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_rcm_patient_collections_worklist'), 'Must create vw_rcm_patient_collections_worklist view');

      // Tenancy RLS policies
      assert.ok(sql.includes('ALTER TABLE public.rcm_patient_balances ENABLE ROW LEVEL SECURITY;'), 'Must enable RLS on rcm_patient_balances');
      assert.ok(sql.includes('facility_id IN (SELECT public.get_auth_user_facilities())'), 'Must isolate records by facility tenancy');

      // 1:1 DROP/CREATE POLICY statements
      const dropPolicyMatches = (sql.match(/DROP POLICY IF EXISTS/gi) || []).length;
      const createPolicyMatches = (sql.match(/CREATE POLICY/gi) || []).length;
      assert.strictEqual(dropPolicyMatches, createPolicyMatches, 'Must have 1:1 match between DROP POLICY and CREATE POLICY');
      assert.ok(createPolicyMatches >= 2, 'Must create at least 2 RLS policies');
    });

    test('should verify 061_patient_balances_down.sql cleanly rolls back all schema objects', () => {
      assert.ok(fs.existsSync(downMigrationPath), '061_patient_balances_down.sql must exist');
      const downSql = fs.readFileSync(downMigrationPath, 'utf8');

      assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_rcm_patient_collections_worklist'));
      assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_rcm_patient_balances_aging'));
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.rcm_patient_balance_events'));
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.rcm_patient_balances'));
    });
  });

  describe('6. Maestro Clinical Design System Governance (Purple Ban)', () => {
    test('should strictly forbid purple/violet/indigo/magenta/fuchsia tokens in PatientBalancesView.css', () => {
      const cssPath = path.join(rootDir, 'src', 'components', 'PatientBalancesView.css');
      assert.ok(fs.existsSync(cssPath), 'PatientBalancesView.css must exist');
      const cssRaw = fs.readFileSync(cssPath, 'utf8');
      // Strip comments before checking for forbidden tokens
      const css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, '');

      const forbiddenTokens = [
        'purple',
        'violet',
        'indigo',
        'fuchsia',
        'magenta'
      ];

      forbiddenTokens.forEach(token => {
        const regex = new RegExp(`\\b${token}\\b`, 'i');
        assert.ok(!regex.test(css), `PatientBalancesView.css contains forbidden design token "${token}"`);
      });
    });

    test('should strictly forbid purple/violet/indigo/magenta/fuchsia tokens in PatientBalancesView.jsx', () => {
      const jsxPath = path.join(rootDir, 'src', 'components', 'PatientBalancesView.jsx');
      assert.ok(fs.existsSync(jsxPath), 'PatientBalancesView.jsx must exist');
      const jsxRaw = fs.readFileSync(jsxPath, 'utf8');
      // Strip comments
      const jsx = jsxRaw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

      const forbiddenTokens = [
        'purple',
        'violet',
        'indigo',
        'fuchsia',
        'magenta'
      ];

      forbiddenTokens.forEach(token => {
        const regex = new RegExp(`\\b${token}\\b`, 'i');
        assert.ok(!regex.test(jsx), `PatientBalancesView.jsx contains forbidden design token "${token}"`);
      });
    });
  });

  describe('7. Application Routing & Master Specification Completeness', () => {
    test('should verify PatientBalancesView is wired into src/App.jsx', () => {
      const appJsxPath = path.join(rootDir, 'src', 'App.jsx');
      const appJsx = fs.readFileSync(appJsxPath, 'utf8');

      assert.ok(appJsx.includes("import PatientBalancesView from './components/PatientBalancesView'"), 'Must import PatientBalancesView');
      assert.ok(appJsx.includes("activeTab === 'patient_balances'"), 'Must bind activeTab patient_balances');
      assert.ok(appJsx.includes('<PatientBalancesView'), 'Must render PatientBalancesView');
    });

    test('should verify 87_PATIENT_BALANCES.md specification exists and has all required sections', () => {
      const specPath = path.join(rootDir, '..', 'ASCANALYST_All_Modules', 'ASCANALYST_MD_SPECS', 'Phase_08_RCM', '87_PATIENT_BALANCES.md');
      assert.ok(fs.existsSync(specPath), '87_PATIENT_BALANCES.md must exist in ASCANALYST_MD_SPECS');
      const spec = fs.readFileSync(specPath, 'utf8');

      const requiredSections = [
        '# 87 PATIENT BALANCES',
        '## Purpose',
        '## Scope',
        '## Current State',
        '## Target State',
        '## Data Model / Schema',
        '## Business Rules',
        '## Permissions / Security',
        '## API / Service Requirements',
        '## UI / Workflow Requirements',
        '## Audit / Provenance',
        '## QA / Test Cases',
        '## Acceptance Criteria',
        '## Dependencies',
        '## Definition of Done',
        '## Implementation Notes'
      ];

      requiredSections.forEach(section => {
        assert.ok(spec.includes(section), `Specification must contain section: ${section}`);
      });
    });
  });

});
