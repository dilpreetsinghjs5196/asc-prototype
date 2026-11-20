/**
 * ==============================================================================
 * Phase D4: Recommendation Decision Ledger Service (Dual Re-Export Facade)
 * Module 13: Decision Intelligence
 * ==============================================================================
 */

export {
  GENESIS_BLOCK_HASH,
  computeLedgerBlockHash,
  REALIZATION_STATUSES,
  LEDGER_EVENT_TYPES,
  calculateVariance,
  calculateRealizationRate,
  determineRealizationStatus,
  SEED_DECISION_LEDGER_ENTRIES,
  SEED_LEDGER_EVENTS,
  resetDecisionLedgerStore,
  getDecisionLedgerEntries,
  getLedgerEntryById,
  getLedgerEntryByActionId,
  verifyLedgerChainIntegrity,
  recordLedgerOutcome,
  getLedgerEvents,
  getDecisionLedgerTelemetry,
  matchesFacilityId
} from '../services/decisionLedgerService.js';
