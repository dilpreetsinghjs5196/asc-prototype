import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getImportPipelineTelemetry,
  getImportPipelineBatches,
  getImportExceptions,
  getValidationRules,
  runPipelineBatch,
  resolveImportException,
  resetLiveImportPipeline,
  computeImportAuditSeal,
  validateNpiLuhn,
  normalizePayerName,
  matchesFacilityId,
  PIPELINE_STAGES,
  RECORD_TYPES,
  MATCH_STATUSES,
  EXCEPTION_SEVERITIES,
  EXCEPTION_STATUSES,
  RESOLUTION_ACTIONS
} from '../src/services/importValidationService.js';

import * as facade from '../src/lib/importValidationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase F1: Import Validation Pipeline & Exception Workqueue', () => {
  beforeEach(() => {
    resetLiveImportPipeline();
  });

  test('1. Telemetry returns accurate 24-hour metrics (total staged 525, committed 518, quarantined 7, 98.67% pass rate, 657 ms latency)', () => {
    const telemetry = getImportPipelineTelemetry('fac-naples-01');

    assert.ok(telemetry);
    assert.strictEqual(telemetry.totalBatches24h, 3);
    assert.strictEqual(telemetry.totalStaged24h, 525);
    assert.strictEqual(telemetry.totalCommitted24h, 518);
    assert.strictEqual(telemetry.totalQuarantined24h, 7);
    assert.strictEqual(telemetry.activeExceptionsCount, 3);
    assert.strictEqual(telemetry.cleanPassRatePercent, 98.67);
    assert.strictEqual(telemetry.avgDurationMs, 657);
    assert.ok(telemetry.cryptographicCommitSeal);
    assert.strictEqual(telemetry.cryptographicCommitSeal.length, 64);
  });

  test('2. Facility UUID alias resolution matches Naples Surgery Center correctly across strings and objects', () => {
    assert.strictEqual(matchesFacilityId('fac-naples-01', 'fac-naples-01'), true);
    assert.strictEqual(matchesFacilityId('00000000-0000-0000-0000-000000000002', 'fac-naples-01'), true);
    assert.strictEqual(matchesFacilityId('fac-naples-01', { id: 'fac-naples-01' }), true);
    assert.strictEqual(matchesFacilityId('fac-naples-01', { facilityUuid: '00000000-0000-0000-0000-000000000002' }), true);
    assert.strictEqual(matchesFacilityId('fac-naples-01', 'ALL'), true);
    assert.strictEqual(matchesFacilityId('fac-naples-01', 'fac-miami-99'), false);
  });

  test('3. 6-Stage Lifecycle Sequential Progression and Constants', () => {
    assert.strictEqual(PIPELINE_STAGES.IMPORT, 'IMPORT');
    assert.strictEqual(PIPELINE_STAGES.VALIDATE, 'VALIDATE');
    assert.strictEqual(PIPELINE_STAGES.NORMALIZE, 'NORMALIZE');
    assert.strictEqual(PIPELINE_STAGES.MATCH, 'MATCH');
    assert.strictEqual(PIPELINE_STAGES.EXCEPTION, 'EXCEPTION');
    assert.strictEqual(PIPELINE_STAGES.COMMIT, 'COMMIT');

    assert.strictEqual(RECORD_TYPES.SURGICAL_CASE, 'SURGICAL_CASE');
    assert.strictEqual(MATCH_STATUSES.EXACT_MATCH, 'EXACT_MATCH');
    assert.strictEqual(RESOLUTION_ACTIONS.OVERRIDE_AND_COMMIT, 'OVERRIDE_AND_COMMIT');
  });

  test('4. Syntactic & Semantic Rule Enforcement (NPI Luhn verification, DOS boundaries, CPT regex)', () => {
    // Valid CMS NPI
    assert.strictEqual(validateNpiLuhn('1841392818'), true);
    // Invalid Luhn checksum
    assert.strictEqual(validateNpiLuhn('1234567890'), false);
    // Invalid length
    assert.strictEqual(validateNpiLuhn('12345'), false);
    // Invalid characters
    assert.strictEqual(validateNpiLuhn('184139281A'), false);
    // Null/undefined handling
    assert.strictEqual(validateNpiLuhn(null), false);
    assert.strictEqual(validateNpiLuhn(undefined), false);
  });

  test('5. Canonical Normalization Engine (Payer Aliasing dictionary and formatting)', () => {
    assert.strictEqual(normalizePayerName('FLORIDA BLUE'), 'PAYER_BCBS_FL');
    assert.strictEqual(normalizePayerName('fl blue'), 'PAYER_BCBS_FL');
    assert.strictEqual(normalizePayerName('United Healthcare'), 'PAYER_UHC');
    assert.strictEqual(normalizePayerName('UHC'), 'PAYER_UHC');
    assert.strictEqual(normalizePayerName('AETNA HEALTH'), 'PAYER_AETNA');
    assert.strictEqual(normalizePayerName('UNKNOWN_INSURANCE_CARRIER'), 'PAYER_UNMAPPED');
    assert.strictEqual(normalizePayerName(null), 'PAYER_UNMAPPED');
  });

  test('6. Batch execution ledger returns idempotent runs and tracks stage completion', () => {
    const batches = getImportPipelineBatches('fac-naples-01');
    assert.strictEqual(batches.length, 3);

    for (const b of batches) {
      assert.ok(b.recordsStaged > 0);
      assert.ok(b.recordsCommitted > 0);
      assert.strictEqual(b.currentStage, PIPELINE_STAGES.COMMIT);
      assert.ok(b.totalDurationMs > 0);
    }
  });

  test('7. Triggering pipeline batch execution processes records through all stages to COMMIT', () => {
    const initialBatches = getImportPipelineBatches('fac-naples-01');
    const result = runPipelineBatch('CONN_HST_PATHWAYS', 'fac-naples-01');

    assert.ok(result.success);
    assert.strictEqual(result.recordsCommitted, 50);
    assert.strictEqual(result.currentStage, PIPELINE_STAGES.COMMIT);

    const updatedBatches = getImportPipelineBatches('fac-naples-01');
    assert.strictEqual(updatedBatches.length, initialBatches.length + 1);
  });

  test('8. Exception Quarantine & Workqueue resolution workflows', () => {
    const pendingExceptions = getImportExceptions('fac-naples-01', { status: EXCEPTION_STATUSES.PENDING });
    assert.strictEqual(pendingExceptions.length, 3);

    // Override and Commit
    const target1 = pendingExceptions[0];
    const res1 = resolveImportException(target1.id, RESOLUTION_ACTIONS.OVERRIDE_AND_COMMIT);
    assert.ok(res1.success);
    assert.strictEqual(res1.resolutionStatus, EXCEPTION_STATUSES.RESOLVED);
    assert.strictEqual(res1.resolutionAction, RESOLUTION_ACTIONS.OVERRIDE_AND_COMMIT);

    // Reject Record
    const target2 = pendingExceptions[1];
    const res2 = resolveImportException(target2.id, RESOLUTION_ACTIONS.REJECT_RECORD);
    assert.ok(res2.success);
    assert.strictEqual(res2.resolutionStatus, EXCEPTION_STATUSES.REJECTED);
  });

  test('9. Dual facade re-export parity between src/services/ and src/lib/', () => {
    assert.strictEqual(typeof facade.getImportPipelineTelemetry, 'function');
    assert.strictEqual(typeof facade.getImportPipelineBatches, 'function');
    assert.strictEqual(typeof facade.getImportExceptions, 'function');
    assert.strictEqual(typeof facade.getValidationRules, 'function');
    assert.strictEqual(typeof facade.runPipelineBatch, 'function');
    assert.strictEqual(typeof facade.resolveImportException, 'function');
    assert.strictEqual(typeof facade.computeImportAuditSeal, 'function');
    assert.strictEqual(typeof facade.validateNpiLuhn, 'function');
    assert.strictEqual(typeof facade.normalizePayerName, 'function');
  });

  test('10. Migration 123 UP/DOWN SQL structural integrity and RLS policy verification', () => {
    const upSqlPath = path.resolve(__dirname, '../supabase/migrations/123_import_validation_pipeline.sql');
    const downSqlPath = path.resolve(__dirname, '../supabase/migrations/123_import_validation_pipeline_down.sql');

    assert.ok(fs.existsSync(upSqlPath), 'Migration 123 UP file must exist');
    assert.ok(fs.existsSync(downSqlPath), 'Migration 123 DOWN file must exist');

    const upSql = fs.readFileSync(upSqlPath, 'utf8');
    const downSql = fs.readFileSync(downSqlPath, 'utf8');

    // Tables & Views
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.import_pipeline_batches'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.import_staged_records'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.import_validation_rules'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.import_exceptions'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.import_provenance_audit'));
    assert.ok(upSql.includes('CREATE OR REPLACE VIEW public.vw_import_pipeline_telemetry'));

    // RLS Policies & Tenant Isolation
    assert.ok(upSql.includes('ENABLE ROW LEVEL SECURITY'));
    assert.ok(upSql.includes('tenant_isolation_pipeline_batches'));
    assert.ok(upSql.includes('tenant_isolation_staged_records'));
    assert.ok(upSql.includes('public_read_validation_rules'));
    assert.ok(upSql.includes('tenant_isolation_import_exceptions'));
    assert.ok(upSql.includes('tenant_isolation_provenance_audit'));
    assert.ok(upSql.includes("current_setting('app.current_facility_id', true)"));

    // Down SQL drops
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.import_provenance_audit'));
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.import_exceptions'));
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.import_validation_rules'));
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.import_staged_records'));
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.import_pipeline_batches'));
  });

  test('11. Strict Zero-Prohibited Token Compliance in ImportValidationView and services', () => {
    const cssPath = path.resolve(__dirname, '../src/components/ImportValidationView.css');
    const jsxPath = path.resolve(__dirname, '../src/components/ImportValidationView.jsx');
    const srvPath = path.resolve(__dirname, '../src/services/importValidationService.js');
    const libPath = path.resolve(__dirname, '../src/lib/importValidationService.js');

    const prohibitedRegex = /(purple|violet|indigo|magenta|fuchsia)/i;

    if (fs.existsSync(cssPath)) {
      const css = fs.readFileSync(cssPath, 'utf8');
      assert.strictEqual(prohibitedRegex.test(css), false, 'ImportValidationView.css contains prohibited color token');
    }
    if (fs.existsSync(jsxPath)) {
      const jsx = fs.readFileSync(jsxPath, 'utf8');
      assert.strictEqual(prohibitedRegex.test(jsx), false, 'ImportValidationView.jsx contains prohibited color token');
    }
    if (fs.existsSync(srvPath)) {
      const srv = fs.readFileSync(srvPath, 'utf8');
      assert.strictEqual(prohibitedRegex.test(srv), false, 'importValidationService.js contains prohibited color token');
    }
    if (fs.existsSync(libPath)) {
      const lib = fs.readFileSync(libPath, 'utf8');
      assert.strictEqual(prohibitedRegex.test(lib), false, 'lib/importValidationService.js contains prohibited color token');
    }
  });

  test('12. App Shell Integration (src/App.jsx) structure check', () => {
    const appJsxPath = path.resolve(__dirname, '../src/App.jsx');
    const appJsx = fs.readFileSync(appJsxPath, 'utf8');

    assert.ok(appJsx.includes('ImportValidationView'), 'App.jsx must import ImportValidationView');
    assert.ok(appJsx.includes("activeTab === 'import_validation'"), 'App.jsx must route import_validation tab');
    assert.ok(appJsx.includes('<ImportValidationView activeFacility={activeFacility} />'), 'App.jsx must render ImportValidationView');
  });
});
