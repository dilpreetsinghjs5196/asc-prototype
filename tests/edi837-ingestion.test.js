import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

import edi837IngestionService, {
  BATCH_STATUSES,
  BATCH_STATUS_CONFIG,
  SNIP_VALIDATION_STATUSES,
  MATCH_STATUSES,
  EXCEPTION_TYPES,
  parseEdi837Content,
  validateSnipRules,
  matchClaimsAgainstSurgeries,
  calculateIngestionKpis,
  getBaselineSampleData
} from '../src/lib/edi837IngestionService.js';

describe('Phase 81 — EDI 837 Ingestion & Case Matching Engine', () => {

  describe('1. Service Architecture & Status Constants', () => {
    it('should export all authoritative batch status lifecycle keys', () => {
      assert.equal(BATCH_STATUSES.PENDING, 'PENDING');
      assert.equal(BATCH_STATUSES.PROCESSING, 'PROCESSING');
      assert.equal(BATCH_STATUSES.VALIDATED, 'VALIDATED');
      assert.equal(BATCH_STATUSES.COMPLETED_CLEAN, 'COMPLETED_CLEAN');
      assert.equal(BATCH_STATUSES.COMPLETED_WITH_EXCEPTIONS, 'COMPLETED_WITH_EXCEPTIONS');
      assert.equal(BATCH_STATUSES.REJECTED, 'REJECTED');
    });

    it('should export all WEDI SNIP validation levels 1-4', () => {
      assert.equal(SNIP_VALIDATION_STATUSES.PASSED, 'PASSED');
      assert.equal(SNIP_VALIDATION_STATUSES.FAILED_SNIP1, 'FAILED_SNIP1');
      assert.equal(SNIP_VALIDATION_STATUSES.FAILED_SNIP2, 'FAILED_SNIP2');
      assert.equal(SNIP_VALIDATION_STATUSES.FAILED_SNIP3, 'FAILED_SNIP3');
      assert.equal(SNIP_VALIDATION_STATUSES.FAILED_SNIP4, 'FAILED_SNIP4');
    });

    it('should export 3-tier deterministic case matching statuses', () => {
      assert.equal(MATCH_STATUSES.MATCHED_EXACT, 'MATCHED_EXACT');
      assert.equal(MATCH_STATUSES.MATCHED_PROBABLE, 'MATCHED_PROBABLE');
      assert.equal(MATCH_STATUSES.UNMATCHED, 'UNMATCHED');
      assert.equal(MATCH_STATUSES.RESOLVED_MANUAL, 'RESOLVED_MANUAL');
    });

    it('should provide baseline sample datasets for testing and simulation', () => {
      const data = getBaselineSampleData();
      assert.ok(Array.isArray(data.batches));
      assert.ok(Array.isArray(data.stagedClaims));
      assert.ok(Array.isArray(data.exceptions));
      assert.ok(Array.isArray(data.surgeries));
      assert.ok(data.batches.length >= 2);
      assert.ok(data.stagedClaims.length >= 4);
    });
  });

  describe('2. ANSI ASC X12 EDI 837 Parser Engine', () => {
    it('should reject empty or invalid raw payloads', () => {
      const resNull = parseEdi837Content(null);
      assert.equal(resNull.success, false);
      const resEmpty = parseEdi837Content('');
      assert.equal(resEmpty.success, false);
    });

    it('should correctly parse 837I Institutional envelope and service lines', () => {
      const rawX12 = `ISA*00*          *00*          *ZZ*AVALITY        *ZZ*FIRSTCOAST     *261015*0930*^*00501*000098421*0*P*:~GS*HC*AVALITY*FIRSTCOAST*20261015*0930*1*X*005010X223A2~ST*837*0001*005010X223A2~CLM*CLM-2026-TEST1*3850.00***24:B:1*Y*A*Y*Y~DTP*472*D8*20261012~NM1*85*2*NAPLES SURGERY CENTER*****XX*1942049182~NM1*82*1*CHEN*ROBERT****XX*1839201948~NM1*IL*1*VANCE*ELEANOR****MI*FLM8492011~NM1*PR*3*MEDICARE PART B*****PI*00590~SV2*0490*HC:66984:SG*2950.00*UN*1~SV2*0272*HC:C1788:SG*900.00*UN*1~SE*11*0001~GE*1*1~IEA*1*000098421~`;

      const parsed = parseEdi837Content(rawX12);
      assert.equal(parsed.success, true);
      assert.equal(parsed.formatType, '837I');
      assert.equal(parsed.isaControlNumber, '000098421');
      assert.equal(parsed.submitterId, 'AVALITY');
      assert.equal(parsed.receiverId, 'FIRSTCOAST');
      assert.equal(parsed.claims.length, 1);

      const claim = parsed.claims[0];
      assert.equal(claim.patientControlNumber, 'CLM-2026-TEST1');
      assert.equal(claim.totalBilledCharge, 3850.00);
      assert.equal(claim.placeOfService, '24');
      assert.equal(claim.billingProviderNpi, '1942049182');
      assert.equal(claim.patientName, 'ELEANOR VANCE');
      assert.equal(claim.dateOfService, '2026-10-12');
      assert.equal(claim.lines.length, 2);
      assert.equal(claim.lines[0].revenueCode, '0490');
      assert.equal(claim.lines[0].cptCode, '66984');
      assert.equal(claim.lines[0].grossCharge, 2950.00);
    });

    it('should correctly parse 837P Professional format and SV1 segments', () => {
      const rawProf = `ISA*00*          *00*          *ZZ*SUBM01         *ZZ*RECV01         *261020*1000*^*00501*000098422*0*P*:~GS*HC*SUBM01*RECV01*20261020*1000*1*X*005010X222A1~ST*837*0002*005010X222A1~CLM*CLM-PROF-01*1500.00***24:B:1*Y*A*Y*Y~DTP*472*D8*20261019~NM1*85*2*SURGICAL GROUP*****XX*1234567890~NM1*IL*1*DOE*JOHN****MI*SUB123~SV1*HC:99214:25*500.00*UN*1~SV1*HC:10060*1000.00*UN*1~SE*8*0002~GE*1*1~IEA*1*000098422~`;

      const parsed = parseEdi837Content(rawProf);
      assert.equal(parsed.success, true);
      assert.equal(parsed.formatType, '837P');
      assert.equal(parsed.claims.length, 1);
      assert.equal(parsed.claims[0].lines.length, 2);
      assert.equal(parsed.claims[0].lines[0].cptCode, '99214');
      assert.equal(parsed.claims[0].lines[0].grossCharge, 500.00);
      assert.equal(parsed.claims[0].lines[1].grossCharge, 1000.00);
    });
  });

  describe('3. WEDI SNIP Validation Engine (Levels 1–4)', () => {
    it('should pass clean claims conforming to all SNIP levels', () => {
      const cleanClaim = {
        patientControlNumber: 'CLM-PASS-01',
        totalBilledCharge: 1500.00,
        billingProviderNpi: '1942049182',
        placeOfService: '24',
        lines: [
          { revenueCode: '0490', grossCharge: 1000.00 },
          { revenueCode: '0272', grossCharge: 500.00 }
        ]
      };
      const res = validateSnipRules(cleanClaim);
      assert.equal(res.isValid, true);
      assert.equal(res.status, SNIP_VALIDATION_STATUSES.PASSED);
      assert.equal(res.errors.length, 0);
    });

    it('should fail SNIP 1 if CLM01 is missing or CLM02 is zero', () => {
      const badSnip1 = {
        patientControlNumber: '',
        totalBilledCharge: 0.00,
        billingProviderNpi: '1942049182',
        placeOfService: '24'
      };
      const res = validateSnipRules(badSnip1);
      assert.equal(res.isValid, false);
      assert.equal(res.status, SNIP_VALIDATION_STATUSES.FAILED_SNIP1);
    });

    it('should fail SNIP 2 if Billing NPI is invalid or POS is not 24', () => {
      const badSnip2 = {
        patientControlNumber: 'CLM-01',
        totalBilledCharge: 500.00,
        billingProviderNpi: '123', // not 10 digits
        placeOfService: '11', // office instead of ASC
        lines: [{ revenueCode: '0490', grossCharge: 500.00 }]
      };
      const res = validateSnipRules(badSnip2);
      assert.equal(res.isValid, false);
      assert.equal(res.status, SNIP_VALIDATION_STATUSES.FAILED_SNIP2);
      assert.ok(res.errors.some(e => e.level === 'SNIP2'));
    });

    it('should fail SNIP 3 if CLM02 does not mathematically balance itemized lines', () => {
      const badSnip3 = {
        patientControlNumber: 'CLM-02',
        totalBilledCharge: 2000.00, // stated 2000
        billingProviderNpi: '1942049182',
        placeOfService: '24',
        lines: [
          { revenueCode: '0490', grossCharge: 1000.00 },
          { revenueCode: '0272', grossCharge: 500.00 } // sum is 1500 != 2000
        ]
      };
      const res = validateSnipRules(badSnip3);
      assert.equal(res.isValid, false);
      assert.equal(res.status, SNIP_VALIDATION_STATUSES.FAILED_SNIP3);
      assert.ok(res.errors.some(e => e.level === 'SNIP3'));
    });

    it('should fail SNIP 4 if revenue code is not 4-digit numeric', () => {
      const badSnip4 = {
        patientControlNumber: 'CLM-03',
        totalBilledCharge: 500.00,
        billingProviderNpi: '1942049182',
        placeOfService: '24',
        lines: [
          { revenueCode: '49', grossCharge: 500.00 } // invalid 2-digit rev code
        ]
      };
      const res = validateSnipRules(badSnip4);
      assert.equal(res.isValid, false);
      assert.equal(res.status, SNIP_VALIDATION_STATUSES.FAILED_SNIP4);
    });
  });

  describe('4. Deterministic Surgery Case Matching Engine', () => {
    const surgeries = [
      { id: 101, caseNumber: 'CASE-EXACT-01', patientName: 'Jane Doe', date: '2026-10-15' },
      { id: 102, caseNumber: 'CASE-PROB-02', patientName: 'John Smith', date: '2026-10-20' }
    ];

    it('should achieve 100% Exact match when Patient Control # equals Case Number', () => {
      const claims = [{ patientControlNumber: 'CASE-EXACT-01', patientName: 'Jane Doe' }];
      const matched = matchClaimsAgainstSurgeries(claims, surgeries);
      assert.equal(matched[0].matchScore, 100);
      assert.equal(matched[0].matchStatus, MATCH_STATUSES.MATCHED_EXACT);
      assert.equal(matched[0].matchedSurgeryId, 101);
    });

    it('should achieve 90% Probable match when Patient Name and Date of Service match', () => {
      const claims = [{ patientControlNumber: 'DIFF-CONTROL-99', patientName: 'John Smith', dateOfService: '2026-10-20' }];
      const matched = matchClaimsAgainstSurgeries(claims, surgeries);
      assert.equal(matched[0].matchScore, 90);
      assert.equal(matched[0].matchStatus, MATCH_STATUSES.MATCHED_PROBABLE);
      assert.equal(matched[0].matchedSurgeryId, 102);
    });

    it('should classify as Unmatched (0%) when no matching criteria are met', () => {
      const claims = [{ patientControlNumber: 'UNKNOWN', patientName: 'Nobody', dateOfService: '2026-01-01' }];
      const matched = matchClaimsAgainstSurgeries(claims, surgeries);
      assert.equal(matched[0].matchScore, 0);
      assert.equal(matched[0].matchStatus, MATCH_STATUSES.UNMATCHED);
      assert.equal(matched[0].matchedSurgeryId, null);
    });
  });

  describe('5. KPI Aggregation & Executive Metrics', () => {
    it('should calculate accurate scorecard metrics across batches and exceptions', () => {
      const sample = getBaselineSampleData();
      const kpis = calculateIngestionKpis(sample.batches, sample.exceptions);
      assert.equal(kpis.totalBatches, 2);
      assert.equal(kpis.totalClaimsIngested, 7);
      assert.equal(kpis.totalBilledCharges, 30350.00);
      assert.equal(kpis.autoMatchRatePct, 71.43); // 5/7 = 71.43%
      assert.equal(kpis.openExceptionsCount, 2);
      assert.equal(kpis.atRiskExceptionAmount, 11000.00);
    });
  });

  describe('6. Supabase Database Migration Integrity', () => {
    const forwardPath = path.join(rootDir, 'supabase', 'migrations', '055_edi_837_ingestion.sql');
    const downPath = path.join(rootDir, 'supabase', 'migrations', '055_edi_837_ingestion_down.sql');

    it('should have migration 055_edi_837_ingestion.sql with tenant-isolated tables and RLS', () => {
      assert.ok(fs.existsSync(forwardPath), 'Migration 055 forward SQL file must exist');
      const sql = fs.readFileSync(forwardPath, 'utf8');
      assert.ok(sql.includes('edi_837_ingestion_batches'));
      assert.ok(sql.includes('edi_837_staged_claims'));
      assert.ok(sql.includes('edi_837_ingestion_exceptions'));
      assert.ok(sql.includes('vw_edi_837_batch_summary'));
      assert.ok(sql.includes('vw_edi_837_exceptions_queue'));
      assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'));
    });

    it('should have migration 055_edi_837_ingestion_down.sql for rollback', () => {
      assert.ok(fs.existsSync(downPath), 'Migration 055 down SQL file must exist');
      const downSql = fs.readFileSync(downPath, 'utf8');
      assert.ok(downSql.includes('edi_837_ingestion_exceptions'));
      assert.ok(downSql.includes('edi_837_staged_claims'));
      assert.ok(downSql.includes('edi_837_ingestion_batches'));
      assert.ok(downSql.includes('vw_edi_837_exceptions_queue'));
      assert.ok(downSql.includes('vw_edi_837_batch_summary'));
    });
  });

  describe('7. Maestro Clinical Design System Token Governance', () => {
    const cssPath = path.join(rootDir, 'src', 'components', 'Edi837IngestionView.css');

    it('should have Edi837IngestionView.css with ZERO disallowed palette tokens', () => {
      assert.ok(fs.existsSync(cssPath), 'Edi837IngestionView.css must exist');
      const css = fs.readFileSync(cssPath, 'utf8');
      const disallowed = ['purple', 'violet', 'fuchsia', 'magenta', 'indigo', '#8b5cf6', '#a78bfa', '#6366f1', '#4f46e5', '#d946ef'];
      disallowed.forEach(token => {
        assert.ok(!css.toLowerCase().includes(token), `Disallowed color token "${token}" found in Edi837IngestionView.css`);
      });
    });

    it('should enforce responsive table with min-width: 1100px', () => {
      const css = fs.readFileSync(cssPath, 'utf8');
      assert.ok(css.includes('.table-responsive'));
      assert.ok(css.includes('min-width: 1100px'));
    });
  });

  describe('8. App.jsx Integration & Dual Re-export Service', () => {
    it('should have dual re-export in src/services/edi837IngestionService.js', () => {
      const svcPath = path.join(rootDir, 'src', 'services', 'edi837IngestionService.js');
      assert.ok(fs.existsSync(svcPath));
      const content = fs.readFileSync(svcPath, 'utf8');
      assert.ok(content.includes("export * from '../lib/edi837IngestionService'"));
    });

    it('should wire Edi837IngestionView into App.jsx under RCM section', () => {
      const appPath = path.join(rootDir, 'src', 'App.jsx');
      const appCode = fs.readFileSync(appPath, 'utf8');
      assert.ok(appCode.includes('import Edi837IngestionView from'));
      assert.ok(appCode.includes("activeTab === 'edi_837_ingestion'"));
      assert.ok(appCode.includes('837 Ingestion & Case Matching'));
      assert.ok(appCode.includes('<Edi837IngestionView />'));
    });

    it('should have updated index.css to prevent header title and facility switcher overlap', () => {
      const indexCssPath = path.join(rootDir, 'src', 'index.css');
      const indexCss = fs.readFileSync(indexCssPath, 'utf8');
      assert.ok(indexCss.includes('.header-title-area'));
      assert.ok(indexCss.includes('min-width: 0'));
      assert.ok(indexCss.includes('overflow: hidden'));
      assert.ok(indexCss.includes('text-overflow: ellipsis'));
      assert.ok(indexCss.includes('flex-shrink: 0'));
    });
  });
});
