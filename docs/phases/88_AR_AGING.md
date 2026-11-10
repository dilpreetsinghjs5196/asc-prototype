# 88 AR AGING

## Purpose
Authoritative production specification for Ambulatory Surgery Center (ASC) Accounts Receivable (AR) Aging, Financial Class Stratification, and Collector Work Queue Orchestration. This engine delivers deterministic GAAP aging schedules across Date of Service (DOS) and Claim Bill Date, payer-specific aging velocity tracking, Days Sales Outstanding (DSO) calculation, >90-day aging risk exposure containment, and algorithmic collector queue prioritization.

## Scope
- Define authoritative aging schedules across standard ASC/Healthcare GAAP intervals:
  - `0–30 Days`: Current AR / Normal Payer Turnaround
  - `31–60 Days`: Follow-up Window / First Reminder
  - `61–90 Days`: Payer Escalation / Denial Interception
  - `91–120 Days`: High-Risk Pre-Appeal / Timely Filing Threat
  - `121–150 Days`: Severe Aging / Management Escalation
  - `150+ Days`: Critical Default / Bad Debt / Uncollectable Reserve
- Support dual aging computation baselines:
  - **Date of Service (DOS) Aging**: Measures clinical AR latency from surgical encounter date (`CURRENT_DATE - surgery_date`).
  - **Bill / Submission Date Aging**: Measures technical billing and payer adjudication performance from initial clearinghouse submission (`CURRENT_DATE - initial_submitted_at::DATE`).
  - **Adjudication Aging**: Measures secondary payer and patient liability post-835 remittance posting (`CURRENT_DATE - adjudicated_at::DATE`).
- Categorize AR portfolio across standard healthcare Financial Classes:
  - Commercial / Managed Care (BCBS, Aetna, Cigna, UHC, Humana)
  - Medicare / Medicare Advantage Part C
  - Medicaid / Managed Medicaid
  - Workers' Compensation & Personal Injury / MVA
  - Patient AR / Self-Pay Liability
- Establish intelligent Collector Work Queues (`rcm_ar_work_queues`, `rcm_ar_work_items`):
  - Algorithmic work priority scoring based on aging bucket, balance magnitude, timely filing deadline proximity, and days untouched.
  - Collector touch history (`rcm_ar_touches`): Structured logging of payer calls, portal queries, re-billing submissions, promise-to-pay commitments, and manager escalations.
- Enforce organization/facility tenancy, audit trails, and strict Maestro Clinical Design System governance (zero purple/violet/indigo/magenta/fuchsia tokens).

## Current State
- **Phase 80 (Claims Model & Lifecycle)**: Extended `public.claims` with `outstanding_ar_balance`, `total_patient_balance`, `total_paid_amount`, and `rcm_status` (`054_claims_model.sql`): **KEEP**.
- **Phase 82 (835 Remittance)**: Captures CLP adjudication and payment remittance posting: **KEEP**.
- **Phase 83 (Payments & Adjustments)**: Provides double-entry cash ledger and deposit aging: **KEEP**.
- **Phase 85 (Denials Model)**: Tracks denial recovery scoring and filing deadlines: **KEEP**.
- **Phase 87 (Patient Balances)**: Implemented 5-tier GAAP patient responsibility aging (`061_patient_balances.sql`): **KEEP**.
- **Phase 88 (AR Aging & Work Queues)**:
  - Unified multi-payer AR aging summary view across DOS and Bill Date: **MISSING**.
  - Collector work queue tables (`rcm_ar_work_queues`, `rcm_ar_work_items`, `rcm_ar_touches`): **MISSING**.
  - Dynamic Days Sales Outstanding (DSO) calculation and >90-day aging containment metrics: **MISSING**.
  - Interactive AR aging drill-down UI and collector workbench: **MISSING**.

## Target State
1. **Authoritative Aging Model**:
   - Real-time SQL view `vw_rcm_ar_aging_summary` calculating both DOS aging days and Bill Date aging days for every active open claim (`outstanding_ar_balance > 0`).
   - Grouping and aggregation across 6 standard GAAP buckets (`0_30`, `31_60`, `61_90`, `91_120`, `121_150`, `150_PLUS`).
2. **Collector Work Queue Engine**:
   - Automated queue segmentation:
     - `QUEUE_HIGH_DOLLAR`: Claims with balance >= $5,000.00.
     - `QUEUE_AGING_90_PLUS`: Claims aged >= 91 days past DOS or Bill Date.
     - `QUEUE_COMMERCIAL_ESCALATION`: Stalled commercial claims with no status change in >= 30 days.
     - `QUEUE_DENIED_UNRESOLVED`: Claims with denial balance not yet appealed or adjusted.
     - `QUEUE_UNTOUCHED_14D`: Claims without collector activity for > 14 days.
   - Deterministic composite priority score (0–100 scale) for automated queue sorting.
3. **Collector Action Logging (Touches)**:
   - Structured tracking of telephone calls, clearinghouse portal inquiries, corrected claim resubmissions, formal appeals, promise-to-pay pledges, and supervisory review requests.
4. **Executive Financial Intelligence**:
   - Real-time calculation of Days Sales Outstanding (DSO):
     $$\text{DSO} = \frac{\text{Total Open AR Balance}}{\text{Average Daily Gross Charges (last 90 days)}}$$
   - Percentage of AR > 90 Days monitoring (ASC Industry Benchmark: < 15.0%).

## Data Model / Schema

### 1. `rcm_ar_work_queues` (Work Queue Master Configuration)
- `id` (UUID PRIMARY KEY DEFAULT gen_random_uuid())
- `facility_id` (UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE)
- `queue_code` (VARCHAR(32) NOT NULL)
- `queue_name` (VARCHAR(128) NOT NULL)
- `description` (TEXT)
- `min_balance_threshold` (NUMERIC(14,2) NOT NULL DEFAULT 0.00)
- `min_aging_days` (INT NOT NULL DEFAULT 0)
- `max_aging_days` (INT)
- `target_financial_class` (VARCHAR(32)) -- 'ALL', 'COMMERCIAL', 'MEDICARE', 'MEDICAID', 'WORKERS_COMP', 'SELF_PAY'
- `is_active` (BOOLEAN NOT NULL DEFAULT TRUE)
- `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())

### 2. `rcm_ar_work_items` (Actionable Queue Claims)
- `id` (UUID PRIMARY KEY DEFAULT gen_random_uuid())
- `facility_id` (UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE)
- `queue_id` (UUID NOT NULL REFERENCES public.rcm_ar_work_queues(id) ON DELETE CASCADE)
- `claim_id` (UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE)
- `priority_score` (NUMERIC(5,2) NOT NULL DEFAULT 50.00)
- `assigned_to` (UUID REFERENCES auth.users(id))
- `status` (VARCHAR(32) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'PENDING_PAYER', 'RESOLVED', 'ESCALATED', 'CLOSED')))
- `last_touched_at` (TIMESTAMPTZ)
- `last_touched_by` (UUID REFERENCES auth.users(id))
- `next_follow_up_date` (DATE)
- `touch_count` (INT NOT NULL DEFAULT 0)
- `notes` (TEXT)
- `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
- `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())

### 3. `rcm_ar_touches` (Immutable Collector Activity Ledger)
- `id` (UUID PRIMARY KEY DEFAULT gen_random_uuid())
- `facility_id` (UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE)
- `work_item_id` (UUID NOT NULL REFERENCES public.rcm_ar_work_items(id) ON DELETE CASCADE)
- `claim_id` (UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE)
- `action_type` (VARCHAR(40) NOT NULL CHECK (action_type IN (
    'PAYER_CALL',
    'PORTAL_STATUS_CHECK',
    'CORRECTED_CLAIM_SUBMITTED',
    'APPEAL_PACKET_SENT',
    'MEDICAL_RECORDS_FAXED',
    'PROMISE_TO_PAY_LOGGED',
    'SUPERVISOR_ESCALATION',
    'PATIENT_OUTREACH',
    'WRITEOFF_RECOMMENDED'
  )))
- `action_by` (UUID NOT NULL REFERENCES auth.users(id))
- `contact_person` (VARCHAR(128)) -- e.g. Payer Rep name, Reference ID
- `reference_number` (VARCHAR(64)) -- Call ref ID, confirmation code
- `promised_amount` (NUMERIC(14,2) DEFAULT 0.00)
- `promised_payment_date` (DATE)
- `next_follow_up_date` (DATE)
- `outcome_notes` (TEXT NOT NULL)
- `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())

### 4. Database Views
- `vw_rcm_ar_aging_summary`: Full claim-level aging matrix with DOS days, Bill days, bucket assignments, payer class, and surgical specialty.
- `vw_rcm_ar_payer_class_summary`: Rollup summary of AR dollars and account volume grouped by financial class and aging buckets.

## Business Rules

### 1. Aging Buckets Definition
Standard ASC GAAP aging tiers:
| Bucket ID | Label | Min Days | Max Days | Operational Action |
| :--- | :--- | :--- | :--- | :--- |
| `0_30` | Current (0–30 Days) | 0 | 30 | Standard electronic billing window. No action needed unless initial 277CA rejected. |
| `31_60` | 31–60 Days | 31 | 60 | First electronic status check (276/277). Confirm receipt with commercial payers. |
| `61_90` | 61–90 Days | 61 | 90 | Phone outreach to claims department. Identify missing records, medical necessity, or coordination of benefits. |
| `91_120` | 91–120 Days | 91 | 120 | Pre-appeal escalation. Verify timely filing limits (often 90–180 days for commercial plans). |
| `121_150` | 121–150 Days | 121 | 150 | Severe aging warning. Formal supervisor review, state insurance commissioner dispute notice. |
| `150_PLUS` | 150+ Days (Critical) | 151 | $\infty$ | Bad debt reserve evaluation or administrative settlement write-off. |

### 2. Dual Aging Computation Rule
- **DOS Aging Days**: `GREATEST(0, CURRENT_DATE - s.date::DATE)`
- **Bill Date Aging Days**: `GREATEST(0, CURRENT_DATE - COALESCE(c.initial_submitted_at::DATE, s.date::DATE))`
- If a claim has not yet been submitted (`initial_submitted_at IS NULL`), Bill Date aging falls back to Date of Service.

### 3. Work Item Priority Scoring Formula
Every actionable open claim receives a deterministic priority score $P \in [0, 100]$:
$$P = \min\left(100, (D_{\text{aging}} \times 0.3) + \left(\frac{\min(B, 10000)}{100} \times 0.4\right) + (D_{\text{untouched}} \times 0.3)\right)$$
Where:
- $D_{\text{aging}}$ = Aging days (capped at 120)
- $B$ = Outstanding AR balance in dollars
- $D_{\text{untouched}}$ = Days since last collector touch (`CURRENT_DATE - last_touched_at::DATE`)

### 4. Days Sales Outstanding (DSO) Calculation
$$\text{Average Daily Gross Charge} = \frac{\sum_{t=-90}^{0} \text{Gross Charges}}{90}$$
$$\text{DSO} = \frac{\text{Total Outstanding AR Balance}}{\text{Average Daily Gross Charge}}$$

### 5. ASC Benchmark Governance
- **AR > 90 Days Benchmark**: Must remain under **15.0%** of total AR portfolio. If $> 15.0\%$, the UI triggers an amber/rose warning ribbon.
- **Target DSO**: ASC target is **30 to 42 days**. Over 45 days triggers an efficiency review alert.

## Permissions / Security
- `rcm.view_ar_aging`: View-only access to AR aging matrices, summaries, and dashboards (`biller`, `billing_rcm`, `facility_admin`, `cfo_analyst`, `super_admin`).
- `rcm.work_ar_queue`: Assign claims, record phone calls/touches, set follow-up dates, update work item status (`biller`, `billing_rcm`, `facility_admin`, `super_admin`).
- `rcm.manage_ar_queues`: Create, edit, and archive work queue rules and balance thresholds (`facility_admin`, `super_admin`).
- Tenancy isolation enforced at database level via `facility_id IN (SELECT public.get_auth_user_facilities())`.

## API / Service Requirements
- `arAgingService.getAgingSummary(facilityId, agingBasis)`: Fetches full claims aging ledger.
- `arAgingService.getPayerClassRollup(facilityId)`: Computes financial class distribution.
- `arAgingService.getWorkQueueItems(facilityId, queueId, status)`: Fetches actionable queue claims ordered by priority score.
- `arAgingService.logCollectorTouch(touchData)`: Inserts audit touch record, increments touch count, updates `last_touched_at` and `next_follow_up_date`.
- `arAgingService.calculateArKpis(claimsList)`: Computes Total AR, DSO, % AR > 90d, and Payer/Patient ratio.

## UI / Workflow Requirements
- **Executive Toolbar**: Solid dark card container `#0f172a`, pure white `#ffffff` title, subtitle, and aging basis toggle (Date of Service vs Bill Date).
- **Executive KPI Ribbon**: 4 metric cards:
  1. `Total Outstanding AR` (Currency)
  2. `% AR > 90 Days` (Percentage with ASC < 15% benchmark badge)
  3. `Days Sales Outstanding (DSO)` (Days with 35-day target badge)
  4. `Actionable Work Items` (Open queue count)
- **4 Interactive Workbenches**:
  1. **AR Aging Matrix**: Grid breakdown of all 6 aging buckets with total dollars, claim counts, and percentage share.
  2. **Collector Work Queue**: Filterable claims list sorted by priority score, with inline action triggers.
  3. **Payer Financial Class Rollup**: AR breakdown by Commercial, Medicare, Medicaid, Workers Comp, and Patient AR.
  4. **Activity & Touch Audit Log**: Complete history of payer interactions, call reference numbers, and promised payments.
- **Modals**:
  - `Log Collector Touch Modal`: Action type, payer representative name, reference call number, promise to pay amount/date, and next follow-up date.

## Audit / Provenance
- All collector interactions are recorded immutably in `rcm_ar_touches` with timestamp, user ID, contact person, reference number, and resolution notes.
- Status changes in `rcm_ar_work_items` update `updated_at` and `last_touched_by`.

## QA / Test Cases
1. Standard 6 GAAP aging buckets validation (`0_30`, `31_60`, `61_90`, `91_120`, `121_150`, `150_PLUS`).
2. Dual aging calculation: DOS vs Bill Date boundary tests.
3. Work queue priority scoring formula verification.
4. Days Sales Outstanding (DSO) calculation accuracy.
5. Benchmark threshold alerts (% AR > 90 Days).
6. Database migration integrity (tables, views, generated columns, 1:1 policy drops/creates, facility RLS).
7. Maestro Clinical Design System governance (zero purple/violet/indigo/magenta/fuchsia tokens).
8. `src/App.jsx` integration verification.

## Acceptance Criteria
- [x] Master specification fully documented with ASC production standards.
- [x] Migrations `062_ar_aging.sql` and `062_ar_aging_down.sql` created.
- [x] Service engine `src/lib/arAgingService.js` and dual re-export created.
- [x] UI component `ArAgingView.jsx` and `ArAgingView.css` implemented.
- [x] Application wired into `src/App.jsx` under `REVENUE CYCLE (RCM)`.
- [x] Test suite `tests/ar-aging.test.js` passes 100%.
- [x] Production build `npm run build` succeeds with zero errors.

## Dependencies
- Phase 80: `claims`, `claim_lines`
- Phase 82: `edi_835_claim_payments`
- Phase 83: `rcm_cash_ledger_entries`
- Phase 85: `rcm_denials`
- Phase 87: `rcm_patient_balances`

## Definition of Done
Complete production delivery including schema migration, rollback script, deterministic business logic, UI workbench, test suite, and clean production build.

## Implementation Notes
- Migration: `supabase/migrations/062_ar_aging.sql`
- Rollback: `supabase/migrations/062_ar_aging_down.sql`
- Service: `src/lib/arAgingService.js` & `src/services/arAgingService.js`
- UI: `src/components/ArAgingView.jsx` & `src/components/ArAgingView.css`
- App: Registered tab `ar_aging` in `src/App.jsx`
- Tests: `tests/ar-aging.test.js`
