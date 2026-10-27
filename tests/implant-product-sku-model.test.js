import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  skuService,
  STERILE_PACKAGING_TYPES,
  LATERALITY_TYPES,
  MATERIAL_TYPES,
  DURATION_CLASSIFICATIONS,
  MRI_SAFETY_STATUSES,
  SKU_STATUSES,
  RECALL_CLASSES,
  GLOBAL_BASELINE_FAMILIES,
  GLOBAL_BASELINE_SKUS,
  GLOBAL_BASELINE_DISTRIBUTOR_MAPPINGS
} from '../src/lib/skuService.js';
import { db } from '../src/lib/supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// ==============================================================================
// SUITE 1: DATABASE MIGRATION 029 DDL & SCHEMA INTEGRITY
// ==============================================================================

test('Phase 54 — Database Migration 029: DDL & Schema Integrity', async (t) => {
  const upMigrationPath = path.join(rootDir, 'supabase', 'migrations', '029_implant_product_sku_model.sql');
  const downMigrationPath = path.join(rootDir, 'supabase', 'migrations', '029_implant_product_sku_model_down.sql');

  await t.test('Migration 029 forward and down SQL files exist and are substantive', () => {
    assert.ok(fs.existsSync(upMigrationPath), '029_implant_product_sku_model.sql must exist');
    assert.ok(fs.existsSync(downMigrationPath), '029_implant_product_sku_model_down.sql must exist');
    const upSql = fs.readFileSync(upMigrationPath, 'utf8');
    const downSql = fs.readFileSync(downMigrationPath, 'utf8');
    assert.ok(upSql.length > 5000, 'Up migration must be substantive');
    assert.ok(downSql.length > 800, 'Down migration must be substantive');
  });

  const upSql = fs.readFileSync(upMigrationPath, 'utf8');
  const downSql = fs.readFileSync(downMigrationPath, 'utf8');

  await t.test('Creates public.implant_product_families with columns, constraints, and unique index', () => {
    assert.match(upSql, /CREATE TABLE IF NOT EXISTS public\.implant_product_families/);
    assert.match(upSql, /facility_id UUID REFERENCES public\.facilities/);
    assert.match(upSql, /vendor_id UUID NOT NULL REFERENCES public\.implant_vendors/);
    assert.match(upSql, /family_code VARCHAR\(50\) NOT NULL/);
    assert.match(upSql, /name VARCHAR\(150\) NOT NULL/);
    assert.match(upSql, /specialty VARCHAR\(50\) NOT NULL/);
    assert.match(upSql, /chk_family_code_format/);
    assert.match(upSql, /chk_family_name_not_empty/);
    assert.match(upSql, /uq_product_family_code/);
  });

  await t.test('Creates public.implant_product_skus master catalog with UDI, C-Code, and lifecycle attributes', () => {
    assert.match(upSql, /CREATE TABLE IF NOT EXISTS public\.implant_product_skus/);
    assert.match(upSql, /vendor_id UUID NOT NULL REFERENCES public\.implant_vendors/);
    assert.match(upSql, /family_id UUID REFERENCES public\.implant_product_families/);
    assert.match(upSql, /component_id UUID NOT NULL REFERENCES public\.implant_components/);
    assert.match(upSql, /catalog_number VARCHAR\(100\) NOT NULL/);
    assert.match(upSql, /product_name VARCHAR\(255\) NOT NULL/);
    assert.match(upSql, /udi_di VARCHAR\(100\)/);
    assert.match(upSql, /hcpcs_c_code VARCHAR\(10\)/);
    assert.match(upSql, /sterile_packaging VARCHAR\(30\)/);
    assert.match(upSql, /laterality VARCHAR\(20\)/);
    assert.match(upSql, /material_composition VARCHAR\(50\)/);
    assert.match(upSql, /duration_classification VARCHAR\(30\)/);
    assert.match(upSql, /mri_safety_status VARCHAR\(50\)/);
    assert.match(upSql, /list_price NUMERIC\(12,\s*2\)/);
    assert.match(upSql, /status VARCHAR\(30\)/);
    assert.match(upSql, /is_active BOOLEAN/);
    assert.match(upSql, /recall_class VARCHAR\(20\)/);
    assert.match(upSql, /recall_date DATE/);
    assert.match(upSql, /recall_reason TEXT/);
    assert.match(upSql, /uq_sku_vendor_catalog/);
  });

  await t.test('Creates public.implant_sku_distributor_mappings cross-reference junction table', () => {
    assert.match(upSql, /CREATE TABLE IF NOT EXISTS public\.implant_sku_distributor_mappings/);
    assert.match(upSql, /sku_id UUID NOT NULL REFERENCES public\.implant_product_skus/);
    assert.match(upSql, /distributor_id UUID NOT NULL REFERENCES public\.implant_vendors/);
    assert.match(upSql, /distributor_item_number VARCHAR\(100\) NOT NULL/);
    assert.match(upSql, /package_unit VARCHAR\(30\) NOT NULL DEFAULT 'EA'/);
    assert.match(upSql, /units_per_package INTEGER NOT NULL DEFAULT 1/);
    assert.match(upSql, /uq_distributor_sku_mapping/);
  });

  await t.test('Connects case_devices.sku_id via foreign key constraint', () => {
    assert.match(upSql, /fk_case_devices_sku_id/);
    assert.match(upSql, /REFERENCES public\.implant_product_skus\(id\) ON DELETE RESTRICT/);
  });

  await t.test('Deploys safety triggers for hard delete protection, relocation prevention, and timestamps', () => {
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_prevent_active_sku_hard_delete/);
    assert.match(upSql, /trg_prevent_active_sku_delete/);
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_prevent_facility_relocation_implant_skus/);
    assert.match(upSql, /trg_prevent_facility_relocation_implant_skus/);
    assert.match(upSql, /trg_touch_implant_product_skus/);
  });

  await t.test('Deploys authoritative stored procedures: fn_create_or_update_sku, fn_flag_sku_recall, fn_deactivate_implant_sku, fn_reactivate_implant_sku', () => {
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_create_or_update_sku/);
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_flag_sku_recall/);
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_deactivate_implant_sku/);
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_reactivate_implant_sku/);
    assert.match(upSql, /GRANT EXECUTE ON FUNCTION public\.fn_create_or_update_sku/);
    assert.match(upSql, /GRANT EXECUTE ON FUNCTION public\.fn_flag_sku_recall/);
    assert.match(upSql, /GRANT EXECUTE ON FUNCTION public\.fn_reactivate_implant_sku/);
  });

  await t.test('Enables Row-Level Security (RLS) on families, skus, and distributor mappings', () => {
    assert.match(upSql, /ALTER TABLE public\.implant_product_families ENABLE ROW LEVEL SECURITY/);
    assert.match(upSql, /ALTER TABLE public\.implant_product_skus ENABLE ROW LEVEL SECURITY/);
    assert.match(upSql, /ALTER TABLE public\.implant_sku_distributor_mappings ENABLE ROW LEVEL SECURITY/);
    assert.match(upSql, /implant_product_families_select/);
    assert.match(upSql, /implant_product_skus_select/);
    assert.match(upSql, /implant_sku_distributor_mappings_select/);
  });

  await t.test('Seeds baseline product families and granular catalog SKUs', () => {
    assert.match(upSql, /'TRIATHLON_KNEE'/);
    assert.match(upSql, /'PERSONA_KNEE'/);
    assert.match(upSql, /'POLARIS_SPINE'/);
    assert.match(upSql, /'ACRYSOF_IQ'/);
    assert.match(upSql, /'5520-F-401'/);
    assert.match(upSql, /'5520-F-402'/);
    assert.match(upSql, /'42-5200-005-01'/);
    assert.match(upSql, /'0600-65-045'/);
    assert.match(upSql, /'SN60WF-210'/);
  });

  await t.test('Down migration safely drops objects in reverse dependency order', () => {
    assert.match(downSql, /DROP TABLE IF EXISTS public\.implant_sku_distributor_mappings CASCADE/);
    assert.match(downSql, /DROP TABLE IF EXISTS public\.implant_product_skus CASCADE/);
    assert.match(downSql, /DROP TABLE IF EXISTS public\.implant_product_families CASCADE/);
    assert.match(downSql, /DROP FUNCTION IF EXISTS public\.fn_flag_sku_recall/);
    assert.match(downSql, /DROP FUNCTION IF EXISTS public\.fn_create_or_update_sku/);
  });
});

// ==============================================================================
// SUITE 2: CLIENT SERVICE LAYER (skuService.js)
// ==============================================================================

test('Phase 54 — Client Service Layer: skuService.js', async (t) => {
  await t.test('Exports domain enums and constants', () => {
    assert.equal(STERILE_PACKAGING_TYPES.STERILE_PACKAGED, 'STERILE_PACKAGED');
    assert.equal(LATERALITY_TYPES.LEFT, 'LEFT');
    assert.equal(LATERALITY_TYPES.RIGHT, 'RIGHT');
    assert.equal(MATERIAL_TYPES.TITANIUM, 'TITANIUM');
    assert.equal(MATERIAL_TYPES.COBALT_CHROME, 'COBALT_CHROME');
    assert.equal(DURATION_CLASSIFICATIONS.PERMANENT, 'PERMANENT');
    assert.equal(MRI_SAFETY_STATUSES.MR_CONDITIONAL, 'MR_CONDITIONAL');
    assert.equal(SKU_STATUSES.ACTIVE, 'active');
    assert.equal(SKU_STATUSES.RECALLED, 'recalled');
    assert.equal(RECALL_CLASSES.CLASS_I, 'CLASS_I');
    assert.ok(Array.isArray(GLOBAL_BASELINE_FAMILIES));
    assert.ok(GLOBAL_BASELINE_FAMILIES.length >= 4);
    assert.ok(Array.isArray(GLOBAL_BASELINE_SKUS));
    assert.ok(GLOBAL_BASELINE_SKUS.length >= 5);
  });

  await t.test('validateUdiDi accurately validates GS1 GTIN-14 Modulo-10 checksum', () => {
    // Valid GTIN-14
    const validGtin1 = '00888888123451';
    const check1 = skuService.validateUdiDi(validGtin1);
    assert.equal(check1.isValid, true);
    assert.equal(check1.standard, 'GS1');
    assert.equal(check1.error, null);

    const validGtin2 = '00777777234562';
    const check2 = skuService.validateUdiDi(validGtin2);
    assert.equal(check2.isValid, true);
    assert.equal(check2.standard, 'GS1');

    // Invalid GTIN-14 (corrupted check digit)
    const invalidGtin = '00888888123459';
    const checkBad = skuService.validateUdiDi(invalidGtin);
    assert.equal(checkBad.isValid, false);
    assert.equal(checkBad.standard, 'GS1');
    assert.match(checkBad.error, /Invalid GS1 GTIN-14 checksum digit/);
  });

  await t.test('validateUdiDi accurately validates HIBCC Primary DI format', () => {
    const validHibcc = '+H12345678901231';
    const checkHibcc = skuService.validateUdiDi(validHibcc);
    assert.equal(checkHibcc.isValid, true);
    assert.equal(checkHibcc.standard, 'HIBCC');
    assert.equal(checkHibcc.error, null);

    // Invalid format
    const invalidFormat = 'NOT-A-UDI-DI-123';
    const checkInvalid = skuService.validateUdiDi(invalidFormat);
    assert.equal(checkInvalid.isValid, false);
    assert.equal(checkInvalid.standard, 'UNKNOWN');
    assert.match(checkInvalid.error, /UDI-DI format not recognized/);
  });

  await t.test('getSkus returns paginated items, filters correctly, and calculates metrics', async () => {
    const resAll = await skuService.getSkus();
    assert.ok(resAll.skus.length >= 5);
    assert.ok(resAll.metrics.total >= 5);
    assert.ok(resAll.metrics.activeCount >= 5);
    assert.equal(resAll.metrics.recalledCount, 0);

    // Filter by Laterality
    const resLeft = await skuService.getSkus({ laterality: 'LEFT' });
    assert.ok(resLeft.skus.some(s => s.catalog_number === '5520-F-401'));
    assert.ok(!resLeft.skus.some(s => s.catalog_number === '5520-F-402'));

    // Search by Catalog Number or Product Name
    const resSearch = await skuService.getSkus({ search: 'triathlon' });
    assert.ok(resSearch.skus.length >= 2);
  });

  await t.test('getSkuById retrieves SKU with linked distributor mappings', async () => {
    const targetSku = GLOBAL_BASELINE_SKUS[0];
    const retrieved = await skuService.getSkuById(targetSku.id);
    assert.equal(retrieved.id, targetSku.id);
    assert.equal(retrieved.catalog_number, targetSku.catalog_number);
    assert.ok(Array.isArray(retrieved.distributor_mappings));
    assert.ok(retrieved.distributor_mappings.length > 0);
  });

  await t.test('saveSku validates mandatory fields and rejects invalid UDI-DI', async () => {
    // Missing Catalog Number
    await assert.rejects(
      async () => skuService.saveSku({
        vendor_id: '00000000-0000-0000-0053-000000000001',
        component_id: '00000000-0000-0000-0051-000000000010',
        catalog_number: '   ',
        product_name: 'Test Product'
      }),
      /VALIDATION ERROR.*catalog number is required/
    );

    // Invalid UDI-DI Checksum
    await assert.rejects(
      async () => skuService.saveSku({
        vendor_id: '00000000-0000-0000-0053-000000000001',
        component_id: '00000000-0000-0000-0051-000000000010',
        catalog_number: 'VALID-CAT-01',
        product_name: 'Valid Product',
        udi_di: '00888888123459' // Bad check digit
      }),
      /VALIDATION ERROR.*Invalid GS1 GTIN-14 checksum digit/
    );

    // Successful Save
    const saveRes = await skuService.saveSku({
      vendor_id: '00000000-0000-0000-0053-000000000001',
      component_id: '00000000-0000-0000-0051-000000000010',
      catalog_number: 'TEST-SKU-99',
      product_name: 'Test Orthopedic Femoral SKU',
      udi_di: '00888888123451',
      list_price: 1500.00
    });
    assert.equal(saveRes.success, true);
    assert.ok(saveRes.sku_id);
  });

  await t.test('flagSkuRecall validates regulatory parameters and transitions status to recalled', async () => {
    const testSku = GLOBAL_BASELINE_SKUS.find(s => s.catalog_number === 'TEST-SKU-99');
    assert.ok(testSku);

    // Rejects invalid recall class
    await assert.rejects(
      async () => skuService.flagSkuRecall(testSku.id, {
        recallClass: 'CLASS_INVALID',
        recallDate: '2026-10-27',
        recallReason: 'Sterility breach'
      }),
      /VALIDATION ERROR.*Recall class must be CLASS_I, CLASS_II, or CLASS_III/
    );

    // Successfully flags recall
    const recallRes = await skuService.flagSkuRecall(testSku.id, {
      recallClass: 'CLASS_I',
      recallDate: '2026-10-27',
      recallReason: 'Potential packaging seal compromise identified in manufacturing lot'
    });

    assert.equal(recallRes.success, true);
    assert.equal(recallRes.status, 'recalled');
    assert.equal(testSku.status, 'recalled');
    assert.equal(testSku.is_active, false);
    assert.equal(testSku.recall_class, 'CLASS_I');
  });

  await t.test('deactivateSku and reactivateSku enforce lifecycle rules', async () => {
    const testSku = GLOBAL_BASELINE_SKUS[0];

    // Deactivation requires rationale
    await assert.rejects(
      async () => skuService.deactivateSku(testSku.id, '  '),
      /VALIDATION ERROR.*Deactivation rationale is required/
    );

    const deactRes = await skuService.deactivateSku(testSku.id, 'Model superseded by next-gen release');
    assert.equal(deactRes.success, true);
    assert.equal(deactRes.status, 'inactive');

    // Reactivation restores status
    const reactRes = await skuService.reactivateSku(testSku.id, testSku.catalog_number);
    assert.equal(reactRes.success, true);
    assert.equal(reactRes.status, 'active');
  });

  await t.test('saveDistributorMapping creates cross-reference record', async () => {
    const targetSku = GLOBAL_BASELINE_SKUS[0];
    const distMappingRes = await skuService.saveDistributorMapping({
      sku_id: targetSku.id,
      distributor_id: '00000000-0000-0000-0053-000000000013',
      distributor_item_number: 'CH-TEST-9988',
      package_unit: 'EA',
      units_per_package: 1,
      is_preferred_distributor: false
    });

    assert.equal(distMappingRes.success, true);
    assert.ok(distMappingRes.mapping);
  });

  await t.test('skuService methods are wired onto db singleton', () => {
    assert.equal(typeof db.getImplantSkus, 'function');
    assert.equal(typeof db.getImplantSkuById, 'function');
    assert.equal(typeof db.saveImplantSku, 'function');
    assert.equal(typeof db.flagSkuRecall, 'function');
    assert.equal(typeof db.deactivateImplantSku, 'function');
    assert.equal(typeof db.reactivateImplantSku, 'function');
  });
});

// ==============================================================================
// SUITE 3: UI EXPLORER & MAESTRO GUIDELINE COMPLIANCE
// ==============================================================================

test('Phase 54 — UI Component & Maestro Guideline Compliance', async (t) => {
  const jsxPath = path.join(rootDir, 'src', 'components', 'ImplantProductSkuMaster.jsx');
  const cssPath = path.join(rootDir, 'src', 'components', 'ImplantProductSkuMaster.css');
  const appPath = path.join(rootDir, 'src', 'App.jsx');

  await t.test('ImplantProductSkuMaster.jsx and CSS exist and are populated', () => {
    assert.ok(fs.existsSync(jsxPath), 'ImplantProductSkuMaster.jsx must exist');
    assert.ok(fs.existsSync(cssPath), 'ImplantProductSkuMaster.css must exist');
    const jsx = fs.readFileSync(jsxPath, 'utf8');
    const css = fs.readFileSync(cssPath, 'utf8');
    assert.ok(jsx.length > 3000, 'JSX must be substantive');
    assert.ok(css.length > 1500, 'CSS must be substantive');
  });

  await t.test('CSS and JSX strictly obey Purple Ban (zero banned purple/violet/magenta/fuchsia tokens)', () => {
    const bannedPatterns = [
      /#8b5cf6/i, /#7c3aed/i, /#6d28d9/i, /#a855f7/i, /#9333ea/i,
      /#c084fc/i, /#d946ef/i, /#e879f9/i, /#f0abfc/i,
      /\bpurple\b/i, /\bviolet\b/i, /\bfuchsia\b/i, /\bmagenta\b/i
    ];

    const jsx = fs.readFileSync(jsxPath, 'utf8');
    const css = fs.readFileSync(cssPath, 'utf8');

    for (const pat of bannedPatterns) {
      assert.doesNotMatch(jsx, pat, `JSX must not contain banned purple token: ${pat}`);
      assert.doesNotMatch(css, pat, `CSS must not contain banned purple token: ${pat}`);
    }
  });

  await t.test('App.jsx integrates ImplantProductSkuMaster in sidebar navigation, subtitle, and tab render', () => {
    const appContent = fs.readFileSync(appPath, 'utf8');
    assert.match(appContent, /import ImplantProductSkuMaster from '\.\/components\/ImplantProductSkuMaster';/);
    assert.match(appContent, /activeTab === 'implant_skus'/);
    assert.match(appContent, /<ImplantProductSkuMaster/);
    assert.match(appContent, /Product SKU Master/);
  });
});
