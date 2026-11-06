import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import arAgingService, {
  AGING_BUCKETS,
  FINANCIAL_CLASSES,
  WORK_QUEUE_DEFINITIONS,
  TOUCH_ACTION_TYPES,
  calculateAgingDays,
  classifyAgingBucket,
  calculateWorkItemPriority,
  calculateDaysSalesOutstanding,
  calculateArKpis,
  getBaselineArClaims
} from '../src/lib/arAgingService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 88 — AR Aging, Definitions, Calculations & Work Queues Suite', () => {

  describe('1. GAAP Aging Buckets & Financial Classes Definitions', () => {
    test('should define all 6 standard ASC GAAP aging buckets', () => {
      const buckets = Object.keys(AGING_BUCKETS);
      assert.strictEqual(buckets.length, 6, 'Must define exactly 6 GAAP aging buckets');
      assert.ok(buckets.includes('BUCKET_0_30'));
      assert.ok(buckets.includes('BUCKET_31_60'));
      assert.ok(buckets.includes('BUCKET_61_90'));
      assert.ok(buckets.includes('BUCKET_91_120'));
      assert.ok(buckets.includes('BUCKET_121_150'));
      assert.ok(buckets.includes('BUCKET_150_PLUS'));

      assert.strictEqual(AGING_BUCKETS.BUCKET_0_30.id, '0_30');
      assert.strictEqual(AGING_BUCKETS.BUCKET_150_PLUS.id, '150_PLUS');
    });

    test('should define all 5 healthcare financial classes', () => {
      const classes = Object.keys(FINANCIAL_CLASSES);
      assert.strictEqual(classes.length, 5, 'Must define 5 financial classes');
      assert.ok(classes.includes('COMMERCIAL'));
      assert.ok(classes.includes('MEDICARE'));
      assert.ok(classes.includes('MEDICAID'));
      assert.ok(classes.includes('WORKERS_COMP'));
      assert.ok(classes.includes('SELF_PAY'));
    });

    test('should define core collector work queues and touch action types', () => {
      const queues = Object.keys(WORK_QUEUE_DEFINITIONS);
      assert.ok(queues.length >= 5, 'Must define at least 5 work queue categories');
      assert.ok(queues.includes('HIGH_DOLLAR'));
      assert.ok(queues.includes('AGING_90_PLUS'));

      const actions = Object.keys(TOUCH_ACTION_TYPES);
      assert.ok(actions.length >= 8, 'Must define at least 8 collector touch actions');
      assert.ok(actions.includes('PAYER_CALL'));
      assert.ok(actions.includes('PORTAL_STATUS_CHECK'));
      assert.ok(actions.includes('PROMISE_TO_PAY_LOGGED'));
    });
  });

  describe('2. Dual Aging Days & Bucket Classification Logic', () => {
    test('should compute aging days accurately given target date and base date', () => {
      const today = '2026-11-06T00:00:00Z';
      assert.strictEqual(calculateAgingDays('2026-11-06T00:00:00Z', today), 0);
      assert.strictEqual(calculateAgingDays('2026-10-22T00:00:00Z', today), 15);
      assert.strictEqual(calculateAgingDays('2026-09-22T00:00:00Z', today), 45);
      assert.strictEqual(calculateAgingDays('2026-08-08T00:00:00Z', today), 90);
      assert.strictEqual(calculateAgingDays('2026-07-09T00:00:00Z', today), 120);
      assert.strictEqual(calculateAgingDays('2026-06-09T00:00:00Z', today), 150);
      assert.strictEqual(calculateAgingDays('2026-05-10T00:00:00Z', today), 180);
      assert.strictEqual(calculateAgingDays(null), 0);
    });

    test('should classify days into correct 6 GAAP aging buckets across exact boundaries', () => {
      assert.strictEqual(classifyAgingBucket(0).id, '0_30');
      assert.strictEqual(classifyAgingBucket(30).id, '0_30');
      assert.strictEqual(classifyAgingBucket(31).id, '31_60');
      assert.strictEqual(classifyAgingBucket(60).id, '31_60');
      assert.strictEqual(classifyAgingBucket(61).id, '61_90');
      assert.strictEqual(classifyAgingBucket(90).id, '61_90');
      assert.strictEqual(classifyAgingBucket(91).id, '91_120');
      assert.strictEqual(classifyAgingBucket(120).id, '91_120');
      assert.strictEqual(classifyAgingBucket(121).id, '121_150');
      assert.strictEqual(classifyAgingBucket(150).id, '121_150');
      assert.strictEqual(classifyAgingBucket(151).id, '150_PLUS');
      assert.strictEqual(classifyAgingBucket(365).id, '150_PLUS');
    });
  });

  describe('3. Collector Priority Scoring & Financial Metrics', () => {
    test('should calculate work queue priority score deterministically', () => {
      // High urgency claim: 100 days old, $8,000 balance, untouched for 30 days
      // (100 * 0.3) + ((8000/100) * 0.4) + (30 * 0.3) = 30 + 32 + 9 = 71.0
      const scoreHigh = calculateWorkItemPriority(100, 8000.00, 30);
      assert.strictEqual(scoreHigh, 71.0);

      // Low urgency claim: 15 days old, $500 balance, untouched for 2 days
      // (15 * 0.3) + ((500/100) * 0.4) + (2 * 0.3) = 4.5 + 2.0 + 0.6 = 7.1
      const scoreLow = calculateWorkItemPriority(15, 500.00, 2);
      assert.strictEqual(scoreLow, 7.1);

      // Clamped ceiling: max 100.0
      const scoreMax = calculateWorkItemPriority(200, 25000.00, 90);
      assert.strictEqual(scoreMax, 100.0);
    });

    test('should calculate Days Sales Outstanding (DSO) accurately', () => {
      // Total AR = $450,000, Average daily charge = $15,000 -> DSO = 30.0 days
      assert.strictEqual(calculateDaysSalesOutstanding(450000.00, 15000.00), 30.0);
      assert.strictEqual(calculateDaysSalesOutstanding(630000.00, 15000.00), 42.0);
      assert.strictEqual(calculateDaysSalesOutstanding(0, 15000.00), 0.0);
      assert.strictEqual(calculateDaysSalesOutstanding(100000.00, 0), 0.0);
    });

    test('should aggregate executive portfolio KPIs and ASC >90d benchmark compliance', () => {
      const mockClaims = [
        { outstandingArBalance: 10000.00, totalGrossCharge: 20000.00, agingDaysDos: 20, agingDaysBill: 15, financialClass: 'COMMERCIAL' },
        { outstandingArBalance: 15000.00, totalGrossCharge: 30000.00, agingDaysDos: 45, agingDaysBill: 40, financialClass: 'COMMERCIAL' },
        { outstandingArBalance: 5000.00, totalGrossCharge: 10000.00, agingDaysDos: 80, agingDaysBill: 75, financialClass: 'MEDICARE' },
        { outstandingArBalance: 2000.00, totalGrossCharge: 5000.00, agingDaysDos: 110, agingDaysBill: 105, financialClass: 'WORKERS_COMP' } // >90d
      ];

      // Total AR = $32,000. AR > 90d = $2,000 (6.25% -> 6.3%)
      const kpis = calculateArKpis(mockClaims, 1000.00, 'DOS');
      assert.strictEqual(kpis.totalArBalance, 32000.00);
      assert.strictEqual(kpis.totalClaimsCount, 4);
      assert.strictEqual(kpis.arOver90Dollars, 2000.00);
      assert.strictEqual(kpis.pctArOver90Days, 6.3);
      assert.strictEqual(kpis.benchmarkPassed, true, '6.3% is below 15.0% ASC threshold, should pass');
      assert.strictEqual(kpis.daysSalesOutstanding, 32.0); // 32000 / 1000
    });
  });

  describe('4. Baseline AR Claims Dataset Health Check', () => {
    test('should provide a rich baseline dataset of open ASC claims', () => {
      const baseline = getBaselineArClaims();
      assert.ok(Array.isArray(baseline), 'Baseline must be an array');
      assert.ok(baseline.length >= 6, 'Baseline must contain at least 6 claims');

      baseline.forEach(claim => {
        assert.ok(claim.id, 'Claim must have an id');
        assert.ok(claim.facilityId, 'Claim must have a facilityId');
        assert.ok(claim.claimNumber, 'Claim must have a claimNumber');
        assert.ok(claim.financialClass, 'Claim must have a financialClass');
        assert.ok(FINANCIAL_CLASSES[claim.financialClass], 'Financial class must be valid');
        assert.ok(typeof claim.outstandingArBalance === 'number', 'outstandingArBalance must be numeric');
        assert.ok(claim.outstandingArBalance > 0, 'outstandingArBalance must be positive');
        assert.ok(typeof claim.agingDaysDos === 'number', 'agingDaysDos must be numeric');
        assert.ok(typeof claim.agingDaysBill === 'number', 'agingDaysBill must be numeric');
      });
    });
  });

  describe('5. Database Migration Integrity (062_ar_aging.sql)', () => {
    const upMigrationPath = path.join(rootDir, 'supabase', 'migrations', '062_ar_aging.sql');
    const downMigrationPath = path.join(rootDir, 'supabase', 'migrations', '062_ar_aging_down.sql');

    test('should verify 062_ar_aging.sql exists and contains core tables and views', () => {
      assert.ok(fs.existsSync(upMigrationPath), '062_ar_aging.sql must exist');
      const sql = fs.readFileSync(upMigrationPath, 'utf8');

      // Core tables
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.rcm_ar_work_queues'), 'Must create rcm_ar_work_queues table');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.rcm_ar_work_items'), 'Must create rcm_ar_work_items table');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.rcm_ar_touches'), 'Must create rcm_ar_touches table');

      // Analytical Views
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_rcm_ar_aging_summary'), 'Must create vw_rcm_ar_aging_summary view');
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_rcm_ar_payer_class_summary'), 'Must create vw_rcm_ar_payer_class_summary view');

      // Tenancy RLS policies
      assert.ok(sql.includes('ALTER TABLE public.rcm_ar_work_queues ENABLE ROW LEVEL SECURITY;'), 'Must enable RLS on rcm_ar_work_queues');
      assert.ok(sql.includes('ALTER TABLE public.rcm_ar_work_items ENABLE ROW LEVEL SECURITY;'), 'Must enable RLS on rcm_ar_work_items');
      assert.ok(sql.includes('ALTER TABLE public.rcm_ar_touches ENABLE ROW LEVEL SECURITY;'), 'Must enable RLS on rcm_ar_touches');
      assert.ok(sql.includes('facility_id IN (SELECT public.get_auth_user_facilities())'), 'Must isolate records by facility tenancy');

      // 1:1 DROP/CREATE POLICY statements
      const dropPolicyMatches = (sql.match(/DROP POLICY IF EXISTS/gi) || []).length;
      const createPolicyMatches = (sql.match(/CREATE POLICY/gi) || []).length;
      assert.strictEqual(dropPolicyMatches, createPolicyMatches, 'Must have 1:1 match between DROP POLICY and CREATE POLICY');
      assert.ok(createPolicyMatches >= 3, 'Must create at least 3 RLS policies');
    });

    test('should verify 062_ar_aging_down.sql cleanly rolls back all schema objects', () => {
      assert.ok(fs.existsSync(downMigrationPath), '062_ar_aging_down.sql must exist');
      const downSql = fs.readFileSync(downMigrationPath, 'utf8');

      assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_rcm_ar_payer_class_summary'));
      assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_rcm_ar_aging_summary'));
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.rcm_ar_touches'));
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.rcm_ar_work_items'));
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.rcm_ar_work_queues'));
    });
  });

  describe('6. Maestro Clinical Design System Governance (Purple Ban)', () => {
    test('should strictly forbid purple/violet/indigo/magenta/fuchsia tokens in ArAgingView.css', () => {
      const cssPath = path.join(rootDir, 'src', 'components', 'ArAgingView.css');
      assert.ok(fs.existsSync(cssPath), 'ArAgingView.css must exist');
      const cssRaw = fs.readFileSync(cssPath, 'utf8');
      const css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, '');

      const forbiddenTokens = ['purple', 'violet', 'indigo', 'fuchsia', 'magenta'];
      forbiddenTokens.forEach(token => {
        const regex = new RegExp(`\\b${token}\\b`, 'i');
        assert.ok(!regex.test(css), `ArAgingView.css contains forbidden design token "${token}"`);
      });
    });

    test('should strictly forbid purple/violet/indigo/magenta/fuchsia tokens in ArAgingView.jsx', () => {
      const jsxPath = path.join(rootDir, 'src', 'components', 'ArAgingView.jsx');
      assert.ok(fs.existsSync(jsxPath), 'ArAgingView.jsx must exist');
      const jsxRaw = fs.readFileSync(jsxPath, 'utf8');
      const jsx = jsxRaw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

      const forbiddenTokens = ['purple', 'violet', 'indigo', 'fuchsia', 'magenta'];
      forbiddenTokens.forEach(token => {
        const regex = new RegExp(`\\b${token}\\b`, 'i');
        assert.ok(!regex.test(jsx), `ArAgingView.jsx contains forbidden design token "${token}"`);
      });
    });
  });

  describe('7. Application Routing & Master Specification Completeness', () => {
    test('should verify ArAgingView is wired into src/App.jsx', () => {
      const appJsxPath = path.join(rootDir, 'src', 'App.jsx');
      const appJsx = fs.readFileSync(appJsxPath, 'utf8');

      assert.ok(appJsx.includes("import ArAgingView from './components/ArAgingView'"), 'Must import ArAgingView');
      assert.ok(appJsx.includes("activeTab === 'ar_aging'"), 'Must bind activeTab ar_aging');
      assert.ok(appJsx.includes('<ArAgingView'), 'Must render ArAgingView');
    });

    test('should verify 88_AR_AGING.md specification exists and has all required sections', () => {
      const specPath = path.join(rootDir, '..', 'ASCANALYST_All_Modules', 'ASCANALYST_MD_SPECS', 'Phase_08_RCM', '88_AR_AGING.md');
      assert.ok(fs.existsSync(specPath), '88_AR_AGING.md must exist in ASCANALYST_MD_SPECS');
      const spec = fs.readFileSync(specPath, 'utf8');

      const requiredSections = [
        '# 88 AR AGING',
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

