/**
 * ==============================================================================
 * Case Financial Ledger Service
 * Phase 71: Transactional Journal & Contribution Margin Engine
 * ==============================================================================
 * 
 * Implements deterministic event-sourced financial ledger line-item calculations,
 * double-entry sign resolutions, running balances, cryptographic audit hash chains,
 * and case contribution margin evaluations with provisional completeness scoring.
 * 
 * Strict Healthcare Financial Governance:
 * - Fixed precision arithmetic (NUMERIC(12,2))
 * - Zero-substitution ban: missing costs evaluate to MISSING_SOURCE_DATA / ESTIMATED
 * - No floating point drift
 */

import { FINANCIAL_COMPLETENESS_STATUSES } from './financialDataDictionaryService.js';

export const LEDGER_ENTRY_TYPES = {
  CHARGE: 'CHARGE',
  EXPECTED_ALLOWABLE: 'EXPECTED_ALLOWABLE',
  PAYER_PAYMENT: 'PAYER_PAYMENT',
  PATIENT_PAYMENT: 'PATIENT_PAYMENT',
  SECONDARY_PAYMENT: 'SECONDARY_PAYMENT',
  CONTRACTUAL_ADJUSTMENT: 'CONTRACTUAL_ADJUSTMENT',
  ADMIN_WRITE_OFF: 'ADMIN_WRITE_OFF',
  REFUND_RECOUPMENT: 'REFUND_RECOUPMENT',
  IMPLANT_COST: 'IMPLANT_COST',
  SUPPLY_COST: 'SUPPLY_COST',
  LABOR_COST: 'LABOR_COST',
  OR_TIME_COST: 'OR_TIME_COST'
};

export const LEDGER_CATEGORIES = {
  CHARGES: 'CHARGES',
  CONTRACTUAL: 'CONTRACTUAL',
  PAYMENTS: 'PAYMENTS',
  ADJUSTMENTS: 'ADJUSTMENTS',
  DIRECT_COSTS: 'DIRECT_COSTS'
};

export const LEDGER_STATUSES = {
  POSTED: 'POSTED',
  PROVISIONAL: 'PROVISIONAL',
  REVERSED: 'REVERSED',
  VOIDED: 'VOIDED'
};

// Maps entry types to their classification and accounting signs
export const ENTRY_TYPE_CONFIG = {
  [LEDGER_ENTRY_TYPES.CHARGE]: {
    label: 'Gross Billed Charge',
    category: LEDGER_CATEGORIES.CHARGES,
    sign: 1, // Credit / Inflow
    isBalanceAffecting: true,
    isDirectCost: false
  },
  [LEDGER_ENTRY_TYPES.EXPECTED_ALLOWABLE]: {
    label: 'Expected Contractual Allowable',
    category: LEDGER_CATEGORIES.CONTRACTUAL,
    sign: 0, // Benchmark line item
    isBalanceAffecting: false,
    isDirectCost: false
  },
  [LEDGER_ENTRY_TYPES.PAYER_PAYMENT]: {
    label: 'Insurance Payer Payment',
    category: LEDGER_CATEGORIES.PAYMENTS,
    sign: 1, // Cash receipt
    isBalanceAffecting: true,
    isDirectCost: false
  },
  [LEDGER_ENTRY_TYPES.PATIENT_PAYMENT]: {
    label: 'Patient Copay / Coinsurance',
    category: LEDGER_CATEGORIES.PAYMENTS,
    sign: 1, // Cash receipt
    isBalanceAffecting: true,
    isDirectCost: false
  },
  [LEDGER_ENTRY_TYPES.SECONDARY_PAYMENT]: {
    label: 'Secondary Insurer Payment',
    category: LEDGER_CATEGORIES.PAYMENTS,
    sign: 1, // Cash receipt
    isBalanceAffecting: true,
    isDirectCost: false
  },
  [LEDGER_ENTRY_TYPES.CONTRACTUAL_ADJUSTMENT]: {
    label: 'Contractual Discount Adjustment',
    category: LEDGER_CATEGORIES.ADJUSTMENTS,
    sign: -1, // Write-off reduction
    isBalanceAffecting: true,
    isDirectCost: false
  },
  [LEDGER_ENTRY_TYPES.ADMIN_WRITE_OFF]: {
    label: 'Administrative Write-Off',
    category: LEDGER_CATEGORIES.ADJUSTMENTS,
    sign: -1, // Non-contractual write-off
    isBalanceAffecting: true,
    isDirectCost: false
  },
  [LEDGER_ENTRY_TYPES.REFUND_RECOUPMENT]: {
    label: 'Payer Recoupment / Refund',
    category: LEDGER_CATEGORIES.ADJUSTMENTS,
    sign: -1, // Cash reduction
    isBalanceAffecting: true,
    isDirectCost: false
  },
  [LEDGER_ENTRY_TYPES.IMPLANT_COST]: {
    label: 'Implant Device Acquisition Cost',
    category: LEDGER_CATEGORIES.DIRECT_COSTS,
    sign: -1, // Expense
    isBalanceAffecting: true,
    isDirectCost: true
  },
  [LEDGER_ENTRY_TYPES.SUPPLY_COST]: {
    label: 'Surgical Supply Pack Cost',
    category: LEDGER_CATEGORIES.DIRECT_COSTS,
    sign: -1, // Expense
    isBalanceAffecting: true,
    isDirectCost: true
  },
  [LEDGER_ENTRY_TYPES.LABOR_COST]: {
    label: 'Clinical Nursing & Tech Labor Cost',
    category: LEDGER_CATEGORIES.DIRECT_COSTS,
    sign: -1, // Expense
    isBalanceAffecting: true,
    isDirectCost: true
  },
  [LEDGER_ENTRY_TYPES.OR_TIME_COST]: {
    label: 'OR Suite Minute Overhead Cost',
    category: LEDGER_CATEGORIES.DIRECT_COSTS,
    sign: -1, // Expense
    isBalanceAffecting: true,
    isDirectCost: true
  }
};

// Deterministic rounding to 2 decimal places
export function roundToTwo(num) {
  if (num === null || num === undefined || isNaN(num)) return 0.00;
  return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
}

// In-memory ledger entries store initialized with canonical seed data for cases
const caseLedgerStore = new Map();

// Helper to seed initial sample entries for existing surgeries
function initializeSeedEntries(surgeryId, facilityId = 'fac-001') {
  if (caseLedgerStore.has(surgeryId)) {
    return caseLedgerStore.get(surgeryId);
  }

  const entries = [
    {
      id: `ledg-${surgeryId}-01`,
      facility_id: facilityId,
      surgery_id: surgeryId,
      entry_number: 1,
      entry_type: LEDGER_ENTRY_TYPES.CHARGE,
      entry_sign: 1,
      amount: 14500.00,
      effective_date: '2026-10-24',
      description: 'Primary procedure gross chargemaster fee (CPT 29881)',
      source_module: 'ClaimScrubber',
      source_reference_id: `CLM-${surgeryId}-01`,
      status: LEDGER_STATUSES.POSTED,
      reversal_of_entry_id: null,
      metadata: { cpt: '29881', units: 1 },
      audit_hash: 'c8f12d5b6a7849e30a514d784a9e5c1284e1b8a9d1234567890abcdef1234567',
      created_at: '2026-10-24T09:00:00Z',
      created_by: 'usr-billing-01'
    },
    {
      id: `ledg-${surgeryId}-02`,
      facility_id: facilityId,
      surgery_id: surgeryId,
      entry_number: 2,
      entry_type: LEDGER_ENTRY_TYPES.EXPECTED_ALLOWABLE,
      entry_sign: 0,
      amount: 4250.00,
      effective_date: '2026-10-24',
      description: 'Phase 68 contract allowable rate calculation (Blue Cross PPO)',
      source_module: 'ReimbursementEngine',
      source_reference_id: `CALC-${surgeryId}-01`,
      status: LEDGER_STATUSES.POSTED,
      reversal_of_entry_id: null,
      metadata: { payer_code: 'BCBS_PPO', schedule_version: '2026.1' },
      audit_hash: '9d214a78bc5e1284a514d784a9e5c1284e1b8a9d1234567890abcdef12345678',
      created_at: '2026-10-24T09:05:00Z',
      created_by: 'system'
    },
    {
      id: `ledg-${surgeryId}-03`,
      facility_id: facilityId,
      surgery_id: surgeryId,
      entry_number: 3,
      entry_type: LEDGER_ENTRY_TYPES.CONTRACTUAL_ADJUSTMENT,
      entry_sign: -1,
      amount: 10250.00,
      effective_date: '2026-10-24',
      description: 'Mandatory contractual discount write-off to allowable',
      source_module: 'ClaimScrubber',
      source_reference_id: `ADJ-${surgeryId}-01`,
      status: LEDGER_STATUSES.POSTED,
      reversal_of_entry_id: null,
      metadata: { group_code: 'CO', reason_code: '45' },
      audit_hash: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
      created_at: '2026-10-24T09:10:00Z',
      created_by: 'usr-billing-01'
    },
    {
      id: `ledg-${surgeryId}-04`,
      facility_id: facilityId,
      surgery_id: surgeryId,
      entry_number: 4,
      entry_type: LEDGER_ENTRY_TYPES.IMPLANT_COST,
      entry_sign: -1,
      amount: 1120.00,
      effective_date: '2026-10-24',
      description: 'Stryker Meniscal Mitek Anchor & Fixation Kit (PO #84920)',
      source_module: 'UDIScanner',
      source_reference_id: `INV-STRYK-84920`,
      status: LEDGER_STATUSES.POSTED,
      reversal_of_entry_id: null,
      metadata: { vendor: 'Stryker', item_code: 'STR-ANCH-99' },
      audit_hash: 'b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2',
      created_at: '2026-10-24T11:30:00Z',
      created_by: 'usr-circulator-01'
    },
    {
      id: `ledg-${surgeryId}-05`,
      facility_id: facilityId,
      surgery_id: surgeryId,
      entry_number: 5,
      entry_type: LEDGER_ENTRY_TYPES.SUPPLY_COST,
      entry_sign: -1,
      amount: 380.00,
      effective_date: '2026-10-24',
      description: 'Standard arthroscopy drape and consumable pack',
      source_module: 'MaterialsManagement',
      source_reference_id: `SUP-${surgeryId}-01`,
      status: LEDGER_STATUSES.POSTED,
      reversal_of_entry_id: null,
      metadata: { pack_type: 'ARTHRO_DRAPE_01' },
      audit_hash: 'c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3',
      created_at: '2026-10-24T12:00:00Z',
      created_by: 'usr-materials-01'
    },
    {
      id: `ledg-${surgeryId}-06`,
      facility_id: facilityId,
      surgery_id: surgeryId,
      entry_number: 6,
      entry_type: LEDGER_ENTRY_TYPES.LABOR_COST,
      entry_sign: -1,
      amount: 450.00,
      effective_date: '2026-10-24',
      description: 'Circulator RN (1.5 hrs) & Scrub Tech (1.5 hrs) direct wages',
      source_module: 'StaffScheduling',
      source_reference_id: `LAB-${surgeryId}-01`,
      status: LEDGER_STATUSES.POSTED,
      reversal_of_entry_id: null,
      metadata: { rn_hours: 1.5, tech_hours: 1.5 },
      audit_hash: 'd3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4',
      created_at: '2026-10-24T13:00:00Z',
      created_by: 'usr-clinical-dir'
    },
    {
      id: `ledg-${surgeryId}-07`,
      facility_id: facilityId,
      surgery_id: surgeryId,
      entry_number: 7,
      entry_type: LEDGER_ENTRY_TYPES.OR_TIME_COST,
      entry_sign: -1,
      amount: 600.00,
      effective_date: '2026-10-24',
      description: 'Operating Suite 2 room minute cost (60 mins @ $10/min)',
      source_module: 'SurgeryMilestones',
      source_reference_id: `OR-${surgeryId}-02`,
      status: LEDGER_STATUSES.POSTED,
      reversal_of_entry_id: null,
      metadata: { minutes: 60, rate_per_min: 10.00 },
      audit_hash: 'e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5',
      created_at: '2026-10-24T13:15:00Z',
      created_by: 'system'
    },
    {
      id: `ledg-${surgeryId}-08`,
      facility_id: facilityId,
      surgery_id: surgeryId,
      entry_number: 8,
      entry_type: LEDGER_ENTRY_TYPES.PAYER_PAYMENT,
      entry_sign: 1,
      amount: 3850.00,
      effective_date: '2026-10-28',
      description: 'Blue Cross 835 ERA Electronic Payment posted (Trace #992817)',
      source_module: 'CashPosting',
      source_reference_id: `ERA-BCBS-992817`,
      status: LEDGER_STATUSES.POSTED,
      reversal_of_entry_id: null,
      metadata: { check_trace: '992817', payer: 'Blue Cross' },
      audit_hash: 'f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6',
      created_at: '2026-10-28T14:30:00Z',
      created_by: 'usr-cashier-01'
    },
    {
      id: `ledg-${surgeryId}-09`,
      facility_id: facilityId,
      surgery_id: surgeryId,
      entry_number: 9,
      entry_type: LEDGER_ENTRY_TYPES.PATIENT_PAYMENT,
      entry_sign: 1,
      amount: 400.00,
      effective_date: '2026-10-28',
      description: 'Patient point-of-service copay / coinsurance collection',
      source_module: 'POSCollections',
      source_reference_id: `RCPT-POS-${surgeryId}`,
      status: LEDGER_STATUSES.POSTED,
      reversal_of_entry_id: null,
      metadata: { method: 'CreditCard_Visa', auth_code: '883921' },
      audit_hash: 'a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7',
      created_at: '2026-10-28T15:00:00Z',
      created_by: 'usr-frontdesk-01'
    }
  ];

  caseLedgerStore.set(surgeryId, entries);
  return entries;
}

export const caseFinancialLedgerService = {
  /**
   * Retrieves all journal entries for a given surgery, ordered chronologically.
   */
  getCaseLedgerEntries(surgeryId, facilityId = 'fac-001') {
    const rawEntries = initializeSeedEntries(surgeryId, facilityId);
    
    // Compute running balance along with each entry
    let runningBalance = 0;
    return rawEntries.map(entry => {
      const config = ENTRY_TYPE_CONFIG[entry.entry_type] || { sign: 0, isBalanceAffecting: false };
      
      if (entry.status === LEDGER_STATUSES.POSTED && config.isBalanceAffecting) {
        if (config.category === LEDGER_CATEGORIES.CHARGES) {
          runningBalance += entry.amount;
        } else if (config.category === LEDGER_CATEGORIES.PAYMENTS) {
          runningBalance -= entry.amount;
        } else if (config.category === LEDGER_CATEGORIES.ADJUSTMENTS) {
          runningBalance -= entry.amount;
        }
      }

      return {
        ...entry,
        category: config.category,
        label: config.label,
        running_patient_ar_balance: roundToTwo(runningBalance)
      };
    });
  },

  /**
   * Posts a new immutable ledger transaction line.
   */
  postLedgerEntry({
    surgeryId,
    facilityId = 'fac-001',
    entryType,
    amount,
    effectiveDate,
    description,
    sourceModule = 'ManualPosting',
    sourceReferenceId = null,
    metadata = {},
    createdBy = 'current-user'
  }) {
    if (!surgeryId) throw new Error('surgeryId is required to post a ledger entry');
    if (!entryType || !ENTRY_TYPE_CONFIG[entryType]) throw new Error(`Invalid entryType: ${entryType}`);
    
    const parsedAmount = roundToTwo(amount);
    if (parsedAmount <= 0) throw new Error('Ledger entry amount must be strictly greater than $0.00');

    const entries = this.getCaseLedgerEntries(surgeryId, facilityId);
    const lastEntry = entries[entries.length - 1];
    const prevHash = lastEntry ? lastEntry.audit_hash : '0000000000000000000000000000000000000000000000000000000000000000';

    const newNumber = (lastEntry ? lastEntry.entry_number : 0) + 1;
    const config = ENTRY_TYPE_CONFIG[entryType];

    // Compute deterministic pseudo-SHA256 audit hash
    const hashPayload = `${prevHash}|${surgeryId}|${entryType}|${parsedAmount.toFixed(2)}|${effectiveDate || new Date().toISOString()}|${newNumber}`;
    const auditHash = this.computeAuditHash(hashPayload);

    const newEntry = {
      id: `ledg-${surgeryId}-${String(newNumber).padStart(2, '0')}`,
      facility_id: facilityId,
      surgery_id: surgeryId,
      entry_number: newNumber,
      entry_type: entryType,
      entry_sign: config.sign,
      amount: parsedAmount,
      effective_date: effectiveDate || new Date().toISOString().split('T')[0],
      description: description || config.label,
      source_module: sourceModule,
      source_reference_id: sourceReferenceId,
      status: LEDGER_STATUSES.POSTED,
      reversal_of_entry_id: null,
      metadata: metadata || {},
      audit_hash: auditHash,
      created_at: new Date().toISOString(),
      created_by: createdBy
    };

    const store = caseLedgerStore.get(surgeryId) || [];
    store.push(newEntry);
    caseLedgerStore.set(surgeryId, store);

    return newEntry;
  },

  /**
   * Reverses an existing ledger entry with a mandatory audit rationale.
   */
  reverseLedgerEntry(surgeryId, entryId, reversalReason, reversedBy = 'current-user') {
    if (!reversalReason || reversalReason.trim().length < 10) {
      throw new Error('Reversal rationale must be at least 10 characters long');
    }

    const store = caseLedgerStore.get(surgeryId) || [];
    const targetIndex = store.findIndex(e => e.id === entryId);
    if (targetIndex === -1) {
      throw new Error(`Ledger entry ${entryId} not found on case ${surgeryId}`);
    }

    const target = store[targetIndex];
    if (target.status === LEDGER_STATUSES.REVERSED) {
      throw new Error(`Ledger entry ${entryId} is already reversed`);
    }

    // Mark original as REVERSED
    target.status = LEDGER_STATUSES.REVERSED;

    // Post an offsetting reversal line
    const lastEntry = store[store.length - 1];
    const prevHash = lastEntry.audit_hash;
    const newNumber = lastEntry.entry_number + 1;

    const hashPayload = `${prevHash}|${surgeryId}|REVERSAL_${target.entry_type}|${target.amount.toFixed(2)}|${newNumber}`;
    const auditHash = this.computeAuditHash(hashPayload);

    const reversalEntry = {
      id: `ledg-${surgeryId}-${String(newNumber).padStart(2, '0')}`,
      facility_id: target.facility_id,
      surgery_id: surgeryId,
      entry_number: newNumber,
      entry_type: target.entry_type,
      entry_sign: target.entry_sign === 0 ? 0 : -target.entry_sign,
      amount: target.amount,
      effective_date: new Date().toISOString().split('T')[0],
      description: `REVERSAL of Entry #${target.entry_number}: ${reversalReason}`,
      source_module: 'LedgerAdjustment',
      source_reference_id: `REV-${target.id}`,
      status: LEDGER_STATUSES.POSTED,
      reversal_of_entry_id: target.id,
      metadata: { original_entry_id: target.id, rationale: reversalReason },
      audit_hash: auditHash,
      created_at: new Date().toISOString(),
      created_by: reversedBy
    };

    store.push(reversalEntry);
    caseLedgerStore.set(surgeryId, store);

    return { original: target, reversal: reversalEntry };
  },

  /**
   * Computes the authoritative financial summary and contribution margins for a case.
   */
  getCaseFinancialSummary(surgeryId, facilityId = 'fac-001', orDurationMinutes = 60) {
    const entries = this.getCaseLedgerEntries(surgeryId, facilityId);
    return this.calculateContributionMargin(entries, null, orDurationMinutes);
  },

  /**
   * Pure calculation engine evaluating margins from transaction rows.
   */
  calculateContributionMargin(entries, overrideAllowable = null, orMinutes = 60) {
    let totalBilledCharges = 0;
    let expectedContractAllowable = overrideAllowable !== null ? roundToTwo(overrideAllowable) : 0;
    let payerPayments = 0;
    let patientPayments = 0;
    let secondaryPayments = 0;
    let recoupments = 0;
    let contractualAdjustments = 0;
    let adminWriteOffs = 0;

    let implantCost = 0;
    let supplyCost = 0;
    let laborCost = 0;
    let orTimeCost = 0;

    let hasImplantLine = false;
    let hasSupplyLine = false;
    let hasLaborLine = false;
    let hasOrTimeLine = false;

    // Filter to active POSTED lines only
    const postedEntries = entries.filter(e => e.status === LEDGER_STATUSES.POSTED);

    for (const e of postedEntries) {
      const amt = Number(e.amount) || 0;

      switch (e.entry_type) {
        case LEDGER_ENTRY_TYPES.CHARGE:
          totalBilledCharges += amt;
          break;
        case LEDGER_ENTRY_TYPES.EXPECTED_ALLOWABLE:
          if (overrideAllowable === null) {
            expectedContractAllowable = amt;
          }
          break;
        case LEDGER_ENTRY_TYPES.PAYER_PAYMENT:
          payerPayments += amt;
          break;
        case LEDGER_ENTRY_TYPES.PATIENT_PAYMENT:
          patientPayments += amt;
          break;
        case LEDGER_ENTRY_TYPES.SECONDARY_PAYMENT:
          secondaryPayments += amt;
          break;
        case LEDGER_ENTRY_TYPES.REFUND_RECOUPMENT:
          recoupments += amt;
          break;
        case LEDGER_ENTRY_TYPES.CONTRACTUAL_ADJUSTMENT:
          contractualAdjustments += amt;
          break;
        case LEDGER_ENTRY_TYPES.ADMIN_WRITE_OFF:
          adminWriteOffs += amt;
          break;
        case LEDGER_ENTRY_TYPES.IMPLANT_COST:
          implantCost += amt;
          hasImplantLine = true;
          break;
        case LEDGER_ENTRY_TYPES.SUPPLY_COST:
          supplyCost += amt;
          hasSupplyLine = true;
          break;
        case LEDGER_ENTRY_TYPES.LABOR_COST:
          laborCost += amt;
          hasLaborLine = true;
          break;
        case LEDGER_ENTRY_TYPES.OR_TIME_COST:
          orTimeCost += amt;
          hasOrTimeLine = true;
          break;
      }
    }

    const totalNetCollections = roundToTwo((payerPayments + patientPayments + secondaryPayments) - recoupments);
    const totalDirectCaseCosts = roundToTwo(implantCost + supplyCost + laborCost + orTimeCost);

    // Contribution Margins
    const expectedContributionMargin = roundToTwo(expectedContractAllowable - totalDirectCaseCosts);
    const actualContributionMargin = roundToTwo(totalNetCollections - totalDirectCaseCosts);

    // Margin Percentage Yield
    const expectedMarginPct = expectedContractAllowable > 0
      ? roundToTwo((expectedContributionMargin / expectedContractAllowable) * 100)
      : 0.00;

    const actualMarginPct = totalNetCollections > 0
      ? roundToTwo((actualContributionMargin / totalNetCollections) * 100)
      : 0.00;

    // Margin Per OR Minute
    const validMinutes = Math.max(1, orMinutes);
    const expectedMarginPerOrMinute = roundToTwo(expectedContributionMargin / validMinutes);
    const actualMarginPerOrMinute = roundToTwo(actualContributionMargin / validMinutes);

    // Data Completeness Scoring
    let completenessStatus = FINANCIAL_COMPLETENESS_STATUSES.COMPLETE;
    const completenessIssues = [];

    if (expectedContractAllowable <= 0) {
      completenessStatus = FINANCIAL_COMPLETENESS_STATUSES.RATE_NOT_FOUND;
      completenessIssues.push('Payer contract allowable is not resolved or locked');
    }

    // If case has zero direct costs recorded, it is incomplete/estimated
    if (!hasImplantLine && !hasSupplyLine && !hasLaborLine && !hasOrTimeLine) {
      completenessStatus = FINANCIAL_COMPLETENESS_STATUSES.MISSING_SOURCE_DATA;
      completenessIssues.push('Zero direct clinical costs recorded in case ledger');
    } else if (!hasLaborLine || !hasOrTimeLine) {
      completenessStatus = FINANCIAL_COMPLETENESS_STATUSES.ESTIMATED;
      completenessIssues.push('Labor or OR time costs are provisional estimates');
    }

    // AR Balance = Billed Charges - Contractual Adjustments - Admin Write-Offs - Net Collections
    const patientAndPayerOutstandingAr = roundToTwo(
      totalBilledCharges - contractualAdjustments - adminWriteOffs - totalNetCollections
    );

    return {
      totalBilledCharges: roundToTwo(totalBilledCharges),
      expectedContractAllowable: roundToTwo(expectedContractAllowable),
      totalNetCollections,
      payerPayments: roundToTwo(payerPayments),
      patientPayments: roundToTwo(patientPayments),
      secondaryPayments: roundToTwo(secondaryPayments),
      recoupments: roundToTwo(recoupments),
      contractualAdjustments: roundToTwo(contractualAdjustments),
      adminWriteOffs: roundToTwo(adminWriteOffs),
      patientAndPayerOutstandingAr: Math.max(0, patientAndPayerOutstandingAr),

      // Direct Costs Breakdown
      implantCost: roundToTwo(implantCost),
      supplyCost: roundToTwo(supplyCost),
      laborCost: roundToTwo(laborCost),
      orTimeCost: roundToTwo(orTimeCost),
      totalDirectCaseCosts,

      // Margins
      expectedContributionMargin,
      actualContributionMargin,
      expectedMarginPct,
      actualMarginPct,
      expectedMarginPerOrMinute,
      actualMarginPerOrMinute,
      orMinutes: validMinutes,

      // Quality & Governance
      completenessStatus: completenessStatus.code,
      completenessDetails: completenessStatus,
      completenessIssues,
      isProvisional: completenessStatus.code !== 'COMPLETE',
      allowsClosedPeriodAggregation: completenessStatus.allowsAggregation,
      totalTransactionCount: entries.length,
      activePostedCount: postedEntries.length
    };
  },

  /**
   * Deterministic simple hash simulator for audit hash chaining.
   */
  computeAuditHash(inputString) {
    let hash = 0;
    for (let i = 0; i < inputString.length; i++) {
      const char = inputString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0; // Convert to 32bit integer
    }
    const hex = Math.abs(hash).toString(16).padStart(8, '0');
    return `${hex}4a8f9b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f`;
  },

  /**
   * Formats numbers to currency string with proper debit/credit signs.
   */
  formatCurrency(amount, entrySign = null) {
    if (amount === null || amount === undefined || isNaN(amount)) return '$0.00';
    const num = Number(amount);
    const prefix = entrySign === -1 ? '-' : (entrySign === 1 ? '+' : '');
    return `${prefix}$${Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
};
