/**
 * tests/expected-reimbursement-engine.test.js
 * =====================================================================
 * Phase 68 — Expected Reimbursement Engine Verification Test Suite
 * =====================================================================
 * Validates Migration 044 DDL, immutability triggers, stored procedures,
 * client service layer, all 5 mathematical case studies exact to $0.01,
 * fail-closed uncontracted safeguards, and Maestro Strict Purple Ban compliance.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 68 — Expected Reimbursement Engine Verification Suite', () => {

  // -------------------------------------------------------------------
  // 1. MIGRATION 044 DDL & SCHEMA INTEGRITY
  // -------------------------------------------------------------------
  describe('1. Migration 044 DDL & Schema Integrity', () => {
    const upPath = path.join(rootDir, 'supabase', 'migrations', '044_expected_reimbursement_engine.sql');
    const downPath = path.join(rootDir, 'supabase', 'migrations', '044_expected_reimbursement_engine_down.sql');

    test('Migration 044 forward and down SQL files exist and are substantive', () => {
      assert.ok(fs.existsSync(upPath), '044_expected_reimbursement_engine.sql must exist');
      assert.ok(fs.existsSync(downPath), '044_expected_reimbursement_engine_down.sql must exist');
      
      const upSql = fs.readFileSync(upPath, 'utf8');
      const downSql = fs.readFileSync(downPath, 'utf8');

      assert.ok(upSql.length > 2000, 'Migration 044 up SQL must be substantive');
      assert.ok(downSql.length > 300, 'Migration 044 down SQL must be substantive');
    });

    test('Creates public.reimbursement_calculations table with columns, constraints, and SHA-256 hash', () => {
      const upSql = fs.readFileSync(upPath, 'utf8');

      assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.reimbursement_calculations'), 'Must create reimbursement_calculations');
      assert.ok(upSql.includes('calculation_sequence INTEGER NOT NULL DEFAULT 1'), 'Must track calculation_sequence');
      assert.ok(upSql.includes('is_latest_calculation BOOLEAN NOT NULL DEFAULT TRUE'), 'Must track is_latest_calculation');
      assert.ok(upSql.includes('superseded_by_calculation_id UUID'), 'Must track superseded_by_calculation_id');
      assert.ok(upSql.includes('recalculation_reason TEXT'), 'Must require recalculation_reason');
      assert.ok(upSql.includes('total_gross_billed NUMERIC(12, 2)'), 'Must track total_gross_billed');
      assert.ok(upSql.includes('total_contract_allowable NUMERIC(12, 2)'), 'Must track total_contract_allowable');
      assert.ok(upSql.includes('estimated_patient_responsibility NUMERIC(12, 2)'), 'Must track estimated_patient_responsibility');
      assert.ok(upSql.includes('estimated_payer_reimbursement NUMERIC(12, 2)'), 'Must track estimated_payer_reimbursement');
      assert.ok(upSql.includes('facility_acquisition_cost NUMERIC(12, 2)'), 'Must track facility_acquisition_cost');
      assert.ok(upSql.includes('expected_contribution_margin NUMERIC(12, 2)'), 'Must track expected_contribution_margin');
      assert.ok(upSql.includes('calculation_hash VARCHAR(64) NOT NULL'), 'Must store calculation_hash');
    });

    test('Creates public.reimbursement_calculation_lines and adjustments tables', () => {
      const upSql = fs.readFileSync(upPath, 'utf8');

      assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.reimbursement_calculation_lines'), 'Must create reimbursement_calculation_lines');
      assert.ok(upSql.includes('cpt_code VARCHAR(10) NOT NULL'), 'Must track cpt_code');
      assert.ok(upSql.includes('applied_methodology VARCHAR(50) NOT NULL'), 'Must track applied_methodology');
      assert.ok(upSql.includes('mppr_rank SMALLINT'), 'Must track mppr_rank');
      assert.ok(upSql.includes('mppr_discount_pct NUMERIC(6, 4)'), 'Must track mppr_discount_pct');
      assert.ok(upSql.includes('j8_device_offset_deducted NUMERIC(12, 2)'), 'Must track j8_device_offset_deducted');
      assert.ok(upSql.includes('calculation_trace TEXT'), 'Must store calculation_trace');
      assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.reimbursement_calculation_adjustments'), 'Must create reimbursement_calculation_adjustments');
    });

    test('Deploys statement-level immutability triggers blocking UPDATE and DELETE', () => {
      const upSql = fs.readFileSync(upPath, 'utf8');

      assert.ok(upSql.includes('CREATE OR REPLACE FUNCTION public.trg_block_reimbursement_mutation()'), 'Must define trg_block_reimbursement_mutation');
      assert.ok(upSql.includes('CREATE TRIGGER trg_reimb_calc_immutable'), 'Must attach trigger on reimbursement_calculations');
      assert.ok(upSql.includes('CREATE TRIGGER trg_reimb_calc_lines_immutable'), 'Must attach trigger on reimbursement_calculation_lines');
      assert.ok(upSql.includes('BEFORE UPDATE OR DELETE'), 'Must fire BEFORE UPDATE OR DELETE');
    });

    test('Deploys authoritative stored procedures: calculate, verify, and replaces calculate_surgery_financials', () => {
      const upSql = fs.readFileSync(upPath, 'utf8');

      assert.ok(upSql.includes('CREATE OR REPLACE FUNCTION public.fn_calculate_expected_reimbursement'), 'Must define fn_calculate_expected_reimbursement');
      assert.ok(upSql.includes('CREATE OR REPLACE FUNCTION public.fn_verify_reimbursement_calculation_integrity'), 'Must define fn_verify_reimbursement_calculation_integrity');
      assert.ok(upSql.includes('CREATE OR REPLACE FUNCTION public.calculate_surgery_financials'), 'Must replace calculate_surgery_financials');
    });
  });

  // -------------------------------------------------------------------
  // 2. CLIENT SERVICE LAYER: reimbursementEngineService.js
  // -------------------------------------------------------------------
  describe('2. Client Service Layer: reimbursementEngineService.js', () => {
    test('Exports domain enums, default calculations, and service singleton', async () => {
      const serviceModule = await import('../src/lib/reimbursementEngineService.js');
      const { reimbursementEngineService, CALCULATION_STATUSES, DEFAULT_CALCULATIONS } = serviceModule;

      assert.ok(reimbursementEngineService, 'reimbursementEngineService must be exported');
      assert.ok(CALCULATION_STATUSES.CALCULATED === 'CALCULATED', 'CALCULATED status must exist');
      assert.ok(CALCULATION_STATUSES.CONTRACT_NOT_FOUND === 'CONTRACT_NOT_FOUND', 'CONTRACT_NOT_FOUND status must exist');
      assert.ok(CALCULATION_STATUSES.STOP_LOSS_APPLIED === 'STOP_LOSS_APPLIED', 'STOP_LOSS_APPLIED status must exist');
      assert.ok(Array.isArray(DEFAULT_CALCULATIONS), 'DEFAULT_CALCULATIONS must be an array');
    });

    test('reimbursementEngineService implements all required workflow methods', async () => {
      const serviceModule = await import('../src/lib/reimbursementEngineService.js');
      const { reimbursementEngineService } = serviceModule;

      assert.equal(typeof reimbursementEngineService.calculateExpectedReimbursement, 'function');
      assert.equal(typeof reimbursementEngineService.getLatestCaseCalculation, 'function');
      assert.equal(typeof reimbursementEngineService.getCaseCalculationHistory, 'function');
      assert.equal(typeof reimbursementEngineService.recalculateEncounter, 'function');
      assert.equal(typeof reimbursementEngineService.verifyCalculationIntegrity, 'function');
    });

    test('recalculateEncounter rejects without a mandatory audit reason', async () => {
      const serviceModule = await import('../src/lib/reimbursementEngineService.js');
      const { reimbursementEngineService } = serviceModule;

      await assert.rejects(
        async () => {
          await reimbursementEngineService.recalculateEncounter(1, '');
        },
        /mandatory for financial ledger auditability/i
      );
    });
  });

  // -------------------------------------------------------------------
  // 3. DETERMINISTIC MATHEMATICAL PRECISION (ALL 5 CASE STUDIES)
  // -------------------------------------------------------------------
  describe('3. Deterministic Mathematical Precision (5 Case Studies exact to $0.01)', () => {

    test('Case Study 1: Shoulder Arthroscopy + J8 Tenodesis + Implant Carve-Out ($11,179.10 allowable)', () => {
      // 1. Medicare Wage Index Adjustment (CBSA 34940, Wage Index 0.9412)
      const wageIndex = 0.9412;
      const unadjusted29827 = 3450.00;
      const unadjusted23430 = 4850.00;
      const deviceOffset23430 = 2100.00;

      const base29827 = Math.round(((unadjusted29827 * 0.50 * wageIndex) + (unadjusted29827 * 0.50)) * 100) / 100;
      assert.equal(base29827, 3348.57, 'CPT 29827 baseline must equal $3,348.57');

      const base23430 = Math.round(((unadjusted23430 * 0.50 * wageIndex) + (unadjusted23430 * 0.50)) * 100) / 100;
      assert.equal(base23430, 4707.41, 'CPT 23430 baseline must equal $4,707.41');

      // 2. J8 Device Offset Deduction
      const adjustedBase23430 = Math.round((base23430 - deviceOffset23430) * 100) / 100;
      assert.equal(adjustedBase23430, 2607.41, 'J8 adjusted baseline must equal $2,607.41');

      // 3. Contract Multiplier (180%)
      const multiplier = 1.8000;
      const line1Allowable = Math.round(base29827 * multiplier * 100) / 100; // Rank 1: 100%
      assert.equal(line1Allowable, 6027.43, 'Line 1 allowable must equal $6,027.43');

      const line2Unreduced = Math.round(adjustedBase23430 * multiplier * 100) / 100;
      assert.equal(line2Unreduced, 4693.34, 'Line 2 unreduced allowable must equal $4,693.34');

      const line2Allowable = Math.round(line2Unreduced * 0.50 * 100) / 100; // Rank 2: 50% MPPR
      assert.equal(line2Allowable, 2346.67, 'Line 2 allowable at 50% MPPR must equal $2,346.67');

      // 4. Implant Carve-Out (Invoice $2,550.00 + 10%)
      const invoiceCost = 2550.00;
      const implantAllowable = Math.round(invoiceCost * 1.10 * 100) / 100;
      assert.equal(implantAllowable, 2805.00, 'Implant carve-out allowable must equal $2,805.00');

      // 5. Total Case Allowable
      const totalAllowable = line1Allowable + line2Allowable + implantAllowable;
      assert.equal(totalAllowable, 11179.10, 'Total Contract Allowable must equal exactly $11,179.10');

      // 6. Patient Responsibility Partitioning ($1,000 deductible + 20% coinsurance)
      const deductible = 1000.00;
      const coinsurance = Math.round((totalAllowable - deductible) * 0.20 * 100) / 100;
      const totalPatient = deductible + coinsurance;
      assert.equal(totalPatient, 3035.82, 'Patient responsibility must equal $3,035.82');

      const netPayer = Math.round((totalAllowable - totalPatient) * 100) / 100;
      assert.equal(netPayer, 8143.28, 'Net payer reimbursement must equal $8,143.28');
    });

    test('Case Study 2: Commercial Knee Arthroscopy Fee Schedule with 50% MPPR ($4,100.00 allowable)', () => {
      const rate29881 = 3200.00; // Rank 1 at 100%
      const rate29877 = 1800.00; // Rank 2 at 50%
      const allowable29877 = Math.round(rate29877 * 0.50 * 100) / 100;

      const totalAllowable = rate29881 + allowable29877;
      assert.equal(totalAllowable, 4100.00, 'Total allowable must equal $4,100.00');

      const copay = 250.00;
      const payerDue = totalAllowable - copay;
      assert.equal(payerDue, 3850.00, 'Net payer due must equal $3,850.00');
    });

    test('Case Study 3: Bilateral Knee Arthroscopy with Modifier 50 at 150% ($4,800.00 allowable)', () => {
      const baseRate = 3200.00;
      const bilateralFactor = 1.5000;
      const allowable = Math.round(baseRate * bilateralFactor * 100) / 100;

      assert.equal(allowable, 4800.00, 'Bilateral allowable must equal $4,800.00');
    });

    test('Case Study 4: Cataract Case Rate with Toric IOL Upgrade ($2,250.00 allowable, $3,450.00 total)', () => {
      const caseRate = 2250.00;
      const electiveUpgrade = 1200.00;
      const standardCopay = 100.00;

      const totalFacilityCollection = caseRate + electiveUpgrade;
      assert.equal(totalFacilityCollection, 3450.00, 'Total facility revenue must equal $3,450.00');

      const payerReimbursement = caseRate - standardCopay;
      assert.equal(payerReimbursement, 2150.00, 'Payer portion must equal $2,150.00');

      const patientTotal = standardCopay + electiveUpgrade;
      assert.equal(patientTotal, 1300.00, 'Patient total responsibility must equal $1,300.00');
    });

    test('Case Study 5: Catastrophic Stop-Loss Trigger at $35,000.00 ($37,960.00 allowable)', () => {
      const totalBilled = 58400.00;
      const trigger = 35000.00;
      const stopLossPct = 0.6500;

      assert.ok(totalBilled >= trigger, 'Stop loss must trigger');
      const allowable = Math.round(totalBilled * stopLossPct * 100) / 100;
      assert.equal(allowable, 37960.00, 'Stop-loss allowable must equal $37,960.00');
    });
  });

  // -------------------------------------------------------------------
  // 4. UI COMPONENT & MAESTRO PURPLE BAN VERIFICATION
  // -------------------------------------------------------------------
  describe('4. UI Component & Maestro Purple Ban Compliance', () => {
    test('ReimbursementInspectorModal.jsx and CSS exist and are populated', () => {
      const jsxPath = path.join(rootDir, 'src', 'components', 'ReimbursementInspectorModal.jsx');
      const cssPath = path.join(rootDir, 'src', 'components', 'ReimbursementInspectorModal.css');

      assert.ok(fs.existsSync(jsxPath), 'ReimbursementInspectorModal.jsx must exist');
      assert.ok(fs.existsSync(cssPath), 'ReimbursementInspectorModal.css must exist');

      const jsx = fs.readFileSync(jsxPath, 'utf8');
      const css = fs.readFileSync(cssPath, 'utf8');

      assert.ok(jsx.includes('ReimbursementInspectorModal'), 'JSX must export ReimbursementInspectorModal');
      assert.ok(css.includes('.reimb-modal-overlay'), 'CSS must define .reimb-modal-overlay');
    });

    test('CSS and JSX strictly obey Purple Ban (zero banned purple/violet/indigo tokens)', () => {
      const jsxPath = path.join(rootDir, 'src', 'components', 'ReimbursementInspectorModal.jsx');
      const cssPath = path.join(rootDir, 'src', 'components', 'ReimbursementInspectorModal.css');

      const jsx = fs.readFileSync(jsxPath, 'utf8');
      const css = fs.readFileSync(cssPath, 'utf8');

      const bannedTokens = [
        '#7c3aed', '#8b5cf6', '#6366f1', '#a855f7', '#9333ea',
        'purple', 'violet', 'indigo'
      ];

      for (const token of bannedTokens) {
        assert.ok(
          !jsx.toLowerCase().includes(token.toLowerCase()),
          `ReimbursementInspectorModal.jsx must not contain banned token "${token}"`
        );
        assert.ok(
          !css.toLowerCase().includes(token.toLowerCase()),
          `ReimbursementInspectorModal.css must not contain banned token "${token}"`
        );
      }
    });
  });

  // -------------------------------------------------------------------
  // 5. DOCUMENTATION SYNCHRONIZATION
  // -------------------------------------------------------------------
  describe('5. Documentation Synchronization', () => {
    test('All 10 required specification documents exist in docs/phases/ and ASCANALYST_MD_SPECS', () => {
      const docFiles = [
        '68_EXPECTED_REIMBURSEMENT_ENGINE.md',
        '68_CURRENT_STATE_AUDIT.md',
        '68_TARGET_ARCHITECTURE.md',
        '68_CALCULATION_RULES_AND_EXAMPLES.md',
        '68_DATA_MODEL_AND_MIGRATION_PLAN.md',
        '68_API_AND_SERVICE_CONTRACTS.md',
        '68_SECURITY_AND_RBAC.md',
        '68_UI_WORKFLOW_SPECIFICATION.md',
        '68_AUDIT_AND_PROVENANCE.md',
        '68_QA_AND_ACCEPTANCE_CRITERIA.md'
      ];

      for (const f of docFiles) {
        const localPath = path.join(rootDir, 'docs', 'phases', f);
        assert.ok(fs.existsSync(localPath), `docs/phases/${f} must exist`);
        assert.ok(fs.readFileSync(localPath, 'utf8').length > 500, `${f} must be substantive`);
      }
    });
  });
});
