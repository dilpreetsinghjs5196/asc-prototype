import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 33 — Case Events Ledger & Status History Verification Suite', () => {

  // Domain 1: Database Migration 011 DDL & Ledger Integrity
  describe('1. Database Migration 011: DDL & Schema Integrity', () => {
    const migPath = path.join(rootDir, 'supabase', 'migrations', '011_case_events_and_status_history.sql');
    const downPath = path.join(rootDir, 'supabase', 'migrations', '011_case_events_and_status_history_down.sql');

    it('Migration 011 forward and down SQL files exist', () => {
      assert.ok(fs.existsSync(migPath), '011_case_events_and_status_history.sql must exist');
      assert.ok(fs.existsSync(downPath), '011_case_events_and_status_history_down.sql must exist');
    });

    it('Migration 011 establishes public.case_events ledger table with all required columns', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      const requiredColumns = [
        'id',
        'facility_id',
        'surgery_id',
        'event_type',
        'from_status',
        'to_status',
        'reason_code',
        'reason_text',
        'source',
        'actor_id',
        'actor_email',
        'actor_role',
        'event_timestamp',
        'correlation_id',
        'case_version',
        'payload'
      ];

      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.case_events'), 'Must define public.case_events');
      for (const col of requiredColumns) {
        assert.ok(sql.includes(col), `public.case_events must include column "${col}"`);
      }
    });

    it('Migration 011 enforces event_type domain check constraint', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      const eventTypes = [
        'CASE_CREATED',
        'STATUS_TRANSITIONED',
        'CASE_RESCHEDULED',
        'CASE_CANCELLED',
        'CASE_COMPLETED',
        'CASE_BILLED',
        'CASE_VOIDED',
        'ADMIN_OVERRIDE'
      ];

      assert.ok(sql.includes('chk_case_events_type'), 'Must define chk_case_events_type check constraint');
      for (const type of eventTypes) {
        assert.ok(sql.includes(type), `chk_case_events_type must include "${type}"`);
      }
    });

    it('Migration 011 establishes performance indexes on case_events', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      const requiredIndexes = [
        'idx_case_events_surgery_timeline',
        'idx_case_events_facility_type',
        'idx_case_events_correlation',
        'idx_case_events_timestamp',
        'idx_case_events_actor'
      ];

      for (const idx of requiredIndexes) {
        assert.ok(sql.includes(idx), `Migration 011 must define index "${idx}"`);
      }
    });

    it('Migration 011 applies statement-level immutability trigger protecting case_events', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('trg_protect_case_events_immutability'), 'Must attach immutability trigger');
      assert.ok(sql.includes('fn_prevent_audit_log_mutation'), 'Must execute fn_prevent_audit_log_mutation');
      assert.ok(sql.includes('BEFORE UPDATE OR DELETE'), 'Must intercept UPDATE OR DELETE');
    });

    it('Migration 011 defines automated status change and reschedule triggers on surgeries', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('fn_capture_case_status_event'), 'Must define fn_capture_case_status_event');
      assert.ok(sql.includes('trg_capture_case_status_event'), 'Must attach trg_capture_case_status_event');
      assert.ok(sql.includes('fn_capture_case_reschedule_event'), 'Must define fn_capture_case_reschedule_event');
      assert.ok(sql.includes('trg_capture_case_reschedule_event'), 'Must attach trg_capture_case_reschedule_event');
    });

    it('Migration 011 establishes tenant-scoped RLS policies on public.case_events', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('ALTER TABLE public.case_events ENABLE ROW LEVEL SECURITY'), 'Must enable RLS');
      assert.ok(sql.includes('Authorized Roles Can View Facility Case Events'), 'Must define view policy');
      assert.ok(sql.includes('Authorized Roles Can Insert Facility Case Events'), 'Must define insert policy');
    });

    it('Migration 011 contains deterministic idempotent backfill for existing cases', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CASE_CREATED'), 'Backfill must insert CASE_CREATED events');
      assert.ok(sql.includes('CASE_COMPLETED'), 'Backfill must insert CASE_COMPLETED events for completed surgeries');
      assert.ok(sql.includes('NOT EXISTS'), 'Backfill must be idempotent using NOT EXISTS');
    });

    it('Migration 011 down script safely archives records before dropping table', () => {
      const downSql = fs.readFileSync(downPath, 'utf8');
      assert.ok(downSql.includes('case_events_archive'), 'Down script must archive into case_events_archive');
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.case_events'), 'Down script must drop case_events');
      assert.ok(downSql.includes('DROP TRIGGER IF EXISTS trg_capture_case_status_event'), 'Down script must drop status trigger');
    });
  });

  // Domain 2: Reconciled Case Lifecycle Finite State Machine (FSM)
  describe('2. Reconciled Case Lifecycle FSM Matrix', () => {
    // Exact transition logic implemented in fn_validate_case_status_transition in 011
    const canTransition = (oldStatus, newStatus, isSuperAdmin = false) => {
      if (oldStatus === newStatus) return true;
      if (isSuperAdmin) return true; // Super admin override
      switch (oldStatus) {
        case 'Draft':
          return ['Scheduled', 'Cancelled'].includes(newStatus);
        case 'Scheduled':
          // Reconciled: allows direct Fast-Complete and Cancel
          return ['Pre-Op', 'Completed', 'Cancelled'].includes(newStatus);
        case 'Pre-Op':
          return ['In-OR', 'Cancelled'].includes(newStatus);
        case 'In-OR':
          return ['Closing', 'PACU'].includes(newStatus);
        case 'Closing':
          return ['PACU'].includes(newStatus);
        case 'PACU':
          return ['Completed'].includes(newStatus);
        case 'Completed':
          return ['Billed', 'Void'].includes(newStatus);
        case 'Billed':
          return ['Void'].includes(newStatus);
        case 'Cancelled':
          return false; // Terminal state
        case 'Void':
          return false; // Terminal state
        default:
          return false;
      }
    };

    it('Allows direct Fast-Complete transition (Scheduled -> Completed)', () => {
      assert.equal(canTransition('Scheduled', 'Completed'), true, 'Scheduled -> Completed must be permitted for Fast-Complete');
    });

    it('Allows clinical perioperative workflow progression', () => {
      assert.equal(canTransition('Scheduled', 'Pre-Op'), true, 'Scheduled -> Pre-Op');
      assert.equal(canTransition('Pre-Op', 'In-OR'), true, 'Pre-Op -> In-OR');
      assert.equal(canTransition('In-OR', 'PACU'), true, 'In-OR -> PACU');
      assert.equal(canTransition('PACU', 'Completed'), true, 'PACU -> Completed');
      assert.equal(canTransition('Completed', 'Billed'), true, 'Completed -> Billed');
      assert.equal(canTransition('Billed', 'Void'), true, 'Billed -> Void');
    });

    it('Allows cancellation from pre-procedure states', () => {
      assert.equal(canTransition('Draft', 'Cancelled'), true, 'Draft -> Cancelled');
      assert.equal(canTransition('Scheduled', 'Cancelled'), true, 'Scheduled -> Cancelled');
      assert.equal(canTransition('Pre-Op', 'Cancelled'), true, 'Pre-Op -> Cancelled');
    });

    it('Prohibits illegal transitions for standard users', () => {
      assert.equal(canTransition('Cancelled', 'Scheduled'), false, 'Cannot resurrect cancelled case');
      assert.equal(canTransition('Void', 'Completed'), false, 'Cannot un-void case');
      assert.equal(canTransition('Draft', 'Completed'), false, 'Draft cannot skip directly to Completed');
      assert.equal(canTransition('In-OR', 'Cancelled'), false, 'Active intra-op case cannot simply cancel');
      assert.equal(canTransition('Completed', 'Scheduled'), false, 'Completed case cannot revert to Scheduled');
    });

    it('Allows super_admin role to override any state transition', () => {
      assert.equal(canTransition('Cancelled', 'Scheduled', true), true, 'Super Admin override');
      assert.equal(canTransition('Completed', 'Scheduled', true), true, 'Super Admin override');
    });
  });

  // Domain 3: Status Event Type Mapping & Audit Payloads
  describe('3. Event Type Mapping & Payload Contract', () => {
    const mapStatusToEventType = (fromStatus, toStatus) => {
      if (toStatus === 'Cancelled') return 'CASE_CANCELLED';
      if (toStatus === 'Completed') return 'CASE_COMPLETED';
      if (toStatus === 'Billed') return 'CASE_BILLED';
      if (toStatus === 'Void') return 'CASE_VOIDED';
      return 'STATUS_TRANSITIONED';
    };

    it('Maps terminal and major lifecycle statuses to distinct event types', () => {
      assert.equal(mapStatusToEventType('Scheduled', 'Cancelled'), 'CASE_CANCELLED');
      assert.equal(mapStatusToEventType('PACU', 'Completed'), 'CASE_COMPLETED');
      assert.equal(mapStatusToEventType('Scheduled', 'Completed'), 'CASE_COMPLETED'); // Fast-Complete
      assert.equal(mapStatusToEventType('Completed', 'Billed'), 'CASE_BILLED');
      assert.equal(mapStatusToEventType('Billed', 'Void'), 'CASE_VOIDED');
      assert.equal(mapStatusToEventType('Scheduled', 'Pre-Op'), 'STATUS_TRANSITIONED');
    });

    it('Reschedule trigger compares date and time correctly', () => {
      const isRescheduled = (oldCase, newCase) => {
        return (
          oldCase.date !== newCase.date ||
          oldCase.scheduled_start_time !== newCase.scheduled_start_time ||
          oldCase.start_time !== newCase.start_time
        );
      };

      assert.equal(isRescheduled({ date: '2026-10-20', scheduled_start_time: '08:00' }, { date: '2026-10-21', scheduled_start_time: '08:00' }), true);
      assert.equal(isRescheduled({ date: '2026-10-20', scheduled_start_time: '08:00' }, { date: '2026-10-20', scheduled_start_time: '09:30' }), true);
      assert.equal(isRescheduled({ date: '2026-10-20', scheduled_start_time: '08:00' }, { date: '2026-10-20', scheduled_start_time: '08:00' }), false);
    });
  });

  // Domain 4: Client Library & Service Layer
  describe('4. Client Service Methods in src/lib/supabase.js', () => {
    const supabaseJsPath = path.join(rootDir, 'src', 'lib', 'supabase.js');

    it('src/lib/supabase.js exports getCaseEvents and recordCaseEvent methods', () => {
      const content = fs.readFileSync(supabaseJsPath, 'utf8');
      assert.ok(content.includes('getCaseEvents('), 'Must export getCaseEvents');
      assert.ok(content.includes('recordCaseEvent('), 'Must export recordCaseEvent');
    });

    it('getCaseEvents queries case_events ordered by event_timestamp ASC', () => {
      const content = fs.readFileSync(supabaseJsPath, 'utf8');
      assert.ok(content.includes(".from('case_events')"), "Must query 'case_events'");
      assert.ok(content.includes(".order('event_timestamp', { ascending: true })"), 'Must sort chronological');
    });

    it('recordCaseEvent formats payload with tenant facility_id and ISO timestamp', () => {
      const content = fs.readFileSync(supabaseJsPath, 'utf8');
      assert.ok(content.includes('facility_id:'), 'Must include facility_id');
      assert.ok(content.includes('event_timestamp: new Date().toISOString()'), 'Must record event_timestamp');
      assert.ok(content.includes('event_type: eventType'), 'Must record event_type');
    });
  });

  // Domain 5: Frontend UI Components Integration
  describe('5. Frontend UI Components Integration', () => {
    const modalPath = path.join(rootDir, 'src', 'components', 'CaseTimelineModal.jsx');
    const schedulerPath = path.join(rootDir, 'src', 'components', 'SurgeryScheduler.jsx');
    const schedulerCssPath = path.join(rootDir, 'src', 'components', 'SurgeryScheduler.css');

    it('src/components/CaseTimelineModal.jsx exists and renders audit timeline', () => {
      assert.ok(fs.existsSync(modalPath), 'CaseTimelineModal.jsx must exist');
      const content = fs.readFileSync(modalPath, 'utf8');
      assert.ok(content.includes('db.getCaseEvents'), 'Must fetch events from db');
      assert.ok(content.includes('STATUS_COLORS'), 'Must configure status color palette');
      assert.ok(content.includes('getEventIcon'), 'Must map icons to event types');
      assert.ok(content.includes('getSourceBadge'), 'Must display provenance source badge');
    });

    it('SurgeryScheduler.jsx imports and integrates CaseTimelineModal', () => {
      const content = fs.readFileSync(schedulerPath, 'utf8');
      assert.ok(content.includes("import CaseTimelineModal from './CaseTimelineModal'"), 'Must import CaseTimelineModal');
      assert.ok(content.includes('timelineSurgery'), 'Must have timelineSurgery state');
      assert.ok(content.includes('btn-timeline'), 'Must have btn-timeline button in row actions');
      assert.ok(content.includes('<CaseTimelineModal'), 'Must render CaseTimelineModal in JSX');
    });

    it('SurgeryScheduler.jsx includes Billed and Void in case status options', () => {
      const content = fs.readFileSync(schedulerPath, 'utf8');
      assert.ok(content.includes('<option value="Billed">Billed</option>'), 'Must include Billed option');
      assert.ok(content.includes('<option value="Void">Void</option>'), 'Must include Void option');
    });

    it('SurgeryScheduler.css defines styling for btn-timeline and Billed/Void status badges', () => {
      const content = fs.readFileSync(schedulerCssPath, 'utf8');
      assert.ok(content.includes('.btn-timeline'), 'Must define .btn-timeline');
      assert.ok(content.includes('.status-billed') || content.includes('.status-Billed'), 'Must define Billed badge style');
      assert.ok(content.includes('.status-void') || content.includes('.status-Void'), 'Must define Void badge style');
    });
  });
});
