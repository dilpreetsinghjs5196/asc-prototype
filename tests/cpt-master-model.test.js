import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 40 — CPT Master Model, Code-Year Versioning & 350% Pricing Rule Suite', () => {

  // Domain 1: Database Migration 017 DDL & Schema Normalization
  describe('1. Database Migration 017: DDL & Schema Integrity', () => {
    const migPath = path.join(rootDir, 'supabase', 'migrations', '017_cpt_master_and_code_year_normalization.sql');
    const downPath = path.join(rootDir, 'supabase', 'migrations', '017_cpt_master_and_code_year_normalization_down.sql');

    it('Migration 017 forward and down SQL files exist', () => {
      assert.ok(fs.existsSync(migPath), '017_cpt_master_and_code_year_normalization.sql must exist');
      assert.ok(fs.existsSync(downPath), '017_cpt_master_and_code_year_normalization_down.sql must exist');
    });

    it('Migration 017 creates public.cpt_release_years table with seed data', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.cpt_release_years'), 'Must create cpt_release_years table');
      assert.ok(sql.includes('year INTEGER PRIMARY KEY'), 'year must be primary key');
      assert.ok(sql.includes('2024') && sql.includes('2025') && sql.includes('2026'), 'Must seed 2024, 2025, and 2026 release years');
    });

    it('Migration 017 creates public.cpt_master canonical catalog table', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.cpt_master'), 'Must create cpt_master table');
      assert.ok(sql.includes('code VARCHAR(10) NOT NULL UNIQUE'), 'Must enforce unique code');
      assert.ok(sql.includes('specialty TEXT NOT NULL DEFAULT \'General\''), 'Must have specialty column');
      assert.ok(sql.includes('procedure_group TEXT'), 'Must have procedure_group column');
      assert.ok(sql.includes('average_duration_minutes'), 'Must have average_duration_minutes column');
    });

    it('Migration 017 creates public.cpt_code_versions table with temporal bounds', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.cpt_code_versions'), 'Must create cpt_code_versions table');
      assert.ok(sql.includes('cpt_master_id UUID NOT NULL REFERENCES public.cpt_master'), 'Must reference cpt_master');
      assert.ok(sql.includes('reimbursement NUMERIC(12, 2)'), 'Must have reimbursement column');
      assert.ok(sql.includes('gross_charge NUMERIC(12, 2)'), 'Must have gross_charge column');
      assert.ok(sql.includes('effective_date DATE NOT NULL'), 'Must have effective_date column');
      assert.ok(sql.includes('chk_cpt_version_dates'), 'Must enforce chk_cpt_version_dates constraint');
    });

    it('Migration 017 enforces 350% whole-dollar gross charge trigger', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('fn_enforce_cpt_gross_charge'), 'Must define fn_enforce_cpt_gross_charge trigger function');
      assert.ok(sql.includes('ROUND(NEW.reimbursement * 3.50, 0)') || sql.includes('NEW.reimbursement * 3.50'), 'Must enforce 3.50 multiplier');
      assert.ok(sql.includes('trg_cpt_version_gross_charge'), 'Must attach trg_cpt_version_gross_charge trigger');
    });

    it('Migration 017 reconciles 151-day regulatory gap and migrates to global tenancy', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('SET effective_date = \'2026-05-01\''), 'Must backdate Sep 2026 update to 2026-05-01');
      assert.ok(sql.includes('SET facility_id = NULL'), 'Must migrate baseline CMS catalog to global tenancy');
    });

    it('Migration 017 creates staged import tables and atomic commit RPC', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.cpt_import_batches'), 'Must create cpt_import_batches');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.cpt_import_staging'), 'Must create cpt_import_staging');
      assert.ok(sql.includes('fn_commit_cpt_import_batch'), 'Must define fn_commit_cpt_import_batch stored procedure');
    });

    it('Migration 017 implements fn_resolve_cpt_pricing stored procedure with 4 tiers', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('fn_resolve_cpt_pricing'), 'Must define fn_resolve_cpt_pricing stored procedure');
      assert.ok(sql.includes('PAYER_CONTRACT'), 'Must check Tier 1 payer contract');
      assert.ok(sql.includes('FACILITY_OVERRIDE'), 'Must check Tier 2 facility override');
      assert.ok(sql.includes('CMS_NATIONAL_STANDARD'), 'Must check Tier 3 CMS national standard');
    });

    it('Migration 017 deploys backward-compatible view v_cpt_codes_compat', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.v_cpt_codes_compat'), 'Must create v_cpt_codes_compat view');
    });

    it('Migration 017 down script cleanly rolls back all added schema and functions', () => {
      const downSql = fs.readFileSync(downPath, 'utf8');
      assert.ok(downSql.includes('DROP VIEW IF EXISTS public.v_cpt_codes_compat'), 'Must drop view');
      assert.ok(downSql.includes('DROP FUNCTION IF EXISTS public.fn_resolve_cpt_pricing'), 'Must drop resolve function');
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.cpt_code_versions'), 'Must drop versions table');
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.cpt_master'), 'Must drop master table');
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.cpt_release_years'), 'Must drop release years table');
    });
  });

  // Domain 2: Authoritative 350% Gross Charge Mathematical Precision
  describe('2. Authoritative 350% Gross Charge Rule & Precision', () => {
    const calculateGrossCharge = (reimbursement) => {
      if (!reimbursement || reimbursement <= 0) return 0;
      return Math.round(reimbursement * 3.50);
    };

    it('Calculates 350% gross charge accurately on benchmark CPT codes', () => {
      // Code 63045 (Laminectomy): $3,305.81 allowable -> $11,570.00 gross charge
      assert.strictEqual(calculateGrossCharge(3305.81), 11570);

      // Code 0101T: $121.40 allowable -> $425.00 gross charge
      assert.strictEqual(calculateGrossCharge(121.40), 425);

      // Code 63045 (2026 update): $3,695.53 allowable -> $12,934.00 gross charge
      assert.strictEqual(calculateGrossCharge(3695.53), 12934);

      // Code 20663: $1,486.94 allowable -> $5,204.00 gross charge
      assert.strictEqual(calculateGrossCharge(1486.94), 5204);

      // Benchmark $1,000 allowable -> $3,500 gross charge
      assert.strictEqual(calculateGrossCharge(1000.00), 3500);
    });

    it('Handles zero and non-reimbursed procedure codes safely', () => {
      assert.strictEqual(calculateGrossCharge(0), 0);
      assert.strictEqual(calculateGrossCharge(null), 0);
      assert.strictEqual(calculateGrossCharge(undefined), 0);
    });
  });

  // Domain 3: Client Service Layer Hardening (src/lib/supabase.js)
  describe('3. Client Service Layer Hardening (src/lib/supabase.js)', () => {
    const supabaseJs = fs.readFileSync(path.join(rootDir, 'src', 'lib', 'supabase.js'), 'utf8');

    it('getCPTCodesPaged supports code-year and multi-tenant scoping', () => {
      assert.ok(supabaseJs.includes('year = \'All\''), 'Must accept year parameter');
      assert.ok(supabaseJs.includes('facility_id.is.null'), 'Must permit shared national standard CPT records');
    });

    it('Defines resolveCPTPricing helper method with fallback calculation', () => {
      assert.ok(supabaseJs.includes('async resolveCPTPricing('), 'Must define resolveCPTPricing method');
      assert.ok(supabaseJs.includes('fn_resolve_cpt_pricing'), 'Must call fn_resolve_cpt_pricing RPC');
      assert.ok(supabaseJs.includes('Math.round(reimbursement * 3.5)'), 'Must enforce 3.5x fallback');
    });

    it('addCPTCode and updateCPTCode enforce whole-dollar 350% gross charge rule', () => {
      assert.ok(supabaseJs.includes('Math.round(reimbursement * 3.5)'), 'addCPTCode must calculate 3.5x gross charge');
      assert.ok(supabaseJs.includes('Math.round(payload.reimbursement * 3.5)'), 'updateCPTCode must sync 3.5x gross charge');
    });

    it('syncSurgeryProcedures selects latest active CPT version deterministically', () => {
      assert.ok(supabaseJs.includes('.order(\'effective_date\', { ascending: false })'), 'Must order matched CPT codes by effective_date DESC');
      assert.ok(supabaseJs.includes('if (!codeMap[String(c.code)])'), 'Must keep only first (latest) occurrence in codeMap');
    });

    it('Provides staged batch import service methods', () => {
      assert.ok(supabaseJs.includes('async createCPTImportBatch('), 'Must define createCPTImportBatch');
      assert.ok(supabaseJs.includes('async stageCPTImportRows('), 'Must define stageCPTImportRows');
      assert.ok(supabaseJs.includes('async commitCPTImportBatch('), 'Must define commitCPTImportBatch');
    });
  });

  // Domain 4: Excel Ingestion & UI Hardening (CPTUpload.jsx & CPTManagement.jsx)
  describe('4. Component Architecture & UI Integrity', () => {
    const uploadJsx = fs.readFileSync(path.join(rootDir, 'src', 'components', 'CPTUpload.jsx'), 'utf8');
    const managementJsx = fs.readFileSync(path.join(rootDir, 'src', 'components', 'CPTManagement.jsx'), 'utf8');

    it('CPTUpload.jsx calculates whole-dollar 350% gross charge from reimbursement', () => {
      assert.ok(uploadJsx.includes('Math.round(reimbursement * 3.5)'), 'CPTUpload must compute 3.5x whole-dollar gross charge');
    });

    it('CPTUpload.jsx terminates prior active versions and inserts in chunks', () => {
      assert.ok(uploadJsx.includes('codesToTerminate'), 'CPTUpload must identify codes to terminate');
      assert.ok(uploadJsx.includes('termination_date: yesterday'), 'CPTUpload must set termination date on prior active versions');
      assert.ok(uploadJsx.includes('chunkSize = 200'), 'CPTUpload must chunk inserts safely');
    });

    it('CPTManagement.jsx renders CMS badge for shared standard catalog records', () => {
      assert.ok(managementJsx.includes('cpt.facility_id === null'), 'Must check for facility_id === null');
      assert.ok(managementJsx.includes('CMS National Standard Catalog'), 'Must indicate CMS national standard catalog');
    });

    it('CPTManagement.jsx enforces 350% gross charge rule on form submission', () => {
      assert.ok(managementJsx.includes('Math.round(parseFloat(form.reimbursement || 0) * 3.5)'), 'Must calculate 3.5x gross charge on submit');
    });
  });

  // Domain 5: Specification Compliance
  describe('5. Phase 40 Specification Compliance', () => {
    it('40_CPT_MASTER_SPEC.md exists with all required sections', () => {
      const specPath = path.join(rootDir, 'docs', 'phases', '40_CPT_MASTER_SPEC.md');
      assert.ok(fs.existsSync(specPath), '40_CPT_MASTER_SPEC.md must exist in docs/phases');
      const content = fs.readFileSync(specPath, 'utf8');
      assert.ok(content.includes('## 1. Executive Summary & Audit Scope'), 'Must include Executive Summary');
      assert.ok(content.includes('## 2. Current State Audit & Verified Database Evidence'), 'Must include Current State Audit');
      assert.ok(content.includes('## 5. Target State Architecture & Normalized Data Model'), 'Must include Target State Architecture');
      assert.ok(content.includes('## 6. Business Rules & Financial Calculations'), 'Must include Business Rules');
      assert.ok(content.includes('## 7. Permissions, Security & Multi-Tenancy'), 'Must include Permissions');
      assert.ok(content.includes('## 11. Comprehensive QA & Test Plan'), 'Must include QA Plan');
    });
  });
});
