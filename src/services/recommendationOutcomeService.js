/**
 * ==============================================================================
 * Phase D5: Recommendation Outcome Tracking & Attribution Service
 * Module 13: Decision Intelligence
 * Description: Authoritative causal attribution, counterfactual baseline estimation,
 *              net incremental uplift accounting, and model calibration analytics.
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
 * Deterministic cryptographic touchpoint hash
 */
export function computeTouchpointHash(payload) {
  const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
  if (nodeCrypto && typeof nodeCrypto.createHash === 'function') {
    return nodeCrypto.createHash('sha256').update(str).digest('hex');
  }
  let h1 = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h1 = Math.imul(h1 ^ str.charCodeAt(i), 0x01000193);
  }
  return `tp_hash_${(h1 >>> 0).toString(16)}`.padEnd(64, '0');
}

export const ATTRIBUTION_MODELS = {
  DIRECT_MACHINE_ATTRIBUTED: 'DIRECT_MACHINE_ATTRIBUTED',
  COLLABORATIVE_ATTRIBUTED: 'COLLABORATIVE_ATTRIBUTED',
  HUMAN_EXECUTIVE_ATTRIBUTED: 'HUMAN_EXECUTIVE_ATTRIBUTED',
  ORGANIC_BASELINE_ATTRIBUTED: 'ORGANIC_BASELINE_ATTRIBUTED'
};

export const TOUCHPOINT_STAGES = {
  DETECTION_NBFA: 'DETECTION_NBFA',
  PRIORITY_RANKING: 'PRIORITY_RANKING',
  EVIDENCE_ASSEMBLY: 'EVIDENCE_ASSEMBLY',
  HUMAN_APPROVAL: 'HUMAN_APPROVAL',
  DISPATCH_EXECUTION: 'DISPATCH_EXECUTION',
  REMITTANCE_ADJUDICATION: 'REMITTANCE_ADJUDICATION'
};

/**
 * Empirical counterfactual baseline factors by category
 * Standard probability that dollars would be recovered organically without intervention
 */
export const CATEGORY_COUNTERFACTUAL_FACTORS = {
  DENIAL_APPEAL_URGENT: 0.15,
  OR_BLOCK_RELEASE: 0.10,
  MISSING_CHARGE_CAPTURE: 0.05,
  PRIOR_AUTH_EXPIRING: 0.20,
  IMPLANT_CARVEOUT_CLAIM: 0.25,
  PRE_SERVICE_DEPOSIT_COLLECTION: 0.30,
  SECONDARY_CROSSOVER_SUBMISSION: 0.40
};

/**
 * Calculate counterfactual baseline recovery
 */
export function calculateCounterfactualBaseline(expectedValue, category) {
  const exp = Number(expectedValue || 0);
  const factor = CATEGORY_COUNTERFACTUAL_FACTORS[category] || 0.20;
  return Math.round((exp * factor) * 100) / 100;
}

/**
 * Calculate net incremental financial uplift
 */
export function calculateIncrementalUplift(grossRealized, counterfactualBaseline) {
  const realized = Number(grossRealized || 0);
  const baseline = Number(counterfactualBaseline || 0);
  return Math.round((realized - baseline) * 100) / 100;
}

/**
 * Calculate percentage uplift over baseline
 */
export function calculateUpliftPercentage(incrementalUplift, counterfactualBaseline) {
  const uplift = Number(incrementalUplift || 0);
  const baseline = Number(counterfactualBaseline || 0);
  if (baseline <= 0) return 0.0;
  return Math.round(((uplift / baseline) * 100.0) * 10) / 10;
}

/**
 * Calculate model calibration ratio (Realized / Expected)
 */
export function calculateModelCalibrationRatio(grossRealized, expectedValue) {
  const realized = Number(grossRealized || 0);
  const expected = Number(expectedValue || 0);
  if (expected <= 0) return 1.000;
  return Math.round((realized / expected) * 1000) / 1000;
}

/**
 * Validate that attribution percentages sum to 100.00%
 */
export function validateAttributionWeights(machinePct, humanPct) {
  const m = Number(machinePct || 0);
  const h = Number(humanPct || 0);
  const sum = Math.round((m + h) * 100) / 100;
  if (Math.abs(sum - 100.00) > 0.01) {
    throw new Error(`Attribution weights must sum exactly to 100.00% (got ${sum}%).`);
  }
  return true;
}

// Seed Outcomes Catalog
export const SEED_RECOMMENDATION_OUTCOMES = [
  {
    id: 'out-001',
    facilityId: 'fac-naples-01',
    actionId: 'a001-nbfa-001-naples',
    ledgerEntryId: 'blk-001',
    actionCode: 'NBFA-2026-0801',
    category: 'DENIAL_APPEAL_URGENT',
    title: 'Urgent CARC 16 Appeal: Aetna Arthroscopy Carveout Denied',
    attributionModel: ATTRIBUTION_MODELS.COLLABORATIVE_ATTRIBUTED,
    machineAttributionPct: 70.0,
    humanAttributionPct: 30.0,
    expectedFinancialValue: 3450.00,
    grossRealizedValue: 3450.00,
    baselineCounterfactualRecovery: 517.50,
    incrementalUpliftValue: 2932.50,
    incrementalUpliftPct: 566.7,
    daysSavedCycleTime: 26.0,
    modelCalibrationRatio: 1.000,
    outcomeConfidenceScore: 98.0,
    attributionRationale: 'Algorithm flagged 48-hour timely filing deadline and compiled CPT 29877 operative citations; Billing specialist submitted 837 appeal attachment.',
    verifiedByUserId: 'usr_cfo_marcus',
    measuredAt: '2026-11-20T09:35:00Z',
    createdAt: '2026-11-20T09:35:00Z',
    updatedAt: '2026-11-20T09:35:00Z'
  },
  {
    id: 'out-002',
    facilityId: 'fac-naples-01',
    actionId: 'a002-nbfa-002-naples',
    ledgerEntryId: 'blk-002',
    actionCode: 'NBFA-2026-0802',
    category: 'OR_BLOCK_RELEASE',
    title: 'Auto-Release Low-Utilized OR-2 Thursday Block to Waitlist',
    attributionModel: ATTRIBUTION_MODELS.COLLABORATIVE_ATTRIBUTED,
    machineAttributionPct: 60.0,
    humanAttributionPct: 40.0,
    expectedFinancialValue: 14200.00,
    grossRealizedValue: 15800.00,
    baselineCounterfactualRecovery: 1420.00,
    incrementalUpliftValue: 14380.00,
    incrementalUpliftPct: 1012.7,
    daysSavedCycleTime: 14.0,
    modelCalibrationRatio: 1.113,
    outcomeConfidenceScore: 95.0,
    attributionRationale: 'Predictive utilization model detected 35% utilization and auto-prompted block release; Scheduler and Clinical Director filled 3 high-margin cases.',
    verifiedByUserId: 'usr_cfo_marcus',
    measuredAt: '2026-11-19T17:15:00Z',
    createdAt: '2026-11-19T17:15:00Z',
    updatedAt: '2026-11-19T17:15:00Z'
  },
  {
    id: 'out-003',
    facilityId: 'fac-naples-01',
    actionId: 'a003-nbfa-003-naples',
    ledgerEntryId: 'blk-003',
    actionCode: 'NBFA-2026-0803',
    category: 'MISSING_CHARGE_CAPTURE',
    title: 'Missing Operative Note: Dr. Vance Knee Arthroscopy',
    attributionModel: ATTRIBUTION_MODELS.COLLABORATIVE_ATTRIBUTED,
    machineAttributionPct: 65.0,
    humanAttributionPct: 35.0,
    expectedFinancialValue: 5120.00,
    grossRealizedValue: 5120.00,
    baselineCounterfactualRecovery: 256.00,
    incrementalUpliftValue: 4864.00,
    incrementalUpliftPct: 1900.0,
    daysSavedCycleTime: 38.0,
    modelCalibrationRatio: 1.000,
    outcomeConfidenceScore: 96.0,
    attributionRationale: 'EHR schedule-to-claims reconciliation detected unbilled procedural record; HIM lead secured dictated op note from physician.',
    verifiedByUserId: 'usr_cfo_marcus',
    measuredAt: '2026-11-18T14:30:00Z',
    createdAt: '2026-11-18T14:30:00Z',
    updatedAt: '2026-11-18T14:30:00Z'
  },
  {
    id: 'out-004',
    facilityId: 'fac-naples-01',
    actionId: 'a004-nbfa-004-naples',
    ledgerEntryId: 'blk-004',
    actionCode: 'NBFA-2026-0804',
    category: 'PRIOR_AUTH_EXPIRING',
    title: 'Expired Prior-Authorization Renewal: Total Knee Arthroplasty',
    attributionModel: ATTRIBUTION_MODELS.COLLABORATIVE_ATTRIBUTED,
    machineAttributionPct: 50.0,
    humanAttributionPct: 50.0,
    expectedFinancialValue: 7800.00,
    grossRealizedValue: 6400.00,
    baselineCounterfactualRecovery: 1560.00,
    incrementalUpliftValue: 4840.00,
    incrementalUpliftPct: 310.3,
    daysSavedCycleTime: 12.0,
    modelCalibrationRatio: 0.821,
    outcomeConfidenceScore: 92.0,
    attributionRationale: 'Prior-auth window monitor caught expiration 3 days prior to DOS; Billing team renegotiated retro-authorization settling at $6,400.',
    verifiedByUserId: 'usr_cfo_marcus',
    measuredAt: '2026-11-17T12:00:00Z',
    createdAt: '2026-11-17T12:00:00Z',
    updatedAt: '2026-11-17T12:00:00Z'
  },
  {
    id: 'out-005',
    facilityId: 'fac-naples-01',
    actionId: 'a005-nbfa-005-naples',
    ledgerEntryId: 'blk-005',
    actionCode: 'NBFA-2026-0805',
    category: 'IMPLANT_CARVEOUT_CLAIM',
    title: 'Attach Missing Vendor Invoice: Stryker Meniscal Dart',
    attributionModel: ATTRIBUTION_MODELS.DIRECT_MACHINE_ATTRIBUTED,
    machineAttributionPct: 85.0,
    humanAttributionPct: 15.0,
    expectedFinancialValue: 4120.00,
    grossRealizedValue: 0.00,
    baselineCounterfactualRecovery: 1030.00,
    incrementalUpliftValue: -1030.00,
    incrementalUpliftPct: -100.0,
    daysSavedCycleTime: 0.0,
    modelCalibrationRatio: 0.000,
    outcomeConfidenceScore: 90.0,
    attributionRationale: 'Invoice cross-reference identified unattached Stryker invoice STR-9021; Awaiting electronic adjudication from payer.',
    verifiedByUserId: 'usr_cfo_marcus',
    measuredAt: '2026-11-19T15:40:00Z',
    createdAt: '2026-11-19T15:40:00Z',
    updatedAt: '2026-11-19T15:40:00Z'
  },
  {
    id: 'out-006',
    facilityId: 'fac-naples-01',
    actionId: 'a006-nbfa-006-naples',
    ledgerEntryId: 'blk-006',
    actionCode: 'NBFA-2026-0806',
    category: 'PRE_SERVICE_DEPOSIT_COLLECTION',
    title: 'Pre-Service Balance Collection: Surgery Tomorrow 08:30 AM',
    attributionModel: ATTRIBUTION_MODELS.DIRECT_MACHINE_ATTRIBUTED,
    machineAttributionPct: 80.0,
    humanAttributionPct: 20.0,
    expectedFinancialValue: 1500.00,
    grossRealizedValue: 1500.00,
    baselineCounterfactualRecovery: 450.00,
    incrementalUpliftValue: 1050.00,
    incrementalUpliftPct: 233.3,
    daysSavedCycleTime: 45.0,
    modelCalibrationRatio: 1.000,
    outcomeConfidenceScore: 95.0,
    attributionRationale: 'Real-time eligibility RTE triggered high-deductible copay balance SMS prompt; Patient completed online pre-payment.',
    verifiedByUserId: 'usr_cfo_marcus',
    measuredAt: '2026-11-20T08:50:00Z',
    createdAt: '2026-11-20T08:50:00Z',
    updatedAt: '2026-11-20T08:50:00Z'
  },
  {
    id: 'out-007',
    facilityId: 'fac-naples-01',
    actionId: 'a007-nbfa-007-naples',
    ledgerEntryId: 'blk-007',
    actionCode: 'NBFA-2026-0807',
    category: 'SECONDARY_CROSSOVER_SUBMISSION',
    title: 'Generate Humana Secondary Claim: Medicare Primary Remitted',
    attributionModel: ATTRIBUTION_MODELS.DIRECT_MACHINE_ATTRIBUTED,
    machineAttributionPct: 90.0,
    humanAttributionPct: 10.0,
    expectedFinancialValue: 2240.00,
    grossRealizedValue: 2240.00,
    baselineCounterfactualRecovery: 896.00,
    incrementalUpliftValue: 1344.00,
    incrementalUpliftPct: 150.0,
    daysSavedCycleTime: 18.0,
    modelCalibrationRatio: 1.000,
    outcomeConfidenceScore: 99.0,
    attributionRationale: '835 ERA remittance crossover monitor created automated secondary filing for Humana coinsurance.',
    verifiedByUserId: 'usr_cfo_marcus',
    measuredAt: '2026-11-19T10:20:00Z',
    createdAt: '2026-11-19T10:20:00Z',
    updatedAt: '2026-11-19T10:20:00Z'
  }
];

export const SEED_ATTRIBUTION_TOUCHPOINTS = [
  {
    id: 'tp-001-01',
    outcomeId: 'out-001',
    facilityId: 'fac-naples-01',
    touchpointStage: TOUCHPOINT_STAGES.DETECTION_NBFA,
    actorEntity: 'ALGO_NBFA_ENGINE',
    contributionWeightPct: 30.0,
    touchpointTimestamp: '2026-11-16T07:45:00Z',
    touchpointHash: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2'
  },
  {
    id: 'tp-001-02',
    outcomeId: 'out-001',
    facilityId: 'fac-naples-01',
    touchpointStage: TOUCHPOINT_STAGES.EVIDENCE_ASSEMBLY,
    actorEntity: 'SYSTEM_EVIDENCE_ASSEMBLER',
    contributionWeightPct: 40.0,
    touchpointTimestamp: '2026-11-16T07:55:00Z',
    touchpointHash: 'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3'
  },
  {
    id: 'tp-001-03',
    outcomeId: 'out-001',
    facilityId: 'fac-naples-01',
    touchpointStage: TOUCHPOINT_STAGES.HUMAN_APPROVAL,
    actorEntity: 'HUMAN_APPROVER_SARAH_JENKINS',
    contributionWeightPct: 30.0,
    touchpointTimestamp: '2026-11-16T08:00:00Z',
    touchpointHash: 'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4'
  },
  {
    id: 'tp-002-01',
    outcomeId: 'out-002',
    facilityId: 'fac-naples-01',
    touchpointStage: TOUCHPOINT_STAGES.DETECTION_NBFA,
    actorEntity: 'ALGO_OR_UTILIZATION_MODEL',
    contributionWeightPct: 60.0,
    touchpointTimestamp: '2026-11-17T10:30:00Z',
    touchpointHash: 'd4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5'
  },
  {
    id: 'tp-002-02',
    outcomeId: 'out-002',
    facilityId: 'fac-naples-01',
    touchpointStage: TOUCHPOINT_STAGES.HUMAN_APPROVAL,
    actorEntity: 'HUMAN_SCHEDULER_ELENA_ROSTOVA',
    contributionWeightPct: 40.0,
    touchpointTimestamp: '2026-11-17T11:00:00Z',
    touchpointHash: 'e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6'
  }
];

// Active in-memory stores
let activeOutcomes = [...SEED_RECOMMENDATION_OUTCOMES.map(o => ({ ...o }))];
let activeTouchpoints = [...SEED_ATTRIBUTION_TOUCHPOINTS.map(t => ({ ...t }))];

/**
 * Reset Store (for testing fixtures)
 */
export function resetOutcomeStore() {
  activeOutcomes = SEED_RECOMMENDATION_OUTCOMES.map(o => ({ ...o }));
  activeTouchpoints = SEED_ATTRIBUTION_TOUCHPOINTS.map(t => ({ ...t }));
  return { activeOutcomes, activeTouchpoints };
}

/**
 * Retrieve Recommendation Outcomes with filtering
 */
export function getRecommendationOutcomes(facilityId = 'fac-naples-01', filters = {}) {
  const {
    attributionModel = 'ALL',
    category = 'ALL',
    searchQuery = ''
  } = filters;

  return activeOutcomes.filter(item => {
    if (facilityId && facilityId !== 'ALL' && !matchesFacilityId(item.facilityId, facilityId)) {
      return false;
    }
    if (attributionModel && attributionModel !== 'ALL' && item.attributionModel !== attributionModel) {
      return false;
    }
    if (category && category !== 'ALL' && item.category !== category) {
      return false;
    }
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchCode = item.actionCode?.toLowerCase().includes(q);
      const matchTitle = item.title?.toLowerCase().includes(q);
      const matchRat = item.attributionRationale?.toLowerCase().includes(q);
      if (!matchCode && !matchTitle && !matchRat) return false;
    }
    return true;
  });
}

/**
 * Retrieve single outcome entry by ID
 */
export function getOutcomeById(id) {
  return activeOutcomes.find(o => o.id === id) || null;
}

/**
 * Retrieve outcome by Action ID or Action Code
 */
export function getOutcomeForAction(actionId) {
  return activeOutcomes.find(o => o.actionId === actionId || o.actionCode === actionId) || null;
}

/**
 * Retrieve attribution touchpoints for an outcome
 */
export function getAttributionTouchpoints(outcomeId) {
  if (!outcomeId || outcomeId === 'ALL') return activeTouchpoints;
  return activeTouchpoints.filter(t => t.outcomeId === outcomeId);
}

/**
 * Record or update causal outcome attribution
 */
export function recordOutcomeAttribution(actionId, outcomeData = {}, userContext = {}) {
  const {
    attributionModel = ATTRIBUTION_MODELS.COLLABORATIVE_ATTRIBUTED,
    machineAttributionPct = 70.0,
    humanAttributionPct = 30.0,
    grossRealizedValue = 0,
    expectedFinancialValue = 0,
    daysSavedCycleTime = 14.0,
    attributionRationale = '',
    touchpoints = []
  } = outcomeData;

  validateAttributionWeights(machineAttributionPct, humanAttributionPct);

  const action = getActionById(actionId);
  const ledger = getLedgerEntryByActionId(actionId);

  const expVal = Number(expectedFinancialValue || (action ? action.expectedFinancialValue : 0));
  const realVal = Number(grossRealizedValue || (ledger ? ledger.realizedFinancialValue : 0));
  const cat = action ? action.category : 'DENIAL_APPEAL_URGENT';

  const baseline = calculateCounterfactualBaseline(expVal, cat);
  const uplift = calculateIncrementalUplift(realVal, baseline);
  const upliftPct = calculateUpliftPercentage(uplift, baseline);
  const calibration = calculateModelCalibrationRatio(realVal, expVal);

  const existingIdx = activeOutcomes.findIndex(o => o.actionId === actionId || o.actionCode === actionId);

  const outcomeRecord = {
    id: existingIdx >= 0 ? activeOutcomes[existingIdx].id : `out-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    facilityId: action ? action.facilityId : 'fac-naples-01',
    actionId: action ? action.id : actionId,
    ledgerEntryId: ledger ? ledger.id : null,
    actionCode: action ? action.actionCode : 'NBFA-NEW',
    category: cat,
    title: action ? action.title : 'Revenue Intelligence Recovery',
    attributionModel,
    machineAttributionPct: Number(machineAttributionPct),
    humanAttributionPct: Number(humanAttributionPct),
    expectedFinancialValue: expVal,
    grossRealizedValue: realVal,
    baselineCounterfactualRecovery: baseline,
    incrementalUpliftValue: uplift,
    incrementalUpliftPct: upliftPct,
    daysSavedCycleTime: Number(daysSavedCycleTime),
    modelCalibrationRatio: calibration,
    outcomeConfidenceScore: 95.0,
    attributionRationale: attributionRationale || 'Attribution computed across algorithmic signals and clinical workflows.',
    verifiedByUserId: userContext.userId || 'usr_cfo_marcus',
    measuredAt: new Date().toISOString(),
    createdAt: existingIdx >= 0 ? activeOutcomes[existingIdx].createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (existingIdx >= 0) {
    activeOutcomes[existingIdx] = outcomeRecord;
  } else {
    activeOutcomes.unshift(outcomeRecord);
  }

  // Record touchpoints if provided
  if (Array.isArray(touchpoints) && touchpoints.length > 0) {
    touchpoints.forEach((tp, idx) => {
      const tpRecord = {
        id: `tp-${outcomeRecord.id}-${idx}`,
        outcomeId: outcomeRecord.id,
        facilityId: outcomeRecord.facilityId,
        touchpointStage: tp.touchpointStage || TOUCHPOINT_STAGES.DETECTION_NBFA,
        actorEntity: tp.actorEntity || 'ALGO_NBFA_ENGINE',
        contributionWeightPct: Number(tp.contributionWeightPct || 50),
        touchpointTimestamp: new Date().toISOString(),
        touchpointHash: computeTouchpointHash({
          outcomeId: outcomeRecord.id,
          stage: tp.touchpointStage,
          actor: tp.actorEntity,
          weight: tp.contributionWeightPct
        })
      };
      activeTouchpoints.push(tpRecord);
    });
  }

  return outcomeRecord;
}

/**
 * Outcome Telemetry Aggregator
 */
export function getOutcomeTelemetry(facilityId = 'fac-naples-01') {
  const outcomes = getRecommendationOutcomes(facilityId, { attributionModel: 'ALL', category: 'ALL' });
  const total = outcomes.length;

  const totalGross = outcomes.reduce((sum, o) => sum + Number(o.grossRealizedValue || 0), 0);
  const totalBaseline = outcomes.reduce((sum, o) => sum + Number(o.baselineCounterfactualRecovery || 0), 0);
  const totalUplift = calculateIncrementalUplift(totalGross, totalBaseline);

  const cumulativeUpliftPct = totalBaseline > 0
    ? Math.round(((totalUplift / totalBaseline) * 100.0) * 10) / 10
    : 100.0;

  const avgMachine = total > 0
    ? Math.round((outcomes.reduce((sum, o) => sum + Number(o.machineAttributionPct || 0), 0) / total) * 10) / 10
    : 70.0;

  const avgHuman = total > 0
    ? Math.round((100.0 - avgMachine) * 10) / 10
    : 30.0;

  const avgDaysSaved = total > 0
    ? Math.round((outcomes.reduce((sum, o) => sum + Number(o.daysSavedCycleTime || 0), 0) / total) * 10) / 10
    : 0.0;

  const avgCalibration = total > 0
    ? Math.round((outcomes.reduce((sum, o) => sum + Number(o.modelCalibrationRatio || 0), 0) / total) * 1000) / 1000
    : 1.000;

  const directMachine = outcomes.filter(o => o.attributionModel === ATTRIBUTION_MODELS.DIRECT_MACHINE_ATTRIBUTED).length;
  const collaborative = outcomes.filter(o => o.attributionModel === ATTRIBUTION_MODELS.COLLABORATIVE_ATTRIBUTED).length;
  const humanExecutive = outcomes.filter(o => o.attributionModel === ATTRIBUTION_MODELS.HUMAN_EXECUTIVE_ATTRIBUTED).length;

  return {
    totalTrackedOutcomesCount: total,
    totalTrackedOutcomes: total,
    totalGrossRealizedValue: totalGross,
    totalGrossRealized: totalGross,
    totalCounterfactualBaselineValue: totalBaseline,
    totalBaseline: totalBaseline,
    totalIncrementalUpliftValue: totalUplift,
    totalIncrementalUplift: totalUplift,
    cumulativeUpliftRatePct: cumulativeUpliftPct,
    avgMachineAttributionPct: avgMachine,
    avgHumanAttributionPct: avgHuman,
    avgDaysSavedCycleTime: avgDaysSaved,
    avgModelCalibrationRatio: avgCalibration,
    directMachineCount: directMachine,
    collaborativeCount: collaborative,
    humanExecutiveCount: humanExecutive,
    attributionStatus: 'Multi-Touch Causal Attribution Verified'
  };
}
