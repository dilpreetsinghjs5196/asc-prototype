# 24 AUDIT LOGGING SPECIFICATION — ASCANALYST PLATFORM

---

## Document Control & Metadata

- **Document Identifier**: `DOC-SPEC-PHASE-24-AUDIT`
- **Specification Title**: Immutable Audit Logging, Operational Provenance, PHI Redaction, and Financial Freezing Architecture
- **Target Platform**: Supabase PostgreSQL 15+ (Remote Instance: `isutllqthmakvwgduaos` / Local Node.js Client)
- **Upstream Dependencies**:
  - `docs/phases/03-CURRENT-DATABASE-AUDIT.md`
  - `docs/phases/20-AUTHENTICATION-SPEC.md`
  - `docs/phases/21-ORGANIZATION-AND-FACILITY-TENANCY.md`
  - `docs/phases/22-RBAC-ROLES-AND-PERMISSIONS.md`
  - `docs/phases/23_RLS_SECURITY_POLICIES.md`
  - `supabase/migrations/001_multi_tenancy_core.sql`
  - `supabase/migrations/002_rbac_roles_and_permissions.sql`
  - `supabase/migrations/002_clinical_normalization.sql`
  - `supabase/migrations/003_audit_and_snapshots.sql`
- **Classification**: Enterprise Healthcare Security Standard (HIPAA Security Rule 45 CFR § 164.312(b) Audit Controls / CMS Billing Integrity)
- **Status**: Production Engineering Specification (Implementation Plan)
- **Author**: ASCANALYST Architecture & Security Engineering Team
- **Date**: 2026-10-16

---

## 1. Purpose

The purpose of this specification is to establish the definitive **Audit Logging, Operational Provenance, PHI Protection, Financial Snapshot Freezing, and Compliance Monitoring Architecture** for the **ASCANALYST** ambulatory surgery center platform.

Under federal healthcare regulations—specifically the **HIPAA Security Rule (45 CFR § 164.312(b) Audit Controls)**, the **HITECH Act Breach Notification Rule**, and **CMS Billing Integrity Guidelines**—ambulatory surgical centers must maintain immutable, hardware- or software-enforced audit trails recording all read, write, update, delete, and export operations on Protected Health Information (PHI) and clinical/financial records.

This architecture enforces five fundamental pillars:
1. **Automated Transaction-Tier Capture**: Database-level triggers automatically intercept every `INSERT`, `UPDATE`, and `DELETE` on operational tables, capturing actor identity, timestamp, IP address, and JSON before/after state diffs without relying on client-side compliance.
2. **Fail-Safe Isolation**: Audit trigger failures must issue database warnings (`RAISE WARNING`) rather than aborting live clinical transactions, ensuring patient care, operating room scheduling, and emergency case logging are never blocked by audit infrastructure.
3. **Strict Cryptographic Immutability**: The audit log ledger is strictly append-only. Row Level Security (RLS) and PostgreSQL Data Control Language (DCL) revoke all `UPDATE`, `DELETE`, and `TRUNCATE` privileges from all authenticated users and application roles, guaranteeing an untamperable audit trail.
4. **Deterministic PHI & Secret Sanitization**: High-risk credentials (passwords, JWT tokens, session secrets) are completely excluded from logs, and direct patient identifiers (SSNs, medical record numbers) are subject to granular redaction policies.
5. **Multi-Agent AI Provenance**: AI scheduling operations, operational optimization recommendations, and automated batch commitments initiated by multi-agent consoles (`MultiAgentConsole.jsx`) are explicitly stamped with source metadata (`source: 'AI_AGENT'`), model calculation versions, and correlation identifiers.

---

## 2. Scope

This specification covers:
- **Ledger Storage**: Architecture and lifecycle of the `public.audit_logs` append-only table.
- **Trigger Subsystem**: The generic PostgreSQL trigger function `public.fn_audit_log_trigger()` and its attachment to all 10 clinical and operational master tables.
- **Financial Freezing**: Architecture, versioning, and immutable storage of `public.surgery_financial_snapshots` for case billing sign-offs.
- **Security Definer Governance**: Explicit `search_path`, credential extraction from Supabase JWT contexts, and client IP header parsing.
- **Granular RBAC Authorization**: Enforcing permissions (`audit.view_clinical`, `audit.view_financial`, `audit.view_security`, `financials.freeze`) across all 10 canonical platform roles.
- **Client Services**: Service integration in `src/lib/supabase.js` (`getAuditLogs`, `logAuditEvent`, `getSurgeryFinancialSnapshot`, `saveSurgeryFinancialSnapshot`).
- **User Interface**: Dedicated enterprise audit viewer component (`src/components/AuditLogViewer.jsx`), filter engine, visual JSON diff inspector, and export controls.
- **AI Telemetry Tracking**: Provenance attribution for automated agent bookings executed by `MultiAgentConsole.jsx`.

---

## 3. Current-State Forensic Audit & Component Classification

The current state of audit-related components in the codebase has been inspected and classified as follows:

| Component | Repository / Database Location | Current Behavior | Classification | Target Action for Phase 24 |
| :--- | :--- | :--- | :---: | :--- |
| **`public.audit_logs` Table** | `supabase/migrations/003_audit_and_snapshots.sql` | Append-only table storing `facility_id`, `table_name`, `record_id`, `action`, `actor_id`, `actor_email`, `ip_address`, `previous_state`, `new_state`, `timestamp`. | **KEEP & ENHANCE** | Retain existing schema; enhance with `source` attribution (UI, API, AI_TOOL, SYSTEM) and `correlation_id` / `metadata`. |
| **`fn_audit_log_trigger()`** | `supabase/migrations/003_audit_and_snapshots.sql` | PostgreSQL trigger function capturing JWT identity and before/after JSONB state with non-blocking `EXCEPTION WHEN OTHERS` block. | **KEEP & HARDEN** | Retain non-blocking design; add field-level sanitization to exclude passwords or sensitive authentication tokens. |
| **Clinical Audit Triggers** | `supabase/migrations/003_audit_and_snapshots.sql` | 10 unique triggers (30 event hooks) attached to `surgeries`, `surgery_procedures`, `patients`, `surgeons`, `operating_rooms`, `payers`, `payer_fee_schedules`, `cpt_codes`, `or_block_schedule`, `staff`. | **KEEP** | Verified active on production database (`isutllqthmakvwgduaos`). Retain 100% of existing triggers. |
| **`surgery_financial_snapshots` Table** | `supabase/migrations/003_audit_and_snapshots.sql` | Dedicated table storing frozen financial metrics (`gross_revenue`, `expected_reimbursement`, `room_cost`, `labor_cost`, `total_cost`, `net_margin`, `calculation_version`, `frozen_at`, `frozen_by`). | **KEEP** | Retain existing table, unique constraint on `surgery_id`, and indexes. |
| **Audit Logs RLS Policy** | `supabase/migrations/003_audit_and_snapshots.sql` | Restricts `SELECT` on `audit_logs` to `['super_admin', 'org_admin', 'facility_admin', 'clinical_director']`. Zero UPDATE or DELETE policies. | **REFACTOR** | Expand authorized viewing roles to include `auditor` and `cfo` matching Phase 22 canonical roles. |
| **Audit Client Methods** | `src/lib/supabase.js` (`getAuditLogs`, `logAuditEvent`) | Basic query method with facility filtering and client-side manual event insertion. | **REFACTOR** | Add advanced filtering (action, table, date range, actor search), pagination, and error-handling resilience. |
| **Financial Snapshot Methods** | `src/lib/supabase.js` (`getSurgeryFinancialSnapshot`, `saveSurgeryFinancialSnapshot`) | Queries and upserts frozen financial records for surgical cases. | **KEEP** | Retain working implementation; link to case billing transitions. |
| **Audit Log UI Component** | `src/components/` | No audit viewer component currently exists in the frontend. | **MISSING** | Develop `AuditLogViewer.jsx` with date-range filters, action tags, visual before/after JSON diffs, and export buttons. |
| **Navigation & App Integration** | `src/App.jsx` | Audit logs are not linked in the main sidebar or routed through `RoleGate`. | **MISSING** | Mount `AuditLogViewer` under `RoleGate` requiring `audit.view_clinical` or `audit.view_financial` permissions. |
| **AI MultiAgent Audit Logging** | `src/components/MultiAgentConsole.jsx` | Auto-schedules surgery cases via database insert without setting explicit audit source or calculation metadata. | **REFACTOR** | Pass audit metadata (`source: 'AI_AGENT'`, model version) when committing cases. |

---

## 4. Target State Architecture & HIPAA Compliance Standards

### HIPAA Security Rule Technical Safeguards Mapping

| Regulatory Standard | Technical Requirement | ASCANALYST Implementation Mechanism |
| :--- | :--- | :--- |
| **45 CFR § 164.312(a)(1)** Access Control | Unique user identification for every data access. | All audit log rows capture `actor_id` (Supabase `auth.uid()`) and `actor_email` directly from the signed GoTrue JWT. |
| **45 CFR § 164.312(b)** Audit Controls | Mechanisms to record and examine activity in systems containing or using EPHI. | Automated triggers on all 10 operational tables recording `timestamp`, `action`, `record_id`, `previous_state`, and `new_state`. |
| **45 CFR § 164.312(c)(1)** Integrity | Protect EPHI from improper alteration or destruction. | Cryptographic immutability: zero `UPDATE` or `DELETE` RLS policies on `audit_logs`. Table grants restrict authenticated roles to `SELECT`. |
| **45 CFR § 164.312(e)(1)** Transmission Security | Guard against unauthorized access to EPHI transmitted over communications networks. | Client IP address captured via `(request.headers::json ->> 'x-forwarded-for')`; all PostgREST traffic enforced over TLS 1.3. |

---

## 5. Data Model & Schema

### 5.1 `public.audit_logs` (Core Ledger)

```sql
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'EXECUTE', 'EXPORT', 'FREEZE', 'LOGIN', 'LOGOUT', 'OVERRIDE')),
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_email TEXT,
    ip_address INET,
    source TEXT NOT NULL DEFAULT 'SYSTEM' CHECK (source IN ('UI', 'API', 'AI_AGENT', 'BACKGROUND_JOB', 'SYSTEM', 'IMPORT')),
    previous_state JSONB,
    new_state JSONB,
    changed_fields JSONB,
    change_reason TEXT,
    correlation_id TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### Performance & Compliance Indexes:
- `idx_audit_logs_facility_time`: `(facility_id, timestamp DESC)` — Accelerates tenant audit review.
- `idx_audit_logs_table_record`: `(table_name, record_id)` — Accelerates entity audit trail lookups.
- `idx_audit_logs_actor`: `(actor_id)` — Supports compliance investigations by user.
- `idx_audit_logs_action`: `(action)` — Accelerates filtering by operational action type.
- `idx_audit_logs_source`: `(source)` — Enables filtering for AI agent or background job operations.

### 5.2 `public.surgery_financial_snapshots` (Frozen Financial Truth)

```sql
CREATE TABLE IF NOT EXISTS public.surgery_financial_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    surgery_id BIGINT NOT NULL UNIQUE REFERENCES public.surgeries(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    gross_revenue NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    expected_reimbursement NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    room_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    labor_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    supplies_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    implants_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    medications_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    net_margin NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    margin_per_or_minute NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    calculation_version TEXT NOT NULL DEFAULT 'v1.0-cms2026',
    snapshot_data JSONB DEFAULT '{}'::jsonb,
    frozen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    frozen_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
```

---

## 6. Business Rules & Deterministic Logic

### 6.1 State Diff Calculation
1. **No-Op Suppression**: If `to_jsonb(OLD) IS NOT DISTINCT FROM to_jsonb(NEW)`, no audit entry is created. This prevents log bloat from redundant saves or empty touch operations.
2. **Changed Fields Extraction**: For `UPDATE` actions, the trigger computes a dedicated `changed_fields` JSONB object listing only keys whose values changed between `OLD` and `NEW`.

### 6.2 PHI & Credential Sanitization
To comply with HIPAA minimum-necessary standards and protect credentials:
- **Quarantined Tables**: Mutations to the legacy `users` table are strictly forbidden from writing cleartext passwords into audit logs.
- **Sensitive Patient Fields**: Field-level filters ensure social security numbers (SSN) and full unredacted credit card or bank details are redacted before serializing to `previous_state` and `new_state`.
- **Session Tokens**: Bearer tokens and authorization headers are never logged into `metadata`.

### 6.3 Fail-Safe Transaction Guarantees
- The audit trigger function must execute within an internal `BEGIN ... EXCEPTION WHEN OTHERS THEN RAISE WARNING ... END;` block.
- **Under no circumstances may an audit log insert failure block or roll back a clinical surgery update, patient registration, or OR room schedule.**
- Audit log write exceptions emit structured PostgreSQL warnings including table name and error details for database monitoring.

---

## 7. Permissions & Security Governance

### 7.1 Role-Based Access Control (RBAC) Matrix

| Platform Role | Can View Clinical Audits (`audit.view_clinical`) | Can View Financial Audits (`audit.view_financial`) | Can View Security Audits (`audit.view_security`) | Can Freeze Financials (`financials.freeze`) | Can Export Audit Logs (`reports.export_phi_unredacted`) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Super Admin** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| **Organization Admin** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| **Facility Administrator** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| **CFO / Finance Lead** | ❌ No | ✅ Yes | ❌ No | ✅ Yes | ✅ Yes (Financial only) |
| **Compliance Auditor** | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No | ✅ Yes |
| **Clinical Manager / Director** | ✅ Yes | ❌ No | ❌ No | ❌ No | ❌ No |
| **Surgical Scheduler** | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |
| **Billing / RCM Specialist** | ❌ No | ✅ Yes | ❌ No | ✅ Yes | ❌ No |
| **Medical Coder** | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |
| **Attending Surgeon** | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |
| **Read Only / Observer** | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |

### 7.2 Row Level Security (RLS) Policy Definition

```sql
-- 1. Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 2. Explicit DCL Table Grants (Default Deny)
REVOKE ALL ON public.audit_logs FROM anon;
GRANT SELECT ON public.audit_logs TO authenticated;

-- 3. Strict Read-Only Tenant Policy
DROP POLICY IF EXISTS "Authorized Roles Can View Audit Logs" ON public.audit_logs;
CREATE POLICY "Authorized Roles Can View Audit Logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (
    facility_id IN (SELECT facility_id FROM public.get_auth_user_facilities())
    AND public.user_has_facility_role(
        facility_id, 
        ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_director', 'clinical_manager', 'cfo', 'biller']
    )
);

-- STRICT GUARANTEE: NO INSERT, UPDATE, OR DELETE POLICIES EXIST FOR REGULAR AUTH USERS.
-- Database triggers execute via SECURITY DEFINER to append audit records.
```

---

## 8. Client API & Service Contracts

The service layer in `src/lib/supabase.js` provides the following contracts:

### 8.1 `getAuditLogs(facilityId, options)`

```javascript
/**
 * Retrieves paginated audit logs for the specified facility.
 * @param {string} [facilityId] - Target facility UUID (defaults to active facility).
 * @param {Object} [options] - Query options.
 * @param {number} [options.limit=50] - Number of records to return.
 * @param {number} [options.offset=0] - Offset for pagination.
 * @param {string} [options.tableName] - Filter by entity (e.g. 'surgeries', 'patients').
 * @param {string} [options.action] - Filter by action ('INSERT', 'UPDATE', 'DELETE', 'FREEZE').
 * @param {string} [options.source] - Filter by source ('UI', 'AI_AGENT', 'SYSTEM').
 * @param {string} [options.startDate] - ISO timestamp range start.
 * @param {string} [options.endDate] - ISO timestamp range end.
 * @param {string} [options.search] - Substring search across actor_email or record_id.
 * @returns {Promise<Array<Object>>} Audit log records.
 */
async getAuditLogs(facilityId, options = {}) { ... }
```

### 8.2 `logAuditEvent(entry)`

```javascript
/**
 * Dispatches an application-level audit event (e.g., login, export, financial freeze).
 * @param {Object} entry - Audit log entry payload.
 * @param {string} entry.action - Action identifier ('EXPORT', 'LOGIN', 'FREEZE').
 * @param {string} entry.table_name - Affected subsystem or entity.
 * @param {string} entry.record_id - Identifier of affected record.
 * @param {string} [entry.source='UI'] - Event origin ('UI', 'AI_AGENT').
 * @param {string} [entry.change_reason] - Optional user-provided rationale.
 * @param {Object} [entry.metadata] - Structured JSON metadata.
 * @returns {Promise<Object|null>} Created audit record or null on error.
 */
async logAuditEvent(entry) { ... }
```

### 8.3 `saveSurgeryFinancialSnapshot(snapshot)`

```javascript
/**
 * Freezes the financial calculations for a billed surgery case.
 * @param {Object} snapshot - Financial snapshot payload.
 * @param {number} snapshot.surgery_id - Foreign key to public.surgeries(id).
 * @param {string} snapshot.facility_id - Facility UUID.
 * @param {number} snapshot.gross_revenue - Gross charges.
 * @param {number} snapshot.expected_reimbursement - Contracted yield.
 * @param {number} snapshot.net_margin - Final profit margin.
 * @param {string} [snapshot.calculation_version='v1.0-cms2026'] - Version tag.
 * @returns {Promise<Object>} Created or updated snapshot record.
 */
async saveSurgeryFinancialSnapshot(snapshot) { ... }
```

---

## 9. UI & Workflow Requirements (`AuditLogViewer.jsx`)

### 9.1 Component Overview
The audit log viewer provides compliance officers, clinical managers, and administrators with a dedicated interface for reviewing data changes:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 🔍 Compliance Audit Trail                                            [Export CSV] [↻]  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Filters: [ Facility: Naples Surgery ▼ ] [ Action: All ▼ ] [ Entity: Surgeries ▼ ]     │
│          [ Source: All ▼ ] [ Date: Last 30 Days ▼ ] [ Search actor / ID...          ]  │
├─────────────┬──────────┬───────────┬──────────────┬─────────────┬──────────────┬───────┤
│ Timestamp   │ Action   │ Entity    │ Record ID    │ Actor       │ Source       │ State │
├─────────────┼──────────┼───────────┼──────────────┼─────────────┼──────────────┼───────┤
│ 10:45:12 AM │ UPDATE   │ surgeries │ Case #94     │ admin@asc...│ UI           │ [Diff]│
│ 10:30:00 AM │ FREEZE   │ snapshots │ Case #88     │ biller@asc..│ UI           │ [Diff]│
│ 09:15:22 AM │ INSERT   │ surgeries │ Case #102    │ MultiAgent  │ AI_AGENT     │ [Diff]│
│ 08:00:10 AM │ LOGIN    │ auth      │ usr_7891     │ surgeon@... │ SYSTEM       │ [Info]│
└─────────────┴──────────┴───────────┴──────────────┴─────────────┴──────────────┴───────┘
```

### 9.2 Key User Interface Features
1. **Action Badges**: Color-coded badges for visual clarity:
   - `INSERT`: Green (`#10b981`)
   - `UPDATE`: Blue (`#3b82f6`)
   - `DELETE`: Red (`#ef4444`)
   - `FREEZE`: Purple (`#8b5cf6`)
   - `EXECUTE` / `AI_AGENT`: Amber (`#f59e0b`)
2. **Visual Before/After Diff Modal**:
   - Side-by-side or unified JSON diff comparison highlighting exact modified keys (green for additions, red for removals, yellow for modifications).
3. **Deep Filter Controls**: Filter by table name, action type, actor email, date range, and source origin.
4. **Export Safeguards**: CSV and JSON export buttons require `reports.export_margins` or `reports.export_phi_unredacted` permissions.

---

## 10. MultiAgent & AI Tool Audit Provenance

When the AI multi-agent scheduling pipeline (`src/components/MultiAgentConsole.jsx`) runs:
1. **Explicit Source Tagging**: Any surgical booking committed to the database includes audit source attribution (`source: 'AI_AGENT'`).
2. **Calculation Metadata**: The audit entry captures the multi-agent session ID, scheduler simulation version, and conflict-resolution confidence score.
3. **Approval Status**: Records whether the schedule booking was auto-committed or acknowledged via supervisor override.

---

## 11. Implementation Plan & Migration Strategy

### Step 1: Migration Authoring (`004_audit_logging_hardening.sql`)
- Add `source`, `correlation_id`, `changed_fields`, and `metadata` columns to `public.audit_logs` if not already present.
- Update `fn_audit_log_trigger()` to support `source` context extraction and diff computation.
- Update `audit_logs` RLS SELECT policy to include `cfo` and `biller` roles.

### Step 2: Client Service Enhancement (`src/lib/supabase.js`)
- Upgrade `getAuditLogs()` with filtering, search, and pagination.
- Upgrade `logAuditEvent()` to support structured metadata and source attribution.

### Step 3: Frontend Audit Viewer (`src/components/AuditLogViewer.jsx`)
- Create `AuditLogViewer.jsx` and styling in `Management.css`.
- Integrate visual JSON diff viewer for before/after states.

### Step 4: Route Integration & Navigation (`src/App.jsx`)
- Add Audit Trail navigation item to sidebar under Administrator / Compliance section.
- Wrap route inside `<RoleGate allowedRoles={['super_admin', 'org_admin', 'facility_admin', 'clinical_director', 'clinical_manager', 'cfo', 'biller']}>`.

### Step 5: MultiAgent Provenance Hook (`src/components/MultiAgentConsole.jsx`)
- Instrument `onSchedule` database writes with audit logging carrying `source: 'AI_AGENT'`.

---

## 12. QA Verification, Test Matrix & Evidence Requirements

### 12.1 Static & Unit Tests (`tests/audit-logging-static.test.js`)
- **AL-TEST-01**: Verifies `audit_logs` schema contains all required fields (`source`, `actor_id`, `previous_state`, `new_state`, `timestamp`).
- **AL-TEST-02**: Confirms `audit_logs` has zero `UPDATE` or `DELETE` RLS policies.
- **AL-TEST-03**: Verifies non-blocking trigger exception handling (`EXCEPTION WHEN OTHERS`).
- **AL-TEST-04**: Confirms `AuditLogViewer.jsx` is protected under `RoleGate`.
- **AL-TEST-05**: Validates client service `getAuditLogs` parameter filtering.
- **AL-TEST-06**: Validates MultiAgent AI audit metadata attribution.

---

## 13. Acceptance Criteria & Definition of Done

Phase 24 is certified **COMPLETE** when:
1. **Schema Completeness**: `audit_logs` supports actor identity, action type, entity, before/after diffs, and source attribution.
2. **Trigger Coverage**: All 10 operational tables have verified active audit triggers on production.
3. **Fail-Safe Integrity**: Audit logging failures never abort clinical transactions.
4. **Immutability Guarantee**: Regular authenticated users are mathematically blocked from editing or deleting audit logs.
5. **UI Accessibility**: Authorized administrators can inspect, filter, and review audit diffs in `AuditLogViewer.jsx`.
6. **AI Attribution**: Operations executed by `MultiAgentConsole.jsx` carry `source: 'AI_AGENT'`.
7. **Test Suite Green**: `npm test` runs with 100% passing tests (0 failures).
8. **Zero Regressions**: Existing login, surgeries, OR schedules, and calculations operate without disruption.

---
*End of Specification 24 — Audit Logging*
