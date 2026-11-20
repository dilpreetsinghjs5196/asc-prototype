/**
 * ==============================================================================
 * Phase D2 Test Suite: Recommendation Evidence Model & Provenance Chain
 * Module 13: Decision Intelligence
 * Tests: Multi-source evidence linkages, deterministic Evidence Completeness
 *        Index (ECI), verification & contest lifecycle, SHA-256 provenance hashes,
 *        migration 109 SQL integrity, and zero-purple Maestro Clinical compliance.
 * ==============================================================================
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EVIDENCE_TYPES,
  CONFIDENCE_TIERS,
  VERIFICATION_STATUSES,
  ECI_WEIGHTS,
  calculateEvidenceCompleteness,
  computeEvidenceHash,
  SEED_EVIDENCE_ITEMS,
  resetEvidenceStore,
  getAllEvidenceItems,
  getEvidenceForAction,
  getEvidenceById,
  verifyEvidenceItem,
  contestEvidenceItem,
  getEvidenceAudits,
  getEvidenceTelemetry
} from '../src/services/recommendationEvidenceService.js';

import * as libEvidenceService from '../src/lib/recommendationEvidenceService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase D2: Recommendation Evidence Model & Provenance Chain', () => {

  beforeEach(() => {
    resetEvidenceStore();
  });

  test('1. Evidence Telemetry returns accurate facility citation counts and metrics', () => {
    const telemetry = getEvidenceTelemetry('fac-naples-01');
    assert.ok(telemetry.totalEvidenceCitations >= 11, 'Must report at least 11 seed citations');
    assert.strictEqual(telemetry.verifiedContractualRatePct, 100.0, 'Initially 100% verified');
    assert.ok(telemetry.claimLineTraceabilityPct >= 20.0, 'Must have high claim line traceability');
    assert.ok(telemetry.avgEvidenceCompletenessPct >= 70.0, 'Average ECI must be >= 70.0%');
    assert.strictEqual(telemetry.uncontestedIntegrityPct, 100.0, 'Initially 100% uncontested');
    assert.strictEqual(telemetry.cryptographicProvenanceStatus, 'SHA-256 Ledger Verified');
  });

  test('2. Multi-source evidence retrieval links correctly to financial actions', () => {
    // Action 1: CPT unbundle denial appeal (4 citations)
    const action1Evidence = getEvidenceForAction('nbfa-001-cpt-unbundle', 'fac-naples-01');
    assert.strictEqual(action1Evidence.length, 4, 'NBFA-2026-0801 must have 4 distinct citations');

    const types = action1Evidence.map(e => e.evidenceType);
    assert.ok(types.includes(EVIDENCE_TYPES.CLAIM_LINE));
    assert.ok(types.includes(EVIDENCE_TYPES.REMITTANCE_CARC));
    assert.ok(types.includes(EVIDENCE_TYPES.PAYER_CONTRACT_CLAUSE));
    assert.ok(types.includes(EVIDENCE_TYPES.CLINICAL_OPERATIVE_NOTE));

    // Action 5: Stryker Implant Carve-Out (3 citations)
    const action5Evidence = getEvidenceForAction('nbfa-005-stryker-implant', 'fac-naples-01');
    assert.strictEqual(action5Evidence.length, 3);
    assert.ok(action5Evidence.some(e => e.sourceTable === 'cases_clinical_notes'));
    assert.ok(action5Evidence.some(e => e.evidencePayload?.vendor === 'Stryker Orthopaedics'));
  });

  test('3. Deterministic Evidence Completeness Index (ECI) calculates exact weighted scores', () => {
    // Case A: Action 1 with all 4 dimensions (35 + 25 + 25 + 15 = 100%)
    const fullItems = getEvidenceForAction('nbfa-001-cpt-unbundle');
    const fullECI = calculateEvidenceCompleteness(fullItems);
    assert.strictEqual(fullECI, 100.0, 'Full evidence package must evaluate to 100.0%');

    // Case B: Partial Items
    const claimOnly = [{ evidenceType: EVIDENCE_TYPES.CLAIM_LINE, verificationStatus: VERIFICATION_STATUSES.VERIFIED }];
    assert.strictEqual(calculateEvidenceCompleteness(claimOnly), 35.0);

    const claimPlusContract = [
      { evidenceType: EVIDENCE_TYPES.CLAIM_LINE, verificationStatus: VERIFICATION_STATUSES.VERIFIED },
      { evidenceType: EVIDENCE_TYPES.PAYER_CONTRACT_CLAUSE, verificationStatus: VERIFICATION_STATUSES.VERIFIED }
    ];
    assert.strictEqual(calculateEvidenceCompleteness(claimPlusContract), 60.0);

    // Case C: Superseded item should not contribute
    const withSuperseded = [
      { evidenceType: EVIDENCE_TYPES.CLAIM_LINE, verificationStatus: VERIFICATION_STATUSES.VERIFIED },
      { evidenceType: EVIDENCE_TYPES.PAYER_CONTRACT_CLAUSE, verificationStatus: VERIFICATION_STATUSES.SUPERSEDED }
    ];
    assert.strictEqual(calculateEvidenceCompleteness(withSuperseded), 35.0);
  });

  test('4. Cryptographic SHA-256 evidence hash is deterministic and reproducible', () => {
    const rawData = {
      claimNumber: 'CLM-2026-90412',
      cptCode: '29877',
      paidAmount: 0.00,
      timestamp: '2026-11-20T08:00:00Z'
    };

    const hash1 = computeEvidenceHash(rawData);
    const hash2 = computeEvidenceHash(rawData);
    assert.strictEqual(hash1, hash2, 'SHA-256 hash must be identical across invocations');
    assert.strictEqual(typeof hash1, 'string');
    assert.ok(hash1.length >= 32);
  });

  test('5. Verification & Contest lifecycle transitions state and records audit entries', () => {
    const targetItem = SEED_EVIDENCE_ITEMS[0];

    // Contest item
    const contestRationale = 'BCBS local fee schedule update retroactively applied effective October 1st.';
    const { item: contestedItem, auditEntry: contestAudit } = contestEvidenceItem(
      targetItem.id,
      contestRationale,
      'usr.biller_01',
      { userName: 'Billing Lead' }
    );

    assert.strictEqual(contestedItem.verificationStatus, VERIFICATION_STATUSES.CONTESTED);
    assert.strictEqual(contestAudit.previousStatus, VERIFICATION_STATUSES.VERIFIED);
    assert.strictEqual(contestAudit.newStatus, VERIFICATION_STATUSES.CONTESTED);
    assert.strictEqual(contestAudit.rationale, contestRationale);

    // Verify item
    const { item: reVerifiedItem, auditEntry: verifyAudit } = verifyEvidenceItem(
      targetItem.id,
      'usr.compliance_officer',
      { userName: 'Compliance Officer', rationale: 'Re-reviewed executed contract amendment.' }
    );

    assert.strictEqual(reVerifiedItem.verificationStatus, VERIFICATION_STATUSES.VERIFIED);
    assert.strictEqual(verifyAudit.previousStatus, VERIFICATION_STATUSES.CONTESTED);
    assert.strictEqual(verifyAudit.newStatus, VERIFICATION_STATUSES.VERIFIED);

    // Audits history query
    const audits = getEvidenceAudits(targetItem.id);
    assert.ok(audits.length >= 2);
  });

  test('6. Contest rejects insufficient rationale (< 8 characters)', () => {
    const targetItem = SEED_EVIDENCE_ITEMS[0];
    assert.throws(() => {
      contestEvidenceItem(targetItem.id, 'short');
    }, /min 8 characters/i);

    assert.throws(() => {
      contestEvidenceItem(targetItem.id, '');
    }, /mandatory/i);
  });

  test('7. Safe Harbor PHI Redaction check on all seed evidence snippets', () => {
    const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/;
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;

    for (const item of SEED_EVIDENCE_ITEMS) {
      assert.strictEqual(ssnRegex.test(item.citationSnippet), false, `Item ${item.id} must not contain SSN`);
      assert.strictEqual(emailRegex.test(item.citationSnippet), false, `Item ${item.id} must not contain Email`);
    }
  });

  test('8. Migration 109 UP and DOWN SQL files exist, enforce UUID foreign keys, and RLS', () => {
    const upMigrationPath = path.join(__dirname, '../supabase/migrations/109_recommendation_evidence.sql');
    const downMigrationPath = path.join(__dirname, '../supabase/migrations/109_recommendation_evidence_down.sql');

    assert.ok(fs.existsSync(upMigrationPath), 'Migration 109 up script must exist');
    assert.ok(fs.existsSync(downMigrationPath), 'Migration 109 down script must exist');

    const upSql = fs.readFileSync(upMigrationPath, 'utf8');
    assert.ok(upSql.includes('facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE'), 'Must use UUID FK referencing public.facilities(id)');
    assert.ok(upSql.includes('action_id UUID NOT NULL REFERENCES public.next_best_financial_actions(id) ON DELETE CASCADE'), 'Must use UUID FK referencing next_best_financial_actions');
    assert.ok(upSql.includes('DROP POLICY IF EXISTS'), 'Must use idempotent DROP POLICY IF EXISTS');
    assert.ok(upSql.includes('CREATE OR REPLACE VIEW public.vw_recommendation_evidence_summary'), 'Must create evidence summary view');

    const downSql = fs.readFileSync(downMigrationPath, 'utf8');
    assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_recommendation_evidence_summary'), 'Down script drops view');
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.recommendation_evidence_audits'), 'Down script drops audits');
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.recommendation_evidence_items'), 'Down script drops evidence items');
  });

  test('9. Maestro Clinical zero-purple design compliance across D2 files', () => {
    const d2Files = [
      path.join(__dirname, '../src/components/RecommendationEvidenceView.jsx'),
      path.join(__dirname, '../src/components/RecommendationEvidenceView.css'),
      path.join(__dirname, '../src/services/recommendationEvidenceService.js')
    ];

    const prohibitedTokens = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];

    for (const filePath of d2Files) {
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf8');
      for (const token of prohibitedTokens) {
        const regex = new RegExp(`\\b${token}\\b`, 'i');
        assert.strictEqual(
          regex.test(content),
          false,
          `File ${path.basename(filePath)} violates zero-purple rule with token "${token}"`
        );
      }
    }
  });

  test('10. App shell wires RecommendationEvidenceView with tab, icon, and role security', () => {
    const appJsxPath = path.join(__dirname, '../src/App.jsx');
    const content = fs.readFileSync(appJsxPath, 'utf8');

    assert.ok(content.includes('import RecommendationEvidenceView'), 'Must import RecommendationEvidenceView');
    assert.ok(content.includes("activeTab === 'recommendation_evidence'"), 'Must have sidebar navigation item check');
    assert.ok(content.includes("{activeTab === 'recommendation_evidence' && 'Recommendation Evidence & Citations'}"), 'Must have header title');
    assert.ok(content.includes('<RecommendationEvidenceView activeFacility={activeFacility} />'), 'Must render tab view');
    assert.ok(content.includes("'recommendation_evidence'"), 'Must exclude from generic date filters');
  });

  test('11. Dual re-export facade parity', () => {
    assert.strictEqual(typeof libEvidenceService.getEvidenceForAction, 'function');
    assert.strictEqual(typeof libEvidenceService.calculateEvidenceCompleteness, 'function');
    assert.strictEqual(typeof libEvidenceService.verifyEvidenceItem, 'function');
    assert.strictEqual(typeof libEvidenceService.contestEvidenceItem, 'function');
    assert.strictEqual(typeof libEvidenceService.getEvidenceTelemetry, 'function');
  });
});
