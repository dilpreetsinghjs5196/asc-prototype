/**
 * ==============================================================================
 * Test Suite: vendor-invoice-import.test.js
 * Module 15: Enterprise Healthcare Integrations (Phase F9)
 * Tests: Vendor Invoice Parser Configuration, GPO Price Contract Catalog,
 *        Multi-Tier SKU Cross-Reference Matching, Line Variance Calculations,
 *        3-Way PO Validation, Duplicate & Math Imbalance Guards, Migration 131
 *        UP/DOWN Integrity, Zero-Prohibited Tokens, and Shell Integration.
 * ==============================================================================
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import service, {
  NAPLES_FACILITY_ID,
  normalizeFacilityId,
  computeVendorInvoiceSeal,
  maskVendorInvoiceSecret,
  matchVendorSku,
  calculateLineVariance,
  validateThreeWayInvoiceMatch,
  getVendorInvoiceConfig,
  getVendorInvoiceTelemetry,
  getVendorPriceContracts,
  getVendorPurchaseOrders,
  getVendorInvoiceBatches,
  getVendorInvoiceLines,
  getVendorInvoiceExceptions,
  importVendorInvoiceBatch,
  approveVendorInvoiceForAp,
  resolveVendorInvoiceException
} from '../src/services/vendorInvoiceService.js';

import * as facade from '../src/lib/vendorInvoiceService.js';

describe('Phase F9: Vendor Invoice & Price Import Gateway', () => {

  // Test 1: Telemetry
  test('1. Telemetry returns accurate MTD metrics for Naples Surgery Center', async () => {
    const telemetry = await getVendorInvoiceTelemetry(NAPLES_FACILITY_ID);
    assert.ok(telemetry, 'Telemetry object should exist');
    assert.equal(telemetry.facility_id, NAPLES_FACILITY_ID);
    assert.equal(telemetry.default_parser_mode, 'HYBRID');
    assert.equal(telemetry.matching_policy, 'THREE_WAY_MATCH');
    assert.equal(telemetry.sync_status, 'CONNECTED');
    assert.ok(telemetry.total_invoiced_mtd > 40000, `Expected invoiced MTD > 40000, got ${telemetry.total_invoiced_mtd}`);
    assert.ok(telemetry.sku_auto_match_pct >= 90, `Expected SKU auto-match >= 90%, got ${telemetry.sku_auto_match_pct}`);
    assert.ok(telemetry.price_variance_flagged_mtd >= 360, 'Price variance should capture Cardinal Health overbill');
    assert.ok(telemetry.latest_sync_seal.startsWith('sha256_vinv_'), 'Seal should have sha256_vinv_ prefix');
  });

  // Test 2: Facility ID Normalization
  test('2. Facility UUID alias resolution matches Naples Surgery Center correctly across strings and objects', () => {
    assert.equal(normalizeFacilityId('fac-naples-01'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId('naples-surgery-center'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ id: 'fac-naples-01' }), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ facility_id: NAPLES_FACILITY_ID }), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId(null), NAPLES_FACILITY_ID);
  });

  // Test 3: Connector Configuration & Secret Masking
  test('3. Connector configuration retrieval and masked secret verification', async () => {
    const config = await getVendorInvoiceConfig(NAPLES_FACILITY_ID);
    assert.ok(config, 'Config should exist');
    assert.equal(config.facility_id, NAPLES_FACILITY_ID);
    assert.equal(config.default_parser_mode, 'HYBRID');
    assert.equal(config.matching_policy, 'THREE_WAY_MATCH');
    assert.equal(config.price_tolerance_pct, 2.00);
    assert.ok(config.client_secret_masked.startsWith('vinv_sec_****_'), 'Secret must be masked');
    assert.ok(!config.client_secret_masked.includes('enc_v2'), 'Raw secret must not leak');
  });

  // Test 4: Vendor Price Contract Catalog Retrieval
  test('4. Vendor price contract catalog retrieval and active contract verification', async () => {
    const contracts = await getVendorPriceContracts(NAPLES_FACILITY_ID);
    assert.ok(Array.isArray(contracts), 'Contracts must be an array');
    assert.ok(contracts.length >= 5, `Expected >= 5 contracts, got ${contracts.length}`);

    const stryker = contracts.find(c => c.vendor_sku === 'STR-5541-CR');
    assert.ok(stryker, 'Stryker contract SKU must exist');
    assert.equal(stryker.internal_item_sku, 'SKU-1001');
    assert.equal(stryker.contracted_unit_price, 1850.00);
    assert.equal(stryker.gpo_contract_code, 'VIZIENT-ORTHO-2026');
  });

  // Test 5: Deterministic Multi-Tier SKU Matching
  test('5. Deterministic multi-tier SKU matching (EXACT_SKU, CROSS_REF_ALIAS, FUZZY_DESCRIPTION, UNMAPPED)', async () => {
    const contracts = await getVendorPriceContracts(NAPLES_FACILITY_ID);

    const exact = matchVendorSku('STR-5541-CR', '', contracts);
    assert.equal(exact.matched, true);
    assert.equal(exact.matchMethod, 'EXACT_SKU');
    assert.equal(exact.matchConfidencePct, 100.0);
    assert.equal(exact.matchedInternalSku, 'SKU-1001');

    const alias = matchVendorSku('str5541cr', '', contracts);
    assert.equal(alias.matched, true);
    assert.equal(alias.matchMethod, 'CROSS_REF_ALIAS');
    assert.equal(alias.matchConfidencePct, 95.0);
    assert.equal(alias.matchedInternalSku, 'SKU-1001');

    const fuzzy = matchVendorSku('UNKNOWN-999', 'AcrySof IQ Monofocal Intraocular Lens', contracts);
    assert.equal(fuzzy.matched, true);
    assert.equal(fuzzy.matchMethod, 'FUZZY_DESCRIPTION');
    assert.equal(fuzzy.matchedInternalSku, 'SKU-1003');

    const unmapped = matchVendorSku('NO-MATCH-000', 'Completely Nonexistent Item XYZ', contracts);
    assert.equal(unmapped.matched, false);
    assert.equal(unmapped.matchMethod, 'UNMAPPED');
    assert.equal(unmapped.matchConfidencePct, 0);
  });

  // Test 6: Deterministic Line Price Variance Calculation
  test('6. Deterministic line price variance calculation and tolerance evaluation', () => {
    // 10 boxes invoiced at $120.50 vs contracted $84.50 -> +$36.00/unit, +$360.00 total, +42.60% -> exceeds 2%
    const overbill = calculateLineVariance(10, 120.50, 84.50, 2.0);
    assert.equal(overbill.lineExtendedAmount, 1205.00);
    assert.equal(overbill.expectedExtendedAmount, 845.00);
    assert.equal(overbill.unitPriceVariance, 36.00);
    assert.equal(overbill.extendedVariance, 360.00);
    assert.equal(overbill.variancePct, 42.60);
    assert.equal(overbill.exceedsTolerance, true);

    // Within 2% tolerance: $101.00 vs $100.00 -> +1.00%
    const withinTol = calculateLineVariance(5, 101.00, 100.00, 2.0);
    assert.equal(withinTol.variancePct, 1.00);
    assert.equal(withinTol.exceedsTolerance, false);
  });

  // Test 7: 3-Way PO Validation
  test('7. 3-way PO validation flags overbilling and quantity discrepancies deterministically', async () => {
    const contracts = await getVendorPriceContracts(NAPLES_FACILITY_ID);
    const pos = await getVendorPurchaseOrders(NAPLES_FACILITY_ID);

    // Valid match against PO-2026-8803 (received 10)
    const valid = validateThreeWayInvoiceMatch({
      invoiceNumber: 'INV-NEW-001',
      vendorName: 'Alcon Laboratories',
      poNumber: 'PO-2026-8803',
      invoiceLines: [
        { vendor_sku: 'ALC-SN60WF', item_description: 'AcrySof IQ Monofocal Intraocular Lens (IOL)', qty_invoiced: 10, qty_received_po: 10, invoiced_unit_price: 215.00 }
      ],
      totalInvoiceAmount: 2150.00,
      priceContracts: contracts,
      purchaseOrders: pos,
      existingInvoices: [],
      tolerancePct: 2.0,
      matchingPolicy: 'THREE_WAY_MATCH'
    });
    assert.equal(valid.isValid, true);
    assert.equal(valid.matchStatus, 'MATCHED');
    assert.equal(valid.totalVarianceAmount, 0.00);

    // Qty exceeds PO received (15 > 10)
    const qtyMismatch = validateThreeWayInvoiceMatch({
      invoiceNumber: 'INV-NEW-002',
      vendorName: 'Alcon Laboratories',
      poNumber: 'PO-2026-8803',
      invoiceLines: [
        { vendor_sku: 'ALC-SN60WF', item_description: 'AcrySof IQ Monofocal Intraocular Lens (IOL)', qty_invoiced: 15, qty_received_po: 10, invoiced_unit_price: 215.00 }
      ],
      totalInvoiceAmount: 3225.00,
      priceContracts: contracts,
      purchaseOrders: pos,
      existingInvoices: [],
      tolerancePct: 2.0,
      matchingPolicy: 'THREE_WAY_MATCH'
    });
    assert.equal(qtyMismatch.isValid, false);
    assert.equal(qtyMismatch.matchStatus, 'QUANTITY_MISMATCH');
    assert.ok(qtyMismatch.errors.some(e => e.includes('ERR_PO_QUANTITY_EXCEEDED')));
  });

  // Test 8: Duplicate Invoice Lock & Arithmetic Math Imbalance Check
  test('8. Duplicate invoice detection (ERR_DUPLICATE_INVOICE) and arithmetic math imbalance detection', async () => {
    const contracts = await getVendorPriceContracts(NAPLES_FACILITY_ID);
    const pos = await getVendorPurchaseOrders(NAPLES_FACILITY_ID);
    const existing = await getVendorInvoiceBatches(NAPLES_FACILITY_ID);

    // Duplicate of existing INV-STR-990124
    const dupRes = validateThreeWayInvoiceMatch({
      invoiceNumber: 'INV-STR-990124',
      vendorName: 'Stryker Orthopaedics',
      poNumber: 'PO-2026-8801',
      invoiceLines: [{ vendor_sku: 'STR-5541-CR', qty_invoiced: 1, invoiced_unit_price: 1850.00 }],
      priceContracts: contracts,
      purchaseOrders: pos,
      existingInvoices: existing
    });
    assert.equal(dupRes.isValid, false);
    assert.equal(dupRes.matchStatus, 'DUPLICATE_BLOCKED');
    assert.ok(dupRes.errors.some(e => e.includes('ERR_DUPLICATE_INVOICE')));

    // Math imbalance: line = $215.00, declared total = $999.00
    const mathRes = validateThreeWayInvoiceMatch({
      invoiceNumber: 'INV-MATH-ERR',
      vendorName: 'Alcon Laboratories',
      poNumber: 'PO-2026-8803',
      invoiceLines: [{ vendor_sku: 'ALC-SN60WF', qty_invoiced: 1, qty_received_po: 1, invoiced_unit_price: 215.00 }],
      totalInvoiceAmount: 999.00,
      priceContracts: contracts,
      purchaseOrders: pos,
      existingInvoices: []
    });
    assert.equal(mathRes.isValid, false);
    assert.ok(mathRes.errors.some(e => e.includes('ERR_INVOICE_MATH_IMBALANCE')));
  });

  // Test 9: Importing New Vendor Invoice Batch Generates 64-Char SHA-256 Seal
  test('9. Importing new vendor invoice batch generates valid 64-char SHA-256 seal', async () => {
    const batch = await importVendorInvoiceBatch(NAPLES_FACILITY_ID, {
      invoice_number: `INV-TEST-${Date.now()}`,
      vendor_name: 'Alcon Laboratories',
      po_number: 'PO-2026-8803',
      lines: [
        {
          vendor_sku: 'ALC-SN60WF',
          item_description: 'AcrySof IQ Monofocal Intraocular Lens (IOL)',
          qty_invoiced: 5,
          qty_received_po: 10,
          invoiced_unit_price: 215.00
        }
      ]
    });

    assert.ok(batch, 'Imported batch should be returned');
    assert.equal(batch.match_status, 'MATCHED');
    assert.equal(batch.total_invoice_amount, 1075.00);
    assert.ok(batch.sha256_sync_seal.startsWith('sha256_vinv_'), 'Seal must start with sha256_vinv_');
    assert.equal(batch.sha256_sync_seal.length, 64, 'Seal must be strictly 64 characters');
  });

  // Test 10: Dual Facade Re-Export Parity
  test('10. Dual facade re-export parity between src/services/ and src/lib/', () => {
    const expectedExports = [
      'NAPLES_FACILITY_ID',
      'normalizeFacilityId',
      'computeVendorInvoiceSeal',
      'maskVendorInvoiceSecret',
      'matchVendorSku',
      'calculateLineVariance',
      'validateThreeWayInvoiceMatch',
      'getVendorInvoiceConfig',
      'updateVendorInvoiceConfig',
      'getVendorInvoiceTelemetry',
      'getVendorPriceContracts',
      'getVendorPurchaseOrders',
      'getVendorInvoiceBatches',
      'getVendorInvoiceLines',
      'getVendorInvoiceExceptions',
      'importVendorInvoiceBatch',
      'approveVendorInvoiceForAp',
      'resolveVendorInvoiceException'
    ];

    for (const key of expectedExports) {
      assert.ok(facade[key], `Facade must re-export ${key}`);
      assert.equal(typeof facade[key], typeof service[key], `Type parity for ${key}`);
    }
  });

  // Test 11: Migration 131 UP/DOWN SQL Integrity & RLS
  test('11. Migration 131 UP/DOWN SQL structural integrity and RLS policies', () => {
    const upPath = path.resolve('supabase/migrations/131_vendor_invoice_import.sql');
    const downPath = path.resolve('supabase/migrations/131_vendor_invoice_import_down.sql');

    assert.ok(fs.existsSync(upPath), '131_vendor_invoice_import.sql must exist');
    assert.ok(fs.existsSync(downPath), '131_vendor_invoice_import_down.sql must exist');

    const upSql = fs.readFileSync(upPath, 'utf8');
    const downSql = fs.readFileSync(downPath, 'utf8');

    const expectedTables = [
      'vendor_invoice_configs',
      'vendor_price_contracts',
      'vendor_purchase_orders',
      'vendor_invoice_batches',
      'vendor_invoice_lines',
      'vendor_invoice_exceptions',
      'vendor_invoice_provenance_ledger'
    ];

    for (const tbl of expectedTables) {
      assert.ok(upSql.includes(`CREATE TABLE IF NOT EXISTS public.${tbl}`), `Missing table ${tbl}`);
      assert.ok(upSql.includes(`ALTER TABLE public.${tbl} ENABLE ROW LEVEL SECURITY`), `Missing RLS on ${tbl}`);
      assert.ok(downSql.includes(`DROP TABLE IF EXISTS public.${tbl}`), `Missing DROP TABLE ${tbl} in down script`);
    }

    assert.ok(upSql.includes('CREATE OR REPLACE VIEW public.vw_vendor_invoice_telemetry'), 'Missing telemetry view');
    assert.ok(upSql.includes('app.current_facility_id'), 'Missing facility tenant isolation context');
    assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_vendor_invoice_telemetry'), 'Missing DROP VIEW in down script');
  });

  // Test 12: Zero Prohibited Tokens & App Shell Integration
  test('12. Strict zero-prohibited token compliance and App.jsx shell integration', () => {
    const prohibitedTokens = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];
    const filesToCheck = [
      path.resolve('src/components/VendorInvoiceImportView.jsx'),
      path.resolve('src/components/VendorInvoiceImportView.css'),
      path.resolve('src/services/vendorInvoiceService.js'),
      path.resolve('src/lib/vendorInvoiceService.js')
    ];

    for (const filePath of filesToCheck) {
      assert.ok(fs.existsSync(filePath), `File must exist: ${filePath}`);
      const content = fs.readFileSync(filePath, 'utf8').toLowerCase();
      for (const token of prohibitedTokens) {
        assert.ok(!content.includes(token), `Prohibited token '${token}' found in ${path.basename(filePath)}`);
      }
    }

    const appContent = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8');
    assert.ok(appContent.includes("import VendorInvoiceImportView from './components/VendorInvoiceImportView'"), 'App.jsx must import VendorInvoiceImportView');
    assert.ok(appContent.includes("activeTab === 'vendor_invoice_import'"), 'App.jsx must handle vendor_invoice_import route');
    assert.ok(appContent.includes('<VendorInvoiceImportView activeFacility={activeFacility} />'), 'App.jsx must render VendorInvoiceImportView');
    assert.ok(appContent.includes('Vendor Invoice & PO Price Gateway'), 'App.jsx must render header title');
  });

});
