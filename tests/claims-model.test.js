/**
 * ==============================================================================
 * TEST SUITE: Phase 80 — Claims Model & Revenue Cycle Management (RCM)
 * ==============================================================================
 * Verifies domain enums, deterministic financial balances, lifecycle state transitions,
 * baseline sample data, database migration schema integrity, and Maestro UI compliance.
 * ==============================================================================
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  claimsService,
  CLAIM_LIFECYCLE_STATUSES,
  CLAIM_STATUS_CONFIG,
  BILLING_FORMATS,
  CLAIM_FREQUENCY_TYPES,
  ASC_REVENUE_CODES,
  calculateClaimBalances,
  validateStateTransition,
  calculateFacilityRcmKpis
} from '../src/lib/claimsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 80 — Claims Model Verification Suite', () => {

  describe('1. Canonical Enums & Metadata', () => {
    test('Exports all canonical claim lifecycle statuses', () => {
      assert.ok(CLAIM_LIFECYCLE_STATUSES.DRAFT);
      assert.ok(CLAIM_LIFECYCLE_STATUSES.READY_TO_SCRUB);
      assert.ok(CLAIM_LIFECYCLE_STATUSES.SCRUB_FAILED);
      assert.ok(CLAIM_LIFECYCLE_STATUSES.SCRUB_PASSED);
      assert.ok(CLAIM_LIFECYCLE_STATUSES.READY_TO_TRANSMIT);
      assert.ok(CLAIM_LIFECYCLE_STATUSES.TRANSMITTED);
      assert.ok(CLAIM_LIFECYCLE_STATUSES.ACCEPTED_CLEARINGHOUSE);
      assert.ok(CLAIM_LIFECYCLE_STATUSES.ACCEPTED_PAYER);
      assert.ok(CLAIM_LIFECYCLE_STATUSES.IN_ADJUDICATION);
      assert.ok(CLAIM_LIFECYCLE_STATUSES.PAID);
      assert.ok(CLAIM_LIFECYCLE_STATUSES.PARTIALLY_PAID);
      assert.ok(CLAIM_LIFECYCLE_STATUSES.DENIED);
      assert.ok(CLAIM_LIFECYCLE_STATUSES.APPEALED);
      assert.ok(CLAIM_LIFECYCLE_STATUSES.REBILLED);
      assert.ok(CLAIM_LIFECYCLE_STATUSES.VOIDED);
      assert.ok(CLAIM_LIFECYCLE_STATUSES.CLOSED_BALANCED);
      assert.strictEqual(Object.keys(CLAIM_LIFECYCLE_STATUSES).length, 19);
    });

    test('Every lifecycle status has valid Maestro color tokens and configuration metadata', () => {
      Object.entries(CLAIM_STATUS_CONFIG).forEach(([status, cfg]) => {
        assert.ok(cfg.label, `Status ${status} must have label`);
        assert.ok(cfg.shortLabel, `Status ${status} must have shortLabel`);
        assert.ok(cfg.badgeClass, `Status ${status} must have badgeClass`);
        assert.ok(cfg.stage, `Status ${status} must have stage`);
        assert.match(cfg.color, /^#[0-9a-fA-F]{6}$/, `Color for ${status} must be valid hex`);
      });
    });

    test('Exports institutional and professional billing formats', () => {
      assert.strictEqual(BILLING_FORMATS.UB04_INSTITUTIONAL, 'UB04_INSTITUTIONAL');
      assert.strictEqual(BILLING_FORMATS.CMS1500_PROFESSIONAL, 'CMS1500_PROFESSIONAL');
    });

    test('Exports standard claim frequency types', () => {
      assert.strictEqual(CLAIM_FREQUENCY_TYPES.ORIGINAL, '1');
      assert.strictEqual(CLAIM_FREQUENCY_TYPES.REPLACEMENT, '7');
      assert.strictEqual(CLAIM_FREQUENCY_TYPES.VOID, '8');
    });

    test('Exports ASC UB-04 revenue codes including 0490 and 0272', () => {
      assert.ok(ASC_REVENUE_CODES['0490'], 'Must include 0490 ASC surgical rate');
      assert.ok(ASC_REVENUE_CODES['0272'], 'Must include 0272 sterile supply/implants');
      assert.ok(ASC_REVENUE_CODES['0250'], 'Must include 0250 pharmacy');
      assert.ok(ASC_REVENUE_CODES['0360'], 'Must include 0360 operating room services');
    });
  });

  describe('2. Deterministic Financial Math & State Transitions', () => {
    test('calculateClaimBalances accurately sums child line charges, allowed, paid, write-offs, and coinsurance', () => {
      const mockLines = [
        {
          grossCharge: 3000.00,
          allowedAmount: 1800.00,
          paidAmount: 1440.00,
          contractualAdjustment: 1200.00,
          patientCopay: 0.00,
          patientCoinsurance: 360.00,
          patientDeductible: 0.00,
          disallowedAmount: 0.00
        },
        {
          grossCharge: 1000.00,
          allowedAmount: 600.00,
          paidAmount: 480.00,
          contractualAdjustment: 400.00,
          patientCopay: 0.00,
          patientCoinsurance: 120.00,
          patientDeductible: 0.00,
          disallowedAmount: 0.00
        }
      ];

      const res = calculateClaimBalances({}, mockLines);

      assert.strictEqual(res.totalGrossCharge, 4000.00);
      assert.strictEqual(res.totalAllowedAmount, 2400.00);
      assert.strictEqual(res.totalPaidAmount, 1920.00);
      assert.strictEqual(res.totalContractualAdjustment, 1600.00);
      assert.strictEqual(res.totalPatientBalance, 480.00);
      assert.strictEqual(res.outstandingArBalance, 0.00);
      assert.strictEqual(res.lineCount, 2);
      assert.strictEqual(res.paymentYieldPct, 48.00);
    });

    test('calculateClaimBalances computes remaining outstanding AR on unadjudicated claims', () => {
      const mockLines = [
        {
          grossCharge: 5000.00,
          allowedAmount: 2500.00,
          paidAmount: 0.00,
          contractualAdjustment: 0.00,
          patientCopay: 0.00,
          patientCoinsurance: 0.00,
          patientDeductible: 0.00
        }
      ];

      const res = calculateClaimBalances({}, mockLines);

      assert.strictEqual(res.totalGrossCharge, 5000.00);
      assert.strictEqual(res.totalPaidAmount, 0.00);
      assert.strictEqual(res.outstandingArBalance, 5000.00);
      assert.strictEqual(res.paymentYieldPct, 0.00);
    });

    test('validateStateTransition blocks direct transition from PAID or CLOSED_BALANCED to DRAFT', () => {
      const res1 = validateStateTransition(CLAIM_LIFECYCLE_STATUSES.PAID, CLAIM_LIFECYCLE_STATUSES.DRAFT);
      assert.strictEqual(res1.isValid, false);
      assert.ok(res1.reason.includes('Reconciled or Paid claims cannot be reverted'));

      const res2 = validateStateTransition(CLAIM_LIFECYCLE_STATUSES.CLOSED_BALANCED, CLAIM_LIFECYCLE_STATUSES.DRAFT);
      assert.strictEqual(res2.isValid, false);
    });

    test('validateStateTransition blocks transition from DRAFT to TRANSMITTED without scrubbing', () => {
      const res = validateStateTransition(CLAIM_LIFECYCLE_STATUSES.DRAFT, CLAIM_LIFECYCLE_STATUSES.TRANSMITTED);
      assert.strictEqual(res.isValid, false);
      assert.ok(res.reason.includes('pre-submission claim scrubbing'));
    });

    test('validateStateTransition permits valid sequential transitions', () => {
      const res1 = validateStateTransition(CLAIM_LIFECYCLE_STATUSES.DRAFT, CLAIM_LIFECYCLE_STATUSES.READY_TO_SCRUB);
      assert.strictEqual(res1.isValid, true);

      const res2 = validateStateTransition(CLAIM_LIFECYCLE_STATUSES.SCRUB_PASSED, CLAIM_LIFECYCLE_STATUSES.READY_TO_TRANSMIT);
      assert.strictEqual(res2.isValid, true);

      const res3 = validateStateTransition(CLAIM_LIFECYCLE_STATUSES.IN_ADJUDICATION, CLAIM_LIFECYCLE_STATUSES.PAID);
      assert.strictEqual(res3.isValid, true);
    });

    test('calculateFacilityRcmKpis computes accurate portfolio-level AR and clean claim rates', () => {
      const testClaims = [
        { totalGrossCharge: 3000, totalPaidAmount: 1500, outstandingArBalance: 0, rcmStatus: 'PAID', scrubStatus: 'SCRUB_PASSED' },
        { totalGrossCharge: 5000, totalPaidAmount: 0, outstandingArBalance: 5000, rcmStatus: 'IN_ADJUDICATION', totalAllowedAmount: 2800, scrubStatus: 'SCRUB_PASSED' },
        { totalGrossCharge: 2000, totalPaidAmount: 0, outstandingArBalance: 2000, rcmStatus: 'DENIED', scrubStatus: 'SCRUB_PASSED' },
        { totalGrossCharge: 1500, totalPaidAmount: 0, outstandingArBalance: 1500, rcmStatus: 'SCRUB_FAILED', scrubStatus: 'SCRUB_FAILED' }
      ];

      const kpis = calculateFacilityRcmKpis(testClaims);

      assert.strictEqual(kpis.totalClaims, 4);
      assert.strictEqual(kpis.totalActiveAr, 8500.00);
      assert.strictEqual(kpis.cleanClaimRate, 75.00); // 3 of 4 clean
      assert.strictEqual(kpis.pendingAdjudicationAmount, 2800.00);
      assert.strictEqual(kpis.deniedAtRiskAmount, 2000.00);
      assert.strictEqual(kpis.totalBilledAmount, 11500.00);
      assert.strictEqual(kpis.totalCollectedAmount, 1500.00);
    });
  });

  describe('3. Multi-Level Baseline Sample Data', () => {
    const data = claimsService.getBaselineSampleData();

    test('getBaselineSampleData returns substantive claims and EDI audit events', () => {
      assert.ok(data.claims && data.claims.length >= 6);
      assert.ok(data.auditHistory && data.auditHistory.length >= 5);
    });

    test('Sample claims include UB-04 institutional claims with ASC revenue codes', () => {
      const ub04Claim = data.claims.find(c => c.billingFormat === BILLING_FORMATS.UB04_INSTITUTIONAL);
      assert.ok(ub04Claim, 'Must have at least one UB-04 institutional claim');
      assert.ok(ub04Claim.lines.length >= 1);

      const hasSurgicalRevCode = ub04Claim.lines.some(l => l.revenueCode === '0490');
      assert.ok(hasSurgicalRevCode, 'UB-04 claim lines must contain revenue code 0490');
    });

    test('Sample claims cover diverse RCM stages including PAID, IN_ADJUDICATION, SCRUB_FAILED, and DENIED', () => {
      const statuses = data.claims.map(c => c.rcmStatus);
      assert.ok(statuses.includes(CLAIM_LIFECYCLE_STATUSES.PAID));
      assert.ok(statuses.includes(CLAIM_LIFECYCLE_STATUSES.IN_ADJUDICATION));
      assert.ok(statuses.includes(CLAIM_LIFECYCLE_STATUSES.DENIED));
      assert.ok(statuses.includes(CLAIM_LIFECYCLE_STATUSES.SCRUB_FAILED));
    });
  });

  describe('4. Database Migration & Schema Integrity (054_claims_model.sql)', () => {
    const migrationPath = path.join(rootDir, 'supabase', 'migrations', '054_claims_model.sql');
    const downMigrationPath = path.join(rootDir, 'supabase', 'migrations', '054_claims_model_down.sql');

    test('Migration 054 forward and down SQL files exist and are substantive', () => {
      assert.ok(fs.existsSync(migrationPath), 'Forward migration 054 must exist');
      assert.ok(fs.existsSync(downMigrationPath), 'Down migration 054 must exist');

      const fwd = fs.readFileSync(migrationPath, 'utf8');
      const down = fs.readFileSync(downMigrationPath, 'utf8');

      assert.ok(fwd.length > 500, 'Forward migration must be substantive');
      assert.ok(down.length > 200, 'Down migration must be substantive');
    });

    test('Migration 054 extends public.claims with RCM lifecycle and trace identifiers', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');

      assert.ok(sql.includes('ALTER TABLE public.claims'));
      assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS rcm_status VARCHAR(32)'));
      assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS billing_format VARCHAR(24)'));
      assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS clearinghouse_claim_id VARCHAR(64)'));
      assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS payer_claim_control_number VARCHAR(64)'));
      assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS transmission_batch_id VARCHAR(64)'));
      assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS total_allowed_amount NUMERIC(14,2)'));
      assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS total_paid_amount NUMERIC(14,2)'));
      assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS outstanding_ar_balance NUMERIC(14,2)'));
    });

    test('Migration 054 extends public.claim_lines with revenue codes and adjudication columns', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');

      assert.ok(sql.includes('ALTER TABLE public.claim_lines'));
      assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS revenue_code VARCHAR(4)'));
      assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS line_rcm_status VARCHAR(32)'));
      assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS allowed_amount NUMERIC(14,2)'));
      assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(14,2)'));
      assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS contractual_adjustment NUMERIC(14,2)'));
      assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS patient_coinsurance NUMERIC(14,2)'));
    });

    test('Migration 054 creates public.claim_lifecycle_history with RLS policies and rollup views', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');

      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.claim_lifecycle_history'));
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_claims_rcm_summary AS'));
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_claim_line_adjudication AS'));
      assert.ok(sql.includes('ALTER TABLE public.claim_lifecycle_history ENABLE ROW LEVEL SECURITY;'));
      assert.ok(sql.includes('public.is_facility_accessible(facility_id)'));
    });

    test('Down migration 054 drops views, audit table, and removes added columns in reverse order', () => {
      const downSql = fs.readFileSync(downMigrationPath, 'utf8');

      assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_claim_line_adjudication CASCADE;'));
      assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_claims_rcm_summary CASCADE;'));
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.claim_lifecycle_history CASCADE;'));
      assert.ok(downSql.includes('ALTER TABLE public.claim_lines'));
      assert.ok(downSql.includes('DROP COLUMN IF EXISTS revenue_code'));
      assert.ok(downSql.includes('ALTER TABLE public.claims'));
      assert.ok(downSql.includes('DROP COLUMN IF EXISTS rcm_status'));
    });
  });

  describe('5. Maestro Design System & Application Wiring', () => {
    test('ClaimsModelView.jsx and CSS obey strict Color Governance (Zero disallowed tokens)', () => {
      const jsxPath = path.join(rootDir, 'src', 'components', 'ClaimsModelView.jsx');
      const cssPath = path.join(rootDir, 'src', 'components', 'ClaimsModelView.css');

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

    test('ClaimsModelView includes responsive table wrapper with min-width 1100px', () => {
      const jsx = fs.readFileSync(path.join(rootDir, 'src', 'components', 'ClaimsModelView.jsx'), 'utf8');
      const css = fs.readFileSync(path.join(rootDir, 'src', 'components', 'ClaimsModelView.css'), 'utf8');

      assert.ok(jsx.includes('className="table-responsive"'), 'JSX must include table-responsive wrapper');
      assert.ok(css.includes('min-width: 1100px'), 'CSS must specify min-width: 1100px on table');
    });

    test('App.jsx integrates ClaimsModelView into sidebar navigation and routing', () => {
      const appJsx = fs.readFileSync(path.join(rootDir, 'src', 'App.jsx'), 'utf8');

      assert.ok(appJsx.includes("import ClaimsModelView from './components/ClaimsModelView'"), 'App.jsx must import component');
      assert.ok(appJsx.includes("activeTab === 'claims_model'"), 'App.jsx must have tab active state');
      assert.ok(appJsx.includes('<ClaimsModelView />'), 'App.jsx must render component');
      assert.ok(appJsx.includes('Claims Management & Lifecycle'), 'App.jsx must have menu item text');
    });
  });
});

