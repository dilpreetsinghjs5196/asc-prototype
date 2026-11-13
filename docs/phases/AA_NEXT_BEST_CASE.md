# AA / A10 NEXT BEST CASE ENGINE

## Purpose
Case ranking for open operating room capacity slots using deterministic clinical readiness, surgeon booking probability, financial contribution margin, and physical room/duration constraints. This specification defines production engineering standards for identifying, scoring, and matching candidate surgical cases from facility waitlists and backlogs into actionable open OR slots, eliminating manual phone trees and subjective case booking favoritism.

## Scope
- Define production requirements for algorithmic next-best-case ranking across all open, released, or underutilized surgical suite slots.
- Preserve compatibility with the current ASCANALYST product, historical scheduling blocks, duration predictions (Phase A8), and recoverable capacity slots (Phase A9).
- Use deterministic, auditable multi-factor scoring algorithms and hard clinical gate constraints.
- Enforce organization/facility multi-tenancy and role-based access control (RBAC).

## Current State
- **Phase A0 (Operating Room Master Model):** Provides physical room configurations, specialty compatibility, and turnover standards.
- **Phase A2 (Block Schedule Model):** Defines recurring block ownership and auto-release timelines.
- **Phase A3 (Block Release Events):** Captures surrendered open-pool slots available for reallocation.
- **Phase A8 (Duration Prediction):** Computes calibrated P50, P75, P80, and P90 procedure duration benchmarks.
- **Phase A9 (Recoverable Capacity):** Identifies actionable open slots (&ge; 90m and &ge; 48h lead-time) and quantifies potential backfill margin ($1,250.00/hr).
- **Ranking Engine Gap:** Currently, when an OR block is surrendered or an open slot is identified, perioperative schedulers rely on ad-hoc memory, sticky notes, or subjective surgeon requests to fill the vacancy. There is no automated, objective system to rank pending surgical backlog cases based on prior authorization approval, H&P clearance, time-slot utilization fit, and contribution margin yield. As a result, suboptimal cases are booked that cancel at the last minute, or high-margin, clinically urgent cases languish on waitlists.
- Classification:
  - Open Pool Slots (`or_recoverable_capacity_slots` / `or_block_release_events`): **KEEP**.
  - Duration Prediction Benchmarks (`or_case_duration_prediction_models`): **KEEP**.
  - Next Best Case Scoring & Allocation Engine: **MISSING** (Implemented in Phase AA/A10).

## Target State
1. **Four-Pillar Deterministic Scoring Model (0 to 100 Composite Fit Score):**
   - **Clinical & Pre-Op Readiness ($S_{\text{readiness}}$, Weight 30%):** Validates insurance prior authorization (30 pts), active History & Physical within 30 days (25 pts), pre-op labs/EKG clearance (20 pts), executed surgical consents (15 pts), and patient scheduling availability (10 pts).
   - **Surgeon & Patient Booking Probability ($S_{\text{probability}}$, Weight 25%):** Measures historical surgeon acceptance rate for short-notice add-ons (40 pts), advance lead-time feasibility (35 pts), and surgeon day-of-week block affinity (25 pts).
   - **Financial Contribution Margin Yield ($S_{\text{financial}}$, Weight 25%):** Normalized expected facility contribution margin:
     $$S_{\text{financial}} = \min\left(100, \frac{\text{Projected Contribution Margin}}{\text{Target Benchmark Margin (\$2,500.00)}} \times 100\right)$$
   - **Time & Equipment Slot Compatibility ($S_{\text{time\_fit}}$, Weight 20%):** Evaluates P80 predicted case duration fit against slot duration (75% to 95% ratio = 100 pts), specialty-to-room capability match, and sterile instrument tray turnaround.
2. **Deterministic Hard Constraint Gates:**
   - **Gate 1 (Prior Authorization Hard Gate):** If insurance prior authorization is missing, denied, or expired &rarr; Case is hard-disqualified (`READINESS_GATE_FAILED`).
   - **Gate 2 (Duration Overfill Hard Gate):** If Predicted P80 In-Room Duration &gt; Available Contiguous Slot Duration &rarr; Case is hard-disqualified (`DURATION_EXCEEDS_SLOT`).
   - **Gate 3 (Suite Capability Gate):** If the target operating suite lacks necessary equipment (e.g. robotic console, specialized ophthalmic microscope) &rarr; Case is hard-disqualified (`SPECIALTY_EQUIPMENT_MISMATCH`).
   - **Gate 4 (Implant Delivery SLA):** If required orthopedic/spine hardware cannot be delivered and autoclaved 24h prior to surgery &rarr; Case is hard-disqualified (`IMPLANT_SLA_BREACH`).
3. **Capacity Offer & Allocation Workflow:**
   - Case recommendations transition through structured lifecycle states: `RANKED` &rarr; `OFFERED_TO_SURGEON` &rarr; `ACCEPTED` &rarr; `BOOKED_IN_OR` (or `DECLINED`, `EXPIRED_UNACTIONED`).
4. **Clinical Maestro UI:**
   - 5-Card Operational Ribbon: Active Candidate Backlog Cases, Top Ranked Opportunity Score, Potential Realized Margin ($), Average Readiness Score %, and Slot Utilization Match %.
   - Open Slot Target Selector: Selects active open slot across surgical suites to dynamically compute real-time candidate case rankings.
   - 3-Tab View: Ranked Candidate Cases Ledger, Multi-Pillar Scoring Radar/Matrix, Backlog Clinical Readiness Queue.
   - Interactive Case Offer & Booking Allocation Modal with pinned non-overlapping layout.

## Data Model / Schema

### 1. `or_next_best_case_backlog`
Master registry of pending surgical cases eligible for open-capacity matching:
- `id` UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `facility_id` UUID NOT NULL REFERENCES `public.facilities(id)` ON DELETE CASCADE
- `patient_name` VARCHAR(128) NOT NULL
- `patient_mrn` VARCHAR(64) NOT NULL
- `surgeon_id` BIGINT REFERENCES `public.surgeons(id)` ON DELETE SET NULL
- `surgeon_name` VARCHAR(128) NOT NULL
- `specialty_code` VARCHAR(64) NOT NULL
- `procedure_name` VARCHAR(256) NOT NULL
- `primary_cpt_code` VARCHAR(16) NOT NULL
- `predicted_duration_minutes` INTEGER NOT NULL DEFAULT 60
- `projected_contribution_margin` NUMERIC(10, 2) NOT NULL DEFAULT 0.00
- `prior_auth_status` VARCHAR(32) NOT NULL DEFAULT 'PENDING' -- 'APPROVED', 'PENDING', 'DENIED', 'EXPIRED'
- `hp_cleared` BOOLEAN NOT NULL DEFAULT FALSE
- `labs_cleared` BOOLEAN NOT NULL DEFAULT FALSE
- `consent_signed` BOOLEAN NOT NULL DEFAULT FALSE
- `patient_available` BOOLEAN NOT NULL DEFAULT TRUE
- `requires_implant` BOOLEAN NOT NULL DEFAULT FALSE
- `implant_delivery_confirmed` BOOLEAN NOT NULL DEFAULT FALSE
- `backlog_status` VARCHAR(32) NOT NULL DEFAULT 'ACTIVE_WAITLIST' -- 'ACTIVE_WAITLIST', 'OFFER_PENDING', 'SCHEDULED', 'REMOVED'
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT `NOW()`

### 2. `or_next_best_case_ranking_runs`
Audit ledger of ranking execution runs against target open slots:
- `id` UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `facility_id` UUID NOT NULL REFERENCES `public.facilities(id)` ON DELETE CASCADE
- `target_slot_id` UUID REFERENCES `public.or_recoverable_capacity_slots(id)` ON DELETE SET NULL
- `operating_room_id` UUID REFERENCES `public.operating_rooms(id)` ON DELETE SET NULL
- `slot_date` DATE NOT NULL
- `slot_duration_minutes` INTEGER NOT NULL
- `candidates_evaluated_count` INTEGER NOT NULL DEFAULT 0
- `qualified_candidates_count` INTEGER NOT NULL DEFAULT 0
- `executed_by_user_id` UUID
- `run_timestamp` TIMESTAMPTZ NOT NULL DEFAULT `NOW()`

### 3. `or_next_best_case_recommendations`
Individual scored case recommendations generated for a specific slot:
- `id` UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `facility_id` UUID NOT NULL REFERENCES `public.facilities(id)` ON DELETE CASCADE
- `run_id` UUID NOT NULL REFERENCES `public.or_next_best_case_ranking_runs(id)` ON DELETE CASCADE
- `backlog_case_id` UUID NOT NULL REFERENCES `public.or_next_best_case_backlog(id)` ON DELETE CASCADE
- `rank_position` INTEGER NOT NULL
- `composite_fit_score` NUMERIC(5, 2) NOT NULL
- `readiness_score` NUMERIC(5, 2) NOT NULL
- `probability_score` NUMERIC(5, 2) NOT NULL
- `financial_score` NUMERIC(5, 2) NOT NULL
- `time_fit_score` NUMERIC(5, 2) NOT NULL
- `duration_utilization_pct` NUMERIC(5, 2) NOT NULL
- `is_disqualified` BOOLEAN NOT NULL DEFAULT FALSE
- `disqualification_reason` VARCHAR(64)
- `recommendation_status` VARCHAR(32) NOT NULL DEFAULT 'RANKED' -- 'RANKED', 'OFFERED_TO_SURGEON', 'ACCEPTED', 'BOOKED_IN_OR', 'DECLINED', 'EXPIRED'
- `decision_notes` TEXT
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT `NOW()`

### 4. `or_nbc_scoring_weights`
Facility-configurable weighting parameters:
- `id` UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `facility_id` UUID NOT NULL REFERENCES `public.facilities(id)` ON DELETE CASCADE
- `weight_readiness` NUMERIC(4, 2) NOT NULL DEFAULT 0.30
- `weight_probability` NUMERIC(4, 2) NOT NULL DEFAULT 0.25
- `weight_financial` NUMERIC(4, 2) NOT NULL DEFAULT 0.25
- `weight_time_fit` NUMERIC(4, 2) NOT NULL DEFAULT 0.20
- `target_benchmark_margin` NUMERIC(10, 2) NOT NULL DEFAULT 2500.00
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT `NOW()`,
- CONSTRAINT `uq_nbc_facility_weights` UNIQUE (`facility_id`)

## Business Rules

### Rule 1: Multi-Pillar Deterministic Scoring Formulas
The composite score is calculated with exact mathematical precision:
$$\text{Composite Fit Score} = w_R \cdot S_{\text{readiness}} + w_P \cdot S_{\text{probability}} + w_F \cdot S_{\text{financial}} + w_T \cdot S_{\text{time\_fit}}$$
Default weights: $w_R = 0.30, w_P = 0.25, w_F = 0.25, w_T = 0.20$ ($\sum w_i = 1.00$).

1. **Readiness Score ($S_{\text{readiness}} \in [0, 100]$):**
   - Prior Auth Approved: $+30\text{ pts}$ (If pending: $0\text{ pts}$; If denied/expired: Disqualified)
   - H&P Documented: $+25\text{ pts}$
   - Pre-Op Labs / EKG Cleared: $+20\text{ pts}$
   - Consent Signed: $+15\text{ pts}$
   - Patient Availability Confirmed: $+10\text{ pts}$

2. **Probability Score ($S_{\text{probability}} \in [0, 100]$):**
   - Historical Surgeon Response Rate: $\text{Rate} \times 40\text{ pts}$
   - Lead Time Feasibility:
     - Notice $\ge 72\text{h}$: $35\text{ pts}$
     - Notice $48\text{--}71\text{h}$: $25\text{ pts}$
     - Notice $24\text{--}47\text{h}$: $15\text{ pts}$
     - Notice $< 24\text{h}$: $5\text{ pts}$
   - Block Day Alignment (Surgeon typically operates on this day): $+25\text{ pts}$ (else $+10\text{ pts}$)

3. **Financial Score ($S_{\text{financial}} \in [0, 100]$):**
   $$S_{\text{financial}} = \min\left(100, \frac{\text{Projected Contribution Margin}}{\$2,500.00} \times 100\right)$$

4. **Time & Slot Fit Score ($S_{\text{time\_fit}} \in [0, 100]$):**
   - Compute Duration Utilization Ratio: $U = \frac{\text{Predicted Case Duration}}{\text{Slot Duration}}$
     - $0.75 \le U \le 0.95$: $70\text{ pts}$ (Ideal utilization)
     - $0.50 \le U < 0.75$: $50\text{ pts}$
     - $U < 0.50$: $25\text{ pts}$
     - $U > 1.00$: Hard Disqualified ($0\text{ pts}$)
   - Specialty to Suite Compatibility: $+20\text{ pts}$
   - Instrument Sterilization Feasibility: $+10\text{ pts}$

### Rule 2: Hard Disqualification Gates
A candidate case is marked `is_disqualified = TRUE` and relegated to the bottom of the ledger if:
- `prior_auth_status IN ('DENIED', 'EXPIRED')` &rarr; `READINESS_GATE_FAILED`
- `predicted_duration_minutes > slot_duration_minutes` &rarr; `DURATION_EXCEEDS_SLOT`
- `requires_implant = TRUE AND implant_delivery_confirmed = FALSE AND lead_time_hours < 48` &rarr; `IMPLANT_SLA_BREACH`
- Specialty incompatible with operating room suite setup &rarr; `SPECIALTY_EQUIPMENT_MISMATCH`

### Rule 3: Allocation State Transitions
```
RANKED (Initial algorithm output)
  │
  ├─► OFFERED_TO_SURGEON (Scheduler sends slot notification to surgeon office)
  │     │
  │     ├─► ACCEPTED (Surgeon accepts slot offer)
  │     │     │
  │     │     └─► BOOKED_IN_OR (Official case booking created; slot consumed)
  │     │
  │     └─► DECLINED (Surgeon office passes; slot remains open for Rank #2)
  │
  └─► EXPIRED_UNACTIONED (Slot time window elapsed without booking)
```

## Permissions / Security
- `scheduling.view_nbc_rankings`: View candidate case rankings and scoring matrices.
- `scheduling.execute_nbc_run`: Trigger ranking algorithms against an open slot.
- `scheduling.offer_nbc_case`: Formally dispatch slot offer to surgeon clinic.
- `scheduling.book_nbc_case`: Authorize official case booking and slot consumption.
- Multi-tenancy: Strictly isolated via PostgreSQL Row Level Security enforcing `facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid`.

## API / Service Requirements
- `GET /api/v1/scheduling/nbc/backlog`: Retrieve waitlisted cases for facility.
- `POST /api/v1/scheduling/nbc/rank`: Evaluate and rank backlog candidates against a target slot.
- `POST /api/v1/scheduling/nbc/offer`: Dispatch slot offer to clinic contact.
- `POST /api/v1/scheduling/nbc/book`: Consume slot and book case into surgical schedule.

## UI / Workflow Requirements
- **Maestro Clinical Design System Standard:** Strictly ZERO prohibited purple/violet/indigo/magenta/fuchsia tokens.
- **Pinned Flex Column Modal:** Modal header and footer pinned, scrollable body with `overflow-y: auto`.
- **Top 5-Card Ribbon:** Total Waitlist Backlog Cases, Top Ranked Fit Score, Potential Recoverable Margin ($), Average Clinical Readiness %, and Slot Utilization Match %.
- **Interactive Open Slot Target Selector:** Switch target open suite slots to recompute rankings instantaneously.
- **3 Tab Views:**
  1. Ranked Candidate Cases Ledger
  2. Multi-Pillar Scoring Radar/Matrix
  3. Backlog Clinical Readiness Queue

## Audit / Provenance
All ranking executions, score weights, user actions, offers dispatched, and surgeon acceptances/declines must log `facility_id`, `user_id`, `timestamp`, `run_id`, and `score_breakdown` in the immutable audit trail.

## QA / Test Cases
- Unit tests for each individual scoring pillar (Readiness, Probability, Financial, Time Fit).
- Unit tests for all hard disqualification gates (Prior Auth, Duration Overfill, Implant SLA, Specialty Mismatch).
- Integration test for composite score weighting and sorting accuracy.
- Database migration 087 UP and DOWN test with RLS verification.
- Design system token audit (Zero Purple rule) and App.jsx routing integration.

## Acceptance Criteria
- Build passes (`npm run build` with 0 errors).
- All automated tests pass with 100% success.
- Clean idempotent database migration and rollback SQL.
- Working tree clean and committed to git branch `feature/phase-80-claims-model`.

