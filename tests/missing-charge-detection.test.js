import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import missingChargeService, {
  CHARGE_CATEGORIES,
  MISSING_CHARGE_STATUSES,
  EVIDENCE_SOURCES,
  BASELINE_MISSING_CHARGES,
  calculateEstimatedNetRecovery,
  calculatePriorityScore,
  getMissingChargeSummaryMetrics,
  getCategoryBreakdown
} from '../src/lib/missingChargeService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 92 — Missing Charge Detection Engine Test Suite', () => {

  describe('1. Charge Categories, Lifecycle Statuses & Evidence Sources', () => {
    test('should define all 6 missing charge categories with metadata', () => {
      const categories = Object.keys(CHARGE_CATEGORIES);
      assert.strictEqual(categories.length, 6, 'Must define 6 charge categories');
      assert.ok(categories.includes('SECONDARY_CPT'));
      assert.ok(categories.includes('IMPLANT_HARDWARE'));
      assert.ok(categories.includes('HIGH_COST_DRUG'));
      assert.ok(categories.includes('SURGICAL_SUPPLY'));
      assert.ok(categories.includes('ANESTHESIA_UNITS'));
      assert.ok(categories.includes('PATHOLOGY_SPECIMEN'));

      // Check required properties
      for (const cat of categories) {
        assert.ok(CHARGE_CATEGORIES[cat].id, `Category ${cat} must have id`);
        assert.ok(CHARGE_CATEGORIES[cat].label, `Category ${cat} must have label`);
        assert.ok(CHARGE_CATEGORIES[cat].description, `Category ${cat} must have description`);
      }
    });

    test('should define all 5 missing charge lifecycle statuses', () => {
      const statuses = Object.keys(MISSING_CHARGE_STATUSES);
      assert.strictEqual(statuses.length, 5, 'Must define 5 lifecycle statuses');
      assert.ok(statuses.includes('DETECTED'));
      assert.ok(statuses.includes('UNDER_AUDIT'));
      assert.ok(statuses.includes('CHARGE_CONFIRMED'));
      assert.ok(statuses.includes('CLAIM_AMENDED'));
      assert.ok(statuses.includes('DISMISSED_NOT_BILLABLE'));
    });

    test('should define all 6 clinical evidence sources', () => {
      const sources = Object.keys(EVIDENCE_SOURCES);
      assert.strictEqual(sources.length, 6, 'Must define 6 evidence sources');
      assert.ok(sources.includes('OPERATIVE_DICTATION'));
      assert.ok(sources.includes('OR_NURSING_LOG'));
      assert.ok(sources.includes('IMPLANT_USAGE_LOG'));
      assert.ok(sources.includes('MAR_PHARMACY'));
      assert.ok(sources.includes('ANESTHESIA_RECORD'));
      assert.ok(sources.includes('PATHOLOGY_REQUISITION'));
    });
  });

  describe('2. Deterministic Financial & Priority Calculations', () => {
    test('should calculate estimated net recovery deterministically', () => {
      // 2450.00 @ 45% = 1102.50
      assert.strictEqual(calculateEstimatedNetRecovery(2450.00, 45.00), 1102.50);

      // 3200.00 @ 65% = 2080.00
      assert.strictEqual(calculateEstimatedNetRecovery(3200.00, 65.00), 2080.00);

      // 850.00 @ 55% = 467.50
      assert.strictEqual(calculateEstimatedNetRecovery(850.00, 55.00), 467.50);

      // Edge cases: zero, negative, null
      assert.strictEqual(calculateEstimatedNetRecovery(0, 50.00), 0.00);
      assert.strictEqual(calculateEstimatedNetRecovery(1000.00, 0), 0.00);
      assert.strictEqual(calculateEstimatedNetRecovery(null, 50.00), 0.00);
    });

    test('should compute composite priority score accurately', () => {
      // High value ($2080 net), high confidence (98%), recent encounter (16 days)
      const scoreHigh = calculatePriorityScore(2080.00, 98.00, 16);
      // Dollar: (2080 / 5000) * 45 = 18.72
      // Conf: (98 / 100) * 35 = 34.30
      // Age: <= 30 days = 20.00
      // Total = 18.72 + 34.30 + 20.00 = 73.02
      assert.strictEqual(scoreHigh, 73.02);

      // Clamped to 100 max
      const scoreMax = calculatePriorityScore(25000.00, 100.00, 5);
      assert.strictEqual(scoreMax, 100.00);

      // Older encounter (>60 days) gets lower age weight (5.00)
      const scoreOld = calculatePriorityScore(500.00, 80.00, 75);
      // Dollar: (500 / 5000) * 45 = 4.50
      // Conf: (80 / 100) * 35 = 28.00
      // Age: > 60 days = 5.00
      // Total = 37.50
      assert.strictEqual(scoreOld, 37.50);
    });
  });

  describe('3. Summary Metrics & Category Diagnostics', () => {
    test('should aggregate portfolio metrics across baseline missing charges', () => {
      const summary = getMissingChargeSummaryMetrics(BASELINE_MISSING_CHARGES);

      assert.strictEqual(summary.totalAlerts, BASELINE_MISSING_CHARGES.length);
      assert.ok(summary.totalLostCharges > 5000.00, 'Total lost charges should be > $5,000');
      assert.ok(summary.estimatedNetRecovery > 2000.00, 'Estimated net recovery should be > $2,000');
      assert.ok(summary.confirmedPipeline > 0.00, 'Confirmed pipeline should be > 0');
      assert.ok(summary.realizedAmendedRecovery > 0.00, 'Realized amended recovery should be > 0');
      assert.ok(summary.dismissedLostCharges > 0.00, 'Dismissed charges should be tracked');
    });

    test('should aggregate category breakdown for all 6 categories', () => {
      const breakdown = getCategoryBreakdown(BASELINE_MISSING_CHARGES);

      assert.strictEqual(breakdown.length, 6, 'Must produce breakdown for all 6 categories');
      const totalAlerts = breakdown.reduce((sum, b) => sum + b.count, 0);
      assert.strictEqual(totalAlerts, BASELINE_MISSING_CHARGES.length);

      // Verify sorted by estimatedNetRecovery descending
      for (let i = 0; i < breakdown.length - 1; i++) {
        assert.ok(breakdown[i].estimatedNetRecovery >= breakdown[i + 1].estimatedNetRecovery);
      }
    });
  });

  describe('4. Lifecycle State Machine Operations', () => {
    test('should confirm missing charge and transition status to CHARGE_CONFIRMED', () => {
      const charges = missingChargeService.getCharges();
      const detected = charges.find(c => c.status === 'DETECTED');
      assert.ok(detected, 'Must have at least one detected charge alert');

      const confirmed = missingChargeService.confirmCharge(detected.id, {
        adjustedAmount: 3250.00,
        notes: 'Verified SwiveLock anchor with circulator'
      });

      assert.strictEqual(confirmed.status, 'CHARGE_CONFIRMED');
      assert.strictEqual(confirmed.estimated_lost_charge, 3250.00);
      assert.ok(confirmed.reviewed_at !== null);
      assert.ok(confirmed.resolution_notes.includes('SwiveLock'));
    });

    test('should amend claim and transition status to CLAIM_AMENDED', () => {
      const charges = missingChargeService.getCharges();
      const confirmed = charges.find(c => c.status === 'CHARGE_CONFIRMED');
      assert.ok(confirmed, 'Must have at least one confirmed charge alert');

      const amended = missingChargeService.amendClaim(confirmed.id, {
        replacementClaimControlNumber: 'CCN-837-99120',
        notes: 'Replacement 837 claim submitted with CPT 29877-59'
      });

      assert.strictEqual(amended.status, 'CLAIM_AMENDED');
      assert.ok(amended.resolution_notes.includes('CCN-837-99120'));
    });

    test('should dismiss charge as non-billable and transition to DISMISSED_NOT_BILLABLE', () => {
      const charges = missingChargeService.getCharges();
      const underAudit = charges.find(c => c.status === 'UNDER_AUDIT');
      assert.ok(underAudit, 'Must have at least one under audit charge alert');

      const dismissed = missingChargeService.dismissCharge(underAudit.id, {
        reason: 'CMS_PACKAGED',
        notes: 'Confirmed gross handling bundled into primary procedure'
      });

      assert.strictEqual(dismissed.status, 'DISMISSED_NOT_BILLABLE');
      assert.ok(dismissed.resolution_notes.includes('CMS_PACKAGED'));
    });

    test('should throw error when operating on non-existent charge ID', () => {
      assert.throws(() => {
        missingChargeService.confirmCharge('invalid-id-999', { notes: 'fail' });
      }, /not found/);
    });
  });

  describe('5. Database Migration Integrity (066_missing_charge_detection.sql)', () => {
    const upMigrationPath = path.join(rootDir, 'supabase', 'migrations', '066_missing_charge_detection.sql');
    const downMigrationPath = path.join(rootDir, 'supabase', 'migrations', '066_missing_charge_detection_down.sql');

    test('should verify 066_missing_charge_detection.sql exists and contains core tables, columns, and views', () => {
      assert.ok(fs.existsSync(upMigrationPath), '066_missing_charge_detection.sql must exist');
      const sql = fs.readFileSync(upMigrationPath, 'utf8');

      // Core Tables
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.rcm_missing_charge_rules'));
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.rcm_missing_charges'));
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.rcm_missing_charge_actions'));

      // Foreign Key Data Types
      assert.ok(sql.includes('surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id)'));
      assert.ok(sql.includes('patient_id BIGINT NOT NULL REFERENCES public.patients(id)'));
      assert.ok(sql.includes('facility_id UUID NOT NULL REFERENCES public.facilities(id)'));
      assert.ok(sql.includes('claim_id UUID REFERENCES public.claims(id)'));

      // Stored Generated Column
      assert.ok(sql.includes('estimated_net_recovery NUMERIC(14,2) GENERATED ALWAYS AS'));
      assert.ok(sql.includes('STORED'));

      // Analytical Views
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_rcm_missing_charges_active'));
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_rcm_missing_charges_summary'));

      // 1:1 RLS Policy Parity
      const dropCount = (sql.match(/DROP POLICY IF EXISTS/g) || []).length;
      const createCount = (sql.match(/CREATE POLICY/g) || []).length;
      assert.strictEqual(dropCount, 3, 'Must drop 3 policies');
      assert.strictEqual(createCount, 3, 'Must create 3 policies');
      assert.strictEqual(dropCount, createCount, 'DROP and CREATE policy counts must match 1:1');
    });

    test('should verify 066_missing_charge_detection_down.sql cleanly rolls back all schema objects', () => {
      assert.ok(fs.existsSync(downMigrationPath), '066_missing_charge_detection_down.sql must exist');
      const sql = fs.readFileSync(downMigrationPath, 'utf8');

      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_rcm_missing_charges_summary CASCADE;'));
      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_rcm_missing_charges_active CASCADE;'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.rcm_missing_charge_actions CASCADE;'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.rcm_missing_charges CASCADE;'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.rcm_missing_charge_rules CASCADE;'));
    });
  });

  describe('6. Maestro Clinical Design System Governance (Purple Ban)', () => {
    const cssPath = path.join(rootDir, 'src', 'components', 'MissingChargeDetectionView.css');
    const jsxPath = path.join(rootDir, 'src', 'components', 'MissingChargeDetectionView.jsx');

    test('should strictly forbid purple/violet/indigo/magenta/fuchsia tokens in MissingChargeDetectionView.css', () => {
      assert.ok(fs.existsSync(cssPath), 'MissingChargeDetectionView.css must exist');
      const rawCode = fs.readFileSync(cssPath, 'utf8');
      const code = rawCode.replace(/\/\*[\s\S]*?\*\//g, '');
      const forbiddenTokens = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];

      for (const token of forbiddenTokens) {
        const regex = new RegExp(`\\b${token}\\b`, 'i');
        assert.ok(!regex.test(code), `CSS must not contain forbidden token: ${token}`);
      }
    });

    test('should strictly forbid purple/violet/indigo/magenta/fuchsia tokens in MissingChargeDetectionView.jsx', () => {
      assert.ok(fs.existsSync(jsxPath), 'MissingChargeDetectionView.jsx must exist');
      const rawCode = fs.readFileSync(jsxPath, 'utf8');
      const code = rawCode.replace(/\/\*[\s\S]*?\*\//g, '');
      const forbiddenTokens = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];

      for (const token of forbiddenTokens) {
        const regex = new RegExp(`\\b${token}\\b`, 'i');
        assert.ok(!regex.test(code), `JSX must not contain forbidden token: ${token}`);
      }
    });
  });

  describe('7. Application Wiring & Master Documentation Completeness', () => {
    const appPath = path.join(rootDir, 'src', 'App.jsx');
    const specPhase09Path = path.join(rootDir, '..', 'ASCANALYST_All_Modules', 'ASCANALYST_MD_SPECS', 'Phase_09_Revenue_Leakage', '92_MISSING_CHARGE_DETECTION.md');
    const specDocsPhasesPath = path.join(rootDir, 'docs', 'phases', '92_MISSING_CHARGE_DETECTION.md');

    test('should verify MissingChargeDetectionView is registered in App.jsx', () => {
      const appCode = fs.readFileSync(appPath, 'utf8');

      // Import
      assert.ok(appCode.includes("import MissingChargeDetectionView from './components/MissingChargeDetectionView';"));

      // Sidebar menu item
      assert.ok(appCode.includes("activeTab === 'missing_charges'"));
      assert.ok(appCode.includes("Missing Charge Detection"));

      // Header title & subtitle
      assert.ok(appCode.includes("{activeTab === 'missing_charges' && 'Missing CPT, Implant & Supply Charge Detection'}"));

      // Render block
      assert.ok(appCode.includes("<MissingChargeDetectionView />"));
    });

    test('should verify Phase 92 master markdown specifications exist in both directories', () => {
      assert.ok(fs.existsSync(specPhase09Path), 'Specification in Phase_09_Revenue_Leakage must exist');
      assert.ok(fs.existsSync(specDocsPhasesPath), 'Specification in docs/phases must exist');

      const specContent = fs.readFileSync(specDocsPhasesPath, 'utf8');
      assert.ok(specContent.includes('# 92 MISSING CHARGE DETECTION'));
      assert.ok(specContent.includes('## Purpose'));
      assert.ok(specContent.includes('## Scope'));
      assert.ok(specContent.includes('## Current State'));
      assert.ok(specContent.includes('## Target State'));
      assert.ok(specContent.includes('## Data Model / Schema'));
      assert.ok(specContent.includes('## Business Rules'));
      assert.ok(specContent.includes('## Permissions / Security'));
      assert.ok(specContent.includes('## API / Service Requirements'));
      assert.ok(specContent.includes('## UI / Workflow Requirements'));
      assert.ok(specContent.includes('## Audit / Provenance'));
      assert.ok(specContent.includes('## QA / Test Cases'));
      assert.ok(specContent.includes('## Acceptance Criteria'));
    });
  });
});
