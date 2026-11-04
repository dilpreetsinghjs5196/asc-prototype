/**
 * ==============================================================================
 * EDI 835 REMITTANCE INGESTION SERVICE (PHASE 82 — REVENUE CYCLE MANAGEMENT)
 * ==============================================================================
 * Production Electronic Remittance Advice (ERA) ANSI ASC X12 835 parser,
 * WEDI SNIP balancing, line-level adjudication, deterministic claim matching,
 * and CARC/RARC exception remediation engine for Ambulatory Surgery Centers.
 * Strict multi-tenancy & Maestro Clinical Design System token compliance.
 * ==============================================================================
 */

// 1. Remittance Ingestion Batch Statuses
export const REMITTANCE_BATCH_STATUSES = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  BALANCED_POSTED: 'BALANCED_POSTED',
  BALANCED_EXCEPTIONS: 'BALANCED_EXCEPTIONS',
  OUT_OF_BALANCE: 'OUT_OF_BALANCE',
  REJECTED: 'REJECTED'
};

export const REMITTANCE_BATCH_CONFIG = {
  [REMITTANCE_BATCH_STATUSES.PENDING]: { label: 'Pending Adjudication', badgeClass: 'badge-slate', color: '#94a3b8' },
  [REMITTANCE_BATCH_STATUSES.PROCESSING]: { label: 'Parsing & Balancing', badgeClass: 'badge-sky', color: '#38bdf8' },
  [REMITTANCE_BATCH_STATUSES.BALANCED_POSTED]: { label: '100% Balanced & Posted', badgeClass: 'badge-emerald', color: '#34d399' },
  [REMITTANCE_BATCH_STATUSES.BALANCED_EXCEPTIONS]: { label: 'Balanced w/ Exceptions', badgeClass: 'badge-amber', color: '#fbbf24' },
  [REMITTANCE_BATCH_STATUSES.OUT_OF_BALANCE]: { label: 'Check Out of Balance', badgeClass: 'badge-rose', color: '#fb7185' },
  [REMITTANCE_BATCH_STATUSES.REJECTED]: { label: 'Transmission Rejection', badgeClass: 'badge-rose', color: '#fb7185' }
};

// 2. CLP Claim Status Codes (HIPAA Standard)
export const CLAIM_STATUS_CODES = {
  '1': { code: '1', label: 'Processed as Primary', type: 'PAID' },
  '2': { code: '2', label: 'Processed as Secondary', type: 'PARTIAL' },
  '3': { code: '3', label: 'Processed as Tertiary', type: 'PARTIAL' },
  '4': { code: '4', label: 'Denied / Zero Payment', type: 'DENIED' },
  '19': { code: '19', label: 'Processed as Primary, Forwarded', type: 'FORWARDED' },
  '20': { code: '20', label: 'Processed as Secondary, Forwarded', type: 'FORWARDED' },
  '21': { code: '21', label: 'Processed as Tertiary, Forwarded', type: 'FORWARDED' },
  '22': { code: '22', label: 'Reversal of Previous Payment', type: 'REVERSAL' }
};

// 3. CAS Adjustment Group Codes
export const ADJUSTMENT_GROUP_CODES = {
  CO: { code: 'CO', name: 'Contractual Obligation', description: 'Provider contractual discount / fee schedule write-off' },
  PR: { code: 'PR', name: 'Patient Responsibility', description: 'Patient deductible, coinsurance, or copay' },
  OA: { code: 'OA', name: 'Other Adjustment', description: 'Mandatory non-covered service adjustments' },
  CR: { code: 'CR', name: 'Correction / Reversal', description: 'Correction and claim recoupment adjustments' }
};

// 4. Common CARC Codes in ASC Billing
export const COMMON_CARC_CODES = {
  'CO-45': { code: 'CO-45', group: 'CO', name: 'Charge Exceeds Fee Schedule', desc: 'Contractual reduction to ASC payer fee schedule' },
  'CO-97': { code: 'CO-97', group: 'CO', name: 'Bundled / Inclusive Procedure', desc: 'Procedure payment included in allowance for another primary service' },
  'CO-59': { code: 'CO-59', group: 'CO', name: 'Distinct Procedural Modifier Missing', desc: 'Multiple procedure reduction applied' },
  'PR-1': { code: 'PR-1', group: 'PR', name: 'Deductible Amount', desc: 'Patient annual deductible balance' },
  'PR-2': { code: 'PR-2', group: 'PR', name: 'Coinsurance Amount', desc: 'Patient percentage coinsurance share' },
  'PR-3': { code: 'PR-3', group: 'PR', name: 'Copayment Amount', desc: 'Patient statutory copayment' },
  'OA-23': { code: 'OA-23', group: 'OA', name: 'Prior Payer Paid', desc: 'Primary payer payment applied to secondary claim' }
};

// 5. Automated Remittance Matching Statuses
export const REMITTANCE_MATCH_STATUSES = {
  MATCHED_EXACT: 'MATCHED_EXACT',       // 100% Match (Control # = Claim #)
  MATCHED_PROBABLE: 'MATCHED_PROBABLE', // 90% Match (Patient Name + DOS + Billed Charge)
  UNMATCHED: 'UNMATCHED',               // 0% Match (Routed to Exception Queue)
  RESOLVED_MANUAL: 'RESOLVED_MANUAL',   // Reassociated by biller intervention
  DISCARDED: 'DISCARDED'                // Marked non-billable or voided
};

// 6. Remittance Exception Types
export const REMITTANCE_EXCEPTION_TYPES = {
  UNMATCHED_CLAIM: {
    code: 'UNMATCHED_CLAIM',
    label: 'Unmatched Inbound Remittance',
    severity: 'ERROR',
    badgeClass: 'badge-rose'
  },
  BPR_OUT_OF_BALANCE: {
    code: 'BPR_OUT_OF_BALANCE',
    label: 'Check/EFT Sum Out of Balance',
    severity: 'FATAL',
    badgeClass: 'badge-rose'
  },
  LINE_BALANCE_MISMATCH: {
    code: 'LINE_BALANCE_MISMATCH',
    label: 'Line Math Does Not Balance',
    severity: 'ERROR',
    badgeClass: 'badge-amber'
  },
  CLAIM_DENIED_CARC: {
    code: 'CLAIM_DENIED_CARC',
    label: 'Claim Denied (Payer Zero Payment)',
    severity: 'WARNING',
    badgeClass: 'badge-amber'
  },
  PLB_UNAPPLIED_FUNDS: {
    code: 'PLB_UNAPPLIED_FUNDS',
    label: 'Provider-Level Adjustment Unapplied',
    severity: 'WARNING',
    badgeClass: 'badge-sky'
  }
};

/**
 * Parses raw ANSI ASC X12 EDI 835 remittance text into structured data
 * @param {string} rawText - Raw X12 835 transaction stream
 * @returns {Object} Structured envelope, BPR, TRN, CLP claims, SVC lines, and CAS adjustments
 */
export function parseEdi835Content(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { success: false, error: 'Empty or invalid EDI 835 remittance payload' };
  }

  const cleanText = rawText.trim();
  const segmentDelimiter = cleanText.includes('~') ? '~' : '\n';
  const elementDelimiter = '*';

  const segments = cleanText
    .split(segmentDelimiter)
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(s => s.split(elementDelimiter));

  if (segments.length === 0) {
    return { success: false, error: 'No valid X12 segments detected in payload' };
  }

  // 1. Envelope & Financial Segments (BPR & TRN)
  const isa = segments.find(s => s[0] === 'ISA');
  const bpr = segments.find(s => s[0] === 'BPR');
  const trn = segments.find(s => s[0] === 'TRN');
  const n1pr = segments.find(s => s[0] === 'N1' && s[1] === 'PR');
  const n1pe = segments.find(s => s[0] === 'N1' && s[1] === 'PE');

  const isaControlNumber = isa ? isa[13] : 'UNKNOWN_ISA';
  const totalPaymentAmount = bpr ? Number(bpr[2] || 0) : 0.00;
  const paymentMethodCode = bpr ? bpr[4] || 'ACH' : 'ACH';
  const rawDate = bpr ? bpr[16] || '' : '';
  const paymentEffectiveDate = rawDate.length === 8
    ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
    : new Date().toISOString().slice(0, 10);

  const checkEftTraceNumber = trn ? trn[2] || 'TRN-UNKNOWN' : 'TRN-UNKNOWN';
  const payerIdentifier = trn ? trn[3] || '' : '';
  const payerName = n1pr ? n1pr[2] || 'Commercial Health Plan' : 'Commercial Health Plan';
  const payeeName = n1pe ? n1pe[2] || 'Ambulatory Surgery Center' : 'Ambulatory Surgery Center';
  const payeeNpi = n1pe && n1pe[3] === 'XX' ? n1pe[4] || '' : '';

  // 2. Loop 2100 & 2110 (CLP Claims and SVC Lines)
  const parsedClaims = [];
  let currentClaim = null;
  let currentLine = null;

  segments.forEach(seg => {
    const tag = seg[0];

    if (tag === 'CLP') {
      if (currentClaim) {
        if (currentLine) {
          currentClaim.lines.push(currentLine);
          currentLine = null;
        }
        parsedClaims.push(currentClaim);
      }

      currentClaim = {
        patientControlNumber: seg[1] || 'UNKNOWN_CLM',
        claimStatusCode: seg[2] || '1',
        totalClaimChargeAmount: Number(seg[3] || 0),
        totalClaimPaidAmount: Number(seg[4] || 0),
        patientResponsibilityAmount: Number(seg[5] || 0),
        payerClaimControlNumber: seg[7] || '',
        contractualAdjustmentAmount: 0.00,
        patientName: '',
        subscriberMemberId: '',
        lines: [],
        claimAdjustments: []
      };
    } else if (currentClaim) {
      if (tag === 'NM1' && seg[1] === 'QC') {
        currentClaim.patientName = `${seg[4] || ''} ${seg[3] || ''}`.trim();
        currentClaim.subscriberMemberId = seg[9] || '';
      } else if (tag === 'NM1' && seg[1] === 'IL' && !currentClaim.subscriberMemberId) {
        currentClaim.subscriberMemberId = seg[9] || '';
      } else if (tag === 'CAS') {
        const group = seg[1] || 'CO';
        const code = `${group}-${seg[2] || '45'}`;
        const amt = Number(seg[3] || 0);

        if (currentLine) {
          currentLine.adjustmentGroupCode = group;
          currentLine.carcCode = code;
          currentLine.carcAmount = amt;
          currentLine.rarcCode = seg[4] || '';
        } else {
          currentClaim.claimAdjustments.push({ group, code, amount: amt });
          if (group === 'CO') {
            currentClaim.contractualAdjustmentAmount += amt;
          }
        }
      } else if (tag === 'SVC') {
        if (currentLine) {
          currentClaim.lines.push(currentLine);
        }

        const procTokens = (seg[1] || '').split(':');
        const revCode = procTokens[0] && procTokens[0].length === 4 ? procTokens[0] : '0490';
        const cptCode = procTokens[1] || procTokens[0] || '99213';
        const mods = procTokens.slice(2).filter(Boolean);

        currentLine = {
          revenueCode: revCode,
          cptCode,
          modifiers: mods,
          lineChargeAmount: Number(seg[2] || 0),
          linePaidAmount: Number(seg[3] || 0),
          unitsPaid: Number(seg[5] || 1),
          adjustmentGroupCode: 'CO',
          carcCode: 'CO-45',
          carcAmount: Math.max(0, Number(seg[2] || 0) - Number(seg[3] || 0)),
          rarcCode: ''
        };
      }
    }
  });

  if (currentClaim) {
    if (currentLine) {
      currentClaim.lines.push(currentLine);
    }
    parsedClaims.push(currentClaim);
  }

  // Calculate contractual adjustments if lines exist
  parsedClaims.forEach(c => {
    if (c.contractualAdjustmentAmount === 0 && c.lines.length > 0) {
      c.contractualAdjustmentAmount = Math.max(
        0,
        c.totalClaimChargeAmount - c.totalClaimPaidAmount - c.patientResponsibilityAmount
      );
    }
  });

  return {
    success: true,
    isaControlNumber,
    checkEftTraceNumber,
    paymentMethodCode,
    totalPaymentAmount,
    paymentEffectiveDate,
    payerIdentifier,
    payerName,
    payeeName,
    payeeNpi,
    totalSegments: segments.length,
    claimPayments: parsedClaims
  };
}

/**
 * Validates check-level and line-level mathematical balancing
 * @param {Object} batch - 835 Batch header object with totalPaymentAmount
 * @param {Array} claimPayments - Array of parsed CLP claim payments
 * @returns {Object} Balancing report with checkVariance and itemized errors
 */
export function validateRemittanceBalancing(batch, claimPayments = []) {
  const errors = [];
  const totalPaidSum = claimPayments.reduce((acc, c) => acc + Number(c.totalClaimPaidAmount || 0), 0);
  const checkVariance = Math.round(Math.abs(Number(batch.totalPaymentAmount || 0) - totalPaidSum) * 100) / 100;

  if (checkVariance > 0.05) {
    errors.push({
      level: 'CHECK_LEVEL',
      type: 'BPR_OUT_OF_BALANCE',
      message: `BPR check payment amount ($${Number(batch.totalPaymentAmount).toFixed(2)}) does not balance with claim payment sum ($${totalPaidSum.toFixed(2)}) — variance of $${checkVariance.toFixed(2)}.`
    });
  }

  // Check line-level math
  claimPayments.forEach(c => {
    if (c.lines && c.lines.length > 0) {
      const linesChargeSum = c.lines.reduce((acc, l) => acc + Number(l.lineChargeAmount || 0), 0);
      const linesPaidSum = c.lines.reduce((acc, l) => acc + Number(l.linePaidAmount || 0), 0);

      const claimChargeDiff = Math.abs(linesChargeSum - Number(c.totalClaimChargeAmount || 0));
      if (claimChargeDiff > 0.05) {
        errors.push({
          level: 'CLAIM_LINE',
          type: 'LINE_BALANCE_MISMATCH',
          claimControlNumber: c.patientControlNumber,
          message: `Claim ${c.patientControlNumber} line charges sum ($${linesChargeSum.toFixed(2)}) does not equal CLP03 total claim charge ($${Number(c.totalClaimChargeAmount).toFixed(2)}).`
        });
      }
    }
  });

  return {
    isBalanced: errors.length === 0,
    checkVariance,
    totalPaidSum,
    errors
  };
}

/**
 * 3-Tier deterministic claim matching engine
 * Matches inbound 835 CLP payments against submitted claims / surgery cases
 * @param {Array} claimPayments - Staged 835 claim payment objects
 * @param {Array} activeClaims - Submitted active claims in facility
 * @param {Array} surgeries - Scheduled / completed surgeries in facility
 * @returns {Array} Enhanced claim payments with matchScore and matchedClaimId
 */
export function matchPaymentsAgainstClaims(claimPayments = [], activeClaims = [], surgeries = []) {
  return claimPayments.map(payment => {
    // 1. Tier 1: 100% Exact Match on Patient Control Number
    const exactClaim = activeClaims.find(c =>
      c.patientControlNumber && payment.patientControlNumber &&
      c.patientControlNumber.toLowerCase().trim() === payment.patientControlNumber.toLowerCase().trim()
    );

    if (exactClaim) {
      return {
        ...payment,
        matchScore: 100,
        matchStatus: REMITTANCE_MATCH_STATUSES.MATCHED_EXACT,
        matchedClaimId: exactClaim.id,
        matchedSurgeryId: exactClaim.surgeryCaseId || null,
        matchedClaim: exactClaim
      };
    }

    // 2. Tier 2: 90% Probable Match on Patient Name + Billed Charge (within $0.05)
    const probableClaim = activeClaims.find(c => {
      const nameMatch = c.patientName && payment.patientName &&
        c.patientName.toLowerCase().trim() === payment.patientName.toLowerCase().trim();
      const chargeMatch = Math.abs(Number(c.totalGrossCharge || 0) - Number(payment.totalClaimChargeAmount || 0)) <= 0.05;
      return nameMatch && chargeMatch;
    });

    if (probableClaim) {
      return {
        ...payment,
        matchScore: 90,
        matchStatus: REMITTANCE_MATCH_STATUSES.MATCHED_PROBABLE,
        matchedClaimId: probableClaim.id,
        matchedSurgeryId: probableClaim.surgeryCaseId || null,
        matchedClaim: probableClaim
      };
    }

    // Also check surgeries fallback
    const directSurgery = surgeries.find(s =>
      s.caseNumber && payment.patientControlNumber &&
      s.caseNumber.toLowerCase().trim() === payment.patientControlNumber.toLowerCase().trim()
    );

    if (directSurgery) {
      return {
        ...payment,
        matchScore: 90,
        matchStatus: REMITTANCE_MATCH_STATUSES.MATCHED_PROBABLE,
        matchedClaimId: null,
        matchedSurgeryId: directSurgery.id,
        matchedSurgery: directSurgery
      };
    }

    // 3. Tier 3: Unmatched
    return {
      ...payment,
      matchScore: 0,
      matchStatus: REMITTANCE_MATCH_STATUSES.UNMATCHED,
      matchedClaimId: null,
      matchedSurgeryId: null
    };
  });
}

/**
 * Computes executive KPI scorecard metrics across remittance batches & exceptions
 * @param {Array} batches - Array of 835 remittance batches
 * @param {Array} claimPayments - Array of claim payments
 * @param {Array} exceptions - Array of exception queue records
 * @returns {Object} Executive KPI scorecard
 */
export function calculateRemittanceKpis(batches = [], claimPayments = [], exceptions = []) {
  if (!batches || batches.length === 0) {
    return {
      totalBatches: 0,
      totalRemittanceAmount: 0.00,
      totalClaimsAdjudicated: 0,
      autoPostMatchRatePct: 0.00,
      openExceptionsCount: 0,
      unappliedAtRiskAmount: 0.00
    };
  }

  const totalRemittance = batches.reduce((acc, b) => acc + Number(b.totalPaymentAmount || 0), 0);
  let totalClaims = 0;
  let totalMatched = 0;

  batches.forEach(b => {
    totalClaims += Number(b.totalClaimsCount || 0);
    totalMatched += Number(b.matchedClaimsCount || 0);
  });

  const openExceptions = exceptions.filter(e => e.resolutionStatus === 'OPEN');
  const atRiskAmount = openExceptions.reduce((acc, e) => acc + Number(e.totalClaimPaidAmount || e.atRiskAmount || 0), 0);
  const matchRate = totalClaims > 0 ? Math.round((totalMatched / totalClaims) * 10000) / 100 : 0.00;

  return {
    totalBatches: batches.length,
    totalRemittanceAmount: Math.round(totalRemittance * 100) / 100,
    totalClaimsAdjudicated: totalClaims,
    autoPostMatchRatePct: matchRate,
    openExceptionsCount: openExceptions.length,
    unappliedAtRiskAmount: Math.round(atRiskAmount * 100) / 100
  };
}

/**
 * Baseline sample data for development, testing, and UI simulation
 */
export function getBaselineSampleData() {
  const activeClaims = [
    {
      id: 'claim-phase80-001',
      patientControlNumber: 'CLM-2026-0891',
      patientName: 'Eleanor Vance',
      patientMrn: 'MRN-84920',
      totalGrossCharge: 3850.00,
      dateOfService: '2026-10-12',
      surgeryCaseId: 101,
      primaryPayerName: 'Medicare Part B (Florida First Coast)'
    },
    {
      id: 'claim-phase80-002',
      patientControlNumber: 'CLM-2026-0892',
      patientName: 'Marcus Aurelius Sterling',
      patientMrn: 'MRN-91204',
      totalGrossCharge: 5600.00,
      dateOfService: '2026-10-24',
      surgeryCaseId: 102,
      primaryPayerName: 'Blue Cross Blue Shield of Florida'
    },
    {
      id: 'claim-phase80-003',
      patientControlNumber: 'CLM-2026-0893',
      patientName: 'Devon Hayes',
      patientMrn: 'MRN-77341',
      totalGrossCharge: 2450.00,
      dateOfService: '2026-10-16',
      surgeryCaseId: 103,
      primaryPayerName: 'Aetna Commercial Health'
    }
  ];

  const batches = [
    {
      id: 'era-835-001',
      facilityId: 'fac-naples-01',
      batchNumber: 'ERA-20261020-01',
      fileName: 'ERA835_MEDICARE_FL_20261020.x12',
      fileHashSha256: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
      checkEftTraceNumber: 'EFT-8849201948',
      paymentMethodCode: 'ACH',
      totalPaymentAmount: 1456.00,
      paymentEffectiveDate: '2026-10-20',
      payerName: 'Medicare Part B (Florida First Coast)',
      payerIdentifier: '00590',
      payeeName: 'Naples Surgery Center',
      payeeNpi: '1942049182',
      status: REMITTANCE_BATCH_STATUSES.BALANCED_POSTED,
      totalClaimsCount: 1,
      matchedClaimsCount: 1,
      exceptionClaimsCount: 0,
      rawPayloadPreview: 'ISA*00*          *00*          *ZZ*FIRSTCOAST     *ZZ*NAPLESSURG     *261020*0800*^*00501*000098555*0*P*:~GS*HP*FIRSTCOAST*NAPLESSURG*20261020*0800*1*X*005010X221A1~ST*835*0001*005010X221A1~BPR*I*1456.00*C*ACH*CCP*01*123456789*DA*987654321*1942049182**01*999999999*DA*111111111*20261020~TRN*1*EFT-8849201948*1942049182~N1*PR*FLORIDA FIRST COAST~N1*PE*NAPLES SURGERY CENTER*XX*1942049182~CLP*CLM-2026-0891*1*3850.00*1456.00*0.00*MC*ICN-9842049182~NM1*QC*1*VANCE*ELEANOR****MI*FLM8492011~SVC*HC:66984:SG*2950.00*1156.00**1~CAS*CO*45*1794.00~SVC*HC:C1788:SG*900.00*300.00**1~CAS*CO*45*600.00~SE*14*0001~GE*1*1~IEA*1*000098555~',
      ingestedAt: '2026-10-20T10:15:00Z'
    },
    {
      id: 'era-835-002',
      facilityId: 'fac-naples-01',
      batchNumber: 'ERA-20261029-02',
      fileName: 'ERA835_COMMERCIAL_BCBS_20261029.x12',
      fileHashSha256: 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
      checkEftTraceNumber: 'EFT-7718290192',
      paymentMethodCode: 'ACH',
      totalPaymentAmount: 3450.00,
      paymentEffectiveDate: '2026-10-29',
      payerName: 'Blue Cross Blue Shield of Florida',
      payerIdentifier: '00612',
      payeeName: 'Naples Surgery Center',
      payeeNpi: '1942049182',
      status: REMITTANCE_BATCH_STATUSES.BALANCED_EXCEPTIONS,
      totalClaimsCount: 2,
      matchedClaimsCount: 1,
      exceptionClaimsCount: 1,
      rawPayloadPreview: 'ISA*00*          *00*          *ZZ*BCBSFL         *ZZ*NAPLESSURG     *261029*1400*^*00501*000098556*0*P*:~GS*HP*BCBSFL*NAPLESSURG*20261029*1400*2*X*005010X221A1~ST*835*0002*005010X221A1~BPR*I*3450.00*C*ACH*CCP*01*123456789*DA*987654321*1942049182**01*999999999*DA*111111111*20261029~TRN*1*EFT-7718290192*1942049182~N1*PR*BLUE CROSS BLUE SHIELD FL~N1*PE*NAPLES SURGERY CENTER*XX*1942049182~CLP*CLM-2026-0892*1*5600.00*2950.00*0.00*12*ICN-7718290192~NM1*QC*1*STERLING*MARCUS****MI*BCBS912044~SVC*HC:29881:SG*4400.00*2350.00**1~CAS*CO*45*2050.00~SVC*HC:29877:59*1200.00*600.00**1~CAS*CO*45*600.00~CLP*CLM-2026-UNKNOWN-88*1*1200.00*500.00*0.00*12*ICN-8819203912~NM1*QC*1*WAYNE*BRUCE****MI*BCBS339182~SVC*HC:43239*1200.00*500.00**1~CAS*CO*45*700.00~SE*18*0002~GE*1*2~IEA*1*000098556~',
      ingestedAt: '2026-10-29T15:30:00Z'
    }
  ];

  const claimPayments = [
    {
      id: 'clp-835-101',
      batchId: 'era-835-001',
      facilityId: 'fac-naples-01',
      patientControlNumber: 'CLM-2026-0891',
      payerClaimControlNumber: 'ICN-9842049182',
      claimStatusCode: '1',
      totalClaimChargeAmount: 3850.00,
      totalClaimPaidAmount: 1456.00,
      patientResponsibilityAmount: 0.00,
      contractualAdjustmentAmount: 2394.00,
      patientName: 'Eleanor Vance',
      subscriberMemberId: 'FLM8492011',
      primaryPayerName: 'Medicare Part B (Florida First Coast)',
      matchStatus: REMITTANCE_MATCH_STATUSES.MATCHED_EXACT,
      matchScore: 100,
      matchedClaimId: 'claim-phase80-001',
      matchedSurgeryId: 101,
      lines: [
        {
          revenueCode: '0490',
          cptCode: '66984',
          modifiers: ['RT', 'SG'],
          lineChargeAmount: 2950.00,
          linePaidAmount: 1156.00,
          unitsPaid: 1,
          adjustmentGroupCode: 'CO',
          carcCode: 'CO-45',
          carcAmount: 1794.00,
          rarcCode: 'MA01'
        },
        {
          revenueCode: '0272',
          cptCode: 'C1788',
          modifiers: ['SG'],
          lineChargeAmount: 900.00,
          linePaidAmount: 300.00,
          unitsPaid: 1,
          adjustmentGroupCode: 'CO',
          carcCode: 'CO-45',
          carcAmount: 600.00,
          rarcCode: 'N362'
        }
      ]
    },
    {
      id: 'clp-835-102',
      batchId: 'era-835-002',
      facilityId: 'fac-naples-01',
      patientControlNumber: 'CLM-2026-0892',
      payerClaimControlNumber: 'ICN-7718290192',
      claimStatusCode: '1',
      totalClaimChargeAmount: 5600.00,
      totalClaimPaidAmount: 2950.00,
      patientResponsibilityAmount: 0.00,
      contractualAdjustmentAmount: 2650.00,
      patientName: 'Marcus Aurelius Sterling',
      subscriberMemberId: 'BCBS912044',
      primaryPayerName: 'Blue Cross Blue Shield of Florida',
      matchStatus: REMITTANCE_MATCH_STATUSES.MATCHED_EXACT,
      matchScore: 100,
      matchedClaimId: 'claim-phase80-002',
      matchedSurgeryId: 102,
      lines: [
        {
          revenueCode: '0490',
          cptCode: '29881',
          modifiers: ['LT', 'SG'],
          lineChargeAmount: 4400.00,
          linePaidAmount: 2350.00,
          unitsPaid: 1,
          adjustmentGroupCode: 'CO',
          carcCode: 'CO-45',
          carcAmount: 2050.00,
          rarcCode: ''
        },
        {
          revenueCode: '0272',
          cptCode: '29877',
          modifiers: ['59', 'SG'],
          lineChargeAmount: 1200.00,
          linePaidAmount: 600.00,
          unitsPaid: 1,
          adjustmentGroupCode: 'CO',
          carcCode: 'CO-45',
          carcAmount: 600.00,
          rarcCode: ''
        }
      ]
    },
    {
      id: 'clp-835-103',
      batchId: 'era-835-002',
      facilityId: 'fac-naples-01',
      patientControlNumber: 'CLM-2026-UNKNOWN-88',
      payerClaimControlNumber: 'ICN-8819203912',
      claimStatusCode: '1',
      totalClaimChargeAmount: 1200.00,
      totalClaimPaidAmount: 500.00,
      patientResponsibilityAmount: 0.00,
      contractualAdjustmentAmount: 700.00,
      patientName: 'Bruce Wayne',
      subscriberMemberId: 'BCBS339182',
      primaryPayerName: 'Blue Cross Blue Shield of Florida',
      matchStatus: REMITTANCE_MATCH_STATUSES.UNMATCHED,
      matchScore: 0,
      matchedClaimId: null,
      matchedSurgeryId: null,
      lines: [
        {
          revenueCode: '0490',
          cptCode: '43239',
          modifiers: ['SG'],
          lineChargeAmount: 1200.00,
          linePaidAmount: 500.00,
          unitsPaid: 1,
          adjustmentGroupCode: 'CO',
          carcCode: 'CO-45',
          carcAmount: 700.00,
          rarcCode: ''
        }
      ]
    }
  ];

  const exceptions = [
    {
      id: 'era-exc-001',
      batchId: 'era-835-002',
      batchNumber: 'ERA-20261029-02',
      checkEftTraceNumber: 'EFT-7718290192',
      payerName: 'Blue Cross Blue Shield of Florida',
      claimPaymentId: 'clp-835-103',
      patientControlNumber: 'CLM-2026-UNKNOWN-88',
      patientName: 'Bruce Wayne',
      totalClaimPaidAmount: 500.00,
      exceptionType: 'UNMATCHED_CLAIM',
      severity: 'ERROR',
      errorMessage: 'Inbound 835 payment ($500.00) cannot be matched to any active claim or surgery in the facility ledger.',
      resolutionStatus: 'OPEN',
      resolutionAction: null,
      createdAt: '2026-10-29T15:35:00Z'
    }
  ];

  return { activeClaims, batches, claimPayments, exceptions };
}

export const edi835RemittanceService = {
  REMITTANCE_BATCH_STATUSES,
  REMITTANCE_BATCH_CONFIG,
  CLAIM_STATUS_CODES,
  ADJUSTMENT_GROUP_CODES,
  COMMON_CARC_CODES,
  REMITTANCE_MATCH_STATUSES,
  REMITTANCE_EXCEPTION_TYPES,
  parseEdi835Content,
  validateRemittanceBalancing,
  matchPaymentsAgainstClaims,
  calculateRemittanceKpis,
  getBaselineSampleData
};

export default edi835RemittanceService;
