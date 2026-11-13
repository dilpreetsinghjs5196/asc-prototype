import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_FACILITY_ID,
  DEFAULT_BENCHMARK_MARGIN,
  DEFAULT_SCORING_WEIGHTS,
  PRIOR_AUTH_STATUSES,
  DISQUALIFICATION_REASONS,
  RECOMMENDATION_STATUSES,
  calculateReadinessScore,
  calculateProbabilityScore,
  calculateFinancialScore,
  calculateTimeFitScore,
  calculateCompositeFitScore,
  rankCandidatesForSlot,
  calculateFacilityNbcKpis,
  filterNbcRecommendations,
  SEED_OPEN_SLOTS,
  SEED_BACKLOG_CASES
} from '../src/services/nextBestCaseService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase AA / A10 — Next Best Case Matching Engine Test Suite', () => {

  describe('1. NBC Taxonomy & Architecture Standards', () => {
    it('should define default scoring weights summing to 1.00', () => {
      const sum = DEFAULT_SCORING_WEIGHTS.readiness +
                  DEFAULT_SCORING_WEIGHTS.probability +
                  DEFAULT_SCORING_WEIGHTS.financial +
                  DEFAULT_SCORING_WEIGHTS.timeFit;
      assert.strictEqual(Number(sum.toFixed(2)), 1.00);
      assert.strictEqual(DEFAULT_BENCHMARK_MARGIN, 2500.00);
      assert.strictEqual(DEFAULT_FACILITY_ID, 'f47ac10b-58cc-4372-a567-0e02b2c3d479');
    });

    it('should define all 4 prior authorization statuses with standard points', () => {
      assert.strictEqual(PRIOR_AUTH_STATUSES.APPROVED.points, 30);
      assert.strictEqual(PRIOR_AUTH_STATUSES.PENDING.points, 0);
      assert.strictEqual(PRIOR_AUTH_STATUSES.DENIED.points, 0);
      assert.strictEqual(PRIOR_AUTH_STATUSES.EXPIRED.points, 0);
    });

    it('should define all 4 hard clinical & physical disqualification reasons', () => {
      assert.ok(DISQUALIFICATION_REASONS.READINESS_GATE_FAILED);
      assert.ok(DISQUALIFICATION_REASONS.DURATION_EXCEEDS_SLOT);
      assert.ok(DISQUALIFICATION_REASONS.SPECIALTY_EQUIPMENT_MISMATCH);
      assert.ok(DISQUALIFICATION_REASONS.IMPLANT_SLA_BREACH);
    });

    it('should define all 6 recommendation workflow lifecycle statuses', () => {
      const statuses = ['RANKED', 'OFFERED_TO_SURGEON', 'ACCEPTED', 'BOOKED_IN_OR', 'DECLINED', 'EXPIRED'];
      statuses.forEach(st => {
        assert.ok(RECOMMENDATION_STATUSES[st], `Missing status ${st}`);
        assert.strictEqual(RECOMMENDATION_STATUSES[st].code, st);
      });
    });
  });

  describe('2. Deterministic Scoring Pillars Math', () => {
    it('calculateReadinessScore: computes 100 for fully cleared patient', () => {
      const candidate = {
        priorAuthStatus: 'APPROVED',
        hpCleared: true,
        labsCleared: true,
        consentSigned: true,
        patientAvailable: true
      };
      const res = calculateReadinessScore(candidate);
      assert.strictEqual(res.isDisqualified, false);
      assert.strictEqual(res.score, 100.0);
    });

    it('calculateReadinessScore: deducts points for missing pre-op clearance elements', () => {
      const candidate = {
        priorAuthStatus: 'APPROVED',
        hpCleared: true,
        labsCleared: false, // -20
        consentSigned: true,
        patientAvailable: true
      };
      const res = calculateReadinessScore(candidate);
      assert.strictEqual(res.isDisqualified, false);
      assert.strictEqual(res.score, 80.0);
    });

    it('calculateReadinessScore: hard disqualifies candidate if Prior Auth is DENIED or EXPIRED', () => {
      const deniedCandidate = {
        priorAuthStatus: 'DENIED',
        hpCleared: true,
        labsCleared: true,
        consentSigned: true,
        patientAvailable: true
      };
      const res1 = calculateReadinessScore(deniedCandidate);
      assert.strictEqual(res1.isDisqualified, true);
      assert.strictEqual(res1.score, 0.0);
      assert.strictEqual(res1.reason, 'READINESS_GATE_FAILED');

      const expiredCandidate = {
        priorAuthStatus: 'EXPIRED',
        hpCleared: true,
        labsCleared: true,
        consentSigned: true,
        patientAvailable: true
      };
      const res2 = calculateReadinessScore(expiredCandidate);
      assert.strictEqual(res2.isDisqualified, true);
      assert.strictEqual(res2.reason, 'READINESS_GATE_FAILED');
    });

    it('calculateFinancialScore: normalizes contribution margin accurately against benchmark', () => {
      // Benchmark is $2,500.00
      // $1,250 = 50.0
      assert.strictEqual(calculateFinancialScore(1250, 2500), 50.0);
      // $2,500 = 100.0
      assert.strictEqual(calculateFinancialScore(2500, 2500), 100.0);
      // $4,000 = capped at 100.0
      assert.strictEqual(calculateFinancialScore(4000, 2500), 100.0);
      // $0 = 0.0
      assert.strictEqual(calculateFinancialScore(0, 2500), 0.0);
    });

    it('calculateTimeFitScore: awards maximum points for goldilocks duration match (75% to 95%)', () => {
      // 180 min case in 200 min slot = 90% utilization
      const res = calculateTimeFitScore(180, 200, true, false);
      assert.strictEqual(res.isDisqualified, false);
      assert.strictEqual(res.durationUtilizationPct, 90.0);
      assert.strictEqual(res.score, 100.0); // 70 + 20 (specialty) + 10 (sterile)
    });

    it('calculateTimeFitScore: triggers hard gate when duration overfills slot (U > 100%)', () => {
      // 250 min case in 240 min slot
      const res = calculateTimeFitScore(250, 240, true, false);
      assert.strictEqual(res.isDisqualified, true);
      assert.strictEqual(res.score, 0.0);
      assert.strictEqual(res.reason, 'DURATION_EXCEEDS_SLOT');
    });

    it('calculateTimeFitScore: triggers hard gate on implant delivery breach or specialty mismatch', () => {
      const implantRes = calculateTimeFitScore(120, 240, true, true); // implantBreach = true
      assert.strictEqual(implantRes.isDisqualified, true);
      assert.strictEqual(implantRes.reason, 'IMPLANT_SLA_BREACH');

      const specialtyRes = calculateTimeFitScore(120, 240, false, false); // specialtyMatch = false
      assert.strictEqual(specialtyRes.isDisqualified, true);
      assert.strictEqual(specialtyRes.reason, 'SPECIALTY_EQUIPMENT_MISMATCH');
    });

    it('calculateCompositeFitScore: computes weighted sum with mathematical fidelity', () => {
      // Readiness 100 * 0.30 = 30
      // Probability 80 * 0.25 = 20
      // Financial 100 * 0.25 = 25
      // TimeFit 100 * 0.20 = 20
      // Total = 95.0
      const score = calculateCompositeFitScore(100, 80, 100, 100);
      assert.strictEqual(score, 95.0);
    });
  });

  describe('3. Candidate Ranking Engine & Sorting Verification', () => {
    it('rankCandidatesForSlot: ranks qualified cases above disqualified cases, sorted by composite score descending', () => {
      const targetSlot = SEED_OPEN_SLOTS[0]; // OR 1 Ortho, 240 mins
      const ranked = rankCandidatesForSlot(SEED_BACKLOG_CASES, targetSlot);

      assert.strictEqual(ranked.length, SEED_BACKLOG_CASES.length);

      // Verify top candidate is qualified and has highest score
      const top = ranked[0];
      assert.strictEqual(top.rankPosition, 1);
      assert.strictEqual(top.isDisqualified, false);
      assert.ok(top.compositeFitScore > 0);

      // Check monotonicity of qualified candidates
      let lastScore = Infinity;
      ranked.forEach((item) => {
        if (!item.isDisqualified) {
          assert.ok(item.compositeFitScore <= lastScore, 'Qualified cases must sort in descending score order');
          lastScore = item.compositeFitScore;
        }
      });

      // Verify disqualified cases appear at the bottom with score 0
      const disqList = ranked.filter(r => r.isDisqualified);
      assert.ok(disqList.length > 0);
      disqList.forEach(d => {
        assert.strictEqual(d.compositeFitScore, 0.0);
        assert.ok(d.disqualificationReason);
      });
    });
  });

  describe('4. Facility KPIs Aggregation & Filtering', () => {
    it('calculateFacilityNbcKpis: accurately aggregates backlog metrics and top ranked candidate', () => {
      const targetSlot = SEED_OPEN_SLOTS[0];
      const ranked = rankCandidatesForSlot(SEED_BACKLOG_CASES, targetSlot);
      const kpis = calculateFacilityNbcKpis(ranked, SEED_BACKLOG_CASES);

      assert.strictEqual(kpis.totalBacklogCount, SEED_BACKLOG_CASES.length);
      assert.ok(kpis.qualifiedCandidatesCount > 0);
      assert.ok(kpis.topRankedFitScore > 0 && kpis.topRankedFitScore <= 100);
      assert.ok(kpis.totalPotentialMargin > 0);
      assert.ok(kpis.avgReadinessPct > 0 && kpis.avgReadinessPct <= 100);
      assert.ok(kpis.avgDurationUtilizationPct > 0);
    });

    it('filterNbcRecommendations: filters by specialty, qualification, status, and search query', () => {
      const targetSlot = SEED_OPEN_SLOTS[0];
      const ranked = rankCandidatesForSlot(SEED_BACKLOG_CASES, targetSlot);

      // Filter by specialty
      const orthoOnly = filterNbcRecommendations(ranked, { specialty: 'ORTHOPEDICS' });
      assert.ok(orthoOnly.length > 0);
      orthoOnly.forEach(r => assert.strictEqual(r.specialtyCode, 'ORTHOPEDICS'));

      // Filter by qualification
      const qualifiedOnly = filterNbcRecommendations(ranked, { qualification: 'QUALIFIED' });
      assert.ok(qualifiedOnly.length > 0);
      qualifiedOnly.forEach(r => assert.strictEqual(r.isDisqualified, false));

      const disqOnly = filterNbcRecommendations(ranked, { qualification: 'DISQUALIFIED' });
      assert.ok(disqOnly.length > 0);
      disqOnly.forEach(r => assert.strictEqual(r.isDisqualified, true));

      // Filter by search query
      const searchRes = filterNbcRecommendations(ranked, { searchQuery: 'Kowalski' });
      assert.ok(searchRes.length > 0);
      searchRes.forEach(r => assert.ok(r.patientName.includes('Kowalski')));
    });
  });

  describe('5. Database Migration 087 Integrity & Multi-Tenancy Governance', () => {
    const upMigrationPath = path.join(rootDir, 'supabase', 'migrations', '087_next_best_case.sql');
    const downMigrationPath = path.join(rootDir, 'supabase', 'migrations', '087_next_best_case_down.sql');

    it('UP migration 087 exists and contains required tables, views, indexes, and RLS policies', () => {
      assert.ok(fs.existsSync(upMigrationPath), '087_next_best_case.sql does not exist');
      const sql = fs.readFileSync(upMigrationPath, 'utf8');

      // Tables
      assert.ok(sql.includes('or_next_best_case_backlog'));
      assert.ok(sql.includes('or_next_best_case_ranking_runs'));
      assert.ok(sql.includes('or_next_best_case_recommendations'));
      assert.ok(sql.includes('or_nbc_scoring_weights'));

      // Views
      assert.ok(sql.includes('vw_or_next_best_case_top_rankings'));
      assert.ok(sql.includes('vw_or_nbc_backlog_readiness_summary'));

      // RLS Multi-tenancy
      assert.ok(sql.includes('or_next_best_case_backlog ENABLE ROW LEVEL SECURITY'));
      assert.ok(sql.includes('or_next_best_case_ranking_runs ENABLE ROW LEVEL SECURITY'));
      assert.ok(sql.includes('or_next_best_case_recommendations ENABLE ROW LEVEL SECURITY'));
      assert.ok(sql.includes("current_setting('app.current_facility_id', true)"));
    });

    it('DOWN migration 087 cleanly drops views, policies, indexes, and tables with CASCADE', () => {
      assert.ok(fs.existsSync(downMigrationPath), '087_next_best_case_down.sql does not exist');
      const downSql = fs.readFileSync(downMigrationPath, 'utf8');

      assert.ok(downSql.includes('vw_or_nbc_backlog_readiness_summary CASCADE'));
      assert.ok(downSql.includes('vw_or_next_best_case_top_rankings CASCADE'));
      assert.ok(downSql.includes('or_next_best_case_recommendations CASCADE'));
      assert.ok(downSql.includes('or_next_best_case_ranking_runs CASCADE'));
      assert.ok(downSql.includes('or_next_best_case_backlog CASCADE'));
    });
  });

  describe('6. Maestro Design System Governance & UI Integration', () => {
    it('NextBestCaseView.jsx and CSS strictly adhere to Zero Purple Rule', () => {
      const jsxPath = path.join(rootDir, 'src', 'components', 'NextBestCaseView.jsx');
      const cssPath = path.join(rootDir, 'src', 'components', 'NextBestCaseView.css');

      assert.ok(fs.existsSync(jsxPath), 'NextBestCaseView.jsx does not exist');
      assert.ok(fs.existsSync(cssPath), 'NextBestCaseView.css does not exist');

      const jsxContent = fs.readFileSync(jsxPath, 'utf8');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      const prohibitedRegex = /\b(purple|violet|indigo|magenta|fuchsia)\b/i;

      assert.strictEqual(
        prohibitedRegex.test(jsxContent),
        false,
        'NextBestCaseView.jsx contains prohibited color tokens'
      );
      assert.strictEqual(
        prohibitedRegex.test(cssContent),
        false,
        'NextBestCaseView.css contains prohibited color tokens'
      );
    });

    it('NextBestCaseView.css enforces pinned non-overlapping flex column modal layout', () => {
      const cssPath = path.join(rootDir, 'src', 'components', 'NextBestCaseView.css');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      assert.ok(cssContent.includes('.nbc-modal-container'));
      assert.ok(cssContent.includes('flex-direction: column'));
      assert.ok(cssContent.includes('overflow: hidden'));
      assert.ok(cssContent.includes('.nbc-modal-header'));
      assert.ok(cssContent.includes('flex-shrink: 0'));
      assert.ok(cssContent.includes('.nbc-modal-body'));
      assert.ok(cssContent.includes('overflow-y: auto'));
      assert.ok(cssContent.includes('.nbc-modal-footer'));
    });

    it('App.jsx properly imports, routes, and renders NextBestCaseView', () => {
      const appPath = path.join(rootDir, 'src', 'App.jsx');
      const appContent = fs.readFileSync(appPath, 'utf8');

      assert.ok(appContent.includes("import NextBestCaseView from './components/NextBestCaseView';"));
      assert.ok(appContent.includes("activeTab === 'next_best_case'"));
      assert.ok(appContent.includes('<NextBestCaseView />'));
      assert.ok(appContent.includes("'next_best_case'"));
    });
  });

});
