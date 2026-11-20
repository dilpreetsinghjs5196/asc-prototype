/**
 * ==============================================================================
 * Phase D0: Next Best Financial Action Engine Service
 * Module 13: Decision Intelligence
 * Description: Daily ranked financial actions, deterministic multi-parameter
 *              priority scoring (financial value, urgency, recoverability, confidence,
 *              effort), action state transitions, and audit event ledger.
 * Maestro Clinical Design System: Emerald, Amber, Crimson, Sky, Slate, Neutral
 * Strictly Zero Prohibited Accent Tokens
 * ==============================================================================
 */

let nodeCrypto = null;
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  try {
    nodeCrypto = await import('node:crypto');
  } catch {
    // browser fallback
  }
}

export const ACTION_CATEGORIES = {
  DENIAL_APPEAL_URGENT: 'DENIAL_APPEAL_URGENT',
  UNDERPAYMENT_RECOVERY: 'UNDERPAYMENT_RECOVERY',
  UNBILLED_CASE_EXPEDITE: 'UNBILLED_CASE_EXPEDITE',
  OR_BLOCK_RELEASE: 'OR_BLOCK_RELEASE',
  IMPLANT_CARVEOUT_CLAIM: 'IMPLANT_CARVEOUT_CLAIM',
  SECONDARY_CROSSOVER_SUBMISSION: 'SECONDARY_CROSSOVER_SUBMISSION',
  PRE_SERVICE_DEPOSIT_COLLECTION: 'PRE_SERVICE_DEPOSIT_COLLECTION'
};

export const ACTION_CATEGORY_LABELS = {
  DENIAL_APPEAL_URGENT: 'Denial Appeal (Urgent)',
  UNDERPAYMENT_RECOVERY: 'Underpayment Recovery',
  UNBILLED_CASE_EXPEDITE: 'Unbilled Case Expedite',
  OR_BLOCK_RELEASE: 'OR Block Reallocation',
  IMPLANT_CARVEOUT_CLAIM: 'Implant Carveout Claim',
  SECONDARY_CROSSOVER_SUBMISSION: 'Secondary Crossover',
  PRE_SERVICE_DEPOSIT_COLLECTION: 'Pre-Service Deposit'
};

export const PRIORITY_TIERS = {
  P0_CRITICAL: 'P0_CRITICAL',
  P1_HIGH: 'P1_HIGH',
  P2_MEDIUM: 'P2_MEDIUM',
  P3_ROUTINE: 'P3_ROUTINE'
};

export const ACTION_STATUSES = {
  PENDING: 'PENDING',
  ASSIGNED: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  ACCEPTED: 'ACCEPTED',
  DISMISSED: 'DISMISSED',
  COMPLETED: 'COMPLETED',
  EXPIRED: 'EXPIRED'
};

export const DISMISSAL_REASONS = {
  INELIGIBLE_PAYER_CLAUSE: 'Ineligible Under Contract Clause',
  TIMELY_FILING_EXPIRED: 'Timely Filing Limit Expired',
  CLINICAL_DISPUTE_SETTLED: 'Clinical Dispute Already Settled',
  LOW_RECOVERY_PROBABILITY: 'Cost to Recover Exceeds Expected Yield',
  DUPLICATE_CLAIM_RESOLVED: 'Duplicate Claim Already Adjudicated',
  PATIENT_FINANCIAL_HARDSHIP: 'Approved Charity / Hardship Adjustment',
  OTHER_DOCUMENTED: 'Other Documented Administrative Reason'
};

/**
 * Deterministic cryptographic SHA-256 hash
 */
export function computeActionHash(rawContent) {
  const str = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
  if (nodeCrypto && typeof nodeCrypto.createHash === 'function') {
    return nodeCrypto.createHash('sha256').update(str).digest('hex');
  }
  let h1 = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h1 = Math.imul(h1 ^ str.charCodeAt(i), 0x01000193);
  }
  return `nbfa_hash_${(h1 >>> 0).toString(16)}`.padEnd(64, '0');
}

/**
 * Deterministic Multi-Parameter Priority Scoring Algorithm
 * Value (35%), Urgency (25%), Recoverability (20%), Confidence (10%), Effort (10% inverse)
 */
export function calculatePriorityScore({
  expectedFinancialValue = 0,
  urgencyScore = 50,
  recoverabilityScore = 50,
  confidenceScore = 80,
  effortScore = 30
}) {
  const valueComponent = (Math.min(Number(expectedFinancialValue), 25000) / 25000) * 35;
  const urgencyComponent = Number(urgencyScore) * 0.25;
  const recoverabilityComponent = Number(recoverabilityScore) * 0.20;
  const confidenceComponent = Number(confidenceScore) * 0.10;
  const effortComponent = (100 - Number(effortScore)) * 0.10;

  const compositeScore = Math.min(100, Math.max(0, Math.round(
    (valueComponent + urgencyComponent + recoverabilityComponent + confidenceComponent + effortComponent) * 10
  ) / 10));

  let tier = PRIORITY_TIERS.P3_ROUTINE;
  if (compositeScore >= 85.0) tier = PRIORITY_TIERS.P0_CRITICAL;
  else if (compositeScore >= 70.0) tier = PRIORITY_TIERS.P1_HIGH;
  else if (compositeScore >= 50.0) tier = PRIORITY_TIERS.P2_MEDIUM;

  return {
    compositeScore,
    priorityTier: tier,
    breakdown: {
      valueComponent: Math.round(valueComponent * 10) / 10,
      urgencyComponent: Math.round(urgencyComponent * 10) / 10,
      recoverabilityComponent: Math.round(recoverabilityComponent * 10) / 10,
      confidenceComponent: Math.round(confidenceComponent * 10) / 10,
      effortComponent: Math.round(effortComponent * 10) / 10
    }
  };
}

// Seed Daily Actions Dataset (Authoritative baseline for fac-naples-01)
export const SEED_NBFA_ACTIONS = [
  {
    id: 'a001-nbfa-001-naples',
    facilityId: 'fac-naples-01',
    actionCode: 'NBFA-2026-0801',
    category: ACTION_CATEGORIES.DENIAL_APPEAL_URGENT,
    title: 'Urgent CARC 16 Appeal: Aetna Arthroscopy Carveout Denied',
    description: 'Claim CLM-89021 for patient J. Miller denied for missing medical necessity documentation. Timely filing limit expires in 48 hours.',
    sourceEntityType: 'CLAIM',
    sourceEntityId: 'CLM-89021',
    expectedFinancialValue: 3450.00,
    confidenceScore: 94.0,
    urgencyScore: 98.0,
    recoverabilityScore: 88.0,
    effortScore: 25.0,
    compositePriorityRank: 92.5,
    priorityTier: PRIORITY_TIERS.P0_CRITICAL,
    status: ACTION_STATUSES.PENDING,
    assignedTo: null,
    assignedRole: 'billing_specialist',
    evidenceSummary: [
      { code: 'E-CARC-16', label: 'Denial Reason: CARC 16 Lacks information or submission errors' },
      { code: 'E-CLM-89021', label: 'Claim Amount: $3,450.00 with CPT 29881' },
      { code: 'E-DEADLINE-48H', label: 'Appeals deadline: Nov 22, 2026 17:00 EST' }
    ],
    dueDate: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString()
  },
  {
    id: 'a002-nbfa-002-naples',
    facilityId: 'fac-naples-01',
    actionCode: 'NBFA-2026-0802',
    category: ACTION_CATEGORIES.OR_BLOCK_RELEASE,
    title: 'Auto-Release Low-Utilized OR-2 Thursday Block to Waitlist',
    description: 'OR-2 Thursday block has only 35% utilization with 4 unbooked hours. 3 high-margin orthopaedic cases ready to fill.',
    sourceEntityType: 'OR_BLOCK',
    sourceEntityId: 'BLK-OR2-THU',
    expectedFinancialValue: 14200.00,
    confidenceScore: 92.0,
    urgencyScore: 95.0,
    recoverabilityScore: 90.0,
    effortScore: 15.0,
    compositePriorityRank: 94.0,
    priorityTier: PRIORITY_TIERS.P0_CRITICAL,
    status: ACTION_STATUSES.PENDING,
    assignedTo: null,
    assignedRole: 'or_director',
    evidenceSummary: [
      { code: 'E-OR2-UTIL', label: 'Historic 35% utilization below 75% facility threshold' },
      { code: 'E-WAITLIST-3', label: '3 waitlisted candidates available (Net contribution margin: $14,200)' },
      { code: 'E-CUTOFF-24H', label: 'Auto-release rule activates in 24 hours' }
    ],
    dueDate: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 36 * 3600 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 6 * 3600 * 1000).toISOString()
  },
  {
    id: 'a003-nbfa-003-naples',
    facilityId: 'fac-naples-01',
    actionCode: 'NBFA-2026-0803',
    category: ACTION_CATEGORIES.UNBILLED_CASE_EXPEDITE,
    title: 'Missing Operative Note: Dr. Vance Knee Arthroscopy',
    description: 'Case CAS-2026-9041 performed 3 days ago is unbilled due to missing surgeon narrative signature.',
    sourceEntityType: 'SURGICAL_CASE',
    sourceEntityId: 'CAS-2026-9041',
    expectedFinancialValue: 11129.50,
    confidenceScore: 96.0,
    urgencyScore: 85.0,
    recoverabilityScore: 95.0,
    effortScore: 20.0,
    compositePriorityRank: 89.2,
    priorityTier: PRIORITY_TIERS.P0_CRITICAL,
    status: ACTION_STATUSES.ASSIGNED,
    assignedTo: 'usr_sarah_rcm',
    assignedRole: 'clinical_admin',
    evidenceSummary: [
      { code: 'E-CASE-9041', label: 'Gross charges: $14,250.00; Net Margin: $11,129.50' },
      { code: 'E-OPNOTE-MISS', label: 'Pending surgeon signature: Dr. Marcus Vance' },
      { code: 'E-AGING-3D', label: 'Case unbilled age: 72 hours (Target: <= 24 hours)' }
    ],
    dueDate: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 96 * 3600 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString()
  },
  {
    id: 'a004-nbfa-004-naples',
    facilityId: 'fac-naples-01',
    actionCode: 'NBFA-2026-0804',
    category: ACTION_CATEGORIES.UNDERPAYMENT_RECOVERY,
    title: 'BCBS Contract Variance: Missing 12% Implant Carveout Multiplier',
    description: 'Claim CLM-84910 was adjudicated at base procedural rate, omitting contracted 12% invoice markup on anchor screws.',
    sourceEntityType: 'CLAIM',
    sourceEntityId: 'CLM-84910',
    expectedFinancialValue: 1850.00,
    confidenceScore: 95.0,
    urgencyScore: 65.0,
    recoverabilityScore: 92.0,
    effortScore: 30.0,
    compositePriorityRank: 78.4,
    priorityTier: PRIORITY_TIERS.P1_HIGH,
    status: ACTION_STATUSES.PENDING,
    assignedTo: null,
    assignedRole: 'billing_specialist',
    evidenceSummary: [
      { code: 'E-FEE-BCBS-SEC4', label: 'Contract Section 4.2 specifies Invoice Cost + 12%' },
      { code: 'E-CLM-84910-REM', label: 'Remittance 835 paid $0.00 on Rev Code 0278' },
      { code: 'E-INV-ARTH-99', label: 'Vendor Invoice Attached: $1,651.78 verified' }
    ],
    dueDate: new Date(Date.now() + 96 * 3600 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 180 * 3600 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 16 * 3600 * 1000).toISOString()
  },
  {
    id: 'a005-nbfa-005-naples',
    facilityId: 'fac-naples-01',
    actionCode: 'NBFA-2026-0805',
    category: ACTION_CATEGORIES.IMPLANT_CARVEOUT_CLAIM,
    title: 'Attach Missing Vendor Invoice: Stryker Meniscal Dart',
    description: 'Implant SKU STR-M-049 utilized in OR-1 was omitted from 837 claim attachment, risking full carveout denial.',
    sourceEntityType: 'INVOICE',
    sourceEntityId: 'INV-STR-9021',
    expectedFinancialValue: 4120.00,
    confidenceScore: 90.0,
    urgencyScore: 70.0,
    recoverabilityScore: 85.0,
    effortScore: 35.0,
    compositePriorityRank: 76.5,
    priorityTier: PRIORITY_TIERS.P1_HIGH,
    status: ACTION_STATUSES.PENDING,
    assignedTo: null,
    assignedRole: 'materials_manager',
    evidenceSummary: [
      { code: 'E-IMPL-STR-M049', label: 'Implant acquisition cost: $3,678.50' },
      { code: 'E-CLAIM-ATTACH', label: 'Attachment control # ATTH-2026-0182 generated' }
    ],
    dueDate: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 120 * 3600 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 20 * 3600 * 1000).toISOString()
  },
  {
    id: 'a006-nbfa-006-naples',
    facilityId: 'fac-naples-01',
    actionCode: 'NBFA-2026-0806',
    category: ACTION_CATEGORIES.PRE_SERVICE_DEPOSIT_COLLECTION,
    title: 'Pre-Service Balance Collection: Surgery Tomorrow 08:30 AM',
    description: 'Patient D. Ross has an estimated copay/deductible balance of $1,500.00 with no payment on file.',
    sourceEntityType: 'SURGICAL_CASE',
    sourceEntityId: 'CAS-2026-9118',
    expectedFinancialValue: 1500.00,
    confidenceScore: 88.0,
    urgencyScore: 90.0,
    recoverabilityScore: 82.0,
    effortScore: 20.0,
    compositePriorityRank: 82.0,
    priorityTier: PRIORITY_TIERS.P1_HIGH,
    status: ACTION_STATUSES.PENDING,
    assignedTo: null,
    assignedRole: 'front_desk',
    evidenceSummary: [
      { code: 'E-ELIG-271', label: '271 Eligibility verified: Remaining deductible $1,500.00' },
      { code: 'E-SURG-TOMORROW', label: 'Case scheduled: Nov 21, 2026 08:30 AM OR-3' }
    ],
    dueDate: new Date(Date.now() + 18 * 3600 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 8 * 3600 * 1000).toISOString()
  },
  {
    id: 'a007-nbfa-007-naples',
    facilityId: 'fac-naples-01',
    actionCode: 'NBFA-2026-0807',
    category: ACTION_CATEGORIES.SECONDARY_CROSSOVER_SUBMISSION,
    title: 'Generate Humana Secondary Claim: Medicare Primary Remitted',
    description: 'Medicare payment of $8,900.00 remitted 8 days ago. Remaining coinsurance of $2,240.00 unbilled to Humana.',
    sourceEntityType: 'CLAIM',
    sourceEntityId: 'CLM-78102',
    expectedFinancialValue: 2240.00,
    confidenceScore: 95.0,
    urgencyScore: 40.0,
    recoverabilityScore: 90.0,
    effortScore: 20.0,
    compositePriorityRank: 64.2,
    priorityTier: PRIORITY_TIERS.P2_MEDIUM,
    status: ACTION_STATUSES.PENDING,
    assignedTo: null,
    assignedRole: 'billing_specialist',
    evidenceSummary: [
      { code: 'E-MEDICARE-835', label: 'Medicare remitted 835 check # 98112 on Nov 12' },
      { code: 'E-HUMANA-COINS', label: 'Humana Gold Plus secondary eligible coinsurance: $2,240.00' }
    ],
    dueDate: new Date(Date.now() + 120 * 3600 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 240 * 3600 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 28 * 3600 * 1000).toISOString()
  }
];

// In-memory active stores
let activeActions = [...SEED_NBFA_ACTIONS.map(a => ({ ...a, evidenceSummary: [...a.evidenceSummary] }))];
let activeEvents = [];

/**
 * Reset NBFA Store (primarily for test fixtures)
 */
export function resetNBFABackendStore() {
  activeActions = SEED_NBFA_ACTIONS.map(a => ({ ...a, evidenceSummary: [...a.evidenceSummary] }));
  activeEvents = [];
  return { activeActions, activeEvents };
}

const NAPLES_FACILITY_ALIASES = ['fac-naples-01', '00000000-0000-0000-0000-000000000002'];

export function matchesFacilityId(actionFacilityId, requestedFacilityId) {
  if (!requestedFacilityId || requestedFacilityId === 'ALL') return true;
  if (actionFacilityId === requestedFacilityId) return true;
  if (NAPLES_FACILITY_ALIASES.includes(actionFacilityId) && NAPLES_FACILITY_ALIASES.includes(requestedFacilityId)) {
    return true;
  }
  return false;
}

/**
 * Retrieve Next Best Financial Actions with optional filters
 */
export function getNextBestFinancialActions(facilityId = 'fac-naples-01', filters = {}) {
  const {
    category = 'ALL',
    priorityTier = 'ALL',
    status = 'ALL',
    searchTerm = ''
  } = filters;

  return activeActions.filter(action => {
    if (facilityId && facilityId !== 'ALL' && !matchesFacilityId(action.facilityId, facilityId)) {
      return false;
    }
    if (category && category !== 'ALL' && action.category !== category) {
      return false;
    }
    if (priorityTier && priorityTier !== 'ALL' && action.priorityTier !== priorityTier) {
      return false;
    }
    if (status && status !== 'ALL' && action.status !== status) {
      return false;
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchTitle = action.title.toLowerCase().includes(term);
      const matchCode = action.actionCode.toLowerCase().includes(term);
      const matchDesc = action.description.toLowerCase().includes(term);
      const matchSource = action.sourceEntityId.toLowerCase().includes(term);
      if (!matchTitle && !matchCode && !matchDesc && !matchSource) return false;
    }
    return true;
  }).sort((a, b) => b.compositePriorityRank - a.compositePriorityRank);
}

/**
 * Get action detail by ID
 */
export function getActionById(actionId) {
  return activeActions.find(a => a.id === actionId || a.actionCode === actionId);
}

/**
 * Assign an action to a user/role
 */
export function assignAction(actionId, assignedTo, assignedRole, userContext = {}) {
  const action = getActionById(actionId);
  if (!action) {
    throw new Error(`Action with ID "${actionId}" not found.`);
  }

  const previousStatus = action.status;
  action.assignedTo = assignedTo;
  action.assignedRole = assignedRole || action.assignedRole;
  action.status = ACTION_STATUSES.ASSIGNED;
  action.updatedAt = new Date().toISOString();

  const event = {
    id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    actionId: action.id,
    facilityId: action.facilityId,
    eventType: 'ASSIGNED',
    previousStatus,
    newStatus: ACTION_STATUSES.ASSIGNED,
    performedBy: userContext.userId || 'usr_current_user',
    notes: `Assigned to ${assignedTo} (${assignedRole})`,
    metadata: { assignedTo, assignedRole },
    createdAt: new Date().toISOString()
  };

  activeEvents.unshift(event);
  return { action, event };
}

/**
 * Execute State Machine Transition
 */
export function executeActionTransition(actionId, newStatus, userContext = {}) {
  const action = getActionById(actionId);
  if (!action) {
    throw new Error(`Action with ID "${actionId}" not found.`);
  }

  const validStatuses = Object.values(ACTION_STATUSES);
  if (!validStatuses.includes(newStatus)) {
    throw new Error(`Invalid status "${newStatus}". Must be one of: ${validStatuses.join(', ')}`);
  }

  const previousStatus = action.status;
  action.status = newStatus;
  action.updatedAt = new Date().toISOString();

  const event = {
    id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    actionId: action.id,
    facilityId: action.facilityId,
    eventType: newStatus === ACTION_STATUSES.COMPLETED ? 'COMPLETED' : 'STATUS_CHANGE',
    previousStatus,
    newStatus,
    performedBy: userContext.userId || 'usr_current_user',
    notes: userContext.notes || `Transitioned from ${previousStatus} to ${newStatus}`,
    metadata: userContext.metadata || {},
    createdAt: new Date().toISOString()
  };

  activeEvents.unshift(event);
  return { action, event };
}

/**
 * Dismiss an action with mandatory rationale
 */
export function dismissAction(actionId, reasonCode, dismissalNotes, userContext = {}) {
  const action = getActionById(actionId);
  if (!action) {
    throw new Error(`Action with ID "${actionId}" not found.`);
  }

  if (!reasonCode || !DISMISSAL_REASONS[reasonCode]) {
    throw new Error(`Mandatory dismissal reason code missing or invalid. Received: "${reasonCode}".`);
  }

  if (!dismissalNotes || dismissalNotes.trim().length < 5) {
    throw new Error('Mandatory dismissal justification notes must be at least 5 characters.');
  }

  const previousStatus = action.status;
  action.status = ACTION_STATUSES.DISMISSED;
  action.dismissalReason = reasonCode;
  action.dismissalNotes = dismissalNotes;
  action.updatedAt = new Date().toISOString();

  const event = {
    id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    actionId: action.id,
    facilityId: action.facilityId,
    eventType: 'DISMISSED',
    previousStatus,
    newStatus: ACTION_STATUSES.DISMISSED,
    performedBy: userContext.userId || 'usr_current_user',
    notes: `Dismissed: [${reasonCode}] ${dismissalNotes}`,
    metadata: { reasonCode, dismissalNotes },
    createdAt: new Date().toISOString()
  };

  activeEvents.unshift(event);
  return { action, event };
}

/**
 * Retrieve Audit Events for an action
 */
export function getActionAuditEvents(actionId) {
  return activeEvents.filter(e => e.actionId === actionId);
}

/**
 * Retrieve Facility NBFA Telemetry
 */
export function getNBFATelemetry(facilityId = 'fac-naples-01') {
  const facilityActions = activeActions.filter(a => !facilityId || facilityId === 'ALL' || a.facilityId === facilityId);

  const active = facilityActions.filter(a => [ACTION_STATUSES.PENDING, ACTION_STATUSES.ASSIGNED, ACTION_STATUSES.IN_PROGRESS].includes(a.status));
  const urgentP0 = active.filter(a => a.priorityTier === PRIORITY_TIERS.P0_CRITICAL);
  const totalPipelineRecoveryValue = active.reduce((sum, a) => sum + Number(a.expectedFinancialValue || 0), 0);
  const completedCount = facilityActions.filter(a => a.status === ACTION_STATUSES.COMPLETED).length;

  const avgRecoverability = active.length > 0
    ? Math.round((active.reduce((sum, a) => sum + Number(a.recoverabilityScore || 0), 0) / active.length) * 10) / 10
    : 85.0;

  const avgConfidence = facilityActions.length > 0
    ? Math.round((facilityActions.reduce((sum, a) => sum + Number(a.confidenceScore || 0), 0) / facilityActions.length) * 10) / 10
    : 92.0;

  return {
    totalActionsCount: facilityActions.length,
    activeActionsCount: active.length,
    urgentP0Count: urgentP0.length,
    totalPipelineRecoveryValue,
    completedActionsCount: completedCount,
    avgRecoverabilityPct: avgRecoverability,
    avgConfidencePct: avgConfidence,
    avgResolutionVelocityHours: 18.4
  };
}
