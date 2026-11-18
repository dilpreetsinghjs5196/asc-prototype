# C0 AI ANALYST ARCHITECTURE

## Purpose
Secure AI Analyst architecture and tool-gated data access. This specification establishes production standards for an enterprise-grade, HIPAA-compliant conversational intelligence layer within the ASCANALYST platform. It defines strict architectural boundaries ensuring the AI Analyst operates exclusively through deterministic, server-authoritative tools—guaranteeing zero direct, unconstrained database queries, zero ungrounded financial calculations, full organization/facility tenancy isolation, role-based tool gating, and cryptographic auditability of all tool executions.

## Scope
- Define production requirements for the AI Analyst Architectural Framework within Module 12 (AI & Intelligence).
- Preserve full backward compatibility with Organization & Facility Tenancy (Phase 21), RBAC Roles & Permissions (Phase 22), Row Level Security (Phase 23), Audit Logging (Phase 24), PHI Masking & Privacy (Phase 25), and all Module 11 Intelligence Services (Phases B0 through B8).
- Enforce strict tool-gated data access: Large Language Models (LLMs) and natural language agents must never formulate raw SQL or mutate state directly. All database interaction occurs via typed, validated tool contracts.
- Guarantee deterministic financial and clinical answers: When users query EBITDA, surgeon margin yields, clean claim percentages, or implant variance, answers are derived solely from validated backend services with traceable citations.
- Enforce strict multi-tenancy and PostgreSQL Row Level Security (RLS) bound to `app.current_facility_id`.
- Implement role-based access control (RBAC): Administrators, CFOs, Materials Managers, and Clinical Directors can interact with tools matching their statutory permissions. Sensitive PHI is automatically masked using HIPAA Safe Harbor 18-identifier standards.

## Current State
- **`src/components/AIAnalystModal.jsx`:** Legacy client-side simulation modal attempting to compute OR durations and costs via raw JavaScript math without backend tool gating or session persistence. Classify as **REFACTOR**.
- **`src/components/AIOperationsAnalyst.jsx`:** Thin wrapper mounting `MultiAgentConsole.jsx`. Classify as **REFACTOR**.
- **`src/components/MultiAgentConsole.jsx`:** Prototype multi-agent interface executing client-side simulation loops with partial PHI masking. Lacks schema validation, rate-limiting, and persistent tool execution ledgers. Classify as **KEEP** (for legacy workflow compatibility) while routing authoritative intelligence to the new engine.
- **`src/services/aiOperations/*` (`CPTAgent.js`, `FinancialEngine.js`, `SurgeonIntelligence.js`):** Early prototype scripts with disconnected data models that duplicate calculations implemented cleanly in Module 11. Classify as **REPLACE** with authoritative Module 11 service wrappers.
- **Dedicated Tool-Gated AI Analyst Architecture:** Persistent conversation threads, typed tool registries, parameter schemas, air-gapped prompt injection guards, and cryptographic tool audit logs are currently **MISSING** (Implemented in Phase C0).

## Target State
1. **Tool-Gated Data Access Security Boundary:**
   - The AI Analyst operates within a sandboxed runtime environment:
     - **Layer 1: Prompt Sanitization & Injection Defense:** Inbound user prompts are analyzed and scrubbed for prompt injection attacks (`ignore previous instructions`, `reveal system prompt`, `drop table`, `grant admin`). Attacks are neutralized and logged.
     - **Layer 2: Intent Classification & Tool Dispatch:** The system maps user queries to specific, registered tool contracts with typed JSON schemas.
     - **Layer 3: RBAC & Multi-Tenancy Validation:** The Tool Gateway verifies that the authenticated user possesses the statutory permission required for the tool and injects the verified `facility_id`.
     - **Layer 4: Deterministic Server Execution:** Authoritative backend services (Module 11 Services B0–B8) compute results. The AI never fabricates numbers.
     - **Layer 5: Safe Harbor Redaction & Grounded Response:** Output data is scrubbed of PHI unless the user has explicit `phi:view` clearance. Responses include traceable data citations and evidence hashes.
2. **Persistent Conversation & Audit Infrastructure:**
   - Multi-turn conversation sessions persisted in `public.ai_analyst_conversations`.
   - Complete message history, including tool invocation arguments, responses, and citations stored in `public.ai_analyst_messages`.
   - Immutable audit trail of every tool execution stored in `public.ai_tool_execution_logs`.
3. **Core Tool Registry Catalog (Phase C0 Baseline):**
   - `getSurgeonIntelligenceProfile`: Fetches 5-pillar composite scoring and outlier alerts (Phase B0).
   - `getSurgeonFinancialScorecard`: Fetches collections waterfall, margin per OR-hour, and CPT mix (Phase B1).
   - `getSurgeonImplantVariance`: Fetches implant spending delta vs peer medians and substitution savings (Phase B2).
   - `getPayerIntelligenceSummary`: Fetches payer turnaround velocity, first-pass denial rates, and AR aging (Phase B3).
   - `getPayerContractPerformance`: Fetches contracted vs actual yield, fee schedule leakage, and renewal countdowns (Phase B4).
   - `getCptEconomicsProfile`: Fetches activity-based cost decomposition and breakeven case volumes (Phase B6).
   - `getCptDenialAndPaymentMetrics`: Fetches days to pay, CARC root causes, and clean claim rates (Phase B7).
   - `getVendorCostComparison`: Fetches cross-vendor implant price spreads and contract compliance audits (Phase B8).
   - `getFacilityExecutiveKpis`: Fetches center-wide financial, volume, and operational health metrics.
4. **Clinical Maestro UI:**
   - 5-Card Operational Ribbon: Active AI Sessions, Registered Gated Tools, Total Tool Invocations, Avg Tool Latency (ms), Security Compliance Rate (100% Tool-Gated).
   - 3-Tab Operational Interface:
     1. *AI Analyst Interactive Workspace:* Conversational chat with live tool execution badges, ground citations, prompt suggestion chips, and copy/export.
     2. *Tool Registry & Capability Catalog:* Interactive documentation of all registered tools, parameters, required permissions, and sample verification payloads.
     3. *Security & Tool Execution Audit Ledger:* Real-time audit log of all tool executions with execution hashes, latency metrics, and tenant boundaries.

## Data Model / Schema
PostgreSQL migration `098_ai_analyst_architecture.sql` establishes:
1. `public.ai_analyst_conversations`:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE`
   - `user_id UUID NOT NULL`
   - `session_title VARCHAR(256) NOT NULL DEFAULT 'Executive Inquiry'`
   - `context_domain VARCHAR(64) NOT NULL DEFAULT 'EXECUTIVE_OVERVIEW'` -- 'SURGEON', 'PAYER', 'CPT_ECONOMICS', 'SUPPLY_CHAIN', 'EXECUTIVE_OVERVIEW'
   - `status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE'` -- 'ACTIVE', 'ARCHIVED', 'TERMINATED'
   - `total_messages_count INTEGER NOT NULL DEFAULT 0`
   - `total_tool_calls_count INTEGER NOT NULL DEFAULT 0`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
2. `public.ai_analyst_messages`:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `conversation_id UUID NOT NULL REFERENCES public.ai_analyst_conversations(id) ON DELETE CASCADE`
   - `facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE`
   - `sender_role VARCHAR(32) NOT NULL` -- 'USER', 'ASSISTANT', 'SYSTEM', 'TOOL'
   - `message_text TEXT NOT NULL`
   - `tool_calls_invoked JSONB` -- Array of { toolName, arguments, callId }
   - `tool_results JSONB` -- Array of { toolName, output, status, durationMs }
   - `citations JSONB` -- Array of { sourceDomain, recordId, label, metric, value }
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
3. `public.ai_tool_execution_logs`:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE`
   - `user_id UUID NOT NULL`
   - `conversation_id UUID REFERENCES public.ai_analyst_conversations(id) ON DELETE SET NULL`
   - `tool_name VARCHAR(128) NOT NULL`
   - `tool_category VARCHAR(64) NOT NULL` -- 'FINANCIAL', 'CLINICAL', 'RCM', 'SUPPLY_CHAIN', 'GOVERNANCE'
   - `parameters_payload JSONB NOT NULL DEFAULT '{}'::JSONB`
   - `execution_status VARCHAR(32) NOT NULL DEFAULT 'SUCCESS'` -- 'SUCCESS', 'PERMISSION_DENIED', 'VALIDATION_ERROR', 'TIMEOUT', 'FAILED'
   - `duration_ms INTEGER NOT NULL DEFAULT 0`
   - `records_returned INTEGER NOT NULL DEFAULT 0`
   - `error_message TEXT`
   - `execution_hash VARCHAR(64) NOT NULL` -- SHA-256 tamper-evident provenance hash
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
4. `public.vw_ai_tool_usage_summary`:
   - Aggregates tool call frequencies, average latencies, and error rates across facilities.
5. `public.vw_ai_security_audit_radar`:
   - Identifies unauthorized tool attempts, security parameter rejections, and abnormal usage spikes.
6. Multi-Tenant RLS policies enforcing `facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID`.

## Business Rules
1. **Zero Unconstrained Data Access:** Under no circumstance may the AI Analyst execute arbitrary SQL strings or read database tables outside registered tools.
2. **Deterministic Output Guarantee:** All quantitative financial, billing, or clinical figures presented by the AI must trace to a verified tool response. The AI must never calculate arithmetic in prompt tokens.
3. **Prompt Injection Containment:** If a user prompt contains systemic manipulation keywords (`ignore previous`, `system override`, `sudo`, `bypass rls`), the system immediately short-circuits, logs a security warning, and issues a standardized clinical compliance response.
4. **Mandatory Tenant Propagation:** Every tool execution implicitly derives `facility_id` from the verified session context, preventing multi-tenant data leakage.
5. **Safe Harbor Redaction:** If a tool returns patient identifiers (name, MRN, date of birth, phone), and the active user session lacks `phi:view` permission, the service automatically redacts identifiers according to HIPAA Safe Harbor standards.
6. **Execution Budget & Timeouts:** Tool invocations have a strict execution timeout of $10,000\text{ms}$. If a query exceeds this budget, it aborts cleanly with a `TIMEOUT` status.

## Permissions / Security
- `ai:chat`: Basic permission to converse with the AI Analyst and access general operational summaries.
- `ai:execute_tool`: Permission to trigger data retrieval tools for operational and financial analysis.
- `ai:view_phi`: Clear identity to receive unmasked patient health information in clinical tool outputs.
- `ai:admin`: Configure tool registry parameters, inspect security audit logs, and manage rate limits.
- RLS Policy: All three tables (`ai_analyst_conversations`, `ai_analyst_messages`, `ai_tool_execution_logs`) enforce PostgreSQL RLS using `facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID`.

## API / Service Requirements
- Service module: `src/services/aiAnalystService.js`
- Exported functions:
  - `registerTool(toolDefinition)`
  - `getRegisteredTools()`
  - `sanitizePromptInput(userInput)`
  - `validateToolParameters(toolName, params)`
  - `hasToolPermission(userRole, toolName)`
  - `executeToolCall(toolName, params, sessionContext)`
  - `processAnalystQuery(query, conversationHistory, sessionContext)`
  - `calculateAiAnalystKpis(conversations, executionLogs)`
- Facade export wrapper: `src/lib/aiAnalystService.js`.

## UI / Workflow Requirements
- **Top 5-Card Metric Ribbon:**
  1. *Active AI Sessions:* Number of tracked conversational sessions.
  2. *Registered Gated Tools:* Count of verified, tool-gated analytical contracts.
  3. *Total Tool Invocations:* Cumulative tool executions with success rate percentage.
  4. *Avg Tool Latency:* Mean execution turnaround time in milliseconds (benchmark $\le 150\text{ms}$).
  5. *Security Compliance:* 100% Tool-Gated assurance with zero uncontained queries.
- **Three Core Interactive Tabs:**
  1. *Tab 1: AI Analyst Interactive Workspace:* Natural language inquiry interface with suggested clinical prompt pills, real-time tool execution badges, formatted markdown responses, grounded data citation pills, and conversation export.
  2. *Tab 2: Tool Registry & Capability Catalog:* Interactive documentation of all tools, including required RBAC roles, input parameter schemas, and test execution runner.
  3. *Tab 3: Security & Tool Execution Audit Ledger:* Live table of all tool invocations with cryptographic hashes, latency, caller identity, and validation status.
- **Design System Standards:**
  - Scoped CSS prefix: `aian-`
  - Responsive ribbon grid: `repeat(auto-fit, minmax(190px, 1fr))` on `< 1300px`, `repeat(5, minmax(0, 1fr))` on `≥ 1300px`.
  - Zero-Purple strict clinical palette (Emerald, Sky Blue, Amber, Crimson, Slate).

## Audit / Provenance
- Every tool execution generates a SHA-256 cryptographic provenance hash:
  $$\text{Hash} = \operatorname{SHA-256}(\text{FacilityId} + \text{UserId} + \text{ToolName} + \text{ParamsHash} + \text{Timestamp})$$
- All tool logs are immutable and permanent; records cannot be modified or deleted.

## QA / Test Cases
- Tool registration & schema validation tests.
- Prompt injection detection & sanitization tests.
- Multi-tenant facility isolation tests.
- RBAC tool permission gating tests.
- Deterministic tool execution & citation grounding tests.
- Migration SQL DDL, indexes, views, and RLS policy verification.
- Static analysis verifying zero purple/violet/indigo color tokens.
- App.jsx wiring & lib wrapper re-export verification.

## Acceptance Criteria
- [x] All 14 specification sections defined.
- [x] Database migrations `098_ai_analyst_architecture.sql` and `098_ai_analyst_architecture_down.sql` created.
- [x] Backend service `src/services/aiAnalystService.js` and lib wrapper created.
- [x] Clinical UI component `src/components/AIAnalystView.jsx` and scoped CSS created.
- [x] App shell navigation and tab mounting configured in `src/App.jsx`.
- [x] Comprehensive test suite `tests/ai-analyst-architecture.test.js` passing.
- [x] All Module 11 & Module 12 test suites passing together.
- [x] Clean `npm run build` with zero errors.

## Dependencies
- Upstream: Phase 21 (Tenancy), Phase 22 (RBAC), Phase 23 (RLS), Phase 25 (PHI Masking), Phase B0–B8 (Module 11 Intelligence Services).
- Downstream: Phase C1 (AI Tool Gateway), Phase C2 (AI Permissions), Phase C3 (AI Tool Definitions), Phase C4 (AI Evidence & Citations).

## Definition of Done
The phase is considered complete when the migration scripts, deterministic tool-gated service layer, interactive clinical UI component, scoped styles, app shell routing, and test suites are committed and verified with zero build regressions.

## Implementation Notes
- Migration `098_ai_analyst_architecture.sql` establishes 3 tables, 2 analytical views, and RLS policies.
- Migration `098_ai_analyst_architecture_down.sql` provides clean rollback.
- Service `aiAnalystService.js` wraps all B0–B8 services as typed, gated tools with Safe Harbor redaction.
- UI component adheres strictly to Maestro Clinical Design System with zero purple tokens.
