/**
 * ==============================================================================
 * Phase B7: CPT Denial and Payment Performance Service
 * Module 11: Surgeon & Clinical Intelligence / Executive Intelligence
 * Description: Deterministic procedural revenue cycle intelligence: first-pass
 *              denial rates, clean claim velocity, days to pay (turnaround),
 *              CARC/RARC root-cause breakdowns, scrubber edit preventability,
 *              denial overturn recovery, and cross-payer payment variation.
 * ==============================================================================
 */

export const PAYMENT_PERFORMANCE_TIERS = {
  EXCELLENT_FLOW: {
    key: 'EXCELLENT_FLOW',
    label: 'Excellent Flow',
    description: 'Rapid turnaround (≤ 21d), low denial (≤ 4%), clean claim rate (≥ 95%), high overturn',
    color: '#059669',
    badgeBg: 'rgba(5, 150, 105, 0.12)',
    badgeBorder: 'rgba(5, 150, 105, 0.35)'
  },
  ACCEPTABLE_FLOW: {
    key: 'ACCEPTABLE_FLOW',
    label: 'Acceptable Flow',
    description: 'Standard ASC commercial velocity (22 - 30d), normal denial rate (4.1% - 8.0%)',
    color: '#0284c7',
    badgeBg: 'rgba(2, 132, 199, 0.12)',
    badgeBorder: 'rgba(2, 132, 199, 0.35)'
  },
  FRICTION_AT_RISK: {
    key: 'FRICTION_AT_RISK',
    label: 'Friction / At-Risk',
    description: 'Heightened scrutiny, documentation requests, extended days to pay (31 - 45d), denial 8.1% - 14%',
    color: '#d97706',
    badgeBg: 'rgba(217, 119, 6, 0.12)',
    badgeBorder: 'rgba(217, 119, 6, 0.35)'
  },
  CHRONIC_DENIAL_SINK: {
    key: 'CHRONIC_DENIAL_SINK',
    label: 'Chronic Denial Sink',
    description: 'Severe cash lockup, high hard denial (> 14%), protracted lag (> 45d), or high underpayment (> 12%)',
    color: '#dc2626',
    badgeBg: 'rgba(220, 38, 38, 0.12)',
    badgeBorder: 'rgba(220, 38, 38, 0.35)'
  }
};

export const DENIAL_BENCHMARKS = {
  TARGET_CLEAN_CLAIM_RATE: 95.0,
  MAX_ACCEPTABLE_DENIAL_RATE: 8.0,
  MAX_ACCEPTABLE_DAYS_TO_PAY: 30.0,
  TARGET_OVERTURN_RATE: 80.0,
  MAX_UNDERPAYMENT_RATE: 5.0
};

export const COMMON_CARC_CODES = {
  'CO-50': {
    code: 'CO-50',
    name: 'Medical Necessity Lacking',
    category: 'MEDICAL_NECESSITY',
    description: 'Non-covered services because this is not deemed a medical necessity by the payer.',
    preventable: true,
    scrubberRule: 'Clinical Indication / Diagnosis Crosswalk Rule'
  },
  'CO-197': {
    code: 'CO-197',
    name: 'Pre-certification/Prior Authorization Absent',
    category: 'AUTHORIZATION',
    description: 'Pre-certification/authorization/notification/pre-treatment absent or expired.',
    preventable: true,
    scrubberRule: 'Prior Authorization Number & Effective Date Verification'
  },
  'CO-97': {
    code: 'CO-97',
    name: 'Bundled / Incidental Procedure',
    category: 'BUNDLING_CCI',
    description: 'The benefit for this service is included in the payment/allowance for another service adjudicated (CCI edit).',
    preventable: true,
    scrubberRule: 'Correct Coding Initiative (CCI) Bundling & Modifier 59 / XS Rule'
  },
  'CO-16': {
    code: 'CO-16',
    name: 'Missing Operative Note / Documentation',
    category: 'DOCUMENTATION',
    description: 'Claim/service lacks information or has submission error; operative notes requested.',
    preventable: true,
    scrubberRule: 'Operative Note Attachment Verification & Scrubber Gate'
  },
  'CO-45': {
    code: 'CO-45',
    name: 'Contracted Fee Schedule Dispute / Underpayment',
    category: 'FEE_SCHEDULE',
    description: 'Charge exceeds fee schedule/maximum allowable or contracted fee amount.',
    preventable: false,
    scrubberRule: 'Automated Contractual Allowed vs Paid Discrepancy Workqueue'
  },
  'CO-18': {
    code: 'CO-18',
    name: 'Duplicate Billing',
    category: 'DUPLICATE',
    description: 'Exact duplicate claim or service line previously adjudicated.',
    preventable: true,
    scrubberRule: 'Pre-Submission Duplicate Invoicing & Historical Claim Check'
  }
};

/**
 * Calculate First-Pass Denial Rate (%)
 * (deniedClaims / totalClaims) * 100
 */
export function calculateDenialRate(deniedClaims = 0, totalClaims = 0) {
  if (!totalClaims || totalClaims <= 0) return 0.0;
  const rate = ((deniedClaims || 0) / totalClaims) * 100;
  return Number(Math.max(0, Math.min(100, rate)).toFixed(2));
}

/**
 * Calculate Clean Claim Rate (%)
 * (cleanClaims / totalClaims) * 100
 */
export function calculateCleanClaimRate(cleanClaims = 0, totalClaims = 0) {
  if (!totalClaims || totalClaims <= 0) return 0.0;
  const rate = ((cleanClaims || 0) / totalClaims) * 100;
  return Number(Math.max(0, Math.min(100, rate)).toFixed(2));
}

/**
 * Calculate Adjudication Velocity (Days to Pay)
 * totalDays / paidClaims
 */
export function calculateDaysToPay(totalDays = 0, paidClaims = 0) {
  if (!paidClaims || paidClaims <= 0) return 0.0;
  const days = (totalDays || 0) / paidClaims;
  return Number(Math.max(0, days).toFixed(1));
}

/**
 * Calculate Denial Overturn Rate (%)
 * (overturnedCount / appealedCount) * 100
 */
export function calculateOverturnRate(overturnedCount = 0, appealedCount = 0) {
  if (!appealedCount || appealedCount <= 0) return 0.0;
  const rate = ((overturnedCount || 0) / appealedCount) * 100;
  return Number(Math.max(0, Math.min(100, rate)).toFixed(2));
}

/**
 * Calculate Contractual Underpayment Rate (%)
 * (underpaidCount / paidClaims) * 100
 */
export function calculateUnderpaymentRate(underpaidCount = 0, paidClaims = 0) {
  if (!paidClaims || paidClaims <= 0) return 0.0;
  const rate = ((underpaidCount || 0) / paidClaims) * 100;
  return Number(Math.max(0, Math.min(100, rate)).toFixed(2));
}

/**
 * Calculate Underpayment Variance ($)
 * Expected contracted amount less actual allowed amount
 */
export function calculateUnderpaymentVariance(expectedTotal = 0, paidTotal = 0) {
  const variance = (expectedTotal || 0) - (paidTotal || 0);
  return Number(Math.max(0, variance).toFixed(2));
}

/**
 * Calculate Payment Velocity Index (PVI)
 * 0 to 100 normalized score of procedure payment friction and speed
 */
export function calculatePaymentVelocityIndex(denialRate = 0, daysToPay = 0, underpaymentRate = 0, overturnRate = 0) {
  let score = 100.0;
  // Penalty for denial rate
  score -= (denialRate || 0) * 2.0;
  // Penalty for excess days to pay beyond 15-day floor
  const excessDays = Math.max(0, (daysToPay || 0) - 15.0);
  score -= excessDays * 1.2;
  // Penalty for contractual underpayment
  score -= (underpaymentRate || 0) * 1.0;
  // Bonus for strong appeal overturn effectiveness
  score += ((overturnRate || 0) / 100) * 10.0;

  return Number(Math.max(0, Math.min(100, score)).toFixed(1));
}

/**
 * Classify Payment Performance Tier
 */
export function classifyPaymentPerformanceTier(denialRate = 0, daysToPay = 0, cleanClaimRate = 0, overturnRate = 0, underpaymentRate = 0) {
  if (denialRate > 14.0 || daysToPay > 45.0 || underpaymentRate > 12.0) {
    return 'CHRONIC_DENIAL_SINK';
  }
  if (denialRate > 8.0 || daysToPay > 30.0 || (overturnRate > 0 && overturnRate < 65.0)) {
    return 'FRICTION_AT_RISK';
  }
  if (denialRate <= 4.0 && daysToPay <= 21.0 && cleanClaimRate >= 95.0) {
    return 'EXCELLENT_FLOW';
  }
  return 'ACCEPTABLE_FLOW';
}

/**
 * Calculate Facility-wide Denial and Payment KPIs
 */
export function calculateFacilityDenialPaymentKpis(cptList = []) {
  if (!cptList || cptList.length === 0) {
    return {
      totalBilledClaims: 0,
      cleanClaimsCount: 0,
      cleanClaimRate: 0.0,
      firstPassDeniedClaims: 0,
      firstPassDenialRate: 0.0,
      avgDaysToPay: 0.0,
      totalUnderpaymentVariance: 0.0,
      totalOverturnedDollars: 0.0,
      appealedClaimsCount: 0,
      overturnedClaimsCount: 0,
      overturnRatePct: 0.0,
      chronicSinkCount: 0,
      frictionAtRiskCount: 0,
      tierDistribution: {
        EXCELLENT_FLOW: 0,
        ACCEPTABLE_FLOW: 0,
        FRICTION_AT_RISK: 0,
        CHRONIC_DENIAL_SINK: 0
      }
    };
  }

  let totalBilledClaims = 0;
  let totalCleanClaims = 0;
  let totalDeniedClaims = 0;
  let totalDaysTimesClaims = 0;
  let totalPaidClaims = 0;
  let totalUnderpaymentVariance = 0.0;
  let totalOverturnedDollars = 0.0;
  let totalAppealedClaims = 0;
  let totalOverturnedClaims = 0;

  const tierDistribution = {
    EXCELLENT_FLOW: 0,
    ACCEPTABLE_FLOW: 0,
    FRICTION_AT_RISK: 0,
    CHRONIC_DENIAL_SINK: 0
  };

  cptList.forEach(cpt => {
    const billed = cpt.totalBilledClaims || 0;
    const clean = cpt.cleanClaimsCount || 0;
    const denied = cpt.firstPassDeniedClaims || 0;
    const days = cpt.avgDaysToPay || 0;
    const paid = billed - denied;
    const underpayVar = cpt.underpaymentVarianceDollars || 0;
    const overturnDollars = cpt.overturnedDollars || 0;
    const appealed = cpt.appealedClaimsCount || 0;
    const overturned = cpt.overturnedClaimsCount || 0;

    totalBilledClaims += billed;
    totalCleanClaims += clean;
    totalDeniedClaims += denied;
    totalPaidClaims += Math.max(0, paid);
    totalDaysTimesClaims += days * billed;
    totalUnderpaymentVariance += underpayVar;
    totalOverturnedDollars += overturnDollars;
    totalAppealedClaims += appealed;
    totalOverturnedClaims += overturned;

    const tier = cpt.performanceTier || 'ACCEPTABLE_FLOW';
    if (tierDistribution[tier] !== undefined) {
      tierDistribution[tier]++;
    }
  });

  const facilityCleanClaimRate = calculateCleanClaimRate(totalCleanClaims, totalBilledClaims);
  const facilityDenialRate = calculateDenialRate(totalDeniedClaims, totalBilledClaims);
  const facilityAvgDaysToPay = totalBilledClaims > 0 ? Number((totalDaysTimesClaims / totalBilledClaims).toFixed(1)) : 0.0;
  const facilityOverturnRate = calculateOverturnRate(totalOverturnedClaims, totalAppealedClaims);

  return {
    totalBilledClaims,
    cleanClaimsCount: totalCleanClaims,
    cleanClaimRate: facilityCleanClaimRate,
    firstPassDeniedClaims: totalDeniedClaims,
    firstPassDenialRate: facilityDenialRate,
    avgDaysToPay: facilityAvgDaysToPay,
    totalUnderpaymentVariance: Number(totalUnderpaymentVariance.toFixed(2)),
    totalOverturnedDollars: Number(totalOverturnedDollars.toFixed(2)),
    appealedClaimsCount: totalAppealedClaims,
    overturnedClaimsCount: totalOverturnedClaims,
    overturnRatePct: facilityOverturnRate,
    chronicSinkCount: tierDistribution.CHRONIC_DENIAL_SINK || 0,
    frictionAtRiskCount: tierDistribution.FRICTION_AT_RISK || 0,
    tierDistribution
  };
}

/**
 * 10 Seed CPT Procedures with Real-World Clinical CARC breakdowns & Payer Variations
 */
export const SEED_CPT_DENIAL_PAYMENT = [
  {
    cptCode: '27447',
    procedureName: 'Total Knee Arthroplasty (TKA)',
    specialty: 'Orthopedics',
    totalBilledClaims: 320,
    cleanClaimsCount: 284,
    cleanClaimRate: 88.75,
    firstPassDeniedClaims: 36,
    firstPassDenialRate: 11.25,
    avgDaysToPay: 36.4,
    appealedClaimsCount: 32,
    overturnedClaimsCount: 25,
    overturnRatePct: 78.13,
    overturnedDollars: 168400.0,
    underpaidClaimsCount: 42,
    underpaymentRatePct: 13.13,
    underpaymentVarianceDollars: 84600.0,
    agedArOver90Pct: 8.4,
    paymentVelocityIndex: 64.2,
    performanceTier: 'FRICTION_AT_RISK',
    primaryCarcCode: 'CO-197',
    primaryCarcDescription: 'Prior Authorization Mismatch / Expired Pre-Cert',
    carcBreakdown: [
      {
        carcCode: 'CO-197',
        category: 'AUTHORIZATION',
        description: 'Prior Authorization Mismatch or Inpatient vs ASC site-of-service dispute',
        occurrenceCount: 18,
        deniedAmount: 142000.0,
        preventableByScrubber: true,
        recommendedScrubberRule: 'Pre-Bill Authorization Number & ASC Site Verification Gate'
      },
      {
        carcCode: 'CO-50',
        category: 'MEDICAL_NECESSITY',
        description: 'Medical necessity conservative therapy trial duration (e.g. 6-mo physical therapy records missing)',
        occurrenceCount: 11,
        deniedAmount: 86500.0,
        preventableByScrubber: true,
        recommendedScrubberRule: 'Conservative Therapy Documentation Validation Rule'
      },
      {
        carcCode: 'CO-16',
        category: 'DOCUMENTATION',
        description: 'Implant invoice and FDA device serial logs absent on claim submission',
        occurrenceCount: 7,
        deniedAmount: 54200.0,
        preventableByScrubber: true,
        recommendedScrubberRule: 'Implant Line Invoice Attachment Pre-Flight Check'
      }
    ],
    payerVariation: [
      { payerCode: 'BCBS_FL', payerName: 'Blue Cross Blue Shield FL', claimsCount: 110, denialRatePct: 7.27, avgDaysToPay: 24.8, underpaymentVariance: 18400.0, overturnRatePct: 87.5 },
      { payerCode: 'UHC_COMM', payerName: 'UnitedHealthcare Commercial', claimsCount: 88, denialRatePct: 17.05, avgDaysToPay: 48.2, underpaymentVariance: 36500.0, overturnRatePct: 66.7 },
      { payerCode: 'AETNA_CHOICE', payerName: 'Aetna Open Choice', claimsCount: 62, denialRatePct: 9.68, avgDaysToPay: 31.5, underpaymentVariance: 14200.0, overturnRatePct: 83.3 },
      { payerCode: 'MEDICARE_PART_B', payerName: 'Medicare Part B / First Coast', claimsCount: 60, denialRatePct: 3.33, avgDaysToPay: 18.2, underpaymentVariance: 15500.0, overturnRatePct: 100.0 }
    ]
  },
  {
    cptCode: '29881',
    procedureName: 'Knee Arthroscopy w/ Meniscectomy',
    specialty: 'Orthopedics',
    totalBilledClaims: 480,
    cleanClaimsCount: 462,
    cleanClaimRate: 96.25,
    firstPassDeniedClaims: 18,
    firstPassDenialRate: 3.75,
    avgDaysToPay: 19.8,
    appealedClaimsCount: 16,
    overturnedClaimsCount: 15,
    overturnRatePct: 93.75,
    overturnedDollars: 38200.0,
    underpaidClaimsCount: 14,
    underpaymentRatePct: 2.92,
    underpaymentVarianceDollars: 8400.0,
    agedArOver90Pct: 2.1,
    paymentVelocityIndex: 92.5,
    performanceTier: 'EXCELLENT_FLOW',
    primaryCarcCode: 'CO-97',
    primaryCarcDescription: 'Chondroplasty Bundling into Meniscectomy (CCI)',
    carcBreakdown: [
      {
        carcCode: 'CO-97',
        category: 'BUNDLING_CCI',
        description: 'Chondroplasty (29877) bundled into primary meniscectomy compartment',
        occurrenceCount: 12,
        deniedAmount: 26400.0,
        preventableByScrubber: true,
        recommendedScrubberRule: 'CCI Same-Compartment Bundling Scrubber & Modifier 59 / XS'
      },
      {
        carcCode: 'CO-16',
        category: 'DOCUMENTATION',
        description: 'Missing surgical arthroscopy color photographic prints',
        occurrenceCount: 6,
        deniedAmount: 13200.0,
        preventableByScrubber: false,
        recommendedScrubberRule: 'Operative Imaging Attachment Prompt'
      }
    ],
    payerVariation: [
      { payerCode: 'BCBS_FL', payerName: 'Blue Cross Blue Shield FL', claimsCount: 180, denialRatePct: 2.22, avgDaysToPay: 18.4, underpaymentVariance: 2200.0, overturnRatePct: 100.0 },
      { payerCode: 'UHC_COMM', payerName: 'UnitedHealthcare Commercial', claimsCount: 140, denialRatePct: 5.71, avgDaysToPay: 24.1, underpaymentVariance: 3800.0, overturnRatePct: 87.5 },
      { payerCode: 'AETNA_CHOICE', payerName: 'Aetna Open Choice', claimsCount: 90, denialRatePct: 3.33, avgDaysToPay: 20.6, underpaymentVariance: 1400.0, overturnRatePct: 100.0 },
      { payerCode: 'MEDICARE_PART_B', payerName: 'Medicare Part B / First Coast', claimsCount: 70, denialRatePct: 2.86, avgDaysToPay: 14.5, underpaymentVariance: 1000.0, overturnRatePct: 100.0 }
    ]
  },
  {
    cptCode: '66984',
    procedureName: 'Cataract Surgery w/ IOL Insertion',
    specialty: 'Ophthalmology',
    totalBilledClaims: 650,
    cleanClaimsCount: 638,
    cleanClaimRate: 98.15,
    firstPassDeniedClaims: 12,
    firstPassDenialRate: 1.85,
    avgDaysToPay: 16.5,
    appealedClaimsCount: 10,
    overturnedClaimsCount: 10,
    overturnRatePct: 100.0,
    overturnedDollars: 18500.0,
    underpaidClaimsCount: 12,
    underpaymentRatePct: 1.85,
    underpaymentVarianceDollars: 5200.0,
    agedArOver90Pct: 1.2,
    paymentVelocityIndex: 96.8,
    performanceTier: 'EXCELLENT_FLOW',
    primaryCarcCode: 'CO-50',
    primaryCarcDescription: 'Visual Acuity Pre-op Documentation Threshold',
    carcBreakdown: [
      {
        carcCode: 'CO-50',
        category: 'MEDICAL_NECESSITY',
        description: 'Snellen chart visual acuity better than 20/40 without glare disability questionnaire',
        occurrenceCount: 8,
        deniedAmount: 12400.0,
        preventableByScrubber: true,
        recommendedScrubberRule: 'Visual Functioning Index & Glare Testing Pre-Bill Gate'
      },
      {
        carcCode: 'CO-18',
        category: 'DUPLICATE',
        description: 'Second-eye procedure billed without laterality modifier (RT/LT)',
        occurrenceCount: 4,
        deniedAmount: 6200.0,
        preventableByScrubber: true,
        recommendedScrubberRule: 'Laterality Modifier RT/LT Enforcer'
      }
    ],
    payerVariation: [
      { payerCode: 'MEDICARE_PART_B', payerName: 'Medicare Part B / First Coast', claimsCount: 420, denialRatePct: 0.95, avgDaysToPay: 14.2, underpaymentVariance: 1800.0, overturnRatePct: 100.0 },
      { payerCode: 'BCBS_FL', payerName: 'Blue Cross Blue Shield FL', claimsCount: 130, denialRatePct: 2.31, avgDaysToPay: 19.5, underpaymentVariance: 1600.0, overturnRatePct: 100.0 },
      { payerCode: 'UHC_COMM', payerName: 'UnitedHealthcare Commercial', claimsCount: 100, denialRatePct: 5.0, avgDaysToPay: 22.1, underpaymentVariance: 1800.0, overturnRatePct: 100.0 }
    ]
  },
  {
    cptCode: '45380',
    procedureName: 'Colonoscopy w/ Biopsy',
    specialty: 'Gastroenterology',
    totalBilledClaims: 520,
    cleanClaimsCount: 494,
    cleanClaimRate: 95.0,
    firstPassDeniedClaims: 26,
    firstPassDenialRate: 5.0,
    avgDaysToPay: 21.2,
    appealedClaimsCount: 22,
    overturnedClaimsCount: 19,
    overturnRatePct: 86.36,
    overturnedDollars: 24700.0,
    underpaidClaimsCount: 28,
    underpaymentRatePct: 5.38,
    underpaymentVarianceDollars: 11200.0,
    agedArOver90Pct: 3.4,
    paymentVelocityIndex: 88.4,
    performanceTier: 'ACCEPTABLE_FLOW',
    primaryCarcCode: 'CO-97',
    primaryCarcDescription: 'Multiple Polypectomy Modifiers (33 vs PT / 59)',
    carcBreakdown: [
      {
        carcCode: 'CO-97',
        category: 'BUNDLING_CCI',
        description: 'Screening turned diagnostic; missing modifier PT or 33 cost-sharing waiver',
        occurrenceCount: 16,
        deniedAmount: 18400.0,
        preventableByScrubber: true,
        recommendedScrubberRule: 'Screening-to-Diagnostic Colonoscopy Modifier 33/PT Validation'
      },
      {
        carcCode: 'CO-16',
        category: 'DOCUMENTATION',
        description: 'Pathology lab tissue accession report unattached to facility claim',
        occurrenceCount: 10,
        deniedAmount: 11500.0,
        preventableByScrubber: true,
        recommendedScrubberRule: 'Pathology Report Receipt Pre-Bill Hold'
      }
    ],
    payerVariation: [
      { payerCode: 'BCBS_FL', payerName: 'Blue Cross Blue Shield FL', claimsCount: 190, denialRatePct: 4.21, avgDaysToPay: 20.4, underpaymentVariance: 3400.0, overturnRatePct: 87.5 },
      { payerCode: 'MEDICARE_PART_B', payerName: 'Medicare Part B / First Coast', claimsCount: 160, denialRatePct: 3.12, avgDaysToPay: 15.6, underpaymentVariance: 2100.0, overturnRatePct: 100.0 },
      { payerCode: 'AETNA_CHOICE', payerName: 'Aetna Open Choice', claimsCount: 95, denialRatePct: 6.32, avgDaysToPay: 24.8, underpaymentVariance: 2900.0, overturnRatePct: 83.3 },
      { payerCode: 'CIGNA_HEALTH', payerName: 'Cigna HealthCare', claimsCount: 75, denialRatePct: 9.33, avgDaysToPay: 29.5, underpaymentVariance: 2800.0, overturnRatePct: 71.4 }
    ]
  },
  {
    cptCode: '64483',
    procedureName: 'Transforaminal Epidural (TFESI) Lumbar',
    specialty: 'Pain Management',
    totalBilledClaims: 380,
    cleanClaimsCount: 342,
    cleanClaimRate: 90.0,
    firstPassDeniedClaims: 38,
    firstPassDenialRate: 10.0,
    avgDaysToPay: 31.8,
    appealedClaimsCount: 34,
    overturnedClaimsCount: 24,
    overturnRatePct: 70.59,
    overturnedDollars: 29800.0,
    underpaidClaimsCount: 36,
    underpaymentRatePct: 9.47,
    underpaymentVarianceDollars: 17400.0,
    agedArOver90Pct: 7.2,
    paymentVelocityIndex: 72.1,
    performanceTier: 'FRICTION_AT_RISK',
    primaryCarcCode: 'CO-50',
    primaryCarcDescription: 'Frequency Limitation Exceeded (Max 3/6mo or 4/12mo)',
    carcBreakdown: [
      {
        carcCode: 'CO-50',
        category: 'MEDICAL_NECESSITY',
        description: 'Payer LCD frequency rule exceeded (greater than 3 injections within 6-month period)',
        occurrenceCount: 22,
        deniedAmount: 26400.0,
        preventableByScrubber: true,
        recommendedScrubberRule: 'LCD Epidural Injection Frequency Tracker & Prior Date Checker'
      },
      {
        carcCode: 'CO-197',
        category: 'AUTHORIZATION',
        description: 'Pre-authorization valid for cervical rather than lumbar spinal level',
        occurrenceCount: 10,
        deniedAmount: 12000.0,
        preventableByScrubber: true,
        recommendedScrubberRule: 'Spinal Level Authorization Cross-Match Rule'
      },
      {
        carcCode: 'CO-16',
        category: 'DOCUMENTATION',
        description: 'Fluoroscopy imaging hardcopy print unattached to claim',
        occurrenceCount: 6,
        deniedAmount: 7200.0,
        preventableByScrubber: true,
        recommendedScrubberRule: 'Fluoroscopy Guidance Documentation Scrubber Gate'
      }
    ],
    payerVariation: [
      { payerCode: 'UHC_COMM', payerName: 'UnitedHealthcare Commercial', claimsCount: 130, denialRatePct: 14.62, avgDaysToPay: 39.2, underpaymentVariance: 7800.0, overturnRatePct: 63.2 },
      { payerCode: 'BCBS_FL', payerName: 'Blue Cross Blue Shield FL', claimsCount: 120, denialRatePct: 7.5, avgDaysToPay: 27.5, underpaymentVariance: 4200.0, overturnRatePct: 77.8 },
      { payerCode: 'MEDICARE_PART_B', payerName: 'Medicare Part B / First Coast', claimsCount: 80, denialRatePct: 6.25, avgDaysToPay: 20.4, underpaymentVariance: 2400.0, overturnRatePct: 80.0 },
      { payerCode: 'AETNA_CHOICE', payerName: 'Aetna Open Choice', claimsCount: 50, denialRatePct: 12.0, avgDaysToPay: 36.8, underpaymentVariance: 3000.0, overturnRatePct: 66.7 }
    ]
  },
  {
    cptCode: '43239',
    procedureName: 'Upper GI Endoscopy (EGD) w/ Biopsy',
    specialty: 'Gastroenterology',
    totalBilledClaims: 310,
    cleanClaimsCount: 298,
    cleanClaimRate: 96.13,
    firstPassDeniedClaims: 12,
    firstPassDenialRate: 3.87,
    avgDaysToPay: 18.9,
    appealedClaimsCount: 10,
    overturnedClaimsCount: 9,
    overturnRatePct: 90.0,
    overturnedDollars: 11400.0,
    underpaidClaimsCount: 14,
    underpaymentRatePct: 4.52,
    underpaymentVarianceDollars: 4600.0,
    agedArOver90Pct: 1.8,
    paymentVelocityIndex: 94.1,
    performanceTier: 'EXCELLENT_FLOW',
    primaryCarcCode: 'CO-50',
    primaryCarcDescription: 'GERD Refractory Trial Documentation Required',
    carcBreakdown: [
      {
        carcCode: 'CO-50',
        category: 'MEDICAL_NECESSITY',
        description: 'Prior trial of proton pump inhibitors (PPI) for 8 weeks not explicitly documented in chart',
        occurrenceCount: 8,
        deniedAmount: 9600.0,
        preventableByScrubber: true,
        recommendedScrubberRule: 'Pre-EGD Pharmacotherapy Trial Documentation Verification'
      },
      {
        carcCode: 'CO-97',
        category: 'BUNDLING_CCI',
        description: 'Concomitant colonoscopy anesthesia or multiple procedure reduction dispute',
        occurrenceCount: 4,
        deniedAmount: 4800.0,
        preventableByScrubber: false,
        recommendedScrubberRule: 'Multiple Endoscopy Cascade Rule'
      }
    ],
    payerVariation: [
      { payerCode: 'BCBS_FL', payerName: 'Blue Cross Blue Shield FL', claimsCount: 120, denialRatePct: 2.5, avgDaysToPay: 17.8, underpaymentVariance: 1400.0, overturnRatePct: 100.0 },
      { payerCode: 'MEDICARE_PART_B', payerName: 'Medicare Part B / First Coast', claimsCount: 100, denialRatePct: 2.0, avgDaysToPay: 14.8, underpaymentVariance: 1100.0, overturnRatePct: 100.0 },
      { payerCode: 'UHC_COMM', payerName: 'UnitedHealthcare Commercial', claimsCount: 90, denialRatePct: 7.78, avgDaysToPay: 25.1, underpaymentVariance: 2100.0, overturnRatePct: 85.7 }
    ]
  },
  {
    cptCode: '29827',
    procedureName: 'Rotator Cuff Repair Arthroscopic',
    specialty: 'Orthopedics',
    totalBilledClaims: 195,
    cleanClaimsCount: 163,
    cleanClaimRate: 83.59,
    firstPassDeniedClaims: 32,
    firstPassDenialRate: 16.41,
    avgDaysToPay: 46.2,
    appealedClaimsCount: 30,
    overturnedClaimsCount: 18,
    overturnRatePct: 60.0,
    overturnedDollars: 112000.0,
    underpaidClaimsCount: 26,
    underpaymentRatePct: 13.33,
    underpaymentVarianceDollars: 48200.0,
    agedArOver90Pct: 14.8,
    paymentVelocityIndex: 48.6,
    performanceTier: 'CHRONIC_DENIAL_SINK',
    primaryCarcCode: 'CO-97',
    primaryCarcDescription: 'Subacromial Decompression & Biceps Tenodesis Bundling (CCI)',
    carcBreakdown: [
      {
        carcCode: 'CO-97',
        category: 'BUNDLING_CCI',
        description: 'Subacromial decompression (29826) and distal claviculectomy (29824) unbundling challenge',
        occurrenceCount: 16,
        deniedAmount: 64000.0,
        preventableByScrubber: true,
        recommendedScrubberRule: 'Shoulder CCI Unbundling & Distinct Procedural Modifier 59 / XU Rule'
      },
      {
        carcCode: 'CO-197',
        category: 'AUTHORIZATION',
        description: 'Prior authorization obtained for open procedure instead of arthroscopic repair',
        occurrenceCount: 10,
        deniedAmount: 42000.0,
        preventableByScrubber: true,
        recommendedScrubberRule: 'Surgical Approach (Open vs Scope) Authorization Match Gate'
      },
      {
        carcCode: 'CO-16',
        category: 'DOCUMENTATION',
        description: 'Suture anchor manufacturer invoice missing from electronic attachment',
        occurrenceCount: 6,
        deniedAmount: 24000.0,
        preventableByScrubber: true,
        recommendedScrubberRule: 'Shoulder Anchor Implant Invoice Attachment Blocker'
      }
    ],
    payerVariation: [
      { payerCode: 'UHC_COMM', payerName: 'UnitedHealthcare Commercial', claimsCount: 75, denialRatePct: 22.67, avgDaysToPay: 56.4, underpaymentVariance: 24500.0, overturnRatePct: 52.9 },
      { payerCode: 'CIGNA_HEALTH', payerName: 'Cigna HealthCare', claimsCount: 45, denialRatePct: 17.78, avgDaysToPay: 48.0, underpaymentVariance: 11200.0, overturnRatePct: 62.5 },
      { payerCode: 'BCBS_FL', payerName: 'Blue Cross Blue Shield FL', claimsCount: 45, denialRatePct: 11.11, avgDaysToPay: 34.2, underpaymentVariance: 7500.0, overturnRatePct: 80.0 },
      { payerCode: 'MEDICARE_PART_B', payerName: 'Medicare Part B / First Coast', claimsCount: 30, denialRatePct: 6.67, avgDaysToPay: 21.0, underpaymentVariance: 5000.0, overturnRatePct: 100.0 }
    ]
  },
  {
    cptCode: '31255',
    procedureName: 'Sinus Endoscopy Total Ethmoidectomy',
    specialty: 'Otolaryngology (ENT)',
    totalBilledClaims: 140,
    cleanClaimsCount: 118,
    cleanClaimRate: 84.29,
    firstPassDeniedClaims: 22,
    firstPassDenialRate: 15.71,
    avgDaysToPay: 42.6,
    appealedClaimsCount: 20,
    overturnedClaimsCount: 12,
    overturnRatePct: 60.0,
    overturnedDollars: 46800.0,
    underpaidClaimsCount: 18,
    underpaymentRatePct: 12.86,
    underpaymentVarianceDollars: 21600.0,
    agedArOver90Pct: 12.6,
    paymentVelocityIndex: 52.4,
    performanceTier: 'CHRONIC_DENIAL_SINK',
    primaryCarcCode: 'CO-50',
    primaryCarcDescription: 'CT Scan Coronal Cut Staging (Lund-Mackay Score) Missing',
    carcBreakdown: [
      {
        carcCode: 'CO-50',
        category: 'MEDICAL_NECESSITY',
        description: 'Paranasal sinus CT scan coronal cut report or Lund-Mackay staging score lacking',
        occurrenceCount: 12,
        deniedAmount: 38400.0,
        preventableByScrubber: true,
        recommendedScrubberRule: 'Sinus CT Report & Lund-Mackay Severity Score Cross-Check'
      },
      {
        carcCode: 'CO-97',
        category: 'BUNDLING_CCI',
        description: 'Bilateral maxillary antrostomy bundled with total ethmoidectomy',
        occurrenceCount: 6,
        deniedAmount: 18600.0,
        preventableByScrubber: true,
        recommendedScrubberRule: 'Bilateral Modifier 50 vs RT/LT Modifier Discrepancy Gate'
      },
      {
        carcCode: 'CO-197',
        category: 'AUTHORIZATION',
        description: 'Stereotactic image guidance add-on (61782) unlisted on pre-authorization certificate',
        occurrenceCount: 4,
        deniedAmount: 9200.0,
        preventableByScrubber: true,
        recommendedScrubberRule: 'Navigation Add-on Authorization Consistency Checker'
      }
    ],
    payerVariation: [
      { payerCode: 'UHC_COMM', payerName: 'UnitedHealthcare Commercial', claimsCount: 50, denialRatePct: 22.0, avgDaysToPay: 51.5, underpaymentVariance: 10200.0, overturnRatePct: 54.5 },
      { payerCode: 'AETNA_CHOICE', payerName: 'Aetna Open Choice', claimsCount: 40, denialRatePct: 15.0, avgDaysToPay: 44.0, underpaymentVariance: 5800.0, overturnRatePct: 66.7 },
      { payerCode: 'BCBS_FL', payerName: 'Blue Cross Blue Shield FL', claimsCount: 30, denialRatePct: 10.0, avgDaysToPay: 32.5, underpaymentVariance: 3400.0, overturnRatePct: 66.7 },
      { payerCode: 'MEDICARE_PART_B', payerName: 'Medicare Part B / First Coast', claimsCount: 20, denialRatePct: 5.0, avgDaysToPay: 19.8, underpaymentVariance: 2200.0, overturnRatePct: 100.0 }
    ]
  },
  {
    cptCode: '26055',
    procedureName: 'Trigger Finger Tendon Sheath Incision',
    specialty: 'Orthopedics / Hand',
    totalBilledClaims: 220,
    cleanClaimsCount: 212,
    cleanClaimRate: 96.36,
    firstPassDeniedClaims: 8,
    firstPassDenialRate: 3.64,
    avgDaysToPay: 18.2,
    appealedClaimsCount: 8,
    overturnedClaimsCount: 7,
    overturnRatePct: 87.5,
    overturnedDollars: 10200.0,
    underpaidClaimsCount: 8,
    underpaymentRatePct: 3.64,
    underpaymentVarianceDollars: 2400.0,
    agedArOver90Pct: 1.5,
    paymentVelocityIndex: 94.8,
    performanceTier: 'EXCELLENT_FLOW',
    primaryCarcCode: 'CO-18',
    primaryCarcDescription: 'Multiple Digit Modifier (F1-FA) Billing Collision',
    carcBreakdown: [
      {
        carcCode: 'CO-18',
        category: 'DUPLICATE',
        description: 'Multiple digits treated without anatomical digit modifiers (F1 - F9, FA)',
        occurrenceCount: 5,
        deniedAmount: 6400.0,
        preventableByScrubber: true,
        recommendedScrubberRule: 'Anatomical Digit Modifier (F1-FA) Compliance Rule'
      },
      {
        carcCode: 'CO-50',
        category: 'MEDICAL_NECESSITY',
        description: 'Prior corticosteroid injection trial date absent',
        occurrenceCount: 3,
        deniedAmount: 3800.0,
        preventableByScrubber: true,
        recommendedScrubberRule: 'Pre-Op Steroid Injection Documentation Checker'
      }
    ],
    payerVariation: [
      { payerCode: 'BCBS_FL', payerName: 'Blue Cross Blue Shield FL', claimsCount: 90, denialRatePct: 2.22, avgDaysToPay: 17.5, underpaymentVariance: 800.0, overturnRatePct: 100.0 },
      { payerCode: 'MEDICARE_PART_B', payerName: 'Medicare Part B / First Coast', claimsCount: 70, denialRatePct: 1.43, avgDaysToPay: 14.6, underpaymentVariance: 500.0, overturnRatePct: 100.0 },
      { payerCode: 'UHC_COMM', payerName: 'UnitedHealthcare Commercial', claimsCount: 60, denialRatePct: 8.33, avgDaysToPay: 23.4, underpaymentVariance: 1100.0, overturnRatePct: 80.0 }
    ]
  },
  {
    cptCode: '52000',
    procedureName: 'Cystourethroscopy Diagnostic',
    specialty: 'Urology',
    totalBilledClaims: 160,
    cleanClaimsCount: 152,
    cleanClaimRate: 95.0,
    firstPassDeniedClaims: 8,
    firstPassDenialRate: 5.0,
    avgDaysToPay: 20.5,
    appealedClaimsCount: 7,
    overturnedClaimsCount: 6,
    overturnRatePct: 85.71,
    overturnedDollars: 7800.0,
    underpaidClaimsCount: 9,
    underpaymentRatePct: 5.63,
    underpaymentVarianceDollars: 3100.0,
    agedArOver90Pct: 2.5,
    paymentVelocityIndex: 90.2,
    performanceTier: 'ACCEPTABLE_FLOW',
    primaryCarcCode: 'CO-50',
    primaryCarcDescription: 'Hematuria Diagnosis Coding Specificity',
    carcBreakdown: [
      {
        carcCode: 'CO-50',
        category: 'MEDICAL_NECESSITY',
        description: 'Unspecified gross hematuria without microscopic urinalysis RBC count',
        occurrenceCount: 5,
        deniedAmount: 5200.0,
        preventableByScrubber: true,
        recommendedScrubberRule: 'Microscopic Hematuria Lab Result Indication Matcher'
      },
      {
        carcCode: 'CO-16',
        category: 'DOCUMENTATION',
        description: 'Bladder mucosal inspection operative diagram missing',
        occurrenceCount: 3,
        deniedAmount: 2600.0,
        preventableByScrubber: false,
        recommendedScrubberRule: 'Urology Operative Finding Summary Gate'
      }
    ],
    payerVariation: [
      { payerCode: 'MEDICARE_PART_B', payerName: 'Medicare Part B / First Coast', claimsCount: 80, denialRatePct: 2.5, avgDaysToPay: 15.2, underpaymentVariance: 800.0, overturnRatePct: 100.0 },
      { payerCode: 'BCBS_FL', payerName: 'Blue Cross Blue Shield FL', claimsCount: 50, denialRatePct: 4.0, avgDaysToPay: 21.0, underpaymentVariance: 1100.0, overturnRatePct: 100.0 },
      { payerCode: 'AETNA_CHOICE', payerName: 'Aetna Open Choice', claimsCount: 30, denialRatePct: 13.33, avgDaysToPay: 33.5, underpaymentVariance: 1200.0, overturnRatePct: 75.0 }
    ]
  }
];
