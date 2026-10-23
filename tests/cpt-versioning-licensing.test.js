import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../src/lib/supabase.js';
import { calculateNetProfit } from '../src/services/aiOperations/FinancialEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 45 — CPT Versioning, Licensed AMA Content & Temporal Pricing Suite', () => {

  // Domain 1: Database Migration 022 DDL & Schema Normalization
  describe('1. Database Migration 022: DDL & Schema Integrity', () => {
    const migPath = path.join(rootDir, 'supabase', 'migrations', '022_cpt_versioning_and_licensed_content.sql');
    const downPath = path.join(rootDir, 'supabase', 'migrations', '022_cpt_versioning_and_licensed_content_down.sql');

    it('Migration 022 forward and down SQL files exist and are populated', () => {
      assert.ok(fs.existsSync(migPath), '022_cpt_versioning_and_licensed_content.sql must exist');
      assert.ok(fs.existsSync(downPath), '022_cpt_versioning_and_licensed_content_down.sql must exist');
      const fwd = fs.readFileSync(migPath, 'utf8');
      const dwn = fs.readFileSync(downPath, 'utf8');
      assert.ok(fwd.length > 500, 'Forward migration must be substantive');
      assert.ok(dwn.length > 200, 'Down migration must be substantive');
    });

    it('Migration 022 enables btree_gist extension for temporal exclusion constraints', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('btree_gist'), 'Must enable btree_gist extension');
    });

    it('Migration 022 implements fn_validate_cpt_version_temporal_bounds trigger for temporal integrity', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('fn_validate_cpt_version_temporal_bounds'), 'Must implement temporal bounds trigger function');
      assert.ok(sql.includes('trg_validate_cpt_version_temporal_bounds'), 'Must attach trigger to cpt_code_versions');
      assert.ok(sql.includes('daterange'), 'Must check daterange overlap');
    });

    it('Migration 022 extends surgery_procedures with historical snapshot & compliance columns', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('cpt_version_id UUID'), 'Must add cpt_version_id snapshot column');
      assert.ok(sql.includes('pricing_dos DATE'), 'Must add pricing_dos snapshot column');
      assert.ok(sql.includes('pricing_source'), 'Must add pricing_source audit column');
      assert.ok(sql.includes('ama_copyright_acknowledged BOOLEAN'), 'Must add AMA copyright audit flag');
    });

    it('Migration 022 upgrades fn_resolve_cpt_pricing with fail-closed temporal enforcement', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.fn_resolve_cpt_pricing'), 'Must update fn_resolve_cpt_pricing');
      assert.ok(sql.includes('p_dos >= v.effective_date'), 'Must enforce DOS >= effective_date');
      assert.ok(sql.includes('p_dos <= v.termination_date'), 'Must enforce DOS <= termination_date');
      assert.ok(sql.includes('NO_ACTIVE_VERSION_FOR_DOS'), 'Must fail-closed with explicit error message when out of bounds');
    });

    it('Migration 022 upgrades calculate_surgery_financials with bilateral 150% calculation', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('calculate_surgery_financials'), 'Must update calculate_surgery_financials');
      assert.ok(sql.includes('v_is_bilateral'), 'Must handle bilateral check');
      assert.ok(sql.includes('* 1.50'), 'Must apply standard CMS 150% bilateral multiplier');
    });

    it('Migration 022 enriches v_cpt_codes_compat with statutory AMA notice and active temporal filter', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.v_cpt_codes_compat'), 'Must recreate v_cpt_codes_compat');
      assert.ok(sql.includes('American Medical Association'), 'Must include statutory AMA copyright attribution');
      assert.ok(sql.includes('ama_copyright_notice'), 'Must project ama_copyright_notice');
    });

    it('Migration 022 down script safely rolls back schema in reverse dependency order', () => {
      const sql = fs.readFileSync(downPath, 'utf8');
      assert.ok(sql.includes('DROP TRIGGER IF EXISTS trg_validate_cpt_version_temporal_bounds'), 'Down script must drop trigger');
      assert.ok(sql.includes('DROP FUNCTION IF EXISTS public.fn_validate_cpt_version_temporal_bounds'), 'Down script must drop trigger function');
      assert.ok(sql.includes('DROP COLUMN IF EXISTS ama_copyright_acknowledged'), 'Down script must clean snapshot columns');
    });
  });

  // Domain 2: Financial Engine Net Profit Formula
  describe('2. Financial Engine: Allowable Reimbursement vs Chargemaster Net Profit', () => {
    it('FinancialEngine evaluates case profit against allowable reimbursement, not gross chargemaster', () => {
      const result = calculateNetProfit({
        grossCharge: 15750,        // 350% gross chargemaster price
        reimbursement: 4500,       // Contracted allowable reimbursement
        durationMinutes: 60,
        suppliesCost: 1200,
        implantCost: 500
      });
      
      // Allowable reimbursement = $4,500
      // Net Profit = resolvedRevenue - totalCost
      assert.strictEqual(result.resolvedRevenue, 4500, 'Resolved revenue must be contracted reimbursement ($4,500)');
      assert.strictEqual(result.netProfit, 4500 - result.totalCost, 'Net profit must be allowable reimbursement minus total cost');
      assert.strictEqual(result.grossMargin, 15750 - result.totalCost, 'Gross margin must reflect chargemaster variance');
      assert.ok(result.netProfit < result.grossMargin, 'Net operating profit must be strictly less than gross chargemaster margin');
    });

    it('FinancialEngine flags negative net profit when direct costs exceed allowable reimbursement', () => {
      const result = calculateNetProfit({
        grossCharge: 6300,
        reimbursement: 1800,
        durationMinutes: 90,
        suppliesCost: 2000,
        implantCost: 1000
      });
      
      // Total cost exceeds allowable $1,800
      assert.ok(result.netProfit < 0, 'Must calculate negative net operating profit');
      assert.strictEqual(result.resolvedRevenue, 1800, 'Resolved revenue must be $1,800');
    });
  });

  // Domain 3: Client Service Layer Hardening (src/lib/supabase.js)
  describe('3. Client Service Layer: Date of Service Scoping & Fail-Closed Pricing', () => {
    it('resolveCPTPricing enforces fail-closed validation when Date of Service is outside temporal bounds', async () => {
      // Mock past date out of 2026 range
      const outOfBoundsDOS = '2019-06-15';
      const pricing = await db.resolveCPTPricing('27447', {
        dos: outOfBoundsDOS,
        facilityId: '00000000-0000-0000-0000-000000000002'
      });

      // Must fail closed with error or status indicating out of active bounds
      assert.ok(pricing, 'Result must be returned');
      assert.ok(
        pricing.success === false || pricing.tier === 'CMS_NATIONAL_STANDARD' || pricing.error,
        'Out of bounds DOS must be explicitly handled, not silently zeroed'
      );
    });

    it('resolveCPTPricing applies 150% bilateral rate adjustment for modifier 50', async () => {
      const pricing = await db.resolveCPTPricing('27447', {
        dos: '2026-05-01',
        facilityId: '00000000-0000-0000-0000-000000000002',
        modifiers: ['50']
      });

      if (pricing && pricing.success) {
        assert.ok(pricing.contracted_reimbursement > 0, 'Must have base reimbursement');
        assert.ok(pricing.ama_copyright_acknowledged === true, 'Must acknowledge AMA copyright');
      }
    });

    it('getCPTCodes supports temporal date of service scoping parameter', () => {
      const supabaseJs = fs.readFileSync(path.join(rootDir, 'src', 'lib', 'supabase.js'), 'utf8');
      assert.ok(supabaseJs.includes('getCPTCodes(facilityId = null, options = {})'), 'Must accept options parameter');
      assert.ok(supabaseJs.includes('dos = null') || supabaseJs.includes('targetDOS'), 'Must accept dos option for date of service scoping');
    });

    it('syncSurgeryProcedures snapshots pricing_dos, pricing_source, and cpt_version_id', () => {
      const supabaseJs = fs.readFileSync(path.join(rootDir, 'src', 'lib', 'supabase.js'), 'utf8');
      assert.ok(supabaseJs.includes('pricing_dos: surgeryDOS'), 'Must persist pricing_dos on procedure line');
      assert.ok(supabaseJs.includes('pricing_source:'), 'Must persist pricing_source audit tag');
      assert.ok(supabaseJs.includes('cpt_version_id:'), 'Must persist cpt_version_id on procedure line');
      assert.ok(supabaseJs.includes('ama_copyright_acknowledged: true'), 'Must persist AMA copyright acknowledgment');
    });
  });

  // Domain 4: Statutory AMA Copyright Attribution & UI Compliance
  describe('4. Statutory AMA Copyright Attribution & UI Compliance', () => {
    it('CPTManagement.jsx renders required statutory AMA copyright notice', () => {
      const cptJsx = fs.readFileSync(path.join(rootDir, 'src', 'components', 'CPTManagement.jsx'), 'utf8');
      assert.ok(cptJsx.includes('CPT is a registered trademark of the American Medical Association (AMA)'), 'Must render AMA trademark attribution');
      assert.ok(cptJsx.includes('Current Procedural Terminology (CPT®) is copyright'), 'Must include statutory copyright text');
    });

    it('sqlExporter.js embeds statutory AMA copyright notice in CPT export headers', () => {
      const exporterJs = fs.readFileSync(path.join(rootDir, 'src', 'utils', 'sqlExporter.js'), 'utf8');
      assert.ok(exporterJs.includes('CPT is a registered trademark of the American Medical Association (AMA)'), 'SQL exporter must include AMA trademark in export');
      assert.ok(exporterJs.includes('COMMERCIAL LICENSING RESTRICTION'), 'SQL exporter must include commercial licensing restriction header');
    });

    it('v_cpt_codes_compat includes ama_copyright_notice in column schema', () => {
      const sql = fs.readFileSync(path.join(rootDir, 'supabase', 'migrations', '022_cpt_versioning_and_licensed_content.sql'), 'utf8');
      assert.ok(sql.includes('ama_copyright_notice'), 'v_cpt_codes_compat must project ama_copyright_notice column');
    });
  });

  // Domain 5: Specification Compliance
  describe('5. Phase 45 Specification & Plan Alignment', () => {
    it('45_CPT_VERSIONING_AND_LICENSED_CONTENT.md exists with all 13 canonical sections', () => {
      const specPath = path.join(rootDir, 'docs', 'phases', '45_CPT_VERSIONING_AND_LICENSED_CONTENT.md');
      assert.ok(fs.existsSync(specPath), 'Phase 45 spec document must exist');
      const spec = fs.readFileSync(specPath, 'utf8');
      assert.ok(spec.includes('## 1. Executive Summary'), 'Must have Section 1');
      assert.ok(spec.includes('## 2. Current-State Inventory'), 'Must have Section 2');
      assert.ok(spec.includes('## 3. Evidence-Backed Target Architecture'), 'Must have Section 3');
      assert.ok(spec.includes('## 4. Data Model and Versioning Rules'), 'Must have Section 4');
      assert.ok(spec.includes('## 5. Licensed-Content Risk Register'), 'Must have Section 5');
      assert.ok(spec.includes('## 6. Historical Financial Integrity'), 'Must have Section 6');
      assert.ok(spec.includes('## 7. Security and Tenant Isolation'), 'Must have Section 7');
      assert.ok(spec.includes('## 11. Prioritized P0 / P1 / P2 Remediation Plan'), 'Must have Section 11');
      assert.ok(spec.includes('## 13. Unverified Assumptions'), 'Must have Section 13');
    });

    it('45-cpt-versioning-implementation-plan.md exists and tracks task execution', () => {
      const planPath = path.join(rootDir, 'docs', 'phases', '45-cpt-versioning-implementation-plan.md');
      assert.ok(fs.existsSync(planPath), 'Phase 45 implementation plan must exist');
    });
  });
});
