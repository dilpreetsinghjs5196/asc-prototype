import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  vendorService,
  VENDOR_TYPES,
  VENDOR_STATUSES,
  RELATIONSHIP_TYPES,
  GLOBAL_BASELINE_VENDORS,
  GLOBAL_BASELINE_RELATIONSHIPS
} from '../src/lib/vendorService.js';
import { db } from '../src/lib/supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// ==============================================================================
// SUITE 1: DATABASE MIGRATION 028 DDL & SCHEMA INTEGRITY
// ==============================================================================

test('Phase 53 — Database Migration 028: DDL & Schema Integrity', async (t) => {
  const upMigrationPath = path.join(rootDir, 'supabase', 'migrations', '028_implant_vendor_master.sql');
  const downMigrationPath = path.join(rootDir, 'supabase', 'migrations', '028_implant_vendor_master_down.sql');

  await t.test('Migration 028 forward and down SQL files exist and are substantive', () => {
    assert.ok(fs.existsSync(upMigrationPath), '028_implant_vendor_master.sql must exist');
    assert.ok(fs.existsSync(downMigrationPath), '028_implant_vendor_master_down.sql must exist');
    const upSql = fs.readFileSync(upMigrationPath, 'utf8');
    const downSql = fs.readFileSync(downMigrationPath, 'utf8');
    assert.ok(upSql.length > 2500, 'Up migration must be substantive');
    assert.ok(downSql.length > 500, 'Down migration must be substantive');
  });

  const upSql = fs.readFileSync(upMigrationPath, 'utf8');
  const downSql = fs.readFileSync(downMigrationPath, 'utf8');

  await t.test('Creates public.implant_vendors table with required columns and constraints', () => {
    assert.match(upSql, /CREATE TABLE IF NOT EXISTS public\.implant_vendors/);
    assert.match(upSql, /facility_id UUID REFERENCES public\.facilities/);
    assert.match(upSql, /vendor_code VARCHAR\(50\) NOT NULL/);
    assert.match(upSql, /legal_name VARCHAR\(200\) NOT NULL/);
    assert.match(upSql, /display_name VARCHAR\(150\) NOT NULL/);
    assert.match(upSql, /vendor_type VARCHAR\(50\) NOT NULL DEFAULT 'MANUFACTURER'/);
    assert.match(upSql, /specialties TEXT\[\]/);
    assert.match(upSql, /status VARCHAR\(30\) NOT NULL DEFAULT 'active'/);
    assert.match(upSql, /is_active BOOLEAN NOT NULL DEFAULT TRUE/);
    assert.match(upSql, /uq_implant_vendor_code/);
    assert.match(upSql, /uq_implant_vendor_legal_name/);
    assert.match(upSql, /chk_vendor_active_sync/);
    assert.match(upSql, /chk_vendor_code_format/);
  });

  await t.test('Creates public.implant_vendor_relationships junction table with constraints', () => {
    assert.match(upSql, /CREATE TABLE IF NOT EXISTS public\.implant_vendor_relationships/);
    assert.match(upSql, /distributor_id UUID NOT NULL REFERENCES public\.implant_vendors/);
    assert.match(upSql, /manufacturer_id UUID NOT NULL REFERENCES public\.implant_vendors/);
    assert.match(upSql, /chk_no_self_vendor_relationship/);
    assert.match(upSql, /uq_vendor_relationship/);
  });

  await t.test('Deploys triggers: hard delete protection, updated_at, and relocation prevention', () => {
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_prevent_active_vendor_hard_delete/);
    assert.match(upSql, /trg_prevent_active_vendor_delete/);
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_prevent_facility_relocation_implant_vendors/);
    assert.match(upSql, /trg_prevent_facility_relocation_implant_vendors/);
    assert.match(upSql, /trg_touch_implant_vendors/);
  });

  await t.test('Deploys authoritative stored procedures: fn_create_or_update_vendor, fn_deactivate_implant_vendor & fn_reactivate_implant_vendor', () => {
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_create_or_update_vendor/);
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_deactivate_implant_vendor/);
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_reactivate_implant_vendor/);
    assert.match(upSql, /GRANT EXECUTE ON FUNCTION public\.fn_reactivate_implant_vendor/);
  });

  await t.test('Enables Row-Level Security (RLS) with hybrid baseline and tenant isolation policies', () => {
    assert.match(upSql, /ALTER TABLE public\.implant_vendors ENABLE ROW LEVEL SECURITY/);
    assert.match(upSql, /ALTER TABLE public\.implant_vendor_relationships ENABLE ROW LEVEL SECURITY/);
    assert.match(upSql, /implant_vendors_select_policy/);
    assert.match(upSql, /implant_vendors_insert_policy/);
    assert.match(upSql, /implant_vendors_update_policy/);
    assert.match(upSql, /implant_vendors_delete_policy/);
  });

  await t.test('Seeds global baseline taxonomy: 12 multinational OEMs and 3 national distributors', () => {
    assert.match(upSql, /'STRYKER'/);
    assert.match(upSql, /'ZIMMER_BIOMET'/);
    assert.match(upSql, /'DEPUY_SYNTHES'/);
    assert.match(upSql, /'MEDTRONIC'/);
    assert.match(upSql, /'SMITH_NEPHEW'/);
    assert.match(upSql, /'ALCON'/);
    assert.match(upSql, /'ARTHREX'/);
    assert.match(upSql, /'CARDINAL_HEALTH'/);
    assert.match(upSql, /'MEDLINE'/);
    assert.match(upSql, /'OWENS_MINOR'/);
  });

  await t.test('Down migration safely rolls back all objects in reverse dependency order', () => {
    assert.match(downSql, /DROP TABLE IF EXISTS public\.implant_vendor_relationships CASCADE/);
    assert.match(downSql, /DROP TABLE IF EXISTS public\.implant_vendors CASCADE/);
    assert.match(downSql, /DROP FUNCTION IF EXISTS public\.fn_prevent_active_vendor_hard_delete/);
    assert.match(downSql, /DROP FUNCTION IF EXISTS public\.fn_create_or_update_vendor/);
    assert.match(downSql, /DROP FUNCTION IF EXISTS public\.fn_deactivate_implant_vendor/);
    assert.match(downSql, /DROP FUNCTION IF EXISTS public\.fn_reactivate_implant_vendor/);
  });
});

// ==============================================================================
// SUITE 2: CLIENT SERVICE LAYER (vendorService.js)
// ==============================================================================

test('Phase 53 — Client Service Layer: vendorService.js', async (t) => {
  await t.test('Exports domain enums and constants', () => {
    assert.equal(VENDOR_TYPES.MANUFACTURER, 'MANUFACTURER');
    assert.equal(VENDOR_TYPES.DISTRIBUTOR, 'DISTRIBUTOR');
    assert.equal(VENDOR_TYPES.TISSUE_BANK, 'TISSUE_BANK');
    assert.equal(VENDOR_STATUSES.ACTIVE, 'active');
    assert.equal(VENDOR_STATUSES.INACTIVE, 'inactive');
    assert.equal(RELATIONSHIP_TYPES.AUTHORIZED_DISTRIBUTOR, 'AUTHORIZED_DISTRIBUTOR');
    assert.ok(Array.isArray(GLOBAL_BASELINE_VENDORS));
    assert.equal(GLOBAL_BASELINE_VENDORS.length, 15);
  });

  await t.test('normalizeVendorName strips legal suffixes, punctuation, and normalizes casing', () => {
    const raw1 = 'Howmedica Osteonics Corp., Inc.';
    const raw2 = 'Stryker Orthopaedics, LLC';
    const raw3 = '  zimmer  biomet   holdings, co.  ';

    assert.equal(vendorService.normalizeVendorName(raw1), 'HOWMEDICA OSTEONICS');
    assert.equal(vendorService.normalizeVendorName(raw2), 'STRYKER ORTHOPAEDICS');
    assert.equal(vendorService.normalizeVendorName(raw3), 'ZIMMER BIOMET');
  });

  await t.test('calculateSimilarityScore computes accurate string similarity (Dice coefficient)', () => {
    const scoreExact = vendorService.calculateSimilarityScore('Stryker Orthopaedics', 'Stryker Orthopaedics, Inc.');
    assert.equal(scoreExact, 1.0); // Normalization strips Inc.

    const scoreHigh = vendorService.calculateSimilarityScore('Stryker Orthopaedics', 'Stryker Orthopedics');
    assert.ok(scoreHigh >= 0.85, `Score should be >= 0.85, got ${scoreHigh}`);

    const scoreLow = vendorService.calculateSimilarityScore('Stryker', 'Medtronic');
    assert.ok(scoreLow < 0.3, `Score should be < 0.3, got ${scoreLow}`);
  });

  await t.test('checkDuplicateCandidates identifies exact collisions and fuzzy candidates', () => {
    // 1. Exact Code Collision
    const dupCode = vendorService.checkDuplicateCandidates('Custom Stryker', 'STRYKER');
    assert.equal(dupCode.hasExactCollision, true);
    assert.ok(dupCode.exactCodeMatch);

    // 2. Exact Normalized Legal Name Collision
    const dupName = vendorService.checkDuplicateCandidates('Howmedica Osteonics Corp', 'VND_NEW_01');
    assert.equal(dupName.hasExactCollision, true);
    assert.ok(dupName.exactNameMatch);

    // 3. Fuzzy Warning Candidate
    const dupFuzzy = vendorService.checkDuplicateCandidates('Zimmer Biomet Surgical', 'VND_NEW_02');
    assert.equal(dupFuzzy.hasExactCollision, false);
    assert.equal(dupFuzzy.hasWarningCandidates, true);
    assert.ok(dupFuzzy.candidateMatches.length > 0);
  });

  await t.test('getVendors queries baseline vendors and filters accurately', async () => {
    const resAll = await vendorService.getVendors();
    assert.ok(resAll.vendors.length >= 15);
    assert.ok(resAll.metrics.total >= 15);
    assert.equal(resAll.metrics.activeManufacturers, 12);
    assert.equal(resAll.metrics.activeDistributors, 3);

    // Filter by Specialty
    const resOphth = await vendorService.getVendors({ specialty: 'Ophthalmology' });
    const hasAlcon = resOphth.vendors.some(v => v.vendor_code === 'ALCON');
    assert.equal(hasAlcon, true);

    // Filter by Search
    const resSearch = await vendorService.getVendors({ search: 'warsaw' });
    assert.ok(resSearch.vendors.length >= 2); // Zimmer & DePuy in Warsaw, IN
  });

  await t.test('getVendorById retrieves vendor with linked distributor relationships', async () => {
    const stryker = GLOBAL_BASELINE_VENDORS.find(v => v.vendor_code === 'STRYKER');
    assert.ok(stryker, 'Stryker must exist in baseline');

    const detail = await vendorService.getVendorById(stryker.id);
    assert.equal(detail.vendor_code, 'STRYKER');
    assert.ok(Array.isArray(detail.relationships));
    assert.ok(detail.relationships.length > 0);
    assert.ok(detail.relationships.some(r => r.distributor_id === '00000000-0000-0000-0053-000000000013')); // Cardinal Health
  });

  await t.test('saveVendor validates code formatting and rejects invalid inputs', async () => {
    // Rejects lowercase or special character code
    await assert.rejects(
      async () => vendorService.saveVendor({ vendor_code: 'stryker invalid!', legal_name: 'Test Corp' }),
      /VALIDATION ERROR.*alphanumeric/
    );

    // Rejects empty legal name
    await assert.rejects(
      async () => vendorService.saveVendor({ vendor_code: 'VND_TEST', legal_name: '   ' }),
      /VALIDATION ERROR.*Legal entity name is required/
    );

    // Successfully creates valid vendor
    const saveRes = await vendorService.saveVendor({
      vendor_code: 'TEST_OEM_99',
      legal_name: 'Test Medical Technology Corp.',
      display_name: 'Test MedTech',
      vendor_type: 'MANUFACTURER',
      specialties: ['Orthopedics']
    });

    assert.equal(saveRes.success, true);
    assert.ok(saveRes.vendor_id);
  });

  await t.test('deactivateVendor requires mandatory rationale and updates status', async () => {
    const testVendor = GLOBAL_BASELINE_VENDORS.find(v => v.vendor_code === 'TEST_OEM_99');
    assert.ok(testVendor);

    // Rejects empty rationale
    await assert.rejects(
      async () => vendorService.deactivateVendor(testVendor.id, '  '),
      /VALIDATION ERROR.*Deactivation rationale is required/
    );

    // Successfully deactivates
    const deactRes = await vendorService.deactivateVendor(testVendor.id, 'Supplier acquired by competitor');
    assert.equal(deactRes.success, true);
    assert.equal(deactRes.status, 'inactive');
  });

  await t.test('reactivateVendor restores inactive vendor back to active', async () => {
    const testVendor = GLOBAL_BASELINE_VENDORS.find(v => v.vendor_code === 'TEST_OEM_99');
    assert.ok(testVendor);
    assert.equal(testVendor.status, 'inactive');

    const reactRes = await vendorService.reactivateVendor(testVendor.id, testVendor.vendor_code);
    assert.equal(reactRes.success, true);
    assert.equal(reactRes.status, 'active');
    assert.equal(testVendor.status, 'active');
    assert.equal(testVendor.is_active, true);
  });

  await t.test('saveRelationship prevents self-referential relationships', async () => {
    const vendorId = '00000000-0000-0000-0053-000000000001';
    await assert.rejects(
      async () => vendorService.saveRelationship({
        distributor_id: vendorId,
        manufacturer_id: vendorId,
        relationship_type: 'AUTHORIZED_DISTRIBUTOR'
      }),
      /VALIDATION ERROR.*cannot establish a distributor relationship with itself/
    );
  });

  await t.test('vendorService methods are wired onto db singleton', () => {
    assert.equal(typeof db.getImplantVendors, 'function');
    assert.equal(typeof db.getImplantVendorById, 'function');
    assert.equal(typeof db.saveImplantVendor, 'function');
    assert.equal(typeof db.deactivateImplantVendor, 'function');
  });
});

// ==============================================================================
// SUITE 3: UI EXPLORER & MAESTRO GUIDELINE COMPLIANCE
// ==============================================================================

test('Phase 53 — UI Component & Maestro Guideline Compliance', async (t) => {
  const jsxPath = path.join(rootDir, 'src', 'components', 'ImplantVendorMaster.jsx');
  const cssPath = path.join(rootDir, 'src', 'components', 'ImplantVendorMaster.css');
  const appPath = path.join(rootDir, 'src', 'App.jsx');

  await t.test('ImplantVendorMaster.jsx and CSS exist and are populated', () => {
    assert.ok(fs.existsSync(jsxPath), 'ImplantVendorMaster.jsx must exist');
    assert.ok(fs.existsSync(cssPath), 'ImplantVendorMaster.css must exist');
    const jsx = fs.readFileSync(jsxPath, 'utf8');
    const css = fs.readFileSync(cssPath, 'utf8');
    assert.ok(jsx.length > 2000, 'JSX must be substantive');
    assert.ok(css.length > 1000, 'CSS must be substantive');
  });

  await t.test('CSS and JSX strictly obey Purple Ban (zero banned purple/violet/magenta/fuchsia hexes)', () => {
    const bannedPatterns = [
      /#8b5cf6/i, /#7c3aed/i, /#6d28d9/i, /#a855f7/i, /#9333ea/i,
      /#c084fc/i, /#d946ef/i, /#e879f9/i, /#f0abfc/i,
      /\bpurple\b/i, /\bviolet\b/i, /\bfuchsia\b/i, /\bmagenta\b/i
    ];

    const jsx = fs.readFileSync(jsxPath, 'utf8');
    const css = fs.readFileSync(cssPath, 'utf8');

    for (const pat of bannedPatterns) {
      assert.doesNotMatch(jsx, pat, `JSX must not contain banned purple pattern: ${pat}`);
      assert.doesNotMatch(css, pat, `CSS must not contain banned purple pattern: ${pat}`);
    }
  });

  await t.test('App.jsx integrates ImplantVendorMaster in sidebar navigation and tab render', () => {
    const appContent = fs.readFileSync(appPath, 'utf8');
    assert.match(appContent, /import ImplantVendorMaster from '\.\/components\/ImplantVendorMaster';/);
    assert.match(appContent, /activeTab === 'implant_vendors'/);
    assert.match(appContent, /<ImplantVendorMaster/);
    assert.match(appContent, /Vendor Master/);
  });
});
