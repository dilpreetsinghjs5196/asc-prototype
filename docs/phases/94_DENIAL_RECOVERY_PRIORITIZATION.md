# 94 DENIAL RECOVERY PRIORITIZATION

## Purpose
Production specification for ranking and prioritizing clinical and administrative denials by expected recoverable value, overturn probability, filing deadline urgency, and administrative effort.

The primary operational objective is to transform raw denial inventories into high-yield, sorted recovery work queues that maximize cash velocity and prevent unforced write-offs from expired appeal filing limits.

As the operational principle states:

> **Denials should not be worked first-in, first-out.**  
> **A \$12,000 surgical implant denial with a 90% overturn rate and 5 days left must be worked before a \$150 technical short-pay with 120 days remaining.**

---

## Scope
- Ingest and score claim-level and line-level denials from Phase 84 (CARC/RARC Intelligence) and Phase 85 (Denials Management Engine).
- Apply a multi-factor deterministic scoring algorithm that ranks denials from $0.00$ to $100.00$ points.
- Weight ranking factors: Value ($35\%$), Probability ($30\%$), Deadline Urgency ($20\%$), and Administrative Effort ($15\%$).
- Calculate an **Effort-to-Yield Ratio** ($\$/\text{hr}$) to measure operational recovery efficiency.
- Categorize scored denials into 5 actionable priority tiers (`CRITICAL_URGENT`, `HIGH_PRIORITY`, `MEDIUM_PRIORITY`, `LOW_PRIORITY`, `UNRECOVERABLE_HOLD`).
- Prevent appeal work on expired or legally non-appealable denials.
- Feed Phase 86 Appeals Workflow, Phase 98 Opportunity Priority Score, and Phase 99 Recoverable Revenue Work Queue.
- Enforce facility multi-tenancy, Row Level Security (RLS), and RBAC governance.

---

## Current State
Existing reusable assets:
- Phase 80 Claims Model: **KEEP**
- Phase 82 835 Remittance Ingestion: **KEEP**
- Phase 83 Payments & Adjustments: **KEEP**
- Phase 84 CARC/RARC Intelligence: **KEEP**
- Phase 85 Denials Management (`rcm_denials` table): **KEEP / EXTEND**
- Phase 86 Appeals Workflow: **KEEP / INTEGRATE**
- Phase 90 Revenue Leakage Engine: **KEEP**
- Phase 93 Underpayment Detection: **KEEP**
- Phase 93A Payment Variance Validation: **KEEP**
- Phase 93B Recovery Evidence and Timeline: **KEEP**
- Phase 93C Recurring Payer Underpayment Patterns: **KEEP**
- Phase 98 Opportunity Priority Score: **FUTURE INTEGRATION**
- Phase 99 Recoverable Revenue Work Queue: **FUTURE INTEGRATION**

Missing components addressed by Phase 94:
- Multi-factor deterministic denial recovery prioritization engine: **IMPLEMENTED**
- Prioritization ledger entity (`denial_recovery_priorities`): **IMPLEMENTED**
- Administrative effort and yield-per-hour ranking model: **IMPLEMENTED**
- Priority tier classification engine: **IMPLEMENTED**
- Priority queue UI workbenches: **IMPLEMENTED**

---

## Target State

The engine ranks every active denial into a deterministic priority queue based on 4 authoritative scoring dimensions:

### 1. Multi-Factor Priority Score Formula ($0.00 - 100.00$)
$$\text{PriorityScore} = (\text{ValueScore} \times 0.35) + (\text{ProbabilityScore} \times 0.30) + (\text{UrgencyScore} \times 0.20) + (\text{EffortScore} \times 0.15)$$

#### A. Value Score ($35\%$ Weight)
Quantifies financial recovery magnitude relative to the facility benchmark (default benchmark: $\$5,000.00$):
$$\text{ValueScore} = \min\left(100.00,\, \frac{\text{denied\_amount}}{\text{benchmark\_value}} \times 100.00\right)$$

#### B. Probability Score ($30\%$ Weight)
Directly reflects historical and contractually established overturn rates based on CARC/RARC codes and payer behavior:
$$\text{ProbabilityScore} = \text{overturn\_probability\_pct} \quad (0.00 - 100.00)$$

#### C. Deadline Urgency Score ($20\%$ Weight)
Evaluates statutory or contractual calendar days remaining before the appeal window permanently closes:
- $\le 7$ days remaining: **$100.00$ points** (Critical statutory cliff)
- $8 - 14$ days remaining: **$90.00$ points**
- $15 - 30$ days remaining: **$75.00$ points**
- $31 - 60$ days remaining: **$50.00$ points**
- $> 60$ days remaining: **$30.00$ points**
- Expired ($< 0$ days): **$0.00$ points** (Transition to `UNRECOVERABLE_HOLD`)

#### D. Effort Score ($15\%$ Weight)
Inversely scores administrative friction to prioritize fast, low-touch recoveries (Quick Wins):
- `MINIMAL_EFFORT` (Level 1: $<15$ mins, electronic resubmission, modifier correction, eligibility verification): **$100.00$ points**
- `MODERATE_EFFORT` (Level 2: $15-45$ mins, attach operative notes, prior auth letters, purchase invoices): **$75.00$ points**
- `HIGH_EFFORT` (Level 3: $45-90$ mins, formal clinical dispute letter, certified coding review): **$45.00$ points**
- `EXTREME_EFFORT` (Level 4: $>90$ mins, peer-to-peer physician conference, external ALJ hearing): **$20.00$ points**

### 2. Effort-to-Yield Ratio ($\$/\text{hr}$)
Measures expected financial velocity per staff hour invested:
$$\text{ExpectedRecovery} = \text{denied\_amount} \times \left(\frac{\text{overturn\_probability\_pct}}{100.0}\right)$$
$$\text{YieldPerHour} = \frac{\text{ExpectedRecovery}}{\text{estimated\_effort\_hours}}$$

### 3. Priority Tier Taxonomy
- **`CRITICAL_URGENT`** ($\text{Score} \ge 80.00$): Imminent deadline or high-value high-probability opportunity. Assigned immediately to senior specialist.
- **`HIGH_PRIORITY`** ($\text{Score} \in [65.00, 79.99]$): High expected recovery yield; primary focus of daily billing queue.
- **`MEDIUM_PRIORITY`** ($\text{Score} \in [45.00, 64.99]$): Standard appeal workflow; worked systematically after High/Critical tiers.
- **`LOW_PRIORITY`** ($\text{Score} \in [25.00, 44.99]$): Marginal expected return or high administrative friction.
- **`UNRECOVERABLE_HOLD`** ($\text{Score} < 25.00$ or deadline expired): Unlikely to yield recovery; recommended for supervisor write-off audit.

---

## Data Model / Schema

### 1. `public.denial_recovery_priorities`
Stores real-time priority scores, effort metrics, and queue assignments for every active denial.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Priority record identifier |
| `organization_id` | `UUID` | `NOT NULL` | Tenancy organization scope |
| `facility_id` | `UUID` | `NOT NULL REFERENCES public.facilities(id)` | Tenancy facility scope |
| `denial_id` | `UUID` | `NOT NULL REFERENCES public.rcm_denials(id) ON DELETE CASCADE` | Raw denial foreign key |
| `claim_id` | `UUID` | `NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE` | Associated claim foreign key |
| `payer_id` | `UUID` | `NULL` | Target payer identifier |
| `carc_code` | `VARCHAR(16)` | `NOT NULL` | Claim Adjustment Reason Code |
| `rarc_code` | `VARCHAR(16)` | `NULL` | Remittance Advice Remark Code |
| `denial_category` | `VARCHAR(40)` | `NOT NULL` | Functional denial category |
| `denied_amount` | `NUMERIC(14,2)` | `NOT NULL CHECK (denied_amount >= 0)` | Disputed denied dollar balance |
| `overturn_probability_pct`| `NUMERIC(5,2)` | `NOT NULL CHECK (overturn_probability_pct BETWEEN 0 AND 100)` | Historical overturn likelihood |
| `expected_recovery_amount`| `NUMERIC(14,2)` | `NOT NULL CHECK (expected_recovery_amount >= 0)` | Probabilistic recovery expected ($) |
| `filing_deadline` | `DATE` | `NOT NULL` | Statutory appeal deadline date |
| `days_until_deadline` | `INTEGER` | `NOT NULL` | Calendar days remaining |
| `effort_level` | `VARCHAR(20)` | `NOT NULL CHECK (effort_level IN ('MINIMAL_EFFORT', 'MODERATE_EFFORT', 'HIGH_EFFORT', 'EXTREME_EFFORT'))` | Administrative friction level |
| `estimated_effort_hours` | `NUMERIC(4,2)` | `NOT NULL DEFAULT 0.5 CHECK (estimated_effort_hours > 0)` | Staff time required in hours |
| `yield_per_hour` | `NUMERIC(14,2)` | `NOT NULL CHECK (yield_per_hour >= 0)` | Expected recovery $/hr |
| `value_score` | `NUMERIC(5,2)` | `NOT NULL CHECK (value_score BETWEEN 0 AND 100)` | Normalized value score (0-100) |
| `probability_score` | `NUMERIC(5,2)` | `NOT NULL CHECK (probability_score BETWEEN 0 AND 100)` | Probability score (0-100) |
| `urgency_score` | `NUMERIC(5,2)` | `NOT NULL CHECK (urgency_score BETWEEN 0 AND 100)` | Deadline urgency score (0-100) |
| `effort_score` | `NUMERIC(5,2)` | `NOT NULL CHECK (effort_score BETWEEN 0 AND 100)` | Effort score (0-100) |
| `priority_score` | `NUMERIC(5,2)` | `NOT NULL CHECK (priority_score BETWEEN 0 AND 100)` | Composite priority score (0-100) |
| `priority_tier` | `VARCHAR(32)` | `NOT NULL CHECK (priority_tier IN ('CRITICAL_URGENT', 'HIGH_PRIORITY', 'MEDIUM_PRIORITY', 'LOW_PRIORITY', 'UNRECOVERABLE_HOLD'))` | Actionable priority tier |
| `queue_status` | `VARCHAR(32)` | `NOT NULL CHECK (queue_status IN ('QUEUED', 'ASSIGNED', 'IN_APPEAL', 'RECOVERED', 'DISMISSED_WRITE_OFF', 'EXPIRED'))` | Queue state |
| `assigned_user_id` | `UUID` | `REFERENCES auth.users(id)` | Assigned denial specialist |
| `assigned_at` | `TIMESTAMPTZ` | `NULL` | Work assignment timestamp |
| `last_scored_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Prioritization run timestamp |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Last update timestamp |

### 2. `public.denial_prioritization_rules`
Configurable facility parameters mapping CARC categories and payers to baseline overturn probabilities and effort levels.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Rule identifier |
| `facility_id` | `UUID` | `NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE` | Tenancy facility scope |
| `rule_name` | `VARCHAR(128)` | `NOT NULL` | Human-readable rule title |
| `carc_code` | `VARCHAR(16)` | `NULL` | Applicable CARC code (null for category fallback) |
| `payer_id` | `UUID` | `NULL` | Applicable payer (null for all payers) |
| `default_probability_pct`| `NUMERIC(5,2)`| `NOT NULL CHECK (default_probability_pct BETWEEN 0 AND 100)` | Baseline overturn % |
| `default_effort_level` | `VARCHAR(20)` | `NOT NULL CHECK (default_effort_level IN (...))` | Default administrative friction |
| `default_effort_hours` | `NUMERIC(4,2)`| `NOT NULL CHECK (default_effort_hours > 0)` | Expected staff hours |
| `is_active` | `BOOLEAN` | `NOT NULL DEFAULT true` | Active state flag |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record creation timestamp |

---

## Business Rules

### Rule 1: Deterministic Multi-Factor Scoring Invariant
Priority scores must be calculated strictly server-side using the authoritative mathematical formula.
Arbitrary manual score overrides are forbidden; user overrides may only update underlying operational parameters (e.g. adjusting estimated effort or re-verifying prior auth evidence).

### Rule 2: Automatic Timely Filing Expiration
When `days_until_deadline < 0`:
- `urgency_score` is forced to `0.00`.
- Priority tier is automatically set to `UNRECOVERABLE_HOLD`.
- `queue_status` transitions to `EXPIRED`.
- The system prohibits generating new appeal letters for expired claims unless an approved payer waiver or disaster extension is attached.

### Rule 3: Effort-to-Yield Work Queue Sorting
Denials within the same priority tier are sorted descending by `yield_per_hour` ($\$/\text{hr}$):
$$\text{SortOrder} = \text{priority\_tier DESC}, \; \text{yield\_per\_hour DESC}, \; \text{days\_until\_deadline ASC}$$
This ensures billing specialists resolve the fastest, highest-paying claims first.

### Rule 4: Team Specialization Routing
Denials are automatically assigned to specialized queues based on CARC root cause:
- `CLINICAL_APPEALS`: Medical necessity (CARC 50), experimental/investigational (CARC 96), unbundled modifier review (CARC 97).
- `BILLING_AND_CODING`: Timely filing disputes, modifier corrections (-59, -50), charge corrections.
- `PATIENT_ACCESS`: Patient eligibility terminated (CARC 27), coordination of benefits (CARC 22), missing primary EOB.
- `MANAGED_CARE_CONTRACTING`: Fee schedule short-pays, unauthorized payer reductions.

---

## Permissions & Multi-Tenancy
- **PostgreSQL Row Level Security (RLS):** All queries enforce `facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid`.
- **Role-Based Access Control (RBAC):**
  - `Billing Specialist`: View assigned queue, update queue status, request info, launch appeal workflow.
  - `RCM Supervisor`: Reassign denials, approve write-offs for `UNRECOVERABLE_HOLD` cases, configure benchmark values and scoring weights.
  - `Finance Director`: View executive recovery yields, staff hours invested, and realized overturn rates.

---

## API / Service Requirements
The service layer (`denialPrioritizationService.js`) provides authoritative, auditable functions:
- `score_denial(denialRecord, facilityBenchmark)`: Calculates multi-factor scores, priority tier, and yield-per-hour.
- `prioritize_denial_inventory(facilityId, filters)`: Re-scores and ranks all active denials across the facility.
- `assign_denial_to_specialist(priorityId, userId)`: Assigns denial and updates queue state.
- `dismiss_denial_as_write_off(priorityId, supervisorId, reasonNotes)`: Formally writes off unrecoverable denials.
- `calculate_queue_analytics(facilityId)`: Aggregates portfolio yield, recoverable dollars by tier, and staff touch metrics.
- `generate_appeal_strategy_summary(priorityId)`: Generates AI-assisted dispute strategy citing CARC rebuttal guidelines and documentation requirements.

---

## UI / Workflow Requirements
Clinical Maestro UI layout with high-contrast dark theme (`#0b1120 !important` canvas, `#0f172a !important` cards, strictly ZERO purple tokens):

1. **Header & Facility Banner:** Phase 94 pill, facility selector, live sync button, CSV export button.
2. **5-Card KPI Ribbon:**
   - Total Active Denials
   - Total Denied Value ($)
   - Expected Recovery Yield ($)
   - Critical & High Priority Pipeline ($)
   - Average Yield per Staff Hour ($/hr)
3. **4 Primary Workbenches:**
   - **Workbench 1: Prioritized Denial Queue:** Ranked data grid with Priority Tier badge, Claim #, Patient, Payer, CARC code, Denied $, Overturn %, Priority Score, Yield $/hr, Days Left countdown, and Action buttons (`Work Appeal`, `Assign`, `Write-Off`).
   - **Workbench 2: Scoring Inspector & Root-Cause Matrix:** Breakdown of the 4 subscores (Value, Probability, Urgency, Effort) and CARC disposition rationale for selected denial.
   - **Workbench 3: Specialist Work Queues:** Filter by team routing (`CLINICAL_APPEALS`, `BILLING_AND_CODING`, `PATIENT_ACCESS`, `CONTRACTING`).
   - **Workbench 4: Executive Yield & Urgency Matrix:** 2x2 quadrant visualization (High Yield vs High Urgency) and tier distribution.
4. **Interactive Action Modals:**
   - Reassign Specialist Modal
   - Write-Off Justification Modal (requires mandatory supervisor sign-off)
   - AI Denial Appeal Strategy Drafter Modal (recommends optimal appeal strategy and exhibits).

---

## QA / Test Cases
The automated test suite (`tests/denial-recovery-prioritization.test.js`) verifies:
1. Multi-factor priority score calculation formula exactness.
2. Value subscore normalization against facility benchmark.
3. Overturn probability score mapping based on CARC code.
4. Deadline urgency score scaling based on days remaining.
5. Effort level score assignment and inverse friction scoring.
6. Effort-to-yield ratio ($\$/\text{hr}$) calculation.
7. Priority tier threshold classification (`CRITICAL_URGENT` through `UNRECOVERABLE_HOLD`).
8. Expired denial transitions to `UNRECOVERABLE_HOLD` with `0.00` urgency score.
9. Queue sorting invariant: sorted by Priority Tier DESC, Yield $/hr DESC, Days Left ASC.
10. Specialist assignment transitions status to `ASSIGNED` and logs timestamp.
11. Write-off dismissal blocks further appeal action and transitions to `DISMISSED_WRITE_OFF`.
12. Database migration integrity (tables, columns, indexes, foreign keys, 1:1 RLS policies, clean rollback).
13. Maestro Clinical Design System governance (strictly ZERO purple/violet/indigo/magenta tokens).
14. Application wiring and documentation completeness.

---

## Acceptance Criteria
- Every active denial receives an authoritative, reproducible priority score ($0-100$).
- Denials are ranked by expected recovery yield and deadline urgency.
- Expired claims are prevented from entering active appeal queues.
- Effort-to-yield ratio ($\$/\text{hr}$) accurately drives queue ordering.
- Build, lint, RLS, unit, integration, and UI tests pass with clean exit codes.

---

## Definition of Done
Complete only when denials are deterministically ranked by expected value, overturn probability, deadline urgency, and administrative effort, enabling surgical facilities to maximize cash recovered per staff hour worked.

