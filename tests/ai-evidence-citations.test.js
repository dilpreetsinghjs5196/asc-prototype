/**
 * ==============================================================================
 * Phase C4 Test Suite: AI Evidence, Citations & Explainability Tier
 * Module 12: AI & Intelligence
 * Tests: Provenance hashing, source record anchors, live verification,
 *        data drift detection, mathematical explainability decomposition,
 *        inline citation token parsing, batch audit sweeps, and design tokens.
 * ==============================================================================
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EVIDENCE_SOURCE_TYPES,
  VERIFICATION_STATUSES,
  EVIDENCE_SOURCES_META,
  SEED_CITATIONS,
  MOCK_SOURCE_RECORDS,
  computeProvenanceHash,
  getCitationCatalog,
  getCitationDetail,
  verifyCitation,
  batchVerifyCitations,
  rebaselineCitation,
  decomposeMetricExplainability,
  parseInlineCitations,
  getEvidenceTelemetry
} from '../src/services/aiEvidenceService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase C4: AI Evidence, Citations & Explainability Architecture', () => {

  test('1. Evidence Telemetry computes accurate facility KPIs', () => {
    const telemetry = getEvidenceTelemetry('fac-naples-01');
    assert.ok(telemetry.totalCitations >= 12, 'Should have at least 12 registered citations');
    assert.ok(telemetry.verifiedAnchors >= 10, 'Should have at least 10 verified anchors');
    assert.ok(telemetry.verificationHealthPct >= 80, 'Verification health should be at least 80%');
    assert.strictEqual(telemetry.sourceTypesCovered, 6, 'Should cover 6 distinct authoritative healthcare domains');
    assert.ok(telemetry.dataDriftAlerts >= 1, 'Should reflect at least 1 simulated data drift alert');
    assert.ok(telemetry.avgVerificationLatencyMs > 0, 'Verification latency should be positive');
  });

  test('2. Citation catalog supports domain and status filtering', () => {
    const allCitations = getCitationCatalog('fac-naples-01');
    assert.ok(allCitations.length >= 12);

    const caseCitations = getCitationCatalog('fac-naples-01', { sourceType: EVIDENCE_SOURCE_TYPES.EHR_CASE });
    assert.ok(caseCitations.length >= 4);
    assert.ok(caseCitations.every(c => c.sourceType === EVIDENCE_SOURCE_TYPES.EHR_CASE));

    const driftedCitations = getCitationCatalog('fac-naples-01', { status: VERIFICATION_STATUSES.DATA_DRIFT });
    assert.strictEqual(driftedCitations.length, 1);
    assert.strictEqual(driftedCitations[0].citationCode, 'E-111');

    const searchResults = getCitationCatalog('fac-naples-01', { searchQuery: 'meniscectomy' });
    assert.ok(searchResults.length >= 1);
    assert.ok(searchResults.some(c => c.statementContext.includes('meniscectomy')));
  });

  test('3. Cryptographic SHA-256 provenance hash is deterministic and tamper-evident', () => {
    const hash1 = computeProvenanceHash('EHR_CASE', 'case_9041', 'financial.netUnderpayment', 1240.50);
    const hash2 = computeProvenanceHash('EHR_CASE', 'case_9041', 'financial.netUnderpayment', 1240.50);
    assert.strictEqual(hash1, hash2, 'Identical inputs must yield identical hash');
    assert.strictEqual(hash1.length, 64, 'SHA-256 hash must be 64 characters long');

    // Tampered value produces different hash
    const tamperedHash = computeProvenanceHash('EHR_CASE', 'case_9041', 'financial.netUnderpayment', 1240.51);
    assert.notStrictEqual(hash1, tamperedHash, 'Altered numerical value must produce completely different hash');
  });

  test('4. Live verification confirms unaltered source record matches 100%', () => {
    const result = verifyCitation('cit-001');
    assert.strictEqual(result.status, VERIFICATION_STATUSES.VERIFIED);
    assert.strictEqual(result.hashMatch, true);
    assert.strictEqual(result.claimedValue, 3859.50);
    assert.strictEqual(result.currentValue, 3859.50);
    assert.ok(result.message.includes('zero drift'));
  });

  test('5. Data drift is accurately flagged when source record is retro-adjusted', () => {
    const result = verifyCitation('cit-011');
    assert.strictEqual(result.status, VERIFICATION_STATUSES.DATA_DRIFT);
    assert.strictEqual(result.hashMatch, false);
    assert.strictEqual(result.claimedValue, 8750.00);
    assert.strictEqual(result.currentValue, 9100.00);
    assert.ok(result.message.includes('Data drift detected'));
  });

  test('6. Re-baseline updates drifted citation to match active database state', () => {
    const rebaseRes = rebaselineCitation('cit-011', 'compliance_auditor');
    assert.strictEqual(rebaseRes.newStatus, VERIFICATION_STATUSES.VERIFIED);
    assert.strictEqual(rebaseRes.newClaimedValue, 9100.00);
    assert.ok(rebaseRes.newProvenanceHash.length === 64);

    // Verify citation is now verified
    const verifyRes = verifyCitation('cit-011');
    assert.strictEqual(verifyRes.status, VERIFICATION_STATUSES.VERIFIED);
    assert.strictEqual(verifyRes.hashMatch, true);

    // Reset back for subsequent test runs
    const cit11 = SEED_CITATIONS.find(c => c.id === 'cit-011');
    cit11.claimedValue = 8750.00;
    cit11.verificationStatus = VERIFICATION_STATUSES.DATA_DRIFT;
  });

  test('7. Citation detail retrieves full raw document snapshot and metadata', () => {
    const detail = getCitationDetail('cit-003');
    assert.strictEqual(detail.citation.id, 'cit-003');
    assert.strictEqual(detail.sourceMeta.sourceTable, 'cases');
    assert.strictEqual(detail.rawDocument.recordKey, 'CASE-2026-9041');
    assert.strictEqual(detail.rawDocument.primaryCpt, '29881');
    assert.strictEqual(detail.rawDocument.financial.netUnderpayment, 1240.50);
    assert.ok(detail.explainabilityTrace, 'Should include explainability trace');
  });

  test('8. Non-existent citation ID throws structured error', () => {
    assert.throws(() => {
      getCitationDetail('cit-nonexistent-999');
    }, /Citation not found/);
  });

  test('9. Mathematical Explainability: Contribution Margin per OR Hour balances to $0.00', () => {
    const rawDoc = MOCK_SOURCE_RECORDS['case_2026_9041'];
    const trace = decomposeMetricExplainability('financial.contributionMarginPerOrHour', { rawDocument: rawDoc });
    
    assert.strictEqual(trace.metricName, 'Contribution Margin per OR Hour');
    assert.strictEqual(trace.isBalanced, true);
    assert.strictEqual(trace.tolerance, 0.00);
    assert.strictEqual(trace.inputs.length, 3);
    assert.strictEqual(trace.steps.length, 2);
    assert.strictEqual(trace.finalValue, 1659.86);
  });

  test('10. Mathematical Explainability: Net Underpayment Variance balances to $0.00', () => {
    const rawDoc = MOCK_SOURCE_RECORDS['case_2026_9041'];
    const trace = decomposeMetricExplainability('financial.netUnderpayment', { rawDocument: rawDoc });
    
    assert.strictEqual(trace.metricName, 'Net Underpayment Variance');
    assert.strictEqual(trace.isBalanced, true);
    assert.strictEqual(trace.finalValue, 1240.50);
  });

  test('11. Mathematical Explainability: Staffed Room Utilization Percentage balances to $0.00', () => {
    const rawDoc = MOCK_SOURCE_RECORDS['or_log_room2_20261112'];
    const trace = decomposeMetricExplainability('roomUtilizationPct', { rawDocument: rawDoc });
    
    assert.strictEqual(trace.metricName, 'Staffed Room Utilization Percentage');
    assert.strictEqual(trace.isBalanced, true);
    assert.strictEqual(trace.finalValue, 73.15);
  });

  test('12. Inline citation token parser identifies [E#] and anchors to records', () => {
    const text = 'Underpayment was recorded at $1,240.50 [E-103] for Case [E-101] under contract [E-102].';
    const matches = parseInlineCitations(text);
    
    assert.strictEqual(matches.length, 3);
    assert.strictEqual(matches[0].code, 'E-103');
    assert.strictEqual(matches[0].citation.id, 'cit-003');
    assert.strictEqual(matches[1].code, 'E-101');
    assert.strictEqual(matches[1].citation.id, 'cit-001');
    assert.strictEqual(matches[2].code, 'E-102');
    assert.strictEqual(matches[2].citation.id, 'cit-002');
  });

  test('13. Batch verification sweep processes all facility citations', () => {
    const batchRes = batchVerifyCitations('fac-naples-01');
    assert.strictEqual(batchRes.facilityId, 'fac-naples-01');
    assert.ok(batchRes.totalScanned >= 12);
    assert.ok(batchRes.verifiedCount >= 10);
    assert.ok(batchRes.driftedCount >= 1);
    assert.ok(batchRes.healthPct > 0);
    assert.ok(batchRes.durationMs >= 0);
  });

  test('14. Zero prohibited purple tokens in Phase C4 component and stylesheet', () => {
    const jsxPath = path.resolve(__dirname, '../src/components/AIEvidenceCitationsView.jsx');
    const cssPath = path.resolve(__dirname, '../src/components/AIEvidenceCitationsView.css');
    
    const jsxContent = fs.readFileSync(jsxPath, 'utf8');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    const prohibitedTokens = [
      '#8b5cf6', '#7c3aed', '#6366f1', '#a855f7',
      'purple', 'violet', 'indigo', 'fuchsia', 'magenta'
    ];

    for (const token of prohibitedTokens) {
      assert.strictEqual(
        jsxContent.toLowerCase().includes(token.toLowerCase()),
        false,
        `Prohibited token '${token}' found in AIEvidenceCitationsView.jsx`
      );
      assert.strictEqual(
        cssContent.toLowerCase().includes(token.toLowerCase()),
        false,
        `Prohibited token '${token}' found in AIEvidenceCitationsView.css`
      );
    }
  });

  test('15. Stylesheet contains explicit dark theme [data-theme="dark"] contrast overrides', () => {
    const cssPath = path.resolve(__dirname, '../src/components/AIEvidenceCitationsView.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    assert.ok(cssContent.includes('[data-theme="dark"]'), 'Must contain [data-theme="dark"] rules');
    assert.ok(cssContent.includes('[data-theme="dark"] .citation-meta-grid'), 'Must style citation meta grid for dark mode');
    assert.ok(cssContent.includes('[data-theme="dark"] .aiev-ribbon-card'), 'Must style ribbon cards for dark mode');
    assert.ok(cssContent.includes('[data-theme="dark"] .aiev-modal-drawer'), 'Must style modal drawer for dark mode');
    assert.ok(!cssContent.includes('bg-hover'), 'Must not reference undefined var(--bg-hover)');
  });

});
