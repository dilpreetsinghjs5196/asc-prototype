# G3 IMPORT EXCEPTION QUEUE

## Purpose
The Import Exception Queue establishes a centralized, cross-module exception review, ownership routing, SLA countdown, and audited resolution hub for all upstream data ingestion pipelines across ASCANALYST (Phases F1–F9 and G0–G2). Rather than leaving broken rows isolated in siloed module logs, Phase G3 routes every failed import record to an accountable clinical, coding, materials, or finance owner, enforces a strict resolution state machine, supports inline payload correction and atomic replay, and seals every disposition with SHA-256 provenance.

---

## Scope
- Define production requirements for **Import Exception Queue (Phase G3)**:
  1. **Queue SLA & Governance Config (`ieq_queue_configs`)**: Facility SLA limits (`CRITICAL: 4h`, `HIGH: 12h`, `MEDIUM: 24h`, `LOW: 72h`), automatic domain-to-owner routing, mandatory dismissal reason enforcement, and masked alert secrets.
  2. **Ownership Routing Matrix (`ieq_routing_rules`)**: Deterministic mapping from `(source_module, exception_category)` to accountable roles (`Clinical Nursing Director`, `RCM Billing Lead`, `Controller / Finance Lead`, `HR & Payroll Coordinator`, `Materials Manager`, `Data Operations Steward`).
  3. **Unified Exception Queue (`ieq_exception_items`)**: Master workqueue holding quarantined exceptions with severity, financial impact ($), assigned owner, SLA deadline (`sla_due_at`), queue status, raw vs. corrected JSON payloads, and 64-character SHA-256 seals.
  4. **Audit Action Log (`ieq_resolution_actions`)**: Immutable step-by-step ticket history (`CLAIM`, `REASSIGN`, `EDIT_PAYLOAD`, `REPLAY_SUCCESS`, `DISMISS`, `ESCALATE`).
  5. **Owner Workloads (`ieq_owner_workloads`)**: Accountability metrics tracking open tickets, SLA breaches, and average resolution velocity per owner.
  6. **Replay Batch Ledger (`ieq_replay_batches`) & Provenance (`ieq_provenance_ledger`)**: Execution history of reprocessed records and SHA-256 audit seals.
- Enforce facility tenancy (`facility_id`), RBAC, and zero prohibited color tokens.

---

## Current State

| Component | Status | Description |
| :--- | :--- | :--- |
| `src/services/importValidationService.js` | **KEEP** | Ingestion-time 6-stage validator producing initial quarantine exceptions (Phase F1). |
| `src/services/vendorInvoiceService.js` | **KEEP** | Produces vendor price variance & unmapped SKU exceptions (Phase F9). |
| `src/services/dataQualityFrameworkService.js` | **KEEP** | Consumes resolved/open counts for facility DQI certification (Phase G0). |
| `public.ieq_queue_configs` | **MISSING** | Facility SLA thresholds and routing policies. |
| `public.ieq_routing_rules` | **MISSING** | Module-to-owner deterministic routing matrix. |
| `public.ieq_exception_items` | **MISSING** | Centralized exception tickets with payloads, SLAs, and state machine. |
| `public.ieq_resolution_actions` | **MISSING** | Granular per-ticket transition & audit trail log. |
| `public.ieq_owner_workloads` | **MISSING** | Owner/role SLA and backlog accountability tracking. |
| `public.ieq_replay_batches` | **MISSING** | Reprocessed record replay batch history with SHA-256 seals. |
| `public.ieq_provenance_ledger` | **MISSING** | Immutable audit provenance table for queue dispositions. |
| `src/services/importExceptionQueueService.js` | **MISSING** | State-machine validator, auto-router, and replay orchestration service. |
| `src/components/ImportExceptionQueueView.jsx` | **MISSING** | Interactive exception inbox, inspector, routing, and replay UI. |

---

## Target State
1. **Strict Lifecycle State Machine**:
   - `OPEN` → `ASSIGNED` | `IN_REVIEW` | `ESCALATED`
   - `ASSIGNED` → `IN_REVIEW` | `ESCALATED` | `RESOLVED_REPLAYED` | `DISMISSED_SUPPRESSED`
   - `IN_REVIEW` → `ESCALATED` | `RESOLVED_REPLAYED` | `DISMISSED_SUPPRESSED`
   - `ESCALATED` → `IN_REVIEW` | `RESOLVED_REPLAYED` | `DISMISSED_SUPPRESSED`
   - Terminal states: `RESOLVED_REPLAYED`, `DISMISSED_SUPPRESSED` (no further transitions allowed).
2. **Deterministic SLA Calculation**:
   $$\text{SLA Due Timestamp} = T_{\text{created}} + \text{SLA Hours}(\text{Severity})$$
   Where `CRITICAL = 4h`, `HIGH = 12h`, `MEDIUM = 24h`, `LOW = 72h`.
3. **Inline Repair & Atomic Replay**:
   - Updating `corrected_payload_json` on an active exception validates the state transition, records a `REPLAY_SUCCESS` entry in `ieq_resolution_actions`, emits a batch entry in `ieq_replay_batches`, and seals with a 64-character `sha256_ieq_` hash.

---

## Data Model / Schema
Defined in `supabase/migrations/135_import_exception_queue.sql`:
1. `public.ieq_queue_configs`
2. `public.ieq_routing_rules`
3. `public.ieq_exception_items` (`sha256_sync_seal VARCHAR(128) NOT NULL`)
4. `public.ieq_resolution_actions`
5. `public.ieq_owner_workloads`
6. `public.ieq_replay_batches` (`sha256_sync_seal VARCHAR(128) NOT NULL`)
7. `public.ieq_provenance_ledger` (`sha256_seal VARCHAR(128) NOT NULL`)
- Telemetry aggregation view: `public.vw_import_exception_queue_telemetry`.
- Tenant isolation enforced via `app.current_facility_id` RLS policies on all 7 tables.

---

## Business Rules

### Rule 1: Validated State Machine Transitions
Illegal state jumps (e.g., reopening a terminal `RESOLVED_REPLAYED` ticket or skipping `DISMISSED_SUPPRESSED` justification) are rejected with `ERR_IEQ_INVALID_TRANSITION`.

### Rule 2: Mandatory Dismissal Justification
Suppressing or dismissing any exception (`DISMISSED_SUPPRESSED`) requires an audit reason of at least 5 characters (`ERR_DISMISS_REASON_REQUIRED`).

### Rule 3: Auto-Ownership Routing
When `auto_assign_by_domain = TRUE`, incoming exceptions automatically resolve an accountable role and assignee from `ieq_routing_rules` based on `source_module`.

### Rule 4: Cryptographic Provenance
Every ticket repair replay and bulk batch replay records an exact 64-character SHA-256 seal (`sha256_ieq_` prefix + 53 hex chars).

---

## Permissions / Security
- Facility-level RLS isolation (`app.current_facility_id`).
- Secrets masked in all responses (`ieq_sec_****_...`).
- RBAC Matrix:
  - `Data Operations Steward` / `Facility Administrator`: Reassign tickets, run bulk replays, configure SLA rules.
  - `Domain Owners` (`Clinical Nursing Director`, `Materials Manager`, `RCM Billing Lead`, `Controller`): Edit payloads, resolve/replay assigned tickets, escalate or dismiss with justification.
  - `Financial Analyst` / `Auditor`: Read-only access to queue backlog, SLA breaches, and action timelines.

---

## API / Service Requirements
`src/services/importExceptionQueueService.js` and facade `src/lib/importExceptionQueueService.js`:
- `getIeqConfig(facilityInput)`
- `updateIeqConfig(facilityInput, updates)`
- `getIeqTelemetry(facilityInput)`
- `getIeqRoutingRules(facilityInput)`
- `getIeqExceptions(facilityInput)`
- `getIeqResolutionActions(exceptionId)`
- `getIeqOwnerWorkloads(facilityInput)`
- `getIeqReplayBatches(facilityInput)`
- `determineExceptionOwnerAndSla(params, routingRules)`
- `validateQueueTransition(currentStatus, targetStatus, notes)`
- `assignIeqException(exceptionId, assigneeEmail, assignedRole, actorId)`
- `escalateIeqException(exceptionId, reason, actorId)`
- `resolveAndReplayIeqException(exceptionId, correctedPayload, resolutionNotes, actorId)`
- `dismissIeqException(exceptionId, dismissalReason, actorId)`

---

## UI / Workflow Requirements
Component `src/components/ImportExceptionQueueView.jsx` and `src/components/ImportExceptionQueueView.css`:
- **Header Action Bar**: Queue backlog summary badge, "Auto-Route Queue", Settings modal trigger.
- **4-Card Telemetry Ribbon**: Total Active Exceptions, Escalated / SLA Alert Count, Financial Impact at Risk ($), Replayed & Resolved MTD.
- **4 Subtabs**:
  1. *Unified Exception Queue* (status/search filters, master table + interactive Ticket Inspector showing raw/corrected payload, action timeline, and **Fix & Replay**, **Escalate**, **Reassign**, and **Dismiss** controls).
  2. *Ownership & Routing Rules* (module-to-owner routing matrix).
  3. *Owner Workloads & SLAs* (per-owner open backlog and resolution velocity).
  4. *Replay Batch Ledger* (verified replays with 64-char SHA-256 seals).
- **Zero Prohibited Tokens**: Strictly zero purple, violet, indigo, magenta, or fuchsia tokens; `padding: 0` on `.ieq-container`.

---

## Audit / Provenance
- Every assignment, payload repair, escalation, dismissal, and replay stores timestamped actor trails in `ieq_resolution_actions` and `ieq_provenance_ledger`.

---

## QA / Test Cases
Automated test suite `tests/import-exception-queue.test.js`:
1. Telemetry returns accurate queue counts and financial exposure for Naples Surgery Center (`fac-naples-01`).
2. Facility UUID alias resolution across strings and objects.
3. Configuration retrieval and masked secret verification (`ieq_sec_****_...`).
4. Deterministic SLA countdown & auto-ownership routing (`determineExceptionOwnerAndSla`).
5. Strict workflow state machine (`validateQueueTransition`) permits valid transitions and blocks terminal/illegal transitions.
6. Ticket assignment & escalation transitions update status and append audit actions.
7. Inline payload fix & replay resolves ticket, updates status to `RESOLVED_REPLAYED`, and emits 64-char `sha256_ieq_` replay batch seal.
8. Dismissal enforcement rejects empty justification (`ERR_DISMISS_REASON_REQUIRED`) and accepts documented suppression.
9. Routing rules & owner workloads catalog retrieval.
10. Dual facade re-export parity (`src/services/` vs `src/lib/`).
11. Migration 135 UP/DOWN SQL structural integrity and RLS policies.
12. Strict zero-prohibited token compliance and `src/App.jsx` shell integration.

---

## Acceptance Criteria
- Build passes (`npm run build`).
- All 191 tests across F0–F9 + G0–G3 + Phase 76 pass cleanly.
- Tenant isolation verified across all 7 tables.
- Zero prohibited accent tokens.

---

## Dependencies
- Upstream: Phases F1–F9, Phase G0 (`Data Quality Framework`).
- Database: Migration 135 (`supabase/migrations/135_import_exception_queue.sql`).

---

## Definition of Done
Phase G3 is complete when Migration 135 UP/DOWN, `importExceptionQueueService.js`, `src/lib/importExceptionQueueService.js`, `ImportExceptionQueueView.jsx/.css`, `src/App.jsx` shell integration, 12 passing tests in `tests/import-exception-queue.test.js`, full regression run, and clean production build pass.

---

## Implementation Notes
- **Branch:** `data-quality-works`
- **Files Created:** `docs/phases/G3_IMPORT_EXCEPTION_QUEUE.md`, `ASCANALYST_MD_SPECS/Phase_16_Data_Quality/G3_IMPORT_EXCEPTION_QUEUE.md`, `supabase/migrations/135_import_exception_queue.sql`, `135_import_exception_queue_down.sql`, `src/services/importExceptionQueueService.js`, `src/lib/importExceptionQueueService.js`, `src/components/ImportExceptionQueueView.jsx`, `src/components/ImportExceptionQueueView.css`, `tests/import-exception-queue.test.js`.
- **Files Modified:** `src/App.jsx` (`import_exception_queue` tab with `ClipboardList` icon).
