import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

import edi835RemittanceService, {
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
} from '../src/lib/edi835RemittanceService.js';

describe('Phase 82 — EDI 835 Remittance Ingestion & Adjudication Suite', () => {

  describe('1. Domain Enums & Status Constants', () => {
    it('should export all authoritative remittance batch status lifecycle keys', () => {
      assert.equal(REMITTANCE_BATCH_STATUSES.PENDING, 'PENDING');
      assert.equal(REMITTANCE_BATCH_STATUSES.PROCESSING, 'PROCESSING');
      assert.equal(REMITTANCE_BATCH_STATUSES.BALANCED_POSTED, 'BALANCED_POSTED');
      assert.equal(REMITTANCE_BATCH_STATUSES.BALANCED_EXCEPTIONS, 'BALANCED_EXCEPTIONS');
      assert.equal(REMITTANCE_BATCH_STATUSES.OUT_OF_BALANCE, 'OUT_OF_BALANCE');
      assert.equal(REMITTANCE_BATCH_STATUSES.REJECTED, 'REJECTED');
    });

    it('should export standard CLP claim status codes', () => {
      assert.equal(CLAIM_STATUS_CODES['1'].code, '1');
      assert.equal(CLAIM_STATUS_CODES['1'].type, 'PAID');
      assert.equal(CLAIM_STATUS_CODES['4'].type, 'DENIED');
      assert.equal(CLAIM_STATUS_CODES['22'].type, 'REVERSAL');
    });

    it('should export standard CAS adjustment group codes and common CARCs', () => {
      assert.equal(ADJUSTMENT_GROUP_CODES.CO.code, 'CO');
      assert.equal(ADJUSTMENT_GROUP_CODES.PR.code, 'PR');
      assert.ok(COMMON_CARC_CODES['CO-45']);
      assert.ok(COMMON_CARC_CODES['PR-1']);
      assert.ok(COMMON_CARC_CODES['PR-2']);
      assert.equal(COMMON_CARC_CODES['CO-45'].group, 'CO');
    });

    it('should provide baseline sample datasets for testing and simulation', () => {
      const data = getBaselineSampleData();
      assert.ok(Array.isArray(data.batches));
      assert.ok(Array.isArray(data.claimPayments));
      assert.ok(Array.isArray(data.exceptions));
      assert.ok(Array.isArray(data.activeClaims));
      assert.ok(data.batches.length >= 2);
      assert.ok(data.claimPayments.length >= 3);
    });
  });

  describe('2. ANSI ASC X12 EDI 835 Parser Engine', () => {
    it('should reject empty or invalid raw ERA text streams', () => {
      const resNull = parseEdi835Content(null);
      assert.equal(resNull.success, false);
      const resEmpty = parseEdi835Content('');
      assert.equal(resEmpty.success, false);
    });

    it('should correctly parse BPR financial segment, TRN trace, and N1 loops', () => {
      const rawX12 = `ISA*00*          *00*          *ZZ*FIRSTCOAST     *ZZ*NAPLESSURG     *261020*0800*^*00501*000098555*0*P*:~GS*HP*FIRSTCOAST*NAPLESSURG*20261020*0800*1*X*005010X221A1~ST*835*0001*005010X221A1~BPR*I*1456.00*C*ACH*CCP*01*123456789*DA*987654321*1942049182**01*999999999*DA*111111111*20261020~TRN*1*EFT-8849201948*1942049182~N1*PR*FLORIDA FIRST COAST~N1*PE*NAPLES SURGERY CENTER*XX*1942049182~CLP*CLM-2026-0891*1*3850.00*1456.00*0.00*MC*ICN-9842049182~NM1*QC*1*VANCE*ELEANOR****MI*FLM8492011~SVC*HC:66984:SG*2950.00*1156.00**1~CAS*CO*45*1794.00~SVC*HC:C1788:SG*900.00*300.00**1~CAS*CO*45*600.00~SE*14*0001~GE*1*1~IEA*1*000098555~`;

      const parsed = parseEdi835Content(rawX12);
      assert.equal(parsed.success, true);
      assert.equal(parsed.totalPaymentAmount, 1456.00);
      assert.equal(parsed.paymentMethodCode, 'ACH');
      assert.equal(parsed.paymentEffectiveDate, '2026-10-20');
      assert.equal(parsed.checkEftTraceNumber, 'EFT-8849201948');
      assert.equal(parsed.payerName, 'FLORIDA FIRST COAST');
      assert.equal(parsed.payeeName, 'NAPLES SURGERY CENTER');
      assert.equal(parsed.payeeNpi, '1942049182');
      assert.equal(parsed.claimPayments.length, 1);

      const claim = parsed.claimPayments[0];
      assert.equal(claim.patientControlNumber, 'CLM-2026-0891');
      assert.equal(claim.claimStatusCode, '1');
      assert.equal(claim.totalClaimChargeAmount, 3850.00);
      assert.equal(claim.totalClaimPaidAmount, 1456.00);
      assert.equal(claim.patientResponsibilityAmount, 0.00);
      assert.equal(claim.contractualAdjustmentAmount, 2394.00);
      assert.equal(claim.patientName, 'ELEANOR VANCE');
      assert.equal(claim.subscriberMemberId, 'FLM8492011');
      assert.equal(claim.lines.length, 2);

      const line1 = claim.lines[0];
      assert.equal(line1.cptCode, '66984');
      assert.equal(line1.lineChargeAmount, 2950.00);
      assert.equal(line1.linePaidAmount, 1156.00);
      assert.equal(line1.carcCode, 'CO-45');
      assert.equal(line1.carcAmount, 1794.00);
    });

    it('should parse multi-claim ERA batches with itemized SVC line splits', () => {
      const rawMulti = `ISA*00*          *00*          *ZZ*PAYER1         *ZZ*ASC1           *261025*0800*^*00501*000098556*0*P*:~GS*HP*PAYER1*ASC1*20261025*0800*1*X*005010X221A1~ST*835*0002*005010X221A1~BPR*I*2000.00*C*CHK*CCP*01*123*DA*456*999**01*888*DA*777*20261025~TRN*1*CHK-55443322*999~CLP*CLM-MULTI-01*1*1500.00*1200.00*0.00*12~SVC*HC:29881*1500.00*1200.00**1~CAS*CO*45*300.00~CLP*CLM-MULTI-02*1*1000.00*800.00*0.00*12~SVC*HC:43239*1000.00*800.00**1~CAS*CO*45*200.00~SE*12*0002~GE*1*1~IEA*1*000098556~`;

      const parsed = parseEdi835Content(rawMulti);
      assert.equal(parsed.success, true);
      assert.equal(parsed.totalPaymentAmount, 2000.00);
      assert.equal(parsed.paymentMethodCode, 'CHK');
      assert.equal(parsed.claimPayments.length, 2);
      assert.equal(parsed.claimPayments[0].totalClaimPaidAmount, 1200.00);
      assert.equal(parsed.claimPayments[1].totalClaimPaidAmount, 800.00);
    });
  });

  describe('3. Mathematical Balancing Engine', () => {
    it('should pass balanced batch when check equals sum of claim payments', () => {
      const batch = { totalPaymentAmount: 3000.00 };
      const payments = [
        { patientControlNumber: 'C1', totalClaimPaidAmount: 1800.00, totalClaimChargeAmount: 2000.00, lines: [{ lineChargeAmount: 2000.00, linePaidAmount: 1800.00 }] },
        { patientControlNumber: 'C2', totalClaimPaidAmount: 1200.00, totalClaimChargeAmount: 1500.00, lines: [{ lineChargeAmount: 1500.00, linePaidAmount: 1200.00 }] }
      ];

      const balance = validateRemittanceBalancing(batch, payments);
      assert.equal(balance.isBalanced, true);
      assert.equal(balance.checkVariance, 0);
      assert.equal(balance.errors.length, 0);
    });

    it('should fail balancing and flag BPR_OUT_OF_BALANCE when check variance exceeds $0.05', () => {
      const badBatch = { totalPaymentAmount: 5000.00 }; // 5000 stated
      const payments = [
        { patientControlNumber: 'C1', totalClaimPaidAmount: 2000.00, totalClaimChargeAmount: 2000.00, lines: [] } // only 2000 paid
      ];

      const balance = validateRemittanceBalancing(badBatch, payments);
      assert.equal(balance.isBalanced, false);
      assert.equal(balance.checkVariance, 3000.00);
      assert.ok(balance.errors.some(e => e.type === 'BPR_OUT_OF_BALANCE'));
    });

    it('should flag LINE_BALANCE_MISMATCH when line sum does not balance CLP03 total charge', () => {
      const batch = { totalPaymentAmount: 1000.00 };
      const payments = [
        {
          patientControlNumber: 'C-MISMATCH',
          totalClaimPaidAmount: 1000.00,
          totalClaimChargeAmount: 3000.00, // Stated charge 3000
          lines: [
            { lineChargeAmount: 1500.00, linePaidAmount: 1000.00 } // Lines only sum to 1500 != 3000
          ]
        }
      ];

      const balance = validateRemittanceBalancing(batch, payments);
      assert.equal(balance.isBalanced, false);
      assert.ok(balance.errors.some(e => e.type === 'LINE_BALANCE_MISMATCH'));
    });
  });

  describe('4. Deterministic Claim Matching Engine', () => {
    const activeClaims = [
      { id: 'clm-01', patientControlNumber: 'CLM-2026-0891', patientName: 'Eleanor Vance', totalGrossCharge: 3850.00, surgeryCaseId: 101 },
      { id: 'clm-02', patientControlNumber: 'CLM-2026-0892', patientName: 'Marcus Aurelius Sterling', totalGrossCharge: 5600.00, surgeryCaseId: 102 }
    ];

    it('should achieve 100% Exact Match when Patient Control # matches active submitted claim', () => {
      const pmts = [{ patientControlNumber: 'CLM-2026-0891', patientName: 'Eleanor Vance', totalClaimChargeAmount: 3850.00 }];
      const matched = matchPaymentsAgainstClaims(pmts, activeClaims, []);
      assert.equal(matched[0].matchScore, 100);
      assert.equal(matched[0].matchStatus, REMITTANCE_MATCH_STATUSES.MATCHED_EXACT);
      assert.equal(matched[0].matchedClaimId, 'clm-01');
      assert.equal(matched[0].matchedSurgeryId, 101);
    });

    it('should achieve 90% Probable Match when Patient Name and Billed Charge match', () => {
      const pmts = [{ patientControlNumber: 'CLM-DIFF-TRACE-99', patientName: 'Marcus Aurelius Sterling', totalClaimChargeAmount: 5600.00 }];
      const matched = matchPaymentsAgainstClaims(pmts, activeClaims, []);
      assert.equal(matched[0].matchScore, 90);
      assert.equal(matched[0].matchStatus, REMITTANCE_MATCH_STATUSES.MATCHED_PROBABLE);
      assert.equal(matched[0].matchedClaimId, 'clm-02');
    });

    it('should flag Unmatched (0%) when no matching active claim exists', () => {
      const pmts = [{ patientControlNumber: 'CLM-UNKNOWN-99', patientName: 'Unknown Ghost', totalClaimChargeAmount: 999.00 }];
      const matched = matchPaymentsAgainstClaims(pmts, activeClaims, []);
      assert.equal(matched[0].matchScore, 0);
      assert.equal(matched[0].matchStatus, REMITTANCE_MATCH_STATUSES.UNMATCHED);
      assert.equal(matched[0].matchedClaimId, null);
    });
  });

  describe('5. KPI Aggregation & Executive Scorecard', () => {
    it('should accurately calculate portfolio remittance totals and auto-post rates', () => {
      const sample = getBaselineSampleData();
      const kpis = calculateRemittanceKpis(sample.batches, sample.claimPayments, sample.exceptions);
      assert.equal(kpis.totalBatches, 2);
      assert.equal(kpis.totalRemittanceAmount, 4906.00); // 1456 + 3450 = 4906
      assert.equal(kpis.totalClaimsAdjudicated, 3);
      assert.equal(kpis.autoPostMatchRatePct, 66.67); // 2/3 = 66.67%
      assert.equal(kpis.openExceptionsCount, 1);
      assert.equal(kpis.unappliedAtRiskAmount, 500.00);
    });
  });

  describe('6. Supabase Database Migration Integrity', () => {
    const forwardPath = path.join(rootDir, 'supabase', 'migrations', '056_edi_835_remittance.sql');
    const downPath = path.join(rootDir, 'supabase', 'migrations', '056_edi_835_remittance_down.sql');

    it('should have migration 056_edi_835_remittance.sql with tenant-isolated tables and RLS', () => {
      assert.ok(fs.existsSync(forwardPath), 'Migration 056 forward SQL file must exist');
      const sql = fs.readFileSync(forwardPath, 'utf8');
      assert.ok(sql.includes('edi_835_remittance_batches'));
      assert.ok(sql.includes('edi_835_claim_payments'));
      assert.ok(sql.includes('edi_835_line_adjudications'));
      assert.ok(sql.includes('edi_835_remittance_exceptions'));
      assert.ok(sql.includes('vw_edi_835_batch_summary'));
      assert.ok(sql.includes('vw_edi_835_exceptions_queue'));
      assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'));
    });

    it('should have migration 056_edi_835_remittance_down.sql for rollback', () => {
      assert.ok(fs.existsSync(downPath), 'Migration 056 down SQL file must exist');
      const downSql = fs.readFileSync(downPath, 'utf8');
      assert.ok(downSql.includes('edi_835_remittance_exceptions'));
      assert.ok(downSql.includes('edi_835_line_adjudications'));
      assert.ok(downSql.includes('edi_835_claim_payments'));
      assert.ok(downSql.includes('edi_835_remittance_batches'));
      assert.ok(downSql.includes('vw_edi_835_exceptions_queue'));
      assert.ok(downSql.includes('vw_edi_835_batch_summary'));
    });
  });

  describe('7. Maestro Clinical Design System Token Governance', () => {
    const cssPath = path.join(rootDir, 'src', 'components', 'Edi835RemittanceView.css');

    it('should have Edi835RemittanceView.css with ZERO disallowed palette tokens', () => {
      assert.ok(fs.existsSync(cssPath), 'Edi835RemittanceView.css must exist');
      const css = fs.readFileSync(cssPath, 'utf8');
      const disallowed = ['purple', 'violet', 'fuchsia', 'magenta', 'indigo', '#8b5cf6', '#a78bfa', '#6366f1', '#4f46e5', '#d946ef'];
      disallowed.forEach(token => {
        assert.ok(!css.toLowerCase().includes(token), `Disallowed color token "${token}" found in Edi835RemittanceView.css`);
      });
    });

    it('should enforce responsive table with min-width: 1100px', () => {
      const css = fs.readFileSync(cssPath, 'utf8');
      assert.ok(css.includes('.table-responsive'));
      assert.ok(css.includes('min-width: 1100px'));
    });
  });

  describe('8. App.jsx Integration & Dual Re-export Service', () => {
    it('should have dual re-export in src/services/edi835RemittanceService.js', () => {
      const svcPath = path.join(rootDir, 'src', 'services', 'edi835RemittanceService.js');
      assert.ok(fs.existsSync(svcPath));
      const content = fs.readFileSync(svcPath, 'utf8');
      assert.ok(content.includes("export * from '../lib/edi835RemittanceService'"));
    });

    it('should wire Edi835RemittanceView into App.jsx under RCM section', () => {
      const appPath = path.join(rootDir, 'src', 'App.jsx');
      const appCode = fs.readFileSync(appPath, 'utf8');
      assert.ok(appCode.includes('import Edi835RemittanceView from'));
      assert.ok(appCode.includes("activeTab === 'edi_835_remittance'"));
      assert.ok(appCode.includes('835 Remittance & Adjudication'));
      assert.ok(appCode.includes('<Edi835RemittanceView />'));
    });
  });
});

