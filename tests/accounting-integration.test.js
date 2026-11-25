/**
 * ==============================================================================
 * Test Suite: accounting-integration.test.js
 * Module 15: Enterprise Healthcare Integrations (Phase F6)
 * Tests: Accounting Gateway Configuration, Chart of Accounts Normal Balances,
 *        Double-Entry Balancing Invariants, Bank Reconciliation Matching,
 *        Manual Journal Posting, Migration Integrity, Zero-Prohibited Tokens,
 *        and Shell Integration.
 * ==============================================================================
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Import service and facade
import service, {
  NAPLES_FACILITY_ID,
  normalizeFacilityId,
  computeAccountingProvenanceSeal,
  maskAccountingSecret,
  validateJournalDoubleEntry,
  validateSubledgerBankReconciliation,
  getAccountingConnectorConfig,
  getAccountingTelemetry,
  getAccountingChartOfAccounts,
  getAccountingJournalBatches,
  getAccountingJournalLines,
  getAccountingReconciliations,
  getAccountingExceptions,
  testAccountingConnection,
  triggerManualJournalPost,
  runSubledgerBankReconciliation,
  resolveAccountingException
} from '../src/services/accountingIntegrationService.js';

import * as facade from '../src/lib/accountingIntegrationService.js';

describe('Phase F6: Accounting & General Ledger Gateway', () => {

  // Test 1: Telemetry
  test('1. Telemetry returns accurate 30-day metrics for Naples Surgery Center', () => {
    const telemetry = getAccountingTelemetry(NAPLES_FACILITY_ID);
    assert.ok(telemetry, 'Telemetry object should exist');
    assert.equal(telemetry.facilityId, NAPLES_FACILITY_ID);
    assert.equal(telemetry.accountingVendor, 'NETSUITE');
    assert.equal(telemetry.connectionStatus, 'CONNECTED');
    assert.equal(telemetry.healthStatus, 'HEALTHY');
    assert.equal(telemetry.currentAccountingPeriod, '2026-02');
    assert.ok(telemetry.journalBatchesPosted30d >= 2, `Expected batches >= 2, got ${telemetry.journalBatchesPosted30d}`);
    assert.ok(telemetry.totalDebitsPosted30d > 100000, `Expected total debits > 100000, got ${telemetry.totalDebitsPosted30d}`);
    assert.equal(telemetry.doubleEntryBalancePct, 100.0);
    assert.ok(telemetry.reconciledCashMtd >= 80000, `Expected reconciled cash >= 80000, got ${telemetry.reconciledCashMtd}`);
    assert.ok(telemetry.avgErpLatencyMs > 0, 'Latency should be positive');
    assert.ok(telemetry.latestSyncSeal.startsWith('sha256_acc_'), 'Seal should have sha256_acc_ prefix');
  });

  // Test 2: Facility ID Normalization
  test('2. Facility UUID alias resolution matches Naples Surgery Center correctly across strings and objects', () => {
    assert.equal(normalizeFacilityId('fac-naples-01'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId('naples-surgery-center'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ id: 'fac-naples-01' }), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ facility_id: NAPLES_FACILITY_ID }), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId(null), NAPLES_FACILITY_ID);
  });

  // Test 3: Connector Configuration
  test('3. Connector configuration retrieval and status verification', () => {
    const config = getAccountingConnectorConfig(NAPLES_FACILITY_ID);
    assert.ok(config, 'Config should exist');
    assert.equal(config.facilityId, NAPLES_FACILITY_ID);
    assert.equal(config.accountingVendor, 'NETSUITE');
    assert.equal(config.gatewayMode, 'REST_API');
    assert.equal(config.subsidiaryCompanyId, 'SUB-NAPLES-ASC-01');
    assert.equal(config.connectionStatus, 'CONNECTED');
    assert.equal(config.currentAccountingPeriod, '2026-02');
    assert.equal(config.lockClosedPeriods, true);
    assert.ok(config.clientSecretMasked.startsWith('acc_sec_****_'), 'Secret should be masked');
  });

  // Test 4: Chart of Accounts (COA) Normal Balances
  test('4. Deterministic Chart of Accounts retrieval and normal balance verification', () => {
    const coa = getAccountingChartOfAccounts(NAPLES_FACILITY_ID);
    assert.ok(Array.isArray(coa), 'COA should be an array');
    assert.ok(coa.length >= 8, `Expected at least 8 COA accounts, got ${coa.length}`);

    // Verify asset debit balances
    const cashAcct = coa.find(a => a.accountCode === '1010');
    assert.ok(cashAcct, 'Cash account 1010 should exist');
    assert.equal(cashAcct.accountType, 'ASSET');
    assert.equal(cashAcct.normalBalance, 'DEBIT');

    const arAcct = coa.find(a => a.accountCode === '1100');
    assert.ok(arAcct, 'A/R account 1100 should exist');
    assert.equal(arAcct.accountType, 'ASSET');
    assert.equal(arAcct.normalBalance, 'DEBIT');

    // Verify revenue credit balances
    const revAcct = coa.find(a => a.accountCode === '4010');
    assert.ok(revAcct, 'Revenue account 4010 should exist');
    assert.equal(revAcct.accountType, 'REVENUE');
    assert.equal(revAcct.normalBalance, 'CREDIT');

    // Verify contra-revenue debit balance
    const contraAcct = coa.find(a => a.accountCode === '4090');
    assert.ok(contraAcct, 'Contra-Revenue account 4090 should exist');
    assert.equal(contraAcct.accountType, 'CONTRA_REVENUE');
    assert.equal(contraAcct.normalBalance, 'DEBIT');
  });

  // Test 5: Deterministic Double-Entry Balancing (Valid Case)
  test('5. Deterministic double-entry balancing validation on valid journal entry lines (Sum(Dr) - Sum(Cr) = 0)', () => {
    const validLines = [
      { lineNumber: 1, accountCode: '1010', debitAmount: 50000.00, creditAmount: 0.00 },
      { lineNumber: 2, accountCode: '1100', debitAmount: 0.00, creditAmount: 50000.00 }
    ];

    const result = validateJournalDoubleEntry(validLines);
    assert.equal(result.isBalanced, true);
    assert.equal(result.totalDebit, 50000.00);
    assert.equal(result.totalCredit, 50000.00);
    assert.equal(result.variance, 0.00);
    assert.equal(result.errors.length, 0);
  });

  // Test 6: Detection of Double-Entry Imbalances
  test('6. Detection and flagging of double-entry imbalances (ERR_DOUBLE_ENTRY_IMBALANCE)', () => {
    const imbalancedLines = [
      { lineNumber: 1, accountCode: '1010', debitAmount: 50000.00, creditAmount: 0.00 },
      { lineNumber: 2, accountCode: '1100', debitAmount: 0.00, creditAmount: 48500.00 } // $1,500 variance
    ];

    const result = validateJournalDoubleEntry(imbalancedLines);
    assert.equal(result.isBalanced, false);
    assert.equal(result.totalDebit, 50000.00);
    assert.equal(result.totalCredit, 48500.00);
    assert.equal(result.variance, 1500.00);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0].includes('ERR_DOUBLE_ENTRY_IMBALANCE'));
  });

  // Test 7: Bank Reconciliation Matching (Balanced Case)
  test('7. Bank reconciliation matching and variance calculation (balanced case)', () => {
    const result = validateSubledgerBankReconciliation(89450.00, 89450.00);
    assert.equal(result.isReconciled, true);
    assert.equal(result.subledgerCash, 89450.00);
    assert.equal(result.bankDeposit, 89450.00);
    assert.equal(result.variance, 0.00);
    assert.equal(result.status, 'RECONCILED');
    assert.equal(result.errors.length, 0);
  });

  // Test 8: Detection of Bank Reconciliation Variance
  test('8. Detection and flagging of bank reconciliation variances (VARIANCE_FLAGGED)', () => {
    const result = validateSubledgerBankReconciliation(89450.00, 87200.00); // $2,250 variance
    assert.equal(result.isReconciled, false);
    assert.equal(result.subledgerCash, 89450.00);
    assert.equal(result.bankDeposit, 87200.00);
    assert.equal(result.variance, 2250.00);
    assert.equal(result.status, 'VARIANCE_FLAGGED');
    assert.ok(result.errors.length > 0);
  });

  // Test 9: Manual Journal Batch Post Execution
  test('9. Manual journal batch post execution creates balanced batch record with SHA-256 seal', () => {
    const initialBatches = getAccountingJournalBatches(NAPLES_FACILITY_ID).length;
    const result = triggerManualJournalPost(NAPLES_FACILITY_ID, 'DAILY_CASH_POSTING');

    assert.equal(result.success, true);
    assert.ok(result.batch.batchControlNumber.startsWith('GL-BAT-'));
    assert.equal(result.batch.isBalanced, true);
    assert.equal(result.batch.varianceAmount, 0.00);
    assert.ok(result.seal.startsWith('sha256_acc_'));
    assert.equal(result.seal.length, 64, 'Seed seal must be exactly 64 characters');

    const updatedBatches = getAccountingJournalBatches(NAPLES_FACILITY_ID).length;
    assert.equal(updatedBatches, initialBatches + 1);
  });

  // Test 10: Dual Facade Re-export Parity
  test('10. Dual facade re-export parity between src/services/ and src/lib/', () => {
    const serviceExports = Object.keys(service);
    for (const exp of serviceExports) {
      assert.ok(
        exp in facade,
        `Expected facade to re-export '${exp}' from accountingIntegrationService`
      );
    }
    assert.equal(typeof facade.getAccountingTelemetry, 'function');
    assert.equal(typeof facade.validateJournalDoubleEntry, 'function');
    assert.equal(typeof facade.validateSubledgerBankReconciliation, 'function');
    assert.equal(typeof facade.triggerManualJournalPost, 'function');
    assert.equal(typeof facade.runSubledgerBankReconciliation, 'function');
  });

  // Test 11: Migration 128 UP/DOWN SQL Structural Integrity & RLS
  test('11. Migration 128 UP/DOWN SQL structural integrity and RLS policies', () => {
    const upPath = path.resolve('supabase/migrations/128_accounting_integration.sql');
    const downPath = path.resolve('supabase/migrations/128_accounting_integration_down.sql');

    assert.ok(fs.existsSync(upPath), 'Migration 128 UP file must exist');
    assert.ok(fs.existsSync(downPath), 'Migration 128 DOWN file must exist');

    const upSql = fs.readFileSync(upPath, 'utf8');
    const downSql = fs.readFileSync(downPath, 'utf8');

    // Tables check
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.accounting_connector_configs'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.accounting_chart_of_accounts'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.accounting_journal_batches'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.accounting_journal_lines'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.accounting_reconciliation_records'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.accounting_exception_logs'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.accounting_provenance_ledger'));

    // Safe column length
    assert.ok(upSql.includes('sha256_sync_seal VARCHAR(128) NOT NULL'));
    assert.ok(upSql.includes('sha256_seal VARCHAR(128) NOT NULL'));

    // RLS enabled
    assert.ok(upSql.includes('ENABLE ROW LEVEL SECURITY'));
    assert.ok(upSql.includes('app.current_facility_id'));

    // View
    assert.ok(upSql.includes('CREATE OR REPLACE VIEW public.vw_accounting_integration_telemetry'));

    // Down SQL drops
    assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_accounting_integration_telemetry'));
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.accounting_connector_configs'));
  });

  // Test 12: Strict Zero-Prohibited Token Compliance & Shell Integration
  test('12. Strict Zero-Prohibited Token Compliance and Shell Integration', () => {
    const viewPath = path.resolve('src/components/AccountingIntegrationView.jsx');
    const cssPath = path.resolve('src/components/AccountingIntegrationView.css');
    const servicePath = path.resolve('src/services/accountingIntegrationService.js');
    const appPath = path.resolve('src/App.jsx');

    assert.ok(fs.existsSync(viewPath), 'AccountingIntegrationView.jsx must exist');
    assert.ok(fs.existsSync(cssPath), 'AccountingIntegrationView.css must exist');

    const viewContent = fs.readFileSync(viewPath, 'utf8');
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    const serviceContent = fs.readFileSync(servicePath, 'utf8');
    const appContent = fs.readFileSync(appPath, 'utf8');

    // Prohibited tokens test (zero purple, violet, indigo, magenta, fuchsia)
    const prohibitedTokens = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];
    for (const token of prohibitedTokens) {
      assert.equal(
        cssContent.toLowerCase().includes(token),
        false,
        `Prohibited token '${token}' found in AccountingIntegrationView.css`
      );
      assert.equal(
        viewContent.toLowerCase().includes(token),
        false,
        `Prohibited token '${token}' found in AccountingIntegrationView.jsx`
      );
      assert.equal(
        serviceContent.toLowerCase().includes(token),
        false,
        `Prohibited token '${token}' found in accountingIntegrationService.js`
      );
    }

    // App shell integration check
    assert.ok(appContent.includes("import AccountingIntegrationView from './components/AccountingIntegrationView'"));
    assert.ok(appContent.includes("activeTab === 'accounting_integration'"));
    assert.ok(appContent.includes("<AccountingIntegrationView activeFacility={activeFacility} />"));
    assert.ok(appContent.match(/import\s*\{[^}]*\bLandmark\b[^}]*\}\s*from\s*['"]lucide-react['"]/), "Landmark icon must be imported from lucide-react in App.jsx");
  });

});
