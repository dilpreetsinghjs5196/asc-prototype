import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  VARIANCE_STATUSES,
  IMPLANT_STANDARDS,
  calculateUnitVariance,
  calculateVariancePct,
  classifyVarianceStatus,
  calculateTotalExcessSpend,
  calculatePotentialSavings,
  calculateSterileWaste,
  calculateFacilityImplantKpis,
  SEED_SURGEON_IMPLANT_VARIANCES
} from '../src/services/surgeonImplantVarianceService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

describe('Phase B2 — Surgeon Implant Variance Test Suite', () => {
  describe('1. Variance Statuses & Standards Configuration', () => {
    it('should define authoritative variance status definitions', () => {
      const statuses = ['EFFICIENT', 'MODERATE_VARIANCE', 'HIGH_VARIANCE_OUTLIER'];
      statuses.forEach(statusKey => {
        assert.ok(VARIANCE_STATUSES[statusKey], `Status ${statusKey} must exist`);
        assert.equal(VARIANCE_STATUSES[statusKey].key, statusKey);
      });
    });

    it('should define clinical implant threshold standards', () => {
      assert.equal(IMPLANT_STANDARDS.MAX_ACCEPTABLE_VARIANCE_PCT, 5.0);
      assert.equal(IMPLANT_STANDARDS.CRITICAL_OUTLIER_THRESHOLD_PCT, 20.0);
      assert.equal(IMPLANT_STANDARDS.MAX_STERILE_WASTE_PCT, 3.0);
    });
  });

  describe('2. Deterministic Mathematical Calculations', () => {
    it('should calculate unit cost variance accurately', () => {
      // Over median
      assert.equal(calculateUnitVariance(2450.0, 1720.0), 730.0);
      // Under median
      assert.equal(calculateUnitVariance(2850.0, 2980.0), -130.0);
      // Equal
      assert.equal(calculateUnitVariance(1500.0, 1500.0), 0.0);
    });

    it('should calculate variance percentage with proper precision', () => {
      // (2450 - 1720) / 1720 * 100 = 42.4418... -> 42.44%
      assert.equal(calculateVariancePct(2450.0, 1720.0), 42.44);
      // (2850 - 2980) / 2980 * 100 = -4.3624... -> -4.36%
      assert.equal(calculateVariancePct(2850.0, 2980.0), -4.36);
      // Divide by zero edge case
      assert.equal(calculateVariancePct(1000.0, 0), 0.0);
    });

    it('should classify variance status according to clinical thresholds', () => {
      // <= 5% -> EFFICIENT
      assert.equal(classifyVarianceStatus(-4.36), 'EFFICIENT');
      assert.equal(classifyVarianceStatus(0.0), 'EFFICIENT');
      assert.equal(classifyVarianceStatus(5.0), 'EFFICIENT');

      // > 5% and < 20% -> MODERATE_VARIANCE
      assert.equal(classifyVarianceStatus(7.56), 'MODERATE_VARIANCE');
      assert.equal(classifyVarianceStatus(19.99), 'MODERATE_VARIANCE');

      // >= 20% -> HIGH_VARIANCE_OUTLIER
      assert.equal(classifyVarianceStatus(20.0), 'HIGH_VARIANCE_OUTLIER');
      assert.equal(classifyVarianceStatus(42.44), 'HIGH_VARIANCE_OUTLIER');
    });

    it('should calculate total excess spend for positive variances only', () => {
      // Positive variance: $730 excess * 6 cases = $4,380
      assert.equal(calculateTotalExcessSpend(730.0, 6), 4380.0);
      // Zero variance: $0 excess
      assert.equal(calculateTotalExcessSpend(0.0, 10), 0.0);
      // Negative variance: below median, excess spend must be 0
      assert.equal(calculateTotalExcessSpend(-130.0, 22), 0.0);
      // Zero cases: $0 excess
      assert.equal(calculateTotalExcessSpend(500.0, 0), 0.0);
    });

    it('should calculate potential construct substitution savings', () => {
      // Surgeon cost $2,450 vs substitute $1,480 -> unit savings $970, 6 cases -> $5,820
      const savings = calculatePotentialSavings(2450.0, 1480.0, 6);
      assert.equal(savings.unitSavings, 970.0);
      assert.equal(savings.totalSavings, 5820.0);

      // Substitute cost higher -> savings zero
      const noSavings = calculatePotentialSavings(1400.0, 1500.0, 5);
      assert.equal(noSavings.unitSavings, 0.0);
      assert.equal(noSavings.totalSavings, 0.0);

      // Zero cases edge case
      const zeroCases = calculatePotentialSavings(2000.0, 1500.0, 0);
      assert.equal(zeroCases.unitSavings, 0.0);
      assert.equal(zeroCases.totalSavings, 0.0);
    });

    it('should calculate sterile waste rate and flag excessive waste (> 3%)', () => {
      // Normal waste: $750 wasted out of $62,700 staged -> 1.2% (not excessive)
      const normalWaste = calculateSterileWaste(750.0, 62700.0);
      assert.equal(normalWaste.wasteRatePct, 1.2);
      assert.equal(normalWaste.isExcessive, false);

      // Excessive waste: $790 wasted out of $14,700 staged -> 5.37% -> 5.37% (excessive)
      const highWaste = calculateSterileWaste(790.0, 14700.0);
      assert.equal(highWaste.wasteRatePct, 5.37);
      assert.equal(highWaste.isExcessive, true);

      // Zero staged cost edge case
      const zeroStaged = calculateSterileWaste(100.0, 0);
      assert.equal(zeroStaged.wasteRatePct, 0.0);
      assert.equal(zeroStaged.isExcessive, false);
    });
  });

  describe('3. Facility KPI Aggregation & Seed Dataset', () => {
    it('should calculate accurate facility-wide KPIs across seed variance records', () => {
      const kpis = calculateFacilityImplantKpis(SEED_SURGEON_IMPLANT_VARIANCES);
      assert.equal(kpis.totalProcedures, 8);
      assert.equal(kpis.totalImplantSpend, 223220);
      assert.equal(kpis.totalExcessSpend, 11020);
      assert.equal(kpis.totalRealizableSavings, 30710);
      assert.equal(kpis.avgSterileWastePct, 2.6);
      assert.equal(kpis.outliersCount, 2);
    });

    it('should handle empty or null dataset gracefully in KPI calculation', () => {
      const emptyKpis = calculateFacilityImplantKpis([]);
      assert.equal(emptyKpis.totalProcedures, 0);
      assert.equal(emptyKpis.totalImplantSpend, 0);
      assert.equal(emptyKpis.totalExcessSpend, 0);
      assert.equal(emptyKpis.totalRealizableSavings, 0);
      assert.equal(emptyKpis.avgSterileWastePct, 0);
      assert.equal(emptyKpis.outliersCount, 0);
    });

    it('should verify all seed variance records have complete mandatory fields', () => {
      assert.equal(SEED_SURGEON_IMPLANT_VARIANCES.length, 8);
      SEED_SURGEON_IMPLANT_VARIANCES.forEach(v => {
        assert.ok(v.id, 'Record id is required');
        assert.ok(v.surgeonId, 'Surgeon ID is required');
        assert.ok(v.surgeonName, 'Surgeon Name is required');
        assert.ok(v.cptCode, 'CPT Code is required');
        assert.ok(v.procedureName, 'Procedure Name is required');
        assert.ok(v.caseCount > 0, 'Case count must be positive');
        assert.ok(v.surgeonAvgImplantCost > 0, 'Surgeon avg cost must be positive');
        assert.ok(v.peerMedianImplantCost > 0, 'Peer median cost must be positive');
        assert.ok(v.primaryVendorName, 'Vendor Name is required');
        assert.ok(v.primaryConstructName, 'Construct Name is required');
        assert.ok(VARIANCE_STATUSES[v.varianceStatus], `Valid status required for ${v.id}`);
      });
    });
  });

  describe('4. PostgreSQL Migration 091 Schema & Rollback Integrity', () => {
    const migrationPath = path.join(ROOT_DIR, 'supabase', 'migrations', '091_surgeon_implant_variance.sql');
    const rollbackPath = path.join(ROOT_DIR, 'supabase', 'migrations', '091_surgeon_implant_variance_down.sql');

    it('should have migration 091 up file with required tables and RLS', () => {
      assert.ok(fs.existsSync(migrationPath), 'Migration 091 must exist');
      const sql = fs.readFileSync(migrationPath, 'utf8');

      // Table declarations
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.surgeon_implant_variances'), 'Must create surgeon_implant_variances');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.surgeon_vendor_loyalty_metrics'), 'Must create surgeon_vendor_loyalty_metrics');

      // Foreign key to public.surgeons(id) with BIGINT
      assert.ok(sql.includes('surgeon_id BIGINT NOT NULL REFERENCES public.surgeons(id)'), 'Must reference surgeons(id) with BIGINT');

      // RLS policies
      assert.ok(sql.includes('ALTER TABLE public.surgeon_implant_variances ENABLE ROW LEVEL SECURITY;'), 'Must enable RLS on surgeon_implant_variances');
      assert.ok(sql.includes('ALTER TABLE public.surgeon_vendor_loyalty_metrics ENABLE ROW LEVEL SECURITY;'), 'Must enable RLS on surgeon_vendor_loyalty_metrics');
      assert.ok(sql.includes("current_setting('app.current_facility_id'"), 'Must enforce facility_id tenancy check');

      // Analytical view
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_surgeon_implant_variance_summary'), 'Must create vw_surgeon_implant_variance_summary');
    });

    it('should have migration 091 down file that drops all created objects', () => {
      assert.ok(fs.existsSync(rollbackPath), 'Rollback 091 must exist');
      const sql = fs.readFileSync(rollbackPath, 'utf8');

      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_surgeon_implant_variance_summary CASCADE;'), 'Must drop summary view');
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.surgeon_vendor_loyalty_metrics CASCADE;'), 'Must drop vendor loyalty table');
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.surgeon_implant_variances CASCADE;'), 'Must drop implant variances table');
    });
  });

  describe('5. Zero-Purple Design System Compliance', () => {
    const componentJsxPath = path.join(ROOT_DIR, 'src', 'components', 'SurgeonImplantVarianceView.jsx');
    const componentCssPath = path.join(ROOT_DIR, 'src', 'components', 'SurgeonImplantVarianceView.css');
    const purpleTokens = [
      'purple',
      'violet',
      'indigo',
      'fuchsia',
      'magenta',
      '#7c3aed',
      '#8b5cf6',
      '#6366f1',
      '#4f46e5',
      '#a855f7',
      '#9333ea',
      '#c084fc',
      '#e879f9',
      '#d946ef'
    ];

    it('should strictly avoid purple/indigo tokens in SurgeonImplantVarianceView.jsx', () => {
      assert.ok(fs.existsSync(componentJsxPath), 'Component JSX must exist');
      const jsx = fs.readFileSync(componentJsxPath, 'utf8').toLowerCase();

      purpleTokens.forEach(token => {
        assert.ok(!jsx.includes(token), `Component JSX must NOT contain forbidden purple token "${token}"`);
      });
    });

    it('should strictly avoid purple/indigo tokens in SurgeonImplantVarianceView.css', () => {
      assert.ok(fs.existsSync(componentCssPath), 'Component CSS must exist');
      const css = fs.readFileSync(componentCssPath, 'utf8').toLowerCase();

      purpleTokens.forEach(token => {
        assert.ok(!css.includes(token), `Component CSS must NOT contain forbidden purple token "${token}"`);
      });
    });
  });

  describe('6. App.jsx Navigation & View Integration', () => {
    const appJsxPath = path.join(ROOT_DIR, 'src', 'App.jsx');

    it('should wire SurgeonImplantVarianceView into App.jsx seamlessly', () => {
      assert.ok(fs.existsSync(appJsxPath), 'App.jsx must exist');
      const appJsx = fs.readFileSync(appJsxPath, 'utf8');

      // Import check
      assert.ok(
        appJsx.includes("import SurgeonImplantVarianceView from './components/SurgeonImplantVarianceView';"),
        'Must import SurgeonImplantVarianceView in App.jsx'
      );

      // Sidebar item check
      assert.ok(
        appJsx.includes("activeTab === 'surgeon_implant_variance'"),
        'Must have sidebar activeTab condition for surgeon_implant_variance'
      );
      assert.ok(
        appJsx.includes("Surgeon Implant Variance"),
        'Must display Surgeon Implant Variance in sidebar'
      );

      // Tab view render check
      assert.ok(
        appJsx.includes("<SurgeonImplantVarianceView />"),
        'Must render <SurgeonImplantVarianceView />'
      );

      // Date pill exclusion check
      assert.ok(
        appJsx.includes("'surgeon_implant_variance'"),
        'Must exclude surgeon_implant_variance from date range pill header'
      );
    });
  });
});
