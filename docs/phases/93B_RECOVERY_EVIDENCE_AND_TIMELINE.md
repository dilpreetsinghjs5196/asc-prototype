# 93B RECOVERY EVIDENCE AND TIMELINE

## Purpose
Production specification for transforming a validated payment variance into an auditable recovery case containing calculation evidence, contract evidence, filing deadlines, human approval, submission tracking, payer-response events, and final recovered value.

This phase closes the gap between:

> **"ASCANALYST detected and validated an underpayment"**

and

> **"ASCANALYST proved it, supported the recovery workflow, tracked the payer response, and verified the recovered cash."**

---

## Scope
- Transform validated payment variances (`payment_variances.id` from Phase 93A) into authoritative, trackable recovery cases.
- Assemble a deterministic, immutable evidence package containing contract clauses, fee schedules, calculation lineage, claims, 835 ERAs, and invoices.
- Enforce mandatory human approval before any external dispute, appeal, or reconsideration submission.
- Track submission dispatch across diverse channels (Waystar EDI, clearinghouse, payer portal, SFTP, secure email, mail, manual) without assuming direct API capability.
- Record every payer response event (acknowledgments, additional information requests, reprocessing, overturns, denials).
- Verify realized incremental cash payments from subsequent 835 remittances without double-counting patient responsibility, secondary payer payments, or duplicate postings.
- Measure operational cycle times (detection-to-validation, validation-to-submission, submission-to-response, submission-to-cash) and staff touches.
- Preserve facility and organization multi-tenancy with PostgreSQL Row Level Security (RLS) and strict RBAC governance.

---

## Current State
Existing reusable assets:
- Phase 66 Payer Contract Model: **KEEP**
- Phase 67 Payer Contract Rate Rules: **KEEP**
- Phase 68 Expected Reimbursement Engine: **KEEP**
- Phase 69 Reimbursement Calculation Auditability: **KEEP**
- Phase 80 Claims Model: **KEEP**
- Phase 82 835 Remittance Ingestion: **KEEP**
- Phase 83 Payments & Adjustments: **KEEP**
- Phase 84 CARC/RARC Intelligence: **KEEP**
- Phase 86 Appeals Workflow: **KEEP / INTEGRATE**
- Phase 89 Reconciliation Engine: **KEEP**
- Phase 90 Revenue Leakage Lifecycle: **KEEP / EXTEND**
- Phase 93 Underpayment Detection: **KEEP**
- Phase 93A Payment Variance Validation: **REQUIRED PREDECESSOR**
- Phase 99 Recoverable Revenue Work Queue: **FUTURE INTEGRATION**
- Phase D4 Decision Ledger: **FUTURE INTEGRATION**
- Phase D5 Outcome Tracking: **FUTURE INTEGRATION**
- Phase D6 Realized Value: **FUTURE INTEGRATION**

Missing components addressed by Phase 93B:
- Formal recovery-case entity for contractual payment variance: **IMPLEMENTED**
- Multi-source evidence package entity with content hashing: **IMPLEMENTED**
- Chronological recovery event timeline with actor provenance: **IMPLEMENTED**
- Multi-channel submission tracking model: **IMPLEMENTED**
- Structured payer response model: **IMPLEMENTED**
- Incremental realized cash reconciliation engine: **IMPLEMENTED**

---

## Target State

### 15-State Recovery Case Lifecycle
A recovery case transitions through the following deterministic states:

```
[DRAFT] 
   │
   ▼
[EVIDENCE_INCOMPLETE] ◄── (Missing contract, 835, or calculation trace)
   │ (All required evidence verified)
   ▼
[READY_FOR_REVIEW]
   │ (Human supervisor sign-off + package hash recorded)
   ▼
[APPROVED] ─── (Dispatched via configured channel) ───► [SUBMITTED]
                                                            │
                       ┌────────────────────────────────────┼───────────────────────────┐
                       ▼                                    ▼                           ▼
                [ACKNOWLEDGED]                   [PAYER_INFO_REQUESTED]          [UNDER_PAYER_REVIEW]
                       │                                    │                           │
                       └────────────────────────────────────┴─────────────┬─────────────┘
                                                                          ▼
                                                                   [REPROCESSING]
                                                                          │
                                           ┌──────────────────────────────┴──────────────────────────────┐
                                           ▼                                                             ▼
                                [PARTIALLY_RECOVERED]                                           [FULLY_RECOVERED]
```

#### Terminal / Exception States
- `REJECTED`: Payer denied or upheld short-pay with formal reason code; no further administrative remedy available.
- `WITHDRAWN`: Disputed case retracted due to clinical/contractual re-evaluation or provider discretion.
- `CLOSED_NO_RECOVERY`: Case closed following exhaustion of appeals or compromise determination without monetary recovery.
- `EXPIRED`: Statutory or contractual filing deadline passed prior to timely submission.

> **CRITICAL INVARIANT:** No external submission, appeal, or reconsideration may occur without an explicit, auditable **HUMAN APPROVAL** event (`approved_by`, `approved_at`, `package_hash`).

---

## Data Model / Schema

### 1. `public.recovery_cases`
Header entity representing an auditable contractual recovery case.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique recovery case identifier |
| `organization_id` | `UUID` | `NOT NULL` | Tenancy organization scope |
| `facility_id` | `UUID` | `NOT NULL REFERENCES public.facilities(id)` | Tenancy facility scope |
| `payment_variance_id` | `UUID` | `NOT NULL REFERENCES public.payment_variances(id)` | Validated variance source (Phase 93A) |
| `claim_id` | `UUID` | `NOT NULL REFERENCES public.claims(id)` | Claim undergoing recovery |
| `case_id` | `BIGINT` | `REFERENCES public.surgeries(id)` | ASC surgical case identifier |
| `payer_id` | `UUID` | `NOT NULL` | Target payer identifier |
| `plan_id` | `UUID` | `NULL` | Specific plan identifier |
| `recovery_type` | `VARCHAR(40)` | `NOT NULL` | `CONTRACTUAL_UNDERPAYMENT`, `IMPLANT_CARVEOUT`, `FEE_SCHEDULE_DISCREPANCY`, `UNBUNDLED_SERVICES`, `APPEAL_RECONSIDERATION` |
| `status` | `VARCHAR(40)` | `NOT NULL CHECK (status IN (...))` | 15 lifecycle states |
| `potential_recovery` | `NUMERIC(14,2)` | `NOT NULL CHECK (potential_recovery >= 0)` | Disputed variance amount |
| `validated_recovery_amount` | `NUMERIC(14,2)` | `CHECK (validated_recovery_amount >= 0)` | Contractually confirmed recoverable amount |
| `recovered_amount` | `NUMERIC(14,2)` | `NOT NULL DEFAULT 0.00 CHECK (recovered_amount >= 0)` | Cumulative verified incremental recovered cash |
| `filing_deadline` | `DATE` | `NULL` | Contractual or statutory filing deadline |
| `owner_user_id` | `UUID` | `REFERENCES auth.users(id)` | Assigned RCM recovery specialist |
| `approved_by` | `UUID` | `REFERENCES auth.users(id)` | Mandatory human approver |
| `approved_at` | `TIMESTAMPTZ` | `NULL` | Timestamp of human sign-off |
| `package_hash` | `TEXT` | `NULL` | Cryptographic SHA-256 hash of approved package |
| `submitted_at` | `TIMESTAMPTZ` | `NULL` | Timestamp of external dispatch |
| `closed_at` | `TIMESTAMPTZ` | `NULL` | Final case resolution timestamp |
| `notes` | `TEXT` | `NULL` | Clinical/operational recovery notes |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Last update timestamp |

### 2. `public.recovery_case_events`
Immutable append-only audit timeline of all recovery case actions and status transitions.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique timeline event identifier |
| `recovery_case_id` | `UUID` | `NOT NULL REFERENCES public.recovery_cases(id) ON DELETE CASCADE` | Associated recovery case |
| `event_type` | `VARCHAR(64)` | `NOT NULL` | e.g. `CASE_CREATED`, `EVIDENCE_ATTACHED`, `HUMAN_APPROVED`, `EXTERNAL_SUBMISSION`, `PAYER_ACKNOWLEDGED`, `PAYMENT_RECONCILED` |
| `event_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Event occurrence timestamp |
| `actor_user_id` | `UUID` | `REFERENCES auth.users(id)` | User who executed or verified the action |
| `source_system` | `VARCHAR(64)` | `NULL` | `ASCANALYST_APP`, `WAYSTAR_EDI`, `MANUAL_UPLOAD`, `ERA_835_HARVESTER` |
| `external_reference` | `VARCHAR(128)`| `NULL` | Clearinghouse trace ID, portal reference, or check # |
| `notes` | `TEXT` | `NULL` | Event narrative |
| `metadata` | `JSONB` | `NOT NULL DEFAULT '{}'::jsonb` | Structured event payload (before/after states, hashes) |

### 3. `public.recovery_evidence`
Multi-type evidence documents and calculation traces compiled into the recovery packet.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Evidence item identifier |
| `recovery_case_id` | `UUID` | `NOT NULL REFERENCES public.recovery_cases(id) ON DELETE CASCADE` | Associated recovery case |
| `evidence_type` | `VARCHAR(64)` | `NOT NULL CHECK (evidence_type IN (...))` | 13 supported evidence types |
| `source_record_type` | `VARCHAR(64)` | `NULL` | Table or document type of source asset |
| `source_record_id` | `TEXT` | `NULL` | Foreign identifier of underlying record |
| `document_uri` | `TEXT` | `NULL` | Secure vault or object storage URI |
| `content_hash` | `TEXT` | `NULL` | SHA-256 digest of underlying document/trace |
| `title` | `VARCHAR(255)` | `NULL` | Human-readable document title |
| `description` | `TEXT` | `NULL` | Evidence summary or contract citation |
| `is_required` | `BOOLEAN` | `NOT NULL DEFAULT false` | Mandatory gate flag for case review |
| `is_present` | `BOOLEAN` | `NOT NULL DEFAULT false` | Attachment existence indicator |
| `verified_by` | `UUID` | `REFERENCES auth.users(id)` | Specialist who confirmed evidentiary validity |
| `verified_at` | `TIMESTAMPTZ` | `NULL` | Verification timestamp |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record creation timestamp |

#### 13 Supported Evidence Types:
1. `CONTRACT_CLAUSE`: Specific section or amendment of commercial agreement.
2. `CONTRACT_RATE`: Explicit rate schedule or fee table row.
3. `EXPECTED_REIMBURSEMENT_TRACE`: Multi-step calculation audit log from Phase 68/69.
4. `CLAIM`: 837 claim submission header and summary.
5. `CLAIM_LINE`: Specific disputed CPT/HCPCS claim line item.
6. `ERA_835`: Electronic Remittance Advice adjudication record.
7. `CARC_RARC`: Claim Adjustment Reason Codes and Remittance Advice Remark Codes.
8. `IMPLANT_INVOICE`: Manufacturer device purchase invoice and itemized cost sheet.
9. `IMPLANT_CARVEOUT_RULE`: Contract clause defining invoice + markup reimbursement.
10. `OPERATIVE_NOTE`: Physician surgical documentation justifying medical necessity/modifiers.
11. `CODING_REVIEW`: Certified professional coder (CPC) review notes.
12. `PAYMENT_POSTING`: Internal ledger payment and contractual write-off posting.
13. `OTHER`: General supporting exhibit or payer correspondence.

### 4. `public.recovery_submissions`
Tracks external dispute dispatch across all operational channels.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique submission identifier |
| `recovery_case_id` | `UUID` | `NOT NULL REFERENCES public.recovery_cases(id) ON DELETE CASCADE` | Associated recovery case |
| `submission_type` | `VARCHAR(40)` | `NOT NULL` | `RECONSIDERATION_REQUEST`, `FORMAL_APPEAL`, `CORRECTED_BILLING`, `DISPUTE_PACKET` |
| `submission_channel` | `VARCHAR(40)`| `NOT NULL CHECK (submission_channel IN (...))` | 8 operational channels |
| `submitted_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Transmission timestamp |
| `submitted_by` | `UUID` | `NOT NULL REFERENCES auth.users(id)` | User who dispatched the packet |
| `external_reference` | `VARCHAR(128)`| `NULL` | Tracking number, EDI batch ID, or confirmation # |
| `payload_hash` | `TEXT` | `NULL` | Cryptographic SHA-256 hash of submitted package |
| `status` | `VARCHAR(40)` | `NOT NULL CHECK (status IN (...))` | `PENDING_DISPATCH`, `DISPATCHED`, `DELIVERED`, `ACKNOWLEDGED`, `FAILED`, `REJECTED` |
| `acknowledged_at` | `TIMESTAMPTZ` | `NULL` | Payer electronic receipt timestamp |
| `metadata` | `JSONB` | `NOT NULL DEFAULT '{}'::jsonb` | Delivery receipt or transmission metadata |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record creation timestamp |

#### 8 Submission Channels:
- `WAYSTAR`: Direct clearinghouse EDI integration.
- `CLEARINGHOUSE`: Secondary or general EDI clearinghouse.
- `PAYER_PORTAL`: Online web portal upload (Availity, Optum, NaviNet, etc.).
- `SFTP`: Secure File Transfer Protocol batch transmission.
- `SECURE_EMAIL`: Encrypted HIPAA-compliant email dispatch.
- `MAIL`: Certified physical mail delivery with return receipt.
- `MANUAL`: In-person, courier, or fax transmission.
- `OTHER`: Specialty or custom transmission method.

### 5. `public.payer_responses`
Logs formal payer adjudication responses and correspondence events.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique response identifier |
| `recovery_case_id` | `UUID` | `NOT NULL REFERENCES public.recovery_cases(id) ON DELETE CASCADE` | Associated recovery case |
| `response_type` | `VARCHAR(64)` | `NOT NULL CHECK (response_type IN (...))` | Response classification |
| `response_date` | `DATE` | `NOT NULL` | Formal payer letter or 835 response date |
| `amount` | `NUMERIC(14,2)` | `CHECK (amount >= 0)` | Additional allowed or paid amount |
| `reason_code` | `VARCHAR(64)` | `NULL` | CARC/RARC or internal payer disposition code |
| `source_document_uri` | `TEXT` | `NULL` | Scanned letter, EOB PDF, or 835 file link |
| `notes` | `TEXT` | `NULL` | Clinical or contractual explanation from payer |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record creation timestamp |

#### Supported Response Types:
`ACKNOWLEDGMENT`, `INFO_REQUESTED`, `UNDER_REVIEW`, `UPHELD_DENIAL`, `PARTIAL_OVERTURN`, `FULL_OVERTURN`, `REPROCESSING`, `ADDITIONAL_PAYMENT_SCHEDULED`, `OTHER`.

### 6. `public.recovery_outcomes`
Authoritative incremental cash reconciliation records.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Outcome record identifier |
| `recovery_case_id` | `UUID` | `NOT NULL REFERENCES public.recovery_cases(id) ON DELETE CASCADE` | Associated recovery case |
| `outcome_type` | `VARCHAR(40)` | `NOT NULL CHECK (outcome_type IN (...))` | `FULL_RECOVERY`, `PARTIAL_RECOVERY`, `NO_RECOVERY_UPHELD`, `WITHDRAWN_CLINICAL_DISCRETION`, `EXPIRED_STATUTORY_DEADLINE`, `COMPROMISE_SETTLEMENT` |
| `verified_recovered_amount`| `NUMERIC(14,2)`| `NOT NULL DEFAULT 0.00 CHECK (verified_recovered_amount >= 0)` | Verified incremental cash realized |
| `verification_source` | `VARCHAR(64)` | `NOT NULL` | `ERA_835_REMITTANCE`, `BANK_DEPOSIT_MATCH`, `LOCKBOX_STATEMENT`, `TREASURY_LEDGER` |
| `verification_record_id` | `TEXT` | `NULL` | 835 check/EFT trace number or deposit batch ID |
| `resolved_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Final settlement timestamp |
| `verified_by` | `UUID` | `REFERENCES auth.users(id)` | Finance manager who verified cash receipt |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record creation timestamp |

---

## Business Rules

### Rule 1: Evidence Completeness Gate
A recovery case cannot transition from `EVIDENCE_INCOMPLETE` to `READY_FOR_REVIEW` until all mandatory evidence items are marked `is_present = true`.
- For `CONTRACTUAL_UNDERPAYMENT`:
  - `CONTRACT_CLAUSE` or `CONTRACT_RATE`
  - `EXPECTED_REIMBURSEMENT_TRACE`
  - `CLAIM` or `CLAIM_LINE`
  - `ERA_835` or `PAYMENT_POSTING`
  - `CARC_RARC`
  - Filing deadline recorded if provided by payer/contract.

### Rule 2: Mandatory Human Approval (P0 Safeguard)
No external action, dispute packet submission, clearinghouse dispatch, or payer portal upload may be executed automatically.
- Every submission requires an explicit `HUMAN_APPROVED` event.
- Approval records `approved_by` user ID, `approved_at` timestamp, and the immutable SHA-256 `package_hash`.
- AI may generate reconsideration draft text and summarize evidence, but AI must never approve or submit external filings.

### Rule 3: Strict Incremental Recovered Cash Accounting
Recovered cash must represent true incremental payments compared to the baseline adjudication:
$$\Delta\text{Recovered} = \text{Post-Submission Actual Paid} - \text{Baseline Actual Paid}$$

The following must **NEVER** be counted toward realized recovery:
1. Patient deductible, co-insurance, or co-pay collections (`PR-1`, `PR-2`, `PR-3`).
2. Unrelated secondary payer payments (COB).
3. Amounts paid prior to the recovery case creation.
4. Duplicate payment postings or ledger re-entries.
5. Internal accounting or GL reclassifications.

### Rule 4: Partial Recovery Mechanics
If a payer reprocesses a claim and pays less than the full validated variance:
- Case transitions to `PARTIALLY_RECOVERED`.
- `recovered_amount` is incremented by the verified incremental payment.
- Remaining disputed amount:
  $$\text{Remaining Balance} = \text{Validated Recovery Amount} - \text{Recovered Amount}$$
- The case may remain open for secondary appeal or be explicitly closed with a `COMPROMISE_SETTLEMENT` or `NO_RECOVERY_UPHELD` outcome for the remainder.

### Rule 5: Operational Cycle Time Tracking
Cycle time metrics are tracked deterministically:
- **Detection-to-Validation:** `payment_variances.validated_at - payment_variances.created_at`
- **Validation-to-Submission:** `recovery_submissions.submitted_at - payment_variances.validated_at`
- **Submission-to-Response:** `payer_responses.response_date - recovery_submissions.submitted_at`
- **Submission-to-Cash:** `recovery_outcomes.resolved_at - recovery_submissions.submitted_at`
- **Total Resolution Time:** `recovery_cases.closed_at - recovery_cases.created_at`

### Rule 6: Staff Touches and Efficiency Metrics
Every manual human action (review, evidence upload, approval, transmission dispatch, response logging, cash reconciliation) increments the case touch count. This establishes baseline manual effort to calculate operational ROI and administrative labor savings.

---

## Permissions / Security
- **Organization & Facility Multi-Tenancy:** Enforced across all tables via PostgreSQL Row Level Security (RLS) policies checking `facility_id` against `auth.jwt() ->> 'facility_id'`.
- **Role-Based Access Control (RBAC):**
  - `Billing Specialist`: View cases, attach evidence, draft narratives.
  - `Billing Supervisor / RCM Manager`: Approve recovery cases, execute submissions, log payer responses.
  - `Finance Director / Executive`: Verify cash reconciliation, close cases, access executive outcome reports.
  - `Read-Only Auditor`: View cases, audit trails, and evidence documents; cannot alter states or approve submissions.

---

## API / Service Requirements
The service layer (`recoveryEvidenceService.js`) provides authoritative, auditable functions:
- `build_recovery_case(payment_variance_id, options)`: Instantiates a recovery case from a validated variance.
- `build_recovery_evidence(recovery_case_id)`: Gathers associated contract, claim, calculation, and 835 evidence.
- `validate_recovery_package(recovery_case_id)`: Verifies checklist completeness and calculates package SHA-256 hash.
- `approve_recovery_case(recovery_case_id, approver_user_id, package_hash, notes)`: Records human approval.
- `record_recovery_submission(recovery_case_id, channel, submitted_by, external_ref, notes)`: Dispatches packet and logs submission.
- `record_payer_response(recovery_case_id, response_type, response_date, amount, reason_code, notes)`: Records payer response.
- `reconcile_recovery_payment(recovery_case_id, incremental_payment, source, record_id, verified_by)`: Verifies incremental cash and adjusts status.
- `close_recovery_case(recovery_case_id, outcome_type, closed_by, notes)`: Formally resolves and closes case.
- `generate_reconsideration_narrative(recovery_case_id)`: Generates AI-assisted dispute narrative citing specific contract clauses and CARC codes.

---

## UI / Workflow Requirements
Clinical Maestro UI layout with high-contrast dark theme (`#0b1120 !important` background, `#0f172a !important` cards, strictly ZERO purple tokens):

1. **Header & Facility Banner:** Phase 93B pill, facility selector, live sync button, CSV/packet export button.
2. **5-Card Financial & Operational KPI Ribbon:**
   - Total Active Recovery Cases
   - Total Potential Value ($)
   - Approved & In-Flight Pipeline ($)
   - Verified Realized Cash ($)
   - Cash Realization Rate (%) & Avg Cycle Time (days)
3. **Recovery Cases Worklist Grid:** Real-time data grid showing status pill, claim #, payer, potential recovery, verified recovery, approval badge, filing deadline, and quick action buttons (`Approve`, `Submit`, `Log Response`, `Reconcile Cash`).
4. **Chronological Recovery Timeline:** Interactive visual audit timeline showing timestamps, actors, external references, and status transitions.
5. **Evidence Package Inspector:** 13-type checklist showing required vs present evidence items, document URIs, and package content hash.
6. **Payer Response & Realized Cash Reconciliation:** Payer response log, incremental payment verification, and cycle time metrics.
7. **Interactive Action Modals:**
   - Human Approval Modal (records approver, package hash, and mandatory sign-off)
   - Submission Dispatch Modal (channel selection, external tracking reference)
   - Payer Response Logger Modal (response type, date, amount, reason code)
   - Cash Reconciliation Modal (incremental remittance verification with safeguards)
   - AI Reconsideration Drafter Modal (narrative generation with contract evidence preview)

---

## QA / Test Cases
The automated test suite (`tests/recovery-evidence-timeline.test.js`) verifies:
1. Complete contract-underpayment package creation and evidence compilation.
2. Missing contract evidence blocks human approval and sets status to `EVIDENCE_INCOMPLETE`.
3. Filing deadline expiration transitions case to `EXPIRED`.
4. Manual submission channel recording.
5. Waystar EDI submission channel configuration and tracking.
6. Partial recovery calculates remaining balance and transitions to `PARTIALLY_RECOVERED`.
7. Full recovery calculates 100% realization and transitions to `FULLY_RECOVERED`.
8. Payer rejection logging with CARC reason code transitions to `REJECTED`.
9. Payer additional info request transitions to `PAYER_INFO_REQUESTED`.
10. Incremental cash calculation strictly ignores duplicate postings and patient payments.
11. Secondary payer payments (COB) are not misattributed as underpayment recoveries.
12. Unauthorized submission without human approval is strictly blocked.
13. Evidence package SHA-256 hash updates only when underlying documents change.
14. PostgreSQL Row Level Security blocks cross-facility data leakage.
15. Strict Maestro Clinical Design System compliance: strictly ZERO purple/violet/indigo/magenta tokens.
16. Database migration integrity (tables, columns, indexes, foreign keys, 1:1 RLS policies, clean rollback).
17. Application wiring and documentation completeness.

---

## Acceptance Criteria
- Every validated recoverable variance from Phase 93A can create exactly one recovery case.
- No recovery case can be externally submitted without verifiable human approval (`approved_by`, `approved_at`, `package_hash`).
- Every submission and payer response is traceable with timestamp, actor, and external reference.
- Realized recovery is verified from financial source data using incremental post-submission math.
- Duplicate value attribution, patient responsibility, and secondary payer payments are excluded.
- Build, lint, RLS, unit, integration, and UI tests pass with clean exit codes.

---

## Definition of Done
Complete only when validated underpayments can be transformed into auditable recovery cases, approved by humans, tracked through payer response, reconciled to incremental cash, and surfaced as verified realized value.
