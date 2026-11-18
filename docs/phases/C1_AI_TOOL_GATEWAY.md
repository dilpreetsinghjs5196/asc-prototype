# C1 AI TOOL GATEWAY

## Purpose
The **AI Tool Gateway** is the authoritative, secure mediation tier between natural language conversational models / AI agents and ASCANALYST's underlying transactional, clinical, operational, and financial databases. It provides deterministic tool routing, parameter validation against strict JSON schemas, multi-tenant RBAC authorization, Safe Harbor PHI redaction, token-efficient result shaping, circuit breakers, sliding-window rate limiting, and tamper-evident cryptographic execution logging (SHA-256 provenance chain).

---

## Scope
- **Production Requirements**:
  - Implement a centralized, typed Tool Gateway Router that dispatches requests to deterministic server-authoritative service endpoints.
  - Zero-trust execution: LLMs and AI agents **never** execute raw SQL or direct arbitrary DB mutations; all data interactions must resolve through registered, parameter-validated tool contracts.
  - Result shaping: Enforce payload size limits, token optimization (reducing verbose array representations), field projection, and Safe Harbor 18-identifier PHI masking before returning responses to the LLM context.
  - Multi-tenant facility isolation: Verify tenant context (`organization_id`, `facility_id`) and enforce strict row-level security (RLS).
  - RBAC authorization matrix: Enforce tool-level permissions mapped to canonical ASC roles (`clinical_director`, `billing_manager`, `facility_admin`, `surgeon`, `coder`, `biller`, `analyst`).
  - Rate limiting & circuit breaking: Protect upstream database services against runaway agent loops (sliding 1-minute window per user and facility; circuit breaker automatically opens if downstream services trip consecutive error thresholds).
  - Auditing & provenance: Record every tool invocation in `ai_tool_executions` with execution duration, input parameter hashes, redacted output summaries, and cryptographic SHA-256 signatures.

---

## Current State
| Component | Classification | Current State Description | Action Required |
| :--- | :--- | :--- | :--- |
| `src/services/aiAnalystService.js` | **REFACTOR** | Contains basic inline `TOOL_REGISTRY` and rudimentary execution handler without formal JSON schemas, circuit breaking, or result shaping. | Extract and expand into dedicated `aiToolGatewayService.js` with formal parameter schemas, result shaping, and circuit breaker. |
| Supabase `ai_conversations` & `ai_audit_logs` (098) | **KEEP** | Tables created in Phase C0 for conversational persistence and high-level query logs. | Retain as parent conversational entities; link tool execution ledger. |
| Tool Router & Schema Validator | **MISSING** | No dedicated schema validator checking input types, bounds, string patterns, or mandatory parameters before invocation. | Implement typed validation engine rejecting malformed payloads before execution. |
| Result Shaping & Token Compressor | **MISSING** | Raw data structures returned to AI without token-efficient compression, field projection, or Safe Harbor masking. | Implement `shapeToolResult()` with field whitelist projection, pagination clamps, and de-identification. |
| Rate Limiter & Circuit Breaker | **MISSING** | No protection against rapid-fire agent tool loops or cascading backend service failures. | Implement sliding-window rate limiter (60 RPM/facility) and 5-failure threshold circuit breaker. |
| Dedicated Tool Gateway UI / Telemetry | **MISSING** | No centralized administrative view showing tool contract registry, execution ledger, latency telemetry, and circuit breaker states. | Implement `AIToolGatewayView.jsx` with real-time audit ledger, tool registry matrix, and breaker status. |

---

## Target State
1. **Tool Gateway Router**:
   - Central registry of typed tool contracts (`ai_tool_definitions`) covering Clinical, Financial, Supply Chain, RCM, and Governance domains.
   - Dynamic parameter validation using JSON Schema definitions. Invalid payloads fail fast with `VALIDATION_ERROR` (zero backend invocation).
2. **Result Shaping & Safe Harbor Masking**:
   - Shapes returned datasets into compact representations (filtering internal metadata, stripping unused timestamps).
   - Automatically redacts Safe Harbor 18 HIPAA identifiers (names, SSNs, phone numbers, email addresses, exact dates beyond year where required).
   - Enforces configurable result caps (maximum 50 rows / 4KB payload per tool call) to prevent context window blowout.
3. **Tenancy & RBAC Authorization**:
   - Every tool call requires a validated `sessionContext` containing `facilityId`, `userId`, and `role`.
   - Tool permissions strictly mapped to canonical roles: administrative actions require `facility_admin`; financial leaks require `billing_manager` or `facility_admin`; clinical metrics require `clinical_director` or `surgeon`.
4. **Resilience & Governance**:
   - Sliding-window rate limiter: Enforces 60 requests per minute per facility.
   - Circuit breaker: Automatically transitions to `OPEN` state if 5 consecutive tool failures occur within 60 seconds; requests fail immediately with `CIRCUIT_OPEN` until a 30-second half-open cooldown elapses.
5. **Cryptographic Provenance**:
   - Every execution produces a deterministic SHA-256 execution hash:
     $$\text{Provenance Hash} = \text{SHA256}(\text{facilityId} \parallel \text{userId} \parallel \text{toolName} \parallel \text{JSON}(\text{params}) \parallel \text{status} \parallel \text{timestamp})$$

---

## Data Model / Schema
PostgreSQL Migration: `099_ai_tool_gateway.sql`

```sql
-- 1. AI Tool Definitions & Contracts Registry
CREATE TABLE IF NOT EXISTS public.ai_tool_definitions (
  id VARCHAR(64) PRIMARY KEY, -- e.g. 'cpt_economics_activity_based_margins'
  domain VARCHAR(32) NOT NULL, -- 'CLINICAL', 'FINANCIAL', 'RCM', 'SUPPLY_CHAIN', 'GOVERNANCE'
  name VARCHAR(128) NOT NULL,
  description TEXT NOT NULL,
  parameter_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  required_role VARCHAR(32) NOT NULL DEFAULT 'analyst',
  rate_limit_rpm INTEGER NOT NULL DEFAULT 60,
  max_result_rows INTEGER NOT NULL DEFAULT 50,
  is_active BOOLEAN NOT NULL DEFAULT true,
  version VARCHAR(16) NOT NULL DEFAULT '1.0.0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. AI Tool Execution Ledger (Provenance & Audit)
CREATE TABLE IF NOT EXISTS public.ai_tool_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL,
  user_role VARCHAR(32) NOT NULL,
  tool_id VARCHAR(64) NOT NULL REFERENCES public.ai_tool_definitions(id) ON DELETE CASCADE,
  parameters_hash VARCHAR(64) NOT NULL,
  parameters_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_summary JSONB,
  records_returned INTEGER NOT NULL DEFAULT 0,
  execution_status VARCHAR(32) NOT NULL, -- 'SUCCESS', 'PERMISSION_DENIED', 'VALIDATION_ERROR', 'CIRCUIT_OPEN', 'RATE_LIMITED', 'FAILED'
  error_message TEXT,
  latency_ms NUMERIC(10, 2) NOT NULL DEFAULT 0.0,
  provenance_hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. AI Tool Circuit Breaker State
CREATE TABLE IF NOT EXISTS public.ai_tool_circuit_breakers (
  tool_id VARCHAR(64) PRIMARY KEY REFERENCES public.ai_tool_definitions(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  state VARCHAR(16) NOT NULL DEFAULT 'CLOSED', -- 'CLOSED', 'OPEN', 'HALF_OPEN'
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_failure_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  half_open_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Indexes for Tenancy, High Throughput, and Auditing
CREATE INDEX IF NOT EXISTS idx_ai_tool_executions_facility ON public.ai_tool_executions(facility_id);
CREATE INDEX IF NOT EXISTS idx_ai_tool_executions_tool ON public.ai_tool_executions(tool_id);
CREATE INDEX IF NOT EXISTS idx_ai_tool_executions_status ON public.ai_tool_executions(execution_status);
CREATE INDEX IF NOT EXISTS idx_ai_tool_executions_created ON public.ai_tool_executions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_tool_circuit_facility ON public.ai_tool_circuit_breakers(facility_id, state);

-- 5. Row-Level Security
ALTER TABLE public.ai_tool_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_tool_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_tool_circuit_breakers ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_ai_tool_definitions_read ON public.ai_tool_definitions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY p_ai_tool_executions_tenant ON public.ai_tool_executions
  FOR ALL TO authenticated
  USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
  WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

CREATE POLICY p_ai_tool_circuit_tenant ON public.ai_tool_circuit_breakers
  FOR ALL TO authenticated
  USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
  WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);
```

---

## Business Rules
1. **Zero-Trust Input Validation**:
   - All input parameters are validated against JSON schema definitions before execution.
   - Disallowed extra parameters are rejected (`additionalProperties: false`).
   - String inputs are trimmed, sanitized, and scanned for control characters and malicious keywords.
2. **Safe Harbor Result Shaping**:
   - Strip all 18 HIPAA Safe Harbor identifiers from data payloads returned to AI callers.
   - Truncate large lists to `max_result_rows` (default 50) and append pagination metadata (`hasMore: true`, `totalCount: N`).
   - Project only the fields explicitly whitelisted in the tool contract definition.
3. **Circuit Breaker Protocol**:
   - `CLOSED`: Normal operation. Failures increment `consecutive_failures`.
   - `OPEN`: Triggered when `consecutive_failures >= 5`. All tool calls immediately fail with status `CIRCUIT_OPEN` and HTTP 503 equivalent.
   - `HALF_OPEN`: Entered after 30 seconds of quiet time. A single trial request is permitted. If successful, state reverts to `CLOSED` (`failures = 0`); if failed, state reverts to `OPEN` for another 60 seconds.
4. **Sliding-Window Facility Rate Limiting**:
   - Each facility is allocated 60 requests per rolling 60-second window across all tools.
   - Exceeded rate triggers `RATE_LIMITED` status and provides `retryAfterSeconds` metadata.
5. **Cryptographic Provenance**:
   - Provenance hash must be verifiable independently without requiring database state:
     $$\text{Provenance Hash} = \text{SHA256}(\text{facilityId} \parallel \text{userId} \parallel \text{toolId} \parallel \text{parametersHash} \parallel \text{recordsReturned} \parallel \text{latencyMs})$$

---

## Permissions / Security
| Role | Allowed Tool Domains | Sensitive Actions | Permissions Required |
| :--- | :--- | :--- | :--- |
| `super_admin` / `facility_admin` | All (Clinical, Financial, RCM, Supply Chain, Governance) | Circuit breaker reset, rate limit overrides, full audit logs | `ai:admin`, `tool:execute`, `tool:inspect` |
| `clinical_director` | Clinical, Financial, Supply Chain | Surgeon intelligence, construct variance, procedural margins | `tool:execute`, `ai:view_clinical` |
| `billing_manager` | Financial, RCM, Clinical (Read-only) | Contract performance, denial CARC breakdown, fee schedule audits | `tool:execute`, `ai:view_financial` |
| `surgeon` | Clinical (Own cases + De-identified specialty medians) | Surgeon scorecard, preference card comparison | `tool:execute` |
| `biller` / `coder` | RCM, CPT Intelligence | Denial codes, claim scrub review, code crosswalks | `tool:execute` |
| `analyst` / `viewer` | Governance, High-level facility KPIs | Executive KPI briefing, benchmark comparisons | `tool:execute` (Public tools only) |
| `guest` / `anonymous` | None | Denied all tool invocations | None |

---

## API / Service Requirements
The dedicated gateway service is implemented in `src/services/aiToolGatewayService.js` and re-exported via `src/lib/aiToolGatewayService.js`.

### Core Contracts & Methods:
1. `validateToolParameters(toolId, params)`:
   - Evaluates input payload against tool's JSON Schema.
   - Returns `{ isValid: boolean, errors: string[], sanitizedParams: object }`.
2. `checkToolAuthorization(toolId, sessionContext)`:
   - Validates role permissions, facility tenant binding, and rate limiting status.
   - Returns `{ authorized: boolean, reason: string | null }`.
3. `checkCircuitBreaker(toolId, facilityId)`:
   - Evaluates breaker state (`CLOSED`, `OPEN`, `HALF_OPEN`).
   - Returns `{ isAllowed: boolean, state: string, retryAfterMs?: number }`.
4. `shapeToolResult(toolId, rawResult)`:
   - Clamps record count to `maxResultRows`.
   - Filters fields against projection whitelist.
   - Strips PHI and injects token-saving structural compaction.
5. `dispatchToolCall(toolId, params, sessionContext)`:
   - Master orchestrator: validates input -> checks auth -> checks breaker -> executes deterministic backend service -> shapes output -> records audit log with cryptographic hash.
   - Returns:
     ```typescript
     interface ToolGatewayResponse {
       toolId: string;
       status: 'SUCCESS' | 'PERMISSION_DENIED' | 'VALIDATION_ERROR' | 'CIRCUIT_OPEN' | 'RATE_LIMITED' | 'FAILED';
       data: any;
       recordsReturned: number;
       latencyMs: number;
       provenanceHash: string;
       circuitState: string;
       errorMessage?: string;
     }
     ```
6. `getGatewayTelemetry(facilityId)`:
   - Returns facility-wide gateway KPIs: total executions, success rate, avg latency, active circuit breakers, and rate limit utilization.

---

## UI / Workflow Requirements
The UI is provided in `src/components/AIToolGatewayView.jsx` and scoped styles in `src/components/AIToolGatewayView.css`.

### Visual Structure:
1. **Top 5-Card Executive Metric Ribbon**:
   - **Total Registered Tools**: Active contracts across all domains (`12 Active Tools`).
   - **24-Hour Invocations**: Total tool calls executed (`3,412 Calls`).
   - **Gateway Success Rate**: Authorization & execution reliability (`99.4% Success`).
   - **Avg Gateway Latency**: End-to-end execution speed (`11.8 ms`).
   - **Circuit Breaker Status**: Active protection health (`Operational / 0 Trips`).
2. **Interactive Tabbed Console**:
   - **Tab 1: Tool Registry & Contract Matrix**: Interactive table listing all registered tool contracts, parameter schemas, categories, minimum required roles, and invocation rate limits. Includes modal parameter schema inspector.
   - **Tab 2: Live Execution Ledger & Audit**: Real-time chronological audit trail of tool invocations showing timestamp, facility, user role, tool contract, latency badge, status pill, parameters payload preview, and cryptographic SHA-256 provenance hash verification.
   - **Tab 3: Circuit Breakers & Resilience Health**: Real-time status cards for each tool contract displaying failure counts, breaker state (`CLOSED`, `OPEN`, `HALF_OPEN`), rate limit sliding window gauges, and manual "Trip/Reset Breaker" diagnostic actions for administrators.
3. **Maestro Clinical Design System**:
   - Strictly zero purple/violet/indigo/magenta/fuchsia tokens.
   - Authoritative palette: Emerald (`#059669`), Amber (`#d97706`), Crimson (`#dc2626`), Blue (`#0284c7`), Slate (`#64748b`), Neutral white/slate backgrounds.
   - Responsive flexbox container with `min-width: 0;` and `@media (max-width: 1280px)` fluid card wrapping.

---

## Audit / Provenance
1. **Deterministic Execution Record**:
   - Every invocation generates an unmodifiable audit row in `ai_tool_executions`.
   - Before/after states, parameters payload, execution duration, and caller identity are permanently captured.
2. **Cryptographic Hash Chain**:
   - SHA-256 provenance signature links tool definition, parameter hash, and result metadata:
     $$\text{Hash} = \text{SHA256}(\text{facilityId} + ":" + \text{toolId} + ":" + \text{parametersHash} + ":" + \text{status} + ":" + \text{timestamp})$$
3. **Diagnostic Logging**:
   - Filter logs by `facility_id`, `tool_id`, `execution_status`, or date range.
   - Verification utility confirms provenance hash integrity on demand.

---

## QA / Test Cases
`tests/ai-tool-gateway.test.js` covers 8 test suites and 22 verification criteria:
1. **JSON Schema Parameter Validation**:
   - Validates correct types, required parameters, and regex patterns.
   - Rejects unpermitted extra parameters and invalid data types with `VALIDATION_ERROR`.
2. **RBAC Permission Gating**:
   - Authorizes `facility_admin` and `clinical_director` on privileged tools.
   - Rejects unauthorized roles (e.g. `viewer` on financial leakage tool) with `PERMISSION_DENIED`.
   - Denies unauthenticated or guest users.
3. **Result Shaping & Safe Harbor Masking**:
   - Clamps record counts to `maxResultRows`.
   - Masks SSNs, phone numbers, and emails.
   - Strips un-projected internal database columns.
4. **Resilience & Circuit Breaker Engine**:
   - Increments failure counter upon downstream exceptions.
   - Trips breaker to `OPEN` after 5 consecutive failures.
   - Blocks subsequent calls with `CIRCUIT_OPEN`.
   - Allows trial requests during `HALF_OPEN` state.
5. **Sliding-Window Rate Limiter**:
   - Throttles requests exceeding 60 RPM per facility with `RATE_LIMITED`.
6. **Cryptographic Provenance Verification**:
   - Generates deterministic 64-character SHA-256 hashes.
   - Validates that identical inputs yield identical signatures.
7. **Zero-Purple Design Compliance**:
   - Scans `AIToolGatewayView.jsx` and `AIToolGatewayView.css` to guarantee zero prohibited purple tokens.
8. **App Wiring & Lib Facade**:
   - Verifies `src/lib/aiToolGatewayService.js` re-exports all constants and functions.
   - Confirms navigation and tab registration in `src/App.jsx`.

---

## Acceptance Criteria
- [x] Build passes (`npm run build` with zero errors).
- [x] Lint passes with zero errors.
- [x] 100% of automated QA tests pass via `node --test`.
- [x] No mock or placeholder data is presented as production truth; all tools bind to authoritative service calculations.
- [x] Multi-tenant isolation verified with PostgreSQL RLS policies in migration 099.
- [x] Provenance hashes are cryptographically reproducible.
- [x] Strict zero-purple compliance verified across code and stylesheet.

---

## Dependencies
- Upstream Modules:
  - Phase B0 – B8 (Module 11 Intelligence Services: Surgeon, Payer, CPT, Vendor Cost).
  - Phase C0 (AI Analyst Architecture & Database Migration 098).
  - PostgreSQL Facilities Tenancy Master & RBAC Service (`src/lib/rbacService.js`).

---

## Definition of Done
The AI Tool Gateway feature is complete when the PostgreSQL migration is authored with clean rollback, the typed gateway engine handles validation, RBAC, circuit breaking, and result shaping, the UI dashboard console renders real-time audit and contract data without clipping or purple tokens, and the automated test suite passes with 100% green status.

---

## Implementation Notes
- **Specification**: [docs/phases/C1_AI_TOOL_GATEWAY.md](file:///e:/medicalAI/asc-prototype/docs/phases/C1_AI_TOOL_GATEWAY.md)
- **Database Migrations**:
  - [supabase/migrations/099_ai_tool_gateway.sql](file:///e:/medicalAI/asc-prototype/supabase/migrations/099_ai_tool_gateway.sql) (UP)
  - [supabase/migrations/099_ai_tool_gateway_down.sql](file:///e:/medicalAI/asc-prototype/supabase/migrations/099_ai_tool_gateway_down.sql) (DOWN)
- **Service Layer**:
  - [src/services/aiToolGatewayService.js](file:///e:/medicalAI/asc-prototype/src/services/aiToolGatewayService.js)
  - [src/lib/aiToolGatewayService.js](file:///e:/medicalAI/asc-prototype/src/lib/aiToolGatewayService.js)
- **UI Components**:
  - [src/components/AIToolGatewayView.jsx](file:///e:/medicalAI/asc-prototype/src/components/AIToolGatewayView.jsx)
  - [src/components/AIToolGatewayView.css](file:///e:/medicalAI/asc-prototype/src/components/AIToolGatewayView.css)
- **App Shell Integration**: [src/App.jsx](file:///e:/medicalAI/asc-prototype/src/App.jsx)
- **Test Suite**: [tests/ai-tool-gateway.test.js](file:///e:/medicalAI/asc-prototype/tests/ai-tool-gateway.test.js)
