import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACTIONABILITY_TIERS,
  RECOVERY_PATHWAYS,
  RECOVERY_STATUSES,
  DEFAULT_CONTRIBUTION_MARGIN_RATE,
  DEFAULT_DOWNSTAFFING_HOURLY_RATE,
  DEFAULT_FACILITY_ID,
  classifySlotActionability,
  calculateRecoverableValue,
  calculateActionabilityRatio,
  calculateFacilityCapacityKpis,
  filterCapacitySlots,
  SEED_CAPACITY_SLOTS,
  SEED_ACTIONABILITY_THRESHOLDS
} from '../src/services/recoverableCapacityService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase A9 — Recoverable Capacity & Opportunity Value Engine Test Suite', () => {

  describe('1. Capacity Taxonomy & Architectural Standards', () => {
    it('should define all 3 operational actionability tiers', () => {
      assert.ok(ACTIONABILITY_TIERS.PRIME_ACTIONABLE_BLOCK);
      assert.ok(ACTIONABILITY_TIERS.MARGINAL_SLOT);
      assert.ok(ACTIONABILITY_TIERS.FRAGMENTED_STRANDED);

      assert.strictEqual(ACTIONABILITY_TIERS.PRIME_ACTIONABLE_BLOCK.badgeClass, 'badge-emerald');
      assert.strictEqual(ACTIONABILITY_TIERS.MARGINAL_SLOT.badgeClass, 'badge-amber');
      assert.strictEqual(ACTIONABILITY_TIERS.FRAGMENTED_STRANDED.badgeClass, 'badge-crimson');
    });

    it('should define all 3 capacity recovery pathways', () => {
      assert.ok(RECOVERY_PATHWAYS.CASE_BACKFILL);
      assert.ok(RECOVERY_PATHWAYS.LABOR_DOWNSTAFFING);
      assert.ok(RECOVERY_PATHWAYS.UNRECOVERABLE_FRAGMENT);

      assert.strictEqual(RECOVERY_PATHWAYS.CASE_BACKFILL.code, 'CASE_BACKFILL');
      assert.strictEqual(RECOVERY_PATHWAYS.LABOR_DOWNSTAFFING.code, 'LABOR_DOWNSTAFFING');
      assert.strictEqual(RECOVERY_PATHWAYS.UNRECOVERABLE_FRAGMENT.code, 'UNRECOVERABLE_FRAGMENT');
    });

    it('should define the 5 capacity recovery workflow lifecycle statuses', () => {
      const statuses = ['IDENTIFIED', 'BACKFILL_PROPOSED', 'DOWNSTAFFING_INITIATED', 'RECOVERED', 'EXPIRED_UNACTIONED'];
      statuses.forEach(st => {
        assert.ok(RECOVERY_STATUSES[st], `Missing status ${st}`);
        assert.strictEqual(RECOVERY_STATUSES[st].code, st);
      });
    });

    it('should define standard financial benchmark defaults', () => {
      assert.strictEqual(DEFAULT_CONTRIBUTION_MARGIN_RATE, 1250.00); // $1,250/hr average surgical margin
      assert.strictEqual(DEFAULT_DOWNSTAFFING_HOURLY_RATE, 175.00);   // $175/hr clinical crew avoided payroll
      assert.strictEqual(DEFAULT_FACILITY_ID, 'f47ac10b-58cc-4372-a567-0e02b2c3d479');
    });
  });

  describe('2. Actionability Classification Algorithm', () => {
    it('should classify slots >= 90m and >= 48h lead-time as PRIME_ACTIONABLE_BLOCK with CASE_BACKFILL', () => {
      const res = classifySlotActionability(240, 72); // 4 hrs, 3 days out
      assert.strictEqual(res.isActionable, true);
      assert.strictEqual(res.actionabilityTier, 'PRIME_ACTIONABLE_BLOCK');
      assert.strictEqual(res.recommendedPathway, 'CASE_BACKFILL');
    });

    it('should classify slots 60–89m or with 24–47h lead-time as MARGINAL_SLOT', () => {
      // 75 mins with 48h lead time
      const res1 = classifySlotActionability(75, 48);
      assert.strictEqual(res1.isActionable, true);
      assert.strictEqual(res1.actionabilityTier, 'MARGINAL_SLOT');
      assert.strictEqual(res1.recommendedPathway, 'LABOR_DOWNSTAFFING');

      // 120 mins but only 36h lead time
      const res2 = classifySlotActionability(120, 36);
      assert.strictEqual(res2.isActionable, true);
      assert.strictEqual(res2.actionabilityTier, 'MARGINAL_SLOT');
      assert.strictEqual(res2.recommendedPathway, 'CASE_BACKFILL');
    });

    it('should classify slots < 60m or < 24h lead-time as FRAGMENTED_STRANDED', () => {
      // 30-minute interval (unviable case length)
      const res1 = classifySlotActionability(30, 96);
      assert.strictEqual(res1.isActionable, false);
      assert.strictEqual(res1.actionabilityTier, 'FRAGMENTED_STRANDED');
      assert.strictEqual(res1.recommendedPathway, 'UNRECOVERABLE_FRAGMENT');

      // 180 mins but only 12h lead time (cannot book elective case or downstaff crew)
      const res2 = classifySlotActionability(180, 12);
      assert.strictEqual(res2.isActionable, false);
      assert.strictEqual(res2.actionabilityTier, 'FRAGMENTED_STRANDED');
      assert.strictEqual(res2.recommendedPathway, 'UNRECOVERABLE_FRAGMENT');
    });

    it('should respect custom specialty thresholds (e.g. Ophthalmology 45m / 24h)', () => {
      // Eye allows 45m with 24h lead-time
      const eyeRes = classifySlotActionability(45, 24, 45, 24);
      assert.strictEqual(eyeRes.isActionable, true);
      assert.strictEqual(eyeRes.actionabilityTier, 'PRIME_ACTIONABLE_BLOCK');
    });
  });

  describe('3. Deterministic Dual Financial Recovery Math', () => {
    it('calculateRecoverableValue: accurately computes Case Backfill margin ($1,250/hr)', () => {
      // 4 hours (240 mins) at $1,250/hr = $5,000.00
      const res = calculateRecoverableValue(240, 'CASE_BACKFILL', 1250, 175);
      assert.strictEqual(res.potentialContributionMargin, 5000.00);
      assert.strictEqual(res.avoidedLaborCost, 700.00); // 4 * 175
      assert.strictEqual(res.netRecoverableValue, 5000.00);
    });

    it('calculateRecoverableValue: accurately computes Crew Downstaffing labor savings ($175/hr)', () => {
      // 3 hours (180 mins) at $175/hr = $525.00
      const res = calculateRecoverableValue(180, 'LABOR_DOWNSTAFFING', 1250, 175);
      assert.strictEqual(res.potentialContributionMargin, 3750.00);
      assert.strictEqual(res.avoidedLaborCost, 525.00);
      assert.strictEqual(res.netRecoverableValue, 525.00);
    });

    it('calculateRecoverableValue: handles zero and edge durations gracefully', () => {
      const res = calculateRecoverableValue(0, 'CASE_BACKFILL');
      assert.strictEqual(res.potentialContributionMargin, 0.00);
      assert.strictEqual(res.avoidedLaborCost, 0.00);
      assert.strictEqual(res.netRecoverableValue, 0.00);
    });
  });

  describe('4. Deterministic Actionability Ratio Math', () => {
    it('calculateActionabilityRatio: accurately computes percentage ratio of actionable to total unused minutes', () => {
      // 18 hrs actionable out of 24 hrs total unused = 75.0%
      const ratio = calculateActionabilityRatio(18 * 60, 24 * 60);
      assert.strictEqual(ratio, 75.0);
    });

    it('calculateActionabilityRatio: handles 0 total minutes safely without NaN or Infinity', () => {
      const ratio = calculateActionabilityRatio(0, 0);
      assert.strictEqual(ratio, 0.0);
    });

    it('calculateActionabilityRatio: caps correctly and handles partial decimals', () => {
      // 100 mins out of 300 mins = 33.3%
      const ratio = calculateActionabilityRatio(100, 300);
      assert.strictEqual(ratio, 33.3);
    });
  });

  describe('5. Facility KPIs Aggregation & Slot Filtering', () => {
    it('calculateFacilityCapacityKpis: aggregates seed slots metrics with mathematical precision', () => {
      const kpis = calculateFacilityCapacityKpis(SEED_CAPACITY_SLOTS);
      assert.strictEqual(kpis.totalSlots, SEED_CAPACITY_SLOTS.length);
      assert.ok(kpis.totalUnusedHours > 0);
      assert.ok(kpis.actionableHours > 0);
      assert.ok(kpis.actionabilityRatioPct > 0 && kpis.actionabilityRatioPct <= 100);
      assert.ok(kpis.fragmentedWastageHours > 0);
      assert.ok(kpis.totalPotentialBackfillMargin > 0);
      assert.ok(kpis.totalPotentialLaborSavings > 0);
      assert.ok(
        Math.abs((kpis.actionableHours + kpis.fragmentedWastageHours) - kpis.totalUnusedHours) <= 0.2,
        'Actionable plus fragmented hours should sum to total unused hours within decimal precision'
      );
    });

    it('filterCapacitySlots: filters by room, actionability, pathway, status, and search query', () => {
      // Filter by room
      const or1Slots = filterCapacitySlots(SEED_CAPACITY_SLOTS, { room: 'or-1' });
      assert.ok(or1Slots.length > 0);
      or1Slots.forEach(s => assert.strictEqual(s.operatingRoomId, 'or-1'));

      // Filter by Actionable Only
      const actionableSlots = filterCapacitySlots(SEED_CAPACITY_SLOTS, { actionability: 'ACTIONABLE' });
      assert.ok(actionableSlots.length > 0);
      actionableSlots.forEach(s => assert.strictEqual(s.isActionable, true));

      // Filter by Pathway
      const downstaffSlots = filterCapacitySlots(SEED_CAPACITY_SLOTS, { pathway: 'LABOR_DOWNSTAFFING' });
      assert.ok(downstaffSlots.length > 0);
      downstaffSlots.forEach(s => assert.strictEqual(s.recoveryPathway, 'LABOR_DOWNSTAFFING'));

      // Search Query
      const searchRes = filterCapacitySlots(SEED_CAPACITY_SLOTS, { searchQuery: 'Ophthalmology' });
      assert.ok(searchRes.length > 0);
      searchRes.forEach(s => {
        const matches = s.roomName.includes('Ophthalmology') || s.assignedSpecialtyCode.includes('OPHTHALMOLOGY');
        assert.ok(matches);
      });
    });
  });

  describe('6. Database Migration 086 Integrity & Multi-Tenancy Governance', () => {
    const upMigrationPath = path.join(rootDir, 'supabase', 'migrations', '086_recoverable_capacity.sql');
    const downMigrationPath = path.join(rootDir, 'supabase', 'migrations', '086_recoverable_capacity_down.sql');

    it('UP migration 086 exists and contains required tables, views, indexes, and RLS policies', () => {
      assert.ok(fs.existsSync(upMigrationPath), '086_recoverable_capacity.sql does not exist');
      const sql = fs.readFileSync(upMigrationPath, 'utf8');

      // Tables
      assert.ok(sql.includes('or_recoverable_capacity_slots'));
      assert.ok(sql.includes('or_capacity_actionability_thresholds'));

      // Views
      assert.ok(sql.includes('vw_or_recoverable_capacity_facility_summary'));
      assert.ok(sql.includes('vw_or_actionable_slots_horizon'));

      // RLS Multi-tenancy check
      assert.ok(sql.includes('ALTER TABLE public.or_recoverable_capacity_slots ENABLE ROW LEVEL SECURITY') || sql.includes('or_recoverable_capacity_slots ENABLE ROW LEVEL SECURITY'));
      assert.ok(sql.includes('ALTER TABLE public.or_capacity_actionability_thresholds ENABLE ROW LEVEL SECURITY') || sql.includes('or_capacity_actionability_thresholds ENABLE ROW LEVEL SECURITY'));
      assert.ok(sql.includes("current_setting('app.current_facility_id', true)"));
    });

    it('DOWN migration 086 cleanly drops views, policies, indexes, and tables with CASCADE', () => {
      assert.ok(fs.existsSync(downMigrationPath), '086_recoverable_capacity_down.sql does not exist');
      const downSql = fs.readFileSync(downMigrationPath, 'utf8');

      assert.ok(downSql.includes('vw_or_actionable_slots_horizon CASCADE'));
      assert.ok(downSql.includes('vw_or_recoverable_capacity_facility_summary CASCADE'));
      assert.ok(downSql.includes('or_recoverable_capacity_slots CASCADE'));
      assert.ok(downSql.includes('or_capacity_actionability_thresholds CASCADE'));
    });
  });

  describe('7. Maestro Design System Governance & UI Integration', () => {
    it('RecoverableCapacityView.jsx and CSS strictly adhere to Zero Purple Rule', () => {
      const jsxPath = path.join(rootDir, 'src', 'components', 'RecoverableCapacityView.jsx');
      const cssPath = path.join(rootDir, 'src', 'components', 'RecoverableCapacityView.css');

      assert.ok(fs.existsSync(jsxPath), 'RecoverableCapacityView.jsx does not exist');
      assert.ok(fs.existsSync(cssPath), 'RecoverableCapacityView.css does not exist');

      const jsxContent = fs.readFileSync(jsxPath, 'utf8');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      const prohibitedRegex = /\b(purple|violet|indigo|magenta|fuchsia)\b/i;

      assert.strictEqual(
        prohibitedRegex.test(jsxContent),
        false,
        'RecoverableCapacityView.jsx contains prohibited color tokens'
      );
      assert.strictEqual(
        prohibitedRegex.test(cssContent),
        false,
        'RecoverableCapacityView.css contains prohibited color tokens'
      );
    });

    it('RecoverableCapacityView.css enforces pinned non-overlapping flex column modal layout', () => {
      const cssPath = path.join(rootDir, 'src', 'components', 'RecoverableCapacityView.css');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      assert.ok(cssContent.includes('.rc-modal-container'));
      assert.ok(cssContent.includes('flex-direction: column'));
      assert.ok(cssContent.includes('overflow: hidden'));
      assert.ok(cssContent.includes('.rc-modal-header'));
      assert.ok(cssContent.includes('flex-shrink: 0'));
      assert.ok(cssContent.includes('.rc-modal-body'));
      assert.ok(cssContent.includes('overflow-y: auto'));
      assert.ok(cssContent.includes('.rc-modal-footer'));
    });

    it('App.jsx properly imports, routes, and renders RecoverableCapacityView', () => {
      const appPath = path.join(rootDir, 'src', 'App.jsx');
      const appContent = fs.readFileSync(appPath, 'utf8');

      assert.ok(appContent.includes("import RecoverableCapacityView from './components/RecoverableCapacityView';"));
      assert.ok(appContent.includes("activeTab === 'recoverable_capacity'"));
      assert.ok(appContent.includes('<RecoverableCapacityView />'));
      assert.ok(appContent.includes("'recoverable_capacity'"));
    });
  });

});
