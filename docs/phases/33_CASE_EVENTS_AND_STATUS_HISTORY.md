# 33 CASE EVENTS AND STATUS HISTORY SPECIFICATION

## Purpose
Case events, lifecycle event taxonomy, status transitions, actor/source metadata, immutable event ledger, and clinical timeline visualization.

## Scope
- Establish production-grade 1NF normalized Case Events ledger (`public.case_events`).
- Deliver comprehensive event taxonomy covering clinical, operational, administrative, and financial lifecycle events.
- Reconcile and harden Phase 31 Finite State Machine (FSM) status transitions.
- Enforce statement-level append-only immutability and tamper-resistance.
- Guarantee strict organization and facility tenancy isolation via Row Level Security (RLS).
- Ensure foreign-key cascade protection (`ON DELETE RESTRICT`) to prevent accidental destruction of historical case audit trails.
- Provide interactive Case Timeline visualization for clinical coordinators, surgeons, and billers.
- Maintain 100% backward compatibility with existing surgeries, milestones, and audit subsystems.

## Current State vs Target State

### Current State
- `public.surgeries.status` has a check constraint for 10 canonical statuses (`Draft`, `Scheduled`, `Pre-Op`, `In-OR`, `Closing`, `PACU`, `Completed`, `Billed`, `Cancelled`, `Void`).
- `public.fn_validate_case_status_transition()` enforces an FSM trigger on `BEFORE UPDATE OF status ON public.surgeries`.
- `public.audit_logs` captures generic row-level JSON diffs on `surgeries` updates via `fn_audit_log_trigger()`.
- `public.case_milestones` exists for perioperative time markers (`WHEELS_IN_OR`, `SURGICAL_TIMEOUT`, etc.), but currently contains 0 records in production and does not track case lifecycle events.
- **Missing:** There is no dedicated `public.case_events` table tracking first-class business events with `from_status`, `to_status`, actor role, source system, correlation ID, and reason codes.
- **Friction:** Schedulers cannot fast-complete cases without super_admin privileges because `Scheduled -> Completed` is blocked by the trigger.
- **UI Gap:** Schedulers and clinicians have no UI drawer or modal to inspect the chronological history of a specific case.

### Target State
- Every surgery case maintains a chronological, immutable event ledger in `public.case_events`.
- Status changes in `public.surgeries` automatically emit an atomic `STATUS_TRANSITIONED` (or `CASE_COMPLETED`, `CASE_CANCELLED`, `CASE_BILLED`, `CASE_VOIDED`) event in the exact same database transaction via an `AFTER UPDATE OF status` trigger.
- Reschedules, clinical edits, CPT modifications, and financial snapshot creations emit correlated case events.
- Client-side event tampering and deletion are blocked at the database engine level via statement-level immutability triggers and restricted RLS.
- Clinicians, surgeons, and billers can open a dedicated **Case Timeline** drawer in `SurgeryScheduler.jsx` to view the case's entire progression history with time deltas and actor provenance.

## Data Model / Schema (Migration 011)

```sql
CREATE TABLE IF NOT EXISTS public.case_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE RESTRICT,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'CASE_CREATED',
        'STATUS_TRANSITIONED',
        'CASE_RESCHEDULED',
        'CLINICAL_DETAILS_UPDATED',
        'CPT_CODES_CHANGED',
        'PROCEDURE_LINE_UPDATED',
        'FINANCIAL_SNAPSHOT_FROZEN',
        'CASE_CANCELLED',
        'CASE_COMPLETED',
        'CASE_BILLED',
        'CASE_VOIDED',
        'ADMIN_OVERRIDE'
    )),
    from_status TEXT CHECK (from_status IN ('Draft', 'Scheduled', 'Pre-Op', 'In-OR', 'Closing', 'PACU', 'Completed', 'Billed', 'Cancelled', 'Void')),
    to_status TEXT CHECK (to_status IN ('Draft', 'Scheduled', 'Pre-Op', 'In-OR', 'Closing', 'PACU', 'Completed', 'Billed', 'Cancelled', 'Void')),
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_email TEXT,
    actor_role TEXT,
    source TEXT NOT NULL DEFAULT 'UI' CHECK (source IN ('UI', 'API', 'IMPORT', 'AI_AGENT', 'SYSTEM', 'BACKGROUND_JOB')),
    reason_code TEXT,
    reason_text TEXT,
    event_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    correlation_id TEXT,
    case_version INTEGER NOT NULL DEFAULT 1,
    snapshot_id UUID REFERENCES public.surgery_financial_snapshots(id) ON DELETE SET NULL,
    payload JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_case_events_surgery_timeline ON public.case_events(surgery_id, event_timestamp ASC);
CREATE INDEX IF NOT EXISTS idx_case_events_facility_type ON public.case_events(facility_id, event_type, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_case_events_correlation ON public.case_events(correlation_id) WHERE correlation_id IS NOT NULL;
```

## Business Rules & State Transitions

### 1. Canonical Transition Matrix
- `Draft` → `Scheduled`, `Cancelled`
- `Scheduled` → `Pre-Op`, `Completed` (Fast-Complete), `Cancelled`
- `Pre-Op` → `In-OR`, `Cancelled`
- `In-OR` → `Closing`, `PACU`
- `Closing` → `PACU`
- `PACU` → `Completed`
- `Completed` → `Billed`, `Void`
- `Billed` → `Void`
- `Cancelled` → Terminal (no further transitions except Super Admin override)
- `Void` → Terminal (no further transitions except Super Admin override)

### 2. Event Atomicity & Consistency
- All status updates on `public.surgeries` MUST trigger an atomic insert into `public.case_events` via `fn_capture_case_status_event()`.
- Failed surgery updates must never create orphaned success events.
- Immutability trigger `trg_protect_case_events_immutability` blocks `UPDATE`, `DELETE`, and `TRUNCATE` operations on `public.case_events`.

### 3. Actor Provenance & Impersonation Prevention
- Actor identity must be resolved server-side from `auth.uid()` and `auth.jwt()`.
- System/background jobs must use `source = 'SYSTEM'` or `'BACKGROUND_JOB'`.
- Administrative overrides require a documented justification text and record `event_type = 'ADMIN_OVERRIDE'`.

## Permissions & RBAC Matrix

| Role | View Case Events | Record Operational Events | Fast-Complete Cases | Cancel / Void Cases | Admin FSM Override |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `super_admin` | ✅ All Facilities | ✅ | ✅ | ✅ | ✅ Allowed |
| `org_admin` | ✅ Own Org | ✅ | ✅ | ✅ | ✅ Allowed |
| `facility_admin` | ✅ Own Facility | ✅ | ✅ | ✅ | ⚠️ Approval required |
| `clinical_director` / `manager` | ✅ Own Facility | ✅ | ✅ | ✅ | ❌ |
| `surgeon` | ✅ Own Cases | ✅ Own Cases | ❌ | ⚠️ Own Cases only | ❌ |
| `nurse` / `or_circulator` | ✅ Own Facility | ✅ Clinical states | ❌ | ❌ | ❌ |
| `biller` / `cfo` | ✅ Own Facility | ❌ | ❌ | ✅ Void / Billing only | ❌ |
| `compliance_auditor` | ✅ Read-only | ❌ | ❌ | ❌ | ❌ |

## UI / Workflow Requirements

1. **Case Timeline Drawer / Modal (`CaseTimelineModal.jsx`)**:
   - Accessible via row-level action button (Clock icon: "View Case History") on each surgery card in `SurgeryScheduler.jsx`.
   - Visual status progression badges (`Scheduled` → `Pre-Op` → `In-OR` → `PACU` → `Completed`).
   - Detailed event cards featuring timestamp, actor email, effective role, source badge (`UI`, `API`, `SYSTEM`), reason code, and expandable JSON payload diffs.
2. **Fast-Complete Confirmation Dialog**:
   - Replaces abrupt status toggling with an interactive confirmation modal prompting for Actual Start Time, Actual End Time, and completion notes.
3. **Status Form Dropdown Expansion**:
   - Expands `SurgeryScheduler.jsx` status dropdown to include all canonical FSM states including `Billed` and `Void`.

## Dependencies
- Upstream: Phase 24 (`audit_logs` infrastructure, Migration 003 & 004).
- Upstream: Phase 31 (Case Master Schema & FSM trigger, Migration 009).
- Upstream: Phase 32 (Case CPT Procedure Line Items, Migration 010).

## Migration / Rollback Plan
- **Forward Migration**: `supabase/migrations/011_case_events_and_status_history.sql`
  - Creates `public.case_events` with strict check constraints and performance indexes.
  - Refactors `fn_validate_case_status_transition()` to permit controlled fast-completion.
  - Implements `fn_capture_case_status_event()` trigger on `surgeries`.
  - Implements statement-level immutability trigger preventing modification or deletion.
  - Configures tenant-scoped RLS policies.
  - Performs idempotent historical backfill of `CASE_CREATED`, `CASE_SCHEDULED`, and `CASE_COMPLETED` events for existing 234 cases.
- **Rollback Migration**: `supabase/migrations/011_case_events_and_status_history_down.sql`
  - Archives existing `case_events` records into `case_events_archive` prior to dropping to ensure zero data loss.
  - Drops triggers, helper functions, and `case_events` table.
  - Restores pre-011 FSM trigger definition.
