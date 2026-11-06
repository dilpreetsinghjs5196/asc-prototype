/**
 * ASC Accounts Receivable (AR) Aging & Work Queue Engine
 * Phase 88: Revenue Cycle Management (RCM)
 * 
 * Deterministic GAAP aging calculations (DOS & Bill Date),
 * Days Sales Outstanding (DSO), financial class rollup,
 * and collector queue priority scoring.
 */

// 1. Standard 6 ASC/Healthcare GAAP Aging Buckets
export const AGING_BUCKETS = {
  BUCKET_0_30: {
    id: '0_30',
    label: '0–30 Days',
    minDays: 0,
    maxDays: 30,
    category: 'CURRENT',
    badgeClass: 'bg-emerald-950/40 text-emerald-400 border-emerald-800',
    colorToken: 'emerald',
    description: 'Current AR within standard electronic payer turnaround window.'
  },
  BUCKET_31_60: {
    id: '31_60',
    label: '31–60 Days',
    minDays: 31,
    maxDays: 60,
    category: 'FOLLOW_UP',
    badgeClass: 'bg-sky-950/40 text-sky-400 border-sky-800',
    colorToken: 'sky',
    description: 'Follow-up threshold. Verify 277 acknowledgement and claim status.'
  },
  BUCKET_61_90: {
    id: '61_90',
    label: '61–90 Days',
    minDays: 61,
    maxDays: 90,
    category: 'ESCALATION',
    badgeClass: 'bg-amber-950/40 text-amber-400 border-amber-800',
    colorToken: 'amber',
    description: 'Payer escalation stage. Telephone follow-up required for missing info.'
  },
  BUCKET_91_120: {
    id: '91_120',
    label: '91–120 Days',
    minDays: 91,
    maxDays: 120,
    category: 'HIGH_RISK',
    badgeClass: 'bg-amber-950/70 text-amber-300 border-amber-600 font-semibold',
    colorToken: 'amber',
    description: 'High risk timely filing threat. Urgent management intervention.'
  },
  BUCKET_121_150: {
    id: '121_150',
    label: '121–150 Days',
    minDays: 121,
    maxDays: 150,
    category: 'SEVERE',
    badgeClass: 'bg-rose-950/50 text-rose-300 border-rose-700 font-bold',
    colorToken: 'rose',
    description: 'Severe aging. Formal supervisory escalation and appeal notice.'
  },
  BUCKET_150_PLUS: {
    id: '150_PLUS',
    label: '150+ Days',
    minDays: 151,
    maxDays: Infinity,
    category: 'CRITICAL',
    badgeClass: 'bg-rose-950/80 text-rose-200 border-rose-500 font-bold',
    colorToken: 'rose',
    description: 'Critical aged default. Reserve for uncollectable / bad debt write-off.'
  }
};

// 2. Healthcare Payer Financial Classes
export const FINANCIAL_CLASSES = {
  COMMERCIAL: {
    id: 'COMMERCIAL',
    label: 'Commercial / Managed Care',
    description: 'Blue Cross Blue Shield, Aetna, Cigna, UnitedHealthcare, Humana commercial plans.',
    badgeClass: 'bg-sky-950/40 text-sky-400 border-sky-800'
  },
  MEDICARE: {
    id: 'MEDICARE',
    label: 'Medicare / Advantage',
    description: 'Traditional CMS Part B and Commercial Medicare Advantage Part C plans.',
    badgeClass: 'bg-emerald-950/40 text-emerald-400 border-emerald-800'
  },
  MEDICAID: {
    id: 'MEDICAID',
    label: 'Medicaid / Managed Medicaid',
    description: 'State Medicaid programs and managed Medicaid care organizations.',
    badgeClass: 'bg-amber-950/40 text-amber-400 border-amber-800'
  },
  WORKERS_COMP: {
    id: 'WORKERS_COMP',
    label: "Workers' Comp / MVA",
    description: 'Statutory workers compensation and motor vehicle accident liability policies.',
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700'
  },
  SELF_PAY: {
    id: 'SELF_PAY',
    label: 'Patient AR / Self-Pay',
    description: 'Uninsured self-pay packages and post-adjudication patient deductible/coinsurance.',
    badgeClass: 'bg-slate-800 text-slate-400 border-slate-700'
  }
};

// 3. Collector Work Queue Definitions
export const WORK_QUEUE_DEFINITIONS = {
  HIGH_DOLLAR: {
    id: 'HIGH_DOLLAR',
    code: 'QUEUE_HIGH_DOLLAR',
    label: 'High-Dollar Claims (≥ $5,000)',
    minBalance: 5000.00,
    minDays: 0,
    description: 'Expedited cash flow prioritization for high gross charge outpatient cases.'
  },
  AGING_90_PLUS: {
    id: 'AGING_90_PLUS',
    code: 'QUEUE_AGING_90_PLUS',
    label: 'Aging ≥ 91 Days (Benchmark Threat)',
    minBalance: 0.00,
    minDays: 91,
    description: 'Claims threatening the ASC 15% >90-day aging compliance ceiling.'
  },
  COMMERCIAL_ESCALATION: {
    id: 'COMMERCIAL_ESCALATION',
    code: 'QUEUE_COMMERCIAL_ESCALATION',
    label: 'Commercial Stalled Claims (30d+)',
    minBalance: 1000.00,
    minDays: 45,
    description: 'Commercial payer claims stalled in review requiring phone intervention.'
  },
  DENIED_UNRESOLVED: {
    id: 'DENIED_UNRESOLVED',
    code: 'QUEUE_DENIED_UNRESOLVED',
    label: 'Denied Claims Awaiting Action',
    minBalance: 250.00,
    minDays: 0,
    description: 'CARC-denied claims requiring corrected claim rebill or Level 1 appeal.'
  },
  UNTOUCHED_14D: {
    id: 'UNTOUCHED_14D',
    code: 'QUEUE_UNTOUCHED_14D',
    label: 'Untouched > 14 Days',
    minBalance: 500.00,
    minDays: 30,
    description: 'Accounts with zero logged collector touches in the last two weeks.'
  }
};

// 4. Collector Touch Actions Taxonomy
export const TOUCH_ACTION_TYPES = {
  PAYER_CALL: {
    id: 'PAYER_CALL',
    label: 'Payer Phone Follow-Up',
    description: 'Spoke directly with payer claims examiner or customer service rep.'
  },
  PORTAL_STATUS_CHECK: {
    id: 'PORTAL_STATUS_CHECK',
    label: 'Portal Electronic Status Check',
    description: 'Verified claim status via Availity, Change Healthcare, or direct payer portal.'
  },
  CORRECTED_CLAIM_SUBMITTED: {
    id: 'CORRECTED_CLAIM_SUBMITTED',
    label: 'Corrected Claim Resubmitted',
    description: 'Bill frequency 7 replacement claim transmitted with modified coding.'
  },
  APPEAL_PACKET_SENT: {
    id: 'APPEAL_PACKET_SENT',
    label: 'Appeal Packet Dispatched',
    description: 'Formal Level 1/2 appeal letter with medical necessity documentation sent.'
  },
  MEDICAL_RECORDS_FAXED: {
    id: 'MEDICAL_RECORDS_FAXED',
    label: 'Medical Records Faxed',
    description: 'Operative notes, implant log, or pathology reports transmitted.'
  },
  PROMISE_TO_PAY_LOGGED: {
    id: 'PROMISE_TO_PAY_LOGGED',
    label: 'Promise to Pay Committed',
    description: 'Payer representative or patient confirmed payment release date and check amount.'
  },
  SUPERVISOR_ESCALATION: {
    id: 'SUPERVISOR_ESCALATION',
    label: 'Supervisor Escalation',
    description: 'Referred to billing manager or contracting team for carrier dispute.'
  },
  PATIENT_OUTREACH: {
    id: 'PATIENT_OUTREACH',
    label: 'Patient Outreach Call/Notice',
    description: 'Contacted patient for coordination of benefits or statement balance.'
  },
  WRITEOFF_RECOMMENDED: {
    id: 'WRITEOFF_RECOMMENDED',
    label: 'Write-off Recommended',
    description: 'Exhausted appeals; recommended for contractual or administrative write-off.'
  }
};

// 5. Deterministic Aging Calculation Functions
export function calculateAgingDays(dateStr, baseDateStr = null) {
  if (!dateStr) return 0;
  const current = baseDateStr ? new Date(baseDateStr) : new Date();
  const target = new Date(dateStr);
  if (isNaN(target.getTime()) || isNaN(current.getTime())) return 0;

  const diffTime = current.getTime() - target.getTime();
  const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return days > 0 ? days : 0;
}

export function classifyAgingBucket(agingDays) {
  const days = Number(agingDays) || 0;
  if (days <= 30) return AGING_BUCKETS.BUCKET_0_30;
  if (days <= 60) return AGING_BUCKETS.BUCKET_31_60;
  if (days <= 90) return AGING_BUCKETS.BUCKET_61_90;
  if (days <= 120) return AGING_BUCKETS.BUCKET_91_120;
  if (days <= 150) return AGING_BUCKETS.BUCKET_121_150;
  return AGING_BUCKETS.BUCKET_150_PLUS;
}

// 6. Work Queue Priority Scoring Algorithm
export function calculateWorkItemPriority(agingDays = 0, balanceAmount = 0.00, daysUntouched = 0) {
  const age = Math.min(120, Math.max(0, Number(agingDays) || 0));
  const bal = Math.min(10000, Math.max(0, Number(balanceAmount) || 0));
  const untouched = Math.min(80, Math.max(0, Number(daysUntouched) || 0));

  // Weights: Aging 30% (max 36), Balance 40% (max 40), Untouched Latency 30% (max 24) = Total max 100.0
  const score = (age * 0.3) + ((bal / 100.0) * 0.4) + (untouched * 0.3);
  return Number(Math.min(100.0, Math.max(5.0, score)).toFixed(1));
}

// 7. Days Sales Outstanding (DSO) Calculation
export function calculateDaysSalesOutstanding(totalArBalance, averageDailyGrossCharge = 15000.00) {
  const ar = Number(totalArBalance) || 0;
  const adr = typeof averageDailyGrossCharge === 'number' ? averageDailyGrossCharge : 15000.00;
  if (adr <= 0) return 0;
  return Number((ar / adr).toFixed(1));
}

// 8. Executive KPI Aggregation
export function calculateArKpis(claimsList = [], averageDailyGrossCharge = 15000.00, agingBasis = 'DOS') {
  let totalArBalance = 0;
  let totalOriginalGross = 0;
  let arOver90Dollars = 0;
  let arOver120Dollars = 0;

  const bucketBreakdown = {
    '0_30': { count: 0, dollars: 0 },
    '31_60': { count: 0, dollars: 0 },
    '61_90': { count: 0, dollars: 0 },
    '91_120': { count: 0, dollars: 0 },
    '121_150': { count: 0, dollars: 0 },
    '150_PLUS': { count: 0, dollars: 0 }
  };

  const financialClassBreakdown = {
    COMMERCIAL: { count: 0, dollars: 0 },
    MEDICARE: { count: 0, dollars: 0 },
    MEDICAID: { count: 0, dollars: 0 },
    WORKERS_COMP: { count: 0, dollars: 0 },
    SELF_PAY: { count: 0, dollars: 0 }
  };

  claimsList.forEach(claim => {
    const bal = Number(claim.outstandingArBalance) || 0;
    const gross = Number(claim.totalGrossCharge) || 0;
    totalArBalance += bal;
    totalOriginalGross += gross;

    const days = agingBasis === 'BILL_DATE'
      ? (Number(claim.agingDaysBill) || 0)
      : (Number(claim.agingDaysDos) || 0);

    const bucket = classifyAgingBucket(days);
    if (bucketBreakdown[bucket.id]) {
      bucketBreakdown[bucket.id].count++;
      bucketBreakdown[bucket.id].dollars += bal;
    }

    if (days > 90) arOver90Dollars += bal;
    if (days > 120) arOver120Dollars += bal;

    const fc = claim.financialClass || 'COMMERCIAL';
    if (financialClassBreakdown[fc]) {
      financialClassBreakdown[fc].count++;
      financialClassBreakdown[fc].dollars += bal;
    }
  });

  const totalClaimsCount = claimsList.length;
  const pctArOver90Days = totalArBalance > 0
    ? Number(((arOver90Dollars / totalArBalance) * 100).toFixed(1))
    : 0;

  const daysSalesOutstanding = calculateDaysSalesOutstanding(totalArBalance, averageDailyGrossCharge);
  const benchmarkPassed = pctArOver90Days <= 15.0; // ASC standard is < 15.0%

  return {
    totalArBalance: Number(totalArBalance.toFixed(2)),
    totalOriginalGross: Number(totalOriginalGross.toFixed(2)),
    totalClaimsCount,
    arOver90Dollars: Number(arOver90Dollars.toFixed(2)),
    arOver120Dollars: Number(arOver120Dollars.toFixed(2)),
    pctArOver90Days,
    daysSalesOutstanding,
    benchmarkPassed,
    bucketBreakdown,
    financialClassBreakdown
  };
}

// 9. Baseline ASC Claims Dataset for Work Queues & Aging Simulation
export function getBaselineArClaims() {
  return [
    {
      id: 'clm-001',
      facilityId: '00000000-0000-0000-0000-000000000002',
      claimNumber: 'CLM-2026-0042',
      patientName: 'Garon, Suzanne',
      patientMrn: 'MRN-84920',
      surgeryDate: '2026-10-18',
      initialSubmittedAt: '2026-10-21T14:30:00Z',
      primaryPayerName: 'Blue Cross Blue Shield Florida',
      financialClass: 'COMMERCIAL',
      procedureDescription: 'Right Knee Arthroscopy with Meniscectomy (29881)',
      surgeonName: 'Dr. Arthur Alvarez, MD',
      rcmStatus: 'ACCEPTED_PAYER',
      totalGrossCharge: 8450.00,
      totalExpectedReimbursement: 4200.00,
      totalPaidAmount: 0.00,
      outstandingArBalance: 4200.00,
      agingDaysDos: 19,
      agingDaysBill: 16,
      daysUntouched: 6,
      touchCount: 1,
      lastTouchDate: '2026-10-31',
      lastTouchAction: 'PORTAL_STATUS_CHECK',
      lastTouchNotes: 'Claim in electronic adjudication. No issues flagged.',
      priorityScore: 35.8
    },
    {
      id: 'clm-002',
      facilityId: '00000000-0000-0000-0000-000000000002',
      claimNumber: 'CLM-2026-0088',
      patientName: 'Smith, Johnathan',
      patientMrn: 'MRN-77312',
      surgeryDate: '2026-09-15',
      initialSubmittedAt: '2026-09-18T10:00:00Z',
      primaryPayerName: 'UnitedHealthcare Commercial',
      financialClass: 'COMMERCIAL',
      procedureDescription: 'Laparoscopic Inguinal Hernia Repair (49505)',
      surgeonName: 'Dr. Rebecca Stone, MD',
      rcmStatus: 'IN_ADJUDICATION',
      totalGrossCharge: 11200.00,
      totalExpectedReimbursement: 5800.00,
      totalPaidAmount: 0.00,
      outstandingArBalance: 5800.00,
      agingDaysDos: 52,
      agingDaysBill: 49,
      daysUntouched: 18,
      touchCount: 2,
      lastTouchDate: '2026-10-19',
      lastTouchAction: 'PAYER_CALL',
      lastTouchNotes: 'Rep stated claim undergoing medical review for unbundled mesh code.',
      priorityScore: 68.2
    },
    {
      id: 'clm-003',
      facilityId: '00000000-0000-0000-0000-000000000002',
      claimNumber: 'CLM-2026-0105',
      patientName: 'Chen, Wei',
      patientMrn: 'MRN-91044',
      surgeryDate: '2026-08-10',
      initialSubmittedAt: '2026-08-14T09:15:00Z',
      primaryPayerName: 'Medicare Part B Florida (First Coast)',
      financialClass: 'MEDICARE',
      procedureDescription: 'Cataract Extraction with IOL Implant (66984)',
      surgeonName: 'Dr. Julian Sterling, MD',
      rcmStatus: 'PARTIALLY_PAID',
      totalGrossCharge: 6200.00,
      totalExpectedReimbursement: 2850.00,
      totalPaidAmount: 2280.00,
      outstandingArBalance: 570.00, // Secondary / Patient deductible balance
      agingDaysDos: 88,
      agingDaysBill: 84,
      daysUntouched: 12,
      touchCount: 3,
      lastTouchDate: '2026-10-25',
      lastTouchAction: 'PORTAL_STATUS_CHECK',
      lastTouchNotes: 'Crossed over to secondary Medigap carrier automatically on 2026-10-26.',
      priorityScore: 32.3
    },
    {
      id: 'clm-004',
      facilityId: '00000000-0000-0000-0000-000000000002',
      claimNumber: 'CLM-2026-0144',
      patientName: 'Rodriguez, Carmen',
      patientMrn: 'MRN-60219',
      surgeryDate: '2026-07-22',
      initialSubmittedAt: '2026-07-25T11:00:00Z',
      primaryPayerName: 'Aetna Open Choice PPO',
      financialClass: 'COMMERCIAL',
      procedureDescription: 'Shoulder Rotator Cuff Repair (29827)',
      surgeonName: 'Dr. Arthur Alvarez, MD',
      rcmStatus: 'DENIED',
      totalGrossCharge: 14800.00,
      totalExpectedReimbursement: 7200.00,
      totalPaidAmount: 0.00,
      outstandingArBalance: 7200.00,
      agingDaysDos: 107,
      agingDaysBill: 104,
      daysUntouched: 22,
      touchCount: 4,
      lastTouchDate: '2026-10-15',
      lastTouchAction: 'APPEAL_PACKET_SENT',
      lastTouchNotes: 'Level 1 Appeal sent via certified mail with operative note & prior auth.',
      priorityScore: 87.5
    },
    {
      id: 'clm-005',
      facilityId: '00000000-0000-0000-0000-000000000002',
      claimNumber: 'CLM-2026-0199',
      patientName: 'Kowalski, David',
      patientMrn: 'MRN-55418',
      surgeryDate: '2026-06-12',
      initialSubmittedAt: '2026-06-16T16:20:00Z',
      primaryPayerName: 'Travelers Workers Compensation',
      financialClass: 'WORKERS_COMP',
      procedureDescription: 'Open Carpal Tunnel Release (64721)',
      surgeonName: 'Dr. Sarah Vance, MD',
      rcmStatus: 'IN_ADJUDICATION',
      totalGrossCharge: 7900.00,
      totalExpectedReimbursement: 4100.00,
      totalPaidAmount: 0.00,
      outstandingArBalance: 4100.00,
      agingDaysDos: 147,
      agingDaysBill: 143,
      daysUntouched: 28,
      touchCount: 5,
      lastTouchDate: '2026-10-09',
      lastTouchAction: 'PAYER_CALL',
      lastTouchNotes: 'Adjuster changed; re-sent first report of injury & surgical report.',
      priorityScore: 91.8
    },
    {
      id: 'clm-006',
      facilityId: '00000000-0000-0000-0000-000000000002',
      claimNumber: 'CLM-2026-0210',
      patientName: 'Adams, Robert',
      patientMrn: 'MRN-33109',
      surgeryDate: '2026-05-18',
      initialSubmittedAt: '2026-05-22T08:30:00Z',
      primaryPayerName: 'Sunshine Health Medicaid Managed Care',
      financialClass: 'MEDICAID',
      procedureDescription: 'Tympanostomy Tube Insertion (69436)',
      surgeonName: 'Dr. Julian Sterling, MD',
      rcmStatus: 'DENIED',
      totalGrossCharge: 4300.00,
      totalExpectedReimbursement: 1950.00,
      totalPaidAmount: 0.00,
      outstandingArBalance: 1950.00,
      agingDaysDos: 172,
      agingDaysBill: 168,
      daysUntouched: 35,
      touchCount: 6,
      lastTouchDate: '2026-10-02',
      lastTouchAction: 'SUPERVISOR_ESCALATION',
      lastTouchNotes: 'Claim denied CO-29 timely filing. Over 150 days. Forwarded for bad-debt review.',
      priorityScore: 94.3
    }
  ];
}

const arAgingService = {
  AGING_BUCKETS,
  FINANCIAL_CLASSES,
  WORK_QUEUE_DEFINITIONS,
  TOUCH_ACTION_TYPES,
  calculateAgingDays,
  classifyAgingBucket,
  calculateWorkItemPriority,
  calculateDaysSalesOutstanding,
  calculateArKpis,
  getBaselineArClaims
};

export default arAgingService;
