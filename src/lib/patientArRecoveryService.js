/**
 * PATIENT AR RECOVERY SERVICE
 * Phase 96 — Revenue Cycle Management
 * 
 * Production service for patient out-of-pocket balance prioritization,
 * Propensity-to-Pay (P2P) risk segmentation, structured installment plans,
 * digital payment link dispatch, and charity care financial hardship evaluation.
 */

// ==============================================================================
// 1. CONSTANTS & TAXONOMY
// ==============================================================================

export const PROPENSITY_TIERS = {
  EXCELLENT_PROPENSITY: {
    code: 'EXCELLENT_PROPENSITY',
    label: 'Excellent Propensity (Tier A)',
    badgeColor: '#10b981', // Emerald
    score: 100.00,
    description: 'Flawless payment history; prompt-pay candidate with high liquid compliance.'
  },
  GOOD_PROPENSITY: {
    code: 'GOOD_PROPENSITY',
    label: 'Good Propensity (Tier B)',
    badgeColor: '#0284c7', // Sky Blue
    score: 80.00,
    description: 'Reliable payer; responds quickly to digital statement or 1-click installment offers.'
  },
  MODERATE_PROPENSITY: {
    code: 'MODERATE_PROPENSITY',
    label: 'Moderate Propensity (Tier C)',
    badgeColor: '#f59e0b', // Amber
    score: 55.00,
    description: 'Requires structured installment plan (6-12 months) or personal counselor phone prompt.'
  },
  LOW_PROPENSITY: {
    code: 'LOW_PROPENSITY',
    label: 'Low Propensity (Tier D)',
    badgeColor: '#f97316', // Orange
    score: 30.00,
    description: 'Prior missed payments or sporadic engagement; pre-delinquent warning candidate.'
  },
  CHARITY_CANDIDATE: {
    code: 'CHARITY_CANDIDATE',
    label: 'Financial Hardship / Charity',
    badgeColor: '#06b6d4', // Cyan
    score: 10.00,
    description: 'Verified or indicated low household income (<= 250% FPL); charity care eligible.'
  }
};

export const ENGAGEMENT_TIERS = {
  DIGITAL_ACTIVE: {
    code: 'DIGITAL_ACTIVE',
    label: 'Digital Active (Portal + SMS)',
    score: 100.00,
    description: 'Registered patient portal user with SMS text-to-pay opt-in enabled.'
  },
  EMAIL_VERIFIED: {
    code: 'EMAIL_VERIFIED',
    label: 'Email Verified',
    score: 75.00,
    description: 'Verified email on file; electronic statements successfully delivered.'
  },
  PHONE_VERIFIED: {
    code: 'PHONE_VERIFIED',
    label: 'Phone Verified (Voice Only)',
    score: 50.00,
    description: 'Mobile/landline phone verified; no electronic portal credentials.'
  },
  MAIL_ONLY: {
    code: 'MAIL_ONLY',
    label: 'Paper Mail Only',
    score: 25.00,
    description: 'Physical mailing address only; highest administrative friction.'
  }
};

export const RECOVERY_ACTION_TIERS = {
  TIER_1_DIGITAL_NUDGE: {
    code: 'TIER_1_DIGITAL_NUDGE',
    label: 'Tier 1: Digital Nudge',
    badgeColor: '#10b981',
    rank: 1,
    minScore: 80.00,
    action: 'Automated SMS & Email payment link with 1-click mobile checkout (Apple Pay / Google Pay).'
  },
  TIER_2_PAYMENT_PLAN_OFFER: {
    code: 'TIER_2_PAYMENT_PLAN_OFFER',
    label: 'Tier 2: Installment Plan Offer',
    badgeColor: '#0284c7',
    rank: 2,
    minScore: 65.00,
    action: 'Automated 3-to-12 month zero-interest autopay installment agreement proposal.'
  },
  TIER_3_COUNSELOR_OUTREACH: {
    code: 'TIER_3_COUNSELOR_OUTREACH',
    label: 'Tier 3: Counselor Call',
    badgeColor: '#f59e0b',
    rank: 3,
    minScore: 45.00,
    action: 'Direct phone outreach by Patient Financial Counselor for settlement or custom terms.'
  },
  TIER_4_FINAL_NOTICE: {
    code: 'TIER_4_FINAL_NOTICE',
    label: 'Tier 4: Pre-Collection Cure',
    badgeColor: '#f97316',
    rank: 4,
    minScore: 25.00,
    action: 'Statutory 30-day pre-collection formal demand letter before credit bureau reporting.'
  },
  TIER_5_BAD_DEBT_OR_CHARITY: {
    code: 'TIER_5_BAD_DEBT_OR_CHARITY',
    label: 'Tier 5: Bad Debt / Charity',
    badgeColor: '#ef4444',
    rank: 5,
    minScore: 0.00,
    action: 'Supervisor audit for charity care financial assistance write-off or third-party bad debt assignment.'
  }
};

export const CASE_STATUSES = {
  NEW_STATEMENT: { code: 'NEW_STATEMENT', label: 'New Statement Issued', color: '#64748b' },
  ENGAGED: { code: 'ENGAGED', label: 'Patient Engaged / Viewed', color: '#0284c7' },
  ON_PAYMENT_PLAN: { code: 'ON_PAYMENT_PLAN', label: 'On Payment Plan', color: '#10b981' },
  PAID_IN_FULL: { code: 'PAID_IN_FULL', label: 'Paid in Full', color: '#059669' },
  CHARITY_APPROVED: { code: 'CHARITY_APPROVED', label: 'Charity Care Approved', color: '#06b6d4' },
  BAD_DEBT_ASSIGNED: { code: 'BAD_DEBT_ASSIGNED', label: 'Bad Debt Assigned', color: '#991b1b' },
  DISPUTED: { code: 'DISPUTED', label: 'Patient Clinical Dispute', color: '#f59e0b' }
};

export const SCORING_WEIGHTS = {
  BALANCE: 0.35,
  PROPENSITY: 0.30,
  AGING_URGENCY: 0.20,
  ENGAGEMENT: 0.15
};

export const DEFAULT_PATIENT_BENCHMARK = 1000.00;

// ==============================================================================
// 2. AUTHORITATIVE DETERMINISTIC SCORING ALGORITHMS
// ==============================================================================

/**
 * Normalizes patient outstanding balance against facility benchmark ($1,000.00).
 */
export function calculatePatientBalanceScore(balance, benchmark = DEFAULT_PATIENT_BENCHMARK) {
  const b = Math.max(0, Number(balance) || 0);
  const bench = Number(benchmark) > 0 ? Number(benchmark) : DEFAULT_PATIENT_BENCHMARK;
  if (b <= 0) return 0.00;
  const score = Math.min(100.00, (b / bench) * 100.00);
  return Number(score.toFixed(2));
}

/**
 * Aging Urgency: Evaluates days elapsed since post-insurance statement issuance:
 * - 1 - 30 days: 100.00 (Fresh balance; highest cash velocity)
 * - 31 - 60 days: 85.00 (First follow-up)
 * - 61 - 90 days: 60.00 (Pre-delinquent)
 * - 91 - 120 days: 35.00 (Final notice window)
 * - > 120 days: 15.00 (Bad debt / charity audit)
 */
export function calculateAgingUrgencyScore(daysInAr) {
  const days = Math.max(0, Number(daysInAr) || 0);
  if (days <= 30) return 100.00;
  if (days <= 60) return 85.00;
  if (days <= 90) return 60.00;
  if (days <= 120) return 35.00;
  return 15.00;
}

export function calculatePropensityScore(tier) {
  const found = PROPENSITY_TIERS[tier];
  return found ? found.score : 50.00;
}

export function calculateEngagementScore(tier) {
  const found = ENGAGEMENT_TIERS[tier];
  return found ? found.score : 50.00;
}

/**
 * 4-Factor Deterministic Patient Recovery Priority Score (0.00 - 100.00):
 * PriorityScore = (Balance * 0.35) + (Propensity * 0.30) + (Urgency * 0.20) + (Engagement * 0.15)
 */
export function calculatePatientPriorityScore(balanceScore, propensityScore, urgencyScore, engagementScore) {
  const b = Math.max(0, Math.min(100, Number(balanceScore) || 0));
  const p = Math.max(0, Math.min(100, Number(propensityScore) || 0));
  const u = Math.max(0, Math.min(100, Number(urgencyScore) || 0));
  const e = Math.max(0, Math.min(100, Number(engagementScore) || 0));

  const total = (b * SCORING_WEIGHTS.BALANCE) +
                (p * SCORING_WEIGHTS.PROPENSITY) +
                (u * SCORING_WEIGHTS.AGING_URGENCY) +
                (e * SCORING_WEIGHTS.ENGAGEMENT);

  return Number(total.toFixed(2));
}

/**
 * Classifies composite score and aging days into actionable recovery action tiers.
 */
export function classifyRecoveryActionTier(priorityScore, daysInAr) {
  const days = Number(daysInAr) || 0;
  const score = Number(priorityScore) || 0;

  // Aged past 120 days with low score defaults to Tier 5
  if (days > 120 && score < 35.00) {
    return RECOVERY_ACTION_TIERS.TIER_5_BAD_DEBT_OR_CHARITY.code;
  }

  if (score >= RECOVERY_ACTION_TIERS.TIER_1_DIGITAL_NUDGE.minScore) {
    return RECOVERY_ACTION_TIERS.TIER_1_DIGITAL_NUDGE.code;
  }
  if (score >= RECOVERY_ACTION_TIERS.TIER_2_PAYMENT_PLAN_OFFER.minScore) {
    return RECOVERY_ACTION_TIERS.TIER_2_PAYMENT_PLAN_OFFER.code;
  }
  if (score >= RECOVERY_ACTION_TIERS.TIER_3_COUNSELOR_OUTREACH.minScore) {
    return RECOVERY_ACTION_TIERS.TIER_3_COUNSELOR_OUTREACH.code;
  }
  if (score >= RECOVERY_ACTION_TIERS.TIER_4_FINAL_NOTICE.minScore) {
    return RECOVERY_ACTION_TIERS.TIER_4_FINAL_NOTICE.code;
  }
  return RECOVERY_ACTION_TIERS.TIER_5_BAD_DEBT_OR_CHARITY.code;
}

/**
 * Generates exact monthly installment amount for structured payment plan.
 */
export function calculatePaymentPlanTerms(balance, installments = 6) {
  const b = Math.max(0, Number(balance) || 0);
  const count = [3, 6, 12, 18, 24].includes(Number(installments)) ? Number(installments) : 6;
  const monthly = Number((b / count).toFixed(2));
  return {
    totalAmount: b,
    installments: count,
    monthlyPayment: monthly
  };
}

/**
 * Scores a patient AR case record authoritatively.
 */
export function scorePatientArRecord(record, benchmark = DEFAULT_PATIENT_BENCHMARK) {
  const originalPR = Math.max(0, Number(record.original_patient_resp) || 0);
  const patientPaid = Math.max(0, Number(record.patient_paid_amount) || 0);
  const charityAdjustment = Math.max(0, Number(record.charity_write_off_amount) || 0);
  const balanceDue = record.case_status === 'CHARITY_APPROVED'
    ? 0.00
    : Math.max(0, Number((originalPR - patientPaid - charityAdjustment).toFixed(2)));

  const daysInAr = Math.max(0, Number(record.days_in_patient_ar) || 0);
  const p2pTier = record.propensity_to_pay_tier || 'MODERATE_PROPENSITY';
  const engTier = record.engagement_tier || 'DIGITAL_ACTIVE';

  const balanceScore = calculatePatientBalanceScore(balanceDue, benchmark);
  const propensityScore = calculatePropensityScore(p2pTier);
  const urgencyScore = calculateAgingUrgencyScore(daysInAr);
  const engagementScore = calculateEngagementScore(engTier);

  const priorityScore = calculatePatientPriorityScore(balanceScore, propensityScore, urgencyScore, engagementScore);
  const actionTier = classifyRecoveryActionTier(priorityScore, daysInAr);

  return {
    ...record,
    patient_balance_due: balanceDue,
    balance_score: balanceScore,
    propensity_score: propensityScore,
    urgency_score: urgencyScore,
    engagement_score: engagementScore,
    priority_score: priorityScore,
    recovery_action_tier: actionTier,
    updated_at: new Date().toISOString()
  };
}

// ==============================================================================
// 3. BASELINE REALISTIC PATIENT AR DATASET
// ==============================================================================

const INITIAL_PATIENT_AR_CASES = [
  {
    id: 'par-001',
    organization_id: 'org-asc-01',
    facility_id: 'fac-surgical-01',
    claim_id: 'clm-8801',
    claim_number: 'CLM-2026-08801',
    patient_id: 'pat-101',
    patient_name: 'Arthur Pendelton',
    patient_mrn: 'MRN-10192',
    patient_phone: '(555) 234-8891',
    patient_email: 'arthur.pendelton@example.com',
    cpt_code: '29888',
    procedure_name: 'Arthroscopic ACL Reconstruction with Meniscal Repair',
    date_of_service: '2026-10-12',
    statement_date: '2026-10-28',
    days_in_patient_ar: 14,
    total_charges: 6500.00,
    insurance_paid_amount: 4250.00,
    contractual_adjustment: 1400.00,
    original_patient_resp: 850.00,
    patient_paid_amount: 0.00,
    propensity_to_pay_tier: 'EXCELLENT_PROPENSITY',
    engagement_tier: 'DIGITAL_ACTIVE',
    case_status: 'NEW_STATEMENT',
    payment_plan_id: null,
    is_charity_screened: false,
    assigned_counselor_id: null,
    assigned_counselor_name: null,
    notes: 'Fresh statement. Digital portal registered and SMS payment link delivered.'
  },
  {
    id: 'par-002',
    organization_id: 'org-asc-01',
    facility_id: 'fac-surgical-01',
    claim_id: 'clm-8802',
    claim_number: 'CLM-2026-08802',
    patient_id: 'pat-102',
    patient_name: 'Eleanor Vance',
    patient_mrn: 'MRN-20419',
    patient_phone: '(555) 441-2901',
    patient_email: 'eleanor.vance@example.com',
    cpt_code: '27447',
    procedure_name: 'Total Knee Arthroplasty with Cruciate-Retaining Implant',
    date_of_service: '2026-09-28',
    statement_date: '2026-10-14',
    days_in_patient_ar: 28,
    total_charges: 11200.00,
    insurance_paid_amount: 7240.00,
    contractual_adjustment: 2400.00,
    original_patient_resp: 1560.00,
    patient_paid_amount: 0.00,
    propensity_to_pay_tier: 'GOOD_PROPENSITY',
    engagement_tier: 'DIGITAL_ACTIVE',
    case_status: 'ENGAGED',
    payment_plan_id: null,
    is_charity_screened: false,
    assigned_counselor_id: 'usr-coun-01',
    assigned_counselor_name: 'Sarah Jenkins, CPC',
    notes: 'Large post-insurance surgical balance. Highly qualified for 6-month zero-interest autopay installment agreement.'
  },
  {
    id: 'par-003',
    organization_id: 'org-asc-01',
    facility_id: 'fac-surgical-01',
    claim_id: 'clm-8803',
    claim_number: 'CLM-2026-08803',
    patient_id: 'pat-103',
    patient_name: 'Marcus Brody',
    patient_mrn: 'MRN-33912',
    patient_phone: '(555) 882-1940',
    patient_email: 'marcus.brody@example.com',
    cpt_code: '29827',
    procedure_name: 'Arthroscopic Rotator Cuff Repair',
    date_of_service: '2026-09-10',
    statement_date: '2026-09-27',
    days_in_patient_ar: 45,
    total_charges: 4800.00,
    insurance_paid_amount: 3200.00,
    contractual_adjustment: 900.00,
    original_patient_resp: 700.00,
    patient_paid_amount: 0.00,
    propensity_to_pay_tier: 'MODERATE_PROPENSITY',
    engagement_tier: 'PHONE_VERIFIED',
    case_status: 'NEW_STATEMENT',
    payment_plan_id: null,
    is_charity_screened: false,
    assigned_counselor_id: null,
    assigned_counselor_name: null,
    notes: 'Day 45 reminder window. Mobile verified. Recommend structured 3-month payment plan proposal.'
  },
  {
    id: 'par-004',
    organization_id: 'org-asc-01',
    facility_id: 'fac-surgical-01',
    claim_id: 'clm-8804',
    claim_number: 'CLM-2026-08804',
    patient_id: 'pat-104',
    patient_name: 'Dorothy Gale',
    patient_mrn: 'MRN-44102',
    patient_phone: '(555) 912-3341',
    patient_email: 'dorothy.gale@example.com',
    cpt_code: '66984',
    procedure_name: 'Cataract Extraction with IOL Insertion',
    date_of_service: '2026-08-15',
    statement_date: '2026-08-28',
    days_in_patient_ar: 75,
    total_charges: 2400.00,
    insurance_paid_amount: 1600.00,
    contractual_adjustment: 400.00,
    original_patient_resp: 400.00,
    patient_paid_amount: 0.00,
    propensity_to_pay_tier: 'MODERATE_PROPENSITY',
    engagement_tier: 'EMAIL_VERIFIED',
    case_status: 'NEW_STATEMENT',
    payment_plan_id: null,
    is_charity_screened: false,
    assigned_counselor_id: null,
    assigned_counselor_name: null,
    notes: 'Aged 75 days in AR. Email opened twice but unpaid. Scheduled for personal counselor telephone outreach.'
  },
  {
    id: 'par-005',
    organization_id: 'org-asc-01',
    facility_id: 'fac-surgical-01',
    claim_id: 'clm-8805',
    claim_number: 'CLM-2026-08805',
    patient_id: 'pat-105',
    patient_name: 'Tobias Funke',
    patient_mrn: 'MRN-55291',
    patient_phone: '(555) 301-4492',
    patient_email: 'tobias.funke@example.com',
    cpt_code: '63030',
    procedure_name: 'Lumbar Laminotomy with Decompression',
    date_of_service: '2026-07-18',
    statement_date: '2026-07-29',
    days_in_patient_ar: 105,
    total_charges: 5200.00,
    insurance_paid_amount: 2800.00,
    contractual_adjustment: 600.00,
    original_patient_resp: 1800.00,
    patient_paid_amount: 0.00,
    propensity_to_pay_tier: 'LOW_PROPENSITY',
    engagement_tier: 'PHONE_VERIFIED',
    case_status: 'ENGAGED',
    payment_plan_id: null,
    is_charity_screened: false,
    assigned_counselor_id: 'usr-coun-02',
    assigned_counselor_name: 'Michael Torres, RHIA',
    notes: 'Aged 105 days. Delinquent notice sent. Pre-collection statutory 30-day cure warning issued.'
  },
  {
    id: 'par-006',
    organization_id: 'org-asc-01',
    facility_id: 'fac-surgical-01',
    claim_id: 'clm-8806',
    claim_number: 'CLM-2026-08806',
    patient_id: 'pat-106',
    patient_name: 'Lucille Bluth',
    patient_mrn: 'MRN-66401',
    patient_phone: '(555) 773-1920',
    patient_email: null,
    cpt_code: '45380',
    procedure_name: 'Diagnostic Colonoscopy with Polypectomy',
    date_of_service: '2026-06-15',
    statement_date: '2026-06-29',
    days_in_patient_ar: 135,
    total_charges: 1800.00,
    insurance_paid_amount: 1120.00,
    contractual_adjustment: 400.00,
    original_patient_resp: 280.00,
    patient_paid_amount: 0.00,
    propensity_to_pay_tier: 'LOW_PROPENSITY',
    engagement_tier: 'MAIL_ONLY',
    case_status: 'NEW_STATEMENT',
    payment_plan_id: null,
    is_charity_screened: true,
    assigned_counselor_id: null,
    assigned_counselor_name: null,
    notes: 'Aged > 120 days. Four statements mailed without response. Supervisor audit required for bad debt agency transfer.'
  },
  {
    id: 'par-007',
    organization_id: 'org-asc-01',
    facility_id: 'fac-surgical-01',
    claim_id: 'clm-8807',
    claim_number: 'CLM-2026-08807',
    patient_id: 'pat-107',
    patient_name: 'Gob Bluth',
    patient_mrn: 'MRN-77192',
    patient_phone: '(555) 662-8819',
    patient_email: 'gob.bluth@example.com',
    cpt_code: '64721',
    procedure_name: 'Carpal Tunnel Neuroplasty',
    date_of_service: '2026-09-02',
    statement_date: '2026-09-22',
    days_in_patient_ar: 50,
    total_charges: 2800.00,
    insurance_paid_amount: 1750.00,
    contractual_adjustment: 400.00,
    original_patient_resp: 650.00,
    patient_paid_amount: 0.00,
    propensity_to_pay_tier: 'CHARITY_CANDIDATE',
    engagement_tier: 'DIGITAL_ACTIVE',
    case_status: 'NEW_STATEMENT',
    payment_plan_id: null,
    is_charity_screened: false,
    assigned_counselor_id: null,
    assigned_counselor_name: null,
    notes: 'Verified low income (180% FPL). Protected from collection agency dispatch; qualified for 100% facility charity care write-off.'
  },
  {
    id: 'par-008',
    organization_id: 'org-asc-01',
    facility_id: 'fac-surgical-01',
    claim_id: 'clm-8808',
    claim_number: 'CLM-2026-08808',
    patient_id: 'pat-108',
    patient_name: 'George Michael',
    patient_mrn: 'MRN-88190',
    patient_phone: '(555) 440-1922',
    patient_email: 'george.michael@example.com',
    cpt_code: '62321',
    procedure_name: 'Cervical Epidural Steroid Injection',
    date_of_service: '2026-10-01',
    statement_date: '2026-10-22',
    days_in_patient_ar: 20,
    total_charges: 1500.00,
    insurance_paid_amount: 900.00,
    contractual_adjustment: 0.00,
    original_patient_resp: 600.00,
    patient_paid_amount: 200.00,
    propensity_to_pay_tier: 'EXCELLENT_PROPENSITY',
    engagement_tier: 'DIGITAL_ACTIVE',
    case_status: 'ON_PAYMENT_PLAN',
    payment_plan_id: 'plan-001',
    is_charity_screened: false,
    assigned_counselor_id: 'usr-coun-01',
    assigned_counselor_name: 'Sarah Jenkins, CPC',
    notes: 'Enrolled in 6-month autopay installment plan ($100/mo). Installments 1 & 2 received on schedule.'
  }
];

const INITIAL_PAYMENT_PLANS = [
  {
    id: 'plan-001',
    facility_id: 'fac-surgical-01',
    case_id: 'par-008',
    patient_id: 'pat-108',
    patient_name: 'George Michael',
    plan_total_amount: 600.00,
    installment_count: 6,
    monthly_payment_amount: 100.00,
    autopay_enrolled: true,
    start_date: '2026-10-22',
    next_payment_date: '2026-11-22',
    total_paid_to_date: 200.00,
    remaining_plan_balance: 400.00,
    plan_status: 'ACTIVE'
  }
];

// ==============================================================================
// 4. PATIENT AR STORE & SERVICE CLASS
// ==============================================================================

export class PatientArRecoveryStore {
  constructor() {
    this.storageKeyCases = 'ascanalyst_patient_ar_cases_v1';
    this.storageKeyPlans = 'ascanalyst_patient_ar_plans_v1';
    this.cases = this.loadCases();
    this.plans = this.loadPlans();
  }

  loadCases() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(this.storageKeyCases);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.map(c => scorePatientArRecord(c));
          }
        }
      }
    } catch {
      // Fallback
    }
    return INITIAL_PATIENT_AR_CASES.map(c => scorePatientArRecord(c));
  }

  loadPlans() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(this.storageKeyPlans);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      }
    } catch {
      // Fallback
    }
    return [...INITIAL_PAYMENT_PLANS];
  }

  saveState() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(this.storageKeyCases, JSON.stringify(this.cases));
        window.localStorage.setItem(this.storageKeyPlans, JSON.stringify(this.plans));
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Returns all cases sorted according to Rule 4 Invariant:
   * 1. Action Tier ASC (Tier 1 first)
   * 2. Balance Due DESC
   * 3. Days in AR ASC
   */
  getAllCases(facilityId = null, filters = {}) {
    let list = this.cases.map(c => scorePatientArRecord(c));

    if (facilityId) {
      list = list.filter(c => c.facility_id === facilityId);
    }

    if (filters.tier && filters.tier !== 'ALL') {
      list = list.filter(c => c.recovery_action_tier === filters.tier);
    }

    if (filters.status && filters.status !== 'ALL') {
      list = list.filter(c => c.case_status === filters.status);
    }

    if (filters.p2p && filters.p2p !== 'ALL') {
      list = list.filter(c => c.propensity_to_pay_tier === filters.p2p);
    }

    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(c =>
        c.claim_number.toLowerCase().includes(q) ||
        c.patient_name.toLowerCase().includes(q) ||
        c.patient_mrn.toLowerCase().includes(q) ||
        c.cpt_code.toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) => {
      const rankA = RECOVERY_ACTION_TIERS[a.recovery_action_tier]?.rank || 5;
      const rankB = RECOVERY_ACTION_TIERS[b.recovery_action_tier]?.rank || 5;
      if (rankA !== rankB) return rankA - rankB;
      if (b.patient_balance_due !== a.patient_balance_due) {
        return b.patient_balance_due - a.patient_balance_due;
      }
      return a.days_in_patient_ar - b.days_in_patient_ar;
    });
  }

  getCaseById(id) {
    const found = this.cases.find(c => c.id === id);
    return found ? scorePatientArRecord(found) : null;
  }

  getPaymentPlans(facilityId = null) {
    if (facilityId) {
      return this.plans.filter(p => p.facility_id === facilityId);
    }
    return [...this.plans];
  }

  sendDigitalNudge(caseId, channel = 'SMS_AND_EMAIL') {
    const idx = this.cases.findIndex(c => c.id === caseId);
    if (idx === -1) throw new Error(`Patient AR Case ${caseId} not found.`);

    const updated = {
      ...this.cases[idx],
      case_status: 'ENGAGED',
      last_contact_date: new Date().toISOString(),
      nudge_channel: channel,
      updated_at: new Date().toISOString()
    };

    this.cases[idx] = scorePatientArRecord(updated);
    this.saveState();
    return this.cases[idx];
  }

  setupPaymentPlan(caseId, installments = 6, autopay = true) {
    const idx = this.cases.findIndex(c => c.id === caseId);
    if (idx === -1) throw new Error(`Patient AR Case ${caseId} not found.`);

    const c = this.cases[idx];
    const terms = calculatePaymentPlanTerms(c.patient_balance_due, installments);

    const newPlanId = `plan-${Date.now()}`;
    const newPlan = {
      id: newPlanId,
      facility_id: c.facility_id,
      case_id: c.id,
      patient_id: c.patient_id,
      patient_name: c.patient_name,
      plan_total_amount: terms.totalAmount,
      installment_count: terms.installments,
      monthly_payment_amount: terms.monthlyPayment,
      autopay_enrolled: Boolean(autopay),
      start_date: new Date().toISOString().slice(0, 10),
      next_payment_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      total_paid_to_date: 0.00,
      remaining_plan_balance: terms.totalAmount,
      plan_status: 'ACTIVE',
      created_at: new Date().toISOString()
    };

    this.plans.push(newPlan);

    const updated = {
      ...c,
      case_status: 'ON_PAYMENT_PLAN',
      payment_plan_id: newPlanId,
      updated_at: new Date().toISOString()
    };

    this.cases[idx] = scorePatientArRecord(updated);
    this.saveState();
    return { updatedCase: this.cases[idx], newPlan };
  }

  recordPatientPayment(caseId, paymentAmount, paymentMethod = 'CREDIT_CARD_ONLINE') {
    const idx = this.cases.findIndex(c => c.id === caseId);
    if (idx === -1) throw new Error(`Patient AR Case ${caseId} not found.`);

    const amt = Number(paymentAmount) || 0;
    if (amt <= 0) throw new Error('Payment amount must be greater than zero.');

    const c = this.cases[idx];
    const newPaid = Number((c.patient_paid_amount + amt).toFixed(2));
    const newBalance = Math.max(0, Number((c.original_patient_resp - newPaid).toFixed(2)));

    let newStatus = c.case_status;
    if (newBalance === 0) {
      newStatus = 'PAID_IN_FULL';
    }

    // Update payment plan if exists
    if (c.payment_plan_id) {
      const planIdx = this.plans.findIndex(p => p.id === c.payment_plan_id);
      if (planIdx !== -1) {
        const p = this.plans[planIdx];
        const planPaid = Number((p.total_paid_to_date + amt).toFixed(2));
        const planRem = Math.max(0, Number((p.plan_total_amount - planPaid).toFixed(2)));
        this.plans[planIdx] = {
          ...p,
          total_paid_to_date: planPaid,
          remaining_plan_balance: planRem,
          plan_status: planRem === 0 ? 'COMPLETED' : 'ACTIVE'
        };
      }
    }

    const updated = {
      ...c,
      patient_paid_amount: newPaid,
      patient_balance_due: newBalance,
      case_status: newStatus,
      last_payment_date: new Date().toISOString(),
      last_payment_method: paymentMethod,
      updated_at: new Date().toISOString()
    };

    this.cases[idx] = scorePatientArRecord(updated);
    this.saveState();
    return this.cases[idx];
  }

  approveCharityCare(caseId, supervisorId, supervisorName, fplPercentage = 180, reasonNotes = '') {
    const idx = this.cases.findIndex(c => c.id === caseId);
    if (idx === -1) throw new Error(`Patient AR Case ${caseId} not found.`);

    if (!reasonNotes || reasonNotes.trim().length < 8) {
      throw new Error('Formal documented charity care justification notes are required.');
    }

    const c = this.cases[idx];
    const updated = {
      ...c,
      case_status: 'CHARITY_APPROVED',
      patient_balance_due: 0.00,
      charity_write_off_amount: c.patient_balance_due,
      is_charity_screened: true,
      charity_supervisor_id: supervisorId,
      charity_supervisor_name: supervisorName,
      charity_fpl_pct: fplPercentage,
      charity_notes: reasonNotes,
      charity_approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.cases[idx] = scorePatientArRecord(updated);
    this.saveState();
    return this.cases[idx];
  }

  assignBadDebt(caseId, agencyName, supervisorId, reasonNotes) {
    const idx = this.cases.findIndex(c => c.id === caseId);
    if (idx === -1) throw new Error(`Patient AR Case ${caseId} not found.`);

    if (!reasonNotes || reasonNotes.trim().length < 8) {
      throw new Error('Documented bad debt transfer authorization is mandatory.');
    }

    const c = this.cases[idx];
    const updated = {
      ...c,
      case_status: 'BAD_DEBT_ASSIGNED',
      collection_agency_name: agencyName,
      bad_debt_supervisor_id: supervisorId,
      bad_debt_notes: reasonNotes,
      bad_debt_assigned_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.cases[idx] = scorePatientArRecord(updated);
    this.saveState();
    return this.cases[idx];
  }

  getMetrics(facilityId = null) {
    const all = this.getAllCases(facilityId);
    const active = all.filter(c => !['PAID_IN_FULL', 'CHARITY_APPROVED', 'BAD_DEBT_ASSIGNED'].includes(c.case_status));

    const activeAccountsCount = active.length;
    const totalBalanceDue = active.reduce((acc, c) => acc + c.patient_balance_due, 0);

    const plans = this.getPaymentPlans(facilityId);
    const activePlans = plans.filter(p => p.plan_status === 'ACTIVE');
    const activePlansValue = activePlans.reduce((acc, p) => acc + p.remaining_plan_balance, 0);

    const avgDaysInAr = active.length > 0
      ? active.reduce((acc, c) => acc + c.days_in_patient_ar, 0) / active.length
      : 0;

    const recoveredCashMtd = all.reduce((acc, c) => acc + c.patient_paid_amount, 0);

    const tierDistribution = {
      TIER_1_DIGITAL_NUDGE: all.filter(c => c.recovery_action_tier === 'TIER_1_DIGITAL_NUDGE').length,
      TIER_2_PAYMENT_PLAN_OFFER: all.filter(c => c.recovery_action_tier === 'TIER_2_PAYMENT_PLAN_OFFER').length,
      TIER_3_COUNSELOR_OUTREACH: all.filter(c => c.recovery_action_tier === 'TIER_3_COUNSELOR_OUTREACH').length,
      TIER_4_FINAL_NOTICE: all.filter(c => c.recovery_action_tier === 'TIER_4_FINAL_NOTICE').length,
      TIER_5_BAD_DEBT_OR_CHARITY: all.filter(c => c.recovery_action_tier === 'TIER_5_BAD_DEBT_OR_CHARITY').length
    };

    const statusDistribution = {
      NEW_STATEMENT: all.filter(c => c.case_status === 'NEW_STATEMENT').length,
      ENGAGED: all.filter(c => c.case_status === 'ENGAGED').length,
      ON_PAYMENT_PLAN: all.filter(c => c.case_status === 'ON_PAYMENT_PLAN').length,
      PAID_IN_FULL: all.filter(c => c.case_status === 'PAID_IN_FULL').length,
      CHARITY_APPROVED: all.filter(c => c.case_status === 'CHARITY_APPROVED').length,
      BAD_DEBT_ASSIGNED: all.filter(c => c.case_status === 'BAD_DEBT_ASSIGNED').length
    };

    return {
      activeAccountsCount,
      totalBalanceDue: Number(totalBalanceDue.toFixed(2)),
      activePlansValue: Number(activePlansValue.toFixed(2)),
      avgDaysInAr: Number(avgDaysInAr.toFixed(1)),
      recoveredCashMtd: Number(recoveredCashMtd.toFixed(2)),
      tierDistribution,
      statusDistribution
    };
  }

  resetToDefaults() {
    this.cases = INITIAL_PATIENT_AR_CASES.map(c => scorePatientArRecord(c));
    this.plans = [...INITIAL_PAYMENT_PLANS];
    this.saveState();
    return { cases: this.cases, plans: this.plans };
  }
}

export const patientArRecoveryService = new PatientArRecoveryStore();
