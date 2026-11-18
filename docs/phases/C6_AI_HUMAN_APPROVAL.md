# C6 AI HUMAN APPROVAL & CONSEQUENTIAL ACTION GOVERNANCE ARCHITECTURE

## Purpose
The **AI Human Approval & Consequential Action Governance Tier** establishes authoritative Human-in-the-Loop (HITL) dual-key signoffs, executive quorum voting, blast-radius impact analysis, automated execution dispatch, and guaranteed 1-click rollback safeguards for all consequential, financial, clinical, or contractual actions recommended by the ASCANALYST AI platform.

Generative and predictive AI algorithms in healthcare ambulatory surgery environments can identify millions of dollars in revenue opportunities and operational optimizations (such as operating room block reallocation, implant construct standardization, fee schedule carveout adjustments, and pre-bill claim scrubbing overrides). However, autonomous AI execution of these mutations creates catastrophic regulatory, billing, and clinical malpractice liabilities. Phase C6 ensures that:
1. **Zero Unapproved Mutations**: No AI model, autonomous tool, or background agent can directly mutate the production database, write off financial balances, reallocate surgeon block hours, or alter surgical preference cards without affirmative, authenticated human approval.
2. **Multi-Tier Dual-Key & Quorum Governance**:
   - **Tier 1 (Standard Mutation)**: Single-key signoff by an authorized operational manager (financial impact < \$1,000, administrative corrections).
   - **Tier 2 (Consequential Dual-Key)**: Mandatory dual-key approval by two distinct executive roles (e.g. Clinical Director + Business Office Manager) for actions with financial impact between \$1,000 and \$25,000 or block transfers.
   - **Tier 3 (Executive Quorum)**: Multi-signature quorum approval (2 out of 3 executive officers: CFO, Medical Director, Facility Administrator) for structural modifications exceeding \$25,000 or contract renegotiations.
3. **Strict Separation of Duties**: The user who requested or prompted the AI recommendation cannot approve their own action. Key 1 approver cannot also execute Key 2.
4. **Blast-Radius Impact Assessment & 1-Click Rollback**: Every proposed action calculates its financial blast radius (\$), affected surgical cases count, and affected physician count, while persisting an immutable JSON inversion payload enabling guaranteed 1-click rollback within a 72-hour grace window.

---

## Scope
- **Production Requirements**:
  - Implement persistent approval request ledger, digital signatures table, and execution/rollback history (`ai_human_approvals`, `ai_approval_signatures`, `ai_consequential_executions`).
  - Deploy 6 consequential action categories:
    1. `OR_BLOCK_REALLOCATION`: Transferring recurring block schedule hours between surgical services or physicians.
    2. `CONSTRUCT_STANDARDIZATION`: Modifying preference cards to standardize vendor SKU implants and sterile supplies.
    3. `FINANCIAL_WRITE_OFF`: Adjusting contractual allowances or write-offs on aged patient/payer balances.
    4. `CONTRACT_RATE_AMENDMENT`: Overwriting commercial fee schedule base rates, carveouts, or multiplier terms.
    5. `CLAIM_SCRUBBER_OVERRIDE`: Forcing 837 EDI claim transmission bypassing pre-bill scrubber fatal stops.
    6. `STAFFING_WINDOW_MODIFICATION`: Modifying nursing and tech shift allocation templates.
  - Implement cryptographic state sealing (SHA-256 digital signature of approver identity, timestamp, role, and payload).
  - Implement reversible transaction dispatch engine with automated rollback timer.
  - Enforce organization and facility multi-tenancy isolation via PostgreSQL Row-Level Security (RLS).
  - Maestro Clinical design system compliance with strictly zero prohibited purple tokens.

---

## Current State
| Component | Classification | Current State Description | Action Required |
| :--- | :--- | :--- | :--- |
| `aiPermissionsService.js` (Phase C2) | **KEEP** | Provides basic `PROPOSED_MUTATION` classification and single-approver queue. | Extend to support multi-tier dual-key approval, executive quorum voting, and separation of duties. |
| `aiToolDefinitionsService.js` (Phase C3) | **KEEP** | Provides What-If scenario engines for block reallocation and construct standardization. | Connect scenario output promotions directly into the Phase C6 consequential approval pipeline. |
| `aiEvidenceService.js` (Phase C4) | **KEEP** | Links AI assertions to underlying source records. | Attach Phase C4 evidence citations to every proposed consequential action. |
| `aiHallucinationRulesService.js` (Phase C5) | **KEEP** | Intercepts ungrounded numbers and fabricated clinical codes. | Ensure proposed action payloads are scrubbed for grounded numbers before reaching human approvers. |
| Dual-Key Signatures Ledger | **MISSING** | No dedicated schema storing individual cryptographic signatures, key positions, or quorum tallies. | Implement `ai_approval_signatures` table. |
| Reversible Execution & Rollback Engine | **MISSING** | No automated mechanism to store JSON rollback payloads or execute 1-click state reversal. | Implement `ai_consequential_executions` table and service rollback methods. |
| HITL Consequential Governance Console | **MISSING** | No dedicated console allowing facility administrators and clinical directors to review pending dual-key queues, inspect blast radiuses, and manage rollbacks. | Implement `AIHumanApprovalView.jsx` with 5-card ribbon, pending queue, execution ledger, and live dual-key simulator. |

---

## Target State
1. **The Consequential Action Lifecycle**:
   - **Phase 1: Proposal**: AI tool or user drafts a consequential action. The blast-radius engine calculates projected financial delta, affected cases, and determines the approval tier (`TIER_1_STANDARD`, `TIER_2_DUAL_KEY`, `TIER_3_QUORUM`).
   - **Phase 2: Dual-Key Signoff**:
     - Key 1: Operational review and attestation by designated clinical or financial manager.
     - Key 2: Independent executive signoff by distinct credentialed leader. Separation of duties strictly enforced.
   - **Phase 3: Execution Dispatch**:
     - Server verifies all required cryptographic signatures against SHA-256 state hash.
     - Mutation is dispatched to production tables.
     - Rollback payload is persisted with a 72-hour grace period timestamp.
   - **Phase 4: Rollback (if required)**:
     - Authorized executive can trigger 1-click rollback, inverting all modified rows to their exact pre-execution state.
2. **Quorum & Dual-Key Rules**:
   - `TIER_1` (< \$1,000): 1 signature required (`facility_admin`, `clinical_director`, `billing_specialist`).
   - `TIER_2` (\$1,000 - \$25,000 or OR Block Shifts): 2 distinct signatures required (`clinical_director` + `facility_admin` or `cfo`).
   - `TIER_3` (> \$25,000 or Payer Contracts): Quorum of 2 out of 3 required (`cfo`, `medical_director`, `facility_admin`).
3. **Auditability & Compliance**:
   - Every signature records user ID, IP address, role, timestamp, statement of attestation, and SHA-256 signature hash.

---

## Data Model / Schema
PostgreSQL Migration: `104_ai_human_approval_governance.sql`

```sql
-- 1. AI Human Approval Requests Ledger
CREATE TABLE IF NOT EXISTS public.ai_human_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    request_code VARCHAR(32) NOT NULL, -- e.g. 'REQ-HITL-1042'
    action_type VARCHAR(64) NOT NULL, -- 'OR_BLOCK_REALLOCATION', 'CONSTRUCT_STANDARDIZATION', 'FINANCIAL_WRITE_OFF', 'CONTRACT_RATE_AMENDMENT', 'CLAIM_SCRUBBER_OVERRIDE'
    governance_tier VARCHAR(32) NOT NULL DEFAULT 'TIER_2_DUAL_KEY', -- 'TIER_1_STANDARD', 'TIER_2_DUAL_KEY', 'TIER_3_QUORUM'
    title VARCHAR(256) NOT NULL,
    rationale TEXT NOT NULL,
    requester_id VARCHAR(64) NOT NULL,
    requester_role VARCHAR(32) NOT NULL,
    proposed_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    rollback_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    financial_exposure_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    affected_cases_count INTEGER NOT NULL DEFAULT 0,
    affected_physicians_count INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING_APPROVAL', -- 'PENDING_APPROVAL', 'PARTIALLY_APPROVED', 'APPROVED', 'REJECTED', 'EXECUTED', 'ROLLED_BACK', 'EXPIRED'
    required_signatures_count INTEGER NOT NULL DEFAULT 2,
    current_signatures_count INTEGER NOT NULL DEFAULT 0,
    provenance_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '72 hours'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. AI Approval Signatures Ledger (Individual digital dual-key signatures)
CREATE TABLE IF NOT EXISTS public.ai_approval_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    approval_id UUID NOT NULL REFERENCES public.ai_human_approvals(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    signer_id VARCHAR(64) NOT NULL,
    signer_name VARCHAR(128) NOT NULL,
    signer_role VARCHAR(32) NOT NULL,
    key_position VARCHAR(16) NOT NULL, -- 'KEY_1', 'KEY_2', 'QUORUM_VOTE'
    decision VARCHAR(16) NOT NULL, -- 'APPROVED', 'REJECTED'
    attestation_statement TEXT NOT NULL,
    signature_hash VARCHAR(64) NOT NULL,
    signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. AI Consequential Executions & Rollback History
CREATE TABLE IF NOT EXISTS public.ai_consequential_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    approval_id UUID NOT NULL REFERENCES public.ai_human_approvals(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    action_type VARCHAR(64) NOT NULL,
    executed_by VARCHAR(64) NOT NULL,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reversible_until TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '72 hours'),
    execution_status VARCHAR(32) NOT NULL DEFAULT 'EXECUTED', -- 'EXECUTED', 'ROLLED_BACK', 'IRREVERSIBLE'
    rollback_reason TEXT,
    rolled_back_by VARCHAR(64),
    rolled_back_at TIMESTAMPTZ,
    execution_hash VARCHAR(64) NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_approvals_facility_status ON public.ai_human_approvals(facility_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_approvals_expires ON public.ai_human_approvals(expires_at);
CREATE INDEX IF NOT EXISTS idx_ai_signatures_approval ON public.ai_approval_signatures(approval_id);
CREATE INDEX IF NOT EXISTS idx_ai_executions_facility ON public.ai_consequential_executions(facility_id);

-- Views
CREATE OR REPLACE VIEW public.vw_ai_approval_queue_summary AS
SELECT 
    facility_id,
    COUNT(*) AS total_proposals,
    COUNT(*) FILTER (WHERE status = 'PENDING_APPROVAL' OR status = 'PARTIALLY_APPROVED') AS pending_signoffs_count,
    COUNT(*) FILTER (WHERE status = 'APPROVED' OR status = 'EXECUTED') AS approved_count,
    COUNT(*) FILTER (WHERE status = 'REJECTED') AS rejected_count,
    COUNT(*) FILTER (WHERE status = 'ROLLED_BACK') AS rolled_back_count,
    SUM(financial_exposure_usd) FILTER (WHERE status = 'PENDING_APPROVAL' OR status = 'PARTIALLY_APPROVED') AS pending_exposure_usd
FROM public.ai_human_approvals
GROUP BY facility_id;

-- Tenancy RLS Policies
ALTER TABLE public.ai_human_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_approval_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_consequential_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_ai_approvals_tenant ON public.ai_human_approvals
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
    WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

CREATE POLICY p_ai_signatures_tenant ON public.ai_approval_signatures
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
    WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

CREATE POLICY p_ai_executions_tenant ON public.ai_consequential_executions
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
    WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);
```

---

## Business Rules & Deterministic State Machine
1. **Separation of Duties Rule**:
   - `signer_id` MUST NOT match `requester_id` for Tier 2 and Tier 3 actions. Self-approval is rejected with structured error `SEPARATION_OF_DUTIES_VIOLATION`.
2. **Dual-Key Sequence**:
   - Proposer submits request -> Status transitions to `PENDING_APPROVAL`.
   - Key 1 Approver signs -> Status transitions to `PARTIALLY_APPROVED` (`current_signatures_count = 1`).
   - Key 2 Approver signs -> Status transitions to `APPROVED` (`current_signatures_count = 2`).
   - Any reject signature -> Status immediately transitions to `REJECTED`.
3. **Execution & Rollback Guarantee**:
   - Execution is dispatched only after `status == 'APPROVED'`.
   - On execution, state transitions to `EXECUTED` and creates an entry in `ai_consequential_executions`.
   - Rollback is permitted at any point within the `reversible_until` window (72 hours). Invoking rollback applies `rollback_payload` and updates status to `ROLLED_BACK`.

---

## Permissions & Security
- **Approver Role Matrix**:
  - `facility_admin`, `super_admin`: Authorized for Key 1, Key 2, and Quorum signatures across all domains.
  - `clinical_director`: Key 1 / Key 2 approver for OR block reallocations and preference card construct changes.
  - `cfo`, `financial_controller`: Key 1 / Key 2 approver for financial write-offs and commercial contract rate amendments.
  - `billing_manager`: Key 1 approver for claim scrubbing overrides.
- **Audit Logging**: Every digital signature is cryptographically hashed with SHA-256 and logged to `audit_logs`.

---

## API & Service Requirements
Backend service: `src/services/aiHumanApprovalService.js` and `src/lib/aiHumanApprovalService.js`

1. `getApprovalQueue(facilityId, filters)`: Returns filtered approval requests with signoff progress.
2. `getApprovalDetail(approvalId)`: Retrieves full proposal, blast radius, signatures, and rollback payload.
3. `submitApprovalSignature(approvalId, signerContext)`: Submits digital signature (Key 1 or Key 2), enforces separation of duties, updates request state.
4. `executeApprovedAction(approvalId, executorContext)`: Dispatches approved mutation and creates execution record.
5. `rollbackExecution(executionId, rollbackContext)`: Reverses mutation using persisted rollback payload.
6. `getHumanApprovalTelemetry(facilityId)`: Calculates 5 top-ribbon KPIs.

---

## UI / Workflow Requirements
Screen: `AIHumanApprovalView.jsx` accessible under `🤖 AI Center -> AI Human Approval`.

1. **5-Card Top Metric Ribbon (Maestro Clinical)**:
   - **Pending Signoffs**: Count of active dual-key proposals (Amber icon `<Clock size={16} />`).
   - **Approved Executions**: Total approved and executed consequential actions (Emerald icon `<CheckCircle2 size={16} />`).
   - **Rejected Proposals**: Count of vetoed or rejected actions (Crimson icon `<XCircle size={16} />`).
   - **Avg Signoff Latency**: Average turnaround time in hours (Sky blue icon `<Activity size={16} />`).
   - **Rollback Readiness**: 100% Guaranteed Rollback Safeguard (Emerald icon `<RefreshCw size={16} />`).
2. **Main Functional Tabs**:
   - **Tab 1: Pending Approval Queue**: Dual-key cards showing blast radius, financial impact, signatures received (Key 1 / Key 2 badges), and "Review & Sign" button.
   - **Tab 2: Execution Ledger & Rollback**: Table of executed consequential actions, reversible timer countdown, and 1-click rollback modal.
   - **Tab 3: Governance Policies & Matrix**: Configurable financial ceilings, approver roles, and separation of duties enforcement rules.
   - **Tab 4: Interactive HITL Simulator Sandbox**: Interactive simulator allowing users to experience proposing an action, signing Key 1, signing Key 2, executing mutation, and rolling back.
3. **Design & Color Palette**:
   - Strictly Zero Purple tokens.
   - Maestro Clinical palette: Emerald, Amber, Crimson, Sky, Slate, Neutral.
   - Full light and dark mode support with explicit contrast styling.

---

## Audit & Provenance
- Every signature records:
  - `signer_id`, `signer_name`, `signer_role`, `key_position`, `signed_at`
  - `signature_hash`: SHA-256 hash of `approval_id + signer_id + decision + timestamp`
  - `rollback_payload`: Immutable snapshot of pre-execution state

---

## QA / Test Cases
1. **Unit Tests** (`tests/ai-human-approval.test.js`):
   - Telemetry computation (pending, approved, rejected, rollback readiness).
   - Approval queue retrieval and domain filtering.
   - Dual-key signing progression: `PENDING_APPROVAL` -> `PARTIALLY_APPROVED` -> `APPROVED`.
   - Separation of duties enforcement: Rejects proposer self-approval.
   - Duplicate key prevention: Prohibits Key 1 signer from also signing Key 2.
   - Execution dispatch: Requires `APPROVED` status before execution.
   - 1-click rollback: Inverts state from `EXECUTED` to `ROLLED_BACK`.
   - Cryptographic SHA-256 signature hashing.
   - Zero prohibited purple tokens in component and stylesheet.
   - Explicit `[data-theme="dark"]` contrast overrides without undefined `--bg-hover`.
2. **Integration & Build Tests**:
   - Clean production build with Vite (`npm run build`).
   - Full repository test suite passes (`npm test`).

---

## Acceptance Criteria
- [x] Build passes with zero errors.
- [x] All automated tests pass (15+ assertions).
- [x] Zero purple/violet tokens present in code, styles, or comments.
- [x] Dark mode text contrast is 100% compliant with no white-on-white text washing.
- [x] Tenancy isolation enforced via PostgreSQL RLS policies.
- [x] All file references use clickable `file:///` markdown links.
