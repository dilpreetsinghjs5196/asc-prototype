# 83 PAYMENTS AND ADJUSTMENTS

## Purpose
Production specification for healthcare payment posting, contractual adjustments, administrative write-offs, refunds, payer recoupments, unapplied cash suspense management, and double-entry general ledger reconciliation for Ambulatory Surgery Centers (ASCs).

## Scope
- Define production requirements for cash posting across insurance payers, patient balances, and third-party financing.
- Maintain seamless integration with Phase 80 (`claims`, `claim_lines`), Phase 81 (`edi_837_staged_claims`), and Phase 82 (`edi_835_claim_payments`).
- Enforce deterministic double-entry accounting math: `Outstanding AR = Gross Charges - (Payer Payments + Patient Payments + Contractual Adjustments + Write-offs) + Refunds - Recoupments`.
- Enforce facility multi-tenancy and strict Role-Based Access Control (RBAC) with separation of duties for refunds and write-offs.
- Strictly adhere to Maestro Clinical Design System token governance (zero purple/violet/magenta/indigo/fuchsia tokens).

## Current State
- **Phase 80 (Claims Model & Lifecycle)**: Established canonical claim structure, claim lines, and high-level claim statuses (`054_claims_model.sql`).
- **Phase 81 (837 Claim Ingestion)**: Built inbound ANSI X12 837 claim parser and case matcher (`055_edi_837_ingestion.sql`).
- **Phase 82 (835 Remittance Ingestion)**: Built ERA electronic remittance advice ingestion and line-level CARC balancing (`056_edi_835_remittance.sql`).
- **Phase 83 (Payments & Adjustments)**:
  - Repository currently lacks double-entry cash posting transaction ledger: **MISSING**.
  - Database schema for payment batches, transaction lines, refund approvals, and unapplied funds: **MISSING**.
  - UI command center for cash posting, lockbox deposit balancing, refund disbursement, and write-off governance: **MISSING**.

| Component | Classification | Description |
|-----------|----------------|-------------|
| Database Schema (057_rcm_payments_adjustments.sql) | **MISSING** | Batches, payment transactions, refund ledger, unapplied cash, RLS |
| Down Migration (057_rcm_payments_adjustments_down.sql) | **MISSING** | Reversible migration teardown in reverse dependency order |
| Service Layer (paymentAdjustmentService.js) | **MISSING** | Double-entry posting math, balance validator, refund state machine |
| Dual Re-export (src/services/paymentAdjustmentService.js) | **MISSING** | Standardized backward-compatible re-export module |
| UI Component (PaymentAdjustmentView.jsx & CSS) | **MISSING** | Maestro Clinical 4-KPI banner, 4-tab posting workbench, modals |
| App Wiring (src/App.jsx & Sidebar) | **MISSING** | Sidebar navigation, header title/subtitle, tab render block |
| Test Suite (tests/payment-adjustments.test.js) | **MISSING** | Multi-level automated unit, financial, and integration tests |

## Target State
1. **Double-Entry Cash Posting Transaction Ledger**:
   - Every financial event is an immutable debit/credit transaction linked to a specific claim and facility.
   - Transaction Types:
     - `PAYER_PAYMENT`: Insurance reimbursement (EFT, Check, Virtual Card).
     - `PATIENT_PAYMENT`: Out-of-pocket collections (Credit Card, Check, Cash, CareCredit).
     - `CONTRACTUAL_ADJUSTMENT`: Mandatory fee schedule reductions with CARC codes (e.g. `CO-45`, `CO-97`).
     - `ADMIN_WRITE_OFF`: Authorized bad debt, charity care, or prompt-pay discounts with required approvals.
     - `REFUND`: Overpayment returned to patient or insurance payer.
     - `RECOUPMENT`: Negative payer offset on a prior claim deducted from current remittance.
2. **Deposit Batch Balancing & Lockbox Reconciliation**:
   - All manual or electronic payments group into balanced deposit batches.
   - `Batch Total Amount == SUM(Posted Payments) + SUM(Unapplied Cash)`.
   - Prevent closing or freezing batches with out-of-balance variances > $0.00.
3. **Refund & Recoupment Approval Governance**:
   - Dual-authorization workflow for disbursements:
     - < $250.00: Revenue Cycle Specialist / Biller approval.
     - >= $250.00: CFO / Finance Director approval required.
   - Immutable audit trail linking refund check number, reason code, and approved user.
4. **Unapplied Cash Suspense Account Management**:
   - Payments received without an active claim are quarantined in unapplied suspense.
   - Full aging analytics (0–30, 31–60, 61–90, 90+ days) and one-click re-association to newly billed claims.
5. **Deterministic Line-Level Allocation**:
   - Supports claim-level posting as well as exact line-item allocation to `claim_lines` (CPT / Rev Code).

## Data Model / Schema
Required tables in `supabase/migrations/057_rcm_payments_adjustments.sql`:

1. `public.rcm_payment_batches`:
   - `id` (UUID, PK)
   - `facility_id` (UUID, FK -> facilities)
   - `batch_number` (VARCHAR(64), NOT NULL)
   - `deposit_date` (DATE NOT NULL)
   - `bank_account_name` (VARCHAR(100) NOT NULL)
   - `batch_type` (VARCHAR(32) NOT NULL CHECK IN ('ELECTRONIC_ERA', 'MANUAL_LOCKBOX', 'CREDIT_CARD_GATEWAY', 'PATIENT_PORTAL'))
   - `total_batch_amount` (NUMERIC(14,2) NOT NULL CHECK >= 0)
   - `posted_amount` (NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK >= 0)
   - `unapplied_amount` (NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK >= 0)
   - `status` (VARCHAR(32) NOT NULL DEFAULT 'OPEN' CHECK IN ('OPEN', 'BALANCED_POSTED', 'OUT_OF_BALANCE', 'CLOSED_FROZEN'))
   - `notes` (TEXT)
   - `created_by` (UUID REFERENCES auth.users)
   - `created_at` (TIMESTAMPTZ DEFAULT NOW())
   - CONSTRAINT `uq_fac_pmt_batch` UNIQUE (facility_id, batch_number)

2. `public.rcm_payment_transactions`:
   - `id` (UUID, PK)
   - `batch_id` (UUID, FK -> rcm_payment_batches, ON DELETE CASCADE)
   - `facility_id` (UUID, FK -> facilities)
   - `claim_id` (UUID REFERENCES public.claims ON DELETE RESTRICT)
   - `claim_line_id` (UUID REFERENCES public.claim_lines ON DELETE SET NULL)
   - `transaction_type` (VARCHAR(32) NOT NULL CHECK IN ('PAYER_PAYMENT', 'PATIENT_PAYMENT', 'CONTRACTUAL_ADJUSTMENT', 'ADMIN_WRITE_OFF', 'REFUND', 'RECOUPMENT'))
   - `payment_method` (VARCHAR(24) NOT NULL CHECK IN ('EFT', 'CHECK', 'CREDIT_CARD', 'CASH', 'ACH', 'OFFSET'))
   - `reference_number` (VARCHAR(64) NOT NULL)
   - `amount` (NUMERIC(12,2) NOT NULL) -- positive for payments & adjustments; positive for refunds/recoupments
   - `carc_code` (VARCHAR(16))
   - `patient_mrn` (VARCHAR(64))
   - `patient_name` (VARCHAR(150))
   - `payer_name` (VARCHAR(150))
   - `transaction_date` (DATE NOT NULL)
   - `reversal_of_transaction_id` (UUID REFERENCES public.rcm_payment_transactions)
   - `posted_by` (UUID REFERENCES auth.users)
   - `posted_at` (TIMESTAMPTZ DEFAULT NOW())

3. `public.rcm_refund_recoupment_ledger`:
   - `id` (UUID, PK)
   - `facility_id` (UUID, FK -> facilities)
   - `claim_id` (UUID REFERENCES public.claims ON DELETE RESTRICT)
   - `original_transaction_id` (UUID REFERENCES public.rcm_payment_transactions)
   - `type` (VARCHAR(32) NOT NULL CHECK IN ('PATIENT_REFUND', 'PAYER_REFUND', 'PAYER_RECOUPMENT'))
   - `amount` (NUMERIC(12,2) NOT NULL CHECK > 0)
   - `reason_code` (VARCHAR(64) NOT NULL CHECK IN ('OVERPAYMENT', 'BILLING_ERROR', 'MEDICARE_AUDIT', 'DUPLICATE_PAYMENT', 'RETROACTIVE_DENIAL'))
   - `disbursement_reference` (VARCHAR(64)) -- Refund Check # or EFT Trace
   - `approval_status` (VARCHAR(24) NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK IN ('PENDING_APPROVAL', 'APPROVED', 'DISBURSED', 'REJECTED'))
   - `requested_by` (UUID REFERENCES auth.users)
   - `approved_by` (UUID REFERENCES auth.users)
   - `approved_at` (TIMESTAMPTZ)
   - `notes` (TEXT)
   - `created_at` (TIMESTAMPTZ DEFAULT NOW())

4. Rollup Views:
   - `public.vw_rcm_cash_posting_summary`: Aggregated deposits, payments, adjustments, and write-offs.
   - `public.vw_rcm_unapplied_cash_ledger`: Suspense funds with aging tiers.

## Business Rules
1. **Mathematical Balance Formula**:
   - `Net Balance Due = Total Gross Charges - (SUM(PAYER_PAYMENT) + SUM(PATIENT_PAYMENT) + SUM(CONTRACTUAL_ADJUSTMENT) + SUM(ADMIN_WRITE_OFF)) + SUM(REFUND) - SUM(RECOUPMENT)`.
   - Net Balance Due cannot be negative without triggering an `OVERPAYMENT` warning.
2. **Batch Deposit Balancing**:
   - `total_batch_amount == posted_amount + unapplied_amount`.
   - Batches cannot transition to `CLOSED_FROZEN` if variance > $0.00.
3. **Separation of Duties (Refunds & Write-offs)**:
   - A user cannot approve their own refund request (`requested_by != approved_by`).
   - Refunds >= $250.00 strictly require `cfo` or `super_admin` role credentials.
4. **Prohibited Behaviors**:
   - Prohibit hard deletion of posted transactions; corrections must be issued as negative offset or reversal transactions (`reversal_of_transaction_id`).
   - Prohibit posting payments to closed accounting periods (enforced by Phase 77 freeze governance).

## Permissions / Security
- `rcm.view_payments`: Viewer, Analyst, Biller, CFO, Super Admin.
- `rcm.post_cash`: Biller, Revenue Cycle Specialist, CFO, Super Admin.
- `rcm.request_refund`: Biller, Revenue Cycle Specialist, CFO, Super Admin.
- `rcm.approve_refund`: CFO, Financial Director, Super Admin.
- `rcm.authorize_write_off`: CFO, Super Admin only.

## API / Service Requirements
- `paymentAdjustmentService.calculatePostingBalances(claim, transactions)`: Computes authoritative net AR balance.
- `paymentAdjustmentService.validateBatchBalancing(batch, transactions)`: Verifies deposit batch balancing.
- `paymentAdjustmentService.recordPaymentTransaction(payload)`: Validates and appends payment or adjustment.
- `paymentAdjustmentService.processRefundOrRecoupment(payload)`: Enforces threshold approval rules.
- `paymentAdjustmentService.calculatePaymentKpis(batches, transactions, refunds)`: Generates executive KPI cards.
- `paymentAdjustmentService.getBaselineSampleData()`: Provides rich baseline mock data for dev, test, and live UI simulation.

## UI / Workflow Requirements
- **Executive KPI Banner (4 Cards)**:
  1. Total Cash Posted ($) (Payer + Patient collections)
  2. Contractual Adjustments ($) (CO fee schedule write-offs)
  3. Active Unapplied Cash ($) (Suspense account aging)
  4. Refunds & Recoupments Disbursed ($)
- **Top Actions**:
  - `Post Manual Payment / Adj`: Opens interactive posting modal.
  - `Export Cash Ledger CSV`: Exports transaction journal to standard CSV.
- **4 Tab Layout**:
  1. `ledger`: Cash Posting Ledger (Transaction ID, Claim Control #, Type, Method, Ref #, Amount, CARC, Action).
  2. `batches`: Deposit & Lockbox Batches (Batch #, Deposit Date, Account, Batch Amount, Posted, Unapplied, Status).
  3. `refunds`: Refunds & Recoupment Requests (Disbursement #, Reason, Amount, Approval Status, Action).
  4. `unapplied`: Unapplied Cash Suspense Workbench (Aging buckets, re-associate to claim).
- **Responsive Table**:
  - Encapsulated in `<div className="table-responsive">` with `min-width: 1100px`.
  - Scoped CSS classes `.rcm-payments-*` to ensure zero CSS bleed.
  - Strict Maestro Clinical Design System palette compliance (Zero purple tokens).

## Audit / Provenance
- All transactions retain `posted_by`, `posted_at`, and `reference_number`.
- Reversals retain link to original transaction ID (`reversal_of_transaction_id`).
- Approvals record timestamp and user ID.

## QA / Test Cases
- Minimum 20 unit and integration tests in `tests/payment-adjustments.test.js`:
  1. Domain enums & transaction type verification.
  2. Net AR balance equation calculation.
  3. Batch deposit balancing and variance detection.
  4. Refund separation of duties and threshold verification.
  5. Executive KPI metrics aggregation.
  6. Migration `057_rcm_payments_adjustments.sql` DDL, views, and idempotent RLS.
  7. Down migration rollback verification.
  8. Zero purple tokens in `PaymentAdjustmentView.css`.
  9. App.jsx navigation and routing wiring.

## Acceptance Criteria
- Build passes (`npm run build`).
- All tests pass (`node --test tests/payment-adjustments.test.js`).
- No mock/placeholder numbers presented as production truth.
- Multi-tenancy RLS verified.
- P0/P1 issues block release.

## Dependencies
- Upstream: Phase 80 (`claims`, `claim_lines`), Phase 81 (`edi_837_staged_claims`), Phase 82 (`edi_835_claim_payments`).
- Migrations: `054_claims_model.sql`, `055_edi_837_ingestion.sql`, `056_edi_835_remittance.sql`.

## Definition of Done
Complete when specification, database schema, client service layer, re-export, Maestro Clinical UI, App.jsx integration, test suite, and clean production build are verified.

## Implementation Notes
- Created `83_PAYMENTS_AND_ADJUSTMENTS.md` covering all 15 required sections.
- Deployed migrations `057_rcm_payments_adjustments.sql` and `057_rcm_payments_adjustments_down.sql`.
- Built service layer `src/lib/paymentAdjustmentService.js` and re-export `src/services/paymentAdjustmentService.js`.
- Built UI component `src/components/PaymentAdjustmentView.jsx` and `src/components/PaymentAdjustmentView.css`.
- Wired into `src/App.jsx` under `Revenue Cycle (RCM)`.
- Implemented and verified test suite `tests/payment-adjustments.test.js`.
