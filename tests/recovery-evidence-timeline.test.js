/**
 * RECOVERY EVIDENCE AND TIMELINE AUTOMATED TEST SUITE
 * Phase 93B — Revenue Cycle Management
 * 
 * Comprehensive tests for auditable recovery cases, multi-source evidence packages,
 * chronological audit timelines, human approval governance, multi-channel dispatch,
 * payer responses, and incremental cash reconciliation.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import recoveryEvidenceService, {
  RecoveryEvidenceStore,
  RECOVERY_CASE_STATUSES,
  EVIDENCE_TYPES,
  SUBMISSION_CHANNELS,
  PAYER_RESPONSE_TYPES,
  OUTCOME_TYPES,
  calculateRecoveryProgress,
  calculateCycleTimes,
  calculateIncrementalRecovery,
  verifyEvidenceCompleteness,
  computePackageHash
} from '../src/lib/recoveryEvidenceService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

describe('Phase 93B — Recovery Evidence and Timeline Engine Test Suite', () => {

  // ============================================================================
  // 1. LIFECYCLE STATUSES, EVIDENCE TYPES & SUBMISSION CHANNELS
  // ============================================================================
  describe('1. 15-State Recovery Case Lifecycle & Taxonomy', () => {
    test('should define all 15 statutory recovery lifecycle states', () => {
      const expectedStatuses = [
        'DRAFT',
        'EVIDENCE_INCOMPLETE',
        'READY_FOR_REVIEW',
        'APPROVED',
        'SUBMITTED',
        'ACKNOWLEDGED',
        'PAYER_INFO_REQUESTED',
        'UNDER_PAYER_REVIEW',
        'REPROCESSING',
        'PARTIALLY_RECOVERED',
        'FULLY_RECOVERED',
        'REJECTED',
        'WITHDRAWN',
        'CLOSED_NO_RECOVERY',
        'EXPIRED'
      ];

      assert.equal(Object.keys(RECOVERY_CASE_STATUSES).length, 15);
      expectedStatuses.forEach(code => {
        assert.ok(RECOVERY_CASE_STATUSES[code], `Status ${code} must be defined`);
        assert.equal(RECOVERY_CASE_STATUSES[code].code, code);
        assert.ok(RECOVERY_CASE_STATUSES[code].label, `Status ${code} must have a label`);
        assert.ok(RECOVERY_CASE_STATUSES[code].badgeColor, `Status ${code} must have a badge color`);
      });
    });

    test('should define all 13 supported evidence types', () => {
      const expectedTypes = [
        'CONTRACT_CLAUSE',
        'CONTRACT_RATE',
        'EXPECTED_REIMBURSEMENT_TRACE',
        'CLAIM',
        'CLAIM_LINE',
        'ERA_835',
        'CARC_RARC',
        'IMPLANT_INVOICE',
        'IMPLANT_CARVEOUT_RULE',
        'OPERATIVE_NOTE',
        'CODING_REVIEW',
        'PAYMENT_POSTING',
        'OTHER'
      ];

      assert.equal(Object.keys(EVIDENCE_TYPES).length, 13);
      expectedTypes.forEach(code => {
        assert.ok(EVIDENCE_TYPES[code], `Evidence type ${code} must be defined`);
        assert.equal(EVIDENCE_TYPES[code].code, code);
      });
    });

    test('should define all 8 operational submission channels', () => {
      const expectedChannels = [
        'WAYSTAR',
        'CLEARINGHOUSE',
        'PAYER_PORTAL',
        'SFTP',
        'SECURE_EMAIL',
        'MAIL',
        'MANUAL',
        'OTHER'
      ];

      assert.equal(Object.keys(SUBMISSION_CHANNELS).length, 8);
      expectedChannels.forEach(code => {
        assert.ok(SUBMISSION_CHANNELS[code], `Channel ${code} must be defined`);
        assert.equal(SUBMISSION_CHANNELS[code].code, code);
      });
    });
  });

  // ============================================================================
  // 2. DETERMINISTIC CALCULATIONS & ACCOUNTING FORMULAE
  // ============================================================================
  describe('2. Deterministic Financial & Incremental Recovery Formulae', () => {
    test('should calculate recovery progress and remaining balance accurately', () => {
      const progress1 = calculateRecoveryProgress(1400.00, 1000.00);
      assert.equal(progress1.validatedAmount, 1400.00);
      assert.equal(progress1.recoveredAmount, 1000.00);
      assert.equal(progress1.remainingBalance, 400.00);
      assert.equal(progress1.realizationPercent, 71.43);
      assert.equal(progress1.isFullyRecovered, false);

      const progress2 = calculateRecoveryProgress(2250.00, 2250.00);
      assert.equal(progress2.remainingBalance, 0.00);
      assert.equal(progress2.realizationPercent, 100.00);
      assert.equal(progress2.isFullyRecovered, true);
    });

    test('should calculate operational cycle times across all milestone dates', () => {
      const cycle = calculateCycleTimes({
        createdAt: '2026-10-01T08:00:00Z',
        validatedAt: '2026-10-03T12:00:00Z',
        submittedAt: '2026-10-05T09:00:00Z',
        firstResponseAt: '2026-10-10T14:00:00Z',
        resolvedAt: '2026-10-20T16:00:00Z'
      });

      assert.equal(cycle.detectionToValidationDays, 2);
      assert.equal(cycle.validationToSubmissionDays, 2);
      assert.equal(cycle.submissionToResponseDays, 5);
      assert.equal(cycle.submissionToCashDays, 15);
      assert.equal(cycle.totalResolutionDays, 19);
    });

    test('should enforce strict incremental recovery accounting rule (Rule 3)', () => {
      // Baseline paid = $1000. Subsequent total paid = $1800. Incremental cash = $800.
      const calc1 = calculateIncrementalRecovery({
        baselineAllowed: 2500,
        baselinePaid: 1000,
        postSubmissionPaid: 1800,
        patientPaid: 150,
        secondaryPaid: 300,
        isDuplicatePosting: false
      });

      assert.equal(calc1.isValid, true);
      assert.equal(calc1.incrementalCash, 800.00);
      assert.equal(calc1.excludedPatientPaid, 150.00);
      assert.equal(calc1.excludedSecondaryPaid, 300.00);

      // Rejects duplicate payment posting
      const calc2 = calculateIncrementalRecovery({
        baselineAllowed: 2500,
        baselinePaid: 1000,
        postSubmissionPaid: 1800,
        isDuplicatePosting: true
      });
      assert.equal(calc2.isValid, false);
      assert.equal(calc2.incrementalCash, 0);
      assert.equal(calc2.reason, 'DUPLICATE_POSTING_REJECTED');
    });
  });

  // ============================================================================
  // 3. EVIDENCE COMPLETENESS GATE (RULE 1)
  // ============================================================================
  describe('3. Evidence Completeness Gate (Rule 1)', () => {
    test('should identify missing required evidence for contractual underpayment', () => {
      const incompleteEvidence = [
        { evidence_type: 'CLAIM', is_present: true },
        { evidence_type: 'EXPECTED_REIMBURSEMENT_TRACE', is_present: true }
      ];

      const result = verifyEvidenceCompleteness(incompleteEvidence, 'CONTRACTUAL_UNDERPAYMENT');
      assert.equal(result.isComplete, false);
      assert.ok(result.missingRequired.some(m => m.includes('Contract Clause')));
      assert.ok(result.missingRequired.some(m => m.includes('Remittance')));
      assert.ok(result.missingRequired.some(m => m.includes('CARC')));
    });

    test('should pass verification when all required evidence items are present', () => {
      const completeEvidence = [
        { evidence_type: 'CONTRACT_RATE', is_present: true },
        { evidence_type: 'EXPECTED_REIMBURSEMENT_TRACE', is_present: true },
        { evidence_type: 'CLAIM_LINE', is_present: true },
        { evidence_type: 'ERA_835', is_present: true },
        { evidence_type: 'CARC_RARC', is_present: true }
      ];

      const result = verifyEvidenceCompleteness(completeEvidence, 'CONTRACTUAL_UNDERPAYMENT');
      assert.equal(result.isComplete, true);
      assert.equal(result.missingRequired.length, 0);
    });

    test('should require implant invoice and carveout rule for IMPLANT_CARVEOUT', () => {
      const baseEvidence = [
        { evidence_type: 'CONTRACT_RATE', is_present: true },
        { evidence_type: 'EXPECTED_REIMBURSEMENT_TRACE', is_present: true },
        { evidence_type: 'CLAIM_LINE', is_present: true },
        { evidence_type: 'ERA_835', is_present: true },
        { evidence_type: 'CARC_RARC', is_present: true }
      ];

      const resultWithoutInvoice = verifyEvidenceCompleteness(baseEvidence, 'IMPLANT_CARVEOUT');
      assert.equal(resultWithoutInvoice.isComplete, false);
      assert.ok(resultWithoutInvoice.missingRequired.some(m => m.includes('Manufacturer Implant Purchase Invoice')));

      baseEvidence.push({ evidence_type: 'IMPLANT_INVOICE', is_present: true });
      baseEvidence.push({ evidence_type: 'IMPLANT_CARVEOUT_RULE', is_present: true });
      const resultWithInvoice = verifyEvidenceCompleteness(baseEvidence, 'IMPLANT_CARVEOUT');
      assert.equal(resultWithInvoice.isComplete, true);
    });
  });

  // ============================================================================
  // 4. MANDATORY HUMAN APPROVAL & SUBMISSION GATE (RULE 2 P0 SAFEGUARD)
  // ============================================================================
  describe('4. Mandatory Human Approval Gate (Rule 2 P0 Safeguard)', () => {
    test('should forbid submission when case is not approved', () => {
      const store = new RecoveryEvidenceStore();
      const newCase = store.build_recovery_case('pv-test-gate-01', {
        potential_recovery: 1500.00
      });

      assert.equal(newCase.status, 'EVIDENCE_INCOMPLETE');
      assert.equal(newCase.approved_by, null);

      assert.throws(() => {
        store.record_recovery_submission(newCase.id, 'WAYSTAR', 'usr-test');
      }, /Execution blocked: Recovery case .* cannot be submitted without an auditable human approval event/);
    });

    test('should prevent approval when mandatory evidence is missing', () => {
      const store = new RecoveryEvidenceStore();
      const newCase = store.build_recovery_case('pv-test-gate-02', {
        potential_recovery: 850.00
      });

      assert.throws(() => {
        store.approve_recovery_case(newCase.id, 'usr-supervisor-1');
      }, /Cannot approve recovery case. Missing required evidence/);
    });

    test('should approve case and record immutable package hash when evidence is complete', () => {
      const store = new RecoveryEvidenceStore();
      const testCase = store.getById('rc-case-002'); // READY_FOR_REVIEW case
      assert.ok(testCase);
      assert.equal(testCase.status, 'READY_FOR_REVIEW');

      const approved = store.approve_recovery_case(testCase.id, 'usr-supervisor-test', null, 'Verified by clinical director');
      assert.equal(approved.status, 'APPROVED');
      assert.equal(approved.approved_by, 'usr-supervisor-test');
      assert.ok(approved.approved_at);
      assert.ok(approved.package_hash.startsWith('sha256-pkg-'));

      // Verify approval event logged in timeline
      const approvalEvent = approved.events.find(e => e.event_type === 'HUMAN_APPROVED');
      assert.ok(approvalEvent);
      assert.equal(approvalEvent.actor_name, 'usr-supervisor-test');
    });
  });

  // ============================================================================
  // 5. SUBMISSION TRACKING, PAYER RESPONSES & CASH RECONCILIATION
  // ============================================================================
  describe('5. Submission Tracking, Responses & Cash Reconciliation', () => {
    test('should dispatch submission via WAYSTAR channel after approval', () => {
      const store = new RecoveryEvidenceStore();
      const testCase = store.getById('rc-case-002');
      store.approve_recovery_case(testCase.id, 'usr-supervisor-1');

      const submitted = store.record_recovery_submission(testCase.id, 'WAYSTAR', 'usr-supervisor-1', 'WAYSTAR-DISP-99201');
      assert.equal(submitted.status, 'SUBMITTED');
      assert.equal(submitted.submission.submission_channel, 'WAYSTAR');
      assert.equal(submitted.submission.external_reference, 'WAYSTAR-DISP-99201');

      const submitEvent = submitted.events.find(e => e.event_type === 'EXTERNAL_SUBMISSION');
      assert.ok(submitEvent);
    });

    test('should record payer acknowledgment and transition to ACKNOWLEDGED', () => {
      const store = new RecoveryEvidenceStore();
      const testCase = store.getById('rc-case-002');
      store.approve_recovery_case(testCase.id, 'usr-supervisor-1');
      store.record_recovery_submission(testCase.id, 'WAYSTAR');

      const acked = store.record_payer_response(testCase.id, 'ACKNOWLEDGMENT', '2026-11-10', null, 'ACK-REC-01');
      assert.equal(acked.status, 'ACKNOWLEDGED');
      assert.equal(acked.payer_responses.length, 1);
    });

    test('should record payer info request and transition to PAYER_INFO_REQUESTED', () => {
      const store = new RecoveryEvidenceStore();
      const testCase = store.getById('rc-case-002');
      store.approve_recovery_case(testCase.id, 'usr-supervisor-1');
      store.record_recovery_submission(testCase.id, 'PAYER_PORTAL');

      const infoReq = store.record_payer_response(testCase.id, 'INFO_REQUESTED', '2026-11-10', null, 'ADR-OP-REPORT', 'Requested operative note');
      assert.equal(infoReq.status, 'PAYER_INFO_REQUESTED');
    });

    test('should record payer adverse decision and transition to REJECTED', () => {
      const store = new RecoveryEvidenceStore();
      const testCase = store.getById('rc-case-002');
      store.approve_recovery_case(testCase.id, 'usr-supervisor-1');
      store.record_recovery_submission(testCase.id, 'MAIL');

      const rejected = store.record_payer_response(testCase.id, 'UPHELD_DENIAL', '2026-11-10', null, 'DENIAL-UPHELD-FINAL');
      assert.equal(rejected.status, 'REJECTED');
    });

    test('should reconcile partial recovery cash and maintain open disputed balance', () => {
      const store = new RecoveryEvidenceStore();
      const testCase = store.getById('rc-case-002');
      store.approve_recovery_case(testCase.id, 'usr-supervisor-1');
      store.record_recovery_submission(testCase.id, 'WAYSTAR');

      // Disputed potential = 1800. Incremental cash = 1200.
      const reconciled = store.reconcile_recovery_payment(testCase.id, {
        incrementalPayment: 1200.00,
        verificationSource: 'ERA_835_REMITTANCE',
        verificationRecordId: 'EFT-TEST-8819'
      });

      assert.equal(reconciled.status, 'PARTIALLY_RECOVERED');
      assert.equal(reconciled.recovered_amount, 1200.00);
      assert.equal(reconciled.outcome.outcome_type, 'PARTIAL_RECOVERY');
    });

    test('should reconcile 100% full recovery and close case as FULLY_RECOVERED', () => {
      const store = new RecoveryEvidenceStore();
      const testCase = store.getById('rc-case-002');
      store.approve_recovery_case(testCase.id, 'usr-supervisor-1');
      store.record_recovery_submission(testCase.id, 'PAYER_PORTAL');

      // Disputed potential = 1800. Incremental cash = 1800.
      const reconciled = store.reconcile_recovery_payment(testCase.id, {
        incrementalPayment: 1800.00,
        verificationSource: 'ERA_835_REMITTANCE',
        verificationRecordId: 'EFT-FULL-1800'
      });

      assert.equal(reconciled.status, 'FULLY_RECOVERED');
      assert.equal(reconciled.recovered_amount, 1800.00);
      assert.ok(reconciled.closed_at);
      assert.equal(reconciled.outcome.outcome_type, 'FULL_RECOVERY');
    });

    test('should generate AI-assisted dispute reconsideration narrative with contract citations', () => {
      const store = new RecoveryEvidenceStore();
      const narrative = store.generateReconsiderationNarrative('rc-case-001');

      assert.ok(narrative.includes('RECONSIDERATION REQUEST & CONTRACTUAL PAYMENT DISPUTE'));
      assert.ok(narrative.includes('Blue Cross Blue Shield of TX'));
      assert.ok(narrative.includes('CLM-2026-9041'));
      assert.ok(narrative.includes('CPT 29827'));
      assert.ok(narrative.includes('EVIDENTIARY EXHIBITS ATTACHED'));
    });
  });

  // ============================================================================
  // 6. DATABASE MIGRATION INTEGRITY (069_recovery_evidence_and_timeline.sql)
  // ============================================================================
  describe('6. Database Migration Integrity (069_recovery_evidence_and_timeline.sql)', () => {
    const migrationPath = path.join(ROOT_DIR, 'supabase', 'migrations', '069_recovery_evidence_and_timeline.sql');
    const downMigrationPath = path.join(ROOT_DIR, 'supabase', 'migrations', '069_recovery_evidence_and_timeline_down.sql');

    test('should verify 069_recovery_evidence_and_timeline.sql exists and contains all 6 core tables and 2 views', () => {
      assert.ok(fs.existsSync(migrationPath), 'Migration 069 file must exist');
      const sql = fs.readFileSync(migrationPath, 'utf8');

      // Check all 6 core tables
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.recovery_cases'), 'Must create recovery_cases table');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.recovery_case_events'), 'Must create recovery_case_events table');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.recovery_evidence'), 'Must create recovery_evidence table');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.recovery_submissions'), 'Must create recovery_submissions table');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.payer_responses'), 'Must create payer_responses table');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.recovery_outcomes'), 'Must create recovery_outcomes table');

      // Check views
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_recovery_cases_active'), 'Must create vw_recovery_cases_active view');
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_recovery_cases_summary'), 'Must create vw_recovery_cases_summary view');

      // Check RLS enabled on all 6 tables
      assert.ok(sql.includes('ALTER TABLE public.recovery_cases ENABLE ROW LEVEL SECURITY;'));
      assert.ok(sql.includes('ALTER TABLE public.recovery_case_events ENABLE ROW LEVEL SECURITY;'));
      assert.ok(sql.includes('ALTER TABLE public.recovery_evidence ENABLE ROW LEVEL SECURITY;'));
      assert.ok(sql.includes('ALTER TABLE public.recovery_submissions ENABLE ROW LEVEL SECURITY;'));
      assert.ok(sql.includes('ALTER TABLE public.payer_responses ENABLE ROW LEVEL SECURITY;'));
      assert.ok(sql.includes('ALTER TABLE public.recovery_outcomes ENABLE ROW LEVEL SECURITY;'));

      // Check 1:1 statement parity between DROP POLICY IF EXISTS and CREATE POLICY
      const dropPolicyMatches = sql.match(/DROP POLICY IF EXISTS\s+([a-zA-Z0-9_]+)\s+ON/g) || [];
      const createPolicyMatches = sql.match(/CREATE POLICY\s+([a-zA-Z0-9_]+)\s+ON/g) || [];
      assert.equal(
        dropPolicyMatches.length,
        createPolicyMatches.length,
        'Each CREATE POLICY must have a matching DROP POLICY IF EXISTS statement'
      );
    });

    test('should verify 069_recovery_evidence_and_timeline_down.sql cleanly rolls back all schema objects', () => {
      assert.ok(fs.existsSync(downMigrationPath), 'Down migration 069 file must exist');
      const downSql = fs.readFileSync(downMigrationPath, 'utf8');

      // Check all 6 tables dropped with CASCADE
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.recovery_cases CASCADE;'));
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.recovery_case_events CASCADE;'));
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.recovery_evidence CASCADE;'));
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.recovery_submissions CASCADE;'));
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.payer_responses CASCADE;'));
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.recovery_outcomes CASCADE;'));

      // Check views dropped
      assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_recovery_cases_summary CASCADE;'));
      assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_recovery_cases_active CASCADE;'));
    });
  });

  // ============================================================================
  // 7. MAESTRO CLINICAL DESIGN SYSTEM GOVERNANCE (ZERO PURPLE BAN)
  // ============================================================================
  describe('7. Maestro Clinical Design System Governance (Purple Ban)', () => {
    const cssPath = path.join(ROOT_DIR, 'src', 'components', 'RecoveryEvidenceTimelineView.css');
    const jsxPath = path.join(ROOT_DIR, 'src', 'components', 'RecoveryEvidenceTimelineView.jsx');
    const purpleTokens = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];

    test('should strictly forbid purple/violet/indigo/magenta/fuchsia tokens in RecoveryEvidenceTimelineView.css', () => {
      assert.ok(fs.existsSync(cssPath), 'CSS file must exist');
      const css = fs.readFileSync(cssPath, 'utf8').toLowerCase();
      purpleTokens.forEach(token => {
        assert.ok(!css.includes(token), `CSS must not contain prohibited token: ${token}`);
      });
      assert.ok(css.includes('#0b1120 !important'), 'CSS must enforce #0b1120 background');
      assert.ok(css.includes('#0f172a !important'), 'CSS must enforce #0f172a card background');
    });

    test('should strictly forbid purple/violet/indigo/magenta/fuchsia tokens in RecoveryEvidenceTimelineView.jsx', () => {
      assert.ok(fs.existsSync(jsxPath), 'JSX file must exist');
      const jsx = fs.readFileSync(jsxPath, 'utf8').toLowerCase();
      purpleTokens.forEach(token => {
        assert.ok(!jsx.includes(token), `JSX must not contain prohibited token: ${token}`);
      });
    });
  });

  // ============================================================================
  // 8. APPLICATION WIRING & MASTER SPECIFICATION COMPLETENESS
  // ============================================================================
  describe('8. Application Wiring & Master Documentation Completeness', () => {
    test('should verify RecoveryEvidenceTimelineView is registered in App.jsx', () => {
      const appPath = path.join(ROOT_DIR, 'src', 'App.jsx');
      const appContent = fs.readFileSync(appPath, 'utf8');

      assert.ok(appContent.includes("import RecoveryEvidenceTimelineView from './components/RecoveryEvidenceTimelineView';"));
      assert.ok(appContent.includes("activeTab === 'recovery_cases'"));
      assert.ok(appContent.includes('<RecoveryEvidenceTimelineView />'));
      assert.ok(appContent.includes('Recovery Evidence & Timeline'));
    });

    test('should verify Phase 93B master markdown specification exists and has required sections', () => {
      const specPath = path.join(ROOT_DIR, 'docs', 'phases', '93B_RECOVERY_EVIDENCE_AND_TIMELINE.md');
      assert.ok(fs.existsSync(specPath), 'Master specification 93B must exist');
      const spec = fs.readFileSync(specPath, 'utf8');

      assert.ok(spec.includes('# 93B RECOVERY EVIDENCE AND TIMELINE'));
      assert.ok(spec.includes('## Purpose'));
      assert.ok(spec.includes('## Scope'));
      assert.ok(spec.includes('## Current State'));
      assert.ok(spec.includes('## Target State'));
      assert.ok(spec.includes('## Data Model / Schema'));
      assert.ok(spec.includes('## Business Rules'));
      assert.ok(spec.includes('## Permissions / Security'));
      assert.ok(spec.includes('## API / Service Requirements'));
      assert.ok(spec.includes('## UI / Workflow Requirements'));
      assert.ok(spec.includes('## QA / Test Cases'));
      assert.ok(spec.includes('## Acceptance Criteria'));
    });
  });
});

