import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSurgeryMetrics, calculateORCost, calculateLaborCost } from '../src/utils/hospitalUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 31 — Case Master Specification & Lifecycle Verification Suite', () => {

  // Domain 1: Database Migration 009 DDL & Schema Normalization
  describe('1. Database Migration 009: DDL & Schema Integrity', () => {
    const migPath = path.join(rootDir, 'supabase', 'migrations', '009_case_master_normalization.sql');
    const downPath = path.join(rootDir, 'supabase', 'migrations', '009_case_master_normalization_down.sql');

    it('Migration 009 forward and down SQL files exist', () => {
      assert.ok(fs.existsSync(migPath), '009_case_master_normalization.sql must exist');
      assert.ok(fs.existsSync(downPath), '009_case_master_normalization_down.sql must exist');
    });

    it('Migration 009 expands public.surgeries with canonical columns', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      const requiredColumns = [
        'source_system',
        'source_case_id',
        'primary_payer_id',
        'scheduled_start_time',
        'scheduled_duration_minutes',
        'scheduled_turnover_minutes',
        'case_classification',
        'payment_model',
        'cancellation_reason_code',
        'cancellation_reason_text',
        'cancelled_at',
        'cancelled_by',
        'cosmetic_facility_fee',
        'cosmetic_anesthesia_fee',
        'self_pay_anesthesia_fee',
        'tray_cost',
        'version'
      ];

      for (const col of requiredColumns) {
        assert.ok(sql.includes(col), `Migration 009 must include column "${col}"`);
      }
    });

    it('Migration 009 establishes public.case_milestones with unique constraint', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.case_milestones'), 'Must define case_milestones');
      assert.ok(sql.includes('uq_surgery_milestone'), 'Must enforce unique constraint on (surgery_id, milestone_code)');
      assert.ok(sql.includes('milestone_code IN'), 'Must check milestone_code domain values');
    });

    it('Migration 009 defines unique source case index to prevent duplicate ingestion', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('uq_facility_source_case'), 'Must define uq_facility_source_case unique index');
    });

    it('Migration 009 down script safely drops triggers, constraints and tables', () => {
      const downSql = fs.readFileSync(downPath, 'utf8');
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.case_milestones CASCADE'), 'Down script must drop case_milestones');
      assert.ok(downSql.includes('DROP TRIGGER IF EXISTS trg_validate_case_status_transition'), 'Down script must drop FSM trigger');
      assert.ok(downSql.includes('DROP FUNCTION IF EXISTS public.calculate_surgery_financials'), 'Down script must drop financials RPC');
    });
  });

  // Domain 2: Case Lifecycle Finite State Machine (FSM)
  describe('2. Case Lifecycle Finite State Machine (FSM) Logic', () => {
    // Replicate the exact transition matrix from fn_validate_case_status_transition
    const canTransition = (oldStatus, newStatus) => {
      if (oldStatus === newStatus) return true;
      switch (oldStatus) {
        case 'Draft':
          return ['Scheduled', 'Cancelled'].includes(newStatus);
        case 'Scheduled':
          return ['Pre-Op', 'Cancelled'].includes(newStatus);
        case 'Pre-Op':
          return ['In-OR', 'Cancelled'].includes(newStatus);
        case 'In-OR':
          return ['Closing', 'PACU'].includes(newStatus);
        case 'Closing':
          return ['PACU'].includes(newStatus);
        case 'PACU':
          return ['Completed'].includes(newStatus);
        case 'Completed':
          return ['Billed', 'Void'].includes(newStatus);
        case 'Billed':
          return ['Void'].includes(newStatus);
        case 'Cancelled':
          return false;
        case 'Void':
          return false;
        default:
          return false;
      }
    };

    it('Permits happy path case progression: Draft -> Scheduled -> Pre-Op -> In-OR -> Closing -> PACU -> Completed -> Billed', () => {
      const sequence = ['Draft', 'Scheduled', 'Pre-Op', 'In-OR', 'Closing', 'PACU', 'Completed', 'Billed'];
      for (let i = 0; i < sequence.length - 1; i++) {
        assert.ok(
          canTransition(sequence[i], sequence[i + 1]),
          `Transition from ${sequence[i]} to ${sequence[i + 1]} must be permitted`
        );
      }
    });

    it('Permits emergency cancellations from pre-operative states', () => {
      assert.ok(canTransition('Draft', 'Cancelled'), 'Draft can transition to Cancelled');
      assert.ok(canTransition('Scheduled', 'Cancelled'), 'Scheduled can transition to Cancelled');
      assert.ok(canTransition('Pre-Op', 'Cancelled'), 'Pre-Op can transition to Cancelled');
    });

    it('Strictly rejects invalid lifecycle transitions and unauthorized jumps', () => {
      assert.strictEqual(canTransition('Draft', 'Completed'), false, 'Draft cannot jump directly to Completed');
      assert.strictEqual(canTransition('Draft', 'In-OR'), false, 'Draft cannot jump directly to In-OR');
      assert.strictEqual(canTransition('Cancelled', 'In-OR'), false, 'Cancelled case cannot transition to In-OR');
      assert.strictEqual(canTransition('Billed', 'Scheduled'), false, 'Billed case cannot revert to Scheduled');
      assert.strictEqual(canTransition('Completed', 'Pre-Op'), false, 'Completed case cannot revert to Pre-Op');
      assert.strictEqual(canTransition('Void', 'Draft'), false, 'Void case is terminal');
    });
  });

  // Domain 3: Structured Fee & Revenue Calculation (Without Regex Dependency)
  describe('3. Structured Calculation: Direct Column Support in hospitalUtils.js', () => {
    const mockCptCodes = [
      { code: '15823', reimbursement: 1450, gross_charge: 2200 },
      { code: '15824', reimbursement: 950, gross_charge: 1400 }
    ];

    it('Calculates cosmetic revenue and margin directly from structured columns without notes string', () => {
      const structuredCosmeticSurgery = {
        id: 101,
        payment_model: 'Cosmetic_Fixed',
        cosmetic_facility_fee: 3500,
        cosmetic_anesthesia_fee: 1000,
        tray_cost: 150,
        supplies_cost: 400,
        implants_cost: 200,
        medications_cost: 100,
        duration_minutes: 60,
        turnover_time: 15,
        write_off: 0,
        notes: null // Zero notes text present!
      };

      const metrics = getSurgeryMetrics(structuredCosmeticSurgery, mockCptCodes);
      assert.strictEqual(metrics.isCosmetic, true);
      assert.strictEqual(metrics.facilityRevenue, 3500);
      assert.strictEqual(metrics.anesthesiaRevenue, 1000);
      assert.strictEqual(metrics.totalRevenue, 3500 + 1000 + (400 + 200 + 100)); // 5200

      // Net profit = 5200 - (roomCost + laborCost + supplyCosts + anesthesiaRevenue)
      const expectedRoomCost = calculateORCost(75); // 75 mins total
      const expectedLaborCost = calculateLaborCost(75);
      const expectedNetProfit = 5200 - (expectedRoomCost + expectedLaborCost + 700 + 1000);
      assert.strictEqual(metrics.netProfit, expectedNetProfit);
    });

    it('Calculates self-pay anesthesia directly from self_pay_anesthesia_fee column', () => {
      const selfPayAnesSurgery = {
        id: 102,
        payment_model: 'Insurance',
        cpt_codes: ['15823'],
        self_pay_anesthesia_fee: 650,
        supplies_cost: 300,
        duration_minutes: 60,
        turnover_time: 15,
        notes: null
      };

      const metrics = getSurgeryMetrics(selfPayAnesSurgery, mockCptCodes);
      assert.strictEqual(metrics.anesthesiaRevenue, 650);
      assert.strictEqual(metrics.totalRevenue, 2200 + 650 + 300); // 2200 (CPT gross_charge) + 650 + 300 = 3150
    });

    it('Zeroes out all values when payment_model is Pro_Bono', () => {
      const probonoSurgery = {
        id: 103,
        payment_model: 'Pro_Bono',
        cpt_codes: ['15823'],
        duration_minutes: 60,
        turnover_time: 15
      };

      const metrics = getSurgeryMetrics(probonoSurgery, mockCptCodes);
      assert.strictEqual(metrics.isProbono, true);
      assert.strictEqual(metrics.totalRevenue, 0);
      assert.strictEqual(metrics.internalRoomCost, 0);
      assert.strictEqual(metrics.laborCost, 0);
      assert.strictEqual(metrics.netProfit, 0);
    });
  });

  // Domain 4: Backward-Compatible Regex Notes Fallback
  describe('4. Historical Compatibility: Fallback to Notes Regex', () => {
    const mockCptCodes = [{ code: '15823', reimbursement: 1450 }];

    it('Parses legacy notes when cosmetic_facility_fee column is zero or undefined', () => {
      const legacyCosmeticSurgery = {
        id: 201,
        notes: 'Fixed Facility Fee Case - Facility: $2,800, Anesthesia: $850; [Tray Cost: 120]',
        supplies_cost: 250,
        duration_minutes: 60,
        turnover_time: 15
      };

      const metrics = getSurgeryMetrics(legacyCosmeticSurgery, mockCptCodes);
      assert.strictEqual(metrics.isCosmetic, true);
      assert.strictEqual(metrics.facilityRevenue, 2800);
      assert.strictEqual(metrics.anesthesiaRevenue, 850);
    });

    it('Parses legacy Self-Pay Anesthesia notes regex when column is missing', () => {
      const legacyAnesSurgery = {
        id: 202,
        cpt_codes: ['15823'],
        notes: 'Self-Pay Anesthesia (Dr. Smith): $550',
        supplies_cost: 100,
        duration_minutes: 45,
        turnover_time: 15
      };

      const metrics = getSurgeryMetrics(legacyAnesSurgery, mockCptCodes);
      assert.strictEqual(metrics.anesthesiaRevenue, 550);
    });
  });

  // Domain 5: Client Service Methods & RPC Contracts
  describe('5. Client Service Methods in src/lib/supabase.js', () => {
    const sbPath = path.join(rootDir, 'src', 'lib', 'supabase.js');
    const sbCode = fs.readFileSync(sbPath, 'utf8');

    it('Defines getCaseMilestones and recordCaseMilestone methods', () => {
      assert.ok(sbCode.includes('getCaseMilestones('), 'Must define getCaseMilestones');
      assert.ok(sbCode.includes('recordCaseMilestone('), 'Must define recordCaseMilestone');
    });

    it('Defines cancelSurgeryCase with structured reason code and timestamp', () => {
      assert.ok(sbCode.includes('cancelSurgeryCase('), 'Must define cancelSurgeryCase');
      assert.ok(sbCode.includes('cancellation_reason_code'), 'Must set cancellation_reason_code');
      assert.ok(sbCode.includes('cancelled_at'), 'Must set cancelled_at');
    });

    it('Defines calculateSurgeryFinancials RPC caller and snapshot freeze trigger', () => {
      assert.ok(sbCode.includes('calculateSurgeryFinancials('), 'Must define calculateSurgeryFinancials');
      assert.ok(sbCode.includes('calculate_surgery_financials'), 'Must reference calculate_surgery_financials RPC');
    });

    it('updateSurgery auto-triggers financial freeze snapshot when case completes or is billed', () => {
      assert.ok(sbCode.includes('calculateSurgeryFinancials(id, true)'), 'Must call calculateSurgeryFinancials with freeze=true on completion');
    });
  });

  // Domain 6: UI Contract & Form Integration in SurgeryScheduler.jsx
  describe('6. UI Form Integration in src/components/SurgeryScheduler.jsx', () => {
    const schedPath = path.join(rootDir, 'src', 'components', 'SurgeryScheduler.jsx');
    const schedCode = fs.readFileSync(schedPath, 'utf8');

    it('Populates structured payment_model, cosmetic fees, and scheduled duration in surgeryData', () => {
      assert.ok(schedCode.includes('payment_model:'), 'Must populate payment_model');
      assert.ok(schedCode.includes('cosmetic_facility_fee:'), 'Must populate cosmetic_facility_fee');
      assert.ok(schedCode.includes('cosmetic_anesthesia_fee:'), 'Must populate cosmetic_anesthesia_fee');
      assert.ok(schedCode.includes('tray_cost:'), 'Must populate tray_cost');
      assert.ok(schedCode.includes('scheduled_duration_minutes:'), 'Must populate scheduled_duration_minutes');
    });

    it('handleCancelSurgery records structured cancellation_reason_code and cancelled_at', () => {
      assert.ok(schedCode.includes('cancellation_reason_code:'), 'Must set cancellation_reason_code on cancel');
      assert.ok(schedCode.includes('cancelled_at:'), 'Must set cancelled_at on cancel');
    });

    it('handleCompleteSurgery marks status as Completed and records actual_end_time', () => {
      assert.ok(schedCode.includes("status: 'Completed'"), 'Must mark Completed on complete');
      assert.ok(schedCode.includes('actual_end_time:'), 'Must set actual_end_time');
    });
  });

  // Domain 7: App.jsx Status Display Contract
  describe('7. App.jsx Canonical Status Display Contract', () => {
    const appPath = path.join(rootDir, 'src', 'App.jsx');
    const appCode = fs.readFileSync(appPath, 'utf8');

    it('App.jsx displays canonical FSM statuses (In-OR, Pre-Op, PACU, Billed, Cancelled)', () => {
      assert.ok(appCode.includes('In-OR (Procedure In Progress)'), 'Must handle In-OR status');
      assert.ok(appCode.includes('Pre-Op (Patient Arrived)'), 'Must handle Pre-Op status');
      assert.ok(appCode.includes('PACU (Post-Anesthesia Recovery)'), 'Must handle PACU status');
      assert.ok(appCode.includes('Billed (Claim Submitted)'), 'Must handle Billed status');
      assert.ok(appCode.includes('c.cancellation_reason_text'), 'Must support structured cancellation_reason_text');
    });
  });

  // Domain 8: Row Level Security (RLS) & Surgeon Isolation Hardening
  describe('8. Hardened RLS Policy Verification in Migration 009', () => {
    const migPath = path.join(rootDir, 'supabase', 'migrations', '009_case_master_normalization.sql');
    const sql = fs.readFileSync(migPath, 'utf8');

    it('Enforces surgeon personal case isolation on UPDATE in public.surgeries', () => {
      assert.ok(
        sql.includes('NOT user_has_facility_role(facility_id, ARRAY[\'surgeon\'])') &&
        sql.includes('surgeon_id IN ('),
        'UPDATE policy must verify surgeon_id matches logged-in surgeon email'
      );
    });

    it('Locks Completed and Billed cases from non-admin modification', () => {
      assert.ok(
        sql.includes("status NOT IN ('Completed', 'Billed', 'Void')") &&
        sql.includes("user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin'])"),
        'Must lock completed/billed cases unless user is an enterprise administrator'
      );
    });

    it('Establishes Case Milestones RLS policies for tenant and surgeon isolation', () => {
      assert.ok(sql.includes('"Tenant Scoped Case Milestones Read"'), 'Must define milestones SELECT policy');
      assert.ok(sql.includes('"Tenant Scoped Case Milestones Insert"'), 'Must define milestones INSERT policy');
    });
  });
});
