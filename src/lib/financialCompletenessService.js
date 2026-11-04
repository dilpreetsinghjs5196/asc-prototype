/**
 * ==============================================================================
 * Financial Completeness Score & Trust Thresholds Service
 * Phase 76: Multi-Dimensional Financial Audit Readiness & Data Provenance Integrity
 * ==============================================================================
 * 
 * Strict Healthcare Financial Governance:
 * - Deterministic additive scoring model (0.00 - 100.00 points)
 * - 4-Tier Trust Thresholds (Audit-Ready, Substantial Trust, Provisional, Critical Incomplete)
 * - Missing documentation detection and actionable remediation routing
 * - Maestro Clinical Design System: strictly Slate, Emerald, Sky, Amber, Rose
 */

export const COMPLETENESS_TRUST_TIERS = {
  VERIFIED_AUDIT_READY: 'VERIFIED_AUDIT_READY',
  SUBSTANTIAL_TRUST: 'SUBSTANTIAL_TRUST',
  PROVISIONAL_ESTIMATED: 'PROVISIONAL_ESTIMATED',
  CRITICAL_INCOMPLETE: 'CRITICAL_INCOMPLETE'
};

export const TRUST_TIER_CONFIG = {
  [COMPLETENESS_TRUST_TIERS.VERIFIED_AUDIT_READY]: {
    key: COMPLETENESS_TRUST_TIERS.VERIFIED_AUDIT_READY,
    label: 'Verified Audit-Ready (≥90)',
    shortLabel: 'Audit-Ready',
    minScore: 90.00,
    colorToken: 'emerald',
    badgeClass: 'badge-emerald',
    description: '100% auditable; ready for period freeze and board reporting.'
  },
  [COMPLETENESS_TRUST_TIERS.SUBSTANTIAL_TRUST]: {
    key: COMPLETENESS_TRUST_TIERS.SUBSTANTIAL_TRUST,
    label: 'Substantial Trust (75–89.9)',
    shortLabel: 'Substantial Trust',
    minScore: 75.00,
    colorToken: 'sky',
    badgeClass: 'badge-sky',
    description: 'High operational confidence; non-material secondary items pending.'
  },
  [COMPLETENESS_TRUST_TIERS.PROVISIONAL_ESTIMATED]: {
    key: COMPLETENESS_TRUST_TIERS.PROVISIONAL_ESTIMATED,
    label: 'Provisional Estimated (50–74.9)',
    shortLabel: 'Provisional',
    minScore: 50.00,
    colorToken: 'amber',
    badgeClass: 'badge-amber',
    description: 'Material estimates exist; blocks closed-period general ledger freeze.'
  },
  [COMPLETENESS_TRUST_TIERS.CRITICAL_INCOMPLETE]: {
    key: COMPLETENESS_TRUST_TIERS.CRITICAL_INCOMPLETE,
    label: 'Critical Incomplete (<50)',
    shortLabel: 'Critical Incomplete',
    minScore: 0.00,
    colorToken: 'rose',
    badgeClass: 'badge-rose',
    description: 'Core financial data missing; excluded from executive margin totals.'
  }
};

export const SCORING_DIMENSIONS = [
  { key: 'reimbursement', label: 'Reimbursement Completeness', maxPoints: 25.00 },
  { key: 'directCost', label: 'Direct Cost & Implant Integrity', maxPoints: 25.00 },
  { key: 'timeStaffing', label: 'Time & Staffing Documentation', maxPoints: 20.00 },
  { key: 'pharmacySterile', label: 'Pharmacy & Sterile Reprocessing', maxPoints: 10.00 },
  { key: 'codingModifier', label: 'Coding & Modifier Specificity', maxPoints: 10.00 },
  { key: 'ledgerVerification', label: 'Cash Adjudication & Ledger Verification', maxPoints: 10.00 }
];

export function roundToTwo(num) {
  if (num === null || num === undefined || isNaN(num)) return 0.00;
  return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
}

export const financialCompletenessService = {
  /**
   * Resolves trust tier from overall numeric score.
   */
  classifyTrustTier(overallScore) {
    const s = Number(overallScore) || 0.00;
    if (s >= 90.00) return COMPLETENESS_TRUST_TIERS.VERIFIED_AUDIT_READY;
    if (s >= 75.00) return COMPLETENESS_TRUST_TIERS.SUBSTANTIAL_TRUST;
    if (s >= 50.00) return COMPLETENESS_TRUST_TIERS.PROVISIONAL_ESTIMATED;
    return COMPLETENESS_TRUST_TIERS.CRITICAL_INCOMPLETE;
  },

  /**
   * Identifies missing documentation items and remediation pathways for a case.
   */
  identifyMissingElements(caseRecord) {
    const missing = [];

    // 1. Reimbursement gaps
    if (!caseRecord.hasPrimaryPayerContract) {
      missing.push({
        code: 'MISSING_PAYER_CONTRACT',
        label: 'Uncontracted / Unmapped Payer Fee Schedule',
        severity: 'HIGH',
        dimension: 'Reimbursement',
        impactPoints: 10.00
      });
    }
    if (!caseRecord.hasSecondaryOrCopayVerified) {
      missing.push({
        code: 'UNVERIFIED_PATIENT_RESPONSIBILITY',
        label: 'Unverified Patient Deductible / Copay Capture',
        severity: 'MEDIUM',
        dimension: 'Reimbursement',
        impactPoints: 5.00
      });
    }

    // 2. Direct cost gaps
    if (caseRecord.requiresImplants && !caseRecord.hasVerifiedImplantInvoice) {
      missing.push({
        code: 'MISSING_IMPLANT_INVOICE',
        label: 'Pending Implant Vendor Invoice & SKU Matching',
        severity: 'HIGH',
        dimension: 'Direct Cost',
        impactPoints: 15.00
      });
    }
    if (!caseRecord.hasReconciledSupplies) {
      missing.push({
        code: 'UNRECONCILED_SUPPLY_WASTE',
        label: 'Preference Card Supply Depletion Unreconciled',
        severity: 'LOW',
        dimension: 'Direct Cost',
        impactPoints: 5.00
      });
    }

    // 3. Time & Staffing gaps
    if (!caseRecord.hasVerifiedRoomTimestamps) {
      missing.push({
        code: 'UNVERIFIED_ROOM_TIMESTAMPS',
        label: 'Wheels-In to Wheels-Out Exact Timestamps Missing',
        severity: 'HIGH',
        dimension: 'Time & Staffing',
        impactPoints: 10.00
      });
    }
    if (!caseRecord.hasCompleteStaffRoster) {
      missing.push({
        code: 'INCOMPLETE_STAFF_ROSTER',
        label: 'Surgical Circulator / CRNA Wage Tier Unassigned',
        severity: 'MEDIUM',
        dimension: 'Time & Staffing',
        impactPoints: 6.00
      });
    }

    // 4. Pharmacy & Sterile gaps
    if (!caseRecord.hasSterilizerCycleId) {
      missing.push({
        code: 'MISSING_STERILIZER_BATCH',
        label: 'Instrument Tray Sterilizer Cycle ID Unlinked',
        severity: 'LOW',
        dimension: 'Pharmacy & Sterile',
        impactPoints: 5.00
      });
    }

    // 5. Coding & Modifier gaps
    if (!caseRecord.hasVerifiedModifiers) {
      missing.push({
        code: 'UNVALIDATED_MODIFIER_CODES',
        label: 'Bilateral / Multiple Procedure Modifier Unconfirmed',
        severity: 'MEDIUM',
        dimension: 'Coding & Modifiers',
        impactPoints: 5.00
      });
    }

    // 6. Cash & Ledger gaps
    if (!caseRecord.hasPostedRemittance) {
      missing.push({
        code: 'PENDING_835_REMITTANCE',
        label: 'Post-Adjudication 835 ERA Not Yet Reconciled',
        severity: 'MEDIUM',
        dimension: 'Ledger Verification',
        impactPoints: 5.00
      });
    }

    return missing;
  },

  /**
   * Deterministically calculates multi-dimensional completeness score.
   */
  evaluateCaseCompleteness(caseRecord) {
    if (!caseRecord) {
      throw new Error('Case record is required for completeness evaluation');
    }

    // Dimension 1: Reimbursement (25 pts max)
    let reimbursementScore = 25.00;
    if (!caseRecord.hasPrimaryPayerContract) reimbursementScore -= 10.00;
    if (!caseRecord.hasSecondaryOrCopayVerified) reimbursementScore -= 5.00;
    reimbursementScore = Math.max(0.00, reimbursementScore);

    // Dimension 2: Direct Cost & Implants (25 pts max)
    let directCostScore = 25.00;
    if (caseRecord.requiresImplants && !caseRecord.hasVerifiedImplantInvoice) directCostScore -= 15.00;
    if (!caseRecord.hasReconciledSupplies) directCostScore -= 5.00;
    directCostScore = Math.max(0.00, directCostScore);

    // Dimension 3: Time & Staffing (20 pts max)
    let timeStaffingScore = 20.00;
    if (!caseRecord.hasVerifiedRoomTimestamps) timeStaffingScore -= 10.00;
    if (!caseRecord.hasCompleteStaffRoster) timeStaffingScore -= 6.00;
    timeStaffingScore = Math.max(0.00, timeStaffingScore);

    // Dimension 4: Pharmacy & Sterile (10 pts max)
    let pharmacySterileScore = 10.00;
    if (!caseRecord.hasSterilizerCycleId) pharmacySterileScore -= 5.00;
    pharmacySterileScore = Math.max(0.00, pharmacySterileScore);

    // Dimension 5: Coding & Modifiers (10 pts max)
    let codingModifierScore = 10.00;
    if (!caseRecord.hasVerifiedModifiers) codingModifierScore -= 5.00;
    codingModifierScore = Math.max(0.00, codingModifierScore);

    // Dimension 6: Cash & Ledger (10 pts max)
    let ledgerVerificationScore = 10.00;
    if (!caseRecord.hasPostedRemittance) ledgerVerificationScore -= 5.00;
    ledgerVerificationScore = Math.max(0.00, ledgerVerificationScore);

    const overallScore = roundToTwo(
      reimbursementScore +
      directCostScore +
      timeStaffingScore +
      pharmacySterileScore +
      codingModifierScore +
      ledgerVerificationScore
    );

    const trustTier = this.classifyTrustTier(overallScore);
    const tierConfig = TRUST_TIER_CONFIG[trustTier];
    const isAuditReady = trustTier === COMPLETENESS_TRUST_TIERS.VERIFIED_AUDIT_READY;
    const missingElements = this.identifyMissingElements(caseRecord);

    return {
      surgeryId: caseRecord.id || caseRecord.surgeryId,
      facilityId: caseRecord.facilityId || 'fac-001',
      patient: caseRecord.patient || 'Patient',
      mrn: caseRecord.mrn || 'MRN-00000',
      procedure: caseRecord.procedure || 'Procedure',
      cptCodes: caseRecord.cptCodes || caseRecord.cpt_codes || '47562',
      surgeonName: caseRecord.surgeonName || 'Dr. Surgeon',
      specialty: caseRecord.specialty || 'General Surgery',
      payerName: caseRecord.payerName || caseRecord.payer || 'Insurance',
      expectedContributionMargin: roundToTwo(caseRecord.expectedContributionMargin || 0.00),
      overallScore,
      trustTier,
      tierConfig,
      isAuditReady,
      scores: {
        reimbursement: roundToTwo(reimbursementScore),
        directCost: roundToTwo(directCostScore),
        timeStaffing: roundToTwo(timeStaffingScore),
        pharmacySterile: roundToTwo(pharmacySterileScore),
        codingModifier: roundToTwo(codingModifierScore),
        ledgerVerification: roundToTwo(ledgerVerificationScore)
      },
      missingElements,
      missingCount: missingElements.length
    };
  },

  /**
   * Aggregates facility-level completeness KPIs and risk exposure.
   */
  calculateFacilityCompletenessKpis(cases = []) {
    let totalScoreSum = 0;
    let auditReadyCount = 0;
    let provisionalCount = 0;
    let criticalCount = 0;
    let provisionalRiskExposure = 0;
    let totalMissingGaps = 0;

    cases.forEach(c => {
      const evalResult = this.evaluateCaseCompleteness(c);
      totalScoreSum += evalResult.overallScore;
      totalMissingGaps += evalResult.missingCount;

      if (evalResult.trustTier === COMPLETENESS_TRUST_TIERS.VERIFIED_AUDIT_READY) {
        auditReadyCount += 1;
      } else if (evalResult.trustTier === COMPLETENESS_TRUST_TIERS.SUBSTANTIAL_TRUST) {
        provisionalRiskExposure += Math.abs(evalResult.expectedContributionMargin);
      } else if (evalResult.trustTier === COMPLETENESS_TRUST_TIERS.PROVISIONAL_ESTIMATED) {
        provisionalCount += 1;
        provisionalRiskExposure += Math.abs(evalResult.expectedContributionMargin);
      } else if (evalResult.trustTier === COMPLETENESS_TRUST_TIERS.CRITICAL_INCOMPLETE) {
        criticalCount += 1;
        provisionalRiskExposure += Math.abs(evalResult.expectedContributionMargin);
      }
    });

    const totalCases = cases.length;
    const avgScore = totalCases > 0 ? roundToTwo(totalScoreSum / totalCases) : 0.00;
    const auditReadyPct = totalCases > 0 ? roundToTwo((auditReadyCount / totalCases) * 100.00) : 0.00;

    return {
      totalCases,
      avgScore,
      auditReadyCount,
      auditReadyPct,
      provisionalCount,
      criticalCount,
      provisionalRiskExposure: roundToTwo(provisionalRiskExposure),
      totalMissingGaps
    };
  },

  /**
   * Aggregates completeness by health plan payer.
   */
  aggregatePayerCompleteness(cases = []) {
    const payerMap = {};

    cases.forEach(c => {
      const evalResult = this.evaluateCaseCompleteness(c);
      const payer = evalResult.payerName;

      if (!payerMap[payer]) {
        payerMap[payer] = {
          payerName: payer,
          totalCases: 0,
          scoreSum: 0,
          auditReadyCases: 0,
          criticalCases: 0,
          provisionalMargin: 0
        };
      }

      const item = payerMap[payer];
      item.totalCases += 1;
      item.scoreSum += evalResult.overallScore;
      if (evalResult.isAuditReady) item.auditReadyCases += 1;
      if (evalResult.trustTier === COMPLETENESS_TRUST_TIERS.CRITICAL_INCOMPLETE) item.criticalCases += 1;
      if (!evalResult.isAuditReady) item.provisionalMargin += evalResult.expectedContributionMargin;
    });

    return Object.values(payerMap).map(p => {
      const avgScore = p.totalCases > 0 ? roundToTwo(p.scoreSum / p.totalCases) : 0.00;
      const auditReadinessPct = p.totalCases > 0 ? roundToTwo((p.auditReadyCases / p.totalCases) * 100.00) : 0.00;

      return {
        ...p,
        avgScore,
        auditReadinessPct,
        provisionalMargin: roundToTwo(p.provisionalMargin)
      };
    }).sort((a, b) => b.avgScore - a.avgScore);
  },

  /**
   * Aggregates completeness by surgeon.
   */
  aggregateSurgeonCompleteness(cases = []) {
    const surgeonMap = {};

    cases.forEach(c => {
      const evalResult = this.evaluateCaseCompleteness(c);
      const surgeon = evalResult.surgeonName;

      if (!surgeonMap[surgeon]) {
        surgeonMap[surgeon] = {
          surgeonName: surgeon,
          specialty: evalResult.specialty,
          totalCases: 0,
          scoreSum: 0,
          auditReadyCases: 0,
          totalGaps: 0
        };
      }

      const item = surgeonMap[surgeon];
      item.totalCases += 1;
      item.scoreSum += evalResult.overallScore;
      item.totalGaps += evalResult.missingCount;
      if (evalResult.isAuditReady) item.auditReadyCases += 1;
    });

    return Object.values(surgeonMap).map(s => {
      const avgScore = s.totalCases > 0 ? roundToTwo(s.scoreSum / s.totalCases) : 0.00;
      const compliancePct = s.totalCases > 0 ? roundToTwo((s.auditReadyCases / s.totalCases) * 100.00) : 0.00;

      return {
        ...s,
        avgScore,
        compliancePct
      };
    }).sort((a, b) => b.avgScore - a.avgScore);
  },

  /**
   * Generates robust baseline cases representing realistic clinical workflows.
   */
  getBaselineSampleCases() {
    return [
      {
        id: 301,
        patient: 'Eleanor Vance',
        mrn: 'MRN-90214',
        procedure: 'Phacoemulsification Cataract Extr w/ IOL',
        cpt_codes: '66984',
        surgeonName: 'Dr. James Thorne, MD',
        specialty: 'Ophthalmology',
        payerName: 'Medicare Part B',
        expectedContributionMargin: 1250.00,
        requiresImplants: true,
        hasVerifiedImplantInvoice: true,
        hasPrimaryPayerContract: true,
        hasSecondaryOrCopayVerified: true,
        hasReconciledSupplies: true,
        hasVerifiedRoomTimestamps: true,
        hasCompleteStaffRoster: true,
        hasSterilizerCycleId: true,
        hasVerifiedModifiers: true,
        hasPostedRemittance: true
      },
      {
        id: 302,
        patient: 'Marcus Brody',
        mrn: 'MRN-77312',
        procedure: 'Knee Arthroscopy & Meniscectomy',
        cpt_codes: '29881',
        surgeonName: 'Dr. Sarah Lin, MD',
        specialty: 'Orthopedics',
        payerName: 'Blue Cross PPO',
        expectedContributionMargin: 1680.00,
        requiresImplants: false,
        hasVerifiedImplantInvoice: false,
        hasPrimaryPayerContract: true,
        hasSecondaryOrCopayVerified: true,
        hasReconciledSupplies: true,
        hasVerifiedRoomTimestamps: true,
        hasCompleteStaffRoster: true,
        hasSterilizerCycleId: false, // -5 pts
        hasVerifiedModifiers: true,
        hasPostedRemittance: true
      },
      {
        id: 303,
        patient: 'Claire Bennet',
        mrn: 'MRN-62190',
        procedure: 'Total Hip Arthroplasty (Anterior)',
        cpt_codes: '27130',
        surgeonName: 'Dr. Sarah Lin, MD',
        specialty: 'Orthopedics',
        payerName: 'Aetna HMO',
        expectedContributionMargin: 3100.00,
        requiresImplants: true,
        hasVerifiedImplantInvoice: false, // -15 pts
        hasPrimaryPayerContract: true,
        hasSecondaryOrCopayVerified: false, // -5 pts
        hasReconciledSupplies: true,
        hasVerifiedRoomTimestamps: true,
        hasCompleteStaffRoster: false, // -6 pts (Score: 69.00 -> Provisional Estimated)
        hasSterilizerCycleId: true,
        hasVerifiedModifiers: true,
        hasPostedRemittance: false // -5 pts
      },
      {
        id: 304,
        patient: 'Gregory House',
        mrn: 'MRN-55419',
        procedure: 'Lumbar Epidural Steroid Injection',
        cpt_codes: '62323',
        surgeonName: 'Dr. Alistair Finch, MD',
        specialty: 'Pain Management',
        payerName: 'UnitedHealthcare',
        expectedContributionMargin: 820.00,
        requiresImplants: false,
        hasVerifiedImplantInvoice: false,
        hasPrimaryPayerContract: true,
        hasSecondaryOrCopayVerified: true,
        hasReconciledSupplies: true,
        hasVerifiedRoomTimestamps: true,
        hasCompleteStaffRoster: true,
        hasSterilizerCycleId: true,
        hasVerifiedModifiers: true,
        hasPostedRemittance: true
      },
      {
        id: 305,
        patient: 'Thomas Wayne',
        mrn: 'MRN-43098',
        procedure: 'Tympanoplasty w/ Mastoidectomy',
        cpt_codes: '69641',
        surgeonName: 'Dr. Elena Rostova, MD',
        specialty: 'ENT',
        payerName: 'Cigna Open Access',
        expectedContributionMargin: 1420.00,
        requiresImplants: true,
        hasVerifiedImplantInvoice: true,
        hasPrimaryPayerContract: true,
        hasSecondaryOrCopayVerified: true,
        hasReconciledSupplies: false, // -5 pts
        hasVerifiedRoomTimestamps: false, // -10 pts
        hasCompleteStaffRoster: true,
        hasSterilizerCycleId: true,
        hasVerifiedModifiers: false, // -5 pts
        hasPostedRemittance: false // -5 pts
      },
      {
        id: 306,
        patient: 'Robert Sterling',
        mrn: 'MRN-84511',
        procedure: 'Laparoscopic Cholecystectomy',
        cpt_codes: '47562',
        surgeonName: 'Dr. Robert Chen, MD',
        specialty: 'General Surgery',
        payerName: 'Humana Medicare',
        expectedContributionMargin: 1820.00,
        requiresImplants: false,
        hasVerifiedImplantInvoice: false,
        hasPrimaryPayerContract: true,
        hasSecondaryOrCopayVerified: true,
        hasReconciledSupplies: true,
        hasVerifiedRoomTimestamps: true,
        hasCompleteStaffRoster: false, // -6 pts (Score: 69.00 -> Provisional Estimated)
        hasSterilizerCycleId: true,
        hasVerifiedModifiers: true,
        hasPostedRemittance: false // -5 pts
      },
      {
        id: 307,
        patient: 'Victor Fries',
        mrn: 'MRN-33120',
        procedure: 'Excision Complex Soft Tissue Mass',
        cpt_codes: '27048',
        surgeonName: 'Dr. Robert Chen, MD',
        specialty: 'General Surgery',
        payerName: 'Self-Pay / Uninsured',
        expectedContributionMargin: -280.00,
        requiresImplants: false,
        hasVerifiedImplantInvoice: false,
        hasPrimaryPayerContract: false, // -10 pts
        hasSecondaryOrCopayVerified: false, // -5 pts
        hasReconciledSupplies: false, // -5 pts
        hasVerifiedRoomTimestamps: false, // -10 pts
        hasCompleteStaffRoster: false, // -6 pts
        hasSterilizerCycleId: false, // -5 pts
        hasVerifiedModifiers: false, // -5 pts
        hasPostedRemittance: false // -5 pts (Score: 49.00 -> Critical Incomplete)
      }
    ];
  }
};
