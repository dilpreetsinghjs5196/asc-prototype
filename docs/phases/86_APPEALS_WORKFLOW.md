# 86 APPEALS WORKFLOW

## Purpose
Production specification for the Ambulatory Surgery Center (ASC) Appeals Workflow and Dispute Management Engine: end-to-end orchestration of multi-level payer appeals (Level 1 Reconsideration, Level 2 Formal Administrative Review, Level 3 External/ALJ Review), clinical and billing evidence packet compilation, carrier submission tracking, statutory payer turnaround deadlines, and outcome analytics with financial settlement reconciliation.

## Scope
- Define authoritative data structures and state machines for ASC claim appeal cases (`rcm_appeals`), clinical/billing evidence attachments (`rcm_appeal_evidence`), and immutable audit events (`rcm_appeal_events`).
- Support multi-tier statutory appeal levels:
  - Level 1: Reconsideration / Informal Claim Review
  - Level 2: Formal Administrative Payer Appeal / Independent Medical Review
  - Level 3: External Review / Administrative Law Judge (ALJ) Hearing
- Standardize evidence packet assembly across clinical documentation (`OPERATIVE_NOTE`, `LETTER_OF_MEDICAL_NECESSITY`, `PRIOR_AUTH_DOCUMENT`, `PEER_REVIEW_RATIONALE`, `CLINICAL_CHART_NOTES`) and technical billing proof (`NCCI_UNBUNDLING_PROOF`, `PROOF_OF_TIMELY_FILING`, `PRIMARY_PAYER_EOB`).
- Track submission channels (`PAYER_PORTAL_API`, `CLEARINGHOUSE_ELECTRONIC_275`, `CERTIFIED_MAIL`, `SECURE_FAX`) with confirmation trace IDs.
- Automate payer response due dates based on statutory turnaround windows (Medicare = 60 days, Commercial = 30-45 days, Expedited Clinical = 72 hours) and flag response overdues.
- Reconcile appeal outcomes (`OVERTURNED_FULL`, `OVERTURNED_PARTIAL`, `UPHELD_DENIED`, `WITHDRAWN`) with expected vs actual financial recovery.
- Preserve integration with upstream modules: Phase 80 (`claims`), Phase 82 (`edi_835_claim_payments`), Phase 84 (`rcm_carc_master`), and Phase 85 (`rcm_denials`).
- Enforce organization/facility tenancy, audit trails, and strict Maestro Clinical Design System governance (zero purple/violet/indigo/magenta/fuchsia tokens).

## Current State
- **Phase 80 (Claims Model & Lifecycle)**: Established claim headers, claim lines, and baseline AR ledger (`054_claims_model.sql`).
- **Phase 84 (CARC / RARC Model)**: Reason code registries and combinatorial interpretation engine (`058_carc_rarc_model.sql`).
- **Phase 85 (Denials Model)**: Denial classification, deadline countdown, urgency tiering, and team ownership queues (`059_denials_model.sql`).
- **Phase 86 (Appeals Workflow)**:
  - Repository currently lacks structured multi-level appeal cases and evidence compilation tables: **MISSING**.
  - Payer response turnaround tracking and overdue alerts: **MISSING**.
  - Structured evidence packet checklist with verification status: **MISSING**.
  - Interactive Appeals Workflow Workbench with 4-KPI ribbon, submission wizard, and outcome settlement recording: **MISSING**.

| Component | Classification | Description |
|-----------|----------------|-------------|
| Database Schema (060_appeals_workflow.sql) | **MISSING** | Appeal cases, evidence attachments, event audit ledger, views, RLS |
| Down Migration (060_appeals_workflow_down.sql) | **MISSING** | Reversible migration teardown in reverse dependency order |
| Service Layer (src/lib/appealsService.js) | **MISSING** | Appeal levels, evidence checklists, turnaround date math, outcome reconciliation |
| Dual Re-export (src/services/appealsService.js) | **MISSING** | Standardized backward-compatible re-export module |
| UI Component (AppealsWorkflowView.jsx & CSS) | **MISSING** | Maestro Clinical 4-KPI ribbon, 4-tab workbench, evidence inspector, action modals |
| App Wiring (src/App.jsx & Sidebar) | **MISSING** | Sidebar navigation, header title/subtitle, tab render block |
| Test Suite (tests/appeals-workflow.test.js) | **MISSING** | Multi-level automated unit, financial, evidence, and integration tests |

## Target State
1. **Centralized Appeal Case Ledger (`rcm_appeals`)**:
   - Every appeal is tracked with a unique `appeal_control_number` (e.g. `APL-2026-0012`).
   - Foreign key linkage to `denial_id` (`rcm_denials`), `claim_id` (`claims`), `facility_id`, and `payer_id`.
   - Distinct classification of `appeal_level` (`LEVEL_1_RECONSIDERATION`, `LEVEL_2_FORMAL_APPEAL`, `LEVEL_3_EXTERNAL_ALJ`).
2. **Clinical & Billing Evidence Packet Compilation (`rcm_appeal_evidence`)**:
   - Structured checklist tracking all required exhibits:
     - `OPERATIVE_NOTE`: Surgeon operative narrative with procedure description.
     - `LETTER_OF_MEDICAL_NECESSITY`: Physician rationale detailing patient failed conservative therapy.
     - `PRIOR_AUTH_DOCUMENT`: Pre-authorization reference or retroactive approval cert.
     - `NCCI_UNBUNDLING_PROOF`: Procedural modifier justification (e.g. modifier 59/RT/LT).
     - `PROOF_OF_TIMELY_FILING`: Clearinghouse 999/277CA acceptance timestamps.
     - `PRIMARY_PAYER_EOB`: Coordination of benefits remittance voucher.
   - Verification flag (`is_verified`) and verification specialist audit.
3. **Submission Tracking & Statutory Payer Turnaround**:
   - Tracks `submission_channel` (`PAYER_PORTAL_API`, `CLEARINGHOUSE_ELECTRONIC_275`, `CERTIFIED_MAIL`, `SECURE_FAX`).
   - Carrier tracking number / confirmation trace ID (`carrier_tracking_number`).
   - Automatic computation of `payer_response_due_date` (`submission_date + turnaround_window_days`).
   - Real-time response tracking: `AWAITING_PAYER_RESPONSE`, `RESPONSE_OVERDUE`, `PAYER_RESPONDED`.
4. **Outcome Reconciliation & Financial Recovery**:
   - `appealed_amount`: Face dollar value disputed.
   - `recovered_amount`: Overturned settlement amount received.
   - `recovery_rate_pct`: Calculated as `ROUND((recovered_amount / appealed_amount) * 100, 2)`.
   - Outcome classification: `OVERTURNED_FULL`, `OVERTURNED_PARTIAL`, `UPHELD_DENIED`, `WITHDRAWN`.
   - Next-step routing: If `UPHELD_DENIED`, automatically flag candidate for Level 2 or Level 3 escalation.
5. **Interactive Appeals Workbench UI**:
   - Active Appeals Queue with urgency badges and overdue indicators.
   - Evidence Compilation Workbench with upload/verification status.
   - Payer Turnaround & Aging Matrix grouped by response window.
   - Overturn & Settlement Analytics broken down by payer and appeal level.

## Data Model / Schema
Required tables in `supabase/migrations/060_appeals_workflow.sql`:

### 1. `public.rcm_appeals`
- `id` (UUID, PRIMARY KEY DEFAULT gen_random_uuid())
- `facility_id` (UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE)
- `denial_id` (UUID NOT NULL REFERENCES public.rcm_denials(id) ON DELETE CASCADE)
- `claim_id` (UUID NOT NULL REFERENCES public.claims(id) ON DELETE RESTRICT)
- `payer_id` (UUID REFERENCES public.payers(id) ON DELETE RESTRICT)
- `appeal_control_number` (VARCHAR(64) NOT NULL UNIQUE)
- `appeal_level` (VARCHAR(32) NOT NULL DEFAULT 'LEVEL_1_RECONSIDERATION' CHECK (appeal_level IN (
    'LEVEL_1_RECONSIDERATION',
    'LEVEL_2_FORMAL_APPEAL',
    'LEVEL_3_EXTERNAL_ALJ'
  )))
- `status` (VARCHAR(32) NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
    'DRAFT',
    'EVIDENCE_GATHERING',
    'READY_FOR_SUBMISSION',
    'SUBMITTED',
    'IN_PAYER_REVIEW',
    'ADDITIONAL_INFO_REQUESTED',
    'OVERTURNED_FULL',
    'OVERTURNED_PARTIAL',
    'UPHELD_DENIED',
    'WITHDRAWN'
  )))
- `appealed_amount` (NUMERIC(14,2) NOT NULL CHECK (appealed_amount >= 0))
- `recovered_amount` (NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (recovered_amount >= 0))
- `submission_channel` (VARCHAR(32) NOT NULL DEFAULT 'PAYER_PORTAL_API' CHECK (submission_channel IN (
    'PAYER_PORTAL_API',
    'CLEARINGHOUSE_ELECTRONIC_275',
    'CERTIFIED_MAIL',
    'SECURE_FAX'
  )))
- `carrier_tracking_number` (VARCHAR(128))
- `submission_date` (DATE)
- `statutory_turnaround_days` (INT NOT NULL DEFAULT 45 CHECK (statutory_turnaround_days > 0))
- `payer_response_due_date` (DATE)
- `actual_response_date` (DATE)
- `assigned_specialist_id` (UUID REFERENCES auth.users(id))
- `clinical_rationale` (TEXT)
- `outcome_notes` (TEXT)
- `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
- `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())

### 2. `public.rcm_appeal_evidence`
- `id` (UUID, PRIMARY KEY DEFAULT gen_random_uuid())
- `facility_id` (UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE)
- `appeal_id` (UUID NOT NULL REFERENCES public.rcm_appeals(id) ON DELETE CASCADE)
- `document_type` (VARCHAR(40) NOT NULL CHECK (document_type IN (
    'OPERATIVE_NOTE',
    'LETTER_OF_MEDICAL_NECESSITY',
    'PRIOR_AUTH_DOCUMENT',
    'PEER_REVIEW_RATIONALE',
    'CLINICAL_CHART_NOTES',
    'NCCI_UNBUNDLING_PROOF',
    'PROOF_OF_TIMELY_FILING',
    'PRIMARY_PAYER_EOB',
    'OTHER_CLINICAL_EXHIBIT'
  )))
- `title` (VARCHAR(200) NOT NULL)
- `file_url` (TEXT)
- `file_hash` (VARCHAR(64))
- `is_verified` (BOOLEAN NOT NULL DEFAULT FALSE)
- `verified_by` (UUID REFERENCES auth.users(id))
- `verified_at` (TIMESTAMPTZ)
- `notes` (TEXT)
- `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())

### 3. `public.rcm_appeal_events`
- `id` (UUID, PRIMARY KEY DEFAULT gen_random_uuid())
- `facility_id` (UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE)
- `appeal_id` (UUID NOT NULL REFERENCES public.rcm_appeals(id) ON DELETE CASCADE)
- `event_type` (VARCHAR(40) NOT NULL CHECK (event_type IN (
    'CREATED',
    'EVIDENCE_ATTACHED',
    'EVIDENCE_VERIFIED',
    'SUBMITTED_TO_PAYER',
    'PAYER_ACKNOWLEDGED',
    'PAYER_INFO_REQUESTED',
    'OUTCOME_OVERTURNED',
    'OUTCOME_UPHELD',
    'ESCALATED_NEXT_LEVEL',
    'WITHDRAWN'
  )))
- `from_status` (VARCHAR(32))
- `to_status` (VARCHAR(32))
- `action_by` (UUID REFERENCES auth.users(id))
- `notes` (TEXT)
- `metadata` (JSONB DEFAULT '{}'::jsonb)
- `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())

### 4. Analytical Views
- `public.vw_rcm_active_appeals_queue`: Real-time active appeals with patient name, claim number, payer name, days awaiting response, and overdue indicator.
- `public.vw_rcm_appeals_settlement_analytics`: Overturn rate, recovery percentage, and total dollars won per payer and appeal level.

## Business Rules
1. **Financial Settlement Integrity**:
   - `recovered_amount` cannot exceed `appealed_amount` without specific interest/penalty documentation.
   - Marking an appeal `OVERTURNED_FULL` requires setting `recovered_amount = appealed_amount`.
2. **Evidence Gate**:
   - An appeal cannot transition from `DRAFT` to `SUBMITTED` without at least one verified evidence exhibit (`rcm_appeal_evidence` row where `is_verified = TRUE`).
3. **Turnaround Math**:
   - `payer_response_due_date` is computed as `submission_date + (statutory_turnaround_days * INTERVAL '1 day')`.
   - If `CURRENT_DATE > payer_response_due_date` and `status = 'SUBMITTED'`, response is flagged as `RESPONSE_OVERDUE`.
4. **Tenancy**:
   - Every read and write query must filter by `facility_id IN (SELECT public.get_auth_user_facilities())`.

## Permissions / Security
| Action | Permitted Roles | Permission Key |
|--------|-----------------|----------------|
| View Appeals & Evidence | Super Admin, Org Admin, Facility Admin, CFO, Biller, Coder, Viewer | `rcm.view_appeals` |
| Draft Appeal & Attach Exhibits | Super Admin, Org Admin, Facility Admin, Biller, Coder | `rcm.draft_appeals` |
| Verify Clinical Evidence | Super Admin, Org Admin, Facility Admin, Biller, Coder | `rcm.verify_evidence` |
| Submit Payer Appeal | Super Admin, Org Admin, Facility Admin, Biller, Coder | `rcm.submit_appeals` |
| Authorize Settlement / Overturn | Super Admin, Org Admin, Facility Admin, CFO | `rcm.settle_appeals` |
| Export Appeals Reports | Super Admin, Org Admin, Facility Admin, CFO, Biller | `rcm.export_reports` |

## API / Service Requirements
- `getBaselineAppeals()`: Returns baseline representative appeal cases.
- `calculateAppealKpis(appeals)`: Computes Total Dollars Under Dispute, Total Overturned Recovered, Active In-Flight Cases, and Overturn Yield %.
- `calculateTurnaroundDaysRemaining(dueDate, currentDate)`: Computes calendar days remaining for payer response.
- `submitAppealPackage(appealId, submissionMeta)`: Validates evidence gate, updates status to `SUBMITTED`, logs event.
- `recordAppealOutcome(appealId, outcome, recoveredAmount, notes)`: Records settlement, sets status, updates linked denial.

## UI / Workflow Requirements
- **Container**: Maestro Clinical Command Center wrapped in `#0b1120` canvas with `#f8fafc` typography.
- **4-Card Executive Ribbon**:
  - Total Disputed Exposure ($)
  - Overturned Dollars Recovered ($)
  - In-Flight Appeal Cases
  - Aggregate Overturn Yield (%)
- **4 Interactive Workbenches**:
  1. *Active Appeals Queue*: Disputed claims with countdown to payer due date, appeal level badge, and quick action buttons.
  2. *Evidence Packet Builder*: Checklist of required clinical and billing exhibits with verification badges.
  3. *Payer Turnaround & Aging Tracker*: Breakdown of appeals by payer response aging window (0–15d, 16–30d, 31–45d, Overdue).
  4. *Overturn & Settlement Matrix*: Financial win rate analysis by payer and appeal level.
- **Modals**:
  - New Appeal Packet Creation Modal.
  - Evidence Attachment & Verification Modal.
  - Final Outcome & Settlement Recording Modal.

## Audit / Provenance
- Every status transition, evidence verification, and outcome update creates an immutable row in `rcm_appeal_events`.
- Captures user ID, previous status, new status, timestamp, and JSONB metadata.

## QA / Test Cases
- Test 1: Multi-level appeal hierarchy definitions (Level 1, 2, 3).
- Test 2: Evidence document taxonomy and verification checklist validation.
- Test 3: Turnaround date math and overdue status calculation.
- Test 4: Financial settlement recovery calculations and overturn yield %.
- Test 5: Executive KPI aggregation accuracy.
- Test 6: Database migration SQL idempotency and RLS policy drop/create parity.
- Test 7: Maestro Clinical Design System token compliance (zero purple tokens).
- Test 8: Application wiring in `App.jsx`.

## Acceptance Criteria
- [x] Master specification authored with complete production requirements.
- [x] Database migration `060_appeals_workflow.sql` and rollback `060_appeals_workflow_down.sql` created.
- [x] Service engine `src/lib/appealsService.js` and dual export `src/services/appealsService.js` implemented.
- [x] UI component `AppealsWorkflowView.jsx` and `AppealsWorkflowView.css` built with Maestro Clinical tokens.
- [x] Application wired into `src/App.jsx` under `REVENUE CYCLE (RCM)`.
- [x] Automated test suite `tests/appeals-workflow.test.js` passes 100%.
- [x] Production build `npm run build` succeeds with zero errors.

## Dependencies
- Phase 80: `claims`, `claim_lines`
- Phase 84: `rcm_carc_master`, `rcm_rarc_master`
- Phase 85: `rcm_denials`

## Definition of Done
Complete production delivery including schema migration, rollback script, deterministic business logic, UI workbench, test suite, and clean production build.

## Implementation Notes
- Migration: `supabase/migrations/060_appeals_workflow.sql`
- Rollback: `supabase/migrations/060_appeals_workflow_down.sql`
- Service: `src/lib/appealsService.js` & `src/services/appealsService.js`
- UI: `src/components/AppealsWorkflowView.jsx` & `src/components/AppealsWorkflowView.css`
- App: Registered tab `appeals_workflow` in `src/App.jsx`
- Tests: `tests/appeals-workflow.test.js`
