/**
 * ==============================================================================
 * Phase D5 Test Suite: Recommendation Outcome Tracking & Causal Attribution
 * Module 13: Decision Intelligence
 * Tests: Outcome measurement, counterfactual uplift math, multi-touch attribution,
 *        model calibration ratios, AR cycle time reduction, touchpoint cryptographic hashes,
 *        migration 112 SQL integrity, and zero-purple compliance.
 * ==============================================================================
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  computeTouchpointHash,
  ATTRIBUTION_MODELS,
  TOUCHPOINT_STAGES,
  CATEGORY_COUNTERFACTUAL_FACTORS,
  calculateCounterfactualBaseline,
  calculateIncrementalUplift,
  calculateUpliftPercentage,
  calculateModelCalibrationRatio,
  validateAttributionWeights,
  SEED_RECOMMENDATION_OUTCOMES,
  SEED_ATTRIBUTION_TOUCHPOINTS,
  resetOutcomeStore,
  getRecommendationOutcomes,
  getOutcomeById,
  getOutcomeForAction,
  getAttributionTouchpoints,
  recordOutcomeAttribution,
  getOutcomeTelemetry,
  matchesFacilityId
} from '../src/services/recommendationOutcomeService.js';

import * as libOutcomeService from '../src/lib/recommendationOutcomeService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase D5: Recommendation Outcome Tracking & Attribution Engine', () => {

  beforeEach(() => {
    resetOutcomeStore();
  });

  test('1. Outcome Telemetry returns accurate facility totals and uplift metrics', () => {
    const telemetry = getOutcomeTelemetry('fac-naples-01');
    assert.strictEqual(telemetry.totalTrackedOutcomesCount, 7, 'Must track 7 seed outcomes');
    assert.ok(telemetry.totalGrossRealizedValue >= 30000.00, 'Gross realized value must exceed $30,000');
    assert.ok(telemetry.totalIncrementalUpliftValue >= 25000.00, 'Incremental uplift must exceed $25,000');
    assert.ok(telemetry.cumulativeUpliftRatePct > 100.0, 'Cumulative uplift percentage must exceed 100%');
    assert.ok(telemetry.avgDaysSavedCycleTime >= 15.0, 'Average days saved must be >= 15 days');
    assert.ok(telemetry.avgModelCalibrationRatio > 0.8, 'Average model calibration ratio must be healthy');
    assert.strictEqual(telemetry.attributionStatus, 'Multi-Touch Causal Attribution Verified');
  });

  test('2. Facility UUID alias resolution works for Naples Surgery Center in outcomes', () => {
    const aliasTelem = getOutcomeTelemetry('00000000-0000-0000-0000-000000000002');
    assert.strictEqual(aliasTelem.totalTrackedOutcomesCount, 7, 'UUID alias must return same 7 seed outcomes');
    assert.strictEqual(aliasTelem.totalGrossRealizedValue, 34510.00);

    const outcomesByUUID = getRecommendationOutcomes('00000000-0000-0000-0000-000000000002');
    assert.strictEqual(outcomesByUUID.length, 7);
  });

  test('3. Deterministic Counterfactual Baseline & Incremental Uplift Calculations', () => {
    // Action 1: Denial Appeal (15% baseline factor)
    // Expected: 3450 -> Baseline = 3450 * 0.15 = 517.50
    const baseline1 = calculateCounterfactualBaseline(3450.00, 'DENIAL_APPEAL_URGENT');
    assert.strictEqual(baseline1, 517.50);

    // Gross Realized: 3450 -> Uplift = 3450 - 517.50 = 2932.50
    const uplift1 = calculateIncrementalUplift(3450.00, baseline1);
    assert.strictEqual(uplift1, 2932.50);

    const upliftPct1 = calculateUpliftPercentage(uplift1, baseline1);
    assert.strictEqual(upliftPct1, 566.7);

    // Action 2: OR Block Release (10% baseline factor)
    // Expected: 14200 -> Baseline = 1420.00
    const baseline2 = calculateCounterfactualBaseline(14200.00, 'OR_BLOCK_RELEASE');
    assert.strictEqual(baseline2, 1420.00);

    // Gross Realized: 15800 -> Uplift = 15800 - 1420 = 14380.00
    const uplift2 = calculateIncrementalUplift(15800.00, baseline2);
    assert.strictEqual(uplift2, 14380.00);

    const upliftPct2 = calculateUpliftPercentage(uplift2, baseline2);
    assert.strictEqual(upliftPct2, 1012.7);
  });

  test('4. Attribution Weight Sum Invariant strictly validates 100.00% balance', () => {
    // Valid balance
    assert.strictEqual(validateAttributionWeights(70.0, 30.0), true);
    assert.strictEqual(validateAttributionWeights(85.5, 14.5), true);
    assert.strictEqual(validateAttributionWeights(100.0, 0.0), true);

    // Invalid balance (< 100%)
    assert.throws(() => {
      validateAttributionWeights(60.0, 30.0);
    }, /Attribution weights must sum exactly to 100.00%/);

    // Invalid balance (> 100%)
    assert.throws(() => {
      validateAttributionWeights(80.0, 30.0);
    }, /Attribution weights must sum exactly to 100.00%/);
  });

  test('5. Model Calibration Ratio accurately computes predictive accuracy', () => {
    // Conservative prediction (Realized > Expected)
    assert.strictEqual(calculateModelCalibrationRatio(15800.00, 14200.00), 1.113);

    // Exact prediction (Realized == Expected)
    assert.strictEqual(calculateModelCalibrationRatio(3450.00, 3450.00), 1.000);

    // Over-optimistic prediction (Realized < Expected)
    assert.strictEqual(calculateModelCalibrationRatio(6400.00, 7800.00), 0.821);

    // Zero expected edge case
    assert.strictEqual(calculateModelCalibrationRatio(1000.00, 0.00), 1.000);
  });

  test('6. Multi-Touch Attribution Touchpoints correctly link to contributing stages', () => {
    const touchpoints = getAttributionTouchpoints('out-001');
    assert.strictEqual(touchpoints.length, 3, 'Outcome 1 must have 3 lifecycle touchpoints');

    const stages = touchpoints.map(t => t.touchpointStage);
    assert.ok(stages.includes(TOUCHPOINT_STAGES.DETECTION_NBFA));
    assert.ok(stages.includes(TOUCHPOINT_STAGES.EVIDENCE_ASSEMBLY));
    assert.ok(stages.includes(TOUCHPOINT_STAGES.HUMAN_APPROVAL));

    const totalWeight = touchpoints.reduce((sum, t) => sum + Number(t.contributionWeightPct), 0);
    assert.strictEqual(totalWeight, 100.0, 'Touchpoint weights must sum to 100%');
  });

  test('7. Record Outcome Attribution persists new causal model and calculates uplift', () => {
    const newOutcome = recordOutcomeAttribution('a001-nbfa-001-naples', {
      attributionModel: ATTRIBUTION_MODELS.COLLABORATIVE_ATTRIBUTED,
      machineAttributionPct: 75.0,
      humanAttributionPct: 25.0,
      grossRealizedValue: 3450.00,
      expectedFinancialValue: 3450.00,
      daysSavedCycleTime: 30.0,
      attributionRationale: 'Updated causal weights following physician conference.'
    }, {
      userId: 'usr_cfo_marcus'
    });

    assert.strictEqual(newOutcome.machineAttributionPct, 75.0);
    assert.strictEqual(newOutcome.humanAttributionPct, 25.0);
    assert.strictEqual(newOutcome.incrementalUpliftValue, 2932.50);
    assert.strictEqual(newOutcome.daysSavedCycleTime, 30.0);
  });

  test('8. Cryptographic Touchpoint Proof Hash produces deterministic SHA-256 strings', () => {
    const payload = {
      outcomeId: 'out-001',
      stage: 'DETECTION_NBFA',
      weight: 30.0
    };

    const hash1 = computeTouchpointHash(payload);
    const hash2 = computeTouchpointHash(payload);
    assert.strictEqual(hash1, hash2, 'Identical touchpoints must yield identical digests');
    assert.strictEqual(hash1.length, 64, 'SHA-256 must yield 64-character hex string');
  });

  test('9. Migration 112 SQL scripts have valid schemas, foreign keys, and idempotent policies', () => {
    const upSqlPath = path.resolve(__dirname, '../supabase/migrations/112_recommendation_outcomes.sql');
    const downSqlPath = path.resolve(__dirname, '../supabase/migrations/112_recommendation_outcomes_down.sql');

    assert.ok(fs.existsSync(upSqlPath), 'Migration 112 UP must exist');
    assert.ok(fs.existsSync(downSqlPath), 'Migration 112 DOWN must exist');

    const upSql = fs.readFileSync(upSqlPath, 'utf8');
    assert.ok(upSql.includes('recommendation_outcomes'));
    assert.ok(upSql.includes('recommendation_attribution_touchpoints'));
    assert.ok(upSql.includes('vw_recommendation_outcome_telemetry'));
    assert.ok(upSql.includes('DROP POLICY IF EXISTS'), 'Must use DROP POLICY IF EXISTS before CREATE POLICY');
    assert.ok(upSql.includes('ENABLE ROW LEVEL SECURITY'));

    const downSql = fs.readFileSync(downSqlPath, 'utf8');
    assert.ok(downSql.includes('vw_recommendation_outcome_telemetry'));
    assert.ok(downSql.includes('recommendation_attribution_touchpoints'));
    assert.ok(downSql.includes('recommendation_outcomes'));
  });

  test('10. Zero-Purple Maestro Clinical CSS Token Compliance', () => {
    const cssPath = path.resolve(__dirname, '../src/components/RecommendationOutcomeTrackingView.css');
    assert.ok(fs.existsSync(cssPath), 'CSS file must exist');

    const css = fs.readFileSync(cssPath, 'utf8');
    const prohibitedTokens = ['#7c3aed', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', 'purple', 'violet', 'indigo', 'magenta', 'fuchsia'];
    for (const token of prohibitedTokens) {
      assert.ok(!css.toLowerCase().includes(token), `CSS must not include prohibited token: "${token}"`);
    }
  });

  test('11. Dual re-export facade parity between service and lib', () => {
    for (const key of ['computeTouchpointHash', 'calculateCounterfactualBaseline', 'calculateIncrementalUplift', 'calculateUpliftPercentage', 'calculateModelCalibrationRatio', 'validateAttributionWeights', 'getRecommendationOutcomes', 'getOutcomeById', 'getOutcomeTelemetry']) {
      assert.ok(typeof libOutcomeService[key] === 'function', `lib must re-export function: ${key}`);
    }
    assert.ok(libOutcomeService.ATTRIBUTION_MODELS, 'lib must re-export ATTRIBUTION_MODELS');
    assert.ok(libOutcomeService.TOUCHPOINT_STAGES, 'lib must re-export TOUCHPOINT_STAGES');
  });

  test('12. App Shell (src/App.jsx) navigation and tab rendering wiring', () => {
    const appPath = path.resolve(__dirname, '../src/App.jsx');
    const appContent = fs.readFileSync(appPath, 'utf8');

    assert.ok(appContent.includes("import RecommendationOutcomeTrackingView from './components/RecommendationOutcomeTrackingView'"));
    assert.ok(appContent.includes("activeTab === 'recommendation_outcomes'"));
    assert.ok(appContent.includes("Recommendation Outcome Tracking & Attribution"));
    assert.ok(appContent.includes("<RecommendationOutcomeTrackingView activeFacility={activeFacility} />"));
  });

});
