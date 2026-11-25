/**
 * ==============================================================================
 * Facade: hstIntegrationService.js
 * Module 15: Enterprise Healthcare Integrations (Phase F4)
 * Description: Dual-facade re-exporting HST Pathways EHR/PMS Gateway Service
 * Strict Zero Prohibited Accent Tokens
 * ==============================================================================
 */

export {
  NAPLES_FACILITY_ID,
  normalizeFacilityId,
  computeHstProvenanceSeal,
  validateHstMilestoneChronology,
  calculateHstTurnoverMinutes,
  auditHstCaseCharges,
  getHstConnectorConfig,
  getHstTelemetry,
  getHstSyncBatches,
  getHstCaseMappings,
  getHstMilestones,
  getHstChargeItems,
  testHstConnection,
  triggerManualHstSync,
  default
} from '../services/hstIntegrationService.js';
