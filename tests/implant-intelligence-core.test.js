import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../src/lib/supabase.js';
import { rbacService, PERMISSIONS_CATALOG } from '../src/lib/rbacService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 50 — Implant Intelligence Core & Governance Suite', () => {

  // Domain 1: Database Migration 025 DDL & Schema Integrity
  describe('1. Database Migration 025: DDL & Schema Integrity', () => {
    const migPath = path.join(rootDir, 'supabase', 'migrations', '025_implant_intelligence_core_and_rbac.sql');
    const downPath = path.join(rootDir, 'supabase', 'migrations', '025_implant_intelligence_core_and_rbac_down.sql');

    it('Migration 025 forward and down SQL files exist and are populated', () => {
      assert.ok(fs.existsSync(migPath), '025_implant_intelligence_core_and_rbac.sql must exist');
      assert.ok(fs.existsSync(downPath), '025_implant_intelligence_core_and_rbac_down.sql must exist');
      const fwd = fs.readFileSync(migPath, 'utf8');
      const dwn = fs.readFileSync(downPath, 'utf8');
      assert.ok(fwd.length > 1000, 'Forward migration must be substantive');
      assert.ok(dwn.length > 300, 'Down migration must be substantive');
    });

    it('Migration 025 seeds 11 canonical implants.* permissions', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('implants.view_catalog'), 'Must seed implants.view_catalog');
      assert.ok(sql.includes('implants.manage_catalog'), 'Must seed implants.manage_catalog');
      assert.ok(sql.includes('implants.view_contracts'), 'Must seed implants.view_contracts');
      assert.ok(sql.includes('implants.manage_contracts'), 'Must seed implants.manage_contracts');
      assert.ok(sql.includes('implants.view_costs'), 'Must seed implants.view_costs');
      assert.ok(sql.includes('implants.override_pricing'), 'Must seed implants.override_pricing');
      assert.ok(sql.includes('implants.manage_preference_cards'), 'Must seed implants.manage_preference_cards');
      assert.ok(sql.includes('implants.log_usage'), 'Must seed implants.log_usage');
      assert.ok(sql.includes('implants.approve_invoice'), 'Must seed implants.approve_invoice');
      assert.ok(sql.includes('implants.view_variance'), 'Must seed implants.view_variance');
      assert.ok(sql.includes('implants.export_reports'), 'Must seed implants.export_reports');
    });

    it('Migration 025 hardens public.case_devices with total_cost and total_charge generated columns', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('total_cost NUMERIC(12, 2) GENERATED ALWAYS AS (quantity * unit_cost) STORED'), 'Must create total_cost generated column');
      assert.ok(sql.includes('total_charge NUMERIC(12, 2) GENERATED ALWAYS AS (quantity * charge_amount) STORED'), 'Must create total_charge generated column');
      assert.ok(sql.includes('hcpcs_c_code VARCHAR(10)'), 'Must add hcpcs_c_code column for billing compatibility');
    });

    it('Migration 025 adds clinical provenance and regulatory columns to case_devices', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('invoice_number VARCHAR(100)'), 'Must add invoice_number');
      assert.ok(sql.includes('invoice_line_cost NUMERIC(12, 2)'), 'Must add invoice_line_cost');
      assert.ok(sql.includes('expiration_date DATE'), 'Must add expiration_date');
      assert.ok(sql.includes('udi VARCHAR(150)'), 'Must add udi');
      assert.ok(sql.includes('duration_classification VARCHAR(30)'), 'Must add duration_classification');
      assert.ok(sql.includes('usage_status VARCHAR(30)'), 'Must add usage_status');
      assert.ok(sql.includes('cost_hierarchy_tier VARCHAR(30)'), 'Must add cost_hierarchy_tier');
    });

    it('Migration 025 attaches audit trigger trg_audit_case_devices to public.case_devices', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TRIGGER trg_audit_case_devices'), 'Must create trg_audit_case_devices trigger');
      assert.ok(sql.includes('AFTER INSERT OR UPDATE OR DELETE ON public.case_devices'), 'Trigger must fire on I/U/D');
      assert.ok(sql.includes('EXECUTE FUNCTION public.fn_audit_log_trigger()'), 'Trigger must call fn_audit_log_trigger');
    });

    it('Migration 025 attaches tenant relocation prevention trigger to public.case_devices', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TRIGGER trg_prevent_facility_relocation_case_devices'), 'Must create tenant protection trigger');
      assert.ok(sql.includes('BEFORE UPDATE ON public.case_devices'), 'Trigger must fire BEFORE UPDATE');
      assert.ok(sql.includes('EXECUTE FUNCTION public.prevent_facility_relocation()') || sql.includes('EXECUTE FUNCTION public.fn_prevent_facility_relocation()'), 'Trigger must call prevent_facility_relocation');
    });

    it('Migration 025 deploys authoritative stored procedure fn_reconcile_case_device_totals', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.fn_reconcile_case_device_totals'), 'Must define fn_reconcile_case_device_totals');
      assert.ok(sql.includes('UPDATE public.surgeries'), 'Must update surgeries record');
      assert.ok(sql.includes('SET implants_cost = v_total_cost'), 'Must set implants_cost to exact sum');
      assert.ok(sql.includes('SECURITY DEFINER'), 'Stored proc must be SECURITY DEFINER');
    });

    it('Migration 025 Down script safely rolls back all new objects', () => {
      const downSql = fs.readFileSync(downPath, 'utf8');
      assert.ok(downSql.includes('DROP FUNCTION IF EXISTS public.fn_reconcile_case_device_totals'), 'Must drop stored procedure');
      assert.ok(downSql.includes('DROP TRIGGER IF EXISTS trg_audit_case_devices'), 'Must drop audit trigger');
      assert.ok(downSql.includes('DROP TRIGGER IF EXISTS trg_prevent_facility_relocation_case_devices'), 'Must drop relocation trigger');
      assert.ok(downSql.includes('DROP COLUMN IF EXISTS total_charge'), 'Must drop total_charge');
      assert.ok(downSql.includes('DROP COLUMN IF EXISTS total_cost'), 'Must drop total_cost');
      assert.ok(downSql.includes('DELETE FROM public.permissions'), 'Must clean permissions');
    });
  });

  // Domain 2: RBAC & Governance Permissions (src/lib/rbacService.js)
  describe('2. RBAC & Governance Permissions (src/lib/rbacService.js)', () => {
    it('PERMISSIONS_CATALOG includes all 11 implants.* permissions', () => {
      const catalog = rbacService.getPermissionsCatalog();
      assert.equal(catalog, PERMISSIONS_CATALOG);
      const codes = catalog.map(p => p.code);
      assert.ok(codes.includes('implants.view_catalog'), 'Must include implants.view_catalog');
      assert.ok(codes.includes('implants.manage_catalog'), 'Must include implants.manage_catalog');
      assert.ok(codes.includes('implants.view_contracts'), 'Must include implants.view_contracts');
      assert.ok(codes.includes('implants.manage_contracts'), 'Must include implants.manage_contracts');
      assert.ok(codes.includes('implants.view_costs'), 'Must include implants.view_costs');
      assert.ok(codes.includes('implants.override_pricing'), 'Must include implants.override_pricing');
      assert.ok(codes.includes('implants.manage_preference_cards'), 'Must include implants.manage_preference_cards');
      assert.ok(codes.includes('implants.log_usage'), 'Must include implants.log_usage');
      assert.ok(codes.includes('implants.approve_invoice'), 'Must include implants.approve_invoice');
      assert.ok(codes.includes('implants.view_variance'), 'Must include implants.view_variance');
      assert.ok(codes.includes('implants.export_reports'), 'Must include implants.export_reports');
    });

    it('grants CFO role complete authority over contracts, pricing overrides, and invoice reconciliation', async () => {
      const cfoPerms = [
        'implants.view_catalog',
        'implants.view_contracts',
        'implants.manage_contracts',
        'implants.view_costs',
        'implants.override_pricing',
        'implants.approve_invoice',
        'implants.view_variance',
        'implants.export_reports'
      ];
      assert.ok(rbacService.hasPermission(cfoPerms, 'implants.view_contracts'), 'CFO must view contracts');
      assert.ok(rbacService.hasPermission(cfoPerms, 'implants.manage_contracts'), 'CFO must manage contracts');
      assert.ok(rbacService.hasPermission(cfoPerms, 'implants.override_pricing'), 'CFO must override pricing');
      assert.ok(rbacService.hasPermission(cfoPerms, 'implants.approve_invoice'), 'CFO must approve invoices');
      assert.ok(rbacService.hasPermission(cfoPerms, 'implants.export_reports'), 'CFO must export reports');
    });

    it('grants Clinical Manager role preference card, usage logging, and cost visibility', async () => {
      const clinPerms = [
        'implants.view_catalog',
        'implants.view_costs',
        'implants.manage_preference_cards',
        'implants.log_usage',
        'implants.view_variance'
      ];
      assert.ok(rbacService.hasPermission(clinPerms, 'implants.manage_preference_cards'), 'Clinical Manager must manage cards');
      assert.ok(rbacService.hasPermission(clinPerms, 'implants.log_usage'), 'Clinical Manager must log usage');
      assert.ok(rbacService.hasPermission(clinPerms, 'implants.view_costs'), 'Clinical Manager must view costs');
      assert.ok(!rbacService.hasPermission(clinPerms, 'implants.manage_contracts'), 'Clinical Manager cannot manage contracts');
      assert.ok(!rbacService.hasPermission(clinPerms, 'implants.override_pricing'), 'Clinical Manager cannot override pricing');
    });

    it('grants Surgeon role preference cards and variance viewing within scope', async () => {
      const surgPerms = [
        'implants.view_catalog',
        'implants.manage_preference_cards',
        'implants.view_variance'
      ];
      assert.ok(rbacService.hasPermission(surgPerms, 'implants.manage_preference_cards'), 'Surgeon must manage cards');
      assert.ok(rbacService.hasPermission(surgPerms, 'implants.view_variance'), 'Surgeon must view variance');
      assert.ok(!rbacService.hasPermission(surgPerms, 'implants.view_contracts'), 'Surgeon cannot view vendor contracts');
    });

    it('restricts Viewer role strictly to view_catalog', async () => {
      const viewerPerms = ['implants.view_catalog'];
      assert.ok(rbacService.hasPermission(viewerPerms, 'implants.view_catalog'), 'Viewer can view catalog');
      assert.ok(!rbacService.hasPermission(viewerPerms, 'implants.view_costs'), 'Viewer cannot view costs');
      assert.ok(!rbacService.hasPermission(viewerPerms, 'implants.log_usage'), 'Viewer cannot log usage');
      assert.ok(!rbacService.hasPermission(viewerPerms, 'implants.manage_contracts'), 'Viewer cannot manage contracts');
    });
  });

  // Domain 3: Client Service Layer & Calculations (src/lib/supabase.js)
  describe('3. Client Service Layer & Calculations (src/lib/supabase.js)', () => {
    it('defines reconcileCaseDeviceTotals helper method on db', () => {
      assert.equal(typeof db.reconcileCaseDeviceTotals, 'function', 'db.reconcileCaseDeviceTotals must exist');
    });

    it('defines case_devices CRUD helper methods', () => {
      assert.equal(typeof db.getCaseDevices, 'function', 'db.getCaseDevices must exist');
      assert.equal(typeof db.addCaseDevice, 'function', 'db.addCaseDevice must exist');
      assert.equal(typeof db.updateCaseDevice, 'function', 'db.updateCaseDevice must exist');
      assert.equal(typeof db.deleteCaseDevice, 'function', 'db.deleteCaseDevice must exist');
    });

    it('reconcileCaseDeviceTotals requires surgeryId parameter', async () => {
      await assert.rejects(
        async () => { await db.reconcileCaseDeviceTotals(null); },
        /Surgery ID is required/
      );
    });

    it('addCaseDevice requires surgery_id and device_name', async () => {
      await assert.rejects(
        async () => { await db.addCaseDevice({ surgery_id: null }); },
        /Surgery ID and device name are required/
      );
    });
  });
});
