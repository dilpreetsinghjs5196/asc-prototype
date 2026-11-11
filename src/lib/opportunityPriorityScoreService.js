/**
 * ==============================================================================
 * REVENUE OPPORTUNITY PRIORITY SCORE (ROPS) SERVICE (PHASE 98)
 * ==============================================================================
 * Unified cross-module ranking engine combining financial value, data
 * confidence, contractual recoverability, and statutory deadline urgency.
 * ==============================================================================
 */

// ==============================================================================
// 1. TAXONOMY & ENUMERATIONS
// ==============================================================================

export const SOURCE_MODULES = {
  IMPLANT_CARVEOUT: {
    code: 'IMPLANT_CARVEOUT',
    label: 'Implant Carve-Out (P97)',
    badgeColor: '#0284c7',
    description: 'Unbilled, zero-paid, or short-paid surgical implants and high-cost medical devices'
  },
  DENIAL_APPEAL: {
    code: 'DENIAL_APPEAL',
    label: 'Denial Appeal (P94)',
    badgeColor: '#dc2626',
    description: 'High-value clinical and administrative claim denials requiring appeal'
  },
  SECONDARY_COB: {
    code: 'SECONDARY_COB',
    label: 'Secondary COB (P95)',
    badgeColor: '#0d9488',
    description: 'Unbilled or failed crossover Medigap and commercial secondary claims'
  },
  PAYER_UNDERPAYMENT: {
    code: 'PAYER_UNDERPAYMENT',
    label: 'Payer Underpayment (P93/A)',
    badgeColor: '#ea580c',
    description: 'Validated commercial and Medicare contract fee schedule short-pays'
  },
  RECURRING_PATTERN: {
    code: 'RECURRING_PATTERN',
    label: 'Recurring Pattern (P93C)',
    badgeColor: '#059669',
    description: 'Multi-claim systemic underpayment batches grouped by payer rule'
  },
  UNBILLED_CASE: {
    code: 'UNBILLED_CASE',
    label: 'Unbilled Case (P91)',
    badgeColor: '#d97706',
    description: 'Complete surgical encounters logged in OR but unbilled on 837 claim'
  },
  MISSING_CHARGE: {
    code: 'MISSING_CHARGE',
    label: 'Missing Charge (P92)',
    badgeColor: '#64748b',
    description: 'Omitted intraoperative surgical CPT codes or billable supplies'
  }
};

export const PRIORITY_ACTION_TIERS = {
  TIER_1_CRITICAL_DISPATCH: {
    code: 'TIER_1_CRITICAL_DISPATCH',
    label: 'Tier 1: Critical Priority Dispatch',
    badgeColor: '#dc2626',
    rank: 1,
    minScore: 80.00,
    action: 'Immediate dispatch to senior billing specialist; high yield with urgent deadline.'
  },
  TIER_2_HIGH_YIELD_RECOVERY: {
    code: 'TIER_2_HIGH_YIELD_RECOVERY',
    label: 'Tier 2: High-Yield Recovery',
    badgeColor: '#ea580c',
    rank: 2,
    minScore: 65.00,
    action: 'Generate electronic dispute packet or corrected claim submission.'
  },
  TIER_3_STANDARD_WORKBENCH: {
    code: 'TIER_3_STANDARD_WORKBENCH',
    label: 'Tier 3: Standard Workbench',
    badgeColor: '#0284c7',
    rank: 3,
    minScore: 45.00,
    action: 'Scheduled for standard RCM cycle follow-up within 14 business days.'
  },
  TIER_4_LOW_YIELD_BATCH: {
    code: 'TIER_4_LOW_YIELD_BATCH',
    label: 'Tier 4: Low-Yield Batch Review',
    badgeColor: '#64748b',
    rank: 4,
    minScore: 25.00,
    action: 'Batch review or secondary audit for low variance amounts.'
  },
  TIER_5_EXPIRED_OR_SUPPRESSED: {
    code: 'TIER_5_EXPIRED_OR_SUPPRESSED',
    label: 'Tier 5: Expired / Suppressed',
    badgeColor: '#94a3b8',
    rank: 5,
    minScore: 0.00,
    action: 'Statutory deadline expired or uncollectible; closed to contractual adjustment.'
  }
};

export const DEFAULT_ROPS_WEIGHTS = {
  VALUE: 0.35,
  CONFIDENCE: 0.25,
  RECOVERABILITY: 0.25,
  URGENCY: 0.15
};

export const DEFAULT_FACILITY_BENCHMARK = 5000.00;

export const ITEM_STATUSES = {
  SCORED: { code: 'SCORED', label: 'Scored & Ranked', color: '#64748b' },
  DISPATCHED_TO_QUEUE: { code: 'DISPATCHED_TO_QUEUE', label: 'Dispatched to Specialist', color: '#0284c7' },
  IN_RECOVERY_WORKFLOW: { code: 'IN_RECOVERY_WORKFLOW', label: 'Active Dispute Filed', color: '#0d9488' },
  RECOVERED: { code: 'RECOVERED', label: 'Recovered & Reconciled', color: '#059669' },
  DISMISSED_NOT_RECOVERABLE: { code: 'DISMISSED_NOT_RECOVERABLE', label: 'Dismissed / Ineligible', color: '#94a3b8' },
  EXPIRED_UNCOLLECTIBLE: { code: 'EXPIRED_UNCOLLECTIBLE', label: 'Timely Filing Expired', color: '#991b1b' }
};

// ==============================================================================
// 2. AUTHORITATIVE DETERMINISTIC ALGORITHMS
// ==============================================================================

/**
 * Normalizes recoverable dollar amount against facility benchmark ($5,000.00).
 */
export function calculateValueSubscore(recoverableAmount, benchmarkAmount = DEFAULT_FACILITY_BENCHMARK) {
  const amt = Math.max(0, Number(recoverableAmount) || 0);
  const bench = Number(benchmarkAmount) > 0 ? Number(benchmarkAmount) : DEFAULT_FACILITY_BENCHMARK;
  if (amt <= 0) return 0.00;
  const score = Math.min(100.00, (amt / bench) * 100.00);
  return Number(score.toFixed(2));
}

/**
 * Calculates statutory filing urgency score:
 * - 1 - 15 days: 100.00 (Critical urgency)
 * - 16 - 30 days: 85.00 (High urgency)
 * - 31 - 60 days: 65.00 (Moderate urgency)
 * - 61 - 90 days: 40.00 (Standard cycle)
 * - > 90 days: 20.00 (Low urgency)
 * - < 0 days (Expired): 0.00
 */
export function calculateUrgencySubscore(daysRemaining) {
  const days = Number(daysRemaining);
  if (isNaN(days) || days < 0) return 0.00;
  if (days <= 15) return 100.00;
  if (days <= 30) return 85.00;
  if (days <= 60) return 65.00;
  if (days <= 90) return 40.00;
  return 20.00;
}

/**
 * Authoritative Expected Realizable Yield ($):
 * ExpectedYield = recoverable_amount * (confidence / 100) * (recoverability / 100)
 */
export function calculateExpectedYield(recoverableAmount, confidenceScore, recoverabilityScore) {
  const amt = Math.max(0, Number(recoverableAmount) || 0);
  const conf = Math.max(0, Math.min(100, Number(confidenceScore) || 0)) / 100.0;
  const rec = Math.max(0, Math.min(100, Number(recoverabilityScore) || 0)) / 100.0;
  const yieldAmt = amt * conf * rec;
  return Number(yieldAmt.toFixed(2));
}

/**
 * Calculates Yield Per Hour ($/hr) recovery velocity:
 * YieldPerHour = ExpectedYield / max(0.25, estimated_effort_hours)
 */
export function calculateYieldPerHour(expectedYield, estimatedEffortHours = 1.00) {
  const y = Math.max(0, Number(expectedYield) || 0);
  const hours = Math.max(0.25, Number(estimatedEffortHours) || 1.00);
  const rate = y / hours;
  return Number(rate.toFixed(2));
}

/**
 * Computes composite Revenue Opportunity Priority Score (0.00 - 100.00).
 */
export function calculateRopsPriorityScore(
  valueScore,
  confidenceScore,
  recoverabilityScore,
  urgencyScore,
  weights = DEFAULT_ROPS_WEIGHTS
) {
  const v = Math.max(0, Math.min(100, Number(valueScore) || 0));
  const c = Math.max(0, Math.min(100, Number(confidenceScore) || 0));
  const r = Math.max(0, Math.min(100, Number(recoverabilityScore) || 0));
  const u = Math.max(0, Math.min(100, Number(urgencyScore) || 0));

  const wV = Number(weights.VALUE) >= 0 ? Number(weights.VALUE) : DEFAULT_ROPS_WEIGHTS.VALUE;
  const wC = Number(weights.CONFIDENCE) >= 0 ? Number(weights.CONFIDENCE) : DEFAULT_ROPS_WEIGHTS.CONFIDENCE;
  const wR = Number(weights.RECOVERABILITY) >= 0 ? Number(weights.RECOVERABILITY) : DEFAULT_ROPS_WEIGHTS.RECOVERABILITY;
  const wU = Number(weights.URGENCY) >= 0 ? Number(weights.URGENCY) : DEFAULT_ROPS_WEIGHTS.URGENCY;

  const composite = (v * wV) + (c * wC) + (r * wR) + (u * wU);
  return Number(composite.toFixed(2));
}

/**
 * Classifies composite score and statutory deadline into actionable action tiers.
 */
export function classifyPriorityActionTier(ropsScore, daysRemaining) {
  const days = Number(daysRemaining);
  const score = Number(ropsScore) || 0;

  // Rule 3 Invariant: Expired filing window is forced to Tier 5
  if (!isNaN(days) && days < 0) {
    return PRIORITY_ACTION_TIERS.TIER_5_EXPIRED_OR_SUPPRESSED.code;
  }

  if (score >= PRIORITY_ACTION_TIERS.TIER_1_CRITICAL_DISPATCH.minScore) {
    return PRIORITY_ACTION_TIERS.TIER_1_CRITICAL_DISPATCH.code;
  }
  if (score >= PRIORITY_ACTION_TIERS.TIER_2_HIGH_YIELD_RECOVERY.minScore) {
    return PRIORITY_ACTION_TIERS.TIER_2_HIGH_YIELD_RECOVERY.code;
  }
  if (score >= PRIORITY_ACTION_TIERS.TIER_3_STANDARD_WORKBENCH.minScore) {
    return PRIORITY_ACTION_TIERS.TIER_3_STANDARD_WORKBENCH.code;
  }
  if (score >= PRIORITY_ACTION_TIERS.TIER_4_LOW_YIELD_BATCH.minScore) {
    return PRIORITY_ACTION_TIERS.TIER_4_LOW_YIELD_BATCH.code;
  }
  return PRIORITY_ACTION_TIERS.TIER_5_EXPIRED_OR_SUPPRESSED.code;
}

/**
 * Scores an opportunity record authoritatively across all dimensions.
 */
export function scoreOpportunityRecord(
  record,
  benchmark = DEFAULT_FACILITY_BENCHMARK,
  weights = DEFAULT_ROPS_WEIGHTS
) {
  const recoverableAmt = Math.max(0, Number(record.recoverable_amount) || 0);
  const confScore = Math.max(0, Math.min(100, Number(record.confidence_score) || 0));
  const recScore = Math.max(0, Math.min(100, Number(record.recoverability_score) || 0));
  const daysRemaining = Number(record.days_until_deadline);
  const effortHours = Math.max(0.25, Number(record.estimated_effort_hours) || 1.00);

  const valueScore = calculateValueSubscore(recoverableAmt, benchmark);
  const urgencyScore = calculateUrgencySubscore(daysRemaining);
  const expectedYield = calculateExpectedYield(recoverableAmt, confScore, recScore);
  const yieldPerHour = calculateYieldPerHour(expectedYield, effortHours);

  let ropsScore = calculateRopsPriorityScore(valueScore, confScore, recScore, urgencyScore, weights);
  let actionTier = classifyPriorityActionTier(ropsScore, daysRemaining);
  let status = record.item_status || 'SCORED';

  // Rule 3 Invariant: Expired deadline forces EXPIRED_UNCOLLECTIBLE
  if (daysRemaining < 0) {
    status = 'EXPIRED_UNCOLLECTIBLE';
    actionTier = PRIORITY_ACTION_TIERS.TIER_5_EXPIRED_OR_SUPPRESSED.code;
  } else if (status === 'RECOVERED' || status === 'DISMISSED_NOT_RECOVERABLE') {
    actionTier = PRIORITY_ACTION_TIERS.TIER_5_EXPIRED_OR_SUPPRESSED.code;
  }

  return {
    ...record,
    recoverable_amount: recoverableAmt,
    confidence_score: confScore,
    recoverability_score: recScore,
    value_score: valueScore,
    urgency_score: urgencyScore,
    expected_realizable_yield: expectedYield,
    estimated_effort_hours: effortHours,
    yield_per_hour: yieldPerHour,
    rops_priority_score: ropsScore,
    priority_action_tier: actionTier,
    item_status: status,
    updated_at: new Date().toISOString()
  };
}

// ==============================================================================
// 3. BASELINE REALISTIC CROSS-MODULE DATASET
// ==============================================================================

const INITIAL_ROPS_OPPORTUNITIES = [
  {
    id: 'rops-001',
    facility_id: 'fac-surgical-01',
    source_module: 'IMPLANT_CARVEOUT',
    source_record_id: 'cd-001',
    claim_id: 'clm-8801',
    claim_number: 'CLM-2026-08801',
    patient_id: 'pat-101',
    patient_name: 'Arthur Pendelton',
    patient_mrn: 'MRN-10192',
    payer_id: 'pyr-bcbs',
    payer_name: 'Blue Cross Blue Shield',
    cpt_code: '27447',
    procedure_name: 'Total Knee Arthroplasty (TKR)',
    date_of_service: '2026-10-12',
    recoverable_amount: 6496.00, // Zimmer Persona Carveout
    confidence_score: 95.00,     // Invoice on file, contract explicit
    recoverability_score: 90.00, // Payer clear carveout violation
    estimated_effort_hours: 1.50,
    filing_deadline: '2026-12-15',
    days_until_deadline: 18,
    item_status: 'SCORED',
    assigned_analyst_name: 'Sarah Jenkins, CPC',
    notes: 'Phase 97 Carve-out: Zimmer Knee construct paid at $0 as bundled. Invoice attached.'
  },
  {
    id: 'rops-002',
    facility_id: 'fac-surgical-01',
    source_module: 'DENIAL_APPEAL',
    source_record_id: 'den-002',
    claim_id: 'clm-8802',
    claim_number: 'CLM-2026-08802',
    patient_id: 'pat-102',
    patient_name: 'Eleanor Vance',
    patient_mrn: 'MRN-10244',
    payer_id: 'pyr-uhc',
    payer_name: 'UnitedHealthcare Commercial',
    cpt_code: '22612',
    procedure_name: 'Lumbar Arthrodesis with Interbody Fusion',
    date_of_service: '2026-09-24',
    recoverable_amount: 8200.00, // Clinical Denial CARC 50
    confidence_score: 85.00,
    recoverability_score: 80.00, // Solid operative note & conservative therapy documentation
    estimated_effort_hours: 2.50,
    filing_deadline: '2026-11-25',
    days_until_deadline: 14,     // CRITICAL: 14 days left!
    item_status: 'SCORED',
    assigned_analyst_name: 'Dr. Michael Vance, MD',
    notes: 'Phase 94 Denial: Denied for medical necessity. Operative report & MRI records attached.'
  },
  {
    id: 'rops-003',
    facility_id: 'fac-surgical-01',
    source_module: 'SECONDARY_COB',
    source_record_id: 'sec-003',
    claim_id: 'clm-8803',
    claim_number: 'CLM-2026-08803',
    patient_id: 'pat-103',
    patient_name: 'Marcus Brody',
    patient_mrn: 'MRN-10388',
    payer_id: 'pyr-medigap-aetna',
    payer_name: 'Aetna Senior Supplemental (Medigap Plan G)',
    cpt_code: '66984',
    procedure_name: 'Extracapsular Cataract Extraction with IOL',
    date_of_service: '2026-10-05',
    recoverable_amount: 1420.00, // 20% Medicare Part B Coinsurance
    confidence_score: 100.00,    // Verified Medigap Plan G policy
    recoverability_score: 95.00, // Statutory crossover obligation
    estimated_effort_hours: 0.50,
    filing_deadline: '2027-01-20',
    days_until_deadline: 50,
    item_status: 'DISPATCHED_TO_QUEUE',
    assigned_analyst_name: 'David Ortiz, COB Specialist',
    notes: 'Phase 95 Secondary: Medicare Part B paid 80%. Automatic crossover failed (Remark MA18 absent).'
  },
  {
    id: 'rops-004',
    facility_id: 'fac-surgical-01',
    source_module: 'RECURRING_PATTERN',
    source_record_id: 'pat-004',
    claim_id: 'clm-8804',
    claim_number: 'CLM-2026-BATCH-04',
    patient_id: 'pat-104',
    patient_name: 'Multiple Patients (Batch 12 Claims)',
    patient_mrn: 'BATCH-COHORT-04',
    payer_id: 'pyr-cigna',
    payer_name: 'Cigna HealthSpring',
    cpt_code: '29827',
    procedure_name: 'Arthroscopic Rotator Cuff Repair (MPPR Cohort)',
    date_of_service: '2026-09-15',
    recoverable_amount: 8400.00, // 12 claims short-paid by $700 each
    confidence_score: 90.00,     // Systemic MPPR over-discount pattern
    recoverability_score: 85.00, // Contract rule inconsistency proven
    estimated_effort_hours: 2.00,
    filing_deadline: '2026-12-28',
    days_until_deadline: 32,
    item_status: 'IN_RECOVERY_WORKFLOW',
    assigned_analyst_name: 'Sarah Jenkins, CPC',
    notes: 'Phase 93C Pattern: Cigna applied MPPR reduction to primary procedure across 12 encounters.'
  },
  {
    id: 'rops-005',
    facility_id: 'fac-surgical-01',
    source_module: 'PAYER_UNDERPAYMENT',
    source_record_id: 'und-005',
    claim_id: 'clm-8805',
    claim_number: 'CLM-2026-08805',
    patient_id: 'pat-105',
    patient_name: 'Howard Wolowitz',
    patient_mrn: 'MRN-10599',
    payer_id: 'pyr-humana',
    payer_name: 'Humana Choice Care',
    cpt_code: '63650',
    procedure_name: 'Percutaneous Implantation of Neurostimulator Lead',
    date_of_service: '2026-10-02',
    recoverable_amount: 2850.00, // Fee schedule variance
    confidence_score: 85.00,
    recoverability_score: 80.00,
    estimated_effort_hours: 1.00,
    filing_deadline: '2027-01-05',
    days_until_deadline: 35,
    item_status: 'SCORED',
    assigned_analyst_name: null,
    notes: 'Phase 93 Underpayment: Payer allowed legacy 2025 contract rate instead of active 2026 schedule.'
  },
  {
    id: 'rops-006',
    facility_id: 'fac-surgical-01',
    source_module: 'UNBILLED_CASE',
    source_record_id: 'unb-006',
    claim_id: 'clm-8806',
    claim_number: 'CLM-2026-08806',
    patient_id: 'pat-106',
    patient_name: 'Claire Dunphy',
    patient_mrn: 'MRN-10688',
    payer_id: 'pyr-wc-travelers',
    payer_name: 'Travelers Workers Compensation',
    cpt_code: '22551',
    procedure_name: 'Anterior Cervical Discectomy & Fusion (ACDF)',
    date_of_service: '2026-09-08',
    recoverable_amount: 7800.00, // Complete encounter unbilled
    confidence_score: 95.00,     // OR log and operative report finalized
    recoverability_score: 90.00, // Workers Comp authorized
    estimated_effort_hours: 1.50,
    filing_deadline: '2026-11-22',
    days_until_deadline: 11,     // CRITICAL: 11 days left!
    item_status: 'SCORED',
    assigned_analyst_name: 'Billing Dispatch',
    notes: 'Phase 91 Unbilled: Surgical case completed in OR 2 months ago. Claim was held for surgeon sign-off.'
  },
  {
    id: 'rops-007',
    facility_id: 'fac-surgical-01',
    source_module: 'MISSING_CHARGE',
    source_record_id: 'chg-007',
    claim_id: 'clm-8807',
    claim_number: 'CLM-2026-08807',
    patient_id: 'pat-107',
    patient_name: 'Mitchell Pritchett',
    patient_mrn: 'MRN-10755',
    payer_id: 'pyr-aetna',
    payer_name: 'Aetna Open Choice',
    cpt_code: 'C1713',
    procedure_name: 'Anchors & Fixation Supplies (CPT 29881 Meniscectomy)',
    date_of_service: '2026-10-18',
    recoverable_amount: 950.00,
    confidence_score: 80.00,
    recoverability_score: 75.00,
    estimated_effort_hours: 0.75,
    filing_deadline: '2027-02-15',
    days_until_deadline: 75,
    item_status: 'SCORED',
    assigned_analyst_name: null,
    notes: 'Phase 92 Missing Charge: Nursing supply requisition logged 2 fixation anchors omitted from initial claim.'
  },
  {
    id: 'rops-008',
    facility_id: 'fac-surgical-01',
    source_module: 'DENIAL_APPEAL',
    source_record_id: 'den-008',
    claim_id: 'clm-8808',
    claim_number: 'CLM-2026-08808',
    patient_id: 'pat-108',
    patient_name: 'Gloria Delgado',
    patient_mrn: 'MRN-10822',
    payer_id: 'pyr-bcbs',
    payer_name: 'Blue Cross Blue Shield',
    cpt_code: '49505',
    procedure_name: 'Inguinal Hernia Repair with Mesh',
    date_of_service: '2026-04-10',
    recoverable_amount: 3200.00,
    confidence_score: 70.00,
    recoverability_score: 60.00,
    estimated_effort_hours: 1.00,
    filing_deadline: '2026-10-10',
    days_until_deadline: -32,    // EXPIRED!
    item_status: 'EXPIRED_UNCOLLECTIBLE',
    assigned_analyst_name: null,
    notes: 'Statutory 180-day appeal limit elapsed. Locked as uncollectible write-off.'
  }
];

// ==============================================================================
// 4. ROPS STORE & SERVICE CLASS
// ==============================================================================

export class OpportunityPriorityStore {
  constructor() {
    this.storageKey = 'ascanalyst_rops_opportunities_v1';
    this.benchmark = DEFAULT_FACILITY_BENCHMARK;
    this.weights = { ...DEFAULT_ROPS_WEIGHTS };
    this.items = this.loadState();
  }

  loadState() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(this.storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.map(item => scoreOpportunityRecord(item, this.benchmark, this.weights));
          }
        }
      }
    } catch {
      // Fallback
    }
    return INITIAL_ROPS_OPPORTUNITIES.map(item => scoreOpportunityRecord(item, this.benchmark, this.weights));
  }

  saveState() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(this.storageKey, JSON.stringify(this.items));
      }
    } catch {
      // Fallback
    }
  }

  /**
   * Returns all opportunities sorted strictly by Rule 4 Invariant:
   * 1. priority_action_tier rank ASC (Tier 1 first)
   * 2. rops_priority_score DESC
   * 3. yield_per_hour DESC
   * 4. days_until_deadline ASC
   */
  getAllOpportunities(facilityId = null, sourceModule = null) {
    let list = facilityId
      ? this.items.filter(i => i.facility_id === facilityId)
      : [...this.items];

    if (sourceModule && sourceModule !== 'ALL') {
      list = list.filter(i => i.source_module === sourceModule);
    }

    const getRank = (tierCode) => {
      return PRIORITY_ACTION_TIERS[tierCode] ? PRIORITY_ACTION_TIERS[tierCode].rank : 99;
    };

    return list.sort((a, b) => {
      const rankA = getRank(a.priority_action_tier);
      const rankB = getRank(b.priority_action_tier);
      if (rankA !== rankB) return rankA - rankB;

      if (b.rops_priority_score !== a.rops_priority_score) {
        return b.rops_priority_score - a.rops_priority_score;
      }

      if (b.yield_per_hour !== a.yield_per_hour) {
        return b.yield_per_hour - a.yield_per_hour;
      }

      return a.days_until_deadline - b.days_until_deadline;
    });
  }

  getOpportunityById(id) {
    return this.items.find(i => i.id === id) || null;
  }

  /**
   * Dispatches opportunity to work queue and assigns staff member.
   */
  dispatchToQueue(id, analystName = 'Senior RCM Specialist', notes = '') {
    const idx = this.items.findIndex(i => i.id === id);
    if (idx === -1) throw new Error(`Opportunity ${id} not found.`);

    const item = this.items[idx];
    if (item.days_until_deadline < 0) {
      throw new Error('Cannot dispatch an expired opportunity.');
    }

    const updated = {
      ...item,
      item_status: 'DISPATCHED_TO_QUEUE',
      assigned_analyst_name: analystName,
      notes: notes ? `${item.notes ? item.notes + ' | ' : ''}Dispatched: ${notes}` : item.notes,
      updated_at: new Date().toISOString()
    };

    this.items[idx] = scoreOpportunityRecord(updated, this.benchmark, this.weights);
    this.saveState();
    return this.items[idx];
  }

  /**
   * Marks opportunity recovered and reconciles realized cash value.
   */
  recordRecovery(id, recoveredAmount, notes = '') {
    const idx = this.items.findIndex(i => i.id === id);
    if (idx === -1) throw new Error(`Opportunity ${id} not found.`);

    const amt = Number(recoveredAmount) || 0;
    if (amt <= 0) throw new Error('Recovered amount must be greater than zero.');

    const item = this.items[idx];
    const updated = {
      ...item,
      recoverable_amount: Math.max(0, item.recoverable_amount - amt),
      item_status: 'RECOVERED',
      priority_action_tier: 'TIER_5_EXPIRED_OR_SUPPRESSED',
      notes: notes ? `${item.notes ? item.notes + ' | ' : ''}Recovered $${amt}: ${notes}` : item.notes,
      updated_at: new Date().toISOString()
    };

    this.items[idx] = scoreOpportunityRecord(updated, this.benchmark, this.weights);
    this.saveState();
    return this.items[idx];
  }

  /**
   * Dismisses opportunity with formal justification note.
   */
  dismissOpportunity(id, reasonNotes = '') {
    const idx = this.items.findIndex(i => i.id === id);
    if (idx === -1) throw new Error(`Opportunity ${id} not found.`);

    if (!reasonNotes || reasonNotes.trim().length < 8) {
      throw new Error('Mandatory formal dismissal notes required.');
    }

    const item = this.items[idx];
    const updated = {
      ...item,
      item_status: 'DISMISSED_NOT_RECOVERABLE',
      priority_action_tier: 'TIER_5_EXPIRED_OR_SUPPRESSED',
      notes: `${item.notes ? item.notes + ' | ' : ''}Dismissed: ${reasonNotes}`,
      updated_at: new Date().toISOString()
    };

    this.items[idx] = scoreOpportunityRecord(updated, this.benchmark, this.weights);
    this.saveState();
    return this.items[idx];
  }

  /**
   * Updates facility benchmark or weight settings and re-scores active ledger.
   */
  updateConfig(newBenchmark, newWeights) {
    if (newBenchmark && Number(newBenchmark) > 0) {
      this.benchmark = Number(newBenchmark);
    }
    if (newWeights) {
      const sum = (Number(newWeights.VALUE) || 0) +
                  (Number(newWeights.CONFIDENCE) || 0) +
                  (Number(newWeights.RECOVERABILITY) || 0) +
                  (Number(newWeights.URGENCY) || 0);
      if (Math.abs(sum - 1.00) < 0.01) {
        this.weights = { ...newWeights };
      }
    }
    this.items = this.items.map(i => scoreOpportunityRecord(i, this.benchmark, this.weights));
    this.saveState();
    return { benchmark: this.benchmark, weights: this.weights };
  }

  /**
   * Computes portfolio summary metrics.
   */
  getMetrics(facilityId = null) {
    const all = this.getAllOpportunities(facilityId);
    const active = all.filter(i => !['RECOVERED', 'DISMISSED_NOT_RECOVERABLE', 'EXPIRED_UNCOLLECTIBLE'].includes(i.item_status));

    const totalOpportunitiesCount = active.length;
    const totalPipelineAmount = active.reduce((acc, i) => acc + i.recoverable_amount, 0);
    const totalExpectedYield = active.reduce((acc, i) => acc + i.expected_realizable_yield, 0);

    const avgRopsScore = active.length > 0
      ? active.reduce((acc, i) => acc + i.rops_priority_score, 0) / active.length
      : 0;

    const urgentDeadlinesCount = active.filter(i => i.days_until_deadline >= 0 && i.days_until_deadline <= 15).length;
    const recoveredCashMtd = all.filter(i => i.item_status === 'RECOVERED')
                               .reduce((acc, i) => acc + i.recoverable_amount, 0);

    const moduleDistribution = {
      IMPLANT_CARVEOUT: all.filter(i => i.source_module === 'IMPLANT_CARVEOUT').length,
      DENIAL_APPEAL: all.filter(i => i.source_module === 'DENIAL_APPEAL').length,
      SECONDARY_COB: all.filter(i => i.source_module === 'SECONDARY_COB').length,
      PAYER_UNDERPAYMENT: all.filter(i => i.source_module === 'PAYER_UNDERPAYMENT').length,
      RECURRING_PATTERN: all.filter(i => i.source_module === 'RECURRING_PATTERN').length,
      UNBILLED_CASE: all.filter(i => i.source_module === 'UNBILLED_CASE').length,
      MISSING_CHARGE: all.filter(i => i.source_module === 'MISSING_CHARGE').length
    };

    const tierDistribution = {
      TIER_1_CRITICAL_DISPATCH: all.filter(i => i.priority_action_tier === 'TIER_1_CRITICAL_DISPATCH').length,
      TIER_2_HIGH_YIELD_RECOVERY: all.filter(i => i.priority_action_tier === 'TIER_2_HIGH_YIELD_RECOVERY').length,
      TIER_3_STANDARD_WORKBENCH: all.filter(i => i.priority_action_tier === 'TIER_3_STANDARD_WORKBENCH').length,
      TIER_4_LOW_YIELD_BATCH: all.filter(i => i.priority_action_tier === 'TIER_4_LOW_YIELD_BATCH').length,
      TIER_5_EXPIRED_OR_SUPPRESSED: all.filter(i => i.priority_action_tier === 'TIER_5_EXPIRED_OR_SUPPRESSED').length
    };

    return {
      totalOpportunitiesCount,
      totalPipelineAmount: Number(totalPipelineAmount.toFixed(2)),
      totalExpectedYield: Number(totalExpectedYield.toFixed(2)),
      avgRopsScore: Number(avgRopsScore.toFixed(1)),
      urgentDeadlinesCount,
      recoveredCashMtd: Number(recoveredCashMtd.toFixed(2)),
      moduleDistribution,
      tierDistribution
    };
  }
}

export const opportunityPriorityService = new OpportunityPriorityStore();
export default opportunityPriorityService;
