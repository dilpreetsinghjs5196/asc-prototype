/**
 * ASC Unbilled Case Detection Engine Service
 * Phase 91: Completed/Coded but Unbilled Case Detection, Root-Cause Diagnosis & Timely Filing
 * 
 * Automated detection of completed surgical encounters with unbilled charges,
 * aging bucket analysis, timely filing risk tiering, and resolution workflow state machine.
 */

// 1. Unbilled Hold Reasons Taxonomy
export const HOLD_REASONS = {
  IMPLANT_INVOICE_LAG: {
    id: 'IMPLANT_INVOICE_LAG',
    label: 'Implant Invoice Lag',
    badgeClass: 'bg-rose-950/40 text-rose-300 border-rose-800',
    colorToken: 'rose',
    description: 'Hardware consumed in OR, but billing held pending vendor delivery invoice verification.'
  },
  PHYSICIAN_QUERY_PENDING: {
    id: 'PHYSICIAN_QUERY_PENDING',
    label: 'Physician Query Pending',
    badgeClass: 'bg-amber-950/40 text-amber-300 border-amber-800',
    colorToken: 'amber',
    description: 'Operative note deficiency, missing surgeon signature, or coding query awaiting physician response.'
  },
  PATHOLOGY_PENDING: {
    id: 'PATHOLOGY_PENDING',
    label: 'Pathology Report Pending',
    badgeClass: 'bg-sky-950/40 text-sky-300 border-sky-800',
    colorToken: 'sky',
    description: 'Biopsy or tissue specimen awaiting pathology histology diagnosis for definitive ICD-10 coding.'
  },
  AUTH_RETRO_PENDING: {
    id: 'AUTH_RETRO_PENDING',
    label: 'Prior Auth / Retro-Auth Pending',
    badgeClass: 'bg-cyan-950/40 text-cyan-300 border-cyan-800',
    colorToken: 'cyan',
    description: 'Prior authorization number missing; retro-authorization or commercial appeal in progress.'
  },
  COB_VALIDATION: {
    id: 'COB_VALIDATION',
    label: 'Coordination of Benefits (COB)',
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
    colorToken: 'slate',
    description: 'Primary commercial vs. Medicare/Medicaid subscriber order unresolved.'
  },
  BILLING_SCRUB_ERROR: {
    id: 'BILLING_SCRUB_ERROR',
    label: 'Pre-Bill Scrub Error',
    badgeClass: 'bg-amber-950/50 text-amber-200 border-amber-700',
    colorToken: 'amber',
    description: 'Claim failed pre-submission clearinghouse rules (invalid NPI, missing ZIP+4, NCCI edit).'
  },
  READY_TO_RELEASE: {
    id: 'READY_TO_RELEASE',
    label: 'Ready to Release',
    badgeClass: 'bg-emerald-950/40 text-emerald-300 border-emerald-800',
    colorToken: 'emerald',
    description: 'All holds resolved and charges validated; ready for electronic clearinghouse batch release.'
  }
};

// 2. Unbilled Case Lifecycle Statuses
export const UNBILLED_STATUSES = {
  HELD: {
    id: 'HELD',
    label: 'Held in Queue',
    badgeClass: 'bg-rose-950/40 text-rose-300 border-rose-800',
    colorToken: 'rose',
    description: 'Billing release blocked by an active clinical, documentation, or pricing hold.'
  },
  UNDER_INVESTIGATION: {
    id: 'UNDER_INVESTIGATION',
    label: 'Under Audit / Investigation',
    badgeClass: 'bg-sky-950/40 text-sky-400 border-sky-800',
    colorToken: 'sky',
    description: 'Assigned to billing specialist or coding auditor actively resolving hold.'
  },
  HOLD_RESOLVED: {
    id: 'HOLD_RESOLVED',
    label: 'Hold Resolved (Ready)',
    badgeClass: 'bg-amber-950/50 text-amber-300 border-amber-700 font-semibold',
    colorToken: 'amber',
    description: 'Missing item attached or query answered; queued for immediate clearinghouse transmission.'
  },
  CLAIM_RELEASED: {
    id: 'CLAIM_RELEASED',
    label: 'Claim Released to Biller',
    badgeClass: 'bg-emerald-950/40 text-emerald-400 border-emerald-800 font-bold',
    colorToken: 'emerald',
    description: 'Electronic 837 claim successfully generated and transmitted to clearinghouse.'
  },
  WRITTEN_OFF_TIMELY_FILING: {
    id: 'WRITTEN_OFF_TIMELY_FILING',
    label: 'Expired (Timely Filing Loss)',
    badgeClass: 'bg-slate-800/80 text-slate-400 border-slate-700',
    colorToken: 'slate',
    description: 'Payer statutory filing deadline elapsed prior to release; authorized uncollectable write-off.'
  }
};

// 3. Timely Filing Risk Tiers
export const TIMELY_FILING_RISK_TIERS = {
  CRITICAL: {
    id: 'CRITICAL',
    label: 'Critical Risk (≤15d)',
    badgeClass: 'bg-rose-950/60 text-rose-300 border-rose-700 font-bold',
    colorToken: 'rose',
    maxDaysRemaining: 15
  },
  URGENT: {
    id: 'URGENT',
    label: 'Urgent (16-30d)',
    badgeClass: 'bg-amber-950/50 text-amber-300 border-amber-700 font-semibold',
    colorToken: 'amber',
    maxDaysRemaining: 30
  },
  WARNING: {
    id: 'WARNING',
    label: 'Warning (31-60d)',
    badgeClass: 'bg-sky-950/40 text-sky-300 border-sky-800',
    colorToken: 'sky',
    maxDaysRemaining: 60
  },
  NORMAL: {
    id: 'NORMAL',
    label: 'Normal (>60d)',
    badgeClass: 'bg-emerald-950/30 text-emerald-400 border-emerald-800',
    colorToken: 'emerald',
    maxDaysRemaining: 999
  }
};

// 4. Aging Buckets Taxonomy
export const AGING_BUCKETS = {
  '0_15_DAYS': { id: '0_15_DAYS', label: '0–15 Days (Current)', min: 0, max: 15 },
  '16_30_DAYS': { id: '16_30_DAYS', label: '16–30 Days (Elevated)', min: 16, max: 30 },
  '31_60_DAYS': { id: '31_60_DAYS', label: '31–60 Days (Stale)', min: 31, max: 60 },
  '61_PLUS_DAYS': { id: '61_PLUS_DAYS', label: '61+ Days (Critical TFL)', min: 61, max: 9999 }
};

// 5. Deterministic Calculations

/**
 * Calculates days unbilled since date of surgery
 */
export function calculateDaysUnbilled(dateOfService, referenceDate = new Date()) {
  if (!dateOfService) return 0;
  const dos = new Date(dateOfService);
  const ref = new Date(referenceDate);
  const diff = ref.getTime() - dos.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

/**
 * Calculates days remaining until timely filing deadline
 */
export function calculateDaysRemaining(filingDeadline, referenceDate = new Date()) {
  if (!filingDeadline) return 90;
  const deadline = new Date(filingDeadline);
  const ref = new Date(referenceDate);
  const diff = deadline.getTime() - ref.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/**
 * Classifies timely filing risk tier based on days remaining
 */
export function calculateTimelyFilingRiskTier(daysRemaining) {
  if (daysRemaining <= 15) return 'CRITICAL';
  if (daysRemaining <= 30) return 'URGENT';
  if (daysRemaining <= 60) return 'WARNING';
  return 'NORMAL';
}

/**
 * Computes composite unbilled priority score (0.00 - 100.00):
 * - Dollar magnitude weight (40%): min(40.0, (expected / 10000) * 40.0)
 * - Days unbilled lag weight (35%): min(35.0, (days / 60) * 35.0)
 * - Filing urgency weight (25%):
 *     days <= 15: 25.0
 *     days <= 30: 18.0
 *     days <= 60: 10.0
 *     days > 60: 5.0
 */
export function calculatePriorityScore(expectedAmount, daysUnbilled, daysRemaining) {
  const exp = Number(expectedAmount) || 0.0;
  const days = Number(daysUnbilled) || 0;
  const rem = typeof daysRemaining === 'number' ? daysRemaining : 90;

  const dollarWeight = Math.min(40.0, (exp / 10000.00) * 40.0);
  const lagWeight = Math.min(35.0, (days / 60.0) * 35.0);

  let urgencyWeight = 5.0;
  if (rem <= 15) urgencyWeight = 25.0;
  else if (rem <= 30) urgencyWeight = 18.0;
  else if (rem <= 60) urgencyWeight = 10.0;

  const total = dollarWeight + lagWeight + urgencyWeight;
  return Number(Math.min(100.0, Math.max(0.0, total)).toFixed(2));
}

// 6. Baseline Unbilled Cases Dataset
export const BASELINE_UNBILLED_CASES = [
  {
    id: 'unbill-001',
    facility_id: 'fac-main-001',
    case_number: 'CASE-2026-10492',
    surgery_id: 10492,
    patient_id: 8601,
    patient_name: 'Arthur Pendelton',
    surgeon_name: 'Dr. Gardner Paul',
    specialty: 'Orthopedics',
    procedure_name: 'Total Knee Arthroplasty (27447)',
    primary_cpt: '27447',
    payer_name: 'Aetna Commercial',
    payer_type: 'COMMERCIAL',
    date_of_service: '2026-10-14',
    coded_date: '2026-10-16',
    total_charges: 18450.00,
    expected_reimbursement: 6850.00,
    hold_reason: 'IMPLANT_INVOICE_LAG',
    unbilled_status: 'HELD',
    filing_deadline: '2027-01-12',
    resolution_notes: 'Stryker Triathlon implant consumption logged in OR. Awaiting rep pricing invoice upload before claim release.',
    assigned_to: 'user-biller-01'
  },
  {
    id: 'unbill-002',
    facility_id: 'fac-main-001',
    case_number: 'CASE-2026-10385',
    surgery_id: 10385,
    patient_id: 8540,
    patient_name: 'Beatrice Lawson',
    surgeon_name: 'Dr. Bonett Andrew',
    specialty: 'Spine Surgery',
    procedure_name: 'Lumbar Microdiscectomy (63030)',
    primary_cpt: '63030',
    payer_name: 'UnitedHealthcare',
    payer_type: 'COMMERCIAL',
    date_of_service: '2026-09-22',
    coded_date: '2026-09-24',
    total_charges: 14200.00,
    expected_reimbursement: 5400.00,
    hold_reason: 'PHYSICIAN_QUERY_PENDING',
    unbilled_status: 'UNDER_INVESTIGATION',
    filing_deadline: '2026-12-21',
    resolution_notes: 'Query sent to Dr. Bonett for clarification on bilateral nerve decompression wording in dictation.',
    assigned_to: 'user-coder-02'
  },
  {
    id: 'unbill-003',
    facility_id: 'fac-main-001',
    case_number: 'CASE-2026-10210',
    surgery_id: 10210,
    patient_id: 8412,
    patient_name: 'Cynthia Gomez',
    surgeon_name: 'Dr. Malinoski Kelly',
    specialty: 'Orthopedics',
    procedure_name: 'Shoulder Arthroscopy w/ Decompression (29824)',
    primary_cpt: '29824',
    payer_name: 'Blue Cross Blue Shield',
    payer_type: 'COMMERCIAL',
    date_of_service: '2026-08-28',
    coded_date: '2026-08-30',
    total_charges: 11800.00,
    expected_reimbursement: 4100.00,
    hold_reason: 'AUTH_RETRO_PENDING',
    unbilled_status: 'HELD',
    filing_deadline: '2026-11-26', // Under 20 days remaining!
    resolution_notes: 'CRITICAL: Commercial 90-day filing expires Nov 26. Pre-auth discrepancy on secondary debridement. Retro-auth appeal initiated.',
    assigned_to: 'user-lead-rcm'
  },
  {
    id: 'unbill-004',
    facility_id: 'fac-main-001',
    case_number: 'CASE-2026-10515',
    surgery_id: 10515,
    patient_id: 8622,
    patient_name: 'Daniel Craig',
    surgeon_name: 'Dr. Walsh Mark',
    specialty: 'Ophthalmology',
    procedure_name: 'Cataract Extraction w/ IOL (66984)',
    primary_cpt: '66984',
    payer_name: 'Medicare Part B',
    payer_type: 'MEDICARE',
    date_of_service: '2026-11-04',
    coded_date: '2026-11-05',
    total_charges: 4200.00,
    expected_reimbursement: 1950.00,
    hold_reason: 'READY_TO_RELEASE',
    unbilled_status: 'HOLD_RESOLVED',
    filing_deadline: '2027-11-04',
    resolution_notes: 'Premium Toric IOL patient upgrade signed. All codes scrubbed clean. Queued for batch EDI 837 transmission.',
    assigned_to: 'user-biller-01'
  },
  {
    id: 'unbill-005',
    facility_id: 'fac-main-001',
    case_number: 'CASE-2026-10440',
    surgery_id: 10440,
    patient_id: 8580,
    patient_name: 'Evelyn Reed',
    surgeon_name: 'Dr. Baccaro Leopoldo',
    specialty: 'General Surgery',
    procedure_name: 'Laparoscopic Inguinal Hernia (49505)',
    primary_cpt: '49505',
    payer_name: 'Cigna Healthcare',
    payer_type: 'COMMERCIAL',
    date_of_service: '2026-10-02',
    coded_date: '2026-10-04',
    total_charges: 9600.00,
    expected_reimbursement: 3750.00,
    hold_reason: 'BILLING_SCRUB_ERROR',
    unbilled_status: 'HELD',
    filing_deadline: '2026-12-31',
    resolution_notes: 'Missing referring provider ZIP+4 code in box 17b. Corrected address requested from physician office.',
    assigned_to: 'user-biller-03'
  },
  {
    id: 'unbill-006',
    facility_id: 'fac-main-001',
    case_number: 'CASE-2026-10118',
    surgery_id: 10118,
    patient_id: 8320,
    patient_name: 'Frank Sinatra Jr.',
    surgeon_name: 'Dr. Gardner Paul',
    specialty: 'Orthopedics',
    procedure_name: 'ACL Reconstruction (29888)',
    primary_cpt: '29888',
    payer_name: 'Humana Commercial',
    payer_type: 'COMMERCIAL',
    date_of_service: '2026-08-18',
    coded_date: '2026-08-20',
    total_charges: 13500.00,
    expected_reimbursement: 4900.00,
    hold_reason: 'IMPLANT_INVOICE_LAG',
    unbilled_status: 'HELD',
    filing_deadline: '2026-11-16', // Less than 10 days remaining!
    resolution_notes: 'URGENT: Allograft tendon vendor invoice missing. 90-day deadline approaching in 6 days. Escalated to supply chain director.',
    assigned_to: 'user-lead-rcm'
  }
];

// 7. Aggregation Helpers

/**
 * Aggregates summary KPIs across unbilled cases
 */
export function getUnbilledSummaryMetrics(cases = BASELINE_UNBILLED_CASES, referenceDate = new Date()) {
  const activeCases = cases.filter(c => c.unbilled_status !== 'CLAIM_RELEASED' && c.unbilled_status !== 'WRITTEN_OFF_TIMELY_FILING');
  const totalCases = activeCases.length;

  let totalGrossCharges = 0.00;
  let totalExpectedRevenue = 0.00;
  let criticalExposureDollars = 0.00;
  let totalUnbilledDays = 0;

  activeCases.forEach(c => {
    const daysUnbilled = calculateDaysUnbilled(c.date_of_service, referenceDate);
    const daysRemaining = calculateDaysRemaining(c.filing_deadline, referenceDate);
    const tier = calculateTimelyFilingRiskTier(daysRemaining);

    totalGrossCharges += Number(c.total_charges) || 0.00;
    totalExpectedRevenue += Number(c.expected_reimbursement) || 0.00;
    totalUnbilledDays += daysUnbilled;

    if (tier === 'CRITICAL' || tier === 'URGENT') {
      criticalExposureDollars += Number(c.expected_reimbursement) || 0.00;
    }
  });

  const avgDaysUnbilled = totalCases > 0 ? Number((totalUnbilledDays / totalCases).toFixed(1)) : 0.0;

  return {
    totalCases,
    totalGrossCharges: Number(totalGrossCharges.toFixed(2)),
    totalExpectedRevenue: Number(totalExpectedRevenue.toFixed(2)),
    criticalExposureDollars: Number(criticalExposureDollars.toFixed(2)),
    avgDaysUnbilled
  };
}

/**
 * Aggregates cases by aging bucket: 0-15d, 16-30d, 31-60d, 61+d
 */
export function getAgingBucketSummary(cases = BASELINE_UNBILLED_CASES, referenceDate = new Date()) {
  const activeCases = cases.filter(c => c.unbilled_status !== 'CLAIM_RELEASED' && c.unbilled_status !== 'WRITTEN_OFF_TIMELY_FILING');

  const buckets = {
    '0_15_DAYS': { label: '0–15 Days', count: 0, grossCharges: 0.00, expectedRevenue: 0.00, criticalCount: 0 },
    '16_30_DAYS': { label: '16–30 Days', count: 0, grossCharges: 0.00, expectedRevenue: 0.00, criticalCount: 0 },
    '31_60_DAYS': { label: '31–60 Days', count: 0, grossCharges: 0.00, expectedRevenue: 0.00, criticalCount: 0 },
    '61_PLUS_DAYS': { label: '61+ Days', count: 0, grossCharges: 0.00, expectedRevenue: 0.00, criticalCount: 0 }
  };

  activeCases.forEach(c => {
    const daysUnbilled = calculateDaysUnbilled(c.date_of_service, referenceDate);
    const daysRemaining = calculateDaysRemaining(c.filing_deadline, referenceDate);
    const tier = calculateTimelyFilingRiskTier(daysRemaining);

    let bKey = '61_PLUS_DAYS';
    if (daysUnbilled <= 15) bKey = '0_15_DAYS';
    else if (daysUnbilled <= 30) bKey = '16_30_DAYS';
    else if (daysUnbilled <= 60) bKey = '31_60_DAYS';

    buckets[bKey].count += 1;
    buckets[bKey].grossCharges += Number(c.total_charges) || 0.00;
    buckets[bKey].expectedRevenue += Number(c.expected_reimbursement) || 0.00;
    if (tier === 'CRITICAL' || tier === 'URGENT') {
      buckets[bKey].criticalCount += 1;
    }
  });

  return Object.entries(buckets).map(([key, data]) => ({
    key,
    ...data,
    grossCharges: Number(data.grossCharges.toFixed(2)),
    expectedRevenue: Number(data.expectedRevenue.toFixed(2))
  }));
}

/**
 * Aggregates cases by root-cause hold reason
 */
export function getHoldReasonBreakdown(cases = BASELINE_UNBILLED_CASES) {
  const activeCases = cases.filter(c => c.unbilled_status !== 'CLAIM_RELEASED' && c.unbilled_status !== 'WRITTEN_OFF_TIMELY_FILING');
  const breakdown = {};

  Object.keys(HOLD_REASONS).forEach(reasonKey => {
    breakdown[reasonKey] = {
      id: reasonKey,
      label: HOLD_REASONS[reasonKey].label,
      count: 0,
      expectedRevenue: 0.00
    };
  });

  activeCases.forEach(c => {
    if (breakdown[c.hold_reason]) {
      breakdown[c.hold_reason].count += 1;
      breakdown[c.hold_reason].expectedRevenue += Number(c.expected_reimbursement) || 0.00;
    }
  });

  return Object.values(breakdown).map(b => ({
    ...b,
    expectedRevenue: Number(b.expectedRevenue.toFixed(2))
  })).sort((a, b) => b.expectedRevenue - a.expectedRevenue);
}

// 8. Stateful In-Memory Unbilled Case Store
class UnbilledCaseStore {
  constructor() {
    this.cases = JSON.parse(JSON.stringify(BASELINE_UNBILLED_CASES));
  }

  getCases(filters = {}, referenceDate = new Date()) {
    let result = this.cases.map(c => {
      const daysUnbilled = calculateDaysUnbilled(c.date_of_service, referenceDate);
      const daysRemaining = calculateDaysRemaining(c.filing_deadline, referenceDate);
      const riskTier = calculateTimelyFilingRiskTier(daysRemaining);
      const priority = calculatePriorityScore(c.expected_reimbursement, daysUnbilled, daysRemaining);

      return {
        ...c,
        days_unbilled: daysUnbilled,
        days_remaining: daysRemaining,
        timely_filing_risk_tier: riskTier,
        priority_score: priority
      };
    });

    if (filters.status && filters.status !== 'ALL') {
      result = result.filter(c => c.unbilled_status === filters.status);
    }
    if (filters.holdReason && filters.holdReason !== 'ALL') {
      result = result.filter(c => c.hold_reason === filters.holdReason);
    }
    if (filters.riskTier && filters.riskTier !== 'ALL') {
      result = result.filter(c => c.timely_filing_risk_tier === filters.riskTier);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(c =>
        c.case_number.toLowerCase().includes(q) ||
        c.patient_name.toLowerCase().includes(q) ||
        c.surgeon_name.toLowerCase().includes(q) ||
        c.procedure_name.toLowerCase().includes(q) ||
        c.primary_cpt.toLowerCase().includes(q)
      );
    }

    return result.sort((a, b) => b.priority_score - a.priority_score);
  }

  getCaseById(id) {
    return this.cases.find(c => c.id === id) || null;
  }

  resolveHold(id, { resolutionReason = 'READY_TO_RELEASE', notes }) {
    const c = this.getCaseById(id);
    if (!c) throw new Error(`Unbilled case ${id} not found`);

    c.hold_reason = resolutionReason;
    c.unbilled_status = 'HOLD_RESOLVED';
    c.resolution_notes = `${c.resolution_notes ? c.resolution_notes + ' | ' : ''}Resolved: ${notes || 'Hold cleared'}`;
    return c;
  }

  releaseClaim(id, { claimControlNumber, notes }) {
    const c = this.getCaseById(id);
    if (!c) throw new Error(`Unbilled case ${id} not found`);

    c.unbilled_status = 'CLAIM_RELEASED';
    c.released_at = new Date().toISOString();
    const ccn = claimControlNumber ? ` [CCN: ${claimControlNumber}]` : '';
    c.resolution_notes = `${c.resolution_notes ? c.resolution_notes + ' | ' : ''}Released to clearinghouse${ccn}: ${notes || 'EDI 837 created'}`;
    return c;
  }

  writeOffExpired(id, { justification, notes }) {
    const c = this.getCaseById(id);
    if (!c) throw new Error(`Unbilled case ${id} not found`);

    c.unbilled_status = 'WRITTEN_OFF_TIMELY_FILING';
    c.resolution_notes = `${c.resolution_notes ? c.resolution_notes + ' | ' : ''}Write-Off (${justification || 'EXPIRED_TFL'}): ${notes || 'Authorized write-off'}`;
    return c;
  }
}

export const unbilledCaseService = new UnbilledCaseStore();
export default unbilledCaseService;
