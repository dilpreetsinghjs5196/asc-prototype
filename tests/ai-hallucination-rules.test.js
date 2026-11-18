/**
 * ==============================================================================
 * Phase C5 Test Suite: AI Hallucination Rules & Number Scrubber Tier
 * Module 12: AI & Intelligence
 * Tests: Token extraction, number scrubber validation, CPT validation,
 *        prohibited clinical directives, structured unknown handling,
 *        audit logging, SHA-256 provenance, and zero-purple design compliance.
 * ==============================================================================
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GUARDRAILS_CATALOG,
  INTERCEPT_TYPES,
  ACTIONS_TAKEN,
  UNKNOWN_TEMPLATES,
  getGuardrailCatalog,
  getInterceptLogs,
  getHallucinationTelemetry,
  extractNumericalTokens,
  validateAiResponse,
  generateStructuredUnknown,
  computeInterceptHash
} from '../src/services/aiHallucinationRulesService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase C5: AI Hallucination Rules & Deterministic Number Governance', () => {

  test('1. Hallucination Telemetry returns accurate facility KPIs', () => {
    const telemetry = getHallucinationTelemetry('fac-naples-01');
    assert.strictEqual(telemetry.activeGuardrails, 10, 'Should have exactly 10 active server guardrails');
    assert.ok(telemetry.totalIntercepted >= 4, 'Should record at least 4 intercepted fabrication incidents');
    assert.strictEqual(telemetry.interceptEfficacyPct, 100.0, 'Efficacy should be 100%');
    assert.strictEqual(telemetry.numberScrubberHealthPct, 100.0, 'Scrubber health should be 100%');
    assert.ok(telemetry.avgScrubberLatencyMs > 0, 'Latency should be a positive number');
  });

  test('2. extractNumericalTokens parses currencies, percentages, and durations', () => {
    const sample = 'Adjudicated payment was $3,859.50 with a 73.15% room utilization across 43 minutes for CPT 29881.';
    const tokens = extractNumericalTokens(sample);

    const currency = tokens.find(t => t.type === 'CURRENCY');
    assert.ok(currency);
    assert.strictEqual(currency.value, 3859.50);

    const pct = tokens.find(t => t.type === 'PERCENTAGE');
    assert.ok(pct);
    assert.strictEqual(pct.value, 73.15);

    const duration = tokens.find(t => t.type === 'DURATION');
    assert.ok(duration);
    assert.strictEqual(duration.value, 43);
    assert.strictEqual(duration.unit, 'minutes');

    const cpt = tokens.find(t => t.type === 'CPT_CANDIDATE');
    assert.ok(cpt);
    assert.strictEqual(cpt.code, '29881');
  });

  test('3. validateAiResponse approves candidate responses with 100% grounded numbers', () => {
    const candidateText = 'Contracted allowable is $5,100.00 [E-102], paid amount is $3,859.50 [E-101], leaving an underpayment of $1,240.50.';
    const groundTruth = {
      numbers: [5100.00, 3859.50, 1240.50]
    };

    const result = validateAiResponse(candidateText, groundTruth);
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.status, 'PASSED');
    assert.strictEqual(result.sanitizedResponse, candidateText);
    assert.ok(result.extractedTokenCount >= 3);
  });

  test('4. validateAiResponse intercepts ungrounded fabricated numbers', () => {
    const candidateText = 'Estimated allowable on Case #2026-9041 is $4,500.00 from Aetna.';
    const groundTruth = {
      numbers: [5100.00, 3859.50, 1240.50] // $4,500.00 is NOT in ground truth!
    };

    const result = validateAiResponse(candidateText, groundTruth);
    assert.strictEqual(result.isValid, false);
    assert.strictEqual(result.status, 'INTERCEPTED');
    assert.strictEqual(result.ruleId, 'RULE-NUMBER-SCRUBBER');
    assert.strictEqual(result.interceptType, INTERCEPT_TYPES.UNGROUNDED_NUMBER);
    assert.strictEqual(result.flaggedTokens[0].token, '$4,500.00');
  });

  test('5. validateAiResponse intercepts fabricated non-existent CPT codes', () => {
    const candidateText = 'Submit unlisted procedure code 99999 with modifier 59 to capture maximum reimbursement.';
    const groundTruth = { numbers: [] };

    const result = validateAiResponse(candidateText, groundTruth);
    assert.strictEqual(result.isValid, false);
    assert.strictEqual(result.status, 'INTERCEPTED');
    assert.strictEqual(result.ruleId, 'RULE-CPT-VALIDATION');
    assert.strictEqual(result.interceptType, INTERCEPT_TYPES.FABRICATED_CODE);
    assert.strictEqual(result.flaggedTokens[0].token, '99999');
  });

  test('6. validateAiResponse intercepts prohibited prescriptive clinical directives', () => {
    const candidateText = 'The patient has severe joint inflammation. Administer 10mg IV Ketorolac immediately.';
    const groundTruth = { numbers: [] };

    const result = validateAiResponse(candidateText, groundTruth);
    assert.strictEqual(result.isValid, false);
    assert.strictEqual(result.status, 'INTERCEPTED');
    assert.strictEqual(result.ruleId, 'RULE-NON-CLINICAL-DIRECTIVE');
    assert.strictEqual(result.interceptType, INTERCEPT_TYPES.PROHIBITED_DIRECTIVE);
  });

  test('7. generateStructuredUnknown returns compliant missing data refusal for missing case', () => {
    const unknownResp = generateStructuredUnknown('MISSING_CASE', 'CASE-99999');
    assert.strictEqual(unknownResp.status, 'UNKNOWN_DATA');
    assert.strictEqual(unknownResp.code, 'ERR_RECORD_NOT_FOUND');
    assert.ok(unknownResp.message.includes('CASE-99999'));
    assert.ok(unknownResp.missingPrerequisites.length >= 2);
    assert.ok(unknownResp.recommendedAction.includes('cpt_economics_query'));
  });

  test('8. generateStructuredUnknown returns compliant response for uncontracted payer', () => {
    const unknownResp = generateStructuredUnknown('UNCONTRACTED_PAYER', 'Humana Commercial');
    assert.strictEqual(unknownResp.status, 'UNKNOWN_DATA');
    assert.strictEqual(unknownResp.code, 'ERR_UNCONTRACTED_PAYER');
    assert.ok(unknownResp.message.includes('Humana Commercial'));
    assert.ok(unknownResp.missingPrerequisites.length >= 2);
    assert.ok(unknownResp.recommendedAction.includes('payer_realization_rate'));
  });

  test('9. Intercept Audit Logs retrieve and filter historical incidents', () => {
    const allLogs = getInterceptLogs('fac-naples-01');
    assert.ok(allLogs.length >= 4);

    const numberLogs = getInterceptLogs('fac-naples-01', { type: INTERCEPT_TYPES.UNGROUNDED_NUMBER });
    assert.ok(numberLogs.length >= 1);
    assert.ok(numberLogs.every(l => l.interceptType === INTERCEPT_TYPES.UNGROUNDED_NUMBER));

    const searchLogs = getInterceptLogs('fac-naples-01', { searchQuery: 'Ketorolac' });
    assert.ok(searchLogs.length >= 1);
  });

  test('10. Cryptographic SHA-256 intercept hash is deterministic and tamper-evident', () => {
    const h1 = computeInterceptHash('Prompt 1', 'Candidate 1', [{ token: '$100' }]);
    const h2 = computeInterceptHash('Prompt 1', 'Candidate 1', [{ token: '$100' }]);
    assert.strictEqual(h1, h2, 'Identical inputs must yield identical hash');
    assert.strictEqual(h1.length, 64, 'SHA-256 hash must be 64 characters long');

    const h3 = computeInterceptHash('Prompt 1', 'Candidate 1', [{ token: '$101' }]);
    assert.notStrictEqual(h1, h3, 'Altered token must change hash');
  });

  test('11. PostgreSQL Migration 103 Schema Integrity', () => {
    const upSqlPath = path.resolve(__dirname, '../supabase/migrations/103_ai_hallucination_rules.sql');
    const downSqlPath = path.resolve(__dirname, '../supabase/migrations/103_ai_hallucination_rules_down.sql');

    assert.ok(fs.existsSync(upSqlPath), '103 UP migration file must exist');
    assert.ok(fs.existsSync(downSqlPath), '103 DOWN migration file must exist');

    const upContent = fs.readFileSync(upSqlPath, 'utf8');
    const downContent = fs.readFileSync(downSqlPath, 'utf8');

    assert.ok(upContent.includes('CREATE TABLE IF NOT EXISTS public.ai_hallucination_guardrails'));
    assert.ok(upContent.includes('CREATE TABLE IF NOT EXISTS public.ai_hallucination_intercept_logs'));
    assert.ok(upContent.includes('CREATE TABLE IF NOT EXISTS public.ai_unknown_handling_templates'));
    assert.ok(upContent.includes('vw_ai_hallucination_intercept_metrics'));
    assert.ok(upContent.includes('app.current_facility_id'), 'Must use app.current_facility_id for RLS');
    assert.ok(!upContent.includes('user_facility_access'), 'Must NOT reference non-existent user_facility_access');

    assert.ok(downContent.includes('DROP TABLE IF EXISTS public.ai_hallucination_guardrails'));
  });

  test('12. Maestro Clinical Zero-Purple Design Compliance in C5 component and styles', () => {
    const jsxPath = path.resolve(__dirname, '../src/components/AIHallucinationRulesView.jsx');
    const cssPath = path.resolve(__dirname, '../src/components/AIHallucinationRulesView.css');

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
        `Prohibited token '${token}' found in AIHallucinationRulesView.jsx`
      );
      assert.strictEqual(
        cssContent.toLowerCase().includes(token.toLowerCase()),
        false,
        `Prohibited token '${token}' found in AIHallucinationRulesView.css`
      );
    }
  });

  test('13. Stylesheet contains explicit dark theme [data-theme="dark"] contrast overrides', () => {
    const cssPath = path.resolve(__dirname, '../src/components/AIHallucinationRulesView.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    assert.ok(cssContent.includes('[data-theme="dark"]'), 'Must contain [data-theme="dark"] rules');
    assert.ok(cssContent.includes('[data-theme="dark"] .aihr-ribbon-card'), 'Must style ribbon cards for dark mode');
    assert.ok(cssContent.includes('[data-theme="dark"] .policy-card'), 'Must style policy cards for dark mode');
    assert.ok(cssContent.includes('[data-theme="dark"] .aihr-modal-drawer'), 'Must style modal drawer for dark mode');
    assert.ok(!cssContent.includes('bg-hover'), 'Must not reference undefined var(--bg-hover)');
  });

  test('14. App.jsx registers AIHallucinationRulesView with sidebar, title, and tab routing', () => {
    const appPath = path.resolve(__dirname, '../src/App.jsx');
    const appContent = fs.readFileSync(appPath, 'utf8');

    assert.ok(appContent.includes("import AIHallucinationRulesView from './components/AIHallucinationRulesView'"));
    assert.ok(appContent.includes("activeTab === 'ai_hallucination_rules'"));
    assert.ok(appContent.includes('<AIHallucinationRulesView activeFacility={activeFacility} />'));
  });

  test('15. src/lib facade re-exports aiHallucinationRulesService cleanly', () => {
    const libPath = path.resolve(__dirname, '../src/lib/aiHallucinationRulesService.js');
    assert.ok(fs.existsSync(libPath), 'Lib facade must exist');
    const libContent = fs.readFileSync(libPath, 'utf8');
    assert.ok(libContent.includes("export * from '../services/aiHallucinationRulesService.js'"));
  });

});
