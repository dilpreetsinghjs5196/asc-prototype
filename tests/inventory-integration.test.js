/**
 * ==============================================================================
 * Test Suite: inventory-integration.test.js
 * Module 15: Enterprise Healthcare Integrations (Phase F8)
 * Tests: Inventory Gateway Configuration, Item Master Catalog Mapping,
 *        Supply Cost Calculations, Par Replenishment Thresholds,
 *        Implant UDI & Expiration Safety Validation, Stock Depletion,
 *        Migration Integrity, Zero-Prohibited Tokens, and Shell Integration.
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
  computeInventoryProvenanceSeal,
  maskInventorySecret,
  calculateSupplyCost,
  evaluateReplenishmentStatus,
  validateImplantUsage,
  getInventoryConnectorConfig,
  getInventoryTelemetry,
  getInventoryItemMaster,
  getInventoryStockLevels,
  getInventoryCaseUsage,
  getInventoryWasteLogs,
  getInventoryExceptions,
  testInventoryConnection,
  triggerManualInventorySync,
  recordCaseItemUsage,
  resolveInventoryException
} from '../src/services/inventoryIntegrationService.js';

import * as facade from '../src/lib/inventoryIntegrationService.js';

describe('Phase F8: Inventory & Materials Management Gateway', () => {

  // Test 1: Telemetry
  test('1. Telemetry returns accurate metrics for Naples Surgery Center', async () => {
    const telemetry = await getInventoryTelemetry(NAPLES_FACILITY_ID);
    assert.ok(telemetry, 'Telemetry object should exist');
    assert.equal(telemetry.facility_id, NAPLES_FACILITY_ID);
    assert.equal(telemetry.inventory_vendor, 'ENVI_IOS');
    assert.equal(telemetry.sync_status, 'CONNECTED');
    assert.equal(telemetry.health_status, 'HEALTHY');
    assert.equal(telemetry.costing_method, 'FIFO');
    assert.ok(telemetry.total_inventory_valuation > 100000, `Expected valuation > 100000, got ${telemetry.total_inventory_valuation}`);
    assert.ok(telemetry.stockout_alerts_count >= 1, `Expected alerts >= 1, got ${telemetry.stockout_alerts_count}`);
    assert.ok(telemetry.preference_card_waste_pct >= 0, 'Waste percentage should be non-negative');
    assert.ok(telemetry.active_catalog_skus_count >= 5, 'Active catalog count should be >= 5');
    assert.ok(telemetry.latest_sync_seal.startsWith('sha256_inv_'), 'Seal should have sha256_inv_ prefix');
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
  test('3. Connector configuration retrieval and status verification', async () => {
    const config = await getInventoryConnectorConfig(NAPLES_FACILITY_ID);
    assert.ok(config, 'Config should exist');
    assert.equal(config.facility_id, NAPLES_FACILITY_ID);
    assert.equal(config.inventory_vendor, 'ENVI_IOS');
    assert.equal(config.gateway_mode, 'REST_API');
    assert.equal(config.purchasing_account_code, 'ENVI-NAPLES-ASC');
    assert.equal(config.client_id, 'envi_client_naples_prod');
    assert.equal(config.costing_method, 'FIFO');
    assert.equal(config.default_implant_markup_pct, 15.00);
    assert.ok(config.client_secret_masked.startsWith('inv_sec_****_'), 'Secret must be masked');
    assert.ok(!config.client_secret_masked.includes('enc_v2'), 'Raw secret should not be in masked string');
  });

  // Test 4: Deterministic item master catalog retrieval
  test('4. Deterministic item master catalog retrieval and contracted cost verification', async () => {
    const items = await getInventoryItemMaster(NAPLES_FACILITY_ID);
    assert.ok(Array.isArray(items), 'Items should be an array');
    assert.ok(items.length >= 5, `Expected >= 5 items, got ${items.length}`);

    const femoral = items.find(i => i.item_sku === 'SKU-1001');
    assert.ok(femoral, 'Stryker femoral component should exist');
    assert.equal(femoral.clinical_category, 'IMPLANT');
    assert.equal(femoral.contracted_acquisition_cost, 1850.00);
    assert.equal(femoral.is_billable, true);
    assert.equal(femoral.hcpcs_cpt_code, 'C1776');
    assert.ok(femoral.fda_udi_barcode.includes('(01)'), 'Should have standard UDI barcode');

    const suture = items.find(i => i.item_sku === 'SKU-1004');
    assert.ok(suture, 'Vicryl suture should exist');
    assert.equal(suture.clinical_category, 'SURGICAL_SUPPLY');
    assert.equal(suture.contracted_acquisition_cost, 84.50);
  });

  // Test 5: Deterministic supply cost calculation
  test('5. Deterministic supply cost calculation (Cost = (Used + Wasted) * Unit Cost)', () => {
    // 2 used, 1 wasted, $84.50 unit cost
    // Used cost = 2 * 84.50 = 169.00
    // Wasted cost = 1 * 84.50 = 84.50
    // Total cost = 3 * 84.50 = 253.50
    const calc = calculateSupplyCost(2, 1, 84.50);
    assert.equal(calc.quantityUsed, 2);
    assert.equal(calc.quantityWasted, 1);
    assert.equal(calc.unitCost, 84.50);
    assert.equal(calc.usedCost, 169.00);
    assert.equal(calc.wastedCost, 84.50);
    assert.equal(calc.totalCost, 253.50);
  });

  // Test 6: Replenishment threshold evaluation
  test('6. Replenishment threshold evaluation (OPTIMAL, LOW_STOCK, CRITICAL_REORDER, OVERSTOCKED)', () => {
    // On hand 20, min 10, max 50, reorder 15 -> OPTIMAL
    assert.equal(evaluateReplenishmentStatus(20, 10, 50, 15), 'OPTIMAL');

    // On hand 12, min 10, max 50, reorder 15 -> LOW_STOCK
    assert.equal(evaluateReplenishmentStatus(12, 10, 50, 15), 'LOW_STOCK');

    // On hand 5, min 10, max 50, reorder 15 (5 <= floor(15 * 0.5) = 7) -> CRITICAL_REORDER
    assert.equal(evaluateReplenishmentStatus(5, 10, 50, 15), 'CRITICAL_REORDER');

    // On hand 60, min 10, max 50, reorder 15 -> OVERSTOCKED
    assert.equal(evaluateReplenishmentStatus(60, 10, 50, 15), 'OVERSTOCKED');
  });

  // Test 7: Point-of-use implant validation (flags expired lots)
  test('7. Point-of-use implant validation (flags expired lots with ERR_EXPIRED_IMPLANT_SCANNED)', () => {
    const validImplant = {
      clinical_category: 'IMPLANT',
      item_sku: 'SKU-1001',
      implant_lot_number: 'LOT-8921',
      implant_serial_number: 'SN-449102',
      implant_expiration_date: '2028-05-31',
      fda_udi_barcode: '(01)00889294012345(17)280531(10)LOT-8921'
    };
    const validRes = validateImplantUsage(validImplant, '2026-02-24');
    assert.equal(validRes.isValid, true);
    assert.equal(validRes.errors.length, 0);

    const expiredImplant = {
      clinical_category: 'IMPLANT',
      item_sku: 'SKU-1003',
      implant_lot_number: 'LOT-1902',
      implant_expiration_date: '2026-01-15'
    };
    const expiredRes = validateImplantUsage(expiredImplant, '2026-02-24');
    assert.equal(expiredRes.isValid, false);
    assert.ok(expiredRes.errors.some(e => e.includes('ERR_EXPIRED_IMPLANT_SCANNED')), 'Should flag expired implant');
  });

  // Test 8: Case supply usage logging and stock depletion
  test('8. Case supply usage logging and stock depletion', async () => {
    const initialStocks = await getInventoryStockLevels(NAPLES_FACILITY_ID);
    const sutureStock = initialStocks.find(s => s.item_sku === 'SKU-1004');
    const startQty = sutureStock ? sutureStock.quantity_on_hand : 2;

    const record = await recordCaseItemUsage(NAPLES_FACILITY_ID, {
      procedure_name: 'Total Knee Arthroplasty',
      item_sku: 'SKU-1004',
      quantity_used: 1,
      quantity_wasted: 0
    });

    assert.ok(record, 'Usage record should be created');
    assert.equal(record.item_sku, 'SKU-1004');
    assert.equal(record.quantity_used, 1);
    assert.equal(record.total_case_supply_cost, 84.50);

    const updatedStocks = await getInventoryStockLevels(NAPLES_FACILITY_ID);
    const updatedSuture = updatedStocks.find(s => s.item_sku === 'SKU-1004');
    assert.equal(updatedSuture.quantity_on_hand, Math.max(0, startQty - 1));
  });

  // Test 9: Manual inventory sync trigger execution creates batch record with SHA-256 seal
  test('9. Manual inventory sync trigger execution creates batch record with SHA-256 seal', async () => {
    const syncRes = await triggerManualInventorySync(NAPLES_FACILITY_ID);
    assert.ok(syncRes, 'Sync result should exist');
    assert.ok(syncRes.batch_control_number.startsWith('INV-SYNC-'), 'Batch control number format');
    assert.ok(syncRes.total_valuation > 0, 'Valuation should be positive');
    assert.ok(syncRes.sha256_sync_seal.startsWith('sha256_inv_'), 'Seal format');
    assert.equal(syncRes.sha256_sync_seal.length, 64, 'Seal length must be exactly 64 characters');
  });

  // Test 10: Dual facade re-export parity
  test('10. Dual facade re-export parity between src/services/ and src/lib/', () => {
    const serviceExports = [
      'NAPLES_FACILITY_ID',
      'normalizeFacilityId',
      'computeInventoryProvenanceSeal',
      'maskInventorySecret',
      'calculateSupplyCost',
      'evaluateReplenishmentStatus',
      'validateImplantUsage',
      'getInventoryConnectorConfig',
      'getInventoryTelemetry',
      'getInventoryItemMaster',
      'getInventoryStockLevels',
      'getInventoryCaseUsage',
      'getInventoryWasteLogs',
      'getInventoryExceptions',
      'testInventoryConnection',
      'triggerManualInventorySync',
      'recordCaseItemUsage',
      'resolveInventoryException'
    ];

    for (const exp of serviceExports) {
      assert.ok(facade[exp], `Facade must re-export ${exp}`);
      assert.equal(typeof facade[exp], typeof service[exp] || typeof facade[exp], `Type parity for ${exp}`);
    }
  });

  // Test 11: Migration 130 UP/DOWN integrity
  test('11. Migration 130 UP/DOWN SQL structural integrity and RLS policies', () => {
    const upSqlPath = path.resolve('supabase/migrations/130_inventory_integration.sql');
    const downSqlPath = path.resolve('supabase/migrations/130_inventory_integration_down.sql');

    assert.ok(fs.existsSync(upSqlPath), '130_inventory_integration.sql must exist');
    assert.ok(fs.existsSync(downSqlPath), '130_inventory_integration_down.sql must exist');

    const upSql = fs.readFileSync(upSqlPath, 'utf8');
    const downSql = fs.readFileSync(downSqlPath, 'utf8');

    // 7 Tables
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.inventory_connector_configs'), 'Configs table');
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.inventory_item_master'), 'Item master table');
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.inventory_stock_levels'), 'Stock levels table');
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.inventory_case_usage'), 'Case usage table');
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.inventory_waste_logs'), 'Waste logs table');
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.inventory_exception_logs'), 'Exception logs table');
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.inventory_provenance_ledger'), 'Provenance ledger table');

    // Telemetry view
    assert.ok(upSql.includes('CREATE OR REPLACE VIEW public.vw_inventory_integration_telemetry'), 'Telemetry view');

    // RLS
    assert.ok(upSql.includes('ALTER TABLE public.inventory_connector_configs ENABLE ROW LEVEL SECURITY'), 'RLS configs');
    assert.ok(upSql.includes('ALTER TABLE public.inventory_case_usage ENABLE ROW LEVEL SECURITY'), 'RLS usage');
    assert.ok(upSql.includes('app.current_facility_id'), 'Tenant context isolation');

    // Rollback script
    assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_inventory_integration_telemetry'), 'Down drops view');
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.inventory_connector_configs'), 'Down drops configs');
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.inventory_provenance_ledger'), 'Down drops provenance');
  });

  // Test 12: Zero Prohibited Tokens & Shell Integration
  test('12. Strict Zero-Prohibited Token Compliance and Shell Integration', () => {
    const prohibitedTokens = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];

    const filesToCheck = [
      path.resolve('src/components/InventoryIntegrationView.jsx'),
      path.resolve('src/components/InventoryIntegrationView.css'),
      path.resolve('src/services/inventoryIntegrationService.js'),
      path.resolve('src/lib/inventoryIntegrationService.js')
    ];

    for (const filePath of filesToCheck) {
      assert.ok(fs.existsSync(filePath), `File must exist: ${filePath}`);
      const content = fs.readFileSync(filePath, 'utf8').toLowerCase();
      for (const token of prohibitedTokens) {
        assert.ok(
          !content.includes(token),
          `Prohibited token '${token}' found in ${path.basename(filePath)}!`
        );
      }
    }

    // App shell integration check
    const appPath = path.resolve('src/App.jsx');
    const appContent = fs.readFileSync(appPath, 'utf8');

    assert.ok(appContent.includes("import InventoryIntegrationView from './components/InventoryIntegrationView'"), 'App.jsx imports InventoryIntegrationView');
    assert.ok(appContent.includes("activeTab === 'inventory_integration'"), 'App.jsx has inventory_integration activeTab routing');
    assert.ok(appContent.includes('<InventoryIntegrationView activeFacility={activeFacility} />'), 'App.jsx renders InventoryIntegrationView');
    assert.ok(appContent.includes('Inventory & Materials Management Gateway'), 'App.jsx defines header title');
  });

});
