import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PAYER_CATEGORIES,
  PERFORMANCE_GRADES,
  PAYER_BENCHMARKS,
  calculateRealizationRate,
  calculateDaysToPay,
  calculateDenialRate,
  calculateDenialOverturnRate,
  calculateUnderpaymentRate,
  calculateAgedArRatio,
  calculatePayerFrictionIndex,
  classifyPayerGrade,
  calculateFacilityPayerKpis,
  SEED_PAYER_INTELLIGENCE_METRICS
} from '../src/services/payerIntelligenceService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

describe('Phase B3 — Payer Intelligence Test Suite', () => {
  describe('1. Payer Categories & Benchmark Standards', () => {
    it('should define authoritative payer categories', () => {
      const categories = ['COMMERCIAL', 'MEDICARE', 'MEDICARE_ADVANTAGE', 'MEDICAID', 'WORKERS_COMP'];
      categories.forEach(catKey => {
        assert.ok(PAYER_CATEGORIES[catKey], `Category ${catKey} must exist`);
        assert.ok(PAYER_CATEGORIES[catKey].key, `Category ${catKey} must have key`);
      });
    });

    it('should define performance grade tiers with zero-purple badges', () => {
      const grades = ['A', 'B', 'C', 'D', 'F'];
      grades.forEach(gradeKey => {
        assert.ok(PERFORMANCE_GRADES[gradeKey], `Grade ${gradeKey} must exist`);
        assert.equal(PERFORMANCE_GRADES[gradeKey].key, gradeKey);
        // Ensure no purple in badge colors
        const color = PERFORMANCE_GRADES[gradeKey].color.toLowerCase();
        assert.ok(!color.includes('purple') && !color.includes('violet'), `Grade ${gradeKey} color must be clean`);
      });
    });

    it('should define clinical & financial benchmark thresholds', () => {
      assert.equal(PAYER_BENCHMARKS.TARGET_REALIZATION_RATE_PCT, 70.0);
      assert.equal(PAYER_BENCHMARKS.MAX_DAYS_TO_PAY, 30.0);
      assert.equal(PAYER_BENCHMARKS.MAX_DENIAL_RATE_PCT, 8.0);
      assert.equal(PAYER_BENCHMARKS.MIN_OVERTURN_RATE_PCT, 75.0);
      assert.equal(PAYER_BENCHMARKS.MAX_UNDERPAYMENT_RATE_PCT, 5.0);
      assert.equal(PAYER_BENCHMARKS.MAX_AGED_AR_OVER_90_PCT, 10.0);
    });
  });

  describe('2. Deterministic Mathematical Calculations', () => {
    it('should calculate collection realization rate accurately', () => {
      // Standard: $1,788,500 collections on $2,450,000 billed -> 73.0%
      assert.equal(calculateRealizationRate(1788500, 2450000), 73.0);
      // Medicare: $818,400 on $1,240,000 -> 66.0%
      assert.equal(calculateRealizationRate(818400, 1240000), 66.0);
      // Zero billed edge case
      assert.equal(calculateRealizationRate(1000, 0), 0.0);
    });

    it('should calculate days to pay from submission to remittance date', () => {
      // 20 days difference
      const d1 = '2026-01-01';
      const d2 = '2026-01-21';
      assert.equal(calculateDaysToPay(d1, d2), 20.0);
      // Same day adjudication
      assert.equal(calculateDaysToPay('2026-02-10', '2026-02-10'), 0.0);
      // Null date handling
      assert.equal(calculateDaysToPay(null, '2026-02-10'), 0.0);
    });

    it('should calculate first-pass denial rate accurately', () => {
      // 38 denials out of 520 claims -> 7.31%
      assert.equal(calculateDenialRate(38, 520), 7.31);
      // 0 denials
      assert.equal(calculateDenialRate(0, 100), 0.0);
      // Zero claims edge case
      assert.equal(calculateDenialRate(5, 0), 0.0);
    });

    it('should calculate denial overturn resolution rate', () => {
      // 39 overturns out of 50 denials -> 78.0%
      assert.equal(calculateDenialOverturnRate(39, 50), 78.0);
      // Zero denials edge case
      assert.equal(calculateDenialOverturnRate(0, 0), 0.0);
    });

    it('should calculate contractual underpayment rate', () => {
      // 24 underpayments out of 520 claims -> 4.62%
      assert.equal(calculateUnderpaymentRate(24, 520), 4.62);
      // Zero claims edge case
      assert.equal(calculateUnderpaymentRate(10, 0), 0.0);
    });

    it('should calculate aged AR ratio past 90 days', () => {
      // $11,200 (91-120) + $4,100 (>120) = $15,300 out of $225,000 total AR -> 6.8%
      assert.equal(calculateAgedArRatio(11200, 4100, 225000), 6.8);
      // Zero AR edge case
      assert.equal(calculateAgedArRatio(100, 200, 0), 0.0);
    });

    it('should calculate Payer Friction Index (PFI) bounded between 0 and 100', () => {
      // Clean low-friction Medicare case: 16.2 days, 4.74% denial, 1.84% underpay, 3.16% aged AR
      // 0.35 * (16.2/60*100 = 27) = 9.45
      // 0.30 * 4.74 = 1.422
      // 0.20 * 1.84 = 0.368
      // 0.15 * 3.16 = 0.474
      // Sum = 11.714 -> 11.71
      const pfi = calculatePayerFrictionIndex(16.2, 4.74, 1.84, 3.16);
      assert.ok(pfi >= 10.0 && pfi <= 13.0, `PFI should be ~11.71, got ${pfi}`);

      // Extreme delay and high friction: 90 days, 40% denial, 30% underpay, 50% aged AR
      const highPfi = calculatePayerFrictionIndex(90, 40, 30, 50);
      assert.ok(highPfi >= 50.0 && highPfi <= 100.0, `High friction PFI must be high, got ${highPfi}`);
      assert.ok(highPfi <= 100.0, 'PFI must not exceed 100.0');
    });

    it('should classify payer performance grade correctly across boundary thresholds', () => {
      // Grade A (< 20)
      assert.equal(classifyPayerGrade(12.07), 'A');
      assert.equal(classifyPayerGrade(19.99), 'A');

      // Grade B (20 <= PFI < 40)
      assert.equal(classifyPayerGrade(20.0), 'B');
      assert.equal(classifyPayerGrade(35.91), 'B');

      // Grade C (40 <= PFI < 65)
      assert.equal(classifyPayerGrade(40.0), 'C');
      assert.equal(classifyPayerGrade(48.28), 'C');

      // Grade D (65 <= PFI < 80)
      assert.equal(classifyPayerGrade(65.0), 'D');
      assert.equal(classifyPayerGrade(75.0), 'D');

      // Grade F (>= 80)
      assert.equal(classifyPayerGrade(80.0), 'F');
      assert.equal(classifyPayerGrade(95.0), 'F');
    });
  });

  describe('3. Facility KPI Aggregation & Seed Dataset', () => {
    it('should aggregate facility-wide payer metrics accurately', () => {
      const kpis = calculateFacilityPayerKpis(SEED_PAYER_INTELLIGENCE_METRICS);
      assert.equal(kpis.payersCount, 8);
      assert.equal(kpis.totalBilled, 10170000);
      assert.equal(kpis.totalCollections, 6915200);
      assert.equal(kpis.portfolioRealizationRate, 68.0);
      assert.equal(kpis.avgDaysToPay, 32.7);
      assert.equal(kpis.avgDenialRate, 10.7);
      assert.equal(kpis.totalUnderpayment, 397700);
      assert.equal(kpis.totalAr, 1350000);
      assert.equal(kpis.totalAgedArOver90, 196500);
      assert.equal(kpis.agedArOver90Pct, 14.56);
      assert.equal(kpis.highFrictionCount, 2);
    });

    it('should return safe zero defaults for empty payer list', () => {
      const emptyKpis = calculateFacilityPayerKpis([]);
      assert.equal(emptyKpis.payersCount, 0);
      assert.equal(emptyKpis.totalBilled, 0);
      assert.equal(emptyKpis.totalCollections, 0);
      assert.equal(emptyKpis.portfolioRealizationRate, 0.0);
      assert.equal(emptyKpis.avgDaysToPay, 0.0);
      assert.equal(emptyKpis.avgDenialRate, 0.0);
      assert.equal(emptyKpis.totalUnderpayment, 0);
      assert.equal(emptyKpis.totalAr, 0);
      assert.equal(emptyKpis.totalAgedArOver90, 0);
      assert.equal(emptyKpis.agedArOver90Pct, 0.0);
      assert.equal(emptyKpis.highFrictionCount, 0);
    });

    it('should verify all seed payer records have complete required properties', () => {
      assert.equal(SEED_PAYER_INTELLIGENCE_METRICS.length, 8);
      SEED_PAYER_INTELLIGENCE_METRICS.forEach(p => {
        assert.ok(p.id, 'Payer ID required');
        assert.ok(p.payerCode, 'Payer code required');
        assert.ok(p.payerName, 'Payer name required');
        assert.ok(p.payerCategory, 'Category required');
        assert.ok(p.claimsCount > 0, 'Claims count must be positive');
        assert.ok(p.totalBilledAmount > 0, 'Billed amount must be positive');
        assert.ok(p.totalNetCollections > 0, 'Collections must be positive');
        assert.ok(p.realizationRatePct > 0, 'Realization rate must be positive');
        assert.ok(p.avgDaysToPay > 0, 'Days to pay must be positive');
        assert.ok(PERFORMANCE_GRADES[p.performanceGrade], `Valid grade required for ${p.id}`);
        assert.ok(p.payerFrictionIndex >= 0 && p.payerFrictionIndex <= 100, 'PFI in range 0-100');
        assert.ok(p.topDenialCarc, 'Top denial CARC required');
      });
    });
  });

  describe('4. PostgreSQL Migration 092 Schema & Rollback Integrity', () => {
    const migrationPath = path.join(ROOT_DIR, 'supabase', 'migrations', '092_payer_intelligence.sql');
    const rollbackPath = path.join(ROOT_DIR, 'supabase', 'migrations', '092_payer_intelligence_down.sql');

    it('should have migration 092 up file with required tables, views, and RLS', () => {
      assert.ok(fs.existsSync(migrationPath), 'Migration 092 must exist');
      const sql = fs.readFileSync(migrationPath, 'utf8');

      // Table declarations
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.payer_intelligence_metrics'), 'Must create payer_intelligence_metrics');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.payer_denial_reason_summaries'), 'Must create payer_denial_reason_summaries');

      // Analytical views
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_payer_intelligence_summary'), 'Must create vw_payer_intelligence_summary');
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_facility_payer_risk_overview'), 'Must create vw_facility_payer_risk_overview');

      // Multi-tenant RLS
      assert.ok(sql.includes('ALTER TABLE public.payer_intelligence_metrics ENABLE ROW LEVEL SECURITY;'), 'Must enable RLS on payer_intelligence_metrics');
      assert.ok(sql.includes('ALTER TABLE public.payer_denial_reason_summaries ENABLE ROW LEVEL SECURITY;'), 'Must enable RLS on payer_denial_reason_summaries');
      assert.ok(sql.includes("current_setting('app.current_facility_id'"), 'Must enforce facility_id tenancy check');
    });

    it('should have migration 092 down file that drops all created objects', () => {
      assert.ok(fs.existsSync(rollbackPath), 'Rollback 092 must exist');
      const sql = fs.readFileSync(rollbackPath, 'utf8');

      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_facility_payer_risk_overview CASCADE;'), 'Must drop risk overview view');
      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_payer_intelligence_summary CASCADE;'), 'Must drop summary view');
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.payer_denial_reason_summaries CASCADE;'), 'Must drop denial summaries table');
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.payer_intelligence_metrics CASCADE;'), 'Must drop metrics table');
    });
  });

  describe('5. Zero-Purple Design System Compliance', () => {
    const componentJsxPath = path.join(ROOT_DIR, 'src', 'components', 'PayerIntelligenceView.jsx');
    const componentCssPath = path.join(ROOT_DIR, 'src', 'components', 'PayerIntelligenceView.css');
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

    it('should strictly avoid purple/indigo tokens in PayerIntelligenceView.jsx', () => {
      assert.ok(fs.existsSync(componentJsxPath), 'Component JSX must exist');
      const jsx = fs.readFileSync(componentJsxPath, 'utf8').toLowerCase();

      purpleTokens.forEach(token => {
        assert.ok(!jsx.includes(token), `Component JSX must NOT contain forbidden purple token "${token}"`);
      });
    });

    it('should strictly avoid purple/indigo tokens in PayerIntelligenceView.css', () => {
      assert.ok(fs.existsSync(componentCssPath), 'Component CSS must exist');
      const css = fs.readFileSync(componentCssPath, 'utf8').toLowerCase();

      purpleTokens.forEach(token => {
        assert.ok(!css.includes(token), `Component CSS must NOT contain forbidden purple token "${token}"`);
      });
    });

    it('should enforce pinned modal architecture in PayerIntelligenceView.css', () => {
      assert.ok(fs.existsSync(componentCssPath), 'Component CSS must exist');
      const css = fs.readFileSync(componentCssPath, 'utf8');

      assert.ok(css.includes('max-height: 90vh'), 'Modal container must have max-height 90vh');
      assert.ok(css.includes('overflow-y: auto'), 'Modal body must have overflow-y: auto');
    });
  });

  describe('6. App.jsx Navigation & View Integration', () => {
    const appJsxPath = path.join(ROOT_DIR, 'src', 'App.jsx');

    it('should wire PayerIntelligenceView into App.jsx seamlessly', () => {
      assert.ok(fs.existsSync(appJsxPath), 'App.jsx must exist');
      const appJsx = fs.readFileSync(appJsxPath, 'utf8');

      // Import check
      assert.ok(
        appJsx.includes("import PayerIntelligenceView from './components/PayerIntelligenceView';"),
        'Must import PayerIntelligenceView in App.jsx'
      );

      // Sidebar item check
      assert.ok(
        appJsx.includes("activeTab === 'payer_intelligence'"),
        'Must have sidebar activeTab condition for payer_intelligence'
      );
      assert.ok(
        appJsx.includes("Payer Intelligence"),
        'Must display Payer Intelligence in sidebar'
      );

      // Tab view render check
      assert.ok(
        appJsx.includes("<PayerIntelligenceView />"),
        'Must render <PayerIntelligenceView />'
      );

      // Date pill exclusion check
      assert.ok(
        appJsx.includes("'payer_intelligence'"),
        'Must exclude payer_intelligence from date range pill header'
      );
    });
  });
});
