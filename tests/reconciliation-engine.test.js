import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import reconciliationService, {
  RECONCILIATION_STATUSES,
  DISCREPANCY_TYPES,
  DISPOSITION_ACTIONS,
  calculateReconciliationVariance,
  calculateBankDepositVariance,
  calculateExpectedUnderpayment,
  calculateReconciliationKpis,
  getBaselineReconciliationRecords
} from '../src/lib/reconciliationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 89 — Claim/Remittance/Payment Reconciliation Engine Suite', () => {

  describe('1. Match Statuses, Discrepancy Types & Dispositions Definitions', () => {
    test('should define all 7 reconciliation match statuses', () => {
      const statuses = Object.keys(RECONCILIATION_STATUSES);
      assert.strictEqual(statuses.length, 7, 'Must define exactly 7 reconciliation statuses');
      assert.ok(statuses.includes('FULLY_RECONCILED'));
      assert.ok(statuses.includes('PARTIALLY_RECONCILED'));
      assert.ok(statuses.includes('UNDERPAYMENT_DISCREPANCY'));
      assert.ok(statuses.includes('OVERPAYMENT_DISCREPANCY'));
      assert.ok(statuses.includes('UNMATCHED_REMITTANCE'));
      assert.ok(statuses.includes('SUSPENSE_UNIDENTIFIED_CASH'));
      assert.ok(statuses.includes('CLOSED_BALANCED'));
    });

    test('should define all 6 discrepancy exception types', () => {
      const types = Object.keys(DISCREPANCY_TYPES);
      assert.strictEqual(types.length, 6, 'Must define exactly 6 discrepancy types');
      assert.ok(types.includes('UNDERPAYMENT_CONTRACT_RATE'));
      assert.ok(types.includes('OVERPAYMENT_DUPLICATE'));
      assert.ok(types.includes('UNMATCHED_EFT_DEPOSIT'));
      assert.ok(types.includes('MISSING_ERA_REMITTANCE'));
      assert.ok(types.includes('UNBALANCED_CAS_SPLIT'));
      assert.ok(types.includes('UNAUTHORIZED_FEE_DISALLOWANCE'));
    });

    test('should define all 5 discrepancy resolution disposition actions', () => {
      const actions = Object.keys(DISPOSITION_ACTIONS);
      assert.strictEqual(actions.length, 5, 'Must define exactly 5 disposition actions');
      assert.ok(actions.includes('APPEAL_UNDERPAYMENT'));
      assert.ok(actions.includes('POST_CONTRACTUAL_CORRECTION'));
      assert.ok(actions.includes('REFUND_OVERPAYMENT'));
      assert.ok(actions.includes('MATCH_SUSPENSE_DEPOSIT'));
      assert.ok(actions.includes('WRITE_OFF'));
    });
  });

  describe('2. Deterministic Financial Invariant Calculations', () => {
    test('should enforce remittance balancing formula: Billed - (Paid + CO + PR)', () => {
      // Balanced claim: 8450 - (3950 + 4250 + 250) = 0.00
      assert.strictEqual(calculateReconciliationVariance(8450.00, 3950.00, 4250.00, 250.00), 0.00);

      // Underpaid claim: 11200 - (4600 + 5400 + 0) = 1200.00
      assert.strictEqual(calculateReconciliationVariance(11200.00, 4600.00, 5400.00, 0.00), 1200.00);

      // Overpaid claim: 5000 - (5200 + 0 + 0) = -200.00
      assert.strictEqual(calculateReconciliationVariance(5000.00, 5200.00, 0.00, 0.00), -200.00);

      assert.strictEqual(calculateReconciliationVariance(null, 0, 0, 0), 0.00);
    });

    test('should compute bank deposit variance accurately', () => {
      // Perfect match
      assert.strictEqual(calculateBankDepositVariance(3950.00, 3950.00), 0.00);

      // Unidentified cash in bank (deposit > remit)
      assert.strictEqual(calculateBankDepositVariance(2450.00, 0.00), 2450.00);

      // Unmatched remittance (remit > deposit)
      assert.strictEqual(calculateBankDepositVariance(0.00, 4100.00), -4100.00);
    });

    test('should detect contractual underpayment discrepancies accurately', () => {
      // Expected $5,800, Paid $4,600, PR $0 -> Underpayment = $1,200
      assert.strictEqual(calculateExpectedUnderpayment(5800.00, 4600.00, 0.00), 1200.00);

      // Expected $2,850, Paid $2,280, PR $570 -> Underpayment = $0 (fully covered)
      assert.strictEqual(calculateExpectedUnderpayment(2850.00, 2280.00, 570.00), 0.00);

      // Overpayment: Expected $3,000, Paid $3,500 -> Underpayment = $0 (floored at zero)
      assert.strictEqual(calculateExpectedUnderpayment(3000.00, 3500.00, 0.00), 0.00);
    });
  });

  describe('3. Executive KPI Aggregation & Benchmark Compliance', () => {
    test('should compute portfolio reconciliation metrics and match rate benchmark', () => {
      const mockRecords = [
        { billedAmount: 8450.00, remittancePaidAmount: 3950.00, varianceAmount: 0.00, status: 'FULLY_RECONCILED' },
        { billedAmount: 6200.00, remittancePaidAmount: 2280.00, varianceAmount: 0.00, status: 'FULLY_RECONCILED' },
        { billedAmount: 11200.00, remittancePaidAmount: 4600.00, varianceAmount: 1200.00, underpaymentAmount: 1200.00, status: 'UNDERPAYMENT_DISCREPANCY' }
      ];

      // Reconciled dollars = 3950 + 2280 = 6230. Underpayment = 1200. Total processed = 7430.
      // Match rate = (6230 / 7430) * 100 = 83.8%
      const kpis = calculateReconciliationKpis(mockRecords);
      assert.strictEqual(kpis.totalBilledDollars, 25850.00);
      assert.strictEqual(kpis.totalReconciledDollars, 6230.00);
      assert.strictEqual(kpis.totalUnderpaymentExposure, 1200.00);
      assert.strictEqual(kpis.cleanMatchRatePct, 83.8);
      assert.strictEqual(kpis.benchmarkPassed, false, '83.8% is below 98% target');
      assert.strictEqual(kpis.fullyReconciledCount, 2);
      assert.strictEqual(kpis.discrepancyCount, 1);
    });
  });

  describe('4. Baseline Dataset Health Check', () => {
    test('should supply valid baseline reconciliation records', () => {
      const baseline = getBaselineReconciliationRecords();
      assert.ok(Array.isArray(baseline), 'Baseline must be an array');
      assert.ok(baseline.length >= 6, 'Baseline must contain at least 6 representative records');

      baseline.forEach(rec => {
        assert.ok(rec.id, 'Record must have an id');
        assert.ok(rec.facilityId, 'Record must have a facilityId');
        assert.ok(rec.reconciliationControlNumber, 'Record must have reconciliationControlNumber');
        assert.ok(rec.claimNumber, 'Record must have a claimNumber');
        assert.ok(rec.status, 'Record must have a status');
        assert.ok(RECONCILIATION_STATUSES[rec.status], 'Status must be valid');
        assert.ok(typeof rec.billedAmount === 'number', 'billedAmount must be numeric');
        assert.ok(typeof rec.remittancePaidAmount === 'number', 'remittancePaidAmount must be numeric');
        assert.ok(typeof rec.varianceAmount === 'number', 'varianceAmount must be numeric');
      });
    });
  });

  describe('5. Database Migration Integrity (063_reconciliation_engine.sql)', () => {
    const upMigrationPath = path.join(rootDir, 'supabase', 'migrations', '063_reconciliation_engine.sql');
    const downMigrationPath = path.join(rootDir, 'supabase', 'migrations', '063_reconciliation_engine_down.sql');

    test('should verify 063_reconciliation_engine.sql exists and contains core tables and views', () => {
      assert.ok(fs.existsSync(upMigrationPath), '063_reconciliation_engine.sql must exist');
      const sql = fs.readFileSync(upMigrationPath, 'utf8');

      // Core tables
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.rcm_reconciliation_records'), 'Must create rcm_reconciliation_records table');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.rcm_reconciliation_discrepancies'), 'Must create rcm_reconciliation_discrepancies table');

      // Stored generated variance column
      assert.ok(
        sql.includes('variance_amount NUMERIC(14,2) GENERATED ALWAYS AS ('),
        'Must enforce stored generated variance arithmetic'
      );

      // Views
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_rcm_reconciliation_summary'), 'Must create vw_rcm_reconciliation_summary view');
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_rcm_discrepancy_worklist'), 'Must create vw_rcm_discrepancy_worklist view');

      // Tenancy RLS policies
      assert.ok(sql.includes('ALTER TABLE public.rcm_reconciliation_records ENABLE ROW LEVEL SECURITY;'), 'Must enable RLS on rcm_reconciliation_records');
      assert.ok(sql.includes('ALTER TABLE public.rcm_reconciliation_discrepancies ENABLE ROW LEVEL SECURITY;'), 'Must enable RLS on rcm_reconciliation_discrepancies');
      assert.ok(sql.includes('facility_id IN (SELECT public.get_auth_user_facilities())'), 'Must isolate records by facility tenancy');

      // 1:1 DROP/CREATE POLICY statements
      const dropPolicyMatches = (sql.match(/DROP POLICY IF EXISTS/gi) || []).length;
      const createPolicyMatches = (sql.match(/CREATE POLICY/gi) || []).length;
      assert.strictEqual(dropPolicyMatches, createPolicyMatches, 'Must have 1:1 match between DROP POLICY and CREATE POLICY');
      assert.ok(createPolicyMatches >= 2, 'Must create at least 2 RLS policies');
    });

    test('should verify 063_reconciliation_engine_down.sql cleanly rolls back all schema objects', () => {
      assert.ok(fs.existsSync(downMigrationPath), '063_reconciliation_engine_down.sql must exist');
      const downSql = fs.readFileSync(downMigrationPath, 'utf8');

      assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_rcm_discrepancy_worklist'));
      assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_rcm_reconciliation_summary'));
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.rcm_reconciliation_discrepancies'));
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.rcm_reconciliation_records'));
    });
  });

  describe('6. Maestro Clinical Design System Governance (Purple Ban)', () => {
    test('should strictly forbid purple/violet/indigo/magenta/fuchsia tokens in ReconciliationEngineView.css', () => {
      const cssPath = path.join(rootDir, 'src', 'components', 'ReconciliationEngineView.css');
      assert.ok(fs.existsSync(cssPath), 'ReconciliationEngineView.css must exist');
      const cssRaw = fs.readFileSync(cssPath, 'utf8');
      const css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, '');

      const forbiddenTokens = ['purple', 'violet', 'indigo', 'fuchsia', 'magenta'];
      forbiddenTokens.forEach(token => {
        const regex = new RegExp(`\\b${token}\\b`, 'i');
        assert.ok(!regex.test(css), `ReconciliationEngineView.css contains forbidden design token "${token}"`);
      });
    });

    test('should strictly forbid purple/violet/indigo/magenta/fuchsia tokens in ReconciliationEngineView.jsx', () => {
      const jsxPath = path.join(rootDir, 'src', 'components', 'ReconciliationEngineView.jsx');
      assert.ok(fs.existsSync(jsxPath), 'ReconciliationEngineView.jsx must exist');
      const jsxRaw = fs.readFileSync(jsxPath, 'utf8');
      const jsx = jsxRaw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

      const forbiddenTokens = ['purple', 'violet', 'indigo', 'fuchsia', 'magenta'];
      forbiddenTokens.forEach(token => {
        const regex = new RegExp(`\\b${token}\\b`, 'i');
        assert.ok(!regex.test(jsx), `ReconciliationEngineView.jsx contains forbidden design token "${token}"`);
      });
    });
  });

  describe('7. Application Routing & Master Specification Completeness', () => {
    test('should verify ReconciliationEngineView is wired into src/App.jsx', () => {
      const appJsxPath = path.join(rootDir, 'src', 'App.jsx');
      const appJsx = fs.readFileSync(appJsxPath, 'utf8');

      assert.ok(appJsx.includes("import ReconciliationEngineView from './components/ReconciliationEngineView'"), 'Must import ReconciliationEngineView');
      assert.ok(appJsx.includes("activeTab === 'reconciliation_engine'"), 'Must bind activeTab reconciliation_engine');
      assert.ok(appJsx.includes('<ReconciliationEngineView'), 'Must render ReconciliationEngineView');
    });

    test('should verify 89_RECONCILIATION_ENGINE.md specification exists and has all required sections', () => {
      const specPath = path.join(rootDir, '..', 'ASCANALYST_All_Modules', 'ASCANALYST_MD_SPECS', 'Phase_08_RCM', '89_RECONCILIATION_ENGINE.md');
      assert.ok(fs.existsSync(specPath), '89_RECONCILIATION_ENGINE.md must exist in ASCANALYST_MD_SPECS');
      const spec = fs.readFileSync(specPath, 'utf8');

      const requiredSections = [
        '# 89 RECONCILIATION ENGINE',
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
