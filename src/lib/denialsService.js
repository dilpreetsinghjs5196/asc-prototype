/**
 * denialsService.js
 * Phase 85: Denials Model & Management Engine
 * Authoritative financial computations, deadline urgency tracking,
 * root-cause classification, team assignment, and executive KPI calculations.
 */

// 1. Denial Root Cause Taxonomy
export const DENIAL_CATEGORIES = {
  PRE_AUTH_ABSENT_EXPIRED: {
    id: 'PRE_AUTH_ABSENT_EXPIRED',
    label: 'Prior Authorization Absent/Expired',
    type: 'CLINICAL',
    defaultTeam: 'CLINICAL_APPEALS',
    defaultProbability: 70.0,
    defaultFilingDays: 90,
    badgeClass: 'bg-amber-950/40 text-amber-400 border-amber-800',
    description: 'Service performed without approved prior authorization or authorization window expired prior to surgery date.'
  },
  MEDICAL_NECESSITY_LCD: {
    id: 'MEDICAL_NECESSITY_LCD',
    label: 'Medical Necessity / LCD Failure',
    type: 'CLINICAL',
    defaultTeam: 'CLINICAL_APPEALS',
    defaultProbability: 65.0,
    defaultFilingDays: 120,
    badgeClass: 'bg-rose-950/40 text-rose-400 border-rose-800',
    description: 'Documentation failed to satisfy Local/National Coverage Determination clinical indication thresholds.'
  },
  CODING_MODIFIER_UNBUNDLED: {
    id: 'CODING_MODIFIER_UNBUNDLED',
    label: 'Coding, Modifier & Bundling Error',
    type: 'TECHNICAL',
    defaultTeam: 'BILLING_AND_CODING',
    defaultProbability: 85.0,
    defaultFilingDays: 90,
    badgeClass: 'bg-sky-950/40 text-sky-400 border-sky-800',
    description: 'Incompatible or missing anatomical/distinct procedural modifiers (e.g., 59, 51, RT/LT) or CMS NCCI PTP edits.'
  },
  TIMELY_FILING_EXCEEDED: {
    id: 'TIMELY_FILING_EXCEEDED',
    label: 'Timely Filing Window Exceeded',
    type: 'TECHNICAL',
    defaultTeam: 'BILLING_AND_CODING',
    defaultProbability: 15.0,
    defaultFilingDays: 30,
    badgeClass: 'bg-rose-950/40 text-rose-400 border-rose-800',
    description: 'Initial claim or appeal package delivered past the contractual payer submission deadline.'
  },
  ELIGIBILITY_TERMINATED: {
    id: 'ELIGIBILITY_TERMINATED',
    label: 'Eligibility Inactive / Terminated',
    type: 'ADMINISTRATIVE',
    defaultTeam: 'PATIENT_ACCESS',
    defaultProbability: 75.0,
    defaultFilingDays: 60,
    badgeClass: 'bg-amber-950/40 text-amber-400 border-amber-800',
    description: 'Member coverage ceased before surgical encounter date or patient presented superseded policy ID.'
  },
  COB_PRIMARY_EOB_MISSING: {
    id: 'COB_PRIMARY_EOB_MISSING',
    label: 'Coordination of Benefits / EOB Missing',
    type: 'ADMINISTRATIVE',
    defaultTeam: 'PATIENT_ACCESS',
    defaultProbability: 80.0,
    defaultFilingDays: 90,
    badgeClass: 'bg-sky-950/40 text-sky-400 border-sky-800',
    description: 'Secondary or commercial payer rejected claim pending submission of primary payer Explanation of Benefits.'
  },
  DUPLICATE_CLAIM_SERVICE: {
    id: 'DUPLICATE_CLAIM_SERVICE',
    label: 'Duplicate Submission Adjudication',
    type: 'TECHNICAL',
    defaultTeam: 'BILLING_AND_CODING',
    defaultProbability: 25.0,
    defaultFilingDays: 60,
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
    description: 'Payer claim scrub flagged identical procedure or encounter already adjudicated in a prior remittance.'
  },
  NON_COVERED_PROCEDURE: {
    id: 'NON_COVERED_PROCEDURE',
    label: 'Contractual Non-Covered Service',
    type: 'CLINICAL',
    defaultTeam: 'MANAGED_CARE_CONTRACTING',
    defaultProbability: 30.0,
    defaultFilingDays: 90,
    badgeClass: 'bg-rose-950/40 text-rose-400 border-rose-800',
    description: 'Specific CPT or surgical implant hardware excluded under member plan document or carve-out schedule.'
  },
  CREDENTIALING_BILLING_NPI: {
    id: 'CREDENTIALING_BILLING_NPI',
    label: 'Provider Enrollment / NPI Error',
    type: 'ADMINISTRATIVE',
    defaultTeam: 'MANAGED_CARE_CONTRACTING',
    defaultProbability: 90.0,
    defaultFilingDays: 180,
    badgeClass: 'bg-emerald-950/40 text-emerald-400 border-emerald-800',
    description: 'Operating surgeon or facility NPI taxonomy unlinked in payer provider network master file.'
  },
  OTHER_ADMINISTRATIVE: {
    id: 'OTHER_ADMINISTRATIVE',
    label: 'General Administrative Review',
    type: 'ADMINISTRATIVE',
    defaultTeam: 'BILLING_AND_CODING',
    defaultProbability: 50.0,
    defaultFilingDays: 90,
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
    description: 'Miscellaneous remittance rejection requiring clearinghouse audit or manual payer representative inquiry.'
  }
};

// 2. Denial Status State Machine
export const DENIAL_STATUSES = {
  IDENTIFIED: {
    id: 'IDENTIFIED',
    label: 'Identified',
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700'
  },
  TRIAGED: {
    id: 'TRIAGED',
    label: 'Triaged',
    badgeClass: 'bg-sky-950/40 text-sky-400 border-sky-800'
  },
  IN_PROGRESS: {
    id: 'IN_PROGRESS',
    label: 'In Review',
    badgeClass: 'bg-sky-950/40 text-sky-400 border-sky-800'
  },
  ADDITIONAL_INFO_REQUESTED: {
    id: 'ADDITIONAL_INFO_REQUESTED',
    label: 'Info Requested',
    badgeClass: 'bg-amber-950/40 text-amber-400 border-amber-800'
  },
  APPEALED_LEVEL_1: {
    id: 'APPEALED_LEVEL_1',
    label: 'Level 1 Appeal',
    badgeClass: 'bg-amber-950/40 text-amber-400 border-amber-800'
  },
  APPEALED_LEVEL_2: {
    id: 'APPEALED_LEVEL_2',
    label: 'Level 2 Appeal',
    badgeClass: 'bg-amber-950/40 text-amber-400 border-amber-800'
  },
  REBILLED: {
    id: 'REBILLED',
    label: 'Corrected & Rebilled',
    badgeClass: 'bg-emerald-950/40 text-emerald-400 border-emerald-800'
  },
  OVERTURNED_PAID: {
    id: 'OVERTURNED_PAID',
    label: 'Overturned & Paid',
    badgeClass: 'bg-emerald-950/40 text-emerald-400 border-emerald-800'
  },
  UPHELD_FINAL: {
    id: 'UPHELD_FINAL',
    label: 'Upheld Final',
    badgeClass: 'bg-rose-950/40 text-rose-400 border-rose-800'
  },
  WRITTEN_OFF: {
    id: 'WRITTEN_OFF',
    label: 'Written Off',
    badgeClass: 'bg-rose-950/40 text-rose-400 border-rose-800'
  }
};

// 3. Functional Team Routing Queues
export const ASSIGNED_TEAMS = {
  CLINICAL_APPEALS: {
    id: 'CLINICAL_APPEALS',
    name: 'Clinical Appeals & Medical Necessity',
    leadRole: 'Clinical Documentation Specialist / Surgeon Liaison',
    description: 'Reviews operative records, dictations, and drafts LCD/NCD medical necessity appeal briefs.'
  },
  BILLING_AND_CODING: {
    id: 'BILLING_AND_CODING',
    name: 'Billing, Coding & Modifier Resubmissions',
    leadRole: 'Certified Professional Coder (CPC) / RCM Biller',
    description: 'Corrects unbundling, modifier mismatch (59/RT/LT), revenue code, and NCCI PTP edits for rebill.'
  },
  PATIENT_ACCESS: {
    id: 'PATIENT_ACCESS',
    name: 'Patient Access, Eligibility & COB',
    leadRole: 'Patient Access Lead / Financial Counselor',
    description: 'Investigates insurance coverage effective dates, primary EOB capture, and patient balance statements.'
  },
  MANAGED_CARE_CONTRACTING: {
    id: 'MANAGED_CARE_CONTRACTING',
    name: 'Managed Care & Payer Contracting',
    leadRole: 'Managed Care Director / Contracting Analyst',
    description: 'Manages commercial fee schedule variances, implant carve-out underpayments, and provider credentialing.'
  }
};

// 4. Urgency Tier Configurations
export const URGENCY_TIERS = {
  CRITICAL_OVERDUE: {
    id: 'CRITICAL_OVERDUE',
    label: 'Overdue / Timely Filing Risk',
    badgeClass: 'bg-rose-950/50 text-rose-400 border-rose-700',
    color: 'rose'
  },
  URGENT_UNDER_15_DAYS: {
    id: 'URGENT_UNDER_15_DAYS',
    label: 'Urgent (< 15 Days)',
    badgeClass: 'bg-rose-950/40 text-rose-400 border-rose-800',
    color: 'rose'
  },
  APPROACHING_30_DAYS: {
    id: 'APPROACHING_30_DAYS',
    label: 'Approaching (15–30 Days)',
    badgeClass: 'bg-amber-950/40 text-amber-400 border-amber-800',
    color: 'amber'
  },
  ON_TRACK: {
    id: 'ON_TRACK',
    label: 'On Track (> 30 Days)',
    badgeClass: 'bg-emerald-950/40 text-emerald-400 border-emerald-800',
    color: 'emerald'
  }
};

/**
 * Calculates remaining calendar days until filing deadline.
 */
export function calculateDaysToDeadline(appealDeadlineDate, currentDate = new Date()) {
  const deadline = new Date(appealDeadlineDate);
  const current = new Date(currentDate);
  
  // Normalize both dates to midnight UTC to prevent daylight saving off-by-one errors
  const utcDeadline = Date.UTC(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
  const utcCurrent = Date.UTC(current.getFullYear(), current.getMonth(), current.getDate());
  
  const diffMs = utcDeadline - utcCurrent;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Classifies deadline urgency tier based on remaining days.
 */
export function getUrgencyTier(daysRemaining) {
  if (daysRemaining < 0) {
    return URGENCY_TIERS.CRITICAL_OVERDUE;
  }
  if (daysRemaining <= 14) {
    return URGENCY_TIERS.URGENT_UNDER_15_DAYS;
  }
  if (daysRemaining <= 30) {
    return URGENCY_TIERS.APPROACHING_30_DAYS;
  }
  return URGENCY_TIERS.ON_TRACK;
}

/**
 * Deterministic expected recovery dollar computation.
 */
export function calculateExpectedRecovery(deniedAmount, recoveryProbabilityPct) {
  const amt = parseFloat(deniedAmount) || 0;
  const prob = parseFloat(recoveryProbabilityPct) || 0;
  return Math.round((amt * prob / 100.0) * 100) / 100;
}

/**
 * Calculates aggregate Executive KPIs across denials dataset.
 */
export function calculateDenialKpis(denials = []) {
  let totalDenialExposure = 0;
  let expectedRecoverableOpportunity = 0;
  let criticalDeadlinesCount = 0;
  let totalRecovered = 0;
  let totalClosed = 0;
  let totalOverturned = 0;

  denials.forEach(d => {
    const isClosed = ['OVERTURNED_PAID', 'UPHELD_FINAL', 'WRITTEN_OFF'].includes(d.status);
    const isOpen = !isClosed;
    const denied = parseFloat(d.deniedAmount) || 0;
    const prob = parseFloat(d.recoveryProbabilityPct) || 0;
    const recovered = parseFloat(d.recoveredAmount) || 0;

    if (isOpen) {
      totalDenialExposure += denied;
      expectedRecoverableOpportunity += calculateExpectedRecovery(denied, prob);
      
      const days = calculateDaysToDeadline(d.appealDeadlineDate);
      if (days <= 14) {
        criticalDeadlinesCount += 1;
      }
    }

    if (isClosed) {
      totalClosed += 1;
      totalRecovered += recovered;
      if (d.status === 'OVERTURNED_PAID') {
        totalOverturned += 1;
      }
    }
  });

  const netOverturnRate = totalClosed > 0
    ? Math.round((totalOverturned / totalClosed) * 1000) / 10
    : 72.5; // Realistic default ASC benchmark

  return {
    totalDenialExposure: Math.round(totalDenialExposure * 100) / 100,
    expectedRecoverableOpportunity: Math.round(expectedRecoverableOpportunity * 100) / 100,
    criticalDeadlinesCount,
    netOverturnRate,
    totalCount: denials.length,
    openCount: denials.filter(d => !['OVERTURNED_PAID', 'UPHELD_FINAL', 'WRITTEN_OFF'].includes(d.status)).length
  };
}

/**
 * Baseline representative ASC denial records for demonstration and test fixtures.
 */
export function getBaselineDenials() {
  const now = new Date();
  const formatOffsetDate = (days) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  return [
    {
      id: 'den-001',
      denialControlNumber: 'DEN-2026-0841',
      claimNumber: 'CLM-2026-0104',
      patientName: 'Eleanor Vance',
      patientMrn: 'MRN-882190',
      payerName: 'Blue Cross Blue Shield FL',
      payerId: 'pay-bcbs-fl',
      carcCode: '197',
      rarcCode: 'N517',
      groupCode: 'CO',
      denialCategory: 'PRE_AUTH_ABSENT_EXPIRED',
      denialType: 'CLINICAL',
      deniedAmount: 1850.00,
      billedAmount: 3450.00,
      expectedAmount: 1850.00,
      isRecoverable: true,
      recoveryProbabilityPct: 70.00,
      recoveredAmount: 0.00,
      writtenOffAmount: 0.00,
      denialDate: formatOffsetDate(-30),
      filingDeadlineDays: 45,
      appealDeadlineDate: formatOffsetDate(15), // 15 days remaining -> Approaching
      assignedTeam: 'CLINICAL_APPEALS',
      assignedUser: 'Dr. Sarah Lin (Clinical Appeals)',
      status: 'IN_PROGRESS',
      currentAppealLevel: 1,
      procedureDescription: 'Right Knee Arthroscopic Meniscectomy (CPT 29881)',
      notes: 'Initial prior authorization missing bilateral modifier validation. Retroactive cert requested.'
    },
    {
      id: 'den-002',
      denialControlNumber: 'DEN-2026-0842',
      claimNumber: 'CLM-2026-0106',
      patientName: 'Marcus Holloway',
      patientMrn: 'MRN-991204',
      payerName: 'UnitedHealthcare Commercial',
      payerId: 'pay-uhc',
      carcCode: '16',
      rarcCode: 'N56',
      groupCode: 'CO',
      denialCategory: 'CODING_MODIFIER_UNBUNDLED',
      denialType: 'TECHNICAL',
      deniedAmount: 920.00,
      billedAmount: 2100.00,
      expectedAmount: 920.00,
      isRecoverable: true,
      recoveryProbabilityPct: 85.00,
      recoveredAmount: 0.00,
      writtenOffAmount: 0.00,
      denialDate: formatOffsetDate(-25),
      filingDeadlineDays: 30,
      appealDeadlineDate: formatOffsetDate(5), // 5 days remaining -> Urgent (< 15 days)
      assignedTeam: 'BILLING_AND_CODING',
      assignedUser: 'Jessica Martinez (CPC Biller)',
      status: 'TRIAGED',
      currentAppealLevel: 0,
      procedureDescription: 'Cataract Phacoemulsification with IOL (CPT 66984)',
      notes: 'Missing required 59 modifier on companion sub-tenon injection. Rebill ready.'
    },
    {
      id: 'den-003',
      denialControlNumber: 'DEN-2026-0843',
      claimNumber: 'CLM-2026-0108',
      patientName: 'Robert Langdon',
      patientMrn: 'MRN-773412',
      payerName: 'Medicare Part B Florida',
      payerId: 'pay-medicare-fl',
      carcCode: '50',
      rarcCode: 'N115',
      groupCode: 'CO',
      denialCategory: 'MEDICAL_NECESSITY_LCD',
      denialType: 'CLINICAL',
      deniedAmount: 3200.00,
      billedAmount: 5600.00,
      expectedAmount: 3200.00,
      isRecoverable: true,
      recoveryProbabilityPct: 65.00,
      recoveredAmount: 0.00,
      writtenOffAmount: 0.00,
      denialDate: formatOffsetDate(-40),
      filingDeadlineDays: 120,
      appealDeadlineDate: formatOffsetDate(80), // 80 days remaining -> On Track
      assignedTeam: 'CLINICAL_APPEALS',
      assignedUser: 'Dr. Sarah Lin (Clinical Appeals)',
      status: 'APPEALED_LEVEL_1',
      currentAppealLevel: 1,
      procedureDescription: 'Laparoscopic Inguinal Hernia Repair (CPT 49505)',
      notes: 'Conservative therapy trial records compiled with surgeon narrative for Level 1 appeal.'
    },
    {
      id: 'den-004',
      denialControlNumber: 'DEN-2026-0844',
      claimNumber: 'CLM-2026-0110',
      patientName: 'Theresa May',
      patientMrn: 'MRN-661298',
      payerName: 'Aetna Health Plan',
      payerId: 'pay-aetna',
      carcCode: '29',
      rarcCode: 'N211',
      groupCode: 'CO',
      denialCategory: 'TIMELY_FILING_EXCEEDED',
      denialType: 'TECHNICAL',
      deniedAmount: 1450.00,
      billedAmount: 2800.00,
      expectedAmount: 1450.00,
      isRecoverable: false,
      recoveryProbabilityPct: 15.00,
      recoveredAmount: 0.00,
      writtenOffAmount: 0.00,
      denialDate: formatOffsetDate(-95),
      filingDeadlineDays: 90,
      appealDeadlineDate: formatOffsetDate(-5), // -5 days remaining -> Critical Overdue
      assignedTeam: 'BILLING_AND_CODING',
      assignedUser: 'David Chen (Billing Specialist)',
      status: 'IDENTIFIED',
      currentAppealLevel: 0,
      procedureDescription: 'Carpal Tunnel Release (CPT 29848)',
      notes: 'Proof of clearinghouse initial electronic submission being gathered to contest timely filing window.'
    },
    {
      id: 'den-005',
      denialControlNumber: 'DEN-2026-0845',
      claimNumber: 'CLM-2026-0112',
      patientName: 'Anthony Quinn',
      patientMrn: 'MRN-554182',
      payerName: 'Cigna Healthcare',
      payerId: 'pay-cigna',
      carcCode: '27',
      rarcCode: 'N30',
      groupCode: 'CO',
      denialCategory: 'ELIGIBILITY_TERMINATED',
      denialType: 'ADMINISTRATIVE',
      deniedAmount: 750.00,
      billedAmount: 1600.00,
      expectedAmount: 750.00,
      isRecoverable: true,
      recoveryProbabilityPct: 75.00,
      recoveredAmount: 0.00,
      writtenOffAmount: 0.00,
      denialDate: formatOffsetDate(-10),
      filingDeadlineDays: 60,
      appealDeadlineDate: formatOffsetDate(50), // 50 days -> On Track
      assignedTeam: 'PATIENT_ACCESS',
      assignedUser: 'Maria Santos (Patient Access)',
      status: 'IN_PROGRESS',
      currentAppealLevel: 0,
      procedureDescription: 'Colonoscopy Diagnostic (CPT 45378)',
      notes: 'Patient changed employer policy 2 weeks prior to DOS. New Humana subscriber ID obtained.'
    },
    {
      id: 'den-006',
      denialControlNumber: 'DEN-2026-0846',
      claimNumber: 'CLM-2026-0114',
      patientName: 'Samuel Jackson',
      patientMrn: 'MRN-442190',
      payerName: 'Humana Medicare Advantage',
      payerId: 'pay-humana',
      carcCode: '22',
      rarcCode: 'N103',
      groupCode: 'CO',
      denialCategory: 'COB_PRIMARY_EOB_MISSING',
      denialType: 'ADMINISTRATIVE',
      deniedAmount: 1100.00,
      billedAmount: 2200.00,
      expectedAmount: 1100.00,
      isRecoverable: true,
      recoveryProbabilityPct: 80.00,
      recoveredAmount: 0.00,
      writtenOffAmount: 0.00,
      denialDate: formatOffsetDate(-18),
      filingDeadlineDays: 90,
      appealDeadlineDate: formatOffsetDate(72), // 72 days -> On Track
      assignedTeam: 'PATIENT_ACCESS',
      assignedUser: 'Maria Santos (Patient Access)',
      status: 'ADDITIONAL_INFO_REQUESTED',
      currentAppealLevel: 0,
      procedureDescription: 'Shoulder Arthroscopy Decompression (CPT 29826)',
      notes: 'Primary auto liability EOB settlement voucher obtained. Secondary claim ready to transmit.'
    }
  ];
}

const denialsService = {
  DENIAL_CATEGORIES,
  DENIAL_STATUSES,
  ASSIGNED_TEAMS,
  URGENCY_TIERS,
  calculateDaysToDeadline,
  getUrgencyTier,
  calculateExpectedRecovery,
  calculateDenialKpis,
  getBaselineDenials
};

export default denialsService;
