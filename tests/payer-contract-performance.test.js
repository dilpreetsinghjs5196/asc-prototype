import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  REIMBURSEMENT_METHODOLOGIES,
  RENEGOTIATION_STATUSES,
  NEGOTIATION_PRIORITIES,
  CONTRACT_BENCHMARKS,
  calculateContractYieldPct,
  calculateContractLeakage,
  calculateDaysUntilNoticeCutoff,
  classifyRenegotiationStatus,
  calculateImplantCarveoutRecoveryPct,
  calculatePotentialAnnualUplift,
  calculateNegotiationLeverageScore,
  calculateFacilityContractKpis,
  SEED_PAYER_CONTRACT_PERFORMANCE
} from '../src/services/payerContractPerformanceService.js';

import * as libWrapper from '../src/lib/payerContractPerformanceService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

describe('Phase B4 — Payer Contract Performance Test Suite', () => {
  describe('1. Reimbursement Methodologies & Renegotiation Statuses', () => {
    it('should define canonical reimbursement methodologies', () => {
      const keys = ['FEE_SCHEDULE', 'PERCENT_OF_MEDICARE', 'CASE_RATE', 'PERCENT_OF_CHARGES'];
      keys.forEach(k => {
        assert.ok(REIMBURSEMENT_METHODOLOGIES[k], `Methodology ${k} must exist`);
        assert.equal(REIMBURSEMENT_METHODOLOGIES[k].key, k);
        assert.ok(REIMBURSEMENT_METHODOLOGIES[k].label);
      });
    });

    it('should define renegotiation lifecycle statuses with zero forbidden tokens', () => {
      const statuses = [
        'CRITICAL_RENEWAL_ALERT',
        'RENEGOTIATION_WINDOW_OPEN',
        'MONITORING',
        'IN_ACTIVE_BARGAINING',
        'LOCKED_AUTO_RENEWED'
      ];
      statuses.forEach(stKey => {
        const item = RENEGOTIATION_STATUSES[stKey];
        assert.ok(item, `Status ${stKey} must exist`);
        assert.equal(item.key, stKey);
        const color = item.color.toLowerCase();
        assert.ok(!color.includes('purple') && !color.includes('violet'), `Color for ${stKey} must be clean`);
      });
    });

    it('should define negotiation priority tiers', () => {
      const priorities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
      priorities.forEach(p => {
        assert.ok(NEGOTIATION_PRIORITIES[p], `Priority ${p} must exist`);
        assert.equal(NEGOTIATION_PRIORITIES[p].key, p);
      });
    });

    it('should define authoritative contract benchmarks', () => {
      assert.equal(CONTRACT_BENCHMARKS.MIN_ACCEPTABLE_YIELD_PCT, 95.0);
      assert.equal(CONTRACT_BENCHMARKS.TARGET_IMPLANT_RECOVERY_PCT, 90.0);
      assert.equal(CONTRACT_BENCHMARKS.CRITICAL_RENEWAL_NOTICE_DAYS, 60);
    });
  });

  describe('2. Deterministic Mathematical Calculations', () => {
    it('should calculate contract compliance yield percentage correctly', () => {
      // BCBS: 1,788,500 actual on 1,860,000 expected -> 96.16%
      assert.equal(calculateContractYieldPct(1788500, 1860000), 96.16);
      // Underperforming payer: 1,120,000 actual on 1,280,000 expected -> 87.5%
      assert.equal(calculateContractYieldPct(1120000, 1280000), 87.5);
      // Zero expected allowable edge case
      assert.equal(calculateContractYieldPct(5000, 0), 0.0);
    });

    it('should calculate contractual leakage variance', () => {
      // 1,860,000 expected - 1,788,500 actual = 71,500 deficit
      assert.equal(calculateContractLeakage(1860000, 1788500), 71500.0);
      // If actual exceeds expected, leakage is 0 (no negative deficit)
      assert.equal(calculateContractLeakage(100000, 105000), 0.0);
    });

    it('should calculate days until notice cutoff date', () => {
      const curDate = '2026-11-17';
      // 45 days in future: 2027-01-01
      assert.equal(calculateDaysUntilNoticeCutoff('2027-01-01', curDate), 45);
      // Past deadline: -10 days
      assert.equal(calculateDaysUntilNoticeCutoff('2026-11-07', curDate), -10);
      // Missing target
      assert.equal(calculateDaysUntilNoticeCutoff(null, curDate), 0);
    });

    it('should classify renegotiation status based on notice cutoff days', () => {
      assert.equal(classifyRenegotiationStatus(45), 'CRITICAL_RENEWAL_ALERT');
      assert.equal(classifyRenegotiationStatus(60), 'CRITICAL_RENEWAL_ALERT');
      assert.equal(classifyRenegotiationStatus(90), 'RENEGOTIATION_WINDOW_OPEN');
      assert.equal(classifyRenegotiationStatus(120), 'RENEGOTIATION_WINDOW_OPEN');
      assert.equal(classifyRenegotiationStatus(125), 'MONITORING');
      // Preserved states
      assert.equal(classifyRenegotiationStatus(45, 'IN_ACTIVE_BARGAINING'), 'IN_ACTIVE_BARGAINING');
      assert.equal(classifyRenegotiationStatus(30, 'LOCKED_AUTO_RENEWED'), 'LOCKED_AUTO_RENEWED');
    });

    it('should calculate high-cost implant carve-out recovery percentage', () => {
      // $169,280 recovered on $184,000 spend -> 92.0%
      assert.equal(calculateImplantCarveoutRecoveryPct(169280, 184000), 92.0);
      // Under-recovered: $82,000 on $118,000 spend -> 69.49%
      assert.equal(calculateImplantCarveoutRecoveryPct(82000, 118000), 69.49);
      // Zero spend edge case
      assert.equal(calculateImplantCarveoutRecoveryPct(500, 0), 0.0);
    });

    it('should calculate potential annual revenue uplift from rate adjustment', () => {
      // $1,788,500 allowed * 7.5% uplift -> $134,137.50
      assert.equal(calculatePotentialAnnualUplift(1788500, 7.5), 134137.5);
      // Zero allowed or zero uplift
      assert.equal(calculatePotentialAnnualUplift(0, 5), 0.0);
      assert.equal(calculatePotentialAnnualUplift(500000, 0), 0.0);
    });

    it('should calculate negotiation leverage score within bounded 0-100 range', () => {
      const score = calculateNegotiationLeverageScore(24.5, 3.84, 1980, 45);
      assert.ok(score >= 0 && score <= 100, `Score ${score} must be between 0 and 100`);
      assert.equal(typeof score, 'number');
    });
  });

  describe('3. Facility-Wide KPI Aggregations', () => {
    it('should aggregate facility contract metrics across 8 seed contracts', () => {
      const kpis = calculateFacilityContractKpis(SEED_PAYER_CONTRACT_PERFORMANCE);

      assert.equal(kpis.contractsCount, 8);
      assert.equal(kpis.totalExpectedAllowed, 7035000);
      assert.equal(kpis.totalActualAllowed, 6601200);
      assert.equal(kpis.overallYieldPct, 93.83);
      assert.equal(kpis.totalLeakage, 433800);
      assert.equal(kpis.activeRenewalAlertsCount, 4);
      assert.equal(kpis.totalPotentialAnnualUplift, 478926);
      assert.ok(kpis.avgImplantRecoveryPct > 0);
    });

    it('should safely handle empty contract arrays', () => {
      const emptyKpis = calculateFacilityContractKpis([]);
      assert.equal(emptyKpis.contractsCount, 0);
      assert.equal(emptyKpis.totalExpectedAllowed, 0);
      assert.equal(emptyKpis.totalActualAllowed, 0);
      assert.equal(emptyKpis.overallYieldPct, 0.0);
      assert.equal(emptyKpis.totalLeakage, 0);
    });
  });

  describe('4. Database Migration & Multi-Tenant RLS Security', () => {
    const upMigrationPath = path.join(ROOT_DIR, 'supabase', 'migrations', '093_payer_contract_performance.sql');
    const downMigrationPath = path.join(ROOT_DIR, 'supabase', 'migrations', '093_payer_contract_performance_down.sql');

    it('should have Migration 093 UP file with required schema elements', () => {
      assert.ok(fs.existsSync(upMigrationPath), '093 UP migration must exist');
      const sql = fs.readFileSync(upMigrationPath, 'utf8');

      // Tables
      assert.ok(sql.includes('payer_contract_performance_metrics'), 'Must create payer_contract_performance_metrics');
      assert.ok(sql.includes('payer_contract_cpt_yields'), 'Must create payer_contract_cpt_yields');

      // Analytical Views
      assert.ok(sql.includes('vw_payer_contract_performance_summary'), 'Must create vw_payer_contract_performance_summary');
      assert.ok(sql.includes('vw_contract_renegotiation_pipeline'), 'Must create vw_contract_renegotiation_pipeline');

      // Multi-tenancy RLS
      assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'), 'Must enable RLS');
      assert.ok(sql.includes('app.current_facility_id'), 'Must enforce facility isolation via app.current_facility_id');
    });

    it('should have Migration 093 DOWN file with clean rollback', () => {
      assert.ok(fs.existsSync(downMigrationPath), '093 DOWN migration must exist');
      const sql = fs.readFileSync(downMigrationPath, 'utf8');
      assert.ok(sql.includes('vw_contract_renegotiation_pipeline'), 'Must drop renegotiation pipeline view');
      assert.ok(sql.includes('vw_payer_contract_performance_summary'), 'Must drop summary view');
      assert.ok(sql.includes('payer_contract_cpt_yields'), 'Must drop cpt yields table');
      assert.ok(sql.includes('payer_contract_performance_metrics'), 'Must drop metrics table');
    });
  });

  describe('5. Clinical UI Design & Zero-Purple Compliance', () => {
    const jsxPath = path.join(ROOT_DIR, 'src', 'components', 'PayerContractPerformanceView.jsx');
    const cssPath = path.join(ROOT_DIR, 'src', 'components', 'PayerContractPerformanceView.css');
    const appPath = path.join(ROOT_DIR, 'src', 'App.jsx');

    it('should have PayerContractPerformanceView.jsx strictly free of purple tokens', () => {
      assert.ok(fs.existsSync(jsxPath), 'JSX file must exist');
      const jsx = fs.readFileSync(jsxPath, 'utf8');
      const forbiddenRegex = /purple|violet|fuchsia|magenta|indigo/i;
      assert.ok(!forbiddenRegex.test(jsx), 'Component JSX must NOT contain forbidden purple/violet color tokens');
    });

    it('should have PayerContractPerformanceView.css strictly free of purple tokens', () => {
      assert.ok(fs.existsSync(cssPath), 'CSS file must exist');
      const css = fs.readFileSync(cssPath, 'utf8');
      const forbiddenRegex = /purple|violet|fuchsia|magenta/i;
      assert.ok(!forbiddenRegex.test(css), 'Component CSS must NOT contain forbidden purple tokens');
    });

    it('should implement responsive ribbon grid and scoped pcp- styles', () => {
      const css = fs.readFileSync(cssPath, 'utf8');
      assert.ok(css.includes('.pcp-container'), 'Must have container class');
      assert.ok(css.includes('.pcp-ribbon'), 'Must have ribbon grid class');
      assert.ok(css.includes('repeat(5, minmax(0, 1fr))'), 'Must have 5-card responsive grid');
      assert.ok(css.includes('.pcp-modal-backdrop'), 'Must have modal backdrop');
      assert.ok(css.includes('.pcp-modal-container'), 'Must have modal container');
      assert.ok(css.includes('[data-theme="dark"]'), 'Must support dark mode');
    });

    it('should verify App.jsx has wired the component and tab', () => {
      const app = fs.readFileSync(appPath, 'utf8');
      assert.ok(app.includes("import PayerContractPerformanceView from './components/PayerContractPerformanceView';"), 'Must import view');
      assert.ok(app.includes("activeTab === 'payer_contract_performance'"), 'Must handle payer_contract_performance activeTab');
      assert.ok(app.includes('<PayerContractPerformanceView />'), 'Must render PayerContractPerformanceView');
    });
  });

  describe('6. Library Re-export Facade', () => {
    it('should re-export all essential functions and datasets from lib wrapper', () => {
      assert.ok(typeof libWrapper.calculateContractYieldPct === 'function');
      assert.ok(typeof libWrapper.calculateContractLeakage === 'function');
      assert.ok(typeof libWrapper.calculateDaysUntilNoticeCutoff === 'function');
      assert.ok(typeof libWrapper.classifyRenegotiationStatus === 'function');
      assert.ok(typeof libWrapper.calculateImplantCarveoutRecoveryPct === 'function');
      assert.ok(typeof libWrapper.calculatePotentialAnnualUplift === 'function');
      assert.ok(typeof libWrapper.calculateNegotiationLeverageScore === 'function');
      assert.ok(typeof libWrapper.calculateFacilityContractKpis === 'function');
      assert.ok(Array.isArray(libWrapper.SEED_PAYER_CONTRACT_PERFORMANCE));
      assert.equal(libWrapper.SEED_PAYER_CONTRACT_PERFORMANCE.length, 8);
    });
  });
});
