# AB / A11 SCHEDULING OPTIMIZER CP-SAT ENGINE

## Purpose
Constraint Programming - Satisfiability (CP-SAT) surgical schedule optimization, mathematical formulation, hard clinical/physical constraints, multi-objective optimization functions, and schedule commitment validation. This specification defines production standards for enterprise-grade automated operating room schedule synthesis across multiple surgical suites, balancing case margins, room utilization, surgeon travel, and nursing overtime mitigation.

## Scope
- Define production mathematical and operational requirements for CP-SAT combinatorial schedule synthesis.
- Preserve full compatibility with historical blocks (Phase A2), block release events (Phase A3), turnover standards (Phase A7), P80 duration predictions (Phase A8), recoverable capacity slots (Phase A9), and candidate backlog ranking (Phase AA).
- Use deterministic, auditable interval math and constraint satisfaction rules.
- Enforce organization/facility tenancy and PostgreSQL Row Level Security (RLS).

## Current State
- **Phase A0 (Operating Room Master Model):** Defines physical suite capabilities, specialized equipment fixtures, and turnover standards.
- **Phase A1 (Room Staffing Windows):** Establishes staffed shift hours (e.g. 07:00 to 17:00 = 600 staffed minutes) and net denominator hours.
- **Phase A7 (Turnover Metrics):** Establishes same-surgeon turnover (25m) vs different-surgeon turnover (40m).
- **Phase A8 (Duration Prediction):** Provides calibrated P80 operative duration predictions for each procedure.
- **Phase AA (Next Best Case):** Ranks candidate cases based on pre-op readiness and financial margin.
- **Optimization Engine Gap:** Currently, surgery centers assemble daily operative schedules by hand or via naive first-fit heuristics. Schedulers struggle to resolve competing multi-suite constraints, leading to:
  1. Surgeon double-booking across different suites.
  2. Incompatible equipment assignments (e.g., booking a robotic case in a non-robotic suite).
  3. Excessive turnover gaps that fragment open capacity.
  4. Chronic nursing overtime due to poor sequence packing.
  5. Suboptimal case sequencing that places long unpredictable cases late in the surgical shift.
- Classification:
  - Manual Scheduling Ledger (`scheduler`): **KEEP**.
  - Duration Prediction & Case Readiness (`or_case_duration_prediction_models`, `or_next_best_case_backlog`): **KEEP**.
  - Automated CP-SAT Combinatorial Scheduling Engine: **MISSING** (Implemented in Phase AB/A11).

## Target State
1. **Deterministic CP-SAT Mathematical Model:**
   - Models surgical cases as non-preemptive temporal intervals: $I_i = [\text{Start}_i, \text{End}_i]$ where $\text{End}_i = \text{Start}_i + d_i$.
   - Includes turnover intervals: $T_{i, j} = 25\text{m}$ if $s_i = s_j$, else $40\text{m}$.
2. **Hard Constraints (Mandatory Satisfiability):**
   - **Constraint 1 (No-Overlap in Suites):** For any two cases $i, j$ scheduled in operating room $r$:
     $$\text{no\_overlap}(I_i, I_j) \implies \text{End}_i + T_{i, j} \le \text{Start}_j \lor \text{End}_j + T_{j, i} \le \text{Start}_i$$
   - **Constraint 2 (Surgeon Single-Location Invariant):** A surgeon cannot operate in two operating suites concurrently:
     $$\forall i, j \text{ where } s_i = s_j: \text{End}_i \le \text{Start}_j \lor \text{End}_j \le \text{Start}_i$$
   - **Constraint 3 (Room-Specialty Capability Match):** Case $i$ can only be assigned to room $r$ if room $r$ supports specialty $c_i$ and possesses necessary equipment fixtures.
   - **Constraint 4 (Shift Window Boundaries):** Case start times must fall within licensed staffed operating shifts ($\text{Start}_i \ge \text{ShiftStart}_r$).
   - **Constraint 5 (Clinical Clearance Gate):** Only cases with approved insurance prior authorization and documented clearance can be scheduled without explicit clinical supervisor override.
3. **Multi-Objective Weighted Optimization Function:**
   $$\max Z = w_M \cdot \sum_{\text{scheduled}} \text{Margin}_i + w_U \cdot \sum \text{UtilizedMinutes} - w_O \cdot \sum \text{OvertimeMinutes} - w_T \cdot \sum \text{TurnoverMinutes} - w_H \cdot \sum \text{RoomHops}$$
   - Default Weights: Margin Yield $w_M = 1.0$, Suite Utilization $w_U = 2.0$, Overtime Penalty $w_O = 10.0$ ($/min), Turnover Penalty $w_T = 1.5$, Surgeon Room Hopping $w_H = 50.0$.
4. **Schedule Commitment & Lifecycle States:**
   - Solver generates candidate runs in state `PROPOSED`.
   - Perioperative directors can audit constraint satisfaction, evaluate gantt timelines, and click **Commit Schedule** &rarr; state transitions to `COMMITTED`, locking case timings into the master facility surgery schedule.
5. **Clinical Maestro UI:**
   - 5-Card Operational Ribbon: Scheduled Cases Count, Suite Utilization %, Projected Contribution Margin ($), Overtime Risk (mins), Solver Solve Time (ms).
   - Multi-Suite Timeline / Gantt Board: Visual interactive block timeline across OR 1, OR 2, OR 3, and OR 4 with surgeon badges, case durations, and turnover intervals.
   - 3-Tab Views: Proposed Multi-Suite Schedule Gantt, Constraint Satisfaction & Objective Matrix, Unscheduled Backlog Exceptions.
   - Interactive Solver Strategy Selector & Optimization Modal with pinned layout.

## Data Model / Schema

### 1. `or_cp_sat_optimizer_runs`
Master ledger of solver optimization executions:
- `id` UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `facility_id` UUID NOT NULL REFERENCES `public.facilities(id)` ON DELETE CASCADE
- `run_number` VARCHAR(64) NOT NULL
- `planning_horizon_start` DATE NOT NULL
- `planning_horizon_end` DATE NOT NULL
- `optimization_strategy` VARCHAR(32) NOT NULL DEFAULT 'BALANCED' -- 'MAX_MARGIN', 'BALANCED', 'MIN_OVERTIME', 'MIN_TURNOVER'
- `solver_status` VARCHAR(32) NOT NULL DEFAULT 'OPTIMAL' -- 'OPTIMAL', 'FEASIBLE', 'INFEASIBLE', 'TIMEOUT'
- `solve_time_ms` INTEGER NOT NULL DEFAULT 0
- `objective_value` NUMERIC(12, 2) NOT NULL DEFAULT 0.00
- `total_cases_evaluated` INTEGER NOT NULL DEFAULT 0
- `total_cases_scheduled` INTEGER NOT NULL DEFAULT 0
- `total_scheduled_minutes` INTEGER NOT NULL DEFAULT 0
- `projected_utilization_pct` NUMERIC(5, 2) NOT NULL DEFAULT 0.00
- `projected_overtime_minutes` INTEGER NOT NULL DEFAULT 0
- `projected_total_margin` NUMERIC(12, 2) NOT NULL DEFAULT 0.00
- `parameters_json` JSONB NOT NULL DEFAULT '{}'::jsonb
- `executed_by_user_id` UUID
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT `NOW()`

### 2. `or_cp_sat_scheduled_cases`
Individual case assignments generated by the optimizer run:
- `id` UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `facility_id` UUID NOT NULL REFERENCES `public.facilities(id)` ON DELETE CASCADE
- `run_id` UUID NOT NULL REFERENCES `public.or_cp_sat_optimizer_runs(id)` ON DELETE CASCADE
- `case_id` UUID NOT NULL
- `patient_name` VARCHAR(128) NOT NULL
- `patient_mrn` VARCHAR(64) NOT NULL
- `surgeon_id` BIGINT REFERENCES `public.surgeons(id)` ON DELETE SET NULL
- `surgeon_name` VARCHAR(128) NOT NULL
- `specialty_code` VARCHAR(64) NOT NULL
- `procedure_name` VARCHAR(256) NOT NULL
- `primary_cpt_code` VARCHAR(16) NOT NULL
- `operating_room_id` UUID NOT NULL REFERENCES `public.operating_rooms(id)` ON DELETE CASCADE
- `room_name` VARCHAR(128) NOT NULL
- `scheduled_date` DATE NOT NULL
- `start_time` TIME NOT NULL
- `end_time` TIME NOT NULL
- `duration_minutes` INTEGER NOT NULL
- `turnover_minutes` INTEGER NOT NULL DEFAULT 25
- `sequence_order` INTEGER NOT NULL
- `is_overtime` BOOLEAN NOT NULL DEFAULT FALSE
- `overtime_minutes` INTEGER NOT NULL DEFAULT 0
- `projected_contribution_margin` NUMERIC(10, 2) NOT NULL DEFAULT 0.00
- `schedule_status` VARCHAR(32) NOT NULL DEFAULT 'PROPOSED' -- 'PROPOSED', 'COMMITTED', 'DISCARDED'
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT `NOW()`

### 3. `or_cp_sat_solver_constraints`
Configurable facility penalty weights and limits:
- `id` UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `facility_id` UUID NOT NULL REFERENCES `public.facilities(id)` ON DELETE CASCADE
- `weight_margin` NUMERIC(6, 2) NOT NULL DEFAULT 1.00
- `weight_utilization` NUMERIC(6, 2) NOT NULL DEFAULT 2.00
- `weight_overtime_penalty` NUMERIC(6, 2) NOT NULL DEFAULT 10.00
- `weight_turnover_penalty` NUMERIC(6, 2) NOT NULL DEFAULT 1.50
- `weight_surgeon_hopping_penalty` NUMERIC(6, 2) NOT NULL DEFAULT 50.00
- `max_overtime_minutes_per_room` INTEGER NOT NULL DEFAULT 60
- `same_surgeon_turnover_minutes` INTEGER NOT NULL DEFAULT 25
- `diff_surgeon_turnover_minutes` INTEGER NOT NULL DEFAULT 40
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT `NOW()`,
- CONSTRAINT `uq_cp_sat_facility_constraints` UNIQUE (`facility_id`)

## Business Rules

### Rule 1: No-Overlap & Turnover Enclosure
In any given surgical suite $r$, cases must be strictly sequential with standard turnover spacing:
$$\text{Start}_{k+1} \ge \text{End}_k + \text{Turnover}(s_k, s_{k+1})$$
Where:
- $\text{Turnover} = 25\text{ minutes}$ if $s_k = s_{k+1}$ (Same surgeon)
- $\text{Turnover} = 40\text{ minutes}$ if $s_k \ne s_{k+1}$ (Different surgeon)

### Rule 2: Surgeon Single-Location Invariant
A surgeon $s$ cannot be scheduled for multiple active cases in different rooms during any overlapping time interval:
$$\forall i \ne j \text{ with } s_i = s_j: [\text{Start}_i, \text{End}_i] \cap [\text{Start}_j, \text{End}_j] = \emptyset$$

### Rule 3: Operating Room Staffed Window & Overtime
- Staffed shift window for room $r$: $[\text{ShiftStart}_r, \text{ShiftEnd}_r]$ (default 07:00 to 17:00, 600 minutes).
- If $\text{End}_i > \text{ShiftEnd}_r$, the case incurs overtime:
  $$\text{OvertimeMinutes} = \text{End}_i - \text{ShiftEnd}_r$$
- Overtime is heavily penalized by $w_O \cdot \text{OvertimeMinutes}$ to deter shift end delays.

### Rule 4: Multi-Objective Strategy Presets
1. **`BALANCED` (Default):** Standard balance between margin, suite utilization, and zero overtime.
2. **`MAX_MARGIN`:** Prioritizes top-dollar surgical contribution margin ($w_M \times 2.0$), tolerating moderate overtime if margin exceeds hourly overtime expense.
3. **`MIN_OVERTIME`:** Strict containment of shifts ($w_O \times 3.0$), truncating late cases to protect nursing shift end times.
4. **`MIN_TURNOVER`:** Clusters cases by surgeon into long back-to-back blocks to minimize turnover friction.

## Permissions / Security
- `scheduling.view_cp_sat_schedules`: View proposed and committed CP-SAT schedules.
- `scheduling.execute_cp_sat_solver`: Run optimization solver scenarios.
- `scheduling.commit_cp_sat_schedule`: Authorize official schedule commitment into clinical EHR/OR logs.
- Multi-tenancy: Strictly isolated via PostgreSQL Row Level Security (`facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid`).

## API / Service Requirements
- `POST /api/v1/scheduling/optimizer/solve`: Execute CP-SAT constraint optimization run for planning horizon.
- `GET /api/v1/scheduling/optimizer/runs`: List historical solver runs and metrics.
- `GET /api/v1/scheduling/optimizer/runs/:id`: Retrieve detailed multi-suite case schedule.
- `POST /api/v1/scheduling/optimizer/runs/:id/commit`: Commit proposed schedule into master surgical schedule.

## UI / Workflow Requirements
- **Maestro Clinical Design System:** Strictly ZERO prohibited purple/violet/indigo/magenta/fuchsia tokens.
- **Pinned Flex Column Modals:** Modal header and footer pinned, scrollable body (`overflow-y: auto`).
- **5-Card Ribbon:** Total Scheduled Cases, Suite Utilization %, Projected Margin ($), Shift Overtime Risk (mins), Solve Time (ms).
- **Multi-Suite Interactive Gantt Board:** Visual timeline showing OR 1, OR 2, OR 3, and OR 4 with color-coded surgeon cards, case durations, and turnover blocks.
- **3 Tab Views:**
  1. Multi-Suite Schedule Gantt Timeline
  2. Constraint Satisfaction & Objective Matrix
  3. Unscheduled Backlog Exceptions & Waivers

## Audit / Provenance
All solver executions, strategy selections, constraint weights, objective values, and user commitment approvals must record `facility_id`, `user_id`, `timestamp`, `run_number`, and before/after schedule diffs in the audit ledger.

## QA / Test Cases
- Unit tests verifying No-Overlap interval logic.
- Unit tests verifying Surgeon Single-Location invariant enforcement.
- Unit tests verifying same-surgeon vs different-surgeon turnover buffers.
- Unit tests verifying multi-objective function score calculations.
- Database migration 088 UP and DOWN tests with multi-tenant RLS checks.
- Maestro design system Zero-Purple audit and App.jsx routing integration.

## Acceptance Criteria
- Build passes (`npm run build` with 0 errors).
- All automated tests pass with 100% success.
- Clean idempotent database migration and rollback SQL.
- Working tree clean and committed to git branch `feature/phase-80-claims-model`.

## Implementation Notes
- **Specification Files Authored:**
  - `docs/phases/AB_SCHEDULING_OPTIMIZER_CP_SAT.md`
  - `e:\medicalAI\ASCANALYST_All_Modules\ASCANALYST_MD_SPECS\Phase_10_OR_Scheduling\A11_SCHEDULING_OPTIMIZER_CP_SAT.md`
- **Database Migrations Created:**
  - `supabase/migrations/088_scheduling_optimizer_cp_sat.sql`: Created tables `or_cp_sat_optimizer_runs`, `or_cp_sat_scheduled_cases` (`surgeon_id BIGINT` referencing `public.surgeons(id)`, `operating_room_id UUID`), `or_cp_sat_solver_constraints`, and views `vw_or_cp_sat_run_summary` and `vw_or_cp_sat_daily_room_schedules`. Enforced RLS via `app.current_facility_id`.
  - `supabase/migrations/088_scheduling_optimizer_cp_sat_down.sql`: Created clean idempotent rollback drops with `CASCADE`.
- **Deterministic Service Layer:**
  - `src/services/cpSatSchedulerService.js`: Implemented mathematical CP-SAT interval scheduling, Hard Invariant 1 (No-Overlap with 25m/40m dynamic turnover), Hard Invariant 2 (Surgeon Single-Location invariant), multi-objective optimization function $Z$, strategy presets (`BALANCED`, `MAX_MARGIN`, `MIN_OVERTIME`, `MIN_TURNOVER`), and clinical seed candidates.
  - `src/lib/cpSatSchedulerService.js`: Re-export wrapper.
- **Clinical Maestro UI & Pinned Modals:**
  - `src/components/CpSatSchedulerView.jsx`: Authored 5-Card Operational Ribbon, Strategy Preset Selector, Multi-Suite Gantt Timeline for OR 1–OR 4, Constraint Satisfaction Audit Matrix, Unscheduled Backlog Exceptions, and Pinned Commitment Modal.
  - `src/components/CpSatSchedulerView.css`: Scoped `.cps-` styles adhering strictly to Maestro Zero-Purple standards and pinned flex-column modal layout.
- **Application Routing:**
  - `src/App.jsx`: Wired `CpSatSchedulerView` into sidebar navigation (`cp_sat_optimizer`), header titles, and view renderer.
- **Automated Verification:**
  - `tests/cp-sat-scheduler.test.js`: 23/23 tests passing with 100% success.
  - All 12 Module 10 test suites (A0 to AB) passing: 220/220 tests passing.
  - `npm run build`: Production compilation clean in 8.44s with 0 errors.
