/**
 * ==============================================================================
 * Phase D5: Recommendation Outcome Tracking & Attribution (Dual Re-Export Facade)
 * Module 13: Decision Intelligence
 * ==============================================================================
 */

export {
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
} from '../services/recommendationOutcomeService.js';
