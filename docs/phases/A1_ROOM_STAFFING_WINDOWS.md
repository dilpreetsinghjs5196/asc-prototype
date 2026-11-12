# A1 ROOM STAFFING WINDOWS
# Phase A1: Room Staffing Windows, Closures & Denominator Rules

> **Document Type:** Production Engineering & Business Logic Specification  
> **Repository:** `asc-prototype/docs/phases/A1_ROOM_STAFFING_WINDOWS.md`  
> **Module:** Module 10: OR Scheduling & Utilization Optimization  
> **Architecture Level:** Phase A1 (Operational Capacity, Staffed Windows & Utilization Denominator Engine)  
> **Tenancy:** Enforced Organization & Facility RLS (`app.current_facility_id`)  
> **Design System:** Maestro Clinical (Strictly Compliant Palette — Zero Prohibited Tokens)

---

## 1. Document Control & Metadata

| Field | Value |
| :--- | :--- |
| **Feature Name** | Room Staffing Windows, Scheduled Closures & Denominator Rule Engine |
| **Module** | Module 10: OR Scheduling & Utilization Optimization |
| **Phase Index** | Phase A1 |
| **Upstream Dependencies** | Phase 21 (Facility Tenancy), Phase 22 (RBAC), Phase 36 (Staff & Provider Model), Phase 73 (Facility Financial Settings), Phase A0 (Operating Room Model) |
| **Downstream Consumers** | Phase A2 (Block Schedule Model), Phase A4 (OR Utilization Metrics), Phase A5 (Block Utilization Metrics), Phase A9 (Recoverable Capacity), Phase A11 (Scheduling Optimizer CP-SAT) |
| **Author** | Lead Perioperative Systems Architect & Surgical Economics Governance |
| **Reviewer** | ASC Perioperative Executive Board & Director of Nursing (DON) |
| **Effective Date** | Post-Phase A0 Integration |

---

## Purpose
Authoritative Operating Room staffing windows, recurring operational shifts, planned room closures, ad-hoc staffing exceptions, and the deterministic **Net Staffed Denominator Engine** for Ambulatory Surgery Centers (ASCs).

In surgical economics and perioperative analytics, Operating Room Utilization is formally calculated as:
$$\text{OR Utilization} = \frac{\text{Actual Surgical Case Time} + \text{Turnover Time}}{\text{Staffed Available Capacity (The Denominator)}}$$

The **Denominator Rule** is the single most critical, contentious, and audited metric in surgical facility operations:
- If calculated against 24 hours or nominal open hours without accounting for whether an OR is actually staffed with a licensed perioperative team (Circulating RN + Surgical Technologist), utilization appears artificially depressed (e.g. 15–25%), falsely signaling excess capacity.
- If an OR is scheduled to be staffed from 07:00 to 15:30 (510 minutes), but cases routinely spill into unstaffed overtime windows (15:30–18:00), the facility experiences severe staffing burnout, overtime wage surges (1.5x–2.0x hourly burden), and distorted utilization numbers.
- If facility holidays, deep cleaning maintenance cycles, or physician retreats close a room, those hours must be deterministically deducted from the utilization denominator so that surgical departments are not penalized for planned facility closures.

Phase A1 establishes the authoritative data model and deterministic mathematical rules governing **Gross Staffed Windows**, **Closure Events**, **Overtime Exceptions**, and **Net Available Capacity Minutes**.

---

## Scope
- Define production requirements for operating room recurring day-of-week staffing windows, core clinical staffing complements, and effective date intervals.
- Establish the data model for:
  1. `room_staffing_windows`: Recurring weekly operating shifts per room (Day-of-Week 0–6, start time, end time, gross available minutes, required core RN and scrub tech counts).
  2. `room_closure_events`: Planned room shutdowns (facility holidays, planned bio-cleaning cycles, scheduled HVAC certifications, physician conferences, emergency maintenance).
  3. `room_staffing_exceptions`: Ad-hoc operational adjustments (authorized early starts, planned late-running staffing extensions, emergency partial closures).
- Enforce the authoritative **Net Staffed Denominator Formula**:
  $$\text{Net Staffed Minutes} = \sum \text{Gross Recurring Shift Minutes} - \sum \text{Approved Closure Minutes} + \sum \text{Authorized Exception Minutes}$$
- Differentiate clearly between:
  - **Staffed Operating Capacity (Denominator for Utilization)**: Rooms staffed with a complete clinical team ready to receive patients.
  - **Physical Architectural Capacity**: Total theoretical hours the facility building is unlocked (used for facility lease / real estate benchmarking).
  - **Unstaffed Inactive Hours**: Unstaffed room hours explicitly excluded from utilization penalties.
- Provide interactive weekly staffing grids, closure calendars, and an interactive **Denominator Calculator & Simulator** for surgical directors.
- Enforce multi-tenant organization/facility isolation via PostgreSQL Row Level Security (`app.current_facility_id`).
- Strictly comply with the Maestro Clinical Design System: **ZERO prohibited purple/violet/indigo/magenta/fuchsia tokens**.

---

## Current State
Component classification before Phase A1 implementation:

| Component / Artifact | Current Status | Classification | Assessment & Rationale |
| :--- | :---: | :---: | :--- |
| **`Phase A0 Operating Room Model`** | Implemented | **KEEP** | Provides authoritative `operating_rooms` table, rooms, dimensions, table limits, and HVAC classes. |
| **`StaffManagement.jsx`** | Implemented | **KEEP** | Manages human personnel directory (nurses, techs). Does not manage OR operational room time windows or utilization denominators. |
| **`ORBlockSchedule.jsx`** | Implemented (Stub) | **KEEP / REFACTOR** | Displays calendar blocks but assumes a hardcoded 07:00–17:00 day without dynamic staffing window verification. |
| **`room_staffing_windows` table** | Non-existent | **MISSING** | Authoritative table storing recurring room operating shifts per day of week. |
| **`room_closure_events` table** | Non-existent | **MISSING** | Table recording planned shutdowns, holidays, deep cleans, and HVAC downtime. |
| **`room_staffing_exceptions` table** | Non-existent | **MISSING** | Table recording early starts and overtime staffing extensions. |
| **Denominator Engine (`roomStaffingWindowService`)** | Non-existent | **MISSING** | Deterministic calculations resolving net available minutes across arbitrary date ranges. |
| **`RoomStaffingWindowsView.jsx`** | Non-existent | **MISSING** | Maestro Clinical UI managing weekly staffing schedules, closure ledgers, and denominator simulation. |

---

## Target State
1. **Recurring Day-of-Week Staffing Schedules**:
   - Operating rooms define standard staffed windows per day of week (e.g. OR-1: Mon–Thu 07:00–17:00 [600 min], Fri 07:00–15:00 [480 min]; OR-3: Tue/Thu 07:30–16:00 [510 min]).
   - Minimum required clinical crew specified per shift: Circulating RN count (default $\ge 1$), Scrub Technologist count (default $\ge 1$), Anesthesia provider count (default $\ge 1$).
2. **Planned Closures & Maintenance Events**:
   - Structured closure reasons: `FACILITY_HOLIDAY`, `PLANNED_MAINTENANCE`, `HVAC_CERTIFICATION`, `STAFF_TRAINING`, `STAFFING_SHORTAGE`, `RENOVATION`.
   - Supports full-day closures or partial-day shutdown windows with minute-exact denominator deductions.
3. **Authorized Overtime & Early Start Exceptions**:
   - Records supervisor-approved early arrivals (e.g. 06:30 start) or pre-authorized late-running extensions (e.g. extending from 15:30 to 18:00).
   - Dynamically adds verified minutes to the denominator and flags overtime wage burden.
4. **Authoritative Denominator Query Engine**:
   - Server-side and client-side service computing net staffed minutes for any OR across any date range (day, week, month, quarter, fiscal year).
5. **Maestro Clinical UI Workbench**:
   - 5-Card Operational Staffing Ribbon, Weekly OR Staffing Timeline Matrix, Closure & Downtime Log, and Interactive Denominator Simulation Workbench.

---

## Data Model / Schema

### Migration 078: `078_room_staffing_windows.sql`

```sql
-- 1. Table: room_staffing_windows (Recurring Day-of-Week Operating Shifts)
CREATE TABLE IF NOT EXISTS public.room_staffing_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL,
  operating_room_id UUID NOT NULL REFERENCES public.operating_rooms(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday, 1=Monday, ..., 6=Saturday
  shift_name VARCHAR(100) NOT NULL DEFAULT 'Standard Surgical Day',
  start_time TIME NOT NULL DEFAULT '07:00:00',
  end_time TIME NOT NULL DEFAULT '17:00:00',
  gross_staffed_minutes INTEGER NOT NULL CHECK (gross_staffed_minutes > 0),
  circulator_rn_count INTEGER NOT NULL DEFAULT 1 CHECK (circulator_rn_count >= 1),
  scrub_tech_count INTEGER NOT NULL DEFAULT 1 CHECK (scrub_tech_count >= 1),
  anesthesia_provider_count INTEGER NOT NULL DEFAULT 1 CHECK (anesthesia_provider_count >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_end_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_by UUID,
  updated_by UUID,
  CONSTRAINT uq_room_day_shift UNIQUE (operating_room_id, day_of_week, shift_name),
  CONSTRAINT chk_shift_time_window CHECK (end_time > start_time)
);

-- 2. Table: room_closure_events (Planned Shutdowns, Holidays & Downtime)
CREATE TABLE IF NOT EXISTS public.room_closure_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL,
  operating_room_id UUID REFERENCES public.operating_rooms(id) ON DELETE CASCADE, -- NULL indicates facility-wide closure
  closure_date DATE NOT NULL,
  start_time TIME, -- NULL if full-day closure
  end_time TIME,
  closure_type VARCHAR(64) NOT NULL DEFAULT 'FACILITY_HOLIDAY'
    CHECK (closure_type IN ('FACILITY_HOLIDAY', 'PLANNED_MAINTENANCE', 'HVAC_CERTIFICATION', 'STAFF_TRAINING', 'STAFFING_SHORTAGE', 'EMERGENCY_REPAIR')),
  reason TEXT NOT NULL,
  deducted_denominator_minutes INTEGER NOT NULL CHECK (deducted_denominator_minutes > 0),
  is_all_day BOOLEAN NOT NULL DEFAULT TRUE,
  approved_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Table: room_staffing_exceptions (Ad-Hoc Extensions & Schedule Adjustments)
CREATE TABLE IF NOT EXISTS public.room_staffing_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL,
  operating_room_id UUID NOT NULL REFERENCES public.operating_rooms(id) ON DELETE CASCADE,
  exception_date DATE NOT NULL,
  exception_type VARCHAR(64) NOT NULL DEFAULT 'OVERTIME_EXTENSION'
    CHECK (exception_type IN ('EARLY_START', 'OVERTIME_EXTENSION', 'PARTIAL_CLOSURE', 'CREW_AUGMENTATION')),
  adjusted_start_time TIME,
  adjusted_end_time TIME,
  adjustment_minutes INTEGER NOT NULL, -- positive for added time, negative for reduction
  reason TEXT NOT NULL,
  is_overtime_burden BOOLEAN NOT NULL DEFAULT TRUE,
  approved_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rsw_facility_room_day 
  ON public.room_staffing_windows (facility_id, operating_room_id, day_of_week);

CREATE INDEX IF NOT EXISTS idx_rce_facility_date 
  ON public.room_closure_events (facility_id, closure_date);

CREATE INDEX IF NOT EXISTS idx_rse_facility_date 
  ON public.room_staffing_exceptions (facility_id, exception_date);

-- Analytical Views
CREATE OR REPLACE VIEW public.vw_room_staffing_weekly_matrix AS
SELECT 
  w.facility_id,
  r.room_number,
  r.room_name,
  r.suite_designation,
  w.day_of_week,
  w.shift_name,
  w.start_time,
  w.end_time,
  w.gross_staffed_minutes,
  w.circulator_rn_count,
  w.scrub_tech_count,
  w.anesthesia_provider_count
FROM public.room_staffing_windows w
JOIN public.operating_rooms r ON r.id = w.operating_room_id
WHERE w.is_active = TRUE AND r.is_active = TRUE;

CREATE OR REPLACE VIEW public.vw_room_staffed_capacity_summary AS
SELECT 
  facility_id,
  COUNT(DISTINCT operating_room_id) AS staffed_rooms_count,
  SUM(gross_staffed_minutes) AS weekly_gross_staffed_minutes,
  ROUND(SUM(gross_staffed_minutes)::NUMERIC / 60.0, 1) AS weekly_gross_staffed_hours,
  ROUND(AVG(gross_staffed_minutes)::NUMERIC / 60.0, 1) AS avg_daily_shift_hours
FROM public.room_staffing_windows
WHERE is_active = TRUE
GROUP BY facility_id;
```

---

## Business Rules

### 1. Shift Duration & Boundary Validation
- Minimum Shift Duration: A staffed window cannot be less than 120 minutes (2.0 hours).
- Maximum Shift Duration: A standard staffed window cannot exceed 720 minutes (12.0 hours) without an authorized exception.
- End Time must strictly follow Start Time (`end_time > start_time`).
- Core Crew Minimum: Every staffed window must have at least 1 Circulating RN and 1 Surgical Technologist.

### 2. Authoritative Net Staffed Denominator Calculation
For any Operating Room $r$ over a date range $[D_{\text{start}}, D_{\text{end}}]$:
$$\text{Net Staffed Minutes}(r) = \sum_{d \in [D_{\text{start}}, D_{\text{end}}]} \text{GrossShiftMinutes}(r, \text{day\_of\_week}(d)) - \sum \text{ClosureMinutes}(r, d) + \sum \text{ExceptionMinutes}(r, d)$$

- If an all-day closure exists for date $d$, $\text{GrossShiftMinutes}$ is reduced to 0.
- If a partial closure overlaps with the shift, the deducted minutes are capped at the shift duration.
- Overtime extensions add to the denominator only if pre-authorized; unscheduled overruns are classified as "Unstaffed Overtime Drift" and compared against the baseline.

### 3. Utilization Denominator Invariants
- Denominator $\ge 0$: Net staffed minutes can never be negative.
- Closed Room Exclusion: If a room is unstaffed for a given day (no window defined), it contributes 0 minutes to the denominator and does not penalize facility utilization.
- Holiday Facility Rule: A facility-wide closure (`operating_room_id IS NULL`) automatically applies to all rooms in the facility.

---

## Permissions / Security

| Role | View Staffing Windows | Create/Edit Windows | Add Closures | Approve Exceptions | Run Denominator Sim |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Director of Nursing (DON)** | Yes | Yes | Yes | Yes | Yes |
| **OR Manager / Clinical Director** | Yes | Yes | Yes | Yes | Yes |
| **Surgical Scheduler** | Yes | Read-Only | Read-Only | Propose Only | Yes |
| **Charge Nurse** | Yes | Read-Only | Read-Only | Overtime Only | Yes |
| **Surgeon / Staff Provider** | Yes | Read-Only | Read-Only | Read-Only | Yes |
| **Financial Analyst** | Yes | Read-Only | Read-Only | Read-Only | Yes |

---

## API / Service Requirements

Service module: `src/services/roomStaffingWindowService.js` (and `src/lib/roomStaffingWindowService.js`).

### Service Functions:
1. `getStaffingWindows(facilityId, roomId)`: Retrieves recurring shifts filtered by facility and room.
2. `saveStaffingWindow(windowData)`: Validates and persists a recurring day shift.
3. `getRoomClosures(facilityId, startDate, endDate)`: Fetches planned closures.
4. `saveRoomClosure(closureData)`: Persists holiday, maintenance, or training closure.
5. `calculateNetStaffedMinutes(roomId, startDate, endDate, windows, closures, exceptions)`: Computes exact net denominator minutes.
6. `calculateFacilityStaffingKpis(rooms, windows, closures)`: Computes high-level capacity metrics:
   - Total Staffed Hours / Week
   - Active Staffed Rooms
   - Average Daily Shift Length
   - Scheduled Downtime Hours this Month
   - Peak Day Staffed Hours

---

## UI / Workflow Requirements

- **Design System:** Maestro Clinical Design System with strictly zero purple tokens.
- **5-Card Operational Staffing Ribbon:**
  1. *Weekly Staffed Capacity* (e.g. 260.0 Hours / Week).
  2. *Active Staffed Rooms* (e.g. 6 of 6 Rooms Scheduled).
  3. *Avg Daily Shift Length* (e.g. 8.7 Hours / Day).
  4. *Scheduled Downtime (Month)* (e.g. 32.0 Hours planned closures).
  5. *Peak Operating Day* (e.g. Tuesday — 54.0 Total Staffed Hours).
- **Interactive Weekly Schedule Matrix:**
  - Visual matrix showing Operating Rooms (rows) versus Days of Week (columns: Mon, Tue, Wed, Thu, Fri, Sat).
  - Shift cards displaying shift hours, gross minutes, and crew chips (1 RN, 1 Tech, 1 Anesth).
  - One-click click to edit or toggle shift.
- **Closures & Downtime Ledger:**
  - Filterable list of upcoming holidays, HVAC certifications, and training shutdowns.
  - Action button: "+ Log Closure Event".
- **Interactive Denominator Calculator & Simulator:**
  - Date picker allowing schedulers to select a date range (e.g. Current Month).
  - Displays room-by-room breakdown of Gross Hours, Planned Closure Deductions, and Net Available Denominator Minutes.

---

## Audit / Provenance
1. All changes to `room_staffing_windows` record `updated_at` and `updated_by`.
2. Every closure entry and schedule exception records `approved_by_user_id` and reason.
3. Historical utilization calculations retain point-in-time staffing window versions.

---

## QA / Test Cases
- **Unit Tests:**
  - Validates minimum shift duration ($\ge 120$ min) and boundary constraints (`end_time > start_time`).
  - Net denominator correctly subtracts full-day and partial-day closures.
  - Overtime extensions accurately augment denominator minutes.
  - Facility-wide closures properly apply to all rooms.
- **Integration Tests:**
  - Migration 078 UP creates all 3 tables, indexes, views, and RLS policies.
  - Migration 078 DOWN cleanly drops all views and child tables.
- **UI Tests:**
  - Zero prohibited purple tokens in JSX and CSS.
  - Namespaced modal classes (`or-staffing-modal-*`) with isolated white headers.

---

## Acceptance Criteria
- [x] Build passes with zero errors (`npm run build`).
- [x] Lint passes with zero errors.
- [x] Automated test suite `tests/room-staffing-windows.test.js` passes all tests.
- [x] Migration `078_room_staffing_windows.sql` and `078_room_staffing_windows_down.sql` authored with idempotent RLS.
- [x] Service layer provides authoritative net denominator math.
- [x] React component renders weekly matrix, closures ledger, and denominator calculator.
- [x] Registered in `src/App.jsx` under Scheduling navigation.
