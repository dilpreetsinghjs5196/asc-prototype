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
  RELEASE_TRIGGERS,
  RELEASE_REASONS,
  TIMELINESS_STATUSES,
  REALLOCATION_STATUSES,
  DEFAULT_DOWNSTAFFING_HOURLY_RATE,
  calculateLeadTimeHours,
  determineTimelinessStatus,
  calculateDownstaffingSavings,
  calculateReleaseKpis,
  filterReleaseEvents,
  SEED_BLOCK_RELEASES,
  SEED_BLOCK_REALLOCATIONS
} from '../src/services/blockReleaseEventsService.js';

describe('Phase A3 — Block Release Events & Open-Pool Reallocation Engine Test Suite', () => {

  // 1. Taxonomy & Definitions
  describe('1. Block Release Taxonomy & Governance', () => {
    test('should define all 4 authoritative release triggers', () => {
      const keys = Object.keys(RELEASE_TRIGGERS);
      assert.strictEqual(keys.length, 4);
      assert.ok(RELEASE_TRIGGERS.VOLUNTARY_SURGEON);
      assert.ok(RELEASE_TRIGGERS.AUTO_RELEASE_EXPIRATION);
      assert.ok(RELEASE_TRIGGERS.ADMINISTRATIVE_OVERRIDE);
      assert.ok(RELEASE_TRIGGERS.FACILITY_CLOSURE);
    });

    test('should define all 8 clinical and operational release reason codes', () => {
      const keys = Object.keys(RELEASE_REASONS);
      assert.strictEqual(keys.length, 8);
      assert.ok(RELEASE_REASONS.PHYSICIAN_VACATION);
      assert.ok(RELEASE_REASONS.CME_CONFERENCE);
      assert.ok(RELEASE_REASONS.LOW_CASE_VOLUME);
      assert.ok(RELEASE_REASONS.EMERGENCY_MEDICAL_LEAVE);
      assert.ok(RELEASE_REASONS.AUTO_EXPIRATION_UNBOOKED);
      assert.ok(RELEASE_REASONS.FACILITY_MAINTENANCE_CLOSURE);
      assert.ok(RELEASE_REASONS.CHRONIC_UNDERUTILIZATION_OVERRIDE);
      assert.ok(RELEASE_REASONS.OTHER_ADMINISTRATIVE);
    });

    test('should define all 3 timeliness categories and all 5 reallocation statuses', () => {
      const timelinessKeys = Object.keys(TIMELINESS_STATUSES);
      assert.strictEqual(timelinessKeys.length, 3);
      assert.ok(TIMELINESS_STATUSES.ON_TIME);
      assert.ok(TIMELINESS_STATUSES.LATE_RELEASE);
      assert.ok(TIMELINESS_STATUSES.SAME_DAY_RELEASE);

      const reallocKeys = Object.keys(REALLOCATION_STATUSES);
      assert.strictEqual(reallocKeys.length, 5);
      assert.ok(REALLOCATION_STATUSES.OPEN_POOL);
      assert.ok(REALLOCATION_STATUSES.PARTIALLY_REALLOCATED);
      assert.ok(REALLOCATION_STATUSES.FULLY_REALLOCATED);
      assert.ok(REALLOCATION_STATUSES.ROOM_DOWNSTAFFED);
      assert.ok(REALLOCATION_STATUSES.EXPIRED_UNUTILIZED);
    });

    test('should specify standard downstaffing hourly crew rate', () => {
      assert.strictEqual(DEFAULT_DOWNSTAFFING_HOURLY_RATE, 450.00);
    });
  });

  // 2. Deterministic Lead-Time & Timeliness Calculation
  describe('2. Deterministic Lead-Time & Timeliness Algorithms', () => {
    test('calculateLeadTimeHours: accurately calculates notice duration in hours', () => {
      const surgeryDate = '2026-11-20';
      const surgeryStart = '07:00:00';
      // Release exactly 5 days (120 hours) prior at 07:00
      const releaseIso5DaysPrior = '2026-11-15T07:00:00.000Z';
      const hours = calculateLeadTimeHours(surgeryDate, surgeryStart, releaseIso5DaysPrior);
      assert.strictEqual(hours, 120.0);

      // Release 36 hours prior
      const releaseIso36HoursPrior = '2026-11-18T19:00:00.000Z';
      const hours36 = calculateLeadTimeHours(surgeryDate, surgeryStart, releaseIso36HoursPrior);
      assert.strictEqual(hours36, 36.0);

      // Same-day release 4 hours prior
      const releaseIso4HoursPrior = '2026-11-20T03:00:00.000Z';
      const hours4 = calculateLeadTimeHours(surgeryDate, surgeryStart, releaseIso4HoursPrior);
      assert.strictEqual(hours4, 4.0);

      // Negative delta (released after surgery start time) clamps to 0
      const releaseIsoPast = '2026-11-20T08:00:00.000Z';
      const hoursPast = calculateLeadTimeHours(surgeryDate, surgeryStart, releaseIsoPast);
      assert.strictEqual(hoursPast, 0.0);
    });

    test('determineTimelinessStatus: classifies notice into ON_TIME, LATE_RELEASE, SAME_DAY_RELEASE', () => {
      const requiredHours = 120; // 5 days

      // On-time (>= 120 hrs)
      assert.strictEqual(determineTimelinessStatus(120.0, requiredHours), 'ON_TIME');
      assert.strictEqual(determineTimelinessStatus(168.0, requiredHours), 'ON_TIME');

      // Late release (24h <= lead < 120h)
      assert.strictEqual(determineTimelinessStatus(119.9, requiredHours), 'LATE_RELEASE');
      assert.strictEqual(determineTimelinessStatus(48.0, requiredHours), 'LATE_RELEASE');
      assert.strictEqual(determineTimelinessStatus(24.0, requiredHours), 'LATE_RELEASE');

      // Same-day release (< 24h)
      assert.strictEqual(determineTimelinessStatus(23.9, requiredHours), 'SAME_DAY_RELEASE');
      assert.strictEqual(determineTimelinessStatus(4.0, requiredHours), 'SAME_DAY_RELEASE');
      assert.strictEqual(determineTimelinessStatus(0.0, requiredHours), 'SAME_DAY_RELEASE');
    });

    test('calculateDownstaffingSavings: calculates labor savings avoided', () => {
      // 480 minutes (8 hrs) at $450/hr = $3,600.00
      const savings8h = calculateDownstaffingSavings(480, 450);
      assert.strictEqual(savings8h, 3600.00);

      // 240 minutes (4 hrs) at $500/hr = $2,000.00
      const savings4h = calculateDownstaffingSavings(240, 500);
      assert.strictEqual(savings4h, 2000.00);

      // 0 or negative minutes yields $0
      assert.strictEqual(calculateDownstaffingSavings(0, 450), 0);
      assert.strictEqual(calculateDownstaffingSavings(-60, 450), 0);
    });
  });

  // 3. Open Pool Reallocation & Lifecycle Management
  describe('3. Open Pool Reallocation & KPI Metrics', () => {
    test('calculateReleaseKpis: calculates accurate facility KPIs', () => {
      const kpis = calculateReleaseKpis(SEED_BLOCK_RELEASES);

      assert.ok(kpis.totalReleasesCount >= 5);
      assert.ok(kpis.totalReleasedHours > 0);
      assert.ok(kpis.onTimeReleasesCount >= 3);
      assert.ok(kpis.onTimeReleaseRatePct >= 50);
      assert.ok(kpis.totalReallocatedHours > 0);
      assert.ok(kpis.reallocationRatePct > 0);
      assert.ok(kpis.totalDownstaffedSavingsAmount >= 3000);
      assert.ok(kpis.pendingOpenPoolCount >= 1);
    });

    test('filterReleaseEvents: filters releases by room, trigger, timeliness, and search query', () => {
      const all = filterReleaseEvents(SEED_BLOCK_RELEASES);
      assert.strictEqual(all.length, SEED_BLOCK_RELEASES.length);

      // Filter by trigger VOLUNTARY_SURGEON
      const voluntary = filterReleaseEvents(SEED_BLOCK_RELEASES, { releaseTrigger: 'VOLUNTARY_SURGEON' });
      assert.ok(voluntary.length >= 2);
      assert.ok(voluntary.every(r => r.release_trigger === 'VOLUNTARY_SURGEON'));

      // Filter by timeliness ON_TIME
      const onTime = filterReleaseEvents(SEED_BLOCK_RELEASES, { timelinessStatus: 'ON_TIME' });
      assert.ok(onTime.length >= 3);
      assert.ok(onTime.every(r => r.timeliness_status === 'ON_TIME'));

      // Filter by text search
      const searched = filterReleaseEvents(SEED_BLOCK_RELEASES, { search: 'Marcus Vance' });
      assert.ok(searched.length >= 1);
      assert.strictEqual(searched[0].original_owner_name, 'Dr. Marcus Vance, MD');
    });
  });

  // 4. Database Migration SQL Integrity (080)
  describe('4. Database Migration SQL Integrity (080)', () => {
    test('forward migration 080 exists with core tables, views, indexes, and RLS', () => {
      const upPath = path.join(ROOT_DIR, 'supabase', 'migrations', '080_block_release_events.sql');
      assert.ok(fs.existsSync(upPath), '080_block_release_events.sql must exist');

      const sql = fs.readFileSync(upPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.or_block_release_events'));
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.or_block_reallocations'));
      assert.ok(sql.includes('release_trigger VARCHAR(64)'));
      assert.ok(sql.includes('release_reason_code VARCHAR(64)'));
      assert.ok(sql.includes('timeliness_status VARCHAR(32)'));
      assert.ok(sql.includes('reallocation_status VARCHAR(32)'));
      assert.ok(sql.includes('downstaffed_savings_amount NUMERIC(10, 2)'));
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_or_block_releases_active'));
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_or_block_release_kpis'));
      assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'));
      assert.ok(sql.includes('rls_or_block_release_events_facility'));
      assert.ok(sql.includes('rls_or_block_reallocations_facility'));
    });

    test('down migration 080 cleanly drops all views, policies, indexes, and tables CASCADE', () => {
      const downPath = path.join(ROOT_DIR, 'supabase', 'migrations', '080_block_release_events_down.sql');
      assert.ok(fs.existsSync(downPath), '080_block_release_events_down.sql must exist');

      const sql = fs.readFileSync(downPath, 'utf8');
      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_or_block_release_kpis CASCADE'));
      assert.ok(sql.includes('DROP VIEW IF EXISTS public.vw_or_block_releases_active CASCADE'));
      assert.ok(sql.includes('DROP POLICY IF EXISTS rls_or_block_reallocations_facility ON public.or_block_reallocations'));
      assert.ok(sql.includes('DROP POLICY IF EXISTS rls_or_block_release_events_facility ON public.or_block_release_events'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.or_block_reallocations CASCADE'));
      assert.ok(sql.includes('DROP TABLE IF EXISTS public.or_block_release_events CASCADE'));
    });
  });

  // 5. Maestro Design System Governance & App Wiring
  describe('5. Maestro Design System Governance & App Wiring', () => {
    test('strictly ZERO prohibited tokens in JSX and CSS', () => {
      const jsxPath = path.join(ROOT_DIR, 'src', 'components', 'BlockReleaseEventsView.jsx');
      const cssPath = path.join(ROOT_DIR, 'src', 'components', 'BlockReleaseEventsView.css');

      assert.ok(fs.existsSync(jsxPath), 'BlockReleaseEventsView.jsx must exist');
      assert.ok(fs.existsSync(cssPath), 'BlockReleaseEventsView.css must exist');

      const jsx = fs.readFileSync(jsxPath, 'utf8');
      const css = fs.readFileSync(cssPath, 'utf8');

      // Prohibited tokens regex: purple, violet, indigo, magenta, fuchsia tokens
      const prohibitedRegex = /(purple|violet|indigo|magenta|fuchsia)/i;

      assert.ok(!prohibitedRegex.test(jsx), 'BlockReleaseEventsView.jsx contains prohibited design tokens');
      assert.ok(!prohibitedRegex.test(css), 'BlockReleaseEventsView.css contains prohibited design tokens');
    });

    test('App.jsx correctly imports and registers BlockReleaseEventsView', () => {
      const appPath = path.join(ROOT_DIR, 'src', 'App.jsx');
      const app = fs.readFileSync(appPath, 'utf8');

      assert.ok(app.includes("import BlockReleaseEventsView from './components/BlockReleaseEventsView'"));
      assert.ok(app.includes("activeTab === 'block_releases'"));
      assert.ok(app.includes("<BlockReleaseEventsView />"));
      assert.ok(app.includes("Block Releases & Open Pool"));
      assert.ok(app.includes("Operating Room Block Release & Open Pool Engine"));
    });

    test('Phase A3 master specification documents exist and are complete', () => {
      const localSpecPath = path.join(ROOT_DIR, 'docs', 'phases', 'A3_BLOCK_RELEASE_EVENTS.md');
      const externalSpecPath = 'e:\\medicalAI\\ASCANALYST_All_Modules\\ASCANALYST_MD_SPECS\\Phase_10_OR_Scheduling\\A3_BLOCK_RELEASE_EVENTS.md';

      assert.ok(fs.existsSync(localSpecPath), 'docs/phases/A3_BLOCK_RELEASE_EVENTS.md must exist');
      assert.ok(fs.existsSync(externalSpecPath), 'External spec must exist');

      const specContent = fs.readFileSync(localSpecPath, 'utf8');
      assert.ok(specContent.includes('# A3 BLOCK RELEASE EVENTS'));
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
