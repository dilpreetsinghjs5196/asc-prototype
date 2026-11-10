# 93 UNDERPAYMENT DETECTION

## Purpose
Expected-vs-actual allowed/payment underpayment detection.

## Scope
- Define production requirements for expected-vs-actual allowed fee schedule auditing, contractual underpayment detection, and dispute resolution.
- Preserve compatibility with the current ASCANALYST product, Payer Contract Management (Phase 65–67), Remittance Ingestion (Phase 83), Reconciliation Engine (Phase 89), and Master Revenue Leakage Engine (Phase 90).
- Use deterministic, auditable rules for calculating variances, allowable compliance, MPPR adjustments, and underpayment priority scores.
- Enforce organization/facility tenancy and RBAC.

## Current State
| Component | Status | Description |
| :--- | :---: | :--- |
| `rcm_reconciliation_items` | **KEEP** | Provides transaction-level four-way matching and discrepancy status. |
| `rcm_payer_contracts` | **KEEP** | Effective-dated contracted rates and fee schedules. |
| Deterministic Underpayment Ledger | **MISSING** | No dedicated persistent table tracking expected vs actual allowed amounts with stored variance formulas. |
| Underpayment Root-Cause Categorization | **MISSING** | No structured categorization for implant carve-out underpayments, MPPR over-discounting, or expired fee schedules. |
| Payer Dispute Workflow | **MISSING** | No formal tracking of underpayment dispute letters, payer settlement negotiations, and supplemental payments. |
| Dedicated Underpayment Workbench UI | **MISSING** | No high-contrast Maestro clinical view displaying underpayment aging, payer variance scorecards, and recovery actions. |

## Target State
1. **Algorithmic Underpayment Auditing:**
   - Every adjudicated claim line is cross-checked against the facility's active fee schedule or contract rate rules.
   - Variances where $\text{actual\_allowed} < \text{expected\_allowed}$ are automatically flagged and categorized.
2. **Deterministic Root-Cause Categories:**
   - `FEE_SCHEDULE_MISMATCH`: Payer reimbursed below the contracted base rate.
   - `IMPLANT_CARVEOUT_UNPAID`: Contractual implant invoice reimbursement (cost + markup) was unpaid or short-paid.
   - `MPPR_OVER_DISCOUNT`: Payer discounted secondary procedure beyond contract terms (e.g., >50% or discounted primary).
   - `DEVICE_INTENSIVE_OFFSET_ERROR`: Inaccurate device offset deduction on OPPS device-intensive CPT.
   - `CONTRACT_RATE_EXPIRED`: Payer applied obsolete prior-year fee schedule.
   - `BILATERAL_DISCOUNT_ERROR`: Bilateral modifier -50 discounted erroneously.
3. **Lifecycle State Machine:**
   - `DETECTED` $\rightarrow$ `AUDIT_CONFIRMED` $\rightarrow$ `DISPUTE_SUBMITTED` $\rightarrow$ `RECOVERED` (or `DISMISSED_VALID_ADJUSTMENT`).
4. **Payer Underpayment Scorecard:**
   - Ranks commercial and government health plans by contractual payment compliance, total underpayment dollars, and dispute resolution cycle time.

## Data Model / Schema
### Tables:
1. `public.rcm_underpayment_rules`:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE`
   - `rule_code VARCHAR(32) NOT NULL UNIQUE`
   - `underpayment_category VARCHAR(40) NOT NULL CHECK (underpayment_category IN ('FEE_SCHEDULE_MISMATCH', 'IMPLANT_CARVEOUT_UNPAID', 'MPPR_OVER_DISCOUNT', 'DEVICE_INTENSIVE_OFFSET_ERROR', 'CONTRACT_RATE_EXPIRED', 'BILATERAL_DISCOUNT_ERROR'))`
   - `title VARCHAR(128) NOT NULL`
   - `description TEXT NOT NULL`
   - `variance_threshold NUMERIC(14,2) NOT NULL DEFAULT 50.00 CHECK (variance_threshold >= 0)`
   - `is_active BOOLEAN NOT NULL DEFAULT true`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

2. `public.rcm_underpayments`:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE`
   - `underpayment_alert_number VARCHAR(64) NOT NULL UNIQUE`
   - `claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE`
   - `surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE CASCADE`
   - `patient_id BIGINT NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT`
   - `payer_name VARCHAR(128) NOT NULL`
   - `procedure_name VARCHAR(256) NOT NULL`
   - `cpt_code VARCHAR(16) NOT NULL`
   - `date_of_service DATE NOT NULL`
   - `remittance_date DATE NOT NULL`
   - `underpayment_category VARCHAR(40) NOT NULL CHECK (underpayment_category IN ('FEE_SCHEDULE_MISMATCH', 'IMPLANT_CARVEOUT_UNPAID', 'MPPR_OVER_DISCOUNT', 'DEVICE_INTENSIVE_OFFSET_ERROR', 'CONTRACT_RATE_EXPIRED', 'BILATERAL_DISCOUNT_ERROR'))`
   - `expected_allowed_amount NUMERIC(14,2) NOT NULL CHECK (expected_allowed_amount >= 0)`
   - `actual_allowed_amount NUMERIC(14,2) NOT NULL CHECK (actual_allowed_amount >= 0)`
   - `variance_amount NUMERIC(14,2) GENERATED ALWAYS AS (ROUND(expected_allowed_amount - actual_allowed_amount, 2)) STORED`
   - `variance_percentage NUMERIC(6,2) GENERATED ALWAYS AS (
       CASE WHEN expected_allowed_amount > 0 THEN ROUND(((expected_allowed_amount - actual_allowed_amount) / expected_allowed_amount) * 100.0, 2)
       ELSE 0.00 END
     ) STORED`
   - `expected_payment_amount NUMERIC(14,2) NOT NULL CHECK (expected_payment_amount >= 0)`
   - `actual_payment_amount NUMERIC(14,2) NOT NULL CHECK (actual_payment_amount >= 0)`
   - `recovered_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (recovered_amount >= 0)`
   - `confidence_score NUMERIC(5,2) NOT NULL DEFAULT 90.00 CHECK (confidence_score BETWEEN 0.00 AND 100.00)`
   - `priority_score NUMERIC(5,2) NOT NULL DEFAULT 50.00 CHECK (priority_score BETWEEN 0.00 AND 100.00)`
   - `status VARCHAR(32) NOT NULL DEFAULT 'DETECTED' CHECK (status IN ('DETECTED', 'AUDIT_CONFIRMED', 'DISPUTE_SUBMITTED', 'RECOVERED', 'DISMISSED_VALID_ADJUSTMENT'))`
   - `dispute_letter_reference VARCHAR(64)`
   - `disputed_at TIMESTAMPTZ`
   - `resolved_at TIMESTAMPTZ`
   - `resolution_notes TEXT`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

3. `public.rcm_underpayment_actions`:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE`
   - `underpayment_id UUID NOT NULL REFERENCES public.rcm_underpayments(id) ON DELETE CASCADE`
   - `action_type VARCHAR(40) NOT NULL CHECK (action_type IN ('UNDERPAYMENT_DETECTED', 'AUDIT_CONFIRMED', 'DISPUTE_SUBMITTED', 'PAYER_RESPONSE_RECEIVED', 'PAYMENT_RECOVERED', 'UNDERPAYMENT_DISMISSED'))`
   - `performed_by UUID REFERENCES auth.users(id)`
   - `performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `notes TEXT NOT NULL`

4. `public.vw_rcm_underpayments_active`:
   - Dynamic analytical SQL view computing days elapsed since remittance (`remittance_date - CURRENT_DATE`).
5. `public.vw_rcm_underpayments_summary`:
   - Aggregated summary view by facility and payer.

## Business Rules
1. **Deterministic Variance Calculation:**
   $$\text{variance\_amount} = \text{ROUND}(\text{expected\_allowed\_amount} - \text{actual\_allowed\_amount},\, 2)$$
2. **Deterministic Percentage Calculation:**
   $$\text{variance\_percentage} = \begin{cases}
     \text{ROUND}\left(\frac{\text{expected\_allowed} - \text{actual\_allowed}}{\text{expected\_allowed}} \times 100.0,\, 2\right), & \text{if } \text{expected\_allowed} > 0 \\
     0.00, & \text{otherwise}
   \end{cases}$$
3. **Priority Score (0.00 – 100.00):**
   - Dollar magnitude component (50%): $\min(50.0, (\text{variance\_amount} / 3000.0) \times 50.0)$
   - Confidence component (30%): $(\text{confidence\_score} / 100.0) \times 30.0$
   - Age/Timeliness component (20%):
     - Days elapsed $\le 30$: $20.00$
     - Days elapsed $\le 60$: $12.00$
     - Days elapsed $> 60$: $4.00$
   - Total score = $\min(100.0, \max(0.0, \text{dollar} + \text{conf} + \text{age}))$.
4. **Prohibited Behaviors:**
   - Underpayment alerts must never be triggered when $\text{actual\_allowed} \ge \text{expected\_allowed}$.
   - Contractual underpayments must not be written off without business office manager authorization.

## Permissions / Security
- **View:** `biller`, `auditor`, `clinical_coder`, `business_office_manager`, `administrator`, `executive`.
- **Confirm & Dispute:** `biller`, `business_office_manager`, `administrator`.
- **Dismiss / Validate Adjustment:** Requires `business_office_manager` or `administrator`.
- **Tenancy:** RLS enforces `facility_id IN (SELECT public.get_auth_user_facilities())`.

## API / Service Requirements
- `getUnderpayments(filters)`: Returns filtered, prioritized underpayment items.
- `confirmUnderpayment(id, options)`: Confirms contract variance and updates notes.
- `submitDispute(id, { disputeReference, notes })`: Records formal dispute letter transmission.
- `recordRecovery(id, { recoveredAmount, notes })`: Records cash recovery and marks item as resolved.
- `dismissUnderpayment(id, { reason, notes })`: Closes alert with contract rationale.

## UI / Workflow Requirements
- **Executive Topbar:** Phase pill, facility pill, "Run Underpayment Audit", and "Export Variance Ledger".
- **5-Card KPI Ribbon:**
  1. Active Underpayment Alerts
  2. Total Variance Exposure ($)
  3. Confirmed Recovery Pipeline ($)
  4. Realized Disputed Cash ($)
  5. Dismissed Valid Adjustments ($)
- **4 Workbenches:**
  1. **Underpayment Worklist:** Real-time data grid showing alert #, patient, procedure, CPT, expected vs actual allowed, variance $, variance %, status, priority, and actions.
  2. **Payer Underpayment Scorecard:** Health plan compliance rankings and average recovery amounts.
  3. **Variance Categories:** Root-cause distribution (fee schedule, implant carve-outs, MPPR).
  4. **Contract Rule Inspector:** Payer contract fee schedule rule verification.
- **Strict Maestro Compliance:** Canvas `#0b1120`, cards `#0f172a`, headers `#ffffff`, strictly **ZERO** purple/violet/indigo tokens.

## Audit / Provenance
- All underpayment status updates and dispute references logged in `rcm_underpayment_actions`.
- Preserves user ID, before/after status, timestamp, and notes.

## QA / Test Cases
- Unit tests for deterministic math: variance calculation, percentage calculation, and priority score weighting.
- State machine test: `confirmUnderpayment`, `submitDispute`, `recordRecovery`, `dismissUnderpayment`.
- Database migration test: verifies schema creation, stored generated columns, views, and 1:1 RLS policies.
- Design system test: verifies strictly zero purple tokens in CSS and JSX.
- App wiring test: verifies sidebar menu item, header title, and view component rendering in `src/App.jsx`.

## Acceptance Criteria
- Build passes (`npm run build` exits 0).
- All tests pass with 100% success rate.
- Stored generated columns enforce arithmetic integrity at database level.
- Zero purple/violet tokens present in code.
- Clean working tree committed to git branch `feature/phase-80-claims-model`.

## Definition of Done
A feature is complete only when data model, deterministic logic, permissions, validation, auditability, tests, UI states, documentation, and acceptance criteria are complete.

