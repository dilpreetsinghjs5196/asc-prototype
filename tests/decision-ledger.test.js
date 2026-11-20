/**
 * ==============================================================================
 * Phase D4 Test Suite: Recommendation Decision Ledger & Realized Value History
 * Module 13: Decision Intelligence
 * Tests: Event-sourced ledger blocks, SHA-256 cryptographic chain-of-custody,
 *        deterministic variance & yield math, tamper-detection engine,
 *        outcome reconciliation, migration 111 SQL integrity, and zero-purple compliance.
 * ==============================================================================
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GENESIS_BLOCK_HASH,
  computeLedgerBlockHash,
  REALIZATION_STATUSES,
  LEDGER_EVENT_TYPES,
  calculateVariance,
  calculateRealizationRate,
  determineRealizationStatus,
  SEED_DECISION_LEDGER_ENTRIES,
  SEED_LEDGER_EVENTS,
  resetDecisionLedgerStore,
  getDecisionLedgerEntries,
  getLedgerEntryById,
  getLedgerEntryByActionId,
  verifyLedgerChainIntegrity,
  recordLedgerOutcome,
  getLedgerEvents,
  getDecisionLedgerTelemetry,
  matchesFacilityId
} from '../src/services/decisionLedgerService.js';

import * as libDecisionLedgerService from '../src/lib/decisionLedgerService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase D4: Recommendation Decision Ledger & Realized Value Engine', () => {

  beforeEach(() => {
    resetDecisionLedgerStore();
  });

  test('1. Decision Ledger Telemetry returns accurate facility totals and realization metrics', () => {
    const telemetry = getDecisionLedgerTelemetry('fac-naples-01');
    assert.strictEqual(telemetry.totalLedgerEntriesCount, 7, 'Must report 7 seed ledger entries');
    assert.ok(telemetry.totalExpectedFinancialValue >= 35000.00, 'Expected value must exceed $35,000');
    assert.ok(telemetry.totalRealizedFinancialValue >= 30000.00, 'Realized value must exceed $30,000');
    assert.ok(telemetry.cumulativeRealizationRatePct >= 80.0, 'Cumulative realization rate must be >= 80%');
    assert.strictEqual(telemetry.isChainValid, true, 'Cryptographic chain must be initially valid');
    assert.strictEqual(telemetry.cryptographicProvenanceStatus, 'SHA-256 Ledger Sealed');
    assert.ok(telemetry.avgTimeToRealizationDays > 0, 'Average MTTR must be greater than 0');
  });

  test('2. Facility UUID alias resolution works for Naples Surgery Center in decision ledger', () => {
    const aliasTelem = getDecisionLedgerTelemetry('00000000-0000-0000-0000-000000000002');
    assert.strictEqual(aliasTelem.totalLedgerEntriesCount, 7, 'UUID alias must return same 7 seed entries');
    assert.strictEqual(aliasTelem.isChainValid, true);

    const entriesByUUID = getDecisionLedgerEntries('00000000-0000-0000-0000-000000000002');
    assert.strictEqual(entriesByUUID.length, 7);
  });

  test('3. Deterministic Financial Variance & Realization Yield Formulas', () => {
    // Exact match
    assert.strictEqual(calculateVariance(3450.00, 3450.00), 0.00);
    assert.strictEqual(calculateRealizationRate(3450.00, 3450.00), 100.0);

    // Surplus (over-realized)
    assert.strictEqual(calculateVariance(14200.00, 15800.00), 1600.00);
    assert.strictEqual(calculateRealizationRate(14200.00, 15800.00), 111.3);

    // Deficit (under-realized)
    assert.strictEqual(calculateVariance(7800.00, 6400.00), -1400.00);
    assert.strictEqual(calculateRealizationRate(7800.00, 6400.00), 82.1);

    // Zero realized
    assert.strictEqual(calculateVariance(4120.00, 0.00), -4120.00);
    assert.strictEqual(calculateRealizationRate(4120.00, 0.00), 0.0);
  });

  test('4. Status Machine Invariants derive appropriate realization categories', () => {
    assert.strictEqual(determineRealizationStatus(1000, 0), REALIZATION_STATUSES.PENDING_REALIZATION);
    assert.strictEqual(determineRealizationStatus(1000, 500), REALIZATION_STATUSES.PARTIALLY_REALIZED);
    assert.strictEqual(determineRealizationStatus(1000, 1000), REALIZATION_STATUSES.FULLY_REALIZED);
    assert.strictEqual(determineRealizationStatus(1000, 1005), REALIZATION_STATUSES.FULLY_REALIZED, 'Within 1% tolerance is FULLY_REALIZED');
    assert.strictEqual(determineRealizationStatus(1000, 1200), REALIZATION_STATUSES.OVER_REALIZED);
  });

  test('5. Cryptographic Block Hash Chaining: Genesis block and unbroken parent linkages', () => {
    const entries = getDecisionLedgerEntries('fac-naples-01');
    assert.strictEqual(entries.length, 7);

    // Block 1 links to Genesis Hash
    assert.strictEqual(entries[0].previousBlockHash, GENESIS_BLOCK_HASH);
    assert.strictEqual(entries[0].previousBlockHash.length, 64);

    // Subsequent blocks link to predecessor's currentBlockHash
    for (let i = 1; i < entries.length; i++) {
      assert.strictEqual(
        entries[i].previousBlockHash,
        entries[i - 1].currentBlockHash,
        `Block #${entries[i].sequenceNumber} must link to predecessor #${entries[i - 1].sequenceNumber}`
      );
    }

    // Verify whole chain integrity
    const chainCheck = verifyLedgerChainIntegrity('fac-naples-01');
    assert.strictEqual(chainCheck.isValid, true);
    assert.strictEqual(chainCheck.verifiedBlockCount, 7);
    assert.strictEqual(chainCheck.brokenBlockSequence, null);
  });

  test('6. Tamper-Detection Engine identifies corrupted block and invalidates chain', () => {
    const entries = getDecisionLedgerEntries('fac-naples-01');
    const targetBlock = entries[2]; // Block 3

    // Tamper with realized value without recalculating hash
    const originalValue = targetBlock.realizedFinancialValue;
    targetBlock.realizedFinancialValue = 99999.00;

    const tamperedCheck = verifyLedgerChainIntegrity('fac-naples-01');
    assert.strictEqual(tamperedCheck.isValid, false, 'Tampered block must fail cryptographic verification');
    assert.strictEqual(tamperedCheck.brokenBlockSequence, 3, 'Must identify sequence #3 as corrupted');
    assert.ok(tamperedCheck.failureReason.includes('Block hash content mismatch at sequence #3'));

    // Restore for subsequent tests
    targetBlock.realizedFinancialValue = originalValue;
  });

  test('7. Adjudication Outcome Recording updates realized value, recalculates variance, and appends event', () => {
    // blk-005 is PENDING_REALIZATION with 0 realized
    const entryBefore = getLedgerEntryById('blk-005');
    assert.strictEqual(entryBefore.realizationStatus, REALIZATION_STATUSES.PENDING_REALIZATION);
    assert.strictEqual(entryBefore.realizedFinancialValue, 0.00);

    const outcomeRes = recordLedgerOutcome('blk-005', {
      realizedFinancialValue: 4120.00,
      adjudicationSource: '835_REMITTANCE',
      adjudicationReference: 'ERA-STR-99120-SETTLE',
      remarks: 'Primary carveout invoice verified and paid in full by Humana.'
    }, {
      userId: 'usr_biller_sarah',
      userName: 'Sarah Jenkins'
    });

    assert.strictEqual(outcomeRes.entry.realizationStatus, REALIZATION_STATUSES.FULLY_REALIZED);
    assert.strictEqual(outcomeRes.entry.realizedFinancialValue, 4120.00);
    assert.strictEqual(outcomeRes.entry.varianceAmount, 0.00);
    assert.strictEqual(outcomeRes.entry.realizationPercentage, 100.0);
    assert.ok(outcomeRes.entry.adjudicatedAt);
    assert.ok(outcomeRes.entry.timeToRealizationDays > 0);

    // Event audit record
    assert.strictEqual(outcomeRes.newEvent.eventType, LEDGER_EVENT_TYPES.VALUE_REALIZED);
    assert.strictEqual(outcomeRes.newEvent.recordedByName, 'Sarah Jenkins');
  });

  test('8. Negative Realized Value Defense blocks invalid financial inputs', () => {
    assert.throws(() => {
      recordLedgerOutcome('blk-001', {
        realizedFinancialValue: -500.00
      });
    }, /Realized financial value cannot be negative/);
  });

  test('9. Migration 111 SQL scripts have valid schemas, foreign keys, and idempotent policies', () => {
    const upSqlPath = path.resolve(__dirname, '../supabase/migrations/111_decision_ledger.sql');
    const downSqlPath = path.resolve(__dirname, '../supabase/migrations/111_decision_ledger_down.sql');

    assert.ok(fs.existsSync(upSqlPath), 'Migration 111 UP must exist');
    assert.ok(fs.existsSync(downSqlPath), 'Migration 111 DOWN must exist');

    const upSql = fs.readFileSync(upSqlPath, 'utf8');
    assert.ok(upSql.includes('decision_ledger_entries'));
    assert.ok(upSql.includes('decision_ledger_events'));
    assert.ok(upSql.includes('vw_decision_ledger_telemetry'));
    assert.ok(upSql.includes('DROP POLICY IF EXISTS'), 'Must use DROP POLICY IF EXISTS before CREATE POLICY');
    assert.ok(upSql.includes('ENABLE ROW LEVEL SECURITY'));

    const downSql = fs.readFileSync(downSqlPath, 'utf8');
    assert.ok(downSql.includes('vw_decision_ledger_telemetry'));
    assert.ok(downSql.includes('decision_ledger_events'));
    assert.ok(downSql.includes('decision_ledger_entries'));
  });

  test('10. Zero-Purple Maestro Clinical CSS Token Compliance', () => {
    const cssPath = path.resolve(__dirname, '../src/components/DecisionLedgerView.css');
    assert.ok(fs.existsSync(cssPath), 'CSS file must exist');

    const css = fs.readFileSync(cssPath, 'utf8');
    const prohibitedTokens = ['#7c3aed', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', 'purple', 'violet', 'indigo', 'magenta', 'fuchsia'];
    for (const token of prohibitedTokens) {
      assert.ok(!css.toLowerCase().includes(token), `CSS must not include prohibited token: "${token}"`);
    }
  });

  test('11. Dual re-export facade parity between service and lib', () => {
    for (const key of ['computeLedgerBlockHash', 'calculateVariance', 'calculateRealizationRate', 'determineRealizationStatus', 'getDecisionLedgerEntries', 'getLedgerEntryById', 'verifyLedgerChainIntegrity', 'recordLedgerOutcome', 'getDecisionLedgerTelemetry']) {
      assert.ok(typeof libDecisionLedgerService[key] === 'function', `lib must re-export function: ${key}`);
    }
    assert.ok(libDecisionLedgerService.GENESIS_BLOCK_HASH, 'lib must re-export GENESIS_BLOCK_HASH');
    assert.ok(libDecisionLedgerService.REALIZATION_STATUSES, 'lib must re-export REALIZATION_STATUSES');
    assert.ok(libDecisionLedgerService.LEDGER_EVENT_TYPES, 'lib must re-export LEDGER_EVENT_TYPES');
  });

  test('12. App Shell (src/App.jsx) navigation and tab rendering wiring', () => {
    const appPath = path.resolve(__dirname, '../src/App.jsx');
    const appContent = fs.readFileSync(appPath, 'utf8');

    assert.ok(appContent.includes("import DecisionLedgerView from './components/DecisionLedgerView'"));
    assert.ok(appContent.includes("activeTab === 'decision_ledger'"));
    assert.ok(appContent.includes("Decision Ledger & Realized Value History"));
    assert.ok(appContent.includes("<DecisionLedgerView activeFacility={activeFacility} />"));
  });

});
