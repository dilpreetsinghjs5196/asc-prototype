/**
 * ==============================================================================
 * Test Suite: board-package-report.test.js
 * Module 17: Enterprise Reporting & Executive Packages (Phase H9)
 * Tests: Telemetry & Board Seal Verification, Facility Alias Resolution,
 *        Config & Trust-Gate/DSCR Bounds Guard, Debt Covenant & EBITDA Math,
 *        Executive Sections & Covenant Matrix, Compiling New Q1 Dossier,
 *        Trust-Gate Blockers + Sequential CFO->Board->Locked Freeze Guard,
 *        Strategic Resolution Vote Note Guard, H0 Dispatch Logging,
 *        Dual Facade Parity, Migration 147 UP/DOWN SQL,
 *        Zero Prohibited Color Tokens, Dark Dropdown + Anti-Clipping CSS & App.jsx.
 * ==============================================================================
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import service, {
  NAPLES_FACILITY_ID,
  normalizeFacilityId,
  computeBpkProvenanceSeal,
  maskBpkSecret,
  evaluateDebtCovenant,
  computeBoardExecutiveMetrics,
  getBpkConfig,
  updateBpkConfig,
  getBpkTelemetry,
  getBpkCovenants,
  getBpkExecutiveSections,
  compileBoardPackageEdition,
  advanceBoardPackageStatus,
  recordBoardResolutionVote,
  dispatchBoardPackageDigest
} from '../src/services/boardPackageReportService.js';

import * as facade from '../src/lib/boardPackageReportService.js';

describe('Phase H9: Quarterly Executive Board Governance Package', () => {

  test('1. Telemetry returns accurate Naples quarterly metrics, trust score, and sha256_bpk_ seal', async () => {
    const telemetry = await getBpkTelemetry(NAPLES_FACILITY_ID);
    assert.ok(telemetry);
    assert.equal(telemetry.facility_id, NAPLES_FACILITY_ID);
    assert.equal(telemetry.latest_package_code, 'BPK-2026-Q4-NAP');
    assert.equal(telemetry.net_revenue_usd, 5580000.00);
    assert.equal(telemetry.ebitda_usd, 1339200.00);
    assert.equal(telemetry.ebitda_margin_pct, 24.00);
    assert.equal(telemetry.dq_trust_score, 94.20);
    assert.equal(telemetry.is_covenant_compliant, true);
    assert.ok(telemetry.latest_sync_seal.startsWith('sha256_bpk_'));
    assert.equal(telemetry.latest_sync_seal.length, 64);
  });

  test('2. Facility UUID alias resolution normalizes strings and objects cleanly', () => {
    assert.equal(normalizeFacilityId('fac-naples-01'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId('naples-surgery-center'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ id: 'fac-naples-01' }), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ uuid: NAPLES_FACILITY_ID }), NAPLES_FACILITY_ID);
  });

  test('3. Config retrieval, masked secret, and invalid trust-floor/DSCR bounds guard', async () => {
    const cfg = await getBpkConfig('fac-naples-01');
    assert.ok(cfg.client_secret_encrypted.startsWith('bpk_sec_****_'));
    assert.equal(maskBpkSecret('raw_bpk_secret_9501'), 'bpk_sec_****_9501');

    await assert.rejects(
      () => updateBpkConfig(NAPLES_FACILITY_ID, { min_dq_trust_score_for_board: 25 }),
      /ERR_BPK_INVALID_CONFIG/
    );
    await assert.rejects(
      () => updateBpkConfig(NAPLES_FACILITY_ID, { min_dscr_covenant: 0 }),
      /ERR_BPK_INVALID_CONFIG/
    );
  });

  test('4. evaluateDebtCovenant handles MIN/MAX comparators cleanly and computeBoardExecutiveMetrics guards zero rev', () => {
    const minOk = evaluateDebtCovenant({ comparator: 'MIN', threshold_value: 1.25, actual_value: 2.10 });
    assert.equal(minOk.compliance_status, 'COMPLIANT');

    const minWatch = evaluateDebtCovenant({ comparator: 'MIN', threshold_value: 2.00, actual_value: 1.85 });
    assert.equal(minWatch.compliance_status, 'WATCH');

    const maxBreach = evaluateDebtCovenant({ comparator: 'MAX', threshold_value: 3.50, actual_value: 4.20 });
    assert.equal(maxBreach.compliance_status, 'BREACH');

    const zeroRev = computeBoardExecutiveMetrics({ net_revenue_usd: 0, ebitda_usd: 0 });
    assert.equal(zeroRev.ebitda_margin_pct, 0.00);
  });

  test('5. Executive sections and bank debt covenant matrices return reconciled Naples data', async () => {
    const secs = await getBpkExecutiveSections(NAPLES_FACILITY_ID, 'bpk-pkg-2026q4');
    assert.equal(secs.length, 4);
    assert.ok(secs.some(s => s.section_code === 'FINANCIAL_PNL'));

    const covs = await getBpkCovenants(NAPLES_FACILITY_ID, 'bpk-pkg-2026q4');
    assert.equal(covs.length, 4);
    assert.ok(covs.every(c => c.compliance_status === 'COMPLIANT'));
  });

  test('6. Compiling a new quarterly Board dossier creates DRAFT snapshot with SHA-256 seal', async () => {
    const compiled = await compileBoardPackageEdition(NAPLES_FACILITY_ID, {
      period_code: '2027-Q1',
      dq_trust_score: 72.00,
      net_revenue_usd: 6000000,
      ebitda_usd: 1500000
    });
    assert.equal(compiled.package.package_status, 'DRAFT');
    assert.equal(compiled.package.ebitda_margin_pct, 25.00);
    assert.ok(compiled.package.sha256_package_seal.startsWith('sha256_bpk_'));
  });

  test('7. Trust gate blocks low-DQ signoff, sequential advancement succeeds, and LOCKED freeze blocks post-lock edits', async () => {
    const lowTrustPkg = await compileBoardPackageEdition(NAPLES_FACILITY_ID, {
      period_code: '2027-Q2',
      dq_trust_score: 68.00
    });
    await assert.rejects(
      () => advanceBoardPackageStatus(NAPLES_FACILITY_ID, lowTrustPkg.package.id, 'CFO_VERIFIED', { notes: 'Attempting early verify' }),
      /ERR_BPK_TRUST_GATE_BLOCKED/
    );

    const readyPkg = await compileBoardPackageEdition(NAPLES_FACILITY_ID, {
      period_code: '2027-Q3',
      dq_trust_score: 94.50
    });

    await assert.rejects(
      () => advanceBoardPackageStatus(NAPLES_FACILITY_ID, readyPkg.package.id, 'BOARD_APPROVED', { notes: 'Skip CFO step' }),
      /ERR_BPK_INVALID_TRANSITION/
    );

    const step1 = await advanceBoardPackageStatus(NAPLES_FACILITY_ID, readyPkg.package.id, 'CFO_VERIFIED', { notes: 'CFO verified Q3 close' });
    assert.equal(step1.package.package_status, 'CFO_VERIFIED');

    const step2 = await advanceBoardPackageStatus(NAPLES_FACILITY_ID, readyPkg.package.id, 'BOARD_APPROVED', { notes: 'Board unanimously approved' });
    assert.equal(step2.package.package_status, 'BOARD_APPROVED');

    const step3 = await advanceBoardPackageStatus(NAPLES_FACILITY_ID, readyPkg.package.id, 'LOCKED_PUBLISHED', { notes: 'Published immutable dossier' });
    assert.equal(step3.package.package_status, 'LOCKED_PUBLISHED');

    await assert.rejects(
      () => advanceBoardPackageStatus(NAPLES_FACILITY_ID, readyPkg.package.id, 'DRAFT', { notes: 'Reopen locked' }),
      /ERR_BPK_LOCKED/
    );
  });

  test('8. recordBoardResolutionVote enforces >=5 char note guard and produces sealed resolution vote', async () => {
    await assert.rejects(
      () => recordBoardResolutionVote(NAPLES_FACILITY_ID, 'bres-2', { vote_outcome: 'APPROVED', notes: 'yes' }),
      /ERR_BPK_NOTE_REQUIRED/
    );

    const res = await recordBoardResolutionVote(NAPLES_FACILITY_ID, 'bres-2', {
      vote_outcome: 'APPROVED',
      notes: 'Board unanimously approved C-Arm buyout using cash reserve.'
    });
    assert.equal(res.vote_outcome, 'APPROVED');
    assert.ok(res.sha256_seal.startsWith('sha256_bpk_'));
  });

  test('9. dispatchBoardPackageDigest creates sealed H0 Board distribution receipt', async () => {
    const dsp = await dispatchBoardPackageDigest(NAPLES_FACILITY_ID, 'bpk-pkg-2026q4');
    assert.ok(dsp.rpt_execution_code.startsWith('RPT-H9-RUN-'));
    assert.equal(dsp.dispatch_status, 'DELIVERED');
    assert.ok(dsp.sha256_sync_seal.startsWith('sha256_bpk_'));
  });

  test('10. Dual facade parity between src/services and src/lib', () => {
    assert.equal(facade.NAPLES_FACILITY_ID, service.NAPLES_FACILITY_ID);
    assert.equal(typeof facade.evaluateDebtCovenant, 'function');
    assert.equal(typeof facade.advanceBoardPackageStatus, 'function');
    assert.equal(typeof facade.compileBoardPackageEdition, 'function');
    assert.equal(computeBpkProvenanceSeal({ a: 1 }), facade.computeBpkProvenanceSeal({ a: 1 }));
  });

  test('11. Migration 147 UP/DOWN SQL files contain required 7 tables, view, RLS, and seeds', () => {
    const upSql = fs.readFileSync(path.resolve('supabase/migrations/147_board_package_report.sql'), 'utf8');
    const downSql = fs.readFileSync(path.resolve('supabase/migrations/147_board_package_report_down.sql'), 'utf8');

    [
      'bpk_configs',
      'bpk_packages',
      'bpk_covenants',
      'bpk_executive_sections',
      'bpk_strategic_resolutions',
      'bpk_signoff_audit',
      'bpk_dispatch_logs',
      'vw_bpk_telemetry',
      'chk_bpk_trust_floor'
    ].forEach(token => {
      assert.ok(upSql.includes(token), `Missing ${token} in 147_board_package_report.sql`);
    });
    assert.ok(upSql.includes('ENABLE ROW LEVEL SECURITY'));
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.bpk_configs CASCADE'));
  });

  test('12. Zero prohibited color tokens, dark dropdown + anti-clipping CSS, browser-safe crypto & App.jsx wiring', () => {
    const filesToInspect = [
      'src/services/boardPackageReportService.js',
      'src/components/BoardPackageReportView.jsx',
      'src/components/BoardPackageReportView.css'
    ];
    const forbidden = /\b(purple|violet|indigo|magenta|fuchsia)\b/i;

    filesToInspect.forEach(file => {
      const content = fs.readFileSync(path.resolve(file), 'utf8');
      assert.equal(forbidden.test(content), false, `Found forbidden color token in ${file}`);
      assert.equal(content.includes("from 'crypto'"), false, `Found unsafe Node crypto import in ${file}`);
    });

    const css = fs.readFileSync(path.resolve('src/components/BoardPackageReportView.css'), 'utf8');
    assert.ok(css.includes('[data-theme="dark"] .bpk-select option'));
    assert.ok(css.includes('minmax(0, 1.45fr)'));

    const appJsx = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8');
    assert.ok(appJsx.includes('BoardPackageReportView'));
    assert.ok(appJsx.includes("activeTab === 'board_package_report'"));
  });
});
