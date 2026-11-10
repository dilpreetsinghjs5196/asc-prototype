/**
 * ASC Missing Charge Detection Engine Service
 * Phase 92: Missing CPT, Line, Implant, Supply & Charge Detection
 * 
 * Cross-system charge audits comparing clinical documentation, OR logs,
 * MAR pharmacy, and anesthesia records against billed claims to recover lost revenue.
 */

// 1. Charge Categories Taxonomy
export const CHARGE_CATEGORIES = {
  SECONDARY_CPT: {
    id: 'SECONDARY_CPT',
    label: 'Secondary / Add-On CPT',
    badgeClass: 'bg-amber-950/40 text-amber-300 border-amber-800',
    colorToken: 'amber',
    description: 'Documented surgical procedure or add-on code performed but omitted from superbill/claim.'
  },
  IMPLANT_HARDWARE: {
    id: 'IMPLANT_HARDWARE',
    label: 'Implant / Hardware (0278)',
    badgeClass: 'bg-rose-950/40 text-rose-300 border-rose-800',
    colorToken: 'rose',
    description: 'High-cost implant, anchor, prosthetic, or screw consumed in OR but omitted from claim lines.'
  },
  HIGH_COST_DRUG: {
    id: 'HIGH_COST_DRUG',
    label: 'Specialty Drug / J-Code',
    badgeClass: 'bg-cyan-950/40 text-cyan-300 border-cyan-800',
    colorToken: 'cyan',
    description: 'Specialty pharmaceutical administered per MAR (e.g. Exparel, sugammadex) omitted from pharmacy billing.'
  },
  SURGICAL_SUPPLY: {
    id: 'SURGICAL_SUPPLY',
    label: 'Specialized Consumable Supply',
    badgeClass: 'bg-sky-950/40 text-sky-300 border-sky-800',
    colorToken: 'sky',
    description: 'High-cost single-use device (plasma wand, ultrasonic blade, biological matrix) omitted from facility charges.'
  },
  ANESTHESIA_UNITS: {
    id: 'ANESTHESIA_UNITS',
    label: 'Anesthesia Time Units',
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
    colorToken: 'slate',
    description: 'Anesthesia minutes logged in OR milestones where base units + time units were underbilled.'
  },
  PATHOLOGY_SPECIMEN: {
    id: 'PATHOLOGY_SPECIMEN',
    label: 'Pathology Specimen Handling',
    badgeClass: 'bg-emerald-950/40 text-emerald-300 border-emerald-800',
    colorToken: 'emerald',
    description: 'Biopsy or surgical specimen sent to lab where technical handling/grossing (88305) was omitted.'
  }
};

// 2. Missing Charge Lifecycle Statuses
export const MISSING_CHARGE_STATUSES = {
  DETECTED: {
    id: 'DETECTED',
    label: 'Detected by Audit',
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
    colorToken: 'slate',
    description: 'Identified via cross-check algorithm; awaiting clinical and coding review.'
  },
  UNDER_AUDIT: {
    id: 'UNDER_AUDIT',
    label: 'Under Clinical Audit',
    badgeClass: 'bg-sky-950/40 text-sky-400 border-sky-800',
    colorToken: 'sky',
    description: 'Assigned to coding specialist to review operative notes and nursing logs.'
  },
  CHARGE_CONFIRMED: {
    id: 'CHARGE_CONFIRMED',
    label: 'Charge Confirmed (Ready)',
    badgeClass: 'bg-amber-950/50 text-amber-300 border-amber-700 font-semibold',
    colorToken: 'amber',
    description: 'Clinically verified; queued for claim line addition and rebill submission.'
  },
  CLAIM_AMENDED: {
    id: 'CLAIM_AMENDED',
    label: 'Claim Amended / Re-Billed',
    badgeClass: 'bg-emerald-950/40 text-emerald-400 border-emerald-800 font-bold',
    colorToken: 'emerald',
    description: 'Replacement claim (837I frequency code 7) generated and transmitted to clearinghouse.'
  },
  DISMISSED_NOT_BILLABLE: {
    id: 'DISMISSED_NOT_BILLABLE',
    label: 'Dismissed (Non-Billable)',
    badgeClass: 'bg-slate-800/80 text-slate-400 border-slate-700',
    colorToken: 'slate',
    description: 'Audited and dismissed (e.g. bundled under CMS composite payment or packaged supply).'
  }
};

// 3. Clinical Evidence Sources
export const EVIDENCE_SOURCES = {
  OPERATIVE_DICTATION: 'Operative Dictation Report',
  OR_NURSING_LOG: 'Circulating Nurse Supply Sheet',
  IMPLANT_USAGE_LOG: 'Intraoperative Implant Log',
  MAR_PHARMACY: 'Medication Administration Record (MAR)',
  ANESTHESIA_RECORD: 'Anesthesia Time & Drug Record',
  PATHOLOGY_REQUISITION: 'Pathology Lab Requisition'
};

// 4. Deterministic Calculations

/**
 * Calculates estimated net recovery:
 * net = ROUND(lostCharge * (reimbursementRate / 100), 2)
 */
export function calculateEstimatedNetRecovery(lostCharge, reimbursementRate = 40.00) {
  const chg = Number(lostCharge) || 0.0;
  const rate = Number(reimbursementRate) || 0.0;
  if (chg <= 0 || rate <= 0) return 0.00;
  return Number((chg * (rate / 100.0)).toFixed(2));
}

/**
 * Computes composite missing charge priority score (0.00 - 100.00):
 * - Dollar magnitude weight (45%): min(45.0, (netRecovery / 5000) * 45.0)
 * - Detection confidence weight (35%): (confidence / 100.0) * 35.0
 * - Encounter age weight (20%):
 *     days <= 30: 20.0
 *     days <= 60: 12.0
 *     days > 60: 5.0
 */
export function calculatePriorityScore(netRecovery, detectionConfidence, daysElapsed) {
  const net = Number(netRecovery) || 0.0;
  const conf = Number(detectionConfidence) || 0.0;
  const days = Number(daysElapsed) || 0;

  const dollarWeight = Math.min(45.0, (net / 5000.00) * 45.0);
  const confWeight = Math.min(35.0, (conf / 100.0) * 35.0);

  let ageWeight = 5.0;
  if (days <= 30) ageWeight = 20.0;
  else if (days <= 60) ageWeight = 12.0;

  const total = dollarWeight + confWeight + ageWeight;
  return Number(Math.min(100.0, Math.max(0.0, total)).toFixed(2));
}

// 5. Baseline Missing Charges Dataset
export const BASELINE_MISSING_CHARGES = [
  {
    id: 'chg-001',
    facility_id: 'fac-main-001',
    charge_alert_number: 'CHG-2026-00101',
    surgery_id: 10420,
    patient_id: 8520,
    claim_id: 'c7a8b9c0-9991-4444-8888-000000000001',
    patient_name: 'Jonathan Reynolds',
    surgeon_name: 'Dr. Malinoski Kelly',
    specialty: 'Orthopedics',
    procedure_name: 'Knee Arthroscopy w/ Meniscectomy',
    payer_name: 'Blue Cross Blue Shield',
    date_of_service: '2026-10-22',
    charge_category: 'SECONDARY_CPT',
    item_code: '29877',
    item_description: 'Arthroscopy, knee, surgical; debridement/shaving of articular cartilage (chondroplasty)',
    estimated_lost_charge: 2450.00,
    expected_reimbursement_rate: 45.00,
    clinical_evidence_source: 'OPERATIVE_DICTATION',
    evidence_text: 'Operative note explicitly documents: "Extensive grade III chondromalacia of the lateral femoral condyle was thoroughly debrided and shaved smooth using motorized shaver."',
    detection_confidence: 94.00,
    status: 'CHARGE_CONFIRMED',
    resolution_notes: 'Dr. Malinoski confirmed secondary chondroplasty performed in separate compartment. Ready to append CPT 29877-59.'
  },
  {
    id: 'chg-002',
    facility_id: 'fac-main-001',
    charge_alert_number: 'CHG-2026-00102',
    surgery_id: 10455,
    patient_id: 8560,
    claim_id: 'c7a8b9c0-9992-4444-8888-000000000002',
    patient_name: 'Sarah Jenkins',
    surgeon_name: 'Dr. Gardner Paul',
    specialty: 'Orthopedics',
    procedure_name: 'Rotator Cuff Repair (29827)',
    payer_name: 'Aetna Commercial',
    date_of_service: '2026-10-25',
    charge_category: 'IMPLANT_HARDWARE',
    item_code: 'C1713',
    item_description: 'Anchor/screw for opposing bone-to-bone or soft tissue-to-bone (Arthrex 4.75mm SwiveLock)',
    estimated_lost_charge: 3200.00,
    expected_reimbursement_rate: 65.00,
    clinical_evidence_source: 'IMPLANT_USAGE_LOG',
    evidence_text: 'Intraoperative implant sticker shows 2x Arthrex 4.75mm BioComposite SwiveLock anchors (Lot #AR-2324BCC). Billed claim omitted Revenue Code 0278 line.',
    detection_confidence: 98.00,
    status: 'DETECTED',
    resolution_notes: 'Implant usage log confirmed. Claim billed facility fee only without implant carve-out.'
  },
  {
    id: 'chg-003',
    facility_id: 'fac-main-001',
    charge_alert_number: 'CHG-2026-00103',
    surgery_id: 10390,
    patient_id: 8495,
    claim_id: 'c7a8b9c0-9993-4444-8888-000000000003',
    patient_name: 'Robert Thornton',
    surgeon_name: 'Dr. Bonett Andrew',
    specialty: 'Spine Surgery',
    procedure_name: 'Lumbar Microdiscectomy (63030)',
    payer_name: 'UnitedHealthcare',
    date_of_service: '2026-09-30',
    charge_category: 'HIGH_COST_DRUG',
    item_code: 'J0665',
    item_description: 'Injection, bupivacaine liposome, 1 mg (Exparel, 20 mL vial - 266 mg)',
    estimated_lost_charge: 850.00,
    expected_reimbursement_rate: 55.00,
    clinical_evidence_source: 'MAR_PHARMACY',
    evidence_text: 'Anesthesia MAR shows 20 mL (266 mg) Exparel infiltrated intraoperatively at surgical site prior to closure by Dr. Bonett. Unbilled on pharmacy line.',
    detection_confidence: 92.00,
    status: 'CLAIM_AMENDED',
    resolution_notes: 'Claim amended with HCPCS J0665 x 266 units. Replacement 837 claim submitted under CCN-837-7721.'
  },
  {
    id: 'chg-004',
    facility_id: 'fac-main-001',
    charge_alert_number: 'CHG-2026-00104',
    surgery_id: 10480,
    patient_id: 8590,
    claim_id: 'c7a8b9c0-9994-4444-8888-000000000004',
    patient_name: 'Emily Watson',
    surgeon_name: 'Dr. Walsh Mark',
    specialty: 'Ophthalmology',
    procedure_name: 'Cataract Extraction w/ IOL (66984)',
    payer_name: 'Medicare Part B',
    date_of_service: '2026-11-03',
    charge_category: 'SURGICAL_SUPPLY',
    item_code: 'A4649',
    item_description: 'Surgical supply; specialized visco-adaptive viscoelastic (Healon5)',
    estimated_lost_charge: 340.00,
    expected_reimbursement_rate: 0.00,
    clinical_evidence_source: 'OR_NURSING_LOG',
    evidence_text: 'Circulator nursing log lists 1x Healon5 syringe opened and consumed. Omitted from facility supply detail.',
    detection_confidence: 88.00,
    status: 'DISMISSED_NOT_BILLABLE',
    resolution_notes: 'Reviewed and dismissed: Under CMS ASC OPPS payment rules, viscoelastic supplies are packaged into CPT 66984 base facility payment.'
  },
  {
    id: 'chg-005',
    facility_id: 'fac-main-001',
    charge_alert_number: 'CHG-2026-00105',
    surgery_id: 10410,
    patient_id: 8510,
    claim_id: 'c7a8b9c0-9995-4444-8888-000000000005',
    patient_name: 'Michael Chang',
    surgeon_name: 'Dr. Baccaro Leopoldo',
    specialty: 'General Surgery',
    procedure_name: 'Laparoscopic Inguinal Hernia (49505)',
    payer_name: 'Cigna Healthcare',
    date_of_service: '2026-10-18',
    charge_category: 'PATHOLOGY_SPECIMEN',
    item_code: '88305',
    item_description: 'Level IV - Surgical pathology, gross and microscopic examination (hernia sac)',
    estimated_lost_charge: 420.00,
    expected_reimbursement_rate: 50.00,
    clinical_evidence_source: 'PATHOLOGY_REQUISITION',
    evidence_text: 'Pathology requisition slip #PATH-9941 confirms inguinal hernia sac tissue sent to regional lab for histological exam. ASC technical gross handling unbilled.',
    detection_confidence: 90.00,
    status: 'UNDER_AUDIT',
    resolution_notes: 'Pathology requisition verified. Checking contract to confirm whether commercial payer pays technical component separately.'
  },
  {
    id: 'chg-006',
    facility_id: 'fac-main-001',
    charge_alert_number: 'CHG-2026-00106',
    surgery_id: 10495,
    patient_id: 8610,
    claim_id: 'c7a8b9c0-9996-4444-8888-000000000006',
    patient_name: 'Amanda Vance',
    surgeon_name: 'Dr. Malinoski Kelly',
    specialty: 'Orthopedics',
    procedure_name: 'Shoulder Arthroscopy (29824)',
    payer_name: 'Humana Commercial',
    date_of_service: '2026-10-28',
    charge_category: 'SURGICAL_SUPPLY',
    item_code: 'C1787',
    item_description: 'Patient powered radiofrequency plasma wand (Arthrocare Super MultiVac 50)',
    estimated_lost_charge: 1100.00,
    expected_reimbursement_rate: 60.00,
    clinical_evidence_source: 'OR_NURSING_LOG',
    evidence_text: 'Nursing supply log records single-use RF wand consumed. Commercial contract allows separate reimbursement at cost + 12% on supplies >$500.',
    detection_confidence: 95.00,
    status: 'DETECTED',
    resolution_notes: 'Supply log confirms wand serial #SN-8821. Eligible for commercial carve-out submission.'
  }
];

// 6. Aggregation Helpers

/**
 * Aggregates summary KPIs across missing charge alerts
 */
export function getMissingChargeSummaryMetrics(charges = BASELINE_MISSING_CHARGES) {
  const totalAlerts = charges.length;
  let totalLostCharges = 0.00;
  let estimatedNetRecovery = 0.00;
  let confirmedPipeline = 0.00;
  let realizedAmendedRecovery = 0.00;
  let dismissedLostCharges = 0.00;

  charges.forEach(c => {
    const lost = Number(c.estimated_lost_charge) || 0.00;
    const net = calculateEstimatedNetRecovery(lost, c.expected_reimbursement_rate);

    totalLostCharges += lost;
    estimatedNetRecovery += net;

    if (c.status === 'CHARGE_CONFIRMED') {
      confirmedPipeline += net;
    } else if (c.status === 'CLAIM_AMENDED') {
      realizedAmendedRecovery += net;
    } else if (c.status === 'DISMISSED_NOT_BILLABLE') {
      dismissedLostCharges += lost;
    }
  });

  return {
    totalAlerts,
    totalLostCharges: Number(totalLostCharges.toFixed(2)),
    estimatedNetRecovery: Number(estimatedNetRecovery.toFixed(2)),
    confirmedPipeline: Number(confirmedPipeline.toFixed(2)),
    realizedAmendedRecovery: Number(realizedAmendedRecovery.toFixed(2)),
    dismissedLostCharges: Number(dismissedLostCharges.toFixed(2))
  };
}

/**
 * Aggregates missing charges by category
 */
export function getCategoryBreakdown(charges = BASELINE_MISSING_CHARGES) {
  const breakdown = {};

  Object.keys(CHARGE_CATEGORIES).forEach(cat => {
    breakdown[cat] = {
      id: cat,
      label: CHARGE_CATEGORIES[cat].label,
      count: 0,
      totalLostCharges: 0.00,
      estimatedNetRecovery: 0.00
    };
  });

  charges.forEach(c => {
    if (breakdown[c.charge_category]) {
      const lost = Number(c.estimated_lost_charge) || 0.00;
      const net = calculateEstimatedNetRecovery(lost, c.expected_reimbursement_rate);

      breakdown[c.charge_category].count += 1;
      breakdown[c.charge_category].totalLostCharges += lost;
      breakdown[c.charge_category].estimatedNetRecovery += net;
    }
  });

  return Object.values(breakdown).map(b => ({
    ...b,
    totalLostCharges: Number(b.totalLostCharges.toFixed(2)),
    estimatedNetRecovery: Number(b.estimatedNetRecovery.toFixed(2))
  })).sort((a, b) => b.estimatedNetRecovery - a.estimatedNetRecovery);
}

// 7. Stateful In-Memory Missing Charge Store
class MissingChargeStore {
  constructor() {
    this.charges = JSON.parse(JSON.stringify(BASELINE_MISSING_CHARGES));
  }

  getCharges(filters = {}, referenceDate = new Date()) {
    let result = this.charges.map(c => {
      const dos = new Date(c.date_of_service);
      const ref = new Date(referenceDate);
      const daysElapsed = Math.max(0, Math.floor((ref.getTime() - dos.getTime()) / (1000 * 60 * 60 * 24)));
      const net = calculateEstimatedNetRecovery(c.estimated_lost_charge, c.expected_reimbursement_rate);
      const priority = calculatePriorityScore(net, c.detection_confidence, daysElapsed);

      return {
        ...c,
        days_elapsed: daysElapsed,
        estimated_net_recovery: net,
        priority_score: priority
      };
    });

    if (filters.category && filters.category !== 'ALL') {
      result = result.filter(c => c.charge_category === filters.category);
    }
    if (filters.status && filters.status !== 'ALL') {
      result = result.filter(c => c.status === filters.status);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(c =>
        c.charge_alert_number.toLowerCase().includes(q) ||
        c.patient_name.toLowerCase().includes(q) ||
        c.surgeon_name.toLowerCase().includes(q) ||
        c.item_code.toLowerCase().includes(q) ||
        c.item_description.toLowerCase().includes(q)
      );
    }

    return result.sort((a, b) => b.priority_score - a.priority_score);
  }

  getChargeById(id) {
    return this.charges.find(c => c.id === id) || null;
  }

  confirmCharge(id, { adjustedAmount, notes }) {
    const c = this.getChargeById(id);
    if (!c) throw new Error(`Missing charge alert ${id} not found`);

    if (typeof adjustedAmount === 'number' && adjustedAmount >= 0) {
      c.estimated_lost_charge = Number(adjustedAmount.toFixed(2));
    }
    c.status = 'CHARGE_CONFIRMED';
    c.reviewed_at = new Date().toISOString();
    c.resolution_notes = `${c.resolution_notes ? c.resolution_notes + ' | ' : ''}Confirmed: ${notes || 'Verified against clinical documentation'}`;
    return c;
  }

  amendClaim(id, { replacementClaimControlNumber, notes }) {
    const c = this.getChargeById(id);
    if (!c) throw new Error(`Missing charge alert ${id} not found`);

    c.status = 'CLAIM_AMENDED';
    c.reviewed_at = new Date().toISOString();
    const ccn = replacementClaimControlNumber ? ` [CCN: ${replacementClaimControlNumber}]` : '';
    c.resolution_notes = `${c.resolution_notes ? c.resolution_notes + ' | ' : ''}Amended Claim${ccn}: ${notes || 'Replacement 837 transmitted'}`;
    return c;
  }

  dismissCharge(id, { reason, notes }) {
    const c = this.getChargeById(id);
    if (!c) throw new Error(`Missing charge alert ${id} not found`);

    c.status = 'DISMISSED_NOT_BILLABLE';
    c.reviewed_at = new Date().toISOString();
    c.resolution_notes = `${c.resolution_notes ? c.resolution_notes + ' | ' : ''}Dismissed (${reason || 'NON_BILLABLE'}): ${notes || 'Packaged / non-billable'}`;
    return c;
  }
}

export const missingChargeService = new MissingChargeStore();
export default missingChargeService;
