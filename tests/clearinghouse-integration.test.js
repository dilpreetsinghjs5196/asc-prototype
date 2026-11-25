/**
 * ==============================================================================
 * Test Suite: clearinghouse-integration.test.js
 * Module 15: Enterprise Healthcare Integrations (Phase F5)
 * Tests: Clearinghouse Gateway Configuration, WEDI SNIP 1-7 Validation,
 *        835 Remittance Balancing Invariants, 999/277CA Acknowledgments,
 *        Manual Batch Dispatch, Migration Integrity, Zero-Prohibited Tokens,
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
  computeClearinghouseProvenanceSeal,
  maskClearinghouseSecret,
  validateWediSnip,
  validate835Balancing,
  parse277CaStatus,
  parse999Acknowledgment,
  getClearinghouseConnectorConfig,
  getClearinghouseTelemetry,
  getClearinghouseTransmissionBatches,
  getClearinghouseClaimRecords,
  getClearinghouseRemitAdjudications,
  getClearinghouseExceptions,
  testClearinghouseConnection,
  triggerClearinghouseBatchDispatch,
  ingest835RemittanceBatch,
  resolveClearinghouseException
} from '../src/services/clearinghouseIntegrationService.js';

import * as facade from '../src/lib/clearinghouseIntegrationService.js';

describe('Phase F5: Clearinghouse EDI Gateway & Adjudication Engine', () => {

  // Test 1: Telemetry
  test('1. Telemetry returns accurate 24-hour metrics for Naples Surgery Center', () => {
    const telemetry = getClearinghouseTelemetry(NAPLES_FACILITY_ID);
    assert.ok(telemetry, 'Telemetry object should exist');
    assert.equal(telemetry.facilityId, NAPLES_FACILITY_ID);
    assert.equal(telemetry.clearinghouseVendor, 'AVAILITY');
    assert.equal(telemetry.connectionStatus, 'CONNECTED');
    assert.equal(telemetry.healthStatus, 'HEALTHY');
    assert.equal(telemetry.wediSnipLevel, 7);
    assert.ok(telemetry.claimsTransmitted24h >= 25, `Expected claimsTransmitted24h >= 25, got ${telemetry.claimsTransmitted24h}`);
    assert.ok(telemetry.totalBilledAmount24h > 100000, `Expected totalBilledAmount24h > 100000, got ${telemetry.totalBilledAmount24h}`);
    assert.ok(telemetry.totalEraPaid24h > 50000, `Expected totalEraPaid24h > 50000, got ${telemetry.totalEraPaid24h}`);
    assert.equal(telemetry.cleanClaimAcceptancePct, 100.0);
    assert.ok(telemetry.avgGatewayLatencyMs > 0, 'Latency should be positive');
    assert.ok(telemetry.latestSyncSeal.startsWith('sha256_clh_'), 'Seal should have sha256_clh_ prefix');
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
    const config = getClearinghouseConnectorConfig(NAPLES_FACILITY_ID);
    assert.ok(config, 'Config should exist');
    assert.equal(config.facilityId, NAPLES_FACILITY_ID);
    assert.equal(config.clearinghouseVendor, 'AVAILITY');
    assert.equal(config.gatewayMode, 'REST_SFTP');
    assert.equal(config.submitterId, 'SUB-NAPLES-FL-01');
    assert.equal(config.receiverId, 'AVAILITY-EDI-GW');
    assert.equal(config.connectionStatus, 'CONNECTED');
    assert.equal(config.wediSnipLevel, 7);
    assert.ok(config.clientSecretMasked.startsWith('clh_sec_****_'), 'Secret should be masked');
  });

  // Test 4: Deterministic WEDI SNIP Levels 1-7 Validation (Valid Claim)
  test('4. Deterministic WEDI SNIP levels 1-7 pre-flight validation (valid claim)', () => {
    const validClaim = {
      patient_control_number: 'CLM-NAP-2026-999',
      patient_name: 'JOHNSON, ROBERT',
      subscriber_member_id: 'BCBS-FL-1928374',
      payer_id: '00590',
      claim_format: '837I',
      bill_type: '831',
      total_billed_charge: 5495.00,
      service_lines: [
        { line_number: 1, cpt_code: '29881', line_charge: 5100.00 },
        { line_number: 2, cpt_code: '99100', line_charge: 395.00 }
      ],
      diagnosis_codes: ['M23.22']
    };

    const result = validateWediSnip(validClaim);
    assert.equal(result.isValid, true);
    assert.equal(result.errors.length, 0);
    assert.equal(result.status, 'PASSED_SNIP_7');
  });

  // Test 5: Detection of WEDI SNIP Validation Errors
  test('5. Detection and flagging of WEDI SNIP validation errors (invalid delimiters, charge mismatch, invalid bill type)', () => {
    // Error 1: Reserved delimiter in PCN
    const delimiterError = validateWediSnip({
      patient_control_number: 'CLM*ERR*01',
      patient_name: 'TEST PATIENT',
      subscriber_member_id: 'SUB123',
      payer_id: '00590'
    });
    assert.equal(delimiterError.isValid, false);
    assert.ok(delimiterError.errors.some(e => e.includes('unescaped EDI reserved delimiter')));

    // Error 2: Line charge sum does not equal total billed
    const balanceError = validateWediSnip({
      patient_control_number: 'CLM-002',
      patient_name: 'TEST PATIENT',
      subscriber_member_id: 'SUB123',
      payer_id: '00590',
      total_billed_charge: 5000.00,
      service_lines: [
        { line_number: 1, cpt_code: '29881', line_charge: 3000.00 }
      ]
    });
    assert.equal(balanceError.isValid, false);
    assert.ok(balanceError.errors.some(e => e.includes('SNIP 3 Error')));

    // Error 3: Invalid bill type for ASC institutional claim
    const billTypeError = validateWediSnip({
      patient_control_number: 'CLM-003',
      patient_name: 'TEST PATIENT',
      subscriber_member_id: 'SUB123',
      payer_id: '00590',
      claim_format: '837I',
      bill_type: '111', // Hospital inpatient, not ASC
      total_billed_charge: 1000.00,
      service_lines: [{ line_number: 1, cpt_code: '45378', line_charge: 1000.00 }]
    });
    assert.equal(billTypeError.isValid, false);
    assert.ok(billTypeError.errors.some(e => e.includes('SNIP 6 Error')));
  });

  // Test 6: Deterministic 835 ERA Remittance Balancing (Valid Case)
  test('6. Deterministic 835 ERA remittance balancing invariant validation (Billed - Adj - Paid - Patient = 0)', () => {
    const validRemit = {
      billed_charge: 7275.00,
      allowed_amount: 4950.00,
      paid_amount: 4450.00,
      contractual_adjustment: 2325.00,
      patient_responsibility: 500.00
    };

    const result = validate835Balancing(validRemit);
    assert.equal(result.isBalanced, true);
    assert.equal(result.delta, 0.00);
    assert.equal(result.variance, 0.00);
    assert.equal(result.errors.length, 0);
  });

  // Test 7: Detection of Imbalanced 835 Remittance Lines
  test('7. Detection and flagging of imbalanced 835 remittance lines (ERR_REMIT_UNBALANCED)', () => {
    const imbalancedRemit = {
      billed_charge: 7275.00,
      allowed_amount: 4950.00,
      paid_amount: 4450.00,
      contractual_adjustment: 2000.00, // $325 missing
      patient_responsibility: 500.00
    };

    const result = validate835Balancing(imbalancedRemit);
    assert.equal(result.isBalanced, false);
    assert.equal(result.delta, 325.00);
    assert.equal(result.variance, 325.00);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0].includes('ERR_REMIT_UNBALANCED'));
  });

  // Test 8: 277CA Claim Status and 999 Functional ACK Parsing
  test('8. 277CA claim acknowledgment and 999 syntax code resolution', () => {
    // 277CA parsing
    const ackA2 = parse277CaStatus('A2');
    assert.equal(ackA2.isAccepted, true);
    assert.equal(ackA2.status, 'ACCEPTED_277CA');

    const ackA7 = parse277CaStatus('A7:21:40');
    assert.equal(ackA7.isAccepted, false);
    assert.equal(ackA7.status, 'REJECTED');

    // 999 parsing
    const ack999A = parse999Acknowledgment('A');
    assert.equal(ack999A.isAccepted, true);
    assert.equal(ack999A.status, 'ACCEPTED_999');

    const ack999R = parse999Acknowledgment('R');
    assert.equal(ack999R.isAccepted, false);
    assert.equal(ack999R.status, 'REJECTED');
  });

  // Test 9: Manual 837 Batch Dispatch Execution
  test('9. Manual 837 batch dispatch execution creates batch record with SHA-256 seal', () => {
    const initialBatches = getClearinghouseTransmissionBatches(NAPLES_FACILITY_ID).length;
    const result = triggerClearinghouseBatchDispatch(NAPLES_FACILITY_ID);

    assert.equal(result.success, true);
    assert.ok(result.batch.batchControlNumber.startsWith('BAT-837I-'));
    assert.ok(result.claimsDispatched >= 3);
    assert.ok(result.totalBilled > 0);
    assert.ok(result.seal.startsWith('sha256_clh_'));
    assert.equal(result.seal.length, 64, 'Seed seal must be exactly 64 characters');

    const updatedBatches = getClearinghouseTransmissionBatches(NAPLES_FACILITY_ID).length;
    assert.equal(updatedBatches, initialBatches + 1);
  });

  // Test 10: Dual Facade Re-export Parity
  test('10. Dual facade re-export parity between src/services/ and src/lib/', () => {
    const serviceExports = Object.keys(service);
    for (const exp of serviceExports) {
      assert.ok(
        exp in facade,
        `Expected facade to re-export '${exp}' from clearinghouseIntegrationService`
      );
    }
    assert.equal(typeof facade.getClearinghouseTelemetry, 'function');
    assert.equal(typeof facade.validateWediSnip, 'function');
    assert.equal(typeof facade.validate835Balancing, 'function');
    assert.equal(typeof facade.triggerClearinghouseBatchDispatch, 'function');
    assert.equal(typeof facade.ingest835RemittanceBatch, 'function');
  });

  // Test 11: Migration 127 UP/DOWN SQL Structural Integrity & RLS
  test('11. Migration 127 UP/DOWN SQL structural integrity and RLS policies', () => {
    const upPath = path.resolve('supabase/migrations/127_clearinghouse_integration.sql');
    const downPath = path.resolve('supabase/migrations/127_clearinghouse_integration_down.sql');

    assert.ok(fs.existsSync(upPath), 'Migration 127 UP file must exist');
    assert.ok(fs.existsSync(downPath), 'Migration 127 DOWN file must exist');

    const upSql = fs.readFileSync(upPath, 'utf8');
    const downSql = fs.readFileSync(downPath, 'utf8');

    // Tables check
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.clearinghouse_connector_configs'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.clearinghouse_transmission_batches'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.clearinghouse_claim_records'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.clearinghouse_remit_adjudications'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.clearinghouse_exception_logs'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.clearinghouse_provenance_ledger'));

    // Safe column length
    assert.ok(upSql.includes('sha256_sync_seal VARCHAR(128) NOT NULL'));
    assert.ok(upSql.includes('sha256_seal VARCHAR(128) NOT NULL'));

    // RLS enabled
    assert.ok(upSql.includes('ENABLE ROW LEVEL SECURITY'));
    assert.ok(upSql.includes('app.current_facility_id'));

    // View
    assert.ok(upSql.includes('CREATE OR REPLACE VIEW public.vw_clearinghouse_integration_telemetry'));

    // Down SQL drops
    assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_clearinghouse_integration_telemetry'));
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.clearinghouse_connector_configs'));
  });

  // Test 12: Strict Zero-Prohibited Token Compliance & Shell Integration
  test('12. Strict Zero-Prohibited Token Compliance and Shell Integration', () => {
    const viewPath = path.resolve('src/components/ClearinghouseIntegrationView.jsx');
    const cssPath = path.resolve('src/components/ClearinghouseIntegrationView.css');
    const servicePath = path.resolve('src/services/clearinghouseIntegrationService.js');
    const appPath = path.resolve('src/App.jsx');

    assert.ok(fs.existsSync(viewPath), 'ClearinghouseIntegrationView.jsx must exist');
    assert.ok(fs.existsSync(cssPath), 'ClearinghouseIntegrationView.css must exist');

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
        `Prohibited token '${token}' found in ClearinghouseIntegrationView.css`
      );
      assert.equal(
        viewContent.toLowerCase().includes(token),
        false,
        `Prohibited token '${token}' found in ClearinghouseIntegrationView.jsx`
      );
      assert.equal(
        serviceContent.toLowerCase().includes(token),
        false,
        `Prohibited token '${token}' found in clearinghouseIntegrationService.js`
      );
    }

    // App shell integration check
    assert.ok(appContent.includes("import ClearinghouseIntegrationView from './components/ClearinghouseIntegrationView'"));
    assert.ok(appContent.includes("activeTab === 'clearinghouse_integration'"));
    assert.ok(appContent.includes("<ClearinghouseIntegrationView activeFacility={activeFacility} />"));
    assert.ok(appContent.match(/import\s*\{[^}]*\bSend\b[^}]*\}\s*from\s*['"]lucide-react['"]/), "Send icon must be imported from lucide-react in App.jsx");
  });

});
