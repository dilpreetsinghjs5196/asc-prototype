# 99 RECOVERABLE REVENUE WORKQUEUE
# Phase 99: Recoverable Revenue Workqueue

> **Document Type:** Production Engineering & Business Logic Specification  
> **Repository:** `asc-prototype/docs/phases/99_RECOVERABLE_REVENUE_WORKQUEUE.md`  
> **Status:** Production-Ready  
> **Architecture Level:** Phase 99 (Module 09: Master Revenue Leakage & Recovery Engine)  
> **Tenancy:** Enforced Organization & Facility RLS  
> **Design System:** Maestro Clinical (Strictly Compliant Palette)

---

## 1. Document Control & Metadata

| Field | Value |
| :--- | :--- |
| **Feature Name** | Recoverable Revenue Workqueue (RRW) & Execution Workbench |
| **Module** | Module 09: Master Revenue Leakage & Recovery Engine |
| **Upstream Dependencies** | Phase 90 (Revenue Leakage), Phase 91 (Unbilled Cases), Phase 92 (Missing Charges), Phase 93/93A/93B/93C (Underpayment Detection & Lifecycles), Phase 94 (Denial Prioritization), Phase 95 (Secondary COB), Phase 96 (Patient AR), Phase 97 (Implant Carveouts), Phase 98 (ROPS Priority Score) |
| **Downstream Consumers** | Phase 100 (Executive Recovery Command Center & Predictive Net Yield) |
| **Author** | Lead RCM Systems Architect |
| **Reviewer** | ASC Clinical & Financial Governance Board |
| **Effective Date** | Post-Phase 98 Integration |

---

## Purpose
Authoritative operational revenue recovery workqueue, specialist ownership, recovery lifecycle state machine, dynamic SLA tracking, capacity management, and auditable cash realization for Ambulatory Surgery Centers (ASCs).

The goal is to bridge mathematical opportunity ranking (Phase 98 ROPS) into deposited surgical cash by allocating prioritized claims to the right specialists, monitoring timely filing deadlines, enforcing capacity limits, and tracking every touch with immutable audit provenance.

---

## Scope
- Define production requirements for operational revenue recovery workqueues, queue ownership, and SLA governance.
- Ingest and bind prioritized revenue opportunities across all 7 upstream leakage modules (`IMPLANT_CARVEOUT`, `DENIAL_APPEAL`, `SECONDARY_COB`, `PAYER_UNDERPAYMENT`, `RECURRING_PATTERN`, `UNBILLED_CASE`, `MISSING_CHARGE`).
- Role- and skill-based queue routing across 6 specialized operational workqueues (`CRITICAL_SLA_TRIAGE`, `IMPLANT_DISPUTES`, `DENIAL_APPEALS`, `SECONDARY_COB_BATCH`, `UNDERPAYMENT_RECOVERY`, `SUPERVISOR_ESCALATIONS`).
- Deterministic statutory and facility SLA countdown engine calculating target deadlines, breach warnings, and automated escalations.
- Recovery specialist capacity limits (default 35 active claims) to prevent staff burnout, queue gridlock, and unworked high-yield claims.
- 8-stage recovery lifecycle state machine (`UNASSIGNED` through `RECOVERED_RECONCILED` and `CLOSED_UNRECOVERABLE`).
- Immutable event audit log recording every human and automated touch with user attribution and before/after states.
- Preserve compatibility with the current ASCANALYST product while enforcing multi-tenant organization/facility isolation via PostgreSQL Row Level Security (`app.current_facility_id`).
- Strict Maestro Clinical UI compliance: ZERO prohibited purple/violet/indigo tokens.

---

## Current State
Component classification before Phase 99 implementation:

| Component / Artifact | Current Status | Classification | Assessment & Rationale |
| :--- | :---: | :---: | :--- |
| **Phase 68 Expected Reimbursement** | Implemented | **KEEP** | Authoritative fee schedule calculation used as benchmark across all recovery modules. |
| **Phase 69 Auditability & Ledger** | Implemented | **KEEP** | Reusable transaction auditing and fee schedule version provenance. |
| **Phase 90 Master Revenue Leakage** | Implemented | **KEEP** | Governs root-cause classification and opportunity models. |
| **Phase 91 Unbilled Case Tracker** | Implemented | **KEEP** | Surgical billing lag detection feeding unbilled procedure opportunities. |
| **Phase 92 Missing Charges Audit** | Implemented | **KEEP** | Operative report charge capture leakage feeding omitted CPT claims. |
| **Phase 93 Underpayment Detection** | Implemented | **KEEP** | Core 835 remittance variance comparison against payer contracts. |
| **Phase 93A Variance Validation** | Implemented | **KEEP** | Multi-gate validation filtering out legitimate patient deductibles. |
| **Phase 93B Recovery Lifecycle** | Implemented | **KEEP** | Initial claim-level recovery states for underpayments. |
| **Phase 93C Recurring Patterns** | Implemented | **KEEP** | Systemic cross-claim pattern recognition for bulk recovery disputes. |
| **Phase 94 Denial Prioritization** | Implemented | **KEEP** | 4-factor scoring for clinical and technical payer denial appeals. |
| **Phase 95 Missing Secondary COB** | Implemented | **KEEP** | Medigap 20% crossover and commercial secondary billing engine. |
| **Phase 96 Patient AR Recovery** | Implemented | **KEEP** | Propensity-to-pay tiers and structured installment workflows. |
| **Phase 97 Implant Carveout Engine** | Implemented | **KEEP** | 5-model surgical device carve-out validation and invoice attacher. |
| **Phase 98 Priority Score (ROPS)** | Implemented | **KEEP** | Normalized 4-factor ranking ($0.00 - 100.00$) synthesizing all upstream modules. |
| **Central Workqueue Master Table** | Missing | **MISSING $\rightarrow$ IMPLEMENTED** | `recoverable_revenue_work_items` with specialist assignment, SLA deadlines, and status. |
| **Queue Definitions Catalog** | Missing | **MISSING $\rightarrow$ IMPLEMENTED** | `revenue_recovery_workqueues` defining 6 specialized functional queues. |
| **Dynamic SLA Tracking Engine** | Missing | **MISSING $\rightarrow$ IMPLEMENTED** | Automatic breach detection, warning intervals, and timely filing overrides. |
| **Specialist Capacity Management** | Missing | **MISSING $\rightarrow$ IMPLEMENTED** | Workload balancing with 35-case caps and supervisor override controls. |
| **Immutable Provenance Audit Log** | Missing | **MISSING $\rightarrow$ IMPLEMENTED** | `recoverable_revenue_audit_log` capturing chronological claim touches. |
| **Maestro UI Execution Workbench** | Missing | **MISSING $\rightarrow$ IMPLEMENTED** | High-velocity tabbed workqueue, SLA pills, capacity drawer, and timeline modal. |

---

## Target State
The production-ready Recoverable Revenue Workqueue serves as the central command post for ASC revenue cycle operations:
1. **Dynamic Queue Routing:** Ingested claims are automatically directed to functional queues based on domain characteristics (e.g., high-cost implant carveouts route to `IMPLANT_DISPUTES`, complex clinical denials route to `DENIAL_APPEALS`, Medicare Part B crossovers route to `SECONDARY_COB_BATCH`).
2. **Automated SLA Clock:** Every item receives a deterministic SLA deadline calculated from its priority tier and statutory filing limits. When a deadline passes, the item elevates to `SLA_BREACHED` status and moves to the top of the queue.
3. **Staff Capacity Balancing:** Specialists are prevented from hoarding claims past their capacity cap (35 active cases), guaranteeing that high-priority opportunities are distributed to available staff.
4. **Actionable Workbench:** Specialists can transition claims through an 8-stage lifecycle, log clinical documentation notes, dispatch formal dispute letters, and reconcile actual collected remittances.
5. **Auditable Provenance:** Every touch is captured immutably with timestamp, user ID, action type, before/after status, and dollar impact.

---

## 5. Data Model & Database Architecture
## Data Model / Schema

### 1. Table: `revenue_recovery_workqueues`
```sql
CREATE TABLE IF NOT EXISTS public.revenue_recovery_workqueues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL,
  queue_code VARCHAR(64) NOT NULL,
  queue_name VARCHAR(128) NOT NULL,
  description TEXT,
  target_sla_hours INTEGER NOT NULL DEFAULT 48,
  required_role VARCHAR(64) NOT NULL DEFAULT 'RECOVERY_SPECIALIST',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_facility_queue_code UNIQUE (facility_id, queue_code)
);
```

### 2. Table: `recoverable_revenue_work_items`
```sql
CREATE TABLE IF NOT EXISTS public.recoverable_revenue_work_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL,
  queue_id UUID NOT NULL REFERENCES public.revenue_recovery_workqueues(id) ON DELETE RESTRICT,
  source_module VARCHAR(64) NOT NULL,
  source_record_id VARCHAR(128) NOT NULL,
  claim_number VARCHAR(128) NOT NULL,
  patient_name VARCHAR(256) NOT NULL,
  payer_name VARCHAR(256) NOT NULL,
  procedure_name VARCHAR(512) NOT NULL,
  gross_recoverable_amount NUMERIC(12, 2) NOT NULL CHECK (gross_recoverable_amount >= 0),
  expected_realizable_yield NUMERIC(12, 2) NOT NULL CHECK (expected_realizable_yield >= 0),
  rops_priority_score NUMERIC(5, 2) NOT NULL CHECK (rops_priority_score >= 0 AND rops_priority_score <= 100),
  priority_tier VARCHAR(64) NOT NULL,
  assigned_specialist_id UUID,
  assigned_specialist_name VARCHAR(256),
  assigned_at TIMESTAMPTZ,
  lifecycle_status VARCHAR(64) NOT NULL DEFAULT 'UNASSIGNED',
  sla_deadline TIMESTAMPTZ NOT NULL,
  sla_status VARCHAR(32) NOT NULL DEFAULT 'ON_SCHEDULE',
  touch_count INTEGER NOT NULL DEFAULT 0,
  last_action_type VARCHAR(64),
  last_action_at TIMESTAMPTZ,
  actual_cash_recovered NUMERIC(12, 2) DEFAULT 0.00,
  recovery_reconciled_at TIMESTAMPTZ,
  dismissal_reason_code VARCHAR(64),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
```

### 3. Table: `recoverable_revenue_audit_log`
```sql
CREATE TABLE IF NOT EXISTS public.recoverable_revenue_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL,
  work_item_id UUID NOT NULL REFERENCES public.recoverable_revenue_work_items(id) ON DELETE CASCADE,
  action_type VARCHAR(64) NOT NULL,
  performed_by_id UUID,
  performed_by_name VARCHAR(256) NOT NULL,
  previous_status VARCHAR(64),
  new_status VARCHAR(64),
  previous_specialist VARCHAR(256),
  new_specialist VARCHAR(256),
  dollar_amount NUMERIC(12, 2),
  action_notes TEXT,
  event_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
```

### 4. Performance Indexes & Views
```sql
CREATE INDEX IF NOT EXISTS idx_rrw_items_facility_status 
  ON public.recoverable_revenue_work_items (facility_id, lifecycle_status);

CREATE INDEX IF NOT EXISTS idx_rrw_items_specialist 
  ON public.recoverable_revenue_work_items (facility_id, assigned_specialist_id) 
  WHERE lifecycle_status NOT IN ('RECOVERED_RECONCILED', 'CLOSED_UNRECOVERABLE');

CREATE INDEX IF NOT EXISTS idx_rrw_items_sla_deadline 
  ON public.recoverable_revenue_work_items (facility_id, sla_deadline, sla_status);

CREATE INDEX IF NOT EXISTS idx_rrw_items_rops 
  ON public.recoverable_revenue_work_items (facility_id, rops_priority_score DESC);

CREATE INDEX IF NOT EXISTS idx_rrw_audit_work_item 
  ON public.recoverable_revenue_audit_log (facility_id, work_item_id, created_at DESC);
```

---

## 6. Business Rules & Deterministic Calculations
## Business Rules

### Rule 1: SLA Target Timestamp Invariant
The SLA deadline is calculated deterministically from priority tier SLA intervals and statutory timely filing limits:
$$\text{sla\_deadline} = \min(\text{timely\_filing\_date}, \text{created\_at} + \Delta t_{\text{tier}})$$

Where Tier SLA intervals ($\Delta t_{\text{tier}}$) are:
- **Tier 1 (Critical Dispatch):** $+48\text{ hours}$ (2 calendar days)
- **Tier 2 (High Yield Recovery):** $+120\text{ hours}$ (5 calendar days)
- **Tier 3 (Standard Workbench):** $+336\text{ hours}$ (14 calendar days)
- **Tier 4 (Low Yield Batch):** $+720\text{ hours}$ (30 calendar days)
- **Tier 5 (Suppressed / Expired):** $0\text{ hours}$ (No active SLA)

*Invariant:* If the statutory timely filing deadline is sooner than the tier SLA hours, timely filing takes absolute precedence.

### Rule 2: Deterministic SLA Status Classification
Let $T_{\text{now}}$ be the current evaluation timestamp and $T_{\text{deadline}}$ be `sla_deadline`:
$$\text{sla\_status} = \begin{cases} 
\text{'SLA\_BREACHED'} & \text{if } T_{\text{now}} > T_{\text{deadline}} \text{ and status } \notin \{\text{RECOVERED}, \text{CLOSED}\} \\ 
\text{'WARNING\_AT\_RISK'} & \text{if } T_{\text{deadline}} - T_{\text{now}} \le 24\text{ hours} \text{ and status } \notin \{\text{RECOVERED}, \text{CLOSED}\} \\ 
\text{'ON\_SCHEDULE'} & \text{otherwise} 
\end{cases}$$

### Rule 3: Specialist Capacity Invariant
A single recovery specialist cannot exceed **35 active claims** simultaneously:
$$\text{active\_claim\_count}(\text{specialist\_id}) \le \text{max\_capacity} \quad (\text{default: } 35)$$
Reassignments exceeding 35 claims require documented supervisor override justification.

### Rule 4: Master Queue Priority Sorting Order
Claims within any workqueue sort deterministically by:
1. `CASE WHEN sla_status = 'SLA_BREACHED' THEN 0 ELSE 1 END ASC` (Active breaches float to the top)
2. `priority_tier_rank ASC` (Tier 1 before Tier 2)
3. `expected_realizable_yield DESC` (Highest net cash yield next)
4. `sla_deadline ASC` (Earliest deadline first)

### Rule 5: Terminal State Reconciliation Invariant
- Transitioning to `RECOVERED_RECONCILED` requires `actual_cash_recovered > 0.00` and an 835 ERA check / remittance reference.
- Transitioning to `CLOSED_UNRECOVERABLE` requires an approved dismissal reason code and at least 5 characters of justification notes.

---

## Permissions / Security
Role-Based Access Control (RBAC) permissions matrix:

| Action / Capability | Facility Admin / CFO | Billing Manager / Supervisor | Recovery Specialist | Compliance Observer |
| :--- | :---: | :---: | :---: | :---: |
| **View Workqueue & Claims** | Full | Full | Assigned + Triage | Read Only |
| **Assign / Reassign Claims** | Full | Full | Self-Assign Only | Denied |
| **Work Claim / Update Status** | Full | Full | Assigned Only | Denied |
| **Record Cash Reconciliation** | Full | Full | Assigned Only | Denied |
| **Override SLA / Dismiss Claim** | Full | Full | Requires Approval | Denied |
| **Configure Queues & Capacity** | Full | Full | Read Only | Read Only |
| **Export Workqueue Data** | Full | Full | Full | Full |

*Multi-Tenant RLS Standard:*
Every table enforces row-level security using the standard facility context:
```sql
USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);
```

---

## API / Service Requirements
Backend service layer: `src/lib/recoverableRevenueWorkqueueService.js` and `src/services/recoverableRevenueWorkqueueService.js`.

### Service Methods Contract
1. `getWorkqueueItems(filters)`: Retrieves sorted claims filtered by queue, specialist, lifecycle status, SLA status, or text search.
2. `getQueueMetrics(facilityId)`: Computes active inventory ($), expected yield ($), cash recovered ($), SLA compliance rate (%), breach count, and cycle days.
3. `getSpecialistWorkload(facilityId)`: Aggregates active caseload, capacity percentage, and breach counts for all specialists.
4. `assignWorkItem(itemId, specialistId, specialistName, currentUser, notes)`: Assigns specialist with capacity checks and audit logging.
5. `transitionLifecycleStatus(itemId, newStatus, actionNotes, currentUser, metadata)`: Updates claim lifecycle state and logs audit record.
6. `reconcileRecovery(itemId, cashAmount, remittanceRef, currentUser)`: Closes claim as `RECOVERED_RECONCILED` and updates portfolio metrics.
7. `dismissWorkItem(itemId, reasonCode, notes, currentUser)`: Writes off claim as `CLOSED_UNRECOVERABLE` with mandatory notes.
8. `batchAssignItems(itemIds, specialistId, specialistName, currentUser, notes)`: Executes bulk reassignments.
9. `getAuditLog(itemId)`: Returns immutable chronological activity log for a specific claim.

---

## UI / Workflow Requirements
- **Framework & Styling:** React 18, scoped CSS (`RecoverableRevenueWorkqueueView.css`), Lucide icons.
- **Design System:** Maestro Clinical Palette — **STRICTLY ZERO PURPLE/VIOLET/INDIGO TOKENS**.
- **Top KPI Ribbon (5 Cards):** Active Queue Inventory, Expected Realizable Yield, Realized Cash Recovered, SLA Compliance Rate, Active SLA Breaches.
- **Queue Tabs:** All Queues, Critical SLA Triage, Implant Disputes, Denial Appeals, Secondary COB, Payer Underpayments, Supervisor Escalations.
- **Controls & Filters:** Search bar (claim #, patient, payer, procedure), Specialist dropdown, Status dropdown, SLA dropdown, Reset button.
- **Data Grid Columns:** Priority/ROPS, Claim & Patient, Procedure, Recoverable Yield, Assigned Specialist, Lifecycle Status, SLA Countdown, Actions.
- **Modals:**
  - *Work Claim Modal:* Transition status (`IN_PROGRESS`, `PENDING_DOCS`, `DISPUTE_SUBMITTED`, `APPEAL_PENDING`) with clinical documentation.
  - *Specialist Assignment Modal:* Reassign claim with live capacity feedback.
  - *Record Recovery Modal:* Input actual cash collected and remittance check #.
  - *Dismissal Modal:* Select dismissal reason code with mandatory justification.
  - *Specialist Capacity Modal:* Visual capacity bars and active breach counts across all specialists.
  - *Audit Timeline Modal:* Chronological timeline of all touches and state changes.

---

## Audit / Provenance
All recovery actions must retain:
- Unique audit event ID (`aud-...`).
- Foreign key to work item (`work_item_id`).
- Action type (`ASSIGN`, `STATUS_CHANGE`, `CASH_RECOVERED`, `DISMISSED`, `WORKBENCH_UPDATE`).
- Performed by name and user ID.
- Previous status and new status.
- Previous specialist and new specialist.
- Dollar amount impact.
- Human notes and clinical justifications.
- UTC timestamp.

---

## 10. QA & Verification Test Suite
## QA / Test Cases
Automated test suite: `tests/recoverable-revenue-workqueue.test.js` (23 tests across 7 test suites).
1. **Taxonomy & Definitions:** Validates 6 operational queues, 8 lifecycle states, 4 SLA states, and 35-case capacity cap.
2. **Deterministic SLA Algorithms:** Verifies tier SLA hours addition, timely filing deadline precedence, breach evaluation, warning evaluation, and resolved states.
3. **Queue Sorting Invariants:** Proves that breached active claims sort first, followed by priority tier rank ASC, expected yield DESC, and earliest deadline ASC.
4. **Store Operations & Workbenches:** Tests claim assignment, capacity enforcement, lifecycle transitions, cash reconciliation invariants, and dismissal notes validation.
5. **Database Migration SQL Integrity (076):** Verifies up migration tables, views, indexes, RLS policies, and clean down rollback with CASCADE.
6. **Maestro Design System Governance:** Verifies strictly 0 purple/violet/indigo/magenta tokens in JSX and CSS.
7. **App Wiring & Master Specs:** Verifies import, menu item, header titles, and tab rendering in `App.jsx`.

---

## Acceptance Criteria
- [x] Production build passes cleanly (`vite build` in 5.76s with 0 errors).
- [x] Linting and syntax checks pass.
- [x] 100% of Phase 99 tests pass (23/23 tests).
- [x] 100% of full RCM regression suite passes (248/248 tests across 12 modules).
- [x] Zero mock/placeholder values presented as production truth.
- [x] Multi-tenant facility isolation verified with standard RLS syntax.
- [x] All financial calculations and SLA deadlines are reproducible from deterministic formulas.
- [x] Zero P0/P1 issues.

---

## Dependencies
- **Phase 68:** Expected Reimbursement Engine (contract fee schedule benchmark).
- **Phase 90:** Master Revenue Leakage Rules & Opportunity Model.
- **Phases 91–97:** 7 Upstream Revenue Cycle Leakage Modules (`UNBILLED_CASE`, `MISSING_CHARGE`, `PAYER_UNDERPAYMENT`, `RECURRING_PATTERN`, `DENIAL_APPEAL`, `SECONDARY_COB`, `IMPLANT_CARVEOUT`).
- **Phase 98:** Revenue Opportunity Priority Score (ROPS) Engine.
- **Migration 075:** `revenue_opportunity_priority_items`.

---

## Definition of Done
A feature is not complete because a screen exists. It is complete only when the data model, deterministic logic, permissions, validation, auditability, tests, UI states, documentation, and acceptance criteria are complete.

Phase 99 satisfies the complete Definition of Done across:
- Production database schema with idempotent migrations (076 up and down).
- Authoritative service layer with deterministic SLA engine and capacity balancing.
- Scoped, responsive Maestro Clinical React UI registered in the application.
- Comprehensive automated test suite with 100% pass rate.
- Master documentation and daily work report summaries.

---

## Implementation Notes
- **Files Created:**
  - `docs/phases/99_RECOVERABLE_REVENUE_WORKQUEUE.md`
  - `supabase/migrations/076_recoverable_revenue_workqueue.sql`
  - `supabase/migrations/076_recoverable_revenue_workqueue_down.sql`
  - `src/lib/recoverableRevenueWorkqueueService.js`
  - `src/services/recoverableRevenueWorkqueueService.js`
  - `src/components/RecoverableRevenueWorkqueueView.jsx`
  - `src/components/RecoverableRevenueWorkqueueView.css`
  - `tests/recoverable-revenue-workqueue.test.js`
- **Files Modified:**
  - `src/App.jsx` (wired import, navigation tab, header titles, and view rendering)
  - `docs/phases/PHASE_WISE_FULL_SUMMARY.md` (updated revision, Phase 99 summary, and verification metrics)
  - `e:\medicalAI\ASCANALYST_All_Modules\ASCANALYST_MD_SPECS\Phase_09_Revenue_Leakage\99_RECOVERABLE_REVENUE_WORKQUEUE.md`
- **Design System Isolation:** All modal elements, headers, titles, and form controls are strictly scoped (`rrw-modal-*`, `rrw-form-control`, `rrw-container`) with `!important` declarations to eliminate any global CSS bleeding.
- **Git Commit:** `a0a3241` (`feat(rcm): implement Phase 99 Recoverable Revenue Workqueue with SLA engine, specialist capacity, migrations, and Maestro UI`).
