/**
 * ==============================================================================
 * Phase 71: Case Financial Ledger & Contribution Margin Engine Test Suite
 * ==============================================================================
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  caseFinancialLedgerService,
  LEDGER_ENTRY_TYPES,
  LEDGER_CATEGORIES,
  LEDGER_STATUSES,
  ENTRY_TYPE_CONFIG
} from '../src/lib/caseFinancialLedgerService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 71 — Case Financial Ledger Verification Suite', () => {

  describe('1. Entry Type Schema & Accounting Configurations', () => {
    test('Exports all 12 canonical ledger entry types', () => {
      const expectedTypes = [
        'CHARGE',
        'EXPECTED_ALLOWABLE',
        'PAYER_PAYMENT',
        'PATIENT_PAYMENT',
        'SECONDARY_PAYMENT',
        'CONTRACTUAL_ADJUSTMENT',
        'ADMIN_WRITE_OFF',
        'REFUND_RECOUPMENT',
        'IMPLANT_COST',
        'SUPPLY_COST',
        'LABOR_COST',
        'OR_TIME_COST'
      ];

      expectedTypes.forEach(t => {
        assert.ok(LEDGER_ENTRY_TYPES[t], `Entry type ${t} must be exported`);
        assert.strictEqual(LEDGER_ENTRY_TYPES[t], t);
      });
    });

    test('Every entry type has authoritative accounting sign and category configuration', () => {
      Object.keys(LEDGER_ENTRY_TYPES).forEach(typeKey => {
        const type = LEDGER_ENTRY_TYPES[typeKey];
        const config = ENTRY_TYPE_CONFIG[type];
        assert.ok(config, `Config must exist for ${type}`);
        assert.ok(config.label, `Label must exist for ${type}`);
        assert.ok(Object.values(LEDGER_CATEGORIES).includes(config.category), `Valid category required for ${type}`);
        assert.ok([-1, 0, 1].includes(config.sign), `Sign must be -1, 0, or 1 for ${type}`);
        assert.strictEqual(typeof config.isBalanceAffecting, 'boolean');
        assert.strictEqual(typeof config.isDirectCost, 'boolean');
      });
    });
  });

  describe('2. Deterministic Journal Entries & Running Balance Calculations', () => {
    test('Retrieves sample case entries with accurate running AR balance', () => {
      const entries = caseFinancialLedgerService.getCaseLedgerEntries(999);
      assert.ok(Array.isArray(entries) && entries.length >= 8, 'Must return at least 8 initial seed entries');

      const firstCharge = entries.find(e => e.entry_type === LEDGER_ENTRY_TYPES.CHARGE);
      assert.ok(firstCharge, 'Charge entry must exist');
      assert.strictEqual(firstCharge.amount, 14500.00);

      const lastEntry = entries[entries.length - 1];
      assert.ok(lastEntry.running_patient_ar_balance !== undefined, 'Must calculate running balance');
      // Balance = 14500 (charge) - 10250 (contractual adj) - 3850 (payer payment) - 400 (patient payment) = 0.00
      assert.strictEqual(lastEntry.running_patient_ar_balance, 0.00);
    });

    test('Posting a valid payment entry appends to journal with audit hash chaining', () => {
      const surgeryId = 998;
      const initialEntries = caseFinancialLedgerService.getCaseLedgerEntries(surgeryId);
      const initialCount = initialEntries.length;

      const newPost = caseFinancialLedgerService.postLedgerEntry({
        surgeryId,
        entryType: LEDGER_ENTRY_TYPES.PATIENT_PAYMENT,
        amount: 150.00,
        description: 'Late patient copay installment',
        sourceReferenceId: 'RCPT-TEST-001',
        sourceModule: 'UnitTestPosting'
      });

      assert.ok(newPost.id, 'New entry must have an ID');
      assert.strictEqual(newPost.amount, 150.00);
      assert.strictEqual(newPost.entry_number, initialCount + 1);
      assert.ok(newPost.audit_hash && newPost.audit_hash.length >= 32, 'Audit hash must be chained');

      const updatedEntries = caseFinancialLedgerService.getCaseLedgerEntries(surgeryId);
      assert.strictEqual(updatedEntries.length, initialCount + 1);
    });

    test('Posting with invalid amount throws an exception', () => {
      assert.throws(() => {
        caseFinancialLedgerService.postLedgerEntry({
          surgeryId: 998,
          entryType: LEDGER_ENTRY_TYPES.CHARGE,
          amount: -50.00
        });
      }, /greater than \$0.00/);
    });
  });

  describe('3. Immutability & Reversals Protocol', () => {
    test('Reversing a posted entry marks original REVERSED and posts offsetting line', () => {
      const surgeryId = 997;
      caseFinancialLedgerService.getCaseLedgerEntries(surgeryId);

      const testEntry = caseFinancialLedgerService.postLedgerEntry({
        surgeryId,
        entryType: LEDGER_ENTRY_TYPES.ADMIN_WRITE_OFF,
        amount: 250.00,
        description: 'Disputed charge courtesy write-off',
        sourceReferenceId: 'WRITEOFF-997'
      });

      assert.strictEqual(testEntry.status, LEDGER_STATUSES.POSTED);

      const { original, reversal } = caseFinancialLedgerService.reverseLedgerEntry(
        surgeryId,
        testEntry.id,
        'Audit reversal: supervisor denied courtesy write-off'
      );

      assert.strictEqual(original.status, LEDGER_STATUSES.REVERSED);
      assert.strictEqual(reversal.status, LEDGER_STATUSES.POSTED);
      assert.strictEqual(reversal.reversal_of_entry_id, testEntry.id);
      assert.strictEqual(reversal.amount, 250.00);
      assert.strictEqual(reversal.entry_sign, -testEntry.entry_sign);
    });

    test('Reversal requires minimum 10-character rationale', () => {
      assert.throws(() => {
        caseFinancialLedgerService.reverseLedgerEntry(997, 'some-id', 'too short');
      }, /at least 10 characters/);
    });
  });

  describe('4. Contribution Margin Engine & Completeness Scoring', () => {
    test('Calculates expected and actual contribution margins deterministically', () => {
      const surgeryId = 996;
      const summary = caseFinancialLedgerService.getCaseFinancialSummary(surgeryId, 'fac-001', 60);

      // Expected Contract Allowable = $4,250.00
      assert.strictEqual(summary.expectedContractAllowable, 4250.00);

      // Total Direct Costs = Implant (1120) + Supply (380) + Labor (450) + OR (600) = $2,550.00
      assert.strictEqual(summary.totalDirectCaseCosts, 2550.00);

      // Expected Contribution Margin = 4250 - 2550 = $1,700.00
      assert.strictEqual(summary.expectedContributionMargin, 1700.00);

      // Expected Margin % Yield = (1700 / 4250) * 100 = 40.00%
      assert.strictEqual(summary.expectedMarginPct, 40.00);

      // Margin Per OR Minute = 1700 / 60 = $28.33 / min
      assert.strictEqual(summary.expectedMarginPerOrMinute, 28.33);

      // Actual Net Collections = Payer (3850) + Patient (400) = $4,250.00
      assert.strictEqual(summary.totalNetCollections, 4250.00);
      assert.strictEqual(summary.actualContributionMargin, 1700.00);
    });

    test('Provisional margin flags incomplete cases when direct costs are missing', () => {
      // Empty entries array (no direct costs)
      const emptySummary = caseFinancialLedgerService.calculateContributionMargin([], 3000.00);
      assert.strictEqual(emptySummary.completenessStatus, 'MISSING_SOURCE_DATA');
      assert.strictEqual(emptySummary.isProvisional, true);
      assert.strictEqual(emptySummary.allowsClosedPeriodAggregation, false);
    });
  });

  describe('5. Staged Migration 047 DDL & Schema Consistency', () => {
    test('Migration 047 forward and down SQL files exist and define required tables and triggers', () => {
      const forwardPath = path.join(rootDir, 'supabase/migrations/047_case_financial_ledger.sql');
      const downPath = path.join(rootDir, 'supabase/migrations/047_case_financial_ledger_down.sql');

      assert.ok(fs.existsSync(forwardPath), '047_case_financial_ledger.sql must exist');
      assert.ok(fs.existsSync(downPath), '047_case_financial_ledger_down.sql must exist');

      const forwardSql = fs.readFileSync(forwardPath, 'utf8');
      const downSql = fs.readFileSync(downPath, 'utf8');

      assert.ok(forwardSql.includes('CREATE TABLE IF NOT EXISTS public.case_financial_ledger_entries'));
      assert.ok(forwardSql.includes('fn_enforce_case_ledger_immutability'));
      assert.ok(forwardSql.includes('vw_case_financial_summaries'));
      assert.ok(forwardSql.includes('ENABLE ROW LEVEL SECURITY'));
      assert.ok(forwardSql.includes('idx_ledger_source_unq'));

      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.case_financial_ledger_entries CASCADE;'));
      assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_case_financial_summaries CASCADE;'));
    });
  });

  describe('6. UI Components & Maestro Purple Ban Compliance', () => {
    test('CaseFinancialLedgerView JSX and CSS exist and are populated', () => {
      const jsxPath = path.join(rootDir, 'src/components/CaseFinancialLedgerView.jsx');
      const cssPath = path.join(rootDir, 'src/components/CaseFinancialLedgerView.css');

      assert.ok(fs.existsSync(jsxPath), 'CaseFinancialLedgerView.jsx must exist');
      assert.ok(fs.existsSync(cssPath), 'CaseFinancialLedgerView.css must exist');

      const jsxContent = fs.readFileSync(jsxPath, 'utf8');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      assert.ok(jsxContent.length > 500, 'JSX must contain substantial UI code');
      assert.ok(cssContent.length > 500, 'CSS must contain substantial styling');
    });

    test('CaseFinancialLedgerView JSX and CSS strictly adhere to Maestro Purple Ban', () => {
      const jsxContent = fs.readFileSync(path.join(rootDir, 'src/components/CaseFinancialLedgerView.jsx'), 'utf8');
      const cssContent = fs.readFileSync(path.join(rootDir, 'src/components/CaseFinancialLedgerView.css'), 'utf8');

      const bannedRegex = /#(?:7c3aed|8b5cf6|6366f1|4f46e5|a855f7|9333ea)|(?:\b|[^a-zA-Z0-9_-])(?:purple|violet|indigo)(?:-[0-9]{2,3})?/i;

      assert.ok(!bannedRegex.test(cssContent), 'CSS must not contain banned purple/violet/indigo tokens');
      assert.ok(!bannedRegex.test(jsxContent), 'JSX must not contain banned purple/violet/indigo tokens');
    });

    test('App.jsx integrates CaseFinancialLedgerView in navigation and tab router', () => {
      const appContent = fs.readFileSync(path.join(rootDir, 'src/App.jsx'), 'utf8');
      assert.ok(appContent.includes('CaseFinancialLedgerView'), 'App.jsx must import CaseFinancialLedgerView');
      assert.ok(appContent.includes("activeTab === 'case_ledger'"), 'App.jsx must route case_ledger tab');
      assert.ok(appContent.includes('Case Financial Ledger'), 'Sidebar must display Case Financial Ledger label');
      assert.ok(appContent.includes('<CaseFinancialLedgerView />'), 'Tab content must render CaseFinancialLedgerView');
    });
  });

});

