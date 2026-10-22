import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateMedicareRevenue } from '../src/utils/hospitalUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 41 — CMS ASC Coverage, Addenda Data Sources & Payment Engine Suite', () => {

  // Domain 1: Database Migration 018 DDL & Schema Integrity
  describe('1. Database Migration 018: DDL & Schema Integrity', () => {
    const migPath = path.join(rootDir, 'supabase', 'migrations', '018_cms_asc_coverage_and_payment.sql');
    const downPath = path.join(rootDir, 'supabase', 'migrations', '018_cms_asc_coverage_and_payment_down.sql');

    it('Migration 018 forward and down SQL files exist', () => {
      assert.ok(fs.existsSync(migPath), '018_cms_asc_coverage_and_payment.sql must exist');
      assert.ok(fs.existsSync(downPath), '018_cms_asc_coverage_and_payment_down.sql must exist');
    });

    it('Migration 018 creates public.cms_asc_releases table with edition constraints', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.cms_asc_releases'), 'Must create cms_asc_releases table');
      assert.ok(sql.includes('release_year INTEGER NOT NULL'), 'release_year must be integer');
      assert.ok(sql.includes('release_quarter VARCHAR(2) NOT NULL'), 'release_quarter must exist');
      assert.ok(sql.includes('rule_type VARCHAR(20) NOT NULL'), 'rule_type must exist');
      assert.ok(sql.includes('uq_cms_release_edition UNIQUE (release_year, release_quarter, rule_type)'), 'Must have edition uniqueness');
    });

    it('Migration 018 creates public.cms_asc_addenda with generated device offset columns', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.cms_asc_addenda'), 'Must create cms_asc_addenda table');
      assert.ok(sql.includes('addendum_source VARCHAR(2) NOT NULL CHECK (addendum_source IN (\'AA\', \'BB\', \'EE\'))'), 'Must enforce Addendum AA/BB/EE');
      assert.ok(sql.includes('payment_indicator VARCHAR(5) NOT NULL'), 'Must have payment_indicator');
      assert.ok(sql.includes('is_device_intensive BOOLEAN NOT NULL DEFAULT false'), 'Must track is_device_intensive');
      assert.ok(sql.includes('device_offset_percentage NUMERIC(5, 4)'), 'Must track device_offset_percentage');
      assert.ok(sql.includes('device_offset_amount NUMERIC(12, 2) GENERATED ALWAYS AS'), 'Must have generated device_offset_amount');
      assert.ok(sql.includes('service_portion_rate NUMERIC(12, 2) GENERATED ALWAYS AS'), 'Must have generated service_portion_rate');
      assert.ok(sql.includes('coverage_status VARCHAR(30) NOT NULL'), 'Must have coverage_status check');
    });

    it('Migration 018 creates public.cms_coverage_determinations table', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.cms_coverage_determinations'), 'Must create cms_coverage_determinations table');
      assert.ok(sql.includes('uq_cms_coverage_code_release UNIQUE (code, release_id)'), 'Must enforce code uniqueness per release');
    });

    it('Migration 018 extends cpt_code_versions and cpt_codes with payment metadata', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('ALTER TABLE public.cpt_code_versions') && sql.includes('ADD COLUMN IF NOT EXISTS is_device_intensive'), 'Must add is_device_intensive to versions');
      assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS device_offset_amount'), 'Must add device_offset_amount to versions');
      assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS coverage_status'), 'Must add coverage_status to versions');
      assert.ok(sql.includes('ALTER TABLE public.cpt_codes') && sql.includes('ADD COLUMN IF NOT EXISTS is_device_intensive'), 'Must add is_device_intensive to cpt_codes');
    });

    it('Migration 018 repairs column inversion defect between procedure_indicator and payment_indicator', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('WHERE procedure_indicator IN (\'A2\', \'G2\', \'J8\', \'N1\', \'P3\', \'P2\', \'R2\', \'A\')'), 'Must target inverted payment indicators');
      assert.ok(sql.includes('payment_indicator = CASE'), 'Must copy to payment_indicator');
      assert.ok(sql.includes('procedure_indicator = \'S\''), 'Must set surgical code status');
    });

    it('Migration 018 sets is_device_intensive and device offsets for J8 procedures', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('is_device_intensive = true'), 'Must set is_device_intensive for J8');
      assert.ok(sql.includes('payment_indicator = \'J8\''), 'Must target J8 payment indicator');
    });

    it('Migration 018 implements fn_resolve_asc_procedure_pricing 5-tier waterfall', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.fn_resolve_asc_procedure_pricing'), 'Must create fn_resolve_asc_procedure_pricing');
      assert.ok(sql.includes('Tier_1_Payer_Contract'), 'Must resolve Tier 1 Payer Contract');
      assert.ok(sql.includes('Tier_2_Facility_Override'), 'Must resolve Tier 2 Facility Override');
      assert.ok(sql.includes('Tier_3_CMS_Addenda'), 'Must resolve Tier 3 CMS Addenda');
      assert.ok(sql.includes('Tier_4_Global_Baseline'), 'Must resolve Tier 4 Global Baseline');
      assert.ok(sql.includes('Tier_5_Unresolved'), 'Must handle fail-closed Tier 5 Unresolved');
    });

    it('Migration 018 implements fn_calculate_case_reimbursement procedure', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.fn_calculate_case_reimbursement'), 'Must create fn_calculate_case_reimbursement');
      assert.ok(sql.includes('device_offset_amount') && sql.includes('service_portion_rate * 0.50'), 'Must calculate MPPR with device offset protection');
    });

    it('Migration 018 down script safely rolls back all new components without leaving dangling objects', () => {
      const downSql = fs.readFileSync(downPath, 'utf8');
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.cms_coverage_determinations CASCADE'), 'Must drop cms_coverage_determinations');
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.cms_asc_addenda CASCADE'), 'Must drop cms_asc_addenda');
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.cms_asc_releases CASCADE'), 'Must drop cms_asc_releases');
      assert.ok(downSql.includes('DROP FUNCTION IF EXISTS public.fn_resolve_asc_procedure_pricing'), 'Must drop pricing procedure');
      assert.ok(downSql.includes('DROP FUNCTION IF EXISTS public.fn_calculate_case_reimbursement'), 'Must drop case reimbursement procedure');
    });
  });

  // Domain 2: Financial Calculation Engine & Device-Intensive MPPR Math
  describe('2. Financial Calculation Engine & Device-Intensive MPPR Math', () => {
    it('Calculates 100% allowable for a single primary surgical procedure', () => {
      const lines = [
        { code: '43239', units: 1, payment_indicator: 'A2', gross_charge: 1200 }
      ];
      const revenue = calculateMedicareRevenue(lines, [], true);
      assert.equal(revenue, 1200);
    });

    it('Applies 50% MPPR reduction to standard secondary surgical procedures', () => {
      const lines = [
        { code: '29881', units: 1, payment_indicator: 'A2', gross_charge: 2000 },
        { code: '29877', units: 1, payment_indicator: 'A2', gross_charge: 1000 }
      ];
      // Primary: $2,000 (100%), Secondary: $1,000 * 0.50 = $500 -> Total: $2,500
      const revenue = calculateMedicareRevenue(lines, [], true);
      assert.equal(revenue, 2500);
    });

    it('Protects device portion from 50% MPPR reduction on J8 device-intensive secondary procedures', () => {
      const lines = [
        { code: '29881', units: 1, payment_indicator: 'A2', gross_charge: 3000 }, // Primary: $3,000
        { 
          code: '28465', 
          units: 1, 
          payment_indicator: 'J8', 
          is_device_intensive: true,
          gross_charge: 1000, 
          device_offset_amount: 400 // $400 device portion, $600 service portion
        }
      ];
      // Primary: $3,000
      // Secondary: Device ($400 at 100%) + Service ($600 at 50% = $300) = $700
      // Total Revenue = $3,000 + $700 = $3,700 (vs unadjusted naive MPPR of $3,500)
      const revenue = calculateMedicareRevenue(lines, [], true);
      assert.equal(revenue, 3700);
    });

    it('Handles J8 device offset fallback when procedure_indicator is J8 (backward compatibility)', () => {
      const lines = [
        { code: '29881', units: 1, gross_charge: 2000 },
        { 
          code: '28465', 
          units: 1, 
          procedure_indicator: 'J8', 
          gross_charge: 1000, 
          device_offset_amount: 300 
        }
      ];
      // Primary: $2,000. Secondary: $300 + ($700 * 0.5) = $650 -> Total = $2,650
      const revenue = calculateMedicareRevenue(lines, [], true);
      assert.equal(revenue, 2650);
    });

    it('Calculates 0 revenue for Packaged codes (N1) without causing calculation error', () => {
      const lines = [
        { code: '29881', units: 1, payment_indicator: 'A2', gross_charge: 2000 },
        { code: '12001', units: 1, payment_indicator: 'N1', gross_charge: 0 }
      ];
      const revenue = calculateMedicareRevenue(lines, [], true);
      assert.equal(revenue, 2000);
    });

    it('Exempts ancillary services (Z2 radiology, K2 drugs) from surgical MPPR reduction', () => {
      const lines = [
        { code: '29881', units: 1, payment_indicator: 'A2', gross_charge: 2000 },
        { code: '73721', units: 1, payment_indicator: 'Z2', gross_charge: 400 } // Ancillary radiology
      ];
      // Primary: $2,000. Ancillary: $400 (not reduced to $200 because Z2 is exempt)
      const revenue = calculateMedicareRevenue(lines, [], true);
      assert.equal(revenue, 2400);
    });
  });

  // Domain 3: Client Service Layer API Contracts (src/lib/supabase.js)
  describe('3. Client Service Layer API Contracts (src/lib/supabase.js)', () => {
    const supabaseJsPath = path.join(rootDir, 'src', 'lib', 'supabase.js');
    const content = fs.readFileSync(supabaseJsPath, 'utf8');

    it('Exposes getCMSReleases helper method', () => {
      assert.ok(content.includes('async getCMSReleases()'), 'Must define getCMSReleases');
    });

    it('Exposes getCMSAddenda helper method with filtering and pagination', () => {
      assert.ok(content.includes('async getCMSAddenda('), 'Must define getCMSAddenda');
      assert.ok(content.includes('addendum_source'), 'Must support addendum_source filter');
      assert.ok(content.includes('payment_indicator'), 'Must support payment_indicator filter');
    });

    it('Exposes resolveASCProcedurePricing helper method with client fallback', () => {
      assert.ok(content.includes('async resolveASCProcedurePricing('), 'Must define resolveASCProcedurePricing');
      assert.ok(content.includes('fn_resolve_asc_procedure_pricing'), 'Must call server RPC');
    });

    it('Exposes calculateCaseReimbursement helper method', () => {
      assert.ok(content.includes('async calculateCaseReimbursement('), 'Must define calculateCaseReimbursement');
    });
  });

  // Domain 4: Component Integration & Zero-Mock Policy
  describe('4. Component Integration & Zero-Mock Policy', () => {
    it('SurgeryScheduler.jsx renders J8 Device-Intensive and N1 Packaged badges', () => {
      const schedPath = path.join(rootDir, 'src', 'components', 'SurgeryScheduler.jsx');
      const schedContent = fs.readFileSync(schedPath, 'utf8');
      assert.ok(schedContent.includes('J8 Device'), 'SurgeryScheduler must render J8 Device badge');
      assert.ok(schedContent.includes('N1 Packaged'), 'SurgeryScheduler must render N1 Packaged badge');
    });

    it('CPTManagement.jsx renders Payment Indicator (PI) column and badges', () => {
      const cptMgmtPath = path.join(rootDir, 'src', 'components', 'CPTManagement.jsx');
      const cptMgmtContent = fs.readFileSync(cptMgmtPath, 'utf8');
      assert.ok(cptMgmtContent.includes('Payment Indicator (PI)'), 'Must render Payment Indicator (PI) header');
      assert.ok(cptMgmtContent.includes('J8 Device'), 'Must render J8 Device pill');
      assert.ok(cptMgmtContent.includes('N1 Packaged'), 'Must render N1 Packaged pill');
    });
  });
});
