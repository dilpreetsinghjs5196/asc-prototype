# 90 REVENUE LEAKAGE ENGINE

## Purpose
Production specification for the Ambulatory Surgery Center (ASC) Revenue Leakage Engine: master rule governance, multi-category leakage opportunity identification, clinical evidence compilation, deterministic recovery scoring, and end-to-end recovery lifecycle management. This subsystem detects unbilled implants, uncaptured secondary procedures, modifier omissions, contract fee underpayments, timely filing threshold exposures, and documentation deficiencies, transforming clinical and operational data into recoverable net revenue.

## Scope
- Define master revenue leakage rule taxonomy across 6 core surgical ASC risk categories:
  1. `UNBILLED_IMPLANT`: High-cost surgical implants, grafts, hardware, anchors, and mesh documented in OR implant logs or vendor consignment invoices but absent from billed claims (e.g., HCPCS C1713, C1776, L-codes, rev code 0278).
  2. `UNBILLED_PROCEDURE`: Secondary surgical procedures performed per operative notes (e.g., extensive debridement 11042/11044 during arthroscopy, lateral release, hernia repair components) omitted from the superbill or claim.
  3. `MODIFIER_OMISSION`: Missed distinct procedural modifiers (-59, -XE, -XP, -XS, -XU), bilateral modifiers (-50, RT/LT), staged or repeat procedure modifiers (-58, -76, -78, -79), and assistant surgeon modifiers (-80, -AS).
  4. `CONTRACT_UNDERPAYMENT`: Commercial payer underpayments failing contracted fee schedule terms, implant invoice pass-through carve-outs (e.g., Cost + 15%), or improper multiple procedure discounting.
  5. `TIMELY_FILING_RISK`: Surgeries approaching payer submission deadlines (e.g., 90-day commercial or 180-day Medicaid limits) held in coding queues or document query status.
  6. `DOCUMENTATION_DEFICIENCY`: Completed OR cases missing physician dictation, pathology confirmation, or medical necessity justification, stalling claim release.
- Define deterministic opportunity prioritization, recovery probability scoring, and financial invariants:
  - Stored generated expected recovery calculation:
    $$\text{expected\_recovery\_amount} = \text{potential\_recovery\_amount} \times \left(\frac{\text{recovery\_probability}}{100.0}\right)$$
  - Opportunity Priority Score ($0.0 - 100.0$) weighting dollar impact, probability, and filing deadline urgency.
- Establish an auditable 7-state Opportunity Lifecycle State Machine:
  - `DETECTED` $\rightarrow$ `UNDER_REVIEW` $\rightarrow$ `VALIDATED_OPPORTUNITY` $\rightarrow$ `REBILL_SUBMITTED` $\rightarrow$ `RECOVERED` (or `DISMISSED_VALID_ADJ` / `EXPIRED_TIMELY_FILING`).
- Support clinical and billing evidence linkage (`rcm_leakage_evidence`): OR nursing notes, operative dictations, vendor delivery slips, and EDI 835 CLP adjudication line items.
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
- **Phase 89 (Reconciliation Engine)**: Four-way financial matching and discrepancy resolution (`063_reconciliation_engine.sql`): **KEEP**.
- **Phase 90 (Revenue Leakage Engine)**:
  - Master rule definitions table (`rcm_leakage_rules`): **IMPLEMENTED** (`064_revenue_leakage_engine.sql`).
  - Identified opportunity pipeline table (`rcm_leakage_opportunities`): **IMPLEMENTED** (`064_revenue_leakage_engine.sql`).
  - Clinical and billing evidence ledger (`rcm_leakage_evidence`): **IMPLEMENTED** (`064_revenue_leakage_engine.sql`).
  - Real-time aggregated pipeline views (`vw_rcm_leakage_opportunities_summary`, `vw_rcm_leakage_surgeon_scorecard`): **IMPLEMENTED**.
  - Interactive Revenue Leakage Workbench UI (`RevenueLeakageView.jsx`, `RevenueLeakageView.css`): **IMPLEMENTED**.

## Target State
1. **Master Rule Governance**:
   - Central table `rcm_leakage_rules` maintaining rule codes, categories, triggers, detection SQL patterns, and default recovery probabilities.
2. **Deterministic Opportunity Pipeline**:
   - Central table `rcm_leakage_opportunities` tracking identified leaks linked to `facility_id`, `surgery_id` (`BIGINT`), `claim_id` (`UUID`), and `patient_id` (`BIGINT`).
   - Stored generated column for expected recovery amount.
3. **Surgeon & Specialty Scorecards**:
   - Analytical aggregation identifying root-cause leakage patterns by surgeon and specialty, enabling targeted clinical documentation and coding education.
4. **Interactive Revenue Leakage Workbench**:
   - Executive KPI ribbon (Total Detected Leakage, Validated Pipeline, Realized Recovered Cash, Recovery Yield Rate).
   - Multi-tab navigation: Pipeline Matrix, Rule Engine, Surgeon Scorecard, and Rebill Tracking.
   - Validation and Rebill Action modal with zero-loss audit logging.

## Data Model / Schema

### 1. `rcm_leakage_rules` (Master Rule Catalog)
- `id` (UUID PRIMARY KEY DEFAULT gen_random_uuid())
- `facility_id` (UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE)
- `rule_code` (VARCHAR(32) NOT NULL UNIQUE)
- `category` (VARCHAR(40) NOT NULL CHECK (category IN (
    'UNBILLED_IMPLANT',
    'UNBILLED_PROCEDURE',
    'MODIFIER_OMISSION',
    'CONTRACT_UNDERPAYMENT',
    'TIMELY_FILING_RISK',
    'DOCUMENTATION_DEFICIENCY'
  )))
- `title` (VARCHAR(128) NOT NULL)
- `description` (TEXT NOT NULL)
- `detection_logic` (TEXT NOT NULL)
- `severity` (VARCHAR(16) NOT NULL DEFAULT 'HIGH' CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')))
- `threshold_amount` (NUMERIC(14,2) NOT NULL DEFAULT 100.00 CHECK (threshold_amount >= 0))
- `default_recovery_probability` (NUMERIC(5,2) NOT NULL DEFAULT 75.00 CHECK (default_recovery_probability BETWEEN 0.00 AND 100.00))
- `is_active` (BOOLEAN NOT NULL DEFAULT true)
- `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
- `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())

### 2. `rcm_leakage_opportunities` (Identified Case Pipeline)
- `id` (UUID PRIMARY KEY DEFAULT gen_random_uuid())
- `facility_id` (UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE)
- `opportunity_number` (VARCHAR(64) NOT NULL UNIQUE)
- `rule_id` (UUID NOT NULL REFERENCES public.rcm_leakage_rules(id) ON DELETE RESTRICT)
- `surgery_id` (BIGINT REFERENCES public.surgeries(id) ON DELETE SET NULL)
- `claim_id` (UUID REFERENCES public.claims(id) ON DELETE SET NULL)
- `patient_id` (BIGINT REFERENCES public.patients(id) ON DELETE SET NULL)
- `surgeon_name` (VARCHAR(128) NOT NULL)
- `specialty` (VARCHAR(64) NOT NULL)
- `category` (VARCHAR(40) NOT NULL CHECK (category IN (
    'UNBILLED_IMPLANT',
    'UNBILLED_PROCEDURE',
    'MODIFIER_OMISSION',
    'CONTRACT_UNDERPAYMENT',
    'TIMELY_FILING_RISK',
    'DOCUMENTATION_DEFICIENCY'
  )))
- `status` (VARCHAR(32) NOT NULL DEFAULT 'DETECTED' CHECK (status IN (
    'DETECTED',
    'UNDER_REVIEW',
    'VALIDATED_OPPORTUNITY',
    'REBILL_SUBMITTED',
    'RECOVERED',
    'DISMISSED_VALID_ADJ',
    'EXPIRED_TIMELY_FILING'
  )))
- `potential_recovery_amount` (NUMERIC(14,2) NOT NULL CHECK (potential_recovery_amount >= 0))
- `recovery_probability` (NUMERIC(5,2) NOT NULL DEFAULT 75.00 CHECK (recovery_probability BETWEEN 0.00 AND 100.00))
- `expected_recovery_amount` (NUMERIC(14,2) GENERATED ALWAYS AS (
    ROUND(potential_recovery_amount * recovery_probability / 100.0, 2)
  ) STORED)
- `realized_recovered_amount` (NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (realized_recovered_amount >= 0))
- `filing_deadline` (DATE)
- `priority_score` (NUMERIC(5,2) NOT NULL DEFAULT 50.00 CHECK (priority_score BETWEEN 0.00 AND 100.00))
- `detected_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
- `reviewed_at` (TIMESTAMPTZ)
- `reviewed_by` (UUID REFERENCES auth.users(id))
- `action_notes` (TEXT)
- `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
- `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())

### 3. `rcm_leakage_evidence` (Clinical & Billing Exhibits)
- `id` (UUID PRIMARY KEY DEFAULT gen_random_uuid())
- `facility_id` (UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE)
- `opportunity_id` (UUID NOT NULL REFERENCES public.rcm_leakage_opportunities(id) ON DELETE CASCADE)
- `evidence_type` (VARCHAR(40) NOT NULL CHECK (evidence_type IN (
    'OPERATIVE_NOTE',
    'IMPLANT_LOG',
    'VENDOR_INVOICE',
    'PATHOLOGY_REPORT',
    'FEE_SCHEDULE_SCHEDULE',
    'ERA_835_CLP',
    'CODING_AUDIT_TRAIL'
  )))
- `title` (VARCHAR(128) NOT NULL)
- `description` (TEXT)
- `source_reference` (VARCHAR(128))
- `document_url` (TEXT)
- `uploaded_by` (UUID REFERENCES auth.users(id))
- `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())

## Business Rules

### 1. Expected Recovery & Yield Formulas
- **Expected Recovery Amount**:
  $$\text{expected\_recovery\_amount} = \text{ROUND}(\text{potential\_recovery\_amount} \times (\text{recovery\_probability} / 100.0), 2)$$
- **Recovery Yield Rate**:
  $$\text{yield\_rate} = \begin{cases} 
  \text{ROUND}((\text{realized\_recovered\_amount} / \text{potential\_recovery\_amount}) \times 100.0, 2) & \text{if } \text{potential} > 0 \\
  0.00 & \text{otherwise}
  \end{cases}$$

### 2. Algorithmic Priority Score Formula
The priority score ($0.0 - 100.0$) dynamically weights three core dimensions:
1. **Dollar Magnitude ($40\%$)**: $\min(40.0, (\text{potential\_amount} / 10,000.00) \times 40.0)$
2. **Recovery Probability ($35\%$)**: $(\text{recovery\_probability} / 100.0) \times 35.0$
3. **Filing Urgency ($25\%$)**:
   - If days remaining $\le 15$: $25.0$ points.
   - If days remaining $\le 30$: $18.0$ points.
   - If days remaining $\le 60$: $10.0$ points.
   - If days remaining $> 60$ or no deadline: $5.0$ points.

### 3. Lifecycle State Transition Guardrails
- `DETECTED` $\rightarrow$ `UNDER_REVIEW`: Allowed by Billing Specialist, Coding Auditor, or Financial Analyst.
- `UNDER_REVIEW` $\rightarrow$ `VALIDATED_OPPORTUNITY`: Requires confirmation of missing CPT, unbilled implant UDI, or contractual discrepancy.
- `VALIDATED_OPPORTUNITY` $\rightarrow$ `REBILL_SUBMITTED`: Requires electronic claim generation (claim frequency code 7 - Replacement of Prior Claim) or formal payer appeal submission.
- `REBILL_SUBMITTED` $\rightarrow$ `RECOVERED`: Requires positive remittance posting in `rcm_reconciliation_records` or 835 CLP check.
- `UNDER_REVIEW` / `VALIDATED_OPPORTUNITY` $\rightarrow$ `DISMISSED_VALID_ADJ`: Requires mandatory rationale notes (e.g., packaged supply under CMS OPPS/ASC rules, bundled CPT per NCCI edits).
- Any state $\rightarrow$ `EXPIRED_TIMELY_FILING`: Automatic transition if current date exceeds `filing_deadline` without rebill submission.

## Permissions / Security
- **View Opportunities & Scorecards**: `facility_user`, `financial_analyst`, `billing_specialist`, `coding_auditor`, `administrator`.
- **Review & Validate Opportunities**: `billing_specialist`, `coding_auditor`, `administrator`.
- **Submit Rebill / Initiate Appeal**: `billing_specialist`, `administrator`.
- **Dismiss Opportunity (Write-Off / Legitimate Adj)**: `rcm_supervisor`, `billing_specialist`, `administrator`.
- **Configure Rules & Thresholds**: `rcm_director`, `administrator`.
- **RLS Policy**: Multi-facility isolation enforced via `facility_id IN (SELECT public.get_auth_user_facilities())`.

## API / Service Requirements
The service layer (`src/lib/revenueLeakageService.js` and `src/services/revenueLeakageService.js`) provides:
1. `getLeakageRules(filters)`: Retrieves active leakage rule catalog.
2. `getOpportunities(filters)`: Retrieves filtered opportunities with calculated priorities.
3. `getOpportunityById(id)`: Detailed case inspection with linked evidence and audit history.
4. `validateOpportunity(id, { adjustedPotential, probability, notes })`: Validates opportunity and updates expected recovery.
5. `submitRebill(id, { rebillType, claimControlNumber, notes })`: Transitions state to `REBILL_SUBMITTED`.
6. `markRecovered(id, { realizedAmount, remittedAt, notes })`: Transitions state to `RECOVERED`.
7. `dismissOpportunity(id, { reason, notes })`: Transitions state to `DISMISSED_VALID_ADJ`.
8. `calculateExpectedRecovery(potential, probability)`: Authoritative client/server calculation.
9. `calculateOpportunityPriority(potential, probability, daysRemaining)`: Computes $0.0-100.0$ composite priority score.
10. `getLeakageSummaryMetrics(opportunities)`: Aggregates executive KPIs, category breakdowns, and recovery yields.
11. `getSurgeonScorecards(opportunities)`: Aggregates surgeon-level leakage metrics and unbilled rates.

## UI / Workflow Requirements
- **Executive KPI Ribbon**:
  - Total Detected Leakage ($)
  - Validated Recovery Pipeline ($)
  - Realized Cash Recovered ($)
  - Clean Capture / Recovery Yield Index (%)
- **Four Dedicated Workbenches**:
  1. **Pipeline Matrix**: Full case grid with search, category filtering, status pills, priority indicators, and one-click review.
  2. **Rule Engine & Thresholds**: Master rule catalog with detection logic, trigger thresholds, and active status toggles.
  3. **Surgeon Scorecard**: Case-by-case breakdown by surgeon, procedural volume, total missed dollars, and dominant leakage category.
  4. **Rebill & Lifecycle Tracker**: Step-by-step progress tracker following rebills from submission to payment posting.
- **Action Modal**: Detailed review interface allowing opportunity validation, priority updates, rebill submission, or justified dismissal.
- **Maestro Clinical Design System (Rule P0)**: Strictly zero purple/violet/indigo/magenta/fuchsia tokens. High-contrast `#0b1120` canvas, `#0f172a` executive container, `#ffffff` headers.

## Audit / Provenance
All state transitions, dollar amount modifications, and dismissal justifications are logged with:
- `user_id`: Authenticated user executing the action.
- `timestamp`: UTC ISO 8601 timestamp.
- `before_state` & `after_state`: Previous and new lifecycle status.
- `action_notes`: Mandatory textual rationale for validations, rebills, and dismissals.

## QA / Test Cases
Automated test suite (`tests/revenue-leakage-engine.test.js`) verifies:
1. **Rule & State Machine Definitions**:
   - 6 core leakage categories defined with proper metadata.
   - 7 lifecycle states defined with valid transition paths.
2. **Deterministic Financial Formulas**:
   - Expected recovery calculation invariant: $\text{potential} \times (\text{probability} / 100.0)$.
   - Recovery yield rate calculation with zero-division safeguard.
   - Composite priority score calculation with dollar, probability, and filing urgency weighting.
3. **Executive KPI & Scorecard Aggregation**:
   - Total detected leakage, validated pipeline, realized recovered cash, and yield percentage.
   - Surgeon scorecard aggregation accuracy across specialties.
4. **Baseline Dataset Health**:
   - High-fidelity ASC surgical cases (Orthopedics, Ophthalmology, Spine, Pain) with valid implant and secondary CPT opportunities.
5. **Database Migration Parity**:
   - `064_revenue_leakage_engine.sql` table definitions, stored generated columns, indexes, and views.
   - Exact 1:1 parity between `DROP POLICY IF EXISTS` and `CREATE POLICY`.
   - `064_revenue_leakage_engine_down.sql` clean rollback teardown.
6. **Maestro Clinical Design System Governance**:
   - 0 forbidden purple, violet, indigo, magenta, or fuchsia tokens in CSS and JSX.
7. **Application Wiring**:
   - `src/App.jsx` tab navigation, icon, header titles, and view rendering.

## Acceptance Criteria
- Build passes cleanly (`npm run build`).
- Automated tests pass with 100% success rate (`node --test tests/revenue-leakage-engine.test.js`).
- Multi-tenancy RLS isolation enforced on all tables and views.
- No purple tokens present in styles or JSX components.
- Zero mock/placeholder values presented as authoritative production truth.

## Dependencies
- Phase 80: Claims Model (`public.claims`)
- Phase 82: 835 Remittance (`public.edi_835_claim_payments`)
- Phase 83: Payments & Adjustments (`public.rcm_payment_batches`)
- Phase 89: Reconciliation Engine (`public.rcm_reconciliation_records`)

## Definition of Done
A feature is complete only when:
- Master specification document is complete with all 16 canonical sections.
- Database migrations (`064_revenue_leakage_engine.sql` and `_down.sql`) are implemented and syntactically valid.
- Service layer (`src/lib/` and `src/services/`) provides deterministic formulas, status transitions, and queries.
- UI workbench component and CSS comply with Maestro Clinical Design System standards.
- Component is wired into `src/App.jsx`.
- Comprehensive test suite passes with zero failures.
- Production build succeeds without errors.

## Implementation Notes
- Migration `064_revenue_leakage_engine.sql` defines `rcm_leakage_rules`, `rcm_leakage_opportunities`, `rcm_leakage_evidence`, and analytical views `vw_rcm_leakage_opportunities_summary` and `vw_rcm_leakage_surgeon_scorecard`.
- Stored generated column `expected_recovery_amount GENERATED ALWAYS AS (ROUND(potential_recovery_amount * recovery_probability / 100.0, 2)) STORED` guarantees database-level arithmetic integrity.
- Foreign keys correctly match existing schema types: `surgery_id BIGINT`, `patient_id BIGINT`, `claim_id UUID`, `facility_id UUID`.
- Zero purple tokens enforced in `RevenueLeakageView.css` and `RevenueLeakageView.jsx`.
