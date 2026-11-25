/**
 * ==============================================================================
 * Facade: sisIntegrationService.js
 * Module 15: Enterprise Healthcare Integrations (Phase F3)
 * Description: Dual-facade re-exporting Surgical Information Systems (SIS) Gateway
 * Strict Zero Prohibited Accent Tokens
 * ==============================================================================
 */

export {
  NAPLES_FACILITY_ID,
  normalizeFacilityId,
  computeSisProvenanceSeal,
  validateMilestoneChronology,
  calculateTurnoverMinutes,
  auditCaseCharges,
  getSisConnectorConfig,
  getSisTelemetry,
  getSisSyncBatches,
  getSisCaseMappings,
  getSisMilestones,
  getSisChargeItems,
  testSisConnection,
  triggerManualSync,
  default
} from '../services/sisIntegrationService.js';
