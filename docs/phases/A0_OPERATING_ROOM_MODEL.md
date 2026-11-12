# A0 OPERATING ROOM MODEL
# Phase A0: Operating Room Model & Physical Asset Architecture

> **Document Type:** Production Engineering & Business Logic Specification  
> **Repository:** `asc-prototype/docs/phases/A0_OPERATING_ROOM_MODEL.md`  
> **Module:** Module 10: OR Scheduling & Utilization Optimization  
> **Architecture Level:** Phase A0 (Foundational Operational Constraint & Physical Asset Engine)  
> **Tenancy:** Enforced Organization & Facility RLS (`app.current_facility_id`)  
> **Design System:** Maestro Clinical (Strictly Compliant Palette — Zero Prohibited Tokens)

---

## 1. Document Control & Metadata

| Field | Value |
| :--- | :--- |
| **Feature Name** | Operating Room Master Model & Physical Constraint Engine |
| **Module** | Module 10: OR Scheduling & Utilization Optimization |
| **Phase Index** | Phase A0 |
| **Upstream Dependencies** | Phase 21 (Facility Tenancy), Phase 22 (RBAC), Phase 35 (Surgeon Model), Phase 36 (Staff & Provider Model), Phase 73 (Facility Financial Settings), Phase 75 (Contribution Per OR Hour) |
| **Downstream Consumers** | Phase A1 (Room Staffing Windows), Phase A2 (Block Schedule Model), Phase A4 (OR Utilization Metrics), Phase A7 (Turnover Metrics), Phase A8 (Duration Prediction), Phase A11 (CP-SAT Scheduling Optimizer) |
| **Author** | Lead Perioperative Systems Architect & Clinical Operations Board |
| **Reviewer** | ASC Surgical Operations & Perioperative Governance Committee |
| **Effective Date** | Post-Phase 99 Integration |

---

## Purpose
Authoritative Operating Room (OR) master model, physical and architectural attributes, clinical specialty compatibility, fixed/boom equipment capabilities, HVAC/environmental standards, turnover targets, and multi-tenant facility relationships for Ambulatory Surgery Centers (ASCs).

The Operating Room is the primary revenue-generating asset and the most constrained clinical resource in an ASC. Operating room overhead costs typically range from \$20 to \$50 per minute (\$1,200 to \$3,000 per hour). Scheduling errors—such as assigning a spine surgery to a room lacking a radiolucent carbon fiber table or laminar airflow, or placing a bariatric patient on a table with insufficient weight rating—result in day-of-surgery delays, sterile field compromises, equipment transport bottlenecks, and catastrophic revenue loss. 

Phase A0 establishes the deterministic physical and technical constraint engine upon which all downstream surgical scheduling, block allocation, duration forecasting, and utilization analytics operate.

---

## Scope
- Define production requirements for operating room physical configurations, surgical suites, and facility relationships.
- Establish the multi-tenant data model for operating rooms, specialty compatibilities, fixed equipment capabilities, and operational status transition logs.
- Enforce deterministic compatibility checks:
  1. Surgical Specialty Compatibility Tier (`PRIMARY`, `SECONDARY`, `RESTRICTED`).
  2. Bariatric Safety Margin (patient weight + 50 lbs buffer versus table certified capacity).
  3. Sterile Environmental Standards (HVAC ISO cleanroom rating, air changes per hour, positive pressure, and laminar airflow requirements for implant/joint arthroplasty procedures).
  4. Fixed & Boom-Mounted Equipment Dependencies (e.g. C-Arm Fluoroscopy, 4K Arthroscopy Towers, Operating Microscopes, Jackson Spine Tables).
- Track operational lifecycles (`OPERATIONAL`, `MAINTENANCE`, `RENOVATION`, `DECOMMISSIONED`) with audit logging of downtime events.
- Model standard room turnover benchmarks (target minutes) and hourly facility cost baselines for financial utilization analysis.
- Preserve complete compatibility with the current ASCANALYST product while enforcing multi-tenant isolation via PostgreSQL Row Level Security (`app.current_facility_id`).
- Strictly comply with the Maestro Clinical Design System: **ZERO prohibited purple/violet/indigo/magenta/fuchsia tokens**.

---

## Current State
Component classification before Phase A0 implementation:

| Component / Artifact | Current Status | Classification | Assessment & Rationale |
| :--- | :---: | :---: | :--- |
| **`ORBlockSchedule.jsx`** | Implemented (Stub/Demo) | **KEEP / REFACTOR** | Displays a hardcoded schedule grid with static room labels ("OR 1", "OR 2", "OR 3", "OR 4"). Must be refactored to consume dynamic rooms from the database. |
| **`SurgeryScheduler.jsx`** | Implemented | **KEEP / REFACTOR** | Allows room string entry. Needs integration with the validated `operating_rooms` service. |
| **`operating_rooms` table** | Non-existent | **MISSING** | Authoritative relational table storing room dimensions, suite designation, table weight limits, HVAC class, hourly rate, and turnover standards. |
| **`operating_room_specialties` table** | Non-existent | **MISSING** | Relational link between rooms and surgical specialties with compatibility tiers (`PRIMARY`, `SECONDARY`, `RESTRICTED`). |
| **`operating_room_equipment` table** | Non-existent | **MISSING** | Inventory of fixed and boom-mounted equipment permanently or semi-permanently mounted in specific ORs. |
| **`operating_room_status_events` table** | Non-existent | **MISSING** | Immutable audit ledger tracking room status changes and maintenance downtime. |
| **Compatibility Engine (`operatingRoomModelService`)** | Non-existent | **MISSING** | Deterministic business rules evaluating specialty compatibility, equipment dependencies, and bariatric weight limits. |
| **`OperatingRoomModelView.jsx`** | Non-existent | **MISSING** | Maestro Clinical management workbench for operating rooms, physical specs, compatibility simulator, and status controls. |

---

## Target State
1. **Authoritative Master Data Model**:
   - `operating_rooms` stores physical attributes: room number, room name, suite designation (Main Surgical Suite, West Pavilion, Endoscopy Suite), room type (`STANDARD_OR`, `HYBRID_OR`, `PROCEDURE_ROOM`, `ENDOSCOPY_SUITE`, `ROBOTIC_SUITE`), square footage, table weight limit (lbs), HVAC cleanroom class (`ISO_CLASS_7`, `ISO_CLASS_8`, etc.), positive pressure (Pa), air changes per hour (ACH), laminar flow enablement, hourly cost rate ($/hr), standard turnover target (minutes), and operational status.
2. **Specialty Compatibility Matrix**:
   - Explicit many-to-one mapping in `operating_room_specialties` classifying surgical specialties (Orthopedics, Spine, Ophthalmology, ENT, General Surgery, Pain Management, Urology, Plastics, Vascular, GI/Endoscopy) as `PRIMARY` (preferred, fully outfitted), `SECONDARY` (acceptable with minor setup), or `RESTRICTED` (prohibited due to technical/environmental limitations).
3. **Equipment Dependency Ledger**:
   - `operating_room_equipment` tracks fixed and dedicated boom equipment (C-arms, surgical microscopes, arthroscopy towers, spinal tables) with maintenance and inspection certification statuses.
4. **Deterministic Validation & Compatibility Simulator**:
   - Client and server-side engine evaluating candidate cases against room attributes:
     - Specialty match check
     - Equipment availability & maintenance check
     - Bariatric weight validation with a mandatory 50 lb surgical prep/drapes safety margin
     - Cleanroom standard verification for joint/spine implant cases
5. **Operational Status & Downtime Tracking**:
   - State machine governing room availability with downtime logging in `operating_room_status_events`.
6. **Maestro Clinical UI Workbench**:
   - Responsive 5-card operational metric ribbon, filterable grid/table views of ORs, visual room cards with HVAC/weight chips, scoped Add/Edit modal, and an interactive Case Compatibility Simulator.

---

## Data Model / Schema

### Migration 077: `operating_room_model.sql`

```sql
-- 1. Operating Rooms Master Table
CREATE TABLE IF NOT EXISTS operating_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    room_number VARCHAR(50) NOT NULL,
    room_name VARCHAR(150) NOT NULL,
    suite_designation VARCHAR(100) NOT NULL DEFAULT 'Main Surgical Suite',
    room_type VARCHAR(50) NOT NULL DEFAULT 'STANDARD_OR' 
        CHECK (room_type IN ('STANDARD_OR', 'HYBRID_OR', 'PROCEDURE_ROOM', 'ENDOSCOPY_SUITE', 'MINIMAL_INVASIVE_SUITE', 'ROBOTIC_SUITE')),
    square_footage NUMERIC(8,2) NOT NULL DEFAULT 450.00 CHECK (square_footage > 0),
    table_weight_capacity_lbs INTEGER NOT NULL DEFAULT 500 CHECK (table_weight_capacity_lbs >= 300),
    hvac_cleanroom_class VARCHAR(50) NOT NULL DEFAULT 'ISO_CLASS_7'
        CHECK (hvac_cleanroom_class IN ('ISO_CLASS_5', 'ISO_CLASS_6', 'ISO_CLASS_7', 'ISO_CLASS_8', 'STANDARD_VENTILATED')),
    positive_pressure_pa NUMERIC(5,2) NOT NULL DEFAULT 2.50 CHECK (positive_pressure_pa >= 0),
    air_changes_per_hour INTEGER NOT NULL DEFAULT 20 CHECK (air_changes_per_hour >= 15),
    laminar_flow_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    hourly_cost_rate NUMERIC(10,2) NOT NULL DEFAULT 1450.00 CHECK (hourly_cost_rate >= 0),
    standard_turnover_minutes INTEGER NOT NULL DEFAULT 25 CHECK (standard_turnover_minutes > 0),
    operating_status VARCHAR(50) NOT NULL DEFAULT 'OPERATIONAL'
        CHECK (operating_status IN ('OPERATIONAL', 'MAINTENANCE', 'RENOVATION', 'DECOMMISSIONED')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    effective_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_end_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    CONSTRAINT uq_operating_rooms_facility_room UNIQUE (facility_id, room_number)
);

-- 2. Operating Room Specialty Compatibility
CREATE TABLE IF NOT EXISTS operating_room_specialties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operating_room_id UUID NOT NULL REFERENCES operating_rooms(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    specialty_code VARCHAR(50) NOT NULL,
    specialty_name VARCHAR(100) NOT NULL,
    compatibility_tier VARCHAR(50) NOT NULL DEFAULT 'PRIMARY'
        CHECK (compatibility_tier IN ('PRIMARY', 'SECONDARY', 'RESTRICTED')),
    is_preferred BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_or_specialty UNIQUE (operating_room_id, specialty_code)
);

-- 3. Operating Room Fixed & Boom Equipment
CREATE TABLE IF NOT EXISTS operating_room_equipment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operating_room_id UUID NOT NULL REFERENCES operating_rooms(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    equipment_code VARCHAR(50) NOT NULL,
    equipment_name VARCHAR(150) NOT NULL,
    is_fixed_installation BOOLEAN NOT NULL DEFAULT TRUE,
    serial_number VARCHAR(100),
    maintenance_status VARCHAR(50) NOT NULL DEFAULT 'CERTIFIED'
        CHECK (maintenance_status IN ('CERTIFIED', 'PENDING_INSPECTION', 'OUT_OF_SERVICE')),
    last_inspection_date DATE,
    next_inspection_due DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_or_equipment UNIQUE (operating_room_id, equipment_code)
);

-- 4. Operating Room Status Events & Downtime Ledger
CREATE TABLE IF NOT EXISTS operating_room_status_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operating_room_id UUID NOT NULL REFERENCES operating_rooms(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    previous_status VARCHAR(50) NOT NULL,
    new_status VARCHAR(50) NOT NULL,
    reason TEXT NOT NULL,
    event_type VARCHAR(50) NOT NULL DEFAULT 'STATUS_CHANGE'
        CHECK (event_type IN ('STATUS_CHANGE', 'MAINTENANCE_SCHEDULED', 'HVAC_CERTIFICATION', 'DECOMMISSION')),
    start_downtime TIMESTAMPTZ,
    end_downtime TIMESTAMPTZ,
    changed_by_user_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Row Level Security (RLS)
All tables enforce strict facility tenant isolation:
```sql
ALTER TABLE operating_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE operating_room_specialties ENABLE ROW LEVEL SECURITY;
ALTER TABLE operating_room_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE operating_room_status_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_operating_rooms ON operating_rooms
    FOR ALL USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);
-- (Repeated identically for specialties, equipment, and status events)
```

---

## Business Rules

### 1. Operating Room Status State Machine
- `OPERATIONAL`: Available for surgical booking, block allocation, and scheduling.
- `MAINTENANCE`: Temporarily offline for equipment calibration, bio-cleaning, or technical inspection. Requires `start_downtime` and `end_downtime`. Cannot be assigned new surgical cases during downtime.
- `RENOVATION`: Extended offline status for architectural or HVAC overhaul.
- `DECOMMISSIONED`: Permanently or indefinitely retired. `is_active` set to `FALSE`. Prohibited from selection in schedulers. Existing scheduled cases must be rescheduled or transferred before decommission.

```
[OPERATIONAL] <-------------------------> [MAINTENANCE]
      |                                         ^
      v                                         |
[RENOVATION] -----------------------------------+
      |
      v
[DECOMMISSIONED] (Permanent / Inactive)
```

### 2. Case-to-Room Deterministic Compatibility Evaluation
When validating a surgical case for a candidate OR, the engine evaluates 4 gates sequentially:

1. **Gate 1: Room Operating Status**
   - Condition: `room.operating_status === 'OPERATIONAL' && room.is_active === true`.
   - Failure: Returns `INCOMPATIBLE`, code `ERR_ROOM_NOT_OPERATIONAL`.
2. **Gate 2: Surgical Specialty Match**
   - The case specialty is compared against `operating_room_specialties`.
   - If tier is `PRIMARY` -> Passes with full compatibility score.
   - If tier is `SECONDARY` -> Passes with warning (`WARN_SECONDARY_SPECIALTY`: setup time or minor adjustments required).
   - If tier is `RESTRICTED` or specialty record is missing -> Returns `INCOMPATIBLE`, code `ERR_SPECIALTY_INCOMPATIBLE`.
3. **Gate 3: Equipment Availability & Certification**
   - For every required piece of equipment for the procedure:
     - Must exist in `operating_room_equipment` (or be available in mobile inventory).
     - `maintenance_status` must NOT be `OUT_OF_SERVICE`.
     - Failure: Returns `INCOMPATIBLE`, code `ERR_REQUIRED_EQUIPMENT_UNAVAILABLE`.
4. **Gate 4: Bariatric Table Weight Safety**
   - Condition: `(patientWeightLbs + 50) <= room.table_weight_capacity_lbs`.
   - 50 lbs represents the surgical prep buffer (armboards, stirrups, positioning gel pads, fluid bags, and surgical drapes).
   - Failure: Returns `INCOMPATIBLE`, code `ERR_BARIATRIC_LIMIT_EXCEEDED`.
5. **Gate 5: Cleanroom / Implant Infection Prevention Standard**
   - For joint arthroplasty (Total Knee, Total Hip) and spine hardware implants:
     - Room must meet `hvac_cleanroom_class === 'ISO_CLASS_7'` (or `ISO_CLASS_5`/`ISO_CLASS_6`), `positive_pressure_pa >= 2.50`, `air_changes_per_hour >= 20`, and `laminar_flow_enabled === true`.
     - Failure: Returns `INCOMPATIBLE`, code `ERR_HVAC_STERILE_STANDARDS_UNMET`.

---

## Permissions / Security

| Role | View Rooms | Add/Edit Room | Update Status | Modify Equipment | Run Compatibility Test |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **System Admin** | Yes | Yes | Yes | Yes | Yes |
| **Clinical Director / OR Manager** | Yes | Yes | Yes | Yes | Yes |
| **Charge Nurse / Surgical Scheduler** | Yes | Read-Only | Temporary Maintenance Only | Read-Only | Yes |
| **Surgeon / Credentialed Staff** | Yes | Read-Only | Read-Only | Read-Only | Yes |
| **Financial / Billing Analyst** | Yes | Read-Only | Read-Only | Read-Only | Read-Only |

---

## API / Service Requirements

Service module: `src/services/operatingRoomModelService.js` (and `src/lib/operatingRoomModelService.js`).

### Service Functions:
1. `getOperatingRooms(facilityId, filters)`: Retrieves all rooms with specialty arrays and equipment lists.
2. `getOperatingRoomById(roomId)`: Retrieves detailed room profile including HVAC specifications and equipment certifications.
3. `createOperatingRoom(roomData)`: Validates and persists new room with default specialties and equipment.
4. `updateOperatingRoom(roomId, updates)`: Updates room attributes with audit logging.
5. `transitionRoomStatus(roomId, newStatus, reason, downtimeWindow, userId)`: Executes state machine transition and records entry in `operating_room_status_events`.
6. `evaluateCaseCompatibility(candidateRoom, caseProfile)`: Deterministic calculation returning:
   ```json
   {
     "is_compatible": true,
     "compatibility_tier": "PRIMARY",
     "warnings": [],
     "errors": [],
     "weight_margin_lbs": 120,
     "cost_estimate_usd": 2900.00
   }
   ```
7. `getOperatingRoomKpis(rooms)`: Calculates facility-level operational metrics:
   - Total Rooms count
   - Operational Availability Rate (%)
   - Average Standard Turnover Time (minutes)
   - Active Surgical Suites count
   - High-Tech / Robotic / Laminar Capable Rooms count

---

## UI / Workflow Requirements

- **Design System:** Maestro Clinical Design System with strictly zero purple tokens.
- **Header & Metric Ribbon (5 Cards):**
  1. *Total Operating Rooms* (e.g. 6 Rooms across 2 Suites).
  2. *Operational Availability* (e.g. 83.3% — 5 Operational, 1 Maintenance).
  3. *Standard Turnover Benchmark* (e.g. 24.2 min average target).
  4. *Active Surgical Suites* (e.g. 3 Suites: Main, West, Endoscopy).
  5. *Laminar Airflow / High-Tech Suites* (e.g. 4 Rooms ISO Class 7+).
- **Controls & Filter Bar:**
  - Search input (by room number, room name, suite, or equipment).
  - Suite Filter (All, Main Surgical Suite, West Pavilion, Endoscopy Suite).
  - Specialty Filter (All, Orthopedic, Spine, Ophthalmology, etc.).
  - Status Filter (All, Operational, Maintenance, Renovation, Decommissioned).
  - Grid View vs Table View toggle.
- **Operating Room Card Grid:**
  - Room number with suite badge.
  - Operational status chip (emerald for `OPERATIONAL`, amber for `MAINTENANCE`, blue for `RENOVATION`, slate for `DECOMMISSIONED`).
  - Key technical indicators: Square footage, Table weight limit (lbs), HVAC Class & Air Changes per hour, Standard turnover (min), Hourly cost rate ($/hr).
  - Specialty tags with tier badge (`PRIMARY` vs `SECONDARY`).
  - Installed equipment chips with certified status.
  - Action menu: Edit Room, Quick Status Toggle, Test Case Fit.
- **Add / Edit Room Modal:**
  - Dedicated scoped CSS classes (`or-modal-*`, `or-form-control`, `or-input`) preventing modal header or dark theme bleed.
  - Form validation for square footage, table weight limit (min 300 lbs), positive pressure, and hourly rates.
- **Interactive Case Compatibility Simulator:**
  - Drawer/Modal allowing surgical schedulers to input Case Specialty, Required Equipment, and Patient Weight (lbs).
  - Instantly evaluates all rooms and provides clear visual feedback: Compatible (green), Warning (amber), or Incompatible (red) with explicit reason messages.

---

## Audit / Provenance
1. All changes to `operating_rooms` record `updated_at` and `updated_by`.
2. Every change to `operating_status` writes an immutable record to `operating_room_status_events` capturing `previous_status`, `new_status`, `reason`, `event_type`, `start_downtime`, `end_downtime`, and `changed_by_user_id`.
3. Historical compatibility evaluations can be recomputed deterministically using effective dates and equipment maintenance logs.

---

## QA / Test Cases

- **Unit Tests:**
  - Room status state machine allows valid transitions and blocks invalid ones.
  - Specialty compatibility tier mapping correctly flags `PRIMARY`, `SECONDARY`, and `RESTRICTED`.
  - Bariatric safety check triggers when patient weight + 50 lbs exceeds table capacity.
  - HVAC cleanroom rule blocks joint arthroplasty in non-laminar or non-ISO-7 rooms.
- **Integration Tests:**
  - Schema integrity: Migration `077_operating_room_model.sql` creates all 4 tables, foreign keys, unique constraints, and views.
  - Rollback integrity: Down migration `077_operating_room_model_down.sql` drops all tables cleanly.
- **Multi-Tenant RLS Tests:**
  - Ensures queries filtered by `app.current_facility_id` isolate facility data.
- **Maestro Clinical UI Tests:**
  - Zero prohibited purple/violet/indigo tokens in `.jsx` and `.css`.
  - Scoped modal classes (`or-modal-*`, `or-form-control`) verified to prevent styling leaks.

---

## Acceptance Criteria
- [x] Build passes with zero compilation or bundling errors (`npm run build`).
- [x] Lint passes with zero errors.
- [x] Automated test suite `tests/operating-room-model.test.js` passes all tests.
- [x] Migration `077_operating_room_model.sql` and down migration `077_operating_room_model_down.sql` are complete and idempotent.
- [x] Service layer provides authoritative room queries, status transitions, and deterministic compatibility validation.
- [x] React component `OperatingRoomModelView.jsx` renders all states, filters, room cards, modals, and compatibility simulator.
- [x] Registered in `src/App.jsx` under the Scheduling navigation menu with route tab `'or_model'`.
- [x] Zero prohibited purple/violet/indigo design tokens.

---

## Dependencies
- Upstream: Phase 21 (Facility Tenancy), Phase 22 (RBAC Roles), Phase 73 (Facility Financial Settings).
- Downstream: Phase A1 (Room Staffing Windows), Phase A2 (Block Schedule Model), Phase A4 (OR Utilization Metrics).

---

## Definition of Done
Phase A0 is complete only when:
1. Specification document is synchronized in both `docs/phases/A0_OPERATING_ROOM_MODEL.md` and `ASCANALYST_All_Modules/ASCANALYST_MD_SPECS/Phase_10_OR_Scheduling/A0_OPERATING_ROOM_MODEL.md`.
2. Database schema, constraints, views, and RLS policies are applied in migration 077.
3. Service layer performs deterministic compatibility and status transitions.
4. UI component complies with Maestro Clinical Design System with zero purple tokens.
5. All automated unit and integration tests pass.

---

## Implementation Notes
- **Migration Files:** `supabase/migrations/077_operating_room_model.sql` and `supabase/migrations/077_operating_room_model_down.sql`.
- **Service Files:** `src/services/operatingRoomModelService.js` and `src/lib/operatingRoomModelService.js`.
- **UI Components:** `src/components/OperatingRoomModelView.jsx` and `src/components/OperatingRoomModelView.css`.
- **Test File:** `tests/operating-room-model.test.js`.
- **Navigation Integration:** Registered in `src/App.jsx` as tab `or_model` under Scheduling.
