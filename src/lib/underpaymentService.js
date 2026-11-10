/**
 * ASC Contractual Underpayment Detection Engine Service
 * Phase 93: Expected-vs-Actual Allowed/Payment Underpayment Detection
 * 
 * Audits 835 remittances against contractual fee schedules, implant carve-outs,
 * and MPPR terms to detect, prioritize, and dispute short-paid surgical claims.
 */

// 1. Underpayment Categories Taxonomy
export const UNDERPAYMENT_CATEGORIES = {
  FEE_SCHEDULE_MISMATCH: {
    id: 'FEE_SCHEDULE_MISMATCH',
    label: 'Fee Schedule Mismatch',
    badgeClass: 'bg-amber-950/40 text-amber-300 border-amber-800',
    colorToken: 'amber',
    description: 'Payer allowed amount is lower than contracted fee schedule baseline.'
  },
  IMPLANT_CARVEOUT_UNPAID: {
    id: 'IMPLANT_CARVEOUT_UNPAID',
    label: 'Implant Carve-Out Short-Paid',
    badgeClass: 'bg-rose-950/40 text-rose-300 border-rose-800',
    colorToken: 'rose',
    description: 'Contractual implant invoice reimbursement (cost + markup) was unpaid or discounted below agreement.'
  },
  MPPR_OVER_DISCOUNT: {
    id: 'MPPR_OVER_DISCOUNT',
    label: 'MPPR Over-Discounting',
    badgeClass: 'bg-sky-950/40 text-sky-300 border-sky-800',
    colorToken: 'sky',
    description: 'Secondary surgical procedure discounted beyond contract terms (>50% or primary procedure discounted).'
  },
  DEVICE_INTENSIVE_OFFSET_ERROR: {
    id: 'DEVICE_INTENSIVE_OFFSET_ERROR',
    label: 'Device-Intensive Offset Error',
    badgeClass: 'bg-cyan-950/40 text-cyan-300 border-cyan-800',
    colorToken: 'cyan',
    description: 'Inaccurate device offset deduction on OPPS device-intensive CPT code.'
  },
  CONTRACT_RATE_EXPIRED: {
    id: 'CONTRACT_RATE_EXPIRED',
    label: 'Expired Contract Rate Applied',
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
    colorToken: 'slate',
    description: 'Payer adjudicated claim using superseded prior-year rate schedule instead of current amendment.'
  },
  BILATERAL_DISCOUNT_ERROR: {
    id: 'BILATERAL_DISCOUNT_ERROR',
    label: 'Bilateral Modifier -50 Error',
    badgeClass: 'bg-emerald-950/40 text-emerald-300 border-emerald-800',
    colorToken: 'emerald',
    description: 'Improper discount or denial applied to bilateral surgical modifier line.'
  }
};

// 2. Underpayment Lifecycle Statuses
export const UNDERPAYMENT_STATUSES = {
  DETECTED: {
    id: 'DETECTED',
    label: 'Detected by Audit',
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
    colorToken: 'slate',
    description: 'Identified via contract comparison algorithm; awaiting billing audit review.'
  },
  AUDIT_CONFIRMED: {
    id: 'AUDIT_CONFIRMED',
    label: 'Contract Audit Confirmed',
    badgeClass: 'bg-amber-950/40 text-amber-300 border-amber-800 font-semibold',
    colorToken: 'amber',
    description: 'Contract terms and fee schedule verified against 835 remittance; queued for dispute submission.'
  },
  DISPUTE_SUBMITTED: {
    id: 'DISPUTE_SUBMITTED',
    label: 'Payer Dispute Submitted',
    badgeClass: 'bg-sky-950/40 text-sky-400 border-sky-800 font-semibold',
    colorToken: 'sky',
    description: 'Formal underpayment dispute letter and contracted fee exhibits transmitted to health plan.'
  },
  RECOVERED: {
    id: 'RECOVERED',
    label: 'Recovered / Re-Adjudicated',
    badgeClass: 'bg-emerald-950/40 text-emerald-400 border-emerald-800 font-bold',
    colorToken: 'emerald',
    description: 'Supplemental remittance received and underpayment balance resolved in full.'
  },
  DISMISSED_VALID_ADJUSTMENT: {
    id: 'DISMISSED_VALID_ADJUSTMENT',
    label: 'Dismissed (Valid Adjustment)',
    badgeClass: 'bg-slate-800/80 text-slate-400 border-slate-700',
    colorToken: 'slate',
    description: 'Audited and dismissed (e.g. payer adjustment verified as legitimate per policy amendment).'
  }
};

// 3. Deterministic Financial Calculations

/**
 * Calculates underpayment variance:
 * variance = max(0.00, ROUND(expectedAllowed - actualAllowed, 2))
 */
export function calculateUnderpaymentVariance(expectedAllowed, actualAllowed) {
  const exp = Number(expectedAllowed) || 0.0;
  const act = Number(actualAllowed) || 0.0;
  const variance = exp - act;
  return Number(Math.max(0.0, variance).toFixed(2));
}

/**
 * Calculates percentage underpayment variance:
 * pct = expected > 0 ? ROUND(((expected - actual) / expected) * 100, 2) : 0.00
 */
export function calculateUnderpaymentPercentage(expectedAllowed, actualAllowed) {
  const exp = Number(expectedAllowed) || 0.0;
  const act = Number(actualAllowed) || 0.0;
  if (exp <= 0 || exp <= act) return 0.00;
  return Number((((exp - act) / exp) * 100.0).toFixed(2));
}

/**
 * Computes composite underpayment priority score (0.00 - 100.00):
 * - Dollar magnitude weight (50%): min(50.0, (varianceAmount / 3000.0) * 50.0)
 * - Confidence weight (30%): (confidenceScore / 100.0) * 30.0
 * - Age timeliness weight (20%):
 *     days <= 30: 20.0
 *     days <= 60: 12.0
 *     days > 60: 4.0
 */
export function calculateUnderpaymentPriorityScore(varianceAmount, confidenceScore = 90.00, daysElapsed = 15) {
  const v = Number(varianceAmount) || 0.0;
  const c = Number(confidenceScore) || 0.0;
  const days = Number(daysElapsed) || 0;

  const dollarWeight = Math.min(50.0, (v / 3000.00) * 50.0);
  const confWeight = Math.min(30.0, (c / 100.0) * 30.0);

  let ageWeight = 4.0;
  if (days <= 30) ageWeight = 20.0;
  else if (days <= 60) ageWeight = 12.0;

  const total = dollarWeight + confWeight + ageWeight;
  return Number(Math.min(100.0, Math.max(0.0, total)).toFixed(2));
}

// 4. Baseline Underpayment Dataset
export const BASELINE_UNDERPAYMENTS = [
  {
    id: 'und-001',
    facility_id: 'fac-main-001',
    underpayment_alert_number: 'UND-2026-00301',
    claim_id: 'c7a8b9c0-9991-4444-8888-000000000001',
    surgery_id: 10420,
    patient_id: 8520,
    patient_name: 'Jonathan Reynolds',
    surgeon_name: 'Dr. Malinoski Kelly',
    payer_name: 'Blue Cross Blue Shield',
    procedure_name: 'Knee Arthroscopy w/ Meniscectomy',
    cpt_code: '29881',
    date_of_service: '2026-10-15',
    remittance_date: '2026-10-28',
    underpayment_category: 'FEE_SCHEDULE_MISMATCH',
    expected_allowed_amount: 3850.00,
    actual_allowed_amount: 2950.00,
    expected_payment_amount: 3080.00,
    actual_payment_amount: 2360.00,
    recovered_amount: 0.00,
    confidence_score: 95.00,
    status: 'AUDIT_CONFIRMED',
    dispute_letter_reference: null,
    resolution_notes: 'BCBS adjudicated against outdated 2024 tier-2 schedule instead of active 2026 ASC commercial agreement ($3,850.00 allowed).'
  },
  {
    id: 'und-002',
    facility_id: 'fac-main-001',
    underpayment_alert_number: 'UND-2026-00302',
    claim_id: 'c7a8b9c0-9992-4444-8888-000000000002',
    surgery_id: 10455,
    patient_id: 8560,
    patient_name: 'Sarah Jenkins',
    surgeon_name: 'Dr. Gardner Paul',
    payer_name: 'Aetna Commercial',
    procedure_name: 'Rotator Cuff Repair w/ Hardware',
    cpt_code: '29827',
    date_of_service: '2026-10-20',
    remittance_date: '2026-11-02',
    underpayment_category: 'IMPLANT_CARVEOUT_UNPAID',
    expected_allowed_amount: 6200.00,
    actual_allowed_amount: 3800.00,
    expected_payment_amount: 4960.00,
    actual_payment_amount: 3040.00,
    recovered_amount: 0.00,
    confidence_score: 98.00,
    status: 'DISPUTE_SUBMITTED',
    dispute_letter_reference: 'DSP-AET-2026-8812',
    resolution_notes: 'Aetna bundled Arthrex suture anchors into base surgical rate. Commercial Section 4.2 guarantees invoice cost ($2,142.86) + 12% markup ($2,400.00 carve-out).'
  },
  {
    id: 'und-003',
    facility_id: 'fac-main-001',
    underpayment_alert_number: 'UND-2026-00303',
    claim_id: 'c7a8b9c0-9993-4444-8888-000000000003',
    surgery_id: 10390,
    patient_id: 8495,
    patient_name: 'Robert Thornton',
    surgeon_name: 'Dr. Bonett Andrew',
    payer_name: 'UnitedHealthcare',
    procedure_name: 'Lumbar Laminectomy & Foraminotomy',
    cpt_code: '63047',
    date_of_service: '2026-09-25',
    remittance_date: '2026-10-12',
    underpayment_category: 'MPPR_OVER_DISCOUNT',
    expected_allowed_amount: 5100.00,
    actual_allowed_amount: 3600.00,
    expected_payment_amount: 4080.00,
    actual_payment_amount: 2880.00,
    recovered_amount: 1200.00,
    confidence_score: 92.00,
    status: 'RECOVERED',
    dispute_letter_reference: 'DSP-UHC-2026-4401',
    resolution_notes: 'UHC applied 75% secondary discount on CPT 63048 instead of contracted 50% MPPR. Dispute accepted; supplemental ERA posted $1,200.00 recovery.'
  },
  {
    id: 'und-004',
    facility_id: 'fac-main-001',
    underpayment_alert_number: 'UND-2026-00304',
    claim_id: 'c7a8b9c0-9994-4444-8888-000000000004',
    surgery_id: 10480,
    patient_id: 8590,
    patient_name: 'Emily Watson',
    surgeon_name: 'Dr. Walsh Mark',
    payer_name: 'Medicare Part B',
    procedure_name: 'Cataract Surgery w/ IOL',
    cpt_code: '66984',
    date_of_service: '2026-10-22',
    remittance_date: '2026-11-04',
    underpayment_category: 'DEVICE_INTENSIVE_OFFSET_ERROR',
    expected_allowed_amount: 1120.00,
    actual_allowed_amount: 980.00,
    expected_payment_amount: 896.00,
    actual_payment_amount: 784.00,
    recovered_amount: 0.00,
    confidence_score: 88.00,
    status: 'DETECTED',
    dispute_letter_reference: null,
    resolution_notes: 'Medicare Part B contractor MAC subtracted device credit offset in error where no manufacturer warranty/replacement credit applied.'
  },
  {
    id: 'und-005',
    facility_id: 'fac-main-001',
    underpayment_alert_number: 'UND-2026-00305',
    claim_id: 'c7a8b9c0-9995-4444-8888-000000000005',
    surgery_id: 10410,
    patient_id: 8510,
    patient_name: 'Michael Chang',
    surgeon_name: 'Dr. Baccaro Leopoldo',
    payer_name: 'Cigna Healthcare',
    procedure_name: 'Laparoscopic Cholecystectomy',
    cpt_code: '47562',
    date_of_service: '2026-10-05',
    remittance_date: '2026-10-19',
    underpayment_category: 'CONTRACT_RATE_EXPIRED',
    expected_allowed_amount: 4400.00,
    actual_allowed_amount: 3900.00,
    expected_payment_amount: 3520.00,
    actual_payment_amount: 3120.00,
    recovered_amount: 0.00,
    confidence_score: 90.00,
    status: 'AUDIT_CONFIRMED',
    dispute_letter_reference: null,
    resolution_notes: 'Cigna processed claim under 2025 contract schedule ($3,900 allowed). Cigna 2026 renewal amendment specifies $4,400 allowed base rate effective Jan 1, 2026.'
  },
  {
    id: 'und-006',
    facility_id: 'fac-main-001',
    underpayment_alert_number: 'UND-2026-00306',
    claim_id: 'c7a8b9c0-9996-4444-8888-000000000006',
    surgery_id: 10495,
    patient_id: 8610,
    patient_name: 'Amanda Vance',
    surgeon_name: 'Dr. Malinoski Kelly',
    payer_name: 'Humana Commercial',
    procedure_name: 'Bilateral Carpal Tunnel Release',
    cpt_code: '64721',
    date_of_service: '2026-10-18',
    remittance_date: '2026-11-01',
    underpayment_category: 'BILATERAL_DISCOUNT_ERROR',
    expected_allowed_amount: 2200.00,
    actual_allowed_amount: 1950.00,
    expected_payment_amount: 1760.00,
    actual_payment_amount: 1560.00,
    recovered_amount: 0.00,
    confidence_score: 86.00,
    status: 'DISMISSED_VALID_ADJUSTMENT',
    dispute_letter_reference: null,
    resolution_notes: 'Reviewed Humana fee amendment: Humana contract limits bilateral modifier -50 to 150% of single side for CPT 64721. Adjustment of $250 is legally valid.'
  }
];

// 5. Aggregation Helpers

/**
 * Aggregates summary KPIs across underpayment items
 */
export function getUnderpaymentSummaryMetrics(items = BASELINE_UNDERPAYMENTS) {
  const totalAlerts = items.length;
  let totalVarianceExposure = 0.00;
  let confirmedPipeline = 0.00;
  let realizedDisputedCash = 0.00;
  let dismissedValidAdjustments = 0.00;

  items.forEach(u => {
    const variance = calculateUnderpaymentVariance(u.expected_allowed_amount, u.actual_allowed_amount);
    totalVarianceExposure += variance;

    if (u.status === 'AUDIT_CONFIRMED' || u.status === 'DISPUTE_SUBMITTED') {
      confirmedPipeline += variance;
    } else if (u.status === 'RECOVERED') {
      realizedDisputedCash += Number(u.recovered_amount) || variance;
    } else if (u.status === 'DISMISSED_VALID_ADJUSTMENT') {
      dismissedValidAdjustments += variance;
    }
  });

  return {
    totalAlerts,
    totalVarianceExposure: Number(totalVarianceExposure.toFixed(2)),
    confirmedPipeline: Number(confirmedPipeline.toFixed(2)),
    realizedDisputedCash: Number(realizedDisputedCash.toFixed(2)),
    dismissedValidAdjustments: Number(dismissedValidAdjustments.toFixed(2))
  };
}

/**
 * Aggregates underpayment metrics by payer
 */
export function getPayerUnderpaymentBreakdown(items = BASELINE_UNDERPAYMENTS) {
  const pMap = {};

  items.forEach(u => {
    const name = u.payer_name || 'Other';
    if (!pMap[name]) {
      pMap[name] = {
        payer_name: name,
        alert_count: 0,
        total_variance: 0.00,
        recovered_amount: 0.00,
        disputed_count: 0
      };
    }
    const variance = calculateUnderpaymentVariance(u.expected_allowed_amount, u.actual_allowed_amount);
    pMap[name].alert_count += 1;
    pMap[name].total_variance += variance;
    pMap[name].recovered_amount += Number(u.recovered_amount) || 0.00;
    if (u.status === 'DISPUTE_SUBMITTED' || u.status === 'AUDIT_CONFIRMED') {
      pMap[name].disputed_count += 1;
    }
  });

  return Object.values(pMap).map(p => ({
    ...p,
    total_variance: Number(p.total_variance.toFixed(2)),
    recovered_amount: Number(p.recovered_amount.toFixed(2))
  })).sort((a, b) => b.total_variance - a.total_variance);
}

/**
 * Aggregates underpayment metrics by category
 */
export function getCategoryUnderpaymentBreakdown(items = BASELINE_UNDERPAYMENTS) {
  const breakdown = {};

  Object.keys(UNDERPAYMENT_CATEGORIES).forEach(k => {
    breakdown[k] = {
      id: k,
      label: UNDERPAYMENT_CATEGORIES[k].label,
      count: 0,
      total_variance: 0.00,
      recovered_amount: 0.00
    };
  });

  items.forEach(u => {
    if (breakdown[u.underpayment_category]) {
      const variance = calculateUnderpaymentVariance(u.expected_allowed_amount, u.actual_allowed_amount);
      breakdown[u.underpayment_category].count += 1;
      breakdown[u.underpayment_category].total_variance += variance;
      breakdown[u.underpayment_category].recovered_amount += Number(u.recovered_amount) || 0.00;
    }
  });

  return Object.values(breakdown).map(b => ({
    ...b,
    total_variance: Number(b.total_variance.toFixed(2)),
    recovered_amount: Number(b.recovered_amount.toFixed(2))
  })).sort((a, b) => b.total_variance - a.total_variance);
}

// 6. Stateful In-Memory Underpayment Store
class UnderpaymentStore {
  constructor() {
    this.items = JSON.parse(JSON.stringify(BASELINE_UNDERPAYMENTS));
  }

  getUnderpayments(filters = {}, referenceDate = new Date()) {
    let result = this.items.map(u => {
      const rem = new Date(u.remittance_date);
      const ref = new Date(referenceDate);
      const daysElapsed = Math.max(0, Math.floor((ref.getTime() - rem.getTime()) / (1000 * 60 * 60 * 24)));
      const variance = calculateUnderpaymentVariance(u.expected_allowed_amount, u.actual_allowed_amount);
      const pct = calculateUnderpaymentPercentage(u.expected_allowed_amount, u.actual_allowed_amount);
      const priority = calculateUnderpaymentPriorityScore(variance, u.confidence_score, daysElapsed);

      return {
        ...u,
        days_elapsed: daysElapsed,
        variance_amount: variance,
        variance_percentage: pct,
        priority_score: priority
      };
    });

    if (filters.category && filters.category !== 'ALL') {
      result = result.filter(u => u.underpayment_category === filters.category);
    }
    if (filters.status && filters.status !== 'ALL') {
      result = result.filter(u => u.status === filters.status);
    }
    if (filters.payer && filters.payer !== 'ALL') {
      result = result.filter(u => u.payer_name === filters.payer);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(u =>
        u.underpayment_alert_number.toLowerCase().includes(q) ||
        u.patient_name.toLowerCase().includes(q) ||
        u.surgeon_name.toLowerCase().includes(q) ||
        u.payer_name.toLowerCase().includes(q) ||
        u.cpt_code.toLowerCase().includes(q) ||
        u.procedure_name.toLowerCase().includes(q)
      );
    }

    return result.sort((a, b) => b.priority_score - a.priority_score);
  }

  getUnderpaymentById(id) {
    return this.items.find(u => u.id === id) || null;
  }

  confirmUnderpayment(id, { notes } = {}) {
    const item = this.getUnderpaymentById(id);
    if (!item) throw new Error(`Underpayment alert ${id} not found`);

    item.status = 'AUDIT_CONFIRMED';
    item.resolved_at = new Date().toISOString();
    item.resolution_notes = `${item.resolution_notes ? item.resolution_notes + ' | ' : ''}Confirmed: ${notes || 'Verified against contractual fee schedule'}`;
    return item;
  }

  submitDispute(id, { disputeReference, notes } = {}) {
    const item = this.getUnderpaymentById(id);
    if (!item) throw new Error(`Underpayment alert ${id} not found`);

    item.status = 'DISPUTE_SUBMITTED';
    item.dispute_letter_reference = disputeReference || `DSP-REF-${Math.floor(1000 + Math.random() * 9000)}`;
    item.disputed_at = new Date().toISOString();
    item.resolution_notes = `${item.resolution_notes ? item.resolution_notes + ' | ' : ''}Dispute [${item.dispute_letter_reference}]: ${notes || 'Contract variance demand letter transmitted'}`;
    return item;
  }

  recordRecovery(id, { recoveredAmount, notes } = {}) {
    const item = this.getUnderpaymentById(id);
    if (!item) throw new Error(`Underpayment alert ${id} not found`);

    const variance = calculateUnderpaymentVariance(item.expected_allowed_amount, item.actual_allowed_amount);
    const amt = typeof recoveredAmount === 'number' && recoveredAmount > 0 ? recoveredAmount : variance;

    item.status = 'RECOVERED';
    item.recovered_amount = Number(amt.toFixed(2));
    item.resolved_at = new Date().toISOString();
    item.resolution_notes = `${item.resolution_notes ? item.resolution_notes + ' | ' : ''}Recovery: $${item.recovered_amount.toFixed(2)} supplemental payment received (${notes || 'Supplemental ERA post'})`;
    return item;
  }

  dismissUnderpayment(id, { reason, notes } = {}) {
    const item = this.getUnderpaymentById(id);
    if (!item) throw new Error(`Underpayment alert ${id} not found`);

    item.status = 'DISMISSED_VALID_ADJUSTMENT';
    item.resolved_at = new Date().toISOString();
    item.resolution_notes = `${item.resolution_notes ? item.resolution_notes + ' | ' : ''}Dismissed (${reason || 'VALID_ADJUSTMENT'}): ${notes || 'Payer adjustment verified as contractually legitimate'}`;
    return item;
  }
}

export const underpaymentService = new UnderpaymentStore();
export default underpaymentService;
