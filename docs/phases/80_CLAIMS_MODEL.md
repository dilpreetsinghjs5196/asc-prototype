# 80 CLAIMS MODEL

## Purpose
Define the enterprise-grade Revenue Cycle Management (RCM) claims data model, line-item charge architecture, multi-dimensional claim lifecycle state machine, external clearinghouse/payer trace identifiers, and financial adjudication resolution for Ambulatory Surgery Centers (ASCs).

## Scope
- Define production requirements for Institutional ASC facility fee claims (UB-04 / 837I) and Professional claims (CMS-1500 / 837P).
- Preserve compatibility with the current ASCANALYST product (including Phase 24 claim scrubbing rules, Phase 37 CMS payment indicators, and Phase 71-77 financial ledgers).
- Enforce deterministic, auditable rules for gross charges, allowed amounts, contractual adjustments, patient balances, and outstanding accounts receivable (AR).
- Enforce strict organization/facility multi-tenancy and Role-Based Access Control (RBAC).

## Current State
Document what exists today in the repository/database before implementation.
- **`public.claims` (Phase 24/37)**: **REFACTOR & EXTEND** — Currently stores surgery billing headers and scrubbing flags (`scrub_status` with `UNSCRUBBED`, `SCRUB_FAILED`, `SCRUB_PASSED`, `OVERRIDDEN`, `READY_FOR_SUBMISSION`, `SUBMITTED`). Lacks end-to-end post-submission RCM lifecycle tracking, clearinghouse trace IDs, payer claim control numbers (ICN/DCN), and post-adjudication balances.
- **`public.claim_lines` (Phase 24/37)**: **EXTEND** — Itemizes procedural CPT codes, modifiers, gross charges, and CMS payment indicators. Lacks line-level revenue codes (`0490`, `0272`), line adjudication resolution (`allowed_amount`, `paid_amount`, `contractual_adjustment`, `coinsurance`, `copay`, `deductible`), and line-level claim lifecycle status.
- **`public.claim_scrub_findings` & `public.claim_scrub_edits` (Phase 24)**: **KEEP** — Preserved for pre-submission compliance and NCCI edit enforcement.
- **`public.claim_lifecycle_history`**: **MISSING** — Dedicated audit log tracking state transitions, timestamps, actors, clearinghouse messages, and financial restatements.
- **Analytical Rollup Views (`vw_claims_rcm_summary`, `vw_claim_line_adjudication`)**: **MISSING** — High-performance SQL views aggregating facility-level accounts receivable (AR), clean claim rates, and payer yield.

## Target State
The production-ready Claims Model establishes:
1. **Comprehensive Claim Entity**:
   - Primary identifier (`id` UUID), facility multi-tenancy reference, surgery reference, patient reference, primary payer, secondary/tertiary payers.
   - Billing formats: `UB04_INSTITUTIONAL` (ASC standard facility claim) and `CMS1500_PROFESSIONAL` (surgeon/anesthesia fee claim).
   - Frequency types: Original (`1`), Replacement/Rebill (`7`), Void (`8`), and parent claim provenance.
2. **Deterministic 15-State Claim Lifecycle Machine**:
   - `DRAFT` → `READY_TO_SCRUB` → `SCRUBBING` → `SCRUB_FAILED` / `SCRUB_PASSED` → `READY_TO_TRANSMIT` → `TRANSMITTED` → `ACCEPTED_CLEARINGHOUSE` (999 Ack) → `ACCEPTED_PAYER` (277CA Ack) → `IN_ADJUDICATION` → `PAID` / `PARTIALLY_PAID` / `DENIED` → `APPEALED` / `REBILLED` / `CLOSED_BALANCED`.
3. **External Traceability & Clearinghouse Provenance**:
   - Patient Control Number (Box 26 / Loop 2300 CLM01), Clearinghouse Trace Number (TRN02), Payer Claim Control Number (ICN/DCN), Interchange Control Number (ISA13), Transmission Batch ID.
4. **Line-Item Financial Resolution**:
   - Every claim line maintains explicit financial columns: `gross_charge`, `allowed_amount`, `paid_amount`, `contractual_adjustment`, `patient_copay`, `patient_coinsurance`, `patient_deductible`, `disallowed_amount`, and `line_balance`.
   - Balanced Equation: $\text{Gross Charge} = \text{Paid Amount} + \text{Contractual Adjustment} + \text{Patient Responsibility} + \text{Disallowed Amount} + \text{Line Balance}$.
5. **UB-04 Revenue Code Architecture**:
   - ASC Revenue Codes: `0490` (Ambulatory Surgical Care), `0272` (Sterile Supplies/Implants), `0250` (Pharmacy/Biologicals), `0360` (Operating Room Services).

## Data Model / Schema
### Required Tables and Schema Alterations

```sql
-- 1. Extend public.claims with RCM lifecycle and external trace attributes
ALTER TABLE public.claims
    ADD COLUMN IF NOT EXISTS rcm_status VARCHAR(32) NOT NULL DEFAULT 'DRAFT'
        CHECK (rcm_status IN (
            'DRAFT', 'READY_TO_SCRUB', 'SCRUBBING', 'SCRUB_FAILED', 'SCRUB_PASSED',
            'READY_TO_TRANSMIT', 'TRANSMITTED', 'ACCEPTED_CLEARINGHOUSE',
            'ACCEPTED_PAYER', 'REJECTED_CLEARINGHOUSE', 'REJECTED_PAYER',
            'IN_ADJUDICATION', 'PAID', 'PARTIALLY_PAID', 'DENIED',
            'APPEALED', 'REBILLED', 'VOIDED', 'CLOSED_BALANCED'
        )),
    ADD COLUMN IF NOT EXISTS billing_format VARCHAR(24) NOT NULL DEFAULT 'UB04_INSTITUTIONAL'
        CHECK (billing_format IN ('UB04_INSTITUTIONAL', 'CMS1500_PROFESSIONAL')),
    ADD COLUMN IF NOT EXISTS clearinghouse_claim_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS payer_claim_control_number VARCHAR(64),
    ADD COLUMN IF NOT EXISTS transmission_batch_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS source_system_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS clearinghouse_ack_status VARCHAR(32),
    ADD COLUMN IF NOT EXISTS clearinghouse_ack_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS payer_ack_status VARCHAR(32),
    ADD COLUMN IF NOT EXISTS payer_ack_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS initial_submitted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_submitted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS adjudicated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS total_allowed_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (total_allowed_amount >= 0),
    ADD COLUMN IF NOT EXISTS total_paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (total_paid_amount >= 0),
    ADD COLUMN IF NOT EXISTS total_contractual_adjustment NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS total_patient_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (total_patient_balance >= 0),
    ADD COLUMN IF NOT EXISTS outstanding_ar_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS last_status_change_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS last_status_change_by UUID REFERENCES auth.users(id);

-- 2. Extend public.claim_lines with financial adjudication and revenue codes
ALTER TABLE public.claim_lines
    ADD COLUMN IF NOT EXISTS revenue_code VARCHAR(4) DEFAULT '0490',
    ADD COLUMN IF NOT EXISTS line_rcm_status VARCHAR(32) NOT NULL DEFAULT 'ENTERED'
        CHECK (line_rcm_status IN ('ENTERED', 'SUBMITTED', 'ADJUDICATED_PAID', 'ADJUDICATED_DENIED', 'ADJUSTED', 'APPEAL_PENDING')),
    ADD COLUMN IF NOT EXISTS allowed_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (allowed_amount >= 0),
    ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0),
    ADD COLUMN IF NOT EXISTS contractual_adjustment NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS patient_copay NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (patient_copay >= 0),
    ADD COLUMN IF NOT EXISTS patient_coinsurance NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (patient_coinsurance >= 0),
    ADD COLUMN IF NOT EXISTS patient_deductible NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (patient_deductible >= 0),
    ADD COLUMN IF NOT EXISTS disallowed_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (disallowed_amount >= 0),
    ADD COLUMN IF NOT EXISTS line_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00;

-- 3. Claim Lifecycle Audit History Table
CREATE TABLE IF NOT EXISTS public.claim_lifecycle_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
    from_status VARCHAR(32),
    to_status VARCHAR(32) NOT NULL,
    transition_event VARCHAR(64) NOT NULL,
    actor_id UUID REFERENCES auth.users(id),
    actor_role VARCHAR(32),
    clearinghouse_trace_id VARCHAR(64),
    payer_icn VARCHAR(64),
    notes TEXT,
    event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claim_life_hist_claim ON public.claim_lifecycle_history(claim_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claim_life_hist_fac ON public.claim_lifecycle_history(facility_id);
```

## Business Rules
1. **Deterministic Balance Accounting**:
   - Outstanding AR Balance for a claim MUST equal:
     $$\text{AR Balance} = \text{Total Gross Charge} - \text{Total Paid Amount} - \text{Total Contractual Adjustment} - \text{Total Patient Balance}$$
   - When a claim is fully paid and reconciled with zero remaining balance, status transitions to `CLOSED_BALANCED`.
2. **Valid State Transitions**:
   - A claim in `DRAFT` must pass pre-submission scrubbing (`SCRUB_PASSED`) before moving to `READY_TO_TRANSMIT`.
   - Direct transitions from `PAID` or `CLOSED_BALANCED` back to `DRAFT` are PROHIBITED. Modifications to a finalized claim must spawn a replacement claim (`claim_frequency_type = '7'`) referencing the parent claim ID (`original_claim_id`).
   - Voids (`claim_frequency_type = '8'`) zero out expected reimbursement while preserving original charge provenance.
3. **Mandatory ASC Billing Identifiers**:
   - `place_of_service` must equal `'24'` (Ambulatory Surgical Center).
   - `billing_provider_npi` and `rendering_provider_npi` must be valid 10-digit numeric NPI strings.
   - `patient_control_number` must be unique per facility.
4. **Line-Item Revenue Code Mapping**:
   - Surgical procedure CPT codes default to Revenue Code `0490` (Ambulatory Surgical Care).
   - High-cost implants/devices (`case_devices`) default to Revenue Code `0272` (Sterile Supply / Implants).
   - Pharmacy/biological items default to Revenue Code `0250`.

## Permissions / Security
- **View Claims / Ledger**: `biller`, `billing_rcm`, `cfo`, `finance`, `facility_admin`, `super_admin`.
- **Edit / Scrub Claims**: `biller`, `billing_rcm`, `coder`, `facility_admin`, `super_admin`.
- **Approve for Submission / Transmit**: `biller`, `billing_rcm`, `facility_admin`, `super_admin`.
- **Void / Write-off Adjustments**: `cfo`, `facility_admin`, `super_admin` (requires audit rationale).
- **Tenant Isolation**: Row-Level Security (RLS) restricts claim reads and mutations to user's assigned `facility_id` via `public.is_facility_accessible(facility_id)`.

## API / Service Requirements
The backend and client service (`src/lib/claimsService.js`) contract provides:
1. `getClaims(filters)`: Retrieve claims filtered by facility, RCM status, payer, date range, or billing format.
2. `getClaimById(id)`: Retrieve detailed claim record including all child claim lines, diagnosis pointers, and lifecycle history.
3. `calculateClaimFinancials(claim, lines)`: Server-grade deterministic computation of gross charges, allowed amounts, contractual adjustments, patient portions, and outstanding AR.
4. `validateClaimStateTransition(currentStatus, nextStatus)`: Pure deterministic gate blocking unauthorized lifecycle jumps.
5. `transitionClaimStatus(claimId, nextStatus, eventDetails)`: Updates claim status, updates timestamp, and appends audit row to `claim_lifecycle_history`.
6. `exportClaimsToCsv(claims)`: Generates compliant financial export for RCM analytics and audit reviews.

## UI / Workflow Requirements
1. **Executive KPI Ribbon**:
   - Total Active AR ($)
   - Clean Claim Rate (% of claims passing scrub on first submission)
   - Pending Adjudication ($ currently with payers)
   - Denied Claims / At-Risk AR ($ requiring appeal or remediation)
2. **Visual Lifecycle Pipeline**:
   - Horizontal pipeline tracking volume and dollar values across 5 major phases:
     1. Draft & Scrubbing
     2. Transmitted & Acknowledged
     3. In Payer Adjudication
     4. Paid & Settled
     5. Denied / Under Appeal
3. **Main Interactive Workspace (4 Tabs)**:
   - **Tab 1: All Claims Master**: Comprehensive claims table with Patient, Procedure, Payer, Billing Format (UB-04 / CMS-1500), Billed Charges, Paid, Outstanding AR, and RCM Status badge.
   - **Tab 2: Claim Lines & Charge Itemization**: Itemized procedure view showing Line #, CPT, Modifiers, Revenue Code, Units, Gross Charge, Allowed, and Paid.
   - **Tab 3: Lifecycle & Adjudication Pipeline**: Filterable queue by RCM stage (e.g. `IN_ADJUDICATION`, `DENIED`, `PAID`) with payer ICN/DCN tracking.
   - **Tab 4: Clearinghouse & Transmission Audit**: Detailed EDI logs showing Batch IDs, 999 Functional Acknowledgments, and 277CA Claim Acknowledgment timestamps.
4. **Claim Detail & Line Inspector Modal**:
   - Modal inspecting claim header, diagnosis codes (ICD-10), itemized lines, and complete lifecycle audit trail.
5. **2-Tier Maestro Search & Filter Bar**:
   - Scoped search input with clear button, status dropdown, payer dropdown, and CSV export.

## Audit / Provenance
- All lifecycle changes write immutable entries into `public.claim_lifecycle_history`.
- Retains actor ID, timestamp, before/after statuses, clearinghouse transaction IDs, and transition payloads.
- Replaced or rebilled claims maintain bidirectional links through `original_claim_id`.

## QA / Test Cases
1. **Schema & Foreign Key Integrity**: Verify migration 054 adds columns and tables without data corruption.
2. **Deterministic Financial Math**: Verify claim-level sums equal line-level sums for charges, allowed amounts, and adjustments.
3. **State Machine Validation**: Verify allowed transitions and assert blocked invalid jumps (e.g. `DRAFT` directly to `PAID`).
4. **AR Balance Calculation**: Verify outstanding AR dynamically updates when payment or contractual adjustments are applied.
5. **Maestro Design Compliance**: Verify 0 disallowed purple/violet tokens and responsive table layout with `min-width: 1100px`.
6. **Application Integration**: Verify `ClaimsModelView` renders cleanly in `App.jsx` without JavaScript runtime errors.

## Acceptance Criteria
- Build passes (`npm run build` exits 0).
- Lint passes without syntax or import errors.
- Automated test suite passes (`tests/claims-model.test.js` passes 100%).
- Full project test suite remains green (1000+ tests pass).
- No mock or placeholder numbers presented as authoritative production truth.
- Tenant isolation is strictly enforced via facility-scoped RLS policies.
- P0/P1 issues block release.

## Dependencies
- Phase 01: Multi-Tenancy Core (`public.facilities`, `public.surgeries`, `public.patients`)
- Phase 02: RBAC Matrix (`biller`, `billing_rcm`, `cfo`)
- Phase 24: Claim Scrubbing Engine (`public.claims`, `public.claim_lines`, `public.claim_scrub_findings`)
- Phase 37: CMS Payment Indicators (`payment_indicator`, `coverage_status`)
- Phase 41: Payer Master (`public.payers`)

## Definition of Done
The feature is complete only when the extended data model, deterministic service calculations, status machine, audit logging, UI views, tests, and documentation are fully implemented, verified, and committed.

## Implementation Notes
- **Specification**: Created authoritative `80_CLAIMS_MODEL.md` in `Phase_08_RCM`.
- **Database**: Created migration `054_claims_model.sql` and rollback `054_claims_model_down.sql`.
- **Services**: Created `src/lib/claimsService.js` and `src/services/claimsService.js`.
- **UI Components**: Created `src/components/ClaimsModelView.jsx` and `src/components/ClaimsModelView.css`.
- **App Wiring**: Integrated into `src/App.jsx` with Revenue Cycle navigation item and header title.
- **Tests**: Created comprehensive suite `tests/claims-model.test.js`.
