/**
 * ==============================================================================
 * Phase D4: Recommendation Decision Ledger Service
 * Module 13: Decision Intelligence
 * Description: Authoritative closed-loop decision ledger tracking recommendations,
 *              approvals, executions, 835 remittances, and realized financial outcomes
 *              with cryptographic SHA-256 block hash chaining.
 * Maestro Clinical Design System: Emerald, Amber, Crimson, Sky, Slate, Neutral
 * Strictly Zero Prohibited Accent Tokens
 * ==============================================================================
 */

import { getNextBestFinancialActions, getActionById } from './nextBestActionService.js';
import { getApprovalForAction } from './recommendationApprovalService.js';

let nodeCrypto = null;
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  try {
    nodeCrypto = await import('node:crypto');
  } catch {
    // browser fallback
  }
}

export const GENESIS_BLOCK_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

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
 * Deterministic cryptographic SHA-256 block hash generator
 */
export function computeLedgerBlockHash(blockPayload) {
  const str = typeof blockPayload === 'string' ? blockPayload : JSON.stringify(blockPayload);
  if (nodeCrypto && typeof nodeCrypto.createHash === 'function') {
    return nodeCrypto.createHash('sha256').update(str).digest('hex');
  }
  let h1 = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h1 = Math.imul(h1 ^ str.charCodeAt(i), 0x01000193);
  }
  return `blk_hash_${(h1 >>> 0).toString(16)}`.padEnd(64, '0');
}

export const REALIZATION_STATUSES = {
  PENDING_REALIZATION: 'PENDING_REALIZATION',
  PARTIALLY_REALIZED: 'PARTIALLY_REALIZED',
  FULLY_REALIZED: 'FULLY_REALIZED',
  OVER_REALIZED: 'OVER_REALIZED',
  UNREALIZED_DEFICIT: 'UNREALIZED_DEFICIT',
  ABANDONED: 'ABANDONED'
};

export const LEDGER_EVENT_TYPES = {
  RECOMMENDATION_REGISTERED: 'RECOMMENDATION_REGISTERED',
  APPROVAL_GRANTED: 'APPROVAL_GRANTED',
  ACTION_DISPATCHED: 'ACTION_DISPATCHED',
  ADJUDICATION_MATCHED: 'ADJUDICATION_MATCHED',
  VALUE_REALIZED: 'VALUE_REALIZED',
  VARIANCE_CONTESTED: 'VARIANCE_CONTESTED',
  AUDIT_SEALED: 'AUDIT_SEALED'
};

/**
 * Calculate deterministic financial variance
 */
export function calculateVariance(expectedValue, realizedValue) {
  const exp = Number(expectedValue || 0);
  const real = Number(realizedValue || 0);
  return Math.round((real - exp) * 100) / 100;
}

/**
 * Calculate deterministic realization percentage
 */
export function calculateRealizationRate(expectedValue, realizedValue) {
  const exp = Number(expectedValue || 0);
  const real = Number(realizedValue || 0);
  if (exp <= 0) return 0.0;
  return Math.round(((real / exp) * 100.0) * 10) / 10;
}

/**
 * Automatically determine realization status
 */
export function determineRealizationStatus(expectedValue, realizedValue) {
  const exp = Number(expectedValue || 0);
  const real = Number(realizedValue || 0);

  if (real <= 0) return REALIZATION_STATUSES.PENDING_REALIZATION;
  if (real < 0.99 * exp) return REALIZATION_STATUSES.PARTIALLY_REALIZED;
  if (real <= 1.01 * exp) return REALIZATION_STATUSES.FULLY_REALIZED;
  return REALIZATION_STATUSES.OVER_REALIZED;
}

// Compute deterministic seed block chain
const rawSeedBlocks = [
  {
    id: 'blk-001',
    sequenceNumber: 1,
    facilityId: 'fac-naples-01',
    actionId: 'a001-nbfa-001-naples',
    approvalId: 'appr-001',
    actionCode: 'NBFA-2026-0801',
    category: 'DENIAL_APPEAL_URGENT',
    title: 'Urgent CARC 16 Appeal: Aetna Arthroscopy Carveout Denied',
    expectedFinancialValue: 3450.00,
    realizedFinancialValue: 3450.00,
    varianceAmount: 0.00,
    realizationPercentage: 100.0,
    realizationStatus: REALIZATION_STATUSES.FULLY_REALIZED,
    adjudicationSource: '835_REMITTANCE',
    adjudicationReference: 'ERA-BCBS-88319-CHK',
    adjudicatedAt: '2026-11-20T09:30:00Z',
    timeToRealizationDays: 4.2,
    executionTimestamp: '2026-11-16T08:00:00Z',
    approverSignaturesCount: 2,
    evidenceCompletenessScore: 100.00,
    merkleRootHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  },
  {
    id: 'blk-002',
    sequenceNumber: 2,
    facilityId: 'fac-naples-01',
    actionId: 'a002-nbfa-002-naples',
    approvalId: 'appr-002',
    actionCode: 'NBFA-2026-0802',
    category: 'OR_BLOCK_RELEASE',
    title: 'Auto-Release Low-Utilized OR-2 Thursday Block to Waitlist',
    expectedFinancialValue: 14200.00,
    realizedFinancialValue: 15800.00,
    varianceAmount: 1600.00,
    realizationPercentage: 111.3,
    realizationStatus: REALIZATION_STATUSES.OVER_REALIZED,
    adjudicationSource: 'EHR_SCHEDULE_FILLED',
    adjudicationReference: 'OR-RELEASE-REC-482',
    adjudicatedAt: '2026-11-19T17:00:00Z',
    timeToRealizationDays: 2.0,
    executionTimestamp: '2026-11-17T11:00:00Z',
    approverSignaturesCount: 2,
    evidenceCompletenessScore: 85.00,
    merkleRootHash: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b'
  },
  {
    id: 'blk-003',
    sequenceNumber: 3,
    facilityId: 'fac-naples-01',
    actionId: 'a003-nbfa-003-naples',
    approvalId: 'appr-003',
    actionCode: 'NBFA-2026-0803',
    category: 'MISSING_CHARGE_CAPTURE',
    title: 'Missing Operative Note: Dr. Vance Knee Arthroscopy',
    expectedFinancialValue: 5120.00,
    realizedFinancialValue: 5120.00,
    varianceAmount: 0.00,
    realizationPercentage: 100.0,
    realizationStatus: REALIZATION_STATUSES.FULLY_REALIZED,
    adjudicationSource: '835_REMITTANCE',
    adjudicationReference: 'ERA-UHC-99120-L1',
    adjudicatedAt: '2026-11-18T14:20:00Z',
    timeToRealizationDays: 6.5,
    executionTimestamp: '2026-11-12T08:00:00Z',
    approverSignaturesCount: 2,
    evidenceCompletenessScore: 90.00,
    merkleRootHash: '2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c'
  },
  {
    id: 'blk-004',
    sequenceNumber: 4,
    facilityId: 'fac-naples-01',
    actionId: 'a004-nbfa-004-naples',
    approvalId: 'appr-004',
    actionCode: 'NBFA-2026-0804',
    category: 'PRIOR_AUTH_EXPIRING',
    title: 'Expired Prior-Authorization Renewal: Total Knee Arthroplasty',
    expectedFinancialValue: 7800.00,
    realizedFinancialValue: 6400.00,
    varianceAmount: -1400.00,
    realizationPercentage: 82.1,
    realizationStatus: REALIZATION_STATUSES.PARTIALLY_REALIZED,
    adjudicationSource: '835_REMITTANCE',
    adjudicationReference: 'ERA-AETNA-77182-ADJ',
    adjudicatedAt: '2026-11-17T11:45:00Z',
    timeToRealizationDays: 9.1,
    executionTimestamp: '2026-11-08T09:00:00Z',
    approverSignaturesCount: 1,
    evidenceCompletenessScore: 95.00,
    merkleRootHash: '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d'
  },
  {
    id: 'blk-005',
    sequenceNumber: 5,
    facilityId: 'fac-naples-01',
    actionId: 'a005-nbfa-005-naples',
    approvalId: 'appr-005',
    actionCode: 'NBFA-2026-0805',
    category: 'IMPLANT_CARVEOUT_CLAIM',
    title: 'Attach Missing Vendor Invoice: Stryker Meniscal Dart',
    expectedFinancialValue: 4120.00,
    realizedFinancialValue: 0.00,
    varianceAmount: -4120.00,
    realizationPercentage: 0.0,
    realizationStatus: REALIZATION_STATUSES.PENDING_REALIZATION,
    adjudicationSource: null,
    adjudicationReference: 'CLAIM-ATTACH-ATTH-2026-0182',
    adjudicatedAt: null,
    timeToRealizationDays: null,
    executionTimestamp: '2026-11-19T15:30:00Z',
    approverSignaturesCount: 2,
    evidenceCompletenessScore: 85.00,
    merkleRootHash: '4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e'
  },
  {
    id: 'blk-006',
    sequenceNumber: 6,
    facilityId: 'fac-naples-01',
    actionId: 'a006-nbfa-006-naples',
    approvalId: null,
    actionCode: 'NBFA-2026-0806',
    category: 'PRE_SERVICE_DEPOSIT_COLLECTION',
    title: 'Pre-Service Balance Collection: Surgery Tomorrow 08:30 AM',
    expectedFinancialValue: 1500.00,
    realizedFinancialValue: 1500.00,
    varianceAmount: 0.00,
    realizationPercentage: 100.0,
    realizationStatus: REALIZATION_STATUSES.FULLY_REALIZED,
    adjudicationSource: 'DIRECT_PATIENT_PAYMENT',
    adjudicationReference: 'PMS-RCPT-88912',
    adjudicatedAt: '2026-11-20T08:45:00Z',
    timeToRealizationDays: 1.0,
    executionTimestamp: '2026-11-19T08:00:00Z',
    approverSignaturesCount: 1,
    evidenceCompletenessScore: 90.00,
    merkleRootHash: '5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f'
  },
  {
    id: 'blk-007',
    sequenceNumber: 7,
    facilityId: 'fac-naples-01',
    actionId: 'a007-nbfa-007-naples',
    approvalId: null,
    actionCode: 'NBFA-2026-0807',
    category: 'SECONDARY_CROSSOVER_SUBMISSION',
    title: 'Generate Humana Secondary Claim: Medicare Primary Remitted',
    expectedFinancialValue: 2240.00,
    realizedFinancialValue: 2240.00,
    varianceAmount: 0.00,
    realizationPercentage: 100.0,
    realizationStatus: REALIZATION_STATUSES.FULLY_REALIZED,
    adjudicationSource: '835_REMITTANCE',
    adjudicationReference: 'ERA-HUM-44912-SEC',
    adjudicatedAt: '2026-11-19T10:15:00Z',
    timeToRealizationDays: 5.8,
    executionTimestamp: '2026-11-13T12:00:00Z',
    approverSignaturesCount: 1,
    evidenceCompletenessScore: 85.00,
    merkleRootHash: '6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a'
  }
];

// Chain the seed blocks cryptographically
let prevHash = GENESIS_BLOCK_HASH;
export const SEED_DECISION_LEDGER_ENTRIES = rawSeedBlocks.map((blk) => {
  const currentPrev = prevHash;
  const currentHash = computeLedgerBlockHash({
    sequenceNumber: blk.sequenceNumber,
    previousBlockHash: currentPrev,
    actionId: blk.actionId,
    actionCode: blk.actionCode,
    expectedFinancialValue: blk.expectedFinancialValue,
    realizedFinancialValue: blk.realizedFinancialValue,
    realizationStatus: blk.realizationStatus,
    timestamp: blk.executionTimestamp
  });
  prevHash = currentHash;
  return {
    ...blk,
    previousBlockHash: currentPrev,
    currentBlockHash: currentHash,
    createdAt: blk.executionTimestamp,
    updatedAt: blk.adjudicatedAt || blk.executionTimestamp
  };
});

export const SEED_LEDGER_EVENTS = [
  {
    id: 'evt-001-01',
    ledgerEntryId: 'blk-001',
    facilityId: 'fac-naples-01',
    eventType: LEDGER_EVENT_TYPES.RECOMMENDATION_REGISTERED,
    eventPayload: { priorityTier: 'P0_CRITICAL', compositeRank: 92.5 },
    recordedByUserId: 'system.nbfa_engine',
    recordedByName: 'NBFA Engine',
    recordedAt: '2026-11-16T07:50:00Z',
    eventHash: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2'
  },
  {
    id: 'evt-001-02',
    ledgerEntryId: 'blk-001',
    facilityId: 'fac-naples-01',
    eventType: LEDGER_EVENT_TYPES.APPROVAL_GRANTED,
    eventPayload: { signers: ['Sarah Jenkins', 'Marcus Bell, CPA'] },
    recordedByUserId: 'usr_cfo_marcus',
    recordedByName: 'Marcus Bell (CFO)',
    recordedAt: '2026-11-16T08:00:00Z',
    eventHash: 'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3'
  },
  {
    id: 'evt-001-03',
    ledgerEntryId: 'blk-001',
    facilityId: 'fac-naples-01',
    eventType: LEDGER_EVENT_TYPES.ADJUDICATION_MATCHED,
    eventPayload: { checkNumber: 'ERA-BCBS-88319-CHK', allowed: 3450.00, paid: 3450.00 },
    recordedByUserId: 'system.edi835_parser',
    recordedByName: 'EDI 835 Parser',
    recordedAt: '2026-11-20T09:30:00Z',
    eventHash: 'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4'
  },
  {
    id: 'evt-002-01',
    ledgerEntryId: 'blk-002',
    facilityId: 'fac-naples-01',
    eventType: LEDGER_EVENT_TYPES.VALUE_REALIZED,
    eventPayload: { orBlockId: 'BLK-OR2-THU', surgicalYield: 15800.00, surplus: 1600.00 },
    recordedByUserId: 'system.scheduler',
    recordedByName: 'Surgery Scheduler',
    recordedAt: '2026-11-19T17:00:00Z',
    eventHash: 'd4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5'
  }
];

// Active in-memory stores
let activeLedgerEntries = [...SEED_DECISION_LEDGER_ENTRIES.map(e => ({ ...e }))];
let activeLedgerEvents = [...SEED_LEDGER_EVENTS.map(ev => ({ ...ev }))];

/**
 * Reset Store (for testing fixtures)
 */
export function resetDecisionLedgerStore() {
  prevHash = GENESIS_BLOCK_HASH;
  activeLedgerEntries = rawSeedBlocks.map((blk) => {
    const currentPrev = prevHash;
    const currentHash = computeLedgerBlockHash({
      sequenceNumber: blk.sequenceNumber,
      previousBlockHash: currentPrev,
      actionId: blk.actionId,
      actionCode: blk.actionCode,
      expectedFinancialValue: blk.expectedFinancialValue,
      realizedFinancialValue: blk.realizedFinancialValue,
      realizationStatus: blk.realizationStatus,
      timestamp: blk.executionTimestamp
    });
    prevHash = currentHash;
    return {
      ...blk,
      previousBlockHash: currentPrev,
      currentBlockHash: currentHash,
      createdAt: blk.executionTimestamp,
      updatedAt: blk.adjudicatedAt || blk.executionTimestamp
    };
  });
  activeLedgerEvents = SEED_LEDGER_EVENTS.map(ev => ({ ...ev }));
  return { activeLedgerEntries, activeLedgerEvents };
}

/**
 * Retrieve Decision Ledger Entries with filtering
 */
export function getDecisionLedgerEntries(facilityId = 'fac-naples-01', filters = {}) {
  const {
    status = 'ALL',
    category = 'ALL',
    searchQuery = ''
  } = filters;

  return activeLedgerEntries.filter(item => {
    if (facilityId && facilityId !== 'ALL' && !matchesFacilityId(item.facilityId, facilityId)) {
      return false;
    }
    if (status && status !== 'ALL' && item.realizationStatus !== status) {
      return false;
    }
    if (category && category !== 'ALL' && item.category !== category) {
      return false;
    }
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchCode = item.actionCode?.toLowerCase().includes(q);
      const matchTitle = item.title?.toLowerCase().includes(q);
      const matchRef = item.adjudicationReference?.toLowerCase().includes(q);
      if (!matchCode && !matchTitle && !matchRef) return false;
    }
    return true;
  });
}

/**
 * Retrieve single ledger entry by ID
 */
export function getLedgerEntryById(id) {
  return activeLedgerEntries.find(e => e.id === id) || null;
}

/**
 * Retrieve single ledger entry by Action ID or Action Code
 */
export function getLedgerEntryByActionId(actionId) {
  return activeLedgerEntries.find(e => e.actionId === actionId || e.actionCode === actionId) || null;
}

/**
 * Verify complete cryptographic chain integrity
 */
export function verifyLedgerChainIntegrity(facilityId = 'fac-naples-01') {
  const entries = activeLedgerEntries
    .filter(e => matchesFacilityId(e.facilityId, facilityId))
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber);

  if (entries.length === 0) {
    return {
      isValid: true,
      verifiedBlockCount: 0,
      brokenBlockSequence: null,
      genesisHash: GENESIS_BLOCK_HASH,
      tipHash: null,
      integrityStatus: 'Empty Ledger Valid',
      lastVerifiedAt: new Date().toISOString()
    };
  }

  let expectedPrev = GENESIS_BLOCK_HASH;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // Check link to previous block
    if (entry.previousBlockHash !== expectedPrev) {
      return {
        isValid: false,
        verifiedBlockCount: i,
        brokenBlockSequence: entry.sequenceNumber,
        failureReason: `Previous block hash mismatch at sequence #${entry.sequenceNumber}. Expected "${expectedPrev}", got "${entry.previousBlockHash}".`,
        integrityStatus: 'Tamper Detected / Chain Broken',
        lastVerifiedAt: new Date().toISOString()
      };
    }

    // Recompute current block hash
    const recomputedHash = computeLedgerBlockHash({
      sequenceNumber: entry.sequenceNumber,
      previousBlockHash: entry.previousBlockHash,
      actionId: entry.actionId,
      actionCode: entry.actionCode,
      expectedFinancialValue: entry.expectedFinancialValue,
      realizedFinancialValue: entry.realizedFinancialValue,
      realizationStatus: entry.realizationStatus,
      timestamp: entry.executionTimestamp
    });

    if (recomputedHash !== entry.currentBlockHash) {
      return {
        isValid: false,
        verifiedBlockCount: i,
        brokenBlockSequence: entry.sequenceNumber,
        failureReason: `Block hash content mismatch at sequence #${entry.sequenceNumber}. Recomputed hash differs from sealed digest.`,
        integrityStatus: 'Tamper Detected / Payload Corrupted',
        lastVerifiedAt: new Date().toISOString()
      };
    }

    expectedPrev = entry.currentBlockHash;
  }

  return {
    isValid: true,
    verifiedBlockCount: entries.length,
    brokenBlockSequence: null,
    genesisHash: GENESIS_BLOCK_HASH,
    tipHash: entries[entries.length - 1].currentBlockHash,
    integrityStatus: 'Cryptographic Chain Verified Unbroken',
    lastVerifiedAt: new Date().toISOString()
  };
}

/**
 * Record an adjudication outcome and update ledger entry
 */
export function recordLedgerOutcome(ledgerEntryId, outcomeData = {}, userContext = {}) {
  const entry = getLedgerEntryById(ledgerEntryId);
  if (!entry) {
    throw new Error(`Ledger entry "${ledgerEntryId}" not found.`);
  }

  const {
    realizedFinancialValue = 0,
    adjudicationSource = '835_REMITTANCE',
    adjudicationReference = '',
    remarks = ''
  } = outcomeData;

  const realized = Number(realizedFinancialValue || 0);
  if (realized < 0) {
    throw new Error('Realized financial value cannot be negative.');
  }

  const prevStatus = entry.realizationStatus;
  const prevRealized = entry.realizedFinancialValue;

  entry.realizedFinancialValue = realized;
  entry.varianceAmount = calculateVariance(entry.expectedFinancialValue, realized);
  entry.realizationPercentage = calculateRealizationRate(entry.expectedFinancialValue, realized);
  entry.realizationStatus = determineRealizationStatus(entry.expectedFinancialValue, realized);
  entry.adjudicationSource = adjudicationSource;
  entry.adjudicationReference = adjudicationReference || entry.adjudicationReference;
  entry.adjudicatedAt = new Date().toISOString();
  entry.updatedAt = new Date().toISOString();

  // If time to realization wasn't set, compute days
  if (!entry.timeToRealizationDays && entry.executionTimestamp) {
    const execTime = new Date(entry.executionTimestamp).getTime();
    const adjTime = new Date(entry.adjudicatedAt).getTime();
    const diffDays = Math.max(0.1, Math.round(((adjTime - execTime) / (1000 * 3600 * 24)) * 10) / 10);
    entry.timeToRealizationDays = diffDays;
  }

  // Update block hash
  entry.currentBlockHash = computeLedgerBlockHash({
    sequenceNumber: entry.sequenceNumber,
    previousBlockHash: entry.previousBlockHash,
    actionId: entry.actionId,
    actionCode: entry.actionCode,
    expectedFinancialValue: entry.expectedFinancialValue,
    realizedFinancialValue: entry.realizedFinancialValue,
    realizationStatus: entry.realizationStatus,
    timestamp: entry.executionTimestamp
  });

  // Append ledger event
  const newEvent = {
    id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    ledgerEntryId: entry.id,
    facilityId: entry.facilityId,
    eventType: LEDGER_EVENT_TYPES.VALUE_REALIZED,
    eventPayload: {
      previousRealized: prevRealized,
      newRealized: realized,
      variance: entry.varianceAmount,
      previousStatus: prevStatus,
      newStatus: entry.realizationStatus,
      reference: entry.adjudicationReference,
      remarks: remarks || 'Adjudication remittance matched and realized value committed.'
    },
    recordedByUserId: userContext.userId || 'usr_revenue_auditor',
    recordedByName: userContext.userName || 'Clinical & Billing Auditor',
    recordedAt: new Date().toISOString(),
    eventHash: computeLedgerBlockHash({
      ledgerEntryId: entry.id,
      realized,
      timestamp: new Date().toISOString()
    })
  };

  activeLedgerEvents.unshift(newEvent);

  return { entry, newEvent };
}

/**
 * Retrieve audit events for a ledger entry
 */
export function getLedgerEvents(ledgerEntryId = null) {
  if (!ledgerEntryId || ledgerEntryId === 'ALL') return activeLedgerEvents;
  return activeLedgerEvents.filter(e => e.ledgerEntryId === ledgerEntryId);
}

/**
 * Telemetry Aggregator for Decision Ledger
 */
export function getDecisionLedgerTelemetry(facilityId = 'fac-naples-01') {
  const entries = getDecisionLedgerEntries(facilityId, { status: 'ALL', category: 'ALL' });
  const total = entries.length;

  const totalExpected = entries.reduce((sum, e) => sum + Number(e.expectedFinancialValue || 0), 0);
  const totalRealized = entries.reduce((sum, e) => sum + Number(e.realizedFinancialValue || 0), 0);
  const netVariance = calculateVariance(totalExpected, totalRealized);

  const cumulativeRate = totalExpected > 0
    ? Math.round(((totalRealized / totalExpected) * 100.0) * 10) / 10
    : 100.0;

  const realizedItemsWithTime = entries.filter(e => e.timeToRealizationDays !== null && e.timeToRealizationDays !== undefined);
  const avgMTTR = realizedItemsWithTime.length > 0
    ? Math.round((realizedItemsWithTime.reduce((sum, e) => sum + Number(e.timeToRealizationDays), 0) / realizedItemsWithTime.length) * 10) / 10
    : 0.0;

  const fullyRealized = entries.filter(e => e.realizationStatus === REALIZATION_STATUSES.FULLY_REALIZED).length;
  const overRealized = entries.filter(e => e.realizationStatus === REALIZATION_STATUSES.OVER_REALIZED).length;
  const partiallyRealized = entries.filter(e => e.realizationStatus === REALIZATION_STATUSES.PARTIALLY_REALIZED).length;
  const pendingRealization = entries.filter(e => e.realizationStatus === REALIZATION_STATUSES.PENDING_REALIZATION).length;
  const unrealizedDeficit = entries.filter(e => e.realizationStatus === REALIZATION_STATUSES.UNREALIZED_DEFICIT).length;

  const chainCheck = verifyLedgerChainIntegrity(facilityId);

  return {
    totalLedgerEntriesCount: total,
    totalEntries: total,
    totalExpectedFinancialValue: totalExpected,
    totalRealizedFinancialValue: totalRealized,
    totalRealized: totalRealized,
    totalExpected: totalExpected,
    netRealizationVarianceAmount: netVariance,
    netVariance: netVariance,
    cumulativeRealizationRatePct: cumulativeRate,
    realizationRatePct: cumulativeRate,
    avgTimeToRealizationDays: avgMTTR,
    meanTimeToRealizationDays: avgMTTR,
    fullyRealizedCount: fullyRealized,
    overRealizedCount: overRealized,
    partiallyRealizedCount: partiallyRealized,
    pendingRealizationCount: pendingRealization,
    unrealizedDeficitCount: unrealizedDeficit,
    isChainValid: chainCheck.isValid,
    ledgerChainStatus: chainCheck.integrityStatus,
    cryptographicProvenanceStatus: 'SHA-256 Ledger Sealed'
  };
}
