/**
 * ASC Patient Responsibility, Collections & Aging Service
 * Phase 87: Revenue Cycle Management (RCM)
 * 
 * Deterministic patient liability tracking, CARC Group PR alignment,
 * 5-tier GAAP aging schedules, structured payment plans, and collection lifecycle.
 */

// 1. Patient Responsibility Types (Aligned with CARC Group PR)
export const RESPONSIBILITY_TYPES = {
  DEDUCTIBLE: {
    id: 'DEDUCTIBLE',
    label: 'Annual Deductible',
    code: 'PR-1',
    description: 'Patient individual or family annual health plan deductible contribution.',
    badgeClass: 'bg-sky-950/40 text-sky-400 border-sky-800'
  },
  COINSURANCE: {
    id: 'COINSURANCE',
    label: 'Coinsurance Cost Share',
    code: 'PR-2',
    description: 'Patient percentage contractual cost-share liability (typically 10%–30%).',
    badgeClass: 'bg-emerald-950/40 text-emerald-400 border-emerald-800'
  },
  COPAY: {
    id: 'COPAY',
    label: 'Fixed Copayment',
    code: 'PR-3',
    description: 'Fixed outpatient surgical copayment defined by health plan schedule.',
    badgeClass: 'bg-amber-950/40 text-amber-400 border-amber-800'
  },
  NON_COVERED: {
    id: 'NON_COVERED',
    label: 'Non-Covered Elective',
    code: 'PR-204',
    description: 'Elective procedural, premium implant upgrade, or non-covered service deemed patient liability.',
    badgeClass: 'bg-rose-950/40 text-rose-400 border-rose-800'
  },
  SELF_PAY: {
    id: 'SELF_PAY',
    label: 'Self-Pay Procedure',
    code: 'SELF-PAY',
    description: 'Uninsured patient package price or out-of-network elective cosmetic surgery.',
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700'
  }
};

// 2. Patient Balance State Machine Lifecycle
export const BALANCE_STATUSES = {
  PENDING_INSURANCE: {
    id: 'PENDING_INSURANCE',
    label: 'Pending Payer Adjudication',
    badgeClass: 'bg-slate-800 text-slate-400 border-slate-700',
    isCollectableNow: false
  },
  ADJUDICATED_FINAL: {
    id: 'ADJUDICATED_FINAL',
    label: 'Adjudicated (Ready to Bill)',
    badgeClass: 'bg-sky-950/40 text-sky-400 border-sky-800',
    isCollectableNow: true
  },
  STATEMENT_SENT: {
    id: 'STATEMENT_SENT',
    label: 'Statement Dispatched',
    badgeClass: 'bg-blue-950/40 text-blue-400 border-blue-800',
    isCollectableNow: true
  },
  PAYMENT_PLAN_ACTIVE: {
    id: 'PAYMENT_PLAN_ACTIVE',
    label: 'Active Installment Plan',
    badgeClass: 'bg-emerald-950/40 text-emerald-400 border-emerald-800',
    isCollectableNow: true
  },
  PARTIALLY_PAID: {
    id: 'PARTIALLY_PAID',
    label: 'Partially Paid',
    badgeClass: 'bg-amber-950/40 text-amber-400 border-amber-800',
    isCollectableNow: true
  },
  PAID_IN_FULL: {
    id: 'PAID_IN_FULL',
    label: 'Paid in Full ($0.00)',
    badgeClass: 'bg-emerald-950/40 text-emerald-400 border-emerald-800',
    isCollectableNow: false
  },
  DELINQUENT_PRE_COLLECTIONS: {
    id: 'DELINQUENT_PRE_COLLECTIONS',
    label: 'Delinquent (>60d Notice)',
    badgeClass: 'bg-amber-950/50 text-amber-300 border-amber-700 font-bold',
    isCollectableNow: true
  },
  EXTERNAL_COLLECTIONS: {
    id: 'EXTERNAL_COLLECTIONS',
    label: 'External Agency Placement',
    badgeClass: 'bg-rose-950/50 text-rose-300 border-rose-700 font-bold',
    isCollectableNow: false
  },
  BAD_DEBT_WRITEOFF: {
    id: 'BAD_DEBT_WRITEOFF',
    label: 'Bad Debt Written Off',
    badgeClass: 'bg-slate-800 text-slate-500 border-slate-700',
    isCollectableNow: false
  },
  CHARITY_CARE_WRITEOFF: {
    id: 'CHARITY_CARE_WRITEOFF',
    label: 'Charity Care Relief',
    badgeClass: 'bg-sky-950/30 text-sky-300 border-sky-700',
    isCollectableNow: false
  }
};

// 3. GAAP 5-Tier Aging Buckets
export const AGING_BUCKETS = {
  CURRENT_0_30: {
    id: 'CURRENT_0_30',
    label: 'Current (0–30 Days)',
    minDays: 0,
    maxDays: 30,
    badgeClass: 'bg-emerald-950/40 text-emerald-400 border-emerald-800',
    colorToken: 'emerald'
  },
  AGING_31_60: {
    id: 'AGING_31_60',
    label: '31–60 Days',
    minDays: 31,
    maxDays: 60,
    badgeClass: 'bg-sky-950/40 text-sky-400 border-sky-800',
    colorToken: 'sky'
  },
  AGING_61_90: {
    id: 'AGING_61_90',
    label: '61–90 Days',
    minDays: 61,
    maxDays: 90,
    badgeClass: 'bg-amber-950/40 text-amber-400 border-amber-800',
    colorToken: 'amber'
  },
  AGING_91_120: {
    id: 'AGING_91_120',
    label: '91–120 Days',
    minDays: 91,
    maxDays: 120,
    badgeClass: 'bg-amber-950/60 text-amber-300 border-amber-700',
    colorToken: 'amber'
  },
  AGING_120_PLUS: {
    id: 'AGING_120_PLUS',
    label: '120+ Days (Severe)',
    minDays: 121,
    maxDays: Infinity,
    badgeClass: 'bg-rose-950/50 text-rose-300 border-rose-700 font-bold',
    colorToken: 'rose'
  }
};

// 4. Aging Days & Bucket Computation
export function calculateAgingDays(statementDateStr, currentDateStr = null) {
  if (!statementDateStr) return 0;
  const current = currentDateStr ? new Date(currentDateStr) : new Date();
  const stmt = new Date(statementDateStr);
  if (isNaN(stmt.getTime()) || isNaN(current.getTime())) return 0;

  const diffTime = current.getTime() - stmt.getTime();
  const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return days > 0 ? days : 0;
}

export function classifyAgingBucket(agingDays) {
  const days = Number(agingDays) || 0;
  if (days <= 30) return AGING_BUCKETS.CURRENT_0_30;
  if (days <= 60) return AGING_BUCKETS.AGING_31_60;
  if (days <= 90) return AGING_BUCKETS.AGING_61_90;
  if (days <= 120) return AGING_BUCKETS.AGING_91_120;
  return AGING_BUCKETS.AGING_120_PLUS;
}

// 5. Deterministic Financial Invariant Arithmetic
export function calculateCurrentBalance(originalAmount, adjustmentsAmount = 0.00, paidAmount = 0.00) {
  const orig = Number(originalAmount) || 0;
  const adj = Number(adjustmentsAmount) || 0;
  const paid = Number(paidAmount) || 0;
  const rem = orig - adj - paid;
  return Number(Math.max(0, rem).toFixed(2));
}

export function calculatePromptPayDiscount(currentBalance, discountPct = 15.0) {
  const bal = Number(currentBalance) || 0;
  const pct = Number(discountPct) || 0;
  const discountAmount = Number(((bal * pct) / 100.0).toFixed(2));
  const settledAmount = Number((bal - discountAmount).toFixed(2));
  return {
    discountAmount,
    settledAmount,
    discountPct: pct
  };
}

// 6. Executive KPI Aggregation
export function calculatePatientBalanceKpis(balancesList = []) {
  let totalOriginalDollars = 0;
  let totalAdjustmentsDollars = 0;
  let totalCollectedDollars = 0;
  let totalOutstandingDollars = 0;
  let paymentPlanCount = 0;
  let delinquentCount = 0;
  let delinquentDollars = 0;
  let paidInFullCount = 0;

  balancesList.forEach(b => {
    const orig = Number(b.originalBalanceAmount) || 0;
    const adj = Number(b.adjustmentsAmount) || 0;
    const paid = Number(b.paidAmount) || 0;
    const current = calculateCurrentBalance(orig, adj, paid);

    totalOriginalDollars += orig;
    totalAdjustmentsDollars += adj;
    totalCollectedDollars += paid;
    totalOutstandingDollars += current;

    if (b.isPaymentPlan) paymentPlanCount++;
    if (b.status === 'PAID_IN_FULL') paidInFullCount++;

    if (b.status === 'DELINQUENT_PRE_COLLECTIONS' || b.status === 'EXTERNAL_COLLECTIONS') {
      delinquentCount++;
      delinquentDollars += current;
    }
  });

  const collectionYieldPct = totalOriginalDollars > 0
    ? Number(((totalCollectedDollars / totalOriginalDollars) * 100).toFixed(1))
    : 0;

  return {
    totalOriginalDollars: Number(totalOriginalDollars.toFixed(2)),
    totalAdjustmentsDollars: Number(totalAdjustmentsDollars.toFixed(2)),
    totalCollectedDollars: Number(totalCollectedDollars.toFixed(2)),
    totalOutstandingDollars: Number(totalOutstandingDollars.toFixed(2)),
    paymentPlanCount,
    delinquentCount,
    delinquentDollars: Number(delinquentDollars.toFixed(2)),
    paidInFullCount,
    collectionYieldPct,
    totalAccounts: balancesList.length
  };
}

// 7. Baseline Representative Patient Balances Data
export function getBaselinePatientBalances() {
  return [
    {
      id: 'pbl-001',
      facilityId: 'fac-001',
      balanceControlNumber: 'PBL-2026-0012',
      claimNumber: 'CLM-2026-0042',
      patientName: 'Garon, Suzanne',
      patientMrn: 'MRN-84920',
      guarantorName: 'Garon, Mark (Spouse)',
      responsibilityType: 'DEDUCTIBLE',
      status: 'STATEMENT_SENT',
      originalBalanceAmount: 1250.00,
      adjustmentsAmount: 0.00,
      paidAmount: 250.00,
      statementDate: '2026-10-15',
      statementCount: 1,
      lastPaymentDate: '2026-10-28',
      isPaymentPlan: false,
      paymentPlanMonthlyAmt: 0.00,
      paymentPlanTermsMonths: 0,
      notes: 'Initial post-835 patient deductible statement dispatched.'
    },
    {
      id: 'pbl-002',
      facilityId: 'fac-001',
      balanceControlNumber: 'PBL-2026-0034',
      claimNumber: 'CLM-2026-0088',
      patientName: 'Smith, Johnathan',
      patientMrn: 'MRN-77312',
      guarantorName: 'Self',
      responsibilityType: 'COINSURANCE',
      status: 'PAYMENT_PLAN_ACTIVE',
      originalBalanceAmount: 1800.00,
      adjustmentsAmount: 0.00,
      paidAmount: 600.00,
      statementDate: '2026-08-20',
      statementCount: 3,
      lastPaymentDate: '2026-10-20',
      isPaymentPlan: true,
      paymentPlanMonthlyAmt: 200.00,
      paymentPlanTermsMonths: 9,
      notes: 'Structured 9-month installment plan ($200/mo) active and auto-debiting on 20th.'
    },
    {
      id: 'pbl-003',
      facilityId: 'fac-001',
      balanceControlNumber: 'PBL-2026-0056',
      claimNumber: 'CLM-2026-0105',
      patientName: 'Chen, Wei',
      patientMrn: 'MRN-91044',
      guarantorName: 'Self',
      responsibilityType: 'COPAY',
      status: 'PAID_IN_FULL',
      originalBalanceAmount: 250.00,
      adjustmentsAmount: 0.00,
      paidAmount: 250.00,
      statementDate: '2026-09-30',
      statementCount: 1,
      lastPaymentDate: '2026-10-02',
      isPaymentPlan: false,
      paymentPlanMonthlyAmt: 0.00,
      paymentPlanTermsMonths: 0,
      notes: 'Collected via patient portal via Visa card on day 2.'
    },
    {
      id: 'pbl-004',
      facilityId: 'fac-001',
      balanceControlNumber: 'PBL-2026-0078',
      claimNumber: 'CLM-2026-0144',
      patientName: 'Rodriguez, Carmen',
      patientMrn: 'MRN-60219',
      guarantorName: 'Self',
      responsibilityType: 'NON_COVERED',
      status: 'DELINQUENT_PRE_COLLECTIONS',
      originalBalanceAmount: 950.00,
      adjustmentsAmount: 0.00,
      paidAmount: 0.00,
      statementDate: '2026-07-15',
      statementCount: 3,
      lastPaymentDate: null,
      isPaymentPlan: false,
      paymentPlanMonthlyAmt: 0.00,
      paymentPlanTermsMonths: 0,
      notes: 'Over 90 days past due. Final demand letter served on 2026-10-18.'
    },
    {
      id: 'pbl-005',
      facilityId: 'fac-001',
      balanceControlNumber: 'PBL-2026-0099',
      claimNumber: 'CLM-2026-0199',
      patientName: 'Kowalski, David',
      patientMrn: 'MRN-55418',
      guarantorName: 'Self',
      responsibilityType: 'SELF_PAY',
      status: 'PARTIALLY_PAID',
      originalBalanceAmount: 3500.00,
      adjustmentsAmount: 350.00, // 10% prompt pay discount
      paidAmount: 2000.00,
      statementDate: '2026-09-10',
      statementCount: 2,
      lastPaymentDate: '2026-09-24',
      isPaymentPlan: false,
      paymentPlanMonthlyAmt: 0.00,
      paymentPlanTermsMonths: 0,
      notes: '10% prompt pay discount applied ($350). Balance $1,150 outstanding.'
    },
    {
      id: 'pbl-006',
      facilityId: 'fac-001',
      balanceControlNumber: 'PBL-2026-0120',
      claimNumber: 'CLM-2026-0210',
      patientName: 'Adams, Robert',
      patientMrn: 'MRN-33109',
      guarantorName: 'Self',
      responsibilityType: 'DEDUCTIBLE',
      status: 'ADJUDICATED_FINAL',
      originalBalanceAmount: 480.00,
      adjustmentsAmount: 0.00,
      paidAmount: 0.00,
      statementDate: null,
      statementCount: 0,
      lastPaymentDate: null,
      isPaymentPlan: false,
      paymentPlanMonthlyAmt: 0.00,
      paymentPlanTermsMonths: 0,
      notes: '835 remittance posted today; initial statement queued for nightly batch.'
    }
  ];
}

const patientBalancesService = {
  RESPONSIBILITY_TYPES,
  BALANCE_STATUSES,
  AGING_BUCKETS,
  calculateAgingDays,
  classifyAgingBucket,
  calculateCurrentBalance,
  calculatePromptPayDiscount,
  calculatePatientBalanceKpis,
  getBaselinePatientBalances
};

export default patientBalancesService;
