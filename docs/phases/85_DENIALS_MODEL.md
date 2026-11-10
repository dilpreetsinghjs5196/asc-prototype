# 85 DENIALS MODEL

## Purpose
Production specification for the Ambulatory Surgery Center (ASC) Denial Management Engine: comprehensive tracking of denial categories, financial exposure, clinical vs. technical root causes, deterministic recovery probability scoring, payer appeal deadlines, team ownership assignments, and multi-tier appeal lifecycles.

## Scope
- Define authoritative data structures and state machines for ASC claim denials and itemized line adjudications.
- Establish deterministic root-cause classification across clinical (Medical Necessity, Pre-Auth) and technical/administrative (Coding, Modifiers, Timely Filing, Eligibility, COB) categories.
- Automate payer appeal deadline calculation (`denial_date + filing_deadline_days`) and dynamic urgency-tier classification (`CRITICAL_OVERDUE`, `URGENT_UNDER_15_DAYS`, `APPROACHING_30_DAYS`, `ON_TRACK`).
- Implement deterministic recovery probability scoring (0%–100%) and expected dollar recovery calculations (`expected_recovery_amount = denied_amount * (recovery_probability_pct / 100)`).
- Enforce team ownership routing (`CLINICAL_APPEALS`, `BILLING_AND_CODING`, `PATIENT_ACCESS`, `MANAGED_CARE_CONTRACTING`) and multi-level appeal tracking (Level 1 Reconsideration, Level 2 Formal Appeal, Level 3 External/ALJ Review).
- Preserve architectural compatibility with upstream modules: Phase 80 (`claims`), Phase 81 (`edi_837_staged_claims`), Phase 82 (`edi_835_claim_payments`), Phase 83 (`rcm_payment_transactions`), and Phase 84 (`rcm_carc_master`, `rcm_rarc_master`).
- Enforce organization/facility tenancy, audit trails, and strict Maestro Clinical Design System governance (zero purple/violet/indigo/magenta/fuchsia tokens).

## Current State
- **Phase 80 (Claims Model & Lifecycle)**: Established canonical claim structure, claim lines, and high-level claim statuses (`054_claims_model.sql`).
- **Phase 81 (837 Claim Ingestion)**: Inbound ANSI X12 837 claim parser and case matcher (`055_edi_837_ingestion.sql`).
- **Phase 82 (835 Remittance Ingestion)**: ERA remittance advice parser capturing CAS claim adjustment segments and basic CARC strings (`056_edi_835_remittance.sql`).
- **Phase 83 (Payments & Adjustments)**: Double-entry cash ledger and payment transactions recording raw `carc_code` text on adjustments (`057_rcm_payments_adjustments.sql`).
- **Phase 84 (CARC / RARC Model)**: Master registries for CARC and RARC codes, combinatorial interpretation engine, and baseline denial queue (`058_carc_rarc_model.sql`).
- **Phase 85 (Denials Model)**:
  - Repository currently lacks dedicated denial tracking and appeal lifecycle tables: **MISSING**.
  - Dynamic deadline tracking engine with days-to-deadline calculation and urgency tiering: **MISSING**.
  - Team ownership queues and specialist assignment workflow: **MISSING**.
  - Interactive Denials Command Center UI with 4-KPI ribbon, filterable queues, and appeal action modals: **MISSING**.

| Component | Classification | Description |
|-----------|----------------|-------------|
| Database Schema (059_denials_model.sql) | **MISSING** | Denial header, audit events, analytical views, RLS policies |
| Down Migration (059_denials_model_down.sql) | **MISSING** | Reversible migration teardown in reverse dependency order |
| Service Layer (src/lib/denialsService.js) | **MISSING** | Core calculations, recoverability, probability scoring, deadline tiers, sample data |
| Dual Re-export (src/services/denialsService.js) | **MISSING** | Standardized backward-compatible re-export module |
| UI Component (DenialsModelView.jsx & CSS) | **MISSING** | Maestro Clinical 4-KPI ribbon, 4-tab workbench, deadline urgency badges, action modals |
| App Wiring (src/App.jsx & Sidebar) | **MISSING** | Sidebar navigation, header title/subtitle, tab render block |
| Test Suite (tests/denials-model.test.js) | **MISSING** | Multi-level automated unit, financial, and integration tests |

## Target State
1. **Centralized Denial Ledger (`rcm_denials`)**:
   - Every denied claim or claim line generates a formal, auditable denial record with unique `denial_control_number`.
   - Links directly to `facility_id`, `claim_id`, `claim_line_id`, and `payer_id`.
   - Records CARC, RARC, and Group Code alongside classified `denial_category` and `denial_type` (`CLINICAL`, `TECHNICAL`, `ADMINISTRATIVE`).
2. **Deterministic Financial & Recoverability Scoring**:
   - `denied_amount`: Face dollar value withheld by payer.
   - `expected_amount`: Original expected reimbursement from fee schedule / payer contract.
   - `is_recoverable`: Deterministic boolean flag based on category (e.g. Timely Filing = false, Prior Auth = true with authorization retroactive proof).
   - `recovery_probability_pct`: Statistically calibrated percentage (e.g., Coding unbundling = 85%, Prior Auth = 70%, Timely Filing = 10%).
   - `expected_recovery_amount`: Generated column calculating `ROUND((denied_amount * recovery_probability_pct / 100.0), 2)`.
   - `recovered_amount`: Overturned dollars collected through appeal or rebill.
3. **Payer Appeal Deadlines & Urgency Tiering**:
   - `denial_date`: Remittance date or receipt date.
   - `filing_deadline_days`: Payer-specific statutory filing window (Medicare = 120 days, Commercial = 60-180 days, Medicaid MCO = 90 days).
   - `appeal_deadline_date`: Calculated as `denial_date + filing_deadline_days`.
   - `days_to_deadline`: Real-time calendar difference (`appeal_deadline_date - CURRENT_DATE`).
   - Dynamic urgency tiers:
     - `CRITICAL_OVERDUE` (`days_to_deadline < 0`): Missed filing deadline; write-off candidate.
     - `URGENT_UNDER_15_DAYS` (`0 <= days_to_deadline <= 14`): High priority appeal; immediate intervention required.
     - `APPROACHING_30_DAYS` (`15 <= days_to_deadline <= 30`): Standard queue priority.
     - `ON_TRACK` (`days_to_deadline > 30`): Low immediate risk.
4. **Team Ownership & Workflow Assignment**:
   - Dedicated functional queues:
     - `CLINICAL_APPEALS`: Operative report review, medical necessity narratives, peer-to-peer coordination.
     - `BILLING_AND_CODING`: Modifier corrections (59, 51, RT/LT), unbundling rebill, NCCI fixes.
     - `PATIENT_ACCESS`: Member ID corrections, coordination of benefits, transfer to patient statement.
     - `MANAGED_CARE_CONTRACTING`: Fee schedule disputes, implant carve-out underpayments.
   - Assigned specialist user ID and timestamp.
5. **Multi-Level Appeal Lifecycle State Machine**:
   - `IDENTIFIED` -> `TRIAGED` -> `IN_PROGRESS` -> `ADDITIONAL_INFO_REQUESTED` -> `APPEALED_LEVEL_1` -> `APPEALED_LEVEL_2` -> `REBILLED` -> `OVERTURNED_PAID` -> `UPHELD_FINAL` -> `WRITTEN_OFF`.
   - Complete event ledger (`rcm_denial_events`) logging state transitions, notes, and submitter credentials.

## Data Model / Schema
Required tables in `supabase/migrations/059_denials_model.sql`:

### 1. `public.rcm_denials`
- `id` (UUID, PRIMARY KEY DEFAULT gen_random_uuid())
- `facility_id` (UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE)
- `claim_id` (UUID NOT NULL REFERENCES public.claims(id) ON DELETE RESTRICT)
- `claim_line_id` (UUID REFERENCES public.claim_lines(id) ON DELETE SET NULL)
- `payer_id` (UUID REFERENCES public.payers(id) ON DELETE RESTRICT)
- `denial_control_number` (VARCHAR(64) NOT NULL UNIQUE)
- `carc_code` (VARCHAR(16) NOT NULL)
- `rarc_code` (VARCHAR(16))
- `group_code` (VARCHAR(4) NOT NULL DEFAULT 'CO' CHECK (group_code IN ('CO', 'PR', 'OA', 'PI', 'CR')))
- `denial_category` (VARCHAR(40) NOT NULL CHECK (denial_category IN (
    'PRE_AUTH_ABSENT_EXPIRED', 'MEDICAL_NECESSITY_LCD', 'CODING_MODIFIER_UNBUNDLED',
    'TIMELY_FILING_EXCEEDED', 'ELIGIBILITY_TERMINATED', 'COB_PRIMARY_EOB_MISSING',
    'DUPLICATE_CLAIM_SERVICE', 'NON_COVERED_PROCEDURE', 'CREDENTIALING_BILLING_NPI',
    'OTHER_ADMINISTRATIVE'
  )))
- `denial_type` (VARCHAR(20) NOT NULL DEFAULT 'TECHNICAL' CHECK (denial_type IN ('CLINICAL', 'TECHNICAL', 'ADMINISTRATIVE')))
- `denied_amount` (NUMERIC(14,2) NOT NULL CHECK (denied_amount >= 0))
- `billed_amount` (NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (billed_amount >= 0))
- `expected_amount` (NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (expected_amount >= 0))
- `is_recoverable` (BOOLEAN NOT NULL DEFAULT TRUE)
- `recovery_probability_pct` (NUMERIC(5,2) NOT NULL DEFAULT 50.00 CHECK (recovery_probability_pct BETWEEN 0 AND 100))
- `expected_recovery_amount` (NUMERIC(14,2) GENERATED ALWAYS AS (ROUND((denied_amount * recovery_probability_pct / 100.0), 2)) STORED)
- `recovered_amount` (NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (recovered_amount >= 0))
- `written_off_amount` (NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (written_off_amount >= 0))
- `denial_date` (DATE NOT NULL DEFAULT CURRENT_DATE)
- `filing_deadline_days` (INT NOT NULL DEFAULT 90 CHECK (filing_deadline_days > 0))
- `appeal_deadline_date` (DATE NOT NULL)
- `assigned_team` (VARCHAR(32) NOT NULL DEFAULT 'BILLING_AND_CODING' CHECK (assigned_team IN (
    'CLINICAL_APPEALS', 'BILLING_AND_CODING', 'PATIENT_ACCESS', 'MANAGED_CARE_CONTRACTING'
  )))
- `assigned_user_id` (UUID REFERENCES auth.users(id))
- `assigned_at` (TIMESTAMPTZ)
- `status` (VARCHAR(32) NOT NULL DEFAULT 'IDENTIFIED' CHECK (status IN (
    'IDENTIFIED', 'TRIAGED', 'IN_PROGRESS', 'ADDITIONAL_INFO_REQUESTED',
    'APPEALED_LEVEL_1', 'APPEALED_LEVEL_2', 'REBILLED',
    'OVERTURNED_PAID', 'UPHELD_FINAL', 'WRITTEN_OFF'
  )))
- `current_appeal_level` (INT NOT NULL DEFAULT 0 CHECK (current_appeal_level BETWEEN 0 AND 3))
- `notes` (TEXT)
- `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
- `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())

### 2. `public.rcm_denial_events`
- `id` (UUID, PRIMARY KEY DEFAULT gen_random_uuid())
- `facility_id` (UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE)
- `denial_id` (UUID NOT NULL REFERENCES public.rcm_denials(id) ON DELETE CASCADE)
- `event_type` (VARCHAR(40) NOT NULL CHECK (event_type IN (
    'CREATED', 'STATUS_CHANGED', 'ASSIGNED', 'APPEAL_SUBMITTED',
    'REBILL_SUBMITTED', 'INFO_REQUESTED', 'OVERTURNED', 'UPHELD', 'WRITTEN_OFF'
  )))
- `from_status` (VARCHAR(32))
- `to_status` (VARCHAR(32))
- `action_by` (UUID REFERENCES auth.users(id))
- `notes` (TEXT)
- `metadata` (JSONB DEFAULT '{}'::jsonb)
- `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())

### 3. Views
- `public.vw_rcm_denials_aging_and_deadlines`:
  Calculates real-time `days_to_deadline`, dynamic urgency tier, claim number, patient MRN, and payer name.
- `public.vw_rcm_denials_by_root_cause_kpi`:
  Aggregates total denials, denied dollars, expected recovery dollars, actual recovered dollars, and overturn rate per root-cause category.

## Business Rules
1. **Financial Integrity**:
   - `denied_amount` must always be `>= 0`.
   - `recovered_amount + written_off_amount` must not exceed `denied_amount` unless interest is explicitly itemized.
   - `expected_recovery_amount` is deterministically computed server-side via SQL generated column.
2. **Deadline Calculation**:
   - `appeal_deadline_date` is strictly computed as `denial_date + (filing_deadline_days * INTERVAL '1 day')`.
   - If `CURRENT_DATE > appeal_deadline_date`, urgency is automatically classified as `CRITICAL_OVERDUE`.
3. **State Machine Transitions**:
   - A denial cannot be marked `OVERTURNED_PAID` without entering `recovered_amount > 0`.
   - A denial cannot be marked `WRITTEN_OFF` without entering `written_off_amount > 0` and requiring administrative role authorization.
   - Moving to `APPEALED_LEVEL_1` automatically increments `current_appeal_level` to 1.
4. **Tenancy**:
   - Every read and write query must filter by `facility_id IN (SELECT public.get_auth_user_facilities())`.

## Permissions / Security
| Action | Permitted Roles | Permission Key |
|--------|-----------------|----------------|
| View Denials & Deadlines | Super Admin, Org Admin, Facility Admin, CFO, Biller, Coder, Viewer | `rcm.view_denials` |
| Triage & Reassign Queue | Super Admin, Org Admin, Facility Admin, CFO, Biller, Coder | `rcm.triage_denials` |
| Submit Appeal / Rebill | Super Admin, Org Admin, Facility Admin, Biller, Coder | `rcm.execute_appeals` |
| Authorize Write-off | Super Admin, Org Admin, Facility Admin, CFO | `rcm.authorize_writeoff` |
| Export Denials Scorecard | Super Admin, Org Admin, Facility Admin, CFO, Biller | `rcm.export_reports` |

## API / Service Requirements
- `getBaselineDenials()`: Returns baseline denial entries for local demonstration.
- `calculateDenialKpis(denials)`: Computes Total Denied Exposure, Appealable Opportunity, High-Urgency Deadlines, and Overall Overturn Rate.
- `updateDenialStatus(denialId, newStatus, meta)`: Authoritative status transition handler with validation.
- `reassignDenialOwnership(denialId, newTeam, newUserId)`: Updates functional queue routing.
- `filterDenials(denials, filters)`: Multi-dimensional filtering by category, team, urgency, status, and search string.

## UI / Workflow Requirements
- **Container**: Maestro Clinical Command Center wrapped in `#0b1120` canvas with `#f8fafc` typography.
- **4-Card KPI Ribbon**:
  - Total Denied Exposure ($)
  - Expected Recoverable Opportunity ($)
  - Critical Deadlines (< 15 Days)
  - Net Overturn Rate (%)
- **4 Interactive Workbenches**:
  1. *Actionable Denials Queue*: Itemized list of open denials with deadline countdown badges, root-cause tags, and one-click appeal triggers.
  2. *Deadline & Aging Matrix*: Grouped by urgency tier (`CRITICAL_OVERDUE`, `URGENT_UNDER_15_DAYS`, `APPROACHING_30_DAYS`, `ON_TRACK`).
  3. *Functional Team Queues*: Breakdown by `CLINICAL_APPEALS`, `BILLING_AND_CODING`, `PATIENT_ACCESS`, and `MANAGED_CARE_CONTRACTING`.
  4. *Denial Root Cause Analytics*: Financial breakdown and recovery rates per root-cause category.
- **Action Modals**:
  - Appeal Initiation Modal (submit appeal reference, set level, upload rationale).
  - Ownership Reassignment Modal.
  - Write-off Authorization Modal.

## Audit / Provenance
- Every status change, assignment, and note creates an immutable row in `rcm_denial_events`.
- Tracks `action_by`, timestamp, previous status, new status, and JSONB metadata.

## QA / Test Cases
- Test 1: Denial entity definition & status validation.
- Test 2: Deterministic expected recovery calculation.
- Test 3: Deadline urgency classification based on date math.
- Test 4: Functional team routing & ownership assignment.
- Test 5: Executive KPI aggregation accuracy.
- Test 6: SQL migration idempotency, RLS, and policy drop/create parity.
- Test 7: Maestro Clinical Design System token compliance (zero purple tokens).
- Test 8: App wiring and route integration.

## Acceptance Criteria
- [x] Master specification authored with complete production requirements.
- [x] Database migration `059_denials_model.sql` and rollback `059_denials_model_down.sql` created.
- [x] Service engine `src/lib/denialsService.js` and dual export `src/services/denialsService.js` implemented.
- [x] UI component `DenialsModelView.jsx` and `DenialsModelView.css` built with Maestro Clinical tokens.
- [x] Application wired into `src/App.jsx` under `REVENUE CYCLE (RCM)`.
- [x] Automated test suite `tests/denials-model.test.js` passes 100%.
- [x] Production build `npm run build` succeeds with zero errors.

## Dependencies
- Phase 80: `claims`, `claim_lines`
- Phase 82: `edi_835_claim_payments`
- Phase 84: `rcm_carc_master`, `rcm_rarc_master`

## Definition of Done
Complete production delivery including schema migration, rollback script, deterministic business logic, UI workbench, test suite, and clean production build.

## Implementation Notes
- Migration: `supabase/migrations/059_denials_model.sql`
- Rollback: `supabase/migrations/059_denials_model_down.sql`
- Service: `src/lib/denialsService.js` & `src/services/denialsService.js`
- UI: `src/components/DenialsModelView.jsx` & `src/components/DenialsModelView.css`
- App: Registered tab `denials_model` in `src/App.jsx`
- Tests: `tests/denials-model.test.js`
