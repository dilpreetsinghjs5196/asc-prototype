/**
 * CARC/RARC Intelligence, Normalization & Interpretation Service
 * Phase 84: Revenue Cycle Management (RCM)
 * 
 * Provides official Claim Adjustment Reason Codes (CARC) and Remittance Advice
 * Remark Codes (RARC) master registries, combinatorial mapping rules,
 * deterministic root-cause denial classification, and recovery scoring.
 */

// 1. CARC Group Codes & Meaning
export const CARC_GROUP_CODES = {
  CO: {
    code: 'CO',
    name: 'Contractual Obligation',
    description: 'Mandatory contractual reduction or provider-assumed liability. Provider cannot balance bill the patient.',
    colorToken: 'sky',
    badgeClass: 'bg-sky-950/40 text-sky-400 border-sky-800'
  },
  PR: {
    code: 'PR',
    name: 'Patient Responsibility',
    description: 'Portion of charges legally billable to the patient (deductible, coinsurance, copay, or non-covered elective service).',
    colorToken: 'emerald',
    badgeClass: 'bg-emerald-950/40 text-emerald-400 border-emerald-800'
  },
  OA: {
    code: 'OA',
    name: 'Other Adjustment',
    description: 'Coordination of benefits (COB), secondary payer offsets, or third-party liability reductions.',
    colorToken: 'amber',
    badgeClass: 'bg-amber-950/40 text-amber-400 border-amber-800'
  },
  PI: {
    code: 'PI',
    name: 'Payer Initiated Reduction',
    description: 'Statutory or contractual withholdings, capitation payments, or value-based quality program adjustments.',
    colorToken: 'slate',
    badgeClass: 'bg-slate-800/60 text-slate-300 border-slate-700'
  },
  CR: {
    code: 'CR',
    name: 'Correction and Reversal',
    description: 'Prior payment clawback, duplicate reversal, or retroactive adjudication offset.',
    colorToken: 'rose',
    badgeClass: 'bg-rose-950/40 text-rose-400 border-rose-800'
  }
};

// 2. Standardized Root Cause Categories
export const ROOT_CAUSE_CATEGORIES = {
  AUTHORIZATION_PRECERT: {
    id: 'AUTHORIZATION_PRECERT',
    label: 'Prior Authorization / Precert',
    description: 'Pre-procedure clinical approval or notification was absent, expired, or mismatched.',
    color: 'amber',
    badgeClass: 'bg-amber-950/40 text-amber-400 border-amber-800'
  },
  MEDICAL_NECESSITY: {
    id: 'MEDICAL_NECESSITY',
    label: 'Medical Necessity / LCD',
    description: 'Payer clinical policy (LCD/NCD) deemed service unproven, cosmetic, or medically unwarranted.',
    color: 'rose',
    badgeClass: 'bg-rose-950/40 text-rose-400 border-rose-800'
  },
  CODING_BILLING: {
    id: 'CODING_BILLING',
    label: 'Coding & Billing Errors',
    description: 'Incompatible modifiers (e.g. 59, RT/LT), bundled CPT combinations, or invalid diagnosis code.',
    color: 'sky',
    badgeClass: 'bg-sky-950/40 text-sky-400 border-sky-800'
  },
  TIMELY_FILING: {
    id: 'TIMELY_FILING',
    label: 'Timely Filing Exceeded',
    description: 'Claim submitted past the statutory or contractual payer filing deadline window.',
    color: 'rose',
    badgeClass: 'bg-rose-950/40 text-rose-400 border-rose-800'
  },
  ELIGIBILITY: {
    id: 'ELIGIBILITY',
    label: 'Eligibility & Coverage',
    description: 'Patient insurance policy inactive, terminated before DOS, or member ID not found.',
    color: 'amber',
    badgeClass: 'bg-amber-950/40 text-amber-400 border-amber-800'
  },
  DUPLICATE: {
    id: 'DUPLICATE',
    label: 'Duplicate Claim / Service',
    description: 'Identical CPT or claim number was previously paid or adjudicated.',
    color: 'slate',
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700'
  },
  COB: {
    id: 'COB',
    label: 'Coordination of Benefits',
    description: 'Primary payer not billed first or missing primary Explanation of Benefits (EOB).',
    color: 'sky',
    badgeClass: 'bg-sky-950/40 text-sky-400 border-sky-800'
  },
  CONTRACTUAL_FEE_SCHEDULE: {
    id: 'CONTRACTUAL_FEE_SCHEDULE',
    label: 'Contractual Discount (CO-45)',
    description: 'Authoritative contracted fee reduction; non-denial contractual obligation.',
    color: 'emerald',
    badgeClass: 'bg-emerald-950/40 text-emerald-400 border-emerald-800'
  },
  PATIENT_COST_SHARE: {
    id: 'PATIENT_COST_SHARE',
    label: 'Patient Cost Share (Deductible/Coins)',
    description: 'Allowable out-of-pocket patient responsibility per health plan benefit design.',
    color: 'emerald',
    badgeClass: 'bg-emerald-950/40 text-emerald-400 border-emerald-800'
  },
  ADMINISTRATIVE: {
    id: 'ADMINISTRATIVE',
    label: 'Clearinghouse / Admin',
    description: 'Technical ANSI 5010 syntax defect or missing mandatory billing envelope segment.',
    color: 'slate',
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700'
  }
};

// 3. Recommended Action Workflows
export const ACTION_WORKFLOWS = {
  APPEALABLE: {
    id: 'APPEALABLE',
    label: 'Initiate Clinical/Formal Appeal',
    description: 'Draft clinical appeal packet with operative notes, pathology, or pre-auth proof.',
    badgeClass: 'bg-amber-950/40 text-amber-400 border-amber-800'
  },
  CORRECT_AND_RESUBMIT: {
    id: 'CORRECT_AND_RESUBMIT',
    label: 'Correct & Fast Rebill',
    description: 'Fix modifier, NPI, or subscriber ID and resubmit as EDI 837 replacement claim.',
    badgeClass: 'bg-sky-950/40 text-sky-400 border-sky-800'
  },
  TRANSFER_TO_PATIENT: {
    id: 'TRANSFER_TO_PATIENT',
    label: 'Transfer to Patient Statement',
    description: 'Generate patient AR statement for deductible, coinsurance, or non-covered portion.',
    badgeClass: 'bg-emerald-950/40 text-emerald-400 border-emerald-800'
  },
  CONTRACTUAL_WRITE_OFF: {
    id: 'CONTRACTUAL_WRITE_OFF',
    label: 'Post Contractual Write-off',
    description: 'Apply approved fee schedule discount to double-entry general ledger.',
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700'
  },
  ADMIN_WRITE_OFF: {
    id: 'ADMIN_WRITE_OFF',
    label: 'Authorize Loss Write-off',
    description: 'Unrecoverable denial; route for CFO loss authorization.',
    badgeClass: 'bg-rose-950/40 text-rose-400 border-rose-800'
  }
};

// 4. Official CARC Master Catalog (ASC Focused)
export const CARC_CATALOG = {
  '1': {
    code: '1',
    groupCode: 'PR',
    shortDescription: 'Deductible Amount',
    formalTitle: 'Deductible Amount per member health plan terms.',
    category: 'PATIENT_SHARE',
    isDenial: false,
    isRecoverable: true,
    defaultAction: 'TRANSFER_TO_PATIENT',
    recoveryLikelihoodPct: 85.00
  },
  '2': {
    code: '2',
    groupCode: 'PR',
    shortDescription: 'Coinsurance Amount',
    formalTitle: 'Coinsurance percentage amount payable by patient.',
    category: 'PATIENT_SHARE',
    isDenial: false,
    isRecoverable: true,
    defaultAction: 'TRANSFER_TO_PATIENT',
    recoveryLikelihoodPct: 85.00
  },
  '3': {
    code: '3',
    groupCode: 'PR',
    shortDescription: 'Co-payment Amount',
    formalTitle: 'Fixed copayment amount specified by health plan.',
    category: 'PATIENT_SHARE',
    isDenial: false,
    isRecoverable: true,
    defaultAction: 'TRANSFER_TO_PATIENT',
    recoveryLikelihoodPct: 90.00
  },
  '4': {
    code: '4',
    groupCode: 'CO',
    shortDescription: 'Procedure Code Inconsistent with Modifier',
    formalTitle: 'The procedure code is inconsistent with the modifier used or a required modifier is missing.',
    category: 'DENIAL',
    isDenial: true,
    isRecoverable: true,
    defaultAction: 'CORRECT_AND_RESUBMIT',
    recoveryLikelihoodPct: 92.00
  },
  '16': {
    code: '16',
    groupCode: 'CO',
    shortDescription: 'Claim/Service Lacks Information / Billing Error',
    formalTitle: 'Claim/service lacks information or has submission/billing error(s) which is needed for adjudication.',
    category: 'DENIAL',
    isDenial: true,
    isRecoverable: true,
    defaultAction: 'CORRECT_AND_RESUBMIT',
    recoveryLikelihoodPct: 95.00
  },
  '18': {
    code: '18',
    groupCode: 'CO',
    shortDescription: 'Exact Duplicate Claim/Service',
    formalTitle: 'Exact duplicate claim/service identified and previously adjudicated.',
    category: 'DENIAL',
    isDenial: true,
    isRecoverable: true,
    defaultAction: 'APPEALABLE',
    recoveryLikelihoodPct: 40.00
  },
  '22': {
    code: '22',
    groupCode: 'OA',
    shortDescription: 'Coordination of Benefits (COB)',
    formalTitle: 'This care may be covered by another payer per coordination of benefits agreement.',
    category: 'COORDINATION_OF_BENEFITS',
    isDenial: true,
    isRecoverable: true,
    defaultAction: 'CORRECT_AND_RESUBMIT',
    recoveryLikelihoodPct: 88.00
  },
  '27': {
    code: '27',
    groupCode: 'CO',
    shortDescription: 'Coverage Terminated Before DOS',
    formalTitle: 'Expenses incurred after coverage was terminated or subscriber policy expired.',
    category: 'DENIAL',
    isDenial: true,
    isRecoverable: true,
    defaultAction: 'TRANSFER_TO_PATIENT',
    recoveryLikelihoodPct: 60.00
  },
  '29': {
    code: '29',
    groupCode: 'CO',
    shortDescription: 'Timely Filing Limit Expired',
    formalTitle: 'The time limit for filing has expired per payer administrative contract.',
    category: 'DENIAL',
    isDenial: true,
    isRecoverable: false,
    defaultAction: 'ADMIN_WRITE_OFF',
    recoveryLikelihoodPct: 15.00
  },
  '31': {
    code: '31',
    groupCode: 'CO',
    shortDescription: 'Patient Not Identified as Insured',
    formalTitle: 'Patient cannot be identified as our insured; demographic or subscriber mismatch.',
    category: 'DENIAL',
    isDenial: true,
    isRecoverable: true,
    defaultAction: 'CORRECT_AND_RESUBMIT',
    recoveryLikelihoodPct: 90.00
  },
  '45': {
    code: '45',
    groupCode: 'CO',
    shortDescription: 'Charge Exceeds Fee Schedule Allowable',
    formalTitle: 'Charge exceeds fee schedule/maximum allowable or contracted rate.',
    category: 'CONTRACTUAL',
    isDenial: false,
    isRecoverable: false,
    defaultAction: 'CONTRACTUAL_WRITE_OFF',
    recoveryLikelihoodPct: 0.00
  },
  '50': {
    code: '50',
    groupCode: 'CO',
    shortDescription: 'Non-Covered: Not Medically Necessary',
    formalTitle: 'These are non-covered services because this is not deemed a medical necessity by the payer.',
    category: 'DENIAL',
    isDenial: true,
    isRecoverable: true,
    defaultAction: 'APPEALABLE',
    recoveryLikelihoodPct: 50.00
  },
  '59': {
    code: '59',
    groupCode: 'CO',
    shortDescription: 'Multiple Procedure Reduction (MPPR)',
    formalTitle: 'Processed based on multiple or concurrent procedure rules per statutory MPPR guidelines.',
    category: 'CONTRACTUAL',
    isDenial: false,
    isRecoverable: false,
    defaultAction: 'CONTRACTUAL_WRITE_OFF',
    recoveryLikelihoodPct: 5.00
  },
  '96': {
    code: '96',
    groupCode: 'CO',
    shortDescription: 'Non-Covered Charge(s)',
    formalTitle: 'Non-covered charge(s) per health plan statutory exclusions or plan limitations.',
    category: 'DENIAL',
    isDenial: true,
    isRecoverable: true,
    defaultAction: 'APPEALABLE',
    recoveryLikelihoodPct: 45.00
  },
  '97': {
    code: '97',
    groupCode: 'CO',
    shortDescription: 'Bundled / Inclusive Procedure Benefit',
    formalTitle: 'The benefit for this service is included in the payment/allowance for another service/procedure already adjudicated.',
    category: 'DENIAL',
    isDenial: true,
    isRecoverable: true,
    defaultAction: 'APPEALABLE',
    recoveryLikelihoodPct: 65.00
  },
  '197': {
    code: '197',
    groupCode: 'CO',
    shortDescription: 'Precertification / Prior Auth Absent',
    formalTitle: 'Precertification/authorization/notification/pre-treatment absent or not obtained prior to surgery.',
    category: 'DENIAL',
    isDenial: true,
    isRecoverable: true,
    defaultAction: 'APPEALABLE',
    recoveryLikelihoodPct: 65.00
  },
  '252': {
    code: '252',
    groupCode: 'CO',
    shortDescription: 'Documentation / Attachment Required',
    formalTitle: 'An attachment or other documentation is required to adjudicate this claim/service.',
    category: 'DENIAL',
    isDenial: true,
    isRecoverable: true,
    defaultAction: 'CORRECT_AND_RESUBMIT',
    recoveryLikelihoodPct: 90.00
  },
  '256': {
    code: '256',
    groupCode: 'CO',
    shortDescription: 'Service Not Authorized by Referral',
    formalTitle: 'Service not authorized or directed by primary referring provider network.',
    category: 'DENIAL',
    isDenial: true,
    isRecoverable: true,
    defaultAction: 'APPEALABLE',
    recoveryLikelihoodPct: 60.00
  }
};

// 5. Official RARC Master Catalog (ASC Focused)
export const RARC_CATALOG = {
  'N1': {
    code: 'N1',
    codeType: 'INFORMATIONAL',
    shortDescription: 'Alert: Cannot Appeal Determination',
    fullText: 'Alert: You may not appeal this decision per health plan terms.'
  },
  'N56': {
    code: 'N56',
    codeType: 'SUPPLEMENTAL',
    shortDescription: 'Procedure Code Missing or Invalid for DOS',
    fullText: 'Procedure code was missing or invalid for the date of service.'
  },
  'N115': {
    code: 'N115',
    codeType: 'SUPPLEMENTAL',
    shortDescription: 'Based on Local Coverage Determination (LCD)',
    fullText: 'This decision was based on a Local Coverage Determination (LCD).'
  },
  'N130': {
    code: 'N130',
    codeType: 'INFORMATIONAL',
    shortDescription: 'Consult Plan Benefit Documents',
    fullText: 'Alert: Consult plan benefit documents/guidelines for information about restrictions.'
  },
  'N211': {
    code: 'N211',
    codeType: 'INFORMATIONAL',
    shortDescription: 'Alert: Do Not Bill the Patient',
    fullText: 'Alert: You may not bill the patient for this service.'
  },
  'N382': {
    code: 'N382',
    codeType: 'SUPPLEMENTAL',
    shortDescription: 'Missing/Incomplete Clinical Notes',
    fullText: 'Missing/incomplete/invalid pre-operative clinical notes or operative records.'
  },
  'N517': {
    code: 'N517',
    codeType: 'SUPPLEMENTAL',
    shortDescription: 'Resubmit with Proof of Pre-Authorization',
    fullText: 'Resubmit with proof of pre-authorization from the referring provider or medical director.'
  },
  'N522': {
    code: 'N522',
    codeType: 'SUPPLEMENTAL',
    shortDescription: 'Duplicate of Prior Adjudication',
    fullText: 'Duplicate of previously adjudicated claim or encounter.'
  },
  'MA01': {
    code: 'MA01',
    codeType: 'INFORMATIONAL',
    shortDescription: 'Alert: Right to Appeal',
    fullText: 'Alert: If you do not agree with this determination, you have the right to appeal.'
  },
  'MA130': {
    code: 'MA130',
    codeType: 'INFORMATIONAL',
    shortDescription: 'Incomplete Information - No Appeal Rights',
    fullText: 'Your claim contains incomplete and/or invalid information, and no appeal rights are afforded.'
  }
};

// 6. Deterministic Combinatorial Mapping Rules
export const COMBINATORIAL_MAPPING_RULES = [
  {
    carcCode: '197',
    rarcCode: 'N517',
    rootCauseCategory: 'AUTHORIZATION_PRECERT',
    actionWorkflow: 'APPEALABLE',
    recoveryProbabilityPct: 75.00,
    priorityLevel: 'HIGH',
    guidanceText: 'Attach signed authorization confirmation or urgent retro-authorization request to payer appeal unit.'
  },
  {
    carcCode: '16',
    rarcCode: 'N56',
    rootCauseCategory: 'CODING_BILLING',
    actionWorkflow: 'CORRECT_AND_RESUBMIT',
    recoveryProbabilityPct: 95.00,
    priorityLevel: 'CRITICAL',
    guidanceText: 'Validate CPT anatomical modifiers (LT/RT/59) against surgery logs and rebill electronically as 837 replacement.'
  },
  {
    carcCode: '50',
    rarcCode: 'N115',
    rootCauseCategory: 'MEDICAL_NECESSITY',
    actionWorkflow: 'APPEALABLE',
    recoveryProbabilityPct: 55.00,
    priorityLevel: 'HIGH',
    guidanceText: 'Review payer LCD policy criteria. Submit full surgeon operative narrative, diagnostic imaging, and conservative therapy history.'
  },
  {
    carcCode: '29',
    rarcCode: null,
    rootCauseCategory: 'TIMELY_FILING',
    actionWorkflow: 'ADMIN_WRITE_OFF',
    recoveryProbabilityPct: 10.00,
    priorityLevel: 'MEDIUM',
    guidanceText: 'Locate 999/277CA clearinghouse transmission timestamp proving initial submission was within contractual window, or route for CFO write-off.'
  },
  {
    carcCode: '97',
    rarcCode: null,
    rootCauseCategory: 'CODING_BILLING',
    actionWorkflow: 'APPEALABLE',
    recoveryProbabilityPct: 70.00,
    priorityLevel: 'MEDIUM',
    guidanceText: 'Check NCCI PTP column edit. If distinct surgical encounter or anatomical site, append modifier 59 or XS and submit appeal.'
  },
  {
    carcCode: '22',
    rarcCode: null,
    rootCauseCategory: 'COB',
    actionWorkflow: 'CORRECT_AND_RESUBMIT',
    recoveryProbabilityPct: 90.00,
    priorityLevel: 'HIGH',
    guidanceText: 'Obtain primary insurance EOB, verify coordination of benefits order, and resubmit to secondary payer with 837 COB loops.'
  },
  {
    carcCode: '27',
    rarcCode: null,
    rootCauseCategory: 'ELIGIBILITY',
    actionWorkflow: 'TRANSFER_TO_PATIENT',
    recoveryProbabilityPct: 65.00,
    priorityLevel: 'HIGH',
    guidanceText: 'Contact patient for active commercial or Medicare coverage on date of service; transfer unverified balance to self-pay.'
  },
  {
    carcCode: '45',
    rarcCode: null,
    rootCauseCategory: 'CONTRACTUAL_FEE_SCHEDULE',
    actionWorkflow: 'CONTRACTUAL_WRITE_OFF',
    recoveryProbabilityPct: 0.00,
    priorityLevel: 'LOW',
    guidanceText: 'Authoritative contracted allowable adjustment. Post write-off directly to general ledger.'
  },
  {
    carcCode: '1',
    rarcCode: null,
    rootCauseCategory: 'PATIENT_COST_SHARE',
    actionWorkflow: 'TRANSFER_TO_PATIENT',
    recoveryProbabilityPct: 85.00,
    priorityLevel: 'MEDIUM',
    guidanceText: 'Statutory annual deductible. Allocate to patient accounts receivable statement.'
  },
  {
    carcCode: '2',
    rarcCode: null,
    rootCauseCategory: 'PATIENT_COST_SHARE',
    actionWorkflow: 'TRANSFER_TO_PATIENT',
    recoveryProbabilityPct: 85.00,
    priorityLevel: 'MEDIUM',
    guidanceText: 'Statutory coinsurance cost share. Allocate to patient accounts receivable statement.'
  }
];

// 7. Core Interpretation Engine
export function interpretAdjustment(groupCode = 'CO', carcCode = '45', rarcCode = null, amount = 0) {
  const cleanGroup = String(groupCode || 'CO').toUpperCase().trim();
  const cleanCarc = String(carcCode || '').replace(/^(CO|PR|OA|PI|CR)[-_]?/i, '').trim();
  const cleanRarc = rarcCode ? String(rarcCode).toUpperCase().trim() : null;
  const numAmount = Math.max(0, parseFloat(amount) || 0);

  // 1. Check exact (carc, rarc) rule match
  let matchedRule = COMBINATORIAL_MAPPING_RULES.find(
    r => r.carcCode === cleanCarc && r.rarcCode && r.rarcCode === cleanRarc
  );

  // 2. Check CARC-only rule match
  if (!matchedRule) {
    matchedRule = COMBINATORIAL_MAPPING_RULES.find(
      r => r.carcCode === cleanCarc && r.rarcCode === null
    );
  }

  // 3. Fallback to CARC master metadata
  const carcMeta = CARC_CATALOG[cleanCarc] || {
    code: cleanCarc,
    groupCode: cleanGroup,
    shortDescription: `CARC ${cleanCarc} Adjustment`,
    formalTitle: `Unregistered CARC ${cleanCarc}`,
    category: cleanGroup === 'PR' ? 'PATIENT_SHARE' : cleanGroup === 'CO' ? 'CONTRACTUAL' : 'DENIAL',
    isDenial: cleanGroup === 'CO' && cleanCarc !== '45' && cleanCarc !== '59',
    isRecoverable: cleanGroup === 'CO' && cleanCarc !== '45',
    defaultAction: cleanGroup === 'PR' ? 'TRANSFER_TO_PATIENT' : cleanCarc === '45' ? 'CONTRACTUAL_WRITE_OFF' : 'APPEALABLE',
    recoveryLikelihoodPct: cleanCarc === '45' ? 0 : 50
  };

  const rarcMeta = cleanRarc ? (RARC_CATALOG[cleanRarc] || {
    code: cleanRarc,
    codeType: 'INFORMATIONAL',
    shortDescription: `Remark ${cleanRarc}`,
    fullText: `Unregistered RARC ${cleanRarc}`
  }) : null;

  const rootCause = matchedRule?.rootCauseCategory || (
    cleanGroup === 'PR' ? 'PATIENT_COST_SHARE' :
    cleanCarc === '45' ? 'CONTRACTUAL_FEE_SCHEDULE' :
    carcMeta.category === 'DENIAL' ? 'CODING_BILLING' : 'ADMINISTRATIVE'
  );

  const action = matchedRule?.actionWorkflow || carcMeta.defaultAction;
  const recoveryScore = matchedRule?.recoveryProbabilityPct ?? carcMeta.recoveryLikelihoodPct;
  const priority = matchedRule?.priorityLevel || (recoveryScore > 70 ? 'HIGH' : recoveryScore > 30 ? 'MEDIUM' : 'LOW');
  const guidance = matchedRule?.guidanceText || (
    action === 'APPEALABLE' ? 'Review denial reason with surgeon operative notes and file formal appeal within 60 days.' :
    action === 'CORRECT_AND_RESUBMIT' ? 'Review claim data fields, correct coding or demographic error, and rebill.' :
    action === 'TRANSFER_TO_PATIENT' ? 'Generate patient balance statement and route to collections workflow.' :
    'Post contractual adjustment write-off to general ledger.'
  );

  return {
    groupCode: cleanGroup,
    carcCode: cleanCarc,
    rarcCode: cleanRarc,
    amount: numAmount,
    carcMeta,
    rarcMeta,
    rootCauseCategory: rootCause,
    rootCauseDetails: ROOT_CAUSE_CATEGORIES[rootCause] || ROOT_CAUSE_CATEGORIES.ADMINISTRATIVE,
    actionWorkflow: action,
    actionDetails: ACTION_WORKFLOWS[action] || ACTION_WORKFLOWS.APPEALABLE,
    recoveryProbabilityPct: recoveryScore,
    priorityLevel: priority,
    guidanceText: guidance,
    isDenial: carcMeta.isDenial,
    isRecoverable: carcMeta.isRecoverable
  };
}

// 8. KPI Calculation Helper
export function calculateCarcKpis(interpretations = []) {
  let totalDenialExposure = 0;
  let appealableOpportunity = 0;
  let contractualFeeAdjustments = 0;
  let totalAdjustmentVolume = 0;
  const rootCauseCounts = {};

  interpretations.forEach(item => {
    const amt = parseFloat(item.amount) || 0;
    totalAdjustmentVolume += amt;

    if (item.isDenial) {
      totalDenialExposure += amt;
    }
    if (item.actionWorkflow === 'APPEALABLE' || item.actionWorkflow === 'CORRECT_AND_RESUBMIT') {
      appealableOpportunity += amt;
    }
    if (item.carcCode === '45' || item.rootCauseCategory === 'CONTRACTUAL_FEE_SCHEDULE') {
      contractualFeeAdjustments += amt;
    }

    const rc = item.rootCauseCategory || 'ADMINISTRATIVE';
    rootCauseCounts[rc] = (rootCauseCounts[rc] || 0) + amt;
  });

  const cleanAdjustmentShare = totalAdjustmentVolume > 0
    ? (contractualFeeAdjustments / totalAdjustmentVolume) * 100
    : 0;

  // Identify top root cause by dollar amount
  let topRootCause = 'None';
  let topDollar = 0;
  Object.entries(rootCauseCounts).forEach(([rc, dollar]) => {
    if (rc !== 'CONTRACTUAL_FEE_SCHEDULE' && dollar > topDollar) {
      topDollar = dollar;
      topRootCause = ROOT_CAUSE_CATEGORIES[rc]?.label || rc;
    }
  });

  return {
    totalDenialExposure,
    appealableOpportunity,
    cleanAdjustmentShare: parseFloat(cleanAdjustmentShare.toFixed(1)),
    topRootCause
  };
}

// 9. Sample Actionable Denial Baseline Data
export function getBaselineDenialQueue() {
  return [
    {
      id: 'den-01',
      claimNumber: 'CLM-2026-0042',
      patientName: 'Garon, Suzanne',
      patientMrn: 'MRN-84920',
      payerName: 'UnitedHealthcare',
      procedureName: 'Left Knee Arthroscopy with Meniscectomy',
      groupCode: 'CO',
      carcCode: '197',
      rarcCode: 'N517',
      amount: 1850.00,
      status: 'PENDING_ACTION',
      dateOfService: '2026-10-24'
    },
    {
      id: 'den-02',
      claimNumber: 'CLM-2026-0088',
      patientName: 'Smith, Johnathan',
      patientMrn: 'MRN-77312',
      payerName: 'Aetna Health',
      procedureName: 'Right Shoulder Rotator Cuff Repair',
      groupCode: 'CO',
      carcCode: '16',
      rarcCode: 'N56',
      amount: 600.00,
      status: 'APPEAL_INITIATED',
      dateOfService: '2026-10-25'
    },
    {
      id: 'den-03',
      claimNumber: 'CLM-2026-0105',
      patientName: 'Rodriguez, Maria',
      patientMrn: 'MRN-99120',
      payerName: 'Blue Cross Blue Shield',
      procedureName: 'Carpal Tunnel Release, Open',
      groupCode: 'CO',
      carcCode: '50',
      rarcCode: 'N115',
      amount: 1420.00,
      status: 'PENDING_ACTION',
      dateOfService: '2026-10-26'
    },
    {
      id: 'den-04',
      claimNumber: 'CLM-2026-0112',
      patientName: 'Davis, Robert',
      patientMrn: 'MRN-66419',
      payerName: 'Cigna Health',
      procedureName: 'Cervical Spine Anterior Discectomy (ACDF)',
      groupCode: 'CO',
      carcCode: '97',
      rarcCode: null,
      amount: 2200.00,
      status: 'PENDING_ACTION',
      dateOfService: '2026-10-27'
    },
    {
      id: 'den-05',
      claimNumber: 'CLM-2026-0128',
      patientName: 'Vance, Marcus',
      patientMrn: 'MRN-78491',
      payerName: 'Medicare Part B',
      procedureName: 'Left Knee Meniscal Repair',
      groupCode: 'PR',
      carcCode: '1',
      rarcCode: 'MA01',
      amount: 240.00,
      status: 'PATIENT_BILLED',
      dateOfService: '2026-10-28'
    },
    {
      id: 'den-06',
      claimNumber: 'CLM-2026-0135',
      patientName: 'Johnson, Eleanor',
      patientMrn: 'MRN-55102',
      payerName: 'Humana Medicare Advantage',
      procedureName: 'Total Hip Arthroplasty (THA)',
      groupCode: 'CO',
      carcCode: '29',
      rarcCode: null,
      amount: 3100.00,
      status: 'PENDING_ACTION',
      dateOfService: '2026-10-20'
    }
  ];
}

const carcRarcService = {
  CARC_GROUP_CODES,
  ROOT_CAUSE_CATEGORIES,
  ACTION_WORKFLOWS,
  CARC_CATALOG,
  RARC_CATALOG,
  COMBINATORIAL_MAPPING_RULES,
  interpretAdjustment,
  calculateCarcKpis,
  getBaselineDenialQueue
};

export default carcRarcService;

