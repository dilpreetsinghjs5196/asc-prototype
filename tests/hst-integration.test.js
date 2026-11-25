/**
 * ==============================================================================
 * Test Suite: hst-integration.test.js
 * Module 15: Enterprise Healthcare Integrations (Phase F4)
 * Tests: HST Pathways Gateway Configuration, 10-Milestone Chronology Validation, Turnover Calculations,
 *        Practice Management Charge Audit, Manual Sync Triggers, Migration Integrity, Zero-Prohibited Tokens, and Shell Integration.
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
  computeHstProvenanceSeal,
  validateHstMilestoneChronology,
  calculateHstTurnoverMinutes,
  auditHstCaseCharges,
  getHstConnectorConfig,
  getHstTelemetry,
  getHstSyncBatches,
  getHstCaseMappings,
  getHstMilestones,
  getHstChargeItems,
  testHstConnection,
  triggerManualHstSync
} from '../src/services/hstIntegrationService.js';

import * as facade from '../src/lib/hstIntegrationService.js';

describe('Phase F4: HST Pathways EHR/PMS Gateway', () => {

  // Test 1: Telemetry
  test('1. Telemetry returns accurate 24-hour metrics for Naples Surgery Center', () => {
    const telemetry = getHstTelemetry(NAPLES_FACILITY_ID);
    assert.ok(telemetry, 'Telemetry object should exist');
    assert.equal(telemetry.facilityId, NAPLES_FACILITY_ID);
    assert.equal(telemetry.syncStatus, 'CONNECTED');
    assert.equal(telemetry.healthStatus, 'HEALTHY');
    assert.ok(telemetry.totalSyncedCases >= 50, `Expected totalSyncedCases >= 50, got ${telemetry.totalSyncedCases}`);
    assert.equal(telemetry.milestoneCompletenessPct, 100);
    assert.equal(telemetry.avgClinicalToBillingLagHours, 1.4);
    assert.ok(telemetry.totalChargesAmount > 10000, `Expected charges amount > 10000, got ${telemetry.totalChargesAmount}`);
    assert.ok(telemetry.latestSyncSeal.startsWith('sha256_hst_'), 'Seal should have sha256_hst_ prefix');
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
    const config = getHstConnectorConfig(NAPLES_FACILITY_ID);
    assert.ok(config, 'Config should exist');
    assert.equal(config.facilityId, NAPLES_FACILITY_ID);
    assert.equal(config.hstCenterId, 'HST-CTR-NAPLES-02');
    assert.equal(config.authType, 'OAUTH2');
    assert.equal(config.pollingIntervalMinutes, 15);
    assert.equal(config.syncStatus, 'CONNECTED');
    assert.equal(config.healthStatus, 'HEALTHY');
    assert.equal(config.autoSyncEnabled, true);
  });

  // Test 4: Deterministic 10-Milestone Chronological Validation (Valid Sequence)
  test('4. Deterministic milestone chronological invariant validation across 10 HST milestones', () => {
    const validMilestones = {
      patient_arrival_time: '2026-02-24T06:50:00Z',
      preop_in_time: '2026-02-24T07:10:00Z',
      room_in_time: '2026-02-24T07:30:00Z',
      anesthesia_start_time: '2026-02-24T07:35:00Z',
      incision_time: '2026-02-24T07:48:00Z',
      close_time: '2026-02-24T08:32:00Z',
      anesthesia_end_time: '2026-02-24T08:36:00Z',
      room_out_time: '2026-02-24T08:40:00Z',
      pacu_in_time: '2026-02-24T08:44:00Z',
      discharge_time: '2026-02-24T09:30:00Z'
    };

    const result = validateHstMilestoneChronology(validMilestones);
    assert.equal(result.isValid, true);
    assert.equal(result.errors.length, 0);
    assert.equal(result.totalRoomMinutes, 70); // 07:30 to 08:40 is 70 min
    assert.equal(result.surgicalDurationMinutes, 44); // 07:48 to 08:32 is 44 min
    assert.equal(result.anesthesiaDurationMinutes, 61); // 07:35 to 08:36 is 61 min
  });

  // Test 5: Detection of Inverted Milestone Chronological Timestamps
  test('5. Detection and flagging of inverted milestone chronological timestamps (ERR_CHRONOLOGY_INVERSION)', () => {
    const invertedMilestones = {
      patient_arrival_time: '2026-02-24T06:50:00Z',
      preop_in_time: '2026-02-24T07:10:00Z',
      room_in_time: '2026-02-24T07:30:00Z',
      anesthesia_start_time: '2026-02-24T07:35:00Z',
      incision_time: '2026-02-24T08:45:00Z', // Inverted after close!
      close_time: '2026-02-24T08:32:00Z',
      anesthesia_end_time: '2026-02-24T08:36:00Z',
      room_out_time: '2026-02-24T08:40:00Z'
    };

    const result = validateHstMilestoneChronology(invertedMilestones);
    assert.equal(result.isValid, false);
    assert.ok(result.errors.length > 0);
    const invError = result.errors.find(e => e.code === 'ERR_CHRONOLOGY_INVERSION');
    assert.ok(invError, 'Should detect chronological inversion error');
  });

  // Test 6: Room Turnover Time Calculation
  test('6. Perioperative surgical turnover time calculations (normal vs flagged gaps)', () => {
    // Normal turnover: 16 minutes
    const normalTurnover = calculateHstTurnoverMinutes('2026-02-24T08:40:00Z', '2026-02-24T08:56:00Z');
    assert.equal(normalTurnover.turnoverMinutes, 16);
    assert.equal(normalTurnover.isNormal, true);
    assert.equal(normalTurnover.isFlagged, false);

    // Abnormally short turnover: 3 minutes (< 5 min)
    const shortTurnover = calculateHstTurnoverMinutes('2026-02-24T08:40:00Z', '2026-02-24T08:43:00Z');
    assert.equal(shortTurnover.turnoverMinutes, 3);
    assert.equal(shortTurnover.isFlagged, true);
    assert.ok(shortTurnover.warning.includes('< 5 min'));

    // Abnormally long turnover gap: 135 minutes (> 120 min)
    const longTurnover = calculateHstTurnoverMinutes('2026-02-24T08:40:00Z', '2026-02-24T10:55:00Z');
    assert.equal(longTurnover.turnoverMinutes, 135);
    assert.equal(longTurnover.isFlagged, true);
    assert.ok(longTurnover.warning.includes('> 120 min'));
  });

  // Test 7: Itemized Charge Reconciliation and Margin Audit
  test('7. Itemized charge reconciliation categorizes procedural, supply, and implant items', () => {
    const charges = getHstChargeItems(NAPLES_FACILITY_ID);
    const case901Charges = charges.filter(c => c.hstCaseId === 'HST-2026-901');
    assert.equal(case901Charges.length, 3);

    const audit = auditHstCaseCharges(case901Charges);
    assert.equal(audit.itemsCount, 3);
    assert.equal(audit.totalCharges, 7275.00); // 5100 + 1780 + 395 = 7275
    assert.equal(audit.totalCost, 995.00);       // 425 + 440 + 130 = 995
    assert.equal(audit.estimatedContributionMargin, 6280.00);
    assert.equal(audit.implantConstructCount, 1);
    assert.ok(audit.categoryTotals['SURGICAL_PROCEDURE']);
    assert.ok(audit.categoryTotals['IMPLANT']);
    assert.ok(audit.categoryTotals['SUPPLY']);
  });

  // Test 8: Manual Sync Trigger
  test('8. Manual sync trigger execution updates cursor and records SHA-256 seal', () => {
    const res = triggerManualHstSync(NAPLES_FACILITY_ID);
    assert.equal(res.success, true);
    assert.ok(res.batch, 'Batch should be created');
    assert.equal(res.batch.casesRetrieved, 10);
    assert.ok(res.batch.sha256SyncSeal.startsWith('sha256_hst_'));
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

  // Test 10: Migration 126 SQL Integrity
  test('10. Migration 126 UP/DOWN SQL structural integrity and RLS policies', () => {
    const upSqlPath = path.resolve('supabase/migrations/126_hst_integration.sql');
    const downSqlPath = path.resolve('supabase/migrations/126_hst_integration_down.sql');

    assert.ok(fs.existsSync(upSqlPath), '126_hst_integration.sql should exist');
    assert.ok(fs.existsSync(downSqlPath), '126_hst_integration_down.sql should exist');

    const upSql = fs.readFileSync(upSqlPath, 'utf8');
    const downSql = fs.readFileSync(downSqlPath, 'utf8');

    // Verify required tables
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.hst_connector_configs'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.hst_sync_batches'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.hst_case_mappings'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.hst_milestone_events'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.hst_charge_items'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.hst_provenance_ledger'));
    assert.ok(upSql.includes('ENABLE ROW LEVEL SECURITY'));
    assert.ok(upSql.includes('CREATE OR REPLACE VIEW public.vw_hst_integration_telemetry'));

    // Verify rollback drops
    assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_hst_integration_telemetry'));
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.hst_connector_configs CASCADE'));
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.hst_charge_items CASCADE'));
  });

  // Test 11: Zero Prohibited Tokens
  test('11. Strict Zero-Prohibited Token Compliance in HstIntegrationView and services', () => {
    const jsxPath = path.resolve('src/components/HstIntegrationView.jsx');
    const cssPath = path.resolve('src/components/HstIntegrationView.css');
    const servicePath = path.resolve('src/services/hstIntegrationService.js');

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

    assert.ok(appContent.includes("import HstIntegrationView from './components/HstIntegrationView';"));
    assert.ok(appContent.includes("activeTab === 'hst_integration'"));
    assert.ok(appContent.includes("<HstIntegrationView activeFacility={activeFacility} />"));
    assert.ok(appContent.includes("HST Pathways Integration"));
    assert.ok(appContent.includes("HST Pathways EHR/PMS Gateway"));
  });

});
