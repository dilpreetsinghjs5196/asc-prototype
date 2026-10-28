import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  pricingService,
  PRICING_MODELS,
  SCHEDULE_STATUSES,
  INVOICE_RECONCILIATION_STATUSES,
  LINE_MATCH_STATUSES,
  COST_HIERARCHY_TIERS,
  BENCHMARK_TYPES
} from '../src/lib/pricingService.js';
import { db } from '../src/lib/supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// ==============================================================================
// SUITE 1: DATABASE MIGRATION 032 DDL & SCHEMA INTEGRITY
// ==============================================================================

test('Phase 57 — Database Migration 032: DDL & Schema Integrity', async (t) => {
  const upMigrationPath = path.join(rootDir, 'supabase', 'migrations', '032_facility_implant_pricing.sql');
  const downMigrationPath = path.join(rootDir, 'supabase', 'migrations', '032_facility_implant_pricing_down.sql');

  await t.test('Migration 032 forward and down SQL files exist and are substantive', () => {
    assert.ok(fs.existsSync(upMigrationPath), '032_facility_implant_pricing.sql must exist');
    assert.ok(fs.existsSync(downMigrationPath), '032_facility_implant_pricing_down.sql must exist');
    const upSql = fs.readFileSync(upMigrationPath, 'utf8');
    const downSql = fs.readFileSync(downMigrationPath, 'utf8');
    assert.ok(upSql.length > 5000, 'Up migration must be substantive');
    assert.ok(downSql.length > 400, 'Down migration must be substantive');
  });

  const upSql = fs.readFileSync(upMigrationPath, 'utf8');
  const downSql = fs.readFileSync(downMigrationPath, 'utf8');

  await t.test('Creates public.facility_implant_price_schedules table with commercial columns', () => {
    assert.match(upSql, /CREATE TABLE IF NOT EXISTS public\.facility_implant_price_schedules/);
    assert.match(upSql, /facility_id UUID NOT NULL REFERENCES public\.facilities/);
    assert.match(upSql, /vendor_id UUID NOT NULL REFERENCES public\.implant_vendors/);
    assert.match(upSql, /contract_id UUID REFERENCES public\.facility_vendor_contracts/);
    assert.match(upSql, /schedule_code VARCHAR\(50\)/);
    assert.match(upSql, /pricing_model VARCHAR\(30\)/);
    assert.match(upSql, /effective_from DATE NOT NULL/);
    assert.match(upSql, /effective_to DATE NOT NULL/);
    assert.match(upSql, /status VARCHAR\(30\)/);
    assert.match(upSql, /is_active BOOLEAN/);
    assert.match(upSql, /approved_by UUID REFERENCES auth\.users/);
  });

  await t.test('Creates public.facility_implant_sku_prices table with 4-decimal unit precision', () => {
    assert.match(upSql, /CREATE TABLE IF NOT EXISTS public\.facility_implant_sku_prices/);
    assert.match(upSql, /price_schedule_id UUID NOT NULL REFERENCES public\.facility_implant_price_schedules/);
    assert.match(upSql, /sku_id UUID NOT NULL REFERENCES public\.implant_product_skus/);
    assert.match(upSql, /contract_unit_price NUMERIC\(12,\s*4\)/);
    assert.match(upSql, /list_price_at_signing NUMERIC\(12,\s*4\)/);
    assert.match(upSql, /discount_off_list_percent NUMERIC\(5,\s*2\)/);
    assert.match(upSql, /package_quantity INTEGER/);
  });

  await t.test('Creates public.implant_supplier_invoices table with balance check', () => {
    assert.match(upSql, /CREATE TABLE IF NOT EXISTS public\.implant_supplier_invoices/);
    assert.match(upSql, /invoice_number VARCHAR\(100\)/);
    assert.match(upSql, /subtotal_amount NUMERIC\(12,\s*2\)/);
    assert.match(upSql, /total_amount NUMERIC\(12,\s*2\)/);
    assert.match(upSql, /reconciliation_status VARCHAR\(30\)/);
    assert.match(upSql, /CONSTRAINT chk_invoice_balance/);
  });

  await t.test('Creates public.implant_supplier_invoice_lines table with price variance analysis', () => {
    assert.match(upSql, /CREATE TABLE IF NOT EXISTS public\.implant_supplier_invoice_lines/);
    assert.match(upSql, /invoice_id UUID NOT NULL REFERENCES public\.implant_supplier_invoices/);
    assert.match(upSql, /billed_quantity INTEGER/);
    assert.match(upSql, /billed_unit_cost NUMERIC\(12,\s*4\)/);
    assert.match(upSql, /price_variance_unit NUMERIC\(12,\s*4\)/);
    assert.match(upSql, /match_status VARCHAR\(30\)/);
  });

  await t.test('Creates public.case_device_cost_allocations table with locked trigger', () => {
    assert.match(upSql, /CREATE TABLE IF NOT EXISTS public\.case_device_cost_allocations/);
    assert.match(upSql, /case_device_id UUID NOT NULL REFERENCES public\.case_devices/);
    assert.match(upSql, /cost_hierarchy_tier VARCHAR\(40\)/);
    assert.match(upSql, /allocated_unit_acquisition_cost NUMERIC\(12,\s*4\)/);
    assert.match(upSql, /is_locked_for_billing BOOLEAN/);
    assert.match(upSql, /fn_prevent_locked_case_cost_mutation/);
    assert.match(upSql, /trg_lock_case_cost/);
  });

  await t.test('Deploys surgeries.implants_cost sync trigger and deterministic hierarchy procedure', () => {
    assert.match(upSql, /fn_sync_surgery_implants_cost/);
    assert.match(upSql, /trg_sync_surgery_implants_cost/);
    assert.match(upSql, /fn_resolve_sku_price_hierarchy/);
  });

  await t.test('Enables Row-Level Security on all 7 tables and down migration cleans up in order', () => {
    assert.match(upSql, /ALTER TABLE public\.facility_implant_price_schedules ENABLE ROW LEVEL SECURITY;/);
    assert.match(upSql, /ALTER TABLE public\.facility_implant_sku_prices ENABLE ROW LEVEL SECURITY;/);
    assert.match(upSql, /ALTER TABLE public\.implant_supplier_invoices ENABLE ROW LEVEL SECURITY;/);
    assert.match(upSql, /ALTER TABLE public\.implant_supplier_invoice_lines ENABLE ROW LEVEL SECURITY;/);
    assert.match(upSql, /ALTER TABLE public\.case_device_cost_allocations ENABLE ROW LEVEL SECURITY;/);
    assert.match(upSql, /ALTER TABLE public\.implant_benchmark_prices ENABLE ROW LEVEL SECURITY;/);
    assert.match(upSql, /ALTER TABLE public\.facility_implant_price_audits ENABLE ROW LEVEL SECURITY;/);

    assert.match(downSql, /DROP TABLE IF EXISTS public\.facility_implant_price_audits CASCADE;/);
    assert.match(downSql, /DROP TABLE IF EXISTS public\.facility_implant_price_schedules CASCADE;/);
  });
});

// ==============================================================================
// SUITE 2: CLIENT SERVICE LAYER (pricingService.js)
// ==============================================================================

test('Phase 57 — Client Service Layer: pricingService.js', async (t) => {
  await t.test('Exports domain enums and constants', () => {
    assert.ok(Array.isArray(PRICING_MODELS));
    assert.ok(PRICING_MODELS.includes('FIXED_FEE_SCHEDULE'));
    assert.ok(PRICING_MODELS.includes('LIST_LESS_DISCOUNT'));
    assert.ok(Array.isArray(SCHEDULE_STATUSES));
    assert.ok(SCHEDULE_STATUSES.includes('active'));
    assert.ok(Array.isArray(INVOICE_RECONCILIATION_STATUSES));
    assert.ok(INVOICE_RECONCILIATION_STATUSES.includes('fully_matched'));
    assert.ok(INVOICE_RECONCILIATION_STATUSES.includes('variance_flagged'));
    assert.ok(Array.isArray(LINE_MATCH_STATUSES));
    assert.ok(LINE_MATCH_STATUSES.includes('MATCHED_CLEAN'));
    assert.ok(LINE_MATCH_STATUSES.includes('PRICE_VARIANCE_BREACH'));
    assert.ok(Array.isArray(COST_HIERARCHY_TIERS));
    assert.ok(COST_HIERARCHY_TIERS.includes('TIER_1_RECONCILED_INVOICE'));
    assert.ok(COST_HIERARCHY_TIERS.includes('TIER_2_ACCRUED_CONTRACT'));
    assert.ok(Array.isArray(BENCHMARK_TYPES));
  });

  await t.test('getPriceSchedules retrieves items, applies filters, and calculates summary metrics', async () => {
    const res = await pricingService.getPriceSchedules({
      facilityId: '00000000-0000-0000-0000-000000000002'
    });
    assert.ok(Array.isArray(res.items), 'items must be an array');
    assert.ok(res.items.length >= 1, 'Should return at least 1 schedule');
    assert.ok(res.metrics.totalSchedules >= 1);
    assert.ok(res.metrics.activeSchedules >= 1);
  });

  await t.test('getScheduleSkuPrices retrieves itemized price lines for schedule', async () => {
    const prices = await pricingService.getScheduleSkuPrices('00000000-0000-0000-0057-000000000001');
    assert.ok(Array.isArray(prices));
    assert.ok(prices.length >= 2, 'Should have multiple SKU prices in Stryker schedule');
    const femoral = prices.find((p) => p.catalog_number === '5510-F-401');
    assert.ok(femoral);
    assert.equal(femoral.contract_unit_price, 1450.00);
    assert.equal(femoral.list_price_at_signing, 2850.00);
  });

  await t.test('savePriceSchedule validates required fields and dates', async () => {
    await assert.rejects(
      async () => {
        await pricingService.savePriceSchedule({ schedule_code: '' });
      },
      /schedule_code and schedule_name are required/
    );

    await assert.rejects(
      async () => {
        await pricingService.savePriceSchedule({
          schedule_code: 'SCH-TEST',
          schedule_name: 'Test Schedule',
          effective_from: '2026-12-31',
          effective_to: '2026-01-01'
        });
      },
      /effective_to cannot be earlier than effective_from/
    );

    const saved = await pricingService.savePriceSchedule({
      schedule_code: 'SCH-NEW-01',
      schedule_name: 'New Test Schedule',
      vendor_id: '00000000-0000-0000-0053-000000000001',
      effective_from: '2026-01-01',
      effective_to: '2026-12-31',
      status: 'active'
    });
    assert.ok(saved.id);
    assert.equal(saved.schedule_code, 'SCH-NEW-01');
    assert.equal(saved.is_active, true);
  });

  await t.test('resolveSkuPriceHierarchy deterministically resolves active contract price', async () => {
    const res = await pricingService.resolveSkuPriceHierarchy({
      facilityId: '00000000-0000-0000-0000-000000000002',
      skuId: '00000000-0000-0000-0054-000000000001', // Femoral component
      surgeryDate: '2026-06-15'
    });
    assert.ok(res.resolvedUnitCost > 0);
    assert.equal(res.resolvedUnitCost, 1450.00);
    assert.equal(res.isAuthorized, true);
  });

  await t.test('getSupplierInvoices retrieves invoices and computes metrics', async () => {
    const res = await pricingService.getSupplierInvoices({
      facilityId: '00000000-0000-0000-0000-000000000002'
    });
    assert.ok(Array.isArray(res.invoices));
    assert.ok(res.invoices.length >= 2);
    assert.ok(res.metrics.totalInvoicedAmount > 0);
    assert.ok(res.metrics.varianceFlaggedCount >= 1);
  });

  await t.test('createSupplierInvoice validates balance and creates record', async () => {
    await assert.rejects(
      async () => {
        await pricingService.createSupplierInvoice({ invoice_number: '' });
      },
      /invoice_number and vendor_id are mandatory/
    );

    const created = await pricingService.createSupplierInvoice({
      invoice_number: 'INV-TEST-9999',
      vendor_id: '00000000-0000-0000-0053-000000000001',
      subtotal_amount: 2500.00,
      freight_amount: 50.00,
      tax_amount: 0.00,
      discount_amount: 50.00
    });
    assert.ok(created.id);
    assert.equal(created.total_amount, 2500.00);
    assert.equal(created.reconciliation_status, 'unreconciled');
  });

  await t.test('reviewPriceVariance requires 10-character rationale and updates status', async () => {
    await assert.rejects(
      async () => {
        await pricingService.reviewPriceVariance({
          lineId: '00000000-0000-0000-0057-invline-0010',
          approved: true,
          rationale: 'Too short'
        });
      },
      /minimum 10 characters/
    );

    const updated = await pricingService.reviewPriceVariance({
      lineId: '00000000-0000-0000-0057-invline-0010',
      approved: true,
      rationale: 'Approved annual contract price escalation per CFO memo'
    });
    assert.equal(updated.match_status, 'MANUALLY_APPROVED');
  });

  await t.test('getPriceBenchmarks retrieves percentile distributions and opportunity', async () => {
    const res = await pricingService.getPriceBenchmarks({ specialty: 'Orthopedics' });
    assert.ok(Array.isArray(res.benchmarks));
    assert.ok(res.benchmarks.length >= 2);
    assert.ok(res.totalPotentialOpportunity >= 0);
  });

  await t.test('getCaseImplantFinancialSummary computes contribution margin and direct costs', async () => {
    const summary = await pricingService.getCaseImplantFinancialSummary(101);
    assert.ok(summary.totalCost > 0);
    assert.ok(summary.totalCharge > summary.totalCost);
    assert.ok(summary.contributionMargin > 0);
    assert.equal(summary.marginPercent, 25.1);
  });

  await t.test('pricingService methods are wired onto db singleton', () => {
    assert.equal(typeof db.resolveSkuPriceHierarchy, 'function');
    assert.equal(typeof db.getPriceSchedules, 'function');
    assert.equal(typeof db.getScheduleSkuPrices, 'function');
    assert.equal(typeof db.savePriceSchedule, 'function');
    assert.equal(typeof db.getSupplierInvoices, 'function');
    assert.equal(typeof db.createSupplierInvoice, 'function');
    assert.equal(typeof db.reviewPriceVariance, 'function');
    assert.equal(typeof db.getPriceBenchmarks, 'function');
    assert.equal(typeof db.getCaseImplantFinancialSummary, 'function');
  });
});

// ==============================================================================
// SUITE 3: UI COMPONENT & MAESTRO GUIDELINE COMPLIANCE
// ==============================================================================

test('Phase 57 — UI Component & Maestro Guideline Compliance', async (t) => {
  const jsxPath = path.join(rootDir, 'src', 'components', 'FacilityImplantPricing.jsx');
  const cssPath = path.join(rootDir, 'src', 'components', 'FacilityImplantPricing.css');
  const appPath = path.join(rootDir, 'src', 'App.jsx');

  await t.test('FacilityImplantPricing.jsx and CSS exist and are populated', () => {
    assert.ok(fs.existsSync(jsxPath), 'FacilityImplantPricing.jsx must exist');
    assert.ok(fs.existsSync(cssPath), 'FacilityImplantPricing.css must exist');
    const jsx = fs.readFileSync(jsxPath, 'utf8');
    const css = fs.readFileSync(cssPath, 'utf8');
    assert.ok(jsx.length > 5000, 'JSX must be substantive');
    assert.ok(css.length > 3000, 'CSS must be substantive');
  });

  await t.test('CSS and JSX strictly obey Purple Ban (zero banned purple/violet/magenta/fuchsia tokens)', () => {
    const jsx = fs.readFileSync(jsxPath, 'utf8');
    const css = fs.readFileSync(cssPath, 'utf8');
    const combined = `${jsx}\n${css}`.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

    const purpleKeywords = /\b(purple|violet|fuchsia|magenta|indigo)\b/i;
    const purpleHexes = /#(7c3aed|8b5cf6|a855f7|9333ea|c084fc|d8b4fe|e9d5ff|6366f1|4f46e5|818cf8|a5b4fc|c7d2fe)/i;

    assert.ok(!purpleKeywords.test(combined), 'Found banned purple/violet keyword in Phase 57 UI files');
    assert.ok(!purpleHexes.test(combined), 'Found banned purple/violet hex code in Phase 57 UI files');
  });

  await t.test('App.jsx integrates FacilityImplantPricing in sidebar navigation, subtitle, and tab render', () => {
    const appContent = fs.readFileSync(appPath, 'utf8');
    assert.match(appContent, /import FacilityImplantPricing from '\.\/components\/FacilityImplantPricing';/);
    assert.match(appContent, /activeTab === 'facility_implant_pricing'/);
    assert.match(appContent, /<FacilityImplantPricing/);
    assert.match(appContent, /Implant Pricing & Costs/);
  });
});
