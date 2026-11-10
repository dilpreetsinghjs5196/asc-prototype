# 87 PATIENT BALANCES

## Purpose
Production specification for the Ambulatory Surgery Center (ASC) Patient Responsibility, Collections & Aging Engine: end-to-end management of post-adjudication patient liability (deductible, coinsurance, copay, non-covered elective fees, self-pay), multi-bucket aging schedules, structured payment plans, prompt-pay/charity discounts, patient billing statements, and collection lifecycle governance.

## Scope
- Define authoritative data structures and state machines for patient balances (`rcm_patient_balances`) and event audit history (`rcm_patient_balance_events`).
- Standardize patient responsibility classifications according to WEDI/X12 CARC Group PR:
  - `DEDUCTIBLE` (CARC PR-1)
  - `COINSURANCE` (CARC PR-2)
  - `COPAY` (CARC PR-3)
  - `NON_COVERED` (CARC PR-96 / PR-204)
  - `SELF_PAY` (Full elective self-pay encounter)
- Implement deterministic aging bucket schedules:
  - `CURRENT` (0–30 Days)
  - `AGING_31_60` (31–60 Days)
  - `AGING_61_90` (61–90 Days)
  - `AGING_91_120` (91–120 Days)
  - `AGING_120_PLUS` (>120 Days)
- Model structured installment payment plans (`is_payment_plan`, monthly amount, term schedule).
- Support prompt-pay settlement incentives, financial hardship waivers, and bad debt write-offs.
- Enforce facility multi-tenancy, immutable transaction auditing, and strict Maestro Clinical Design System governance (zero purple tokens, `#0b1120` canvas with `#f8fafc` typography).

## Current State
- **Phase 80 (Claims Model & Lifecycle)**: Authored institutional/professional claims and AR balance headers (`054_claims_model.sql`).
- **Phase 82 (EDI 835 Remittance)**: Ingested carrier payments and parsed patient liability amounts (`056_edi_835_remittance.sql`).
- **Phase 83 (Payments & Cash Posting)**: Handled double-entry cash receipts, line allocations, and refund approvals (`057_rcm_payments_adjustments.sql`).
- **Phase 84 (CARC / RARC Model)**: Reason code registries and patient group code PR interpretation (`058_carc_rarc_model.sql`).
- **Phase 86 (Appeals Workflow)**: Dispute tracking and settlement reconciliation (`060_appeals_workflow.sql`).
- **Phase 87 (Patient Balances)**:
  - Currently, post-adjudication patient balances lack dedicated aging views, payment plan schedules, and collection tracking: **MISSING**.

| Component | Classification | Description |
|-----------|----------------|-------------|
| Database Schema (061_patient_balances.sql) | **MISSING** | Patient balances ledger, audit events, analytical aging views, and facility tenancy RLS |
| Down Migration (061_patient_balances_down.sql) | **MISSING** | Reversible migration teardown in reverse dependency order |
| Service Layer (src/lib/patientBalancesService.js) | **MISSING** | Aging math, state transitions, payment plan calculations, and collection metrics |
| Dual Re-export (src/services/patientBalancesService.js) | **MISSING** | Backward-compatible modular service export |
| UI Component (PatientBalancesView.jsx & CSS) | **MISSING** | 4-card executive KPI ribbon, 4 interactive tabs, statement generator, and payment modal |
| App Wiring (src/App.jsx & Sidebar) | **MISSING** | Sidebar menu item under RCM, header title/subtitle, tab render block |
| Test Suite (tests/patient-balances.test.js) | **MISSING** | Automated unit, financial math, aging bucket, and token governance tests |

## Target State
1. **Centralized Patient Balances Ledger (`rcm_patient_balances`)**:
   - Unique identifier and control number (`balance_control_number`, e.g. `PBL-2026-0012`).
   - Foreign key linkages: `facility_id`, `patient_id`, `claim_id`.
   - Core financial columns:
     - `original_balance_amount`: Total patient liability adjudicated.
     - `adjustments_amount`: Prompt-pay discounts, administrative courtesy, charity write-downs.
     - `paid_amount`: Total payments applied to this patient balance.
     - `current_balance_amount`: Generated column (`original_balance_amount - adjustments_amount - paid_amount`).
2. **State Machine Lifecycle**:
   - `PENDING_INSURANCE`: Awaiting carrier adjudication; patient balance not final.
   - `ADJUDICATED_FINAL`: 835 ERA posted; ready for patient statement billing.
   - `STATEMENT_SENT`: Electronic or physical statement issued to guarantor.
   - `PAYMENT_PLAN_ACTIVE`: Recurring installment schedule active and compliant.
   - `PARTIALLY_PAID`: Partial cash received; remaining balance open.
   - `PAID_IN_FULL`: Balance fully settled ($0.00).
   - `DELINQUENT_PRE_COLLECTIONS`: Past due >60 days; final demand notice dispatched.
   - `EXTERNAL_COLLECTIONS`: Transferred to licensed third-party agency.
   - `BAD_DEBT_WRITEOFF`: Deemed uncollectible and written off to bad debt reserve.
   - `CHARITY_CARE_WRITEOFF`: Approved under institutional hardship policy.
3. **Aging Schedule Logic**:
   - Aging days calculated relative to `statement_date` or `date_of_service`.
   - Automatic categorization into 5 standard GAAP aging buckets (0–30, 31–60, 61–90, 91–120, 120+ days).
4. **Payment Plan & Settlement Workflows**:
   - Flexible monthly terms (3 to 12 months) with minimum installment thresholds.
   - Prompt-pay settlement discount calculator (e.g. 10%–20% discount if settled in full within 14 days).
5. **Interactive Executive Workbench**:
   - 4-Card Executive Ribbon: Total Patient AR, Collected Dollars, Active Payment Plans, Bad Debt / Delinquent Risk.
   - 4 Interactive Tabs: Patient Balances Queue, 5-Tier Aging Matrix, Payment Plans Manager, Collections & Write-Off Worklist.

## Data Model / Schema
Required tables in `supabase/migrations/061_patient_balances.sql`:

### 1. `public.rcm_patient_balances`
- `id` (UUID, PRIMARY KEY DEFAULT gen_random_uuid())
- `facility_id` (UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE)
- `patient_id` (BIGINT NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT)
- `claim_id` (UUID NOT NULL REFERENCES public.claims(id) ON DELETE RESTRICT)
- `balance_control_number` (VARCHAR(64) NOT NULL UNIQUE)
- `responsibility_type` (VARCHAR(32) NOT NULL DEFAULT 'DEDUCTIBLE' CHECK (responsibility_type IN (
    'DEDUCTIBLE',
    'COINSURANCE',
    'COPAY',
    'NON_COVERED',
    'SELF_PAY'
  )))
- `status` (VARCHAR(32) NOT NULL DEFAULT 'ADJUDICATED_FINAL' CHECK (status IN (
    'PENDING_INSURANCE',
    'ADJUDICATED_FINAL',
    'STATEMENT_SENT',
    'PAYMENT_PLAN_ACTIVE',
    'PARTIALLY_PAID',
    'PAID_IN_FULL',
    'DELINQUENT_PRE_COLLECTIONS',
    'EXTERNAL_COLLECTIONS',
    'BAD_DEBT_WRITEOFF',
    'CHARITY_CARE_WRITEOFF'
  )))
- `original_balance_amount` (NUMERIC(14,2) NOT NULL CHECK (original_balance_amount >= 0))
- `adjustments_amount` (NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (adjustments_amount >= 0))
- `paid_amount` (NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0))
- `current_balance_amount` (NUMERIC(14,2) GENERATED ALWAYS AS (original_balance_amount - adjustments_amount - paid_amount) STORED)
- `statement_date` (DATE)
- `statement_count` (INT NOT NULL DEFAULT 0 CHECK (statement_count >= 0))
- `last_payment_date` (DATE)
- `is_payment_plan` (BOOLEAN NOT NULL DEFAULT FALSE)
- `payment_plan_monthly_amt` (NUMERIC(10,2) DEFAULT 0.00)
- `payment_plan_terms_months` (INT DEFAULT 0)
- `notes` (TEXT)
- `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
- `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())

### 2. `public.rcm_patient_balance_events`
- `id` (UUID, PRIMARY KEY DEFAULT gen_random_uuid())
- `facility_id` (UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE)
- `balance_id` (UUID NOT NULL REFERENCES public.rcm_patient_balances(id) ON DELETE CASCADE)
- `event_type` (VARCHAR(40) NOT NULL CHECK (event_type IN (
    'INITIAL_BALANCE_POSTED',
    'STATEMENT_GENERATED',
    'PAYMENT_APPLIED',
    'DISCOUNT_APPLIED',
    'PAYMENT_PLAN_INITIATED',
    'PAYMENT_PLAN_DEFAULTED',
    'COLLECTION_DEMAND_SERVED',
    'TRANSFERRED_TO_COLLECTIONS',
    'BAD_DEBT_WRITEOFF',
    'CHARITY_CARE_APPLIED'
  )))
- `amount` (NUMERIC(14,2) DEFAULT 0.00)
- `previous_status` (VARCHAR(32))
- `new_status` (VARCHAR(32))
- `action_by` (UUID REFERENCES auth.users(id))
- `notes` (TEXT)
- `metadata` (JSONB DEFAULT '{}'::jsonb)
- `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())

### 3. Analytical Views
- `public.vw_rcm_patient_balances_aging`: Real-time aging bucket breakdown across facilities.
- `public.vw_rcm_patient_collections_worklist`: Priority worklist of delinquent and high-balance patient encounters.

## Business Rules
1. **Mathematical Invariant**:
   $$\text{Current Balance} = \text{Original Balance} - \text{Adjustments} - \text{Paid Amount}$$
   `Current Balance` cannot be negative; any excess payment triggers an overpayment credit flag.
2. **Transition Rules**:
   - Marking a balance `PAID_IN_FULL` requires `current_balance_amount == 0.00`.
   - Transfer to `EXTERNAL_COLLECTIONS` requires at least 2 billing statements and a minimum aging of 60 days.
   - `BAD_DEBT_WRITEOFF` and `CHARITY_CARE_WRITEOFF` require supervisory or CFO authorization.
3. **Tenancy**:
   - Every read and write query must filter by `facility_id IN (SELECT public.get_auth_user_facilities())`.

## Permissions / Security
| Action | Permitted Roles | Permission Key |
|--------|-----------------|----------------|
| View Patient Balances & Aging | Super Admin, Org Admin, Facility Admin, CFO, Biller, Collector, Viewer | `rcm.view_patient_balances` |
| Issue Patient Statements | Super Admin, Org Admin, Facility Admin, Biller, Collector | `rcm.issue_statements` |
| Record Patient Payment / Plan | Super Admin, Org Admin, Facility Admin, Biller, Cashier | `rcm.collect_patient_payment` |
| Authorize Hardship / Write-Off | Super Admin, Org Admin, Facility Admin, CFO | `rcm.authorize_writeoffs` |
| Export Collections Reports | Super Admin, Org Admin, Facility Admin, CFO, Collector | `rcm.export_reports` |

## API / Service Requirements
- `calculateAgingBucket(statementDate, currentDate)`: Categorizes aging into 0–30, 31–60, 61–90, 91–120, 120+ days.
- `calculatePromptPayDiscount(balance, discountPct)`: Computes settlement incentive.
- `calculatePatientBalanceKpis(balances)`: Aggregates total patient AR, collected amount, payment plan counts, and delinquent exposure.
- `getBaselinePatientBalances()`: Returns representative baseline patient balance roster.

## UI / Workflow Requirements
- **Executive Container**: Maestro Clinical `#0b1120` canvas with `#ffffff` heading in `#0f172a` topbar card.
- **4-KPI Executive Ribbon**:
  - Total Patient AR Balance ($)
  - Total Patient Cash Collected ($)
  - Active Payment Plans Count
  - Delinquent / Bad Debt Exposure ($)
- **4 Operational Tabs**:
  1. *Patient Balances Queue*: Filterable roster by status and responsibility type.
  2. *5-Tier Aging Matrix*: Interactive GAAP buckets with drill-downs.
  3. *Payment Plans Manager*: Structured installment terms and compliance tracking.
  4. *Collections & Write-Off Worklist*: Delinquent accounts with demand notices and write-off action modals.

## Audit / Provenance
- Every status change, payment application, and adjustment creates an immutable record in `rcm_patient_balance_events`.

## QA / Test Cases
- Test 1: Responsibility types and canonical CARC Group PR alignment.
- Test 2: State machine transitions and status validation.
- Test 3: Deterministic aging calculation across calendar date boundaries.
- Test 4: Financial balance arithmetic: current balance = original - adjustments - paid.
- Test 5: Executive KPI aggregation correctness.
- Test 6: Database migration idempotency (1:1 policy drop/create parity and RLS).
- Test 7: Maestro Clinical Design System token compliance (zero purple tokens).
- Test 8: Application wiring in `src/App.jsx`.

## Acceptance Criteria
- [x] Specification fully documented with ASC production standards.
- [x] Migration scripts `061_patient_balances.sql` and `061_patient_balances_down.sql` created.
- [x] Service engine `src/lib/patientBalancesService.js` and dual re-export created.
- [x] UI component `PatientBalancesView.jsx` and `PatientBalancesView.css` implemented.
- [x] Application wired into `src/App.jsx` under `REVENUE CYCLE (RCM)`.
- [x] Test suite `tests/patient-balances.test.js` passes 100%.
- [x] Production build `npm run build` succeeds with zero errors.

## Dependencies
- Phase 80: `claims`, `claim_lines`
- Phase 82: `edi_835_claim_payments`
- Phase 84: `rcm_carc_master` (PR group codes)
- Phase 85: `rcm_denials`

## Definition of Done
Complete production delivery including schema migration, rollback script, deterministic business logic, UI workbench, test suite, and clean production build.

## Implementation Notes
- Migration: `supabase/migrations/061_patient_balances.sql`
- Rollback: `supabase/migrations/061_patient_balances_down.sql`
- Service: `src/lib/patientBalancesService.js` & `src/services/patientBalancesService.js`
- UI: `src/components/PatientBalancesView.jsx` & `src/components/PatientBalancesView.css`
- App: Registered tab `patient_balances` in `src/App.jsx`
- Tests: `tests/patient-balances.test.js`
