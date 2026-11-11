# 98 REVENUE OPPORTUNITY PRIORITY SCORE (ROPS)

## Purpose
Production specification for the cross-module Revenue Opportunity Priority Score (ROPS) engine.

The primary operational objective is to synthesize, normalize, and rank every revenue recovery opportunity across the entire ASC revenue cycle—including unbilled surgical encounters, missing charges, contract underpayments, recurring payer patterns, claim denials, unfiled secondary COB claims, patient self-pay balances, and surgical implant carve-outs—into a single, deterministic, mathematically auditable priority index ($0.00 - 100.00$).

As the operational principle states:

> **A revenue cycle team cannot work seven disconnected workbenches simultaneously.**  
> **Should an RCM specialist spend the next hour appealing an \$8,500 orthopedic implant denial with 8 days left, submitting a \$1,400 secondary Medigap claim with 100% certainty, or disputing a \$6,200 commercial fee schedule variance?**  
> **The Revenue Opportunity Priority Score (ROPS) provides a unified, transparent, and authoritative ranking that answers: *Which exact dollar should our team pursue next to maximize net realized surgical cash per hour of staff labor?***

---

## Scope
- Ingest actionable financial opportunities across all 7 core revenue recovery upstream modules:
  1. `IMPLANT_CARVEOUT` (Phase 97: Surgical implant & device carve-outs).
  2. `DENIAL_APPEAL` (Phase 94: Clinical and administrative claim denials).
  3. `SECONDARY_COB` (Phase 95: Unbilled secondary & crossover claims).
  4. `PAYER_UNDERPAYMENT` (Phases 93/93A/93B: Contractual payment variances).
  5. `RECURRING_PATTERN` (Phase 93C: Multi-claim systemic payer underpayment batches).
  6. `UNBILLED_CASE` (Phase 91: Unsubmitted surgical cases).
  7. `MISSING_CHARGE` (Phase 92: Omitted intraoperative CPT or supply charges).
- Normalize financial value across disparate clinical specialties (Orthopedics, Spine, Ophthalmology, Pain Management, General Surgery).
- Authoritatively calculate the 4 core subscores:
  - **Value Subscore ($35\%$ Weight):** Recoverable dollar variance relative to facility benchmark ($\$5,000.00$).
  - **Confidence Subscore ($25\%$ Weight):** Data completeness, documentation proof, and contractual validation certainty.
  - **Recoverability Subscore ($25\%$ Weight):** Overturn probability and contractual enforceability.
  - **Urgency Subscore ($15\%$ Weight):** Statutory days remaining until payer timely filing or appeal limit.
- Compute the **Expected Realizable Yield ($\$)** and **Yield Velocity ($\$/\text{hr}$)**:
  $$\text{ExpectedYield} = \text{recoverable\_amount} \times \left(\frac{\text{confidence}}{100}\right) \times \left(\frac{\text{recoverability}}{100}\right)$$
  $$\text{YieldPerHour} = \frac{\text{ExpectedYield}}{\max(0.25, \text{estimated\_effort\_hours})}$$
- Classify opportunities into 5 actionable priority tiers (`TIER_1_CRITICAL_DISPATCH` through `TIER_5_EXPIRED_OR_SUPPRESSED`).
- Enforce strict business invariants:
  - Expired filing limit ($<0$ days) forces Urgency Score to `0.00`, Tier 5, and status `EXPIRED_UNCOLLECTIBLE`.
  - Expected Realizable Yield is mathematically bounded by $[0.00, \text{recoverable\_amount}]$.
- Feed into downstream Phase 99 Recoverable Revenue Work Queue.
- Provide multi-tenancy, Row Level Security (RLS), and RBAC governance.

---

## Current State

Existing reusable assets:
- Phase 90 Revenue Leakage Lifecycle: **KEEP**
- Phase 91 Unbilled Case Detection: **KEEP / INGEST**
- Phase 92 Missing Charge Detection: **KEEP / INGEST**
- Phase 93 Underpayment Detection Engine: **KEEP / INGEST**
- Phase 93A Payment Variance Validation: **KEEP / INGEST**
- Phase 93C Recurring Payer Underpayment Patterns: **KEEP / INGEST**
- Phase 94 Denial Recovery Prioritization: **KEEP / INGEST**
- Phase 95 Missing Secondary Payment Engine: **KEEP / INGEST**
- Phase 96 Patient AR Recovery: **KEEP / INGEST**
- Phase 97 Implant Carveout Detection: **KEEP / INGEST**
- Phase 99 Recoverable Revenue Work Queue: **FUTURE DOWNSTREAM CONSUMER**

Missing components addressed by Phase 98:
- Master cross-module opportunity ledger (`revenue_opportunity_priority_items`): **IMPLEMENTED**
- Configurable facility scoring rules & weights table (`revenue_opportunity_score_rules`): **IMPLEMENTED**
- Unified 4-factor ROPS calculation engine: **IMPLEMENTED**
- Expected Realizable Yield ($\$) and Yield Velocity ($\$/\text{hr}$) calculator: **IMPLEMENTED**
- Cross-domain executive priority workbench UI with domain filtering and dispatch actions: **IMPLEMENTED**

---

## Target State

The engine aggregates every opportunity into an authoritative, cross-module ledger with standardized attributes:

### 1. Unified 4-Factor ROPS Formula ($0.00 - 100.00$)

$$\text{ROPS} = (\text{ValueScore} \times W_V) + (\text{ConfidenceScore} \times W_C) + (\text{RecoverabilityScore} \times W_R) + (\text{UrgencyScore} \times W_U)$$

Default Standard Facility Weights:
- $W_V = 0.35$ ($35\%$ Weight - Financial Value)
- $W_C = 0.25$ ($25\%$ Weight - Data & Contract Confidence)
- $W_R = 0.25$ ($25\%$ Weight - Recoverability / Overturn Probability)
- $W_U = 0.15$ ($15\%$ Weight - Statutory Timely Filing Urgency)
$$\sum W = 0.35 + 0.25 + 0.25 + 0.15 = 1.00$$

---

### 2. Factor Algorithms

#### A. Value Subscore ($35\%$ Weight)
Evaluates potential financial impact normalized against facility benchmark ($\$5,000.00$):
$$\text{ValueScore} = \min\left(100.00,\, \frac{\text{recoverable\_amount}}{\text{benchmark\_value}} \times 100.00\right)$$
If $\text{recoverable\_amount} \le 0$, $\text{ValueScore} = 0.00$.

#### B. Confidence Subscore ($25\%$ Weight)
Authoritative score ($0.00 - 100.00$) reflecting data certainty:
- Fully validated fee schedule variance / Primary 835 ERA on file + vendor invoice attached: **$95.00 - 100.00$**
- Standard contract rate match / Verified secondary coverage: **$80.00 - 90.00$**
- Clinical documentation pending verification / Incomplete itemized charges: **$40.00 - 60.00$**
- Unverified charge or unconfirmed payer policy: **$10.00 - 30.00$**

#### C. Recoverability Subscore ($25\%$ Weight)
Estimated likelihood ($0.00 - 100.00$) of converting the opportunity into collected cash:
- Contractual carve-out violation / Missing invoice cure: **$90.00 - 95.00$**
- Standard COB coordination / Verified Medigap Part B crossover: **$85.00 - 90.00$**
- Clinical necessity denial with operative report support: **$70.00 - 80.00$**
- High-friction timely filing or prior authorization dispute: **$30.00 - 50.00$**

#### D. Urgency Subscore ($15\%$ Weight)
Measured by statutory days remaining until payer timely filing or appeal deadline:
- $1 - 15$ days remaining: **$100.00$ points** (Critical urgency)
- $16 - 30$ days remaining: **$85.00$ points** (High urgency)
- $31 - 60$ days remaining: **$65.00$ points** (Moderate urgency)
- $61 - 90$ days remaining: **$40.00$ points** (Standard follow-up)
- $> 90$ days remaining: **$20.00$ points** (Low urgency)
- $< 0$ days (Expired): **$0.00$ points** (Enforces `EXPIRED_UNCOLLECTIBLE`)

---

### 3. Expected Realizable Yield & Yield Velocity ($\$/\text{hr}$)

$$\text{ExpectedYield} = \text{recoverable\_amount} \times \left(\frac{\text{confidence\_score}}{100}\right) \times \left(\frac{\text{recoverability\_score}}{100}\right)$$

$$\text{YieldPerHour} = \frac{\text{ExpectedYield}}{\max(0.25, \text{estimated\_effort\_hours})}$$

*Example:* A $\$6,000.00$ implant carve-out with $90\%$ confidence and $90\%$ recoverability requiring $1.5$ staff hours yields:
$$\text{ExpectedYield} = \$6,000.00 \times 0.90 \times 0.90 = \$4,860.00$$
$$\text{YieldPerHour} = \frac{\$4,860.00}{1.5\text{ hrs}} = \$3,240.00/\text{hr}$$

---

### 4. Cross-Module Opportunity Action Tiers

| Tier Code | Label | Score Range | Priority Action |
| :--- | :--- | :---: | :--- |
| `TIER_1_CRITICAL_DISPATCH` | Critical Priority Dispatch | $\ge 80.00$ | Immediate assignment to senior billing specialist; $<15$ days or $>\$5\text{k}$ expected yield |
| `TIER_2_HIGH_YIELD_RECOVERY` | High-Yield Opportunity | $65.00 - 79.99$ | Generate electronic dispute packet or corrected claim submission |
| `TIER_3_STANDARD_WORKBENCH` | Standard Queue | $45.00 - 64.99$ | Scheduled for standard RCM cycle follow-up within 14 days |
| `TIER_4_LOW_YIELD_BATCH` | Low-Yield / Batch Review | $25.00 - 44.99$ | Batch dispute or monitor for pattern aggregation |
| `TIER_5_EXPIRED_OR_SUPPRESSED` | Expired / Non-Recoverable | $< 25.00$ or $<0\text{d}$ | Statutory deadline expired or uncollectible; closed to adjustment |

---

## Data Model / Schema (Migration 075)

```sql
-- 1. Facility Scoring Rules & Config Table
CREATE TABLE IF NOT EXISTS public.revenue_opportunity_score_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    facility_benchmark_amount NUMERIC(10, 2) NOT NULL DEFAULT 5000.00,
    weight_value NUMERIC(4, 2) NOT NULL DEFAULT 0.35,
    weight_confidence NUMERIC(4, 2) NOT NULL DEFAULT 0.25,
    weight_recoverability NUMERIC(4, 2) NOT NULL DEFAULT 0.25,
    weight_urgency NUMERIC(4, 2) NOT NULL DEFAULT 0.15,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT chk_rops_weights_sum CHECK (
        ABS((weight_value + weight_confidence + weight_recoverability + weight_urgency) - 1.00) < 0.01
    )
);

-- 2. Master Revenue Opportunity Priority Ledger
CREATE TABLE IF NOT EXISTS public.revenue_opportunity_priority_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    source_module VARCHAR(50) NOT NULL CHECK (source_module IN (
        'IMPLANT_CARVEOUT',
        'DENIAL_APPEAL',
        'SECONDARY_COB',
        'PAYER_UNDERPAYMENT',
        'RECURRING_PATTERN',
        'UNBILLED_CASE',
        'MISSING_CHARGE'
    )),
    source_record_id VARCHAR(100) NOT NULL,
    claim_id UUID,
    claim_number VARCHAR(64) NOT NULL,
    patient_id UUID,
    patient_name VARCHAR(150) NOT NULL,
    patient_mrn VARCHAR(64) NOT NULL,
    payer_id UUID,
    payer_name VARCHAR(150) NOT NULL,
    cpt_code VARCHAR(10) NOT NULL,
    procedure_name VARCHAR(255) NOT NULL,
    date_of_service DATE NOT NULL,
    
    -- Financial Realizability
    recoverable_amount NUMERIC(10, 2) NOT NULL CHECK (recoverable_amount >= 0.00),
    confidence_score NUMERIC(5, 2) NOT NULL CHECK (confidence_score BETWEEN 0.00 AND 100.00),
    recoverability_score NUMERIC(5, 2) NOT NULL CHECK (recoverability_score BETWEEN 0.00 AND 100.00),
    expected_realizable_yield NUMERIC(10, 2) NOT NULL CHECK (expected_realizable_yield >= 0.00),
    estimated_effort_hours NUMERIC(4, 2) NOT NULL DEFAULT 1.00 CHECK (estimated_effort_hours >= 0.25),
    yield_per_hour NUMERIC(10, 2) NOT NULL CHECK (yield_per_hour >= 0.00),
    
    -- Subscores & Composite ROPS
    value_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (value_score BETWEEN 0.00 AND 100.00),
    urgency_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (urgency_score BETWEEN 0.00 AND 100.00),
    rops_priority_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (rops_priority_score BETWEEN 0.00 AND 100.00),
    
    -- Action Tier & Filing Urgency
    priority_action_tier VARCHAR(50) NOT NULL CHECK (priority_action_tier IN (
        'TIER_1_CRITICAL_DISPATCH',
        'TIER_2_HIGH_YIELD_RECOVERY',
        'TIER_3_STANDARD_WORKBENCH',
        'TIER_4_LOW_YIELD_BATCH',
        'TIER_5_EXPIRED_OR_SUPPRESSED'
    )),
    filing_deadline DATE NOT NULL,
    days_until_deadline INTEGER NOT NULL,
    
    -- Lifecycle State
    item_status VARCHAR(50) NOT NULL DEFAULT 'SCORED' CHECK (item_status IN (
        'SCORED',
        'DISPATCHED_TO_QUEUE',
        'IN_RECOVERY_WORKFLOW',
        'RECOVERED',
        'DISMISSED_NOT_RECOVERABLE',
        'EXPIRED_UNCOLLECTIBLE'
    )),
    assigned_analyst_name VARCHAR(150),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
```

---

## Business Rules & Invariants

1. **Rule 1: Cross-Module Universal Normalization:** Every opportunity from all 7 modules is scored on the identical $0.00 - 100.00$ scale.
2. **Rule 2: Expected Realizable Yield Invariant:**
   $$\text{ExpectedYield} = \text{recoverable\_amount} \times \left(\frac{\text{confidence}}{100}\right) \times \left(\frac{\text{recoverability}}{100}\right)$$
   Must be deterministic and never exceed `recoverable_amount`.
3. **Rule 3: Expired Timely Filing Gate:** If `days_until_deadline < 0`, `urgency_score = 0.00`, tier is forced to `TIER_5_EXPIRED_OR_SUPPRESSED`, and status is set to `EXPIRED_UNCOLLECTIBLE`.
4. **Rule 4: Master Sorting Invariant:** The master prioritized queue is sorted strictly by:
   1. `priority_tier_rank ASC` (Tier 1 first)
   2. `rops_priority_score DESC` (Highest ROPS first)
   3. `yield_per_hour DESC` (Highest recovery velocity first)
   4. `days_until_deadline ASC` (Most urgent filing deadline first)
5. **Rule 5: Multi-Tenant Facility Isolation:** All queries, views, and RLS policies isolate data by `facility_id` via `app.current_facility_id`.

---

## UI / Workflow Requirements (Maestro Clinical Design)

- **Color Governance:** Strictly **0 purple/violet/indigo/magenta/fuchsia tokens**.
- **5-Card Top Metric Ribbon:**
  - Total Pipeline Opportunities ($)
  - Expected Realizable Yield ($)
  - Average ROPS Score
  - Critical Urgent Deadlines (<15d)
  - Cash Recovered MTD ($)
- **Domain Source Filter Tabs:**
  - All Opportunities
  - Implant Carveouts (`IMPLANT_CARVEOUT`)
  - Denial Appeals (`DENIAL_APPEAL`)
  - Secondary COB (`SECONDARY_COB`)
  - Underpayments (`PAYER_UNDERPAYMENT`)
  - Recurring Patterns (`RECURRING_PATTERN`)
  - Unbilled Encounters (`UNBILLED_CASE`)
- **ROPS Score Inspector:** Visual progress bars displaying Value (35%), Confidence (25%), Recoverability (25%), and Urgency (15%) subscore contributions.
- **Yield Velocity Tag:** Displays expected return velocity in $\$ / \text{hr}$ of staff labor.
- **Interactive Actions:**
  - *Dispatch to Work Queue*: Assigns opportunity to specialized analyst and moves to active workflow.
  - *Detail Drill-Down Modal*: Deep inspection of source claim, CPT, contract clause, and financial formula.
  - *Record Recovery*: Marks case recovered and reconciles collected cash.

---

## QA & Verification Test Plan

Automated test suite (`tests/opportunity-priority-score.test.js`) verifies:
1. Taxonomy definitions for all 7 source modules, 5 action tiers, and 4 scoring weights.
2. Weight invariants (sums to exactly 1.00).
3. Deterministic financial math:
   - Expected Realizable Yield calculation.
   - Yield Per Hour ($\$/\text{hr}$) calculation with effort floor.
   - Value subscore normalization against benchmark ($5,000.00).
   - Urgency subscore timeline mapping.
   - ROPS composite weighted sum calculation.
4. Business invariants:
   - Timely filing expiration forces Tier 5 and status `EXPIRED_UNCOLLECTIBLE`.
   - Sorting invariant (Tier Rank ASC, ROPS DESC, Yield/hr DESC, Days Left ASC).
5. State transitions:
   - `SCORED` $\rightarrow$ `DISPATCHED_TO_QUEUE` $\rightarrow$ `RECOVERED`.
6. Database migration 075 integrity (tables, views, indexes, 1:1 RLS policies, clean down rollback).
7. Maestro Clinical Design System governance (strictly ZERO purple tokens in JSX/CSS).
8. Application wiring and specification completeness.

