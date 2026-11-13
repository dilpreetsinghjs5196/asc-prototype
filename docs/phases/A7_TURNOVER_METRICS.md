# A7 TURNOVER METRICS & BENCHMARK ENGINE

## Purpose
Turnover definitions, timestamps, and benchmark logic. This specification defines production standards for measuring, categorizing, attributing, and optimizing surgical suite turnover times (Wheels Out to Wheels In), distinguishing between same-surgeon and cross-specialty room changeovers, attributing operational delay root causes, and quantifying financial idle room labor costs.

## Scope
- Define production requirements for operating room turnover tracking across all surgical suites.
- Preserve compatibility with the current ASCANALYST product, historical case logs, and physical OR master models.
- Use deterministic, auditable rules for turnover intervals, variance calculations, and idle room financial impact.
- Enforce organization/facility multi-tenancy and role-based access control (RBAC).

## Current State
- **Phase A0 (Operating Room Master Model):** Provides physical suites and default turnover baseline configurations (`standard_turnover_minutes`).
- **Phase A1 (Room Staffing Windows):** Establishes net staffed minutes and shift boundaries for room availability.
- **Phase A2 (Block Schedule Model):** Allocates surgeon blocks that require efficient room turnover to prevent schedule spillover.
- **Phase A4 (OR Utilization Metrics):** Tracks turnover-inclusive occupancy percentages ($(\text{In-Room} + \text{Turnover}) / \text{Staffed}$).
- **Phase A6 (Booking Accuracy):** Demonstrates that case overrun delays compound room turnover backlogs.
- **Turnover Engine Gap:** Currently, granular timestamp intervals (Wheels Out $\to$ Clean Start $\to$ Clean End $\to$ Setup Ready $\to$ Wheels In), delay reason attribution, same-surgeon vs different-surgeon benchmark deltas, and idle financial run-rate impact are unmodeled in a dedicated analytical view.
- Classification:
  - Physical Suite Model (`operating_rooms`): **KEEP**.
  - Room Utilization Ratios (`or_room_utilization_daily_snapshots`): **KEEP**.
  - Turnover Tracking Service & Ledger: **MISSING** (Implemented in Phase A7).

## Target State
1. **Timestamped Milestones:** Capture Wheels Out (Case $N$), Cleaning Start/Complete, Sterile Setup Ready, and Wheels In (Case $N+1$).
2. **Deterministic Classification:**
   - Same-Surgeon Turnover vs Different-Surgeon (Cross-Specialty) Turnover.
   - Compliance classification against clinical benchmarks: `COMPLIANT`, `MINOR_DELAY` ($\le 10\text{m}$), and `PROLONGED_TURNOVER` ($> 10\text{m}$).
3. **Delay Attribution Matrix:** Root-cause coding for prolonged turnovers (EVS cleaning, SPD sterile processing, surgeon delay, anesthesia blocks, nursing shortages, equipment setup).
4. **Financial Idle Impact:** Quantify room labor run-rate cost ($650.00/hr) and facility opportunity cost ($1,250.00/hr) incurred by excess turnover duration.
5. **Clinical Maestro UI:** 5-Card Operational Ribbon, 3 interactive sub-views (Turnover Events Ledger, Delay Reason Pareto Analysis, Specialty Benchmark Calibration), and an Interactive Delay Attribution / Benchmark Review Modal.

## Data Model / Schema

### 1. `or_turnover_events`
- `id` UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `facility_id` UUID NOT NULL REFERENCES `public.facilities(id)` ON DELETE CASCADE
- `operating_room_id` UUID REFERENCES `public.operating_rooms(id)` ON DELETE SET NULL
- `surgery_date` DATE NOT NULL
- `prior_case_id` VARCHAR(64) NOT NULL
- `prior_surgeon_name` VARCHAR(255) NOT NULL
- `prior_specialty_code` VARCHAR(64) NOT NULL
- `prior_procedure_name` VARCHAR(255) NOT NULL
- `next_case_id` VARCHAR(64) NOT NULL
- `next_surgeon_name` VARCHAR(255) NOT NULL
- `next_specialty_code` VARCHAR(64) NOT NULL
- `next_procedure_name` VARCHAR(255) NOT NULL
- `turnover_type` VARCHAR(32) NOT NULL DEFAULT `'SAME_SURGEON'` (`SAME_SURGEON`, `DIFFERENT_SURGEON`)
- `prior_wheels_out_time` TIMESTAMPTZ NOT NULL
- `clean_start_time` TIMESTAMPTZ
- `clean_complete_time` TIMESTAMPTZ
- `setup_ready_time` TIMESTAMPTZ
- `next_wheels_in_time` TIMESTAMPTZ NOT NULL
- `actual_turnover_minutes` INTEGER NOT NULL
- `benchmark_target_minutes` INTEGER NOT NULL
- `turnover_variance_minutes` INTEGER NOT NULL -- (actual - benchmark)
- `turnover_status` VARCHAR(32) NOT NULL -- 'COMPLIANT', 'MINOR_DELAY', 'PROLONGED_TURNOVER'
- `delay_reason_code` VARCHAR(64) -- EVS_CLEANING_DELAY, SURGEON_UNAVAILABLE, etc.
- `delay_description` TEXT
- `financial_idle_cost` NUMERIC(10, 2) NOT NULL DEFAULT 0.00
- `excess_delay_cost` NUMERIC(10, 2) NOT NULL DEFAULT 0.00
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT `NOW()`

### 2. `or_turnover_benchmarks`
- `id` UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `facility_id` UUID NOT NULL REFERENCES `public.facilities(id)` ON DELETE CASCADE
- `specialty_code` VARCHAR(64) NOT NULL
- `same_surgeon_benchmark_minutes` INTEGER NOT NULL DEFAULT 20
- `different_surgeon_benchmark_minutes` INTEGER NOT NULL DEFAULT 35
- `warning_threshold_minutes` INTEGER NOT NULL DEFAULT 10
- `hourly_run_rate_cost` NUMERIC(10, 2) NOT NULL DEFAULT 650.00
- `effective_date` DATE NOT NULL DEFAULT CURRENT_DATE
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT `NOW()`
- CONSTRAINT `uq_or_turnover_benchmark` UNIQUE (`facility_id`, `specialty_code`)

### 3. Indexes & Views
- Indexes on `(facility_id, surgery_date)`, `(facility_id, operating_room_id)`, `(facility_id, turnover_status)`, `(facility_id, delay_reason_code)`.
- Analytical View `vw_or_turnover_facility_summary`: Facility aggregates for average turnover, compliance rate %, prolonged turnover %, and total excess costs.
- Analytical View `vw_or_turnover_delay_attribution`: Grouped Pareto distribution of delay root causes with total delay minutes and financial loss.

## Business Rules

### Rule 1: Turnover Duration Calculation
$$\text{Actual Turnover Minutes} = \frac{T_{\text{Wheels In (Next Case)}} - T_{\text{Wheels Out (Prior Case)}}}{60\text{ seconds}}$$
- The first case of the day has no preceding patient and is excluded from turnover analytics (tracked under First Case On-Time Starts).
- Turnover cannot be negative. If $T_{\text{Wheels In}} < T_{\text{Wheels Out}}$, the case log is rejected as an invalid sequence.

### Rule 2: Benchmark Target Assignment
$$\text{Benchmark Target} = \begin{cases} \text{Same-Surgeon Benchmark} & \text{if } \text{Prior Surgeon} = \text{Next Surgeon} \\ \text{Different-Surgeon Benchmark} & \text{if } \text{Prior Surgeon} \neq \text{Next Surgeon} \end{cases}$$
- Default Same-Surgeon Target: 20 minutes (Ophthalmology 15m; ENT/General 20m; Ortho 25m; Spine 30m).
- Default Different-Surgeon Target: 35 minutes (accounts for complete instrument swap, suction canister change, and room reconfiguration).

### Rule 3: Turnover Variance & Status Classification
$$\Delta T = \text{Actual Turnover Minutes} - \text{Benchmark Target Minutes}$$
- **`COMPLIANT`**: $\Delta T \le 0\text{ minutes}$ (Turnover met or beat benchmark).
- **`MINOR_DELAY`**: $0 < \Delta T \le 10\text{ minutes}$ (Acceptable operational variation).
- **`PROLONGED_TURNOVER`**: $\Delta T > 10\text{ minutes}$ (Critical operational delay requiring mandatory delay root cause attribution).

### Rule 4: Delay Reason Root Cause Codes
Any turnover with status `PROLONGED_TURNOVER` or `MINOR_DELAY` must support delay attribution:
1. `EVS_CLEANING_DELAY`: Terminal cleaning delay, biohazard decontamination, floor dry time.
2. `INSTRUMENT_STERILIZATION_DELAY`: Trays not ready from SPD, missing implant kit, flash sterilization required.
3. `SURGEON_UNAVAILABLE`: Surgeon rounding in PACU, in clinic consult, or late arrival.
4. `ANESTHESIA_PREOP_DELAY`: Pre-op regional nerve block delay, difficult IV line, consent hold.
5. `NURSING_STAFF_SHORTAGE`: Circulating nurse handover, scrub tech relief shortage.
6. `EQUIPMENT_MALFUNCTION_SETUP`: Arthroscopy tower, robotic arm, or fluoroscopy C-arm setup issue.
7. `PATIENT_ADMISSION_DELAY`: Pre-op admissions hold, laboratory hold, transport delay.
8. `OTHER_CLINICAL_HOLD`: Pathology frozen section or clinical emergency interruption.

### Rule 5: Financial Idle Room Run-Rate Impact
$$\text{Total Idle Cost} = \frac{\text{Actual Turnover Minutes}}{60} \times \$650.00/\text{hr}$$
$$\text{Excess Delay Cost} = \frac{\max(0, \Delta T)}{60} \times \$650.00/\text{hr}$$
- Reflects clinical staffing (circulator, scrub, sterile tech, turnover team) and room overhead run-rate during unproductive downtime.

## Permissions / Security
- Multi-tenancy isolation via PostgreSQL Row-Level Security:
  `USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)`
- RBAC Matrix:
  - `super_admin`, `org_admin`, `clinical_director`: Full View, Adjust Benchmarks, Assign Root-Cause Codes, Export Audits.
  - `nurse_manager`, `charge_nurse`: Log Milestones, Assign Delay Reason Codes, Review Daily Room Logs.
  - `surgeon_user`: Restricted View of own turnover durations and peer anonymized specialty benchmarks.

## API / Service Requirements
- `calculateTurnoverDuration(wheelsOutTime, wheelsInTime)`
- `determineTurnoverType(priorSurgeon, nextSurgeon)`
- `calculateTurnoverVariance(actualMinutes, benchmarkMinutes)`
- `classifyTurnoverStatus(varianceMinutes, warningThresholdMinutes = 10)`
- `calculateTurnoverFinancialImpact(turnoverMinutes, varianceMinutes, hourlyRate = 650)`
- `calculateFacilityTurnoverKpis(turnoverEvents, benchmarks)`
- `filterTurnoverEvents(events, filters)`

## UI / Workflow Requirements
- **5-Card Operational Ribbon:**
  1. Average Facility Turnover (mins) with compliance pill.
  2. Same-Surgeon Turnover Avg (mins) vs 20m benchmark.
  3. Different-Surgeon Turnover Avg (mins) vs 35m benchmark.
  4. Prolonged Turnover Rate % ($> 10\text{m}$ delay).
  5. Total Excess Idle Cost ($) at \$650.00/hr run-rate.
- **3-Tab View Switcher:**
  - Tab 1: **Turnover Events Ledger** (Detailed case-to-case room transition log, timestamps, variance tag, delay reason badge).
  - Tab 2: **Delay Root-Cause Pareto Analysis** (Frequency, cumulative minutes lost, and financial cost broken down by delay category).
  - Tab 3: **Specialty Benchmark Calibration** (Configurable Same-Surgeon and Different-Surgeon benchmark standards per specialty).
- **Interactive Delay Attribution Modal:** Pinned flex layout modal for logging clinical delay codes and notes.
- **Design System Standard:** Strictly ZERO prohibited purple/violet/indigo/magenta/fuchsia tokens. High contrast clinical slate, blue, emerald, amber, and crimson.

## Audit / Provenance
- All turnover records retain `prior_case_id`, `next_case_id`, timestamps, and user provenance.
- Benchmark modifications record updated by, previous benchmark, new benchmark, and justification.

## QA / Test Cases
1. **Turnover Duration Math:** Test normal positive turnover, zero minute, and negative validation rejection.
2. **Same vs Different Surgeon Benchmark:** Verify dynamic assignment based on surgeon name equivalence.
3. **Turnover Variance & Status:** Test on-time ($\le 0$), minor delay ($1\text{m}-10\text{m}$), and prolonged ($> 10\text{m}$).
4. **Financial Idle Cost:** Test exact mathematical output at $\$650.00/\text{hr}$ staffed room run-rate.
5. **Database Migration 084:** Verify forward UP and rollback DOWN scripts and multi-tenant RLS.
6. **Design System & Zero Purple Compliance:** Strict audit of all tokens in JSX and CSS.
7. **App.jsx Integration:** Verify component mounting and navigation.

## Acceptance Criteria
- Build passes (`npm run build`).
- Automated test suite passes (`tests/turnover-metrics.test.js`).
- Clean multi-tenant isolation via `app.current_facility_id`.
- Zero prohibited design tokens in code and styling.
- P0/P1 issues block release.

## Dependencies
- Upstream:
  - Phase A0 (`077_operating_room_model.sql` - Physical suites)
  - Phase A1 (`078_room_staffing_windows.sql` - Staffed room hours)
  - Phase A2 (`079_block_schedule_model.sql` - Block schedules)
  - Phase A4 (`081_or_utilization_metrics.sql` - Utilization metrics)
  - Phase A6 (`083_booking_accuracy.sql` - Booking accuracy)

## Definition of Done
Complete data model, migration UP/DOWN scripts, deterministic service layer, React views with scoped CSS, automated test suite, App.jsx wiring, and master documentation.

## Implementation Notes
- Migration: `084_turnover_metrics.sql` and `084_turnover_metrics_down.sql`.
- Service: `src/services/turnoverMetricsService.js` and `src/lib/turnoverMetricsService.js`.
- UI: `src/components/TurnoverMetricsView.jsx` and `src/components/TurnoverMetricsView.css`.
- Tests: `tests/turnover-metrics.test.js`.
- App Wiring: `src/App.jsx`.

