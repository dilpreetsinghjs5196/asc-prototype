# A3 BLOCK RELEASE EVENTS

## Purpose
Authoritative operating room block release event tracking, statutory lead-time calculation, release classification (Voluntary, Auto-Release Expiration, Administrative Override, Facility Closure), open-pool reallocation lifecycle, labor cost downstaffing recovery, and immutable audit provenance.

## Scope
- Define production requirements for operating room block releases and reallocation.
- Preserve backward and forward architectural compatibility with Module 10 (`operating_rooms`, `room_staffing_windows`, `or_block_definitions`).
- Implement deterministic rules for lead-time compliance, penalty classification, downstaffing labor savings, and reallocation tracking.
- Enforce strict organization and facility multi-tenancy with PostgreSQL Row Level Security (RLS) via `current_setting('app.current_facility_id', true)::uuid`.
- Provide audit-compliant state transitions, REST service contracts, clinical Maestro UI views, and an automated test suite.

---

## Current State

Before Phase A3, block schedules were defined as static recurring shifts (Phase A2) and physical rooms were configured (Phase A0/A1), but no automated mechanism existed to capture single-date cancellations, auto-release lead-time triggers, or reallocation into open surgical time:

| Component / Artifact | Current Status | Classification | Gap & Remedy |
| :--- | :--- | :---: | :--- |
| `public.or_block_definitions` | Active (Migration 079) | **KEEP** | Provides master recurring blocks, owner hierarchy, and `auto_release_lead_days` / `auto_release_lead_hours` parameters. |
| `public.room_staffing_windows` | Active (Migration 078) | **KEEP** | Provides staffed denominator hours against which released rooms can be downstaffed. |
| `public.or_block_release_events` | Non-existent in DB | **MISSING** | Create dedicated table to record single-date block releases, timestamps, reasons, and reallocation status. |
| `public.or_block_reallocations` | Non-existent in DB | **MISSING** | Create child table tracking which recipient surgeons/cases book released open-pool time. |
| Auto-Release Daemon / Cron | Non-existent | **MISSING** | Implement deterministic lead-time evaluation job identifying unbooked blocks whose notice window has expired. |
| Release Reason Taxonomy | Hardcoded ad-hoc strings | **REPLACE** | Replace with clinical standard taxonomy (`PHYSICIAN_VACATION`, `CME_CONFERENCE`, `LOW_CASE_VOLUME`, `EMERGENCY_LEAVE`, `AUTO_EXPIRATION`, `FACILITY_CLOSURE`, `CHRONIC_UNDERUTILIZATION_OVERRIDE`). |
| Release Timeliness Classification | Uncalculated | **MISSING** | Build deterministic math distinguishing `ON_TIME` ($\ge \text{lead\_hours}$), `LATE` ($24\text{h} \le t < \text{lead\_hours}$), and `SAME_DAY` ($< 24\text{h}$) releases. |
| Open Pool Reallocation Tracking | Manual clipboard/phone calls | **MISSING** | Build centralized open-pool workbench showing available released slots and utilization conversion. |
| Block Release UI & Maestro Views | None | **MISSING** | Author `BlockReleaseEventsView.jsx` with 5-card metric ribbon, visual release timeline, release modal, and open-pool workbench. |

---

## Target State

Phase A3 delivers an end-to-end, automated **Block Release & Reallocation Engine**:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               BLOCK RELEASE LIFECYCLE                                  │
├──────────────────────────┬─────────────────────────────┬───────────────────────────────┤
│ 1. Release Trigger       │ 2. Timeliness Engine        │ 3. Open Pool Reallocation     │
├──────────────────────────┼─────────────────────────────┼───────────────────────────────┤
│ • Voluntary Surgeon      │ Δt = surgery_date - release │ • RELEASED_OPEN_POOL          │
│ • Auto-Release Expiration│ If Δt ≥ lead_hours:         │   → Assigned to Add-on Case   │
│ • Administrative Override│   ON_TIME (No penalty)      │   → FULLY_REALLOCATED (100%)  │
│ • Facility Closure       │ If 24h ≤ Δt < lead_hours:   │   → PARTIALLY_REALLOCATED     │
│                          │   LATE (Penalty flagged)    │ • Unassigned:                 │
│                          │ If Δt < 24h:                │   → ROOM_DOWNSTAFFED          │
│                          │   SAME_DAY (Severe penalty) │   → Labor Savings Recorded    │
└──────────────────────────┴─────────────────────────────┴───────────────────────────────┘
```

1. **Deterministic Timeliness & SLA Engine:** Calculates the exact lead interval in hours and minutes between release timestamp and surgery start time. Compares against the block definition's statutory `auto_release_lead_hours` (e.g., 120h / 5 days).
2. **Auto-Release Expiration Engine:** Automatically sweeps upcoming recurring blocks; if unbooked by scheduled cases at $T - \text{lead\_hours}$, releases block time into the facility's open pool without requiring manual administrator intervention.
3. **Open-Pool Reallocation Engine:** Tracks every released slot until surgery date. Permits other surgeons to claim blocks for backlog cases. If time remains unclaimed 24h prior, triggers a **Labor Downstaffing Opportunity** to close the room and save nursing/anesthesia hourly wages (\$1,500–\$2,200/hr).
4. **Immutable Audit & Utilization Defense:** Retains who released the block, the exact reason, the timestamp, and whether the release was compliant. This defends the facility against surgeon disputes during Phase A4 annual block allocation governance audits.

---

## Data Model / Schema

### 1. Table: `public.or_block_release_events`
Stores individual single-date release occurrences for defined blocks:

```sql
CREATE TABLE IF NOT EXISTS public.or_block_release_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL,
  block_definition_id UUID NOT NULL REFERENCES public.or_block_definitions(id) ON DELETE CASCADE,
  operating_room_id UUID NOT NULL REFERENCES public.operating_rooms(id) ON DELETE CASCADE,
  surgery_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  released_minutes INTEGER NOT NULL CHECK (released_minutes > 0),
  release_trigger VARCHAR(64) NOT NULL DEFAULT 'VOLUNTARY_SURGEON'
    CHECK (release_trigger IN ('VOLUNTARY_SURGEON', 'AUTO_RELEASE_EXPIRATION', 'ADMINISTRATIVE_OVERRIDE', 'FACILITY_CLOSURE')),
  release_reason_code VARCHAR(64) NOT NULL DEFAULT 'PHYSICIAN_VACATION'
    CHECK (release_reason_code IN (
      'PHYSICIAN_VACATION', 
      'CME_CONFERENCE', 
      'LOW_CASE_VOLUME', 
      'EMERGENCY_MEDICAL_LEAVE', 
      'AUTO_EXPIRATION_UNBOOKED', 
      'FACILITY_MAINTENANCE_CLOSURE', 
      'CHRONIC_UNDERUTILIZATION_OVERRIDE', 
      'OTHER_ADMINISTRATIVE'
    )),
  release_timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  lead_time_hours NUMERIC(7, 2) NOT NULL,
  timeliness_status VARCHAR(32) NOT NULL DEFAULT 'ON_TIME'
    CHECK (timeliness_status IN ('ON_TIME', 'LATE_RELEASE', 'SAME_DAY_RELEASE')),
  reallocation_status VARCHAR(32) NOT NULL DEFAULT 'OPEN_POOL'
    CHECK (reallocation_status IN ('OPEN_POOL', 'PARTIALLY_REALLOCATED', 'FULLY_REALLOCATED', 'ROOM_DOWNSTAFFED', 'EXPIRED_UNUTILIZED')),
  reallocated_minutes INTEGER NOT NULL DEFAULT 0 CHECK (reallocated_minutes >= 0),
  downstaffed_savings_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  released_by_user_id UUID,
  released_by_name VARCHAR(256) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chk_release_time_window CHECK (end_time > start_time),
  CONSTRAINT chk_reallocated_bounds CHECK (reallocated_minutes <= released_minutes)
);
```

### 2. Table: `public.or_block_reallocations`
Captures individual surgeon bookings into released open-pool time:

```sql
CREATE TABLE IF NOT EXISTS public.or_block_reallocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL,
  release_event_id UUID NOT NULL REFERENCES public.or_block_release_events(id) ON DELETE CASCADE,
  recipient_surgeon_id BIGINT REFERENCES public.surgeons(id) ON DELETE SET NULL,
  recipient_surgeon_name VARCHAR(256) NOT NULL,
  specialty_code VARCHAR(64) NOT NULL,
  case_id BIGINT,
  patient_name VARCHAR(256),
  procedure_name VARCHAR(512),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  reallocated_minutes INTEGER NOT NULL CHECK (reallocated_minutes > 0),
  reallocation_timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  reallocated_by_user_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chk_realloc_time_window CHECK (end_time > start_time)
);
```

### 3. Indexes
```sql
CREATE INDEX IF NOT EXISTS idx_obre_facility_date 
  ON public.or_block_release_events (facility_id, surgery_date);

CREATE INDEX IF NOT EXISTS idx_obre_block_def 
  ON public.or_block_release_events (facility_id, block_definition_id);

CREATE INDEX IF NOT EXISTS idx_obre_status 
  ON public.or_block_release_events (facility_id, reallocation_status, timeliness_status);

CREATE INDEX IF NOT EXISTS idx_obreal_release_event 
  ON public.or_block_reallocations (facility_id, release_event_id);
```

### 4. Analytical Views
- **`vw_or_block_releases_active`:** Combines release events with room names, block definition owner names, lead-time variance, and human-readable hours.
- **`vw_or_block_release_kpis`:** Aggregates monthly release volume, On-Time Release %, Open Pool Reallocation %, and cumulative Downstaffed Labor Cost Savings (\$ avoided).

### 5. Row Level Security (RLS)
Both tables enforce strict facility multi-tenancy:
```sql
ALTER TABLE public.or_block_release_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_or_block_release_events_facility ON public.or_block_release_events
  FOR ALL
  USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
  WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

ALTER TABLE public.or_block_reallocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_or_block_reallocations_facility ON public.or_block_reallocations
  FOR ALL
  USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
  WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);
```

---

## Business Rules

### Rule 1: Lead-Time & Timeliness Determination (`ERR_INVALID_LEAD_TIME`)
$$\Delta t_{\text{lead}} = \frac{\text{Timestamp}(\text{surgery\_date}, \text{start\_time}) - \text{release\_timestamp}}{3600}$$
- **`ON_TIME`:** $\Delta t_{\text{lead}} \ge \text{auto\_release\_lead\_hours}$ (e.g. $\ge 120.0\text{ hours}$). Block owner receives credit for early notice; block is exempt from underutilization penalties.
- **`LATE_RELEASE`:** $24.0\text{ hours} \le \Delta t_{\text{lead}} < \text{auto\_release\_lead\_hours}$. Late notice penalty flag attached to owner's annual block governance scorecard in Phase A4.
- **`SAME_DAY_RELEASE`:** $\Delta t_{\text{lead}} < 24.0\text{ hours}$. Severe disruption flag; block minutes charged against owner's denominator as unutilized allocated time.

### Rule 2: Open-Pool Reallocation Bounds (`ERR_REALLOCATION_EXCEEDS_CAPACITY`)
$$\sum \text{reallocated\_minutes} \le \text{released\_minutes}$$
- Reallocating cases into released time updates `reallocated_minutes`.
- Status transitions:
  - If $\text{reallocated\_minutes} = 0$: `OPEN_POOL`.
  - If $0 < \text{reallocated\_minutes} < \text{released\_minutes}$: `PARTIALLY_REALLOCATED`.
  - If $\text{reallocated\_minutes} = \text{released\_minutes}$: `FULLY_REALLOCATED`.

### Rule 3: Downstaffing Labor Cost Avoidance Engine
If unallocated open-pool time remains unbooked within 48 hours of surgery, clinical leadership can execute a **Room Downstaffing Event**:
$$\text{Downstaffed Savings} = \text{Unallocated Released Hours} \times \text{OR Hourly Wage Overhead Rate}$$
- Default ASC Clinical Crew Hourly Rate: **\$450.00 / hour** (1 Circulating RN + 1 Scrub Tech + 0.5 Surgical Assistant + Variable Utility).
- Deducts unstaffed hours from the Phase A1 utilization denominator so the facility's utilization percentage is protected.

### Rule 4: Prohibition on Duplicate Release on Same Date (`ERR_DUPLICATE_BLOCK_RELEASE`)
A block definition cannot have more than one active release event on the same calendar `surgery_date`.

---

## Permissions / Security

| Role | View Releases | Release Block (Voluntary) | Auto-Release (System) | Admin Override Release | Reallocate to New Surgeon | Authorize Downstaffing |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `surgeon` | Own Blocks | Yes (Own Only) | No | No | No | No |
| `scheduler` | All | Yes | No | No | Yes | No |
| `or_director` | All | Yes | Yes | Yes | Yes | Yes |
| `clinical_admin`| All | Yes | Yes | Yes | Yes | Yes |
| `super_admin` | All | Yes | Yes | Yes | Yes | Yes |

*AI Tools and background agents run under `scheduler` or `or_director` RBAC scopes.*

---

## API / Service Requirements

- **`GET /api/or/blocks/releases?surgery_date_from=X&surgery_date_to=Y`**: Lists release events with timeliness and reallocation status.
- **`POST /api/or/blocks/releases`**: Creates a voluntary or administrative release event. Validates non-duplicate date, calculates exact lead-time hours, and updates reallocation status.
- **`POST /api/or/blocks/releases/auto-sweep`**: Server-side batch job checking upcoming blocks within `auto_release_lead_hours`. If case bookings = 0, automatically creates `AUTO_RELEASE_EXPIRATION` records.
- **`POST /api/or/blocks/releases/:id/reallocate`**: Books an add-on surgical case into released time. Enforces `reallocated_minutes <= released_minutes`.
- **`POST /api/or/blocks/releases/:id/downstaff`**: Marks unclaimed block time as downstaffed, calculates labor cost savings, and generates downtime deduction for Phase A1 denominator.

---

## UI / Workflow Requirements

### 1. 5-Card Operational Ribbon
- **Total Released Hours (Month):** Cumulative hours surrendered by surgeons.
- **On-Time Release Rate %:** Percentage of releases meeting the $\ge \text{lead\_hours}$ threshold (Target: $\ge 85\%$).
- **Open Pool Reallocation Rate %:** Percentage of released hours successfully re-booked by add-on cases (Target: $\ge 60\%$).
- **Downstaffed Labor Savings (\$):** Realized clinical staffing savings from closing unbooked rooms.
- **Pending Open Pool Slots:** Number of currently unbooked released time slots available for immediate scheduling.

### 2. Multi-Filter Control Bar
- Search query by surgeon name, practice, or room.
- Release Trigger filter (`ALL`, `VOLUNTARY_SURGEON`, `AUTO_RELEASE_EXPIRATION`, `ADMINISTRATIVE_OVERRIDE`).
- Timeliness filter (`ALL`, `ON_TIME`, `LATE_RELEASE`, `SAME_DAY_RELEASE`).
- Reallocation Status filter (`ALL`, `OPEN_POOL`, `REALLOCATED`, `ROOM_DOWNSTAFFED`).
- Date Range filter.

### 3. Chronological Release Events Ledger
Table displaying: Surgery Date, Room, Block Title, Primary Owner, Release Trigger, Reason Code, Release Timestamp, Lead Time (hours), Timeliness Pill, Reallocation Status, Reallocated Hours, and Actions.

### 4. Interactive Modals
- **Modal 1: "Release Block Allocation":** Select block, surgery date, release trigger, clinical reason code, and optional notes. Live calculation of expected lead-time hours and timeliness badge.
- **Modal 2: "Reallocate Open-Pool Time":** Select recipient surgeon, procedure, time window, and case ID to claim released hours.
- **Modal 3: "Authorize Room Downstaffing":** Closes unbooked room window, calculates hourly labor savings, and updates status to `ROOM_DOWNSTAFFED`.

---

## Audit / Provenance

Every block release and reallocation creates an immutable record capturing:
- `released_by_user_id` and `released_by_name`.
- Exact ISO UTC timestamp of submission.
- Calculated `lead_time_hours` captured at write time (immutable).
- Before/after reallocation state.
- Justification notes for administrative overrides or late releases.

---

## QA / Test Cases

1. **Deterministic Lead-Time Math:**
   - 120 hours notice on 5-day lead block $\rightarrow$ `ON_TIME`.
   - 48 hours notice on 5-day lead block $\rightarrow$ `LATE_RELEASE`.
   - 12 hours notice $\rightarrow$ `SAME_DAY_RELEASE`.
2. **Reallocation Capacity Engine:**
   - 480 min released; book 240 min $\rightarrow$ `PARTIALLY_REALLOCATED` (240 min remaining).
   - Book remaining 240 min $\rightarrow$ `FULLY_REALLOCATED` (0 min remaining).
   - Attempting to book 300 min on 240 min available $\rightarrow$ Throws `ERR_REALLOCATION_EXCEEDS_CAPACITY`.
3. **Downstaffing Labor Savings:**
   - 4 hours unclaimed downstaffed at \$450/hr $\rightarrow$ \$1,800.00 realized labor savings.
4. **Database & RLS Integrity:**
   - Migration 080 UP creates tables, views, indexes, RLS policies.
   - Migration 080 DOWN cleanly drops all objects with CASCADE.
   - RLS strictly isolates records by `facility_id`.
5. **Maestro Design Governance:** Zero prohibited purple/violet/indigo tokens in JSX and CSS; isolated namespaced classes.

---

## Acceptance Criteria
- [x] Master specification authored and synced across `docs/phases/` and `ASCANALYST_All_Modules/`.
- [x] Forward database migration `080_block_release_events.sql` created with RLS and down rollback.
- [x] Service layer `src/services/blockReleaseEventsService.js` authored with deterministic lead-time math and reallocation state machine.
- [x] React UI `src/components/BlockReleaseEventsView.jsx` and scoped CSS `BlockReleaseEventsView.css` implemented.
- [x] Wired into `src/App.jsx` under `📅 Scheduling` as **"Block Release & Open Pool"**.
- [x] Automated test suite `tests/block-release-events.test.js` passes with 100% pass rate.
- [x] Production build `npm run build` compiles with 0 errors.

---

## Dependencies
- **Upstream:**
  - Phase A0 (`077_operating_room_model.sql`): `public.operating_rooms`
  - Phase A1 (`078_room_staffing_windows.sql`): `public.room_staffing_windows`
  - Phase A2 (`079_block_schedule_model.sql`): `public.or_block_definitions`
- **Downstream:**
  - Phase A4 (`A4_BLOCK_UTILIZATION_METRICS.md`): Block owner scorecard, late release penalties, and right-sizing recommendations.

---

## Definition of Done
A feature is complete only when the data model, deterministic logic, permissions, validation, auditability, automated tests, UI states, documentation, and acceptance criteria are verified and green.

---

## Implementation Notes
- Migration: `supabase/migrations/080_block_release_events.sql` and `080_block_release_events_down.sql`.
- Service layer: `src/services/blockReleaseEventsService.js` and `src/lib/blockReleaseEventsService.js`.
- UI: `src/components/BlockReleaseEventsView.jsx` and `src/components/BlockReleaseEventsView.css`.
- Test suite: `tests/block-release-events.test.js`.
- App wiring: `src/App.jsx` (`activeTab === 'block_releases'`).

