/**
 * ==============================================================================
 * Test Suite: sis-integration.test.js
 * Module 15: Enterprise Healthcare Integrations (Phase F3)
 * Tests: SIS Gateway Configuration, Chronological Milestones Validation, Turnover Calculations,
 *        AdvantX Charge Audit, Manual Sync Triggers, Migration Integrity, Zero-Prohibited Tokens, and Shell Integration.
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
  computeSisProvenanceSeal,
  validateMilestoneChronology,
  calculateTurnoverMinutes,
  auditCaseCharges,
  getSisConnectorConfig,
  getSisTelemetry,
  getSisSyncBatches,
  getSisCaseMappings,
  getSisMilestones,
  getSisChargeItems,
  testSisConnection,
  triggerManualSync
} from '../src/services/sisIntegrationService.js';

import * as facade from '../src/lib/sisIntegrationService.js';

describe('Phase F3: Surgical Information Systems (SIS) EHR/PMS Gateway', () => {

  // Test 1: Telemetry
  test('1. Telemetry returns accurate 24-hour metrics for Naples Surgery Center', () => {
    const telemetry = getSisTelemetry(NAPLES_FACILITY_ID);
    assert.ok(telemetry, 'Telemetry object should exist');
    assert.equal(telemetry.facilityId, NAPLES_FACILITY_ID);
    assert.equal(telemetry.syncStatus, 'CONNECTED');
    assert.equal(telemetry.healthStatus, 'HEALTHY');
    assert.ok(telemetry.totalSyncedCases >= 50, `Expected totalSyncedCases >= 50, got ${telemetry.totalSyncedCases}`);
    assert.equal(telemetry.milestoneCompletenessPct, 75);
    assert.equal(telemetry.avgClinicalToBillingLagHours, 1.8);
    assert.ok(telemetry.totalChargesAmount > 10000, `Expected charges amount > 10000, got ${telemetry.totalChargesAmount}`);
    assert.ok(telemetry.latestSyncSeal.startsWith('sha256_sis_'), 'Seal should have sha256_sis_ prefix');
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
    const config = getSisConnectorConfig(NAPLES_FACILITY_ID);
    assert.ok(config, 'Config should exist');
    assert.equal(config.facilityId, NAPLES_FACILITY_ID);
    assert.equal(config.sisFacilityCode, 'NAPLES-FL-01');
    assert.equal(config.authType, 'OAUTH2');
    assert.equal(config.pollingIntervalMinutes, 15);
    assert.equal(config.syncStatus, 'CONNECTED');
    assert.equal(config.healthStatus, 'HEALTHY');
    assert.equal(config.autoSyncEnabled, true);
  });

  // Test 4: Deterministic Milestone Chronological Validation (Valid Sequence)
  test('4. Deterministic milestone chronological invariant validation (room_in <= cut <= close <= room_out)', () => {
    const validMilestones = {
      check_in_time: '2026-02-24T07:05:00Z',
      room_in_time: '2026-02-24T07:32:00Z',
      anesthesia_start_time: '2026-02-24T07:38:00Z',
      incision_time: '2026-02-24T07:50:00Z',
      close_time: '2026-02-24T08:34:00Z',
      room_out_time: '2026-02-24T08:42:00Z',
      pacu_in_time: '2026-02-24T08:45:00Z',
      pacu_out_time: '2026-02-24T09:35:00Z'
    };

    const result = validateMilestoneChronology(validMilestones);
    assert.equal(result.isValid, true);
    assert.equal(result.errors.length, 0);
    assert.equal(result.totalRoomMinutes, 70); // 07:32 to 08:42 is 70 min
    assert.equal(result.surgicalDurationMinutes, 44); // 07:50 to 08:34 is 44 min
  });

  // Test 5: Detection of Inverted Milestone Chronological Timestamps
  test('5. Detection and flagging of inverted milestone chronological timestamps (ERR_CHRONOLOGY_INVERSION)', () => {
    const invertedMilestones = {
      check_in_time: '2026-02-24T07:05:00Z',
      room_in_time: '2026-02-24T07:32:00Z',
      anesthesia_start_time: '2026-02-24T07:38:00Z',
      incision_time: '2026-02-24T08:50:00Z', // Inverted after close!
      close_time: '2026-02-24T08:34:00Z',
      room_out_time: '2026-02-24T08:42:00Z'
    };

    const result = validateMilestoneChronology(invertedMilestones);
    assert.equal(result.isValid, false);
    assert.ok(result.errors.length > 0);
    const invError = result.errors.find(e => e.code === 'ERR_CHRONOLOGY_INVERSION');
    assert.ok(invError, 'Should detect chronological inversion error');
  });

  // Test 6: Room Turnover Time Calculation
  test('6. Perioperative surgical turnover time calculations (normal vs flagged gaps)', () => {
    // Normal turnover: 18 minutes
    const normalTurnover = calculateTurnoverMinutes('2026-02-24T08:42:00Z', '2026-02-24T09:00:00Z');
    assert.equal(normalTurnover.turnoverMinutes, 18);
    assert.equal(normalTurnover.isNormal, true);
    assert.equal(normalTurnover.isFlagged, false);

    // Abnormally short turnover: 2 minutes (< 5 min)
    const shortTurnover = calculateTurnoverMinutes('2026-02-24T08:42:00Z', '2026-02-24T08:44:00Z');
    assert.equal(shortTurnover.turnoverMinutes, 2);
    assert.equal(shortTurnover.isFlagged, true);
    assert.ok(shortTurnover.warning.includes('< 5 min'));

    // Abnormally long turnover gap: 140 minutes (> 120 min)
    const longTurnover = calculateTurnoverMinutes('2026-02-24T08:42:00Z', '2026-02-24T11:02:00Z');
    assert.equal(longTurnover.turnoverMinutes, 140);
    assert.equal(longTurnover.isFlagged, true);
    assert.ok(longTurnover.warning.includes('> 120 min'));
  });

  // Test 7: Itemized Charge Reconciliation and Margin Audit
  test('7. Itemized charge reconciliation categorizes procedural, supply, and implant items', () => {
    const charges = getSisChargeItems(NAPLES_FACILITY_ID, 'SIS-2026-8801');
    assert.equal(charges.length, 3);

    const audit = auditCaseCharges(charges);
    assert.equal(audit.itemsCount, 3);
    assert.equal(audit.totalCharges, 6930.00); // 4850 + 1700 + 380 = 6930
    assert.equal(audit.totalCost, 955.00);       // 410 + 420 + 125 = 955
    assert.equal(audit.estimatedContributionMargin, 5975.00);
    assert.equal(audit.implantConstructCount, 1);
    assert.ok(audit.categoryTotals['SURGICAL_PROCEDURE']);
    assert.ok(audit.categoryTotals['IMPLANT']);
    assert.ok(audit.categoryTotals['SUPPLY']);
  });

  // Test 8: Manual Sync Trigger
  test('8. Manual sync trigger execution updates cursor and records SHA-256 seal', () => {
    const res = triggerManualSync(NAPLES_FACILITY_ID);
    assert.equal(res.success, true);
    assert.ok(res.batch, 'Batch should be created');
    assert.equal(res.batch.casesRetrieved, 8);
    assert.ok(res.batch.sha256SyncSeal.startsWith('sha256_sis_'));
    assert.equal(res.batch.sha256SyncSeal.length, 64);
  });

  // Test 9: Dual Facade Parity
  test('9. Dual facade re-export parity between src/services/ and src/lib/', () => {
    const serviceKeys = Object.keys(service).filter(k => typeof service[k] === 'function');
    for (const key of serviceKeys) {
      assert.equal(typeof facade[key], 'function', `Facade should export function '${key}'`);
    }
    assert.equal(facade.NAPLES_FACILITY_ID, NAPLES_FACILITY_ID);
  });

  // Test 10: Migration 125 SQL Integrity
  test('10. Migration 125 UP/DOWN SQL structural integrity and RLS policies', () => {
    const upSqlPath = path.resolve('supabase/migrations/125_sis_integration.sql');
    const downSqlPath = path.resolve('supabase/migrations/125_sis_integration_down.sql');

    assert.ok(fs.existsSync(upSqlPath), '125_sis_integration.sql should exist');
    assert.ok(fs.existsSync(downSqlPath), '125_sis_integration_down.sql should exist');

    const upSql = fs.readFileSync(upSqlPath, 'utf8');
    const downSql = fs.readFileSync(downSqlPath, 'utf8');

    // Verify required tables
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.sis_connector_configs'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.sis_sync_batches'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.sis_case_mappings'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.sis_milestone_events'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.sis_charge_items'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.sis_provenance_ledger'));
    assert.ok(upSql.includes('ENABLE ROW LEVEL SECURITY'));
    assert.ok(upSql.includes('CREATE OR REPLACE VIEW public.vw_sis_integration_telemetry'));

    // Verify rollback drops
    assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_sis_integration_telemetry'));
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.sis_connector_configs CASCADE'));
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.sis_charge_items CASCADE'));
  });

  // Test 11: Zero Prohibited Tokens
  test('11. Strict Zero-Prohibited Token Compliance in SisIntegrationView and services', () => {
    const jsxPath = path.resolve('src/components/SisIntegrationView.jsx');
    const cssPath = path.resolve('src/components/SisIntegrationView.css');
    const servicePath = path.resolve('src/services/sisIntegrationService.js');

    const prohibited = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];

    for (const [name, filePath] of [['JSX', jsxPath], ['CSS', cssPath], ['Service', servicePath]]) {
      const content = fs.readFileSync(filePath, 'utf8').toLowerCase();
      for (const token of prohibited) {
        assert.ok(
          !content.includes(token),
          `Prohibited color token '${token}' found in ${name} file ${filePath}`
        );
      }
    }
  });

  // Test 12: App Shell Integration
  test('12. App Shell Integration (src/App.jsx) structure check', () => {
    const appPath = path.resolve('src/App.jsx');
    const appContent = fs.readFileSync(appPath, 'utf8');

    assert.ok(appContent.includes("import SisIntegrationView from './components/SisIntegrationView';"));
    assert.ok(appContent.includes("activeTab === 'sis_integration'"));
    assert.ok(appContent.includes("<SisIntegrationView activeFacility={activeFacility} />"));
    assert.ok(appContent.includes("SIS Integration"));
    assert.ok(appContent.includes("Surgical Information Systems (SIS) EHR Gateway"));
  });

});
