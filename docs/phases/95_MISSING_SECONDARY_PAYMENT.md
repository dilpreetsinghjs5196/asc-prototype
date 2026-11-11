# 95 MISSING SECONDARY PAYMENT

## Purpose
Production specification for detecting, validating, prioritizing, and recovering uncollected secondary and supplemental payer reimbursements and coordination-of-benefits (COB) balances.

The primary operational objective is to eliminate secondary revenue leakage where primary payers have adjudicated claims with patient responsibility balances (deductibles `PR-1`, coinsurance `PR-2`, and copays `PR-3`) that were covered under valid secondary/supplemental insurance policies but were never billed, dropped to crossover, or were prematurely shifted to self-pay patient statements.

As the operational principle states:

> **Secondary insurance is not patient debt.**  
> **A $1,400 surgical coinsurance balance after Medicare Part B must be systematically billed to the verified Medigap/commercial secondary payer with primary EOB evidence before any statement is delivered to a patient or written off.**

---

## Scope
- Reconcile primary 835 Remittance Advice (ERA) adjudication balances against patient insurance registries and secondary payer policies.
- Detect 7 discrete secondary leakage root causes:
  1. `UNFILED_SECONDARY_CLAIM`: Primary adjudicated with PR balance, secondary coverage active, but no secondary claim created.
  2. `FAILED_CROSSOVER`: Medicare/commercial automatic electronic crossover failed or was rejected.
  3. `PREMATURE_PATIENT_BILLING`: Patient balance statement dispatched prior to secondary adjudication.
  4. `SECONDARY_TIMELY_FILING_RISK`: Remaining days to secondary filing limit $\le 30$ days from primary EOB date.
  5. `MISSING_PRIMARY_EOB`: Secondary claim rejected or blocked due to missing primary remittance documentation.
  6. `SECONDARY_COB_DENIAL`: Secondary payer denied under CARC 22/23 requiring COB documentation or inquiry.
  7. `SECONDARY_UNDERPAYMENT`: Secondary paid less than contractual COB calculation (e.g. 20% Medicare coinsurance).
- Calculate deterministic secondary expected reimbursement across 3 standard COB models:
  - Standard Coordination (Lesser of balance vs secondary allowed)
  - Medicare Supplement / Medigap (100% of Medicare Part B 20% coinsurance)
  - Non-Duplication / Carve-Out COB
- Rank secondary recovery opportunities using a 4-factor deterministic scoring model ($0.00 - 100.00$).
- Enforce statutory secondary timely filing limits (typically 90–180 days from *primary EOB date*).
- Support 1-click electronic secondary claim generation (837P Loop 2320/2330 COB formatting).
- Provide facility multi-tenancy, Row Level Security (RLS), and RBAC access governance.

---

## Current State

Existing reusable assets:
- Phase 80 Claims Model (`claims` table): **KEEP**
- Phase 82 835 Remittance Advice (`edi_835_remittances` table): **KEEP**
- Phase 83 Payments & Adjustments (`payment_adjustments` table with `PR` codes): **KEEP**
- Phase 84 CARC/RARC Intelligence: **KEEP**
- Phase 85 Denials Management: **KEEP**
- Phase 86 Appeals Workflow: **KEEP**
- Phase 87 Patient Balances (`patient_balance_ledger`): **KEEP / INTEGRATE**
- Phase 90 Revenue Leakage Engine: **KEEP / EXTEND**
- Phase 93 Underpayment Detection: **KEEP**
- Phase 93A Payment Variance Validation: **KEEP**
- Phase 93B Recovery Evidence and Timeline: **KEEP**
- Phase 93C Recurring Payer Underpayment Patterns: **KEEP**
- Phase 94 Denial Recovery Prioritization: **KEEP**

Missing components addressed by Phase 95:
- Secondary payer leakage detection engine: **IMPLEMENTED**
- Secondary leakage ledger table (`missing_secondary_payments`): **IMPLEMENTED**
- Secondary COB calculation and filing rules table (`secondary_cob_rules`): **IMPLEMENTED**
- 4-factor secondary priority ranking and timely filing countdown: **IMPLEMENTED**
- Secondary recovery queue UI workbenches: **IMPLEMENTED**

---

## Target State

The system monitors every primary claim adjudication. When an 835 remittance posts with Patient Responsibility group codes (`PR-1`, `PR-2`, `PR-3`) and the patient profile contains a secondary policy:

### 1. Secondary Expected Reimbursement Models

#### A. Medicare Supplement / Medigap Model (Most Common in ASCs)
Medicare Part B pays $80\%$ of allowable ASC charges; the remaining $20\%$ is coinsurance:
$$\text{MedicareCoinsurance} = \text{PrimaryAllowed} \times 0.20$$
$$\text{ExpectedSecondaryReimbursement} = \text{MedicareCoinsurance}$$
*(Subject to Medigap policy plan benefits: Plans A, B, C, D, F, G, M, N pay $100\%$ of Part B coinsurance).*

#### B. Standard Coordination Model
Secondary reimburses the lesser of the primary unpaid balance or what secondary would have paid as primary:
$$\text{PrimaryUnpaidBalance} = \text{PrimaryDeductible} + \text{PrimaryCoinsurance} + \text{PrimaryCopay}$$
$$\text{SecondaryPrimaryEquivalent} = \text{SecondaryAllowed} - \text{PrimaryPaid}$$
$$\text{ExpectedSecondaryReimbursement} = \min(\text{PrimaryUnpaidBalance},\, \max(0,\, \text{SecondaryPrimaryEquivalent}))$$

#### C. Non-Duplication / Carve-Out Model
Secondary calculates its normal allowed amount, subtracts the primary payment, and pays the positive difference:
$$\text{ExpectedSecondaryReimbursement} = \max(0,\, \text{SecondaryAllowed} - \text{PrimaryPaid})$$

---

### 2. Multi-Factor Priority Score Formula ($0.00 - 100.00$)

$$\text{PriorityScore} = (\text{BalanceScore} \times 0.35) + (\text{FilingUrgencyScore} \times 0.30) + (\text{CoverageCertaintyScore} \times 0.20) + (\text{FilingReadinessScore} \times 0.15)$$

#### A. Balance Score ($35\%$ Weight)
Evaluates financial magnitude relative to secondary facility benchmark ($\$1,500.00$):
$$\text{BalanceScore} = \min\left(100.00,\, \frac{\text{secondary\_expected\_amount}}{\text{benchmark\_value}} \times 100.00\right)$$

#### B. Filing Urgency Score ($30\%$ Weight)
Evaluates remaining calendar days from primary EOB date before secondary filing limit permanently closes (default: 90 days from primary EOB):
- $\le 15$ days remaining: **$100.00$ points** (Critical statutory cliff)
- $16 - 30$ days remaining: **$85.00$ points**
- $31 - 60$ days remaining: **$65.00$ points**
- $61 - 90$ days remaining: **$40.00$ points**
- $> 90$ days remaining: **$20.00$ points**
- Expired ($< 0$ days): **$0.00$ points** (Transitions to `UNCOLLECTIBLE_HOLD`)

#### C. Coverage Certainty Score ($20\%$ Weight)
- `VERIFIED_ACTIVE` (Real-time 270/271 eligibility active on surgery DOS): **$100.00$ points**
- `VERIFIED_COMMERCIAL` (Commercial policy card on file, unverified DOS): **$75.00$ points**
- `MEDICAID_PENDING` (Dual-eligible crossover pending confirmation): **$50.00$ points**
- `UNVERIFIED_POLICY` (Secondary policy number entered without eligibility proof): **$25.00$ points**

#### D. Filing Readiness Score ($15\%$ Weight)
- `READY_CLEAN_EDI`: Primary 835 attached, Secondary Payer ID validated, Loop 2320 mapped: **$100.00$ points**
- `ATTACHMENTS_NEEDED`: Primary EOB available as paper/PDF; manual clearinghouse upload needed: **$70.00$ points**
- `INCOMPLETE_COB_DATA`: Missing secondary subscriber ID, relationship code, or group #: **$30.00$ points**

---

### 3. Priority Tier Taxonomy
- **`CRITICAL_URGENT`** ($\text{Score} \ge 80.00$): Imminent filing deadline ($\le 15$ days) or high balance ($> \$1,500$) with verified secondary coverage.
- **`HIGH_PRIORITY`** ($\text{Score} \in [65.00, 79.99]$): High expected yield and verified Medigap/Commercial policy.
- **`MEDIUM_PRIORITY`** ($\text{Score} \in [45.00, 64.99]$): Standard secondary billing queue ($> 30$ days remaining).
- **`LOW_PRIORITY`** ($\text{Score} \in [25.00, 44.99]$): Minor balances ($< \$100$) or unverified coverage.
- **`UNCOLLECTIBLE_HOLD`** ($\text{Score} < 25.00$ or filing deadline expired): Secondary filing limit elapsed or non-covered.

---

## Data Model / Schema

### 1. `public.missing_secondary_payments`
Stores identified secondary leakage cases, expected amounts, urgency, and filing status.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Record unique identifier |
| `organization_id` | `UUID` | `NOT NULL` | Tenancy organization scope |
| `facility_id` | `UUID` | `NOT NULL REFERENCES public.facilities(id)` | Tenancy facility scope |
| `claim_id` | `UUID` | `NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE` | Associated claim |
| `patient_id` | `UUID` | `NOT NULL` | Patient identifier |
| `patient_name` | `VARCHAR(128)` | `NOT NULL` | Patient full name |
| `patient_mrn` | `VARCHAR(64)` | `NOT NULL` | Medical record number |
| `primary_payer_id`| `UUID` | `NOT NULL` | Primary payer identifier |
| `primary_payer_name`| `VARCHAR(128)`| `NOT NULL` | Primary payer title |
| `primary_paid_amount`| `NUMERIC(14,2)`| `NOT NULL CHECK (primary_paid_amount >= 0)` | Primary insurance payment |
| `primary_allowed_amount`| `NUMERIC(14,2)`| `NOT NULL CHECK (primary_allowed_amount >= 0)`| Primary contracted allowance |
| `primary_eob_date`| `DATE` | `NOT NULL` | Date primary 835 ERA posted |
| `secondary_payer_id`| `UUID` | `NOT NULL` | Secondary payer identifier |
| `secondary_payer_name`| `VARCHAR(128)`| `NOT NULL`| Secondary payer title |
| `secondary_policy_number`| `VARCHAR(64)`| `NOT NULL`| Secondary subscriber policy ID |
| `secondary_cob_model`| `VARCHAR(32)`| `NOT NULL CHECK (secondary_cob_model IN ('MEDIGAP_SUPPLEMENT', 'STANDARD_COB', 'NON_DUPLICATION_CARVEOUT'))` | COB logic applied |
| `primary_patient_resp_amount`| `NUMERIC(14,2)`| `NOT NULL CHECK (primary_patient_resp_amount >= 0)` | Unpaid PR-1/2/3 balance |
| `secondary_expected_amount`| `NUMERIC(14,2)`| `NOT NULL CHECK (secondary_expected_amount >= 0)` | Contractually expected secondary payment |
| `secondary_actual_paid_amount`| `NUMERIC(14,2)`| `NOT NULL DEFAULT 0.00 CHECK (secondary_actual_paid_amount >= 0)` | Actual secondary payment received |
| `secondary_filing_deadline`| `DATE` | `NOT NULL` | Secondary timely filing deadline |
| `days_until_filing_deadline`| `INTEGER` | `NOT NULL` | Calendar days remaining |
| `leakage_root_cause`| `VARCHAR(40)` | `NOT NULL CHECK (leakage_root_cause IN ('UNFILED_SECONDARY_CLAIM', 'FAILED_CROSSOVER', 'PREMATURE_PATIENT_BILLING', 'SECONDARY_TIMELY_FILING_RISK', 'MISSING_PRIMARY_EOB', 'SECONDARY_COB_DENIAL', 'SECONDARY_UNDERPAYMENT'))` | Root cause taxonomy |
| `coverage_certainty`| `VARCHAR(32)`| `NOT NULL` | Eligibility certainty tier |
| `filing_readiness` | `VARCHAR(32)` | `NOT NULL` | Electronic readiness tier |
| `balance_score` | `NUMERIC(5,2)` | `NOT NULL CHECK (balance_score BETWEEN 0 AND 100)` | Normalized balance score |
| `urgency_score` | `NUMERIC(5,2)` | `NOT NULL CHECK (urgency_score BETWEEN 0 AND 100)` | Timely filing score |
| `certainty_score` | `NUMERIC(5,2)` | `NOT NULL CHECK (certainty_score BETWEEN 0 AND 100)` | Coverage certainty score |
| `readiness_score` | `NUMERIC(5,2)` | `NOT NULL CHECK (readiness_score BETWEEN 0 AND 100)` | Filing readiness score |
| `priority_score` | `NUMERIC(5,2)` | `NOT NULL CHECK (priority_score BETWEEN 0 AND 100)` | Composite priority score |
| `priority_tier` | `VARCHAR(32)` | `NOT NULL CHECK (priority_tier IN ('CRITICAL_URGENT', 'HIGH_PRIORITY', 'MEDIUM_PRIORITY', 'LOW_PRIORITY', 'UNCOLLECTIBLE_HOLD'))` | Priority tier |
| `queue_status` | `VARCHAR(32)` | `NOT NULL CHECK (queue_status IN ('IDENTIFIED', 'READY_TO_FILE', 'SUBMITTED', 'PENDING_ADJUDICATION', 'RECOVERED', 'TRANSFERRED_TO_PATIENT', 'WRITTEN_OFF'))` | Case workflow state |
| `patient_statement_held`| `BOOLEAN` | `NOT NULL DEFAULT true` | Blocks premature billing |
| `assigned_user_id`| `UUID` | `NULL REFERENCES auth.users(id)` | Assigned billing specialist |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Last update timestamp |

---

## Business Rules

### Rule 1: Patient Statement Suppression Invariant
When a verified secondary payer exists on file, `patient_statement_held` MUST remain `true` and the claim MUST NOT be exported to patient billing until:
1. Secondary claim has been submitted AND adjudicated by secondary payer; OR
2. Secondary payer has formally denied coverage with non-appealable proof; OR
3. A certified billing supervisor explicitly overrides the hold with documented justification.

### Rule 2: Secondary Timely Filing Window Invariant
The secondary timely filing deadline is deterministically measured from the `primary_eob_date`, NOT the surgery date of service:
$$\text{FilingDeadline} = \text{primary\_eob\_date} + \text{secondary\_timely\_filing\_days} \quad (\text{Default: } 90 \text{ days})$$
If `days_until_filing_deadline < 0`:
- `urgency_score` is forced to `0.00`.
- Priority tier is forced to `UNCOLLECTIBLE_HOLD`.
- Electronic submission is blocked unless a documented timely filing waiver is attached.

### Rule 3: Medicare Crossover Reconciliation Invariant
For Medicare Part B primary encounters with a Medigap policy on file, the system audits the 835 ERA for Remark Code `MA18` (Claim crossover to secondary payer):
- If `MA18` is present: Status transitions to `PENDING_ADJUDICATION` with crossover monitoring.
- If `MA18` is absent: System flags as `FAILED_CROSSOVER` and automatically queues an electronic 837P secondary claim for manual/clearinghouse dispatch.

### Rule 4: Work Queue Sorting Order
Secondary recovery work queues are ordered to maximize recovered dollars and eliminate filing expirations:
$$\text{SortOrder} = \text{priority\_tier DESC}, \; \text{secondary\_expected\_amount DESC}, \; \text{days\_until\_filing\_deadline ASC}$$

---

## Permissions & RBAC
- `Billing Specialist`: View queue, submit secondary claims, attach primary EOBs, log secondary remit.
- `RCM Supervisor`: Approve write-offs for uncollectible secondary balances, release held patient statements.
- `Finance Director`: View secondary recovery yields, crossover failure rates, and avoided patient bad debt.

---

## UI / Workflow Requirements
Maestro Clinical Design System (`#0b1120 !important` canvas, `#0f172a !important` cards, strictly ZERO purple tokens):
1. **Header & Facility Selector:** Phase 95 badge, live sync, CSV export, secondary batch submit.
2. **5-Card KPI Ribbon:**
   - Active Secondary Leakage Claims
   - Total Disputed PR Balance ($)
   - Expected Secondary Recovery ($)
   - Critical & High Pipeline ($)
   - Premature Patient Statements Suppressed ($)
3. **4 Primary Workbenches:**
   - **Prioritized Secondary Queue:** Data grid with priority badges, patient details, primary payer, secondary payer, PR balance, expected secondary recovery, filing deadline pill, status, and actions.
   - **COB & Calculation Inspector:** 4-factor scoring breakdown, COB calculation model comparison (Medigap vs Standard vs Non-Duplication), and primary 835 ERA audit log.
   - **Payer Crossover Hub:** Tracking automatic Medicare/Commercial crossovers, failed crossover cohorts, and secondary clearinghouse submissions.
   - **Patient Statement Hold Guardian:** Audit of claims currently held from patient billing to protect patient experience and avoid billing harassment.
4. **Interactive Action Modals:**
   - Submit Secondary Claim Modal (validates Loop 2320/2330 formatting & attaches primary EOB).
   - Transfer Balance to Patient Modal (requires secondary adjudication confirmation).
   - Write-Off Uncollectible Secondary Modal (requires supervisor sign-off).

---

## QA / Test Cases
Automated test suite (`tests/missing-secondary-payment.test.js`) verifies:
1. Medigap 20% coinsurance calculation exactness.
2. Standard coordination formula (lesser of balance vs secondary allowed).
3. Non-duplication carve-out calculation.
4. 4-factor priority score calculation formula exactness.
5. Filing urgency score scaling based on days remaining.
6. Coverage certainty and filing readiness scoring.
7. Priority tier threshold classification.
8. Expired secondary deadline invariant (`days < 0` forces `UNCOLLECTIBLE_HOLD`).
9. Patient statement hold invariant (`patient_statement_held = true`).
10. Failed crossover detection (missing `MA18` flag).
11. Secondary claim submission and transition to `SUBMITTED`.
12. Database migration 072 integrity (tables, views, indexes, 1:1 RLS policies, clean down migration).
13. Maestro Clinical Design System governance (strictly ZERO purple tokens in JSX/CSS).
14. Application wiring and specification completeness.
