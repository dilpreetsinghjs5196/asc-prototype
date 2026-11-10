# 89 RECONCILIATION ENGINE

## Purpose
Production specification for the Ambulatory Surgery Center (ASC) Revenue Cycle Reconciliation Engine: authoritative four-way matching and discrepancy resolution across Billed Claims (837/Billing Ledger), Payer Remittance Advice (835 ERA/EOB), Bank Cash Deposits (EFT/Lockbox), and Patient Liability Settlements. This subsystem establishes deterministic financial balancing invariants, flags contractual underpayments, prevents unapplied cash suspense drift, and orchestrates auditable exception resolution workflows.

## Scope
- Define authoritative four-way financial matching models:
  1. **Billed Claims (837)**: Total gross charges, line items, and expected contractual reimbursement.
  2. **Remittance Advice (835 ERA)**: Claim-level and service-line CLP adjudication (Paid, Contractual Obligation CO, Patient Responsibility PR, Denial/Other Adjustments OA/PI).
  3. **Bank Cash Deposits**: Actual cash settlement (EFT BPR trace number, lockbox deposit slip, merchant merchant card settlement).
  4. **Patient Liability Ledger**: Deductible, copayment, coinsurance, and self-pay settlements.
- Support comprehensive reconciliation classification:
  - `FULLY_RECONCILED`: 100% matched across billed, remitted, and deposited cash with zero financial variance ($\Delta = \$0.00$).
  - `PARTIALLY_RECONCILED`: Adjudicated payment posted, but outstanding balance or adjustment unresolved.
  - `UNDERPAYMENT_DISCREPANCY`: Payer reimbursed less than contracted fee schedule allowance without valid CARC justification.
  - `OVERPAYMENT_DISCREPANCY`: Payer overpaid contracted allowable or remitted duplicate payment (requires refund escrow).
  - `UNMATCHED_REMITTANCE`: 835 ERA processed without corresponding bank deposit confirmation.
  - `SUSPENSE_UNIDENTIFIED_CASH`: Bank deposit received without matching 835 remittance or patient EOB (Suspense holding).
  - `CLOSED_BALANCED`: Account brought to zero balance through validated adjustment, appeal settlement, or authorized write-off.
- Establish structured Discrepancy Resolution Workflows:
  - `GENERATE_UNDERPAYMENT_APPEAL`: Routes underpaid case to Phase 86 Appeals Workflow.
  - `POST_CONTRACTUAL_CORRECTION`: Adjusts CO-45 contractual allowance ledger.
  - `INITIATE_REFUND_ESCALATION`: Triggers Phase 83 dual-authorization refund protocol.
  - `MATCH_SUSPENSE_DEPOSIT`: Links unmatched bank deposit to late-arriving 835 ERA.
- Enforce organization/facility tenancy, audit trails, and strict Maestro Clinical Design System governance (zero purple/violet/indigo/magenta/fuchsia tokens).

## Current State
- **Phase 80 (Claims Model)**: Billed claims headers, line charges, and initial AR ledger (`054_claims_model.sql`): **KEEP**.
- **Phase 82 (835 Remittance)**: CLP claim payments, CAS adjustment groups, and CARC codes (`056_edi_835_remittance.sql`): **KEEP**.
- **Phase 83 (Payments & Cash Posting)**: Deposit batches, cash transactions, and refund approval thresholds (`057_rcm_payments_adjustments.sql`): **KEEP**.
- **Phase 84 (CARC/RARC Intelligence)**: Standardized reason code interpretation (`058_carc_rarc_model.sql`): **KEEP**.
- **Phase 85 (Denials Model)**: Denial classification and filing deadlines (`059_denials_model.sql`): **KEEP**.
- **Phase 86 (Appeals Workflow)**: Dispute escalation and settlement reconciliation (`060_appeals_workflow.sql`): **KEEP**.
- **Phase 87 (Patient Balances)**: Patient responsibility and 5-tier GAAP aging (`061_patient_balances.sql`): **KEEP**.
- **Phase 88 (AR Aging)**: Dual aging schedules and collector work queues (`062_ar_aging.sql`): **KEEP**.
- **Phase 89 (Reconciliation Engine)**:
  - Unified four-way reconciliation ledger table (`rcm_reconciliation_records`): **IMPLEMENTED** (`063_reconciliation_engine.sql`).
  - Discrepancy case tracking and disposition table (`rcm_reconciliation_discrepancies`): **IMPLEMENTED** (`063_reconciliation_engine.sql`).
  - Real-time clean match rate calculation and bank deposit balancing views: **IMPLEMENTED** (`vw_rcm_reconciliation_summary`, `vw_rcm_discrepancy_worklist`).
  - Interactive reconciliation workbench and exception resolution UI: **IMPLEMENTED** (`ReconciliationEngineView.jsx`, `ReconciliationEngineView.css`).

## Target State
1. **Four-Way Matching Data Model**:
   - Central table `rcm_reconciliation_records` linking `claim_id`, `remittance_id`, and `payment_batch_id`.
   - Stored generated variance column enforcing:
     $$\text{variance\_amount} = \text{billed\_amount} - \text{remittance\_paid\_amount} - \text{contractual\_adjustment\_amount} - \text{patient\_responsibility\_amount}$$
2. **Discrepancy Exception Management**:
   - Table `rcm_reconciliation_discrepancies` categorizing exceptions by type, dollar variance, and assigned investigator.
   - Status transitions from `OPEN_INVESTIGATION` to `RESOLVED_ADJUSTED`, `APPEALED_UNDERPAYMENT`, `REFUNDED_OVERPAYMENT`, or `WRITTEN_OFF`.
3. **Executive Reconciliation Intelligence**:
   - Clean Match Rate Percentage: Target $\ge 98.0\%$ across all processed transactions.
   - Underpayment Discrepancy Exposure: Total recoverable underpayment dollars.
   - Unapplied / Suspense Cash Exposure: Deposits older than 14 days without claim linking.
4. **Interactive Reconciliation Workbench**:
   - High-contrast clinical UI enabling search, filter by match status, deposit batch drill-down, and one-click discrepancy resolution.

## Data Model / Schema

### 1. `rcm_reconciliation_records` (Reconciliation Header Ledger)
- `id` (UUID PRIMARY KEY DEFAULT gen_random_uuid())
- `facility_id` (UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE)
- `claim_id` (UUID NOT NULL REFERENCES public.claims(id) ON DELETE RESTRICT)
- `remittance_id` (UUID REFERENCES public.edi_835_claim_payments(id) ON DELETE SET NULL)
- `payment_batch_id` (UUID REFERENCES public.rcm_payment_batches(id) ON DELETE SET NULL)
- `reconciliation_control_number` (VARCHAR(64) NOT NULL UNIQUE)
- `status` (VARCHAR(32) NOT NULL DEFAULT 'PARTIALLY_RECONCILED' CHECK (status IN (
    'FULLY_RECONCILED',
    'PARTIALLY_RECONCILED',
    'UNDERPAYMENT_DISCREPANCY',
    'OVERPAYMENT_DISCREPANCY',
    'UNMATCHED_REMITTANCE',
    'SUSPENSE_UNIDENTIFIED_CASH',
    'CLOSED_BALANCED'
  )))
- `billed_amount` (NUMERIC(14,2) NOT NULL CHECK (billed_amount >= 0))
- `expected_reimbursement` (NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (expected_reimbursement >= 0))
- `remittance_paid_amount` (NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (remittance_paid_amount >= 0))
- `bank_deposit_amount` (NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (bank_deposit_amount >= 0))
- `contractual_adjustment_amount` (NUMERIC(14,2) NOT NULL DEFAULT 0.00)
- `patient_responsibility_amount` (NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (patient_responsibility_amount >= 0))
- `variance_amount` (NUMERIC(14,2) GENERATED ALWAYS AS (
    billed_amount - remittance_paid_amount - contractual_adjustment_amount - patient_responsibility_amount
  ) STORED)
- `bank_deposit_variance` (NUMERIC(14,2) DEFAULT 0.00)
- `reconciled_at` (TIMESTAMPTZ)
- `reconciled_by` (UUID REFERENCES auth.users(id))
- `notes` (TEXT)
- `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
- `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())

### 2. `rcm_reconciliation_discrepancies` (Exception Case Ledger)
- `id` (UUID PRIMARY KEY DEFAULT gen_random_uuid())
- `facility_id` (UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE)
- `reconciliation_id` (UUID NOT NULL REFERENCES public.rcm_reconciliation_records(id) ON DELETE CASCADE)
- `claim_id` (UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE)
- `discrepancy_type` (VARCHAR(40) NOT NULL CHECK (discrepancy_type IN (
    'UNDERPAYMENT_CONTRACT_RATE',
    'OVERPAYMENT_DUPLICATE',
    'UNMATCHED_EFT_DEPOSIT',
    'MISSING_ERA_REMITTANCE',
    'UNBALANCED_CAS_SPLIT',
    'UNAUTHORIZED_FEE_DISALLOWANCE'
  )))
- `variance_amount` (NUMERIC(14,2) NOT NULL)
- `disposition_status` (VARCHAR(32) NOT NULL DEFAULT 'OPEN_INVESTIGATION' CHECK (disposition_status IN (
    'OPEN_INVESTIGATION',
    'RESOLVED_ADJUSTED',
    'APPEALED_UNDERPAYMENT',
    'REFUNDED_OVERPAYMENT',
    'WRITTEN_OFF'
  )))
- `assigned_to` (UUID REFERENCES auth.users(id))
- `resolution_action` (VARCHAR(40))
- `resolution_notes` (TEXT)
- `resolved_at` (TIMESTAMPTZ)
- `resolved_by` (UUID REFERENCES auth.users(id))
- `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())

### 3. Database Views
- `vw_rcm_reconciliation_summary`: Claim-level matching status, variances, and deposit trace details.
- `vw_rcm_discrepancy_worklist`: Open investigation discrepancies sorted by variance magnitude.

## Business Rules

### 1. Remittance Balancing Invariant
For any fully adjudicated claim:
$$\text{Billed Amount} = \text{Remittance Paid} + \text{Contractual Adjustment (CO)} + \text{Patient Responsibility (PR)} + \text{Disallowed (OA/PI)}$$
If $\text{Variance} = \$0.00$ and Bank Deposit = Remittance Paid, status transition to `FULLY_RECONCILED`.

### 2. Bank Deposit Reconciliation Invariant
$$\text{Bank Deposit Variance} = \text{Bank Deposit Amount} - \text{Remittance Paid Amount}$$
- If $\text{Bank Deposit Variance} = \$0.00$: EFT/Check matches 835 remittance dollar-for-dollar.
- If $\text{Bank Deposit Variance} > \$0.00$: Bank deposit received without matching remittance (Unidentified Cash / Suspense).
- If $\text{Bank Deposit Variance} < \$0.00$: Remittance claimed payment, but bank funds not received.

### 3. Contractual Underpayment Detection
$$\text{Expected Allowance Variance} = \text{Expected Contract Reimbursement} - \text{Remittance Paid Amount} - \text{Patient Responsibility}$$
- If expected variance $> \$25.00$ without valid contractual justification (e.g. valid multiple procedure discount), automatically flag as `UNDERPAYMENT_DISCREPANCY` and queue for Underpayment Appeal.

### 4. Overpayment Protocol
- Any negative balance ($\text{Paid} > \text{Expected Allowance}$) must be held in escrow; automatic refund requires supervisory approval under Phase 83 rules.

### 5. ASC Clean Match Rate Benchmark
$$\text{Clean Match Rate} = \left(\frac{\text{Fully Reconciled Dollars}}{\text{Total Processed Remittance Dollars}}\right) \times 100$$
- Target: **$\ge 98.0\%$**. If $< 98.0\%$, triggers an audit review ribbon.

## Permissions / Security
- `rcm.view_reconciliation`: View reconciliation matrices, summaries, and audit feeds (`biller`, `billing_rcm`, `facility_admin`, `cfo_analyst`, `super_admin`).
- `rcm.resolve_discrepancy`: Assign cases, update disposition status, post corrections, log appeal transfers (`biller`, `billing_rcm`, `facility_admin`, `super_admin`).
- `rcm.approve_writeoff`: Authorize administrative write-off of reconciliation variances $\ge \$250.00$ (`facility_admin`, `cfo_analyst`, `super_admin`).
- Row Level Security (RLS) enforces strict facility tenancy via `facility_id IN (SELECT public.get_auth_user_facilities())`.

## API / Service Requirements
- `reconciliationService.getReconciliationSummary(facilityId)`: Retrieves real-time reconciliation records and metrics.
- `reconciliationService.getDiscrepancies(facilityId, status)`: Retrieves exception work items.
- `reconciliationService.resolveDiscrepancy(discrepancyId, resolutionData)`: Applies disposition, records user/timestamp, updates parent reconciliation record.
- `reconciliationService.calculateReconciliationKpis(recordsList)`: Computes Total Reconciled, Clean Match Rate %, Underpayment Exposure, and Suspense Holdings.

## UI / Workflow Requirements
- **Executive Toolbar**: Solid dark card `#0f172a`, pure white `#ffffff` title, subtitle, and CSV export action.
- **Executive KPI Ribbon**: 4 metric cards:
  1. `Total Cash Reconciled` (Currency)
  2. `Clean Match Rate` (Percentage with $\ge 98\%$ target badge)
  3. `Underpayment Discrepancy Exposure` (Currency)
  4. `Unmatched / Suspense Holdings` (Currency)
- **4 Interactive Workbenches**:
  1. **3-Way Reconciliation Ledger**: Full match comparison across Claim, 835 Remittance, and Bank Deposit.
  2. **Discrepancy Exception Queue**: Filterable exception cases with discrepancy type badges, dollar variances, and resolution triggers.
  3. **Bank Deposit vs Remittance Balancing**: Batch-level deposit slip vs ERA BPR electronic transfer balancing.
  4. **Audit Trail & Discrepancy Dispositions**: History of resolution dispositions, underpayment appeal transfers, and write-offs.
- **Action Modals**:
  - `Resolve Discrepancy Modal`: Select disposition action, enter resolution notes and adjustment amounts.

## Audit / Provenance
- All discrepancy resolutions, manual adjustments, and appeal transfers are immutably timestamped with user ID, before/after amounts, and rationale notes.

## QA / Test Cases
1. Remittance balancing invariant arithmetic ($\Delta = \$0.00$).
2. Bank deposit vs remittance matching variance computation.
3. Contractual underpayment detection algorithm.
4. Clean Match Rate KPI calculation across sample dataset.
5. Database migration integrity (tables, views, generated columns, 1:1 policy drops/creates, facility RLS).
6. Maestro Clinical Design System governance (strict Purple Ban).
7. `src/App.jsx` integration verification.

## Acceptance Criteria
- [x] Master specification fully documented with ASC production standards.
- [x] Migrations `063_reconciliation_engine.sql` and `063_reconciliation_engine_down.sql` created.
- [x] Service engine `src/lib/reconciliationService.js` and dual re-export created.
- [x] UI component `ReconciliationEngineView.jsx` and `ReconciliationEngineView.css` implemented.
- [x] Application wired into `src/App.jsx` under `REVENUE CYCLE (RCM)`.
- [x] Test suite `tests/reconciliation-engine.test.js` passes 100%.
- [x] Production build `npm run build` succeeds with zero errors.

## Dependencies
- Phase 80: `claims`, `claim_lines`
- Phase 82: `edi_835_claim_payments`
- Phase 83: `rcm_payment_batches`, `rcm_payment_transactions`
- Phase 85: `rcm_denials`
- Phase 86: `rcm_appeals`
- Phase 87: `rcm_patient_balances`

## Definition of Done
Complete production delivery including schema migration, rollback script, deterministic business logic, UI workbench, test suite, and clean production build.

## Implementation Notes
- Migration: `supabase/migrations/063_reconciliation_engine.sql`
- Rollback: `supabase/migrations/063_reconciliation_engine_down.sql`
- Service: `src/lib/reconciliationService.js` & `src/services/reconciliationService.js`
- UI: `src/components/ReconciliationEngineView.jsx` & `src/components/ReconciliationEngineView.css`
- App: Registered tab `reconciliation_engine` in `src/App.jsx`
- Tests: `tests/reconciliation-engine.test.js`
