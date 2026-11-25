/**
 * ==============================================================================
 * Test Suite: excel-csv-import.test.js
 * Module 15: Enterprise Healthcare Integrations (Phase F2)
 * Tests: Ingestion Templates, Fuzzy Auto-Mapping, Row Validation, Inline Correction,
 *        Atomic Batch Commit, Migration Integrity, Zero-Prohibited Tokens, and Shell Integration.
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
  validateNpiLuhn,
  validateCptCode,
  validateCurrencyAmount,
  validateCalendarDate,
  computeExcelImportSeal,
  EXCEL_IMPORT_TEMPLATES,
  autoMapHeaders,
  validateRow,
  getExcelImportTelemetry,
  getImportTemplates,
  getImportBatches,
  getStagedRows,
  uploadAndProcessFile,
  correctStagedRow,
  commitStagedBatch
} from '../src/services/excelCsvImportService.js';

import * as facade from '../src/lib/excelCsvImportService.js';

describe('Phase F2: Excel / CSV File Import & Schema Ingestion Engine', () => {

  // Test 1: Telemetry
  test('1. Telemetry returns accurate 24-hour metrics for Naples Surgery Center', () => {
    const telemetry = getExcelImportTelemetry(NAPLES_FACILITY_ID);
    assert.ok(telemetry, 'Telemetry object should exist');
    assert.equal(telemetry.facilityId, NAPLES_FACILITY_ID);
    assert.ok(telemetry.totalImportedRows >= 425, `Expected >= 425 rows, got ${telemetry.totalImportedRows}`);
    assert.ok(telemetry.cleanIngestionRatePct > 90, `Expected clean rate > 90%, got ${telemetry.cleanIngestionRatePct}`);
    assert.ok(telemetry.latestCommitSeal.startsWith('sha256_excel_'), 'Commit seal should have sha256_excel_ prefix');
    assert.equal(telemetry.headerMatchScorePct, 96.4);
  });

  // Test 2: Facility ID Normalization
  test('2. Facility UUID alias resolution matches Naples Surgery Center correctly across strings and objects', () => {
    assert.equal(normalizeFacilityId('fac-naples-01'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId('naples-surgery-center'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ id: 'fac-naples-01' }), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ facility_id: NAPLES_FACILITY_ID }), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId(null), NAPLES_FACILITY_ID);
  });

  // Test 3: Template Registry
  test('3. Template registry returns all 4 canonical schemas with required and optional columns', () => {
    const templates = getImportTemplates();
    assert.equal(templates.length, 4);

    const codes = templates.map(t => t.code);
    assert.ok(codes.includes('TEMPLATE_SURGICAL_CASES'));
    assert.ok(codes.includes('TEMPLATE_REMITTANCE_835'));
    assert.ok(codes.includes('TEMPLATE_IMPLANT_PURCHASES'));
    assert.ok(codes.includes('TEMPLATE_FEE_SCHEDULE'));

    const surgTmpl = templates.find(t => t.code === 'TEMPLATE_SURGICAL_CASES');
    assert.ok(surgTmpl.requiredColumns.includes('surgery_date'));
    assert.ok(surgTmpl.requiredColumns.includes('surgeon_npi'));
    assert.ok(surgTmpl.requiredColumns.includes('primary_cpt'));

    const remitTmpl = templates.find(t => t.code === 'TEMPLATE_REMITTANCE_835');
    assert.ok(remitTmpl.requiredColumns.includes('claim_number'));
    assert.ok(remitTmpl.requiredColumns.includes('paid_amount'));
  });

  // Test 4: Header Auto-Mapping Fuzzy Algorithm
  test('4. Header auto-mapping fuzzy match binds arbitrary headers to canonical platform fields', () => {
    const rawHeaders = ['DOS', 'Patient Chart #', 'Physician NPI', 'Primary Px', 'OR #', 'Unknown Extra'];
    const mappings = autoMapHeaders(rawHeaders, 'TEMPLATE_SURGICAL_CASES');

    assert.equal(mappings.length, 6);

    const dosMap = mappings.find(m => m.sourceHeader === 'DOS');
    assert.equal(dosMap.targetField, 'surgery_date');
    assert.ok(dosMap.confidenceScore >= 85);
    assert.equal(dosMap.isRequired, true);

    const npiMap = mappings.find(m => m.sourceHeader === 'Physician NPI');
    assert.equal(npiMap.targetField, 'surgeon_npi');
    assert.ok(npiMap.confidenceScore >= 85);

    const cptMap = mappings.find(m => m.sourceHeader === 'Primary Px');
    assert.equal(cptMap.targetField, 'primary_cpt');
    assert.ok(cptMap.confidenceScore >= 85);

    const unkMap = mappings.find(m => m.sourceHeader === 'Unknown Extra');
    assert.equal(unkMap.targetField, null);
    assert.equal(unkMap.confidenceTier, 'UNMAPPED');
  });

  // Test 5: Row-Level Validation Rules
  test('5. Row-level validation enforces CMS NPI Luhn, CPT format, currency non-negativity, and dates', () => {
    // Valid NPI for Dr. Brian Miller
    assert.ok(validateNpiLuhn('1841392818'), 'Valid NPI should pass Luhn checksum');
    // Invalid NPI (corrupted check digit)
    assert.ok(!validateNpiLuhn('1841392815'), 'Invalid NPI should fail Luhn checksum');

    // CPT syntax
    assert.ok(validateCptCode('29881'), '29881 should be valid CPT');
    assert.ok(validateCptCode('G0260'), 'G0260 should be valid HCPCS');
    assert.ok(!validateCptCode('2988'), 'Short CPT should fail');
    assert.ok(!validateCptCode('298819'), 'Long CPT should fail');

    // Currency
    assert.ok(validateCurrencyAmount('420.50'), 'Positive currency should pass');
    assert.ok(validateCurrencyAmount(0), 'Zero currency should pass');
    assert.ok(!validateCurrencyAmount('-420.00'), 'Negative currency should fail');

    // Date
    assert.ok(validateCalendarDate('2026-02-24'), '2026 date should be valid');
    assert.ok(!validateCalendarDate('1995-01-01'), 'Pre-2010 date should fail');

    // Full row validation
    const validRow = {
      surgery_date: '2026-02-24',
      patient_mrn: 'MRN-1001',
      surgeon_npi: '1841392818',
      primary_cpt: '29881',
      or_room_name: 'OR-1'
    };
    const resValid = validateRow(validRow, 'TEMPLATE_SURGICAL_CASES');
    assert.equal(resValid.isValid, true);
    assert.equal(resValid.errors.length, 0);

    const invalidRow = {
      surgery_date: '2026-02-24',
      patient_mrn: 'MRN-1002',
      surgeon_npi: '1841392815', // Bad NPI
      primary_cpt: 'BAD_CPT',     // Bad CPT
      or_room_name: 'OR-2'
    };
    const resInvalid = validateRow(invalidRow, 'TEMPLATE_SURGICAL_CASES');
    assert.equal(resInvalid.isValid, false);
    assert.equal(resInvalid.errors.length, 2);
  });

  // Test 6: File Upload and Ingestion Processing
  test('6. Upload and staging creates batch record and transitions status based on validation errors', () => {
    const uploadPayload = {
      filename: 'Test_Cases_Upload.csv',
      fileSizeBytes: 24000,
      fileMimeType: 'text/csv',
      templateCode: 'TEMPLATE_SURGICAL_CASES',
      rawHeaders: ['DOS', 'Patient MRN', 'Surgeon NPI', 'Primary CPT', 'OR Room'],
      rows: [
        { DOS: '2026-02-24', 'Patient MRN': 'MRN-901', 'Surgeon NPI': '1841392818', 'Primary CPT': '29881', 'OR Room': 'OR-1' },
        { DOS: '2026-02-24', 'Patient MRN': 'MRN-902', 'Surgeon NPI': '1841392815', 'Primary CPT': '45378', 'OR Room': 'OR-2' } // Invalid NPI
      ]
    };

    const result = uploadAndProcessFile(uploadPayload, NAPLES_FACILITY_ID);
    assert.ok(result.batch, 'Batch should be created');
    assert.equal(result.batch.totalRows, 2);
    assert.equal(result.batch.validRows, 1);
    assert.equal(result.batch.quarantinedRows, 1);
    assert.equal(result.batch.status, 'EXCEPTION_REVIEW');
    assert.equal(result.stagedRows.length, 2);
  });

  // Test 7: Inline Correction
  test('7. Inline correction of quarantined row clears error flags and updates status to VALIDATED', () => {
    // Find quarantined row
    const stagedRows = getStagedRows('c2222222-2222-2222-2222-222222222222');
    const badCostRow = stagedRows.find(r => r.id === 'd1111111-1111-1111-1111-111111111111');
    assert.ok(badCostRow, 'Bad cost row d1111111 should exist');
    assert.equal(badCostRow.validationStatus, 'QUARANTINED');

    // Correct unit_cost from -420.00 to 420.00
    const correctionResult = correctStagedRow('d1111111-1111-1111-1111-111111111111', { unit_cost: 420.00 }, 'TEMPLATE_IMPLANT_PURCHASES');
    assert.equal(correctionResult.success, true);
    assert.equal(correctionResult.row.validationStatus, 'VALIDATED');
    assert.equal(correctionResult.row.errorCount, 0);
    assert.equal(correctionResult.row.isCorrected, true);
  });

  // Test 8: Atomic Batch Commit
  test('8. Batch commit atomically writes rows and records cryptographic SHA-256 seal', () => {
    const commitResult = commitStagedBatch('c2222222-2222-2222-2222-222222222222', NAPLES_FACILITY_ID, 'facility_admin');
    assert.equal(commitResult.success, true);
    assert.ok(commitResult.rowsCommitted >= 1);
    assert.ok(commitResult.commitSeal.startsWith('sha256_excel_'));
    assert.equal(commitResult.commitSeal.length, 64);
  });

  // Test 9: Dual Facade Parity
  test('9. Dual facade re-export parity between src/services/ and src/lib/', () => {
    const serviceKeys = Object.keys(service).filter(k => typeof service[k] === 'function');
    for (const key of serviceKeys) {
      assert.equal(typeof facade[key], 'function', `Facade should export function '${key}'`);
    }
    assert.equal(facade.NAPLES_FACILITY_ID, NAPLES_FACILITY_ID);
    assert.equal(facade.EXCEL_IMPORT_TEMPLATES.length, EXCEL_IMPORT_TEMPLATES.length);
  });

  // Test 10: Migration 124 SQL Integrity
  test('10. Migration 124 UP/DOWN SQL structural integrity and RLS policies', () => {
    const upSqlPath = path.resolve('supabase/migrations/124_excel_csv_import.sql');
    const downSqlPath = path.resolve('supabase/migrations/124_excel_csv_import_down.sql');

    assert.ok(fs.existsSync(upSqlPath), '124_excel_csv_import.sql should exist');
    assert.ok(fs.existsSync(downSqlPath), '124_excel_csv_import_down.sql should exist');

    const upSql = fs.readFileSync(upSqlPath, 'utf8');
    const downSql = fs.readFileSync(downSqlPath, 'utf8');

    // Verify required tables
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.excel_import_templates'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.excel_import_batches'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.excel_import_staged_rows'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.excel_import_exceptions'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.excel_import_provenance_records'));
    assert.ok(upSql.includes('ENABLE ROW LEVEL SECURITY'));
    assert.ok(upSql.includes('CREATE OR REPLACE VIEW public.vw_excel_csv_import_telemetry'));

    // Verify rollback drops
    assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_excel_csv_import_telemetry'));
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.excel_import_templates CASCADE'));
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.excel_import_batches CASCADE'));
  });

  // Test 11: Zero Prohibited Tokens
  test('11. Strict Zero-Prohibited Token Compliance in ExcelCsvImportView and services', () => {
    const jsxPath = path.resolve('src/components/ExcelCsvImportView.jsx');
    const cssPath = path.resolve('src/components/ExcelCsvImportView.css');
    const servicePath = path.resolve('src/services/excelCsvImportService.js');

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

    assert.ok(appContent.includes("import ExcelCsvImportView from './components/ExcelCsvImportView';"));
    assert.ok(appContent.includes("activeTab === 'excel_csv_import'"));
    assert.ok(appContent.includes("<ExcelCsvImportView activeFacility={activeFacility} />"));
    assert.ok(appContent.includes("Excel / CSV Import"));
    assert.ok(appContent.includes("Excel & CSV Schema Ingestion Engine"));
  });

});
