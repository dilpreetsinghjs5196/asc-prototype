import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import appealsService, {
  APPEAL_LEVELS,
  APPEAL_STATUSES,
  EVIDENCE_EXHIBIT_TYPES,
  SUBMISSION_CHANNELS,
  calculatePayerDueDate,
  calculateTurnaroundDaysRemaining,
  classifyTurnaroundUrgency,
  calculateSettlementVariance,
  calculateAppealKpis,
  getBaselineAppeals
} from '../src/lib/appealsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 86 — Appeals Workflow & Dispute Management Engine Suite', () => {

  describe('1. Appeal Levels & Lifecycle State Machine', () => {
    test('should define all 3 statutory appeal levels with correct default turnaround windows', () => {
      const levels = Object.keys(APPEAL_LEVELS);
      assert.strictEqual(levels.length, 3, 'Must define 3 statutory appeal levels');
      assert.ok(levels.includes('LEVEL_1_RECONSIDERATION'));
      assert.ok(levels.includes('LEVEL_2_FORMAL_APPEAL'));
      assert.ok(levels.includes('LEVEL_3_EXTERNAL_ALJ'));

      // Check turnaround defaults and escalation chain
      assert.strictEqual(APPEAL_LEVELS.LEVEL_1_RECONSIDERATION.defaultStatutoryDays, 45);
      assert.strictEqual(APPEAL_LEVELS.LEVEL_1_RECONSIDERATION.escalationTarget, 'LEVEL_2_FORMAL_APPEAL');

      assert.strictEqual(APPEAL_LEVELS.LEVEL_2_FORMAL_APPEAL.defaultStatutoryDays, 60);
      assert.strictEqual(APPEAL_LEVELS.LEVEL_2_FORMAL_APPEAL.escalationTarget, 'LEVEL_3_EXTERNAL_ALJ');

      assert.strictEqual(APPEAL_LEVELS.LEVEL_3_EXTERNAL_ALJ.defaultStatutoryDays, 90);
      assert.strictEqual(APPEAL_LEVELS.LEVEL_3_EXTERNAL_ALJ.escalationTarget, null);
    });

    test('should define all 10 stages of the appeal lifecycle state machine', () => {
      const statuses = Object.keys(APPEAL_STATUSES);
      assert.strictEqual(statuses.length, 10, 'Must define exactly 10 appeal lifecycle statuses');
      assert.ok(statuses.includes('DRAFT'));
      assert.ok(statuses.includes('EVIDENCE_GATHERING'));
      assert.ok(statuses.includes('READY_FOR_SUBMISSION'));
      assert.ok(statuses.includes('SUBMITTED'));
      assert.ok(statuses.includes('IN_PAYER_REVIEW'));
      assert.ok(statuses.includes('ADDITIONAL_INFO_REQUESTED'));
      assert.ok(statuses.includes('OVERTURNED_FULL'));
      assert.ok(statuses.includes('OVERTURNED_PARTIAL'));
      assert.ok(statuses.includes('UPHELD_DENIED'));
      assert.ok(statuses.includes('WITHDRAWN'));
    });

    test('should define all 4 submission transmission channels', () => {
      const channels = Object.keys(SUBMISSION_CHANNELS);
      assert.strictEqual(channels.length, 4, 'Must define 4 transmission channels');
      assert.ok(channels.includes('PAYER_PORTAL_API'));
      assert.ok(channels.includes('CLEARINGHOUSE_ELECTRONIC_275'));
      assert.ok(channels.includes('CERTIFIED_MAIL'));
      assert.ok(channels.includes('SECURE_FAX'));
    });
  });

  describe('2. Clinical & Billing Evidence Exhibits Taxonomy', () => {
    test('should define complete evidence exhibit taxonomy with required flags', () => {
      const types = Object.keys(EVIDENCE_EXHIBIT_TYPES);
      assert.ok(types.length >= 9, 'Must define at least 9 evidence exhibit types');
      assert.ok(types.includes('OPERATIVE_NOTE'));
      assert.ok(types.includes('LETTER_OF_MEDICAL_NECESSITY'));
      assert.ok(types.includes('PRIOR_AUTH_DOCUMENT'));
      assert.ok(types.includes('PEER_REVIEW_RATIONALE'));
      assert.ok(types.includes('CLINICAL_CHART_NOTES'));
      assert.ok(types.includes('NCCI_UNBUNDLING_PROOF'));
      assert.ok(types.includes('PROOF_OF_TIMELY_FILING'));
      assert.ok(types.includes('PRIMARY_PAYER_EOB'));
      assert.ok(types.includes('OTHER_CLINICAL_EXHIBIT'));

      // Operative note and LOMN are mandatory core exhibits
      assert.strictEqual(EVIDENCE_EXHIBIT_TYPES.OPERATIVE_NOTE.isRequiredByDefault, true);
      assert.strictEqual(EVIDENCE_EXHIBIT_TYPES.LETTER_OF_MEDICAL_NECESSITY.isRequiredByDefault, true);
      assert.strictEqual(EVIDENCE_EXHIBIT_TYPES.OPERATIVE_NOTE.category, 'CLINICAL');
      assert.strictEqual(EVIDENCE_EXHIBIT_TYPES.NCCI_UNBUNDLING_PROOF.category, 'TECHNICAL_BILLING');
    });
  });

  describe('3. Statutory Turnaround Date Math & Urgency Tiers', () => {
    test('should compute payer response due date deterministically', () => {
      const dueDate45 = calculatePayerDueDate('2026-10-01', 45);
      assert.strictEqual(dueDate45, '2026-11-15', '10/01 + 45 days should be 11/15');

      const dueDate30 = calculatePayerDueDate('2026-09-15', 30);
      assert.strictEqual(dueDate30, '2026-10-15', '09/15 + 30 days should be 10/15');

      const nullDate = calculatePayerDueDate(null);
      assert.strictEqual(nullDate, null, 'Null submission date should return null');
    });

    test('should compute turnaround days remaining accurately', () => {
      // 5 days remaining
      const rem1 = calculateTurnaroundDaysRemaining('2026-11-15', '2026-11-10');
      assert.strictEqual(rem1, 5, 'Should calculate 5 calendar days remaining');

      // 4 days overdue
      const rem2 = calculateTurnaroundDaysRemaining('2026-11-10', '2026-11-14');
      assert.strictEqual(rem2, -4, 'Should calculate -4 calendar days overdue');

      // Invalid date returns null
      assert.strictEqual(calculateTurnaroundDaysRemaining(null), null);
    });

    test('should classify urgency tiers deterministically', () => {
      // Overdue
      const tierOverdue = classifyTurnaroundUrgency(-3, 'SUBMITTED');
      assert.strictEqual(tierOverdue.tier, 'OVERDUE');
      assert.ok(tierOverdue.badgeClass.includes('rose'));

      // Urgent (<=10d)
      const tierUrgent = classifyTurnaroundUrgency(7, 'IN_PAYER_REVIEW');
      assert.strictEqual(tierUrgent.tier, 'URGENT');
      assert.ok(tierUrgent.badgeClass.includes('amber'));

      // On Track (>10d)
      const tierTrack = classifyTurnaroundUrgency(24, 'SUBMITTED');
      assert.strictEqual(tierTrack.tier, 'ON_TRACK');
      assert.ok(tierTrack.badgeClass.includes('sky'));

      // Resolved status
      const tierResolved = classifyTurnaroundUrgency(-10, 'OVERTURNED_FULL');
      assert.strictEqual(tierResolved.tier, 'RESOLVED');
    });
  });

  describe('4. Financial Settlement Calculations & KPI Aggregation', () => {
    test('should compute settlement variance correctly', () => {
      const var1 = calculateSettlementVariance(1850.00, 1850.00);
      assert.strictEqual(var1, 0.00, 'Full overturn has 0 variance');

      const var2 = calculateSettlementVariance(6400.00, 5220.00);
      assert.strictEqual(var2, 1180.00, 'Partial overturn variance should be $1,180.00');

      const var3 = calculateSettlementVariance(4000.00, 0.00);
      assert.strictEqual(var3, 4000.00, 'Zero recovery variance equals full appealed amount');
    });

    test('should accurately calculate executive KPIs on baseline appeals dataset', () => {
      const baseline = getBaselineAppeals();
      assert.ok(baseline.length >= 6, 'Baseline must contain at least 6 representative cases');

      const kpis = calculateAppealKpis(baseline);
      assert.ok(kpis.totalDisputedDollars > 0, 'Total disputed dollars must be greater than 0');
      assert.ok(kpis.totalOverturnedDollars > 0, 'Total overturned dollars must be greater than 0');
      assert.ok(kpis.inFlightCount >= 3, 'Must have active in-flight appeal cases');
      assert.ok(kpis.aggregateRecoveryYieldPct >= 40, 'Recovery yield must be calculated as a percentage');

      // Verify specific numbers from sample data:
      // Disputed: 1850 + 4200 + 5120 + 2680 + 6400 + 1100 = 21,350.00
      assert.strictEqual(kpis.totalDisputedDollars, 21350.00);
      // Recovered: 4200 + 5220 = 9,420.00
      assert.strictEqual(kpis.totalOverturnedDollars, 9420.00);
      // Recovery Yield: (9420 / 21350) * 100 = 44.1%
      assert.strictEqual(kpis.aggregateRecoveryYieldPct, 44.1);
    });
  });

  describe('5. Database Migration SQL Verification (060_appeals_workflow.sql)', () => {
    const migrationPath = path.join(rootDir, 'supabase', 'migrations', '060_appeals_workflow.sql');
    const downMigrationPath = path.join(rootDir, 'supabase', 'migrations', '060_appeals_workflow_down.sql');

    test('should exist on disk and define required schema tables, views, and generated columns', () => {
      assert.ok(fs.existsSync(migrationPath), 'Migration 060_appeals_workflow.sql must exist');
      const sql = fs.readFileSync(migrationPath, 'utf8');

      // Table definitions
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.rcm_appeals'), 'Must create rcm_appeals table');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.rcm_appeal_evidence'), 'Must create rcm_appeal_evidence table');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.rcm_appeal_events'), 'Must create rcm_appeal_events table');

      // Generated column
      assert.ok(sql.includes('settlement_variance NUMERIC(14,2) GENERATED ALWAYS AS (appealed_amount - recovered_amount) STORED'),
        'Must define generated settlement_variance column');

      // Views
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_rcm_active_appeals_queue'), 'Must create active appeals view');
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_rcm_appeals_settlement_analytics'), 'Must create settlement analytics view');

      // Tenant isolation RLS
      assert.ok(sql.includes('public.get_auth_user_facilities()'), 'Must enforce facility isolation via get_auth_user_facilities');
    });

    test('should enforce idempotent DROP POLICY IF EXISTS before CREATE POLICY to prevent error 42710', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      const dropMatches = (sql.match(/DROP POLICY IF EXISTS/gi) || []).length;
      const createMatches = (sql.match(/CREATE POLICY/gi) || []).length;

      assert.strictEqual(dropMatches, 3, 'Must have exactly 3 DROP POLICY IF EXISTS statements');
      assert.strictEqual(createMatches, 3, 'Must have exactly 3 CREATE POLICY statements');
      assert.strictEqual(dropMatches, createMatches, 'Every CREATE POLICY must have a matching DROP POLICY IF EXISTS');
    });

    test('should include safe rollback down migration', () => {
      assert.ok(fs.existsSync(downMigrationPath), 'Down migration 060_appeals_workflow_down.sql must exist');
      const downSql = fs.readFileSync(downMigrationPath, 'utf8');

      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.rcm_appeal_events CASCADE;'), 'Must drop rcm_appeal_events');
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.rcm_appeal_evidence CASCADE;'), 'Must drop rcm_appeal_evidence');
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.rcm_appeals CASCADE;'), 'Must drop rcm_appeals');
      assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_rcm_appeals_settlement_analytics;'), 'Must drop analytics view');
      assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_rcm_active_appeals_queue;'), 'Must drop queue view');
    });
  });

  describe('6. Maestro Clinical Design System Token Governance', () => {
    const cssPath = path.join(rootDir, 'src', 'components', 'AppealsWorkflowView.css');
    const jsxPath = path.join(rootDir, 'src', 'components', 'AppealsWorkflowView.jsx');

    test('should enforce ZERO purple/violet/indigo/magenta/fuchsia tokens in AppealsWorkflowView.css', () => {
      assert.ok(fs.existsSync(cssPath), 'AppealsWorkflowView.css must exist');
      const css = fs.readFileSync(cssPath, 'utf8');
      const cleanCss = css.replace(/\/\*[\s\S]*?\*\//g, '');

      const disallowedPatterns = [
        /\bpurple\b/i,
        /\bviolet\b/i,
        /\bindigo\b/i,
        /\bmagenta\b/i,
        /\bfuchsia\b/i,
        /#8b5cf6/i,
        /#7c3aed/i,
        /#6366f1/i,
        /#a855f7/i
      ];

      for (const pattern of disallowedPatterns) {
        assert.ok(!pattern.test(cleanCss), `AppealsWorkflowView.css contains disallowed token matching ${pattern}`);
      }
    });

    test('should enforce responsive table with min-width: 1100px and table-layout: fixed in AppealsWorkflowView.css', () => {
      const css = fs.readFileSync(cssPath, 'utf8');
      assert.ok(css.includes('min-width: 1100px;'), 'Must define min-width: 1100px for table');
      assert.ok(css.includes('table-layout: fixed;'), 'Must define table-layout: fixed for consistent column spacing');
    });

    test('should enforce ZERO purple/violet/indigo/magenta/fuchsia tokens in AppealsWorkflowView.jsx', () => {
      assert.ok(fs.existsSync(jsxPath), 'AppealsWorkflowView.jsx must exist');
      const jsx = fs.readFileSync(jsxPath, 'utf8');

      const disallowedPatterns = [
        /\bpurple\b/i,
        /\bviolet\b/i,
        /\bindigo\b/i,
        /\bmagenta\b/i,
        /\bfuchsia\b/i
      ];

      for (const pattern of disallowedPatterns) {
        assert.ok(!pattern.test(jsx), `AppealsWorkflowView.jsx contains disallowed token matching ${pattern}`);
      }
    });
  });

  describe('7. Application Wiring & UI Routing Integration', () => {
    test('should register AppealsWorkflowView in src/App.jsx', () => {
      const appPath = path.join(rootDir, 'src', 'App.jsx');
      assert.ok(fs.existsSync(appPath), 'src/App.jsx must exist');
      const appContent = fs.readFileSync(appPath, 'utf8');

      assert.ok(appContent.includes("import AppealsWorkflowView from './components/AppealsWorkflowView'"),
        'Must import AppealsWorkflowView in src/App.jsx');
      assert.ok(appContent.includes("activeTab === 'appeals_workflow'"),
        'Must route appeals_workflow in src/App.jsx');
      assert.ok(appContent.includes('<AppealsWorkflowView />'),
        'Must render <AppealsWorkflowView /> in src/App.jsx');
      assert.ok(appContent.includes('Appeals & Dispute Workflow'),
        'Must render Appeals & Dispute Workflow sidebar label');
    });
  });

  describe('8. Master Specifications Directory Integrity', () => {
    test('should maintain populated 86_APPEALS_WORKFLOW.md specification', () => {
      const specPath = path.resolve(rootDir, '..', 'ASCANALYST_All_Modules', 'ASCANALYST_MD_SPECS', 'Phase_08_RCM', '86_APPEALS_WORKFLOW.md');
      assert.ok(fs.existsSync(specPath), 'Master specification 86_APPEALS_WORKFLOW.md must exist');
      const spec = fs.readFileSync(specPath, 'utf8');

      assert.ok(spec.includes('# 86 APPEALS WORKFLOW'), 'Must include title header');
      assert.ok(spec.includes('LEVEL_1_RECONSIDERATION'), 'Must specify Level 1 appeal');
      assert.ok(spec.includes('LEVEL_2_FORMAL_APPEAL'), 'Must specify Level 2 appeal');
      assert.ok(spec.includes('LEVEL_3_EXTERNAL_ALJ'), 'Must specify Level 3 appeal');
      assert.ok(spec.includes('OPERATIVE_NOTE'), 'Must document OPERATIVE_NOTE exhibit');
      assert.ok(spec.includes('LETTER_OF_MEDICAL_NECESSITY'), 'Must document LOMN exhibit');
    });
  });

});
