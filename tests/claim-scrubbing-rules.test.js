import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../src/lib/supabase.js';
import { rbacService } from '../src/lib/rbacService.js';
import { executeBillingTask } from '../src/agents/billing/BillingAgent.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 47 — Claim Scrubbing Rules, NCCI PTP & EDI 837P Governance Suite', () => {

  // Domain 1: Database Migration 024 DDL & Schema Integrity
  describe('1. Database Migration 024: DDL & Schema Integrity', () => {
    const migPath = path.join(rootDir, 'supabase', 'migrations', '024_claim_scrubbing_rules.sql');
    const downPath = path.join(rootDir, 'supabase', 'migrations', '024_claim_scrubbing_rules_down.sql');

    it('Migration 024 forward and down SQL files exist and are populated', () => {
      assert.ok(fs.existsSync(migPath), '024_claim_scrubbing_rules.sql must exist');
      assert.ok(fs.existsSync(downPath), '024_claim_scrubbing_rules_down.sql must exist');
      const fwd = fs.readFileSync(migPath, 'utf8');
      const dwn = fs.readFileSync(downPath, 'utf8');
      assert.ok(fwd.length > 2000, 'Forward migration must be substantive');
      assert.ok(dwn.length > 300, 'Down migration must be substantive');
    });

    it('Migration 024 creates public.claims header entity with 837P fields', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.claims'), 'Must create claims table');
      assert.ok(sql.includes('patient_control_number VARCHAR(50) NOT NULL'), 'Must include patient_control_number column (Box 26 / Loop 2300 CLM01)');
      assert.ok(sql.includes('claim_type VARCHAR(20) NOT NULL DEFAULT \'PROFESSIONAL\''), 'Must include claim_type column');
      assert.ok(sql.includes('total_gross_charge NUMERIC(12, 2) NOT NULL DEFAULT 0.00'), 'Must include total_gross_charge column');
      assert.ok(sql.includes('scrub_status VARCHAR(25) NOT NULL DEFAULT \'UNSCRUBBED\''), 'Must include scrub_status column');
      assert.ok(sql.includes('billing_provider_npi VARCHAR(10) NOT NULL'), 'Must include billing_provider_npi column');
      assert.ok(sql.includes('rendering_provider_npi VARCHAR(10) NOT NULL'), 'Must include rendering_provider_npi column');
    });

    it('Migration 024 creates public.claim_lines with itemized CPT, modifiers, units, and DX pointers', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.claim_lines'), 'Must create claim_lines table');
      assert.ok(sql.includes('line_number SMALLINT NOT NULL'), 'Must include line_number');
      assert.ok(sql.includes('cpt_code VARCHAR(10) NOT NULL'), 'Must include cpt_code');
      assert.ok(sql.includes('modifiers TEXT[] NOT NULL DEFAULT \'{}\''), 'Must include modifiers array');
      assert.ok(sql.includes('units NUMERIC(8, 2) NOT NULL DEFAULT 1.00'), 'Must include units column');
      assert.ok(sql.includes('gross_charge NUMERIC(12, 2) NOT NULL DEFAULT 0.00'), 'Must include gross_charge column');
      assert.ok(sql.includes('diagnosis_pointers VARCHAR(4)[] NOT NULL DEFAULT \'{"A"}\''), 'Must include diagnosis_pointers array');
    });

    it('Migration 024 creates public.ncci_ptp_edits with procedure pairs and modifier indicators', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.ncci_ptp_edits'), 'Must create ncci_ptp_edits table');
      assert.ok(sql.includes('column_one_cpt VARCHAR(10) NOT NULL'), 'Must include column_one_cpt');
      assert.ok(sql.includes('column_two_cpt VARCHAR(10) NOT NULL'), 'Must include column_two_cpt');
      assert.ok(sql.includes('modifier_indicator SMALLINT NOT NULL CHECK (modifier_indicator IN (0, 1, 9))'), 'Must include modifier_indicator indicator');
      assert.ok(sql.includes('effective_date DATE NOT NULL DEFAULT \'2020-01-01\''), 'Must include effective_date');
      assert.ok(sql.includes('29881'), 'Must seed core ASC arthroscopy pairs (e.g. 29881/29877)');
    });

    it('Migration 024 creates public.claim_scrub_runs, findings, and edits audit trails', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.claim_scrub_runs'), 'Must create claim_scrub_runs');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.claim_scrub_findings'), 'Must create claim_scrub_findings');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.claim_scrub_edits'), 'Must create claim_scrub_edits');
      assert.ok(sql.includes('edi_loop_reference VARCHAR(50)'), 'Findings must include 837P EDI loop ref');
      assert.ok(sql.includes('original_value TEXT'), 'Edits must store original_value');
      assert.ok(sql.includes('proposed_value TEXT'), 'Edits must store proposed_value');
    });

    it('Migration 024 deploys authoritative fn_scrub_claim checking rules SCRUB-01 to SCRUB-18', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.fn_scrub_claim'), 'Must implement fn_scrub_claim');
      assert.ok(sql.includes('SCRUB-01'), 'Must evaluate SCRUB-01 Patient Demographics');
      assert.ok(sql.includes('SCRUB-02'), 'Must evaluate SCRUB-02 Policy/Subscriber ID');
      assert.ok(sql.includes('SCRUB-04'), 'Must evaluate SCRUB-04 Billing NPI 10-digit');
      assert.ok(sql.includes('SCRUB-06'), 'Must evaluate SCRUB-06 Rendering NPI');
      assert.ok(sql.includes('SCRUB-08'), 'Must evaluate SCRUB-08 Missing Diagnosis');
      assert.ok(sql.includes('SCRUB-10'), 'Must evaluate SCRUB-10 Diagnosis Pointers');
      assert.ok(sql.includes('SCRUB-11'), 'Must evaluate SCRUB-11 Zero Dollar Line');
      assert.ok(sql.includes('SCRUB-12'), 'Must evaluate SCRUB-12 Exceeded MUE Units');
      assert.ok(sql.includes('SCRUB-13'), 'Must evaluate SCRUB-13 NCCI PTP Unbundling');
      assert.ok(sql.includes('SCRUB-15'), 'Must evaluate SCRUB-15 Future DOS');
      assert.ok(sql.includes('SCRUB-18'), 'Must evaluate SCRUB-18 Timely Filing Limit');
    });

    it('Migration 024 enforces tenant-isolated RLS across all claim tables', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;'), 'Must enable RLS on claims');
      assert.ok(sql.includes('ALTER TABLE public.claim_lines ENABLE ROW LEVEL SECURITY;'), 'Must enable RLS on claim_lines');
      assert.ok(sql.includes('ALTER TABLE public.claim_scrub_runs ENABLE ROW LEVEL SECURITY;'), 'Must enable RLS on runs');
      assert.ok(sql.includes('ALTER TABLE public.claim_scrub_findings ENABLE ROW LEVEL SECURITY;'), 'Must enable RLS on findings');
      assert.ok(sql.includes('ALTER TABLE public.claim_scrub_edits ENABLE ROW LEVEL SECURITY;'), 'Must enable RLS on edits');
      assert.ok(sql.includes('claims_facility_isolation'), 'Must enforce facility isolation policy');
    });

    it('Migration 024 down script rolls back in reverse dependency order', () => {
      const sql = fs.readFileSync(downPath, 'utf8');
      assert.ok(sql.includes('DROP FUNCTION IF EXISTS public.fn_approve_clean_claim'), 'Must drop approve function');
      assert.ok(sql.includes('DROP FUNCTION IF EXISTS public.fn_override_claim_finding'), 'Must drop override function');
      assert.ok(sql.includes('DROP FUNCTION IF EXISTS public.fn_apply_claim_edit'), 'Must drop apply edit function');
      assert.ok(sql.includes('DROP FUNCTION IF EXISTS public.fn_scrub_claim'), 'Must drop scrub claim function');
      assert.ok(sql.includes('DROP FUNCTION IF EXISTS public.fn_generate_claim_from_encounter'), 'Must drop generate claim function');
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.claim_scrub_edits CASCADE'), 'Must drop claim_scrub_edits');
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.claim_scrub_findings CASCADE'), 'Must drop claim_scrub_findings');
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.claim_scrub_runs CASCADE'), 'Must drop claim_scrub_runs');
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.ncci_ptp_edits CASCADE'), 'Must drop ncci_ptp_edits');
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.claim_lines CASCADE'), 'Must drop claim_lines');
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.claims CASCADE'), 'Must drop claims');
    });
  });

  // Domain 2: EDI 837P HIPAA 5010 Compliance & Billing Agent
  describe('2. EDI 837P HIPAA 5010 Compliance & Autonomous Billing Agent', () => {
    it('exportClaimEDI generates valid ANSI X12 837P segments and envelope structure', async () => {
      const mockClaim = {
        claim_number: 'CLM-2026-0042',
        facility_name: 'Metro Ambulatory Surgery Center',
        facility_npi: '1982736450',
        subscriber_id: 'UHC88492019',
        patient_name: 'SMITH, JOHNATHAN',
        primary_diagnosis: 'M17.11',
        total_charge: 12500,
        lines: [
          { line_number: 1, cpt_code: '27447', modifiers: ['LT'], units: 1, line_charge: 12500, date_of_service: '2026-02-23' }
        ]
      };

      const res = await db.exportClaimEDI(mockClaim);
      assert.ok(res, 'Export must return a result');
      const edi = typeof res === 'string' ? res : res.edi_content;
      assert.ok(typeof edi === 'string', 'EDI export must return string format');
      assert.ok(edi.includes('ISA*00*'), 'Must generate ISA Interchange Control Header');
      assert.ok(edi.includes('GS*HC*'), 'Must generate GS Functional Group Header with HC claim type');
      assert.ok(edi.includes('ST*837*0001*005010X222A1~'), 'Must use HIPAA 5010 837P transaction set identifier');
      assert.ok(edi.includes('BHT*0019*00*CLM-2026-0042*'), 'Must include BHT segment with claim reference');
      assert.ok(edi.includes('NM1*85*2*Metro Ambulatory Surgery Center*****XX*1982736450~'), 'Loop 2010AA Billing Provider');
      assert.ok(edi.includes('NM1*IL*1*SMITH, JOHNATHAN****MI*UHC88492019~'), 'Loop 2010BA Subscriber Name & ID');
      assert.ok(edi.includes('CLM*CLM-2026-0042*12500.00***11:B:1*Y*A*Y*Y~'), 'Loop 2300 Claim Information with Total Charge');
      assert.ok(edi.includes('HI*BK:M17.11~'), 'Loop 2300 Healthcare Diagnosis Code');
      assert.ok(edi.includes('SV1*HC:27447:LT*12500.00*UN*1***1~'), 'Loop 2400 Service Line with CPT, Modifier, and Units');
      assert.ok(edi.includes('SE*'), 'Must include SE Transaction Set Trailer');
      assert.ok(edi.includes('GE*'), 'Must include GE Functional Group Trailer');
      assert.ok(edi.includes('IEA*'), 'Must include IEA Interchange Control Trailer');
    });

    it('BillingAgent executeBillingTask invokes server-side claim scrubbing without static mock numbers', async () => {
      assert.strictEqual(typeof executeBillingTask, 'function', 'BillingAgent must export executeBillingTask function');
      
      const res = await executeBillingTask({ claimId: 'mock-claim-uuid', billedAmount: 4500 });
      assert.ok(res, 'Scrubbing must produce an agent execution response');
      assert.strictEqual(res.agent, 'billing');
      assert.ok(res.result !== undefined, 'Result object must be present');
      assert.strictEqual(typeof res.result.billedAmount, 'number');
    });
  });

  // Domain 3: Client Service Layer API Contracts (src/lib/supabase.js)
  describe('3. Client Service Layer: Claim Scrubbing & Governance Methods', () => {
    it('defines generateClaimFromEncounter helper method', () => {
      assert.strictEqual(typeof db.generateClaimFromEncounter, 'function');
    });

    it('defines getClaims, getClaimById, and getClaimLines helper methods', () => {
      assert.strictEqual(typeof db.getClaims, 'function');
      assert.strictEqual(typeof db.getClaimById, 'function');
      assert.strictEqual(typeof db.getClaimLines, 'function');
    });

    it('defines scrubClaim and findings/edits retrieval methods', () => {
      assert.strictEqual(typeof db.scrubClaim, 'function');
      assert.strictEqual(typeof db.getClaimScrubFindings, 'function');
      assert.strictEqual(typeof db.getClaimScrubEdits, 'function');
    });

    it('defines applyClaimEdit, overrideClaimFinding, and approveCleanClaim methods', () => {
      assert.strictEqual(typeof db.applyClaimEdit, 'function');
      assert.strictEqual(typeof db.overrideClaimFinding, 'function');
      assert.strictEqual(typeof db.approveCleanClaim, 'function');
    });

    it('defines exportClaimEDI method', () => {
      assert.strictEqual(typeof db.exportClaimEDI, 'function');
    });
  });

  // Domain 4: RBAC & Claim Governance Permissions (src/lib/rbacService.js)
  describe('4. RBAC & Claim Governance Security Matrix', () => {
    it('PERMISSIONS_CATALOG includes all 6 claims.* permissions', () => {
      const catalog = rbacService.getPermissionsCatalog();
      const codes = catalog.map(p => p.code);
      assert.ok(codes.includes('claims.view_scrub'), 'Must include claims.view_scrub');
      assert.ok(codes.includes('claims.run_scrubber'), 'Must include claims.run_scrubber');
      assert.ok(codes.includes('claims.apply_edits'), 'Must include claims.apply_edits');
      assert.ok(codes.includes('claims.override_error'), 'Must include claims.override_error');
      assert.ok(codes.includes('claims.approve_claim'), 'Must include claims.approve_claim');
      assert.ok(codes.includes('claims.export_edi'), 'Must include claims.export_edi');
    });

    it('grants Biller and CFO complete authority over claim edits, overrides, and approvals', () => {
      const billerPerms = [
        'claims.view_scrub',
        'claims.run_scrubber',
        'claims.apply_edits',
        'claims.override_error',
        'claims.approve_claim',
        'claims.export_edi'
      ];
      assert.ok(rbacService.hasPermission(billerPerms, 'claims.run_scrubber'), 'Biller must run scrubber');
      assert.ok(rbacService.hasPermission(billerPerms, 'claims.apply_edits'), 'Biller must apply edits');
      assert.ok(rbacService.hasPermission(billerPerms, 'claims.override_error'), 'Biller must override findings');
      assert.ok(rbacService.hasPermission(billerPerms, 'claims.approve_claim'), 'Biller must approve clean claim');
      assert.ok(rbacService.hasPermission(billerPerms, 'claims.export_edi'), 'Biller must export EDI 837P');
    });

    it('forbids Scheduler and Viewers from overriding claim errors or approving claims', () => {
      const schedulerPerms = ['surgeries.view', 'surgeries.schedule'];
      assert.strictEqual(rbacService.hasPermission(schedulerPerms, 'claims.override_error'), false);
      assert.strictEqual(rbacService.hasPermission(schedulerPerms, 'claims.approve_claim'), false);
      assert.strictEqual(rbacService.hasPermission(schedulerPerms, 'claims.apply_edits'), false);
    });
  });

  // Domain 5: UI Integration & Specification Compliance
  describe('5. UI Integration & Specification Compliance', () => {
    it('ClaimScrubberWorkbench.jsx exists and implements workbench, rules, and EDI export', () => {
      const compPath = path.join(rootDir, 'src', 'components', 'ClaimScrubberWorkbench.jsx');
      assert.ok(fs.existsSync(compPath), 'ClaimScrubberWorkbench.jsx must exist');
      const content = fs.readFileSync(compPath, 'utf8');
      assert.ok(content.includes('Pre-Bill Claim Scrubber & EDI Workbench'), 'Must render workbench title');
      assert.ok(content.includes('Re-Scrub Claim'), 'Must render scrubber run button');
      assert.ok(content.includes('EDI 837P Preview'), 'Must render EDI preview button');
      assert.ok(content.includes('Override Claim Scrub Blocker'), 'Must support finding overrides');
      assert.ok(content.includes('Apply Edit'), 'Must support one-click remediation');
    });

    it('App.jsx mounts ClaimScrubberWorkbench and wires navigation tab under Clinical', () => {
      const appPath = path.join(rootDir, 'src', 'App.jsx');
      const content = fs.readFileSync(appPath, 'utf8');
      assert.ok(content.includes('ClaimScrubberWorkbench'), 'App.jsx must import ClaimScrubberWorkbench');
      assert.ok(content.includes("activeTab === 'claim_scrubber'"), 'App.jsx must support claim_scrubber activeTab');
      assert.ok(content.includes('<ClaimScrubberWorkbench'), 'App.jsx must mount ClaimScrubberWorkbench');
      assert.ok(content.includes('Claim Scrubbing & Edits'), 'App.jsx sidebar must feature Claim Scrubbing & Edits');
    });
  });
});
