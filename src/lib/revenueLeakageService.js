/**
 * ASC Revenue Leakage Engine Service
 * Phase 90: Master Revenue Leakage Rules, Opportunity Model, Evidence & Lifecycle
 * 
 * Deterministic detection rules, clinical evidence compilation, algorithmic recovery
 * probability scoring, multi-category leakage tracking, and rebill recovery state machine.
 */

// 1. Master Revenue Leakage Categories
export const LEAKAGE_CATEGORIES = {
  UNBILLED_IMPLANT: {
    id: 'UNBILLED_IMPLANT',
    label: 'Unbilled Implant / Supply',
    badgeClass: 'bg-rose-950/40 text-rose-300 border-rose-800',
    colorToken: 'rose',
    description: 'High-cost surgical implants, hardware, anchors, or biologicals consumed in OR but omitted from billing claim.'
  },
  UNBILLED_PROCEDURE: {
    id: 'UNBILLED_PROCEDURE',
    label: 'Uncaptured Secondary CPT',
    badgeClass: 'bg-amber-950/40 text-amber-300 border-amber-800',
    colorToken: 'amber',
    description: 'Secondary or complementary surgical procedures documented in operative note but absent from superbill.'
  },
  MODIFIER_OMISSION: {
    id: 'MODIFIER_OMISSION',
    label: 'Modifier Omission (-59 / -50 / -78)',
    badgeClass: 'bg-sky-950/40 text-sky-300 border-sky-800',
    colorToken: 'sky',
    description: 'Distinct procedural modifiers, bilateral indicators, or global period exceptions omitted, causing payer denials.'
  },
  CONTRACT_UNDERPAYMENT: {
    id: 'CONTRACT_UNDERPAYMENT',
    label: 'Contract Fee Underpayment',
    badgeClass: 'bg-emerald-950/40 text-emerald-300 border-emerald-800',
    colorToken: 'emerald',
    description: 'Payer paid below contracted fee schedule allowance or improperly discounted negotiated implant carve-outs.'
  },
  TIMELY_FILING_RISK: {
    id: 'TIMELY_FILING_RISK',
    label: 'Timely Filing Risk (<30d)',
    badgeClass: 'bg-rose-950/50 text-rose-200 border-rose-700 font-semibold',
    colorToken: 'rose',
    description: 'Unsubmitted or queried claims rapidly approaching contractual or statutory payer timely filing cutoffs.'
  },
  DOCUMENTATION_DEFICIENCY: {
    id: 'DOCUMENTATION_DEFICIENCY',
    label: 'Documentation Deficiency',
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
    colorToken: 'slate',
    description: 'Operative notes, medical necessity justification, or surgeon attestation missing or incomplete.'
  }
};

// 2. Opportunity Lifecycle States
export const OPPORTUNITY_STATUSES = {
  DETECTED: {
    id: 'DETECTED',
    label: 'Detected (Rule Triggered)',
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
    colorToken: 'slate',
    description: 'Algorithmically detected by automated audit rules; awaiting clinical/billing review.'
  },
  UNDER_REVIEW: {
    id: 'UNDER_REVIEW',
    label: 'Under Audit Review',
    badgeClass: 'bg-sky-950/40 text-sky-400 border-sky-800',
    colorToken: 'sky',
    description: 'Assigned to coding auditor or billing specialist for operative report cross-check.'
  },
  VALIDATED_OPPORTUNITY: {
    id: 'VALIDATED_OPPORTUNITY',
    label: 'Validated Opportunity',
    badgeClass: 'bg-amber-950/50 text-amber-300 border-amber-700 font-semibold',
    colorToken: 'amber',
    description: 'Confirmed legitimate revenue loss; pending corrected claim preparation or dispute submission.'
  },
  REBILL_SUBMITTED: {
    id: 'REBILL_SUBMITTED',
    label: 'Rebill / Appeal Submitted',
    badgeClass: 'bg-cyan-950/40 text-cyan-300 border-cyan-800',
    colorToken: 'cyan',
    description: 'Replacement claim (837I frequency code 7) or formal dispute submitted to payer.'
  },
  RECOVERED: {
    id: 'RECOVERED',
    label: 'Recovered Cash Settled',
    badgeClass: 'bg-emerald-950/40 text-emerald-400 border-emerald-800 font-bold',
    colorToken: 'emerald',
    description: 'Positive remittance settled and matched to patient accounting ledger.'
  },
  DISMISSED_VALID_ADJ: {
    id: 'DISMISSED_VALID_ADJ',
    label: 'Dismissed (Valid Adj / Bundled)',
    badgeClass: 'bg-slate-800/80 text-slate-400 border-slate-700',
    colorToken: 'slate',
    description: 'Reviewed and dismissed as non-recoverable (e.g., packaged supply per CMS OPPS rules).'
  },
  EXPIRED_TIMELY_FILING: {
    id: 'EXPIRED_TIMELY_FILING',
    label: 'Expired (Timely Filing)',
    badgeClass: 'bg-rose-950/60 text-rose-400 border-rose-800',
    colorToken: 'rose',
    description: 'Filing window elapsed prior to submission; unrecoverable write-off.'
  }
};

// 3. Master Leakage Rules Baseline Catalog
export const BASELINE_LEAKAGE_RULES = [
  {
    id: 'rule-imp-001',
    rule_code: 'LEAK-IMP-001',
    category: 'UNBILLED_IMPLANT',
    title: 'Unbilled High-Cost Orthopedic Implant',
    description: 'OR consumable implant log records screw/anchor consumption with zero corresponding revenue code 0278 on claim.',
    detection_logic: 'implant_log_items > 0 AND claim_implant_charges == 0',
    severity: 'CRITICAL',
    threshold_amount: 500.00,
    default_recovery_probability: 85.00,
    is_active: true
  },
  {
    id: 'rule-cpt-002',
    rule_code: 'LEAK-CPT-002',
    category: 'UNBILLED_PROCEDURE',
    title: 'Uncaptured Secondary Meniscectomy / Debridement',
    description: 'Operative report documents extensive lateral compartment chondroplasty (29877) alongside primary ACL repair (29888).',
    detection_logic: 'nlp_op_note_cpt(29877) = TRUE AND billed_cpt NOT CONTAINS (29877)',
    severity: 'HIGH',
    threshold_amount: 750.00,
    default_recovery_probability: 80.00,
    is_active: true
  },
  {
    id: 'rule-mod-003',
    rule_code: 'LEAK-MOD-003',
    category: 'MODIFIER_OMISSION',
    title: 'Missing Modifier -59 on Distinct Procedural CPT',
    description: 'Two separate surgical sites treated in same session; secondary line billed without modifier -59 resulting in NCCI bundling denial.',
    detection_logic: 'ncci_edit_flag = TRUE AND modifier_59_present = FALSE',
    severity: 'HIGH',
    threshold_amount: 400.00,
    default_recovery_probability: 90.00,
    is_active: true
  },
  {
    id: 'rule-pay-004',
    rule_code: 'LEAK-PAY-004',
    category: 'CONTRACT_UNDERPAYMENT',
    title: 'Commercial Implant Carve-Out Underpayment',
    description: 'Payer contract stipulates invoice cost + 15% for implants exceeding $1,000; remittance paid standard group rate without carve-out.',
    detection_logic: 'remittance_paid < contracted_carve_out_rate AND payer_tier = COMMERCIAL',
    severity: 'CRITICAL',
    threshold_amount: 1200.00,
    default_recovery_probability: 75.00,
    is_active: true
  },
  {
    id: 'rule-tfl-005',
    rule_code: 'LEAK-TFL-005',
    category: 'TIMELY_FILING_RISK',
    title: 'Critical Timely Filing Threshold Exposure',
    description: 'Surgery date is within 25 days of commercial payer 90-day filing cutoff with claim still unsubmitted.',
    detection_logic: 'days_until_filing_deadline <= 30 AND claim_status = UNBILLED',
    severity: 'CRITICAL',
    threshold_amount: 2500.00,
    default_recovery_probability: 95.00,
    is_active: true
  },
  {
    id: 'rule-doc-006',
    rule_code: 'LEAK-DOC-006',
    category: 'DOCUMENTATION_DEFICIENCY',
    title: 'Missing Operative Dictation Post-Op Day 3',
    description: 'Surgical encounter completed >72 hours ago without signed operative report in EHR, preventing coding release.',
    detection_logic: 'days_post_op >= 3 AND operative_report_signed = FALSE',
    severity: 'MEDIUM',
    threshold_amount: 300.00,
    default_recovery_probability: 60.00,
    is_active: true
  }
];

// 4. Baseline Opportunities Dataset
export const BASELINE_OPPORTUNITIES = [
  {
    id: 'opp-001',
    facility_id: 'fac-main-001',
    opportunity_number: 'OPP-2026-00101',
    rule_id: 'rule-imp-001',
    surgery_id: 10142,
    claim_id: 'c7a8b9c0-1111-4444-8888-000000000001',
    patient_id: 8401,
    patient_name: 'Eleanor Vance',
    surgeon_name: 'Dr. Gardner Paul',
    specialty: 'Orthopedics',
    payer_name: 'Aetna Commercial',
    procedure_name: 'Total Knee Arthroplasty (27447)',
    date_of_service: '2026-10-18',
    category: 'UNBILLED_IMPLANT',
    status: 'VALIDATED_OPPORTUNITY',
    potential_recovery_amount: 4850.00,
    recovery_probability: 88.00,
    realized_recovered_amount: 0.00,
    filing_deadline: '2027-01-16',
    priority_score: 84.50,
    detected_at: '2026-10-22T08:30:00Z',
    reviewed_at: '2026-10-24T14:15:00Z',
    reviewed_by: 'auditor-01',
    action_notes: 'OR consumable log shows Stryker Triathlon femoral and tibial components; invoice verified. Billed claim omitted C1776 implant charge.'
  },
  {
    id: 'opp-002',
    facility_id: 'fac-main-001',
    opportunity_number: 'OPP-2026-00102',
    rule_id: 'rule-cpt-002',
    surgery_id: 10188,
    claim_id: 'c7a8b9c0-2222-4444-8888-000000000002',
    patient_id: 8442,
    patient_name: 'Marcus Thorne',
    surgeon_name: 'Dr. Malinoski Kelly',
    specialty: 'Orthopedics',
    payer_name: 'UnitedHealthcare',
    procedure_name: 'Shoulder Arthroscopy (29824)',
    date_of_service: '2026-10-20',
    category: 'UNBILLED_PROCEDURE',
    status: 'REBILL_SUBMITTED',
    potential_recovery_amount: 1950.00,
    recovery_probability: 82.00,
    realized_recovered_amount: 0.00,
    filing_deadline: '2027-01-18',
    priority_score: 72.80,
    detected_at: '2026-10-23T11:00:00Z',
    reviewed_at: '2026-10-25T09:40:00Z',
    reviewed_by: 'coder-03',
    action_notes: 'Dictation confirms subacromial decompression (29826) and extensive debridement (29823). Corrected claim 837I frequency code 7 transmitted.'
  },
  {
    id: 'opp-003',
    facility_id: 'fac-main-001',
    opportunity_number: 'OPP-2026-00103',
    rule_id: 'rule-pay-004',
    surgery_id: 10095,
    claim_id: 'c7a8b9c0-3333-4444-8888-000000000003',
    patient_id: 8355,
    patient_name: 'Sophia Sterling',
    surgeon_name: 'Dr. Bonett Andrew',
    specialty: 'Spine Surgery',
    payer_name: 'Blue Cross Blue Shield',
    procedure_name: 'Lumbar Microdiscectomy (63030)',
    date_of_service: '2026-09-14',
    category: 'CONTRACT_UNDERPAYMENT',
    status: 'RECOVERED',
    potential_recovery_amount: 3200.00,
    recovery_probability: 78.00,
    realized_recovered_amount: 3200.00,
    filing_deadline: '2026-12-13',
    priority_score: 91.20,
    detected_at: '2026-09-28T16:00:00Z',
    reviewed_at: '2026-10-02T10:20:00Z',
    reviewed_by: 'lead-rcm',
    action_notes: 'Payer omitted negotiated implant carve-out on peek interbody cage. Dispute filed with vendor invoice; supplemental remittance check received.'
  },
  {
    id: 'opp-004',
    facility_id: 'fac-main-001',
    opportunity_number: 'OPP-2026-00104',
    rule_id: 'rule-mod-003',
    surgery_id: 10214,
    claim_id: 'c7a8b9c0-4444-4444-8888-000000000004',
    patient_id: 8490,
    patient_name: 'David Harrington',
    surgeon_name: 'Dr. Walsh Mark',
    specialty: 'Ophthalmology',
    payer_name: 'Humana Commercial',
    procedure_name: 'Bilateral Blepharoplasty (15823)',
    date_of_service: '2026-10-24',
    category: 'MODIFIER_OMISSION',
    status: 'UNDER_REVIEW',
    potential_recovery_amount: 1420.00,
    recovery_probability: 92.00,
    realized_recovered_amount: 0.00,
    filing_deadline: '2027-01-22',
    priority_score: 68.40,
    detected_at: '2026-10-27T07:45:00Z',
    reviewed_at: null,
    reviewed_by: null,
    action_notes: 'Bilateral upper lid surgery billed unilaterally without modifier -50. Needs modifier addition and rebill.'
  },
  {
    id: 'opp-005',
    facility_id: 'fac-main-001',
    opportunity_number: 'OPP-2026-00105',
    rule_id: 'rule-tfl-005',
    surgery_id: 10012,
    claim_id: 'c7a8b9c0-5555-4444-8888-000000000005',
    patient_id: 8280,
    patient_name: 'Clara Oswald',
    surgeon_name: 'Dr. Baccaro Leopoldo',
    specialty: 'General Surgery',
    payer_name: 'Cigna Healthcare',
    procedure_name: 'Laparoscopic Inguinal Hernia (49505)',
    date_of_service: '2026-08-20',
    category: 'TIMELY_FILING_RISK',
    status: 'UNDER_REVIEW',
    potential_recovery_amount: 5100.00,
    recovery_probability: 95.00,
    realized_recovered_amount: 0.00,
    filing_deadline: '2026-11-18', // Under 10 days remaining!
    priority_score: 96.50,
    detected_at: '2026-10-30T13:20:00Z',
    reviewed_at: null,
    reviewed_by: null,
    action_notes: 'CRITICAL: 90-day commercial timely filing expires in 8 days. Held in coding query for mesh vendor sticker verification. Must expedite.'
  },
  {
    id: 'opp-006',
    facility_id: 'fac-main-001',
    opportunity_number: 'OPP-2026-00106',
    rule_id: 'rule-doc-006',
    surgery_id: 10255,
    claim_id: null,
    patient_id: 8530,
    patient_name: 'Robert Langdon',
    surgeon_name: 'Dr. Gardner Paul',
    specialty: 'Orthopedics',
    payer_name: 'Aetna Medicare Adv',
    procedure_name: 'ACL Reconstruction (29888)',
    date_of_service: '2026-11-02',
    category: 'DOCUMENTATION_DEFICIENCY',
    status: 'DETECTED',
    potential_recovery_amount: 3800.00,
    recovery_probability: 65.00,
    realized_recovered_amount: 0.00,
    filing_deadline: '2027-02-02',
    priority_score: 55.20,
    detected_at: '2026-11-06T09:15:00Z',
    reviewed_at: null,
    reviewed_by: null,
    action_notes: 'Surgery completed 7+ days ago; operative note unsigned. Automated query sent to Dr. Gardner via physician portal.'
  },
  {
    id: 'opp-007',
    facility_id: 'fac-main-001',
    opportunity_number: 'OPP-2026-00107',
    rule_id: 'rule-imp-001',
    surgery_id: 10170,
    claim_id: 'c7a8b9c0-7777-4444-8888-000000000007',
    patient_id: 8425,
    patient_name: 'Grace Hopper',
    surgeon_name: 'Dr. Malinoski Kelly',
    specialty: 'Orthopedics',
    payer_name: 'Blue Cross Blue Shield',
    procedure_name: 'Rotator Cuff Repair (29827)',
    date_of_service: '2026-10-15',
    category: 'UNBILLED_IMPLANT',
    status: 'DISMISSED_VALID_ADJ',
    potential_recovery_amount: 1100.00,
    recovery_probability: 70.00,
    realized_recovered_amount: 0.00,
    filing_deadline: '2027-01-13',
    priority_score: 42.00,
    detected_at: '2026-10-20T10:00:00Z',
    reviewed_at: '2026-10-22T16:00:00Z',
    reviewed_by: 'lead-rcm',
    action_notes: 'Reviewed and dismissed: BCBS policy considers suture anchors packaged into base ASC facility fee for CPT 29827 under OPPS guidelines.'
  }
];

// 5. Deterministic Financial Invariant Calculations

/**
 * Calculate expected recovery amount:
 * expected = ROUND(potential_amount * (recovery_probability / 100.0), 2)
 */
export function calculateExpectedRecovery(potentialAmount, recoveryProbability) {
  const pot = Number(potentialAmount) || 0.0;
  const prob = Number(recoveryProbability) || 0.0;
  if (pot <= 0 || prob <= 0) return 0.00;
  return Number((pot * (prob / 100.0)).toFixed(2));
}

/**
 * Calculate recovery yield rate:
 * yield = ROUND((realized_recovered / potential_recovery) * 100.0, 2)
 */
export function calculateRecoveryYield(realizedAmount, potentialAmount) {
  const real = Number(realizedAmount) || 0.0;
  const pot = Number(potentialAmount) || 0.0;
  if (pot <= 0) return 0.00;
  return Number(((real / pot) * 100.0).toFixed(2));
}

/**
 * Calculate dynamic priority score (0.00 - 100.00):
 * - Dollar magnitude weight (40%): min(40.0, (amount / 10000) * 40.0)
 * - Recovery probability weight (35%): (probability / 100.0) * 35.0
 * - Filing urgency weight (25%):
 *     days <= 15: 25.0
 *     days <= 30: 18.0
 *     days <= 60: 10.0
 *     days > 60: 5.0
 */
export function calculateOpportunityPriority(potentialAmount, recoveryProbability, filingDeadlineOrDays) {
  const pot = Number(potentialAmount) || 0.0;
  const prob = Number(recoveryProbability) || 0.0;

  // 1. Dollar weight (up to 40.0)
  const dollarWeight = Math.min(40.0, (pot / 10000.00) * 40.0);

  // 2. Probability weight (up to 35.0)
  const probWeight = Math.min(35.0, (prob / 100.0) * 35.0);

  // 3. Filing urgency weight (up to 25.0)
  let days = 90;
  if (typeof filingDeadlineOrDays === 'number') {
    days = filingDeadlineOrDays;
  } else if (typeof filingDeadlineOrDays === 'string' && filingDeadlineOrDays.length >= 10) {
    const deadline = new Date(filingDeadlineOrDays);
    const now = new Date();
    const diffTime = deadline.getTime() - now.getTime();
    days = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  }

  let urgencyWeight = 5.0;
  if (days <= 15) {
    urgencyWeight = 25.0;
  } else if (days <= 30) {
    urgencyWeight = 18.0;
  } else if (days <= 60) {
    urgencyWeight = 10.0;
  }

  const composite = dollarWeight + probWeight + urgencyWeight;
  return Number(Math.min(100.0, Math.max(0.0, composite)).toFixed(2));
}

/**
 * Aggregates portfolio summary metrics across opportunities
 */
export function getLeakageSummaryMetrics(opportunities = BASELINE_OPPORTUNITIES) {
  const totalCases = opportunities.length;
  let totalDetectedLeakage = 0.00;
  let validatedPipeline = 0.00;
  let realizedRecovered = 0.00;
  let activeRebills = 0.00;
  let dismissedAmount = 0.00;

  const categoryBreakdown = {};
  Object.keys(LEAKAGE_CATEGORIES).forEach(cat => {
    categoryBreakdown[cat] = {
      count: 0,
      potentialAmount: 0.00,
      expectedAmount: 0.00,
      realizedAmount: 0.00
    };
  });

  opportunities.forEach(opp => {
    const pot = Number(opp.potential_recovery_amount) || 0.00;
    const exp = calculateExpectedRecovery(pot, opp.recovery_probability);
    const real = Number(opp.realized_recovered_amount) || 0.00;

    totalDetectedLeakage += pot;

    if (opp.status === 'VALIDATED_OPPORTUNITY') {
      validatedPipeline += exp;
    } else if (opp.status === 'REBILL_SUBMITTED') {
      activeRebills += exp;
    } else if (opp.status === 'RECOVERED') {
      realizedRecovered += real;
    } else if (opp.status === 'DISMISSED_VALID_ADJ') {
      dismissedAmount += pot;
    }

    if (categoryBreakdown[opp.category]) {
      categoryBreakdown[opp.category].count += 1;
      categoryBreakdown[opp.category].potentialAmount += pot;
      categoryBreakdown[opp.category].expectedAmount += exp;
      categoryBreakdown[opp.category].realizedAmount += real;
    }
  });

  const recoveryYieldPct = calculateRecoveryYield(realizedRecovered, totalDetectedLeakage);

  return {
    totalCases,
    totalDetectedLeakage: Number(totalDetectedLeakage.toFixed(2)),
    validatedPipeline: Number(validatedPipeline.toFixed(2)),
    realizedRecovered: Number(realizedRecovered.toFixed(2)),
    activeRebills: Number(activeRebills.toFixed(2)),
    dismissedAmount: Number(dismissedAmount.toFixed(2)),
    recoveryYieldPct,
    categoryBreakdown
  };
}

/**
 * Aggregates leakage scorecards grouped by surgeon and specialty
 */
export function getSurgeonScorecards(opportunities = BASELINE_OPPORTUNITIES) {
  const surgeonMap = {};

  opportunities.forEach(opp => {
    const name = opp.surgeon_name || 'Unassigned';
    if (!surgeonMap[name]) {
      surgeonMap[name] = {
        surgeon_name: name,
        specialty: opp.specialty || 'General',
        total_opportunities: 0,
        total_potential_leakage: 0.00,
        total_expected_recovery: 0.00,
        total_realized_recovery: 0.00,
        unbilled_implant_cases: 0,
        unbilled_procedure_cases: 0,
        modifier_omission_cases: 0,
        doc_deficiency_cases: 0
      };
    }

    const pot = Number(opp.potential_recovery_amount) || 0.00;
    const exp = calculateExpectedRecovery(pot, opp.recovery_probability);
    const real = Number(opp.realized_recovered_amount) || 0.00;

    surgeonMap[name].total_opportunities += 1;
    surgeonMap[name].total_potential_leakage += pot;
    surgeonMap[name].total_expected_recovery += exp;
    surgeonMap[name].total_realized_recovery += real;

    if (opp.category === 'UNBILLED_IMPLANT') surgeonMap[name].unbilled_implant_cases += 1;
    if (opp.category === 'UNBILLED_PROCEDURE') surgeonMap[name].unbilled_procedure_cases += 1;
    if (opp.category === 'MODIFIER_OMISSION') surgeonMap[name].modifier_omission_cases += 1;
    if (opp.category === 'DOCUMENTATION_DEFICIENCY') surgeonMap[name].doc_deficiency_cases += 1;
  });

  return Object.values(surgeonMap).map(s => ({
    ...s,
    total_potential_leakage: Number(s.total_potential_leakage.toFixed(2)),
    total_expected_recovery: Number(s.total_expected_recovery.toFixed(2)),
    total_realized_recovery: Number(s.total_realized_recovery.toFixed(2))
  })).sort((a, b) => b.total_potential_leakage - a.total_potential_leakage);
}

// 6. Stateful In-Memory Opportunity Store for Client UI & Tests
class RevenueLeakageStore {
  constructor() {
    this.rules = [...BASELINE_LEAKAGE_RULES];
    this.opportunities = JSON.parse(JSON.stringify(BASELINE_OPPORTUNITIES));
  }

  getRules(filters = {}) {
    let result = [...this.rules];
    if (filters.category) {
      result = result.filter(r => r.category === filters.category);
    }
    if (filters.severity) {
      result = result.filter(r => r.severity === filters.severity);
    }
    if (typeof filters.isActive === 'boolean') {
      result = result.filter(r => r.is_active === filters.isActive);
    }
    return result;
  }

  getOpportunities(filters = {}) {
    let result = [...this.opportunities];

    if (filters.category && filters.category !== 'ALL') {
      result = result.filter(o => o.category === filters.category);
    }
    if (filters.status && filters.status !== 'ALL') {
      result = result.filter(o => o.status === filters.status);
    }
    if (filters.surgeon) {
      result = result.filter(o => o.surgeon_name.toLowerCase().includes(filters.surgeon.toLowerCase()));
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(o => 
        o.opportunity_number.toLowerCase().includes(q) ||
        o.patient_name.toLowerCase().includes(q) ||
        o.procedure_name.toLowerCase().includes(q) ||
        o.surgeon_name.toLowerCase().includes(q)
      );
    }

    return result.sort((a, b) => b.priority_score - a.priority_score);
  }

  getOpportunityById(id) {
    return this.opportunities.find(o => o.id === id) || null;
  }

  validateOpportunity(id, { adjustedPotential, probability, notes }) {
    const opp = this.getOpportunityById(id);
    if (!opp) throw new Error(`Opportunity ${id} not found`);

    if (typeof adjustedPotential === 'number' && adjustedPotential >= 0) {
      opp.potential_recovery_amount = Number(adjustedPotential.toFixed(2));
    }
    if (typeof probability === 'number' && probability >= 0 && probability <= 100) {
      opp.recovery_probability = Number(probability.toFixed(2));
    }
    if (notes) {
      opp.action_notes = `${opp.action_notes ? opp.action_notes + ' | ' : ''}Validation: ${notes}`;
    }

    opp.status = 'VALIDATED_OPPORTUNITY';
    opp.reviewed_at = new Date().toISOString();
    opp.priority_score = calculateOpportunityPriority(opp.potential_recovery_amount, opp.recovery_probability, opp.filing_deadline);

    return opp;
  }

  submitRebill(id, { rebillType = '837I_FREQ_7', claimControlNumber, notes }) {
    const opp = this.getOpportunityById(id);
    if (!opp) throw new Error(`Opportunity ${id} not found`);

    opp.status = 'REBILL_SUBMITTED';
    opp.reviewed_at = new Date().toISOString();
    const ccn = claimControlNumber ? ` [CCN: ${claimControlNumber}]` : '';
    opp.action_notes = `${opp.action_notes ? opp.action_notes + ' | ' : ''}Rebill (${rebillType})${ccn}: ${notes || 'Submitted to payer'}`;

    return opp;
  }

  markRecovered(id, { realizedAmount, notes }) {
    const opp = this.getOpportunityById(id);
    if (!opp) throw new Error(`Opportunity ${id} not found`);

    const real = typeof realizedAmount === 'number' ? realizedAmount : opp.potential_recovery_amount;
    opp.realized_recovered_amount = Number(real.toFixed(2));
    opp.status = 'RECOVERED';
    opp.reviewed_at = new Date().toISOString();
    opp.action_notes = `${opp.action_notes ? opp.action_notes + ' | ' : ''}Recovered $${real.toFixed(2)}: ${notes || 'Remittance posted'}`;

    return opp;
  }

  dismissOpportunity(id, { reason = 'VALID_ADJUSTMENT', notes }) {
    const opp = this.getOpportunityById(id);
    if (!opp) throw new Error(`Opportunity ${id} not found`);

    opp.status = 'DISMISSED_VALID_ADJ';
    opp.reviewed_at = new Date().toISOString();
    opp.action_notes = `${opp.action_notes ? opp.action_notes + ' | ' : ''}Dismissed (${reason}): ${notes || 'Legitimate non-recovery'}`;

    return opp;
  }

  toggleRuleActive(ruleId) {
    const rule = this.rules.find(r => r.id === ruleId);
    if (!rule) throw new Error(`Rule ${ruleId} not found`);
    rule.is_active = !rule.is_active;
    return rule;
  }
}

export const revenueLeakageService = new RevenueLeakageStore();
export default revenueLeakageService;
