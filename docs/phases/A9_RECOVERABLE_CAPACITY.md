# A9 RECOVERABLE CAPACITY & OPPORTUNITY VALUE ENGINE

## Purpose
Actionable vs non-actionable unused capacity and recoverable value. This specification defines production standards for decomposing gross unused operating room time into actionable booking capacity versus non-actionable fragmented friction, quantifying recoverable financial value through surgical case backfilling ($1,250.00/hr margin) and clinical crew downstaffing ($175.00/hr labor recovery), and providing automated workflows to reclaim stranded surgical suite capacity.

## Scope
- Define production requirements for operating room unused capacity classification across all active surgical suites.
- Preserve compatibility with the current ASCANALYST product, historical scheduling blocks, and release event ledgers.
- Use deterministic, auditable mathematical rules for contiguous slot classification, actionability ratios, and financial opportunity valuation.
- Enforce organization/facility multi-tenancy and role-based access control (RBAC).

## Current State
- **Phase A0 (Operating Room Master Model):** Provides physical room configurations and turnover standards.
- **Phase A1 (Room Staffing Windows):** Establishes net staffed capacity denominators and operational shifts.
- **Phase A2 (Block Schedule Model):** Defines recurring block ownership and auto-release timelines.
- **Phase A3 (Block Release Events):** Tracks surrendered open-pool block time and downstaffing triggers.
- **Phase A4 (OR Utilization Metrics):** Measures overall unutilized percentage ($100\% - \text{Utilization \%}$).
- **Phase A5 (Block Utilization Metrics):** Quantifies abandoned block wastage.
- **Phase A7 (Turnover Metrics):** Identifies inter-case turnover gaps.
- **Phase A8 (Duration Prediction):** Provides P50/P80 duration targets to evaluate case fit.
- **Capacity Engine Gap:** Currently, surgery centers treat all "idle OR time" uniformly. Schedulers lack a mathematical engine to distinguish between actionable blocks (e.g. 180 contiguous prime-time minutes available 4 days in advance) and non-actionable friction (e.g. 25-minute unbookable gaps between cases). As a result, valuable capacity expires unbooked while staffing costs remain fixed.
- Classification:
  - Room Utilization Snapshot (`or_room_utilization_daily_snapshots`): **KEEP**.
  - Open Pool Reallocations (`or_open_pool_reallocations`): **KEEP**.
  - Recoverable Capacity Classification & Valuation Engine: **MISSING** (Implemented in Phase A9).

## Target State
1. **Granular Slot Actionability Classification:**
   - **`PRIME_ACTIONABLE_BLOCK`**: Contiguous unbooked interval $\ge 90\text{ minutes}$ (or specialty minimum, e.g. Ophthalmology 45m) occurring during staffed prime-time hours with lead time $\ge 48\text{ hours}$. Eligible for surgical case backfilling.
   - **`MARGINAL_SLOT`**: Contiguous interval between $60 - 89\text{ minutes}$ or lead time between $24 - 47\text{ hours}$. Eligible for short minor procedures, local anesthesia cases, or selective staff downstaffing.
   - **`FRAGMENTED_STRANDED`**: Non-actionable friction gaps $< 60\text{ minutes}$, end-of-day slivers ($< 30\text{m}$ before shift end), or same-day cancellations. Unfillable by surgical cases; represents operational friction.
2. **Dual Financial Recovery Pathways:**
   - **Pathway 1 (Surgical Case Backfill):** $\text{Actionable Hours} \times \text{Specialty Contribution Margin} (\$1,250.00/\text{hr})$.
   - **Pathway 2 (Labor Cost Avoidance / Downstaffing):** $\text{Actionable Hours} \times \text{Clinical Crew Hourly Rate} (\$175.00/\text{hr})$.
3. **Core Mathematical Performance Metrics:**
   - Actionability Ratio ($\%$): Proportion of total unused OR hours that are actionable.
   - Net Recoverable Value (\$): Sum of incremental surgical margin and avoided labor costs.
4. **Clinical Maestro UI:**
   - 5-Card Operational Ribbon: Actionable Recoverable Capacity (hrs), Actionability Ratio %, Potential Backfill Value ($), Avoidable Labor Cost ($), and Fragmented Stranded Wastage (hrs).
   - 3-Tab View: Actionable Capacity Slots Ledger, Capacity Decomposition & Friction Analysis, Specialty Viability Thresholds.
   - Interactive Capacity Recovery Action Modal (Backfill Case vs Downstaff Shift).

## Data Model / Schema

### 1. `or_recoverable_capacity_slots`
- `id` UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `facility_id` UUID NOT NULL REFERENCES `public.facilities(id)` ON DELETE CASCADE
- `operating_room_id` UUID REFERENCES `public.operating_rooms(id)` ON DELETE SET NULL
- `slot_date` DATE NOT NULL
- `start_time` TIME NOT NULL
- `end_time` TIME NOT NULL
- `slot_duration_minutes` INTEGER NOT NULL
- `is_actionable` BOOLEAN NOT NULL DEFAULT FALSE
- `actionability_tier` VARCHAR(32) NOT NULL DEFAULT `'FRAGMENTED_STRANDED'` -- 'PRIME_ACTIONABLE_BLOCK', 'MARGINAL_SLOT', 'FRAGMENTED_STRANDED'
- `lead_time_days` NUMERIC(4, 1) NOT NULL DEFAULT 0.0
- `lead_time_hours` INTEGER NOT NULL DEFAULT 0
- `recovery_pathway` VARCHAR(32) NOT NULL DEFAULT `'UNRECOVERABLE_FRAGMENT'` -- 'CASE_BACKFILL', 'LABOR_DOWNSTAFFING', 'UNRECOVERABLE_FRAGMENT'
- `recovery_status` VARCHAR(32) NOT NULL DEFAULT `'IDENTIFIED'` -- 'IDENTIFIED', 'BACKFILL_PROPOSED', 'DOWNSTAFFING_INITIATED', 'RECOVERED', 'EXPIRED_UNACTIONED'
- `assigned_specialty_code` VARCHAR(64)
- `assigned_case_id` VARCHAR(64)
- `potential_contribution_margin` NUMERIC(10, 2) NOT NULL DEFAULT 0.00
- `avoided_labor_cost` NUMERIC(10, 2) NOT NULL DEFAULT 0.00
- `net_recoverable_value` NUMERIC(10, 2) NOT NULL DEFAULT 0.00
- `action_notes` TEXT
- `actioned_by_user_id` UUID
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT `NOW()`

### 2. `or_capacity_actionability_thresholds`
- `id` UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `facility_id` UUID NOT NULL REFERENCES `public.facilities(id)` ON DELETE CASCADE
- `specialty_code` VARCHAR(64) NOT NULL
- `min_viable_case_duration_minutes` INTEGER NOT NULL DEFAULT 90
- `min_lead_time_hours` INTEGER NOT NULL DEFAULT 48
- `hourly_contribution_margin` NUMERIC(10, 2) NOT NULL DEFAULT 1250.00
- `hourly_downstaffing_rate` NUMERIC(10, 2) NOT NULL DEFAULT 175.00
- `effective_date` DATE NOT NULL DEFAULT CURRENT_DATE
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT `NOW()`
- CONSTRAINT `uq_or_capacity_threshold` UNIQUE (`facility_id`, `specialty_code`)

### 3. Indexes & Views
- Indexes on `(facility_id, slot_date)`, `(facility_id, is_actionable)`, `(facility_id, recovery_status)`, `(facility_id, actionability_tier)`.
- Analytical View `vw_or_recoverable_capacity_facility_summary`: Facility aggregates for Total Unused Hours, Actionable Hours, Actionability Ratio %, Fragmented Wastage Hours, and Total Net Recoverable Value ($).
- Analytical View `vw_or_actionable_slots_horizon`: Forward-looking ledger of upcoming actionable slots eligible for case backfilling or staff downstaffing.

## Business Rules

### Rule 1: Actionability Classification Logic
A contiguous unbooked idle interval is classified as follows:
- **`PRIME_ACTIONABLE_BLOCK`**:
  $$\text{Duration} \ge \text{Specialty Min Viable Duration (default 90m; Eye 45m)} \quad \text{AND} \quad \text{Lead Time} \ge 48\text{ hours}$$
- **`MARGINAL_SLOT`**:
  $$\text{Duration} \in [60\text{m}, \text{Min Viable Duration}) \quad \text{OR} \quad \text{Lead Time} \in [24\text{h}, 48\text{h})$$
- **`FRAGMENTED_STRANDED`**:
  $$\text{Duration} < 60\text{ minutes} \quad \text{OR} \quad \text{Lead Time} < 24\text{ hours}$$

### Rule 2: Actionability Ratio Formula
$$\text{Actionability Ratio (\%)} = \frac{\sum \text{Duration of Actionable Slots (minutes)}}{\sum \text{Duration of All Unused Slots (minutes)}} \times 100\%$$
- Exposes true recoverable efficiency. High unused time with a low actionability ratio signifies schedule fragmentation, not capacity surplus.

### Rule 3: Recoverable Financial Value Engine
1. **Case Backfill Value (Top-Line Yield):**
   $$\text{Backfill Margin} = \frac{\text{Slot Minutes}}{60} \times \text{Specialty Contribution Margin/Hour (\$1,250.00)}$$
2. **Staff Downstaffing Savings (Labor Cost Avoidance):**
   $$\text{Avoided Labor Cost} = \frac{\text{Slot Minutes}}{60} \times \text{Crew Downstaffing Hourly Rate (\$175.00)}$$
3. **Net Recoverable Value:**
   - If recovery pathway is `CASE_BACKFILL`: $\text{Net Value} = \text{Backfill Margin}$.
   - If recovery pathway is `LABOR_DOWNSTAFFING`: $\text{Net Value} = \text{Avoided Labor Cost}$.
   - If unrecoverable fragment: $\text{Net Value} = \$0.00$.

### Rule 4: Recovery Lifecycle Transitions
- `IDENTIFIED` $\to$ Slot detected in horizon schedule.
- `BACKFILL_PROPOSED` $\to$ Schedulers associate slot with a waitlisted patient or add-on case.
- `DOWNSTAFFING_INITIATED` $\to$ Schedulers trigger staff release notice when backfill is unachievable $> 48\text{h}$ out.
- `RECOVERED` $\to$ Patient surgery completed or shift cancelled without pay.
- `EXPIRED_UNACTIONED` $\to$ Slot start time passed without action; expires into non-recoverable wastage.

## Permissions / Security
- Multi-tenancy isolation via PostgreSQL Row-Level Security:
  `USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)`
- RBAC Matrix:
  - `super_admin`, `org_admin`, `clinical_director`: Full View, Adjust Actionability Thresholds, Authorize Downstaffing, Export Audits.
  - `scheduler`, `nurse_manager`: View Actionable Slots, Pair Waitlisted Cases, Initiate Downstaffing.
  - `surgeon_user`: Restricted View of available open actionable slots to request ad-hoc add-on cases.

## API / Service Requirements
- `classifySlotActionability(slotDurationMinutes, leadTimeHours, minViableDuration, minLeadTimeHours)`
- `calculateRecoverableValue(slotMinutes, pathway, contributionMarginRate, downstaffingRate)`
- `calculateActionabilityRatio(actionableMinutes, totalUnusedMinutes)`
- `calculateFacilityCapacityKpis(slots = [], thresholds = [])`
- `filterCapacitySlots(slots = [], filters = {})`

## UI / Workflow Requirements
- **5-Card Operational Ribbon:**
  1. Actionable Recoverable Capacity (hrs) with actionability ratio pill.
  2. Actionability Ratio % (Target $\ge 65\%$).
  3. Potential Case Backfill Value ($) at \$1,250.00/hr.
  4. Avoidable Labor Downstaffing Savings ($) at \$175.00/hr.
  5. Fragmented Stranded Wastage (hrs).
- **3-Tab View Switcher:**
  - Tab 1: **Actionable Capacity Slots Ledger** (Slot date, Suite, Time window, Duration, Actionability Tier, Recovery Pathway, Projected Value, Status, Action buttons).
  - Tab 2: **Capacity Decomposition & Friction Analysis** (Visual split of Actionable Prime Blocks vs Stranded Fragmentation, Lead-Time Horizon Distribution, Root-Cause Gaps).
  - Tab 3: **Specialty Viability Thresholds** (Configurable Minimum Viable Duration, Lead-Time SLA, Contribution Margin Rate, Downstaffing Hourly Rate per specialty).
- **Interactive Capacity Action Modal:** Allows schedulers to either "Backfill Surgical Case" or "Initiate Crew Downstaffing" with pinned header and footer.
- **Design System Standard:** Strictly ZERO prohibited purple/violet/indigo/magenta/fuchsia tokens. High contrast clinical blue, emerald, amber, slate, and crimson.

## Audit / Provenance
- All capacity slots maintain timestamps, lead-time metrics, assigned case IDs, and user ID of executing scheduler.
- Threshold calibrations record updating executive, prior parameters, and clinical justification.

## QA / Test Cases
1. **Actionability Classification Math:** Test prime actionable ($\ge 90\text{m}, \ge 48\text{h}$), marginal ($60\text{m}-89\text{m}$), and fragmented ($< 60\text{m}$).
2. **Actionability Ratio:** Verify mathematical accuracy across balanced and fragmented distributions.
3. **Dual Pathway Financial Modeling:** Test exact contribution margin vs downstaffing labor avoidance formulas.
4. **Lifecycle State Transitions:** Test status transitions (`IDENTIFIED` $\to$ `BACKFILL_PROPOSED` $\to$ `RECOVERED`).
5. **Database Migration 086:** Verify forward UP and rollback DOWN scripts and multi-tenant RLS.
6. **Design System & Zero Purple Compliance:** Strict audit of all tokens in JSX and CSS.
7. **App.jsx Integration:** Verify component mounting and navigation.

## Acceptance Criteria
- Build passes (`npm run build`).
- Automated test suite passes (`tests/recoverable-capacity.test.js`).
- Clean multi-tenant isolation via `app.current_facility_id`.
- Zero prohibited design tokens in code and styling.
- P0/P1 issues block release.

## Dependencies
- Upstream:
  - Phase A0 (`077_operating_room_model.sql` - Physical suites)
  - Phase A1 (`078_room_staffing_windows.sql` - Staffed hours)
  - Phase A2 (`079_block_schedule_model.sql` - Block schedules)
  - Phase A3 (`080_block_release_events.sql` - Released block pool)
  - Phase A4 (`081_or_utilization_metrics.sql` - Unused time ratios)
  - Phase A8 (`085_duration_prediction.sql` - Case duration prediction)

## Definition of Done
Complete data model, migration UP/DOWN scripts, deterministic service layer, React views with scoped CSS, automated test suite, App.jsx wiring, and master documentation.

## Implementation Notes
- Migration: `086_recoverable_capacity.sql` and `086_recoverable_capacity_down.sql`.
- Service: `src/services/recoverableCapacityService.js` and `src/lib/recoverableCapacityService.js`.
- UI: `src/components/RecoverableCapacityView.jsx` and `src/components/RecoverableCapacityView.css`.
- Tests: `tests/recoverable-capacity.test.js`.
- App Wiring: `src/App.jsx`.
