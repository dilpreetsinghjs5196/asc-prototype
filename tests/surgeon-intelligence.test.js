import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PERFORMANCE_TIERS,
  SCORING_WEIGHTS,
  ALERT_TYPES,
  calculateFinancialScore,
  calculateOperationalScore,
  calculateBlockScore,
  calculateQualityScore,
  calculateSupplyScore,
  calculateCompositeScore,
  classifyPerformanceTier,
  detectSurgeonAlerts,
  calculateFacilitySurgeonKpis,
  SEED_SURGEON_INTELLIGENCE_PROFILES
} from '../src/services/surgeonIntelligenceService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

describe('Phase B0 — Surgeon Intelligence Framework Test Suite', () => {
  describe('1. Taxonomy & Architectural Standards', () => {
    it('should define all 4 performance tiers with valid minScore thresholds', () => {
      assert.ok(PERFORMANCE_TIERS.PINNACLE, 'PINNACLE tier must exist');
      assert.ok(PERFORMANCE_TIERS.CORE_PERFORMER, 'CORE_PERFORMER tier must exist');
      assert.ok(PERFORMANCE_TIERS.OPPORTUNITY, 'OPPORTUNITY tier must exist');
      assert.ok(PERFORMANCE_TIERS.AT_RISK, 'AT_RISK tier must exist');

      assert.equal(PERFORMANCE_TIERS.PINNACLE.minScore, 90.0);
      assert.equal(PERFORMANCE_TIERS.CORE_PERFORMER.minScore, 75.0);
      assert.equal(PERFORMANCE_TIERS.OPPORTUNITY.minScore, 60.0);
      assert.equal(PERFORMANCE_TIERS.AT_RISK.minScore, 0.0);
    });

    it('should define 5 scoring weights summing exactly to 1.00', () => {
      const sum =
        SCORING_WEIGHTS.FINANCIAL +
        SCORING_WEIGHTS.OPERATIONAL +
        SCORING_WEIGHTS.BLOCK +
        SCORING_WEIGHTS.QUALITY +
        SCORING_WEIGHTS.SUPPLY;

      assert.equal(Number(sum.toFixed(4)), 1.0, 'Scoring weights must sum to 1.00');
      assert.equal(SCORING_WEIGHTS.FINANCIAL, 0.30);
      assert.equal(SCORING_WEIGHTS.OPERATIONAL, 0.25);
      assert.equal(SCORING_WEIGHTS.BLOCK, 0.20);
      assert.equal(SCORING_WEIGHTS.QUALITY, 0.15);
      assert.equal(SCORING_WEIGHTS.SUPPLY, 0.10);
    });

    it('should define all 5 authoritative operational alert types', () => {
      const expectedKeys = [
        'VOLUME_CHURN_RISK',
        'CHRONIC_START_DELAY',
        'SUPPLY_COST_OUTLIER',
        'BLOCK_UNDERUTILIZATION',
        'EXCESSIVE_TURNOVER'
      ];

      expectedKeys.forEach(k => {
        assert.ok(ALERT_TYPES[k], `Alert type ${k} must exist`);
        assert.equal(ALERT_TYPES[k].key, k);
      });
    });
  });

  describe('2. Deterministic 5-Pillar Mathematical Scoring', () => {
    it('calculateFinancialScore: accurately computes yield from margin/hr, realization, and payer mix', () => {
      // Ideal surgeon: $1,800/hr, 70% realization ($70k / $100k), 75% commercial
      const idealScore = calculateFinancialScore({
        marginPerHour: 1800,
        netCollections: 70000,
        billedCharges: 100000,
        commercialRatio: 0.75
      });
      assert.equal(idealScore, 100.0);

      // Low yield surgeon: $900/hr, 50% realization, 40% commercial
      const lowScore = calculateFinancialScore({
        marginPerHour: 900,
        netCollections: 50000,
        billedCharges: 100000,
        commercialRatio: 0.40
      });
      // 30 (from margin) + 17.86 (realization) + 8.0 (commercial) = 55.86
      assert.ok(lowScore > 50 && lowScore < 60, `Score was ${lowScore}`);
    });

    it('calculateOperationalScore: evaluates on-time starts, P80 duration variance, and turnover', () => {
      const highOps = calculateOperationalScore({
        firstCaseOnTimePct: 94,
        durationVarianceMinutes: 4,
        avgTurnoverMinutes: 22
      });
      // 40 + 35 + 25 = 100
      assert.equal(highOps, 100.0);

      const degradedOps = calculateOperationalScore({
        firstCaseOnTimePct: 52,
        durationVarianceMinutes: 25,
        avgTurnoverMinutes: 40
      });
      // OnTime: (52/85)*40 = 24.47; Duration: 35 - 15*2 = 5; Turnover: 25 - 15 = 10; Total = ~39.47
      assert.ok(degradedOps < 50, `Score was ${degradedOps}`);
    });

    it('calculateBlockScore: evaluates block utilization, release lead-time, and add-on uptake', () => {
      const highBlock = calculateBlockScore({
        blockUtilizationPct: 88,
        releaseNoticeHours: 96,
        addonCasesCount: 3
      });
      assert.equal(highBlock, 100.0);

      const poorBlock = calculateBlockScore({
        blockUtilizationPct: 50,
        releaseNoticeHours: 12,
        addonCasesCount: 0
      });
      // Util: (50/75)*60 = 40; Release: 0; Addon: 0; Total = 40
      assert.equal(poorBlock, 40.0);
    });

    it('calculateQualityScore: evaluates low cancellations, documentation readiness, and safety', () => {
      const highQuality = calculateQualityScore({
        lateCancellationRate: 2.0,
        docCompletenessPct: 100,
        hospitalTransfersCount: 0
      });
      assert.equal(highQuality, 100.0);

      const poorQuality = calculateQualityScore({
        lateCancellationRate: 12.0,
        docCompletenessPct: 80,
        hospitalTransfersCount: 1
      });
      assert.ok(poorQuality < 50, `Score was ${poorQuality}`);
    });

    it('calculateSupplyScore: evaluates cost variance vs peers, unused item waste, and card currency', () => {
      const highSupply = calculateSupplyScore({
        costVariancePct: 3.0,
        unusedWastePct: 1.5,
        daysSincePrefCardReview: 90
      });
      assert.equal(highSupply, 100.0);

      const highCostSurgeon = calculateSupplyScore({
        costVariancePct: 25.0,
        unusedWastePct: 6.0,
        daysSincePrefCardReview: 240
      });
      assert.ok(highCostSurgeon < 40, `Score was ${highCostSurgeon}`);
    });

    it('calculateCompositeScore: accurately computes 5-pillar weighted index', () => {
      const scores = {
        financialScore: 90,
        operationalScore: 80,
        blockScore: 70,
        qualityScore: 100,
        supplyScore: 60
      };
      // 0.30*90 + 0.25*80 + 0.20*70 + 0.15*100 + 0.10*60 = 27 + 20 + 14 + 15 + 6 = 82
      const composite = calculateCompositeScore(scores);
      assert.equal(composite, 82.0);
    });
  });

  describe('3. Tier Classification & Threshold Boundaries', () => {
    it('should classify composite scores into authoritative tiers', () => {
      assert.equal(classifyPerformanceTier(95.0), 'PINNACLE');
      assert.equal(classifyPerformanceTier(90.0), 'PINNACLE');
      assert.equal(classifyPerformanceTier(89.9), 'CORE_PERFORMER');
      assert.equal(classifyPerformanceTier(75.0), 'CORE_PERFORMER');
      assert.equal(classifyPerformanceTier(74.9), 'OPPORTUNITY');
      assert.equal(classifyPerformanceTier(60.0), 'OPPORTUNITY');
      assert.equal(classifyPerformanceTier(59.9), 'AT_RISK');
      assert.equal(classifyPerformanceTier(35.0), 'AT_RISK');
    });
  });

  describe('4. Anomaly Alert Detection Engine', () => {
    it('should return zero alerts for top performer Dr. Marcus Vance', () => {
      const vance = SEED_SURGEON_INTELLIGENCE_PROFILES.find(p => p.id === 3);
      assert.ok(vance);
      const alerts = detectSurgeonAlerts(vance);
      assert.equal(alerts.length, 0, 'Top performer should have zero alerts');
    });

    it('should detect all critical anomaly alerts for Dr. Aaron Jacobs', () => {
      const jacobs = SEED_SURGEON_INTELLIGENCE_PROFILES.find(p => p.id === 15);
      assert.ok(jacobs);
      const alerts = detectSurgeonAlerts(jacobs);

      assert.ok(alerts.length >= 4, `Expected at least 4 alerts, got ${alerts.length}`);
      const types = alerts.map(a => a.alertType);
      assert.ok(types.includes('VOLUME_CHURN_RISK'), 'Should detect volume churn risk');
      assert.ok(types.includes('CHRONIC_START_DELAY'), 'Should detect chronic start delay');
      assert.ok(types.includes('SUPPLY_COST_OUTLIER'), 'Should detect supply cost outlier');
      assert.ok(types.includes('BLOCK_UNDERUTILIZATION'), 'Should detect block underutilization');
    });
  });

  describe('5. Facility KPI Aggregations', () => {
    it('should aggregate facility-wide metrics from seed profiles', () => {
      const kpis = calculateFacilitySurgeonKpis(SEED_SURGEON_INTELLIGENCE_PROFILES);

      assert.equal(kpis.totalSurgeons, 9);
      assert.ok(kpis.avgCompositeScore > 70 && kpis.avgCompositeScore < 85);
      assert.equal(kpis.topPerformerMargin, 2244);
      assert.equal(kpis.atRiskCount, 1);
      assert.ok(kpis.avgOnTimeStartPct > 70);
    });

    it('should return safe zero defaults for empty profile lists', () => {
      const emptyKpis = calculateFacilitySurgeonKpis([]);
      assert.equal(emptyKpis.totalSurgeons, 0);
      assert.equal(emptyKpis.avgCompositeScore, 0);
      assert.equal(emptyKpis.topPerformerMargin, 0);
      assert.equal(emptyKpis.atRiskCount, 0);
    });
  });

  describe('6. Database Migration 089 SQL Integrity', () => {
    it('UP migration 089 should contain required tables, columns, RLS, and BIGINT surgeon_id', () => {
      const sqlPath = path.join(ROOT_DIR, 'supabase', 'migrations', '089_surgeon_intelligence.sql');
      assert.ok(fs.existsSync(sqlPath), 'Migration 089_surgeon_intelligence.sql must exist');

      const sql = fs.readFileSync(sqlPath, 'utf8');
      assert.ok(sql.includes('public.surgeon_intelligence_profiles'));
      assert.ok(sql.includes('public.surgeon_intelligence_alerts'));
      assert.ok(sql.includes('public.surgeon_intelligence_benchmarks'));
      assert.ok(sql.includes('surgeon_id BIGINT NOT NULL REFERENCES public.surgeons(id)'));
      assert.ok(sql.includes('vw_surgeon_intelligence_summary'));
      assert.ok(sql.includes('vw_surgeon_intelligence_active_alerts'));
      assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'));
      assert.ok(sql.includes('app.current_facility_id'));
    });

    it('DOWN migration 089 should cleanly drop all views, policies, indexes, and tables with CASCADE', () => {
      const sqlDownPath = path.join(ROOT_DIR, 'supabase', 'migrations', '089_surgeon_intelligence_down.sql');
      assert.ok(fs.existsSync(sqlDownPath), 'Migration 089_surgeon_intelligence_down.sql must exist');

      const sql = fs.readFileSync(sqlDownPath, 'utf8');
      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_surgeon_intelligence_active_alerts CASCADE;'));
      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_surgeon_intelligence_summary CASCADE;'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.surgeon_intelligence_profiles CASCADE;'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.surgeon_intelligence_alerts CASCADE;'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.surgeon_intelligence_benchmarks CASCADE;'));
    });
  });

  describe('7. Maestro Clinical Design System Zero-Purple Compliance', () => {
    it('SurgeonIntelligenceView.jsx must contain zero prohibited purple/violet/indigo tokens', () => {
      const jsxPath = path.join(ROOT_DIR, 'src', 'components', 'SurgeonIntelligenceView.jsx');
      assert.ok(fs.existsSync(jsxPath));

      const jsx = fs.readFileSync(jsxPath, 'utf8');
      const purpleRegex = /\b(purple|violet|indigo|fuchsia|magenta)\b/i;
      assert.ok(!purpleRegex.test(jsx), 'SurgeonIntelligenceView.jsx contains prohibited purple/violet tokens');
    });

    it('SurgeonIntelligenceView.css must contain zero prohibited purple/violet/indigo tokens', () => {
      const cssPath = path.join(ROOT_DIR, 'src', 'components', 'SurgeonIntelligenceView.css');
      assert.ok(fs.existsSync(cssPath));

      const css = fs.readFileSync(cssPath, 'utf8');
      const purpleRegex = /\b(purple|violet|indigo|fuchsia|magenta|#8b5cf6|#a855f7|#6366f1|#7c3aed|#9333ea)\b/i;
      assert.ok(!purpleRegex.test(css), 'SurgeonIntelligenceView.css contains prohibited purple/violet tokens');
    });

    it('SurgeonIntelligenceView.css must enforce pinned modal layout', () => {
      const cssPath = path.join(ROOT_DIR, 'src', 'components', 'SurgeonIntelligenceView.css');
      const css = fs.readFileSync(cssPath, 'utf8');

      assert.ok(css.includes('.si-modal-card'));
      assert.ok(css.includes('max-height: 90vh'));
      assert.ok(css.includes('display: flex'));
      assert.ok(css.includes('flex-direction: column'));
      assert.ok(css.includes('overflow-y: auto'));
    });
  });

  describe('8. Application Wiring in App.jsx', () => {
    it('App.jsx should import and wire SurgeonIntelligenceView', () => {
      const appPath = path.join(ROOT_DIR, 'src', 'App.jsx');
      const app = fs.readFileSync(appPath, 'utf8');

      assert.ok(app.includes("import SurgeonIntelligenceView from './components/SurgeonIntelligenceView'"));
      assert.ok(app.includes("activeTab === 'surgeon_intelligence'"));
      assert.ok(app.includes('<SurgeonIntelligenceView'));
    });
  });
});
