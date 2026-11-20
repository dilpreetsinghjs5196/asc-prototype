/**
 * ==============================================================================
 * Phase D6: Realized Value Calculation & Multi-Pillar ROI (Dual Re-Export Facade)
 * Module 13: Decision Intelligence
 * ==============================================================================
 */

export {
  matchesFacilityId,
  computeCalculationProvenanceHash,
  VALUE_PILLARS,
  BASELINE_CM_PER_OR_HOUR,
  BASELINE_HOURLY_LABOR_RATE,
  calculateCapacityValue,
  calculateGrossValue,
  calculateNetRealizedValue,
  calculateRoiMultiplier,
  SEED_REALIZED_VALUE_CALCULATIONS,
  SEED_REALIZED_VALUE_LINE_ITEMS,
  resetRealizedValueStore,
  getRealizedValueCalculations,
  getCalculationById,
  getCalculationByActionId,
  getCalculationLineItems,
  recordRealizedValueCalculation,
  getRealizedValueTelemetry
} from '../services/realizedValueService.js';
