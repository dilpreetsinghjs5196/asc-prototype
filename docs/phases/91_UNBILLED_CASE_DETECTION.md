# 91 UNBILLED CASE DETECTION

## Purpose
Production specification for the Ambulatory Surgery Center (ASC) Unbilled Case Detection Engine: automated identification, root-cause hold diagnosis, aging bucket classification, timely filing risk mitigation, and resolution workflows for completed/coded surgical cases that have not yet been released to clearinghouse billing. This subsystem prevents unbilled revenue stagnation, eliminates timely filing forfeitures, and accelerates cash conversion cycles.

## Scope
- Define authoritative unbilled case detection models across completed surgical encounters (`public.surgeries` where encounter status is `COMPLETED` or `DISCHARGED` with no active billed claim in `public.claims`):
  1. `IMPLANT_INVOICE_LAG`: Consumed implants logged in OR, but billing held pending supplier invoice or cost verification.
  2. `PHYSICIAN_QUERY_PENDING`: Documentation deficiencies or coding queries requiring operating surgeon attestation before claim finalization.
  3. `PATHOLOGY_PENDING`: Specimen sent for anatomical or biopsy pathology; definitive diagnosis code held pending laboratory report.
  4. `AUTH_RETRO_PENDING`: Prior authorization number missing, requiring retro-authorization or commercial peer-to-peer review.
  5. `COB_VALIDATION`: Coordination of Benefits unresolved between primary commercial and secondary insurance.
  6. `BILLING_SCRUB_ERROR`: Claim failed pre-bill clearinghouse edits (missing NPI, invalid subscriber ID, NCCI bundling).
  7. `READY_TO_RELEASE`: Fully coded, all documentation verified, ready for electronic claim batching.
- Implement statutory and contractual Timely Filing Risk Tiering:
  - `CRITICAL`: $\le 15$ days remaining until commercial (90-day) or statutory filing cutoff.
  - `URGENT`: $16 - 30$ days remaining until filing cutoff.
  - `WARNING`: $31 - 60$ days remaining until filing cutoff.
  - `NORMAL`: $> 60$ days remaining until filing cutoff.
- Establish standardized Unbilled Aging Buckets:
  - $0 - 15$ Days (Standard Coding & Billing Window)
  - $16 - 30$ Days (Elevated Lag)
  - $31 - 60$ Days (Stale Unbilled Backlog)
  - $61+$ Days (Critical Timely Filing Risk Exposure)
- Provide auditable hold resolution and claim release workflows:
  - `RESOLVE_HOLD`: Attach missing document, invoice, or auth code to clear hold reason.
  - `RELEASE_CLAIM`: Generate replacement electronic 837 claim and transition case to billing.
  - `WRITE_OFF_EXPIRED`: Formal CFO authorization for uncollectable timely filing forfeiture.
- Enforce organization/facility tenancy, audit trails, and strict Maestro Clinical Design System governance (strictly ZERO purple/violet/indigo/magenta/fuchsia tokens).

## Current State
- **Phase 31 (Case Master)**: Core surgical encounters and room milestones (`002_case_master.sql`): **KEEP**.
- **Phase 46 (Charge Completeness Engine)**: Pre-bill charge audits (`017_charge_completeness_engine.sql`): **KEEP**.
- **Phase 80 (Claims Model)**: Billed claims headers, line charges, and initial AR ledger (`054_claims_model.sql`): **KEEP**.
- **Phase 90 (Revenue Leakage Engine)**: Master leakage rule governance and opportunity tracking (`064_revenue_leakage_engine.sql`): **KEEP**.
- **Phase 91 (Unbilled Case Detection)**:
  - Unbilled case tracking ledger table (`rcm_unbilled_cases`): **IMPLEMENTED** (`065_unbilled_case_detection.sql`).
  - Hold resolution and release action log table (`rcm_unbilled_case_actions`): **IMPLEMENTED** (`065_unbilled_case_detection.sql`).
  - Active unbilled cases and aging summary views (`vw_rcm_unbilled_cases_active`, `vw_rcm_unbilled_aging_summary`): **IMPLEMENTED**.
  - Interactive Unbilled Case Detection Workbench UI (`UnbilledCaseDetectionView.jsx`, `UnbilledCaseDetectionView.css`): **IMPLEMENTED**.

## Target State
1. **Automated Unbilled Case Ingestion & Aging**:
   - Central table `rcm_unbilled_cases` linking `facility_id`, `surgery_id` (`BIGINT`), `patient_id` (`BIGINT`), and optional `released_claim_id` (`UUID`).
   - Dynamic view calculating exact unbilled days ($\text{current\_date} - \text{date\_of\_service}$) and days remaining to payer filing deadline.
2. **Deterministic Priority Scoring**:
   - Composite Priority Score ($0.0 - 100.0$) weighting dollar impact ($40\%$), days unbilled ($35\%$), and filing urgency ($25\%$).
3. **Hold Diagnosis & Resolution State Machine**:
   - States: `HELD` $\rightarrow$ `UNDER_INVESTIGATION` $\rightarrow$ `HOLD_RESOLVED` $\rightarrow$ `CLAIM_RELEASED` (or `WRITTEN_OFF_TIMELY_FILING`).
4. **Executive Unbilled Intelligence**:
   - Real-time visibility into total unbilled charges, expected collectible revenue, average lag days, and dollars at immediate timely filing risk.

## Data Model / Schema

### 1. `rcm_unbilled_cases` (Unbilled Case Tracking Ledger)
- `id` (UUID PRIMARY KEY DEFAULT gen_random_uuid())
- `facility_id` (UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE)
- `surgery_id` (BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE CASCADE)
- `patient_id` (BIGINT NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT)
- `case_number` (VARCHAR(64) NOT NULL UNIQUE)
- `surgeon_name` (VARCHAR(128) NOT NULL)
- `specialty` (VARCHAR(64) NOT NULL)
- `procedure_name` (VARCHAR(256) NOT NULL)
- `primary_cpt` (VARCHAR(16) NOT NULL)
- `payer_name` (VARCHAR(128) NOT NULL)
- `payer_type` (VARCHAR(32) NOT NULL CHECK (payer_type IN ('COMMERCIAL', 'MEDICARE', 'MEDICAID', 'WORKERS_COMP', 'SELF_PAY')))
- `date_of_service` (DATE NOT NULL)
- `coded_date` (DATE)
- `total_charges` (NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (total_charges >= 0))
- `expected_reimbursement` (NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (expected_reimbursement >= 0))
- `hold_reason` (VARCHAR(64) NOT NULL CHECK (hold_reason IN (
    'IMPLANT_INVOICE_LAG',
    'PHYSICIAN_QUERY_PENDING',
    'PATHOLOGY_PENDING',
    'AUTH_RETRO_PENDING',
    'COB_VALIDATION',
    'BILLING_SCRUB_ERROR',
    'READY_TO_RELEASE'
  )))
- `unbilled_status` (VARCHAR(32) NOT NULL DEFAULT 'HELD' CHECK (unbilled_status IN (
    'HELD',
    'UNDER_INVESTIGATION',
    'HOLD_RESOLVED',
    'CLAIM_RELEASED',
    'WRITTEN_OFF_TIMELY_FILING'
  )))
- `filing_deadline` (DATE NOT NULL)
- `timely_filing_risk_tier` (VARCHAR(16) NOT NULL DEFAULT 'NORMAL' CHECK (timely_filing_risk_tier IN ('CRITICAL', 'URGENT', 'WARNING', 'NORMAL')))
- `priority_score` (NUMERIC(5,2) NOT NULL DEFAULT 50.00 CHECK (priority_score BETWEEN 0.00 AND 100.00))
- `assigned_to` (UUID REFERENCES auth.users(id))
- `resolution_notes` (TEXT)
- `released_at` (TIMESTAMPTZ)
- `released_claim_id` (UUID REFERENCES public.claims(id) ON DELETE SET NULL)
- `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
- `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())

### 2. `rcm_unbilled_case_actions` (Audit & Workflow Action Log)
- `id` (UUID PRIMARY KEY DEFAULT gen_random_uuid())
- `facility_id` (UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE)
- `unbilled_case_id` (UUID NOT NULL REFERENCES public.rcm_unbilled_cases(id) ON DELETE CASCADE)
- `action_type` (VARCHAR(40) NOT NULL CHECK (action_type IN (
    'HOLD_APPLIED',
    'QUERY_SENT_SURGEON',
    'INVOICE_ATTACHED',
    'AUTH_CONFIRMED',
    'HOLD_RESOLVED',
    'CLAIM_RELEASED',
    'DEADLINE_ALERT_SENT',
    'WRITTEN_OFF_TIMELY_FILING'
  )))
- `performed_by` (UUID REFERENCES auth.users(id))
- `performed_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
- `previous_status` (VARCHAR(32))
- `new_status` (VARCHAR(32))
- `notes` (TEXT NOT NULL)

## Business Rules

### 1. Deterministic Aging & Timely Filing Calculations
- **Days Unbilled**:
  $$\text{days\_unbilled} = \max(0, \text{CURRENT\_DATE} - \text{date\_of\_service})$$
- **Days Remaining to Filing Cutoff**:
  $$\text{days\_remaining} = \text{filing\_deadline} - \text{CURRENT\_DATE}$$
- **Timely Filing Risk Classification**:
  $$\text{risk\_tier} = \begin{cases}
  \text{CRITICAL} & \text{if } \text{days\_remaining} \le 15 \\
  \text{URGENT} & \text{if } 16 \le \text{days\_remaining} \le 30 \\
  \text{WARNING} & \text{if } 31 \le \text{days\_remaining} \le 60 \\
  \text{NORMAL} & \text{otherwise}
  \end{cases}$$

### 2. Composite Priority Score ($0.0 - 100.0$)
The priority score determines collector and billing specialist work queue order:
$$\text{Priority} = \min\left(40.0, \frac{\text{expected\_amount}}{10,000.00} \times 40.0\right) + \min\left(35.0, \frac{\text{days\_unbilled}}{60.0} \times 35.0\right) + \text{Urgency Weight}$$
- Where Urgency Weight:
  - $\le 15$ days remaining: $25.0$ points
  - $16 - 30$ days remaining: $18.0$ points
  - $31 - 60$ days remaining: $10.0$ points
  - $> 60$ days remaining: $5.0$ points

### 3. Lifecycle State Transition Guardrails
- `HELD` $\rightarrow$ `UNDER_INVESTIGATION`: Billing specialist actively verifies documentation or contacts surgeon/vendor.
- `UNDER_INVESTIGATION` $\rightarrow$ `HOLD_RESOLVED`: Mandatory entry of resolution reason (e.g. invoice uploaded, retro-auth code entered, dictation signed).
- `HOLD_RESOLVED` $\rightarrow$ `CLAIM_RELEASED`: Transmits claim to clearinghouse, sets `released_at = NOW()`, links `released_claim_id`.
- Any State $\rightarrow$ `WRITTEN_OFF_TIMELY_FILING`: Allowed only if `CURRENT_DATE > filing_deadline` and authorized by RCM Supervisor or CFO.

## Permissions / Security
- **View Unbilled Cases & Aging Worklists**: `facility_user`, `billing_specialist`, `coding_auditor`, `financial_analyst`, `administrator`.
- **Resolve Holds & Query Surgeons**: `billing_specialist`, `coding_auditor`, `administrator`.
- **Release Claims to Clearinghouse**: `billing_specialist`, `administrator`.
- **Authorize Timely Filing Write-Off**: `rcm_supervisor`, `cfo`, `administrator`.
- **RLS Policy**: Multi-facility isolation enforced via `facility_id IN (SELECT public.get_auth_user_facilities())`.

## API / Service Requirements
The service layer (`src/lib/unbilledCaseService.js` and `src/services/unbilledCaseService.js`) provides:
1. `getUnbilledCases(filters)`: Retrieves filtered unbilled cases with calculated priority scores.
2. `getUnbilledSummaryMetrics(cases)`: Aggregates total charges, expected revenue, critical exposure, and average lag days.
3. `getAgingBucketSummary(cases)`: Aggregates unbilled dollars and case counts across 0-15d, 16-30d, 31-60d, and 61+d buckets.
4. `getHoldReasonBreakdown(cases)`: Categorizes unbilled revenue by hold root-cause.
5. `resolveHold(id, { resolutionReason, notes })`: Clears hold and transitions status to `HOLD_RESOLVED`.
6. `releaseClaim(id, { claimControlNumber, notes })`: Transitions status to `CLAIM_RELEASED`.
7. `writeOffExpired(id, { justification, notes })`: Transitions status to `WRITTEN_OFF_TIMELY_FILING`.
8. `calculatePriorityScore(expectedAmount, daysUnbilled, daysRemaining)`: Deterministic scoring formula.

## UI / Workflow Requirements
- **Executive KPI Ribbon**:
  - Total Unbilled Encounters (count)
  - Total Unbilled Gross Charges ($)
  - Expected Unbilled Collectible Revenue ($)
  - Critical Timely Filing Risk Exposure ($)
  - Average Days Unbilled (days)
- **Four Dedicated Workbenches**:
  1. **Active Unbilled Worklist**: Full case grid with search, hold filter, priority badges, risk pills, and one-click actions.
  2. **Aging Buckets & Timely Filing Matrix**: Distribution matrix showing dollar concentration across 0-15d, 16-30d, 31-60d, and 61+d.
  3. **Hold Reason Diagnostics**: Root-cause diagnostic chart attributing unbilled dollars to implant lag, physician dictation, or retro-auth.
  4. **Surgeon Hold Scorecard**: Unbilled cases grouped by operating surgeon, highlighting documentation turnaround drag.
- **Action Modal**: Interface to resolve holds, log surgeon queries, input claim control numbers, or authorize write-offs.
- **Maestro Clinical Design System (Rule P0)**: Strictly zero purple/violet/indigo/magenta/fuchsia tokens. High-contrast `#0b1120` canvas, `#0f172a` executive container, `#ffffff` headers.

## Audit / Provenance
All hold resolutions, surgeon queries, and claim releases are permanently recorded with user identity, timestamp, before/after status, and detailed notes.

## QA / Test Cases
Automated test suite (`tests/unbilled-case-detection.test.js`) verifies:
1. Hold reason categories and lifecycle states.
2. Deterministic calculations: aging days, timely filing risk tiering, and priority scoring.
3. Summary metrics and aging bucket aggregation accuracy.
4. Baseline dataset health and realistic ASC surgical cases.
5. Database migration parity in `065_unbilled_case_detection.sql` (tables, indexes, views, 1:1 RLS policies).
6. Maestro Clinical Design System governance (0 forbidden purple tokens).
7. Application routing and specification completeness.

## Acceptance Criteria
- Build passes cleanly (`npm run build`).
- Automated tests pass with 100% success rate (`node --test tests/unbilled-case-detection.test.js`).
- Multi-tenancy RLS isolation enforced on all tables and views.
- No purple tokens present in styles or JSX components.
- Zero mock/placeholder values presented as authoritative production truth.

## Dependencies
- Phase 31: Case Master (`public.surgeries`)
- Phase 46: Charge Completeness Engine (`rcm_charge_completeness_audits`)
- Phase 80: Claims Model (`public.claims`)
- Phase 90: Revenue Leakage Engine (`rcm_leakage_opportunities`)

## Definition of Done
A feature is complete only when:
- Master specification document is complete with all 16 canonical sections.
- Database migrations (`065_unbilled_case_detection.sql` and `_down.sql`) are implemented.
- Service layer (`src/lib/` and `src/services/`) provides deterministic formulas, status transitions, and queries.
- UI workbench component and CSS comply with Maestro Clinical Design System standards.
- Component is wired into `src/App.jsx`.
- Comprehensive test suite passes with zero failures.
- Production build succeeds without errors.

## Implementation Notes
- Migration `065_unbilled_case_detection.sql` defines `rcm_unbilled_cases`, `rcm_unbilled_case_actions`, `vw_rcm_unbilled_cases_active`, and `vw_rcm_unbilled_aging_summary`.
- Dynamic aging logic uses view-based calculation rather than stored generated columns since `CURRENT_DATE` is non-immutable in PostgreSQL.
- Foreign keys correctly match existing schema types: `surgery_id BIGINT`, `patient_id BIGINT`, `released_claim_id UUID`, `facility_id UUID`.
- Zero purple tokens enforced in `UnbilledCaseDetectionView.css` and `UnbilledCaseDetectionView.jsx`.
