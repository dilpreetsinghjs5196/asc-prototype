import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Import service layer under test
import {
  OWNER_TYPES,
  RECURRENCE_TYPES,
  DAYS_OF_WEEK,
  CLINICAL_SPECIALTIES,
  DEFAULT_AUTO_RELEASE_LEAD_DAYS,
  DEFAULT_AUTO_RELEASE_LEAD_HOURS,
  DEFAULT_TARGET_UTILIZATION_PCT,
  calculateShiftMinutes,
  formatMinutesToHours,
  recurrencePatternsConflict,
  detectBlockCollisions,
  validateBlockStaffingContainment,
  calculateFacilityBlockKpis,
  filterBlockDefinitions,
  SEED_OR_BLOCKS
} from '../src/services/blockScheduleModelService.js';

import { SEED_STAFFING_WINDOWS } from '../src/services/roomStaffingWindowService.js';

describe('Phase A2 — Block Schedule Model & Allocation Architecture Test Suite', () => {

  // 1. Taxonomy & Definitions
  describe('1. Block Taxonomy & Ownership Governance', () => {
    test('should define all 4 authoritative block ownership tiers', () => {
      const keys = Object.keys(OWNER_TYPES);
      assert.strictEqual(keys.length, 4);
      assert.ok(OWNER_TYPES.INDIVIDUAL_SURGEON);
      assert.ok(OWNER_TYPES.SURGICAL_GROUP);
      assert.ok(OWNER_TYPES.SERVICE_LINE);
      assert.ok(OWNER_TYPES.OPEN_TIME);
    });

    test('should define all 8 recurrence patterns with explicit recurrence rules', () => {
      const keys = Object.keys(RECURRENCE_TYPES);
      assert.strictEqual(keys.length, 8);
      assert.ok(RECURRENCE_TYPES.WEEKLY);
      assert.ok(RECURRENCE_TYPES.EVERY_OTHER_WEEK_A);
      assert.ok(RECURRENCE_TYPES.EVERY_OTHER_WEEK_B);
      assert.ok(RECURRENCE_TYPES.MONTHLY_1ST);
      assert.ok(RECURRENCE_TYPES.MONTHLY_2ND);
      assert.ok(RECURRENCE_TYPES.MONTHLY_3RD);
      assert.ok(RECURRENCE_TYPES.MONTHLY_4TH);
      assert.ok(RECURRENCE_TYPES.ONE_TIME);
    });

    test('should enforce default auto-release lead parameters and target utilization', () => {
      assert.strictEqual(DEFAULT_AUTO_RELEASE_LEAD_DAYS, 5);
      assert.strictEqual(DEFAULT_AUTO_RELEASE_LEAD_HOURS, 120);
      assert.strictEqual(DEFAULT_TARGET_UTILIZATION_PCT, 75.00);
    });

    test('should define all 7 days of the week', () => {
      assert.strictEqual(DAYS_OF_WEEK.length, 7);
      assert.strictEqual(DAYS_OF_WEEK[1].label, 'Monday');
      assert.strictEqual(DAYS_OF_WEEK[5].label, 'Friday');
    });
  });

  // 2. Deterministic Calculation & Collision Engine
  describe('2. Deterministic Time & Collision Algorithms', () => {
    test('calculateShiftMinutes: accurately calculates duration in minutes', () => {
      assert.strictEqual(calculateShiftMinutes('07:00:00', '15:00:00'), 480);
      assert.strictEqual(calculateShiftMinutes('07:30', '14:00'), 390);
      assert.strictEqual(calculateShiftMinutes('08:00', '08:00'), 0);
      assert.strictEqual(calculateShiftMinutes('15:00', '07:00'), 0); // Invalid negative duration
    });

    test('formatMinutesToHours: formats minutes to formatted fractional string', () => {
      assert.strictEqual(formatMinutesToHours(480), '8.0 hrs');
      assert.strictEqual(formatMinutesToHours(450), '7.5 hrs');
      assert.strictEqual(formatMinutesToHours(0), '0.0 hrs');
    });

    test('recurrencePatternsConflict: distinguishes overlapping vs disjoint schedules', () => {
      assert.strictEqual(recurrencePatternsConflict('WEEKLY', 'WEEKLY'), true);
      assert.strictEqual(recurrencePatternsConflict('WEEKLY', 'EVERY_OTHER_WEEK_A'), true);
      // Alternating weeks do not conflict
      assert.strictEqual(recurrencePatternsConflict('EVERY_OTHER_WEEK_A', 'EVERY_OTHER_WEEK_B'), false);
      assert.strictEqual(recurrencePatternsConflict('EVERY_OTHER_WEEK_B', 'EVERY_OTHER_WEEK_A'), false);
      // Different monthly weeks do not conflict
      assert.strictEqual(recurrencePatternsConflict('MONTHLY_1ST', 'MONTHLY_3RD'), false);
      assert.strictEqual(recurrencePatternsConflict('MONTHLY_2ND', 'MONTHLY_2ND'), true);
    });

    test('detectBlockCollisions: flags overlapping time windows on same room and day', () => {
      const existing = [
        {
          id: 'blk-1',
          operating_room_id: 'room-1',
          day_of_week: 1, // Monday
          recurrence_type: 'WEEKLY',
          start_time: '07:00:00',
          end_time: '15:00:00',
          is_active: true,
          block_name: 'Existing Block',
          owner_name: 'Dr. Jones'
        }
      ];

      // Colliding candidate (overlaps 12:00-17:00 in room-1 on Monday)
      const collisionResult = detectBlockCollisions({
        operating_room_id: 'room-1',
        day_of_week: 1,
        recurrence_type: 'WEEKLY',
        start_time: '12:00:00',
        end_time: '17:00:00'
      }, existing);

      assert.strictEqual(collisionResult.hasCollision, true);
      assert.ok(collisionResult.reason.includes('Overlaps with existing block'));

      // Non-colliding: same room and day but disjoint time (15:00-19:00)
      const cleanTimeResult = detectBlockCollisions({
        operating_room_id: 'room-1',
        day_of_week: 1,
        recurrence_type: 'WEEKLY',
        start_time: '15:00:00',
        end_time: '19:00:00'
      }, existing);
      assert.strictEqual(cleanTimeResult.hasCollision, false);

      // Non-colliding: same time but different room
      const diffRoomResult = detectBlockCollisions({
        operating_room_id: 'room-2',
        day_of_week: 1,
        recurrence_type: 'WEEKLY',
        start_time: '07:00:00',
        end_time: '15:00:00'
      }, existing);
      assert.strictEqual(diffRoomResult.hasCollision, false);

      // Non-colliding: same room but different day (Tuesday)
      const diffDayResult = detectBlockCollisions({
        operating_room_id: 'room-1',
        day_of_week: 2,
        recurrence_type: 'WEEKLY',
        start_time: '07:00:00',
        end_time: '15:00:00'
      }, existing);
      assert.strictEqual(diffDayResult.hasCollision, false);
    });

    test('validateBlockStaffingContainment: checks containment within Phase A1 staffing windows', () => {
      const mockStaffing = [
        {
          operating_room_id: 'room-1',
          day_of_week: 1, // Monday
          start_time: '07:00:00',
          end_time: '17:00:00',
          is_active: true,
          planned_minutes: 600
        }
      ];

      // Contained block (07:00 - 15:00 fits inside 07:00 - 17:00)
      const contained = validateBlockStaffingContainment({
        operating_room_id: 'room-1',
        day_of_week: 1,
        start_time: '07:00:00',
        end_time: '15:00:00',
        allocated_minutes: 480
      }, mockStaffing);

      assert.strictEqual(contained.fitsWithinStaffing, true);
      assert.strictEqual(contained.status, 'CONTAINED');
      assert.strictEqual(contained.unstaffedMinutes, 0);

      // Exceeds staffing (ends at 18:00, 60 min overtime)
      const exceeding = validateBlockStaffingContainment({
        operating_room_id: 'room-1',
        day_of_week: 1,
        start_time: '07:00:00',
        end_time: '18:00:00',
        allocated_minutes: 660
      }, mockStaffing);

      assert.strictEqual(exceeding.fitsWithinStaffing, false);
      assert.strictEqual(exceeding.status, 'EXCEEDS_STAFFED_WINDOW');
      assert.strictEqual(exceeding.unstaffedMinutes, 60);

      // Unstaffed day (e.g. Sunday)
      const unstaffed = validateBlockStaffingContainment({
        operating_room_id: 'room-1',
        day_of_week: 0, // Sunday
        start_time: '07:00:00',
        end_time: '15:00:00',
        allocated_minutes: 480
      }, mockStaffing);

      assert.strictEqual(unstaffed.fitsWithinStaffing, false);
      assert.strictEqual(unstaffed.status, 'NO_STAFFED_WINDOW');
    });
  });

  // 3. KPI Metrics & Query Filtering
  describe('3. KPI Metrics & Query Filtering', () => {
    test('calculateFacilityBlockKpis: computes summary metrics accurately', () => {
      const kpis = calculateFacilityBlockKpis(SEED_OR_BLOCKS, SEED_STAFFING_WINDOWS);

      assert.ok(kpis.totalActiveBlocks >= 8);
      assert.ok(kpis.blockedRoomsCount >= 5);
      assert.ok(kpis.uniqueOwnersCount >= 6);
      assert.ok(kpis.totalBlockedHours > 0);
      assert.ok(kpis.blockAllocationRatioPct > 0);
      assert.ok(kpis.avgReleaseLeadDays > 0);
      assert.ok(kpis.avgTargetUtilizationPct >= 70);
    });

    test('filterBlockDefinitions: filters blocks by room, specialty, owner, and search query', () => {
      const all = filterBlockDefinitions(SEED_OR_BLOCKS);
      assert.strictEqual(all.length, SEED_OR_BLOCKS.length);

      // Filter by specialty Orthopedics
      const ortho = filterBlockDefinitions(SEED_OR_BLOCKS, { specialtyCode: 'ORTHOPEDICS' });
      assert.ok(ortho.length >= 2);
      assert.ok(ortho.every(b => b.specialty_code === 'ORTHOPEDICS'));

      // Filter by owner type SURGICAL_GROUP
      const groups = filterBlockDefinitions(SEED_OR_BLOCKS, { ownerType: 'SURGICAL_GROUP' });
      assert.ok(groups.length >= 2);
      assert.ok(groups.every(b => b.owner_type === 'SURGICAL_GROUP'));

      // Filter by text search
      const searched = filterBlockDefinitions(SEED_OR_BLOCKS, { search: 'Marcus Vance' });
      assert.strictEqual(searched.length, 1);
      assert.strictEqual(searched[0].owner_name, 'Dr. Marcus Vance, MD');
    });
  });

  // 4. Migration SQL Integrity
  describe('4. Database Migration SQL Integrity (079)', () => {
    test('forward migration 079 exists with core tables, views, indexes, and RLS', () => {
      const upPath = path.join(ROOT_DIR, 'supabase', 'migrations', '079_block_schedule_model.sql');
      assert.ok(fs.existsSync(upPath), '079_block_schedule_model.sql must exist');

      const sql = fs.readFileSync(upPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.or_block_definitions'));
      assert.ok(sql.includes('owner_type VARCHAR(64)'));
      assert.ok(sql.includes('recurrence_type VARCHAR(64)'));
      assert.ok(sql.includes('allocated_minutes INTEGER NOT NULL'));
      assert.ok(sql.includes('auto_release_lead_days INTEGER NOT NULL'));
      assert.ok(sql.includes('target_utilization_pct NUMERIC(5, 2)'));
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_or_block_definitions_active'));
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_or_block_capacity_summary'));
      assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'));
      assert.ok(sql.includes('rls_or_block_definitions_facility'));
    });

    test('down migration 079 cleanly drops all views, policies, indexes, and tables CASCADE', () => {
      const downPath = path.join(ROOT_DIR, 'supabase', 'migrations', '079_block_schedule_model_down.sql');
      assert.ok(fs.existsSync(downPath), '079_block_schedule_model_down.sql must exist');

      const sql = fs.readFileSync(downPath, 'utf8');
      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_or_block_capacity_summary CASCADE'));
      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_or_block_definitions_active CASCADE'));
      assert.ok(sql.includes('DROP POLICY IF EXISTS rls_or_block_definitions_facility ON public.or_block_definitions'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.or_block_definitions CASCADE'));
    });
  });

  // 5. Maestro Design System Governance & App Wiring
  describe('5. Maestro Design System Governance & App Wiring', () => {
    test('strictly ZERO prohibited tokens in JSX and CSS', () => {
      const jsxPath = path.join(ROOT_DIR, 'src', 'components', 'BlockScheduleModelView.jsx');
      const cssPath = path.join(ROOT_DIR, 'src', 'components', 'BlockScheduleModelView.css');

      assert.ok(fs.existsSync(jsxPath), 'BlockScheduleModelView.jsx must exist');
      assert.ok(fs.existsSync(cssPath), 'BlockScheduleModelView.css must exist');

      const jsx = fs.readFileSync(jsxPath, 'utf8');
      const css = fs.readFileSync(cssPath, 'utf8');

      // Prohibited tokens regex: purple, violet, indigo, magenta, fuchsia tokens
      const prohibitedRegex = /(purple|violet|indigo|magenta|fuchsia)/i;

      assert.ok(!prohibitedRegex.test(jsx), 'BlockScheduleModelView.jsx contains prohibited design tokens');
      assert.ok(!prohibitedRegex.test(css), 'BlockScheduleModelView.css contains prohibited design tokens');
    });

    test('App.jsx correctly imports and registers BlockScheduleModelView', () => {
      const appPath = path.join(ROOT_DIR, 'src', 'App.jsx');
      const app = fs.readFileSync(appPath, 'utf8');

      assert.ok(app.includes("import BlockScheduleModelView from './components/BlockScheduleModelView'"));
      assert.ok(app.includes("activeTab === 'block_schedule'"));
      assert.ok(app.includes("<BlockScheduleModelView />"));
      assert.ok(app.includes("Block Schedule Master"));
    });

    test('Phase A2 master specification documents exist and are complete', () => {
      const localSpecPath = path.join(ROOT_DIR, 'docs', 'phases', 'A2_BLOCK_SCHEDULE_MODEL.md');
      const externalSpecPath = 'e:\\medicalAI\\ASCANALYST_All_Modules\\ASCANALYST_MD_SPECS\\Phase_10_OR_Scheduling\\A2_BLOCK_SCHEDULE_MODEL.md';

      assert.ok(fs.existsSync(localSpecPath), 'docs/phases/A2_BLOCK_SCHEDULE_MODEL.md must exist');
      assert.ok(fs.existsSync(externalSpecPath), 'External spec must exist');

      const specContent = fs.readFileSync(localSpecPath, 'utf8');
      assert.ok(specContent.includes('# A2 BLOCK SCHEDULE MODEL'));
      assert.ok(specContent.includes('## Purpose'));
      assert.ok(specContent.includes('## Scope'));
      assert.ok(specContent.includes('## Current State'));
      assert.ok(specContent.includes('## Target State'));
      assert.ok(specContent.includes('## Data Model / Schema'));
      assert.ok(specContent.includes('## Business Rules'));
      assert.ok(specContent.includes('## Permissions / Security'));
      assert.ok(specContent.includes('## API / Service Requirements'));
      assert.ok(specContent.includes('## UI / Workflow Requirements'));
      assert.ok(specContent.includes('## Audit / Provenance'));
      assert.ok(specContent.includes('## QA / Test Cases'));
      assert.ok(specContent.includes('## Acceptance Criteria'));
    });
  });
});
