# D4 DECISION LEDGER

## Purpose
The Decision Ledger is the immutable, event-sourced audit and outcomes engine for the ASC Decision Intelligence system. It tracks the complete lifecycle of financial actions—from initial machine recommendation (D0) and priority scoring (D1), through evidentiary backing (D2) and human approval signoff (D3), to external execution, payer adjudication, and final realized value accounting. It guarantees auditable closed-loop financial governance, reconciles expected vs. realized financial impact, and cryptographically proves chain-of-custody for regulatory and legal compliance.

## Scope
- Capture every executed or abandoned recommendation into an append-only, tamper-evident ledger with SHA-256 block hash chaining.
- Reconcile expected financial value against actual realized value derived from EDI 835 remittances, clearinghouse responses, EHR block schedule completions, and patient payments.
- Calculate deterministic variance metrics: absolute dollar variance ($\Delta = \text{Realized} - \text{Expected}$), realization yield percentage, and realization velocity (Mean Time to Realization, MTTR).
- Maintain complete provenance linking each ledger block to upstream claim numbers, CARC/RARC remarks, contractual clauses, operative notes, and approver signature tokens.
- Enforce organization and facility multi-tenancy isolation (`facility_id UUID`) and granular RBAC.
- Provide real-time telemetry on aggregate financial recovery, realization accuracy, and cryptographic ledger integrity.

## Current State
Prior to Phase D4, the system possessed recommendation generation (D0), multi-parameter priority scoring (D1), evidentiary citation tracking (D2), and human dual-key authorization (D3). However, once an action was approved and dispatched, the system had no authoritative mechanism to record the ultimate adjudication outcome, match it to incoming 835 remittance adjustments, verify realized dollars, or detect discrepancies between projected and realized financial yield.

| Component | Status | Description |
| :--- | :--- | :--- |
| `public.next_best_financial_actions` | **KEEP** | Authoritative financial recommendations catalog established in Phase D0. |
| `public.recommendation_scoring_profiles` | **KEEP** | Mathematical priority scoring profiles established in Phase D1. |
| `public.recommendation_evidence_items` | **KEEP** | Multi-source clinical, contractual, and remittance evidence established in Phase D2. |
| `public.recommendation_approvals` | **KEEP** | Multi-tier human approval requests and dual-key signatures established in Phase D3. |
| Action execution without post-adjudication tracking | **REPLACE** | Replace open-ended execution status with an authoritative closed-loop decision ledger. |
| `public.decision_ledger_entries` | **MISSING** | Production table tracking immutable ledger blocks, financial variance, realization status, and SHA-256 block hash chains. |
| `public.decision_ledger_events` | **MISSING** | Immutable event-sourced audit ledger capturing granular state transitions from recommendation to value realization. |
| Cryptographic Block Hash Chaining | **MISSING** | Tamper-evident ledger linking each decision block to the previous block's SHA-256 digest. |
| Closed-Loop Value Realization Engine | **MISSING** | Deterministic reconciliation linking 835 remittance checks and scheduling recoveries to original recommendations. |
| Decision Ledger UI & Verification Workbench | **MISSING** | Maestro Clinical interface displaying ledger blocks, variance analytics, cryptographic integrity verification, and event drill-downs. |

## Target State
In the target state, every executed financial recommendation transitions into an immutable, cryptographically chained Decision Ledger:
1. **Append-Only Ledger Blocks:** Each action entry receives a sequential monotonic block index and hashes its contents combined with the preceding block's hash ($H_n = \text{SHA-256}(H_{n-1} + \text{Payload}_n)$).
2. **Deterministic Closed-Loop Accounting:**
   - Realized dollar amounts are matched against source 835 ERA remittances, electronic claims attachments, or scheduling system logs.
   - Financial variance is computed authoritative server-side: $\text{Variance} = \text{Realized Amount} - \text{Expected Value}$.
   - Realization Rate is calculated: $\text{Rate} = (\text{Realized Amount} / \text{Expected Value}) \times 100\%$.
3. **Discrete Realization Statuses:**
   - `PENDING_REALIZATION`: Action executed; awaiting electronic adjudication remittance or payment posting.
   - `PARTIALLY_REALIZED`: Adjudicated payment received, but below the expected financial recovery target.
   - `FULLY_REALIZED`: Realized payment matches expected recovery within $\pm 1.0\%$.
   - `OVER_REALIZED`: Realized payment exceeds initial expected value (e.g., successful statutory prompt-pay penalty recovery).
   - `UNREALIZED_DEFICIT`: Payer issued final unappealable disallowance or timely filing was exhausted.
   - `ABANDONED`: Action was approved but cancelled before execution dispatch.
4. **Instant Cryptographic Verification:** The client and server can verify the unbroken cryptographic integrity of the entire ledger chain on demand, alerting users to any database tampering or unauthorized row manipulation.
5. **Full Audit Traceability:** Users can drill into any ledger block to inspect the complete chain of custody: initial AI prompt/rule, priority scoring calculation trace, cited evidence snippets, approver digital signatures, and electronic remittance payload.

## Data Model / Schema

### 1. `public.decision_ledger_entries`
```sql
CREATE TABLE IF NOT EXISTS public.decision_ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ledger_sequence_number BIGSERIAL,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    action_id UUID NOT NULL REFERENCES public.next_best_financial_actions(id) ON DELETE CASCADE,
    approval_id UUID REFERENCES public.recommendation_approvals(id) ON DELETE SET NULL,
    action_code VARCHAR(32) NOT NULL,
    category VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    expected_financial_value NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    realized_financial_value NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    variance_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    realization_percentage NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    realization_status VARCHAR(32) NOT NULL DEFAULT 'PENDING_REALIZATION' CHECK (realization_status IN (
        'PENDING_REALIZATION',
        'PARTIALLY_REALIZED',
        'FULLY_REALIZED',
        'OVER_REALIZED',
        'UNREALIZED_DEFICIT',
        'ABANDONED'
    )),
    adjudication_source VARCHAR(64),
    adjudication_reference VARCHAR(128),
    adjudicated_at TIMESTAMPTZ,
    time_to_realization_days NUMERIC(6, 1),
    execution_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approver_signatures_count INT NOT NULL DEFAULT 1,
    evidence_completeness_score NUMERIC(5, 2) NOT NULL DEFAULT 100.00,
    previous_block_hash VARCHAR(64) NOT NULL,
    merkle_root_hash VARCHAR(64) NOT NULL,
    current_block_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ledger_action UNIQUE (action_id)
);

CREATE INDEX IF NOT EXISTS idx_decision_ledger_facility ON public.decision_ledger_entries(facility_id, realization_status);
CREATE INDEX IF NOT EXISTS idx_decision_ledger_seq ON public.decision_ledger_entries(facility_id, ledger_sequence_number ASC);
CREATE INDEX IF NOT EXISTS idx_decision_ledger_action ON public.decision_ledger_entries(action_id);
CREATE INDEX IF NOT EXISTS idx_decision_ledger_hash ON public.decision_ledger_entries(current_block_hash);
```

### 2. `public.decision_ledger_events`
```sql
CREATE TABLE IF NOT EXISTS public.decision_ledger_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ledger_entry_id UUID NOT NULL REFERENCES public.decision_ledger_entries(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    event_type VARCHAR(32) NOT NULL CHECK (event_type IN (
        'RECOMMENDATION_REGISTERED',
        'APPROVAL_GRANTED',
        'ACTION_DISPATCHED',
        'ADJUDICATION_MATCHED',
        'VALUE_REALIZED',
        'VARIANCE_CONTESTED',
        'AUDIT_SEALED'
    )),
    event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    recorded_by_user_id VARCHAR(64) NOT NULL,
    recorded_by_name VARCHAR(128) NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_hash VARCHAR(64) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_decision_ledger_events_entry ON public.decision_ledger_events(ledger_entry_id, recorded_at ASC);
CREATE INDEX IF NOT EXISTS idx_decision_ledger_events_facility ON public.decision_ledger_events(facility_id, recorded_at ASC);
```

### 3. `public.vw_decision_ledger_telemetry`
```sql
CREATE OR REPLACE VIEW public.vw_decision_ledger_telemetry AS
SELECT
    facility_id,
    COUNT(id) AS total_ledger_entries_count,
    COALESCE(SUM(expected_financial_value), 0.00) AS total_expected_financial_value,
    COALESCE(SUM(realized_financial_value), 0.00) AS total_realized_financial_value,
    COALESCE(SUM(variance_amount), 0.00) AS net_realization_variance_amount,
    CASE 
        WHEN COALESCE(SUM(expected_financial_value), 0.00) > 0 
        THEN ROUND((COALESCE(SUM(realized_financial_value), 0.00) / SUM(expected_financial_value)) * 100.0, 1)
        ELSE 100.0
    END AS cumulative_realization_rate_pct,
    COALESCE(ROUND(AVG(time_to_realization_days) FILTER (WHERE time_to_realization_days IS NOT NULL), 1), 0.0) AS avg_time_to_realization_days,
    COUNT(id) FILTER (WHERE realization_status = 'FULLY_REALIZED') AS fully_realized_count,
    COUNT(id) FILTER (WHERE realization_status = 'OVER_REALIZED') AS over_realized_count,
    COUNT(id) FILTER (WHERE realization_status = 'PARTIALLY_REALIZED') AS partially_realized_count,
    COUNT(id) FILTER (WHERE realization_status = 'PENDING_REALIZATION') AS pending_realization_count,
    COUNT(id) FILTER (WHERE realization_status = 'UNREALIZED_DEFICIT') AS unrealized_deficit_count,
    MAX(updated_at) AS latest_ledger_activity_at
FROM public.decision_ledger_entries
GROUP BY facility_id;
```

## Business Rules

### 1. Deterministic Financial Variance & Yield Formulas
All variance and yield calculations must execute deterministically without floating-point drift:
$$\text{Variance Amount} = \text{Realized Financial Value} - \text{Expected Financial Value}$$
$$\text{Realization Percentage} = \begin{cases} 
0.0\% & \text{if Expected Value} = 0 \\
\text{Round}\left(\left(\frac{\text{Realized Value}}{\text{Expected Value}}\right) \times 100, 1\right) & \text{if Expected Value} > 0 
\end{cases}$$

### 2. Status Transition Rules
- If $\text{Realized Value} = 0$ and no adjudication has occurred $\to$ `PENDING_REALIZATION`.
- If $\text{Realized Value} > 0$ and $\text{Realized Value} < 0.99 \times \text{Expected Value}$ $\to$ `PARTIALLY_REALIZED`.
- If $0.99 \times \text{Expected Value} \le \text{Realized Value} \le 1.01 \times \text{Expected Value}$ $\to$ `FULLY_REALIZED`.
- If $\text{Realized Value} > 1.01 \times \text{Expected Value}$ $\to$ `OVER_REALIZED`.
- If adjudication reports final $0.00$ paid with exhausted appeals $\to$ `UNREALIZED_DEFICIT`.

### 3. Cryptographic Block Chaining (Proof of Authority)
- **Genesis Block:** The initial entry in a facility's ledger links to the well-known genesis digest:
  $$H_0 = \text{'0000000000000000000000000000000000000000000000000000000000000000'}$$
- **Subsequent Blocks:** For sequence $n > 0$, the block's current hash is strictly derived from:
  $$H_n = \text{SHA-256}\left(\text{JSON}(\{ \text{seq}: n, \text{prev\_hash}: H_{n-1}, \text{action\_code}, \text{facility\_id}, \text{expected}, \text{realized}, \text{status}, \text{timestamp} \})\right)$$
- If any historical record is updated or deleted, the subsequent hash links break, rendering the chain invalid during verification.

### 4. Prohibited Behaviors
- **No Manual Deletion of Ledger Entries:** Decision ledger entries are append-only. Cancellation or reversal requires an offsetting adjusting event (`ADJUDICATION_MATCHED` or `VARIANCE_CONTESTED`), never an in-place `DELETE`.
- **No Unverifiable Financial Numbers:** Every non-zero realized dollar figure must be backed by an electronic remittance reference (e.g., 835 check number, ACH trace, or PMS patient receipt number).

## Permissions / Security
- **Tenancy Boundary:** All database operations strictly filter on `facility_id UUID`. Cross-facility ledger consolidation is restricted to enterprise CFOs.
- **Role Permissions:**
  - `cfo`, `admin`, `super_admin`: Full access to inspect ledger, execute chain-wide cryptographic verification, record manual adjudication adjustments, and export legal audit archives.
  - `financial_controller`, `billing_specialist`: Read access to ledger entries; permission to record 835 remittance matches and post realized recoveries.
  - `clinical_director`, `materials_manager`: Read-only access to ledger blocks within their respective departments (e.g., OR block recoveries, implant carveout yields).
  - `viewer`: Read-only telemetry inspection; prohibited from recording outcomes or exporting raw ledger archives.

## API / Service Requirements

### Backend Services (`decisionLedgerService.js`)
- `getDecisionLedgerEntries(facilityId, filters)`: Retrieves chronologically ordered ledger entries with optional status, category, and text search filters.
- `getLedgerEntryById(id)`: Fetches complete block metadata including cryptographic hashes, financial breakdown, and evidence citations.
- `recordLedgerOutcome(ledgerEntryId, outcomePayload, userContext)`: Ingests an adjudication outcome (remittance check, realized dollar amount, reference number), recomputes variance and status, appends a `VALUE_REALIZED` ledger event, and updates the cryptographic hash.
- `getLedgerEvents(ledgerEntryId)`: Returns the sequential audit event timeline for a specific decision block.
- `getDecisionLedgerTelemetry(facilityId)`: Computes authoritative facility KPIs (Total Realized, Realization Rate %, Net Variance, MTTR in days, Ledger Chain Integrity).
- `verifyLedgerChainIntegrity(facilityId)`: Authoritatively recomputes the SHA-256 chain from genesis block to tip and returns verification pass/fail status and block depth.
- `computeLedgerBlockHash(payload)`: Generates deterministic SHA-256 hash string for block linkage.

## UI / Workflow Requirements
- **Decision Ledger & Outcomes Workbench:**
  - **Telemetry Ribbon (5 Cards):**
    1. *Total Realized Financial Value:* Cumulative recovered revenue with target comparison.
    2. *Realization Yield Rate:* Cumulative percentage yield ($\text{Realized} / \text{Expected} \times 100\%$).
    3. *Net Variance:* Net financial surplus ($+\$) or deficit ($-\$) relative to projection.
    4. *Mean Time to Realization (MTTR):* Average days from recommendation to realized cash flow.
    5. *Cryptographic Provenance Status:* Live cryptographic verification badge ("SHA-256 Ledger Sealed").
  - **Ledger Chain Integrity Banner:** One-click "Verify Chain Integrity" button that recalculates all block hashes in real time, presenting an authoritative seal with block height and timestamp.
  - **Master Decision Table:**
    - Block Sequence & Hash Badge (e.g., `#001` with truncated SHA-256 hash and 1-click copy).
    - Recommendation Action Code & Category (e.g., `NBFA-2026-0801` - Urgent CARC 16 Appeal).
    - Expected Financial Value vs. Realized Financial Value.
    - Realization Variance (color-coded badge: Emerald for surplus/par, Amber for deficit, Slate for pending).
    - Realization Status Badge (`FULLY_REALIZED`, `OVER_REALIZED`, `PARTIALLY_REALIZED`, `PENDING_REALIZATION`).
    - Adjudication Reference (835 ERA check, PMS receipt, schedule block).
    - Time to Realization (days).
    - Action Menu: "Inspect Chain" and "Record Outcome".
  - **Interactive Modals:**
    - *Block Details & Chain Inspector Drawer:* Visualizes upstream citations (D2), approval signatures (D3), and downstream remittance reconciliation with raw cryptographic block hashes.
    - *Record Adjudication Outcome Modal:* Form allowing billing specialists to record incoming 835 ERA checks, payment amounts, and settlement remarks for pending recommendations.

## Audit / Provenance
Every entry in the decision ledger retains:
- `ledger_sequence_number`: Monotonic integer strictly ordering blocks.
- `previous_block_hash`: SHA-256 digest of preceding block $n-1$.
- `current_block_hash`: SHA-256 digest of block $n$ computed over sequence, timestamps, action details, and financial outcomes.
- `merkle_root_hash`: Hash summarizing the attached event log and signature certificates.

## QA / Test Cases
1. **Telemetry & KPI Aggregation:** Verify accurate calculation of total expected, total realized, net variance, cumulative realization rate %, and average MTTR.
2. **Facility UUID Alias Resolution:** Confirm `'00000000-0000-0000-0000-000000000002'` resolves interchangeably with `'fac-naples-01'`.
3. **Deterministic Financial Variance:** Verify exact mathematical variance and percentage yield calculations across surplus, exact, deficit, and zero-value cases.
4. **Status Machine Invariants:** Ensure proper status assignment (`FULLY_REALIZED`, `OVER_REALIZED`, `PARTIALLY_REALIZED`, `PENDING_REALIZATION`, `UNREALIZED_DEFICIT`).
5. **Cryptographic Block Hash Chaining:** Prove that block $n$ contains $H_{n-1}$ as `previous_block_hash` and that genesis block links to the 64-character zero string.
6. **Tamper-Detection Engine:** Simulate unauthorized alteration of historical financial figures and verify that `verifyLedgerChainIntegrity` flags a hash mismatch and identifies the corrupted block.
7. **Adjudication Outcome Recording:** Verify recording a new remittance updates realized value, recalculates variance, appends an event to `decision_ledger_events`, and advances block hash.
8. **PostgreSQL Migration 111:** Verify UP and DOWN migration idempotency, UUID foreign keys, constraints, and RLS policies.
9. **Zero-Purple Maestro Clinical Token Compliance:** Verify zero prohibited purple tokens (`purple`, `violet`, `indigo`, `magenta`, `fuchsia`) across all CSS and JSX files.
10. **Dual Re-export Facade Parity:** Verify `src/lib/decisionLedgerService.js` re-exports all methods and constants from `src/services/decisionLedgerService.js`.
11. **App Shell Navigation Wiring:** Verify integration in `src/App.jsx` including sidebar menu item, headers, date filter exclusion, and tab render.

## Acceptance Criteria
- Build passes (`npm run build`).
- Full test suite passes without regressions (`npm test`).
- No mock/placeholder values presented as production truth.
- Tenant isolation strictly verified.
- Cryptographic hash chaining mathematically reproducible and verifiable.

## Dependencies
- Upstream: Phase D0 (`next_best_financial_actions`), Phase D1 (`recommendation_scoring_profiles`), Phase D2 (`recommendation_evidence_items`), Phase D3 (`recommendation_approvals`).
- PostgreSQL: `pgcrypto` extension for `gen_random_uuid()`.

## Definition of Done
A feature is complete only when the schema migration, authoritative ledger service, cryptographic block chaining, outcomes reconciliation engine, decision ledger UI, and automated test suite are fully operational, tested, and verified.

## Implementation Notes
- Migration `111_decision_ledger.sql` establishes `decision_ledger_entries`, `decision_ledger_events`, and `vw_decision_ledger_telemetry` with RLS.
- Migration `111_decision_ledger_down.sql` provides clean rollback capability.
- Client service `decisionLedgerService.js` and facade `src/lib/decisionLedgerService.js` implement cryptographic block chaining and deterministic financial reconciliation.
- UI component `DecisionLedgerView.jsx` and styling `DecisionLedgerView.css` implement Maestro Clinical tokens with zero purple.
- Test suite `tests/decision-ledger.test.js` exercises all 11 test specifications.
