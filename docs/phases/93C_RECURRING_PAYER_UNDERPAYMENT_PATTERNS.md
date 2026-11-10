# 93C RECURRING PAYER UNDERPAYMENT PATTERNS

## Purpose
Production specification for detecting repeated underpayment patterns across payer, plan, contract rule, CPT/HCPCS, modifier, implant carve-out, and adjudication behavior.

The primary objective is to transform isolated claim variances into higher-value systemic batch recovery opportunities.

As the operational principle states:

> **One claim short by \$840 is an isolated claim issue.**  
> **Seventeen similar claims short for the same rule is a systemic payer pattern.**

---

## Scope
- Group validated payment variances (from Phase 93A) by clinically and contractually meaningful dimensions.
- Detect repeated underpayment patterns using objective, neutral language without assuming payer intent (*"Repeated payment variance pattern detected"*, never *"payer intentionally underpaid"*).
- Quantify aggregate potential recovery and validated recoverable value across multi-claim cohorts.
- Create formal batch recovery opportunities only when claim-level evidence and contract versioning support rigorous grouping.
- Identify affected claims, first/last detection dates, frequency, average variance, and rule consistency.
- Prevent false grouping across different plans, contracts, date ranges, modifier combinations, or case-rate structures.
- Enforce earliest statutory filing deadline across all grouped claims in a batch packet.
- Prevent duplicate value attribution across individual recovery cases (Phase 93B) and batch recovery opportunities (Phase 93C).
- Feed downstream Phase 98 Opportunity Priority Score and Phase 99 Recoverable Revenue Work Queue.

---

## Current State
Existing reusable assets:
- Phase 66 Payer Contract Model: **KEEP**
- Phase 67 Payer Contract Rate Rules: **KEEP**
- Phase 68 Expected Reimbursement Engine: **KEEP**
- Phase 69 Reimbursement Calculation Auditability: **KEEP**
- Phase 80 Claims Model: **KEEP**
- Phase 82 835 Remittance Ingestion: **KEEP**
- Phase 83 Payments & Adjustments: **KEEP**
- Phase 84 CARC/RARC Intelligence: **KEEP**
- Phase 90 Revenue Leakage Lifecycle: **KEEP**
- Phase 93 Underpayment Detection: **KEEP**
- Phase 93A Payment Variance Validation: **REQUIRED PREDECESSOR**
- Phase 93B Recovery Evidence and Timeline: **REQUIRED PREDECESSOR**
- Phase 98 Opportunity Priority Score: **FUTURE INTEGRATION**
- Phase 99 Recoverable Revenue Work Queue: **FUTURE INTEGRATION**

Missing components addressed by Phase 93C:
- Formal recurring payer underpayment pattern entity (`payer_underpayment_patterns`): **IMPLEMENTED**
- Multi-dimensional deterministic pattern grouping key: **IMPLEMENTED**
- Pattern-claim junction entity (`payer_underpayment_pattern_claims`): **IMPLEMENTED**
- Batch recovery opportunity entity (`batch_recovery_opportunities`): **IMPLEMENTED**
- Pattern-level financial impact and earliest filing deadline engine: **IMPLEMENTED**

---

## Target State

The engine identifies 8 core systemic underpayment pattern categories:
1. `FEE_SCHEDULE_MISMATCH`: Repeated application of outdated, reduced, or default fee schedules instead of contracted commercial rates.
2. `IMPLANT_CARVEOUT_OMISSION`: Repeated non-payment or packaging of high-cost surgical implants (invoice + markup) on Revenue Code 0278 lines.
3. `MPPR_OVER_DISCOUNT`: Repeated improper application of multiple procedure reductions (>50% cut, or applying cuts to standalone primary procedures).
4. `MODIFIER_REDUCTION_ERROR`: Repeated unwarranted payment reductions on procedures billed with modifier -59, -X{EPSU}, -50 (bilateral), or -22.
5. `CASE_RATE_UNPACKAGING_ERROR`: Repeated improper grouping of separately billable services into a primary procedure case rate.
6. `CONTRACT_VERSION_MISMATCH`: Repeated adjudication using superseded contract versions or expired fee tables across overlapping effective dates.
7. `SECONDARY_PROCEDURE_UNDERPAYMENT`: Repeated zero-dollar or below-contract allowance on secondary surgical codes.
8. `LINE_LEVEL_CARC_EXCLUSION`: Repeated automated denial or cut driven by specific automated payer CARC/RARC rule engines (e.g. CARC 45, 96, 97, 236).

### Pattern Lifecycle States
1. `OPEN`: Newly detected pattern meeting initial clustering criteria.
2. `UNDER_REVIEW`: Assigned to lead RCM specialist for contract verification.
3. `VALIDATED`: Clinically and contractually confirmed as a genuine systemic underpayment.
4. `BATCH_RECOVERY_READY`: Bundled evidence packet exceeds minimum threshold and is ready for supervisor sign-off.
5. `IN_RECOVERY`: Batch dispute formally submitted to payer contracting or claims leadership.
6. `RESOLVED`: Payer accepted systemic correction and issued batch settlement/reprocessing.
7. `DISMISSED`: Verified as legitimate contractual adjudication upon multi-claim review.
8. `EXPIRED`: Earliest statutory filing deadline passed before batch action was taken.

---

## Data Model / Schema

### 1. `public.payer_underpayment_patterns`
Header table storing identified multi-claim underpayment patterns.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique pattern identifier |
| `organization_id` | `UUID` | `NOT NULL` | Tenancy organization scope |
| `facility_id` | `UUID` | `NOT NULL REFERENCES public.facilities(id)` | Tenancy facility scope |
| `payer_id` | `UUID` | `NOT NULL` | Governing payer identifier |
| `plan_id` | `UUID` | `NULL` | Specific plan identifier (strict grouping) |
| `contract_id` | `UUID` | `NULL` | Commercial contract agreement identifier |
| `contract_version_id` | `UUID` | `NULL` | Exact contract version evaluated |
| `pattern_code` | `VARCHAR(64)` | `NOT NULL` | Human-readable pattern code (e.g. `PAT-BCBS-29827-FEE`) |
| `root_cause_code` | `VARCHAR(64)` | `NOT NULL` | Categorical root cause (e.g. `FEE_SCHEDULE_MISMATCH`) |
| `cpt_hcpcs_code` | `VARCHAR(16)` | `NULL` | Primary surgical procedure code |
| `modifier_signature` | `TEXT` | `NULL` | Sorted string of modifiers (e.g. `22,59` or `NONE`) |
| `rule_signature` | `TEXT` | `NOT NULL` | Hash/signature of contract rate calculation rule |
| `first_detected_date` | `DATE` | `NOT NULL` | Earliest date of service in pattern cohort |
| `last_detected_date` | `DATE` | `NOT NULL` | Most recent date of service in pattern cohort |
| `claim_count` | `INTEGER` | `NOT NULL CHECK (claim_count >= 0)` | Total claims clustered in pattern |
| `validated_claim_count` | `INTEGER` | `NOT NULL CHECK (validated_claim_count >= 0)` | Claims confirmed `VALID_UNDERPAYMENT` |
| `aggregate_variance` | `NUMERIC(14,2)` | `NOT NULL CHECK (aggregate_variance >= 0)` | Sum of variance amounts across claims |
| `validated_recoverable_amount` | `NUMERIC(14,2)` | `NOT NULL CHECK (validated_recoverable_amount >= 0)` | Sum of validated recoverable amounts |
| `confidence_level` | `VARCHAR(16)` | `NOT NULL CHECK (confidence_level IN ('HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'))` | Pattern confidence rating |
| `status` | `VARCHAR(32)` | `NOT NULL CHECK (status IN (...))` | 8 pattern lifecycle states |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Last update timestamp |

### 2. `public.payer_underpayment_pattern_claims`
Junction table linking specific validated payment variances to a pattern.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `pattern_id` | `UUID` | `NOT NULL REFERENCES public.payer_underpayment_patterns(id) ON DELETE CASCADE` | Pattern foreign key |
| `payment_variance_id` | `UUID` | `NOT NULL REFERENCES public.payment_variances(id) ON DELETE CASCADE` | Validated variance foreign key |
| `claim_id` | `UUID` | `NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE` | Claim foreign key |
| `date_of_service` | `DATE` | `NOT NULL` | Date procedure was performed |
| `variance_amount` | `NUMERIC(14,2)` | `NOT NULL CHECK (variance_amount >= 0)` | Disputed variance on this claim |
| `validation_status` | `VARCHAR(40)` | `NOT NULL` | Status from Phase 93A validation |
| `PRIMARY KEY` | `(pattern_id, payment_variance_id)` | Composite key prevents duplicate claim clustering |

### 3. `public.batch_recovery_opportunities`
High-value actionable batch recovery dispute packets bundled for joint resolution.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique batch opportunity identifier |
| `pattern_id` | `UUID` | `NOT NULL REFERENCES public.payer_underpayment_patterns(id) ON DELETE CASCADE` | Associated pattern identifier |
| `facility_id` | `UUID` | `NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE` | Tenancy facility scope |
| `batch_number` | `VARCHAR(64)` | `NOT NULL` | Human-readable batch ID (e.g. `BATCH-2026-BCBS-01`) |
| `claim_count` | `INTEGER` | `NOT NULL CHECK (claim_count >= 0)` | Total claims included in batch |
| `potential_recovery` | `NUMERIC(14,2)` | `NOT NULL CHECK (potential_recovery >= 0)` | Total disputed value across batch |
| `validated_recovery` | `NUMERIC(14,2)` | `NOT NULL CHECK (validated_recovery >= 0)` | Total contractually confirmed recoverable $ |
| `filing_deadline_earliest` | `DATE` | `NULL` | Earliest statutory deadline among all claims |
| `priority_score` | `NUMERIC(6,2)` | `CHECK (priority_score BETWEEN 0.00 AND 100.00)` | Composite priority rating |
| `owner_user_id` | `UUID` | `REFERENCES auth.users(id)` | Assigned senior dispute negotiator |
| `status` | `VARCHAR(32)` | `NOT NULL CHECK (status IN ('DRAFT', 'READY_FOR_SUPERVISOR', 'APPROVED', 'DISPATCHED_TO_PAYER', 'SETTLED', 'CLOSED', 'EXPIRED'))` | Batch dispute status |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Last update timestamp |

---

## Business Rules

### Rule 1: Strict Multi-Dimensional Grouping Key
Claims may **never** be clustered into a pattern solely because they share a similar dollar short-pay.
A pattern grouping key must strictly match across all the following dimensions:
$$\text{GroupingKey} = \text{payer\_id} + \text{plan\_id} + \text{contract\_version\_id} + \text{root\_cause\_code} + \text{cpt\_hcpcs\_code} + \text{modifier\_signature} + \text{rule\_signature}$$

- **Contract Version Isolation:** If two claims have the same CPT code but were adjudicated under different contract versions with different allowable rates, they **must not** be grouped together.
- **Plan Type Isolation:** Commercial PPO and Medicare Advantage plans under the same payer entity cannot be merged into the same pattern if payment terms or fee schedules differ.

### Rule 2: Minimum Pattern Qualification Thresholds
To qualify as an actionable pattern:
- **Default Claim Volume:** At least **3 validated claims** matching the identical grouping key; OR
- **High-Dollar Value Gate:** At least **2 claims** whose aggregate validated recoverable amount exceeds the facility high-value threshold (default: **\$2,500.00**).
Cohorts failing to meet both criteria remain classified as individual claim variances (Phase 93A/93B) and do not escalate to batch status.

### Rule 3: Quality-Capped Confidence Inheritance
The confidence of a pattern is strictly bounded by the validation quality of its constituent claims:
- If $< 60\%$ of claims in the cluster are validated (`VALID_UNDERPAYMENT`), the pattern confidence cannot exceed `LOW`.
- If $60\% - 85\%$ of claims are validated, confidence is capped at `MEDIUM`.
- A pattern may achieve `HIGH` confidence only when $\ge 85\%$ of claims are validated and the underlying contract rule is actively in force.

### Rule 4: Earliest Filing Deadline Governance
Because commercial health plans enforce strict 90, 120, or 180-day reconsideration filing limits from the initial remittance date, a batch recovery opportunity inherits the **earliest statutory filing deadline** among all included claims:
$$\text{BatchDeadline} = \min_{c \in \text{Claims}} (\text{filing\_deadline}_c)$$
This prevents older claims in a batch from expiring while newer claims are being accumulated.

### Rule 5: Strict Anti-Double-Counting Invariant
- A claim may be evaluated across multiple statistical or exploratory views.
- However, for financial ledger and work queue purposes, a single claim's recoverable variance cannot be counted in both an active single-claim recovery case (Phase 93B) and an active batch recovery opportunity (Phase 93C) simultaneously.
- When an individual claim is added to an active batch opportunity, its single-case workflow is synchronized into the batch container.

---

## Permissions & Multi-Tenancy
- **Facility Tenancy:** Enforced across all tables via PostgreSQL Row Level Security (RLS) policies checking `facility_id` against `auth.jwt() ->> 'facility_id'`.
- **RBAC Governance:**
  - `Billing Specialist`: View patterns, inspect affected claims, suggest grouping.
  - `RCM Supervisor / Contract Manager`: Validate patterns, generate batch recovery opportunities, adjust thresholds.
  - `Finance Director / VP`: Authorize batch settlement terms, execute formal payer contracting escalations.

---

## API / Service Requirements
The service layer (`payerPatternService.js`) provides authoritative, auditable functions:
- `detect_underpayment_patterns(facility_id, options)`: Analyzes validated payment variances and groups them into deterministic pattern clusters.
- `rebuild_underpayment_pattern(pattern_id)`: Recalculates metrics, claim counts, aggregate recoverable amount, and earliest filing deadline.
- `create_batch_recovery_opportunity(pattern_id, options)`: Bundles validated claims into an authoritative batch recovery packet.
- `list_pattern_claims(pattern_id)`: Returns itemized claim details, dates of service, and line variances for a pattern.
- `calculate_pattern_financial_impact(pattern_id)`: Computes statistical metrics (average short-pay per case, frequency, projected annual leakage).
- `generate_batch_dispute_package(pattern_id)`: Compiles systemic contract rebuttal letter citing all constituent claims and contract terms.

---

## UI / Workflow Requirements
Clinical Maestro UI layout with high-contrast dark theme (`#0b1120 !important` canvas, `#0f172a !important` cards, strictly ZERO purple tokens):

1. **Header & Facility Banner:** Phase 93C pill, facility selector, live sync button, CSV export button.
2. **5-Card KPI Ribbon:**
   - Total Systemic Patterns Detected
   - Total Affected Surgical Encounters
   - Aggregate Validated Recoverable ($)
   - Highest-Value Payer Pattern ($)
   - Batch Recovery Pipeline ($)
3. **4 Primary Workbenches:**
   - **Workbench 1: Recurring Patterns Grid:** Sortable table showing Pattern Code, Payer / Plan, Root Cause, CPT Code, Claim Count, Aggregate Variance ($), Validated Recoverable ($), Earliest Deadline, Confidence pill, Status, and Actions (`Inspect`, `Create Batch`, `Re-evaluate`).
   - **Workbench 2: Pattern Deep-Dive & Affected Claims:** Itemized claim-by-claim data grid showing DOS, patient, claim #, expected allowable, paid allowable, variance, and validation status.
   - **Workbench 3: Batch Recovery Opportunities:** Dedicated work queue managing bundled multi-claim recovery dispute packets.
   - **Workbench 4: Payer Systemic Leakage Analytics:** High-level executive distribution showing top underpaying payers, root-cause distribution, and annual projected leakage.
4. **Interactive Action Modals:**
   - Create Batch Recovery Opportunity Modal (bundles claims, assigns negotiator, locks package)
   - Pattern Re-evaluation Modal (re-checks claims against updated contracts)
   - AI Systemic Payer Rebuttal Letter Drafter (drafts high-level executive dispute package for payer contracting department).

---

## QA / Test Cases
The automated test suite (`tests/payer-underpayment-patterns.test.js`) verifies:
1. Five claims matching same payer/plan/CPT/rule group into a single pattern.
2. Same payer but different health plan (Commercial vs Medicare Advantage) strictly does not group.
3. Same CPT code under different contract versions splits into separate patterns.
4. Repeated implant carve-out omissions group accurately across surgical encounters.
5. Repeated improper multiple procedure reductions (MPPR) cluster into a dedicated pattern.
6. Two claims below minimum threshold ($<3$ claims and $<\$2,500$) do not escalate to batch status.
7. High-dollar 2-claim pattern ($\ge \$2,500$) qualifies under the high-dollar threshold rule.
8. Manually dismissing one claim re-calculates aggregate pattern value and claim count.
9. Earliest statutory filing deadline across included claims is accurately selected.
10. Duplicate claims are prevented via composite primary key constraint.
11. PostgreSQL Row Level Security blocks cross-facility data leakage.
12. Strict Maestro Clinical Design System compliance: strictly ZERO purple/violet/indigo/magenta tokens.
13. Database migration integrity (tables, columns, indexes, foreign keys, 1:1 RLS policies, clean rollback).
14. Application wiring and documentation completeness.

---

## Acceptance Criteria
- Patterns are constructed only from validated claim-level variances (`VALID_UNDERPAYMENT`).
- Grouping algorithm is strictly deterministic, auditable, and reproducible.
- Pattern-level totals reconcile to the exact sum of included claims.
- Earliest filing deadline correctly governs the batch packet.
- No duplicate recovery value is counted between single-claim cases and batch opportunities.
- Build, lint, RLS, unit, integration, and UI tests pass with clean exit codes.

---

## Definition of Done
Complete only when ASCANALYST can reliably identify systemic payer payment-variance patterns, explain why claims are grouped, quantify validated aggregate exposure, and create auditable batch recovery opportunities without double counting.
