/**
 * ==============================================================================
 * Phase C6: AI Human Approval & Consequential Action Governance Service
 * Module 12: AI & Intelligence
 * Description: Authoritative Human-in-the-Loop (HITL) dual-key signoffs,
 *              executive quorum voting, separation of duties, cryptographic
 *              state sealing, execution dispatch, and guaranteed 1-click rollback.
 * Maestro Clinical Design System: Emerald, Amber, Crimson, Sky, Slate, Neutral
 * Zero Prohibited Accent Tokens
 * ==============================================================================
 */

let nodeCrypto = null;
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  try {
    nodeCrypto = await import('node:crypto');
  } catch {
    // browser runtime fallback
  }
}

// 1. Governance Tiers & Thresholds
export const GOVERNANCE_TIERS = {
  TIER_1_STANDARD: {
    id: 'TIER_1_STANDARD',
    name: 'Tier 1: Standard Mutation',
    description: 'Low financial impact (< $1,000) or administrative corrections. Requires 1 operational signoff.',
    requiredSignatures: 1,
    ceilingUsd: 1000.00
  },
  TIER_2_DUAL_KEY: {
    id: 'TIER_2_DUAL_KEY',
    name: 'Tier 2: Consequential Dual-Key',
    description: 'Financial exposure $1,000 - $25,000 or OR block transfers. Mandatory 2 distinct executive signoffs.',
    requiredSignatures: 2,
    ceilingUsd: 25000.00
  },
  TIER_3_QUORUM: {
    id: 'TIER_3_QUORUM',
    name: 'Tier 3: Executive Quorum',
    description: 'Structural mutations (> $25,000) or contract changes. Multi-signature quorum (2 of 3 executive officers).',
    requiredSignatures: 2,
    quorumTotal: 3,
    ceilingUsd: Infinity
  }
};

// 2. Consequential Action Categories
export const ACTION_TYPES = {
  OR_BLOCK_REALLOCATION: 'OR_BLOCK_REALLOCATION',
  CONSTRUCT_STANDARDIZATION: 'CONSTRUCT_STANDARDIZATION',
  FINANCIAL_WRITE_OFF: 'FINANCIAL_WRITE_OFF',
  CONTRACT_RATE_AMENDMENT: 'CONTRACT_RATE_AMENDMENT',
  CLAIM_SCRUBBER_OVERRIDE: 'CLAIM_SCRUBBER_OVERRIDE',
  STAFFING_WINDOW_MODIFICATION: 'STAFFING_WINDOW_MODIFICATION'
};

// 3. Approval Request Statuses
export const APPROVAL_STATUSES = {
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  PARTIALLY_APPROVED: 'PARTIALLY_APPROVED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  EXECUTED: 'EXECUTED',
  ROLLED_BACK: 'ROLLED_BACK',
  EXPIRED: 'EXPIRED'
};

// 4. Key Positions & Decisions
export const KEY_POSITIONS = {
  KEY_1: 'KEY_1',
  KEY_2: 'KEY_2',
  QUORUM_VOTE: 'QUORUM_VOTE'
};

export const SIGNATURE_DECISIONS = {
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
};

/**
 * Deterministic cryptographic digital signature hash
 */
export function computeDigitalSignatureHash(approvalId, signerId, decision, keyPosition, signedAt) {
  const raw = `${approvalId}|${signerId}|${decision}|${keyPosition}|${signedAt}`;
  if (nodeCrypto && typeof nodeCrypto.createHash === 'function') {
    return nodeCrypto.createHash('sha256').update(raw).digest('hex');
  }
  let h1 = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    h1 = Math.imul(h1 ^ raw.charCodeAt(i), 0x01000193);
  }
  return `sig_${(h1 >>> 0).toString(16)}`.padEnd(64, '0');
}

// 5. Seed Approval Requests
export const SEED_APPROVAL_REQUESTS = [
  {
    id: 'req-001',
    facilityId: 'fac-naples-01',
    requestCode: 'REQ-HITL-1041',
    actionType: ACTION_TYPES.OR_BLOCK_REALLOCATION,
    governanceTier: 'TIER_2_DUAL_KEY',
    title: 'Reallocate 4 Underutilized Monthly Block Hours to Orthopaedics',
    rationale: 'Dr. Marcus Vance (Orthopaedics) is operating at 88% block utilization with a 3-week booking backlog, while General Surgery Room 3 is operating at 48% utilization with recurring auto-release risk. Reallocation yields +$14,200 monthly net contribution margin lift.',
    requesterId: 'usr_ai_scheduler',
    requesterRole: 'ai_ops_analyst',
    financialExposureUsd: 14200.00,
    affectedCasesCount: 6,
    affectedPhysiciansCount: 2,
    status: APPROVAL_STATUSES.PARTIALLY_APPROVED,
    requiredSignaturesCount: 2,
    currentSignaturesCount: 1,
    proposedPayload: {
      sourceService: 'General Surgery',
      targetService: 'Orthopaedics',
      room: 'OR-02',
      hoursPerMonth: 4.0,
      effectiveDate: '2026-12-01'
    },
    rollbackPayload: {
      sourceService: 'Orthopaedics',
      targetService: 'General Surgery',
      room: 'OR-02',
      hoursPerMonth: 4.0,
      restoreOriginalBlock: true
    },
    signatures: [
      {
        id: 'sig-001',
        signerId: 'usr_clinical_dir_01',
        signerName: 'Dr. Sarah Lin, MD',
        signerRole: 'clinical_director',
        keyPosition: KEY_POSITIONS.KEY_1,
        decision: SIGNATURE_DECISIONS.APPROVED,
        attestationStatement: 'I have reviewed the clinical scheduling impact and confirm that General Surgery case demand is adequately accommodated without adverse patient delays.',
        signatureHash: 'e5b7a12849c09812ea9871239840192837410298374019283740192837401928',
        signedAt: '2026-11-18T08:30:00Z'
      }
    ],
    expiresAt: new Date(Date.now() + 68 * 3600 * 1000).toISOString(),
    createdAt: '2026-11-18T07:15:00Z'
  },
  {
    id: 'req-002',
    facilityId: 'fac-naples-01',
    requestCode: 'REQ-HITL-1042',
    actionType: ACTION_TYPES.CONSTRUCT_STANDARDIZATION,
    governanceTier: 'TIER_2_DUAL_KEY',
    title: 'Standardize Meniscectomy Shaver Blades to Stryker 4.0mm Aggressive',
    rationale: 'Preference card variance analysis reveals 3 distinct shaver SKU brands currently stocked across 4 surgeons. Standardizing to Stryker SKU DISP-102 captures vendor volume tier 2 rebate and saves $3,400 annually.',
    requesterId: 'usr_materials_mgr',
    requesterRole: 'materials_manager',
    financialExposureUsd: 3400.00,
    affectedCasesCount: 42,
    affectedPhysiciansCount: 4,
    status: APPROVAL_STATUSES.PENDING_APPROVAL,
    requiredSignaturesCount: 2,
    currentSignaturesCount: 0,
    proposedPayload: {
      targetSku: 'DISP-102',
      vendor: 'Stryker Orthopaedics',
      unitCost: 340.00,
      replacesSkus: ['SHV-401-A', 'SHV-ARTH-9']
    },
    rollbackPayload: {
      restoreSkus: ['SHV-401-A', 'SHV-ARTH-9'],
      revertPreferenceCards: true
    },
    signatures: [],
    expiresAt: new Date(Date.now() + 71 * 3600 * 1000).toISOString(),
    createdAt: '2026-11-18T09:45:00Z'
  },
  {
    id: 'req-003',
    facilityId: 'fac-naples-01',
    requestCode: 'REQ-HITL-1043',
    actionType: ACTION_TYPES.CLAIM_SCRUBBER_OVERRIDE,
    governanceTier: 'TIER_1_STANDARD',
    title: 'Override Pre-Bill Scrubber Warning on Claim #77210 (CPT 29877 Mod 59)',
    rationale: 'Automated claim scrubber flagged NCCI edit between 29881 and 29877. Operative report confirms chondroplasty was performed in separate patellofemoral compartment, clinically justifying modifier 59.',
    requesterId: 'usr_billing_coder_02',
    requesterRole: 'billing_specialist',
    financialExposureUsd: 1240.50,
    affectedCasesCount: 1,
    affectedPhysiciansCount: 1,
    status: APPROVAL_STATUSES.PENDING_APPROVAL,
    requiredSignaturesCount: 1,
    currentSignaturesCount: 0,
    proposedPayload: {
      claimId: 'claim_837_77210',
      overrideRule: 'NCCI_PTP_ARTHROSCOPY_COMPARTMENT',
      modifier: '59',
      justificationDoc: 'OP_REPORT_PAGE_2_PARA_3'
    },
    rollbackPayload: {
      claimId: 'claim_837_77210',
      removeOverride: true,
      holdClaim: true
    },
    signatures: [],
    expiresAt: new Date(Date.now() + 23 * 3600 * 1000).toISOString(),
    createdAt: '2026-11-18T10:15:00Z'
  },
  {
    id: 'req-004',
    facilityId: 'fac-naples-01',
    requestCode: 'REQ-HITL-1044',
    actionType: ACTION_TYPES.CONTRACT_RATE_AMENDMENT,
    governanceTier: 'TIER_3_QUORUM',
    title: 'Amend Aetna Commercial Contract Carveout Multiplier to Invoice + 15%',
    rationale: 'Negotiated commercial settlement increases high-cost arthroscopy implant reimbursement carveout from invoice+10% to invoice+15%, generating $32,000 projected annual reimbursement lift.',
    requesterId: 'usr_managed_care_dir',
    requesterRole: 'managed_care_director',
    financialExposureUsd: 32000.00,
    affectedCasesCount: 110,
    affectedPhysiciansCount: 8,
    status: APPROVAL_STATUSES.PENDING_APPROVAL,
    requiredSignaturesCount: 2,
    currentSignaturesCount: 0,
    proposedPayload: {
      contractId: 'ctr_aetna_2026_sec4',
      clause: 'implantReimbursement',
      oldRate: 'INVOICE_COST_PLUS_10_PCT',
      newRate: 'INVOICE_COST_PLUS_15_PCT'
    },
    rollbackPayload: {
      contractId: 'ctr_aetna_2026_sec4',
      clause: 'implantReimbursement',
      restoreRate: 'INVOICE_COST_PLUS_10_PCT'
    },
    signatures: [],
    expiresAt: new Date(Date.now() + 65 * 3600 * 1000).toISOString(),
    createdAt: '2026-11-18T11:00:00Z'
  },
  {
    id: 'req-005',
    facilityId: 'fac-naples-01',
    requestCode: 'REQ-HITL-1040',
    actionType: ACTION_TYPES.FINANCIAL_WRITE_OFF,
    governanceTier: 'TIER_1_STANDARD',
    title: 'Aged Bad Debt Small Balance Write-Off (< $1,000)',
    rationale: 'Automated revenue cycle aging audit identified unresolved secondary copay balance aged > 180 days with multiple patient statements exhausted.',
    requesterId: 'usr_rcm_analyst',
    requesterRole: 'analyst',
    financialExposureUsd: 850.00,
    affectedCasesCount: 1,
    affectedPhysiciansCount: 1,
    status: APPROVAL_STATUSES.EXECUTED,
    requiredSignaturesCount: 1,
    currentSignaturesCount: 1,
    proposedPayload: {
      patientAccount: 'ACCT-88910',
      writeOffAmount: 850.00,
      glCode: 'GL-6410-BAD-DEBT'
    },
    rollbackPayload: {
      patientAccount: 'ACCT-88910',
      reinstateBalance: 850.00,
      glCode: 'GL-6410-BAD-DEBT'
    },
    signatures: [
      {
        id: 'sig-000',
        signerId: 'usr_cfo_01',
        signerName: 'Robert Vance, CFO',
        signerRole: 'cfo',
        keyPosition: KEY_POSITIONS.KEY_1,
        decision: SIGNATURE_DECISIONS.APPROVED,
        attestationStatement: 'Approved under small balance write-off policy threshold.',
        signatureHash: '4a6b29d8417937eec5285741bfa76214ec042071852936717a61d1ea00947ba9',
        signedAt: '2026-11-18T06:00:00Z'
      }
    ],
    executionRecord: {
      id: 'exec-001',
      executedBy: 'usr_cfo_01',
      executedAt: '2026-11-18T06:05:00Z',
      reversibleUntil: new Date(Date.now() + 70 * 3600 * 1000).toISOString(),
      executionStatus: 'EXECUTED',
      executionHash: '8b7f14b693892dc479b042ea952875a6c3819e64bf87ad725be8e25a176881c1'
    },
    expiresAt: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
    createdAt: '2026-11-18T05:30:00Z'
  }
];

// In-memory runtime queues
let activeApprovalRequests = [...SEED_APPROVAL_REQUESTS.map(r => ({ ...r, signatures: [...r.signatures] }))];

/**
 * Reset store to initial seed state (primarily for isolated test fixtures)
 */
export function resetApprovalStore() {
  activeApprovalRequests = SEED_APPROVAL_REQUESTS.map(r => ({
    ...r,
    signatures: r.signatures.map(s => ({ ...s })),
    executionRecord: r.executionRecord ? { ...r.executionRecord } : undefined
  }));
  return activeApprovalRequests;
}

/**
 * Create a new approval proposal
 */
export function createApprovalProposal(proposal) {
  const newProposal = {
    id: proposal.id || `req-${Date.now()}`,
    facilityId: proposal.facilityId || 'fac-naples-01',
    requestCode: proposal.requestCode || `REQ-HITL-${Math.floor(1000 + Math.random() * 9000)}`,
    actionType: proposal.actionType || ACTION_TYPES.OR_BLOCK_REALLOCATION,
    governanceTier: proposal.governanceTier || proposal.tier || 'TIER_2_DUAL_KEY',
    title: proposal.title || 'Untitled Proposal',
    rationale: proposal.rationale || 'Operational optimization proposal.',
    requesterId: proposal.requesterId || 'usr_system',
    requesterRole: proposal.requesterRole || 'clinical_admin',
    financialExposureUsd: proposal.financialExposureUsd ?? proposal.blastRadius?.financialExposure ?? 0,
    affectedCasesCount: proposal.affectedCasesCount ?? proposal.blastRadius?.casesAffected ?? 0,
    affectedPhysiciansCount: proposal.affectedPhysiciansCount ?? proposal.blastRadius?.physiciansImpacted ?? 0,
    status: proposal.status || APPROVAL_STATUSES.PENDING_APPROVAL,
    requiredSignaturesCount: proposal.requiredSignaturesCount || 2,
    currentSignaturesCount: proposal.signatures?.length || 0,
    proposedPayload: proposal.proposedPayload || proposal.payload || {},
    rollbackPayload: proposal.rollbackPayload || {},
    signatures: proposal.signatures || [],
    expiresAt: proposal.expiresAt || new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
    createdAt: proposal.createdAt || new Date().toISOString()
  };
  activeApprovalRequests.push(newProposal);
  return newProposal;
}

/**
 * Get filtered approval queue
 */
export function getApprovalQueue(facilityId = 'fac-naples-01', filters = {}) {
  const {
    tier = 'ALL',
    status = 'ALL',
    searchQuery = ''
  } = filters;

  return activeApprovalRequests.filter(req => {
    if (req.facilityId !== facilityId) return false;
    if (tier !== 'ALL' && req.governanceTier !== tier) return false;
    if (status !== 'ALL' && req.status !== status) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchCode = req.requestCode.toLowerCase().includes(q);
      const matchTitle = req.title.toLowerCase().includes(q);
      const matchRationale = req.rationale.toLowerCase().includes(q);
      const matchType = req.actionType.toLowerCase().includes(q);
      if (!matchCode && !matchTitle && !matchRationale && !matchType) return false;
    }

    return true;
  });
}

/**
 * Get detailed request record
 */
export function getApprovalDetail(approvalId) {
  const req = activeApprovalRequests.find(r => r.id === approvalId);
  if (!req) {
    throw new Error(`Approval request not found: ${approvalId}`);
  }
  return { ...req };
}

/**
 * Submit digital signature for Dual-Key or Quorum signoff
 */
export function submitDigitalSignature(approvalId, signerContext = {}) {
  const {
    signerId,
    signerName = 'Authorized Executive',
    signerRole = 'facility_admin',
    decision = SIGNATURE_DECISIONS.APPROVED,
    attestationStatement = 'I have reviewed and affirmatively sign off on this consequential operational action.'
  } = signerContext;

  if (!signerId) {
    throw new Error('Signer ID is mandatory for cryptographic signature.');
  }

  const req = activeApprovalRequests.find(r => r.id === approvalId);
  if (!req) {
    throw new Error(`Approval request not found: ${approvalId}`);
  }

  // Enforce Separation of Duties: Proposer cannot approve their own proposal in Tier 2/3
  if (req.governanceTier !== 'TIER_1_STANDARD' && req.requesterId === signerId) {
    throw new Error('SEPARATION_OF_DUTIES_VIOLATION: Proposer cannot approve their own consequential action proposal.');
  }

  // Check for duplicate signature by same user
  const alreadySigned = req.signatures.some(s => s.signerId === signerId);
  if (alreadySigned) {
    throw new Error('DUPLICATE_SIGNATURE_VIOLATION: Signer has already submitted a key signature on this proposal.');
  }

  // Determine Key Position
  let keyPosition = KEY_POSITIONS.KEY_1;
  if (req.signatures.length === 1) {
    keyPosition = KEY_POSITIONS.KEY_2;
  } else if (req.signatures.length >= 2) {
    keyPosition = KEY_POSITIONS.QUORUM_VOTE;
  }

  const signedAt = new Date().toISOString();
  const sigHash = computeDigitalSignatureHash(approvalId, signerId, decision, keyPosition, signedAt);

  const newSignature = {
    id: `sig-${Date.now()}`,
    signerId,
    signerName,
    signerRole,
    keyPosition,
    decision,
    attestationStatement,
    signatureHash: sigHash,
    signedAt
  };

  req.signatures.push(newSignature);

  // If rejected, immediate transition to REJECTED
  if (decision === SIGNATURE_DECISIONS.REJECTED) {
    req.status = APPROVAL_STATUSES.REJECTED;
    return {
      success: true,
      status: APPROVAL_STATUSES.REJECTED,
      signature: newSignature,
      message: `Proposal ${req.requestCode} has been REJECTED by ${signerName}.`
    };
  }

  // Increment approved signature count
  req.currentSignaturesCount = req.signatures.filter(s => s.decision === SIGNATURE_DECISIONS.APPROVED).length;

  // Check if quorum or dual-key requirements are met
  if (req.currentSignaturesCount >= req.requiredSignaturesCount) {
    req.status = APPROVAL_STATUSES.APPROVED;
    return {
      success: true,
      status: APPROVAL_STATUSES.APPROVED,
      signature: newSignature,
      message: `Dual-key requirement fulfilled (${req.currentSignaturesCount}/${req.requiredSignaturesCount}). Proposal ${req.requestCode} is APPROVED for execution dispatch.`
    };
  } else {
    req.status = APPROVAL_STATUSES.PARTIALLY_APPROVED;
    return {
      success: true,
      status: APPROVAL_STATUSES.PARTIALLY_APPROVED,
      signature: newSignature,
      message: `Key 1 signature recorded. Proposal ${req.requestCode} is PARTIALLY APPROVED; awaiting Key 2 executive signoff.`
    };
  }
}

/**
 * Execute approved consequential action
 */
export function executeApprovedAction(approvalId, executorContext = {}) {
  const { executorId = 'usr_facility_admin_01' } = executorContext;
  const req = activeApprovalRequests.find(r => r.id === approvalId);
  if (!req) {
    throw new Error(`Approval request not found: ${approvalId}`);
  }

  if (req.status !== APPROVAL_STATUSES.APPROVED) {
    throw new Error(`EXECUTION_DISPATCH_BLOCKED: Proposal must be in APPROVED state before execution. Current status: ${req.status}`);
  }

  const executedAt = new Date().toISOString();
  const reversibleUntil = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
  const execHash = computeDigitalSignatureHash(approvalId, executorId, 'EXECUTE', 'DISPATCH', executedAt);

  req.status = APPROVAL_STATUSES.EXECUTED;
  req.executionRecord = {
    id: `exec-${Date.now()}`,
    executedBy: executorId,
    executedAt,
    reversibleUntil,
    executionStatus: 'EXECUTED',
    executionHash: execHash
  };

  return {
    success: true,
    status: APPROVAL_STATUSES.EXECUTED,
    executionRecord: req.executionRecord,
    message: `Consequential action ${req.requestCode} executed successfully. Reversible until ${new Date(reversibleUntil).toLocaleString()}.`
  };
}

/**
 * 1-Click Rollback for executed actions
 */
export function rollbackConsequentialAction(approvalId, rollbackContext = {}) {
  const {
    rolledBackBy = 'usr_medical_dir_01',
    reason = 'Administrative reversion requested by Medical Director.'
  } = rollbackContext;

  const req = activeApprovalRequests.find(r => r.id === approvalId);
  if (!req || !req.executionRecord) {
    throw new Error(`Executed record not found for approval: ${approvalId}`);
  }

  if (req.executionRecord.executionStatus === 'ROLLED_BACK') {
    throw new Error('ACTION_ALREADY_ROLLED_BACK: Mutation has already been inverted.');
  }

  // Check 72-hour grace window
  if (new Date(req.executionRecord.reversibleUntil) < new Date()) {
    throw new Error('ROLLBACK_WINDOW_EXPIRED: Consequential action grace period (72 hours) has elapsed.');
  }

  req.status = APPROVAL_STATUSES.ROLLED_BACK;
  req.executionRecord.executionStatus = 'ROLLED_BACK';
  req.executionRecord.rolledBackBy = rolledBackBy;
  req.executionRecord.rolledBackAt = new Date().toISOString();
  req.executionRecord.rollbackReason = reason;

  return {
    success: true,
    status: APPROVAL_STATUSES.ROLLED_BACK,
    rollbackPayloadApplied: req.rollbackPayload,
    message: `Rollback successful! Consequential mutation ${req.requestCode} inverted to pre-execution baseline state.`
  };
}

/**
 * Top Ribbon Telemetry
 */
export function getHumanApprovalTelemetry(facilityId = 'fac-naples-01') {
  const facilityReqs = activeApprovalRequests.filter(r => r.facilityId === facilityId);
  const pending = facilityReqs.filter(r => r.status === APPROVAL_STATUSES.PENDING_APPROVAL || r.status === APPROVAL_STATUSES.PARTIALLY_APPROVED).length;
  const approved = facilityReqs.filter(r => r.status === APPROVAL_STATUSES.APPROVED || r.status === APPROVAL_STATUSES.EXECUTED).length;
  const rejected = facilityReqs.filter(r => r.status === APPROVAL_STATUSES.REJECTED).length;
  const executed = facilityReqs.filter(r => r.status === APPROVAL_STATUSES.EXECUTED).length;

  return {
    pendingSignoffs: pending,
    approvedExecutions: approved,
    rejectedProposals: rejected,
    executedCount: executed,
    avgSignoffHours: 2.8,
    rollbackReadinessPct: 100.0
  };
}
