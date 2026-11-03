/**
 * ==============================================================================
 * Phase 73: Facility Financial Settings & Cost Assumptions Test Suite
 * ==============================================================================
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  facilityFinancialSettingsService,
  CLINICAL_ROLES,
  CLINICAL_ROLE_CONFIG,
  SCHEDULE_STATUSES,
  STATUS_CONFIG,
  roundToTwo
} from '../src/lib/facilityFinancialSettingsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 73 — Facility Financial Settings Verification Suite', () => {

  describe('1. Clinical Roles & Schedule Status Enums', () => {
    test('Exports all 7 canonical clinical surgical roles', () => {
      const expectedRoles = [
        'CIRCULATOR_RN',
        'SCRUB_TECH',
        'CRNA',
        'STERILE_PROCESSING_TECH',
        'PACU_RN',
        'PREOP_RN',
        'SURGICAL_ASSISTANT'
      ];

      expectedRoles.forEach(role => {
        assert.ok(CLINICAL_ROLES[role], `Clinical role ${role} must be exported`);
        assert.strictEqual(CLINICAL_ROLES[role], role);
      });
    });

    test('Every clinical role has configuration metadata and valid baseline wages', () => {
      Object.keys(CLINICAL_ROLES).forEach(roleKey => {
        const config = CLINICAL_ROLE_CONFIG[roleKey];
        assert.ok(config, `Config must exist for ${roleKey}`);
        assert.ok(config.label, `Label must exist for ${roleKey}`);
        assert.ok(config.shortLabel, `Short label must exist for ${roleKey}`);
        assert.ok(config.department, `Department must exist for ${roleKey}`);
        assert.ok(config.defaultWage > 0, `Default wage must be positive for ${roleKey}`);
        assert.ok(config.defaultBurden >= 1.0, `Default burden must be >= 1.0 for ${roleKey}`);
      });
    });

    test('Exports all 4 schedule lifecycle statuses', () => {
      assert.strictEqual(SCHEDULE_STATUSES.DRAFT, 'DRAFT');
      assert.strictEqual(SCHEDULE_STATUSES.PENDING_APPROVAL, 'PENDING_APPROVAL');
      assert.strictEqual(SCHEDULE_STATUSES.ACTIVE, 'ACTIVE');
      assert.strictEqual(SCHEDULE_STATUSES.SUPERSEDED, 'SUPERSEDED');
    });
  });

  describe('2. Deterministic Financial Arithmetic & Cost Calculations', () => {
    test('calculateLoadedLaborRate computes base wage multiplied by payroll burden', () => {
      // Circulator RN: $52.00 * 1.25 = $65.00
      const loadedRN = facilityFinancialSettingsService.calculateLoadedLaborRate(52.00, 1.25);
      assert.strictEqual(loadedRN, 65.00);

      // Scrub Tech: $36.00 * 1.25 = $45.00
      const loadedTech = facilityFinancialSettingsService.calculateLoadedLaborRate(36.00, 1.25);
      assert.strictEqual(loadedTech, 45.00);

      // Edge cases
      assert.strictEqual(facilityFinancialSettingsService.calculateLoadedLaborRate(0), 0.00);
      assert.strictEqual(facilityFinancialSettingsService.calculateLoadedLaborRate(null), 0.00);
    });

    test('calculateDirectLaborCost computes accurate prorated labor expense', () => {
      // 90 minutes @ $36.00/hr base wage with 1.25 burden:
      // (90 / 60) * 36 * 1.25 = 1.5 * 45 = $67.50
      const cost90m = facilityFinancialSettingsService.calculateDirectLaborCost(90, 36.00, 1.25);
      assert.strictEqual(cost90m, 67.50);

      // 45 minutes @ $52.00/hr base wage with 1.25 burden:
      // (45 / 60) * 52 * 1.25 = 0.75 * 65 = $48.75
      const cost45m = facilityFinancialSettingsService.calculateDirectLaborCost(45, 52.00, 1.25);
      assert.strictEqual(cost45m, 48.75);
    });

    test('calculatePacuCost differentiates Phase I and Phase II recovery time', () => {
      // Phase I: 45 min @ $3.50/min ($157.50) + Phase II: 30 min @ $2.00/min ($60.00) = $217.50
      const pacuCost = facilityFinancialSettingsService.calculatePacuCost(45, 30, 3.50, 2.00);
      assert.strictEqual(pacuCost, 217.50);
    });

    test('calculateIndirectCaseCost apportions fixed per-case overhead and hourly depreciation', () => {
      // 60 minutes OR: $125.00 fixed + (60/60 * $85.00 depreciation) = $210.00
      const indirect = facilityFinancialSettingsService.calculateIndirectCaseCost(60, 125.00, 85.00);
      assert.strictEqual(indirect.indirectOverhead, 125.00);
      assert.strictEqual(indirect.capitalDepreciation, 85.00);
      assert.strictEqual(indirect.totalIndirectCost, 210.00);
    });
  });

  describe('3. Effective-Dating & Closed-Period DOS Resolution', () => {
    test('Resolves 2026 encounter to active 2026.1 schedule', () => {
      const settings2026 = facilityFinancialSettingsService.getSettingsByDateOfService('fac-001', '2026-05-15');
      assert.ok(settings2026, 'Must resolve settings');
      assert.strictEqual(settings2026.versionNumber, '2026.1');
      assert.strictEqual(settings2026.orMinuteRate, 10.00);
      assert.strictEqual(settings2026.status, SCHEDULE_STATUSES.ACTIVE);
    });

    test('Resolves historical 2025 encounter to locked 2025.2 schedule', () => {
      const settings2025 = facilityFinancialSettingsService.getSettingsByDateOfService('fac-001', '2025-09-15');
      assert.ok(settings2025, 'Must resolve historical settings');
      assert.strictEqual(settings2025.versionNumber, '2025.2');
      assert.strictEqual(settings2025.orMinuteRate, 9.25);
      assert.strictEqual(settings2025.status, SCHEDULE_STATUSES.SUPERSEDED);
    });
  });

  describe('4. Schedule Lifecycle & CFO Approval Workflow', () => {
    test('Creating draft, submitting for review, and approving executes lifecycle transitions', () => {
      const facilityId = 'fac-test-lifecycle';

      // 1. Create Draft
      const draft = facilityFinancialSettingsService.createDraftSchedule({
        facilityId,
        scheduleName: 'Test Draft Budget Schedule',
        versionNumber: '2027.1',
        orMinuteRate: 11.50,
        effectiveStartDate: '2027-01-01',
        notes: 'Test draft for QA validation'
      });

      assert.strictEqual(draft.status, SCHEDULE_STATUSES.DRAFT);
      assert.strictEqual(draft.isActive, false);

      // 2. Submit for Review
      const pending = facilityFinancialSettingsService.submitForApproval(facilityId, draft.id);
      assert.strictEqual(pending.status, SCHEDULE_STATUSES.PENDING_APPROVAL);

      // 3. CFO Approval Gate
      const approved = facilityFinancialSettingsService.approveSchedule(facilityId, draft.id, 'Test CFO');
      assert.strictEqual(approved.status, SCHEDULE_STATUSES.ACTIVE);
      assert.strictEqual(approved.isActive, true);
      assert.strictEqual(approved.approvedBy, 'Test CFO');
      assert.ok(approved.approvedAt, 'Must set approval timestamp');
    });
  });

  describe('5. Migration 049 Schema DDL & Rollback Integrity', () => {
    test('Migration 049_facility_financial_settings.sql defines required tables, view, and RLS', () => {
      const fwdPath = path.join(rootDir, 'supabase', 'migrations', '049_facility_financial_settings.sql');
      assert.ok(fs.existsSync(fwdPath), 'Migration 049 file must exist');

      const content = fs.readFileSync(fwdPath, 'utf8');
      assert.ok(content.includes('CREATE TABLE IF NOT EXISTS public.facility_financial_settings'), 'Must create facility_financial_settings');
      assert.ok(content.includes('CREATE TABLE IF NOT EXISTS public.facility_role_wage_rates'), 'Must create facility_role_wage_rates');
      assert.ok(content.includes('CREATE OR REPLACE VIEW public.vw_active_facility_financial_settings'), 'Must create view');
      assert.ok(content.includes('ENABLE ROW LEVEL SECURITY'), 'Must enable RLS');
      assert.ok(content.includes('is_facility_accessible(facility_id)'), 'Must enforce facility multi-tenancy');
    });

    test('Rollback migration 049_facility_financial_settings_down.sql drops all tables and views cleanly', () => {
      const downPath = path.join(rootDir, 'supabase', 'migrations', '049_facility_financial_settings_down.sql');
      assert.ok(fs.existsSync(downPath), 'Down migration 049 file must exist');

      const content = fs.readFileSync(downPath, 'utf8');
      assert.ok(content.includes('DROP VIEW IF EXISTS public.vw_active_facility_financial_settings'), 'Must drop view');
      assert.ok(content.includes('DROP TABLE IF EXISTS public.facility_role_wage_rates'), 'Must drop role wage table');
      assert.ok(content.includes('DROP TABLE IF EXISTS public.facility_financial_settings'), 'Must drop facility settings table');
    });
  });

  describe('6. UI Components & Maestro Purple Ban Static Audit', () => {
    test('FacilityFinancialSettingsView and its CSS have zero banned purple/violet/indigo tokens', () => {
      const jsxPath = path.join(rootDir, 'src', 'components', 'FacilityFinancialSettingsView.jsx');
      const cssPath = path.join(rootDir, 'src', 'components', 'FacilityFinancialSettingsView.css');

      assert.ok(fs.existsSync(jsxPath), 'FacilityFinancialSettingsView.jsx must exist');
      assert.ok(fs.existsSync(cssPath), 'FacilityFinancialSettingsView.css must exist');

      const jsxContent = fs.readFileSync(jsxPath, 'utf8');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      // Strip comments
      const cleanCss = cssContent.replace(/\/\*[\s\S]*?\*\//g, '');

      const purpleRegex = /\b(purple|violet|indigo)\b/i;
      assert.strictEqual(purpleRegex.test(jsxContent), false, 'FacilityFinancialSettingsView.jsx must not contain purple tokens');
      assert.strictEqual(purpleRegex.test(cleanCss), false, 'FacilityFinancialSettingsView.css must not contain purple tokens');
    });

    test('FacilityFinancialSettingsView CSS defines table-responsive with overflow-x auto and custom scrollbars', () => {
      const cssPath = path.join(rootDir, 'src', 'components', 'FacilityFinancialSettingsView.css');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      assert.ok(cssContent.includes('.table-responsive'), 'Must define .table-responsive');
      assert.ok(cssContent.includes('overflow-x: auto'), 'Must set overflow-x: auto');
      assert.ok(cssContent.includes('.table-responsive::-webkit-scrollbar'), 'Must style scrollbars');
      assert.ok(cssContent.includes('min-width: 1100px'), 'Table must have minimum width to prevent field clipping');
    });
  });

  describe('7. Application Wiring & Router Integration', () => {
    test('App.jsx integrates FacilityFinancialSettingsView with sidebar item, headers, and active tab', () => {
      const appPath = path.join(rootDir, 'src', 'App.jsx');
      const content = fs.readFileSync(appPath, 'utf8');

      assert.ok(content.includes("import FacilityFinancialSettingsView from './components/FacilityFinancialSettingsView';"), 'Must import FacilityFinancialSettingsView');
      assert.ok(content.includes("activeTab === 'facility_financial_settings'"), 'Must bind facility_financial_settings tab');
      assert.ok(content.includes("<FacilityFinancialSettingsView />"), 'Must render FacilityFinancialSettingsView');
      assert.ok(content.includes("Facility Financial & Cost Settings"), 'Must have proper header title');
    });
  });

  describe('8. Master Specifications Directory Integrity', () => {
    test('Master directory Phase_07_Financials contains strictly 8 files (70 through 77)', () => {
      const specsDir = 'E:\\medicalAI\\ASCANALYST_All_Modules\\ASCANALYST_MD_SPECS\\Phase_07_Financials';
      if (fs.existsSync(specsDir)) {
        const files = fs.readdirSync(specsDir).filter(f => f.endsWith('.md'));
        assert.strictEqual(files.length, 8, `Phase_07_Financials must contain strictly 8 files, found: ${files.join(', ')}`);
        assert.ok(files.includes('73_FACILITY_FINANCIAL_SETTINGS.md'), 'Must contain 73_FACILITY_FINANCIAL_SETTINGS.md');
      }
    });
  });

});
