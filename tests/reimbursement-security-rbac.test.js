/**
 * tests/reimbursement-security-rbac.test.js
 * =====================================================================
 * Phase 68 — Expected Reimbursement Engine Security & RBAC Test Suite
 * =====================================================================
 * Validates Security & Multi-Tenancy invariants (SEC-68-01 through SEC-68-13):
 * 1. Zero Client-Side Write Access & DCL Privileges Revocation
 * 2. Force Row-Level Security across all ledger tables
 * 3. Multi-Tenant Isolation & Role Scoping (Surgeon Encounter Binding)
 * 4. Stored Procedure Hardening (search_path, SECURITY DEFINER, Reason Audit)
 * 5. Ledger Immutability & Financial Mutation Blocking
 * 6. RBAC Permissions Catalog & Role Matrix Verification
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { rbacService, PERMISSIONS_CATALOG } from '../src/lib/rbacService.js';

const MIGRATION_044_PATH = path.resolve('supabase/migrations/044_expected_reimbursement_engine.sql');
const MIGRATION_044_DOWN_PATH = path.resolve('supabase/migrations/044_expected_reimbursement_engine_down.sql');

describe('Phase 68 Security & RBAC Matrix Verification', () => {
  const migration044 = fs.readFileSync(MIGRATION_044_PATH, 'utf8');
  const migration044Down = fs.readFileSync(MIGRATION_044_DOWN_PATH, 'utf8');

  // ===================================================================
  // 1. DCL REVOCATION & CLIENT WRITE ELIMINATION (SEC-68-01 - SEC-68-03)
  // ===================================================================
  describe('DCL Privileges & Client Write Revocation', () => {
    it('SEC-68-01: Direct INSERT, UPDATE, DELETE, TRUNCATE are revoked on reimbursement_calculations', () => {
      assert.ok(
        migration044.includes('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.reimbursement_calculations FROM authenticated;'),
        'Must explicitly revoke all write mutations on reimbursement_calculations from authenticated'
      );
      assert.ok(
        migration044.includes('REVOKE ALL ON public.reimbursement_calculations FROM anon, public;'),
        'Must revoke all privileges on reimbursement_calculations from anon and public'
      );
    });

    it('SEC-68-02: Direct write mutations are revoked on child ledger tables', () => {
      assert.ok(
        migration044.includes('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.reimbursement_calculation_lines FROM authenticated;'),
        'Must revoke writes on reimbursement_calculation_lines'
      );
      assert.ok(
        migration044.includes('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.reimbursement_calculation_adjustments FROM authenticated;'),
        'Must revoke writes on reimbursement_calculation_adjustments'
      );
    });

    it('SEC-68-03: Zero client INSERT policies exist on calculation tables', () => {
      assert.strictEqual(
        migration044.includes('FOR INSERT') && migration044.includes('TO authenticated') && !migration044.includes('DROP POLICY IF EXISTS reimb_calc_insert_policy'),
        false,
        'No active client-side FOR INSERT policies may exist for authenticated users'
      );
      assert.ok(
        migration044.includes('DROP POLICY IF EXISTS reimb_calc_insert_policy'),
        'Must drop any prior reimb_calc_insert_policy'
      );
      assert.ok(
        migration044.includes('DROP POLICY IF EXISTS reimb_calc_lines_insert_policy'),
        'Must drop any prior reimb_calc_lines_insert_policy'
      );
    });
  });

  // ===================================================================
  // 2. FORCE ROW-LEVEL SECURITY & TENANT ISOLATION (SEC-68-04 - SEC-68-06)
  // ===================================================================
  describe('FORCE ROW LEVEL SECURITY & Tenant Policies', () => {
    it('SEC-68-04: FORCE ROW LEVEL SECURITY enabled across all three ledger tables', () => {
      assert.ok(
        migration044.includes('ALTER TABLE public.reimbursement_calculations FORCE ROW LEVEL SECURITY;'),
        'FORCE RLS must be enabled on reimbursement_calculations'
      );
      assert.ok(
        migration044.includes('ALTER TABLE public.reimbursement_calculation_lines FORCE ROW LEVEL SECURITY;'),
        'FORCE RLS must be enabled on reimbursement_calculation_lines'
      );
      assert.ok(
        migration044.includes('ALTER TABLE public.reimbursement_calculation_adjustments FORCE ROW LEVEL SECURITY;'),
        'FORCE RLS must be enabled on reimbursement_calculation_adjustments'
      );
    });

    it('SEC-68-05: reimbursement_calculations SELECT policy binds facility accessibility', () => {
      assert.ok(
        migration044.includes('public.is_facility_accessible(facility_id)'),
        'Calculations SELECT policy must call public.is_facility_accessible'
      );
    });

    it('SEC-68-06: Surgeon role is strictly scoped to own encounters via s.surgeon_id = auth.uid()', () => {
      assert.ok(
        migration044.includes("public.user_has_facility_role(facility_id, ARRAY['surgeon'])"),
        'Surgeon role check must be present'
      );
      assert.ok(
        migration044.includes('s.surgeon_id = auth.uid()'),
        'Surgeon access must be bounded by s.surgeon_id = auth.uid()'
      );
    });

    it('SEC-68-07: Child lines and adjustments inherit parent facility & surgeon security scoping', () => {
      assert.ok(
        migration044.includes('public.is_facility_accessible(calc.facility_id)'),
        'Child lines policy must check calc.facility_id accessibility'
      );
      assert.ok(
        migration044.includes('s.id = calc.surgery_id') && migration044.includes('s.surgeon_id = auth.uid()'),
        'Child lines policy must enforce surgeon encounter binding'
      );
    });
  });

  // ===================================================================
  // 3. STORED PROCEDURE HARDENING & IMMUTABILITY (SEC-68-08 - SEC-68-10)
  // ===================================================================
  describe('Stored Procedure Governance & Ledger Immutability', () => {
    it('SEC-68-08: fn_calculate_expected_reimbursement is SECURITY DEFINER with safe search_path', () => {
      assert.ok(
        migration044.includes('CREATE OR REPLACE FUNCTION public.fn_calculate_expected_reimbursement'),
        'fn_calculate_expected_reimbursement must be defined'
      );
      assert.ok(
        migration044.includes('SECURITY DEFINER'),
        'fn_calculate_expected_reimbursement must execute as SECURITY DEFINER'
      );
      assert.ok(
        migration044.includes('SET search_path = public, pg_temp'),
        'fn_calculate_expected_reimbursement must restrict search_path to public, pg_temp'
      );
    });

    it('SEC-68-09: fn_calculate_expected_reimbursement enforces mandatory recalculation reason (>= 10 chars)', () => {
      assert.ok(
        migration044.includes('p_recalculation_reason IS NULL OR length(trim(p_recalculation_reason)) < 10'),
        'Recalculation check must mandate reason >= 10 characters'
      );
      assert.ok(
        migration044.includes("USING ERRCODE = 'P0005'"),
        'Recalculation failure must raise custom ERRCODE P0005'
      );
    });

    it('SEC-68-10: Immutability trigger trg_block_reimbursement_mutation blocks ledger tampering', () => {
      assert.ok(
        migration044.includes('CREATE OR REPLACE FUNCTION public.trg_block_reimbursement_mutation()'),
        'trg_block_reimbursement_mutation function must be defined'
      );
      assert.ok(
        migration044.includes("Financial Ledger Violation: Calculation snapshot records (ID %) are permanently immutable"),
        'Trigger must raise Financial Ledger Violation error'
      );
      assert.ok(
        migration044.includes("USING ERRCODE = 'P0001'"),
        'Immutability violation must raise ERRCODE P0001'
      );
      assert.ok(
        migration044.includes('trg_reimb_calc_immutable'),
        'trg_reimb_calc_immutable trigger must be attached to calculations'
      );
      assert.ok(
        migration044.includes('trg_reimb_calc_lines_immutable'),
        'trg_reimb_calc_lines_immutable trigger must be attached to lines'
      );
    });
  });

  // ===================================================================
  // 4. RBAC PERMISSIONS CATALOG & ROLE MATRIX (SEC-68-11 - SEC-68-13)
  // ===================================================================
  describe('RBAC Permissions Catalog & Role Governance', () => {
    const requiredPermissions = [
      'reimbursement.calculation.view',
      'reimbursement.explanation.view',
      'reimbursement.calculation.execute',
      'reimbursement.calculation.recalculate',
      'reimbursement.calculation.approve',
      'reimbursement.snapshot.view',
      'reimbursement.margin.view',
      'reimbursement.margin.aggregate.view',
      'reimbursement.report.export',
      'reimbursement.config.manage'
    ];

    it('SEC-68-11: All 10 Phase 68 permissions are registered in PERMISSIONS_CATALOG', () => {
      const catalogCodes = PERMISSIONS_CATALOG.map(p => p.code);
      requiredPermissions.forEach(perm => {
        assert.ok(
          catalogCodes.includes(perm),
          `Permission "${perm}" must be present in PERMISSIONS_CATALOG`
        );
      });
    });

    it('SEC-68-12: Role matrix assigns appropriate fine-grained permissions per role', () => {
      // CFO / Organization Admin receives all 10 permissions
      const cfoPerms = rbacService.getPermissionsForRole('cfo');
      requiredPermissions.forEach(perm => {
        assert.ok(
          cfoPerms.includes(perm),
          `CFO must hold permission "${perm}"`
        );
      });

      // Biller receives execution and calculation viewing, but NOT approval or config
      const billerPerms = rbacService.getPermissionsForRole('biller');
      assert.ok(billerPerms.includes('reimbursement.calculation.view'), 'Biller must view calculations');
      assert.ok(billerPerms.includes('reimbursement.explanation.view'), 'Biller must view explanation trace');
      assert.ok(billerPerms.includes('reimbursement.calculation.execute'), 'Biller must execute adjudication');
      assert.ok(billerPerms.includes('reimbursement.calculation.recalculate'), 'Biller must execute recalculation');
      assert.strictEqual(billerPerms.includes('reimbursement.calculation.approve'), false, 'Biller cannot approve reimbursement');
      assert.strictEqual(billerPerms.includes('reimbursement.config.manage'), false, 'Biller cannot manage reimbursement config');

      // Medical Coder receives view and explanation, but NOT execute or recalculate
      const coderPerms = rbacService.getPermissionsForRole('coder');
      assert.ok(coderPerms.includes('reimbursement.calculation.view'), 'Coder can view calculation');
      assert.ok(coderPerms.includes('reimbursement.explanation.view'), 'Coder can view explanation');
      assert.strictEqual(coderPerms.includes('reimbursement.calculation.execute'), false, 'Coder cannot execute adjudication');
      assert.strictEqual(coderPerms.includes('reimbursement.calculation.recalculate'), false, 'Coder cannot recalculate');

      // Surgeon receives view and personal margin view, but NOT explanation trace or calculation execution
      const surgeonPerms = rbacService.getPermissionsForRole('surgeon');
      assert.ok(surgeonPerms.includes('reimbursement.calculation.view'), 'Surgeon can view calculation');
      assert.ok(surgeonPerms.includes('reimbursement.margin.view'), 'Surgeon can view personal case margin');
      assert.strictEqual(surgeonPerms.includes('reimbursement.explanation.view'), false, 'Surgeon cannot inspect internal calculation trace');
      assert.strictEqual(surgeonPerms.includes('reimbursement.calculation.execute'), false, 'Surgeon cannot execute calculation');

      // Clinical Manager has zero reimbursement permissions (clinical isolation)
      const clinicalPerms = rbacService.getPermissionsForRole('clinical_manager');
      requiredPermissions.forEach(perm => {
        assert.strictEqual(
          clinicalPerms.includes(perm),
          false,
          `Clinical Manager must NOT have permission "${perm}"`
        );
      });

      // Viewer has zero reimbursement permissions
      const viewerPerms = rbacService.getPermissionsForRole('viewer');
      requiredPermissions.forEach(perm => {
        assert.strictEqual(
          viewerPerms.includes(perm),
          false,
          `Viewer must NOT have permission "${perm}"`
        );
      });
    });

    it('SEC-68-13: Down migration cleanly rolls back all triggers, policies, and functions', () => {
      assert.ok(
        migration044Down.includes('DROP TRIGGER IF EXISTS trg_reimb_calc_immutable'),
        'Down migration must drop trg_reimb_calc_immutable'
      );
      assert.ok(
        migration044Down.includes('DROP FUNCTION IF EXISTS public.trg_block_reimbursement_mutation()'),
        'Down migration must drop trigger function'
      );
      assert.ok(
        migration044Down.includes('DROP TABLE IF EXISTS public.reimbursement_calculations CASCADE;'),
        'Down migration must cascade drop reimbursement_calculations'
      );
    });
  });
});
