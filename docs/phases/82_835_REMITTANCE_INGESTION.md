# 82 835 REMITTANCE INGESTION

## Purpose
Production specification for Electronic Remittance Advice (ERA) ANSI ASC X12 835 ingestion, WEDI SNIP balancing, line-level adjudication parsing, deterministic claim matching, CARC/RARC classification, and exception remediation for Ambulatory Surgery Centers (ASCs).

## Scope
- Define production requirements for HIPAA 5010 005010X221A1 835 transaction ingestion and automated remittance posting.
- Preserve compatibility with Phase 80 (`claims`, `claim_lines`, `claim_lifecycle_history`) and Phase 81 (`edi_837_staged_claims`).
- Enforce deterministic mathematical balancing: `Check Amount = SUM(Claim Payments) + SUM(Provider Adjustments)` and `Billed Charge = Paid Amount + Contractual Write-off + Patient Responsibility`.
- Enforce organization/facility tenancy and strict Role-Based Access Control (RBAC).
- Follow Maestro Clinical Design System token governance (strictly zero purple/violet/magenta/indigo/fuchsia tokens).

## Current State
- **Phase 80 (Claims Model & Lifecycle)**: Implemented canonical `claims` table, `claim_lines`, double-entry balance math, and RCM lifecycle transitions (`054_claims_model.sql`).
- **Phase 81 (837 Ingestion & Case Matching)**: Implemented ANSI ASC X12 837 ingestion, WEDI SNIP levels 1–4 validation, and 3-tier surgery case matching (`055_edi_837_ingestion.sql`).
- **Phase 82 (835 Remittance Ingestion)**:
  - Repository currently lacks automated ERA parser for BPR, TRN, CLP, SVC, CAS, and PLB segments: **MISSING**.
  - Database schema for 835 remittance batches, claim payments, line adjudications, and unapplied cash exceptions: **MISSING**.
  - UI command center for remittance balancing, CARC/RARC inspection, and manual claim re-association: **MISSING**.

| Component | Classification | Description |
|-----------|----------------|-------------|
| Database Schema (056_edi_835_remittance.sql) | **MISSING** | 835 batches, claim payments, line adjudications, exceptions, RLS |
| Down Migration (056_edi_835_remittance_down.sql) | **MISSING** | Reversible migration teardown in reverse dependency order |
| Service Layer (edi835RemittanceService.js) | **MISSING** | X12 835 parser, BPR balancing, CLP/SVC matcher, KPI aggregation |
| Dual Re-export (src/services/edi835RemittanceService.js) | **MISSING** | Standardized backward-compatible re-export module |
| UI Component (Edi835RemittanceView.jsx & CSS) | **MISSING** | Maestro Clinical 4-KPI banner, 4-tab workbench, inspect modal |
| App Wiring (src/App.jsx & Sidebar) | **MISSING** | Sidebar navigation, header title/subtitle, tab render block |
| Test Suite (tests/edi835-remittance.test.js) | **MISSING** | Multi-level automated unit and integration tests |

## Target State
1. **Automated ERA Ingestion & Envelope Parsing**:
   - Support ANSI ASC X12 835 (005010X221A1) file ingestion with SHA-256 fingerprint deduplication.
   - Authoritatively parse `BPR` (Financial Information: payment amount, method [ACH/CHK], transaction handling, effective date), `TRN` (EFT/Check Reassociation Trace #), `N1*PR` (Payer Identification), and `N1*PE` (Payee ASC facility NPI & Tax ID).
2. **Claim-Level (CLP) & Service-Line Level (SVC) Adjudication**:
   - Extract `CLP` segment data: Patient Control Number, Claim Status Code (1=Primary, 2=Secondary, 4=Denied, 22=Reversal), Total Billed Charge, Total Paid Amount, Patient Responsibility, and Payer Claim Control Number (ICN).
   - Extract itemized `SVC` service lines: composite CPT/RevCodes, line billed charge, line paid amount, and line units.
3. **CARC & RARC Itemized Adjustment Classification**:
   - Deterministically parse `CAS` adjustment segments into standard HIPAA Claim Adjustment Reason Codes (CARC) and Remittance Advice Remark Codes (RARC).
   - Standard Group Codes: `CO` (Contractual Obligation), `PR` (Patient Responsibility: Deductible, Coinsurance, Copay), `OA` (Other Adjustments), `CR` (Corrections/Reversals).
4. **3-Tier Deterministic Claim Matching**:
   - Tier 1: 100% Exact Match (`CLP01` Patient Control Number matches `claims.patient_control_number`).
   - Tier 2: 90% Probable Match (Patient Name + Date of Service + Billed Charge matches within ±$0.01).
   - Tier 3: Unmatched ERA Claim (< 90% confidence or missing patient record) -> routed to Remittance Exception Queue.
5. **Double-Entry Financial Balancing**:
   - Batch Balance: `BPR02 (Check Amount) = SUM(CLP04 Paid Amounts) + SUM(PLB Adjustments)`.
   - Claim Balance: `CLP03 (Claim Charge) = CLP04 (Paid) + SUM(CAS Adjustments)`.
   - Line Balance: `SVC02 (Line Charge) = SVC03 (Line Paid) + SUM(Line CAS Adjustments)`.
6. **Exception Remediation Workflow**:
   - Queue captures unmatched claims, balance variances, invalid NPIs, and unapplied provider-level adjustments (`PLB`).
   - Billers can manually link unassociated ERA payments to active surgery claims or post to unapplied cash.

## Data Model / Schema
Required tables in `supabase/migrations/056_edi_835_remittance.sql`:

1. `public.edi_835_remittance_batches`:
   - `id` (UUID, PK)
   - `facility_id` (UUID, FK -> facilities)
   - `batch_number` (VARCHAR(64), NOT NULL)
   - `file_name` (VARCHAR(255), NOT NULL)
   - `file_hash_sha256` (VARCHAR(64), NOT NULL, UNIQUE per facility)
   - `check_eft_trace_number` (VARCHAR(64), NOT NULL)
   - `payment_method_code` (VARCHAR(16), NOT NULL DEFAULT 'ACH' CHECK IN ('ACH', 'CHK', 'NON', 'BOP'))
   - `total_payment_amount` (NUMERIC(14,2), NOT NULL CHECK >= 0)
   - `payment_effective_date` (DATE NOT NULL)
   - `payer_name` (VARCHAR(150) NOT NULL)
   - `payer_identifier` (VARCHAR(64))
   - `payee_name` (VARCHAR(150))
   - `payee_npi` (VARCHAR(10))
   - `status` (VARCHAR(32), CHECK IN ('PENDING', 'PROCESSING', 'BALANCED_POSTED', 'BALANCED_EXCEPTIONS', 'OUT_OF_BALANCE', 'REJECTED'))
   - `total_claims_count` (INT NOT NULL DEFAULT 0)
   - `matched_claims_count` (INT NOT NULL DEFAULT 0)
   - `exception_claims_count` (INT NOT NULL DEFAULT 0)
   - `raw_payload_preview` (TEXT)
   - `ingested_at` (TIMESTAMPTZ DEFAULT NOW())
   - `ingested_by` (UUID REFERENCES auth.users)

2. `public.edi_835_claim_payments`:
   - `id` (UUID, PK)
   - `batch_id` (UUID, FK -> edi_835_remittance_batches, ON DELETE CASCADE)
   - `facility_id` (UUID, FK -> facilities)
   - `patient_control_number` (VARCHAR(64) NOT NULL)
   - `payer_claim_control_number` (VARCHAR(64))
   - `claim_status_code` (VARCHAR(8) NOT NULL CHECK IN ('1', '2', '3', '4', '19', '20', '21', '22'))
   - `total_claim_charge_amount` (NUMERIC(12,2) NOT NULL)
   - `total_claim_paid_amount` (NUMERIC(12,2) NOT NULL)
   - `patient_responsibility_amount` (NUMERIC(12,2) NOT NULL DEFAULT 0.00)
   - `contractual_adjustment_amount` (NUMERIC(12,2) NOT NULL DEFAULT 0.00)
   - `patient_name` (VARCHAR(150))
   - `subscriber_member_id` (VARCHAR(64))
   - `match_status` (VARCHAR(32) NOT NULL CHECK IN ('MATCHED_EXACT', 'MATCHED_PROBABLE', 'UNMATCHED', 'RESOLVED_MANUAL', 'DISCARDED'))
   - `match_score` (INT NOT NULL CHECK BETWEEN 0 AND 100)
   - `matched_claim_id` (UUID REFERENCES public.claims)
   - `matched_surgery_id` (BIGINT REFERENCES public.surgeries)
   - `created_at` (TIMESTAMPTZ DEFAULT NOW())

3. `public.edi_835_line_adjudications`:
   - `id` (UUID, PK)
   - `claim_payment_id` (UUID, FK -> edi_835_claim_payments, ON DELETE CASCADE)
   - `facility_id` (UUID, FK -> facilities)
   - `revenue_code` (VARCHAR(8))
   - `cpt_code` (VARCHAR(16) NOT NULL)
   - `modifiers` (TEXT[])
   - `line_charge_amount` (NUMERIC(12,2) NOT NULL)
   - `line_paid_amount` (NUMERIC(12,2) NOT NULL)
   - `units_paid` (NUMERIC(8,2) NOT NULL DEFAULT 1)
   - `adjustment_group_code` (VARCHAR(4)) -- CO, PR, OA, CR
   - `carc_code` (VARCHAR(16))            -- e.g. CO-45, PR-1, PR-2
   - `carc_amount` (NUMERIC(12,2) DEFAULT 0.00)
   - `rarc_code` (VARCHAR(16))            -- Remittance Advice Remark Code
   - `created_at` (TIMESTAMPTZ DEFAULT NOW())

4. `public.edi_835_remittance_exceptions`:
   - `id` (UUID, PK)
   - `batch_id` (UUID, FK -> edi_835_remittance_batches, ON DELETE CASCADE)
   - `claim_payment_id` (UUID REFERENCES public.edi_835_claim_payments ON DELETE SET NULL)
   - `facility_id` (UUID, FK -> facilities)
   - `exception_type` (VARCHAR(64) NOT NULL) -- UNMATCHED_CLAIM, BPR_OUT_OF_BALANCE, CARC_DENIAL_ACTION, PLB_UNAPPLIED
   - `severity` (VARCHAR(16) NOT NULL DEFAULT 'ERROR' CHECK IN ('WARNING', 'ERROR', 'FATAL'))
   - `error_message` (TEXT NOT NULL)
   - `resolution_status` (VARCHAR(24) NOT NULL DEFAULT 'OPEN' CHECK IN ('OPEN', 'RESOLVED', 'DISCARDED'))
   - `resolved_by` (UUID REFERENCES auth.users)
   - `resolved_at` (TIMESTAMPTZ)
   - `resolution_action` (VARCHAR(64))
   - `created_at` (TIMESTAMPTZ DEFAULT NOW())

5. Rollup Views:
   - `public.vw_edi_835_batch_summary`: Batch metrics, check amounts, posted totals, auto-post rates.
   - `public.vw_edi_835_exceptions_queue`: Open remittance exceptions with at-risk AR amounts.

## Business Rules
1. **Mathematical Balancing Rules**:
   - Check balancing: `total_payment_amount == SUM(total_claim_paid_amount) + SUM(provider_level_adjustments)`. Variance > $0.05 raises `BPR_OUT_OF_BALANCE` FATAL exception.
   - Claim balancing: `total_claim_charge_amount == total_claim_paid_amount + contractual_adjustment_amount + patient_responsibility_amount`.
   - Line balancing: `line_charge_amount == line_paid_amount + SUM(carc_amount)`.
2. **Deterministic Matching Hierarchy**:
   - Tier 1 (100% Exact Match): `patient_control_number` strictly equals `claims.patient_control_number`.
   - Tier 2 (90% Probable Match): Patient Name + DOS + Billed Charge matches.
   - Tier 3 (< 90% Confidence): Staged as `UNMATCHED` and routed to Remittance Exception Queue.
3. **Lifecycle Status Transitions**:
   - When 835 claim payment is matched and balanced:
     - If `claim_status_code == '1'` and `patient_responsibility_amount == 0`: Transition claim to `PAID_FULL`.
     - If `claim_status_code == '1'` and `patient_responsibility_amount > 0`: Transition claim to `PATIENT_BALANCE_DUE`.
     - If `claim_status_code == '4'` or paid amount == $0: Transition claim to `CLAIM_DENIED`.
4. **Prohibited Behaviors**:
   - Prohibit posting unverified or unbalanced 835 transactions directly to general ledger without balancing audit trail.
   - Prohibit deleting ingested remittance files; use cancellation or reversal flags (`CLP02 == '22'`).

## Permissions / Security
- `rcm.view_remittances`: Viewer, Analyst, Biller, CFO, Super Admin.
- `rcm.ingest_835_era`: Biller, Revenue Cycle Specialist, CFO, Super Admin.
- `rcm.remediate_835_exception`: Biller, Revenue Cycle Lead, CFO, Super Admin.
- `rcm.override_remittance_balance`: CFO, Super Admin only.
- AI telemetry must obey tenant-isolation via `public.get_auth_user_facilities()`.

## API / Service Requirements
- `edi835RemittanceService.parseEdi835Content(rawText)`: Parses X12 835 transaction text into envelope, BPR, TRN, CLP claims, SVC lines, and CAS adjustments.
- `edi835RemittanceService.validateRemittanceBalancing(batch, claimPayments)`: Verifies check-level and line-level balance sums.
- `edi835RemittanceService.matchPaymentsAgainstClaims(claimPayments, activeClaims)`: Executes 3-tier deterministic claim matching.
- `edi835RemittanceService.calculateRemittanceKpis(batches, claimPayments, exceptions)`: Computes executive KPI cards.
- `edi835RemittanceService.getBaselineSampleData()`: Provides rich baseline mock data for dev, test, and live UI simulation.

## UI / Workflow Requirements
- **Executive KPI Banner (4 Cards)**:
  1. Total Remittance Deposited ($)
  2. Auto-Post Match Rate (%)
  3. Adjudicated Paid Claims Count
  4. Open Remittance Exceptions & Unapplied Funds ($)
- **Top Actions**:
  - `Simulate 835 Ingestion`: Ingests and parses sample X12 835 file, runs automatic matching, and updates live UI state.
  - `Export Summary CSV`: Exports remittance batch and check ledger to standard CSV.
- **4 Tab Layout**:
  1. `batches`: Ingestion Batches & Checks (Check #, Method, Payer, Total Deposited, Matched Count, Status, Inspect).
  2. `claims`: Claim Payments & Adjudication (Patient Control #, Patient & Member ID, Payer, Charge, Paid, PR, Match Confidence, Inspect).
  3. `lines`: Line-Level Remittance & CARC Splits (CPT, Rev Code, Charge, Paid, CARC Code e.g. CO-45, Patient Deductible/Coinsurance).
  4. `exceptions`: Remittance Exceptions & Unapplied Cash Queue (Remediation modal allowing manual linking to active claim).
- **Responsive Table**:
  - Encapsulated in `<div className="table-responsive">` with `min-width: 1100px`.
  - Scoped CSS classes `.edi835-*` to ensure zero CSS bleed.
  - Strict Maestro Clinical Design System palette compliance (Zero purple tokens).

## Audit / Provenance
- Retain `file_hash_sha256`, `check_eft_trace_number`, `payer_identifier`, and `ingested_at` for every 835 batch.
- Retain `resolved_by`, `resolved_at`, and `resolution_action` for every exception resolution.
- All balance modifications logged into immutable audit history.

## QA / Test Cases
- Minimum 20 unit and integration tests in `tests/edi835-remittance.test.js`:
  1. Status constants & domain enums verification.
  2. ANSI X12 835 parser verification (BPR, TRN, CLP, SVC, CAS, PLB).
  3. Check and line-level mathematical balance validation.
  4. 3-tier claim matching engine (100% exact, 90% probable, unmatched).
  5. Executive KPI metrics calculation.
  6. Migration `056_edi_835_remittance.sql` DDL, views, and RLS integrity.
  7. Migration `056_edi_835_remittance_down.sql` rollback verification.
  8. Zero purple tokens in `Edi835RemittanceView.css`.
  9. App.jsx navigation and routing wiring.

## Acceptance Criteria
- Build passes (`npm run build`).
- All tests pass (`node --test tests/edi835-remittance.test.js`).
- No mock/placeholder numbers presented as production truth.
- Multi-tenancy RLS verified.
- P0/P1 issues block release.

## Dependencies
- Upstream: Phase 80 (`claims`, `claim_lines`), Phase 81 (`edi_837_staged_claims`).
- Migrations: `054_claims_model.sql`, `055_edi_837_ingestion.sql`.

## Definition of Done
Complete when specification, database schema, client service layer, re-export, Maestro Clinical UI, App.jsx integration, test suite, and clean production build are verified.

## Implementation Notes
- Created `82_835_REMITTANCE_INGESTION.md` covering all 15 required sections.
- Deployed migrations `056_edi_835_remittance.sql` and `056_edi_835_remittance_down.sql`.
- Built service layer `src/lib/edi835RemittanceService.js` and re-export `src/services/edi835RemittanceService.js`.
- Built UI component `src/components/Edi835RemittanceView.jsx` and `src/components/Edi835RemittanceView.css`.
- Wired into `src/App.jsx` under `Revenue Cycle (RCM)`.
- Implemented and verified test suite `tests/edi835-remittance.test.js`.
