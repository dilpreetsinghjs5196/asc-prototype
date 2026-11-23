/**
 * ==============================================================================
 * Phase E0: Management P&L & Reconciliation Boundaries (Dual Re-Export Facade)
 * Module 14: CFO Dashboard & Financial Accounting
 * ==============================================================================
 */

export {
  matchesFacilityId,
  computePnlProvenanceHash,
  PNL_SECTIONS,
  RECONCILIATION_BOUNDARIES,
  PERIOD_STATUSES,
  calculateNpr,
  calculateDirectClinicalMargin,
  calculateGrossOperatingProfit,
  calculateEbitda,
  calculateNetOperatingIncome,
  calculateMarginPercentage,
  validateReconciliation,
  SEED_MANAGEMENT_PNL_PERIODS,
  SEED_MANAGEMENT_PNL_STATEMENT_LINES,
  SEED_MANAGEMENT_PNL_RECONCILIATIONS,
  resetManagementPnlStore,
  getManagementPnlPeriods,
  getPeriodByIdOrCode,
  getPnlStatementLines,
  getPeriodReconciliations,
  calculatePnlSummary,
  freezeAccountingPeriod,
  getManagementPnlTelemetry
} from '../services/managementPnlService.js';
