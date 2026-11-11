/**
 * DENIAL RECOVERY PRIORITIZATION SERVICE
 * Phase 94 — Revenue Cycle Management
 * 
 * Multi-factor denial ranking by value, overturn probability, deadline urgency,
 * and administrative effort-to-yield ratio ($/hr).
 */

// ==============================================================================
// 1. CONSTANTS & TAXONOMY
// ==============================================================================

export const PRIORITY_TIERS = {
  CRITICAL_URGENT: {
    code: 'CRITICAL_URGENT',
    label: 'Critical Urgent',
    badgeColor: '#ef4444', // Red
    minScore: 80.00,
    maxScore: 100.00,
    rank: 5,
    description: 'Imminent statutory deadline (<7 days) or massive recoverable yield. Immediate senior specialist dispatch required.'
  },
  HIGH_PRIORITY: {
    code: 'HIGH_PRIORITY',
    label: 'High Priority',
    badgeColor: '#f97316', // Orange
    minScore: 65.00,
    maxScore: 79.99,
    rank: 4,
    description: 'High expected recovery yield with strong contractual evidence. Primary focus of daily revenue cycle work queues.'
  },
  MEDIUM_PRIORITY: {
    code: 'MEDIUM_PRIORITY',
    label: 'Medium Priority',
    badgeColor: '#0284c7', // Sky Blue
    minScore: 45.00,
    maxScore: 64.99,
    rank: 3,
    description: 'Standard clinical/administrative appeal queue with moderate overturn potential and manageable effort.'
  },
  LOW_PRIORITY: {
    code: 'LOW_PRIORITY',
    label: 'Low Priority',
    badgeColor: '#64748b', // Slate
    minScore: 25.00,
    maxScore: 44.99,
    rank: 2,
    description: 'Marginal expected return or high administrative friction. Processed systematically in batch workflows.'
  },
  UNRECOVERABLE_HOLD: {
    code: 'UNRECOVERABLE_HOLD',
    label: 'Unrecoverable Hold',
    badgeColor: '#475569', // Dark Slate
    minScore: 0.00,
    maxScore: 24.99,
    rank: 1,
    description: 'Timely filing expired or non-appealable denial. Routed to supervisor audit for formal contractual write-off.'
  }
};

export const EFFORT_LEVELS = {
  MINIMAL_EFFORT: {
    code: 'MINIMAL_EFFORT',
    label: 'Minimal Effort (Quick Win)',
    badgeColor: '#10b981', // Emerald
    score: 100.00,
    hours: 0.25, // 15 mins
    description: 'Electronic resubmission, modifier -59/-50 correction, or automated eligibility re-check.'
  },
  MODERATE_EFFORT: {
    code: 'MODERATE_EFFORT',
    label: 'Moderate Effort',
    badgeColor: '#06b6d4', // Cyan
    score: 75.00,
    hours: 0.50, // 30 mins
    description: 'Attach operative notes, surgical implant purchase invoice, or prior authorization certificate.'
  },
  HIGH_EFFORT: {
    code: 'HIGH_EFFORT',
    label: 'High Effort',
    badgeColor: '#f59e0b', // Amber
    score: 45.00,
    hours: 1.00, // 60 mins
    description: 'Formal clinical appeal letter, certified coding audit, or comprehensive medical necessity dossier.'
  },
  EXTREME_EFFORT: {
    code: 'EXTREME_EFFORT',
    label: 'Extreme Effort',
    badgeColor: '#ef4444', // Red
    score: 20.00,
    hours: 2.00, // 120+ mins
    description: 'Physician peer-to-peer conference, external independent medical review, or ALJ dispute hearing.'
  }
};

export const QUEUE_STATUSES = {
  QUEUED: { code: 'QUEUED', label: 'Queued for Review', color: '#64748b' },
  ASSIGNED: { code: 'ASSIGNED', label: 'Assigned to Specialist', color: '#0284c7' },
  IN_APPEAL: { code: 'IN_APPEAL', label: 'Appeal In Progress', color: '#f59e0b' },
  RECOVERED: { code: 'RECOVERED', label: 'Cash Recovered', color: '#10b981' },
  DISMISSED_WRITE_OFF: { code: 'DISMISSED_WRITE_OFF', label: 'Written Off', color: '#475569' },
  EXPIRED: { code: 'EXPIRED', label: 'Filing Limit Expired', color: '#991b1b' }
};

export const DENIAL_CATEGORIES = {
  CLINICAL_APPEALS: {
    code: 'CLINICAL_APPEALS',
    label: 'Clinical Appeals',
    team: 'Clinical Documentation & Physician Advisory',
    description: 'Medical necessity (CARC 50), experimental/investigational (CARC 96), unbundled modifier review (CARC 97).'
  },
  BILLING_AND_CODING: {
    code: 'BILLING_AND_CODING',
    label: 'Billing & Coding',
    team: 'Billing & Coding Operations',
    description: 'Modifier corrections, timely filing disputes, claim scrub errors, packaging clarifications.'
  },
  PATIENT_ACCESS: {
    code: 'PATIENT_ACCESS',
    label: 'Patient Access',
    team: 'Patient Registration & Financial Clearance',
    description: 'Coverage terminated (CARC 27), coordination of benefits (CARC 22), missing primary EOB.'
  },
  CONTRACTING: {
    code: 'CONTRACTING',
    label: 'Managed Care Contracting',
    team: 'Payer Contracting & Dispute Escalation',
    description: 'Unauthorized fee schedule reductions, missing carveouts, payer contract breach.'
  }
};

export const SCORING_WEIGHTS = {
  VALUE: 0.35,
  PROBABILITY: 0.30,
  URGENCY: 0.20,
  EFFORT: 0.15
};

export const DEFAULT_FACILITY_BENCHMARK = 5000.00;

// ==============================================================================
// 2. AUTHORITATIVE DETERMINISTIC SCORING ALGORITHMS
// ==============================================================================

/**
 * Normalizes denied dollar balance against facility benchmark ($0 - $5,000+).
 * Formula: ValueScore = min(100.00, (denied_amount / benchmark) * 100.00)
 */
export function calculateValueScore(deniedAmount, benchmark = DEFAULT_FACILITY_BENCHMARK) {
  const amount = Number(deniedAmount) || 0;
  const bench = Number(benchmark) > 0 ? Number(benchmark) : DEFAULT_FACILITY_BENCHMARK;
  if (amount <= 0) return 0.00;
  const score = Math.min(100.00, (amount / bench) * 100.00);
  return Number(score.toFixed(2));
}

/**
 * Scores calendar days remaining before statutory or contractual appeal filing limit elapses.
 * - <= 7 days: 100.00 (Critical Statutory Cliff)
 * - 8 - 14 days: 90.00
 * - 15 - 30 days: 75.00
 * - 31 - 60 days: 50.00
 * - > 60 days: 30.00
 * - Expired (< 0 days): 0.00 (Forced to UNRECOVERABLE_HOLD)
 */
export function calculateUrgencyScore(daysUntilDeadline) {
  const days = Number(daysUntilDeadline);
  if (isNaN(days) || days < 0) return 0.00;
  if (days <= 7) return 100.00;
  if (days <= 14) return 90.00;
  if (days <= 30) return 75.00;
  if (days <= 60) return 50.00;
  return 30.00;
}

/**
 * Scores administrative friction inversely to reward quick wins and fast cash velocity.
 */
export function calculateEffortScore(effortLevel) {
  const level = EFFORT_LEVELS[effortLevel];
  if (level) return level.score;
  return 50.00; // default moderate fallback
}

/**
 * Returns estimated effort hours based on effort tier.
 */
export function calculateEffortHours(effortLevel) {
  const level = EFFORT_LEVELS[effortLevel];
  if (level) return level.hours;
  return 0.50;
}

/**
 * Computes 4-factor deterministic Priority Score (0.00 - 100.00):
 * PriorityScore = (ValueScore * 0.35) + (ProbabilityScore * 0.30) + (UrgencyScore * 0.20) + (EffortScore * 0.15)
 */
export function calculatePriorityScore(valueScore, probabilityScore, urgencyScore, effortScore) {
  const v = Math.max(0, Math.min(100, Number(valueScore) || 0));
  const p = Math.max(0, Math.min(100, Number(probabilityScore) || 0));
  const u = Math.max(0, Math.min(100, Number(urgencyScore) || 0));
  const e = Math.max(0, Math.min(100, Number(effortScore) || 0));

  const total = (v * SCORING_WEIGHTS.VALUE) +
                (p * SCORING_WEIGHTS.PROBABILITY) +
                (u * SCORING_WEIGHTS.URGENCY) +
                (e * SCORING_WEIGHTS.EFFORT);

  return Number(total.toFixed(2));
}

/**
 * Classifies composite score into 5 actionable priority tiers.
 * Automatic Timely Filing Rule: If daysUntilDeadline < 0, forced to UNRECOVERABLE_HOLD.
 */
export function classifyPriorityTier(priorityScore, daysUntilDeadline) {
  const days = Number(daysUntilDeadline);
  if (!isNaN(days) && days < 0) {
    return PRIORITY_TIERS.UNRECOVERABLE_HOLD.code;
  }
  const score = Number(priorityScore) || 0;
  if (score >= PRIORITY_TIERS.CRITICAL_URGENT.minScore) return PRIORITY_TIERS.CRITICAL_URGENT.code;
  if (score >= PRIORITY_TIERS.HIGH_PRIORITY.minScore) return PRIORITY_TIERS.HIGH_PRIORITY.code;
  if (score >= PRIORITY_TIERS.MEDIUM_PRIORITY.minScore) return PRIORITY_TIERS.MEDIUM_PRIORITY.code;
  if (score >= PRIORITY_TIERS.LOW_PRIORITY.minScore) return PRIORITY_TIERS.LOW_PRIORITY.code;
  return PRIORITY_TIERS.UNRECOVERABLE_HOLD.code;
}

/**
 * Computes financial velocity per staff hour:
 * ExpectedRecovery = denied_amount * (overturn_probability_pct / 100.0)
 * YieldPerHour = ExpectedRecovery / estimated_effort_hours
 */
export function calculateYieldPerHour(deniedAmount, overturnProbabilityPct, effortHours) {
  const amount = Math.max(0, Number(deniedAmount) || 0);
  const prob = Math.max(0, Math.min(100, Number(overturnProbabilityPct) || 0)) / 100.0;
  const hours = Math.max(0.1, Number(effortHours) || 0.5);

  const expectedRecovery = amount * prob;
  const yieldPerHour = expectedRecovery / hours;
  return Number(yieldPerHour.toFixed(2));
}

/**
 * Evaluates and scores an entire denial record authoritatively.
 */
export function scoreDenial(record, benchmark = DEFAULT_FACILITY_BENCHMARK) {
  const deniedAmount = Number(record.denied_amount) || 0;
  const overturnProbabilityPct = Number(record.overturn_probability_pct) || 0;
  const daysUntilDeadline = Number(record.days_until_deadline);
  const effortLevel = record.effort_level || 'MODERATE_EFFORT';
  const effortHours = record.estimated_effort_hours || calculateEffortHours(effortLevel);

  // Compute subscores
  const valueScore = calculateValueScore(deniedAmount, benchmark);
  const probabilityScore = Number(Math.max(0, Math.min(100, overturnProbabilityPct)).toFixed(2));
  const urgencyScore = calculateUrgencyScore(daysUntilDeadline);
  const effortScore = calculateEffortScore(effortLevel);

  // If expired, urgency is 0 and tier is forced to UNRECOVERABLE_HOLD
  const priorityScore = calculatePriorityScore(valueScore, probabilityScore, urgencyScore, effortScore);
  const priorityTier = classifyPriorityTier(priorityScore, daysUntilDeadline);

  const expectedRecovery = Number((deniedAmount * (overturnProbabilityPct / 100.0)).toFixed(2));
  const yieldPerHour = calculateYieldPerHour(deniedAmount, overturnProbabilityPct, effortHours);

  let queueStatus = record.queue_status || 'QUEUED';
  if (daysUntilDeadline < 0 && queueStatus === 'QUEUED') {
    queueStatus = 'EXPIRED';
  }

  return {
    ...record,
    value_score: valueScore,
    probability_score: probabilityScore,
    urgency_score: urgencyScore,
    effort_score: effortScore,
    priority_score: priorityScore,
    priority_tier: priorityTier,
    expected_recovery_amount: expectedRecovery,
    yield_per_hour: yieldPerHour,
    estimated_effort_hours: effortHours,
    queue_status: queueStatus,
    last_scored_at: new Date().toISOString()
  };
}

// ==============================================================================
// 3. BASELINE REALISTIC ASC DENIALS DATASET
// ==============================================================================

const INITIAL_DENIAL_PRIORITIES = [
  {
    id: 'drp-001',
    organization_id: 'org-asc-01',
    facility_id: 'fac-surgical-01',
    denial_id: 'den-2026-001',
    claim_id: 'clm-8801',
    claim_number: 'CLM-2026-08801',
    patient_name: 'Eleanor Vance',
    patient_mrn: 'MRN-78129',
    surgeon_name: 'Dr. Kelly Malinoski',
    cpt_code: '29888',
    procedure_name: 'Arthroscopically aided anterior cruciate ligament reconstruction',
    payer_id: 'pyr-aetna-01',
    payer_name: 'Aetna Health Management',
    carc_code: '50',
    carc_description: 'These are non-covered services because this is not deemed a medical necessity by the payer.',
    rarc_code: 'N382',
    rarc_description: 'Missing or incomplete clinical documentation / operative report.',
    denial_category: 'CLINICAL_APPEALS',
    denied_amount: 3450.00,
    overturn_probability_pct: 85.00,
    filing_deadline: '2026-11-16',
    days_until_deadline: 6, // Urgency 100
    effort_level: 'MODERATE_EFFORT',
    estimated_effort_hours: 0.50,
    queue_status: 'QUEUED',
    assigned_user_id: null,
    assigned_user_name: null,
    appeal_strategy: 'Submit certified operative report, pre-op MRI showing complete ACL tear, and pivot-shift grade III physical exam documentation.'
  },
  {
    id: 'drp-002',
    organization_id: 'org-asc-01',
    facility_id: 'fac-surgical-01',
    denial_id: 'den-2026-002',
    claim_id: 'clm-8802',
    claim_number: 'CLM-2026-08802',
    patient_name: 'Marcus Brody',
    patient_mrn: 'MRN-44912',
    surgeon_name: 'Dr. Paul Gardner',
    cpt_code: '29827',
    procedure_name: 'Arthroscopy, shoulder, surgical; with rotator cuff repair',
    payer_id: 'pyr-bcbs-01',
    payer_name: 'Blue Cross Blue Shield',
    carc_code: '97',
    carc_description: 'The benefit for this service is included in the payment/allowance for another service/procedure that has already been adjudicated.',
    rarc_code: 'M15',
    rarc_description: 'Separately billable procedure requires modifier -59 or -X{EPSU}.',
    denial_category: 'BILLING_AND_CODING',
    denied_amount: 2180.00,
    overturn_probability_pct: 92.00,
    filing_deadline: '2026-11-21',
    days_until_deadline: 11, // Urgency 90
    effort_level: 'MINIMAL_EFFORT', // Quick Win
    estimated_effort_hours: 0.25,
    queue_status: 'QUEUED',
    assigned_user_id: null,
    assigned_user_name: null,
    appeal_strategy: 'Electronic corrected claim resubmission with modifier -59 validating distinct anatomic site for subacromial decompression (29826).'
  },
  {
    id: 'drp-003',
    organization_id: 'org-asc-01',
    facility_id: 'fac-surgical-01',
    denial_id: 'den-2026-003',
    claim_id: 'clm-8803',
    claim_number: 'CLM-2026-08803',
    patient_name: 'Arthur Pendelton',
    patient_mrn: 'MRN-91044',
    surgeon_name: 'Dr. Andrew Bonett',
    cpt_code: '27447',
    procedure_name: 'Total knee arthroplasty with high-flex cruciate-retaining femoral implant',
    payer_id: 'pyr-uhc-01',
    payer_name: 'UnitedHealthcare Commercial',
    carc_code: '96',
    carc_description: 'Non-covered charge(s). At least one Remark Code must be provided.',
    rarc_code: 'N657',
    rarc_description: 'Missing itemized manufacturer invoice for implant carve-out reimbursement.',
    denial_category: 'CLINICAL_APPEALS',
    denied_amount: 6800.00,
    overturn_probability_pct: 90.00,
    filing_deadline: '2026-11-28',
    days_until_deadline: 18, // Urgency 75
    effort_level: 'MODERATE_EFFORT',
    estimated_effort_hours: 0.50,
    queue_status: 'ASSIGNED',
    assigned_user_id: 'usr-spec-01',
    assigned_user_name: 'Sarah Jenkins, CPC',
    assigned_at: '2026-11-09T14:30:00Z',
    appeal_strategy: 'Attach Stryker itemized implant invoice, purchase order #PO-4912, and Exhibit C of UHC Facility Agreement covering Rev Code 0278 at cost + 15%.'
  },
  {
    id: 'drp-004',
    organization_id: 'org-asc-01',
    facility_id: 'fac-surgical-01',
    denial_id: 'den-2026-004',
    claim_id: 'clm-8804',
    claim_number: 'CLM-2026-08804',
    patient_name: 'Dorothy Gale',
    patient_mrn: 'MRN-33821',
    surgeon_name: 'Dr. Mark Walsh',
    cpt_code: '66984',
    procedure_name: 'Extracapsular cataract removal with insertion of intraocular lens',
    payer_id: 'pyr-cigna-01',
    payer_name: 'Cigna Healthcare',
    carc_code: '16',
    carc_description: 'Claim/service lacks information or has submission/billing error(s) which is needed for adjudication.',
    rarc_code: 'MA130',
    rarc_description: 'Missing operative note confirming visual acuity impairment (<20/50).',
    denial_category: 'BILLING_AND_CODING',
    denied_amount: 1250.00,
    overturn_probability_pct: 75.00,
    filing_deadline: '2026-12-08',
    days_until_deadline: 28, // Urgency 75
    effort_level: 'MODERATE_EFFORT',
    estimated_effort_hours: 0.50,
    queue_status: 'QUEUED',
    assigned_user_id: null,
    assigned_user_name: null,
    appeal_strategy: 'Resubmit with ophthalmology consultation notes, Snellen test recording 20/70 right eye, and operative transcript.'
  },
  {
    id: 'drp-005',
    organization_id: 'org-asc-01',
    facility_id: 'fac-surgical-01',
    denial_id: 'den-2026-005',
    claim_id: 'clm-8805',
    claim_number: 'CLM-2026-08805',
    patient_name: 'Tobias Funke',
    patient_mrn: 'MRN-19283',
    surgeon_name: 'Dr. Kelly Malinoski',
    cpt_code: '63030',
    procedure_name: 'Laminotomy with decompression of nerve root, lumbar',
    payer_id: 'pyr-humana-01',
    payer_name: 'Humana Medicare Advantage',
    carc_code: '27',
    carc_description: 'Expenses incurred after coverage terminated.',
    rarc_code: 'N30',
    rarc_description: 'Patient must be billed or secondary payer verified.',
    denial_category: 'PATIENT_ACCESS',
    denied_amount: 4100.00,
    overturn_probability_pct: 35.00,
    filing_deadline: '2026-12-25',
    days_until_deadline: 45, // Urgency 50
    effort_level: 'HIGH_EFFORT',
    estimated_effort_hours: 1.00,
    queue_status: 'QUEUED',
    assigned_user_id: null,
    assigned_user_name: null,
    appeal_strategy: 'Contact patient for active employer group policy or Medicaid crossover. Verify retroactive COBRA reinstatement.'
  },
  {
    id: 'drp-006',
    organization_id: 'org-asc-01',
    facility_id: 'fac-surgical-01',
    denial_id: 'den-2026-006',
    claim_id: 'clm-8806',
    claim_number: 'CLM-2026-08806',
    patient_name: 'Lucille Bluth',
    patient_mrn: 'MRN-55190',
    surgeon_name: 'Dr. Leopoldo Baccaro',
    cpt_code: '45380',
    procedure_name: 'Colonoscopy, flexible; with biopsy, single or multiple',
    payer_id: 'pyr-medicare-01',
    payer_name: 'Medicare Part B / Novitas Solutions',
    carc_code: '4',
    carc_description: 'The procedure code is inconsistent with the modifier used or a required modifier is missing.',
    rarc_code: 'MA01',
    rarc_description: 'Modifier -PT (screening converted to diagnostic) omitted.',
    denial_category: 'BILLING_AND_CODING',
    denied_amount: 340.00,
    overturn_probability_pct: 95.00,
    filing_deadline: '2027-01-21',
    days_until_deadline: 72, // Urgency 30
    effort_level: 'MINIMAL_EFFORT',
    estimated_effort_hours: 0.25,
    queue_status: 'QUEUED',
    assigned_user_id: null,
    assigned_user_name: null,
    appeal_strategy: 'Append modifier -PT reflecting screening colonoscopy that converted to diagnostic polypectomy. Instant electronic reprocessing.'
  },
  {
    id: 'drp-007',
    organization_id: 'org-asc-01',
    facility_id: 'fac-surgical-01',
    denial_id: 'den-2026-007',
    claim_id: 'clm-8807',
    claim_number: 'CLM-2026-08807',
    patient_name: 'Gob Bluth',
    patient_mrn: 'MRN-66291',
    surgeon_name: 'Dr. Paul Gardner',
    cpt_code: '64721',
    procedure_name: 'Neuroplasty and/or transposition; median nerve at carpal tunnel',
    payer_id: 'pyr-aetna-01',
    payer_name: 'Aetna Health Management',
    carc_code: '29',
    carc_description: 'The time limit for filing has expired.',
    rarc_code: 'N211',
    rarc_description: 'Filing date exceeded 180 days from date of service.',
    denial_category: 'BILLING_AND_CODING',
    denied_amount: 1850.00,
    overturn_probability_pct: 5.00,
    filing_deadline: '2026-10-27',
    days_until_deadline: -14, // EXPIRED -> Urgency 0, Tier UNRECOVERABLE_HOLD
    effort_level: 'HIGH_EFFORT',
    estimated_effort_hours: 1.00,
    queue_status: 'EXPIRED',
    assigned_user_id: null,
    assigned_user_name: null,
    appeal_strategy: 'Unrecoverable due to expired timely filing limit without documented clearinghouse rejection proof or disaster declaration. Supervisor write-off recommended.'
  },
  {
    id: 'drp-008',
    organization_id: 'org-asc-01',
    facility_id: 'fac-surgical-01',
    denial_id: 'den-2026-008',
    claim_id: 'clm-8808',
    claim_number: 'CLM-2026-08808',
    patient_name: 'George Michael',
    patient_mrn: 'MRN-88401',
    surgeon_name: 'Dr. Andrew Bonett',
    cpt_code: '62321',
    procedure_name: 'Injection(s), interlaminar epidural or subarachnoid; cervical or thoracic',
    payer_id: 'pyr-bcbs-01',
    payer_name: 'Blue Cross Blue Shield',
    carc_code: '50',
    carc_description: 'These are non-covered services because this is not deemed a medical necessity by the payer.',
    rarc_code: 'N640',
    rarc_description: 'Prior authorization window expired 4 days prior to surgery date.',
    denial_category: 'CLINICAL_APPEALS',
    denied_amount: 920.00,
    overturn_probability_pct: 40.00,
    filing_deadline: '2026-12-15',
    days_until_deadline: 35, // Urgency 50
    effort_level: 'HIGH_EFFORT',
    estimated_effort_hours: 1.00,
    queue_status: 'QUEUED',
    assigned_user_id: null,
    assigned_user_name: null,
    appeal_strategy: 'Request retroactive authorization extension citing surgeon clinic scheduling emergency.'
  }
];

// ==============================================================================
// 4. DENIAL PRIORITIZATION STORE & SERVICE CLASS
// ==============================================================================

export class DenialPrioritizationStore {
  constructor() {
    this.storageKey = 'ascanalyst_denial_recovery_priorities_v1';
    this.priorities = this.loadState();
  }

  loadState() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(this.storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.map(item => scoreDenial(item));
          }
        }
      }
    } catch {
      // Fallback
    }
    // Default baseline initialization
    return INITIAL_DENIAL_PRIORITIES.map(item => scoreDenial(item));
  }

  saveState() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(this.storageKey, JSON.stringify(this.priorities));
      }
    } catch {
      // Storage unavailable
    }
  }

  /**
   * Returns all scored denials sorted according to Invariant Rule 3:
   * 1. Priority Tier Rank DESC (Critical > High > Med > Low > Hold)
   * 2. Yield per Hour DESC ($/hr)
   * 3. Days Until Deadline ASC
   */
  getAllPriorities(facilityId = null, filters = {}) {
    let list = this.priorities.map(item => scoreDenial(item));

    if (facilityId) {
      list = list.filter(item => item.facility_id === facilityId);
    }

    if (filters.tier && filters.tier !== 'ALL') {
      list = list.filter(item => item.priority_tier === filters.tier);
    }

    if (filters.status && filters.status !== 'ALL') {
      list = list.filter(item => item.queue_status === filters.status);
    }

    if (filters.category && filters.category !== 'ALL') {
      list = list.filter(item => item.denial_category === filters.category);
    }

    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(item =>
        item.claim_number.toLowerCase().includes(q) ||
        item.patient_name.toLowerCase().includes(q) ||
        item.payer_name.toLowerCase().includes(q) ||
        item.cpt_code.toLowerCase().includes(q) ||
        item.carc_code.toLowerCase().includes(q)
      );
    }

    // Sort order: Tier rank DESC, Yield per Hour DESC, Days Until Deadline ASC
    return list.sort((a, b) => {
      const tierRankA = PRIORITY_TIERS[a.priority_tier]?.rank || 0;
      const tierRankB = PRIORITY_TIERS[b.priority_tier]?.rank || 0;
      if (tierRankB !== tierRankA) {
        return tierRankB - tierRankA;
      }
      if (b.yield_per_hour !== a.yield_per_hour) {
        return b.yield_per_hour - a.yield_per_hour;
      }
      return a.days_until_deadline - b.days_until_deadline;
    });
  }

  getPriorityById(id) {
    const found = this.priorities.find(p => p.id === id);
    return found ? scoreDenial(found) : null;
  }

  scoreDenialRecord(record, benchmark = DEFAULT_FACILITY_BENCHMARK) {
    return scoreDenial(record, benchmark);
  }

  assignDenialToSpecialist(id, specialistId, specialistName) {
    const idx = this.priorities.findIndex(p => p.id === id);
    if (idx === -1) throw new Error(`Denial Priority record ${id} not found.`);

    const updated = {
      ...this.priorities[idx],
      assigned_user_id: specialistId,
      assigned_user_name: specialistName,
      assigned_at: new Date().toISOString(),
      queue_status: 'ASSIGNED',
      updated_at: new Date().toISOString()
    };

    this.priorities[idx] = scoreDenial(updated);
    this.saveState();
    return this.priorities[idx];
  }

  startAppeal(id, notes = '') {
    const idx = this.priorities.findIndex(p => p.id === id);
    if (idx === -1) throw new Error(`Denial Priority record ${id} not found.`);

    if (this.priorities[idx].days_until_deadline < 0) {
      throw new Error('Cannot start appeal on expired claim without an approved filing waiver.');
    }

    const updated = {
      ...this.priorities[idx],
      queue_status: 'IN_APPEAL',
      appeal_notes: notes,
      updated_at: new Date().toISOString()
    };

    this.priorities[idx] = scoreDenial(updated);
    this.saveState();
    return this.priorities[idx];
  }

  dismissDenialAsWriteOff(id, supervisorId, supervisorName, reasonNotes) {
    const idx = this.priorities.findIndex(p => p.id === id);
    if (idx === -1) throw new Error(`Denial Priority record ${id} not found.`);

    if (!reasonNotes || reasonNotes.trim().length < 8) {
      throw new Error('Formal write-off justification notes are mandatory.');
    }

    const updated = {
      ...this.priorities[idx],
      queue_status: 'DISMISSED_WRITE_OFF',
      priority_tier: 'UNRECOVERABLE_HOLD',
      write_off_supervisor_id: supervisorId,
      write_off_supervisor_name: supervisorName,
      write_off_notes: reasonNotes,
      write_off_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.priorities[idx] = scoreDenial(updated);
    this.saveState();
    return this.priorities[idx];
  }

  markRecovered(id, recoveredAmount, checkNumber = '') {
    const idx = this.priorities.findIndex(p => p.id === id);
    if (idx === -1) throw new Error(`Denial Priority record ${id} not found.`);

    const updated = {
      ...this.priorities[idx],
      queue_status: 'RECOVERED',
      actual_recovered_amount: Number(recoveredAmount) || this.priorities[idx].expected_recovery_amount,
      recovery_check_number: checkNumber,
      recovered_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.priorities[idx] = scoreDenial(updated);
    this.saveState();
    return this.priorities[idx];
  }

  /**
   * Generates facility-level analytical KPIs.
   */
  getMetrics(facilityId = null) {
    const items = this.getAllPriorities(facilityId);

    const activeItems = items.filter(i => !['RECOVERED', 'DISMISSED_WRITE_OFF', 'EXPIRED'].includes(i.queue_status));

    const totalActive = activeItems.length;
    const totalDeniedAmount = activeItems.reduce((acc, curr) => acc + curr.denied_amount, 0);
    const totalExpectedRecovery = activeItems.reduce((acc, curr) => acc + curr.expected_recovery_amount, 0);

    const criticalHighItems = activeItems.filter(i => ['CRITICAL_URGENT', 'HIGH_PRIORITY'].includes(i.priority_tier));
    const criticalHighPipeline = criticalHighItems.reduce((acc, curr) => acc + curr.expected_recovery_amount, 0);

    const avgYieldPerHour = activeItems.length > 0
      ? activeItems.reduce((acc, curr) => acc + curr.yield_per_hour, 0) / activeItems.length
      : 0;

    const tierDistribution = {
      CRITICAL_URGENT: items.filter(i => i.priority_tier === 'CRITICAL_URGENT').length,
      HIGH_PRIORITY: items.filter(i => i.priority_tier === 'HIGH_PRIORITY').length,
      MEDIUM_PRIORITY: items.filter(i => i.priority_tier === 'MEDIUM_PRIORITY').length,
      LOW_PRIORITY: items.filter(i => i.priority_tier === 'LOW_PRIORITY').length,
      UNRECOVERABLE_HOLD: items.filter(i => i.priority_tier === 'UNRECOVERABLE_HOLD').length
    };

    const categoryDistribution = {
      CLINICAL_APPEALS: items.filter(i => i.denial_category === 'CLINICAL_APPEALS').length,
      BILLING_AND_CODING: items.filter(i => i.denial_category === 'BILLING_AND_CODING').length,
      PATIENT_ACCESS: items.filter(i => i.denial_category === 'PATIENT_ACCESS').length,
      CONTRACTING: items.filter(i => i.denial_category === 'CONTRACTING').length
    };

    return {
      totalActive,
      totalDeniedAmount: Number(totalDeniedAmount.toFixed(2)),
      totalExpectedRecovery: Number(totalExpectedRecovery.toFixed(2)),
      criticalHighPipeline: Number(criticalHighPipeline.toFixed(2)),
      avgYieldPerHour: Number(avgYieldPerHour.toFixed(2)),
      tierDistribution,
      categoryDistribution
    };
  }

  /**
   * Generates automated AI dispute strategy summary and exhibits checklist.
   */
  generateAppealStrategySummary(priorityId) {
    const item = this.getPriorityById(priorityId);
    if (!item) throw new Error(`Denial record ${priorityId} not found.`);

    const exhibits = [];
    if (item.carc_code === '50') {
      exhibits.push('Pre-operative clinical consultation notes and physical examination');
      exhibits.push('Diagnostic imaging / MRI radiologist signed report');
      exhibits.push('Surgeon Intra-operative operative transcript');
    } else if (item.carc_code === '97' || item.carc_code === '4') {
      exhibits.push('Corrected CMS-1500 / 837P claim electronic scrub file');
      exhibits.push('CCI unbundling rationale citing distinct procedural service modifier -59/-X{EPSU}');
      exhibits.push('Anatomic operative breakdown for separate operative sessions/sites');
    } else if (item.carc_code === '96') {
      exhibits.push('Manufacturer itemized invoice for surgical implant / anchor');
      exhibits.push('ASC Facility Managed Care Contract Exhibit for Rev Code 0278');
      exhibits.push('Purchase order receiving log with serial numbers');
    } else {
      exhibits.push('Payer eligibility verification screenshot on date of service');
      exhibits.push('Primary EOB / electronic remittance advice');
      exhibits.push('Timely filing electronic clearinghouse EDI 999 / 277CA acceptance log');
    }

    return {
      claimNumber: item.claim_number,
      patientName: item.patient_name,
      payerName: item.payer_name,
      cptCode: item.cpt_code,
      carcCode: item.carc_code,
      rarcCode: item.rarc_code,
      deniedAmount: item.denied_amount,
      expectedRecovery: item.expected_recovery_amount,
      priorityTier: item.priority_tier,
      yieldPerHour: item.yield_per_hour,
      recommendedStrategy: item.appeal_strategy,
      requiredExhibits: exhibits,
      appealDeadlineDaysRemaining: item.days_until_deadline,
      urgencyAssessment: item.days_until_deadline <= 7
        ? 'IMMINENT STATUTORY CLIFF: Immediate same-day filing required.'
        : 'Standard contractual dispute timeline.'
    };
  }

  resetToDefaults() {
    this.priorities = INITIAL_DENIAL_PRIORITIES.map(item => scoreDenial(item));
    this.saveState();
    return this.priorities;
  }
}

export const denialPrioritizationService = new DenialPrioritizationStore();

