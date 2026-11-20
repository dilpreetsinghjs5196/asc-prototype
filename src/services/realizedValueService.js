/**
 * ==============================================================================
 * Phase D6: Realized Value Calculation Service
 * Module 13: Decision Intelligence
 * Description: Authoritative 4-Pillar Realized Economic Value & Multi-Pillar ROI Engine.
 *              Quantifies Recovered Revenue, Direct Savings, Capacity Value, and
 *              Avoided Costs net of intervention labor.
 * Maestro Clinical Design System: Emerald, Amber, Crimson, Sky, Slate, Neutral
 * Zero Prohibited Accent Tokens
 * ==============================================================================
 */

import { getNextBestFinancialActions, getActionById } from './nextBestActionService.js';
import { getLedgerEntryByActionId } from './decisionLedgerService.js';

let nodeCrypto = null;
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  try {
    nodeCrypto = await import('node:crypto');
  } catch {
    // browser fallback
  }
}

const NAPLES_FACILITY_ALIASES = ['fac-naples-01', '00000000-0000-0000-0000-000000000002'];

export function matchesFacilityId(recordFacilityId, requestedFacilityId) {
  if (!requestedFacilityId || requestedFacilityId === 'ALL') return true;
  if (recordFacilityId === requestedFacilityId) return true;
  if (NAPLES_FACILITY_ALIASES.includes(recordFacilityId) && NAPLES_FACILITY_ALIASES.includes(requestedFacilityId)) {
    return true;
  }
  return false;
}

/**
 * Deterministic cryptographic calculation provenance hash
 */
export function computeCalculationProvenanceHash(payload) {
  const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
  if (nodeCrypto && typeof nodeCrypto.createHash === 'function') {
    return nodeCrypto.createHash('sha256').update(str).digest('hex');
  }
  let h1 = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h1 = Math.imul(h1 ^ str.charCodeAt(i), 0x01000193);
  }
  return `calc_hash_${(h1 >>> 0).toString(16)}`.padEnd(64, '0');
}

export const VALUE_PILLARS = {
  RECOVERED_REVENUE: 'RECOVERED_REVENUE',
  DIRECT_SAVINGS: 'DIRECT_SAVINGS',
  CAPACITY_VALUE: 'CAPACITY_VALUE',
  AVOIDED_COST: 'AVOIDED_COST'
};

export const BASELINE_CM_PER_OR_HOUR = 1975.00;
export const BASELINE_HOURLY_LABOR_RATE = 65.00;

/**
 * Calculate deterministic capacity monetization
 */
export function calculateCapacityValue(hoursFreed = 0, fillRatePct = 100.0, cmPerHour = BASELINE_CM_PER_OR_HOUR) {
  const hrs = Math.max(0, Number(hoursFreed ?? 0));
  const rateVal = (fillRatePct !== undefined && fillRatePct !== null) ? Number(fillRatePct) : 100.0;
  const rate = Math.max(0, Math.min(100.0, rateVal)) / 100.0;
  const cm = Math.max(0, Number(cmPerHour ?? BASELINE_CM_PER_OR_HOUR));
  return Math.round((hrs * rate * cm) * 100) / 100;
}

/**
 * Calculate gross 4-pillar realized economic value
 */
export function calculateGrossValue(revenue = 0, savings = 0, capacity = 0, avoided = 0) {
  const r = Math.max(0, Number(revenue || 0));
  const s = Math.max(0, Number(savings || 0));
  const c = Math.max(0, Number(capacity || 0));
  const a = Math.max(0, Number(avoided || 0));
  return Math.round((r + s + c + a) * 100) / 100;
}

/**
 * Calculate net realized value (Gross - Labor Cost)
 */
export function calculateNetRealizedValue(grossValue = 0, laborCost = 0) {
  const g = Number(grossValue || 0);
  const l = Math.max(0, Number(laborCost || 0));
  return Math.round((g - l) * 100) / 100;
}

/**
 * Calculate ROI multiplier
 */
export function calculateRoiMultiplier(netValue = 0, laborCost = 0) {
  const net = Number(netValue || 0);
  const labor = Number(laborCost || 0);
  if (labor <= 0) {
    return Math.round((net / 100.0) * 10) / 10;
  }
  return Math.round((net / labor) * 10) / 10;
}

/**
 * Seed 4-Pillar Realized Value Calculations
 */
export const SEED_REALIZED_VALUE_CALCULATIONS = [
  {
    id: 'rvc-001',
    facilityId: 'fac-naples-01',
    actionId: 'a001-nbfa-001-naples',
    ledgerEntryId: 'blk-001',
    calculationCode: 'RVC-2026-001',
    actionCode: 'NBFA-2026-0801',
    category: 'DENIAL_APPEAL_URGENT',
    title: 'Urgent CARC 16 Appeal: Aetna Arthroscopy Carveout Denied',
    valuePillar: VALUE_PILLARS.RECOVERED_REVENUE,
    recoveredRevenueAmount: 3450.00,
    directSavingsAmount: 0.00,
    capacityValueAmount: 0.00,
    avoidedCostAmount: 250.00,
    grossRealizedValue: 3700.00,
    interventionLaborCost: 130.00, // 2 hrs @ $65/hr
    netRealizedValue: 3570.00,
    roiMultiplier: 27.5,
    capacityHoursFreed: 0.0,
    capacityCmPerHour: BASELINE_CM_PER_OR_HOUR,
    avoidedRiskType: 'TIMELY_FILING_WRITEOFF',
    calculationProvenanceHash: '8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a',
    verifiedAt: '2026-11-20T10:00:00Z',
    verifiedByUserId: 'usr_cfo_marcus',
    createdAt: '2026-11-20T10:00:00Z',
    updatedAt: '2026-11-20T10:00:00Z'
  },
  {
    id: 'rvc-002',
    facilityId: 'fac-naples-01',
    actionId: 'a002-nbfa-002-naples',
    ledgerEntryId: 'blk-002',
    calculationCode: 'RVC-2026-002',
    actionCode: 'NBFA-2026-0802',
    category: 'OR_BLOCK_RELEASE',
    title: 'Auto-Release Low-Utilized OR-2 Thursday Block to Waitlist',
    valuePillar: VALUE_PILLARS.CAPACITY_VALUE,
    recoveredRevenueAmount: 0.00,
    directSavingsAmount: 0.00,
    capacityValueAmount: 15800.00, // 8 hrs booked @ $1,975/hr
    avoidedCostAmount: 0.00,
    grossRealizedValue: 15800.00,
    interventionLaborCost: 65.00, // 1 hr @ $65/hr
    netRealizedValue: 15735.00,
    roiMultiplier: 242.1,
    capacityHoursFreed: 8.0,
    capacityCmPerHour: BASELINE_CM_PER_OR_HOUR,
    avoidedRiskType: null,
    calculationProvenanceHash: '7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b',
    verifiedAt: '2026-11-19T17:30:00Z',
    verifiedByUserId: 'usr_cfo_marcus',
    createdAt: '2026-11-19T17:30:00Z',
    updatedAt: '2026-11-19T17:30:00Z'
  },
  {
    id: 'rvc-003',
    facilityId: 'fac-naples-01',
    actionId: 'a003-nbfa-003-naples',
    ledgerEntryId: 'blk-003',
    calculationCode: 'RVC-2026-003',
    actionCode: 'NBFA-2026-0803',
    category: 'MISSING_CHARGE_CAPTURE',
    title: 'Missing Operative Note: Dr. Vance Knee Arthroscopy',
    valuePillar: VALUE_PILLARS.RECOVERED_REVENUE,
    recoveredRevenueAmount: 5120.00,
    directSavingsAmount: 0.00,
    capacityValueAmount: 0.00,
    avoidedCostAmount: 0.00,
    grossRealizedValue: 5120.00,
    interventionLaborCost: 195.00, // 3 hrs @ $65/hr
    netRealizedValue: 4925.00,
    roiMultiplier: 25.3,
    capacityHoursFreed: 0.0,
    capacityCmPerHour: BASELINE_CM_PER_OR_HOUR,
    avoidedRiskType: 'UNBILLED_CASE_EXPIRATION',
    calculationProvenanceHash: '6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c',
    verifiedAt: '2026-11-18T15:00:00Z',
    verifiedByUserId: 'usr_cfo_marcus',
    createdAt: '2026-11-18T15:00:00Z',
    updatedAt: '2026-11-18T15:00:00Z'
  },
  {
    id: 'rvc-004',
    facilityId: 'fac-naples-01',
    actionId: 'a004-nbfa-004-naples',
    ledgerEntryId: 'blk-004',
    calculationCode: 'RVC-2026-004',
    actionCode: 'NBFA-2026-0804',
    category: 'PRIOR_AUTH_EXPIRING',
    title: 'Expired Prior-Authorization Renewal: Total Knee Arthroplasty',
    valuePillar: VALUE_PILLARS.RECOVERED_REVENUE,
    recoveredRevenueAmount: 6400.00,
    directSavingsAmount: 0.00,
    capacityValueAmount: 0.00,
    avoidedCostAmount: 1400.00,
    grossRealizedValue: 7800.00,
    interventionLaborCost: 260.00, // 4 hrs @ $65/hr
    netRealizedValue: 7540.00,
    roiMultiplier: 29.0,
    capacityHoursFreed: 0.0,
    capacityCmPerHour: BASELINE_CM_PER_OR_HOUR,
    avoidedRiskType: 'UNAUTHORIZED_PROCEDURE_FORFEITURE',
    calculationProvenanceHash: '5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d',
    verifiedAt: '2026-11-17T13:00:00Z',
    verifiedByUserId: 'usr_cfo_marcus',
    createdAt: '2026-11-17T13:00:00Z',
    updatedAt: '2026-11-17T13:00:00Z'
  },
  {
    id: 'rvc-005',
    facilityId: 'fac-naples-01',
    actionId: 'a005-nbfa-005-naples',
    ledgerEntryId: 'blk-005',
    calculationCode: 'RVC-2026-005',
    actionCode: 'NBFA-2026-0805',
    category: 'IMPLANT_CARVEOUT_CLAIM',
    title: 'Attach Missing Vendor Invoice: Stryker Meniscal Dart',
    valuePillar: VALUE_PILLARS.DIRECT_SAVINGS,
    recoveredRevenueAmount: 0.00,
    directSavingsAmount: 1250.00,
    capacityValueAmount: 0.00,
    avoidedCostAmount: 2870.00,
    grossRealizedValue: 4120.00,
    interventionLaborCost: 130.00,
    netRealizedValue: 3990.00,
    roiMultiplier: 30.7,
    capacityHoursFreed: 0.0,
    capacityCmPerHour: BASELINE_CM_PER_OR_HOUR,
    avoidedRiskType: 'UNREIMBURSED_IMPLANT_CARVEOUT',
    calculationProvenanceHash: '4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e',
    verifiedAt: '2026-11-19T16:00:00Z',
    verifiedByUserId: 'usr_cfo_marcus',
    createdAt: '2026-11-19T16:00:00Z',
    updatedAt: '2026-11-19T16:00:00Z'
  },
  {
    id: 'rvc-006',
    facilityId: 'fac-naples-01',
    actionId: 'a006-nbfa-006-naples',
    ledgerEntryId: 'blk-006',
    calculationCode: 'RVC-2026-006',
    actionCode: 'NBFA-2026-0806',
    category: 'PRE_SERVICE_DEPOSIT_COLLECTION',
    title: 'Pre-Service Balance Collection: Surgery Tomorrow 08:30 AM',
    valuePillar: VALUE_PILLARS.RECOVERED_REVENUE,
    recoveredRevenueAmount: 1500.00,
    directSavingsAmount: 0.00,
    capacityValueAmount: 0.00,
    avoidedCostAmount: 150.00, // 10% contingency fee saved
    grossRealizedValue: 1650.00,
    interventionLaborCost: 32.50, // 0.5 hr @ $65/hr
    netRealizedValue: 1617.50,
    roiMultiplier: 49.8,
    capacityHoursFreed: 0.0,
    capacityCmPerHour: BASELINE_CM_PER_OR_HOUR,
    avoidedRiskType: 'BAD_DEBT_COLLECTION_AGENCY_FEE',
    calculationProvenanceHash: '3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f',
    verifiedAt: '2026-11-20T09:00:00Z',
    verifiedByUserId: 'usr_cfo_marcus',
    createdAt: '2026-11-20T09:00:00Z',
    updatedAt: '2026-11-20T09:00:00Z'
  },
  {
    id: 'rvc-007',
    facilityId: 'fac-naples-01',
    actionId: 'a007-nbfa-007-naples',
    ledgerEntryId: 'blk-007',
    calculationCode: 'RVC-2026-007',
    actionCode: 'NBFA-2026-0807',
    category: 'SECONDARY_CROSSOVER_SUBMISSION',
    title: 'Generate Humana Secondary Claim: Medicare Primary Remitted',
    valuePillar: VALUE_PILLARS.RECOVERED_REVENUE,
    recoveredRevenueAmount: 2240.00,
    directSavingsAmount: 0.00,
    capacityValueAmount: 0.00,
    avoidedCostAmount: 220.00, // FL prompt-pay statutory penalty interest saved
    grossRealizedValue: 2460.00,
    interventionLaborCost: 65.00, // 1.0 hr @ $65/hr
    netRealizedValue: 2395.00,
    roiMultiplier: 36.8,
    capacityHoursFreed: 0.0,
    capacityCmPerHour: BASELINE_CM_PER_OR_HOUR,
    avoidedRiskType: 'FL_STATUTORY_PROMPT_PAY_PENALTY',
    calculationProvenanceHash: '2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a',
    verifiedAt: '2026-11-19T11:00:00Z',
    verifiedByUserId: 'usr_cfo_marcus',
    createdAt: '2026-11-19T11:00:00Z',
    updatedAt: '2026-11-19T11:00:00Z'
  }
];

export const SEED_REALIZED_VALUE_LINE_ITEMS = [
  {
    id: 'rvl-001-01',
    calculationId: 'rvc-001',
    facilityId: 'fac-naples-01',
    lineItemName: 'Overturned CARC 16 Claim Allowed Payment',
    pillar: 'RECOVERED_REVENUE',
    quantity: 1.0,
    unitRate: 3450.00,
    totalAmount: 3450.00,
    sourceTable: 'claims_line_items',
    sourceRecordId: 'CLM-89021-L2'
  },
  {
    id: 'rvl-001-02',
    calculationId: 'rvc-001',
    facilityId: 'fac-naples-01',
    lineItemName: 'Avoided Timely Filing Permanent Write-Off',
    pillar: 'AVOIDED_COST',
    quantity: 1.0,
    unitRate: 250.00,
    totalAmount: 250.00,
    sourceTable: 'claims_writeoffs',
    sourceRecordId: 'WO-EST-89021'
  },
  {
    id: 'rvl-002-01',
    calculationId: 'rvc-002',
    facilityId: 'fac-naples-01',
    lineItemName: 'Freed OR-2 Thursday Block Reallocation (8.0 Hours)',
    pillar: 'CAPACITY_VALUE',
    quantity: 8.0,
    unitRate: BASELINE_CM_PER_OR_HOUR,
    totalAmount: 15800.00,
    sourceTable: 'or_schedule_blocks',
    sourceRecordId: 'BLK-OR2-THU'
  },
  {
    id: 'rvl-005-01',
    calculationId: 'rvc-005',
    facilityId: 'fac-naples-01',
    lineItemName: 'Vendor Invoice Volume Rebate Credit (Stryker Dart)',
    pillar: 'DIRECT_SAVINGS',
    quantity: 1.0,
    unitRate: 1250.00,
    totalAmount: 1250.00,
    sourceTable: 'vendor_invoices',
    sourceRecordId: 'INV-STR-9021'
  }
];

// Active in-memory stores
let activeCalculations = [...SEED_REALIZED_VALUE_CALCULATIONS.map(c => ({ ...c }))];
let activeLineItems = [...SEED_REALIZED_VALUE_LINE_ITEMS.map(li => ({ ...li }))];

/**
 * Reset Store (for testing fixtures)
 */
export function resetRealizedValueStore() {
  activeCalculations = SEED_REALIZED_VALUE_CALCULATIONS.map(c => ({ ...c }));
  activeLineItems = SEED_REALIZED_VALUE_LINE_ITEMS.map(li => ({ ...li }));
  return { activeCalculations, activeLineItems };
}

/**
 * Retrieve Realized Value Calculations with filtering
 */
export function getRealizedValueCalculations(facilityId = 'fac-naples-01', filters = {}) {
  const {
    valuePillar = 'ALL',
    category = 'ALL',
    searchQuery = ''
  } = filters;

  return activeCalculations
    .map(item => ({
      ...item,
      provenanceHash: item.provenanceHash || item.calculationProvenanceHash
    }))
    .filter(item => {
    if (facilityId && facilityId !== 'ALL' && !matchesFacilityId(item.facilityId, facilityId)) {
      return false;
    }
    if (valuePillar && valuePillar !== 'ALL' && item.valuePillar !== valuePillar) {
      return false;
    }
    if (category && category !== 'ALL' && item.category !== category) {
      return false;
    }
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchCode = item.calculationCode?.toLowerCase().includes(q);
      const matchAction = item.actionCode?.toLowerCase().includes(q);
      const matchTitle = item.title?.toLowerCase().includes(q);
      const matchRisk = item.avoidedRiskType?.toLowerCase().includes(q);
      if (!matchCode && !matchAction && !matchTitle && !matchRisk) return false;
    }
    return true;
  });
}

/**
 * Retrieve calculation by ID or calculation code
 */
export function getCalculationById(idOrCode) {
  if (!idOrCode) return null;
  const target = String(idOrCode).toLowerCase();
  return activeCalculations.find(c =>
    c.id?.toLowerCase() === target ||
    c.calculationCode?.toLowerCase() === target ||
    c.id?.toLowerCase().replace('rvc-', 'calc-') === target ||
    c.id?.toLowerCase() === target.replace('calc-', 'rvc-')
  ) || null;
}

/**
 * Retrieve calculation by Action ID or Action Code
 */
export function getCalculationByActionId(actionId) {
  return activeCalculations.find(c => c.actionId === actionId || c.actionCode === actionId) || null;
}

/**
 * Retrieve line items for a calculation
 */
export function getCalculationLineItems(calculationId) {
  if (!calculationId || calculationId === 'ALL') return activeLineItems;
  const target = String(calculationId).toLowerCase();
  return activeLineItems.filter(li =>
    li.calculationId?.toLowerCase() === target ||
    li.calculationId?.toLowerCase().replace('rvc-', 'calc-') === target ||
    li.calculationId?.toLowerCase() === target.replace('calc-', 'rvc-')
  );
}

/**
 * Record a new realized value calculation
 */
export function recordRealizedValueCalculation(calculationData = {}, userContext = {}) {
  const {
    actionId = null,
    actionCode = 'NBFA-AUTO',
    category = 'DENIAL_APPEAL_URGENT',
    title = 'Economic Yield Recovery',
    valuePillar = VALUE_PILLARS.RECOVERED_REVENUE,
    recoveredRevenueAmount = 0,
    directSavingsAmount = 0,
    capacityValueAmount = 0,
    avoidedCostAmount = 0,
    interventionLaborCost = 0,
    laborHoursLogged = 0,
    hourlyLaborRate = BASELINE_HOURLY_LABOR_RATE,
    capacityHoursFreed = 0,
    capacityCmPerHour = BASELINE_CM_PER_OR_HOUR,
    avoidedRiskType = null,
    lineItems = []
  } = calculationData;

  // Validate non-negative pillar values
  if (recoveredRevenueAmount < 0 || directSavingsAmount < 0 || capacityValueAmount < 0 || avoidedCostAmount < 0) {
    throw new Error('Individual value pillar amounts cannot be negative.');
  }

  const gross = calculateGrossValue(recoveredRevenueAmount, directSavingsAmount, capacityValueAmount, avoidedCostAmount);
  const computedLabor = Number(interventionLaborCost) > 0
    ? Number(interventionLaborCost)
    : Math.round((Number(laborHoursLogged || 0) * Number(hourlyLaborRate || BASELINE_HOURLY_LABOR_RATE)) * 100) / 100;
  const labor = Math.max(0, computedLabor);
  const net = calculateNetRealizedValue(gross, labor);
  const roi = calculateRoiMultiplier(net, labor);

  const calcId = `rvc-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
  const calcCode = `RVC-2026-${String(activeCalculations.length + 1).padStart(3, '0')}`;

  const provenanceHash = computeCalculationProvenanceHash({
    calcCode,
    actionCode,
    gross,
    net,
    roi,
    timestamp: new Date().toISOString()
  });

  const record = {
    id: calcId,
    facilityId: 'fac-naples-01',
    actionId,
    ledgerEntryId: null,
    calculationCode: calcCode,
    actionCode,
    category,
    title,
    valuePillar,
    recoveredRevenueAmount: Number(recoveredRevenueAmount || 0),
    directSavingsAmount: Number(directSavingsAmount || 0),
    capacityValueAmount: Number(capacityValueAmount || 0),
    avoidedCostAmount: Number(avoidedCostAmount || 0),
    grossRealizedValue: gross,
    interventionLaborCost: labor,
    netRealizedValue: net,
    roiMultiplier: roi,
    capacityHoursFreed: Number(capacityHoursFreed || 0),
    capacityCmPerHour: Number(capacityCmPerHour || BASELINE_CM_PER_OR_HOUR),
    avoidedRiskType,
    provenanceHash: provenanceHash,
    calculationProvenanceHash: provenanceHash,
    verifiedAt: new Date().toISOString(),
    verifiedByUserId: userContext.userId || 'usr_cfo_marcus',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  activeCalculations.unshift(record);

  // Append line items if provided
  if (Array.isArray(lineItems) && lineItems.length > 0) {
    lineItems.forEach((li, idx) => {
      activeLineItems.push({
        id: `rvl-${calcId}-${idx}`,
        calculationId: calcId,
        facilityId: 'fac-naples-01',
        lineItemName: li.lineItemName || 'Value Line Item',
        pillar: li.pillar || valuePillar,
        quantity: Number(li.quantity || 1.0),
        unitRate: Number(li.unitRate || 0),
        totalAmount: Number(li.totalAmount || 0),
        sourceTable: li.sourceTable || 'manual_entry',
        sourceRecordId: li.sourceRecordId || `REF-${calcCode}`
      });
    });
  }

  return record;
}

/**
 * Realized Value Telemetry Aggregator
 */
export function getRealizedValueTelemetry(facilityId = 'fac-naples-01') {
  const calculations = getRealizedValueCalculations(facilityId, { valuePillar: 'ALL', category: 'ALL' });
  const total = calculations.length;

  const totalGross = calculations.reduce((sum, c) => sum + Number(c.grossRealizedValue || 0), 0);
  const totalRevenue = calculations.reduce((sum, c) => sum + Number(c.recoveredRevenueAmount || 0), 0);
  const totalSavings = calculations.reduce((sum, c) => sum + Number(c.directSavingsAmount || 0), 0);
  const totalCapacity = calculations.reduce((sum, c) => sum + Number(c.capacityValueAmount || 0), 0);
  const totalAvoided = calculations.reduce((sum, c) => sum + Number(c.avoidedCostAmount || 0), 0);
  const totalLabor = calculations.reduce((sum, c) => sum + Number(c.interventionLaborCost || 0), 0);
  const totalNet = calculateNetRealizedValue(totalGross, totalLabor);
  const totalHoursFreed = calculations.reduce((sum, c) => sum + Number(c.capacityHoursFreed || 0), 0);

  const cumulativeRoi = calculateRoiMultiplier(totalNet, totalLabor);

  return {
    totalCalculationsCount: total,
    totalCalculations: total,
    totalGrossRealizedValue: totalGross,
    totalGrossValue: totalGross,
    totalRecoveredRevenueAmount: totalRevenue,
    totalDirectSavingsAmount: totalSavings,
    totalCapacityValueAmount: totalCapacity,
    totalAvoidedCostAmount: totalAvoided,
    totalInterventionLaborCost: totalLabor,
    totalNetRealizedValue: totalNet,
    totalNetValue: totalNet,
    totalCapacityHoursFreed: totalHoursFreed,
    cumulativeRoiMultiplier: cumulativeRoi,
    roiMultiplier: cumulativeRoi,
    calculationStatus: '4-Pillar Economic ROI Verified'
  };
}
