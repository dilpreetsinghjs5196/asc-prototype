import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  contractService,
  CONTRACT_TYPES,
  CONTRACT_STATUSES,
  SCOPE_TYPES,
  DOCUMENT_TYPES,
  REBATE_STRUCTURE_TYPES,
  BASELINE_CONTRACTS
} from '../src/lib/contractService.js';
import { db } from '../src/lib/supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// ==============================================================================
// SUITE 1: DATABASE MIGRATION 031 DDL & SCHEMA INTEGRITY
// ==============================================================================

test('Phase 56 — Database Migration 031: DDL & Schema Integrity', async (t) => {
  const upMigrationPath = path.join(rootDir, 'supabase', 'migrations', '031_facility_vendor_contracts.sql');
  const downMigrationPath = path.join(rootDir, 'supabase', 'migrations', '031_facility_vendor_contracts_down.sql');

  await t.test('Migration 031 forward and down SQL files exist and are substantive', () => {
    assert.ok(fs.existsSync(upMigrationPath), '031_facility_vendor_contracts.sql must exist');
    assert.ok(fs.existsSync(downMigrationPath), '031_facility_vendor_contracts_down.sql must exist');
    const upSql = fs.readFileSync(upMigrationPath, 'utf8');
    const downSql = fs.readFileSync(downMigrationPath, 'utf8');
    assert.ok(upSql.length > 5000, 'Up migration must be substantive');
    assert.ok(downSql.length > 600, 'Down migration must be substantive');
  });

  const upSql = fs.readFileSync(upMigrationPath, 'utf8');
  const downSql = fs.readFileSync(downMigrationPath, 'utf8');

  await t.test('Creates public.facility_vendor_contracts table with lifecycle & commercial columns', () => {
    assert.match(upSql, /CREATE TABLE IF NOT EXISTS public\.facility_vendor_contracts/);
    assert.match(upSql, /facility_id UUID NOT NULL REFERENCES public\.facilities/);
    assert.match(upSql, /vendor_id UUID NOT NULL REFERENCES public\.implant_vendors/);
    assert.match(upSql, /contract_number VARCHAR\(100\)/);
    assert.match(upSql, /contract_name VARCHAR\(255\)/);
    assert.match(upSql, /contract_type VARCHAR\(50\)/);
    assert.match(upSql, /status VARCHAR\(30\)/);
    assert.match(upSql, /is_active BOOLEAN/);
    assert.match(upSql, /effective_from DATE NOT NULL/);
    assert.match(upSql, /effective_to DATE NOT NULL/);
    assert.match(upSql, /auto_renew BOOLEAN/);
    assert.match(upSql, /renewal_notice_days INTEGER/);
    assert.match(upSql, /gpo_affiliation VARCHAR\(100\)/);
    assert.match(upSql, /payment_terms_days INTEGER/);
    assert.match(upSql, /prompt_pay_discount_percent NUMERIC\(5,\s*2\)/);
    assert.match(upSql, /is_consignment BOOLEAN/);
    assert.match(upSql, /consignment_reconciliation_frequency VARCHAR\(30\)/);
    assert.match(upSql, /annual_volume_commitment_amount NUMERIC\(14,\s*2\)/);
    assert.match(upSql, /has_rebate_terms BOOLEAN/);
    assert.match(upSql, /rebate_structure_type VARCHAR\(50\)/);
    assert.match(upSql, /rebate_percentage NUMERIC\(5,\s*2\)/);
    assert.match(upSql, /amendment_number INTEGER/);
    assert.match(upSql, /parent_contract_id UUID REFERENCES public\.facility_vendor_contracts/);
    assert.match(upSql, /approved_by UUID REFERENCES auth\.users/);
    assert.match(upSql, /chk_contract_dates/);
    assert.match(upSql, /chk_contract_active_sync/);
    assert.match(upSql, /chk_contract_approval_integrity/);
  });

  await t.test('Creates public.facility_vendor_contract_scopes table for relational itemization', () => {
    assert.match(upSql, /CREATE TABLE IF NOT EXISTS public\.facility_vendor_contract_scopes/);
    assert.match(upSql, /contract_id UUID NOT NULL REFERENCES public\.facility_vendor_contracts/);
    assert.match(upSql, /scope_type VARCHAR\(30\)/);
    assert.match(upSql, /specialty VARCHAR\(50\)/);
    assert.match(upSql, /component_id UUID REFERENCES public\.implant_components/);
    assert.match(upSql, /family_id UUID REFERENCES public\.implant_product_families/);
    assert.match(upSql, /sku_id UUID REFERENCES public\.implant_product_skus/);
    assert.match(upSql, /is_consignment_covered BOOLEAN/);
    assert.match(upSql, /is_excluded BOOLEAN/);
    assert.match(upSql, /tier_discount_percent NUMERIC\(5,\s*2\)/);
    assert.match(upSql, /chk_scope_target_consistency/);
  });

  await t.test('Creates public.facility_vendor_contract_documents table with SHA-256 fingerprinting', () => {
    assert.match(upSql, /CREATE TABLE IF NOT EXISTS public\.facility_vendor_contract_documents/);
    assert.match(upSql, /document_name VARCHAR\(255\)/);
    assert.match(upSql, /document_type VARCHAR\(50\)/);
    assert.match(upSql, /storage_path VARCHAR\(500\)/);
    assert.match(upSql, /file_size_bytes BIGINT/);
    assert.match(upSql, /file_sha256 VARCHAR\(64\)/);
    assert.match(upSql, /is_confidential BOOLEAN/);
  });

  await t.test('Links foreign key from case_devices to facility_vendor_contracts', () => {
    assert.match(upSql, /ADD CONSTRAINT fk_case_devices_contract_id/);
    assert.match(upSql, /FOREIGN KEY \(contract_id\) REFERENCES public\.facility_vendor_contracts/);
  });

  await t.test('Deploys safety triggers for hard delete prevention, relocation prevention, and separation of duties', () => {
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_prevent_active_contract_delete/);
    assert.match(upSql, /trg_prevent_active_contract_delete/);
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_prevent_facility_relocation_contracts/);
    assert.match(upSql, /trg_prevent_facility_relocation_contracts/);
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_enforce_contract_approval_separation/);
    assert.match(upSql, /trg_enforce_contract_approval_separation/);
  });

  await t.test('Deploys authoritative stored procedures for upsert, review, amendment, and eligibility', () => {
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_upsert_facility_vendor_contract/);
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_review_facility_vendor_contract/);
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_create_contract_amendment/);
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_validate_contract_eligibility/);
    assert.match(upSql, /GRANT EXECUTE ON FUNCTION public\.fn_upsert_facility_vendor_contract/);
    assert.match(upSql, /GRANT EXECUTE ON FUNCTION public\.fn_review_facility_vendor_contract/);
    assert.match(upSql, /GRANT EXECUTE ON FUNCTION public\.fn_create_contract_amendment/);
    assert.match(upSql, /GRANT EXECUTE ON FUNCTION public\.fn_validate_contract_eligibility/);
  });

  await t.test('Enables Row-Level Security (RLS) with tenant isolation and confidential masking policies', () => {
    assert.match(upSql, /ALTER TABLE public\.facility_vendor_contracts ENABLE ROW LEVEL SECURITY/);
    assert.match(upSql, /ALTER TABLE public\.facility_vendor_contract_scopes ENABLE ROW LEVEL SECURITY/);
    assert.match(upSql, /ALTER TABLE public\.facility_vendor_contract_documents ENABLE ROW LEVEL SECURITY/);
    assert.match(upSql, /fvc_select_tenant_members/);
    assert.match(upSql, /fvc_insert_procurement_roles/);
    assert.match(upSql, /fvc_update_procurement_roles/);
    assert.match(upSql, /fvc_delete_admin_drafts_only/);
    assert.match(upSql, /fvcd_select_document_security/);
  });

  await t.test('Down migration safely drops objects in reverse dependency order', () => {
    assert.match(downSql, /DROP FUNCTION IF EXISTS public\.fn_validate_contract_eligibility/);
    assert.match(downSql, /DROP FUNCTION IF EXISTS public\.fn_upsert_facility_vendor_contract/);
    assert.match(downSql, /ALTER TABLE public\.case_devices DROP CONSTRAINT fk_case_devices_contract_id/);
    assert.match(downSql, /DROP TABLE IF EXISTS public\.facility_vendor_contract_documents CASCADE/);
    assert.match(downSql, /DROP TABLE IF EXISTS public\.facility_vendor_contract_scopes CASCADE/);
    assert.match(downSql, /DROP TABLE IF EXISTS public\.facility_vendor_contracts CASCADE/);
  });
});

// ==============================================================================
// SUITE 2: CLIENT SERVICE LAYER (contractService.js)
// ==============================================================================

test('Phase 56 — Client Service Layer: contractService.js', async (t) => {
  contractService.resetInMemoryState();

  await t.test('Exports domain enums and constants', () => {
    assert.ok(Array.isArray(CONTRACT_TYPES), 'CONTRACT_TYPES must be array');
    assert.ok(CONTRACT_TYPES.includes('DIRECT_OEM'));
    assert.ok(CONTRACT_TYPES.includes('GPO_TIERED'));
    assert.ok(Array.isArray(CONTRACT_STATUSES), 'CONTRACT_STATUSES must be array');
    assert.ok(CONTRACT_STATUSES.includes('active'));
    assert.ok(CONTRACT_STATUSES.includes('pending_approval'));
    assert.ok(CONTRACT_STATUSES.includes('expired'));
    assert.ok(Array.isArray(SCOPE_TYPES), 'SCOPE_TYPES must be array');
    assert.ok(SCOPE_TYPES.includes('ALL_VENDOR_PRODUCTS'));
    assert.ok(Array.isArray(DOCUMENT_TYPES), 'DOCUMENT_TYPES must be array');
    assert.ok(Array.isArray(REBATE_STRUCTURE_TYPES), 'REBATE_STRUCTURE_TYPES must be array');
    assert.ok(REBATE_STRUCTURE_TYPES.includes('VOLUME_TIERED'));
    assert.ok(Array.isArray(BASELINE_CONTRACTS), 'BASELINE_CONTRACTS must be array');
    assert.ok(BASELINE_CONTRACTS.length >= 2);
  });

  await t.test('getContracts retrieves items, computes summary KPIs, and applies filters', async () => {
    const res = await contractService.getContracts();
    assert.ok(Array.isArray(res.items), 'items must be array');
    assert.ok(res.items.length >= 2, 'Should load baseline contracts');
    assert.ok(res.metrics, 'Metrics object must be present');
    assert.ok(res.metrics.totalCount >= 2, 'Metrics totalCount should be populated');
    assert.ok(typeof res.metrics.activeCount === 'number');

    // Filter by vendor
    const strykerFilter = await contractService.getContracts({ vendorId: '00000000-0000-0000-0053-000000000001' });
    assert.ok(strykerFilter.items.every(c => c.vendor_id === '00000000-0000-0000-0053-000000000001'));

    // Search filter
    const searchRes = await contractService.getContracts({ search: 'stryker' });
    assert.ok(searchRes.items.length > 0);
  });

  await t.test('getContractById returns full contract with scopes and documents', async () => {
    const contract = await contractService.getContractById('00000000-0000-0000-0056-000000000001');
    assert.equal(contract.id, '00000000-0000-0000-0056-000000000001');
    assert.equal(contract.contract_number, 'CTR-2026-STR-01');
    assert.ok(Array.isArray(contract.scopes));
    assert.ok(Array.isArray(contract.documents));
  });

  await t.test('saveContractDraft validates mandatory fields, date boundaries, and duplicates', async () => {
    // Missing number
    await assert.rejects(
      async () => contractService.saveContractDraft({ contract_name: 'Test' }),
      /Contract number is required/
    );

    // Missing vendor
    await assert.rejects(
      async () => contractService.saveContractDraft({ contract_number: 'TEST-01', contract_name: 'Test' }),
      /vendor_id is required/
    );

    // Invalid dates (effective_to < effective_from)
    await assert.rejects(
      async () => contractService.saveContractDraft({
        contract_number: 'TEST-01',
        contract_name: 'Test',
        vendor_id: '00000000-0000-0000-0053-000000000001',
        effective_from: '2026-12-31',
        effective_to: '2026-01-01'
      }),
      /effective_to date cannot be earlier than effective_from/
    );

    // Valid save
    const saveRes = await contractService.saveContractDraft({
      id: 'contract-new-2026',
      contract_number: 'CTR-NEW-2026',
      contract_name: 'Medtronic Spinal Implants Agreement',
      vendor_id: '00000000-0000-0000-0053-000000000004',
      effective_from: '2026-01-01',
      effective_to: '2026-12-31'
    });
    assert.ok(saveRes.success);
    assert.equal(saveRes.contract.contract_number, 'CTR-NEW-2026');
    assert.equal(saveRes.contract.status, 'draft');

    // Duplicate check
    await assert.rejects(
      async () => contractService.saveContractDraft({
        contract_number: 'CTR-NEW-2026',
        contract_name: 'Duplicate Agreement',
        vendor_id: '00000000-0000-0000-0053-000000000004',
        effective_from: '2026-01-01',
        effective_to: '2026-12-31'
      }),
      /already exists for this facility/
    );
  });

  await t.test('submitForApproval transitions draft to pending_approval', async () => {
    const subRes = await contractService.submitForApproval('contract-new-2026', 'Ready for review');
    assert.ok(subRes.success);
    assert.equal(subRes.contract.status, 'pending_approval');
    assert.equal(subRes.contract.is_active, false);
  });

  await t.test('reviewContract enforces separation of duties and requires rationale on rejection', async () => {
    // Creator self-approval rejected
    await assert.rejects(
      async () => contractService.reviewContract('contract-new-2026', {
        action: 'approve',
        reviewerUserId: '00000000-0000-0000-0001-000000000001', // identical to creator
        isSuperAdmin: false
      }),
      /Separation of duties violation: Creator or submitter cannot approve/
    );

    // Rejection without rationale rejected
    await assert.rejects(
      async () => contractService.reviewContract('contract-new-2026', {
        action: 'reject',
        rationale: '',
        reviewerUserId: '00000000-0000-0000-0001-000000000004'
      }),
      /A detailed rejection rationale/
    );

    // Successful rejection
    const rejRes = await contractService.reviewContract('contract-new-2026', {
      action: 'reject',
      rationale: 'Rebate terms not in accordance with Vizient tier schedule.',
      reviewerUserId: '00000000-0000-0000-0001-000000000004'
    });
    assert.equal(rejRes.action, 'rejected');
    assert.equal(rejRes.contract.status, 'rejected');

    // Resubmit and approve with second person
    await contractService.submitForApproval('contract-new-2026');
    const appRes = await contractService.reviewContract('contract-new-2026', {
      action: 'approve',
      reviewerUserId: '00000000-0000-0000-0001-000000000004'
    });
    assert.equal(appRes.action, 'approved');
    assert.equal(appRes.contract.status, 'active');
    assert.equal(appRes.contract.is_active, true);
  });

  await t.test('createAmendment clones parent contract with incremented amendment_number', async () => {
    const amendRes = await contractService.createAmendment('00000000-0000-0000-0056-000000000001', {
      amendmentRationale: 'Adding shoulder arthroplasty product family into existing master agreement.'
    });
    assert.ok(amendRes.success);
    assert.equal(amendRes.amendment.amendment_number, 1);
    assert.equal(amendRes.amendment.parent_contract_id, '00000000-0000-0000-0056-000000000001');
    assert.equal(amendRes.amendment.status, 'draft');
  });

  await t.test('addContractScope and deleteContractScope manage scope line-items', async () => {
    const addRes = await contractService.addContractScope('00000000-0000-0000-0056-000000000001', {
      scope_type: 'COMPONENT',
      component_id: '00000000-0000-0000-0051-000000000020', // Hip stem
      is_excluded: true,
      exclusion_reason: 'Revision hip stems carved out'
    });
    assert.ok(addRes.success);
    assert.equal(addRes.scope.is_excluded, true);

    const delRes = await contractService.deleteContractScope('00000000-0000-0000-0056-000000000001', addRes.scope.id);
    assert.ok(delRes.success);
  });

  await t.test('validateContractCoverage determines authoritative sourcing eligibility', async () => {
    // 1. Authorized vendor and component (Stryker Knee)
    const validCheck = await contractService.validateContractCoverage({
      vendorId: '00000000-0000-0000-0053-000000000001',
      componentId: '00000000-0000-0000-0051-000000000010',
      procedureDate: '2026-06-15'
    });
    assert.equal(validCheck.isAuthorized, true);
    assert.equal(validCheck.reasonCode, 'CONTRACT_AUTHORIZED');
    assert.equal(validCheck.contractNumber, 'CTR-2026-STR-01');

    // 2. Uncontracted vendor
    const uncontractedCheck = await contractService.validateContractCoverage({
      vendorId: '00000000-0000-0000-0053-000000000099',
      procedureDate: '2026-06-15'
    });
    assert.equal(uncontractedCheck.isAuthorized, false);
    assert.equal(uncontractedCheck.reasonCode, 'NO_ACTIVE_CONTRACT');

    // 3. Expired date check
    const expiredDateCheck = await contractService.validateContractCoverage({
      vendorId: '00000000-0000-0000-0053-000000000001',
      procedureDate: '2028-01-01'
    });
    assert.equal(expiredDateCheck.isAuthorized, false);
    assert.equal(expiredDateCheck.reasonCode, 'NO_ACTIVE_CONTRACT');
  });

  await t.test('contractService methods are wired onto db singleton', () => {
    assert.equal(typeof db.getFacilityVendorContracts, 'function');
    assert.equal(typeof db.getFacilityVendorContractById, 'function');
    assert.equal(typeof db.saveFacilityVendorContract, 'function');
    assert.equal(typeof db.reviewFacilityVendorContract, 'function');
    assert.equal(typeof db.createFacilityVendorContractAmendment, 'function');
    assert.equal(typeof db.validateFacilityVendorContractCoverage, 'function');
  });
});

// ==============================================================================
// SUITE 3: UI COMPONENT & MAESTRO GUIDELINE COMPLIANCE (PURPLE BAN)
// ==============================================================================

test('Phase 56 — UI Component & Maestro Guideline Compliance', async (t) => {
  const jsxPath = path.join(rootDir, 'src', 'components', 'FacilityVendorContracts.jsx');
  const cssPath = path.join(rootDir, 'src', 'components', 'FacilityVendorContracts.css');

  await t.test('FacilityVendorContracts.jsx and CSS exist and are populated', () => {
    assert.ok(fs.existsSync(jsxPath), 'FacilityVendorContracts.jsx must exist');
    assert.ok(fs.existsSync(cssPath), 'FacilityVendorContracts.css must exist');
    const jsx = fs.readFileSync(jsxPath, 'utf8');
    const css = fs.readFileSync(cssPath, 'utf8');
    assert.ok(jsx.length > 5000, 'JSX must contain comprehensive interface implementation');
    assert.ok(css.length > 2000, 'CSS must contain comprehensive styling');
  });

  await t.test('CSS and JSX strictly obey Purple Ban (zero banned purple/violet/magenta/fuchsia tokens)', () => {
    const jsx = fs.readFileSync(jsxPath, 'utf8');
    const css = fs.readFileSync(cssPath, 'utf8');
    const combined = `${jsx}\n${css}`;

    // Regex for forbidden purple/violet color names and hex codes
    const purpleKeywords = /\b(purple|violet|fuchsia|magenta|indigo)\b/i;
    const purpleHexes = /#(7c3aed|8b5cf6|a855f7|9333ea|c084fc|d8b4fe|e9d5ff|6366f1|4f46e5|818cf8|a5b4fc|c7d2fe)/i;

    assert.ok(!purpleKeywords.test(combined), 'Found banned purple/violet keyword in Phase 56 UI files');
    assert.ok(!purpleHexes.test(combined), 'Found banned purple/violet hex code in Phase 56 UI files');
  });

  await t.test('App.jsx integrates FacilityVendorContracts in sidebar navigation, subtitle, and tab render', () => {
    const appPath = path.join(rootDir, 'src', 'App.jsx');
    const appContent = fs.readFileSync(appPath, 'utf8');

    assert.match(appContent, /import FacilityVendorContracts from '\.\/components\/FacilityVendorContracts';/);
    assert.match(appContent, /activeTab === 'facility_vendor_contracts'/);
    assert.match(appContent, /<FacilityVendorContracts/);
  });
});
