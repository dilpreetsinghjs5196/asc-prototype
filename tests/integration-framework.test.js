import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getFacilityConnectors,
  getConnectorByIdOrCode,
  getFacilityBatches,
  getIntegrationMappings,
  getIntegrationTelemetry,
  triggerManualSyncBatch,
  replayFailedBatch,
  resetLiveIntegrationState,
  computeIntegrationPayloadHash,
  matchesFacilityId,
  CONNECTOR_STATUSES,
  CONNECTOR_CATEGORIES,
  BATCH_STATUSES,
  JOB_TYPES
} from '../src/services/integrationFrameworkService.js';

import * as facade from '../src/lib/integrationFrameworkService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase F0: Common Integration Framework & Connector Engine', () => {
  beforeEach(() => {
    resetLiveIntegrationState();
  });

  test('1. Telemetry returns accurate 24-hour metrics (4 connectors, 48 batches, 97.92% success rate, 12,450 records, 1,420 ms latency)', () => {
    const telemetry = getIntegrationTelemetry('fac-naples-01');

    assert.ok(telemetry);
    assert.strictEqual(telemetry.totalConnectors, 4);
    assert.strictEqual(telemetry.healthyConnectors, 4);
    assert.strictEqual(telemetry.totalBatches24h, 48);
    assert.strictEqual(telemetry.completedBatches24h, 47);
    assert.strictEqual(telemetry.totalRecordsIngested24h, 12450);
    assert.strictEqual(telemetry.totalRecordsRejected24h, 14);
    assert.strictEqual(telemetry.batchSuccessRatePercent, 97.92);
    assert.strictEqual(telemetry.avgDurationMs, 1420);
    assert.ok(telemetry.syncIntegritySeal);
    assert.strictEqual(telemetry.syncIntegritySeal.length, 64);
  });

  test('2. Facility UUID alias resolution matches Naples Surgery Center correctly across strings and objects', () => {
    assert.strictEqual(matchesFacilityId('fac-naples-01', 'fac-naples-01'), true);
    assert.strictEqual(matchesFacilityId('00000000-0000-0000-0000-000000000002', 'fac-naples-01'), true);
    assert.strictEqual(matchesFacilityId('fac-naples-01', { id: 'fac-naples-01' }), true);
    assert.strictEqual(matchesFacilityId('fac-naples-01', { facilityUuid: '00000000-0000-0000-0000-000000000002' }), true);
    assert.strictEqual(matchesFacilityId('fac-naples-01', 'ALL'), true);
    assert.strictEqual(matchesFacilityId('fac-naples-01', 'fac-other-99'), false);
  });

  test('3. Connector retrieval returns all 4 enterprise connectors (HST, Waystar, Medline, NetSuite) with correct protocols', () => {
    const connectors = getFacilityConnectors('fac-naples-01');
    assert.strictEqual(connectors.length, 4);

    const hst = getConnectorByIdOrCode('CONN_HST_PATHWAYS', 'fac-naples-01');
    assert.ok(hst);
    assert.strictEqual(hst.protocol, 'FHIR_R4');
    assert.strictEqual(hst.category, CONNECTOR_CATEGORIES.EHR_PMS);
    assert.strictEqual(hst.status, CONNECTOR_STATUSES.HEALTHY);

    const waystar = getConnectorByIdOrCode('CONN_WAYSTAR_EDI', 'fac-naples-01');
    assert.ok(waystar);
    assert.strictEqual(waystar.protocol, 'SFTP');
    assert.strictEqual(waystar.category, CONNECTOR_CATEGORIES.CLEARINGHOUSE_EDI);

    const medline = getConnectorByIdOrCode('CONN_MEDLINE_ERP', 'fac-naples-01');
    assert.ok(medline);
    assert.strictEqual(medline.protocol, 'REST_API');

    const netsuite = getConnectorByIdOrCode('CONN_NETSUITE_GL', 'fac-naples-01');
    assert.ok(netsuite);
    assert.strictEqual(netsuite.category, CONNECTOR_CATEGORIES.ACCOUNTING_GL);
  });

  test('4. Batch execution ledger returns idempotent runs with correct record counts, latencies, and statuses', () => {
    const batches = getFacilityBatches('fac-naples-01');
    assert.ok(batches.length >= 4);

    const completed = batches.filter(b => b.status === BATCH_STATUSES.COMPLETED);
    const withErrors = batches.filter(b => b.status === BATCH_STATUSES.COMPLETED_WITH_ERRORS);
    assert.ok(completed.length >= 3);
    assert.strictEqual(withErrors.length, 1);

    const errorBatch = withErrors[0];
    assert.strictEqual(errorBatch.recordsRejected, 2);
    assert.ok(errorBatch.errorSummary.includes('unmapped'));
  });

  test('5. Canonical field mapping resolution correctly maps source fields to platform tables', () => {
    const allMappings = getIntegrationMappings();
    assert.strictEqual(allMappings.length, 2);

    const hstMapping = getIntegrationMappings('CONN_HST_PATHWAYS');
    assert.strictEqual(hstMapping.length, 1);
    assert.strictEqual(hstMapping[0].targetEntity, 'public.surgical_cases');
    assert.ok(hstMapping[0].fieldRules.length >= 4);

    const waystarMapping = getIntegrationMappings('CONN_WAYSTAR_EDI');
    assert.strictEqual(waystarMapping.length, 1);
    assert.strictEqual(waystarMapping[0].targetEntity, 'public.remittance_claims');
  });

  test('6. Triggering manual sync batch creates a new batch record with COMPLETED status and increments batch history', () => {
    const initialBatches = getFacilityBatches('fac-naples-01');
    const result = triggerManualSyncBatch('CONN_HST_PATHWAYS', 'fac-naples-01');

    assert.ok(result.success);
    assert.strictEqual(result.status, BATCH_STATUSES.COMPLETED);
    assert.strictEqual(result.connectorCode, 'CONN_HST_PATHWAYS');
    assert.strictEqual(result.recordsIngested, 35);

    const updatedBatches = getFacilityBatches('fac-naples-01');
    assert.strictEqual(updatedBatches.length, initialBatches.length + 1);
  });

  test('7. Replay failed batch properly simulates reprocessing of DLQ records and clears error summary', () => {
    const errorBatch = getFacilityBatches('fac-naples-01').find(b => b.status === BATCH_STATUSES.COMPLETED_WITH_ERRORS);
    assert.ok(errorBatch, 'Must have at least one batch with errors in seed data');

    const result = replayFailedBatch(errorBatch.batchCode, 'fac-naples-01');
    assert.ok(result.success);
    assert.strictEqual(result.status, BATCH_STATUSES.COMPLETED);
    assert.strictEqual(result.recordsRejected, 0);

    const rechecked = getFacilityBatches('fac-naples-01').find(b => b.batchCode === errorBatch.batchCode);
    assert.strictEqual(rechecked.status, BATCH_STATUSES.COMPLETED);
    assert.strictEqual(rechecked.errorSummary, null);
  });

  test('8. Secret masking verification: Ensures no plaintext API keys or private certificates are exposed', () => {
    const connectors = getFacilityConnectors('fac-naples-01');
    for (const c of connectors) {
      assert.strictEqual(c.encryptedApiKey, undefined, 'Raw API key must not be exposed');
      assert.strictEqual(c.clientSecret, undefined, 'Client secret must not be exposed');
      assert.strictEqual(c.privateKey, undefined, 'Private key must not be exposed');
    }
  });

  test('9. Dual facade re-export parity between src/services/ and src/lib/', () => {
    assert.strictEqual(typeof facade.getFacilityConnectors, 'function');
    assert.strictEqual(typeof facade.getConnectorByIdOrCode, 'function');
    assert.strictEqual(typeof facade.getFacilityBatches, 'function');
    assert.strictEqual(typeof facade.getIntegrationMappings, 'function');
    assert.strictEqual(typeof facade.getIntegrationTelemetry, 'function');
    assert.strictEqual(typeof facade.triggerManualSyncBatch, 'function');
    assert.strictEqual(typeof facade.replayFailedBatch, 'function');
    assert.strictEqual(typeof facade.computeIntegrationPayloadHash, 'function');
  });

  test('10. Migration 122 UP/DOWN SQL structural integrity and RLS policy verification', () => {
    const upSqlPath = path.resolve(__dirname, '../supabase/migrations/122_integration_framework.sql');
    const downSqlPath = path.resolve(__dirname, '../supabase/migrations/122_integration_framework_down.sql');

    assert.ok(fs.existsSync(upSqlPath), 'Migration 122 UP file must exist');
    assert.ok(fs.existsSync(downSqlPath), 'Migration 122 DOWN file must exist');

    const upSql = fs.readFileSync(upSqlPath, 'utf8');
    const downSql = fs.readFileSync(downSqlPath, 'utf8');

    // Tables & Views
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.integration_connectors'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.integration_batches'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.integration_mappings'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.integration_provenance_records'));
    assert.ok(upSql.includes('CREATE OR REPLACE VIEW public.vw_integration_framework_telemetry'));

    // RLS Policies & Tenant Isolation
    assert.ok(upSql.includes('ENABLE ROW LEVEL SECURITY'));
    assert.ok(upSql.includes('tenant_isolation_connectors'));
    assert.ok(upSql.includes('tenant_isolation_batches'));
    assert.ok(upSql.includes('tenant_isolation_mappings'));
    assert.ok(upSql.includes('tenant_isolation_provenance'));
    assert.ok(upSql.includes("current_setting('app.current_facility_id', true)"));

    // Down SQL drops
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.integration_provenance_records'));
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.integration_mappings'));
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.integration_batches'));
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.integration_connectors'));
  });

  test('11. Strict Zero-Prohibited Token Compliance in IntegrationFrameworkView and services', () => {
    const cssPath = path.resolve(__dirname, '../src/components/IntegrationFrameworkView.css');
    const jsxPath = path.resolve(__dirname, '../src/components/IntegrationFrameworkView.jsx');
    const srvPath = path.resolve(__dirname, '../src/services/integrationFrameworkService.js');
    const libPath = path.resolve(__dirname, '../src/lib/integrationFrameworkService.js');

    const prohibitedRegex = /(purple|violet|indigo|magenta|fuchsia)/i;

    if (fs.existsSync(cssPath)) {
      const css = fs.readFileSync(cssPath, 'utf8');
      assert.strictEqual(prohibitedRegex.test(css), false, 'IntegrationFrameworkView.css contains prohibited color token');
    }
    if (fs.existsSync(jsxPath)) {
      const jsx = fs.readFileSync(jsxPath, 'utf8');
      assert.strictEqual(prohibitedRegex.test(jsx), false, 'IntegrationFrameworkView.jsx contains prohibited color token');
    }
    if (fs.existsSync(srvPath)) {
      const srv = fs.readFileSync(srvPath, 'utf8');
      assert.strictEqual(prohibitedRegex.test(srv), false, 'integrationFrameworkService.js contains prohibited color token');
    }
    if (fs.existsSync(libPath)) {
      const lib = fs.readFileSync(libPath, 'utf8');
      assert.strictEqual(prohibitedRegex.test(lib), false, 'lib/integrationFrameworkService.js contains prohibited color token');
    }
  });

  test('12. App Shell Integration (src/App.jsx) structure check', () => {
    const appJsxPath = path.resolve(__dirname, '../src/App.jsx');
    const appJsx = fs.readFileSync(appJsxPath, 'utf8');

    assert.ok(appJsx.includes('IntegrationFrameworkView'), 'App.jsx must import IntegrationFrameworkView');
    assert.ok(appJsx.includes("activeTab === 'integration_framework'"), 'App.jsx must route integration_framework tab');
    assert.ok(appJsx.includes("<IntegrationFrameworkView activeFacility={activeFacility} />"), 'App.jsx must render IntegrationFrameworkView');
  });
});
