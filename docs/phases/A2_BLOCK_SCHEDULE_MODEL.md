# A2 BLOCK SCHEDULE MODEL
# Phase A2: Block Schedule Model & Allocation Architecture

> **Document Type:** Production Engineering & Business Logic Specification  
> **Repository:** `asc-prototype/docs/phases/A2_BLOCK_SCHEDULE_MODEL.md`  
> **Module:** Module 10: OR Scheduling & Utilization Optimization  
> **Architecture Level:** Phase A2 (Block Ownership, Allocation Governance & Recurrence Engine)  
> **Tenancy:** Enforced Organization & Facility RLS (`app.current_facility_id`)  
> **Design System:** Maestro Clinical (Strictly Compliant Palette — Zero Prohibited Tokens)

---

## 1. Document Control & Metadata

| Field | Value |
| :--- | :--- |
| **Feature Name** | Operating Room Block Schedule Model & Allocation Governance |
| **Module** | Module 10: OR Scheduling & Utilization Optimization |
| **Phase Index** | Phase A2 |
| **Upstream Dependencies** | Phase 21 (Facility Tenancy), Phase 22 (RBAC), Phase 35 (Surgeon Model), Phase 36 (Staff & Provider Model), Phase A0 (Operating Room Model), Phase A1 (Room Staffing Windows) |
| **Downstream Consumers** | Phase A3 (Block Release Events), Phase A5 (Block Utilization Metrics), Phase A6 (Booking Accuracy), Phase A9 (Recoverable Capacity), Phase A10 (Next Best Case), Phase A11 (Scheduling Optimizer CP-SAT) |
| **Author** | Lead Perioperative Systems Architect & Surgical Economics Governance |
| **Reviewer** | ASC Medical Executive Committee (MEC) & Perioperative Governance Board |
| **Effective Date** | Post-Phase A1 Integration |

---

## Purpose
Authoritative Operating Room block schedule model, ownership tiers, recurrence patterns, clinical specialty alignment, auto-release lead-time rules, and conflict detection for Ambulatory Surgery Centers (ASCs).

In an ASC, block time is the primary currency of physician alignment and volume commitment:
- High-performing surgeons and surgical group practices commit their surgical volume to the surgery center in exchange for guaranteed, predictable access to dedicated operating suites.
- If blocks are managed loosely—without clear ownership, recurrence rules, or containment within staffed windows—the facility suffers from:
  1. **Block Hoarding**: Surgeons retain reserved OR time without sufficient patient backlog, blocking other productive surgeons from booking cases.
  2. **Unstaffed Overtime Drift**: Blocks scheduled outside active nursing staffing windows force emergency overtime staffing at 1.5x–2.0x wage premiums.
  3. **Specialty Incompatibility**: Allocating a spine surgeon to a room lacking fluoroscopy or laminar flow leads to last-minute room swaps and operational chaos.

Phase A2 establishes the deterministic data model and business logic governing **Block Definitions**, **Ownership Tiers**, **Recurrence Cycles**, **Auto-Release Parameters**, and **Staffing Containment Validation**.

---

## Scope
- Define production requirements for recurring and specific-date OR block allocations.
- Establish the data model for:
  1. `or_block_definitions`: Master block entities defining room, block owner, owner type (`INDIVIDUAL_SURGEON`, `SURGICAL_GROUP`, `SERVICE_LINE`, `OPEN_TIME`), specialty alignment, day of week, recurrence type (`WEEKLY`, `EVERY_OTHER_WEEK_A`, `EVERY_OTHER_WEEK_B`, `MONTHLY_1ST`, `MONTHLY_2ND`, `MONTHLY_3RD`, `MONTHLY_4TH`, `ONE_TIME`), allocated start/end times, auto-release lead days, and target utilization benchmarks.
  2. Conflict detection engine: Evaluates temporal overlaps, room availability, and containment within Phase A1 `room_staffing_windows`.
- Enforce the authoritative **Block Allocation Invariants**:
  1. **Staffing Window Containment:** Blocks must fit within active staffed operating room windows.
  2. **Double-Booking Prevention:** No two active blocks may share the same room and overlapping time interval on the same recurrence cycle.
  3. **Auto-Release Policy:** Every block defines a deterministic release deadline (default 5 business days / 120 hours).
  4. **Target Utilization Standard:** Baseline utilization target (default 75%) required for annual block retention audits.
- Provide interactive weekly block matrices, block utilization ribbons, and an interactive **Block Conflict & Fit Validator**.
- Enforce multi-tenant organization/facility isolation via PostgreSQL Row Level Security (`app.current_facility_id`).
- Strictly comply with the Maestro Clinical Design System: **ZERO prohibited purple/violet/indigo/magenta/fuchsia tokens**.

---

## Current State
Component classification before Phase A2 implementation:

| Component / Artifact | Current Status | Classification | Assessment & Rationale |
| :--- | :---: | :---: | :--- |
| **`Phase A0 Operating Room Model`** | Implemented | **KEEP** | Provides authoritative `operating_rooms` table, rooms, dimensions, table limits, and HVAC classes. |
| **`Phase A1 Room Staffing Windows`** | Implemented | **KEEP** | Provides authoritative staffed shifts, planned closures, and utilization denominator minutes. |
| **`or_block_schedule` table** | Legacy / Fragmented | **KEEP / REFACTOR** | Pre-existing table with basic string columns (`room_name`, `provider_name`). Must be upgraded or supplemented with structured block definitions. |
| **`ORBlockSchedule.jsx`** | Implemented (Stub) | **KEEP / REFACTOR** | Monthly calendar stub. Lacks structured block ownership tiers, recurrence engines, auto-release lead times, and staffing containment. |
| **`or_block_definitions` table** | Non-existent | **MISSING** | Authoritative relational table storing recurring block parameters, ownership types, auto-release lead times, and utilization targets. |
| **Block Conflict Engine (`blockScheduleModelService`)** | Non-existent | **MISSING** | Deterministic calculations resolving calendar instances, detecting overlapping blocks, and verifying staffing window containment. |
| **`BlockScheduleModelView.jsx`** | Non-existent | **MISSING** | Maestro Clinical management workbench for block allocations, weekly timeline grids, and conflict simulation. |

---

## Target State
1. **Authoritative Block Allocation Schema**:
   - `or_block_definitions` captures: block name, room foreign key, owner type (`INDIVIDUAL_SURGEON`, `SURGICAL_GROUP`, `SERVICE_LINE`, `OPEN_TIME`), surgeon foreign key, owner name, clinical specialty, day of week (0–6), recurrence pattern, start/end time, allocated minutes, auto-release lead days/hours, target utilization benchmark (75%), and effective dates.
2. **Deterministic Conflict & Containment Engine**:
   - Verifies that proposed blocks fall within staffed shifts (`room_staffing_windows`).
   - Mathematically detects overlapping block collisions in the same room on the same recurrence cycle.
3. **Structured Auto-Release Lead-Time Rules**:
   - Configures exact statutory notice required (e.g. 5 days prior to surgery date) before unused block time is automatically released to the open booking pool.
4. **Maestro Clinical UI Workbench**:
   - 5-Card Operational Block Ribbon, filterable visual Weekly Block Timeline Grid, Add/Edit Block Modal with isolated styles, and an interactive Conflict Validator.

---

## Data Model / Schema

### Migration 079: `079_block_schedule_model.sql`

```sql
-- 1. Table: or_block_definitions (Master Block Allocations)
CREATE TABLE IF NOT EXISTS public.or_block_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL,
  operating_room_id UUID NOT NULL REFERENCES public.operating_rooms(id) ON DELETE CASCADE,
  block_name VARCHAR(150) NOT NULL,
  owner_type VARCHAR(64) NOT NULL DEFAULT 'INDIVIDUAL_SURGEON'
    CHECK (owner_type IN ('INDIVIDUAL_SURGEON', 'SURGICAL_GROUP', 'SERVICE_LINE', 'OPEN_TIME')),
  surgeon_id BIGINT REFERENCES public.surgeons(id) ON DELETE SET NULL,
  owner_name VARCHAR(256) NOT NULL,
  specialty_code VARCHAR(64) NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  recurrence_type VARCHAR(64) NOT NULL DEFAULT 'WEEKLY'
    CHECK (recurrence_type IN ('WEEKLY', 'EVERY_OTHER_WEEK_A', 'EVERY_OTHER_WEEK_B', 'MONTHLY_1ST', 'MONTHLY_2ND', 'MONTHLY_3RD', 'MONTHLY_4TH', 'ONE_TIME')),
  start_time TIME NOT NULL DEFAULT '07:00:00',
  end_time TIME NOT NULL DEFAULT '15:00:00',
  allocated_minutes INTEGER NOT NULL CHECK (allocated_minutes > 0),
  auto_release_lead_days INTEGER NOT NULL DEFAULT 5 CHECK (auto_release_lead_days >= 0),
  auto_release_lead_hours INTEGER NOT NULL DEFAULT 120 CHECK (auto_release_lead_hours >= 0),
  target_utilization_pct NUMERIC(5, 2) NOT NULL DEFAULT 75.00 CHECK (target_utilization_pct >= 0 AND target_utilization_pct <= 100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_end_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_by UUID,
  updated_by UUID,
  CONSTRAINT chk_block_time_window CHECK (end_time > start_time)
);

-- 2. Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_obd_facility_room_day 
  ON public.or_block_definitions (facility_id, operating_room_id, day_of_week);

CREATE INDEX IF NOT EXISTS idx_obd_facility_owner 
  ON public.or_block_definitions (facility_id, owner_type, surgeon_id);

CREATE INDEX IF NOT EXISTS idx_obd_facility_specialty 
  ON public.or_block_definitions (facility_id, specialty_code);

-- 3. Analytical Views
CREATE OR REPLACE VIEW public.vw_or_block_definitions_active AS
SELECT 
  b.id AS block_id,
  b.facility_id,
  b.operating_room_id,
  r.room_number,
  COALESCE(r.room_name, 'OR ' || r.room_number) AS room_name,
  r.suite_designation,
  b.block_name,
  b.owner_type,
  b.surgeon_id,
  b.owner_name,
  b.specialty_code,
  b.day_of_week,
  b.recurrence_type,
  b.start_time,
  b.end_time,
  b.allocated_minutes,
  ROUND(b.allocated_minutes::NUMERIC / 60.0, 2) AS allocated_hours,
  b.auto_release_lead_days,
  b.auto_release_lead_hours,
  b.target_utilization_pct,
  b.is_active
FROM public.or_block_definitions b
JOIN public.operating_rooms r ON r.id = b.operating_room_id
WHERE b.is_active = TRUE AND r.is_active = TRUE;

CREATE OR REPLACE VIEW public.vw_or_block_capacity_summary AS
SELECT 
  facility_id,
  COUNT(DISTINCT id) AS total_active_blocks,
  COUNT(DISTINCT operating_room_id) AS blocked_rooms_count,
  SUM(allocated_minutes) AS total_blocked_minutes,
  ROUND(SUM(allocated_minutes)::NUMERIC / 60.0, 1) AS total_blocked_hours,
  ROUND(AVG(target_utilization_pct), 1) AS avg_target_utilization_pct,
  COUNT(DISTINCT owner_name) AS unique_owners_count
FROM public.or_block_definitions
WHERE is_active = TRUE
GROUP BY facility_id;
```

---

## Business Rules

### 1. Staffing Window Containment Invariant
A block allocation must fall entirely within the room's active staffing window for that day of week (from Phase A1 `room_staffing_windows`):
- `block.start_time >= window.start_time`
- `block.end_time <= window.end_time`
- Violation: Triggers warning `WARN_BLOCK_EXTENDS_BEYOND_STAFFED_WINDOW` requiring supervisor overtime approval.

### 2. Double-Booking Prevention Invariant
Two blocks cannot occupy the same operating room at the same time on the same recurrence cycle:
$$\text{Block}_A \cap \text{Block}_B = \emptyset \quad \text{if } \text{room}_A = \text{room}_B \land \text{day}_A = \text{day}_B \land \text{cycle}_A = \text{cycle}_B$$
- If an overlap is detected during save, the engine rejects the transaction with code `ERR_BLOCK_COLLISION`.

### 3. Auto-Release Lead-Time Governance
- Every block specifies an auto-release window in business days (default 5 days / 120 hours).
- If the block owner does not submit scheduled surgical cases totaling at least 50% of the block duration by the auto-release deadline, Phase A3 rules release the unbooked remainder to the open scheduling pool.

### 4. Target Utilization Retention Standard
- Standard baseline utilization target is 75.0%.
- Medical Executive Committee (MEC) quarterly review audits actual utilization against this benchmark.

---

## Permissions / Security

| Role | View Blocks | Create/Edit Blocks | Reassign Ownership | Approve Conflicts | View Simulator |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Director of Nursing (DON)** | Yes | Yes | Yes | Yes | Yes |
| **OR Manager / Clinical Director** | Yes | Yes | Yes | Yes | Yes |
| **Surgical Scheduler** | Yes | Read-Only | Read-Only | No | Yes |
| **Surgeon (Block Owner)** | Yes (Own Blocks) | Propose Only | No | No | Yes |
| **Financial Analyst** | Yes | Read-Only | Read-Only | No | Yes |

---

## API / Service Requirements

Service module: `src/services/blockScheduleModelService.js` (and `src/lib/blockScheduleModelService.js`).

### Service Functions:
1. `getBlockDefinitions(facilityId, filters)`: Retrieves blocks filtered by room, owner type, specialty, and day.
2. `saveBlockDefinition(blockData, existingBlocks, staffingWindows)`: Validates containment, checks collision, and persists block.
3. `detectBlockCollisions(candidateBlock, existingBlocks)`: Deterministically identifies overlapping time intervals.
4. `validateBlockStaffingContainment(candidateBlock, staffingWindows)`: Verifies whether proposed block fits inside staffed shifts.
5. `calculateFacilityBlockKpis(blocks, rooms, staffingWindows)`: Calculates facility-level block metrics:
   - Total Blocked Hours / Week
   - Blocked vs Staffed Capacity Ratio (%)
   - Active Block Owners Count
   - Average Auto-Release Lead Time
   - Target Utilization Benchmark Average

---

## UI / Workflow Requirements

- **Design System:** Maestro Clinical Design System with strictly zero purple tokens.
- **5-Card Operational Block Ribbon:**
  1. *Weekly Blocked Capacity* (e.g. 192.5 Hours / Week).
  2. *Blocked vs Staffed Ratio* (e.g. 73.1% of available staffed hours allocated to blocks).
  3. *Active Block Owners* (e.g. 14 Surgeons & Surgical Groups).
  4. *Avg Auto-Release Lead Time* (e.g. 5.2 Days prior to surgery).
  5. *Benchmark Utilization Target* (e.g. 75.0% target standard).
- **Controls & Filter Bar:**
  - Search input (by block name, owner name, or room).
  - Room Filter, Owner Type Filter, Specialty Filter, Day-of-Week Filter.
  - View toggle: Matrix Timeline Grid vs Data Table View.
- **Interactive Weekly Block Matrix:**
  - Visual grid showing Operating Rooms (rows) versus Days of Week (Mon–Sat).
  - Color-coded block cards displaying: Block Name, Owner, Specialty badge, Time span, Duration, and Auto-Release badge.
- **Add / Edit Block Modal:**
  - Scoped CSS classes (`or-block-modal-*`, isolated white header `#ffffff !important;`).
  - Inputs for Room, Block Name, Owner Type, Surgeon, Specialty, Day, Recurrence, Start Time, End Time, Auto-Release Lead Days, Target Utilization.
- **Interactive Block Conflict & Fit Validator:**
  - Live validation assessing candidate blocks against existing blocks and staffed shifts with green (Clean), amber (Staffing Overrun Warning), or red (Collision Error) feedback.

---

## Audit / Provenance
1. All changes to `or_block_definitions` record `updated_at` and `updated_by`.
2. Any block reallocations, ownership changes, or manual releases record justification notes and audit history.

---

## QA / Test Cases
- **Unit Tests:**
  - Double-booking detector flags overlapping blocks in the same room on the same day.
  - Staffing window containment detector warns when block extends beyond staffed hours.
  - Recurrence pattern calculations correctly map weekly vs alternate weeks.
  - Shift duration math enforces positive minutes and `end_time > start_time`.
- **Integration Tests:**
  - Migration 079 UP creates all tables, indexes, views, and RLS policies.
  - Migration 079 DOWN cleanly rolls back schema objects.
- **UI Tests:**
  - Zero prohibited purple tokens in JSX and CSS.
  - Scoped modal styling with isolated white header.

---

## Acceptance Criteria
- [x] Build passes with zero errors (`npm run build`).
- [x] Lint passes with zero errors.
- [x] Automated test suite `tests/block-schedule-model.test.js` passes all tests.
- [x] Migration `079_block_schedule_model.sql` and `079_block_schedule_model_down.sql` authored with idempotent RLS.
- [x] Service layer provides authoritative conflict detection and staffing containment checks.
- [x] React component renders weekly matrix, table view, and add/edit modal.
- [x] Registered in `src/App.jsx` under Scheduling navigation.
