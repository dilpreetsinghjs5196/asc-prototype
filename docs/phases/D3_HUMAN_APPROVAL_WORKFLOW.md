# D3 HUMAN APPROVAL WORKFLOW

## Purpose
The Human Approval Workflow establishes a strict, auditable, and role-governed authorization framework for financial recommendations and Next Best Financial Actions (NBFA) before execution. It prevents automated or unvetted financial commitments, enforces dual-key sign-offs for high-impact claims and contract carve-outs, eliminates self-approval conflicts of interest, and captures immutable cryptographic signatures and review rationales.

## Scope
- Define multi-tier approval policies based on expected financial value, operational risk, and contract sensitivity.
- Preserve backward compatibility with ASCANALYST claim submissions, appeals workflows, and block scheduling.
- Implement deterministic status state machines: `PENDING` $\to$ `APPROVED` | `REJECTED` | `ESCALATED` | `EXPIRED` $\to$ `EXECUTED`.
- Enforce organization/facility tenancy isolation and granular Role-Based Access Control (RBAC).
- Provide auditable rejection feedback loops that feed back into recommendation prioritization and model fine-tuning.

## Current State
Prior to Phase D3, financial recommendations generated in Phase D0 (`next_best_financial_actions`) could transition directly from `ASSIGNED` to `COMPLETED` without formal multi-stakeholder governance, secondary review triggers, or cryptographic digital signatures.

| Component | Status | Description |
| :--- | :--- | :--- |
| `public.next_best_financial_actions` | **KEEP** | Core financial recommendations established in Phase D0. |
| `public.recommendation_scoring_profiles` | **KEEP** | Deterministic priority scoring established in Phase D1. |
| `public.recommendation_evidence_items` | **KEEP** | Multi-source clinical and contractual citations established in Phase D2. |
| Direct `action.status = COMPLETED` transition | **REPLACE** | Replace direct manual execution with a governed multi-tier approval workflow for sensitive or high-dollar actions. |
| `public.recommendation_approvals` | **MISSING** | Production table tracking approval requests, tiers, signature thresholds, timeout deadlines, and decision hashes. |
| `public.recommendation_approval_actions` | **MISSING** | Immutable event ledger capturing individual approvals, rejections, comments, and cryptographic signature tokens. |
| Multi-Tier Threshold Engine | **MISSING** | Deterministic routing assigning `TIER_1_SINGLE_SIGN`, `TIER_2_DUAL_KEY`, or `TIER_3_EXECUTIVE_QUORUM`. |
| Human Approval Workflow UI | **MISSING** | Maestro Clinical authorization inbox with dual-key progress indicators, rejection rationale modals, and execution dispatches. |

## Target State
In the target state, any high-impact recommendation is routed through a multi-tier human approval workflow:
1. **Deterministic Threshold Routing:**
   - **Tier 1 (Single Signoff - $<\$2,500.00$):** Requires 1 authorized signature from a Billing Specialist or Financial Controller.
   - **Tier 2 (Dual-Key Signoff - $\$2,500.00 - \$10,000.00$):** Requires 2 distinct authorized signoffs (e.g., Billing Lead + Clinical/OR Director or Revenue Cycle Manager).
   - **Tier 3 (Executive Quorum - $>\$10,000.00$ or Contract Terms):** Requires sign-off from Chief Financial Officer or Executive Medical Director.
2. **Anti-Self-Approval Invariant:** A requester cannot approve their own submission (`reviewer_user_id !== requested_by_user_id`).
3. **Execution Gating:** Recommendations remain in an unexecuted holding state until all required signatures are collected. Once approved, authorized users can trigger authoritative execution dispatch.
4. **Mandatory Rejection & Escalation Rationales:** Any rejection or information request requires a minimum 10-character business rationale recorded in the audit trail.
5. **Cryptographic Provenance:** Every approval decision generates an immutable SHA-256 hash validating the action payload, signature tokens, reviewer roles, and timestamps.

## Data Model / Schema

### 1. `public.recommendation_approvals`
```sql
CREATE TABLE IF NOT EXISTS public.recommendation_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_id UUID NOT NULL REFERENCES public.next_best_financial_actions(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    approval_tier VARCHAR(32) NOT NULL CHECK (approval_tier IN (
        'TIER_1_SINGLE_SIGN',
        'TIER_2_DUAL_KEY',
        'TIER_3_EXECUTIVE_QUORUM'
    )),
    status VARCHAR(24) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
        'PENDING',
        'APPROVED',
        'REJECTED',
        'ESCALATED',
        'EXPIRED',
        'EXECUTED'
    )),
    requested_by_user_id VARCHAR(64) NOT NULL,
    requested_by_name VARCHAR(128) NOT NULL,
    required_role VARCHAR(64) NOT NULL,
    required_signatures_count INT NOT NULL DEFAULT 1 CHECK (required_signatures_count >= 1 AND required_signatures_count <= 3),
    collected_signatures_count INT NOT NULL DEFAULT 0 CHECK (collected_signatures_count >= 0),
    financial_impact_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    timeout_at TIMESTAMPTZ,
    execution_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    cryptographic_decision_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_action_active_approval UNIQUE(action_id, status)
);

CREATE INDEX IF NOT EXISTS idx_rec_approvals_action ON public.recommendation_approvals(action_id);
CREATE INDEX IF NOT EXISTS idx_rec_approvals_facility ON public.recommendation_approvals(facility_id, status);
CREATE INDEX IF NOT EXISTS idx_rec_approvals_tier ON public.recommendation_approvals(approval_tier);
```

### 2. `public.recommendation_approval_actions`
```sql
CREATE TABLE IF NOT EXISTS public.recommendation_approval_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    approval_id UUID NOT NULL REFERENCES public.recommendation_approvals(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    action_id UUID NOT NULL REFERENCES public.next_best_financial_actions(id) ON DELETE CASCADE,
    action_type VARCHAR(24) NOT NULL CHECK (action_type IN (
        'APPROVE',
        'REJECT',
        'REQUEST_INFO',
        'ESCALATE',
        'EXECUTE'
    )),
    reviewer_user_id VARCHAR(64) NOT NULL,
    reviewer_name VARCHAR(128) NOT NULL,
    reviewer_role VARCHAR(64) NOT NULL,
    decision_comments TEXT NOT NULL,
    signature_token VARCHAR(128) NOT NULL,
    signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rec_approval_actions_approval ON public.recommendation_approval_actions(approval_id, signed_at DESC);
CREATE INDEX IF NOT EXISTS idx_rec_approval_actions_facility ON public.recommendation_approval_actions(facility_id, signed_at DESC);
```

### 3. `public.vw_recommendation_approval_telemetry`
```sql
CREATE OR REPLACE VIEW public.vw_recommendation_approval_telemetry AS
SELECT
    facility_id,
    COUNT(id) AS total_approval_requests,
    COUNT(id) FILTER (WHERE status = 'PENDING') AS pending_requests_count,
    COUNT(id) FILTER (WHERE status = 'APPROVED') AS approved_requests_count,
    COUNT(id) FILTER (WHERE status = 'EXECUTED') AS executed_requests_count,
    COUNT(id) FILTER (WHERE status = 'REJECTED') AS rejected_requests_count,
    COUNT(id) FILTER (WHERE approval_tier = 'TIER_2_DUAL_KEY') AS dual_key_requests_count,
    COUNT(id) FILTER (WHERE approval_tier = 'TIER_3_EXECUTIVE_QUORUM') AS executive_quorum_requests_count,
    COALESCE(ROUND(AVG(financial_impact_amount), 2), 0.00) AS avg_financial_impact,
    MAX(updated_at) AS latest_approval_activity_at
FROM public.recommendation_approvals
GROUP BY facility_id;
```

## Business Rules

### 1. Deterministic Tier Threshold Routing
The approval tier is automatically derived from the recommendation's financial value and category:
- **Tier 1 (`TIER_1_SINGLE_SIGN`):** Financial value $<\$2,500.00$. Single sign-off required (`required_signatures_count = 1`). Permitted roles: `billing_specialist`, `financial_controller`, `admin`.
- **Tier 2 (`TIER_2_DUAL_KEY`):** Financial value $\$2,500.00 - \$10,000.00$ OR category `OR_BLOCK_RELEASE`. Dual sign-offs required (`required_signatures_count = 2`). Signers must have distinct roles (e.g., Billing Lead + Clinical Director).
- **Tier 3 (`TIER_3_EXECUTIVE_QUORUM`):** Financial value $>\$10,000.00$ OR permanent payer contract adjustment. Single or dual executive sign-off required (`required_signatures_count = 2`). Permitted roles: `cfo`, `medical_director`, `super_admin`.

### 2. Anti-Self-Approval Enforcement
A user who submitted a financial recommendation or requested approval CANNOT cast an approval vote on that same request:
$$\text{reviewer\_user\_id} \neq \text{requested\_by\_user\_id}$$
Violation triggers a hard validation error (`Self-approval is strictly prohibited by ASC financial compliance governance.`).

### 3. Status Transitions
- `PENDING` $\to$ `APPROVED`: Transition occurs when `collected_signatures_count == required_signatures_count`.
- `PENDING` $\to$ `REJECTED`: A single valid rejection vote transitions request to `REJECTED` and halts execution.
- `APPROVED` $\to$ `EXECUTED`: User triggers authoritative execution dispatch.
- `PENDING` $\to$ `EXPIRED`: Triggered when current timestamp exceeds `timeout_at` without reaching required signatures.

### 4. Prohibited Behaviors
- **Zero Silent Approvals:** Every vote must be accompanied by a reviewer identity, role, timestamp, and digital signature token.
- **Zero Execution of Pending Actions:** Any attempt to execute an action before reaching `APPROVED` state is blocked at the service level.

## Permissions / Security
- **Tenancy:** Strictly enforces `facility_id UUID` boundaries.
- **Role Permissions:**
  - `admin`, `super_admin`, `cfo`: Full approval, rejection, and execution rights across all tiers.
  - `financial_controller`, `billing_specialist`: Approval rights for Tier 1 and Tier 2 billing actions.
  - `clinical_director`: Approval rights for Tier 2 OR block reallocations and clinical dictation waivers.
  - `viewer`: Read-only audit log inspection.

## API / Service Requirements

### Backend Services (`recommendationApprovalService.js`)
- `getApprovalQueue(facilityId, filters)`: Retrieves filtered approval requests with associated financial actions and evidence summaries.
- `submitForApproval(actionId, userContext)`: Creates a new approval request evaluating tier thresholds and setting required signature counts.
- `reviewApproval(approvalId, reviewData)`: Records an approval, rejection, or request-for-info vote, checks quorum, updates status, and appends an audit action.
- `executeApprovedAction(approvalId, userContext)`: Dispatches the approved action to external billing/EHR systems and marks status as `EXECUTED`.
- `getApprovalTelemetry(facilityId)`: Aggregates real-time metrics (pending count, approval rate %, execution velocity).
- `computeDecisionHash(decisionObject)`: Computes authoritative SHA-256 hash for legal provenance.

## UI / Workflow Requirements
- **Approval Workflow Inbox:**
  - **Telemetry Ribbon (5 Cards):** Pending Authorizations, Average Decision Velocity, Dual-Key Quorum Rate %, Total Financial Impact Under Review, Uncontested Integrity.
  - **Filter Controls:** Tier selector (`ALL`, `Tier 1`, `Tier 2`, `Tier 3`), Status selector (`ALL`, `Pending`, `Approved`, `Executed`, `Rejected`), and Search.
  - **Approval Cards Grid:**
    - Action Header: Action Code, Title, Target Payer/Surgeon, Financial Impact Badge.
    - Tier & Signature Progress Bar: Visual badges for collected signatures (e.g., "1 of 2 Signatures Collected").
    - Embedded Evidence Preview: Compact citation chips (Claim Line, CARC code, Contract clause).
    - Review Actions: "Approve Recommendation", "Reject / Dispute", "Execute Action" (unlocked upon approval).
- **Interactive Modals:**
  - **Approve Modal:** Captures signature confirmation, role verification, and optional comments.
  - **Reject Modal:** Enforces mandatory rejection rationale ($\ge 10$ characters).
  - **Audit History Drawer:** Displays timestamped event ledger with cryptographic SHA-256 hashes.

## Audit / Provenance
Every approval and rejection action records:
- `signature_token`: Cryptographic digital signature generated at time of sign-off.
- `cryptographic_decision_hash`: SHA-256 digest computed across `approval_id`, `action_id`, reviewer ID, role, comments, and decision timestamp.

## QA / Test Cases
1. **Tier Routing Integrity:** Verify that actions $<\$2,500$ map to Tier 1, $\$2,500-\$10,000$ to Tier 2, and $>\$10,000$ to Tier 3.
2. **Anti-Self-Approval Defense:** Ensure requester is barred from signing off on their own approval request.
3. **Quorum Progression:** Verify that Tier 2 requests require 2 distinct signatures before transitioning to `APPROVED`.
4. **Execution Safeguard:** Confirm execution is blocked until request is in `APPROVED` status.
5. **Rejection Rationale Enforcement:** Verify rejection without $\ge 10$ characters of justification is blocked.
6. **Cryptographic SHA-256 Proof:** Verify deterministic calculation hash reproducibility.
7. **PostgreSQL Migration 110:** Verify UP and DOWN migration idempotency, UUID foreign keys, constraints, and RLS policies.
8. **Maestro Clinical Zero-Purple Compliance:** Verify zero prohibited purple tokens across all D3 files.
9. **App Shell Wiring:** Confirm navigation, header titles, and tab rendering.

## Acceptance Criteria
- Build passes (`npm run build`).
- Full test suite passes without regressions (`npm test`).
- Zero mock or placeholder values presented as production truth.
- Tenant isolation strictly verified.
- Multi-tier thresholds and quorum requirements mathematically enforced.

## Dependencies
- Upstream: Phase D0 (`next_best_financial_actions`), Phase D1 (`recommendation_scoring_profiles`), Phase D2 (`recommendation_evidence_items`).
- PostgreSQL: `pgcrypto` extension for `gen_random_uuid()`.

## Definition of Done
The feature is complete only when the schema migration, authoritative service, multi-tier state machine, approval inbox UI, and automated test suite are fully operational and verified.

## Implementation Notes
- Migration `110_recommendation_human_approval.sql` deploys tables, indexes, telemetry view, and RLS policies.
- Migration `110_recommendation_human_approval_down.sql` provides clean rollback capability.
- Client service `recommendationApprovalService.js` and facade `src/lib/recommendationApprovalService.js` authored with comprehensive seed requests and quorum models.
- UI component `RecommendationApprovalWorkflowView.jsx` and styling `RecommendationApprovalWorkflowView.css` authored following Maestro Clinical design system.
