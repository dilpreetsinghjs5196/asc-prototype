# A5 BLOCK UTILIZATION METRICS

## Purpose
Authoritative Operating Room block utilization models, unutilized block time tracking, release efficiency, and financial yield metrics. Establishes mathematical precision for evaluating surgeon block adherence, idle block wastage, out-of-block case spillover, the Surgeon Block Performance Index (SBPI), and automated Medical Executive Committee (MEC) rightsizing actions.

## Scope
- Define production requirements for individual, surgical group, and service line block allocations.
- Preserve backward compatibility with ASCANALYST scheduling, block definition, and block release tables.
- Enforce deterministic, auditable formulas: Adjusted Block Utilization %, Raw Block Utilization %, Release Compliance %, Unused Abandoned Block Wastage, and Opportunity Cost ($).
- Formulate the Surgeon Block Performance Index (SBPI): Multi-factor composite weighting utilization (50%), release timeliness (30%), and case volume consistency (20%).
- Provide executive rightsizing workflows: Automated identification of block expansion candidates (≥85% SBPI) vs chronic underutilizers (<60% SBPI) subject to frequency reduction (Weekly to EOW) or block forfeiture.
- Enforce organization/facility tenancy and RBAC.

## Current State
| Component | Status | Description |
| :--- | :---: | :--- |
| `079_block_schedule_model.sql` | **KEEP** | Authoritative block schedule definitions, recurrence patterns, and baseline target benchmarks (default 75.0%). |
| `080_block_release_events.sql` | **KEEP** | Single-date surrender records, timeliness rating (`ON_TIME`, `LATE_RELEASE`), and open pool reallocations. |
| `081_or_utilization_metrics.sql` | **KEEP** | Room-level daily snapshots and 90-day surgeon block compliance snapshots. |
| Block Economics & Wastage Tables | **MISSING** | No dedicated period ledger tracking idle block wastage, out-of-block utilization, SBPI composite scoring, or committee governance actions exists. |

## Target State
1. **Periodic Block Utilization Ledgers:** Authoritative table `or_block_utilization_period_ledgers` recording allocated minutes, in-block utilization, on-time releases, late releases, abandoned unused minutes, out-of-block minutes, SBPI score, and opportunity cost.
2. **Block Governance Actions Log:** Authoritative table `or_block_governance_actions` capturing formal committee recommendations (expansion, 60-day probation, downgrade to alternate weeks, or prime forfeiture) with audit trail and approval workflows.
3. **Surgeon Block Performance Index (SBPI):** A deterministic 0–100 rating that rewards high utilization and early block surrender while heavily penalizing hoarded unused time and same-day cancellations.
4. **Interactive Executive Console:** Multi-view interface delivering Block Performance Ledgers, Block Wastage & Opportunity Cost Rankings, Out-of-Block Spillover Tracking, and Rightsizing Committee Action Workflows.

## Data Model / Schema

### Table: `public.or_block_utilization_period_ledgers`
- `id`: UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `facility_id`: UUID NOT NULL REFERENCES `public.facilities(id)` ON DELETE CASCADE
- `block_definition_id`: UUID NOT NULL REFERENCES `public.or_block_definitions(id)` ON DELETE CASCADE
- `surgeon_id`: UUID (nullable for group/service line blocks)
- `surgeon_name`: VARCHAR(255) NOT NULL
- `specialty_code`: VARCHAR(64) NOT NULL
- `period_type`: VARCHAR(32) NOT NULL DEFAULT 'MONTHLY' (`WEEKLY`, `MONTHLY`, `QUARTERLY`)
- `period_start`: DATE NOT NULL
- `period_end`: DATE NOT NULL
- `allocated_minutes`: INTEGER NOT NULL
- `utilized_minutes`: INTEGER NOT NULL DEFAULT 0
- `on_time_released_minutes`: INTEGER NOT NULL DEFAULT 0
- `late_released_minutes`: INTEGER NOT NULL DEFAULT 0
- `unused_abandoned_minutes`: INTEGER NOT NULL DEFAULT 0
- `out_of_block_minutes`: INTEGER NOT NULL DEFAULT 0
- `adjusted_utilization_pct`: NUMERIC(5, 2) NOT NULL DEFAULT 0.00
- `raw_utilization_pct`: NUMERIC(5, 2) NOT NULL DEFAULT 0.00
- `release_compliance_pct`: NUMERIC(5, 2) NOT NULL DEFAULT 0.00
- `sbpi_score`: NUMERIC(5, 2) NOT NULL DEFAULT 0.00
- `wastage_opportunity_cost`: NUMERIC(10, 2) NOT NULL DEFAULT 0.00
- `rightsizing_action`: VARCHAR(64) NOT NULL DEFAULT 'MAINTAIN'
- `created_at`: TIMESTAMPTZ NOT NULL DEFAULT NOW()

### Table: `public.or_block_governance_actions`
- `id`: UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `facility_id`: UUID NOT NULL REFERENCES `public.facilities(id)` ON DELETE CASCADE
- `block_definition_id`: UUID NOT NULL REFERENCES `public.or_block_definitions(id)` ON DELETE CASCADE
- `action_type`: VARCHAR(64) NOT NULL (`RIGHTSIZE_DOWNGRADE`, `EXPAND_ALLOCATION`, `PROBATIONARY_NOTICE`, `SCHEDULE_ADJUSTMENT`, `VOLUNTARY_CONCESSION`)
- `action_status`: VARCHAR(32) NOT NULL DEFAULT 'PENDING_COMMITTEE_REVIEW' (`PENDING_COMMITTEE_REVIEW`, `APPROVED_EXECUTED`, `REJECTED`, `APPEAL_SUBMITTED`)
- `effective_date`: DATE NOT NULL
- `previous_allocation_minutes`: INTEGER NOT NULL
- `proposed_allocation_minutes`: INTEGER NOT NULL
- `executive_rationale`: TEXT
- `approved_by_user_id`: UUID
- `created_at`: TIMESTAMPTZ NOT NULL DEFAULT NOW()

### Analytical Views:
1. `public.vw_or_block_utilization_summary`: Comprehensive summary by block definition, owner, period, and performance metrics.
2. `public.vw_or_block_wastage_leaderboard`: Ranked listing of blocks by unused abandoned minutes and financial opportunity cost.

## Business Rules

### Rule 1: Adjusted Block Utilization Formula
$$\text{Net Block Denominator} = \text{Allocated Minutes} - \text{On-Time Released Minutes}$$
$$\text{Adjusted Block Utilization (\%)} = \left( \frac{\text{Utilized In-Block Minutes}}{\text{Net Block Denominator}} \right) \times 100$$
- On-time releases ($\ge 120\text{h}$) reduce the denominator.
- Late releases ($< 120\text{h}$) remain in the denominator.
- If Net Denominator = 0, utilization is classified as 100% (Excused Surrender).

### Rule 2: Unused Abandoned Block Wastage & Opportunity Cost
$$\text{Unused Abandoned Minutes} = \max(0, \text{Allocated Minutes} - \text{Utilized Minutes} - \text{On-Time Released Minutes} - \text{Late Released Minutes})$$
$$\text{Opportunity Cost (\$)} = \left( \frac{\text{Unused Abandoned Minutes}}{60} \right) \times \text{Facility Contribution Margin per OR Hour}$$
- Default ASC contribution margin benchmark: \$1,250.00/hr.
- Represents the gross margin forfeited due to block hoarding without surrender into the open pool.

### Rule 3: Release Compliance Rate
$$\text{Total Released Minutes} = \text{On-Time Released Minutes} + \text{Late Released Minutes}$$
$$\text{Release Compliance (\%)} = \begin{cases} 100.00\% & \text{if Total Released Minutes} = 0 \text{ and Utilization} \ge 75\% \\ \left( \frac{\text{On-Time Released Minutes}}{\text{Total Released Minutes}} \right) \times 100 & \text{if Total Released Minutes} > 0 \\ 0.00\% & \text{otherwise} \end{cases}$$

### Rule 4: Surgeon Block Performance Index (SBPI)
$$\text{SBPI} = (0.50 \times \text{Adjusted Utilization \%}) + (0.30 \times \text{Release Compliance \%}) + (0.20 \times \text{Out-of-Block Absorption Ratio})$$
- Out-of-Block Absorption Ratio measures whether the surgeon's overall caseload demands more or less time than their assigned block.
- Clamped to a scale of 0.00 to 100.00.

### Rule 5: Medical Executive Committee (MEC) Rightsizing Protocols
- **SBPI ≥ 85.0 & Utilization ≥ 85.0%:** `EXPAND_ALLOCATION` $\to$ Eligible for additional block hours or promotion to prime morning timeslot.
- **75.0 ≤ SBPI < 85.0 & Utilization ≥ 75.0%:** `MAINTAIN` $\to$ Block allocation secured for next 90-day cycle.
- **60.0 ≤ SBPI < 75.0:** `PROBATIONARY_NOTICE` $\to$ Formal 60-day remediation period; required to surrender unused time $\ge 120\text{h}$ in advance.
- **SBPI < 60.0:** `RIGHTSIZE_DOWNGRADE` $\to$ Immediate reduction of allocation (e.g. 8h to 4h, or Weekly to Alternate Weeks / EOW).

## Permissions / Security
- Multi-tenancy isolation via PostgreSQL Row-Level Security:
  `USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)`
- RBAC Matrix:
  - `super_admin`, `org_admin`, `clinical_director`: Full View, Run Rightsizing Engine, Approve Governance Actions, Export Audit Reports.
  - `nurse_manager`, `scheduler`: View Block Metrics, View Wastage Reports.
  - `surgeon_user`: Restricted View of own block utilization metrics and peer anonymized specialty benchmarks.

## API / Service Requirements
- `calculateAdjustedBlockUtilization(utilized, allocated, onTimeReleased)`
- `calculateUnusedBlockMinutes(allocated, utilized, onTimeReleased, lateReleased)`
- `calculateOpportunityCost(unusedMinutes, hourlyContributionMargin)`
- `calculateReleaseCompliance(onTimeReleased, lateReleased, utilizationPct)`
- `calculateSbpiScore(adjustedUtilPct, releaseCompliancePct, outOfBlockMinutes, allocatedMinutes)`
- `determineRightsizingAction(sbpiScore, adjustedUtilPct)`
- `calculateFacilityBlockSummaryKpis(periodLedgers)`

## UI / Workflow Requirements
- **5-Card Operational Ribbon:** Average Adjusted Block Util %, Release Compliance %, Total Abandoned Idle Wastage Hours, Total Opportunity Cost ($), and Active Probationary Warnings.
- **View Switcher:**
  - View 1: **Block Performance & SBPI Scorecards** (Surgeon-by-surgeon ledger with adjusted utilization, release compliance, SBPI composite index, and recommended actions).
  - View 2: **Block Wastage & Opportunity Cost Rankings** (Ranked by unutilized, unreleased hours and estimated financial leakage).
  - View 3: **MEC Governance & Rightsizing Actions Log** (Pending and approved committee rightsizing workflows).
- **Interactive Governance Modal:** Execute rightsizing recommendations (Expand, Maintain, 60-Day Probation, Alternate Weeks Downgrade) with pinned header and footer.
- **Maestro Clinical Design System:** Strictly ZERO prohibited purple/violet/indigo/magenta/fuchsia tokens. High-contrast `#ffffff` modals, `#0f172a` headers, and crisp blue/teal/emerald clinical palette.

## Audit / Provenance
- Periodic ledgers track `period_start`, `period_end`, `created_at`, calculation timestamp, and source block definitions.
- Governance action records include approving executive user ID, timestamp, before/after allocated hours, and committee meeting rationale.

## QA / Test Cases
1. **Taxonomy & Formula Definitions:** Test SBPI weightings (50/30/20) and rightsizing thresholds.
2. **Adjusted vs Raw Utilization Math:** Verify on-time deduction vs late release penalty.
3. **Abandoned Wastage & Financial Opportunity Cost:** Test calculation with various margin rates.
4. **MEC Governance Action Lifecycle:** Test submission, status updates, and capacity adjustments.
5. **Database Migration 082:** Verify forward UP and rollback DOWN scripts and multi-tenant RLS.
6. **Design System & Zero Purple Compliance:** Strict audit of all tokens in JSX and CSS.
7. **App.jsx Integration:** Verify component mounting and navigation.

## Acceptance Criteria
- Build passes (`npm run build`).
- Automated test suite passes (`tests/block-utilization-metrics.test.js`).
- Clean multi-tenant isolation via `app.current_facility_id`.
- Zero prohibited design tokens in code and styling.
- P0/P1 issues block release.

## Dependencies
- Upstream:
  - Phase A0 (`077_operating_room_model.sql`)
  - Phase A1 (`078_room_staffing_windows.sql`)
  - Phase A2 (`079_block_schedule_model.sql`)
  - Phase A3 (`080_block_release_events.sql`)
  - Phase A4 (`081_or_utilization_metrics.sql`)

## Definition of Done
Complete data model, migration UP/DOWN scripts, deterministic service layer, React views with scoped CSS, automated test suite, App.jsx wiring, and master documentation.

## Implementation Notes
- Migration: `supabase/migrations/082_block_utilization_metrics.sql`
- Rollback: `supabase/migrations/082_block_utilization_metrics_down.sql`
- Service: `src/services/blockUtilizationMetricsService.js` and `src/lib/blockUtilizationMetricsService.js`
- View: `src/components/BlockUtilizationMetricsView.jsx` and `src/components/BlockUtilizationMetricsView.css`
- Test: `tests/block-utilization-metrics.test.js`
- Wiring: `src/App.jsx`
