/**
 * RECURRING PAYER UNDERPAYMENT PATTERNS AUTOMATED TEST SUITE
 * Phase 93C — Revenue Cycle Management
 * 
 * Comprehensive test coverage for multi-claim pattern grouping across payers,
 * plans, CPT codes, modifiers, and contract rules, threshold qualification,
 * earliest statutory filing deadline governance, and batch recovery opportunities.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import payerPatternService, {
  PayerPatternStore,
  PATTERN_ROOT_CAUSES,
  PATTERN_STATUSES,
  BATCH_STATUSES,
  generateGroupingKey,
  qualifiesAsPattern,
  calculatePatternConfidence,
  calculateEarliestDeadline,
  calculatePriorityScore
} from '../src/lib/payerPatternService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

describe('Phase 93C — Recurring Payer Underpayment Patterns Test Suite', () => {

  // ============================================================================
  // 1. TAXONOMY & STATUS DEFINITIONS
  // ============================================================================
  describe('1. Pattern Taxonomy & Status Definitions', () => {
    test('should define all 8 core pattern root causes with metadata', () => {
      const expectedCodes = [
        'FEE_SCHEDULE_MISMATCH',
        'IMPLANT_CARVEOUT_OMISSION',
        'MPPR_OVER_DISCOUNT',
        'MODIFIER_REDUCTION_ERROR',
        'CASE_RATE_UNPACKAGING_ERROR',
        'CONTRACT_VERSION_MISMATCH',
        'SECONDARY_PROCEDURE_UNDERPAYMENT',
        'LINE_LEVEL_CARC_EXCLUSION'
      ];

      assert.equal(Object.keys(PATTERN_ROOT_CAUSES).length, 8);
      expectedCodes.forEach(code => {
        assert.ok(PATTERN_ROOT_CAUSES[code], `Root cause ${code} must be defined`);
        assert.equal(PATTERN_ROOT_CAUSES[code].code, code);
        assert.ok(PATTERN_ROOT_CAUSES[code].label);
        assert.ok(PATTERN_ROOT_CAUSES[code].badgeColor);
      });
    });

    test('should define all 8 pattern lifecycle states', () => {
      const expectedStatuses = [
        'OPEN',
        'UNDER_REVIEW',
        'VALIDATED',
        'BATCH_RECOVERY_READY',
        'IN_RECOVERY',
        'RESOLVED',
        'DISMISSED',
        'EXPIRED'
      ];

      assert.equal(Object.keys(PATTERN_STATUSES).length, 8);
      expectedStatuses.forEach(st => {
        assert.ok(PATTERN_STATUSES[st], `Pattern status ${st} must be defined`);
        assert.equal(PATTERN_STATUSES[st].code, st);
      });
    });

    test('should define all 7 batch recovery opportunity statuses', () => {
      const expectedBatchStatuses = [
        'DRAFT',
        'READY_FOR_SUPERVISOR',
        'APPROVED',
        'DISPATCHED_TO_PAYER',
        'SETTLED',
        'CLOSED',
        'EXPIRED'
      ];

      assert.equal(Object.keys(BATCH_STATUSES).length, 7);
      expectedBatchStatuses.forEach(st => {
        assert.ok(BATCH_STATUSES[st]);
      });
    });
  });

  // ============================================================================
  // 2. DETERMINISTIC GROUPING KEY & ISOLATION (RULE 1)
  // ============================================================================
  describe('2. Multi-Dimensional Deterministic Grouping Key (Rule 1)', () => {
    test('should generate identical grouping key for matching claim encounters', () => {
      const claim1 = {
        payer_id: 'pyr-bcbs',
        plan_id: 'pln-ppo',
        contract_version_id: 'v2026',
        root_cause_code: 'FEE_SCHEDULE_MISMATCH',
        cpt_hcpcs_code: '29827',
        modifiers: ['59'],
        rule_signature: 'RULE-SEC4'
      };

      const claim2 = {
        payer_id: 'pyr-bcbs',
        plan_id: 'pln-ppo',
        contract_version_id: 'v2026',
        root_cause_code: 'FEE_SCHEDULE_MISMATCH',
        cpt_hcpcs_code: '29827',
        modifiers: ['59'],
        rule_signature: 'RULE-SEC4'
      };

      assert.equal(generateGroupingKey(claim1), generateGroupingKey(claim2));
    });

    test('should strictly isolate claims across different health plans under same payer', () => {
      const commercialClaim = {
        payer_id: 'pyr-uhc',
        plan_id: 'pln-commercial-choice',
        contract_version_id: 'v1',
        root_cause_code: 'IMPLANT_CARVEOUT_OMISSION',
        cpt_hcpcs_code: '29888',
        modifiers: [],
        rule_signature: 'RULE-IMP-4.2'
      };

      const medicareAdvClaim = {
        payer_id: 'pyr-uhc',
        plan_id: 'pln-medicare-adv-complete',
        contract_version_id: 'v1',
        root_cause_code: 'IMPLANT_CARVEOUT_OMISSION',
        cpt_hcpcs_code: '29888',
        modifiers: [],
        rule_signature: 'RULE-IMP-4.2'
      };

      assert.notEqual(
        generateGroupingKey(commercialClaim),
        generateGroupingKey(medicareAdvClaim),
        'Commercial and Medicare Advantage plans must produce distinct grouping keys'
      );
    });

    test('should split patterns across different contract versions even for same CPT and payer', () => {
      const claimVer2025 = {
        payer_id: 'pyr-aetna',
        plan_id: 'pln-elect',
        contract_version_id: 'ver-2025-rates',
        root_cause_code: 'FEE_SCHEDULE_MISMATCH',
        cpt_hcpcs_code: '27447',
        rule_signature: 'RULE-TKA-BASE'
      };

      const claimVer2026 = {
        payer_id: 'pyr-aetna',
        plan_id: 'pln-elect',
        contract_version_id: 'ver-2026-rates',
        root_cause_code: 'FEE_SCHEDULE_MISMATCH',
        cpt_hcpcs_code: '27447',
        rule_signature: 'RULE-TKA-BASE'
      };

      assert.notEqual(
        generateGroupingKey(claimVer2025),
        generateGroupingKey(claimVer2026),
        'Different contract versions must split into separate patterns'
      );
    });

    test('should normalize and sort modifier signatures to ensure consistent grouping', () => {
      const claimA = {
        payer_id: 'pyr-cigna',
        plan_id: 'pln-oap',
        contract_version_id: 'v1',
        root_cause_code: 'MODIFIER_REDUCTION_ERROR',
        cpt_hcpcs_code: '66984',
        modifiers: ['59', 'RT'],
        rule_signature: 'RULE-MOD'
      };

      const claimB = {
        payer_id: 'pyr-cigna',
        plan_id: 'pln-oap',
        contract_version_id: 'v1',
        root_cause_code: 'MODIFIER_REDUCTION_ERROR',
        cpt_hcpcs_code: '66984',
        modifiers: ['RT', '59'],
        rule_signature: 'RULE-MOD'
      };

      assert.equal(
        generateGroupingKey(claimA),
        generateGroupingKey(claimB),
        'Sorted modifiers must yield identical grouping keys regardless of input order'
      );
    });
  });

  // ============================================================================
  // 3. THRESHOLD QUALIFICATION & CONFIDENCE (RULES 2 & 3)
  // ============================================================================
  describe('3. Minimum Thresholds & Quality-Capped Confidence', () => {
    test('should qualify cohort with >= 3 validated claims regardless of dollar amount', () => {
      const claims = [
        { validation_status: 'VALID_UNDERPAYMENT', variance_amount: 300 },
        { validation_status: 'VALID_UNDERPAYMENT', variance_amount: 300 },
        { validation_status: 'VALID_UNDERPAYMENT', variance_amount: 300 }
      ];

      const check = qualifiesAsPattern(claims, 2500);
      assert.equal(check.qualifies, true);
      assert.equal(check.meetsVolume, true);
      assert.equal(check.meetsHighDollar, false);
      assert.equal(check.aggregateAmount, 900.00);
    });

    test('should qualify high-dollar 2-claim cohort meeting facility threshold ($2,500)', () => {
      const claims = [
        { validation_status: 'VALID_UNDERPAYMENT', variance_amount: 1400 },
        { validation_status: 'VALID_UNDERPAYMENT', variance_amount: 1400 }
      ];

      const check = qualifiesAsPattern(claims, 2500);
      assert.equal(check.qualifies, true);
      assert.equal(check.meetsVolume, false);
      assert.equal(check.meetsHighDollar, true);
      assert.equal(check.aggregateAmount, 2800.00);
    });

    test('should reject cohort with only 2 low-dollar claims below threshold', () => {
      const claims = [
        { validation_status: 'VALID_UNDERPAYMENT', variance_amount: 500 },
        { validation_status: 'VALID_UNDERPAYMENT', variance_amount: 500 }
      ];

      const check = qualifiesAsPattern(claims, 2500);
      assert.equal(check.qualifies, false);
      assert.equal(check.meetsVolume, false);
      assert.equal(check.meetsHighDollar, false);
    });

    test('should calculate quality-capped pattern confidence (Rule 3)', () => {
      // 10 claims with only 4 validated (40%) -> LOW
      const lowCohort = Array(10).fill(null).map((_, i) => ({
        validation_status: i < 4 ? 'VALID_UNDERPAYMENT' : 'INSUFFICIENT_DATA'
      }));
      assert.equal(calculatePatternConfidence(lowCohort), 'LOW');

      // 10 claims with 7 validated (70%) -> MEDIUM
      const medCohort = Array(10).fill(null).map((_, i) => ({
        validation_status: i < 7 ? 'VALID_UNDERPAYMENT' : 'NEEDS_MANUAL_REVIEW'
      }));
      assert.equal(calculatePatternConfidence(medCohort), 'MEDIUM');

      // 10 claims with 9 validated (90%) -> HIGH
      const highCohort = Array(10).fill(null).map((_, i) => ({
        validation_status: i < 9 ? 'VALID_UNDERPAYMENT' : 'PATIENT_RESPONSIBILITY'
      }));
      assert.equal(calculatePatternConfidence(highCohort), 'HIGH');
    });
  });

  // ============================================================================
  // 4. EARLIEST FILING DEADLINE & BATCH OPPORTUNITY (RULES 4 & 5)
  // ============================================================================
  describe('4. Earliest Filing Deadline & Batch Recovery Opportunities', () => {
    test('should select the earliest statutory filing deadline across included claims', () => {
      const claims = [
        { filing_deadline: '2026-12-15' },
        { filing_deadline: '2026-11-20' }, // Earliest
        { filing_deadline: '2027-01-05' }
      ];

      const earliest = calculateEarliestDeadline(claims);
      assert.equal(earliest, '2026-11-20');
    });

    test('should calculate composite priority score accurately', () => {
      // 5 claims, $7,000 recovery, deadline in 18 days
      const score = calculatePriorityScore(5, 7000.00, new Date(Date.now() + 18 * 86400000).toISOString());
      assert.ok(score > 50 && score <= 100, `Priority score ${score} must be within 50-100`);
    });

    test('should create batch recovery opportunity for qualified pattern', () => {
      const store = new PayerPatternStore();
      const pattern = store.getPatternById('pat-001'); // BCBS 5 claims ($7,000)
      assert.ok(pattern);

      const opportunity = store.create_batch_recovery_opportunity('pat-001', {
        owner_user_id: 'usr-supervisor-test',
        notes: 'Dispute packet for BCBS 2026 fee schedule discrepancy'
      });

      assert.ok(opportunity.id.startsWith('bro-'));
      assert.ok(opportunity.batch_number.startsWith('BATCH-'));
      assert.equal(opportunity.claim_count, 5);
      assert.equal(opportunity.validated_recovery, 7000.00);
      assert.equal(opportunity.status, 'READY_FOR_SUPERVISOR');
      assert.equal(opportunity.owner_user_id, 'usr-supervisor-test');
      assert.equal(pattern.status, 'BATCH_RECOVERY_READY');
    });

    test('should block batch opportunity creation for cohort with < 2 validated claims', () => {
      const store = new PayerPatternStore();
      const pattern = store.getPatternById('pat-005'); // Humana 2 claims
      pattern.validated_claim_count = 1; // force below threshold

      assert.throws(() => {
        store.create_batch_recovery_opportunity('pat-005');
      }, /Cannot create batch opportunity.*minimum 2 required/);
    });

    test('should re-evaluate pattern metrics when claims are modified or dismissed', () => {
      const store = new PayerPatternStore();
      const pattern = store.getPatternById('pat-001');
      assert.equal(pattern.claim_count, 5);

      // Remove one claim
      pattern.claims.pop();
      const rebuilt = store.rebuild_underpayment_pattern('pat-001');

      assert.equal(rebuilt.claim_count, 4);
      assert.equal(rebuilt.aggregate_variance, 5600.00);
      assert.equal(rebuilt.validated_recoverable_amount, 5600.00);
    });

    test('should generate executive batch demand letter citing constituent claims', () => {
      const store = new PayerPatternStore();
      const demandLetter = store.generateBatchDisputePackage('pat-001');

      assert.ok(demandLetter.includes('SYSTEMIC PAYMENT VARIANCE DEMAND & CONTRACT AUDIT NOTICE'));
      assert.ok(demandLetter.includes('Blue Cross Blue Shield of TX'));
      assert.ok(demandLetter.includes('PAT-BCBS-29827-FEE'));
      assert.ok(demandLetter.includes('Total Encounters Documented: 5 claims'));
      assert.ok(demandLetter.includes('$7000.00'));
      assert.ok(demandLetter.includes('DETAILED SCHEDULE OF CONSTITUENT CLAIMS'));
    });
  });

  // ============================================================================
  // 5. DATABASE MIGRATION INTEGRITY (070_recurring_payer_underpayment_patterns.sql)
  // ============================================================================
  describe('5. Database Migration Integrity (070_recurring_payer_underpayment_patterns.sql)', () => {
    const migrationPath = path.join(ROOT_DIR, 'supabase', 'migrations', '070_recurring_payer_underpayment_patterns.sql');
    const downMigrationPath = path.join(ROOT_DIR, 'supabase', 'migrations', '070_recurring_payer_underpayment_patterns_down.sql');

    test('should verify 070_recurring_payer_underpayment_patterns.sql exists and contains all 3 core tables and 2 views', () => {
      assert.ok(fs.existsSync(migrationPath), 'Migration 070 must exist');
      const sql = fs.readFileSync(migrationPath, 'utf8');

      // Check all 3 core tables
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.payer_underpayment_patterns'), 'Must create payer_underpayment_patterns table');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.payer_underpayment_pattern_claims'), 'Must create payer_underpayment_pattern_claims table');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.batch_recovery_opportunities'), 'Must create batch_recovery_opportunities table');

      // Check composite primary key
      assert.ok(sql.includes('PRIMARY KEY (pattern_id, payment_variance_id)'), 'Must enforce composite PK');

      // Check analytical views
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_payer_patterns_active'), 'Must create vw_payer_patterns_active view');
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_payer_patterns_summary'), 'Must create vw_payer_patterns_summary view');

      // Check RLS enabled on all 3 tables
      assert.ok(sql.includes('ALTER TABLE public.payer_underpayment_patterns ENABLE ROW LEVEL SECURITY;'));
      assert.ok(sql.includes('ALTER TABLE public.payer_underpayment_pattern_claims ENABLE ROW LEVEL SECURITY;'));
      assert.ok(sql.includes('ALTER TABLE public.batch_recovery_opportunities ENABLE ROW LEVEL SECURITY;'));

      // Check 1:1 statement parity between DROP POLICY IF EXISTS and CREATE POLICY
      const dropPolicyMatches = sql.match(/DROP POLICY IF EXISTS\s+([a-zA-Z0-9_]+)\s+ON/g) || [];
      const createPolicyMatches = sql.match(/CREATE POLICY\s+([a-zA-Z0-9_]+)\s+ON/g) || [];
      assert.equal(
        dropPolicyMatches.length,
        createPolicyMatches.length,
        'Each CREATE POLICY must have a matching DROP POLICY IF EXISTS statement'
      );
    });

    test('should verify 070_recurring_payer_underpayment_patterns_down.sql cleanly rolls back all schema objects', () => {
      assert.ok(fs.existsSync(downMigrationPath), 'Down migration 070 must exist');
      const downSql = fs.readFileSync(downMigrationPath, 'utf8');

      // Check tables dropped in reverse dependency order
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.batch_recovery_opportunities CASCADE;'));
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.payer_underpayment_pattern_claims CASCADE;'));
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.payer_underpayment_patterns CASCADE;'));

      // Check views dropped
      assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_payer_patterns_summary CASCADE;'));
      assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_payer_patterns_active CASCADE;'));
    });
  });

  // ============================================================================
  // 6. MAESTRO CLINICAL DESIGN SYSTEM GOVERNANCE (ZERO PURPLE BAN)
  // ============================================================================
  describe('6. Maestro Clinical Design System Governance (Purple Ban)', () => {
    const cssPath = path.join(ROOT_DIR, 'src', 'components', 'PayerUnderpaymentPatternsView.css');
    const jsxPath = path.join(ROOT_DIR, 'src', 'components', 'PayerUnderpaymentPatternsView.jsx');
    const purpleTokens = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];

    test('should strictly forbid purple/violet/indigo/magenta/fuchsia tokens in PayerUnderpaymentPatternsView.css', () => {
      assert.ok(fs.existsSync(cssPath), 'CSS file must exist');
      const css = fs.readFileSync(cssPath, 'utf8').toLowerCase();
      purpleTokens.forEach(token => {
        assert.ok(!css.includes(token), `CSS must not contain prohibited token: ${token}`);
      });
      assert.ok(css.includes('#0b1120 !important'), 'CSS must enforce #0b1120 background');
      assert.ok(css.includes('#0f172a !important'), 'CSS must enforce #0f172a card background');
    });

    test('should strictly forbid purple/violet/indigo/magenta/fuchsia tokens in PayerUnderpaymentPatternsView.jsx', () => {
      assert.ok(fs.existsSync(jsxPath), 'JSX file must exist');
      const jsx = fs.readFileSync(jsxPath, 'utf8').toLowerCase();
      purpleTokens.forEach(token => {
        assert.ok(!jsx.includes(token), `JSX must not contain prohibited token: ${token}`);
      });
    });
  });

  // ============================================================================
  // 7. APPLICATION WIRING & MASTER SPECIFICATION COMPLETENESS
  // ============================================================================
  describe('7. Application Wiring & Master Documentation Completeness', () => {
    test('should verify PayerUnderpaymentPatternsView is registered in App.jsx', () => {
      const appPath = path.join(ROOT_DIR, 'src', 'App.jsx');
      const appContent = fs.readFileSync(appPath, 'utf8');

      assert.ok(appContent.includes("import PayerUnderpaymentPatternsView from './components/PayerUnderpaymentPatternsView';"));
      assert.ok(appContent.includes("activeTab === 'payer_patterns'"));
      assert.ok(appContent.includes('<PayerUnderpaymentPatternsView />'));
      assert.ok(appContent.includes('Payer Underpayment Patterns'));
    });

    test('should verify Phase 93C master markdown specification exists and has required sections', () => {
      const specPath = path.join(ROOT_DIR, 'docs', 'phases', '93C_RECURRING_PAYER_UNDERPAYMENT_PATTERNS.md');
      assert.ok(fs.existsSync(specPath), 'Master specification 93C must exist');
      const spec = fs.readFileSync(specPath, 'utf8');

      assert.ok(spec.includes('# 93C RECURRING PAYER UNDERPAYMENT PATTERNS'));
      assert.ok(spec.includes('## Purpose'));
      assert.ok(spec.includes('## Scope'));
      assert.ok(spec.includes('## Current State'));
      assert.ok(spec.includes('## Target State'));
      assert.ok(spec.includes('## Data Model / Schema'));
      assert.ok(spec.includes('## Business Rules'));
      assert.ok(spec.includes('## Permissions & Multi-Tenancy'));
      assert.ok(spec.includes('## API / Service Requirements'));
      assert.ok(spec.includes('## UI / Workflow Requirements'));
      assert.ok(spec.includes('## QA / Test Cases'));
      assert.ok(spec.includes('## Acceptance Criteria'));
    });
  });
});

