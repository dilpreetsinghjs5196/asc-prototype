# D0 NEXT BEST FINANCIAL ACTION

## Purpose
The Next Best Financial Action (NBFA) engine generates a daily, deterministic, and dynamically prioritized queue of high-yield financial actions across Ambulatory Surgery Center (ASC) revenue cycles, clinical scheduling, implant management, and payer contract recovery. It replaces fragmented, ad-hoc billing follow-ups with an objective, auditable ranking model that drives maximum cash recovery, prevents claim expiration, and optimizes operating suite profitability.

## Scope
- Define production requirements for the daily Next Best Financial Action recommendation architecture (Module 13: Decision Intelligence).
- Preserve compatibility with ASCANALYST financial ledgers, claims models, denial trackers, and OR scheduling engines.
- Enforce strict deterministic ranking algorithms using multi-parameter scoring (financial value, urgency, recoverability, confidence, and operational effort).
- Maintain rigorous multi-tenant isolation via PostgreSQL Row-Level Security (RLS) linked to `public.facilities(id)`.
- Support role-aware action assignment across Clinical Administrators, RCM Specialists, Materials Managers, and Financial Counselors.
- Deliver audit-grade decision tracking capturing every recommendation lifecycle event (creation, assignment, acceptance, dismissal, and resolution).

## Current State
Prior to Phase D0:
- `RevenueOpportunityPriorityView.jsx` (`activeTab === 'opportunity_priority'`): An existing high-level opportunity summary tab showing macro-level revenue potential ($84,500 supply savings, general unbilled opportunities), but lacking itemized daily workflow tasks, individual claim-level actionable triggers, and structured assignment queues.
  - **Classification:** **KEEP** for macro-level executive rollups; **REFACTOR** to link into D0 daily ranked actions.
- `RecoverableRevenueWorkqueueView.jsx` (`activeTab === 'recovery_workqueue'`): Legacy workqueue focusing strictly on denials and underpayments, but lacking unified cross-domain prioritization (excluding unbilled surgery expediting, OR block releases, and pre-service patient deposits).
  - **Classification:** **KEEP** for traditional RCM billing queues, but **MISSING** cross-functional decision intelligence.
- Action Recommendation Data Model:
  - **Classification:** **MISSING**. No database table currently stores structured daily action cards, composite rank scores, confidence weights, urgency decay rates, or dismissal audit trails.
- Action Assignment & Lifecycle State Machine:
  - **Classification:** **MISSING**. No state machine tracks `PENDING`, `ASSIGNED`, `IN_PROGRESS`, `ACCEPTED`, `DISMISSED`, `COMPLETED`, or `EXPIRED`.

## Target State
Phase D0 delivers an enterprise-grade Next Best Financial Action platform:
1. **Unified Cross-Domain Opportunity Intake:**
   - Ingests opportunities across 7 clinical and financial domains:
     - `DENIAL_APPEAL_URGENT`: Expiring CARC appeal filing deadlines (filing limit within $\le 5$ days).
     - `UNDERPAYMENT_RECOVERY`: Payer payment variance violating contracted fee schedules (e.g., missing implant multiplier).
     - `UNBILLED_CASE_EXPEDITE`: High-margin completed cases missing operative notes, implants, or coding past 48 hours.
     - `OR_BLOCK_RELEASE`: Low-utilization OR block hours subject to release to high-yield waitlist cases before cutoff.
     - `IMPLANT_CARVEOUT_CLAIM`: High-cost implants utilized but missing separate invoice attachment on 837 claim.
     - `SECONDARY_CROSSOVER_SUBMISSION`: Primary payment received but secondary claim not generated within 7 days.
     - `PRE_SERVICE_DEPOSIT_COLLECTION`: Scheduled surgery within 48 hours with unverified patient responsibility.
2. **Deterministic Priority Ranking Model:**
   - Evaluates each candidate action using a multi-parameter scoring formula:
     $$\text{Priority Score} = \left(\frac{\min(V, 25000)}{25000} \times 35\right) + (U \times 0.25) + (R \times 0.20) + (C \times 0.10) + ((100 - E) \times 0.10)$$
     - **Financial Value ($V$, 35%):** Expected recovery or margin upside (capped at \$25,000 reference ceiling).
     - **Urgency ($U$, 25%):** Timeliness risk based on impending deadlines (e.g. appeal filing limit, OR release cutoff).
     - **Recoverability ($R$, 20%):** Historical win-rate probability for similar payer/code combinations.
     - **Confidence ($C$, 10%):** Data completeness and evidence verification strength.
     - **Effort Score ($E$, 10% inverse):** Estimated staff labor required (lower effort yields higher priority).
   - Priority Tiers: `P0 - CRITICAL` ($\ge 85$), `P1 - HIGH` ($70-84$), `P2 - MEDIUM` ($50-69$), `P3 - ROUTINE` ($< 50$).
3. **Structured Lifecycle & State Machine:**
   - Strict transition gates: `PENDING` $\rightarrow$ `ASSIGNED` $\rightarrow$ `IN_PROGRESS` $\rightarrow$ `ACCEPTED` $\rightarrow$ `COMPLETED` (or `DISMISSED` / `EXPIRED`).
   - Dismissals require mandatory structured reason codes (`INELIGIBLE_PAYER_CLAUSE`, `TIMELY_FILING_EXPIRED`, `CLINICAL_DISPUTE_SETTLED`, `LOW_RECOVERY_PROBABILITY`, `DUPLICATE_CLAIM_RESOLVED`) and auditor comments.
4. **Interactive Action Workspace:**
   - 5-metric executive ribbon (Active Actions, Total Recoverable Value, Critical P0 Count, 24h Completion Rate, and Average Realization Velocity).
   - Filterable, sortable daily action matrix with 1-click execution modals, evidence drawer, and quick assignment.

## Data Model / Schema
PostgreSQL Migration `107_next_best_financial_action.sql`:

1. `public.next_best_financial_actions`:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE`
   - `action_code VARCHAR(32) NOT NULL UNIQUE` (e.g., `NBFA-2026-0801`)
   - `category VARCHAR(32) NOT NULL CHECK (category IN ('DENIAL_APPEAL_URGENT', 'UNDERPAYMENT_RECOVERY', 'UNBILLED_CASE_EXPEDITE', 'OR_BLOCK_RELEASE', 'IMPLANT_CARVEOUT_CLAIM', 'SECONDARY_CROSSOVER_SUBMISSION', 'PRE_SERVICE_DEPOSIT_COLLECTION'))`
   - `title VARCHAR(255) NOT NULL`
   - `description TEXT NOT NULL`
   - `source_entity_type VARCHAR(64) NOT NULL` (e.g. `CLAIM`, `SURGICAL_CASE`, `OR_BLOCK`, `INVOICE`)
   - `source_entity_id VARCHAR(64) NOT NULL`
   - `expected_financial_value NUMERIC(12, 2) NOT NULL CHECK (expected_financial_value >= 0.00)`
   - `confidence_score NUMERIC(5, 2) NOT NULL CHECK (confidence_score >= 0.0 AND confidence_score <= 100.0)`
   - `urgency_score NUMERIC(5, 2) NOT NULL CHECK (urgency_score >= 0.0 AND urgency_score <= 100.0)`
   - `recoverability_score NUMERIC(5, 2) NOT NULL CHECK (recoverability_score >= 0.0 AND recoverability_score <= 100.0)`
   - `effort_score NUMERIC(5, 2) NOT NULL CHECK (effort_score >= 0.0 AND effort_score <= 100.0)`
   - `composite_priority_rank NUMERIC(5, 2) NOT NULL`
   - `priority_tier VARCHAR(16) NOT NULL CHECK (priority_tier IN ('P0_CRITICAL', 'P1_HIGH', 'P2_MEDIUM', 'P3_ROUTINE'))`
   - `status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'ACCEPTED', 'DISMISSED', 'COMPLETED', 'EXPIRED'))`
   - `assigned_to VARCHAR(64)`
   - `assigned_role VARCHAR(64)`
   - `dismissal_reason VARCHAR(128)`
   - `dismissal_notes TEXT`
   - `evidence_summary JSONB NOT NULL DEFAULT '[]'::jsonb`
   - `due_date TIMESTAMPTZ`
   - `expires_at TIMESTAMPTZ`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

2. `public.nbfa_action_events`:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `action_id UUID NOT NULL REFERENCES public.next_best_financial_actions(id) ON DELETE CASCADE`
   - `facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE`
   - `event_type VARCHAR(32) NOT NULL CHECK (event_type IN ('CREATED', 'ASSIGNED', 'STATUS_CHANGE', 'DISMISSED', 'COMPLETED', 'ESCALATED'))`
   - `previous_status VARCHAR(32)`
   - `new_status VARCHAR(32) NOT NULL`
   - `performed_by VARCHAR(64) NOT NULL`
   - `notes TEXT`
   - `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

3. `public.vw_nbfa_facility_telemetry` (View):
   - Aggregates real-time KPIs: active action counts, total recoverable pipeline value, critical P0 volume, average recoverability rate, and completed action count by facility.

## Business Rules
1. **Zero Generative Arithmetic:**
   - Financial value and priority rankings are computed server-side deterministically; generative LLMs are strictly forbidden from fabricating dollar recoveries or modifying score weights.
2. **Urgency Score Escalation:**
   - Actions with hard deadlines (e.g. timely filing limit $< 72$ hours) escalate urgency to 95.0+, automatically promoting the action to `P0_CRITICAL`.
3. **Mandatory Dismissal Rationale:**
   - An action cannot transition to `DISMISSED` without selecting a valid canonical reason code and entering supporting justification.
4. **Tenancy Boundary:**
   - Actions are bound to `facility_id`. Users may only view and interact with recommendations belonging to their active facility.
5. **Role-Aware Assignment:**
   - `DENIAL_APPEAL_URGENT` and `UNDERPAYMENT_RECOVERY` default to `billing_specialist` / `rcm_manager`.
   - `OR_BLOCK_RELEASE` defaults to `or_director` / `clinical_admin`.
   - `PRE_SERVICE_DEPOSIT_COLLECTION` defaults to `front_desk` / `financial_counselor`.

## Permissions / Security
- `decision_intel:view`: View daily ranked financial actions, metrics, and evidence. (Roles: `super_admin`, `org_admin`, `clinical_admin`, `financial_controller`, `billing_specialist`, `materials_manager`).
- `decision_intel:assign`: Assign actions to staff members or self-assign. (Roles: `super_admin`, `org_admin`, `clinical_admin`, `financial_controller`, `billing_specialist`).
- `decision_intel:execute`: Accept, execute, or complete actions. (Roles: `super_admin`, `org_admin`, `clinical_admin`, `billing_specialist`).
- `decision_intel:dismiss`: Dismiss actions with required justification. (Roles: `super_admin`, `org_admin`, `clinical_admin`, `financial_controller`).

## API / Service Requirements
- `getNextBestFinancialActions(facilityId, filters)`: Query active ranked actions with domain, priority, and status filters.
- `executeActionTransition(actionId, newStatus, userContext)`: Execute valid state machine transition with event recording.
- `dismissAction(actionId, reasonCode, notes, userContext)`: Dismiss action with mandatory audit trail.
- `calculatePriorityScore(actionData)`: Deterministic mathematical scoring function.
- `getNBFATelemetry(facilityId)`: Retrieve facility-level summary metrics.

## UI / Workflow Requirements
- **Executive Telemetry Ribbon:** 5 KPI cards displaying Active Queue Count, Total Pipeline Recovery Value, Urgent P0 Count, Realization Rate, and Mean Action Velocity.
- **Filter Toolbar:** Domain tabs (`ALL`, `DENIALS`, `UNDERPAYMENTS`, `UNBILLED`, `OR_BLOCKS`, `IMPLANTS`, `PATIENT_AR`), Priority Filter (`P0`, `P1`, `P2`, `P3`), Status Filter, and text search.
- **Ranked Action Cards & Table View:** Shows action title, domain badge, expected financial value, composite priority score pill, due date countdown, and action button.
- **Action Execution Modal:** Displays source record references, evidence breakdown, step-by-step resolution checklist, and 1-click execution confirmation.
- **Dismissal Modal:** Requires selecting canonical reason and typing auditor notes before confirming dismissal.
- **Maestro Clinical Styling:** Full light and dark theme support, strictly zero prohibited purple/violet tokens.

## Audit / Provenance
- All action state transitions write immutable rows to `public.nbfa_action_events`.
- Events capture `performed_by`, `previous_status`, `new_status`, timestamp, and before/after metadata.
- Cryptographic SHA-256 hash generated for each daily ranking snapshot.

## QA / Test Cases
1. KPI Telemetry returns accurate counts, total pipeline dollar sums, and priority breakdowns.
2. Filter engine correctly slices actions by domain, priority tier, and status.
3. Priority scoring algorithm accurately weights financial value, urgency, recoverability, confidence, and effort.
4. State machine enforces valid status transitions (e.g. `PENDING` $\rightarrow$ `ASSIGNED` $\rightarrow$ `COMPLETED`).
5. Dismissal validation rejects requests lacking valid reason code or auditor notes.
6. Multi-tenant RLS isolation strictly segregates facility actions.
7. Database Migration 107 UP and DOWN SQL integrity verification.
8. Zero-purple design system compliance across JSX and CSS.
9. App shell integration and navigation wiring verification.

## Acceptance Criteria
- Build passes (`npm run build`).
- Lint and type checks pass.
- All unit, integration, and regression tests pass (`npm test`).
- Zero mock or placeholder values presented as authoritative truth.
- Multi-tenant facility isolation verified via RLS.
- Zero-purple Maestro Clinical design token compliance verified.

## Dependencies
- Upstream: Phase 71 (`case_financial_ledger`), Phase 80 (`claims_model`), Phase 85 (`denials_model`), Phase 93 (`underpayment_detection`), Phase A2 (`block_schedule_model`), Phase C4 (`ai_evidence_records`).
- Downstream: Phase D1 (`D1_RECOMMENDATION_PRIORITY_MODEL`), Phase D2 (`D2_RECOMMENDATION_EVIDENCE`), Phase D4 (`D4_DECISION_LEDGER`).

## Definition of Done
Phase D0 is complete when the specification, PostgreSQL migration 107 (UP & DOWN), service layer, React UI components, CSS styles, App shell wiring, and automated test suite are implemented, passing all tests with zero regressions.

## Implementation Notes
- **Specification:** `docs/phases/D0_NEXT_BEST_FINANCIAL_ACTION.md` and `Phase_13_Decision_Intelligence/D0_NEXT_BEST_FINANCIAL_ACTION.md`.
- **Database:** `supabase/migrations/107_next_best_financial_action.sql` and `107_next_best_financial_action_down.sql`.
- **Service:** `src/services/nextBestActionService.js` and `src/lib/nextBestActionService.js`.
- **UI:** `src/components/NextBestFinancialActionView.jsx` and `src/components/NextBestFinancialActionView.css`.
- **Tests:** `tests/next-best-financial-action.test.js`.
