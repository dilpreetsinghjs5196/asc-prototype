# 96 PATIENT AR RECOVERY

## Purpose
Production specification for patient accounts receivable (Patient AR / Self-Pay) prioritization, propensity-to-pay segmentation, structured payment plan management, and financial recovery workflows.

The primary operational objective is to maximize post-insurance self-pay cash collections, reduce days in patient AR, eliminate patient billing harassment, and provide compassionate financial assistance pathways while preventing uncollectible bad debt write-offs.

As the operational principle states:

> **Patient balances should be recovered with clinical empathy and mathematical precision.**  
> **A patient with a $2,200 surgical coinsurance balance who has active digital engagement and high propensity to pay should be offered a seamless 6-month autopay plan on Day 15, rather than sent four threatening paper letters and dumped into third-party collections on Day 121.**

---

## Scope
- Ingest adjudicated patient responsibility balances (`PR-1` deductible, `PR-2` coinsurance, `PR-3` copay) only *after* primary and secondary insurances have fully adjudicated.
- Reconcile balances against Phase 87 Patient Balance Ledger and Phase 95 Missing Secondary Statement Hold Guardian.
- Apply a deterministic 4-factor Patient Recovery Priority Score ($0.00 - 100.00$).
- Segment patient accounts into 5 actionable recovery action tiers:
  1. `TIER_1_DIGITAL_NUDGE`: High propensity, fresh balance ($1-30$ days) -> SMS/Email payment link with 1-click digital checkout.
  2. `TIER_2_PAYMENT_PLAN_OFFER`: Moderate/large balance ($> \$500$) -> Automated structured installment plan ($3, 6, 12$ months) with autopay.
  3. `TIER_3_COUNSELOR_OUTREACH`: Aged balance ($61-90$ days) or high balance ($> \$1,500$) -> Direct phone outreach by Patient Financial Counselor.
  4. `TIER_4_FINAL_NOTICE`: Delinquent balance ($91-120$ days) -> Statutory 30-day pre-collection cure notice.
  5. `TIER_5_BAD_DEBT_OR_CHARITY`: Aged $> 120$ days -> Supervisor audit for either charity care financial assistance write-off or collection agency dispatch.
- Enforce strict patient protection rules (501(r) compliance, medical debt protection acts, charity care qualification).
- Manage recurring payment plan lifecycles (creation, active billing, default tracking, payoff completion).
- Provide facility multi-tenancy, Row Level Security (RLS), and RBAC access governance.

---

## Current State

Existing reusable assets:
- Phase 80 Claims Model (`claims` table): **KEEP**
- Phase 82 835 Remittance Advice: **KEEP**
- Phase 83 Payments & Adjustments (`payment_adjustments` with `PR` codes): **KEEP**
- Phase 87 Patient Balances (`patient_balance_ledger`): **KEEP / EXTEND**
- Phase 88 AR Aging & Days in AR (`ar_aging_buckets`): **KEEP / INTEGRATE**
- Phase 90 Revenue Leakage Engine: **KEEP**
- Phase 94 Denial Recovery Prioritization: **KEEP**
- Phase 95 Missing Secondary Payment (Statement Hold Guardian): **REQUIRED PRE-CONDITION**
- Phase 98 Opportunity Priority Score: **FUTURE INTEGRATION**
- Phase 99 Recoverable Revenue Work Queue: **FUTURE INTEGRATION**

Missing components addressed by Phase 96:
- Patient AR prioritization ledger entity (`patient_ar_recovery_cases`): **IMPLEMENTED**
- Structured recurring payment plans ledger (`patient_payment_plans`): **IMPLEMENTED**
- 4-factor Patient Recovery Priority Score and Propensity-to-Pay engine: **IMPLEMENTED**
- Charity care financial hardship evaluation rules: **IMPLEMENTED**
- Patient recovery UI workbenches and digital payment plan builder: **IMPLEMENTED**

---

## Target State

The engine processes only *true post-insurance* patient balances:

### 1. Deterministic Balance Invariant
$$\text{PatientResponsibilityDue} = (\text{PrimaryPR} - \text{SecondaryPaid}) - \text{PriorPatientPayments}$$
A claim is strictly prohibited from entering Patient AR Recovery if `patient_statement_held = true` (Phase 95) or if primary/secondary insurance is still pending adjudication.

---

### 2. Multi-Factor Patient Priority Score Formula ($0.00 - 100.00$)

$$\text{PriorityScore} = (\text{BalanceScore} \times 0.35) + (\text{PropensityScore} \times 0.30) + (\text{AgingUrgencyScore} \times 0.20) + (\text{EngagementScore} \times 0.15)$$

#### A. Balance Score ($35\%$ Weight)
Evaluates financial magnitude relative to facility patient AR benchmark ($\$1,000.00$):
$$\text{BalanceScore} = \min\left(100.00,\, \frac{\text{patient\_balance\_due}}{\text{benchmark\_value}} \times 100.00\right)$$

#### B. Propensity-to-Pay (P2P) Score ($30\%$ Weight)
Authoritative score ($0.00 - 100.00$) reflecting patient historical payment reliability, prior prompt-pay discounts, and credit behavior:
- `EXCELLENT_PROPENSITY`: **$100.00$ points** (History of full payment or completed payment plan within 60 days)
- `GOOD_PROPENSITY`: **$80.00$ points** (Reliable payer, occasional 30-day delay)
- `MODERATE_PROPENSITY`: **$55.00$ points** (Requires structured installment plan or phone prompt)
- `LOW_PROPENSITY`: **$30.00$ points** (Prior missed payments, sporadic engagement)
- `CHARITY_CANDIDATE`: **$10.00$ points** (Qualifies for financial hardship / income $\le 250\%$ FPL)

#### C. Aging Urgency Score ($20\%$ Weight)
Measured from the date the post-insurance statement was issued to the patient:
- $1 - 30$ days: **$100.00$ points** (Fresh balance; highest cash recovery velocity)
- $31 - 60$ days: **$85.00$ points** (First follow-up window)
- $61 - 90$ days: **$60.00$ points** (Second reminder; payment plan candidate)
- $91 - 120$ days: **$35.00$ points** (Delinquent; formal pre-collection notice)
- $> 120$ days: **$15.00$ points** (Bad debt / charity audit)

#### D. Engagement Score ($15\%$ Weight)
Reflects modern digital billing reachability:
- `DIGITAL_ACTIVE`: Patient portal registered + mobile SMS opted-in: **$100.00$ points**
- `EMAIL_VERIFIED`: Verified email statement opened: **$75.00$ points**
- `PHONE_VERIFIED`: Mobile phone on file, no portal: **$50.00$ points**
- `MAIL_ONLY`: Physical mailing address only: **$25.00$ points**

---

### 3. Patient Recovery Action Tiers
- **`TIER_1_DIGITAL_NUDGE`** ($\text{Score} \ge 80.00$): Automated SMS/Email statement with 1-click digital payment link.
- **`TIER_2_PAYMENT_PLAN_OFFER`** ($\text{Score} \in [65.00, 79.99]$): Automated structured 3–12 month zero-interest autopay proposal.
- **`TIER_3_COUNSELOR_OUTREACH`** ($\text{Score} \in [45.00, 64.99]$): Live call scheduled with Patient Financial Counselor.
- **`TIER_4_FINAL_NOTICE`** ($\text{Score} \in [25.00, 44.99]$): Certified 30-day cure warning before credit/agency reporting.
- **`TIER_5_BAD_DEBT_OR_CHARITY`** ($\text{Score} < 25.00$): Routed to supervisor audit for charity assistance or third-party bad debt.

---

## Data Model / Schema

### 1. `public.patient_ar_recovery_cases`
Tracks individual patient recovery accounts, scores, aging, and recovery lifecycle.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Case identifier |
| `organization_id` | `UUID` | `NOT NULL` | Tenancy organization scope |
| `facility_id` | `UUID` | `NOT NULL REFERENCES public.facilities(id)` | Tenancy facility scope |
| `claim_id` | `UUID` | `NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE` | Associated claim |
| `patient_id` | `UUID` | `NOT NULL` | Patient identifier |
| `patient_name` | `VARCHAR(128)` | `NOT NULL` | Patient full name |
| `patient_mrn` | `VARCHAR(64)` | `NOT NULL` | Medical record number |
| `patient_phone` | `VARCHAR(32)` | `NULL` | Contact phone number |
| `patient_email` | `VARCHAR(128)` | `NULL` | Contact email address |
| `date_of_service` | `DATE` | `NOT NULL` | Surgery date of service |
| `statement_date` | `DATE` | `NOT NULL` | First post-insurance statement date |
| `days_in_patient_ar`| `INTEGER` | `NOT NULL CHECK (days_in_patient_ar >= 0)` | Days elapsed since statement |
| `total_charges` | `NUMERIC(14,2)`| `NOT NULL CHECK (total_charges >= 0)` | Gross billed surgical charges |
| `insurance_paid_amount`| `NUMERIC(14,2)`| `NOT NULL CHECK (insurance_paid_amount >= 0)`| Primary + secondary insurance payments |
| `contractual_adjustment`| `NUMERIC(14,2)`| `NOT NULL CHECK (contractual_adjustment >= 0)`| Approved contractual write-offs |
| `original_patient_resp`| `NUMERIC(14,2)`| `NOT NULL CHECK (original_patient_resp >= 0)` | Initial post-insurance patient balance |
| `patient_paid_amount`| `NUMERIC(14,2)`| `NOT NULL DEFAULT 0.00 CHECK (patient_paid_amount >= 0)` | Total patient payments collected |
| `patient_balance_due`| `NUMERIC(14,2)`| `NOT NULL CHECK (patient_balance_due >= 0)` | Net outstanding patient balance |
| `propensity_to_pay_tier`| `VARCHAR(32)`| `NOT NULL` | P2P risk tier |
| `engagement_tier` | `VARCHAR(32)` | `NOT NULL` | Modern digital engagement tier |
| `balance_score` | `NUMERIC(5,2)` | `NOT NULL CHECK (balance_score BETWEEN 0 AND 100)` | Balance magnitude score |
| `propensity_score`| `NUMERIC(5,2)` | `NOT NULL CHECK (propensity_score BETWEEN 0 AND 100)`| Propensity score |
| `urgency_score` | `NUMERIC(5,2)` | `NOT NULL CHECK (urgency_score BETWEEN 0 AND 100)` | Aging urgency score |
| `engagement_score`| `NUMERIC(5,2)` | `NOT NULL CHECK (engagement_score BETWEEN 0 AND 100)`| Engagement score |
| `priority_score` | `NUMERIC(5,2)` | `NOT NULL CHECK (priority_score BETWEEN 0 AND 100)` | Composite priority score |
| `recovery_action_tier`| `VARCHAR(32)` | `NOT NULL CHECK (recovery_action_tier IN ('TIER_1_DIGITAL_NUDGE', 'TIER_2_PAYMENT_PLAN_OFFER', 'TIER_3_COUNSELOR_OUTREACH', 'TIER_4_FINAL_NOTICE', 'TIER_5_BAD_DEBT_OR_CHARITY'))` | Actionable tier |
| `case_status` | `VARCHAR(32)` | `NOT NULL CHECK (case_status IN ('NEW_STATEMENT', 'ENGAGED', 'ON_PAYMENT_PLAN', 'PAID_IN_FULL', 'CHARITY_APPROVED', 'BAD_DEBT_ASSIGNED', 'DISPUTED'))` | Workflow state |
| `payment_plan_id` | `UUID` | `NULL` | Linked active payment plan |
| `is_charity_screened`| `BOOLEAN` | `NOT NULL DEFAULT false` | Screened for hardship |
| `assigned_counselor_id`| `UUID` | `NULL REFERENCES auth.users(id)` | Financial counselor |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Last update timestamp |

---

### 2. `public.patient_payment_plans`
Stores structured installment plans with recurring billing terms.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Plan identifier |
| `facility_id` | `UUID` | `NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE` | Facility scope |
| `case_id` | `UUID` | `NOT NULL REFERENCES public.patient_ar_recovery_cases(id) ON DELETE CASCADE` | Linked AR recovery case |
| `patient_id` | `UUID` | `NOT NULL` | Patient identifier |
| `plan_total_amount`| `NUMERIC(14,2)`| `NOT NULL CHECK (plan_total_amount > 0)` | Total financed balance |
| `installment_count`| `INTEGER` | `NOT NULL CHECK (installment_count IN (3, 6, 12, 18, 24))` | Number of monthly installments |
| `monthly_payment_amount`| `NUMERIC(14,2)`| `NOT NULL CHECK (monthly_payment_amount > 0)` | Monthly installment amount |
| `autopay_enrolled`| `BOOLEAN` | `NOT NULL DEFAULT true` | Recurring ACH / Card autopay flag |
| `start_date` | `DATE` | `NOT NULL` | First installment date |
| `next_payment_date`| `DATE` | `NOT NULL` | Upcoming billing date |
| `total_paid_to_date`| `NUMERIC(14,2)`| `NOT NULL DEFAULT 0.00 CHECK (total_paid_to_date >= 0)` | Cumulative payments |
| `remaining_plan_balance`| `NUMERIC(14,2)`| `NOT NULL CHECK (remaining_plan_balance >= 0)` | Outstanding plan balance |
| `plan_status` | `VARCHAR(32)` | `NOT NULL CHECK (plan_status IN ('ACTIVE', 'COMPLETED', 'DELINQUENT', 'CANCELLED'))` | Installment plan status |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record creation timestamp |

---

## Business Rules

### Rule 1: Post-Adjudication Pre-Condition Invariant
No patient account may enter the Patient AR Recovery queue until:
1. Primary 835 Remittance has fully posted.
2. Verified secondary/supplemental insurance has fully adjudicated OR Phase 95 statement hold has been formally released.
3. Patient statement has been generated with itemized EOB credits.

### Rule 2: Balance Math Consistency Invariant
$$\text{patient\_balance\_due} = \text{original\_patient\_resp} - \text{patient\_paid\_amount}$$
Negative balances are strictly handled as patient credit refunds, not positive recovery debt.

### Rule 3: Charity Care First Protection Invariant
Before an account aging $> 120$ days may be considered for external collections:
- The system must verify that the patient was screened against facility charity guidelines.
- Patients with verified household income $\le 250\%$ of the Federal Poverty Level (FPL) are automatically transitioned to `CHARITY_APPROVED` and their balances written off to the facility charity care reserve.

### Rule 4: Work Queue Sorting Order
$$\text{SortOrder} = \text{recovery\_action\_tier ASC (Tier 1 to 5)}, \; \text{patient\_balance\_due DESC}, \; \text{days\_in\_patient\_ar ASC}$$
This prioritizes high-velocity, highly reachable dollars while systematically escalating older accounts.

---

## Permissions & RBAC
- `Patient Financial Counselor`: View queue, send digital nudges, set up structured payment plans, record phone notes, initiate charity screening.
- `RCM Supervisor`: Approve settlement discounts, approve charity care write-offs, authorize third-party collection agency transfers.
- `Finance Director`: View cash recovery velocity, payment plan default rates, bad debt write-off ratios, and charity care allocation.

---

## UI / Workflow Requirements
Maestro Clinical Design System (`#0b1120 !important` canvas, `#0f172a !important` cards, strictly ZERO purple tokens):
1. **Header & Facility Selector:** Phase 96 badge, facility selector, live sync button, CSV export button.
2. **5-Card KPI Ribbon:**
   - Active Patient AR Accounts
   - Total Collectible Self-Pay ($)
   - Active Payment Plans Value ($)
   - Average Days in Patient AR (days)
   - Recovered Cash MTD ($)
3. **4 Primary Workbenches:**
   - **Prioritized Patient AR Queue:** Ranked data grid with Action Tier badges, Patient & MRN, DOS, Insurance Paid, Balance Due, Days in AR, P2P Score, Engagement status, and 1-click actions (`Digital Nudge`, `Offer Plan`, `Counselor Call`, `Charity Screen`).
   - **Scoring & Propensity Inspector:** 4-factor scoring breakdown with colored progress tracks, P2P risk segmentation, and patient financial history.
   - **Structured Payment Plans Manager:** Active payment plans monitor, recurring autopay tracking, next billing date, and default risk alerts.
   - **Charity Care & Bad Debt Guardian:** Audit workbench for accounts $>90$ days, financial hardship evaluation, and supervisor collection authorization.
4. **Interactive Action Modals:**
   - Create Payment Plan Modal (select 3, 6, 12 months; auto-calculates monthly installment and sets autopay).
   - Send Digital Nudge Modal (preview SMS/Email template with secure checkout link).
   - Charity Care Hardship Evaluation Modal (income FPL calculator and supervisor write-off sign-off).

---

## QA / Test Cases
Automated test suite (`tests/patient-ar-recovery.test.js`) verifies:
1. Balance math consistency: `balance_due = original_patient_resp - patient_paid`.
2. Balance score scaling against benchmark ($\$1,000.00$).
3. Aging urgency score scaling based on days in patient AR.
4. Propensity-to-Pay and digital engagement score mapping.
5. 4-factor priority score calculation formula exactness.
6. Recovery action tier classification (`TIER_1_DIGITAL_NUDGE` through `TIER_5_BAD_DEBT_OR_CHARITY`).
7. Payment plan generation (calculates exact monthly installment and enforces 3/6/12/18/24 month terms).
8. Payment plan payment posting and payoff completion transition to `PAID_IN_FULL`.
9. Charity care write-off authorization and balance clearance.
10. Queue sorting invariant: Tier rank ASC, Balance Due DESC, Days in AR ASC.
11. Database migration 073 integrity (tables, columns, indexes, check constraints, views, and 1:1 RLS policies).
12. Maestro Clinical Design System governance (strictly ZERO purple tokens in JSX/CSS).
13. Application wiring and specification completeness.
