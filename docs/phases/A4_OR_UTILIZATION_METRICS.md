# A4 OR UTILIZATION METRICS

## Purpose
Authoritative Operating Room utilization models, formulas, and reporting architecture. Establishes mathematical precision and deterministic rules for calculating Gross Staffed Utilization, Prime-Time Utilization, Turnover-Inclusive Occupancy, and Surgeon Block Utilization (with statutory on-time surrender denominator deductions). Delivers multi-tenant executive scorecards, surgeon block rightsizing governance, and financial yield per staffed OR hour.

## Scope
- Define production requirements for operating room utilization across all surgical suites, procedure rooms, and endoscopy suites.
- Preserve backward compatibility with ASCANALYST scheduling and case log tables.
- Enforce deterministic, auditable formulas: Gross Staffed Utilization, Prime-Time Utilization, Turnover-Inclusive Occupancy, and Adjusted Block Utilization.
- Implement surgeon block denominator deduction rules: On-time block releases deduct from allocated minutes ($\Delta M = M_{\text{alloc}} - M_{\text{released}}$), while late releases and idle hours remain in the denominator.
- Provide financial yield metrics: Net Revenue per OR Hour, Contribution Margin per OR Hour, and Labor Idle Cost per Unutilized Staffed Hour.
- Enforce organization/facility tenancy and RBAC.

## Current State
| Component | Status | Description |
| :--- | :---: | :--- |
| `src/App.jsx` (`or` tab) | **REPLACE** | Displays hardcoded/approximate bar heights and unverified turnover metrics without denominator synchronization. |
| `077_operating_room_model.sql` | **KEEP** | Authoritative suite definitions, room numbers, physical capabilities, and suite designations. |
| `078_room_staffing_windows.sql` | **KEEP** | Authoritative operational shifts, planned closures, and net staffed denominator minutes ($M_{\text{staffed}}$). |
| `079_block_schedule_model.sql` | **KEEP** | Block allocations, ownership tiers, recurrence schedules, and target utilization benchmarks (default 75.0%). |
| `080_block_release_events.sql` | **KEEP** | Single-date block surrenders, notice lead-time timeliness ratings (`ON_TIME`, `LATE_RELEASE`), and open pool reallocations. |
| Utilization Metrics Tables | **MISSING** | No dedicated daily room snapshot table or surgeon block utilization compliance tracking table exists. |

## Target State
1. **Deterministic Daily OR Snapshots:** Authoritative table `or_utilization_daily_snapshots` recording exact staffed minutes, in-room case minutes (wheels-in to wheels-out), turnover minutes, prime-time minutes, overtime minutes, and raw/adjusted utilization percentages.
2. **Surgeon Block Utilization Compliance:** Authoritative table `or_surgeon_block_utilization_snapshots` tracking allocated block time, on-time surrendered deductions, in-block case time, compliance tier (`EXCEEDS_BENCHMARK`, `MEETS_BENCHMARK`, `UNDERUTILIZED_WARNING`, `CRITICAL_UNDERUTILIZATION`), and rightsizing recommendations.
3. **Financial Utilization Integration:** Ties clinical case time directly to revenue and contribution margin per staffed OR hour to highlight high-yield surgical services.
4. **Interactive Executive Console:** Multi-view dashboard offering Room Utilization breakdowns, Surgeon Block Governance Ledgers, and Financial Efficiency scorecards.

## Data Model / Schema
### Table: `public.or_utilization_daily_snapshots`
- `id`: UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `facility_id`: UUID NOT NULL REFERENCES `public.facilities(id)`
- `operating_room_id`: UUID NOT NULL REFERENCES `public.operating_rooms(id)`
- `utilization_date`: DATE NOT NULL
- `staffed_minutes`: INTEGER NOT NULL DEFAULT 0 (from Phase A1 denominator)
- `prime_time_staffed_minutes`: INTEGER NOT NULL DEFAULT 0 (default 480 min: 07:00–15:00)
- `in_room_case_minutes`: INTEGER NOT NULL DEFAULT 0 (wheels-in to wheels-out)
- `turnover_minutes`: INTEGER NOT NULL DEFAULT 0 (room turnover between consecutive cases)
- `prime_time_case_minutes`: INTEGER NOT NULL DEFAULT 0 (case minutes within 07:00–15:00)
- `overtime_minutes`: INTEGER NOT NULL DEFAULT 0 (case minutes extending past staffed window)
- `unutilized_staffed_minutes`: INTEGER NOT NULL DEFAULT 0 ($\max(0, \text{staffed} - \text{in\_room} - \text{turnover})$)
- `raw_utilization_pct`: NUMERIC(5, 2) NOT NULL DEFAULT 0.00
- `turnover_inclusive_utilization_pct`: NUMERIC(5, 2) NOT NULL DEFAULT 0.00
- `prime_time_utilization_pct`: NUMERIC(5, 2) NOT NULL DEFAULT 0.00
- `case_count`: INTEGER NOT NULL DEFAULT 0
- `delayed_starts_count`: INTEGER NOT NULL DEFAULT 0
- `calculated_at`: TIMESTAMPTZ NOT NULL DEFAULT NOW()
- `calculation_version`: VARCHAR(32) NOT NULL DEFAULT 'v1.0-deterministic'

### Table: `public.or_surgeon_block_utilization_snapshots`
- `id`: UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `facility_id`: UUID NOT NULL REFERENCES `public.facilities(id)`
- `block_definition_id`: UUID NOT NULL REFERENCES `public.or_block_definitions(id)`
- `surgeon_id`: UUID (nullable for group/service line blocks)
- `surgeon_name`: VARCHAR(255) NOT NULL
- `specialty_code`: VARCHAR(64) NOT NULL
- `reporting_period_start`: DATE NOT NULL
- `reporting_period_end`: DATE NOT NULL
- `allocated_block_minutes`: INTEGER NOT NULL
- `on_time_released_minutes`: INTEGER NOT NULL DEFAULT 0
- `late_released_minutes`: INTEGER NOT NULL DEFAULT 0
- `net_adjusted_denominator_minutes`: INTEGER NOT NULL
- `utilized_in_block_minutes`: INTEGER NOT NULL DEFAULT 0
- `utilized_out_of_block_minutes`: INTEGER NOT NULL DEFAULT 0
- `block_utilization_pct`: NUMERIC(5, 2) NOT NULL DEFAULT 0.00
- `target_utilization_pct`: NUMERIC(5, 2) NOT NULL DEFAULT 75.00
- `utilization_tier`: VARCHAR(32) NOT NULL
- `total_cases_performed`: INTEGER NOT NULL DEFAULT 0
- `net_revenue_generated`: NUMERIC(12, 2) NOT NULL DEFAULT 0.00
- `contribution_margin_generated`: NUMERIC(12, 2) NOT NULL DEFAULT 0.00
- `rightsizing_recommendation`: VARCHAR(64) NOT NULL DEFAULT 'MAINTAIN_BLOCK'
- `calculated_at`: TIMESTAMPTZ NOT NULL DEFAULT NOW()

### Analytical Views:
1. `public.vw_or_utilization_facility_summary`: Rollup by facility and month of gross staffed, prime-time, turnover-inclusive, and overtime utilization.
2. `public.vw_or_surgeon_block_compliance`: Surgeon-by-surgeon utilization scorecards against target benchmarks.

## Business Rules

### Rule 1: Gross Staffed Utilization Formula
$$\text{Gross Staffed Utilization (\%)} = \left( \frac{\sum \text{In-Room Case Minutes}}{\text{Net Staffed Available Minutes}} \right) \times 100$$
- In-Room Case Minutes: Total elapsed minutes between patient Wheels-In and patient Wheels-Out.
- Net Staffed Available Minutes: Sourced authoritatively from Phase A1 `room_staffing_windows` (planned shifts minus closures/downtime plus authorized overtime extensions).
- If Net Staffed Available Minutes = 0, utilization is defined as 0.00%.

### Rule 2: Turnover-Inclusive Occupancy Formula
$$\text{Turnover-Inclusive Occupancy (\%)} = \left( \frac{\sum (\text{In-Room Case Minutes} + \text{Turnover Minutes})}{\text{Net Staffed Available Minutes}} \right) \times 100$$
- Turnover minutes are capped at a maximum of 45 minutes per changeover to prevent penalizing the facility for prolonged, unworked downtime.

### Rule 3: Prime-Time Utilization Formula
$$\text{Prime-Time Utilization (\%)} = \left( \frac{\sum \text{Case Minutes within 07:00–15:00}}{\text{Prime-Time Staffed Minutes}} \right) \times 100$$
- Cases starting before 07:00 or running after 15:00 are truncated to only the minutes elapsed within the 07:00–15:00 prime-time boundary.

### Rule 4: Surgeon Block Denominator Deduction Rule
$$\text{Net Block Denominator} = \text{Allocated Block Minutes} - \text{On-Time Released Minutes}$$
$$\text{Block Utilization (\%)} = \left( \frac{\text{Utilized In-Block Minutes}}{\text{Net Block Denominator}} \right) \times 100$$
- If a surgeon voluntarily releases their block $\ge 120\text{ hours}$ in advance (classified as `ON_TIME` in Phase A3), the surrendered time is **deducted** from their utilization denominator.
- If surrendered **late** ($< 120\text{ hours}$) or left unutilized, the minutes remain in the denominator, properly reflecting block hoarding.
- If Net Block Denominator = 0 (100% compliant surrender), the block is designated as `FULL_SURRENDER_EXCUSED`.

### Rule 5: Block Governance Tiers & Rightsizing Action
- $\ge 85.0\%$: `EXCEEDS_BENCHMARK` $\to$ Candidate for Block Expansion.
- $75.0\% - 84.9\%$: `MEETS_BENCHMARK` $\to$ Maintain Block Allocation.
- $60.0\% - 74.9\%$: `UNDERUTILIZED_WARNING` $\to$ Utilization Warning Notice (60-day review).
- $< 60.0\%$: `CRITICAL_UNDERUTILIZATION` $\to$ Rightsizing Action (Partial forfeiture or frequency reduction).

## Permissions / Security
- Multi-tenancy isolation via PostgreSQL Row-Level Security:
  `USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)`
- RBAC Matrix:
  - `super_admin`, `org_admin`, `facility_admin`, `clinical_director`: Full View, Snapshot Regeneration, Rightsizing Action Authorization, and Audit Export.
  - `nurse_manager`, `scheduler`: View Room Utilization, View Surgeon Block Ledger.
  - `surgeon_user`: Restricted View of own block utilization scorecard and peer anonymized specialty benchmarks.

## API / Service Requirements
- `calculateRawUtilizationPct(inRoomMinutes, staffedMinutes)`
- `calculateTurnoverInclusivePct(inRoomMinutes, turnoverMinutes, staffedMinutes)`
- `calculatePrimeTimeUtilizationPct(primeCaseMinutes, primeStaffedMinutes)`
- `calculateBlockUtilization(utilizedMinutes, allocatedMinutes, onTimeReleasedMinutes)`
- `determineUtilizationTier(utilizationPct, targetPct)`
- `calculateFinancialYieldPerOrHour(totalRevenue, totalContributionMargin, utilizedMinutes, staffedMinutes)`
- `calculateFacilityUtilizationKpis(dailySnapshots, blockSnapshots)`

## UI / Workflow Requirements
- **5-Card Operational Ribbon:** Gross Staffed Utilization %, Prime-Time Utilization %, Turnover-Inclusive Occupancy %, Block Compliance Rate %, and Contribution Margin per Staffed Hour.
- **View Switcher:**
  - View 1: **Room Utilization Matrix** (Suite-by-suite breakdown of staffed hours, in-room case time, turnover time, idle time, and prime-time metrics).
  - View 2: **Surgeon Block Scorecards & Rightsizing Ledger** (Surgeon block performance, adjusted denominator accounting for on-time surrenders, compliance tier, and rightsizing recommendations).
  - View 3: **Financial Utilization & Efficiency Scorecard** (Revenue and Contribution Margin generated per staffed and utilized OR hour).
- **Interactive Rightsizing Modal:** Review 90-day block performance, examine surrender compliance, and view rightsizing recommendations.
- **Design System Standard:** Strictly ZERO prohibited purple/violet/indigo/magenta/fuchsia tokens. High contrast `#ffffff` modals, `#0f172a` headers, and crisp blue/teal/emerald clinical palette.

## Audit / Provenance
- Every daily snapshot records `utilization_date`, `calculated_at`, `calculation_version`, and source case log hash.
- Rightsizing actions record executive user ID, timestamp, prior block allocation, and revised block allocation.

## QA / Test Cases
1. **Taxonomy & Benchmarks:** Verify tier thresholds (85%, 75%, 60%) and prime-time window definitions.
2. **Gross Staffed & Prime-Time Math:** Test edge cases (0 staffed minutes, 100% utilization, partial prime-time truncation).
3. **Turnover-Inclusive Logic:** Validate 45-minute turnover caps and verify no negative idle minutes.
4. **Surgeon Block Deduction Engine:** Verify that on-time releases deduct from the denominator while late releases remain in the denominator.
5. **Database Migration 081:** Test forward UP and backward DOWN idempotent execution and RLS multi-tenancy enforcement.
6. **Maestro Design System:** Zero prohibited design tokens across JSX and CSS.
7. **App.jsx Integration:** Verify proper component mounting, sidebar entry, and header display.

## Acceptance Criteria
- Build passes (`npm run build`).
- Automated test suite passes (`tests/or-utilization-metrics.test.js`).
- Clean multi-tenant isolation via `app.current_facility_id`.
- Zero prohibited design tokens in code and styling.
- P0/P1 issues block release.

## Dependencies
- Upstream:
  - Phase A0 (`077_operating_room_model.sql`)
  - Phase A1 (`078_room_staffing_windows.sql`)
  - Phase A2 (`079_block_schedule_model.sql`)
  - Phase A3 (`080_block_release_events.sql`)

## Definition of Done
Complete data model, migration UP/DOWN scripts, deterministic service layer, React views with scoped CSS, automated test suite, App.jsx wiring, and master documentation.

## Implementation Notes
- Migration: `supabase/migrations/081_or_utilization_metrics.sql`
- Rollback: `supabase/migrations/081_or_utilization_metrics_down.sql`
- Service: `src/services/orUtilizationMetricsService.js` and `src/lib/orUtilizationMetricsService.js`
- View: `src/components/OrUtilizationMetricsView.jsx` and `src/components/OrUtilizationMetricsView.css`
- Test: `tests/or-utilization-metrics.test.js`
- Wiring: `src/App.jsx`

