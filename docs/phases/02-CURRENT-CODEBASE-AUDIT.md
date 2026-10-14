# 02 CURRENT CODEBASE AUDIT — ASCANALYST PLATFORM

---

## 1. Purpose

The purpose of this audit is to provide an exhaustive, file-by-file and subsystem-by-subsystem assessment of the existing `asc-prototype` codebase. Every source file, database table, calculation routine, and architectural layer is categorized into one of four deterministic implementation paths:
- **KEEP**: Production-ready or near production-ready components that adhere to architectural standards and require only minor configuration or tenancy adaptation.
- **REFACTOR**: Valuable UI screens, services, or data structures that contain architectural debt, client-side financial computations, or unvalidated state that must be restructured for multi-tenancy and server authoritativeness.
- **REPLACE**: Subsystems with critical security vulnerabilities, plain-text credentials, unhedged client-side API keys, or wide-open database access policies that must be decommissioned and replaced.
- **MISSING**: Essential enterprise capabilities (such as multi-tenancy tables, immutable audit logging, CMS MPPR stored procedures, and payer contract fee schedules) that must be introduced from scratch.

---

## 2. Scope & Guiding Principles

### 2.1 Production Requirements
- **Complete Inventory**: Every file in `src/` (components, agents, services, utils, lib) and database definitions in `schema_setup.sql` must be accounted for.
- **Elimination of Mock Truth**: Decommission all hardcoded mock arrays (`MOCK_SURGEONS_DETAILS`, `MOCK_OR_UTIL_TREND`, `MOCK_CASE_LOGS`, etc.) currently embedded across views.
- **Tenancy Scoping**: No file or query may execute without tenant scoping (`organization_id`, `facility_id`).
- **Separation of Concerns**: UI components handle presentation and user input; deterministic calculations, authorization, and audit logs are strictly server-authoritative.

---

## 3. Current State Codebase Audit (Classification Matrix)

### 3.1 Core Application & Presentation Shell
| File / Path | Lines | Current Implementation | Classification | Action Plan & Rationale |
| :--- | :---: | :--- | :---: | :--- |
| `src/App.jsx` | 5,913 | Monolithic application shell containing sidebar navigation, header account menu, massive hardcoded mock data dictionaries (`MOCK_SURGEONS_DETAILS`, `MOCK_CASE_LOGS`), inline subview implementations, and tab routing. | **REFACTOR** | **Critical Refactor:** Strip out all 3,000+ lines of hardcoded mock data and inline tab definitions. Convert into a lightweight, modular router layout shell that renders lazy-loaded component routes. |
| `src/main.jsx` | 20 | Vite entry point mounting `App` into `#root` with `React.StrictMode`. | **KEEP** | Clean and production-standard. Retain as-is. |
| `src/App.css` | 134 | Global application reset styles, sidebar dimensions, and layout utility classes. | **KEEP** | Retain core flexbox and grid layouts. |
| `src/index.css` | 1,048 | Design system token library (colors, CSS variables, navy blue theme tokens, SweetAlert2 styling, custom scrollbars). | **KEEP / REFACTOR** | Standardize CSS variable naming across components and eliminate conflicting inline styles. |

### 3.2 UI Components (`src/components/`)
| Component | Lines | Current Implementation | Classification | Action Plan & Rationale |
| :--- | :---: | :--- | :---: | :--- |
| `CommandCenter.jsx` | 468 | Executive dashboard displaying facility KPIs, utilization trends, case profitability tiers, and payer mix charts. Calculations performed via client-side JavaScript array iterations. | **REFACTOR** | Retain the high-contrast navy UI and Recharts visualizations. Replace client-side array reductions with server-aggregated database view (`facility_kpi_summary`). Add facility tenancy filter. |
| `SurgeryScheduler.jsx` | 2,752 | Master surgery scheduler featuring calendar timeline, booking modal, Pre-Op/Post-Op notes editor, PDF download, and staff assignment. Contains client-side room/labor/supplies math and SweetAlert popups. | **REFACTOR** | Retain scheduling workflow, notes editor, and jsPDF export. Extract all financial arithmetic, conflict checks, and staff fee calculation to server-side stored procedure (`calculate_surgery_financials`). Bind to facility tenancy. |
| `CaseLogScheduler.jsx` | 642 | 15-day scheduling horizon view for case logs, surgical procedure status tracking, and room assignment. | **REFACTOR** | Retain calendar layout. Add automated double-booking validation, lock completed encounters from unauthorized edits, and scope to `facility_id`. |
| `ORBlockSchedule.jsx` | 382 | Visual block scheduling manager supporting recurring weekly/monthly blocks and single-date surgeon reservations. | **REFACTOR** | Retain block management UI. Add database constraint preventing overlapping block reservations and implement an auto-release rule for unused blocks. |
| `SurgeonPortal.jsx` | 682 | Surgeon self-service portal displaying scorecard, CPT margin contribution, personal schedule, and patient case list. | **REFACTOR** | Preserve scorecard design and charts. Enforce strict record-level security so surgeons can only access their authorized cases. Remove simulated mock fallback surgeon data. |
| `CPTManagement.jsx` | 988 | Full CRUD interface for master CPT codes, category filtering, search bar, and client-side pagination. | **REFACTOR** | Retain table layout and edit modals. Enhance data model to support CMS RVU values, modifier indicators, effective dates, and multi-payer fee schedules. |
| `CPTUpload.jsx` | 215 | Excel/CSV file dropzone for bulk importing CPT codes with column mapping and database insertion. | **KEEP / REFACTOR** | Retain drag-and-drop UI and SheetJS parser. Add server-side batch schema validation, duplicate detection, and atomic transaction rollback on failure. |
| `OTCostManagement.jsx` | 742 | Overrides for CPT-specific supply, implant, labor, and room expenses with inline editing and search. | **REFACTOR** | Restructure from flat cost overrides into a formal Cost Accounting model with facility-specific baseline preference cards. |
| `StaffManagement.jsx` | 453 | Clinical staff registry, hourly wage tracking, department/role assignment, and license verification. | **KEEP / REFACTOR** | Retain UI table and modal forms. Add facility tenancy, active status filtering, and credential expiration alerts. |
| `LoginPage.jsx` | 261 | Split-screen login interface with role switching (Admin vs Surgeon) and credentials inputs. | **REFACTOR** | Retain visual branding. Connect authentication to Supabase Auth (`supabase.auth.signInWithPassword`) instead of plaintext database queries. Remove hardcoded test credentials. |
| `UserProfile.jsx` | 425 | Dedicated user profile page displaying credentials, license, contact details, and edit password form. | **REFACTOR** | Retain UI design. Wire updates to Supabase Auth profile and identity management API rather than direct table updates. |
| `Settings.jsx` | 717 | Facility profile form, MPPR checkbox toggle, theme selector, and full SQL database backup export. | **REFACTOR** | Expand from single-facility settings into Multi-Facility Organization Management. Convert SQL dump into a secure, tenant-scoped export. |
| `Chatbot.jsx` | 895 | Interactive conversational assistant with text query handling and real-time WebRTC live voice integration. | **REFACTOR** | Retain modern chat and audio waveform UI. Route LLM inference through backend Supabase Edge Functions with tenant-sanitized aggregation context. |
| `InstructionPanel.jsx` | 284 | Helper instruction drawer offering suggested prompts and query templates for the AI chatbot. | **KEEP** | Clean UI drawer. Update suggested prompts to align with multi-tenant financial reporting. |
| `AIOperationsAnalyst.jsx` & `AIAnalystModal.jsx` | 680 | Actionable AI recommendations modal detailing margin leakage, supply overruns, and scheduling gaps. | **REFACTOR** | Retain UI modal presentation. Replace client-side prompt generation with background scheduled analytical workers and server-side generated recommendations. |
| `BusinessAnalysis.jsx` | 238 | Secondary business analysis tab presenting high-level margin metrics. | **REFACTOR** | Consolidate duplicate reporting logic into `CommandCenter.jsx` to prevent fragmented data paths. |
| `MultiAgentConsole.jsx` & `CPTAgentTestRunner.jsx` | 750 | Visual multi-agent pipeline simulation console and CPT agent testing runner. | **REFACTOR** | Preserve as an internal diagnostic / developer workbench. Restrict route access to `super_admin` only. |

### 3.3 Backend Services, Libraries & Utils
| File / Path | Lines | Current Implementation | Classification | Action Plan & Rationale |
| :--- | :---: | :--- | :---: | :--- |
| `src/lib/supabase.js` | 758 | Supabase JS client instantiation and massive `db` helper object. Implements custom authentication (`loginWithCredentials`, `saveSession`, `getSession`) using plaintext password queries against `users` and `surgeons`. | **REPLACE** | **Critical Security Vulnerability:** Decommission custom plaintext authentication entirely. Replace with Supabase Auth SDK (`supabase.auth.*`), HTTP-only session cookies, JWT metadata claims, and typed API service modules. |
| `src/lib/gemini.js` | 240 | Direct browser-side calls to `@google/generative-ai` with API keys read from `import.meta.env` or local settings. | **REPLACE** | **Critical Security Risk:** Remove client-side LLM calls that expose API keys or unmasked clinical data. Replace with secure Supabase Edge Function (`/functions/v1/ai-analyst`). |
| `src/lib/geminiLive.js` | 420 | WebRTC / WebSocket live audio streaming client connecting browser microphone to Gemini Multimodal Live API. | **REFACTOR** | Move WebSocket authentication and ephemeral session token generation to a secure backend edge function; keep frontend audio worklet player. |
| `src/utils/hospitalUtils.js` | 367 | Pure utility functions (`normalizeDate`, `formatSurgeonName`) mixed with client-side financial routines (`calculateORCost`, `calculateMedicareRevenue`). | **REFACTOR** | Retain pure date and string formatting helpers. Decommission client-side `calculateORCost` and `calculateMedicareRevenue` in favor of authoritative PostgreSQL database functions. |
| `src/utils/databaseBackup.js` | 290 | Client-side script generating full PostgreSQL INSERT scripts by fetching all rows from every table. | **REFACTOR** | Move backup generation to a secure server-side RPC restricted to `super_admin`, strictly scoped to the user's authorized facility. |
| `src/utils/excelParser.js` | 185 | SheetJS wrapper parsing Excel spreadsheets into structured JSON arrays for CPT uploads. | **KEEP** | Clean and effective parsing utility. Retain as-is. |

### 3.4 Multi-Agent Pipeline (`src/agents/` & `src/services/`)
| File / Path | Lines | Current Implementation | Classification | Action Plan & Rationale |
| :--- | :---: | :--- | :---: | :--- |
| `src/agents/AgentOrchestrator.js` | 145 | Client-side orchestrator coordinating pipeline tasks across subagents with dependency resolution. | **REFACTOR** | Migrate pipeline orchestration from client-side JavaScript into server-side background workers or database trigger queues. |
| `src/agents/AgentContext.js` | 65 | In-memory shared state container passing intermediate JSON results between agents. | **REFACTOR** | Replace in-memory object with an auditable database table (`agent_execution_logs`) to track intermediate reasoning steps. |
| `src/agents/AgentRegistry.js` | 55 | Static registry mapping agent strings to execution handlers. | **KEEP / REFACTOR** | Retain mapping; update execution targets to server-side edge handlers. |
| `src/agents/cost/CostAgent.js` | 36 | Executes cost calculations using hardcoded formulas ($15/min labor, $150 cleaning). | **REFACTOR** | Replace hardcoded constants with facility-specific cost configurations and actual staff wage rates from `staff` table. |
| `src/agents/billing/BillingAgent.js` | 22 | Computes reimbursement totals from task input. | **REFACTOR** | Align with deterministic CMS MPPR fee schedule rules. |
| `src/agents/CPTAgent.js` | 165 | CPT code matching and price resolution agent. | **REFACTOR** | Connect to versioned `cpt_codes` table with modifier awareness. |
| `src/services/aiOperations/FinancialEngine.js` | 75 | Client-side financial calculator with heuristic cost caps (`Math.min(avgSuppliesCost, grossCharge * 0.4)`). | **REPLACE** | Decommission in favor of deterministic, server-side financial calculations. Heuristic financial caps are prohibited in production truth. |
| `src/services/OptimizationEngine.js` | 380 | Heuristic algorithms for OR block scheduling recommendations and gap filling. | **REFACTOR** | Retain optimization logic; feed with authoritative database data rather than simulated state. |

### 3.5 Database Schema & Policies (`schema_setup.sql`)
| Table / Policy | Current Implementation | Classification | Action Plan & Rationale |
| :--- | :--- | :---: | :--- |
| `settings` | Single-row facility metadata with hardcoded defaults. | **REFACTOR** | Replace with `organizations` and `facilities` tables to support multi-tenancy. |
| `surgeons`, `patients`, `staff` | Master registries without facility foreign keys. Plaintext password on `surgeons`. | **REFACTOR** | Add `facility_id` foreign keys, unique constraint on NPI/MRN, and remove plaintext passwords (delegate to Supabase Auth). |
| `cpt_codes` | Master CPT table with single reimbursement rate column and no payer specificity. | **REFACTOR** | Split into base CPT catalog and `payer_fee_schedules` table with effective date versioning. |
| `surgeries` | Encounter table with loose JSONB expenses and client-calculated financials. | **REFACTOR** | Add `facility_id`, link to `operating_rooms`, normalize procedure lines into `surgery_procedures`, and write immutable snapshots. |
| `or_block_schedule` | Basic block table storing day of week, room name, and provider name as raw strings. | **REFACTOR** | Normalize relations to `operating_rooms` and `surgeons`, add facility foreign keys and conflict validation. |
| `ot_extra_cost` | Flat table mapping CPT codes to static cost overrides. | **REFACTOR** | Link to facility tenancy and transform into preference card cost accounting baselines. |
| `users` | Custom users table storing plaintext passwords (`admin123`). | **REPLACE** | Decommission table. Use standard `auth.users` combined with `facility_memberships`. |
| RLS Policies (`TO anon USING (true)`) | Wide-open anonymous access on all 10 tables. | **REPLACE** | **P0 Security Vulnerability:** Drop all anonymous policies. Implement strict RLS policies checking `auth.jwt() -> app_metadata -> facility_id`. |

### 3.6 Missing Capabilities (To Be Implemented)
1. **Multi-Tenancy Engine**: `organizations`, `facilities`, and `facility_memberships` tables.
2. **Normalized Procedure Coding**: `surgery_procedures` table supporting multi-CPT coding, sequence ranking, and modifier 50/51/59 handling.
3. **Payer Contract Matrix**: `payers` and `payer_fee_schedules` supporting Medicare, Commercial PPO, Worker's Comp, and Self-Pay.
4. **Immutable Audit Provenance**: `audit_logs` table with database triggers recording user, timestamp, previous state, and new state.
5. **Frozen Financial Snapshots**: `surgery_financial_snapshots` recording exact costs, reimbursement rates, and margin per minute at case completion.
6. **Server-Side Financial Engine**: PostgreSQL functions (`calculate_surgery_financials`, `book_surgery_encounter`).

---

## 4. Target State Architecture & Dependency Graph

```mermaid
graph TD
    subgraph Client Layer (React 19 + Vite)
        Router[Modular App Router]
        CC[Command Center]
        SS[Surgery Scheduler]
        SP[Surgeon Portal]
        CPT[CPT Management]
        Staff[Staff Management]
        AuthUI[Login & Profile]
    end

    subgraph Service & API Gateway
        SupabaseAuth[Supabase Auth / JWT Verification]
        PostgREST[PostgREST Tenant-Scoped Gateway]
        EdgeFuncs[Edge Functions: AI Analyst & Sync]
    end

    subgraph Server-Side Business Logic
        FinancialRPC[Stored Proc: calculate_surgery_financials]
        BookingRPC[Stored Proc: book_surgery_encounter]
        AuditTrigger[Audit Trigger Engine]
    end

    subgraph Multi-Tenant Database (PostgreSQL 15+)
        TenancyTables[(Organizations & Facilities)]
        ClinicalTables[(Surgeries, Procedures & Rooms)]
        FinancialTables[(Fee Schedules & Snapshots)]
        AuditLog[(Immutable Audit Logs)]
    end

    Router --> AuthUI
    Router --> CC
    Router --> SS
    Router --> SP
    Router --> CPT
    Router --> Staff

    Client Layer -->|JWT Bearer Token| SupabaseAuth
    SupabaseAuth --> PostgREST
    PostgREST --> Server-Side Business Logic
    Server-Side Business Logic --> Multi-Tenant Database
    EdgeFuncs --> Server-Side Business Logic
```

---

## 5. Migration Strategy & Execution Plan

### Phase A: Security & Authentication Hardening (Immediate P0)
1. Enable Supabase GoTrue Auth. Create initial administrator and surgeon users in `auth.users`.
2. Deploy `organizations`, `facilities`, and `facility_memberships`.
3. Drop wide-open `Allow anon all` RLS policies.
4. Implement authenticated RLS policies scoping every read/write to `facility_id`.
5. Refactor `LoginPage.jsx` and `UserProfile.jsx` to use `supabase.auth.*`.

### Phase B: Monolith Deconstruction & Mock Elimination
1. Deconstruct `src/App.jsx` (5,913 lines) into modular routes and layout containers.
2. Purge all static mock dictionaries (`MOCK_SURGEONS_DETAILS`, `MOCK_OR_UTIL_TREND`, `MOCK_CASE_LOGS`).
3. Wire `CommandCenter.jsx` to server-side view `facility_kpi_summary`.
4. Migrate direct LLM browser calls (`gemini.js`) to secure Edge Functions.

### Phase C: Financial Engine & Clinical Normalization
1. Create `surgery_procedures` and normalize multi-CPT records.
2. Deploy `payers` and `payer_fee_schedules` with Medicare MPPR 50% rules.
3. Deploy PostgreSQL stored procedure `calculate_surgery_financials`.
4. Deploy `audit_logs` table and triggers on financial mutations.
5. Create `surgery_financial_snapshots` to freeze financial truth upon case completion.

---

## 6. QA & Verification Test Cases

| ID | Test Scenario | Current Behavior | Target Expected Behavior | Test Type |
| :---: | :--- | :--- | :--- | :--- |
| **TC-01** | Anonymous user queries `surgeries` via REST API | Returns all surgeries across the database (Open RLS) | Returns HTTP 401 Unauthorized or empty array | Security / RLS |
| **TC-02** | User in Facility A queries data belonging to Facility B | All facility data accessible (single-tenant assumption) | Returns 0 rows; cross-tenant query strictly blocked | Multi-Tenancy |
| **TC-03** | Calculate case with 2 CPT codes under Medicare MPPR | Computed client-side with arbitrary formula or gross charge preference | Server procedure applies 100% to primary and 50% to secondary; exact penny match | Financial / Deterministic |
| **TC-04** | Update surgery duration after case is marked `Completed` | Directly mutates record in database without trail | System requires revision reason; logs diff to `audit_logs` | Audit / Provenance |
| **TC-05** | Production build execution (`npm run build`) | Builds with warnings on bundle size (>2.3MB) | Builds clean; code-split chunks under 500kB | Build / Regression |

---

## 7. Acceptance Criteria

- [x] Complete inventory of every file in `src/` and database entity in `schema_setup.sql`.
- [x] Clear classification into **KEEP**, **REFACTOR**, **REPLACE**, and **MISSING** with specific technical rationale.
- [x] Identification of P0 security vulnerabilities (plaintext auth, open RLS, exposed LLM keys).
- [x] Identification of financial discrepancies (client-side heuristics, hardcoded labor/cleaning rates).
- [x] Actionable migration roadmap with phased execution sequence.
- [x] Zero breaking changes to existing verified user workflows during phased transitions.

---

## 8. Implementation Notes

- **Branch**: `phases-work`
- **Audit File Created**: `docs/phases/02-CURRENT-CODEBASE-AUDIT.md`
- **Key Finding**: `src/App.jsx` contains 5,913 lines, including extensive mock data that masquerades as production truth. Refactoring `App.jsx` into a modular router shell is the highest-leverage frontend refactor.
- **Security Finding**: `src/lib/supabase.js` and `schema_setup.sql` contain open anonymous RLS policies and plaintext password checks. Migrating to Supabase Auth and JWT-scoped RLS is a mandatory prerequisite for production readiness.
