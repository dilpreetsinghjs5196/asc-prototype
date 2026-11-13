# A6 BOOKING ACCURACY

## Purpose
Booked vs actual case duration metrics, scheduling variance analytics, surgeon duration bias classification, and procedural time calibration. Establishes mathematical precision to identify chronic under-booking (which causes room delays and clinical overtime) and chronic over-booking / padding (which creates unusable idle prime-time gaps), delivering actionable scheduling recommendations to optimize OR flow.

## Scope
- Define production requirements for measuring scheduled vs actual in-room case duration across all surgical cases and procedures.
- Preserve backward compatibility with ASCANALYST scheduling logs, surgeon master, and room staffing windows.
- Enforce deterministic, auditable rules: Duration Variance ($\Delta D$), Variance Percentage ($\% \Delta$), Accuracy Classification (`ACCURATE`, `UNDER_ESTIMATED`, `OVER_ESTIMATED`), and Mean Duration Bias (MDB).
- Formulate the Surgeon Scheduling Tendency profile: Chronic Under-Booker (optimism bias), Calibrated Scheduler, and Chronic Padder (defensive buffering).
- Calculate operational and financial impact: Cascading downstream delay minutes, unrecoverable idle gap hours, and attributable overtime labor costs ($450.00/hr).
- Provide procedure-level (CPT) duration calibration comparing scheduled time against historical 20-case median in-room times.
- Enforce organization/facility tenancy and RBAC.

## Current State
| Component | Status | Description |
| :--- | :---: | :--- |
| `src/components/SurgeryScheduler.jsx` | **KEEP** | Standard surgery logging containing scheduled and completed timestamps. |
| `src/components/CaseLogScheduler.jsx` | **KEEP** | Historical case duration records and scheduling optimization models. |
| `078_room_staffing_windows.sql` | **KEEP** | Staffed shift boundaries for evaluating overtime infractions. |
| Booking Accuracy Analytics | **MISSING** | No dedicated production schema, service layer, or UI tracking duration variance, surgeon scheduling bias, or CPT duration calibration exists. |

## Target State
1. **Deterministic Case Accuracy Ledger:** Authoritative table `or_case_booking_accuracy_logs` capturing scheduled duration, actual wheels-in to wheels-out duration, variance minutes, accuracy tier, downstream delay attribution, and CPT historical median benchmarks.
2. **Surgeon Booking Tendency Profiles:** Authoritative table `or_surgeon_booking_profiles` recording accuracy rate %, mean duration bias minutes, scheduling tendency (`CHRONIC_UNDER_BOOKER`, `CALIBRATED`, `CHRONIC_PADDER`), total overrun/underrun hours, and financial delay impact.
3. **CPT Historical Duration Calibration:** Deterministic procedure-level baselining that surfaces discrepancies between scheduled durations and empirical 20-case median actual durations to prevent schedule distortion.
4. **Interactive Executive Console:** Multi-tab interface delivering Case Booking Accuracy Ledgers, Surgeon Bias & Tendency Matrices, CPT Duration Calibration Benchmarks, and Scheduling Calibration Action Workflows.

## Data Model / Schema

### Table: `public.or_case_booking_accuracy_logs`
- `id`: UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `facility_id`: UUID NOT NULL REFERENCES `public.facilities(id)` ON DELETE CASCADE
- `case_id`: VARCHAR(64) NOT NULL
- `surgery_date`: DATE NOT NULL
- `operating_room_id`: UUID NOT NULL REFERENCES `public.operating_rooms(id)` ON DELETE CASCADE
- `surgeon_id`: UUID
- `surgeon_name`: VARCHAR(255) NOT NULL
- `specialty_code`: VARCHAR(64) NOT NULL
- `primary_cpt_code`: VARCHAR(32) NOT NULL
- `procedure_name`: VARCHAR(255) NOT NULL
- `scheduled_duration_minutes`: INTEGER NOT NULL
- `actual_in_room_minutes`: INTEGER NOT NULL
- `duration_variance_minutes`: INTEGER NOT NULL (Actual - Scheduled)
- `variance_pct`: NUMERIC(5, 2) NOT NULL
- `accuracy_status`: VARCHAR(32) NOT NULL (`ACCURATE`, `UNDER_ESTIMATED`, `OVER_ESTIMATED`)
- `downstream_delay_minutes`: INTEGER NOT NULL DEFAULT 0
- `caused_room_overtime`: BOOLEAN NOT NULL DEFAULT FALSE
- `overtime_minutes`: INTEGER NOT NULL DEFAULT 0
- `historical_median_cpt_minutes`: INTEGER NOT NULL
- `variance_from_cpt_median_minutes`: INTEGER NOT NULL
- `created_at`: TIMESTAMPTZ NOT NULL DEFAULT NOW()

### Table: `public.or_surgeon_booking_profiles`
- `id`: UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `facility_id`: UUID NOT NULL REFERENCES `public.facilities(id)` ON DELETE CASCADE
- `surgeon_name`: VARCHAR(255) NOT NULL
- `specialty_code`: VARCHAR(64) NOT NULL
- `evaluated_cases_count`: INTEGER NOT NULL DEFAULT 0
- `accurate_cases_count`: INTEGER NOT NULL DEFAULT 0
- `under_estimated_cases_count`: INTEGER NOT NULL DEFAULT 0
- `over_estimated_cases_count`: INTEGER NOT NULL DEFAULT 0
- `overall_accuracy_rate_pct`: NUMERIC(5, 2) NOT NULL DEFAULT 0.00
- `mean_duration_bias_minutes`: NUMERIC(5, 2) NOT NULL DEFAULT 0.00
- `scheduling_tendency`: VARCHAR(32) NOT NULL DEFAULT 'CALIBRATED' (`CHRONIC_UNDER_BOOKER`, `CALIBRATED`, `CHRONIC_PADDER`)
- `total_overrun_minutes`: INTEGER NOT NULL DEFAULT 0
- `total_idle_gap_minutes`: INTEGER NOT NULL DEFAULT 0
- `net_financial_delay_impact`: NUMERIC(10, 2) NOT NULL DEFAULT 0.00
- `calibration_action`: VARCHAR(64) NOT NULL DEFAULT 'MONITOR'
- `updated_at`: TIMESTAMPTZ NOT NULL DEFAULT NOW()

### Analytical Views:
1. `public.vw_or_booking_accuracy_facility_summary`: Facility-wide aggregate accuracy metrics, overrun vs underrun ratios, and total delay impact.
2. `public.vw_or_surgeon_scheduling_bias`: Surgeon booking profiles ranked by Mean Duration Bias (MDB) and overtime impact.

## Business Rules

### Rule 1: Duration Variance & Accuracy Classification
$$\Delta D = \text{Actual In-Room Minutes} - \text{Scheduled Duration Minutes}$$
$$\% \Delta = \left( \frac{\Delta D}{\text{Scheduled Duration Minutes}} \right) \times 100$$
- **Operational Tolerance Threshold:** $\pm 15\text{ minutes}$ (or $\pm 15\%$).
- Classification:
  - `ACCURATE`: $|\Delta D| \le 15\text{ minutes}$. Case executed on target.
  - `UNDER_ESTIMATED`: $\Delta D > +15\text{ minutes}$. Case overrun (under-booked).
  - `OVER_ESTIMATED`: $\Delta D < -15\text{ minutes}$. Case underrun (padded / over-booked).

### Rule 2: Surgeon Mean Duration Bias (MDB) & Tendency Index
$$\text{MDB} = \frac{\sum_{i=1}^N \Delta D_i}{N}$$
- If $\text{MDB} > +10.0\text{ mins}$: `CHRONIC_UNDER_BOOKER` $\to$ Chronic optimism bias; causes schedule cascading delays and clinical overtime.
- If $\text{MDB} < -10.0\text{ mins}$: `CHRONIC_PADDER` $\to$ Chronic defensive padding; causes unfillable prime-time gaps and artificial capacity starvation.
- If $-10.0 \le \text{MDB} \le +10.0\text{ mins}$: `CALIBRATED` $\to$ Reliable scheduling accuracy within facility tolerance.

### Rule 3: Downstream Delay & Overtime Impact Calculation
- If a case is classified as `UNDER_ESTIMATED` and ends after its scheduled end time:
  $$\text{Downstream Delay} = \min(\text{Overrun Minutes}, \text{Wait Time of Next Case Wheels-In})$$
- Overtime Cost Attribution:
  $$\text{Overtime Labor Cost} = \left( \frac{\text{Attributable Overtime Minutes}}{60} \right) \times \$450.00/\text{hr}$$
  (Based on standard clinical crew overhead of RN circulator, scrub tech, and anesthesia provider).

### Rule 4: Historical CPT Duration Calibration Benchmark
$$\text{Recommended Duration} = \text{Median}(\text{Surgeon's Last 20 Actual Durations for CPT } X)$$
- If $|\text{Scheduled Minutes} - \text{Recommended Duration}| > 20\text{ minutes}$, flag case scheduling as `DURATION_DISCREPANCY_WARNING` during booking intake.

## Permissions / Security
- Multi-tenancy isolation via PostgreSQL Row-Level Security:
  `USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)`
- RBAC Matrix:
  - `super_admin`, `org_admin`, `clinical_director`: Full View, Adjust Calibration Profiles, Authorize Mandatory Duration Baselines, and Export Audit Ledgers.
  - `nurse_manager`, `scheduler`: View Accuracy Ledgers, View CPT Calibration Guidelines, Suggest Duration Adjustments.
  - `surgeon_user`: Restricted View of own booking accuracy profile, personal MDB, and peer anonymized specialty benchmarks.

## API / Service Requirements
- `calculateDurationVariance(actualMinutes, scheduledMinutes)`
- `classifyAccuracyStatus(varianceMinutes, toleranceMinutes = 15)`
- `calculateMeanDurationBias(caseVariances = [])`
- `determineSchedulingTendency(meanDurationBias)`
- `calculateOverrunLaborCost(overtimeMinutes, hourlyRate = 450)`
- `calculateFacilityAccuracyKpis(caseLogs, surgeonProfiles)`
- `filterBookingAccuracyLogs(logs, filters)`

## UI / Workflow Requirements
- **5-Card Operational Ribbon:** Overall Booking Accuracy Rate %, Mean Duration Bias (mins), Total Delay Minutes Generated, Idle Gap Wastage Hours, and Overtime Infraction Cost ($).
- **View Switcher:**
  - View 1: **Case-by-Case Accuracy Ledger** (Detailed log of scheduled vs actual times, variance pill, downstream delay, and overtime tag).
  - View 2: **Surgeon Booking Tendency Matrix** (Surgeon scorecards displaying accuracy rate, MDB, scheduling tendency badge, and calibration status).
  - View 3: **CPT Duration Calibration Benchmarks** (Procedure-level comparison of booked times against historical 20-case median durations).
- **Interactive Calibration Modal:** Adjust surgeon default scheduling templates or enforce mandatory historical median duration rules.
- **Design System Standard:** Strictly ZERO prohibited purple/violet/indigo/magenta/fuchsia tokens. High contrast `#ffffff` modals, `#0f172a` headers, and crisp blue/teal/emerald clinical palette.

## Audit / Provenance
- Case logs record `case_id`, `surgery_date`, `scheduled_duration_minutes`, `actual_in_room_minutes`, and source timestamp.
- Template calibration adjustments record executive user ID, previous template duration, revised template duration, and clinical justification.

## QA / Test Cases
1. **Taxonomy & Formula Definitions:** Test tolerance windows ($\pm 15\text{m}$) and MDB classification thresholds ($\pm 10\text{m}$).
2. **Variance & Accuracy Logic:** Verify exact math for on-time, overrun (+30m), and underrun (-30m) cases.
3. **Surgeon Bias Index Calculation:** Test negative bias (padder), positive bias (under-booker), and balanced bias.
4. **Downstream Delay & Financial Impact:** Test labor overtime cost calculation with various crew rates.
5. **Database Migration 083:** Verify forward UP and rollback DOWN scripts and multi-tenant RLS.
6. **Design System & Zero Purple Compliance:** Strict audit of all tokens in JSX and CSS.
7. **App.jsx Integration:** Verify component mounting and navigation.

## Acceptance Criteria
- Build passes (`npm run build`).
- Automated test suite passes (`tests/booking-accuracy.test.js`).
- Clean multi-tenant isolation via `app.current_facility_id`.
- Zero prohibited design tokens in code and styling.
- P0/P1 issues block release.

## Dependencies
- Upstream:
  - Phase A0 (`077_operating_room_model.sql`)
  - Phase A1 (`078_room_staffing_windows.sql`)
  - Phase A2 (`079_block_schedule_model.sql`)
  - Phase A4 (`081_or_utilization_metrics.sql`)
  - Phase A5 (`082_block_utilization_metrics.sql`)

## Definition of Done
Complete data model, migration UP/DOWN scripts, deterministic service layer, React views with scoped CSS, automated test suite, App.jsx wiring, and master documentation.

## Implementation Notes
- Migration: `supabase/migrations/083_booking_accuracy.sql`
- Rollback: `supabase/migrations/083_booking_accuracy_down.sql`
- Service: `src/services/bookingAccuracyService.js` and `src/lib/bookingAccuracyService.js`
- View: `src/components/BookingAccuracyView.jsx` and `src/components/BookingAccuracyView.css`
- Test: `tests/booking-accuracy.test.js`
- Wiring: `src/App.jsx`

