/**
 * ==============================================================================
 * Phase D1 Test Suite: Recommendation Priority Model & Scoring Engine
 * Module 13: Decision Intelligence
 * Tests: Multi-parameter priority scoring formula, facility profile tuning,
 *        mathematical weight invariants, dynamic urgency decay curves,
 *        SHA-256 calculation traces, migration 108 SQL integrity, and
 *        zero-purple Maestro Clinical compliance.
 * ==============================================================================
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SEED_SCORING_PROFILES,
  computeScoreHash,
  resetPriorityModelStore,
  getScoringProfiles,
  getActiveScoringProfile,
  setActiveScoringProfile,
  validateWeightsSum,
  calculateUrgencyFromHours,
  calculatePriorityScoreWithTrace,
  recalculateFacilityActionQueue,
  getScoreLogs,
  getScoringTelemetry
} from '../src/services/recommendationPriorityService.js';

import * as libPriorityService from '../src/lib/recommendationPriorityService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase D1: Recommendation Priority Model & Scoring Engine', () => {

  beforeEach(() => {
    resetPriorityModelStore();
  });

  test('1. Scoring Model Telemetry returns accurate facility KPIs and profile status', () => {
    const telemetry = getScoringTelemetry('fac-naples-01');
    assert.strictEqual(telemetry.activeProfileCode, 'BALANCED_STANDARD_V1');
    assert.strictEqual(telemetry.activeProfileName, 'Balanced Standard (ASC Default)');
    assert.strictEqual(telemetry.availableProfilesCount, 3);
    assert.ok(telemetry.averageCompositeScore >= 50.0 && telemetry.averageCompositeScore <= 100.0);
    assert.strictEqual(telemetry.formulaIntegrity, '100% Deterministic (Zero Drift)');
    assert.strictEqual(telemetry.provenanceStatus, 'SHA-256 Verified');
  });

  test('2. Profile catalog retrieval and active profile switching works correctly', () => {
    const profiles = getScoringProfiles('fac-naples-01');
    assert.strictEqual(profiles.length, 3);

    const activeBefore = getActiveScoringProfile('fac-naples-01');
    assert.strictEqual(activeBefore.profileCode, 'BALANCED_STANDARD_V1');

    // Switch to Cash Acceleration
    const switched = setActiveScoringProfile('fac-naples-01', 'CASH_ACCELERATION_MODE');
    assert.strictEqual(switched.profileCode, 'CASH_ACCELERATION_MODE');
    assert.strictEqual(switched.isActive, true);

    const activeAfter = getActiveScoringProfile('fac-naples-01');
    assert.strictEqual(activeAfter.profileCode, 'CASH_ACCELERATION_MODE');

    // Invalid profile should throw
    assert.throws(() => {
      setActiveScoringProfile('fac-naples-01', 'NON_EXISTENT_PROFILE');
    }, /not found/i);
  });

  test('3. Mathematical weight sum validator strictly validates 1.000 invariant', () => {
    // Valid profiles
    for (const p of SEED_SCORING_PROFILES) {
      assert.strictEqual(validateWeightsSum(p), true, `Profile ${p.profileCode} must sum to 1.000`);
    }

    // Invalid weight sets
    assert.strictEqual(validateWeightsSum({
      valueWeight: 0.40, urgencyWeight: 0.25, recoverabilityWeight: 0.20, confidenceWeight: 0.10, effortWeight: 0.10
    }), false, 'Sum is 1.05 -> should fail');

    assert.strictEqual(validateWeightsSum({
      valueWeight: 0.30, urgencyWeight: 0.20, recoverabilityWeight: 0.20, confidenceWeight: 0.10, effortWeight: 0.10
    }), false, 'Sum is 0.90 -> should fail');
  });

  test('4. Deterministic formula computes exact weighted contributions, composite score, and tier', () => {
    const actionInput = {
      actionCode: 'NBFA-TEST-001',
      facilityId: 'fac-naples-01',
      expectedFinancialValue: 25000.00,
      urgencyScore: 100.0,
      recoverabilityScore: 100.0,
      confidenceScore: 100.0,
      effortScore: 0.0 // inverse effort = 100.0
    };

    const result = calculatePriorityScoreWithTrace(actionInput);
    // Value: 100 * 0.35 = 35.0
    // Urgency: 100 * 0.25 = 25.0
    // Recoverability: 100 * 0.20 = 20.0
    // Confidence: 100 * 0.10 = 10.0
    // Effort: (100 - 0) * 0.10 = 10.0
    // Total = 100.0
    assert.strictEqual(result.compositeScore, 100.0);
    assert.strictEqual(result.priorityTier, 'P0_CRITICAL');
    assert.strictEqual(result.normalizedValueScore, 100.0);
    assert.strictEqual(result.calculationTrace.componentContributions.weightedValue, 35.0);
    assert.strictEqual(result.calculationTrace.componentContributions.weightedUrgency, 25.0);
    assert.strictEqual(result.calculationTrace.componentContributions.weightedRecoverability, 20.0);
    assert.strictEqual(result.calculationTrace.componentContributions.weightedConfidence, 10.0);
    assert.strictEqual(result.calculationTrace.componentContributions.weightedEffort, 10.0);
    assert.ok(result.calculationHash.length >= 32);
  });

  test('5. Value normalization ceiling caps values at valueCap ($25,000 baseline)', () => {
    const defaultProfile = SEED_SCORING_PROFILES[0];
    assert.strictEqual(defaultProfile.valueCap, 25000.00);

    const outlierAction = {
      actionCode: 'NBFA-OUTLIER-999',
      facilityId: 'fac-naples-01',
      expectedFinancialValue: 95000.00, // Exceeds $25,000 cap
      urgencyScore: 50,
      recoverabilityScore: 50,
      confidenceScore: 50,
      effortScore: 50
    };

    const result = calculatePriorityScoreWithTrace(outlierAction, defaultProfile);
    assert.strictEqual(result.normalizedValueScore, 100.0, 'Value exceeding cap must normalize to 100.0');
    assert.strictEqual(result.calculationTrace.inputs.valueCap, 25000.00);
  });

  test('6. Dynamic urgency curve calculator decays appropriately with remaining hours', () => {
    // <= 24 hours: 100%
    assert.strictEqual(calculateUrgencyFromHours(12), 100.0);
    assert.strictEqual(calculateUrgencyFromHours(24), 100.0);

    // 24 to 72 hours: 90% to 100%
    const u48 = calculateUrgencyFromHours(48);
    assert.strictEqual(u48, 95.0);

    // 72 to 168 hours: 50% to 90%
    const u120 = calculateUrgencyFromHours(120);
    assert.strictEqual(u120, 70.0);

    // > 168 hours: graceful decay with 10.0 floor
    const u336 = calculateUrgencyFromHours(336);
    assert.strictEqual(u336, 25.0);

    const u2000 = calculateUrgencyFromHours(2000);
    assert.strictEqual(u2000, 10.0, 'Floor of urgency is 10.0');
  });

  test('7. Cryptographic score hash produces deterministic SHA-256 strings', () => {
    const trace = {
      formula: 'Composite = (100 * 0.35) + (80 * 0.25)',
      compositeScore: 92.4,
      timestamp: '2026-11-20T08:00:00Z'
    };

    const hash1 = computeScoreHash(trace);
    const hash2 = computeScoreHash(trace);
    assert.strictEqual(hash1, hash2, 'Hash must be strictly deterministic across calls');
    assert.strictEqual(typeof hash1, 'string');
    assert.ok(hash1.length >= 32);
  });

  test('8. Batch queue recalculation updates scores and appends calculation trace logs', () => {
    const recalcResult = recalculateFacilityActionQueue('fac-naples-01', 'MINIMAL_STAFF_EFFORT');
    assert.strictEqual(recalcResult.profileApplied.profileCode, 'MINIMAL_STAFF_EFFORT');
    assert.ok(recalcResult.recalculatedCount >= 7);
    assert.strictEqual(recalcResult.scoredLogs.length, recalcResult.recalculatedCount);

    const logs = getScoreLogs();
    assert.ok(logs.length >= 7);
    assert.strictEqual(logs[0].profileId, 'prof-staff-003');
    assert.ok(logs[0].calculationHash);
  });

  test('9. Migration 108 UP and DOWN SQL files exist, use UUID foreign keys, and idempotent policies', () => {
    const upMigrationPath = path.join(__dirname, '../supabase/migrations/108_recommendation_priority_model.sql');
    const downMigrationPath = path.join(__dirname, '../supabase/migrations/108_recommendation_priority_model_down.sql');

    assert.ok(fs.existsSync(upMigrationPath), 'Migration 108 up script must exist');
    assert.ok(fs.existsSync(downMigrationPath), 'Migration 108 down script must exist');

    const upSql = fs.readFileSync(upMigrationPath, 'utf8');
    assert.ok(upSql.includes('facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE'), 'Must use UUID FK referencing public.facilities(id)');
    assert.ok(upSql.includes('chk_profile_weights_sum'), 'Must enforce check constraint on sum of weights');
    assert.ok(upSql.includes('DROP POLICY IF EXISTS'), 'Must use idempotent DROP POLICY IF EXISTS before CREATE POLICY');
    assert.ok(upSql.includes('CREATE OR REPLACE VIEW public.vw_recommendation_scoring_telemetry'), 'Must create telemetry view');

    const downSql = fs.readFileSync(downMigrationPath, 'utf8');
    assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_recommendation_scoring_telemetry'), 'Down script drops view');
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.recommendation_score_logs'), 'Down script drops logs');
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.recommendation_scoring_profiles'), 'Down script drops profiles');
  });

  test('10. Maestro Clinical zero-purple design compliance across D1 files', () => {
    const d1Files = [
      path.join(__dirname, '../src/components/RecommendationPriorityModelView.jsx'),
      path.join(__dirname, '../src/components/RecommendationPriorityModelView.css'),
      path.join(__dirname, '../src/services/recommendationPriorityService.js')
    ];

    const prohibitedTokens = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];

    for (const filePath of d1Files) {
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

  test('11. App shell wires RecommendationPriorityModelView with tab, icon, and role security', () => {
    const appJsxPath = path.join(__dirname, '../src/App.jsx');
    const content = fs.readFileSync(appJsxPath, 'utf8');

    assert.ok(content.includes('import RecommendationPriorityModelView'), 'Must import RecommendationPriorityModelView');
    assert.ok(content.includes("activeTab === 'recommendation_priority_model'"), 'Must have sidebar navigation item check');
    assert.ok(content.includes("{activeTab === 'recommendation_priority_model' && 'Recommendation Priority Model & Scoring'}"), 'Must have header title');
    assert.ok(content.includes('<RecommendationPriorityModelView activeFacility={activeFacility} />'), 'Must render tab view');
    assert.ok(content.includes("'recommendation_priority_model'"), 'Must exclude from generic date filters');
  });

  test('12. Dual re-export facade parity', () => {
    assert.strictEqual(typeof libPriorityService.calculatePriorityScoreWithTrace, 'function');
    assert.strictEqual(typeof libPriorityService.recalculateFacilityActionQueue, 'function');
    assert.strictEqual(typeof libPriorityService.getScoringTelemetry, 'function');
  });
});
