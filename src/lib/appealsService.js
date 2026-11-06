/**
 * ASC Appeals Workflow & Dispute Management Engine
 * Phase 86: Revenue Cycle Management (RCM)
 * 
 * Multi-tier statutory appeal cases (Level 1, Level 2, Level 3),
 * clinical and technical billing evidence exhibits, submission trace tracking,
 * statutory payer turnaround date math, and outcome settlement reconciliation.
 */

// 1. Appeal Levels & Statutory Review Windows
export const APPEAL_LEVELS = {
  LEVEL_1_RECONSIDERATION: {
    id: 'LEVEL_1_RECONSIDERATION',
    label: 'Level 1: Reconsideration',
    shortLabel: 'Level 1',
    description: 'Informal clerical reopen or carrier first-pass claim reconsideration review.',
    defaultStatutoryDays: 45,
    badgeClass: 'bg-sky-950/40 text-sky-400 border-sky-800',
    escalationTarget: 'LEVEL_2_FORMAL_APPEAL'
  },
  LEVEL_2_FORMAL_APPEAL: {
    id: 'LEVEL_2_FORMAL_APPEAL',
    label: 'Level 2: Formal Administrative Appeal',
    shortLabel: 'Level 2',
    description: 'Formal medical director review or independent physician panel evaluation.',
    defaultStatutoryDays: 60,
    badgeClass: 'bg-amber-950/40 text-amber-400 border-amber-800',
    escalationTarget: 'LEVEL_3_EXTERNAL_ALJ'
  },
  LEVEL_3_EXTERNAL_ALJ: {
    id: 'LEVEL_3_EXTERNAL_ALJ',
    label: 'Level 3: External Review / ALJ',
    shortLabel: 'Level 3',
    description: 'Binding external independent review or Administrative Law Judge (ALJ) hearing.',
    defaultStatutoryDays: 90,
    badgeClass: 'bg-rose-950/40 text-rose-400 border-rose-800',
    escalationTarget: null
  }
};

// 2. Appeal State Machine Lifecycle
export const APPEAL_STATUSES = {
  DRAFT: {
    id: 'DRAFT',
    label: 'Drafting Appeal',
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
    category: 'IN_PREPARATION'
  },
  EVIDENCE_GATHERING: {
    id: 'EVIDENCE_GATHERING',
    label: 'Evidence Gathering',
    badgeClass: 'bg-amber-950/40 text-amber-400 border-amber-800',
    category: 'IN_PREPARATION'
  },
  READY_FOR_SUBMISSION: {
    id: 'READY_FOR_SUBMISSION',
    label: 'Ready for Submission',
    badgeClass: 'bg-sky-950/40 text-sky-400 border-sky-800',
    category: 'IN_PREPARATION'
  },
  SUBMITTED: {
    id: 'SUBMITTED',
    label: 'Submitted to Carrier',
    badgeClass: 'bg-blue-950/40 text-blue-400 border-blue-800',
    category: 'IN_FLIGHT'
  },
  IN_PAYER_REVIEW: {
    id: 'IN_PAYER_REVIEW',
    label: 'In Carrier Review',
    badgeClass: 'bg-sky-950/40 text-sky-400 border-sky-800',
    category: 'IN_FLIGHT'
  },
  ADDITIONAL_INFO_REQUESTED: {
    id: 'ADDITIONAL_INFO_REQUESTED',
    label: 'Carrier Requested Info',
    badgeClass: 'bg-amber-950/40 text-amber-400 border-amber-800',
    category: 'IN_FLIGHT'
  },
  OVERTURNED_FULL: {
    id: 'OVERTURNED_FULL',
    label: 'Overturned (100% Paid)',
    badgeClass: 'bg-emerald-950/40 text-emerald-400 border-emerald-800',
    category: 'RESOLVED_FAVORABLE'
  },
  OVERTURNED_PARTIAL: {
    id: 'OVERTURNED_PARTIAL',
    label: 'Overturned (Partial Settlement)',
    badgeClass: 'bg-emerald-950/40 text-emerald-300 border-emerald-700',
    category: 'RESOLVED_FAVORABLE'
  },
  UPHELD_DENIED: {
    id: 'UPHELD_DENIED',
    label: 'Upheld (Denial Sustained)',
    badgeClass: 'bg-rose-950/40 text-rose-400 border-rose-800',
    category: 'RESOLVED_UNFAVORABLE'
  },
  WITHDRAWN: {
    id: 'WITHDRAWN',
    label: 'Withdrawn by ASC',
    badgeClass: 'bg-slate-800 text-slate-400 border-slate-700',
    category: 'CLOSED'
  }
};

// 3. Clinical & Billing Evidence Exhibits Taxonomy
export const EVIDENCE_EXHIBIT_TYPES = {
  OPERATIVE_NOTE: {
    id: 'OPERATIVE_NOTE',
    label: 'Operative Narrative Note',
    category: 'CLINICAL',
    description: 'Signed surgeon operative report detailing surgical technique, findings, and pathology specimens.',
    isRequiredByDefault: true
  },
  LETTER_OF_MEDICAL_NECESSITY: {
    id: 'LETTER_OF_MEDICAL_NECESSITY',
    label: 'Letter of Medical Necessity (LOMN)',
    category: 'CLINICAL',
    description: 'Attending physician statement confirming conservative therapy failure and clinical indication.',
    isRequiredByDefault: true
  },
  PRIOR_AUTH_DOCUMENT: {
    id: 'PRIOR_AUTH_DOCUMENT',
    label: 'Prior Authorization Certificate / Ref',
    category: 'AUTHORIZATION',
    description: 'Payer pre-authorization reference, portal printout, or retroactive clinical approval letter.',
    isRequiredByDefault: false
  },
  PEER_REVIEW_RATIONALE: {
    id: 'PEER_REVIEW_RATIONALE',
    label: 'Physician Peer Review Notes',
    category: 'CLINICAL',
    description: 'Independent clinical peer review rationale supporting surgical necessity.',
    isRequiredByDefault: false
  },
  CLINICAL_CHART_NOTES: {
    id: 'CLINICAL_CHART_NOTES',
    label: 'Clinical History & Physical (H&P)',
    category: 'CLINICAL',
    description: 'Pre-operative evaluation, diagnostic imaging reports (MRI, CT, X-ray), and lab findings.',
    isRequiredByDefault: false
  },
  NCCI_UNBUNDLING_PROOF: {
    id: 'NCCI_UNBUNDLING_PROOF',
    label: 'NCCI Bundling Edit / Modifier Justification',
    category: 'TECHNICAL_BILLING',
    description: 'Documentation of distinct procedural service, separate anatomic site, or separate incision.',
    isRequiredByDefault: false
  },
  PROOF_OF_TIMELY_FILING: {
    id: 'PROOF_OF_TIMELY_FILING',
    label: 'Proof of Timely Filing (EDI 999/277CA)',
    category: 'TECHNICAL_BILLING',
    description: 'Clearinghouse electronic acceptance voucher confirming initial claim delivery within timely window.',
    isRequiredByDefault: false
  },
  PRIMARY_PAYER_EOB: {
    id: 'PRIMARY_PAYER_EOB',
    label: 'Primary Payer EOB / Remittance Voucher',
    category: 'TECHNICAL_BILLING',
    description: 'Explanation of Benefits from primary carrier for secondary dispute coordination.',
    isRequiredByDefault: false
  },
  OTHER_CLINICAL_EXHIBIT: {
    id: 'OTHER_CLINICAL_EXHIBIT',
    label: 'Other Supporting Clinical Exhibit',
    category: 'OTHER',
    description: 'Additional clinical citations, medical literature references, or manufacturer device specs.',
    isRequiredByDefault: false
  }
};

// 4. Submission Channels
export const SUBMISSION_CHANNELS = {
  PAYER_PORTAL_API: {
    id: 'PAYER_PORTAL_API',
    label: 'Direct Payer Portal API',
    description: 'Direct EDI electronic portal submission with instant delivery receipt.'
  },
  CLEARINGHOUSE_ELECTRONIC_275: {
    id: 'CLEARINGHOUSE_ELECTRONIC_275',
    label: 'EDI 275 Electronic Attachment',
    description: 'HIPAA standard 275 electronic clinical document delivery transaction.'
  },
  CERTIFIED_MAIL: {
    id: 'CERTIFIED_MAIL',
    label: 'Certified Mail (Return Receipt)',
    description: 'USPS Certified Mail with postal barcode tracking and physical signature card.'
  },
  SECURE_FAX: {
    id: 'SECURE_FAX',
    label: 'HIPAA Secure Fax',
    description: 'Direct secure facsimile transmission with carrier electronic transmission confirmation log.'
  }
};

// 5. Statutory Turnaround Date Math & Urgency
export function calculatePayerDueDate(submissionDateStr, statutoryDays = 45) {
  if (!submissionDateStr) return null;
  const subDate = new Date(submissionDateStr);
  if (isNaN(subDate.getTime())) return null;
  
  const dueDate = new Date(subDate);
  dueDate.setDate(dueDate.getDate() + statutoryDays);
  return dueDate.toISOString().slice(0, 10);
}

export function calculateTurnaroundDaysRemaining(dueDateStr, currentDateStr = null) {
  if (!dueDateStr) return null;
  const current = currentDateStr ? new Date(currentDateStr) : new Date();
  const due = new Date(dueDateStr);
  if (isNaN(due.getTime()) || isNaN(current.getTime())) return null;
  
  const diffTime = due.getTime() - current.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function classifyTurnaroundUrgency(daysRemaining, status) {
  if (['OVERTURNED_FULL', 'OVERTURNED_PARTIAL', 'UPHELD_DENIED', 'WITHDRAWN'].includes(status)) {
    return {
      tier: 'RESOLVED',
      label: 'Resolved',
      badgeClass: 'bg-emerald-950/40 text-emerald-400 border-emerald-800'
    };
  }
  if (daysRemaining === null) {
    return {
      tier: 'NOT_SUBMITTED',
      label: 'Not Submitted',
      badgeClass: 'bg-slate-800 text-slate-400 border-slate-700'
    };
  }
  if (daysRemaining < 0) {
    return {
      tier: 'OVERDUE',
      label: `Overdue (${Math.abs(daysRemaining)}d)`,
      badgeClass: 'bg-rose-950/50 text-rose-300 border-rose-700 font-bold'
    };
  }
  if (daysRemaining <= 10) {
    return {
      tier: 'URGENT',
      label: `Urgent (${daysRemaining}d remaining)`,
      badgeClass: 'bg-amber-950/50 text-amber-300 border-amber-700'
    };
  }
  return {
    tier: 'ON_TRACK',
    label: `On Track (${daysRemaining}d remaining)`,
    badgeClass: 'bg-sky-950/40 text-sky-400 border-sky-800'
  };
}

// 6. Financial Settlement Calculations
export function calculateSettlementVariance(appealedAmount, recoveredAmount) {
  const appealed = Number(appealedAmount) || 0;
  const recovered = Number(recoveredAmount) || 0;
  return Number((appealed - recovered).toFixed(2));
}

export function calculateAppealKpis(appealsList = []) {
  let totalDisputedDollars = 0;
  let totalOverturnedDollars = 0;
  let inFlightCount = 0;
  let overturnedCount = 0;
  let resolvedCount = 0;
  let overdueCount = 0;

  appealsList.forEach(a => {
    totalDisputedDollars += Number(a.appealedAmount) || 0;
    totalOverturnedDollars += Number(a.recoveredAmount) || 0;

    const isResolved = ['OVERTURNED_FULL', 'OVERTURNED_PARTIAL', 'UPHELD_DENIED', 'WITHDRAWN'].includes(a.status);
    if (!isResolved) {
      inFlightCount++;
      const days = calculateTurnaroundDaysRemaining(a.payerResponseDueDate);
      if (days !== null && days < 0) {
        overdueCount++;
      }
    } else {
      resolvedCount++;
      if (a.status === 'OVERTURNED_FULL' || a.status === 'OVERTURNED_PARTIAL') {
        overturnedCount++;
      }
    }
  });

  const aggregateRecoveryYieldPct = totalDisputedDollars > 0 
    ? Number(((totalOverturnedDollars / totalDisputedDollars) * 100).toFixed(1))
    : 0;

  const caseSuccessRatePct = resolvedCount > 0
    ? Number(((overturnedCount / resolvedCount) * 100).toFixed(1))
    : 0;

  return {
    totalDisputedDollars: Number(totalDisputedDollars.toFixed(2)),
    totalOverturnedDollars: Number(totalOverturnedDollars.toFixed(2)),
    inFlightCount,
    resolvedCount,
    overturnedCount,
    overdueCount,
    aggregateRecoveryYieldPct,
    caseSuccessRatePct,
    totalAppeals: appealsList.length
  };
}

// 7. Baseline Representative Appeals Data
export function getBaselineAppeals() {
  return [
    {
      id: 'apl-001',
      appealControlNumber: 'APL-2026-0042',
      denialId: 'den-01',
      claimNumber: 'CLM-2026-0042',
      patientName: 'Garon, Suzanne',
      patientMrn: 'MRN-84920',
      payerName: 'UnitedHealthcare',
      procedureName: 'Left Knee Arthroscopy with Meniscectomy (CPT 29881)',
      appealLevel: 'LEVEL_1_RECONSIDERATION',
      status: 'SUBMITTED',
      appealedAmount: 1850.00,
      recoveredAmount: 0.00,
      submissionChannel: 'PAYER_PORTAL_API',
      carrierTrackingNumber: 'UHC-PORTAL-889412',
      submissionDate: '2026-10-25',
      statutoryTurnaroundDays: 45,
      payerResponseDueDate: '2026-12-09',
      assignedSpecialist: 'Elena Rostova, CPC',
      clinicalRationale: 'Patient demonstrated persistent mechanical locking symptoms and completed 8 weeks of supervised physical therapy with failed NSAID regimen prior to surgical intervention.',
      evidenceExhibits: [
        { id: 'ex-01', type: 'OPERATIVE_NOTE', title: 'Operative Record - Dr. Malinoski', isVerified: true, verifiedAt: '2026-10-24' },
        { id: 'ex-02', type: 'LETTER_OF_MEDICAL_NECESSITY', title: 'Physician LOMN - Failed Conservative Care', isVerified: true, verifiedAt: '2026-10-24' },
        { id: 'ex-03', type: 'PRIOR_AUTH_DOCUMENT', title: 'Peer Review Retro Request Cert', isVerified: false, verifiedAt: null }
      ]
    },
    {
      id: 'apl-002',
      appealControlNumber: 'APL-2026-0088',
      denialId: 'den-02',
      claimNumber: 'CLM-2026-0088',
      patientName: 'Smith, Johnathan',
      patientMrn: 'MRN-77312',
      payerName: 'Aetna Health',
      procedureName: 'Right Shoulder Rotator Cuff Repair (CPT 29827)',
      appealLevel: 'LEVEL_1_RECONSIDERATION',
      status: 'OVERTURNED_FULL',
      appealedAmount: 4200.00,
      recoveredAmount: 4200.00,
      submissionChannel: 'CLEARINGHOUSE_ELECTRONIC_275',
      carrierTrackingNumber: 'AET-275-9932140',
      submissionDate: '2026-09-15',
      statutoryTurnaroundDays: 30,
      payerResponseDueDate: '2026-10-15',
      actualResponseDate: '2026-10-12',
      assignedSpecialist: 'Marcus Vance, CRCR',
      clinicalRationale: 'Original submission lacked complete anatomical operative documentation. Exhibit 1 and 2 clarify acute tear dimensions and immediate fixation necessity.',
      evidenceExhibits: [
        { id: 'ex-04', type: 'OPERATIVE_NOTE', title: 'Complete Operative Record with Tear Sizing', isVerified: true, verifiedAt: '2026-09-14' },
        { id: 'ex-05', type: 'CLINICAL_CHART_NOTES', title: 'Pre-op Shoulder MRI Impression', isVerified: true, verifiedAt: '2026-09-14' }
      ]
    },
    {
      id: 'apl-003',
      appealControlNumber: 'APL-2026-0105',
      denialId: 'den-03',
      claimNumber: 'CLM-2026-0105',
      patientName: 'Chen, Wei',
      patientMrn: 'MRN-91044',
      payerName: 'Blue Cross Blue Shield FL',
      procedureName: 'Anterior Cruciate Ligament Reconstruction (CPT 29888)',
      appealLevel: 'LEVEL_2_FORMAL_APPEAL',
      status: 'IN_PAYER_REVIEW',
      appealedAmount: 5120.00,
      recoveredAmount: 0.00,
      submissionChannel: 'PAYER_PORTAL_API',
      carrierTrackingNumber: 'BCBS-LV2-55019',
      submissionDate: '2026-09-28',
      statutoryTurnaroundDays: 45,
      payerResponseDueDate: '2026-11-12',
      assignedSpecialist: 'Elena Rostova, CPC',
      clinicalRationale: 'Level 1 denial upheld improperly citing experimental graft fixation. Level 2 appeal includes 3 peer-reviewed orthopedic literature studies and FDA 510(k) bio-absorbable clearance.',
      evidenceExhibits: [
        { id: 'ex-06', type: 'OPERATIVE_NOTE', title: 'Detailed Graft Fixation Narrative', isVerified: true, verifiedAt: '2026-09-27' },
        { id: 'ex-07', type: 'LETTER_OF_MEDICAL_NECESSITY', title: 'Level 2 Medical Director Appeal Rationale', isVerified: true, verifiedAt: '2026-09-27' },
        { id: 'ex-08', type: 'OTHER_CLINICAL_EXHIBIT', title: 'FDA Device Clearance & Biomechanical Literature', isVerified: true, verifiedAt: '2026-09-28' }
      ]
    },
    {
      id: 'apl-004',
      appealControlNumber: 'APL-2026-0144',
      denialId: 'den-04',
      claimNumber: 'CLM-2026-0144',
      patientName: 'Rodriguez, Carmen',
      patientMrn: 'MRN-60219',
      payerName: 'Cigna Healthcare',
      procedureName: 'Lumbar Microdiscectomy L4-L5 (CPT 63030)',
      appealLevel: 'LEVEL_1_RECONSIDERATION',
      status: 'ADDITIONAL_INFO_REQUESTED',
      appealedAmount: 2680.00,
      recoveredAmount: 0.00,
      submissionChannel: 'SECURE_FAX',
      carrierTrackingNumber: 'CGN-FAX-CONF-0038',
      submissionDate: '2026-10-10',
      statutoryTurnaroundDays: 30,
      payerResponseDueDate: '2026-11-09',
      assignedSpecialist: 'Sarah Jenkins, RHIA',
      clinicalRationale: 'Cigna Medical Review requested post-operative physical therapy consult notes and pre-op neuro exam showing progressive motor weakness.',
      evidenceExhibits: [
        { id: 'ex-09', type: 'OPERATIVE_NOTE', title: 'Surgical Decompression Note', isVerified: true, verifiedAt: '2026-10-09' },
        { id: 'ex-10', type: 'CLINICAL_CHART_NOTES', title: 'Neurological Deficit Clinical Charting', isVerified: false, verifiedAt: null }
      ]
    },
    {
      id: 'apl-005',
      appealControlNumber: 'APL-2026-0199',
      denialId: 'den-05',
      claimNumber: 'CLM-2026-0199',
      patientName: 'Kowalski, David',
      patientMrn: 'MRN-55418',
      payerName: 'Humana Medicare Advantage',
      procedureName: 'Total Hip Arthroplasty (CPT 27130)',
      appealLevel: 'LEVEL_1_RECONSIDERATION',
      status: 'OVERTURNED_PARTIAL',
      appealedAmount: 6400.00,
      recoveredAmount: 5220.00,
      submissionChannel: 'PAYER_PORTAL_API',
      carrierTrackingNumber: 'HUM-MED-771829',
      submissionDate: '2026-09-01',
      statutoryTurnaroundDays: 60,
      payerResponseDueDate: '2026-10-31',
      actualResponseDate: '2026-10-28',
      assignedSpecialist: 'Marcus Vance, CRCR',
      clinicalRationale: 'Carrier initially denied ASC setting citing inpatient-only list. Proof established removal from IPO list and documented severe osteoarthritis Tonnis Grade 3.',
      evidenceExhibits: [
        { id: 'ex-11', type: 'OPERATIVE_NOTE', title: 'Total Hip ASC Operative Record', isVerified: true, verifiedAt: '2026-08-30' },
        { id: 'ex-12', type: 'LETTER_OF_MEDICAL_NECESSITY', title: 'Outpatient ASC Setting Appropriateness Rationale', isVerified: true, verifiedAt: '2026-08-30' },
        { id: 'ex-13', type: 'PRIOR_AUTH_DOCUMENT', title: 'Initial Outpatient Approval Submission Printout', isVerified: true, verifiedAt: '2026-08-31' }
      ]
    },
    {
      id: 'apl-006',
      appealControlNumber: 'APL-2026-0210',
      denialId: 'den-06',
      claimNumber: 'CLM-2026-0210',
      patientName: 'Adams, Robert',
      patientMrn: 'MRN-33109',
      payerName: 'UnitedHealthcare',
      procedureName: 'Carpal Tunnel Release & Synovectomy (CPT 64721, 29848)',
      appealLevel: 'LEVEL_1_RECONSIDERATION',
      status: 'EVIDENCE_GATHERING',
      appealedAmount: 1100.00,
      recoveredAmount: 0.00,
      submissionChannel: 'PAYER_PORTAL_API',
      carrierTrackingNumber: null,
      submissionDate: null,
      statutoryTurnaroundDays: 45,
      payerResponseDueDate: null,
      assignedSpecialist: 'Sarah Jenkins, RHIA',
      clinicalRationale: 'NCCI edit denial claiming unbundled synovectomy. Operative report confirms separate operative incision and distinct diagnostic indication.',
      evidenceExhibits: [
        { id: 'ex-14', type: 'OPERATIVE_NOTE', title: 'Dual Incision Operative Report', isVerified: false, verifiedAt: null },
        { id: 'ex-15', type: 'NCCI_UNBUNDLING_PROOF', title: 'Modifier 59 Anatomical Distinctness Brief', isVerified: false, verifiedAt: null }
      ]
    }
  ];
}

const appealsService = {
  APPEAL_LEVELS,
  APPEAL_STATUSES,
  EVIDENCE_EXHIBIT_TYPES,
  SUBMISSION_CHANNELS,
  calculatePayerDueDate,
  calculateTurnaroundDaysRemaining,
  classifyTurnaroundUrgency,
  calculateSettlementVariance,
  calculateAppealKpis,
  getBaselineAppeals
};

export default appealsService;
