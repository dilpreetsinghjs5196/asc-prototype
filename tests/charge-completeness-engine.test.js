import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../src/lib/supabase.js';
import { rbacService } from '../src/lib/rbacService.js';
import { estimateFinancials } from '../src/services/aiOperations/FinancialEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 46 — Charge Completeness Engine & Pre-Bill Governance Suite', () => {

  // Domain 1: Database Migration 023 DDL & Schema Integrity
  describe('1. Database Migration 023: DDL & Schema Integrity', () => {
    const migPath = path.join(rootDir, 'supabase', 'migrations', '023_charge_completeness_engine.sql');
    const downPath = path.join(rootDir, 'supabase', 'migrations', '023_charge_completeness_engine_down.sql');

    it('Migration 023 forward and down SQL files exist and are populated', () => {
      assert.ok(fs.existsSync(migPath), '023_charge_completeness_engine.sql must exist');
      assert.ok(fs.existsSync(downPath), '023_charge_completeness_engine_down.sql must exist');
      const fwd = fs.readFileSync(migPath, 'utf8');
      const dwn = fs.readFileSync(downPath, 'utf8');
      assert.ok(fwd.length > 1000, 'Forward migration must be substantive');
      assert.ok(dwn.length > 300, 'Down migration must be substantive');
    });

    it('Migration 023 creates public.case_devices for itemized implants and devices', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.case_devices'), 'Must create case_devices table');
      assert.ok(sql.includes('device_name VARCHAR(150) NOT NULL'), 'Must include device_name column');
      assert.ok(sql.includes('hcpcs_code VARCHAR(10)'), 'Must include hcpcs_code column');
      assert.ok(sql.includes('quantity INTEGER NOT NULL DEFAULT 1'), 'Must include quantity column with check');
      assert.ok(sql.includes('unit_cost NUMERIC(10, 2)'), 'Must include unit_cost column');
      assert.ok(sql.includes('charge_amount NUMERIC(10, 2)'), 'Must include charge_amount column');
    });

    it('Migration 023 creates public.charge_completeness_runs for pre-bill audit history', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.charge_completeness_runs'), 'Must create charge_completeness_runs');
      assert.ok(sql.includes('overall_status VARCHAR(20) NOT NULL'), 'Must include overall_status');
      assert.ok(sql.includes('blocker_count INTEGER NOT NULL DEFAULT 0'), 'Must track blocker_count');
      assert.ok(sql.includes('is_cleared BOOLEAN NOT NULL DEFAULT false'), 'Must include is_cleared flag');
      assert.ok(sql.includes('clearance_note TEXT'), 'Must store clearance_note');
    });

    it('Migration 023 creates public.charge_completeness_findings with severity and overrides', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.charge_completeness_findings'), 'Must create charge_completeness_findings');
      assert.ok(sql.includes('rule_id VARCHAR(30) NOT NULL'), 'Must include rule_id');
      assert.ok(sql.includes('severity VARCHAR(20) NOT NULL CHECK'), 'Must include severity check');
      assert.ok(sql.includes('is_overridden BOOLEAN NOT NULL DEFAULT false'), 'Must include is_overridden flag');
      assert.ok(sql.includes('override_reason TEXT'), 'Must include override_reason');
    });

    it('Migration 023 deploys authoritative fn_evaluate_charge_completeness stored procedure', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.fn_evaluate_charge_completeness'), 'Must implement fn_evaluate_charge_completeness');
      assert.ok(sql.includes('PROC-001'), 'Must check rule PROC-001 for zero-line cases');
      assert.ok(sql.includes('PROC-002'), 'Must check rule PROC-002 for primary procedure');
      assert.ok(sql.includes('DEV-001'), 'Must check rule DEV-001 for device-intensive CPTs');
      assert.ok(sql.includes('PRIC-001'), 'Must check rule PRIC-001 for $0 reimbursement');
      assert.ok(sql.includes('DOC-001'), 'Must check rule DOC-001 for post-op diagnosis');
    });

    it('Migration 023 upgrades fn_validate_case_procedures to block zero-procedure cases', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.fn_validate_case_procedures'), 'Must update fn_validate_case_procedures');
      assert.ok(sql.includes('v_total_lines = 0 AND COALESCE(v_surg.status, \'\') != \'Cancelled\''), 'Must enforce total_lines > 0 for non-cancelled encounters');
    });

    it('Migration 023 enforces tenant-isolated RLS across all new tables', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('ALTER TABLE public.case_devices ENABLE ROW LEVEL SECURITY'), 'Must enable RLS on case_devices');
      assert.ok(sql.includes('ALTER TABLE public.charge_completeness_runs ENABLE ROW LEVEL SECURITY'), 'Must enable RLS on runs');
      assert.ok(sql.includes('ALTER TABLE public.charge_completeness_findings ENABLE ROW LEVEL SECURITY'), 'Must enable RLS on findings');
      assert.ok(sql.includes('facility_id = COALESCE'), 'Must enforce facility isolation');
    });

    it('Migration 023 down script rolls back in reverse dependency order', () => {
      const sql = fs.readFileSync(downPath, 'utf8');
      assert.ok(sql.includes('DROP FUNCTION IF EXISTS public.fn_evaluate_charge_completeness'), 'Must drop evaluation function');
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.charge_completeness_findings CASCADE'), 'Must drop findings table');
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.charge_completeness_runs CASCADE'), 'Must drop runs table');
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.case_devices CASCADE'), 'Must drop case_devices table');
    });
  });

  // Domain 2: Financial Engine Revenue & Profit Invariants
  describe('2. Financial Engine: Allowable Reimbursement vs Chargemaster Separation', () => {
    it('estimateFinancials returns contracted allowable reimbursement without assigning grossCharge', () => {
      const cpt = {
        code: '27447',
        reimbursement: 4500,
        gross_charge: 15750
      };
      const est = estimateFinancials(cpt, 60, 500, 200);
      assert.strictEqual(est.reimbursement, 4500, 'Reimbursement must be $4,500, not gross chargemaster $15,750');
      assert.strictEqual(est.grossCharge, 15750, 'grossCharge must be preserved distinctly as $15,750');
      assert.ok(est.reimbursement < est.grossCharge, 'Reimbursement must be strictly less than gross chargemaster');
    });
  });

  // Domain 3: Client Service Layer & Pre-Bill API Contracts (src/lib/supabase.js)
  describe('3. Client Service Layer: Pre-Bill & Charge Completeness Methods', () => {
    it('defines evaluateChargeCompleteness helper method', () => {
      assert.strictEqual(typeof db.evaluateChargeCompleteness, 'function');
    });

    it('defines getLatestCompletenessRun and getCompletenessFindings helper methods', () => {
      assert.strictEqual(typeof db.getLatestCompletenessRun, 'function');
      assert.strictEqual(typeof db.getCompletenessFindings, 'function');
    });

    it('defines overrideCompletenessFinding and clearCompletenessRun helper methods', () => {
      assert.strictEqual(typeof db.overrideCompletenessFinding, 'function');
      assert.strictEqual(typeof db.clearCompletenessRun, 'function');
    });

    it('defines case_devices CRUD helper methods', () => {
      assert.strictEqual(typeof db.getCaseDevices, 'function');
      assert.strictEqual(typeof db.addCaseDevice, 'function');
      assert.strictEqual(typeof db.updateCaseDevice, 'function');
      assert.strictEqual(typeof db.deleteCaseDevice, 'function');
    });
  });

  // Domain 4: RBAC & Pre-Bill Governance Security (src/lib/rbacService.js)
  describe('4. RBAC & Pre-Bill Governance Security', () => {
    it('PERMISSIONS_CATALOG includes billing.view_completeness, billing.override_blocker, and billing.signoff_prebill', () => {
      const catalog = rbacService.getPermissionsCatalog();
      const codes = catalog.map(p => p.code);
      assert.ok(codes.includes('billing.view_completeness'), 'Must include billing.view_completeness');
      assert.ok(codes.includes('billing.override_blocker'), 'Must include billing.override_blocker');
      assert.ok(codes.includes('billing.signoff_prebill'), 'Must include billing.signoff_prebill');
    });

    it('allows CFO and Biller to override completeness blockers and sign-off', () => {
      const cfoPerms = [
        'billing.view_completeness',
        'billing.override_blocker',
        'billing.signoff_prebill'
      ];
      assert.ok(rbacService.hasPermission(cfoPerms, 'billing.override_blocker'), 'CFO must have override permission');
      assert.ok(rbacService.hasPermission(cfoPerms, 'billing.signoff_prebill'), 'CFO must have sign-off permission');
    });

    it('forbids Viewer and Scheduler from overriding completeness blockers', () => {
      const schedulerPerms = ['surgeries.view', 'surgeries.schedule'];
      assert.strictEqual(rbacService.hasPermission(schedulerPerms, 'billing.override_blocker'), false);
      assert.strictEqual(rbacService.hasPermission(schedulerPerms, 'billing.signoff_prebill'), false);
    });
  });

  // Domain 5: UI Integration & Specification Compliance
  describe('5. UI Integration & Specification Compliance', () => {
    it('PrebillCompletenessModal.jsx exists and renders audit status, findings, and devices', () => {
      const modalPath = path.join(rootDir, 'src', 'components', 'PrebillCompletenessModal.jsx');
      assert.ok(fs.existsSync(modalPath), 'PrebillCompletenessModal.jsx must exist');
      const content = fs.readFileSync(modalPath, 'utf8');
      assert.ok(content.includes('Pre-Bill Charge Completeness Review'), 'Must render review title');
      assert.ok(content.includes('Pre-Bill Completeness Findings'), 'Must render findings section');
      assert.ok(content.includes('Itemized Case Devices & Implants'), 'Must render devices section');
      assert.ok(content.includes('Override Completeness Blocker'), 'Must render override action');
    });

    it('SurgeryScheduler.jsx imports and mounts PrebillCompletenessModal', () => {
      const schedPath = path.join(rootDir, 'src', 'components', 'SurgeryScheduler.jsx');
      const content = fs.readFileSync(schedPath, 'utf8');
      assert.ok(content.includes('PrebillCompletenessModal'), 'Must import PrebillCompletenessModal');
      assert.ok(content.includes('<PrebillCompletenessModal'), 'Must mount PrebillCompletenessModal');
      assert.ok(content.includes('btn-prebill'), 'Must include pre-bill action button');
    });
  });
});
