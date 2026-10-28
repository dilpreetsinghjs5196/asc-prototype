import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  caseImplantUsageService,
  SOURCING_CHANNELS,
  WASTE_REASONS,
  WASTE_LIABILITIES,
  AMENDMENT_REASON_CODES,
  UNITS_OF_MEASURE
} from '../src/lib/caseImplantUsageService.js';
import { db } from '../src/lib/supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// ==============================================================================
// SUITE 1: DATABASE MIGRATION 035 DDL & SCHEMA INTEGRITY
// ==============================================================================

test('Phase 59 — Database Migration 035: DDL & Schema Integrity', async (t) => {
  const upMigrationPath = path.join(rootDir, 'supabase', 'migrations', '035_case_implant_usage.sql');
  const downMigrationPath = path.join(rootDir, 'supabase', 'migrations', '035_case_implant_usage_down.sql');

  await t.test('Migration 035 forward and rollback SQL files exist and are substantive', () => {
    assert.ok(fs.existsSync(upMigrationPath), '035_case_implant_usage.sql must exist');
    assert.ok(fs.existsSync(downMigrationPath), '035_case_implant_usage_down.sql must exist');
    const upSql = fs.readFileSync(upMigrationPath, 'utf8');
    const downSql = fs.readFileSync(downMigrationPath, 'utf8');
    assert.ok(upSql.length > 5000, 'Up migration must be substantive (>5000 bytes)');
    assert.ok(downSql.length > 500, 'Down migration must be substantive (>500 bytes)');
  });

  const upSql = fs.readFileSync(upMigrationPath, 'utf8');
  const downSql = fs.readFileSync(downMigrationPath, 'utf8');

  await t.test('Extends public.case_devices with bifurcated quantity columns and packaging', () => {
    assert.match(upSql, /ALTER TABLE public\.case_devices/);
    assert.match(upSql, /quantity_opened INTEGER NOT NULL DEFAULT 1/);
    assert.match(upSql, /quantity_implanted INTEGER NOT NULL DEFAULT 1/);
    assert.match(upSql, /quantity_wasted INTEGER NOT NULL DEFAULT 0/);
    assert.match(upSql, /quantity_returned INTEGER NOT NULL DEFAULT 0/);
    assert.match(upSql, /unit_of_measure VARCHAR\(20\)/);
    assert.match(upSql, /package_size INTEGER NOT NULL DEFAULT 1/);
  });

  await t.test('Enforces mathematical quantity balance check constraint', () => {
    assert.match(upSql, /chk_case_device_quantity_balance/);
    assert.match(upSql, /quantity_opened\s*=\s*\(quantity_implanted\s*\+\s*quantity_wasted\s*\+\s*quantity_returned\)/);
  });

  await t.test('Extends public.case_devices with bifurcated UDI DI/PI fields', () => {
    assert.match(upSql, /udi_di VARCHAR\(50\)/);
    assert.match(upSql, /udi_pi VARCHAR\(100\)/);
    assert.match(upSql, /udi_issuing_agency VARCHAR\(20\)/);
    assert.match(upSql, /catalog_number VARCHAR\(50\)/);
    assert.match(upSql, /serial_tracking_required BOOLEAN/);
    assert.match(upSql, /lot_tracking_required BOOLEAN/);
  });

  await t.test('Extends public.case_devices with clinical waste and liability attribution', () => {
    assert.match(upSql, /waste_reason VARCHAR\(50\)/);
    assert.match(upSql, /waste_liability VARCHAR\(30\)/);
    assert.match(upSql, /waste_notes TEXT/);
    assert.match(upSql, /chk_case_device_waste_attribution/);
    assert.match(upSql, /DROPPED_ON_FIELD/);
    assert.match(upSql, /VENDOR_REPLACEMENT_CREDIT/);
  });

  await t.test('Extends public.case_devices with sourcing channel provenance', () => {
    assert.match(upSql, /sourcing_channel VARCHAR\(30\)/);
    assert.match(upSql, /FACILITY_OWNED/);
    assert.match(upSql, /VENDOR_CONSIGNMENT/);
    assert.match(upSql, /BILL_ONLY/);
    assert.match(upSql, /verified_acquisition_cost NUMERIC\(12,\s*4\)/);
  });

  await t.test('Extends public.case_devices with case closure and amendment versioning', () => {
    assert.match(upSql, /is_closed BOOLEAN NOT NULL DEFAULT FALSE/);
    assert.match(upSql, /closed_at TIMESTAMPTZ/);
    assert.match(upSql, /closed_by UUID REFERENCES auth\.users/);
    assert.match(upSql, /amendment_version INTEGER NOT NULL DEFAULT 0/);
  });

  await t.test('Creates public.case_device_amendments table with two-person governance', () => {
    assert.match(upSql, /CREATE TABLE IF NOT EXISTS public\.case_device_amendments/);
    assert.match(upSql, /case_device_id UUID NOT NULL REFERENCES public\.case_devices/);
    assert.match(upSql, /amendment_sequence INTEGER NOT NULL/);
    assert.match(upSql, /reason_code VARCHAR\(40\)/);
    assert.match(upSql, /justification_text TEXT NOT NULL/);
    assert.match(upSql, /approval_status VARCHAR\(20\)/);
    assert.match(upSql, /uq_case_device_amendment_seq/);
  });

  await t.test('Creates public.case_implant_scans table for optical scanning telemetry', () => {
    assert.match(upSql, /CREATE TABLE IF NOT EXISTS public\.case_implant_scans/);
    assert.match(upSql, /raw_scan_payload TEXT NOT NULL/);
    assert.match(upSql, /symbology VARCHAR\(30\)/);
    assert.match(upSql, /parsed_udi_di VARCHAR\(50\)/);
  });

  await t.test('Defines authoritative trigger and stored procedures', () => {
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_sync_surgery_implants_cost/);
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_amend_case_device/);
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_search_implant_recalls/);
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_reconcile_case_device_totals/);
  });

  await t.test('Down migration cleanly drops procedures, tables, and columns', () => {
    assert.match(downSql, /DROP FUNCTION IF EXISTS public\.fn_search_implant_recalls/);
    assert.match(downSql, /DROP FUNCTION IF EXISTS public\.fn_amend_case_device/);
    assert.match(downSql, /DROP TABLE IF EXISTS public\.case_implant_scans CASCADE/);
    assert.match(downSql, /DROP TABLE IF EXISTS public\.case_device_amendments CASCADE/);
    assert.match(downSql, /DROP COLUMN IF EXISTS quantity_opened/);
    assert.match(downSql, /DROP COLUMN IF EXISTS is_closed/);
  });
});

// ==============================================================================
// SUITE 2: MATHEMATICAL CONSERVATION & BUSINESS RULE INVARIANTS
// ==============================================================================

test('Phase 59 — Mathematical Balance: Opened = Implanted + Wasted + Returned', async (t) => {
  await t.test('Exports domain enums and metadata constants', () => {
    assert.ok(Array.isArray(SOURCING_CHANNELS) && SOURCING_CHANNELS.includes('FACILITY_OWNED'));
    assert.ok(Array.isArray(WASTE_REASONS) && WASTE_REASONS.includes('DROPPED_ON_FIELD'));
    assert.ok(Array.isArray(WASTE_LIABILITIES) && WASTE_LIABILITIES.includes('FACILITY_EXPENSE'));
    assert.ok(Array.isArray(AMENDMENT_REASON_CODES) && AMENDMENT_REASON_CODES.includes('INCORRECT_LOT_SERIAL'));
    assert.ok(Array.isArray(UNITS_OF_MEASURE) && UNITS_OF_MEASURE.includes('EA'));
    assert.ok(typeof db.reconcileCaseDeviceTotals === 'function');
  });

  await t.test('Validates exact conservation identity: 1 = 1 + 0 + 0', () => {
    const res = caseImplantUsageService.validateQuantityBalance(1, 1, 0, 0);
    assert.equal(res.isValid, true);
    assert.equal(res.error, null);
  });

  await t.test('Validates multi-unit conservation identity: 5 = 3 + 1 + 1', () => {
    const res = caseImplantUsageService.validateQuantityBalance(5, 3, 1, 1);
    assert.equal(res.isValid, true);
    assert.equal(res.error, null);
  });

  await t.test('Rejects imbalance where sum exceeds opened: 2 opened, but 2 implanted + 1 wasted', () => {
    const res = caseImplantUsageService.validateQuantityBalance(2, 2, 1, 0);
    assert.equal(res.isValid, false);
    assert.match(res.error, /Mathematical imbalance/);
  });

  await t.test('Rejects imbalance where sum falls short of opened: 3 opened, but 1 implanted + 0 wasted + 0 returned', () => {
    const res = caseImplantUsageService.validateQuantityBalance(3, 1, 0, 0);
    assert.equal(res.isValid, false);
    assert.match(res.error, /Mathematical imbalance/);
  });

  await t.test('Rejects negative quantity entries', () => {
    const res = caseImplantUsageService.validateQuantityBalance(2, 3, -1, 0);
    assert.equal(res.isValid, false);
    assert.match(res.error, /Quantities cannot be negative/);
  });
});

// ==============================================================================
// SUITE 3: FDA UDI & BARCODE PARSING ENGINE
// ==============================================================================

test('Phase 59 — FDA UDI & Barcode Parsing Engine (GS1-128 & HIBCC)', async (t) => {
  await t.test('Parses standard GS1-128 barcode with GTIN, Expiration, Lot, and Serial', () => {
    const raw = '(01)00888888123451(17)281031(10)LOT-9821A(21)SN-24K8912';
    const parsed = caseImplantUsageService.parseUdiBarcode(raw);
    assert.equal(parsed.parse_success, true);
    assert.equal(parsed.udi_di, '00888888123451');
    assert.equal(parsed.expiration_date, '2028-10-31');
    assert.equal(parsed.lot_number, 'LOT-9821A');
    assert.equal(parsed.serial_number, 'SN-24K8912');
    assert.equal(parsed.symbology, 'GS1_128');
  });

  await t.test('Parses GS1 barcode without parenthesized AIs: 01008888881234681728091510LOT-7712B21SN-24L0041', () => {
    const raw = '01008888881234681728091510LOT-7712B21SN-24L0041';
    const parsed = caseImplantUsageService.parseUdiBarcode(raw);
    assert.equal(parsed.parse_success, true);
    assert.equal(parsed.udi_di, '00888888123468');
    assert.equal(parsed.expiration_date, '2028-09-15');
    assert.equal(parsed.lot_number, 'LOT-7712B21SN-24L0041'); // Continuous alphanumeric batch
  });

  await t.test('Parses HIBCC Primary Barcode with "+" prefix', () => {
    const raw = '+M12345678901';
    const parsed = caseImplantUsageService.parseUdiBarcode(raw);
    assert.equal(parsed.parse_success, true);
    assert.equal(parsed.udi_di, 'M12345678901');
    assert.match(parsed.symbology, /HIBC/);
  });

  await t.test('Gracefully handles unformatted raw catalog numbers as fallback', () => {
    const raw = '5520-F-401';
    const parsed = caseImplantUsageService.parseUdiBarcode(raw);
    assert.equal(parsed.parse_success, false);
    assert.equal(parsed.catalog_number, '5520-F-401');
    assert.equal(parsed.symbology, 'CODE128');
  });

  await t.test('Rejects empty or null barcode string', () => {
    const parsed = caseImplantUsageService.parseUdiBarcode('');
    assert.equal(parsed.parse_success, false);
    assert.match(parsed.error_details, /Empty or invalid/);
  });
});

// ==============================================================================
// SUITE 4: SERVICE LAYER OPERATIONS & CASE RECONCILIATIONS
// ==============================================================================

test('Phase 59 — Service Layer Operations & Case Calculations', async (t) => {
  await t.test('Retrieves documented devices for sample case 1042', async () => {
    const devices = await caseImplantUsageService.getCaseDevices(1042);
    assert.ok(Array.isArray(devices), 'Must return an array');
    assert.ok(devices.length >= 3, 'Must have at least 3 baseline sample devices');
  });

  await t.test('Calculates case usage summary accurately (Excluding waste from patient charges)', async () => {
    const summary = await caseImplantUsageService.getCaseUsageSummary(1042);
    assert.equal(summary.surgeryId, 1042);
    assert.ok(summary.quantityOpened >= 3, 'Opened items should be >= 3');
    assert.ok(summary.quantityImplanted >= 2, 'Implanted items should be >= 2');
    assert.ok(summary.quantityWasted >= 1, 'Wasted items should be >= 1');
    assert.ok(summary.totalImplantedCost > 0, 'Total implanted cost must be positive');
    assert.ok(summary.totalWasteCost > 0, 'Total waste cost must be positive');
  });

  await t.test('Enforces waste reason when quantity_wasted > 0 in recordImplantUsage', async () => {
    await assert.rejects(
      async () => {
        await caseImplantUsageService.recordImplantUsage({
          surgery_id: 1042,
          device_name: 'Test Sizing Insert',
          quantity_opened: 1,
          quantity_implanted: 0,
          quantity_wasted: 1,
          quantity_returned: 0,
          waste_reason: null // Violation
        });
      },
      /Waste reason is mandatory/
    );
  });

  await t.test('Records valid implant usage and balances correctly', async () => {
    const item = await caseImplantUsageService.recordImplantUsage({
      surgery_id: 1042,
      device_name: 'Triathlon Modular Tibial Insert 11mm',
      catalog_number: '5532-X-1101',
      lot_number: 'LOT-9921D',
      quantity_opened: 1,
      quantity_implanted: 1,
      quantity_wasted: 0,
      quantity_returned: 0,
      unit_cost: 480.00,
      sourcing_channel: 'FACILITY_OWNED'
    });
    assert.ok(item.id, 'Record must have an ID');
    assert.equal(item.quantity_implanted, 1);
    assert.equal(item.usage_status, 'IMPLANTED');
  });

  await t.test('Logs clinical waste on an existing device and re-balances quantities', async () => {
    const devices = await caseImplantUsageService.getCaseDevices(1042);
    const target = devices.find((d) => d.quantity_implanted > 0) || devices[0];
    
    const updated = await caseImplantUsageService.logDeviceWaste(target.id, {
      wasteQty: 1,
      wasteReason: 'CONTAMINATED_OPENED_NOT_USED',
      wasteLiability: 'FACILITY_EXPENSE',
      notes: 'Sterile seal breached on field'
    });

    assert.ok(updated.quantity_wasted >= 1, 'Wasted quantity must increment');
    assert.equal(updated.waste_reason, 'CONTAMINATED_OPENED_NOT_USED');
  });

  await t.test('Closes and locks case implant documentation', async () => {
    const res = await caseImplantUsageService.closeCaseImplantDocumentation(1042, '00000000-0000-0000-0001-000000000001');
    assert.equal(res.success, true);
    assert.equal(res.surgeryId, 1042);

    const summary = await caseImplantUsageService.getCaseUsageSummary(1042);
    assert.equal(summary.isClosed, true);
  });

  await t.test('Submits post-closure amendment with mandatory justification (>= 10 chars)', async () => {
    const devices = await caseImplantUsageService.getCaseDevices(1042);
    const target = devices[0];

    // Must fail if justification < 10 chars
    await assert.rejects(
      async () => {
        await caseImplantUsageService.submitDeviceAmendment(target.id, {
          fieldName: 'lot_number',
          newValue: 'LOT-9821B',
          reasonCode: 'INCORRECT_LOT_SERIAL',
          justification: 'Short'
        });
      },
      /at least 10 characters/
    );

    // Passes with valid justification
    const amendRes = await caseImplantUsageService.submitDeviceAmendment(target.id, {
      fieldName: 'lot_number',
      newValue: 'LOT-9821B',
      reasonCode: 'INCORRECT_LOT_SERIAL',
      justification: 'Vendor sticker was smudged; verified against outer packaging label.'
    });

    assert.equal(amendRes.success, true);
    assert.equal(amendRes.new_value, 'LOT-9821B');

    const history = await caseImplantUsageService.getDeviceAmendments(target.id);
    assert.ok(history.length >= 1, 'Must have at least one amendment record');
  });

  await t.test('Unlocks case documentation with administrative justification', async () => {
    const unlockRes = await caseImplantUsageService.unlockCaseImplantDocumentation(
      1042,
      '00000000-0000-0000-0001-000000000001',
      'Clinical Manager unlocked for operative adjustment'
    );
    assert.equal(unlockRes.success, true);

    const summary = await caseImplantUsageService.getCaseUsageSummary(1042);
    assert.equal(summary.isClosed, false);
  });

  await t.test('Searches recalled cases by lot number and returns patient roster', async () => {
    const matches = await caseImplantUsageService.searchRecalledCases({ lotNumber: 'LOT-7712B' });
    assert.ok(Array.isArray(matches), 'Matches must be an array');
    assert.ok(matches.length >= 1, 'Should find at least 1 matching patient case');
    assert.equal(matches[0].lot_number, 'LOT-7712B');
    assert.ok(matches[0].patient_name, 'Patient name must be present for follow-up');
  });
});

// ==============================================================================
// SUITE 5: STRICT PURPLE BAN & UI COMPONENT AUDIT
// ==============================================================================

test('Phase 59 — Strict Purple Ban & UI Token Audit', async (t) => {
  const cssPath = path.join(rootDir, 'src', 'components', 'CaseImplantUsage.css');
  const jsxPath = path.join(rootDir, 'src', 'components', 'CaseImplantUsage.jsx');

  assert.ok(fs.existsSync(cssPath), 'CaseImplantUsage.css must exist');
  assert.ok(fs.existsSync(jsxPath), 'CaseImplantUsage.jsx must exist');

  const css = fs.readFileSync(cssPath, 'utf8');
  const jsx = fs.readFileSync(jsxPath, 'utf8');
  const strippedCss = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const strippedJsx = jsx.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  await t.test('CaseImplantUsage.css contains zero purple, violet, indigo, fuchsia, or magenta tokens', () => {
    const forbidden = [/purple/i, /violet/i, /indigo/i, /fuchsia/i, /magenta/i, /#8b5cf6/i, /#a855f7/i, /#c084fc/i, /#6366f1/i];
    forbidden.forEach((regex) => {
      assert.ok(!regex.test(strippedCss), `CaseImplantUsage.css must not match ${regex}`);
    });
  });

  await t.test('CaseImplantUsage.jsx contains zero purple, violet, indigo, fuchsia, or magenta tokens', () => {
    const forbidden = [/purple/i, /violet/i, /indigo/i, /fuchsia/i, /magenta/i, /#8b5cf6/i, /#a855f7/i, /#c084fc/i, /#6366f1/i];
    forbidden.forEach((regex) => {
      assert.ok(!regex.test(strippedJsx), `CaseImplantUsage.jsx must not match ${regex}`);
    });
  });
});
