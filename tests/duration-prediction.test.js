import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Import service layer under test
import {
  CONFIDENCE_LEVELS,
  MODEL_TIERS,
  PERCENTILE_PROFILES,
  COMPLEXITY_MODIFIERS,
  calculatePercentile,
  calculateDistributionStatistics,
  determineConfidenceLevel,
  predictCaseDuration,
  calculatePredictionError,
  calculateFacilityPredictionKpis,
  filterPredictionModels,
  SEED_DURATION_MODELS,
  SEED_PREDICTION_LOGS
} from '../src/services/durationPredictionService.js';

describe('Phase A8 — Duration Prediction Models (P50/P75/P80/P90) Test Suite', () => {

  // 1. Taxonomy & Architecture Standards
  describe('1. Prediction Taxonomy & Architectural Standards', () => {
    test('should define all 4 model confidence levels', () => {
      const keys = Object.keys(CONFIDENCE_LEVELS);
      assert.strictEqual(keys.length, 4);
      assert.ok(CONFIDENCE_LEVELS.HIGH);
      assert.ok(CONFIDENCE_LEVELS.MODERATE);
      assert.ok(CONFIDENCE_LEVELS.LOW);
      assert.ok(CONFIDENCE_LEVELS.INSUFFICIENT);
    });

    test('should define all 4 hierarchical model tiers', () => {
      const keys = Object.keys(MODEL_TIERS);
      assert.strictEqual(keys.length, 4);
      assert.ok(MODEL_TIERS.TIER_1_SURGEON_CPT);
      assert.ok(MODEL_TIERS.TIER_2_SURGEON_SPECIALTY);
      assert.ok(MODEL_TIERS.TIER_3_FACILITY_CPT);
      assert.ok(MODEL_TIERS.TIER_4_BENCHMARK);
    });

    test('should define all 4 operational percentile profiles (P50, P75, P80, P90)', () => {
      const keys = Object.keys(PERCENTILE_PROFILES);
      assert.strictEqual(keys.length, 4);
      assert.strictEqual(PERCENTILE_PROFILES.P50.percentile, 50);
      assert.strictEqual(PERCENTILE_PROFILES.P75.percentile, 75);
      assert.strictEqual(PERCENTILE_PROFILES.P80.percentile, 80);
      assert.strictEqual(PERCENTILE_PROFILES.P90.percentile, 90);
    });

    test('should define clinical complexity modifiers (BMI, Revision, Dual Procedure)', () => {
      const keys = Object.keys(COMPLEXITY_MODIFIERS);
      assert.strictEqual(keys.length, 3);
      assert.strictEqual(COMPLEXITY_MODIFIERS.HIGH_BMI.modifierPct, 0.10);
      assert.strictEqual(COMPLEXITY_MODIFIERS.REVISION_SURGERY.modifierPct, 0.15);
      assert.strictEqual(COMPLEXITY_MODIFIERS.DUAL_PROCEDURE.modifierPct, 0.30);
    });
  });

  // 2. Deterministic Percentile Math & Distribution Statistics
  describe('2. Deterministic Percentile Math & Distribution Statistics', () => {
    test('calculatePercentile: calculates linear rank percentiles accurately on known dataset', () => {
      const dataset = [60, 70, 75, 80, 85, 90, 95, 110]; // N = 8
      
      // P50 (Median)
      const p50 = calculatePercentile(dataset, 50);
      assert.strictEqual(p50, 83); // Rank = 0.5 * 7 = 3.5 -> 80 + 0.5*(85-80) = 82.5 -> 83

      // P80 (Operational Target)
      const p80 = calculatePercentile(dataset, 80);
      assert.strictEqual(p80, 93); // Rank = 0.8 * 7 = 5.6 -> 90 + 0.6*(95-90) = 93

      // P90 (Overtime Shield)
      const p90 = calculatePercentile(dataset, 90);
      assert.strictEqual(p90, 100); // Rank = 0.9 * 7 = 6.3 -> 95 + 0.3*(110-95) = 99.5 -> 100

      // Edge cases
      assert.strictEqual(calculatePercentile([75], 50), 75);
      assert.strictEqual(calculatePercentile([], 50), 0);
    });

    test('calculateDistributionStatistics: computes mean, standard deviation, and CV', () => {
      const values = [70, 75, 80, 85, 90]; // Mean = 80, Variance = 250 / 4 = 62.5, StdDev = 7.91
      const stats = calculateDistributionStatistics(values);

      assert.strictEqual(stats.sampleSize, 5);
      assert.strictEqual(stats.min, 70);
      assert.strictEqual(stats.max, 90);
      assert.strictEqual(stats.mean, 80.00);
      assert.strictEqual(stats.stdDev, 7.91);
      assert.strictEqual(stats.coefficientOfVariation, 0.099); // 7.91 / 80

      // Edge cases: single element
      const single = calculateDistributionStatistics([50]);
      assert.strictEqual(single.sampleSize, 1);
      assert.strictEqual(single.mean, 50.00);
      assert.strictEqual(single.stdDev, 0.00);
    });
  });

  // 3. Confidence Level & Fallback Hierarchy
  describe('3. Confidence Level & Fallback Hierarchy', () => {
    test('determineConfidenceLevel: assigns correct confidence based on N and CV', () => {
      // High: N >= 20 and CV <= 0.25
      assert.strictEqual(determineConfidenceLevel(42, 0.12), 'HIGH');
      assert.strictEqual(determineConfidenceLevel(20, 0.25), 'HIGH');

      // Moderate: N >= 20 but high dispersion (CV > 0.25)
      assert.strictEqual(determineConfidenceLevel(22, 0.28), 'MODERATE');

      // Moderate: 10 <= N < 20
      assert.strictEqual(determineConfidenceLevel(14, 0.15), 'MODERATE');
      assert.strictEqual(determineConfidenceLevel(10, 0.20), 'MODERATE');

      // Low: 5 <= N < 10
      assert.strictEqual(determineConfidenceLevel(8, 0.18), 'LOW');
      assert.strictEqual(determineConfidenceLevel(5, 0.15), 'LOW');

      // Insufficient: N < 5
      assert.strictEqual(determineConfidenceLevel(4, 0.10), 'INSUFFICIENT');
      assert.strictEqual(determineConfidenceLevel(0, 0.00), 'INSUFFICIENT');
    });
  });

  // 4. Clinical Complexity Adjustments & Prediction Engine
  describe('4. Clinical Complexity Adjustments & Prediction Engine', () => {
    test('predictCaseDuration: applies percentile selection and complexity buffers', () => {
      // Dr. Robert Chen - CPT 29881 (P80 = 85m)
      const standardCase = predictCaseDuration('Dr. Robert Chen, MD', '29881', { targetPercentile: 'P80' }, SEED_DURATION_MODELS);
      assert.strictEqual(standardCase.baseDuration, 85);
      assert.strictEqual(standardCase.complexityBufferMinutes, 0);
      assert.strictEqual(standardCase.recommendedDuration, 85);
      assert.strictEqual(standardCase.confidenceLevel, 'HIGH');

      // With High BMI (+10%): 85 * 0.10 = 8.5 -> 9m -> 94m
      const bmiCase = predictCaseDuration('Dr. Robert Chen, MD', '29881', { targetPercentile: 'P80', hasHighBmi: true }, SEED_DURATION_MODELS);
      assert.strictEqual(bmiCase.complexityBufferMinutes, 9);
      assert.strictEqual(bmiCase.recommendedDuration, 94);

      // With Revision (+15%): 85 * 0.15 = 12.75 -> 13m -> 98m
      const revisionCase = predictCaseDuration('Dr. Robert Chen, MD', '29881', { targetPercentile: 'P80', isRevision: true }, SEED_DURATION_MODELS);
      assert.strictEqual(revisionCase.complexityBufferMinutes, 13);
      assert.strictEqual(revisionCase.recommendedDuration, 98);

      // With High BMI + Revision + Dual (+55% capped at 50%): 85 * 0.50 = 42.5 -> 43m -> 128m
      const maxCase = predictCaseDuration('Dr. Robert Chen, MD', '29881', {
        targetPercentile: 'P80',
        hasHighBmi: true,
        isRevision: true,
        isDualProcedure: true
      }, SEED_DURATION_MODELS);
      assert.strictEqual(maxCase.complexityBufferMinutes, 43);
      assert.strictEqual(maxCase.recommendedDuration, 128);
    });

    test('calculatePredictionError: accurately measures delta between actual and predicted', () => {
      // On target
      assert.strictEqual(calculatePredictionError(85, 85), 0);
      // Actual took longer than predicted (+5m overrun)
      assert.strictEqual(calculatePredictionError(90, 85), 5);
      // Actual finished earlier than predicted (-10m underrun)
      assert.strictEqual(calculatePredictionError(75, 85), -10);
    });
  });

  // 5. Facility KPIs Aggregation & Model Filtering
  describe('5. Facility KPIs Aggregation & Model Filtering', () => {
    test('calculateFacilityPredictionKpis: aggregates facility seed metrics accurately', () => {
      const kpis = calculateFacilityPredictionKpis(SEED_DURATION_MODELS, SEED_PREDICTION_LOGS);

      assert.strictEqual(kpis.totalModels, 8);
      assert.strictEqual(kpis.highConfidenceModels, 7);
      assert.strictEqual(kpis.highConfidenceCoveragePct, 87.5);
      assert.strictEqual(kpis.totalLogs, 8);
      assert.ok(kpis.meanAbsoluteErrorMinutes >= 0);
      assert.strictEqual(kpis.completedWithinTargetCount, 8); // All seed logs actual <= recommended
      assert.strictEqual(kpis.completedWithinTargetPct, 100.0);
    });

    test('filterPredictionModels: filters by surgeon, specialty, confidence, and search query', () => {
      const chenModels = filterPredictionModels(SEED_DURATION_MODELS, { surgeon: 'Dr. Robert Chen, MD' });
      assert.strictEqual(chenModels.length, 2);

      const spineModels = filterPredictionModels(SEED_DURATION_MODELS, { specialty: 'SPINE_SURGERY' });
      assert.strictEqual(spineModels.length, 2);

      const moderateModels = filterPredictionModels(SEED_DURATION_MODELS, { confidence: 'MODERATE' });
      assert.strictEqual(moderateModels.length, 1);

      const searchMatch = filterPredictionModels(SEED_DURATION_MODELS, { searchQuery: 'Cataract' });
      assert.strictEqual(searchMatch.length, 1);
    });
  });

  // 6. Database Migration 085 Integrity & RLS Multi-Tenancy
  describe('6. Database Migration 085 Integrity & Multi-Tenancy Governance', () => {
    const upMigrationPath = path.join(ROOT_DIR, 'supabase', 'migrations', '085_duration_prediction.sql');
    const downMigrationPath = path.join(ROOT_DIR, 'supabase', 'migrations', '085_duration_prediction_down.sql');

    test('UP migration 085 exists and contains required tables, columns, views, and RLS', () => {
      assert.ok(fs.existsSync(upMigrationPath), '085_duration_prediction.sql must exist');
      const sql = fs.readFileSync(upMigrationPath, 'utf8');

      // Tables
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.or_case_duration_prediction_models'));
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.or_case_duration_predictions_log'));

      // Core columns
      assert.ok(sql.includes('p50_duration_minutes INTEGER NOT NULL'));
      assert.ok(sql.includes('p80_duration_minutes INTEGER NOT NULL'));
      assert.ok(sql.includes('p90_duration_minutes INTEGER NOT NULL'));
      assert.ok(sql.includes('coefficient_of_variation NUMERIC(5, 3) NOT NULL'));
      assert.ok(sql.includes('confidence_level VARCHAR(32) NOT NULL'));
      assert.ok(sql.includes('model_tier VARCHAR(32) NOT NULL'));

      // Analytical views
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_or_duration_prediction_accuracy'));
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_or_duration_models_by_cpt'));

      // RLS policies
      assert.ok(sql.includes('ALTER TABLE public.or_case_duration_prediction_models ENABLE ROW LEVEL SECURITY;'));
      assert.ok(sql.includes('ALTER TABLE public.or_case_duration_predictions_log ENABLE ROW LEVEL SECURITY;'));
      assert.ok(sql.includes("app.current_facility_id"));
    });

    test('DOWN migration 085 cleanly drops views, policies, indexes, and tables with CASCADE', () => {
      assert.ok(fs.existsSync(downMigrationPath), '085_duration_prediction_down.sql must exist');
      const sql = fs.readFileSync(downMigrationPath, 'utf8');

      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_or_duration_models_by_cpt CASCADE;'));
      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_or_duration_prediction_accuracy CASCADE;'));
      assert.ok(sql.includes('DROP POLICY IF EXISTS rls_or_case_duration_predictions_log_facility'));
      assert.ok(sql.includes('DROP POLICY IF EXISTS rls_or_case_duration_prediction_models_facility'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.or_case_duration_predictions_log CASCADE;'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.or_case_duration_prediction_models CASCADE;'));
    });
  });

  // 7. Design System Governance & App.jsx Wiring
  describe('7. Maestro Design System Governance & App Integration', () => {
    test('DurationPredictionView.jsx and CSS strictly adhere to Zero Purple Rule', () => {
      const jsxPath = path.join(ROOT_DIR, 'src', 'components', 'DurationPredictionView.jsx');
      const cssPath = path.join(ROOT_DIR, 'src', 'components', 'DurationPredictionView.css');

      assert.ok(fs.existsSync(jsxPath), 'DurationPredictionView.jsx must exist');
      assert.ok(fs.existsSync(cssPath), 'DurationPredictionView.css must exist');

      const jsx = fs.readFileSync(jsxPath, 'utf8');
      const css = fs.readFileSync(cssPath, 'utf8');

      const prohibitedTokens = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];

      prohibitedTokens.forEach(token => {
        const tokenRegex = new RegExp(`\\b${token}\\b`, 'i');
        assert.ok(!tokenRegex.test(jsx), `DurationPredictionView.jsx contains prohibited token: ${token}`);
        assert.ok(!tokenRegex.test(css), `DurationPredictionView.css contains prohibited token: ${token}`);
      });
    });

    test('App.jsx properly imports, routes, and renders DurationPredictionView', () => {
      const appJsxPath = path.join(ROOT_DIR, 'src', 'App.jsx');
      const appJsx = fs.readFileSync(appJsxPath, 'utf8');

      // Import check
      assert.ok(appJsx.includes("import DurationPredictionView from './components/DurationPredictionView';"));

      // Sidebar menu item
      assert.ok(appJsx.includes("activeTab === 'duration_prediction'"));
      assert.ok(appJsx.includes("Duration Prediction Models"));

      // Header title & subtitle
      assert.ok(appJsx.includes("{activeTab === 'duration_prediction' && 'Surgical Duration Prediction Engine (P50/P75/P80/P90)'}"));

      // Date picker exclusion
      assert.ok(appJsx.includes("'duration_prediction'"));

      // View rendering
      assert.ok(appJsx.includes('<DurationPredictionView />'));
    });
  });
});
