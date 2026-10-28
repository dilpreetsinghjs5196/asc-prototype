import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  vendorComponentService,
  PREFERENCE_TIERS,
  SOURCING_MODELS,
  MAPPING_STATUSES,
  GLOBAL_BASELINE_MAPPINGS
} from '../src/lib/vendorComponentService.js';
import { db } from '../src/lib/supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// ==============================================================================
// SUITE 1: DATABASE MIGRATION 030 DDL & SCHEMA INTEGRITY
// ==============================================================================

test('Phase 55 — Database Migration 030: DDL & Schema Integrity', async (t) => {
  const upMigrationPath = path.join(rootDir, 'supabase', 'migrations', '030_implant_vendor_component_mapping.sql');
  const downMigrationPath = path.join(rootDir, 'supabase', 'migrations', '030_implant_vendor_component_mapping_down.sql');

  await t.test('Migration 030 forward and down SQL files exist and are substantive', () => {
    assert.ok(fs.existsSync(upMigrationPath), '030_implant_vendor_component_mapping.sql must exist');
    assert.ok(fs.existsSync(downMigrationPath), '030_implant_vendor_component_mapping_down.sql must exist');
    const upSql = fs.readFileSync(upMigrationPath, 'utf8');
    const downSql = fs.readFileSync(downMigrationPath, 'utf8');
    assert.ok(upSql.length > 4000, 'Up migration must be substantive');
    assert.ok(downSql.length > 600, 'Down migration must be substantive');
  });

  const upSql = fs.readFileSync(upMigrationPath, 'utf8');
  const downSql = fs.readFileSync(downMigrationPath, 'utf8');

  await t.test('Creates public.implant_vendor_component_mappings table with columns and constraints', () => {
    assert.match(upSql, /CREATE TABLE IF NOT EXISTS public\.implant_vendor_component_mappings/);
    assert.match(upSql, /facility_id UUID REFERENCES public\.facilities/);
    assert.match(upSql, /vendor_id UUID NOT NULL REFERENCES public\.implant_vendors/);
    assert.match(upSql, /component_id UUID NOT NULL REFERENCES public\.implant_components/);
    assert.match(upSql, /preference_tier VARCHAR\(30\)/);
    assert.match(upSql, /sourcing_model VARCHAR\(30\)/);
    assert.match(upSql, /authorized_distributor_id UUID REFERENCES public\.implant_vendors/);
    assert.match(upSql, /contract_reference_number VARCHAR\(100\)/);
    assert.match(upSql, /lead_time_days INTEGER DEFAULT 3/);
    assert.match(upSql, /consignment_stock_maintained BOOLEAN/);
    assert.match(upSql, /effective_date DATE/);
    assert.match(upSql, /termination_date DATE/);
    assert.match(upSql, /status VARCHAR\(30\)/);
    assert.match(upSql, /is_active BOOLEAN/);
    assert.match(upSql, /approval_status VARCHAR\(30\)/);
    assert.match(upSql, /chk_mapping_dates/);
    assert.match(upSql, /chk_mapping_active_sync/);
    assert.match(upSql, /chk_mapping_distributor_role/);
  });

  await t.test('Creates unique index with NULLS NOT DISTINCT for hybrid tenancy', () => {
    assert.match(upSql, /CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_component_facility_mapping/);
    assert.match(upSql, /ON public\.implant_vendor_component_mappings\s*\(vendor_id,\s*component_id,\s*facility_id\)\s*NULLS NOT DISTINCT/i);
  });

  await t.test('Deploys safety triggers for hard delete prevention, relocation prevention, and timestamps', () => {
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_prevent_active_mapping_hard_delete/);
    assert.match(upSql, /trg_prevent_active_mapping_delete/);
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_prevent_facility_relocation_implant_mappings/);
    assert.match(upSql, /trg_prevent_facility_relocation_implant_mappings/);
    assert.match(upSql, /trg_touch_implant_vendor_component_mappings/);
  });

  await t.test('Deploys authoritative stored procedures: upsert, deactivate, reactivate, and change preference tier', () => {
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_upsert_vendor_component_mapping/);
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_deactivate_vendor_component_mapping/);
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_reactivate_vendor_component_mapping/);
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_change_mapping_preference_tier/);
    assert.match(upSql, /GRANT EXECUTE ON FUNCTION public\.fn_upsert_vendor_component_mapping/);
    assert.match(upSql, /GRANT EXECUTE ON FUNCTION public\.fn_change_mapping_preference_tier/);
  });

  await t.test('Enables Row-Level Security (RLS) with tenant isolation and global baseline policies', () => {
    assert.match(upSql, /ALTER TABLE public\.implant_vendor_component_mappings ENABLE ROW LEVEL SECURITY/);
    assert.match(upSql, /ivcm_select_policy/);
    assert.match(upSql, /ivcm_insert_policy/);
    assert.match(upSql, /ivcm_update_policy/);
    assert.match(upSql, /ivcm_delete_policy/);
  });

  await t.test('Seeds baseline capabilities across major OEMs (Stryker, Zimmer, Medtronic, Alcon, Arthrex)', () => {
    assert.match(upSql, /'STRYKER'/);
    assert.match(upSql, /'ZIMMER_BIOMET'/);
    assert.match(upSql, /'MEDTRONIC'/);
    assert.match(upSql, /'ALCON'/);
    assert.match(upSql, /'ARTHREX'/);
    assert.match(upSql, /'KNEE_FEMORAL'/);
    assert.match(upSql, /'HIP_STEM'/);
    assert.match(upSql, /'SPINE_ACDF_SCREW'/);
    assert.match(upSql, /'IOL_MONOFOCAL'/);
    assert.match(upSql, /'SHOULDER_ROTATOR_ANCHOR'/);
  });

  await t.test('Down migration safely drops objects in reverse dependency order', () => {
    assert.match(downSql, /DROP FUNCTION IF EXISTS public\.fn_change_mapping_preference_tier/);
    assert.match(downSql, /DROP FUNCTION IF EXISTS public\.fn_upsert_vendor_component_mapping/);
    assert.match(downSql, /DROP TABLE IF EXISTS public\.implant_vendor_component_mappings CASCADE/);
  });
});

// ==============================================================================
// SUITE 2: CLIENT SERVICE LAYER (vendorComponentService.js)
// ==============================================================================

test('Phase 55 — Client Service Layer: vendorComponentService.js', async (t) => {
  await t.test('Exports domain enums and constants', () => {
    assert.equal(PREFERENCE_TIERS.PREFERRED, 'PREFERRED');
    assert.equal(PREFERENCE_TIERS.STANDARD, 'STANDARD');
    assert.equal(PREFERENCE_TIERS.RESTRICTED, 'RESTRICTED');
    assert.equal(SOURCING_MODELS.DIRECT_OEM, 'DIRECT_OEM');
    assert.equal(SOURCING_MODELS.DISTRIBUTOR_CONSIGNMENT, 'DISTRIBUTOR_CONSIGNMENT');
    assert.equal(MAPPING_STATUSES.ACTIVE, 'active');
    assert.equal(MAPPING_STATUSES.TERMINATED, 'terminated');
    assert.ok(Array.isArray(GLOBAL_BASELINE_MAPPINGS));
    assert.ok(GLOBAL_BASELINE_MAPPINGS.length >= 11);
  });

  await t.test('getMappings retrieves items, applies filters, and calculates summary metrics', async () => {
    const resAll = await vendorComponentService.getMappings();
    assert.ok(resAll.mappings.length >= 11);
    assert.ok(resAll.metrics.total >= 11);
    assert.ok(resAll.metrics.activeCount >= 11);
    assert.ok(resAll.metrics.preferredCount >= 8);
    assert.ok(resAll.metrics.oemVendorsMapped >= 5);

    // Filter by Specialty
    const resOphth = await vendorComponentService.getMappings({ specialty: 'Ophthalmology' });
    assert.ok(resOphth.mappings.length >= 2);
    assert.ok(resOphth.mappings.every(m => m.component?.specialty === 'Ophthalmology'));

    // Search by vendor display name
    const resStryker = await vendorComponentService.getMappings({ search: 'stryker' });
    assert.ok(resStryker.mappings.length >= 4);
  });

  await t.test('getMappingById retrieves mapping with vendor and component details', async () => {
    const target = GLOBAL_BASELINE_MAPPINGS[0];
    const retrieved = await vendorComponentService.getMappingById(target.id);
    assert.equal(retrieved.id, target.id);
    assert.equal(retrieved.vendor_id, target.vendor_id);
    assert.equal(retrieved.component_id, target.component_id);
    assert.ok(retrieved.vendor);
    assert.ok(retrieved.component);
  });

  await t.test('saveMapping validates mandatory fields, date ranges, and distributor role', async () => {
    // Missing Vendor
    await assert.rejects(
      async () => vendorComponentService.saveMapping({ component_id: 'c1' }),
      /VALIDATION ERROR.*Vendor OEM is required/
    );

    // Missing Component
    await assert.rejects(
      async () => vendorComponentService.saveMapping({ vendor_id: 'v1' }),
      /VALIDATION ERROR.*Clinical component is required/
    );

    // Invalid Preference Tier
    await assert.rejects(
      async () => vendorComponentService.saveMapping({
        vendor_id: 'v1',
        component_id: 'c1',
        preference_tier: 'INVALID_TIER'
      }),
      /VALIDATION ERROR.*Invalid preference tier/
    );

    // Missing Distributor in DISTRIBUTOR_CONSIGNMENT model
    await assert.rejects(
      async () => vendorComponentService.saveMapping({
        vendor_id: 'v1',
        component_id: 'c1',
        sourcing_model: 'DISTRIBUTOR_CONSIGNMENT',
        authorized_distributor_id: null
      }),
      /VALIDATION ERROR.*Distributor consignment model requires an authorized distributor/
    );

    // Termination prior to Effective Date
    await assert.rejects(
      async () => vendorComponentService.saveMapping({
        vendor_id: 'v1',
        component_id: 'c1',
        effective_date: '2026-12-01',
        termination_date: '2026-11-01'
      }),
      /VALIDATION ERROR.*Termination date cannot be prior to effective date/
    );

    // Successful Save
    const saveRes = await vendorComponentService.saveMapping({
      vendor_id: '00000000-0000-0000-0053-000000000001',
      component_id: '00000000-0000-0000-0051-000000000012',
      preference_tier: 'PREFERRED',
      sourcing_model: 'DIRECT_OEM',
      contract_reference_number: 'TEST-SAVE-01'
    });
    assert.equal(saveRes.success, true);
    assert.ok(saveRes.mapping_id);
  });

  await t.test('updatePreferenceTier updates tier and rationale', async () => {
    const target = GLOBAL_BASELINE_MAPPINGS[0];
    const updateRes = await vendorComponentService.updatePreferenceTier(
      target.id,
      'RESTRICTED',
      'Clinical safety review in progress'
    );
    assert.equal(updateRes.success, true);
    assert.equal(updateRes.preference_tier, 'RESTRICTED');
    assert.equal(target.preference_tier, 'RESTRICTED');

    // Restore to PREFERRED
    await vendorComponentService.updatePreferenceTier(target.id, 'PREFERRED', 'Clinical clearance granted');
    assert.equal(target.preference_tier, 'PREFERRED');
  });

  await t.test('terminateMapping and reactivateMapping manage lifecycle states', async () => {
    const target = GLOBAL_BASELINE_MAPPINGS[4]; // Zimmer Knee Femoral

    // Terminate requires rationale
    await assert.rejects(
      async () => vendorComponentService.terminateMapping(target.id, '   '),
      /VALIDATION ERROR.*Termination rationale is required/
    );

    const termRes = await vendorComponentService.terminateMapping(target.id, 'Contract renegotiation failed');
    assert.equal(termRes.success, true);
    assert.equal(termRes.status, 'terminated');
    assert.equal(target.status, 'terminated');
    assert.equal(target.is_active, false);

    // Reactivate restores status
    const reactRes = await vendorComponentService.reactivateMapping(target.id);
    assert.equal(reactRes.success, true);
    assert.equal(reactRes.status, 'active');
    assert.equal(target.status, 'active');
    assert.equal(target.is_active, true);
  });

  await t.test('validateVendorComponentEligibility resolves compatibility and blocks restricted vendors', async () => {
    const strykerId = '00000000-0000-0000-0053-000000000001';
    const kneeFemoralId = '00000000-0000-0000-0051-000000000010';
    const unmappedId = '00000000-0000-0000-0053-000000000999';

    // 1. Valid Active Mapping
    const checkValid = await vendorComponentService.validateVendorComponentEligibility({
      vendorId: strykerId,
      componentId: kneeFemoralId
    });
    assert.equal(checkValid.isAllowed, true);
    assert.equal(checkValid.preferenceTier, 'PREFERRED');

    // 2. Unmapped Vendor-Component Pair
    const checkUnmapped = await vendorComponentService.validateVendorComponentEligibility({
      vendorId: unmappedId,
      componentId: kneeFemoralId
    });
    assert.equal(checkUnmapped.isAllowed, false);
    assert.match(checkUnmapped.reason, /UNVERIFIED_VENDOR_CAPABILITY/);

    // 3. Restricted Tier Blocks Usage
    const target = GLOBAL_BASELINE_MAPPINGS.find(m => m.vendor_id === strykerId && m.component_id === kneeFemoralId);
    target.preference_tier = 'RESTRICTED';
    target.governance_rationale = 'Pending hospital value committee approval';

    const checkRestricted = await vendorComponentService.validateVendorComponentEligibility({
      vendorId: strykerId,
      componentId: kneeFemoralId
    });
    assert.equal(checkRestricted.isAllowed, false);
    assert.equal(checkRestricted.isRestricted, true);
    assert.match(checkRestricted.reason, /VENDOR RESTRICTED/);

    // Restore tier
    target.preference_tier = 'PREFERRED';
  });

  await t.test('vendorComponentService methods are wired onto db singleton', () => {
    assert.equal(typeof db.getVendorComponentMappings, 'function');
    assert.equal(typeof db.getVendorComponentMappingById, 'function');
    assert.equal(typeof db.saveVendorComponentMapping, 'function');
    assert.equal(typeof db.terminateVendorComponentMapping, 'function');
    assert.equal(typeof db.reactivateVendorComponentMapping, 'function');
    assert.equal(typeof db.validateVendorComponentEligibility, 'function');
  });
});

// ==============================================================================
// SUITE 3: UI EXPLORER & MAESTRO GUIDELINE COMPLIANCE
// ==============================================================================

test('Phase 55 — UI Component & Maestro Guideline Compliance', async (t) => {
  const jsxPath = path.join(rootDir, 'src', 'components', 'VendorComponentMappingMatrix.jsx');
  const cssPath = path.join(rootDir, 'src', 'components', 'VendorComponentMappingMatrix.css');
  const appPath = path.join(rootDir, 'src', 'App.jsx');

  await t.test('VendorComponentMappingMatrix.jsx and CSS exist and are populated', () => {
    assert.ok(fs.existsSync(jsxPath), 'VendorComponentMappingMatrix.jsx must exist');
    assert.ok(fs.existsSync(cssPath), 'VendorComponentMappingMatrix.css must exist');
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

  await t.test('App.jsx integrates VendorComponentMappingMatrix in sidebar navigation, subtitle, and tab render', () => {
    const appContent = fs.readFileSync(appPath, 'utf8');
    assert.match(appContent, /import VendorComponentMappingMatrix from '\.\/components\/VendorComponentMappingMatrix';/);
    assert.match(appContent, /activeTab === 'vendor_component_mappings'/);
    assert.match(appContent, /<VendorComponentMappingMatrix/);
    assert.match(appContent, /Supplier Matrix/);
  });
});
