# C8 AI BENCHMARK AND EVALUATION

## Purpose
Standardized golden benchmark questions, expected tool bindings, deterministic numerical verification, evidence citation scoring, and automated regression evaluation for clinical and financial AI models.

## Scope
- Define production requirements for an authoritative evaluation framework covering the ASCANALYST AI intelligence tier.
- Establish a comprehensive catalog of golden benchmark queries across surgical case financials, surgeon scorecards, implant preference card variances, payer underpayments, CPT procedural economics, and predictive what-if simulators.
- Evaluate AI model responses against deterministic ground truth: exact tool selection, parameter schema validation, zero-drift numerical assertions, verifiable evidence citations, and hallucination defense.
- Provide automated regression detection to prevent quality decay across prompt updates, tool releases, or LLM version switches.
- Enforce facility tenancy and multi-tenant Row-Level Security (RLS) on all evaluation records.

## Current State
Prior to Phase C8:
- `public.chatbot_questions`: Legacy table storing 30 simple FAQ questions for `InstructionPanel.jsx`. It contains no structured expected tool contracts, expected parameters, numerical bounds, or citation targets.
  - **Classification:** **KEEP** for FAQ display, but **MISSING** an enterprise evaluation framework.
- Golden Benchmark Dataset:
  - **Classification:** **MISSING**. No formal dataset binds realistic operational questions to expected deterministic C3 schemas, exact financial metrics, or citations.
- Multi-Dimensional Scoring Engine:
  - **Classification:** **MISSING**. No server-side scoring exists to evaluate tool accuracy, parameter validity, numerical drift, or citation presence.
- Benchmark Run Tracking & Regression History:
  - **Classification:** **MISSING**. No persistence tracks evaluation test runs, pass/fail trends, or regression alerts.

## Target State
Phase C8 establishes a multi-dimensional benchmarking and evaluation framework:
1. **Golden Benchmark Suite Catalog (`ai_benchmark_questions`):**
   - Standardized suite of golden questions categorized by operational domain (`CASE`, `SURGEON`, `IMPLANT`, `PAYER`, `CPT`, `OR`, `SCENARIO`, `HALLUCINATION_TRAP`).
   - Each benchmark question defines:
     - `expected_tool_id`: The exact server-authoritative tool from Phase C3 schemas (`case_financial_ledger_query`, `surgeon_scorecard_query`, etc.).
     - `expected_parameters`: Schema-compliant input parameters.
     - `expected_numerical_assertions`: Array of ground-truth numbers with allowed tolerance percentage (0.0% for financial metrics).
     - `expected_citations`: Required evidence source types and minimum citation count.
     - `prohibited_patterns`: Prohibited phrases or clinical directives (e.g. diagnosing patient conditions or modifying drug dosages).
2. **Deterministic Multi-Pillar Scoring Model:**
   - **Tool Contract Accuracy (25%):** Exact match against the required C3 tool schema.
   - **Parameter Schema Compliance (20%):** Validates all required arguments without schema violations.
   - **Deterministic Number Precision (30%):** Validates extracted numbers against authoritative calculations (0.0% drift allowed).
   - **Evidence & Citation Completeness (15%):** Verifies presence of bracketed citations (`[E-101]`) linking to verifiable source records.
   - **Hallucination & Safety Guardrail Clearance (10%):** Validates structured unknown handling, absence of fabricated clinical advice, and rejection of ambient voice mutations.
3. **Automated Batch Evaluation & Regression Alerts:**
   - On-demand batch evaluation of the golden benchmark suite.
   - Calculates overall composite score, tracks execution latency, and flags regressions when composite score drops below 95.0%.
   - Generates a cryptographic SHA-256 provenance signature for every evaluation run.

## Data Model / Schema
PostgreSQL Migration `106_ai_benchmark_and_evaluation.sql`:
1. `public.ai_benchmark_suites`:
   - `id VARCHAR(64) PRIMARY KEY`
   - `facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE`
   - `suite_code VARCHAR(32) NOT NULL UNIQUE`
   - `name VARCHAR(128) NOT NULL`
   - `description TEXT NOT NULL`
   - `target_model VARCHAR(64) NOT NULL DEFAULT 'gemini-2.5-flash'`
   - `is_active BOOLEAN NOT NULL DEFAULT TRUE`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
2. `public.ai_benchmark_questions`:
   - `id VARCHAR(64) PRIMARY KEY`
   - `suite_id VARCHAR(64) NOT NULL REFERENCES public.ai_benchmark_suites(id) ON DELETE CASCADE`
   - `benchmark_code VARCHAR(32) NOT NULL UNIQUE`
   - `domain VARCHAR(32) NOT NULL CHECK (domain IN ('CASE', 'SURGEON', 'IMPLANT', 'PAYER', 'CPT', 'OR', 'SCENARIO', 'HALLUCINATION_TRAP'))`
   - `question_text TEXT NOT NULL`
   - `clinical_intent VARCHAR(128) NOT NULL`
   - `expected_tool_id VARCHAR(64) NOT NULL`
   - `expected_parameters JSONB NOT NULL DEFAULT '{}'::jsonb`
   - `expected_numerical_assertions JSONB NOT NULL DEFAULT '[]'::jsonb`
   - `expected_citations JSONB NOT NULL DEFAULT '[]'::jsonb`
   - `tolerance_pct NUMERIC(4, 2) NOT NULL DEFAULT 0.00`
   - `is_hallucination_trap BOOLEAN NOT NULL DEFAULT FALSE`
   - `weight NUMERIC(4, 2) NOT NULL DEFAULT 1.00`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
3. `public.ai_benchmark_runs`:
   - `id VARCHAR(64) PRIMARY KEY`
   - `suite_id VARCHAR(64) NOT NULL REFERENCES public.ai_benchmark_suites(id) ON DELETE CASCADE`
   - `facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE`
   - `run_code VARCHAR(32) NOT NULL`
   - `run_by VARCHAR(64) NOT NULL`
   - `total_benchmarks INTEGER NOT NULL`
   - `passed_benchmarks INTEGER NOT NULL`
   - `failed_benchmarks INTEGER NOT NULL`
   - `composite_score_pct NUMERIC(5, 2) NOT NULL`
   - `tool_accuracy_pct NUMERIC(5, 2) NOT NULL`
   - `number_accuracy_pct NUMERIC(5, 2) NOT NULL`
   - `citation_completeness_pct NUMERIC(5, 2) NOT NULL`
   - `safety_guardrail_pct NUMERIC(5, 2) NOT NULL`
   - `avg_latency_ms NUMERIC(8, 2) NOT NULL`
   - `run_status VARCHAR(32) NOT NULL CHECK (run_status IN ('RUNNING', 'COMPLETED', 'FAILED'))`
   - `verification_hash VARCHAR(64) NOT NULL`
   - `executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
4. `public.ai_benchmark_results`:
   - `id VARCHAR(64) PRIMARY KEY`
   - `run_id VARCHAR(64) NOT NULL REFERENCES public.ai_benchmark_runs(id) ON DELETE CASCADE`
   - `question_id VARCHAR(64) NOT NULL REFERENCES public.ai_benchmark_questions(id) ON DELETE CASCADE`
   - `passed BOOLEAN NOT NULL`
   - `actual_tool_id VARCHAR(64)`
   - `tool_matched BOOLEAN NOT NULL`
   - `params_matched BOOLEAN NOT NULL`
   - `numbers_matched BOOLEAN NOT NULL`
   - `citations_matched BOOLEAN NOT NULL`
   - `safety_passed BOOLEAN NOT NULL`
   - `actual_response_summary TEXT`
   - `failure_reasons JSONB NOT NULL DEFAULT '[]'::jsonb`
   - `latency_ms NUMERIC(8, 2) NOT NULL DEFAULT 0.0`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
5. `public.vw_ai_benchmark_suite_telemetry`:
   - Aggregates suite scores, latest pass rates, drift metrics, and evaluation counts.

## Business Rules
1. **Zero-Arithmetic Fabrication Rule:** Financial metrics in AI outputs must match ground-truth assertions with 0.0% variance.
2. **Multi-Pillar Weight Formula:**
   $$\text{Composite Score} = (0.25 \times \text{Tool}) + (0.20 \times \text{Params}) + (0.30 \times \text{Numbers}) + (0.15 \times \text{Citations}) + (0.10 \times \text{Safety})$$
3. **Golden Benchmark Minimum Standard:** Production releases require a composite benchmark score $\ge 98.0\%$ with zero critical safety violations.
4. **Deterministic Evaluation:** Ground truth is calculated exclusively by server-side deterministic functions in `aiToolDefinitionsService.js` and `aiEvidenceService.js`.
5. **Regression Intercept:** Any test run dropping more than 2.0% below the historical baseline triggers a regression warning banner.

## Permissions / Security
- `ai.benchmark_view`: View benchmark questions, suites, and past run results.
- `ai.benchmark_execute`: Execute evaluation runs against the AI models.
- `ai.benchmark_edit`: Create or modify benchmark questions and expected assertions.
- Multi-tenancy RLS ensures facilities evaluate against their own benchmark results.

## API / Service Requirements
- `getBenchmarkSuites(facilityId)`: Retrieves active benchmark suites.
- `getBenchmarkQuestions(suiteId, domainFilter)`: Retrieves questions with expected tools and numerical targets.
- `executeBenchmarkRun(suiteId, facilityId, executorContext)`: Executes the evaluation engine across all golden questions.
- `gradeBenchmarkQuestion(question, modelResponse)`: Grades an individual response across the 5 evaluation pillars.
- `getBenchmarkTelemetry(facilityId)`: Calculates composite score, pass rate, drift rate, and total evaluations.

## UI / Workflow Requirements
- **Top 5-Card KPI Ribbon:** Composite Benchmark Score (98.6%), Tool Contract Accuracy (100%), Number Precision (99.2%), Citation Completeness (97.5%), Avg Eval Latency (14.2ms).
- **Tab 1: Golden Benchmark Catalog:** Searchable grid of golden evaluation queries with expected tool badges, numerical bounds, and domain filters.
- **Tab 2: Evaluation Run Console & Live Batch Runner:** Live evaluation executor with progress bar, real-time result cards, and pillar score breakdowns.
- **Tab 3: Historical Evaluation Runs & Regression Trends:** History table with composite scores, pass counts, latency, and SHA-256 verification hashes.
- **Tab 4: Interactive Single-Prompt Evaluation Lab:** Input custom clinician queries, test against ground truth, and inspect detailed 5-pillar scorecard.

## Audit / Provenance
- Every evaluation run stores the exact executor ID, timestamp, model version, per-question score breakdown, and an immutable SHA-256 run hash.

## QA / Test Cases
1. Telemetry returns accurate facility evaluation KPIs.
2. Benchmark catalog retrieves questions filtered by domain.
3. Scoring engine accurately awards points for matching tool, params, numbers, citations, and safety.
4. Scoring engine detects number mismatches and deducts points.
5. Scoring engine detects missing evidence citations.
6. Scoring engine cleanly grades hallucination traps.
7. Batch run executor evaluates all questions and produces a signed run record.
8. Migration 106 UP creates all tables, foreign keys, views, and RLS policies with UUID facility IDs.
9. Migration 106 DOWN cleanly drops all evaluation objects.
10. Zero-purple compliance verified across all C8 files.
11. App.jsx wiring verified.

## Acceptance Criteria
- Build passes cleanly with zero errors.
- 13+ automated tests pass in `tests/ai-benchmark-evaluation.test.js`.
- Full regression suite passes (100%).
- Composite score $\ge 98.0\%$.

## Dependencies
- Phase C1 (Tool Gateway)
- Phase C2 (Permissions & Boundaries)
- Phase C3 (Tool Definitions & Schemas)
- Phase C4 (Evidence & Citations)
- Phase C5 (Hallucination Rules)
- Phase C6 (Human Approval)
- Phase C7 (Voice Architecture)

## Definition of Done
Complete when data model, migration 106, service layer, UI evaluation console, comprehensive test suite, App.jsx wiring, and documentation are all implemented and verified.

## Implementation Notes
- Migration: `supabase/migrations/106_ai_benchmark_and_evaluation.sql` & `106_ai_benchmark_and_evaluation_down.sql`
- Service: `src/services/aiBenchmarkService.js` & `src/lib/aiBenchmarkService.js`
- UI: `src/components/AIBenchmarkEvaluationView.jsx` & `src/components/AIBenchmarkEvaluationView.css`
- Tests: `tests/ai-benchmark-evaluation.test.js`
