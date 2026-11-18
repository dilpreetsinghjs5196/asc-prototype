# C2 AI PERMISSIONS & ACTION BOUNDARIES

## Purpose
The **AI Permissions & Action Boundaries Tier** defines the security, tenancy, role-based privilege model, and execution guardrails governing all conversational agents, automated background workflows, and AI tools within ASCANALYST. It establishes strict boundaries between passive read-only analytics, export synthesis, and destructive mutations—enforcing Human-in-the-Loop (HITL) dual-key signoff for high-risk actions to eliminate autonomous drift or unauthorized operational changes.

---

## Scope
- **Production Requirements**:
  - Define the granular AI permission taxonomy (`ai:chat`, `ai:view_clinical`, `ai:view_financial`, `ai:view_phi`, `ai:tool_execute`, `ai:propose_action`, `ai:approve_action`, `ai:admin`).
  - Map canonical ASC roles (`super_admin`, `facility_admin`, `clinical_director`, `billing_manager`, `surgeon`, `clinical_manager`, `biller`, `coder`, `analyst`, `viewer`) to allowable AI action boundaries.
  - Action Risk Taxonomy:
    - `READ_ONLY_ANALYTICS` (Tier 1 - Auto-approved for permitted roles)
    - `EXPORT_SYNTHESIS` (Tier 2 - Auto-approved for permitted roles with audit logging)
    - `PROPOSED_MUTATION` (Tier 3 - Requires Human-in-the-Loop approval before execution)
    - `RESTRICTED_SYSTEM_ACTION` (Tier 4 - Strictly prohibited for AI agents; administrative UI only)
  - Human-in-the-Loop (HITL) Workflow:
    - AI agents cannot autonomously mutate clinical schedules, fee schedules, or claim records; they may only submit an `ai_proposed_action` with before/after state diffs and impact projections.
    - Authorized approvers (`facility_admin`, `clinical_director`, `billing_manager`) review and approve or reject the proposed action with cryptographic signoff.
  - Multi-tenant facility isolation: AI permissions strictly inherit facility tenancy; cross-facility data leakage is blocked at the gateway and database RLS tiers.

---

## Current State
| Component | Classification | Current State Description | Action Required |
| :--- | :--- | :--- | :--- |
| `src/lib/rbacService.js` | **KEEP** | Standard application RBAC service defining `CANONICAL_ROLES` and static permissions. | Bind AI permission scopes to canonical roles without modifying core user authentication. |
| Tool RBAC in `aiToolGatewayService.js` (Phase C1) | **KEEP** | Checks `tool.requiredRole` during dispatch. | Expand to evaluate granular action boundaries (`READ_ONLY`, `PROPOSED_MUTATION`) and HITL queue. |
| Action Boundary Engine | **MISSING** | No formal classification separating passive analytical queries from state-altering mutations. | Implement `evaluateActionBoundary()` with 4-tier risk classification and HITL intercept. |
| Human-in-the-Loop Approval Queue | **MISSING** | No workflow or database ledger where AI proposals are held in `PENDING_APPROVAL` pending clinical/financial executive review. | Implement `ai_proposed_actions` table, state transitions (`PENDING_APPROVAL` -> `APPROVED` / `REJECTED` -> `EXECUTED`), and UI review queue. |
| AI Permissions Management UI | **MISSING** | No dedicated console allowing facility administrators to inspect role permissions, pending proposals, and security audit logs. | Implement `AIPermissionsView.jsx` with matrix grid, HITL approval queue, and audit log. |

---

## Target State
1. **Granular AI Privilege Model**:
   - `ai:chat`: Basic conversational access for authorized ASC staff.
   - `ai:view_clinical`: Access to surgeon scorecards, CPT operational times, and implant variance.
   - `ai:view_financial`: Access to contribution margins, payer realization yields, and fee schedule leakage.
   - `ai:view_phi`: Authorized inspection of patient identifiers (un-redacted); restricted to clinical/billing managers.
   - `ai:tool_execute`: Permission to invoke server-authoritative tool contracts.
   - `ai:propose_action`: Permission to generate draft mutations (e.g. block schedule auto-releases).
   - `ai:approve_action`: Dual-key signoff authority to approve and execute pending AI proposals.
   - `ai:admin`: Policy configuration, permission overrides, and circuit breaker governance.
2. **Action Boundaries & HITL Guardrails**:
   - High-risk operations (e.g., releasing an underutilized OR block, filing an EDI 837 appeal, altering vendor tier contract assignments) are strictly classified as `PROPOSED_MUTATION`.
   - The AI generates an auditable draft payload. The change is held in `PENDING_APPROVAL` with a 24-hour expiration window.
   - An authorized human approver reviews the diff, impacts, and rationale, and clicks "Approve & Execute" or "Reject".
3. **Tenancy & Isolation**:
   - All AI interactions and proposals are hard-bounded to the active facility (`facility_id`).
   - Row-level security enforces zero cross-tenant visibility.
4. **Audit Provenance**:
   - Every permission evaluation, proposal creation, and approval decision generates an immutable record with SHA-256 cryptographic signatures.

---

## Data Model / Schema
PostgreSQL Migration: `100_ai_permissions_and_action_boundaries.sql`

```sql
-- 1. AI Action Boundaries Registry
CREATE TABLE IF NOT EXISTS public.ai_action_boundaries (
  action_id VARCHAR(64) PRIMARY KEY, -- e.g. 'mutate_or_block_release'
  name VARCHAR(128) NOT NULL,
  description TEXT NOT NULL,
  domain VARCHAR(32) NOT NULL, -- 'CLINICAL', 'FINANCIAL', 'RCM', 'SUPPLY_CHAIN', 'GOVERNANCE'
  risk_tier VARCHAR(32) NOT NULL DEFAULT 'READ_ONLY_ANALYTICS', -- 'READ_ONLY_ANALYTICS', 'EXPORT_SYNTHESIS', 'PROPOSED_MUTATION', 'RESTRICTED_SYSTEM_ACTION'
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  allowed_requester_roles TEXT[] NOT NULL DEFAULT ARRAY['analyst', 'clinical_director', 'facility_admin'],
  allowed_approver_roles TEXT[] NOT NULL DEFAULT ARRAY['clinical_director', 'facility_admin'],
  auto_expire_hours INTEGER NOT NULL DEFAULT 24,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Human-in-the-Loop (HITL) Proposed Actions Queue
CREATE TABLE IF NOT EXISTS public.ai_proposed_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  action_id VARCHAR(64) NOT NULL REFERENCES public.ai_action_boundaries(action_id) ON DELETE CASCADE,
  requester_id VARCHAR(64) NOT NULL,
  requester_role VARCHAR(32) NOT NULL,
  title VARCHAR(256) NOT NULL,
  rationale TEXT NOT NULL,
  proposed_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  projected_impact JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING_APPROVAL', -- 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXECUTED', 'EXPIRED'
  approver_id VARCHAR(64),
  approver_role VARCHAR(32),
  decision_notes TEXT,
  decided_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  execution_hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. AI Permission Audit Ledger
CREATE TABLE IF NOT EXISTS public.ai_permission_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL,
  user_role VARCHAR(32) NOT NULL,
  requested_permission VARCHAR(64) NOT NULL,
  target_resource VARCHAR(128) NOT NULL,
  decision VARCHAR(16) NOT NULL, -- 'GRANTED', 'DENIED'
  denial_reason TEXT,
  provenance_hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Analytical Views for Governance & HITL Queue
CREATE OR REPLACE VIEW public.vw_ai_pending_action_queue AS
SELECT
  pa.id,
  pa.facility_id,
  pa.action_id,
  ab.name AS action_name,
  ab.domain,
  ab.risk_tier,
  pa.requester_id,
  pa.requester_role,
  pa.title,
  pa.rationale,
  pa.proposed_payload,
  pa.projected_impact,
  pa.status,
  pa.expires_at,
  pa.created_at
FROM public.ai_proposed_actions pa
JOIN public.ai_action_boundaries ab ON pa.action_id = ab.action_id
WHERE pa.status = 'PENDING_APPROVAL' AND pa.expires_at > NOW();

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_ai_proposed_facility_status ON public.ai_proposed_actions(facility_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_proposed_expires ON public.ai_proposed_actions(expires_at);
CREATE INDEX IF NOT EXISTS idx_ai_permission_audit_facility ON public.ai_permission_audit_logs(facility_id, created_at DESC);

-- 6. Row-Level Security
ALTER TABLE public.ai_action_boundaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_proposed_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_permission_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_ai_action_boundaries_read ON public.ai_action_boundaries
  FOR SELECT TO authenticated USING (true);

CREATE POLICY p_ai_proposed_actions_tenant ON public.ai_proposed_actions
  FOR ALL TO authenticated
  USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
  WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

CREATE POLICY p_ai_permission_audit_tenant ON public.ai_permission_audit_logs
  FOR ALL TO authenticated
  USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
  WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);
```

---

## Business Rules
1. **Autonomous Mutation Prohibition (Zero AI Write Access)**:
   - Direct write/update/delete operations on database entities by AI agents without human approval are strictly prohibited.
   - Any tool or query attempting to modify clinical schedules, payer fee schedules, or claim statuses must route through `createActionProposal()`.
2. **Dual-Key Approval Protocol**:
   - A proposed action requires review and signoff by an authorized approver possessing `ai:approve_action` whose role is in `allowed_approver_roles`.
   - The user who requested/prompted the proposed action **cannot** approve their own proposal (separation of duties).
3. **Action Expiration & Staleness Guarantee**:
   - Proposed mutations automatically transition to `EXPIRED` if not approved within `auto_expire_hours` (default 24 hours).
   - Expired proposals cannot be executed; the AI agent must re-evaluate conditions and regenerate the proposal.
4. **Tenancy Inheritance**:
   - Approvers can only view and act upon proposals created within their active facility (`facility_id`).
5. **Deterministic Provenance**:
   - Approval decisions generate an immutable cryptographic signature tying `proposalId`, `approverId`, `decision`, and `timestamp`.

---

## Permissions / Security
| Permission Scope | Allowed Roles | Description | Risk Level |
| :--- | :--- | :--- | :--- |
| `ai:chat` | All authenticated roles (excluding guest) | Conversational assistant interface | Minimal |
| `ai:view_clinical` | `surgeon`, `clinical_manager`, `clinical_director`, `facility_admin` | Surgeon scorecards, duration metrics, implant variances | Low |
| `ai:view_financial` | `billing_manager`, `clinical_director`, `facility_admin` | Procedural margins, fee leakage, contract renewal radar | Medium |
| `ai:view_phi` | `clinical_director`, `billing_manager`, `facility_admin` | Access to un-redacted Safe Harbor identifiers | High |
| `ai:tool_execute` | Permitted roles based on tool contract matrix | Execute server-authoritative read tools | Low – Medium |
| `ai:propose_action` | `analyst`, `clinical_manager`, `billing_manager`, `facility_admin` | Submit draft mutation for human signoff | Medium |
| `ai:approve_action` | `clinical_director`, `billing_manager`, `facility_admin` | Execute dual-key signoff on proposed mutations | High |
| `ai:admin` | `facility_admin`, `super_admin` | Override circuit breakers, configure action boundaries | Critical |

---

## API / Service Requirements
The permissions service is implemented in `src/services/aiPermissionsService.js` and re-exported via `src/lib/aiPermissionsService.js`.

### Core Contracts & Methods:
1. `hasAiPermission(role, permission)`:
   - Evaluates whether a role possesses the specified AI permission.
   - Returns boolean.
2. `evaluateActionBoundary(actionId, sessionContext)`:
   - Checks if user's role can request or execute the specified action.
   - Returns `{ isAllowed: boolean, riskTier: string, requiresApproval: boolean, reason?: string }`.
3. `createActionProposal(actionId, payload, rationale, impact, sessionContext)`:
   - Creates a pending mutation draft in the HITL queue with a 24h expiration.
   - Returns `{ proposalId: string, status: 'PENDING_APPROVAL', provenanceHash: string }`.
4. `decideActionProposal(proposalId, decision, approverContext, notes)`:
   - Handles `APPROVE` or `REJECT` decision.
   - Validates that approver has `ai:approve_action` and enforces separation of duties.
   - Returns `{ status: 'APPROVED' | 'REJECTED', executedResult?: object, decisionHash: string }`.
5. `calculatePermissionsTelemetry(proposals)`:
   - Computes total action boundaries, active role grants, pending HITL queue depth, approval rate %, and dual-key compliance rate (100%).

---

## UI / Workflow Requirements
The UI is provided in `src/components/AIPermissionsView.jsx` and scoped styles in `src/components/AIPermissionsView.css`.

### Visual Structure:
1. **Top 5-Card Metric Ribbon**:
   - **Total AI Permissions**: Registered granular scopes (`8 Permissions`).
   - **Active Role Grants**: Canonical roles mapped to privileges (`8 Active Roles`).
   - **Pending HITL Approvals**: Actions awaiting executive review (`3 Pending Signoffs`).
   - **High-Risk Boundaries**: Protected operations requiring dual-key (`5 Guarded Actions`).
   - **Dual-Key Compliance**: Adherence to zero-autonomous-mutation rule (`100% Enforced`).
2. **Interactive Tabbed Console**:
   - **Tab 1: Role-Permission Matrix & Action Boundaries**:
     - Visual grid mapping canonical ASC roles to AI permission privileges.
     - Action boundaries table detailing action ID, risk tier badge, required approver roles, and expiration windows.
   - **Tab 2: Human-in-the-Loop (HITL) Action Approval Queue**:
     - Live queue of AI-proposed mutations with impact cards, before/after diffs, and rationale.
     - Direct **"Approve & Execute"** and **"Reject"** action buttons with modal confirmation and separation of duties checks.
   - **Tab 3: Permission Audit & Security Ledger**:
     - Filterable audit trail of permission evaluations, authorization denials, and signoff events.
3. **Maestro Clinical Design System**:
   - Strictly zero purple/violet/indigo/magenta/fuchsia tokens.
   - Authoritative palette: Emerald (`#059669`), Amber (`#d97706`), Crimson (`#dc2626`), Blue (`#0284c7`), Slate (`#64748b`), Neutral white/slate backgrounds.
   - Responsive flexbox container with `min-width: 0;` and `@media (max-width: 1280px)` fluid card wrapping.

---

## Audit / Provenance
1. **Action Proposal Diff Integrity**:
   - Every proposal captures the exact proposed JSON payload, projected financial/clinical impact, and AI rationale.
2. **Dual-Key Provenance Signatures**:
   - Cryptographic SHA-256 signature generated upon proposal creation and upon approval signoff:
     $$\text{Decision Hash} = \text{SHA256}(\text{proposalId} + ":" + \text{approverId} + ":" + \text{decision} + ":" + \text{timestamp})$$
3. **Security Ledger**:
   - All authorization denials and privilege checks are logged in `ai_permission_audit_logs`.

---

## QA / Test Cases
`tests/ai-permissions.test.js` covers 8 test suites and 22 verification criteria:
1. **Role-Permission Matrix Evaluation**:
   - Confirms privileges for clinical, financial, and admin roles.
   - Denies non-elevated roles from sensitive permissions (`ai:view_financial`, `ai:view_phi`, `ai:admin`).
2. **Action Boundary Classification**:
   - Classifies actions across all 4 risk tiers (`READ_ONLY_ANALYTICS`, `EXPORT_SYNTHESIS`, `PROPOSED_MUTATION`, `RESTRICTED_SYSTEM_ACTION`).
   - Enforces `requires_approval: true` on mutation actions.
3. **Human-in-the-Loop (HITL) Proposal Lifecycle**:
   - Creates valid proposal in `PENDING_APPROVAL` with 24h expiration.
   - Executes dual-key approval by authorized approver.
   - Rejects proposal when approver lacks `ai:approve_action`.
   - Enforces separation of duties (requester cannot approve own proposal).
4. **Tenancy Isolation**:
   - Restricts proposal actions to matching facility tenancy.
5. **Cryptographic Provenance Verification**:
   - Generates deterministic 64-character SHA-256 signatures for proposals and decisions.
6. **PostgreSQL Migration 100 Schema Integrity**:
   - UP file contains definitions, HITL queue, audit tables, indexes, and RLS.
   - DOWN file cleanly drops all objects with `CASCADE`.
7. **Zero-Purple Design Compliance**:
   - Scans `AIPermissionsView.jsx` and `AIPermissionsView.css` to guarantee zero prohibited purple tokens.
8. **App Wiring & Lib Facade**:
   - Confirms `src/lib/aiPermissionsService.js` re-exports all constants and functions.
   - Verifies navigation registration in `src/App.jsx`.

---

## Acceptance Criteria
- [x] Build passes (`npm run build` with zero errors).
- [x] Lint passes with zero errors.
- [x] 100% of automated QA tests pass via `node --test`.
- [x] Autonomous write mutations are strictly blocked; all state changes require dual-key human signoff.
- [x] Multi-tenant isolation verified with PostgreSQL RLS policies in migration 100.
- [x] Provenance hashes are cryptographically reproducible.
- [x] Strict zero-purple compliance verified across code and stylesheet.

---

## Dependencies
- Upstream Modules:
  - Phase C0 (AI Analyst Architecture).
  - Phase C1 (AI Tool Gateway & Server-Authoritative Contracts).
  - Application RBAC Master (`src/lib/rbacService.js`).

---

## Definition of Done
The AI Permissions & Action Boundaries feature is complete when the PostgreSQL migration is authored with clean rollback, the permissions and boundary service enforces HITL dual-key signoff, the UI dashboard console renders real-time matrix and approval queues without purple tokens, and the automated test suite passes with 100% green status.

---

## Implementation Notes
- **Specification**: [docs/phases/C2_AI_PERMISSIONS.md](file:///e:/medicalAI/asc-prototype/docs/phases/C2_AI_PERMISSIONS.md)
- **Database Migrations**:
  - [supabase/migrations/100_ai_permissions_and_action_boundaries.sql](file:///e:/medicalAI/asc-prototype/supabase/migrations/100_ai_permissions_and_action_boundaries.sql) (UP)
  - [supabase/migrations/100_ai_permissions_and_action_boundaries_down.sql](file:///e:/medicalAI/asc-prototype/supabase/migrations/100_ai_permissions_and_action_boundaries_down.sql) (DOWN)
- **Service Layer**:
  - [src/services/aiPermissionsService.js](file:///e:/medicalAI/asc-prototype/src/services/aiPermissionsService.js)
  - [src/lib/aiPermissionsService.js](file:///e:/medicalAI/asc-prototype/src/lib/aiPermissionsService.js)
- **UI Components**:
  - [src/components/AIPermissionsView.jsx](file:///e:/medicalAI/asc-prototype/src/components/AIPermissionsView.jsx)
  - [src/components/AIPermissionsView.css](file:///e:/medicalAI/asc-prototype/src/components/AIPermissionsView.css)
- **App Shell Integration**: [src/App.jsx](file:///e:/medicalAI/asc-prototype/src/App.jsx)
- **Test Suite**: [tests/ai-permissions.test.js](file:///e:/medicalAI/asc-prototype/tests/ai-permissions.test.js)
