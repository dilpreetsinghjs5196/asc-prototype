# Phase 99: Recoverable Revenue Workqueue

> **Document Type:** Production Engineering & Business Logic Specification  
> **Repository:** `asc-prototype/docs/phases/99_RECOVERABLE_REVENUE_WORKQUEUE.md`  
> **Status:** Production-Ready  
> **Architecture Level:** Phase 99 (Module 09: Master Revenue Leakage & Recovery Engine)  
> **Tenancy:** Enforced Organization & Facility RLS  
> **Design System:** Maestro Clinical (Strictly Zero Purple/Violet/Indigo Tokens)

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

## 2. Purpose & Executive Summary

### 2.1 The Operational Problem
In a busy Ambulatory Surgery Center (ASC), high-value revenue recovery opportunities identified by algorithmic engines often stall due to operational friction:
1. **Queue Fragmentation:** Recovery specialists juggle multiple disparate workbenches (denials in one spreadsheet, implant carveouts in an email thread, secondary COB held up in billing software).
2. **Filing Deadline Breaches:** Timely filing deadlines (e.g. 90-day commercial appeal limits or 180-day Medicare statutory deadlines) lapse unnoticed because there is no unified, dynamic SLA countdown engine.
3. **Staff Capacity Imbalance:** Some recovery specialists are inundated with 80+ complex cases while others have idle capacity, leading to unworked high-yield claims.
4. **Lack of Provenance & Accountability:** Without an immutable event ledger, management cannot audit who worked a claim, what dispute letter was generated, what payer representative was contacted, or why a claim was written off.

### 2.2 The Phase 99 Solution
**Phase 99: Recoverable Revenue Workqueue** is the authoritative **operational execution workbench** for ASC revenue cycle teams. It ingests prioritized items from Phase 98's Revenue Opportunity Priority Score (ROPS) engine and upstream modules, binding them to:
- **Dynamic Queue Routing:** Role- and skill-based queues (`CRITICAL_SLA_TRIAGE`, `IMPLANT_DISPUTES`, `DENIAL_APPEALS`, `SECONDARY_COB_BATCH`, `UNDERPAYMENT_RECOVERY`, `SUPERVISOR_ESCALATIONS`).
- **Deterministic SLA Engine:** Computes statutory and facility SLA deadlines, firing proactive visual alerts (`ON_SCHEDULE`, `WARNING_AT_RISK`, `SLA_BREACHED`).
- **Staff Ownership & Capacity Caps:** Enforces specialist workload limits (default 35 active cases), preventing case abandonment.
- **Recovery Lifecycle State Machine:** Manages state transitions (`UNASSIGNED` $\rightarrow$ `ASSIGNED` $\rightarrow$ `IN_PROGRESS` $\rightarrow$ `PENDING_DOCS` $\rightarrow$ `DISPUTE_SUBMITTED` $\rightarrow$ `APPEAL_PENDING` $\rightarrow$ `RECOVERED_RECONCILED` / `CLOSED_UNRECOVERABLE`).
- **Immutable Provenance Audit Ledger:** Logs every touch, note, phone call, dispute dispatch, and supervisor override with full user attribution.

---

## 3. Scope & Boundaries

### 3.1 In Scope
- Workqueue definitions, specialist assignment, and rebalancing.
- SLA deadline calculation based on priority tiers and statutory filing limits.
- SLA breach detection and automated escalation triggers.
- Multi-action workbench (assign, start work, request clinical documentation, submit dispute, record cash recovery, dismiss/write-off).
- Batch operations (bulk assignment, bulk escalation, bulk re-triage).
- Immutable audit event logging with before/after state snapshots.
- Specialist workload capacity monitoring and productivity metrics ($/specialist/day).
- Full tenant isolation via PostgreSQL Row Level Security (RLS).

### 3.2 Out of Scope
- Direct EDI 277CA / 837 dispatch (delegated to Clearinghouse Gateway Phase 80-89).
- Automated AI phone calling to payers (future external telephony integration).
- Cross-facility portfolio debt sale (handled in Phase 96 / Legal Collections).

---

## 4. Current State vs. Target State Analysis

| Component | Existing Prototype State | Target Production State | Classification |
| :--- | :--- | :--- | :---: |
| **Upstream ROPS Scoring (075)** | Generates composite score & priority tiers | Feeds authoritative candidate items into Workqueue | **KEEP** |
| **Workqueue Master Table** | None | `recoverable_revenue_work_items` with SLA, specialist ID, and lifecycle state | **MISSING** |
| **Queue Definitions** | Ad-hoc domain filtering | `revenue_recovery_workqueues` with skill routing and target SLA hours | **MISSING** |
| **SLA Tracking Engine** | Static days-remaining counter | Dynamic SLA deadline timestamp, automated breach detection, urgency boost | **MISSING** |
| **Workload Balancing** | Manual individual claim selection | Specialist capacity caps (35 max), auto-rebalance, workload summaries | **MISSING** |
| **Audit Ledger** | Session-only toast notifications | `recoverable_revenue_audit_log` with immutable event history and user attribution | **MISSING** |
| **UI Execution Workbench** | ROPS table with action modals | High-velocity tabbed workqueue, SLA countdown pills, quick-action drawer, bulk action bar | **MISSING** |

---

## 5. Data Model & Database Architecture

### 5.1 Tables & Schema Definitions

#### Table 1: `revenue_recovery_workqueues`
Defines operational queues for specialized recovery teams.
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

#### Table 2: `recoverable_revenue_work_items`
Central operational workqueue tracking individual recovery assignments, SLA timelines, and lifecycle states.
```sql
CREATE TABLE IF NOT EXISTS public.recoverable_revenue_work_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL,
  queue_id UUID NOT NULL REFERENCES public.revenue_recovery_workqueues(id) ON DELETE RESTRICT,
  source_module VARCHAR(64) NOT NULL, -- IMPLANT_CARVEOUT, DENIAL_APPEAL, SECONDARY_COB, PAYER_UNDERPAYMENT, RECURRING_PATTERN, UNBILLED_CASE, MISSING_CHARGE
  source_record_id VARCHAR(128) NOT NULL,
  claim_number VARCHAR(128) NOT NULL,
  patient_name VARCHAR(256) NOT NULL,
  payer_name VARCHAR(256) NOT NULL,
  procedure_name VARCHAR(512) NOT NULL,
  gross_recoverable_amount NUMERIC(12, 2) NOT NULL CHECK (gross_recoverable_amount >= 0),
  expected_realizable_yield NUMERIC(12, 2) NOT NULL CHECK (expected_realizable_yield >= 0),
  rops_priority_score NUMERIC(5, 2) NOT NULL CHECK (rops_priority_score >= 0 AND rops_priority_score <= 100),
  priority_tier VARCHAR(64) NOT NULL, -- TIER_1_CRITICAL_DISPATCH, TIER_2_HIGH_YIELD_RECOVERY, etc.
  assigned_specialist_id UUID,
  assigned_specialist_name VARCHAR(256),
  assigned_at TIMESTAMPTZ,
  lifecycle_status VARCHAR(64) NOT NULL DEFAULT 'UNASSIGNED',
  sla_deadline TIMESTAMPTZ NOT NULL,
  sla_status VARCHAR(32) NOT NULL DEFAULT 'ON_SCHEDULE', -- ON_SCHEDULE, WARNING_AT_RISK, SLA_BREACHED
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

#### Table 3: `recoverable_revenue_audit_log`
Immutable chronological provenance ledger recording all human and automated actions.
```sql
CREATE TABLE IF NOT EXISTS public.recoverable_revenue_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL,
  work_item_id UUID NOT NULL REFERENCES public.recoverable_revenue_work_items(id) ON DELETE CASCADE,
  action_type VARCHAR(64) NOT NULL, -- ASSIGN, REASSIGN, STATUS_CHANGE, SLA_OVERRIDE, NOTE_ADDED, DISPUTE_SENT, CASH_RECOVERED, DISMISSED
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

### 5.2 Performance Indexes
```sql
CREATE INDEX IF NOT EXISTS idx_rrw_items_facility_status ON public.recoverable_revenue_work_items (facility_id, lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_rrw_items_specialist ON public.recoverable_revenue_work_items (facility_id, assigned_specialist_id) WHERE lifecycle_status NOT IN ('RECOVERED_RECONCILED', 'CLOSED_UNRECOVERABLE');
CREATE INDEX IF NOT EXISTS idx_rrw_items_sla_deadline ON public.recoverable_revenue_work_items (facility_id, sla_deadline, sla_status);
CREATE INDEX IF NOT EXISTS idx_rrw_items_rops ON public.recoverable_revenue_work_items (facility_id, rops_priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_rrw_audit_work_item ON public.recoverable_revenue_audit_log (facility_id, work_item_id, created_at DESC);
```

---

## 6. Business Rules & Deterministic Calculations

### Rule 1: SLA Target Timestamp Invariant
The SLA deadline must be calculated deterministically based on priority tier SLA hours and statutory timely filing limits:
$$\text{sla\_deadline} = \min(\text{timely\_filing\_date}, \text{created\_at} + \Delta t_{\text{tier}})$$

Where Tier SLA intervals ($\Delta t_{\text{tier}}$) are:
- **Tier 1 (Critical Dispatch):** $+48\text{ hours}$ (2 calendar days)
- **Tier 2 (High Yield Recovery):** $+120\text{ hours}$ (5 calendar days)
- **Tier 3 (Standard Workbench):** $+336\text{ hours}$ (14 calendar days)
- **Tier 4 (Low Yield Batch):** $+720\text{ hours}$ (30 calendar days)
- **Tier 5 (Suppressed / Expired):** No active SLA ($0\text{ hours}$)

*Invariant:* If statutory timely filing deadline is sooner than tier SLA hours, timely filing takes absolute precedence.

### Rule 2: Deterministic SLA Status Classification
Let $T_{\text{now}}$ be the current evaluation timestamp and $T_{\text{deadline}}$ be `sla_deadline`:
$$\text{sla\_status} = \begin{cases} 
\text{'SLA\_BREACHED'} & \text{if } T_{\text{now}} > T_{\text{deadline}} \text{ and status } \notin \{\text{RECOVERED}, \text{CLOSED}\} \\ 
\text{'WARNING\_AT\_RISK'} & \text{if } T_{\text{deadline}} - T_{\text{now}} \le 24\text{ hours} \text{ and status } \notin \{\text{RECOVERED}, \text{CLOSED}\} \\ 
\text{'ON\_SCHEDULE'} & \text{otherwise} 
\end{cases}$$

*Invariant:* When `sla_status = 'SLA_BREACHED'`, the item immediately elevates to the top of the specialist workqueue regardless of raw yield.

### Rule 3: Specialist Capacity Invariant
A single recovery specialist cannot exceed **35 active claims** simultaneously:
$$\text{active\_claim\_count}(\text{specialist\_id}) \le \text{max\_capacity} \quad (\text{default: } 35)$$
Any dispatch exceeding 35 claims requires documented supervisor override approval.

### Rule 4: Master Queue Priority Sorting Order
Items within any queue must sort deterministically by:
1. `CASE WHEN sla_status = 'SLA_BREACHED' THEN 0 ELSE 1 END ASC` (Breaches first)
2. `priority_tier_rank ASC` (Tier 1 before Tier 2)
3. `expected_realizable_yield DESC` (Highest dollar yield next)
4. `sla_deadline ASC` (Earliest deadline first)

### Rule 5: Terminal State Reconciliation Invariant
1. Transitioning to `RECOVERED_RECONCILED` requires:
   - `actual_cash_recovered > 0.00`
   - Non-empty remittance reference (check number, ERA #, or EFT ID).
2. Transitioning to `CLOSED_UNRECOVERABLE` requires:
   - Approved dismissal reason code (`TIMELY_FILING_EXPIRED`, `CONTRACTUAL_WRITE_OFF`, `NON_COVERED_SERVICE`, `SUPERVISOR_AUTHORIZED`).
   - Non-empty explanation notes.

---

## 7. Role-Based Access Control (RBAC) & Security

| Role | View Workqueue | Assign / Reassign | Work / Submit Dispute | Record Recovery | Override SLA / Dismiss | Configure Queues |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Facility Admin / CFO** | Full | Full | Full | Full | Full | Full |
| **Billing Manager / Supervisor** | Full | Full | Full | Full | Full | Full |
| **Recovery Specialist / Collector** | Assigned + Triage | Self-Assign | Assigned Only | Assigned Only | With Approval | Read Only |
| **Audit / Compliance Observer** | Read Only | None | None | None | None | Read Only |

*Tenant Security:* Every query must execute under Row Level Security using:
```sql
USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
```

---

## 8. Service Layer & API Contract

### Methods in `recoverableRevenueWorkqueueService.js`
1. `getWorkqueueItems(filters)`: Returns active queue items sorted by SLA and ROPS invariants.
2. `getQueueMetrics(facilityId)`: Returns portfolio metrics (Total Recoverable $, Realized Cash $, SLA Compliance %, Cycle Time, Breach Count).
3. `getSpecialistWorkload(facilityId)`: Returns specialist capacity utilization (active cases / 35 max).
4. `assignWorkItem(itemId, specialistId, specialistName, currentUser)`: Assigns case and records audit event.
5. `transitionLifecycleStatus(itemId, newStatus, actionNotes, currentUser, metadata)`: Executes state machine transitions.
6. `reconcileRecovery(itemId, cashAmount, remittanceRef, currentUser)`: Closes case as `RECOVERED_RECONCILED`.
7. `dismissWorkItem(itemId, reasonCode, notes, currentUser)`: Closes case as `CLOSED_UNRECOVERABLE`.
8. `batchAssignItems(itemIds, specialistId, specialistName, currentUser)`: Bulk rebalancing.
9. `getAuditLog(itemId)`: Retrieves immutable timeline for a specific case.

---

## 9. User Experience & Maestro Clinical UI Requirements

### 9.1 Layout Structure
- **5-Card Top KPI Ribbon:**
  1. **Total Queue Inventory:** Active claims & aggregate recoverable balance ($)
  2. **Realized Cash Collected:** Total recovered surgical cash ($)
  3. **SLA Compliance Rate:** Percentage of claims worked within SLA target (%)
  4. **Active SLA Breaches:** Count of breached items requiring immediate supervisor intervention
  5. **Average Recovery Cycle:** Days from queue ingestion to cash reconciliation (days)
- **Queue Navigation Tabs:**
  - `All Active Claims`
  - `Critical SLA Triage (Tier 1)`
  - `Implant Carveouts (97)`
  - `Denial Appeals (94)`
  - `Secondary COB (95)`
  - `Payer Underpayments (93)`
  - `Supervisor Escalations`
- **Workqueue Data Grid:**
  - Priority Badge & ROPS score
  - Claim #, Patient, Surgical Procedure
  - Source Domain badge
  - Gross Recoverable vs. Expected Yield
  - Assigned Specialist with avatar badge
  - Dynamic SLA Countdown Pill (`Breached - X hrs`, `Expiring in Y hrs`, `On Schedule`)
  - Action buttons: `Work Claim`, `Reassign`, `Record Cash`, `Dismiss`
- **Modals:**
  - `Work Item Drawer / Modal`: Full case detail, clinical notes, document attachment, and action buttons.
  - `Specialist Reassignment Modal`: Specialist capacity meter, notes input, and override confirmation.
  - `Cash Reconciliation Modal`: Actual cash collected, ERA #, and closure confirmation.
  - `Audit Timeline Modal`: Visual chronological ledger of all claim touches.

### 9.2 Strict Design System Compliance
- **Zero Purple Ban:** Strictly 0 violet, purple, indigo, magenta, or fuchsia tokens.
- **Palette:** Slate `#0f172a`, `#334155`, `#64748b`, `#e2e8f0`, `#f8fafc`, `#ffffff`.
- **Accents:** Emerald `#059669`, Sky `#0284c7`, Amber `#d97706`, Crimson `#dc2626`, Teal `#0d9488`.

---

## 10. QA & Verification Test Suite

The test suite `tests/recoverable-revenue-workqueue.test.js` covers:
1. **Taxonomy & Invariants:** Validates queue codes, lifecycle states, and SLA tier intervals.
2. **SLA Math & Breach Detection:** Verifies 48hr/120hr calculation, statutory cutoff override, and breach status classification.
3. **Capacity Constraints:** Enforces 35-case specialist capacity limits and supervisor overrides.
4. **Queue Sorting Invariants:** Verifies breach-first, tier-rank ASC, expected yield DESC, and deadline ASC order.
5. **Terminal State Integrity:** Validates that `RECOVERED` requires cash > 0 and `CLOSED` requires justification notes.
6. **SQL Migration Integrity:** Verifies table schemas, views, down rollbacks, and tenant isolation policies in migration `076`.
7. **Design System & App Wiring:** Verifies strictly 0 purple tokens in JSX/CSS and proper routing in `App.jsx`.

---

## 11. Acceptance Criteria Checklist

- [x] Full Phase 99 specification authored and approved.
- [x] Database migrations `076_recoverable_revenue_workqueue.sql` and `076_recoverable_revenue_workqueue_down.sql` authored.
- [x] Backend service layer with deterministic SLA engine and in-memory store authored.
- [x] Maestro Clinical UI component `RecoverableRevenueWorkqueueView.jsx` and scoped CSS authored.
- [x] Registered in `src/App.jsx` under Revenue Cycle navigation menu.
- [x] 100% test coverage passing in `tests/recoverable-revenue-workqueue.test.js`.
- [x] Full RCM regression passing across all 12 modules.
- [x] Clean Vite production build (`npm run build`) with zero errors.
- [x] Master phase summary updated in `docs/phases/PHASE_WISE_FULL_SUMMARY.md`.
